/**
 * pintpoint-pubs — Cloudflare Worker
 *
 * Serves dynamic venue pages at /pubs/<slug> by proxying to the
 * `venue-page` Supabase edge function, and canonicalises /about
 * to /about-pintpoint.html so the conventional /about path resolves
 * for AI crawlers without creating a duplicate-content page.
 *
 * - /pubs/             → pass through to origin (static index.html for now)
 * - /pubs/index.html   → pass through to origin
 * - /pubs/<slug>       → render via Supabase edge function
 * - /pubs/<slug>.html  → redirect to /pubs/<slug> (canonical, clean URL)
 * - /photos/<file>     → venue photo proxied from Supabase Storage (long edge TTL)
 * - /blog/<slug>       → 301 redirect to /blog/<slug>.html (canonical w/ extension)
 * - /blog/<slug>/      → 301 redirect to /blog/<slug>.html
 * - /blog/<slug>.html  → pass through to origin
 * - /blog/...other...  → pass through (drafts, images, the index)
 * - /about, /about/    → 301 redirect to /about-pintpoint.html
 * - /about/<anything>  → 301 redirect to /about-pintpoint.html
 * - everything else    → pass through to origin
 */

const SUPABASE_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/venue-page';
const CRAWL_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/crawl-page';
const BEER_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/beer-page';
const OG_BEER_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/og-beer';
const OG_VENUE_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/og-venue';
const COLLECTIONS_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/collections-page';
const ABOUT_CANONICAL = 'https://pintpoint.co.uk/about-pintpoint.html';

// Venue photos live in the public Supabase Storage bucket. Serving them
// to the web straight from storage.supabase.co bills Storage egress on
// every fetch with no edge cache in front — the 28 Aug 2026 spike
// (114 MB Storage in one day) was bots crawling venue pages and pulling
// each embedded photo from the bucket. /photos/<file> proxies the bucket
// through this Worker so repeat fetches hit the colo cache instead.
// Photos are effectively immutable once uploaded (enrichment replaces
// the file under a NEW name), so the TTL is long.
const STORAGE_PHOTOS = 'https://rvokskoevmcekkgiglpa.supabase.co/storage/v1/object/public/venue-photos/';
const PHOTO_CACHE_CONTROL = 'public, max-age=604800, s-maxage=2592000, immutable';

// Bump this to invalidate the Worker's edge cache (e.g. after changing
// the edge function's rendering or slug-resolution logic).
const CACHE_VERSION = 'v14'; // v14 2026-08-17: 404/301 caching + 24h HTML fallback TTL

// Per-route cache version — bump ONLY the routes whose rendering / data
// changed, so we don't cold-rehydrate the whole fleet (photos in particular
// — see [[feedback_no_cache_key_bumps_under_egress_pressure]]). Falls
// back to CACHE_VERSION when a route hasn't declared its own.
const COLLECTIONS_CACHE_VERSION = 'v6'; // v6 2026-08-29: Baddow — 'Wider Essex survivors' → 'Across Essex'

// Fallback Cache-Control if the upstream edge function doesn't set one.
// In practice the edge function sets a per-page-type value (short for
// live tap lists, long for ghosts etc.) — this is belt-and-braces.
// s-maxage 3600 → 86400 on 2026-08-17 (crawler-tax fix): tap data moves
// at daily cron cadence, so a 1h edge TTL bought freshness nobody used
// while every bot recrawl cycle longer than 1h re-invoked Supabase.
const DEFAULT_CACHE_CONTROL = 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400';

// Crawler-tax fix (2026-08-17): 404s and 301s were never edge-cached, so
// every bot revisit of a junk sitemap URL or legacy bare slug re-invoked
// the edge function (multi-second render + PostgREST reads) to recompute
// the same answer. Cache them in the colo like any other response.
// 404s get a shorter TTL than 301s: a 404 can turn into a 200 when a
// venue/beer is added, a permanent redirect basically never changes.
const NOT_FOUND_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';
const REDIRECT_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400';

