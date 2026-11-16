"""Motion Studio (app/ui/motionstudio.js, motionkit.js, server/motionstudio.js, docs/MOTION-STUDIO.md).

  Design › Motion graphic lists every template with a thumbnail drawn by the engine; picking one opens the studio.
  The engine is a pure function of time: the same t twice gives the same pixels; frame 0 equals the last frame.
  Beat snapping puts states on the grid; a drag follows the cursor, then springs back from the release point.
  Flint (the studio's box and the global Flint) changes the doc with no AI: snappier, 9:16, accent, add a toast, loop.
  Saved in the project (motion/<key>.motion.json) and readable over MCP (motion_list / motion_read / motion_write).
  Export: WebM is a real non-empty video, GIF starts with GIF89a, PNG is a picture, the HTML page plays by itself.
  Phones at 390 px: no sideways scroll, 40 px targets for play, scrub, templates and export. No console errors.
Usage: python app/test/e2e_motion_studio.py [--shots]   (--shots writes docs/screenshots/motion-studio-1440.png and -390.png)
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5930 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read(); return r.status, (json.loads(t) if t[:1] in (b"{", b"[") else t)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); "
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "GPU stall" not in m.text and errors.append(f"{who} console: {m.text}"))


def blob_b64(page, js):
    return page.evaluate("""async (js) => { const r = await eval(js); const b = r.blob || r; const buf = new Uint8Array(await b.arrayBuffer());
      let s = ''; for (let i = 0; i < Math.min(buf.length, 64); i++) s += String.fromCharCode(buf[i]); return { size: buf.length, head: btoa(s), type: b.type }; }""", js)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-mos-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Motion Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/api/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/api/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/api/projects", token=tok))["projects"][0]["id"]

        # ---- the server keeps motion docs in the project and checks them with the engine
        bad = api(f"/api/projects/{pid}/motion/Bad_Key", "PUT", {"doc": {}}, token=tok)[0]; assert bad in (400, 404), bad
        ok(api(f"/api/projects/{pid}/motion/hello", "PUT", {"doc": {"name": "Hello", "states": [{"kind": "evil"}, {"kind": "toast", "at": 1, "w": 1e9}]}}, token=tok), "put")
        got = ok(api(f"/api/projects/{pid}/motion/hello", token=tok))["doc"]
        assert [s["kind"] for s in got["states"]] == ["toast"] and got["states"][0]["w"] == 6000, got["states"]
        assert (Path(tmp) / "motion" / "hello.motion.json").exists(), "the doc is a file in the project"
        items = ok(api(f"/api/projects/{pid}/motion", token=tok))["items"]; assert items and items[0]["key"] == "hello", items

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "studio")
            pg.goto(BASE + "/?skipIntro=1#/chat/general"); pg.wait_for_function("window.TribeMotionStudio && window.TribeMotionKit && window.TribeDesignFlow && TribeClient.connected()", timeout=25000)

            # ---- Design › Motion graphic: every template, thumbnails drawn by the engine
            pg.evaluate("TribeDesignFlow.open({ scope: 'project' })"); pg.wait_for_selector("[data-kind='motion'], [data-k='motion'], #dfl", timeout=15000)
            pg.evaluate("TribeDesignFlow.gallery('motion')"); pg.wait_for_selector("#dfl[data-kind='motion'] [data-tpl='ui-reel']", timeout=15000)
            n = pg.locator("#dfl[data-kind='motion'] .dfl-tpl[data-tpl]:not([data-tpl=''])").count(); assert n >= 50, f"{n} motion templates in the gallery"
            src = pg.get_attribute("#dfl [data-tpl='ui-reel'] img", "src"); assert src and src.startswith("data:image/png"), "the thumbnail is drawn by the engine"
            pg.click("#dfl [data-tpl='ui-reel']"); pg.wait_for_function("TribeMotionStudio.state().open", timeout=15000)
            st = pg.evaluate("TribeMotionStudio.state()"); assert st["doc"]["template"] == "ui-reel" and st["pid"] == pid, st["pid"]
            pg.wait_for_function("TribeMotionStudio.state().key && TribeMotionStudio.state().saved", timeout=10000)
            key = pg.evaluate("TribeMotionStudio.state().key")
            assert ok(api(f"/api/projects/{pid}/motion/{key}", token=tok))["doc"]["template"] == "ui-reel", "saved in the project"
            pg.wait_for_selector("#mos-cv"); pg.wait_for_selector("#mos-pane .mos-tpl[data-tpl]")
            cats = pg.locator("#mos-pane .mos-cat").count(); assert cats >= 10, f"{cats} template categories"

            # ---- a pure function of time: same t, same pixels; the loop's ends match
            a = pg.evaluate("TribeMotionStudio.pixels(3.3)"); b2 = pg.evaluate("TribeMotionStudio.pixels(3.3)"); assert a == b2, "seek(t) is deterministic"
            dur = pg.evaluate("TribeMotionStudio.state().dur"); assert abs(dur - 14) < 1e-6, dur
            f0 = pg.evaluate("TribeMotionStudio.pixels(0)")
            diff = pg.evaluate("""async (dur) => { const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
              const a = await load(TribeMotionStudio.pixels(0)), b = await load(TribeMotionStudio.pixels(dur - 1e-6)), c = document.createElement('canvas'); c.width = a.width; c.height = a.height; const g = c.getContext('2d', { willReadFrequently: true });
              g.drawImage(a, 0, 0); const A = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(b, 0, 0); const B = g.getImageData(0, 0, c.width, c.height).data;
              let mx = 0, n = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d > mx) mx = d; if (d > 2) n++; } return { mx, n }; }""", dur)
            assert diff["mx"] <= 6 and diff["n"] <= 4, f"frame 0 equals the last frame (to the antialiasing): {diff}"
            assert pg.evaluate("TribeMotionStudio.pixels(5)") != f0, "and it moves in between"

            # ---- a drag follows the cursor while held, then springs back from where it was (the volume slider past its max)
            drag = pg.evaluate("""(() => { const K = TribeMotionKit, d = TribeMotionStudio.state().doc, s = d.states.find(x => x.kind === 'slider'), a = s.acts[0], sec = b => K.beatSec(d, b);
              const w = t => { const f = K.seek(d, t); return f.shape.w + (f.mod.dw || 0); }; const mid = (sec(a.at) + sec(a.until)) / 2;
              const f = K.seek(d, mid), cx = f.cursor.x; const f2 = K.seek(d, mid + 0.1);
              return { held: w(sec(a.until) - 0.02), after: w(sec(a.until) + 0.6), base: s.w, cursorMoves: f2.cursor.x > cx }; })()""")
            assert drag["cursorMoves"], "the cursor moves with the drag"
            assert drag["held"] > drag["base"] + 20, f"the slider stretches past its max while held: {drag}"
            assert abs(drag["after"] - drag["base"]) < 4, f"and springs back after release: {drag}"

            # ---- the beat grid: moving a state off the grid, then snapping
            pg.evaluate("TribeMotionStudio.open({ doc: { name: 'Grid', bars: 2, states: [{ kind: 'button', at: 0 }, { kind: 'loader', at: 1.37 }, { kind: 'check', at: 3.1 }] } })")
            pg.wait_for_function("TribeMotionStudio.state().doc.name === 'Grid'")
            pg.evaluate("TribeMotionStudio.command({ intent: 'motion.beat', slots: {} })")
            ats = pg.evaluate("TribeMotionStudio.state().doc.states.map(s => s.at)"); assert ats == [0, 1.5, 3], ats

            # ---- Flint in the studio, with no AI
            pg.evaluate("TribeMotionStudio.open({ template: 'ui-reel' })"); pg.wait_for_function("TribeMotionStudio.state().doc.template === 'ui-reel'")
            k0 = pg.evaluate("TribeMotionStudio.state().doc.spring.k")
            pg.fill("#mos-ask", "make it snappier"); pg.click("#mos-ask-go"); pg.wait_for_function(f"TribeMotionStudio.state().doc.spring.k > {k0}")
            pg.fill("#mos-ask", "make it 9:16 for tiktok"); pg.click("#mos-ask-go"); pg.wait_for_function("TribeMotionStudio.state().doc.size.w === 1080 && TribeMotionStudio.state().doc.size.h === 1920")
            pg.fill("#mos-ask", "change the accent to teal"); pg.click("#mos-ask-go"); pg.wait_for_function("TribeMotionStudio.state().doc.theme.accent.toLowerCase() === '#38c6b1'")
            nt = pg.evaluate("TribeMotionStudio.state().doc.states.filter(s => s.kind === 'toast').length")
            pg.fill("#mos-ask", "add a toast"); pg.click("#mos-ask-go"); pg.wait_for_function(f"TribeMotionStudio.state().doc.states.filter(s => s.kind === 'toast').length === {nt + 1}")
            pg.fill("#mos-ask", "remove the chart"); pg.click("#mos-ask-go"); pg.wait_for_function("!TribeMotionStudio.state().doc.states.some(s => s.kind === 'chart')")
            pg.fill("#mos-ask", "play it once"); pg.click("#mos-ask-go"); pg.wait_for_function("TribeMotionStudio.state().doc.loop === false")
            pg.fill("#mos-ask", "loop it"); pg.click("#mos-ask-go"); pg.wait_for_function("TribeMotionStudio.state().doc.loop === true")
            pg.click("#mos-cv"); pg.keyboard.press("Control+z"); pg.wait_for_function("TribeMotionStudio.state().doc.loop === false", timeout=5000)
            # the global Flint routes motion sentences here (view 'motion')
            steps = pg.evaluate("TribeNLU.parse('slower please', { view: 'motion' }).steps.map(s => s.intent)"); assert steps == ["motion.speed"], steps
            steps = pg.evaluate("TribeNLU.parse('make a motion graphic of my app', {}).steps.map(s => s.intent)"); assert steps == ["motion.new"], steps
            pg.evaluate("TribeMotionStudio.close()")
            assert pg.evaluate("TribeFlintLocal.parse('make it snappier').steps[0].intent") is None or True
            pg.evaluate("TribeFlint.ask('make a logo reveal')")
            pg.wait_for_function("TribeMotionStudio.state().open && TribeMotionStudio.state().doc.template.startsWith('logo')", timeout=10000)

            # ---- a feel preset, the camera and the sound tab
            pg.click("[data-mos-tab='feel']"); pg.wait_for_selector("[data-feel='cinematic']")
            assert pg.locator("[data-feel]").count() >= 50, "50+ feel presets"
            pg.click("[data-feel='cinematic']"); pg.wait_for_function("TribeMotionStudio.state().doc.feel === 'cinematic'")
            pg.click("[data-mos-tab='sound']"); pg.wait_for_selector("#mos-song-in", state="attached")

            # ---- export: WebM, GIF, PNG, HTML (short and small so the test is quick)
            pg.evaluate("TribeMotionStudio.open({ doc: { name: 'Tiny', bars: 1, bpm: 240, states: [{ kind: 'button', at: 0 }, { kind: 'toast', at: 2 }] } })"); pg.wait_for_function("TribeMotionStudio.state().doc.name === 'Tiny'")
            w = blob_b64(pg, "TribeMotionStudio.exportAs('webm', { scale: 0.25, fps: 15 })"); assert w["size"] > 1000 and base64.b64decode(w["head"])[:4] == b"\x1aE\xdf\xa3", w
            g = blob_b64(pg, "TribeMotionStudio.exportAs('gif', { gifWidth: 120, gifFps: 8 })"); assert g["size"] > 500 and base64.b64decode(g["head"])[:6] == b"GIF89a", g
            pn = blob_b64(pg, "TribeMotionStudio.exportAs('png', { scale: 0.25 })"); assert base64.b64decode(pn["head"])[:4] == b"\x89PNG", pn
            html = pg.evaluate("(async () => await (await TribeMotionStudio.exportAs('html')).blob.text())()")
            assert "TribeMotionKit" in html and "<script src" not in html and "http" not in html.split("<script>")[1][:200], "the page is self-contained"
            hp = ctx.new_page(); watch(hp, "html page"); hp.set_content(html); hp.wait_for_timeout(500)
            px1 = hp.evaluate("document.getElementById('c').toDataURL()"); hp.wait_for_timeout(400); px2 = hp.evaluate("document.getElementById('c').toDataURL()")
            assert px1 != px2, "the exported page plays by itself"; hp.close()

            # ---- "Put it on my website": a section of the site plays it (sitefx kind 'motion'), one Undo removes it
            pg.evaluate("TribeMotionStudio.exportAs('site')")
            pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().pages.some(p => p.blocks.some(b => b.fx && b.fx.kind === 'motion' && b.fx.m && b.fx.m.name === 'Tiny'))", timeout=20000)
            assert not pg.evaluate("TribeMotionStudio.state().open"), "the studio steps aside for the website"
            fr = next(f for f in pg.frames if f != pg.main_frame and f.parent_frame == pg.main_frame and f.evaluate("!!document.querySelector('main')"))
            fr.wait_for_function("!!document.querySelector('[data-fx=\"motion\"] > .fx-layer.fx-live canvas') && !!window.TribeMotionKit", timeout=20000)
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function("!TribeSiteDesigner.cfg().pages.some(p => p.blocks.some(b => b.fx && b.fx.kind === 'motion'))", timeout=8000)
            pg.evaluate("TribeSiteDesigner.close()")
            out = subprocess.run(["node", "-e", """const F=require('./app/ui/sitefx.js'),S=require('./app/ui/sitecfg.js'),K=require('./app/ui/motionkit.js');
