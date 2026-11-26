#!/usr/bin/env python3
"""Fail a publish whose X card has burned-in text under X's own title bar.

X draws a title bar across the foot of a summary_large_image card and fills it
from twitter:title. Anything already printed there collides with it. On the
purl post, 26 November 2026, the card's cyan sub-line sat 25px above the bottom
edge of a 1200x628 card while the bar covers roughly the bottom 70, so the two
overlapped by about 45px and the reader saw both at once. Nobody could see that
until the post was live, because the collision happens in X's renderer and not
in the file.

So: scan the bottom BAR_PX rows of the twitter:image for the brand cyan and
refuse the publish if it finds a run of it. Channel numbers rather than a
colour name, deliberately.

  python3 scripts/check-card-safe-zone.py blog/<slug>.html
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BAR_PX = 70        # what X's title bar covers on a 1200x628 card
MIN_PIXELS = 40    # a run this long is lettering, not a stray highlight
# The PINtPRESS sub-line cyan, as channel ranges.
CYAN = lambda r, g, b: r < 110 and g > 150 and b > 150


def card_of(page: Path):
    src = page.read_text(encoding='utf-8')
    m = re.search(r'name="twitter:image" content="([^"]+)"', src)
    if not m:
        return None
    v = m.group(1).split('?')[0]
    rel = v.split('pintpoint.co.uk/', 1)[1] if 'pintpoint.co.uk/' in v else v.lstrip('/')
    return ROOT / rel


def offending_rows(img: Path):
    out = subprocess.run(
        ['magick', str(img), '-gravity', 'south', '-crop', f'x{BAR_PX}+0+0', '+repage', 'txt:-'],
        capture_output=True, text=True, check=True).stdout
    rows = {}
    for line in out.splitlines()[1:]:
        try:
            pos, rest = line.split(':', 1)
            _, y = map(int, pos.split(','))
            s = rest.split('#')[1][:6]
            r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
        except Exception:
            continue
        if CYAN(r, g, b):
            rows[y] = rows.get(y, 0) + 1
    return {y: n for y, n in rows.items() if n >= MIN_PIXELS}


def main(argv):
    if len(argv) != 2:
        sys.exit('usage: check-card-safe-zone.py <page.html>')
    page = Path(argv[1])
    card = card_of(page)
    if card is None:
        print('   no twitter:image on the page, nothing to check')
        return 0
    if not card.is_file():
        print(f'   twitter:image points at {card}, which is not in the repo')
        return 1
    try:
        hits = offending_rows(card)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print('   magick not available, card safe-zone not checked')
        return 0
    if not hits:
        return 0
    worst = max(hits)
    print(f'   {card.name}: brand cyan found {BAR_PX - worst} to {BAR_PX - min(hits)} px above the')
    print(f'   bottom edge, inside the {BAR_PX}px X fills with twitter:title. They will overlap.')
    print(f'   Fix: raise it at least {BAR_PX - min(hits)}px. 80 clears the bar with margin.')
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
