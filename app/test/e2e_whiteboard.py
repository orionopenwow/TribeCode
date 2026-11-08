"""Whiteboard (app/ui/whiteboard.js, server/whiteboard.js): a shared, persistent board per project.

  + Add: the gallery has a Whiteboard card with its own mini preview; adding it gives a sidebar row that opens the board.
  Draw: a pen stroke, a sticky note and a text item; a second member sees them live (and the cursor); undo/redo are
        per user; a reload keeps everything (and it's on disk in .tribe/boards/main.json).
  Roles: a spectator sees the board read-only (no tools) and gets a 403 from the API; builders can't clear, the host can.
  Pictures: a pasted image is stored in the project's Files and placed on the board. Send to Files saves a PNG.
  Agents: whiteboard_read returns the notes as text; whiteboard_add_sticky adds a note that shows up live.
  Flint: "open the whiteboard" opens it. Phone 390px: one finger draws, two fingers zoom, a bottom toolbar, no
        sideways scroll. No console errors.
Usage: python app/test/e2e_whiteboard.py [--shots]   (--shots saves docs/screenshots/whiteboard-*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5190 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())["result"]


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS:
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"whiteboard-{name}.png"))


ST = "window.TribeWhiteboard && TribeWhiteboard.state()"


def state(page):
    return page.evaluate(ST)


def wait_count(page, n, timeout=10000):
    page.wait_for_function(f"n => {{ const s = {ST}; return s && s.open && s.count === n; }}", arg=n, timeout=timeout)


def canvas_box(page):
    return page.locator("#wbd-canvas").bounding_box()


def stroke(page, x0, y0, dx=160, dy=60, steps=12):
    b = canvas_box(page)
    page.mouse.move(b["x"] + x0, b["y"] + y0); page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(b["x"] + x0 + dx * i / steps, b["y"] + y0 + dy * (i % 3) / 2 + i * 2)
    page.mouse.up()


def open_board(page):
    page.wait_for_selector("#wg-whiteboard", state="visible", timeout=20000)
    page.click("#wg-whiteboard")
    page.wait_for_selector("#view-whiteboard:not(.hidden) #wbd-canvas", timeout=15000)
    page.wait_for_function(f"(() => {{ const s = {ST}; return s && s.open && document.querySelector('#wbd-name-t').textContent.length > 0; }})()")
    page.wait_for_timeout(300)


def touch(cdp, kind, pts):
    cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-wbd-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Board Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        projects = ok(api("/projects", token=orion), "projects")["projects"]
        pid = projects[0]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---- API: permissions and the board's shape
        lst = ok(api("/whiteboard", token=orion, project=pid))
        assert [b["id"] for b in lst["boards"]] == ["main"] and lst["canEdit"] and lst["canManage"], lst
        s = ok(api("/whiteboard", token=sam, project=pid)); assert s["canEdit"] is False and s["canManage"] is False, s
        op = {"id": "spec1", "t": "sticky", "v": 1, "x": 0, "y": 0, "w": 180, "h": 180, "text": "nope"}
        assert api("/whiteboard/main/ops", "POST", {"ops": [op]}, token=sam, project=pid)[0] == 403, "spectators can't draw"
        assert api("/whiteboard", "POST", {"name": "X"}, token=sam, project=pid)[0] == 403
        assert api("/whiteboard/main/clear", "POST", {}, token=maya, project=pid)[0] == 403, "builders can't clear"
        assert api("/whiteboard/main/ops", "POST", {"ops": [{"id": "bad1", "t": "script", "v": 1}]}, token=orion, project=pid)[1]["applied"] == 0
        # last writer wins by version: a stale version comes back as rejected
        ok(api("/whiteboard/main/ops", "POST", {"ops": [{**op, "id": "tmp01", "text": "v2", "v": 2}]}, token=orion, project=pid))
        r = ok(api("/whiteboard/main/ops", "POST", {"ops": [{**op, "id": "tmp01", "text": "stale", "v": 1}]}, token=maya, project=pid))
        assert r["applied"] == 0 and r["rejected"][0]["text"] == "v2", r
        ok(api("/whiteboard/main/ops", "POST", {"ops": [{"id": "tmp01", "del": True, "v": 3}]}, token=orion, project=pid))
        assert ok(api("/whiteboard/main", token=orion, project=pid))["board"]["elements"]["tmp01"]["del"] is True

        ok(api("/vision", "PUT", {"text": "# Board\n\nA shared board."}, token=orion, project=pid))   # + Add waits for the vision (feat/setup-flow)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}); hctx.add_init_script(settings_js("Orion", orion, pid))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)

            # ---- + Add: the Whiteboard card (its own mini preview), then the row
            host.wait_for_selector("#nest-add", state="visible", timeout=15000)
            host.click("#nest-add"); host.wait_for_selector("#wg-picker")
            card = host.locator("#wg-picker [data-wadd='whiteboard']")
            assert card.is_visible() and "Whiteboard" in card.inner_text() and card.locator(".wgx-board svg").count() == 1
            host.fill("#wgx-q", "sketch"); assert card.is_visible() and host.is_hidden("#wg-picker [data-wadd='bugs']")
            host.fill("#wgx-q", "")
            shot(host, "picker")
            card.click()
            open_board(host)
            assert host.text_content("#crumb-label").strip() == "Whiteboard"
            assert host.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert host.is_visible("#wbd-empty")

            # ---- draw a stroke, a sticky note and a text item
            host.click("#wbd-t-pen"); stroke(host, 300, 260)
            wait_count(host, 1)
            st = state(host); assert st["elements"][0]["t"] == "stroke" and len(st["elements"][0]["pts"]) >= 2, st["elements"][0]
            host.click("#wbd-t-sticky")
            bx = canvas_box(host); host.mouse.click(bx["x"] + 700, bx["y"] + 260)
            host.wait_for_selector("#wbd-edit.sticky"); host.keyboard.type("Jump higher"); host.keyboard.press("Escape")
            host.click("#wbd-t-text"); host.mouse.click(bx["x"] + 300, bx["y"] + 480)
            host.wait_for_selector("#wbd-edit.text"); host.keyboard.type("Level 2 ideas"); host.keyboard.press("Escape")
            wait_count(host, 3)
            texts = sorted(e.get("text", "") for e in state(host)["elements"] if e["t"] in ("sticky", "text"))
            assert texts == ["Jump higher", "Level 2 ideas"], texts
            # a shape and a style change (the selected thing gets the new color)
            host.click("#wbd-t-shape"); host.click("#wbd-shape-menu [data-m='rect']")
            host.mouse.move(bx["x"] + 500, bx["y"] + 560); host.mouse.down(); host.mouse.move(bx["x"] + 600, bx["y"] + 640, steps=5); host.mouse.up()
            wait_count(host, 4)
            host.click("#wbd-t-select"); host.mouse.click(bx["x"] + 500, bx["y"] + 600)
            host.wait_for_function(f"{ST}.selected.length === 1")
            host.click("#wbd-style [data-color='#38C6B1']")
            host.wait_for_function(f"{ST}.elements.some(e => e.t === 'rect' && e.color === '#38C6B1')")
            host.keyboard.press("Delete"); wait_count(host, 3)

            # ---- a second member sees it live, with the host's cursor
            mctx = b.new_context(viewport={"width": 1280, "height": 860}); mctx.add_init_script(settings_js("Maya", maya, pid))
            mp = mctx.new_page(); watch(mp, "maya"); mp.goto(BASE + "/?skipIntro=1")
            open_board(mp); wait_count(mp, 3)
            host.click("#wbd-t-pen"); stroke(host, 120, 680, 200, 20)
            wait_count(mp, 4)
            host.mouse.move(bx["x"] + 400, bx["y"] + 300); host.mouse.move(bx["x"] + 420, bx["y"] + 310)
            mp.wait_for_selector("#wbd-cursors .wbd-cur:has-text('Orion')", timeout=10000)
            # Maya draws too; the host sees it
            mp.click("#wbd-t-pen"); stroke(mp, 400, 200, 120, 40)
            wait_count(host, 5); wait_count(mp, 5)

            # ---- undo/redo are per user: the host's undo removes the host's last stroke, not Maya's
            host.keyboard.press("Control+z"); wait_count(host, 4); wait_count(mp, 4)
            mine = [e for e in state(mp)["elements"] if e["t"] == "stroke"]
            assert any(e["by"].startswith("maya") for e in mine), "Maya's stroke is still there"
            host.keyboard.press("Control+Shift+z"); wait_count(host, 5); wait_count(mp, 5)
            host.click("#wbd-undo"); wait_count(mp, 4)
            shot(host, "desktop")

            # ---- reload: everything is still there (and on disk)
            host.reload(); host.wait_for_function(f"(() => {{ const s = {ST}; return s && s.open; }})()", timeout=20000)
            wait_count(host, 4)
            host.wait_for_timeout(900)
            disk = json.load(open(os.path.join(tmp, ".tribe", "boards", "main.json")))
            assert len([e for e in disk["elements"].values() if not e.get("del")]) == 4, disk

            # ---- a pasted picture lands in Files and on the board
            host.click("#wbd-t-select")
            host.evaluate("""async () => {
              const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#38C6B1'; x.fillRect(0, 0, 64, 48);
              const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'sketch.png', { type: 'image/png' }));
              document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
            }""")
            wait_count(host, 5, 15000)
            img = [e for e in state(host)["elements"] if e["t"] == "image"][0]
            files = ok(api("/uploads", token=orion, project=pid))["project"]
            assert any(f["id"] == img["src"] and f["name"] == "sketch.png" for f in files), files
            mp.wait_for_function(f"{ST}.elements.some(e => e.t === 'image')", timeout=10000)
            # Send to Files: a PNG of the board
            host.click("#wbd-export"); host.click("#wbd-files")
            host.wait_for_function(f"pid => fetch('/api/uploads', {{ headers: {{ Authorization: 'Bearer {orion}', 'X-Project': pid }} }}).then(r => r.json()).then(d => d.project.some(f => /^Team-board-.*\\.png$/.test(f.name)))", arg=pid, timeout=15000)

            # ---- a spectator: read-only
            sctx = b.new_context(viewport={"width": 1280, "height": 860}); sctx.add_init_script(settings_js("Sam", sam, pid))
            sp = sctx.new_page(); watch(sp, "sam"); sp.goto(BASE + "/?skipIntro=1")
            open_board(sp); wait_count(sp, 5)
            assert sp.is_visible("#wbd-ro") and sp.is_hidden("#wbd-t-pen") and sp.is_hidden("#wbd-t-sticky"), "no drawing tools"
            sbx = canvas_box(sp); sp.mouse.move(sbx["x"] + 200, sbx["y"] + 200); sp.mouse.down(); sp.mouse.move(sbx["x"] + 300, sbx["y"] + 260, steps=6); sp.mouse.up()
            sp.wait_for_timeout(400); assert state(sp)["count"] == 5 and state(host)["count"] == 5
            sp.evaluate("TribeClient.send({ type: 'wbd-op', board: 'main', ops: [{ id: 'sneak1', t: 'sticky', v: 1, x: 0, y: 0, w: 10, h: 10, text: 'x' }] })")
            sp.wait_for_timeout(500); assert state(host)["count"] == 5, "the socket refuses spectators too"
            errors[:] = [e for e in errors if "Spectators" not in e]

            # ---- agents: read the board, add a sticky note (shows up live)
            ag = ok(api("/agents", "POST", token=orion, project=pid), "agent")
            txt = mcp(ag["token"], "whiteboard_read")["content"][0]["text"]
            assert "Jump higher" in txt and "Level 2 ideas" in txt and "stroke" in txt, txt
            r = mcp(ag["token"], "whiteboard_add_sticky", {"text": "Try a double jump", "color": "teal"})
            assert not r.get("isError"), r
            wait_count(host, 6); wait_count(mp, 6)
            assert any(e.get("agent") and e["text"] == "Try a double jump" for e in state(mp)["elements"])
            assert "Try a double jump" in mcp(ag["token"], "whiteboard_read")["content"][0]["text"]

            # ---- the host can clear; boards can be added
            nb = ok(api("/whiteboard", "POST", {"name": "Ideas"}, token=maya, project=pid))["board"]
            assert [x["id"] for x in ok(api("/whiteboard", token=orion, project=pid))["boards"]] == ["main", nb["id"]]
            host.click("#wbd-name"); host.wait_for_selector(f"#wbd-board-menu [data-board='{nb['id']}']")
            assert host.locator("#wbd-clear").count() == 1
            host.click(f"#wbd-board-menu [data-board='{nb['id']}']")
            host.wait_for_function(f"id => {ST}.board === id && {ST}.count === 0", arg=nb["id"])
            host.click("#wbd-name"); host.click(f"#wbd-board-menu [data-board='main']"); wait_count(host, 6)
            mp.click("#wbd-name"); mp.wait_for_selector("#wbd-board-menu"); assert mp.locator("#wbd-clear").count() == 0, "builders can't clear"
            mp.keyboard.press("Escape")

            # ---- Flint opens it
            host.click("#nest-overview")
            host.wait_for_function("TribeWhiteboard.state().open === false", timeout=10000)
            host.wait_for_selector("#flint #fl-input", state="visible", timeout=15000)
            host.fill("#fl-input", "open the whiteboard"); host.press("#fl-input", "Enter")
            host.wait_for_function("TribeWhiteboard.state().open === true", timeout=10000)

            # ---- phone: one finger draws, two fingers zoom, a bottom toolbar, no sideways scroll
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Maya", maya, pid))
            ph = pctx.new_page(); watch(ph, "phone"); ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_selector("#tabbar.m2-rack", timeout=20000)
            ph.click("#menu-btn"); open_board(ph); wait_count(ph, 6); ph.wait_for_timeout(500)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            tb = ph.locator("#wbd-tools").bounding_box(); vp = ph.viewport_size
            assert tb["x"] >= 0 and tb["x"] + tb["width"] <= vp["width"] and tb["y"] > vp["height"] * 0.6, tb
            rack = ph.locator("#tabbar").bounding_box()
            assert tb["y"] + tb["height"] <= rack["y"] + 1, (tb, rack)
            assert ph.evaluate(f"{ST}.tool") == "pen", "phones start with the pen"
            cdp = pctx.new_cdp_session(ph); cb = canvas_box(ph)
            x0, y0 = cb["x"] + 80, cb["y"] + 160
            touch(cdp, "touchStart", [(x0, y0)])
            for i in range(1, 10): touch(cdp, "touchMove", [(x0 + i * 15, y0 + i * 6)])
            touch(cdp, "touchEnd", [])
            wait_count(ph, 7); wait_count(host, 7)
            z0 = state(ph)["view"]["z"]
            touch(cdp, "touchStart", [(x0, y0 + 100), (x0 + 60, y0 + 100)])
            for i in range(1, 8): touch(cdp, "touchMove", [(x0 - i * 10, y0 + 100), (x0 + 60 + i * 10, y0 + 100)])
            touch(cdp, "touchEnd", [])
            ph.wait_for_timeout(300)
            assert state(ph)["view"]["z"] > z0 * 1.2, (z0, state(ph)["view"])
            assert state(ph)["count"] == 7, "a pinch draws nothing"
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            shot(ph, "phone")

            b.close()
        assert not errors, "\n".join(errors)
        print("E2E whiteboard test passed")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
