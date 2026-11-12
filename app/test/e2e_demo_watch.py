"""Flint builds a game (app/ui/demowatch.js): the hands-off demo. NO tribe server: the Pages layout (site/ at the root,
app/ui under /app/) on a static file server, like e2e_demo_tour.py.

Checks: the website's "Watch a demo tribe" link opens app/?demo=watch; at ?speed=4 the auto-play runs all 14 steps end
to end headless, every step's target was found by the watchdog (no skips), the real app reacted (a project Lantern
Run, its vision, three assigned tasks, Maya's reaction on a chat message, the game in the Preview tuned, a firefly,
Maya's pin resolved, an approval approved, a website draft, the game played itself and lit lanterns, the proof ZIP),
and it ends on the "Your turn" card with no dim left. Esc mid-way removes every overlay (dim, ring, cursors, caption).
Pause stops the clock, 1x/2x, Skip to end lands on Your turn. Help › "Watch Flint build a game" and the empty Home's
"Tour with Flint" start it. Exit puts
your own settings back exactly. No console errors.
Usage: python app/test/e2e_demo_watch.py [--shots]   (--shots saves docs/screenshots/demo-watch-*.png)
"""
import functools, http.server, json, os, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_showcase as ES   # the Pages layout and the mocked GitHub API (nothing leaves the test)

