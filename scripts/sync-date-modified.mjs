#!/usr/bin/env node
// sync-date-modified.mjs — set each blog page's JSON-LD dateModified from the
// last commit that changed its article body.
//
// Why: dateModified was hand-maintained, so it sat still while the page moved.
// On 3 November 2026 it was stale on 39 of the 45 pages that carry it, and on
// about half of those the body had changed because of the blog fact audit. The
// structured data was telling search engines the page had not been touched
// since spring while the corrections were already live.
//
// What counts as a change: the text of <article>, with <script> blocks removed,
// tags stripped and whitespace collapsed. That deliberately excludes the <head>
// JSON-LD, which is where dateModified itself lives, so writing the field back
// cannot change the body hash and cannot bump the date on the next run. Repeat
// runs over an unchanged tree are no-ops. It also excludes the infra sweeps
// (analytics notes, favicon paths, beacon scripts) that touched every page in
// November without changing a word anyone reads.
//
// Uncommitted edits count. The publish flow runs before the commit exists, so a
// dirty body that differs from HEAD is dated today.
//
// Usage:
//   node scripts/sync-date-modified.mjs            # write
//   node scripts/sync-date-modified.mjs --check    # report only, exit 1 if stale
//   node scripts/sync-date-modified.mjs blog/x.html [...]   # limit to some files
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = process.env.REPO_ROOT || execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CHECK = process.argv.includes('--check');
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('--'));
const git = (args, opts = {}) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

const today = new Date().toISOString().slice(0, 10);

// Furniture: leaf elements rolled out across the whole blog at once, which
// carry text but are not the piece. Without this a design pass restamps every
// page as freshly modified — the print-palette rollout of 26 October added the
// word "PINtPRESS" to the meta line of 67 pages, and nothing anyone wrote
// changed. Overstating freshness on dozens of pages in one commit is the thing
// this sweep exists to avoid, not a side effect to accept.
const FURNITURE = ['meta', 'imprint-note', 'disclosure', 'analytics-note'];
const dropFurniture = s => FURNITURE.reduce((acc, cls) =>
  acc.replace(new RegExp(`<(p|div|span)\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>[\\s\\S]*?</\\1>`, 'gi'), ' '), s);

// The hash of what a reader actually reads: the article's own text. Everything
// below is excluded on purpose — <script> because that is where dateModified
// itself lives, so the field can never bump itself; <style> and the furniture
// because a repaint is not an edit.
const bodyHash = src => {
  const m = /<article\b[\s\S]*<\/article>/.exec(src);
  const body = dropFurniture(m ? m[0] : src)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(body).digest('hex');
};

// The value may be a bare date or a full ISO timestamp. Matching only the
// bare form once made a timestamped page look like it had no field at all,
// and it was given a second one in the same object.
const DM = /("dateModified"\s*:\s*")([0-9]{4}-[0-9]{2}-[0-9]{2})(?:T[0-9:.+\-Z]*)?(")/;
// Written whole by generate-blog-pages.mjs, so never have a field inserted.
const GENERATED = /^(index|archive|page-\d+)\.html$/;
const DP = /"datePublished"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})"/;

const BLOG = join(ROOT, 'blog');
const targets = (ARGS.length ? ARGS : readdirSync(BLOG).filter(f => f.endsWith('.html')).map(f => `blog/${f}`))
  .filter(f => existsSync(join(ROOT, f)))
  .filter(f => {
    const src = readFileSync(join(ROOT, f), 'utf8');
    // A page with neither field has no JSON-LD dates at all and is not ours to
    // touch. A page with datePublished and no dateModified used to be skipped
    // here, which left its edits invisible to the sitemap's freshness signal.
    // It is taken now, UNLESS generate-blog-pages.mjs writes the file whole,
    // in which case an inserted field is wiped at the next build and the fix
    // belongs in that generator instead.
    if (DM.test(src)) return true;
    return DP.test(src) && !GENERATED.test(basename(f));
  });

// One `git log --raw` per file gives every commit that touched it along with the
// blob it left behind; one `git cat-file --batch` then streams all of those
// blobs in a single process rather than shelling out per commit.
const history = new Map();
const wanted = new Set();
for (const f of targets) {
  const log = git(['log', '--follow', '--format=%x01%H %ad', '--date=short', '--raw', '--abbrev=40', '--', f]);
  const commits = [];
  for (const chunk of log.split('\u0001').slice(1)) {
    const [head, ...rest] = chunk.split('\n');
    const [sha, date] = head.trim().split(' ');
    // raw line: :100644 100644 <pre> <post> M\tpath
    const blob = rest.map(l => /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]{40}) /.exec(l)).find(Boolean)?.[1];
    if (blob && !/^0+$/.test(blob)) { commits.push({ sha, date, blob }); wanted.add(blob); }
  }
  history.set(f, commits);
}

const blobs = new Map();
if (wanted.size) {
  const batch = spawnSync('git', ['-C', ROOT, 'cat-file', '--batch'],
    { input: [...wanted].join('\n') + '\n', maxBuffer: 1 << 30 });
  const buf = batch.stdout;
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) break;
    const [oid, type, size] = buf.slice(i, nl).toString('utf8').split(' ');
    if (type !== 'blob') { i = nl + 1; continue; }
    const start = nl + 1, len = Number(size);
    blobs.set(oid, buf.slice(start, start + len).toString('utf8'));
    i = start + len + 1;
  }
}

const rows = [];
for (const f of targets) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const stored = DM.exec(src)?.[2] ?? null;
  const published = DP.exec(src)?.[1];
  const commits = history.get(f) ?? [];
  const hashes = commits.map(c => (blobs.has(c.blob) ? bodyHash(blobs.get(c.blob)) : null));

  let date = null;
  if (!commits.length) {
    date = today;                                  // never committed
  } else if (bodyHash(src) !== hashes[0]) {
    date = today;                                  // uncommitted body edit
  } else {
    let i = 0;
    while (i + 1 < hashes.length && hashes[i] === hashes[i + 1]) i++;
    date = commits[i].date;                        // first commit whose body differs from its parent's
  }
  if (published && date < published) date = published;
  if (date !== stored) rows.push({ f, stored, date });
}

for (const { f, stored, date } of rows) {
  console.log(`${CHECK ? '\u2022' : '\u2192'} ${f}: ${stored === null ? 'no field' : stored} \u2192 ${date}`);
  if (CHECK) continue;
  const p = join(ROOT, f);
  const src = readFileSync(p, 'utf8');
  if (stored === null) {
    // Insert after datePublished, matching its indentation, once.
    writeFileSync(p, src.replace(
      /([ \t]*)"datePublished"\s*:\s*"[0-9]{4}-[0-9]{2}-[0-9]{2}",/,
      (m, indent) => `${m}\n${indent}"dateModified": "${date}",`));
  } else {
    writeFileSync(p, src.replace(DM, `$1${date}$3`));
  }
}

console.log(`${rows.length} of ${targets.length} page(s) ${CHECK ? 'stale' : 'updated'}.`);
if (CHECK && rows.length) {
  console.log('Fix: node scripts/sync-date-modified.mjs');
  process.exit(1);
}
