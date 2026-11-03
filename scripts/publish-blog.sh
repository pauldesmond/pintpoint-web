#!/usr/bin/env bash
# publish-blog.sh — one-command blog publish wrapper.
#
# Run after you've:
#   1. Written /blog/<slug>.html
#   2. Added the <item> to /blog/feed.xml
#   3. Added the visible <li> + JSON-LD blogPost entry to /blog/index.html
#   4. Removed the Augustiner-style "Coming next" entry if relevant
#
# Then: ./scripts/publish-blog.sh
#
# Does:
#   - Verifies feed.xml is dirty (otherwise nothing to publish)
#   - Runs sync-from-feed.mjs (regenerates ItemList + sitemap)
#   - Shows the working-tree diff for sanity check
#   - Asks for a commit message (defaults to "blog: publish <newest slug>")
#   - git add -A && commit && push
#   - Pings IndexNow with the new blog URL so Bing/Yandex re-crawl fast

set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Sanity: feed.xml must have uncommitted changes
if git diff --quiet -- blog/feed.xml; then
  echo "❌ blog/feed.xml has no uncommitted changes."
  echo "   Add a new <item> to feed.xml first, then re-run."
  exit 1
fi

# 2. Sync downstream artifacts
echo "→ Syncing index.html ItemList + sitemap.xml from feed.xml..."
node scripts/sync-from-feed.mjs
echo

# 2b. Rebuild llms-full.txt from the curated list in llms.txt.
#     sitemap.xml advertises both llms files as changing weekly; before this
#     ran here, llms-full.txt had not been regenerated since April while the
#     sitemap kept stamping it with today's date (2026-09-19).
echo "→ Rebuilding llms-full.txt..."
node scripts/generate-llms-full.mjs
echo

# 3. Identify the newest post URL from feed.xml (top <item>'s <link>)
NEW_URL=$(awk '/<item>/{p=1} p && /<link>/{gsub(/.*<link>|<\/link>.*/, ""); print; exit}' blog/feed.xml)
NEW_SLUG=$(basename "$NEW_URL" .html)

if [[ -z "${NEW_URL}" ]]; then
  echo "❌ Could not extract newest URL from feed.xml. Aborting."
  exit 1
fi

echo "Newest post detected: ${NEW_URL}"
echo

# 3b. Draft-meta assertion. Codifies the rule from
# feedback_promote_to_live_strip_draft_meta: a promoted post must have
# NO noindex robots meta and NO /blog/drafts/ URLs anywhere. Missing
# either strips indexability — Google refuses to index the live post
# because the draft artifacts still say "don't index" or "the canonical
# lives elsewhere".
POST_FILE="blog/${NEW_SLUG}.html"
if [[ ! -f "${POST_FILE}" ]]; then
  echo "❌ Draft-meta guard: ${POST_FILE} not found on disk (matched from feed but file missing)."
  exit 1
fi

GUARD_FAIL=0

# 1. noindex must be gone. Match any robots meta tag containing noindex.
if grep -nE '<meta[^>]*name="robots"[^>]*noindex|<meta[^>]*noindex[^>]*name="robots"' "${POST_FILE}" >/dev/null; then
  echo "❌ Draft-meta guard failed: noindex robots meta still present. Google will refuse to index."
  grep -nE '<meta[^>]*name="robots"[^>]*noindex|<meta[^>]*noindex[^>]*name="robots"' "${POST_FILE}" | sed 's/^/     /'
  GUARD_FAIL=1
fi

# 2. no /blog/drafts/ URLs anywhere — catches canonical, og:url, og:image,
#    JSON-LD @id/url/mainEntityOfPage, sameAs, breadcrumbs, etc. in one sweep.
if grep -nE '/blog/drafts/' "${POST_FILE}" >/dev/null; then
  echo "❌ Draft-meta guard failed: /blog/drafts/ URLs still present. Swap ALL to /blog/${NEW_SLUG}.html."
  grep -nE '/blog/drafts/' "${POST_FILE}" | sed 's/^/     /'
  GUARD_FAIL=1
