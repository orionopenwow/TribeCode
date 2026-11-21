"""One website tool (feat/website-one): the website designer is the only way a website is made and seen.
- Files › Website with a designer site shows that site (preview, Open the designer, Put it online), never "There is no
  website yet" and nothing of the old page builder (no Build the site, no page text fields).
- With no site: one button, Make a website, which opens the designer's start screen (what kind of site first).
- A site made with the old page builder shows read-only with "Bring it into the designer"; that makes a designer site
  from its page and keeps the old builder's data.
- Every entry point opens the designer or this page: the Website row (TribeShell.go), Flint's "make a website", Ctrl K's
  Website templates, the Files make-a-site action.
- Publish words the link by what was made: a game's play link, a link to your site, a link to try your app.
- 390 px: no sideways scroll, 40 px buttons.
Usage: python app/test/e2e_website_one.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6418 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def repo(tmp, name, files):
    d = tmp / name; d.mkdir(parents=True)
    for rel, text in files.items(): f = d / rel; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(text)
    g = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
    subprocess.run(["git", "init", "-q"], cwd=d, check=True); subprocess.run(["git", "add", "-A"], cwd=d, check=True)
    subprocess.run(g + ["commit", "-qm", "start"], cwd=d, check=True)
    return str(d)

GAME = "<!doctype html><title>Moth Run</title><canvas id=c width=320 height=200></canvas><script>const x=c.getContext('2d');function f(){x.fillRect(0,0,9,9);requestAnimationFrame(f)}f()</script>"
APP = "<!doctype html><title>Fern Notes</title><meta name=viewport content='width=device-width'><h1>Fern Notes</h1><button>Add a note</button>"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-wone-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        mk = lambda name, **kw: (lambda p: (p.get("project") or p)["id"])(ok(api("/projects", "POST", {"name": name, **kw}, token=host)))
        site = mk("Lantern Bakery", bio="Bread at dawn")
        old = mk("Ember Cafe", bio="A small cafe by the river")
        ok(api(f"/projects/{old}/website/instant", "POST", {}, token=host, project=old), "old builder draft")
        none = mk("Blank Slate")
        game = mk("Moth Run", path=repo(tmp, "game", {"index.html": GAME}))
        app = mk("Fern Notes", path=repo(tmp, "app", {"index.html": APP}))
        ok(api("/publish/real", "PUT", {"project": game, "kind": "game"}, token=host, project=game))
        ok(api("/publish/real", "PUT", {"project": app, "kind": "app"}, token=host, project=app))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeWebsite && window.TribeSiteDesigner && window.TribeSiteCfg && window.TribePublish", timeout=20000)

            # a designer site for Lantern Bakery, saved the way the designer saves it
            pg.evaluate("""async pid => { const S = TribeSiteCfg; const c = S.fromTemplate(S.TEMPLATES[0], { name: 'Lantern Bakery' });
                await TribeClient.api('/projects/' + pid + '/site-config', { method: 'PUT', body: { config: c, base: 0 } }); }""", site)

            def closeall():
                pg.evaluate("try { TribeSiteDesigner.close() } catch (e) {}; try { TribePreview.close && TribePreview.close() } catch (e) {}; const m = document.querySelector('#invite-modal'); if (m) m.classList.add('hidden')")
                pg.wait_for_timeout(200)
            def website(pid):
                closeall()
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeShell.go('website')"); pg.wait_for_selector("#view-website:not(.hidden) #wb-root", timeout=10000); pg.wait_for_timeout(500)
                return pg.inner_text("#view-website")
            designer_open = "document.body.classList.contains('wdz-open')"
            start_open = "document.body.classList.contains('wdz-open') && document.querySelector('#wdz-start') && !document.querySelector('#wdz-start').hidden && !!document.querySelector('#wdz-start [data-kind]')"
            OLD_BUILDER = ["There is no website yet", "Build the site", "Page text", "Keep it updated automatically", "Start from a template", "website builder"]

            # 1. a designer site: Files › Website shows it, and nothing of the old builder
            t = website(site)
            assert pg.get_attribute("#wb-root", "data-state") == "site", pg.get_attribute("#wb-root", "data-state")
            assert "Lantern Bakery" in t and "Open the designer" in t and "Put it online" in t, t
            for w in OLD_BUILDER: assert w not in t, f"old builder text {w!r} on Files › Website: {t}"
            assert pg.locator("#wb-frame").count() == 1 and len(pg.get_attribute("#wb-frame", "srcdoc") or "") > 200, "a preview of the designer site"
            assert pg.get_attribute("#wb-frame", "sandbox") == "", "the preview runs no scripts"
            pg.wait_for_function("document.querySelector('#wb-versions') && document.querySelector('#wb-versions').textContent.trim().length > 0", timeout=8000)
            assert "There is no website yet" not in pg.inner_text("#wb-versions"), pg.inner_text("#wb-versions")
            pg.screenshot(path="/tmp/website-one-files.png")
            pg.click("#wb-design"); pg.wait_for_function(designer_open, timeout=8000)
            assert pg.evaluate("TribeSiteDesigner.cfg().name") == "Lantern Bakery"

            # 2. no site: one button that starts the designer's kind-first start screen
            t = website(none)
            assert pg.get_attribute("#wb-root", "data-state") == "none"
            assert "Make your website" in t and pg.locator("#view-website button.primary").count() == 1, t
            for w in OLD_BUILDER: assert w not in t, f"{w!r}: {t}"
            pg.click("#wb-design"); pg.wait_for_function(start_open, timeout=8000)

            # 3. an old-builder site: shown read-only with Bring it into the designer; the old data stays
            t = website(old)
            assert pg.get_attribute("#wb-root", "data-state") == "old", t
            assert "your older website" in t.lower() and "Bring it into the designer" in t, t
            for w in ["Build the site", "Page text", "Keep it updated automatically"]: assert w not in t, t
            pg.click("#wb-bring"); pg.wait_for_function(designer_open, timeout=10000)
            pg.wait_for_function(f"TribeClient.api('/projects/{old}/site-config').then(r => window.__oc = r.config)", timeout=5000)
            pg.wait_for_function("window.__oc && window.__oc.pages && window.__oc.pages[0].blocks.length >= 2", timeout=10000)
            assert ok(api(f"/projects/{old}/website", token=host, project=old))["website"]["gen"]["draft"], "the old builder's draft is kept"
            t = website(old)
            assert pg.get_attribute("#wb-root", "data-state") == "site", t

            # 4. every entry point opens the designer (or this page)
            website(none); closeall()
            pg.evaluate("TribeFlint.ask('make a website')"); pg.wait_for_function(designer_open, timeout=10000)
            closeall()
            pg.evaluate("TribePalette.open()"); pg.wait_for_timeout(300)
            pg.keyboard.type("Website templates"); pg.wait_for_timeout(300); pg.keyboard.press("Enter")
            pg.wait_for_function(start_open, timeout=8000)
            closeall()
            pg.evaluate("TribeSiteLib.open()"); pg.wait_for_function(start_open, timeout=8000)
            closeall()
            pg.evaluate("location.hash = '#/docs/website'"); pg.wait_for_selector("#view-website:not(.hidden) #wb-root", timeout=8000)
            assert pg.get_attribute("#wb-root", "data-state") == "none"
            closeall()
            assert pg.locator(".slx--gallery").count() == 0, "the old template gallery never opens"

            # 5. publish labels by what was made
            def published(pid):
                closeall()
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(600)
                pg.evaluate(f"TribePublish.open('{pid}')")
                pg.wait_for_selector("#pb-go", timeout=15000)
                pg.wait_for_function("document.querySelector('#pb-real .pbr, #pb-real:empty') !== null", timeout=15000)
                pg.click("#pb-go")
                pg.wait_for_selector("#pb-down", timeout=15000); pg.wait_for_timeout(300)
                return pg.inner_text(".pb-sub"), pg.get_attribute(".pb-live", "aria-label")
            sub, lab = published(game)
            assert "play link" in sub and lab == "play link", (sub, lab)
            sub, lab = published(app)
            assert "link to try your app" in sub and "play link" not in sub and lab == "link to try your app", (sub, lab)
            sub, lab = published(site)
            assert "link to your site" in sub and "play link" not in sub and lab == "link to your site", (sub, lab)
            pg.screenshot(path="/tmp/website-one-publish.png")
            closeall()
            t = website(site)
            pg.wait_for_selector("#wb-link", timeout=8000)
            assert pg.inner_text("#wb-put") == "Update it", pg.inner_text("#wb-put")

            # 6. 390 px: fits, 40 px buttons
            ph = b.new_page(viewport={"width": 390, "height": 844}); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            ph.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeWebsite", timeout=20000)
            for pid in (site, old, none):
                ph.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); ph.wait_for_timeout(700)
                ph.evaluate("TribeShell.go('website')"); ph.wait_for_selector("#view-website:not(.hidden) #wb-root", timeout=10000); ph.wait_for_timeout(500)
                m = ph.evaluate("""() => { const v = document.querySelector('#view-website'), r = document.querySelector('#wb-root');
                    const bs = [...r.querySelectorAll('button.btn')].filter(x => x.getClientRects().length).map(x => x.getBoundingClientRect());
                    return { over: Math.round(r.getBoundingClientRect().right) - innerWidth, wide: r.scrollWidth - r.clientWidth, small: bs.filter(x => x.height < 40).length, n: bs.length }; }""")
                assert m["over"] <= 1 and m["wide"] <= 1 and m["small"] == 0 and m["n"] >= 1, (pid, m)
            ph.screenshot(path="/tmp/website-one-phone.png")
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("e2e_website_one: ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
