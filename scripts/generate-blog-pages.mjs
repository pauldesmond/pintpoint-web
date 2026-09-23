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
    .pager { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 30px 0 8px; }
    .pager a, .pager span { min-width: 34px; padding: 7px 11px; border-radius: 8px; text-align: center;
      font-size: 0.9rem; font-weight: 700; text-decoration: none; border: 1px solid var(--border); }
    .pager a { color: var(--teal); }
    .pager a:hover { border-color: var(--teal); }
    .pager .is-here { background: var(--teal); border-color: var(--teal); color: #06231d; }
`;

function buildPage(template, cards, current, total) {
  let html = template;
  const list = cards.map(c => '      ' + c.html.trim()).join('\n');
  html = html.replace(/(<ul class="post-list">)[\s\S]*?(<\/ul>)/, `$1\n${list}\n    $2`);
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
  const out = buildPage(template, slice, n, pages);
  const file = n === 1 ? 'index.html' : `page-${n}.html`;
  console.log(`  ${file.padEnd(14)} ${slice.length} posts  ${slice[0].iso} → ${slice[slice.length-1].iso}`);
  if (!DRY) writeFileSync(join(BLOG, file), out);
}
if (DRY) console.log('\nDry run — nothing written.');
