#!/usr/bin/env node
/**
 * Parse every JSON-LD block on the site and fail if one of them doesn't.
 *
 * WHY. Google Search Console reported "Parsing error: Missing ',' or '}'" on
 * 2026-10-04. The cause was an <a href="..."> pasted inside a JSON string in
 * an FAQPage answer — the unescaped double quotes ended the string early. The
 * block had been broken since the page was published and nothing on our side
 * noticed; the page rendered perfectly, because a browser never parses
 * ld+json. Search Console found it, eventually, and a critical structured
 * data error keeps the page out of the features it is marked up for.
 *
 * That is the whole class: ld+json is invisible to everything we look at. The
 * only way to know is to parse it, so now we parse it every night.
 *
 * Also warns — without failing — about raw HTML tags inside the JSON, which is
 * what breaks it in practice. Escaped HTML is legal JSON and Google accepts a
 * little of it in FAQ answers, so it is a smell rather than an error.
 *
 * Usage: node scripts/check-structured-data.mjs [rootDir]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
const SKIP = new Set(['node_modules', '.git', '.github']);

/** Every .html file under dir, recursively. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html') || entry.endsWith('.htm')) out.push(full);
  }
  return out;
}

const BLOCK = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const RAW_TAG = /<(?:a|p|br|strong|em|div|span)\b[^>]*>/i;

const files = htmlFiles(ROOT);
const errors = [];
const warnings = [];
let blocks = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(BLOCK)) {
    blocks++;
    // The line the <script> opens on, so the report points somewhere useful.
    const line = html.slice(0, m.index).split('\n').length;
    const where = `${relative(ROOT, file)}:${line}`;
    try {
      JSON.parse(m[1]);
    } catch (err) {
      errors.push(`${where}  ${err.message}`);
      continue;
    }
    if (RAW_TAG.test(m[1])) warnings.push(`${where}  raw HTML tag inside JSON-LD`);
  }
}

console.log(`Checked ${blocks} JSON-LD blocks across ${files.length} HTML files.`);
for (const w of warnings) console.log(`  warning: ${w}`);
if (errors.length === 0) {
  console.log('All parse.');
  process.exit(0);
}
console.error(`\n${errors.length} unparsable JSON-LD block(s) — Search Console treats this as critical:`);
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
