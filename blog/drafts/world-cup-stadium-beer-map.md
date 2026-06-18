# PINtPOINT Goes to the World Cup. Sort of.

## A World Cup Beer Map, Built From the Pub End

**Filename when publishing:** `blog/world-cup-stadium-beer-map.html`
**Category pill:** Note (amber/gold — `category note`)
**Meta description:** A UK-based beer app starts mapping decent bars, breweries and taprooms near all 16 World Cup 2026 host stadiums across the USA, Canada and Mexico. Living, collaborative, and very much a first pass.

---

## Body

England have played their first World Cup game, avoided immediate national crisis, and given us the excuse we needed to do something mildly ridiculous: start mapping where to drink around the 2026 host stadiums.

Because the real tournament question is not only who starts on the left, or whether anyone can survive added time without a minor breakdown.

It is: where do you go before kick-off?

Where's a decent taproom near the stadium? What's close enough to walk, good enough to bother with, and not just the first sponsored plastic-cup lager queue you stumble into?

That's where PINtPOINT comes in.

We're building a match-day beer layer for the World Cup: bars, pubs, breweries and taprooms around the host stadiums in the USA, Canada and Mexico. Not a definitive guide handed down from a committee. More a living beer map: part scouting report, part pub crawl, part *surely someone nearby knows somewhere better than this*.

The idea is simple: open PINtPOINT near a host city, see what's around, and find somewhere worth drinking before or after the match.

### The 16 host stadiums

We've started mapping venues around all sixteen, some more confidently than others:

🇺🇸 **United States**
- Mercedes-Benz Stadium, Atlanta
- Gillette Stadium, Boston / Foxborough
- AT&T Stadium, Dallas / Arlington
- NRG Stadium, Houston
- Arrowhead Stadium, Kansas City
- SoFi Stadium, Los Angeles
- Hard Rock Stadium, Miami
- MetLife Stadium, New York / New Jersey
- Lincoln Financial Field, Philadelphia
- Levi's Stadium, San Francisco Bay Area
- Lumen Field, Seattle

🇨🇦 **Canada**
- BMO Field, Toronto
- BC Place, Vancouver

🇲🇽 **Mexico**
- Estadio Akron, Guadalajara
- Estadio Azteca, Mexico City
- Estadio BBVA, Monterrey

### Some are easy. Some are honest hard work.

Some cities already make this easy.

**Atlanta** has Atlantucky Brewing a short walk from Mercedes-Benz Stadium. **Seattle** has Elysian Fields practically breathing on Lumen Field. **Philadelphia** has Victory Beer Hall and Chickie's & Pete's right by Lincoln Financial Field. **Vancouver** has Batch on Plaza and Tap & Barrel near BC Place. **Toronto** has Left Field Brewery — Liberty Village within striking distance of BMO Field.

Other cities are more of a treasure hunt.

**Dallas** and the **Bay Area** are classic North American distance problems: the stadium may be there, but the good beer might involve wheels, planning, and a slightly optimistic definition of "nearby." Russian River is 82 miles from Levi's Stadium. That isn't a typo. It's a confession that Bay Area sports geography and Bay Area beer geography were drawn by different cartographers.

**Mexico City**, **Guadalajara** and **Monterrey** bring a different kind of promise: less familiar to a UK-based app, but exactly the sort of place where local knowledge matters more than any algorithm we point at Google Maps from a desk in England.

And **MetLife** is, at the time of writing, conspicuously thin. If you know what to drink near East Rutherford that isn't the obvious thing, this is your moment to educate us.

### Why a "living" map and not a guide

PINtPOINT should not pretend to know every great beer stop near every stadium. Not yet. Maybe not ever. The useful version of this is collaborative.

If you live near a host city, if you're travelling for a match, if you know the taproom everyone should go to, **send it in**.

If we've missed somewhere brilliant, **tell us**.

If we've listed somewhere that looks good on a map but is absolutely not where you'd send a thirsty football fan, **definitely tell us**.

We'll fold the best local knowledge into the map as it improves.

This is a first pass. A pub-end view of the World Cup. A way to turn "where shall we go?" into something better than opening a generic maps app and hoping the nearest place with "bar" in the name isn't terrible.

We're based in the UK, so yes, building a North American World Cup beer map from over here is mildly ridiculous. But PINtPOINT has always been about the same simple instinct: beer tastes better when there's a bit of discovery in it.

