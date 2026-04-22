#!/usr/bin/env node

const SITE_URL = 'https://pintpoint.co.uk';
const TODAY = new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 1000;

const supabaseUrl = process.env.PINTPOINT_SUPABASE_URL;
const serviceRoleKey = process.env.PINTPOINT_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing PINTPOINT_SUPABASE_URL or PINTPOINT_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const staticUrls = [
  { loc: '/', lastmod: TODAY, changefreq: 'weekly', priority: '1.0' },
  { loc: '/download', lastmod: TODAY, changefreq: 'weekly', priority: '0.95' },
  { loc: '/pubs/', lastmod: TODAY, changefreq: 'weekly', priority: '0.95' },
  { loc: '/features.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.8' },
  { loc: '/screenshots.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.8' },
  { loc: '/ghost.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.7' },
  { loc: '/fpi.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.7' },
  { loc: '/vs-untappd.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.9' },
  { loc: '/vs-real-ale-finder.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.9' },
  { loc: '/how-to-find-beer-near-you.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.95' },
  { loc: '/blog/', lastmod: '2026-04-19', changefreq: 'weekly', priority: '0.9' },
  { loc: '/blog/beer-recommendation-systems-what-most-get-wrong.html', lastmod: '2026-04-20', changefreq: 'monthly', priority: '0.85' },
  { loc: '/blog/chelmsford-beer-mile-guide.html', lastmod: '2026-04-05', changefreq: 'monthly', priority: '0.9' },
  { loc: '/blog/san-diego-ipa-capital-love-letter.html', lastmod: '2026-04-20', changefreq: 'monthly', priority: '0.9' },
  { loc: '/blog/richmond-london-goes-live.html', lastmod: '2026-04-19', changefreq: 'monthly', priority: '0.7' },
  { loc: '/blog/hops-what-each-one-tastes-like.html', lastmod: '2026-04-12', changefreq: 'monthly', priority: '0.95' },
  { loc: '/blog/melbourne-bar-culture-love-letter.html', lastmod: '2026-04-20', changefreq: 'monthly', priority: '0.9' },
  { loc: '/blog/london-craft-beer-love-letter.html', lastmod: '2026-04-20', changefreq: 'monthly', priority: '0.9' },
  { loc: '/privacy-policy.html', lastmod: TODAY, changefreq: 'yearly', priority: '0.3' },
  { loc: '/about-pintpoint.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.8' },
  { loc: '/faq.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.7' },
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanCityForSlug(value) {
  return String(value || '')
    .replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '')
    .replace(/,\s*(UK|USA|GB|US)\s*$/i, '')
    .trim();
}

function canonicalSlug(venue) {
  const name = slugify(venue.name);
  const city = slugify(cleanCityForSlug(venue.city));
  return city ? `${name}-${city}` : name;
}

function isoDate(value) {
  if (!value) return TODAY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return TODAY;
  return date.toISOString().slice(0, 10);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchVenues() {
  const venues = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = new URL('/rest/v1/venues', supabaseUrl);
    endpoint.searchParams.set('select', 'id,name,city,updated_at,last_scraped_at');
    endpoint.searchParams.set('deleted_at', 'is.null');
    endpoint.searchParams.set('closed_down', 'eq.false');
    endpoint.searchParams.set('order', 'id.asc');
    endpoint.searchParams.set('limit', String(PAGE_SIZE));
    endpoint.searchParams.set('offset', String(offset));

    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase venues fetch failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    }

    const page = await response.json();
    venues.push(...page);
    if (page.length < PAGE_SIZE) return venues;
  }
}

// Curated ghost venues = those with substantive human-touched content.
// Matches the noindex gate in the venue-page edge function exactly:
// historical_note ≥ 200 chars, OR a historical photo, OR a final pour.
// Auto-imported thin ghosts stay out of the sitemap until someone
// upgrades them.
async function fetchCuratedGhosts() {
  const ghosts = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = new URL('/rest/v1/venues', supabaseUrl);
    endpoint.searchParams.set('select', 'id,name,city,updated_at,historical_note,historical_photos,last_pour_beer,last_pour_date');
    endpoint.searchParams.set('deleted_at', 'is.null');
    endpoint.searchParams.set('closed_down', 'eq.true');
    endpoint.searchParams.set('order', 'id.asc');
    endpoint.searchParams.set('limit', String(PAGE_SIZE));
    endpoint.searchParams.set('offset', String(offset));

    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase ghosts fetch failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    }

    const page = await response.json();
    const curated = page.filter((v) => {
      const noteLen = (v.historical_note || '').trim().length;
      const hasHist = Array.isArray(v.historical_photos) && v.historical_photos.some(p => p && p.url);
      const hasFinalPour = !!(v.last_pour_beer && v.last_pour_date);
      return noteLen >= 200 || hasHist || hasFinalPour;
    });
    ghosts.push(...curated);
    if (page.length < PAGE_SIZE) return ghosts;
  }
}

