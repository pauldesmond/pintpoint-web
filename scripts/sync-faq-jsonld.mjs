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
// Adding an entry means choosing where it goes, so it is never the default:
// --check and a plain run both report and stop.
const ADD = process.argv.includes('--add-missing');
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
let unmarked = 0;
let added = 0;

for (const path of files(ROOT)) {
  const original = readFileSync(path, 'utf8');
  if (!original.includes('"@type": "FAQPage"') && !original.includes('"@type":"FAQPage"')) continue;

  // The answers a reader sees, keyed by the question they answer.
  //
  // Keyed, not positional. compare.html carries a seventh question in its
  // JSON-LD that the visible FAQ does not ask, and matching by position walked
  // every answer after it onto the wrong question. A block with more questions
  // than the page is left alone except where a question matches.
  const seen = new Map();
  for (const [, summary, answer] of original.matchAll(VISIBLE)) {
    const paragraphs = [...answer.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => plain(m[1])).filter(Boolean);
    if (paragraphs.length) seen.set(plain(summary), paragraphs.join(' '));
  }
  if (!seen.size) continue;

  // Each stored answer is rewritten only when its own question is on the page.
  const changes = [];
  const marked = new Set();
  // Several pages word a question more fully in the JSON-LD than on the page
  // ("Which was the first?" against "Which was the first Loaded World Cup?").
  // The answer is what has to be marked up, so a stored answer that matches a
  // visible one counts as covering it however the question is phrased.
  const answered = new Set();
  let next = original.replace(
    /("name":\s*")((?:[^"\\]|\\.)*)("\s*,\s*"acceptedAnswer":\s*\{\s*"@type":\s*"Answer",\s*"text":\s*")((?:[^"\\]|\\.)*)(")/g,
    (match, nameHead, question, mid, stored, tail) => {
      const asked = plain(question.replace(/\\"/g, '"'));
      marked.add(asked);
      answered.add(stored.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
      const want = seen.get(asked);
      if (want === undefined) return match;
      const encoded = want.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (encoded !== stored) changes.push(question);
      return nameHead + question + mid + encoded + tail;
    },
  );

  // A question the page asks but the block never mentions. The rewrite above
  // can only correct answers that are already there, so this is reported and
  // left for a person: inserting an entry means choosing where it goes, and a
  // syncer that silently grows the block would hide the drift it exists to
  // catch.
  const missing = [...seen.keys()].filter(q => !marked.has(q) && !answered.has(seen.get(q)));
  if (missing.length) {
    console.log(`  ${relative(ROOT, path)}`);
    for (const q of missing) console.log(`      not in the JSON-LD: ${q}`);
    if (ADD && !CHECK) {
      // Appended to mainEntity in the order the page asks them, matching the
      // indentation of the entry above so the block stays readable.
      const enc = t => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const entries = missing.map(q =>
        `      {\n        "@type": "Question",\n        "name": "${enc(q)}",\n` +
        `        "acceptedAnswer": { "@type": "Answer", "text": "${enc(seen.get(q))}" }\n      }`);
      const closed = /(\n\s*\}\n)(\s*\]\s*\n\s*\}\n\s*<\/script>)/;
      if (closed.test(next)) {
        next = next.replace(closed, (m, end, tail) => `${end.replace(/\n$/, '')},\n${entries.join(',\n')}\n${tail}`);
        added += missing.length;
      } else {
        console.log('      could not place it: the mainEntity array has an unexpected shape');
        unmarked++;
      }
    } else {
      unmarked++;
    }
  }

  if (next === original) continue;
  drifted++;
  const where = relative(ROOT, path);
  console.log(`  ${where}`);
  for (const q of changes) console.log(`      ${q}`);
  if (!CHECK) { writeFileSync(path, next); synced++; }
}

if (!drifted && !unmarked) {
  console.log('Every FAQPage block matches the FAQ on the page.');
  process.exit(0);
}
if (drifted) {
  console.log(CHECK
    ? `\n${drifted} page(s) carry a FAQPage block that no longer matches the page.`
    : `\n${synced} page(s) rebuilt from their visible FAQ.`);
}
if (unmarked) console.log(`\n${unmarked} page(s) ask a question the JSON-LD never answers. Add it, or run with --add-missing.`);
if (added) console.log(`\n${added} question(s) added to the JSON-LD.`);
process.exit(CHECK || unmarked ? 1 : 0);
