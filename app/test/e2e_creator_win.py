"""The window stays a window (v0.44, app/ui/creatorwin.js): in the desktop app every full-screen creator's top bar carries
the window's own minimize, maximize and close buttons at its far right, and they press the title bar's own. The bar is
the strip the window drags by. Under a sheet's scrim a floating copy sits over the title bar's buttons. In a browser
tab (no desktop app) nothing is added.
Usage: python app/test/e2e_creator_win.py"""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5590 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"

CHECK = """(sel) => { const bar = document.querySelector(sel); const w = bar && bar.querySelector(':scope > .cw-win'); if (!w) return { has: false };
  const r = w.getBoundingClientRect(), kids = [...bar.children].filter(e => e !== w && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const over = kids.filter(k => { const q = k.getBoundingClientRect(); return q.width > 1 && q.left < r.right - 1 && r.left < q.right - 1 && q.top < r.bottom - 1 && r.top < q.bottom - 1; }).map(k => k.id || k.className);
  return { has: true, last: bar.lastElementChild === w, right: Math.round(innerWidth - r.right), over, drag: bar.hasAttribute('data-tauri-drag-region'), n: w.querySelectorAll('[data-cw]').length }; }"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cwin-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeCreatorWin && window.TribeAppCreator && TribeClient.connected() && TribeClient.project()", timeout=30000)

            # a browser tab: nothing added
            pg.evaluate("TribeAppCreator.open({ pid: TribeClient.project(), template: 'habits' })"); pg.wait_for_selector("#apc-play"); pg.wait_for_timeout(500)
            assert pg.locator("#apc .cw-win").count() == 0, "no window buttons in a browser tab"
            pg.click("#apc-close"); pg.wait_for_selector("#apc", state="detached")

            # the desktop app (stand-in: the class app.js sets, and the title bar's buttons record what they were asked)
            pg.evaluate("""document.body.classList.add('app-window'); window.__pressed = [];
              document.querySelectorAll('#win-ctl [data-w]').forEach(b => b.addEventListener('click', e => { e.stopImmediatePropagation(); __pressed.push(b.dataset.w); }, true));""")
            tools = [
                ("App Creator", "TribeAppCreator.open({ pid: TribeClient.project(), template: 'habits' })", "#apc .apc-top", "#apc-close", "#apc"),
                ("website designer", "TribeSiteDesigner.open({ pid: TribeClient.project(), template: 'cafe' })", "#wdz .wdz-top", "#wdz .cs-back", "#wdz"),
                ("Motion Studio", "TribeMotionStudio.open({})", "#mos .mos-top", "#mos .cs-back", "#mos"),
            ]
            for name, open_js, bar, back, root in tools:
                pg.evaluate(open_js); pg.wait_for_selector(bar); pg.wait_for_timeout(900)
                if pg.locator("#wdz-start:not([hidden])").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
                r = pg.evaluate(CHECK, bar)
                assert r["has"] and r["n"] == 3, f"{name}: the three window buttons are on its top bar ({r})"
                assert r["last"] and r["right"] <= 24, f"{name}: they sit at the far right ({r})"
                assert not r["over"], f"{name}: nothing on the bar overlaps them ({r['over']})"
                assert r["drag"], f"{name}: the bar drags the window"
                pg.evaluate("__pressed = []"); pg.click(f"{bar} > .cw-win [data-cw='min']"); pg.click(f"{bar} > .cw-win [data-cw='max']")
                assert pg.evaluate("__pressed") == ["min", "max"], f"{name}: they press the title bar's own ({pg.evaluate('__pressed')})"
                pg.click(back); pg.wait_for_function(f"!document.querySelector('{root}') || !document.querySelector('{root}').getClientRects().length", timeout=10000); pg.wait_for_timeout(300)
                print(f"ok  {name}: minimize, maximize and close at the far right of its bar; they work; Back still leaves")

            # the Launch kit is a sheet with a margin: its bar stays as it is, and the floating copy covers the title bar's
            pg.evaluate("TribeLaunchKit.open()"); pg.wait_for_selector("#lch .lch-head"); pg.wait_for_timeout(900)
            assert pg.locator("#lch .cw-win").count() == 0 and pg.locator(".cw-win.cw-float").count() == 1, "Launch kit: the floating copy, not a second set in its bar"
            pg.click("#lch .cs-back"); pg.wait_for_selector(".cw-float", state="detached", timeout=10000)
            print("ok  Launch kit (a sheet): the floating copy over the title bar, gone when it closes")

            # under a sheet: one floating copy over the title bar's own
            pg.evaluate("const s = document.createElement('div'); s.className = 'ui-scrim'; s.id = 'tscrim'; s.style.cssText = 'position:fixed;inset:0;z-index:90'; document.body.appendChild(s)")
            pg.wait_for_selector(".cw-win.cw-float", timeout=5000)
            d = pg.evaluate("(() => { const a = document.querySelector('#win-ctl [data-w]').getBoundingClientRect(), b = document.querySelector('.cw-float [data-cw]').getBoundingClientRect(); return Math.abs(a.left - b.left) + Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)); })()")
            assert d <= 3, f"the floating copy sits over the title bar's own ({d}px off)"
            pg.evaluate("document.getElementById('tscrim').remove()"); pg.wait_for_selector(".cw-float", state="detached", timeout=5000)
            print("ok  under a sheet: a floating copy over the title bar's buttons, gone with the sheet")

            # leaving the desktop app's mode takes them away again
            pg.evaluate("TribeAppCreator.open({ pid: TribeClient.project(), template: 'habits' })"); pg.wait_for_selector("#apc .apc-top > .cw-win")
            pg.evaluate("document.body.classList.remove('app-window')"); pg.wait_for_selector("#apc .cw-win", state="detached", timeout=5000)
            assert not errors, errors
            b.close()
        print("e2e_creator_win: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