// Sitemap inclusion = "has live tap data right now". A venue qualifies
// if it has at least MIN_LIVE_BEERS confirmed tap_list rows whose
// last_seen is within TAP_FRESHNESS_DAYS. Beats the old
// last_scraped_at heuristic: a venue can be freshly scraped and still
// empty, and a venue with live taps but a slightly stale scrape timestamp
// shouldn't be penalised. Stricter signal = stronger SEO quality.
const TAP_FRESHNESS_DAYS = 30;
const MIN_LIVE_BEERS = 3;

// Build a Map<venue_id, liveBeerCount> by paginating tap_list and
// counting client-side. PostgREST doesn't offer a simple group-by-count
// over REST, so we pull the rows we need and aggregate here — still
// fast because we project only venue_id.
async function fetchLiveTapCountsByVenue() {
  const cutoff = new Date(Date.now() - TAP_FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const counts = new Map();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const endpoint = new URL('/rest/v1/tap_list', supabaseUrl);
    endpoint.searchParams.set('select', 'venue_id');
    endpoint.searchParams.set('confirmed', 'eq.true');
    endpoint.searchParams.set('last_seen', `gte.${cutoff}`);
    endpoint.searchParams.set('venue_id', 'not.is.null');
    endpoint.searchParams.set('order', 'venue_id.asc');
    endpoint.searchParams.set('limit', String(PAGE_SIZE));
    endpoint.searchParams.set('offset', String(offset));

    const response = await fetch(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase tap_list fetch failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    }

    const page = await response.json();
    for (const row of page) {
      if (row.venue_id == null) continue;
      counts.set(row.venue_id, (counts.get(row.venue_id) ?? 0) + 1);
    }
    if (page.length < PAGE_SIZE) return counts;
  }
}

function renderUrl({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc.startsWith('http') ? loc : `${SITE_URL}${loc}`)}</loc>`,
    `    <lastmod>${xmlEscape(lastmod)}</lastmod>`,
    `    <changefreq>${xmlEscape(changefreq)}</changefreq>`,
    `    <priority>${xmlEscape(priority)}</priority>`,
    '  </url>',
  ].join('\n');
}

const [venues, liveTapCounts, curatedGhosts] = await Promise.all([
  fetchVenues(),
  fetchLiveTapCountsByVenue(),
  fetchCuratedGhosts(),
]);
const totalVenues = venues.length;
const indexableVenues = venues.filter(v => (liveTapCounts.get(v.id) ?? 0) >= MIN_LIVE_BEERS);
const venueUrls = indexableVenues
  .map((venue) => {
    const slug = canonicalSlug(venue);
    if (!slug) return null;
    return {
      loc: `/pubs/${slug}`,
      lastmod: isoDate(venue.updated_at || venue.last_scraped_at),
      changefreq: 'weekly',
      priority: '0.6',
    };
  })
  .filter(Boolean);

const ghostUrls = curatedGhosts
  .map((venue) => {
    const slug = canonicalSlug(venue);
    if (!slug) return null;
    return {
      loc: `/pubs/${slug}`,
      lastmod: isoDate(venue.updated_at),
      changefreq: 'monthly', // ghost pages rarely change once curated
      priority: '0.5',
    };
  })
  .filter(Boolean);

const seen = new Set();
const urls = [...staticUrls, ...venueUrls, ...ghostUrls].filter((url) => {
  const loc = url.loc.startsWith('http') ? url.loc : `${SITE_URL}${url.loc}`;
  if (seen.has(loc)) return false;
  seen.add(loc);
  return true;
});
const uniqueVenueUrlCount = urls.filter((url) => url.loc.startsWith('/pubs/') && url.loc !== '/pubs/').length;

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(renderUrl),
  '</urlset>',
  '',
].join('\n');

await import('node:fs/promises').then(({ writeFile }) => writeFile(new URL('../sitemap.xml', import.meta.url), sitemap));

console.log(`Generated sitemap.xml with ${staticUrls.length} static URL(s), ${venueUrls.length} live-venue URL(s), and ${ghostUrls.length} curated ghost URL(s).`);
console.log(`Excluded ${totalVenues - indexableVenues.length} live venue(s) with fewer than ${MIN_LIVE_BEERS} live taps in the last ${TAP_FRESHNESS_DAYS} days (of ${totalVenues} total).`);
const venueUrlInputTotal = venueUrls.length + ghostUrls.length;
if (uniqueVenueUrlCount !== venueUrlInputTotal) {
  console.log(`Skipped ${venueUrlInputTotal - uniqueVenueUrlCount} duplicate canonical venue slug(s).`);
}
