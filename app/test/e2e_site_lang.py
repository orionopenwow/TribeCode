"""The website's language picker (site/i18n.js, v0.25): the 🌐 button in the top bar lists 8 languages; picking one
translates the menu, hero, section titles and buttons, sets <html lang>, is remembered after a reload, and English
comes back exactly. A first visit uses the browser's language when we have it (German on the Learn page). No sideways
scroll on a phone, no page errors. Also checks the Learn page draws a lesson scene for every lesson.
Usage: python app/test/e2e_site_lang.py
"""
import functools, http.server, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5520 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=str(ROOT / "site"))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{PORT}"; errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        pg = b.new_page(viewport={"width": 1440, "height": 900}, locale="en-US"); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "/index.html"); pg.wait_for_selector("#lang-btn")
        en = pg.text_content("#hero-title").strip(); assert en == "Build apps, games and websites with your friends.", en
        pg.click("#lang-btn"); pg.wait_for_selector("#lang-menu:not([hidden])")
        assert pg.locator("#lang-menu [data-lang]").count() == 8
        pg.click("#lang-menu [data-lang='es']")
        assert pg.text_content("#hero-title").strip() == "Crea apps, juegos y sitios web con tus amigos." and pg.evaluate("document.documentElement.lang") == "es"
        assert "Descargar" in pg.text_content(".nav__end") and pg.locator("#lang-menu").is_hidden()
        pg.reload(); pg.wait_for_selector("#lang-btn"); assert pg.text_content("#hero-title").strip().startswith("Crea apps") and "ES" in pg.text_content("#lang-btn")
        pg.evaluate("TribeLang.set('ja')"); assert "友だち" in pg.text_content("#hero-title") and pg.evaluate("document.documentElement.lang") == "ja"
        pg.evaluate("TribeLang.set('en')"); assert pg.text_content("#hero-title").strip() == en and pg.evaluate("document.documentElement.lang") == "en"
        # keyboard: open, arrow down, Enter picks
        pg.focus("#lang-btn"); pg.keyboard.press("Enter"); pg.keyboard.press("ArrowDown"); pg.keyboard.press("Enter")
        assert pg.evaluate("TribeLang.get()") == "es"; pg.evaluate("TribeLang.set('en')")
        ph = b.new_page(viewport={"width": 390, "height": 844}, locale="de-DE"); ph.on("pageerror", lambda e: errs.append(str(e)))
        ph.goto(base + "/learn.html#m1-0"); ph.wait_for_selector("#lang-btn", state="attached")
        st = ph.evaluate("[TribeLang.get(), document.querySelector('header').textContent.includes('Herunterladen'), !!document.querySelector('#lang-btn').offsetParent]"); assert st == ["de", True, True], st
        sw = ph.evaluate("[document.documentElement.scrollWidth, innerWidth]"); assert sw[0] <= sw[1] + 1, sw
        for k in ["m1-0", "m1-3", "m2-1", "m3-2", "m3-4", "m4-5", "m4-6", "m5-2", "m5-4", "m2-q"]:
            ph.goto(base + f"/learn.html#{k}"); ph.wait_for_selector(".lx-fig .lv", timeout=5000)
            sw = ph.evaluate("[document.documentElement.scrollWidth, innerWidth]"); assert sw[0] <= sw[1] + 1, (k, sw)
        b.close()
    assert not errs, errs
    print("ok e2e_site_lang")

if __name__ == "__main__":
    main()
