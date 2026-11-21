"""The create flow asks "What are you making?" (feat/vision-create: app/ui/tribenew.js, projects.js keepIdea).

One optional sentence on the first step, right under the name, with three examples to tap. It never blocks creating.
With a sentence the new project gets the same things the sentence box on Home gives: the sentence is the one line under
the project's name on the dashboard (the vision), a first version is made from it, and the suggested tasks come from it.

1. A computer where TribeCode runs (a page its own server serves, a fresh open):
   - a sentence typed on Home is already in the sheet when "Start with a name instead" opens it (never typed twice)
   - no name + a sentence: the name comes from the sentence; the tribe is made on this computer, and after it opens the
     first version shows; the server's vision is the sentence; the dashboard's line shows it; no second vision box and
     no "Start your first project" card asking again
   - inside the tribe, a new project with a name and a sentence: Invite friends still opens (after the first version),
     the suggested tasks come from the sentence
   - a name and no sentence: made as before, no first version, the card is there
2. The website (plain files, the tribe is kept in this browser), 1440: a tapped example fills the sentence; nothing
   typed at all says so calmly; it is made in this browser with the first version saved on this device.
3. A phone, 390: the step fits with no sideways scroll, the examples and buttons are 40px tall; a name alone creates.
No console errors.
Usage: python app/test/e2e_vision_create.py [--shots DIR]
"""
import functools, http.server, os, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5946 + OFF; WEB = 5947 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
SEED = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false}));localStorage.setItem('tribecode.personalize.done','1');localStorage.setItem('tribecode.flinttour.offered','1');}catch(e){}"
BAKERY = "A website for my friend’s bakery"
RUN = "A habit tracker app for my running club with streaks and a weekly leaderboard"
errors = []


def watch(pg, tag):
    pg.on("console", lambda m: errors.append(f"{tag}: {m.text}") if m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text else None)
    pg.on("pageerror", lambda e: errors.append(f"{tag}: {e}"))

def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, f"vision-create-{name}.png"))

