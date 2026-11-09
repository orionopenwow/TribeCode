"""The demo tour (app/ui/director.js): a scripted ~3-minute walk through the showcase tribe that drives the real app
with ghost cursors. NO tribe server: the Pages layout (site/ at the root, app/ui under /app/) on a static file server,
like e2e_showcase_demo.py.

Checks: ?demo=showcase&tour=fast plays all 15 chapters in seconds and every chapter reached its screen and the real UI
reacted (the director's in-page checks: checklist ticks, vision saved, a file became a doc, your message and Claude's
answer, a task created and dragged to Review and Done, a hand-off taken, Flint answered, the game ran in the Preview,
co-editors' text and carets in a live doc, the website built, a vote passed and the milestone shipped, a widget added,
an approval from the phone frame), then the end card (Download, Watch again, Explore). The chapter bar: Pause stops
the clock, Play resumes, 2x, Skip, a chapter segment jumps there, "Try it yourself" stops the director and the
showcase's own script takes over; the Showcase pill's "Play the 3-minute tour"; Leave restores your settings;
?tour=off plays no tour; Watch again restarts it. Reduced motion: the whole tour runs with no click ripples. Phone 390:
the short cut (7 chapters, ~90 s) with no sideways scroll. No console errors.
Usage: python app/test/e2e_demo_tour.py [--shots]   (--shots saves docs/screenshots/demo-tour-*.png)
"""
import functools, http.server, json, os, shutil, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_showcase as ES   # the Pages layout and the mocked GitHub API (nothing leaves the test)

