#!/usr/bin/env python3
"""Renders the flickering logo (scripts/icon.js frames) as GIFs for the website and README.
  node scripts/icon.js && python3 scripts/render-logo-gif.py
Needs Playwright (Chromium) and Pillow. GIFs can't do soft transparency, so each one is drawn on the background it
will sit on (the site's Campfire canvas #1D2021, GitHub dark #0D1117)."""
import io, tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FR = sorted((ROOT / 'assets/brand/frames').glob('icon-*.svg'))
JOBS = [('site/assets/brand/logo-flame.gif', 240, '#1D2021'), ('site/assets/brand/logo-flame-sm.gif', 96, '#1D2021'),
        ('assets/brand/logo-flame.gif', 240, '#0D1117')]
MS = 180   # per frame; 4 frames = 0.72 s, the same pace as the animated SVG

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = br.new_page()
    for out, size, bg in JOBS:
        frames = []
        for f in FR:
            html = Path(tempfile.mkdtemp()) / 'f.html'
            html.write_text(f'<html><body style="margin:0;background:{bg}"><img src="{f.as_uri()}" style="width:{size}px;height:{size}px;display:block"></body></html>')
            pg.set_viewport_size({'width': size, 'height': size}); pg.goto(html.as_uri()); pg.wait_for_timeout(100)
            frames.append(Image.open(io.BytesIO(pg.screenshot(type='png'))).convert('RGB').quantize(colors=32, method=Image.Quantize.MEDIANCUT))
        frames[0].save(ROOT / out, save_all=True, append_images=frames[1:], duration=MS, loop=0, optimize=True, disposal=1)
        print('wrote', out, (ROOT / out).stat().st_size // 1024, 'KB')
    br.close()
