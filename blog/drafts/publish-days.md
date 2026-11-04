# Publish days: November 2026

Four drafts are closed and dated. This is the list of what a human has to do on
each day that `scripts/publish-blog.sh` will not do and will not warn about.

Delete a date from this file once it is out, and delete the file when the last
one goes.

## What the guards already cover

`publish-blog.sh` refuses to publish a file that still carries a `noindex`
robots meta or any `/blog/drafts/` URL, and prints the offending lines. So the
mechanical half of every promotion below is enforced rather than remembered.
It does not check the publish date, the meta line, relative paths, or anything
on another page.

---

## Friday 6 November

Two posts, the J-dag pair.

- `blog/drafts/winter-is-not-christmas.html` → `/blog/`
  - L6 `noindex` out, L10 canonical to `/blog/`. og:url and both JSON-LD urls
    already read `/blog/`.
- `blog/drafts/the-first-friday-of-christmas.html` → `/blog/`
  - L6 `noindex` out, L10 canonical to `/blog/`. Same: the rest already read
    `/blog/`.

Three things on other pages, none of which anything will flag:

1. Three pages carry
   `<!-- LINK ON 6 NOV: /blog/the-first-friday-of-christmas.html -->` against an
   unlinked **Part 3**: `blog/lewes-voice-of-the-fire.html`,
   `blog/unholy-trinity.html` and `blog/green-man-and-season-of-the-witch.html`.
   Wrap the name in that anchor on each. Grep for the comment rather than
   trusting this list.
2. `blog/unholy-trinity.html` L94-98, the Part three card. The heading at L96 is
   bare text where parts one and two are links, and L95 still reads
   `Part three · Friday 6 November · to come`. Link the heading and drop the
   `· to come`.
3. `blog/drafts/the-first-friday-of-christmas.html` L78 reports what Untappd's
   page for Tuborg Julebryg showed when it was read: check-ins running back a
   fortnight before the start time, from Reykjavík, Sweden, the Helsinki to
   Tallinn ferry and Copenhagen. It is written in the present tense with no
   read date, and J-dag fires at 20:59 that evening, so by the time most people
   read the post it will describe a feed that no longer looks like that. Either
   date the observation in the line or restate it before it goes out.

Both anchor edits are body edits, so `sync-date-modified.mjs` will move
`dateModified` on Lewes and on Trinity to 6 November. That is correct.

---

## Wednesday 18 November

- `blog/drafts/the-third-thursday.html` → `/blog/`
  - L6 `noindex` out, L10 canonical to `/blog/`.

Nothing manual beyond that. The companion box at L90 carries
`<!-- LINK ON 19 NOV -->` against an unlinked "Same Steel as the Wiesn", and it
is **meant** to still be bare on the 18th. Leave it.

---

## Thursday 19 November

- `blog/drafts/same-steel-as-the-wiesn.html` → `/blog/`
  - L73 `noindex` out.
  - Four `/blog/drafts/` URLs: L75 canonical, L78 og:url, L97 and L99 in the
    JSON-LD.
  - L2-65 is a stale editorial comment about holding the piece. Strip it.

One thing on another page:

4. `/blog/the-third-thursday.html`, live since the day before, has
   `<!-- LINK ON 19 NOV -->` in its companion box. Wire the anchor now.

---

## Live check, each day

Run once the post is out, not before: Cloudflare caches a 404 if you ask for the
URL before Pages reports `built`.

- 200 from the live URL, with `cf-cache-status` showing `EXPIRED` or `DYNAMIC`.
  A `HIT` can be a pre-deploy copy.
- canonical, og:url and both JSON-LD urls reading `/blog/` on the **served**
  page, not just in the repo
- the entry in `blog/feed.xml` and in the mirrored root `feed.xml`
- `archive.html`, the right `page-N.html`, and the tile on `blog/index.html`
- `llms.txt` (hand-curated) and a regenerated `llms-full.txt`
- the companion links resolving in both directions

## Every promotion, from the ESB and ACE lessons

- `datePublished` must be the day it actually goes. The ESB draft carried a date
  a month in the future.
- No "DRAFT" or "not published" text left in the `.meta` line. None of these
  four have one.
- Relative `../` paths for the beacon, the favicon and images become absolute.
- If a `/r/` short link was ever sent to anyone, repoint it at the live address
  rather than deleting it.

## Where this file sits

`/blog/drafts/*` on the live domain is behind Cloudflare Access, so this answers
a 302 to the login like every draft beside it. It is readable in the public repo,
which is the same position the drafts themselves are already in, for the reasons
set out at the top of `scripts/build-drafts-index.mjs`. Nothing here is secret:
every date in it is printed on the face of the draft it describes.
