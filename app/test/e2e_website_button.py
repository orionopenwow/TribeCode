"""The Website button finds a website the team already started (feat/tasks-company, server/showcase.js started()).
A built page in the repo's site/, a site someone made in the repo (website/), a site-builder draft (.tribe/website) or
builder settings with nothing built: the API says so (website.started), Files › Website says where it is with a way
to open it, and the preview's Website source shows the page (or "Your team started the website"), never the empty
"Make the project's website" card. A project with nothing started still gets that card. No project: a clear next step.
Usage: python app/test/e2e_website_button.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6314 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
EMPTY = "Design the project's website"

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

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-wbb-", dir="/tmp"))
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
        built = mk("Lantern Site", path=repo(tmp, "built", {"site/index.html": "<!doctype html><title>Lantern</title><h1>Lantern Run: the site</h1>", "README.md": "x"}))
        inrepo = mk("Moth Shop", path=repo(tmp, "inrepo", {"website/index.html": "<!doctype html><h1>Moth Shop</h1>", "README.md": "x"}))
        draft = mk("Ember Cafe", bio="A small cafe")
        ok(api(f"/projects/{draft}/website/instant", "POST", {}, token=host, project=draft))
        cfg = mk("Fern Club")
        ok(api(f"/projects/{cfg}/website", "PUT", {"fields": {"headline": "Fern Club meets Thursdays"}}, token=host, project=cfg))
        none = mk("Blank Slate")

        st = lambda pid: ok(api(f"/projects/{pid}/website", token=host, project=pid))["website"].get("started")
        assert st(built)["kind"] == "built" and st(built)["path"] == "site/index.html", st(built)
        assert st(inrepo)["kind"] == "repo" and st(inrepo)["path"] == "website/index.html", st(inrepo)
        assert st(draft)["kind"] == "draft", st(draft)
        assert st(cfg)["kind"] == "config", st(cfg)
        assert st(none) is None, st(none)

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeWebsite && window.TribePreview", timeout=20000)

            def website(pid):   # the Website button (sidebar / Files tab / Ctrl K all run TribeShell.go('website'))
                pg.evaluate("TribePreview.close && TribePreview.close()")
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeShell.go('website')"); pg.wait_for_selector("#view-website:not(.hidden) #wb-root", timeout=10000); pg.wait_for_timeout(400)
            def preview_site():
                pg.evaluate("TribePreview.open().then(() => TribePreview.setSource('site'))")
                pg.wait_for_function("document.querySelector('#pvw-frame') && (document.querySelector('#pvw-frame iframe') || document.querySelector('#pvw-frame .pvw-empty'))", timeout=10000); pg.wait_for_timeout(500)
                return pg.inner_text("#pvw-frame") if pg.locator("#pvw-frame .pvw-empty").count() else "IFRAME:" + (pg.get_attribute("#pvw-frame iframe", "src") or "")

            # 1. a built page in the repo: the view says where, Show the website opens it
            website(built)
            assert pg.locator("#wb-started:not(.hidden)").is_visible() and "site/index.html" in pg.inner_text("#wb-started")
            pg.click("#wb-st-show")
            pg.wait_for_selector("#pvw-frame iframe", timeout=10000)
            assert "/website/preview" in pg.get_attribute("#pvw-frame iframe", "src")
            fr = pg.frame_locator("#pvw-frame iframe"); fr.locator("h1").wait_for(timeout=8000)
            assert "Lantern Run: the site" in fr.locator("h1").inner_text()
            pg.evaluate("TribePreview.close && TribePreview.close()")
            # 2. a site someone made in the repo's website/ folder
            website(inrepo)
            assert "website/index.html" in pg.inner_text("#wb-started") and pg.locator("#wb-st-code").is_visible()
            t = preview_site(); assert EMPTY not in t and "already started" in t.lower() and "website/index.html" in t, t
            # 3. a builder draft
            website(draft)
            assert pg.locator("#wb-started").is_hidden(), "the draft shows in the builder itself"
            t = preview_site(); assert t.startswith("IFRAME:") and "/website/draft" in t, t
            # 4. builder settings, nothing built yet
            website(cfg)
            t = preview_site(); assert EMPTY not in t and "already started" in t.lower(), t
            pg.click("#pvw-frame [data-act='builder']"); pg.wait_for_selector("#view-website:not(.hidden)", timeout=8000)
            # 5. nothing started: the one-tap card is right
            website(none)
            assert pg.locator("#wb-started").is_hidden()
            t = preview_site(); assert EMPTY in t, t
            pg.evaluate("TribePreview.close && TribePreview.close()")

            # feat/setup-github: the Website tab draws no orange line down the window. The preview card is a hero card;
            # its accent stripe is positioned against the card, so the card must stay positioned at every width.
            for w in (1360, 1100, 900, 390):
                pg.set_viewport_size({"width": w, "height": 900}); website(draft); pg.wait_for_timeout(300)
                r = pg.evaluate("""(() => { const c = document.querySelector('#view-website .wb-preview'), cs = getComputedStyle(c), b = c.getBoundingClientRect();
                    const loose = [...document.querySelectorAll('.hero-card')].filter(e => e.offsetParent && getComputedStyle(e).position === 'static').map(e => e.className);
                    return { pos: cs.position, stripe: getComputedStyle(c, '::before').position, left: Math.round(b.left), loose }; })()""")
                assert r["pos"] in ("relative", "sticky") and r["stripe"] == "absolute" and not r["loose"], (w, r)
                if w > 820: assert r["left"] > 200, (w, r)   # the card (and so its stripe) sits in the page, not at the window's edge
            pg.set_viewport_size({"width": 1360, "height": 900})

            # Files › Websites: the project's website shows as a card with a live preview; none yet: a proper empty state
            def files_sites(pid):
                pg.evaluate("TribePreview.close && TribePreview.close()")
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeApp.show('docs')"); pg.wait_for_selector(".fx-tabs [data-dk='sites']", timeout=10000)
                pg.click(".fx-tabs [data-dk='sites']"); pg.wait_for_timeout(900)
            files_sites(draft)
            pg.wait_for_selector("#fg-site", timeout=8000)
            assert "Ember Cafe" in pg.inner_text("#fg-site-title") and "Last saved" in pg.inner_text("#fg-site-meta") and "Not published yet" in pg.inner_text("#fg-site-meta")
            fr = pg.locator("#fg-site-pv iframe"); assert fr.count() == 1 and "/website/draft" in fr.get_attribute("src") and fr.get_attribute("sandbox") == "", "a live preview, with scripts off"
            assert pg.inner_text("#fg-site-open") == "Open in the website builder" and pg.inner_text("#fg-site-pub") == "Publish"
            assert pg.locator("#fg-empty").count() == 0 and pg.inner_text(".fx-tabs [data-dk='sites'] [data-n]") == "1"
            pg.click(".fx-tabs [data-dk='all']"); pg.wait_for_selector(".fx-card[data-site]", timeout=5000)   # and it is one of the files under All
            pg.click(".fx-tabs [data-dk='sites']"); pg.wait_for_selector("#fg-site")
            pg.click("#fg-site-open"); pg.wait_for_selector("#view-website:not(.hidden) #wb-root", timeout=10000)
            files_sites(built); pg.wait_for_selector("#fg-site", timeout=8000)
            assert "/website/preview" in pg.get_attribute("#fg-site-pv iframe", "src") and "Built" in pg.inner_text("#fg-site-meta")
            files_sites(none); pg.wait_for_selector("#fg-empty", timeout=8000)
            assert pg.locator("#fg-site").count() == 0 and "No websites yet" in pg.inner_text("#fg-empty") and pg.locator("#fg-empty [data-empty-new='site']").count() == 1
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e and "sandboxed" not in e]
        assert not errs, errs
        print("ok e2e_website_button")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
