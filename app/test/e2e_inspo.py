"""The inspiration board (v0.25, server/inspo.js + app/ui/inspo.js): a Pinterest-style page (mocked locally) gives its
pictures, theme color, CSS colors and Google Fonts; a dropped picture is measured in the browser (k-means) and stored
as a small thumbnail; a font by name; the palette gets roles (background, surface, text, accent, accent 2) that read
(text >= 12:1, accents >= 3:1 on the background); "Dress it up" sets the website's brand kit and writes
design/inspiration.css (and updates design/palette.css); Flint does it from chat ("use this for inspiration <link>",
"dress it up"); spectators can't add; private addresses are refused. Usage: python app/test/e2e_inspo.py
"""
import base64, io, json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5530 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

def png(color, w=40, h=30):
    import zlib, struct
    raw = b"".join(b"\x00" + bytes(color) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

class Site(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        h = f"http://127.0.0.1:{self.server.server_address[1]}"
        if self.path.startswith("/board"):
            body = f"""<html><head><title>Cozy night garden · Pinterest</title><meta name="theme-color" content="#1E2433">
            <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&display=swap" rel="stylesheet"><style>h1{{font-family:'Fraunces',serif;color:#E9B44C}} .x{{background:#C4517A}}</style>
            <meta property="og:image" content="{h}/img/gold.png"></head><body><img src="{h}/img/rose.png"><img src="{h}/img/night.png"></body></html>""".encode()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(body); return
        cols = {"/img/gold.png": (233, 180, 76), "/img/rose.png": (196, 81, 122), "/img/night.png": (30, 36, 51)}
        if self.path in cols:
            self.send_response(200); self.send_header("Content-Type", "image/png"); self.end_headers(); self.wfile.write(png(cols[self.path])); return
        self.send_response(404); self.end_headers()

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]
def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; c = [v / 12.92 if v <= .03928 else ((v + .055) / 1.055) ** 2.4 for v in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
def contrast(a, b): x, y = lum(a), lum(b); return (max(x, y) + .05) / (min(x, y) + .05)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-inspo-", dir="/tmp"))
    site = ThreadingHTTPServer(("127.0.0.1", 0), Site); threading.Thread(target=site.serve_forever, daemon=True).start()
    sh = f"127.0.0.1:{site.server_address[1]}"
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_TEST_EMBED_ALLOW": sh}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Firefly Garden", "bio": "A cozy night game"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api("/vision", "PUT", {"text": "# Firefly Garden\n\nA cozy pixel game where friends water plants at night.\n"}, token=host, project=pid))
        ok(api(f"/projects/{pid}/setup/repo", "POST", {}, token=host, project=pid))
        repo = tmp / "tribe" / "workspaces" / pid

        # ---- a link: pictures, theme color, CSS colors, Google Fonts ----
        r = ok(api("/inspo/link", "POST", {"project": pid, "url": f"http://{sh}/board/123"}, token=host, project=pid), "link")
        it = r["item"]; assert it["title"].startswith("Cozy night garden") and len(it["images"]) == 3, it
        assert "#1E2433" in it["colors"] and "Fraunces" in it["fonts"], it
        assert r["font"]["pair"] == "fraunces", r["font"]
        # private addresses are refused (no allowlist entry)
        assert api("/inspo/link", "POST", {"project": pid, "url": "http://127.0.0.1:1/x"}, token=host, project=pid)[0] in (400, 502)
        # ---- a font by name, a picture (as the browser sends it) ----
        ok(api("/inspo/font", "POST", {"project": pid, "name": "pixel"}, token=host, project=pid))
        thumb = "data:image/png;base64," + base64.b64encode(png((56, 198, 177))).decode()
        r = ok(api("/inspo/image", "POST", {"project": pid, "name": "teal moss", "thumb": thumb, "colors": ["#38C6B1", "#12151A"]}, token=host, project=pid))
        assert api("/inspo/image", "POST", {"project": pid, "name": "x", "thumb": "data:image/svg+xml;base64,PHN2Zz4=", "colors": []}, token=host, project=pid)[0] == 400, "no svg"
        pal = r["palette"]; assert pal and all(k in pal for k in ["bg", "surface", "text", "accent", "accent2"]), pal
        assert contrast(pal["text"], pal["bg"]) >= 12 and contrast(pal["accent"], pal["bg"]) >= 3 and contrast(pal["accent2"], pal["bg"]) >= 3, pal
        assert r["font"]["pair"] == "silkscreen", "the newest font wins (pixel)"
        # spectators can't add
        inv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        assert api("/inspo/font", "POST", {"project": pid, "name": "Lora"}, token=spec, project=pid)[0] in (403, 404)

        # ---- the app: the board on the dashboard, a dropped picture measured in the browser, Flint ----
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1500, "height": 1000}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInspo", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_selector("#pj-board .ib-grid .ib-item", timeout=15000)
            assert pg.locator("#pj-board .ib-item").count() == 3 and pg.locator("#pj-board .ib-sw").count() == 5
            # the k-means in the page finds a picture's colors
            cols = pg.evaluate("""(async () => { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 20; const g = cv.getContext('2d');
              g.fillStyle = '#F26B1D'; g.fillRect(0, 0, 30, 20); g.fillStyle = '#12151A'; g.fillRect(30, 0, 10, 20);
              const im = new Image(); im.src = cv.toDataURL(); await new Promise(r => im.onload = r); return TribeInspo.paletteOf(im, 3); })()""")
            assert cols[0] == "#F26B1D" and any(lum(c) < 0.02 for c in cols[1:]), cols   # scaling blends a few edge pixels
            # drop a picture file
            with pg.expect_file_chooser() as fc: pg.click("#ib-pick")
            buf = png((242, 107, 29)); p_file = tmp / "ember.png"; p_file.write_bytes(buf)
            fc.value.set_files(str(p_file))
            pg.wait_for_function("document.querySelectorAll('#pj-board .ib-item').length === 4", timeout=10000)
            # Flint: a Pinterest-style link from chat, then "dress it up"
            pg.evaluate(f"TribeFlint.ask('use this for inspiration http://{sh}/board/9')")
            pg.wait_for_function("document.querySelectorAll('#pj-board .ib-item').length === 5", timeout=15000)
            pg.evaluate("TribeFlint.ask('dress it up')")
            for _ in range(40):
                if (repo / "design" / "inspiration.css").exists(): break
                time.sleep(0.25)
            b.close()
        css = (repo / "design" / "inspiration.css").read_text()
        v = ok(api(f"/inspo?project={pid}", token=host))
        assert f"--insp-accent: {v['applied']['palette']['accent']}" in css and "--insp-bg:" in css and "color-scheme:" in css, css
        brand = ok(api(f"/projects/{pid}/website/brand", token=host, project=pid))["brand"]
        assert brand["primary"] == v["applied"]["palette"]["accent"] and brand["font"] == v["applied"]["font"]["pair"], (brand, v["applied"])
        msgs = [m.get("text", "") for m in ok(api("/chat/general?limit=50", token=host, project=pid))["messages"]]
        assert any("dressed up the project from the inspiration board" in t for t in msgs), msgs[-3:]
        # apply via the API: the app only, after a shuffle
        r = ok(api("/inspo/apply", "POST", {"project": pid, "to": "app", "shuffle": True}, token=host, project=pid)); assert any("inspiration.css" in c for c in r["changed"])
        # remove an item
        first = v["items"][0]["id"]; r = ok(api(f"/inspo/{first}?project={pid}", "DELETE", token=host, project=pid)); assert all(x["id"] != first for x in r["items"])
        assert not errors, errors
        print("ok e2e_inspo")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
