"""The creators' shared shell (pass 9, app/ui/creatorshell.js): every full-screen creating tool has the same Back
button at the far left (it saves, then leaves), Undo and Redo grouped by the title (left of the middle), and Flint in
his own column, folded and reopened by ONE flame in the top bar (Ctrl J). Flint's box changes the app in App Creator and
in the first preview (without opening the editor). Nothing in a top bar overlaps at 1440 or 390.
Usage: python app/test/e2e_creator_shell.py [--shots DIR]"""
import os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None

BAR = """(sel) => { const top = document.querySelector(sel); const kids = [...top.children].filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; });
  const bad = []; kids.forEach((a, i) => { const ra = a.getBoundingClientRect(); if (ra.left < -1 || ra.right > innerWidth + 1) bad.push('off-screen: ' + (a.id || a.className));
    kids.slice(i + 1).forEach(b => { const rb = b.getBoundingClientRect(); if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) bad.push((a.id || a.className) + ' over ' + (b.id || b.className)); }); });
  const back = top.querySelector('.cs-back'), undo = top.querySelector('.cs-undo'), flame = top.querySelector('.cs-flame');
  return { bad, backFirst: !!back && kids[0] === back, undoLeft: !undo || undo.getBoundingClientRect().right < innerWidth / 2 + 40, flame: !!flame && flame.getBoundingClientRect().left > innerWidth / 2 }; }"""

def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f"shell-{name}.png"))

