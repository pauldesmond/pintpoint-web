#!/usr/bin/env node
/**
 * add-analytics.mjs
 *
 * Adds the Cloudflare Web Analytics beacon to every HTML page on the site.
 *
 * WHY CLOUDFLARE AND NOT GA. The site already sits behind Cloudflare, the
 * beacon is cookieless, and it therefore needs no consent banner — which
 * matters on a site that publishes a privacy policy and has a stated
 * position on tracking. It also reports REFERRERS and PATHS, which Search
 * Console does not: Search Console only ever shows Google search clicks,
 * so a link shared by a venue or a band is currently invisible.
 *
 * TOKEN. Cloudflare dashboard → Analytics & Logs → Web Analytics → add a
 * site → copy the token out of the snippet it gives you. It is not secret
 * (it ships in the page source), but it is per-site, so it cannot be
 * guessed or defaulted.
 *
 *   node scripts/add-analytics.mjs <token> [--dry-run]
 *   node scripts/add-analytics.mjs --remove
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
const token = args.find((a) => !a.startsWith('--'));

if (!REMOVE && !/^[a-f0-9]{32}$/i.test(token || '')) {
  console.error('Usage: node scripts/add-analytics.mjs <32-char-token> [--dry-run]');
  console.error('       node scripts/add-analytics.mjs --remove');
  console.error('\nToken: Cloudflare dashboard → Analytics & Logs → Web Analytics.');
  process.exit(1);
}

const MARK = 'cloudflareinsights.com/beacon.min.js';
const snippet = (t) =>
  `  <!-- Cloudflare Web Analytics — cookieless, no consent banner required.\n` +
  `       Added 2026-09-23 so referral and direct traffic are visible at all;\n` +
  `       Search Console only ever reported Google search clicks. -->\n` +
  `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js"\n` +
  `          data-cf-beacon='{"token": "${t}"}'></script>\n`;

/** Every .html in the repo, skipping build/vendor dirs. */
function pages(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    // drafts are incomplete HTML; the google*.html file is Search Console's
    // verification token and must stay byte-exact.
    if (['node_modules', '.git', '.wrangler', 'worker-cdn', 'drafts'].includes(name)) continue;
    if (/^google[0-9a-f]+\.html$/.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

let changed = 0, already = 0, unusable = 0;
for (const file of pages()) {
  let html = readFileSync(file, 'utf8');
  const has = html.includes(MARK);

  if (REMOVE) {
    if (!has) { already++; continue; }
    html = html.replace(/\n?\s*<!-- Cloudflare Web Analytics[\s\S]*?<\/script>\n?/, '\n');
  } else {
    if (has) { already++; continue; }
    // Before </body> so it never blocks render; defer means it never blocks anyway.
    if (!html.includes('</body>')) {
      console.warn(`  ⚠️  ${relative(ROOT, file)}: no </body> — skipped`);
      unusable++; continue;
    }
    html = html.replace('</body>', snippet(token) + '</body>');
  }
  changed++;
  if (!DRY) writeFileSync(file, html);
}
console.log(`${REMOVE ? 'Removed from' : 'Added to'} ${changed} page(s); ${already} already correct; ${unusable} unusable.`);
if (DRY) console.log('Dry run — nothing written.');
