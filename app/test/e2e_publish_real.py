"""End-to-end: Publish for real (server/publishreal.js, app/ui/pubcore.js, app/ui/publishreal.js, docs/PUBLISH.md).

GitHub is a stand-in here (app/test/ghmock.py): nothing in this file reaches the real GitHub, itch.io or a phone, and
no build file is ever run. What it proves:
A  status: the kind is sensed (a game), the check list says what is filled in for you, the next step is named.
Z  the zip: valid, the first page completed (phone setting, description, icon), install files inside (manifest,
   offline copy, 192 and 512 PNG icons), nothing hidden or secret in it; the project's own files are untouched.
I  the itch.io zip: index.html at the top, no install files, inside itch's limits.
W  installable: served from the zip, the page registers its offline copy and still opens with the network off.
G  GitHub Pages: needs a sign-in, then makes the person's own project, sends the whole tree, turns the page on and
   returns the live link; publishing again updates the same link; a name that is already theirs is never touched;
   when the page can't be turned on by API the two-click step is offered.
X  wrappers: the Android and iPhone build files are valid YAML with the keys GitHub needs, the Android config points
   at the live link, the build state is read back, the download link is the release's.
U  the sheet at 1280 and 390 (no sideways scroll), download, sign-in offer, publish, Flint commands, the lesson.
Usage: python app/test/e2e_publish_real.py [--shots]
"""
import io, json, os, re, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile, http.server, threading, functools
from pathlib import Path
import yaml
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, GH_PORT, WEB_PORT = 7600 + OFF, 7601 + OFF, 7602 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "docs" / "screenshots")
take = "--shots" in sys.argv or bool(os.environ.get("SHOTS_DIR"))
errors = []
TOKEN = "ghp_" + "Camp9" * 7
ghmock.GOOD[TOKEN] = "Camp-Test"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None, binary=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=60) as r:
            data = r.read(); return r.status, (data if binary else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        try: return e.code, json.loads(data or b"{}")
        except Exception: return e.code, {"raw": data[:200].decode("utf8", "replace")}


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d if not isinstance(d, bytes) else d[:200]}"
    return d


def make_repo(path, files):
    os.makedirs(path, exist_ok=True)
    for rel, txt in files.items():
        Path(path, rel).parent.mkdir(parents=True, exist_ok=True)
        Path(path, rel).write_bytes(txt) if isinstance(txt, bytes) else Path(path, rel).write_text(txt)
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.lang', 'en'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text[:200]}"))


def png_size(b):
    assert b[:8] == b"\x89PNG\r\n\x1a\n", "a real PNG"
    return struct.unpack(">II", b[16:24])


