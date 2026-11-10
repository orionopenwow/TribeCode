"""Badges count up and down (v0.26): the Task Board badge counts task updates from others since you last opened the
board, and clears when you open it; the Inbox bell counts unread notifications, clears when you read them, and counts
back up on the next one. Desktop and phone (the rack's Tasks and Updates badges).
Usage: python app/test/e2e_counts.py   (honours TRIBE_PORT_OFFSET)"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4870 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()


def wait(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError("timed out waiting for " + what)


def open_as(browser, name, token, vp):
    page = browser.new_context(viewport=vp).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
    time.sleep(1.2)
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cnt-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(lambda: api("/api/health")[0] == 200, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hp = open_as(b, "Orion", host, {"width": 1440, "height": 900})
            badge = lambda: hp.evaluate("(document.getElementById('nn-tasks')||{}).textContent || ''")
            assert badge() == "", f"calm at start, got {badge()!r}"

            # 1. Maya adds two tasks and moves one: the host's Task Board badge counts up
            t1 = api("/api/tasks", "POST", {"title": "Draw the title screen"}, maya)[1]["task"]
            api("/api/tasks", "POST", {"title": "Footstep sounds"}, maya)
            wait(lambda: badge() == "2", what="badge 2")
            api(f"/api/tasks/{t1['id']}", "PATCH", {"status": "doing"}, maya)
            wait(lambda: badge() == "2", what="same two tasks, still 2")
            # the host's own change never counts
            mine = api("/api/tasks", "POST", {"title": "My own task"}, host)[1]["task"]
            time.sleep(0.6); assert badge() == "2", badge()

            # 2. open the board: it clears; a new change counts it back up; it clears again on the next visit
            hp.evaluate("TribeApp.show('tasks')")
            wait(lambda: badge() == "", what="badge cleared on open")
            hp.evaluate("TribeApp.show('home')"); time.sleep(0.3)
            api(f"/api/tasks/{mine['id']}", "PATCH", {"status": "review"}, maya)
            wait(lambda: badge() == "1", what="back up to 1")
            hp.evaluate("TribeApp.show('tasks')"); wait(lambda: badge() == "", what="cleared again")
            # while on the board, new changes are seen right away
            api("/api/tasks", "POST", {"title": "Seen live"}, maya); time.sleep(0.8)
            assert badge() == "", badge()
            hp.evaluate("TribeApp.show('home')")

            # 3. Inbox: a mention counts up, reading clears, the next one counts up again
            bell = lambda: hp.evaluate("TribeNotify.state().unread")
            base = bell()
            api("/api/chat/general", "POST", {"text": "@Orion can you look at level 2?"}, maya)
            wait(lambda: bell() == base + 1, what="bell +1")
            assert hp.locator("#nf-count").inner_text().strip() == str(base + 1)
            hp.click("#nf-bell"); hp.wait_for_selector("#nf-panel:not(.hidden)")
            hp.click("#nf-close")
            wait(lambda: bell() == 0, what="bell cleared after reading")
            assert hp.locator("#nf-count").is_hidden()
            api("/api/chat/general", "POST", {"text": "@Orion and the music too"}, maya)
            wait(lambda: bell() == 1, what="bell back to 1")
            # clicking a single item reads just that one
            hp.click("#nf-bell"); hp.wait_for_selector("#nf-panel .nf-item.unread, #nf-panel .nf-group-head.unread")
            assert "1 new" in hp.locator("#nf-panel").inner_text() or hp.locator("#nf-panel .nf-item.unread").count() == 1
            if hp.locator("#nf-panel .nf-group-head.unread").count(): hp.locator("#nf-panel .nf-group-head.unread").first.click()
            hp.locator("#nf-panel .nf-item.unread").first.click()
            wait(lambda: bell() == 0, what="item read on click")

            # 4. Phone: the rack's Tasks badge counts up and clears; Updates clears on open
            pp = open_as(b, "Orion", host, {"width": 390, "height": 844})
            rb = lambda k: pp.evaluate(f"(document.querySelector('[data-bd=\"{k}\"]')||{{}}).textContent || ''")
            api("/api/tasks", "POST", {"title": "Phone sees this"}, maya)
            wait(lambda: rb("nn-tasks") == "1", what="phone tasks badge 1")
            pp.evaluate("TribeApp.show('tasks')"); wait(lambda: rb("nn-tasks") == "", what="phone tasks badge cleared")
            api("/api/chat/general", "POST", {"text": "@Orion phone ping"}, maya)
            wait(lambda: rb("updates") not in ("", "0"), what="phone updates badge up")
            pp.evaluate("TribeMobile && TribeMobile.show ? TribeMobile.show('updates') : 0")
            wait(lambda: rb("updates") == "", timeout=6, what="phone updates badge cleared after opening")
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_counts: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
