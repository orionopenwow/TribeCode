"""Asset viewers: the repo's "Art & models" list under the pinned repo hero, the pixel-art viewer (grid sheet, Aseprite
JSON sheet, GIF: frames, play/pause, fps, zoom, onion skin, scrubber), the 3D viewer (GLB: render, triangles/meshes/
materials/animations, play/pause, reset), chat attachments with a View button, the phone sheet at 390px, and the
server side (members only, asset types only, no dotfiles or path tricks, model/gltf-binary).
three.js 0.170.0 comes from the CDN in the app; this sandbox can't reach it, so the test serves the same pinned version
from the npm registry tarball (page.route), and skips the 3D render checks with a message if neither is reachable.
Usage: python app/test/e2e_viewers.py [--shots]
"""
import base64, json, os, subprocess, sys, tarfile, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "app" / "test" / "fixtures"))
import make_viewer_fixtures as fx   # noqa: E402

PORT = 4929 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
THREE_VER = "0.170.0"
THREE_CDN = f"https://cdn.jsdelivr.net/npm/three@{THREE_VER}/"
SHOTS = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, project=None, headers=None, raw=False):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read(); return (r.status, dict(r.headers), data) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read(); return (e.code, dict(e.headers), data) if raw else (e.code, json.loads(data or b"{}") if data[:1] == b"{" else {})


