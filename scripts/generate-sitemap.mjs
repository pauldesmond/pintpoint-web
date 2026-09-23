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
  { loc: '/llms.txt', lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
  { loc: '/llms-full.txt', lastmod: TODAY, changefreq: 'weekly', priority: '0.85' },
  { loc: '/ai/counts.json', lastmod: TODAY, changefreq: 'daily', priority: '0.5' },
  { loc: '/download', lastmod: TODAY, changefreq: 'weekly', priority: '0.95' },
  { loc: '/pubs/', lastmod: TODAY, changefreq: 'weekly', priority: '0.95' },
  { loc: '/features.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.8' },
  { loc: '/screenshots.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.8' },
  { loc: '/ghost.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.7' },
  { loc: '/fpi.html', lastmod: '2026-04-13', changefreq: 'monthly', priority: '0.7' },
  { loc: '/vs-untappd.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.9' },
  { loc: '/vs-real-ale-finder.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.9' },
  { loc: '/how-to-find-beer-near-you.html', lastmod: TODAY, changefreq: 'monthly', priority: '0.95' },
  { loc: '/blog/', lastmod: TODAY, changefreq: 'weekly', priority: '0.9' },
  { loc: '/firkin/', lastmod: TODAY, changefreq: 'monthly', priority: '0.95' },
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

// A single dropped TLS connection used to cost the whole nightly run: on
// 2026-09-14 fetchVenues died mid-paging on ECONNRESET and the job exited
// before writing anything, so the sitemap silently stayed a day stale.
// Retry what is transient — a thrown network error, a 429, a 5xx — but
// never a 4xx, which is a real answer (bad key, bad query) that will not
// improve on the third attempt. Paging is ordered by id.asc with an
// explicit offset, so re-issuing one page is safe: no gaps, no dupes.
const FETCH_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function supabaseFetch(endpoint, extraHeaders = {}) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extraHeaders,
  };
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, { headers });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < FETCH_ATTEMPTS) {
      const backoff = 1000 * attempt + Math.floor(Math.random() * 500);
      console.warn(`[retry] ${endpoint.pathname} attempt ${attempt}/${FETCH_ATTEMPTS}: ${lastError.message} — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw new Error(`${endpoint.pathname} failed after ${FETCH_ATTEMPTS} attempts: ${lastError.message}`);
}

// Auto-scan /crawls/*.html — Hall-of-Fame crawl pages live as flat
// HTML files in the repo. Each file becomes a sitemap entry with its
// real mtime as lastmod. Saves having to manually update this script
// every time a new crawl ships.
async function listCrawlPages() {
  const { readdir, stat } = await import('node:fs/promises');
  const crawlsDir = new URL('../crawls/', import.meta.url);
  let entries;
  try {
    entries = await readdir(crawlsDir);
  } catch (e) {
    console.warn(`[crawls] readdir failed (${e.code}); skipping crawl-page section`);
    return [];
  }
  const out = [];
  for (const file of entries) {
    if (!file.endsWith('.html')) continue;
    if (file === 'index.html') continue; // would be /crawls/ already
    let mtime = TODAY;
    try {
      const s = await stat(new URL(file, crawlsDir));
      mtime = s.mtime.toISOString().slice(0, 10);
    } catch { /* fall through to TODAY */ }
    out.push({
      loc: `/crawls/${file}`,
      lastmod: mtime,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }
  return out;
}

// Auto-scan /blog/*.html — PINtPRESS posts are flat HTML files in the repo.
// This used to be a hand-maintained list in staticUrls, which silently fell
// two months behind and left 32 of 46 posts out of the sitemap entirely.
// lastmod comes from the post's own JSON-LD dateModified, so a correction
// to a published piece moves its lastmod without anyone remembering to.
const BLOG_PRIORITY = {
  // Live during the Oktoberfest season and edited most days — it took eight
  // additions on 22-23 September alone. The default 'monthly' told crawlers
  // not to come back, on the one page where "come back" is the whole point.
  // Drop this to 'monthly' once the season is over (after 7 November, when
  // the Alexandra Palace note's date has passed).
  'uk-oktoberfest-events-2026.html': ['daily', '0.95'],
  'beer-recommendation-systems-what-most-get-wrong.html': ['monthly', '0.85'],
  'chelmsford-beer-mile-guide.html': ['monthly', '0.9'],
  'san-diego-ipa-capital-love-letter.html': ['monthly', '0.9'],
  'richmond-ted-lasso-pub-trail.html': ['monthly', '0.9'],
  'hops-what-each-one-tastes-like.html': ['monthly', '0.95'],
  'melbourne-bar-culture-love-letter.html': ['monthly', '0.9'],
  'london-craft-beer-love-letter.html': ['monthly', '0.9'],
  '12-years-of-bosko.html': ['monthly', '0.85'],
  'blackhorse-beer-mile-4th-birthday.html': ['weekly', '0.95'],
  'radio-city-7-deadly-sins.html': ['weekly', '0.95'],
  'the-whippet-ec2-liverpool-street-opens.html': ['weekly', '0.95'],
  'the-sparkler-question.html': ['monthly', '0.85'],
  'mild-half-to-half-a-percent.html': ['monthly', '0.85'],
};

async function listBlogPages() {
  const { readdir, readFile } = await import('node:fs/promises');
  const blogDir = new URL('../blog/', import.meta.url);
  let entries;
  try {
    entries = await readdir(blogDir);
  } catch (e) {
    console.warn(`[blog] readdir failed (${e.code}); skipping blog-post section`);
    return [];
  }
  const out = [];
  for (const file of entries.sort()) {
    if (!file.endsWith('.html')) continue;
    if (file === 'index.html') continue; // already covered by /blog/
    if (file === 'older.html') continue; // archive index, linked from /blog/

    const fileUrl = new URL(file, blogDir);
    let html = '';
    try {
      html = await readFile(fileUrl, 'utf8');
    } catch (e) {
      console.warn(`[blog] ${file}: read failed (${e.code}); skipping`);
      continue;
    }
    // Never submit a page that asks not to be indexed.
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) {
      console.warn(`[blog] ${file}: noindex; skipping`);
      continue;
    }

    let lastmod = null;
    const modified = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    const published = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    lastmod = (modified && modified[1]) || (published && published[1]) || null;
    if (!lastmod) {
      // No JSON-LD dates on the post. mtime is checkout time in CI, so it
      // would report "changed today" every single night; omit lastmod
      // instead and say which post needs its schema block.
      console.warn(`[blog] ${file}: no JSON-LD date — lastmod omitted (post needs a BlogPosting schema block)`);
    }

    const [changefreq, priority] = BLOG_PRIORITY[file] || ['monthly', '0.85'];
    out.push({ loc: `/blog/${file}`, lastmod, changefreq, priority });
  }
  return out;
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

    const response = await supabaseFetch(endpoint);

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

    const response = await supabaseFetch(endpoint);

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

    const response = await supabaseFetch(endpoint);

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

// Exact row count for a table via PostgREST's count=exact header. Used to
// keep the AI-discovery layer's headline figures (venues, beers) honest:
// these drifted badly when hand-maintained (beers read "3,000+" against a
// real 17k catalogue), so the nightly build now writes them from source.
async function fetchExactCount(table, filters = {}) {
  const endpoint = new URL(`/rest/v1/${table}`, supabaseUrl);
  endpoint.searchParams.set('select', 'id');
  for (const [k, v] of Object.entries(filters)) endpoint.searchParams.set(k, v);
  const response = await supabaseFetch(endpoint, { Prefer: 'count=exact', Range: '0-0' });
  if (!response.ok && response.status !== 206) {
    const body = await response.text();
    throw new Error(`Supabase ${table} count failed: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  // content-range: "0-0/1776"
  const cr = response.headers.get('content-range') || '';
  const total = Number(cr.split('/')[1]);
  if (!Number.isFinite(total)) throw new Error(`Could not parse ${table} count from content-range "${cr}"`);
  return total;
}

function renderUrl({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc.startsWith('http') ? loc : `${SITE_URL}${loc}`)}</loc>`,
    ...(lastmod ? [`    <lastmod>${xmlEscape(lastmod)}</lastmod>`] : []),
    `    <changefreq>${xmlEscape(changefreq)}</changefreq>`,
    `    <priority>${xmlEscape(priority)}</priority>`,
    '  </url>',
  ].join('\n');
}

const [venues, liveTapCounts, curatedGhosts, crawlPages, blogPages, beerCount] = await Promise.all([
  fetchVenues(),
  fetchLiveTapCountsByVenue(),
  fetchCuratedGhosts(),
  listCrawlPages(),
  listBlogPages(),
  fetchExactCount('beers'),
]);
const totalVenues = venues.length;

// Machine-readable headline figures, regenerated nightly from source so the
// AI-discovery layer (llms.txt, ai/*.json) can be reconciled against ground
// truth instead of drifting. venues_live + beers are counted here; countries
// is stable and stays hand-maintained in the prose files.
//   NOTE: this writes the canonical numbers; the prose files are not yet
//   auto-rewritten from it. If counts.json and the prose disagree, counts.json
//   is right and the prose is stale — reconcile the prose (or wire an
//   auto-rewrite step) when the gap is material.
await import('node:fs/promises').then(({ writeFile }) => writeFile(
  new URL('../ai/counts.json', import.meta.url),
  JSON.stringify({
    venues_live: totalVenues,
    beers: beerCount,
    generated_at: TODAY,
    source: 'nightly Supabase count via scripts/generate-sitemap.mjs',
  }, null, 2) + '\n',
));
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
const urls = [...staticUrls, ...crawlPages, ...blogPages, ...venueUrls, ...ghostUrls].filter((url) => {
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

console.log(`Generated sitemap.xml with ${staticUrls.length} static URL(s), ${crawlPages.length} crawl-page URL(s), ${blogPages.length} blog-post URL(s), ${venueUrls.length} live-venue URL(s), and ${ghostUrls.length} curated ghost URL(s).`);
console.log(`Excluded ${totalVenues - indexableVenues.length} live venue(s) with fewer than ${MIN_LIVE_BEERS} live taps in the last ${TAP_FRESHNESS_DAYS} days (of ${totalVenues} total).`);
const venueUrlInputTotal = venueUrls.length + ghostUrls.length;
if (uniqueVenueUrlCount !== venueUrlInputTotal) {
  console.log(`Skipped ${venueUrlInputTotal - uniqueVenueUrlCount} duplicate canonical venue slug(s).`);
}
