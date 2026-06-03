# PINtPOINT blog — drift audit

> Each essay read against `_canonical-vocabulary.md`. Generated 2026-06-03.
> Re-run after each app vocab change.

---

## 1. "Beer Recommendation Systems: What Most Get Wrong"
- ✅ No flavour-axis claims; vocab clean (PINtDEXTER, Sip-or-Skip, Head-to-Head, TUNeDEXTER, Safe/Adventurous all correct).
- 🔗 Gap: no **forward** link to "Under the Hood" (only the reverse link exists). Add in the cross-link pass.

## 2. "Under the Hood: How PINtDEXTER Picks Your Pint"
- ❌ **"TastePentagon — six-axis" is WRONG. It is FIVE** (Sweet·Sour·Strength·Body·Bitter). **Live bug — fix immediately.**
- ❌ **FlavourEqualizer is not mentioned at all.** It's now a core viz (detail + H2H). **Add it.**
- ✅ "Beer DNA — eight dimensions (Hoppy, Bitter, Sweet, Fruity, Roast, Tart, Body, Fermentation family)" — matches code exactly.
- ✅ "TUNeDEXTER — five flavours plus body/strength" — correct (and note these 5 ≠ the pentagon's 5; see canon Part 2A).
- ✅ Amstel fermentation-family override (cross-family 0.5× penalty) — matches.

## 3. "The Drinker's Guide to Hops"
- 🟡 Teaching taxonomy = **6 categories** (citrus, tropical, pine & resin, stone fruit & berry, floral & herbal, earthy & spicy); app = **4 sub-labels**. **Intentional richness gradient — do NOT flatten.** Add one bridge sentence each side (see canon Part 3 for collapse map and suggested wording).
- ✅ Hop chemistry / varieties: no conflict with app.

## 4. "Beerology: Anatomy of a Pint" (draft)
- ✅ "5-axis core (Sweet·Bitter·Sour·Body·Strength)" — matches the pentagon.
- ✅ "labels floating across families by score rather than a fixed slot per family" — matches `pickPersonalityDescriptors` (top-3-by-score).
- ✅ Beerology's own 8 axes (1–10) correctly framed as distinct from the in-app viz.
- (Vocab is clean. The open Beerology items — sour-axis gap, Bosko verification, audience — are content decisions, tracked in the consolidated feedback, not vocab drift.)

---

## Order of operations (agreed)
1. **Canon sheet** ✅ (`_canonical-vocabulary.md`)
2. **Drift audit** ✅ (this file)
3. **Fix the live bugs in Under the Hood now** — six-axis→five-axis; add FlavourEqualizer. (No editorial judgement needed.)
4. **Finish Beerology** (broad audience).
5. **Cross-link pass last** — once all four are frozen, wire Why → How → What's-in-it → What-it-feels-like, plus the two hop bridge sentences. No hub page yet.
