#!/usr/bin/env node
/**
 * Build per-stadium venue pages for the Beer World Cup XI Stadium Map.
 * One HTML page per host stadium, listing nearby PINtPOINT venues sorted
 * by straight-line distance from the stadium. Pages live at
 * /blog/world-cup-venues/<slug>.html and link to /pubs/<slug> for each
 * venue.
 *
 * Run: node --env-file=/Users/pauldesmond/rork-pintpoint/expo/.env \
 *           scripts/build-stadium-venue-pages.mjs
 *
 * Outputs HTML files into blog/world-cup-venues/ + an index.html listing
 * all 16 stadiums. Per-page distance radius default: 15 km / ~9 mi.
 * Above that the matchday-walkable signal collapses.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const URL = process.env.PINTPOINT_SUPABASE_URL ?? 'https://rvokskoevmcekkgiglpa.supabase.co';
const KEY = process.env.PINTPOINT_SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('Set PINTPOINT_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'blog', 'world-cup-venues');
const RADIUS_KM = 15;
const MAX_VENUES = 40;

// 16 host stadiums, well-known coordinates verified against FIFA's published
// venue addresses. country is for filter parity with the Stadium Map page.
const STADIUMS = [
  // USA
  { slug: 'atlanta',                country: 'us', city: 'Atlanta',                                stadium: 'Mercedes-Benz Stadium',         lat: 33.7553,  lng: -84.4006,  country_label: 'USA' },
  { slug: 'boston-foxborough',      country: 'us', city: 'Boston / Foxborough',                   stadium: 'Gillette Stadium',              lat: 42.0909,  lng: -71.2643,  country_label: 'USA' },
  { slug: 'dallas-arlington',       country: 'us', city: 'Dallas / Arlington',                    stadium: 'AT&T Stadium',                  lat: 32.7473,  lng: -97.0945,  country_label: 'USA' },
  { slug: 'houston',                country: 'us', city: 'Houston',                                stadium: 'NRG Stadium',                   lat: 29.6847,  lng: -95.4107,  country_label: 'USA' },
  { slug: 'kansas-city',            country: 'us', city: 'Kansas City',                            stadium: 'Arrowhead Stadium',             lat: 39.0489,  lng: -94.4839,  country_label: 'USA' },
  { slug: 'los-angeles-inglewood',  country: 'us', city: 'Los Angeles / Inglewood',                stadium: 'SoFi Stadium',                  lat: 33.9534,  lng: -118.3387, country_label: 'USA' },
  { slug: 'miami-gardens',          country: 'us', city: 'Miami Gardens',                          stadium: 'Hard Rock Stadium',             lat: 25.9580,  lng: -80.2389,  country_label: 'USA' },
  { slug: 'new-york-new-jersey',    country: 'us', city: 'New York / New Jersey',                  stadium: 'MetLife Stadium · East Rutherford', lat: 40.8135, lng: -74.0745, country_label: 'USA' },
  { slug: 'philadelphia',           country: 'us', city: 'Philadelphia',                           stadium: 'Lincoln Financial Field',       lat: 39.9008,  lng: -75.1675,  country_label: 'USA' },
  { slug: 'san-francisco-bay',      country: 'us', city: 'San Francisco Bay / Santa Clara',        stadium: "Levi's Stadium",                lat: 37.4030,  lng: -121.9698, country_label: 'USA' },
  { slug: 'seattle',                country: 'us', city: 'Seattle',                                stadium: 'Lumen Field',                   lat: 47.5952,  lng: -122.3316, country_label: 'USA' },
  // Canada
  { slug: 'toronto',                country: 'ca', city: 'Toronto',                                stadium: 'BMO Field',                     lat: 43.6332,  lng: -79.4185,  country_label: 'CAN' },
  { slug: 'vancouver',              country: 'ca', city: 'Vancouver',                              stadium: 'BC Place',                      lat: 49.2768,  lng: -123.1117, country_label: 'CAN' },
  // Mexico
  { slug: 'guadalajara',            country: 'mx', city: 'Guadalajara',                            stadium: 'Estadio Akron',                 lat: 20.6816,  lng: -103.4623, country_label: 'MEX' },
  { slug: 'mexico-city',            country: 'mx', city: 'Mexico City',                            stadium: 'Estadio Azteca',                lat: 19.3029,  lng: -99.1505,  country_label: 'MEX' },
  { slug: 'monterrey',              country: 'mx', city: 'Monterrey',                              stadium: 'Estadio BBVA',                  lat: 25.6692,  lng: -100.2444, country_label: 'MEX' },
];

// --- Haversine: distance in km between two lat/lng points ---------------
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtDistance(km) {
  // Imperial. Feet only when genuinely on the doorstep (<0.1 mi = ~528 ft);
  // miles with one decimal everywhere else. Avoids both "0.5k ft" (the
  // spreadsheet-y form) and "3900 ft" (technically correct, but nobody
  // talks like that).
  const mi = km * 0.6213711922;
  if (mi < 0.1) {
    const ft = Math.round((mi * 5280) / 10) * 10;  // round to nearest 10 ft
    return `${ft} ft`;
  }
  return `${mi.toFixed(1)} mi`;
}

function fmtDistanceMetric(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// --- Fetch active venues within a bounding-box around the stadium -------
async function fetchNearbyVenues(stadium) {
  // Bounding box: ~RADIUS_KM degrees converted (rough; latitude conversion
  // 1° ≈ 111 km, longitude varies with latitude). Over-fetch then Haversine-
  // filter to true radius.
  const degLat = (RADIUS_KM + 5) / 111;
  const degLng = (RADIUS_KM + 5) / (111 * Math.cos((stadium.lat * Math.PI) / 180));
  const minLat = stadium.lat - degLat, maxLat = stadium.lat + degLat;
  const minLng = stadium.lng - degLng, maxLng = stadium.lng + degLng;

  const u = `${URL}/rest/v1/venues?select=id,name,address,neighborhood,city,latitude,longitude,untappd_slug,untappd_id,photo,closed_down,demolished,tags&latitude=gte.${minLat}&latitude=lte.${maxLat}&longitude=gte.${minLng}&longitude=lte.${maxLng}&closed_down=eq.false&demolished=eq.false&limit=500`;
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`venue fetch ${r.status}: ${await r.text()}`);
  const venues = await r.json();

  // True-radius Haversine filter + sort by distance
  return venues
    .map((v) => ({ ...v, distance_km: haversineKm(stadium.lat, stadium.lng, v.latitude, v.longitude) }))
    .filter((v) => v.distance_km <= RADIUS_KM)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, MAX_VENUES);
}

// --- /pubs/<slug> URL convention ----------------------------------------
// Mirrors scripts/generate-sitemap.mjs:slugify / cleanCityForSlug /
// canonicalSlug exactly. The static venue pages on pintpoint.co.uk are
// built by that algorithm; using anything else (including untappd_slug)
// produces 404s.
function slugifyForUrl(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function cleanCityForSlug(value) {
  return String(value || '')
    .replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, '')  // UK postcode
    .replace(/,\s*(UK|USA|GB|US)\s*$/i, '')
    .trim();
}
function venueSlug(v) {
  const name = slugifyForUrl(v.name);
  const city = slugifyForUrl(cleanCityForSlug(v.city));
  return city ? `${name}-${city}` : name;
}

// Probe the live /pubs/<slug> edge function for a venue's canonical slug.
// The site serves venue pages dynamically via a Supabase edge function,
// not as static HTML, so the sitemap is NOT the authority — the edge
// function will render any venue that's in the DB. But the edge function
// returns the "venue not found" page (HTTP 200, no <title>) when the slug
// it computes from the DB doesn't match what we're sending. So we probe.
async function probeVenueSlug(slug) {
  try {
    const r = await fetch(`https://pintpoint.co.uk/pubs/${slug}`);
    if (!r.ok) return false;
    const body = await r.text();
    // "Live Tap List" appears in the title of every successfully-rendered
    // venue page. The 404 page has no title.
    return body.includes('— Live Tap List | PINtPOINT');
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderVenueCard(v, stadium) {
  const dist = fmtDistance(v.distance_km);
  const distM = fmtDistanceMetric(v.distance_km);
  const slug = venueSlug(v);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${stadium.lat},${stadium.lng}&destination=${v.latitude},${v.longitude}&travelmode=walking`;
  return `
        <article class="bwc-venue-row">
          <div class="bwc-venue-row-meta">
            <a class="bwc-venue-row-name" href="/pubs/${escapeHtml(slug)}">${escapeHtml(v.name)}</a>
            <div class="bwc-venue-row-sub">${escapeHtml(v.neighborhood ?? '')}${v.neighborhood && v.address ? ' · ' : ''}${escapeHtml(v.address ?? '')}</div>
          </div>
          <div class="bwc-venue-row-dist">
            <span class="d-mi">${dist}</span>
            <span class="d-km">${distM}</span>
            <a class="d-walk" href="${mapsUrl}" target="_blank" rel="noopener">Walk →</a>
          </div>
        </article>`;
}

function renderStadiumPage(stadium, venues) {
  const counter = `${venues.length} venue${venues.length === 1 ? '' : 's'} within ${RADIUS_KM} km`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="apple-itunes-app" content="app-id=6760611613">
  <title>Beer near ${escapeHtml(stadium.stadium)} (${escapeHtml(stadium.city)}) — World Cup 2026 Stadium Beer Map · PINtPOINT</title>
  <meta name="description" content="${counter} near ${escapeHtml(stadium.stadium)}, host of the 2026 FIFA World Cup in ${escapeHtml(stadium.city)}. Bars, pubs, breweries, taprooms and bottle shops sorted by straight-line distance from the ground." />
  <meta name="robots" content="index,follow" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="canonical" href="https://pintpoint.co.uk/blog/world-cup-venues/${stadium.slug}.html" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://pintpoint.co.uk/blog/world-cup-venues/${stadium.slug}.html" />
  <meta property="og:title" content="Beer near ${escapeHtml(stadium.stadium)} (${escapeHtml(stadium.city)})" />
  <meta property="og:description" content="${counter} sorted by straight-line distance from the ground." />
  <meta property="og:image" content="https://pintpoint.co.uk/blog/images/stadium-beer-map-infographic-v1.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://pintpoint.co.uk/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://pintpoint.co.uk/blog/" },
      { "@type": "ListItem", "position": 3, "name": "World Cup 2026 Stadium Beer Map", "item": "https://pintpoint.co.uk/blog/world-cup-stadium-beer-map.html" },
      { "@type": "ListItem", "position": 4, "name": "${escapeHtml(stadium.city)}" }
    ]
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../bwc.css?v=9" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0d1117; --teal: #00D4AA; --text: #ffffff; --muted: #8b949e; --card: #161b22; --border: rgba(255,255,255,0.08); --amber: #C0A340; }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }
    nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 40px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .logo { font-size: 1.3rem; font-weight: 900; letter-spacing: -0.5px; }
    .logo span { color: var(--teal); }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.9rem; }
    nav a:hover { color: var(--text); }
    .content { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); font-weight: 900; letter-spacing: -1px; line-height: 1.18; margin-bottom: 8px; }
    h1 em { color: var(--teal); font-style: normal; }
    .subtitle { font-size: clamp(1.0rem, 2vw, 1.15rem); font-weight: 600; color: var(--muted); letter-spacing: -0.2px; line-height: 1.4; margin-bottom: 22px; }
    p { font-size: 0.97rem; color: var(--muted); line-height: 1.7; margin-bottom: 14px; }
    article a, article a:visited { color: var(--teal); }
    .meta { font-size: 0.8rem; color: #666; margin-bottom: 28px; letter-spacing: 0.3px; }
    .category { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; margin-right: 8px; color: var(--amber); border: 1px solid rgba(192,163,64,0.4); }
    .breadcrumb { font-size: 0.78rem; color: var(--muted); margin-bottom: 18px; }
    .breadcrumb a { color: var(--muted); text-decoration: none; }
    .breadcrumb a:hover { color: var(--teal); }
    /* Per-stadium venue row */
    .bwc-venue-list { margin: 22px 0; }
    .bwc-venue-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; }
    .bwc-venue-row:hover { border-color: var(--teal); }
    .bwc-venue-row-meta { flex: 1 1 auto; min-width: 0; }
    .bwc-venue-row-name { display: block; font-weight: 800; font-size: 1.0rem; color: var(--text); letter-spacing: -0.2px; text-decoration: none; line-height: 1.25; }
    .bwc-venue-row-name:hover { color: var(--teal); }
    .bwc-venue-row-sub { font-size: 0.8rem; color: var(--muted); line-height: 1.4; margin-top: 3px; }
    .bwc-venue-row-dist { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: 0 0 auto; }
    .bwc-venue-row-dist .d-mi { font-family: 'SF Mono', Menlo, Monaco, monospace; font-weight: 800; font-size: 0.95rem; color: var(--teal); letter-spacing: 0.2px; line-height: 1; }
    .bwc-venue-row-dist .d-km { font-family: 'SF Mono', Menlo, Monaco, monospace; font-size: 0.72rem; color: var(--muted); letter-spacing: 0.4px; line-height: 1; }
    .bwc-venue-row-dist .d-walk { font-size: 0.74rem; color: var(--muted); text-decoration: none; margin-top: 2px; }
    .bwc-venue-row-dist .d-walk:hover { color: var(--teal); }
    .empty-state { padding: 26px 22px; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); font-style: italic; text-align: center; line-height: 1.6; }
    footer { text-align: center; padding: 40px 24px; border-top: 1px solid var(--border); font-size: 0.85rem; color: var(--muted); }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--teal); }
    footer .links { display: flex; gap: 24px; justify-content: center; margin-bottom: 16px; flex-wrap: wrap; }
    @media (max-width: 600px) { nav { padding: 16px 20px; } .content { padding: 32px 20px 60px; } .bwc-venue-row { gap: 10px; padding: 12px 14px; } .bwc-venue-row-name { font-size: 0.92rem; } }
  </style>
