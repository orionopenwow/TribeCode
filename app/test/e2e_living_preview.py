"""Living preview (app/ui/dashband.js, server/dashband.js, app/ui/phonelocal.js, app/ui/homehub.js).

The dashboard's preview band, for a tribe on a server and for one that lives in this browser:
 (a) a project with only a sentence gets a sketch of what the sentence describes (a phone frame with a Leaderboard
     tab for "a running club app with a leaderboard", a page mock with its sections for a website sentence, a game
     frame for a game), labelled "A sketch from your sentence"; "Make it real" runs the existing first-version path.
     With no sentence the calm card asks for one and its button opens the one-line editor under the project's name.
 (b) a project with only an app shows the app and no tab row.
 (c) an app and a website: tabs (App | Website), the app first. A tab swaps the picture and the actions in place, is
     remembered after a reload, and works with the arrow keys. "Online" only shows for a website that is really online.
 (d) a website only: the website, no tab row.
 (e) the same in a tribe that lives in this browser (no server, no AI).
 (f) 390px: 40px tab targets, no sideways scroll.
Home's card per project shows the same thing as the dashboard.
--shots writes /tmp/living-preview-sketch.png, -tabs.png (1440) and -phone.png (390).
Usage: python app/test/e2e_living_preview.py [--shots]
"""
import functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6951 + OFF; BASE = f"http://localhost:{PORT}"
STATIC = 6952 + OFF
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors, bad = [], []
RUN = "a running club app with a leaderboard"
BAKE = "A website for Sunrise Bakery with a menu, a gallery and what people say"


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: raise AssertionError(f"{method} {path}: {e.code} {e.read()[:300]}")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("response", lambda r: "/api/" in r.url and r.status >= 500 and bad.append(f"{who} {r.status} {r.url}"))
    page.on("dialog", lambda d: d.dismiss())


def open_page(b, token, name, w=1440, h=900):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500)
    ctx.add_init_script("try{if(!sessionStorage.getItem('t')){sessionStorage.setItem('t','1');localStorage.setItem('tribecode.helpers.v1',JSON.stringify({flint:1,brain:1,ai:1}));localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:%s,color:'#F26B1D',onboarded:true,theme:'dark',tour:{done:true},server:{url:%s,token:%s}}))}}catch(e){}" % (json.dumps(name), json.dumps(BASE), json.dumps(token)))
    pg = ctx.new_page(); watch(pg, name)
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeDashBand && window.TribeFirstLook && TribeProjects.list().length > 1", timeout=30000)
    return pg


