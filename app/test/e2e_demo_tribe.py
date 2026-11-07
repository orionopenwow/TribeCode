"""End-to-end: the demo tribe (scripts/start-demo-tribe.js + POST /api/host/demo-tribe).

A host signs in first (as the desktop app would) and saves a GitHub token (GitHub REST API mocked by a local
server, pushes go to local bare repos). Then the script runs against the server and must:
  - copy templates/lantern-run and templates/tavern-3d to <dir>/<name> as git repos with a first commit,
  - make both projects through the flow: roles whose folders are the game's lanes, a plan with 5-8 tasks
    per project tagged to lanes, notes, a pinned living doc, a proposal vote, toolbox picks, autopilot on,
  - push both repos to (mock) GitHub with the host's token,
  - leave the host's own key working (no rotation), refuse remote callers, and reuse projects on a re-run,
  - print the invite link and the `claude mcp add` command, whose key works over MCP.
Then each game loads in Chromium with no console errors: Lantern Run's gameplay is checked through its
debug hook (falls onto the ground, jumps, runs, embers), and Tavern 3D runs with three.js from the CDN when
reachable, else from the npm registry tarball of the same pinned version, else that part is skipped.
Usage: python app/test/e2e_demo_tribe.py
"""
import json, os, re, subprocess, sys, tarfile, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4889 + OFF
BASE = f"http://localhost:{PORT}"
TOKEN = "ghp_" + "D3mo" * 9
THREE_VER = "0.170.0"
THREE_URL = f"https://cdn.jsdelivr.net/npm/three@{THREE_VER}/build/three.module.js"
errors = []


def api(path, method="GET", body=None, token=None, project=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            try: return r.status, json.loads(raw or b"{}")
            except ValueError: return r.status, raw.decode()
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]

