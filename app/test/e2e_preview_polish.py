"""End-to-end: the polished preview (feat/preview).

1. Desktop toolbar: App | Website, device sizes (390 / 768 / 1280), reload, new tab, share link, comment pins, Select,
   Saved and "Ask Flint to change…" are all there, in one bar. The website's empty state has a next step (Open the website designer).
2. Flint edits the website locally, no AI (the server's brain is off): "make the headline say …", "change the accent to teal",
   "add a pricing section", "swap to the Studio template", "remove the testimonials", click-to-select + new words, and undo.
   Each change reloads the preview (the frame shows it) and is kept as a version.
3. API: the shared rules (siteedit-core.js) parse; a sentence the rules don't know says what does work (no AI on);
   spectators can't edit; a logo upload goes through the same checks as the brand kit.
4. Saved shelf: save a version with a note, change the site, compare (thumbnails + the changes in words), restore. The
   shelf shows in Files › Website under "Website versions".
5. Phones (390 px): no sideways scroll; Page / Edit / Saved tabs; a swipe on the tab bar opens the edit sheet; the edit
   sheet works (a chip edits the site); the device toggle shows the desktop page shrunk to fit and pinch-zooms it.
Usage: python app/test/e2e_preview_polish.py [--shots]   (--shots saves docs/screenshots/preview-desktop.png,
       preview-flint-edit.png, preview-phone.png)
"""
import base64, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 4977 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
errors = []
sys.path.insert(0, str(ROOT))


class FakeLLM(BaseHTTPRequestHandler):   # an OpenAI-compatible stand-in: turns "sunday morning" into edit operations
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); text = json.dumps(json.loads(self.rfile.read(n) or b"{}").get("messages", []))
        out = json.dumps({"ops": [{"op": "copy", "section": "hero", "field": "dek", "value": "Warm loaves from six on Sunday mornings"}], "say": "Made the tagline feel like a slow Sunday."}) if "edit operations" in text else "OK"
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": out}}]}) + "\n\n").encode()); self.wfile.write(b"data: [DONE]\n\n")


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    url = BASE + (path if path.startswith("/api") else "/api" + path)
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            d = r.read(); ct = r.headers.get("Content-Type", "")
            return r.status, (json.loads(d or b"{}") if "json" in ct else d.decode())
    except urllib.error.HTTPError as e:
        d = e.read()
        try: return e.code, json.loads(d or b"{}")
        except Exception: return e.code, d.decode()


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text
            and "EventSource" not in m.text and "sandboxed" not in m.text and "Content Security Policy" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Camp', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if take:
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


FRAME_HAS = "t => { const f = document.querySelector('#pvw-iframe'); return !!f; }"


def frame_text(page):
    """The website draft's text, read through the frame (the draft is its own origin: ask Playwright's frame API)."""
    f = page.frame_locator("#pvw-iframe")
    return f.locator("body").inner_text(timeout=8000)


def wait_text(page, want, gone=False, timeout=10000):
    t0 = time.time()
    while time.time() - t0 < timeout / 1000:
        try:
            t = frame_text(page)
            if (want in t) != gone: return t
        except Exception: pass
        page.wait_for_timeout(200)
    raise AssertionError(f"frame {'still has' if gone else 'never showed'} {want!r}")


