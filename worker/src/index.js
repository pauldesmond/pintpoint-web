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
const ABOUT_CANONICAL = 'https://pintpoint.co.uk/about-pintpoint.html';

// Bump this to invalidate the Worker's edge cache (e.g. after changing
// the edge function's rendering or slug-resolution logic).
const CACHE_VERSION = 'v10';

// Fallback Cache-Control if the upstream edge function doesn't set one.
// In practice the edge function sets a per-page-type value (short for
// live tap lists, long for ghosts etc.) — this is belt-and-braces.
const DEFAULT_CACHE_CONTROL = 'public, max-age=600, s-maxage=3600';

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
      // Everything else (.html files, drafts, images, the index) → origin
      return fetch(request);
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
      if (beerResp.status === 404) return new Response('Beer not found', { status: 404 });
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
      if (crawlResp.status === 404) return new Response('Crawl not found', { status: 404 });
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
    if (upstreamResp.status === 301 || upstreamResp.status === 302) {
      const location = upstreamResp.headers.get('Location');
      if (location) {
        return new Response(null, {
          status: 301,
          headers: { 'Location': location },
        });
      }
    }

    if (upstreamResp.status === 404) {
      return new Response('Venue not found', { status: 404 });
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
