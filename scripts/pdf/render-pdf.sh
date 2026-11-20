#!/usr/bin/env bash
# Render a PINtPRESS page to a sendable PDF, in the site's own typography.
#
#   scripts/pdf/render-pdf.sh blog/drafts/the-return-crossing.html out.pdf
#
# Why a script rather than printing from the browser: a draft lives behind
# Cloudflare Access, the browser's own print chrome adds a header nobody wants
# on a manuscript, and the two CSS overrides in manuscript.css have to be
# applied every time or the output is wrong in the same two ways.
set -euo pipefail

SRC="${1:?usage: render-pdf.sh <html file, repo-relative> [out.pdf]}"
OUT="${2:-${SRC##*/}}"
case "$OUT" in *.pdf) ;; *) OUT="${OUT%.html}.pdf" ;; esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEASY="${WEASYPRINT:-$HOME/Library/Python/3.9/bin/weasyprint}"

[ -x "$WEASY" ] || { echo "weasyprint not found at $WEASY (set WEASYPRINT=...)" >&2; exit 1; }

# The pages link /blog/pintpress-feature.css, an absolute path that resolves
# against the filesystem root when the file is opened locally, so the sheet
# silently fails to load and the PDF comes out unstyled. Rewrite to a file URL
# in a copy; the original is never touched.
TMP="$(mktemp -t pintpress-pdf).html"
trap 'rm -f "$TMP"' EXIT
sed -e "s#href=\"/blog/#href=\"file://$ROOT/blog/#g" \
    -e "s#href=\"/favicon.png\"#href=\"file://$ROOT/favicon.png\"#g" \
    "$ROOT/$SRC" > "$TMP"

# glib/pango live in Homebrew's lib on this machine and weasyprint's bindings
# do not find them on their own.
DYLD_FALLBACK_LIBRARY_PATH="${DYLD_FALLBACK_LIBRARY_PATH:-/opt/homebrew/lib}" \
  "$WEASY" -u "file://$ROOT/" -s "$ROOT/scripts/pdf/manuscript.css" "$TMP" "$OUT"

echo "$OUT  ($(wc -c < "$OUT" | tr -d ' ') bytes)"
