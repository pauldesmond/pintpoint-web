#!/usr/bin/env node
/**
 * generate-blog-pages.mjs
 *
 * Paginates the PINtPRESS archive: 10 posts a page, newest first.
 *   blog/index.html   page 1: the shelf of covers, then cards
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
const PER_PAGE = 30;   // covers on page one count towards it
const DRY = process.argv.includes('--dry-run');

const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];

const CORPUS = join(ROOT, '_data', 'blog-archive.json');

// Every post lives on one page now. The index keeps the covers and the most
// recent cards; the archive holds the lot, with the four kinds as buttons.
const ARCHIVE = 'archive.html';
const KINDS = [['essay', 'Essays'], ['note', 'Notes'], ['guide', 'Guides'], ['postcard', 'Postcards']];

function kindOf(card) {
  const m = card.html.match(/post-date ([a-z]+)/);
  return m ? m[1] : '';
}

const FILTER_CSS = `
    .kinds { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; padding: 0; list-style: none; }
    .kinds button { font-family: var(--sans); font-size: .76rem; letter-spacing: .06em; text-transform: uppercase;
      background: none; border: 1px solid var(--rule); color: var(--muted); padding: 8px 14px; border-radius: 999px;
      cursor: pointer; }
    .kinds button:hover, .kinds button:focus-visible { border-color: var(--amber-ink); color: var(--ink); outline: none; }
    .kinds button[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); font-weight: 700; }
    .kinds .count { font-weight: 400; color: var(--amber-ink); margin-left: 6px; }
    .post-list li[hidden] { display: none; }
`;

const FILTER_JS = `  <script>
  (function () {
    var KINDNAMES = ['essay', 'note', 'guide', 'postcard'];
    var bar = document.querySelector('.kinds');
    var list = document.querySelector('.post-list');
    if (!bar || !list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('li'));
    function kind(li) {
      var d = li.querySelector('.post-date');
      if (!d) return '';
      var c = d.className.replace('post-date', '').trim();
      return c.split(' ')[0] || '';
    }
    function apply(k) {
      items.forEach(function (li) { li.hidden = !!k && kind(li) !== k; });
      Array.prototype.forEach.call(bar.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', (b.dataset.kind || '') === (k || '') ? 'true' : 'false');
      });
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var k = b.dataset.kind || '';
      apply(k);
      var u = new URL(window.location.href);
      if (k) u.searchParams.set('kind', k); else u.searchParams.delete('kind');
      history.replaceState(null, '', u);
    });
    var start = new URL(window.location.href).searchParams.get('kind') || '';
    apply(KINDNAMES.indexOf(start) === -1 ? '' : start);
  })();
  </script>
`;

function filterBar(cards) {
  const counts = {};
  for (const c of cards) counts[kindOf(c)] = (counts[kindOf(c)] || 0) + 1;
  const btn = (k, label, n) =>
    `        <li><button type="button" data-kind="${k}" aria-pressed="${k ? 'false' : 'true'}">${label}<span class="count">${n}</span></button></li>`;
  const rows = [btn('', 'All', cards.length)]
    .concat(KINDS.filter(([k]) => counts[k]).map(([k, label]) => btn(k, label, counts[k])));
  return `    <ul class="kinds" aria-label="Filter by kind">\n${rows.join('\n')}\n    </ul>`;
}

/**
 * The corpus: every post, with the hand-written excerpt card that goes with it.
 *
 * It used to be re-read from the rendered pages on every run, which was fine
 * while every post appeared in a list. It is not fine now that the newest
 * twenty one appear only as covers: they would be absent from the lists, and
 * the next run would quietly forget them. So the list of record lives in
 * _data/blog-archive.json, and the pages are only ever output.
 *
 * The pages are still read, and anything found there that the file does not
 * know about is added, so a hand-added card is never lost either.
 */
function collectCards() {
  const seen = new Map();
  if (existsSync(CORPUS)) {
    for (const c of JSON.parse(readFileSync(CORPUS, 'utf8'))) seen.set(c.href, c);
  }
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
  const all = [...seen.values()].sort((a, b) => b.iso.localeCompare(a.iso));
  if (!DRY) writeFileSync(CORPUS, JSON.stringify(all, null, 1) + '\n');
  return all;
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
  // Empty: both of the pieces that were held back were given proper cards on
  // 19 October 2026. Add an href here if one ever ships without a headline on
  // its artwork, and take it out again when the card is made.
]);
const SHELF_MAX = 21;

/** Width and height of a jpeg or png, without pulling in a library. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * The cover for a post, preferring a square one.
 *
 * A post's og:image is sometimes the wide 1200x628 cut made for sharing. The
 * shelf frames are square, so a wide cover arrives cropped through the middle
 * and loses whatever sat at its top and bottom. Where a square sibling exists
 * beside it, that is the one the shelf wants.
 */
