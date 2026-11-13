#!/usr/bin/env python3
"""Makes the extra install assets the web app manifest points at (docs/BROWSER-APP.md):
  app/ui/assets/icon-monochrome.png   512px, white silhouette on transparent (Android themed icons, `purpose: monochrome`)
  app/ui/assets/shortcuts/*.png        96px shortcut icons (New note, Ask Flint, Tasks, Chat)
  app/ui/assets/screens/wide-1.png     1280x720 and narrow-1.png 390x844: the richer install sheet, from the showcase demo
Needs Playwright (Chromium at /usr/bin/google-chrome) and Pillow. Screenshots start a throwaway server.
  python3 scripts/dev/pwa-assets.py [--no-screens]"""
import io, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'app' / 'ui'
A = UI / 'assets'

# Flat matte tiles: surface #1B2028 + 1px border #2A313C, a 1.8px line glyph; Ember only for Flint's flame.
GLYPH = {
    'note': '<path d="M20 4C12 4 7 9 6 18l-2 3M6 18c6 0 10-3 12-8h-5c3-1 5-3 7-6"/>',
    'tasks': '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
    'chat': '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
}

def tile(inner, flame=False):
    body = inner if flame else f'<g transform="translate(24 24) scale(2)" fill="none" stroke="#F8FAFC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{inner}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect x="0.5" y="0.5" width="95" height="95" rx="22" fill="#1B2028" stroke="#2A313C"/>{body}</svg>'

def flint_tile():
    mark = (A / 'icon-mark.svg').read_text()
    flame = mark.split('<g fill="#F26B1D">', 1)[1].split('</g>', 1)[0]
    return tile(f'<g transform="translate(-3 -9) scale(2.25)" fill="#F26B1D" shape-rendering="crispEdges">{flame}</g>', flame=True)

def shot_svg(page, svg, w, h):
    page.set_viewport_size({'width': w, 'height': h})
    page.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
    page.wait_for_timeout(80)
    return Image.open(io.BytesIO(page.screenshot(omit_background=True, type='png', clip={'x': 0, 'y': 0, 'width': w, 'height': h}))).convert('RGBA')

def icons(page):
    mono = (A / 'icon-mark.svg').read_text().replace('#F8FAFC', '#FFFFFF').replace('#F26B1D', '#FFFFFF').replace('width="512" height="512"', 'width="512" height="512" style="display:block"')
    shot_svg(page, mono, 512, 512).save(A / 'icon-monochrome.png', optimize=True)
    (A / 'shortcuts').mkdir(exist_ok=True)
    for k, g in GLYPH.items(): shot_svg(page, tile(g), 96, 96).save(A / 'shortcuts' / f'{k}.png', optimize=True)
    shot_svg(page, flint_tile(), 96, 96).save(A / 'shortcuts' / 'flint.png', optimize=True)

def screens(browser):
    port = 4700 + int(os.environ.get('TRIBE_PORT_OFFSET', '0')) % 40
    tmp = Path(tempfile.mkdtemp(prefix='tribe-pwa-assets-'))
    env = {**os.environ, 'TRIBE_NO_GH': '1', 'TRIBE_TEST': '1', 'TRIBE_NO_DOWNLOAD': '1'}
    srv = subprocess.Popen(['node', str(ROOT / 'server' / 'index.js'), '--port', str(port), '--dir', str(tmp / 'tribe'), '--ollama', 'http://localhost:9'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(f'http://localhost:{port}/api/health', timeout=2); break
            except Exception: time.sleep(0.25)
        (A / 'screens').mkdir(exist_ok=True)
        for name, vp, mobile in [('wide-1', (1280, 720), False), ('narrow-1', (390, 844), True)]:
            ctx = browser.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, service_workers='block')
            pg = ctx.new_page()
            pg.goto(f'http://localhost:{port}/?skipIntro=1&demo=showcase')
            pg.wait_for_function('!!(window.TribeApp && TribeApp.show && window.TribeClient && TribeClient.connected())', timeout=30000)
            pg.wait_for_timeout(1500)
            # the auto-playing tour and its first-run cards would cover the app: stop them, keep the seeded tribe
            pg.evaluate("window.TribeDirector && TribeDirector.stop()"); pg.wait_for_timeout(600)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_timeout(2500)
            pg.evaluate("""document.querySelectorAll('.dir-bar, .dir-card, .dir-scrim, [id^=dir-], #wd-helpers, .wd-helpers').forEach(e => e.remove());
              for (const b of document.querySelectorAll('button')) if (/^(Got it|Not now|Later)$/.test(b.textContent.trim()) && b.offsetParent) b.click();""")
            pg.wait_for_timeout(800)
            pg.screenshot(path=str(A / 'screens' / f'{name}.png'))
            ctx.close()
    finally:
        srv.terminate()

if __name__ == '__main__':
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-proxy-server'])
        icons(b.new_page())
        if '--no-screens' not in sys.argv: screens(b)
        b.close()
    print('pwa assets written')