def until(pg, js, timeout=20, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError(f"timed out: {what or js}")


def dash(pg, pid):
    pg.evaluate("document.querySelectorAll('.pvw,#sd,.db-menu').forEach(x => x.remove())")
    pg.evaluate(f"TribeProjects.switchTo({json.dumps(pid)}, 'home')")
    pg.wait_for_function(f"(() => {{ const b = document.querySelector('#pj-band-slot .db-band'); return b && (b.dataset.pid === {json.dumps(pid)} || (b.dataset.pick === 'none' && TribeProjects.cur() && TribeProjects.cur().id === {json.dumps(pid)} && TribeDashBand.state().project && TribeDashBand.state().project.project.id === {json.dumps(pid)})); }})()", timeout=20000)
    pg.wait_for_timeout(350)


BAND = "#pj-band-slot .db-band"
pick = lambda pg: pg.evaluate(f"document.querySelector('{BAND}').dataset.pick")
tabs = lambda pg: pg.eval_on_selector_all(f"{BAND} [role=tablist] [role=tab]", "els => els.map(e => e.textContent.trim())")
acts = lambda pg: " ".join(pg.eval_on_selector_all(f"{BAND} .db-acts [data-db]", "els => els.map(e => e.title || e.textContent)"))   # p12: Change it names its tool in the tooltip
no_side_scroll = lambda pg: pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


def server_tribe(p):
    tmp = tempfile.mkdtemp(prefix="tribe-living-", dir="/tmp")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Launch Crew", "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"})
    try:
        for _ in range(160):
            try:
                if api("/health"): break
            except Exception: time.sleep(0.25)
        tok = api("/bootstrap", "POST", {"name": "Orion"})["token"]
        mk = lambda name: api("/projects", "POST", {"name": name}, token=tok)["project"]["id"]
        runners, bakery, jumper, blank, apponly, both, siteonly = (mk(n) for n in ("Night Runners", "Sunrise Bakery", "Sky Jumper", "Blank", "Habit Buddy", "Trail Mates", "Corner Cafe"))
        api("/vision", "PUT", {"text": f"# Night Runners\n\n{RUN}\n\n## Done for now\n\nA first version.\n"}, token=tok, project=runners)
        api("/vision", "PUT", {"text": f"# Sunrise Bakery\n\n{BAKE}\n"}, token=tok, project=bakery)
        api("/vision", "PUT", {"text": "# Sky Jumper\n\nA platformer game where a fox jumps over clouds\n"}, token=tok, project=jumper)
        site = lambda pid, title: api(f"/projects/{pid}/site-config", "PUT", {"config": {"pages": [{"blocks": [{"type": "hero", "props": {"title": title, "subtitle": "Open every day"}}]}]}, "force": True}, token=tok, project=pid)
        site(both, "Trail Mates online"); site(siteonly, "Corner Cafe")

        # the server: nothing made + a sentence -> pick none with the sentence (its opening lines only); no sentence -> ''
        bd = api("/dash/band", token=tok, project=runners)["band"]
        assert bd["pick"] == "none" and bd["vision"] == RUN, bd
        assert api("/dash/band", token=tok, project=blank)["band"]["vision"] == "", "no sentence, nothing to sketch"

        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        pg = open_page(b, tok, "Orion")
        # apps are made with App Creator's own templates (no AI)
        for pid, tpl, name in ((apponly, "habits", "Habit Buddy"), (both, "running", "Trail Mates")):
            pg.evaluate("([pid, tpl, name]) => TribeClient.api(`/projects/${pid}/app-config`, { method: 'PUT', project: pid, body: { config: TribeAppCore.template(tpl, { name }) } })", [pid, tpl, name])
        order = api("/dash/band", token=tok, project=both)["band"]
        assert order["pick"] == "phone" and order["has"]["site"] and order["site"]["online"] is False, ("the main app first; not online", order["pick"], order["site"])

        # ---- (a) a sentence only: the sketch
        dash(pg, runners)
        assert pick(pg) == "sketch" and pg.get_attribute(BAND, "data-kind") == "app", (pick(pg), pg.get_attribute(BAND, "data-kind"))
        txt = pg.inner_text(BAND)
        assert "A SKETCH FROM YOUR SENTENCE" in txt.upper() and RUN in txt and "Make it real" in txt and "Nothing is made yet" in txt, txt
        assert "Leaderboard" in pg.inner_text(f"{BAND} .db-sk-chips") and "running club" in pg.inner_text(f"{BAND} .db-sk-chips"), pg.inner_text(f"{BAND} .db-sk-chips")
        phone = pg.inner_text(f"{BAND} .db-phone")
        assert "NIGHT RUNNERS" in phone.upper() and "Leaderboard" in phone and "km" in phone.lower() and "run" in phone.lower(), phone
        assert "## Done" not in txt and "A first version." not in txt, "only the opening lines"
        assert pg.locator(f"{BAND} iframe, {BAND} [role=tablist]").count() == 0, "a picture: nothing runs, no tabs"
        assert pg.locator(f"{BAND} [data-db=make-real]").count() == 1 and pg.locator(f"{BAND} .btn.primary").count() == 1, "one clear button"
        if take: pg.wait_for_timeout(500); pg.screenshot(path="/tmp/living-preview-sketch.png")
        # a website sentence: a page mock with its headline and sections
        dash(pg, bakery)
        assert pick(pg) == "sketch" and pg.get_attribute(BAND, "data-kind") == "site"
        mock = pg.inner_text(f"{BAND} .db-site")
        assert "Sunrise Bakery" in mock and pg.locator(f"{BAND} .db-site-cols small").count() >= 2, mock
        assert "WEBSITE" in pg.inner_text(f"{BAND} .db-sk-chips").upper()
        # a game sentence: a game frame with the project's name
        dash(pg, jumper)
        assert pg.get_attribute(BAND, "data-kind") == "game" and "Sky Jumper" in pg.inner_text(f"{BAND} .db-game")
        # no sentence: the calm card asks for it, and its button opens the one line under the name (no second box)
        dash(pg, blank)
        assert pick(pg) == "none" and "Set up your preview" in pg.inner_text(BAND) and "one sentence" in pg.inner_text(BAND)
        pg.click(f"{BAND} [data-db=say]")
        pg.wait_for_selector("#pj-vis-in", timeout=8000)
        assert pg.locator("textarea[id*=vis]").count() == 1, "one vision editor"
        pg.fill("#pj-vis-in", "A recipe app for my family with favourites"); pg.click("#pj-vis-save")
        pg.wait_for_function(f"(() => {{ const b = document.querySelector('{BAND}'); return b && b.dataset.pick === 'sketch' && b.dataset.kind === 'app'; }})()", timeout=15000)
        assert "A recipe app for my family with favourites" in pg.inner_text(BAND), "the sentence just written is sketched"
        # Home's card says the same thing as the dashboard
        pg.evaluate("TribeHub.open('home')")
        card = f"#hh-strip .hh-card[data-hh-pid={json.dumps(runners)}]"
        pg.wait_for_function(f"!!document.querySelector({json.dumps(card + ' .hh-pic .db-phone')})", timeout=20000)
        assert "Sketch from your sentence" in pg.inner_text(card) and "See the sketch" in pg.inner_text(card), pg.inner_text(card)
        both_card = f"#hh-strip .hh-card[data-hh-pid={json.dumps(both)}]"
        pg.evaluate(f"document.querySelector({json.dumps(both_card)}).scrollIntoView()")   # cards load as they come into view
        pg.wait_for_function(f"!!document.querySelector({json.dumps(both_card + ' .hh-pic .db-phone')})", timeout=20000)
        assert pg.locator(both_card + " .db-site").count() == 0, "Home shows the main app first too"
        # Make it real: the existing first-version path, and then the band shows the real thing
        dash(pg, runners)
        pg.click(f"{BAND} [data-db=make-real]")
        pg.wait_for_selector("#fpv .fpv-acts", timeout=40000)
        st = pg.evaluate("(() => { const s = TribeFirstLook.state(); return { pid: s.pid, kind: s.kind, saved: s.saved, idea: s.idea }; })()")
        assert st == {"pid": runners, "kind": "app", "saved": True, "idea": RUN}, st
        cfg = api(f"/projects/{runners}/app-config", token=tok, project=runners)["config"]
        assert cfg and any("Leaderboard" in s["name"] for s in cfg["screens"]), "the real app has what the sketch showed"
        pg.click("#fpv [data-fpv=close]")
        pg.wait_for_function(f"(() => {{ const b = document.querySelector('{BAND}'); return b && b.dataset.pick === 'phone' && b.dataset.pid === {json.dumps(runners)}; }})()", timeout=20000)
        assert "sketch" not in pg.inner_text(BAND).lower()

        # ---- (b) an app only: the app, no tabs
        dash(pg, apponly)
        assert pick(pg) == "phone" and tabs(pg) == [] and "Open App Creator" in acts(pg), (pick(pg), tabs(pg), acts(pg))
        assert pg.locator(f"{BAND} .db-phone .apc-mini").count() == 1

        # ---- (c) an app and a website: tabs, the app first
        dash(pg, both)
        assert pick(pg) == "phone" and tabs(pg) == ["App", "Website"], (pick(pg), tabs(pg))
        sel = lambda: pg.eval_on_selector_all(f"{BAND} [role=tab]", "els => els.map(e => [e.getAttribute('aria-selected'), e.tabIndex])")
        assert sel() == [["true", 0], ["false", -1]], sel()
        assert pg.get_attribute(f"{BAND} [role=tabpanel]", "aria-labelledby") == pg.get_attribute(f"{BAND} [role=tab][aria-selected=true]", "id")
        assert "Open App Creator" in acts(pg) and "Online" not in pg.inner_text(f"{BAND} [role=tablist]"), "not online: it only exists"
        if take: pg.wait_for_timeout(500); pg.screenshot(path="/tmp/living-preview-tabs.png")
        pg.click(f"{BAND} [role=tab][data-show=site]")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'site'", timeout=8000)
        assert "Trail Mates online" in pg.inner_text(f"{BAND} .db-site") and "Open designer" in acts(pg) and "Open App Creator" not in acts(pg), acts(pg)
        assert sel() == [["false", -1], ["true", 0]] and "Website" in pg.inner_text(f"{BAND} .db-tab[aria-selected=true]")
        assert api("/dash/band", token=tok, project=both)["band"]["pick"] == "phone", "the choice is this device's, not the tribe's"
        # the actions act on the tab shown: Open designer opens the website designer
        pg.click(f"{BAND} [data-db=designer]")
        pg.wait_for_selector("#wdz:not([hidden]) .wdz-top", timeout=20000)
        pg.evaluate("TribeSiteDesigner.close()"); pg.wait_for_timeout(500)
        # remembered after a reload
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeDashBand && TribeProjects.list().length > 1", timeout=30000)
        dash(pg, both)
        assert pick(pg) == "site" and sel() == [["false", -1], ["true", 0]], "the Website tab is remembered on this device"
        # arrow keys: real tabs
        pg.focus(f"{BAND} [role=tab][aria-selected=true]")
        pg.keyboard.press("ArrowLeft")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'phone'", timeout=8000)
        until(pg, "document.activeElement && document.activeElement.getAttribute('role') === 'tab' && document.activeElement.dataset.show === 'phone'", 5, "focus follows to the App tab")
        assert "Open App Creator" in acts(pg)
        pg.keyboard.press("ArrowRight")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'site'", timeout=8000)
        pg.keyboard.press("Home")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'phone'", timeout=8000)
        pg.keyboard.press("End")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'site'", timeout=8000)
        # the menu acts on the tab shown, and "Show automatically" goes back to the main app
        pg.click(f"{BAND} [data-db=more]"); pg.click(".db-menu [data-dbm=auto]")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'phone'", timeout=8000)
        assert pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('tribecode.band.tab:')).length") == 0

        # ---- (d) a website only: the website, no tabs
        dash(pg, siteonly)
        assert pick(pg) == "site" and tabs(pg) == [] and "Corner Cafe" in pg.inner_text(f"{BAND} .db-site") and "Open designer" in acts(pg)
        pg.context.close()

        # ---- (f) 390px
        ph = open_page(b, tok, "Orion", 390, 844)
        dash(ph, both)
        g = ph.eval_on_selector_all(f"{BAND} [role=tab]", "els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.height), Math.round(r.width)]; })")
        assert len(g) == 2 and all(h >= 40 and w >= 40 for h, w in g), g
        assert no_side_scroll(ph), "no sideways scroll with tabs"
        ph.tap(f"{BAND} [role=tab][data-show=site]")
        ph.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'site'", timeout=8000)
        assert no_side_scroll(ph)
        ph.evaluate(f"document.querySelector('{BAND}').scrollIntoView()")
        if take: ph.wait_for_timeout(500); ph.screenshot(path="/tmp/living-preview-phone.png")
        dash(ph, bakery)
        assert pick(ph) == "sketch" and no_side_scroll(ph), "the sketch fits a phone"
        r = ph.evaluate(f"(() => {{ const b = document.querySelector('{BAND}').getBoundingClientRect(), m = document.querySelector('{BAND} [data-db=make-real]').getBoundingClientRect(); return [b.right <= innerWidth + 1, m.height]; }})()")
        assert r[0] and r[1] >= 36, r
        ph.context.close(); b.close()
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


