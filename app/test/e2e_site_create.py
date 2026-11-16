"""The website's creator page (site/create.html) and the home page's creator section (site/index.html #create).
Checks: every picture and clip the pages use exists in site/assets/create and the folder stays small; the five sections
(apps, motion, share, launch, suggest) are there; a clip starts only when it scrolls into view, plays muted and looped
and pauses out of view; with reduced motion only the poster shows (no video is even loaded); the before-and-after divider
follows its slider; the seven demo apps scroll sideways; the Features menu and the footer link to the page; the home
section's four cards point at the page's sections; no sideways scroll at 390px.
Usage: python3 app/test/e2e_site_create.py [--shots]   (--shots writes docs/screenshots/site-demos-*.png)
"""
import functools, http.server, os, re, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
PORT = 5610 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SHOTS = "--shots" in sys.argv
SHOT_DIR = ROOT / "docs" / "screenshots"
MAX_MB = 3.0


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    errors = []
    # every asset the two pages name exists; the folder stays small
    names = set()
    for page in ("create.html", "index.html"):
        html = (SITE / page).read_text(encoding="utf-8")
        names |= set(re.findall(r'assets/create/[\w-]+\.[a-z0-9]+', html))
        for base in re.findall(r'data-clip="(assets/create/[\w-]+)"', html): names |= {base + ".webm", base + ".mp4", base + ".webp"}
    missing = [n for n in names if not (SITE / n).exists()]
    assert not missing, f"missing assets: {missing}"
    total = sum(f.stat().st_size for f in (SITE / "assets" / "create").iterdir()) / 1048576
    assert total < MAX_MB, f"site/assets/create is {total:.2f} MB (limit {MAX_MB})"

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=str(SITE)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{PORT}/"
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])
        c = b.new_context(viewport={"width": 1440, "height": 900}); pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(base + "create.html", wait_until="load")
        for sid in ("apps", "motion", "share", "launch", "suggest"):
            assert pg.locator(f"section#{sid} h2").count() == 1, sid
        # the hero clip is in view: it gets a muted, looping video and plays
        pg.wait_for_function("document.querySelector('.cr-hero [data-clip] video') && !document.querySelector('.cr-hero [data-clip] video').paused", timeout=15000)
        v = pg.evaluate("(() => { const v = document.querySelector('.cr-hero [data-clip] video'); return { muted: v.muted, loop: v.loop, inline: v.playsInline, srcs: [...v.querySelectorAll('source')].map(s => s.type) }; })()")
        assert v["muted"] and v["loop"] and v["inline"] and v["srcs"] == ["video/webm", "video/mp4"], v
        pg.wait_for_function("document.querySelector('.cr-hero [data-clip]').classList.contains('is-playing')", timeout=15000)
        # clips further down load only when they come into view
        assert pg.locator("#motion [data-clip] video").count() == 0, "clips below the fold wait"
        pg.locator("#motion .cr-social").scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelectorAll('#motion [data-clip] video').length === 4", timeout=15000)
        pg.wait_for_function("document.querySelector('.cr-hero [data-clip] video').paused", timeout=10000)
        if SHOTS: pg.wait_for_timeout(1500); pg.screenshot(path=str(SHOT_DIR / "site-demos-motion.png"))
        # before and after
        pg.locator("#launch .cr-ba").scroll_into_view_if_needed()
        pg.fill("#launch .cr-ba input[type=range]", "20")
        pg.evaluate("document.querySelector('#launch .cr-ba input').dispatchEvent(new Event('input'))")
        assert pg.evaluate("getComputedStyle(document.querySelector('.cr-ba')).getPropertyValue('--cut').trim()") == "20%"
        # the demo apps strip scrolls sideways (the page does not)
        assert pg.locator("#apps .cr-app").count() == 7
        assert pg.evaluate("(() => { const s = document.querySelector('.cr-apps'); return s.scrollWidth > s.clientWidth; })()")
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        # the Features menu and the footer
        pg.evaluate("window.scrollTo(0, 0)"); pg.click(".nav__drop"); pg.wait_for_selector("#menu-features a[href='create.html']", timeout=5000)
        assert pg.locator("footer a[href='create.html']").count() == 1
        if SHOTS:
            pg.keyboard.press("Escape"); pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(1200); pg.screenshot(path=str(SHOT_DIR / "site-demos-hero.png"))
            pg.locator("#apps").scroll_into_view_if_needed(); pg.wait_for_timeout(500); pg.screenshot(path=str(SHOT_DIR / "site-demos-apps.png"))
            pg.locator("#launch").scroll_into_view_if_needed(); pg.wait_for_timeout(500); pg.screenshot(path=str(SHOT_DIR / "site-demos-launch.png"))
        c.close()

        # reduced motion: posters only, nothing loads
        c = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce"); pg = c.new_page()
        pg.goto(base + "create.html", wait_until="load"); pg.wait_for_timeout(800)
        pg.locator("#motion .cr-social").scroll_into_view_if_needed(); pg.wait_for_timeout(600)
        assert pg.locator("[data-clip] video").count() == 0, "reduced motion shows the poster only"
        assert pg.evaluate("[...document.querySelectorAll('[data-clip] img')].every(i => i.complete && i.naturalWidth > 0)")
        c.close()

        # the home page's section
        c = b.new_context(viewport={"width": 1440, "height": 900}); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append("home: " + str(e)))
        pg.goto(base + "index.html", wait_until="load")
        hrefs = pg.evaluate("[...document.querySelectorAll('#create .cr-card')].map(a => a.getAttribute('href'))")
        assert hrefs == ["create.html#apps", "create.html#motion", "create.html#share", "create.html#launch"], hrefs
        pg.locator("#create").scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelector('#create [data-clip] video')", timeout=10000)
        if SHOTS: pg.wait_for_timeout(1500); pg.screenshot(path=str(SHOT_DIR / "site-demos-home.png"))
        c.close()

        # 390px
        for page in ("create.html", "index.html"):
            c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pg = c.new_page()
            pg.goto(base + page, wait_until="load"); pg.wait_for_timeout(500)
            for sel in ("#apps", "#launch", "#create") if page == "create.html" else ("#create",):
                if pg.locator(sel).count(): pg.locator(sel).scroll_into_view_if_needed()
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{page}: no sideways scroll at 390px"
            if SHOTS and page == "create.html": pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(800); pg.screenshot(path=str(SHOT_DIR / "site-demos-phone.png"))
            c.close()
        b.close()
    srv.shutdown()
    assert not errors, errors
    print(f"e2e_site_create: OK ({len(names)} assets, {total:.2f} MB, five sections, clips load in view and pause out of view, reduced motion shows posters, before and after, menu and footer, home cards, 390px)")


if __name__ == "__main__":
    main()
