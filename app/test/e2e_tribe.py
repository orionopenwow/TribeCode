"""End-to-end: host starts a tribe, invites a friend, they chat, make a task from chat and move it.

Starts the real server on a temp folder, drives two browser contexts (host + friend).
Usage: python app/test/e2e_tribe.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
MOCK = 11555 + int(__import__('os').environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4799 + int(__import__('os').environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
errors = []




def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, method, params=None, id_=1):
    body = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {}), **({"id": id_} if id_ is not None else {})}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None)


def call(token, tool, args=None):
    st, d = mcp(token, "tools/call", {"name": tool, "arguments": args or {}})
    r = d["result"]
    return r.get("isError", False), r["content"][0]["text"]


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"{name}.png"))


def wait_text(page, sel, text, timeout=8000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "11434" not in m.text and "api.github.com" not in m.text and "ERR_CONNECTION_REFUSED" not in m.text and "ERR_FAILED" not in m.text and "ERR_NAME_NOT_RESOLVED" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-")
    repo = tempfile.mkdtemp(prefix="proj-")
    g = lambda *a: subprocess.run(["git", "-C", repo, *a], check=True, capture_output=True, text=True).stdout
    g("init", "-q", "-b", "main"); gc = lambda *a: g("-c", "user.email=t@t", "-c", "user.name=Maya", *a)
    gc("commit", "-q", "--allow-empty", "-m", "init")
    g("branch", "maya/campfire-save-points")
    for i in range(6): gc("commit", "-q", "--allow-empty", "-m", f"main {i}")
    g("checkout", "-q", "-b", "rogue-experiment"); Path(repo, "x.txt").write_text("x"); g("add", "."); gc("commit", "-q", "-m", "experiment"); g("checkout", "-q", "main")
    mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(MOCK)], stdout=subprocess.DEVNULL)
    time.sleep(0.3)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--repo", repo, "--ollama", f"http://localhost:{MOCK}"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        # ---- API guards ----
        assert api("/members")[0] == 401
        assert api("/invites/nope")[0] == 404
        assert api("/join", "POST", {"code": "nope", "name": "x"})[0] == 410

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1600, "height": 1000}).new_page(); watch(host, "host")
            # host: first-run setup -> becomes host
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")  # the first-visit intro is covered by e2e_friend.py
            try:
                host.wait_for_function("document.querySelector('#sync-status').innerText.includes('connected')", timeout=5000)
            except Exception:
                print("STATUS", host.inner_text("#sync-status"), host.evaluate("JSON.stringify(TribeStore.get().server)"), errors); raise
            wait_text(host, "#room-list", "Orion")
            wait_text(host, "#chat-list", "started the tribe")

            # invite via UI
            host.click("#tour-invite")
            try:
                host.wait_for_function("document.querySelector('#inv-link') && document.querySelector('#inv-link').innerText.includes('/join/')", timeout=5000)
            except Exception:
                print("INVITE", host.inner_text("#invite-body")); raise
            link = host.inner_text("#inv-link")
            shot(host, "invite-modal")
            host.click("[data-close]")

            # friend joins
            friend = b.new_context(viewport={"width": 1600, "height": 1000}).new_page(); watch(friend, "friend")
            friend.goto(link)
            friend.wait_for_selector("#form:not(.hidden)")
            assert "Join Campfire Crew" in friend.inner_text("#title")
            assert "Orion invited you" in friend.inner_text("#lead")
            friend.fill("#name", "Maya")
            shot(friend, "join-live")
            friend.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")   # this test is not about the after-join Claude Code sheet (e2e_instant is)
            friend.click("#go")
            friend.wait_for_function("!!document.querySelector('#sync-status')", timeout=15000)
            friend.wait_for_function("document.querySelector('#sync-status').innerText.includes('connected')", timeout=5000)

            # presence on host
            host.wait_for_function("document.querySelector('#room-list').innerText.includes('Maya')", timeout=5000)
            try:
                wait_text(host, "#room-count", "2 online")
            except Exception:
                print("ROOM", repr(host.inner_text("#room-count")), repr(host.inner_text("#room-list")), host.evaluate("JSON.stringify(TribeClient.state().members)")); raise

            # chat both ways + /task
            chat(friend).fill("#chat-input", "hey! someone should add controller support")
            chat(friend).press("#chat-input", "Enter")
            host.wait_for_function("document.querySelector('#chat-list').innerText.includes('controller support')", timeout=5000)
            chat(host).fill("#chat-input", "/task Controller support")
            chat(host).press("#chat-input", "Enter")
            friend.wait_for_function("document.querySelector('#chat-list').innerText.includes('Made that a task')", timeout=5000)

            # tasks board: friend sees the task, drags it to In progress; host sees the move live
            host.click('[data-nav="tasks"]:visible'); friend.click('[data-nav="tasks"]:visible')
            friend.wait_for_selector('[data-col="backlog"] .task')
            friend.drag_and_drop('[data-col="backlog"] .task', '[data-col="doing"]')
            host.wait_for_selector('[data-col="doing"] .task', timeout=5000)
            assert "Controller support" in host.inner_text('[data-col="doing"]')
            # quick add + rename + assign on host
            host.click('[data-add="backlog"]'); host.fill(".quick-add", "Campfire save points"); host.press(".quick-add", "Enter")
            friend.wait_for_function("document.querySelector('[data-col=\"backlog\"]').innerText.includes('Campfire save points')", timeout=5000)
            host.keyboard.press("Escape")
            host.select_option('[data-col="doing"] .task select[data-assign]', label="Maya")
            friend.wait_for_function("document.querySelector('[data-col=\"doing\"] select[data-assign]').selectedOptions[0].text === 'Maya'", timeout=5000)
            # presence shows where people are
            host.wait_for_function("document.querySelector('#room-list').innerText.includes('Task Board')", timeout=5000)
            shot(host, "tasks-live")

            # stored as markdown on disk
            md = list(Path(tmp, "tasks").glob("*.md"))
            assert len(md) == 2, md
            assert any('status: "doing"' in f.read_text() for f in md), [f.read_text() for f in md]
            assert Path(tmp, "chat", "general.jsonl").exists()

            # ---- approval board ----
            host.evaluate("TribeApp.show('board')"); friend.evaluate("TribeApp.show('board')")
            wait_text(host, "#prop-list", "No open proposals")
            host.dblclick("#vision-text"); host.keyboard.type("Cozy co-op pixel adventure. Never competitive."); host.click("#view-board h1")
            wait_text(host, ".toast", "VISION.md saved")
            assert "Never competitive" in Path(tmp, "VISION.md").read_text()
            host.click("#prop-new")
            host.fill("#np-title", "Campfire save points")
            host.fill("#np-body", "## Plan\nSave the world at any lit campfire.\n\n## Tasks\n- [ ] Save format\n- [ ] Campfire UI\n")
            host.click("#np-go")
            wait_text(friend, "#prop-list", "Campfire save points")
            wait_text(friend, "#prop-list", "👍 1")
            assert "You're the host" not in (friend.inner_text(".toast") if friend.locator(".toast").count() else ""), "friend must not be told they're host"
            assert friend.evaluate("(TribeClient.state().tribe || {}).name") == "Campfire Crew"
            shot(friend, "board-live")
            friend.click('.prop [data-vote="yes"]')
            wait_text(host, "#ms-list", "v0.1.0")
            wait_text(host, "#chat-list", "Approved: Campfire save points")
            host.click('[data-pt="approved"]')
            wait_text(host, "#prop-list", "Approved → v0.1.0")
            assert friend.locator("[data-release]").count() == 0, "only host can release"
            host.click('[data-release="v0.1.0"]')
            wait_text(host, "#ms-list", "released")
            assert "v0.1.0" in g("tag"), "milestone tagged in project repo"
            st, d = api("/tasks", token=None)
            assert st == 401
            assert len(list(Path(tmp, "tasks").glob("*.md"))) == 4, "2 tasks created from the proposal checklist"
            assert list(Path(tmp, "decisions").glob("*campfire-save-points.md"))

            # ---- vision check by the brain ----
            host.click("#prop-new"); host.fill("#np-title", "Add a battle royale mode"); host.fill("#np-body", "Make it competitive PvP."); host.click("#np-go")
            wait_text(friend, "#prop-list", "Off the vision")
            wait_text(friend, "#chat-list", "may conflict with VISION.md")

            # ---- docs ----
            wait_text(host, "#brain-label", "qwen3:8b")
            host.click('[data-nav="docs"]:visible')
            host.wait_for_selector("#doc-first")
            host.click("#doc-first")
            host.wait_for_selector("#doc-title")
            host.fill("#doc-title", "Game design doc")
            host.click("#doc-body")
            host.keyboard.type("## Core loop\nExplore by day, build camp at night. Every friend lights a campfire on the shared map.\n/to")
            host.wait_for_selector("#doc-slash:not(.hidden)")
            host.keyboard.press("Enter")
            host.keyboard.type("Forest biome")
            host.keyboard.press("Enter")
            host.keyboard.type("Shared inventory")
            assert "- [ ] Forest biome\n- [ ] Shared inventory" in host.evaluate("document.querySelector('#doc-body').value"), host.evaluate("document.querySelector('#doc-body').value")
            wait_text(host, "#doc-status", "Saved")
            friend.click('[data-nav="docs"]:visible')
            wait_text(friend, "#doc-list", "Game design doc")
            if not friend.locator("#doc-title").count(): friend.click(".fg-card[title='Game design doc']")   # desktop Files opens on the file grid
            friend.wait_for_function("document.querySelector('#doc-title') && document.querySelector('#doc-title').value === 'Game design doc'", timeout=8000)
            # live update reaches an idle reader
            host.click("#doc-body"); host.keyboard.press("Control+End"); host.keyboard.type("\n\nCombat rework parked until the vote.")
            friend.wait_for_function("document.querySelector('#doc-body').value.includes('Combat rework')", timeout=8000)
            # brain TL;DR
            friend.click("#doc-sum")
            wait_text(friend, "#doc-tldr", "Co-op pixel game design")
            assert "<think>" not in friend.inner_text("#doc-tldr")
            # read mode renders a real checklist; ticking it saves
            friend.click('[data-mode="read"]')
            friend.wait_for_selector("#doc-read input[type=checkbox]")
            friend.locator("#doc-read input[type=checkbox]").first.check()
            wait_text(friend, "#doc-status", "Saved")
            shot(friend, "docs-live")
            friend.click('[data-mode="write"]')
            tok = host.evaluate("TribeStore.get().server.token")
            slug = friend.evaluate("document.querySelector('.doc-item.on').dataset.slug")
            # live co-editing: an API write while the friend types merges in (no conflict banner)
            assert friend.evaluate("TribeDocs.live()")
            friend.click("#doc-body"); friend.keyboard.press("Control+End"); friend.keyboard.type(" Typed live.")
            st, d = api("/docs/" + slug, token=tok)
            st, d = api("/docs/" + slug, "PUT", {"title": d["doc"]["title"], "body": "Host prepends.\n" + d["doc"]["body"], "baseVersion": d["doc"]["version"]}, token=tok)
            assert st == 200 and "Host prepends." in d["doc"]["body"], d  # the friend's last keystrokes may still be in flight; convergence is checked next
            friend.wait_for_function("document.querySelector('#doc-body').value.startsWith('Host prepends.') && document.querySelector('#doc-body').value.includes('Typed live.')", timeout=8000)
            assert friend.is_hidden("#doc-banner")
            # fallback without a live session (e.g. an old server): the conflict banner still protects unsaved text
            friend.evaluate("TribeDocs.setLive(false)")
            assert not friend.evaluate("TribeDocs.live()")
            friend.click("#doc-body"); friend.keyboard.press("Control+End"); friend.keyboard.type(" Maya was here.")
            st, d = api("/docs/" + slug, token=tok)
            st, d = api("/docs/" + slug, "PUT", {"title": d["doc"]["title"], "body": d["doc"]["body"] + "\nHost edit.", "baseVersion": d["doc"]["version"]}, token=tok)
            assert st == 200, d
            friend.wait_for_selector("#doc-banner:not(.hidden)", timeout=8000)
            friend.click("#cf-mine")
            wait_text(friend, "#doc-status", "Saved")
            assert "Maya was here." in Path(tmp, "docs", slug + ".md").read_text()
            # "Keep mine" reached the host's live editor too
            host.wait_for_function("document.querySelector('#doc-body').value.includes('Maya was here.')", timeout=8000)
            friend.evaluate("TribeDocs.setLive(true)")
            assert friend.evaluate("TribeDocs.live()")
            # import a file
            friend.evaluate("TribeDocs.importFiles([new File(['# Notes from the jam\\n\\nIdeas: fishing, music.'], 'jam-notes.md', {type: 'text/markdown'})])")
            wait_text(friend, "#doc-list", "jam-notes")
            assert Path(tmp, "docs", "jam-notes.md").exists()

            # ---- standup ----
            host.click('[data-nav="home"]:visible'); host.wait_for_selector("#pj-more", state="attached"); host.evaluate("document.querySelector('#pj-more').open = true"); host.click("#standup-go")
            wait_text(host, "#standup-text", "Maya: asked for controller support")
            assert list(Path(tmp, "brain").glob("standup-*.md"))

            # ---- drift radar ----
            host.evaluate("TribeApp.show('board')")
            wait_text(host, "#radar-list", "maya/campfire-save-points")
            wait_text(host, "#radar-list", "6 behind")
            wait_text(host, "#radar-list", "no task")
            shot(host, "board-radar")

            # ---- command palette ----
            host.keyboard.press("Control+k")
            host.wait_for_selector("#palette:not(.hidden)")
            host.keyboard.type("game des")
            wait_text(host, "#pal-list", "Game design doc")
            host.keyboard.press("Enter")
            host.wait_for_function("document.querySelector('#doc-title') && document.querySelector('#doc-title').value === 'Game design doc'", timeout=8000)
            host.keyboard.press("Control+k"); host.keyboard.type("bug inb"); host.keyboard.press("Enter")
            host.wait_for_selector("#view-bugs:not(.hidden)")

            # ---- bug inbox: capture, triage, dedupe, self-heal ----
            host.keyboard.press("Control+Shift+B")
            host.fill("#bug-title", "Chat stops syncing after reconnect")
            host.fill("#bug-details", "Wifi dropped, chat never came back.")
            host.click("#bug-go")
            wait_text(host, "#bug-list", "Chat stops syncing after reconnect")
            wait_text(host, "#bug-list", "sync")
            friend.keyboard.press("Control+Shift+B")
            friend.fill("#bug-title", "chat stops syncing after a reconnect")
            friend.click("#bug-go")
            wait_text(friend, ".toast", "Merged with an existing report")
            wait_text(host, "#bug-list", "seen 2×")
            shot(host, "bugs-live")
            host.click(".bug [data-mk]")
            wait_text(host, "#bug-list", "resolves when it's done")
            tok = host.evaluate("TribeStore.get().server.token")
            st, d = api("/tasks", token=tok)
            fix = [t for t in d["tasks"] if t["title"].startswith("Fix: Chat stops")][0]
            assert api("/tasks/" + fix["id"], "PATCH", {"status": "done"}, token=tok)[0] == 200
            wait_text(friend, "#chat-list", "Bug resolved by finishing its task")
            host.click('[data-bf="resolved"]')
            wait_text(host, "#bug-list", "resolved")

            # ---- Claude Code joins over MCP ----
            host.click("#cc-connect")
            wait_text(host, "#invite-body", "claude mcp add --transport http tribecode")
            cmd = host.inner_text("#cc-cmd")
            atok = cmd.split("Bearer ")[1].rstrip('"')
            assert f"{BASE}/mcp" in cmd
            host.click("[data-close]")
            st, d = mcp(atok, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}})
            assert d["result"]["serverInfo"]["name"] == "tribecode" and d["result"]["protocolVersion"] == "2025-06-18"
            assert mcp(atok, "notifications/initialized", id_=None)[0] == 202
            names = [t["name"] for t in mcp(atok, "tools/list")[1]["result"]["tools"]]
            assert {"tribe_overview", "claim_file", "write_doc", "update_task", "propose"} <= set(names), names
            e, t = call(atok, "tribe_overview"); assert not e and "Campfire Crew" in t and "Never competitive" in t
            wait_text(host, "#tour-room", "Claude · Orion")
            e, t = call(atok, "claim_file", {"path": "src/world/", "note": "refactoring saves"}); assert not e, t
            wait_text(friend, "#claims-list", "src/world/")
            st, d = api("/claims", "POST", {"path": "src/world/campfire.ts"}, token=friend.evaluate("TribeStore.get().server.token"))
            assert st == 409 and "Claude" in d["error"], d
            e, t = call(atok, "create_task", {"title": "Write save-file migration", "status": "doing"}); assert not e
            tid = t.split()[1].rstrip(":")
            e, t = call(atok, "update_task", {"id": tid, "take": True, "note": "Started on the schema"}); assert not e
            e, t = call(atok, "write_doc", {"name": "Agent notes", "body": "# Agent notes\n\nSaves live in src/world."}); assert not e, t
            e, t = call(atok, "write_doc", {"name": "Agent notes", "body": "overwrite"}); assert e and "base_version" in t
            e, t = call(atok, "read_doc", {"name": "agent-notes"}); assert "version 1" in t
            e, t = call(atok, "write_doc", {"name": "agent-notes", "body": "# Agent notes\n\nv2", "base_version": 1}); assert not e and "version 2" in t
            e, t = call(atok, "post_chat", {"text": "Taking the save-file migration, claimed src/world/"}); assert not e
            wait_text(friend, "#chat-list", "Taking the save-file migration")
            e, t = call(atok, "propose", {"title": "Split world saves per player", "body": "## Tasks\n- [ ] Per-player save"}); assert not e
            assert api("/proposals", token=atok)[1]["proposals"][0]["tally"]["yes"] == 0, "agents don't vote"
            pid = api("/proposals", token=atok)[1]["proposals"][0]["id"]
            assert api(f"/proposals/{pid}/vote", "POST", {"vote": "yes"}, token=atok)[0] == 403
            assert api("/invites", "POST", {}, token=atok)[0] == 403
            e, t = call(atok, "release_file", {"path": "src/world/"}); assert not e
            wait_text(host, "#room-agents", "using release file")
            shot(host, "agents-live")

            # ---- follow mode ----
            host_id = host.evaluate("TribeClient.state().me.id")
            friend.locator(f'#room-list [data-follow="{host_id}"]').dispatch_event('click')   # the room list is hidden on desktop
            chat(friend).click("#dm-menu [data-act='follow']")   # clicking a person offers Message / Follow
            friend.wait_for_selector("#view-bugs:not(.hidden)", timeout=5000)
            wait_text(friend, ".toast", "Following Orion")

            # ---- in-app join (desktop-style UI, not served by the tribe) ----
            tok = host.evaluate("TribeStore.get().server.token")
            st, d = api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=tok)
            link = f"{BASE}/join/{d['invite']['code']}"
            jay = b.new_context(viewport={"width": 1600, "height": 1000}).new_page(); watch(jay, "jay")
            jay.goto((ROOT / "app" / "ui" / "index.html").as_uri() + "?reset=1")
            jay.evaluate("TribeStore.set({name: 'Jay'}); TribeApp.refresh()")
            parsed = jay.evaluate("TribeApp.parseInvite('tribecode://join?server=' + encodeURIComponent('http://10.0.0.5:4747') + '&code=ab12C')")
            assert parsed == {"server": "http://10.0.0.5:4747", "code": "ab12C"}, parsed
            jay.evaluate("TribeHub.open('home')"); jay.click("#hub-join")   # not in a tribe yet: Home's Join a friend's tribe
            jay.fill("#join-link", link); jay.click("#join-go")
            wait_text(jay, "#invite-body", "Join Campfire Crew")
            assert jay.input_value("#jn-name") == "Jay"
            jay.click("#jn-go")
            wait_text(jay, "#sync-status", "connected")
            wait_text(host, "#room-list", "Jay")
            wait_text(jay, "#tour-room", "Claude · Orion")
            wait_text(jay, "#room-count", "4 online")
            # single-use invite is now spent
            assert api(f"/invites/{d['invite']['code']}")[0] == 410
            jay.close()
            # the join page offers the desktop app
            friend2 = b.new_context().new_page()
            st, d2 = api("/invites", "POST", {}, token=tok)
            friend2.goto(f"{BASE}/join/{d2['invite']['code']}")
            friend2.wait_for_selector("#open-app:not(.hidden)")
            assert friend2.get_attribute("#open-app", "href").startswith("tribecode://join?server=")
            friend2.close()

            # update hand-off picks real online peers
            host.goto(BASE + "/?simulateUpdate=9.9.9")
            host.wait_for_function("document.querySelector('#update-btn').classList.contains('ready')", timeout=8000)
            api("/claims", "POST", {"path": "src/ui/hud.ts", "note": "HUD polish"}, token=tok)
            host.wait_for_function("(TribeClient.state().claims || []).length > 0", timeout=5000)
            host.click("#update-btn", button="right")   # the details popover; a left click restarts at once
            assert "1 friend online" in host.inner_text("#update-pop")
            assert "src/ui/hud.ts" in host.inner_text("#update-pop")
            host.select_option(".handoff-to >> nth=-1", label="Maya")
            host.click("#up-go")
            maya_id = friend.evaluate("TribeClient.state().me.id")
            for _ in range(40):
                cl = api("/claims", token=tok)[1]["claims"]
                if any(c["path"] == "src/ui/hud.ts" and c["by"] == maya_id for c in cl): break
                time.sleep(0.2)
            else:
                raise AssertionError("claim was not handed off: %r" % cl)
            b.close()
    finally:
        srv.terminate(); mock.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("E2E tribe test passed")


if __name__ == "__main__":
    main()
