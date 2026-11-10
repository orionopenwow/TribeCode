"""Flint, the guide: the mascot flies to a target with a bubble and a ring, leaves pixel embers, runs the tour (Next,
Skip), the ? menu replays it, "open files" makes him point at the Files row, phones fit. Usage: python app/test/e2e_flint_guide.py
"""
import os, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4975 + 30 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fg-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=30000)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_timeout(800)
            # point: Flint flies next to the target, the ring wraps it, the bubble shows; embers trail him
            pg.evaluate("void TribeFlintGuide.point('#nest-docs', 'Files live here.')")
            pg.wait_for_selector("#fg-bubble.on", timeout=5000)
            assert "Files live here" in pg.inner_text("#fg-bubble")
            assert pg.get_attribute("#fg-sprite", "src").endswith("assets/flint.svg")
            box = pg.evaluate("(() => { const s = document.querySelector('#fg-sprite').getBoundingClientRect(), t = document.querySelector('#nest-docs').getBoundingClientRect(); return [Math.abs((s.top + s.height / 2) - (t.top + t.height / 2)), s.left - t.right]; })()")
            assert box[0] < 30 and -20 < box[1] < 60, ("Flint sits beside the target", box)
            assert pg.evaluate("document.querySelector('#fg-ring').classList.contains('on')")
            pg.click("#fg-next"); pg.wait_for_function("!document.querySelector('#flint-guide').classList.contains('on')", timeout=5000)
            # the tour: several steps, Next advances, Skip ends it, it's remembered
            pg.evaluate("void TribeFlintGuide.tour()"); pg.wait_for_selector("#fg-bubble.on .fg-steps", timeout=5000)
            n = int(pg.inner_text(".fg-steps").split("/")[1]); assert n >= 3, n
            assert pg.evaluate("document.querySelectorAll('.fg-ember').length") > 0, "pixel embers while he flies"
            pg.click("#fg-next"); pg.wait_for_function("document.querySelector('.fg-steps') && document.querySelector('.fg-steps').textContent.trim().startsWith('2')", timeout=5000)
            pg.click("#fg-skip"); pg.wait_for_function("!document.querySelector('#flint-guide').classList.contains('on')", timeout=5000)
            assert pg.evaluate("localStorage.getItem('tribecode.flint.tour')") == "done"
            # the ? menu replays it
            pg.click("#tb-help"); pg.click("[data-help=tour]"); pg.wait_for_selector("#fg-bubble.on .fg-steps", timeout=5000); pg.keyboard.press("Escape")
            pg.wait_for_function("!document.querySelector('#flint-guide').classList.contains('on')", timeout=5000)
            # asking Flint to open Files: v0.27.2 he flies to the Files row as the small "at work" flame (flintfly.js), then Files opens
            pg.fill("[data-flbar] input, [data-flbar] textarea", "open files"); pg.keyboard.press("Enter")
            pg.wait_for_function("(() => { const f = document.getElementById('flint-fly'); return f && f.classList.contains('on'); })()", timeout=6000)
            pg.wait_for_function("document.body.dataset.view === 'docs'", timeout=6000)
            # with the flier turned off he points with the big guide instead
            pg.evaluate("TribeFlintFly.setEnabled(false)")
            pg.fill("[data-flbar] input, [data-flbar] textarea", "open files"); pg.keyboard.press("Enter")
            pg.wait_for_selector("#fg-bubble.on", timeout=6000); assert "Files" in pg.inner_text("#fg-bubble")
            pg.click("#fg-next"); pg.evaluate("TribeFlintFly.setEnabled(true)")
            # Flint's own intro: dimmed, six tiles, a Try chip fills the box and it's remembered
            pg.evaluate("TribeFlintGuide.intro(document.querySelector('[data-flbar] .fl-in'))"); pg.wait_for_selector("#fg-intro .fg-tile", timeout=4000)
            assert pg.locator("#fg-intro .fg-tile").count() == 6 and pg.evaluate("document.querySelector('#flint-guide').classList.contains('dim')")
            pg.click("#fg-intro [data-try='task: fix the jump']"); pg.wait_for_selector("#fg-intro", state="detached")
            assert pg.input_value("[data-flbar] .fl-in") == "task: fix the jump" and pg.evaluate("localStorage.getItem('tribecode.flint.intro')") == "done"
            pg.fill("[data-flbar] .fl-in", "")
            # Flint's face is the mascot everywhere
            assert pg.locator(".fl-av img.fl-face[src$='flint.svg']").count() >= 1
            # phone: the tour fits
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Maya'}))")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_timeout(2500); ph.evaluate("TribeHub && TribeHub.open('home')"); ph.wait_for_timeout(600)
            ph.evaluate("void TribeFlintGuide.tour('phone')"); ph.wait_for_selector("#fg-bubble.on", timeout=6000)
            assert ph.evaluate("(() => { const r = document.querySelector('#fg-bubble').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1; })()")
            b.close()
        assert not errors, errors
        print("e2e_flint_guide: OK (intro card, points with a ring + bubble, embers, tour Next/Skip remembered, ? replays, 'open files' points, phone fits)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()

if __name__ == "__main__":
    main()
