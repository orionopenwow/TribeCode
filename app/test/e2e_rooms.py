"""End-to-end: project rooms + starting a project from a folder or repo.

Covers: migration of an existing tribe into a first project; projects from a local git repo path, a
local non-git folder ("Make it a git repo"), a browser folder upload, and a clone of a local bare repo
offered after reading a dropped folder's .git/config; per-project chat and task isolation; cascade
badges; a project-scoped invite (the friend only sees that project); presence per project; "Give me a
branch" worktrees and commits attributed to the right member; per-member GitHub token storage; MCP
project scoping; and the mobile project switcher.
Usage: python app/test/e2e_rooms.py [--shots]
"""
import json, os, stat, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4797 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"




def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_until(fn, timeout=20, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for {what}")


def invite_link(page):
    # web.js may turn on the public address and re-create the link once: wait until it settles
    last = None
    for _ in range(40):
        page.wait_for_function("document.querySelector('#inv-link') && document.querySelector('#inv-link').innerText.includes('/join/')", timeout=15000)
        page.wait_for_timeout(400)
        cur = page.inner_text("#inv-link")
        if cur == last and "/join/" in cur: return cur
        last = cur
    raise AssertionError("invite link never settled")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-rooms-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="rooms-src-", dir="/tmp")
    sh = lambda *a, cwd=None: subprocess.run(list(a), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    gitc = lambda repo, *a: sh("git", "-C", repo, "-c", "user.email=seed@t", "-c", "user.name=Seed", *a)

    # An existing tribe from before projects existed: a task, a doc and chat with no project field.
    Path(tmp, ".tribe").mkdir(parents=True); Path(tmp, "tasks").mkdir(); Path(tmp, "docs").mkdir(); Path(tmp, "chat").mkdir()
    Path(tmp, ".tribe/tribe.json").write_text(json.dumps({"name": "Campfire Crew", "created": "2026-01-01T00:00:00.000Z"}))
    Path(tmp, "tasks/t-legacy-1.md").write_text('---\nid: "t-legacy-1"\ntitle: "Old campfire task"\nstatus: "doing"\nby: "x"\ncreated: "2026-01-01T00:00:00.000Z"\norder: 1\n---\n\nFrom before projects.\n')
    Path(tmp, "docs/old-notes.md").write_text('---\ntitle: "Old notes"\nversion: 1\nupdated: "2026-01-01T00:00:00.000Z"\n---\n\nLegacy doc.\n')
    Path(tmp, "chat/general.jsonl").write_text(json.dumps({"id": "legacy1", "at": "2026-01-01T00:00:00.000Z", "by": "tribecode", "text": "legacy hello from the campfire"}) + "\n")

    # A local git repo (path project), a plain folder (make-it-a-repo), and a bare "remote" to clone.
    lantern = os.path.join(work, "lantern")
    sh("git", "init", "-q", "-b", "main", lantern); Path(lantern, "README.md").write_text("# Lantern\n"); gitc(lantern, "add", "."); gitc(lantern, "commit", "-q", "-m", "init")
    sketches = os.path.join(work, "sketches"); Path(sketches, "node_modules/left-pad").mkdir(parents=True)
    Path(sketches, "idea.txt").write_text("a fishing mini-game\n"); Path(sketches, "node_modules/left-pad/index.js").write_text("module.exports=1\n")
    seed = os.path.join(work, "seed"); bare = os.path.join(work, "quest-engine.git")
    sh("git", "init", "-q", "-b", "main", seed); Path(seed, "engine.js").write_text("export const tick = 1\n"); gitc(seed, "add", "."); gitc(seed, "commit", "-q", "-m", "engine")
    sh("git", "clone", "-q", "--bare", seed, bare)

    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_REPO_POLL_MS": "2000"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---- migration: everything lands in a first project named after the tribe, files tagged, nothing lost
        projects = json.loads(Path(tmp, ".tribe/projects.json").read_text())
        assert [p["id"] for p in projects] == ["campfire-crew"] and projects[0]["channel"] == "general", projects
        assert 'project: "campfire-crew"' in Path(tmp, "tasks/t-legacy-1.md").read_text()
        assert "From before projects." in Path(tmp, "tasks/t-legacy-1.md").read_text()
        assert 'project: "campfire-crew"' in Path(tmp, "docs/old-notes.md").read_text()

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1500, "height": 950}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            token = host.evaluate("TribeStore.get().server.token")
            host.wait_for_selector("#pj-rail .pj-circle")
            # first launch: zero steps, straight into the first project, one dismissible line
            assert host.locator("#onboard").count() == 0
            wait_text(host, "#hi-banner", "you're hosting")
            host.wait_for_selector("#view-home:not(.hidden) #pj-overview h1")
            shot(host, "first-launch")
            host.click("#hi-x"); host.wait_for_selector("#hi-banner", state="detached")
            assert host.evaluate("TribeStore.get().firstRun") is False
            wait_text(host, "#chat-list", "legacy hello from the campfire")
            st, r = api("/tasks", token=token)
            assert any(t["id"] == "t-legacy-1" for t in r["tasks"]), r
            st, r = api("/projects", token=token)
            assert len(r["projects"]) == 1 and r["projects"][0]["default"], r

            # ---- project from a local path that is already a git repo (host machine only)
            host.click("#pj-plus"); host.click(".np-setup [data-ns='code']"); host.wait_for_selector("#np-input")
            host.fill("#np-input", lantern); wait_text(host, "#np-hint", "Opens that folder"); host.click("#np-create")
            host.wait_for_selector("#view-home:not(.hidden) .pj-title")
            wait_text(host, "#pj-overview h1", "lantern")
            assert host.evaluate("TribeClient.project()") == "lantern"
            wait_text(host, "#pj-ws", "Give me a branch")
            # a tunnel-relayed request is never "local": paths are refused
            req = urllib.request.Request(BASE + "/api/projects", method="POST", data=json.dumps({"path": sketches}).encode(),
                                         headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "X-Forwarded-For": "1.2.3.4"})
            try: urllib.request.urlopen(req); assert False, "path from a tunnel must be refused"
            except urllib.error.HTTPError as e: assert e.code == 403, e.code

            # ---- a plain folder: "Make it a git repo" (gitignore for node_modules, first commit as Orion)
            host.click("#pj-plus"); host.click(".np-setup [data-ns='code']"); host.fill("#np-input", sketches); host.press("#np-input", "Enter")
            host.wait_for_selector("#np-git"); host.click("#np-git")
            host.wait_for_selector("#view-home:not(.hidden)"); wait_text(host, "#pj-overview h1", "sketches")
            wait_until(lambda: Path(sketches, ".git").exists(), what="git init")
            assert "node_modules/" in Path(sketches, ".gitignore").read_text()
            tracked = sh("git", "-C", sketches, "ls-files")
            assert "idea.txt" in tracked and "node_modules" not in tracked, tracked
            assert sh("git", "-C", sketches, "log", "-1", "--format=%an").strip() == "Orion"

            # ---- browser upload of a folder (the drop zone's code path) + the 25 MB cap
            host.click("#pj-plus"); host.click(".np-setup [data-ns='code']"); host.click("#np-more"); host.wait_for_selector("#np-drop")
            # a synthetic drop of a single file explains that a folder is needed
            host.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'one.txt')); const dz = document.querySelector('#np-drop');
                dz.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""")
            wait_text(host, "#np-status", "Drop a folder")
            host.evaluate("""() => window.TribeProjects.startFromFiles('Pixel Quest', [
                { path: 'src/main.js', file: new File(['console.log("pixel")\\n'], 'main.js') },
                { path: 'README.md', file: new File(['# Pixel Quest\\n'], 'README.md') },
                { path: 'node_modules/dep/index.js', file: new File(['x'], 'index.js') }])""")
            host.wait_for_selector("#view-home:not(.hidden)"); wait_text(host, "#pj-overview h1", "Pixel Quest")
            ws = Path(tmp, "workspaces", "pixel-quest")
            assert (ws / "src/main.js").exists() and not (ws / "node_modules").exists()
            assert sh("git", "-C", str(ws), "log", "-1", "--format=%an <%ae>") == "Orion <orion@users.noreply.tribecode>"
            st, r = api("/projects", "POST", {"name": "Huge", "files": [{"path": "big.bin", "data": "A" * (26 * 1024 * 1024 * 4 // 3)}]}, token=token)
            assert st == 413 and "25 MB" in r["error"], (st, r)
            st, r = api("/projects", "POST", {"files": [{"path": "../escape.txt", "data": "eA=="}, {"path": "ok.txt", "data": "eA=="}], "name": "Escape"}, token=token)
            assert st == 200 and not Path(tmp, "workspaces", "escape.txt").exists() and r["uploaded"]["skipped"] == 1, r

            # ---- a dropped folder whose .git/config has a remote: offer "Clone it into TribeCode"
            host.click("#pj-plus"); host.click(".np-setup [data-ns='code']"); host.click("#np-more"); host.wait_for_selector("#np-drop")
            host.evaluate("""(url) => window.TribeProjects.analyze('quest-engine', [
                { path: '.git/config', gitConfig: true, file: new File(['[core]\\n\\tbare = false\\n[remote "origin"]\\n\\turl = ' + url + '\\n\\tfetch = +refs/heads/*:refs/remotes/origin/*\\n'], 'config') },
                { path: 'engine.js', file: new File(['export const tick = 1\\n'], 'engine.js') }])""", bare)
            wait_text(host, "#np-status", "clones it"); assert host.is_visible("#np-do-upload")
            shot(host, "project-drop")
            host.click("#np-create")
            host.wait_for_selector("#view-home:not(.hidden)"); wait_text(host, "#pj-overview h1", "quest-engine")
            qe = Path(tmp, "workspaces", "quest-engine")
            assert (qe / "engine.js").exists() and sh("git", "-C", str(qe), "remote", "get-url", "origin") == bare
            st, r = api("/projects", "POST", {"url": "--upload-pack=touch /tmp/pwned"}, token=token)
            assert st == 400, r

            # ---- per-project chat + tasks isolation
            host.click("#pj-rail [data-pj-open='pixel-quest']")
            wait_until(lambda: host.evaluate("TribeClient.project()") == "pixel-quest", what="switch to pixel quest")
            host.wait_for_function("!document.querySelector('#chat-list').innerText.includes('legacy hello')")
            chat(host).fill("#chat-input", "pixel only: sprites are 16px"); chat(host).press("#chat-input", "Enter")
            wait_text(host, "#chat-list", "pixel only")
            st, r = api("/tasks", "POST", {"title": "Draw the hero sprite"}, token=token, project="pixel-quest")
            assert st == 200 and r["task"]["project"] == "pixel-quest", r
            assert not any(t["title"] == "Draw the hero sprite" for t in api("/tasks", token=token, project="campfire-crew")[1]["tasks"])
            assert any(t["id"] == "t-legacy-1" for t in api("/tasks", token=token, project="campfire-crew")[1]["tasks"])
            assert not any("pixel only" in m["text"] for m in api("/chat/general", token=token, project="campfire-crew")[1]["messages"])
            assert any("pixel only" in m["text"] for m in api("/chat/general", token=token, project="pixel-quest")[1]["messages"])
            host.click("#pj-nav [data-nav='tasks']")
            wait_text(host, "#board", "Draw the hero sprite")
            assert "Old campfire task" not in host.inner_text("#board"), (host.inner_text("#board"), host.evaluate("TribeClient.project()"))

            # ---- nest badges: only non-empty sections show a count; requests surface in Project Hub
            wait_text(host, "#nn-tasks", "1")
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tabs:not(.hidden)")
            assert host.locator("#wt-requests").count() == 0
            st, r = api("/changes", "POST", {"title": "Hook up the gamepad"}, token=token, project="pixel-quest")
            assert st == 200, r
            host.wait_for_selector("#wt-requests .n.hot")
            assert host.locator("#pj-rail [data-pj-open='pixel-quest'] .pj-badge").count() == 0   # current project: no badge on its circle
            assert host.inner_text("#wt-requests .n") == "1"
            host.click("#wt-requests"); wait_text(host, "#pj-requests", "Hook up the gamepad")
            assert "Hook up the gamepad" not in json.dumps(api("/changes", token=token, project="campfire-crew")[1])
            host.click("#wt-repo"); host.wait_for_selector("#pj-repo-ws")

            # ---- project-scoped invite: the friend only sees Pixel Quest
            host.click("#tour-invite"); host.wait_for_selector("#inv-project")
            assert host.input_value("#inv-project") == "pixel-quest"
            link = invite_link(host); host.click("[data-close]")
            friend = b.new_context(viewport={"width": 1500, "height": 950}).new_page(); watch(friend, "friend")
            friend.goto(link); friend.wait_for_selector("#form:not(.hidden)")
            assert "Pixel Quest" in friend.inner_text("#lead")
            friend.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")   # this test is not about the after-join Claude Code sheet (e2e_instant is)
            friend.fill("#name", "Maya"); friend.click("#go")
            wait_text(friend, "#sync-status", "connected")
            friend.wait_for_selector("#pj-rail .pj-circle")
            assert friend.locator("#pj-rail .pj-circle").count() == 1 and "Pixel Quest" in friend.inner_text("#nest-head")
            assert friend.is_hidden("#pj-plus")
            wait_text(friend, "#chat-list", "pixel only")
            ftoken = friend.evaluate("TribeStore.get().server.token")
            st, r = api("/projects", token=ftoken); assert [x["id"] for x in r["projects"]] == ["pixel-quest"], r
            assert api("/tasks", token=ftoken, project="campfire-crew")[0] == 403
            assert api("/chat/general", token=ftoken, project="lantern")[0] == 403
            assert api("/chat/general", token=ftoken)[0] == 200
            st, r = api("/invites", "POST", {"project": "tribe"}, token=ftoken); assert st == 403, r
            # presence shows where each person is: the host leaves for Campfire Crew
            host.click("#pj-rail [data-pj-open='campfire-crew']")
            wait_until(lambda: host.evaluate("TribeClient.project()") == "campfire-crew", what="host back to campfire")
            wait_text(host, "#room-list", "Pixel Quest ·")      # Maya is in Pixel Quest
            wait_text(friend, "#room-list", "another project")  # Maya can't see where Orion went
            assert "Campfire" not in friend.inner_text("#room-list")
            host.click("#pj-rail [data-pj-open='pixel-quest']")
            wait_until(lambda: host.evaluate("TribeClient.project()") == "pixel-quest", what="host back to pixel quest")
            wait_text(host, "#chat-list", "pixel only")

            # ---- "Give me a branch": per-member worktrees, commits attributed to the right person
            friend.click("#nest-overview")
            friend.wait_for_selector("#pj-mybranch"); friend.click("#pj-mybranch")
            friend.wait_for_selector("#pj-commit")
            fid = api("/me", token=ftoken)[1]["member"]["id"]
            tree = ws / ".trees" / fid
            assert tree.exists() and sh("git", "-C", str(tree), "rev-parse", "--abbrev-ref", "HEAD") == f"tribe/{fid}"
            (tree / "fish.js").write_text("export const fish = 3\n")
            friend.once("dialog", lambda d: d.accept("Add fishing"))
            friend.click("#pj-commit")
            wait_until(lambda: sh("git", "-C", str(tree), "log", "-1", "--format=%s") == "Add fishing", what="friend commit")
            assert sh("git", "-C", str(tree), "log", "-1", "--format=%an <%ae>") == "Maya <maya@users.noreply.tribecode>"
            st, r = api("/me/git", "PUT", {"email": "orion@example.com", "githubToken": "ghp_" + "x" * 36}, token=token)
            assert st == 200 and r["identity"]["hasToken"] and "ghp_" not in json.dumps(r), r
            secret = Path(tmp, ".tribe/secrets")
            files = list(secret.iterdir()); assert len(files) == 1 and stat.S_IMODE(files[0].stat().st_mode) == 0o600
            st, r = api("/projects/pixel-quest/branch", "POST", {}, token=token); assert st == 200, r
            htree = Path(r["branch"]["path"]); (htree / "lantern.txt").write_text("amber\n")
            st, r = api("/projects/pixel-quest/branch/commit", "POST", {"message": "Amber lantern"}, token=token); assert st == 200, r
            assert sh("git", "-C", str(htree), "log", "-1", "--format=%an <%ae>") == "Orion <orion@example.com>"
            assert "ghp_" not in json.dumps(api("/projects/pixel-quest/workspace", token=token)[1])
            st, r = api("/projects/pixel-quest/branch", "POST", {}, token=ftoken); assert r["branch"]["exists"] and r["branch"]["head"]["author"] == "Maya"
            st, r = api("/projects/pixel-quest/branch/push", "POST", {}, token=ftoken); assert st == 400 and "origin" in r["error"], r   # local-only repos are fine
            # the two branches never touched main
            assert "fish.js" not in sh("git", "-C", str(ws), "ls-files") and "lantern.txt" not in sh("git", "-C", str(ws), "ls-files")
            shot(friend, "project-cascade-friend")

            # ---- MCP: tools take an optional project, default to the agent's project
            st, ag = api("/agents", "POST", {}, token=ftoken)
            listed = mcp(ag["token"], None, method="tools/list")["tools"]
            assert all("project" in t["inputSchema"]["properties"] for t in listed)
            isErr, txt = mcp(ag["token"], "list_projects"); assert not isErr and [x["id"] for x in json.loads(txt)] == ["pixel-quest"], txt
            isErr, txt = mcp(ag["token"], "create_task", {"title": "Agent: tune the jump"}); assert not isErr, txt
            assert any(t["title"] == "Agent: tune the jump" for t in api("/tasks", token=token, project="pixel-quest")[1]["tasks"])
            isErr, txt = mcp(ag["token"], "list_tasks", {"project": "campfire-crew"}); assert isErr, txt
            st, hag = api("/agents", "POST", {}, token=token, project="pixel-quest")
            isErr, txt = mcp(hag["token"], "create_task", {"title": "Agent task for the campfire", "project": "campfire-crew"}); assert not isErr, txt
            assert any(t["title"] == "Agent task for the campfire" for t in api("/tasks", token=token, project="campfire-crew")[1]["tasks"])

            # ---- desktop screenshot: the cascade with More open, on the Pixel Quest overview
            # other projects' circles carry a badge (Pixel Quest's change request shows on its circle from elsewhere)
            host.click("#pj-rail [data-pj-open='lantern']")
            wait_until(lambda: host.evaluate("TribeClient.project()") == "lantern", what="host to lantern")
            host.wait_for_selector("#pj-rail [data-pj-open='pixel-quest'] .pj-badge")
            host.click("#pj-rail [data-pj-open='pixel-quest']")
            wait_until(lambda: host.evaluate("TribeClient.project()") == "pixel-quest", what="host to pixel quest")
            # a project picture
            host.evaluate("""() => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.fillStyle = '#6C7CFF'; x.fillRect(0, 0, 8, 8);
                return TribeClient.api('/projects/pixel-quest', { method: 'PATCH', body: { image: c.toDataURL('image/png') } }); }""")
            host.wait_for_selector("#pj-rail [data-pj-open='pixel-quest'] .pj-face.img img")
            host.click("#nest-overview"); host.wait_for_selector("#pj-ws .pj-branch")
            shot(host, "project-cascade")

            # ---- mobile: a whole-tribe invite, the project switcher sheet, tab bar scoped to the project
            host.click("#tour-invite"); host.wait_for_selector("#inv-project")
            host.select_option("#inv-project", "tribe")
            plink = invite_link(host); host.click("[data-close]")
            phone = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page(); watch(phone, "phone")
            phone.goto(plink); phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Jay"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            phone.wait_for_selector("#pj-switch:not(.hidden)")
            assert phone.locator("#pj-rail").is_hidden()
            phone.click("#pj-switch"); phone.wait_for_selector("#pj-sheet:not(.hidden) .pj-sheet-row")
            assert phone.locator(".pj-sheet-row").count() == 6, phone.locator(".pj-sheet-row").count()
            shot(phone, "project-mobile")
            phone.click(".pj-sheet-row[data-sheet='pixel-quest']")
            wait_until(lambda: phone.evaluate("TribeClient.project()") == "pixel-quest", what="phone switched")
            wait_text(phone, "#pj-switch", "Pixel Quest")
            phone.click('#tabbar [data-nav="tasks"]')
            wait_text(phone, "#board", "Draw the hero sprite")
            assert "Old campfire task" not in phone.inner_text("#board")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            # the drawer: project circles as a strip, then the current project's nest
            phone.click("#menu-btn"); phone.wait_for_function("getComputedStyle(document.querySelector('.side')).transform === 'none'")
            assert phone.locator("#pj-strip .pj-circle").count() == 7   # 6 projects + "+"
            assert "Pixel Quest" in phone.inner_text("#nest-head")
            shot(phone, "project-mobile-drawer")
            b.close()
        assert not errors, errors
        print("Rooms test passed")
    finally:
        srv.terminate()
        try: out = srv.communicate(timeout=5)[0].decode()
        except Exception: out = ""
        if errors or sys.exc_info()[0]: print(out[-3000:])


if __name__ == "__main__":
    main()
