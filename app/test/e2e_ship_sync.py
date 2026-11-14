"""GitHub as a synced copy of any home (feat/folder-sync, server/sync.js, app/ui/livingrepo.js). A local bare git repo
plays GitHub (TRIBE_GITHUB_GIT) and a tiny local server plays the GitHub API for pull requests.
  - manual ship pushes (and nothing leaves before Ship is pressed)
  - auto-ship on approve and on task Done; the interval trigger
  - PR mode opens a pull request (mocked API) with the token in the header only
  - excludes are respected and .tribe/ is never shipped
  - a pull conflict stops and shows; Keep mine resolves it
  - pause stops auto-ship and manual ship
  - Undo last backup pushes a revert
  - only leads change settings; builders can ship; spectators can't
  - tokens never appear in logs or responses
  - a shared folder as the remote (a temp dir plays Dropbox): two clients push and pull, a conflict stops, a
    half-synced shared repo (a lock file left by the sync app) is detected and nothing is written
  - the UI: the one home pill, the sync sheet (screenshot docs/screenshots/ship-settings.png), the three sharing paths
Usage: python3 app/test/e2e_ship_sync.py
"""
import json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, GHPORT = 6420 + OFF, 6421 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
TOKEN = "ghp_SECRETtoken1234567890abcdefABCDEF12"
PRS = []

class GH(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        PRS.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
        out = json.dumps({"number": len(PRS), "html_url": f"https://github.com/camp/game/pull/{len(PRS)}"}).encode()
        self.send_response(201); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(out))); self.end_headers(); self.wfile.write(out)

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: raw = x.read(); return x.status, json.loads(raw or b"{}"), raw.decode()
    except urllib.error.HTTPError as e: raw = e.read(); return e.code, json.loads(raw or b"{}"), raw.decode()

def git(*a, cwd=None):
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True, env=env).stdout.strip()

