"""See how TribeCode works (app/ui/demowatch.js): the hands-off tour with Flint. NO tribe server: the Pages layout (site/
at the root, app/ui under /app/) on a static file server, like e2e_demo_tour.py.

Checks: the website's "See how TribeCode works" link opens app/?demo=watch; the FIRST FRAME is a blank slate (the empty
dashboard: "Make your first project", no project circles in the rail, no tribe, no projects in the demo state, none of
your own name); at ?speed=4 the tour runs all 12 chapters end to end headless, every chapter's targets were found by the
watchdog (no skips), and Flint made everything from nothing in the real app (the tribe and Ember Café through the real
Start a project sheet, the vision typed and saved, Maya joined and chatted, a task Maya accepted, a design, the café site
in dark mode, an approval approved, a company made), and it ends on the "Your turn" card with no dim left. Esc mid-way
removes every overlay (dim, ring, cursors, caption, Flint's cards). The chapter dots jump to a chapter (and from the end
card back into the tour). Pause stops the clock, 1x/2x, Skip to end lands on Your turn. Help › "See how TribeCode works"
and the empty Home's "Tour with Flint" start it. Exit puts your own settings back exactly. No console errors.
Usage: python app/test/e2e_demo_watch.py [--shots]   (--shots saves docs/screenshots/demo-blank-start.png, demo-blank-mid.png, demo-watch-end.png)
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
STEPS = ["blank", "tribe", "project", "vision", "friend", "tasks", "make", "site", "preview", "approve", "company", "end"]
NO_DIM = "!document.querySelector('#dw-dim.on, #dw-ring.on, .dw-cur, #dw-cap, #dw-pin, #dw-huddle, #dw-boost, #dt-spot:not(.wide), .fg-root.on')"


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
            assert pg.locator(".hero a:has-text('See how TribeCode works')").get_attribute("href") == "app/?demo=watch"

            # ---- the first frame: a blank slate ----
            pg.goto(APP + "?demo=watch&speed=1")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            pg.wait_for_selector("#hub-hero.hub-empty", state="visible", timeout=10000)
            first = pg.evaluate("""() => ({ projects: TribeOffline.state().projects.length, blank: !!TribeOffline.state().blank, tribe: TribeOffline.state().tribe.name,
              circles: document.querySelectorAll('#pj-rail [data-pj-open]').length, connected: TribeClient.connected(), id: TribeDemoWatch._test.state().id,
              title: (document.querySelector('#hub-hero h2') || {}).textContent, text: document.body.innerText })""")
            assert first["id"] == "blank" and first["projects"] == 0 and first["blank"] and not first["tribe"] and first["circles"] == 0 and not first["connected"], {k: v for k, v in first.items() if k != "text"}
            assert first["title"] == "Make your first project", first["title"]
            assert REAL["name"] not in first["text"], "your own name shows inside the demo"
            if shots: time.sleep(1.2); pg.screenshot(path=str(SHOTS / "demo-blank-start.png"))
            pg.evaluate("TribeDemoWatch.stop()")

            # ---- the whole thing at 4x, end to end ----
            pg.goto(APP + "?demo=watch&speed=4")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            assert "demo=" not in pg.evaluate("location.search")
            assert state(pg)["steps"] == STEPS, state(pg)["steps"]
            assert pg.locator("#demo-pill.wt").count() == 1 and "See how TribeCode works" in pg.text_content("#demo-pill")
            t0 = time.time(); shot1 = False
            while not state(pg)["finished"]:
                st = state(pg)
                assert time.time() - t0 < 120, f"the tour did not finish in 120 s: {st}"
                if shots and not shot1 and st["id"] == "friend":   # mid-way: Maya's reply in the chat Flint just made
                    pg.wait_for_function("TribeDemoWatch._test.log().some(e => e.target === 'Maya’s reply')", timeout=30000, polling=50)
                    time.sleep(0.4); pg.screenshot(path=str(SHOTS / "demo-blank-mid.png")); shot1 = True
                time.sleep(0.1)
            took = time.time() - t0
            log = pg.evaluate("TribeDemoWatch._test.log()")
            missed = [e for e in log if not e["found"]]
            assert not missed, f"targets not found: {missed}"
            for s in STEPS: assert any(e["step"] == s and e["target"] != "jump" for e in log), f"no target in chapter {s}"
            # the end: the Your turn card, no dim left
            pg.wait_for_selector("#dw-end .dw-end-card", state="visible", timeout=3000)
            assert "Your turn" in pg.text_content("#dw-end")
            for sel in ["#dw-start", "#dw-try", "#dw-again"]: assert pg.locator(sel).is_visible(), sel
            assert pg.evaluate("!document.querySelector('#dw-dim.on, #dw-ring.on, .dw-cur, #dw-pin')"), "dim left at the end"
            # everything was made from nothing, in the demo's own state
            d = pg.evaluate("TribeOffline.state()")
            assert not d.get("blank") and d["tribe"]["name"] == "Flint’s Workshop", d["tribe"]
            assert [p["id"] for p in d["projects"]] == ["demo_ember-cafe"], d["projects"]
            assert "café" in (d["vision"].get("demo_ember-cafe") or "").lower(), d["vision"]
            assert any(m["id"] == "maya" for m in d["members"]), "Maya joined"
            chat = d["chat"]["demo_ember-cafe"]
            assert any((m.get("reactions") or {}).get("🔥") == ["maya"] for m in chat), "Maya's reaction"
            assert any(m.get("by") == "maya" and m.get("replyTo") for m in chat), "Maya's reply"
            ts = {t["title"]: t for t in d["tasks"]["demo_ember-cafe"]}
            assert ts["Design the menu board"]["assignee"] == "maya" and ts["Design the menu board"]["accept"] == "accepted", ts
            assert any(a["status"] == "approved" for a in d["approvals"]), d["approvals"]
            assert (d.get("company") or {}).get("demo_ember-cafe"), "made it a company"
            assert pg.evaluate("localStorage.getItem('tribecode.setup.wherePending')") is None, "the start sheet left a real flag"
            print(f"  desktop: {len(STEPS)} chapters at 4x in {took:.1f} s, {len(log)} targets all found")
            if shots: time.sleep(0.5); pg.screenshot(path=str(SHOTS / "demo-watch-end.png"))

            # ---- the chapter dots: from the end card back into the tour, then to another chapter ----
            pg.click("#dw-dots [data-i='7']")
            pg.wait_for_function("TribeDemoWatch._test.state().id === 'site' && !TribeDemoWatch._test.state().finished", timeout=3000)
            assert pg.locator("#dw-end").count() == 0
            pg.wait_for_function("TribeDemoWatch._test.log().some(e => e.step === 'site' && e.target === 'the café template' && e.found)", timeout=15000)
            pg.click("#dw-dots [data-i='9']")
            pg.wait_for_function("TribeDemoWatch._test.log().some(e => e.step === 'approve' && e.target === 'the Approve button' && e.found)", timeout=15000)
            assert pg.evaluate("!document.querySelector('#wdz:not([hidden])')"), "the designer closed when the tour moved on"
            assert pg.locator("#dw-dots [data-i='9'][aria-current='step']").count() == 1
            pg.wait_for_selector("#dw-end .dw-end-card", state="visible", timeout=30000)
            assert not [e for e in pg.evaluate("TribeDemoWatch._test.log()") if not e["found"]]

            # ---- Esc mid-way: every overlay goes ----
            pg.click("#dw-again")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running && TribeDemoWatch._test.state().idx >= 3", timeout=60000)
            pg.wait_for_selector("#dw-ring.on", timeout=8000)
            pg.keyboard.press("Escape")
            pg.wait_for_function(NO_DIM, timeout=2000)
            assert not state(pg)["running"]
            assert pg.locator("#dw-ui, #dw-layer, #dw-end, #dw-pin").count() == 0

            # ---- the controls at 1x: pause, speed, skip to end ----
            pg.evaluate("TribeDemoWatch.start({ speed: 1 })")
            pg.wait_for_selector("#dw-play", timeout=5000)
            for sel in ["#dw-play", "#dw-speed", "#dw-skip", "#dw-exit", "#dw-dots [data-i='11']", "#dw-cap"]: assert pg.locator(sel).count() == 1, sel
            assert "/ 2:" in pg.text_content("#dw-time"), pg.text_content("#dw-time")   # about two minutes
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

            # ---- Help › See how TribeCode works ----
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
