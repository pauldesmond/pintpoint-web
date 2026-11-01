#!/usr/bin/env python3
"""Check a promoted PINtPRESS page for the things that do not show on it.

Called by publish-blog.sh. Everything here failed silently on a real promote at
least once: a share image that 404'd, a pageview beacon pointing above the
document root, a page that shipped with no article JSON-LD at all.

Substring checks are not enough for any of it. "../../js/pageview.js" contains
"/js/pageview.js", so a grep for the absolute path passes the exact bug it was
written to catch. These look at the attribute value and then at the filesystem.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# name="value" or name='value'. Single quotes matter: the Cloudflare beacon
# token is a JSON object, written data-cf-beacon='{"token": "..."}'.
ATTR_RE = re.compile(r"""([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""")


def attrs(tag: str) -> dict:
    # Single quotes as well as double: the Cloudflare beacon's token is a JSON
    # object, so it is written data-cf-beacon='{"token": "..."}'.
    out = {}
    for m in re.finditer(ATTR_RE, tag):
        out[m.group(1).lower()] = m.group(2) if m.group(2) is not None else m.group(3)
    return out


def check(path: Path) -> list:
    src = path.read_text(encoding='utf-8')
    page_dir = path.parent
    fails = []

    scripts = [attrs(m.group(0)) for m in re.finditer(r'<script\b[^>]*>', src)]
    links = [attrs(m.group(0)) for m in re.finditer(r'<link\b[^>]*>', src)]
    metas = [attrs(m.group(0)) for m in re.finditer(r'<meta\b[^>]*>', src)]
    imgs = [attrs(m.group(0)) for m in re.finditer(r'<img\b[^>]*>', src)]

    # 1. pageview.js has to be referenced at all. Whether the path it uses
    #    actually lands on the file is left to the reference check below,
    #    which resolves every local reference against the filesystem: that is
    #    what catches ../../js/ from a page in blog/, where one ../ is right
    #    and two walk above the document root.
    if not [s for s in scripts if 'src' in s and s['src'].endswith('js/pageview.js')]:
        fails.append('no js/pageview.js script')
    elif not (ROOT / 'js' / 'pageview.js').is_file():
        fails.append('js/pageview.js is missing from the repo')

    # 2. Cloudflare beacon, with its token.
    beacon = [s for s in scripts if 'static.cloudflareinsights.com' in s.get('src', '')]
    if not beacon:
        fails.append('no Cloudflare beacon script')
    elif not any(b.get('data-cf-beacon', '').strip() for b in beacon):
        fails.append('Cloudflare beacon carries no data-cf-beacon token')

    # 3. Article JSON-LD, and it has to parse.
    blocks = re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', src, re.S)
    if not blocks:
        fails.append('no application/ld+json block')
    for i, block in enumerate(blocks):
        try:
            json.loads(block)
        except json.JSONDecodeError as exc:
            fails.append(f'JSON-LD block {i + 1} does not parse: {exc}')

    # 4. Every local reference has to resolve to a file that exists. A share
    #    image naming a file nobody ever added is invisible until someone
    #    shares the piece and gets a blank card.
    refs = []
    refs += [(s['src'], 'script src') for s in scripts if 'src' in s]
    refs += [(l['href'], 'link href') for l in links if 'href' in l]
    refs += [(i['src'], 'img src') for i in imgs if 'src' in i]
    for m in metas:
        key = m.get('property') or m.get('name') or ''
        if key.endswith('image') and m.get('content'):
            refs.append((m['content'], key))

    for value, where in refs:
        v = value.strip()
        if not v or v.startswith(('data:', 'mailto:', 'tel:', '#')):
            continue
        if v.startswith('//'):
            continue
        if v.startswith(('http://', 'https://')):
            if 'pintpoint.co.uk/' not in v:
                continue
            rel = v.split('pintpoint.co.uk/', 1)[1]
        elif v.startswith('/'):
            rel = v[1:]
        else:
            target = (page_dir / v).resolve()
            try:
                rel = str(target.relative_to(ROOT))
            except ValueError:
                fails.append(f'{where} "{v}" resolves outside the site root')
                continue
        rel = rel.split('?')[0].split('#')[0]
        if not rel:
            continue
        # Pages the worker builds rather than files we hold.
        if rel.startswith(('pubs/', 'beers/', 'og/', 'crawl/', 'collections/', 'photos/')):
            continue
        if not (ROOT / rel).exists():
            fails.append(f'{where} "{v}" points at {rel}, which is not in the repo')

    return fails


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: check-promoted-page.py <file>')
    problems = check(Path(sys.argv[1]))
    for p in problems:
        print(f'   {p}')
    sys.exit(1 if problems else 0)
