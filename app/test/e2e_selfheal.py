"""End-to-end: self-heal (app/ui/selfheal.js) and the Insights feed (server/insights.js).

1. A normal start settles quietly (no card, no reload).
2. A boot failure (shell.js throws) clears stale caches and reloads exactly once, then shows the calm
   "Something went wrong" card instead of a half-built page; the report lands in the bug inbox with logs;
   Reload after the fix starts normally.
3. A shell that never builds (no error at all) is caught by the watchdog the same way.
4. Version mismatch: the server is updated while the tab is open -> a soft "Reload to use it" prompt.
5. Error budget: identical errors are filed once (dedup + rate limit), and Settings -> Crash reports off files nothing.
6. GET /api/insights: host sees health + explorer items, a member sees only project-visible ones, no secrets;
   POST /api/insights/explorer is host-only.
Usage: python app/test/e2e_selfheal.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4873 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def wait_for(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError(f"timed out: {what}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-heal-", dir="/tmp")
    tribe = os.path.join(tmp, "tribe")
    logf = open(os.path.join(tmp, "server.log"), "a")
    procs = {}

    def start(version):
        procs["srv"] = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9"], stdout=logf, stderr=subprocess.STDOUT,
                                        env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_VERSION": version})
        wait_for(lambda: api("/health")[0] == 200, 15, "server up")

    def stop():
        p = procs.pop("srv", None)
        if p: p.terminate(); p.wait(5)

    passed = False
    try:
        start("0.5.0")
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok = boot["token"]
        pid = ok(api("/me", token=tok))["projects"][0]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder"}, token=tok))["invite"]
        z = ok(api("/join", "POST", {"code": inv["code"], "name": "Zed"})); ztok = z["token"]
        settings = lambda t, extra="": f"if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded','1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', tour:{{done:true}}, server:{{url:'{BASE}', token:'{t}'}}{extra}}})); }}"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- 1. a normal start settles quietly ----------
            ctx = b.new_context(viewport={"width": 1280, "height": 800}); ctx.add_init_script(settings(tok))
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: "boom" not in str(e) and errors.append(f"normal: {e}"))   # the test throws dup boom / optout kaboom on purpose
            loads = []; pg.on("load", lambda: loads.append(1))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeClient && TribeClient.connected()")
            pg.wait_for_function("TribeSelfHeal.state().settled", timeout=8000)
            assert pg.evaluate("TribeSelfHeal.state().page") == "0.5.0", "the page carries its server version"
            assert pg.locator("#sh-card").count() == 0 and len(loads) == 1, ("no card, no reload", len(loads))
            assert pg.evaluate("TribeSelfHeal.healthy()")

            # ---------- 5a. error budget: dedup + rate limit (unit level) ----------
            r = pg.evaluate("""() => { localStorage.removeItem('tribecode.errbudget'); const f = TribeSelfHeal.shouldFile, now = Date.now();
                return [f('TypeError: x is undefined at 12:4', {now}), f('TypeError: x is undefined at 99:1', {now}), f('TypeError: x is undefined', {now: now + 31*60000}),
                        f('a', {now}), f('b', {now}), f('c', {now}), f('d', {now})]; }""")
            assert r == [True, False, True, True, True, True, False], r   # same error (numbers differ) once per 30 min; 5 per hour in all
            # ---------- 5b. bugs.js files identical crashes once ----------
            pg.evaluate("localStorage.removeItem('tribecode.errbudget')")
            for i in range(3): pg.evaluate(f"setTimeout(() => {{ throw new Error('dup boom {i + 1}0') }}, 0)"); pg.wait_for_timeout(150)
            wait_for(lambda: any("dup boom" in x["title"] for x in api("/bugs", token=tok)[1]["bugs"]), 8, "crash filed")
            time.sleep(1.0)
            crash = [x for x in api("/bugs", token=tok)[1]["bugs"] if "dup boom" in x["title"]]
            assert len(crash) == 1 and crash[0].get("count", 1) == 1, crash   # filed once, not merged three times
            # ---------- 5c. Settings: crash reports off ----------
            pg.evaluate("TribeSettings.open('privacy')"); pg.wait_for_selector("#set-crash[aria-checked=true]")
            pg.click("#set-crash"); pg.wait_for_selector("#set-crash[aria-checked=false]")
            assert pg.evaluate("TribeSelfHeal.reportsOn()") is False
            pg.keyboard.press("Escape")
            pg.evaluate("setTimeout(() => { throw new Error('optout kaboom') }, 0)"); time.sleep(1.2)
            assert not any("optout" in x["title"] for x in api("/bugs", token=tok)[1]["bugs"]), "nothing filed with reports off"
            pg.evaluate("TribeStore.set({ crashReports: true })")

            # ---------- 4. version mismatch: the server is updated while the tab is open ----------
            stop(); start("0.6.0")
            # the page reloads itself into the new version (nothing to click), once
            pg.wait_for_function("document.querySelector('meta[name=tribe-version]') && document.querySelector('meta[name=tribe-version]').content === '0.6.0'", timeout=25000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected()")
            assert pg.evaluate("sessionStorage.getItem('tribecode.autoReloaded')") == "0.6.0"
            pg.wait_for_function("TribeSelfHeal.state().settled", timeout=8000); pg.wait_for_timeout(800)
            assert pg.evaluate("TribeSelfHeal.state().page") == "0.6.0" and pg.locator("#sh-ver").count() == 0, "a fresh page has no prompt"
            ctx.close()

            # ---------- 2. boot failure: clear caches, reload once, then the card ----------
            ctx = b.new_context(viewport={"width": 1280, "height": 800}); ctx.add_init_script(settings(tok))
            ctx.add_init_script("if (!sessionStorage.getItem('mkcache')) { sessionStorage.setItem('mkcache', '1'); caches.open('tribecode-stale-test').then(c => c.put('/stale', new Response('old'))); }")
            ctx.route("**/shell.js", lambda route: route.fulfill(status=200, content_type="text/javascript", body="throw new Error('selfheal test: shell broke');"))
            pg = ctx.new_page()
            loads = []; pg.on("load", lambda: loads.append(time.time()))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_selector("#sh-card.blocking", timeout=15000)
            assert len(loads) == 2, f"exactly one automatic reload, got {len(loads)} loads"
            assert "Something went wrong" in pg.inner_text("#sh-card")
            assert 'tribecode-stale-test' not in pg.evaluate("caches.keys()"), "stale caches were cleared"
            assert pg.evaluate("JSON.parse(sessionStorage.getItem('tribecode.heal')).reason").startswith("a script failed"), "the guard remembers why"
            pg.wait_for_timeout(1500)
            assert len(loads) == 2, "no reload loop"
            bug = wait_for(lambda: next((x for x in api("/bugs", token=tok)[1]["bugs"] if x["title"].startswith("Start-up failed")), None), 8, "start-up report filed")
            md = ok(api(f"/bugs/{bug['id']}/markdown", token=tok))["markdown"]
            assert "shell broke" in md, md[:400]   # the recent logs travel with it
            # the user's button: Send report is already done
            assert pg.inner_text("#sh-report") == "Report sent"
            # fixed (e.g. the update finished): Reload starts normally
            ctx.unroute("**/shell.js")
            pg.click("#sh-reload")
            pg.wait_for_function("window.TribeClient && TribeClient.connected()")
            pg.wait_for_function("TribeSelfHeal.state().settled", timeout=8000)
            assert pg.locator("#sh-card").count() == 0 and pg.evaluate("TribeSelfHeal.healthy()")
            ctx.close()

            # ---------- 3. a shell that never builds (no error) -> the watchdog ----------
            ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.add_init_script(settings(tok))
            ctx.route("**/shell.js", lambda route: route.fulfill(status=200, content_type="text/javascript", body="/* nothing */"))
            pg = ctx.new_page()
            loads = []; pg.on("load", lambda: loads.append(1))
            pg.goto(BASE + "/?skipIntro=1&healWait=1500")
            pg.wait_for_selector("#sh-card.blocking", timeout=15000)
            assert len(loads) == 2, len(loads)
            assert "didn't finish starting" in pg.inner_text("#sh-card")
            sw = pg.evaluate("document.querySelector('#sh-card').getBoundingClientRect().width")
            assert sw <= 390, "the card fits a phone"
            ctx.close()
            b.close()

        # ---------- 6. Insights ----------
        st, d = api("/insights")
        assert st == 401, "insights need a member"
        h = ok(api("/insights", token=tok), "host insights")
        kinds = {i["kind"] for i in h["items"]}; sources = {i["source"] for i in h["items"]}
        assert "health" in sources, h["items"]
        assert any("GitHub" in i["title"] for i in h["items"]), [i["title"] for i in h["items"]]   # no token for pushes yet
        assert all(set(i) >= {"id", "kind", "title", "body", "source", "at"} for i in h["items"])
        assert kinds <= {"optimization", "suggestion", "issue", "health"}, kinds
        findings = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 60)), "version": "0.6.0",   # newer than any .explore/findings.json in the checkout "summary": {"critical": 0, "high": 1, "medium": 1, "low": 0},
                    "findings": [{"id": "abc1234567", "kind": "dead", "severity": "high", "title": "Button does nothing", "detail": "Click Foo", "views": ["Chat"], "contexts": ["desktop"]},
                                 {"id": "def1234567", "kind": "contrast", "severity": "medium", "title": "Text contrast too low", "detail": "2.5:1 token=ghp_SECRET123456789", "views": ["Home"], "contexts": ["phone"]}],
                    "journeys": [{"id": "invite", "title": "Invite a friend", "pass": False, "clicks": 3, "notes": ["no link"]}], "suggestions": [{"idea": "Wire dead buttons", "why": "1 dead"}]}
        assert api("/insights/explorer", "POST", findings, token=ztok)[0] == 403, "only the host uploads explorer runs"
        ok(api("/insights/explorer", "POST", findings, token=tok), "host uploads")
        h = ok(api("/insights", token=tok))
        ex = [i for i in h["items"] if i["source"] == "explorer"]
        assert any("Button does nothing" in i["title"] for i in ex) and any(i["kind"] == "suggestion" for i in ex), ex
        assert "ghp_SECRET" not in json.dumps(h), "secrets are scrubbed"
        zh = ok(api("/insights", token=ztok), "member insights")
        assert all(i["source"] != "health" or i.get("public") for i in zh["items"]), "host health stays with the host"
        assert "disk" not in json.dumps(zh).lower()
        passed = True
    finally:
        stop()
        print(open(os.path.join(tmp, "server.log")).read()[-1500:] if not passed else "")
    assert not errors, errors
    print("e2e_selfheal: OK (normal start, boot failure -> clear + one reload -> card + report, watchdog, version prompt, error budget, opt-out, insights)")


if __name__ == "__main__":
    main()
