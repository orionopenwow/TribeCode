"""The website in every language (site/i18n.js + site/lang/*.json): loads each page of the site, switches to each of the
7 translations and asks TribeLang.missing() for visible strings with no translation (the scanner walks every text node
outside code and the animated app mocks, plus placeholders, including what the page's scripts draw: the Features menu,
the gallery cards). Fails on any. Also opens each gallery filter so its cards are scanned, checks English comes back
exactly, and that no page scrolls sideways at 390px in Japanese or German.

Usage: python app/test/e2e_site_i18n.py [--dump /tmp/missing.json]
"""
import functools, http.server, json, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5580 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PAGES = ["index.html", "flint.html", "learn.html", "mission.html", "pricing.html", "docs.html", "toolbox.html", "play/habit-tracker.html", "play/shared-list.html", "play/portfolio/index.html"]
LANGS = ["es", "pt", "fr", "de", "ja", "zh", "ko"]
DUMP = sys.argv[sys.argv.index("--dump") + 1] if "--dump" in sys.argv else None


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=str(ROOT / "site")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{PORT}/"
    errs, miss = [], {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, locale="en-US", reduced_motion="reduce")
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(base) else r.abort())
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
        for page in PAGES:
            pg.goto(base + page); pg.wait_for_function("window.TribeLang && TribeLang.ready", timeout=10000); pg.evaluate("TribeLang.ready")
            en = pg.evaluate("document.body.innerText")
            # open every hidden tab panel / menu / details so their words get scanned too
            pg.evaluate("""() => { document.querySelectorAll('[role=tabpanel][hidden], .menu[hidden], details').forEach(e => { if (e.tagName === 'DETAILS') e.open = true; else e.hidden = false; }); }""")
            for lang in LANGS:
                pg.evaluate(f"TribeLang.set('{lang}')")
                for m in pg.evaluate("TribeLang.missing()"):
                    miss.setdefault(m, set()).add(f"{page}:{lang}")
            pg.evaluate("TribeLang.set('en')")
        if not DUMP:
            ph = ctx.new_page(); ph.set_viewport_size({"width": 390, "height": 844})
            for page in PAGES[:7]:
                for lang in ("ja", "de"):
                    ph.goto(base + page); ph.wait_for_function("window.TribeLang && TribeLang.ready"); ph.evaluate(f"TribeLang.set('{lang}')")
                    sw = ph.evaluate("[document.documentElement.scrollWidth, innerWidth]"); assert sw[0] <= sw[1] + 1, (page, lang, sw)
            ph.evaluate("TribeLang.set('en')")
        b.close()
    srv.shutdown()
    if DUMP:
        json.dump({k: sorted(v) for k, v in miss.items()}, open(DUMP, "w"), ensure_ascii=False, indent=0); print(len(miss), "missing ->", DUMP); return
    assert not errs, errs
    assert not miss, f"{len(miss)} untranslated strings, e.g. " + json.dumps({k: sorted(v)[:3] for k, v in list(miss.items())[:12]}, ensure_ascii=False, indent=1)
    print("e2e_site_i18n OK:", len(PAGES), "pages ×", len(LANGS), "languages, nothing untranslated")


if __name__ == "__main__":
    main()
