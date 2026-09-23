#!/usr/bin/env bash
# One-shot promote for september-is-oktoberfest, written 18 Sep 2026.
# Run from the repo root. Idempotent: refuses if the live file already exists.
set -euo pipefail
cd "$(dirname "$0")/.."

SLUG="september-is-oktoberfest"
DRAFT="blog/drafts/${SLUG}.html"
LIVE="blog/${SLUG}.html"

[[ -f "$LIVE" ]] && { echo "❌ $LIVE already exists — already published?"; exit 1; }
[[ -f "$DRAFT" ]] || { echo "❌ $DRAFT missing"; exit 1; }

python3 - <<'PY'
import re
slug='september-is-oktoberfest'
s=open(f'blog/drafts/{slug}.html').read()
# strip the draft markers
s=re.sub(r'\s*<meta name="robots" content="noindex[^"]*" />','',s)
s=s.replace(f'/blog/drafts/{slug}.html', f'/blog/{slug}.html')
open(f'blog/{slug}.html','w').write(s)
assert 'noindex' not in s and '/blog/drafts/' not in s
print('live file written')

# feed
f=open('blog/feed.xml').read()
item = '''    <item>
      <title>September is Oktoberfest</title>
      <link>https://pintpoint.co.uk/blog/september-is-oktoberfest.html</link>
      <guid isPermaLink="true">https://pintpoint.co.uk/blog/september-is-oktoberfest.html</guid>
      <pubDate>Fri, 18 Sep 2026 10:59:00 +0100</pubDate>
      <description>The 191st Wiesn opens tomorrow at noon. Munich swapped its amber M&#228;rzen for pale Festbier decades ago, America kept the old one, and Britain treats the whole vocabulary as a licence.</description>
    </item>
'''
i=f.index('<item>'); i=f.rindex('\n',0,i)+1
open('blog/feed.xml','w').write(f[:i]+item+f[i:])
print('feed updated')

# blog index card, above the newest
idx=open('blog/index.html').read()
card='''      <li>
        <a href="september-is-oktoberfest.html" class="post">
          <div class="post-date essay">18 September 2026 &middot; Essay</div>
          <div class="post-title">September is Oktoberfest</div>
          <div class="post-excerpt">The 191st Wiesn opens tomorrow at noon, and the beer in the tents is not the beer the festival started with. Munich changed it, America kept the old one, Britain borrowed the words &mdash; and twelve of the sixteen days fall in September.</div>
          <div class="post-read">Read the essay &rarr;</div>
        </a>
      </li>
'''
anchor='      <li>\n        <a href="cask-ale-week-2026.html" class="post">'
assert idx.count(anchor)==1
open('blog/index.html','w').write(idx.replace(anchor,card+anchor))
print('index updated')
PY

node scripts/sync-from-feed.mjs
git add -A blog/september-is-oktoberfest.html blog/feed.xml blog/index.html index.html sitemap.xml
git commit -m "blog: publish september-is-oktoberfest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pk4X9k7dSDBKykffX1undZ"
git pull -q --rebase
git push -q
./scripts/indexnow.sh "https://pintpoint.co.uk/blog/september-is-oktoberfest.html" "https://pintpoint.co.uk/blog/" || echo "(IndexNow ping failed; not fatal)"
echo "✅ published — https://pintpoint.co.uk/blog/september-is-oktoberfest.html"
