"""End-to-end: Put it on your phone (app/ui/homescreen.js, app/ui/homescreen-core.js, server/homescreen.js,
docs/HOMESCREEN-PATH.md). From an App Creator app to the home-screen steps:
R  the check on a real App Creator export: it has a manifest but only an SVG icon, so the 192/512 icons and the PNG
   iPhone icon are missing; a spectator can't fix it (403) and sees Ask to publish; the host's one tap adds only what
   is missing (PNG icons at the right sizes, maskable, apple-touch-icon), saves a version (git), Undo puts it back.
O  online: a play link from this server, Check it runs the install check on the live link (and its scripts) and says
   localhost only works here; the free limits table shows its sources and read date; a link elsewhere is refused.
P  the QR code and Send by text carry the link.
A  add to home screen: an iPhone Safari, an Android Chrome and an Instagram (in-app) user agent each get their own
   steps, the in-app one a warning first; 390px has no sideways scroll and 40px targets.
F  Flint with no AI: "how do I put my app on my phone" opens the path; "do I need a mac" and "why can't I install it
   on my iphone" answer locally.
AI the stage's Claude suggestion shows only with an AI connected; with none, the stage says what Flint does here.
S  the 'phone' suggestion provider offers to make it installable and undoes it.
Usage: python app/test/e2e_homescreen.py [--shots]   (--shots writes docs/screenshots/homescreen*.png)
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 7720 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
SHOT_DIR = ROOT / "docs" / "screenshots"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
errors = []
UA = {
    "ios": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    "android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
    "insta": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_5; en_US)",
}


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        data = e.read()
        try: return e.code, json.loads(data or b"{}")
        except Exception: return e.code, {"raw": data[:200].decode("utf8", "replace")}


def ok(r, what=""):
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def png_size(b):
    assert b[:8] == b"\x89PNG\r\n\x1a\n", "a real PNG"
    return struct.unpack(">II", b[16:24])


def settings(token, pid):
    s = {"name": "Camp", "color": "#F26B1D", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": token}}
    return ("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
            " localStorage.setItem('tribecode.project:%s', '%s'); localStorage.setItem('tribecode.lang', 'en'); } catch (e) {}") % (json.dumps(json.dumps(s)), BASE, pid)


def page_for(b, token, pid, **kw):
    c = b.new_context(**kw); c.add_init_script(settings(token, pid))
    pg = c.new_page()
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text and errors.append(f"console: {m.text[:200]}"))
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
    pg.wait_for_function("window.TribeHomescreen && window.TribeHomeCore && window.TribeUI && TribeClient.connected()", timeout=45000)
    pg.wait_for_timeout(800)
    return c, pg


def open_sheet(pg, pid, stage=""):
    pg.evaluate(f"TribeHomescreen.open('{pid}', '{stage}')")
    pg.wait_for_selector("#hs-sheet .hs-stage", timeout=15000)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-hs-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="hs-src-", dir="/tmp")
    app = Path(work, "daily-habits"); app.mkdir()
    (app / "README.md").write_text("# Daily Habits\n")
    g = lambda *a: subprocess.run(["git", "-C", str(app), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")
    logf = open(os.path.join(tmp, "server.log"), "wb")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Phone Crew"],
                           stdout=logf, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": str(app)}, token=camp), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=camp))["invite"]
        spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Sky"}))["token"]
        Q = f"?project={pid}"

        # ---------- R: an App Creator app, exported as a phone web app ----------
        doc = json.loads(subprocess.run(["node", "-e", "const A=require('./app/ui/appcreator-core.js'); process.stdout.write(JSON.stringify(A.template('habits')))"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
        ok(api(f"/projects/{pid}/app-config", "PUT", {"config": doc}, token=camp), "save the app")
        ex = ok(api(f"/projects/{pid}/app-config/export", "POST", {"kind": "pwa"}, token=camp), "export")
        assert ex["folder"] == "app-web" and (app / "app-web" / "manifest.webmanifest").exists(), ex
        v = ok(api("/homescreen" + Q, token=camp), "view")
        miss = v["check"]["missing"]
        assert not v["check"]["ok"] and "icons" in miss and "apple" in miss and "manifest" not in miss and v["canFix"], v["check"]
        sv = ok(api("/homescreen" + Q, token=spec), "spectator view"); assert not sv["canFix"]
        assert api("/homescreen/fix", "POST", {"project": pid}, token=spec)[0] == 403, "a spectator can't change the app"

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # the spectator sees the check and Ask to publish, no fix button
            c, pg = page_for(b, spec, pid, viewport={"width": 1280, "height": 860})
            open_sheet(pg, pid, "ready")
            assert pg.locator("#hs-fix").count() == 0 and pg.locator("#hs-sheet [data-gs-ask='site.publish']").count() == 1, "spectators get Ask"
            c.close()

            c, pg = page_for(b, camp, pid, viewport={"width": 1280, "height": 860})
            open_sheet(pg, pid)
            assert pg.evaluate("TribeHomescreen.state().stage") == "ready", "starts at the first unfinished step"
            assert pg.locator("[data-hs-check='icons'].is-bad").count() == 1 and pg.locator("[data-hs-check='manifest'].is-ok").count() == 1
            assert "Why" in pg.inner_text("#hs-sheet .hs-why") and pg.locator("#hs-sheet .hs-res a").count() >= 2
            assert pg.locator("#hs-sheet .hs-ai.is-local").count() == 1 and pg.locator("#hs-ai-send").count() == 0, "no AI: the stage says what Flint does"
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "homescreen-ready.png"))
            pg.click("#hs-fix")
            pg.wait_for_selector("#hs-fixed:not([hidden])", timeout=20000)
            assert pg.evaluate("TribeHomescreen.state().check.ok"), pg.evaluate("TribeHomescreen.state().check")
            w = app / "app-web"
            assert png_size((w / "icons" / "icon-192.png").read_bytes()) == (192, 192) and png_size((w / "icons" / "icon-512.png").read_bytes()) == (512, 512)
            mf = json.loads((w / "manifest.webmanifest").read_text())
            assert any("maskable" in (i.get("purpose") or "").split() for i in mf["icons"]) and mf["display"] in ("standalone", "fullscreen")
            assert sum(1 for i in mf["icons"] if i.get("type") == "image/png" and i.get("sizes") in ("192x192", "512x512")) == 2, mf["icons"]
            html = (w / "index.html").read_text()
            assert 'rel="apple-touch-icon" href="icons/icon-192.png"' in html and html.count('rel="manifest"') == 1, "the iPhone icon is a PNG; one manifest link"
            assert "Make it installable on phones" in g("log", "-1", "--format=%s").stdout, "saved as a version"
            # Undo puts it back, the fix does it again
            pg.click("#hs-undo"); pg.wait_for_function("TribeHomescreen.state() && !TribeHomescreen.state().check.ok", timeout=10000)
            assert not (w / "icons" / "icon-192.png").exists() and "icon-192.png" not in (w / "index.html").read_text()
            again = ok(api("/homescreen/fix", "POST", {"project": pid}, token=camp), "fix again")

            # ---------- O: online ----------
            pub = ok(api("/publish", "POST", {"project": pid, "title": "Daily Habits"}, token=camp), "play link")
            url = pub["url"]; assert "/play/" in url, pub
            here = BASE + urllib.parse.urlparse(url).path   # the stubbed host: this server on localhost
            r = ok(api("/homescreen/reach", "POST", {"project": pid, "url": here}, token=camp), "reach")
            assert r["ok"] and r["https"] and r["local"] and r["check"]["ok"], r
            lan = ok(api("/homescreen/reach", "POST", {"project": pid, "url": url}, token=camp), "reach the play link")
            assert lan["ok"] and (lan["local"] or "https" in lan["check"]["missing"]), lan
            assert api("/homescreen/reach", "POST", {"project": pid, "url": "https://example.com/"}, token=camp)[0] == 400, "only the project's own links"
            pg.evaluate("TribeHomescreen.close()"); open_sheet(pg, pid, "online")
            assert pg.locator("[data-hs-link='play']").count() == 1
            pg.click("[data-hs-link='play'] [data-hs-reach]")
            pg.wait_for_selector("[data-hs-link='play'] .hs-reach .hs-warn, [data-hs-link='play'] .hs-reach .hs-ok", timeout=15000)
            said = pg.inner_text("[data-hs-link='play'] .hs-reach")
            assert "only works on this computer" in said or "Served over https" in said, said
            rows = pg.locator(".hs-limits tbody tr").count(); srcs = pg.eval_on_selector_all(".hs-limits a.hs-src", "a => a.map(x => x.href)")
            assert rows >= 5 and any("docs.github.com" in s for s in srcs) and any("render.com" in s for s in srcs), (rows, srcs)
            assert "2026-11-16" in pg.inner_text(".hs-read")
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "homescreen-online.png"))

            # ---------- P: open on the phone ----------
            pg.click("[data-hs-stage='open']")
            assert pg.locator("#hs-sheet .hs-qr svg").count() == 1
            assert urllib.parse.quote(url, safe="") in pg.get_attribute("#hs-sms", "href")
            # the store stage: costs with their sources
            pg.click("[data-hs-stage='store']")
            store = pg.inner_text("#hs-sheet .hs-limits")
            assert "15 Android and 15 iOS builds a month" in store and "$99 a year" in store and "US$25 once" in store, store
            # ---------- AI: the suggestion only with an AI connected ----------
            pg.evaluate("TribeHomescreen.close()")
            pg.route("**/api/flint/tiers", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"tiers": [], "now": {"host": {"online": True, "via": "test"}}})))
            open_sheet(pg, pid, "ready")
            assert pg.locator("#hs-ai-send").count() == 1 and "offline" in pg.inner_text("#hs-ai-q")
            pg.click("#hs-ai-send"); pg.wait_for_timeout(1500)
            tasks = ok(api("/tasks" + Q, token=camp))
            tl = tasks.get("tasks", tasks) if isinstance(tasks, dict) else tasks
            assert any("offline" in (t.get("title", "") + t.get("body", "")) for t in tl), "no helper connected: the ask became a task"
            pg.unroute("**/api/flint/tiers"); pg.evaluate("TribeHomescreen.close()")

            # ---------- F: Flint, no AI ----------
            pg.evaluate("TribeFlint.ask('how do i put my app on my phone')")
            pg.wait_for_selector("#hs-sheet .hs-stage", timeout=10000); pg.evaluate("TribeHomescreen.close()")
            for q, word in (("do i need a mac", "Mac"), ("why cant i install it on my iphone", "Safari")):
                n = pg.evaluate("TribeFlint.thread().length")
                pg.evaluate(f"TribeFlint.ask({json.dumps(q)})")
                pg.wait_for_function(f"TribeFlint.thread().length > {n} && TribeFlint.thread().slice(-1)[0].who === 'flint'", timeout=10000)
                last = pg.evaluate("TribeFlint.thread().slice(-1)[0]")
                assert word in last["text"] and any(a.get("act") == "homescreen" for a in last.get("acts", [])), (q, last)

            # ---------- S: the 'phone' suggestion ----------
            ok(api("/homescreen/undo", "POST", {"project": pid, "undo": again["undo"]}, token=camp), "back to not installable")
            got = pg.evaluate(f"(async () => {{ const p = TribeHomescreen.suggestProvider, ctx = {{ projectId: '{pid}' }}; const g = await p.gather(ctx); const s = await p.suggest(ctx, g); window.__hs = s; return s.map(x => [x.id, x.title]); }})()")
            assert got and got[0][0] == "installable" and "installable" in got[0][1], got
            pg.evaluate("(async () => { window.__u = await window.__hs[0].apply(); })()"); pg.wait_for_function("!!window.__u", timeout=10000)
            assert (w / "icons" / "icon-192.png").exists()
            pg.evaluate("(async () => { await window.__u(); window.__ud = 1; })()"); pg.wait_for_function("window.__ud", timeout=10000)
            assert not (w / "icons" / "icon-192.png").exists(), "the suggestion's Undo puts it back"
            ok(api("/homescreen/fix", "POST", {"project": pid}, token=camp))
            c.close()

            # ---------- A: each phone gets its own steps; 390px ----------
            for key, ua, want, text in (("ios", UA["ios"], "ios-safari", "Share"), ("android", UA["android"], "android-chrome", "Install app"), ("insta", UA["insta"], "inapp-ios", "Open in Safari")):
                c, pg = page_for(b, camp, pid, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=ua)
                open_sheet(pg, pid, "add")
                assert pg.evaluate("TribeHomescreen.state().key") == want, (key, pg.evaluate("TribeHomescreen.state()"))
                assert text in pg.inner_text("#hs-sheet .hs-how"), (key, pg.inner_text("#hs-sheet .hs-how"))
                assert (pg.locator("#hs-sheet .hs-inapp").count() == 1) == (key == "insta"), "the in-app warning only inside another app"
                wide = pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#hs-sheet .hsp-body, #hs-sheet .hs-stage')].some(e => e.scrollWidth > e.clientWidth + 1)")
                assert not wide, f"no sideways scroll ({key})"
                small = pg.evaluate("[...document.querySelectorAll('#hs-sheet .hs-foot .btn, #hs-sheet .hsp-step, #hs-sheet .hs-tab, #hs-sheet .chip, #hs-sheet .hs-tick')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 36; }).map(e => e.className)")
                assert not small, (key, small)
                assert pg.locator("#hs-sheet .hs-foot .btn").last.bounding_box()["height"] >= 40
                if SHOTS and key in ("ios", "insta"): pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / f"homescreen-phone-{key}.png"))
                c.close()
            b.close()
        assert not errors, errors[:6]
        print("e2e_homescreen: OK (App Creator export checked, spectator asks, one-tap fix + version + Undo, live play link check, limits with sources, QR + text, store costs, AI ask only with an AI, Flint path + answers, phone suggestion + undo, iPhone/Android/Instagram steps at 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    import urllib.parse
    main()
