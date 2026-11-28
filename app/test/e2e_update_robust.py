"""Updates always land (fix/p15-updates, docs/UPDATES.md).
 (a) An OLD server (TribeCode kept running after its files were updated: TRIBE_BUILD_ID=old) and a page stamped with the
     new build: the page sees the mismatch, drops its stored files, reloads ONCE (no loop) and then shows "Finish updating".
 (b) Service worker: a page controlled by the worker, then the server is replaced by a new build (new index.html, new sw.js):
     the next navigation gets the new page (network first), the new worker deletes every old tribecode-shell-* cache.
 (c) The websocket hello says the server's build: a friend whose page is older sees "TribeCode was updated · Reload"; it
     waits while they type and reloads by itself when they stop, into the new build.
 (d) POST /api/admin/shutdown refuses anything not from this computer and a missing or wrong secret; the right one stops it.
 (e) Settings › About shows app/server/build/screens and whether they match; Repair install empties the caches, restarts
     this computer's server (run by scripts/update-from-source.js --serve: exit 75 -> restart) and reloads fresh.
Usage: python app/test/e2e_update_robust.py   (screenshots in the scratchpad given by TRIBE_SHOTS, else /tmp)"""
import json, os, re, shutil, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5660 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
UI = ROOT / "app" / "ui"
PAGE_BUILD = re.search(r'<meta name="tribe-build" content="([^"]*)">', (UI / "index.html").read_text()).group(1)
SHOTS = Path(os.environ.get("TRIBE_SHOTS", tempfile.gettempdir()))
errors = []
SETTINGS = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r, onboarded: true, tour: {done: true}})) } catch (e) {}"

def health():
    try:
        with urllib.request.urlopen(BASE + "/api/health", timeout=2) as r: return json.loads(r.read())
    except Exception: return None

def wait_up(proc=None, n=120):
    for _ in range(n):
        h = health()
        if h: return h
        if proc is not None and proc.poll() is not None: raise RuntimeError("server exited")
        time.sleep(0.25)
    raise RuntimeError("server did not start")

def wait_down(n=60):
    for _ in range(n):
        if not health(): return
        time.sleep(0.2)
    raise RuntimeError("server did not stop")

def post(path, headers=None):
    req = urllib.request.Request(BASE + path, method="POST", data=b"", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=3) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ev(page, js, tries=20):
    """evaluate, riding out the one reload a new service worker may cause"""
    for i in range(tries):
        try: return page.evaluate(js)
        except Exception as e:
            if "destroyed" not in str(e) and "navigat" not in str(e) or i == tries - 1: raise
            time.sleep(0.5)

