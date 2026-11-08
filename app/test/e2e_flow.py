"""End-to-end: the one-click project flow.

Covers: one click Create (name prefilled) -> the Getting started card in chat with Room, Link, Repo and
GitHub all done (GitHub REST API mocked by a local server, push to a local bare repo, token never in
logs) -> the invite link works for a second browser -> roles taken and given (lanes in coord ownership)
-> a note file dropped -> Start the flow -> PLAN posted as a plan gist, tasks per role, PLAN.md committed
-> MCP post_gist accepted, code dumps and long bodies rejected -> an upgrade gist becomes a plan change
only a human can approve -> a blocker surfaces on the plan -> Assess now posts an assessment gist ->
a task finishing checks its plan item off (PLAN.md too) -> a commit becomes an auto-gist with folder chips.
Usage: python app/test/e2e_flow.py [--shots]
"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4801 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []
TOKEN = "ghp_" + "T3st" * 9
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def chat(page):
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
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

def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def wait_until(fn, timeout=25, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out waiting for {what}")

def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"))

# Our blocks must fit a 390px phone. (The shell title bar can widen the phone layout by itself when the
# project name is long; that belongs to shell.css, so the check sets the title bar aside.)
FITS = """() => {
  const tb = document.querySelector('.titlebar'), prev = tb.style.display; tb.style.display = 'none';
  const right = document.querySelector('#main').getBoundingClientRect().right, sw = document.documentElement.scrollWidth;
  tb.style.display = prev;
  return right <= innerWidth + 3 && sw <= innerWidth + 1 ? null : [right, sw];
}"""
def assert_fits(page):
    bad = page.evaluate(FITS)
    assert bad is None, bad

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


# ---------- a tiny GitHub REST API: POST /user/repos makes a local bare repo to push to ----------
GH = {"calls": [], "root": None}
class GitHubMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        GH["calls"].append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.reply(401, {"message": "Bad credentials"})
        if self.path != "/user/repos": return self.reply(404, {"message": "Not Found"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "orion/" + body["name"], "private": body.get("private", False),
                         "clone_url": bare, "html_url": "https://github.com/orion/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flow-", dir="/tmp")
    GH["root"] = tempfile.mkdtemp(prefix="flow-gh-", dir="/tmp")
    gh = ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    sh = lambda *a, cwd=None: subprocess.run(list(a), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}", "TRIBE_NO_GH": "1", "TRIBE_REPO_POLL_MS": "1000", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    ok = False
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            token = host.evaluate("TribeStore.get().server.token")
            assert api("/me/git", "PUT", {"githubToken": TOKEN}, token=token)[0] == 200

            # ---- one click: the name is prefilled, Create does everything and opens the chat
            host.evaluate("document.getElementById('pj-plus').click()"); host.click(".np-setup [data-ns='own']"); host.wait_for_selector("#np-input")
            name = host.input_value("#np-input"); assert name.startswith("Orion's"), name
            host.click("#np-create")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=25000); host.click(".modal-card.ii [data-close]")   # step 3: invite friends
            host.wait_for_selector("#view-chat:not(.hidden) #flow-kick")
            pid = host.evaluate("TribeClient.project()"); assert pid == "orion-s-studio", pid
            host.wait_for_function("document.querySelectorAll('#flow-kick .fk-steps li.ok').length === 4", timeout=25000)
            assert "started **Orion's Studio**" in json.dumps(api("/chat/general?limit=20", token=token, project=pid)[1])
            ws = Path(tmp, "workspaces", pid)
            for f in ["README.md", "VISION.md", "CLAUDE.md", "PLAN.md", "TRIBE_CONTEXT.md", "app/README.md", "design/README.md", "tests/README.md"]:
                assert (ws / f).exists(), f
            assert "post_gist" in (ws / "CLAUDE.md").read_text() and "| `app/` | Frontend | App |" in (ws / "README.md").read_text()
            bare = os.path.join(GH["root"], "orion-s-studio.git")
            assert sh("git", "--git-dir", bare, "log", "-1", "--format=%s", "main") == "Initial commit (via TribeCode)"
            assert sh("git", "-C", str(ws), "remote", "get-url", "origin") == bare
            call = GH["calls"][0]; assert call["body"]["private"] is True and call["auth"] == "Bearer " + TOKEN, call
            st, fl = api("/flow", token=token, project=pid); f0 = fl["flow"]
            assert f0["github"]["url"] == "https://github.com/orion/orion-s-studio" and f0["steps"]["github"]["note"] == "token", f0
            wait_text(host, "#chat-list", "is on GitHub")
            shot(host, "flow-create")

            # ---- the invite link from the card works for a second browser (project-scoped friend)
            link = host.inner_text("#flow-link"); assert "/join/" in link, link
            code = link.rstrip("/").split("/join/")[-1]
            friend = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(friend, "friend")
            friend.goto(f"{BASE}/join/{code}"); friend.wait_for_selector("#form:not(.hidden)")
            assert "Orion's Studio" in friend.inner_text("#lead")
            friend.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")   # this test is not about the after-join Claude Code sheet (e2e_instant is)
            friend.fill("#name", "Maya"); friend.click("#go")
            wait_text(friend, "#sync-status", "connected")
            ftoken = friend.evaluate("TribeStore.get().server.token")
            assert friend.evaluate("TribeClient.project()") == pid
            chat(friend); friend.wait_for_selector("#flow-kick, #flow-expand")
            if friend.locator("#flow-expand").count(): friend.click("#flow-expand")   # desktop: the card is a pop-out, opened from the bar
            friend.wait_for_selector("#flow-kick")
            maya = api("/me", token=ftoken)[1]["member"]["id"]

            # ---- roles: Maya takes Frontend; Orion gives Design to Maya; lanes follow the folders
            friend.click("#flow-kick .role-chip[data-role='frontend']"); friend.wait_for_selector("#flow-rmenu:not(.hidden) [data-ract='take']")
            wait_text(friend, "#flow-rmenu", "App")
            friend.click("#flow-rmenu [data-ract='take']")
            host.wait_for_function("document.querySelector(\"#flow-kick .role-chip[data-role='frontend'] .ravs\")")
            host.click("#flow-kick .role-chip[data-role='design']"); host.wait_for_selector("#flow-rmenu:not(.hidden) .fm-give")
            host.select_option("#flow-rmenu .fm-give", maya)
            host.wait_for_function("document.querySelector(\"#flow-kick .role-chip[data-role='design'] .ravs\")")
            own = api("/coord/ownership", token=token, project=pid)[1]
            lanes = {(l["owner"], l["area"]) for l in own["lanes"]}
            assert (maya, "app/") in lanes and (maya, "design/") in lanes and (maya, "assets/") in lanes, lanes
            st, rr = api(f"/projects/{pid}/roles", token=ftoken)
            assert st == 200 and any(f["path"] == "app/" and f["role"] == "frontend" and f["color"] == "#6C7CFF" for f in rr["folders"]), rr
            assert next(r for r in rr["roles"] if r["id"] == "frontend")["members"] == [maya]
            assert api("/flow/roles/qa", "POST", {}, token=api("/agents", "POST", token=ftoken)[1]["token"], project=pid)[0] == 403   # agents never take roles

            # ---- drop a note file: it lands in Docs (and the brain notes), the card lists it
            host.evaluate("""() => { const dt = new DataTransfer();
                dt.items.add(new File(['# First playable\\n- Player can double jump\\n- Draw the hero sprite and coin art\\n- Write tests for jumping\\n# Online\\n- Save high scores on the server\\n'], 'ideas.md', { type: 'text/markdown' }));
                document.querySelector('#flow-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""")
            host.wait_for_selector("#flow-kick .fk-notechip")
            assert any(d["title"] == "ideas" for d in api("/docs", token=token, project=pid)[1]["docs"])
            assert any(n.startswith(pid) for n in os.listdir(Path(tmp, "brain", "notes")))
            shot(host, "flow-kickoff")

            # phone 390x844: the same kickoff card, no horizontal scroll
            state = host.evaluate("localStorage.getItem('tribecode.settings.v1')")
            phone_ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            phone_ctx.add_init_script("localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.project:%s', %r)" % (json.dumps(state), BASE, pid))
            phone = phone_ctx.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1"); wait_text(phone, "#sync-status", "connected")
            wait_until(lambda: phone.evaluate("TribeClient.project()") == pid, what="phone in project")
            chat(phone); phone.wait_for_selector("#flow-kick .fk-notechip")
            assert_fits(phone)
            shot(phone, "flow-kickoff-phone")

            # ---- Start the flow: a plan from the note, tasks per role, PLAN.md committed, plan gist in chat
            host.click("#flow-start")
            host.wait_for_selector("#flow-dock.bar .fbar", timeout=20000)
            host.wait_for_selector("#chat-list .gx.k-plan")
            fl = api("/flow", token=token, project=pid)[1]["flow"]
            assert fl["status"] == "running" and fl["plan"]["by"] == "rules", fl["status"]
            items = [i for m in fl["plan"]["milestones"] for i in m["items"]]
            byrole = {i["text"]: i["role"] for i in items}
            assert byrole["Player can double jump"] == "frontend" and byrole["Draw the hero sprite and coin art"] == "design" and byrole["Write tests for jumping"] == "qa" and byrole["Save high scores on the server"] == "backend", byrole
            assert [m["title"] for m in fl["plan"]["milestones"]] == ["First playable", "Online"]
            jump = next(i for i in items if i["text"] == "Player can double jump"); assert jump["assignee"] == maya and jump["task"]
            tasks = api("/tasks", token=token, project=pid)[1]["tasks"]; assert len([t for t in tasks if t.get("source") == "plan"]) == len(items)
            wait_until(lambda: "TribeCode: first plan" in sh("git", "-C", str(ws), "log", "--format=%s"), what="PLAN.md commit")
            assert "- [ ] Player can double jump · Frontend · Maya" in (ws / "PLAN.md").read_text()
            friend.wait_for_selector("#chat-list .gx.k-plan")

            # ---- MCP: Maya's Claude reports with gists; dumps are refused
            agent = api("/agents", "POST", token=ftoken)[1]["token"]
            names = [t["name"] for t in mcp(agent, None, method="tools/list")["tools"]]
            assert {"post_gist", "read_plan", "my_role", "list_gists"} <= set(names), names
            e, t = mcp(agent, "my_role"); assert not e and "Frontend" in t and "app/" in t, t
            e, t = mcp(agent, "read_plan"); assert not e and "Player can double jump" in t, t
            e, t = mcp(agent, "post_gist", {"kind": "progress", "title": "Double jump feels floaty now", "bullets": ["Raised jump gravity on the way down", "Coyote time 80 ms", "Next: tune the second jump height"], "files": ["app/player.js", "app/tuning.js"], "task": jump["task"]})
            assert not e and "Posted progress gist" in t, t
            e, t = mcp(agent, "post_gist", {"kind": "progress", "title": "Here is the code", "bullets": ["```js\nfunction jump() { vy = -12 }\n```"]})
            assert e and "never carry code" in t, t
            e, t = mcp(agent, "post_gist", {"kind": "progress", "title": "Everything I did", "bullets": ["x" * 200, "y" * 200, "z" * 250]})
            assert e and "not a gist" in t, t
            e, t = mcp(agent, "post_gist", {"kind": "progress", "title": "Wired input", "bullets": ["const a = 1;", "let b = foo(a);", "return b;"]})
            assert e and "reads like code" in t, t
            host.wait_for_selector("#chat-list .gx.k-progress")
            wait_text(host, "#chat-list .gx.k-progress", "Double jump feels floaty now")
            card = host.locator("#chat-list .gx.k-progress").last
            assert card.locator("li").count() == 3
            card.locator(".gx-files").click(); card.locator(".gx-filelist .fchip").first.wait_for()
            assert "App" in card.locator(".gx-filelist").inner_text() and card.locator(".rchip").inner_text() == "Frontend"
            assert host.evaluate("getComputedStyle(document.querySelector('#chat-list .gx.k-progress')).getPropertyValue('--rc').trim()") == "#6C7CFF"
            shot(host, "flow-gist")

            # ---- upgrade gist -> a plan change only a human can approve; blocker surfaces on the plan
            e, t = mcp(agent, "post_gist", {"kind": "upgrade", "title": "Add a wall jump", "bullets": ["Levels feel flat without it", "Small change in app/player.js"]})
            assert not e and "proposed plan change" in t, t
            mcp(agent, "post_gist", {"kind": "blocker", "title": "Need the coin sprite before the pickup", "bullets": ["Waiting on Design"]})
            fl = api("/flow", token=token, project=pid)[1]["flow"]
            ch = fl["changes"][0]; assert ch["title"] == "Add a wall jump" and len(fl["blockers"]) == 1
            assert api(f"/flow/changes/{ch['id']}/approve", "POST", {}, token=agent, project=pid)[0] == 403
            host.evaluate("TribeShell.go('updates')"); host.wait_for_selector("#view-flow-updates:not(.hidden) #plan-hero")
            wait_text(host, "#plan-hero h2", "First playable")
            wait_text(host, "#plan-hero .ph-blk", "Need the coin sprite")
            host.click(f"[data-change='{ch['id']}'] [data-decide='approve']")
            wait_text(host, "#plan-hero", "Add a wall jump")
            assert "Add a wall jump" in (ws / "PLAN.md").read_text() or wait_until(lambda: "Add a wall jump" in (ws / "PLAN.md").read_text(), what="plan change in PLAN.md") is None
            assert any(t["title"] == "Add a wall jump" for t in api("/tasks", token=token, project=pid)[1]["tasks"])

            # ---- Assess now -> an assessment gist in the feed
            host.click("#flow-assess")
            host.wait_for_selector("#gx-feed .gx.k-assessment")
            wait_text(host, "#gx-feed .gx.k-assessment", "Blocked: Claude · Maya")

            # ---- a task finishing checks its plan item off (UI + PLAN.md + history in git)
            assert api(f"/tasks/{jump['task']}", "PATCH", {"status": "done"}, token=ftoken, project=pid)[0] == 200
            host.wait_for_selector(f"#plan-hero .pi.done[data-task='{jump['task']}']")
            wait_until(lambda: "- [x] Player can double jump" in (ws / "PLAN.md").read_text(), what="PLAN.md check-off")
            wait_until(lambda: 'check off "Player can double jump"' in sh("git", "-C", str(ws), "log", "--format=%s"), what="check-off commit")
            # blocker resolved by a "fixed" progress gist from the same agent
            mcp(agent, "post_gist", {"kind": "progress", "title": "Coin pickup works now", "bullets": ["Unblocked: sprite landed"]})
            wait_until(lambda: not api("/flow", token=token, project=pid)[1]["flow"]["blockers"], what="blocker closed")
            host.evaluate("TribeFlow.openUpdates()"); host.wait_for_selector("#plan-hero .pi.done")
            shot(host, "flow-plan")

            # ---- commits become auto-gists (Maya's branch commit), with folder chips
            st, r = api(f"/projects/{pid}/branch", "POST", {}, token=ftoken, project=pid); assert st == 200, r
            tree = Path(r["branch"]["path"]); (tree / "app" / "player.js").write_text("export const jump = 2\n")
            st, r = api(f"/projects/{pid}/branch/commit", "POST", {"message": "Tune the double jump"}, token=ftoken, project=pid); assert st == 200, r
            wait_until(lambda: any(g["auto"] and g["title"] == "Tune the double jump" for g in api("/gists", token=token, project=pid)[1]["gists"]), what="auto gist")
            g = next(g for g in api("/gists", token=token, project=pid)[1]["gists"] if g["auto"])
            assert g["files"] == ["app/player.js"] and g["by"] == maya and any("in App" in x for x in g["bullets"]), g
            # a direct commit on main (the repo poll) becomes one too
            (ws / "server").mkdir(exist_ok=True); (ws / "server" / "scores.js").write_text("module.exports = []\n")
            sh("git", "-C", str(ws), "-c", "user.name=Orion", "-c", "user.email=o@t", "add", "."); sh("git", "-C", str(ws), "-c", "user.name=Orion", "-c", "user.email=o@t", "commit", "-q", "-m", "Add a scores store")
            api("/repo/refresh", "POST", {}, token=token, project=pid)
            wait_until(lambda: any(g["title"] == "Add a scores store" for g in api("/gists", token=token, project=pid)[1]["gists"]), what="head gist")
            ctx = api("/context", token=token, project=pid)[1]
            assert "post_gist" in ctx and "## Plan (PLAN.md)" in ctx and "## Roles and folders" in ctx, ctx[:400]

            # ---- Roles view: rename, recolor, add a folder
            host.evaluate("TribeFlow.openRoles()"); host.wait_for_selector("#view-flow-roles:not(.hidden) .role-card")
            qa = host.locator(".role-card[data-rid='qa']")
            qa.locator("[data-color='plum']").click()
            host.wait_for_function("getComputedStyle(document.querySelector(\".role-card[data-rid='qa']\")).getPropertyValue('--rc').trim() === '#A98BC9'")
            qa = host.locator(".role-card[data-rid='qa']")
            qa.locator("[data-addf] input").fill("e2e"); qa.locator("[data-addf] button").click()
            host.wait_for_selector(".role-card[data-rid='qa'] .fchip:has-text('E2e')")
            assert (ws / "e2e" / "README.md").exists()
            shot(host, "flow-roles")

            # ---- phone shots: the gist card in chat, the plan hero
            phone.reload(); wait_text(phone, "#sync-status", "connected"); chat(phone)
            phone.wait_for_selector("#chat-list .gx.k-progress"); phone.wait_for_selector("#flow-dock.bar")
            phone.evaluate("document.querySelector('#chat-list .gx.k-progress').scrollIntoView({block: 'center'})")
            assert_fits(phone)
            shot(phone, "flow-gist-phone")
            phone.evaluate("TribeFlow.openUpdates()"); phone.wait_for_selector("#view-flow-updates:not(.hidden) #plan-hero .pi")
            assert_fits(phone)
            shot(phone, "flow-plan-phone")
            # leaving the view through the normal nav hides it again
            host.click("#wt-tasks"); host.wait_for_selector("#view-flow-roles", state="hidden")
            host.wait_for_selector("#board .task.has-role")
            b.close()
        log.flush(); log.seek(0); out = log.read()
        assert TOKEN not in out and "T3st" not in out, "token leaked into the server log"
        assert not errors, errors
        ok = True
        print("Flow test passed")
    finally:
        srv.terminate(); gh.shutdown()
        if not ok:
            try: log.flush(); log.seek(0); print(log.read()[-3000:])
            except Exception: pass


if __name__ == "__main__":
    main()
