"""The one create-a-tribe flow (feat/ui-tribeflow, app/ui/tribenew.js).
  1. Every way in opens the same sheet (#tn, step 1: name and icon): the rail +, the empty Home, Settings, the
     welcome's "Start my real tribe", the phone's projects sheet, and TribeLocalSetup.start / TribeProjects.openNew.
     Closing leaves no sheet and no scrim behind; there is only ever one sheet and one scrim.
  2. Back works on every step and keeps what was typed.
  3. Each "where it lives" completes: This device, A GitHub repo (mocked GitHub), Free cloud (a mocked cloud tribe:
     join, import, invite), A folder on this computer (the real server that serves the page; screenshot folder-home.png). Inside a tribe, "With <tribe>" makes
     it there. Every path ends on step 3 (invite, skippable) and lands in the new tribe with "Start your first project".
  4. It fits a 390px phone at every step (a bottom sheet, nothing wider than the screen).
Usage: python app/test/e2e_tribe_flow.py   (writes docs/screenshots/tribe-flow-1.png, tribe-flow-where.png)"""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6690 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
CLOUD = "https://cloud.tribe.test"
FRESH = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"
ONE = "() => ({ sheets: document.querySelectorAll('.ph-sheet:not(.out), .modal:not(.hidden) .np-setup').length, scrims: document.querySelectorAll('.ph-scrim:not(.out)').length, tn: !!document.querySelector('#tn'), step: document.querySelector('#tn') && +document.querySelector('#tn').dataset.step })"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r, timeout=20) as x: return json.loads(x.read() or b"{}")