def ui_copy(tmp, name, build, cache):
    """A copy of app/ui (symlinks) whose index.html says another build and whose sw.js has another cache name."""
    d = tmp / name; d.mkdir()
    for e in UI.iterdir():
        if e.name not in ("index.html", "sw.js"): (d / e.name).symlink_to(e)
    (d / "index.html").write_text((UI / "index.html").read_text().replace(f'content="{PAGE_BUILD}"', f'content="{build}"'))
    (d / "sw.js").write_text(re.sub(r"const CACHE = 'tribecode-shell-v\d+'", f"const CACHE = 'tribecode-shell-v{cache}'", (UI / "sw.js").read_text()))
    return d

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-upd-", dir="/tmp")); home = tmp / "home"; tribe = tmp / "tribe"
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBECODE_HOME": str(home)}
    env.pop("TRIBE_BUILD_ID", None)
    procs = []
    def start(extra_env=None, ui=None, supervised=False):
        args = ["--port", str(PORT), "--dir", str(tribe), "--name", "Update Crew", "--ollama", "http://localhost:9"] + (["--ui", str(ui)] if ui else [])
        cmd = ["node", str(ROOT / "scripts" / "update-from-source.js"), "--serve", "--no-update", "--"] + args if supervised else ["node", str(ROOT / "server" / "index.js")] + args
        p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env={**env, **(extra_env or {})}); procs.append(p)
        wait_up(p); return p
    def stop(p):
        p.terminate()
        try: p.wait(5)
        except Exception: p.kill()
        wait_down()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- (d) the admin door ----------
            s = start({"TRIBE_BUILD_ID": "old"})
            h = health(); assert h["build"] == "old" and h["uiBuild"] == PAGE_BUILD, h
            secret = (home / "admin-secret").read_text().strip(); assert len(secret) >= 32
            assert oct((home / "admin-secret").stat().st_mode)[-3:] == "600", "only this user can read the secret"
            pidf = json.loads((home / "servers" / f"{PORT}.json").read_text()); assert pidf["pid"] == h["pid"] and pidf["build"] == "old", pidf
            assert post("/api/admin/shutdown")[0] == 403, "no secret"
            assert post("/api/admin/shutdown", {"X-Tribe-Admin": "x" * 64})[0] == 403, "wrong secret"
            assert post("/api/admin/shutdown", {"X-Tribe-Admin": secret, "X-Forwarded-For": "203.0.113.9"})[0] == 403, "through a tunnel (proxy header)"
            assert post("/api/admin/shutdown", {"X-Tribe-Admin": secret, "Host": "tribe.example.com"})[0] == 403, "not a localhost address"
            assert post("/api/admin/shutdown", {"X-Tribe-Admin": secret, "Origin": "https://evil.example"})[0] == 403, "from another site"
            assert post("/api/admin/restart", {"X-Tribe-Admin": secret})[0] == 409, "restart needs a supervisor"
            assert health(), "still running after every refusal"
            print("ok  (d) /api/admin/shutdown refuses no secret, a wrong one, tunnels, other hosts and other sites")

            # ---------- (a) old server, new page: one fresh reload, then Finish updating ----------
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SETTINGS % "Camp")
            ctx.add_init_script("sessionStorage.setItem('loads', String(+(sessionStorage.getItem('loads') || 0) + 1)); if (sessionStorage.getItem('loads') === '1') caches.open('tribecode-shell-v1').then(c => c.put('/stale.js', new Response('old')));")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append("a: " + str(e)))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_selector("#sh-build", timeout=20000)
            assert "fresh=" in pg.url, "reloaded with fresh files: " + pg.url
            kind = pg.get_attribute("#sh-build", "data-kind"); assert kind in ("finish", "manual"), kind
            assert "Finish updating" in pg.inner_text("#sh-build")
            assert "tribecode-shell-v1" not in pg.evaluate("caches.keys()"), "stored app files dropped"
            pg.wait_for_timeout(3000); assert pg.evaluate("sessionStorage.getItem('loads')") == "2", "exactly one automatic reload: " + pg.evaluate("sessionStorage.getItem('loads')")
            pg.screenshot(path=str(SHOTS / "update-finish-desktop.png"))
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(SETTINGS % "Camp")
            pp = ph.new_page(); pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_selector("#sh-build", timeout=20000); pp.wait_for_timeout(800)
            box = pp.locator("#sh-build").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 390, box
            pp.screenshot(path=str(SHOTS / "update-finish-phone.png")); ph.close()
            print(f"ok  (a) old server (build old) + new page ({PAGE_BUILD}): caches dropped, one reload, then '{kind}' Finish updating")

            # ---------- (e) Settings › About + Repair install (supervised server restarts) ----------
            post("/api/admin/shutdown", {"X-Tribe-Admin": secret}); wait_down(); s.wait(5)
            s = start({"TRIBE_BUILD_ID": "old"}, supervised=True)
            pid0 = health()["pid"]
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            htok = pg.evaluate("TribeStore.get().server.token")
            pg.evaluate("caches.open('tribecode-shell-v2').then(c => c.put('/stale2.js', new Response('old')))")
            pg.evaluate("TribeSettings.open('about')"); pg.wait_for_selector("#set-build [data-match]", timeout=10000)
            txt = pg.inner_text("#set-build"); assert pg.get_attribute("#set-build [data-match]", "data-match") == "no" and "Server v" in txt and "Build old" in txt, txt
            pg.locator("#set-build-row").screenshot(path=str(SHOTS / "update-about-row.png"))
            with pg.expect_navigation(timeout=40000): pg.click("#set-clearcache")
            assert "fresh=" in pg.url, pg.url
            h2 = wait_up(); assert h2["pid"] != pid0, "the server restarted (new process)"
            pg.wait_for_function("window.TribeSelfHeal", timeout=20000)
            assert "tribecode-shell-v2" not in pg.evaluate("caches.keys()"), "Repair dropped the stored files"
            print("ok  (e) About shows the builds and 'Not matching'; Repair install emptied caches, restarted the server, reloaded")
            ctx.close()
            post("/api/admin/shutdown", {"X-Tribe-Admin": secret}); wait_down(); s.wait(10)

            # ---------- (b) service worker: new build on the server -> new page and new worker, old caches gone ----------
            s = start()   # this build, matching the page
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SETTINGS % "Camp")
            ctx.add_init_script("sessionStorage.setItem('loadsB', String(+(sessionStorage.getItem('loadsB') || 0) + 1));")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append("b: " + str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("navigator.serviceWorker.ready.then(() => true)", timeout=20000)
            pg.reload(); pg.wait_for_timeout(1500); assert ev(pg, "!!navigator.serviceWorker.controller")
            ev(pg, "caches.open('tribecode-shell-v1').then(c => c.put('/old.js', new Response('old')))")
            assert ev(pg, "document.querySelector('meta[name=\"tribe-build\"]').content") == PAGE_BUILD
            stop(s)
            newui = ui_copy(tmp, "ui-new", "new-b", 99001)
            s = start({"TRIBE_BUILD_ID": "new-b"}, ui=newui)
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("document.querySelector('meta[name=\"tribe-build\"]').content === 'new-b'", timeout=20000)
            pg.wait_for_function("caches.keys().then(k => k.includes('tribecode-shell-v99001') && !k.includes('tribecode-shell-v1') && !k.some(x => /^tribecode-shell-v4\\d\\d$/.test(x)))", timeout=20000)
            pg.wait_for_function("navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('sw.js')", timeout=20000)
            pg.wait_for_timeout(2500)
            assert pg.evaluate("document.querySelector('meta[name=\"tribe-build\"]').content") == "new-b"
            assert not pg.query_selector("#sh-build"), "page and server match: no banner"
            loads = int(pg.evaluate("sessionStorage.getItem('loadsB')")); assert loads <= 5, f"no reload loop ({loads})"
            print(f"ok  (b) service worker: next navigation got the new page (network first); new worker deleted the old shell caches ({loads} loads)")
            ctx.close()

            # ---------- (c) the hello announces a new build: a friend sees Reload, it waits while typing ----------
            req = urllib.request.Request(BASE + "/api/invites", method="POST", data=json.dumps({"maxUses": 5}).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + htok})
            code = json.loads(urllib.request.urlopen(req).read())["invite"]["code"]
            fc = b.new_context(viewport={"width": 1440, "height": 900}); fr = fc.new_page(); fr.on("pageerror", lambda e: errors.append("c: " + str(e)))
            fr.goto(f"{BASE}/join/{code}"); fr.wait_for_selector("#form:not(.hidden)")
            fr.fill("#name", "Jay"); fr.click("#go"); fr.wait_for_url(BASE + "/")
            fr.goto(BASE + "/?skipIntro=1&updateEarly=500&updateIdle=1500"); fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            assert fr.evaluate("document.querySelector('meta[name=\"tribe-build\"]').content") == "new-b"
            fr.wait_for_timeout(1200)
            stop(s)
            newer = ui_copy(tmp, "ui-newer", "newer-c", 99002)
            s = start({"TRIBE_BUILD_ID": "newer-c"}, ui=newer)
            # the friend is typing when the server comes back
            fr.evaluate("""(() => { const t = document.createElement('textarea'); t.id = 'upd-typing'; document.body.appendChild(t); t.value = 'half a sentence'; t.focus(); })()""")
            fr.wait_for_selector("#sh-build[data-kind=reload]", timeout=30000)
            assert "TribeCode was updated" in fr.inner_text("#sh-build")
            fr.screenshot(path=str(SHOTS / "update-reload-desktop.png"))
            fr.wait_for_timeout(3000)
            assert fr.query_selector("#upd-typing"), "no reload while typing"
            with fr.expect_navigation(timeout=20000): fr.evaluate("(() => { const t = document.getElementById('upd-typing'); t.value = ''; t.blur(); })()")
            fr.wait_for_function("document.querySelector('meta[name=\"tribe-build\"]') && document.querySelector('meta[name=\"tribe-build\"]').content === 'newer-c'", timeout=20000)
            fr.wait_for_timeout(1500); assert not fr.query_selector("#sh-build"), "matches now: no banner"
            print("ok  (c) the hello announced build newer-c: the friend saw 'TribeCode was updated · Reload', no reload while typing, then it reloaded into the new build")
            fc.close(); b.close()
        bad = [e for e in errors if "Failed to fetch" not in e and "NetworkError" not in e and "WebSocket" not in e]
        assert not bad, bad
        print("e2e_update_robust: all ok")
    finally:
        for p in procs:
            try: p.terminate(); p.wait(5)
            except Exception:
                try: p.kill()
                except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