</head>
<body>
  <nav aria-label="Primary">
    <a href="/" class="logo" style="text-decoration:none;color:var(--text)">PINt<span>POINT</span></a>
    <div style="display:flex;gap:20px;align-items:center">
      <a href="/about-pintpoint.html">About</a>
      <a href="/features.html">Features</a>
      <a href="/pubs/">Venues</a>
      <a href="/blog/">Blog</a>
      <a href="/screenshots.html">Screenshots</a>
    </div>
  </nav>

  <article class="content">
    <p class="breadcrumb"><a href="/blog/">Blog</a> · <a href="/blog/world-cup-stadium-beer-map.html">Stadium Beer Map</a> · ${escapeHtml(stadium.city)}</p>
    <p class="meta"><span class="category">Guide</span>${escapeHtml(stadium.country_label)} · World Cup 2026</p>

    <h1>Beer near <em>${escapeHtml(stadium.stadium)}</em></h1>
    <p class="subtitle">${escapeHtml(stadium.city)} · ${counter}, sorted by straight-line distance from the ground</p>

    <p>Bars, pubs, breweries, taprooms and bottle shops within ${RADIUS_KM} km of ${escapeHtml(stadium.stadium)}, sorted by straight-line distance from the ground. Tap any venue for the full PINtPOINT page, or hit <strong>Walk →</strong> for true Google Maps walking directions — handy when the river, the freeway or the stadium fence is in the way.</p>

    <div class="bwc-venue-list">
