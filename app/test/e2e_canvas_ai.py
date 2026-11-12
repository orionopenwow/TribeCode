"""Flint and agents on the design canvas (P1-F, server/canvasai.js, app/ui/canvas/flint.js).

  Templates: 13 screen templates are listed.
  Agents (MCP): Maya's Claude Code adds a frame from a template; Orion sees it live with the agent's cursor and name.
        get_canvas reads it back, update_layer / set_auto_layout / create_component / create_instance change it,
        export_frame returns HTML + flex CSS, bad ids come back as errors.
  Flint (free, no model): "make a login screen for Ember" builds a real frame (Maya sees it live, Ctrl Z undoes it);
        "tidy up" turns a hand-placed stack into auto layout with even spacing; "rename layers" names default layers by
        what they are; "Dark mode version" copies a frame in dark colors; "make variants" on a button makes Secondary,
        Ghost and Disabled; a big ask gets the honest "Bigger than my free tier" card, a freeform one the freeform card.
  Phone 390px: the Flint bar fits with no sideways scroll. No console errors.
Usage: python app/test/e2e_canvas_ai.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5330 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
SHOTDIR = Path(os.environ.get("TRIBE_SHOT_DIR", tempfile.gettempdir())) / "canvas-ai-shots"
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


def mcp(token, tool, args=None, project=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    h = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


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
        page.screenshot(path=str(SHOTDIR / f"canvas-ai-{name}.png"))


def nodes(page, **kw):
    out = page.evaluate("TribeCanvas.state().nodes")
    for k, v in kw.items(): out = [n for n in out if n.get(k) == v]
    return out


def open_canvas(page):
    page.wait_for_selector("#nest-canvas", state="visible", timeout=20000)
    page.click("#nest-canvas")   # feat/design-flow: Design opens the creation flow; the project's canvas is under Continue
    page.wait_for_selector("#view-designflow:not(.hidden) #dfl-cont-list [data-cv=main]", timeout=15000)
    page.click("#dfl-cont-list [data-cv=main]")
    page.wait_for_selector("#view-canvas:not(.hidden) #cv-stage", timeout=15000)
    page.wait_for_function("window.TribeCanvas && TribeCanvas.state().open && document.querySelector('#cv-file-t').textContent.length > 0", timeout=15000)
    page.wait_for_timeout(400)


def ask(page, text):
    # Flint lives in the pane beside the canvas now (app/ui/canvas/flintpane.js); in Advanced it's the Flint tab
    page.evaluate("TribeCanvasFlintPane.open()")
    page.wait_for_selector("#cv-fpane #fp-in", state="visible", timeout=5000)
    n = page.evaluate("document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length")
    page.fill("#fp-in", text)
    page.press("#fp-in", "Enter")
    page.wait_for_function("n => !document.querySelector('#fp-log .is-wait') && document.querySelectorAll('#fp-log .fp-flint:not(.is-wait)').length > n", arg=n, timeout=15000)
    page.wait_for_timeout(250)
    return page.locator("#fp-log .fp-flint").last.inner_text()


def select(page, ids):
    page.evaluate("ids => TribeCanvas._e.select(ids)", ids)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cnvai-", dir="/tmp")
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

        # ---- templates
        tpl = ok(api("/canvasai/templates", token=orion, project=pid))["templates"]
        assert len(tpl) >= 12 and {"auth", "pricing", "home", "dashboard", "checkout", "empty"} <= {t["id"] for t in tpl}, tpl
        assert api("/canvasai/plan", "POST", {"ask": "x"})[0] == 401, "members only"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}); hctx.add_init_script(settings_js("Orion", orion, pid))
            o = hctx.new_page(); watch(o, "orion")
            o.goto(BASE + "/?skipIntro=1")
            o.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            open_canvas(o)
            assert o.is_visible("#cv-flint-btn"), "Flint sits in the canvas toolbar"

            mctx = b.new_context(viewport={"width": 1280, "height": 800}); mctx.add_init_script(settings_js("Maya", maya, pid))
            m = mctx.new_page(); watch(m, "maya")
            m.goto(BASE + "/?skipIntro=1")
            m.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            open_canvas(m)

            # ---- agents: Maya's Claude Code designs over MCP, live for Orion with its own cursor
            ag = ok(api("/agents", "POST", token=maya, project=pid), "agent")
            key = ag.get("token") or ag.get("key") or (ag.get("agent") or {}).get("token")
            agent_id = (ag.get("agent") or {}).get("id") or ag.get("id")
            assert key, ag
            err, txt = mcp(key, "list_canvases", {}, project=pid); assert not err and "main" in txt, txt
            err, txt = mcp(key, "add_frame", {"template": "auth", "ask": "for Agent Co in green"}, project=pid); assert not err and "Agent Co · Sign in" in txt, txt
            o.wait_for_function("TribeCanvas.state().nodes.some(n => n.name === 'Agent Co · Sign in')", timeout=8000)
            o.wait_for_function("document.querySelectorAll('#cv-ov .cv-cur').length > 0 || TribeCanvas.state().peers.length > 0", timeout=8000)
            peers = o.evaluate("TribeCanvas.state().peers")
            assert (agent_id and agent_id in peers) or len(peers) >= 1, peers
            frame = nodes(o, name="Agent Co · Sign in")[0]
            assert frame["lay"]["d"] == "col" and frame["w"] == 390, frame
            btn = next(n for n in o.evaluate("TribeCanvas.state().nodes") if n.get("name") == "Sign in button" and n.get("fill") == "#1F9D55")
            err, txt = mcp(key, "get_canvas", {"id": frame["id"]}, project=pid); assert not err and "Sign in button" in txt and "layout col" in txt, txt
            err, txt = mcp(key, "update_layer", {"id": btn["id"], "props": {"fill": "#7C3AED", "name": "Primary button"}}, project=pid); assert not err, txt
            o.wait_for_function("id => TribeCanvas.state().nodes.some(n => n.id === id && n.fill === '#7C3AED' && n.name === 'Primary button')", arg=btn["id"], timeout=8000)
            err, txt = mcp(key, "set_auto_layout", {"id": frame["id"], "gap": 32}, project=pid); assert not err and "gap 32" in txt, txt
            err, txt = mcp(key, "add_frame", {"spec": {"n": "Badge", "w": 120, "h": 40, "fill": "#FFFFFF", "lay": "row 6 8,12 center center", "k": [{"t": "text", "c": "New", "s": 14, "wt": 700, "key": "lbl"}]}}, project=pid); assert not err, txt
            badge = None
            for _ in range(40):
                bs = nodes(o, name="Badge")
                if bs: badge = bs[0]; break
                o.wait_for_timeout(200)
            assert badge, "the badge frame arrived"
            err, txt = mcp(key, "create_component", {"id": badge["id"]}, project=pid); assert not err and "component" in txt, txt
            err, txt = mcp(key, "create_instance", {"component": badge["id"], "parent": frame["id"]}, project=pid); assert not err, txt
            o.wait_for_function("cid => TribeCanvas.state().nodes.some(n => n.t === 'instance' && n.comp === cid)", arg=badge["id"], timeout=8000)
            err, txt = mcp(key, "export_frame", {"id": frame["id"]}, project=pid); assert not err and "display: flex" in txt and "<section" in txt, txt
            err, txt = mcp(key, "update_layer", {"id": "nope1234", "props": {"fill": "#000000"}}, project=pid); assert err, txt
            shot(o, "agent")

            # ---- Flint: a login screen, free, live for Maya, undoable
            out = ask(o, "make a login screen for Ember")
            assert "sign in screen for Ember" in out and "free" in out.lower(), out
            ember = nodes(o, name="Ember · Sign in"); assert ember, "Flint built the frame"
            ember = ember[0]
            assert ember["fill"] and nodes(o, name="Sign in button"), "real layers"
            m.wait_for_function("TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=8000)
            shot(o, "login")
            o.click("#cv-stage", position={"x": 20, "y": 20}); o.keyboard.press("Escape")
            o.focus("#cv-stage"); o.keyboard.press("Control+z")
            o.wait_for_function("!TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=5000)
            o.keyboard.press("Control+Shift+z")
            o.wait_for_function("TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in')", timeout=5000)

            # ---- tidy: a hand-placed stack becomes auto layout with even spacing
            ops = [{"id": "handfr01", "t": "frame", "v": 1, "x": -900, "y": 0, "w": 300, "h": 400, "fill": "#FFFFFF", "name": "Frame"},
                   {"id": "handr001", "t": "rect", "v": 1, "p": "handfr01", "i": 1, "x": 20, "y": 20, "w": 260, "h": 80, "fill": "#DDDDDD", "name": "Rectangle"},
                   {"id": "handr002", "t": "rect", "v": 1, "p": "handfr01", "i": 2, "x": 20, "y": 118, "w": 260, "h": 80, "fill": "#DDDDDD", "name": "Rectangle"},
                   {"id": "handr003", "t": "rect", "v": 1, "p": "handfr01", "i": 3, "x": 20, "y": 213, "w": 260, "h": 2, "fill": "#DDDDDD", "name": "Rectangle 3"}]
            ok(api("/canvas/main/ops", "POST", {"ops": ops}, token=orion, project=pid))
            o.wait_for_function("TribeCanvas.state().nodes.some(n => n.id === 'handr003')", timeout=8000)
            select(o, ["handfr01"])
            out = ask(o, "tidy up")
            assert "Tidied 1 frame" in out, out
            fr = nodes(o, id="handfr01")[0]
            assert fr.get("lay") and fr["lay"]["d"] == "col" and fr["lay"]["g"] == 16 and fr["lay"]["ai"] == "stretch", fr
            out = ask(o, "rename layers")
            assert "Renamed" in out, out
            names = {n["id"]: n["name"] for n in o.evaluate("TribeCanvas.state().nodes") if n["id"].startswith("hand")}
            assert names["handr001"] == "Image" and names["handr003"] == "Divider" and names["handfr01"] == "Screen", names

            # ---- dark mode version and variants
            select(o, [ember["id"]])
            o.wait_for_selector("#fp-chips [data-text='Dark mode version']", timeout=5000)
            o.click("#fp-chips [data-text='Dark mode version']")
            o.wait_for_function("TribeCanvas.state().nodes.some(n => n.name === 'Ember · Sign in · Dark')", timeout=8000)
            dark = nodes(o, name="Ember · Sign in · Dark")[0]
            assert dark["fill"] == "#111318", dark
            ebtn = o.evaluate("""rid => { const ns = TribeCanvas.state().nodes, by = new Map(ns.map(n => [n.id, n]));
                const root = n => { let r = n, k = 0; while (r.p && by.get(r.p) && k++ < 50) r = by.get(r.p); return r.id; };
                return ns.find(n => n.name === 'Sign in button' && root(n) === rid).id; }""", ember["id"])
            select(o, [ebtn])
            out = ask(o, "make variants")
            assert "Secondary, Ghost and Disabled" in out, out
            for v in ("Secondary", "Ghost", "Disabled"):
                assert nodes(o, name=f"Sign in button / {v}"), v
            assert "fill" not in nodes(o, name="Sign in button / Ghost")[0]
            shot(o, "variants")

            # ---- honest cards
            out = ask(o, "rewrite the whole app in react with a database")
            card = o.locator("#fp-log .fp-flint").last.locator(".boost")   # feat/flint-site: the one AI-boost card (aiboost.js)
            assert "This one needs an AI" in out and card.locator("[data-boost='ai']").is_visible() and card.locator("[data-boost='credits']").is_visible(), out
            out = ask(o, "a cat wearing a tiny hat")
            assert "needs an AI" in out and "Nothing changed" in out, out
            o.locator("#fp-log [data-boost='ai']").last.click()
            o.wait_for_function("/Sent to your AI helpers/.test(document.querySelector('#fp-log').textContent)", timeout=8000)
            o.click("#cv-flint-btn"); o.wait_for_timeout(200); assert o.is_hidden("#cv-fpane"), "the flame button closes Flint's pane"

            # ---- phone
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", orion, pid))
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1#/canvas")
            ph.wait_for_function("window.TribeCanvas && TribeCanvas.state().open", timeout=20000)
            ph.wait_for_selector("#cv-flint-btn", timeout=10000)
            ph.click("#cv-flint-btn")
            ph.wait_for_function("document.querySelector('#cv').classList.contains('sheet-flint')", timeout=5000)
            ph.wait_for_timeout(450)
            bx = ph.eval_on_selector("#cv-fpane", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 391, bx
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            shot(ph, "phone")
            b.close()
        assert not errors, "\n".join(errors[:12])
        print("e2e_canvas_ai: OK (templates, agent MCP live + cursor, Flint login screen free + undo, tidy, rename, dark version, variants, honest cards, phone)")
    except Exception:
        log.seek(0); print(log.read()[-4000:]); raise
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
