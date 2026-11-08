"""Reviews and feedback (feat/reviews): the app's Rate TribeCode card (Flint's flame menu and the ? menu) opens a
prefilled GitHub review; the pricing page shows a 14-day trial note, and a reviews section that lists only real
reviews from site/reviews.json (empty: an invitation, and nothing on the home page; with one: the card and a quiet
line on the home page).
Usage: python app/test/e2e_reviews.py
"""
import functools, http.server, json, os, shutil, subprocess, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
APORT, SPORT = 5520 + OFF, 5521 + OFF


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-rev-")); errors = []
    site = tmp / "site"; shutil.copytree(ROOT / "site", site)
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Q, directory=str(site)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(APORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(f"http://localhost:{APORT}/api/health", timeout=2); break
            except Exception: time.sleep(0.2)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- site, no reviews yet ----
            pg = b.new_page(viewport={"width": 1280, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(f"http://127.0.0.1:{SPORT}/pricing.html"); pg.wait_for_load_state("load")
            assert "14-day free trial" in pg.inner_text("[data-tier=tribe]") and pg.is_visible("[data-tier=trial]")
            assert pg.is_visible("#reviews") and pg.is_visible("#rv-empty") and pg.locator(".rv").count() == 0
            assert "template=review.yml" in pg.get_attribute(".rv-cta a", "href")
            pg.goto(f"http://127.0.0.1:{SPORT}/index.html"); pg.wait_for_timeout(800)
            assert pg.locator("[data-rv-quiet]").is_hidden(), "no reviews: nothing on the home page"
            # ---- one real review ----
            (site / "reviews.json").write_text(json.dumps({"reviews": [{"stars": 5, "text": "We made a tiny platformer in one evening, four of us and two agents.", "name": "Maya", "what": "game jam", "date": "2026-11-08", "link": "https://github.com/orionopenwow/TribeCode/issues/1"}, {"stars": 4, "text": "no link, must be ignored", "name": "X"}]}))
            pg.goto(f"http://127.0.0.1:{SPORT}/pricing.html"); pg.wait_for_selector(".rv")
            assert pg.locator(".rv").count() == 1 and pg.is_hidden("#rv-empty") and "Maya" in pg.inner_text(".rv") and "★★★★★" in pg.inner_text(".rv-stars")
            pg.goto(f"http://127.0.0.1:{SPORT}/index.html"); pg.wait_for_selector("[data-rv-quiet]:not([hidden])")
            assert "1 review" in pg.inner_text("[data-rv-quiet]")
            pg.close()
            # ---- the app: Rate TribeCode ----
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ap = ctx.new_page(); ap.on("pageerror", lambda e: errors.append(str(e)))
            ap.add_init_script("window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };")
            ap.goto(f"http://localhost:{APORT}/?skipIntro=1"); ap.wait_for_function("window.TribeFeedback && window.TribeFlint", timeout=15000)
            ap.click("[data-flme]"); ap.click("#fl-menu [data-fm]:last-child")
            ap.wait_for_selector("#fb .fb-card")
            assert ap.is_disabled("#fb-go")
            ap.click("#fb [data-n='4']"); ap.fill("#fb-text", "Sheets and slides are great for our jam plans.")
            assert ap.is_enabled("#fb-go"); ap.click("#fb-go")
            url = ap.evaluate("window.__opened[0]")
            assert url.startswith("https://github.com/orionopenwow/TribeCode/issues/new?") and "template=review.yml" in url and "Good" in urllib.request.unquote(url) and "consent=" in url, url
            assert ap.locator("#fb").count() == 0
            ap.click("#tb-help"); assert ap.locator("[data-help=review]").count() == 1
            ctx.close(); b.close()
        assert not errors, errors
        print("e2e_reviews: ok")
    finally:
        srv.send_signal(2); httpd.shutdown()
        try: srv.wait(timeout=10)
        except Exception: srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
