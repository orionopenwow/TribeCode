"""Design canvas <-> code (P1-C, docs/EDITOR-PARITY.md): server/canvascode.js + app/ui/canvas/code.js.

1. Send to app: the café sample frame goes to design/<name>.html as HTML + flex CSS between markers, committed; the live
   preview shows the same text, background and flex layout.
2. Edit on the canvas, send again: the same file is updated, a hand edit outside the markers survives, no second file.
3. Into an existing page (API): index.html keeps its own content and gains the frame; scripts are refused.
4. Open in canvas: an element in the preview (DOM + computed styles) becomes canvas layers: flex -> auto layout, text
   stays text. Change its padding on the canvas, send it back, and the page gets the new padding.
5. Inspect: CSS for the selected layer (with token names for matching colors), copy, Alt-hover measuring.
6. Export: PNG (1x, 2x) and SVG of a frame are real images of the right size.
7. Comment pins on layers: C, click a layer, post; the pin is anchored to the layer and shows as a marker.
No console errors.
Usage: python app/test/e2e_canvas_code.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5413 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "EventSource" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if take:
        page.wait_for_timeout(400)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"canvas-code-{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cvcode-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="cvcode-src-", dir="/tmp")
    repo = os.path.join(work, "cafe"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Café\n")
    Path(repo, "index.html").write_text("<!doctype html>\n<html><head><title>Café</title></head>\n<body>\n<h1 id=\"hand\">Hand written</h1>\n</body></html>\n")
    git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Canvas Code"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=camp))["invite"]
        sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}))["token"]

        # ---- 3 (API first): into an existing page; refusals ----
        r = ok(api("/canvascode/send", "POST", {"file": "main", "frame": "apiframe1", "name": "Banner", "html": "<div class=\"tc-design\"><section class=\"banner\"><p class=\"t\">Open late on Fridays</p></section></div>", "css": ".banner { display: flex; padding: 12px; }", "path": "index.html"}, token=camp, project=pid), "into index")
        assert r["path"] == "index.html" and r["created"] is False, r
        idx = Path(repo, "index.html").read_text()
        assert "Hand written" in idx and "Open late on Fridays" in idx and "tribecode:design main:apiframe1" in idx and ".banner { display: flex" in idx, idx
        assert api("/canvascode/send", "POST", {"file": "main", "frame": "x2", "name": "Bad", "html": "<div><script>alert(1)</script></div>", "css": ""}, token=camp, project=pid)[0] == 400, "scripts are refused"
        assert api("/canvascode/send", "POST", {"file": "main", "frame": "x3", "name": "Bad", "html": "<div onclick=\"x()\">a</div>", "css": ""}, token=camp, project=pid)[0] == 400, "handlers are refused"
        assert api("/canvascode/send", "POST", {"file": "main", "frame": "x4", "name": "Bad", "html": "<div>a</div>", "css": "", "path": "../evil.html"}, token=camp, project=pid)[0] == 400, "paths stay inside"
        assert api("/canvascode/send", "POST", {"file": "main", "frame": "x5", "name": "S", "html": "<div>a</div>", "css": ""}, token=sam, project=pid)[0] == 403, "spectators can't send"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, pid))
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            host.evaluate("TribeCanvas.open()")
            host.wait_for_function("TribeCanvas.state().open && TribeCanvas.state().canEdit", timeout=10000)
            host.evaluate("TribeCanvas.insertSample()")
            host.wait_for_function("TribeCanvas.state().nodes.length > 10", timeout=5000)
            top = host.evaluate("TribeCanvas.state().nodes.find(n => n.t === 'frame' && !n.p && /home/i.test(n.name)).id")
            fname = host.evaluate("id => TribeCanvas.state().nodes.find(n => n.id === id).name", top)
            host.evaluate("TribeCanvas._e.select([])")
            host.wait_for_function("document.querySelector('#cv-send').disabled", timeout=3000)   # nothing selected: Send to app is off
            host.evaluate("id => TribeCanvas._e.select([id])", top)
            host.wait_for_function("!document.querySelector('#cv-send').disabled", timeout=3000)
            shot(host, "canvas")

            # ---- 1: send to app ----
            host.click("#cv-send")
            host.wait_for_function("Object.keys(TribeCanvasCode.links()).some(k => k.endsWith(':' + %r))" % top, timeout=10000)
            rel = host.evaluate("id => Object.entries(TribeCanvasCode.links()).find(([k]) => k.endsWith(':' + id))[1].path", top)
            assert rel.startswith("design/") and rel.endswith(".html"), rel
            page = Path(repo, rel).read_text()
            assert "Maple cold brew" in page and "display: flex" in page and f"tribecode:design main:{top}" in page, page[:600]
            assert "Design:" in git(repo, "log", "-1", "--pretty=%s"), "the send was committed"

            # ---- 2: hand edit outside the markers, change on the canvas, send again ----
            Path(repo, rel).write_text(page.replace("</body>", "<p id=\"note\">My own note</p>\n</body>"))
            tid = host.evaluate("TribeCanvas.state().nodes.find(n => n.t === 'text' && n.tx && n.tx.c === 'Maple cold brew is back').id")
            host.evaluate("id => { const E = TribeCanvas._e; const n = E.S.get(id); E.patch(id, { tx: Object.assign({}, n.tx, { c: 'Pumpkin spice is back' }) }); }", tid)
            host.evaluate("id => TribeCanvas._e.select([id])", top)
            host.click("#cv-send")
            host.wait_for_function("p => true", arg=None)
            for _ in range(50):
                if "Pumpkin spice is back" in Path(repo, rel).read_text(): break
                time.sleep(0.1)
            page2 = Path(repo, rel).read_text()
            assert "Pumpkin spice is back" in page2 and "Maple cold brew is back" not in page2, "the second send updated the file"
            assert "My own note" in page2, "the hand edit outside the markers survived"
            assert len(list(Path(repo, "design").glob("*.html"))) == 1, "the same file was updated, not a new one"

            # the live preview shows it
            host.evaluate("TribeApp.show('home')")
            host.evaluate("p => TribePreview.show(p)", rel)
            host.wait_for_selector("#pvw-iframe", timeout=10000)
            fr = host.frame_locator("#pvw-iframe")
            for k in range(3):
                try: fr.locator("text=Pumpkin spice is back").wait_for(timeout=6000); break
                except Exception:
                    if k == 2: raise
                    host.evaluate("p => TribePreview.show(p)", rel)
            look = fr.locator(".tc-design > section").evaluate("s => { const cs = getComputedStyle(s); return { display: cs.display, dir: cs.flexDirection, bg: cs.backgroundColor, w: s.getBoundingClientRect().width }; }")
            want = host.evaluate("id => { const n = TribeCanvas._e.S.get(id); return { w: n.w, fill: n.fill, d: n.lay && n.lay.d }; }", top)
            assert look["display"] == "flex" and look["dir"] == ("column" if want["d"] == "col" else "row"), (look, want)
            h = want["fill"].lstrip("#"); rgb = f"rgb({int(h[0:2], 16)}, {int(h[2:4], 16)}, {int(h[4:6], 16)})"
            assert look["bg"] == rgb, (look, rgb)
            assert abs(look["w"] - want["w"]) < 1.5, (look, want)
            shot(host, "preview")

            # ---- 4: preview element -> canvas layers -> new padding back to the app ----
            fr.locator(".tc-design > section").evaluate("el => { window.__tcPicked = el; }")
            before = host.evaluate("TribeCanvas.state().nodes.length")
            host.evaluate("TribePreviewFlint.open && TribePreviewFlint.open()")
            host.evaluate("TribePreviewFlint.pick({ tag: 'section', text: '', rect: { left: 0, top: 0, width: 300, height: 600 } })")
            host.wait_for_selector("#pvf-pick:not(.hidden) [data-open-canvas]", timeout=5000)
            host.click("#pvf-pick [data-open-canvas]")
            host.wait_for_function("n => TribeCanvas.state().open && TribeCanvas.state().nodes.length > n", arg=before, timeout=10000)
            newtop = host.evaluate("top => TribeCanvas.state().nodes.filter(n => n.t === 'frame' && !n.p && n.id !== top).map(n => n.id)", top)
            assert len(newtop) == 1, newtop
            newtop = newtop[0]
            made = host.evaluate("id => { const S = TribeCanvas._e.S; return [S.get(id), ...S.descendants(id)]; }", newtop)
            assert len(made) > 8 and host.evaluate("TribeCanvas.state().nodes.length") > before, len(made)
            assert made[0]["t"] == "frame" and made[0].get("lay", {}).get("d") in ("col", "row"), made[0]
            assert any(n["t"] == "text" and "Pumpkin spice" in n["tx"]["c"] for n in made), "text stayed text"
            assert all(n["tx"]["f"] == "Inter" for n in made if n["t"] == "text"), "Inter stays Inter (sans-serif isn't a serif font)"
            assert sum(1 for n in made if n.get("lay")) >= 3, "flex containers became auto layout"
            host.evaluate("id => { const E = TribeCanvas._e, n = E.S.get(id); E.patch(id, { name: 'Imported home', lay: Object.assign({}, n.lay, { p: [40, 40, 40, 40] }) }); }", newtop)
            r2 = host.evaluate("id => TribeCanvasCode.send(id)", newtop)
            assert r2 and r2["path"].startswith("design/imported-home"), r2
            css2 = Path(repo, r2["path"]).read_text()
            assert "padding: 40px 40px 40px 40px" in css2, css2[:800]
            shot(host, "imported")

            # ---- 5: inspect ----
            host.evaluate("TribeCanvasCode.setTab('inspect')")
            btn = host.evaluate("TribeCanvas.state().nodes.find(n => n.t === 'component' && /button/i.test(n.name)).id")
            host.evaluate("id => TribeCanvas._e.select([id])", btn)
            host.wait_for_selector("#cv-inspect:not([hidden]) #cv-ins-css", timeout=3000)
            css = host.inner_text("#cv-ins-css")
            assert "display: flex" in css and "background" in css, css
            assert host.locator("#cv-inspect .cv-ins-tok").count() >= 1, "a color matching a design token is named"
            host.click("#cv-inspect [data-copy='css']")
            host.wait_for_function("(window.__tcLastCopy || '').includes('display: flex')", timeout=3000)
            # Alt-hover measuring between two layers
            host.evaluate("id => TribeCanvas._e.select([id])", tid)
            host.evaluate("TribeCanvas._e.fit()"); host.wait_for_timeout(300)
            other = host.evaluate("TribeCanvas.state().nodes.find(n => n.t === 'text' && n.tx && /Good morning/.test(n.tx.c)).id")
            bx = host.evaluate("id => document.querySelector(`#cv-world [data-id='${id}']`).getBoundingClientRect().toJSON()", other)
            host.keyboard.down("Alt")
            host.mouse.move(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2)
            host.mouse.move(bx["x"] + bx["width"] / 2 + 1, bx["y"] + bx["height"] / 2)
            try: host.wait_for_function("document.querySelectorAll('.cv-measure .cv-mlabel').length > 0", timeout=3000)
            except Exception:
                raise AssertionError("Alt-hover measuring drew nothing")
            shot(host, "inspect")
            host.keyboard.up("Alt")

            # ---- 6: export ----
            box = host.evaluate("id => TribeCanvas._e.wbox(id)", top)
            png = host.evaluate("id => TribeCanvasCode.exportData(id, 'png', 2)", top)
            assert png["url"].startswith("data:image/png") and len(png["url"]) > 5000, len(png["url"])
            assert abs(png["w"] - round(box["w"] * 2)) <= 2, (png["w"], box)
            px = host.evaluate("""u => new Promise(res => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
                const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 400) if (d[k] > 0) n++; res(n); }; i.src = u; })""", png["url"])
            assert px > 50, "the PNG has real pixels"
            svg = host.evaluate("id => TribeCanvasCode.exportData(id, 'svg')", top)
            assert svg["url"].startswith("data:image/svg+xml") and "foreignObject" in svg["url"].replace("%3C", "<"), svg["url"][:120]

            # ---- 7: comment pin on a layer ----
            host.evaluate("TribeCanvasCode.setTab('design')")
            host.evaluate("id => TribeCanvas._e.select([])", top)
            host.click("#cv-comment")
            assert host.get_attribute("#cv-comment", "aria-pressed") == "true"
            cb = host.evaluate("id => document.querySelector(`#cv-world [data-id='${id}']`).getBoundingClientRect().toJSON()", tid)
            host.mouse.click(cb["x"] + 10, cb["y"] + cb["height"] / 2)
            host.wait_for_selector(".pin-pop--new textarea", timeout=4000)
            host.fill(".pin-pop--new textarea", "Can we tighten this headline?")
            host.click(".pin-pop--new button.primary")
            host.wait_for_selector(".cv-pinlayer .pin-mk", timeout=5000)
            pins = ok(api("/pins?surface=canvas&state=all", token=camp, project=pid))["pins"]
            assert pins and pins[0]["target"]["node"] == tid and pins[0]["target"]["key"] == "main", pins
            shot(host, "pin")
            b.close()
        assert not errors, "\n".join(errors[:10])
        print("e2e_canvas_code: OK (send to app + preview match, resend keeps hand edits, existing page, refusals, preview -> canvas -> padding back, inspect + tokens + measure, PNG/SVG, pin on layer)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
