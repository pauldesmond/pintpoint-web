#!/usr/bin/env node
/**
 * generate-oktoberfest-now.mjs
 *
 * Rebuilds the list inside oktoberfest-beers-pouring-now.html from Supabase.
 * The value of this page is the live "where", not the list — a list of
 * Oktoberfest beers is AI-recyclable, a list of taps they were actually seen
 * on this week is not.
 *
 * Parked 2026-09-16 because the data was thin: 17 beers, one venue each,
 * mostly Californian. Revived 2026-09-28 at 40 beers across 40 venues with
 * Britain leading (26 beers, 22 venues).
 *
 * WHICH BEERS COUNT — the "specials, not regulars" rule, decided from the data
 * rather than by hand:
 *
 *   A name containing Oktoberfest, Festbier, Fest- or Wiesn declares itself
 *   seasonal, so it is in. A name containing only "Märzen" does not: Märzen is
 *   a style that some breweries pour all year. Those are admitted only if we
 *   have never seen them outside September and October.
 *
 * That keeps Paulaner's Oktoberfest Märzen (stocked year-round by some bars,
 * but unambiguously an Oktoberfest beer) and drops Schlenkerla's Rauchbier
 * Märzen (a year-round smoked lager we have seen in May and August).
 *
 * Freshness follows the house rule: seen on tap in the last 7 days.
 * See [[on-tap-single-freshness-rule]].
 *
 * Static and rebuilt nightly — never a per-view database query. Egress.
 *
 * Usage:
 *   PINTPOINT_SUPABASE_URL=... PINTPOINT_SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/generate-oktoberfest-now.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, '..', 'oktoberfest-beers-pouring-now.html');
const START = '<!-- OKTOBERFEST:START -->';
const END = '<!-- OKTOBERFEST:END -->';
const COUNT_START = '<!-- OKTCOUNT:START -->';
const COUNT_END = '<!-- OKTCOUNT:END -->';

const SUPABASE_URL = process.env.PINTPOINT_SUPABASE_URL;
const SERVICE_KEY = process.env.PINTPOINT_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need PINTPOINT_SUPABASE_URL and PINTPOINT_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}


const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One RPC, one round trip. The specials-vs-regulars rule lives in the
// function so the page and any future caller share a single definition.
const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/oktoberfest_pouring_now`, {
  method: 'POST',
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const rows = res.ok ? await res.json() : null;

if (!Array.isArray(rows)) {
  console.error('Query failed — leaving the page untouched rather than publishing an empty list.');
  process.exit(1);
}

// group by beer, collecting the venues each was seen at
const beers = new Map();
for (const r of rows) {
  const key = `${r.brewery}||${r.beer_name}`;
  if (!beers.has(key)) beers.set(key, { ...r, venues: [] });
  beers.get(key).venues.push(r);
}
const list = [...beers.values()].sort((a, b) =>
  b.venues.length - a.venues.length || String(a.brewery).localeCompare(String(b.brewery)));

if (list.length < 10) {
  console.error(`Only ${list.length} beers on tap — below the "don't launch sparse" floor. Page left as-is.`);
  process.exit(1);
}

const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const html = list.map((b) => {
  const places = b.venues
    .sort((x, y) => new Date(y.last_seen) - new Date(x.last_seen))
    .map((v) => `<li><a href="/pubs/${esc(v.venue_slug)}">${esc(v.venue)}</a>`
      + `${v.city ? `, ${esc(v.city)}` : ''} <span class="when">seen ${fmt(v.last_seen)}</span></li>`)
    .join('\n          ');
  return `      <article class="beer">
        <h3>${esc(b.beer_name)}</h3>
        <p class="brewery">${esc(b.brewery)}${b.style ? ` &middot; ${esc(b.style)}` : ''}${b.abv ? ` &middot; ${esc(b.abv)}%` : ''}</p>
        <ul class="where">
          ${places}
        </ul>
      </article>`;
}).join('\n');

const venueCount = new Set(rows.map((r) => r.venue_slug)).size;
const summary = `<strong>${list.length}</strong> Oktoberfest beers seen on tap across `
  + `<strong>${venueCount}</strong> venues in the last seven days`;

let page = readFileSync(PAGE, 'utf8');
for (const [s, e, body] of [[START, END, html], [COUNT_START, COUNT_END, summary]]) {
  const a = page.indexOf(s), z = page.indexOf(e);
  if (a === -1 || z === -1) { console.error(`Missing markers ${s}`); process.exit(1); }
  page = page.slice(0, a + s.length) + '\n' + body + '\n      ' + page.slice(z);
}
page = page.replace(/<!-- BUILT:.*? -->/, `<!-- BUILT: ${new Date().toISOString()} -->`);
writeFileSync(PAGE, page);
console.log(`${list.length} beers, ${venueCount} venues written to ${PAGE}`);