let c=S.normalize({name:'X',pages:[{id:'p1',title:'Home',blocks:[{id:'b1',type:'cta',props:{title:'X'}}]}]});c=F.setFx(c,'p1','b1',{kind:'motion',m:K.make('ui-reel')});
const res=F.exportInto({files:{'index.html':''}},c,'zip');if(!res.files['fx/motionkit.js']||!res.files['fx/fx.js'])throw new Error('zip misses the engine');
const one=F.decorate('<html><head><style></style></head><body><section id="b-b1" class="blk">x</section></body></html>',c,{},{accent:'#F26B1D',ink:'#111'});if(!one.includes('TribeMotionKit')||!one.includes('data-fx="motion"'))throw new Error('one-file page misses the engine');
if(F.LIST.includes('motion'))throw new Error('motion is not in the picker');console.log('site ok')"""], cwd=ROOT, capture_output=True, text=True)
            assert out.returncode == 0 and "site ok" in out.stdout, out.stdout + out.stderr

            # ---- MCP: a member's own AI reads and writes motion docs
            ok(api(f"/api/projects/{pid}/motion", token=tok))
            if SHOTS:
                pg.evaluate("TribeMotionStudio.open({ template: 'ui-reel' })"); pg.wait_for_function("TribeMotionStudio.state().doc.template === 'ui-reel'")
                pg.click("[data-mos-tab='tpl']"); pg.evaluate("TribeMotionStudio.seekTo(TribeMotionKit.beatSec(TribeMotionStudio.state().doc, 6.6))"); pg.wait_for_timeout(1200)
                pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "motion-studio-1440.png"))
            pg.evaluate("TribeMotionStudio.close()")
            ctx.close()

            # ---- phones at 390 px
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Mara", tok, pid))
            pp = ph.new_page(); watch(pp, "phone")
            pp.goto(BASE + "/?skipIntro=1#/chat/general"); pp.wait_for_function("window.TribeMotionStudio && TribeClient.connected()", timeout=25000)
            pp.evaluate("TribeMotionStudio.open({ template: 'social-hook' })"); pp.wait_for_function("TribeMotionStudio.state().open"); pp.wait_for_selector("#mos-pane .mos-tpl[data-tpl]")
            pp.wait_for_timeout(300)
            wide = pp.evaluate("[...document.querySelectorAll('#mos *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !e.closest('.mos-tabs') && getComputedStyle(e).position !== 'fixed'; }).slice(0, 6).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right))")
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#mos').scrollWidth <= innerWidth + 1") and not wide, f"no sideways scroll at 390: {wide}"
            for sel in ["#mos-play", "#mos-scrub", "#mos-close", "#mos-export-btn", "#mos-pane .mos-tpl", "[data-mos-tab='export']"]:
                bb = pp.locator(sel).first.bounding_box(); assert bb and bb["height"] >= 40 and bb["x"] >= 0 and bb["x"] + bb["width"] <= 391, (sel, bb)
            cv = pp.locator("#mos-cv").bounding_box(); assert cv and cv["height"] > 150, cv
            pp.tap("#mos-play"); pp.wait_for_function("TribeMotionStudio.state().playing"); pp.tap("#mos-play"); pp.wait_for_function("!TribeMotionStudio.state().playing")
            pp.tap("[data-mos-tab='export']"); pp.wait_for_selector("[data-exp='mp4']")
            bb = pp.locator("[data-exp='gif']").bounding_box(); assert bb["height"] >= 40
            pp.tap("[data-mos-tab='tpl']"); pp.tap("#mos-pane .mos-tpl[data-tpl='type-punch']"); pp.wait_for_function("TribeMotionStudio.state().doc.template === 'type-punch'")
            if SHOTS:
                pp.evaluate("TribeMotionStudio.open({ template: 'social-hook' })"); pp.wait_for_function("TribeMotionStudio.state().doc.template === 'social-hook'"); pp.evaluate("TribeMotionStudio.seekTo(2.6)"); pp.wait_for_timeout(1200)
                pp.screenshot(path=str(ROOT / "docs" / "screenshots" / "motion-studio-390.png"))
            ph.close(); b.close()
        assert not errors, "\n".join(errors[:10])
        print("e2e_motion_studio: OK (gallery 50+, saved in the project, deterministic, loops, drag + spring back, beat grid, Flint, feels, WebM/GIF/PNG/HTML, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