def static_server():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    class Quiet(http.server.ThreadingHTTPServer):
        def handle_error(self, *a): pass   # a page that closed mid-download
    srv = Quiet(("127.0.0.1", WEB), functools.partial(H, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

def first_version(pg):
    pg.wait_for_selector("#fpv .fpv-acts", timeout=60000); pg.wait_for_timeout(900)
    return pg.evaluate("(() => { const s = TribeFirstLook.state(); return { pid: s.pid, kind: s.kind, idea: s.idea, name: s.name, saved: s.saved }; })()")

def to_dash(pg):
    pg.click("#fpv [data-fpv=close]"); pg.wait_for_selector("#fpv", state="detached")
    pg.wait_for_selector("#pj-bio", timeout=15000); pg.wait_for_timeout(600)

def one_vision_box(pg):
    assert pg.locator("#ock-vis-in, [data-ock-vis], #pj-vtext, #av-cats").count() == 0, "no second vision box"


def computer(p, tmp):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED)
        pg = ctx.new_page(); watch(pg, "computer")
        pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub")
        pg.wait_for_function("window.TribeNew && window.TribeFirstLook && window.TribeApp && TribeApp.fresh && TribeApp.fresh()", timeout=20000)
        pg.wait_for_selector("#hub-idea", timeout=20000); pg.wait_for_timeout(500)

        # ---- typed on Home, then "Start with a name instead": the sentence is already there
        pg.fill("#hub-idea", BAKERY); pg.click("#hub-host"); pg.wait_for_selector("#tn #tn-vis", state="visible")
        assert pg.input_value("#tn-vis") == BAKERY, "the sentence from Home is in the sheet"
        step = pg.inner_text("#tn")
        assert "What are you making?" in step and "optional" in step, step[:300]
        for jargon in ("repo", "host", "sync", "ship", "server"): assert jargon not in step.lower().replace("ghost", ""), ("plain words on the step", jargon)
        assert pg.locator("#tn [data-tn-idea]").count() == 3, "three examples to tap"
        assert pg.evaluate("TribeNew.state().step") == 1 and pg.locator("#tn .tn-prog li").count() == 2, "not an extra screen"
        print("ok  the sentence typed on Home is already in the create sheet; one optional question on step 1")

        # ---- no name, a sentence: the name comes from it, and the tribe is made on this computer
        assert pg.input_value("#tn-name") == ""
        pg.click("#tn-create"); pg.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=30000)
        name = pg.evaluate("TribeNew.state().name"); want = pg.evaluate(f"TribeProjects.nameFromIdea({BAKERY!r})")
        assert name == want == "Bakery Website", (name, want)
        assert pg.evaluate("TribeNew.state().created.where") == "computer"
        pg.click("#tn-done")
        pg.wait_for_function("window.TribeClient && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active())", timeout=30000)
        r = first_version(pg); assert r["idea"] == BAKERY and r["kind"] == "site" and r["saved"] and r["name"] == name, r
        vis = pg.evaluate("TribeClient.api('/vision').then(d => d.text)")
        assert vis.startswith(f"# {name}") and BAKERY in vis, vis
        cfg = pg.evaluate(f"TribeClient.api('/projects/{r['pid']}/site-config').then(d => !!(d && d.config))"); assert cfg, "the first version is saved in the tribe"
        to_dash(pg)
        assert BAKERY in pg.text_content("#pj-bio"), pg.text_content("#pj-bio")
        one_vision_box(pg); assert pg.locator("#tn-first").count() == 0, "the card does not ask for a sentence again"
        print(f"ok  on this computer: '{name}' named from the sentence; the sentence is the vision and the dashboard line; a first version (website) is saved")

        # ---- inside the tribe: a new project with a name and a sentence; Invite friends still opens, after the first version
        pg.evaluate("TribeProjects.openNew()"); pg.wait_for_selector("#tn #tn-vis", state="visible")
        assert pg.input_value("#tn-vis") == "", "nothing left over"
        pg.fill("#tn-name", "Run Club"); pg.fill("#tn-vis", RUN); shot(pg, "1440-in-tribe")
        pg.click("#tn-create"); pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=20000)
        pg.click("#tn-invite")
        r2 = first_version(pg); assert r2["idea"] == RUN and r2["kind"] == "app" and r2["name"] == "Run Club" and r2["pid"] != r["pid"], r2
        assert not pg.evaluate("TribeInvite.isOpen()"), "one thing at a time"
        vis = pg.evaluate("TribeClient.api('/vision').then(d => d.text)"); assert vis.startswith("# Run Club") and RUN in vis, vis
        pg.click("#fpv [data-fpv=close]"); pg.wait_for_selector("#fpv", state="detached")
        pg.wait_for_function("TribeInvite.isOpen()", timeout=8000); pg.evaluate("TribeInvite.close()")
        pg.wait_for_selector("#pj-bio", timeout=15000); pg.wait_for_timeout(600)
        assert RUN in pg.text_content("#pj-bio"); one_vision_box(pg)
        pg.wait_for_function("[...document.querySelectorAll('#fd .fd-go[data-fd-act^=\\'task:\\']')].length > 0", timeout=15000)   # feat/dash-layout: after a first version they are Flint's Do this next
        sg = pg.evaluate("[...document.querySelectorAll('#fd .fd-go[data-fd-act^=\\'task:\\']')].map(x => x.dataset.fdAct.slice(5))")
        assert "Let members log a run" in sg, sg
        print("ok  in a tribe: the first version (app), then the invite sheet; suggested tasks come from the sentence:", sg[:3])

        # ---- a name and no sentence: as before
        pg.evaluate("void TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible")   # (openNew may first show the calm Premium note on a third project)
        pg.fill("#tn-name", "Quiet One"); pg.click("#tn-create"); pg.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=20000)
        pg.click("#tn-done"); pg.wait_for_selector("#tn", state="detached")
        pg.wait_for_function("(TribeProjects.cur() || {}).name === 'Quiet One'", timeout=15000); pg.wait_for_timeout(1500)
        assert pg.locator("#fpv").count() == 0, "no sentence, no first version"
        assert pg.evaluate("TribeClient.api('/vision').then(d => (d.text || '').trim())") == "", "no vision was made up"
        pg.wait_for_selector("#tn-first", timeout=8000)
        print("ok  a name and no sentence: made as before, with the 'Start your first project' card")
        b.close()
    finally:
        srv.terminate()


