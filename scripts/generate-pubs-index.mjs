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
const START_MARKER = '<!-- PUBS-INDEX:START -->';
const END_MARKER = '<!-- PUBS-INDEX:END -->';
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

async function fetchFeaturedVenues() {
  // Raw PostgREST query — no @supabase/supabase-js dependency, matches
  // the pattern in generate-sitemap.mjs.
  const params = new URLSearchParams({
    select: 'id,name,city,address,photo,closed_down,updated_at',
    deleted_at: 'is.null',
    closed_down: 'eq.false',
    photo: 'not.is.null',
    city: 'not.is.null',
    address: 'not.is.null',
    order: 'updated_at.desc',
    limit: String(FEATURED_LIMIT * 3), // overfetch; we'll dedupe
  });
  const url = `${SUPABASE_URL}/rest/v1/venues?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // Dedupe by canonical slug — different rows can resolve to the same URL
  // (the venue-page edge function resolves collisions, but the index list
  // shouldn't show two of the same).
  const seen = new Set();
  const out = [];
  for (const v of data ?? []) {
    const slug = canonicalSlug(v);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: v.name, city: v.city });
    if (out.length >= FEATURED_LIMIT) break;
  }
  return out;
}

function renderListBlock(venues) {
  const rows = venues.map(v => {
    const cityLabel = (v.city ?? '').replace(/\s*,?\s*(UK|USA|GB|US)\s*$/i, '').trim();
    return `      <li><a href="${escapeHtml(v.slug)}" class="venue-link"><div><div class="venue-name">${escapeHtml(v.name)}</div><div class="venue-city">${escapeHtml(cityLabel)}</div></div><span class="venue-arrow">&rsaquo;</span></a></li>`;
  });
  return `${START_MARKER}\n${rows.join('\n')}\n      ${END_MARKER}`;
}

async function main() {
  console.log('Fetching featured venues from Supabase...');
  const venues = await fetchFeaturedVenues();
  console.log(`Picked ${venues.length} venues:`);
  for (const v of venues) console.log(`  ${v.slug}  ·  ${v.name} (${v.city})`);

  let html = readFileSync(INDEX_PATH, 'utf8');
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    console.error(`ERROR: Markers ${START_MARKER} / ${END_MARKER} not found in pubs/index.html.`);
    console.error('Add them around the venue-list <li> rows before running this script.');
    process.exit(1);
  }
  const newBlock = renderListBlock(venues);
  const updated = html.slice(0, startIdx) + newBlock + html.slice(endIdx + END_MARKER.length);

  if (updated === html) {
    console.log('No changes needed — pubs/index.html already up to date.');
    return;
  }
  writeFileSync(INDEX_PATH, updated);
  console.log('pubs/index.html regenerated.');
}

main().catch(e => { console.error(e); process.exit(1); });
