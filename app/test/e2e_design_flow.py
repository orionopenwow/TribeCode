"""The Design flow (feat/design-flow, app/ui/designflow.js, docs/STARTERS.md).

On this device (no tribe, app/ui served as plain files):
  Home › Design shows "What are you making?" with eight kinds and stroke icons, and Continue (the files view) below.
  Game shows the starters with real thumbnails, a Blank card and the optional prompt. Picking Breakout with "a much
  faster breakout in pink" opens the workspace: the game runs in a sandboxed frame with the ball faster and the bricks
  pink (Flint's free words → knobs), its knobs change it live, and the Plan card has the game's seven steps. Ticking a
  step survives a reload; "Add these steps as tasks" puts the rest on the task board.
  Website hands off to the website designer with the template, and the plan docks beside it.
  A screen template opens the canvas with the screen on it; the plan docks there too.
  Phone 390px: no sideways scroll on the kinds, the gallery or the workspace.
In a tribe (a project):
  Design in the project's sidebar opens the flow (not the canvas). Breakout with a prompt builds into the project's code
  (a commit with config.js set from the words), the plan lives in .tribe/design-plans and ticks off for everyone,
  "Add as tasks" makes real tasks, Website hands off to the designer for this project. Flint's free builds pick the
  starter for "make a snake game called sssnek".
No console errors. --shots writes docs/screenshots/design-flow-1.png, design-flow-gallery.png, design-flow-plan.png.
Usage: python3 app/test/e2e_design_flow.py [--shots]
"""
import functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SPORT, PORT = 5960 + OFF, 5965 + OFF
SB, BASE = f"http://127.0.0.1:{SPORT}", f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


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


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS:
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"{name}.png"))


def no_sideways(page, what):
    w = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth, Math.max(...[...document.querySelectorAll('#dfl, #dfl *')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().right))]")
    assert w[0] <= w[1] + 1 and w[2] <= w[1] + 1, f"{what}: sideways scroll {w}"


LOCAL = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"


