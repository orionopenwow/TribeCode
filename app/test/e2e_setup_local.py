"""Optimistic setup (feat/setup-local, docs/LIGHT-HOSTING.md). On a fresh profile nothing says a server failed. Start your
first project makes the project instantly on this device (no server call) with Company basics left for later; a note and
a task are added with no server; "Where should it live?" is the optional last step. "This computer" syncs the draft into
the TribeCode server that serves the page (POST /api/import/solo; sending it twice makes no second copy). The GitHub path
runs against a mocked GitHub: the live repo shows and suggestions are mirrored as files on the tribe/suggestions branch.
Usage: python app/test/e2e_setup_local.py [--shots]   (--shots writes docs/screenshots/setup-optimistic.png, setup-where.png)
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5710 + OFF; BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
SHOT_DIR = ROOT / "docs" / "screenshots"
BAD = ("didn't start", "did not start", "Reconnecting", "failed to load tribe", "Failed to load")

def api(method, path, body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b"{}")

def health(): return api("GET", "/health")

def mock_github(ctx, log):
    """A tiny GitHub: one public repo (camp/pixel-quest), branches, commits, and the contents API on any branch."""
    files, branches = {}, {"main": "a" * 40}
    def reply(route, status, data):
        route.fulfill(status=status, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(data))
    def handle(route):
        req = route.request; u = req.url.split("api.github.com", 1)[1]; path, _, q = u.partition("?"); m = req.method
        log.append((m, path))
        if m == "OPTIONS": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT"})
        R = "/repos/camp/pixel-quest"
        if not path.startswith(R): return reply(route, 404, {"message": "Not Found"})
        rest = path[len(R):]
        if rest == "" and m == "GET": return reply(route, 200, {"full_name": "camp/pixel-quest", "default_branch": "main", "html_url": "https://github.com/camp/pixel-quest", "pushed_at": "2026-11-09T10:00:00Z"})
        if rest.startswith("/commits"): return reply(route, 200, [{"sha": "b" * 40, "commit": {"message": "Title screen\n\nmore", "author": {"date": "2026-11-09T10:00:00Z"}}}])
        if rest.startswith("/branches"): return reply(route, 200, [{"name": b} for b in branches])
        if rest.startswith("/pulls"): return reply(route, 200, [])
        if rest.startswith("/git/ref/heads/"):
            b = urllib.request.unquote(rest[len("/git/ref/heads/"):])
            return reply(route, 200, {"object": {"sha": branches[b]}}) if b in branches else reply(route, 404, {"message": "Not Found"})
        if rest == "/git/refs" and m == "POST":
            d = json.loads(req.post_data); branches[d["ref"].replace("refs/heads/", "")] = d["sha"]; return reply(route, 201, {"ref": d["ref"]})
        if rest.startswith("/contents/"):
            p = urllib.request.unquote(rest[len("/contents/"):])
            if m == "GET":
                br = dict(x.split("=") for x in q.split("&") if "=" in x).get("ref", "main"); br = urllib.request.unquote(br)
                f = files.get((br, p)); return reply(route, 200, {"sha": f["sha"], "content": f["content"]}) if f else reply(route, 404, {"message": "Not Found"})
            if m == "PUT":
                assert (req.headers.get("authorization") or "").startswith("Bearer "), "writes carry the token"
                d = json.loads(req.post_data); files[(d["branch"], p)] = {"sha": "s%d" % len(files), "content": d["content"]}
                return reply(route, 201, {"content": {"path": p}})
        return reply(route, 404, {"message": "Not Found"})
    ctx.route("https://api.github.com/**", handle)
    return files, branches

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-su-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors, server_calls = [], []
    try:
        for _ in range(80):
            try: health(); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---------- 1. fresh profile: no error cards, no "Reconnecting" ----------
            ctx = b.new_context(viewport={"width": 1280, "height": 820})
            gh_log = []; gh_files, gh_branches = mock_github(ctx, gh_log)
            # an old sign-in to this computer's server that never became a tribe here must not show "Reconnecting…"
            ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
            pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub")
            pg.wait_for_function("window.TribeLocalSetup && window.TribeLocalFiles && window.TribeApp && TribeApp.fresh()", timeout=15000)
            pg.wait_for_selector("#view-hub:not(.hidden) #hub-host", timeout=10000)
            time.sleep(0.8)
            body = pg.evaluate("document.body.innerText")
            for w in BAD: assert w not in body, f"fresh profile shows {w!r}"
            assert pg.locator("#hub-host-err").count() == 0, "no error card before setup"
            assert health()["members"] == 0

            # ---------- 2. create a project optimistically: instant, no server call ----------
            pg.on("request", lambda r: f":{PORT}/api/" in r.url and server_calls.append(r.method + " " + r.url))
            pg.click("#hub-host")   # the one create flow (tribenew.js): name and icon, then This device
            pg.wait_for_selector("#tn #tn-name", state="visible")
            pg.fill("#tn-name", "Pixel Quest")
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup-optimistic.png"))
            pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']")
            if SHOTS: time.sleep(0.3); pg.screenshot(path=str(SHOT_DIR / "setup-where.png"))
            t0 = time.time(); pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go")
            pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=5000)
            assert time.time() - t0 < 3, "creating is instant"
            st = pg.evaluate("TribeOffline.state()")
            pid = st["projects"][0]["id"]
            assert st["projects"][0]["name"] == "Pixel Quest", st["projects"]
            pg.wait_for_selector("#tn[data-step='3'] #tn-skip", timeout=8000); pg.click("#tn-skip"); pg.wait_for_selector("#tn", state="detached", timeout=5000)

            # ---------- 3. a note and a task, offline (nothing reaches the server) ----------
            pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Sketch the title screen' } })")
            pg.evaluate("TribeClient.api('/docs', { method: 'POST', body: { title: 'Ideas', body: '# Ideas\\n\\n- lanterns' } })")
            pg.wait_for_function(f"(TribeOffline.state().tasks['{pid}'] || []).length === 1 && (TribeOffline.state().docs['{pid}'] || []).length === 1", timeout=5000)
            assert not server_calls, f"nothing went to the server before a home was chosen: {server_calls[:5]}"
            assert health()["members"] == 0
            pg.reload(); pg.wait_for_function("window.TribeOffline && TribeOffline.solo() && TribeClient.connected()", timeout=15000)
            pg.wait_for_selector("#share-card[data-where='browser']", state="visible", timeout=8000)
            assert "saved in this browser" in pg.text_content("#sc-line")
            body = pg.evaluate("document.body.innerText")
            for w in BAD: assert w not in body, f"the local project shows {w!r}"

            # ---------- 4. the GitHub path (mocked GitHub) ----------
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where")
            pg.click("#su-where [data-su='github']")
            pg.wait_for_selector("#su-gh-guide", timeout=10000); pg.click("#su-gh-ro")   # feat/tasks-company: not signed in yet → the guide; the token goes in the sheet
            pg.wait_for_selector("#su-github #su-gh-repo")
            pg.fill("#su-gh-repo", "https://github.com/camp/pixel-quest"); pg.fill("#su-gh-tok", "github_pat_test")
            pg.click("#su-gh-go")
            pg.wait_for_selector("#su-github .su-live", timeout=10000)
            assert "camp/pixel-quest" in pg.text_content("#su-github .su-live") and "Title screen" in pg.text_content("#su-github .su-live")
            assert "tribe/suggestions" in gh_branches, gh_branches
            paths = {p for (br, p) in gh_files if br == "tribe/suggestions"}
            assert {".tribe/README.md", ".tribe/project.md", ".tribe/tasks.md", ".tribe/docs/ideas.md"} <= paths, paths
            tasks_md = base64.b64decode(gh_files[("tribe/suggestions", ".tribe/tasks.md")]["content"]).decode()
            assert "- [ ] Sketch the title screen" in tasks_md, tasks_md
            assert "Pixel Quest" in base64.b64decode(gh_files[("tribe/suggestions", ".tribe/project.md")]["content"]).decode()
            n_put = sum(1 for m, _ in gh_log if m == "PUT")
            pg.evaluate("TribeLocalSetup.github.mirror()")   # unchanged files are not written again
            assert sum(1 for m, _ in gh_log if m == "PUT") == n_put, "mirroring again writes nothing new"
            assert pg.evaluate("localStorage.getItem('tribecode.light.ghToken')") == "github_pat_test"
            assert "github_pat_test" not in json.dumps(pg.evaluate("TribeOffline.exportSolo()")), "the token never goes into the project"
            pg.evaluate("TribeLocalSetup.close()"); time.sleep(0.3)
            # the live repo state shows on the project
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#su-home-live .su-live", timeout=8000)
            assert "camp/pixel-quest" in pg.text_content("#su-home-live")
            assert not [c for c in server_calls if "/api/github/detect" not in c], f"GitHub mode needs no server (only the optional sign-in check asks this computer): {server_calls[:5]}"

            # ---------- 5. This computer: the draft syncs into the server serving this page ----------
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where")
            pg.click("#su-where [data-su='computer']")
            for _ in range(80):   # the page reloads into the tribe on this computer
                try:
                    if pg.evaluate("!!(window.TribeClient && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active()))"): break
                except Exception: pass
                time.sleep(0.25)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active())", timeout=20000)
            token = pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server.token")
            assert token and token != "offline-demo", token
            assert pg.evaluate("localStorage.getItem('tribecode.offlineDemo.v1')") is None, "the local copy goes once the host confirmed"
            projs = [x for x in api("GET", "/projects", token=token)["projects"] if x["name"] == "Pixel Quest"]
            assert len(projs) == 1, projs
            ppid = projs[0]["id"]
            tasks = api("GET", "/tasks", token=token, project=ppid)["tasks"]
            assert any(t["title"] == "Sketch the title screen" for t in tasks), tasks
            docs = api("GET", "/docs", token=token, project=ppid)["docs"]
            assert any(d["title"] == "Ideas" for d in docs), docs
            # idempotent: the same draft again returns the first result, no second copy
            again = api("POST", "/import/solo", {"draftId": "d-repeatme12", "projects": [{"name": "Twice"}]}, token=token)
            again2 = api("POST", "/import/solo", {"draftId": "d-repeatme12", "projects": [{"name": "Twice"}]}, token=token)
            assert again2.get("again") and again2["projects"][0]["id"] == again["projects"][0]["id"]
            assert len([x for x in api("GET", "/projects", token=token)["projects"] if x["name"] == "Twice"]) == 1
            body = pg.evaluate("document.body.innerText")
            assert "didn't start" not in body and "did not start" not in body
            ctx.close(); b.close()
        bad = [e for e in errors if "ResizeObserver" not in e and "api.github.com" not in e]
        assert not bad, bad
        print("ok e2e_setup_local (fresh profile calm, instant project from the one create flow, offline note + task, GitHub mirror + live state (mocked), This computer sync, idempotent import)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
