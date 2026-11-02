# The Third Thursday — cover prompt

Square (1:1), output 1254×1254 JPEG → `/blog/images/the-third-thursday.jpg`
Landscape (1200×628) JPEG → `/blog/images/the-third-thursday-x.jpg` (og:image / twitter:image)

Companion to `same-steel-as-the-wiesn`, published the same day. The two covers
must not look like a pair of crowds. Same Steel's cover carries the steel; this
one carries the wine, so if Same Steel ends up with a crowd, pull this one back
to the delivery moment described under Alternative below.

NOT in the Unholy Trinity's navy night-suite style. This is not one of the three
autumn nights.

---

Painted editorial illustration, gouache and ink, visible brush and board
texture. Not photoreal, not 3D, not flat vector. Bold and legible at thumbnail
size: one clear focal event, not a collage. Render ONLY the text specified
below — do not invent signage, slogans, captions, vintages, brand marks, label
text or micro-text anywhere in the image.

Subject: the first glasses of the new wine going up in a crowded Lyon bouchon on
a November night, seen from a low angle. Arms raised, a press of coats and
shoulders receding into warm lamplit haze, faces loose and impressionistic
rather than rendered. In the foreground, two glasses held up and backlit so the
wine glows: BRIGHT PINK-PURPLE, almost translucent, the colour of a wine that
was fruit a few weeks ago. That colour is the entire job of the image and must
be unmistakable at thumbnail size. Behind the crowd, a wooden barrel just
broached on a trestle, with a tin jug beside it.

Ground: deep November blue-black at the edges of the frame, opening into warm
amber lamplight at the centre. The dark must read as a cold night outside a warm
room, not as the trinity's flat navy.

Accent palette: pink-purple wine, amber lamplight, warm cream for the lettering,
one muted slate-blue in the coats. No red-white-blue tricolour, no gold.

Text on the cover, exactly:
- Top left, small, teal: `PINtPRESS` with `THE PINtPOINT BLOG` beneath it.
- Title, large, across the upper third or down the left: `The Third Thursday`

Avoid: bottles with labels, any vintage year, any French flag, berets, the
Eiffel Tower, vineyards in daylight, grape bunches, barrels stencilled with
words, corks, corkscrews, a sommelier, tasting notes, Beaujolais spelled
anywhere in the art, anything Bavarian (the Munich half of the piece does not
belong on this cover), autumn leaves, cartoon faces, clinking as the focal
gesture.

## Alternative, if the crowd clashes with Same Steel's cover

The delivery moment rather than the drinking one: a handcart or a small flatbed
at a kerb before dawn, crates of unlabelled bottles under a tarpaulin, one crate
open with the pink-purple showing through the glass, a lit doorway ahead. Same
palette, same no-text rule. Fewer people, same argument: the wine is allowed out
at a stated moment and not before.

## Carried over from the trinity and Oktoberfest covers

- Put the subject mid-event, never on a table. Two objects on a table produced a
  technically correct and completely lifeless Oktoberfest cover.
- Painted rather than photoreal also dodges the uncanny-face problem, which is
  why the faces above are deliberately loose.
- Generators invent slogans and secondary text. Reject any cover with words
  beyond the two blocks above.
- Generators reach for the deprecated "JOURNALISM FROM PINtPOINT" lockup. The
  current lockup is teal `PINtPRESS · THE PINtPOINT BLOG`.
- If the wine comes out red rather than pink-purple, the cover has failed its
  only job. Regenerate rather than accept.

## After the artwork lands

1. Square to `/blog/images/the-third-thursday.jpg` at 1254×1254, landscape to
   `/blog/images/the-third-thursday-x.jpg` at 1200×628.
2. The draft already carries the og:image and twitter:image metas pointing at
   the landscape file, plus og:image:alt, which needs rewriting to describe the
   artwork that actually arrived.
3. `scripts/build-blog-tiles.mjs` over-generates: it cuts `-x-` landscape
   variants that are not the convention, and tiles for unpublished drafts.
   Delete the extras before committing.
