"""The website designer, polished (p4-site: app/ui/sitedesigner.js/.css, sitedesigner-frame.js, sitecfg.js, changes.js).
Checks:
 1 one row: at 1440 and at 1100 the top bar is one row with nothing cut off; at 390 it is one row no taller than 56px
   and the page starts in the top fifth of the screen; what is used less is under More and still works;
 2 the strip: someone who can change the site sees no "You can change this directly" strip; someone whose changes need
   an OK sees theirs; when a change waits for the owner, the owner's strip comes back with the count;
 3 the panel: four tabs in one row at 320px; Suggestions and Comments are both under Ideas, Look and Site settings both
   under Style; nothing is lost;
 4 zoom: + and - and Ctrl + / Ctrl - / Ctrl 0, Fit and 100%; at 50% a click still lands on the words under it and
   typing edits them; Ctrl + wheel in the page zooms;
 5 code: More > Code shows the selected section's HTML and CSS and copies them; your own CSS is applied to the preview,
   cleaned (no @import, no url() to other hosts, no expression), is one Undo, and is in the download and the
   published site;
 6 spacing handles: dragging the top handle of the selected section changes the space above, snapped to the scale, with
   a live number; it is one Undo; a double-click gives the site's spacing back; arrow keys on the handle step it;
 7 shortcuts: ? opens the sheet (grouped); Ctrl C / Ctrl V copies a section to another page; arrows select the next
   section; Ctrl D, Delete, Alt arrows still work;
 8 a template over a site that is already there asks first; "Keep my site" keeps it;
 9 a change request for the website carries before and after pictures;
10 speed: time to open, to the first edit and for an edit to reach a second person (printed; limits are generous).
Usage: TRIBE_PORT_OFFSET=51 python3 app/test/e2e_site_polish.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6620 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] in (200, 202), f"{what}: {r}"
    return r[1]


def shot(pg, name):
    if SHOTS: pg.screenshot(path=str(Path(SHOTS) / name))


def cfg(pg): return pg.evaluate("TribeSiteDesigner.cfg()")
def state(pg): return pg.evaluate("TribeSiteDesigner.state()")
def frame(pg): return pg.frame_locator("#wdz-frame")


def one_row(pg, what):
    """Every visible child of the top bar sits on one line and inside the window."""
    r = pg.evaluate("""() => { const top = document.querySelector('#wdz .wdz-top'), tr = top.getBoundingClientRect();
      const kids = [...top.children].filter(e => e.offsetParent !== null && !e.matches('.wdz-menu') && e.getBoundingClientRect().width > 0).map(e => { const b = e.getBoundingClientRect(); return { k: e.className || e.tagName, t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; });
      return { h: Math.round(tr.height), w: innerWidth, kids }; }""")
    mids = [(k["t"] + k["b"]) / 2 for k in r["kids"]]
    assert max(mids) - min(mids) < 6, (what, "the top bar wraps", r)
    assert all(k["r"] <= r["w"] + 1 and k["l"] >= -1 for k in r["kids"]), (what, "something is cut off", r)
    return r


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sp-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya = j["token"]
        p = ok(api("/projects", "POST", {"name": "Maras Kitchen"}, token=host)); pid = (p.get("project") or p)["id"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(token, name, w=1440, h=900, phone=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, theme: 'dark', tour: {done: true}, checklist: {setup: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=1)
                c.grant_permissions(["clipboard-read", "clipboard-write"])
                c.add_init_script(init); pg = c.new_page()
                pg.on("pageerror", lambda e: errors.append(f"{name}: {e} {(e.stack or '')[:300]}"))
                pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{name} console: {m.text}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeSiteDesigner && window.TribeChanges && window.TribeUI", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(500)
                return pg

            def open_designer(pg, extra=""):
                pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}'{extra} }})")
                pg.wait_for_selector("#wdz:not([hidden])", timeout=15000)

            def ready(pg):
                frame(pg).locator("[data-block]").first.wait_for(timeout=20000)
                pg.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)

            # ---------- 10 (first, on a cold page): speed ----------
            cp = page(host, "Camp")
            t0 = time.time(); open_designer(cp, ", template: 'cafe'"); ready(cp)
            first_open = round((time.time() - t0) * 1000)
            cp.wait_for_function("TribeSiteDesigner.state().rev > 0", timeout=15000)
            cp.evaluate("TribeSiteDesigner.close()"); cp.wait_for_selector("#wdz", state="hidden")
            t0 = time.time(); open_designer(cp); ready(cp); open_ms = round((time.time() - t0) * 1000)
            perf = cp.evaluate("TribeSiteDesigner.perf()")
            assert perf["open"] < 2000 and 0 < perf["ready"] < 4000, perf
            t0 = time.time(); h1 = frame(cp).locator("h1[data-e], [data-e]").first; h1.click(); cp.keyboard.type("!")
            cp.wait_for_function("JSON.stringify(TribeSiteDesigner.cfg()).includes('!')", timeout=5000); edit_ms = round((time.time() - t0) * 1000)
            cp.keyboard.press("Escape"); cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)

            # ---------- 1: one row ----------
            r = one_row(cp, "1440"); assert r["h"] <= 56, r
            assert cp.locator("#wdz .wdz-top [data-wdz='undo']").is_visible() and cp.locator("#wdz .wdz-devs").is_visible() and cp.locator("#wdz-cmode").is_visible() and cp.locator("#wdz-dl").is_visible()
            assert not cp.locator("#wdz .cr-strip").is_visible(), "someone who can change the site sees no strip"
            body = cp.evaluate("(() => { const b = document.querySelector('#wdz .wdz-body').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), innerHeight]; })()")
            assert body[0] <= 56 and body[1] >= body[2] - 1, ("the body fills the window under one bar", body)
            shot(cp, "p4-site-1440.png")
            # under More: everything that left the bar is there and works
            assert not cp.locator("#wdz-more").is_visible()
            cp.click("#wdz [data-wdz='more']"); cp.wait_for_selector("#wdz-more:not([hidden])")
            for sel in ["#wdz-mode", "#wdz-theme", "#wdz-wide", "#wdz-more [data-wdz='templates']", "#wdz-more [data-wdz='save']", "#wdz-more [data-wdz='code']", "#wdz-freeai", "#wdz-agent", "#wdz-req"]:
                assert cp.locator(sel).is_visible(), sel
            shot(cp, "p4-site-more-1440.png")
            mode0 = cfg(cp)["theme"]["mode"]; cp.click("#wdz-mode"); cp.wait_for_function(f"TribeSiteDesigner.cfg().theme.mode !== '{mode0}'")
            assert cp.locator("#wdz-more").is_visible(), "the look can be tried without the menu closing"
            cp.click("#wdz-mode"); cp.wait_for_function(f"TribeSiteDesigner.cfg().theme.mode === '{mode0}'")
            cp.keyboard.press("Escape"); cp.wait_for_selector("#wdz-more", state="hidden")
            assert state(cp)["open"], "Esc closed the menu, not the designer"
            cp.set_viewport_size({"width": 1100, "height": 800}); cp.wait_for_timeout(200)
            r = one_row(cp, "1100"); assert r["h"] <= 56, r
            cut = cp.evaluate("(() => { const l = document.querySelector('#wdz .wdz-left').getBoundingClientRect().right; return [...document.querySelectorAll('#wdz .wdz-blk-acts button')].filter(b => b.getBoundingClientRect().right > l - 4).length; })()")
            assert cut == 0, "every button in the list of blocks is inside its column in a narrow window"
            shot(cp, "p4-site-1100.png")
            cp.set_viewport_size({"width": 1440, "height": 900}); cp.wait_for_timeout(200)
            # the device buttons show which is on (it never changed before)
            cp.click("#wdz .wdz-devs [data-dev='tablet']"); assert cp.get_attribute("#wdz .wdz-devs [data-dev='tablet']", "aria-pressed") == "true" and cp.get_attribute("#wdz .wdz-devs [data-dev='desktop']", "aria-pressed") == "false"
            cp.click("#wdz .wdz-devs [data-dev='desktop']")

            # ---------- 3: four tabs ----------
            tabs = cp.evaluate("[...document.querySelectorAll('#wdz .wdz-ptabs [data-panel]')].map(b => { const r = b.getBoundingClientRect(); return [b.dataset.panel, Math.round(r.top), Math.round(r.right), b.scrollWidth <= b.clientWidth + 1]; })")
            assert [t[0] for t in tabs] == ["edit", "ideas", "style", "check"], tabs
            assert len({t[1] for t in tabs}) == 1 and all(t[3] for t in tabs), ("one row, no label cut", tabs)
            pr = cp.evaluate("document.querySelector('#wdz .wdz-right').getBoundingClientRect().right"); assert all(t[2] <= pr + 1 for t in tabs), tabs
            cp.click("#wdz .wdz-ptabs [data-panel='ideas']"); assert state(cp)["panel"] == "ideas" and cp.locator("#wdz-sub-ideas").is_visible()
            cp.click("#wdz-sub-ideas [data-panel='comments']"); assert state(cp)["panel"] == "comments"
            assert cp.get_attribute("#wdz .wdz-ptabs [data-panel='ideas']", "aria-selected") == "true"
            cp.click("#wdz .wdz-ptabs [data-panel='style']"); assert state(cp)["panel"] == "style" and cp.locator("#wdz-sub-style").is_visible() and not cp.locator("#wdz-sub-ideas").is_visible()
            cp.click("#wdz-sub-style [data-panel='site']"); assert state(cp)["panel"] == "site"; cp.wait_for_selector("#wdz-insp [data-site]", timeout=5000)
            shot(cp, "p4-site-tabs-1440.png")
            cp.click("#wdz .wdz-ptabs [data-panel='ideas']"); assert state(cp)["panel"] == "comments", "the tab remembers which of its two was open"
            cp.click("#wdz .wdz-ptabs [data-panel='check']"); assert state(cp)["panel"] == "check"
            cp.click("#wdz .wdz-ptabs [data-panel='edit']")

            # ---------- 4: zoom ----------
            assert cp.inner_text("#wdz-zoomv") == "100%"
            w100 = cp.evaluate("document.querySelector('#wdz-framewrap').getBoundingClientRect().width")
            cp.click("#wdz [data-wdz='zoomout']"); cp.click("#wdz [data-wdz='zoomout']"); cp.click("#wdz [data-wdz='zoomout']")
            assert cp.inner_text("#wdz-zoomv") == "67%", cp.inner_text("#wdz-zoomv")
            cp.click("#wdz [data-wdz='zoomout']"); assert cp.inner_text("#wdz-zoomv") == "50%"
            z = cp.evaluate("(() => { const w = document.querySelector('#wdz-framewrap').getBoundingClientRect(), f = document.querySelector('#wdz-frame').getBoundingClientRect(); return { w: w.width, fw: f.width, fh: f.height, wh: w.height, lw: document.querySelector('#wdz-frame').offsetWidth }; })()")
            assert abs(z["w"] - w100 * 0.5) < 3 and abs(z["fw"] - z["w"]) < 3 and abs(z["fh"] - z["wh"]) < 3, ("the page is drawn at half size and fills its box", z, w100)
            assert abs(z["lw"] - w100) < 3, ("the layout keeps its real width", z, w100)
            shot(cp, "p4-site-zoom50-1440.png")
            # a click at 50% lands on the words under it, and typing edits them
            words = frame(cp).locator("[data-block] h1[data-e], [data-block] h2[data-e]").first
            key = words.get_attribute("data-e"); fb = cp.locator("#wdz-frame").bounding_box()
            ir = words.evaluate("e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
            cp.mouse.click(fb["x"] + ir[0] * 0.5, fb["y"] + ir[1] * 0.5)   # where it is drawn: the frame's corner plus half its own coordinates
            cp.wait_for_function(f"(() => {{ const s = TribeSiteDesigner.state().sel; return s && (s.block + '|' + s.path) === {json.dumps(key)}; }})()", timeout=5000)
            cp.keyboard.press("Control+a"); cp.keyboard.type("Half size works"); cp.keyboard.press("Escape")
            cp.wait_for_function("JSON.stringify(TribeSiteDesigner.cfg()).includes('Half size works')", timeout=5000)
            # the keyboard, from the app and from inside the page
            cp.locator("#wdz .wdz-left").click(position={"x": 5, "y": 5})
            cp.keyboard.press("Control+0"); assert cp.inner_text("#wdz-zoomv") == "100%"
            cp.keyboard.press("Control+="); assert cp.inner_text("#wdz-zoomv") == "110%"
            cp.keyboard.press("Control+-"); cp.keyboard.press("Control+-"); assert cp.inner_text("#wdz-zoomv") == "90%"
            frame(cp).locator("[data-block]").nth(1).click(position={"x": 6, "y": 6}); cp.keyboard.press("Control+0")
            cp.wait_for_function("document.querySelector('#wdz-zoomv').textContent === '100%'", timeout=3000)
            fb = cp.locator("#wdz-frame").bounding_box(); cp.mouse.move(fb["x"] + 200, fb["y"] + 200)
            cp.keyboard.down("Control"); cp.mouse.wheel(0, -120); cp.keyboard.up("Control")
            cp.wait_for_function("document.querySelector('#wdz-zoomv').textContent === '110%'", timeout=3000)
            # Fit: the full computer width, whole, in the window
            cp.click("#wdz [data-wdz='zoom100']"); cp.click("#wdz [data-wdz='more']"); cp.click("#wdz-wide"); assert state(cp)["wide"]
            cp.click("#wdz [data-wdz='zoomfit']")
            f = cp.evaluate("(() => { const w = document.querySelector('#wdz-framewrap').getBoundingClientRect(), s = document.querySelector('#wdz .wdz-stage').getBoundingClientRect(); return { w: w.width, sw: s.width, l: w.left, sl: s.left, lw: document.querySelector('#wdz-frame').offsetWidth, z: TribeSiteDesigner.state().zoom }; })()")
            assert f["lw"] == 1280 and f["z"] < 1 and f["w"] <= f["sw"] and f["l"] >= f["sl"], ("1280 wide, all of it showing", f)
            shot(cp, "p4-site-fit-1440.png")
            assert cp.get_attribute("#wdz [data-wdz='zoomfit']", "aria-pressed") == "true"
            cp.click("#wdz .wdz-devs [data-dev='tablet']"); cp.wait_for_function("TribeSiteDesigner.state().zoom === 1", timeout=3000)   # Fit follows the device: a tablet fits whole
            cp.click("#wdz .wdz-devs [data-dev='desktop']"); cp.wait_for_function("TribeSiteDesigner.state().zoom < 1", timeout=3000)
            cp.click("#wdz [data-wdz='zoom100']"); cp.click("#wdz [data-wdz='more']"); cp.click("#wdz-wide"); assert not state(cp)["wide"]

            # ---------- 6: spacing handles ----------
            blk = frame(cp).locator("[data-block]").nth(1); bid = blk.get_attribute("data-block")
            blk.click(position={"x": 6, "y": 60}); cp.wait_for_function(f"(() => {{ const s = TribeSiteDesigner.state().sel; return s && s.block === '{bid}' && s.kind === 'block'; }})()", timeout=5000)
            top = frame(cp).locator(f"[data-block='{bid}'] > .wdz-sp-pt"); top.wait_for(timeout=5000)
            assert frame(cp).locator(f"[data-block='{bid}'] > .wdz-sp-pb").is_visible()
            start = int(top.locator("b").inner_text()); hist = state(cp)["hist"]
            hb = top.bounding_box(); cp.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2); cp.mouse.down()
            cp.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2 + 30, steps=6)
            live = int(top.locator("b").inner_text()); assert live in [0, 8, 16, 24, 32, 48, 64, 80, 96, 128, 160] and live != start, ("a live number, on the scale", start, live)
            shot(cp, "p4-site-spacing-1440.png")
            cp.mouse.up()
            cp.wait_for_function(f"(() => {{ const b = TribeSiteDesigner.cfg().pages[0].blocks.find(x => x.id === '{bid}'); return b && b.style && b.style.pt === {live}; }})()", timeout=5000)
            assert state(cp)["hist"] == hist + 1, "one drag is one Undo"
            assert frame(cp).locator(f"[data-block='{bid}']").evaluate("e => getComputedStyle(e).paddingTop") == f"{live}px"
            cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)
            assert f"--pt:{live}px" in cp.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']"), "the spacing is in the downloaded page"
            # arrow keys on the handle step along the scale; a double-click gives the site's own spacing back
            frame(cp).locator(f"[data-block='{bid}'] > .wdz-sp-pb").focus(); cp.keyboard.press("ArrowDown")
            cp.wait_for_function(f"(() => {{ const b = TribeSiteDesigner.cfg().pages[0].blocks.find(x => x.id === '{bid}'); return b && b.style && typeof b.style.pb === 'number'; }})()", timeout=5000)
            frame(cp).locator(f"[data-block='{bid}'] > .wdz-sp-pt").dblclick()
            cp.wait_for_function(f"(() => {{ const b = TribeSiteDesigner.cfg().pages[0].blocks.find(x => x.id === '{bid}'); return b && (!b.style || b.style.pt == null); }})()", timeout=5000)
            cp.evaluate("TribeSiteDesigner.undo()"); cp.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks.find(x => x.id === '{bid}').style.pt === {live}", timeout=5000)

            # ---------- 5: code ----------
            cp.click("#wdz [data-wdz='more']"); cp.click("#wdz-more [data-wdz='code']"); cp.wait_for_selector("#wdz-code", timeout=5000)
            html = cp.inner_text("#wdz-code-html"); assert html.startswith("<") and f'id="b-{bid}"' in html and "data-e" not in html and "\n  <" in html, html[:300]
            cp.click("#wdz-code [data-copy='html']"); assert f'id="b-{bid}"' in cp.evaluate("navigator.clipboard.readText()")
            cp.click("#wdz-code [data-ct='css']"); css = cp.inner_text("#wdz-code-css"); assert ":root {" in css and "{\n  " in css, css[:200]
            shot(cp, "p4-site-code-1440.png")
            cp.click("#wdz-code [data-ct='own']"); hist = state(cp)["hist"]
            cp.fill("#wdz-code-own", "@import url(https://evil.example/x.css);\nh1 { letter-spacing: 3px; background: url(https://evil.example/t.gif); width: expression(alert(1)) }\n</style><script>window.__pwn = 1</script>\n.btn { text-transform: uppercase }")
            cp.click("#wdz-code [data-own='apply']")
            cp.wait_for_function("(TribeSiteDesigner.cfg().css || '').includes('letter-spacing')", timeout=5000)
            own = cfg(cp)["css"]
            assert "evil.example" not in own and "@import" not in own and "expression(" not in own and "<" not in own and "uppercase" in own, own
            assert "removed" in cp.inner_text("#wdz-own-note").lower() or "safe" in cp.inner_text("#wdz-own-note").lower()
            assert state(cp)["hist"] == hist + 1
            shot(cp, "p4-site-owncss-1440.png")
            cp.keyboard.press("Escape"); cp.wait_for_selector("#wdz-code", state="detached", timeout=5000)
            assert frame(cp).locator("[data-block] h1").first.evaluate("e => getComputedStyle(e).letterSpacing") == "3px", "my CSS shows in the preview"
            assert not cp.evaluate("window.__pwn") and not frame(cp).locator("body").evaluate("() => window.__pwn || 0")
            out = cp.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']"); assert "letter-spacing: 3px" in out and "evil.example" not in out
            cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)
            pub = ok(api(f"/projects/{pid}/site-config/publish", "POST", {}, token=host), "publish")
            idx = next((tmp / "tribe").rglob("site/index.html")); assert "letter-spacing: 3px" in idx.read_text() and "evil.example" not in idx.read_text(), pub
            # the server cleans it too (a client that skips the check)
            c2 = cfg(cp); c2["css"] = "@import 'https://evil.example/a.css'; p{background:url(//evil.example/b.png)}"
            rev = state(cp)["rev"]; sv = api(f"/projects/{pid}/site-config", "PUT", {"config": c2, "rev": rev}, token=maya)
            got = ok(api(f"/projects/{pid}/site-config", token=host))["config"]; assert "evil.example" not in json.dumps(got), (sv, got.get("css"))
            cp.wait_for_function(f"TribeSiteDesigner.state().rev > {rev}", timeout=10000)

            # ---------- 7: shortcuts ----------
            cp.locator("#wdz .wdz-left").click(position={"x": 5, "y": 5}); cp.keyboard.press("?"); cp.wait_for_selector("#wdz-keys:not([hidden])")
            kt = cp.inner_text("#wdz-keys"); assert all(x in kt for x in ["Ctrl C", "Ctrl V", "Zoom in", "Select the section above or below", "Ctrl D", "Esc"]), kt
            shot(cp, "p4-site-keys-1440.png")
            cp.keyboard.press("Escape"); cp.wait_for_selector("#wdz-keys", state="hidden"); assert state(cp)["open"]
            cp.click("#wdz [data-wdz='keys']"); cp.wait_for_selector("#wdz-keys:not([hidden])"); cp.click("#wdz-keys [data-wdz='keys']")
            # with nothing selected the arrows are the page's own (they scroll); they do not grab a section
            if state(cp)["sel"]:
                cp.keyboard.press("Escape"); cp.wait_for_function("!TribeSiteDesigner.state().sel", timeout=3000)
            cp.keyboard.press("ArrowDown"); cp.wait_for_timeout(250); assert not state(cp)["sel"] and state(cp)["open"]
            # More from the keyboard: the focus lands on its first control
            cp.focus("#wdz [data-wdz='more']"); cp.keyboard.press("Enter"); cp.wait_for_selector("#wdz-more:not([hidden])")
            assert cp.evaluate("document.activeElement && document.activeElement.id") == "wdz-mode"; cp.keyboard.press("Escape"); cp.wait_for_selector("#wdz-more", state="hidden")
            first = frame(cp).locator("[data-block]").first; fid = first.get_attribute("data-block")
            first.click(position={"x": 6, "y": 6}); cp.wait_for_function(f"(TribeSiteDesigner.state().sel || {{}}).block === '{fid}'")
            cp.keyboard.press("ArrowDown"); cp.wait_for_function(f"(TribeSiteDesigner.state().sel || {{}}).block === '{bid}'", timeout=4000)
            cp.keyboard.press("ArrowUp"); cp.wait_for_function(f"(TribeSiteDesigner.state().sel || {{}}).block === '{fid}'", timeout=4000)
            cp.keyboard.press("ArrowDown"); cp.wait_for_function(f"(TribeSiteDesigner.state().sel || {{}}).block === '{bid}'", timeout=4000)
            typ = next(x for x in cfg(cp)["pages"][0]["blocks"] if x["id"] == bid)["type"]
            cp.keyboard.press("Control+c")
            pages = cfg(cp)["pages"]; other = pages[1]["id"] if len(pages) > 1 else None
            if not other:
                cp.click("#wdz [data-wdz='addpage']"); cp.wait_for_function("TribeSiteDesigner.cfg().pages.length > 1"); other = cfg(cp)["pages"][-1]["id"]
            else:
                cp.click(f"#wdz-pages [data-page='{other}']")
            cp.wait_for_function(f"TribeSiteDesigner.state().page === '{other}'"); n0 = len(next(x for x in cfg(cp)["pages"] if x["id"] == other)["blocks"])
            frame(cp).locator("[data-block]").first.wait_for(timeout=10000); cp.locator("#wdz .wdz-left").click(position={"x": 5, "y": 5})
            cp.keyboard.press("Control+v")
            cp.wait_for_function(f"TribeSiteDesigner.cfg().pages.find(p => p.id === '{other}').blocks.length === {n0 + 1}", timeout=5000)
            pasted = state(cp)["sel"]["block"]; pb = next(x for x in next(x for x in cfg(cp)["pages"] if x["id"] == other)["blocks"] if x["id"] == pasted)
            assert pb["type"] == typ and pasted != bid and pb.get("style", {}).get("pt") == live, ("the pasted section keeps its look and gets its own id", pb.get("style"))
            cp.keyboard.press("Control+d"); cp.wait_for_function(f"TribeSiteDesigner.cfg().pages.find(p => p.id === '{other}').blocks.length === {n0 + 2}", timeout=5000)
            cp.keyboard.press("Delete"); cp.wait_for_function(f"TribeSiteDesigner.cfg().pages.find(p => p.id === '{other}').blocks.length === {n0 + 1}", timeout=5000)
            cp.click(f"#wdz-pages [data-page='{pages[0]['id']}']"); cp.wait_for_function(f"TribeSiteDesigner.state().page === '{pages[0]['id']}'")
            cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)

            # ---------- 8: a template over a site that is already there asks first ----------
            name0 = cfg(cp)["name"]; blocks0 = json.dumps(cfg(cp)["pages"]); cp.evaluate("window.__b0 = JSON.stringify(TribeSiteDesigner.cfg().pages)")
            cp.click("#wdz [data-wdz='more']"); cp.click("#wdz-more [data-wdz='templates']"); cp.wait_for_selector("#wdz-gal [data-tpl]", timeout=15000)
            cp.locator("#wdz-gal [data-tpl]").nth(2).click(); cp.wait_for_selector("#wdz-replace", timeout=5000)
            assert "already has a design" in cp.inner_text("#wdz-replace") and name0 in cp.inner_text("#wdz-replace")
            shot(cp, "p4-site-replace-1440.png")
            cp.click("#wdz-keep"); cp.wait_for_selector("#wdz-replace", state="detached"); assert json.dumps(cfg(cp)["pages"]) == blocks0, "Keep my site keeps it"
            cp.locator("#wdz-gal [data-tpl]").nth(2).click(); cp.wait_for_selector("#wdz-replace"); cp.click("#wdz-over")
            cp.wait_for_function("JSON.stringify(TribeSiteDesigner.cfg().pages) !== window.__b0", timeout=10000)
            cp.evaluate("TribeSiteDesigner.undo()"); cp.wait_for_function("JSON.stringify(TribeSiteDesigner.cfg().pages) === window.__b0", timeout=5000)
            cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && !s.dirty; })()", timeout=15000)
            # the design flow's gallery asks too (open with a template over an existing site)
            cp.evaluate("TribeSiteDesigner.close()"); cp.wait_for_selector("#wdz", state="hidden")
            cp.evaluate(f"void (window.__o = TribeSiteDesigner.open({{ pid: '{pid}', template: 'portfolio', askReplace: true }}))"); cp.wait_for_selector("#wdz-replace", timeout=10000)
            cp.click("#wdz-keep"); cp.evaluate("window.__o"); ready(cp); assert json.dumps(cfg(cp)["pages"]) == blocks0

            # ---------- 2 + 9: the strip, and a change request with pictures ----------
            ok(api("/perms/overrides", "PUT", {"cap": "site.edit", "role": "builder", "on": False}, token=host), "take site.edit from builders")
            mp = page(maya, "Maya", 1366, 860); open_designer(mp); ready(mp)
            mp.wait_for_selector("#wdz .cr-strip:not([hidden])", timeout=10000); assert "Camp" in mp.inner_text("#wdz .cr-strip")
            one_row(mp, "Maya 1366")
            hw = frame(mp).locator("[data-block] h1[data-e], [data-block] h2[data-e]").first; hw.click(); mp.keyboard.press("Control+a"); mp.keyboard.type("Maya was here"); mp.keyboard.press("Escape")
            mp.wait_for_selector("#wdz .cr-strip [data-cr-suggest]:not([disabled])", timeout=10000); mp.click("#wdz .cr-strip [data-cr-suggest]")
            mp.wait_for_selector("#cr-sheet #cr-pics img", timeout=15000)
            pics = mp.evaluate("[...document.querySelectorAll('#cr-sheet #cr-pics img')].map(i => [i.naturalWidth, i.naturalHeight, i.src.slice(0, 22), i.src.length])")
            assert len(pics) == 2 and all(p[0] >= 300 and p[2].startswith("data:image/jpeg") and p[3] > 3000 for p in pics), ("before and after pictures", pics)
            assert pics[0][3] != pics[1][3] or mp.evaluate("(() => { const i = document.querySelectorAll('#cr-sheet #cr-pics img'); return i[0].src !== i[1].src; })()"), "the two pictures differ"
            mp.wait_for_timeout(300); shot(mp, "p4-site-request-1366.png")
            mp.fill("#cr-why", "A warmer headline"); mp.click("#cr-send"); mp.wait_for_selector("#cr-sheet", state="detached", timeout=10000)
            # the owner: the strip comes back because something waits; More carries the count
            cp.wait_for_selector("#wdz .cr-strip:not([hidden])", timeout=15000); assert "1 change is waiting" in cp.inner_text("#wdz .cr-strip"), cp.inner_text("#wdz .cr-strip")
            one_row(cp, "Camp with a request")
            shot(cp, "p4-site-waiting-1440.png")
            cp.click("#wdz [data-wdz='more']"); cp.wait_for_function("!document.querySelector('#wdz-reqn').hidden && document.querySelector('#wdz-reqn').textContent === '1'", timeout=8000)
            cp.click("#wdz-req"); cp.wait_for_selector("#cr-list-body .cr-row", timeout=10000)
            cp.wait_for_selector("#cr-list-body .cr-pics img", timeout=10000); assert cp.locator("#cr-list-body .cr-pics img").count() == 2
            shot(cp, "p4-site-approve-1440.png")
            cp.click("#cr-list-body [data-cr-act='approve']"); cp.wait_for_function("JSON.stringify(TribeSiteDesigner.cfg()).includes('Maya was here')", timeout=15000)
            cp.keyboard.press("Escape"); cp.wait_for_selector("#wdz .cr-strip", state="hidden", timeout=15000)
            ok(api("/perms/reset", "POST", {}, token=host))

            # ---------- 10: an edit reaches a second person ----------
            mp.evaluate("TribeSiteDesigner.close()"); mp.wait_for_selector("#wdz", state="hidden"); mp.wait_for_timeout(400)
            mp.evaluate("TribeChanges.how(null, true)"); open_designer(mp); ready(mp)
            hw = frame(cp).locator("[data-block] h1[data-e], [data-block] h2[data-e]").first; hw.click(); cp.keyboard.press("Control+a")
            t0 = time.time(); cp.keyboard.type("Live to Maya"); cp.keyboard.press("Escape")
            frame(mp).locator("text=Live to Maya").first.wait_for(timeout=15000); live_ms = round((time.time() - t0) * 1000)

            # ---------- 1 again: a phone ----------
            ph = page(host, "Camp", 390, 844, phone=True); open_designer(ph); ready(ph)
            r = one_row(ph, "390"); assert r["h"] <= 56, ("one row on a phone", r)
            ftop = ph.evaluate("document.querySelector('#wdz-framewrap').getBoundingClientRect().top"); assert ftop < 844 * 0.2, ("the page starts in the top fifth", ftop)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            tabs = ph.evaluate("[...document.querySelectorAll('#wdz .wdz-ptabs [data-panel]')].map(b => [Math.round(b.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().height)])")
            assert len({t[0] for t in tabs}) == 1 and all(t[1] >= 36 for t in tabs), tabs
            shot(ph, "p4-site-390.png")
            ph.click("#wdz [data-wdz='more']"); ph.wait_for_selector("#wdz-more:not([hidden])")
            mb = ph.evaluate("(() => { const m = document.querySelector('#wdz-more').getBoundingClientRect(); return [m.left, m.right, m.bottom, innerWidth, innerHeight]; })()")
            assert mb[0] >= 0 and mb[1] <= mb[3] and mb[2] <= mb[4], ("the menu fits the phone", mb)
            small = ph.evaluate("[...document.querySelectorAll('#wdz-more > button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 40).map(b => b.textContent.slice(0, 20))"); assert not small, small
            assert ph.locator("#wdz-more [data-wdz='comment']").is_visible() and ph.locator("#wdz-more [data-wdz='code']").is_visible()
            shot(ph, "p4-site-more-390.png")
            ph.click("#wdz-more [data-wdz='code']"); ph.wait_for_selector("#wdz-code"); assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"); shot(ph, "p4-site-code-390.png")
            ph.keyboard.press("Escape"); ph.wait_for_selector("#wdz-code", state="detached")
            ph.click("#wdz .wdz-dl-more"); ph.wait_for_selector("#wdz-dlmenu:not([hidden])"); assert ph.locator("#wdz-dlmenu [data-wdz='dl-html']").is_visible(); ph.keyboard.press("Escape")
            # a section's spacing handle works with a finger-sized target
            fb = frame(ph).locator("[data-block]").nth(1); fb.scroll_into_view_if_needed(); fb.click(position={"x": 4, "y": 4})
            hh = frame(ph).locator("[data-block].wdz-sel > .wdz-sp-pt"); hh.wait_for(timeout=5000); assert hh.bounding_box()["height"] >= 28
            shot(ph, "p4-site-spacing-390.png")

            print(f"speed: first open (template, cold) {first_open} ms; open {open_ms} ms (shown {perf['open']} ms, page ready {perf['ready']} ms); first edit {edit_ms} ms; an edit reaches a friend in {live_ms} ms")
            assert open_ms < 6000 and edit_ms < 3000 and live_ms < 8000, (open_ms, edit_ms, live_ms)
            b.close()
        assert not errors, errors
        print("e2e_site_polish: OK (one row at 1440/1100/390, no strip for editors, four tabs, zoom, code and own CSS, spacing handles, shortcuts, ask before replace, pictures on a change request)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=10)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
