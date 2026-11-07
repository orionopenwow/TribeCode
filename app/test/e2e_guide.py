"""The Guide: tucked away (no sidebar row, no floating button), opened from the profile menu, Ctrl K and Settings;
pages from docs/guide/*.md over a read-only /api/guide that refuses path traversal; search; a phone at 390px.
Usage: python app/test/e2e_guide.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4933 + OFF
BASE = f"http://localhost:{PORT}"
errors = []

def get(path):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path), timeout=20) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-gd-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try:
                if get("/api/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)

        # 1) API: the list, one page, and nothing outside docs/guide
        st, body = get("/api/guide"); assert st == 200, st
        pages = json.loads(body)["pages"]
        files = sorted(f for f in os.listdir(ROOT / "docs" / "guide") if f.endswith(".md"))
        assert 5 <= len(pages) <= 10 and len(pages) == len(files), (len(pages), files)
        assert pages[0]["slug"] == "start-here" and pages[0]["title"] == "Start here", pages[0]
        assert all(len(p["body"].split()) < 480 for p in pages), [(p["slug"], len(p["body"].split())) for p in pages]
        st, body = get("/api/guide/troubleshooting"); assert st == 200 and json.loads(body)["title"] == "Troubleshooting"
        for bad in ["/api/guide/..%2f..%2fpackage.json", "/api/guide/%2e%2e%2fserver%2findex.js", "/api/guide/..%5c..%5cpackage.json", "/api/guide/start-here/..%2f..%2fpackage.json", "/api/guide/nope"]:
            st, body = get(bad); assert st in (400, 404), (bad, st)
            assert b'"name"' not in body and b"require(" not in body, bad
        req = urllib.request.Request(BASE + "/api/guide", method="POST", data=b"{}")
        try: urllib.request.urlopen(req); raise AssertionError("POST should be refused")
        except urllib.error.HTTPError as e: assert e.code == 405, e.code

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1440, "height": 900}); host.on("pageerror", lambda e: errors.append("host: " + str(e)))
            host.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token"); assert tok

            # 2) tucked away: no sidebar row, no floating button
            assert host.evaluate("[...document.querySelectorAll('.side .nest-row, .side button')].every(b => !/guide/i.test(b.textContent))"), "no Guide row in the sidebar"
            assert host.evaluate("TribeShell.dests().find(d => d.key === 'guide').group") == ""

            # 3) profile menu -> Guide
            host.click("#pf-btn"); host.wait_for_selector("#pf-menu:not(.hidden) [data-act=guide]")
            host.click("#pf-menu [data-act=guide]")
            host.wait_for_selector("#guide:not(.hidden) .gd-item", timeout=10000)
            assert host.evaluate("document.body.classList.contains('gd-open')")
            assert host.text_content("#gd-page h1") == "Start here"
            assert host.evaluate("location.hash") == "#/guide/start-here"
            n = host.evaluate("document.querySelectorAll('#gd-list .gd-item').length"); assert n == len(pages), n
            # reading layout: ~65ch column, line-height 1.6
            lh, fs, w = host.evaluate("(() => { const s = getComputedStyle(document.querySelector('#gd-page')); return [parseFloat(s.lineHeight), parseFloat(s.fontSize), document.querySelector('#gd-page').getBoundingClientRect().width]; })()")
            assert abs(lh / fs - 1.6) < 0.02, (lh, fs)
            assert w < 760, w
            # navigate: click a page in the list, then Next
            host.click("#gd-list [data-gd=phones]"); host.wait_for_function("document.querySelector('#gd-page h1').textContent === 'Phones'")
            assert host.evaluate("document.querySelector('#gd-list .gd-item.on').dataset.gd") == "phones"
            host.click("#gd-page .gd-pn.next"); host.wait_for_function("document.querySelector('#gd-page h1').textContent.startsWith('Hosting')")
            # search over titles and text
            host.fill("#gd-q", "tailscale")
            host.wait_for_function("document.querySelector('#gd-list .gd-eye').textContent.includes('match')")
            hits = host.evaluate("[...document.querySelectorAll('#gd-list .gd-item')].map(a => a.dataset.gd)")
            assert "hosting" in hits and "start-here" not in hits, hits
            assert host.evaluate("!!document.querySelector('#gd-list mark')"), "search highlights the word"
            host.fill("#gd-q", "zzqxnothing"); host.wait_for_function("document.querySelector('#gd-list .gd-empty')")
            host.fill("#gd-q", ""); host.wait_for_function("!document.querySelector('#gd-list .gd-empty') && document.querySelectorAll('#gd-list .gd-item').length > 5")
            if "--shots" in sys.argv: host.screenshot(path=str(ROOT / "docs" / "screenshots" / "guide.png"))
            host.keyboard.press("Escape"); host.wait_for_selector("#guide.hidden", state="attached")
            assert not host.evaluate("document.body.classList.contains('gd-open')")

            # 4) Ctrl K -> Guide
            host.keyboard.press("Control+k"); host.wait_for_selector("#palette:not(.hidden)")
            host.fill("#pal-input", "guide")
            host.wait_for_function("[...document.querySelectorAll('#pal-list .pal-item .l')].some(l => l.textContent === 'Guide')")
            host.keyboard.press("Enter")
            host.wait_for_selector("#guide:not(.hidden) #gd-page h1", timeout=10000)
            host.click("#gd-close"); host.wait_for_selector("#guide.hidden", state="attached")

            # 5) Settings -> "? Guide"; deep link #/guide/<slug>
            host.evaluate("TribeSettings.open()"); host.wait_for_selector("#set-guide")
            host.click("#set-guide"); host.wait_for_selector("#guide:not(.hidden)")
            assert host.evaluate("document.querySelector('#settings-modal').classList.contains('hidden')")
            host.click("#gd-close")
            host.evaluate("location.hash = '#/guide/troubleshooting'")
            host.wait_for_function("document.querySelector('#guide:not(.hidden) #gd-page h1') && document.querySelector('#gd-page h1').textContent === 'Troubleshooting'")
            host.click("#gd-close")

            # 6) phone at 390px: list first, tap a page, Back to the list, no sideways scroll
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
            ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, server: {{url: '{BASE}', token: '{tok}'}}}}))")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            if ph.query_selector("#ins-later") and ph.is_visible("#ins-later"): ph.click("#ins-later")
            # on phones the avatar opens the profile sheet; the Guide is a quiet link under its actions
            ph.wait_for_selector("#pf-btn", state="visible", timeout=10000); ph.click("#pf-btn")
            ph.wait_for_selector("#m2-profile [data-pf=guide]", timeout=10000); ph.click("#m2-profile [data-pf=guide]")
            ph.wait_for_selector("#guide:not(.hidden) .gd-item")
            assert ph.is_visible("#gd-list") and not ph.is_visible("#gd-read"), "phones start on the list"
            ph.fill("#gd-q", "home screen"); ph.wait_for_function("[...document.querySelectorAll('#gd-list .gd-item')].some(a => a.dataset.gd === 'phones')")
            ph.click("#gd-list [data-gd=phones]")
            ph.wait_for_function("getComputedStyle(document.querySelector('#gd-read')).display !== 'none'")
            assert not ph.is_visible("#gd-list")
            assert ph.text_content("#gd-page h1") == "Phones"
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#gd-read').scrollWidth, document.querySelector('#gd-read').clientWidth]")
            assert sw[0] <= 390 and sw[1] <= sw[2] + 1, sw
            box = ph.evaluate("(() => { const r = document.querySelector('#guide').getBoundingClientRect(); return [r.left, r.width]; })()")
            assert box[0] == 0 and box[1] <= 390, box
            if "--shots" in sys.argv: ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "guide-phone.png"))
            ph.click("#gd-back"); ph.wait_for_function("getComputedStyle(document.querySelector('#gd-list')).display !== 'none'")
            assert ph.evaluate("!document.querySelector('#guide').classList.contains('hidden')"), "Back returns to the list"
            ph.click("#gd-back"); ph.wait_for_selector("#guide.hidden", state="attached")
            b.close()
        assert not errors, errors
        print("e2e_guide: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
