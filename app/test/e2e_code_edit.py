"""Edit and lock code in the app (v0.23): a builder edits a file in the Code view and saves (a commit on the checked-out
branch, with their name); a 🔒 lock by someone else blocks saving with their name (423) until they unlock; spectators,
secrets and paths outside the repo are refused. The UI: Edit → type → Ctrl+S → saved and committed."""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5350 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
def ok(r, w=""): assert r[0] == 200, f"{w}: {r}"; return r[1]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ce-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Pixel Garden"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api("/vision", "PUT", {"text": "# Pixel Garden\n\nA cozy game."}, token=host, project=pid))
        ok(api(f"/projects/{pid}/setup/repo", "POST", {}, token=host))
        ok(api(f"/projects/{pid}/setup/starter", "POST", {}, token=host))
        repo = Path(ok(api("/code", token=host, project=pid))["name"] and str(tmp / "tribe" / "workspaces" / pid))
        # save = write + commit with the member's name
        r = ok(api("/code/file", "PUT", {"path": "src/hello.js", "text": "console.log('hi');\n", "message": "Say hi"}, token=maya, project=pid), "maya saves")
        assert r["committed"] and (repo / "src" / "hello.js").read_text() == "console.log('hi');\n"
        lg = ok(api("/code/log?path=src/hello.js", token=host, project=pid))["commits"]
        assert lg and "Say hi" in lg[0]["subject"] and "Maya" in lg[0]["author"], lg
        # Maya locks it; Camp can't save over it; unlock frees it
        ok(api("/code/lock", "POST", {"path": "src/hello.js"}, token=maya, project=pid))
        st, e = api("/code/file", "PUT", {"path": "src/hello.js", "text": "x"}, token=host, project=pid)
        assert st == 423 and "Maya" in e.get("error", json.dumps(e)), (st, e)
        assert api("/code/lock", "POST", {"path": "src/hello.js"}, token=host, project=pid)[0] == 423
        ok(api("/code/lock?path=src/hello.js", "DELETE", token=maya, project=pid))
        ok(api("/code/file", "PUT", {"path": "src/hello.js", "text": "console.log('hello');\n"}, token=host, project=pid))
        # refused
        assert api("/code/file", "PUT", {"path": "a.js", "text": "x"}, token=sam, project=pid)[0] == 403
        assert api("/code/file", "PUT", {"path": ".env", "text": "x"}, token=host, project=pid)[0] == 403
        assert api("/code/file", "PUT", {"path": "../escape.js", "text": "x"}, token=host, project=pid)[0] == 400
        assert not (tmp / "tribe" / "workspaces" / "escape.js").exists()
        # UI: Edit -> type -> Ctrl+S
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1400, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Camp', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{host}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint: true, brain: true, ai: true}})) }} catch (e) {{}}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCodeFiles", timeout=15000)
            pg.evaluate(f"TribeProjects.switchTo ? TribeProjects.switchTo('{pid}') : TribeClient.setProject('{pid}')"); time.sleep(1)
            pg.evaluate("TribeApp.show('docs'); TribeCodeFiles.set('code')")
            pg.wait_for_selector("#cf-tree .cf-row", timeout=15000)
            pg.click("#cf-tree .cf-row[data-path='index.html']")
            pg.wait_for_selector("#cf-edit", timeout=10000); pg.click("#cf-edit")
            pg.wait_for_selector("#cf-ed"); pg.click("#cf-ed"); pg.keyboard.press("Control+End"); pg.keyboard.type("\n<!-- edited in TribeCode -->")
            pg.keyboard.press("Control+s")
            pg.wait_for_selector("#cf-edit", timeout=10000)
            assert "edited in TribeCode" in (repo / "index.html").read_text()
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_code_edit")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