def reply(route, status, data):
    route.fulfill(status=status, content_type="application/json", headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"}, body=json.dumps(data))


def mock_github(ctx):
    def handle(route):
        u = route.request.url.split("api.github.com", 1)[1].split("?")[0]
        if route.request.method == "OPTIONS": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"})
        if u == "/repos/camp/lantern": return reply(route, 200, {"full_name": "camp/lantern", "default_branch": "main", "html_url": "https://github.com/camp/lantern", "pushed_at": "2026-11-10T10:00:00Z"})
        if u.startswith("/repos/camp/lantern/"): return reply(route, 200, [])
        return reply(route, 404, {"message": "Not Found"})
    ctx.route("https://api.github.com/**", handle)


def mock_cloud(ctx, seen):
    def handle(route):
        u = route.request.url[len(CLOUD):].split("?")[0]; seen.append((route.request.method, u))
        if route.request.method == "OPTIONS": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST"})
        if u == "/api/join": return reply(route, 200, {"token": "cloud-token", "member": {"id": "camp"}})
        if u == "/api/import/solo": return reply(route, 200, {"projects": [{"id": "cloud-crew", "name": "Cloud Crew"}]})
        if u == "/api/invites": return reply(route, 200, {"invite": {"code": "cl0ud"}})
        return reply(route, 404, {"error": "nope"})
    ctx.route(CLOUD + "/**", handle)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-tf-", dir="/tmp")); errors = []
    home = tmp / "home"; (home / "Games" / "HomeCrew").mkdir(parents=True); (home / "Games" / "HomeCrew" / "index.html").write_text("<h1>Home Crew</h1>")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try: api("/health"); break
            except Exception: time.sleep(0.2)
        SHOTS.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1280, h=820):
                ctx = b.new_context(viewport={"width": w, "height": h}); ctx.add_init_script(FRESH)
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
                pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub"); pg.wait_for_function("window.TribeNew && window.TribeLocalSetup && window.TribeApp && window.TribeSettings", timeout=15000)
                pg.wait_for_timeout(500)
                return pg

            def opened(pg, how):
                pg.wait_for_selector("#tn #tn-name", state="visible", timeout=8000); pg.wait_for_timeout(250)
                s = pg.evaluate(ONE); assert s["tn"] and s["step"] == 1 and s["sheets"] == 1 and s["scrims"] == 1, (how, s)

            def closed(pg, how):
                pg.wait_for_selector("#tn", state="detached", timeout=4000); pg.wait_for_timeout(250)
                s = pg.evaluate(ONE); assert s["sheets"] == 0 and s["scrims"] == 0, ("leftover after closing", how, s)

            # ---------- 1. every entry point opens the same flow; closing leaves nothing behind ----------
            pg = page()
            pg.click("#pj-plus"); opened(pg, "rail +")
            pg.screenshot(path=str(SHOTS / "tribe-flow-1.png"))
            pg.click("#tn-x"); closed(pg, "rail +")
            pg.wait_for_selector("#view-hub:not(.hidden) #hub-host", timeout=8000); pg.click("#hub-host"); opened(pg, "empty Home")
            pg.keyboard.press("Escape"); closed(pg, "Esc")
            pg.evaluate("TribeSettings.open('account')"); pg.wait_for_selector("#set-new", state="visible"); pg.click("#set-new"); opened(pg, "Settings")
            assert pg.evaluate("!document.querySelector('.modal:not(.hidden) #set-new')"), "Settings closed under the flow"
            pg.click("#tn-cancel"); closed(pg, "Settings")
            for how, js in [("TribeLocalSetup.start", "TribeLocalSetup.start()"), ("TribeProjects.openNew", "TribeProjects.openNew()"), ("TribeSetup.start", "TribeSetup.start && TribeSetup.start()")]:
                pg.evaluate(js); opened(pg, how)
                pg.evaluate("TribeNew.open()"); opened(pg, how + " twice: still one sheet")
                pg.click(".tn-scrim", position={"x": 8, "y": 8}); closed(pg, how)
            # the welcome's "Start my real tribe"
            pg.evaluate("TribeWelcome.open()"); pg.wait_for_selector("#wl", timeout=5000)
            pg.click("#wl-skip"); pg.wait_for_selector("#wl [data-go='real']", state="visible", timeout=5000); pg.click("#wl [data-go='real']")
            pg.wait_for_selector("#wl", state="detached"); opened(pg, "welcome"); pg.click("#tn-x"); closed(pg, "welcome")

            # ---------- 2. Back works, and keeps what was typed ----------
            pg.click("#pj-plus"); opened(pg, "back test")
            pg.click("#tn-options"); assert pg.is_visible("#tn-err") and pg.evaluate("TribeNew.state().step") == 1, "a calm inline note, no empty name"
            pg.fill("#tn-name", "Lantern Crew"); pg.click("#tn [data-tn-emo='🎮']"); pg.click("#tn-options")
            pg.wait_for_selector("#tn[data-step='2'] [data-tn-where]")
            homes = pg.evaluate("TribeNew.homes()"); assert homes == ["folder", "device", "cloud", "github", "shared"], homes
            assert pg.evaluate("TribeNew.recommended()") == "folder", "a page served by TribeCode: a folder on this computer"
            assert pg.locator("#tn [data-tn-where='folder'] .ph-tag").text_content().strip() == "Recommended"
            assert [t.strip() for t in pg.locator("#tn [data-tn-where] .ph-tt b").evaluate_all("els => els.map(e => e.firstChild.textContent)")] == ["A folder on this computer", "This device only", "Free cloud", "GitHub repo", "A shared folder"]
            assert "connect GitHub later to any of the others" in pg.inner_text("#tn [data-tn-where='github']")
            pg.click("#tn [data-tn-where='github']"); pg.wait_for_selector("#tn-repo"); pg.mouse.move(5, 5); pg.wait_for_timeout(300)
            pg.screenshot(path=str(SHOTS / "tribe-flow-where.png"))
            pg.click("#tn-back"); pg.wait_for_selector("#tn[data-step='1']")
            assert pg.input_value("#tn-name") == "Lantern Crew" and pg.get_attribute("#tn [data-tn-emo='🎮']", "aria-checked") == "true", "Back keeps the name and icon"
            pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']"); assert pg.evaluate("TribeNew.state().where") == "github", "and the choice"
            pg.click("#tn-b2"); pg.wait_for_selector("#tn[data-step='1']"); pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']")
            pg.click("#tn-go"); assert "owner/name" in pg.inner_text("#tn-err"), "github needs a repo: an inline note"

            # ---------- 3a. This device ----------
            pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go")
            pg.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=10000)
            assert pg.evaluate(ONE)["sheets"] == 1, "one sheet the whole way"
            pg.click("#tn-back"); pg.wait_for_selector("#tn[data-step='2']")
            assert pg.evaluate("[...document.querySelectorAll('#tn [data-tn-where]')].every(b => b.disabled)") and pg.inner_text("#tn-go") == "Next", "back on step 2 after creating: nothing is made twice"
            pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3']")
            pg.click("#tn-skip"); closed(pg, "device done")
            pg.wait_for_selector("#tn-first", state="visible", timeout=8000)
            st = pg.evaluate("TribeOffline.state()"); assert [p["name"] for p in st["projects"]] == ["Lantern Crew"] and st["projects"][0]["emoji"] == "🎮", st["projects"]
            assert "Start your first project" in pg.inner_text("#tn-first")
            # inside that tribe, + opens the same flow with its tribe as the home
            pg.click("#pj-plus"); opened(pg, "rail + in a tribe"); pg.fill("#tn-name", "Moon Garden"); pg.click("#tn-options")
            assert pg.evaluate("TribeNew.homes()") == ["tribe"] and pg.evaluate("TribeNew.recommended()") == "tribe"
            pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3']", timeout=8000); pg.click("#tn-done"); closed(pg, "in a tribe")
            pg.wait_for_function("TribeOffline.state().projects.length === 2 && TribeProjects.current() === TribeOffline.state().projects[1].id", timeout=8000)
            pg.context.close()

            # ---------- 3b. A GitHub repo (mocked) ----------
            pg = page(); mock_github(pg.context)
            pg.evaluate("TribeNew.open({ name: 'Repo Crew' })"); opened(pg, "github"); pg.click("#tn-options")
            pg.click("#tn [data-tn-where='github']"); pg.fill("#tn-repo", "https://github.com/camp/lantern"); pg.click("#tn-go")
            pg.wait_for_selector("#tn[data-step='3']", timeout=10000)
            assert pg.input_value("#tn-link") == "https://github.com/camp/lantern"
            assert pg.evaluate("TribeLocalSetup.state().home.github.repo") == "camp/lantern"
            pg.click("#tn-done"); closed(pg, "github"); pg.wait_for_selector("#tn-first", state="visible", timeout=8000)
            pg.context.close()

            # ---------- 3c. Free cloud (a mocked cloud tribe) ----------
            pg = page(); seen = []; mock_cloud(pg.context, seen)
            pg.evaluate("TribeNew.open({ name: 'Cloud Crew' })"); opened(pg, "cloud"); pg.click("#tn-options")
            pg.click("#tn [data-tn-where='cloud']"); pg.click("#tn-go"); assert "invite link" in pg.inner_text("#tn-err")
            pg.fill("#tn-cloud", CLOUD + "/join/abc12"); pg.click("#tn-go")
            pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=10000)   # feat/invite-one: the invite step opens the one invite sheet
            assert pg.locator("#tn-link").count() == 0, "no invite link of its own"
            assert ("POST", "/api/join") in seen and ("POST", "/api/import/solo") in seen, seen
            assert pg.evaluate("TribeStore.get().server.url") == CLOUD
            pg.click("#tn-x"); closed(pg, "cloud")
            pg.context.close()

            # ---------- 3d. A folder on this computer (the real server here), then in that tribe ----------
            pg = page()
            pg.evaluate("TribeNew.open({ name: 'Home Crew' })"); opened(pg, "folder"); pg.click("#tn-options")
            assert pg.get_attribute("#tn [data-tn-where='folder']", "aria-checked") == "true", "recommended is chosen"
            pg.click("#tn-folder #lr-browse-go"); pg.wait_for_selector("#tn-folder .lr-dir"); pg.click("#tn-folder [data-open$='Games']")
            pg.wait_for_selector("#tn-folder [data-dir$='HomeCrew']"); pg.click("#tn-folder [data-dir$='HomeCrew']")
            pg.wait_for_function("document.querySelector('#tn-go').textContent.includes('Use what')", timeout=10000)
            assert "index.html" in pg.inner_text("#tn-folder .lr-chips") and pg.is_visible("#lr-git-l"), "what was found; git init offered"
            pg.mouse.move(5, 5); pg.evaluate("document.querySelector('#tn').scrollTop = 1e4"); pg.wait_for_timeout(250); pg.screenshot(path=str(SHOTS / "folder-home.png"))
            pg.click("#tn-go")
            pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=20000)
            assert api("/health")["members"] >= 1
            with pg.expect_navigation(timeout=20000): pg.click("#tn-invite")   # a new host: the page reloads into it, then the one invite sheet opens there
            pg.wait_for_selector("#invite-modal:not(.hidden) .modal-card.io #io-pane[data-who='friend'] #tl-link", timeout=30000)
            pg.wait_for_function("/\\/t\\//.test(document.querySelector('#tl-link').textContent)", timeout=10000)   # the new tribe's link
            pg.evaluate("TribeInvite.close()")
            pg.wait_for_selector("#share-card", state="visible", timeout=20000)
            pg.wait_for_function("document.querySelector('#sc-line').textContent.includes('~/Games/HomeCrew')", timeout=10000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && !TribeOffline.solo()", timeout=20000)
            pg.wait_for_selector("#tn-first", state="visible", timeout=10000)
            s = pg.evaluate(ONE); assert s["sheets"] == 0 and s["scrims"] == 0, s
            n0 = pg.evaluate("TribeProjects.list().length")
            pg.click("#tn-first-later"); pg.wait_for_selector("#tn-first", state="detached")
            pg.click("#pj-plus"); opened(pg, "rail + on a server"); pg.fill("#tn-name", "Second Crew"); pg.click("#tn-options")
            assert pg.evaluate("TribeNew.homes()") == ["tribe", "folder", "github", "shared"]
            pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=10000)
            pg.click("#tn-done"); closed(pg, "server tribe")
            pg.wait_for_function(f"TribeProjects.list().length === {n0 + 1} && (TribeProjects.cur() || {{}}).name === 'Second Crew'", timeout=10000)
            pg.wait_for_selector("#tn-first", state="visible", timeout=8000)
            pg.context.close()

            # ---------- 4. a 390px phone: the same flow, a bottom sheet that fits every step ----------
            pg = page(390, 844)
            pg.evaluate("TribeMobile.startTribe ? TribeMobile.startTribe() : TribeLocalSetup.start()"); opened(pg, "phone")
            FIT = "() => { const s = document.querySelector('#tn'), r = s.getBoundingClientRect(); return { w: r.width, l: r.left, over: s.scrollWidth - s.clientWidth, wide: [...s.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).map(e => e.id || e.className).slice(0, 3) }; }"
            for step in (1, 2, 3):
                pg.wait_for_selector(f"#tn[data-step='{step}']"); pg.wait_for_timeout(300)
                f = pg.evaluate(FIT); assert f["w"] <= 390 and f["l"] >= 0 and f["over"] <= 0 and not f["wide"], (step, f)
                if step == 1: pg.fill("#tn-name", "Pocket Crew"); pg.click("#tn-options")
                if step == 2:
                    assert pg.evaluate("TribeNew.recommended()") == "device", "a phone: this device"
                    pg.click("#tn [data-tn-where='cloud']"); pg.wait_for_timeout(200); f = pg.evaluate(FIT); assert not f["wide"], f
                    pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go")
            pg.click("#tn-done"); closed(pg, "phone")
            pg.context.close()
            b.close()
        errs = [e for e in errors if "ERR_CONNECTION_REFUSED" not in e and "cloud.tribe.test" not in e]
        assert not errs, errs
        print("e2e_tribe_flow: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
