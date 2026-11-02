#!/usr/bin/env node
/**
 * Request every /pubs/ link the blog points at and fail on anything that 404s.
 *
 * WHY. On 25 September 2026 seven venue rows were soft-deleted in one tidy-up:
 * five with no Untappd listing, two as merged duplicates. Nothing told the
 * articles. Seven links on five published posts went to 404 that afternoon and
 * stayed broken for five weeks, until an outside reader counted them. A venue
 * page is served from the catalogue, so a row that leaves the catalogue takes
 * the page with it, and the article that linked to it has no idea.
 *
 * That is the class: our own internal links rot without a deploy, a commit or
 * a build failure. Nothing in the repo changes, so nothing in the repo can
 * catch it. The only way to know is to ask the live site.
 *
 * Reports the slug, the status and every file that links to it. A redirect is
 * fine; a 404 or 410 is not. Network and 5xx are reported and do not fail the
 * run, because an origin wobble is not a broken link.
 *
 * Usage: node scripts/check-pub-links.mjs [rootDir] [--base https://pintpoint.co.uk]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx === -1 ? 'https://pintpoint.co.uk' : args[baseIdx + 1];
const ROOT = (baseIdx === 0 ? args[2] : args[0]) ?? '.';
const SKIP = new Set(['node_modules', '.git', '.github', 'pubs', 'beers']);
const CONCURRENCY = 6;

/** Every .html and .json file under dir, recursively. */
function* files(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(html|json|txt)$/.test(entry)) yield path;
  }
}

// Collects slug -> the files that link to it.
//
// Read whole URLs, not a bare /pubs/ anywhere in the text: camra.org.uk and
// closedpubs both put their own venues under /pubs/, and a pattern that lets
// the host be optional claims those as ours. Each candidate is taken from an
// href, a src or a JSON "url", then kept only if it is our own site or a
// relative path on it.
const links = new Map();
const URLS = /(?:href|src)="([^"]+)"|"url":\s*"([^"]+)"/g;
const OURS = /^(?:https:\/\/pintpoint\.co\.uk)?(?:\.\.)?\/?pubs\/([a-z0-9][a-z0-9-]*)/;

for (const path of files(ROOT)) {
  const text = readFileSync(path, 'utf8');
  for (const m of text.matchAll(URLS)) {
    const href = m[1] ?? m[2];
    if (/^https?:\/\//.test(href) && !href.startsWith('https://pintpoint.co.uk/')) continue;
    const hit = OURS.exec(href.split('#')[0].split('?')[0]);
    if (!hit) continue;
    const slug = hit[1];
    if (!links.has(slug)) links.set(slug, new Set());
    links.get(slug).add(relative(ROOT, path));
  }
}

const slugs = [...links.keys()].sort();
console.log(`Checking ${slugs.length} venue slugs against ${BASE}`);

const broken = [];
const unknown = [];
let i = 0;

async function worker() {
  while (i < slugs.length) {
    const slug = slugs[i++];
    const url = `${BASE}/pubs/${slug}`;
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'PINtPOINT link check (pintpoint.co.uk)' },
      });
      if (res.status === 404 || res.status === 410) broken.push({ slug, status: res.status });
      else if (!res.ok) unknown.push({ slug, status: res.status });
    } catch (err) {
      unknown.push({ slug, status: err.code ?? 'network' });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

for (const { slug, status } of unknown) {
  console.log(`  ?  ${status}  ${slug}  (not counted as broken)`);
}

if (broken.length === 0) {
  console.log(`All ${slugs.length} venue links resolve.`);
  process.exit(0);
}

console.log(`\n${broken.length} venue ${broken.length === 1 ? 'link' : 'links'} gone:`);
for (const { slug, status } of broken.sort((a, b) => a.slug.localeCompare(b.slug))) {
  console.log(`  ${status}  /pubs/${slug}`);
  for (const file of [...links.get(slug)].sort()) console.log(`        ${file}`);
}
process.exit(1);
