#!/usr/bin/env python3
"""Rasterises the icon SVGs (scripts/icon.js) and the wordmark lockups (scripts/wordmark.js) into every PNG, ICO and
ICNS the app, installers, website and README use. Needs Playwright (Chromium) and Pillow.
  node scripts/icon.js && node scripts/wordmark.js && python3 scripts/render-icons.py"""
import io
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
B = ROOT / 'assets' / 'brand'

def render(page, svg, w, h):
    import tempfile
    html = Path(tempfile.mkdtemp()) / 'r.html'
    html.write_text(f'<html><body style="margin:0;background:transparent"><img src="{(B / svg).as_uri()}" style="width:{w}px;height:{h}px;display:block;object-fit:contain;object-position:left"></body></html>')
    page.set_viewport_size({'width': w, 'height': h}); page.goto(html.as_uri()); page.wait_for_timeout(150)
    return Image.open(io.BytesIO(page.screenshot(omit_background=True, type='png'))).convert('RGBA')

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    pg = br.new_page()
    big = render(pg, 'icon.svg', 1024, 1024)
    mask = render(pg, 'icon-maskable.svg', 512, 512)
    lock = {n: render(pg, f'{n}.svg', 1100, 173) for n in ['logo-wordmark', 'logo-wordmark-dark']}
    text = {n: render(pg, f'{n}.svg', 900, 155) for n in ['logo-text', 'logo-text-dark']}
    br.close()

def size(n): return big.resize((n, n), Image.LANCZOS) if n < 256 else big.resize((n, n), Image.NEAREST)
out = {
    'assets/brand/icon-512.png': size(512), 'app/ui/assets/icon-512.png': size(512), 'app/ui/assets/icon-192.png': size(192),
    'site/assets/brand/icon-512.png': size(512), 'site/assets/brand/icon-192.png': size(192),
    'app/src-tauri/icons/32x32.png': size(32), 'app/src-tauri/icons/128x128.png': size(128),
    'app/src-tauri/icons/128x128@2x.png': size(256), 'app/src-tauri/icons/icon.png': size(512),
}
for f, im in out.items(): im.save(ROOT / f); print('wrote', f)
# Apple touch icon + maskable: full bleed navy, no transparency
for f, n in [('app/ui/assets/apple-touch-icon.png', 180), ('site/assets/brand/apple-touch-icon.png', 180)]:
    mask.resize((n, n), Image.LANCZOS).convert('RGB').save(ROOT / f); print('wrote', f)
mask.convert('RGB').save(ROOT / 'app/ui/assets/icon-512-maskable.png'); print('wrote app/ui/assets/icon-512-maskable.png')
# Windows .ico (all the sizes Windows asks for) and macOS .icns
for f in ['app/src-tauri/icons/icon.ico', 'assets/brand/icon.ico']:
    size(256).save(ROOT / f, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]); print('wrote', f)
big.save(ROOT / 'app/src-tauri/icons/icon.icns'); print('wrote app/src-tauri/icons/icon.icns')
for n, im in {**lock, **text}.items(): im.save(B / f'{n}.png'); print('wrote', f'assets/brand/{n}.png')