def on_this_device(b):
    ctx = b.new_context(viewport={"width": 1360, "height": 860})
    ctx.add_init_script(LOCAL)
    pg = ctx.new_page(); watch(pg, "device")
    pg.goto(SB + "/?skipIntro=1#/hub/design")
    pg.wait_for_selector("#dfl[data-step=kinds] .dfl-kind", timeout=20000)
    assert not pg.evaluate("TribeClient.connected()"), "no tribe here"
    kinds = pg.eval_on_selector_all("#dfl .dfl-kind b", "els => els.map(e => e.textContent)")
    assert kinds == ["Website", "App", "Game", "Screen / UI mockup", "Slides", "Poster / graphic", "Whiteboard", "Logo / brand kit"], kinds
    assert pg.locator("#dfl .dfl-kind svg").count() == 8, "a stroke icon on every tile"
    assert pg.locator("#hub-design").is_visible() and "Continue" in pg.inner_text("#hub-design"), "Continue lists what is already made"
    shot(pg, "design-flow-1")

    # Game: the starters, with thumbnails, Blank and the optional prompt
    pg.click("[data-kind=game]"); pg.wait_for_selector("#dfl[data-step=gallery] .dfl-tpl[data-tpl=breakout]")
    assert not pg.locator("#hub-design").is_visible(), "Continue steps aside in the gallery"
    tpls = pg.eval_on_selector_all("#dfl-grid [data-tpl]", "els => els.map(e => e.dataset.tpl)")
    assert tpls[0] == "" and len(tpls) >= 7 and {"platformer", "breakout", "blocks", "snake", "runner", "topdown", "memory"} <= set(tpls), tpls
    pg.wait_for_function("[...document.querySelectorAll('#dfl-grid img')].every(i => i.complete && i.naturalWidth > 0)", timeout=10000)
    assert "MIT" in pg.inner_text("#dfl-grid") and "CC0-1.0" in pg.inner_text("#dfl-grid"), "licenses on the cards"
    pg.fill("#dfl-ask", "A much faster breakout called Brick Party in pink")
    shot(pg, "design-flow-gallery")
    pg.click(".dfl-tpl[data-tpl=breakout]")
    pg.wait_for_selector("#dfl[data-step=workspace] #dfl-plan", timeout=15000)
    src = pg.eval_on_selector("#dfl-frame", "f => f.srcdoc")
    assert 'ballSpeed: 5,' in src and 'brick: "#FF6F8E",' in src, "the prompt set the knobs (free): " + src[src.find('window.CONFIG'):src.find('window.CONFIG') + 200]
    assert pg.locator("#dfl .dfl-said").is_visible() and "Basic · no AI" in pg.inner_text("#dfl .dfl-said")
    steps = pg.eval_on_selector_all("#dfl-plan .dfl-st b", "els => els.map(e => e.textContent.replace(/^\\d+/, ''))")
    assert steps == ["Idea", "Core loop", "Art style", "Prototype", "Playtest with the tribe", "Polish", "Publish"], steps
    # the game runs in the frame (a canvas with pixels)
    pg.wait_for_timeout(600)
    fr = pg.frame_locator("#dfl-frame")
    assert fr.locator("canvas").evaluate("cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 400) if (d[i]) return true; return false; }")
    # a knob changes it live
    pg.eval_on_selector("[data-k=rows]", "e => { e.value = 6; e.dispatchEvent(new Event('input', { bubbles: true })); }")
    pg.wait_for_function("document.querySelector('#dfl-frame').srcdoc.includes('rows: 6,')", timeout=5000)
    # tick a step; it survives a reload
    pg.click("#dfl-plan [data-step=idea] .dfl-tick")
    pg.wait_for_selector("#dfl-plan [data-step=idea].done")
    assert pg.inner_text("#dfl-plan .dfl-prog") == "1/7"
    if SHOTS:   # a wide window, so the plan sits beside the game
        pg.set_viewport_size({"width": 1680, "height": 1000}); pg.wait_for_timeout(300)
        pg.evaluate("window.scrollTo(0, 0); let e = document.querySelector('#dfl'); while (e) { e.scrollTop = 0; e = e.parentElement; }")
        shot(pg, "design-flow-plan"); pg.set_viewport_size({"width": 1360, "height": 860})
    key = pg.evaluate("TribeDesignFlow.plan().key")
    pg.reload(); pg.wait_for_selector("#dfl[data-step=kinds]", timeout=20000)
    pg.wait_for_selector(f"#dfl-cont-plans [data-plan='{key}']", timeout=5000)
    assert "plan 1/7" in pg.inner_text(f"[data-plan='{key}']")
    pg.click(f"#dfl-cont-plans [data-plan='{key}']"); pg.wait_for_selector("#dfl[data-step=workspace] #dfl-plan [data-step=idea].done", timeout=10000)
    assert 'rows: 6,' in pg.eval_on_selector("#dfl-frame", "f => f.srcdoc"), "the knob was saved with the game"
    # Add these steps as tasks
    before = pg.evaluate("TribeTasks.all().length")
    pg.click("#dfl-addtasks")
    pg.wait_for_function(f"TribeTasks.all().length === {before} + 6", timeout=8000)
    assert any(t["title"] == "Brick Party: Core loop" for t in pg.evaluate("TribeTasks.all()")), pg.evaluate("TribeTasks.all().map(t => t.title)")

    # Website: the website designer takes over with the template, and the plan docks beside it
    pg.click("#dfl-back"); pg.wait_for_selector("#dfl[data-step=kinds]")
    pg.click("[data-kind=website]"); pg.wait_for_selector(".dfl-tpl[data-tpl=cafe]")
    pg.fill("#dfl-ask", "Sunrise Bakery")
    pg.click(".dfl-tpl[data-tpl=cafe]")
    pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=15000)
    assert pg.evaluate("TribeDesignFlow.plan().kind") == "website" and pg.evaluate("TribeDesignFlow.plan().template") == "cafe"
    # the plan is a calm "Plan 0/n" chip in the designer's own toolbar; the very first plan opens once by itself, as a side
    # panel the designer makes room for (nothing covered)
    pg.wait_for_selector("#wdz .wdz-top #dfl-chip:not([hidden])", timeout=5000)
    n = len(pg.evaluate("TribeDesignFlow.plan().steps")); web_key = pg.evaluate("TribeDesignFlow.plan().key")
    assert pg.inner_text("#dfl-chip").replace("\n", " ").split() == ["Plan", f"0/{n}"], pg.inner_text("#dfl-chip")
    pg.wait_for_selector("#dfl-dock:not([hidden]) #dfl-dock-plan", timeout=5000)
    assert "plan · website" in pg.inner_text("#dfl-dock").lower() and pg.get_attribute("#dfl-chip", "aria-expanded") == "true"
    pg.wait_for_timeout(300)
    R = "s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }"
    dk, wz = pg.evaluate(R, "#dfl-dock"), pg.evaluate(R, "#wdz")
    assert dk["w"] <= 300 and wz["r"] <= dk["l"] + 0.5, ("the panel sits beside the designer, not over it", dk, wz)
    for q in ["#wdz .wdz-top [data-wdz='save']", "#wdz-dl"]:
        c = pg.evaluate(R, q); assert c["r"] <= dk["l"], ("the designer's controls stay uncovered", q, c, dk)
    # tick a step and add the steps as tasks, right from the panel
    first = pg.evaluate("TribeDesignFlow.plan().steps[0].id")
    pg.click(f"#dfl-dock [data-step={first}] .dfl-tick"); pg.wait_for_selector(f"#dfl-dock [data-step={first}].done")
    assert pg.inner_text("#dfl-chip").replace("\n", " ").split()[-1] == f"1/{n}"
    assert pg.is_visible("#dfl-dock-addtasks")
    # Esc folds it back to the chip; it stays folded for this design
    pg.keyboard.press("Escape"); pg.wait_for_selector("#dfl-dock", state="hidden")
    assert pg.get_attribute("#dfl-chip", "aria-expanded") == "false" and not pg.evaluate("document.body.classList.contains('dfl-side')")
    assert web_key not in pg.evaluate("JSON.parse(localStorage.getItem('tribecode.designflow.open') || '{}')")
    pg.wait_for_function("TribeSiteDesigner.cfg().name === 'Sunrise Bakery'", timeout=5000)   # the prompt names the site
    if SHOTS: pg.evaluate("document.activeElement && document.activeElement.blur()"); shot(pg, "plan-chip")
    pg.evaluate("TribeSiteDesigner.close()")

    # A screen template: the canvas opens with the screen on it, plan docked
    pg.evaluate("TribeHub.open('design')"); pg.wait_for_selector("#dfl[data-step=kinds]", timeout=20000)
    pg.click("[data-kind=screen]"); pg.wait_for_selector(".dfl-tpl[data-tpl=login]")
    pg.click(".dfl-tpl[data-tpl=login]")
    pg.wait_for_function("TribeCanvas.state().open && TribeCanvas.state().nodes.some(n => n.t === 'frame' && !n.p)", timeout=15000)
    # never opens by itself after the first time: just the chip, in the canvas's toolbar
    pg.wait_for_selector("#dfl-chip:not([hidden])", timeout=5000); pg.wait_for_timeout(400)
    assert pg.is_hidden("#dfl-dock") and pg.evaluate("!!document.querySelector('#cv #dfl-chip') || !!document.querySelector('.titlebar #dfl-chip')"), "folded, in a toolbar"
    pg.click("#dfl-chip"); pg.wait_for_selector("#dfl-dock:not([hidden]) #dfl-dock-plan", timeout=5000)
    assert "plan · screen / ui mockup" in pg.inner_text("#dfl-dock").lower()
    pg.wait_for_timeout(300); dk, cv = pg.evaluate(R, "#dfl-dock"), pg.evaluate(R, "#cv")
    assert cv["r"] <= dk["l"] + 0.5, ("the canvas makes room", cv, dk)
    opened = pg.evaluate("JSON.parse(localStorage.getItem('tribecode.designflow.open') || '{}')")
    assert pg.evaluate("TribeDesignFlow.plan().key") in opened and web_key not in opened, "open or closed is kept per design"
    if SHOTS: shot(pg, "plan-panel")
    ctx.close()

    # Phone 390px: no sideways scroll
    ph = b.new_context(**PHONE); ph.add_init_script(LOCAL)
    pp = ph.new_page(); watch(pp, "phone")
    pp.goto(SB + "/?skipIntro=1#/hub/design"); pp.wait_for_selector("#dfl[data-step=kinds] .dfl-kind", timeout=20000)
    no_sideways(pp, "phone kinds")
    assert pp.evaluate("getComputedStyle(document.querySelector('.dfl-kinds')).gridTemplateColumns.split(' ').length") == 2
    pp.click("[data-kind=app]"); pp.wait_for_selector(".dfl-tpl[data-tpl=kanban]"); no_sideways(pp, "phone gallery")
    pp.click(".dfl-tpl[data-tpl=kanban]"); pp.wait_for_selector("#dfl[data-step=workspace] #dfl-plan", timeout=15000)
    pp.wait_for_timeout(400); no_sideways(pp, "phone workspace")
    # away from the workspace the plan is a small chip; a bottom sheet only on tap
    pp.evaluate("TribeHub.open('home')"); pp.wait_for_selector("#dfl-chip.float:not([hidden])", timeout=8000); pp.wait_for_timeout(300)
    assert pp.is_hidden("#dfl-dock"), "phones: never opens by itself"
    pp.click("#dfl-chip"); pp.wait_for_selector("#dfl-dock.sheet:not([hidden])"); pp.wait_for_selector("#dfl-scrim:not([hidden])"); pp.wait_for_timeout(350)
    sh = pp.evaluate("(() => { const r = document.querySelector('#dfl-dock').getBoundingClientRect(); return { b: r.bottom, w: r.width, h: innerHeight }; })()")
    assert abs(sh["b"] - sh["h"]) <= 1 and sh["w"] <= 390, sh
    no_sideways(pp, "phone plan sheet")
    pp.click("#dfl-scrim", position={"x": 20, "y": 20}); pp.wait_for_selector("#dfl-dock", state="hidden")
    ph.close()