GAME = """<!doctype html><html><head></head>
<body><canvas id="c" width="320" height="480"></canvas><img src="art/ship.svg" alt=""><script src="game.js"></script></body></html>"""
GAME_JS = "const c = document.getElementById('c').getContext('2d'); c.fillStyle = '#38C6B1'; c.fillRect(20, 20, 80, 80); document.title = document.title || 'x';"
SHIP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M4 0l4 8H0z"/></svg>'


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-pubreal-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="pubreal-src-", dir="/tmp")
    app = os.path.join(work, "star-hopper")
    make_repo(app, {"index.html": GAME, "game.js": GAME_JS, "art/ship.svg": SHIP, ".env": "SECRET=hunter2", "id_rsa": "KEY", "node_modules/x/i.js": "x",
                    ".github/workflows/own.yml": "name: own\n", "README.md": "# Star Hopper"})
    gh = ghmock.start(GH_PORT)
    logf = open(os.path.join(tmp, "server.log"), "wb")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Publish Crew"],
                           stdout=logf, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_GITHUB_API": f"http://127.0.0.1:{GH_PORT}", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"})
    web = None
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": app}, token=camp), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=camp))["invite"]
        sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}))["token"]
        Q = f"?project={pid}"

        # ---------------- A: status ----------------
        s = ok(api("/publish/real" + Q, token=camp), "status")
        assert s["kind"] == "game" and s["sensed"] == "game" and s["canSend"] and not s["github"]["signedIn"], s
        by = {c["id"]: c for c in s["checks"]}
        assert by["index"]["ok"] and by["loads"]["ok"] and by["canvas"]["ok"] and by["size"]["ok"], by
        assert all(not by[k]["ok"] and by[k]["auto"] for k in ("name", "desc", "phone", "icon")), "missing basics are filled in on publish, and said so"
        assert s["next"] == "publish" and s["itch"]["ok"] and not s["dest"]["pages"] and s["dest"]["pwa"], s
        s2 = ok(api("/publish/real", "PUT", {"project": pid, "kind": "site"}, token=camp)); assert s2["kind"] == "site" and "canvas" not in {c["id"] for c in s2["checks"]}
        ok(api("/publish/real", "PUT", {"project": pid, "kind": "game", "color": "#38C6B1"}, token=camp))

        # ---------------- Z: the zip ----------------
        before = Path(app, "index.html").read_text()
        z = zipfile.ZipFile(io.BytesIO(ok(api("/publish/real/zip" + Q + "&for=web&title=Star%20Hopper&desc=Hop%20between%20stars.", token=camp, binary=True), "zip")))
        assert z.testzip() is None
        names = set(z.namelist())
        assert {"index.html", "game.js", "art/ship.svg", "manifest.webmanifest", "sw.js", "icons/icon-192.png", "icons/icon-512.png"} <= names, names
        assert not any(n.startswith((".", "node_modules/", "android/")) or n in ("id_rsa",) for n in names), names
        html = z.read("index.html").decode()
        assert 'name="viewport"' in html and 'name="description"' in html and "<title>Star Hopper</title>" in html and 'rel="manifest"' in html and "serviceWorker" in html and 'rel="icon"' in html, html[:600]
        man = json.loads(z.read("manifest.webmanifest"))
        assert man["name"] and man["short_name"] and man["display"] == "standalone" and man["start_url"] and man["theme_color"].lower() == "#38c6b1", man
        sizes = {i["sizes"]: i for i in man["icons"]}
        assert "192x192" in sizes and "512x512" in sizes and all(i["type"] == "image/png" for i in (sizes["192x192"], sizes["512x512"])), man["icons"]
        assert png_size(z.read("icons/icon-192.png")) == (192, 192) and png_size(z.read("icons/icon-512.png")) == (512, 512)
        assert "fetch" in z.read("sw.js").decode() and "caches" in z.read("sw.js").decode()
        assert b"hunter2" not in b"".join(z.read(n) for n in names)
        assert Path(app, "index.html").read_text() == before and not Path(app, "sw.js").exists(), "the project's own files are not changed"

        # ---------------- I: the itch.io zip ----------------
        zi = zipfile.ZipFile(io.BytesIO(ok(api("/publish/real/zip" + Q + "&for=itch", token=camp, binary=True), "itch zip")))
        ni = zi.namelist()
        assert "index.html" in ni and "sw.js" not in ni and "manifest.webmanifest" not in ni, ni
        assert len(ni) <= 1000 and all(len(n) <= 240 and not n.startswith("/") and ".." not in n for n in ni)
        assert 'name="viewport"' in zi.read("index.html").decode() and "serviceWorker" not in zi.read("index.html").decode()

        # ---------------- G: GitHub Pages ----------------
        st, d = api("/publish/real/pages", "POST", {"project": pid, "title": "Star Hopper", "desc": "Hop between stars before the fuel runs out."}, token=camp)
        assert st == 401 and d["needGithub"], (st, d)
        assert not ghmock.STATE["calls"], "nothing is sent to GitHub without a sign-in"
        ok(api("/github/token", "POST", {"token": TOKEN}, token=camp), "sign in")
        assert ok(api("/publish/real" + Q, token=camp))["github"] == {"signedIn": True, "login": "Camp-Test"}
        ghmock.STATE["pages_allowed"] = False
        r = ok(api("/publish/real/pages", "POST", {"project": pid, "title": "Star Hopper", "desc": "Hop between stars before the fuel runs out."}, token=camp), "publish")
        full = "Camp-Test/star-hopper"
        assert r["repo"] == full and r["created"] and r["url"] == "https://camp-test.github.io/star-hopper/" and r["version"] == 1, r
        assert r["pagesEnabled"] is False and r["settingsUrl"] == f"https://github.com/{full}/settings/pages", "the two-click step when the API can't turn the page on"
        t = ghmock.tree_of(full)
        assert {"index.html", "game.js", "art/ship.svg", ".nojekyll", ".tribecode.json", "manifest.webmanifest", "sw.js", "icons/icon-192.png"} <= set(t), sorted(t)
        assert ".env" not in t and "id_rsa" not in t and not any(p.startswith(".github/") for p in t), "no secrets, and the project's own build files don't ride along"
        assert b"Star Hopper" in t["index.html"] and b"Hop between stars" in t["index.html"] and json.loads(t[".tribecode.json"])["madeWith"] == "TribeCode"
        assert t["art/ship.svg"].decode() == SHIP, "files arrive byte for byte"
        # again: same link, version 2, the page gets turned on now
        ghmock.STATE["pages_allowed"] = True
        Path(app, "game.js").write_text(GAME_JS + "\n// v2")
        r2 = ok(api("/publish/real/pages", "POST", {"project": pid}, token=camp), "republish")
        assert r2["url"] == r["url"] and r2["version"] == 2 and not r2["created"] and r2["pagesEnabled"], r2
        assert b"// v2" in ghmock.tree_of(full)["game.js"] and ghmock.STATE["repos"][full]["pages"] == {"branch": "main", "path": "/"} and ghmock.STATE["repos"][full]["pushes"] == 2
        s = ok(api("/publish/real" + Q, token=sam))
        assert s["dest"]["pages"]["url"] == r["url"] and s["dest"]["pages"]["byName"] == "Camp" and s["next"] == "app" and not s["github"]["signedIn"], s
        # a name that is already theirs, and not ours, is never touched
        ghmock.STATE["repos"]["Camp-Test/thesis"] = {"head": "c0", "blobs": {}, "trees": {"t0": []}, "commits": {"c0": {"tree": "t0", "parents": []}}, "pages": None, "pushes": 0}
        st, d = api("/publish/real/pages", "POST", {"project": pid, "name": "thesis"}, token=camp)
        assert st == 409 and d["taken"] and ghmock.STATE["repos"]["Camp-Test/thesis"]["pushes"] == 0 and not ghmock.STATE["repos"]["Camp-Test/thesis"]["blobs"], (st, d)
        assert ok(api("/publish/real" + Q, token=camp))["dest"]["pages"]["repo"] == full

        # ---------------- X: wrappers ----------------
        assert ok(api("/publish/real/build" + Q, token=camp))["state"] == "none"
        w = ok(api("/publish/real/wrapper", "POST", {"project": pid, "kind": "android", "on": True}, token=camp), "android on")
        assert w["sent"] and w["dest"]["android"]["on"] and w["dest"]["android"]["pkg"] == "io.github.camp_test.star_hopper" or re.match(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$", w["dest"]["android"]["pkg"]), w
        t = ghmock.tree_of(full)
        wf = yaml.safe_load(t[".github/workflows/tribecode-android.yml"])
        trig = wf.get("on", wf.get(True))
        assert "workflow_dispatch" in trig and "push" in trig and wf["permissions"]["contents"] == "write", wf.keys()
        job = list(wf["jobs"].values())[0]
        assert job["runs-on"].startswith("ubuntu") and len(job["steps"]) >= 5 and all(("uses" in s) != ("run" in s) for s in job["steps"])
        yml = t[".github/workflows/tribecode-android.yml"].decode()
        assert "bubblewrap" in yml and "secrets.ANDROID_KEYSTORE_BASE64" in yml and "app.apk" in yml and "assetlinks.json" in yml and TOKEN not in yml
        twa = json.loads(t["android/twa-manifest.json"])
        assert twa["host"] == "camp-test.github.io" and twa["startUrl"].startswith("/star-hopper/") and twa["packageId"] == w["dest"]["android"]["pkg"] and twa["name"] == "Star Hopper" and twa["display"] == "standalone", twa
        assert twa["webManifestUrl"] == r["url"] + "manifest.webmanifest" and twa["iconUrl"].startswith(r["url"]), twa
        al = json.loads(t["android/assetlinks.template.json"]); assert al[0]["target"]["package_name"] == twa["packageId"] and al[0]["relation"] == ["delegate_permission/common.handle_all_urls"]
        b = ok(api("/publish/real/build" + Q, token=camp))
        assert b["state"] == "ready" and b["download"] == f"https://github.com/{full}/releases/latest/download/app.apk", b
        ghmock.STATE["runs"] = "failure"; assert ok(api("/publish/real/build" + Q, token=camp))["state"] == "failed"
        ghmock.STATE["runs"] = "running"; assert ok(api("/publish/real/build" + Q, token=camp))["state"] == "building"
        ghmock.STATE["runs"] = "success"
        wi = ok(api("/publish/real/wrapper", "POST", {"project": pid, "kind": "ios", "on": True}, token=camp), "ios on")
        ios = yaml.safe_load(ghmock.tree_of(full)[".github/workflows/tribecode-ios.yml"])
        assert list((ios.get("on", ios.get(True)) or {}).keys()) == ["workflow_dispatch"], "the iPhone build never starts by itself"
        ij = list(ios["jobs"].values())[0]; assert ij["runs-on"].startswith("macos") and any("secrets first" in str(s.get("run", "")) for s in ij["steps"]), "stops with a clear message until the Apple secrets are there"
        assert wi["dest"]["ios"]["on"] and ok(api("/publish/real" + Q, token=camp))["next"] == "share"
        wo = ok(api("/publish/real/wrapper", "POST", {"project": pid, "kind": "ios", "on": False}, token=camp)); assert not wo["dest"]["ios"]["on"]
        ok(api("/publish/real/pages", "POST", {"project": pid}, token=camp)); assert ".github/workflows/tribecode-ios.yml" not in ghmock.tree_of(full), "turned off = gone on the next publish"
        assert api("/publish/real/wrapper", "POST", {"project": pid, "kind": "windows", "on": True}, token=camp)[0] == 400

        # ---------------- W + U: in a browser ----------------
        site = tempfile.mkdtemp(prefix="pubreal-web-", dir="/tmp"); z.extractall(site)
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        H = functools.partial(Quiet, directory=site)
        web = http.server.ThreadingHTTPServer(("127.0.0.1", WEB_PORT), H); threading.Thread(target=web.serve_forever, daemon=True).start()
        with sync_playwright() as pw:
            br = pw.chromium.launch(executable_path="/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None, args=["--no-proxy-server"])
            # W: the zip, served anywhere, installs and opens offline
            c0 = br.new_context(); p0 = c0.new_page(); watch(p0, "zip page")
            p0.goto(f"http://localhost:{WEB_PORT}/index.html")
            p0.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=15000)
            mf = p0.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json())"); assert mf["display"] == "standalone" and len(mf["icons"]) >= 2
            assert p0.evaluate("Promise.all([...document.querySelectorAll('link[rel=manifest],link[rel=icon],link[rel=apple-touch-icon]')].map(l => fetch(l.href).then(r => r.ok))).then(a => a.every(Boolean))")
            p0.reload(); p0.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000)
            c0.set_offline(True); p0.reload(); assert p0.locator("canvas#c").count() == 1 and p0.title(), "opens with no connection"
            c0.close()

            # U: desktop, signed in (Camp)
            cd = br.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True); cd.add_init_script(settings_js("Camp", camp, pid))
            d1 = cd.new_page(); watch(d1, "desktop"); d1.goto(BASE + "/?skipIntro=1"); d1.wait_for_function("window.TribePublish && window.TribeClient && (TribeClient.state().projects || []).length > 0", timeout=20000)
            st0 = d1.evaluate("TribePublish.status()"); assert st0["next"] in ("share", "app") and st0["dest"]["pages"]["url"] == r["url"] and "token" not in json.dumps(st0).lower().replace("signedin", ""), st0
            d1.evaluate("TribePublish.open()"); d1.wait_for_selector("#pb-real .pbr-row[data-dest='android']", timeout=15000)
            assert [x.get_attribute("data-dest") for x in d1.locator("#pb-real .pbr-row").all()] == ["zip", "pages", "itch", "install", "android", "ios"]
            assert d1.locator("#pb-real [data-kind='game'].is-on").count() == 1 and r["url"] in d1.locator("#pb-real [data-dest='pages']").text_content()
            d1.wait_for_selector("#pbr-build a, #pbr-build [data-openurl], #pbr-build code", timeout=15000)
            assert "releases/latest/download/app.apk" in d1.locator("#pb-real [data-dest='android']").inner_html(), "the Android download link"
            assert "Mac" in d1.locator("#pb-real [data-dest='ios']").text_content(), "honest about the iPhone"
            txt = d1.locator("#pb-real").text_content()
            assert not re.search(r"\b(repo|repository|ship|sync|host|deploy(?! from a branch))\b", txt, re.I), re.findall(r"\b(repo|repository|ship|sync|host|deploy(?! from a branch))\b", txt, re.I)
            assert d1.evaluate("document.querySelector('.pb-sheet').scrollWidth <= document.querySelector('.pb-sheet').clientWidth + 1")
            with d1.expect_download(timeout=15000) as dl: d1.click("#pb-real [data-zip='web']")
            assert dl.value.suggested_filename.endswith(".zip") and zipfile.ZipFile(dl.value.path()).testzip() is None
            with d1.expect_download(timeout=15000) as dl: d1.click("#pb-real [data-zip='itch']")
            assert dl.value.suggested_filename.endswith("-itch.zip")
            if take: d1.locator(".pb-sheet").screenshot(path=str(SHOTS / "publish-real-desktop.png"))
            pushes = ghmock.STATE["repos"][full]["pushes"]
            d1.click("#pb-real [data-pages]"); d1.wait_for_function(f"() => true", timeout=1000)
            for _ in range(100):
                if ghmock.STATE["repos"][full]["pushes"] > pushes: break
                time.sleep(0.1)
            assert ghmock.STATE["repos"][full]["pushes"] == pushes + 1, "Update it publishes again"
            # Flint and the lesson open the same sheet at the right row
            for say, dest in [("put my game on itch", "itch"), ("make an Android app from this", "android"), ("publish my site", None)]:
                d1.keyboard.press("Escape"); d1.evaluate("document.querySelectorAll('#invite-modal [data-close]').forEach(b => b.click())")
                d1.wait_for_selector("#pb-real", state="hidden", timeout=5000)
                res = d1.evaluate("t => { const p = TribeFlintLocal.parse(t); const one = p && p.steps && p.steps[0]; TribeFlint.ask(t); return { intent: one && one.intent }; }", say)
                assert res.get("intent") == "publish.to", (say, res)
                d1.wait_for_selector("#pb-real .pbr-row", timeout=15000)
                if dest: d1.wait_for_selector(f"#pb-real .pbr-row.is-focus[data-dest='{dest}']", timeout=5000)
            cd.close()

            # U: a builder who has not signed in (Sam), on a 390 phone
            cp = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); cp.add_init_script(settings_js("Sam", sam, pid))
            m1 = cp.new_page(); watch(m1, "phone"); m1.goto(BASE + "/?skipIntro=1"); m1.wait_for_function("window.TribePublish && window.TribeClient && (TribeClient.state().projects || []).length > 0", timeout=20000)
            m1.evaluate("TribePublish.open(undefined, 'pages')"); m1.wait_for_selector("#pb-real .pbr-row.is-focus[data-dest='pages']", timeout=15000)
            assert m1.locator("#pb-real [data-gh-signin]").count() == 1, "offers the sign-in, not someone else's"
            assert m1.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('.pb-sheet').scrollWidth <= document.querySelector('.pb-sheet').clientWidth + 1"), "no sideways scroll at 390"
            assert m1.evaluate("[...document.querySelectorAll('#pb-real .btn')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 36)")
            if take: m1.screenshot(path=str(SHOTS / "publish-real-390.png"))
            cp.close(); br.close()

        log = Path(tmp, "server.log").read_text(errors="replace")
        assert TOKEN not in log and TOKEN not in Path(tmp, ".tribe", "publish-real.json").read_text(), "the sign-in never reaches the log or the publish record"
        if errors: raise AssertionError("browser errors:\n" + "\n".join(errors[:10]))
        print("e2e_publish_real: ok")
    finally:
        srv.terminate(); gh.shutdown()
        if web: web.shutdown()
        logf.close()


if __name__ == "__main__":
    main()