ROOT = Path(__file__).resolve().parents[2]
PORT = 5210 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
APP = BASE + "/app/"
ES.BASE = BASE
SHOTS = ROOT / "docs" / "screenshots"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
# sandboxed frames (the game, the website preview) have no storage: the seed must not throw there
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
DESKTOP = ["start", "vision", "friends", "context", "chat", "tasks", "agents", "flint", "preview", "docs", "website", "ship", "add", "phone", "end"]
PHONE = ["chat", "tasks", "agents", "preview", "docs", "ship", "end"]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
    page.on("console", lambda m: m.type == "warning" and m.text.startswith("demo tour:") and errors.append(f"{tag} {m.text}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))


def state(pg): return pg.evaluate("TribeDirector._test.state()")


def sideways(page, tag):
    sw, iw = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw + 1, f"{tag}: sideways scroll ({sw} > {iw})"


def play_fast(pg, tag, expect, timeout=90, side=False):
    """Run the whole tour at tour=fast, return the log; every scene reached, every check ok."""
    pg.wait_for_function("window.TribeDirector && TribeDirector._test.state().running", timeout=20000)
    assert state(pg)["scenes"] == expect, state(pg)["scenes"]
    t0 = time.time()
    while not state(pg)["done"]:
        assert time.time() - t0 < timeout, f"{tag}: the tour did not finish in {timeout} s: {state(pg)}"
        if side: sideways(pg, f"{tag} {state(pg)['id']}")
        time.sleep(0.3)
    log = pg.evaluate("TribeDirector._test.log()")
    reached = [e["scene"] for e in log if e["name"] == "reached"]
    assert reached == expect, f"{tag}: chapters reached {reached}"
    bad = [e for e in log if not e["ok"]]
    assert not bad, f"{tag}: failed checks {bad}"
    for s in expect:   # each chapter checked that the real UI reacted
        assert any(e["scene"] == s and e["name"] != "reached" for e in log), f"{tag}: no check in chapter {s}"
    pg.wait_for_selector("#dt-end", state="visible", timeout=3000)
    print(f"  {tag}: {len(expect)} chapters in {time.time() - t0:.1f} s, {len([e for e in log if e['name'] != 'reached'])} checks ok")
    return log


def main():
    errors = []
    root = ES.assemble()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(root)))
    srv.handle_error = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    shots = "--shots" in sys.argv
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- desktop: the whole tour, fast ----
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED); ES.route_external(ctx, "ok", [])
            pg = ctx.new_page(); watch(pg, "desktop", errors)
            pg.goto(APP + "?demo=showcase&tour=fast")
            play_fast(pg, "desktop", DESKTOP)
            assert "tour=" not in pg.evaluate("location.search")
            assert pg.locator("#dt-download").get_attribute("href").endswith("/releases/latest")
            for sel in ["#dt-again", "#dt-explore", "#dt-browser"]: assert pg.locator(sel).is_visible(), sel
            st = pg.evaluate("TribeClient.state()"); assert st["tribe"]["name"] == "Campfire Crew"
            # the tour's work is real data in the demo backend
            assert pg.evaluate("TribeOffline.state().projects.some(p => p.id === 'firefly-garden')")
            assert pg.evaluate("TribeOffline.state().milestones['lantern-run'].some(m => m.version === 'v0.2' && m.status === 'released')")
            assert pg.evaluate("(TribeOffline.state().widgets['lantern-run'] || []).length >= 1")
            if shots: pg.screenshot(path=str(SHOTS / "demo-tour-end.png"))
            # Watch again: a fresh tribe, the tour plays again
            pg.click("#dt-again")
            pg.wait_for_function("window.TribeDirector && TribeDirector._test.state().running", timeout=20000)
            assert pg.evaluate("!TribeOffline.state().projects.some(p => p.id === 'firefly-garden') || TribeDirector._test.state().idx > 0")
            pg.evaluate("TribeDirector.stop()")
            assert pg.locator("#dt-bar").count() == 0

            # ---- the chapter bar at normal speed ----
            # Flint introduces each chapter: he rings the place it's about and waits for you (or about a reading's worth)
            # v0.22: three slides first, then Flint shows and tells with a spotlight; nothing to click
            pg.evaluate("TribeDirector.start()")
            pg.wait_for_selector("#dt-intro", timeout=5000)
            assert "1 of 3" in pg.text_content("#dt-intro") and "what you will see" in pg.text_content("#dt-intro").lower()
            pg.click("#dt-in-skip")
            pg.wait_for_selector("#dt-say.in", timeout=8000)
            assert "1/15" in pg.text_content("#dt-say") and pg.locator("#dt-spot").count() == 1
            pg.wait_for_function("TribeDirector._test.state().elapsed > 0", timeout=20000)   # it moves on by itself
            pg.evaluate("TribeDirector.stop()")
            pg.evaluate("TribeDirector.start({ narrate: false })")
            pg.wait_for_selector("#dt-bar", state="visible")
            for sel in ["#dt-play", "#dt-skip", "#dt-speed", "#dt-try", "#dt-leave", "#dt-chaps [data-i='14']", "#dt-cap"]: assert pg.locator(sel).count() == 1, sel
            assert "/ 4:" in pg.text_content("#dt-time"), pg.text_content("#dt-time")   # a calm pace: a little over four minutes
            time.sleep(1.2)
            if shots: time.sleep(2); pg.screenshot(path=str(SHOTS / "demo-tour-desktop.png"))
            pg.click("#dt-play"); assert state(pg)["paused"]
            e0 = state(pg)["elapsed"]; time.sleep(1.0); assert state(pg)["elapsed"] == e0, "paused: the clock stops"
            assert pg.locator("#dt-bar.paused").count() == 1 and pg.get_attribute("#dt-play", "aria-label") == "Play"
            pg.click("#dt-play"); assert not state(pg)["paused"]
            time.sleep(0.6); assert state(pg)["elapsed"] > e0
            pg.click("#dt-speed"); assert state(pg)["speed"] == 2
            assert pg.get_attribute("#dt-speed", "aria-pressed") == "true"
            pg.click("#dt-speed"); assert state(pg)["speed"] == 1
            i0 = state(pg)["idx"]; pg.click("#dt-skip")
            pg.wait_for_function(f"TribeDirector._test.state().idx === {i0 + 1}", timeout=5000)
            pg.click("#dt-chaps [data-i='4']")
            pg.wait_for_function("TribeDirector._test.state().id === 'chat'", timeout=5000)
            pg.wait_for_function("document.body.dataset.view === 'chat'", timeout=8000)
            pg.wait_for_selector(".dt-cur[data-who='me']", state="attached", timeout=8000)   # a ghost cursor with a name
            assert pg.text_content(".dt-cur[data-who='me'] .dt-name") == "Orion"
            pg.wait_for_function("document.querySelector('#dt-cap').textContent.includes('Messages')", timeout=5000)
            # clicking into the app yourself pauses the tour
            pg.mouse.click(700, 300); assert state(pg)["paused"]
            pg.click("#dt-play")
            # Try it yourself: the director stops, the showcase's own script takes over
            s0 = pg.evaluate("TribeShowcase._test.info().step")
            pg.click("#dt-try")
            assert not state(pg)["running"] and pg.locator("#dt-bar").count() == 0 and pg.locator(".dt-cur").count() == 0
            pg.wait_for_function(f"TribeShowcase._test.info().step > {s0}", timeout=15000)
            # the pill offers the tour again
            pg.click("#demo-pill"); pg.wait_for_selector("#sc-tour", state="visible")
            pg.click("#sc-tour"); pg.wait_for_function("TribeDirector._test.state().running", timeout=5000)
            # Leave restores your settings
            pg.click("#dt-leave")
            pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server") == REAL["server"]
            # ?tour=off: the showcase without the tour
            pg.goto(APP + "?demo=showcase&tour=off")
            pg.wait_for_function("window.TribeOffline && TribeOffline.mode() === 'showcase' && TribeClient.connected()", timeout=15000)
            time.sleep(2); assert pg.locator("#dt-bar").count() == 0 and not state(pg)["running"]
            pg.evaluate("TribeOffline.leave()"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            ctx.close()

            # ---- reduced motion: cuts, no ripples ----
            ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); ctx.add_init_script(SEED); ES.route_external(ctx, "ok", [])
            ctx.add_init_script("if (window === top) { window.__ripples = 0; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains('dt-ripple')) window.__ripples++; }))).observe(document, { childList: true, subtree: true }); }")
            rm = ctx.new_page(); watch(rm, "reduced", errors)
            rm.goto(APP + "?demo=showcase&tour=fast")
            play_fast(rm, "reduced motion", DESKTOP, timeout=120)
            assert rm.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
            assert rm.evaluate("window.__ripples") == 0, "reduced motion: no click ripples"
            rm.evaluate("TribeOffline.leave()"); rm.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            ctx.close()

            # ---- phone 390: the short cut ----
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); ctx.add_init_script(SEED); ES.route_external(ctx, "ok", [])
            ph = ctx.new_page(); watch(ph, "phone", errors)
            ph.goto(APP + "?demo=showcase&tour=fast")
            play_fast(ph, "phone", PHONE, side=True)
            box = ph.locator("#dt-bar").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 391, box
            sideways(ph, "phone end")
            if shots: ph.screenshot(path=str(SHOTS / "demo-tour-phone-end.png"))
            ph.evaluate("TribeDirector.start({ watch: true, noIntro: true })"); ph.wait_for_selector("#dt-bar", state="visible")
            assert "/ 2:0" in ph.text_content("#dt-time"), ph.text_content("#dt-time")   # the calm phone cut: about two minutes
            ph.tap("#dt-skip"); ph.wait_for_function("TribeDirector._test.state().id === 'tasks'", timeout=5000)
            sideways(ph, "phone tour")
            if shots: time.sleep(3); ph.screenshot(path=str(SHOTS / "demo-tour-phone.png"))
            ph.tap("#dt-try"); assert not state(ph)["running"]
            ph.evaluate("TribeOffline.leave()"); ph.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            ctx.close()
            b.close()
    finally:
        srv.shutdown(); shutil.rmtree(root, ignore_errors=True)
    # Outside the demo this static page has no tribe server: the app's sign-in probe (GET /api/health) gets a 404.
    probes = [e for e in errors if " http 404: " in e and e.endswith("/api/health")]
    noise = [e for e in errors if e not in probes and "favicon" not in e]
    for tag in ("desktop", "reduced", "phone"):
        n = sum(1 for e in probes if e.startswith(tag))
        for e in [e for e in noise if e.startswith(tag + " console: Failed to load resource") and "404" in e][:n]: noise.remove(e)
    assert not noise, "\n".join(noise[:20])
    print("e2e_demo_tour: OK")


if __name__ == "__main__":
    main()
