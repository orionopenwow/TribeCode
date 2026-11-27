"""The tribe's folder on the Desktop (p13, server/tribefolder.js, app/ui/tribefolder.js).
TRIBE_DESKTOP points at a temp folder: nothing here touches the real Desktop.
1. A new tribe gets Desktop/<Tribe>/ with README.md, a primed .gitignore and a folder per project that is a git repo with
   a first commit; a name taken by a folder that isn't ours gets " 2" and the other folder is left alone.
2. Creating a project in the one create flow shows "Saved on your Desktop · Open folder · Change" and makes its folder.
3. An edit made outside TribeCode shows up (a folder-change event, and it counts as a change to send); an edit made in
   TribeCode lands as a file.
4. <Tribe>.tribe is written and refreshed, with no secrets.
5. The open-folder endpoint opens only the tribe's own folder.
6. A friend's copy saved through their own TribeCode becomes a folder with the .tribe file, scrubbed.
7. Without TRIBE_DESKTOP a test server makes no Desktop folder.
Usage: python app/test/e2e_tribe_folder.py
"""
import json, os, shutil, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PA, PB = 5660 + OFF, 5740 + OFF
A, B = f"http://localhost:{PA}", f"http://localhost:{PB}"
SHOTS = Path(os.environ.get("TRIBE_SHOTS", str(ROOT / "docs" / "screenshots")))
SECRET = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"


def api(base, path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(base + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r):
    assert r[0] == 200, r
    return r[1]


def start(port, tmp, name, extra):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_REVEAL": "1", "NO_PROXY": "127.0.0.1,localhost", **extra}
    if "TRIBE_DESKTOP" not in extra: env.pop("TRIBE_DESKTOP", None)
    p = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp / name), "--ollama", "http://localhost:9"], stdout=open(tmp / f"{name}.log", "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(120):
        try:
            if api(f"http://localhost:{port}", "/health")[0] == 200: return p
        except Exception: pass
        time.sleep(0.2)
    raise SystemExit(f"server {name} did not start")


def until(fn, secs=12, msg="timed out"):
    end = time.time() + secs
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.25)
    raise AssertionError(msg)


