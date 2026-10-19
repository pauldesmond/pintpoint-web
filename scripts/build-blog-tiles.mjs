#!/usr/bin/env node
/**
 * build-blog-tiles.mjs
 *
 * Cuts small copies of the blog cover art for the shelf on /blog/.
 *
 * The covers are 1254px square share cards, 200KB to 1.6MB each. Twenty one
 * of them on one page came to 9.4MB, which is slow to draw and would spend a
 * day's egress in roughly seventeen visits. The shelf shows them at about
 * 460, 230 and 110 CSS pixels, so it never needed the originals.
 *
 * Three sizes are cut for every cover, not just the one its tier wants today,
 * because a tier changes the moment a new piece is published.
 *
 * Needs sips, which ships with macOS. Safe to rerun: it skips anything
 * already cut and newer than its source.
 *
 *   node scripts/build-blog-tiles.mjs [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const SRC = join(BLOG, 'images');
const OUT = join(SRC, 'tiles');
const SIZES = [960, 480, 240];
const FORCE = process.argv.includes('--force');
let HAVE_WEBP = true;
try { execFileSync('cwebp', ['-version'], { stdio: 'ignore' }); }
catch { HAVE_WEBP = false; console.warn('cwebp not found: jpeg only, pages still work'); }

/** Every image any post points at as its og:image. */
function covers() {
  const set = new Set();
  for (const f of readdirSync(BLOG).filter(f => f.endsWith('.html'))) {
    const og = readFileSync(join(BLOG, f), 'utf8').match(/og:image" content="([^"]+)/);
    if (!og) continue;
    const img = og[1].split('/blog/').pop().split('?')[0];
    if (!img.startsWith('images/') || !existsSync(join(BLOG, img))) continue;
    set.add(basename(img));
    // The shelf prefers a square cover, so cut the square sibling of a wide
    // share card too, even though no post points at it directly.
    const square = img.replace(/-x(\.[a-z]+)$/i, '$1');
    if (square !== img && existsSync(join(BLOG, square))) set.add(basename(square));
  }
  return [...set].sort();
}

mkdirSync(OUT, { recursive: true });
let cut = 0, skipped = 0, bytes = 0;
for (const name of covers()) {
  const src = join(SRC, name);
  const stem = basename(name, extname(name));
  for (const size of SIZES) {
    const out = join(OUT, `${stem}-${size}.jpg`);
    if (!FORCE && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) { skipped++; continue; }
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70',
      '-Z', String(size), src, '--out', out], { stdio: 'ignore' });
    bytes += statSync(out).size;
    cut++;
    // A webp beside it, about a third smaller for the same picture. The page
    // offers both and the browser takes whichever it can read.
    if (HAVE_WEBP) {
      const webp = out.replace(/\.jpg$/, '.webp');
      execFileSync('cwebp', ['-quiet', '-q', '76', '-resize', String(size), '0', src, '-o', webp]);
      bytes += statSync(webp).size;
      cut++;
    }
  }
}
console.log(`${cut} cut, ${skipped} already current, ${(bytes / 1024 / 1024).toFixed(1)} MB written to blog/images/tiles/`);
