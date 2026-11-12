"""The polish wave (feat/polish), end to end, with every outside service mocked:
 1. Company: before there is a company, a lead sees a quiet "Set up company" row that opens the setup.
 3. Phone "+": the instant Start sheet (setuplocal.js), with Join with a link; its Where should it live? step keeps the
    phone and cloud homes and Join with a link.
 4. A GitHub-linked draft moved to the host is bound as the project's code repository (a clone, like connecting a repo
    by URL), idempotently.
 5. The user bar says "On this device" (tap: Where should it live?) for a project kept here, "Hosting" when hosting.
 6. A whiteboard kept on this device keeps its pictures in IndexedDB; the design canvas's ✦ on a local file designs from
    templates with no AI, from the in-browser model when there is one, and stays basic otherwise.
 8a. Sign in with Apple appears only once configured; iPhone builds hide Discord/Google until it is.
 8b. The first time data would go to a cloud AI, a consent sheet names the provider; Not now keeps it local (no
    request), Allow is remembered per device and provider, Settings › Privacy & safety revokes it.
 8c/d. support.html and delete-account.html: the one support address, FAQ, report and deletion forms (mailto).
 9. Freesound on the inspiration board with the host's key (server-side only, sent as a Token header), mocked; the ✦
    uses the in-browser model when no tribe AI is on.
Usage: python app/test/e2e_polish_wave.py   (screenshots: docs/screenshots/phone-plus-start.png, ai-consent.png)
"""
import functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent)); import fake_openverse

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, STATIC, FAKE = 5760 + OFF, 5761 + OFF, 5762 + OFF
BASE, SBASE = f"http://localhost:{PORT}", f"http://localhost:{STATIC}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