${venues.length === 0
  ? `      <div class="empty-state">No PINtPOINT venues catalogued near this stadium yet. Open the PINtPOINT app near the ground and add what you find — we'll fold it in.</div>`
  : venues.map((v) => renderVenueCard(v, stadium)).join('\n')}
    </div>

    <p style="margin-top: 32px; font-size: 0.88rem;">Know a venue we missed? Open <strong>PINtPOINT</strong> near the ground and tap <strong>+</strong>, or email <a href="mailto:hello@pintpoint.co.uk?subject=Venue%20near%20${encodeURIComponent(stadium.stadium)}">hello@pintpoint.co.uk</a> with the name, address and one line on what makes it worth the walk.</p>

    <p style="margin-top: 22px; font-size: 0.85rem;">← <a href="/blog/world-cup-stadium-beer-map.html">All 16 World Cup host stadiums</a></p>
  </article>

  <footer>
    <div class="links">
      <a href="/">Home</a>
      <a href="/pubs/">Venues</a>
      <a href="/blog/world-cup-stadium-beer-map.html">Stadium Beer Map</a>
      <a href="/blog/beer-world-cup-xi.html">Beer World Cup XI</a>
      <a href="mailto:hello@pintpoint.co.uk">Contact</a>
    </div>
    <p style="font-size:0.75rem;color:#555;margin-top:12px">"FIFA" and "World Cup" are trademarks of FIFA. This page is independent editorial, not affiliated with FIFA, national football teams, breweries, or any official partner.</p>
    <p>&copy; 2026 PINtPOINT</p>
  </footer>
