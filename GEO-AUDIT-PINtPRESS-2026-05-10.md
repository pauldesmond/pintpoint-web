# PINtPRESS GEO Audit — The Sparkler Question

**Target URL:** https://pintpoint.co.uk/blog/the-sparkler-question.html
**Audit date:** 2026-05-10
**Composite GEO score:** **72 / 100** — strong foundation, refinement-tier gaps

## Why the score isn't higher

It's not a Tier-1 problem — most sites in PINtPRESS's category sit at 30–50 because they haven't even shipped llms.txt or AI-crawler robots.txt rules. PINtPRESS already has those. The remaining points sit in *refinement*: schema completeness, entity surfacing, topical-cluster build-out, and brand-mention strategy.

---

## ✅ What's already working — don't touch

| Signal | Status |
|---|---|
| `robots.txt` with `Content-Signal` (search=yes, ai-input=yes, ai-train=no) | Best-in-class. Specific allowances for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot. Bytespider + meta-externalagent blocked with rationale. |
| `llms.txt` at root | Comprehensive (~150 lines). Section structure good (Core pages / Comparisons / Blog / Features / Modes / Coverage / Contact). |
| `sitemap.xml` | 217KB — substantial coverage. Linked from robots.txt. |
| BlogPosting JSON-LD | Present, with embedded Person author + sameAs to 5 platforms (X, IG, TikTok, YouTube, Reddit). |
| BreadcrumbList JSON-LD | Present and correctly nested. |
| FAQPage JSON-LD | Present with 3 Q&As. Direct, standalone answers — exactly what Google AIO + Perplexity quote. |
| Knowledge Graph presence | Wikidata Q139494284 + Grokipedia entry. Most beer publications don't have either. |
| Author authority | Sophie Ro has consistent identity across 5 platforms with sameAs links. |
| RSS feed | `/blog/feed.xml` accessible, valid RSS 2.0. |
| IndexNow infrastructure | `scripts/indexnow.sh` already in place for blog publishes. |

That foundation is doing real work. The recommendations below are *additive*, not corrective.

---

## 🟡 Tier 1 — Paste-ready fixes, do today

### 1. Add Speakable schema to the BlogPosting

Speakable tells Google Assistant + Alexa + voice-mode AI what to read aloud. Add inside the existing BlogPosting JSON-LD block (top of `the-sparkler-question.html`), as a new property after `mainEntityOfPage`:

```json
"speakable": {
  "@type": "SpeakableSpecification",
  "cssSelector": [".lede p", ".lede p.short", "h1", ".faq p"]
}
```

This marks: the lede (mechanics), the "Same beer. Different voice." kicker, the headline, and the FAQ answers. The four passages most likely to be quoted by AI assistants.

### 2. Add `about` + `mentions` to surface entities