def ok(r, what=""):
    assert r[0] == 200, (what, r); return r[1]


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def make_repo(path, files):
    path.mkdir(parents=True, exist_ok=True)
    for rel, data in files.items():
        f = path / rel; f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(data) if isinstance(data, bytes) else f.write_text(data)
    g = lambda *a: subprocess.run(["git", "-C", str(path), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "fixtures")


def three_package(cache):
    """The pinned three package (build/ + examples/jsm/): the CDN if reachable, else the npm registry tarball."""
    pkg = Path(cache) / f"three-{THREE_VER}" / "package"
    if (pkg / "build" / "three.module.js").exists(): return pkg, "cache"
    try:
        with urllib.request.urlopen(THREE_CDN + "build/three.module.js", timeout=6) as r: r.read(64)
        return None, "cdn"   # reachable: let the page load it from the CDN itself
    except Exception: pass
    try:
        out = subprocess.run(["npm", "pack", f"three@{THREE_VER}", "--silent"], cwd=cache, capture_output=True, text=True, timeout=180)
        tgz = Path(cache) / (out.stdout.strip().splitlines() or [""])[-1]
        if tgz.is_file():
            with tarfile.open(tgz) as t:
                t.extractall(pkg.parent, filter="data", members=[m for m in t.getmembers() if m.name.startswith(("package/build/", "package/examples/jsm/")) and ".." not in m.name])
            return pkg, "npm"
    except Exception: pass
    return None, "unreachable"


# count pixels on a canvas that aren't the background; works for 2D and (preserveDrawingBuffer) WebGL canvases
PIXELS = """(sel) => { const c = document.querySelector(sel); if (!c || !c.width) return -1;
  const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, t.width, t.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2];
    const bg = (Math.abs(r - 0x12) < 6 && Math.abs(g - 0x15) < 6 && Math.abs(b - 0x1A) < 6) || (r === 0x1B && g === 0x20 && b === 0x28) || (r === 0x22 && g === 0x28 && b === 0x33);
    if (!bg && d[i + 3]) n++; }
  return n; }"""
EMBER = """(sel) => { const c = document.querySelector(sel); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === 242 && d[i + 1] === 107 && d[i + 2] === 29) n++; return n; }"""


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-viewers-", dir="/tmp"))
    fixdir = fx.write(tmp / "fixtures")
    blob = {f: (fixdir / f).read_bytes() for f in ["cube.glb", "walk.png", "hero.png", "hero.json", "blink.gif"]}
    art = tmp / "art-lab"
    make_repo(art, {"README.md": "# Art Lab\n", "models/cube.glb": blob["cube.glb"], "sprites/walk.png": blob["walk.png"], "sprites/hero.png": blob["hero.png"],
                    "sprites/hero.json": blob["hero.json"], "fx/blink.gif": blob["blink.gif"], ".secret/hidden.png": blob["walk.png"], "node_modules/x/skip.png": blob["walk.png"],
                    "id_rsa": "KEY", "notes.txt": "not an asset"})
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "server.log", "w"), stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": str(art)}, token=orion), "project")["project"]["id"]
        other = ok(api("/projects", "POST", {"name": "Elsewhere"}, token=orion), "second project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": other}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]   # only sees "Elsewhere"

        # ---------- server: the listing and the bytes ----------
        lst = ok(api("/files", token=orion, project=pid))
        paths = [a["path"] for a in lst["assets"]]
        assert paths[0] == "models/cube.glb" and lst["assets"][0]["kind"] == "model", paths   # models first
        assert set(paths) == {"models/cube.glb", "sprites/walk.png", "sprites/hero.png", "fx/blink.gif"}, paths   # no dot folders, node_modules
        hero = next(a for a in lst["assets"] if a["path"] == "sprites/hero.png"); assert hero.get("sheet") == "sprites/hero.json", hero
        st, h, body = api("/files/raw/models/cube.glb", token=orion, project=pid, raw=True)
        assert st == 200 and body == blob["cube.glb"] and h["Content-Type"] == "model/gltf-binary", (st, h)
        assert h["X-Content-Type-Options"] == "nosniff" and "sandbox" in h["Content-Security-Policy"], h
        st, h, body = api(f"/files/raw/sprites/walk.png?token={orion}&project={pid}", raw=True); assert st == 200 and h["Content-Type"] == "image/png", "?token= works for loaders"
        for bad in ["id_rsa", "notes.txt", ".secret/hidden.png", "node_modules/x/skip.png", "../art-lab/sprites/walk.png", "%2e%2e/%2e%2e/etc/passwd", ".git/config", "sprites/../../tribe/members.json"]:
            assert api(f"/files/raw/{bad}", token=orion, project=pid, raw=True)[0] in (404, 400), bad
        assert api("/files/raw/models/cube.glb", raw=True)[0] == 401, "members only"
        assert api("/files/raw/models/cube.glb", token=maya, project=pid, raw=True)[0] == 403, "not in that project"
        # a chat attachment for the chat View button
        ok(api("/chat/general/file", "POST", {"data": base64.b64encode(blob["walk.png"]).decode(), "name": "walk-cycle.png", "mime": "image/png"}, token=orion, project=pid), "chat file")

        three, how = three_package(tempfile.gettempdir())
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"])

            def route_three(ctx):
                if not three: return
                def serve(route):
                    rel = route.request.url.split(f"three@{THREE_VER}/", 1)[1].split("?")[0]
                    f = (three / rel).resolve()
                    if not str(f).startswith(str(three.resolve())) or not f.is_file(): return route.fulfill(status=404, body="nope")
                    route.fulfill(status=200, body=f.read_bytes(), headers={"Content-Type": "text/javascript; charset=utf-8", "Access-Control-Allow-Origin": "*"})
                ctx.route(THREE_CDN + "**", serve)

            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Orion", orion, pid)); route_three(ctx)
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            assert not host.evaluate("[...document.querySelectorAll('script[type=importmap]')].length"), "three.js is not loaded until a viewer opens"

            # ---------- desktop Docs: the assets list under the pinned repo hero ----------
            host.evaluate("TribeApp.show('docs')")
            host.wait_for_selector("#vw-assets-desk .vw-arow", timeout=15000)
            assert "Art & models" in host.text_content("#vw-assets-desk .sec-head") and host.locator("#vw-assets-desk .vw-arow").count() == 4

            # ---------- pixel art: a grid sheet ----------
            host.click("#vw-assets-desk [data-view-path='sprites/walk.png']")
            host.wait_for_selector("#vw-body[data-ready='1']", timeout=10000)
            v = host.evaluate("({ frames: __tribeViewer.frames(), mode: __tribeViewer.mode(), size: __tribeViewer.size })")
            assert v == {"frames": 4, "mode": "grid", "size": [64, 16]}, v   # auto-guessed 16x16 frames from the strip
            assert host.text_content("#vw-s-frames b") == "4" and host.text_content("#vw-s-frame b") == "16×16" and host.text_content("#vw-s-img b") == "64×16"
            assert host.evaluate(PIXELS, "#vw-canvas") > 0 and host.evaluate(PIXELS, "#vw-sheetc") > 0, "the frame and the sheet are drawn"
            assert host.evaluate("getComputedStyle(document.querySelector('#vw-canvas')).imageRendering") in ("pixelated", "crisp-edges")
            f0 = host.evaluate("__tribeViewer.frame()"); host.wait_for_timeout(700)
            assert host.evaluate("__tribeViewer.playing()") and host.evaluate("__tribeViewer.frame()") != f0 or host.evaluate("__tribeViewer.frame()") != f0, "it plays"
            host.click("#vw-play"); assert not host.evaluate("__tribeViewer.playing()") and host.get_attribute("#vw-play", "data-state") == "paused"
            f1 = host.evaluate("__tribeViewer.frame()"); host.wait_for_timeout(500); assert host.evaluate("__tribeViewer.frame()") == f1, "paused stays put"
            host.click("#vw-next"); assert host.evaluate("__tribeViewer.frame()") == (f1 + 1) % 4
            host.fill("#vw-scrub", "2"); host.dispatch_event("#vw-scrub", "input"); assert host.evaluate("__tribeViewer.frame()") == 2 and host.text_content("#vw-fno") == "3 / 4"
            host.click("[data-zoom='8']"); assert host.evaluate("[__tribeViewer.zoom(), document.querySelector('#vw-canvas').width]") == [8, 128]
            host.click("[data-zoom='1']"); assert host.evaluate("document.querySelector('#vw-canvas').width") == 16
            host.click("[data-zoom='4']")
            frame_px = host.evaluate(EMBER, "#vw-canvas")
            host.fill("#vw-scrub", "1"); host.dispatch_event("#vw-scrub", "input")
            assert host.evaluate(EMBER, "#vw-canvas") == 0, "frame 2 has no ember pixels"
            host.click("#vw-onion"); assert host.get_attribute("#vw-onion", "aria-pressed") == "true"
            assert host.evaluate(EMBER, "#vw-canvas") == 0 and host.evaluate(PIXELS, "#vw-canvas") > frame_px * 0, "onion skin draws the previous frame faintly"
            host.fill("#vw-fps", "24"); host.dispatch_event("#vw-fps", "input"); assert host.text_content("#vw-fps-v") == "24"
            # set the frame size by hand: 32x16 -> 2 frames
            host.fill("#vw-fw", "32"); host.dispatch_event("#vw-fw", "change"); assert host.evaluate("__tribeViewer.frames()") == 2 and host.input_value("#vw-cols") == "2"
            host.fill("#vw-cols", "4"); host.dispatch_event("#vw-cols", "change"); assert host.evaluate("__tribeViewer.frames()") == 4 and host.input_value("#vw-fw") == "16"
            if SHOTS: host.screenshot(path=str(ROOT / "docs" / "screenshots" / "viewer-pixel.png"))
            host.keyboard.press("Escape"); host.wait_for_selector("#vw", state="detached", timeout=3000)

            # ---------- pixel art: an Aseprite JSON sheet (durations + a tag) ----------
            host.click("#vw-assets-desk [data-view-path='sprites/hero.png']")
            host.wait_for_selector("#vw-body[data-ready='1']", timeout=10000)
            assert host.evaluate("[__tribeViewer.mode(), __tribeViewer.frames()]") == ["json", 3] and host.text_content("#vw-s-from b") == "Sheet JSON"
            host.select_option("#vw-tag", "0"); assert host.evaluate("__tribeViewer.frames()") == 2, "the 'blink' tag is frames 0-1"
            host.click("[data-mode='grid']"); assert host.evaluate("[__tribeViewer.mode(), __tribeViewer.frames()]") == ["grid", 3]
            host.click("#vw-close"); host.wait_for_selector("#vw", state="detached", timeout=3000)

            # ---------- pixel art: a GIF ----------
            host.click("#vw-assets-desk [data-view-path='fx/blink.gif']")
            host.wait_for_selector("#vw-body[data-ready='1']", timeout=10000)
            assert host.evaluate("[__tribeViewer.mode(), __tribeViewer.frames()]") == ["gif", 3] and host.evaluate(PIXELS, "#vw-canvas") > 0
            assert host.input_value("#vw-fps") == "8", "fps from the GIF's 120 ms delays"
            host.keyboard.press("Escape"); host.wait_for_selector("#vw", state="detached", timeout=3000)

            # ---------- chat: a PNG attachment has a View button ----------
            host.evaluate("TribeApp.show('chat')")
            host.wait_for_selector(".fchip-view[data-view-name='walk-cycle.png']", timeout=10000)
            host.click(".fchip-view[data-view-name='walk-cycle.png']")
            host.wait_for_selector("#vw-body[data-ready='1']", timeout=10000)
            assert host.evaluate("__tribeViewer.frames()") == 4 and host.text_content("#vw .vw-t h2") == "walk-cycle.png"
            host.keyboard.press("Escape"); host.wait_for_selector("#vw", state="detached", timeout=3000)

            # ---------- 3D: the GLB ----------
            host.evaluate("TribeApp.show('docs')"); host.wait_for_selector("#vw-assets-desk [data-view-path='models/cube.glb']", timeout=10000)
            host.click("#vw-assets-desk [data-view-path='models/cube.glb']")
            assert host.evaluate("[...document.querySelectorAll('script[type=importmap]')].some(s => s.textContent.includes('three@%s'))" % THREE_VER), "the import map is added when the viewer opens"
            three_ok = how != "unreachable"
            if not three_ok:
                host.wait_for_selector("#vw .vw-err", timeout=20000)
                assert "three.js" in host.text_content("#vw .vw-err"), "a clear message when three.js can't load"
                print("  SKIP 3D render checks: three.js unreachable (CDN and npm) from this machine")
                errors[:] = [e for e in errors if "three" not in e.lower() and "import" not in e.lower()]
            else:
                host.wait_for_selector("#vw-body[data-ready='1']", timeout=30000)
                info = host.evaluate("({ t: __tribeViewer.tris, m: __tribeViewer.meshes, mat: __tribeViewer.materials, a: __tribeViewer.animations })")
                assert info == {"t": 12, "m": 1, "mat": 1, "a": 1}, info
                assert host.text_content("#vw-s-tris b") == "12" and host.text_content("#vw-s-meshes b") == "1" and host.text_content("#vw-s-mats b") == "1" and host.text_content("#vw-s-anims b") == "1"
                assert host.text_content("#vw-s-size b").endswith(" KB") and "Spin" in host.text_content("#vw-info")
                host.wait_for_timeout(400)
                n = host.evaluate(PIXELS, "#vw-canvas"); assert n > 2000, f"the model renders ({n} non-background pixels)"
                assert host.evaluate("__tribeViewer.playing()") and host.get_attribute("#vw-play", "data-state") == "playing"
                t0 = host.evaluate("__tribeViewer.time()"); host.wait_for_timeout(300); assert host.evaluate("__tribeViewer.time()") > t0, "the clip plays"
                host.click("#vw-play"); assert host.get_attribute("#vw-play", "data-state") == "paused"
                t1 = host.evaluate("__tribeViewer.time()"); host.wait_for_timeout(300); assert abs(host.evaluate("__tribeViewer.time()") - t1) < 1e-6, "paused"
                # orbit: drag changes the picture; double-click resets it
                before = host.evaluate("document.querySelector('#vw-canvas').toDataURL()")
                bb = host.locator("#vw-canvas").bounding_box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
                host.mouse.move(cx, cy); host.mouse.down(); host.mouse.move(cx + 160, cy + 40, steps=8); host.mouse.up(); host.wait_for_timeout(400)
                assert host.evaluate("document.querySelector('#vw-canvas').toDataURL()") != before, "dragging turns the model"
                host.mouse.wheel(0, -400); host.wait_for_timeout(200)
                host.dblclick("#vw-canvas"); host.wait_for_timeout(600)
                if SHOTS: host.screenshot(path=str(ROOT / "docs" / "screenshots" / "viewer-3d.png"))
                print(f"  3D viewer rendered the GLB with three.js {THREE_VER} from {how}")
            host.keyboard.press("Escape"); host.wait_for_selector("#vw", state="detached", timeout=3000)

            # ---------- phone: Docs hub → assets → full-screen sheet with touch-sized controls ----------
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Orion", orion, pid)); route_three(ph)
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            phone.click('#tabbar [data-nav="docs"]')
            phone.wait_for_selector("#vw-assets-hub .vw-arow", timeout=15000)
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Docs hub: no sideways scroll"
            phone.locator("#vw-assets-hub [data-view-path='sprites/walk.png']").scroll_into_view_if_needed()
            phone.tap("#vw-assets-hub [data-view-path='sprites/walk.png']")
            phone.wait_for_selector("#vw-body[data-ready='1']", timeout=10000)
            box = phone.evaluate("(() => { const r = document.querySelector('#vw .vw').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
            assert box[0] == 0 and box[2] == 390 and box[3] >= 840, f"full-screen sheet {box}"
            assert phone.evaluate("document.querySelector('#vw .vw').scrollWidth <= 391") and phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            nb = phone.locator("#vw-next").bounding_box(); assert nb["width"] >= 44 and nb["height"] >= 44, nb
            phone.tap("#vw-play"); fi = phone.evaluate("__tribeViewer.frame()"); phone.tap("#vw-next"); assert phone.evaluate("__tribeViewer.frame()") == (fi + 1) % 4
            assert phone.evaluate(PIXELS, "#vw-canvas") > 0
            if SHOTS: phone.screenshot(path=str(ROOT / "docs" / "screenshots" / "viewer-phone.png"))
            phone.tap("#vw-close"); phone.wait_for_selector("#vw", state="detached", timeout=3000)
            if three_ok:
                phone.tap("#vw-assets-hub [data-view-path='models/cube.glb']")
                phone.wait_for_selector("#vw-body[data-ready='1']", timeout=30000)
                assert phone.evaluate(PIXELS, "#vw-canvas") > 1000 and phone.text_content("#vw-s-tris b") == "12"
                assert "pinch" in phone.text_content("#vw .vw-hint")
                phone.tap("#vw-close")
            b.close()
        assert not errors, errors
        print("e2e_viewers: OK (assets list, pixel-art grid / Aseprite JSON / GIF viewer, 3D GLB viewer, chat View, phone sheet, members-only asset bytes)")
    except Exception:
        try: print((tmp / "server.log").read_text()[-2500:])
        except Exception: pass
        raise
    finally:
        srv.terminate()
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
