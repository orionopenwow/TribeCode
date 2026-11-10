"""The calm Task Board (v0.27.2): one "Add a task" line, slim columns side by side, calm cards (no buttons or menus on
a card until you hover), a side drawer for who does it / status / due / labels / checklist / notes, drag between
columns, quick "move on" on hover, keyboard (Enter opens, Esc closes), and on phones one column at a time with a
segmented control and the drawer as a bottom sheet.
Usage: python app/test/e2e_tasks_calm.py   (honours TRIBE_PORT_OFFSET)"""
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


def open_as(browser, name, token, vp, mobile=False):
    page = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
    time.sleep(1.0)
    page.evaluate("TribeApp.show('tasks')"); page.wait_for_selector("#board.tkb .tk-cols .col", timeout=10000)
    return page


def task(tok, title):
    return next(t for t in api("/api/tasks", token=tok)[1]["tasks"] if t["title"] == title)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-calm-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(lambda: api("/api/health")[0] == 200, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        for t, st in [("Orders page", "doing"), ("Delivery routes", "review"), ("Batch counter", "done")]:
            api("/api/tasks", "POST", {"title": t, "status": st}, host)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = open_as(b, "Camp", host, {"width": 1440, "height": 900})

            # 1. one Add line: Enter makes a backlog task
            pg.fill("#tk-add", "Label the ginger batch"); pg.press("#tk-add", "Enter")
            pg.wait_for_selector('#board [data-col="backlog"] .task:has-text("Label the ginger batch")', timeout=8000)
            t1 = task(host, "Label the ginger batch"); assert t1["status"] == "backlog", t1

            # 2. four columns side by side, and calm cards: no menus, buttons only in the hover row
            tops = pg.evaluate("[...document.querySelectorAll('#board .col')].map(c => Math.round(c.getBoundingClientRect().top))")
            assert len(tops) == 4 and len(set(tops)) == 1, f"four columns across at 1440: {tops}"
            assert pg.locator("#board .task select").count() == 0, "no menus on a card"
            assert pg.locator("#board .task button:not(.tk-qa button):not(.due-chip)").count() == 0, "no buttons on a card outside the hover row"
            pg.mouse.move(5, 5); assert not pg.locator(f'#board .task[data-id="{t1["id"]}"] .tk-qa').is_visible(), "quick actions wait for hover"
            card = pg.locator(f'#board .task[data-id="{t1["id"]}"]')
            card.hover(); assert card.locator(".tk-qa").is_visible(), "quick actions on hover"

            # 3. the drawer: who does it, status, labels, checklist, notes
            card.click(); pg.wait_for_selector("#tk-drawer:not([hidden]) #tkd-title", timeout=5000)
            assert pg.input_value("#tkd-title") == "Label the ginger batch"
            pg.click('#tk-drawer .tkd-who:has-text("Maya")')
            maya_id = next(m["id"] for m in api("/api/members", token=host)[1]["members"] if m["name"] == "Maya")
            wait(lambda: task(host, "Label the ginger batch").get("assignee") == maya_id, what="assigned to Maya")
            card.locator('.tk-av[title="Maya"]').wait_for(timeout=5000)
            pg.fill("#tkd-label", "design"); pg.press("#tkd-label", "Enter")
            wait(lambda: task(host, "Label the ginger batch").get("labels") == ["design"], what="label saved")
            pg.fill("#tkd-sub", "Pick a font"); pg.press("#tkd-sub", "Enter")
            wait(lambda: (task(host, "Label the ginger batch").get("subtasks") or [{}])[0].get("t") == "Pick a font", what="checklist step saved")
            pg.check("#tk-drawer [data-sub='0']")
            wait(lambda: task(host, "Label the ginger batch")["subtasks"][0]["done"] is True, what="checklist step done")
            pg.fill("#tkd-notes", "Kraft paper, two colours."); pg.locator("#tkd-notes").blur()
            wait(lambda: task(host, "Label the ginger batch").get("body") == "Kraft paper, two colours.", what="notes saved")
            pg.click('#tk-drawer [data-status="review"]')
            wait(lambda: task(host, "Label the ginger batch")["status"] == "review", what="status from the drawer")
            card = pg.locator(f'#board .task[data-id="{t1["id"]}"]')
            assert "1/1" in card.inner_text(), "the card shows the checklist count"
            pg.keyboard.press("Escape"); pg.wait_for_selector("#tk-drawer", state="hidden")

            # 4. keyboard: Enter opens, Esc closes
            card.focus(); pg.keyboard.press("Enter"); pg.wait_for_selector("#tk-drawer:not([hidden])", timeout=3000)
            pg.keyboard.press("Escape"); pg.wait_for_selector("#tk-drawer", state="hidden")

            # 5. drag between columns, and "move on" from the hover row
            op = task(host, "Orders page")
            pg.drag_and_drop(f'#board .task[data-id="{op["id"]}"]', '#board [data-col="done"]')
            wait(lambda: task(host, "Orders page")["status"] == "done", what="dragged to Done")
            dr = task(host, "Delivery routes")
            c2 = pg.locator(f'#board .task[data-id="{dr["id"]}"]'); c2.hover(); c2.locator('[data-qa="next"]').click()
            wait(lambda: task(host, "Delivery routes")["status"] == "done", what="moved on")
            assert pg.locator("#tk-drawer").is_hidden(), "move on doesn't open the drawer"

            # 6. a friend sees the change live
            mp = open_as(b, "Maya", maya, {"width": 1280, "height": 800})
            mp.wait_for_selector(f'#board [data-col="review"] .task[data-id="{t1["id"]}"] .tk-av[title="Maya"]', timeout=8000)

            # 7. phones: one column at a time, segmented control, bottom sheet
            ph = open_as(b, "Camp", host, {"width": 390, "height": 844}, mobile=True)
            assert ph.locator("#tk-seg").is_visible()
            vis = ph.evaluate("[...document.querySelectorAll('#board .col')].filter(c => c.offsetParent).map(c => c.dataset.col)")
            assert vis == ["backlog"], vis
            ph.click('#tk-seg [data-seg="review"]')
            ph.wait_for_selector(f'#board [data-col="review"] .task[data-id="{t1["id"]}"]', state="visible", timeout=5000)
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            ph.click(f'#board .task[data-id="{t1["id"]}"]'); ph.wait_for_selector("#tk-drawer:not([hidden])", timeout=5000)
            box = ph.locator("#tk-drawer").bounding_box(); assert box["y"] + box["height"] >= 840 and box["width"] >= 385, ("bottom sheet", box)
            b.close()
    finally:
        srv.terminate()
    assert not errors, errors
    print("ok e2e_tasks_calm")


if __name__ == "__main__":
    main()
