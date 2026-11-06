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
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew"],
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

            # update hand-off picks real online peers
            host.goto(BASE + "/?simulateUpdate=9.9.9")
            host.wait_for_function("document.querySelector('#update-pill-label').innerText.startsWith('Restart')", timeout=8000)
            host.click("#update-pill")
            assert "1 friend online" in host.inner_text("#update-pop")
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("E2E tribe test passed")


if __name__ == "__main__":
    main()
