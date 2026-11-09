"""The asset library (v0.25, server/assets.js + app/ui/assets.js): the catalog, search (built-ins, an icon set's file list,
glTF models, Poly Haven), adding sounds, sprites, motion CSS, an icon, a font, a rigged .glb and a Poly Haven HDRI into a
project's assets/ with credits, chat notes, permissions (guests/spectators can't add), names that try to escape the folder,
the agents' find_assets/add_assets tools, Flint's "add a jump sound", and the Files › Assets picker. jsDelivr, GitHub raw and
Poly Haven are mocked by a local server (nothing leaves the machine).
Usage: python app/test/e2e_assets.py
"""
import json, os, re, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5470 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20z"/></svg>'
hits = []

class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def ok(self, body, ct="application/octet-stream"):
        self.send_response(200); self.send_header("Content-Type", ct); self.end_headers(); self.wfile.write(body if isinstance(body, bytes) else body.encode())
    def do_GET(self):
        p = self.path; hits.append(p)
        if p.startswith("/data/lucide-static@1.70.0"):
            return self.ok(json.dumps({"files": [{"name": "/icons/heart.svg"}, {"name": "/icons/heart-crack.svg"}, {"name": "/icons/star.svg"}, {"name": "/icons/sub/x.svg"}]}), "application/json")
        if p.startswith("/data/"): return self.ok(json.dumps({"files": []}), "application/json")
        if p == "/npm/lucide-static@1.70.0/icons/heart.svg": return self.ok(SVG, "image/svg+xml")
        if re.match(r"^/npm/@fontsource/press-start-2p@5\.3\.0/files/press-start-2p-latin-400-normal\.woff2$", p): return self.ok(b"wOF2fakefont")
        if p == "/raw/Fox/glTF-Binary/Fox.glb": return self.ok(b"glTF\x02\x00\x00\x00fakefox")
        if p.startswith("/ph/search"): return self.ok(json.dumps(["forest_sky", "rocky_ground"]), "application/json")
        if p == "/ph/info/forest_sky": return self.ok(json.dumps({"name": "Forest Sky", "type": 0, "authors": {"Greg Zaal": "All"}}), "application/json")
        if p == "/ph/files/forest_sky": return self.ok(json.dumps({"hdri": {"1k": {"hdr": {"url": f"http://127.0.0.1:{self.server.server_address[1]}/dl/forest_sky_1k.hdr", "size": 9}}}}), "application/json")
        if p == "/dl/forest_sky_1k.hdr": return self.ok(b"#?RADIANCE")
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