// Build a cacheable 404, store it against the request's cache key, and
// return it. `label` keeps the per-route body text ("Venue not found").
function cacheable404(ctx, cache, cacheKey, label) {
  const resp = new Response(label, {
    status: 404,
    headers: { 'Cache-Control': NOT_FOUND_CACHE_CONTROL },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// Build a cacheable 301, store it, and return it.
function cacheable301(ctx, cache, cacheKey, location) {
  const resp = new Response(null, {
    status: 301,
    headers: { 'Location': location, 'Cache-Control': REDIRECT_CACHE_CONTROL },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// Shared proxy for the OG share-image routes (/og/venue/, /og/beer/). Both
// render a PNG card via an edge function with identical cache/validate/proxy
// logic — only the path prefix and upstream fn differ. Kept as one function
// so a fix (e.g. the untappd_id-class invariants the edge fns share) can't be
// applied to one route and forgotten on the other.
async function serveOgImage(request, ctx, prefix, fnUrl) {
  let slug = new URL(request.url).pathname.slice(prefix.length);
  if (slug.endsWith('.png')) slug = slug.slice(0, -4);
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return new Response('Bad request', { status: 400 });
  }
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('_cv', CACHE_VERSION);
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const ogCache = caches.default;
  const cached = await ogCache.match(cacheKey);
  if (cached) return cached;

  const upstream = new URL(fnUrl);
  upstream.searchParams.set('slug', slug);
  const resp = await fetch(upstream.toString(), { method: 'GET' });
  if (resp.status === 404) {
    // Was no-store — every bot revisit of a stale og URL re-invoked the
    // PNG renderer. Cache the miss (crawler-tax fix 2026-08-17).
    return cacheable404(ctx, ogCache, cacheKey, 'Not found');
  }
  if (!resp.ok) return new Response('Upstream error', { status: 502 });
  const buf = await resp.arrayBuffer();
  const out = new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': resp.headers.get('Cache-Control') || 'public, max-age=600, s-maxage=86400',
      'X-Rendered-By': 'pintpoint-og-worker',
    },
  });
  ctx.waitUntil(ogCache.put(cacheKey, out.clone()));
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Canonicalise /about, /about/, and any /about/* path to the real
    // About page. GitHub Pages used to serve /about/index.html as a
    // meta-refresh with a 200 status, which reads to audit tools as a
    // duplicate page rather than a redirect. A true 301 from the edge
    // is the correct fix.
    if (pathname === '/about' || pathname === '/about/' || pathname.startsWith('/about/')) {
      return new Response(null, {
        status: 301,
        headers: {
          'Location': ABOUT_CANONICAL,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // /blog/<slug> (bare) → 301 → /blog/<slug>.html
    // GitHub Pages serves both forms with HTTP 200, which Bing flags as
    // duplicate content per Webmaster Guideline #6. Canonical tags + sitemap
    // already use .html as the canonical form; this enforces it at the edge.
    // Pass through: /blog/, /blog/index.html, /blog/<slug>.html, /blog/<dir>/...
    if (pathname.startsWith('/blog/')) {
      const tail = pathname.slice('/blog/'.length);
      // Unpublished drafts + working notes live under /blog/drafts/.
      // - HTML drafts: pass through to origin so the rendered post can be
      //   previewed at the live URL with real CSS/webfonts. Inject
      //   X-Robots-Tag: noindex,nofollow at the edge so search engines won't
      //   pick them up even if a draft's <meta> robots happens to be missing.
      // - Everything else under drafts/ (markdown notes, generator scripts,
      //   archive sub-dirs etc): hard-404 — robots.txt is advisory and we
      //   don't want working notes reachable by path-guessing.
      if (tail === 'drafts' || tail === 'drafts/') {
        return new Response('Not found', { status: 404 });
      }
      if (tail.startsWith('drafts/')) {
        if (tail.endsWith('.html')) {
          const upstream = await fetch(request);
          const headers = new Headers(upstream.headers);
          headers.set('X-Robots-Tag', 'noindex, nofollow');
          return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
        }
        return new Response('Not found', { status: 404 });
      }
      // Bare single-segment slug (a-z 0-9 hyphens, no extension, no slash) → redirect
      if (/^[a-z0-9-]+$/.test(tail)) {
        const canonical = new URL(url);
        canonical.pathname = `/blog/${tail}.html`;
        return new Response(null, {
          status: 301,
          headers: {
            'Location': canonical.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      // Trailing slash on slug → strip + redirect (e.g. /blog/foo/ → /blog/foo.html)
      if (/^[a-z0-9-]+\/$/.test(tail)) {
        const slug = tail.slice(0, -1);
        const canonical = new URL(url);
        canonical.pathname = `/blog/${slug}.html`;
        return new Response(null, {
          status: 301,
          headers: {
            'Location': canonical.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      // Truncated .htm → 301 to .html. X / Twitter sometimes clips link
      // detection one char short of `.html`, so the canonical link in a
      // tweet preview can land as /blog/<slug>.htm and 404 on GH Pages.
      // Catch any /blog/<slug>.htm (where slug is the standard charset)
      // and forward to the .html canonical.
      if (/^[a-z0-9-]+\.htm$/.test(tail)) {
        const canonical = new URL(url);
        canonical.pathname = `/blog/${tail}l`;
        return new Response(null, {
          status: 301,
          headers: {
            'Location': canonical.toString(),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      // Everything else (.html files, drafts, images, the index) → origin
      return fetch(request);
    }

    // /photos/<file> → venue photo proxied from Supabase Storage with a
    // long edge TTL (see STORAGE_PHOTOS above). Accepts an optional
    // single "pending/" prefix — user submissions land there before
    // review and some venue.photo values point at it.
    if (pathname.startsWith('/photos/')) {
      const file = pathname.slice('/photos/'.length);
      if (!/^(?:pending\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file)) {
        return new Response('Bad request', { status: 400 });
      }
      const photoCacheUrl = new URL(request.url);
      photoCacheUrl.search = '';
      photoCacheUrl.searchParams.set('_cv', CACHE_VERSION);
      const photoCacheKey = new Request(photoCacheUrl.toString(), { method: 'GET' });
      const photoCache = caches.default;
      const cachedPhoto = await photoCache.match(photoCacheKey);
      if (cachedPhoto) return cachedPhoto;

      const photoResp = await fetch(STORAGE_PHOTOS + file, { method: 'GET' });
      if (photoResp.status === 400 || photoResp.status === 404) {
        return cacheable404(ctx, photoCache, photoCacheKey, 'Not found');
      }
      if (!photoResp.ok) return new Response('Upstream error', { status: 502 });
      // MIME allow-list: the venue-photos bucket accepts user submissions
      // under pending/, so a submitter can put an SVG or HTML in there. If
      // we reflect that Storage Content-Type onto the apex origin, that
      // file executes as script in pintpoint.co.uk's origin (stored XSS).
      // Only serve raster image types, and always assert the fixed type
      // with nosniff so the browser cannot second-guess it.
      const upstreamType = (photoResp.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ALLOWED_IMAGE_TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 };
      if (!ALLOWED_IMAGE_TYPES[upstreamType]) {
        return cacheable404(ctx, photoCache, photoCacheKey, 'Not an image');
      }
      const photoBuf = await photoResp.arrayBuffer();
      const photoOut = new Response(photoBuf, {
        status: 200,
        headers: {
          'Content-Type': upstreamType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': PHOTO_CACHE_CONTROL,
          'X-Rendered-By': 'pintpoint-photo-worker',
        },
      });
      ctx.waitUntil(photoCache.put(photoCacheKey, photoOut.clone()));
      return photoOut;
    }

    // OG share-image routes — both proxy a PNG card from an edge function
    // (Satori + resvg-wasm server-side render). Shared logic in serveOgImage.
    if (pathname.startsWith('/og/venue/')) {
      return serveOgImage(request, ctx, '/og/venue/', OG_VENUE_FN);
    }
    if (pathname.startsWith('/og/beer/')) {
      return serveOgImage(request, ctx, '/og/beer/', OG_BEER_FN);
    }

    // /beers/<slug> → proxy to the beer-page edge function.
    // Mirrors the /pubs/<slug> + /crawl/<slug> pattern: canonical URL
    // shape is /beers/<slug> with no trailing slash and no .html, so
    // redirect any drift to the canonical form before proxying.
    if (pathname.startsWith('/beers/')) {
      let slug = pathname.slice('/beers/'.length);
      if (slug.endsWith('/')) slug = slug.slice(0, -1);
      if (slug.endsWith('.html')) {
        const canonical = new URL(url);
        canonical.pathname = `/beers/${slug.slice(0, -5)}`;
        return Response.redirect(canonical.toString(), 301);
      }
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
        return new Response('Beer not found', { status: 404 });
      }

      const beerCacheUrl = new URL(request.url);
      beerCacheUrl.searchParams.set('_cv', CACHE_VERSION);
      const beerCacheKey = new Request(beerCacheUrl.toString(), { method: 'GET' });
      const beerCache = caches.default;
      const cachedBeer = await beerCache.match(beerCacheKey);
      if (cachedBeer) return cachedBeer;

      const beerUpstream = new URL(BEER_FN);
      beerUpstream.searchParams.set('slug', slug);
      const beerResp = await fetch(beerUpstream.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        cf: { cacheEverything: false },
      });
      if (beerResp.status === 404) return cacheable404(ctx, beerCache, beerCacheKey, 'Beer not found');
      if (!beerResp.ok) return new Response('Upstream error', { status: 502 });
      const beerBody = await beerResp.text();
      const beerCC = beerResp.headers.get('Cache-Control') || DEFAULT_CACHE_CONTROL;
      const resp = new Response(beerBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': beerCC,
          'X-Rendered-By': 'pintpoint-beers-worker',
        },
      });
      ctx.waitUntil(beerCache.put(beerCacheKey, resp.clone()));
      return resp;
    }

    // /collections/<slug>/map.png → server-side Static Map proxy.
    // Google Static Maps needs a key, which we DON'T want in the HTML
    // (referrer-restricted keys still cost Google API $, and any client-
    // visible key can be scraped). The Worker calls the API with a secret
    // key (env.GOOGLE_STATIC_MAPS_KEY) and edge-caches the PNG. Same
    // pattern as /photos/*.
    if (pathname.startsWith('/collections/') && pathname.endsWith('/map.png')) {
      const slug = pathname.slice('/collections/'.length, -'/map.png'.length);
      if (!/^[a-z0-9-]+$/i.test(slug)) return new Response('Bad request', { status: 400 });
      const mapCacheUrl = new URL(request.url);
      mapCacheUrl.searchParams.set('_cv', COLLECTIONS_CACHE_VERSION);
      const mapCacheKey = new Request(mapCacheUrl.toString(), { method: 'GET' });
      const mapCache = caches.default;
      const cached = await mapCache.match(mapCacheKey);
      if (cached) return cached;

      // Pull venue coords for the collection from the DB via PostgREST
      // (service-role read). Same origin as edge functions.
      const postgrest = 'https://rvokskoevmcekkgiglpa.supabase.co/rest/v1';
      const colResp = await fetch(`${postgrest}/collections?slug=eq.${encodeURIComponent(slug)}&select=regions&limit=1`, {
        headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (!colResp.ok) return cacheable404(ctx, mapCache, mapCacheKey, 'Map unavailable');
      const cols = await colResp.json();
      const col = cols?.[0];
      if (!col?.regions) return cacheable404(ctx, mapCache, mapCacheKey, 'Collection not found');
      const ids = (col.regions || []).flatMap((r) => r.venue_ids || []);
      if (ids.length === 0) return cacheable404(ctx, mapCache, mapCacheKey, 'No venues');
      const inList = ids.map((s) => `"${s}"`).join(',');
      const vResp = await fetch(`${postgrest}/venues?id=in.(${encodeURIComponent(inList)})&select=id,latitude,longitude`, {
        headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (!vResp.ok) return cacheable404(ctx, mapCache, mapCacheKey, 'Venues fetch failed');
      const venues = await vResp.json();
      const pins = venues.filter((v) => v.latitude != null && v.longitude != null);
      if (pins.length === 0) return cacheable404(ctx, mapCache, mapCacheKey, 'No pins');

      const markers = pins.map((v) => `color:0x9B59B6|${v.latitude},${v.longitude}`).join('&markers=');
      const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?size=800x400&scale=2&maptype=roadmap&markers=${markers}&key=${env.GOOGLE_STATIC_MAPS_KEY}`;
      const gResp = await fetch(staticUrl);
      if (!gResp.ok) return cacheable404(ctx, mapCache, mapCacheKey, 'Static map error');
      const buf = await gResp.arrayBuffer();
      const out = new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
          'X-Rendered-By': 'pintpoint-collection-map-worker',
        },
      });
      ctx.waitUntil(mapCache.put(mapCacheKey, out.clone()));
      return out;
    }

    // /collections/<slug> → proxy to the collections-page edge function.
    // Curated Collections are editorial themed pub sets — long-arc reference
    // maps distinct from crawls (route/session) and watchlists (personal).
    if (pathname.startsWith('/collections/')) {
      let slug = pathname.slice('/collections/'.length);
      if (slug.endsWith('/')) slug = slug.slice(0, -1);
      if (slug.endsWith('.html')) {
        const canonical = new URL(url);
        canonical.pathname = `/collections/${slug.slice(0, -5)}`;
        return Response.redirect(canonical.toString(), 301);
      }
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
        return new Response('Collection not found', { status: 404 });
      }
      const colCacheUrl = new URL(request.url);
      colCacheUrl.searchParams.set('_cv', COLLECTIONS_CACHE_VERSION);
      const colCacheKey = new Request(colCacheUrl.toString(), { method: 'GET' });
      const colCache = caches.default;
      const cachedCol = await colCache.match(colCacheKey);
      if (cachedCol) return cachedCol;

      const colUpstream = new URL(COLLECTIONS_FN);
      colUpstream.searchParams.set('slug', slug);
      const colResp2 = await fetch(colUpstream.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        cf: { cacheEverything: false },
      });
      if (colResp2.status === 404) return cacheable404(ctx, colCache, colCacheKey, 'Collection not found');
      if (!colResp2.ok) return new Response('Upstream error', { status: 502 });
      const colBody = await colResp2.text();
      const colCC = colResp2.headers.get('Cache-Control') || DEFAULT_CACHE_CONTROL;
      const resp = new Response(colBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': colCC,
          'X-Rendered-By': 'pintpoint-collections-worker',
        },
      });
      ctx.waitUntil(colCache.put(colCacheKey, resp.clone()));
      return resp;
    }

    // /crawl/<slug> → proxy to the crawl-page edge function
    if (pathname.startsWith('/crawl/')) {
      let slug = pathname.slice('/crawl/'.length);
      if (slug.endsWith('/')) slug = slug.slice(0, -1);
      if (slug.endsWith('.html')) {
        const canonical = new URL(url);
        canonical.pathname = `/crawl/${slug.slice(0, -5)}`;
        return Response.redirect(canonical.toString(), 301);
      }
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
        return new Response('Crawl not found', { status: 404 });
      }

      const crawlCacheUrl = new URL(request.url);
      crawlCacheUrl.searchParams.set('_cv', CACHE_VERSION);
      const crawlCacheKey = new Request(crawlCacheUrl.toString(), { method: 'GET' });
      const crawlCache = caches.default;
      const cached = await crawlCache.match(crawlCacheKey);
      if (cached) return cached;

      const crawlUpstream = new URL(CRAWL_FN);
      crawlUpstream.searchParams.set('slug', slug);
      const crawlResp = await fetch(crawlUpstream.toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
        cf: { cacheEverything: false },
      });
      if (crawlResp.status === 404) return cacheable404(ctx, crawlCache, crawlCacheKey, 'Crawl not found');
      if (!crawlResp.ok) return new Response('Upstream error', { status: 502 });
      const crawlBody = await crawlResp.text();
      const crawlCC = crawlResp.headers.get('Cache-Control') || DEFAULT_CACHE_CONTROL;
      const resp = new Response(crawlBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': crawlCC,
          'X-Rendered-By': 'pintpoint-crawl-worker',
        },
      });
      ctx.waitUntil(crawlCache.put(crawlCacheKey, resp.clone()));
      return resp;
    }

    if (!pathname.startsWith('/pubs/')) {
      return fetch(request);
    }

    // Root index and explicit /pubs/index.html → origin
    if (pathname === '/pubs/' || pathname === '/pubs/index.html') {
      return fetch(request);
    }

    // Strip trailing slash, strip .html — the canonical URL shape is /pubs/<slug>
    let slug = pathname.slice('/pubs/'.length);
    if (slug.endsWith('/')) slug = slug.slice(0, -1);
    if (slug.endsWith('.html')) {
      const canonical = new URL(url);
      canonical.pathname = `/pubs/${slug.slice(0, -5)}`;
      return Response.redirect(canonical.toString(), 301);
    }

    // Renames — old slug → new slug 301s, so external links (blog posts,
    // tweets, OG cards) keep working when a venue's name changes. Keep
    // this map small; permanent.
    const PUB_SLUG_REDIRECTS = {
      'the-whippet-ec2-london': 'the-whippet-london', // 15 May 2026: dropped EC2 suffix
    };
    if (PUB_SLUG_REDIRECTS[slug]) {
      const canonical = new URL(url);
      canonical.pathname = `/pubs/${PUB_SLUG_REDIRECTS[slug]}`;
      return new Response(null, {
        status: 301,
        headers: {
          'Location': canonical.toString(),
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Slug must be a single path segment with safe characters
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      return fetch(request);
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cv', CACHE_VERSION);
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    const upstream = new URL(SUPABASE_FN);
    upstream.searchParams.set('slug', slug);

    const upstreamResp = await fetch(upstream.toString(), {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
      redirect: 'manual',
      cf: { cacheEverything: false },
    });

    // Edge function returns 301 when a legacy bare-name slug resolves
    // unambiguously to a canonical name+city slug. Pass it through so the
    // browser visits the canonical URL (and so Google consolidates signals).
    // Cached since 2026-08-17 — recomputing a permanent redirect cost a
    // multi-second render + PostgREST reads on every bot revisit.
    if (upstreamResp.status === 301 || upstreamResp.status === 302) {
      const location = upstreamResp.headers.get('Location');
      if (location) {
        return cacheable301(ctx, cache, cacheKey, location);
      }
    }

    if (upstreamResp.status === 404) {
      return cacheable404(ctx, cache, cacheKey, 'Venue not found');
    }

    if (!upstreamResp.ok) {
      return new Response('Upstream error', { status: 502 });
    }

    const body = await upstreamResp.text();
    // Respect the upstream Cache-Control when the edge function sets one —
    // different page types deserve different TTLs (live tap lists 10min,
    // ghost pages 24h, coming-soon 1h, disambiguation 24h).
    const upstreamCacheControl = upstreamResp.headers.get('Cache-Control') || DEFAULT_CACHE_CONTROL;
    response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': upstreamCacheControl,
        'X-Rendered-By': 'pintpoint-pubs-worker',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
