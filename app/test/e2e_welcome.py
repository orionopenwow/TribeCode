"""Flint's welcome: "Open in your browser" on the website lands on app/?welcome=1, where Flint walks a first-time
visitor through a pretend tribe (kind, emoji, name), a few features, then the choice: auto demo, explore, or real.
Usage: python app/test/e2e_welcome.py   (saves docs/screenshots/welcome-*.png)
"""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs" / "screenshots"
PORT = 4993 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-welcome-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?welcome=1"); pg.wait_for_selector("#wl")
            assert pg.locator("#intro").count() == 0, "Flint's welcome replaces the slide intro"
            pg.wait_for_function("document.querySelector('#wl-line').textContent.includes('pretend tribe')")
            assert pg.get_attribute("#wl", "data-step") == "0" and pg.locator(".wl-facts li").count() == 2
            pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / "welcome-1.png"))
            pg.click("#wl-next")
            # 1: make the pretend tribe
            assert pg.get_attribute("#wl", "data-step") == "1"
            pg.click("[data-kind=app]"); assert "Pocket Planner" in pg.inner_text("#wl-tile") and "App" in pg.inner_text("#wl-tile")
            pg.click("[data-emo='🚀']"); assert "🚀" in pg.inner_text("#wl-tile")
            pg.fill("#wl-name", "Snack Squad"); assert "Snack Squad" in pg.inner_text("#wl-tile")
            pg.wait_for_timeout(300); pg.screenshot(path=str(SHOTS / "welcome-2.png"))
            pg.press("#wl-name", "Enter")
            # 2: features, click through
            assert pg.get_attribute("#wl", "data-step") == "2"
            pg.wait_for_function("document.querySelector('#wl-line').textContent.includes('Snack Squad')")
            assert pg.locator(".wl-feat").count() == 4
            pg.click(".wl-feat[data-f='2']"); assert "agent" in pg.inner_text("#wl-show").lower()
            assert pg.get_attribute(".wl-feat[data-f='2']", "aria-pressed") == "true"
            pg.click("#wl-back"); assert pg.get_attribute("#wl", "data-step") == "1" and pg.input_value("#wl-name") == "Snack Squad"
            pg.click("#wl-next"); pg.click("#wl-next")
            # 3: the choice
            assert pg.get_attribute("#wl", "data-step") == "3" and pg.locator(".wl-opt").count() == 3 and pg.is_hidden("#wl-next")
            assert "recommended" in pg.inner_text(".wl-opt--main").lower() and "auto demo" in pg.inner_text(".wl-opt--main").lower()
            pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / "welcome-3.png"))
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.welcome.tribe')).name") == "Snack Squad"
            # the auto demo carries the pretend tribe's name into the showcase
            pg.click(".wl-opt[data-go=auto]")
            pg.wait_for_function("window.TribeOffline && TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=30000)
            assert pg.locator("#wl").count() == 0 and "welcome" not in pg.url
            assert pg.evaluate("TribeOffline.state().tribe.name") == "Snack Squad"
            assert pg.evaluate("localStorage.getItem('tribecode.welcome.v1')") == "done"
            pg.close()

            # explore it myself: the calm demo, same name; a phone gets a full-screen card
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.goto(BASE + "/?welcome=1"); ph.wait_for_selector("#wl")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            ph.click("#wl-skip"); assert ph.get_attribute("#wl", "data-step") == "3"
            ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "welcome-phone.png"))
            ph.click(".wl-opt[data-go=explore]")
            ph.wait_for_function("window.TribeOffline && TribeOffline.active()", timeout=30000)
            assert ph.locator("#wl").count() == 0
            ph.close()

            # start my real tribe: just closes, the normal app is underneath; never shown again on a plain visit
            c = b.new_context(viewport={"width": 1280, "height": 800}); q = c.new_page(); q.on("pageerror", lambda e: errors.append(str(e)))
            q.goto(BASE + "/?welcome=1"); q.wait_for_selector("#wl"); q.keyboard.press("Escape")
            assert q.locator("#wl").count() == 0 and not q.evaluate("window.TribeOffline && TribeOffline.active()")
            q.goto(BASE + "/"); q.wait_for_timeout(800); assert q.locator("#wl").count() == 0
            c.close(); b.close()
        assert not errors, errors
        print("e2e_welcome: ok")
    finally:
        srv.send_signal(2); srv.wait(timeout=10)

if __name__ == "__main__":
    main()
