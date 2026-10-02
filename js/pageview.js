/**
 * First-party page-view beacon.
 *
 * WHY IT EXISTS. `log-page-view` and `page_views.referrer` have been in place
 * since April, but the beacon was only ever wired into index.html and
 * download.html. On 2026-10-01 one blog post carried roughly half the site's
 * traffic for a day and we could not see where any of it came from.
 *
 * WHY sendBeacon AND NOT fetch. The first version of this file used fetch with
 * Authorization and apikey headers, copied from index.html. It logged NOTHING
 * in its first fifteen hours. Those headers are not CORS-simple, so the request
 * preflights — and the function answers OPTIONS with
 * `access-control-allow-headers: content-type` alone, so the real POST is never
 * sent. index.html's copy has the same flaw and manages 0–4 rows a day against
 * a page Cloudflare counts in the dozens.
 *
 * download.html has always used sendBeacon with no headers at all, and it is
 * the only beacon on the site that logs reliably. The function does not need
 * auth — a bare text/plain POST returns 200 — so the headers bought nothing and
 * cost everything. This copies the one that demonstrably works.
 *
 * sendBeacon also survives the page being closed, which a fetch on a link click
 * does not.
 *
 * Cookieless, no identifier, no consent banner — the same position as the
 * Cloudflare beacon beside it. Silent by design: a blocked request is an
 * expected outcome on a site whose readers run privacy DNS, not a fault.
 */
(function () {
  try {
    if (!navigator.sendBeacon) return;
    var payload = JSON.stringify({
      path: location.pathname || '/',
      referrer: document.referrer || null,
      ua: navigator.userAgent || null,
    });
    // text/plain keeps this a CORS simple request: no preflight, which
    // sendBeacon cannot perform anyway.
    navigator.sendBeacon(
      'https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/log-page-view',
      new Blob([payload], { type: 'text/plain' })
    );
  } catch (e) { /* never let analytics surface on the page */ }
})();
