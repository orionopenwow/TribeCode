"""Company mode on the website (v0.27): the #company section after "What is vibecoding?" (org chart, four cards, the
strip, the honest approvals note), its Features menu and footer links, the heading and cards translated in Spanish,
the fifth Learn module (six lessons, each with a scene, in the home page's Learn panel too), and no sideways scroll
on a 390px phone.
Usage: python app/test/e2e_site_company.py [--shots DIR]   (--shots saves sitebiz-*.png of the section and lesson m5)
"""
import functools, http.server, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5600 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def no_overflow(pg, where):
    sw, iw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw + 1, f"sideways scroll on {where}: {sw} > {iw}"

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=str(ROOT / "site"))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{PORT}"; errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US", reduced_motion="reduce")
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "/index.html"); pg.wait_for_selector("#lang-btn")
        # the section sits after "what you can make" and before the story; vibecoding is now an infographic inside Learn
        ys = pg.evaluate("['#make', '#company', '#story', '#vibecoding'].map(s => document.querySelector(s).getBoundingClientRect().top + scrollY)")
        assert ys == sorted(ys), ys
        assert pg.text_content("#biz-title").strip() == "Run a company, not just a project"
        assert pg.text_content("#company .eyebrow").strip() == "// vibe-run a business"
        # the live company mock (final frame under reduced motion), three explainers and the Learn-it strip
        assert pg.locator("#cs .cs__seat").count() == 4 and pg.locator("#cs .cs__line").count() == 4
        assert "Approved by Camp" in pg.text_content("#cs .cs__ask") and pg.is_visible("#cs .cs__ask-done") and pg.is_visible("#cs .cs__toast")
        assert pg.get_attribute("#cs .cs__win", "aria-hidden") == "true" and "Lantern Games" in pg.text_content("#cs-desc")
        assert pg.locator("#company .bx__card").count() == 3 and pg.locator("#company .bx__cap").count() == 10
        assert pg.locator("#company .biz__strip li").count() == 4
        assert pg.locator("#company a[href='learn.html#m5-0']").count() == 1 and pg.locator("#company a[href='docs.html#company']").count() == 1
        assert "person’s OK" in pg.text_content("#company .biz__note")
        assert pg.locator("#menu-features a[href='#company']").count() == 1 and pg.locator(".footer__links a[href='#company']").count() == 1
        # the mock's example revenue aside, the section names no prices
        body = pg.evaluate("(() => { const c = document.querySelector('#company').cloneNode(true); c.querySelectorAll('.cs, .bx__pic').forEach(e => e.remove()); return c.textContent })()")
        assert "$" not in body and "price" not in body.lower(), "no prices in the section"
        # Learn: one simple section with the "How vibecoding works" infographic (four steps) and one button
        assert pg.locator("#learn #vibecoding .vf__step").count() == 4 and pg.locator("#learn a[href='learn.html#m1-0']").count() == 1
        if SHOTS:
            pg.locator("#company").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            pg.locator("#company").screenshot(path=f"{SHOTS}/sitebiz-section-1440.png")
        # Spanish: heading, lead, cards and strip are translated
        en_cards = pg.eval_on_selector_all("#company .bx__cap, #company .biz__sk, #company .biz__ss, #company h3, #company .biz__docs", "els => els.map(e => e.textContent.trim())")
        pg.evaluate("TribeLang.set('es')")
        assert pg.text_content("#biz-title").strip() == "Dirige una empresa, no solo un proyecto", pg.text_content("#biz-title")
        assert pg.text_content("#company .biz__lead").strip().startswith("Convierte un proyecto")
        es_cards = pg.eval_on_selector_all("#company .bx__cap, #company .biz__sk, #company .biz__ss, #company h3, #company .biz__docs", "els => els.map(e => e.textContent.trim())")
        same = [e for e, s in zip(en_cards, es_cards) if e == s]
        assert not same, f"untranslated in es: {same}"
        assert "Modo empresa" in pg.text_content("#menu-features")
        pg.evaluate("TribeLang.set('en')"); assert pg.text_content("#biz-title").strip() == "Run a company, not just a project"
        # Learn module 5: six lessons, each with a scene and the right heading
        lp = ctx.new_page(); lp.on("pageerror", lambda e: errs.append(str(e)))
        lp.goto(base + "/learn.html#m5-0"); lp.wait_for_selector(".lx-fig .lv")
        assert lp.evaluate("TribeLearn.M.length") == 5 and lp.evaluate("TribeLearn.steps.length") == 29
        assert "5 modules" in lp.text_content("#lx-sum") or "of 5 modules" in lp.text_content("#lx-sum"), lp.text_content("#lx-sum")
        assert "about 55 min" in lp.text_content("#lx-sum")
        for i in range(6):
            lp.goto(base + f"/learn.html#m5-{i}"); lp.wait_for_selector(".lx-fig .lv")
            assert lp.text_content("#lx-crumb").strip() == "Module 5 · From project to business"
            assert f"Lesson {i + 1} of 6" in lp.text_content("#lx-card .k")
        assert "professional" in lp.text_content("#lx-card")
        if SHOTS:
            lp.goto(base + "/learn.html#m5-1"); lp.wait_for_selector(".lx-fig .lv"); lp.wait_for_timeout(300)
            lp.screenshot(path=f"{SHOTS}/sitebiz-learn-m5-1440.png")
        # phone: no sideways scroll on the home page or any m5 lesson
        ph = b.new_context(viewport={"width": 390, "height": 844}, locale="en-US", reduced_motion="reduce").new_page(); ph.on("pageerror", lambda e: errs.append(str(e)))
        ph.goto(base + "/index.html"); ph.wait_for_selector("#company")
        no_overflow(ph, "home 390")
        r = ph.evaluate("(() => { const c = document.querySelector('#company .bx').getBoundingClientRect(); return [c.left, c.right] })()")
        assert r[0] >= 0 and r[1] <= 390, r
        r = ph.evaluate("(() => { const c = document.querySelector('#cs').getBoundingClientRect(); return [c.left, c.right] })()")
        assert r[0] >= 0 and r[1] <= 390, r
        if SHOTS:
            ph.locator("#company").screenshot(path=f"{SHOTS}/sitebiz-section-390.png")
        for i in range(6):
            ph.goto(base + f"/learn.html#m5-{i}"); ph.wait_for_selector(".lx-fig .lv")
            no_overflow(ph, f"m5-{i} 390")
            if SHOTS and i in (0, 4):
                ph.locator("#lx-card").screenshot(path=f"{SHOTS}/sitebiz-learn-m5-{i}-390.png")
        b.close()
    assert not errs, errs
    print("ok e2e_site_company")

if __name__ == "__main__":
    main()