def bar(pg, sel, name, flame=True):
    r = pg.evaluate(BAR, sel)
    assert not r["bad"], (name, r["bad"])
    assert r["backFirst"], f"{name}: Back is the first thing in the top bar"
    assert r["undoLeft"], f"{name}: Undo and Redo sit left of the middle"
    if flame: assert r["flame"], f"{name}: the flame is on the right"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-shell-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeProjects && window.TribeCreatorShell && TribeClient.connected() && TribeClient.project()", timeout=30000)
            cfg = "TribeClient.api('/projects/' + encodeURIComponent(TribeClient.project()) + '/app-config').then(d => d.config.theme.mode)"

            # ---- App Creator ----
            pg.evaluate("TribeAppCreator.open({ pid: TribeClient.project(), template: 'habits' })"); pg.wait_for_selector("#apc-play"); pg.wait_for_timeout(800)
            bar(pg, "#apc .apc-top", "App Creator")
            assert pg.locator("#apc-close.cs-back").inner_text().strip() == "Dashboard"
            assert pg.locator("#apc #apc-ask").count() == 0 and pg.locator("#apc .apc-right .apc-flint").count() == 0, "Flint is no longer squeezed under the inspector"
            assert pg.locator("#apc .cs-fl .fl-in").is_visible(), "at 1440 Flint's column is open"
            assert pg.locator("#apc-undo").is_disabled(), "nothing to undo yet"
            pg.fill("#apc .cs-fl .fl-in", "make it dark"); pg.press("#apc .cs-fl .fl-in", "Enter")
            pg.wait_for_function("TribeAppCreator.doc().theme.mode === 'dark'", timeout=8000)
            assert not pg.locator("#apc-undo").is_disabled(); pg.click("#apc-undo"); pg.wait_for_function("TribeAppCreator.doc().theme.mode === 'light'")
            pg.click("#apc-redo"); pg.wait_for_function("TribeAppCreator.doc().theme.mode === 'dark'")
            assert pg.locator("#apc .flm-chips [data-flchip]").count() <= 3, "three chips at most"
            pg.click("#apc .cs-fl [data-fl-hide]"); pg.wait_for_function("!document.querySelector('#apc .cs-fl').getClientRects().length")
            assert pg.get_attribute("#apc .cs-flame", "aria-expanded") == "false" and pg.locator("#apc .wdz-fl-rail, #apc .cs-rail").count() == 0
            pg.click("#apc .cs-flame"); pg.wait_for_selector("#apc .cs-fl .fl-in", state="visible")   # the flame brings him back
            pg.keyboard.press("Control+j"); pg.wait_for_function("!document.querySelector('#apc .cs-fl').getClientRects().length")
            pg.keyboard.press("Control+j"); pg.wait_for_selector("#apc .cs-fl .fl-in", state="visible")
            pg.click("#apc-histc"); pg.wait_for_selector("#apc-hlist, .apc-hrow, [id^='apc-h']", timeout=8000); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            shot(pg, "app-1440")
            if pg.locator("#apc-close").count() == 0: raise AssertionError("Esc on the History sheet closed App Creator")
            pg.click("#apc-close"); pg.wait_for_selector("#apc", state="detached")
            pg.wait_for_function(f"{cfg}.then(m => m === 'dark')", timeout=8000)   # Back saved the change
            print("ok  App Creator: Back saves and leaves, Undo/Redo by the title, History, Flint's column, the flame and Ctrl J")

            # ---- the website designer ----
            pg.evaluate("TribeSiteDesigner.open({ pid: TribeClient.project(), template: 'cafe' })"); pg.wait_for_selector("#wdz:not([hidden]) .wdz-top"); pg.wait_for_timeout(1500)
            if pg.locator("#wdz-start:not([hidden])").count(): pg.keyboard.press("Escape")
            bar(pg, "#wdz .wdz-top", "Website designer")
            assert pg.locator("#wdz .wdz-fl-rail").count() == 0, "the rail is gone"
            assert "fl-open" in pg.get_attribute("#wdz", "class"); pg.click("#wdz .wdz-top > .cs-flame"); pg.wait_for_function("document.querySelector('#wdz').classList.contains('fl-rail')")
            pg.click("#wdz .wdz-top > .cs-flame"); pg.wait_for_function("document.querySelector('#wdz').classList.contains('fl-open')")
            pg.click("#wdz-histc"); pg.wait_for_selector("#wdz-hist:not([hidden])"); pg.click("#wdz-histc")
            shot(pg, "site-1440")
            pg.click("#wdz .cs-back"); pg.wait_for_selector("#wdz", state="hidden")
            print("ok  website designer: Back, Undo/Redo/History by the title, no rail, the flame folds and opens Flint")

            # ---- Motion Studio ----
            pg.evaluate("TribeMotionStudio.open({})"); pg.wait_for_selector("#mos .mos-top"); pg.wait_for_timeout(800)
            bar(pg, "#mos .mos-top", "Motion Studio")
            k0 = pg.evaluate("TribeMotionStudio.state().doc.spring.k")
            pg.fill("#mos-ask", "make it snappier"); pg.click("#mos-ask-go"); pg.wait_for_function(f"TribeMotionStudio.state().doc.spring.k > {k0}")
            assert not pg.locator("#mos-undo").is_disabled(); pg.click("#mos-undo"); pg.wait_for_function(f"TribeMotionStudio.state().doc.spring.k === {k0}"); assert not pg.locator("#mos-redo").is_disabled()
            shot(pg, "motion-1440")
            pg.click("#mos-close"); pg.wait_for_selector("#mos", state="detached")
            print("ok  Motion Studio: Back, Undo and Redo, Flint's column answers")

            # ---- the Launch kit ----
            pg.evaluate("TribeLaunchKit.open()"); pg.wait_for_selector("#lch .lch-head"); pg.wait_for_timeout(800)
            bar(pg, "#lch .lch-head", "Launch kit")
            pg.click("#lch .cs-flame"); pg.wait_for_selector("#lch .cs-fl .fl-in", state="visible"); shot(pg, "launch-1440")
            pg.click("#lch .cs-flame"); pg.click("#lch-x"); pg.wait_for_selector("#lch", state="detached")
            print("ok  Launch kit: Back and the flame")

            # ---- the first preview: Flint changes it right there; Keep editing, then Back, lands on the dashboard ----
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea"); pg.fill("#np-idea", "A habit tracker app for my running club with streaks"); pg.click("#np-idea-go")
            pg.wait_for_selector("#fpv [data-fpv='edit']", timeout=40000); pg.wait_for_timeout(800)
            bar(pg, "#fpv .fpv-bar", "First preview")
            assert pg.evaluate(cfg) == "light"
            pg.fill("#fpv .cs-fl .fl-in", "make it dark"); pg.press("#fpv .cs-fl .fl-in", "Enter")
            pg.wait_for_function(f"{cfg}.then(m => m === 'dark')", timeout=15000)
            pg.wait_for_selector("#fpv .cs-fl [data-flact], #fpv .cs-fl .fl-act, #fpv .cs-fl button:has-text('Undo')", timeout=8000)
            assert pg.locator("#apc").count() == 0 and pg.locator("#fpv").count() == 1, "the editor did not stay open"
            shot(pg, "first-1440")
            pg.click("#fpv [data-fpv='edit']"); pg.wait_for_selector("#apc-play", timeout=15000); pg.click("#apc-close"); pg.wait_for_selector("#apc", state="detached")
            pg.wait_for_function("!document.querySelector('#fpv') && !!document.querySelector('#pj-overview') && document.querySelector('#pj-overview').getClientRects().length > 0", timeout=10000)
            print("ok  first preview: Back, Flint changes the app in place, Keep editing then Back lands on the dashboard")

            # ---- a phone: one row, nothing overlapping; the flame opens Flint as a sheet ----
            ph = pg; ph.set_viewport_size({"width": 390, "height": 844})   # the same person, at a phone's width
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeProjects && window.TribeCreatorShell && TribeClient.connected() && TribeClient.project()", timeout=30000)
            ph.evaluate("TribeAppCreator.open({ pid: TribeClient.project() })"); ph.wait_for_selector("#apc-play"); ph.wait_for_timeout(800)
            bar(ph, "#apc .apc-top", "App Creator on a phone")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390
            ph.click("#apc .cs-flame"); ph.wait_for_selector("#apc-sheet .fl-in", state="visible"); shot(ph, "app-390")
            ph.evaluate("TribeAppCreator.close()")
            ph.evaluate("TribeMotionStudio.open({})"); ph.wait_for_selector("#mos .mos-top"); ph.wait_for_timeout(600)
            assert ph.locator("#mos-close.cs-back").is_visible() and ph.locator("#mos .cs-flame").is_visible()
            ph.click("#mos .cs-flame"); ph.wait_for_selector("#mos .cs-fl .fl-in", state="visible"); shot(ph, "motion-390")
            print("ok  390px: Back, Undo/Redo and the flame fit one row; the flame opens Flint's sheet")
            ctx.close(); b.close()
        assert not errors, errors
        print("e2e_creator_shell: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
