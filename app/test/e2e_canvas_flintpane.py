"""Talk to Flint beside the design canvas, like Figma Make (app/ui/canvas/flintpane.js, server/canvaschat.js).

  Simple (the default for new people): the canvas and Flint's pane only, no layers or properties.
  "make a login screen for Ember" in the pane builds a real frame for free; Maya sees Orion's message (with his name)
  and Flint's reply live; the message's own Undo removes the frame and both see "Undone".
  The quick bar over a selection: Bigger makes the frame bigger.
  Advanced (top bar switch): layers + properties come back and Flint is a tab; the choice survives a reload;
  Ctrl Shift \\ switches back. The right toggle hides and shows Flint in Simple.
  Phone 390px: Flint opens as a bottom sheet, no sideways scroll. No console errors.
Usage: python app/test/e2e_canvas_flintpane.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5360 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
SHOTDIR = Path(os.environ.get("TRIBE_SHOT_DIR", tempfile.gettempdir())) / "canvas-flintpane-shots"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
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


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS:
        SHOTDIR.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTDIR / f"flintpane-{name}.png"))


def names(page):
    return [n.get("name") for n in page.evaluate("TribeCanvas.state().nodes")]


def open_canvas(page):
    page.goto(BASE + "/?skipIntro=1&flintpane=1#/canvas")
    page.wait_for_function("window.TribeCanvas && TribeCanvas.state().open && document.querySelector('#cv-file-t').textContent.length > 0", timeout=20000)
    page.wait_for_selector("#cv-fpane", state="attached", timeout=10000)
    page.wait_for_timeout(500)


def ask(page, text):
    n = page.evaluate("document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length")
    page.fill("#fp-in", text)
    page.press("#fp-in", "Enter")
    page.wait_for_function("n => !document.querySelector('#fp-log .is-wait') && document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length > n", arg=n, timeout=15000)
    page.wait_for_timeout(250)
    return page.locator("#fp-log .fp-flint").last.inner_text()


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-fpane-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Design Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=orion))["projects"][0]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        assert api("/canvaschat/main")[0] == 401, "members only"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}); hctx.add_init_script(settings_js("Orion", orion, pid))
            o = hctx.new_page(); watch(o, "orion")
            open_canvas(o)

            # ---- Simple by default: canvas + Flint, no layers or properties
            assert o.is_visible("#cv-fpane") and o.is_visible("#fp-in"), "Flint's pane is beside the canvas"
            assert o.is_hidden("#cv-left") and o.is_hidden("#cv-right"), "no layers or properties in Simple"
            assert o.get_attribute("#cv-mode [data-mode='simple']", "aria-checked") == "true"
            assert o.is_visible(".fp-hello"), "a first hint"
            sb, pb = o.eval_on_selector("#cv-stage", "e => e.getBoundingClientRect().toJSON()"), o.eval_on_selector("#cv-fpane", "e => e.getBoundingClientRect().toJSON()")
            assert sb["width"] > 900 and abs(sb["right"] - pb["left"]) < 2, (sb, pb)
            shot(o, "simple-empty")

            mctx = b.new_context(viewport={"width": 1280, "height": 800}); mctx.add_init_script(settings_js("Maya", maya, pid))
            m = mctx.new_page(); watch(m, "maya")
            open_canvas(m)

            # ---- ask in the pane: a real frame, live for Maya with Orion's name
            out = ask(o, "make a login screen for Ember")
            assert "sign in screen for Ember" in out, out
            assert "Ember · Sign in" in names(o), "Flint built the frame"
            assert "You" in o.locator("#fp-log .fp-me").last.inner_text()
            m.wait_for_function("[...document.querySelectorAll('#fp-log .fp-me')].some(e => /Orion/.test(e.textContent) && /login screen for Ember/.test(e.textContent))", timeout=8000)
            m.wait_for_function("[...document.querySelectorAll('#fp-log .fp-flint')].some(e => /sign in screen for Ember/.test(e.textContent))", timeout=8000)
            m.wait_for_function("TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=8000)
            shot(o, "simple-built")
            o.set_viewport_size({"width": 1235, "height": 776}); o.wait_for_timeout(300); shot(o, "simple-1235"); o.set_viewport_size({"width": 1440, "height": 900})

            # ---- the quick bar over a selection
            fid = next(n["id"] for n in o.evaluate("TribeCanvas.state().nodes") if n.get("name") == "Ember · Sign in")
            o.evaluate("id => TribeCanvas._e.select([id])", fid)
            o.wait_for_selector("#fp-quick:not([hidden])", timeout=3000)
            w0 = next(n["w"] for n in o.evaluate("TribeCanvas.state().nodes") if n["id"] == fid)
            o.click("#fp-quick [data-q='bigger']")
            o.wait_for_function("([id, w]) => TribeCanvas.state().nodes.find(n => n.id === id).w > w", arg=[fid, w0], timeout=3000)
            o.focus("#cv-stage"); o.keyboard.press("Control+z")
            o.wait_for_function("([id, w]) => TribeCanvas.state().nodes.find(n => n.id === id).w === w", arg=[fid, w0], timeout=3000)

            # ---- the message's own Undo
            o.locator("#fp-log .fp-flint").last.locator("[data-fp='undo']").click()
            o.wait_for_function("!TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=5000)
            o.wait_for_selector("#fp-log .fp-flint.is-undone", timeout=5000)
            m.wait_for_selector("#fp-log .fp-flint.is-undone", timeout=8000)
            m.wait_for_function("!TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=8000)
            ask(o, "a pricing section")   # something on the canvas for the screenshots
            # ---- the local brain: a non-design ask (a task) is done right here in the pane, no model
            out = ask(o, "add a task to order samples for friday")
            assert "order samples" in out.lower(), out
            ts = ok(api("/tasks", token=orion, project=pid)).get("tasks", [])
            assert any("order samples" in t.get("title", "").lower() for t in ts), ts

            # ---- the right toggle hides and shows Flint in Simple
            o.click("#cv-tog-right"); o.wait_for_timeout(150); assert o.is_hidden("#cv-fpane"), "toggle hides Flint"
            o.click("#cv-flint-btn"); o.wait_for_timeout(150); assert o.is_visible("#cv-fpane"), "the flame button opens Flint"

            # ---- Advanced: the full editor, Flint as a tab; remembered; Ctrl Shift \ switches back
            o.click("#cv-mode [data-mode='advanced']")
            o.wait_for_timeout(200)
            assert o.is_visible("#cv-left") and o.is_visible("#cv-right") and o.is_visible("#cv-props"), "layers and properties"
            assert o.is_visible(".cv-rtabs [data-rtab='flint']") and o.is_hidden("#cv-fpane"), "Flint is a tab"
            shot(o, "advanced")
            o.click(".cv-rtabs [data-rtab='flint']")
            o.wait_for_selector("#cv-right #cv-fpane #fp-in", state="visible", timeout=3000)
            assert o.locator("#fp-log .fp-flint").count() >= 2, "same thread in the tab"
            shot(o, "advanced-flint")
            o.set_viewport_size({"width": 1235, "height": 776}); o.wait_for_timeout(300); shot(o, "advanced-1235"); o.set_viewport_size({"width": 1440, "height": 900})
            o.reload()
            o.wait_for_function("window.TribeCanvas && TribeCanvas.state().open", timeout=20000); o.wait_for_timeout(500)
            assert o.is_visible("#cv-left") and o.get_attribute("#cv-mode [data-mode='advanced']", "aria-checked") == "true", "Advanced survives a reload"
            o.focus("#cv-stage"); o.keyboard.press("Control+Shift+Backslash"); o.wait_for_timeout(200)
            assert o.is_hidden("#cv-left") and o.is_visible("#cv-fpane"), "Ctrl Shift \\ back to Simple"

            # ---- phone: a bottom sheet
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", orion, pid))
            ph = pctx.new_page(); watch(ph, "phone")
            open_canvas(ph)
            ph.click("#cv-flint-btn")
            ph.wait_for_function("document.querySelector('#cv').classList.contains('sheet-flint')", timeout=5000)
            ph.wait_for_timeout(450)
            bx = ph.eval_on_selector("#cv-fpane", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 391 and bx["bottom"] <= 845 and bx["top"] > 200, bx
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            shot(ph, "phone")
            b.close()
        assert not errors, "\n".join(errors[:12])
        print("e2e_canvas_flintpane: OK (Simple default, ask builds a frame, live for a friend, per-message undo, quick bar, toggle, Advanced tab + persists, Ctrl Shift \\, phone sheet)")
    except Exception:
        log.seek(0); print(log.read()[-4000:]); raise
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
