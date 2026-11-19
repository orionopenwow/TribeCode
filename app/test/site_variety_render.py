"""Every offered website template, in a real browser at 1280 and 390px: no sideways scroll, nothing wider than the page,
no picture that failed to load, text not clipped by its box. Run by app/test/site_variety_test.js (no server needed).
Usage: python3 app/test/site_variety_render.py"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]; UI = ROOT / 'app' / 'ui'; TPL = UI / 'sitetpl'
cat = [t for t in json.loads((TPL / 'catalog.json').read_text())['templates'] if not t.get('retired')]
PROBE = """() => { const W = document.documentElement.clientWidth, bad = [];
  if (document.documentElement.scrollWidth > W + 1) bad.push('the page scrolls sideways (' + document.documentElement.scrollWidth + ' > ' + W + ')');
  for (const el of document.querySelectorAll('main *, header *, footer *')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (el.closest('.g-strip') || el.closest('.nav nav') || el.matches('.skip, .hp')) continue;   // these scroll sideways on purpose
    if (r.right > W + 1 || r.left < -1) { bad.push(el.tagName + '.' + el.className + ' sticks out (' + Math.round(r.left) + ' to ' + Math.round(r.right) + ')'); if (bad.length > 4) break; } }
  for (const im of document.images) if (!im.complete || !im.naturalWidth) bad.push('a picture did not load: ' + (im.alt || ''));
  return bad; }"""
fails = []; n = 0
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None, args=['--no-proxy-server', '--allow-file-access-from-files'])
    host = br.new_page(); host.goto('about:blank'); host.add_script_tag(path=str(UI / 'fontlib.js')); host.add_script_tag(path=str(UI / 'sitecfg.js'))
    fonts = (UI / 'assets' / 'site-fonts').as_uri() + '/'
    tmp = TPL / '_variety.html'
    try:
        for t in cat:
            cfg = json.loads((TPL / f"{t['id']}.json").read_text())
            pages = host.evaluate('c => TribeSiteCfg.normalize(c).pages.map(p => p.id)', cfg)
            for w, h in ((1280, 900), (390, 844)):
                pg = br.new_page(viewport={'width': w, 'height': h}); pg.route('http*://**', lambda r: r.abort())
                for pid in pages:
                    tmp.write_text(host.evaluate('([c, f, p]) => TribeSiteCfg.render(c, { fonts: f, mode: "pages", page: p })', [cfg, fonts, pid]))
                    pg.goto(tmp.as_uri()); pg.evaluate("() => Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.decode().catch(() => 0); }))"); pg.wait_for_timeout(80)
                    bad = pg.evaluate(PROBE); n += 1
                    if bad: fails.append(f"{t['id']} at {w}px: " + '; '.join(bad))
                pg.close()
    finally:
        try: tmp.unlink()
        except Exception: pass
        br.close()
if fails: print('\n'.join(fails)); sys.exit(1)
print(f'site_variety_render: OK ({len(cat)} templates, {n} pages at 1280 and 390px)')
