#!/usr/bin/env node
/**
 * generate-blog-pages.mjs
 *
 * Paginates the PINtPRESS archive: 10 posts a page, newest first.
 *   blog/index.html   page 1
 *   blog/page-2.html  page 2 … page-N.html
 *
 * WHY THIS EXISTS. blog/index.html and blog/older.html were hand-maintained
 * (see feedback_blog_archive_dual_maintenance) and had drifted: 29 cards on
 * one, 13 on the other, with humphrey-smith-obituary and norman-balon-obituary
 * listed on BOTH. Two lists kept by hand will always diverge; one generated
 * list cannot.
 *
 * SOURCE OF TRUTH is the existing cards, not feed.xml. feed.xml omits
 * quiet-published posts (feedback_feed_is_not_the_full_url_list), and the
 * cards carry hand-written excerpts worth keeping. First run reads whatever
 * index.html + older.html hold; after that, page 1..N are the corpus.
 *
 * Usage: node scripts/generate-blog-pages.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'blog');
const PER_PAGE = 10;
const DRY = process.argv.includes('--dry-run');

const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];

function collectCards() {
  const seen = new Map();          // href -> card, first (newest source) wins
  const sources = ['index.html', 'older.html',
    ...readdirSync(BLOG).filter(f => /^page-\d+\.html$/.test(f))];
  for (const file of sources) {
    const path = join(BLOG, file);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, 'utf8');
    const re = /<li>\s*(<a href="([a-z0-9-]+\.html)" class="post">[\s\S]*?<\/a>)\s*<\/li>/g;
    let m;
    while ((m = re.exec(html))) {
      const [block, , href] = m;
      if (seen.has(href)) continue;
      const dateRaw = (block.match(/<div class="post-date[^"]*">([\s\S]*?)<\/div>/) || [,''])[1]
        .replace(/<[^>]+>/g, '').split('·')[0].replace(/&middot;/g, '').trim();
      const dm = dateRaw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (!dm) { console.warn(`  ⚠️  ${href}: unparseable date "${dateRaw}" — skipped`); continue; }
      const iso = `${dm[3]}-${String(MONTHS.indexOf(dm[2]) + 1).padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
      seen.set(href, { href, iso, html: m[0] });
    }
  }
  return [...seen.values()].sort((a, b) => b.iso.localeCompare(a.iso));
}

/**
 * The shelf: covers only, newest first, halving in size as it goes back.
 *
 * Only on page 1, and only for posts whose artwork carries its own masthead
 * and headline, because the point of a cover is that it says what it is. Two
 * posts are held back for that reason and named below; give them a proper
 * card and they join automatically.
 *
 * The cards stay in the list underneath exactly as they were. Nothing is
 * removed from the corpus this script reads back on its next run.
 */
const NO_TITLE_ON_ART = new Set([
  'beer-tastes-better-on-holiday.html',  // a bottle on a deckchair, no masthead
  'ghosts-of-baddow-brewery.html',       // a street scene, no masthead
]);
const SHELF_MAX = 21;

