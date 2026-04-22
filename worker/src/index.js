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
 * - /about, /about/    → 301 redirect to /about-pintpoint.html
 * - /about/<anything>  → 301 redirect to /about-pintpoint.html
 * - everything else    → pass through to origin
 */

const SUPABASE_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/venue-page';
const ABOUT_CANONICAL = 'https://pintpoint.co.uk/about-pintpoint.html';

// Bump this to invalidate the Worker's edge cache (e.g. after changing
// the edge function's rendering or slug-resolution logic).
const CACHE_VERSION = 'v5';

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
