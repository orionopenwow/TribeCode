"""Screenshots of the Tasks page for a design pass: empty, List, Board and a 390px phone, seeded with a mixed board
(an offer waiting on you, one waiting on someone else, an overdue one, open-to-claim ones, in progress, review, done).
Usage: python3 scripts/dev/tasks-shots.py [out_dir] [prefix]        (default docs/screenshots, "tasks-v2-")
       TRIBE_THEMES=1 also saves the List in every theme (<prefix>theme-<id>.png); honours TRIBE_PORT_OFFSET."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import date, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4893 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "screenshots"
PRE = sys.argv[2] if len(sys.argv) > 2 else "tasks-v2-"
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()


def open_as(browser, name, token, vp, mobile=False, theme=None):
    page = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2).new_page()
    page.on("pageerror", lambda e: print("pageerror", e))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    if theme: settings["theme"] = theme
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))}); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}}));")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
    time.sleep(1.0)
    page.evaluate("TribeApp.show('tasks')"); page.wait_for_selector("#board.tkb .tk-cols > *", timeout=10000); time.sleep(0.7)
    page.mouse.move(2, 2)
    return page


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="tribe-tshots-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        join = lambda n: api("/join", "POST", {"code": api("/invites", "POST", {}, host)[1]["invite"]["code"], "name": n})[1]
        maya = join("Maya"); jo = join("Jo"); mt, mid, jt, jid = maya["token"], maya["member"]["id"], jo["token"], jo["member"]["id"]
        camp = next(m["id"] for m in api("/members", token=host)[1]["members"] if m["name"] == "Camp")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = open_as(b, "Maya", mt, {"width": 1280, "height": 900}); pg.screenshot(path=str(OUT / f"{PRE}empty.png")); pg.close()
            ph = open_as(b, "Maya", mt, {"width": 390, "height": 844}, mobile=True); ph.screenshot(path=str(OUT / f"{PRE}phone-empty.png")); ph.close()

            day = lambda n: (date.today() + timedelta(days=n)).isoformat()
            def add(title, st="backlog", ty=None, who=None, due=None, accept=None, **more):
                t = api("/tasks", "POST", {"title": title, "status": st, "type": ty, "due": due}, host)[1]["task"]
                if who: api(f"/tasks/{t['id']}", "PATCH", {"assignee": who}, host)
                if accept: api(f"/tasks/{t['id']}/accept", "POST", {}, accept); api(f"/tasks/{t['id']}", "PATCH", {"status": st}, host)
                if more: api(f"/tasks/{t['id']}", "PATCH", more, host)
                return t
            add("Fix the totals rounding on the receipt", ty="fix", who=mid, due=day(1))                       # assigned to Maya, waiting for her answer
            add("Title screen with the bottle logo", ty="design", who=jid)                                       # waiting for Jo
            add("Price sheet for cafés", ty="write", due=day(-2))                                                # overdue, nobody on it
            add("Flavor photos for the menu", ty="design", labels=["photos"])                                    # open to claim
            add("Research compostable bottle labels", ty="research", who=jid, accept=jt, due=day(4))             # up next
            add("Orders page with a daily total and a print button", "doing", "build", camp, due=day(2),
                subtasks=[{"t": "Table", "done": True}, {"t": "Total", "done": True}, {"t": "Print", "done": False}], body="Daily total at the top.")
            add("Delivery routes map", "review", "build", mid, accept=mt)
            add("Batch counter", "done", "build", camp)
            add("Write the how-to text", "done", "write", mid, accept=mt)
            api("/tasks/settings", "PUT", {"mode": "council"}, host)

            pg = open_as(b, "Maya", mt, {"width": 1280, "height": 900})
            pg.screenshot(path=str(OUT / f"{PRE}list.png"), full_page=False)
            pg.evaluate("TribeTasks.filter('overdue')"); time.sleep(0.4); pg.screenshot(path=str(OUT / f"{PRE}filter.png")); pg.evaluate("TribeTasks.filter('')")
            pg.evaluate("TribeTasks.view('board')"); time.sleep(0.6); pg.screenshot(path=str(OUT / f"{PRE}board.png"))
            pg.evaluate("TribeTasks.view('list')"); pg.close()
            wd = open_as(b, "Maya", mt, {"width": 1720, "height": 1000}); wd.evaluate("document.querySelector('#panel-close') && document.querySelector('#panel-close').click()"); time.sleep(0.5); wd.screenshot(path=str(OUT / f"{PRE}wide.png")); wd.close()
            ph = open_as(b, "Maya", mt, {"width": 390, "height": 844}, mobile=True)
            ph.screenshot(path=str(OUT / f"{PRE}phone.png")); ph.evaluate("document.querySelector('#board [data-sec=doing]').scrollIntoView()"); time.sleep(0.3); ph.screenshot(path=str(OUT / f"{PRE}phone-2.png")); ph.close()
            if os.environ.get("TRIBE_THEMES"):
                for th in ["light", "midnight", "nordic", "nightshade", "campfire", "solar-dark", "solar-light", "contrast"]:
                    pg = open_as(b, "Maya", mt, {"width": 1280, "height": 900}, theme=th); pg.screenshot(path=str(OUT / f"{PRE}theme-{th}.png")); pg.close()
            b.close()
    finally:
        srv.terminate()
    print("ok tasks-shots ->", OUT)


if __name__ == "__main__":
    main()
