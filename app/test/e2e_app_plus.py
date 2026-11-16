"""App Creator's deeper tools (app/ui/appcreator-plus.js, server/appcreator.js; pass 4).

  The model (node): your own picture in a slot survives normalize and the export, unused pictures are dropped; paste
  makes fresh ids; a screen copy; map positions; tablet.
  History: every save is kept on the host, saves close together share one entry; a named version stays; restoring is one
  Undo. With no tribe the same list is kept on the device.
  Comments: C then a click drops a numbered pin on a part; reply, resolve, reopen; the count shows in the top bar.
  Several parts: Shift click, then duplicate / remove together (one Undo); Ctrl A; arrows move.
  Clipboard: Ctrl C / V between screens, Ctrl X, Ctrl D; a whole screen copies when nothing is selected.
  Pictures: your own picture goes into a picture slot and into the exported phone web app.
  Map: every screen with arrows for the links, an unreachable screen is flagged, drag arranges (one Undo), zoom and fit,
  a click opens the screen, Shift click selects and Duplicate copies.
  Sizes: Tablet beside iPhone and Android; the light/dark peek changes nothing.
  Play: an app with a working feature plays as the real app in a frame, and the feature runs.
  "?" lists the shortcuts. Phone 390px: everything is under More, the map works, no sideways scroll. No console errors.
Usage: python app/test/e2e_app_plus.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6475 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(pg, name):
    if SHOTS: pg.wait_for_timeout(250); pg.screenshot(path=os.path.join(SHOTS, name))


def doc(pg): return pg.evaluate("TribeAppCreator.doc()")
def state(pg, expr): return pg.evaluate(f"(() => {{ const s = TribeAppCreator.state(); return {expr}; }})()")


def model_checks():
    out = subprocess.run(["node", "-e", r"""
