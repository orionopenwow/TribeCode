"""Versions in one place (feat/folder-sync, server/versions.js, app/ui/versions.js).
  1. A plain folder (no .git): saves become versions in .tribe/history; the folder never gets a .git.
  2. The timeline: who, when, message, files; the panel opens from the home pill and the project's right-click menu.
  3. Diff of a version, restore a file, restore the whole project as a new version (nothing lost), name a version,
     compare two, download a zip.
  4. A folder with its own .git uses that history; ships are marked.
Screenshot: docs/screenshots/versions.png
Usage: python3 app/test/e2e_versions.py
"""
import io, json, os, subprocess, tempfile, time, urllib.request, urllib.error, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6440 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"

def api(path, method="GET", body=None, token=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: b = x.read(); return x.status, (b if raw else json.loads(b or b"{}"))
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
    tmp = Path(tempfile.mkdtemp(prefix="tribe-versions-", dir="/tmp")); errors = []
    home = tmp / "home"; plain = home / "Sketch"; plain.mkdir(parents=True); (plain / "index.html").write_text("<h1>v1</h1>\n")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home), "TRIBE_VERSIONS_SAVE_MS": "300", "TRIBE_WATCH_DEBOUNCE_MS": "100"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait(lambda: api("/health")[0] == 200, "server")
        host = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        pid = api("/projects", "POST", {"name": "Sketch"}, token=host)[1]["project"]["id"]
        V = f"/projects/{pid}/versions"
        assert api(V, token=host)[1]["kind"] is None, "no home yet: no history"
        assert api(f"/projects/{pid}/folder", "PUT", {"path": "~/Sketch"}, token=host)[0] == 200

        # ---------- 1. a plain folder gets history in .tribe/history ----------
        st, d = api(V, "POST", {"message": "First look"}, token=host); assert st == 200 and d["version"], d
        assert (plain / ".tribe" / "history" / "HEAD").exists() and not (plain / ".git").exists(), "history without touching the folder's git"
        api(f"/projects/{pid}/folder/file", "PUT", {"path": "index.html", "content": "<h1>v2</h1>\n"}, token=host)
        wait(lambda: len(api(V, token=host)[1]["list"]) == 2, "a save becomes a version by itself")
        (plain / "style.css").write_text("h1 { color: teal }\n")   # an outside edit
        wait(lambda: len(api(V, token=host)[1]["list"]) == 3, "an outside edit becomes a version too")
        d = api(V, token=host)[1]; assert d["kind"] == "history", d
        top = d["list"][0]; assert top["author"] and top["at"] and top["files"] == 1 and "style.css" in top["message"], top
        assert not any(".tribe" in f["path"] for v in d["list"] for f in api(f"{V}/{v['sha']}", token=host)[1]["files"]), ".tribe never in history"
        v1, v2, v3 = d["list"][2]["sha"], d["list"][1]["sha"], d["list"][0]["sha"]

        # ---------- 3. diff, restore a file, restore all, name, compare, zip ----------
        diff = api(f"{V}/{v2}/diff?path=index.html", token=host)[1]["diff"]; assert "-<h1>v1</h1>" in diff and "+<h1>v2</h1>" in diff, diff
        st, d = api(f"{V}/{v1}/restore-file", "POST", {"path": "index.html"}, token=host); assert st == 200, d
        assert (plain / "index.html").read_text() == "<h1>v1</h1>\n" and (plain / "style.css").exists(), "one file back, the rest untouched"
        assert api(f"{V}/{v1}/restore-file", "POST", {"path": "../etc/passwd"}, token=host)[0] == 400
        n = len(api(V, token=host)[1]["list"])
        st, d = api(f"{V}/{v1}/restore", "POST", {}, token=host); assert st == 200, d
        assert not (plain / "style.css").exists() and (plain / "index.html").read_text() == "<h1>v1</h1>\n", "the whole project as it was"
        lst = api(V, token=host)[1]["list"]; assert len(lst) > n and lst[0]["message"].startswith("Restore the project"), "a new version on top"
        assert any(v["sha"] == v3 for v in lst), "nothing after it was thrown away"
        st, d = api(f"{V}/{v2}/tag", "POST", {"name": "v1 demo"}, token=host); assert st == 200 and d["ref"] == "v1-demo", d
        assert next(v for v in api(V, token=host)[1]["list"] if v["sha"] == v2)["tags"] == ["v1 demo"]
        c = api(f"{V}/compare?a={v1}&b={v3}", token=host)[1]; assert {f["path"] for f in c["files"]} == {"index.html", "style.css"}, c["files"]
        st, z = api(f"{V}/{v3}/zip", token=host, raw=True); assert st == 200
        names = zipfile.ZipFile(io.BytesIO(z)).namelist(); assert "style.css" in names and "index.html" in names and not any(x.startswith(".tribe") for x in names), names

        # ---------- 4. a folder with its own git; ships are marked ----------
        g = home / "Game"; g.mkdir(); (g / "a.txt").write_text("a\n")
        pid2 = api("/projects", "POST", {"name": "Game"}, token=host)[1]["project"]["id"]
        api(f"/projects/{pid2}/folder", "PUT", {"path": "~/Game", "gitInit": True}, token=host)
        bare = tmp / "share"; bare.mkdir()
        assert api(f"/projects/{pid2}/sync", "PUT", {"kind": "folder", "shared": str(bare)}, token=host)[0] == 200
        assert api(f"/projects/{pid2}/sync/ship", "POST", {"message": "Ship a"}, token=host)[1]["shipped"]
        d = api(f"/projects/{pid2}/versions", token=host)[1]; assert d["kind"] == "git" and d["list"][0]["shipped"] and d["list"][0]["message"] == "Ship a", d
        assert not (g / ".tribe" / "history").exists()

        # ---------- 2. the panel ----------
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.setItem('tribecode.project:%s', '%s'); localStorage.setItem('tribecode.firstrun.done', '1') } catch (e) {}" % (BASE, host, BASE, pid))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeVersions && window.TribeHome", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_selector("#home-pill:not(.hidden)", timeout=15000)
            pg.click("#home-pill"); pg.click("#hp-versions"); pg.wait_for_selector("#vr [data-sha]")
            assert "plain folder" in pg.inner_text("#vr-sub")
            assert pg.locator("#vr [data-sha]").count() >= 5 and "v1 demo" in pg.inner_text("#vr-list")
            pg.wait_for_selector("#vr-detail [data-restore-file]")
            pg.click(f"#vr [data-sha='{v2}']"); pg.wait_for_function("document.querySelector('#vr-detail h4') && document.querySelector('#vr-detail .vr-files').textContent.includes('index.html')")
            pg.click("#vr-detail [data-diff='index.html']"); pg.wait_for_selector("#vr-diff-box .vr-diff .add")
            pg.check(f"#vr [data-cmp='{v1}']"); pg.check(f"#vr [data-cmp='{v3}']"); pg.wait_for_function("document.querySelector('#vr-detail .eyebrow').textContent === 'Compare'")
            pg.click(f"#vr [data-sha='{v2}']"); pg.wait_for_selector("#vr-diff-all"); pg.click("#vr-diff-all"); pg.wait_for_selector("#vr-diff-box .vr-diff")
            with pg.expect_download() as dl: pg.click("#vr-zip")
            assert dl.value.suggested_filename.endswith(".zip")
            pg.wait_for_timeout(250); SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "versions.png"))
            pg.keyboard.press("Escape"); pg.wait_for_selector("#vr", state="detached")
            # the project's right-click menu
            pg.click(f"#pj-rail [data-pj-open='{pid}']", button="right"); pg.click("#rail-menu [data-rc='versions']"); pg.wait_for_selector("#vr [data-sha]")
            b.close()
        assert not errors, errors
        print("e2e_versions: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
