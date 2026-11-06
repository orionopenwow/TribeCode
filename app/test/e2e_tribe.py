"""End-to-end: host starts a tribe, invites a friend, they chat, make a task from chat and move it.

Starts the real server on a temp folder, drives two browser contexts (host + friend).
Usage: python app/test/e2e_tribe.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4799
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"{name}.png"))


def wait_text(page, sel, text, timeout=8000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "11434" not in m.text and "api.github.com" not in m.text and "ERR_CONNECTION_REFUSED" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-")
    repo = tempfile.mkdtemp(prefix="proj-")
    g = lambda *a: subprocess.run(["git", "-C", repo, *a], check=True, capture_output=True, text=True).stdout
    g("init", "-q"); g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init")
    mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), "11555"], stdout=subprocess.DEVNULL)
    time.sleep(0.3)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--repo", repo, "--ollama", "http://localhost:11555"],
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
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
            host = b.new_context(viewport={"width": 1600, "height": 1000}).new_page(); watch(host, "host")
            # host: first-run setup -> becomes host
            host.goto(BASE)
            host.wait_for_selector("#onboard:not(.hidden)")
            host.click("#ob-next"); host.fill("#ob-name", "Orion"); host.click("#ob-next")
            host.click("#ob-skip")
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
            friend.click("#go")
            friend.wait_for_selector("#onboard:not(.hidden)")
            friend.click("#ob-next")
            assert friend.input_value("#ob-name") == "Maya", "name carried over from join"
            friend.click("#ob-skip")
            friend.wait_for_function("document.querySelector('#sync-status').innerText.includes('connected')", timeout=5000)

            # presence on host
            host.wait_for_function("document.querySelector('#room-list').innerText.includes('Maya')", timeout=5000)
            try:
                wait_text(host, "#room-count", "2 online")
            except Exception:
                print("ROOM", repr(host.inner_text("#room-count")), repr(host.inner_text("#room-list")), host.evaluate("JSON.stringify(TribeClient.state().members)")); raise

            # chat both ways + /task
            friend.fill("#chat-input", "hey! someone should add controller support")
            friend.press("#chat-input", "Enter")
            host.wait_for_function("document.querySelector('#chat-list').innerText.includes('controller support')", timeout=5000)
            host.fill("#chat-input", "/task Controller support")
            host.press("#chat-input", "Enter")
            friend.wait_for_function("document.querySelector('#chat-list').innerText.includes('Made that a task')", timeout=5000)

            # tasks board: friend sees the task, drags it to In progress; host sees the move live
            host.click('[data-nav="tasks"]'); friend.click('[data-nav="tasks"]')
            friend.wait_for_selector('[data-col="backlog"] .task')
            friend.drag_and_drop('[data-col="backlog"] .task', '[data-col="doing"]')
            host.wait_for_selector('[data-col="doing"] .task', timeout=5000)
            assert "Controller support" in host.inner_text('[data-col="doing"]')
            # quick add + rename + assign on host
            host.click('[data-add="backlog"]'); host.fill(".quick-add", "Campfire save points"); host.press(".quick-add", "Enter")
            friend.wait_for_function("document.querySelector('[data-col=\"backlog\"]').innerText.includes('Campfire save points')", timeout=5000)
            host.keyboard.press("Escape")
            host.select_option('[data-col="doing"] .task select', label="Maya")
            friend.wait_for_function("document.querySelector('[data-col=\"doing\"] select').selectedOptions[0].text === 'Maya'", timeout=5000)
            # presence shows where people are
            host.wait_for_function("document.querySelector('#room-list').innerText.includes('Tasks')", timeout=5000)
            shot(host, "tasks-live")

            # stored as markdown on disk
            md = list(Path(tmp, "tasks").glob("*.md"))
            assert len(md) == 2, md
            assert any('status: "doing"' in f.read_text() for f in md), [f.read_text() for f in md]
            assert Path(tmp, "chat", "general.jsonl").exists()

            # ---- approval board ----
            host.click('[data-nav="board"]'); friend.click('[data-nav="board"]')
            wait_text(host, "#prop-list", "No open proposals")
            host.dblclick("#vision-text"); host.keyboard.type("Cozy co-op pixel adventure. Never competitive."); host.click("#view-board h1")
            wait_text(host, ".toast", "VISION.md saved")
            assert "Never competitive" in Path(tmp, "VISION.md").read_text()
            host.click("#prop-new")
            host.fill("#np-title", "Campfire save points")
            host.fill("#np-body", "## Plan\nSave the world at any lit campfire.\n\n## Tasks\n- [ ] Save format\n- [ ] Campfire UI\n")
            host.click("#np-go")
            wait_text(friend, "#prop-list", "Campfire save points")
            wait_text(friend, "#prop-list", "1 yes")
            assert "You're the host" not in (friend.inner_text(".toast") if friend.locator(".toast").count() else ""), "friend must not be told they're host"
            assert friend.inner_text("#ws-name") == "Campfire Crew"
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
            wait_text(friend, "#prop-list", "Off-vision")
            wait_text(friend, "#chat-list", "may conflict with VISION.md")

            # ---- docs ----
            wait_text(host, "#brain-label", "qwen3:8b")
            host.click('[data-nav="docs"]')
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
            assert "- [ ] Forest biome\n- [ ] Shared inventory" in host.input_value("#doc-body"), host.input_value("#doc-body")
            wait_text(host, "#doc-status", "Saved")
            friend.click('[data-nav="docs"]')
            wait_text(friend, "#doc-list", "Game design doc")
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
            # conflict: friend has unsaved text while host saves first
            tok = host.evaluate("TribeStore.get().server.token")
            slug = friend.evaluate("document.querySelector('.doc-item.on').dataset.slug")
            friend.click("#doc-body"); friend.keyboard.press("Control+End"); friend.keyboard.type(" Maya was here.")
            st, d = api("/docs/" + slug, token=tok)
            st, d = api("/docs/" + slug, "PUT", {"title": d["doc"]["title"], "body": d["doc"]["body"] + "\nHost edit.", "baseVersion": d["doc"]["version"]}, token=tok)
            assert st == 200, d
            friend.wait_for_selector("#doc-banner:not(.hidden)", timeout=8000)
            friend.click("#cf-mine")
            wait_text(friend, "#doc-status", "Saved")
            assert "Maya was here." in Path(tmp, "docs", slug + ".md").read_text()
            # import a file
            friend.evaluate("TribeDocs.importFiles([new File(['# Notes from the jam\\n\\nIdeas: fishing, music.'], 'jam-notes.md', {type: 'text/markdown'})])")
            wait_text(friend, "#doc-list", "jam-notes")
            assert Path(tmp, "docs", "jam-notes.md").exists()

            # ---- standup ----
            host.click('[data-nav="home"]'); host.click("#standup-go")
            wait_text(host, "#standup-text", "Maya: asked for controller support")
            assert list(Path(tmp, "brain").glob("standup-*.md"))

            # update hand-off picks real online peers
            host.goto(BASE + "/?simulateUpdate=9.9.9")
            host.wait_for_function("document.querySelector('#update-pill-label').innerText.startsWith('Restart')", timeout=8000)
            host.click("#update-pill")
            assert "1 friend online" in host.inner_text("#update-pop")
            b.close()
    finally:
        srv.terminate(); mock.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("E2E tribe test passed")


if __name__ == "__main__":
    main()
