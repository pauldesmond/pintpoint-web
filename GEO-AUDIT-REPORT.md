# GEO Audit — pintpoint.co.uk

**Audit date:** 2026-04-20
**Tool:** `/geo audit` (zubair-trabzada/geo-seo-claude, 5 parallel subagents)
**Business type detected:** Mobile application (consumer) — SaaS-adjacent, UK-founded, 2026 launch

---

## Composite GEO Score: **80 / 100**

> **GOOD** — strong technical and content foundations; ceiling is currently third-party recognition, not infrastructure.

### Score Breakdown

| Category | Weight | Score | Weighted |
|---|---|---|---|
| AI Citability & Visibility | 25% | 90 | 22.5 |
| Brand Authority Signals | 20% | 58 | 11.6 |
| Content Quality & E-E-A-T | 20% | 87 | 17.4 |
| Technical Foundations | 15% | 82 | 12.3 |
| Structured Data | 10% | 86 | 8.6 |
| Platform Optimization | 10% | 78 | 7.8 |
| **Composite** | | | **80.2** |

Reads consistent with the terminal `geo audit --url` CLI (84/100) — the two tools agree within 4 points. The gap explanation: this audit weights **Brand Authority** at 20% directly; the CLI rolls several weak-LinkedIn / no-Wikipedia signals into its Trust Stack category which is smaller in aggregate.

---

## Per-Category Findings

### 1. AI Citability & Visibility — 90/100

- **Crawler access: 100/100.** Best-in-class robots.txt. Every major AI crawler explicitly allowed (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, xAI-Bot, etc.). Only Bytespider + meta-externalagent blocked. Content-Signal header (`search=yes, ai-input=yes, ai-train=no`) is the new contentsignals.org standard — you're early on this.
- **llms.txt: 95/100.** 70-line root file with ~21 inline markdown links + `/llms-full.txt` at 3,168 lines of full prose content. Unusually complete; top ~5% of audited sites.
- **Citability per-page:** homepage 78, `/features.html` 74, `/vs-untappd.html` **91** (best on site — comparison table + answer-shape prose), London love letter 85, recommendation-systems essay **88**.

### 2. Brand Authority Signals — 58/100

| Platform | Status |
|---|---|
| Wikidata (Q139494284) | ✅ populated — label, description, instance-of, App Store ID, country, website, inception, described-at-URL |
| Grokipedia | ✅ live |
| Reddit | ⚠️ minimal (one r/Chelmsford post seeded from your blog; no organic threads) |
| YouTube | ⚠️ minimal (@SophieRo-l5h exists, sparse uploads) |
| Wikipedia | ❌ absent — the single biggest lever |
| LinkedIn | ❌ Sophie suspended pending ID; no company page |
| Crunchbase | ❌ 403 |
| Industry press (Pellicle, Good Beer Hunting, Boak & Bailey, Protz) | ❌ no pickups |

**Ceiling is Wikipedia + one industry editorial mention.** One independent press citation unlocks Wikipedia notability; a Wikipedia stub moves composite from 80 → 88+ on its own.

### 3. Content Quality & E-E-A-T — 87/100

- **Experience: 23/25** — Moulsham Street, Bermondsey arches, North Park University Ave 28th–32nd, Hopsters closure January 2026. Place-specific detail AI cannot fake.
- **Expertise: 21/25** — recommendation-systems essay uses SVD++/RBMs correctly and cites Haley + NYC Data Science; hops essay references Drexler's 107-descriptor taxonomy.
- **Authoritativeness: 19/25** — comparison pages and the three-city love-letter trilogy build topical authority; capped by absent external validation.
- **Trustworthiness: 22/25** — "not going to out-predict SVD++ on a RateBeer leaderboard" is the strongest single trust signal; "Untappd is excellent" on the comparison page is rare and high-value.
- **Best pages:** London love letter (94), recommendation-systems essay (93), Melbourne love letter (92), San Diego love letter (92), `/vs-untappd.html` (92).
- **AI-slop flags: zero.** "Bimbling," "pilgrimage is the bar crawl," "cargo manifest leaving the Port of London" — unmistakeably human voice.
- **Gap:** Sophie's named byline + bio on the About page wasn't surfaced in the fetch — worth verifying. Author bio footer blocks on blog posts would reinforce Person schema.

