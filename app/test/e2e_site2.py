"""The download site's landing page (site/index.html), served on its own and fully offline.

Checks: the nav (links, dropdowns, Download pill, live star count), the hero headline, the OS-aware download label
(Windows and Mac user agents, linked to the right release asset), the stage mock advancing (its text grows over ~3 s),
reduced motion showing the finished frame, the GitHub stats strip filled from a fixture, the fallback when the API is
down, no console errors, and no sideways scroll at 390px (menu open too).

Usage: python app/test/e2e_site2.py [--shots]   (--shots saves docs/screenshots/site-desktop.png and site-phone.png)
"""
import functools, http.server, json, os, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4881 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}/"
SHOTS = "--shots" in sys.argv
WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

V = "v9.9.9"
NAMES = ["latest.json", "TribeCode_9.9.9_x64-setup.exe", "TribeCode_9.9.9_x64_en-US.msi", "TribeCode_9.9.9_aarch64.dmg",
         "TribeCode_9.9.9_amd64.AppImage", "TribeCode_9.9.9_amd64.deb"]
RELEASE = {"tag_name": V, "published_at": "2026-11-05T12:00:00Z",
           "assets": [{"name": n, "size": 40_000_000, "browser_download_url": f"https://github.com/orionopenwow/TribeCode/releases/download/{V}/{n}"} for n in NAMES]}
REPO = {"stargazers_count": 2345, "forks_count": 67, "open_issues_count": 3}


