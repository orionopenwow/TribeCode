"""Flint at work (v0.27.2): when Flint changes something, a small flame (#flint-fly) glides to the place with a label
("Opening", "Writing…", "Adding…", "Editing", "Done ✓", "Remembered ✓"), outlines it (.ffly-sel), then flies home
and hides. Settings › Flint "Show Flint moving around" turns it off; phones get a smaller one that homes to the rack.
Usage: python app/test/e2e_flint_fly.py   (honours TRIBE_PORT_OFFSET)"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4890 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS", "")) if os.environ.get("SHOTS") else None
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# records every label the flier shows, whether it was visible, and whether something was outlined at that moment
SPY = """(() => { window.__ff = []; const tick = () => { const f = document.getElementById('flint-fly');
  if (f) { const l = f.querySelector('.ffly-l').textContent, on = f.classList.contains('on'), sel = document.querySelector('.ffly-sel');
    const last = window.__ff[window.__ff.length - 1]; const rec = l + '|' + on + '|' + (sel ? (sel.id || sel.className.split(' ')[0] || sel.tagName) : '');
    if (!last || last !== rec) window.__ff.push(rec); } requestAnimationFrame(tick); }; tick(); })()"""


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()


def wait(fn, timeout=12, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.12)
    raise AssertionError("timed out waiting for " + what)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flintfly-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(lambda: api("/api/health")[0] == 200, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        api("/api/vision", "PUT", {"text": "# Kombucha Empire\n\nTrack every kombucha batch from brewing to bottling.\n"}, host)
        settings = {"onboarded": True, "name": "Camp", "server": {"url": BASE, "token": host}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
        init = f"try {{ localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))}); localStorage.setItem('tribecode.flint.tour', 'done'); }} catch (e) {{}}"   # (also runs in the sandboxed preview frame)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script(init)
            page.goto(BASE + "/?skipIntro=1")
            page.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlint && window.TribeFlintMem && window.TribeFlintFly", timeout=15000)
            time.sleep(1); page.evaluate(SPY)

            def ask(t, expect, timeout=14):
                n = page.evaluate("TribeFlint.thread().length")
                page.evaluate("t => TribeFlint.ask(t)", t)
                return wait(lambda: next((m for m in page.evaluate("TribeFlint.thread()")[n:] if m["who"] == "flint" and expect.lower() in m["text"].lower()), None), timeout, f"Flint to answer {t!r}")

            def saw(label, timeout=6, outlined=True):
                def hit():
                    for r in page.evaluate("window.__ff"):
                        l, on, sel = r.split("|")
                        if label.lower() in l.lower() and on == "true" and (sel or not outlined): return r
                return wait(hit, timeout, f"the flier to show {label!r}")

            def goes_home(timeout=6):
                wait(lambda: not page.evaluate("document.getElementById('flint-fly').classList.contains('on')"), timeout, "Flint to fly home and hide")
                assert page.locator(".ffly-sel").count() == 0, "the outline goes when he's done"

            # 1. open the task board: he flies to the row, then to the board
            ask("open the task board", "Opened")
            saw("Opening"); saw("Task Board"); goes_home()
            # 2. add a task: the card on the board gets the outline
            page.evaluate("window.__ff = []")
            ask("add a task: label the ginger batch", "Added to Tasks")
            saw("Adding a task", outlined=True); saw("Added"); goes_home()
            # 3. write the launch doc
            page.evaluate("window.__ff = []")
            ask("write the launch doc", "Flint draft", timeout=20)
            saw("Writing"); saw("Saved to Files"); goes_home()
            # 4. a jump sound
            page.evaluate("window.__ff = []")
            ask("add a jump sound", "jump", timeout=15)
            saw("Adding jump"); saw("Added jump"); goes_home()
            # 5. remember something: Settings › Flint when it's open
            page.evaluate("TribeFlintMem.act('settings')"); page.wait_for_selector("#set-flintmem .fm", timeout=8000)
            page.evaluate("window.__ff = []")
            ask("remember I'm learning CSS", "remember")
            saw("Remembered", outlined=True)
            if SHOTS: time.sleep(0.4); page.screenshot(path=str(SHOTS / "flint-fly-remember-1440.png"))
            goes_home()
            # 6. build, then edit in the preview: "Editing" on the preview, then "Done ✓"
            page.keyboard.press("Escape"); time.sleep(0.3)
            page.evaluate("window.__ff = []")
            ask("build me a batch tracker", "On it", timeout=20)
            saw("Building", outlined=False)
            page.evaluate("TribePreview.open()")
            page.wait_for_selector("#pvw-frame iframe", timeout=15000)
            page.wait_for_selector("#flm-in-preview", timeout=8000)
            if not page.locator("#pvf.is-open #flm-in-preview").is_visible(): page.evaluate("TribePreviewFlint.open()")
            page.evaluate("window.__ff = []")
            page.fill("#flm-in-preview", "make the title bigger"); page.press("#flm-in-preview", "Enter")
            saw("Editing", outlined=True)
            if SHOTS: page.screenshot(path=str(SHOTS / "flint-fly-editing-1440.png"))
            saw("Done ✓", timeout=12)
            goes_home(8)
            # 7. the setting turns him off
            page.evaluate("TribeFlintMem.act('settings')"); page.wait_for_selector("#fm-fly", timeout=8000)
            page.uncheck("#fm-fly"); assert not page.evaluate("TribeFlintFly.enabled()")
            page.keyboard.press("Escape"); time.sleep(0.3)
            page.evaluate("window.__ff = []")
            ask("open the task board", "Opened"); time.sleep(1.2)
            assert not any(r.split("|")[1] == "true" for r in page.evaluate("window.__ff")), page.evaluate("window.__ff")
            page.evaluate("TribeFlintFly.setEnabled(true)")

            # 8. phones: a smaller flier that homes to the bottom rack and keeps clear of the composer
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
            ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlint && window.TribeFlintFly", timeout=15000)
            time.sleep(1); ph.evaluate(SPY)
            ph.evaluate("TribeFlint.ask('add a task: bottle the hibiscus')")
            wait(lambda: any("|true|" in r for r in ph.evaluate("window.__ff")), 8, "the phone flier")
            assert ph.evaluate("document.getElementById('flint-fly').classList.contains('ffly-sm')"), "smaller on phones"
            box = ph.evaluate("(() => { const r = document.getElementById('flint-fly').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })()")
            assert box[0] >= 0 and box[1] <= 391, box
            if SHOTS: ph.screenshot(path=str(SHOTS / "flint-fly-phone-390.png"))
            wait(lambda: not ph.evaluate("document.getElementById('flint-fly').classList.contains('on')"), 8, "the phone flier to go home")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("ok e2e_flint_fly")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
