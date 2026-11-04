# PINtPRESS feature pages: the markup each component expects

`blog/pintpress-feature.css` is the whole look. A page on it carries a `<style>`
block only for components the sheet has no equivalent for, and that block
contains no hex, no `rgb()` and no `:root`.

Three rules caused every styling mistake made on 4 November 2026. They are first
because they are the ones that will catch you.

## 1. A new box needs two edits, not one

CSS cannot select "has a border", so section 26b carries an explicit list of box
classes. Adding a box means:

1. a container rule in the page `<style>` giving it `border`, `padding` and
   `margin`, and
2. its class added to the selector list in **section 26b** of the sheet.

Doing only the first leaves a bare outline on page paper. Doing only the second
tints something with no shape. Both mistakes happened the day this file was
written: `.factbox`, `.bracket`, `.round-card` and `.winner-card` had their
backgrounds removed and were not added to the list.

The list is sorted alphabetically. Keep it that way, so a missing entry is easy
to see.

## 2. Never put a background on a box

Not in the page `<style>`, not in a `style=` attribute. `background: transparent`
is drift, not a choice: it silently beats the sheet. An inline gradient does the
same thing more loudly, and it is how the one card a page meant to emphasise
became the one card the tint could not reach.

A box inside a box is the exception the rule does not cover. Buttons, tags,
chips, dots and pager links sit on deep paper already, so tinting them erases
them. They stay on paper and are not in the 26b list.

## 3. Footers use `<p class="legal">`

One class, defined at `footer .legal`. Not `.ps-1`, not `.ps-6`, not an inline
`font-size` and `color:#555`, all of which were in use across the blog for the
same sentence. When you convert one, delete the page's own rule for the class it
used, but only after checking nothing else on the page uses it.

---

## Page skeleton

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400;1,8..60,600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/blog/pintpress-feature.css" />
<style> /* only what the sheet does not carry */ </style>
```

`<nav>` and `<footer>` take no inline styles. A nav that sets
`style="color:var(--text)"` is left over from the old dark theme; this sheet does
not define `--text`.

## Components

| Component | Markup | Notes |
|---|---|---|
| Masthead | `<nav aria-label="Primary">` with `<a class="logo">` and a bare `<div>` of links | No inline styles |
| Meta line | `<p class="meta"><span class="imprint">PINtPRESS</span><span class="category guide">Guide</span>DATE · PLACE</p>` | The imprint span is not optional |
| Headline | `<h1>` with `<em>` for the italic part | Nothing between the `</h1>` and the lede |
| Lede | `<p class="lede">` | Takes an automatic drop cap; `class="lede no-drop"` opts out |
| Display quote | `<p class="quote">` | One a piece, near the end |
| Boxes | see rules 1 and 2 | |
| Companion link | one closing line naming the target's own title | No count, no pitch, no box saying the same thing |
| Footer | `imprint-note`, then `.links`, then `<p class="legal">`, then the copyright | |

## Checks

```
node scripts/check-editorial-layout.mjs   # headline-to-lede, link underlines, companion symmetry
node scripts/check-structured-data.mjs    # every JSON-LD block parses
node scripts/check-corrections.mjs        # retired strings have not come back
node scripts/check-blog-counts.mjs        # no undated catalogue figures
```

A page is finished when `grep -c 'style="'` returns 0 and its `<style>` block
contains no `#`.
