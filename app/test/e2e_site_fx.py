"""Moving and 3D backgrounds in the website designer (app/ui/sitefx.js, sitefxui.js, sitefx/fx.js, fx3d.js).

  The model, with no browser: every kind survives normalize, junk is dropped, the page gets the layer, the CSS and the
  script; a zip gets fx/ (and Three.js only when a 3D kind is used); nothing in an export loads from another site.
  In the designer: each of the thirteen backgrounds can be put behind a section from the Edit panel and it draws (the
  layer's pixels change); the sliders, colours and the phones switch change it; Undo removes it cleanly; the words over
  a background are still ordinary editable text; a tile in the section picker adds an intro section with a background
  (one undo step); Flint does the same by sentence, with no AI.
  Published: the site's folder holds fx/ and the page runs from a file with no server and no outside requests; with
  "reduce motion" it draws one still frame and stops; on a phone with motion off there is no canvas, only the still
  picture; with WebGL unavailable the still picture stays and nothing breaks; removing a section frees its canvas.
  No console errors.
Usage: python app/test/e2e_site_fx.py [--shots DIR]
"""
import io, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
PORT = 5870 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
GL = ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
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
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "GPU stall" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(600)
        page.screenshot(path=str(Path(SHOTS) / name), scale="css")


def cfg(page): return page.evaluate("TribeSiteDesigner.cfg()")
def hero(page): return page.evaluate("TribeSiteDesigner.cfg().pages[0].blocks[0]")
def preview(page): return next(f for f in page.frames if f != page.main_frame and f.parent_frame == page.main_frame and f.evaluate("!!document.querySelector('main')"))


def wait_frame(page, js, timeout=20000):
    end = time.time() + timeout / 1000; last = None
    while time.time() < end:
        try:
            f = preview(page); last = f.evaluate(js)
            if last: return f
        except Exception as e: last = e
        page.wait_for_timeout(150)
    raise AssertionError(f"the preview never reached: {js} (last: {last})")


def painted(loc, plain):
    """how many pixels of this element differ from the same element with no background"""
    a = Image.open(io.BytesIO(loc.screenshot())).convert("RGB"); b = plain if plain.size == a.size else plain.resize(a.size)
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 14 else 0)
    return d.histogram()[255] / (a.size[0] * a.size[1])