def mcp(token, tool, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-assets-", dir="/tmp"))
    mock = ThreadingHTTPServer(("127.0.0.1", 0), Mock); threading.Thread(target=mock.serve_forever, daemon=True).start()
    m = f"http://127.0.0.1:{mock.server_address[1]}"
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_ASSETS_CDN": m + "/npm", "TRIBE_ASSETS_DATA": m + "/data", "TRIBE_ASSETS_RAW": m + "/raw", "TRIBE_ASSETS_POLYHAVEN": m + "/ph"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Lantern Hop", "bio": "A pixel platformer"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api(f"/projects/{pid}/setup/repo", "POST", {}, token=host, project=pid), "repo")

        # ---- the catalog: kinds, packs, browse sources, what's left out ----
        c = ok(api("/assets", token=host))
        kinds = {k["id"] for k in c["kinds"]}; assert {"sound", "model", "rigged", "texture", "pixel", "icon", "font", "motion"} <= kinds, kinds
        assert any(s["id"] == "kenney" and s["license"] == "CC0-1.0" for s in c["sources"])
        assert any(x["title"] == "Mixamo" for x in c["left_out"]) and all("GPL" not in (pk.get("license") or "") for pk in c["packs"])

        # ---- search ----
        r = ok(api("/assets/search?q=jump&remote=0", token=host))["results"]; assert r[0]["pack"] == "sfx" and r[0]["name"] == "jump", r[:3]
        r = ok(api("/assets/search?q=heart&kind=icon", token=host))["results"]; names = [x["name"] for x in r if x["pack"] == "lucide"]
        assert "heart" in names and "heart-crack" in names and "x" not in names, names   # sub-folders aren't icons
        r = ok(api("/assets/search?q=walk&kind=rigged&remote=0", token=host))["results"]; assert any(x["name"] == "Fox" for x in r), r
        r = ok(api("/assets/search?q=forest", token=host))["results"]; assert any(x["pack"] == "polyhaven" and x["name"] == "forest_sky" for x in r), r
        # previews: a sprite (SVG with a locked-down CSP) and a sound (WAV)
        req = urllib.request.Request(BASE + "/api/assets/preview?pack=sprites&name=slime", headers={"Authorization": "Bearer " + host})
        with urllib.request.urlopen(req) as x: assert x.headers["Content-Type"] == "image/svg+xml" and "default-src 'none'" in x.headers["Content-Security-Policy"] and b"<rect" in x.read()
        req = urllib.request.Request(BASE + "/api/assets/preview?pack=sfx&name=coin", headers={"Authorization": "Bearer " + host})
        with urllib.request.urlopen(req) as x: w = x.read(); assert w[:4] == b"RIFF" and w[8:12] == b"WAVE" and len(w) > 2000

        # ---- add: sounds, sprites, motion, an icon, a font, a rigged model, an HDRI ----
        items = [{"pack": "sfx", "name": "jump"}, {"pack": "sfx", "name": "jump", "seed": 3}, {"pack": "sprites", "name": "slime"}, {"pack": "motion-css", "name": "motion"},
                 {"pack": "lucide", "name": "heart"}, {"pack": "fonts", "name": "press-start-2p"}, {"pack": "gltf", "name": "Fox"}, {"pack": "polyhaven", "name": "forest_sky"}]
        a = ok(api("/assets/add", "POST", {"project": pid, "items": items}, token=host, project=pid), "add")
        st = ok(api(f"/projects", token=host)); repo = next(x for x in st["projects"] if x["id"] == pid).get("repo") or str(tmp / "tribe" / "workspaces" / pid)
        d = Path(repo) / "assets" if (Path(repo) / "assets").exists() else next((tmp / "tribe").rglob("CREDITS.md")).parent
        for f in ["sounds/jump.wav", "sounds/jump-3.wav", "sprites/slime.svg", "css/motion.css", "icons/lucide-heart.svg", "fonts/press-start-2p-400.woff2", "fonts/press-start-2p.css", "models/Fox.glb", "hdri/forest_sky_1k.hdr"]:
            assert (d / f).exists(), f"missing {f} in {d}: {a}"
        assert (d / "sounds/jump.wav").read_bytes() != (d / "sounds/jump-3.wav").read_bytes(), "a seed makes a variation"
        assert "prefers-reduced-motion" in (d / "css/motion.css").read_text()
        assert 'font-family: "Press Start 2P"' in (d / "fonts/press-start-2p.css").read_text()
        cr = (d / "CREDITS.md").read_text()
        assert "models/Fox.glb" in cr and "CC-BY-4.0" in cr and "tomkranis" in cr, cr        # the Fox's rigging needs credit
        assert "Powered by Poly Haven" in cr and "Greg Zaal" in cr and "lucide-heart.svg" in cr and "ISC" in cr
        n0 = cr.count("\n"); ok(api("/assets/add", "POST", {"project": pid, "items": [{"pack": "sprites", "name": "slime"}]}, token=host, project=pid))
        assert (d / "CREDITS.md").read_text().count("\n") == n0, "credits don't repeat"
        msgs = [x.get("text", "") for x in ok(api("/chat/general?limit=50", token=host, project=pid))["messages"]]
        assert any("from the asset library" in t and "CREDITS.md" in t for t in msgs), msgs[-3:]

        # ---- refusals: unknown packs, browse-only, escaping names, guests and spectators ----
        assert api("/assets/add", "POST", {"project": pid, "items": [{"pack": "nope", "name": "x"}]}, token=host)[0] == 404
        assert api("/assets/add", "POST", {"project": pid, "items": [{"pack": "lucide", "name": "../../../../etc/passwd"}]}, token=host)[0] in (502, 404)
        assert not list((tmp / "tribe").rglob("passwd")), "a name escaped the assets folder"
        assert api("/assets/add", "POST", {"project": pid, "items": []}, token=host)[0] == 400
        inv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]
        spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        r = api("/assets/add", "POST", {"project": pid, "items": [{"pack": "sfx", "name": "coin"}]}, token=spec, project=pid); assert r[0] in (403, 404), r
        assert api("/assets", token=None)[0] == 401

        # ---- agents: find_assets / add_assets ----
        agent = ok(api("/agents", "POST", {}, token=host))["token"]
        e, t = mcp(agent, "find_assets", {"query": "coin"}); assert not e and "sfx / coin" in t and "sprites / coin" in t, t
        e, t = mcp(agent, "add_assets", {"items": [{"pack": "sfx", "name": "coin"}], "project": pid}); assert not e and "sounds/coin.wav" in t, t
        assert (d / "sounds/coin.wav").exists()

        # ---- the app: Files › Assets, and Flint's "add a jump sound" ----
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAssets", timeout=20000)
            pg.evaluate(f"TribeClient.switchProject ? TribeClient.switchProject('{pid}') : null"); time.sleep(0.8)
            pg.evaluate("TribeAssets.open()"); pg.wait_for_selector("#as-modal .as-tile", timeout=8000)
            assert pg.locator("#as-modal .as-tile").count() >= 12   # the built-ins show before you type
            pg.fill("#as-q", "slime"); pg.wait_for_function("document.querySelector('#as-grid').innerText.toLowerCase().includes('slime')", timeout=8000)
            pg.wait_for_selector("#as-grid .as-thumb img", timeout=8000)   # the sprite preview loaded through the signed-in fetch
            pg.click("#as-grid .as-tile"); assert pg.locator("#as-add").is_enabled()
            pg.click("[data-kind='sound']"); pg.fill("#as-q", ""); pg.wait_for_function("document.querySelectorAll('#as-grid .as-tile').length === 12", timeout=8000)
            pg.click("#as-add"); pg.wait_for_selector("#as-modal", state="detached", timeout=8000)
            # Flint: a built-in by name goes straight in
            if pg.evaluate("!!(window.TribeFlint && TribeFlint.ask)"):
                pg.evaluate("TribeFlint.ask('add an explosion sound')")
                for _ in range(40):
                    if (d / "sounds/explosion.wav").exists(): break
                    time.sleep(0.25)
                assert (d / "sounds/explosion.wav").exists(), "Flint added the sound"
            # Files › Assets tile
            pg.evaluate("window.TribeApp && TribeApp.nav ? TribeApp.nav('docs') : document.querySelector('#nest-docs')?.click()"); time.sleep(0.8)
            if pg.locator("#fg-assets").count():
                pg.click("#fg-assets"); pg.wait_for_selector("#as-modal", timeout=5000); pg.keyboard.press("Escape")
            b.close()
        assert not errors, errors
        print("ok e2e_assets")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
