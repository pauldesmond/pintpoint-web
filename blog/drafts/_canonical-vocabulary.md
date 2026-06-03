# PINtPOINT blog — canonical vocabulary

> Source of truth is the **app code** (`rork-pintpoint/expo`), not any essay.
> Reconcile all four blog pieces against this. Generated 2026-06-03 from a
> read of the live code; re-verify against code before trusting if the app
> has moved on.
>
> Pure reference. The per-essay drift audit lives alongside in
> `_drift-audit.md`.

---

## Part 1 — Canonical vocabulary (what the app actually implements)

### Beer DNA — the underlying data (`services/flavourProfiles.ts`)
The per-beer profile. **6 flavour axes, each scored 0–5**, plus three non-flavour fields:

| Axis | Range | Meaning |
|---|---|---|
| hoppy | 0–5 | hop aroma/flavour (citrus, pine, tropical) |
| bitter | 0–5 | bitterness on the palate (boil, not aroma) |
| sweet | 0–5 | |
| fruity | 0–5 | juicy / estery |
| roast | 0–5 | maltiness / roast (coffee, cocoa, toast) |
| tart | 0–5 | sour / acidic |
| **body** | light · medium · full | (category, not 0–5) |
| **abvRange** | [min, max] | |
| **family** | ale · lager · mixed · wild · cider · mead | fermentation family (6 values) |
| confidence | 0.35–0.95 | mapping reliability |

➡️ **"Beer DNA = eight dimensions"** = the 6 flavour axes + body + family. That phrasing is fine. But **the 6 flavour axes are not the same set the charts display** — see Part 2.