def website(p):
    static_server()
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED)
    pg = ctx.new_page(); watch(pg, "web")
    pg.goto(f"http://localhost:{WEB}/?skipIntro=1"); pg.wait_for_function("window.TribeNew && window.TribeFirstLook && window.TribeProjects", timeout=20000); pg.wait_for_timeout(800)
    pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-vis", state="visible")
    # nothing typed: said calmly, nothing made
    pg.click("#tn-create"); assert pg.is_visible("#tn-err") and pg.evaluate("TribeNew.state().step") == 1
    assert "or say what you’re making" in pg.inner_text("#tn-err")
    # an example, tapped
    pg.click("#tn [data-tn-idea] >> nth=1"); idea = pg.input_value("#tn-vis"); assert idea == "An app that tracks our habits", idea
    assert not pg.is_visible("#tn-err")
    shot(pg, "step")
    pg.click("#tn-create"); pg.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=20000)
    assert pg.evaluate("TribeNew.state().created.where") == "device" and pg.evaluate("TribeOffline.solo()")
    pg.click("#tn-done")
    r = first_version(pg); assert r["idea"] == idea and r["kind"] == "app" and r["saved"], r
    assert idea in pg.evaluate("TribeClient.api('/vision').then(d => d.text)")
    assert pg.evaluate(f"!!TribePhoneLocal.designs()['{r['pid']}'].app"), "the first version is saved on this device"
    to_dash(pg); assert idea in pg.text_content("#pj-bio"); one_vision_box(pg); assert pg.locator("#tn-first").count() == 0
    print(f"ok  in this browser: a tapped example made '{r['name']}', its vision line and a first version saved on this device")
    b.close()

    # ---- a phone, 390
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); ctx.add_init_script(SEED)
    ph = ctx.new_page(); watch(ph, "phone")
    ph.goto(f"http://localhost:{WEB}/?skipIntro=1"); ph.wait_for_function("window.TribeNew && window.TribeFirstLook && window.TribeProjects", timeout=20000); ph.wait_for_timeout(800)
    ph.evaluate("TribeNew.open()"); ph.wait_for_selector("#tn #tn-vis", state="visible"); ph.wait_for_timeout(400)
    m = ph.evaluate("""(() => { const tn = document.querySelector('#tn'), r = e => e.getBoundingClientRect();
      return { doc: document.documentElement.scrollWidth, sheet: tn.scrollWidth, cw: tn.clientWidth, right: Math.max(...[...tn.querySelectorAll('*')].map(e => r(e).right)),
        small: [...tn.querySelectorAll('[data-tn-idea], #tn-create, #tn-cancel, #tn-vis, #tn-name')].filter(e => r(e).height < 40).map(e => e.id || e.textContent) }; })()""")
    assert m["doc"] <= 390 and m["sheet"] <= m["cw"] and m["right"] <= 390.5, ("no sideways scroll", m)
    assert not m["small"], ("40px targets", m["small"])
    ph.fill("#tn-vis", BAKERY); shot(ph, "phone"); ph.fill("#tn-vis", "")
    ph.fill("#tn-name", "Pocket Crew"); ph.click("#tn-create"); ph.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=20000)
    ph.click("#tn-done"); ph.wait_for_selector("#tn", state="detached"); ph.wait_for_timeout(1500)
    assert ph.locator("#fpv").count() == 0 and ph.evaluate("TribeOffline.solo()"), "a name alone still creates"
    assert ph.evaluate("document.documentElement.scrollWidth") <= 390
    print("ok  phone 390: the step fits, 40px targets, and a name alone still creates")
    b.close()


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-vcreate-"))
    with sync_playwright() as p:
        computer(p, tmp)
        website(p)
    if errors:
        print("console errors:"); [print("  ", e) for e in errors[:20]]; sys.exit(1)
    print("PASS e2e_vision_create")

if __name__ == "__main__":
    main()
