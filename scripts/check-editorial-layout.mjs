#!/usr/bin/env node
/**
 * check-editorial-layout — three of Paul's five layout rules, the ones a
 * machine can judge. Rules 3 and 4 (what belongs above the parts on a hub
 * page, and where a collection box sits) are judgement calls and stay with him.
 *
 * 1. NOTHING BETWEEN THE HEADLINE AND THE LEDE. The element after <h1> must be
 *    the opening paragraph. Companion boxes, notices and calls to action go
 *    below it. We do not try to recognise a lede, because its class is spelt
 *    six ways across the blog (lede, standfirst, deck, ps-1, sub, tagline);
 *    we recognise the furniture that must not be there instead.
 *
 * 2. ONE UNDERLINE PER LINK. The sitewide amber underline is the only one, so
 *    a page's own <style> may not put a border-bottom on an anchor. Checked
 *    only on pages that load pintpress-feature.css, because on an old-paint
 *    page the border-bottom is the only underline there is.
 *
 * 3. A COMPANION SET LINKS ITSELF. If A's companion block links B, B's must
 *    link A. Over every pair that is the same thing as "each piece links every
 *    other piece", and unlike counting a set it needs no list to be kept.
 *
 * Usage: node scripts/check-editorial-layout.mjs [dir]   (default blog/)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) ?? 'blog';

/* Furniture that must never sit between the headline and the opening line. */
const FURNITURE = [
  'companion', 'sibling', 'series-links', 'read-next', 'seasonal', 'visit-box',
  'collection-cta', 'crawl-cta', 'cta', 'tellus', 'update', 'next-story',
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) continue;      // drafts/ reviewed separately
    if (name.endsWith('.html')) yield p;
  }
}

const fails = [];

/* ---------- rule 3 needs a pass over every file first ---------- */
const links = new Map();   // slug -> Set(slug) linked from a companion block
/* A set can link itself through a companion block OR through cards: the parts
   on a series hub, the essay cards on an arc page. Reading only the blocks
   reported six false asymmetries on pick-the-right-pint and unholy-trinity,
   both of which link every part through their cards. */
const BLOCK = new RegExp(
  `<(div|p|aside|section)[^>]*class="[^"]*\\b(companion|sibling|series-links|read-next|part|essay-card|arc-cell|path-persona)\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`,
  'g');

const pages = [...files(ROOT)];
for (const p of pages) {
  const html = readFileSync(p, 'utf8');
  const out = new Set();
  for (const m of html.matchAll(BLOCK)) {
    for (const h of m[3].matchAll(/href="([^"]+)"/g)) {
      const t = basename(h[1].split('#')[0].split('?')[0]);
      if (t.endsWith('.html') && t !== basename(p)) out.add(t);
    }
  }
  links.set(basename(p), out);
}

for (const p of pages) {
  const html = readFileSync(p, 'utf8');
  const name = basename(p);

  /* 1. what follows the h1 */
  const after = html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*([\s\S]{0,400})/);
  if (after) {
    const next = after[1].trimStart();
    const cls = next.match(/^<[a-z0-9]+[^>]*class="([^"]*)"/i);
    if (cls) {
      const hit = cls[1].split(/\s+/).find((c) => FURNITURE.includes(c));
      if (hit) fails.push(`${name}: .${hit} sits between the headline and the lede (rule 1)`);
    }
  }

  /* 2. a page-level underline on a link. Only meaningful where the sitewide
     underline exists: on a page that does not load pintpress-feature.css the
     border-bottom IS the link affordance, and stripping it would leave none. */
  const onTheSheet = html.includes('pintpress-feature.css');
  for (const st of onTheSheet ? html.matchAll(/<style>([\s\S]*?)<\/style>/g) : []) {
    for (const rule of st[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = rule[1].trim();
      if (!/(^|[\s,>+~])a([.#:[\s,]|$)/.test(sel)) continue;
      /* read the value rather than using a lookahead: /border-bottom:\s*(?!none)/
         matches "border-bottom: none" happily, because \s* backtracks to zero
         and the lookahead then fires at the space. */
      const decl = rule[2].match(/border-bottom:\s*([^;]+)/);
      if (decl && !/^(none|0)\b/.test(decl[1].trim())) {
        fails.push(`${name}: "${sel.slice(0, 60)}" puts a border-bottom on a link (rule 2)`);
      }
    }
  }

  /* 3. companion symmetry */
  for (const other of links.get(name) ?? []) {
    if (!links.has(other)) continue;                 // outside this directory
    if (!links.get(other).has(name)) {
      fails.push(`${name}: links ${other} as a companion, but ${other} does not link back (rule 3)`);
    }
  }
}

if (fails.length) {
  console.error(`✗ ${fails.length} editorial-layout problem(s):`);
  for (const f of fails) console.error(`   ${f}`);
  process.exit(1);
}
console.log(`✓ ${pages.length} page(s): headline-to-lede, link underlines and companion symmetry all clean.`);