So if you're heading to a match, open PINtPOINT.

Find somewhere nearby.

Add what we missed.

And help us make the World Cup beer map better before the next round catches us offside again.

---

## Primary CTA

**Know a great bar near a World Cup stadium? Put it on the PINtPOINT map.**

---

## Pre-publish checklist

Paul's publish bar: **MetLife fixed, city backfill done, closed venues hidden from match-day mode, article wording no longer overclaims the data.** Everything else can improve after launch.

### Must fix before publish

- [ ] **MetLife / East Rutherford scout pass.** Add a proper New York/New Jersey set. Minimum: 8–12 live venues, with at least 3 plausible match-day options near MetLife or sensible transit/taxi distance.
- [ ] **Backfill `city` on World Cup rows.** Fix the 202 blank city fields so `/pubs/`, city filtering, world stats and index visibility don't quietly miss them.
- [ ] **Filter closed venues out of match-day recommendations.** Keep closed venues for ghost/history if wanted, but the World Cup layer should not suggest them as "go here before kick-off."
- [ ] **Rerun photo/place enrichment after quota reset.** Clear the 34 missing photo/place ID gaps once Google quota resets. Don't raise cap unless you're impatient.
- [ ] **Sanity check sparse cities.** Dallas, Houston, Kansas City, LA, Boston are usable but thin. Add a few more if easy, especially Dallas because the nearest current examples are 16–19 miles from AT&T Stadium.

### Should fix if time

- [ ] **Add explicit World Cup metadata.** Something like `world_cup_2026`, `host_city`, `stadium_name`, `stadium_distance_miles`, `matchday_candidate`. Makes the layer reusable and prevents fuzzy location hacks later.
- [ ] **Separate live match-day venues from broad beer destinations.** Russian River can stay as "Bay Area beer pilgrimage", but don't let it appear as a nearest pre-match option for Levi's.
- [ ] **Check the closest 3 per stadium manually.** Not every close result is good. Remove obvious chains, hotel bars, weird venues, or places that only look relevant because the name has "beer" in it.
- [ ] **Decide the MetLife wording.** If fixed: "all host cities". If not fixed: keep the honest "conspicuously thin" line and invite locals to help.

### Blog / page polish

- [x] **Title locked** — "PINtPOINT Goes to the World Cup. Sort of." with subtitle "A World Cup Beer Map, Built From the Pub End"
- [x] **Lede locked for Sat 20 Jun publish.** The new opener — "England have played their first World Cup game, avoided immediate national crisis..." — refers to the Croatia match on Wed 17 Jun 2026 without naming it, so it stays accurate up to the next England fixture (Tue 23 Jun v Ghana, BBC One). If publish slips past 23 Jun, swap "their first World Cup game" for "their first World Cup games" or rework entirely. The Sat 27 Jun v Panama match is the second hard staleness deadline (ITV1).
- [ ] **Russian River joke** — keep only if you're comfortable defending the broad catchment. Funny and very human, but someone will absolutely say "82 miles isn't nearby."
- [ ] **Internal links:** PINtPOINT → app / web app · "add it" → add-venue surface · "tell us" → feedback/contact · open-PINtPOINT closer → World Cup map / filter if available
- [ ] **CTA card / buttons.**
  - Primary: "Know a great bar near a World Cup stadium? Put it on the PINtPOINT map."
  - Secondary options: "Drop a pin we couldn't", "Put your local on the World Cup map", "Tell us where we got it wrong"

### Assets / publishing

- [ ] **OG image.** North America silhouette + 16 stadium blips + PINtPOINT teal/radar styling. Avoid making it look like a FIFA asset.
- [ ] **SEO / meta.** Meta description already good. Include "World Cup 2026", "bars near stadiums", "beer map", "host cities".
- [ ] **Legal / brand sanity.** Don't imply official FIFA affiliation. Phrase as "World Cup host cities/stadiums", not official partner language.
- [ ] **Final data spot-check after fixes.** Counts by stadium, missing `city` = 0 for WC rows, MetLife > 0, duplicate Untappd / place IDs = 0, `npx tsc --noEmit` passes.

### Filename / page-meta reference

- **Filename when publishing:** `blog/world-cup-stadium-beer-map.html`
- **Category pill:** `Note` (amber/gold — `category note`)
- **British spelling note:** UK-published, North American subject. Keep British spelling — it's part of the voice; readers will translate "pub" themselves.
