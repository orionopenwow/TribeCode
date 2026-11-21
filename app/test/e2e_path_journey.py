"""The whole path, once, for a website and a phone app (pass 4, docs/WHERE-IT-LIVES.md, docs/PATH-AUDIT.md):
a folder on a computer -> shared with a friend -> online through GitHub.

GitHub is a stand-in here: app/test/ghmock.py plays api.github.com and a local bare git repository plays the project on
GitHub (TRIBE_GITHUB_GIT). Nothing in this file reaches the real GitHub.

  1 Just a folder   A fresh tribe folder, no GitHub, no friends. A website made in the website designer and an app made
                    in App Creator become real files in the project's folder a moment after each change (site/,
                    app-web/), with the design itself beside them. Both open from disk with a double-click (file://).
                    "Open the folder" answers on this computer and refuses a request that came through a proxy.
                    A file edited by hand is never written over: the write is held, the editor asks, "Keep my files"
                    stops the designer writing, "Write the design again" copies theirs to .my-changes first.
                    Export no longer empties app-web/ or app-expo/ (a person's own file there survives).
                    The server restarts and the design is still there; with the tribe's own copy gone, the design
                    comes back from the folder.
  2 Shared          One invite, one join. The friend sees the same website and app and changes them; the files on
                    disk follow. With the tribe unreachable the friend's App Creator says so, keeps the change on the
                    device, and sends it by itself when the tribe is back. App Creator never opens a blank app over
                    the real one when the tribe cannot be reached.
  3 Online          Publish › Where it goes works with no code folder: the website goes to GitHub Pages, shows its
                    public address and updates on demand; "What goes online?" switches to the phone app, which gets
                    its own link and never replaces the website's. The token is in no response, log or project file.
                    The project gets a folder of its own: the design's files follow it there. A saved version is a
                    real commit; Ship sends the folder to the project on GitHub; a change a friend made there comes
                    back with Pull, and a pulled change to a designed file is held, not written over.
  UI                Where it lives: three steps, the folder path, at most one main button, the same sheet from the
                    website designer, App Creator and Publish; 390px with no sideways scroll and 40px targets.
Usage: python app/test/e2e_path_journey.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, GH_PORT = 5760 + OFF, 5860 + OFF
BASE = f"http://localhost:{PORT}"
CHROME = "/usr/bin/google-chrome"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
TOKEN = "ghp_" + "Mara7" * 7
ghmock.GOOD[TOKEN] = "Mara-Test"
errors = []


def api(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=40) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(*a, cwd=None):
    return subprocess.run(["git", "-c", "user.name=Friend", "-c", "user.email=friend@example.com", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def wait(fn, what, t=10):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError("timed out: " + what)


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); "
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "WebSocket" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); page.wait_for_timeout(450); page.screenshot(path=os.path.join(SHOTS, name))


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-path-", dir="/tmp"))
    home, ghroot, tribe = tmp / "home", tmp / "github", tmp / "tribe"
    (ghroot / "mara-test").mkdir(parents=True); home.mkdir()
    bare = ghroot / "mara-test" / "bake.git"; git("init", "-q", "--bare", "-b", "main", str(bare))
    gh = ghmock.start(GH_PORT)
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_REVEAL": "1", "HOME": str(home), "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost",
           "TRIBE_GITHUB_API": f"http://127.0.0.1:{GH_PORT}", "TRIBE_GITHUB_GIT": str(ghroot), "TRIBE_DESIGNFILES_MS": "250", "TRIBE_SYNC_RETRY_MS": "200"}
    logf = tmp / "server.log"
    def start():
        p = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tribe), "--ollama", "http://localhost:9", "--name", "Bake Sale"], stdout=open(logf, "a"), stderr=subprocess.STDOUT, env=env)
        wait(lambda: api("/health")[0] == 200, "server up", 20)
        return p
    srv = start()
    try:
        mara = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=mara))["projects"][0]["id"]
        proj = tribe / "projects" / pid
        site, app = proj / "site", proj / "app-web"
        F = lambda: ok(api(f"/projects/{pid}/design-files", token=mara), "design-files")
        assert not F()["site"]["has"] and not F()["app"]["has"], "nothing yet"
        st, d = api("/publish/real?project=" + pid, token=mara); assert st == 200 and d["next"] == "build" and "repository" not in (d["problem"] or "").lower(), d.get("problem")

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server", "--allow-file-access-from-files"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", mara, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeAppCreator && window.TribeWhere && window.TribeClient && TribeClient.connected()", timeout=20000)

            # ================= 1: just a folder =================
            pg.evaluate("TribeSiteDesigner.open({ template: 'linkbio' })")
            wait(lambda: (site / "index.html").exists() and (site / "site.json").exists(), "the website's files appear by themselves")
            cfg = json.loads((site / "site.json").read_text()); assert cfg["pages"], "site.json is the design"
            assert "<html" in (site / "index.html").read_text() and list((site / "fonts").glob("*.woff2")), "pages and fonts"
            pg.evaluate("TribeSiteDesigner.ask('dark mode')")
            wait(lambda: json.loads((site / "site.json").read_text())["theme"].get("mode") == "dark", "a change reaches the files a moment later")
            pg.evaluate("TribeSiteDesigner.flush()"); pg.evaluate("TribeSiteDesigner.close()")

            pg.evaluate("TribeAppCreator.open({ template: 'habits' })"); pg.wait_for_selector("#apc .ax-screen", timeout=8000)
            wait(lambda: (app / "index.html").exists() and (app / "app-design.json").exists() and (app / "app.js").exists(), "the app's files appear by themselves")
            pg.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Bake Habits' })")
            wait(lambda: json.loads((app / "app-design.json").read_text())["name"] == "Bake Habits", "an app change reaches the files")
            # the same design always makes the same files: writing again changes nothing (no churn in the folder)
            for kind in ("site", "app"):
                ok(api(f"/projects/{pid}/design-files/write", "POST", {"kind": kind}, token=mara), "write " + kind)
                again = ok(api(f"/projects/{pid}/design-files/write", "POST", {"kind": kind}, token=mara)); assert again["ok"] and again["wrote"] == 0, (kind, again["wrote"])
            f = F(); assert f["site"]["has"] and f["app"]["has"] and f["kind"] == "plain" and f["folder"].endswith(f"projects/{pid}") and f["canOpen"], f

            # double-click: both open from disk
            fp = ctx.new_page(); fp.goto("file://" + str(site / "index.html")); assert len(fp.inner_text("body").strip()) > 40, "the website opens from disk"
            fp.goto("file://" + str(app / "index.html")); fp.wait_for_timeout(600); assert len(fp.inner_text("body").strip()) > 20, "the app opens from disk"; fp.close()

            # Open the folder: this computer only
            r = ok(api(f"/projects/{pid}/design-files/open", "POST", {"kind": "site"}, token=mara), "open"); assert r["path"].endswith("/site"), r
            st, d = api(f"/projects/{pid}/design-files/open", "POST", {}, token=mara, headers={"X-Forwarded-For": "203.0.113.9"}); assert st == 403, (st, d)

            # Where it lives, from App Creator's Export menu
            pg.click("#apc-export"); pg.click("#apc-menu [data-x='where']")
            pg.wait_for_selector("#whl-sheet [data-whl-step='online']", timeout=8000)
            assert pg.evaluate("document.querySelector('#whl-sheet').getBoundingClientRect().height") > 400, "the sheet is drawn in full"
            assert pg.locator("#whl-sheet [data-whl-step]").count() == 3 and pg.locator("#whl-folder").inner_text().endswith(f"projects/{pid}")
            assert pg.locator("#whl-sheet .whl-files li").count() == 2 and pg.locator("#whl-sheet .btn.primary").count() <= 1, "two folders listed, at most one main button"
            assert pg.locator("#whl-sheet [data-whl-open]").count() == 1
            shot(pg, "where-it-lives-1440.png")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#whl-sheet", state="detached", timeout=4000)
            pg.evaluate("TribeAppCreator.close()")

            # a file edited by hand is never written over
            (site / "index.html").write_text((site / "index.html").read_text() + "<!-- my own line -->")
            (site / "mine.txt").write_text("a file I added\n")
            pg.evaluate("TribeSiteDesigner.open({})"); pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open")
            pg.evaluate("TribeSiteDesigner.ask('light mode')")
            wait(lambda: F()["site"]["held"] == ["index.html"], "the write is held")
            assert "my own line" in (site / "index.html").read_text() and json.loads((site / "site.json").read_text())["theme"].get("mode") == "dark", "nothing was written"
            pg.wait_for_selector("#whl-ask [data-whl-mine]", timeout=8000); shot(pg, "where-it-lives-ask.png")
            pg.click("#whl-ask [data-whl-mine]"); pg.wait_for_selector("#whl-ask", state="detached", timeout=4000)
            wait(lambda: F()["site"]["hands"] and not F()["site"]["held"], "Keep my files")
            pg.evaluate("TribeSiteDesigner.ask('dark mode')"); pg.evaluate("TribeSiteDesigner.flush()"); time.sleep(0.9)
            assert "my own line" in (site / "index.html").read_text(), "the designer stopped writing this folder"
            pg.evaluate("TribeSiteDesigner.close()")
            pg.evaluate(f"TribeWhere.open('{pid}', 'site')"); pg.wait_for_selector("#whl-sheet .whl-files [data-whl-use='site']", timeout=8000)
            pg.click("#whl-sheet .whl-files [data-whl-use='site']")
            wait(lambda: not F()["site"]["hands"] and "my own line" not in (site / "index.html").read_text(), "Write the design again")
            kept = list((proj / ".my-changes").rglob("index.html")); assert kept and "my own line" in kept[0].read_text(), "their version was copied aside first"
            assert (site / "mine.txt").read_text() == "a file I added\n", "a file the designer never wrote is left alone"
            pg.keyboard.press("Escape")

            # Export leaves a person's own files in place
            (app / "notes.txt").write_text("mine\n")
            r = ok(api(f"/projects/{pid}/app-config/export", "POST", {"kind": "pwa"}, token=mara), "export pwa")
            # the export gives the project a code folder (for the live preview): the app's files follow it there
            p2 = ok(api("/projects", token=mara))["projects"][0]; assert p2["hasRepo"], p2
            code = tribe / "workspaces" / pid
            assert (code / "app-web" / "index.html").exists() and (code / "app-web" / "app-design.json").exists(), r
            wait(lambda: F()["site"]["has"] and (code / "site" / "index.html").exists(), "the website follows the project to its code folder")
            assert not (site / "index.html").exists() and (site / "mine.txt").exists() and (app / "notes.txt").exists(), "our untouched files left the old place; theirs stayed"
            site, app, proj = code / "site", code / "app-web", code
            (code / "app-expo").mkdir(exist_ok=True); (code / "app-expo" / "keep.txt").write_text("mine\n")
            ok(api(f"/projects/{pid}/app-config/export", "POST", {"kind": "expo"}, token=mara), "export expo")
            assert (code / "app-expo" / "keep.txt").exists() and (code / "app-expo" / "package.json").exists(), "Expo export no longer empties the folder"

            # the server restarts; then the tribe's own copy goes missing and the folder brings the design back
            srv.terminate(); srv.wait(); srv = start()
            assert ok(api(f"/projects/{pid}/site-config", token=mara))["config"]["theme"]["mode"] == "dark"
            srv.terminate(); srv.wait()
            (tribe / ".tribe" / "website" / f"{pid}.config.json").unlink(); (tribe / ".tribe" / "appdesign" / f"{pid}.json").unlink()
            srv = start()
            assert ok(api(f"/projects/{pid}/site-config", token=mara))["config"]["theme"]["mode"] == "dark", "the website came back from site/site.json"
            assert ok(api(f"/projects/{pid}/app-config", token=mara))["config"]["name"] == "Bake Habits", "the app came back from app-web/app-design.json"
            pg.reload(); pg.wait_for_function("window.TribeWhere && window.TribeClient && TribeClient.connected()", timeout=20000)

            # ================= 2: shared with a friend =================
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=mara), "invite")["invite"]
            sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}), "join")["token"]
            assert ok(api(f"/projects/{pid}/site-config", token=sam))["config"]["theme"]["mode"] == "dark", "the friend sees the same website"
            c2 = b.new_context(viewport={"width": 1280, "height": 800}); c2.add_init_script(settings_js("Sam", sam, pid))
            sp = c2.new_page(); watch(sp, "sam"); sp.goto(BASE + "/?skipIntro=1")
            sp.wait_for_function("window.TribeAppCreator && window.TribeClient && TribeClient.connected()", timeout=20000)
            sp.evaluate("TribeAppCreator.open({})"); sp.wait_for_selector("#apc .ax-screen", timeout=8000)
            assert sp.evaluate("TribeAppCreator.doc().name") == "Bake Habits"
            sp.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Sam Habits' })")
            wait(lambda: ok(api(f"/projects/{pid}/app-config", token=mara))["config"]["name"] == "Sam Habits", "the friend's change is the tribe's")
            wait(lambda: json.loads((app / "app-design.json").read_text())["name"] == "Sam Habits", "and it is in the folder")
            # the tribe cannot be reached: said plainly, kept on the device, sent by itself later
            srv.terminate(); srv.wait(); time.sleep(0.4)
            sp.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Offline Habits' })")
            sp.wait_for_function("/Saved on this device/.test(document.querySelector('#apc-saved').textContent)", timeout=8000)
            assert sp.evaluate(f"!!localStorage.getItem('tribecode.appcreator.unsent.{pid}')"), "kept on the device"
            # a second device opening App Creator now gets a plain message, never a blank app that would save over the real one
            sp2 = c2.new_page(); sp2.goto("about:blank")
            r0 = pg.evaluate("TribeAppCreator.open({}).then(s => !!s)"); assert r0 is False and pg.locator("#apc").count() == 0, "no blank app while the tribe is unreachable"
            sp2.close()
            srv = start()
            wait(lambda: ok(api(f"/projects/{pid}/app-config", token=mara))["config"]["name"] == "Offline Habits", "sent by itself when the tribe is back", 14)
            sp.wait_for_function("/^Saved/.test(document.querySelector('#apc-saved').textContent)", timeout=8000)
            assert not sp.evaluate(f"!!JSON.parse(localStorage.getItem('tribecode.appcreator.unsent.{pid}') || 'null')")
            # closed with an unsent change, opened again later: it comes back and is sent
            srv.terminate(); srv.wait(); time.sleep(0.3)
            sp.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Came Back' })"); sp.wait_for_function("/Saved on this device/.test(document.querySelector('#apc-saved').textContent)", timeout=8000)
            sp.evaluate("TribeAppCreator.close()")
            srv = start(); sp.reload(); sp.wait_for_function("window.TribeAppCreator && window.TribeClient && TribeClient.connected()", timeout=20000)
            sp.evaluate("TribeAppCreator.open({})"); sp.wait_for_selector("#apc .ax-screen", timeout=8000)
            wait(lambda: ok(api(f"/projects/{pid}/app-config", token=mara))["config"]["name"] == "Came Back", "an unsent change from a closed editor is sent on the next open", 10)
            sp.evaluate("TribeAppCreator.close()")

            # ================= 3: online through GitHub =================
            Q = "?project=" + pid
            ok(api("/publish/real", "PUT", {"project": pid, "what": "site"}, token=mara))
            s = ok(api("/publish/real" + Q, token=mara), "status")
            assert s["things"] == {"site": True, "app": True} and s["what"] == "site" and s["kind"] == "site" and not s["problem"] and not s["github"]["signedIn"], {k: s[k] for k in ("things", "what", "kind", "problem")}
            st, d = api("/publish/real/pages", "POST", {"project": pid, "title": "Bake Sale"}, token=mara); assert st == 401 and d.get("needGithub"), (st, d)
            assert not ghmock.STATE["calls"], "nothing is sent to GitHub without a sign-in"
            ok(api("/github/token", "POST", {"token": TOKEN}, token=mara), "sign in")
            r = ok(api("/publish/real/pages", "POST", {"project": pid, "title": "Bake Sale", "desc": "Cakes on Saturday."}, token=mara), "pages")
            assert r["url"].startswith("https://mara-test.github.io/") and r["repo"] == "Mara-Test/bake-sale", r
            t = ghmock.tree_of("Mara-Test/bake-sale"); assert "index.html" in t and "site.json" in t and b"<html" in t["index.html"] and not any(n.startswith(".") and n not in (".tribecode.json", ".nojekyll") for n in t), sorted(t)[:12]
            # update on demand
            cfg = ok(api(f"/projects/{pid}/site-config", token=mara))
            cfg["config"]["name"] = "Bake Sale Saturday"; ok(api(f"/projects/{pid}/site-config", "PUT", {"config": cfg["config"], "base": cfg["rev"]}, token=mara), "edit")
            r2 = ok(api("/publish/real/pages", "POST", {"project": pid, "title": "Bake Sale"}, token=mara), "update"); assert r2["url"] == r["url"] and r2["version"] == r["version"] + 1
            assert b"Bake Sale Saturday" in ghmock.tree_of("Mara-Test/bake-sale")["site.json"], "the update carries the newest design with no extra step"
            # the phone app: its own link, never over the website's
            s = ok(api("/publish/real", "PUT", {"project": pid, "what": "app"}, token=mara)); assert s["what"] == "app" and s["kind"] == "app" and s["slug"].endswith("-app") and not s["dest"]["pages"], {k: s[k] for k in ("what", "kind", "slug")}
            ra = ok(api("/publish/real/pages", "POST", {"project": pid, "title": "Bake Sale"}, token=mara), "pages app")
            assert ra["repo"] != r["repo"] and ra["repo"].endswith("-app") and "app.js" in ghmock.tree_of(ra["repo"]) and "manifest.webmanifest" in ghmock.tree_of(ra["repo"]), ra
            assert "site.json" in ghmock.tree_of("Mara-Test/bake-sale") and "app.js" not in ghmock.tree_of("Mara-Test/bake-sale"), "the website's page is untouched"
            s = ok(api("/publish/real", "PUT", {"project": pid, "what": "site"}, token=mara)); assert s["dest"]["pages"]["url"] == r["url"], "each keeps its own link"
            # a friend who may publish can; the token never leaves the server
            blob = json.dumps([s, r, ra, ok(api(f"/projects/{pid}/design-files", token=sam)), ok(api("/publish/real" + Q, token=sam))])
            assert TOKEN not in blob and TOKEN not in logf.read_text(errors="ignore")
            for pth in list(proj.rglob("*")):
                if pth.is_file() and ".git" not in pth.parts and pth.stat().st_size < 2_000_000: assert TOKEN.encode() not in pth.read_bytes(), pth

            # Publish sheet: what goes online, the public address, the way to the explainer
            pg.evaluate(f"TribePublish.open('{pid}', 'pages')"); pg.wait_for_selector("#pbr [data-what='app']", timeout=10000)
            assert pg.locator("#pbr [data-what][aria-pressed='true']").get_attribute("data-what") == "site" and r["url"] in pg.locator("#pbr").inner_text()
            assert "repository" not in pg.locator("#invite-modal").inner_text().lower()
            shot(pg, "publish-what-goes-online.png")
            pg.click("#pbr [data-where]"); pg.wait_for_selector("#whl-sheet #whl-link", timeout=8000)
            assert pg.locator("#whl-link").inner_text() == r["url"] and "Live" in pg.locator("#whl-sheet [data-whl-step='online']").inner_text()
            pg.keyboard.press("Escape")

            # the project gets a folder of its own; the files follow; a saved version is a commit; Ship and Pull
            folder = home / "Sites" / "Bake"; folder.mkdir(parents=True)
            st, d = api(f"/projects/{pid}/folder", "PUT", {"path": "~/Sites/Bake", "gitInit": True}, token=mara); assert st == 200 and d["folder"]["git"], d
            f = F(); assert f["folder"] == "~/Sites/Bake" and f["kind"] == "folder" and f["site"]["has"] and f["app"]["has"] and f["git"], f
            assert (folder / "site" / "index.html").exists() and (folder / "app-web" / "app.js").exists() and not (code / "site" / "index.html").exists(), "the files followed the project to its folder"
            v = ok(api(f"/projects/{pid}/versions", "POST", {"message": "Bake sale site, first version"}, token=mara), "save a version")
            assert "Bake sale site, first version" in git("log", "--format=%s", "-5", cwd=folder), "a saved version is a real commit"
            ok(api("/me/git", "PUT", {"githubToken": TOKEN}, token=mara))
            st, d = api(f"/projects/{pid}/sync", "PUT", {"repo": "mara-test/bake", "branch": "main"}, token=mara); assert st == 200, d
            st, d = api(f"/projects/{pid}/sync/ship", "POST", {"message": "Bake sale"}, token=mara); assert st == 200 and d["shipped"], d
            tree = git("ls-tree", "-r", "--name-only", "main", cwd=bare).split("\n")
            assert "site/index.html" in tree and "app-web/app.js" in tree and not any(x.startswith((".tribe/", ".my-changes/")) for x in tree), tree[:20]
            other = tmp / "other"; git("clone", "-q", str(bare), str(other))
            (other / "RECIPES.md").write_text("# Lemon cake\n"); (other / "site" / "index.html").write_text((other / "site" / "index.html").read_text() + "<!-- from GitHub -->")
            git("add", "-A", cwd=other); git("commit", "-qm", "A friend on GitHub", cwd=other); git("push", "-q", "origin", "main", cwd=other)
            st, d = api(f"/projects/{pid}/sync/pull", "POST", {}, token=mara); assert st == 200, d
            assert (folder / "RECIPES.md").exists() and "from GitHub" in (folder / "site" / "index.html").read_text(), "a change made on GitHub came back with Pull"
            cfg = ok(api(f"/projects/{pid}/site-config", token=mara)); cfg["config"]["name"] = "Bake Sale Sunday"
            ok(api(f"/projects/{pid}/site-config", "PUT", {"config": cfg["config"], "base": cfg["rev"]}, token=mara))
            wait(lambda: F()["site"]["held"] == ["index.html"], "a pulled change to a designed file is held, not written over")
            assert "from GitHub" in (folder / "site" / "index.html").read_text()
            assert TOKEN not in logf.read_text(errors="ignore") and TOKEN not in (folder / ".git" / "config").read_text()

            # ================= phone, 390px =================
            c3 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c3.add_init_script(settings_js("Mara", mara, pid))
            ph = c3.new_page(); watch(ph, "phone"); ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeWhere && window.TribeClient && TribeClient.connected()", timeout=20000)
            ph.evaluate(f"TribeWhere.open('{pid}')"); ph.wait_for_selector("#whl-sheet [data-whl-held='site']", timeout=8000)
            assert ph.locator("#whl-sheet [data-whl-held]").count() == 1, "only the file that really changed is asked about"
            assert ph.evaluate("document.querySelector('#whl-sheet').getBoundingClientRect().height") > 400, "the sheet is drawn in full"
            assert not ph.evaluate("document.documentElement.scrollWidth > innerWidth + 1"), "no sideways scroll at 390px"
            small = ph.evaluate("[...document.querySelectorAll('#whl-sheet .btn')].filter(b => b.getBoundingClientRect().height < 40).length"); assert small == 0, small
            assert ph.evaluate("(() => { const r = document.querySelector('#whl-sheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()")
            shot(ph, "where-it-lives-390.png")
            ph.click("#whl-sheet [data-whl-held='site'] [data-whl-use='site']")
            wait(lambda: not F()["site"]["held"] and "from GitHub" not in (folder / "site" / "index.html").read_text(), "Use the design, from a phone")
            assert any("from GitHub" in p.read_text() for p in (folder / ".my-changes").rglob("index.html")), "the pulled version was copied aside"
            b.close()
        assert not errors, errors[:6]
        print("e2e_path_journey: OK (folder: real files for a site and an app, double-click, held hand edits, files follow the folder, design back from the folder; shared: friend edits, unsent kept and sent; online: Pages for site and app with their own links, commit, ship, pull; 390px)")
    finally:
        try: srv.terminate()
        except Exception: pass
        try: gh.shutdown()
        except Exception: pass


if __name__ == "__main__":
    main()
