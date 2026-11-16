"""End-to-end: Flint's app knowledge with no AI (feat/flint-appknow; app/ui/appfeatures.js, docs/APP-BUILDING.md).
No AI is connected anywhere in this test.

1. Ten app-building questions in Flint's chat get the right answers from docs/APP-BUILDING.md, with no model.
2. A code app (the free to-do recipe): "add offline storage to my app" and "add a dark mode switch to my app" write
   tribe-features/ next to the page, add the two lines to index.html and commit; the page runs them (the switch works).
3. App Creator: five features by plain sentences ("add offline storage", "make it searchable", "add a dark mode toggle",
   "add a daily streak", "add up the numbers"); the Add panel lists them; the exported phone web app carries them and
   a tick survives a reload.
4. A backend-auth ask ("add real login with accounts that work on every device") is routed as needing a stronger AI,
   with a ready request, both from the server and inside App Creator.
5. Phones (390 px): App Creator's Add sheet shows "What it does" with 40 px buttons and no sideways scroll.
Usage: python app/test/e2e_flint_appknow.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4961 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text
            and "EventSource" not in m.text and "fonts.g" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); "
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def ask(page, text, rx, timeout=10000):
    page.evaluate("t => TribeFlint.ask(t)", text)
    try:
        page.wait_for_function("rx => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' && new RegExp(rx, 'i').test(l.text); }", arg=rx, timeout=timeout)
    except Exception:
        last = page.evaluate("(() => { const t = TribeFlint.thread(); return t.slice(-2).map(l => l.who + ': ' + String(l.text).slice(0, 200)); })()")
        raise AssertionError(f"{text!r}: Flint never said {rx!r}; last: {last}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-appknow-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="appknow-src-", dir="/tmp")
    repo = os.path.join(work, "chores"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Chores\n"); git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "App Know"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]

        # ---- 4 (server half): honest tiers ----
        t = ok(api("/flint/tier", "POST", {"ask": "add real login with accounts that work on every device"}, token=camp))
        assert t["tier"] == "agent" and "ask before big changes" in t.get("ask", ""), t
        assert ok(api("/flint/tier", "POST", {"ask": "add offline storage to my app"}, token=camp))["recipe"] == "feature:remember"
        fl = ok(api("/flint/features", token=camp)); assert len(fl["features"]) >= 40 and len(fl["groups"]) >= 8, len(fl["features"])

        # a code app to put features in: the free to-do recipe at the top of the repo
        b0 = ok(api(f"/projects/{pid}/flint/build", "POST", {"ask": "build a todo app called Chores"}, token=camp), "todo build")
        assert b0.get("built") and Path(repo, "index.html").exists(), b0

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, pid))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r && window.TribeFlint && window.TribeAppFeatures" % pid, timeout=15000)

            # ---- 1: ten questions, no AI ----
            for q, rx in [("how do I add login to my app", "server|Supabase"), ("how do apps work offline", "service worker"), ("what is a web app manifest", "manifest"),
                          ("should I use a PWA, Expo or Capacitor?", "Expo"), ("how do push notifications work on iPhone?", "16\\.4"), ("how do I store data in my app?", "localStorage|IndexedDB"),
                          ("how do I add a map to my app?", "OpenStreetMap"), ("why does my app lose its data when I reload?", "memory|Remember"), ("how do I take payments in my app?", "payment provider|Stripe"),
                          ("how do I put my app on my home screen?", "Add to Home Screen|Put it on your phone")]:
                ask(host, q, rx)

            # ---- 2: features in the code app ----
            ask(host, "add offline storage to my app", "Added .Remember everything")
            ask(host, "add a dark mode switch to my app", "Added .Dark mode switch")
            ask(host, "what features can you add?", "working features")
            feats = json.loads(Path(repo, "tribe-features", "features.json").read_text())["features"]
            assert feats == ["remember", "darkswitch"], feats
            html = Path(repo, "index.html").read_text()
            assert html.count("tribe-features/features.js") == 1 and html.count("tribe-features/features.css") == 1, html[-400:]
            log = git(repo, "log", "--format=%s", "-n", "3")
            assert "Flint: add “Dark mode switch”" in log and "no AI" in log, log
            cp = ctx.new_page(); watch(cp, "code app")
            cp.goto(Path(repo, "index.html").as_uri())
            cp.wait_for_selector(".tcf-bar .tcf-btn", timeout=8000)
            cp.click(".tcf-bar .tcf-btn"); assert cp.evaluate("document.documentElement.classList.contains('tcf-dark')"), "the dark mode switch works"
            cp.wait_for_timeout(500); cp.reload(); cp.wait_for_selector(".tcf-bar .tcf-btn")
            try: cp.wait_for_function("document.documentElement.classList.contains('tcf-dark')", timeout=5000)   # and it is remembered
            except Exception: raise AssertionError("dark not remembered: " + cp.evaluate("JSON.stringify({ls: Object.fromEntries(Object.entries(localStorage).filter(([k]) => /^tc-app/.test(k))), cls: document.documentElement.className, btn: [...document.querySelectorAll('.tcf-btn')].map(b => b.textContent), sys: matchMedia('(prefers-color-scheme: dark)').matches})"))
            cp.close()

            # ---- 3: App Creator, five features by sentence ----
            host.evaluate("TribeAppCreator.open({ template: 'habits' })")
            host.wait_for_function("TribeAppCreator.state() && TribeAppCreator.state().open && TribeAppCreator.doc()", timeout=10000)
            for say, rx in [("add offline storage", "Remember everything"), ("make it searchable", "Search"), ("add a dark mode toggle", "Dark mode switch"), ("add a daily streak", "Daily streak"), ("add up the numbers", "Totals")]:
                r = host.evaluate("t => TribeAppCreator.ask(t).then(x => x.text)", say)
                assert rx in r, (say, r)
            assert host.evaluate("TribeAppCreator.doc().features") == ["remember", "search", "darkswitch", "streak", "totals"], host.evaluate("TribeAppCreator.doc().features")
            host.click("#apc-left [data-tab='add']"); host.wait_for_selector("#apc-feat-h")
            assert "· 5" in host.inner_text("#apc-feat-h"), host.inner_text("#apc-feat-h")
            assert host.locator(".apc-feat.on").count() == 5
            if take: host.locator("#apc-feat-h").scroll_into_view_if_needed(); host.wait_for_timeout(300); host.screenshot(path=str(SHOTS / "flint-appknow-features.png"))
            # the exported phone web app carries them, and a tick survives a reload
            files = host.evaluate("Object.fromEntries(TribeAppCore.pwa(TribeAppCreator.doc()))")
            out = Path(tempfile.mkdtemp(prefix="appknow-pwa-", dir="/tmp"))
            for k, v in files.items():
                if isinstance(v, str): (out / k).parent.mkdir(parents=True, exist_ok=True); (out / k).write_text(v)
            ap = ctx.new_page(); watch(ap, "exported app")
            ap.goto((out / "index.html").as_uri()); ap.wait_for_selector(".tcf-bar", timeout=8000)
            assert ap.locator(".tcf-search").count() >= 1 and ap.locator(".tcf-streak").count() == 1, "search and streak are on the page"
            n0 = ap.evaluate("document.querySelectorAll('[data-check].done').length")
            ap.locator("[data-check]:not(.done):visible").first.click()
            ap.wait_for_function("n => document.querySelectorAll('[data-check].done').length === n + 1 && Object.keys(localStorage).some(k => /:remember$/.test(k))", arg=n0, timeout=5000)
            ap.wait_for_timeout(500); ap.reload(); ap.wait_for_selector(".tcf-bar")   # Chrome writes localStorage a moment later
            ap.wait_for_function("n => document.querySelectorAll('[data-check].done').length === n + 1", arg=n0, timeout=5000)   # the tick is remembered after a reload
            ap.close()

            # ---- 4 (App Creator half): a server job is said plainly ----
            r = host.evaluate("TribeAppCreator.ask('add real login with accounts that work on every device').then(x => x.text)")
            assert "stronger AI" in r and "server" in r, r
            host.evaluate("TribeAppCreator.close()")

            # ---- 5: phone ----
            pc = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pc.add_init_script(settings_js("Camp", camp, pid))
            ph = pc.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAppCreator", timeout=15000)
            ph.evaluate("TribeAppCreator.open({ template: 'habits' })")
            ph.wait_for_selector("#apc-rack [data-sheet='add']", timeout=10000)
            ph.click("#apc-rack [data-sheet='add']"); ph.wait_for_selector("#apc-feat-h", timeout=5000)
            ph.locator(".apc-featg summary").first.click()
            wide = ph.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
            assert not wide, "no sideways scroll at 390 px"
            bb = ph.locator(".apc-feat").first.bounding_box(); assert bb and bb["height"] >= 40 and bb["x"] >= 0 and bb["x"] + bb["width"] <= 391, bb
            if take: ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "flint-appknow-phone.png"))
            b.close()
        assert not errors, errors
        print("e2e_flint_appknow: OK (10 answers with no AI, features in a code app and in App Creator, export keeps a tick after reload, honest stronger-AI routing, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