def in_a_tribe(b):
    tmp = tempfile.mkdtemp(prefix="tribe-dfl-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Design Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=orion))["projects"][0]["id"]
        # Flint's free builds pick the starter by what was asked
        t = ok(api("/flint/tier", "POST", {"ask": "make a snake game"}, token=orion))
        assert t["tier"] == "recipe" and t["starter"] == "snake", t
        assert ok(api("/flint/tier", "POST", {"ask": "make a platformer"}, token=orion))["recipe"] == "game", "the platformer keeps its recipe"
        r = ok(api(f"/projects/{pid}/flint/build", "POST", {"ask": "make a snake game called sssnek, much faster"}, token=orion, project=pid), "build snake")
        assert r["built"] and r["starter"] == "snake" and any(f.endswith("config.js") for f in r["files"]) and any(f.endswith("LICENSE") for f in r["files"]), r

        ctx = b.new_context(viewport={"width": 1360, "height": 860})
        ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{orion}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")
        pg = ctx.new_page(); watch(pg, "orion")
        pg.goto(BASE + "/?skipIntro=1")
        pg.wait_for_function("TribeClient.connected() && TribeClient.project()", timeout=20000)
        pg.wait_for_selector("#nest-canvas", state="visible", timeout=15000)
        pg.click("#nest-canvas")
        pg.wait_for_selector("#view-designflow:not(.hidden) #dfl[data-step=kinds]", timeout=10000)
        assert pg.evaluate("document.body.dataset.view") == "designflow" and not pg.evaluate("TribeCanvas.state().open"), "Design opens the flow, not the canvas"
        assert pg.locator("#dfl-cont").is_visible()
        pg.click("[data-kind=game]"); pg.wait_for_selector(".dfl-tpl[data-tpl=breakout]")
        pg.fill("#dfl-ask", "A much faster breakout in pink")
        pg.click(".dfl-tpl[data-tpl=breakout]")
        pg.wait_for_selector("#dfl[data-step=workspace] #dfl-plan", timeout=20000)
        plans = ok(api(f"/projects/{pid}/design-plans", token=orion, project=pid))["plans"]
        assert len(plans) == 1 and plans[0]["kind"] == "game" and plans[0]["target"]["type"] == "build", plans
        dr = plans[0]["target"]["dir"]
        files = ok(api(f"/projects/{pid}/flint/starter-config", "POST", {"starter": "breakout", "dir": dr}, token=orion, project=pid))["values"]
        assert files["ballSpeed"] == 5 and files["brick"] == "#FF6F8E", files
        assert os.path.exists(os.path.join(tmp, ".tribe", "design-plans", plans[0]["key"] + ".json")), "the plan is in .tribe/design-plans"
        # a knob writes config.js in the project
        pg.wait_for_selector("[data-k=lives]")
        pg.eval_on_selector("[data-k=lives]", "e => { e.value = 7; e.dispatchEvent(new Event('input', { bubbles: true })); }")
        for _ in range(40):
            if ok(api(f"/projects/{pid}/flint/starter-config", "POST", {"starter": "breakout", "dir": dr}, token=orion, project=pid))["values"]["lives"] == 7: break
            time.sleep(0.15)
        else: raise AssertionError("the knob did not reach config.js")
        # tick, add as tasks
        pg.click("#dfl-plan [data-step=loop] .dfl-tick"); pg.wait_for_selector("#dfl-plan [data-step=loop].done")
        for _ in range(30):
            p2 = ok(api(f"/projects/{pid}/design-plans/{plans[0]['key']}", token=orion, project=pid))["plan"]
            if any(s["id"] == "loop" and s["done"] for s in p2["steps"]): break
            time.sleep(0.1)
        else: raise AssertionError("the tick did not reach the server")
        n0 = len(ok(api("/tasks", token=orion, project=pid)).get("tasks", []))
        pg.click("#dfl-addtasks")
        for _ in range(60):
            n1 = len(ok(api("/tasks", token=orion, project=pid)).get("tasks", []))
            if n1 >= n0 + 6: break
            time.sleep(0.15)
        assert n1 == n0 + 6, (n0, n1)
        # Website in the project: the designer opens for this project with the template
        pg.click("#dfl-back"); pg.wait_for_selector("#dfl[data-step=kinds]")
        pg.click("[data-kind=website]"); pg.wait_for_selector(".dfl-tpl[data-tpl=band]")
        pg.click(".dfl-tpl[data-tpl=band]")
        pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=15000)
        assert pg.evaluate("TribeSiteDesigner.state().pid") == pid
        assert any(p["kind"] == "website" and p["template"] == "band" for p in ok(api(f"/projects/{pid}/design-plans", token=orion, project=pid))["plans"])
        ctx.close()
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


def main():
    s = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        try:
            on_this_device(b); print("design flow on this device: ok")
            in_a_tribe(b); print("design flow in a tribe: ok")
        finally: b.close()
    s.shutdown()
    assert not errors, "\n".join(errors)
    print("e2e_design_flow: ok")


if __name__ == "__main__":
    main()
