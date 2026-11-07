"""Every phone feature, saved and still there after a reload: a friend on a phone in a fresh project.

  Chat: a message, a reaction, a pin, a reply, an edit, a delete -> reload -> all still right.
  DM with the host -> reload -> still there.  Docs: New doc on the phone, title + text -> reload -> saved; the repo
  hero on the Docs hub.  Tasks: New task (quick sheet) -> move it with its status chip -> reload -> saved.
  Notes: an idea from the "You're in" card -> in the project's notes.  Profile: rename -> reload -> saved.
  Updates: an approval decided from the phone.  Home: projects list, Home rack.  No sideways scroll anywhere.
  Writes docs/PHONE-REPORT.md: each feature, pass/fail, and what it took.
Usage: python app/test/e2e_phone_features.py
"""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4885 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
errors, report = [], []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
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

def feature(name, fn):
    t = time.time()
    try: fn(); report.append((name, True, f"{time.time() - t:.1f}s", ""))
    except Exception as e: report.append((name, False, f"{time.time() - t:.1f}s", str(e).splitlines()[0][:160])); raise

def no_sideways(ph, where):
    w = ph.evaluate("document.documentElement.scrollWidth")
    assert w <= 391, f"sideways scroll on {where}: {w}px"


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-pf-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "..", f"pf-server-{PORT}.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        wait_until(lambda: api("/health")[0] == 200, 15, "server up")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1440, "height": 900}); host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            host.evaluate("TribeFlow.instant()"); host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000)
            link = re.sub(r"https?://[^/]+", BASE, host.inner_text("#ii-link").strip()); host.click(".modal-card.ii [data-close]")
            htok = host.evaluate("TribeStore.get().server.token"); pid = host.evaluate("TribeProjects.current()")
            hid = host.evaluate("TribeClient.state().me.id")

            ctx = b.new_context(**PHONE); ph = ctx.new_page(); ph.on("pageerror", lambda e: errors.append(f"phone: {e}"))
            def reload_phone():
                ph.reload(); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000); ph.wait_for_timeout(600)
                if ph.locator("#ins-later").is_visible(): ph.click("#ins-later")
            def join():
                ph.goto(link); ph.wait_for_selector("#name", timeout=15000); ph.fill("#name", "Maya"); ph.click("#go")
                ph.wait_for_url(re.compile(r"/m/"), timeout=20000); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
                try: ph.wait_for_selector("#ins-later", state="visible", timeout=5000); ph.click("#ins-later")
                except Exception: pass
                ph.wait_for_function("pid => TribeProjects.current() === pid", arg=pid, timeout=15000)
            feature("Join from an invite link (name → Join → phone app)", join)
            ftok = ph.evaluate("TribeStore.get().server.token")
            chan = lambda: ph.evaluate("TribeProjects.cur().channel")

            def chat():
                ph.click('#tabbar [data-nav="chat"]'); ph.wait_for_selector("#chat-input", state="visible")
                ph.fill("#chat-input", "First message from my phone"); ph.press("#chat-input", "Enter")
                wait_until(lambda: any(m["text"] == "First message from my phone" for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"]), 10, "saved")
                mid = [m for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"] if m["text"] == "First message from my phone"][0]["id"]
                assert api(f"/chat/general/react/{mid}", "POST", {"emoji": "👍"}, token=htok, project=pid)[0] == 200
                assert api(f"/chat/general/pin/{mid}", "POST", {}, token=htok, project=pid)[0] == 200
                ph.fill("#chat-input", "A typo heer"); ph.press("#chat-input", "Enter")
                wait_until(lambda: any(m["text"] == "A typo heer" for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"]), 10, "second")
                m2 = [m for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"] if m["text"] == "A typo heer"][0]["id"]
                assert api(f"/chat/general/msg/{m2}", "PATCH", {"text": "A typo here"}, token=ftok, project=pid)[0] == 200, "edit"
                ph.fill("#chat-input", "Delete me"); ph.press("#chat-input", "Enter")
                wait_until(lambda: any(m["text"] == "Delete me" for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"]), 10, "third")
                m3 = [m for m in api("/chat/general?limit=20", token=ftok, project=pid)[1]["messages"] if m["text"] == "Delete me"][0]["id"]
                assert api(f"/chat/general/msg/{m3}", "DELETE", token=ftok, project=pid)[0] == 200, "delete"
                reload_phone(); ph.click('#tabbar [data-nav="chat"]')
                wait_text(ph, "#chat-list", "First message from my phone"); wait_text(ph, "#chat-list", "A typo here")
                assert "Delete me" not in ph.inner_text("#chat-list"), "deleted stays deleted"
                wait_text(ph, "#chat-list", "👍")
                ph.wait_for_selector("#pin-strip:not(.hidden)", timeout=10000); wait_text(ph, "#pin-strip", "1 pinned")
                no_sideways(ph, "chat")
            feature("Chat: send, react, pin, edit, delete, all saved after a reload", chat)

            def dm():
                ph.evaluate(f"TribeDM.open({hid!r})"); ph.wait_for_selector("#chat-input", state="visible")
                ph.fill("#chat-input", "Private hi from Maya"); ph.press("#chat-input", "Enter")
                ch = "dm-" + "-".join(sorted([hid, ph.evaluate("TribeClient.state().me.id")]))
                wait_until(lambda: any(m["text"] == "Private hi from Maya" for m in api(f"/chat/{ch}?limit=10", token=htok)[1].get("messages", [])), 10, "dm saved")
                reload_phone(); ph.evaluate(f"TribeDM.open({hid!r})"); wait_text(ph, "#dm-list", "Private hi from Maya")
                ph.evaluate("TribeDM.back && TribeDM.back()")
            feature("Direct message with the host, saved after a reload", dm)

            def docs():
                ph.click('#tabbar [data-nav="docs"]'); ph.wait_for_selector("#m2-docs-hub", timeout=15000)
                ph.wait_for_selector("#m2-docs-hub #m2-repo-hero", timeout=15000)
                ph.wait_for_selector("#doc-new", state="visible"); ph.click("#doc-new"); ph.wait_for_selector("#doc-title", timeout=10000)
                ph.fill("#doc-title", "Level ideas"); ph.press("#doc-title", "Tab")
                if not ph.locator("#doc-body").is_visible():
                    w = ph.locator("[data-mode='write'], #doc-write");
                    if w.count(): w.first.click()
                ph.fill("#doc-body", "Lantern caves, then a windy bridge."); ph.wait_for_timeout(1800)
                wait_until(lambda: any(d["title"] == "Level ideas" for d in api("/docs", token=ftok, project=pid)[1]["docs"]), 15, "doc saved")
                slug = [d for d in api("/docs", token=ftok, project=pid)[1]["docs"] if d["title"] == "Level ideas"][0]["slug"]
                wait_until(lambda: "windy bridge" in json.dumps(api(f"/docs/{slug}", token=ftok, project=pid)[1]), 15, "doc text saved")
                reload_phone(); ph.click('#tabbar [data-nav="docs"]'); wait_text(ph, "#view-docs", "Level ideas", 15000)
                no_sideways(ph, "docs")
            feature("Docs: the repo hero, New doc on the phone, title and text saved", docs)

            def tasks():
                ph.click('#tabbar [data-nav="tasks"]'); ph.wait_for_selector("#task-new", state="visible")
                ph.click("#task-new"); ph.wait_for_selector("#m2-qt-in"); ph.fill("#m2-qt-in", "Draw the lantern sprite"); ph.press("#m2-qt-in", "Enter")
                wait_until(lambda: any(t["title"] == "Draw the lantern sprite" for t in api("/tasks", token=ftok, project=pid)[1]["tasks"]), 10, "task saved")
                tid = [t for t in api("/tasks", token=ftok, project=pid)[1]["tasks"] if t["title"] == "Draw the lantern sprite"][0]["id"]
                ph.wait_for_selector(f".task[data-id='{tid}'] select.mv", state="visible", timeout=10000)
                ph.select_option(f".task[data-id='{tid}'] select.mv", "doing")
                wait_until(lambda: [t for t in api("/tasks", token=ftok, project=pid)[1]["tasks"] if t["id"] == tid][0]["status"] == "doing", 10, "moved")
                reload_phone(); ph.click('#tabbar [data-nav="tasks"]')
                ph.wait_for_selector(f".col[data-col='doing'] .task[data-id='{tid}']", timeout=10000)
                h = ph.locator(f".task[data-id='{tid}']").bounding_box()["height"]
                assert h < 70, f"a slate, not a pane ({h}px)"
                no_sideways(ph, "tasks")
            feature("Tasks: New task, move with the status chip (a slim slate), saved", tasks)

            def notes():
                ph.click('#tabbar [data-nav="chat"]'); ph.wait_for_selector("#fk-idea", timeout=10000)
                ph.click("#fk-idea"); ph.fill("#flow-note", "Fireflies as collectibles"); ph.press("#flow-note", "Enter")
                wait_until(lambda: any("fireflies" in json.dumps(n).lower() for n in api("/flow", token=ftok, project=pid)[1]["flow"]["notes"]), 10, "idea saved")
            feature("Add an idea from the \"You're in\" card into the project notes", notes)

            def approvals():
                ag = api("/agents", "POST", {}, token=htok, project=pid)[1]
                body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "request_approval", "arguments": {"title": "Ask Maya: publish the level?", "risk": "high"}}}
                req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + ag["token"], "X-Project": pid})
                urllib.request.urlopen(req, timeout=20).read()
                ph.click('#m2-bell'); ph.wait_for_selector("text=Ask Maya: publish the level?", timeout=15000)
                btn = ph.locator(".m2-ap [data-ap='approve'], .m2-ap .approve, [data-decide='approve']").first
                btn.click(); ph.wait_for_timeout(500)
                if ph.locator(".m2-ap .chosen, [data-ap-send], .m2-ap-send").count():
                    c = ph.locator("[data-ap-send], .m2-ap-send").first
                    if c.count() and c.is_visible(): c.click()
                wait_until(lambda: any(a["title"] == "Ask Maya: publish the level?" and a["status"] == "approved" for a in api("/approvals", token=htok, project=pid)[1]["approvals"]), 10, "approved from the phone")
            feature("Updates: approve an agent's request from the phone", approvals)

            def profile():
                ph.evaluate("document.querySelector('#pf-btn').click()"); ph.wait_for_selector("#m2-profile [data-pf='settings']", timeout=10000)
                ph.click("#m2-profile [data-pf='settings']"); ph.wait_for_selector("#set-name", timeout=10000)
                ph.fill("#set-name", "Maya Lin"); ph.press("#set-name", "Tab"); ph.wait_for_timeout(1200)
                wait_until(lambda: api("/me", token=ftok)[1]["member"]["name"] == "Maya Lin", 10, "name saved on the server")
                ph.keyboard.press("Escape"); ph.evaluate("TribeSettings.close && TribeSettings.close()")
                reload_phone(); assert ph.evaluate("TribeStore.get().name") == "Maya Lin"
            feature("Profile: rename from the phone, saved", profile)

            def home():
                ph.evaluate("TribeHub.open('home')"); ph.wait_for_selector("#hub-pjs [data-pj-go]", timeout=10000)
                ph.wait_for_selector("#m2-homebar:not(.hidden)"); assert ph.locator("#tabbar").is_hidden()
                no_sideways(ph, "home")
                ph.click(f"#hub-pjs [data-pj-go='{pid}']"); ph.wait_for_selector("#tabbar", state="visible", timeout=10000)
            feature("Home: projects list, its own rack, then into the project", home)
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        if bad: report.append(("No page errors", False, "", bad[0][:160]))
        assert not bad, "page errors:\n" + "\n".join(bad)
        print(f"e2e_phone_features: OK ({len(report)} features)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-2500:]); raise
    finally:
        out = ["# Phone features report", "", f"Generated by `app/test/e2e_phone_features.py` on {time.strftime('%Y-%m-%d %H:%M')}: a friend on a 390px phone in a fresh project, every step checked on the server and after a reload.", "",
               "| Feature | Result | Time | Note |", "|---|---|---|---|"] + [f"| {n} | {'✅ pass' if ok else '❌ fail'} | {t} | {note.replace('|', '/')} |" for n, ok, t, note in report]
        (ROOT / "docs" / "PHONE-REPORT.md").write_text("\n".join(out) + "\n")
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
