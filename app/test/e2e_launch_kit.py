"""Launch kit (app/ui/launchkit.js, docs/LAUNCH-KIT.md): from Publish › Where it goes › Launch kit, a beginner gets store
screenshots, app icons, store text, a paywall design, the launch checklist and the preview-video step.
Checks: the row opens the kit; 50 screenshot styles, 54 icon styles and 17 paywalls render as thumbnails from the real
renderer and no two look the same; a real screen from Visuals and an App Creator screen can be picked; the screenshot zip
holds every file at the exact store size as an RGB PNG (no alpha); the icon zip holds every size (alpha only where
allowed); counters and keyword checks; the first draft; the checklist persists on the server; the preview-video button
feature-detects Motion Studio; the tribe suggestion provider registers, suggests and undoes; 390px has no sideways scroll
and 40px targets.
Usage: python3 app/test/e2e_launch_kit.py [--shots]   (--shots writes docs/screenshots/launch-kit*.png)
"""
import base64, io, json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6250 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
SHOT_DIR = ROOT / "docs" / "screenshots"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def png_rgb(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


def png_head(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "a PNG"
    w, h, depth, ctype = struct.unpack(">IIBB", data[16:26])
    return w, h, ctype


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-lk-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        app = tmp / "src" / "pixel-quest"; app.mkdir(parents=True)
        (app / "index.html").write_text("<!doctype html><title>Pixel Quest</title><h1>Pixel Quest</h1>")
        g = lambda *a: subprocess.run(["git", "-C", str(app), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
        g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")
        code, r = api("/projects", "POST", {"path": str(app)}, host); assert code == 200, (code, r)
        pid = r["project"]["id"]
        # a project with no code still reaches the kit from Publish
        first = api("/projects", token=host)[1]["projects"][0]["id"]
        assert api("/publish/real", "PUT", {"project": pid, "kind": "app"}, host)[0] == 200, "the project is an app"
        shot = "data:image/png;base64," + base64.b64encode(png_rgb(390, 844, (56, 198, 177))).decode()
        code, v = api("/visuals", "POST", {"screen": "Home screen", "png_base64": shot}, host); assert code == 200, code
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            s = {"name": "Orion", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": host}}
            init = "if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}))" % json.dumps(json.dumps(s))
            c = b.new_context(viewport={"width": 1280, "height": 860}, accept_downloads=True); c.add_init_script(init)
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("dialog", lambda d: d.accept())
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
            pg.wait_for_function("window.TribeRouter && window.TribeShell && window.TribeLaunchKit && window.TribePublish", timeout=40000)
            pg.wait_for_function("TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1200)

            # ---------- no code yet: Publish still offers the kit ----------
            pg.evaluate(f"TribePublish.open('{first}')")
            pg.wait_for_selector("#pb-body [data-launchkit]", timeout=15000); pg.click("#pb-body [data-launchkit]")
            pg.wait_for_selector("#lk #lk-cv", timeout=10000); pg.click("#lk-x"); pg.wait_for_selector("#lk", state="detached")
            pg.evaluate(f"TribeClient.switchProject && TribeClient.switchProject('{pid}')"); pg.wait_for_timeout(800)

            # ---------- Publish › Where it goes › Launch kit ----------
            pg.evaluate(f"TribePublish.open('{pid}')")
            pg.wait_for_selector("[data-dest='launch'] [data-launchkit]", timeout=15000)
            pg.click("[data-dest='launch'] [data-launchkit]")
            pg.wait_for_selector("#lk #lk-cv", timeout=10000)
            assert pg.locator("#invite-modal.hidden").count() == 1, "the Publish sheet steps aside"

            # ---------- screenshot styles: 50, all drawn, all different ----------
            assert pg.locator("[data-lk-style]").count() >= 50
            sig = """sel => [...document.querySelectorAll(sel)].map(cv => { const c = document.createElement('canvas'); c.width = 12; c.height = 24; const x = c.getContext('2d'); x.drawImage(cv, 0, 0, 12, 24); const d = x.getImageData(0, 0, 12, 24).data; let s = ''; for (let i = 0; i < d.length; i += 4) s += ((d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5)).toString(36); return s; })"""
            pg.wait_for_function("(() => { const cs = [...document.querySelectorAll('[data-lk-style] canvas')]; const last = cs[cs.length - 1]; if (!last) return false; const d = last.getContext('2d').getImageData(0, 0, last.width, last.height).data; for (let i = 0; i < d.length; i += 40) if (d[i + 3]) return true; return false; })()", timeout=40000)
            sigs = pg.evaluate(sig, "[data-lk-style] canvas")
            assert len(set(sigs)) == len(sigs), f"every screenshot style looks different ({len(set(sigs))} of {len(sigs)})"
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "launch-kit.png"))

            # ---------- pick a real screen (Visuals) and an App Creator screen ----------
            pg.evaluate("window.TribeAppCreator = { screens: async () => [{ id: 'cart', name: 'Cart', image: %s }], insertScreen: async x => { window.__ins = x; } }" % json.dumps("data:image/png;base64," + base64.b64encode(png_rgb(200, 420, (108, 124, 255))).decode()))
            pg.click("#lk-src"); pg.wait_for_selector(".ui-card .lk-src")
            body = pg.inner_text(".ui-card")
            assert "Home screen" in body and "Cart" in body and "From the App Creator" in body and "From Visuals" in body, body
            pg.locator(".ui-card .lk-src", has_text="Home screen").click(); pg.wait_for_selector(".ui-card", state="detached")
            assert pg.inner_text("#lk-src") == "Home screen"
            pg.fill("#lk-cap", "Plan your week in minutes"); pg.click("[data-lk-style='s07']")
            pg.click("[data-lk-sel='1']"); pg.click("#lk-src"); pg.locator(".ui-card .lk-src", has_text="Cart").click(); pg.wait_for_selector(".ui-card", state="detached")

            # ---------- the zip: exact sizes, RGB PNGs ----------
            with pg.expect_download(timeout=120000) as dl:
                pg.click("#lk-zip")
            z = zipfile.ZipFile(dl.value.path())
            names = z.namelist(); n = pg.evaluate("TribeLaunchKit.state().kit.slides.length")
            want = {"app-store/iphone-6.9": (1320, 2868), "app-store/iphone-6.1": (1206, 2622), "google-play/phone": (1080, 1920)}
            for folder, (w, h) in want.items():
                files = [x for x in names if x.startswith(folder + "/")]
                assert len(files) == n, (folder, files)
                for f in files:
                    fw, fh, ct = png_head(z.read(f)); assert (fw, fh) == (w, h) and ct == 2, (f, fw, fh, ct)
            fw, fh, ct = png_head(z.read("google-play/feature-graphic.png")); assert (fw, fh, ct) == (1024, 500, 2)
            assert "README.txt" in names

            # ---------- icons: 54 styles, all different, every size ----------
            pg.click("[data-lk-tab='icon']"); pg.wait_for_selector("#lk-ic")
            assert pg.locator("[data-lk-icon]").count() >= 50
            pg.wait_for_function("(() => { const cs = [...document.querySelectorAll('[data-lk-icon] canvas')]; const last = cs[cs.length - 1]; const d = last.getContext('2d').getImageData(0, 0, 64, 64).data; return d[3] > 0; })()", timeout=30000)
            isigs = pg.evaluate(sig, "[data-lk-icon] canvas")
            assert len(set(isigs)) == len(isigs), f"every icon style looks different ({len(set(isigs))} of {len(isigs)})"
            pg.fill("#lk-ictx", "PQ"); pg.click("[data-lk-sym='map']"); pg.click("[data-lk-icon='i03']")
            if SHOTS: pg.wait_for_timeout(500); pg.screenshot(path=str(SHOT_DIR / "launch-kit-icon.png"))
            with pg.expect_download(timeout=60000) as dl:
                pg.click("#lk-iczip")
            z = zipfile.ZipFile(dl.value.path()); names = z.namelist()
            for f, size, alpha_ok in (("ios/AppIcon-1024.png", 1024, False), ("android/play-store-512.png", 512, True), ("android/adaptive-foreground-432.png", 432, True), ("android/adaptive-background-432.png", 432, False), ("web/icon-192.png", 192, False), ("web/icon-512.png", 512, False), ("web/icon-maskable-512.png", 512, False), ("web/apple-touch-icon-180.png", 180, False), ("web/favicon-32.png", 32, False), ("web/favicon-48.png", 48, False)):
                w, h, ct = png_head(z.read(f)); assert (w, h) == (size, size), (f, w, h)
                assert ct == (6 if alpha_ok else 2), (f, ct)
            assert json.loads(z.read("web/manifest-icons.json"))["icons"][2]["purpose"] == "maskable"

            # ---------- store text ----------
            pg.click("[data-lk-tab='text']"); pg.wait_for_selector("#lk-t-name")
            pg.fill("#lk-t-name", "The best Pixel Quest app ever made")
            assert "over the limit" in pg.inner_text("#lk-k-name") and "best" in pg.inner_text("#lk-k-name")
            assert "is-over" in pg.get_attribute("#lk-c-name", "class")
            pg.fill("#lk-t-name", "Pixel Quest"); pg.fill("#lk-t-subtitle", "")
            pg.fill("#lk-t-keywords", "pixel, quest,jump,jumps,ab")
            assert "bytes" in pg.inner_text("#lk-c-keywords")
            kt = pg.inner_text("#lk-k-keywords"); assert "Said twice" in kt and "Already in your name" in kt and "Spaces after commas" in kt, kt
            pg.click("#lk-tidy"); pg.wait_for_timeout(200); assert pg.input_value("#lk-t-keywords") == "jump", pg.input_value("#lk-t-keywords")
            pg.click("#lk-draft"); pg.wait_for_function("document.querySelector('#lk-t-subtitle') && document.querySelector('#lk-t-subtitle').value.length > 0", timeout=10000)
            assert pg.input_value("#lk-t-name") == "Pixel Quest", "a draft never overwrites what you wrote"
            assert len(pg.input_value("#lk-t-description")) > 20
            pg.click("[data-lk-store='google']"); pg.wait_for_selector("#lk-t-gshort"); assert pg.input_value("#lk-t-gshort")

            # ---------- paywall: 17 layouts, all different, a screen and the App Creator hand-off ----------
            pg.click("[data-lk-tab='paywall']"); pg.wait_for_selector("#lk-pw")
            assert "Payments are not connected yet" in pg.inner_text(".lk-banner")
            assert pg.locator("[data-lk-pw]").count() >= 15
            pg.wait_for_function("(() => { const cs = [...document.querySelectorAll('[data-lk-pw] canvas')]; const last = cs[cs.length - 1]; const d = last.getContext('2d').getImageData(0, 0, last.width, last.height).data; return d[3] > 0; })()", timeout=30000)
            psigs = pg.evaluate(sig, "[data-lk-pw] canvas")
            assert len(set(psigs)) == len(psigs), f"every paywall layout looks different ({len(set(psigs))} of {len(psigs)})"
            pg.click("[data-lk-pw='timeline']"); pg.fill("#lk-pwt", "Go Pro")
            pg.click("#lk-pwins"); pg.wait_for_function("window.__ins && window.__ins.kind === 'paywall'", timeout=8000)
            assert "Go Pro" in pg.evaluate("window.__ins.html") and pg.evaluate("window.__ins.image.startsWith('data:image/png')")
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "launch-kit-paywall.png"))
            with pg.expect_download() as dl:
                pg.click("#lk-pwhtml")
            assert "Payments are not connected yet" in Path(dl.value.path()).read_text()

            # ---------- checklist persists on the server ----------
            pg.click("[data-lk-tab='check']"); pg.wait_for_selector("[data-lk-chk='a-icon']")
            pg.check("[data-lk-chk='a-icon']"); pg.check("[data-lk-chk='g-shots']")
            pg.locator("[data-lk-note='a-review'] >> xpath=..").locator("summary").click()
            pg.fill("[data-lk-note='a-review']", "Demo login: demo@example.com")
            assert "2 of" in pg.inner_text("#lk-prog")
            pg.wait_for_timeout(1200)
            kit = api(f"/projects/{pid}/launchkit", token=host)[1]["kit"]
            assert kit["checks"].get("a-icon") and kit["checks"].get("g-shots") and "Demo login" in kit["notes"]["a-review"], kit["checks"]
            assert kit["text"]["name"] == "Pixel Quest" and kit["paywall"]["layout"] == "timeline"
            assert "not legal advice" in pg.inner_text(".lk-sources")

            # ---------- preview video: Motion Studio when it is there ----------
            pg.click("[data-lk-tab='video']"); pg.wait_for_selector("#lk-motion")
            assert pg.is_disabled("#lk-motion"), "no Motion Studio, no button to press"
            pg.fill("#lk-yt", "https://www.youtube.com/playlist?list=PL1"); assert "playlist" in pg.inner_text("#lk-ytok")
            pg.fill("#lk-yt", "https://youtu.be/dQw4w9WgXcQ"); assert "Looks right" in pg.inner_text("#lk-ytok")
            pg.evaluate("window.TribeMotionStudio = { open: o => { window.__ms = o; } }")
            pg.click("[data-lk-tab='check']"); pg.click("[data-lk-tab='video']"); pg.click("#lk-motion")
            pg.wait_for_function("window.__ms && window.__ms.template === 'app-preview' && window.__ms.screens.length >= 1", timeout=30000)

            # ---------- the tribe's suggestions ----------
            assert api("/chat/general/send", "POST", {"text": "What's new in v0.5:\n- a shop\n- coins"}, host)[0] == 200
            code, v = api("/visuals", "POST", {"screen": "Shop", "png_base64": shot}, host); assert code == 200
            pg.evaluate("window.TribeSuggest = { register: p => { window.__prov = p; } }; document.dispatchEvent(new Event('tribe:suggest-ready'))")
            pg.wait_for_function("window.__prov && window.__prov.id === 'launch'", timeout=5000)
            pg.click("[data-lk-tab='text']"); pg.click("[data-lk-store='apple']"); pg.wait_for_selector("#lk-t-keywords"); pg.fill("#lk-t-keywords", "pixel,quest,coins,coin"); pg.wait_for_timeout(1200)
            pg.wait_for_timeout(300)
            got = pg.evaluate(f"(async () => {{ const p = window.__prov, ctx = {{ projectId: '{pid}' }}; const g = await p.gather(ctx); const s = await p.suggest(ctx, g); window.__sugs = s; return s.map(x => [x.id, x.title, x.why, x.from.length]); }})()")
            ids = [x[0] for x in got]
            assert ids == ["launch-shots", "launch-whatsnew", "launch-keywords"], got
            assert got[0][1] == "Refresh your store screenshots" and "Shop" in got[0][2] and got[2][1].startswith("Free up ") and got[1][2].startswith("Orion "), got
            pg.evaluate("(async () => { window.__undo = await window.__sugs[1].apply(); })()"); pg.wait_for_function("!!window.__undo", timeout=8000)   # a bare function would be called as the predicate
            assert "a shop" in api(f"/projects/{pid}/launchkit", token=host)[1]["kit"]["text"]["whatsnew"].lower()
            pg.evaluate("(async () => { await window.__undo(); window.__undone = 1; })()"); pg.wait_for_function("window.__undone", timeout=8000)
            assert "a shop" not in api(f"/projects/{pid}/launchkit", token=host)[1]["kit"]["text"]["whatsnew"].lower(), "undo puts it back"

            # ---------- Esc closes; Ctrl K and Flint open it ----------
            pg.focus("#lk"); pg.keyboard.press("Escape"); pg.wait_for_selector("#lk", state="detached", timeout=3000)
            pg.evaluate("TribeLaunchKit.open(undefined, 'icon')"); pg.wait_for_selector("#lk #lk-ic"); pg.click("#lk-x"); pg.wait_for_selector("#lk", state="detached")
            c.close()

            # ---------- phone, 390px ----------
            c = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, accept_downloads=True); c.add_init_script(init)
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("dialog", lambda d: d.accept())
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
            pg.wait_for_function("window.TribeLaunchKit && TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1000)
            pg.evaluate(f"TribeLaunchKit.open('{pid}')"); pg.wait_for_selector("#lk #lk-cv")
            for tab in ("shots", "icon", "text", "paywall", "check", "video"):
                pg.click(f"[data-lk-tab='{tab}']"); pg.wait_for_timeout(350)
                wide = pg.evaluate("(() => { const b = document.querySelector('#lk-body'); return document.documentElement.scrollWidth > innerWidth + 1 || b.scrollWidth > b.clientWidth + 1; })()")
                assert not wide, f"no sideways scroll on the {tab} tab"
                small = pg.evaluate("[...document.querySelectorAll('#lk .btn, #lk .lk-tab, #lk .lk-x, #lk .lk-sym, #lk .lk-src')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 36 || r.width < 36); }).map(e => (e.id || e.className) + ' ' + Math.round(e.getBoundingClientRect().height))")
                assert not small, f"targets under 36px on {tab}: {small}"
            for sel in ("#lk-x", "[data-lk-tab='shots']"):
                assert pg.locator(sel).bounding_box()["height"] >= 40, sel
            pg.click("[data-lk-tab='shots']"); pg.wait_for_timeout(400)
            assert pg.locator("#lk-zip").bounding_box()["height"] >= 40
            if SHOTS: pg.wait_for_timeout(600); pg.screenshot(path=str(SHOT_DIR / "launch-kit-phone.png"))
            c.close(); b.close()
        assert not errors, errors[:5]
        print("e2e_launch_kit: OK (Publish row, 50 screenshot styles, 54 icon styles and 17 paywalls all different, Visuals + App Creator screens, exact-size RGB zip, icon sizes, text checks and draft, checklist saved, Motion Studio hand-off, suggestions with undo, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
