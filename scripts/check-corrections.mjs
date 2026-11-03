#!/usr/bin/env node
/**
 * Fail if a line we corrected comes back.
 *
 * WHY. Corrections do not stay made. A later commit re-introduces a retired
 * claim, usually into a copy nobody is editing: a sibling post, a feed
 * description, llms.txt, the JSON-LD twin of a visible FAQ. Four of those in
 * one morning on 3 November 2026, including a count that had been corrected
 * an hour earlier.
 *
 * A hit is NOT automatically a regression. A source can approve the old
 * wording back, and that is why each hit prints the SUBJECT of the commit
 * that retired the line: a message about that line reads as a decision to
 * take it out, a message about something else reads as collateral. That tells
 * a reviewer which it is without opening the log. Subjects are stored in the
 * data file rather than resolved from git, because CI checks out at
 * fetch-depth 1 and cannot see the commit. Run --backfill-subjects locally to
 * fill them in.
 *
 * Matching is forgiving on purpose: entities decoded twice, tags stripped,
 * quotes and spaces normalised, lowercased. "Thirty-four British Oktoberfests"
 * survived a case-sensitive grep and this found it on its first run. An entry
 * can also match on PROXIMITY, {near: [a, b]}, because "eight pubs" came back
 * as "eight UK pubs" and a phrase pattern found nothing, which reads as clean.
 *
 * Usage: node scripts/check-corrections.mjs [--check] [--json] [--backfill-subjects]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
const ROOT = process.env.REPO_ROOT || process.cwd();
const DATA_PATH = process.env.RETIRED || join(ROOT, '_data/retired-strings.json');
const DATA = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const BACKFILL = process.argv.includes('--backfill-subjects');

// The subject of the commit that retired a line. Stored, not resolved: CI
// checks out shallow and `git log` cannot reach an older commit there.
const subjectFromGit = (sha) => {
  try {
    return execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%s', sha],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
};
if (BACKFILL) {
  let filled = 0;
  for (const e of DATA.retired) {
    if (e.retired_in_subject || !e.retired_in) continue;
    const subject = subjectFromGit(e.retired_in);
    if (subject) { e.retired_in_subject = subject; filled++; }
    else console.log(`  no commit found for ${e.id}: ${e.retired_in}`);
  }
  writeFileSync(DATA_PATH, JSON.stringify(DATA, null, 1) + '\n');
  console.log(`${filled} subject(s) written into ${DATA_PATH}.`);
  process.exit(0);
}
const subjectOf = (e) => e.retired_in_subject || subjectFromGit(e.retired_in);
const NAMED = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', mdash:'\u2014', ndash:'\u2013',
  lsquo:"'", rsquo:"'", ldquo:'"', rdquo:'"', hellip:'\u2026', eacute:'\u00e9', egrave:'\u00e8', auml:'\u00e4',
  ouml:'\u00f6', uuml:'\u00fc', szlig:'\u00df', pound:'\u00a3', euro:'\u20ac', middot:'\u00b7', times:'\u00d7' };
const decodeOnce = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
  .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));   // JSON escapes
const norm = s => decodeOnce(decodeOnce(s))          // twice: catches &amp;amp; and &amp;rsquo;
  .replace(/<[^>]+>/g, ' ')
  .replace(/[\u2018\u2019\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201f\u2033]/g, '"')
  .replace(/[\u00a0\u2009\u202f]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SCAN_DIRS = ['.', 'blog', '_data', 'scripts', 'r'];
const walk = (d, out = []) => { for (const f of readdirSync(d)) { const p = join(d, f);
  if (statSync(p).isDirectory()) { if (d !== ROOT && !p.includes('/drafts')) walk(p, out); }
  else if (/\.(html|txt|xml|json|mjs|js|sh|py)$/.test(f)) out.push(relative(ROOT, p)); } return out; };
const ALL = [...new Set(SCAN_DIRS.flatMap(d => existsSync(join(ROOT, d)) ? walk(join(ROOT, d)) : []))]
  .filter(f => !f.endsWith('retired-strings.json') && !f.endsWith('check-corrections.mjs'));
const glob = g => { const re = new RegExp('^' + g.split('*').map(esc).join('[^/]*') + '$'); return ALL.filter(f => re.test(f)); };
const cache = new Map(); const text = f => cache.get(f) ?? (cache.set(f, norm(readFileSync(join(ROOT, f), 'utf8'))), cache.get(f));
const allowed = (e, f) => DATA.allowlist.some(a => (a.id === e.id || a.string === e.string) && (a.file === f || a.file === '*'));
const hits = [];
// A retired claim is not a retired sentence. "eight pubs" became "eight UK
// pubs now pour it on draft" in a sibling post and a phrase pattern found
// nothing, which reads as clean. An entry can instead give {near: [a, b]} and
// a slack in words, and the pair is matched with anything short between them.
const near = (e) => {
  const [a, b] = e.near.map(x => esc(norm(x).trim()));
  const slack = e.slack ?? 3;
  return new RegExp(`\\b${a}\\b(?:\\s+[\\w'-]+){0,${slack}}\\s+\\b${b}\\b`, 'g');
};
for (const e of DATA.retired) {
  const files = e.sitewide ? ALL : [...new Set(e.files.flatMap(glob))];
  const pat = e.near ? near(e)
    : new RegExp((e.whole_word ? '\\b' : '') + esc(norm(e.string).trim()) + (e.whole_word ? '\\b' : ''), 'g');
  const ctx = e.context ? new RegExp(e.context, 'i') : null; const win = e.window ?? 120;
  for (const f of files) {
    if (allowed(e, f)) continue;
    const t = text(f);
    for (const m of t.matchAll(pat)) {
      const around = t.slice(Math.max(0, m.index - win), m.index + m[0].length + win);
      if (ctx && !ctx.test(around)) continue;
      if (e.near_words && !e.near_words.some(w => around.includes(w.toLowerCase()))) continue;
      hits.push({ id: e.id, file: f, string: e.string ?? e.near.join(' \u2026 '), retired_in: e.retired_in, subject: subjectOf(e), subject: subjectOf(e), around: around.trim() });
    }
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(hits, null, 1));
else for (const h of hits) console.log(
  `${h.file}: "${h.string}" (${h.id}, retired in ${h.retired_in}${h.subject ? `: "${h.subject}"` : ''})\n` +
  `  …${h.around}…\n` +
  `  A retired line came back. Read that commit subject: if it is about THIS line, the line was\n` +
  `  taken out deliberately and this is a regression. If it is about something else, the line\n` +
  `  went as collateral and putting it back may be legitimate. If it is approved, add\n` +
  `  {id, file, approved_in, reason} to the allowlist in _data/retired-strings.json.`);
console.log(`${hits.length} hit(s) across ${DATA.retired.length} retired strings, ${ALL.length} files scanned.`);
process.exit(hits.length ? 1 : 0);
