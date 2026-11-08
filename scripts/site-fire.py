#!/usr/bin/env python3
"""The website stage's burning corner (site/index.html .stage__fire), as flat pixel art.

Flames creep along the top edge and down the right edge, sloping away from the corner, and the panel's corner is
burnt like wood: charred surface, a glowing ragged edge, and cracks with embers in them. Four flame frames flicker
(like the logo), the cracks and edge pulse, embers rise. Usage: python3 scripts/site-fire.py  (rewrites the <svg>)
"""
import math, random, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
W, H = 72, 52           # cells; 3 screen px each
CX, CY = 56, 18         # the stage's top-right corner, in cells (panel is x < CX, y > CY)
RAD = 4                 # the panel's corner radius, in cells
E, A, R, Y, CHAR, CHAR2, ASH = '#F26B1D', '#FABD2F', '#B4512A', '#FFE08A', '#16110E', '#231A15', '#3A2A22'

def inside_panel(x, y):
    if x >= CX or y < CY: return False
    dx, dy = x - (CX - RAD), y - (CY + RAD)
    return not (dx > 0 and dy < 0 and dx * dx + dy * dy > RAD * RAD)

def runs(cells, color):
    """Merge a set of cells into horizontal runs of rects."""
    out, rows = [], {}
    for x, y in cells: rows.setdefault(y, []).append(x)
    for y in sorted(rows):
        xs = sorted(set(rows[y])); s = p = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == p + 1: p = x; continue
            out.append(f'<rect x="{s}" y="{y}" width="{p - s + 1}" height="1"/>')
            if x is not None: s = p = x
    return f'<g fill="{color}">{"".join(out)}</g>' if out else ''

# ---------- the char: a ragged diagonal region in the corner ----------
rnd = random.Random(7)
LX, LY = 34, 28          # how far the burn reaches left along the top, and down the right side
edge_noise = [rnd.uniform(-.09, .09) for _ in range(200)]
char, char2, glow, ember_edge = set(), set(), set(), set()
def burnt(x, y):
    t = (CX - 1 - x) / LX + (y - CY) / LY + edge_noise[(x * 7 + y * 13) % 200]
    return t
for y in range(CY, H):
    for x in range(0, CX):
        if not inside_panel(x, y): continue
        t = burnt(x, y)
        if t < .78: (char2 if (x + 2 * y) % 9 == 0 or (y % 4 == 0 and rnd.random() < .5) else char).add((x, y))   # wood grain
        elif t < .9: glow.add((x, y))
        elif t < 1.0 and rnd.random() < .45: ember_edge.add((x, y))

# cracks: short random walks from near the corner into the char, glowing
cracks, hot = set(), set()
for k in range(6):
    x, y = CX - 2 - rnd.randint(0, 6), CY + 2 + rnd.randint(0, 5)
    dx, dy = (-1, 0) if k % 2 else (0, 1)
    for i in range(rnd.randint(10, 18)):
        if not inside_panel(x, y) or burnt(x, y) > .74: break
        (hot if i % 5 == 2 else cracks).add((x, y))
        if rnd.random() < .35: dx, dy = rnd.choice([(-1, 0), (0, 1), (-1, 1)])
        x, y = x + dx, y + dy
for c in list(cracks) + list(hot): char.discard(c); char2.discard(c)

# ---------- flames: along the top (rising up) and the right side (leaning out), shorter away from the corner ----------
def flame_frame(seed):
    r = random.Random(seed)
    core, mid, tip = set(), set(), set()
    # top edge: columns x from CX-LX*.9 .. CX+1, height falls off to the left
    for x in range(int(CX - LX * .92), CX + 2):
        d = min(1, max(0, (CX - x) / (LX * .92)))
        hmax = 3 + 13 * (1 - d) ** 1.6
        tongue = .3 + .7 * abs(math.sin(x * .55 + seed * .3)) ** 1.5   # flames come in tongues, not a wall
        h = max(1, int(hmax * tongue * r.uniform(.75, 1.1)))
        lean = 0
        for j in range(h):
            y = CY - 1 - j
            if y < 0: break
            xx = x + (lean if j > h * .6 else 0)
            f = j / h
            (core if f < .22 and h > 3 else mid if f < .7 else tip).add((xx, y))
        if r.random() < .25: tip.add((x + r.choice((-1, 1)), CY - h - 1 - r.randint(1, 2)))   # a loose flick
    # right edge: rows y from CY-1 .. CY+LY*.9, flames lean right, shorter going down
    for y in range(CY - 2, int(CY + LY * .9)):
        d = min(1, max(0, (y - CY) / (LY * .9)))
        wmax = 3 + 10 * (1 - d) ** 1.5
        tongue = .3 + .7 * abs(math.sin(y * .6 + seed * .3)) ** 1.5
        w = max(1, int(wmax * tongue * r.uniform(.75, 1.1)))
        for j in range(w):
            x = CX + j
            yy = y - (1 if j > w * .55 else 0) - (1 if j > w * .85 else 0)   # flames curl upward as they go out
            f = j / w
            (core if f < .22 and w > 3 else mid if f < .7 else tip).add((x, yy))
    # the corner itself burns hottest
    for j in range(5):
        for i in range(5 - j): core.add((CX - 1 + i, CY - 1 - j))
    hotcore = {c for c in core if r.random() < .25 and (CX - c[0]) < 12 and (c[1] - CY) < 6}
    mid -= core; tip -= core | mid; core -= hotcore
    return runs(tip, R) + runs(mid, E) + runs(core, A) + runs(hotcore, Y)

frames = ''.join(f'<g class="cf cf{i}">{flame_frame(100 + i * 17)}</g>' for i in range(4))
embers = []
for i in range(9):
    x = rnd.randint(int(CX - LX * .7), CX + 10); y = rnd.randint(2, CY - 2)
    embers.append(f'<rect class="cf-em cf-em{i % 3 + 1}" x="{x}" y="{y}" width="1" height="1" fill="{A if i % 2 else E}" style="animation-delay:-{i * .37:.2f}s"/>')

svg = (f'<svg class="stage__fire" viewBox="0 0 {W} {H}" width="{W * 3}" height="{H * 3}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
       f'<g class="cf-char">{runs(char, CHAR)}{runs(char2, CHAR2)}{runs(glow, ASH)}</g>'
       f'<g class="cf-edge">{runs(ember_edge, R)}</g>'
       f'<g class="cf-crack">{runs(cracks, R)}{runs(hot, E)}</g>'
       f'{frames}{"".join(embers)}</svg>')

p = ROOT / 'site' / 'index.html'
html = p.read_text()
html, n = re.subn(r'<svg class="stage__fire".*?</svg>', lambda m: svg, html, count=1, flags=re.S)
assert n == 1, 'stage__fire svg not found'
p.write_text(html)
print(f'stage__fire: {W}x{H} cells, corner at ({CX},{CY}); {len(char) + len(char2)} char, {len(cracks) + len(hot)} crack cells')