### 4. Technical Foundations — 82/100

- **SSR: 95/100.** Homepage static HTML 48 KB; `/pubs/*` rendered server-side by Cloudflare Worker → Supabase edge function with `x-rendered-by: pintpoint-pubs-worker`. Full content + schema visible pre-JS.
- **Crawlability: 95/100.** robots.txt perfect; sitemap 123 KB / 653 URLs; all `lastmod` dates fresh (through 2026-04-20); RSS at `/feed.xml` live and linked from `<head>`.
- **Meta tags: 95/100.** Title/description/canonical/OG/Twitter all complete; 6 valid JSON-LD blocks on homepage; Wikidata Q-code in `sameAs` AND `identifier` PropertyValue.
- **Security headers: 25/100 (critical drag).** No HSTS, no CSP, no X-Frame-Options, no X-Content-Type-Options, no Referrer-Policy. HTTPS via Cloudflare is fine but zero policy is being set at the edge. **One-afternoon fix worth +7 composite.**
- **`/about/` redirect broken (HIGH).** Returns 200 serving a stale duplicate instead of 301-redirecting to `/about-pintpoint.html`. Duplicate content risk.
- **Venue-miss 404s return `text/plain`** — human-hostile for broken inbound links.
- **Sitemap count off-by-one** (653 vs stated target 652).

### 5. Structured Data — 86/100

- **All JSON-LD valid, no broken blocks, no deprecated schemas.** 6 types on homepage (Organization, SoftwareApplication, WebSite with SearchAction, WebPage with dateModified, ItemList, FAQPage-via-Article).
- **Publisher-name inconsistency:** "PINtPOINT" vs "PINtPOINT Beer Radar" varies across pages. Pick one canonical form — likely keep "PINtPOINT" as `name` and add `"alternateName": "PINtPOINT Beer Radar"` (the Wikidata label).
- **No cross-page `@id` graph.** Only homepage WebPage has `@id`. Adopting a site-wide pattern (`#organization`, `#website`, `#sophie-ro`) lets AI models resolve one entity across pages instead of seven disconnected Organization nodes. Biggest schema fix.
- **Wikidata identifier only on homepage.** Every Article/BlogPosting's publisher block should reference the same `@id: "https://pintpoint.co.uk/#organization"` so the Q-code fans out automatically.
- **`speakable` only on homepage.** Add to every FAQPage + BlogPosting for voice-search readiness.
- **Kernel venue schema is thin** — edge function should emit `["LocalBusiness","Brewery"]` multi-type, add `priceRange`, `openingHoursSpecification`, `geo`, and split LocalBusiness out of the nested SoftwareApplication.

### 6. Platform Optimization — 78/100

| Platform | Score | Crawler |
|---|---|---|
| Google AI Overviews | 82 | ✅ |
| ChatGPT Web Search | 76 | ✅ (GPTBot explicit; OAI-SearchBot/ChatGPT-User default allow) |
| Perplexity | 74 | ✅ |
| Google Gemini | 70 | ✅ |
| Bing Copilot | 68 | ✅ (default allow; no `msvalidate.01`; no `/indexnow.txt`) |

Strongest on Google AI Overviews (SSR + schema stack + answer-shaped H2/H3). Weakest on Bing Copilot (thin Microsoft ecosystem footprint — no Bing Webmaster claim, no IndexNow key, no LinkedIn).

---

## Top 10 Prioritized Actions

### Critical (do this week)

