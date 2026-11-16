"""A contact sheet of Motion Studio templates (one category), drawn by the real engine at each template's thumbnail beat.
For checking new templates by eye. Usage: python3 scripts/dev/motion-sheet.py <out.png> [category]
"""
import functools, http.server, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = sys.argv[1]; CAT = sys.argv[2] if len(sys.argv) > 2 else 'social'
UI = ROOT / 'app' / 'ui'
html = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:500;src:url(/motionfonts/Inter-Medium.woff)}
@font-face{font-family:Inter;font-weight:600;src:url(/motionfonts/Inter-SemiBold.woff)}
@font-face{font-family:Inter;font-weight:800;src:url(/motionfonts/InterDisplay-ExtraBold.woff)}
body{margin:0;background:#222;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font:11px sans-serif;color:#ddd} figure{margin:0;width:200px} canvas{width:200px;height:200px;object-fit:contain;background:#111;display:block}
</style><script src="/motionkit.js"></script><script src="/motionsocial.js"></script></head><body></body></html>"""


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/__sheet'):
            b = html.encode(); self.send_response(200); self.send_header('Content-Type', 'text/html'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--allow-file-access-from-files"])
        pg = b.new_page(viewport={"width": 1290, "height": 900})
        pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/__sheet')
        pg.evaluate("Promise.all(['500 20px Inter','600 20px Inter','800 20px Inter'].map(f=>document.fonts.load(f)))")
        pg.evaluate("""(cat) => { const K = TribeMotionKit; for (const id of K.LIST.filter(i => K.TEMPLATES[i].cat === cat)) { const d = K.make(id); const c = document.createElement('canvas'); const s = 400 / Math.max(d.size.w, d.size.h); c.width = Math.round(d.size.w * s); c.height = Math.round(d.size.h * s); const g = c.getContext('2d'); g.scale(s, s); const t = d.thumbAt >= 0 ? d.thumbAt * 60 / d.bpm : K.duration(d) * 0.4; K.draw(g, d, t, {}); const fig = document.createElement('figure'); fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: id })); document.body.append(fig); } }""", CAT)
        pg.wait_for_timeout(500)
        pg.screenshot(path=OUT, full_page=True)
        b.close()


if __name__ == '__main__':
    main()
