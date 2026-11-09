"""The showcase site, the front page (site/ in the repo, published by .github/workflows/pages.yml; the app is at /app/).

Assembles the Pages layout like the workflow (site/ at the root, app/ui under /app/, old addresses redirected) on a static server, then checks:
no console errors, every link has a real target (in-page anchors exist, local pages answer 200), every image loads,
the demo video and GIF the README uses exist, no sideways scroll at 390px (menu open too), the download button picks the visitor's
OS from the latest release, live GitHub numbers render from the API, the fallback renders when the API is unreachable,
and reduced motion shows everything at once with the live mocks on their finished frame. External requests never leave the test.

Usage: python app/test/e2e_showcase.py [--shots]   (--shots saves docs/screenshots/showcase-*.png)
"""
import functools, http.server, json, os, shutil, sys, tempfile, threading, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 4941 + OFF
BASE = f"http://localhost:{PORT}"
ABOUT = BASE + "/"
SHOTS = "--shots" in sys.argv
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

V = "v9.9.9"
NAMES = ["latest.json", f"TribeCode_9.9.9_x64-setup.exe", "TribeCode_9.9.9_x64_en-US.msi", "TribeCode_9.9.9_aarch64.dmg",
         "TribeCode_9.9.9_amd64.AppImage", "TribeCode_9.9.9_amd64.deb", "TribeCode-9.9.9-1.x86_64.rpm", "TribeCode_aarch64.app.tar.gz"]
RELEASE = {"tag_name": V, "published_at": "2026-11-05T12:00:00Z",
           "assets": [{"name": n, "size": 40_000_000, "browser_download_url": f"https://github.com/orionopenwow/TribeCode/releases/download/{V}/{n}"} for n in NAMES]}
REPO = {"stargazers_count": 1234, "forks_count": 56, "open_issues_count": 7}
CONTRIB = [{"login": "orionopenwow", "type": "User", "contributions": 400, "html_url": "https://github.com/orionopenwow", "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"}]
PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201" "a5f6e1d70000000049454e44ae426082")


def assemble():
    """Like the Pages workflow: site/ at the root, app/ui at /app/, the compat stubs (go.html, demo.html, about/, sw.js)."""
    out = Path(tempfile.mkdtemp(prefix="tc-pages-"))
    shutil.copytree(ROOT / "site", out, dirs_exist_ok=True)
    shutil.copytree(ROOT / "app" / "ui", out / "app")
    shutil.copytree(ROOT / "scripts" / "pages-compat", out, dirs_exist_ok=True)
    return out


