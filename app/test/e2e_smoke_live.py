"""Live smoke test: a real server, the host on a desktop and a friend on a phone, managing projects end to end.

  Create (the Discord-style flow: template, name, bio) -> Invite friends sheet (link copied) -> overview (bio, vision,
  living update) -> rename + emoji in project settings -> pin from the rail -> tasks (new, move, delete) -> chat both
  ways -> the friend joins on a phone, Home rack on Home only, hides on scroll down -> the host deletes the project ->
  everyone leaves it for Home, it's gone from the list, its data is in .tribe/trash. Plus: the host signs back in
  on their own computer (host/reclaim), and other local sites can't.
Usage: python app/test/e2e_smoke_live.py [--shots]
"""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4883 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
SHOTS = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def wait_until(fn, timeout=15, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)

def shot(page, name):
    if SHOTS: page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"smoke-{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-smoke-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "..", f"smoke-server-{PORT}.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        wait_until(lambda: api("/health")[0] == 200, 15, "server up")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
            hctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host = hctx.new_page(); host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            n0 = len(api("/projects", token=tok)[1]["projects"])

            # ---- create: Discord-style ----
            host.click("#pj-plus"); host.wait_for_selector(".np-setup [data-ns='tpl:game']")
            host.click(".np-setup [data-ns='tpl:game']"); host.wait_for_selector("#np-input")
            host.fill("#np-input", "Lantern Run"); host.fill("#np-bio", "A tiny platformer about lanterns")
            host.click("#np-create"); host.wait_for_selector(".modal-card.ii #ii-link", timeout=25000)
            link = re.sub(r"https?://[^/]+", BASE, host.inner_text("#ii-link").strip())
            assert host.evaluate("navigator.clipboard.readText()").endswith(link.split("/join/")[1]), "invite copied"
            shot(host, "invite"); host.click(".modal-card.ii [data-close]")
            pid = host.evaluate("TribeProjects.current()")
            pr = [x for x in api("/projects", token=tok)[1]["projects"] if x["id"] == pid][0]
            assert len(api("/projects", token=tok)[1]["projects"]) == n0 + 1 and pr["emoji"] == "🎮" and pr["bio"] == "A tiny platformer about lanterns", pr
            assert any("starting idea" in json.dumps(n).lower() for n in api("/flow", token=tok, headers={"X-Project": pid})[1]["flow"]["notes"]), "the template's starting idea is in the notes"

            # ---- overview: bio, vision, living update ----
            host.click("#nest-overview"); host.wait_for_selector("#pj-living .pl-sum", timeout=15000)
            wait_text(host, "#pj-bio", "lanterns")
            host.click("#pj-vwrite"); host.fill("#pj-vtext", "Run through the night lighting lanterns.\nFor friends.\nDone: 3 levels."); host.click("#pj-vsave")
            host.wait_for_selector("#pj-vnudge", state="detached", timeout=10000)
            shot(host, "overview")

            # ---- project settings: rename + emoji ----
            host.click(f"#pj-rail [data-pj-open='{pid}']", button="right"); host.click("#rail-menu [data-rc='settings']")
            host.wait_for_selector("#ps-name"); host.fill("#ps-name", "Lantern Dash"); host.fill("#ps-emoji", "🏮"); host.click("#ps-save")
            wait_until(lambda: [x for x in api("/projects", token=tok)[1]["projects"] if x["id"] == pid][0]["name"] == "Lantern Dash", 10, "renamed")
            host.wait_for_function("pid => (document.querySelector(`#pj-rail [data-pj-open='${pid}']`) || {}).title === 'Lantern Dash'", arg=pid, timeout=10000)

            # ---- pin from the rail: pinned bubbles come first ----
            host.click(f"#pj-rail [data-pj-open='{pid}']", button="right"); host.click("#rail-menu [data-rc='pin']")
            host.wait_for_function("pid => document.querySelector('#pj-rail [data-pj-open]').dataset.pjOpen === pid", arg=pid, timeout=10000)

            # ---- tasks: new, move, delete ----
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tasks:not(.hidden) #task-new")
            ok_t = api("/tasks", "POST", {"title": "Lantern glow shader"}, token=tok, headers={"X-Project": pid})
            assert ok_t[0] == 200, ok_t
            tid = ok_t[1]["task"]["id"]
            host.wait_for_selector(f".task[data-id='{tid}']", timeout=10000)
            assert api(f"/tasks/{tid}", "PATCH", {"status": "doing"}, token=tok, headers={"X-Project": pid})[0] == 200   # desktop moves by dragging
            host.wait_for_selector(f".col[data-col='doing'] .task[data-id='{tid}']", timeout=10000)
            host.hover(f".task[data-id='{tid}']"); host.click(f".task[data-id='{tid}'] [data-del]")
            if host.locator(".confirm, #confirm-yes").count(): host.click("#confirm-yes")
            wait_until(lambda: not any(t["id"] == tid for t in api("/tasks", token=tok, headers={"X-Project": pid})[1]["tasks"]), 10, "task deleted")

            # ---- a friend on a phone joins this project ----
            pctx = b.new_context(**PHONE); ph = pctx.new_page(); ph.on("pageerror", lambda e: errors.append(f"phone: {e}"))
            ph.goto(link); ph.wait_for_selector("#name", timeout=15000); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url(re.compile(r"/m/"), timeout=20000); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            try: ph.wait_for_selector("#ins-later", state="visible", timeout=5000); ph.click("#ins-later")
            except Exception: pass
            ph.wait_for_function("pid => TribeProjects.current() === pid", arg=pid, timeout=15000)

            # chat both ways
            host.click("#nest-chat"); host.fill("#chat-input", "Welcome to Lantern Dash!"); host.press("#chat-input", "Enter")
            ph.click('#tabbar [data-nav="chat"]'); wait_text(ph, "#chat-list", "Welcome to Lantern Dash", 15000)
            ph.fill("#chat-input", "Thanks! I'll draw lanterns"); ph.press("#chat-input", "Enter")
            wait_text(host, "#chat-list", "draw lanterns", 15000)

            # phone Home: its own rack (Home · Projects · Notes · Activity · +), hidden in a project, slides away on scroll down
            assert ph.locator("#m2-homebar").count() == 0 or ph.locator("#m2-homebar").is_hidden(), "no Home rack inside a project"
            ph.evaluate("TribeHub.open('home')"); ph.wait_for_selector("#m2-homebar:not(.hidden) [data-hb='top']", timeout=10000)
            assert ph.locator("#tabbar").is_hidden(), "the project rack hides on Home"
            ph.wait_for_selector("#hub-pjs [data-pj-go]")
            ph.evaluate("(() => { const m = document.querySelector('#main'); const s = m && m.scrollHeight > m.clientHeight + 4 ? m : document.scrollingElement; s.scrollTo(0, 400); })()")
            ph.wait_for_timeout(400)
            ph.wait_for_function("document.querySelector('#m2-homebar').classList.contains('away')", timeout=5000)
            ph.evaluate("(() => { const m = document.querySelector('#main'); const s = m && m.scrollHeight > m.clientHeight + 4 ? m : document.scrollingElement; s.scrollTo(0, 0); })()")
            ph.wait_for_function("!document.querySelector('#m2-homebar').classList.contains('away')", timeout=5000)
            shot(ph, "phone-home")
            ph.click(f"#hub-pjs [data-pj-go='{pid}']"); ph.wait_for_function("pid => TribeProjects.current() === pid && !document.body.classList.contains('global')", arg=pid, timeout=10000)
            ph.wait_for_selector("#tabbar", state="visible")

            # ---- shared compute: a quiet helper once the project has a repo and two people ----
            host.click("#nest-overview"); host.wait_for_selector("#room-helpers [data-helper='compute']", timeout=20000)
            host.click("#room-helpers [data-helper='compute']"); host.wait_for_selector("#cmp-toggle")
            host.click("#cmp-toggle"); wait_text(host, ".cmp-list", "Orion")
            assert api("/compute", token=tok)[1]["mine"]["on"] is True
            host.click("#invite-body [data-close]")
            wait_text(host, "#room-helpers [data-helper='compute']", "lending")

            # ---- delete the project (host only, type the name) ----
            assert api(f"/projects/{pid}", "DELETE", {"confirm": "Lantern Dash"}, token=ph.evaluate("TribeStore.get().server.token"))[0] == 403, "friends can't delete"
            host.click(f"#pj-rail [data-pj-open='{pid}']", button="right"); host.click("#rail-menu [data-rc='settings']")
            host.click("#ps-delete"); host.wait_for_selector("#ps-del-go:disabled")
            host.fill("#ps-confirm", "Lantern Dash"); host.click("#ps-del-go")
            wait_until(lambda: not any(x["id"] == pid for x in api("/projects", token=tok)[1]["projects"]), 10, "project gone")
            host.wait_for_selector("#view-hub:not(.hidden)", timeout=10000)
            host.wait_for_selector(f"#pj-rail [data-pj-open='{pid}']", state='detached', timeout=10000)
            ph.wait_for_function("pid => TribeProjects.current() !== pid", arg=pid, timeout=15000)
            trash = Path(tmp, ".tribe", "trash")
            assert trash.exists() and any(d.name.startswith(pid + "-") for d in trash.iterdir()), "its data is in .tribe/trash"
            assert api(f"/projects/{api('/projects', token=tok)[1]['projects'][0]['id']}", "DELETE", {"confirm": "x"}, token=tok)[0] == 400, "the first project stays"

            # ---- the host signs back in on their own computer; other local sites can't ----
            assert api("/host/reclaim", "POST", {}, headers={"Origin": "http://localhost:3000"})[0] == 403
            r = api("/host/reclaim", "POST", {}, headers={"Origin": "http://tauri.localhost"})
            assert r[0] == 200 and r[1]["member"]["role"] == "host" and r[1]["token"], r
            assert api("/me", token=tok)[0] == 401, "the lost key stops working"
            assert api("/me", token=r[1]["token"])[0] == 200
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, "page errors:\n" + "\n".join(bad)
        print("e2e_smoke_live: OK (create from a template, invite, overview, rename, pin, tasks, chat, phone join + Home rack, delete, host sign-back-in)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
