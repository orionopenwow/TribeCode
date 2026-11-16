"""App Creator (app/ui/appcreator.js, docs/APP-CREATOR.md), end to end with a tribe.

  Part 1 (no server): every template renders every screen with no "undefined", every screen is reachable from the first
    one through links, there are 50+ templates, 50+ components and screens, 50+ looks, and no two looks differ only by colour.
  Part 2 (the real editor):
    - the Design flow's App gallery shows the templates with thumbnails drawn from their real screens; one opens with
      linked screens and saves on the host
    - click words to type (one Undo), click a block and recolour the app; the change reaches every screen
    - link a button to another screen and play the prototype: the tap moves to that screen
    - a Flint sentence adds a settings screen (no AI); "make it dark" changes the look
    - the add-on shelf's app kit installs screens into App Creator
    - Save into the project writes a phone web app whose links work (opened and tapped in a browser); the Expo export
      writes app-expo/ and points phone app mode at it; the brief reaches #agents
    - 390px: no sideways scroll, the rack's buttons and the toolbar are at least 40px
Usage: python app/test/e2e_app_creator.py [--shots]   (--shots writes docs/screenshots/app-creator-*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6460 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
SHOT = ROOT / "docs" / "screenshots"
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
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


def doc(pg): return pg.evaluate("TribeAppCreator.doc()")


def offline_checks():
    out = subprocess.run(["node", "-e", r"""
const C = require(process.argv[1]);
const L = C.templateList(); let bad = [];
for (const t of L) { const d = C.template(t.id);
  for (const s of d.screens) { const h = C.screenHTML(d, s, { edit: true }); if (/undefined|NaN/.test(h)) bad.push(t.id + '/' + s.id); }
  const reach = new Set([d.start]); let ch = true; while (ch) { ch = false; for (const s of d.screens) if (reach.has(s.id)) for (const b of s.blocks) for (const l of Object.values(b.links)) if (!reach.has(l.to)) { reach.add(l.to); ch = true; } }
  d.screens.filter(s => !reach.has(s.id)).forEach(s => bad.push('unreachable ' + t.id + '/' + s.id)); if (d.screens.length < 2) bad.push('one screen ' + t.id); }
