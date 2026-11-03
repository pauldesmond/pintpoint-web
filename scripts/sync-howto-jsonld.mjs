#!/usr/bin/env node
/**
 * Rebuild each page's HowTo JSON-LD from the steps a reader can actually see.
 *
 * WHY. Sibling of sync-faq-jsonld.mjs, and it exists for the same reason:
 * two hand-kept copies of the same words always drift, and only one of them
 * is visible while you edit. On 3 November 2026 the HowTo block on
 * how-to-find-beer-near-you.html still had step 1 and step 5 worded as they
 * were before a prose pass, and claimed "totalTime": "PT2M" under a heading
 * promising five minutes. Answer engines read the hidden copy.
 *
 * The visible <ol class="steps"> is the source; the JSON-LD is output.
 *
 * Step text is stored as plain text. Links and emphasis are flattened,
 * because raw HTML inside a JSON string is what breaks these blocks.
 *
 * totalTime is checked, not rewritten: if the page's own heading promises a
 * duration ("five minutes to a better pint"), a totalTime that disagrees is
 * reported. Which of the two is right is an editorial call, so it is not made
 * here.
 *
 * Usage: node scripts/sync-howto-jsonld.mjs [--check] [rootDir]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CHECK = process.argv.includes('--check');
const ROOT = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? '.';
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

const plain = html => html
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
  .replace(/\s+/g, ' ')
  .trim();

const WORD_MINUTES = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};

const VISIBLE = /<li>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/li>/g;

let drifted = 0;
let synced = 0;
let timeWarnings = 0;

for (const path of files(ROOT)) {
  const original = readFileSync(path, 'utf8');
  if (!original.includes('"@type": "HowTo"') && !original.includes('"@type":"HowTo"')) continue;

  // Only the steps inside <ol class="steps">, so an <li><h3> elsewhere on the
  // page cannot be mistaken for one.
  const list = /<ol class="steps">([\s\S]*?)<\/ol>/.exec(original);
  if (!list) {
    console.log(`  ${relative(ROOT, path)}\n      HowTo block, but no <ol class="steps"> to build it from`);
    timeWarnings++;
    continue;
  }
  const steps = [...list[1].matchAll(VISIBLE)].map(([, h, p]) => [plain(h), plain(p)]);
  if (!steps.length) continue;

  // Rewrite name and text in place, in order, so the block keeps whatever
  // other properties it carries (image, url, itemListElement wrappers).
  let i = 0;
  const changes = [];
  const next = original.replace(
    /("@type":\s*"HowToStep",\s*(?:"position":\s*\d+,\s*)?"name":\s*")((?:[^"\\]|\\.)*)("\s*,\s*"text":\s*")((?:[^"\\]|\\.)*)(")/g,
    (match, head, name, mid, text, tail) => {
      const step = steps[i++];
      if (!step) return match;
      const enc = t => t.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const [wantName, wantText] = step;
      if (enc(wantName) !== name || enc(wantText) !== text) changes.push(wantName);
      return head + enc(wantName) + mid + enc(wantText) + tail;
    },
  );

  if (i !== steps.length) {
    console.log(`  ${relative(ROOT, path)}\n      the page shows ${steps.length} step(s), the JSON-LD has ${i}`);
    timeWarnings++;
  }

  // totalTime against a duration the page itself promises.
  const total = /"totalTime":\s*"PT(\d+)M"/.exec(next);
  const promise = /<h2[^>]*>[^<]*?\b([a-z]+|\d+)\s+minutes?\b/i.exec(next);
  if (total && promise) {
    const raw = promise[1].toLowerCase();
    const want = /^\d+$/.test(raw) ? Number(raw) : WORD_MINUTES[raw];
    if (want && want !== Number(total[1])) {
      console.log(`  ${relative(ROOT, path)}\n      totalTime PT${total[1]}M, but a heading promises ${raw} minutes`);
      timeWarnings++;
    }
  }

  if (next === original) continue;
  drifted++;
  console.log(`  ${relative(ROOT, path)}`);
  for (const c of changes) console.log(`      ${c}`);
  if (!CHECK) { writeFileSync(path, next); synced++; }
}

if (!drifted && !timeWarnings) {
  console.log('Every HowTo block matches the steps on its page.');
  process.exit(0);
}
if (drifted) {
  console.log(CHECK
    ? `\n${drifted} page(s) carry a HowTo block that no longer matches the page.`
    : `\n${synced} page(s) rebuilt from their visible steps.`);
}
if (timeWarnings) console.log(`\n${timeWarnings} page(s) need a person: see above.`);
process.exit(CHECK && drifted ? 1 : timeWarnings ? 1 : 0);
