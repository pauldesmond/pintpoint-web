#!/usr/bin/env node
/**
 * sync-feed-covers.mjs — put each post's cover into its feed item.
 *
 * WHY. The PINtPRESS screen in the app reads blog/feed.xml and nothing else,
 * and the feed carried no image, so the app could only ever draw a list of
 * text. The obvious shortcut, building a tile URL from the slug in the app,
 * was tested and does NOT hold: four of the first twenty posts in the feed
 * have no tile matching their slug because their covers were re-cut as -v2
 * (september-is-oktoberfest, cask-ale-week-2026, ghosts-of-baddow-brewery,
 * beer-tastes-better-on-holiday). Guessing would show a gap on exactly the
 * covers we cared enough about to redo.
 *
 * So the cover is resolved HERE, from the post's own og:image, the same
 * authority generate-blog-pages.mjs uses for the web shelf, and written into
 * the item as an <enclosure>. One source of truth; the app does no guessing.
 *
 * Square is preferred over the wide -x sharing cut for the same reason the
 * shelf prefers it: an app thumbnail is square, and a 1200x628 cover arrives
 * cropped through the middle.
 *
 * Usage: node scripts/sync-feed-covers.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const FEED = join(BLOG, 'feed.xml');
const CHECK = process.argv.includes('--check');

/** Width the app draws a row thumbnail at; 480 covers a 2x phone. */
const TILE_WIDTH = 480;

function imageSize(file) {
  const b = readFileSync(file);
  if (b.length > 24 && b.toString('ascii', 12, 16) === 'IHDR') {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Mirrors coverFor() in generate-blog-pages.mjs. Change one, change both. */
function coverFor(slug) {
  const file = join(BLOG, `${slug}.html`);
  if (!existsSync(file)) return null;
  const og = readFileSync(file, 'utf8').match(/og:image" content="([^"]+)/);
  if (!og) return null;
  const img = og[1].split('/blog/').pop().split('?')[0];
  if (!img.startsWith('images/') || !existsSync(join(BLOG, img))) return null;
  const size = imageSize(join(BLOG, img));
  if (size && Math.abs(size.w - size.h) <= 2) return img;
  const square = img.replace(/-x(\.[a-z]+)$/i, '$1');
  if (square !== img && existsSync(join(BLOG, square))) {
    const s2 = imageSize(join(BLOG, square));
    if (s2 && Math.abs(s2.w - s2.h) <= 2) return square;
  }
  return img;
}

/** The cut the app should fetch, falling back to the full cover. */
function tileFor(img) {
  const stem = img.replace(/^images\//, '').replace(/\.[a-z]+$/i, '');
  const small = `images/tiles/${stem}-${TILE_WIDTH}.jpg`;
  return existsSync(join(BLOG, small)) ? small : img;
}

let feed = readFileSync(FEED, 'utf8');
const items = feed.match(/ {4}<item>[\s\S]*?<\/item>\n/g) ?? [];
let changed = 0, missing = [];

for (const block of items) {
  const link = block.match(/<link>https:\/\/pintpoint\.co\.uk\/blog\/([a-z0-9-]+)\.html<\/link>/);
  if (!link) continue;
  const slug = link[1];
  const cover = coverFor(slug);
  if (!cover) { missing.push(slug); continue; }
  const rel = tileFor(cover);
  const abs = join(BLOG, rel);
  const url = `https://pintpoint.co.uk/blog/${rel}`;
  const bytes = statSync(abs).size;
  const tag = `      <enclosure url="${url}" length="${bytes}" type="image/jpeg" />\n`;

  let next = block.replace(/ {6}<enclosure [^>]*\/>\n/, '');
  if (next.includes(tag)) continue;
  // Straight after <link>, which is where readers look for it.
  next = next.replace(/( {6}<guid)/, tag + '$1');
  if (next !== block) { feed = feed.replace(block, next); changed++; }
}

// Not a fault. These posts have no bespoke cover: their og:image points at
// /screenshots/, usually the same radar shot reused across several of them.
// The web shelf excludes them for exactly this reason, so the app leaves
// their rows without a thumbnail rather than repeating one screenshot down
// the list. Give one a real cover and it joins automatically.
if (missing.length) {
  console.log(`  ℹ️  ${missing.length} post(s) have no blog cover (og:image is a screenshot): ${missing.join(', ')}`);
}
if (CHECK) {
  if (changed) { console.error(`❌ ${changed} feed item(s) have a stale or missing <enclosure>. Run: node scripts/sync-feed-covers.mjs`); process.exit(1); }
  console.log('✅ every feed item carries its cover');
} else {
  writeFileSync(FEED, feed);
  console.log(`✅ feed.xml → ${changed} enclosure(s) written, ${items.length} item(s) checked`);
}
