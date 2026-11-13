"""Company empty state as an infographic (feat/tasks-company, app/ui/company.js drawEmpty).
Before a project is a company, the Company page shows six illustrated tiles (Seats, Charters, Money, Rituals, Work
loop, Approvals), one "Make it a company" button and "See an example" (a read-only sample company in the real view:
org chart, standup, goals, decisions; nothing in it changes anything). It fits a 390px phone with no sideways scroll.
"Make it a company" makes it in one click. A builder sees the example but no Make button.
Usage: python app/test/e2e_company_widget.py   (screenshot: docs/screenshots/company-widget.png)
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6313 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def page(b, token, name, pid, errors, w, h):
    pg = b.new_page(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (name, BASE, token))
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany", timeout=20000)
    pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(700)
    pg.evaluate("TribeCompany.open()")
    pg.wait_for_selector("#view-company .co-ig-grid", timeout=10000)
    return pg

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cow-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Lantern Run", "bio": "A cozy platformer game"}, token=host)); pid = (p.get("project") or p)["id"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = page(b, host, "Camp", pid, errors, 1360, 1000)
            tiles = pg.evaluate("[...document.querySelectorAll('#view-company .co-ig-tile')].map(t => t.dataset.ig)")
            assert tiles == ["seats", "money", "standup", "approve"], tiles   # v2: four big tiles, fewer words
            for t in tiles:   # each tile: a picture, a title and one line
                tile = pg.locator(f"#view-company .co-ig-tile[data-ig='{t}']")
                assert tile.locator(".co-ig-art").is_visible() and tile.locator("h3").inner_text().strip() and tile.locator(":scope > p").inner_text().strip()
            assert pg.locator("#view-company #co-make").inner_text().strip() == "Make it a company"
            assert pg.locator("#view-company .co-tpl").count() == 8, "templates stay below for leads"
            pg.screenshot(path=str(SHOTS / "company-widget.png"), full_page=False)
            # See an example: the real view, read-only
            pg.click("#co-example"); pg.wait_for_selector("#view-company .co-sample .co-seat.ceo", timeout=5000)
            assert "Lantern Games" in pg.inner_text("#view-company h1") and pg.locator("#view-company .co-sample .co-seat").count() == 5
            assert pg.locator("#view-company .co-sample .co-goal").count() == 2 and "save-slot" in pg.inner_text("#view-company .co-today")
            pg.locator("#view-company .co-sample .co-seat.ceo").click(force=True); pg.wait_for_timeout(400)
            assert pg.locator(".co-sheet:visible, #co-sheet:visible").count() == 0, "no seat sheet in the example"
            assert ok(api(f"/projects/{pid}/company", token=host, project=pid))["company"] is None, "the example changed nothing"
            pg.click("#co-sample-back"); pg.wait_for_selector("#view-company .co-ig-grid", timeout=5000)
            # Make it a company: one click, the lean four seats
            pg.click("#co-make"); pg.wait_for_selector("#view-company .co-seat.ceo", timeout=10000)
            c = ok(api(f"/projects/{pid}/company", token=host, project=pid))["company"]
            assert c and c["on"] and [x["title"] for x in c["seats"]] == ["CEO", "Build", "Grow", "Run"], c
            pg.close()

            # a builder: the example, no Make button; a 390px phone, no sideways scroll
            p2 = ok(api("/projects", "POST", {"name": "Moth Notes"}, token=host)); pid2 = (p2.get("project") or p2)["id"]
            ph = page(b, host, "Camp", pid2, errors, 390, 844)
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391, ph.evaluate("document.documentElement.scrollWidth")
            assert ph.evaluate("Math.max(...[...document.querySelectorAll('#view-company .co-ig-tile')].map(t => t.getBoundingClientRect().right))") <= 390
            assert ph.locator("#co-make").is_visible() and ph.locator("#co-example").is_visible()
            ph.screenshot(path="/tmp/company-widget-phone.png", full_page=False)
            ph.click("#co-example"); ph.wait_for_selector("#view-company .co-sample", timeout=5000)
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391, "example fits a phone"
            ph.close()
            # a builder sees the example but can't make it a company
            dpid = next(x["id"] for x in ok(api("/projects", token=maya))["projects"])
            pm = page(b, maya, "Maya", dpid, errors, 1200, 900)
            assert pm.locator("#co-make").count() == 0 and pm.locator("#co-example").is_visible() and "Ask your host" in pm.inner_text("#view-company")
            pm.close()
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("ok e2e_company_widget")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
