"""Share a clip (app/ui/shareclip.js, docs/SHARE-CLIPS.md) and the social and share templates (app/ui/motionsocial.js).
Checks: 50+ social post layouts and the share clips are in Motion Studio's gallery and every one is different; Publish ›
Where it goes › Share a clip opens the sheet; the four sources (App Creator screens, a screenshot from Visuals, a
timelapse of a screen's versions, pictures you add); sizes 9:16, 1:1 and 16:9 pick the matching template; the end card is
on by default and leaves the clip (and the caption's "Made with TribeCode") when turned off; the live preview draws;
captions for X, TikTok and Instagram stay inside their limits with at most one or two hashtags; Copy; "Open in Motion
Studio" opens the clip there with the pictures and a WebM export comes back; a share clip loops (first frame = last);
Flint ("make a clip for tiktok", "make a timelapse") opens it; the suggestion provider suggests a clip of today's
changes; 390px has no sideways scroll and 40px targets.
Usage: python3 app/test/e2e_share_clip.py [--shots]   (--shots writes docs/screenshots/share-clip*.png)
"""
import base64, json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6270 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-shc-", dir="/tmp")); errors = []
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
        # three versions of one screen (a timelapse) and one of another, all posted today
        for i, rgb in enumerate([(242, 107, 29), (56, 198, 177), (108, 124, 255)]):
            code, _ = api("/visuals", "POST", {"screen": "Home page", "png_base64": "data:image/png;base64," + base64.b64encode(png_rgb(640, 400, rgb)).decode()}, host); assert code == 200
            time.sleep(0.02)
        assert api("/visuals", "POST", {"screen": "Shop", "png_base64": "data:image/png;base64," + base64.b64encode(png_rgb(390, 844, (250, 189, 47))).decode()}, host)[0] == 200
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            s = {"name": "Orion", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": host}}
            init = "if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}))" % json.dumps(json.dumps(s))
            c = b.new_context(viewport={"width": 1280, "height": 860}); c.add_init_script(init)
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append("console: " + m.text))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
            pg.wait_for_function("window.TribeRouter && window.TribeShell && window.TribeShareClip && window.TribeMotionStudio && window.TribePublish", timeout=40000)
            pg.wait_for_function("TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1000)
            pg.evaluate(f"TribeClient.switchProject && TribeClient.switchProject('{pid}')"); pg.wait_for_timeout(800)

            # ---------- the templates: 50+ social layouts, the share clips, all different, all looping ----------
            cats = pg.evaluate("(() => { const K = TribeMotionKit, n = {}; K.LIST.forEach(id => { const c = K.TEMPLATES[id].cat; n[c] = (n[c] || 0) + 1; }); return n; })()")
            assert cats.get("social", 0) >= 50 and cats.get("share", 0) >= 9, cats
            assert pg.evaluate("TribeMotionKit.CATS.some(c => c[0] === 'share')")
            sig = """cat => TribeMotionKit.LIST.filter(id => TribeMotionKit.TEMPLATES[id].cat === cat).map(id => { const K = TribeMotionKit, d = K.make(id), c = document.createElement('canvas'); c.width = 24; c.height = Math.round(24 * d.size.h / d.size.w); const g = c.getContext('2d'); g.scale(24 / d.size.w, 24 / d.size.w);
                const ts = [0.2, 0.45, 0.7].map(f => K.duration(d) * f); let out = ''; for (const t of ts) { g.setTransform(24 / d.size.w, 0, 0, 24 / d.size.w, 0, 0); g.clearRect(0, 0, d.size.w, d.size.h); K.draw(g, d, t, {}); out += Array.from(g.getImageData(0, 0, c.width, c.height).data).filter((_, i) => i % 4 !== 3).map(v => v >> 5).join(''); } return out; })"""
            sigs = pg.evaluate(sig, "social")
            assert len(set(sigs)) == len(sigs), f"every social layout looks different ({len(set(sigs))} of {len(sigs)})"
            loops = pg.evaluate("""() => ['share-app-916', 'share-site-11', 'share-timelapse-169', 'soc-poll-916', 'soc-before-after-916'].map(id => { const K = TribeMotionKit, d = K.make(id), px = t => { const c = document.createElement('canvas'); c.width = 120; c.height = Math.round(120 * d.size.h / d.size.w); const g = c.getContext('2d'); g.scale(120 / d.size.w, 120 / d.size.w); K.draw(g, d, t, {}); return Array.from(g.getImageData(0, 0, c.width, c.height).data); };
                const a = px(0), z = px(K.duration(d)); let diff = 0; for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - z[i]); return [id, diff / a.length]; })""")
            assert all(d < 1.5 for _, d in loops), f"share clips loop: {loops}"

            # ---------- Publish › Where it goes › Share a clip ----------
            pg.evaluate("window.TribeAppCreator = Object.assign(window.TribeAppCreator || {}, { screens: async () => [{ id: 'home', name: 'Home', png: %s }, { id: 'cart', name: 'Cart', png: %s }] })" % (
                json.dumps("data:image/png;base64," + base64.b64encode(png_rgb(390, 844, (17, 17, 17))).decode()), json.dumps("data:image/png;base64," + base64.b64encode(png_rgb(390, 844, (240, 240, 240))).decode())))
            pg.evaluate(f"TribePublish.open('{pid}')")
            pg.wait_for_selector("[data-dest='share'] [data-shareclip]", timeout=15000)
            pg.click("[data-dest='share'] [data-shareclip]")
            pg.wait_for_selector("#shc-sheet #shc-cv", timeout=10000)
            assert pg.locator("#invite-modal.hidden").count() == 1, "the Publish sheet steps aside"
            pg.wait_for_function("TribeShareClip.state() && TribeShareClip.state().source === 'app' && TribeShareClip.state().images === 2", timeout=15000)
            st = pg.evaluate("TribeShareClip.state()")
            assert st["template"] == "share-app-916" and st["end"] is True and st["aspect"] == "9:16", st
            assert pg.locator("#shc-strip img, .shc-strip img").count() == 2
            drawn = pg.evaluate("(() => { const c = document.querySelector('#shc-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4); })()")
            assert drawn > 0.9, f"the live preview draws ({drawn})"

            # sizes pick the matching template
            for a, want in [("1:1", "share-app-11"), ("16:9", "share-app-169"), ("9:16", "share-app-916")]:
                pg.click(f"#shc-size [data-aspect='{a}']"); assert pg.evaluate("TribeShareClip.state().template") == want
                assert pg.get_attribute(f"#shc-size [data-aspect='{a}']", "aria-checked") == "true"

            # captions: limits, hashtags, copy, credit follows the end card
            caps = pg.evaluate("TribeShareClip.captions()")
            for k, mx, tags in [("x", 280, 1), ("tiktok", 2200, 2), ("instagram", 2200, 2)]:
                assert 0 < len(caps[k]) <= mx and caps[k].count("#") <= tags and "Pixel" in caps[k] or "pixel" in caps[k].lower(), (k, caps[k])
                assert "Made with TribeCode" in caps[k], k
            pg.click("[data-plat='x']"); assert "/ 280" in pg.inner_text("#shc-count")
            c.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            pg.click("#shc-copy"); assert pg.evaluate("navigator.clipboard.readText()") == pg.input_value("#shc-cap")
            pg.fill("#shc-cap", "x" * 300); assert "shc-over" in (pg.get_attribute("#shc-count", "class") or "") and "over the limit" in pg.inner_text("#shc-probs")
            pg.uncheck("#shc-end"); pg.wait_for_timeout(100)
            assert not any(s.get("kind") == "endcard" for s in pg.evaluate("TribeShareClip.build().states")), "no end card when it is off"
            assert all("Made with TribeCode" not in v for k, v in pg.evaluate("TribeShareClip.captions()").items() if k in ("x", "tiktok", "instagram")), "the credit leaves the captions too"
            pg.check("#shc-end"); assert any(s.get("kind") == "endcard" for s in pg.evaluate("TribeShareClip.build().states"))
            pg.fill("#shc-hook", "Three friends, one weekend")
            assert pg.evaluate("TribeShareClip.build().states[0].text") == "Three friends, one weekend"
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "share-clip.png"))

            # ---------- a screenshot from Visuals, then a timelapse of its versions ----------
            pg.click("#shc-src [data-src='shots']"); pg.wait_for_selector("[data-shot]")
            assert pg.locator("[data-shot]").count() == 2
            pg.wait_for_function("TribeShareClip.state().images === 1", timeout=10000)
            assert pg.evaluate("TribeShareClip.state().template") == "share-site-916"
            pg.click("#shc-src [data-src='timelapse']"); pg.wait_for_selector("#shc-lapse")
            assert pg.locator("#shc-lapse option").count() == 2, "every screen, and the one with versions"
            pg.select_option("#shc-lapse", "home-page")
            pg.wait_for_function("TribeShareClip.state().images === 3", timeout=10000)
            tl = pg.evaluate("TribeShareClip.build()")
            assert tl["template"] == "share-timelapse-916" and sum(1 for s in tl["states"] if s["kind"] == "image") == 3, [s["kind"] for s in tl["states"]]
            pg.select_option("#shc-lapse", ""); pg.wait_for_function("TribeShareClip.state().images === 4", timeout=10000)

            # ---------- pictures you add ----------
            pg.click("#shc-src [data-src='upload']"); pg.wait_for_selector("#shc-file", state="attached")
            f1, f2 = tmp / "a.png", tmp / "b.png"; f1.write_bytes(png_rgb(300, 200, (10, 120, 200))); f2.write_bytes(png_rgb(300, 200, (200, 30, 90)))
            pg.set_input_files("#shc-file", [str(f1), str(f2)])
            pg.wait_for_function("TribeShareClip.state().images === 2", timeout=10000)
            assert "2" in pg.inner_text("#shc-up-n")

            # ---------- Open in Motion Studio: the clip is there, with its pictures, and exports ----------
            pg.click("#shc-src [data-src='app']"); pg.wait_for_function("TribeShareClip.state().images === 2", timeout=10000)
            pg.click("#shc-go"); pg.wait_for_function("TribeMotionStudio.isOpen()", timeout=15000)
            ms = pg.evaluate("TribeMotionStudio.state()")
            assert "share-app-916" in json.dumps(ms), str(ms)[:300]
            assert pg.locator("#shc-sheet").count() == 0
            size = pg.evaluate("(async () => { const r = await TribeMotionStudio.exportAs('webm', { scale: 0.25, fps: 10, seconds: 1.2 }); return r && r.blob ? r.blob.size : 0; })()")
            assert size > 500, f"a WebM comes back ({size} bytes)"
            pg.evaluate("TribeMotionStudio.close()"); pg.wait_for_function("!TribeMotionStudio.isOpen()", timeout=5000)

            # ---------- Motion Studio's Export tab offers it too ----------
            pg.evaluate("TribeMotionStudio.open({ template: 'soc-poll-916' })"); pg.wait_for_function("TribeMotionStudio.isOpen()", timeout=10000)
            pg.click("[data-mos-tab='export']"); pg.wait_for_selector("[data-share-clip]"); pg.click("[data-share-clip]")
            pg.wait_for_selector("#shc-sheet #shc-cv", timeout=10000)
            pg.click("#shc-cancel"); pg.wait_for_selector("#shc-sheet", state="detached")
            pg.evaluate("TribeMotionStudio.close()"); pg.wait_for_timeout(300)

            # ---------- Flint ----------
            pg.evaluate("TribeFlint && TribeFlint.ask ? TribeFlint.ask('make a clip for tiktok') : null")
            pg.wait_for_selector("#shc-sheet #shc-cv", timeout=15000)
            assert pg.evaluate("TribeShareClip.state().aspect") == "9:16" and pg.evaluate("TribeShareClip.state().platform") == "tiktok"
            pg.evaluate("TribeShareClip.close()"); pg.wait_for_selector("#shc-sheet", state="detached")
            pg.evaluate("TribeFlint.ask('make a timelapse')"); pg.wait_for_function("TribeShareClip.state() && TribeShareClip.state().source === 'timelapse'", timeout=15000)
            pg.evaluate("TribeShareClip.close()"); pg.wait_for_selector("#shc-sheet", state="detached")

            # ---------- the tribe's suggestions: a clip of today's changes ----------
            got = pg.evaluate(f"(async () => {{ const p = TribeShareClip.suggestProvider, ctx = {{ projectId: '{pid}' }}; const g = await p.gather(ctx); const s = await p.suggest(ctx, g); window.__s = s; return s.map(x => [x.id, x.title, x.from.length]); }})()")
            assert len(got) == 1 and got[0][1] == "Make a clip of today's changes" and got[0][2] >= 1, got
            pg.evaluate("(async () => { window.__undo = await window.__s[0].apply(); })()")
            pg.wait_for_function("TribeShareClip.state() && TribeShareClip.state().source === 'timelapse'", timeout=15000)
            pg.evaluate("window.__undo()"); pg.wait_for_selector("#shc-sheet", state="detached")
            c.close()

            # ---------- 390px ----------
            c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c.add_init_script(init)
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
            pg.wait_for_function("window.TribeShareClip && TribeClient.connected()", timeout=45000); pg.wait_for_timeout(800)
            pg.evaluate(f"TribeShareClip.open({{ pid: '{pid}' }})"); pg.wait_for_selector("#shc-sheet #shc-cv", timeout=10000); pg.wait_for_timeout(600)
            assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll at 390px"
            small = pg.evaluate("[...document.querySelectorAll('#shc button, #shc [role=radio], #shc-sheet .ui-foot button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 36 && e.type !== 'checkbox').map(e => (e.id || e.className) + ':' + Math.round(e.getBoundingClientRect().height))")
            assert not small, f"phone targets are big enough: {small}"
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT_DIR / "share-clip-phone.png"))
            c.close(); b.close()
        assert not errors, errors
        print("e2e_share_clip: OK (50+ social layouts all different, share clips loop, Publish row, four sources, sizes, end card, captions with limits and copy, Motion Studio hand-off and WebM, Export tab, Flint, suggestion, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
