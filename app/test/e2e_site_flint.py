"""Meet Flint page + the Features mega-menu (v0.27.1): flint.html loads without errors and fits phones; every page with
the top nav has a Flint link and the grouped mega-menu (icons, descriptions, spotlight on desktop, links back to the
homepage from other pages); the live try-it chat answers a click and updates the mini app; Spanish translates the menu.
Usage: python app/test/e2e_site_flint.py   (honours TRIBE_PORT_OFFSET)"""
import functools, http.server, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[2] / "site"
PAGES = ["index.html", "flint.html", "learn.html", "pricing.html", "mission.html", "docs.html"]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(SITE)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US")
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        for page in PAGES:
            pg.goto(f"{base}/{page}"); pg.wait_for_selector("#menu-features .mm__a", state="attached")
            assert pg.locator('.nav__links > a[href="flint.html"]').count() == 1, f"{page}: Flint link in the nav"
            items = pg.locator("#menu-features .mm__a").count(); assert items == 13, f"{page}: {items} menu items"
            assert pg.locator("#menu-features .mm__eb").count() == 4
            first = pg.get_attribute('#menu-features [data-mm="make"]', "href")
            assert first == ("#make" if page == "index.html" else "index.html#make"), f"{page}: {first}"
            pg.hover(".nav__drop"); pg.wait_for_selector("#menu-features:not([hidden])")
            pg.hover('[data-mm="company"]'); pg.wait_for_timeout(150)
            assert pg.text_content("#mm-t") == "Company mode" and pg.locator("#mm-view .sp-seats").count() == 1, f"{page}: spotlight follows hover"
            pg.keyboard.press("Escape"); pg.mouse.move(5, 600)
        # Meet Flint: no big try-it app (removed), the exhibits carry the story
        pg.goto(f"{base}/flint.html"); pg.wait_for_selector("[data-app=run] .mk-row")
        assert pg.text_content("h1").strip() == "Meet Flint" and pg.locator("[data-app=try]").count() == 0
        # sidebar rows are tabs: click and arrow keys switch the view, Flint says where it lives
        run = '[data-app=run]'
        pg.locator(run).scroll_into_view_if_needed(); pg.wait_for_timeout(400)
        pg.click(f'{run} .mk-row[data-row=tasks]')
        assert pg.locator(f'{run} .fv-cols').count() == 1 and pg.get_attribute(f'{run} .mk-row[data-row=tasks]', "aria-selected") == "true"
        pg.wait_for_function("document.querySelector('[data-app=run] .fa-fl__thread').textContent.includes('Task Board lives here')", timeout=4000)
        pg.focus(f'{run} .mk-row[data-row=tasks]'); pg.keyboard.press("ArrowDown")
        assert pg.locator(f'{run} .fv-wb').count() == 1, "arrow key opens the whiteboard"
        st = pg.locator(f'{run} .fv-sticky').first; bb = st.bounding_box()
        pg.mouse.move(bb["x"] + 20, bb["y"] + 15); pg.mouse.down(); pg.mouse.move(bb["x"] + 90, bb["y"] + 60, steps=5); pg.mouse.up()
        assert abs(st.bounding_box()["x"] - bb["x"]) > 30, "stickies drag"
        assert pg.locator(".fx").count() == 8 and pg.locator(".fx .fx-steps").count() == 8 and pg.locator(".fw2__steps li").count() == 5, "eight exhibits with steps"
        assert pg.locator("[data-build] .fb__phone .ha-row").count() == 5, "the habit tracker runs on a phone"
        assert pg.locator(".fq details").count() >= 4
        # Spanish menu
        pg.goto(f"{base}/index.html"); pg.wait_for_selector("#menu-features .mm__a", state="attached")
        pg.evaluate("TribeLang.set('es')")
        assert pg.text_content('#menu-features [data-mm="flint"] b').strip() == "Conoce a Flint"
        assert pg.text_content('.nav__links > a[href="flint.html"]').strip() == "Flint"
        pg.evaluate("TribeLang.set('en')")
        # phones: no sideways scroll, compact menu without the spotlight
        ph = b.new_context(viewport={"width": 390, "height": 844}).new_page(); ph.on("pageerror", lambda e: errs.append(str(e)))
        for page in ["flint.html", "index.html", "docs.html"]:
            ph.goto(f"{base}/{page}"); ph.wait_for_timeout(300)
            ph.evaluate("document.querySelector('.nav__toggle').click()"); ph.evaluate("document.querySelector('.nav__drop').click()"); ph.wait_for_timeout(150)
            w = ph.evaluate("document.documentElement.scrollWidth"); assert w <= 391, f"{page} 390: scrollWidth {w}"
            assert not ph.locator(".mm-spot").is_visible(), "no spotlight on phones"
        ph.goto(f"{base}/flint.html"); ph.wait_for_timeout(600)
        assert "is-phone" in ph.get_attribute("[data-app=run]", "class"), "the app copies switch to the phone layout"
        b.close()
    assert not errs, errs
    print("ok e2e_site_flint")


if __name__ == "__main__":
    main()
