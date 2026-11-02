#!/usr/bin/env node
/**
 * Rebuild each page's FAQPage JSON-LD from the FAQ a reader can actually see.
 *
 * WHY. The visible FAQ and its structured-data twin are two copies of the same
 * answers, and only one of them is visible when you edit. On 2 November 2026 a
 * prose pass corrected the London, Melbourne and San Diego guides and left the
 * JSON-LD behind, so the hidden copy still carried claims the page no longer
 * made, including one we had removed for being unsupported. Search engines and
 * answer engines read the hidden copy.
 *
 * Two lists kept by hand will always diverge, which is why the blog pages are
 * generated from one corpus. This does the same job for the FAQ: the visible
 * <details> blocks are the source, the JSON-LD is output.
 *
 * Answers are stored as plain text. Links and emphasis inside an answer are
 * flattened, because raw HTML inside a JSON string is what breaks these blocks
 * (see check-structured-data.mjs).
 *
 * Usage: node scripts/sync-faq-jsonld.mjs [--check] [rootDir]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CHECK = process.argv.includes('--check');
const ROOT = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) ?? '.';
const SKIP = new Set(['node_modules', '.git', '.github', 'research']);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (entry.endsWith('.html')) yield path;
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←',
  eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', pound: '£',
};

/** The reader's version of an answer: tags gone, entities resolved, one line. */
function plain(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const VISIBLE = /<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/g;

let drifted = 0;
let synced = 0;

for (const path of files(ROOT)) {
  const original = readFileSync(path, 'utf8');
  if (!original.includes('"@type": "FAQPage"') && !original.includes('"@type":"FAQPage"')) continue;

  // The answers a reader sees, in page order.
  const seen = [];
  for (const [, summary, answer] of original.matchAll(VISIBLE)) {
    const paragraphs = [...answer.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1])).filter(Boolean);
    if (paragraphs.length) seen.push({ question: plain(summary), answer: paragraphs.join(' ') });
  }
  if (!seen.length) continue;

  // Replace each stored answer with the visible one, in the same order.
  let i = 0;
  const changes = [];
  const next = original.replace(
    /("acceptedAnswer":\s*\{\s*"@type":\s*"Answer",\s*"text":\s*")((?:[^"\\]|\\.)*)(")/g,
    (match, head, stored, tail) => {
      const want = seen[i++];
      if (!want) return match;
      const encoded = want.answer.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (encoded !== stored) changes.push(want.question);
      return head + encoded + tail;
    },
  );

  if (next === original) continue;
  drifted++;
  const where = relative(ROOT, path);
  console.log(`  ${where}`);
  for (const q of changes) console.log(`      ${q}`);
  if (!CHECK) { writeFileSync(path, next); synced++; }
}

if (!drifted) { console.log('Every FAQPage block matches the FAQ on the page.'); process.exit(0); }
console.log(CHECK
  ? `\n${drifted} page(s) carry a FAQPage block that no longer matches the page.`
  : `\n${synced} page(s) rebuilt from their visible FAQ.`);
process.exit(CHECK ? 1 : 0);
