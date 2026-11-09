"""Phone app mode: the switch in project settings, the overview's Phone app card (stacks, Set it up), the Expo starter
written into an empty repo (and into mobile/ next to existing code), its commit, the Toolbox entries, "Install
dependencies" with a fake npm (host computer only: friends and proxied calls get 403; --ignore-scripts unless ticked),
the log on the card, and the Preview pane's Expo Go QR code while a mock Metro answers.
Usage: python app/test/e2e_phoneapp.py [--shots]
"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4931 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors = []

FAKE_NPM = r"""
const fs = require('fs'), path = require('path');
fs.mkdirSync('node_modules/expo', { recursive: true });
fs.writeFileSync('node_modules/.fake-npm-args', process.argv.slice(2).join(' '));
console.log('added 1 package from a fake npm');
console.log('\x1b[32mok\x1b[0m');
"""


class Metro(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        body = b"packager-status:running" if self.path == "/status" else b"metro"
        self.send_response(200); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)


def api(path, method="GET", body=None, token=None, project=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] in (200, 202), (what, r); return r[1]


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def git(repo, *a):
    return subprocess.run(["git", "-C", str(repo), *a], check=True, capture_output=True, text=True).stdout.strip()


def dirty(repo):
    """Changed or untracked files, apart from the tribe context file the repo autopilot writes on its own."""
    return [l for l in git(repo, "status", "--porcelain").splitlines() if not l.endswith("TRIBE_CONTEXT.md")]


def make_repo(path, files):
    path.mkdir(parents=True, exist_ok=True)
    for rel, txt in files.items():
        (path / rel).parent.mkdir(parents=True, exist_ok=True); (path / rel).write_text(txt)
    git(path, "init", "-q", "-b", "main"); git(path, "add", "-A"); git(path, "-c", "user.email=t@t", "-c", "user.name=T", "commit", "-q", "-m", "init")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-phoneapp-", dir="/tmp"))
    (tmp / "fake-npm.js").write_text(FAKE_NPM)
    pocket = tmp / "pocket-pal"; make_repo(pocket, {"README.md": "# Pocket Pal\n\nA tiny app.\n"})
    webby = tmp / "webby"; make_repo(webby, {"package.json": json.dumps({"name": "webby", "private": True}), "index.html": "<h1>web</h1>"})
    metro = ThreadingHTTPServer(("127.0.0.1", 0), Metro); metro.handle_error = lambda *a: None   # probes queued before it serves time out: no noise
    metro_port = metro.server_address[1]
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_PHONEAPP_NPM": f'node "{tmp / "fake-npm.js"}"', "TRIBE_PHONEAPP_METRO_PORT": str(metro_port)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "server.log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": str(pocket)}, token=orion))["project"]["id"]
        wid = ok(api("/projects", "POST", {"path": str(webby)}, token=orion))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}))["token"]   # a tribe-wide builder
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        spec = ok(api("/join", "POST", {"code": inv2["code"], "name": "Vee"}))["token"]

        s0 = ok(api("/phoneapp", token=orion, project=pid))
        assert s0["on"] is False and s0["stack"] == "expo" and s0["stacks"]["expo"]["recommended"] and set(s0["stacks"]) == {"expo", "capacitor", "tauri"}, s0
        assert all(v["why"] for v in s0["stacks"].values())
        assert api("/phoneapp", "PUT", {"on": True}, token=spec, project=pid)[0] == 403, "spectators can't switch it"
        assert api("/phoneapp", "PUT", {"stack": "flutter"}, token=orion, project=pid)[0] == 400

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Orion", orion, pid))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)

            # ---------- project settings: the switch ----------
            host.evaluate("TribeShell.go('project-settings')")
            host.wait_for_selector("#ps-phone:not([disabled])", timeout=10000)
            assert "Phone app mode (iOS / Android)" in host.text_content("#ps-phone-row") and not host.is_checked("#ps-phone")
            host.click("#ps-phone-row"); host.wait_for_function("TribePhoneApp.state() && TribePhoneApp.state().on === true", timeout=5000)
            assert ok(api("/phoneapp", token=orion, project=pid))["on"] is True
            host.click("#invite-modal [data-close]")

            # ---------- the overview card: stacks, Set it up ----------
            host.evaluate("TribeApp.show('home')")
            host.wait_for_selector("#pj-more", state="attached", timeout=15000); host.evaluate("document.querySelector('#pj-more').open = true")   # simple-dashboard: under More
            host.wait_for_selector("#pa-card .pa-stack", timeout=15000)
            assert host.locator("#pa-card .pa-stack").count() == 3 and "Recommended" in host.text_content("#pa-card [data-stack='expo']")
            assert host.get_attribute("#pa-card [data-stack='expo']", "aria-checked") == "true"
            assert "wraps" in host.text_content("#pa-card [data-stack='capacitor']").lower()
            host.click("#pa-card [data-pa='setup']")
            host.wait_for_selector("#pa-card .pa-steps", timeout=15000)
            for f in ["package.json", "app.json", "App.js", "index.js", "README.md", ".gitignore"]: assert (pocket / f).exists(), f   # empty repo: at the root
            pkg = json.loads((pocket / "package.json").read_text())
            assert pkg["dependencies"]["expo"].startswith("~58.") and pkg["dependencies"]["react"] == "19.3.0" and pkg["dependencies"]["react-native"] == "0.88.1", pkg
            assert pkg["name"] == "pocket-pal" and json.loads((pocket / "app.json").read_text())["expo"]["name"] == "pocket-pal"
            assert '{"pocket-pal"}' in (pocket / "App.js").read_text()
            rd = (pocket / "README.md").read_text(); assert rd.startswith("# Pocket Pal\n\nA tiny app.") and "npx expo start" in rd and "Expo Go" in rd, "the repo's README keeps its text and gets the steps"
            assert git(pocket, "log", "-1", "--format=%s|%an") == "TribeCode: phone app starter|Orion"
            files = git(pocket, "show", "--name-only", "--format=", "HEAD").split()
            assert {"package.json", "app.json", "App.js", "index.js", "README.md", ".gitignore", "TOOLBOX.md"} <= set(files), files
            assert dirty(pocket) == [], dirty(pocket)
            tb = (pocket / "TOOLBOX.md").read_text(); assert "**Expo**" in tb, tb
            docs = ok(api("/docs", token=orion, project=pid))["docs"]; assert any(d["title"] == "Toolbox" for d in docs)
            assert api("/phoneapp/setup", "POST", {}, token=orion, project=pid)[0] == 409, "only once"
            assert api("/phoneapp", "PUT", {"stack": "tauri"}, token=orion, project=pid)[0] == 409, "the stack is fixed once set up"

            # ---------- install: host computer only ----------
            assert api("/phoneapp/install", "POST", {}, token=sam, project=pid)[0] == 403, "friends get 403"
            assert api("/phoneapp/install", "POST", {}, token=orion, project=pid, headers={"X-Forwarded-For": "1.2.3.4"})[0] == 403, "proxied calls get 403"
            assert not ok(api("/phoneapp", token=sam, project=pid))["canInstall"]
            assert "Runs on the host computer" not in host.text_content("#pa-card")
            host.click("#pa-card [data-pa='install']")
            host.wait_for_function("document.querySelector('#pa-log.ok')", timeout=20000)
            log = host.text_content("#pa-log")
            assert "fake npm" in log and "Done: dependencies installed." in log and "\x1b" not in log, log
            assert (pocket / "node_modules" / ".fake-npm-args").read_text() == "install --no-audit --no-fund --ignore-scripts"
            assert host.locator("#pa-card .pa-step.done").count() == 1
            host.click("#pa-scripts"); host.click("#pa-card [data-pa='install']")
            for _ in range(80):
                if "--ignore-scripts" not in (pocket / "node_modules" / ".fake-npm-args").read_text(): break
                time.sleep(0.1)
            assert (pocket / "node_modules" / ".fake-npm-args").read_text() == "install --no-audit --no-fund", "ticked: install scripts allowed"
            if SHOTS: host.wait_for_timeout(500); host.locator("#pa-card").screenshot(path=str(ROOT / "docs" / "screenshots" / "phone-app-card.png"))

            # ---------- Preview: open it on a device ----------
            host.click("#pa-card [data-pa='preview']")
            host.wait_for_selector("#pa-dev h3", timeout=10000)
            assert "Start Expo on the host" in host.text_content("#pa-dev")
            threading.Thread(target=metro.serve_forever, daemon=True).start()   # `npx expo start` now runs
            host.click("#pa-dev [data-pa-check]")
            host.wait_for_selector("#pa-dev .pa-qr svg", timeout=10000)
            url = host.text_content("#pa-url"); assert url.startswith("exp://") and url.endswith(f":{metro_port}"), url
            assert "same Wi-Fi" in host.text_content("#pa-dev") and "--tunnel" in host.text_content("#pa-dev")
            st = ok(api("/phoneapp", token=sam, project=pid)); assert st["expo"]["running"] and st["expo"]["url"] == url, "friends see the QR too"
            if SHOTS: host.locator("#pvw").screenshot(path=str(ROOT / "docs" / "screenshots" / "phone-app-preview.png"))

            # ---------- a repo with code: the starter goes into mobile/ ----------
            ok(api("/phoneapp", "PUT", {"on": True, "stack": "capacitor"}, token=sam, project=wid), "a builder switches it on")
            r = ok(api("/phoneapp/setup", "POST", {}, token=sam, project=wid), "setup in mobile/")
            assert r["folder"] == "mobile" and r["committed"] and r["toolbox"] == ["capacitor"], r
            assert (webby / "mobile" / "capacitor.config.json").exists() and json.loads((webby / "package.json").read_text())["name"] == "webby", "the web app's files are untouched"
            assert json.loads((webby / "mobile" / "package.json").read_text())["name"] == "webby-mobile"
            assert git(webby, "log", "-1", "--format=%s|%an") == "TribeCode: phone app starter|Sam" and dirty(webby) == [], dirty(webby)
            assert "**Capacitor**" in (webby / "TOOLBOX.md").read_text()

            # ---------- phone at 390px: the card fits ----------
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Orion", orion, pid))
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            phone.evaluate("TribeApp.show('home')"); phone.wait_for_selector("#pj-more", state="attached", timeout=15000); phone.evaluate("document.querySelector('#pj-more').open = true")
            phone.wait_for_selector("#pa-card .pa-steps", timeout=15000)
            phone.locator("#pa-card").scroll_into_view_if_needed()
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            cb = phone.locator("#pa-card").bounding_box(); assert cb["x"] >= 0 and cb["x"] + cb["width"] <= 391, cb
            b.close()
        assert not errors, errors
        print("e2e_phoneapp: OK (settings switch, stacks card, Expo starter + commit + Toolbox, mobile/ beside code, host-only install with a fake npm, Expo Go QR in Preview)")
    except Exception:
        try: print((tmp / "server.log").read_text()[-2500:])
        except Exception: pass
        raise
    finally:
        srv.terminate()
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()
        metro.server_close()


if __name__ == "__main__":
    main()
