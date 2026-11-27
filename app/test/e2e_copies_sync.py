"""Every friend keeps a copy; send and get; Backup on GitHub (p12, docs/COPIES.md, app/ui/copies.js).
  1. two members: the friend goes offline, opens App Creator from this device's copy and changes one block; the host
     changes a different block; back online, the two go together by themselves (nothing to choose);
  2. the same block changed on both sides: "Two people changed this" with Keep mine / Keep theirs / Keep both, and Keep
     both keeps the two;
  3. counts and buttons by the tribe status: "1 change to send" while offline (and "· 1 to send" under the name),
     "Up to date · just now" after, Send my changes / Get the latest, and who sent what;
  4. Backup on GitHub turned on from its card: the next save puts the real design files on "GitHub" (a local bare git
     repo stands in for github.com: TRIBE_GITHUB_GIT), with no .env, no .tribe/ and no key in them;
  5. the host's computer goes off: the friend gets the latest from the backup ("api.github.com" answered in the page from
     that bare repo) and App Creator opens it.
GitHub's real API is never called. Usage: python app/test/e2e_copies_sync.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5650 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'copies-{name}.png'))

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=8) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait(fn, msg, secs=20):
    end = time.time() + secs
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError(msg)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-copies-", dir="/tmp"))
    remotes = tmp / "remotes"; (remotes / "camp").mkdir(parents=True)
    bare = remotes / "camp" / "pixel.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(bare)], check=True)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_GITHUB_GIT": str(remotes), "TRIBE_SYNC_SAVE_MS": "300",
           "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
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
            host = b.new_page(viewport={"width": 1300, "height": 820}); host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCopies && window.TribeAppCore", timeout=20000)
            htok = host.evaluate("TribeStore.get().server.token"); pid = host.evaluate("TribeClient.project()")
            assert pid, "a project"
            q = lambda: api(f"/projects/{pid}/app-config", token=htok)[1]
            st, r = api(f"/projects/{pid}/app-config", "PUT", {"config": host.evaluate("TribeAppCore.normalize(TribeAppCore.template('habits'))"), "base": 0}, htok)
            assert st == 200, (st, r)
            blocks = q()["config"]["screens"][0]["blocks"]; head, lst = blocks[0]["id"], blocks[2]["id"]
            def put(edit):   # the host changes the app (as App Creator would)
                cur = q(); doc = cur["config"]; edit(doc)
                s2, r2 = api(f"/projects/{pid}/app-config", "PUT", {"config": doc, "base": cur["rev"]}, htok); assert s2 == 200, (s2, r2)
            def blk(doc, bid): return next(x for x in doc["screens"][0]["blocks"] if x["id"] == bid)

            inv = api("/invites", "POST", {"maxUses": 5}, htok)[1]["invite"]["code"]
            fctx = b.new_context(viewport={"width": 1300, "height": 820}); fr = fctx.new_page(); fr.on("pageerror", lambda e: errors.append(f"friend: {e}"))
            fr.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")
            # offline emulation does not drop an open socket: keep a handle so going offline can close it, as a lost network would
            fr.add_init_script("(() => { const W = window.WebSocket; window.__socks = []; const F = function (u, p) { if (window.__off) u = 'ws://127.0.0.1:9/'; const s = p ? new W(u, p) : new W(u); window.__socks.push(s); return s; }; F.prototype = W.prototype; ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(k => F[k] = W[k]); window.WebSocket = F; })()")
            fr.goto(f"{BASE}/join/{inv}"); fr.wait_for_selector("#form:not(.hidden)"); fr.fill("#name", "Maya"); fr.click("#go")
            fr.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCopies && window.TribeStatus", timeout=20000)
            fr.wait_for_function(f"TribeClient.project() === '{pid}'", timeout=10000)
            def open_apc(): fr.evaluate(f"void TribeAppCreator.open({{ pid: '{pid}' }})"); fr.wait_for_selector("#apc .apc-edit .ax-screen", timeout=10000)
            def go_offline():
                fctx.set_offline(True); fr.evaluate("window.__off = true; window.__socks.forEach(s => { try { s.close(); } catch (e) {} })"); fr.wait_for_function("TribeClient.state().status !== 'online'", timeout=20000)
            def go_online():
                fctx.set_offline(False); fr.evaluate("window.__off = false; dispatchEvent(new Event('online'))"); fr.wait_for_function("TribeClient.state().status === 'online'", timeout=30000)

            # ---------- 1. offline, different blocks: put together by themselves ----------
            open_apc(); fr.evaluate("TribeAppCreator.close()"); fr.wait_for_timeout(300)   # the copy and the version it started from
            go_offline()
            open_apc()   # opens from this device's copy, with the tribe unreachable
            assert fr.evaluate("TribeAppCreator.doc().screens[0].blocks[0].id") == head
            fr.evaluate(f"TribeAppCreator.apply({{ op: 'text', block: '{head}', path: 'title', value: 'Mine offline' }})")
            fr.wait_for_function("/on this device/i.test((document.querySelector('#apc-saved') || {}).textContent || '')", timeout=15000)
            fr.evaluate("TribeAppCreator.close()"); fr.wait_for_timeout(300)
            # ---------- 3a. counts while offline ----------
            assert fr.evaluate("TribeStatus.copyLine().n") >= 1, fr.evaluate("TribeCopies.pending()")
            fr.wait_for_function("/to send/.test((document.querySelector('#ub-st') || {}).textContent || '')", timeout=10000)
            fr.click("#ub-st"); fr.wait_for_selector("#ts-copy")
            line = fr.inner_text("#ts-copy-line"); assert line in ("1 change to send",), line
            assert fr.is_enabled("#ts-copy [data-tsc='send']") and "Get the latest" in fr.inner_text("#ts-copy")
            shot(fr, "offline-count"); fr.keyboard.press("Escape")
            put(lambda d: blk(d, lst)["props"].__setitem__("title", "Theirs"))
            go_online()
            wait(lambda: blk(q()["config"], head)["props"]["title"] == "Mine offline" and blk(q()["config"], lst)["props"]["title"] == "Theirs", "different blocks put together by themselves", 25)
            fr.wait_for_function("TribeStatus.copyLine().n === 0", timeout=15000)
            print("ok  1. offline edit + a friend's edit to another block: put together, nothing to choose")

            # ---------- 2. the same block: the choice ----------
            open_apc(); fr.evaluate("TribeAppCreator.close()"); fr.wait_for_timeout(300)
            go_offline(); open_apc()
            fr.evaluate(f"TribeAppCreator.apply({{ op: 'text', block: '{head}', path: 'title', value: 'Mine again' }})")
            fr.wait_for_function("/on this device/i.test((document.querySelector('#apc-saved') || {}).textContent || '')", timeout=15000)
            fr.evaluate("TribeAppCreator.close()"); fr.wait_for_timeout(300)
            put(lambda d: blk(d, head)["props"].__setitem__("title", "Theirs again"))
            go_online(); fr.wait_for_timeout(1800)   # the automatic send finds the same block changed and leaves it for a person
            assert fr.evaluate("TribeStatus.copyLine().n") == 1, "still waiting: it needs a choice"
            assert blk(q()["config"], head)["props"]["title"] == "Theirs again"
            fr.evaluate(f"void TribeAppCreator.open({{ pid: '{pid}' }})"); fr.wait_for_selector("#cp-choose", timeout=10000)
            txt = fr.inner_text("#cp-choose"); assert "Two people changed this" in txt and "Keep mine" in txt and "Keep theirs" in txt and "Keep both" in txt, txt
            assert "Mine again" in txt or "Theirs again" in txt or "header" in txt.lower(), txt
            shot(fr, "choose")
            fr.click("#cp-choose [data-pick='both']"); fr.wait_for_selector("#apc .apc-edit .ax-screen", timeout=10000)
            def both():
                titles = [x["props"].get("title") for x in q()["config"]["screens"][0]["blocks"]]
                return "Theirs again" in titles and "Mine again" in titles
            wait(both, "Keep both keeps the two", 20)
            fr.evaluate("TribeAppCreator.close()"); fr.wait_for_timeout(500)
            fr.wait_for_function("TribeStatus.copyLine().n === 0", timeout=15000)
            print("ok  2. the same block: Two people changed this · Keep mine / Keep theirs / Keep both, and both are kept")

            # ---------- 3b. counts and buttons, online ----------
            fr.click("#ub-st"); fr.wait_for_selector("#ts-copy")
            assert fr.inner_text("#ts-copy-line").startswith("Up to date"), fr.inner_text("#ts-copy-line")
            assert not fr.is_enabled("#ts-copy [data-tsc='send']"), "nothing to send"
            fr.click("#ts-copy [data-tsc='get']"); fr.wait_for_function("(document.querySelector('#ts-copy-line') || {}).textContent === 'Up to date · just now'", timeout=10000)
            fr.click("#ts-copy .ts-hist summary"); fr.wait_for_function("/Maya/.test(document.querySelector('#ts-hist').textContent) && /Camp/.test(document.querySelector('#ts-hist').textContent)", timeout=10000)
            assert "the app" in fr.inner_text("#ts-hist"), fr.inner_text("#ts-hist")
            shot(fr, "popover"); fr.keyboard.press("Escape")
            print("ok  3. counts by the tribe status, Send my changes / Get the latest, who sent what")

            # ---------- 4. Backup on GitHub, on, with a stand-in GitHub ----------
            st, r = api(f"/projects/{pid}/sync", "PUT", {"kind": "github", "repo": "camp/pixel", "branch": "main"}, htok); assert st == 200, (st, r)
            folder = api(f"/projects/{pid}/design-files", token=htok)[1].get("folder")
            repo_dir = (api("/projects", token=htok)[1].get("projects") or [{}])
            repo_dir = next((x.get("repo") for x in repo_dir if x.get("id") == pid), None) or folder
            assert repo_dir, "the project has a folder"
            Path(repo_dir, ".env").write_text("SECRET_KEY=never-on-github\n")
            host.evaluate(f"TribeWhere.open('{pid}', 'app')"); host.wait_for_selector("#whl-backup .ghb[data-state='off'], #whl-backup.ghb[data-state='off']", timeout=10000)
            card = host.inner_text("#whl-backup")
            assert "Backup on GitHub" in card and "every change is saved to your GitHub, so nothing is lost and friends can get the latest even when your computer is off".lower() in card.lower(), card
            assert "See it on GitHub" in card and host.get_attribute("#whl-backup .ghb-when a", "href") == "https://github.com/camp/pixel"
            host.click("#whl-backup .ghb-what summary"); w = host.inner_text("#whl-backup .ghb-what")
            assert "Never" in w and "keys" in w and "private messages" in w, w
            host.click("#whl-backup [data-ghb='on']"); host.wait_for_selector("#whl-backup[data-state='on']", timeout=10000)
            assert api(f"/projects/{pid}/sync", token=htok)[1]["status"]["mode"] == "auto"
            shot(host, "backup-on")
            put(lambda d: blk(d, lst)["props"].__setitem__("title", "Backed up"))
            def tree():
                r = subprocess.run(["git", "--git-dir", str(bare), "ls-tree", "-r", "--name-only", "main"], capture_output=True, text=True)
                return r.stdout.split() if r.returncode == 0 else []
            def has_design():
                t = tree(); ok = "app-web/app-design.json" in t
                if not ok: return False
                d = subprocess.run(["git", "--git-dir", str(bare), "show", "main:app-web/app-design.json"], capture_output=True, text=True).stdout
                return "Backed up" in d
            wait(has_design, f"the design files reach the backup: {tree()}", 40)
            t = tree()
            assert not any(x == ".env" or x.endswith("/.env") or x.startswith(".tribe") for x in t), t
            blob = subprocess.run(["git", "--git-dir", str(bare), "log", "-p", "--all"], capture_output=True, text=True).stdout
            assert "never-on-github" not in blob and htok not in blob, "no secret or key in the backup"
            host.evaluate(f"TribeGitHubConnect.backup(document.querySelector('#whl-backup'), {{ pid: '{pid}' }})")
            host.wait_for_function("/Backed up (just now|1 min ago)/.test(document.querySelector('#whl-backup .ghb-when').textContent)", timeout=10000)
            print("ok  4. Backup on GitHub: on from its card, real design files backed up, no .env, no .tribe, no key")

            # ---------- 5. the host is off: the friend gets the latest from GitHub ----------
            fr.evaluate("TribeCopies.get()"); fr.wait_for_timeout(600)   # the friend's copy knows where the backup is
            def gh(route):
                url = route.request.url
                rel = url.split("/contents/", 1)[1].split("?", 1)[0]
                r = subprocess.run(["git", "--git-dir", str(bare), "show", f"main:{rel}"], capture_output=True, text=True)
                if r.returncode: return route.fulfill(status=404, body='{"message":"Not Found"}', headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})
                route.fulfill(status=200, body=r.stdout, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"})
            fr.route("https://api.github.com/repos/camp/pixel/contents/**", gh)
            srv.terminate(); srv.wait()
            fr.wait_for_function("TribeClient.state().status !== 'online'", timeout=20000)
            fr.evaluate("(() => { const d = document.createElement('div'); d.id = 't-bk'; d.style.cssText = 'position:fixed;top:80px;left:420px;width:420px;z-index:99999;background:var(--surface);padding:16px;border:1px solid var(--edge)'; document.body.appendChild(d); TribeGitHubConnect.backup(d); })()")
            fr.wait_for_selector("#t-bk [data-ghb='get']", timeout=10000)
            assert fr.is_disabled("#t-bk [data-ghb='on']"), "on/off waits for the tribe"
            fr.click("#t-bk [data-ghb='get']"); fr.wait_for_function("/Got the latest from GitHub/.test(document.querySelector('#t-bk [data-ghb-msg]').textContent)", timeout=10000)
            got = fr.evaluate(f"TribeCopies.peek('{pid}', '/projects/{pid}/app-config').config")
            assert blk(got, lst)["props"]["title"] == "Backed up", "the copy has the backup's design"
            open_apc()
            assert fr.evaluate(f"TribeAppCreator.doc().screens[0].blocks.find(x => x.id === '{lst}').props.title") == "Backed up"
            shot(fr, "from-github")
            print("ok  5. host off: the friend got the latest from the GitHub backup and App Creator opens it")
            b.close()
        bad = [e for e in errors if "Failed to fetch" not in e and "WebSocket" not in e and "NetworkError" not in e]
        assert not bad, bad
        print("e2e_copies_sync: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
