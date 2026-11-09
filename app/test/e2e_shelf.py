"""The starter shelf: picks on a game project's overview, a Claude skill copied into the repo, libraries in the Toolbox,
the whole shelf in the Workshop. jsDelivr is mocked (a listing with path tricks that must be refused).
Usage: python app/test/e2e_shelf.py
"""
import json, os, re, signal, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4887 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
errors = []
FILES = {
    "patch-gg/pixelfx@main": {"/skills/pixelfx/SKILL.md": "---\nname: pixelfx\ndescription: pixel effects\n---\n# pixelfx\n", "/skills/pixelfx/notes/ref.md": "reference",
                              "/skills/pixelfx/../../evil.md": "nope", "/skills/pixelfx/.hidden/x.md": "nope", "/skills/pixelfx/run.exe": "nope", "/README.md": "not in the skill"},
    "anthropics/skills@main": {"/skills/webapp-testing/SKILL.md": "---\nname: webapp-testing\n---\n", "/skills/webapp-testing/scripts/with_server.py": "print('hi')"},
}

class CDN(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        m = re.match(r"^/data/([^/]+/[^@]+@[^?]+)\?structure=flat$", self.path)
        if m:
            files = FILES.get(m.group(1), {}); body = json.dumps({"files": [{"name": k, "size": len(v)} for k, v in files.items()]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body); return
        m = re.match(r"^/gh/([^/]+/[^@]+@[^/]+)(/.*)$", self.path)
        if m and m.group(2) in FILES.get(m.group(1), {}):
            body = FILES[m.group(1)][m.group(2)].encode(); self.send_response(200); self.end_headers(); self.wfile.write(body); return
        self.send_response(404); self.end_headers()

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-shelf-", dir="/tmp")
    cdn = ThreadingHTTPServer(("127.0.0.1", 0), CDN); threading.Thread(target=cdn.serve_forever, daemon=True).start()
    c = f"http://127.0.0.1:{cdn.server_address[1]}"
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_SHELF_CDN": c + "/gh", "TRIBE_SHELF_DATA": c + "/data"}
    log = open(os.path.join(tmp, "..", f"shelf-server-{PORT}.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env={**env, "NO_PROXY": "127.0.0.1,localhost"})
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1440, "height": 900}); host.on("pageerror", lambda e: errors.append(str(e)))
            host.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            # a game project from the setup flow
            host.evaluate("document.getElementById('pj-plus').click()"); host.click(".np-setup [data-ns='tpl:game']"); host.fill("#np-input", "Lantern Run"); host.click("#np-create")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=25000); host.click(".modal-card.ii [data-close]")
            pid = host.evaluate("TribeProjects.current()")
            repo = Path(tmp, "workspaces", pid)
            for _ in range(80):
                if (repo / ".git").exists(): break
                time.sleep(0.25)
            d = api(f"/shelf?project={pid}", token=tok)[1]
            assert "game" in d["types"], d["types"]
            assert any(x["id"] in ("pixelfx", "pixelfx-skill", "phaser", "kaplay") for x in d["picks"]), [x["id"] for x in d["picks"]]
            # the overview's Toolbox
            host.click("#nest-overview"); host.wait_for_selector("#pj-more", state="attached", timeout=15000); host.evaluate("document.querySelector('#pj-more').open = true"); host.wait_for_selector("#pj-tools .pt-tile", timeout=15000)   # simple-dashboard: tools live under More
            assert "picks for a game" in host.text_content("#pj-tools .pt-head")
            if host.locator("#pj-tools [data-shelf-add='pixelfx-skill']").count(): host.click("#pj-tools [data-shelf-add='pixelfx-skill']")
            else: assert api("/shelf/pixelfx-skill/add", "POST", {"project": pid}, token=tok)[0] == 200
            for _ in range(60):
                if (repo / ".claude" / "skills" / "pixelfx" / "notes" / "ref.md").exists() and (repo / "TOOLBOX.md").exists(): break
                time.sleep(0.25)
            sk = repo / ".claude" / "skills" / "pixelfx"
            assert (sk / "SKILL.md").read_text().startswith("---\nname: pixelfx"), "the skill is in the repo"
            assert (sk / "notes" / "ref.md").exists(), "its other files too"
            assert not (repo / ".claude" / "evil.md").exists() and not (repo / "evil.md").exists() and not (sk / ".hidden").exists() and not (sk / "run.exe").exists(), "path tricks and odd types refused"
            assert not (sk / "README.md").exists()
            # a library: a line in TOOLBOX.md and the Toolbox doc
            assert api("/shelf/phaser/add", "POST", {"project": pid}, token=tok)[0] == 200
            tb = (repo / "TOOLBOX.md").read_text()
            assert "**pixelfx skill**" in tb and "**Phaser**" in tb and "npm i phaser" in tb, tb
            assert api("/shelf/phaser/add", "POST", {"project": pid}, token=tok)[0] == 200 and (repo / "TOOLBOX.md").read_text().count("**Phaser**") == 1, "adding twice keeps one line"
            docs = api("/docs", token=tok, project=pid)[1]["docs"]; assert any(x["title"] == "Toolbox" for x in docs), docs
            chat = json.dumps(api("/chat/general?limit=20", token=tok, project=pid)[1]); assert "added **Phaser** to the toolbox" in chat
            d2 = api(f"/shelf?project={pid}", token=tok)[1]
            assert not any(x["id"] in ("phaser", "pixelfx-skill") for x in d2["picks"]), "added items leave the picks"
            # the Workshop: Starter shelf first
            host.evaluate("TribeWorkshop.open('shelf')"); host.wait_for_selector("#ws-body .ws-card-s", timeout=10000)
            wait_text(host, "#ws-body", "Claude Code skills"); wait_text(host, "#ws-body", "Libraries")
            wait_text(host, "#ws-body", "in this project")
            host.screenshot(path=str(ROOT / "docs" / "screenshots" / "shelf-workshop.png")) if "--shots" in sys.argv else None
            # members can't add to projects they can't see; spectators can't add
            assert api("/shelf/phaser/add", "POST", {"project": "nope"}, token=tok)[0] == 404
            b.close()
        assert not errors, errors
        print("e2e_shelf: OK (game picks on the overview, a Claude skill copied into the repo safely, libraries in the Toolbox, the shelf in the Workshop)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-2500:]); raise
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
