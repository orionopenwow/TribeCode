"""Open Space in the Agents hub's Office: install (a local fake of the repo), start on its own port with the tribe's
repos as roots, open via the pairing link, stop. Host-only and local-only.
Usage: python app/test/e2e_openspace.py
"""
import json, os, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, OS_PORT = 4895 + OFF, 4896 + OFF
BASE = f"http://localhost:{PORT}"
errors = []

FAKE_SERVER = r"""
const http = require('http'), fs = require('fs'), path = require('path');
const dir = process.env.OFFICE_DIR; fs.mkdirSync(dir, { recursive: true });
const f = path.join(dir, 'secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, 'abc123');
fs.writeFileSync(path.join(dir, 'roots.txt'), process.env.OFFICE_ROOTS || '');
http.createServer((q, s) => { s.writeHead(q.url === '/pair' ? 401 : 200); s.end('office'); }).listen(Number(process.env.PORT), '127.0.0.1');
"""

def fake_repo(at):
    at.mkdir(parents=True)
    (at / "server").mkdir(); (at / "server" / "index.ts").write_text(FAKE_SERVER)
    (at / "package.json").write_text(json.dumps({"name": "open-space", "version": "0.0.0", "private": True, "scripts": {"build": "node -e \"require('fs').mkdirSync('dist',{recursive:true})\" --"}}))
    (at / "package-lock.json").write_text(json.dumps({"name": "open-space", "version": "0.0.0", "lockfileVersion": 3, "requires": True, "packages": {"": {"name": "open-space", "version": "0.0.0"}}}))
    g = lambda *a: subprocess.run(["git", *a], cwd=at, check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "."); g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fake")

def api(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-os-", dir="/tmp"))
    fake_repo(tmp / "upstream")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_OPENSPACE_REPO": str(tmp / "upstream"), "TRIBE_OPENSPACE_REF": "main", "TRIBE_OPENSPACE_DIR": str(tmp / "tools" / "open-space"),
           "TRIBE_OPENSPACE_DATA": str(tmp / "os-data"), "TRIBE_OPENSPACE_PORT": str(OS_PORT)}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
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
            # not installed: the Office shows Install
            # Home > Agent fleet keeps the dashboard sidebar (it doesn't switch to a project's)
            host.evaluate("TribeHub.open('home')"); host.wait_for_selector("#nest-fleet", timeout=15000); host.click("#nest-fleet")
            host.wait_for_selector("#ah-office .ah-office", timeout=15000)
            assert host.evaluate("document.body.classList.contains('global') && document.body.dataset.view === 'agents-hub'"), "fleet keeps the global sidebar"
            assert host.evaluate("document.querySelector('#nest-fleet').classList.contains('on') && !!document.querySelector('#nest-hub')"), "Agent fleet lit, dashboard rows still there"
            assert "Open Space" in host.text_content("#ah-office")
            # one switch: the first time it installs, builds and starts
            host.wait_for_selector("#os-switch[aria-checked='false']"); host.click("#os-switch")
            host.wait_for_selector("#os-open", timeout=90000)
            assert (tmp / "tools" / "open-space" / "dist").exists(), "built"
            assert "running" in host.text_content("#ah-office") and host.get_attribute("#os-switch", "aria-checked") == "true"
            with urllib.request.urlopen(f"http://127.0.0.1:{OS_PORT}/", timeout=5) as r: assert r.read() == b"office"
            st, o = api("/openspace/open", "POST", token=tok); assert st == 200 and o["pair"].endswith("/pair?secret=abc123"), o
            # members who aren't the host (or calls that aren't from this computer) can't drive it
            st, inv = api("/invites", "POST", {"role": "builder"}, token=tok)
            code = inv.get("code") or (inv.get("invite") or {}).get("code")
            st, j = api("/join", "POST", {"code": code, "name": "Sam"}); ftok = j.get("token")
            assert api("/openspace/stop", "POST", token=ftok)[0] == 403
            g = api("/openspace", token=ftok)[1]; assert g.get("hostOnly") and g["running"] and "dir" not in g, g
            assert api("/openspace/stop", "POST", token=tok, headers={"X-Forwarded-For": "1.2.3.4"})[0] == 403, "proxied calls refused"
            host.screenshot(path=str(ROOT / "docs" / "screenshots" / "agents-office.png")) if "--shots" in sys.argv else None
            host.click("#os-switch"); host.wait_for_selector("#os-switch[aria-checked='false']:not([disabled])", timeout=15000)
            assert not host.query_selector("#os-open")
            # from a project's Agents Hub it's the project's page again
            host.evaluate("TribeAgentsHub.open()"); host.wait_for_timeout(300)
            assert not host.evaluate("document.body.classList.contains('global')"), "project Agents Hub uses the project sidebar"
            time.sleep(0.5)
            try: urllib.request.urlopen(f"http://127.0.0.1:{OS_PORT}/", timeout=2); assert False, "still running"
            except (urllib.error.URLError, ConnectionError): pass
            b.close()
        assert not errors, errors
        print("e2e_openspace: OK (install from the repo, start on its own port, open with the pairing link, stop; host and this computer only)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-2500:]); raise
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