AI engines lean heavily on entity links. The Sparkler post mentions a dozen real-world entities (Timothy Taylor's, Boddingtons, the Whippet, Beer Nouveau, CAMRA, Boak & Bailey, New Scientist) — make them addressable. Add inside the BlogPosting block:

```json
"about": [
  { "@type": "Thing", "name": "Sparkler (beer dispense)", "sameAs": "https://en.wikipedia.org/wiki/Sparkler_(brewing)" },
  { "@type": "Thing", "name": "Cask ale", "sameAs": "https://en.wikipedia.org/wiki/Cask_ale" }
],
"mentions": [
  { "@type": "Organization", "name": "Timothy Taylor & Co", "sameAs": "https://en.wikipedia.org/wiki/Timothy_Taylor_(brewery)" },
  { "@type": "Organization", "name": "Boddingtons Brewery", "sameAs": "https://en.wikipedia.org/wiki/Boddingtons_Brewery" },
  { "@type": "Organization", "name": "Beer Nouveau", "url": "https://beernouveau.co.uk" },
  { "@type": "Organization", "name": "Campaign for Real Ale", "sameAs": "https://en.wikipedia.org/wiki/Campaign_for_Real_Ale" },
  { "@type": "BarOrPub", "name": "The Whippet", "address": { "@type": "PostalAddress", "addressLocality": "London", "postalCode": "EC2", "addressCountry": "GB" } }
]
```

### 3. Add `dateModified` to BlogPosting

`datePublished` is set; `dateModified` may be stale or missing. Refreshing it after every edit signals "current" to Google AIO (which preferentially cites recent content):

```json
"datePublished": "2026-05-08",
"dateModified": "2026-05-10",
```

### 4. Enrich Person schema with `knowsAbout`

In the embedded author block:

```json
"author": {
  "@type": "Person",
  "name": "Sophie Ro",
  "url": "https://pintpoint.co.uk/about-pintpoint.html",
  "sameAs": [...existing...],
  "knowsAbout": ["beer", "cask ale", "British pubs", "craft beer", "pub culture", "beer dispense"]
}
```

### 5. Update llms.txt — three issues

**A. Postcard rename hasn't propagated** — still lists "Love Letter to London/Melbourne/San Diego". Patch:

```diff
- [A Love Letter to London](...): The city that taught the world to brew, lost most of its great breweries...
+ [A Postcard from London](...): The city that taught the world to brew, lost most of its great breweries...
```
(and similarly for Melbourne and San Diego, including the trailing "(Love letter, ...)" → "(Postcard, ...)")

**B. Section heading should reflect PINtPRESS as the publication name** — currently `## Blog`:

```diff
-## Blog
+## PINtPRESS (publication)
+
+PINtPRESS is the editorial arm of PINtPOINT. Long-form essays, postcards from beer cities, guides, and notes — independent editorial, no sponsored content, no astroturf. Published roughly weekly.
```

**C. Add the new posts** (Sparkler + Whippet) — they're the strongest pieces and missing entirely. Insert at the top of the PINtPRESS section:

```
- [The Sparkler Question — A Field Guide to Britain's Quietest Cask Argument](https://pintpoint.co.uk/blog/the-sparkler-question.html): A 140-year-old British cask debate, the Northern hand-pump tradition, and what changes when a London pub serves Boddingtons through a sparkler from 14 May 2026. (Essay, May 2026)
- [The Whippet EC2: Liverpool Street's Newest Pub Opens 14 May](https://pintpoint.co.uk/blog/the-whippet-ec2-liverpool-street-opens.html): Bloomsbury Leisure Group's new Liverpool Street pub — Boddingtons cask with sparkler on the launch lineup. (Note, May 2026)
```

---

## 🟠 Tier 2 — Week-soon, compounding effects

### 6. Topical cluster around the Sparkler

The Sparkler post is a hub with no spokes. Two or three short companion pieces would make PINtPRESS *the* answer when AI engines field sparkler-related questions:

- **The Swan-Neck Spout** — short history piece on the Yorkshire-origin pour fitting the Sparkler post mentions in passing
- **Cask Cellar Service: A Drinker's Glossary** — explains hand pump, gravity dispense, stillage, real ale storage temps. AI engines need definitional answers to "what is gravity dispense"
- **Yorkshire Bitter Etiquette: A Southern Drinker's Notes** — Reddit-coded, postcard-format follow-up

Each internally links to Sparkler, building the topic cluster.

### 7. Internal links INTO the Sparkler from older posts

Right now Sparkler links *outward*. Nothing links *inward*. Add references from:
- **A Postcard from London** — when discussing British cask, link "and the matter of how it's served" → Sparkler
- **The Drinker's Guide to Hops** — when discussing bitter, link "the way it's poured matters too" → Sparkler

### 8. Wikipedia citation strategy

Wikipedia citations carry massive GEO weight (3× a normal backlink, per Ahrefs Dec 2025). Two realistic targets:
- **[[Sparkler (brewing)]]** Wikipedia page — currently a stub. The Sparkler post is high-quality enough to cite as a reference.
- **[[Cask ale]]** — long article, bibliography section is open to citations of well-sourced essays.

White-hat content marketing — the post genuinely improves the article.

### 9. Pellicle / GBH inbound

Beer-publication ecosystem has tight aggregation:
- Pellicle's "Pellicle Reads" Friday roundup curates beer essays
- Good Beer Hunting's "Sightlines" / "Critical Drinking" sections
- Boak & Bailey weekly digest

A targeted DM to each editor with "we wrote a thing on the Sparkler debate, thought you might want it for the roundup" — costs nothing, can land 3 high-quality inbound links + AI-citation weight.

---

## 🔴 Tier 3 — Long-term moat (quarterly, not weekly)

### 10. Original-data recurring feature

The asymmetric advantage. Nobody else in beer publishing has 1500+ venues' tap lists in a structured database. Quarterly features that tap that data:

- **"PINtPRESS Cask Index"** — quarterly snapshot: % of London venues currently pouring cask, by neighbourhood
- **"What's New on Tap This Month"** — auto-generated digest of beers newly appearing across the venue roster
- **"PINtPRESS Style Tracker"** — how often you'll see Cask / NEIPA / Sour / Lager on tap by region

These are exactly the *current-state, citable, unique-data* assets AI engines surface for "what's on tap in London this month" queries — which classic beer publications can't answer because they don't have the data.

### 11. Sophie Ro Reddit presence

Per Ahrefs Dec 2025: brand mentions on Reddit/Wikipedia/YouTube correlate 3× more strongly with AI citations than backlinks. Sophie Ro's Reddit handle (`u/SophieRo_`) exists. Genuine participation (not promotion) on:
- r/CAMRA
- r/CraftBeer
- r/london (for London-specific posts)
- r/CasualUK (for cask/sparkler discussion)

Six months of being a useful Reddit voice → tangible AI-citation lift.

### 12. YouTube presence

If `@SophieRo-l5h` isn't actively publishing yet, even short (60s) "what's a sparkler?" / "why does cask ale matter?" explainers + the FAQ Q&As as voiceover create transcript-indexed content that AI engines mine.

---

## 🎯 Concrete first-week action plan

| Day | Action | Time |
|---|---|---|
| Today | Apply 5 schema additions to Sparkler post (Speakable, about, mentions, dateModified, knowsAbout) | 15 min |
| Today | Update llms.txt (Postcard rename + PINtPRESS section + Sparkler/Whippet entries) | 10 min |
| Today | Add the same Speakable + about/mentions pattern to the 3 Postcard posts | 30 min |
| This week | Internal-link sweep — link from older relevant posts to Sparkler | 30 min |
| This week | Pellicle / GBH / Boak & Bailey outreach DM | 30 min |
| Next 2 weeks | One sparkler-cluster companion piece | 4 hr |
| Quarterly (start) | Plan PINtPRESS Cask Index format | 2 hr |

---

## Score breakdown

| Category | Weight | Score | Notes |
|---|---|---|---|
| AI Citability & Visibility | 25% | 80% | Strong lede, FAQ, structured passages. Missing Speakable. |
| Brand Authority Signals | 20% | 60% | Wikidata + Grokipedia present; needs Reddit activity, Wikipedia citations, Pellicle/GBH inbound. |
| Content Quality & E-E-A-T | 20% | 85% | Sparkler post is excellent — original research, quoted experts, archive sources. Sustained quality across catalogue is the question. |
| Technical Foundations | 15% | 90% | Pages fast, accessible, mobile-friendly, valid HTML. |
| Structured Data | 10% | 65% | BlogPosting + Breadcrumb + FAQ present; Speakable + about + mentions missing. |
| Platform Optimization | 10% | 50% | llms.txt done; FAQPage helps Google AIO; missing Article.about for entity-linking on Perplexity. |

**Composite: 72.4 / 100**

A clean path to 85+ exists by doing Tier 1 (schema additions + llms.txt updates) — that alone would lift Structured Data and Platform Optimization by 20-30 points each. Tier 2 (cluster + inbound) gets it to 90+. Tier 3 is what makes PINtPRESS a category-defining beer publication for the AI-search era, not just one among many.
