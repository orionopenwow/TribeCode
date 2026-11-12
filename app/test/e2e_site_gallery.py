"""The website's gallery and Why TribeCode (site/index.html #gallery, #why; site/showcase.js; app/ui/makelink.js).

Serves the site the way Pages does (site/ at the root, app/ui at /app/, no tribe server). Checks: every thumbnail is a
real WebP that loads; the filters (All · Apps · Websites · Docs & company · Design · Games) show only their cards, say
how many, and keep the choice in the address; games come last and are the fewest; every "Make this" link resolves: the
app opens and Flint has the sentence typed in (?ask=), Work › Templates opens the template (?make=doc:), or the page
exists (?flintrun=1, #/hub/work, ?demo=showcase); every build sentence is one of Flint's free recipes
(server/flintfree.js classify); Why TribeCode has six cards with pictures; no sideways scroll at 390px; no page errors.

Usage: python app/test/e2e_site_gallery.py [--shots]   (docs/screenshots/site-gallery.png, site-standout.png, site-gallery-phone.png)
"""
import functools, http.server, json, os, subprocess, sys, threading, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5610 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://127.0.0.1:{PORT}/"
SHOTS = "--shots" in sys.argv
NOISE = ("Failed to load resource", "ERR_", "favicon", "WebSocket")


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def translate_path(self, path):   # /app/… → app/ui, everything else → site/
        p = urllib.parse.urlparse(path).path
        if p == "/app" or p.startswith("/app/"): return str(ROOT / "app" / "ui" / urllib.parse.unquote(p[5:]))
        return str(ROOT / "site" / urllib.parse.unquote(p.lstrip("/")))


class S(http.server.ThreadingHTTPServer):
    def handle_error(self, *a): pass   # a page closed mid-download


