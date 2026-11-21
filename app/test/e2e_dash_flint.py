"""Flint's dashboard card and the Design picker (p10).
Design picker: every kind has its own drawn icon (no two the same, none the shared paperclip), a tint and a tiny
drawing; a project started as a phone app lists the app kinds first; each kind opens its own flow.
Dashboard: the preview, then Flint's card with "Do this next" (a suggestion that adds a task) and "Living updates"
(which change when a friend arrives), with the one next step inside the card and no repeated next blocks; 390px.
Usage: python app/test/e2e_dash_flint.py [--shots DIR]"""
import os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-dashfl-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeProjects && TribeClient.connected()", timeout=20000)
            # a project from a sentence (lands on the first preview), then back to the dashboard
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
            pg.fill("#np-idea", "A habit tracker app for my running club with streaks and a weekly leaderboard"); pg.click("#np-idea-go")
            pg.wait_for_timeout(6000); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#fd", timeout=15000); pg.wait_for_timeout(1200)
            # order: the preview, then Flint's card; the next step sits inside the card
            order = pg.evaluate("(() => { const a = document.querySelector('#pj-band-slot'), f = document.querySelector('#fd'); return a && f && (a.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) ? 1 : 0; })()")
            assert order == 1, "Flint's card comes right after the preview"
            assert pg.locator("#fd #pj-check").count() == 1 and pg.locator("#pj-check").count() == 1, "the one next step is inside the card, once"
            assert not pg.locator("#pj-reco-slot").is_visible() and not pg.locator("#pj-suggest-slot").is_visible(), "no scattered next blocks"
            sugs = pg.locator("#fd .fd-sug").count(); assert 1 <= sugs <= 3, sugs
            # a vision feature suggestion adds a task
            feat = pg.locator("#fd .fd-sug[data-fd^='feat:'] .fd-go").first
            assert feat.count() == 1, pg.inner_text("#fd")[:300]
            feat.click(); pg.wait_for_function("TribeClient.api('/tasks').then(r => r.tasks.length > 0)", timeout=8000)
            # dismiss is remembered
            first = pg.locator("#fd .fd-sug").first; fid = first.get_attribute("data-fd")
            if fid: pg.click(f"#fd [data-fd-x='{fid}']"); pg.evaluate("TribeProjects.overview()"); pg.wait_for_timeout(1200); assert pg.locator(f"#fd .fd-sug[data-fd='{fid}']").count() == 0, "dismissed stays dismissed"
            # living updates change when a friend arrives in this project
            before = pg.inner_text("#fd-ups")
            pid = pg.evaluate("TribeClient.project()")
            code = pg.evaluate("TribeClient.api('/invites', { method: 'POST', body: { maxUses: 5 } }).then(r => r.invite.code)")
            ctx2 = b.new_context(viewport={"width": 1200, "height": 800}); f = ctx2.new_page()
            f.goto(f"{BASE}/join/{code}"); f.wait_for_selector("#form:not(.hidden)", timeout=15000); f.fill("#name", "Ana"); f.click("#go")
            f.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            f.evaluate(f"TribeClient.switchProject('{pid}')")
            pg.wait_for_function("document.querySelector('#fd-ups') && /Ana/.test(document.querySelector('#fd-ups').textContent)", timeout=15000)
            print("ok  living updates: a friend arriving shows up")
            if SHOTS: pg.screenshot(path=f"{SHOTS}/dash-1440.png")
            # the Design picker
            pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_selector(".dfl-kind", timeout=10000); pg.wait_for_timeout(500)
            info = pg.evaluate("""[...document.querySelectorAll('.dfl-kind')].map(k => ({ id: k.dataset.kind, ic: k.querySelector('.dfl-ki svg') ? k.querySelector('.dfl-ki svg').innerHTML.replace(/\\s+/g, ' ') : '', mini: !!k.querySelector('.dfl-mini svg'), tint: k.style.getPropertyValue('--k'), likely: k.classList.contains('likely') }))""")
            ics = [x["ic"] for x in info]
            assert all(ics) and len(set(ics)) == len(ics), [x["id"] for x in info]
            assert all(x["mini"] and x["tint"] for x in info), "each kind has a tint and a tiny drawing"
            assert info[0]["id"] == "app" and info[0]["likely"], [x["id"] for x in info][:3]
            if SHOTS: pg.screenshot(path=f"{SHOTS}/design-1440.png")
            # each kind opens its own flow (no dead end): the gallery step appears with that kind
            for k in [x["id"] for x in info]:
                pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_selector(f".dfl-kind[data-kind='{k}']", timeout=8000)
                pg.click(f".dfl-kind[data-kind='{k}']"); pg.wait_for_timeout(700)
                moved = pg.evaluate("(() => { const d = document.querySelector('#dfl'); return !d || d.dataset.step !== 'kinds' || !!document.querySelector('.ui-sheet, #wdz, #apc, .mos, .fl-box'); })()")
                assert moved, f"{k}: picking it went somewhere"
                pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            print("ok  Design picker: distinct icons, tints and drawings, app kinds first, every kind opens its flow")
            # 390px
            pg.set_viewport_size({"width": 390, "height": 844}); pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#fd", timeout=10000); pg.wait_for_timeout(800)
            sw = pg.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
            if SHOTS: pg.screenshot(path=f"{SHOTS}/dash-390.png", full_page=True)
            pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_selector(".dfl-kind", timeout=8000)
            sw = pg.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
            if SHOTS: pg.screenshot(path=f"{SHOTS}/design-390.png")
            b.close()
        assert not errors, errors
        print("e2e_dash_flint: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
