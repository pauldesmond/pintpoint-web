#!/usr/bin/env node
/**
 * Flag a live catalogue figure written into a blog post.
 *
 * THE RULE (Paul, 3 November 2026). A post is dated writing. A number in one
 * should either carry an "as of" and a date, or not be there. The nightly
 * stats sweep in generate-sitemap.mjs rewrites figures in the root pages,
 * llms.txt and ai/*.json, and deliberately never touches blog/ — if it did, it
 * would restamp date-stamped pieces nobody had edited, which is the same
 * problem sync-date-modified.mjs excludes furniture to avoid.
 *
 * So a count in a blog post freezes on the day it is written and nothing
 * fixes it. national-pub-day-telegraph-ale.html said "1,776+ venues globally"
 * in its FAQ and its JSON-LD until 3 November 2026, against a real 7,070, in
 * a present-tense answer search engines quote.
 *
 * WHAT IT LOOKS FOR, and why it is proximity rather than a phrase. A sweep for
 * "eight pubs" missed "eight UK pubs now pour it on draft" in a sibling post,
 * because one word in the middle defeated the pattern. This matches a figure
 * within a few words of a catalogue noun instead, which catches the shapes
 * nobody thought to write down.
 *
 * It only fires on OUR figures: a count attached to venues, pubs, countries or
 * beers, written as 1,776+ / 7,000+ / "over 7,000" / four or more digits. A
 * plain "four pubs a day are closing" is somebody else's number and is left
 * alone, as is any sentence carrying an as-of qualifier or a year.
 *
 * Usage: node scripts/check-blog-counts.mjs [dir]   (default blog/)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? 'blog';

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'drafts' || entry === 'images') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (entry.endsWith('.html')) yield path;
  }
}

const NOUNS = 'venues|pubs|countries|beers|breweries';
// A figure that reads as a catalogue total: 1,776+ / 7,000+ / over 7,000 /
// 30+. It must carry a comma, a plus or an "over": a bare four-digit number is
// usually a year ("From 1895 the big breweries..."), which is not a count.
const FIGURE = '(?:over\\s+)?\\d{1,3}(?:,\\d{3})+\\+?|\\d{1,4}\\+';
// Up to three words of slack, which is what "eight UK pubs" needed.
const SLACK = '(?:\\s+[\\w’\'-]+){0,3}\\s+';
const CLAIM = new RegExp(`(${FIGURE})${SLACK}(${NOUNS})\\b`, 'gi');
// An as-of qualifier, or a year, anywhere in the same sentence.
const DATED = /\bas of\b|\bat the time of writing\b|\b(?:19|20)\d{2}\b/i;
// Only OUR figures. A sentence about Cask Marque's accredited cellars or the
// pubs pouring Draught Bass is somebody else's number, correctly dated to the
// piece, and none of this rule's business.
const OURS = /PINtPOINT|PINtPRESS|\bwe (?:track|hold|list|cover|show)\b|our catalogue/i;

const plain = html => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .replace(/\s+/g, ' ');

let hits = 0;
for (const path of files(ROOT)) {
  const src = readFileSync(path, 'utf8');
  // Body prose and the JSON-LD both, because the hidden copy is the one that
  // gets quoted back and the one nobody sees while editing.
  const text = plain(src);
  const found = [];
  for (const m of text.matchAll(CLAIM)) {
    const from = text.lastIndexOf('.', m.index) + 1;
    const to = text.indexOf('.', m.index + m[0].length);
    const sentence = text.slice(from, to === -1 ? text.length : to + 1).trim();
    if (DATED.test(sentence) || !OURS.test(sentence)) continue;
    found.push(`${m[0]}  —  ${sentence.slice(0, 150)}`);
  }
  if (!found.length) continue;
  hits += found.length;
  console.log(`  ${relative('.', path)}`);
  for (const f of [...new Set(found)]) console.log(`      ${f}`);
}

if (!hits) {
  console.log('No undated catalogue figures in blog posts.');
  process.exit(0);
}
console.log(`\n${hits} catalogue figure(s) in dated writing with no "as of".`);
console.log('Give it a date ("as of November 2026"), or take the number out.');
process.exit(1);
