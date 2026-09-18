/**
 * pintpoint-cdn — Cloudflare Worker
 *
 * Sits in front of Supabase Storage's venue-photos bucket and serves
 * the photos via Cloudflare's edge cache so repeat reads don't burn
 * Supabase's free-tier egress (2GB/mo).
 *
 * - GET  cdn.pintpoint.co.uk/photos/<key>  → R2, falling back to
 *   rvokskoevmcekkgiglpa.supabase.co/storage/v1/object/public/venue-photos/<key>
 * - PUT  cdn.pintpoint.co.uk/photos/<key>  → R2, for our own edge functions
 *   (shared secret). Photos have been WRITTEN here since 2026-09-18; before
 *   that they were written to Supabase and read back through this worker.
 *
 * On a cache hit, Supabase isn't touched at all. On a miss, we fetch
 * once, return the bytes to the client, and store at the edge with a
 * 1-year max-age + immutable so CF holds it until the key is overwritten.
 */

const SUPABASE_BUCKET_BASE = 'https://rvokskoevmcekkgiglpa.supabase.co/storage/v1/object/public/venue-photos';

// Bump this to invalidate the CF edge cache (e.g. after a bulk photo
// refresh that overwrites the same storage keys).
const CACHE_VERSION = 'v1';

// Writes accepted from our own edge functions only, via a shared secret.
// R2 has no public write path, and giving Deno an S3 SigV4 implementation to
// keep working is a worse trade than one authenticated route here.
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Constant-time-ish compare, so a wrong secret can't be narrowed by timing. */
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only handle /photos/<key>
    if (!url.pathname.startsWith('/photos/')) {
      return new Response('Not found', { status: 404 });
    }
    const key = url.pathname.slice('/photos/'.length);
    if (!key) return new Response('Not found', { status: 404 });
    // Storage object paths only — reject traversal and unexpected chars before
    // building the upstream URL, mirroring the main worker's slug validation.
    // (url.pathname is already percent-decoded, so this catches %2e%2e too.)
    if (key.includes('..') || !/^[A-Za-z0-9/_.-]+$/.test(key)) {
      return new Response('Not found', { status: 404 });
    }

    // ── Upload: PUT /photos/<key> with the shared secret ──────────────
    if (request.method === 'PUT') {
      if (!env.PHOTOS || !env.UPLOAD_SECRET) return new Response('Not found', { status: 404 });
      const offered = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
      if (!secretsMatch(offered, env.UPLOAD_SECRET)) {
        return new Response('Forbidden', { status: 403 });
      }
      const contentType = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
        return new Response(`Unsupported content type ${contentType}`, { status: 415 });
      }
      const body = await request.arrayBuffer();
      if (body.byteLength === 0) return new Response('Empty body', { status: 400 });
      if (body.byteLength > MAX_UPLOAD_BYTES) return new Response('Too large', { status: 413 });
      // x-overwrite mirrors Supabase's x-upsert:false — a content-addressed
      // key holds the same bytes whoever wrote it, so a second writer is a
      // no-op rather than a conflict, but a caller has to ask for that.
      if (request.headers.get('x-overwrite') !== 'true') {
        const existing = await env.PHOTOS.head(key);
        if (existing) return new Response('Already exists', { status: 409 });
      }
      await env.PHOTOS.put(key, body, {
        httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
      });
      return new Response(JSON.stringify({ ok: true, key }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Build a cache key that includes the cache version so we can bust
    // without renaming files. Keep it stable across query strings —
    // photo URLs don't take query params.
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('_cv', CACHE_VERSION);
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Cache miss — R2 first (the photos' home since the 2026-09 migration),
    // Supabase Storage second. The fallback is deliberate: it covers keys
    // written before the migration caught up, and makes the switch revertible
    // by removing the binding rather than by restoring files.
    if (env.PHOTOS) {
      const obj = await env.PHOTOS.get(key);
      if (obj) {
        const r2Response = new Response(obj.body, {
          status: 200,
          headers: {
            'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Served-By': 'pintpoint-cdn-r2',
          },
        });
        ctx.waitUntil(cache.put(cacheKey, r2Response.clone()));
        return r2Response;
      }
    }

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
