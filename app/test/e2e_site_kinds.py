"""The website start screen (p5-start: app/ui/sitedesigner.js showStart, designflow-data.js SITE_KINDS, sitecfg.js 'go').
Checks:
 1 starting a website asks what kind of site first: Link in bio and App or project page as the two main cards (with a
   drawing and how many templates each has, at least 8), then a quiet row (Business or shop, Portfolio, Event, Blog or
   notes, Blank), See all templates and Import HTML;
 2 a kind shows only its templates, the best first, at most 12; See all shows every template with the categories;
   All kinds goes back; search stays inside the kind;
 3 App or project page: GitHub project first and Send people to my app in the list; picking one fills the project's name
   with a dismissable note, and the GitHub placeholders stay clear when the project has no GitHub address;
 4 one gallery: Design > Website opens this same screen; the older "Website templates" opens it too; no Plan chip, dock
   or checklist appears anywhere;
 5 More > Templates over a site shows the kinds with Keep my design, which keeps it; Blank over a site asks first;
 6 Flint with no AI: "make a website" opens the kinds; "make a page for my app" opens App or project page; "send people
   to my app" (after asking, since a site is there) starts the page that sends visitors on, and "make a redirect to
   <address>" sets where; the exported page moves on by itself and the editor's preview never does;
 7 a 390px phone: the kinds fit with no sideways scroll and 40px targets; Spanish shows the screen in Spanish.
No console errors. --shots DIR saves site-kinds-*.png.
Usage: TRIBE_PORT_OFFSET=62 python3 app/test/e2e_site_kinds.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6640 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] in (200, 202), f"{what}: {r}"
    return r[1]


def shot(pg, name):
    if SHOTS:
        pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        pg.screenshot(path=str(Path(SHOTS) / name))


def kinds_shown(pg):
    pg.wait_for_selector("#wdz-start:not([hidden]) .wdz-kmain .wdz-kind", timeout=15000)


def gallery_ids(pg):
    pg.wait_for_selector("#wdz-gal .wdz-tpl", timeout=15000)
    return pg.eval_on_selector_all("#wdz-gal .wdz-tpl", "els => els.map(e => e.dataset.tpl)")


def flint(pg, text):
    """Flint answers in the designer; the answer must come back (no hang), within 10 seconds."""
    r = pg.evaluate("t => Promise.race([TribeSiteDesigner.ask(t).then(x => ({ ok: true, x })), new Promise(res => setTimeout(() => res({ ok: false }), 10000))])", text)
    assert r["ok"], f"Flint never answered {text!r}"
    return r["x"]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sk-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Tidepool"}, token=host)); pid = (p.get("project") or p)["id"]
        cat = json.loads((ROOT / "app" / "ui" / "sitetpl" / "catalog.json").read_text())["templates"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1440, h=900, phone=False, lang=""):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, theme: 'dark', tour: {done: true}, checklist: {setup: true}%s, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (f", lang: '{lang}'" if lang else "", BASE, host)
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=1)
                c.add_init_script(init); c.set_default_timeout(20000); pg = c.new_page()
                pg.on("pageerror", lambda e: errors.append(f"{e} {(e.stack or '')[:300]}"))
                pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeSiteDesigner && window.TribeDesignData && window.TribeUI", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(400)
                return pg

            pg = page()
            # 1 kinds first
            pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); kinds_shown(pg)
            main_k = pg.eval_on_selector_all("#wdz-start .wdz-kmain .wdz-kind", "els => els.map(e => [e.dataset.kind, e.querySelector('b').textContent, !!e.querySelector('svg'), e.querySelector('.wdz-kn').textContent])")
            assert [k[0] for k in main_k] == ["linkbio", "app"] and main_k[0][1] == "Link in bio" and main_k[1][1] == "App or project page", main_k
            assert all(k[2] for k in main_k) and all(int(k[3].split()[0]) >= 8 for k in main_k), main_k
            more = pg.eval_on_selector_all("#wdz-start .wdz-kmore .wdz-kind", "els => els.map(e => e.dataset.kind)")
            assert more == ["business", "portfolio", "event", "blog", "blank"], more
            assert pg.locator("#wdz-start [data-kind='all']").is_visible() and pg.locator("#wdz-start [data-import]").is_visible()
            assert "Plan" not in pg.inner_text("#wdz .wdz-top") and pg.locator("#dfl-chip:visible, #dfl-dock:visible").count() == 0, "no plan anywhere"
            shot(pg, "site-kinds-1440.png")

            print("step", '2 a kind', flush=True)
            # 2 a kind's templates, best first, at most 12; See all; All kinds; search inside the kind
            pg.click("#wdz-start .wdz-kmain [data-kind='linkbio']")
            ids = gallery_ids(pg)
            lb = [t["id"] for t in cat if t["kind"] == "linkbio"]
            assert ids[0] == "linkbio" and 8 <= len(ids) <= 12 and set(ids) <= set(lb), ids
            assert pg.locator("#wdz-gcats").is_hidden(), "no category chips inside a kind"
            pg.fill("#wdz-gq", "dev"); pg.wait_for_timeout(150)
            assert gallery_ids(pg) == ["lb-dev"], gallery_ids(pg)
            pg.fill("#wdz-gq", "")
            shot(pg, "site-kinds-linkbio-1440.png")
            pg.click("#wdz-start .wdz-row [data-kind='all']"); pg.wait_for_selector("#wdz-gcats:not([hidden]) .wdz-chip")
            assert len(gallery_ids(pg)) == len(cat), (len(gallery_ids(pg)), len(cat))
            pg.click("#wdz-start .wdz-kback"); kinds_shown(pg)

            print("step", '3 App or p', flush=True)
            # 3 App or project page
            pg.click("#wdz-start .wdz-kmain [data-kind='app']")
            ids = gallery_ids(pg)
            assert ids[0] == "gh-project" and "app-redirect" in ids and "app-download" in ids and len(ids) <= 12, ids
            shot(pg, "site-kinds-app-1440.png")
            pg.click("#wdz-gal .wdz-tpl[data-tpl='gh-project'] [data-tpl]")
            pg.wait_for_selector("#wdz-start", state="hidden", timeout=15000)
            pg.wait_for_function("TribeSiteDesigner.cfg().template === 'gh-project'", timeout=15000)
            c = pg.evaluate("TribeSiteDesigner.cfg()")
            assert c["name"] == "Tidepool", c["name"]
            hero = c["pages"][0]["blocks"][0]["props"]
            assert "github.com/you/your-project" in hero["buttons"][1]["link"]["to"], "a clear placeholder with no GitHub address known"
            pg.wait_for_selector("#wdz-fill:not([hidden])", timeout=5000)
            note = pg.inner_text("#wdz-fill"); assert "Filled in from your project" in note and "the name" in note, note
            pg.click("#wdz-fill [data-fill='ok']"); pg.wait_for_selector("#wdz-fill", state="hidden")

            print("step", '5 start ov', flush=True)
            # 5 start over: kinds with Keep my design; Blank over a site asks first
            pg.evaluate("void TribeSiteDesigner.flush()"); pg.wait_for_timeout(300)
            pg.click("#wdz [data-wdz='more']"); pg.wait_for_selector("#wdz-more:not([hidden])")
            pg.click("#wdz-more [data-wdz='templates']"); kinds_shown(pg)
            assert pg.locator("#wdz-start [data-start='blank']").inner_text().strip() == "Keep my design"
            pg.click("#wdz-start [data-start='blank']"); pg.wait_for_selector("#wdz-start", state="hidden")
            assert pg.evaluate("TribeSiteDesigner.cfg().template") == "gh-project", "kept"
            pg.click("#wdz [data-wdz='more']"); pg.click("#wdz-more [data-wdz='templates']"); kinds_shown(pg)
            pg.click("#wdz-start [data-kind='blank']"); pg.wait_for_selector("#wdz-keep", timeout=5000)
            pg.click("#wdz-keep"); pg.wait_for_timeout(200)
            assert pg.evaluate("TribeSiteDesigner.cfg().template") == "gh-project", "Keep my site keeps it"
            pg.click("#wdz-start [data-start='blank']"); pg.wait_for_selector("#wdz-start", state="hidden")

            print("step", '6 Flint', flush=True)
            # 6 Flint, no AI
            flint(pg, "make a website"); kinds_shown(pg)
            pg.click("#wdz-start [data-start='blank']"); pg.wait_for_selector("#wdz-start", state="hidden")
            flint(pg, "make a page for my app"); pg.wait_for_selector("#wdz-start:not([hidden]) #wdz-gal .wdz-tpl[data-tpl='gh-project']", timeout=15000)
            pg.click("#wdz-start [data-start='blank']"); pg.wait_for_selector("#wdz-start", state="hidden")
            pg.evaluate("void TribeSiteDesigner.ask('send people to my app')"); pg.wait_for_selector("#wdz-over", timeout=10000)
            pg.click("#wdz-over")
            pg.wait_for_function("TribeSiteDesigner.cfg().template === 'app-redirect'", timeout=15000)
            flint(pg, "make a redirect to https://example.com/get-tidepool")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.type === 'go' && b.props.to === 'https://example.com/get-tidepool')", timeout=15000)
            out = pg.evaluate("(() => { const c = TribeSiteDesigner.cfg(); return { zip: TribeSiteCfg.exportFiles(c, 'zip').files['index.html'], one: TribeSiteCfg.exportFiles(c, 'single')['index.html'], edit: TribeSiteCfg.render(c, { edit: true, mode: 'single' }) }; })()")
            assert '<meta http-equiv="refresh" content="4;url=https://example.com/get-tidepool">' in out["zip"] and 'http-equiv="refresh"' in out["one"], "the exported page moves on"
            assert "http-equiv" not in out["edit"], "the editor never moves on"
            assert "Taking you to <b>example.com</b>" in out["zip"] and 'href="https://example.com/get-tidepool"' in out["zip"], "the destination is shown with a button"
            assert "http-equiv" not in pg.evaluate("document.querySelector('#wdz-frame').srcdoc || ''")
            bad = pg.evaluate("TribeSiteCfg.normalize({ v: 1, name: 'x', pages: [{ title: 'Home', blocks: [{ type: 'go', props: { to: 'javascript:alert(1)', wait: 0 } }] }] }).pages[0].blocks[0].props")
            assert bad["to"] == "" and bad["wait"] == "2", bad
            shot(pg, "site-kinds-redirect-1440.png")

            print("step", '4 one gall', flush=True)
            # 4 one gallery: Design > Website and the older Website templates open this screen; no plan
            pg.evaluate("TribeSiteDesigner.close()"); pg.wait_for_selector("#wdz", state="hidden")
            pg.evaluate("TribeSiteLib.open()"); kinds_shown(pg)
            assert pg.locator(".slx-win").count() == 0, "the older gallery stays closed"
            pg.evaluate("TribeSiteDesigner.close()"); pg.wait_for_selector("#wdz", state="hidden")
            pg.evaluate("TribeDesignFlow.gallery('website')"); kinds_shown(pg)
            pg.wait_for_timeout(600)
            assert pg.locator("#dfl-chip:visible, #dfl-dock:visible, .dfl-plan-host").count() == 0, "no plan anywhere"
            pg.evaluate("TribeSiteDesigner.close()")

            print("step", '7 a phone', flush=True)
            # 7 a phone, and Spanish
            ph = page(390, 844, phone=True)
            ph.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', start: true }})"); kinds_shown(ph)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            small = ph.evaluate("[...document.querySelectorAll('#wdz-start button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).map(b => b.textContent.trim().slice(0, 24) + ' ' + Math.round(b.getBoundingClientRect().height) + ' ' + getComputedStyle(b).minHeight + ' ' + innerWidth)")
            assert not small, small
            wide = ph.evaluate("[...document.querySelectorAll('#wdz-start *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1).length")
            assert wide == 0, wide
            shot(ph, "site-kinds-390.png")
            ph.click("#wdz-start .wdz-kmain [data-kind='app']"); gallery_ids(ph)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            shot(ph, "site-kinds-app-390.png")
            es = page(lang="es")
            es.evaluate("TribeI18n && TribeI18n.set && TribeI18n.set('es')")
            es.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', start: true }})"); kinds_shown(es)
            t = es.inner_text("#wdz-start")
            assert "¿Qué tipo de sitio?" in t and "Enlace en la bio" in t, t[:300]
            shot(es, "site-kinds-es-1440.png")
            b.close()
        assert not errors, errors
        print("e2e_site_kinds: OK (kinds first, a kind's templates best first, See all, one gallery, no plan, keep or start over, Flint: make a website / a page for my app / send people to my app, redirect only in exports, phone, Spanish)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=10)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