### TastePentagon / FlavourRadar — single-beer brand mark (`components/FlavourRadar.tsx`, `TastePentagon.tsx`)
**Renders FIVE axes** (12 o'clock clockwise): **Sweet · Sour · Strength · Body · Bitter**.
- "Sour" = the `tart` field. "Strength" = `abvToStrength(abv)`.
- It is a **pentagon → 5 axes**. Never "six-axis."

### FlavourEqualizer — comparison view (`components/FlavourEqualizer.tsx`)
**8 columns**, L→R: **BITTER · SWEET · SOUR** (fixed) · **[adaptive 1] · [adaptive 2] · [adaptive 3]** (personality, top-3-by-score) · **BODY · ABV** (fixed). Each column 0–5 → 5 segments.
- Personality labels float across families by score (not a fixed slot per family).
- Two colour modes: `heat` (green→amber→red) and `brand` (teal). User-selectable (`flavourVizColor`).
- Used on the beer-detail screen and Head-to-Head.
- **Current default:** equaliser. `DEFAULT_SETTINGS.flavourViz = 'equaliser'` (`context/UserSettingsContext.tsx:17`); H2H reads the preference (`app/head-to-head/play.tsx:185`). **Editorial discipline:** essays should NOT anchor copy to which viz is default — say "used in H2H," not "default in H2H." The default is a UX call that can flip without warning; the fact-that-it's-available is durable.

### Personality sub-labels (`services/subDescriptors.ts`)
- **Hop family (4):** Citrusy · Tropical · Piney · Floral (+ generic **Hoppy**). Keyword precedence: Citrusy → Tropical → Piney → Floral.
- **Malt family (4):** Chocolatey · Caramel · Roasty · Toasty (+ generic **Malty**). Keyword precedence: Chocolatey → Caramel → Roasty → Toasty.
- **Fruit family (2):** Fruity (default) · Juicy (keyword-fired).
- All sub-labels score from their parent profile axis (hop labels → `hoppy`, malt → `roast`, fruit → `fruity`). New labels change the *name*, never the bar height.

**Selection rule, prose-safe:**
- Always **top 3 by score**, picked from the candidate pool (hop subs, malt subs, Juicy, plus the three family parents).
- **Families can repeat** when their sub-labels genuinely outrank others — a stout can show two malt labels; a NEIPA can show two hop labels.
- **Redundant parent labels are suppressed** when a more specific child wins outright (Citrusy 5 hides Hoppy 4). At tied scores both keep — a stout where Roasty 5 and Malty 5 tie shows both ("dominantly roasty, broadly malty").
- LLM `sub_scores` are preferred over keyword-derived scores when present and non-zero, which is why newer beers render richly and older ones render sparser.

### User taste preference (TUNeDEXTER sliders / `userProfile`)
**5 flavour sliders: bitter · sweet · fruity · roast · tart** (0–1 normalised) **+ body + strength** controls.
- ⚠️ **No `hoppy` slider** — the Hop column's amber preference marker proxies `user.bitter`.
- ⚠️ These 5 are **NOT** the pentagon's 5 (see Part 2).

### Derived / supporting
- **`abvToStrength`**: `(abv − 2) / 1.6`, clamped 0–5. Strength is a **derived 0–5 score, not literal ABV %**.
- **Drinkability buckets (4):** Session · Standard · Strong · Boozy. Mechanical, ABV-only — independent of style, perceived intensity, or LLM opinion. A 4.5% imperial-styled beer is still Session.

| Bucket | ABV |
|---|---|
| Session | < 4.6% |
| Standard | 4.6% – 5.7% |
| Strong | 5.8% – 7.4% |
| Boozy | ≥ 7.5% |

- **Engine / UX names:** PINtDEXTER (engine) · Sip-or-Skip (onboarding swipe) · Head-to-Head (pair choice) · TUNeDEXTER (sliders) · Safe/Adventurous toggle.

### Beerology (BLOG-ONLY — not in the app)
A **separate** framework: **8 axes, scored 1–10** — Body · Bitterness · Sweetness · Roast · Fruit · Finish · Softness · Complexity. Deliberately a different axis set and scale from the in-app viz. Do not conflate with the equaliser's 8 columns.

---

## Part 2 — Two gotchas that *cause* the drift (call these out so it doesn't recur)

**A. There are TWO different 5-tuples in play.** Easy to conflate; the "six-axis" error is a symptom.
- **Pentagon DISPLAY axes (5):** Sweet · Sour · Strength · Body · Bitter
- **User PREFERENCE axes (5):** Bitter · Sweet · Fruity · Roast · Tart
- They overlap on Sweet/Bitter only. Different sets, different purpose. Any essay touching both (Under the Hood does) must keep them distinct.

**B. There are FOUR scales in the universe.** Don't let an essay state the wrong one.
- Beer DNA / profile axes: **0–5**
- User sliders: **0–1** (normalised)
- `abvToStrength` output: **0–5** (derived, not %)
- Beerology axes: **1–10** (blog-only)

---

## Part 3 — Hop category collapse map (for the bridge sentences)

How the Hops piece's 6 teaching categories map onto the app's 4 sub-labels:

| Hops essay (6) | App sub-label (4) |
|---|---|
| Citrus | **Citrusy** |
| Tropical | **Tropical** |
| Stone fruit & berry | **Tropical** (folded in) |
| Pine & resin | **Piney** |
| Floral & herbal | **Floral** |
| Earthy & spicy | **Floral** (folded in) / generic Hoppy |

Suggested bridges:
- In **Hops**: *"PINtPOINT collapses these into four practical labels in-app — Citrusy, Tropical, Piney, Floral."*
- In **Beerology / Under the Hood**: *"…a compressed view of the richer hop taxonomy covered separately."*

---

## Part 4 — Quick-lookup non-equivalences

The easy mistakes — pairs that look interchangeable but aren't.

| This | is not | this |
|---|---|---|
| **Beer DNA's 6 flavour axes** | ≠ | **TastePentagon's 5 axes** *(the trap behind the "six-axis pentagon" error)* |
| **Beerology's 8 axes** (1–10) | ≠ | **FlavourEqualizer's 8 columns** (0–5) *(coincident count, different framework, different scale)* |
| **Pentagon's 5 display axes** | ≠ | **TUNeDEXTER's 5 preference axes** *(overlap on Sweet/Bitter only — see Part 2A)* |
| **Hops essay's 6 teaching categories** | ≠ | **App's 4 hop sub-labels** *(teaching taxonomy is intentionally richer; bridge with one sentence each side — see Part 3)* |
| **Beerology (essay framework)** | ≠ | **a PINtPOINT app feature** *(no in-app Beerology surface exists)* |
| **PINtDEXTER (the engine)** | ≠ | **a chart** *(it's the recommender system, described in the Under the Hood essay)* |
| **`abvToStrength` output 0–5** | ≠ | **literal ABV %** *(derived score, see Part 2B)* |
