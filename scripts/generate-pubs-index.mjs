#!/usr/bin/env node
/**
 * generate-pubs-index.mjs
 *
 * Rebuilds the venue index inside pubs/index.html.
 *
 * WHAT THIS REPLACED, AND WHY. Until 19 November 2026 this page showed
 * twenty venues: three hand-picked and fixed, three rotated daily out of a
 * pool of fifteen, and fourteen shuffled from the forty most recently
 * updated. Fifty-eight venues could ever appear, three of them every single
 * day, on a page whose own description promised browsing tap lists across
 * eighty-two countries. Paul, the same morning: "Venues is a pointless page
 * it's always narrow set of the same ones."
 *
 * Meanwhile the sitemap carried 1,137 venue pages with no internal route to
 * them at all. An editor's shelf of twenty is what a home page does; this
 * page's job is to be the index, so that is what it now is: every venue the
 * sitemap considers worth indexing, grouped by country and then by town.
 *
 * WHERE THE LIST COMES FROM. _data/indexable-venues.json, written by
 * generate-sitemap.mjs, which already decides which venues go in the sitemap
 * (live ones with enough recent tap activity, plus the curated ghosts).
 * Recomputing that rule here would put it in two scripts to drift apart, and
 * this repo has paid for duplicated rules before. The nightly workflow runs
 * the sitemap first.
 *
 * Usage: node scripts/generate-pubs-index.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, '..', 'pubs', 'index.html');
const DATA_PATH = join(__dirname, '..', '_data', 'indexable-venues.json');
const START = '<!-- PUBS-INDEX:START -->';
const END = '<!-- PUBS-INDEX:END -->';
const ITEMLIST_START = '<!-- ITEMLIST:START -->';
const ITEMLIST_END = '<!-- ITEMLIST:END -->';
const SCHEMA_SAMPLE = 10;

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const anchor = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const num = (n) => n.toLocaleString('en-GB');

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const venues = data.venues ?? [];
if (!venues.length) {
  console.error('❌ _data/indexable-venues.json has no venues. Run generate-sitemap.mjs first.');
  process.exit(1);
}

/** country -> city -> venues, each sorted so the page reads the same way twice. */
const byCountry = new Map();
for (const v of venues) {
  const country = v.country_name || v.country_code || 'Elsewhere';
  const city = v.city || 'Elsewhere';
  if (!byCountry.has(country)) byCountry.set(country, new Map());
  const cities = byCountry.get(country);
  if (!cities.has(city)) cities.set(city, []);
  cities.get(city).push(v);
}

const collator = new Intl.Collator('en-GB', { sensitivity: 'base' });
// Sort key drops a leading article: "The Rake" files under R, the same rule
// the app's venue letter chips use.
const fileAs = (name) => String(name).replace(/^(the|a|an)\s+/i, '');

const countries = [...byCountry.entries()]
  .map(([country, cities]) => ({
    country,
    total: [...cities.values()].reduce((n, list) => n + list.length, 0),
    cities: [...cities.entries()]
      .map(([city, list]) => ({
        city,
        list: list.sort((a, b) => collator.compare(fileAs(a.name), fileAs(b.name))),
      }))
      .sort((a, b) => (b.list.length - a.list.length) || collator.compare(a.city, b.city)),
  }))
  .sort((a, b) => (b.total - a.total) || collator.compare(a.country, b.country));

const jump = countries
  .map((c) => `<a href="#country-${anchor(c.country)}">${esc(c.country)} <span class="n">${num(c.total)}</span></a>`)
  .join('\n        ');

const sections = countries.map((c) => {
  const cities = c.cities.map((ct) => {
    const items = ct.list.map((v) => {
      const gone = v.kind === 'ghost' ? ' class="gone"' : '';
      const tag = v.kind === 'ghost' ? '<span class="tag">closed</span>' : '';
      return `<li><a href="${esc(v.slug)}"${gone}>${esc(v.name)}${tag}</a></li>`;
    }).join('');
    return `        <h3 id="city-${anchor(c.country)}-${anchor(ct.city)}">${esc(ct.city)} <span class="n">${num(ct.list.length)}</span></h3>\n`
      + `        <ul class="venue-index">${items}</ul>`;
  }).join('\n');
  return `      <section class="country" id="country-${anchor(c.country)}">\n`
    + `        <h2>${esc(c.country)} <span class="n">${num(c.total)}</span></h2>\n`
    + `${cities}\n      </section>`;
}).join('\n');

const live = venues.filter((v) => v.kind === 'live');
const sample = live.slice(0, SCHEMA_SAMPLE).map((v, i) =>
  `      { "@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(v.name)}, "url": "https://pintpoint.co.uk/pubs/${v.slug}" }`
).join(',\n');

const itemList = `${ITEMLIST_START}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Sample PINtPOINT venue pages",
    "itemListOrder": "https://schema.org/ItemListUnordered",
    "numberOfItems": ${venues.length},
    "itemListElement": [
${sample}
    ]
  }
  </script>
  ${ITEMLIST_END}`;

let html = readFileSync(INDEX_PATH, 'utf8');
for (const [a, b] of [[START, END], [ITEMLIST_START, ITEMLIST_END]]) {
  if (!html.includes(a) || !html.includes(b)) {
    console.error(`❌ pubs/index.html is missing ${a} / ${b}`);
    process.exit(1);
  }
}

html = html.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`),
  `${START}\n${sections}\n      ${END}`,
);
html = html.replace(new RegExp(`${ITEMLIST_START}[\\s\\S]*?${ITEMLIST_END}`), itemList);

// The two counts in the page's own prose, kept true by the same run that
// writes the list. A hand-typed total on a generated page is a lie waiting.
html = html
  .replace(/<span data-count="venues">[^<]*<\/span>/g, `<span data-count="venues">${num(venues.length)}</span>`)
  .replace(/<span data-count="countries">[^<]*<\/span>/g, `<span data-count="countries">${num(countries.length)}</span>`)
  .replace(/<!-- JUMP:START -->[\s\S]*?<!-- JUMP:END -->/, `<!-- JUMP:START -->\n        ${jump}\n        <!-- JUMP:END -->`);

writeFileSync(INDEX_PATH, html);
console.log(`Rebuilt pubs/index.html: ${num(venues.length)} venues (${num(live.length)} live, ${num(venues.length - live.length)} closed) across ${countries.length} countries.`);