def api(path, method="GET", body=None, token=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: t = r.read(); return r.status, (t.decode() if raw else json.loads(t or b"{}"))
    except urllib.error.HTTPError as e: t = e.read(); return e.code, (t.decode() if raw else json.loads(t or b"{}"))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def watch(pg, who):
    pg.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    pg.on("console", lambda m: m.type == "error" and not any(s in m.text for s in ("Failed to load resource", "ERR_", "favicon", "localhost:9")) and errors.append(f"{who} console: {m.text[:200]}"))


def local_page(b, phone=False):
    ctx = b.new_context(**({"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2} if phone else {"viewport": {"width": 1280, "height": 820}}))
    ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
    pg = ctx.new_page(); watch(pg, "phone" if phone else "local")
    return ctx, pg


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-polish-", dir="/tmp"))
    # a local "GitHub": <gh>/<owner>/<name>.git, cloned by the host when a linked draft moves there
    gh = tmp / "gh"; src = tmp / "src"; src.mkdir(parents=True)
    run = lambda *a, cwd=None: subprocess.run(list(a), cwd=cwd, check=True, capture_output=True)
    run("git", "init", "-q", "-b", "main", str(src)); (src / "README.md").write_text("# Night Garden\n")
    run("git", "add", ".", cwd=src); run("git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init", cwd=src)
    (gh / "rae").mkdir(parents=True); run("git", "clone", "-q", "--bare", str(src), str(gh / "rae" / "night-garden.git"))
    fake = fake_openverse.start(FAKE)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_GITHUB_GIT": str(gh),
           "TRIBE_OPENVERSE_URL": f"http://localhost:{FAKE}", "TRIBE_FREESOUND_URL": f"http://localhost:{FAKE}", "TRIBE_TEST_EMBED_ALLOW": f"localhost:{FAKE}"}
    env.pop("TRIBE_ACCOUNTS", None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    st_srv = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC), functools.partial(Quiet, directory=str(ROOT / "app" / "ui")))
    threading.Thread(target=st_srv.serve_forever, daemon=True).start()
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = api("/bootstrap", "POST", {"name": "Rae"})[1]["token"]
        inv = api("/invites", "POST", {}, token=host)[1]["invite"]
        jay = api("/join", "POST", {"code": inv["code"], "name": "Jay"})[1]["token"]

        # ---------- 4. a GitHub-linked draft becomes the project's code repository (idempotent) ----------
        draft = {"draftId": "polish-gh-001", "tribe": {"name": "Rae's"}, "projects": [{"name": "Night Garden", "bio": "Plants that glow", "tasks": [{"title": "Sketch the moon"}], "github": {"repo": "rae/night-garden", "branch": "tribe/suggestions"}}]}
        st, r = api("/import/solo", "POST", draft, token=host); assert st == 200 and r["projects"][0]["repo"] == "connecting", r
        pid = r["projects"][0]["id"]
        for _ in range(100):
            projs = json.loads((tmp / "tribe" / ".tribe" / "projects.json").read_text())
            p = next(x for x in (projs if isinstance(projs, list) else projs.get("projects", [])) if x["id"] == pid)
            if p.get("repo"): break
            time.sleep(0.1)
        assert p.get("repo") and p.get("workspace") and Path(p["repo"], ".git").exists() and Path(p["repo"], "README.md").read_text().startswith("# Night Garden"), p
        st, r2 = api("/import/solo", "POST", draft, token=host); assert st == 200 and r2.get("again") and r2["projects"][0]["id"] == pid, r2
        projs = json.loads((tmp / "tribe" / ".tribe" / "projects.json").read_text()); projs = projs if isinstance(projs, list) else projs.get("projects", [])
        assert len([x for x in projs if x["name"] == "Night Garden"]) == 1, "no second copy"
        time.sleep(0.5)
        chat = "\n".join(f.read_text() for f in (tmp / "tribe").rglob("*.jsonl") if "chat" in str(f))
        assert "as this project's code repository" in chat, "the host says it's connected"

        # ---------- 9. Freesound: the host's key, server-side only ----------
        assert api("/inspo/freesound", token=host)[1] == {"configured": False}
        st, r = api("/inspo/search?q=rain&type=audio&source=freesound", token=host); assert st == 400 and "Freesound API key" in r["error"], r
        assert api("/inspo/freesound", "PUT", {"key": fake_openverse.FREESOUND_KEY}, token=jay)[0] == 403, "only the host sets it"
        st, r = api("/inspo/freesound", "PUT", {"key": fake_openverse.FREESOUND_KEY}, token=host); assert st == 200 and r == {"configured": True}, r
        st, txt = api("/inspo/search?q=rain&type=audio&source=freesound", token=jay, raw=True)
        assert st == 200 and fake_openverse.FREESOUND_KEY not in txt, "the key never reaches a browser"
        res = json.loads(txt); assert res["source"] == "freesound" and len(res["results"]) == 2, res
        rain = res["results"][0]
        assert rain["title"] == "rain on a tin roof" and rain["license"] == "CC BY 4.0" and rain["creator"] == "dripdrop" and "freesound.org" in rain["attribution"] and rain["preview"].startswith("/api/inspo/cache/"), rain
        assert all(a == "Token " + fake_openverse.FREESOUND_KEY for a in fake_openverse.auths) and not any("token=" in h for h in fake_openverse.hits), "sent as a header, never in a URL"
        st, saved = api("/inspo/save", "POST", {"board": "me", "ref": rain["ref"]}, token=jay); assert st == 200 and saved["item"]["kind"] == "sound" and saved["item"]["preview"], saved
        req = urllib.request.Request(BASE + saved["item"]["preview"]);
        with urllib.request.urlopen(req) as x: assert x.headers["Content-Type"] == "audio/wav" and len(x.read()) > 1000
        assert fake_openverse.FREESOUND_KEY not in (tmp / "tribe" / ".tribe" / "freesound.json").read_text() or oct((tmp / "tribe" / ".tribe" / "freesound.json").stat().st_mode)[-3:] == "600"

        # ---------- 8a. Sign in with Apple: config-gated ----------
        assert not any(p["id"] == "apple" for p in api("/oauth/providers")[1]["providers"])
        st, r = api("/oauth/config/apple", "PUT", {"clientId": "org.tribecode.web", "clientSecret": "eyJ.test.secret", "enabled": True}, token=host); assert st == 200, r
        assert any(p["id"] == "apple" and p["name"] == "Apple" for p in api("/oauth/providers")[1]["providers"])

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- 1 + 5 + 8b + 9 UI on the host ----------
            hx = b.new_context(viewport={"width": 1440, "height": 900})
            hx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Rae', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}}))" % (BASE, host))
            hp = hx.new_page(); watch(hp, "host")
            hp.goto(BASE + "/?skipIntro=1"); hp.wait_for_function("TribeClient.connected() && window.TribeCompany", timeout=20000)
            hp.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); hp.wait_for_timeout(600)
            hp.wait_for_selector("#nest-company.co-subtle:not(.hidden)", timeout=10000)
            assert hp.inner_text("#nest-company").strip() == "Set up company"
            hp.click("#nest-company"); hp.wait_for_selector("#view-company .co-tpl[data-tpl='saas']", timeout=10000)
            hp.wait_for_function("document.querySelector('#ub-st').textContent === 'Hosting'", timeout=8000)   # 5: hosting for real
            assert hp.locator("#ub-st.ub-where").count() == 0
            # 9: the board offers Freesound for sounds; Settings shows the key is set, never the key itself
            hp.evaluate("TribeInspoBoard.open({ type: 'audio' })"); hp.wait_for_selector("#ibd #ibd-src option[value='freesound']", state="attached", timeout=8000)
            hp.evaluate("TribeInspoBoard.close()")
            hp.evaluate("TribeSettings.open()"); hp.evaluate("document.querySelector('#set-more').open = true")
            hp.wait_for_function("(document.querySelector('#set-fs-st') || {}).textContent === 'On: a key is saved.'", timeout=8000)
            assert fake_openverse.FREESOUND_KEY not in hp.content()
            hp.evaluate("TribeSettings.close()")
            # 8b: a cloud AI asks once; Not now sends nothing
            st, d = api("/llm", "PUT", {"provider": "openai", "model": "gpt-test", "key": "sk-test-0123456789abcdef"}, token=host); assert st == 200, d
            refines = []; hp.on("request", lambda r: "/api/ai/refine" in r.url and refines.append(r.url))
            hp.evaluate("window.dispatchEvent(new Event('tribe-brain'))")
            hp.evaluate("TribeShell.go('chat')"); hp.wait_for_selector("#chat-head [data-ab='chat']", timeout=10000)
            hp.click("#chat-head [data-ab='chat']"); hp.click("#ab-pop [data-ab-do='chat.summary']")
            hp.wait_for_selector("#ai-consent", timeout=8000)
            assert "Send this to OpenAI?" in hp.inner_text("#ai-consent") and hp.locator("#ai-consent [data-aic='no'].btn").count() == 1
            hp.wait_for_timeout(300); hp.screenshot(path=str(SHOTS / "ai-consent.png"))
            hp.click("#ai-consent [data-aic='no'].btn"); hp.wait_for_selector("#ai-consent", state="detached")
            hp.wait_for_timeout(600); assert not refines, "Not now: nothing went to the cloud AI"
            assert hp.evaluate("TribeAIConsent.granted('openai')") is False
            hp.keyboard.press("Escape")
            # Allow: remembered on this device for this provider
            hp.click("#chat-head [data-ab='chat']"); hp.click("#ab-pop [data-ab-do='chat.summary']")
            hp.wait_for_selector("#ai-consent", timeout=8000); hp.click("#aic-yes")
            hp.wait_for_timeout(800)
            assert refines, "after Allow the ✦ asks the tribe's AI"
            assert hp.evaluate("TribeAIConsent.granted('openai')") is True
            hp.keyboard.press("Escape")
            # Settings › Privacy & safety lists it, Revoke forgets it
            hp.evaluate("TribeModeration.openSafety()"); hp.wait_for_selector("#mod-ai [data-ai-revoke='openai']", timeout=8000)
            assert "OpenAI" in hp.inner_text("#mod-ai")
            assert hp.locator("#mod-dlg a[href='support.html']").count() == 1 and hp.locator("#mod-dlg a[href='delete-account.html']").count() == 1
            hp.click("#mod-ai [data-ai-revoke='openai']"); hp.wait_for_function("!TribeAIConsent.granted('openai')")
            hp.wait_for_selector("#mod-ai [data-ai-revoke]", state="detached")
            api("/llm", "PUT", {"provider": "none"}, token=host)
            # 9b: no tribe AI -> the ✦ uses the in-browser model (mocked), labelled with it
            hp.evaluate("""() => { window.dispatchEvent(new Event('tribe-brain')); window.TribeBrain = Object.assign({}, window.TribeBrain, { browserReady: () => true,
                askBrowser: async (messages) => { window.__asked = messages; return { via: 'Qwen3 in your browser', text: '- Water the moon plants\\n- Sketch the glow' }; } }); }""")
            r = hp.evaluate("TribeAIBasics.ask('task.split', { title: 'Make the garden glow' }, '')")
            assert r and r["via"] == "Qwen3 in your browser" and "Water the moon plants" in r["text"], r
            assert "Split this task" in hp.evaluate("window.__asked[1].content"), "the same prompt as the server's"
            # 8a: an iPhone build hides Discord/Google until Apple is on
            ios = hx.new_page(); watch(ios, "ios")
            ios.goto(BASE + "/signin.html?platform=ios"); ios.wait_for_function("window.TribeOAuth && TribeOAuth.iosApp && TribeOAuth.iosApp()", timeout=10000)
            three = [{"id": "discord", "name": "Discord"}, {"id": "github", "name": "GitHub"}, {"id": "google", "name": "Google"}]
            assert [p["id"] for p in ios.evaluate("l => TribeOAuth.forPlatform(l)", three)] == ["github"]
            assert [p["id"] for p in ios.evaluate("l => TribeOAuth.forPlatform(l)", three + [{"id": "apple", "name": "Apple"}])] == ["discord", "github", "google", "apple"]
            ios.close()
            hx.close()

            # ---------- 8c/d: the public pages ----------
            pp = b.new_page(); watch(pp, "pages")
            for page_name, form in (("support.html", "#rp-form"), ("delete-account.html", "#del-form")):
                pp.goto(SBASE + "/" + page_name); pp.wait_for_function("window.TribeSupport")
                assert pp.locator("[data-support-email]").first.inner_text() == "support@tribecode.org"
                assert pp.get_attribute("[data-support-mailto]", "href").startswith("mailto:support@tribecode.org?subject=")
                pp.evaluate("() => { window.__mail = []; window.TribeSupport.mailto = (s, b) => { window.__mail.push([s, b]); return '#sent'; }; }")
                if page_name == "support.html":
                    assert pp.locator(".faq a[href='delete-account.html']").count() == 1 and pp.locator("#report").count() == 1
                    pp.fill("#rp-what", "The whiteboard froze"); pp.select_option("#rp-kind", "A bug")
                else:
                    assert "Settings › Privacy & safety" in pp.inner_text("main")
                    pp.fill("#del-name", "Jay")
                pp.click(form + " button[type=submit]"); pp.wait_for_function("location.hash === '#sent'")
                mail = pp.evaluate("window.__mail[0]")
                assert (mail[0] == "Account deletion request" and "Name in TribeCode: Jay" in mail[1]) if page_name != "support.html" else ("The whiteboard froze" in mail[1] and "A bug" in mail[0]), mail
                assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            pp.goto(SBASE + "/privacy.html"); assert pp.locator("a[href='delete-account.html']").count() >= 1 and pp.locator("a[href='support.html']").count() >= 1
            pp.close()

            # ---------- 3 + 5: the phone "+" opens the instant Start sheet ----------
            px, ph = local_page(b, phone=True)
            ph.goto(SBASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeMobile && window.TribeLocalSetup && window.TribeOffline", timeout=15000)
            ph.evaluate("TribeMobile.startTribe()"); ph.wait_for_selector("#su-start #su-name", state="visible")
            assert ph.locator("#su-start [data-su-join]").count() == 1 and ph.locator("#ph-start").count() == 0, "the instant sheet, not the old chooser"
            ph.fill("#su-name", "Moon Garden"); ph.wait_for_timeout(250)
            ph.screenshot(path=str(SHOTS / "phone-plus-start.png"))
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            ph.click("#su-create"); ph.wait_for_selector("#su-where", state="visible", timeout=10000)
            homes = ph.eval_on_selector_all("#su-where [data-su]", "els => els.map(e => e.dataset.su)")
            assert homes == ["github", "computer", "cloud", "phone"], homes
            assert ph.locator("#su-where [data-su-join]").count() == 1
            ph.click("#su-where [data-su='phone']"); ph.wait_for_selector("#su-phone [data-p='stay']", timeout=5000)
            ph.click("#su-phone [data-su-close]")
            px.close()

            # ---------- 5 + 6 on a desktop with no tribe ----------
            lx, lp = local_page(b)
            lp.goto(SBASE + "/?skipIntro=1#/hub"); lp.wait_for_function("window.TribeLocalSetup && window.TribeLocalFiles && window.TribeUserbar", timeout=15000)
            # 6a: a whiteboard kept here keeps its picture in IndexedDB
            lp.evaluate("TribeLocalFiles.create('whiteboard', { title: 'Mood' }).then(it => TribeLocalFiles.open(it.id))")
            lp.wait_for_function("TribeWhiteboard.state().open && TribeWhiteboard.local()", timeout=8000)
            png = fake_openverse.png((242, 107, 29), 40, 30)
            lp.set_input_files("#wbd-file", files=[{"name": "ember.png", "mimeType": "image/png", "buffer": png}])
            lp.wait_for_function("TribeWhiteboard.state().elements.some(e => e.t === 'image' && /^local:img-/.test(e.src))", timeout=8000)
            src = lp.evaluate("TribeWhiteboard.state().elements.find(e => e.t === 'image').src")
            n = lp.evaluate("s => TribeLocalFiles.blob(s.slice(6)).then(b => b ? b.size : 0)", src); assert n == len(png), n
            lp.wait_for_function("TribeLocalFiles.list().some(x => x.kind === 'whiteboard' && Object.values(x.elements || {}).some(e => !e.del && e.t === 'image'))", timeout=5000)
            lp.reload(); lp.wait_for_function("window.TribeLocalFiles", timeout=15000)
            w = lp.evaluate("s => TribeLocalFiles.imageUrl(s).then(u => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(-1); i.src = u; }))", src)
            assert w == 40, f"the picture comes back after a reload: {w}"
            # 6b: the design canvas's ✦ on a design kept here
            lp.evaluate("TribeLocalFiles.create('design', { title: 'Screens' }).then(it => TribeLocalFiles.open(it.id))")
            lp.wait_for_function("window.TribeCanvas && TribeCanvas.local() && window.TribeCanvasFlint", timeout=10000); lp.wait_for_timeout(500)
            r = lp.evaluate("TribeCanvasFlint.run('a login screen for Ember').then(x => x.r)")
            assert r["kind"] == "build" and "Basic · no AI" in r["say"], r
            r = lp.evaluate("TribeCanvasFlint.run('a moonlit garden journal with three plant cards').then(x => x.r)")
            assert r["kind"] in ("freeform", "tier") and "No AI is reachable" in r.get("why", ""), r
            spec = {"name": "Garden journal", "w": 390, "h": 844, "fill": "#FBF7F2", "layers": [{"t": "text", "name": "Title", "x": 24, "y": 60, "w": 300, "h": 40, "c": "Moon garden", "s": 28, "wt": 700, "col": "#16181D"}, {"t": "rect", "name": "Card", "x": 24, "y": 120, "w": 342, "h": 120, "fill": "#38C6B1", "r": 16}]}
            lp.evaluate("""s => { window.TribeBrain = Object.assign({}, window.TribeBrain, { browserReady: () => true, askBrowser: async () => ({ via: 'Qwen3 in your browser', text: 'Here it is: ' + JSON.stringify(s) }) }); }""", spec)
            before = lp.evaluate("TribeCanvas.state().count || 0")
            r = lp.evaluate("TribeCanvasFlint.run('a moonlit garden journal with three plant cards').then(x => x.r)")
            assert r["kind"] == "build" and "via Qwen3 in your browser" in r["say"] and len(r["create"]) == 3, r
            # 5: a project kept on this device says so, and the label opens Where should it live?
            lp.evaluate("TribeApp.show('hub')")
            lp.evaluate("TribeLocalSetup.start({ name: 'Glow' })"); lp.wait_for_selector("#su-start #su-create"); lp.click("#su-create")
            lp.wait_for_selector("#su-where", state="visible", timeout=10000); lp.click("#su-later")
            lp.wait_for_function("document.querySelector('#ub-st') && document.querySelector('#ub-st').textContent === 'On this device'", timeout=8000)
            lp.click("#ub-st"); lp.wait_for_selector("#su-where", state="visible", timeout=5000)
            lx.close()
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_polish_wave: OK (company setup row, phone + instant start, GitHub draft -> code repository, user bar, local whiteboard pictures + design ✦, Apple gate + iOS, cloud AI consent, support + deletion pages, Freesound, ✦ in-browser model)")
    finally:
        srv.kill(); fake.shutdown(); st_srv.shutdown()


if __name__ == "__main__":
    main()