fi

# 3. column standard — one width for every PINtPRESS page
#    (feedback_pintpress_column_standard). Two ways to carry it now. The
#    older pages inline a 'PINtPRESS column standard v1' block; everything
#    painted since September takes the same measure from the shared
#    pintpress-feature.css. Either satisfies the rule, neither being
#    present does not.
if ! grep -q 'PINtPRESS column standard v1' "${POST_FILE}" \
   && ! grep -q 'blog/pintpress-feature.css' "${POST_FILE}"; then
  echo "❌ Column guard failed: ${POST_FILE} has neither the inline 'PINtPRESS column standard v1'"
  echo "   block nor a link to /blog/pintpress-feature.css."
  GUARD_FAIL=1
fi

# 4. The things that do not show on the page: the article JSON-LD, the
#    Cloudflare beacon, the pageview script, and every local reference
#    actually resolving to a file we hold. A grep is not enough for any of
#    them, so this is a real check: "../../js/pageview.js" contains the string
#    "/js/pageview.js", which is how a substring guard passes the exact bug it
#    was written to catch.
if ! python3 "$(dirname "$0")/check-promoted-page.py" "${POST_FILE}"; then
  echo "❌ Promotion guard failed: see above."
  GUARD_FAIL=1
fi

# 5. The FAQ exists twice on a page carrying one: once for the reader and once
#    in JSON-LD. Only the visible copy is visible while you edit, so the hidden
#    one drifts silently and keeps answering with text the page has retracted.
#    This reports it before the post goes out rather than months later.
if ! node "$(dirname "$0")/sync-faq-jsonld.mjs" --check "${POST_FILE%/*}/.." >/dev/null 2>&1; then
  node "$(dirname "$0")/sync-faq-jsonld.mjs" --check "${POST_FILE%/*}/.." || true
  echo "❌ A FAQPage block no longer matches the FAQ on its page."
  echo "   Fix: node scripts/sync-faq-jsonld.mjs"
  GUARD_FAIL=1
fi

# 6. The dates in the JSON-LD. A draft written against a future publication
#    date keeps it on promotion, and the draft-meta guard above never looked:
#    the ESB piece went live carrying datePublished 2026-11-21, a month ahead,
#    and same-steel-as-the-wiesn is sitting on 19 November right now. A future
#    date tells Google the page has not happened yet. dateModified earlier than
#    datePublished is the same class of nonsense and is cheap to catch here.
TODAY="$(date -u +%Y-%m-%d)"
DP="$(grep -o '"datePublished"[[:space:]]*:[[:space:]]*"[0-9-]\{10\}"' "${POST_FILE}" | head -1 | grep -o '[0-9-]\{10\}')"
DM="$(grep -o '"dateModified"[[:space:]]*:[[:space:]]*"[0-9-]\{10\}"' "${POST_FILE}" | head -1 | grep -o '[0-9-]\{10\}')"
if [[ -n "${DP}" && "${DP}" > "${TODAY}" ]]; then
  echo "❌ Date guard failed: datePublished ${DP} is in the future (today is ${TODAY})."
  echo "   A future date tells Google the page has not happened yet."
  GUARD_FAIL=1
fi
if [[ -n "${DP}" && -n "${DM}" && "${DM}" < "${DP}" ]]; then
  echo "❌ Date guard failed: dateModified ${DM} is earlier than datePublished ${DP}."
  GUARD_FAIL=1
fi
if [[ -z "${DP}" ]]; then
  echo "⚠️  No datePublished found in ${POST_FILE} — check it carries a BlogPosting block."
fi

