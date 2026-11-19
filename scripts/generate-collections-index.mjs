#!/usr/bin/env node

// collections/index.html was hand-written on 19 November 2026 and had drifted by
// the same afternoon: it carried a description the collection no longer used and
// a venue count four short. The cards are data, so they are generated here.
//
// The count and the area count have to follow the SAME rule the renderer uses, or
// the index will disagree with the page it links to. A region marked featured is
// never drawn as a block; it only supplies the ids behind the featured toggle, and
// its ids are repeated in the regions that are drawn. So: areas are the regions
// that are not featured, and the venue count is the number of DISTINCT ids across
// those regions. Counting every id in every region double counts the featured ones.
//
// Order is published_at descending, newest first, which is how the page was built
// by hand and means a new collection lands at the top without anyone deciding.

import { readFileSync, writeFileSync } from 'node:fs';

const supabaseUrl = process.env.PINTPOINT_SUPABASE_URL;
const serviceRoleKey = process.env.PINTPOINT_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing PINTPOINT_SUPABASE_URL or PINTPOINT_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const START = '<!-- COLLECTIONS-CARDS:START -->';
const END = '<!-- COLLECTIONS-CARDS:END -->';
const target = new URL('../collections/index.html', import.meta.url);

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

async function fetchCollections() {
  const endpoint = new URL(`${supabaseUrl}/rest/v1/collections`);
  endpoint.searchParams.set('select', 'slug,title,description,regions,noindex,published_at');
  endpoint.searchParams.set('order', 'published_at.desc');
  const resp = await fetch(endpoint, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!resp.ok) throw new Error(`collections: ${resp.status} ${await resp.text()}`);
  return (await resp.json()).filter((c) => c.published_at && c.noindex !== true);
}

function card(c) {
  const areas = (c.regions ?? []).filter((r) => r.featured !== true);
  const venues = new Set(areas.flatMap((r) => r.venue_ids ?? []));
  return [
    `        <a class="col-card" href="/collections/${c.slug}">`,
    `          <h2>${esc(c.title)}</h2>`,
    `          <p class="col-desc">${esc(c.description)}</p>`,
    `          <p class="col-meta"><span class="count">${venues.size}</span> venues &middot; ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}</p>`,
    '          <span class="col-go">Open the collection &rarr;</span>',
    '        </a>',
  ].join('\n');
}

const collections = await fetchCollections();
if (collections.length < 8) {
  console.error(`Only ${collections.length} published collections; refusing to rewrite the index.`);
  process.exit(1);
}

const html = readFileSync(target, 'utf8');
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1 || to < from) {
  console.error(`Markers ${START} / ${END} not found in collections/index.html`);
  process.exit(1);
}

const next =
  html.slice(0, from + START.length) +
  '\n' +
  collections.map(card).join('\n') +
  '\n        ' +
  html.slice(to);

if (next === html) {
  console.log(`collections index: ${collections.length} cards, no change`);
} else {
  writeFileSync(target, next);
  console.log(`collections index: ${collections.length} cards written`);
}

for (const c of collections) {
  const areas = (c.regions ?? []).filter((r) => r.featured !== true);
  const venues = new Set(areas.flatMap((r) => r.venue_ids ?? []));
  console.log(`  ${c.slug.padEnd(26)} ${String(venues.size).padStart(3)} venues  ${areas.length} areas`);
}
