"""Home parity (feat/files-dash): your Home dashboard does what a tribe does, across your own stuff, and always says
where you are.

With no tribe and then with one: the global rows are Home · Files · Design · Code · Work · Agent fleet; the rail logo is
lit on Home (and not inside a project), the sidebar says "Home · your dashboard", every Home page starts with a
"Home ›" breadcrumb and Home's top card is a band across the whole content area. Every control on every Home page is
clicked (destructive ones skipped) with no page errors and no 5xx. With a tribe: Files' Where filter lists each tribe
and groups by source (sheets and slides from tribes show their real previews), Design shows every canvas with its
shapes, Code lists the repos you're in, Work lists your tasks across tribes, the Agent fleet opens; inside a project,
Files is the same dashboard (tabs with icons, + Create with Doc/Sheet/Slides, ⋯ rename). 390px phones never scroll
sideways. --shots writes docs/screenshots/files-home.png, files-project.png, files-phone.png, home-active.png.
Usage: python app/test/e2e_home_parity.py [--shots]
"""
import functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 4897 + OFF; BASE = f"http://localhost:{PORT}"
STATIC = 5797 + OFF   # no tribe: the app from a plain file server (a TribeCode server would make a tribe on first open)
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
ROWS = ["Home", "Files", "Design", "Code", "Work", "Agent fleet"]
errors, bad = [], []


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: raise AssertionError(f"{method} {path}: {e.code} {e.read()[:200]}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text and errors.append(f"{who} console: {m.text}"))
    page.on("response", lambda r: "/api/" in r.url and r.status >= 500 and bad.append(f"{who} {r.status} {r.url}"))
    page.on("dialog", lambda d: d.dismiss())


def settings(ctx, token=""):
    ctx.add_init_script("try{if(!sessionStorage.getItem('t')){sessionStorage.setItem('t','1');localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Orion',color:'#F26B1D',onboarded:true,theme:'dark',tour:{done:true},server:{url:%s,token:%s}}))}}catch(e){}" % (json.dumps(BASE if token else ""), json.dumps(token)))


def shot(page, name):
    if take: page.wait_for_timeout(500); page.screenshot(path=str(SHOTS / f"{name}.png"))


def crumb(page): return page.evaluate("(() => { const c = [...document.querySelectorAll('.hub-crumb')].find(e => e.offsetParent); return c ? c.textContent.replace(/\\s+/g, '') : ''; })()")


def home_state(page):
    return page.evaluate("""(() => { const l = document.querySelector('#rail-logo'), h = document.querySelector('#nest-home-h'), c = document.querySelector('#crumb-home');
      return { lit: l.classList.contains('on') && l.getAttribute('aria-current') === 'page', head: h ? h.textContent.replace(/\\s+/g, ' ').trim() : '', crumb: !!c && !c.hidden,
        rows: [...document.querySelectorAll('#grp-global .nest-row span')].map(e => e.textContent.trim()) }; })()""")


def hero_full(page):
    return page.evaluate("""(() => { const m = document.querySelector('.window .main') || document.querySelector('.main'), h = document.querySelector('#view-hub .hub-id');
      const mr = m.getBoundingClientRect(), hr = h.getBoundingClientRect(); return { main: mr.width, hero: hr.width, left: hr.left - mr.left }; })()""")


def go(page, key):
    page.evaluate("document.querySelectorAll('.fx-pop,.dc-menu,#note-ed,#lf-pane,#fv,.lf-float,.mk-detail-wrap').forEach(x => x.remove())")
    page.evaluate(f"TribeShell.go({json.dumps(key)})"); page.wait_for_timeout(900)


def click_all(page, key, who):
    """Click every visible button on a Home page (skipping destructive ones); come back after each."""
    go(page, key)
    view = page.evaluate("document.body.dataset.view"); sel = "#view-hub" if view == "hub" else f"#view-{view}"
    n = page.evaluate(f"document.querySelectorAll('{sel} button:not([disabled])').length")
    for i in range(min(n, 40)):
        t = page.evaluate(f"""(() => {{ const b = [...document.querySelectorAll('{sel} button:not([disabled])')][{i}]; if (!b || !b.offsetParent) return null;
            const t = (b.id || '') + '|' + (b.textContent || '').trim().slice(0, 30); if (/delete|log ?out|remove|clear|dismiss|leave|reset|copy a link|invite|instant|tour|watch|see how|demo/i.test(t)) return null; b.click(); return t; }})()""")
        if not t: continue
        page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(120)
        page.evaluate("document.querySelectorAll('.fx-pop,.dc-menu,#note-ed,#lf-pane,#fv,.lf-float,.dc-sheet-wrap,.mk-detail-wrap,.pj-sheet-wrap').forEach(x => x.remove())")
        if page.evaluate("document.body.dataset.view") != view or page.evaluate("document.body.classList.contains('ws-open')"):
            page.evaluate("window.TribeWorkshop && TribeWorkshop.close && TribeWorkshop.close()"); go(page, key)
    assert not errors, (who, key, errors)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-parity-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="parity-src-", dir="/tmp")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True)
    repo = os.path.join(work, "lantern"); sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "glow.js").write_text("export const glow = 1\n"); sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=o@x", "-c", "user.name=Orion", "commit", "-q", "-m", "Light the lantern")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Lantern Crew"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ================= no tribe =================
            ctx = b.new_context(viewport={"width": 1600, "height": 900}); settings(ctx)
            pg = ctx.new_page(); watch(pg, "solo")
            fs = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC), functools.partial(Quiet, directory=str(ROOT / "app" / "ui"))); threading.Thread(target=fs.serve_forever, daemon=True).start()
            pg.goto(f"http://localhost:{STATIC}/?skipIntro=1#/hub"); pg.wait_for_function("window.TribeHub && window.TribeRouter && document.querySelector('#view-hub .hub-id')", timeout=20000); pg.wait_for_timeout(600)
            assert not pg.evaluate("TribeClient.hasToken()")
            st = home_state(pg)
            assert st["lit"] and st["head"] == "Home · your dashboard" and st["rows"] == ROWS, st
            assert crumb(pg).startswith("Home›Yourdashboard"), crumb(pg)
            hf = hero_full(pg); assert hf["hero"] >= hf["main"] - 2 and abs(hf["left"]) <= 1, ("the Home band goes across", hf)
            for key, want in (("docs-all", "Home›Files"), ("design-all", "Home›Design"), ("repos-all", "Home›Code")):
                go(pg, key); assert crumb(pg) == want, (key, crumb(pg)); assert home_state(pg)["lit"], key
            go(pg, "design-all"); pg.wait_for_selector("#hd-empty [data-empty-new]"); pg.click("#hd-empty [data-empty-new]"); pg.wait_for_selector("#lf-float", timeout=8000)
            go(pg, "design-all"); pg.wait_for_selector("#hub-design .fx-card[data-cat=designs] svg, #hub-design .fx-card[data-cat=designs] .fx-th-canvas")
            go(pg, "repos-all"); pg.wait_for_selector("#hub-repos .hub-notribe [data-nt=start]"); pg.wait_for_selector("#hc-empty [data-empty-new=code]")
            go(pg, "work"); assert pg.evaluate("document.body.dataset.view") == "work" and home_state(pg)["lit"]
            go(pg, "fleet"); assert pg.evaluate("document.body.dataset.view") == "agents-hub" and home_state(pg)["lit"]
            for key in ("hub", "docs-all", "design-all", "repos-all", "work", "fleet"): click_all(pg, key, "solo")
            ctx.close(); fs.shutdown()

            # ================= with a tribe =================
            boot = api("/bootstrap", "POST", {"name": "Orion"}); tok, me = boot["token"], boot["member"]["id"]
            lan = api("/projects", "POST", {"path": repo}, token=tok)["project"]["id"]
            sk = api("/projects", "POST", {"name": "Sketches"}, token=tok)["project"]["id"]
            api("/docs", "POST", {"title": "Lantern lore", "body": "# Lantern lore\nThe lanterns remember every traveller.\n- Moths\n- Wicks"}, token=tok, project=lan)
            api("/docs", "POST", {"title": "Budget", "kind": "sheet", "body": "| Item | Cost |\n| --- | --- |\n| Wicks | 4 |\n| Oil | 6 |\n"}, token=tok, project=lan)
            api("/docs", "POST", {"title": "Pitch", "kind": "deck", "body": "<!-- theme: campfire -->\n\n# Lantern Run\n\nA cozy game\n\n---\n\n## Why\n\n- fun\n"}, token=tok, project=sk)
            cv = api("/canvas", "POST", {"name": "Title screen"}, token=tok, project=sk)["file"]["id"]
            api(f"/canvas/{cv}/ops", "POST", {"ops": [{"id": "frame1", "t": "frame", "p": "", "i": 1, "v": 1, "x": 0, "y": 0, "w": 390, "h": 800, "fill": "#FBF7F2", "name": "Screen"}]}, token=tok, project=sk)
            api("/tasks", "POST", {"title": "Ink the moon", "assignee": me, "status": "doing"}, token=tok, project=sk)

            ctx = b.new_context(viewport={"width": 1600, "height": 900}, accept_downloads=True); settings(ctx, tok)
            pg = ctx.new_page(); watch(pg, "host")
            pg.goto(BASE + "/?skipIntro=1#/hub"); pg.wait_for_function("TribeClient.connected() && document.querySelector('#view-hub .hub-id')", timeout=20000); pg.wait_for_timeout(1200)
            st = home_state(pg); assert st["lit"] and st["head"] == "Home · your dashboard" and st["rows"] == ROWS, st
            hf = hero_full(pg); assert hf["hero"] >= hf["main"] - 2, hf
            shot(pg, "home-active")
            # Files: Where lists each tribe, groups by source, real previews from tribes
            go(pg, "docs-all"); pg.wait_for_function("document.querySelectorAll('#hub-docs .fx-card[data-gdoc]').length === 3", timeout=10000)
            assert pg.eval_on_selector_all("#dc-where option", "o => o.map(x => x.textContent)") == ["Mine", "Everything", "lantern", "Sketches"] or \
                pg.eval_on_selector_all("#dc-where option", "o => o.map(x => x.textContent)")[:2] == ["Mine", "Everything"]
            heads = pg.eval_on_selector_all("#hub-docs .fx-gh h2", "e => e.map(x => x.textContent)")
            assert any(h.startswith("Yours in ") for h in heads), heads
            assert pg.locator("#hub-docs .fx-card[data-cat=sheets] .fg-th-sheet").count() == 1 and "Wicks" in pg.inner_text("#hub-docs .fx-card[data-cat=sheets] .fg-th-sheet")
            assert pg.locator("#hub-docs .fx-card[data-cat=slides] .fx-th").count() == 1
            assert "Empty" not in pg.inner_text("#hub-docs")
            pg.select_option("#dc-where", "all"); pg.wait_for_timeout(300); shot(pg, "files-home")
            pg.select_option("#dc-where", sk); pg.wait_for_function("[...document.querySelectorAll('#hub-docs .fx-card')].every(c => c.querySelector('.fx-loc').textContent.includes('Sketches'))")
            assert pg.locator("#hub-docs .fx-card[data-cat=designs]").count() == 1, "the canvas is a Sketches file"
            pg.select_option("#dc-where", "all")
            # ⋯ rename on a tribe doc goes to the server
            pg.click("#hub-docs .fx-card[title='Lantern lore'] .fx-more"); pg.click("#fx-more-menu [data-act=rename]"); pg.fill("#fx-rename", "Lantern lore 2"); pg.keyboard.press("Enter")
            for _ in range(50):
                if any(d["title"] == "Lantern lore 2" for d in api("/docs", token=tok, project=lan)["docs"]): break
                time.sleep(0.1)
            else: raise AssertionError("rename reached the server")
            with pg.expect_download() as dl:
                pg.click("#hub-docs .fx-card[data-cat=sheets] .fx-more"); pg.click("#fx-more-menu [data-act=download]")
            assert "Wicks" in Path(dl.value.path()).read_text()
            # Design: every canvas, with its shapes
            go(pg, "design-all"); pg.wait_for_selector("#hub-design .fx-card[title='Title screen'] svg rect", timeout=10000)
            # Code: the repos you're in
            go(pg, "repos-all"); pg.wait_for_selector(f"#hub-repos [data-repo='{lan}']", timeout=10000)
            # Work: your tasks across tribes
            go(pg, "work"); pg.wait_for_selector("#hub-mytasks .hmt-row", timeout=10000); assert "Ink the moon" in pg.inner_text("#hub-mytasks")
            assert crumb(pg) == "Home›Work"
            go(pg, "fleet"); pg.wait_for_selector("#view-agents-hub > .hub-crumb", timeout=8000)
            for key in ("hub", "docs-all", "design-all", "repos-all", "work", "fleet"): click_all(pg, key, "host")

            # inside a project: the same Files dashboard; Home is not lit there
            pg.evaluate(f"TribeProjects.switchTo({json.dumps(lan)}).then(() => TribeApp.show('docs'))"); pg.wait_for_selector("#fg-items .fg-card", timeout=15000)
            st = home_state(pg); assert not st["lit"] and not st["crumb"], st
            assert pg.eval_on_selector_all("#view-tabs [data-tab]", "e => e.every(x => x.querySelector('svg.fx-i'))"), "project Files tabs have icons"
            assert pg.eval_on_selector_all(".fx-tabs [data-dk]", "e => e.length") == 11
            assert pg.locator(".fg-card[data-type='sheet'] .fg-th-sheet").count() == 1
            pg.click("#fg-new-menu"); pg.wait_for_selector("#fg-newmenu #doc-first"); assert pg.locator("#fg-newmenu #fg-new-sheet").is_visible() and pg.locator("#fg-newmenu #fg-new-deck").is_visible() and pg.locator("#fg-newmenu #fg-assets").is_visible()
            pg.keyboard.press("Escape")
            shot(pg, "files-project")
            pg.click("#rail-logo"); pg.wait_for_function("document.querySelector('#rail-logo').classList.contains('on')", timeout=5000)
            assert pg.evaluate("document.body.dataset.view") == "hub"
            ctx.close()

            # phones: no sideways scroll on Home, Files, Design, Code
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); settings(ph, tok)
            pp = ph.new_page(); watch(pp, "phone")
            pp.goto(BASE + "/?skipIntro=1#/hub"); pp.wait_for_function("TribeClient.connected() && document.querySelector('#view-hub .hub-id')", timeout=20000); pp.wait_for_timeout(800)
            for h in ("#/hub", "#/hub/docs", "#/hub/design", "#/hub/repos"):
                pp.evaluate(f"location.hash = {json.dumps(h)}"); pp.wait_for_timeout(1200)
                w = pp.evaluate("document.documentElement.scrollWidth"); assert w <= 390, (h, w)
                if h == "#/hub/docs": shot(pp, "files-phone")
            ph.close()
            b.close()
    finally:
        srv.terminate()
    assert not errors, errors
    assert not bad, bad
    print("e2e_home_parity: OK")


if __name__ == "__main__":
    main()
