/**
 * First-party page-view beacon.
 *
 * WHY IT EXISTS. `log-page-view` and the `page_views.referrer` column have
 * been in place since April, but the beacon was only ever wired into
 * index.html and download.html. On 2026-10-01 one blog post carried roughly
 * half the site's traffic for a day and we could not see where any of it came
 * from: Cloudflare had the referrers and we could not reach them, and our own
 * table had three rows against Cloudflare's 240. A referrer column nothing
 * writes to is worse than none, because it looks like data we hold.
 *
 * Cookieless, no identifiers, no consent banner — the same position as the
 * Cloudflare beacon alongside it. It records the path, the referring URL the
 * browser already sends, and the user agent.
 *
 * Deliberately silent: analytics must never break a page or show an error, and
 * a blocked fetch (privacy DNS, extensions) is an expected outcome, not a
 * fault.
 */
(function () {
  try {
    var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2b2tza29ldm1jZWtrZ2lnbHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4ODQ3ODAsImV4cCI6MjA4ODQ2MDc4MH0.mdwX__oAXOr3WwBdWsc7a0esZZoSGovr3S0xkh-gTp8';
    fetch('https://rvokskoevmcekkgiglpa.supabase.co/functions/v1/log-page-view', {
      method: 'POST',
      // text/plain keeps this a CORS simple request: no preflight, so one
      // round trip rather than two.
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': 'Bearer ' + ANON,
        'apikey': ANON,
      },
      body: JSON.stringify({
        path: location.pathname || '/',
        referrer: document.referrer || null,
        ua: navigator.userAgent || null,
      }),
      keepalive: true,
    }).catch(function () {});
  } catch (e) { /* never let analytics surface on the page */ }
})();
