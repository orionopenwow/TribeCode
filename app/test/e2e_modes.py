"""Experience modes and starters (v0.20). Beginner hides the advanced sections, the choice follows the member to
another device, the host sets a starting mode per role, and New project › Remix a starter fills the GitHub box."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5280 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-md-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hc = b.new_context(viewport={"width": 1400, "height": 900}); host = hc.new_page(); host.on("pageerror", lambda e: errors.append("host " + str(e)))
            host.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMode", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            # nothing chosen: advanced, nothing hidden (the way it has always looked)
            assert host.evaluate("TribeMode.get()") == "advanced"
            assert host.evaluate("document.body.dataset.mode") == "advanced"
            # beginner hides the agent coordination sections, and the choice is saved on the member
            host.evaluate("TribeMode.set('beginner')")
            host.wait_for_function("document.body.dataset.mode === 'beginner'")
            assert not host.evaluate("TribeMode.allows(TribeMode.minFor('ownership'))")
            assert host.evaluate("TribeMode.allows(TribeMode.minFor('chat'))")
            time.sleep(0.5)
            assert api("/me", token=tok)[1]["member"].get("mode") == "beginner"
            # data-mode-min hides a feature below its mode
            host.evaluate("const d = document.createElement('div'); d.id = 'adv-only'; d.dataset.modeMin = 'advanced'; d.textContent = 'x'; document.body.appendChild(d)")
            assert not host.is_visible("#adv-only")
            host.evaluate("TribeMode.set('advanced')"); host.wait_for_function("document.body.dataset.mode === 'advanced'")
            assert host.is_visible("#adv-only")
            # the Settings picker
            host.evaluate("TribeMode.set('')")
            # host sets a starting mode for builders; a builder starts in it and can still change it
            assert api("/tribe/modes", "PUT", {"builder": "beginner", "bogus": "x", "mod": "nope"}, token=tok) == (200, {"modes": {"builder": "beginner"}})
            st, inv = api("/invites", "POST", {}, token=tok); assert st == 200, inv
            code = inv.get("code") or inv.get("invite", {}).get("code")
            st, j = api("/join", "POST", {"code": code, "name": "Riley"}); assert st == 200, j
            fc = b.new_context(); fr = fc.new_page(); fr.on("pageerror", lambda e: errors.append("friend " + str(e)))
            fr.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Riley', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{j['token']}'}}}})) }} catch (e) {{}}")
            fr.goto(BASE + "/?skipIntro=1"); fr.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMode && TribeClient.state().tribe", timeout=15000)
            fr.wait_for_function("TribeMode.get() === 'beginner'", timeout=5000)
            assert fr.evaluate("TribeMode.source()") == "role"
            # a role can't set modes
            assert api("/tribe/modes", "PUT", {"builder": "advanced"}, token=j["token"])[0] == 403
            # starters: checked licenses only, and Remix fills the GitHub box
            items = api("/shelf/starters", token=tok)[1]["items"]
            assert len(items) >= 10 and all(i["license"] in ("MIT", "CC0") for i in items)
            host.evaluate("TribeProjects.openNew()")
            host.click('[data-ns="remix"]')
            host.wait_for_selector('[data-remix="gabrielecirulli/2048"]')
            assert host.locator(".st-lic").first.inner_text() in ("MIT", "CC0")
            host.click('[data-remix="gabrielecirulli/2048"]')
            host.wait_for_function("document.querySelector('#np-input') && document.querySelector('#np-input').value === 'https://github.com/gabrielecirulli/2048'")
            b.close()
        assert not errors, errors
        print("ok e2e_modes")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
