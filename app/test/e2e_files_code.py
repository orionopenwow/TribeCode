"""Code-aware Files (server/codefiles.js, app/ui/codefiles.js, codefiles.css).

A temp git repo (main + feat/boss, nested folders, README, docs/GUIDE.md, node_modules, a .gitignore'd build/ folder and
symlinks that point outside the repo) pinned to the tribe's first project, plus a second notes-only project.
Checks: the Files · Code · Docs switch shows for the code project and not for the notes project; the tree lists folders
and hides node_modules / build; the viewer shows the file with line numbers and tint; a branch switch changes the
tree; traversal (../, absolute, symlinks to outside) is 400/404; Docs lists the vision and repo docs; search finds a
nested file (keyboard: / then Enter); the choice is remembered; phones (390px) drill down with no page overflow.
Usage: python app/test/e2e_files_code.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5150 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
LONG = "const levels = ['" + "', '".join(f"level-{i}" for i in range(40)) + "'];"


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name):
    if take:
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def make_repo(work):
    repo = os.path.join(work, "pixel-quest")
    os.makedirs(repo)
    g = lambda *a: subprocess.run(["git", "-C", repo, "-c", "user.email=maya@t", "-c", "user.name=Maya", *a], check=True, capture_output=True)
    files = {
        "README.md": "# Pixel Quest\n\nA tiny platformer we build together.\n",
        "package.json": '{\n  "name": "pixel-quest",\n  "version": "1.0.0"\n}\n',
        "src/game/player.js": "// the player\nexport function jump(height = 2) {\n  return height * 2;\n}\n" + LONG + "\n",
        "src/ui/menu.ts": "export const menu: string[] = ['Play', 'Quit'];\n",
        "src/styles.css": "body { color: #fff; }\n",
        "docs/GUIDE.md": "# Guide\n\nHow to add a level to Pixel Quest.\n",
        ".gitignore": "build/\n",
        "node_modules/lib/index.js": "module.exports = 1;\n",
        "build/out.js": "built\n",
    }
    for p, t in files.items():
        f = Path(repo, p); f.parent.mkdir(parents=True, exist_ok=True); f.write_text(t)
    g("init", "-q", "-b", "main"); g("add", "README.md", "package.json", "src", "docs", ".gitignore"); g("commit", "-q", "-m", "First level")
    g("checkout", "-q", "-b", "feat/boss")
    Path(repo, "src/game/boss.js").write_text("export const boss = { hp: 10 };\n")
    g("add", "."); g("commit", "-q", "-m", "Add the boss")
    g("checkout", "-q", "main")
    Path(repo, "src/game/player.js").write_text(files["src/game/player.js"] + "// tuned jump\n")
    g("commit", "-q", "-am", "Tune the jump")
    outside = os.path.join(work, "outside"); os.makedirs(outside); Path(outside, "secret.txt").write_text("TOP SECRET\n")
    os.symlink(os.path.join(outside, "secret.txt"), os.path.join(repo, "leak.txt"))
    os.symlink(outside, os.path.join(repo, "elsewhere"))
    return repo


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-fc-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="fc-src-", dir="/tmp")
    repo = make_repo(work)
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--repo", repo, "--ollama", "http://localhost:9"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        assert api("/code/tree")[0] == 401, "members only"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 950}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            tok = host.evaluate("TribeStore.get().server.token")
            main_pid = host.evaluate("TribeClient.project()")

            # ---- API: read-only, inside the repo only ----
            st, d = api("/code", token=tok); assert st == 200 and d["hasRepo"] and d["branch"] == "main", d
            st, d = api("/code/branches", token=tok); assert {x["name"] for x in d["branches"]} == {"main", "feat/boss"}, d
            boss = next(x for x in d["branches"] if x["name"] == "feat/boss"); assert boss["author"] == "Maya" and boss["subject"] == "Add the boss", boss
            names = [e["name"] for e in api("/code/tree", token=tok)[1]["entries"]]
            assert "src" in names and "docs" in names and "README.md" in names, names
            assert "node_modules" not in names and "build" not in names and ".git" not in names, names
            for bad in ["../outside/secret.txt", "src/../../outside/secret.txt", "/etc/passwd", "C:/Windows/win.ini", "..\\..\\outside"]:
                st, _ = api("/code/file?path=" + urllib.parse.quote(bad, safe=""), token=tok)
                assert st == 400, (bad, st)
            assert api("/code/tree?path=" + urllib.parse.quote("../", safe=""), token=tok)[0] == 400
            for bad in ["leak.txt", "elsewhere/secret.txt", "node_modules/lib/index.js", "build/out.js", ".git/config", "nope.js"]:
                st, _ = api("/code/file?path=" + bad, token=tok)
                assert st == 404, (bad, st)
            assert api("/code/tree?path=elsewhere", token=tok)[0] == 404, "symlinked folder outside the repo"
            assert api("/code/tree?ref=--output=/tmp/x", token=tok)[0] == 404, "refs are checked against real branches"
            assert api("/code/file?ref=feat/boss&path=leak.txt", token=tok)[0] == 404
            assert api("/code/tree", "POST", {}, token=tok)[0] == 405, "read-only"
            f = api("/code/file?path=src/game/player.js", token=tok)[1]; assert "export function jump" in f["text"] and not f["binary"], f
            assert any(x["path"] == "src/game/boss.js" for x in api("/code/tree?ref=feat/boss&path=src/game", token=tok)[1]["entries"])
            assert api("/code/search?q=menu", token=tok)[1]["results"][0]["path"] == "src/ui/menu.ts"
            assert api("/code/recent", token=tok)[1]["files"][0]["path"] == "src/game/player.js"
            assert [x["path"] for x in api("/code/docs", token=tok)[1]["files"]] == ["README.md", "docs/GUIDE.md"]
            api("/vision", "PUT", {"text": "# Pixel Quest\n\nA cozy platformer for friends."}, tok)

            # a notes-only project: no switch there
            notes = api("/projects", "POST", {"name": "Reading list"}, tok)[1]["project"]["id"]
            assert api(f"/projects/{notes}/sense", "PUT", {"kind": "notes"}, tok, project=notes)[0] == 200

            # ---- desktop: the switch, the tree, the viewer ----
            host.evaluate("TribeApp.show('docs')")
            host.wait_for_selector("#view-tabs [data-cfseg=code]")   # desktop: Notes · Code · Docs sit in the Files tab row
            assert host.evaluate("document.querySelector('#view-docs').firstElementChild.id") == "cf-switch"
            assert host.locator("#cf-switch [data-seg=files].on").count() == 1, "Files (today's view) by default"
            host.click("#view-tabs [data-cfseg=code]")
            host.wait_for_selector('#cf-tree .cf-row[data-path="src"]')
            rows = host.eval_on_selector_all("#cf-tree .cf-row", "els => els.map(e => e.dataset.path)")
            assert "node_modules" not in rows and "build" not in rows, rows
            assert host.is_hidden(".docs-grid"), "today's Files view hides under Code"
            wait_text(host, "#cf-readme", "A tiny platformer we build together")
            wait_text(host, "#cf-recent", "player.js")
            wait_text(host, "#cf-branch", "main")
            host.click('#cf-tree .cf-row[data-path="src"]')
            host.wait_for_selector('#cf-tree .cf-row[data-path="src/game"]')
            assert host.get_attribute('#cf-tree .cf-row[data-path="src"]', "aria-expanded") == "true"
            wait_text(host, "#cf-crumbs", "src")
            host.click('#cf-tree .cf-row[data-path="src/game"]')
            host.click('#cf-tree .cf-row[data-path="src/game/player.js"]')
            host.wait_for_selector("#cf-viewer .cf-gut")
            wait_text(host, "#cf-viewer .cf-src", "export function jump")
            gut = host.inner_text("#cf-viewer .cf-gut").split()
            assert gut[:3] == ["1", "2", "3"] and len(gut) == 6, gut
            assert host.locator("#cf-viewer .cf-src .t-k").count() >= 2 and host.locator("#cf-viewer .cf-src .t-c").count() >= 1, "syntax tint"
            wait_text(host, "#cf-viewer .cf-log", "Tune the jump")
            assert host.locator("#cf-copy").count() == 1 and host.locator("#cf-ask").count() == 1
            assert host.locator("#cf-gh").count() == 0, "no GitHub remote: no Open on GitHub"
            shot(host, "files-code-desktop")
            host.keyboard.press("Escape"); host.wait_for_selector("#cf-viewer", state="detached")

            # keyboard: / focuses search, Enter opens the top hit
            host.click("#cf-title")
            host.keyboard.press("/")
            assert host.evaluate("document.activeElement.id") == "cf-q"
            host.keyboard.type("menu")
            host.wait_for_selector('#cf-tree .cf-row.res[data-path="src/ui/menu.ts"]')
            host.keyboard.press("ArrowDown"); host.keyboard.press("Enter")
            wait_text(host, "#cf-viewer .cf-src", "export const menu")
            host.fill("#cf-q", ""); host.wait_for_selector('#cf-tree .cf-row[data-path="src"]')

            # branch switch changes the tree
            host.click("#cf-branch")
            host.wait_for_selector('#cf-branches [data-branch="feat/boss"]')
            wait_text(host, "#cf-branches", "Add the boss")
            host.click('#cf-branches [data-branch="feat/boss"]')
            wait_text(host, "#cf-branch", "feat/boss")
            host.click('#cf-tree .cf-row[data-path="src"]')
            host.click('#cf-tree .cf-row[data-path="src/game"]')
            host.wait_for_selector('#cf-tree .cf-row[data-path="src/game/boss.js"]')
            host.click("#cf-branch"); host.click('#cf-branches [data-branch="main"]')
            wait_text(host, "#cf-branch", "main")
            host.click('#cf-tree .cf-row[data-path="src"]'); host.click('#cf-tree .cf-row[data-path="src/game"]')
            host.wait_for_selector('#cf-tree .cf-row[data-path="src/game/player.js"]')
            assert host.locator('#cf-tree .cf-row[data-path="src/game/boss.js"]').count() == 0

            # ---- Docs: vision, notes, repo docs in one list ----
            host.click("#view-tabs [data-cfseg=docs]")
            host.wait_for_selector('#cf-dlist [data-doc-kind="vision"]')
            host.wait_for_selector('#cf-dlist [data-doc="repo|docs/GUIDE.md"]')
            groups = host.eval_on_selector_all("#cf-dlist .cf-group", "els => els.map(e => e.textContent)")
            assert groups == ["Vision", "Notes", "Repo docs"], groups
            host.fill("#cf-dq", "guide")
            assert host.locator("#cf-dlist [data-doc]").count() == 1
            host.keyboard.press("Enter")
            wait_text(host, "#cf-reader", "How to add a level")
            host.fill("#cf-dq", "")
            host.click('#cf-dlist [data-doc-kind="vision"]'); wait_text(host, "#cf-reader", "A cozy platformer for friends")
            shot(host, "files-code-docs")

            # remembered per project
            host.reload(); wait_text(host, "#sync-status", "connected")
            host.evaluate("TribeApp.show('docs')")
            host.wait_for_selector("#cf-switch [data-seg=docs].on", state="attached")
            # the notes project keeps today's view
            host.evaluate(f"TribeProjects.switchTo({notes!r}, 'docs')")
            host.wait_for_function(f"TribeClient.project() === {notes!r}")
            host.wait_for_timeout(1200)
            assert host.locator("#cf-switch").count() == 0 and host.is_visible(".docs-grid"), "no switch for a notes project"
            host.evaluate(f"TribeProjects.switchTo({main_pid!r}, 'docs')")
            host.wait_for_selector("#cf-switch [data-seg=docs].on", state="attached")

            # ---- phone: drill-down, full-screen viewer, no page overflow ----
            code = api("/invites", "POST", {"hours": 1, "maxUses": 2, "project": main_pid}, tok)[1]["invite"]["code"]
            phone = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{code}"); phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            phone.evaluate("localStorage.setItem('tribecode.iosHint', '1'); document.querySelector('.ios-hint') && document.querySelector('.ios-hint').remove()")
            phone.evaluate("TribeApp.show('docs')")
            phone.wait_for_selector("#cf-switch [data-seg=code]")
            box = phone.locator("#cf-switch").bounding_box(); assert box["width"] > 300, box
            phone.click("#cf-switch [data-seg=code]")
            phone.wait_for_selector('#cf-tree .cf-row[data-path="src"]')
            wait_text(phone, "#cf-readme", "A tiny platformer")
            shot(phone, "files-code-phone-tree")
            phone.click('#cf-tree .cf-row[data-path="src"]')
            phone.wait_for_selector('#cf-tree .cf-row[data-up]')
            assert phone.locator('#cf-tree .cf-row[data-path="README.md"]').count() == 0, "drill-down: only the folder's own items"
            phone.click('#cf-tree .cf-row[data-path="src/game"]')
            phone.click('#cf-tree .cf-row[data-path="src/game/player.js"]')
            phone.wait_for_selector("#cf-view.open #cf-viewer .cf-gut")
            vb = phone.locator("#cf-view.open").bounding_box(); assert vb["width"] >= 389 and vb["height"] >= 840, f"full-screen viewer: {vb}"
            ov = phone.evaluate("""() => { const s = document.querySelector('#cf-viewer .cf-src');
              return { page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), view: document.querySelector('#cf-view').scrollWidth,
                       code: s.scrollWidth > s.clientWidth } }""")
            assert ov["page"] <= 390 and ov["view"] <= 390 and ov["code"], ov
            shot(phone, "files-code-phone")
            phone.click("#cf-close"); phone.wait_for_selector("#cf-view:not(.open)")
            phone.click('#cf-tree .cf-row[data-up]'); phone.click('#cf-tree .cf-row[data-up]')
            phone.wait_for_selector('#cf-tree .cf-row[data-path="README.md"]')
            phone.click("#cf-switch [data-seg=docs]")
            phone.wait_for_selector('#cf-dlist [data-doc-kind="vision"]')
            ov = phone.evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)")
            assert ov <= 390, ov
            b.close()
        assert not errors, errors
        print("E2E files code test passed")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