function coverFor(href) {
  const file = join(BLOG, href);
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

/**
 * The small cut of a cover for the size it is about to be drawn at, from
 * blog/images/tiles (see build-blog-tiles.mjs). Falls back to the original so
 * a cover added without running that script still appears.
 */
const TIER_WIDTH = { t1: 960, t2: 480, t3: 240 };
function tileSrc(img, tier) {
  const stem = img.replace(/^images\//, '').replace(/\.[a-z]+$/i, '');
  const small = `images/tiles/${stem}-${TIER_WIDTH[tier]}.jpg`;
  return existsSync(join(BLOG, small)) ? small : img;
}

function shelfPicks(cards) {
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
  return picks;
}

function shelfHtml(picks) {
  if (!picks.length) return '';
  const tier = i => (i === 0 ? 't1' : i < 5 ? 't2' : 't3');
  const tiles = picks.map((p, i) => {
    const t = tier(i);
    const w = TIER_WIDTH[t];
    const jpg = tileSrc(p.img, t);
    const webp = jpg.replace(/\.jpg$/, '.webp');
    const source = jpg !== p.img && existsSync(join(BLOG, webp))
      ? `<source type="image/webp" srcset="${webp}" />` : '';
    const img = `<img src="${jpg}" alt="${p.title}" loading="${i === 0 ? 'eager' : 'lazy'}" ` +
      `decoding="async" width="${w}" height="${w}" />`;
    return `        <a class="shelf-tile ${t}" href="${p.href}" title="${p.title}" aria-label="${p.title}">` +
      (source ? `<picture>${source}${img}</picture>` : img) + `</a>`;
  }).join('\n');
  return `    <div class="shelf">\n${tiles}\n    </div>\n\n`;
}

/** A page that used to exist, kept alive and pointed at the archive. */
function stub(file) {
  const tpl = readFileSync(join(BLOG, 'older.html'), 'utf8');
  return tpl
    .replace(/<meta http-equiv="refresh" content="[^"]*"\s*\/?>/, `<meta http-equiv="refresh" content="0; url=./${ARCHIVE}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="https://pintpoint.co.uk/blog/${file}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="https://pintpoint.co.uk/blog/${ARCHIVE}" />`);
}

const SHELF_CSS = `
    /* Covers shrink as the shelf goes back: one at four columns, four at two,
       the rest at one. Eight columns keeps those spans whole. height:auto
       matters — the img tags carry width/height, and without it the attribute
       height wins and aspect-ratio is ignored. */
    .shelf { display: grid; gap: 10px; grid-template-columns: repeat(8, 1fr); margin: 0 0 40px; }
    .shelf-tile { display: block; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; line-height: 0; }
    .shelf-tile:hover, .shelf-tile:focus-visible { border-color: var(--teal); outline: none; }
    .shelf-tile picture { display: block; }
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
  if (current === 1) html = html.replace(/(\n\s*(?:<h2 class="list-head">[\s\S]*?<\/h2>\s*)?<ul class="post-list">)/, `\n${shelfHtml(allCards)}$1`);
  if (!html.includes('.shelf {')) html = html.replace(/(\n  <\/style>)/, `${SHELF_CSS}$1`);
  // replace the old "→ Older posts" link, or any existing pager, with this one
  html = html.replace(/\n\s*<p style="margin-top:24px[^"]*"><a href="older\.html"[\s\S]*?<\/p>/, '');
  html = html.replace(/\n\s*<nav class="pager[^"]*"[\s\S]*?<\/nav>/g, '');
  html = html.replace(/(<\/ul>)/, `$1\n\n${pager(current, total)}`);
  if (!html.includes('.pager {')) html = html.replace(/(\n  <\/style>)/, `${PAGER_CSS}$1`);

  const canonical = current === 1
    ? 'https://pintpoint.co.uk/blog/'
    : `https://pintpoint.co.uk/blog/page-${current}.html`;
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`);
  const suffix = current === 1 ? '' : ` — page ${current}`;
  html = html.replace(/<title>([^<]*?)(?: — page \d+)?<\/title>/, `<title>$1${suffix}</title>`);
  // Taking the shelf out and putting it back left one blank line behind each
  // run, so the file grew by a line a night. Close the gap to the single blank
  // line the strip above expects to find next time.
  html = html.replace(/<\/div>\n{2,}(\s*<h2 class="list-head">)/, '</div>\n\n$1');
  return html;
}

const cards = collectCards();

// A cover and a card for the same post would be the same post twice, so the
// shelf takes its posts out of the lists. The covers still count towards the
// thirty, which is why page one carries fewer cards than the pages after it.
const shelved = shelfPicks(cards);
const shelvedHrefs = new Set(shelved.map(p => p.href));
const listed = cards.filter(c => !shelvedHrefs.has(c.href));
const firstPage = Math.max(0, PER_PAGE - shelved.length);
const rest = Math.max(1, Math.ceil(Math.max(0, listed.length - firstPage) / PER_PAGE));
const pages = listed.length <= firstPage ? 1 : 1 + rest;
console.log(`${cards.length} posts: ${shelved.length} covers + ${listed.length} cards → ${pages} page(s) of ${PER_PAGE}`);

/** The archive: every post, no covers, the four kinds as buttons on top. */
function buildArchive(template, allCards) {
  let html = template;
  const list = allCards.map(c => '      ' + c.html.trim()).join('\n');
  html = html.replace(/(<ul class="post-list">)[\s\S]*?(<\/ul>)/, `$1\n${list}\n    $2`);
  html = html.replace(/\n?\s*<div class="shelf">[\s\S]*?<\/div>\n\n/, '\n');
  html = html.replace(/\n\s*<p class="shelf-switch">[\s\S]*?<\/p>/, '');
  html = html.replace(/\n\s*<nav class="pager[^"]*"[\s\S]*?<\/nav>/g, '');
  html = html.replace(/\n\s*<p class="more-posts">[\s\S]*?<\/p>/, '');
  html = html.replace(/<h2 class="list-head">[\s\S]*?<\/h2>/, 'ARCHIVEHEAD');
  html = html.replace('ARCHIVEHEAD', `<h2 class="list-head">Everything</h2>\n${filterBar(allCards)}`);
  if (!html.includes('.kinds {')) html = html.replace(/(\n  <\/style>)/, `${FILTER_CSS}$1`);
  if (!html.includes("querySelector('.kinds')")) html = html.replace(/(\n<\/body>)/, `\n${FILTER_JS}$1`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="https://pintpoint.co.uk/blog/${ARCHIVE}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="https://pintpoint.co.uk/blog/${ARCHIVE}" />`);
  html = html.replace(/<title>([^<]*?)(?: — page \d+)?<\/title>/, '<title>The PINtPRESS archive</title>');
  return html;
}

