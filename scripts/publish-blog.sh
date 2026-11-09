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
#   - Waits for the Pages build, confirms the URL serves the article, and only
#     THEN pings IndexNow (see the long note at step 7 for why that order)
#
# RUNTIME: this can now sit for several minutes at step 7, waiting on the Pages
# build and the edge. That wait is deliberate. If you run it from a tool with a
# short command timeout, give it ten minutes or run it in the background.

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

# 2c. Rebuild the drafts index. It greys a draft once a published counterpart
#     exists, so promoting a post without this leaves the index claiming the
#     draft is still unpublished. It was running by hand only, and on 4 Nov
#     the served page said 13 drafts and 15 notes while the tree held 12 and 17.
echo "→ Rebuilding the drafts index..."
node scripts/build-drafts-index.mjs
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

# 6. The dates in the JSON-LD. The `|| true` on both of these is load-bearing:
#    under `set -o pipefail` a page with no dateModified yet makes the final
#    grep exit 1, which `set -e` turned into a silent abort of the whole script
#    right here, after the guards had passed and before anything was printed.
#    A brand-new post has no dateModified until sync-date-modified.mjs runs,
#    which is forty lines below this, so every first publish hit it. Found on
#    6 November 2026 publishing the J-dag pair.
#
#    A draft written against a future publication
#    date keeps it on promotion, and the draft-meta guard above never looked:
#    the ESB piece went live carrying datePublished 2026-11-21, a month ahead,
#    and same-steel-as-the-wiesn is sitting on 19 November right now. A future
#    date tells Google the page has not happened yet. dateModified earlier than
#    datePublished is the same class of nonsense and is cheap to catch here.
TODAY="$(date -u +%Y-%m-%d)"
DP="$(grep -o '"datePublished"[[:space:]]*:[[:space:]]*"[0-9-]\{10\}"' "${POST_FILE}" | head -1 | grep -o '[0-9-]\{10\}' || true)"
DM="$(grep -o '"dateModified"[[:space:]]*:[[:space:]]*"[0-9-]\{10\}"' "${POST_FILE}" | head -1 | grep -o '[0-9-]\{10\}' || true)"
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

# 5a. The X card title bar. NOT a guard, a warning, because it only applies to
#     a card whose artwork already carries the headline.
#
#     X draws its own title bar across the foot of the card and fills it from
#     twitter:title, falling back to og:title. When the art carries the
#     headline, as every PINtPRESS cover does, leaving twitter:title unset or
#     equal to og:title prints the headline twice, and three times counting the
#     caption above it. Paul spotted it on the ACE post, 9 November 2026.
#
#     It has to be right BEFORE the first share: X keeps what it found on its
#     first fetch, and the only way back is a repost with ?v=2.
OG_TITLE=$(grep -o 'property="og:title" content="[^"]*"' "${POST_FILE}" | head -1 | sed 's/.*content="//;s/"$//')
TW_TITLE=$(grep -o 'name="twitter:title" content="[^"]*"' "${POST_FILE}" | head -1 | sed 's/.*content="//;s/"$//')
if [[ -z "${TW_TITLE}" || "${TW_TITLE}" == "${OG_TITLE}" ]]; then
  echo "⚠️  twitter:title is $( [[ -z "${TW_TITLE}" ]] && echo "not set" || echo "the same as og:title" )."
  echo "   If this card's art carries the headline, X will print it twice. Give"
  echo "   twitter:title a line that identifies the piece and adds something."
  echo "   Ignore this if the artwork carries no headline."
  echo
fi

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

# 7. IndexNow, but only once the URL actually serves the article.
#
# This used to fire the instant `git push` returned. Bing and Yandex then
# fetched a URL GitHub Pages had not finished building, got a 404, and
# Cloudflare stored it at the edge. On 6 November 2026 the J-dag post served a
# cached 404 for about three minutes after its own build reported `built`,
# `cf-cache-status: HIT` with GitHub's request id replayed on every retry,
# while its companion in the same commit, which nothing had asked for early,
# served 200 straight away. No human requested that URL early. This script did.
#
# So the order is now: build confirmed, edge given a moment, page confirmed to
# return 200 AND to carry its own canonical, and only then the ping. If the
# deploy has not caught up inside the budget, the ping is skipped and said so
# out loud with the command to run by hand. A late ping costs a day of crawl
# latency. An early one costs a cached 404 on a brand new post.
#
# The EDGE_GRACE sleep is the load-bearing part and the easiest to delete by
# mistake: after `built`, the bytes are not necessarily at the edge yet, so the
# FIRST request is the one that can cache the 404. Making that first request
# ourselves, promptly, is the bug, not the fix.