</body>
</html>
`;
}

function renderIndexPage(stadiumCounts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>World Cup 2026 venue guides by stadium — PINtPOINT</title>
  <meta name="description" content="Per-stadium beer venue lists for all 16 World Cup 2026 hosts. Each page lists nearby bars, pubs, breweries and taprooms sorted by straight-line distance from the ground." />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="https://pintpoint.co.uk/blog/world-cup-venues/" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://pintpoint.co.uk/blog/world-cup-venues/" />
  <meta property="og:title" content="World Cup 2026 venues by stadium — PINtPOINT" />
  <meta property="og:description" content="Per-stadium beer venue lists for all 16 World Cup 2026 hosts. Each page lists nearby bars, pubs, breweries and taprooms sorted by straight-line distance from the ground." />
  <meta property="og:image" content="https://pintpoint.co.uk/blog/images/stadium-beer-map-infographic-v1.jpg" />
  <meta property="og:image:alt" content="World Cup 2026 Stadium Beer Map — a grid of all 16 host stadiums with city and stadium names." />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0d1117; --teal: #00D4AA; --text: #ffffff; --muted: #8b949e; --card: #161b22; --border: rgba(255,255,255,0.08); --amber: #C0A340; }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }
    nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 20px 40px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .logo { font-size: 1.3rem; font-weight: 900; letter-spacing: -0.5px; }
    .logo span { color: var(--teal); }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.9rem; }
    nav a:hover { color: var(--text); }
    .content { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 { font-size: 2.0rem; font-weight: 900; letter-spacing: -1px; line-height: 1.2; margin-bottom: 8px; }
    .subtitle { font-size: 1.05rem; font-weight: 600; color: var(--muted); margin-bottom: 22px; }
    p { font-size: 0.97rem; color: var(--muted); line-height: 1.7; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 22px 0; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; text-decoration: none; color: var(--text); }
    .row:hover { border-color: var(--teal); }
    .row .city { font-weight: 800; font-size: 1.0rem; color: var(--text); }
    .row .sub { font-size: 0.78rem; color: var(--muted); margin-top: 3px; }
    .row .n { font-family: 'SF Mono', Menlo, Monaco, monospace; font-weight: 700; font-size: 0.8rem; color: var(--teal); }
    footer { text-align: center; padding: 40px 24px; border-top: 1px solid var(--border); font-size: 0.85rem; color: var(--muted); }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--teal); }
  </style>
</head>
<body>
  <nav aria-label="Primary">
    <a href="/" class="logo" style="text-decoration:none;color:var(--text)">PINt<span>POINT</span></a>
    <div style="display:flex;gap:20px;align-items:center">
      <a href="/about-pintpoint.html">About</a>
      <a href="/features.html">Features</a>
      <a href="/pubs/">Venues</a>
      <a href="/blog/">Blog</a>
    </div>
  </nav>
  <article class="content">
    <h1>World Cup 2026 venues by stadium</h1>
    <p class="subtitle">Pick a host. Get the nearest beer.</p>
    <p>Per-stadium beer venue lists for all 16 World Cup 2026 hosts. Each page lists nearby bars, pubs, breweries and taprooms sorted by straight-line distance from the ground.</p>
    <div class="grid">
${STADIUMS.map((s) => `      <a class="row" href="/blog/world-cup-venues/${s.slug}.html">
        <div>
          <div class="city">${escapeHtml(s.city)}</div>
          <div class="sub">${escapeHtml(s.stadium)} · ${escapeHtml(s.country_label)}</div>
        </div>
        <div class="n">${stadiumCounts[s.slug] ?? 0}</div>
      </a>`).join('\n')}
    </div>
    <p style="margin-top: 32px; font-size: 0.88rem;">← <a href="/blog/world-cup-stadium-beer-map.html">Back to the Stadium Beer Map</a></p>
  </article>
  <footer><p>&copy; 2026 PINtPOINT</p></footer>
</body>
</html>
`;
}