const template = readFileSync(join(BLOG, 'index.html'), 'utf8');

// Page one: the covers and the newest cards, then a line through to the rest.
const slice = listed.slice(0, firstPage);
let front = buildPage(template, slice, 1, 1, shelved);
front = front.replace(/\n\s*<nav class="pager[^"]*"[\s\S]*?<\/nav>/g, '');
front = front.replace(/\n\s*<p class="more-posts">[\s\S]*?<\/p>/, '');
const remaining = cards.length - shelved.length - slice.length;
if (remaining > 0) {
  const counts = {};
  for (const c of cards) counts[kindOf(c)] = (counts[kindOf(c)] || 0) + 1;
  const links = KINDS.filter(([k]) => counts[k]).map(([k, label]) =>
    `        <a href="${ARCHIVE}?kind=${k}">${label} <span class="count">${counts[k]}</span></a>`).join('\n');
  const total = remaining + shelved.length + slice.length;
  const more = `\n    <nav class="pager archive-nav" aria-label="The rest of the archive">\n${links}\n` +
    `        <a href="${ARCHIVE}" rel="next" class="go">All ${total} posts <span class="arrow">&rarr;</span></a>\n    </nav>`;
  front = front.replace(/(<\/ul>)/, `$1\n${more}`);
}
// The row under the cards: the kinds are side doors, All posts is the way in,
// and the difference is carried by weight rather than by a fifth colour.
const NAV_CSS = `
    .archive-nav { gap: 8px; margin: 34px 0 30px; }
    .archive-nav a { border-radius: 999px; padding: 9px 16px; font-size: .78rem; letter-spacing: .05em;
      text-transform: uppercase; color: var(--ink); border: 1px solid var(--rule); }
    .archive-nav a:hover { border-color: var(--ink); }
    /* .pager styles every span as the you-are-here chip, which would put a box
       round the counts and the arrow. */
    .archive-nav span { min-width: 0; padding: 0; border: 0; background: none; }
    .archive-nav .count { color: var(--amber-ink); font-weight: 400; margin-left: 5px; }
    .archive-nav a.go { background: var(--ink); border-color: var(--ink); color: var(--paper); font-weight: 700; }
    .archive-nav a.go:hover { background: #000; }
    .archive-nav a.go .arrow { color: var(--amber); margin-left: 4px; }
`;
front = front.replace(/\n\s*\.more-posts \{[^}]*\}/, '');
if (!front.includes('.archive-nav {')) front = front.replace(/(\n  <\/style>)/, `${NAV_CSS}$1`);
console.log(`  index.html     ${shelved.length} covers + ${slice.length} cards, ${remaining} more on the archive`);
if (!DRY) writeFileSync(join(BLOG, 'index.html'), front);

const archive = buildArchive(template, cards);
console.log(`  ${ARCHIVE.padEnd(14)} ${cards.length} cards, ${KINDS.length} kinds`);
if (!DRY) writeFileSync(join(BLOG, ARCHIVE), archive);

// Pages that existed when the archive ran ten to a page are kept alive rather
// than deleted, because they are in the sitemap and may be linked from
// elsewhere. They point at the archive and say so.
const stale = readdirSync(BLOG).filter(f => /^page-(\d+)\.html$/.test(f));
for (const file of stale) {
  console.log(`  ${file.padEnd(14)} → redirect to /blog/${ARCHIVE}`);
  if (!DRY) writeFileSync(join(BLOG, file), stub(file));
}
if (DRY) console.log('\nDry run — nothing written.');