def wait_until(fn, timeout=25, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError(f"timed out waiting for {what}")

def git(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


GH = {"calls": [], "root": None}
class GitHubMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        GH["calls"].append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
        if self.headers.get("Authorization") != "Bearer " + TOKEN: return self.reply(401, {"message": "Bad credentials"})
        if self.path != "/user/repos": return self.reply(404, {"message": "Not Found"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "camp/" + body["name"], "private": True, "clone_url": bare, "html_url": "https://github.com/camp/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


def serve(folder, port):
    return subprocess.Popen(["node", str(Path(folder) / "serve.js"), str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def wait_http(url, tries=40):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception: time.sleep(0.15)
    return False

def three_source(cache):
    """three.module.js for the pinned version: the CDN if this machine reaches it, else the npm registry tarball."""
    f = Path(cache) / f"three-{THREE_VER}.module.js"
    if f.exists(): return str(f), "cache"
    try:
        with urllib.request.urlopen(THREE_URL, timeout=8) as r: f.write_bytes(r.read()); return str(f), "cdn"
    except Exception: pass
    try:
        out = subprocess.run(["npm", "pack", f"three@{THREE_VER}", "--silent"], cwd=cache, capture_output=True, text=True, timeout=120)
        tgz = Path(cache) / (out.stdout.strip().splitlines() or [""])[-1]
        if tgz.is_file():
            with tarfile.open(tgz) as t: f.write_bytes(t.extractfile("package/build/three.module.js").read())
            return str(f), "npm"
    except Exception: pass
    return None, "unreachable"


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-demo-", dir="/tmp")
    tribe, projects = os.path.join(tmp, "tribe"), os.path.join(tmp, "projects")
    GH["root"] = tempfile.mkdtemp(prefix="demo-gh-", dir="/tmp")
    gh = ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}", "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_REPO_POLL_MS": "1000"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    games = []
    ok = False
    try:
        wait_until(lambda: api("/health")[0] == 200, 20, "server")
        # The host is already signed in (the desktop app) and has a GitHub token saved.
        st, boot = api("/bootstrap", "POST", {"name": "Camp"}); assert st == 200, boot
        host = boot["token"]
        assert api("/me/git", "PUT", {"githubToken": TOKEN}, token=host)[0] == 200

        # Remote callers never reach it (a tunnel relays from 127.0.0.1 but carries forwarding headers).
        st, body = api("/host/demo-tribe", "POST", {"projects": [{"path": "/tmp"}]}, headers={"X-Forwarded-For": "8.8.8.8"})
        assert st == 403, (st, body)

        # ---- the script ----
        run = subprocess.run(["node", str(ROOT / "scripts" / "start-demo-tribe.js"), "--port", str(PORT), "--dir", projects, "--no-share", "--no-open", "--no-start"],
                             capture_output=True, text=True, timeout=240, env=env)
        print(run.stdout); assert run.returncode == 0, run.stderr + run.stdout
        assert "Lantern Run" in run.stdout and "Tavern 3D" in run.stdout
        assert run.stdout.count("https://github.com/camp/") == 2, "both repos reported on GitHub"
        join = re.search(r"Invite link[^:]*: (\S+)", run.stdout).group(1)
        assert re.search(r"[#/](join/|.*c=)[A-Za-z0-9]+", join), join
        cmd = re.search(r"(claude mcp add --transport http tribecode \S+ --header \"Authorization: Bearer ([A-Za-z0-9_-]+)\")", run.stdout)
        assert cmd, run.stdout
        agent_key = cmd.group(2)

        # The host's own key still works: the desktop app stays signed in.
        st, me = api("/me", token=host); assert st == 200 and me.get("member", me).get("name", "Camp") == "Camp", (st, me)

        # ---- repos on disk ----
        for d, must in [("lantern-run", ["index.html", "serve.js", "src/main.js", "src/player/player.js", "src/levels/level-3.json", "src/art/palette.js", "src/audio/sfx.js", "src/ui/hud.js", "README.md", "VISION.md", "PLAN.md", "CLAUDE.md"]),
                        ("tavern-3d", ["index.html", "src/main.js", "src/scene/room.js", "src/npcs/patrons.json", "src/player/controls.js", "src/ui/roster.js", "README.md", "VISION.md", "PLAN.md", "CLAUDE.md"])]:
            repo = os.path.join(projects, d)
            for f in must: assert os.path.isfile(os.path.join(repo, f)), f"{d}/{f}"
            log1 = git(repo, "log", "--format=%s")
            assert "starter from TribeCode's demo tribe" in log1, log1
            games.append(repo)
        # PLAN.md is rewritten and committed by the living plan
        wait_until(lambda: "TribeCode: first plan" in git(games[0], "log", "--format=%s"), 15, "PLAN.md commit")

        # ---- projects through the flow ----
        plist = api("/projects", token=host)[1]["projects"]
        by = {p["name"]: p for p in plist}
        assert "Lantern Run" in by and "Tavern 3D" in by, list(by)
        lanes = {"Lantern Run": {"src/player/", "src/levels/", "src/art/", "src/audio/", "src/ui/"}, "Tavern 3D": {"src/scene/", "src/npcs/", "src/player/", "src/ui/"}}
        living = {"Lantern Run": "Level design notes", "Tavern 3D": "NPC personalities"}
        shelf = {"Lantern Run": ["jsfxr", "pixelfx"], "Tavern 3D": ["threejs", "howler"]}
        for name, p in by.items():
            if name not in lanes: continue
            pid = p["id"]
            roles = api(f"/projects/{pid}/roles", token=host)[1]
            folders = {f["path"] for f in roles["folders"]}
            assert lanes[name] <= folders, (name, folders)
            assert any(r["name"] == "Lead" and r["people"] and r["people"][0]["name"] == "Camp" for r in roles["roles"]), roles["roles"]
            flow = api("/flow", token=host, project=pid)[1]["flow"]
            assert flow["status"] == "running" and flow["plan"]["by"] == "starter", flow["plan"]
            items = [i for m in flow["plan"]["milestones"] for i in m["items"]]
            assert 5 <= len(items) <= 8, len(items)
            assert {i["role"] for i in items} >= {r["id"] for r in roles["roles"] if r["id"] != "lead"} - {"lead"}, "every lane has a task"
            tasks = api("/tasks", token=host, project=pid)[1]["tasks"]
            assert len([t for t in tasks if t.get("source") == "plan"]) == len(items)
            assert len(flow["notes"]) == 2, flow["notes"]
            docs = api("/docs", token=host, project=pid)[1]["docs"]
            doc = next(d for d in docs if d["title"] == living[name])
            full = api(f"/docs/{doc['slug']}", token=host, project=pid)[1]
            full = full.get("doc", full)
            assert len(full["body"]) > 400 and full.get("pinned"), (name, full.get("pinned"))
            tb = next(d for d in docs if d["title"] == "Toolbox")
            tbody = api(f"/docs/{tb['slug']}", token=host, project=pid)[1]; tbody = tbody.get("doc", tbody)["body"]
            for sid in shelf[name]: assert f"<!-- shelf:{sid} -->" in tbody, (name, sid)
            votes = api("/chat/general/votes", token=host, project=pid)[1]["votes"]
            assert any(v["q"].startswith("Proposal:") for v in votes), votes
            st, repo = api("/repo", token=host, project=pid)
            assert repo["settings"]["autopilot"]["enabled"] and repo["settings"]["autopilot"]["commitContext"], repo["settings"]
            # GitHub: the host's token made a private repo and the starter + plan were pushed to it.
            gh_step = wait_until(lambda: (api("/flow", token=host, project=pid)[1]["flow"]["steps"]["github"]["s"] in ("ok", "fail")) and api("/flow", token=host, project=pid)[1]["flow"], 30, f"{name} github")
            assert gh_step["steps"]["github"]["s"] == "ok", gh_step["steps"]["github"]
            bare = os.path.join(GH["root"], gh_step["github"]["name"].split("/")[-1] + ".git")
            assert "demo tribe" in git(bare, "log", "--format=%s", "main"), "pushed to GitHub"
            log.seek(0); assert TOKEN not in log.read(), 'the GitHub token never lands in the log'

        # The printed Claude Code key works over MCP and sees both projects.
        isErr, txt = mcp(agent_key, "list_projects"); assert not isErr and "Lantern Run" in txt and "Tavern 3D" in txt, txt

        # A second run reuses everything (no duplicate projects).
        run2 = subprocess.run(["node", str(ROOT / "scripts" / "start-demo-tribe.js"), "--port", str(PORT), "--dir", projects, "--no-share", "--no-open", "--no-start"], capture_output=True, text=True, timeout=120, env=env)
        assert run2.returncode == 0 and "already set up" in run2.stdout, run2.stdout + run2.stderr
        assert len(api("/projects", token=host)[1]["projects"]) == len(plist)
        assert api("/me", token=host)[0] == 200

        # ---- the games in Chromium ----
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
            # Lantern Run
            gp = 4960 + OFF; gs = serve(games[0], gp)
            try:
                assert wait_http(f"http://localhost:{gp}/")
                pg = b.new_page(viewport={"width": 960, "height": 540}); errs = []
                pg.on("console", lambda m: m.type == "error" and errs.append(m.text)); pg.on("pageerror", lambda e: errs.append(str(e)))
                pg.goto(f"http://localhost:{gp}/")
                pg.wait_for_function("window.__lantern && __lantern.state === 'title'", timeout=15000)
                pg.keyboard.press("Enter"); pg.wait_for_function("__lantern.state === 'play'")
                pg.evaluate("__lantern.manual(true); __lantern.start(0)")
                s0 = pg.evaluate("__lantern.step(0)")
                s = pg.evaluate("__lantern.step(1.0)")
                assert s["onGround"] and s["y"] >= s0["y"], ("falls onto the ground", s0, s)
                ground = s["y"]
                pg.evaluate("__lantern.press('jump')"); pg.evaluate("__lantern.step(1/60)")
                up = pg.evaluate("__lantern.step(0.25)")
                assert up["y"] < ground - 20 and not up["onGround"], ("jump goes up", ground, up)
                pg.evaluate("__lantern.release('jump')")
                back = pg.evaluate("__lantern.step(1.2)"); assert back["onGround"] and abs(back["y"] - ground) < 1, ("lands again", back)
                x0 = back["x"]; pg.evaluate("__lantern.press('right')"); pg.evaluate("__lantern.step(0.25)")
                pg.evaluate("__lantern.press('jump')"); run_ = pg.evaluate("__lantern.step(0.6)"); pg.evaluate("__lantern.release('jump'); __lantern.release('right')")
                assert run_["x"] > x0 + 50, ("runs right", x0, run_)
                assert pg.evaluate("__lantern.level.embers.some(e => e.taken)"), "a running jump picks up an ember"
                assert pg.evaluate("__lantern.light") > 0.5
                pg.evaluate("__lantern.manual(false)"); time.sleep(0.4)
                assert not errs, errs
            finally: gs.kill()

            # Tavern 3D
            src, how = three_source(tempfile.gettempdir())
            if not src:
                print("  SKIP tavern-3d in the browser: three.js unreachable (CDN and npm) from this machine")
            else:
                tp = 4961 + OFF; ts = serve(games[1], tp)
                try:
                    assert wait_http(f"http://localhost:{tp}/")
                    pg = b.new_page(viewport={"width": 1280, "height": 720}); errs = []
                    pg.route(THREE_URL, lambda r: r.fulfill(path=src, content_type="text/javascript"))
                    pg.on("console", lambda m: m.type == "error" and errs.append(m.text)); pg.on("pageerror", lambda e: errs.append(str(e)))
                    pg.goto(f"http://localhost:{tp}/?seed=7")
                    pg.wait_for_function("window.__tavern && __tavern.patrons.length > 0", timeout=20000)
                    n = pg.evaluate("__tavern.patrons.length"); assert n >= 5, n
                    assert pg.locator(".label .bot").count() == n, "every patron is tagged BOT"
                    pg.click("#enter"); pg.evaluate("__tavern.manual(true)")
                    before = pg.evaluate("__tavern.patrons.map(p => [p.x, p.z])")
                    after = pg.evaluate("__tavern.step(6).map(p => [p.x, p.z])")
                    moved = sum(1 for a, c in zip(before, after) if abs(a[0] - c[0]) + abs(a[1] - c[1]) > 0.5)
                    assert moved >= 3, ("patrons walk around", moved)
                    doing = pg.evaluate("__tavern.patrons.map(p => p.activity)")
                    assert any(d in ("tending the bar", "playing a tune", "cooking", "sitting") for d in doing), doing
                    # the Patrons panel and an order
                    pg.keyboard.press("Tab"); pg.wait_for_selector("#roster:not([hidden]) .patron")
                    assert pg.locator("#roster .patron .bot").count() == n
                    pg.click("#roster .patron[data-id='pip'] [data-order='follow']")
                    assert pg.evaluate("__tavern.patrons.find(p => p.id === 'pip').mode") == "follow"
                    pg.evaluate("__tavern.player.x = 0; __tavern.player.z = 3")
                    pip = pg.evaluate("(() => { __tavern.step(8); const p = __tavern.patrons.find(p => p.id === 'pip'); return Math.hypot(p.x - 0, p.z - 3); })()")
                    assert pip < 2.6, ("Pip follows the player", pip)
                    assert "following" in pg.inner_text("#roster .patron[data-id='pip'] .doing")
                    pg.click("#roster .patron[data-id='pip'] [data-order='home']")
                    assert pg.evaluate("__tavern.patrons.find(p => p.id === 'pip').mode") == "free"
                    # talking: a bubble appears
                    pg.evaluate("(() => { const j = __tavern.patrons.find(p => p.id === 'pip'), pl = __tavern.player; pl.yaw = Math.atan2(j.x - pl.x, j.z - pl.z) - Math.PI; pl.pitch = 0; j.talkTo(pl); })()")
                    pg.evaluate("__tavern.step(0.05)")
                    assert pg.locator(".label[data-patron='pip'] .bubble:not([hidden])").count() == 1
                    pg.evaluate("__tavern.manual(false)"); time.sleep(0.5)
                    assert not errs, errs
                    print(f"  tavern-3d ran with three.js from {how}")
                finally: ts.kill()
            b.close()
        ok = True
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        gh.shutdown()
        if not ok:
            log.seek(0); print("---- server log ----\n" + log.read()[-4000:])
    print("e2e_demo_tribe: OK" if ok else "e2e_demo_tribe: FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