def route(ctx, mode="ok"):
    def handle(r):
        url = r.request.url
        if url.startswith(BASE): return r.continue_()
        if url.startswith("https://api.github.com/repos/orionopenwow/TribeCode") and mode == "ok":
            path = url.split("/repos/orionopenwow/TribeCode", 1)[1].split("?")[0]
            body = {"": REPO, "/releases/latest": RELEASE}.get(path)
            if body is not None:
                return r.fulfill(status=200, body=json.dumps(body), headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
        return r.abort()
    ctx.route("**/*", handle)


def watch(pg, errs, allow_network=False):
    def con(m):
        if m.type != "error": return
        if allow_network and ("Failed to load resource" in m.text or "ERR_FAILED" in m.text): return
        errs.append(m.text)
    pg.on("console", con); pg.on("pageerror", lambda e: errs.append(str(e)))


def convo_len(pg):
    return pg.evaluate("document.querySelector('.mk-convo').innerText.length")


def no_overflow(pg, where):
    sw, iw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw, f"sideways scroll on {where}: {sw} > {iw}"


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(ROOT / "site")))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------------- desktop, Windows ----------------
            errs = []
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, user_agent=WIN_UA); route(ctx)
            pg = ctx.new_page(); watch(pg, errs)
            pg.goto(BASE); pg.wait_for_load_state("load")
            assert pg.title().startswith("TribeCode"), pg.title()
            # nav
            assert pg.is_visible(".nav__logo img")
            labels = pg.evaluate("[...document.querySelectorAll('.nav__links > .nav__item > button, .nav__links > a')].map(e => e.textContent.trim())")
            assert labels == ["Features", "Download", "Pricing", "Docs", "Guide", "GitHub"], labels
            assert pg.is_visible(".nav__end a:has-text('Open the app')") and pg.is_visible(".nav__end .btn:has-text('Download')")
            pg.wait_for_function("document.querySelector('.nav [data-gh=stars]').textContent === '2.3k'", timeout=8000)
            assert pg.is_visible(".nav [data-gh=stars]")
            pg.click("button[aria-controls=menu-features]"); assert pg.is_visible("#menu-features a[href='#lanes']")
            pg.keyboard.press("Escape"); assert not pg.is_visible("#menu-features")
            # the nav border appears once scrolled
            assert not pg.evaluate("document.querySelector('.nav').classList.contains('is-scrolled')")
            # hero
            h1 = pg.inner_text("h1")
            assert "friends" in h1 and "Agents" in h1, h1
            assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)") >= 40
            assert pg.evaluate("document.querySelector('h1').getBoundingClientRect().left < 200"), "the hero is left-aligned"
            dl = pg.locator(".hero [data-dl-main]")
            pg.wait_for_function("document.querySelector('.hero [data-dl-main]').href.endsWith('_x64-setup.exe')", timeout=8000)
            assert "Download for Windows" in dl.inner_text(), dl.inner_text()
            assert pg.get_attribute(".hero a:has-text('Watch a demo tribe')", "href") == "app/?demo=showcase"
            assert pg.evaluate("document.querySelector('#menu-download [data-os=windows]').classList.contains('is-mine')")
            # the stage animates: text grows over ~3 s
            pg.wait_for_function("document.querySelector('[data-loop=stage]').dataset.state === 'running'", timeout=5000)
            pg.wait_for_timeout(1500); a = convo_len(pg)
            pg.wait_for_timeout(3000); c = convo_len(pg)
            assert c > a + 20, f"the stage didn't advance: {a} -> {c}"
            assert pg.evaluate("document.querySelector('.stage .mk-win').getAttribute('aria-hidden')") == "true"
            assert "Maya" in pg.inner_text("#stage-desc")
            # the stage is true to today's app: slate logo tile, the real sidebar, # general, Preview, In the room, Flint
            side = pg.inner_text(".mk-side")
            for row in ["Dashboard", "Messages", "Files", "Task Board", "Agents Hub", "Add", "Invite friends"]:
                assert row in side, (row, side)
            assert pg.evaluate("document.querySelector('.mk-logo img').naturalWidth > 0")
            assert pg.evaluate("document.querySelectorAll('.mk-rail .mk-circle').length") >= 3 and pg.is_visible(".mk-bar__end .mk-lights")
            assert "# general" in pg.inner_text(".mk-head")
            assert "Preview" in pg.inner_text(".mk-pv-bar") and "in the room" in pg.inner_text(".mk-room").lower() and "Ask Flint" in pg.inner_text(".mk-flint")
            room = pg.inner_text(".mk-room")
            assert all(n in room for n in ["Orion's Claude", "Maya's Codex", "Jay's Gemini"]), room
            # the little game keeps playing in the preview while the loop runs
            pg.wait_for_selector("#pv-4.on", timeout=15000)
            assert pg.evaluate("getComputedStyle(document.querySelector('.mk-walker')).animationName") == "walk"
            # stats strip from the fixture
            pg.wait_for_function("document.querySelector('.stats [data-gh=version]').textContent === 'v9.9.9'", timeout=8000)
            assert pg.inner_text(".stats [data-gh=stars]") == "2.3k" and pg.inner_text(".stats [data-gh=forks]") == "67"
            assert not pg.is_visible("[data-gh-fallback]")
            assert V in pg.inner_text(".hero__meta")
            # the final block: OS button, All downloads, platform links from the release
            assert pg.locator("#download [data-dl-main]").get_attribute("href").endswith("_x64-setup.exe")
            assert pg.locator("#download a:has-text('All downloads')").count() == 1
            hrefs = {a.get_attribute("data-os"): a.get_attribute("href") for a in pg.locator(".plats [data-os]").all()}
            assert hrefs["mac"].endswith("_aarch64.dmg") and hrefs["linux"].endswith(".AppImage") and hrefs["deb"].endswith(".deb"), hrefs
            # scrolling: the nav border, feature mocks start when they come into view
            pg.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
            pg.locator("#lanes .mini").scroll_into_view_if_needed(); pg.wait_for_timeout(2500)
            assert pg.evaluate("document.querySelector('.nav').classList.contains('is-scrolled')")
            assert pg.evaluate("document.querySelectorAll('#lanes [data-step].on').length") >= 2
            # host: share the network, honest about 24/7
            host = pg.inner_text("#host .feature__copy")
            assert "Share the network." in host and "24/7" in host and "no paid TribeCode cloud yet" in host, host
            assert all(c in host for c in ["Zero npm dependencies", "Plain files + git", "MIT licensed"])
            assert "Tailscale Funnel" in host and "Cloudflare tunnel" in host
            # pricing lives on its own page (pricing.html), not the front page: Individual / Teams tabs, paid buttons say Coming soon
            assert pg.locator("#pricing, .tier").count() == 0 and pg.locator(".nav__links a[href='pricing.html']").count() == 1
            pp = pg.context.new_page(); pp.goto(BASE + "pricing.html"); pp.wait_for_load_state("load")
            assert "Prices aren't final. TribeCode stays free and open source." in pp.inner_text(".pr-hero")
            names = pp.evaluate("[...document.querySelectorAll('[data-panel=individual] .pr-name')].map(e => e.textContent.trim().split(' ').pop())")
            assert names == ["Free", "Campfire", "Crew", "Bonfire"], names
            assert "Most popular" in pp.inner_text("[data-tier=crew]")
            for t, price in [("free", "$0"), ("campfire", "$8"), ("crew", "$30"), ("bonfire", "$100")]:
                assert price in pp.inner_text(f"[data-tier={t}]"), t
            assert pp.evaluate("[...document.querySelectorAll('.pr-page button.pr-btn')].every(b => b.disabled && /coming soon/i.test(b.textContent))")
            assert pp.locator("[data-tier=free] a.pr-btn").inner_text().strip() == "Download"
            assert pp.locator("[data-panel=teams]").is_hidden(); pp.click(".pr-tab[data-tab=teams]")
            assert pp.locator("[data-panel=teams]").is_visible() and "$25" in pp.inner_text("[data-tier=teams]")
            assert "$10" in pp.inner_text("[data-tier=credits]") and "own key" in pp.inner_text("[data-tier=credits]")
            assert "Anthropic" not in pp.inner_text("body"); pp.close()
            assert "Anthropic" not in pg.inner_text("body")
            assert pg.evaluate("document.querySelectorAll('.reveal.is-in').length") > 6
            if SHOTS:
                pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(9000)
                pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "site-desktop.png"))
            assert not errs, errs
            ctx.close()

            # ---------------- Mac label; a returning visitor gets no "Welcome back" bar ----------------
            errs = []
            ctx = b.new_context(viewport={"width": 1280, "height": 800}, user_agent=MAC_UA); route(ctx)
            ctx.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({ name: 'Orion Test', server: { token: 't' } })) } catch (e) {}")
            pg = ctx.new_page(); watch(pg, errs)
            pg.goto(BASE)
            pg.wait_for_function("document.querySelector('.hero [data-dl-main]').href.endsWith('_aarch64.dmg')", timeout=8000)
            assert "Download for macOS (Apple Silicon)" in pg.inner_text(".hero [data-dl-label]")
            assert pg.locator("#continue, .continue").count() == 0 and "Welcome back" not in pg.inner_text("body")
            assert pg.inner_text(".nav__end .nav__open").strip() == "Open the app"
            assert not errs, errs
            ctx.close()

            # ---------------- reduced motion: the finished frame ----------------
            errs = []
            ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); route(ctx)
            pg = ctx.new_page(); watch(pg, errs)
            pg.goto(BASE); pg.wait_for_load_state("load"); pg.wait_for_timeout(300)
            assert pg.evaluate("document.querySelector('[data-loop=stage]').dataset.state") == "done"
            assert "tests pass" in pg.inner_text("#mk-a2t") and pg.is_visible("#mk-m2") and pg.is_visible("#mk-card")
            assert not pg.is_visible("#mk-think"), "no thinking line in the finished frame"
            assert pg.is_visible("#mk-c1") and "creak" in pg.inner_text("#mk-c1t")
            whos = pg.inner_text(".mk-convo")
            assert all(t in whos for t in ["Claude Code", "Codex", "Gemini CLI"]), whos
            # lanes: plain words, each lane labeled with the person's role, the hand-off, a person approves
            lanes = pg.inner_text("#lanes .mini")
            for t in ["Orion's Claude is working on the title screen", "Maya's Codex is on sound", "Jay's Gemini is on level 2",
                      "🛠️ Orion · Engineer", "Sound & music", "🎮 Jay · Game designer", "✍️ Rio · Writer",
                      "Maya's Codex needs the title screen too", "asks Orion's Claude", "Handed off with a note", "approves before anything merges"]:
                assert t in lanes, (t, lanes)
            assert "src/" not in lanes, "no file paths in the main view"
            pg.click(".lanes__files"); lanes = pg.inner_text("#lanes .mini")
            assert "src/scenes/title.js" in lanes and pg.get_attribute(".lanes__files", "aria-pressed") == "true" and "Hide files" in lanes
            pg.click(".lanes__files"); assert "src/" not in pg.inner_text("#lanes .mini")
            assert "still up" in pg.inner_text("#host .term")
            assert pg.evaluate("document.querySelectorAll('.mk-plan li.done').length") == 5 and pg.inner_text("#mk-count") == "5/5"
            a = convo_len(pg); pg.wait_for_timeout(1500); assert convo_len(pg) == a, "nothing moves"
            assert pg.evaluate("[...document.querySelectorAll('[data-loop]')].every(l => l.dataset.state === 'done')")
            assert pg.evaluate("[...document.querySelectorAll('.reveal')].every(e => getComputedStyle(e).opacity === '1')")
            assert pg.evaluate("getComputedStyle(document.querySelector('#pv-lantern')).animationName") == "none"
            assert not errs, errs
            ctx.close()

            # ---------------- phone 390px, GitHub down ----------------
            errs = []
            ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
            route(ctx, "down")
            ph = ctx.new_page(); watch(ph, errs, allow_network=True)
            ph.goto(BASE); ph.wait_for_load_state("load")
            ph.wait_for_selector("[data-gh-fallback]:not([hidden])", timeout=12000)
            assert ph.inner_text(".stats [data-gh=stars]") == "–" and not ph.is_visible(".nav [data-gh=stars]")
            assert "Desktop app" in ph.inner_text(".hero [data-dl-label]")
            # nav collapses to wordmark + Download + menu
            assert ph.is_visible(".nav__logo") and ph.is_visible(".nav__end .btn") and ph.is_visible(".nav__toggle")
            assert not ph.is_visible("#nav-links") and ph.is_visible(".nav__end a:has-text('Open the app')"), "phones: Open the app stays in the bar"
            # the stage keeps its proportions
            w, h = ph.evaluate("(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.width, r.height]; })()")
            assert w <= 390 and abs(w / h - 1.6) < 0.03, (w, h)
            win = ph.evaluate("document.querySelector('.mk-win').getBoundingClientRect().right")
            assert win <= 390, win
            no_overflow(ph, "phone top")
            pq = ph.context.new_page(); pq.set_viewport_size({"width": 390, "height": 844}); pq.goto(BASE + "pricing.html"); pq.wait_for_load_state("load")
            lefts = pq.evaluate("[...document.querySelectorAll('[data-panel=individual] .pr-card')].map(t => Math.round(t.getBoundingClientRect().left))")
            assert len(lefts) == 4 and len(set(lefts)) == 1, f"pricing stacks on phones: {lefts}"
            assert pq.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"); pq.close()
            for y in [0.25, 0.5, 0.75, 1.0]:
                ph.evaluate(f"scrollTo({{top: document.body.scrollHeight * {y}, behavior: 'instant'}})"); ph.wait_for_timeout(150); no_overflow(ph, f"phone at {int(y * 100)}%")
            ph.evaluate("scrollTo(0, 0)"); ph.click(".nav__toggle"); assert ph.is_visible("#nav-links a[href='docs.html']"); no_overflow(ph, "phone menu")
            assert ph.get_attribute(".nav__toggle", "aria-expanded") == "true"
            ph.click(".nav__toggle"); assert not ph.is_visible("#nav-links")
            if SHOTS:
                ph.wait_for_timeout(9000)
                ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "site-phone.png"))
            assert not errs, errs
            ctx.close()
            b.close()
        print("Site landing page test passed")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