def device_tribe(p):
    """(e) a tribe that lives in this browser: no server, no AI."""
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC), functools.partial(Quiet, directory=str(ROOT / "app" / "ui")))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    try:
        pg = b.new_page(viewport={"width": 1280, "height": 860}); watch(pg, "device")
        pg.goto(f"http://localhost:{STATIC}/"); pg.wait_for_selector("#hub-idea", timeout=30000); time.sleep(0.6)
        pg.fill("#hub-idea", "An app that tracks our habits"); pg.click("#hub-idea-go")
        until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version shows")
        time.sleep(0.8)
        pid = pg.evaluate("TribeFirstLook.state().pid")
        assert pg.evaluate("TribeOffline.solo()"), "the tribe lives in this browser"
        pg.click("#fpv [data-fpv=close]")
        # an app only: the app, no tabs
        dash(pg, pid) if pg.evaluate("TribeProjects.list().length > 1") else pg.wait_for_function(f"(() => {{ const b = document.querySelector('{BAND}'); return b && b.dataset.pid === {json.dumps(pid)}; }})()", timeout=20000)
        assert pick(pg) == "phone" and tabs(pg) == [], (pick(pg), tabs(pg))
        # a website too (the designer's own blank site, saved on this device): tabs, the app still first
        pg.evaluate("pid => TribeClient.api(`/projects/${pid}/site-config`, { method: 'PUT', project: pid, body: { config: TribeSiteCfg.normalize({ name: 'Habits site', pages: [{ name: 'Home', blocks: [{ type: 'hero', props: { title: 'Our habits, together' } }] }] }), force: true } })", pid)
        pg.evaluate("TribeDashBand.refresh()")
        pg.wait_for_function(f"document.querySelectorAll('{BAND} [role=tab]').length === 2", timeout=15000)
        assert pick(pg) == "phone" and tabs(pg) == ["App", "Website"], (pick(pg), tabs(pg))
        assert "Online" not in pg.inner_text(f"{BAND} [role=tablist]"), "kept on this device is not online"
        pg.click(f"{BAND} [role=tab][data-show=site]")
        pg.wait_for_function(f"document.querySelector('{BAND}').dataset.pick === 'site'", timeout=8000)
        assert "Open designer" in acts(pg)
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_function("window.TribeClient && window.TribeDashBand && window.TribeProjects && TribeProjects.list().length > 0", timeout=30000)
        dash(pg, pid)
        assert pick(pg) == "site", "remembered on this device"
        # a second project with only a sentence: the sketch, and Make it real saves it on this device
        p2 = pg.evaluate("TribeClient.api('/projects', { method: 'POST', body: { name: 'Night Runners' } }).then(r => r.project.id)")
        pg.evaluate(f"(async pid => {{ await TribeClient.api('/vision', {{ method: 'PUT', project: pid, body: {{ text: '# Night Runners\\n\\n{RUN}\\n' }} }}); await TribeProjects.refresh(); }})({json.dumps(p2)})")
        dash(pg, p2)
        pg.wait_for_function(f"(() => {{ const b = document.querySelector('{BAND}'); return b && b.dataset.pick === 'sketch' && b.dataset.pid === {json.dumps(p2)}; }})()", timeout=15000)
        phone = pg.inner_text(f"{BAND} .db-phone")
        assert pg.get_attribute(BAND, "data-kind") == "app" and "Leaderboard" in phone and "NIGHT RUNNERS" in phone.upper(), phone
        pg.click(f"{BAND} [data-db=make-real]")
        until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version shows on the device")
        assert pg.evaluate("TribeFirstLook.state().saved") and pg.evaluate(f"!!TribePhoneLocal.designs()[{json.dumps(p2)}].app"), "made and saved on this device"
        pg.click("#fpv [data-fpv=close]")
        pg.wait_for_function(f"(() => {{ const b = document.querySelector('{BAND}'); return b && b.dataset.pick === 'phone' && b.dataset.pid === {json.dumps(p2)}; }})()", timeout=20000)
        for badword in ("needs the tribe online", "Not saved"): assert badword not in pg.inner_text("body"), badword
    finally:
        b.close(); httpd.shutdown()


def main():
    with sync_playwright() as p:
        server_tribe(p)
        device_tribe(p)
    assert not errors, errors
    assert not bad, bad
    print("PASS e2e_living_preview")


if __name__ == "__main__":
    main()
