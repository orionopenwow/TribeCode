#!/usr/bin/env python3
"""A contact sheet of the website templates the gallery offers, to look at them side by side.

  python3 scripts/dev/site-sheet.py [out.png] [--phone]

Each offered template in app/ui/sitetpl/catalog.json is rendered with sitecfg.render (1280x960, or 390x844 with
--phone) and placed in a grid with its name. Default out: docs/screenshots/site-templates-sheet.png."""
import json, os, sys, io
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
import fixedclock
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]; UI = ROOT / 'app' / 'ui'; OUT = UI / 'sitetpl'
args = [a for a in sys.argv[1:] if not a.startswith('--')]; PHONE = '--phone' in sys.argv
out = Path(args[0]) if args else ROOT / 'docs' / 'screenshots' / 'site-templates-sheet.png'
VW, VH = (390, 844) if PHONE else (1280, 960)
CW, CH = (195, 422) if PHONE else (384, 288)
COLS, GAP, LAB = (9 if PHONE else 5), 16, 26
cat = [t for t in json.loads((OUT / 'catalog.json').read_text())['templates'] if not t.get('retired')]
shots = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None, args=['--no-proxy-server', '--allow-file-access-from-files'])
    page = br.new_page(viewport={'width': VW, 'height': VH}); fixedclock.apply(page)
    page.goto('about:blank'); page.add_script_tag(path=str(UI / 'fontlib.js')); page.add_script_tag(path=str(UI / 'sitecfg.js'))
    fonts = (UI / 'assets' / 'site-fonts').as_uri() + '/'
    for t in cat:
        html = page.evaluate('([c, f]) => TribeSiteCfg.render(c, { fonts: f, mode: "pages" })', [json.loads((OUT / f"{t['id']}.json").read_text()), fonts])
        tp = br.new_page(viewport={'width': VW, 'height': VH}); fixedclock.apply(tp); tp.route('http*://**', lambda r: r.abort())
        tmp = OUT / '_sheet.html'; tmp.write_text(html); tp.goto(tmp.as_uri()); tp.wait_for_timeout(250)
        shots.append(Image.open(io.BytesIO(tp.screenshot())).convert('RGB').resize((CW, CH), Image.LANCZOS)); tp.close()
    (OUT / '_sheet.html').unlink(); br.close()
rows = -(-len(cat) // COLS)
sheet = Image.new('RGB', (GAP + COLS * (CW + GAP), GAP + rows * (CH + LAB + GAP)), '#12151A')
d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except Exception: font = ImageFont.load_default()
for i, (t, im) in enumerate(zip(cat, shots)):
    x, y = GAP + (i % COLS) * (CW + GAP), GAP + (i // COLS) * (CH + LAB + GAP)
    sheet.paste(im, (x, y)); d.text((x, y + CH + 6), t['title'], fill='#F8FAFC', font=font)
out.parent.mkdir(parents=True, exist_ok=True); sheet.save(out, optimize=True)
print(f'{len(cat)} templates -> {out}')
