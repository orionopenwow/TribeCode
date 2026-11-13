"""End-to-end: the focused Preview workspace (app/ui/preview.js, v0.28). Opening the preview hides the circle rail, the
sidebar and the page, leaving one slim bar, the preview and Flint.

1. Enter from the sidebar's Preview button: body.pvw-focus, the rail / nest / main are gone, the preview pane fills
   the window, the hash is #/preview/<project>.
2. Back to app returns to exactly where you were (the view and the hash); browser Back does the same.
3. Quick jump to Chat (and Tasks) leaves the workspace; the "Back to preview" pill brings it back.
4. Esc peels layers: comment mode → edit/picker mode → the workspace.
5. The ⋯ menu holds the secondary tools (screenshot, desktop shortcut).
6. A deep link (#/preview/<project>) opens straight into the workspace.
7. Phones (390 px): full-screen preview, Back in the bar, Flint as a bottom sheet.
Usage: python app/test/e2e_preview_focus.py [--shots]   (SHOTS_DIR=... to choose where screenshots go)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4951 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
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
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text
            and "EventSource" not in m.text and "jsdelivr" not in m.text and "unpkg" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"preview-focus-{name}.png"))


FOCUS = "document.body.classList.contains('pvw-focus')"
HIDDEN = "s => { const e = document.querySelector(s); return !e || e.offsetParent === null || getComputedStyle(e).display === 'none'; }"


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="tribe-pvfocus-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="pvfocus-src-", dir="/tmp")
    repo = os.path.join(work, "gems"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Gems\n")
    Path(repo, "index.html").write_text("<!doctype html><title>Gems</title><h1>Gems</h1><p>Hello.</p>")
    git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Focus"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        gp = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, gp))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % gp, timeout=15000)

            # ---- 1: enter from the sidebar's Preview button, after going to Chat ----
            host.evaluate("TribeShell.go('chat')")
            host.wait_for_function("document.body.dataset.view === 'chat'", timeout=5000)
            before_hash = host.evaluate("location.hash")
            btn = host.locator("#side-preview, [data-side-preview], .side-preview, button:has-text('Preview')").first
            if btn.count() and btn.is_visible(): btn.click()
            else: host.evaluate("TribePreview.open()")
            host.wait_for_function(FOCUS, timeout=8000)
            host.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            for s in ("#tour-rail", "#tour-side", "#main", ".titlebar"):
                assert host.evaluate(HIDDEN, s), f"{s} should be hidden in the focused preview"
            w = host.evaluate("document.querySelector('#pvw').getBoundingClientRect().width")
            assert w >= 1400, f"the workspace fills the window (got {w})"
            assert host.evaluate("location.hash").startswith("#/preview/"), host.evaluate("location.hash")
            assert host.locator("#pvw .pvw-back").is_visible() and host.locator("#pvw [data-jump='chat']").is_visible()
            assert host.locator("#pvf.is-open").count() == 1, "Flint is open beside the preview"
            assert host.inner_text("#pvw-pname").strip(), "the project name is in the bar"

            # ---- 2: Back to app returns to Chat; browser Back too ----
            host.click("#pvw .pvw-back")
            host.wait_for_function("!" + FOCUS, timeout=5000)
            host.wait_for_function("document.body.dataset.view === 'chat'", timeout=3000)
            assert not host.evaluate("location.hash").startswith("#/preview"), host.evaluate("location.hash")
            assert host.evaluate("location.hash") == before_hash, (host.evaluate("location.hash"), before_hash)
            assert not host.evaluate(HIDDEN, "#main"), "the app is back"
            host.evaluate("TribePreview.open()"); host.wait_for_function(FOCUS, timeout=8000)
            host.go_back()
            host.wait_for_function("!" + FOCUS, timeout=5000)
            assert host.evaluate("document.body.dataset.view") == "chat"

            # ---- 3: quick jumps and the pill back ----
            host.evaluate("TribePreview.open()"); host.wait_for_function(FOCUS, timeout=8000)
            host.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            host.click("#pvw [data-jump='ws-tasks']")
            host.wait_for_function("!" + FOCUS, timeout=5000)
            host.wait_for_function("document.body.dataset.view === 'tasks'", timeout=5000)
            host.wait_for_selector("#pvw-ret:not(.hidden) [data-ret='go']", timeout=3000)
            host.click("#pvw-ret [data-ret='go']")
            host.wait_for_function(FOCUS, timeout=8000)
            host.click("#pvw [data-jump='chat']")
            host.wait_for_function("!" + FOCUS + " && document.body.dataset.view === 'chat'", timeout=5000)
            host.click("#pvw-ret [data-ret='go']")
            host.wait_for_function(FOCUS, timeout=8000)
            host.wait_for_selector("#pvw #pvw-iframe", timeout=10000)

            # ---- 4: Esc peels layers ----
            host.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            if host.evaluate("!!(window.TribePins && TribePins.toggle)"):
                host.wait_for_selector("#pvw [data-pin-act='comment']", timeout=5000)
                host.click("#pvw [data-pin-act='comment']")
                host.wait_for_function("document.querySelector('#pvw [data-pin-act=comment]').getAttribute('aria-pressed') === 'true'", timeout=3000)
                host.keyboard.press("Escape")
                host.wait_for_function("document.querySelector('#pvw [data-pin-act=comment]').getAttribute('aria-pressed') === 'false'", timeout=3000)
                assert host.evaluate(FOCUS), "Esc closed comment mode, not the workspace"
            host.click("#pvw [data-act='edit']")
            host.wait_for_function("document.querySelector('#pvw .pvw-edit').getAttribute('aria-pressed') === 'true'", timeout=3000)
            host.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            host.keyboard.press("Escape")
            host.wait_for_function("document.querySelector('#pvw .pvw-edit').getAttribute('aria-pressed') === 'false'", timeout=3000)
            assert host.evaluate(FOCUS), "Esc left edit mode, not the workspace"
            host.focus("#flm-in-preview"); host.keyboard.press("Escape")
            assert host.evaluate(FOCUS), "Esc in Flint's box only leaves the box"
            # ---- 5: the ⋯ menu ----
            assert not host.locator("#pvw [data-act='shot']").is_visible(), "screenshot is tucked into ⋯"
            host.click("#pvw [data-act='more']")
            host.wait_for_selector("#pvw-more:not(.hidden) [data-act='shot']", timeout=2000)
            host.keyboard.press("Escape")
            host.wait_for_selector("#pvw-more.hidden", state="attached", timeout=2000)
            assert host.evaluate(FOCUS)
            # Ctrl / while previewing: the Preview shortcuts come first (polish, docs/POLISH-AUDIT.md)
            host.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
            host.keyboard.press("Control+/"); host.wait_for_selector("#help-keys .hk-here", timeout=3000)
            assert "preview" in host.inner_text("#help-keys .hk-here").lower(), host.inner_text("#help-keys .hk-here")
            host.click("#hk-close")
            host.keyboard.press("Escape")
            host.wait_for_function("!" + FOCUS, timeout=3000)

            # ---- screenshots with a real build picked ----
            if take:
                host.evaluate("TribePreview.open()"); host.wait_for_function(FOCUS, timeout=8000)
                host.wait_for_selector("#pvf.is-open #flm-in-preview", timeout=5000)
                host.fill("#flm-in-preview", "make a landing page for Sunrise Bakery in green"); host.press("#flm-in-preview", "Enter")
                host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread > :not(.streaming)')].some(li => /Built a landing page/i.test(li.innerText))", timeout=15000)
                host.evaluate("TribePreview.close()"); host.wait_for_timeout(300)
                for (vw, vh, nm) in ((1440, 900, "1440"), (1235, 776, "1235")):
                    host.set_viewport_size({"width": vw, "height": vh})
                    host.evaluate("TribePreview.show('builds/sunrise-bakery/')"); host.wait_for_function(FOCUS, timeout=8000)
                    host.wait_for_selector("#pvw #pvw-iframe", timeout=10000); host.wait_for_timeout(1200)
                    h1 = host.frame_locator('#pvw-iframe').locator('h1').first.inner_text().strip()
                    host.evaluate("t => TribePreviewFlint.pick({ tag: 'h1', text: t, rect: { left: 60, top: 120, width: 420, height: 60 } })", h1)
                    host.wait_for_function("(document.querySelector(\"#pvf-props input[data-prop='font-size']\") || {}).value", timeout=5000)
                    shot(host, nm)
                    host.evaluate("TribePreview.close()"); host.wait_for_timeout(300)
                host.set_viewport_size({"width": 1440, "height": 900})

            # ---- 4b: the Properties sheet follows the live element: a pick without styles is looked up again; a gone one clears ----
            host.evaluate("TribePreview.open()"); host.wait_for_function(FOCUS, timeout=8000)
            host.wait_for_selector("#pvw.ready #pvw-iframe", timeout=10000)
            host.evaluate("TribePreviewFlint.pick({ tag: 'h1', text: 'Gems', rect: { left: 10, top: 10, width: 100, height: 40 } })")
            host.wait_for_function("(document.querySelector(\"#pvf-props input[data-prop='font-size']\") || {}).value === '32px'", timeout=5000)
            assert host.evaluate("TribePreviewFlint.picked().path").startswith('body>'), 'the fresh pick carries a path to find it again'
            host.evaluate("TribePreviewFlint.pick({ tag: 'h2', text: 'Not on this page', rect: { left: 10, top: 10, width: 100, height: 40 } })")
            host.wait_for_function("!TribePreviewFlint.picked() && document.querySelector('#pvf-pick').classList.contains('hidden')", timeout=5000)
            # centred: the device frame sits in the middle of the canvas, no dead band
            g = host.evaluate("(() => { const s = document.querySelector('#pvw-stage').getBoundingClientRect(), f = document.querySelector('#pvw-frame').getBoundingClientRect(); return [f.left - s.left, s.right - f.right, f.top - s.top, s.bottom - f.bottom]; })()")
            assert abs(g[0] - g[1]) <= 3 and abs(g[2] - g[3]) <= 3 and g[2] <= 30, f'frame centred and filling the canvas: {g}'
            host.evaluate("TribePreview.close()"); host.wait_for_function("!" + FOCUS, timeout=3000)

            # ---- 6: deep link ----
            dl = ctx.new_page(); watch(dl, "deeplink")
            dl.goto(BASE + f"/?skipIntro=1#/preview/{gp}")
            dl.wait_for_function(FOCUS, timeout=15000)
            dl.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            dl.click("#pvw .pvw-back")
            dl.wait_for_function("!" + FOCUS, timeout=5000)
            assert not dl.evaluate("location.hash").startswith("#/preview")
            dl.close()

            # ---- 7: phones ----
            pc = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pc.add_init_script(settings_js("Camp", camp, gp))
            ph = pc.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % gp, timeout=15000)
            ph.evaluate("TribePreview.open()")
            ph.wait_for_function(FOCUS, timeout=8000)
            ph.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            assert ph.locator("#pvw .pvw-back").is_visible(), "Back in the phone bar"
            assert not ph.locator("#pvw .pvw-jump").is_visible(), "no quick-jump row on phones"
            r = ph.evaluate("(() => { const e = document.querySelector('#pvw'); const b = e.getBoundingClientRect(); return [b.width, b.height]; })()")
            assert r[0] >= 389 and r[1] >= 800, f"full screen on phones: {r}"
            assert ph.evaluate("getComputedStyle(document.querySelector('#pvf')).position") == "absolute", "Flint is a bottom sheet on phones"
            shot(ph, "phone")
            ph.click("#pvw .pvw-back")
            ph.wait_for_function("!" + FOCUS, timeout=5000)
            pc.close()
            b.close()
        if errors: raise AssertionError("page errors:\n" + "\n".join(errors[:10]))
        print("e2e_preview_focus: OK (enter, back, browser back, quick jumps + pill, Esc layers, ⋯ menu, deep link, phone)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
