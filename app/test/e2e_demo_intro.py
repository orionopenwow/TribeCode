"""The intro before "See how TribeCode works" (app/ui/demointro.js): full-screen slides before Flint's step 1. NO tribe
server: the Pages layout on a static file server, like e2e_demo_watch.py.

Checks: a fresh ?demo=watch opens the five slides BEFORE step 1 (the tour isn't running yet); Next, Back, → ← Home End and
the dots move between slides (Back is off on the first, the last says "Start the tour"); the chapter map lists all 12
chapters and clicking one starts the tour at that chapter; Skip intro and Esc start at step 1; "Don't show the intro again"
is remembered and the next fresh start goes straight to step 1; an automated browser without the test flag gets no intro;
at 390px the slides are full-width swipeable cards (scroll-snap) with no horizontal page scroll. No console errors.
Usage: python app/test/e2e_demo_intro.py [--shots]   (--shots saves docs/screenshots/demo-intro-1.png, demo-intro-controls.png)
"""
import functools, http.server, json, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_showcase as ES

ROOT = Path(__file__).resolve().parents[2]
PORT = 5975 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
APP = BASE + "/app/"
ES.BASE = BASE
SHOTS = ROOT / "docs" / "screenshots"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
FORCE = "try { localStorage.setItem('tribecode.test.intro', '1') } catch (e) {}"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))


def state(pg): return pg.evaluate("TribeDemoWatch._test.state()")
def at(pg): return pg.evaluate("TribeDemoIntro.index()")