def flint(page, text):
    n = page.locator("#pvf-feed .pvf-it").count()
    page.fill("#pvf-in", text); page.press("#pvf-in", "Enter")
    page.wait_for_function(f"document.querySelectorAll('#pvf-feed .pvf-it').length >= {n + 2}", timeout=10000)
    return page.locator("#pvf-feed .pvf-it").last.inner_text()


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="tribe-pvpolish-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="pvpolish-src-", dir="/tmp")
    repo = os.path.join(work, "crumb"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Crumb Bakery\n")
    Path(repo, "index.html").write_text("<!doctype html><title>Crumb</title><h1>Crumb</h1><p>Order online soon.</p>")
    git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Polish"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]
        ok(api(f"/projects/{pid}", "PATCH", {"bio": "Sourdough and cinnamon buns, baked every morning"}, token=camp))
        P = f"/projects/{pid}/website"

        # ======== 3: the shared rules, and the API with no AI ========
        core = subprocess.run(["node", "-e", """const c=require('./app/ui/siteedit-core.js');const t=['make the headline say Fresh bread daily','change the accent to teal','add a pricing section','swap to the Studio template','add my logo','remove the testimonials','undo','move the faq to the top'];
console.log(JSON.stringify(t.map(x=>{const p=c.parse(x);return p&&p.ops[0]})))"""], cwd=str(ROOT), capture_output=True, text=True, check=True).stdout
        ops = json.loads(core)
        assert [o["op"] for o in ops] == ["copy", "accent", "add", "theme", "logo", "remove", "undo", "move"], ops
        assert ops[0] == {"op": "copy", "section": "hero", "field": "title", "value": "Fresh bread daily"} and ops[1]["color"] == "#2A8C80" and ops[3]["theme"] == "studio"
        st, r = api(f"{P}/flint", "POST", {"ask": "make it feel more like a sunday morning"}, token=camp)
        assert st == 422 and "add a pricing section" in r["error"] and r.get("help"), (st, r)   # no AI: say what works
        st, r = api(f"{P}/flint", "POST", {"ask": "add my logo"}, token=camp); assert st == 200 and r["need"] == "logo", r
        bad = "data:image/svg+xml;base64," + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
        st, r = api(f"{P}/flint", "POST", {"ask": "add my logo", "logo": bad}, token=camp); assert st == 400, (st, r)
        logo = "data:image/png;base64," + base64.b64encode(png(8, 8, (42, 140, 128))).decode()
        st, r = api(f"{P}/flint", "POST", {"ask": "add my logo", "logo": logo}, token=camp); assert st == 200 and r["changed"] == ["Logo added"], r
        w = ok(api(P, token=camp))["website"]["gen"]
        assert w["draft"] and w["brand"]["logo"], "the first edit made the draft; the logo is in the brand kit"
        assert "<img class=\"logo\"" in api(w["draftUrl"])[1]
        st, r = api(f"{P}/undo", "POST", {}, token=camp); assert st == 200
        assert not ok(api(P, token=camp))["website"]["gen"]["brand"]["logo"], "undo takes the logo off again"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js(camp, pid))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)

            # ======== 1: the desktop toolbar ========
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            assert host.get_attribute('#pvw [data-src="app"]', "aria-selected") == "true", "the app shows first when it runs"
            bar = "#pvw .pvw-bar"
            for sel in ['[data-src="app"]', '[data-src="site"]', '[data-dev="desktop"]', '[data-dev="tablet"]', '[data-dev="phone"]', '[data-act="reload"]', '[data-act="tab"]',
                        '[data-act="share"]', '.pin-cbtn', '.pvw-edit', '[data-pvf-toggle]']:
                assert host.locator(f"{bar} {sel}").is_visible(), f"toolbar: {sel}"
            assert "Ask Flint to change" in host.get_attribute(f"{bar} [data-pvf-toggle]", "title")
            for dev, wpx in [("phone", 390), ("tablet", 768), ("desktop", 1280)]:
                host.click(f'{bar} [data-dev="{dev}"]'); host.wait_for_timeout(150)
                assert host.evaluate("document.querySelector('#pvw-iframe').style.width") == f"{wpx}px", dev
            assert not host.locator(f"{bar} .pvw-saved").is_visible(), "Saved belongs to the website"
            host.click(f'{bar} [data-src="site"]')
            host.wait_for_function("document.querySelector('#pvw').dataset.showing === 'site'", timeout=5000)
            wait_text(host, "Sourdough")
            assert host.locator(f"{bar} .pvw-saved").is_visible() and host.get_attribute(f"{bar} .pvw-edit", "aria-pressed") == "true", "the website starts in select mode"
            assert host.locator("#pvw-path").is_hidden()
            assert host.locator("#pvf.is-open").count() == 1 and "Website edits are free" in host.inner_text("#pvf-tier")
            chips = host.locator("#pvf-chips .chip").all_inner_texts()
            assert "Add a pricing section" in chips and "Swap to the Studio template" in chips, chips
            shot(host, "preview-desktop")

            # ======== 2: Flint's local edits ========
            line = flint(host, "make the headline say Fresh bread daily")
            assert "Basic · no AI" in line and "headline" in line, line
            t = wait_text(host, "Fresh bread daily")
            line = flint(host, "change the accent to teal"); assert "accent" in line.lower(), line
            assert ok(api(P, token=camp))["website"]["gen"]["brand"]["accent"] == "#2A8C80"
            line = flint(host, "add a pricing section"); assert "pricing" in line.lower(), line
            wait_text(host, "Set a price")
            line = flint(host, "add testimonials"); wait_text(host, "Paste a real quote")
            line = flint(host, "remove the testimonials"); wait_text(host, "Paste a real quote", gone=True)
            line = flint(host, "swap to the Studio template"); assert "Studio" in line, line
            d = ok(api(P, token=camp))["website"]["gen"]
            assert d["draft"]["layout"] == "editorial" and d["draft"]["theme"] == "studio" and d["brand"]["primary"] == "#7A5CC2", d["brand"]
            # click-to-select, then type new words
            f = host.frame_locator("#pvw-iframe")
            f.locator("h1").click()
            host.wait_for_function("document.querySelector('#pvf-pick') && !document.querySelector('#pvf-pick').classList.contains('hidden')", timeout=5000)
            assert "Fresh bread daily" in host.inner_text("#pvf-pick")
            assert "Type new words" in host.get_attribute("#pvf-in", "placeholder")
            flint(host, "Warm bread, every morning")
            wait_text(host, "Warm bread, every morning")
            shot(host, "preview-flint-edit")
            # undo, from the feed's button
            host.locator("#pvf-feed [data-pvf='siteundo']").last.click()
            wait_text(host, "Fresh bread daily")
            # the chips: a "…" chip fills the box instead of sending
            host.click("#pvf-chips [data-chip='Make the headline say …']")
            assert host.input_value("#pvf-in") == "Make the headline say "
            host.fill("#pvf-in", "")

            # ======== 4: the Saved shelf ========
            host.click(f"{bar} .pvw-saved")
            host.wait_for_selector("#ssh .ssh-save", timeout=5000)
            assert host.locator("#ssh .ssh-rec li").count() >= 6, "every Flint edit is kept as a recent version"
            host.fill("#ssh input[name=note]", "Before the launch"); host.click("#ssh .ssh-save button")
            host.wait_for_selector("#ssh .ssh-card", timeout=5000)
            assert "Before the launch" in host.inner_text("#ssh .ssh-card") and host.get_attribute("#ssh .ssh-card img", "src").startswith("data:image/svg+xml")
            flint(host, "make the headline say Closed on Mondays")
            wait_text(host, "Closed on Mondays")
            host.wait_for_timeout(400)
            host.click("#ssh .ssh-card [data-ssh='compare']")
            host.wait_for_selector("#ssh .ssh-cmp .ssh-chg li", timeout=5000)
            chg = host.inner_text("#ssh .ssh-cmp .ssh-chg")
            assert "Fresh bread daily" in chg and "Closed on Mondays" in chg, chg
            host.click("#ssh .ssh-cmp [data-ssh='restore']")
            wait_text(host, "Fresh bread daily")
            host.keyboard.press("Escape"); host.wait_for_timeout(200)
            assert host.locator("#ssh").count() == 0, "Esc closes the shelf first"
            vs = ok(api(f"{P}/versions", token=camp))
            assert [v["note"] for v in vs["saved"]] == ["Before the launch"] and vs["recent"][0]["note"].startswith("Restored"), vs["recent"][0]
            # Files › Website: "Website versions"
            host.click("#pvw .pvw-back"); host.wait_for_timeout(300)
            host.evaluate("location.hash = '#/docs/website'")
            host.wait_for_selector("#wb-versions .ssh-card", timeout=10000)
            assert "Website versions" in host.inner_text("#wb-versions-sec") and "Before the launch" in host.inner_text("#wb-versions")

            # the App side keeps working: back to the app, its own page
            host.evaluate("TribePreview.open()"); host.wait_for_selector("#pvw #pvw-iframe", timeout=8000)
            host.click(f'{bar} [data-src="app"]'); host.wait_for_function("document.querySelector('#pvw').dataset.showing === 'app'")
            wait_text(host, "Order online soon")
            host.click(f'{bar} [data-src="site"]'); wait_text(host, "Fresh bread daily")
            ctx.close()

            # ======== 5: phones ========
            pc = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            pc.add_init_script(settings_js(camp, pid))
            ph = pc.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            ph.evaluate("TribePreview.open()")
            ph.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            ph.locator('#pvw [data-src="site"]').tap()   # App | Website sits in the phone bar too
            ph.wait_for_function("document.querySelector('#pvw').dataset.showing === 'site'", timeout=5000)
            wait_text(ph, "Fresh bread daily")
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#pvw').scrollWidth, document.querySelector('#pvw-frame').getBoundingClientRect().right]")
            assert sw[0] <= 390 and sw[1] <= 390 and sw[2] <= 391, f"no sideways scroll: {sw}"
            assert ph.locator("#pvw-ph").is_visible() and ph.locator("#pvw-ph [data-ph='saved']").is_visible()
            assert ph.locator("#pvw .pvw-seg [data-dev='desktop']").is_visible() and ph.locator("#pvw .pin-cbtn").is_visible(), "device toggle + comments in the phone bar"
            shot(ph, "preview-phone")
            # swipe left on the tab bar: the edit sheet slides in
            bb = ph.locator("#pvw-ph").bounding_box()
            ph.evaluate("""([x, y]) => { const el = document.querySelector('#pvw-ph'); const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientY: y };
              el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x + 260 })); el.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x + 40 })); }""", [bb["x"], bb["y"] + 20])
            ph.wait_for_function("document.querySelector('#pvf').classList.contains('is-open')", timeout=3000)
            ph.wait_for_timeout(400)
            r = ph.evaluate("(() => { const b = document.querySelector('#pvf').getBoundingClientRect(); return [b.left, b.width]; })()")
            assert abs(r[0]) < 2 and r[1] >= 380, f"the edit sheet fills the screen: {r}"
            assert ph.get_attribute("#pvw-ph [data-ph='edit']", "aria-pressed") == "true"
            ph.locator("#pvf-chips [data-chip='Add a pricing section']").tap()
            ph.wait_for_function("[...document.querySelectorAll('#pvf-feed .pvf-it')].some(x => /pricing/i.test(x.textContent))", timeout=8000)
            ph.locator("#pvw-ph [data-ph='page']").tap(); ph.wait_for_timeout(300)
            assert not ph.evaluate("document.querySelector('#pvf').classList.contains('is-open')")
            wait_text(ph, "Set a price")
            # the Saved tab
            ph.locator("#pvw-ph [data-ph='saved']").tap()
            ph.wait_for_selector("#ssh .ssh-card", timeout=5000)
            assert ph.evaluate("document.querySelector('#ssh').getBoundingClientRect().width") >= 389
            ph.locator("#pvw-ph [data-ph='page']").tap(); ph.wait_for_timeout(200)
            assert ph.locator("#ssh").count() == 0
            # the desktop view on a phone: shrunk to fit, pinch to zoom, double-tap to fit again
            ph.locator("#pvw .pvw-seg [data-dev='desktop']").tap(); ph.wait_for_timeout(300)
            assert ph.evaluate("document.querySelector('#pvw-iframe').style.width") == "1280px"
            assert ph.locator("#pvw-zoom").is_visible()
            ph.evaluate("""() => { const z = document.querySelector('#pvw-zoom'), r = z.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + 200;
              const ev = (t, id, x) => z.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', bubbles: true, clientX: x, clientY: cy }));
              ev('pointerdown', 1, cx - 20); ev('pointerdown', 2, cx + 20); ev('pointermove', 1, cx - 60); ev('pointermove', 2, cx + 60); ev('pointerup', 1, cx - 60); ev('pointerup', 2, cx + 60); }""")
            tr = ph.evaluate("document.querySelector('#pvw-frame').style.transform")
            assert "scale(3)" in tr, tr
            assert ph.locator("#pvw-zl").is_visible()
            sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, sw
            ph.locator("#pvw .pvw-seg [data-dev='phone']").tap(); ph.wait_for_timeout(200)
            assert ph.evaluate("document.querySelector('#pvw-frame').style.transform") == ""
            pc.close()
            b.close()

        # ======== with an AI on: a free-form sentence becomes the same checked operations ========
        fake = ThreadingHTTPServer(("127.0.0.1", PORT + 700), FakeLLM); threading.Thread(target=fake.serve_forever, daemon=True).start()
        ok(api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{PORT + 700}/v1", "model": "tiny-model", "key": "sk-test-0123456789"}, token=camp), "llm")
        r = ok(api(f"{P}/flint", "POST", {"ask": "make it feel more like a sunday morning"}, token=camp), "ai edit")
        assert r["via"] != "rules" and r["changed"][0].startswith("Tagline"), r
        assert ok(api(P, token=camp))["website"]["gen"]["draft"]["copy"]["hero"]["dek"] == "Warm loaves from six on Sunday mornings"
        r = ok(api(f"{P}/flint", "POST", {"ask": "add a pricing section"}, token=camp)); assert r["via"] == "rules", "the rules still answer first"
        fake.shutdown()
        if errors: raise AssertionError("page errors:\n" + "\n".join(errors[:10]))
        print("e2e_preview_polish: OK (toolbar, Flint local website edits + undo, select + type, Saved shelf compare/restore, Files › Website versions, phone tabs/swipe/pinch)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
