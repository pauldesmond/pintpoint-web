# Beerology — Scoring Card

*Fill in with a beer in hand. Honest scores beat clever ones.*

---

## Beer

- **Name:**
- **Brewery:**
- **Style (declared):**
- **ABV:**
- **Where / when drunk:**

---

## The eight axes (1–10)

Score each on a 1–10 scale. Anchors are calibration points, not gates — score the beer's *experience*, not the brewery's marketing.

| Axis | 1 (low end) | 5 (mid) | 10 (high end) | **Score** |
|------|-------------|---------|---------------|:---------:|
| **Body** | Water-thin | Medium / session-ale weight | Barleywine / imperial stout heft |  |
| **Bitterness** | Barely there | Present but balanced (helles, mild) | West-coast IPA / aggressive |  |
| **Sweetness** | Bone-dry finish | Balanced malt sweetness | Milkshake IPA / pastry stout |  |
| **Roast** | None | Mid-roast (porter, brown ale) | Imperial stout char / coffee |  |
| **Fruit** | Grain only, no fruit character | Some esters or hop-fruit | Saison / NEIPA / fruited sour |  |
| **Finish** | Drops off fast, clean | Moderate length | Lingers for minutes |  |
| **Softness** | Crisp & snappy (pilsner, Helles) | Balanced | Pillowy / round (oat NEIPA, soft mild) |  |
| **Complexity** | One-note macro | Standard craft profile | Multiple layers (BA sour, blended Belgian) |  |

---

## Drinker cues

Pick 3–4. The cues that don't fire stay quiet — wrong cue is worse than no cue.

- [ ] first-pint friendly
- [ ] better on the second
- [ ] quietly complex
- [ ] session-safe
- [ ] food-proof / meal-proof
- [ ] cask purist territory
- [ ] soft landing
- [ ] sharp finish / crisp finish
- [ ] best sipped slowly
- [ ] low-noise pub classic
- [ ] fireside
- [ ] all-nighter risk
- [ ] show-offy
- [ ] roast-forward
- [ ] contemplative

---

## What it feels like

*One sentence, gut take, soul of the system. Examples:*

> *"Drinks like soft brown toast with a dry little snap at the end."*
> *"Starts round, finishes firmer than it looks."*
> *"More pub comfort than beer theatre."*

**Your line:**

---

## Beerology verdict

*One closing diagnosis. Signature ending. Examples:*

> *"Built for repeat visits, not big entrances."*
> *"A pint for lingering rather than chasing."*
> *"All roast in colour, less roast in temperament."*

**Your line:**

---

## Send-back format

When sending the scored card back to Claude for rendering:

```
Beer: <name> · <brewery>
Style: <declared> · ABV <%>
Drunk: <where + when>

Body N / Bitterness N / Sweetness N / Roast N / Fruit N / Finish N / Softness N / Complexity N

Cues: <three or four phrases, dot-separated>

Feels like: <one sentence>

Verdict: <one line>
```

Claude renders the PINtPRESS card with the chrome — radar shape, anatomy labels, anatomical-poster styling — and the post fills in.