function coverFor(href) {
  const file = join(BLOG, href);
  if (!existsSync(file)) return null;
  const og = readFileSync(file, 'utf8').match(/og:image" content="([^"]+)/);
  if (!og) return null;
  const img = og[1].split('/blog/').pop().split('?')[0];
  if (!img.startsWith('images/') || !existsSync(join(BLOG, img))) return null;
  return img;
}

function shelf(cards) {
  const picks = [];
  for (const c of cards) {
    if (picks.length >= SHELF_MAX) break;
    if (NO_TITLE_ON_ART.has(c.href)) continue;
    const img = coverFor(c.href);
    if (!img || picks.some(p => p.img === img)) continue;
    const title = (c.html.match(/<div class="post-title">([\s\S]*?)<\/div>/) || [, ''])[1]
      .replace(/<[^>]+>/g, '').trim();
    picks.push({ href: c.href, img, title });
  }
  if (!picks.length) return '';
  const tier = i => (i === 0 ? 't1' : i < 5 ? 't2' : 't3');
  const tiles = picks.map((p, i) =>
    `        <a class="shelf-tile ${tier(i)}" href="${p.href}" title="${p.title}" aria-label="${p.title}">` +
    `<img src="${p.img}" alt="${p.title}" loading="${i < 5 ? 'eager' : 'lazy'}" width="800" height="800" /></a>`
  ).join('\n');
  return `    <div class="shelf">\n${tiles}\n    </div>\n\n`;
}

const SHELF_CSS = `
    /* Covers shrink as the shelf goes back: one at four columns, four at two,
       the rest at one. Eight columns keeps those spans whole. height:auto
       matters — the img tags carry width/height, and without it the attribute
       height wins and aspect-ratio is ignored. */
    .shelf { display: grid; gap: 10px; grid-template-columns: repeat(8, 1fr); margin: 0 0 40px; }
    .shelf-tile { display: block; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; line-height: 0; }
    .shelf-tile:hover, .shelf-tile:focus-visible { border-color: var(--teal); outline: none; }
    .shelf-tile img { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; }
    .t1 { grid-column: span 4; grid-row: span 2; }
    .t2 { grid-column: span 2; }
    .t3 { grid-column: span 1; }
    @media (max-width: 620px) {
      .shelf { grid-template-columns: repeat(4, 1fr); }
      .t1 { grid-column: span 4; grid-row: auto; }
    }
`;

/** Numbered pager. Current page is a <span>, never a link to itself. */
function pager(current, total) {
  const url = n => (n === 1 ? './' : `page-${n}.html`);
  const links = [];
  if (current > 1) links.push(`<a href="${url(current - 1)}" rel="prev">&larr; Newer</a>`);
  for (let n = 1; n <= total; n++) {
    links.push(n === current
      ? `<span class="is-here" aria-current="page">${n}</span>`
      : `<a href="${url(n)}">${n}</a>`);
  }
  if (current < total) links.push(`<a href="${url(current + 1)}" rel="next">Older &rarr;</a>`);
  return `    <nav class="pager" aria-label="Archive pages">\n      ${links.join('\n      ')}\n    </nav>`;
}

const PAGER_CSS = `
    .pager { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; justify-content: center; margin: 34px 0 10px; }
    .pager a, .pager span { min-width: 32px; padding: 6px 9px; border-radius: 7px; text-align: center;
      font-size: 0.85rem; font-weight: 700; text-decoration: none; border: 1px solid var(--border); }
    .pager a { color: var(--teal); }
    .pager a:hover { border-color: var(--teal); background: rgba(0,212,170,0.08); }
    .pager .is-here { background: var(--teal); border-color: var(--teal); color: #06231d; }
    /* Newer/Older sit slightly apart from the numbers so the digits read as
       one tight group rather than six evenly-spaced buttons. */
    .pager a[rel="prev"] { margin-right: 10px; }
    .pager a[rel="next"] { margin-left: 10px; }
`;

function buildPage(template, cards, current, total, allCards) {
  let html = template;
  const list = cards.map(c => '      ' + c.html.trim()).join('\n');
  html = html.replace(/(<ul class="post-list">)[\s\S]*?(<\/ul>)/, `$1\n${list}\n    $2`);
  // Page 1 opens on the shelf. Strip any previous one first so reruns do not stack.
  html = html.replace(/\n?\s*<div class="shelf">[\s\S]*?<\/div>\n\n/, '\n');
  if (current === 1) html = html.replace(/(\n\s*<ul class="post-list">)/, `\n${shelf(allCards)}$1`);
  if (!html.includes('.shelf {')) html = html.replace(/(\n  <\/style>)/, `${SHELF_CSS}$1`);
  // replace the old "→ Older posts" link, or any existing pager, with this one
  html = html.replace(/\n\s*<p style="margin-top:24px[^"]*"><a href="older\.html"[\s\S]*?<\/p>/, '');
  html = html.replace(/\n\s*<nav class="pager"[\s\S]*?<\/nav>/, '');
  html = html.replace(/(<\/ul>)/, `$1\n\n${pager(current, total)}`);
  if (!html.includes('.pager {')) html = html.replace(/(\n  <\/style>)/, `${PAGER_CSS}$1`);

  const canonical = current === 1
    ? 'https://pintpoint.co.uk/blog/'
    : `https://pintpoint.co.uk/blog/page-${current}.html`;
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`);
  const suffix = current === 1 ? '' : ` — page ${current}`;
  html = html.replace(/<title>([^<]*?)(?: — page \d+)?<\/title>/, `<title>$1${suffix}</title>`);
  return html;
}

const cards = collectCards();
const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE));
console.log(`${cards.length} unique posts → ${pages} pages of ${PER_PAGE}`);

const template = readFileSync(join(BLOG, 'index.html'), 'utf8');
for (let n = 1; n <= pages; n++) {
  const slice = cards.slice((n - 1) * PER_PAGE, n * PER_PAGE);
  const out = buildPage(template, slice, n, pages, cards);
  const file = n === 1 ? 'index.html' : `page-${n}.html`;
  console.log(`  ${file.padEnd(14)} ${slice.length} posts  ${slice[0].iso} → ${slice[slice.length-1].iso}`);
  if (!DRY) writeFileSync(join(BLOG, file), out);
}
if (DRY) console.log('\nDry run — nothing written.');
