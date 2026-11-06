"""Voice huddle test: two members join, WebRTC connects with real (fake-device) audio, mute and
screen share propagate, leaving cleans up. Usage: python app/test/e2e_huddle.py [--shots]"""
import json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4796
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def open_as(browser, name, token):
    page = browser.new_context(viewport={"width": 1600, "height": 1000}, permissions=["microphone"]).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type in ("warning", "error") and print(name, m.type, m.text[:200]))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    # Headless Chrome has no screen to capture: hand back a canvas stream instead.
    page.add_init_script("""navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'); setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 1e6).toString(16).padStart(6, '0'); g.fillRect(0, 0, 320, 180); }, 100);
      return c.captureStream(10); };""")
    page.goto(BASE)
    wait_text(page, "#sync-status", "connected")
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-h-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Huddle Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya"})["token"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                  args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            host, maya = open_as(b, "Orion", host_tok), open_as(b, "Maya", maya_tok)
            host.click("#h-join")
            wait_text(maya, "#huddle-box", "Join huddle")
            wait_text(maya, "#chat-list", "started a huddle")
            maya.click("#h-join")
            for pg in (host, maya):
                try:
                    pg.wait_for_function("TribeHuddle.debug().length === 1 && TribeHuddle.debug()[0].state === 'connected' && TribeHuddle.debug()[0].audio", timeout=20000)
                except Exception:
                    print("DEBUG host", host.evaluate("JSON.stringify({d: TribeHuddle.debug(), r: TribeHuddle.roster(), me: TribeClient.state().me.id, inCall: TribeHuddle.inCall()})"))
                    print("DEBUG maya", maya.evaluate("JSON.stringify({d: TribeHuddle.debug(), r: TribeHuddle.roster(), me: TribeClient.state().me.id, inCall: TribeHuddle.inCall()})"))
                    raise
            # fake mic produces a beep, so someone shows as speaking
            host.wait_for_function("document.querySelectorAll('#huddle-box .hface').length === 2", timeout=5000)
            host.wait_for_function("document.querySelector('#huddle-box .hface.speaking')", timeout=10000)
            wait_text(host, "#room-list", "🎙️")
            # mute propagates
            maya.click("#h-mute")
            host.wait_for_function("document.querySelector('#huddle-box .hface .mute')", timeout=5000)
            # screen share reaches the other side as live video (renegotiation mid-call)
            host.click("#h-share")
            maya.wait_for_selector(".screen-win video", timeout=15000)
            maya.wait_for_function("document.querySelector('.screen-win video').videoWidth > 0", timeout=15000)
            if take:
                host.wait_for_timeout(500); host.screenshot(path=str(ROOT / "docs" / "screenshots" / "huddle.png"))
            host.click("#h-share")
            maya.wait_for_selector(".screen-win", state="detached", timeout=10000)
            # leaving cleans up both sides
            maya.click("#h-leave")
            host.wait_for_function("TribeHuddle.debug().length === 0 && TribeHuddle.roster().length === 1", timeout=10000)
            # closing the tab also removes you from the huddle
            host.close()
            maya.wait_for_function("TribeHuddle.roster().length === 0", timeout=10000)
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Huddle test passed")


if __name__ == "__main__":
    main()