def fresh(pg, q="?demo=watch&speed=1"):
    pg.goto(APP + q)
    pg.wait_for_function("window.TribeDemoWatch && (TribeDemoIntro.isOpen() || TribeDemoWatch._test.state().running)", timeout=20000)


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

            # ---- an automated browser without the flag: no intro (the other demo tests rely on it) ----
            cx = b.new_context(viewport={"width": 1280, "height": 800}); cx.add_init_script(SEED); ES.route_external(cx, "ok", [])
            pg = cx.new_page(); watch(pg, "noflag", errors)
            fresh(pg)
            pg.wait_for_function("TribeDemoWatch._test.state().running", timeout=10000)
            assert pg.locator("#di").count() == 0 and state(pg)["id"] == "blank"
            cx.close()

            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED); ctx.add_init_script(FORCE); ES.route_external(ctx, "ok", [])
            pg = ctx.new_page(); watch(pg, "desktop", errors)

            # ---- the slides come before step 1 ----
            fresh(pg)
            pg.wait_for_selector("#di", state="visible")
            s = state(pg)
            assert not s["running"] and pg.locator("#dw-cap").count() == 0, s
            assert pg.locator("#di .di-slide").count() == 5 and at(pg) == 0
            assert pg.evaluate("TribeDemoWatch._test.log()[0].step") == "intro"
            assert pg.is_disabled("#di-back") and pg.inner_text("#di-next").startswith("Next")
            assert "2½ minutes" in pg.inner_text("#di-s0") and "Flint builds a whole project" in pg.inner_text("#di-h0")
            assert pg.locator("#di-s0 .di-story li").count() == 5
            assert pg.evaluate("document.activeElement.id") == "di-next"
            if shots: pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / "demo-intro-1.png"))

            # ---- Next / Back / keys / dots ----
            pg.click("#di-next"); pg.wait_for_function("TribeDemoIntro.index() === 1")
            legend = pg.inner_text("#di-s1 .di-legend")
            for word in ("Step counter", "Chapter dots", "Back and Next", "Auto-play", "Skip to end", "Exit"): assert word in legend, word
            assert pg.locator("#di-s1 .di-mock .di-n").count() == 6, "each control in the picture is numbered"
            if shots: pg.wait_for_timeout(450); pg.screenshot(path=str(SHOTS / "demo-intro-controls.png"))
            pg.keyboard.press("ArrowRight"); pg.wait_for_function("TribeDemoIntro.index() === 2")
            pg.keyboard.press("ArrowLeft"); pg.wait_for_function("TribeDemoIntro.index() === 1")
            pg.click("#di-back"); pg.wait_for_function("TribeDemoIntro.index() === 0")
            pg.click("#di-dots [data-di-go='3']"); pg.wait_for_function("TribeDemoIntro.index() === 3")
            assert pg.get_attribute("#di-dots [data-di-go='3']", "aria-current") == "step"
            assert "Nothing touches your real work" in pg.inner_text("#di-h3")
            pg.keyboard.press("End"); pg.wait_for_function("TribeDemoIntro.index() === 4")
            assert pg.inner_text("#di-next").startswith("Start the tour")
            pg.keyboard.press("Home"); pg.wait_for_function("TribeDemoIntro.index() === 0")
            assert not state(pg)["running"], "moving through the slides never starts the tour"

            # ---- the chapter map: 12 chapters, a click starts there ----
            pg.click("#di-dots [data-di-go='2']"); pg.wait_for_function("TribeDemoIntro.index() === 2")
            chs = pg.evaluate("[...document.querySelectorAll('#di-s2 [data-di-at]')].map(b => b.innerText)")
            assert len(chs) == 12 and "A blank slate" in chs[0] and "Your turn" in chs[11], chs
            assert pg.locator("#di-s2 [data-di-at] svg").count() == 12, "every chapter has an icon"
            pg.click("#di-s2 [data-di-at='5']")
            pg.wait_for_selector("#di", state="detached")
            pg.wait_for_function("TribeDemoWatch._test.state().running && TribeDemoWatch._test.state().id === 'tasks'", timeout=10000)
            pg.wait_for_selector("#dw-cap", state="visible")
            assert "Step 6 of 12" in pg.text_content("#dw-k")

            # ---- Skip intro, Esc ----
            fresh(pg); pg.wait_for_selector("#di", state="visible")
            pg.click("#di-skip"); pg.wait_for_selector("#di", state="detached")
            pg.wait_for_function("TribeDemoWatch._test.state().running && TribeDemoWatch._test.state().id === 'blank'", timeout=10000)
            fresh(pg); pg.wait_for_selector("#di", state="visible")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#di", state="detached")
            pg.wait_for_function("TribeDemoWatch._test.state().running", timeout=10000)
            assert state(pg)["id"] == "blank" and pg.locator("#dw-cap").count() == 1, "Esc skips the intro, it doesn't end the tour"
            # the last slide's Start the tour
            fresh(pg); pg.wait_for_selector("#di", state="visible")
            pg.keyboard.press("End"); pg.click("#di-next"); pg.wait_for_selector("#di", state="detached")
            pg.wait_for_function("TribeDemoWatch._test.state().running && TribeDemoWatch._test.state().id === 'blank'", timeout=10000)
            # Watch again (a reload of the tour) never shows the intro again
            pg.evaluate("TribeDemoWatch.skipToEnd()"); pg.wait_for_selector("#dw-again", state="visible", timeout=15000)
            pg.click("#dw-again"); pg.wait_for_load_state("load")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            assert pg.locator("#di").count() == 0

            # ---- Don't show the intro again ----
            fresh(pg); pg.wait_for_selector("#di", state="visible")
            pg.check("#di-never"); assert pg.evaluate("localStorage.getItem('tribecode.demo.intro')") == "off"
            pg.click("#di-skip"); pg.wait_for_selector("#di", state="detached")
            fresh(pg); pg.wait_for_function("TribeDemoWatch._test.state().running", timeout=10000)
            assert pg.locator("#di").count() == 0, "remembered"
            pg.evaluate("localStorage.removeItem('tribecode.demo.intro')")
            fresh(pg, "?demo=watch&speed=1&intro=0"); pg.wait_for_function("TribeDemoWatch._test.state().running", timeout=10000)
            assert pg.locator("#di").count() == 0, "?intro=0 skips it"
            pg.evaluate("TribeDemoWatch.exit()"); pg.wait_for_load_state("load")
            ctx.close()

            # ---- 390px: swipeable cards ----
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(SEED); ph.add_init_script(FORCE); ES.route_external(ph, "ok", [])
            pg = ph.new_page(); watch(pg, "phone", errors)
            fresh(pg); pg.wait_for_selector("#di", state="visible")
            m = pg.evaluate("""() => { const t = document.getElementById('di-track'), s = document.getElementById('di-s0');
              return { doc: document.documentElement.scrollWidth, track: t.clientWidth, slide: s.getBoundingClientRect().width, snap: getComputedStyle(t).scrollSnapType,
                foot: document.querySelector('.di-foot').getBoundingClientRect().bottom, h: innerHeight } }""")
            assert m["doc"] <= 390 and m["track"] == 390 and abs(m["slide"] - 390) < 1 and "x" in m["snap"] and m["foot"] <= m["h"] + 1, m
            # a swipe: the track scrolls by one card and the dots follow
            pg.evaluate("const t = document.getElementById('di-track'); t.scrollTo({ left: t.clientWidth, behavior: 'instant' })")
            pg.wait_for_function("TribeDemoIntro.index() === 1", timeout=3000)
            pg.click("#di-next"); pg.wait_for_function("TribeDemoIntro.index() === 2")
            cols = pg.evaluate("getComputedStyle(document.querySelector('.di-map')).gridTemplateColumns.split(' ').length")
            assert cols == 2, cols
            over = pg.evaluate("[...document.querySelectorAll('#di-s2 .di-ch')].filter(b => b.getBoundingClientRect().right > 391).length")
            assert over == 0, "no chapter runs off the screen"
            pg.click("#di-s2 [data-di-at='0']"); pg.wait_for_selector("#di", state="detached")
            pg.wait_for_function("TribeDemoWatch._test.state().running", timeout=10000)
            ph.close()
            b.close()
    finally:
        srv.shutdown()
    errors = [e for e in errors if "favicon" not in e]
    assert not errors, errors
    print("PASS e2e_demo_intro")


if __name__ == "__main__":
    main()
