"""End-to-end: the free AI bridge (app/ui/aibridge.js, feat/agents-free) and the Agents Hub's "Use any free AI".

Copy out: from the Code view's "Ask a free AI" the pack has the goal, the file with its path, the constraints and the strict
reply format; a secret in a picked file is stripped and the sheet says so; Copy puts the pack on the clipboard; a pack too
big for Copilot splits into parts; PDF and TXT download. Paste back: a ChatGPT-style answer (a diff with two hunks, two
whole files and a risky file) gives a per-file diff preview and a warning; rejecting a file and a hunk leaves them out;
Apply updates the files (commits "From ChatGPT (pasted)"), the Code view and the preview at once; Undo restores them. A
malformed answer gets a calm message and stays in the box. A site config imports into the website designer as a new
version. Entry points: the AI-boost card's third button, Flint ("turn this answer into changes"); every Agents Hub entry
point (sidebar row, Ctrl K, Flint, Home's Agent fleet) opens the hub, never Files, also for a Beginner. Phones (390px):
the sheet and the guide fit. No console errors.
Usage: python app/test/e2e_ai_bridge.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6333 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and "EventSource" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def view(page):
    return page.evaluate("[document.body.dataset.view, document.body.dataset.scope || '']")


GAME = "".join(f"// line {c}\n" for c in "abcdefghijklm")
SECRET = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123456789"
REPLY = """Sure! Here's how to add a pause menu.

**src/game.js**
```diff
--- a/src/game.js
+++ b/src/game.js
@@ -2,3 +2,3 @@
 // line b
-// line c
+// line C (paused aware)
 // line d
@@ -11,3 +11,4 @@
 // line k
 // line l
+// line l2
 // line m
```

A new file for the menu:

```js path=src/pause.js
export function pause() { document.body.classList.toggle('paused'); }
```

```html path=index.html
<!doctype html><html><body><p id="mark">paused build</p><script src="src/game.js"></script></body></html>
```

And a helper that saves scores online:

```js path=src/net.js
fetch('https://scores.example.com/save', { method: 'POST' }); eval('1+1');
```