def route_external(ctx, mode, seen):
    """Nothing leaves the test: GitHub's API is mocked ("ok") or unreachable ("down"); other hosts are refused."""
    def handle(route):
        url = route.request.url
        if url.startswith(BASE): return route.continue_()
        seen.append(url)
        if url.startswith("https://api.github.com/"):
            if mode == "down": return route.abort()
            path = url.split("/repos/orionopenwow/TribeCode", 1)[1].split("?")[0]
            body = {"": REPO, "/releases/latest": RELEASE, "/contributors": CONTRIB}.get(path)
            if body is None: return route.fulfill(status=404, body="{}")
            return route.fulfill(status=200, body=json.dumps(body), headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
        if url.startswith("https://avatars.githubusercontent.com/"): return route.fulfill(status=200, body=PNG, headers={"Content-Type": "image/png"})
        return route.abort()
    ctx.route("**/*", handle)


def watch(pg, errs, allow_network=False):
    def con(m):
        if m.type != "error": return
        if allow_network and ("Failed to load resource" in m.text or "ERR_FAILED" in m.text): return
        errs.append(m.text)
    pg.on("console", con); pg.on("pageerror", lambda e: errs.append(str(e)))


def scroll_through(pg):
    pg.evaluate("""async () => { document.documentElement.style.scrollBehavior = 'auto'; for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.7) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 200)); scrollTo(0, 0); document.documentElement.style.scrollBehavior = ''; }""")
    try: pg.wait_for_function("[...document.images].filter(i => !i.closest('video')).every(i => i.complete)", timeout=15000)
    except Exception: raise AssertionError("images not loaded: %s" % pg.evaluate("[...document.images].filter(i => !i.complete).map(i => i.src)"))


def no_overflow(pg, where):
    sw, iw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw, f"sideways scroll on {where}: {sw} > {iw}"


def status(url):
    try:
        with opener.open(urllib.request.Request(url, method="GET"), timeout=5) as r: return r.status
    except urllib.error.HTTPError as e: return e.code


def main():
    root = assemble()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def handle(self):   # the browser drops video range requests mid-way; that's not an error
            try: super().handle()
            except (BrokenPipeError, ConnectionResetError): pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        # assets the page and README rely on
        for f, cap in [("demo.gif", 8e6), ("demo.mp4", 8e6), ("demo.webm", 8e6), ("og-image.png", 1e6), ("demo-poster.webp", 1e6)]:
            p = ROOT / "site" / "assets" / f; assert p.exists() and p.stat().st_size < cap, f
        shots = sum(p.stat().st_size for p in (ROOT / "site" / "assets" / "shots").glob("*"))
        assert shots < 6.5e6, f"screenshots are {shots / 1e6:.1f} MB"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])

            # ---------------- desktop, GitHub answers ----------------
            seen, errs = [], []
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); route_external(ctx, "ok", seen)
            pg = ctx.new_page(); watch(pg, errs)
            pg.goto(ABOUT); pg.wait_for_load_state("load")
            assert pg.title().startswith("TribeCode"), pg.title()
            assert "Code anything" in pg.inner_text("h1")
            assert pg.locator('meta[property="og:image"]').get_attribute("content")== "https://tribecode.org/assets/og-image.png"
            # live GitHub numbers, release line and downloads from the release (headless Chrome here reports Linux)
            pg.wait_for_function("document.querySelector('[data-gh=forks]').textContent === '56' && document.querySelector('.stats [data-gh=version]').textContent === 'v9.9.9'", timeout=8000)
            assert pg.inner_text(".stats [data-gh=stars]") == "1.2k" and pg.inner_text(".nav [data-gh=stars]") == "1.2k" and pg.is_visible(".nav [data-gh=stars]")
            assert pg.inner_text(".stats [data-gh=version]") == V
            eb = pg.text_content(".hero__meta"); assert V in eb and "works with Claude Code" in eb, eb
            assert not pg.is_visible("[data-gh-fallback]")
            main_dl = pg.locator(".hero [data-dl-main]")
            assert main_dl.get_attribute("href").endswith("_amd64.AppImage") and "Download for Linux" in main_dl.inner_text(), main_dl.get_attribute("href")
            # the other platforms
            hrefs = {a.get_attribute("data-os"): a.get_attribute("href") for a in pg.locator(".plats [data-os]").all()}
            assert hrefs["windows"].endswith("_x64-setup.exe") and hrefs["mac"].endswith("_aarch64.dmg") and hrefs["deb"].endswith(".deb"), hrefs
            # every link points somewhere real
            links = pg.evaluate("[...document.querySelectorAll('a')].map(a => ({ raw: a.getAttribute('href'), abs: a.href, text: a.textContent.trim() || a.getAttribute('aria-label') }))")
            assert len(links) > 30
            for l in links:
                raw = l["raw"] or ""
                assert raw and raw != "#" and not raw.startswith("javascript:"), l
                if raw.startswith("#"):
                    assert pg.locator(raw).count() == 1, f"missing anchor {raw}"
                elif l["abs"].startswith(BASE):
                    assert status(l["abs"].split("#")[0]) == 200, l
                else:
                    assert l["abs"].startswith("https://"), l
            assert pg.locator(".hero a:has-text('Watch a demo tribe')").get_attribute("href") == "app/?demo=showcase"
            assert pg.locator(".nav__end a:has-text('Open the app')").get_attribute("href") == "app/?welcome=1"
            assert pg.locator(".hero a:has-text('Open in your browser')").get_attribute("href") == "app/?welcome=1"
            # old addresses still land in the right place
            for old, want in [("/go.html#s=x&c=y", "/app/go.html#s=x&c=y"), ("/demo.html", "/app/demo.html"), ("/about/", "/"), ("/#/hub", "/app/#/hub")]:
                op = ctx.new_page(); op.goto(BASE + old); op.wait_for_url(BASE + want, timeout=8000); op.close()
            # images load (lazy ones after scrolling), the live stage mock runs, mocks and reveals follow the scroll
            scroll_through(pg)
            bad = pg.evaluate("[...document.images].filter(i => !i.naturalWidth).map(i => i.src)")
            assert not bad, bad
            for f in ["demo.gif", "demo.mp4", "demo.webm", "demo-poster.webp"]:   # still used by the README
                assert status(ABOUT + "assets/" + f) == 200, f
            pg.wait_for_function("document.querySelector('[data-loop=stage]').dataset.state === 'running'", timeout=8000)
            pg.locator("#host .mini").scroll_into_view_if_needed(); pg.wait_for_timeout(1500)
            assert pg.evaluate("document.querySelectorAll('#host [data-step].on').length") >= 1
            assert pg.evaluate("document.querySelectorAll('.reveal.is-in').length") > 5
            # never presented as Anthropic's: an independent project that works with Claude Code
            body = pg.inner_text("body")
            assert "© 2026 TribeCode contributors · MIT" in body and "independent project" in body
            # agents in general, not one tool; the honest hosting line; pricing with every paid button disabled; no "Welcome back" bar
            for tool in ["Claude Code", "Codex", "Gemini CLI", "Cursor"]:
                assert tool in body, tool
            assert "Share the network." in body and "GitHub repo" in body and "Anthropic" not in body
            assert pg.locator("#pricing").count() == 0, "pricing has its own page"
            assert pg.locator("#continue").count() == 0
            assert all(u.startswith(("https://api.github.com/", "https://avatars.githubusercontent.com/")) for u in seen), seen
            if SHOTS:
                pg.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))"); pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(300)
                pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "showcase-desktop.png"))
            assert not errs, errs
            # the quick start page shares the stylesheet
            dp = ctx.new_page(); derrs = []; watch(dp, derrs); dp.goto(ABOUT + "docs.html"); dp.wait_for_load_state("load")
            assert "Your first project" in dp.inner_text("h1") and dp.evaluate("document.querySelector('.nav__logo img').naturalWidth > 0")
            assert not derrs, derrs
            # the app at /app/ (as on Pages, with no tribe) links back here from its not-connected Home
            ap = ctx.new_page(); ap.goto(BASE + "/app/?skipIntro=1")
            ap.wait_for_function("window.TribeHub", timeout=15000); ap.evaluate("TribeHub.open('home')")
            ap.wait_for_selector("#hub-about", timeout=15000)
            assert ap.get_attribute("#hub-about", "href") == "https://tribecode.org/" and "About TribeCode" in ap.inner_text("#hub-about")
            ctx.close()

            # ---------------- phone 390px, GitHub unreachable ----------------
            seen, errs = [], []
            ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            route_external(ctx, "down", seen)
            ph = ctx.new_page(); watch(ph, errs, allow_network=True)
            ph.goto(ABOUT); ph.wait_for_load_state("load")
            ph.wait_for_selector("[data-gh-fallback]:not([hidden])", timeout=12000)
            assert "github.com/orionopenwow/TribeCode" in ph.inner_text("[data-gh-fallback]")
            assert ph.inner_text(".stats [data-gh=stars]") == "–" and not ph.is_visible(".nav [data-gh=stars]")
            assert ph.locator(".hero [data-dl-main]").get_attribute("href") == "https://github.com/orionopenwow/TribeCode/releases/latest", "falls back to the releases page"
            assert "Desktop app" in ph.inner_text(".hero [data-dl-label]"), "a phone isn't offered an installer as if it could run it"
            # phones: Open the app comes first (a phone can't install the desktop app)
            first = ph.evaluate("(() => { const bs = [...document.querySelectorAll('.hero__ctas .btn')].filter(b => b.offsetParent); bs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return bs[0].getAttribute('href'); })()")
            assert first == "app/?welcome=1", first
            assert ph.is_visible(".nav__end a[data-open-app]") and not ph.is_visible(".nav__end [data-dl-main]")
            no_overflow(ph, "phone top")
            scroll_through(ph)
            for y in [0.25, 0.5, 0.75, 1.0]:
                ph.evaluate(f"scrollTo({{top: document.body.scrollHeight * {y}, behavior: 'instant'}})"); ph.wait_for_timeout(120); no_overflow(ph, f"phone at {int(y * 100)}%")
            assert not ph.evaluate("[...document.images].filter(i => !i.naturalWidth).map(i => i.src)")
            ph.evaluate("scrollTo(0, 0)"); ph.click(".nav__toggle"); assert ph.is_visible("#nav-links a[href='docs.html']"); no_overflow(ph, "phone menu")
            ph.click("button[aria-controls=menu-features]"); assert ph.is_visible("#nav-links a[href='#phone']"); no_overflow(ph, "phone menu open")
            ph.click("#nav-links a[href='#phone']")
            ph.wait_for_function("Math.abs(document.querySelector('#phone').getBoundingClientRect().top) < 120", timeout=5000)
            assert not ph.is_visible("#nav-links a[href='#phone']"), "the menu closes after a pick"
            for sel in [".hero__ctas .btn", ".get__ctas .btn", ".lane", ".plats a", ".ph", ".mk-win", ".mk-card", "#lanes .mini__bar"]:
                w = ph.evaluate(f"Math.max(...[...document.querySelectorAll('{sel}')].map(e => e.getBoundingClientRect().right))")
                assert w <= 390, (sel, w, ph.evaluate(f"[...document.querySelectorAll('{sel}')].filter(e => e.getBoundingClientRect().right > 390).map(e => e.outerHTML.slice(0, 160))"))
            if SHOTS:
                ph.evaluate("document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in')); scrollTo(0, 0)"); ph.wait_for_timeout(300)
                ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "showcase-phone.png"))
            assert not errs, errs
            ctx.close()

            # ---------------- reduced motion ----------------
            seen, errs = [], []
            ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); route_external(ctx, "ok", seen)
            rm = ctx.new_page(); watch(rm, errs)
            rm.goto(ABOUT); rm.wait_for_load_state("load"); rm.wait_for_timeout(400)
            assert rm.evaluate("[...document.querySelectorAll('.reveal')].every(e => getComputedStyle(e).opacity === '1')"), "everything shows at once"
            assert rm.evaluate("[...document.querySelectorAll('[data-loop]')].every(l => l.dataset.state === 'done')"), "the mocks show their finished frame"
            assert rm.evaluate("getComputedStyle(document.querySelector('#pv-lantern')).animationName") == "none"
            assert not errs, errs
            ctx.close()
            b.close()
        print("Showcase site test passed")
    finally:
        httpd.shutdown(); shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    main()
