#!/usr/bin/env node
/**
 * sync-from-feed.mjs
 *
 * Single source of truth for blog metadata: blog/feed.xml.
 * After publishing a new post (and adding its <item> to feed.xml), run:
 *
 *   node scripts/sync-from-feed.mjs
 *
 * Updates:
 *   1. index.html → JSON-LD ItemList ("From the blog") to the top 3 posts
 *   2. sitemap.xml → all /blog/ URLs with lastmod = pubDate
 *
 * Idempotent. Safe to run any time. Uses regex string replacement, not
 * an XML/HTML parser, to keep diffs minimal and human-readable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FEED_PATH = join(ROOT, 'blog', 'feed.xml');
const INDEX_PATH = join(ROOT, 'index.html');
const SITEMAP_PATH = join(ROOT, 'sitemap.xml');

function parseFeed(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
      return r ? r[1].trim() : '';
    };
    const title = get('title')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const link = get('link');
    const pubDateRaw = get('pubDate');
    const isoDate = pubDateRaw ? new Date(pubDateRaw).toISOString().slice(0, 10) : '';
    items.push({ title, link, isoDate });
  }
  return items;
}

function syncIndexItemList(items) {
  const topThree = items.slice(0, 3);
  const newList = topThree
    .map((it, i) => `      { "@type": "ListItem", "position": ${i + 1}, "url": "${it.link}", "name": ${JSON.stringify(it.title)} }`)
    .join(',\n');

  const html = readFileSync(INDEX_PATH, 'utf8');
  const replaced = html.replace(
    /(<!-- Structured Data: ItemList — the "From the blog" grid -->[\s\S]*?"itemListElement": \[\n)([\s\S]*?)(\n    \]\n  \}\n  <\/script>)/,
    (_, before, _old, after) => `${before}${newList}${after}`,
  );

  if (replaced === html) {
    console.warn('  ⚠️  index.html ItemList block not matched — nothing replaced');
    return false;
  }
  writeFileSync(INDEX_PATH, replaced);
  console.log(`  ✅ index.html ItemList → ${topThree.length} entries`);
  return true;
}

function syncSitemap(items) {
  const sitemap = readFileSync(SITEMAP_PATH, 'utf8');

  // Build the blog block from the feed.
  const blogIndexLastmod = items[0]?.isoDate ?? new Date().toISOString().slice(0, 10);
  const blogBlocks = [
    `  <url>\n    <loc>https://pintpoint.co.uk/blog/</loc>\n    <lastmod>${blogIndexLastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    ...items.map((it, i) => {
      const priority = i === 0 ? '0.9' : i < 3 ? '0.85' : '0.8';
      return `  <url>\n    <loc>${it.link}</loc>\n    <lastmod>${it.isoDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    }),
  ].join('\n');

  // Rebuild from PARSED ENTRIES rather than replacing a text range.
  //
  // The previous version matched from the /blog/ entry lazily up to the first
  // non-blog URL, which assumed every blog URL sat in one contiguous run. The
  // nightly Supabase regeneration does not write them that way: the /blog/
  // index lands at position 13 and the posts at 26-73, twelve other URLs in
  // between. So the replace swapped ONE entry for the whole block and left all
  // 48 originals in place — 1,163 URLs became 1,204 with 40 duplicates. It did
  // this silently; the "nothing replaced" warning only fires when the match
  // fails entirely, and this match succeeded.
  //
  // Splitting the file into <url> entries and filtering by loc is immune to
  // ordering, and idempotent: running it twice changes nothing.
  const entries = sitemap.match(/  <url>[\s\S]*?<\/url>/g) ?? [];
  if (entries.length === 0) {
    console.warn('  ⚠️  sitemap.xml has no <url> entries — nothing written');
    return false;
  }
  const locOf = (e) => (e.match(/<loc>([^<]+)<\/loc>/) ?? [])[1] ?? '';
  const isBlog = (e) => /^https:\/\/pintpoint\.co\.uk\/blog\//.test(locOf(e));

  // The feed is NOT the full list of blog URLs, and treating it as one costs
  // real pages. Quiet-published posts are deliberately kept out of feed.xml
  // while staying indexable — that is the whole taxonomy — so rebuilding the
  // block from the feed alone silently dropped eight live URLs on the first
  // test of this rewrite, including oktoberfest-first-giant-tent.html,
  // quiet-published the day before. De-indexing a page is worse than the
  // duplicate bug this function was being fixed for.
  //
  // So: refresh from the feed where the feed knows the post, and preserve any
  // existing blog URL it does not.
  const feedLocs = new Set(items.map((it) => it.link));
  const orphans = entries.filter((e) => isBlog(e) && locOf(e) !== 'https://pintpoint.co.uk/blog/' && !feedLocs.has(locOf(e)));
  if (orphans.length > 0) {
    console.log(`  ℹ️  preserving ${orphans.length} blog URL(s) not in the feed (quiet-published or excluded)`);
  }

  const firstBlogAt = entries.findIndex(isBlog);
  const kept = entries.filter((e) => !isBlog(e));
  const insertAt = firstBlogAt === -1 ? kept.length : Math.min(firstBlogAt, kept.length);
  const blogSection = [blogBlocks, ...orphans].join('\n');
  const rebuilt = [...kept.slice(0, insertAt), blogSection, ...kept.slice(insertAt)].join('\n');

  const head = sitemap.slice(0, sitemap.indexOf(entries[0]));
  const tail = sitemap.slice(sitemap.lastIndexOf('</url>') + '</url>'.length);
  const out = `${head}${rebuilt}${tail}`;

  // A sitemap with duplicate <loc>s is the failure this function shipped for
  // months. Refuse to write one rather than push it and find out later.
  const locs = [...out.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const dupes = locs.filter((l, i) => locs.indexOf(l) !== i);
  if (dupes.length > 0) {
    console.error(`  ❌ refusing to write: ${dupes.length} duplicate URL(s), e.g. ${dupes[0]}`);
    return false;
  }

  writeFileSync(SITEMAP_PATH, out);
  console.log(`  ✅ sitemap.xml → ${locs.length} URLs (${items.length} blog posts + index), 0 duplicates`);
  return true;
}

function main() {
  console.log('Syncing from blog/feed.xml...\n');
  const xml = readFileSync(FEED_PATH, 'utf8');
  const items = parseFeed(xml);
  if (items.length === 0) {
    console.error('No <item> entries in feed.xml — aborting.');
    process.exit(1);
  }
  console.log(`  Parsed ${items.length} feed item(s). Top 3:`);
  items.slice(0, 3).forEach((it, i) => console.log(`    ${i + 1}. ${it.isoDate} — ${it.title.slice(0, 60)}`));
  console.log();

  syncIndexItemList(items);
  syncSitemap(items);

  console.log('\nDone. Diff with `git diff` and commit if it looks right.');
}

main();