ROOT = Path(__file__).resolve().parents[2]
PORT = 5230 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
APP = BASE + "/app/"
ES.BASE = BASE
SHOTS = ROOT / "docs" / "screenshots"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
STEPS = ["project", "vision", "tasks", "friend", "build", "tune", "sprite", "comment", "fix", "approve", "website", "play", "proof", "end"]
NO_DIM = "!document.querySelector('#dw-dim.on, #dw-ring.on, .dw-cur, #dw-cap, #dt-spot:not(.wide), .fg-root.on')"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
    page.on("console", lambda m: m.type == "warning" and m.text.startswith("demo watch:") and errors.append(f"{tag} {m.text}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))


def state(pg): return pg.evaluate("TribeDemoWatch._test.state()")


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
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED); ES.route_external(ctx, "ok", [])
            pg = ctx.new_page(); watch(pg, "desktop", errors)

            # ---- the website's demo link goes here ----
            pg.goto(BASE + "/index.html")
            assert pg.locator(".hero a:has-text('Watch a demo tribe')").get_attribute("href") == "app/?demo=watch"

            # ---- the whole thing at 4x, end to end ----
            pg.goto(APP + "?demo=watch&speed=4")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            assert "demo=" not in pg.evaluate("location.search")
            assert state(pg)["steps"] == STEPS, state(pg)["steps"]
            assert pg.locator("#demo-pill.wt").count() == 1 and "Flint builds a game" in pg.text_content("#demo-pill")
            t0 = time.time(); seen = set(); shot1 = shotg = False
            while not state(pg)["finished"]:
                st = state(pg); seen.add(st["id"])
                assert time.time() - t0 < 120, f"the demo did not finish in 120 s: {st}"
                if shots and not shot1 and st["id"] == "friend" and pg.locator(".dw-cur[data-who=maya]").count() and pg.locator("#dw-ring.on").count(): time.sleep(0.5); pg.screenshot(path=str(SHOTS / "demo-watch-1.png")); shot1 = True
                if shots and not shotg and st["id"] == "play" and st["lit"] >= 2: pg.screenshot(path=str(SHOTS / "demo-watch-game.png")); shotg = True
                time.sleep(0.15)
            took = time.time() - t0
            assert seen >= set(STEPS) - {"end"}, f"steps seen {seen}"
            log = pg.evaluate("TribeDemoWatch._test.log()")
            missed = [e for e in log if not e["found"]]
            assert not missed, f"targets not found: {missed}"
            for s in STEPS: assert any(e["step"] == s for e in log), f"no target in step {s}"
            # the end: the Your turn card, no dim left
            pg.wait_for_selector("#dw-end .dw-end-card", state="visible", timeout=3000)
            assert "Your turn" in pg.text_content("#dw-end")
            for sel in ["#dw-start", "#dw-try", "#dw-again"]: assert pg.locator(sel).is_visible(), sel
            assert pg.evaluate("!document.querySelector('#dw-dim.on, #dw-ring.on, .dw-cur')"), "dim left at the end"
            # the work is real data in the demo backend
            d = pg.evaluate("TribeOffline.state()")
            assert any(p["id"] == "lantern-run" for p in d["projects"])
            assert "Wick" in d["vision"]["lantern-run"]
            ts = d["tasks"]["lantern-run"]; assert len(ts) >= 3 and {t["assignee"] for t in ts} >= {"me", "maya", "claude"}, ts
            assert any((m.get("reactions") or {}).get("🔥") == ["maya"] for m in d["chat"]["lantern-run"]), "Maya's reaction"
            assert any(a["status"] == "approved" for a in d["approvals"]), d["approvals"]
            assert all(p["resolved"] for p in d["pins"]["lantern-run"]) and d["pins"]["lantern-run"]
            assert d["website"]["lantern-run"]["gen"]["type"] == "game"
            assert state(pg)["lit"] >= 1, f"the game played itself: {state(pg)['lit']} lanterns"
            assert pg.evaluate("TribeOffline._k.db().watch.built")
            print(f"  desktop: {len(STEPS)} steps at 4x in {took:.1f} s, {len(log)} targets all found, {state(pg)['lit']} lanterns lit")
            if shots: time.sleep(0.5); pg.screenshot(path=str(SHOTS / "demo-watch-end.png"))
            # the proof ZIP was built in the browser
            assert pg.locator("#dw-proof").count() == 0

            # ---- Esc mid-way: every overlay goes ----
            pg.click("#dw-again")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running && TribeDemoWatch._test.state().idx >= 2", timeout=30000)
            pg.wait_for_selector("#dw-ring.on", timeout=8000)
            pg.keyboard.press("Escape")
            pg.wait_for_function(NO_DIM, timeout=2000)
            assert not state(pg)["running"]
            assert pg.locator("#dw-ui, #dw-layer, #dw-end").count() == 0

            # ---- the controls at 1x: pause, speed, skip to end ----
            pg.evaluate("TribeDemoWatch.start({ speed: 1 })")
            pg.wait_for_selector("#dw-play", timeout=5000)
            for sel in ["#dw-play", "#dw-speed", "#dw-skip", "#dw-exit", "#dw-segs [data-i='13']", "#dw-cap"]: assert pg.locator(sel).count() == 1, sel
            assert "/ 1:" in pg.text_content("#dw-time"), pg.text_content("#dw-time")   # about 90 seconds
            time.sleep(1.0)
            pg.click("#dw-play"); assert state(pg)["paused"]
            c0 = state(pg)["clock"]; time.sleep(0.8); assert state(pg)["clock"] == c0, "paused: the clock stops"
            assert pg.evaluate("!document.querySelector('#dw-dim.on i') || getComputedStyle(document.querySelector('#dw-dim i')).opacity === '0'")
            pg.click("#dw-play"); assert not state(pg)["paused"]
            pg.click("#dw-speed"); assert state(pg)["speed"] == 2 and pg.text_content("#dw-speed") == "2×"
            pg.click("#dw-skip")
            pg.wait_for_selector("#dw-end .dw-end-card", state="visible", timeout=5000)
            pg.wait_for_function("TribeDemoWatch._test.state().finished", timeout=5000)
            assert pg.evaluate("!document.querySelector('#dw-dim.on, #dw-ring.on')")

            # ---- Exit: your own app, exactly as it was ----
            pg.click("#dw-exit")
            pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=15000)
            pg.wait_for_load_state("load")
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server") == REAL["server"]
            assert pg.evaluate("sessionStorage.getItem('tribecode.offlineDemo.v1') === null && localStorage.getItem('tribecode.offlineDemo.v1') === null")
            assert pg.locator("#demo-pill").count() == 0 and not pg.evaluate("document.body.classList.contains('offline-demo')")

            # ---- Help › Watch Flint build a game ----
            pg.wait_for_selector("#tb-help", state="visible", timeout=10000)
            pg.click("#tb-help"); pg.click("[data-help=watch]")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            assert pg.evaluate("TribeOffline.mode()") == "watch"
            pg.evaluate("TribeDemoWatch.exit()")
            pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=15000)
            # ---- the empty Home's "Tour with Flint" (no tribe yet) ----
            pg.wait_for_function("window.TribeHub", timeout=10000)
            if pg.evaluate("document.body.dataset.view") != "hub": pg.evaluate("TribeHub.open('home')")
            pg.wait_for_selector("#hub-tour", state="visible", timeout=10000)
            assert "Tour with Flint" in pg.text_content("#hub-tour")
            pg.click("#hub-tour")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            pg.evaluate("TribeDemoWatch.exit()")
            pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=15000)
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server") == REAL["server"]
            ctx.close(); b.close()
    finally:
        srv.shutdown()
    # Outside the demo this static page has no tribe server: the app's sign-in probe (GET /api/health) gets a 404.
    probes = [e for e in errors if " http 404: " in e and e.endswith("/api/health")]
    noise = [e for e in errors if e not in probes and "favicon" not in e]
    for _ in probes:   # each probe also logs one "Failed to load resource" line
        hit = [e for e in noise if "console: Failed to load resource" in e and "404" in e][:1]
        for e in hit: noise.remove(e)
    assert not noise, "\n".join(noise[:20])
    print("e2e_demo_watch: OK")


if __name__ == "__main__":
    main()
