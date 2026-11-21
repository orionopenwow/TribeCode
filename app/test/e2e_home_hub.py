"""Home's previews and Messages (feat/p10-home: app/ui/homehub.js, server/hubinbox.js, the first-project fix).

A host with two projects (Garden, Arcade), two friends (Maya, Zoe). Messages in each project's #general, a DM from Maya
to the host, and a DM between Maya and Zoe that the host must never see. Then on the host's Home:
  - "Being made" shows a card per project; "Messages" lists both projects' lines and Maya's DM, newest first, with
    unread dots; the Maya<->Zoe DM is nowhere (not in the page, not in GET /api/hub/inbox for the host).
  - Clicking the Arcade row opens Arcade's chat; Reply from a row sends into that conversation.
  - "Start your first project" / "Make your first project" is not on Home once projects exist: not while connected,
    not before the project list has loaded, and not with the server stopped (offline: the last list, marked offline).
  - 390px: messages come before the previews, which scroll sideways; nothing scrolls the page sideways.
Usage: python app/test/e2e_home_hub.py [--shots DIR]"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5640 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'home-{name}.png'))

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-home-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    def start(): return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    def up():
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); return
            except Exception: time.sleep(0.25)
        raise AssertionError("server did not start")
    srv = start(); up()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host = ctx.new_page(); host.on("pageerror", lambda e: errors.append(str(e)))
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeHomeHub", timeout=20000)
            host.wait_for_function("TribeClient.state().me && TribeClient.state().me.id", timeout=15000)
            htok = host.evaluate("TribeStore.get().server.token"); hid = host.evaluate("TribeClient.state().me.id")
            ga = api("/projects", "POST", {"name": "Garden"}, htok)[1]["project"]["id"]
            ar = api("/projects", "POST", {"name": "Arcade"}, htok)[1]["project"]["id"]
            code = api("/invites", "POST", {"maxUses": 5}, htok)[1]["invite"]["code"]
            maya = api("/join", "POST", {"code": code, "name": "Maya"})[1]; zoe = api("/join", "POST", {"code": code, "name": "Zoe"})[1]
            mtok, mid, ztok, zid = maya["token"], maya["member"]["id"], zoe["token"], zoe["member"]["id"]
            for pid in (ga, ar):
                for mem in (mid, zid): api(f"/projects/{pid}/members", "POST", {"member": mem, "role": "builder"}, htok)
            def say(text, tok, pid=None, ch="general"):
                st, d = api(f"/chat/{ch}", "POST", {"text": text}, tok, pid); assert st == 200, (st, d, text); time.sleep(0.05)
            cfg = host.evaluate("window.TribeSiteCfg ? TribeSiteCfg.blank('Garden club') : null")
            if cfg: st, d = api(f"/projects/{ga}/site-config", "PUT", {"config": cfg}, htok, ga); assert st == 200, (st, d)   # Garden has a website to preview
            say("seeds are in the ground", mtok, ga)
            say("high score is 4200", ztok, ar)
            dm_host = "dm-" + "-".join(sorted([hid, mid])); dm_other = "dm-" + "-".join(sorted([mid, zid]))
            say("secret between Maya and Zoe", mtok, None, dm_other)
            say("hey Camp, look at the arcade", mtok, None, dm_host)

            # the server never hands the host someone else's DM
            st, inbox = api("/hub/inbox", token=htok); assert st == 200, inbox
            assert not any("secret between" in (r["last"]["text"]) for r in inbox["rows"]), "another person's DM leaked"
            texts = [r["last"]["text"] for r in inbox["rows"]]
            assert texts[0].startswith("hey Camp") and any("4200" in t for t in texts) and any("seeds" in t for t in texts), texts
            print("ok  GET /api/hub/inbox: both projects and the host's own DM, newest first; nobody else's DM")

            host.evaluate("TribeProjects.refresh()"); host.evaluate("TribeApp.show('hub')")
            host.wait_for_selector("#hh-msgs .hh-row", timeout=15000)
            host.wait_for_function("document.querySelectorAll('#hh-strip .hh-card').length >= 2", timeout=15000)
            page = host.inner_text("#view-hub")
            assert "secret between" not in page, "another person's DM on Home"
            shot(host, "1440-first")
            host.wait_for_function("document.querySelectorAll('#hh-msgs .hh-row.unread').length >= 2", timeout=8000)
            assert host.locator("#hub-host, .db-start").count() == 0 and "Make your first project" not in page and "Start your first project" not in page, "no first-project card once projects exist"
            host.wait_for_function("document.querySelectorAll('#hh-strip .hh-card').length >= 2 && !document.querySelector('#hh-strip .hh-pic-load')", timeout=15000)   # every card loaded (a preview, or a compact row when there is nothing yet)
            if cfg: assert host.locator(f"#hh-strip .hh-card[data-hh-pid='{ga}'] .hh-pic").count() == 1, "Garden shows a real preview card"
            shot(host, "1440")
            print("ok  Home: preview cards for both projects, messages with unread dots, no first-project card")

            # open a row: Arcade's chat
            row = host.locator("#hh-msgs .hh-row", has_text="4200").first; row.locator(".hh-open").click()
            host.wait_for_function(f"TribeClient.project() === '{ar}' && document.body.dataset.view === 'chat'", timeout=10000)
            print("ok  a row opens that project's conversation")
            # reply from a row (the host's DM with Maya)
            host.evaluate("TribeApp.show('hub')"); host.wait_for_selector("#hh-msgs .hh-row")
            r = host.locator("#hh-msgs .hh-row", has_text="hey Camp").first; r.locator(".hh-reply-b").click()
            host.fill("#hh-msgs .hh-reply input", "on my way"); host.click("#hh-msgs .hh-reply button[type=submit]")
            for _ in range(40):
                d = api(f"/chat/{dm_host}", token=mtok)[1]; lst = d.get("messages") if isinstance(d, dict) else d
                if any(m.get("text") == "on my way" for m in lst or []): break
                time.sleep(0.25)
            else: raise AssertionError("reply from the row did not arrive")
            print("ok  Reply from a row sends into that conversation")

            # the first-project card stays away while the list is loading and while the tribe is offline
            fresh = ctx.new_page(); fresh.on("pageerror", lambda e: errors.append(str(e)))
            fresh.add_init_script("(() => { const f = window.fetch; window.fetch = (u, o) => /\\/api\\/projects$/.test(String(u)) ? new Promise(r => setTimeout(() => r(f.call(window, u, o)), 2500)) : f.call(window, u, o); })()")   # a slow project list
            fresh.goto(BASE + "/?skipIntro=1")
            try: fresh.bring_to_front(); fresh.wait_for_function("!!(window.TribeHomeHub && window.TribeApp && TribeApp.show)", timeout=20000, polling=200)
            except Exception: raise AssertionError(("fresh tab", fresh.url, fresh.evaluate("[typeof window.TribeHomeHub, typeof window.TribeApp, document.title, document.body.innerText.slice(0, 200)]"), errors[-3:]))
            fresh.evaluate("TribeApp.show('hub')")
            for _ in range(10):
                assert fresh.locator("#hub-host, .db-start").count() == 0, "first-project card while the list loads"
                fresh.wait_for_timeout(200)
            fresh.close(); host.bring_to_front()
            srv.terminate(); srv.wait(timeout=10)
            host.wait_for_function("!TribeClient.connected()", timeout=20000); host.evaluate("TribeApp.show('hub')"); host.wait_for_timeout(1200)
            off = host.inner_text("#view-hub")
            assert host.locator("#hub-host, .db-start").count() == 0 and "Make your first project" not in off, "first-project card while offline"
            assert host.locator("#hh-msgs .hh-row").count() >= 2 and host.locator("#hh-msgs .hh-off").count() == 1, "offline: the last list, marked offline"
            shot(host, "offline")
            print("ok  no first-project card while loading or offline; offline shows the last messages, marked")
            srv = start(); up(); host.wait_for_function("TribeClient.connected()", timeout=30000)

            # phone
            host.set_viewport_size({"width": 390, "height": 844}); host.evaluate("TribeApp.show('hub')"); host.wait_for_timeout(1200)
            host.wait_for_selector("#hh-msgs .hh-row", timeout=15000)
            order = host.evaluate("(() => { const m = document.querySelector('#hh-msgs'), p = document.querySelector('#hh-prev'); return !!(m && p && (m.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)); })()")
            assert order, "phones: messages before previews"
            sw = host.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"sideways scroll at 390: {sw}"
            strip = host.evaluate("(() => { const s = document.querySelector('#hh-strip'); return s && getComputedStyle(s).overflowX; })()"); assert strip == "auto", strip
            shot(host, "390")
            print("ok  390px: messages first, previews swipe sideways, no page overflow")
            b.close()
        assert not errors, errors
        print("e2e_home_hub: all ok")
    finally:
        try: srv.terminate()
        except Exception: pass

if __name__ == "__main__":
    main()
