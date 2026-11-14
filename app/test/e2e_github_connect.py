"""Connect GitHub: the one flow (feat/setup-github, app/ui/ghconnect.js, docs/GITHUB-CONNECT.md).
GitHub is a stand-in (app/test/ghmock.py): nothing here reaches the real GitHub.
  1. One-click sign-in off (no GitHub app id): the owner sees a calm line saying what switches it on, and the token path
     works: a bad token is refused in words, a good one signs in.
  2. Pick or create in one click: "Create a new one" makes a private place on the person's own GitHub and connects the
     project; the sheet ends on "Connected as @name", the link, and "No backup yet". A taken name and an account that may
     not create are refused in words. "Use one I have" lists theirs and connects the picked one.
  3. One-click sign-in on (the owner saves an app id): "Sign in with GitHub" shows the short code and finishes by itself
     when GitHub approves; a denied sign-in says so.
  4. Secrets: the token is never in any answer to a browser, never in the server's log, and another member can neither
     see nor use it. Agents can't sign in. A member who doesn't lead the project can't connect it.
  5. The sheet fits a 390px phone.
Usage: python app/test/e2e_github_connect.py [--shots]"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6760 + OFF; GH_PORT = 6761 + OFF; BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv; SHOT_DIR = ROOT / "docs" / "screenshots"
TOKEN = "ghp_" + "a1B2c3D4e5" * 4; TOKEN2 = "gho_" + "z9Y8x7W6v5" * 4
ghmock.GOOD[TOKEN] = "rae-dev"; ghmock.GOOD[TOKEN2] = "rae-dev"
seen = []   # every /api answer the browsers got, to prove no token ever comes back


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: t = x.read().decode(); seen.append(t); return x.status, json.loads(t or "{}")
    except urllib.error.HTTPError as e: t = e.read().decode(); seen.append(t); return e.code, json.loads(t or "{}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ghc-", dir="/tmp")); errors = []
    gh = ghmock.start(GH_PORT); ghmock.reset()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_REVEAL": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_GITHUB_API": f"http://127.0.0.1:{GH_PORT}", "TRIBE_GITHUB_WEB": f"http://127.0.0.1:{GH_PORT}"}
    env.pop("TRIBE_GITHUB_CLIENT_ID", None)
    log = tmp / "log"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(log, "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        camp = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        p = api("/projects", "POST", {"name": "Star Hopper"}, token=camp)[1]; pid = (p.get("project") or p)["id"]
        sam = api("/join", "POST", {"code": api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=camp)[1]["invite"]["code"], "name": "Sam"})[1]["token"]

        # before anyone signs in: nothing to list, nothing to create, and that is said in words
        st, d = api("/github/repos", token=camp); assert st == 401 and "Sign in" in d["error"], (st, d)
        st, d = api("/github/repos", "POST", {"name": "x"}, token=camp); assert st == 401, (st, d)
        g = api("/github", token=camp)[1]["github"]; assert not g["configured"] and not g["signedIn"] and g["canConfigure"], g
        assert not api("/github", token=sam)[1]["github"]["canConfigure"], "only the owner switches one-click sign-in on"

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(tok, name, w=1280, h=860):
                ctx = b.new_context(viewport={"width": w, "height": h})
                ctx.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (name, BASE, tok))
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                def keep(r):
                    if "/api/" in r.url:
                        try: seen.append(r.text())
                        except Exception: pass
                pg.on("response", keep)
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeGitHubConnect && window.TribeGitHub && window.TribeUI", timeout=30000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(600)
                return pg
            pg = page(camp, "Camp")
            toast_has = lambda t: pg.wait_for_function("t => [...document.querySelectorAll('.toast, #toast, [role=status]')].some(e => (e.textContent || '').includes(t))", arg=t, timeout=8000)

            # ---- 1. one-click sign-in is off: calm for the owner, and the token path works ----
            pg.evaluate("TribeGitHubConnect.open()"); pg.wait_for_selector("#ghc-sheet [data-ghc='signin']", timeout=8000)
            off = pg.inner_text("#ghc-off"); assert "isn’t switched on yet" in off and "GitHub app id" in off, off
            assert pg.locator("#ghc-sheet [data-gh='start']").count() == 0, "no dead Sign in button while it is off"
            assert pg.is_visible("#ghc-sheet #gh-cid"), "the owner can switch it on right here"
            assert pg.is_disabled("#ghc-go"), "Connect waits for the sign-in"
            txt = pg.inner_text("#ghc-sheet").lower()
            for w in ("oauth", "living repo", "ship"): assert w not in txt, f"plain words only: {w}"
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "github-connect-signin.png"))
            pg.click("#ghc-sheet .gh-paste summary"); pg.fill("#ghc-sheet #gh-tok", "ghp_" + "nope" * 8); pg.click("#ghc-sheet [data-gh='token']")
            toast_has("did not accept that token")
            assert pg.locator("#ghc-sheet [data-ghc='signin']").count() == 1, "a refused token stays on the sign-in step"
            pg.fill("#ghc-sheet #gh-tok", TOKEN); pg.click("#ghc-sheet [data-gh='token']")
            pg.wait_for_selector("#ghc-sheet [data-ghc='pick']", timeout=8000)
            assert pg.inner_text("#ghc-login") == "Connected as @rae-dev"
            assert pg.locator("#ghc-sheet #gh-tok").count() == 0 and TOKEN not in pg.content(), "the token is gone from the page"

            # ---- 2. create a new one, in one click ----
            assert pg.get_attribute("[data-ghc-mode='new']", "aria-checked") == "true" and pg.input_value("#ghc-name") == "star-hopper", "the project's name, ready to go"
            assert pg.is_checked("#ghc-private") and pg.is_enabled("#ghc-go")
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "github-connect-pick.png"))
            before = len(ghmock.STATE["repos"])
            assert before == 0, "signing in made nothing on GitHub by itself"
            ghmock.STATE["no_create"] = True
            pg.click("#ghc-go"); pg.wait_for_function("document.querySelector('#ghc-err') && !document.querySelector('#ghc-err').hidden", timeout=8000)
            assert "not allowed to create" in pg.inner_text("#ghc-err"), pg.inner_text("#ghc-err")
            ghmock.STATE["no_create"] = False
            ghmock.STATE["repos"]["rae-dev/star-hopper"] = {"head": "c0", "blobs": {}, "trees": {"t0": []}, "commits": {"c0": {"tree": "t0", "parents": []}}, "pages": None, "pushes": 0}
            pg.click("#ghc-go"); pg.wait_for_function("document.querySelector('#ghc-err') && document.querySelector('#ghc-err').textContent.includes('already have one')", timeout=8000)
            assert api(f"/projects/{pid}/sync", token=camp)[1]["status"]["connected"] is False, "a refusal connects nothing"
            pg.fill("#ghc-name", "bad name!"); pg.click("#ghc-go")
            pg.wait_for_function("document.querySelector('#ghc-err').textContent.includes('letters, numbers')", timeout=8000)
            pg.fill("#ghc-name", "star-hopper-game"); pg.click("#ghc-go")
            pg.wait_for_selector("#ghc-sheet [data-ghc='done']", timeout=15000)
            made = ghmock.STATE["repos"].get("rae-dev/star-hopper-game"); assert made and made["private"] is True, "made on their own GitHub, private"
            assert pg.inner_text("#ghc-login") == "Connected as @rae-dev" and pg.get_attribute("#ghc-link", "href") == "https://github.com/rae-dev/star-hopper-game"
            assert "No backup yet" in pg.inner_text("#ghc-last") and pg.is_visible("#ghc-backup")
            s = api(f"/projects/{pid}/sync", token=camp)[1]["status"]; assert s["connected"] and s["repo"] == "rae-dev/star-hopper-game" and s["kind"] == "github", s
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "github-connect-done.png"))
            pg.click("#ghc-close"); pg.wait_for_selector("#ghc-sheet", state="detached")
            # opening it again shows how it stands (one sheet for both)
            pg.evaluate("TribeGitHubConnect.open()"); pg.wait_for_selector("#ghc-sheet [data-ghc='done']", timeout=8000)
            assert "star-hopper-game" in pg.inner_text("#ghc-link")
            # use one I have
            pg.click("#ghc-change"); pg.wait_for_selector("#ghc-sheet [data-ghc='pick']"); pg.click("[data-ghc-mode='pick']")
            pg.wait_for_selector("#ghc-pick", timeout=8000)
            opts = pg.locator("#ghc-pick option").all_text_contents(); assert any("rae-dev/star-hopper" == o.replace(" (private)", "") for o in opts) and any("star-hopper-game" in o for o in opts), opts
            pg.select_option("#ghc-pick", "rae-dev/star-hopper"); pg.click("#ghc-go")
            pg.wait_for_selector("#ghc-sheet [data-ghc='done']", timeout=15000)
            assert api(f"/projects/{pid}/sync", token=camp)[1]["status"]["repo"] == "rae-dev/star-hopper"
            assert len(ghmock.STATE["repos"]) == 2, "picking one makes nothing new"
            pg.click("#ghc-close"); pg.wait_for_selector("#ghc-sheet", state="detached")

            # ---- 3. the owner switches one-click sign-in on: the short code, approved on GitHub ----
            api("/github/signout", "POST", {}, token=camp)
            st, d = api("/github/config", "PUT", {"clientId": ghmock.DEVICE["client"]}, token=sam); assert st == 403, "a member can't set the app id"
            pg.evaluate("TribeGitHubConnect.open({ replace: true })"); pg.wait_for_selector("#ghc-sheet [data-ghc='signin']", timeout=8000)
            pg.fill("#ghc-sheet #gh-cid", ghmock.DEVICE["client"]); pg.click("#ghc-sheet [data-gh='cid']")
            pg.wait_for_selector("#ghc-sheet [data-gh='start']", timeout=8000)
            assert api("/github", token=sam)[1]["github"]["configured"], "on for everyone, with no code change"
            ghmock.DEVICE.update(approved=False, denied=True, token=TOKEN2)
            pg.evaluate("window.open = () => null")   # the test has no second tab to open
            pg.click("#ghc-sheet [data-gh='start']"); pg.wait_for_selector("#ghc-sheet #gh-code", timeout=8000)
            assert pg.inner_text("#ghc-sheet #gh-code") == ghmock.DEVICE["code"]
            pg.wait_for_function("document.querySelector('#ghc-sheet .gh-note') && document.querySelector('#ghc-sheet .gh-note').textContent.includes('cancelled')", timeout=15000)
            ghmock.DEVICE.update(approved=True, denied=False)
            pg.click("#ghc-sheet [data-gh='start']"); pg.wait_for_selector("#ghc-sheet #gh-code", timeout=8000)
            pg.wait_for_selector("#ghc-sheet [data-ghc='pick']", timeout=20000)
            assert pg.inner_text("#ghc-login") == "Connected as @rae-dev"
            assert api("/github", token=camp)[1]["github"]["via"] == "device"
            assert len(ghmock.STATE["repos"]) == 2, "signing in inside the sheet makes nothing by itself"
            pg.keyboard.press("Escape"); pg.wait_for_selector("#ghc-sheet", state="detached")

            # ---- 4. secrets ----
            g = api("/github", token=sam)[1]["github"]; assert not g["signedIn"] and not g.get("login"), "Camp's sign-in is not Sam's"
            st, d = api("/github/repos", token=sam); assert st == 401, "and Sam can't list with it"
            st, d = api("/github/repos", "POST", {"name": "sneaky"}, token=sam); assert st == 401 and "rae-dev/sneaky" not in ghmock.STATE["repos"], "nor create with it"
            st, d = api(f"/projects/{pid}/sync", "PUT", {"kind": "github", "repo": "sam/other", "branch": "main"}, token=sam, project=pid); assert st == 403, (st, d)
            bot = api("/agents", "POST", {"name": "Bot"}, token=camp)
            bt = (bot[1].get("agent") or bot[1]).get("token") if bot[0] == 200 else None
            if bt:
                st, d = api("/github/token", "POST", {"token": TOKEN}, token=bt); assert st == 403, "agents don't sign in to GitHub"
            ps = page(sam, "Sam")
            ps.evaluate("TribeGitHubConnect.open({ replace: true })"); ps.wait_for_selector("#ghc-sheet [data-ghc='signin']", timeout=8000)
            assert ps.locator("#ghc-off").count() == 0 and ps.is_visible("#ghc-sheet [data-gh='start']"), "one-click sign-in lit up for a member too"
            assert "Only the owner or the project lead" in ps.inner_text("#ghc-noedit") and ps.is_disabled("#ghc-go")
            assert "rae-dev" not in ps.inner_text("#ghc-sheet")
            ps.close()
            blob = "\n".join(seen) + pg.content() + log.read_text(errors="ignore")
            for f in (tmp / "tribe").rglob("*"):
                if f.is_file() and "secrets" not in f.parts and f.stat().st_size < 2_000_000:
                    try: blob += f.read_text(errors="ignore")
                    except Exception: pass
            for t in (TOKEN, TOKEN2): assert t not in blob, "a token never comes back to a browser, a log or a shared file"
            sec = list((tmp / "tribe").rglob("secrets/*.json")); assert sec and all(oct(f.stat().st_mode)[-3:] == "600" for f in sec), "kept in the owner-only secrets file"

            # ---- 5. a 390px phone ----
            ph = page(camp, "Camp", 390, 800)
            ph.evaluate("TribeGitHubConnect.open({ replace: true })"); ph.wait_for_selector("#ghc-sheet [data-ghc='pick']", timeout=8000)
            fit = ph.evaluate("(() => { const r = document.querySelector('#ghc-sheet').getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1, [...document.querySelectorAll('#ghc-sheet button, #ghc-sheet input:not([type=checkbox]), #ghc-sheet select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 36 && !e.classList.contains('linkish') && !e.classList.contains('ui-x')).map(e => e.id || e.className)]; })()")
            assert fit[0] and fit[1] and fit[2] and not fit[3], fit
            if SHOTS: ph.screenshot(path=str(SHOT_DIR / "github-connect-phone.png"))
            ph.close(); b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("ok e2e_github_connect")
    finally:
        srv.terminate(); gh.shutdown()


if __name__ == "__main__":
    main()