def wait(fn, what, t=20):
    end = time.time() + t
    while time.time() < end:
        try: v = fn()
        except Exception: v = None
        if v: return v
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sync-", dir="/tmp"))
    home, ghroot = tmp / "home", tmp / "github"
    (ghroot / "camp").mkdir(parents=True); home.mkdir()
    bare = ghroot / "camp" / "game.git"; git("init", "-q", "--bare", "-b", "main", str(bare))
    folder = home / "Games" / "Jiddles"; folder.mkdir(parents=True)
    (folder / "index.html").write_text("<h1>Jiddles</h1>\n")
    (folder / ".tribe").mkdir(); (folder / ".tribe" / "secret.json").write_text('{"key": "do-not-ship"}')
    (folder / "notes.log").write_text("noise\n")
    ghs = HTTPServer(("127.0.0.1", GHPORT), GH); threading.Thread(target=ghs.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home),
           "TRIBE_GITHUB_GIT": str(ghroot), "TRIBE_GITHUB_API": f"http://127.0.0.1:{GHPORT}", "TRIBE_SYNC_TICK_MS": "400", "TRIBE_SYNC_MINUTE_MS": "1500", "TRIBE_SYNC_SAVE_MS": "300", "TRIBE_SYNC_RETRY_MS": "200"}
    logf = tmp / "log"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(logf, "w"), stderr=subprocess.STDOUT, env=env)
    bodies = []
    def call(*a, **k):
        st, d, raw = api(*a, **k); bodies.append(raw); return st, d
    errors = []
    try:
        wait(lambda: api("/health")[0] == 200, "server")
        st, d = call("/bootstrap", "POST", {"name": "Camp"}); assert st == 200, d; host = d["token"]
        st, d = call("/me/git", "PUT", {"githubToken": TOKEN}, token=host); assert st == 200 and TOKEN not in json.dumps(d), d
        st, d = call("/projects", "POST", {"name": "Jiddles"}, token=host); pid = d["project"]["id"]
        st, d = call(f"/projects/{pid}/folder", "PUT", {"path": "~/Games/Jiddles", "gitInit": True}, token=host); assert st == 200, d
        assert d["folder"]["display"] == "~/Games/Jiddles" and d["folder"]["git"], d
        # a builder and a spectator
        def join(role, name):
            st, d = call("/invites", "POST", {"role": role, "maxUses": 1, "project": pid}, token=host); assert st == 200, d
            st, d = call("/join", "POST", {"code": d["invite"]["code"], "name": name}); assert st == 200, d; return d["token"]
        builder, spectator = join("builder", "Maya"), join("spectator", "Sam")

        # ---------- connect: leads only ----------
        st, d = call(f"/projects/{pid}/sync", "PUT", {"repo": "camp/game"}, token=builder); assert st == 403, d
        st, d = call(f"/projects/{pid}/sync", "PUT", {"repo": "https://github.com/camp/game", "branch": "main", "exclude": ["*.log"]}, token=host); assert st == 200, d
        assert d["settings"]["mode"] == "manual" and d["status"]["connected"] and d["status"]["state"] == "pending", d["status"]
        assert d["can"] == {"edit": True, "ship": True, "undo": True}
        st, d = call(f"/projects/{pid}/sync", token=builder); assert d["can"]["edit"] is False and d["can"]["ship"] is True, d["can"]
        # manual: nothing left yet
        assert git("for-each-ref", cwd=bare) == "", "nothing on GitHub before Ship"

        # ---------- manual ship pushes; excludes + .tribe never shipped ----------
        st, d = call(f"/projects/{pid}/sync/changes", token=host); paths = [f["path"] for f in d["files"]]
        assert "index.html" in paths and not any(p.startswith(".tribe") for p in paths) and "notes.log" not in paths, paths
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {"message": "First ship"}, token=spectator); assert st == 403, d
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {"message": "First ship"}, token=builder); assert st == 200 and d["shipped"], d
        tree = git("ls-tree", "-r", "--name-only", "main", cwd=bare).split("\n")
        assert "index.html" in tree and not any(t.startswith(".tribe") for t in tree) and "notes.log" not in tree, tree
        assert git("log", "-1", "--format=%s|%an", "main", cwd=bare) == "First ship|Maya", "signed as the member"
        assert d["status"]["state"] == "synced" and d["status"]["pending"] == 0, d["status"]

        # ---------- auto-ship on task Done ----------
        call(f"/projects/{pid}/sync", "PUT", {"mode": "auto", "trigger": "done", "signAs": "bot"}, token=host)
        (folder / "a.js").write_text("console.log('a')\n")
        st, d = call("/tasks", "POST", {"title": "Make a"}, token=host, project=pid); tid = d["task"]["id"]
        call(f"/tasks/{tid}", "PATCH", {"status": "done"}, token=host, project=pid)
        wait(lambda: "a.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "auto-ship on Done")
        assert git("log", "-1", "--format=%an", "main", cwd=bare) == "TribeCode bot"

        # ---------- auto-ship on approve ----------
        call(f"/projects/{pid}/sync", "PUT", {"trigger": "approve"}, token=host)
        (folder / "b.js").write_text("b\n")
        st, d = call("/approvals", "POST", {"title": "Ship the menu", "risk": "low"}, token=builder, project=pid); assert st == 200, d
        aid = d["approval"]["id"]; time.sleep(1)
        assert "b.js" not in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "not before the approval"
        st, d = call(f"/approvals/{aid}/approve", "POST", {}, token=host, project=pid); assert st == 200, d
        wait(lambda: "b.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "auto-ship on approve")

        # ---------- require approval before an auto-ship ----------
        call(f"/projects/{pid}/sync", "PUT", {"trigger": "save", "requireApproval": True}, token=host)
        st, d = call(f"/projects/{pid}/folder/file", "PUT", {"path": "c.js", "content": "c\n"}, token=builder); assert st == 200, d
        aw = wait(lambda: call(f"/projects/{pid}/sync", token=host)[1]["status"]["awaiting"], "an approval for the auto-ship")
        assert "c.js" not in git("ls-tree", "-r", "--name-only", "main", cwd=bare)
        call(f"/approvals/{aw['approval']}/approve", "POST", {}, token=host, project=pid)
        wait(lambda: "c.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "approved auto-ship")

        # ---------- the interval trigger ----------
        call(f"/projects/{pid}/sync", "PUT", {"trigger": "interval", "intervalMin": 1, "requireApproval": False}, token=host)
        (folder / "d.js").write_text("d\n")
        wait(lambda: "d.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "interval ship", t=12)

        # ---------- pause ----------
        call(f"/projects/{pid}/sync", "PUT", {"paused": True}, token=host)
        (folder / "e.js").write_text("e\n"); time.sleep(3.5)
        assert "e.js" not in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "paused: no auto-ship"
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {}, token=host); assert st == 409 and "paused" in d["error"].lower(), d
        st, d = call(f"/projects/{pid}/sync", token=host); assert d["status"]["state"] == "paused"
        call(f"/projects/{pid}/sync", "PUT", {"paused": False, "mode": "manual"}, token=host)

        # ---------- Undo last backup ----------
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {"message": "Add e"}, token=host); assert d["shipped"], d
        assert "e.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare)
        st, d = call(f"/projects/{pid}/sync/undo", "POST", {}, token=builder); assert st == 403, d
        st, d = call(f"/projects/{pid}/sync/undo", "POST", {}, token=host); assert st == 200, d
        assert "e.js" not in git("ls-tree", "-r", "--name-only", "main", cwd=bare) and git("log", "-1", "--format=%s", "main", cwd=bare).startswith("Revert"), "undo pushed a revert"
        st, d = call(f"/projects/{pid}/sync", token=host); assert d["log"][0]["why"] == "undo" and d["log"][1]["undone"], d["log"][:2]

        # ---------- a pull conflict stops and shows ----------
        other = tmp / "other"; git("clone", "-q", str(bare), str(other))
        (other / "index.html").write_text("<h1>Theirs</h1>\n"); git("commit", "-qam", "theirs", cwd=other); git("push", "-q", "origin", "main", cwd=other)
        (folder / "index.html").write_text("<h1>Mine</h1>\n")
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {"message": "mine"}, token=host); assert st == 409 and d["conflict"]["files"] == ["index.html"], d
        st, d = call(f"/projects/{pid}/sync", token=host); assert d["status"]["state"] == "conflict", d["status"]
        assert (folder / "index.html").read_text() == "<h1>Mine</h1>\n", "nothing lost, no conflict markers"
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {}, token=host); assert st == 409
        st, d = call(f"/projects/{pid}/sync/resolve", "POST", {"use": "mine"}, token=host); assert st == 200, d
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {}, token=host); assert st == 200 and d["shipped"], d
        assert git("show", "main:index.html", cwd=bare) == "<h1>Mine</h1>", "mine kept"

        # ---------- PR mode (mocked API) ----------
        call(f"/projects/{pid}/sync", "PUT", {"target": "pr", "prTitle": "{project}: {summary}"}, token=host)
        (folder / "f.js").write_text("f\n")
        st, d = call(f"/projects/{pid}/sync/ship", "POST", {"message": "Add f"}, token=host); assert st == 200 and d["entry"]["pr"]["number"] == 1, d
        assert PRS[0]["path"] == "/repos/camp/game/pulls" and PRS[0]["auth"] == "Bearer " + TOKEN and PRS[0]["body"]["title"] == "Jiddles: Add f" and PRS[0]["body"]["base"] == "main", PRS
        assert PRS[0]["body"]["head"] in git("for-each-ref", "--format=%(refname:short)", cwd=bare).split("\n")
        assert "f.js" not in git("ls-tree", "-r", "--name-only", "main", cwd=bare), "PR mode leaves main alone"
        st, d = call(f"/projects/{pid}/sync/undo", "POST", {}, token=host); assert st == 409 and "pull request" in d["error"], d

        # ---------- validation ----------
        st, d = call(f"/projects/{pid}/sync", "PUT", {"branch": "--upload-pack=x"}, token=host); assert st == 400, d
        st, d = call(f"/projects/{pid}/sync", "PUT", {"repo": "not a repo"}, token=host); assert st == 400, d

        # ---------- MCP: ship_status, ship_now ----------
        st, d = call("/agents", "POST", {"name": "Claude"}, token=host)
        if st == 200 and d.get("token"):
            akey = d["token"]
            def mcp(name, args):
                r = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": {**args, "project": pid}}}).encode(),
                    headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + akey, "X-Project": pid})
                with urllib.request.urlopen(r, timeout=60) as x: raw = x.read().decode(); bodies.append(raw); return raw
            out = mcp("ship_status", {}); assert "camp/game" in out and "notShipped" in out, out[:400]
            call(f"/projects/{pid}/sync", "PUT", {"target": "push"}, token=host)
            (folder / "g.js").write_text("g\n")
            out = mcp("ship_now", {"message": "Agent ships g"}); assert "Shipped" in out, out[:400]
            assert "g.js" in git("ls-tree", "-r", "--name-only", "main", cwd=bare)

        # ---------- a shared folder as the remote: two clients ----------
        shared = home / "Dropbox" / "Tribes"; shared.mkdir(parents=True)
        for n in ("s1", "s2"): (home / n).mkdir()
        (home / "s1" / "README.md").write_text("# Shared\n")
        p1 = call("/projects", "POST", {"name": "Shared One"}, token=host)[1]["project"]["id"]
        p2 = call("/projects", "POST", {"name": "Shared Two"}, token=host)[1]["project"]["id"]
        for p, n in ((p1, "s1"), (p2, "s2")): assert call(f"/projects/{p}/folder", "PUT", {"path": f"~/{n}", "gitInit": True}, token=host)[0] == 200
        st, d = call(f"/projects/{p1}/sync", "PUT", {"kind": "folder", "shared": "/etc"}, token=host); assert st == 400, d
        st, d = call(f"/projects/{p1}/sync", "PUT", {"kind": "folder", "shared": "~/s1"}, token=host); assert st == 400, "not the project's own folder"
        st, d = call(f"/projects/{p1}/sync", "PUT", {"kind": "folder", "shared": "~/Dropbox/Tribes", "sharedName": "camp.tribecode.git"}, token=host); assert st == 200, d
        bare2 = shared / "camp.tribecode.git"; assert (bare2 / "HEAD").exists(), "a bare repo in the shared folder"
        assert d["status"]["kind"] == "folder" and d["status"]["url"] is None and "Dropbox" in d["status"]["repo"], d["status"]
        st, d = call(f"/projects/{p1}/sync/ship", "POST", {"message": "From one"}, token=host); assert st == 200 and d["shipped"], d
        assert git("show", "main:README.md", cwd=bare2) == "# Shared"
        st, d = call("/folders/shared?path=~/Dropbox/Tribes", token=host); assert [r["name"] for r in d["repos"]] == ["camp.tribecode.git"], d
        st, d = call(f"/projects/{p2}/sync/join", "POST", {"shared": "~/Dropbox/Tribes", "sharedName": "nope.tribecode.git"}, token=host); assert st == 404, d
        st, d = call(f"/projects/{p2}/sync/join", "POST", {"shared": "~/Dropbox/Tribes", "sharedName": "camp.tribecode.git"}, token=host); assert st == 200, d
        assert (home / "s2" / "README.md").read_text() == "# Shared\n", "the second client pulled it in"
        (home / "s2" / "two.txt").write_text("from two\n")
        st, d = call(f"/projects/{p2}/sync/ship", "POST", {"message": "From two"}, token=host); assert st == 200 and d["shipped"], d
        st, d = call(f"/projects/{p1}/sync/pull", "POST", {}, token=host); assert st == 200, d
        assert (home / "s1" / "two.txt").read_text() == "from two\n", "the first client pulled the second's ship"
        (home / "s1" / "README.md").write_text("# One's\n"); (home / "s2" / "README.md").write_text("# Two's\n")
        assert call(f"/projects/{p1}/sync/ship", "POST", {}, token=host)[0] == 200
        st, d = call(f"/projects/{p2}/sync/ship", "POST", {}, token=host); assert st == 409 and d["conflict"]["files"] == ["README.md"], d
        assert (home / "s2" / "README.md").read_text() == "# Two's\n", "nothing lost"
        assert call(f"/projects/{p2}/sync/resolve", "POST", {"use": "theirs"}, token=host)[0] == 200
        assert (home / "s2" / "README.md").read_text() == "# One's\n", "took the shared copy"
        lock = bare2 / "refs" / "heads" / "main.lock"; lock.write_text("")
        (home / "s1" / "three.txt").write_text("3\n")
        before = git("rev-parse", "main", cwd=bare2)
        st, d = call(f"/projects/{p1}/sync/ship", "POST", {}, token=host); assert st == 503 and "syncing" in d["error"], d
        assert git("rev-parse", "main", cwd=bare2) == before, "nothing written mid-sync"
        lock.unlink()
        st, d = call(f"/projects/{p1}/sync/ship", "POST", {}, token=host); assert st == 200 and d["shipped"], d
        (bare2 / "objects (Bob's conflicted copy 2026-11-12)").mkdir()
        assert call(f"/projects/{p2}/sync/pull", "POST", {}, token=host)[0] == 503, "a cloud conflict copy is a half-synced repo too"
        (bare2 / "objects (Bob's conflicted copy 2026-11-12)").rmdir()

        # ---------- UI: the one pill, the sync sheet, the sharing paths ----------
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.setItem('tribecode.project:%s', '%s'); localStorage.setItem('tribecode.firstrun.done', '1') } catch (e) {}" % (BASE, host, BASE, pid))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeHome", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo && TribeProjects.switchTo('{pid}', 'home')")
            pg.wait_for_selector("#share-card", state="visible", timeout=15000)
            assert pg.locator("#home-pill:visible, #demo-pill:visible").count() == 0, "no pill in the header"
            wait(lambda: "copy on GitHub" in pg.inner_text("#sc-line") and "on this computer" in pg.inner_text("#sc-line"), "one sentence for the folder and GitHub")
            pg.click("#sc-more"); pg.wait_for_selector("#home-pop")
            acts = pg.inner_text("#home-pop")
            for t in ["Move to", "GitHub", "Back up now", "Backup settings", "Share"]: assert t in acts, (t, acts)
            assert "phone" not in acts.lower(), "desktop wording: no phone"
            pg.click("#hp-sync"); pg.wait_for_selector("#lr-sync #lr-repo")
            for t in ["Manual", "Automatic", "pull request", "Commit message", "Pull before backup", "Pause sync", "Undo last backup"]: assert t in pg.inner_text("#lr-sync"), t
            pg.click("#lr-sync [data-mode='auto']"); pg.wait_for_selector("#lr-sync [data-trigger='save']")
            assert "warning" in pg.inner_text("#lr-sync [data-trigger-note]").lower() or pg.locator("#lr-sync [data-trigger='save']").is_visible()
            pg.wait_for_timeout(300); SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "ship-settings.png"))
            pg.click("#lr-sync [data-mode='manual']"); pg.click("#lr-save"); pg.wait_for_selector("#lr-sync", state="detached")
            st, d = call(f"/projects/{pid}/sync", token=host); assert d["settings"]["mode"] == "manual"
            # sharing: three paths from the pill
            pg.click("#sc-more"); pg.click("#hp-share"); pg.wait_for_selector("#lr-share")
            ways = pg.locator("#lr-share [data-share]").evaluate_all("els => els.map(e => e.dataset.share)"); assert ways == ["anywhere", "network", "folder", "solo"], ways
            assert "Recommended" in pg.text_content("#lr-share [data-share='anywhere']")
            pg.click("#lr-share [data-share='network']"); pg.wait_for_function("(document.querySelector('#lr-share-link') || {}).value && document.querySelector('#lr-share-link').value.includes('/join/')", timeout=15000)
            pg.click("#lr-share [data-share='anywhere']"); pg.wait_for_selector("#lr-share [data-step='repo']")
            assert "camp/game" in pg.inner_text("#lr-share"), "already connected: the repo step shows it"
            pg.click("#lr-share [data-ship-pick='auto']"); pg.click("#lr-share-go"); pg.wait_for_function("(document.querySelector('#lr-share-link') || {}).value && document.querySelector('#lr-share-link').value.includes('/join/')", timeout=15000)
            st, d = call(f"/projects/{pid}/sync", token=host); assert d["settings"]["mode"] == "auto", "the guided path set auto-ship"
            pg.click("#lr-share [data-share='solo']"); pg.wait_for_selector("#lr-share [data-solo-done]")
            # the 4th path: share through a folder you already sync (start a new shared copy in ~/Dropbox/Tribes)
            pg.click("#lr-share [data-share='folder']"); pg.click("#lr-share-folder"); pg.wait_for_selector("#lr-folder .lr-dir")
            pg.click("#lr-folder [data-open$='Dropbox']"); pg.wait_for_selector("#lr-folder [data-dir$='Tribes']"); pg.click("#lr-folder [data-dir$='Tribes']")
            pg.wait_for_selector("#lr-found [data-join]"); assert "Join camp" in pg.inner_text("#lr-found"), "copies already there can be joined"
            pg.check("#lr-found [data-join][value='']"); assert pg.inner_text("#lr-folder-go") == "Share through this folder"
            pg.click("#lr-folder-go"); pg.wait_for_selector("#lr-folder", state="detached")
            wait(lambda: call(f"/projects/{pid}/sync", token=host)[1]["status"]["kind"] == "folder", "now synced through the shared folder")
            wait(lambda: "shared folder" in pg.inner_text("#sc-line"), "the card says so")
            assert any(x.name.endswith(".tribecode.git") and x.name != "camp.tribecode.git" for x in shared.iterdir())
            b.close()

        # ---------- tokens never in logs or responses ----------
        log = logf.read_text()
        assert TOKEN not in log, "token in the server log"
        assert not any(TOKEN in x for x in bodies), "token in a response"
        assert not errors, errors
        print("e2e_ship_sync: OK")
    finally:
        srv.terminate(); ghs.shutdown()

if __name__ == "__main__":
    main()
