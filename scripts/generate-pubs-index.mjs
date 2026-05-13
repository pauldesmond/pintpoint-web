#!/usr/bin/env node
/**
 * generate-pubs-index.mjs
 *
 * Regenerates the venue list inside pubs/index.html from Supabase.
 * Picks the 20 most-recently-updated venues that have a photo, address,
 * city, and aren't closed. Writes the <li> block between the
 * <!-- PUBS-INDEX:START --> and <!-- PUBS-INDEX:END --> markers and
 * leaves the rest of the page untouched.
 *
 * Run nightly by .github/workflows/sitemap.yml.
 *
 * Usage:
 *   PINTPOINT_SUPABASE_URL=... PINTPOINT_SUPABASE_SERVICE_ROLE_KEY=... node generate-pubs-index.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, '..', 'pubs', 'index.html');
const FEATURED_PATH = join(__dirname, '..', '_data', 'featured-venues.json');
const START_MARKER = '<!-- PUBS-INDEX:START -->';
const END_MARKER = '<!-- PUBS-INDEX:END -->';
const ITEMLIST_START = '<!-- ITEMLIST:START -->';
const ITEMLIST_END = '<!-- ITEMLIST:END -->';
const FEATURED_LIMIT = 20;

const SUPABASE_URL = process.env.PINTPOINT_SUPABASE_URL;
const SERVICE_KEY  = process.env.PINTPOINT_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set PINTPOINT_SUPABASE_URL and PINTPOINT_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Mirrors supabase/functions/venue-page/index.ts so URLs match exactly.
function slugify(name) {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function cleanCityForSlug(raw) {
  return raw
    .replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '')
    .replace(/,\s*(UK|USA|GB|US)\s*$/i, '')
    .trim();
}
function canonicalSlug(v) {
  const nameSlug = slugify(v.name);
  const cleanedCity = v.city ? cleanCityForSlug(v.city) : '';
  const citySlug = cleanedCity ? slugify(cleanedCity) : '';
  return citySlug ? `${nameSlug}-${citySlug}` : nameSlug;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip postal-code fragments and country suffixes from a city string for
// display. Mirrors cleanCityForSlug but covers more patterns we see in the
// wild: US zips ("CA 95014"), European 5-digit ("18001 Granada"), Czech
// "110 00 Praha 1-Nové Město", UK postcodes ("Bridport DT6 3SY").
function cleanCityForDisplay(raw) {
  return String(raw ?? '')
    // UK postcode anywhere ("Bridport DT6 3SY" → "Bridport")
    .replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '')
    // US-style "CA 95014" prefix or suffix
    .replace(/\b[A-Z]{2}\s*\d{5}\b/g, '')
    // Czech-style "110 00 " prefix
    .replace(/^\d{3}\s*\d{2}\s+/, '')
    // Spanish-style "18001 " prefix
    .replace(/^\d{4,5}\s+/, '')
    // Trailing "Praha 1-Nové Město" → "Praha"
    .replace(/\s+\d+-.+$/, '')
    // Trailing country code
    .replace(/,\s*(UK|USA|GB|US)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// After cleaning, if the result is empty or still digit-led it's junk.
function cityLooksLikePostcode(city) {
  const cleaned = cleanCityForDisplay(city);
  return !cleaned || /^\d/.test(cleaned) || /^[A-Z]{2}$/.test(cleaned);
}

// Strip stale HTML entities Helen/users sometimes pasted into venue names
// (`North Park Beer Co &#45; Bankers Hill`, `&amp;` doubled etc).
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#45;/g, '-')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function pgrest(params) {
  const url = `${SUPABASE_URL}/rest/v1/venues?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
  return await res.json();
}

// Look up a hand-picked featured venue by exact name + city. We don't
// filter by closed_down here — featured picks can include pre-launch and
// even ghost venues if that's the editorial intent.
async function fetchFeaturedPick({ name, city }) {
  const params = new URLSearchParams({
    select: 'id,name,city,address,photo',
    deleted_at: 'is.null',
    name: `eq.${name}`,
    city: `eq.${city}`,
    limit: '1',
  });
  const rows = await pgrest(params);
  if (!rows.length) {
    console.warn(`  ⚠ featured pick not found: ${name} (${city})`);
    return null;
  }
  return rows[0];
}

// Auto-fill the remaining slots from the most-recently-updated venues
// that have full data and don't look like postcode-as-city junk.
async function fetchRecentVenues(excludeSlugs, limit) {
  const params = new URLSearchParams({
    select: 'id,name,city,address,photo,closed_down,updated_at',
    deleted_at: 'is.null',
    closed_down: 'eq.false',
    photo: 'not.is.null',
    city: 'not.is.null',
    address: 'not.is.null',
    order: 'updated_at.desc',
    limit: String(limit * 4), // overfetch — we'll drop postcode cities + featured dupes
  });
  const data = await pgrest(params);

  const seen = new Set(excludeSlugs);
  const out = [];
  for (const v of data ?? []) {
    if (cityLooksLikePostcode(v.city)) continue;
    const cleanName = decodeEntities(v.name);
    const slug = canonicalSlug({ ...v, name: cleanName });
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: cleanName, city: v.city });
    if (out.length >= limit) break;
  }
  return out;
}

// Hybrid list: featured hand-picks first, then auto-filled recent activity.
async function fetchVenues() {
  const featuredConfig = JSON.parse(readFileSync(FEATURED_PATH, 'utf8')).featured;

  console.log(`Resolving ${featuredConfig.length} featured picks...`);
  const featured = [];
  const seenSlugs = new Set();
  for (const pick of featuredConfig) {
    const row = await fetchFeaturedPick(pick);
    if (!row) continue;
    const cleanName = decodeEntities(row.name);
    const slug = canonicalSlug({ ...row, name: cleanName });
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    featured.push({ slug, name: cleanName, city: row.city });
  }

  const remaining = FEATURED_LIMIT - featured.length;
  console.log(`Auto-filling ${remaining} slots from recent activity...`);
  const recent = await fetchRecentVenues(seenSlugs, remaining);

  return [...featured, ...recent];
}

function renderListBlock(venues) {
  const rows = venues.map(v => {
    const cityLabel = cleanCityForDisplay(v.city);
    return `      <li><a href="${escapeHtml(v.slug)}" class="venue-link"><div><div class="venue-name">${escapeHtml(v.name)}</div><div class="venue-city">${escapeHtml(cityLabel)}</div></div><span class="venue-arrow">&rsaquo;</span></a></li>`;
  });
  return `${START_MARKER}\n${rows.join('\n')}\n      ${END_MARKER}`;
}

// JSON-LD ItemList — the top 6 venues (the hand-picked featured set).
// The whole <script type="application/ld+json"> ... </script> block is
// regenerated between ITEMLIST:START / ITEMLIST:END (which sit *outside*
// the script tag so they don't break JSON-LD parsing).
function renderItemListBlock(venues) {
  const items = venues.slice(0, 6).map((v, i) =>
    `      { "@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(v.name)}, "url": "https://pintpoint.co.uk/pubs/${v.slug}" }`
  );
  return `${ITEMLIST_START}\n  <script type="application/ld+json">\n  {\n    "@context": "https://schema.org",\n    "@type": "ItemList",\n    "name": "Sample PINtPOINT venue pages",\n    "itemListOrder": "https://schema.org/ItemListUnordered",\n    "itemListElement": [\n${items.join(',\n')}\n    ]\n  }\n  </script>\n  ${ITEMLIST_END}`;
}

function replaceBlock(html, startMarker, endMarker, newBlock) {
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    console.error(`ERROR: Markers ${startMarker} / ${endMarker} not found in pubs/index.html.`);
    process.exit(1);
  }
  return html.slice(0, startIdx) + newBlock + html.slice(endIdx + endMarker.length);
}

async function main() {
  const venues = await fetchVenues();
  console.log(`Final list (${venues.length} venues):`);
  for (const v of venues) console.log(`  ${v.slug}  ·  ${v.name} (${v.city})`);

  let html = readFileSync(INDEX_PATH, 'utf8');
  const orig = html;
  html = replaceBlock(html, START_MARKER, END_MARKER, renderListBlock(venues));
  if (html.indexOf(ITEMLIST_START) !== -1) {
    html = replaceBlock(html, ITEMLIST_START, ITEMLIST_END, renderItemListBlock(venues));
  } else {
    console.warn(`  ⚠ ${ITEMLIST_START} markers not found — JSON-LD ItemList not regenerated. Add markers around the existing itemListElement rows.`);
  }

  if (html === orig) {
    console.log('No changes needed — pubs/index.html already up to date.');
    return;
  }
  writeFileSync(INDEX_PATH, html);
  console.log('pubs/index.html regenerated.');
}

main().catch(e => { console.error(e); process.exit(1); });
