"""Real build results (feat/build-feeds, server/checks.js, the Build status card in app/ui/wcards.js).
  - a passing and a failing package.json project; a tribe.json check; a static check for a plain HTML project
  - the time limit stops a hanging check; a noisy check's output is capped
  - the check's environment has none of the server's secrets, HOME is a scratch folder, cwd is the project folder
  - off by default on a project other members can write; only a lead turns it on; the static check always runs
  - one run per project, queued, never two at once on the host
  - a ship runs the checks and tells the person who shipped
  - the result reaches /api/dash/signal's store: the Build status card and Needs attention show pass/fail, duration
    and the failing lines; "Run checks" on the card; Flint's "run the checks"
  - MCP checks_status / checks_run
--shots writes docs/screenshots/build-checks.png.
Usage: python3 app/test/e2e_build_runner.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6480 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
SECRET = "sk-test-SUPERSECRET-0123456789abcdef"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def mcp(token, project, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "X-Project": project})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]


def wait(fn, what, t=60):
    end = time.time() + t
    while time.time() < end:
        try: v = fn()
        except AssertionError: raise
        except Exception: v = None
        if v: return v
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-checks-", dir="/tmp"))
    home = tmp / "home"; home.mkdir()
    marks = tmp / "marks.log"
    def folder(name, files):
        d = home / "Code" / name; d.mkdir(parents=True)
        for f, text in files.items(): (d / f).write_text(text)
        return d
    probe = "console.log('ENV ' + JSON.stringify(process.env)); console.log('CWD ' + process.cwd());"
    folder("passing", {"package.json": json.dumps({"name": "passing", "scripts": {"test": "node test.js", "lint": "node -e \"console.log('lint ok')\""}}), "test.js": probe + " console.log('2 passing');\n"})
    folder("failing", {"package.json": json.dumps({"name": "failing", "scripts": {"test": "node test.js", "build": "node -e \"console.log('never')\""}}),
                       "test.js": "console.log('1 passing');\nconsole.error('AssertionError: expected 2 to equal 3');\nconsole.error('  ✗ adds numbers');\nprocess.exit(1);\n"})
    folder("hanging", {"tribe.json": json.dumps({"check": ["node", "-e", "console.log('started'); setInterval(() => {}, 1000)"], "checkTimeout": 5})})
    folder("noisy", {"tribe.json": json.dumps({"check": "node -e \"for (let i = 0; i < 4000; i++) console.log('line ' + i + ' ' + 'x'.repeat(200))\""})})
    slow = f"const fs=require('fs');fs.appendFileSync({json.dumps(str(marks))},'start '+process.argv[2]+' '+Date.now()+'\\n');setTimeout(()=>fs.appendFileSync({json.dumps(str(marks))},'end '+process.argv[2]+' '+Date.now()+'\\n'),1500)"
    for n in ("q1", "q2"): folder(n, {"slow.js": slow, "tribe.json": json.dumps({"check": ["node", "slow.js", n]})})
    page_dir = folder("page", {"index.html": "<!doctype html><title>Page</title><link rel=stylesheet href='style.css'><script src='app.js'></script><img src='https://example.com/x.png'>", "style.css": "body{}", "app.js": "const a = 1;\n"})
    folder("shared", {"package.json": json.dumps({"name": "shared", "scripts": {"test": "node -e \"console.log('ran')\""}})})
    folder("empty", {"notes.txt": "nothing to check"})
    ghroot = tmp / "github"; (ghroot / "camp").mkdir(parents=True)
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(ghroot / "camp" / "ship.git")], check=True)
    folder("ship", {"package.json": json.dumps({"name": "ship", "scripts": {"test": "node -e \"process.exit(3)\""}}), "index.html": "<h1>Ship</h1>"})

    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home),
           "TRIBE_CHECK_MAX_OUTPUT": "20000", "TRIBE_GITHUB_GIT": str(ghroot), "MY_API_KEY": SECRET, "TRIBE_SECRET_THING": SECRET, "GITHUB_TOKEN": SECRET, "ANTHROPIC_API_KEY": SECRET}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait(lambda: api("/health")[0] == 200, "server")
        st, d = api("/bootstrap", "POST", {"name": "Camp"}); assert st == 200, d; host = d["token"]
        pids = {}
        for n in ("passing", "failing", "hanging", "noisy", "q1", "q2", "page", "shared", "empty", "ship"):
            st, d = api("/projects", "POST", {"name": n.title()}, token=host); assert st == 200, d; pids[n] = d["project"]["id"]
            st, d = api(f"/projects/{pids[n]}/folder", "PUT", {"path": f"~/Code/{n}", "gitInit": n == "ship"}, token=host); assert st == 200, d
        def checks(n, token=host): st, d = api("/checks", token=token, project=pids[n]); assert st == 200, d; return d
        def run(n, token=host): return api("/checks/run", "POST", {}, token=token, project=pids[n])
        def done(n, count=1, t=90): return wait(lambda: (lambda c: c if len(c["runs"]) >= count and not c["running"] and not c["queued"] else None)(checks(n)), f"{n} to finish", t)
        def log(n, i=0): c = checks(n); st, d = api(f"/checks/runs/{c['runs'][i]['id']}", token=host, project=pids[n]); assert st == 200, d; return d["run"]["log"]

        # ---------- what each project's check is ----------
        assert checks("passing")["what"] == {"kind": "npm", "label": "npm run test, npm run lint", "why": None, "runsCode": True}, checks("passing")["what"]
        assert checks("hanging")["what"]["kind"] == "tribe" and checks("page")["what"]["kind"] == "static"
        c = checks("empty"); assert c["what"]["kind"] == "none" and not c["allowed"] and not c["can"]["run"], c
        assert run("empty")[0] == 404
        assert checks("passing")["allowed"] and not checks("passing")["shared"], "the host is the only writer: on by default"

        # ---------- pass: both scripts run, in a clean environment ----------
        st, d = run("passing"); assert st == 200 and d["queued"], d
        c = done("passing"); r = c["runs"][0]
        assert r["ok"] and r["state"] == "pass" and r["ms"] > 0 and [s["name"] for s in r["steps"]] == ["npm run test", "npm run lint"], r
        text = log("passing")
        assert "2 passing" in text and "lint ok" in text, text[-400:]
        assert SECRET not in text and "SUPERSECRET" not in text, "the server's secrets never reach a check"
        envline = next(l for l in text.split("\n") if l.startswith("ENV ")); seen = json.loads(envline[4:])
        leaked = [k for k in seen if k.startswith("TRIBE_") and k != "TRIBE_CHECK" or "TOKEN" in k or "API_KEY" in k]
        assert not leaked, leaked
        assert seen["HOME"] != str(home) and "tribe-check-" in seen["HOME"] and seen["CI"] == "1", seen["HOME"]
        assert not os.path.exists(seen["HOME"]), "the scratch home is removed afterwards"
        cwd = next(l for l in text.split("\n") if l.startswith("CWD "))[4:]
        assert os.path.realpath(cwd) == os.path.realpath(home / "Code" / "passing"), cwd
        sig = api("/dash/band", token=host, project=pids["passing"])[1]["band"]["signals"]["build"]
        assert sig["ok"] and sig["source"] == "checks" and "passed" in sig["text"], sig
        assert not [i for i in api("/dash/criticals", token=host, project=pids["passing"])[1]["items"] if i["k"] == "build"]

        # ---------- fail: stops at the failing step, keeps the failing lines ----------
        run("failing"); c = done("failing"); r = c["runs"][0]
        assert not r["ok"] and r["state"] == "fail" and len(r["steps"]) == 1, r
        assert r["lines"][0] == "npm run test failed (exit 1)" and any("AssertionError: expected 2 to equal 3" in l for l in r["lines"]), r["lines"]
        crit = [i for i in api("/dash/criticals", token=host, project=pids["failing"])[1]["items"] if i["k"] == "build"]
        assert len(crit) == 1 and crit[0]["title"] == "The checks are failing" and "AssertionError" in crit[0]["sub"] and crit[0]["ms"] > 0, crit
        inbox = api("/notify/inbox", token=host)[1]["items"]
        assert any(i.get("type") == "build" and "Checks failed on Failing" in i.get("title", "") for i in inbox), [i.get("title") for i in inbox]

        # ---------- the time limit ----------
        t0 = time.time(); run("hanging"); c = done("hanging"); r = c["runs"][0]
        assert r["state"] == "timeout" and not r["ok"] and 4500 <= r["ms"] < 12000 and "time limit" in r["lines"][0], r
        assert time.time() - t0 < 30
        crit = [i for i in api("/dash/criticals", token=host, project=pids["hanging"])[1]["items"] if i["k"] == "build"]
        assert crit[0]["title"] == "The checks ran out of time", crit
        time.sleep(0.5)
        assert "setInterval" not in subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True).stdout, "the hanging process is gone"

        # ---------- the output cap ----------
        run("noisy"); c = done("noisy"); r = c["runs"][0]
        assert r["ok"] and r.get("capped"), r
        text = log("noisy"); assert len(text) < 60000 and "cut" in text and "line 0 " in text and "line 3999 " in text, len(text)

        # ---------- queue: one at a time on the host, one waiting run per project ----------
        a = run("q1")[1]; b2 = run("q1")[1]; c2 = run("q2")[1]; d2 = run("q2")[1]
        assert a["queued"] and c2["queued"] and (b2.get("already") or d2.get("already")), (a, b2, c2, d2)
        wait(lambda: marks.exists() and marks.read_text().count("end ") >= 2, "both queued runs")
        done("q1"); done("q2")
        time.sleep(2.5)   # a second q1 run may have been queued behind the running one
        ev = [l.split() for l in marks.read_text().strip().split("\n")]
        depth = 0
        for kind, _, _ in ev:
            depth += 1 if kind == "start" else -1
            assert depth <= 1, f"two checks ran at once: {ev}"

        # ---------- a plain HTML project: files exist, scripts parse, nothing runs ----------
        run("page"); c = done("page"); assert c["runs"][0]["ok"] and c["runs"][0]["kind"] == "static", c["runs"][0]
        (page_dir / "app.js").write_text("const a = ;\n")
        (page_dir / "index.html").write_text("<!doctype html><script src='app.js'></script><script src='gone.js'></script><img src='../../../secret.png'><script>function ( {</script>")
        run("page"); c = done("page", 2); r = c["runs"][0]
        assert not r["ok"], r
        text = log("page")
        assert "gone.js is missing" in text and "app.js" in text and "outside the project folder" in text and "inline script 1" in text, text

        # ---------- off by default once someone else can write; a lead turns it on ----------
        def join(role, name, n):
            st, d = api("/invites", "POST", {"role": role, "maxUses": 1, "project": pids[n]}, token=host); assert st == 200, d
            st, d = api("/join", "POST", {"code": d["invite"]["code"], "name": name}); assert st == 200, d; return d["token"]
        assert checks("shared")["allowed"], "before anyone joins"
        maya = join("builder", "Maya", "shared"); sam = join("spectator", "Sam", "shared")
        c = checks("shared", maya)
        assert not c["allowed"] and c["off"] and c["needsLead"] and c["shared"] and "runs that code on the host" in c["reason"] and c["can"] == {"run": False, "set": False}, c
        st, d = run("shared", maya); assert st == 409 and "lead" in d["error"], d
        st, d = run("shared"); assert st == 409, "off for the host too until switched on"
        assert api("/checks", "PUT", {"on": True}, token=maya, project=pids["shared"])[0] == 403
        assert api("/checks", "PUT", {"on": True}, token=sam, project=pids["shared"])[0] == 403
        assert checks("shared")["runs"] == [], "nothing ran"
        st, d = api("/checks", "PUT", {"on": True}, token=host, project=pids["shared"]); assert st == 200 and d["allowed"] and d["settings"]["on"] is True, d
        assert run("shared", sam)[0] == 403, "spectators can't run"
        st, d = run("shared", maya); assert st == 200, d
        c = done("shared"); assert c["runs"][0]["ok"] and c["runs"][0]["byName"] == "Maya", c["runs"][0]
        api("/checks", "PUT", {"on": False}, token=host, project=pids["shared"]); assert run("shared")[0] == 409
        api("/checks", "PUT", {"on": True}, token=host, project=pids["shared"])
        # the static check runs nothing, so a shared HTML project is still checked
        join("builder", "Noor", "page"); assert checks("page")["allowed"]

        # ---------- a ship runs the checks and tells the shipper ----------
        st, d = api(f"/projects/{pids['ship']}/sync", "PUT", {"repo": "camp/ship"}, token=host); assert st == 200, d
        st, d = api(f"/projects/{pids['ship']}/sync/ship", "POST", {"message": "First"}, token=host); assert st == 200 and d["shipped"], d
        c = done("ship"); r = c["runs"][0]
        assert r["why"] == "ship" and r["state"] == "fail" and r["lines"][0] == "npm run test failed (exit 3)" and r.get("sha"), r

        # ---------- last 20 runs ----------
        for i in range(22): run("page"); done("page", min(20, 3 + i), 30)
        assert len(checks("page")["runs"]) == 20

        # ---------- MCP ----------
        st, ag = api("/agents", "POST", {}, token=host, project=pids["failing"]); assert st == 200, ag
        r = mcp(ag["token"], pids["failing"], "checks_status"); body = json.loads(r["content"][0]["text"])
        assert body["kind"] == "npm" and body["last"]["state"] == "fail" and body["allowed"], body
        r = mcp(ag["token"], pids["failing"], "checks_run"); assert not r.get("isError") and "Queued" in r["content"][0]["text"], r
        done("failing", 2)
        st, ag2 = api("/agents", "POST", {}, token=maya, project=pids["shared"]); assert st == 200, ag2
        api("/checks", "PUT", {"on": None}, token=host, project=pids["shared"])
        r = mcp(ag2["token"], pids["shared"], "checks_run"); assert r.get("isError") and "lead" in r["content"][0]["text"], r

        # ---------- the card, Needs attention, Flint ----------
        fp = pids["failing"]
        st, d = api(f"/projects/{fp}/widgets", "PUT", {"widgets": [{"kind": "card", "key": "build"}]}, token=host); assert st == 200, d
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Camp', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{host}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}})); localStorage.setItem('tribecode.project:{BASE}', '{fp}'); }} catch (e) {{}}")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid && window.TribeCards", arg=fp, timeout=30000)
            card = "#wg-cards .wgc[data-key='build']"
            pg.wait_for_selector(card + " [data-wgc-checks='fail']", timeout=20000)
            txt = pg.inner_text(card)
            assert "Checks: failing" in txt and "npm run test failed (exit 1)" in txt and "AssertionError: expected 2 to equal 3" in txt and (" s" in txt or " ms" in txt), txt
            assert "Build: failing" not in txt, "the runner's result is shown once"
            pg.evaluate(f"TribeProjects.switchTo({json.dumps(fp)}, 'home')")
            pg.wait_for_selector("#pj-crit-slot .db-item[data-k=build]", timeout=20000)
            crit = pg.inner_text("#pj-crit-slot .db-item[data-k=build]")
            assert "The checks are failing" in crit and "AssertionError" in crit, crit
            pg.click(card + " [data-wgc-act='checks-log']"); pg.wait_for_selector(".wgc-log pre")
            assert "✗ adds numbers" in pg.inner_text(".wgc-log pre")
            if take: pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / "build-checks.png"))
            pg.keyboard.press("Escape"); pg.evaluate("window.TribeWidgets && TribeWidgets.closePop && TribeWidgets.closePop()")
            # fix it, press Run checks: the card and Needs attention turn over
            (home / "Code" / "failing" / "test.js").write_text("console.log('3 passing');\n")
            n = len(checks("failing")["runs"])
            pg.click(card + " [data-wgc-act='checks-run']")
            done("failing", n + 1)
            pg.wait_for_selector(card + " [data-wgc-checks='pass']", timeout=20000)
            assert "Checks: passing" in pg.inner_text(card)
            pg.wait_for_function("!document.querySelector('#pj-crit-slot .db-item[data-k=build]')", timeout=20000)
            # the lead's switch says what it means
            pg.click(card + " [data-wgc-act='checks-set']"); pg.wait_for_selector("#wgc-checks-warn")
            warn = pg.inner_text("#wgc-checks-warn")
            assert "runs this project's scripts on the host computer" in warn and "Anyone who can change the project's code" in warn, warn
            pg.evaluate("TribeWidgets.closePop()")
            # Flint
            out = pg.evaluate("(async () => { const s = TribeNLU.parse('run the checks', {}).steps[0]; const r = await TribeFlintCmds.run(s, { pushUndo() {}, connected: () => true, tasks: () => [], T: k => k }); return [s.intent, r.text]; })()")
            assert out[0] == "checks.run" and "Running npm run test" in out[1], out
            done("failing", n + 2)
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_build_runner")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
