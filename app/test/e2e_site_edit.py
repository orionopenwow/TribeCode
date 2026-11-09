"""Edit the website in the preview, and site templates (v0.25).
Preview editing (server/preview.js + app/ui/preview.js): Edit in the preview bar turns on edit mode in the page; double-click
a heading, type, Enter -> the source file changes (and the preview reloads); picking an element and asking Flint "change it
to ..." or "remove this" works with no AI; a style request with no AI says to choose Flint's AI; Flint with an AI (a mocked
OpenAI-compatible server) returns find/replace edits that land in the page and its CSS; edits that add a script are refused;
text that isn't unique, paths outside the app folder and spectators are refused.
Site templates (server/sitetemplates.js): save a project's website as a template (name/tagline/color become {{…}}), list it,
start a new project from it in the setup guide's starter and with POST /projects/:id/site-template (nothing overwritten).
Usage: python app/test/e2e_site_edit.py
"""
import json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5490 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Corner Bakery</title><link rel="stylesheet" href="styles.css"></head>
<body><h1>Corner Bakery</h1><p class="tag">Fresh bread every morning</p>
<ul><li>Sourdough</li><li>Rye</li><li>Croissants</li></ul><p>Bread</p><p>Bread</p>
<a class="cta" href="#order">Order a cake</a></body></html>
"""
CSS = ":root { --brand: #F26B1D; }\nh1 { font-size: 32px; color: #222; }\n.cta { background: #333; color: #fff; }\n"
llm_calls = []
NEXT = {"text": ""}

class LLM(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(json.dumps({"data": [{"id": "mock"}]}).encode())
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}"); llm_calls.append(body)
        txt = NEXT["text"]
        if body.get("stream"):
            self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": txt}}]}) + "\n\n").encode()); self.wfile.write(b"data: [DONE]\n\n")
        else:
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"content": txt}}]}).encode())

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-siteedit-", dir="/tmp"))
    lm = ThreadingHTTPServer(("127.0.0.1", 0), LLM); threading.Thread(target=lm.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Corner Bakery", "bio": "Fresh bread every morning"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api(f"/projects/{pid}/setup/repo", "POST", {}, token=host, project=pid), "repo")
        repo = tmp / "tribe" / "workspaces" / pid; assert (repo / ".git").exists(), list((tmp / "tribe").iterdir())
        (repo / "index.html").write_text(PAGE); (repo / "styles.css").write_text(CSS)
        tok = ok(api("/preview/token", "POST", token=host, project=pid)); href = tok.get("path") or f"/preview/{pid}/{tok['pt']}/"
        E = lambda body, t=host: api("/preview/edit", "POST", body, token=t, project=pid)
        F = lambda body, t=host: api("/preview/flint", "POST", body, token=t, project=pid)

        # ---- text edits ----
        ok(E({"href": href, "before": "Fresh bread every morning", "after": "Warm bread & coffee <from 7>"}), "edit")
        h = (repo / "index.html").read_text(); assert "Warm bread &amp; coffee &lt;from 7&gt;" in h and "Fresh bread every morning" not in h, h   # escaped, never raw HTML
        assert E({"href": href, "before": "Bread", "after": "Toast"})[0] == 409            # appears twice: refused
        assert E({"href": href + "../../etc/passwd.html", "before": "a", "after": "b"})[0] in (400, 403, 404)
        assert E({"href": href + "styles.css", "before": "#222", "after": "red"})[0] == 400   # pages only
        inv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        assert E({"href": href, "before": "Rye", "after": "Spelt"}, spec)[0] in (403, 404)

        # ---- Flint with no AI: the simple ones still work ----
        r = ok(F({"href": href, "pick": {"tag": "a", "text": "Order a cake", "html": "<a class=\"cta\">Order a cake</a>"}, "ask": "change it to \"Order a birthday cake\""}), "rules")
        assert r["via"] == "rules" and "Order a birthday cake" in (repo / "index.html").read_text()
        ok(F({"href": href, "pick": {"tag": "li", "text": "Croissants", "html": "<li>Croissants</li>"}, "ask": "remove this"}), "remove")
        assert "Croissants" not in (repo / "index.html").read_text() and "<li>Rye</li>" in (repo / "index.html").read_text()
        r = F({"href": href, "pick": {"tag": "h1", "text": "Corner Bakery"}, "ask": "make it bigger and orange"}); assert r[0] == 503 and "AI" in r[1]["error"], r

        # ---- Flint with an AI (mocked OpenAI-compatible server) ----
        cfg = api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{lm.server_address[1]}/v1", "model": "mock", "key": "sk-test-123456"}, token=host)
        assert cfg[0] == 200, cfg
        NEXT["text"] = json.dumps({"edits": [{"file": "css", "find": "h1 { font-size: 32px; color: #222; }", "replace": "h1 { font-size: 48px; color: var(--brand); }"}], "say": "Made the title bigger and orange."})
        r = ok(F({"href": href, "pick": {"tag": "h1", "text": "Corner Bakery", "html": "<h1>Corner Bakery</h1>"}, "ask": "make it bigger and orange"}), "flint ai")
        assert "48px" in (repo / "styles.css").read_text() and r["say"].startswith("Made the title"), r
        assert llm_calls and "make it bigger and orange" in json.dumps(llm_calls[-1]) and "styles.css" in json.dumps(llm_calls[-1])
        NEXT["text"] = json.dumps({"edits": [{"file": "page", "find": "<h1>Corner Bakery</h1>", "replace": "<h1 onclick=\"steal()\">Corner Bakery</h1><script>alert(1)</script>"}]})
        before = (repo / "index.html").read_text(); r = F({"href": href, "pick": {"tag": "h1", "text": "Corner Bakery"}, "ask": "add a cool effect"}); assert r[0] == 422, r
        assert (repo / "index.html").read_text() == before, "a refused change leaves the file alone"
        NEXT["text"] = json.dumps({"edits": [{"file": "page", "find": "not in the page at all", "replace": "x"}]})
        assert F({"href": href, "pick": {"tag": "h1", "text": "Corner Bakery"}, "ask": "tweak"})[0] == 422
        api("/llm", "PUT", {"provider": "none"}, token=host)

        # ---- in the app: Edit, double-click the heading, type, Enter ----
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePreview", timeout=20000)
            pg.evaluate(f"TribeClient.switchProject && TribeClient.switchProject('{pid}')"); time.sleep(1)
            pg.evaluate("TribePreview.open()"); pg.wait_for_selector("#pvw.ready, .pvw.ready", timeout=15000)
            pg.click(".pvw-edit"); pg.wait_for_selector("#pvw-edbar:not(.hidden)")
            fr = next(f for f in pg.frames if "/preview/" in f.url)
            fr.wait_for_function("!!document.querySelector('[data-tribe-preview][data-tribe-preview=\"\"]') || document.querySelectorAll('style[data-tribe-preview]').length > 0", timeout=5000)
            time.sleep(2.5); fr = next(f for f in pg.frames if "/preview/" in f.url); fr.wait_for_selector("style[data-tribe-preview]", state="attached", timeout=8000)
            fr.dispatch_event("h1", "dblclick"); fr.wait_for_selector("h1[contenteditable=true]", timeout=3000); fr.evaluate("(() => { const r = document.createRange(); const h = document.querySelector('h1'); r.selectNodeContents(h); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('insertText', false, ' & Cafe'); })()"); fr.press("h1", "Enter")
            for _ in range(40):
                if "Corner Bakery &amp; Cafe" in (repo / "index.html").read_text(): break
                time.sleep(0.25)
            assert "Corner Bakery &amp; Cafe" in (repo / "index.html").read_text(), (repo / "index.html").read_text()
            # pick an element: the Ask box wakes up
            time.sleep(1.5); fr = next(f for f in pg.frames if "/preview/" in f.url)
            fr.wait_for_selector("ul li", timeout=8000); fr.dispatch_event("ul li", "click")
            pg.wait_for_function("!document.querySelector('#pvw-edask').disabled", timeout=5000)
            assert "<li>" in pg.text_content("#pvw-edpick")
            pg.fill("#pvw-edask", "change it to \"Seeded rye\""); pg.click("#pvw-edgo")
            for _ in range(40):
                if "Seeded rye" in (repo / "index.html").read_text(): break
                time.sleep(0.25)
            assert "Seeded rye" in (repo / "index.html").read_text()
            b.close()

        # ---- site templates ----
        t = ok(api("/site-templates", "POST", {"project": pid, "name": "Little shop", "summary": "A one-page shop"}, token=host), "save template")
        assert t["slug"] == "little-shop" and t["files"] >= 2
        td = tmp / "tribe" / ".tribe" / "site-templates" / "little-shop"
        assert "{{name}}" in (td / "index.html").read_text() and "Corner Bakery" not in (td / "index.html").read_text()
        assert any(x["slug"] == "little-shop" for x in ok(api("/site-templates", token=host))["templates"])
        assert api("/site-templates", "POST", {"project": pid, "name": "x"}, token=spec)[0] in (403, 404)
        p2 = ok(api("/projects", "POST", {"name": "Moon Plants", "bio": "Houseplants delivered at night"}, token=host)); p2 = (p2.get("project") or p2)["id"]
        ok(api("/vision", "PUT", {"text": "# Moon Plants\n\nA website for our plant shop: what we sell, hours, and how to order.\n"}, token=host, project=p2))
        sv = ok(api(f"/projects/{p2}/setup", token=host, project=p2)); assert any(x["slug"] == "little-shop" for x in sv["starter"]["templates"]), sv["starter"]
        r = ok(api(f"/projects/{p2}/setup/starter", "POST", {"template": "tribe:little-shop"}, token=host, project=p2), "starter from template")
        assert r["template"] == "tribe:little-shop" and "index.html" in r["written"], r
        repo2 = tmp / "tribe" / "workspaces" / p2
        ih = (repo2 / "index.html").read_text(); assert "Moon Plants" in ih and "{{name}}" not in ih, ih[:300]
        assert api(f"/projects/{p2}/setup/starter", "POST", {"template": "tribe:nope"}, token=host, project=p2)[0] in (404, 400)
        r = ok(api(f"/projects/{p2}/site-template", "POST", {"slug": "little-shop"}, token=host, project=p2)); assert r["into"] == "site"
        r = ok(api(f"/projects/{p2}/site-template", "POST", {"slug": "little-shop", "into": "root"}, token=host, project=p2)); assert r["written"] == [], "nothing overwritten"
        assert api("/site-templates/little-shop", "DELETE", token=spec)[0] == 403
        ok(api("/site-templates/little-shop", "DELETE", token=host)); assert not td.exists()
        assert not errors, errors
        print("ok e2e_site_edit")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
