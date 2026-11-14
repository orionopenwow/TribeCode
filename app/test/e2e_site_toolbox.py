"""The website's free toolbox (site/toolbox.html) and its teaser on the homepage. Checks the page draws every tool in
site/toolbox-data.json (ArtCraft first, as the feature), that each has a kind, three features, a licence and working
"Get it" and "Source code" links, that the four pillars point at real homepage sections, that no price appears, that
the Features menu lists the page, and that neither page scrolls sideways at 390px. Saves screenshots to
docs/screenshots/site-toolbox-*.png when run with --shots.

Usage: python app/test/e2e_site_toolbox.py [--shots DIR]
"""
import functools, http.server, json, os, re, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5595 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    data = json.loads((ROOT / "site" / "toolbox-data.json").read_text(encoding="utf8"))["tools"]
    assert 8 <= len(data) <= 12 and data[0]["id"] == "artcraft", [t["id"] for t in data]
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=str(ROOT / "site")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{PORT}/"
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US", reduced_motion="reduce")
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))

        pg.goto(base + "toolbox.html"); pg.wait_for_function("document.documentElement.dataset.toolbox", timeout=10000)
        assert pg.evaluate("document.documentElement.dataset.toolbox") == str(len(data))
        assert pg.locator("#tb-feature-title").inner_text() == "ArtCraft"
        assert pg.locator("#tb-feature .tb-list li").count() >= 3
        assert pg.locator("#tb-feature svg.tb-hero-art").count() == 1 and pg.locator("#tb-feature .tb-note a").count() == 1
        assert pg.locator("#tb-grid .tb-card").count() == len(data) - 1
        for t in data:
            box = pg.locator("#tb-feature" if t["id"] == "artcraft" else f"#tool-{t['id']}")
            txt = box.inner_text()
            for want in [t["name"], t["kind"], t["license"], t["what"]] + t["features"]:
                assert want in txt, (t["id"], want)
            assert box.locator(".tb-links a.btn").get_attribute("href") == t["url"], t["id"]
            assert box.locator(".tb-links a.tb-src").get_attribute("href") == t["source"], t["id"]
            assert t["url"].startswith("https://") and t["source"].startswith("https://github.com/"), t["id"]
        # real screenshots only for tools whose terms allow it (templates/studio-shots.json): whole, lazy, sized so the
        # page does not shift, WebP with a JPEG fallback, credited with links to the source and the licence
        shots = {t["id"]: t["shot"] for t in data if t.get("shot")}
        assert set(shots) == {"godot", "penpot"}, list(shots)
        assert pg.locator("#tb-grid img, #tb-feature img").count() == len(shots), "every other card is a drawing"
        credits = {c["tool"]: c for c in json.load(open(os.path.join(ROOT, "site", "assets", "toolbox", "credits.json"), encoding="utf8"))["images"]}
        assert set(credits) == set(shots)
        for sid, h in shots.items():
            card = pg.locator(f"#tool-{sid}"); im = card.locator(".tb-shot img")
            assert card.locator("svg.tb-art").count() == 0 and im.count() == 1, sid
            assert im.get_attribute("loading") == "lazy" and im.get_attribute("alt") == h["alt"], sid
            assert im.get_attribute("width") == str(h["w"]) and im.get_attribute("height") == str(h["h"]), sid
            assert card.locator('.tb-shot source[type="image/webp"]').count() == 1, sid
            links = card.locator(".tb-shot__credit a").evaluate_all("a => a.map(x => [x.textContent, x.getAttribute('href')])")
            assert links == [[h["by"], h["source"]], [h["license"], h["licenseUrl"]]], links
            c = credits[sid]
            assert c["author"] == h["by"] and c["licence"] == h["license"] and c["sourceUrl"] == h["source"] and c["date"] and c["attribution"], c
            for f in c["files"]:
                assert os.path.getsize(os.path.join(ROOT, "site", "assets", "toolbox", f)) <= 120 * 1024, f
            im.scroll_into_view_if_needed(); pg.wait_for_function("el => el.complete && el.naturalWidth > 0", arg=im.element_handle(), timeout=8000)
            r = pg.evaluate("el => { const b = el.getBoundingClientRect(); return b.width / b.height; }", im.element_handle())
            assert abs(r - h["w"] / h["h"]) < 0.03, "shown whole, not cropped"
        # the four pillars point at sections that exist on the homepage
        hrefs = pg.eval_on_selector_all(".tb-pillar", "a => a.map(x => x.getAttribute('href'))")
        assert hrefs == ["index.html#make", "index.html#kit", "index.html#company", "index.html#room"], hrefs
        body = pg.locator("main").inner_text()
        assert "Free and all in one" in body
        assert not re.search(r"[$€£¥]\s?\d|\d\s?(USD|EUR)|/\s?mo(nth)?\b", body), "no prices on the toolbox page"
        assert not re.search(r"better than", body, re.I)
        # the Features menu lists the page and marks it as here
        assert pg.locator('#menu-features a[data-mm="toolbox"]').get_attribute("href") == "toolbox.html"
        assert "is-here" in pg.locator('#menu-features a[data-mm="toolbox"]').get_attribute("class")
        if SHOTS: pg.screenshot(path=os.path.join(SHOTS, "site-toolbox-1440.png"), full_page=True)

        pg.goto(base + "index.html"); pg.wait_for_function("document.documentElement.dataset.toolbox", timeout=10000)
        assert pg.locator("#tbz-tools a.tbz__tool").count() == 6
        assert pg.locator("#tbz-tools a.tbz__tool").first.get_attribute("href") == "toolbox.html#tool-artcraft"
        assert pg.locator("#toolbox a.tbz__cta").get_attribute("href") == "toolbox.html"
        if SHOTS: pg.locator("#toolbox").screenshot(path=os.path.join(SHOTS, "site-toolbox-teaser-1440.png"))

        ph = ctx.new_page(); ph.set_viewport_size({"width": 390, "height": 844}); ph.on("pageerror", lambda e: errs.append(str(e)))
        for page in ("toolbox.html", "index.html"):
            ph.goto(base + page); ph.wait_for_function("document.documentElement.dataset.toolbox", timeout=10000)
            sw = ph.evaluate("[document.documentElement.scrollWidth, innerWidth]"); assert sw[0] <= sw[1] + 1, (page, sw)
            if page == "toolbox.html":
                small = ph.eval_on_selector_all(".tb-links a, .tb-note a, .tb-pillar", "a => a.filter(x => x.getBoundingClientRect().height < 36).map(x => x.textContent)")
                assert not small, small
                if SHOTS: ph.screenshot(path=os.path.join(SHOTS, "site-toolbox-390.png"), full_page=True)
            elif SHOTS: ph.locator("#toolbox").screenshot(path=os.path.join(SHOTS, "site-toolbox-teaser-390.png"))
        # a link to one tool lands on it
        ph.goto(base + "toolbox.html#tool-godot"); ph.wait_for_function("document.documentElement.dataset.toolbox")
        ph.wait_for_timeout(300)
        assert ph.evaluate("(() => { const r = document.getElementById('tool-godot').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()")
        b.close()
    srv.shutdown()
    assert not errs, errs
    print("e2e_site_toolbox OK:", len(data), "tools, pillars, menu entry, teaser, 390px")


if __name__ == "__main__":
    main()
