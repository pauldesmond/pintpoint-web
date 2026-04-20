/**
 * pintpoint-pubs — Cloudflare Worker
 *
 * Serves dynamic venue pages at /pubs/<slug> by proxying to the
 * `venue-page` Supabase edge function. Removes the need for
 * committing per-venue HTML files to the pintpoint-web repo.
 *
 * - /pubs/             → pass through to origin (static index.html for now)
 * - /pubs/index.html   → pass through to origin
 * - /pubs/<slug>       → render via Supabase edge function
 * - /pubs/<slug>.html  → redirect to /pubs/<slug> (canonical, clean URL)
 * - everything else    → pass through to origin
 */

const SUPABASE_FN = 'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/venue-page';

// Bump this to invalidate the Worker's edge cache (e.g. after changing
// the edge function's rendering or slug-resolution logic).
const CACHE_VERSION = 'v3';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

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
    response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Rendered-By': 'pintpoint-pubs-worker',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
