#!/usr/bin/env node
/**
 * Regenerate /blog/drafts/index.html — a private contents page for the drafts.
 *
 * Why a generator and not a hand-kept page: the blog archive is already
 * dual-maintained (index.html + older.html) and drifts when someone forgets.
 * A drafts list that goes stale is worse than none, because it quietly stops
 * showing you the thing you were looking for.
 *
 * Reachability: the worker 404s the bare /blog/drafts/ directory and anything
 * under it that is not .html, but passes .html through with
 * X-Robots-Tag: noindex, nofollow. So this page is reachable at its explicit
 * path and nowhere else — not by browsing the directory, not by search.
 *
 * Run: node scripts/build-drafts-index.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DRAFTS = 'blog/drafts';
const PUBLISHED = 'blog';

const rows = readdirSync(DRAFTS)
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .map((f) => {
    const src = readFileSync(join(DRAFTS, f), 'utf8');
    const t = src.match(/<title>([\s\S]*?)<\/title>/i);
    const title = (t ? t[1] : f).replace(/\s*—\s*PINtPRESS\s*$/i, '').trim();
    const live = existsSync(join(PUBLISHED, f));
    // A redirect stub is not a duplicate. Two of these exist so that anyone
    // holding an old draft link lands on the published piece rather than a
    // 404 — deleting them as "already published" would break exactly the
    // links they were left behind to serve.
    const stub = /http-equiv="refresh"/i.test(src) && src.length < 2000;
    // A stub's own <title> is "Moved", which tells you nothing in a list.
    // Show where it goes instead, using the target's real title.
    let target = null, targetTitle = null;
    if (stub) {
      const m = src.match(/url=(\/blog\/[^\s"']+)/i);
      if (m) {
        target = m[1];
        const rel = target.replace(/^\/blog\//, '');
        const abs = join(PUBLISHED, rel);
        if (existsSync(abs)) {
          const tt = readFileSync(abs, 'utf8').match(/<title>([\s\S]*?)<\/title>/i);
          if (tt) targetTitle = tt[1].replace(/\s*—\s*PINtPRESS\s*$/i, '').trim();
        }
      }
    }
    return { file: f, title, live, stub, target, targetTitle, mtime: statSync(join(DRAFTS, f)).mtime };
  })
  .sort((a, b) => b.mtime - a.mtime);

const notes = readdirSync(DRAFTS).filter((f) => f.endsWith('.md')).length;
const fmt = (d) => d.toISOString().slice(0, 10);

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const items = rows.map((r) => {
  const label = r.stub
    ? `<span class="from">${esc(r.file.replace(/\.html$/, ''))}</span> → ${esc(r.targetTitle || r.target || 'unknown')}`
    : esc(r.title);
  const meta = r.stub ? 'redirect stub' : r.live ? 'published' : '';
  return `      <li${r.stub || r.live ? ' class="live"' : ''}>
        <a href="${r.file}">${label}</a>
        <span class="meta">${fmt(r.mtime)}${meta ? ' · ' + meta : ''}</span>
      </li>`;
}).join('\n');

writeFileSync(join(DRAFTS, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Drafts — PINtPRESS</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap" rel="stylesheet" />
  <style>
    :root { --bg:#0a0e1a; --text:#e5e7eb; --muted:#9ca3af; --border:#1f2937; --teal:#00d4aa; --amber:#f5a623; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Inter',-apple-system,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; font-size:16px; }
    .wrap { max-width:760px; margin:0 auto; padding:48px 20px 72px; }
    h1 { font-size:1.9rem; font-weight:900; letter-spacing:-0.02em; margin-bottom:6px; }
    h1 span { color:var(--teal); }
    .sub { color:var(--muted); font-size:0.9rem; margin-bottom:28px; }
    .warn { border-left:3px solid var(--amber); background:rgba(245,166,35,0.07); padding:12px 16px; border-radius:0 8px 8px 0; font-size:0.88rem; margin-bottom:28px; }
    ul { list-style:none; }
    li { display:flex; justify-content:space-between; gap:16px; align-items:baseline; padding:11px 0; border-bottom:1px solid var(--border); }
    li a { color:var(--text); text-decoration:none; font-weight:500; }
    li a:hover { color:var(--teal); }
    li.live a { color:var(--muted); }
    .from { color:var(--muted); font-weight:400; }
    .meta { color:var(--muted); font-size:0.78rem; white-space:nowrap; font-variant-numeric:tabular-nums; }
    footer { margin-top:32px; color:var(--muted); font-size:0.8rem; }
    @media (max-width:520px){ li { flex-direction:column; gap:2px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>PINtPRESS <span>drafts</span></h1>
    <p class="sub">${rows.filter((r) => !r.stub).length} drafts · ${rows.filter((r) => !r.live && !r.stub).length} unpublished · ${rows.filter((r) => r.stub).length} redirect stubs · ${notes} working notes (not served)</p>
    <div class="warn">Unlisted, not indexed — but publicly served. Anyone with a URL can read these. Greyed entries have a published counterpart in <code>/blog/</code>; those marked <em>redirect stub</em> are not drafts at all and exist to keep old draft links working.</div>
    <ul>
${items}
    </ul>
    <footer>Generated by <code>scripts/build-drafts-index.mjs</code> — re-run after adding a draft.</footer>
  </div>
</body>
</html>
`);
console.log(`drafts index: ${rows.length} drafts (${rows.filter((r) => !r.live).length} unpublished), ${notes} notes`);

// --- stub target check -------------------------------------------------
// Deleting a superseded draft on 2026-09-30 broke a stub that pointed at it:
// oktoberfest-many-festivals → drafts/september-is-oktoberfest, removed the
// same minute. A redirect to a 404 is worse than no redirect, and nothing
// would have said so. So the generator now fails loudly instead.
{
  const { existsSync: ex } = await import('node:fs');
  const broken = [];
  for (const f of readdirSync(DRAFTS).filter((x) => x.endsWith('.html'))) {
    const src = readFileSync(join(DRAFTS, f), 'utf8');
    const m = src.match(/url=(\/blog\/[^\s"']+)/i);
    if (!m) continue;
    const target = m[1].replace(/^\/blog\//, '');
    if (!ex(join(PUBLISHED, target))) broken.push(`${f} -> ${m[1]}`);
  }
  if (broken.length) {
    console.error(`\nBROKEN REDIRECT STUBS (${broken.length}):`);
    for (const b of broken) console.error('  ' + b);
    process.exit(1);
  }
  console.log('all redirect stubs resolve');
}