// --- Build ---

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Probe each venue's canonical slug against the live edge function
  // (parallel, with a cap). Drop venues whose page returns "not found" —
  // happens when our slugify differs from the edge function's, or when
  // a venue was deleted/renamed between insert and now.
  console.log('  Pulling venues + probing edge function for /pubs/<slug> resolution...\n');
  const counts = {};
  let totalDropped = 0;
  for (const s of STADIUMS) {
    process.stdout.write(`  ${s.city.padEnd(38)} `);
    const raw = await fetchNearbyVenues(s);

    // Probe each candidate's canonical slug in parallel (concurrency limit
    // is implicit via Promise.all + Node's fetch agent — fine for ≤50).
    const probes = await Promise.all(
      raw.map(async (v) => ({ v, ok: await probeVenueSlug(venueSlug(v)) }))
    );
    const venues = probes.filter((p) => p.ok).map((p) => p.v);
    const dropped = raw.length - venues.length;
    totalDropped += dropped;

    const html = renderStadiumPage(s, venues);
    fs.writeFileSync(path.join(OUT_DIR, `${s.slug}.html`), html);
    counts[s.slug] = venues.length;
    const closest = venues[0] ? `closest: ${venues[0].name} (${fmtDistance(venues[0].distance_km)})` : '(none in radius)';
    const dropTag = dropped > 0 ? ` (-${dropped} 404)` : '';
    console.log(`${String(venues.length).padStart(3)} venues${dropTag}  ${closest}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndexPage(counts));
  console.log(`\nWrote ${STADIUMS.length + 1} pages → ${OUT_DIR}`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Total venue rows across all pages: ${total}${totalDropped ? ` (${totalDropped} dropped — edge function returned 404 for canonical slug)` : ''}`);

  // Patch the parent Stadium Map page so each city card shows its venue
  // count in brackets. Keeps the numbers in sync as new venues land.
  const stadiumMapPath = path.join(REPO, 'blog', 'world-cup-stadium-beer-map.html');
  let mapSrc = fs.readFileSync(stadiumMapPath, 'utf8');
  const citySlug = Object.fromEntries(STADIUMS.map((s) => [s.city, s.slug]));
  // Replace `<div class="v-city">CITY</div>` (with optional existing
  // <span class="v-count">) with `<div class="v-city">CITY <span class="v-count">(N)</span></div>`
  mapSrc = mapSrc.replace(/<div class="v-city">([^<]+?)(?:\s*<span class="v-count">[^<]+<\/span>)?<\/div>/g, (m, city) => {
    const slug = citySlug[city.trim()];
    if (!slug) return m;
    const n = counts[slug] ?? 0;
    return `<div class="v-city">${city.trim()} <span class="v-count">(${n})</span></div>`;
  });
  fs.writeFileSync(stadiumMapPath, mapSrc);
  console.log(`Patched Stadium Map venue cards with counts.`);
})().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
