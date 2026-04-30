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