# 7. The HowTo JSON-LD, where a page carries one. Same problem as the FAQ:
#    two hand-kept copies of the same steps, one of them invisible while you
#    edit. how-to-find-beer-near-you.html had two steps worded differently
#    from the page and a totalTime of two minutes under a heading promising
#    five.
if ! node "$(dirname "$0")/sync-howto-jsonld.mjs" --check . >/dev/null 2>&1; then
  node "$(dirname "$0")/sync-howto-jsonld.mjs" --check . || true
  echo "❌ A HowTo block no longer matches the steps on its page."
  echo "   Fix: node scripts/sync-howto-jsonld.mjs"
  GUARD_FAIL=1
fi

# 8. Catalogue figures in a blog post. A post is dated writing, so a number in
#    it either carries an "as of" or should not be there. The nightly stats
#    sweep deliberately never touches blog/, so one of our figures written
#    into a post freezes on the day it was written and nothing fixes it:
#    national-pub-day-telegraph-ale said "1,776+ venues globally" against a
#    real 7,070, in a present-tense FAQ answer.
if ! node "$(dirname "$0")/check-blog-counts.mjs" >/dev/null 2>&1; then
  node "$(dirname "$0")/check-blog-counts.mjs" || true
  GUARD_FAIL=1
fi

# 9. A line we corrected coming back. Corrections do not stay made: a later
#    commit re-introduces a retired claim, usually into a copy nobody is
#    editing. Four of those on 3 November 2026 alone, one of them a count
#    corrected an hour earlier. Each hit prints the subject of the commit that
#    retired the line, which is what separates a regression from a source
#    approving the old wording back.
if ! node "$(dirname "$0")/check-corrections.mjs" >/dev/null 2>&1; then
  node "$(dirname "$0")/check-corrections.mjs" || true
  echo "❌ A retired line is back. Confirm it above, then fix it or allowlist it."
  GUARD_FAIL=1
fi

if [[ "$GUARD_FAIL" -eq 1 ]]; then
  echo
  echo "→ Fix ${POST_FILE} and re-run publish-blog.sh. Nothing has been committed."
  echo "  Typical fix: remove <meta name=\"robots\" content=\"noindex,nofollow\"> and swap"
  echo "  /blog/drafts/${NEW_SLUG}.html → /blog/${NEW_SLUG}.html across canonical, og:*, and JSON-LD."
  exit 1
fi

echo "✓ Guards passed (no noindex, no /blog/drafts/ URLs, column standard, JSON-LD, beacon, pageview, FAQ in sync)."
echo

# 5b. dateModified, from the last commit that changed each article body. It was
#     hand-maintained until 3 November 2026 and stale on 37 of the 44 pages
#     carrying it, about half of them because the fact audit had corrected the
#     prose and left the structured data saying nothing had changed since
#     spring. This is a sync, not a guard: it writes before the commit below,
#     and an uncommitted body edit dates to today. It ignores the <head>
#     JSON-LD it writes into, the stylesheets, and the furniture that site-wide
#     design passes touch, so running it twice changes nothing the second time.
echo "→ Syncing JSON-LD dateModified from git history..."
node "$(dirname "$0")/sync-date-modified.mjs"
echo

# 6. Show diff stat
echo "→ Working-tree changes:"
git diff --stat
echo

# 7. Confirmation
read -r -p "Commit + push + IndexNow ping for this post? [y/N] " ANSWER
# Lowercased with tr, not ${ANSWER,,}: that expansion is bash 4 and the bash on
# the front of PATH here is 3.2, so the old line aborted the script with "bad
# substitution" after the guards had passed but before anything was committed.
if [[ "$(printf '%s' "${ANSWER}" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
  echo "Aborted. Run \`git diff\` to review, then commit manually if it looks right."
  exit 0
fi

# 6. Commit + push
git add -A
git commit -m "blog: publish ${NEW_SLUG}"
git push

# 7. IndexNow ping for the new URL + the blog index
echo
echo "→ Pinging IndexNow..."
./scripts/indexnow.sh "${NEW_URL}" "https://pintpoint.co.uk/blog/" || echo "  (IndexNow ping failed; not fatal)"

echo
echo "✅ Published. Live at ${NEW_URL} in 1–2 min (GitHub Pages build)."
