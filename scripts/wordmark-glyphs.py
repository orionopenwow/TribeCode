#!/usr/bin/env python3
"""Traces the "TribeCode" wordmark from Inter Bold (app/ui/assets/fonts/Inter-Bold.otf, SIL OFL) into
scripts/wordmark-glyphs.json, which scripts/wordmark.js turns into every logo file (no font needed at runtime).
Run only when the wordmark's typeface or spacing changes:  python3 scripts/wordmark-glyphs.py && node scripts/wordmark.js
Needs fontTools (pip install fonttools)."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parents[1]
f = TTFont(ROOT / 'app/ui/assets/fonts/Inter-Bold.otf')
gs, cmap, hmtx, upm = f.getGlyphSet(), f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
TRACK = -0.005 * upm
bp = BoundsPen(gs)
for ch in 'TribeCode': gs[cmap[ord(ch)]].draw(bp)
top = bp.bounds[3]                       # tallest point (b/d ascenders), baseline at 0
k = 100 / top                            # normalise: top = 0, baseline = 100
def word(text, x0):
    pen, x = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.')), x0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x * k, 100)))
        x += hmtx[g][0] + TRACK
    return pen.getCommands(), x
tribe, x = word('Tribe', 0); code, x2 = word('Code', x)
out = {'font': 'Inter Bold', 'height': 100, 'width': round((x2 - TRACK) * k, 1), 'tribe': tribe, 'code': code}
(ROOT / 'scripts/wordmark-glyphs.json').write_text(json.dumps(out) + '\n')
print('wrote scripts/wordmark-glyphs.json', out['width'])
