"""Newcomer start (feat/newcomer-start). A fresh server makes its first project on its own ("My Tribe"). While that
project is untouched and the only one, Home is the one-sentence start: "What do you want to make?" fills THAT project
(its name, vision and a first version) instead of opening an empty dashboard or making a second project. An existing
tribe with real content keeps its Quick start, and a friend who joins lands in the project as before.
The sidebar leaves out Set up company, Agents Hub and Agent fleet while it is just you (no second person, no AI helper,
no company); they come back once someone joins or an AI helper is added, and Ctrl K finds them all along.
Automated browsers opt in with ?newcomer=1 (newcomer.js). Screenshots: /tmp/newcomer-home-1440.png,
/tmp/newcomer-sidebar-390.png and $NC_SHOTS."""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT_A, PORT_B = 5155 + OFF, 5156 + OFF
SHOTS = Path(os.environ.get("NC_SHOTS") or tempfile.mkdtemp(prefix="tribe-nc-shots-")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []


def api(port, path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(f"http://localhost:{port}/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def start(port, tmp):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp), "--ollama", "http://localhost:9"],
                           stdout=open(str(tmp) + ".log", "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(100):
        try:
            if api(port, "/health")[0] == 200: return srv
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError("server did not start")


def named(ctx, name):
    ctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r})) } catch (e) {}" % name)   # try: it also runs in sandboxed preview frames


def signed_in(ctx, port, token, name):
    ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:{json.dumps(name)}, onboarded:true, server:{{url:'http://localhost:{port}', token:'{token}'}}}})); }} catch (e) {{}}")


def watch(pg):
    pg.on("pageerror", lambda e: errors.append(str(e)))


def visible(pg, sel):
    return pg.evaluate("s => { const e = document.querySelector(s); return !!e && !!(e.offsetWidth || e.offsetHeight) }", sel)


