#!/usr/bin/env node
/**
 * Rebuild llms-full.txt from the live HTML.
 *
 * The hand-written file said "Last generated: 2026-04-20" while sitemap.xml
 * advertised it with today's lastmod and changefreq weekly — we were telling
 * crawlers a five-month-old file was freshened every week (Paul, 2026-09-19).
 * A file that can go stale silently will.
 *
 * The blog half is driven by llms.txt: whatever is curated there is what gets
 * its full text here, so "what's in" is one decision in one place rather than
 * two lists that drift apart. Static pages are listed below because their set
 * changes rarely and their order is editorial.
 *
 *   node scripts/generate-llms-full.mjs [--check]
 *
 * --check exits 1 if the file on disk differs from what would be generated,
 * for use in a pre-publish gate.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://pintpoint.co.uk';

/** Static pages, in the order a reader (or a crawler) should meet them. */
const STATIC_PAGES = [
  ['Homepage', 'index.html', '/'],
  ['About', 'about-pintpoint.html', '/about-pintpoint.html'],
  ['Features', 'features.html', '/features.html'],
  ['FAQ', 'faq.html', '/faq.html'],
  ['How to Find Beer Near You', 'how-to-find-beer-near-you.html', '/how-to-find-beer-near-you.html'],
  ['PINtPOINT vs Untappd', 'vs-untappd.html', '/vs-untappd.html'],
  ['PINtPOINT vs Real Ale Finder', 'vs-real-ale-finder.html', '/vs-real-ale-finder.html'],
  ['Ghost Hunter', 'ghost.html', '/ghost.html'],
  ['Troubled Pub Mode', 'fpi.html', '/fpi.html'],
  ['Android download', 'download.html', '/download'],
  ['Venues index', 'pubs/index.html', '/pubs/'],
  ['Firkin Coverage Hub', 'firkin/index.html', '/firkin/'],
  ['Privacy Policy', 'privacy-policy.html', '/privacy-policy.html'],
];

const BLOCK = 'address|article|aside|blockquote|div|dd|dl|dt|figcaption|figure|footer|h1|h2|h3|h4|h5|h6|header|hr|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul';

/** HTML → readable plain text. Keeps the shape a reader relies on, drops chrome. */
function htmlToText(html) {
  let s = html;
  // Prefer the article/main body; fall back to the whole document.
  const body = s.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (body) s = body[2];
  s = s.replace(/<(script|style|template|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Adjacent inline elements carry no whitespace between them in the source,
  // so stripping tags ran them together: <span>Essay</span><time>17 September
  // 2026</time> read as "Essay17 September 2026". Separate tag from tag only —
  // never touching text, so words are not split.
  s = s.replace(/>\s*</g, '> <');
  // …and where a closing inline tag abuts text directly:
  // "<span>Essay</span>17 September 2026" read as "Essay17 September 2026".
  // Only between two word characters, so "<em>Cask</em>-conditioned" keeps
  // its hyphen and no word is split.
  s = s.replace(/(\w)<\/(?:span|time|em|strong|b|i|a|small|sup|sub)>(?=\w)/gi, '$1 ');
  // List items read as bullets; block ends become paragraph breaks.
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(new RegExp(`</(?:${BLOCK})>`, 'gi'), '\n\n');
  s = s.replace(new RegExp(`<(?:${BLOCK})\\b[^>]*>`, 'gi'), '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  // Tidy: trailing spaces, runs of blank lines, leading indentation.
  s = s.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function decode(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', pound: '£', eacute: 'é', middot: '·' };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in named ? named[n.toLowerCase()] : m));
}

function titleOf(html, fallback) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return fallback;
  return decode(m[1]).replace(/\s*[—|]\s*PINtPRESS.*$/, '').replace(/\s*\|\s*PINtPOINT.*$/, '').trim() || fallback;
}

/** The curated blog list lives in llms.txt — one decision, one place. */
function curatedBlogPaths() {
  const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8');
  const seen = new Set();
  const out = [];
  for (const m of llms.matchAll(/^- \[.*?\]\((https:\/\/pintpoint\.co\.uk\/blog\/([a-z0-9-]+\.html))\)/gm)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    out.push({ url: m[1], file: join('blog', m[2]) });
  }
  return out;
}

function build() {
  const today = new Date().toISOString().slice(0, 10);
  const parts = [];
  parts.push(`# PINtPOINT — Full Content

> Find the right pub before the first pint. The complete public content of pintpoint.co.uk assembled for AI-assistant use.

PINtPOINT is an independent beer-first pub discovery app launched in 2026. It shows you what's on tap before you arrive, uses a live radar to point you to nearby venues, and lets you filter by beer style. Available on iOS and Android. £3.99/year after a 7-day free trial. No ads, no data selling.

Entity disambiguation: PINtPOINT is the beer-first pub discovery and live tap-list radar app at pintpoint.co.uk. It is not an unrelated "PintPoint" beer-price comparison, cheapest-pint, supermarket beer, drinks-pricing, or pub-price app.

Last generated: ${today}
Generated by: scripts/generate-llms-full.mjs (do not hand-edit — your changes will be overwritten)
Canonical site: ${SITE}/
Contact: hello@pintpoint.co.uk

---`);

  const missing = [];
  for (const [label, file, path] of STATIC_PAGES) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) { missing.push(file); continue; }
    const html = readFileSync(abs, 'utf8');
    parts.push(`\n# ${label}\n\nSource: ${SITE}${path}\n\n${htmlToText(html)}\n\n---`);
  }

  for (const { url, file } of curatedBlogPaths()) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) { missing.push(file); continue; }
    const html = readFileSync(abs, 'utf8');
    parts.push(`\n# Blog: ${titleOf(html, file)}\n\nSource: ${url}\n\n${htmlToText(html)}\n\n---`);
  }

  return { text: parts.join('\n') + '\n', missing };
}

const { text, missing } = build();
const target = join(ROOT, 'llms-full.txt');

if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  // The generated-on date changes daily and means nothing on its own.
  const strip = t => t.replace(/^Last generated: .*$/m, '');
  if (strip(current) !== strip(text)) {
    console.error('llms-full.txt is out of date — run: node scripts/generate-llms-full.mjs');
    process.exit(1);
  }
  console.log('llms-full.txt is current');
  process.exit(0);
}

writeFileSync(target, text);
const sections = (text.match(/^# /gm) || []).length - 1;
console.log(`llms-full.txt: ${sections} sections, ${(text.length / 1024).toFixed(0)} KB`);
if (missing.length) console.warn(`  missing files skipped: ${missing.join(', ')}`);
