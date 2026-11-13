"""GitHub setup detection (feat/tasks-company, app/ui/setuplocal.js githubGate + GET /api/github/detect).
Picking "A GitHub repo" in "Where should it live?" first checks for a GitHub sign-in: a token in this browser,
TribeCode's GitHub sign-in, the GitHub CLI (`gh auth status`) or a git credential on this computer. Signed out: a short
guide (what was found, a fine-grained token with the exact steps and permissions, git + the GitHub CLI per OS and
`gh auth login`), Check again, and Continue read-only. Once signed in (the CLI, or a pasted token) the GitHub sheet
opens by itself. A fake `gh` on PATH plays signed out / signed in; api.github.com is mocked in the browser.
Usage: python app/test/e2e_github_setup.py   (screenshot: docs/screenshots/github-setup.png)
"""
import json, os, stat, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6315 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

FAKE_GH = """#!/bin/sh
# a stand-in for the GitHub CLI: signed in or out depending on a state file
if [ "$(cat "%s" 2>/dev/null)" = "in" ]; then
  echo "github.com"; echo "  ✓ Logged in to github.com account campfire (keyring)"; exit 0
fi
echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2; exit 1
"""

def mock_github(ctx):
    def handle(route):
        auth = route.request.headers.get("authorization", "")
        if route.request.url.endswith("/user"):
            if auth == "Bearer github_pat_GOODtoken1234567890": return route.fulfill(status=200, content_type="application/json", body=json.dumps({"login": "campfire"}))
            return route.fulfill(status=401, content_type="application/json", body=json.dumps({"message": "Bad credentials"}))
        return route.fulfill(status=404, content_type="application/json", body=json.dumps({"message": "Not Found"}))
    ctx.route("https://api.github.com/**", handle)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ghs-", dir="/tmp"))
    home, bindir, state = tmp / "home", tmp / "bin", tmp / "gh-state"
    home.mkdir(); bindir.mkdir(); state.write_text("out")
    gh = bindir / "gh"; gh.write_text(FAKE_GH % state); gh.chmod(gh.stat().st_mode | stat.S_IEXEC)
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home), "PATH": f"{bindir}:{os.environ.get('PATH', '')}"}
    env.pop("TRIBE_NO_GH", None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        # the API: signed out, then the CLI signs in, then a git credential; never a token in the answer
        d = api("/github/detect")[1]["detect"]
        assert d["local"] and d["ready"] is None and d["gh"] == {"installed": True, "signedIn": False, "user": None} and d["git"]["installed"], d
        state.write_text("in"); d = api("/github/detect?force=1")[1]["detect"]
        assert d["ready"] == "gh" and d["gh"]["user"] == "campfire", d
        state.write_text("out"); (home / ".git-credentials").write_text("https://campfire:x@github.com\n")
        d = api("/github/detect?force=1")[1]["detect"]; assert d["ready"] == "git" and d["git"]["credential"] == "stored", d
        (home / ".git-credentials").unlink(); d = api("/github/detect?force=1")[1]["detect"]; assert d["ready"] is None, d

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 900}); mock_github(ctx)
            ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub")
            pg.wait_for_function("window.TribeLocalSetup && window.TribeApp && TribeApp.fresh()", timeout=15000)
            pg.wait_for_selector("#view-hub:not(.hidden) #hub-host", timeout=10000); time.sleep(0.5)
            pg.click("#hub-host"); pg.wait_for_selector("#su-start", state="visible")
            pg.fill("#su-name", "Pixel Quest"); pg.click("#su-create")
            pg.wait_for_selector("#su-where", state="visible", timeout=8000)

            # 1. signed out: the guide, with what was found and three ways
            pg.click("#su-where [data-su='github']"); pg.wait_for_selector("#su-gh-guide", timeout=10000)
            txt = pg.inner_text("#su-gh-guide")
            assert "Sign in to GitHub first" in txt and "GitHub CLI installed, not signed in" in txt and "git " in txt, txt
            assert pg.get_attribute("#su-way-token a", "href") == "https://github.com/settings/personal-access-tokens/new"
            assert "Contents" in txt and "Read and write" in txt and "gh auth login" in txt and "cli.github.com" in pg.inner_html("#su-way-cli")
            assert pg.locator("#su-way-oauth").count() == 0, "no Sign in with GitHub without a tribe that turned it on"
            time.sleep(0.3); pg.screenshot(path=str(SHOTS / "github-setup.png"))
            pg.click("#su-gh-recheck"); pg.wait_for_selector("#su-gh-gerr:not(.hidden)", timeout=8000)
            assert "Still not signed in" in pg.inner_text("#su-gh-gerr")
            # 2. a bad token is refused with a reason, a good one continues to the GitHub sheet on its own
            pg.fill("#su-gh-pat", "github_pat_BADtoken1234567890"); pg.click("#su-gh-pat-go")
            pg.wait_for_function("document.querySelector('#su-gh-gerr').textContent.includes('accept')", timeout=8000)
            pg.fill("#su-gh-pat", "github_pat_GOODtoken1234567890"); pg.click("#su-gh-pat-go")
            pg.wait_for_selector("#su-github #su-gh-repo", timeout=8000)
            assert pg.evaluate("localStorage.getItem('tribecode.light.ghToken')") == "github_pat_GOODtoken1234567890"
            assert "github_pat_GOOD" not in json.dumps(pg.evaluate("TribeOffline.exportSolo()")), "the token never goes into the project"
            # 3. the CLI signs in while the guide is open: coming back to the window continues by itself
            pg.evaluate("localStorage.removeItem('tribecode.light.ghToken')")
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where")
            pg.click("#su-where [data-su='github']"); pg.wait_for_selector("#su-gh-guide", timeout=10000)
            state.write_text("in")
            pg.evaluate("window.dispatchEvent(new Event('focus'))")
            pg.wait_for_selector("#su-github #su-gh-repo", timeout=10000)
            assert "GitHub CLI" in pg.inner_text("#su-github") and "@campfire" in pg.inner_text("#su-github")
            # 4. signed in already: straight to the GitHub sheet; signed out: read-only is always one tap away
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where"); pg.click("#su-where [data-su='github']")
            pg.wait_for_selector("#su-github #su-gh-repo", timeout=10000); assert pg.locator("#su-gh-guide").count() == 0
            state.write_text("out")
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where"); pg.click("#su-where [data-su='github']")
            pg.wait_for_selector("#su-gh-guide", timeout=10000); pg.click("#su-gh-ro")
            pg.wait_for_selector("#su-github #su-gh-repo", timeout=5000)
            # 5. a 390px phone: the guide fits
            pg.evaluate("TribeLocalSetup.close()"); pg.set_viewport_size({"width": 390, "height": 844}); time.sleep(0.5)
            pg.evaluate("TribeLocalSetup.choose('github')"); pg.wait_for_selector("#su-gh-guide", timeout=10000); time.sleep(0.4)
            assert pg.evaluate("document.querySelector('#su-gh-guide').getBoundingClientRect().right") <= 390
            assert pg.evaluate("document.documentElement.scrollWidth") <= 391
            pg.screenshot(path="/tmp/github-setup-phone.png")
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("ok e2e_github_setup")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
