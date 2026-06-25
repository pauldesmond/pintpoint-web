#!/usr/bin/env node
/**
 * generate-pubs-index.mjs
 *
 * Regenerates the venue list inside pubs/index.html from Supabase. The list
 * is 20 venues, structured as three tiers, all date-seeded so the page is
 * stable within a day but rotates between days:
 *
 *   1. STABLE        — 3 hand-picked flagship venues, always visible, fixed order.
 *                      Editorial trust: anyone landing on the page sees these.
 *   2. ROTATING      — 3 venues drawn daily from _data/featured-venues.json's
 *                      rotation_pool[], using a deterministic shuffle keyed on
 *                      today's date. Grow rotation_pool to expand variety.
 *   3. AUTO-FILL     — 14 venues from Supabase, shuffled from the 40 most-
 *                      recently-updated venues with full data (photo, city,
 *                      address) and not closed. Date-seeded shuffle gives each
 *                      eligible venue a ~35% chance of being visible any given
 *                      day, instead of the strict top-14 cycle that previously
 *                      caused the same handful to recur or skip frequently.
 *
 * Writes the <li> block between the PUBS-INDEX markers; the JSON-LD ItemList
 * between the ITEMLIST markers reflects the top 6 visible (stable+rotating).
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
const TOTAL_SLOTS = 20;
const ROTATING_FEATURED_SLOTS = 3;          // drawn daily from rotation_pool
const AUTO_FILL_POOL_SIZE = 40;              // overfetch this many from Supabase, then shuffle

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

// Date-seeded deterministic PRNG (Mulberry32). Same date → same shuffle, so
// the page stays stable within a day no matter how many times the script
// runs. Different date → different shuffle, naturally.
function dateSeed(d = new Date()) {
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

// Build the eligible pool from the most-recently-updated venues with full
// data. Returns POOL_SIZE candidates (post-filter); the caller shuffles
// from this pool and takes `limit`. Overfetch heavily because Supabase's
// strict updated_at ordering would otherwise collapse to the same handful
// of frequently-scraped venues night after night.
async function fetchRecentVenuePool(excludeSlugs, poolSize) {
  const params = new URLSearchParams({
    select: 'id,name,city,address,photo,closed_down,updated_at',
    deleted_at: 'is.null',
    closed_down: 'eq.false',
    photo: 'not.is.null',
    city: 'not.is.null',
    address: 'not.is.null',
    order: 'updated_at.desc',
    limit: String(poolSize * 3), // overfetch — discards: postcode-cities, featured dupes, duplicate slugs
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
    if (out.length >= poolSize) break;
  }
  return out;
}

// Three-tier list: stable hand-picks (always shown), daily-rotated picks from
// rotation_pool, then date-shuffled auto-fill from recently-updated venues.
async function fetchVenues() {
  const config = JSON.parse(readFileSync(FEATURED_PATH, 'utf8'));
  const stableConfig = config.stable ?? [];
  const poolConfig = config.rotation_pool ?? [];

  const seed = dateSeed();
  const rng = mulberry32(seed);
  console.log(`Date seed: ${seed} (${new Date().toISOString().slice(0,10)})`);

  // Tier 1: stable picks, always shown in defined order.
  console.log(`Resolving ${stableConfig.length} stable picks (always visible)...`);
  const stable = [];
  const seenSlugs = new Set();
  for (const pick of stableConfig) {
    const row = await fetchFeaturedPick(pick);
    if (!row) continue;
    const cleanName = decodeEntities(row.name);
    const slug = canonicalSlug({ ...row, name: cleanName });
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    stable.push({ slug, name: cleanName, city: row.city });
  }

  // Tier 2: rotating featured. Resolve the whole pool, then date-shuffle and
  // pick ROTATING_FEATURED_SLOTS. Picks visibly absent from the pool log a warn.
  console.log(`Resolving ${poolConfig.length} rotation_pool entries...`);
  const resolvedPool = [];
  for (const pick of poolConfig) {
    const row = await fetchFeaturedPick(pick);
    if (!row) continue;
    const cleanName = decodeEntities(row.name);
    const slug = canonicalSlug({ ...row, name: cleanName });
    if (seenSlugs.has(slug)) continue;
    resolvedPool.push({ slug, name: cleanName, city: row.city });
  }
  const shuffledPool = seededShuffle(resolvedPool, rng);
  const rotated = shuffledPool.slice(0, ROTATING_FEATURED_SLOTS);
  for (const v of rotated) seenSlugs.add(v.slug);
  console.log(`  Picked ${rotated.length}/${ROTATING_FEATURED_SLOTS} rotating from ${resolvedPool.length}-strong pool: ${rotated.map(v => v.slug).join(', ')}`);

  // Tier 3: auto-fill. Fetch a wider pool from Supabase, date-shuffle, take
  // however many slots remain.
  const remaining = TOTAL_SLOTS - stable.length - rotated.length;
  console.log(`Auto-filling ${remaining} slots from a ${AUTO_FILL_POOL_SIZE}-venue pool (shuffled by date seed)...`);
  const autoPool = await fetchRecentVenuePool(seenSlugs, AUTO_FILL_POOL_SIZE);
  const autoShuffled = seededShuffle(autoPool, rng);
  const autoPicks = autoShuffled.slice(0, remaining);
  console.log(`  Picked ${autoPicks.length}/${remaining} auto-fill from ${autoPool.length}-strong pool`);

  return [...stable, ...rotated, ...autoPicks];
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
