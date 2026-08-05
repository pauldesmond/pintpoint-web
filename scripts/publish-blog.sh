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

if [[ "$GUARD_FAIL" -eq 1 ]]; then
  echo
  echo "→ Fix ${POST_FILE} and re-run publish-blog.sh. Nothing has been committed."
  echo "  Typical fix: remove <meta name=\"robots\" content=\"noindex,nofollow\"> and swap"
  echo "  /blog/drafts/${NEW_SLUG}.html → /blog/${NEW_SLUG}.html across canonical, og:*, and JSON-LD."
  exit 1
fi

echo "✓ Draft-meta guard passed (no noindex, no /blog/drafts/ URLs)."
echo

# 4. Show diff stat
echo "→ Working-tree changes:"
git diff --stat
echo

# 5. Confirmation
read -r -p "Commit + push + IndexNow ping for this post? [y/N] " ANSWER
if [[ "${ANSWER,,}" != "y" ]]; then
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
