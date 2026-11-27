#!/usr/bin/env node
/**
 * build-reading-copies.mjs
 *
 * Cuts public reading copies of unpublished drafts at /r/<name>/.
 *
 * WHY. blog/drafts/ sits behind Cloudflare Access (5 November 2026), so a
 * draft URL is unreadable to anyone without an account. /r/ is how a piece
 * gets in front of a reader before it is published: noindex, nofollow, not in
 * the sitemap (generate-sitemap.mjs scans blog/ only), not in llms.txt, and
 * linked from nowhere on the site. /r/ace/ and /r/esb/ started this way and
 * are redirects now that their pieces are live.
 *
 * DRIFT is the thing to watch. A reading copy is a copy, and a copy diverges
 * the moment the draft is edited, which is the fault that had two versions of
 * the-third-thursday live at once. So nothing here is hand-written: edit the
 * draft and re-run this script. Hand edits to /r/ are wiped on the next run.
 *
 * DO NOT release a draft carrying an account that reaches us through
 * correspondence rather than in the source's own words. /r/return/ carried two
 * and its comment said so. Read the piece before adding it to RELEASED.
 *
 *   node scripts/build-reading-copies.mjs [--check]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** short name at /r/<name>/  →  the draft it copies */
const RELEASED = new Map([
  ['pint',   'beer-faults-drinkers-list'],
  ['faults', 'beer-faults-wrong-place'],
  ['1779',   'established-1779'],
  ['six',    'everything-good-starts-at-six'],
  ['asked',  'nobody-asked-for-most-of-it'],
  ['dickens', 'dickens-drank-here'],
  ['hogarth', 'the-beer-in-the-picture'],
  ['xmas',   'a-cask-called-father-christmas'],
  ['oldtom', 'not-named-after-the-cat'],
]);

/* Drafts cross-link each other at the address the piece WILL have. That is a
   404 until it publishes, so inside a reading copy those links point at the
   other reading copy instead. */
const REWRITE = [...RELEASED].map(([name, slug]) => [
  `https://pintpoint.co.uk/blog/${slug}.html`, `https://pintpoint.co.uk/r/${name}/`,
]);

let changed = 0, stale = [];

for (const [name, slug] of RELEASED) {
  // A piece that has been promoted out of blog/drafts/ but not yet published
  // is still a draft for our purposes: the reader cannot reach it, because
  // the page is not live until the publish run pushes it.
  const draftSrc = join(ROOT, 'blog', 'drafts', `${slug}.html`);
  const promotedSrc = join(ROOT, 'blog', `${slug}.html`);
  const src = existsSync(draftSrc) ? draftSrc : promotedSrc;
  if (!existsSync(src)) { console.error(`❌ ${slug}: no draft at ${draftSrc} and no page at ${promotedSrc}`); process.exitCode = 1; continue; }
  let html = readFileSync(src, 'utf8');

  // The canonical points at the Access-protected draft: no use to a reader
  // and nothing a crawler should follow.
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
  // Belt and braces: the drafts carry noindex already, but a copy must never
  // be served without it.
  if (!/<meta name="robots"[^>]*noindex/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1\n  <meta name="robots" content="noindex, nofollow" />`);
  }
  // The drafts carry our own notes in HTML comments: publish checklists, why
  // a piece is held, what was cut and for what cause. A served comment is
  // readable by whoever we send the link to, and that is the newsroom rather
  // than the editorial ([[editorial-not-the-newsroom]]). Strip the lot, then
  // add the one note that belongs on a copy.
  html = html.replace(/<!--[\s\S]*?-->\s*/g, '');
  // Since November 2026 the drafts carry that same material in a visible
  // amber .draft-note block instead of a comment: open checks, what is
  // unverified, what must not creep back in. Identical reasoning, so strip
  // the block and the rules that style it. A reading copy keeps the DRAFT
  // byline, which tells a reader what they are holding, and loses the
  // working list, which is ours.
  html = html.replace(/\s*<div class="draft-note">[\s\S]*?<\/div>\s*/g, '\n\n    ');
  html = html.replace(/\s*\/\* Draft only[\s\S]*?\*\/\s*/g, '\n');
  html = html.replace(/\s*\.draft-note[^{]*\{[^}]*\}/g, '');
  // Article-relative assets (src="images/x.jpg") resolve against /blog/ on the
  // real page and against /r/<name>/ here, where there is no images folder.
  // Root-relative keeps one copy of the file serving both addresses.
  html = html.replace(/(\s(?:src|srcset)=")images\//g, '$1/blog/images/');
  for (const [from, to] of REWRITE) html = html.split(from).join(to);
  // Also catch the draft-path form of its own address.
  html = html.split(`https://pintpoint.co.uk/blog/drafts/${slug}.html`).join(`https://pintpoint.co.uk/r/${name}/`);

  const srcLabel = src.slice(ROOT.length + 1).split(sep).join('/');
  const note = `<!-- Reading copy of ${srcLabel}, generated by
     scripts/build-reading-copies.mjs. Do not edit this file: edit the draft
     and re-run the script. Noindex, nofollow, linked from nowhere on the
     site. Delete this folder, or turn it into a redirect the way /r/ace/ and
     /r/esb/ went, the day the piece is published. -->\n`;
  html = html.replace(/(<head[^>]*>\n?)/i, `$1${note}`);

  const outDir = join(ROOT, 'r', name);
  const out = join(outDir, 'index.html');
  const prev = existsSync(out) ? readFileSync(out, 'utf8') : null;
  if (prev === html) { console.log(`  /r/${name}/  current`); continue; }
  if (CHECK) { stale.push(`/r/${name}/`); continue; }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(out, html);
  changed++;
  console.log(`  /r/${name}/  ← ${srcLabel}`);
}

if (CHECK && stale.length) {
  console.error(`✗ ${stale.length} reading copy/copies out of date: ${stale.join(', ')}`);
  console.error(`   Fix: node scripts/build-reading-copies.mjs`);
  process.exit(1);
}
console.log(CHECK ? '✓ every reading copy matches its draft' : `${changed} written, ${RELEASED.size} released in all`);
