"""A folder on this computer as a project's home (feat/folder-sync, server/folderhome.js, app/ui/livingrepo.js).
  1. Pick an empty folder in the web picker (a new folder made there), Start fresh; edit a file in TribeCode (the
     folder API and the Files code editor): it is on disk, in that folder.
  2. An existing folder imports in place: what was found (.git? package.json? index.html?), nothing copied.
  3. An outside edit (another editor writing the file) shows up live: a folder-change event, and the pill stays one.
  4. Path escapes are rejected: .., a symlink out, a system folder, the data dir, home itself, an overlap with another
     project.
  5. The option is off on a phone and on a page that isn't served by this computer, with a reason.
  6. Moving the folder: the files go to an empty folder, the old one stays; a folder with files is refused.
Usage: python3 app/test/e2e_folder_home.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6430 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait(fn, what, t=15):
    end = time.time() + t
    while time.time() < end:
        try: v = fn()
        except Exception: v = None
        if v: return v
        time.sleep(0.2)
    raise AssertionError("timed out: " + what)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-folder-", dir="/tmp")); errors = []
    home = tmp / "home"; (home / "Projects").mkdir(parents=True)
    old = home / "Projects" / "OldSite"; (old / ".git").mkdir(parents=True); (old / "package.json").write_text('{"name":"old"}'); (old / "index.html").write_text("<h1>Old</h1>")
    (home / "Projects" / "Busy").mkdir(); (home / "Projects" / "Busy" / "x.txt").write_text("x")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home), "TRIBE_WATCH_DEBOUNCE_MS": "150"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait(lambda: api("/health")[0] == 200, "server")
        host = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        pid = api("/projects", "POST", {"name": "Jiddles"}, token=host)[1]["project"]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.setItem('tribecode.project:%s', '%s'); localStorage.setItem('tribecode.firstrun.done', '1') } catch (e) {}" % (BASE, host, BASE, pid))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeHome", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')")
            pg.wait_for_selector("#share-card", state="visible", timeout=15000)
            assert pg.locator("#home-pill:visible, #host-pill:visible, #demo-pill:visible").count() == 0, "no pill in the header: the dashboard card says it"

            # ---------- 1. an empty folder, made in the picker: start fresh, edit, on disk ----------
            pg.click("#sc-more"); pg.click("#hp-move"); pg.wait_for_selector("#lr-folder .lr-dir")
            pg.click("#lr-folder [data-open$='Projects']"); pg.wait_for_selector("#lr-folder [data-dir$='OldSite']")
            pg.fill("#lr-mk-name", "Jiddles"); pg.click("#lr-mk button")
            pg.wait_for_function("document.querySelector('#lr-folder-go') && document.querySelector('#lr-folder-go').textContent.includes('Start fresh')", timeout=10000)
            assert "Empty folder" in pg.inner_text("#lr-found")
            pg.uncheck("#lr-git"); pg.click("#lr-folder-go"); pg.wait_for_selector("#lr-folder", state="detached")
            fresh = home / "Projects" / "Jiddles"
            wait(lambda: "~/Projects/Jiddles" in pg.inner_text("#sc-line"), "the card shows the folder")
            assert not (fresh / ".git").exists(), "plain folders work without git"
            st, d = api(f"/projects/{pid}/folder/file", "PUT", {"path": "src/game.js", "content": "let score = 0;\n"}, token=host); assert st == 200, d
            assert (fresh / "src" / "game.js").read_text() == "let score = 0;\n", "written straight into the folder"
            st, d = api("/code/file", "PUT", {"path": "index.html", "text": "<h1>Jiddles</h1>"}, token=host, project=pid); assert st == 200, d
            assert (fresh / "index.html").read_text() == "<h1>Jiddles</h1>", "the Files code editor writes there too"
            st, d = api(f"/projects/{pid}/folder/files", token=host); assert {"src", "index.html"} <= {f["name"] for f in d["files"]}, d

            # ---------- 3. an outside edit shows up live ----------
            pg.evaluate("window.__fc = []; addEventListener('tribe-folder-change', e => window.__fc.push(e.detail))")
            time.sleep(0.5)
            (fresh / "src" / "level.js").write_text("// from VS Code\n")
            ev = wait(lambda: pg.evaluate("window.__fc.find(x => x.outside && x.files.some(f => f.endsWith('level.js')))"), "the outside edit arrives", t=10)
            assert ev["project"] == pid
            st, d = api(f"/projects/{pid}/folder/file?path=src/level.js", token=host); assert d["content"] == "// from VS Code\n"
            pg.evaluate("window.__fc = []")
            api(f"/projects/{pid}/folder/file", "PUT", {"path": "src/own.js", "content": "x"}, token=host); time.sleep(1)
            assert not pg.evaluate("window.__fc.some(x => x.outside && x.files.some(f => f.endsWith('own.js')))"), "TribeCode's own save isn't an outside edit"

            # ---------- 2. an existing folder imports in place ----------
            pid2 = api("/projects", "POST", {"name": "Old Site"}, token=host)[1]["project"]["id"]
            pg.evaluate(f"TribeProjects.switchTo('{pid2}', 'home')"); pg.wait_for_timeout(600)
            pg.evaluate("TribeHome.folder()"); pg.wait_for_selector("#lr-folder .lr-dir")
            pg.click("#lr-folder [data-open$='Projects']"); pg.wait_for_selector("#lr-folder [data-dir$='OldSite']"); pg.click("#lr-folder [data-dir$='OldSite']")
            pg.wait_for_function("document.querySelector('#lr-folder-go').textContent.includes('Use what')", timeout=10000)
            chips = pg.inner_text("#lr-found .lr-chips"); assert "✓ .git" in chips and "✓ package.json" in chips and "✓ index.html" in chips, chips
            assert pg.is_hidden("#lr-git-l"), "it has .git: no git init offered"
            pg.click("#lr-folder-go"); pg.wait_for_selector("#lr-folder", state="detached")
            st, d = api(f"/projects/{pid2}/folder", token=host); assert d["folder"]["display"] == "~/Projects/OldSite" and d["folder"]["summary"]["packageJson"], d
            assert (old / "index.html").read_text() == "<h1>Old</h1>" and not (tmp / "tribe" / "workspaces" / pid2).exists(), "in place, nothing copied"

            # ---------- 4. path escapes ----------
            os.symlink("/etc", home / "Projects" / "etc-link")
            os.symlink(str(tmp / "tribe"), home / "Projects" / "data-link")
            bad = {"..": "~/Projects/../Projects/x", "symlink out": "~/Projects/etc-link", "symlink to the data dir": "~/Projects/data-link", "system": "/usr/lib",
                   "root": "/", "home": "~", "data dir": str(tmp / "tribe"), "inside the data dir": str(tmp / "tribe" / "chat"), "overlap": "~/Projects/Jiddles/src", "contains another": "~/Projects", "hidden": "~/.config"}
            (home / ".config").mkdir(exist_ok=True)
            pid3 = api("/projects", "POST", {"name": "Third"}, token=host)[1]["project"]["id"]
            for why, path in bad.items():
                st, d = api(f"/projects/{pid3}/folder", "PUT", {"path": path}, token=host); assert st == 400, (why, st, d)
                st, d = api("/folders/check", "POST", {"path": path, "project": pid3}, token=host); assert st == 400, (why, st, d)
            st, d = api(f"/projects/{pid3}/folder", "PUT", {"path": "~/Projects/OldSite"}, token=host); assert st == 400 and "Old Site" in d["error"], d
            # the picker says why, inline
            pg.evaluate(f"TribeProjects.switchTo('{pid3}', 'home')"); pg.wait_for_timeout(600)
            pg.evaluate("TribeHome.folder()"); pg.wait_for_selector("#lr-folder .lr-dir"); pg.click("#lr-folder [data-open$='Projects']")
            pg.wait_for_selector("#lr-folder [data-dir$='Jiddles']"); pg.click("#lr-folder [data-dir$='Jiddles']")
            pg.wait_for_selector("#lr-ferr:not([hidden])"); assert "overlaps" in pg.inner_text("#lr-ferr") and pg.is_disabled("#lr-folder-go")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#lr-folder", state="detached")

            # ---------- 6. moving the folder ----------
            st, d = api(f"/projects/{pid}/folder", "PUT", {"path": "~/Projects/Busy"}, token=host); assert st == 409 and "empty" in d["error"], d
            st, d = api(f"/projects/{pid}/folder", "PUT", {"path": "~/Projects/Jiddles2", "create": True}, token=host); assert st == 200 and d["moved"], d
            moved = home / "Projects" / "Jiddles2"
            assert (moved / "src" / "game.js").read_text() == "let score = 0;\n" and (moved / "index.html").exists(), "files moved"
            assert (fresh / "src" / "game.js").exists(), "the old folder stays as it was"
            api(f"/projects/{pid}/folder/file", "PUT", {"path": "after.txt", "content": "new home"}, token=host)
            assert (moved / "after.txt").exists() and not (fresh / "after.txt").exists(), "edits go to the new folder"
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')")
            wait(lambda: "~/Projects/Jiddles2" in pg.inner_text("#sc-line"), "the card follows the move")
            (moved / "watched.txt").write_text("still watching")
            wait(lambda: pg.evaluate("window.__fc.some(x => x.files.some(f => f.endsWith('watched.txt')))"), "the watcher follows the move", t=10)

            # ---------- 5. off on a phone and on the public website ----------
            ph = b.new_page(viewport={"width": 390, "height": 844}, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")
            ph.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.setItem('tribecode.firstrun.done', '1') } catch (e) {}" % (BASE, host))
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeHome", timeout=20000)
            c = ph.evaluate("TribeHome.canPickFolder()"); assert not c["ok"] and "phone" in c["why"], c
            ph.close()
            lan = [x["url"] for x in api("/health")[1].get("lan", []) if x.get("kind") == "lan"]
            if lan:   # a page from somewhere other than this computer (like the public website): off, with why
                pw = b.new_page(viewport={"width": 1300, "height": 820})
                try:
                    pw.goto(lan[0] + "/?skipIntro=1", timeout=15000); pw.wait_for_function("window.TribeHome", timeout=15000)
                    c = pw.evaluate("TribeHome.canPickFolder()"); assert not c["ok"] and "web" in c["why"], c
                except Exception as e:
                    if "net::" not in str(e): raise
                pw.close()
            st, d = api("/folders/browse"); assert st == 200   # sanity: this computer itself may browse
            b.close()
        assert not errors, errors
        print("e2e_folder_home: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
