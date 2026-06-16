#!/usr/bin/env bash
# Ping IndexNow so Bing / Yandex / DuckDuckGo / Seznam re-crawl updated URLs.
#
# Usage:
#   scripts/indexnow.sh <url> [<url>...]      # submit specific URLs
#   scripts/indexnow.sh --all                 # submit every URL in sitemap.xml
#
# Key file lives at pintpoint.co.uk/cdf453273179a936cd5bf51aebd89d90.txt and
# must stay in the repo root for IndexNow to trust this host.
#
# Submits one URL per HTTP request (streaming mode). Bing Webmaster Tools
# explicitly flags batch JSON urlList submissions as suboptimal — streaming
# gives faster reflection, lower server overhead, and avoids the moderate-
# severity warning in BWT recommendations.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <url>... | --all" >&2
  exit 1
fi

python3 - "$@" <<'PY'
import sys, re, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path

KEY = "cdf453273179a936cd5bf51aebd89d90"
HOST = "pintpoint.co.uk"

args = sys.argv[1:]
if args == ["--all"]:
    urls = re.findall(r'<loc>([^<]+)</loc>', Path('sitemap.xml').read_text())
else:
    urls = args

print(f"Submitting {len(urls)} URL(s) to IndexNow (streaming, one per request)...", flush=True)

ok = 0
fail = 0
for url in urls:
    qs = urllib.parse.urlencode({"url": url, "key": KEY})
    req = urllib.request.Request(
        f"https://api.indexnow.org/IndexNow?{qs}",
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            ok += 1
            if len(urls) <= 5:
                print(f"  OK {r.status}: {url}")
    except urllib.error.HTTPError as e:
        fail += 1
        body = e.read().decode(errors='replace') if e.fp else ''
        print(f"  FAIL {e.code}: {url} — {body[:120]}", file=sys.stderr)
    except Exception as e:
        fail += 1
        print(f"  FAIL: {url} — {e}", file=sys.stderr)
    # Tiny delay so we're not hammering the API for very large --all runs
    if len(urls) > 10:
        time.sleep(0.05)

# Tolerate transient failures (network jitter, slow cold-cache pages on the
# IndexNow endpoint, individual venue pages briefly slow to respond). Real
# breakage = many failures; one or two is noise we shouldn't alarm on.
# Threshold: 1% of submitted URLs, or 2, whichever is greater.
threshold = max(2, len(urls) // 100)
print(f"Done — {ok} ok, {fail} failed (tolerance: {threshold}).")
sys.exit(0 if fail <= threshold else 1)
PY