PAGES_REPO="$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
PUSHED_SHA="$(git rev-parse HEAD)"
BUILD_BUDGET=240   # seconds to wait for Pages to report `built` for our commit
EDGE_GRACE=120     # seconds after `built` before the first request
SERVE_BUDGET=240   # seconds to wait for the URL to serve the article

ping_deferred() {
  echo
  echo "⚠️  IndexNow NOT pinged: $1"
  echo "   The post is committed and pushed. Only the search-engine ping is outstanding,"
  echo "   and it is deliberately not being sent blind: that is what cached a 404 before."
  echo "   Once ${NEW_URL} loads in a browser, run:"
  echo "     ./scripts/indexnow.sh \"${NEW_URL}\" \"https://pintpoint.co.uk/blog/\""
}

echo
echo "→ Waiting for the GitHub Pages build of ${PUSHED_SHA:0:7} (up to ${BUILD_BUDGET}s)..."
BUILD_OK=0
if command -v gh >/dev/null 2>&1; then
  WAITED=0
  while [[ "${WAITED}" -lt "${BUILD_BUDGET}" ]]; do
    STATUS="$(gh api "repos/${PAGES_REPO}/pages/builds/latest" --jq '.status + " " + .commit' 2>/dev/null || true)"
    if [[ "${STATUS}" == "built ${PUSHED_SHA}" ]]; then BUILD_OK=1; break; fi
    sleep 15
    WAITED=$(( WAITED + 15 ))
  done
fi

if [[ "${BUILD_OK}" -ne 1 ]]; then
  if command -v gh >/dev/null 2>&1; then
    ping_deferred "the Pages build for ${PUSHED_SHA:0:7} did not report \`built\` within ${BUILD_BUDGET}s"
  else
    ping_deferred "gh is not on PATH, so the Pages build could not be confirmed"
  fi
else
  echo "  ✓ built"
  echo "→ Giving the edge ${EDGE_GRACE}s before the first request. Asking too early is"
  echo "  what caches the 404, so this wait is the whole point of the reordering."
  sleep "${EDGE_GRACE}"

  echo "→ Checking ${NEW_URL} returns 200 and carries the article..."
  BODY_TMP="$(mktemp)"
  trap 'rm -f "${BODY_TMP}"' EXIT
  EXPECT="rel=\"canonical\" href=\"${NEW_URL}\""
  SERVE_OK=0
  WAITED=0
  while [[ "${WAITED}" -lt "${SERVE_BUDGET}" ]]; do
    CODE="$(curl -sS -A 'PINtPOINT publish check (pintpoint.co.uk)' --max-time 20 \
              -o "${BODY_TMP}" -w '%{http_code}' "${NEW_URL}" 2>/dev/null || true)"
    if [[ "${CODE}" == "200" ]] && grep -qF "${EXPECT}" "${BODY_TMP}"; then SERVE_OK=1; break; fi
    sleep 20
    WAITED=$(( WAITED + 20 ))
  done

  if [[ "${SERVE_OK}" -eq 1 ]]; then
    echo "  ✓ 200, and the served page carries its own canonical"
    echo
    echo "→ Pinging IndexNow..."
    ./scripts/indexnow.sh "${NEW_URL}" "https://pintpoint.co.uk/blog/" || echo "  (IndexNow ping failed; not fatal)"
  else
    ping_deferred "${NEW_URL} did not serve the article within ${SERVE_BUDGET}s of the build (last status: ${CODE:-none})"
  fi
fi

echo
if [[ "${SERVE_OK:-0}" -eq 1 ]]; then
  echo "✅ Published and live at ${NEW_URL}, IndexNow pinged."
else
  echo "✅ Published and pushed: ${NEW_URL}"
  echo "   Live once the Pages build lands. IndexNow still to send, see above."
fi
