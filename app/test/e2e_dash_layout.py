"""The project dashboard's layout (feat/dash-layout).
1. A new project asks what you're making ONCE: the line under the name (the preview's "Say what you're making" opens
   that same line); Flint's steps skip the vision while the line asks for it, and the step counter stays truthful.
   After a first version the next step is "Change one thing", then "Show a friend", not "Add a first task".
2. Preview and Flint's card side by side on wide screens (equal tops, both visible), stacked at 1100 and 390, with the
   right panel open and closed.
3. Add files is one slim row under Flint's card that opens into the drop area on click and when a file is dragged in.
4. No "Your helpers" card in the right panel beside Flint's steps.
5. "Share link" with nothing to share opens Publish instead of a dead-end toast.
6. A website's suggested tasks are website tasks (no "order").
Usage: python app/test/e2e_dash_layout.py   (screenshots: /tmp/dash-layout-1440.png, -1440-busy.png, -390.png)"""
import os, re, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5640 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
BOX = "(q => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, vis: !!(r.width && r.height) }; })"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-dashlay-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            box = lambda q: pg.evaluate(f"{BOX}('{q}')")
            def dash():
                pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#fd", timeout=15000); pg.wait_for_selector("#pj-band-slot .db-band", timeout=15000); pg.wait_for_timeout(900)
            def layout(w, side, label):
                pg.set_viewport_size({"width": w, "height": 900}); pg.wait_for_timeout(500)
                a, f = box("#pj-band-slot"), box("#fd")
                if side:
                    assert abs(a["y"] - f["y"]) < 2 and f["x"] > a["x"] + a["w"] - 1, f"{label}: side by side with equal tops {a} {f}"
                    assert 0.5 < a["w"] / (a["w"] + f["w"]) < 0.7, f"{label}: the preview is about 60% ({a['w']} / {f['w']})"
                    assert a["b"] <= 900 and f["b"] <= 900, f"{label}: both visible without scrolling {a} {f}"
                else:
                    assert f["y"] >= a["b"] - 1, f"{label}: stacked {a} {f}"
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeProjects && TribeClient.connected() && TribeClient.project()", timeout=20000)
            dash()

            # 1. one ask for the vision
            assert "Add what you" in pg.inner_text("#pj-bio"), pg.inner_text("#pj-bio")
            fd = pg.inner_text("#fd")
            assert not re.search(r"Say what you|Write it|line of vision", fd), "Flint's card does not ask for the vision: " + fd
            assert "Add a first task" in fd and "1 of 4" in fd, fd
            pg.click("#pj-check-all"); pg.wait_for_selector("#pj-steps", timeout=5000)
            steps = pg.locator("#pj-steps .ock-row[data-step]").all_inner_texts()
            assert not any("Say what you" in s for s in steps) and "0 of 4 done" in pg.inner_text("#pj-steps").lower(), steps
            pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
            asks = pg.evaluate("[...document.querySelectorAll('#pj-overview button, #pj-overview a')].filter(e => e.getClientRects().length && /Add what you|Say what you|Write it/.test(e.textContent)).map(e => e.id || e.dataset.db || e.textContent.trim())")
            assert len(asks) <= 2 and "pj-bio" in asks, asks
            say = pg.locator("#pj-band-slot [data-db='say']")
            if say.count():   # the preview's button is the same action: it opens the line under the name
                say.click(); pg.wait_for_selector("#pj-vis-in", timeout=5000); pg.click("#pj-vis-x"); pg.wait_for_timeout(500)
            print("ok  one ask for the vision, a truthful step counter")

            # 4. no helpers card beside Flint's steps
            assert pg.locator("#helper-setup").count() == 0 and "Your helpers" not in pg.inner_text("body"), "no Your helpers card"
            print("ok  no Your helpers card; the right panel is Flint's chat")

            # 3. Add files: slim, opens on click and on drag
            c = box("#pj-context"); f = box("#fd")
            assert c["h"] <= 56 and c["y"] >= f["b"] - 1 and abs(c["x"] - f["x"]) < 2, f"one slim row under Flint's card {c} {f}"
            assert not box("#pj-context #dropzone")["vis"], "the drop area waits"
            pg.click("#pj-files-btn"); pg.wait_for_timeout(200)
            assert box("#pj-context #dropzone")["vis"] and pg.get_attribute("#pj-files-btn", "aria-expanded") == "true", "click opens it"
            pg.click("#pj-files-btn"); pg.wait_for_timeout(200); assert not box("#pj-context #dropzone")["vis"], "click closes it"
            pg.evaluate("(() => { const dt = new DataTransfer(); dt.items.add(new File(['hi'], 'notes.txt', { type: 'text/plain' })); document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true })); document.body.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true })); })()")
            pg.wait_for_timeout(500); assert box("#pj-context #dropzone")["vis"], "dragging a file over the page opens it"
            pg.keyboard.press("Escape"); pg.click("#pj-files-btn"); pg.wait_for_timeout(300)
            print("ok  Add files is one slim row; opens on click and on drag")

            # 2. side by side on wide screens, stacked below, right panel open and closed
            layout(1440, True, "1440 panel open"); pg.screenshot(path="/tmp/dash-layout-1440.png")
            pg.evaluate("document.body.classList.add('panel-off')"); layout(1440, True, "1440 panel closed")
            layout(1100, False, "1100 panel closed"); pg.evaluate("document.body.classList.remove('panel-off')"); layout(1100, False, "1100 panel open")
            pg.set_viewport_size({"width": 1440, "height": 900}); pg.wait_for_timeout(400)
            print("ok  side by side at 1440 (panel open and closed), stacked at 1100")

            # a first version: a bakery website from one sentence
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
            pg.fill("#np-idea", "A website for my bakery with fresh bread and cakes"); pg.click("#np-idea-go")
            pg.wait_for_timeout(7000); pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
            dash(); pg.wait_for_function("document.querySelector('#fd') && /Change one thing/.test(document.querySelector('#fd').textContent)", timeout=15000)
            fd = pg.inner_text("#fd"); assert "2 of 5" in fd and "Add a first task" not in fd, fd

            # 6. a website's tasks are website tasks
            fm = pg.evaluate("TribeFirstMake.tasks(TribeFirstMake.brief('A website for my bakery with fresh bread and cakes'), 'site')")
            sv = pg.evaluate("TribeClient.api('/assist/tasks').then(r => r.suggestions.map(x => x.title))")
            for lst in (fm, sv):
                assert not any(re.search(r"\border", t, re.I) for t in lst), lst
            assert any("headline" in t.lower() for t in fm) and any("headline" in t.lower() for t in sv), (fm, sv)
            assert not re.search(r"\border", pg.inner_text("#pj-overview"), re.I), "no orders anywhere on the dashboard"
            print("ok  website tasks:", " / ".join(fm))

            # 5. Share link with nothing to share opens Publish
            pg.route(re.compile(r".*/api/projects/[^/]+/website.*"), lambda r: r.fulfill(status=200, content_type="application/json", body='{"website":{}}'))
            pg.click("#pj-band-slot [data-db='share']"); pg.wait_for_selector("#pb-body", timeout=8000)
            assert "Nothing to share yet" not in pg.inner_text("body")
            pg.unroute(re.compile(r".*/api/projects/[^/]+/website.*")); pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
            if pg.locator("#pb-body").count(): pg.evaluate("document.querySelector('#pb-body').closest('.modal, .ui-sheet, [role=dialog]')?.querySelector('[data-close]')?.click()"); pg.wait_for_timeout(300)
            print("ok  Share link with nothing to share opens Publish")

            # after Change one thing: Show a friend
            pg.click("#fd [data-ck='change']"); pg.wait_for_timeout(2500); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
            dash(); pg.wait_for_function("/Show a friend/.test(document.querySelector('#fd').textContent)", timeout=10000)
            assert "3 of 5" in pg.inner_text("#fd"), pg.inner_text("#fd")
            print("ok  after a first version: Change one thing, then Show a friend")

            # busy: a done task and a message
            pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Write your own headline', status: 'done' } })")
            pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Swap in your own pictures', status: 'doing' } })")
            pg.evaluate("TribeProjects.overview()"); pg.wait_for_timeout(2000); layout(1440, True, "1440 busy")
            pg.screenshot(path="/tmp/dash-layout-1440-busy.png")

            # phones
            pg.set_viewport_size({"width": 390, "height": 844}); dash(); layout(390, False, "390")
            assert pg.evaluate("document.documentElement.scrollWidth") <= 390
            assert box("#pj-files-btn")["h"] >= 40, "a 40px target"
            pg.screenshot(path="/tmp/dash-layout-390.png")
            print("ok  390: stacked, fits, 40px Add files row")
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("e2e_dash_layout: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
