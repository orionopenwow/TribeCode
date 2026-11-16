#!/usr/bin/env python3
"""The picker thumbnails of the website designer's moving backgrounds (feat/site-3d).

Each one is a picture of OUR port running (app/ui/sitefx/fx.js, fx3d.js), in TribeCode's own colours; nothing is
copied from another catalogue. Writes app/ui/sitefx/thumbs/<kind>.jpg (240x150).
    python3 scripts/dev/sitefx-thumbs.py            write them
    python3 scripts/dev/sitefx-thumbs.py --check    exit 1 if a kind in app/ui/sitefx.js has no thumbnail
"""
import io, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FX = os.path.join(ROOT, 'app', 'ui', 'sitefx'); OUT = os.path.join(FX, 'thumbs')
kinds = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require(process.argv[1]).LIST))", os.path.join(ROOT, 'app', 'ui', 'sitefx.js')]))
if '--check' in sys.argv:
    missing = [k for k in kinds if not os.path.exists(os.path.join(OUT, k + '.jpg'))]
    if missing: print('sitefx-thumbs: no thumbnail for', ', '.join(missing)); sys.exit(1)
    print(f'sitefx-thumbs: OK ({len(kinds)} thumbnails)'); sys.exit(0)
from playwright.sync_api import sync_playwright
from PIL import Image
os.makedirs(OUT, exist_ok=True)
opt = json.dumps({'s': 1, 'd': 1.4, 'i': 1.6, 'p': 1, 'a': '#38C6B1', 'b': '#6C7CFF'})
only = [a for a in sys.argv[1:] if not a.startswith('-')]
todo = [k for k in kinds if not only or k in only]
# a browser keeps about 16 WebGL pages alive at once, so the backgrounds are drawn ten at a time
def secs_for(ks): return ''.join(f"<section id=\"k-{k}\" data-fx=\"{k}\" data-fx-o='{opt}' style=\"position:relative;isolation:isolate;overflow:hidden;width:480px;height:300px;float:left\"><div class=\"fx-layer\" style=\"position:absolute;inset:0;z-index:-1\"></div></section>" for k in ks)
tmp = os.path.join(OUT, '_page.html'); failed = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for i in range(0, len(todo), 10):
        ks = todo[i:i + 10]
        open(tmp, 'w').write(f'<!doctype html><html><body style="margin:0;background:#12151A">{secs_for(ks)}<script src="file://{FX}/fx.js"></script></body></html>')
        pg = br.new_page(viewport={'width': 1440, 'height': 1600}); errs = []
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.goto('file://' + tmp)
        try: pg.wait_for_function('window.TribeFx && TribeFx.count() >= %d' % len(ks), timeout=20000)
        except Exception: pass
        pg.wait_for_timeout(4000)
        live = set(pg.evaluate('TribeFx.stats().kinds'))
        for k in ks:
            if k not in live: failed.append(k); continue
            png = pg.locator('#k-' + k).screenshot()
            Image.open(io.BytesIO(png)).convert('RGB').resize((240, 150), Image.LANCZOS).save(os.path.join(OUT, k + '.jpg'), quality=82, optimize=True)
        if errs: print('console:', errs[:3])
        pg.close()
    br.close()
os.remove(tmp)
print(f'sitefx-thumbs: wrote {len(todo) - len(failed)} thumbnails to app/ui/sitefx/thumbs' + (f'; did not draw: {", ".join(failed)}' if failed else ''))
if failed: sys.exit(1)