Hope this helps!"""


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-aib-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        p = ok(api("/projects", "POST", {"name": "Pixel Garden"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api(f"/projects/{pid}/setup/repo", "POST", {}, token=host), "repo")
        repo = tmp / "tribe" / "workspaces" / pid
        for path, text in [("src/game.js", GAME), ("src/config.js", f'const API_KEY = "{SECRET}";\nexport default API_KEY;\n'),
                           ("index.html", '<!doctype html><html><body><p id="mark">first build</p><script src="src/game.js"></script></body></html>\n'),
                           ("big.txt", ("word " * 15 + "\n") * 300)]:
            ok(api("/code/file", "PUT", {"path": path, "text": text, "message": "seed " + path}, token=host, project=pid), path)
        # the server side of Undo for a new file: DELETE /api/code/file
        ok(api("/code/file", "PUT", {"path": "tmp/x.js", "text": "x\n"}, token=host, project=pid))
        assert ok(api("/code/file?path=tmp/x.js", "DELETE", token=host, project=pid))["removed"] and not (repo / "tmp" / "x.js").exists()
        assert "src/game.js" in ok(api("/code/list", token=host, project=pid))["paths"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
            ctx.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{host}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} }} catch (e) {{}}")
            pg = ctx.new_page(); watch(pg, "host")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCodeFiles && window.TribeAIBridge", timeout=20000)
            if pg.evaluate("TribeClient.project()") != pid:
                pg.evaluate(f"TribeProjects.switchTo('{pid}')"); pg.wait_for_function(f"TribeClient.project() === '{pid}'")
            pg.wait_for_timeout(600)

            # ---- 1. Copy out from the Code view: the pack has the file, the format; the secret is stripped
            pg.evaluate("TribeApp.show('docs'); TribeCodeFiles.set('code')")
            pg.wait_for_selector("#cf-tree .cf-row[data-path='src']", timeout=15000); pg.click("#cf-tree .cf-row[data-path='src']")
            pg.wait_for_selector("#cf-tree .cf-row[data-path='src/game.js']"); pg.click("#cf-tree .cf-row[data-path='src/game.js']")
            pg.wait_for_selector("#cf-freeai"); pg.click("#cf-freeai")
            pg.wait_for_selector("#aib:not([hidden]) #aib-out")
            pack = pg.evaluate("document.querySelector('#aib-pack').textContent")
            for want in ["# TribeCode context pack", "GOAL:", "### src/game.js", "```js path=src/game.js", "line m", "How to reply (strict)", "No npm packages", "```diff path="]:
                assert want in pack, (want, pack[:600])
            pg.fill("#aib-goal", "Add a pause menu"); pg.wait_for_function("document.querySelector('#aib-pack').textContent.includes('GOAL: Add a pause menu')")
            # add the file with a key in it: stripped, and the sheet says so
            pg.click("[data-aib-src='files']"); pg.wait_for_selector("#aib-files [data-aib-pick='src/config.js']")
            pg.fill("#aib-filter", "config"); pg.wait_for_timeout(100)
            pg.check("#aib-files [data-aib-pick='src/config.js']"); pg.wait_for_selector("#aib-removed")
            wait_text(pg, "#aib-removed", "OpenAI key")
            pack = pg.evaluate("document.querySelector('#aib-pack').textContent")
            assert SECRET not in pack and "[REMOVED: secret]" in pack and "### src/config.js" in pack and "### src/game.js" in pack, pack[-800:]
            # copy: one click, the clipboard holds the pack
            pg.click("#aib-copy"); pg.wait_for_function("document.querySelector('#aib-copy').textContent.includes('Copied')")
            clip = pg.evaluate("navigator.clipboard.readText()")
            assert clip == pg.evaluate("document.querySelector('#aib-pack').textContent") and SECRET not in clip
            assert "fits ChatGPT" in pg.inner_text("#aib-size")
            shot(pg, "ai-bridge-copy")
            # downloads: TXT and PDF
            with pg.expect_download() as d: pg.click("#aib-dl-txt")
            txt = Path(d.value.path()).read_text()
            assert d.value.suggested_filename.endswith(".txt") and "GOAL: Add a pause menu" in txt and SECRET not in txt
            with pg.expect_download() as d: pg.click("#aib-dl-pdf")
            pdf = Path(d.value.path()).read_bytes()
            assert d.value.suggested_filename.endswith(".pdf") and pdf.startswith(b"%PDF-1.4") and b"Add a pause menu" in pdf and b"%%EOF" in pdf
            # too big for Copilot: split into parts
            pg.fill("#aib-filter", "big"); pg.wait_for_timeout(100); pg.check("#aib-files [data-aib-pick='big.txt']")
            pg.click("[data-aib-prov='copilot']"); pg.wait_for_selector("#aib-meter.over #aib-size")
            pg.click("#aib-split"); pg.wait_for_selector("#aib-parts [data-aib-part='1']")
            n = pg.evaluate("TribeAIBridge.state().parts"); assert n >= 2, n
            pg.click("#aib-parts [data-aib-part='0']"); pg.wait_for_timeout(200)
            assert pg.evaluate("navigator.clipboard.readText()").startswith(f"[Part 1 of {n}.")
            pg.click("[data-aib-prov='chatgpt']")

            # ---- 2. Paste back: a ChatGPT-style answer → the diff preview, the risky-change warning
            pg.evaluate("TribePreview.open()"); pg.wait_for_selector("#pvw-iframe", timeout=15000)
            pg.evaluate("TribeAIBridge.open({ tab: 'back' })")
            pg.wait_for_selector("#aib-paste")
            pg.evaluate("t => navigator.clipboard.writeText(t)", REPLY)
            pg.click("#aib-clip"); pg.wait_for_selector("#aib-changes .aib-file[data-path='src/game.js']")
            assert pg.input_value("#aib-paste") == REPLY
            paths = pg.evaluate("[...document.querySelectorAll('#aib-changes .aib-file')].map(e => e.dataset.path)")
            assert paths == ["src/game.js", "src/pause.js", "index.html", "src/net.js"], paths
            assert pg.locator(".aib-file[data-path='src/game.js'] .aib-hunk").count() == 2
            wait_text(pg, ".aib-file[data-path='src/pause.js']", "NEW FILE")
            game_diff = pg.inner_text(".aib-file[data-path='src/game.js']")
            assert "+ // line C (paused aware)" in game_diff and "- // line c" in game_diff and "+ // line l2" in game_diff, game_diff
            kinds = pg.evaluate("TribeAIBridge.state().risks"); assert "network" in kinds and "eval" in kinds, kinds
            wait_text(pg, "#aib-risks", "makes network calls"); wait_text(pg, "#aib-risks", "src/net.js")
            # reject a file and a hunk
            pg.uncheck(".aib-file[data-path='src/net.js'] [data-aib-file]")
            pg.uncheck(".aib-file[data-path='src/game.js'] [data-aib-hunk$=':1']")
            wait_text(pg, "#aib-apply", "Apply 3 files")
            assert pg.locator(".aib-file[data-path='src/net.js'].off").count() == 1 and pg.locator(".aib-file[data-path='src/game.js'] .aib-hunk.off").count() == 1
            pg.evaluate("document.querySelector('#aib .aib-body').scrollTop = 0")
            shot(pg, "ai-bridge-apply")

            # ---- 3. Apply: the files, the Code view and the preview change; Undo restores them
            pg.click("#aib-apply"); pg.wait_for_selector("#aib-undo", timeout=15000)
            wait_text(pg, "#aib-msg", "Saved 3 files", timeout=15000)
            g = (repo / "src" / "game.js").read_text()
            assert "line C (paused aware)" in g and "line l2" not in g, g
            assert (repo / "src" / "pause.js").exists() and not (repo / "src" / "net.js").exists()
            log = subprocess.run(["git", "-C", str(repo), "log", "--format=%s", "-4"], capture_output=True, text=True).stdout
            assert "From ChatGPT (pasted): Add a pause menu" in log, log
            assert "paused aware" in pg.evaluate("TribeCodeFiles.current().text")   # the editor shows it
            t0 = time.time(); seen = ""
            while time.time() - t0 < 15:
                try: seen = pg.frame_locator("#pvw-iframe").locator("#mark").inner_text(timeout=500)
                except Exception: seen = ""
                if seen == "paused build": break
                time.sleep(0.2)
            assert seen == "paused build", seen
            pg.click("#aib-undo"); wait_text(pg, "#aib-msg", "Undone", timeout=15000)
            assert (repo / "src" / "game.js").read_text() == GAME and not (repo / "src" / "pause.js").exists()
            assert "first build" in (repo / "index.html").read_text()
            assert pg.evaluate("TribeCodeFiles.current().text") == GAME
            t0 = time.time()
            while time.time() - t0 < 15:
                try: seen = pg.frame_locator("#pvw-iframe").locator("#mark").inner_text(timeout=500)
                except Exception: seen = ""
                if seen == "first build": break
                time.sleep(0.2)
            assert seen == "first build", seen
            assert pg.input_value("#aib-paste") == REPLY   # the answer stays

            # ---- 4. Malformed answers: calm, and the text stays
            bad = "I think you should split the game loop into smaller functions and add a pause state."
            pg.fill("#aib-paste", bad); pg.click("#aib-read"); pg.wait_for_selector("#aib-msg.calm")
            wait_text(pg, "#aib-msg", "could not find any files"); assert pg.input_value("#aib-paste") == bad
            assert pg.locator("#aib-changes").count() == 0 and pg.locator("#aib-apply").count() == 0
            pg.fill("#aib-paste", "```js path=src/game.js\n// line a\n// line b"); pg.click("#aib-read"); wait_text(pg, "#aib-msg", "cut off")
            pg.fill("#aib-paste", "```diff path=src/game.js\n@@ -1,2 +1,2 @@\n-nothing like this\n+x\n```"); pg.click("#aib-read")
            wait_text(pg, ".aib-file[data-path='src/game.js']", "doesn't match"); assert pg.locator("#aib-apply[disabled]").count() == 1
            # clipboard refused: a calm hint, never an error
            ctx.clear_permissions(); pg.evaluate("void (navigator.clipboard.readText = () => Promise.reject(new Error('denied')))")
            pg.click("#aib-clip"); wait_text(pg, "#aib-msg", "Ctrl V")
            pg.click("[data-aib='close']"); pg.wait_for_selector("#aib", state="hidden")

            # ---- 5. A site config imports into the website designer as a new version
            pg.evaluate("TribePreview.close && TribePreview.close()")
            pg.evaluate("TribeSiteDesigner.open({})"); pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=15000)
            pg.wait_for_selector("#wdz-freeai"); pg.click("#wdz-freeai"); pg.wait_for_selector("#aib:not([hidden]) #aib-out")
            pg.wait_for_function("document.querySelector('#aib-pack').textContent.includes('site.json')")
            v0 = len(ok(api(f"/projects/{pid}/website/versions", token=host, project=pid)).get("versions", []))
            site = {"name": "Bake sale", "pages": [{"title": "Home", "blocks": [{"type": "hero", "props": {"title": "Fresh bread on Saturday", "text": "Come early."}}]}]}
            pg.click("#aib-tab-back"); pg.fill("#aib-paste", "Here you go:\n```json path=site.json\n" + json.dumps(site, indent=1) + "\n```"); pg.click("#aib-read")
            pg.wait_for_selector("#aib-import"); pg.click("#aib-import")
            pg.wait_for_function("TribeSiteDesigner.cfg().name === 'Bake sale'", timeout=10000)
            assert pg.evaluate("JSON.stringify(TribeSiteDesigner.cfg())").count("Fresh bread on Saturday") >= 1
            t0 = time.time()
            while time.time() - t0 < 10 and len(ok(api(f"/projects/{pid}/website/versions", token=host, project=pid)).get("versions", [])) <= v0: time.sleep(0.2)
            assert len(ok(api(f"/projects/{pid}/website/versions", token=host, project=pid)).get("versions", [])) > v0, "a new version"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function("TribeSiteDesigner.cfg().name !== 'Bake sale'")
            pg.evaluate("TribeSiteDesigner.close()")

            # ---- 6. Other ways in: the AI-boost card's third button, Flint
            pg.evaluate("TribeAIBridge.close(); const d = document.createElement('div'); d.id = 'bx'; d.innerHTML = TribeBoost.html({ ask: 'make the jump higher' }); document.querySelector('.main').prepend(d); TribeBoost.bind(d)")
            assert pg.locator("#bx [data-boost]").count() == 3
            pg.click("#bx [data-boost='free']"); pg.wait_for_selector("#aib:not([hidden]) #aib-out")
            assert pg.input_value("#aib-goal") == "make the jump higher"
            pg.evaluate("TribeAIBridge.close(); document.querySelector('#bx').remove()")
            pg.evaluate("TribeFlint.ask('turn this answer into changes')"); pg.wait_for_selector("#aib:not([hidden]) #aib-back")
            pg.evaluate("TribeAIBridge.close()")

            # ---- 7. The Agents Hub: every entry point opens the hub, never Files, also for a Beginner; the guide is there
            pg.evaluate("localStorage.setItem('tribecode.mode', 'beginner')"); pg.reload(); pg.wait_for_function("TribeClient.connected() && window.TribeShell")
            pg.wait_for_timeout(600)
            pg.evaluate("TribeShell.go('docs')"); pg.wait_for_function("document.body.dataset.view === 'docs'")
            pg.click("#nest-ws-agents"); pg.wait_for_function("document.body.dataset.view === 'coord'", timeout=8000)
            pg.evaluate("TribeShell.go('docs')"); pg.wait_for_function("document.body.dataset.view === 'docs'")
            pg.keyboard.press("Control+k"); pg.wait_for_selector("#palette:not(.hidden)"); pg.keyboard.type("Agents Hub"); pg.wait_for_timeout(300); pg.keyboard.press("Enter")
            pg.wait_for_function("document.body.dataset.view === 'coord'", timeout=8000)
            pg.evaluate("TribeShell.go('docs')"); pg.wait_for_function("document.body.dataset.view === 'docs'")
            pg.evaluate("TribeFlint.ask('open agents hub')"); pg.wait_for_function("document.body.dataset.view === 'coord'", timeout=8000)
            pg.wait_for_selector("#view-coord #aib-guide")
            assert pg.locator("#aib-guide .aib-prov").count() == 5
            names = pg.evaluate("[...document.querySelectorAll('#aib-guide .aib-prov b')].map(b => b.textContent)")
            assert names == ["ChatGPT", "Gemini", "Claude", "Copilot", "Le Chat"], names
            assert pg.evaluate("[...document.querySelectorAll('#aib-guide .aib-prov')].every(a => a.target === '_blank' && a.href.startsWith('https://'))")
            assert pg.locator("#aib-guide iframe").count() == 0
            pg.evaluate("document.querySelector('#aib-guide').scrollIntoView({ block: 'start' })"); pg.mouse.move(700, 880)
            shot(pg, "agents-hub-free")
            pg.click("#aib-guide [data-aib-open='back']"); pg.wait_for_selector("#aib:not([hidden]) #aib-back"); pg.evaluate("TribeAIBridge.close()")
            # Home's Agent fleet row: the fleet, with the guide too
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#nest-fleet"); pg.click("#nest-fleet")
            pg.wait_for_function("document.body.dataset.view === 'agents-hub' && document.body.dataset.scope === 'global'")
            pg.wait_for_selector("#view-agents-hub #aib-guide")
            assert view(pg) != ["docs", ""]
            pg.evaluate("localStorage.removeItem('tribecode.mode')")

            # ---- 8. Phones (390px)
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{host}'}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}');")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1"); phone.wait_for_function("TribeClient.connected() && window.TribeAIBridge")
            phone.evaluate("TribeShell.go('agents')"); phone.wait_for_selector("#view-coord #aib-guide")
            boxes = phone.evaluate("[...document.querySelectorAll('#aib-guide .aib-prov, #aib-guide .aib-steps li')].map(c => { const r = c.getBoundingClientRect(); return [r.left, r.right]; })")
            assert boxes and all(l >= 0 and r <= 391 for l, r in boxes), boxes
            phone.evaluate("TribeAIBridge.open({ fresh: true, tab: 'back', reply: arguments[0] })".replace("arguments[0]", json.dumps(REPLY)))
            phone.wait_for_selector("#aib-changes .aib-file")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            bx = phone.evaluate("(() => { const r = document.querySelector('#aib .aib').getBoundingClientRect(); return { x: r.left, width: r.width }; })()"); assert 300 <= bx["width"] <= 391 and bx["x"] >= -1, bx
            phone.click("#aib-tab-out"); phone.wait_for_selector("#aib-copy")
            cb = phone.locator("#aib-copy").bounding_box(); assert cb["height"] >= 44 and cb["x"] + cb["width"] <= 391, cb
            if take: phone.wait_for_timeout(300); phone.screenshot(path=str(SHOTS / "ai-bridge-phone.png"))
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_ai_bridge")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