def listing(d):
    try: return sorted(os.listdir(d))
    except Exception: return None


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-folder-", dir="/tmp")); errors = []
    desk = tmp / "Desktop"; desk.mkdir()
    (desk / "My Tribe").mkdir(); (desk / "My Tribe" / "mine.txt").write_text("not TribeCode's")   # a folder that isn't ours
    real_desk = Path.home() / "Desktop"; before = listing(real_desk)
    sa = start(PA, tmp, "a", {"TRIBE_DESKTOP": str(desk), "TRIBE_DESKTOP_COPY_MS": "300"})
    sb = None
    SHOTS.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1300, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            pg.goto(A + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project()", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token"); assert tok

            # 1. the folder, with " 2" beside a folder that isn't ours
            d = until(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("exists") else None)(api(A, "/tribe/desktop", token=tok)), 15, "the tribe folder was not made")
            assert d["display"] == "Desktop/My Tribe 2", d
            assert (desk / "My Tribe" / "mine.txt").read_text() == "not TribeCode's" and listing(desk / "My Tribe") == ["mine.txt"], "the other folder is left alone"
            tf = desk / "My Tribe 2"
            gi = (tf / ".gitignore").read_text()
            for k in ["node_modules/", ".env", "*.pem", "*.key", "id_rsa*", "secrets/", ".tribe/", ".DS_Store"]: assert k in gi, k
            assert "How friends get it" in (tf / "README.md").read_text()
            first = until(lambda: [x for x in tf.iterdir() if x.is_dir() and not x.name.startswith(".")], 10, "no project folder")[0]
            gitlog = lambda d: subprocess.run(["git", "-C", str(d), "log", "--oneline"], capture_output=True, text=True).stdout
            until(lambda: (first / ".git").is_dir() and "Start" in gitlog(first), 10, "the project folder is a git repo with a first commit")
            assert ".env" in (first / ".gitignore").read_text()

            # 2. the one create flow: a new project, "Saved on your Desktop · Open folder · Change"
            pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn-name")
            pg.fill("#tn-name", "Lantern Crew"); pg.click("#tn-create")
            pg.wait_for_selector("#tn-desk:not([hidden])", timeout=20000)
            t = pg.text_content("#tn-desk")
            assert "Saved on your Desktop" in t and "Desktop/My Tribe 2/Lantern Crew" in t and "Open folder" in t and "Change" in t, t
            pg.screenshot(path=str(SHOTS / "tribe-folder-created.png"))
            pg.click("#tn-desk [data-tdf='open']"); time.sleep(0.5)
            lc = tf / "Lantern Crew"
            until(lambda: "Start Lantern Crew" in gitlog(lc), 10, "Lantern Crew is a repo with a first commit")
            pid = [x["id"] for x in ok(api(A, "/projects", token=tok)).get("projects", []) if x["name"] == "Lantern Crew"][0]
            pg.evaluate("TribeNew.close && TribeNew.close()")
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_function(f"TribeClient.project() === '{pid}'", timeout=10000); time.sleep(0.5)

            # 3. outside edits show up and count as changes to send; TribeCode's edits land as files
            pg.evaluate("window.__fc = []; TribeClient.on('ws', m => { if (m && m.type === 'folder-change') window.__fc.push(m); })")
            (lc / "notes.txt").write_text("written in another program")
            pg.wait_for_function("window.__fc.some(m => m.outside && (m.files || []).some(f => f.endsWith('notes.txt')))", timeout=10000)
            assert pg.evaluate(f"TribeCopies.pending().some(x => x.kind === 'folder' && x.pid === '{pid}')"), "an outside edit counts as a change to send"
            assert pg.evaluate("TribeCopies.send()") == 0, "sent (no backup: the edit is already with the tribe)"
            ok(api(A, f"/projects/{pid}/folder/file", "PUT", {"path": "docs/hello.md", "content": "# Hi from TribeCode"}, token=tok))
            assert (lc / "docs" / "hello.md").read_text() == "# Hi from TribeCode"
            r = ok(api(A, f"/projects/{pid}/folder/file?path=notes.txt", token=tok)); assert r["content"] == "written in another program"

            # 4. <Tribe>.tribe, refreshed, no secrets
            ok(api(A, "/docs", "POST", {"title": "Plan", "body": f"First level. token={SECRET}"}, token=tok, project=pid))
            copy = tf / "My Tribe 2.tribe"
            until(lambda: copy.exists() and "Plan" in copy.read_text(), 12, "the .tribe copy was not refreshed")
            text = copy.read_text(); assert SECRET not in text and json.loads(text)["format"] == "tribecode-tribe"
            assert not any(SECRET in f.read_text(errors="ignore") for f in tf.rglob("*") if f.is_file() and ".git" not in f.parts)

            # 5. open-folder: only the tribe's own folder
            for bad in ["/etc", str(desk), "../", "Lantern Crew/../../", str(tmp / "a")]:
                st, _ = api(A, "/tribe/desktop/open", "POST", {"path": bad}, token=tok); assert st in (400, 403, 404), (bad, st)
            os.symlink("/etc", tf / "sneaky")
            st, _ = api(A, "/tribe/desktop/open", "POST", {"path": "sneaky"}, token=tok); assert st in (400, 403), st
            (tf / "sneaky").unlink()
            assert ok(api(A, "/tribe/desktop/open", "POST", {"path": "Lantern Crew"}, token=tok))["display"] == "Desktop/My Tribe 2/Lantern Crew"
            assert ok(api(A, "/tribe/desktop/open", "POST", {}, token=tok))["display"] == "Desktop/My Tribe 2"
            assert api(A, "/tribe/desktop/open", "POST", {})[0] == 401
            inv = ok(api(A, "/invites", "POST", {}, token=tok))["invite"]; maya = ok(api(A, "/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
            assert api(A, "/tribe/desktop/open", "POST", {}, token=maya)[0] == 403, "only the owner opens it"
            assert not ok(api(A, "/tribe/desktop", token=maya))["canOpen"]

            # Where it lives and Settings show it; phones too
            pg.evaluate("TribeWhere.open()"); pg.wait_for_selector("#whl-desk:not([hidden])", timeout=10000)
            assert "Desktop/My Tribe 2/Lantern Crew" in pg.text_content("#whl-desk")
            pg.screenshot(path=str(SHOTS / "tribe-folder-where.png")); pg.evaluate("TribeWhere.close()")
            pg.evaluate("TribeSettings.open('projects')"); pg.wait_for_selector("[data-ext='desktop-folder'] .tdf:not([hidden])", timeout=10000)
            assert "Saved on your Desktop" in pg.text_content("[data-ext='desktop-folder']")
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Camp', onboarded: true, tour: {{done: true}}, server: {{url: '{A}', token: '{tok}'}}}})) }} catch (e) {{}}")
            ph.goto(A + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project()", timeout=20000)
            ph.evaluate(f"TribeWhere.open('{pid}')"); ph.wait_for_selector("#whl-desk:not([hidden])", timeout=10000)
            ph.evaluate("document.querySelector('#whl-desk').scrollIntoView({block: 'center'})"); time.sleep(0.3)
            w = ph.evaluate("(() => { const r = document.querySelector('#whl-desk').getBoundingClientRect(); return [r.left, r.right, document.documentElement.scrollWidth]; })()")
            assert w[0] >= 0 and w[1] <= 390 and w[2] <= 391, w
            ph.screenshot(path=str(SHOTS / "tribe-folder-phone.png"))
            b.close()

        # 6. a friend's copy on their own Desktop, through their own TribeCode (this computer only)
        friend = {"format": "tribecode-tribe", "version": 1, "tribe": {"name": "Maya's Crew"}, "projects": [{"key": "x", "name": "Kite", "docs": [{"title": "t", "body": SECRET}], "token": SECRET}]}
        r = ok(api(A, "/tribe/desktop/save-copy", "POST", {"copy": friend, "from": "http://maya.example:4747"}))
        assert r["display"] == "Desktop/Maya's Crew", r
        fc = (desk / "Maya's Crew" / "Maya's Crew.tribe").read_text(); assert SECRET not in fc and "Kite" in fc
        assert (desk / "Maya's Crew" / "README.md").exists() and (desk / "Maya's Crew" / ".gitignore").exists()
        assert ok(api(A, "/tribe/desktop/save-copy", "POST", {"copy": friend, "from": "http://maya.example:4747"}))["display"] == "Desktop/Maya's Crew", "the same copy again: the same folder"
        assert ok(api(A, "/tribe/desktop/save-copy", "POST", {"copy": friend, "from": "http://other.example"}))["display"] == "Desktop/Maya's Crew 2"
        assert api(A, "/tribe/desktop/save-copy", "POST", {"copy": {"format": "nope"}})[0] == 400

        # nothing outside the temp folder
        assert listing(real_desk) == before, "the real Desktop is untouched"
        assert sorted(x.name for x in desk.iterdir()) == ["Maya's Crew", "Maya's Crew 2", "My Tribe", "My Tribe 2"], list(desk.iterdir())

        # 7. a test server without TRIBE_DESKTOP makes nothing
        sb = start(PB, tmp, "b", {})
        tb = ok(api(B, "/bootstrap", "POST", {"name": "Theo"}))["token"]
        ok(api(B, "/projects", "POST", {"name": "Quiet"}, token=tb)); time.sleep(4)
        db = ok(api(B, "/tribe/desktop", token=tb)); assert not db["on"] and not db["made"], db
        assert api(B, "/tribe/desktop/make", "POST", {}, token=tb)[0] == 403
        assert listing(real_desk) == before
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_tribe_folder")
    finally:
        sa.terminate()
        if sb: sb.terminate()
        time.sleep(0.5)
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
