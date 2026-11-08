"""Resizable panes (desktop): drag the sidebar and right-panel edges, sizes are remembered, double-click resets,
the user bar follows the sidebar, phones have no handles. Usage: python app/test/e2e_panes.py
"""
import os, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4985 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-panes-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=30000)
            pg.wait_for_selector("#pane-h-side", state="visible"); pg.wait_for_selector("#pane-h-right", state="visible")
            sw = lambda: round(pg.evaluate("document.querySelector('#tour-side').getBoundingClientRect().width"))
            rw = lambda: round(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.shell .window')).gridTemplateColumns.split(' ').pop())"))
            assert sw() == 260 and rw() == 320, (sw(), rw())
            def drag(sel, dx):
                bb = pg.locator(sel).bounding_box(); x, y = bb["x"] + bb["width"] / 2, bb["y"] + 300
                pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + dx / 2, y, steps=4); pg.mouse.move(x + dx, y, steps=4); pg.mouse.up()
            drag("#pane-h-side", 80); assert abs(sw() - 340) <= 2, sw()
            pg.wait_for_function("Math.abs(document.querySelector('#userbar').getBoundingClientRect().right - document.querySelector('#tour-side').getBoundingClientRect().right) < 3"), "the user bar follows the sidebar"
            drag("#pane-h-right", -100); assert abs(rw() - 420) <= 2, rw()
            drag("#pane-h-side", 900); assert sw() == 440, ("max", sw())
            pg.reload(); pg.wait_for_function("TribeClient.connected()", timeout=30000); pg.wait_for_selector("#pane-h-side", state="visible")
            assert sw() == 440 and abs(rw() - 420) <= 2, ("remembered", sw(), rw())
            pg.dblclick("#pane-h-side"); assert sw() == 260, sw()
            pg.focus("#pane-h-right"); pg.keyboard.press("ArrowLeft"); assert abs(rw() - 432) <= 2, rw()
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_timeout(1500)
            assert ph.locator(".pane-handle:visible").count() == 0, "no handles on phones"
            b.close()
        assert not errors, errors
        print("e2e_panes: OK (drag sidebar + right panel, limits, remembered, double-click reset, keyboard, user bar follows, phones none)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()

if __name__ == "__main__":
    main()
