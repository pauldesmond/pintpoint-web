#!/usr/bin/env node
/**
 * add-pageview-beacon.mjs
 *
 * Adds our OWN page-view beacon (js/pageview.js) to every HTML page that does
 * not already log one.
 *
 * WHY, when the Cloudflare beacon is already on every page: Cloudflare has the
 * referrers and we could not get at them on 2026-10-01 — no API token on the
 * machine, and the referrer breakdown is not on the view the dashboard opens.
 * Our own table has had a `referrer` column since April with nothing writing to
 * it outside index.html and download.html, which is how a day when one post
 * carried half the site's traffic produced three logged rows.
 *
 * Skips index.html and download.html: both carry their own inline beacon tied
 * to the visitor counter, and logging twice would double-count them.
 *
 *   node scripts/add-pageview-beacon.mjs [--dry-run] [--remove]
 *
 * Idempotent: running twice does not double-insert.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const REMOVE = args.includes('--remove');

const SKIP_FILES = new Set(['index.html', 'download.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'drafts']);
const MARK = 'js/pageview.js';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

let added = 0, skipped = 0, removed = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) { skipped++; continue; }
  const html = readFileSync(file, 'utf8');

  if (REMOVE) {
    if (!html.includes(MARK)) continue;
    const out = html.replace(/\n[^\n]*js\/pageview\.js[^\n]*\n/, '\n');
    if (!DRY) writeFileSync(file, out);
    removed++;
    continue;
  }

  if (html.includes(MARK)) { skipped++; continue; }
  if (!html.includes('</body>')) { skipped++; continue; }

  // Depth-correct relative path: blog/foo.html needs ../js/pageview.js.
  const depth = rel.split('/').length - 1;
  const src = '../'.repeat(depth) + 'js/pageview.js';
  const tag = `    <script defer src="${src}"></script>\n`;
  const out = html.replace(/([ \t]*)<\/body>/, `${tag}$1</body>`);
  if (out === html) { skipped++; continue; }
  if (!DRY) writeFileSync(file, out);
  added++;
}

console.log(REMOVE
  ? `removed from ${removed} page(s)${DRY ? ' (dry run)' : ''}`
  : `added to ${added} page(s), skipped ${skipped}${DRY ? ' (dry run)' : ''}`);