const IC = new Set(C.ICON_NAMES), IL = new Set(C.ILL_NAMES);
const names = (o, w) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (typeof v === 'string') { if ((k === 'icon' || k === 'action') && v && !IC.has(v)) bad.push(`no icon ${v} (${w})`); if (k === 'illus' && v && !IL.has(v)) bad.push(`no picture ${v} (${w})`); } else names(v, w); } };
for (const t of C.TEMPLATES) names(t.build(), t.id); for (const [k, K] of Object.entries(C.KITS)) names(K.screens(), 'kit ' + k);
const looks = new Set(C.PRESETS.map(p => { const t = p.theme; return [t.mode, t.font, t.radius, t.density, t.surface, t.motion, t.icons].join(); }));
console.log(JSON.stringify({ templates: L.length, sweet: L.filter(t => t.sweet).length, parts: C.BLOCK_TYPES.length, kits: Object.keys(C.KITS).length, presets: C.PRESETS.length, looks: looks.size, bad }));
""", str(ROOT / "app" / "ui" / "appcreator-core.js")], capture_output=True, text=True, check=True)
    r = json.loads(out.stdout)
    assert not r["bad"], r["bad"][:8]
    assert r["templates"] >= 50, r
    assert r["parts"] + r["kits"] >= 50, r
    assert r["presets"] >= 50 and r["looks"] == r["presets"], r
    assert r["sweet"] >= 5, r
    return r


def main():
    stats = offline_checks()
    tmp = tempfile.mkdtemp(prefix="tribe-apc-", dir="/tmp")
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
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeAppCreator && window.TribeDesignFlow && window.TribeClient && TribeClient.connected()", timeout=20000)

            # ---- the Design flow's App gallery: thumbnails from the real screens, then a template opens
            pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_timeout(400)
            pg.evaluate("TribeDesignFlow.gallery('app')")
            pg.wait_for_selector("#dfl-grid [data-tpl='apc:habits'] .apc-mini .ax-screen", timeout=8000)
            n = pg.locator("#dfl-grid .dfl-apc").count(); assert n >= 50, n
            assert pg.locator("#dfl-grid .dfl-sub").count() == 1, "code starters sit under their own heading"
            if SHOTS: pg.screenshot(path=str(SHOT / "app-creator-gallery.png"))
            pg.click("#dfl-grid [data-tpl='apc:habits']")
            pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            d = doc(pg); assert d["template"] == "habits" and len(d["screens"]) >= 4, d["screens"]
            links = sum(len(bk["links"]) for s in d["screens"] for bk in s["blocks"]); assert links >= 5, links
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config && j.config.template === 'habits')", timeout=6000)
            if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT / "app-creator-editor.png"))
            # pass 3: Tab stays inside the editor; the app behind it is not reachable while it is open
            pg.evaluate("document.activeElement && document.activeElement.blur()")
            for _ in range(25): pg.keyboard.press("Tab")
            assert pg.evaluate("document.querySelector('#apc').contains(document.activeElement)"), pg.evaluate("document.activeElement.id || document.activeElement.className")

            # ---- click words to type: one Undo takes it back
            h1 = pg.locator("#apc .apc-edit h1[data-e]").first
            h1.click(); pg.keyboard.press("Control+a"); pg.keyboard.type("Hi Sam")
            pg.evaluate("document.activeElement.blur()")
            pg.wait_for_function("TribeAppCreator.doc().screens[0].blocks[0].props.title === 'Hi Sam'", timeout=3000)
            pg.evaluate("TribeAppCreator.undo()")
            pg.wait_for_function("TribeAppCreator.doc().screens[0].blocks[0].props.title === 'Good morning, Maya'", timeout=3000)
            # pass 3: words typed just before the tab reloads are saved (they used to wait 500 ms and be lost)
            h1 = pg.locator("#apc .apc-edit h1[data-e]").first
            h1.click(); pg.keyboard.press("Control+a"); pg.keyboard.type("Kept on reload"); pg.reload()
            pg.wait_for_function("window.TribeAppCreator && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.screens[0].blocks[0].props.title === 'Kept on reload')", timeout=6000)
            pg.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)

            # ---- recolour from Look: every screen follows
            pg.click("#apc [data-tab='look']"); pg.click("#apc [data-acc='#2F5BEA']")
            pg.wait_for_function("TribeAppCreator.doc().theme.accent === '#2F5BEA'")
            col = pg.evaluate("getComputedStyle(document.querySelector('#apc .apc-edit')).getPropertyValue('--ax-accent').trim()"); assert col.upper() == "#2F5BEA", col
            pg.click("#apc [data-tab='screens']"); pg.click("#apc [data-go='stats']")
            assert pg.evaluate("getComputedStyle(document.querySelector('#apc .apc-edit')).getPropertyValue('--ax-accent').trim()").upper() == "#2F5BEA"
            pg.click("#apc [data-pre='midnight']") if pg.locator("#apc [data-pre='midnight']").count() else None
            pg.click("#apc [data-tab='look']"); pg.click("#apc [data-pre='midnight']")
            pg.wait_for_function("TribeAppCreator.doc().theme.mode === 'dark' && TribeAppCreator.doc().theme.font === 'tech'")

            # ---- select a block, link it, play the prototype
            pg.click("#apc [data-tab='screens']"); pg.click("#apc [data-go='me']")
            pg.locator("#apc .apc-edit .ax-b-profile").click(position={"x": 30, "y": 30})
            pg.wait_for_function("(TribeAppCreator.state().sel || {}).block")
            assert pg.locator("#apc #apc-bar button").first.bounding_box()["height"] >= 40
            pg.select_option("#apc #apc-linkto", "stats")
            pg.wait_for_function("Object.values(TribeAppCreator.doc().screens.find(s => s.id === 'me').blocks.find(b => b.type === 'profile').links).some(l => l.to === 'stats')")
            pg.click("#apc-insp [data-how='sheet']")
            pg.wait_for_function("Object.values(TribeAppCreator.doc().screens.find(s => s.id === 'me').blocks.find(b => b.type === 'profile').links)[0].how === 'sheet'")
            pg.click("#apc-play"); pg.wait_for_selector("#apc.apc-playing")
            pg.locator("#apc #apc-stage .ax-screen[data-screen='me'] .ax-prof .ax-btn").click()
            pg.wait_for_function("TribeAppCreator.state().screen === 'stats'", timeout=4000)
            pg.locator("#apc #apc-stage .ax-screen[data-screen='stats'] .ax-tab").first.click()
            pg.wait_for_function("TribeAppCreator.state().screen === 'today'", timeout=4000)
            pg.locator("#apc #apc-stage .ax-screen[data-screen='today'] [data-check]").nth(3).click()
            assert "done" in pg.locator("#apc #apc-stage .ax-screen[data-screen='today'] [data-check]").nth(3).get_attribute("class")
            if SHOTS: pg.screenshot(path=str(SHOT / "app-creator-play.png"))
            pg.keyboard.press("Escape"); pg.wait_for_selector("#apc:not(.apc-playing) .apc-edit")

            # ---- Flint, no AI
            pg.fill("#apc-ask-in", "add a settings screen"); pg.press("#apc-ask-in", "Enter")
            pg.wait_for_function("TribeAppCreator.doc().screens.some(s => s.id.startsWith('settings') && s.blocks.some(b => b.type === 'settings'))", timeout=4000)
            assert pg.evaluate("TribeAppCreator.doc().screens.find(s => s.id.startsWith('settings')).tab") is True, "the settings screen joins the tab bar"
            pg.fill("#apc-ask-in", "make it light"); pg.press("#apc-ask-in", "Enter")
            pg.wait_for_function("TribeAppCreator.doc().theme.mode === 'light'", timeout=3000)
            pg.fill("#apc-ask-in", "rounder"); pg.press("#apc-ask-in", "Enter"); pg.wait_for_timeout(200)
            assert doc(pg)["theme"]["radius"] == "soft", doc(pg)["theme"]   # Midnight is sharp; one step rounder
            pg.fill("#apc-ask-in", "use the android look"); pg.press("#apc-ask-in", "Enter")
            pg.wait_for_function("TribeAppCreator.doc().platform === 'android'", timeout=3000)

            # ---- the add-on shelf's app kit lands in App Creator
            r = pg.evaluate("TribeMarket.use('ak-onboarding')")
            pg.wait_for_function("TribeAppCreator.doc().screens[0].blocks.some(b => b.type === 'onboarding')", timeout=5000)
            assert pg.evaluate("TribeAppCreator.doc().start") == pg.evaluate("TribeAppCreator.doc().screens[0].id")

            # ---- export: the phone web app in the project, opened and tapped; Expo; the brief
            r = pg.evaluate("TribeAppCreator.export('pwa-save')")
            assert r and r.get("folder") == "app-web" and any(x.endswith("index.html") for x in r["written"]), r
            proj = api(f"/projects", token=tok)[1]["projects"][0]
            repo = Path(proj.get("repo") or os.path.join(tmp, "workspaces", pid))
            idx = repo / "app-web" / "index.html"; assert idx.exists(), idx
            assert (repo / "app-web" / "manifest.webmanifest").exists() and (repo / "app-web" / "sw.js").exists()
            web = b.new_page(viewport={"width": 390, "height": 844}); watch(web, "pwa")
            web.goto(idx.as_uri()); web.wait_for_selector(".ax-screen:not([style*='none'])")
            # the onboarding kit is first: Get started, then the habit list, then a tab
            for _ in range(3):
                web.locator(".ax-screen:not([style*='none']) [data-next]").click(); web.wait_for_timeout(450)
            web.wait_for_function("[...document.querySelectorAll('.ax-screen')].some(s => s.style.display !== 'none' && s.dataset.screen === 'today')", timeout=4000)
            web.locator(".ax-screen[data-screen='today'] .ax-tab").nth(1).click()
            web.wait_for_function("document.querySelector('.ax-screen[data-screen=\"stats\"]').style.display !== 'none'", timeout=4000)
            web.close()
            r = pg.evaluate("TribeAppCreator.export('expo-save')")
            assert r.get("folder") == "app-expo" and (repo / "app-expo" / "App.js").exists() and (repo / "app-expo" / "design.json").exists(), r
            pa = api("/phoneapp", token=tok)[1]; assert pa.get("folder") == "app-expo" and pa.get("stack") == "expo", pa
            r = pg.evaluate("TribeAppCreator.export('brief')"); assert r.get("sent") or r.get("task"), r
            if r.get("task"):   # no AI helper connected in this tribe: the brief waits as a task
                ts = api("/tasks", token=tok)[1].get("tasks", []); t = next((t for t in ts if t["title"].startswith("Build “")), None)
                assert t and "## Screens" in (t.get("body") or ""), [x["title"] for x in ts]
            else:
                msgs = api("/agents/channel?limit=10", token=tok)[1].get("messages", [])
                assert any("Build “" in (m.get("text") or "") for m in msgs), [m.get("text", "")[:60] for m in msgs]

            # ---- the Launch kit's view of the screens
            sc = pg.evaluate("TribeAppCreator.screens().then(l => l.map(x => ({ id: x.id, name: x.name, html: x.html.length })))")
            assert len(sc) >= 5 and all(x["html"] > 200 for x in sc), sc
            ok = pg.evaluate("TribeAppCreator.screens().then(l => l[1].render(document.createElement('canvas'), 195, 422)).then(c => c.width === 195)")
            assert ok
            pg.evaluate("TribeAppCreator.close()")
            assert pg.evaluate("[...document.body.children].every(e => !e.inert)"), "pass 3: closing gives the app back (nothing left inert)"
            # pass 3: a gallery template over the app the tribe already has asks first; Keep my app changes nothing
            name0 = pg.evaluate(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.template)")
            pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_timeout(300); pg.evaluate("TribeDesignFlow.gallery('app')")
            pg.wait_for_selector("#dfl-grid [data-tpl='apc:notes']", timeout=8000); pg.click("#dfl-grid [data-tpl='apc:notes']")
            pg.wait_for_selector("#apc-replace #apc-keep", timeout=8000); pg.click("#apc-keep"); pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            assert pg.evaluate("TribeAppCreator.doc().template") == name0, "Keep my app keeps it"
            pg.evaluate("TribeAppCreator.close()")

            # ---- phones: 390px
            m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); m.add_init_script(settings_js("Mara", tok, pid))
            mp = m.new_page(); watch(mp, "phone")
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeAppCreator && TribeClient.connected()", timeout=20000)
            mp.evaluate("TribeAppCreator.open({ template: 'trip' })"); mp.wait_for_selector("#apc .apc-edit .ax-screen")
            assert not mp.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"), "no sideways scroll at 390px"
            for btn in mp.locator("#apc-rack button").all():
                bb = btn.bounding_box(); assert bb["height"] >= 40, bb
            for sel in ["#apc-close", "#apc-play", "#apc-export"]:
                bb = mp.locator(sel).bounding_box(); assert bb["height"] >= 40 and bb["width"] >= 40, (sel, bb)
            mp.click("#apc-rack [data-sheet='look']"); mp.wait_for_selector("#apc-sheet [data-pre]")
            mp.locator("#apc-sheet [data-pre='paper']").click(); mp.wait_for_function("TribeAppCreator.doc().theme.preset === 'paper'")
            if SHOTS: mp.screenshot(path=str(SHOT / "app-creator-phone-look.png"))
            mp.click("#apc-sheet-x")
            mp.locator("#apc .apc-edit .ax-b-header h1").first.click(position={"x": 4, "y": 4}); mp.wait_for_timeout(150)
            bar = mp.locator("#apc-bar")
            if bar.is_visible():
                for btn in bar.locator("button").all():
                    bb = btn.bounding_box(); assert bb["height"] >= 40, bb
            if SHOTS: mp.screenshot(path=str(SHOT / "app-creator-phone.png"))
            m.close()
            # the standout demos, one picture each, for the website (only with --shots)
            if SHOTS:
                s = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
                sp = s.new_page(); sp.goto(BASE + "/?skipIntro=1"); sp.wait_for_function("window.TribeAppCore && window.TribeAppCreator", timeout=20000)
                for tid in sp.evaluate("TribeAppCore.templateList().filter(t => t.sweet).map(t => t.id)"):
                    sp.evaluate("""id => { const C = TribeAppCore, d = C.template(id); document.body.innerHTML = `<style>${C.css(d, { scope: '.ax' })} html,body{margin:0}</style><div class="ax" ${C.attrs(d)} style="position:fixed;inset:0">${C.screenHTML(d, C.findScreen(d, d.start))}</div>`; }""", tid)
                    sp.wait_for_timeout(250); sp.screenshot(path=str(SHOT / f"app-creator-demo-{tid}.png"))
                s.close()
            b.close()
        assert not errors, errors[:6]
        print(f"e2e_app_creator: OK ({stats['templates']} templates, {stats['parts']} parts + {stats['kits']} screen kits, {stats['presets']} looks; gallery, typing + undo, recolour, link + play, Flint, shelf kit, web app export tapped, Expo, brief, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
