"""End-to-end: repo autopilot, phone hand-offs ("Send to a desktop"), TRIBE_CONTEXT.md and the master integrator.

Sets up a temp project repo in /tmp with a bare "origin", main and two feature branches that conflict
with each other, starts the server with --repo, and drives a desktop host + an iPhone-sized friend.
Usage: python app/test/e2e_repo.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4789 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PATCH = """diff --git a/notes.txt b/notes.txt
new file mode 100644
--- /dev/null
+++ b/notes.txt
@@ -0,0 +1,2 @@
+Lantern should glow amber at night.
+Sent from a phone.
"""



def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + "/api" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return r.status, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def call(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read())["result"]
    if method != "tools/call":
        return d
    return d.get("isError", False), d["content"][0]["text"]


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_until(fn, timeout=20, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out waiting for {what}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-r-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="proj-r-", dir="/tmp")
    origin, repo = os.path.join(work, "origin.git"), os.path.join(work, "game")
    sh = lambda *a, cwd=None: subprocess.run(list(a), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    g = lambda *a: sh("git", "-C", repo, "-c", "user.email=maya@t", "-c", "user.name=Maya", *a)
    sh("git", "init", "-q", "--bare", "-b", "main", origin)
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "shared.txt").write_text("speed = 1\njump = 2\n"); Path(repo, "README.md").write_text("# Game\n")
    g("add", "."); g("commit", "-q", "-m", "init")
    g("remote", "add", "origin", origin); g("push", "-q", "-u", "origin", "main")
    g("checkout", "-q", "-b", "feat/fast-run"); Path(repo, "shared.txt").write_text("speed = 3\njump = 2\n"); Path(repo, "run.txt").write_text("run\n")
    g("add", "."); g("commit", "-q", "-m", "Faster running")
    g("checkout", "-q", "main"); g("checkout", "-q", "-b", "feat/slow-mo"); Path(repo, "shared.txt").write_text("speed = 0.5\njump = 2\n")
    g("add", "."); g("commit", "-q", "-m", "Slow motion mode")
    g("checkout", "-q", "main")
    origin_main = lambda: sh("git", "-C", origin, "rev-parse", "main")
    start_origin = origin_main()

    env = {**os.environ, "TRIBE_CONTEXT_DEBOUNCE_MS": "800", "TRIBE_REPO_POLL_MS": "2000"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--repo", repo, "--ollama", "http://localhost:9"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        assert api("/repo")[0] == 401 and api("/changes")[0] == 401 and api("/context")[0] == 401

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1600, "height": 1000}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            htok = host.evaluate("TribeStore.get().server.token")

            # ---- 1. Repo view: status + branches with a conflict hint ----
            host.evaluate("TribeApp.show('repo')")
            wait_text(host, "#repo-strip", "main")
            wait_text(host, "#br-list", "feat/fast-run"); wait_text(host, "#br-list", "feat/slow-mo")
            wait_text(host, "#br-list", "conflicts with feat/slow-mo", 15000)
            assert "clean" in host.inner_text("#repo-strip"), host.inner_text("#repo-strip")
            assert "↑0" in host.inner_text("#repo-strip") and "↓0" in host.inner_text("#repo-strip")
            wait_text(host, "#ap-body", "Auto-pull main when clean")
            assert host.locator('#ap-body [data-sw="autopilot.enabled"]:not([disabled])').count() == 1, "host can toggle autopilot"
            assert host.inner_text("#crumb-label") == "Task Board › Code repository"

            # ---- 2. phone sends a change with a patch; desktop takes it and applies it ----
            code = api("/invites", "POST", {"hours": 1, "maxUses": 2}, htok)[1]["invite"]["code"]
            phone = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{code}"); phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            ptok = phone.evaluate("TribeStore.get().server.token")
            phone.evaluate("localStorage.setItem('tribecode.iosHint', '1'); document.querySelector('.ios-hint') && document.querySelector('.ios-hint').remove()")
            phone.click('#menu-btn'); phone.click("#nest-ws-tasks"); phone.click("#wt-repo")   # phones: Project Hub lives in the panel
            phone.wait_for_selector('#ap-body [data-sw="autopilot.enabled"][disabled]')  # only the host toggles autopilot
            phone.click("#repo-send")
            phone.fill("#sd-title", "Amber lantern at night")
            phone.fill("#sd-desc", "The campfire lantern should glow amber after dark.")
            phone.fill("#sd-files", "notes.txt")
            phone.fill("#sd-code", PATCH)
            wait_text(phone, "#sd-hint", "Looks like a patch")
            shot(phone, "phone-send-to-desktop")
            phone.click("#sd-go")
            wait_text(phone, "#cr-list", "Amber lantern at night")
            wait_text(host, "#cr-list", "Amber lantern at night")
            cid = api("/changes", token=htok)[1]["changes"][0]["id"]
            assert Path(tmp, "changes", f"{cid}.md").exists() and Path(tmp, "changes", f"{cid}.patch").exists()
            host.click(f'[data-cr="{cid}"] [data-take]')
            wait_text(phone, "#cr-list", "taken · Orion")             # requester sees it live
            tl = api("/tasks", token=htok)[1]["tasks"]; assert any(t["title"] == "Change: Amber lantern at night" and t["status"] == "doing" for t in tl), ("linked task", tl, api("/changes", token=htok)[1])
            assert api(f"/changes/{cid}/apply", "POST", token=ptok)[0] == 403, "only host/claimer applies"
            host.click(f'[data-cr="{cid}"] [data-apply]')
            wait_text(host, "#cr-list", f"change/{cid}", 15000)
            assert sh("git", "-C", repo, "show", f"change/{cid}:notes.txt").startswith("Lantern should glow amber"), "patch applied into change/<id>"
            assert sh("git", "-C", repo, "log", "-1", "--format=%an", f"change/{cid}") == "Maya", "requester is the author"
            assert len(sh("git", "-C", repo, "worktree", "list").splitlines()) == 1, "temp worktree cleaned up"
            assert sh("git", "-C", repo, "status", "--porcelain", "--untracked-files=no") == "", "main working tree untouched"
            assert api(f"/changes/{cid}/apply", "POST", token=htok)[0] == 409
            # a bad patch is reported clearly
            bad = api("/changes", "POST", {"title": "Broken patch", "patch": "diff --git a/nope.txt b/nope.txt\n--- a/nope.txt\n+++ b/nope.txt\n@@ -1 +1 @@\n-old\n+new\n"}, ptok)[1]["change"]["id"]
            api(f"/changes/{bad}/claim", "POST", token=htok)
            st, d = api(f"/changes/{bad}/apply", "POST", token=htok)
            assert st == 422 and "git apply --3way failed" in d["error"], (st, d)
            assert sh("git", "-C", repo, "branch", "--list", f"change/{bad}") == "", "failed branch removed"
            api(f"/changes/{bad}/done", "POST", token=ptok)

            # ---- 3. TRIBE_CONTEXT.md exists, mentions the change, updates after a new task ----
            ctx_file = Path(tmp, "TRIBE_CONTEXT.md")
            wait_until(lambda: "Amber lantern at night" in ctx_file.read_text(), 15, "context mentions the change request")
            assert Path(repo, "TRIBE_CONTEXT.md").exists(), "also written at the repo root"
            text = ctx_file.read_text()
            for sec in ["## Summary", "## What changed since last time", "## Who is online", "## Active tasks", "## Open change requests", "## Repo", "## Recent chat", "feat/slow-mo"]:
                assert sec in text, f"context missing {sec}"
            assert len(text.splitlines()) < 250
            api("/tasks", "POST", {"title": "Ship the lantern shader"}, htok)
            wait_until(lambda: "Ship the lantern shader" in ctx_file.read_text(), 15, "context updates after a new task")
            assert 'New task "Ship the lantern shader"' in ctx_file.read_text()
            st, md = api("/context", token=ptok, raw=True)
            assert st == 200 and md.startswith("# TRIBE_CONTEXT") and "Ship the lantern shader" in md
            # keep it local -> .gitignore
            api("/repo/settings", "PUT", {"keepContextLocal": True}, htok)
            assert "/TRIBE_CONTEXT.md" in Path(repo, ".gitignore").read_text()
            api("/repo/settings", "PUT", {"keepContextLocal": False}, htok)
            assert "TRIBE_CONTEXT.md" not in Path(repo, ".gitignore").read_text()
            assert api("/repo/settings", "PUT", {"autopilot": {"enabled": True}}, ptok)[0] == 403

            # floating Context window (Ctrl+Shift+K), updates live
            host.keyboard.press("Control+Shift+K")
            host.wait_for_selector("#ctx-win:not(.hidden)")
            wait_text(host, "#ctx-body", "Ship the lantern shader")
            api("/tasks", "POST", {"title": "Tune firefly count"}, htok)
            wait_text(host, "#ctx-body", "Tune firefly count", 15000)
            host.click("#ctx-min"); host.wait_for_selector("#ctx-win.collapsed"); host.click("#ctx-min")
            phone.evaluate("document.getElementById('ctx-btn').click()"); phone.wait_for_selector("#ctx-win:not(.hidden)")
            box = phone.locator("#ctx-win").bounding_box()
            assert box["width"] >= 389 and box["height"] >= 840, f"full-screen sheet on phones: {box}"
            wait_text(phone, "#ctx-body", "Amber lantern")
            phone.click("#ctx-close")

            # ---- 4. MCP: the host's agent is the master; collect_changes reports the conflict ----
            atok = api("/agents", "POST", token=htok)[1]["token"]
            mtok = api("/agents", "POST", token=ptok)[1]["token"]
            assert "MASTER INTEGRATOR" in call(atok, None, method="initialize")["instructions"]
            assert "MASTER INTEGRATOR" not in call(mtok, None, method="initialize")["instructions"]
            tools = [t["name"] for t in call(atok, None, method="tools/list")["tools"]]
            for t in ["get_context", "collect_changes", "run_checks", "propose_integration", "integrate", "list_changes", "claim_change", "tribe_overview"]:
                assert t in tools, t
            err, ctx = call(atok, "get_context"); assert not err and "Amber lantern" in ctx
            err, out = call(atok, "collect_changes"); assert not err, out
            cc = json.loads(out)
            names = [x["branch"] for x in cc["branches"]]
            assert "feat/fast-run" in names and "feat/slow-mo" in names and f"change/{cid}" in names, names
            pair = [q for q in cc["conflicts"] if {q["a"], q["b"]} == {"feat/fast-run", "feat/slow-mo"}]
            assert pair and "shared.txt" in pair[0]["conflictFiles"], cc["pairs"]
            cr_row = [x for x in cc["branches"] if x["branch"] == f"change/{cid}"][0]
            assert cr_row["changeRequest"]["id"] == cid and not cr_row["conflictsWith"]
            assert len(sh("git", "-C", repo, "worktree", "list").splitlines()) == 1

            # ---- 5. run_checks in a temp worktree ----
            api("/repo/settings", "PUT", {"checkCommand": 'sh -c "exit 0"'}, htok)
            err, out = call(atok, "run_checks", {"branch": "feat/fast-run"}); r = json.loads(out)
            assert not err and r["ok"] is True and r["command"] == 'sh -c "exit 0"', out
            api("/repo/settings", "PUT", {"checkCommand": 'sh -c "pwd; exit 3"'}, htok)
            err, out = call(atok, "run_checks", {"branch": "feat/fast-run"}); r = json.loads(out)
            assert err and r["ok"] is False and r["exitCode"] == 3 and "tribe-wt-" in r["tail"] and repo not in r["tail"], out
            api("/repo/settings", "PUT", {"checkCommand": 'sh -c "exit 0"'}, htok)
            assert len(sh("git", "-C", repo, "worktree", "list").splitlines()) == 1

            # ---- 6. propose_integration creates an approval ----
            err, out = call(atok, "propose_integration", {"branches": ["feat/fast-run"], "notes": "Green and conflict-free on its own."}); prop = json.loads(out)
            assert not err and prop["state"] == "pending", out
            p = [x for x in api("/proposals", token=htok)[1]["proposals"] if x["id"] == prop["proposal"]][0]
            assert p["status"] == "open" and "feat/fast-run" in p["body"] and p["votes"] == {}
            ints = api("/integrations", token=htok)[1]["integrations"]
            assert ints[0]["id"] == prop["id"] and ints[0]["state"] == "pending"
            err, out = call(mtok, "integrate", {"id": prop["id"]}); assert err and "master integrator" in out, "non-master agents cannot integrate"

            # ---- 7. integrate refuses before approval; after the humans approve it merges + pushes ----
            err, out = call(atok, "integrate", {"id": prop["id"]})
            assert err and "Not approved" in out, out
            assert origin_main() == start_origin
            host.click("#repo-refresh")
            wait_text(host, "#int-list", "awaiting approval")
            host.click(f'[data-int="{prop["id"]}"] [data-approve]')       # host approves in the Repo view
            wait_until(lambda: api("/integrations", token=htok)[1]["integrations"][0]["tally"]["yes"] == 1, 10, "host vote")
            api(f'/proposals/{prop["proposal"]}/vote', "POST", {"vote": "yes"}, ptok)   # Maya approves from her phone
            wait_text(host, "#int-list", "approved")
            err, out = call(atok, "integrate", {"id": prop["id"]}); r = json.loads(out)
            assert not err and r["ok"] and r["pushed"], out
            assert origin_main() == sh("git", "-C", repo, "rev-parse", "main") != start_origin, "main pushed to origin"
            assert sh("git", "-C", origin, "show", "main:shared.txt").startswith("speed = 3"), "feat/fast-run merged"
            assert "Integrate feat/fast-run" in sh("git", "-C", origin, "log", "-3", "--format=%s", "main")
            assert sh("git", "-C", repo, "rev-parse", "--verify", "--quiet", r["branch"]), "integration/<date> branch kept"
            assert len(sh("git", "-C", repo, "worktree", "list").splitlines()) == 1
            wait_text(host, "#int-list", "merged")
            wait_text(host, "#act-list", "Integrated feat/fast-run")

            # the conflicting branch is stopped, nothing is pushed
            err, out = call(atok, "propose_integration", {"branches": ["feat/slow-mo"]}); prop2 = json.loads(out)
            for tok in (htok, ptok): api(f'/proposals/{prop2["proposal"]}/vote', "POST", {"vote": "yes"}, tok)
            before = origin_main()
            err, out = call(atok, "integrate", {"id": prop2["id"]}); r2 = json.loads(out)
            assert err and r2["ok"] is False and r2["stage"] == "merge" and "shared.txt" in r2["conflicts"], out
            assert origin_main() == before and len(sh("git", "-C", repo, "worktree", "list").splitlines()) == 1
            wait_text(host, "#int-list", "stopped")

            # autopilot: pull main when clean (someone else pushed to origin)
            other = os.path.join(work, "other"); sh("git", "clone", "-q", origin, other)
            Path(other, "credits.txt").write_text("Maya\n")
            sh("git", "-C", other, "add", "."); sh("git", "-C", other, "-c", "user.email=j@t", "-c", "user.name=Jay", "commit", "-q", "-m", "Credits"); sh("git", "-C", other, "push", "-q", "origin", "main")
            host.click('#ap-body [data-sw="autopilot.enabled"]')
            host.wait_for_selector('#ap-body [data-sw="autopilot.enabled"].on')
            host.click("#repo-refresh")
            wait_text(host, "#act-list", "Autopilot pulled 1 commit into main", 20000)
            assert Path(repo, "credits.txt").exists()
            acts = [json.loads(l) for l in Path(tmp, "repo", "activity.jsonl").read_text().splitlines()]
            assert any(a["kind"] == "pull" for a in acts) and any(a["kind"] == "integrate" for a in acts)

            # screenshots
            host.click(f'[data-cr="{cid}"] [data-cr-toggle]')
            host.wait_for_selector(f'[data-patch="{cid}"] .add')
            host.evaluate("document.querySelector('#main').scrollTop = 0")
            if take:
                host.evaluate("TribeRepo.context.toggle(false); document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
                shot(host, "repo-view")
                host.evaluate("TribeRepo.context.toggle(true)")
                host.wait_for_selector("#ctx-win:not(.hidden)")
                wait_text(host, "#ctx-body", "Tune firefly count")
                shot(host, "context-window")
            b.close()
    finally:
        srv.terminate()
        try: out = srv.stdout.read().decode()
        except Exception: out = ""
        if errors or "Error" in out: print(out[-3000:])
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Repo test passed")


if __name__ == "__main__":
    main()