def palette_finds(pg, words):
    pg.keyboard.press("Control+k"); pg.wait_for_selector("#pal-input", state="visible", timeout=5000)
    pg.fill("#pal-input", words); pg.wait_for_timeout(250)
    txt = pg.inner_text("#pal-list"); pg.keyboard.press("Escape")
    return words.lower() in txt.lower()


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-nc-", dir="/tmp"))
    srv_a = start(PORT_A, tmp / "a"); srv_b = start(PORT_B, tmp / "b")
    A, B = f"http://localhost:{PORT_A}", f"http://localhost:{PORT_B}"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- 1. a fresh server start: Home is the sentence, not the auto-made dashboard
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); named(ctx, "Robin"); pg = ctx.new_page(); watch(pg)
            pg.goto(A + "/?skipIntro=1&newcomer=1")
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && (TribeClient.state().me || {}).role === 'host'", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token")
            pj = ok(api(PORT_A, "/projects", token=tok))["projects"]
            assert len(pj) == 1 and pj[0].get("untouched") is True, f"the server's own first project is untouched: {pj}"
            first = pj[0]["id"]
            pg.wait_for_selector("#view-hub:not(.hidden) #hub-idea", timeout=15000)
            pg.wait_for_timeout(1200)
            assert pg.evaluate("document.body.dataset.view") == "hub", "it stays on Home (no jump to the empty dashboard)"
            assert pg.locator("#hub-new, #hub-resume, #hub-instant").count() == 0, "no Quick start for an empty first project"
            assert pg.locator("#hub-blank-open").count() == 1 and "My Tribe" in pg.inner_text("#hub-blank-open"), "a quiet way past it"
            assert pg.locator("#hub-join").count() == 1
            # the newcomer's sidebar: no Agent fleet on Home
            assert pg.evaluate("document.body.classList.contains('nc-quiet')"), "quiet sidebar while it's just you"
            assert pg.locator("#nest-hub").count() == 1 and not visible(pg, "#nest-fleet"), "Agent fleet waits"
            assert palette_finds(pg, "Agent fleet") and palette_finds(pg, "Agents Hub"), "Ctrl K still finds them"
            pg.mouse.move(700, 450); pg.screenshot(path="/tmp/newcomer-home-1440.png"); pg.screenshot(path=str(SHOTS / "nc-1-home.png"))

            # ---- 2. the sentence fills that project: one project, the vision, a first version
            pg.fill("#hub-idea", "A website for my friend's bakery"); pg.click("#hub-idea-go")
            pid, name = None, None
            for _ in range(120):
                pj = ok(api(PORT_A, "/projects", token=tok))["projects"]
                if len(pj) == 1 and pj[0]["name"] != "My Tribe": pid, name = pj[0]["id"], pj[0]["name"]; break
                time.sleep(0.25)
            assert pid == first, f"the sentence filled the first project, no second one: {pj}"
            for _ in range(60):   # the name comes first, then the vision
                vis = ok(api(PORT_A, "/vision", token=tok, project=pid)).get("text", "")
                if vis: break
                time.sleep(0.25)
            assert "bakery" in vis, f"the vision is the sentence: {vis!r}"
            pj = ok(api(PORT_A, "/projects", token=tok))["projects"]
            assert len(pj) == 1 and not pj[0].get("untouched"), pj
            cfg = None
            for _ in range(120):
                cfg = (api(PORT_A, f"/projects/{pid}/site-config", token=tok)[1] or {}).get("config")
                if cfg: break
                time.sleep(0.25)
            assert cfg, "a first version (the website) was made"
            pg.wait_for_function("TribeProjects.list().length === 1 && !TribeProjects.list()[0].untouched", timeout=10000)
            pg.screenshot(path=str(SHOTS / "nc-2-first-version.png"))
            assert len(ok(api(PORT_A, "/projects", token=tok))["projects"]) == 1, "exactly one project"
            # Home now has the project (Quick start), not the sentence
            pg.keyboard.press("Escape"); pg.evaluate("document.querySelectorAll('#fl-look, .flk, [data-firstlook]').forEach(e => e.remove())")
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#view-hub:not(.hidden) #hub-hero", timeout=10000)
            pg.wait_for_function("!document.querySelector('#hub-idea')", timeout=10000)

            # in the project the sidebar is still quiet: no Agents Hub, no Set up company
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_selector("#nest-chat", state="visible", timeout=10000)
            pg.wait_for_timeout(800)
            assert pg.evaluate("document.body.classList.contains('nc-quiet')")
            assert not visible(pg, "#nest-ws-agents") and not visible(pg, "#nest-company"), "Agents Hub and Set up company wait"
            assert visible(pg, "#nest-chat") and visible(pg, "#nest-docs"), "the rest of the sidebar is there"
            assert palette_finds(pg, "Agents Hub"), "Ctrl K finds the Agents Hub"
            pg.evaluate("TribeShell.go('ws-agents')"); pg.wait_for_selector("#view-coord:not(.hidden)", timeout=8000)
            pg.wait_for_timeout(300)
            assert visible(pg, "#nest-ws-agents"), "its row shows while its page is open"
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_timeout(300)

            # ---- 3. an AI helper joins: the rows come back
            ok(api(PORT_A, "/agents", "POST", token=tok, project=pid), "add an AI helper")
            pg.wait_for_function("!document.body.classList.contains('nc-quiet')", timeout=10000)
            assert visible(pg, "#nest-ws-agents"), "Agents Hub is back"
            pg.wait_for_function("(() => { const e = document.querySelector('#nest-company'); return !e || !!(e.offsetWidth || e.offsetHeight) || e.classList.contains('hidden'); })()", timeout=5000)

            # ---- 4. a friend joins the tribe: lands in the project as before, never on the sentence
            inv = ok(api(PORT_A, "/invites", "POST", {"role": "builder", "maxUses": 3, "project": pid}, token=tok))["invite"]["code"]
            friend = ok(api(PORT_A, "/join", "POST", {"code": inv, "name": "Kai"}))["token"]
            fctx = b.new_context(viewport={"width": 1280, "height": 800}); signed_in(fctx, PORT_A, friend, "Kai"); fp = fctx.new_page(); watch(fp)
            fp.goto(A + "/?skipIntro=1&newcomer=1"); fp.wait_for_function("TribeClient.connected()", timeout=20000)
            fp.wait_for_selector("#view-home:not(.hidden)", timeout=15000)
            fp.wait_for_timeout(800)
            assert fp.locator("#hub-idea").count() == 0
            assert not fp.evaluate("document.body.classList.contains('nc-quiet')"), "a friend's tribe has people: the full sidebar"
            fctx.close(); ctx.close()

            # ---- 5. another fresh tribe: a second person alone brings the rows back; real content keeps Quick start
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); named(ctx, "Ana"); ph = ctx.new_page(); watch(ph)
            ph.goto(B + "/?skipIntro=1&newcomer=1")
            ph.wait_for_function("TribeClient.connected() && (TribeClient.state().me || {}).role === 'host'", timeout=20000)
            ph.wait_for_selector("#view-hub:not(.hidden) #hub-idea", timeout=15000)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "fits 390px"
            ph.evaluate("document.body.classList.add('drawer-open')"); ph.wait_for_selector("#nest-hub", state="visible", timeout=5000); ph.wait_for_timeout(500)   # Home on a phone has no menu button: the sidebar as a drawer
            assert ph.evaluate("document.body.classList.contains('nc-quiet')") and not visible(ph, "#nest-fleet")
            ph.screenshot(path="/tmp/newcomer-sidebar-390.png"); ph.evaluate("document.body.classList.remove('drawer-open')")
            small = ph.evaluate("[...document.querySelectorAll('#hub-idea-go, #hub-join, #hub-blank-open')].filter(e => e.offsetHeight).map(e => [e.id, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 40)")
            assert not small, f"40px targets: {small}"
            btok = ph.evaluate("TribeStore.get().server.token")
            bpid = ok(api(PORT_B, "/projects", token=btok))["projects"][0]["id"]
            # real content: a task. The project is no longer blank, Home shows Quick start
            ok(api(PORT_B, "/tasks", "POST", {"title": "Bake the first loaf"}, token=btok, project=bpid), "task")
            assert not ok(api(PORT_B, "/projects", token=btok))["projects"][0].get("untouched"), "a task makes it a real project"
            ph.reload(); ph.wait_for_function("TribeClient.connected()", timeout=20000)
            ph.evaluate("TribeHub.open('home')"); ph.wait_for_selector("#view-hub:not(.hidden) #hub-hero", timeout=10000)
            ph.wait_for_function("TribeProjects.loaded()", timeout=10000); ph.wait_for_timeout(600)
            assert ph.locator("#hub-idea").count() == 0 and ph.locator("#hub-resume, #hub-new").count() >= 1, "an existing tribe keeps Quick start"
            assert len(ok(api(PORT_B, "/projects", token=btok))["projects"]) == 1
            # a second person (no AI helper): the rows come back
            assert ph.evaluate("document.body.classList.contains('nc-quiet')")
            inv = ok(api(PORT_B, "/invites", "POST", {"role": "builder", "maxUses": 1, "project": bpid}, token=btok))["invite"]["code"]
            ok(api(PORT_B, "/join", "POST", {"code": inv, "name": "Lee"}))
            ph.wait_for_function("!document.body.classList.contains('nc-quiet')", timeout=10000)
            ctx.close(); b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print(f"ok e2e_newcomer_start (fresh start shows the sentence, it fills the first project with a vision and a first version, quiet sidebar until an AI helper or a friend, Ctrl K finds them, friends land as before, real tribes keep Quick start)  shots: {SHOTS}")
    finally:
        srv_a.terminate(); srv_b.terminate()


if __name__ == "__main__":
    main()