def main():
    srv = S(("127.0.0.1", PORT), Q); threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce", locale="en-US")
        ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        ctx.add_init_script("try { localStorage.setItem('tribecode.flint.hello', '1'); } catch {}")
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(f"site: {e}"))
        pg.goto(BASE + "index.html"); pg.wait_for_selector("#gallery .gx__card", state="attached")
        # thumbnails: real, loaded pictures
        pg.evaluate("document.querySelectorAll('#gallery img, #why img').forEach(i => i.loading = 'eager')")
        pg.wait_for_function("[...document.querySelectorAll('#gallery img, #why img')].every(i => i.complete)", timeout=15000)
        bad = pg.evaluate("[...document.querySelectorAll('#gallery img, #why img')].filter(i => !i.naturalWidth || !/assets\\/showcase\\/[\\w-]+\\.webp$/.test(i.src)).map(i => i.src)")
        assert not bad, bad
        n_img = pg.evaluate("document.querySelectorAll('#gallery img').length"); assert n_img >= 20, n_img
        # balance: every filter has cards, games are the last and the fewest
        cats = pg.evaluate("[...document.querySelectorAll('.gx__card')].map(c => c.dataset.cat)")
        count = {c: cats.count(c) for c in set(cats)}
        assert set(count) == {"apps", "sites", "docs", "design", "games"}, count
        assert cats[-count["games"]:] == ["games"] * count["games"] and count["games"] == min(count.values()), cats
        # filters
        for f in ["apps", "sites", "docs", "design", "games", "all"]:
            pg.click(f".gx__f[data-f='{f}']")
            vis = pg.evaluate("[...document.querySelectorAll('.gx__card')].filter(c => !c.hidden && c.offsetParent).map(c => c.dataset.cat)")
            assert vis == (cats if f == "all" else [f] * count[f]), (f, vis)
            assert pg.get_attribute(f".gx__f[data-f='{f}']", "aria-pressed") == "true"
            if f != "all": assert f"{count[f]} things to make" in pg.inner_text("#gx-count") and pg.evaluate("location.hash") == f"#gallery/{f}"
        pg.goto(BASE + "index.html#gallery/design"); pg.wait_for_selector("#gallery .gx__card", state="attached")
        assert pg.evaluate("[...document.querySelectorAll('.gx__card')].filter(c => !c.hidden).every(c => c.dataset.cat === 'design')")
        # Why TribeCode: six cards, each with a picture or a real file tree
        assert pg.evaluate("[...document.querySelectorAll('#why .why__card')].filter(c => c.querySelector('img, .why__files')).length") == 6
        if SHOTS:
            pg.goto(BASE + "index.html"); pg.wait_for_selector("#gallery .gx__card", state="attached")
            pg.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); document.querySelectorAll('.flint-hello, .flint-fab').forEach(e => e.remove())")
            pg.add_style_tag(content=".nav { position: static !important; }")
            pg.wait_for_function("[...document.querySelectorAll('#gallery img, #why img')].every(i => i.complete && i.naturalWidth)", timeout=15000)
            pg.evaluate("Promise.all([...document.querySelectorAll('#gallery img, #why img')].map(i => i.decode().catch(() => {})))"); pg.wait_for_timeout(300)
            pg.locator("#gallery").screenshot(path=str(ROOT / "docs/screenshots/site-gallery.png"))
            pg.locator("#why").screenshot(path=str(ROOT / "docs/screenshots/site-standout.png"))
        links = pg.evaluate("[...new Set([...document.querySelectorAll('#gallery [data-make]')].map(a => a.getAttribute('href')))]")
        assert len(links) >= 20, links
        # build sentences are Flint's free recipes
        asks = [urllib.parse.parse_qs(urllib.parse.urlparse(l).query)["ask"][0] for l in links if "?ask=" in l]
        out = subprocess.run(["node", "-e", "const f=require('./server/flintfree.js');console.log(JSON.stringify(JSON.parse(process.argv[1]).map(s=>[s,f.classify(s).recipe||null])))", json.dumps(asks)],
                             cwd=ROOT, capture_output=True, text=True, check=True)
        rec = dict(json.loads(out.stdout))
        run = (ROOT / "app/ui/flintrun.js").read_text()   # the rest are commands Watch Flint build itself uses (or its kind)
        assert "cmd: 'make the product presentation'" in run and "cmd: 'make me a company'" in run and "cmd: 'design a login screen'" in run
        builds = [s for s in asks if s.startswith(("make ", "build ")) and s not in ("make the product presentation", "make me a company")]
        assert all(rec[s] for s in builds), {s: rec[s] for s in builds}
        assert rec["make a cafe website"] == "site:cafe" and rec["make a to-do app"] == "todo" and rec["make a video editor"] == "video", rec
        # every Make this link opens the app and lands
        app = ctx.new_page()
        app.on("pageerror", lambda e: not any(n in str(e) for n in NOISE) and errs.append(f"app: {e}"))
        for l in links:
            url = urllib.parse.urljoin(BASE + "index.html", l)
            app.goto("about:blank"); r = app.goto(url); assert r and r.ok, (l, r and r.status)
            if "?ask=" in l:
                want = urllib.parse.parse_qs(urllib.parse.urlparse(l).query)["ask"][0]
                app.wait_for_function("window.TribeMakeLink && TribeMakeLink.last", timeout=30000)
                last = app.evaluate("TribeMakeLink.last"); assert last == {"kind": "ask", "value": want, "how": "prefill"}, (l, last)
                app.wait_for_function("v => [...document.querySelectorAll('textarea, input')].some(i => i.value === v)", arg=want, timeout=5000)
                assert "ask=" not in app.url, app.url
            elif "?make=doc:" in l:
                tid = l.split("doc:")[1]
                app.wait_for_function("window.TribeMakeLink && TribeMakeLink.last", timeout=30000)
                assert app.evaluate("TribeMakeLink.last") == {"kind": "doc", "value": tid, "how": "template"}, l
                title = app.evaluate(f"TribeTemplates.lib.byId('{tid}').title"); app.wait_for_function("t => document.body.innerText.includes(t)", arg=title, timeout=5000)
            elif "flintrun" in l:
                app.wait_for_function("!!window.TribeFlintRun", timeout=20000)
            elif "#/hub/work" in l:
                app.wait_for_function("!!window.TribeTalent", timeout=20000)
            else:
                app.wait_for_function("!!window.TribeApp", timeout=20000)
        # phones: no sideways scroll, the filters still work
        ph = ctx.new_page(); ph.set_viewport_size({"width": 390, "height": 844}); ph.on("pageerror", lambda e: errs.append(f"phone: {e}"))
        ph.goto(BASE + "index.html#gallery"); ph.wait_for_selector("#gallery .gx__card", state="attached")
        for f in ["games", "all"]:
            ph.click(f".gx__f[data-f='{f}']")
            sw = ph.evaluate("[document.documentElement.scrollWidth, innerWidth]"); assert sw[0] <= sw[1], (f, sw)
        assert ph.evaluate("document.querySelector('.gx__card').getBoundingClientRect().right") <= 390
        if SHOTS:
            ph.evaluate("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); document.querySelectorAll('.flint-hello, .flint-fab').forEach(e => e.remove())")
            ph.evaluate("document.querySelector('.gx__bar').scrollIntoView({ block: 'start' }); scrollBy(0, -70)")
            ph.wait_for_function("[...document.querySelectorAll('#gallery img')].slice(0, 4).every(i => i.complete && i.naturalWidth)", timeout=15000); ph.wait_for_timeout(400)
            ph.screenshot(path=str(ROOT / "docs/screenshots/site-gallery-phone.png"))
        b.close()
    srv.shutdown()
    assert not errs, errs
    print(f"e2e_site_gallery OK: {len(cats)} cards ({count}), {len(links)} Make this links resolve, phone fits")


if __name__ == "__main__":
    main()