const C = require(process.argv[1]), PNG = process.argv[2];
let d = C.template('habits'); const bad = [];
const pic = d.screens.flatMap(s => s.blocks.map(b => [s, b])).find(([s, b]) => ['image', 'card', 'player'].includes(b.type));
let r = C.apply(d, { op: 'block.add', screen: d.start, type: 'image' }); d = r.doc; const img = r.block;
r = C.apply(d, { op: 'pic', block: img, path: 'illus', data: PNG }); d = r.doc;
const id = Object.keys(d.pics || {})[0]; if (!id) bad.push('pic not kept');
if (!C.screenHTML(d, C.findScreen(d, d.start), { edit: false }).includes('<img class="ax-pic" src="data:image/png')) bad.push('pic not drawn');
if (!C.pwa(d).find(f => f[0] === 'index.html')[1].includes('data:image/png')) bad.push('pic not in the export');
{ const X = Object.fromEntries(C.expo(d)); if (!Object.keys(JSON.parse(X['design.json']).pics || {}).length || !/<Pic name=\{p\.illus\}/.test(X['App.js'])) bad.push('pic not in the Expo export'); }
if (C.apply(d, { op: 'pic', block: img, path: 'illus', data: 'data:text/html;base64,AAAA' }).doc.pics[id] == null) bad.push('a bad picture replaced the good one');
if (Object.keys(C.apply(d, { op: 'pic', block: img, path: 'illus', data: 'javascript:alert(1)' }).doc.pics).length !== 1) bad.push('a non-picture was stored');
const gone = C.apply(d, { op: 'block.remove', block: img }).doc; if (gone.pics) bad.push('an unused picture stayed');
const blk = C.findBlock(d, img).block; r = C.apply(d, { op: 'paste', blocks: [blk, blk], screen: d.screens[1].id, pics: d.pics });
const pasted = C.findScreen(r.doc, d.screens[1].id).blocks.filter(b => b.type === 'image'); if (pasted.length !== 2 || pasted[0].id === img || pasted[0].id === pasted[1].id) bad.push('paste ids');
r = C.apply(d, { op: 'screen.dup', screen: d.start }); if (r.doc.screens.length !== d.screens.length + 1 || !r.added) bad.push('screen.dup');
r = C.apply(d, { op: 'paste', screens: [d.screens[0]] }); if (r.doc.screens.length !== d.screens.length + 1) bad.push('paste screen');
r = C.apply(d, { op: 'map', at: { [d.start]: { x: 12.4, y: -30 }, nope: { x: 1, y: 1 } } }); if (!r.doc.map || r.doc.map[d.start].x !== 12 || r.doc.map.nope) bad.push('map');
r = C.apply(d, { op: 'device', device: 'tablet' }); if (r.doc.device !== 'tablet' || !C.pwa(r.doc).find(f => f[0] === 'index.html')[1].includes('min-width:1100px')) bad.push('tablet');
console.log(JSON.stringify({ bad }));
""", str(ROOT / "app" / "ui" / "appcreator-core.js"), PNG], capture_output=True, text=True, check=True)
    r = json.loads(out.stdout); assert not r["bad"], r["bad"]


def main():
    model_checks()
    tmp = tempfile.mkdtemp(prefix="tribe-apcp-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "App Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]
        pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        cfg = f"/projects/{pid}/app-config"
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeAppCreator && window.TribeAppPlus && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.evaluate(f"TribeAppCreator.open({{ pid: '{pid}', template: 'habits' }})")
            pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            pg.wait_for_function(f"fetch('/api{cfg}', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => !!j.config)", timeout=6000)
            start = doc(pg)["start"]

            # ---- the top bar is one row with Map, Comment and More; the right panel is useful with nothing selected
            assert pg.locator("#apc-mapb").is_visible() and pg.locator("#apc-cmb").is_visible() and pg.locator("#apc-more").is_visible()
            assert pg.evaluate("document.querySelector('.apc-top').getBoundingClientRect().height") <= 64
            assert pg.locator("#apc-insp .apc-quick [data-q]").count() == 6 and pg.locator("#apc-insp #apc-scname").is_visible()
            shot(pg, "p4-app-empty-1440.png")

            # ---- several parts: Shift click, duplicate and remove together, one Undo each
            ids = state(pg, "s.doc.screens.find(x => x.id === s.screen).blocks.filter(b => b.type !== 'tabs' && b.type !== 'nav').map(b => b.id)")
            n0 = len(state(pg, "s.doc.screens.find(x => x.id === s.screen).blocks"))
            pg.click(f"#apc .apc-edit [data-b='{ids[1]}']", position={"x": 4, "y": 4})
            pg.click(f"#apc .apc-edit [data-b='{ids[2]}']", position={"x": 4, "y": 4}, modifiers=["Shift"])
            assert state(pg, "[s.sel.block].concat(s.sels)") == [ids[1], ids[2]]
            assert pg.locator("#apc .apc-edit .apc-sel2").count() == 1 and pg.locator("#apc-bar .apc-bn").inner_text() == "2"
            assert "2" in pg.locator("#apc-insp .apc-eyebrow").first.inner_text()
            shot(pg, "p4-app-multi-1440.png")
            pg.click("#apc-insp [data-ma='dup']")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{start}').blocks.length === {n0 + 2}")
            pg.keyboard.press("Control+z")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{start}').blocks.length === {n0}")
            pg.click(f"#apc .apc-edit [data-b='{ids[1]}']", position={"x": 4, "y": 4})
            pg.click(f"#apc .apc-edit [data-b='{ids[2]}']", position={"x": 4, "y": 4}, modifiers=["Shift"])
            pg.keyboard.press("Delete")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{start}').blocks.length === {n0 - 2}")
            pg.keyboard.press("Control+z")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{start}').blocks.length === {n0}")
            # arrows move the selected part; Ctrl A takes every part
            pg.click(f"#apc .apc-edit [data-b='{ids[0]}']", position={"x": 4, "y": 4})
            pg.keyboard.press("ArrowDown")
            pg.wait_for_function(f"(() => {{ const b = TribeAppCreator.doc().screens.find(x => x.id === '{start}').blocks.filter(b => b.type !== 'tabs' && b.type !== 'nav').map(b => b.id); return b[1] === '{ids[0]}'; }})()")
            pg.keyboard.press("ArrowUp")
            pg.keyboard.press("Control+a")
            assert state(pg, "s.sels.length + 1") == n0
            pg.keyboard.press("Escape")

            # ---- clipboard: copy a part, paste it on another screen; cut; Ctrl D; a whole screen with nothing selected
            other = state(pg, "s.doc.screens.find(x => x.id !== s.screen).id")
            t0 = state(pg, f"s.doc.screens.find(x => x.id === '{start}').blocks.find(b => b.id === '{ids[0]}').type")
            pg.click(f"#apc .apc-edit [data-b='{ids[0]}']", position={"x": 4, "y": 4})
            pg.keyboard.press("Control+c")
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.appcreator.clip')).kind") == "blocks"
            pg.keyboard.press("Escape")
            pg.click(f"#apc-strip [data-go='{other}']")
            m0 = state(pg, f"s.doc.screens.find(x => x.id === '{other}').blocks.length")
            pg.keyboard.press("Control+v")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{other}').blocks.length === {m0 + 1}", timeout=4000)
            assert state(pg, f"s.doc.screens.find(x => x.id === '{other}').blocks.some(b => b.type === '{t0}' && b.id !== '{ids[0]}')")
            pg.keyboard.press("Control+x")   # the pasted part is selected: cut removes it again
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{other}').blocks.length === {m0}")
            pg.keyboard.press("Control+v")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{other}').blocks.length === {m0 + 1}", timeout=4000)
            pg.keyboard.press("Control+d")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{other}').blocks.length === {m0 + 2}")
            pg.keyboard.press("Control+z"); pg.keyboard.press("Control+z")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.find(x => x.id === '{other}').blocks.length === {m0}")
            ns = len(doc(pg)["screens"])
            assert state(pg, "s.sel") is None; pg.evaluate("document.activeElement && document.activeElement.blur()")
            pg.keyboard.press("Control+c")
            assert pg.evaluate("JSON.parse(localStorage.getItem('tribecode.appcreator.clip')).kind") == "screens"
            pg.keyboard.press("Control+v")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {ns + 1}", timeout=4000)
            lost = state(pg, "s.screen")   # the pasted copy: nothing links to it yet

            # ---- "?" lists the shortcuts
            pg.keyboard.press("?")
            pg.wait_for_selector("#apc-sheet .apc-keys .apc-key")
            assert pg.locator("#apc-sheet .apc-key").count() >= 14
            shot(pg, "p4-app-keys-1440.png")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#apc-sheet", state="detached")

            # ---- your own picture in a slot (the file picker's path, with a real file)
            pg.click(f"#apc-strip [data-go='{start}']")
            pg.evaluate(f"TribeAppCreator.apply({{ op: 'block.add', screen: '{start}', type: 'image' }})")
            pg.wait_for_selector("#apc .apc-edit .ax-b-image [data-img]")
            pg.click("#apc .apc-edit .ax-b-image [data-img]")
            pg.wait_for_selector("#apc-insp #apc-pic")
            png = os.path.join(tmp, "mine.png")
            subprocess.run(["node", "-e", "require('fs').writeFileSync(process.argv[1], Buffer.from(process.argv[2].split(',')[1], 'base64'))", png, PNG], check=True)
            with pg.expect_file_chooser() as fc: pg.click("#apc-insp #apc-pic")
            fc.value.set_files(png)
            pg.wait_for_function("Object.keys(TribeAppCreator.doc().pics || {}).length === 1", timeout=6000)
            pg.wait_for_selector("#apc .apc-edit .ax-b-image img.ax-pic")
            assert pg.locator("#apc-insp .apc-mine [data-mine]").count() == 1
            pg.wait_for_function(f"fetch('/api{cfg}', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.pics && Object.keys(j.config.pics).length === 1)", timeout=6000)
            shot(pg, "p4-app-picture-1440.png")
            pg.keyboard.press("Escape")

            # ---- history: every save is there; name a version, change the app, restore it (one Undo)
            st0, h0 = api(cfg + "/history", token=tok); assert st0 == 200 and len(h0["versions"]) >= 1, h0
            assert len(h0["versions"]) <= 3, "saves close together share one entry"
            name0 = doc(pg)["name"]
            pg.keyboard.press("Control+s")
            pg.wait_for_selector("#apc-sheet #apc-hname")
            pg.fill("#apc-hname", "v1 demo"); pg.click("#apc-hsave button[type=submit]")
            pg.wait_for_selector("#apc-hlist .apc-hrow .apc-pill")
            assert "v1 demo" in pg.locator("#apc-hlist .apc-hrow").first.inner_text()
            shot(pg, "p4-app-history-1440.png")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#apc-sheet", state="detached")
            pg.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Changed later' })")
            pg.wait_for_function(f"fetch('/api{cfg}', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.name === 'Changed later')", timeout=6000)
            named = [v for v in api(cfg + "/history", token=tok)[1]["versions"] if v["name"] == "v1 demo"]; assert len(named) == 1, named
            one = api(cfg + "/history/" + named[0]["id"], token=tok)[1]["config"]; assert one["name"] == name0 and len(one.get("pics", {})) == 1, "a version keeps its pictures"
            pg.click("#apc-more"); pg.click("#apc-moremenu [data-m='history']")
            pg.wait_for_selector("#apc-hlist .apc-hrow")
            pg.locator("#apc-hlist .apc-hrow", has_text="v1 demo").click()
            pg.wait_for_selector("#apc-hview #apc-hrestore:not([disabled])")
            pg.click("#apc-hrestore")
            pg.wait_for_function(f"TribeAppCreator.doc().name === {json.dumps(name0)}")
            pg.keyboard.press("Control+z")
            pg.wait_for_function("TribeAppCreator.doc().name === 'Changed later'")
            pg.keyboard.press("Control+Shift+z")
            pg.wait_for_function(f"TribeAppCreator.doc().name === {json.dumps(name0)}")

            # ---- comments: C, click a part, a numbered pin; reply; resolve; the count in the top bar
            pg.evaluate("document.activeElement && document.activeElement.blur()")
            pg.keyboard.press("c")
            assert state(pg, "s.cmode") is True
            pg.click(f"#apc .apc-edit [data-b='{ids[1]}']", position={"x": 20, "y": 10})
            pg.wait_for_selector("#apc-cbox #apc-ctext")
            pg.fill("#apc-ctext", "Make this title shorter"); pg.keyboard.press("Enter")
            pg.wait_for_selector("#apc-pins .apc-pin")
            assert state(pg, "s.cmode") is False and pg.locator("#apc-cn").inner_text() == "1"
            assert state(pg, f"s.doc.screens.find(x => x.id === '{start}').blocks.find(b => b.id === '{ids[1]}') != null"), "a comment click never edits the part"
            cs = api(f"/projects/{pid}/app-comments", token=tok)[1]["comments"]; assert len(cs) == 1 and cs[0]["block"] == ids[1] and cs[0]["status"] == "open", cs
            assert pg.locator("#apc-insp .apc-clist .apc-crow").count() == 1
            shot(pg, "p4-app-comment-1440.png")
            pg.click("#apc-pins .apc-pin")
            pg.wait_for_selector("#apc-cbox #apc-rtext")
            pg.fill("#apc-rtext", "On it"); pg.keyboard.press("Enter")
            pg.wait_for_selector("#apc-cbox .apc-cmr")
            shot(pg, "p4-app-thread-1440.png")
            pg.click("#apc-cbox #apc-cres")
            pg.wait_for_function("!document.querySelector('#apc-pins .apc-pin')")
            c1 = api(f"/projects/{pid}/app-comments", token=tok)[1]["comments"][0]; assert c1["status"] == "resolved" and len(c1["replies"]) == 1, c1
            assert pg.locator("#apc-cn").is_hidden()
            assert api(f"/projects/{pid}/app-comments", "POST", {"text": ""}, token=tok)[0] == 400

            # ---- the map: every screen, arrows, the unreachable one flagged, drag to arrange, zoom, fit, click to open
            pg.keyboard.press("m")
            pg.wait_for_selector("#apc-map .apc-mc")
            nsc = len(doc(pg)["screens"])
            assert pg.locator("#apc-map .apc-mc").count() == nsc
            assert pg.locator("#apc-map .apc-map-svg path[marker-end]").count() >= 3, "links are arrows"
            assert pg.locator(f"#apc-map .apc-mc.lost[data-ms='{lost}']").count() == 1 and pg.locator("#apc-map .apc-mc.lost").count() == 1, "only the pasted copy is unreachable"
            # pass 4 polish: no link line runs across a screen (it travels in the gaps), and the hint sits clear of notices
            crossing = pg.evaluate("""(() => { const cards = [...document.querySelectorAll('#apc-map .apc-mc')].map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: e.offsetWidth, h: e.offsetHeight }));
              const bad = []; for (const p of document.querySelectorAll('#apc-map .apc-map-svg path[marker-end]')) { const n = p.getTotalLength(); for (let t = 0; t <= n; t += 4) { const q = p.getPointAtLength(t); const c = cards.find(c => q.x > c.x + 8 && q.x < c.x + c.w - 8 && q.y > c.y + 8 && q.y < c.y + c.h - 8); if (c) { bad.push({ d: p.getAttribute('d'), at: [Math.round(q.x), Math.round(q.y)], card: c }); break; } } } return bad; })()""")
            assert not crossing, f"link lines run across a screen: {crossing}"
            hint = pg.locator("#apc-map .apc-map-hint").bounding_box(); assert hint and hint["y"] < 120, hint
            shot(pg, "p4-app-map-1440.png")
            z0 = pg.evaluate("TribeAppPlus.view().k"); pg.click("#apc-map [data-z='in']"); assert pg.evaluate("TribeAppPlus.view().k") > z0
            pg.click("#apc-map [data-z='fit']")
            box = pg.locator(f"#apc-map .apc-mc[data-ms='{lost}']").bounding_box()
            pg.mouse.move(box["x"] + 30, box["y"] + 30); pg.mouse.down(); pg.mouse.move(box["x"] + 90, box["y"] + 130, steps=6); pg.mouse.up()
            pg.wait_for_function(f"(TribeAppCreator.doc().map || {{}})['{lost}'] != null")
            assert state(pg, "s.map") is True, "a drag does not open the screen"
            pg.keyboard.press("Control+z"); pg.wait_for_function("!TribeAppCreator.doc().map")
            # Shift click selects; Duplicate copies the screen; Delete removes the copy and the stray one
            pg.click(f"#apc-map .apc-mc[data-ms='{lost}']", modifiers=["Shift"], position={"x": 20, "y": 20})
            pg.wait_for_selector("#apc-map .apc-map-sel:not([hidden])")
            pg.click("#apc-map .apc-map-sel [data-ma2='dup']")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {nsc + 1}")
            pg.keyboard.press("Control+z"); pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {nsc}")
            assert state(pg, "s.mapSel") == [lost], "the selection survives Undo"
            pg.keyboard.press("Delete")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {nsc - 1}")
            assert pg.locator("#apc-map .apc-mc.lost").count() == 0
            pg.click(f"#apc-map .apc-mc[data-ms='{other}']", position={"x": 20, "y": 20})
            pg.wait_for_function(f"!TribeAppCreator.state().map && TribeAppCreator.state().screen === '{other}'")
            assert pg.locator("#apc-map").count() == 0

            # ---- tablet beside iPhone and Android; the peek changes nothing
            pg.click("#apc .apc-top [data-dev='tablet']")
            pg.wait_for_function("TribeAppCreator.doc().device === 'tablet'")
            assert pg.evaluate("document.querySelector('#apc-stage').offsetWidth") == 768
            shot(pg, "p4-app-tablet-1440.png")
            pg.click("#apc .apc-top [data-plat='android']")
            pg.wait_for_function("TribeAppCreator.doc().device === 'phone' && TribeAppCreator.doc().platform === 'android'")
            pg.click("#apc .apc-top [data-plat='ios']")
            mode0 = doc(pg)["theme"]["mode"]; bg0 = pg.evaluate("getComputedStyle(document.querySelector('#apc .apc-edit .ax-screen')).backgroundColor")
            pg.click("#apc-more"); pg.click("#apc-moremenu [data-m='peek']")
            pg.wait_for_function(f"getComputedStyle(document.querySelector('#apc .apc-edit .ax-screen')).backgroundColor !== {json.dumps(bg0)}")
            assert doc(pg)["theme"]["mode"] == mode0, "the peek is for the eye only"
            shot(pg, "p4-app-peek-1440.png")
            pg.click("#apc-more"); pg.click("#apc-moremenu [data-m='peek']")
            pg.wait_for_function(f"getComputedStyle(document.querySelector('#apc .apc-edit .ax-screen')).backgroundColor === {json.dumps(bg0)}")

            # ---- Play with a working feature: the real app in a frame, and the feature runs there
            pg.evaluate("TribeAppCreator.apply({ op: 'feature.add', feature: 'backup' })")
            feat = doc(pg).get("features") or []
            if not feat:
                fid = pg.evaluate("TribeAppFeatures.list()[0].id"); pg.evaluate(f"TribeAppCreator.apply({{ op: 'feature.add', feature: '{fid}' }})"); feat = doc(pg).get("features") or []
            assert feat, "a feature was added"
            pg.evaluate("document.activeElement && document.activeElement.blur()")
            pg.keyboard.press("p")
            pg.wait_for_selector("#apc-playframe", timeout=6000)
            fr = pg.frame_locator("#apc-playframe")
            fr.locator(".ax-screen:visible").first.wait_for(timeout=8000)
            fr.locator("[class^='tcf-']").first.wait_for(state="attached", timeout=8000)   # the feature's own controls exist in the running app
            shot(pg, "p4-app-play-feature-1440.png")
            pg.keyboard.press("p")
            pg.wait_for_selector("#apc .apc-edit .ax-screen")
            assert pg.locator("#apc-playframe").count() == 0
            pg.evaluate(f"TribeAppCreator.apply({{ op: 'feature.remove', feature: '{feat[0]}' }})")
            pg.click("#apc-play"); pg.wait_for_selector("#apc.apc-playing .apc-ax .ax-screen:visible"); assert pg.locator("#apc-playframe").count() == 0, "no features: the quick prototype"
            pg.click("#apc-play")
            pg.wait_for_function(f"fetch('/api{cfg}', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => !j.config.features)", timeout=6000)
            pg.evaluate("TribeAppCreator.close()")

            # ---- with no tribe: history is kept on the device
            lctx = b.new_context(viewport={"width": 1440, "height": 900})
            lp = lctx.new_page(); watch(lp, "local")
            lp.goto(BASE + "/?skipIntro=1"); lp.wait_for_function("window.TribeAppCreator && window.TribeAppPlus", timeout=20000)
            lp.evaluate("TribeAppCreator.open({ template: 'recipes' })"); lp.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            lp.wait_for_function("(JSON.parse(localStorage.getItem('tribecode.appcreator.history') || '[]')).length >= 1", timeout=5000)
            lp.evaluate("document.activeElement && document.activeElement.blur()")
            lp.keyboard.press("Control+s"); lp.wait_for_selector("#apc-sheet #apc-hname"); lp.fill("#apc-hname", "first"); lp.click("#apc-hsave button[type=submit]")
            lp.wait_for_selector("#apc-hlist .apc-hrow .apc-pill")
            lp.keyboard.press("Escape")
            lp.evaluate("TribeAppCreator.apply({ op: 'rename', name: 'Later' })")
            lp.evaluate("TribeAppCreator.apply({ op: 'screen.add', name: 'Extra' })")
            lp.click("#apc-more"); lp.click("#apc-moremenu [data-m='history']")
            lp.locator("#apc-hlist .apc-hrow", has_text="first").click()
            lp.wait_for_selector("#apc-hview #apc-hrestore:not([disabled])"); lp.click("#apc-hrestore")
            lp.wait_for_function("TribeAppCreator.doc().name !== 'Later'")
            # a comment with no tribe stays on the device
            lp.evaluate("document.activeElement && document.activeElement.blur()")
            lp.keyboard.press("c"); lp.click("#apc .apc-edit [data-b]", position={"x": 10, "y": 10}); lp.fill("#apc-ctext", "note to self"); lp.keyboard.press("Enter")
            lp.wait_for_selector("#apc-pins .apc-pin")
            assert lp.evaluate("JSON.parse(localStorage.getItem('tribecode.appcreator.comments.local')).length") == 1
            lctx.close()

            # ---- phone 390px: Map, Comment, History and sizes are under More; the map works; no sideways scroll
            mctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); mctx.add_init_script(settings_js("Mara", tok, pid))
            mp = mctx.new_page(); watch(mp, "phone")
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeAppCreator && window.TribeAppPlus && TribeClient.connected()", timeout=20000)
            mp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); mp.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            assert mp.locator("#apc-mapb").is_hidden() and mp.locator("#apc-more").is_visible()
            top = mp.evaluate("document.querySelector('.apc-top').getBoundingClientRect().height"); assert top <= 60, top
            over = mp.evaluate("[...document.querySelectorAll('.apc-top > *, .apc-top .apc-plus > *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > 391).map(e => (e.id || e.className) + ' ' + Math.round(e.getBoundingClientRect().right))"); assert not over, f"the top bar fits: {over}"
            mp.tap("#apc-more"); mp.wait_for_selector("#apc-moremenu:not([hidden])")
            mp.wait_for_selector("#apc-moremenu [data-m='requests']:visible", timeout=5000)   # pass 4 polish: the way to Suggested changes for someone who sees no strip
            assert mp.locator("#apc-moremenu [data-m]:visible").count() == 6
            r = mp.locator("#apc-moremenu").bounding_box(); assert r["x"] >= 0 and r["x"] + r["width"] <= 390, r
            assert mp.evaluate("[...document.querySelectorAll('#apc-moremenu [data-m]')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 40)")
            shot(mp, "p4-app-more-390.png")
            mp.tap("#apc-moremenu [data-m='map']"); mp.wait_for_selector("#apc-map .apc-mc")
            assert mp.evaluate("document.querySelector('#apc-map .apc-map-tools').getBoundingClientRect().right <= 390")
            shot(mp, "p4-app-map-390.png")
            mp.tap("#apc-map [data-z='done']"); mp.wait_for_selector("#apc-map", state="detached")
            mp.tap("#apc-rack [data-sheet='edit']"); mp.wait_for_selector("#apc-sheet .apc-quick")
            shot(mp, "p4-app-edit-390.png")
            mp.tap("#apc-sheet [data-q='history']"); mp.wait_for_selector("#apc-sheet #apc-hlist .apc-hrow")
            mp.wait_for_selector("#apc-hview #apc-hrestore")
            assert mp.evaluate("[...document.querySelectorAll('#apc-sheet .apc-hrow, #apc-sheet #apc-hrnb, #apc-sheet #apc-hsave button')].every(e => e.getBoundingClientRect().right <= 390)"), "History fits a phone"
            shot(mp, "p4-app-history-390.png")
            mp.tap("#apc-sheet-x")
            # the note sits at the top of the stage, not over the content being tapped
            mp.evaluate("TribeAppCreator.apply({ op: 'theme', set: { radius: 'pill' } })")
            mp.wait_for_selector("#apc-note:not([hidden])")
            nb = mp.locator("#apc-note").bounding_box(); mb = mp.locator("#apc-mid").bounding_box(); assert nb["y"] - mb["y"] < 40, (nb, mb)
            assert mp.evaluate("document.documentElement.scrollWidth") <= 392
            mctx.close()
            b.close()
        assert not errors, "\n".join(errors[:12])
        print("e2e_app_plus: OK (pictures, paste, history with named versions and restore, comments with replies, several parts, clipboard, map, tablet, peek, features in Play, shortcuts, no tribe, 390px)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