def main():
    # ---- the model, with no browser
    out = subprocess.run(["node", "-e", """
const S = require('./app/ui/sitecfg.js'), FX = require('./app/ui/sitefx.js'), assert = require('node:assert');
assert.ok(FX.LIST.length >= 50, 'at least 50 backgrounds');
let c = S.blank('Fx Test'); const pg = c.pages[0], h = pg.blocks[0];
for (const k of FX.LIST) {
  const c2 = S.normalize(FX.setFx(c, pg.id, h.id, { kind: k })), f = c2.pages[0].blocks[0].fx;
  assert.ok(f && f.kind === k && f.p === 1 && f.c === 'accent', k);
  const html = S.render(c2, { mode: 'single' });
  assert.ok(html.includes('data-fx="' + k + '"') && html.includes('class="fx-layer"') && html.includes('window.TribeFx') && html.includes('.has-fx{'), k + ' page');
  assert.ok(/class="has-fx hero-/.test(html), 'the section keeps its own classes');
  assert.equal(html.includes('THREE.'), !!FX.KINDS[k].three, k + ': Three.js is inside only for a 3D kind');
  const z = S.exportFiles(c2, 'zip');
  assert.ok(z.files['fx/fx.js'] && z.files['fx/LICENSE-threeui.txt'], k + ' zip');
  assert.equal(!!z.files['fx/three.min.js'] && !!z.files['fx/fx3d.js'] && !!z.files['fx/LICENSE-three.txt'], !!FX.KINDS[k].three, k + ' three in zip');
  assert.ok(z.files['index.html'].includes('<script src="fx/fx.js" defer></script>') && !z.files['index.html'].includes('window.TribeFx ='), 'a zip page links the script');
  assert.ok(/moving backgrounds/.test(z.files['README.md']));
  for (const [n, t] of Object.entries(z.files)) if (/\\.html$/.test(n)) assert.ok(!/(?:src|href)=["']?https?:|url\\(["']?https?:|@import/i.test(t.replace(/<a [^>]*>/g, '')), n + ' loads nothing from another site');
  assert.ok(FX.still(k, '#112233', '#445566').startsWith('data:image/svg+xml,'));
}
for (const f of ['fx.js', 'fx3d.js']) { const t = require('fs').readFileSync('app/ui/sitefx/' + f, 'utf8'); assert.ok(!/fetch\\(|XMLHttpRequest|https?:\\/\\//.test(t), f + ' talks to no one'); assert.ok(/Meng To/.test(t), f + ' keeps the credit'); }
assert.ok(/SPDX-License-Identifier: MIT/.test(require('fs').readFileSync('app/ui/sitefx/three.min.js', 'utf8').slice(0, 200)), 'three keeps its license header');
// nothing set: the page is exactly as before (no script, no CSS)
const plain = S.render(c, { mode: 'single' }); assert.ok(!/fx-layer|TribeFx|has-fx/.test(plain));
assert.ok(!S.exportFiles(c, 'zip').files['fx/fx.js']);
// junk is dropped or clamped
let j = JSON.parse(JSON.stringify(c)); j.pages[0].blocks[0].fx = { kind: 'nope', s: 5 }; assert.ok(!S.normalize(j).pages[0].blocks[0].fx);
j.pages[0].blocks[0].fx = { kind: 'dots', s: 99, d: -4, i: 'x', p: 0, c: '<script>', c2: 'muted' }; const cl = S.normalize(j).pages[0].blocks[0].fx;
assert.deepEqual(cl, { kind: 'dots', s: 2.5, d: 0.4, i: 1, p: 0, c: 'accent', c2: 'muted' });
// a hidden section draws nothing on the site; duplicating a section keeps its background
let hd = S.setHidden(FX.setFx(c, pg.id, h.id, { kind: 'orb' }), pg.id, h.id, true); assert.ok(!/data-fx=/.test(S.render(hd, { mode: 'single' })));
const dup = S.duplicateBlock(FX.setFx(c, pg.id, h.id, { kind: 'orb' }), pg.id, h.id); assert.equal(dup.cfg.pages[0].blocks[1].fx.kind, 'orb');
// colours follow the palette: dark mode changes them
const o1 = /data-fx-o='([^']+)'/.exec(S.render(FX.setFx(c, pg.id, h.id, { kind: 'dots' }), { mode: 'single' }))[1], o2 = /data-fx-o='([^']+)'/.exec(S.render(S.setMode(FX.setFx(c, pg.id, h.id, { kind: 'dots' }), 'dark'), { mode: 'single' }))[1];
assert.notEqual(JSON.parse(o1).b, JSON.parse(o2).b);
// Flint's steps
const at = { page: pg.id }, run = (cf, op, more) => S.command(cf, { intent: 'site.fx', slots: { op, ...(more || {}) } }, at);
let r = run(c, 'add', { three: true }); assert.equal(r.cfg.pages[0].blocks[0].fx.kind, 'constellation');
r = run(c, 'add', { kind: 'warp', block: 'header' }); assert.equal(r.cfg.pages[0].blocks[0].fx.kind, 'warp'); let w = r.cfg;
r = run(w, 'calmer'); assert.ok(r.cfg.pages[0].blocks[0].fx.s < 1 && r.cfg.pages[0].blocks[0].fx.i < 1);
r = run(w, 'phones', { on: false }); assert.equal(r.cfg.pages[0].blocks[0].fx.p, 0);
r = run(w, 'fewer'); assert.ok(r.cfg.pages[0].blocks[0].fx.d < 1);
r = run(w, 'remove'); assert.ok(!r.cfg.pages[0].blocks[0].fx);
r = run(c, 'calmer'); assert.ok(!r.cfg && /no moving background/.test(r.say));
r = run(c, 'add', { kind: 'rings', block: 'contact' }); assert.equal(r.cfg.pages[0].blocks.find(b => b.type === 'contact').fx.kind, 'rings');
console.log('model ok');
"""], cwd=ROOT, capture_output=True, text=True)
    assert out.returncode == 0 and "model ok" in out.stdout, out.stdout + out.stderr
    assert subprocess.run([sys.executable, str(ROOT / "scripts" / "dev" / "sitefx-thumbs.py"), "--check"], capture_output=True).returncode == 0, "a background has no thumbnail"

    tmp = tempfile.mkdtemp(prefix="tribe-sfx-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Motion Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        kinds = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./app/ui/sitefx.js').LIST))"], cwd=ROOT))
        three = set(json.loads(subprocess.check_output(["node", "-e", "const F=require('./app/ui/sitefx.js');console.log(JSON.stringify(F.LIST.filter(k=>F.KINDS[k].three)))"], cwd=ROOT)))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=GL)
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "designer")
            pg.goto(BASE + "/?skipIntro=1#/chat/general"); pg.wait_for_function("window.TribeSiteDesigner && window.TribeSiteFx && window.TribeSiteFxUI", timeout=20000)
            pg.evaluate("TribeSiteDesigner.open({ template: 'cafe' })"); pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().pages[0].blocks.length > 2", timeout=20000)
            h0 = hero(pg); assert h0["type"] == "hero" and "fx" not in h0, h0
            fr = pg.frame_locator("#wdz-frame")
            wait_frame(pg, "!!document.querySelector('[data-block]')")
            fr.locator(f"#b-{h0['id']}").click(position={"x": 8, "y": 8}); pg.wait_for_selector("#sfx-kind", timeout=8000)
            assert pg.locator("#sfx-kind option").count() == len(kinds) + 1, "None and every background"
            assert pg.locator("#sfx-box [data-sfx=s]").count() == 0, "no sliders until one is picked"
            pg.wait_for_timeout(700)
            plain = Image.open(io.BytesIO(fr.locator(f"#b-{h0['id']}").screenshot())).convert("RGB")

            # ---- every background draws behind the section, from the Edit panel
            for k in kinds:
                pg.select_option("#sfx-kind", k); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].fx && TribeSiteDesigner.cfg().pages[0].blocks[0].fx.kind === '{k}'")
                f = wait_frame(pg, f"!!(window.TribeFx && TribeFx.count() === 1 && document.querySelector('[data-fx=\"{k}\"] > .fx-layer.fx-live canvas'))", 30000)
                st = f.evaluate("TribeFx.stats()"); assert st["kinds"] == [k] and st["size"][0][0] > 100, (k, st)
                assert f.evaluate("typeof THREE !== 'undefined'") == (k in three), f"{k}: Three.js loads only for a 3D background"
                pg.wait_for_timeout(900)
                share = painted(fr.locator(f"#b-{h0['id']}"), plain); assert share > 0.0025, f"{k} drew nothing (share {share:.4f})"
                assert f.evaluate("getComputedStyle(document.querySelector('.fx-layer')).pointerEvents") == "none"
                assert f.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{k}: no sideways scroll"
                if k in ("orb", "constellation") and SHOTS: shot(pg, f"site-3d-{k}-1440.png")
                pg.wait_for_selector("#sfx-kind", timeout=8000)
            last = kinds[-1]

            # ---- the controls change it; each change is one undo step
            n0 = pg.evaluate("TribeSiteDesigner.state().hist")
            pg.locator("#sfx-box [data-sfx=s]").evaluate("el => { el.value = 2; el.dispatchEvent(new Event('change', { bubbles: true })); }")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.s === 2"); assert pg.evaluate("TribeSiteDesigner.state().hist") == n0 + 1
            pg.wait_for_selector("#sfx-box [data-sfx=d]"); pg.locator("#sfx-box [data-sfx=d]").evaluate("el => { el.value = 0.5; el.dispatchEvent(new Event('change', { bubbles: true })); }")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.d === 0.5")
            pg.wait_for_selector("#sfx-box [data-sfx=c]"); pg.select_option("#sfx-box [data-sfx=c]", "muted"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.c === 'muted'")
            f = wait_frame(pg, "!!document.querySelector('[data-fx]') && JSON.parse(document.querySelector('[data-fx]').getAttribute('data-fx-o')).s === 2")
            o = f.evaluate("JSON.parse(document.querySelector('[data-fx]').getAttribute('data-fx-o'))"); assert o["d"] == 0.5 and o["p"] == 1 and o["a"].startswith("#"), o
            pg.wait_for_selector("#sfx-box [data-sfx=p]"); pg.locator("#sfx-box [data-sfx=p]").uncheck(); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.p === 0")
            pg.evaluate("TribeSiteDesigner.undo()"); assert hero(pg)["fx"]["p"] == 1

            # ---- the words over a background are still ordinary, editable text
            f = wait_frame(pg, "!!document.querySelector('[data-fx] h1[data-e]')")
            assert f.evaluate("(() => { const h = document.querySelector('[data-fx] h1[data-e]'); return h.isContentEditable && getComputedStyle(h).userSelect !== 'none' && document.elementFromPoint(h.getBoundingClientRect().left + 6, h.getBoundingClientRect().top + 6) === h; })()"), "the headline is on top and editable"
            fr.locator("[data-fx] h1[data-e]").click(); pg.keyboard.press("Control+A"); pg.keyboard.type("Open late on Fridays"); pg.keyboard.press("Tab")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.title === 'Open late on Fridays'", timeout=8000)
            assert hero(pg)["fx"]["kind"] == last, "editing the words keeps the background"

            # ---- remove, and Undo brings it back; Undo again and again takes everything back cleanly
            fr.locator(f"#b-{h0['id']}").click(position={"x": 8, "y": 8}); pg.wait_for_selector("#sfx-box [data-sfx=off]"); pg.click("#sfx-box [data-sfx=off]")
            pg.wait_for_function("!TribeSiteDesigner.cfg().pages[0].blocks[0].fx")
            f = wait_frame(pg, "!!document.querySelector('[data-block]') && !document.querySelector('[data-fx]') && !document.querySelector('.fx-layer') && !document.querySelector('canvas')")
            pg.evaluate("TribeSiteDesigner.undo()"); assert hero(pg)["fx"]["kind"] == last
            for _ in range(60):
                if not pg.evaluate("TribeSiteDesigner.undo()"): break
            assert "fx" not in hero(pg), "undone all the way: no background left"
            wait_frame(pg, "!!document.querySelector('[data-block]') && !document.querySelector('canvas')")

            # ---- the section picker: a tile adds an intro section with that background, one undo step
            nb = len(cfg(pg)["pages"][0]["blocks"])
            pg.click("[data-wdz=picker]"); pg.wait_for_selector("#wdz-picker [data-fxadd=drift]")
            assert pg.locator("#wdz-picker [data-fxadd]").count() == len(kinds)
            pg.wait_for_function("[...document.querySelectorAll('#wdz-picker [data-fxadd] img')].every(i => i.complete && i.naturalWidth === 240)", timeout=10000)   # our own thumbnails load
            pg.locator("#wdz-picker [data-fxadd=dots]").scroll_into_view_if_needed(); pg.evaluate("document.querySelector('#wdz-picker [data-fxadd=warp]').scrollIntoView({ block: 'end' })")
            shot(pg, "site-3d-picker-1440.png")
            pg.click("#wdz-picker [data-fxadd=drift]"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks.length === {nb + 1}")
            added = [x for x in cfg(pg)["pages"][0]["blocks"] if x.get("fx")]; assert len(added) == 1 and added[0]["type"] == "hero" and added[0]["fx"]["kind"] == "drift", added
            wait_frame(pg, "!!(window.TribeFx && TribeFx.count() === 1 && typeof THREE !== 'undefined')", 30000)
            pg.evaluate("TribeSiteDesigner.undo()"); assert len(cfg(pg)["pages"][0]["blocks"]) == nb and not any(x.get("fx") for x in cfg(pg)["pages"][0]["blocks"])

            # ---- Flint, by sentence, with no AI
            pg.evaluate("TribeSiteDesigner.ask('add a 3D background')"); pg.wait_for_function("(TribeSiteDesigner.cfg().pages[0].blocks[0].fx || {}).kind === 'constellation'", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('make the background calmer')"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.s < 1", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('turn off motion on phones')"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.p === 0", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('put a starfield behind the header')"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.kind === 'warp'", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('undo that')"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.kind === 'constellation'", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('remove the moving background')"); pg.wait_for_function("!TribeSiteDesigner.cfg().pages[0].blocks[0].fx", timeout=10000)
            said = pg.evaluate("TribeSiteDesigner.state().log.filter(l => l.who === 'flint').slice(-6).map(l => l.text).join(' | ')"); assert "Removed the moving background" in said and "still picture" in said, said

            # ---- what goes out: two sections with backgrounds (one flat, one 3D), then the downloads and Publish
            pg.evaluate("TribeSiteDesigner.ask('add a starfield behind the pricing section')"); pg.wait_for_function("/no pricing section/.test(TribeSiteDesigner.state().log.slice(-1)[0].text)", timeout=10000)
            assert not any(x.get("fx") for x in cfg(pg)["pages"][0]["blocks"]), "a section that is not there changes nothing"
            pg.evaluate("TribeSiteDesigner.ask('add ripples behind the header')"); pg.wait_for_function("(TribeSiteDesigner.cfg().pages[0].blocks[0].fx || {}).kind === 'rings'", timeout=10000)
            pg.evaluate("TribeSiteDesigner.ask('give the gallery a constellation background')"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.type !== 'hero' && b.fx && b.fx.kind === 'constellation')", timeout=10000)
            wait_frame(pg, "!!(window.TribeFx && TribeFx.count() === 2)", 30000)
            shot(pg, "site-3d-designer-1440.png")
            with pg.expect_download() as d1: names = pg.evaluate("TribeSiteDesigner.download('zip')")
            assert {"fx/fx.js", "fx/fx3d.js", "fx/three.min.js", "fx/LICENSE-threeui.txt", "fx/LICENSE-three.txt"} <= set(names), names
            with pg.expect_download() as d2: one = pg.evaluate("TribeSiteDesigner.download('html')")
            single = Path(tmp) / "single.html"; d2.value.save_as(str(single))
            assert "window.TribeFx =" in one and "THREE" in one and 'src="http' not in one and "sitefx/" not in one, "one file holds everything it needs"
            pg.evaluate("TribeSiteDesigner.flush()"); pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=15000)
            pub = ok(api(f"/projects/{pid}/site-config/publish", "POST", {}, token=tok), "publish")
            assert {"fx/fx.js", "fx/fx3d.js", "fx/three.min.js", "fx/LICENSE-threeui.txt"} <= set(pub["files"]), pub["files"]
            site = Path(tmp) / "projects" / pid / "site"; assert (site / "fx" / "fx.js").stat().st_size > 5000 and (site / "fx" / "three.min.js").stat().st_size > 500000
            ctx.close()

            # ---- the published site, opened as a file: no server, no outside requests, and it moves
            for name, url in (("published", (site / "index.html").as_uri()), ("one file", single.as_uri())):
                c2 = b.new_context(viewport={"width": 1280, "height": 800}); s = c2.new_page(); watch(s, name)
                asked = []; s.on("request", lambda r: asked.append(r.url))
                s.goto(url); s.wait_for_function("window.TribeFx && TribeFx.count() === 2 && typeof THREE !== 'undefined'", timeout=30000)
                f1 = s.evaluate("TribeFx.stats().frames"); s.wait_for_timeout(900); st = s.evaluate("TribeFx.stats()")
                assert st["frames"] > f1 and st["running"] and st["live"] >= 1, (name, st)
                assert all(u.startswith("file:") or u.startswith("data:") or u.startswith("blob:") for u in asked), [u for u in asked if not u.startswith(("file:", "data:"))]
                assert s.evaluate("(() => { const h = document.querySelector('[data-fx] h1'); const r = h.getBoundingClientRect(); return document.elementFromPoint(r.left + 5, r.top + 5) === h && getSelection && (getSelection().selectAllChildren(h), getSelection().toString().length > 3); })()"), "the words can be selected"
                assert s.evaluate("document.querySelectorAll('canvas').length") == 2, "one canvas per background"
                # a section that leaves the page frees its canvas; off screen costs nothing
                s.evaluate("window.scrollTo(0, 0)"); s.wait_for_timeout(500); assert s.evaluate("TribeFx.stats().live") <= 2
                s.evaluate("document.querySelector('[data-fx=\"rings\"]').remove()"); s.wait_for_function("TribeFx.count() === 1", timeout=5000)
                s.evaluate("document.querySelector('[data-fx]').removeAttribute('data-fx')"); s.wait_for_function("TribeFx.count() === 0 && !document.querySelector('canvas')", timeout=5000)
                s.wait_for_timeout(300); assert not s.evaluate("TribeFx.stats().running"), "nothing left to draw: the loop stops"
                if name == "published": shot(s, "site-3d-published-1280.png")
                c2.close()

            # ---- "reduce motion": one still frame, no loop
            c3 = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce"); s = c3.new_page(); watch(s, "reduced")
            s.goto((site / "index.html").as_uri()); s.wait_for_function("window.TribeFx && TribeFx.count() === 2", timeout=30000); s.wait_for_timeout(700)
            st = s.evaluate("TribeFx.stats()"); f1 = st["frames"]; s.wait_for_timeout(700)
            assert st["still"] and st["live"] == 0 and not s.evaluate("TribeFx.stats().running") and s.evaluate("TribeFx.stats().frames") <= f1 + 1, st
            c3.close()

            # ---- a phone: the section set to "not on phones" shows its still picture, the other one moves
            hero_fx = json.loads((site / "site.json").read_text())["pages"][0]["blocks"][0]["fx"]; assert hero_fx["p"] == 1
            cfgp = json.loads((site / "site.json").read_text()); cfgp["pages"][0]["blocks"][0]["fx"]["p"] = 0
            ph = subprocess.run(["node", "-e", "const S=require('./app/ui/sitecfg.js');process.stdout.write(S.exportFiles(JSON.parse(require('fs').readFileSync(0,'utf8')),'html')['index.html'])"], cwd=ROOT, input=json.dumps(cfgp), capture_output=True, text=True)
            (Path(tmp) / "phone.html").write_text(ph.stdout)
            c4 = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=3, is_mobile=True, has_touch=True); s = c4.new_page(); watch(s, "phone")
            s.goto((Path(tmp) / "phone.html").as_uri()); s.wait_for_function("window.TribeFx && TribeFx.count() === 1", timeout=30000)
            assert s.evaluate("(() => { const l = document.querySelector('[data-fx=\"rings\"] > .fx-layer'); return !l.querySelector('canvas') && /svg/.test(getComputedStyle(l).backgroundImage); })()"), "the still picture on phones"
            sz = s.evaluate("TribeFx.stats().size[0]"); assert sz[0] * sz[1] <= 1500000 + 5000 and sz[0] <= 390 * 1.5 + 2, f"the canvas is capped on a 3x phone: {sz}"
            assert s.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            shot(s, "site-3d-phone-390.png"); c4.close()
            b.close()

            # ---- no WebGL at all: the still pictures stay, the 2D ones still run, nothing breaks
            b2 = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-3d-apis", "--disable-gpu"])
            c5 = b2.new_context(viewport={"width": 1280, "height": 800}); s = c5.new_page(); watch(s, "no webgl")
            s.goto((site / "index.html").as_uri()); s.wait_for_function("window.TribeFx", timeout=20000); s.wait_for_timeout(2500)
            assert s.evaluate("!document.createElement('canvas').getContext('webgl')"), "this browser really has no WebGL"
            assert s.evaluate("TribeFx.count()") == 0 and s.evaluate("document.querySelectorAll('canvas').length") == 0
            assert s.evaluate("typeof THREE === 'undefined'"), "with no WebGL, Three.js is not even loaded"
            assert s.evaluate("[...document.querySelectorAll('.fx-layer')].every(l => /svg/.test(getComputedStyle(l).backgroundImage))"), "the still pictures show"
            assert s.evaluate("document.querySelector('[data-fx] h1').offsetHeight > 0")
            c5.close(); b2.close()

            # ---- the designer at phone width: the controls fit
            b3 = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=GL)
            c6 = b3.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c6.add_init_script(settings_js("Mara", tok, pid))
            m = c6.new_page(); watch(m, "phone designer")
            m.goto(BASE + "/?skipIntro=1#/chat/general"); m.wait_for_function("window.TribeSiteDesigner && window.TribeSiteFxUI", timeout=20000)
            m.evaluate("TribeSiteDesigner.open({})"); m.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.fx)", timeout=20000)
            assert m.evaluate("TribeSiteDesigner.cfg().pages[0].blocks[0].fx.kind") == "rings", "the saved site kept its backgrounds"
            assert m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll at 390"
            shot(m, "site-3d-designer-390.png")
            c6.close(); b3.close()
        assert not errors, errors
        print(f"e2e_site_fx: OK ({len(kinds)} backgrounds draw, controls, undo, editable words, picker, Flint, zip, one file, publish, offline, reduced motion, phones, no WebGL)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
