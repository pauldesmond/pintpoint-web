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

  // Build new blog URL block from feed
  const blogIndexLastmod = items[0]?.isoDate ?? new Date().toISOString().slice(0, 10);
  const blogBlocks = [
    `  <url>\n    <loc>https://pintpoint.co.uk/blog/</loc>\n    <lastmod>${blogIndexLastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    ...items.map((it, i) => {
      const priority = i === 0 ? '0.9' : i < 3 ? '0.85' : '0.8';
      return `  <url>\n    <loc>${it.link}</loc>\n    <lastmod>${it.isoDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    }),
  ].join('\n');

  // Replace everything from /blog/ entry through the last /blog/ URL
  const replaced = sitemap.replace(
    /  <url>\n    <loc>https:\/\/pintpoint\.co\.uk\/blog\/<\/loc>[\s\S]*?(?=\n  <url>\n    <loc>https:\/\/pintpoint\.co\.uk\/(?!blog)|\n<\/urlset>)/,
    blogBlocks,
  );

  if (replaced === sitemap) {
    console.warn('  ⚠️  sitemap.xml blog block not matched — nothing replaced');
    return false;
  }
  writeFileSync(SITEMAP_PATH, replaced);
  console.log(`  ✅ sitemap.xml → ${items.length} blog URLs (+ index)`);
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