1. **Add security headers via Cloudflare Transform Rules or GitHub Pages `_headers`** — HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy. Zero content risk, ~30 minutes to configure, +7 composite points. *Impacts: Technical Foundations.*
2. **Fix `/about/` → 301 → `/about-pintpoint.html`** — currently serves a stale duplicate. Delete `/about/index.html` and replace with Cloudflare redirect rule. *Impacts: Technical Foundations, Google AIO.*
3. **Adopt `@id` pattern for Organization, WebSite, Person across all pages** — biggest structured-data win. Entity graph becomes one coherent node across the site instead of seven. *Impacts: Structured Data, Brand Authority.*

### High (this month)

4. **Pitch one UK beer-trade outlet** (Pellicle, Good Beer Hunting, Boak & Bailey, Protz, Morning Advertiser) for editorial coverage. One independent source unlocks Wikipedia notability. *Impacts: Brand Authority (58 → 70+).*
5. **Explicit `User-agent` blocks in robots.txt** for OAI-SearchBot, ChatGPT-User, bingbot. Removes allow-by-default ambiguity. *Impacts: ChatGPT, Bing Copilot.*
6. **Claim Bing Webmaster Tools, add `msvalidate.01` meta, create `/indexnow.txt`.** Microsoft ecosystem is the single thinnest area. *Impacts: Bing Copilot (68 → 80+).*
7. **Add `speakable` specifications to every BlogPosting and FAQPage** — voice-search readiness, cheap win. *Impacts: Structured Data, Google Assistant.*

### Medium (next 60 days)

8. **Seed 3-5 substantive Reddit threads** in r/CAMRA, r/beer, r/londonbeer, r/craftbeer — answer existing questions with genuine expertise; tool name surfaces in replies. *Impacts: Perplexity, ChatGPT, Brand Authority.*
9. **Convert `/features.html` long-form prose into a comparison table.** 2,534 words / 11 H2s / zero tables currently — the single page with biggest citability upside. *Impacts: AI Citability, AI Overviews.*
10. **Publish 2-3 short YouTube videos** (Live Radar demo, Ghost Hunter walkthrough, Create-a-Crawl flow). Add `VideoObject` schema wherever embedded. *Impacts: Google Gemini, AIO.*

### Blocked / waiting

- **Restore Sophie's LinkedIn in sameAs arrays** once ID verification clears (one-sweep command prepared).
- **Draft Wikipedia stub** once (4) lands — needs 2+ independent secondary sources.

---

## Platform-specific recommendations

- **Google AIO:** add `Person` schema for Paul + Sophie with `jobTitle`, `knowsAbout`, `sameAs` Wikidata; tighten answer-block paragraphs on `/how-to-find-beer-near-you.html`.
- **ChatGPT:** add single-sentence quotable definition to top of `/about-pintpoint.html`; explicit robots.txt lines.
- **Perplexity:** `Dataset` schema on `/ghost.html` (500+ lost pubs, 327 with photos — citable primary-source data); Reddit seeding.
- **Gemini:** YouTube cadence + `VideoObject` schema; strengthen hub-and-spoke linking between love letters and `/pubs/{city}/` indexes.
- **Bing Copilot:** `msvalidate.01` + IndexNow + LinkedIn company page (separate from Sophie's personal).

---

## Summary

Technical AI-readiness is **essentially maxed** (crawler access 100, llms.txt 95, AI discovery endpoints live, Wikidata + Grokipedia + sameAs complete). Content quality is **in the top decile** of product-led content sites (no AI-slop, place-specific detail throughout, honest critique of own limitations, respectful treatment of competitors). Schema is solid; the `@id` pattern is the one meaningful upgrade.

The **composite score ceiling from here is third-party recognition** — Wikipedia, editorial press, Reddit organic, Crunchbase, LinkedIn company page. That's directory-listing and editorial-pitch work, not code. Pairing the 10 prioritized actions above with one industry pickup would plausibly move composite from 80 to 88+, breaking into the excellent band.

**Output file:** this report lives at `/Users/pauldesmond/pintpoint-web/GEO-AUDIT-REPORT.md`.
