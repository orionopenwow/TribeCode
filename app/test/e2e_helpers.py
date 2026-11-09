"""Set up your helpers (v0.22): the right panel's first card. Meet Flint → Give Flint an AI (or keep simple rules) →
Bring your own AI (or later); then the card is gone for good. Flint's dock shows only the Ask box until a conversation
starts, and the project faces (emoji and pictures) are true squares."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5320 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-hs-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        time.sleep(2)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1300, "height": 820}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeHelpers", timeout=15000)
            pg.wait_for_selector("#helper-setup")
            assert "0 of 3" in pg.text_content("#helper-setup .hs-head")
            assert not pg.locator("#cc-connect").is_visible(), "no second Connect your AI card"
            assert not pg.locator("#flint .fl-head").is_visible(), "no empty Flint header"
            pg.click("[data-hs-do='flint']")
            pg.wait_for_function("document.querySelector('#helper-setup .hs-head').textContent.includes('1 of 3')")
            assert pg.locator("[data-hs-brain='browser']").is_visible() and pg.locator("[data-hs-brain='cloud']").is_visible()
            pg.click("[data-hs-do='brain']")
            pg.wait_for_selector("[data-hs-connect]", state="visible")
            pg.click("[data-hs-do='ai']")
            pg.wait_for_function("!document.getElementById('helper-setup')")
            pg.reload(); pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000); time.sleep(1)
            assert pg.locator("#helper-setup").count() == 0, "stays gone"
            # faces: a true square
            pg.evaluate("TribeClient.api('/projects/' + TribeClient.project(), {method: 'PATCH', body: {emoji: '🌿'}})"); time.sleep(1)
            r = pg.evaluate("(() => { const f = document.querySelector('.rail .pj-circle.on .pj-face') || document.querySelector('.pj-face.emo'); const e = f.querySelector('.pj-emo'); const a = f.getBoundingClientRect(); return [a.width, a.height, e ? parseFloat(getComputedStyle(e).fontSize) : 0]; })()")
            assert abs(r[0] - r[1]) < 1 and r[2] > 10, r
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_helpers")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
