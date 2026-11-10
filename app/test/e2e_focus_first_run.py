"""Focused first run (v0.28): a new host sees one question, picks an idea, and has a first version running in the
preview in well under 3 minutes, then one next step at a time (Invite a friend -> Connect your own AI). While it runs
the sidebar keeps only the basics; "Show everything" brings the rest back. A guest who just joined lands in the live
project with a welcome and "Say hi". Getting started milestones are counted in the tribe folder (/api/activation).
Screenshots go to $FOCUS_SHOTS (default: a temp folder)."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5290 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("FOCUS_SHOTS") or tempfile.mkdtemp(prefix="tribe-focus-shots-")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-focus-", dir="/tmp"))
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
            hc = b.new_context(viewport={"width": 1440, "height": 900}); host = hc.new_page(); host.on("pageerror", lambda e: errors.append("host " + str(e)))
            host.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            # 1. a fresh tribe: the one question
            host.goto(BASE + "/?focus=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFirstRun", timeout=15000)
            host.wait_for_selector("#fr-start", timeout=10000)
            assert "What do you want to make with your friends?" in host.text_content("#fr-t")
            assert host.locator(".fr-chip").count() == 6
            host.screenshot(path=str(SHOTS / "focus-start-1440.png"))
            tok = host.evaluate("TribeStore.get().server.token")
            # 2. pick an idea, make it: a first version in the preview, fast
            host.click(".fr-chip:has-text('A pixel platformer')")
            assert "platformer" in host.input_value("#fr-in")
            t0 = time.time(); host.click("#fr-go")
            host.wait_for_selector("#fr-next", timeout=90000)
            took = time.time() - t0
            assert took < 90, f"first version took {took:.0f}s"
            assert host.evaluate("TribeMode.focused()"), "focus mode is on during the first run"
            assert host.evaluate("TribeMode.get()") == "beginner"
            assert not host.evaluate("TribeMode.allows(TribeMode.minFor('ws-agents'))"), "the Agents Hub waits until asked"
            assert not host.evaluate("TribeMode.allows(TribeMode.minFor('repo'))")
            assert host.evaluate("TribeMode.allows(TribeMode.minFor('chat'))") and host.evaluate("TribeMode.allows(TribeMode.minFor('docs'))") and host.evaluate("TribeMode.allows(TribeMode.minFor('ws-tasks'))")
            assert host.evaluate("TribeMode.unlock('ws-agents'), TribeMode.allows(TribeMode.minFor('ws-agents'))"), "Turn it on still works in focus"
            host.wait_for_function("window.TribePreview && TribePreview.info() && TribePreview.info().hasIndex", timeout=20000)
            assert host.is_visible("#fr-all"), "Show everything is always there"
            time.sleep(2)
            act = api("/activation", token=tok)[1]
            assert act["firstProject"] and act["firstPreview"], act
            assert "Invite a friend" in host.text_content("#fr-next")
            host.screenshot(path=str(SHOTS / "focus-preview-1440.png"))
            # 3. next step: invite -> connect your AI
            host.click("#fr-qr"); host.wait_for_selector("#fr-next:has-text('Connect your own AI')", timeout=5000)
            host.keyboard.press("Escape")
            time.sleep(0.5); assert api("/activation", token=tok)[1]["invited"]
            # 4. a guest joins by link: welcome + Say hi
            st, inv = api("/invites", "POST", {}, token=tok); assert st == 200, inv
            code = inv.get("code") or inv.get("invite", {}).get("code")
            st, j = api("/join", "POST", {"code": code, "name": "Maya"}); assert st == 200, j
            for w, h in [(1440, 900), (390, 844)]:
                gc = b.new_context(viewport={"width": w, "height": h}); g = gc.new_page(); g.on("pageerror", lambda e: errors.append("guest " + str(e)))
                g.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Maya', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{j['token']}'}}}})); localStorage.setItem('tribecode.firstrun.test', '1') }} catch (e) {{}}")
                g.goto(BASE + "/"); g.wait_for_selector("#fr-hi", timeout=15000)
                assert "Welcome to Pixel Platformer" in g.text_content("#fr-hi"), g.text_content("#fr-hi")
                g.wait_for_function("TribeClient.project() && (TribeClient.state().projects || []).find(p => p.id === TribeClient.project()).name === 'Pixel Platformer'", timeout=8000)
                if w == 1440: assert not g.is_visible("#nest-ws-agents"), "the Agents Hub row waits until asked"
                assert g.evaluate("TribeMode.focused()")
                time.sleep(1.2); g.screenshot(path=str(SHOTS / f"focus-guest-{w}.png"))
                assert g.evaluate("document.documentElement.scrollWidth") <= w + 1
                if w == 1440:
                    g.click("#fr-sayhi"); assert not g.is_visible("#fr-hi")
                gc.close()
            time.sleep(0.5); assert api("/activation", token=tok)[1]["friendJoined"]
            # 5. Getting started N/5 in Home
            host.evaluate("TribeShell.go && TribeShell.go('hub')"); host.wait_for_selector("#fr-prog", timeout=10000)
            host.wait_for_function("/[3-5]\\/5/.test(document.querySelector('#fr-prog .fr-prog-h').textContent)", timeout=8000)
            assert not host.is_visible("#nest-work"), "Work waits until asked"
            host.screenshot(path=str(SHOTS / "focus-home-1440.png"))
            # 6. Show everything: the full sidebar again
            host.click("#fr-all")
            assert not host.evaluate("TribeMode.focused()")
            assert not host.is_visible("#fr-all")
            # 7. phone: the first screen fits
            ph = hc.new_page(); ph.set_viewport_size({"width": 390, "height": 844})
            ph.goto(BASE + "/?focus=1"); ph.wait_for_function("window.TribeFirstRun && TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeFirstRun.start()"); ph.wait_for_selector("#fr-start")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            ph.screenshot(path=str(SHOTS / "focus-start-390.png"))
            # 8. existing flows are untouched: with ?skipIntro nothing shows
            sk = hc.new_page(); sk.goto(BASE + "/?skipIntro=1"); sk.wait_for_function("window.TribeFirstRun && TribeClient.connected()", timeout=15000)
            time.sleep(0.8); assert not sk.is_visible("#fr-start") and not sk.is_visible("#fr-hi")
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print(f"ok e2e_focus_first_run (first version in {took:.1f}s; shots in {SHOTS})")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
