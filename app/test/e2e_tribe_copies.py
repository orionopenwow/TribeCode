"""Copies of the tribe (fix/p12-copies, app/ui/tribecopy.js, server/tribecopy.js).
Two tribe servers, A and B.
1. A saved copy (GET /api/tribe/copy) has the projects, tasks, docs, chat and website, and never a key/token or someone
   else's direct messages.
2. Opening it in a fresh tribe (B) through TribeCopy.open brings everything over, and B's empty first project takes it:
   one project, not an empty "My Tribe" beside it (the same path a browser -> computer move takes).
3. Show a friend: the read-only link opens on the friend's side (read-only tag, website preview, no Make-my-own-copy
   without a tap) and Make my own copy adds a credited project to the friend's tribe.
4. A browser-only tribe saves one .tribe download, with no secrets.
5. Moving: the host says the new address; everyone who opens the old place sees "moved" with one button.
Usage: python app/test/e2e_tribe_copies.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PA, PB = 5660 + OFF, 5740 + OFF
A, B = f"http://localhost:{PA}", f"http://localhost:{PB}"
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


def start(port, tmp, name):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_REVEAL": "1", "NO_PROXY": "127.0.0.1,localhost"}
    p = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp / name), "--ollama", "http://localhost:9"], stdout=open(tmp / f"{name}.log", "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(120):
        try:
            if api(f"http://localhost:{port}", "/health")[0] == 200: return p
        except Exception: pass
        time.sleep(0.2)
    raise SystemExit(f"server {name} did not start")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-copies-", dir="/tmp")); errors = []
    sa, sb = start(PA, tmp, "a"), start(PB, tmp, "b")
    try:
        camp = ok(api(A, "/bootstrap", "POST", {"name": "Camp"}))["token"]
        def join(base, host, name):
            inv = ok(api(base, "/invites", "POST", {}, token=host))["invite"]; j = ok(api(base, "/join", "POST", {"code": inv["code"], "name": name})); return j["token"], j["member"]["id"]
        maya, maya_id = join(A, camp, "Maya"); theo, theo_id = join(A, camp, "Theo")
        pid = (lambda p: (p.get("project") or p)["id"])(ok(api(A, "/projects", "POST", {"name": "Lantern Run", "emoji": "🏮"}, token=camp)))
        ok(api(A, "/tasks", "POST", {"title": "Draw the lantern sprite"}, token=camp, project=pid))
        ok(api(A, "/docs", "POST", {"title": "Plan", "body": f"Ship the first level. token={SECRET}"}, token=camp, project=pid))
        ok(api(A, "/chat/general", "POST", {"text": "lanterns at dusk"}, token=camp, project=pid))
        dm = "dm-" + "-".join(sorted([maya_id, theo_id]))
        api(A, f"/chat/{dm}", "POST", {"text": "PRIVATE-WORD between maya and theo"}, token=maya)
        site = json.loads(subprocess.check_output(["node", "-e", "const S=require('./app/ui/sitecfg.js');process.stdout.write(JSON.stringify(S.normalize({name:'Lantern Run'})))"], cwd=ROOT))
        site["apiToken"] = "should-not-leave"
        ok(api(A, f"/projects/{pid}/site-config", "PUT", {"config": site, "force": True}, token=camp))

        # 1. the saved copy: projects in, secrets and others' DMs out
        st, copy = api(A, "/tribe/copy", token=camp)
        assert st == 200 and copy["format"] == "tribecode-tribe", (st, str(copy)[:200])
        txt = json.dumps(copy)
        lr = [p for p in copy["projects"] if p["name"] == "Lantern Run"]; assert lr, [p["name"] for p in copy["projects"]]
        lr = lr[0]
        assert any(t["title"] == "Draw the lantern sprite" for t in lr["tasks"]), lr["tasks"]
        assert any(d["title"] == "Plan" for d in lr["docs"]), lr["docs"]
        assert any("lanterns at dusk" in m["text"] for m in lr["chat"]), lr["chat"]
        assert lr.get("designs", {}).get("site"), "the website should come along"
        assert SECRET not in txt and "should-not-leave" not in txt and "apiToken" not in txt, "a secret leaked into the copy"
        assert "PRIVATE-WORD" not in txt, "someone's direct messages leaked into the copy"
        assert "PRIVATE-WORD" not in json.dumps(api(A, "/tribe/copy", token=maya)[1]), "DMs never go in a copy, even your own"
        assert api(A, "/tribe/copy", "POST", {}, token=camp)[0] == 405

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(base, token, name, accept_downloads=False):
                c = b.new_context(viewport={"width": 1280, "height": 860}, accept_downloads=accept_downloads)
                srv = f"{{url: '{base}', token: '{token}'}}" if token else "{url: '', token: ''}"
                c.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: %s})); } catch (e) {}" % (name, srv))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(base + "/?skipIntro=1", wait_until="domcontentloaded", timeout=60000)
                pg.wait_for_function("window.TribeCopy && window.TribeUI && window.TribeClient", timeout=45000)
                if token: pg.wait_for_function("TribeClient.connected()", timeout=30000)
                return pg

            # 2. open the copy in a fresh tribe (B): everything arrives, one project (the empty first one took it)
            bob = ok(api(B, "/bootstrap", "POST", {"name": "Bo"}))["token"]
            before = ok(api(B, "/projects", token=bob))["projects"]; assert len(before) == 1, before
            one = {**copy, "projects": [lr]}
            pb = page(B, bob, "Bo")
            r = pb.evaluate("t => TribeCopy.open(new File([t], 'lantern-run.tribe', { type: 'application/json' }))", json.dumps(one))
            assert r and r["projects"] and r["projects"][0]["tasks"] >= 1, r
            after = ok(api(B, "/projects", token=bob))["projects"]
            assert len(after) == 1 and after[0]["name"] == "Lantern Run", [x["name"] for x in after]
            nid = after[0]["id"]
            tasks = ok(api(B, "/tasks", token=bob, project=nid))["tasks"]
            assert any(t["title"] == "Draw the lantern sprite" for t in tasks), tasks
            assert ok(api(B, f"/projects/{nid}/site-config", token=bob, project=nid)).get("config"), "the website should arrive"
            # an untrusted file: not a tribe, nothing happens
            assert pb.evaluate("TribeCopy.open(new File(['{\"format\":\"zip\"}'], 'x.tribe'))") is None
            assert len(ok(api(B, "/projects", token=bob))["projects"]) == 1

            # 3. show a friend: a read-only link; Make my own copy is credited
            pa = page(A, camp, "Camp")
            pa.evaluate(f"TribeCopy.showFriend('{pid}')")
            pa.wait_for_selector("#tcp-show #tcp-link", state="visible")
            link = pa.input_value("#tcp-show #tcp-link"); assert "#copy=" in link, link
            assert pa.locator("#tcp-show .tcp-qr svg").count() == (1 if len(link) < 200 else 0), "a QR when the link is short enough for one"
            friend = page(B, bob, "Bo")
            friend.goto(B + "/?skipIntro=1" + link[link.index("#"):]); friend.wait_for_function("window.TribeCopy && TribeClient.connected()", timeout=30000)
            friend.wait_for_selector("#tcp-view", state="visible", timeout=15000)
            assert friend.locator("#tcp-view .tcp-tag").count() == 1
            assert "Lantern Run" in (friend.get_attribute("#tcp-frame", "srcdoc") or ""), "the website shows read-only"
            assert friend.get_attribute("#tcp-frame", "sandbox") == "", "the shared page runs no scripts"
            assert "lanterns at dusk" not in friend.inner_text("#tcp-view"), "chat stays out of a link"
            friend.click("#tcp-view [data-tcp='mine']"); friend.wait_for_selector("#tcp-view", state="detached", timeout=15000)
            mine = [x for x in ok(api(B, "/projects", token=bob))["projects"] if "my copy" in x["name"]]
            assert mine and "Camp" in (mine[0].get("bio") or ""), [(x["name"], x.get("bio")) for x in ok(api(B, "/projects", token=bob))["projects"]]

            # 4. a browser-only tribe saves one .tribe file
            solo = page(A, None, "Rae", accept_downloads=True)
            solo.evaluate("TribeOffline.start('solo')"); solo.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=20000)
            solo.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Sketch the map' } })")
            with solo.expect_download(timeout=15000) as dl: solo.evaluate("TribeCopy.save()")
            f = dl.value; assert f.suggested_filename.endswith(".tribe"), f.suggested_filename
            saved = json.loads(Path(f.path()).read_text())
            assert saved["format"] == "tribecode-tribe" and any(any(t["title"] == "Sketch the map" for t in p["tasks"]) for p in saved["projects"]), saved
            assert "offline-demo" not in json.dumps(saved) and "token" not in json.dumps(saved).lower(), "no keys in a saved file"
            solo.wait_for_selector("#tcp-saved", state="visible")
            assert solo.evaluate("TribeCopy.line()").startswith("Kept in this browser")

            # 5. moving: the old place points everyone to the new address
            assert api(A, "/tribe/moved", "PUT", {"url": "http://not-https"}, token=camp)[0] == 400
            assert api(A, "/tribe/moved", "PUT", {"url": B}, token=maya)[0] == 403
            ok(api(A, "/tribe/moved", "PUT", {"url": "https://lantern.example.org"}, token=camp))
            assert ok(api(A, "/tribe/folder", token=maya))["movedTo"] == "https://lantern.example.org"
            pm = page(A, maya, "Maya"); pm.evaluate("TribeCopy.movedBanner()")
            pm.wait_for_selector("#tcp-moved a[href='https://lantern.example.org']", timeout=10000)
            pa.evaluate("TribeCopy.move()"); pa.wait_for_selector("#tcp-move .tcp-step", state="visible")
            assert pa.locator("#tcp-move .tcp-step").count() == 4
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("tribe copies: OK")
    finally:
        for p in (sa, sb): p.terminate()


if __name__ == "__main__":
    main()
