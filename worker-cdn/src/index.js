/**
 * pintpoint-cdn — Cloudflare Worker
 *
 * Sits in front of Supabase Storage's venue-photos bucket and serves
 * the photos via Cloudflare's edge cache so repeat reads don't burn
 * Supabase's free-tier egress (2GB/mo).
 *
 * - cdn.pintpoint.co.uk/photos/<key>  → proxies to
 *   rvokskoevmcekkgiglpa.supabase.co/storage/v1/object/public/venue-photos/<key>
 *
 * On a cache hit, Supabase isn't touched at all. On a miss, we fetch
 * once, return the bytes to the client, and store at the edge with a
 * 1-year max-age + immutable so CF holds it until the key is overwritten.
 */

const SUPABASE_BUCKET_BASE = 'https://rvokskoevmcekkgiglpa.supabase.co/storage/v1/object/public/venue-photos';

// Bump this to invalidate the CF edge cache (e.g. after a bulk photo
// refresh that overwrites the same storage keys).
const CACHE_VERSION = 'v1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only handle /photos/<key>
    if (!url.pathname.startsWith('/photos/')) {
      return new Response('Not found', { status: 404 });
    }
    const key = url.pathname.slice('/photos/'.length);
    if (!key) return new Response('Not found', { status: 404 });

    // Build a cache key that includes the cache version so we can bust
    // without renaming files. Keep it stable across query strings —
    // photo URLs don't take query params.
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cv', CACHE_VERSION);
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Cache miss — pull from Supabase Storage
    const upstream = `${SUPABASE_BUCKET_BASE}/${key}`;
    const upstreamResp = await fetch(upstream, {
      method: 'GET',
      cf: { cacheEverything: false },
    });

    if (!upstreamResp.ok) {
      return new Response(`Upstream error ${upstreamResp.status}`, { status: upstreamResp.status });
    }

    const body = await upstreamResp.arrayBuffer();
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': upstreamResp.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Served-By': 'pintpoint-cdn',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};
