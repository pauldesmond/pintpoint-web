#!/usr/bin/env bash
# Ping IndexNow so Bing / Yandex / DuckDuckGo / Seznam re-crawl updated URLs.
#
# Usage:
#   scripts/indexnow.sh <url> [<url>...]      # submit specific URLs
#   scripts/indexnow.sh --all                 # submit every URL in sitemap.xml
#
# Key file lives at pintpoint.co.uk/cdf453273179a936cd5bf51aebd89d90.txt and
# must stay in the repo root for IndexNow to trust this host.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <url>... | --all" >&2
  exit 1
fi

python3 - "$@" <<'PY'
import json, sys, re, urllib.request, urllib.error
from pathlib import Path

KEY = "cdf453273179a936cd5bf51aebd89d90"
HOST = "pintpoint.co.uk"

args = sys.argv[1:]
if args == ["--all"]:
    urls = re.findall(r'<loc>([^<]+)</loc>', Path('sitemap.xml').read_text())
else:
    urls = args

body = json.dumps({
    "host": HOST,
    "key": KEY,
    "keyLocation": f"https://{HOST}/{KEY}.txt",
    "urlList": urls,
}).encode()

req = urllib.request.Request(
    "https://api.indexnow.org/IndexNow",
    data=body,
    method="POST",
    headers={"Content-Type": "application/json; charset=utf-8"},
)

print(f"Submitting {len(urls)} URL(s) to IndexNow...", flush=True)
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        print(f"OK (HTTP {r.status})")
except urllib.error.HTTPError as e:
    print(f"FAILED (HTTP {e.code}): {e.read().decode(errors='replace')}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"FAILED: {e}", file=sys.stderr)
    sys.exit(1)
PY
