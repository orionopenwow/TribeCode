"""Design canvas (app/ui/canvas/*, server/canvas.js): P1-A canvas core, P1-B layers + properties + auto layout,
P1-D components (docs/EDITOR-PARITY.md).

  API: spectators get 403, stale versions come back as rejected, unknown layer types are ignored.
  Draw: F drags a frame, R a rectangle inside it (nested), T a text layer (real, editable text).
  Snap: a dragged rectangle snaps to its neighbour's edge.
  Auto layout: Shift A gives the frame flex layout; adding a child makes the hugging frame grow; changing the gap in the
        properties panel reflows it for a second member live.
  Components: Ctrl Alt K makes a main component; Assets places a copy; editing the main updates the copy; an override
        on the copy survives a later main edit; Detach makes it a plain frame.
  Undo/redo per person; a reload keeps everything (and it's on disk in .tribe/canvas/main.json).
  Live: a second member sees new layers and the first member's cursor. Export: a frame becomes HTML + flex CSS.
  Phone 390px: the stage fills the screen, layers and properties open as sheets, tap selects, drag moves, no sideways
        scroll. No console errors.
Usage: python app/test/e2e_canvas.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5290 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
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
        page.wait_for_timeout(400)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"canvas-{name}.png"))


def st(page):
    return page.evaluate("TribeCanvas.state()")


def nodes(page, **kw):
    out = st(page)["nodes"]
    for k, v in kw.items(): out = [n for n in out if n.get(k) == v]
    return out


def scr(page, wx, wy):
    """world point -> page coordinates"""
    return page.evaluate("([x, y]) => { const r = document.querySelector('#cv-stage').getBoundingClientRect(), v = TribeCanvas.state().view; return [r.left + v.x + x * v.z, r.top + v.y + y * v.z]; }", [wx, wy])


def drag(page, a, b, steps=10, mods=None):
    page.mouse.move(*a)
    if mods: page.keyboard.down(mods)
    page.mouse.down()
    for i in range(1, steps + 1): page.mouse.move(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps)
    page.mouse.up()
    if mods: page.keyboard.up(mods)
    page.wait_for_timeout(120)


def open_canvas(page):
    page.wait_for_selector("#nest-canvas", state="visible", timeout=20000)
    page.click("#nest-canvas")   # feat/design-flow: Design opens the creation flow; the project's canvas is under Continue
    page.wait_for_selector("#view-designflow:not(.hidden) #dfl-cont-list [data-cv=main]", timeout=15000)
    page.click("#dfl-cont-list [data-cv=main]")
    page.wait_for_selector("#view-canvas:not(.hidden) #cv-stage", timeout=15000)
    page.wait_for_function("window.TribeCanvas && TribeCanvas.state().open && document.querySelector('#cv-file-t').textContent.length > 0", timeout=15000)
    page.wait_for_timeout(400)


def box(page, nid):
    return page.evaluate("id => TribeCanvas.box(id)", nid)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cnv-", dir="/tmp")
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
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---- API
        lst = ok(api("/canvas", token=orion, project=pid))
        assert [f["id"] for f in lst["files"]] == ["main"] and lst["canEdit"], lst
        assert ok(api("/canvas", token=sam, project=pid))["canEdit"] is False
        rect = {"id": "apirect1", "t": "rect", "v": 1, "x": 0, "y": 0, "w": 10, "h": 10, "fill": "#FF0000"}
        assert api("/canvas/main/ops", "POST", {"ops": [rect]}, token=sam, project=pid)[0] == 403, "spectators can't edit"
        assert ok(api("/canvas/main/ops", "POST", {"ops": [{"id": "bad00001", "t": "script", "v": 1}]}, token=orion, project=pid))["applied"] == 0
        ok(api("/canvas/main/ops", "POST", {"ops": [{**rect, "v": 2, "fill": "#00FF00"}]}, token=orion, project=pid))
        r = ok(api("/canvas/main/ops", "POST", {"ops": [{**rect, "v": 1, "fill": "#0000FF"}]}, token=maya, project=pid))
        assert r["applied"] == 0 and r["rejected"][0]["fill"] == "#00FF00", r
        ok(api("/canvas/main/ops", "POST", {"ops": [{"id": "apirect1", "del": True, "v": 3}]}, token=orion, project=pid))
        ok(api("/vision", "PUT", {"text": "# Café\n\nA café app."}, token=orion, project=pid))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}); hctx.add_init_script(settings_js("Orion", orion, pid))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            open_canvas(host)
            assert host.is_visible("#cv-empty"), "a blank canvas shows its empty state"
            assert host.evaluate("getComputedStyle(document.querySelector('.window > .panel')).display") == "none", "the right panel steps aside"

            mctx = b.new_context(viewport={"width": 1280, "height": 800}); mctx.add_init_script(settings_js("Maya", maya, pid))
            mp = mctx.new_page(); watch(mp, "maya")
            mp.goto(BASE + "/?skipIntro=1")
            mp.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            open_canvas(mp)

            # ---- draw a frame (F), a rectangle inside it (R), and a text layer (T)
            host.click("#cv-stage", position={"x": 5, "y": 5})
            host.keyboard.press("f")
            drag(host, scr(host, 0, 0), scr(host, 360, 400))
            fr = nodes(host, t="frame"); assert len(fr) == 1, fr
            fr = fr[0]; assert abs(fr["w"] - 360) <= 2 and abs(fr["h"] - 400) <= 2 and fr["p"] == "", fr
            assert st(host)["selected"] == [fr["id"]] and st(host)["tool"] == "move", "drawing selects the frame and goes back to Move"
            host.keyboard.press("r")
            drag(host, scr(host, 30, 30), scr(host, 130, 110))
            r1 = nodes(host, t="rect"); assert len(r1) == 1 and r1[0]["p"] == fr["id"], ("rect nested in the frame", r1)
            r1 = r1[0]; assert abs(r1["x"] - 30) <= 2 and abs(r1["w"] - 100) <= 2, r1
            host.keyboard.press("r")
            drag(host, scr(host, 200, 30), scr(host, 300, 110))
            r2 = [n for n in nodes(host, t="rect") if n["id"] != r1["id"]][0]
            # snap: drag r2 so its top sits 3px off r1's bottom edge region -> left edges line up when close
            a = scr(host, 250, 70)
            drag(host, a, (a[0] - 167 * st(host)["view"]["z"], a[1] + 100 * st(host)["view"]["z"]), steps=12)
            r2 = host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id)", r2["id"])
            assert r2["x"] == r1["x"], ("snapped to the neighbour's left edge", r2["x"], r1["x"])
            host.keyboard.press("t")
            host.mouse.click(*scr(host, 30, 260))
            host.wait_for_selector(".cv-n.editing", timeout=5000)
            host.keyboard.press("Control+a"); host.keyboard.type("Hello café")
            host.keyboard.press("Escape")
            host.wait_for_timeout(200)
            tx = nodes(host, t="text"); assert len(tx) == 1 and tx[0]["tx"]["c"] == "Hello café" and tx[0]["p"] == fr["id"], tx
            assert host.locator(f'[data-id="{tx[0]["id"]}"]').inner_text() == "Hello café", "text is real DOM text"
            mp.wait_for_function("() => TribeCanvas.state().nodes.length === 4", timeout=10000)
            host.mouse.move(*scr(host, 100, 200)); host.mouse.move(*scr(host, 110, 210)); host.wait_for_timeout(100); host.mouse.move(*scr(host, 120, 215))
            mp.wait_for_selector(".cv-cur", timeout=8000)
            assert "Orion" in mp.inner_text(".cv-cur"), "Maya sees Orion's cursor"

            # ---- auto layout: Shift A on the frame, then a new child grows the hugging frame
            host.click(f'.cv-row[data-row="{fr["id"]}"]')
            host.locator("#cv-stage").focus()
            host.keyboard.press("Shift+A")
            f2 = host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id)", fr["id"])
            assert f2.get("lay") and f2["lay"]["d"] in ("row", "col") and f2["sz"] == {"h": "hug", "v": "hug"}, f2
            assert host.evaluate(f"getComputedStyle(document.querySelector('[data-id=\"{fr['id']}\"]')).display") == "flex", "auto layout is CSS flex"
            h0 = box(host, fr["id"])
            ids0 = {n["id"] for n in nodes(host)}
            fb = box(host, fr["id"])
            host.keyboard.press("r")
            drag(host, scr(host, fb["x"] + 10, fb["y"] + 10), scr(host, fb["x"] + 90, fb["y"] + 70))
            new = [n for n in nodes(host) if n["id"] not in ids0]; assert len(new) == 1 and new[0]["p"] == fr["id"], new
            h1 = box(host, fr["id"])
            assert (h1["h"] > h0["h"] + 20) or (h1["w"] > h0["w"] + 20), ("the hugging frame grew", h0, h1)
            # change the gap in the properties panel; Maya sees it reflow
            host.click(f'.cv-row[data-row="{fr["id"]}"]')
            host.wait_for_selector('#cv-right input[data-k="gap"]')
            host.fill('#cv-right input[data-k="gap"]', "30"); host.press('#cv-right input[data-k="gap"]', "Enter")
            host.wait_for_timeout(200)
            assert host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id).lay.g", fr["id"]) == 30
            mp.wait_for_function("id => { const n = TribeCanvas.state().nodes.find(n => n.id === id); return n && n.lay && n.lay.g === 30; }", arg=fr["id"], timeout=8000)
            assert mp.evaluate(f"getComputedStyle(document.querySelector('[data-id=\"{fr['id']}\"]')).gap") == "30px", "Maya's frame reflowed"
            shot(host, "autolayout")

            # ---- components: a card frame -> Ctrl Alt K -> place a copy -> main edits propagate, overrides survive
            host.keyboard.press("Escape"); host.keyboard.press("Escape")
            host.keyboard.press("f")
            drag(host, scr(host, 20, 520), scr(host, 220, 600))
            card = nodes(host, t="frame"); card = [n for n in card if n["id"] != fr["id"]][0]
            host.keyboard.press("t"); host.mouse.click(*scr(host, 40, 540))
            host.wait_for_selector(".cv-n.editing"); host.keyboard.press("Control+a"); host.keyboard.type("Latte"); host.keyboard.press("Escape")
            ctext = [n for n in nodes(host, t="text") if n["p"] == card["id"]][0]
            host.click(f'.cv-row[data-row="{card["id"]}"]'); host.locator("#cv-stage").focus()
            host.keyboard.press("Control+Alt+k")
            assert host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id).t", card["id"]) == "component"
            host.click('.cv-ltabs [data-tab="assets"]')
            host.wait_for_selector(f'[data-insert="{card["id"]}"]')
            host.click(f'[data-insert="{card["id"]}"]')
            inst = nodes(host, t="instance"); assert len(inst) == 1 and inst[0]["comp"] == card["id"], inst
            iel = f'[data-id="{inst[0]["id"]}"]'
            assert "Latte" in host.inner_text(iel), "the copy shows the main's text"
            host.click('.cv-ltabs [data-tab="layers"]')
            # edit the main's text through the canvas
            host.dblclick(f'[data-id="{ctext["id"]}"]'); host.wait_for_timeout(100)
            if not host.is_visible(".cv-n.editing"): host.dblclick(f'[data-id="{ctext["id"]}"]')
            host.wait_for_selector(".cv-n.editing"); host.keyboard.press("Control+a"); host.keyboard.type("Mocha"); host.keyboard.press("Escape")
            host.wait_for_function("sel => document.querySelector(sel).innerText.includes('Mocha')", arg=iel, timeout=5000)
            # override the copy's text (double-click inside the instance), then edit the main again
            host.dblclick(f'{iel} [data-src="{ctext["id"]}"]')
            host.wait_for_selector(".cv-n.editing", timeout=5000)
            host.keyboard.press("Control+a"); host.keyboard.type("Chai"); host.keyboard.press("Escape")
            host.wait_for_timeout(200)
            i2 = nodes(host, t="instance")[0]; assert i2["ov"][ctext["id"]]["c"] == "Chai", i2
            host.evaluate("([id]) => TribeCanvas._e.patch(id, { tx: Object.assign({}, TribeCanvas.state().nodes.find(n => n.id === id).tx, { c: 'Espresso' }) })", [ctext["id"]])
            host.wait_for_timeout(150)
            assert "Chai" in host.inner_text(iel) and "Espresso" in host.inner_text(f'[data-id="{card["id"]}"]'), "the override survives a main edit"
            mp.wait_for_function("sel => document.querySelector(sel) && document.querySelector(sel).innerText.includes('Chai')", arg=iel, timeout=8000)
            # undo / redo (per person): undo the main edit, then redo it
            host.locator("#cv-stage").focus()
            host.keyboard.press("Control+z"); host.wait_for_timeout(150)
            assert "Mocha" in host.inner_text(f'[data-id="{card["id"]}"]'), "undo brings back the previous text"
            host.keyboard.press("Control+Shift+z"); host.wait_for_timeout(150)
            assert "Espresso" in host.inner_text(f'[data-id="{card["id"]}"]'), "redo"
            mp.wait_for_function("id => TribeCanvas.state().nodes.find(n => n.id === id).tx.c === 'Espresso'", arg=ctext["id"], timeout=8000)
            assert mp.evaluate("TribeCanvas.state().undo") == 0, "Maya's undo stack is her own"
            shot(host, "components")
            # detach a second copy: it becomes a plain frame with its own layers
            host.evaluate("id => TribeCanvas._e.insertInstance(id)", card["id"])
            inst2 = [n for n in nodes(host, t="instance") if n["id"] != inst[0]["id"]][0]
            host.evaluate("id => TribeCanvas._e.detach(id)", inst2["id"])
            d = host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id)", inst2["id"])
            assert d["t"] == "frame" and any(n["p"] == inst2["id"] for n in nodes(host)), "detached into a frame with children"

            # ---- export: HTML + flex CSS
            ex = host.evaluate("id => TribeCanvas.exportFrame(id)", fr["id"])
            assert "display: flex" in ex["css"] and "gap: 30px" in ex["css"] and "Hello café" in ex["html"], ex
            assert ".tc-design { --color-1:" in ex["css"] and "var(--color-" in ex["css"], "colors are CSS variables in the export"

            # ---- polish (docs/POLISH-AUDIT.md): presets, align + distribute, selection colors, right-click, rotate, live drag
            host.evaluate("TribeCanvas._e.select([])")
            host.wait_for_selector("#cv-props .cvx-preset[data-preset=Phone]", timeout=3000)
            n0 = len(nodes(host))
            host.click("#cv-props .cvx-preset[data-preset=Phone]")
            host.wait_for_function("n => TribeCanvas.state().nodes.length === n + 1", arg=n0, timeout=5000)
            ph_fr = [n for n in nodes(host, t="frame") if n.get("name") == "Phone"]
            assert ph_fr and ph_fr[0]["w"] == 393 and ph_fr[0]["h"] == 852, ph_fr
            host.evaluate("""() => TribeCanvas._e.insert([
              { id: 'polr1', t: 'rect', p: '', i: 1, x: 0, y: 3000, w: 20, h: 20, fill: '#AA0000', name: 'A' },
              { id: 'polr2', t: 'rect', p: '', i: 2, x: 30, y: 3030, w: 20, h: 20, fill: '#AA0000', name: 'B' },
              { id: 'polr3', t: 'rect', p: '', i: 3, x: 200, y: 3060, w: 20, h: 20, fill: '#00AA00', name: 'C' }])""")
            host.wait_for_function("() => ['polr1','polr2','polr3'].every(id => TribeCanvas.state().nodes.some(n => n.id === id))", timeout=5000)
            host.evaluate("TribeCanvas._e.select(['polr1','polr2','polr3']); TribeCanvas._e.fit(true)"); host.wait_for_timeout(200)
            host.wait_for_selector("#cv-props .cvx-align .cvx-ab", timeout=3000)
            host.click("#cv-props [data-align=dh]")
            host.wait_for_function("() => { const x = id => TribeCanvas.state().nodes.find(n => n.id === id).x; return x('polr2') === 100; }", timeout=5000)
            host.keyboard.press("Alt+KeyW")   # align top
            host.wait_for_function("() => ['polr1','polr2','polr3'].every(id => TribeCanvas.state().nodes.find(n => n.id === id).y === 3000)", timeout=5000)
            host.wait_for_selector("#cv-props .cvx-colors .cvx-c", timeout=3000)
            assert host.locator("#cv-props .cvx-colors .cvx-c").count() == 2, "two colours in the selection"
            host.evaluate("""() => { const i = document.querySelector('#cv-props .cvx-c input[data-from="#AA0000"]'); i.value = '#123456'; i.dispatchEvent(new Event('change', { bubbles: true })); }""")
            host.wait_for_function("() => ['polr1','polr2'].every(id => TribeCanvas.state().nodes.find(n => n.id === id).fill === '#123456')", timeout=5000)
            assert host.evaluate("TribeCanvas.state().nodes.find(n => n.id === 'polr3').fill") == "#00AA00"
            # right-click a layer: the layer menu (right-clicking outside the selection selects what's under the pointer)
            host.evaluate("TribeCanvas._e.select(['polr1'])")
            r3 = host.evaluate("document.querySelector(`#cv-world [data-id='polr3']`).getBoundingClientRect().toJSON()")
            host.mouse.click(r3["x"] + r3["width"] / 2, r3["y"] + r3["height"] / 2, button="right")
            host.wait_for_selector("#cv-menu:not([hidden])", timeout=3000)
            mtxt = host.inner_text("#cv-menu")
            assert "Bring to front" in mtxt and "Duplicate" in mtxt and "Create component" in mtxt, mtxt
            assert st(host)["selected"] == ["polr3"], "right-click selects what's under the pointer"
            host.keyboard.press("Escape"); host.evaluate("document.getElementById('cv-menu').hidden = true")
            # rotate handle: drag a quarter turn around the centre, Shift snaps to 15°
            host.evaluate("TribeCanvas._e.select(['polr3'])"); host.wait_for_selector("#cv-ov .cv-rot", timeout=3000)
            rb = host.locator("#cv-ov .cv-rot").bounding_box()
            r3 = host.evaluate("document.querySelector(`#cv-world [data-id='polr3']`).getBoundingClientRect().toJSON()")
            cx, cy = r3["x"] + r3["width"] / 2, r3["y"] + r3["height"] / 2
            host.mouse.move(rb["x"] + rb["width"] / 2, rb["y"] + rb["height"] / 2); host.keyboard.down("Shift"); host.mouse.down()
            for k in range(1, 9): host.mouse.move(cx + 60 * (1 - k / 8), cy + 60 * (k / 8))
            host.mouse.up(); host.keyboard.up("Shift")
            rot = host.evaluate("TribeCanvas.state().nodes.find(n => n.id === 'polr3').rot || 0")
            assert rot != 0 and rot % 15 == 0, rot
            mp.wait_for_function("() => (TribeCanvas.state().nodes.find(n => n.id === 'polr3') || {}).rot", timeout=8000)
            # live drag: Maya sees polr1 move before Orion lets go
            mp.evaluate("TribeCanvas._e.select(['polr1']); TribeCanvas._e.fit(true)")
            r1 = host.evaluate("document.querySelector(`#cv-world [data-id='polr1']`).getBoundingClientRect().toJSON()")
            host.mouse.move(r1["x"] + 10, r1["y"] + 10); host.mouse.down()
            for k in range(1, 12): host.mouse.move(r1["x"] + 10 + k * 8, r1["y"] + 10 + k * 3); host.wait_for_timeout(30)
            mp.wait_for_selector("#cv-world [data-id='polr1'].cv-peerdrag", timeout=5000)
            assert mp.evaluate("TribeCanvas.state().nodes.find(n => n.id === 'polr1').x") == 0, "only a preview until the drop"
            host.mouse.up()
            mp.wait_for_function("() => TribeCanvas.state().nodes.find(n => n.id === 'polr1').x > 0", timeout=8000)
            # shortcut sheet: the canvas section comes first
            host.keyboard.press("Control+/"); host.wait_for_selector("#help-keys .hk-here", timeout=3000)
            assert "design canvas" in host.inner_text("#help-keys .hk-here").lower(), "the section for where you are comes first"
            host.click("#hk-close")
            host.evaluate("id => { TribeCanvas._e.select(['polr1','polr2','polr3', id]); TribeCanvas._e.removeSel(); }", ph_fr[0]["id"])
            host.wait_for_function("() => !TribeCanvas.state().nodes.some(n => n.id === 'polr1')", timeout=5000)

            # ---- persistence: reload, and the file on disk
            n_before = len(nodes(host))
            host.reload(); host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            host.wait_for_function("() => window.TribeCanvas && TribeCanvas.state().open", timeout=15000)
            host.wait_for_function("n => TribeCanvas.state().nodes.length === n", arg=n_before, timeout=10000)
            time.sleep(0.8)
            disk = json.loads((Path(tmp) / ".tribe" / "canvas" / "main.json").read_text())
            assert len([n for n in disk["nodes"].values() if not n.get("del")]) == n_before, "saved on disk"

            # ---- sample screen, layer lock/hide from the layers panel
            host.evaluate("TribeCanvas.insertSample()"); host.wait_for_timeout(500)
            assert any(n["t"] == "component" and n["name"] == "Drink card" for n in nodes(host)), "the sample has components"
            scr_id = st(host)["selected"][0]
            host.click(f'[data-eye="{scr_id}"]'); host.wait_for_timeout(100)
            assert host.evaluate(f"getComputedStyle(document.querySelector('[data-id=\"{scr_id}\"]')).display") == "none", "hidden from the layers panel"
            host.click(f'[data-eye="{scr_id}"]'); host.wait_for_timeout(100)
            host.evaluate("TribeCanvas._e.fit()"); host.wait_for_timeout(200)
            shot(host, "sample")

            # ---- the focused Design workspace: only the canvas, Back, pane toggles in the bar, quick jumps, Esc order
            vis = lambda pg, sel: pg.evaluate("s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }", sel)
            assert host.evaluate("document.body.classList.contains('cv-focus')"), "Design opens as a focused workspace"
            for sel_ in (".window > .rail", ".window > .side", ".window > .titlebar", "#userbar"):
                assert not vis(host, sel_), ("hidden while designing", sel_)
            assert vis(host, "#cv-back") and vis(host, "#cv-tog-left") and vis(host, "#cv-tog-right") and vis(host, ".cv-jump"), "the bar has Back, both pane toggles and quick jumps"
            cvw = host.evaluate("document.querySelector('#cv').getBoundingClientRect().width")
            assert cvw >= 1440 - 4, ("the editor is full-window", cvw)
            host.click("#cv-tog-left"); host.wait_for_timeout(150)
            assert not vis(host, "#cv-left") and host.get_attribute("#cv-tog-left", "aria-pressed") == "false", "the layers pane hides from the bar"
            host.click("#cv-tog-right"); host.wait_for_timeout(150)
            assert not vis(host, "#cv-right"), "the properties pane hides from the bar"
            sw = host.evaluate("document.querySelector('#cv-stage').getBoundingClientRect().width")
            assert sw >= 1440 - 4, ("the stage takes the room", sw)
            host.focus("#cv-stage"); host.keyboard.press("Control+Backslash"); host.wait_for_timeout(150)
            assert vis(host, "#cv-left"), "Ctrl backslash brings the layers back"
            host.click("#cv-tog-right"); host.wait_for_timeout(150)
            assert vis(host, "#cv-right"), "and the toggle brings properties back"
            fdir = os.environ.get("CANVAS_FOCUS_SHOTS")
            if fdir:
                host.evaluate("id => TribeCanvas._e.select([id])", scr_id); host.wait_for_timeout(150)
                host.screenshot(path=os.path.join(fdir, "canvas-focus-1440.png"))
                host.set_viewport_size({"width": 1235, "height": 776}); host.wait_for_timeout(400)
                host.evaluate("TribeCanvas._e.fit()"); host.wait_for_timeout(300)
                host.screenshot(path=os.path.join(fdir, "canvas-focus-1235.png"))
                host.set_viewport_size({"width": 1440, "height": 900}); host.wait_for_timeout(300)
            # Esc lets go of the selection first; only with nothing selected does it leave the workspace
            host.evaluate("id => TribeCanvas._e.select([id])", scr_id)
            host.focus("#cv-stage")
            for _ in range(8):
                if not st(host)["selected"]: break
                host.keyboard.press("Escape"); host.wait_for_timeout(120)
                assert host.evaluate("document.body.dataset.view") == "canvas", "Esc with a selection stays in Design"
            assert not st(host)["selected"], "Esc let go of the selection"
            host.keyboard.press("Escape"); host.wait_for_timeout(200)
            assert host.evaluate("document.body.dataset.view") == "canvas", "a quick second Esc right after letting go stays"
            host.wait_for_timeout(900); host.keyboard.press("Escape"); host.wait_for_timeout(400)
            assert host.evaluate("document.body.dataset.view") != "canvas" and not host.evaluate("document.body.classList.contains('cv-focus')"), "Esc with nothing selected goes back to the app"
            assert vis(host, ".window > .side"), "the sidebar is back"
            came_from = host.evaluate("document.body.dataset.view")
            open_canvas(host)
            # a quick jump to Chat leaves a pill that brings you back; Back then returns where you first came from
            host.click('.cv-jump [data-jump="chat"]'); host.wait_for_timeout(400)
            assert host.evaluate("document.body.dataset.view") == "chat" and vis(host, "#cv-ret"), "Chat, with a Back to design pill"
            host.click('#cv-ret [data-ret="go"]')
            host.wait_for_function("() => TribeCanvas.state().open && document.body.classList.contains('cv-focus')", timeout=8000)
            host.click("#cv-back"); host.wait_for_timeout(400)
            assert host.evaluate("document.body.dataset.view") == came_from, ("Back returns where you were", host.evaluate("document.body.dataset.view"), came_from)
            open_canvas(host)

            # ---- 1,000 layers still pan smoothly (the overlay moves as one layer while the view is moving)
            pf = ok(api("/canvas", "POST", {"name": "Perf"}, token=orion, project=pid))["file"]["id"]
            host.evaluate("id => TribeCanvas.open(id)", pf)
            host.wait_for_function("id => TribeCanvas.state().file === id", arg=pf, timeout=8000); host.wait_for_timeout(500)
            ops = [{"id": f"perf{i:05d}", "t": "rect", "v": 1, "p": "", "i": i, "x": (i % 40) * 30, "y": (i // 40) * 30, "w": 24, "h": 24, "fill": "#38C6B1"} for i in range(1000)]
            ok(api(f"/canvas/{pf}/ops", "POST", {"ops": ops}, token=orion, project=pid))
            host.wait_for_function("() => TribeCanvas.state().nodes.length === 1000", timeout=15000)
            ms = host.evaluate("""() => new Promise(res => { const st = document.querySelector('#cv-stage'), r = st.getBoundingClientRect(); let n = 0; const t0 = performance.now();
              (function f() { st.dispatchEvent(new WheelEvent('wheel', { deltaX: 3, deltaY: 2, clientX: r.left + 100, clientY: r.top + 100, bubbles: true, cancelable: true })); if (++n < 90) requestAnimationFrame(f); else res((performance.now() - t0) / 90); })(); })""")
            print(f"  pan with 1,000 layers: {ms:.1f} ms per frame")
            assert ms < 50, ("1,000 layers pan smoothly", ms)
            host.evaluate("TribeCanvas.open('main')"); host.wait_for_function("() => TribeCanvas.state().file === 'main'", timeout=8000)

            # ---- spectator: view only
            sctx = b.new_context(viewport={"width": 1280, "height": 800}); sctx.add_init_script(settings_js("Sam", sam, pid))
            sp = sctx.new_page(); watch(sp, "sam")
            sp.goto(BASE + "/?skipIntro=1"); sp.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            open_canvas(sp)
            assert sp.is_visible("#cv-ro") and not sp.is_visible("#cv-t-frame"), "spectators see the design read-only"
            sctx.close()

            # ---- phone
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Maya", maya, pid))
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1#/canvas")
            ph.wait_for_function("() => window.TribeCanvas && TribeCanvas.state().open", timeout=20000)
            ph.wait_for_timeout(600)
            assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll"
            assert not ph.is_visible("#cv-left .cv-tree") or ph.evaluate("getComputedStyle(document.querySelector('#cv-left')).visibility") == "hidden"
            ph.evaluate("TribeCanvas._e.fit()"); ph.wait_for_timeout(300)
            ph.evaluate("id => TribeCanvas._e.select([id])", fr["id"])
            ph.click("#cv-show-layers"); ph.wait_for_timeout(350)
            assert ph.evaluate("getComputedStyle(document.querySelector('#cv-left')).visibility") == "visible", "layers open as a sheet"
            ph.click("#cv-show-layers"); ph.wait_for_timeout(300)
            # tap a top-level frame name to select it, then drag to move it
            tb = box(ph, card["id"]); a = scr(ph, tb["x"] + tb["w"] / 2, tb["y"] + tb["h"] / 2)
            ph.mouse.click(*a); ph.wait_for_timeout(150)
            assert st(ph)["selected"], "tap selects"
            sel0 = st(ph)["selected"][0]
            x0 = ph.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id)", sel0)
            drag(ph, a, (a[0] + 40, a[1] + 30))
            x1 = ph.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id)", sel0)
            assert (x1["x"], x1["y"]) != (x0["x"], x0["y"]) or x1.get("i") != x0.get("i"), ("drag moves", x0, x1)
            ph.click("#cv-show-props"); ph.wait_for_timeout(350)
            assert ph.evaluate("getComputedStyle(document.querySelector('#cv-right')).visibility") == "visible", "properties open as a sheet"
            if SHOTS: ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "canvas-phone.png"))
            assert ph.evaluate("document.body.classList.contains('cv-focus')") and ph.is_visible("#cv-back"), "phone: full screen with Back"
            assert ph.evaluate("[...document.querySelectorAll('#tabbar, .m2-rack, .m2-homebar')].every(e => getComputedStyle(e).display === 'none')"), "phone: the bottom rack steps aside"
            if os.environ.get("CANVAS_FOCUS_SHOTS"): ph.screenshot(path=os.path.join(os.environ["CANVAS_FOCUS_SHOTS"], "canvas-focus-phone.png"))
            ph.click("#cv-show-props"); ph.wait_for_timeout(300)
            ph.click("#cv-back"); ph.wait_for_timeout(400)
            assert ph.evaluate("document.body.dataset.view") != "canvas", "phone: Back leaves Design"
            pctx.close(); mctx.close(); hctx.close(); b.close()

        bad = [e for e in errors if "WebSocket" not in e]
        assert not bad, bad
        print("e2e_canvas: OK (draw, nest, snap, text, auto layout live, components + overrides, undo/redo, export, reload, spectator, phone)")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
