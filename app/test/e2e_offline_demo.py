"""The offline demo tribe (app/ui/offline.js): start a pretend tribe from Home with NO tribe server at all (the page is
served by a plain static file server over app/ui), then project -> chat (@claude answers) -> a task (the pretend
Claude picks it up) -> a note -> a picture in Files -> reload keeps everything -> Reset and Leave put your own
settings back exactly. Desktop at 1440 and a phone at 390, which then goes offline (set_offline) and reloads.
No console errors, no sideways scroll. Usage: python app/test/e2e_offline_demo.py [--shots]
"""
import base64, functools, http.server, json, os, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 4995 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
# Your real settings before the demo: a saved server and no sign-in (nothing to reach in this test).
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGP8z8DAQAxgIk4ZqIJRDaMahqcGAA6eAh/0Jb9QAAAAAElFTkSuQmCC")

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()

def serve():
    h = functools.partial(Quiet, directory=str(UI))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))
    page.on("requestfailed", lambda r: "ERR_ABORTED" not in str(r.failure) and errors.append(f"{tag} failed: {r.url} {r.failure}"))   # a reload cancels requests in flight: not an error

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => [...document.querySelectorAll(s)].some(e => e.textContent.includes(t))", arg=[sel, text], timeout=timeout)

def settings(page): return page.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1'))")

def sideways(page, tag):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{tag}: sideways scroll ({page.evaluate('document.documentElement.scrollWidth')} > {page.evaluate('innerWidth')})"

def v028(page, tag):
    """v0.28 in the demo (offline.js + demo/data.json): the Design canvas with Flint beside it, comment pins and the
    website template gallery all answer with no server."""
    page.evaluate("location.hash = '#/canvas'")
    page.wait_for_function("window.TribeCanvas && TribeCanvas.state().open && document.querySelector('#cv-file-t').textContent.length > 0", timeout=15000)
    page.wait_for_selector("#cv-mode [data-mode=simple]", timeout=10000)
    page.click("#cv-mode [data-mode=simple]")
    page.wait_for_selector("#fp-in", state="visible", timeout=8000)
    page.fill("#fp-in", "make a login screen for Ember")
    page.press("#fp-in", "Enter")
    page.wait_for_function("TribeCanvas.state().nodes.some(n => /Ember/.test(n.name || ''))", timeout=15000)
    page.wait_for_function("TribeClient.api('/canvas/main').then(r => Object.values(r.file.nodes).some(n => /Ember/.test(n.name || '')))", timeout=8000)   # the edit was kept
    page.wait_for_function("TribeClient.api('/canvaschat/main').then(r => r.items.some(i => i.role === 'flint'))", timeout=8000)
    if "--shots" in sys.argv: page.screenshot(path=str(SHOTS / "offline-demo-desktop-design.png"))
    sideways(page, tag + " design")
    page.click("#cv-mode [data-mode=advanced]")   # leave the next person (and the tests) in the familiar layout
    page.click("#cv-back")
    page.wait_for_function("!TribeCanvas.state().open", timeout=8000)
    # comment pins
    pin = page.evaluate("TribeClient.api('/pins', { method: 'POST', body: { surface: 'preview', target: { href: '/', sel: 'h1', fx: .5, fy: .2 }, text: 'Bigger title?' } })")["pin"]
    page.evaluate("id => TribeClient.api(`/pins/${id}/reply`, { method: 'POST', body: { text: 'On it' } })", pin["id"])
    page.evaluate("id => TribeClient.api(`/pins/${id}/resolve`, { method: 'POST', body: { resolved: true } })", pin["id"])
    got = page.evaluate("TribeClient.api('/pins?state=resolved')")["pins"]
    assert any(p["id"] == pin["id"] and len(p["thread"]) == 2 for p in got), got
    # the website template gallery, with real thumbnails
    page.evaluate("TribeSiteLib.open()")
    page.wait_for_selector("#slx .slx-card", timeout=8000)
    assert page.locator("#slx .slx-card").count() == 16
    page.wait_for_function("[...document.querySelectorAll('#slx .slx-th img')].every(i => i.complete && i.naturalWidth > 0)", timeout=8000)
    if "--shots" in sys.argv: page.screenshot(path=str(SHOTS / "offline-demo-desktop-templates.png"))
    page.evaluate("TribeSiteLib.close()")
    # Flint's capability map
    assert len(page.evaluate("TribeClient.api('/flint/tiers')")["tiers"]) == 4


def flow(page, tag, phone, tmp):
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeOffline && window.TribeHub", timeout=15000)
    if not page.evaluate("document.body.dataset.view === 'hub'"): page.evaluate("TribeHub.open('home')")
    page.wait_for_selector("#hub-hero", state="visible", timeout=10000)
    assert page.locator("#hub-demo").count() == 0, "the demo only starts when asked (v0.28.1: not offered on Home)"
    sideways(page, tag + " home")
    if "--shots" in sys.argv: page.screenshot(path=str(SHOTS / f"offline-demo-{'phone' if phone else 'desktop'}-start.png"))
    # asked for: the ? menu's "Try a demo tribe" on a computer (Ctrl K "Start demo" is in e2e_fresh_open.py)
    if not phone and page.locator("#tb-help").is_visible(): page.click("#tb-help"); page.click("[data-help=demo]")
    else: page.evaluate("TribeOffline.start()")
    page.click("#od-pick-quiet")   # the chooser: Explore quietly (Watch it come alive is e2e_showcase_demo.py)
    page.wait_for_function("TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=10000)
    assert page.evaluate("document.body.classList.contains('offline-demo')")
    page.wait_for_selector("#demo-pill", state="visible")
    if not phone: assert "nothing leaves this device" in page.text_content("#demo-pill")
    assert page.evaluate("TribeStore.get().server.token") == "offline-demo"
    # a project was created
    page.wait_for_function("(TribeClient.state().projects || []).some(p => p.name === 'Lantern Run')", timeout=8000)
    assert page.evaluate("TribeClient.state().tribe.name") == "Demo Tribe"
    assert page.evaluate("TribeClient.state().members.filter(m => m.role !== 'agent').length") >= 3, "you and two pretend friends"
    assert page.evaluate("TribeClient.state().members.some(m => m.role === 'agent')"), "a pretend Claude"
    # a second project, made through the API the real UI uses, then switched back
    page.evaluate("TribeClient.api('/projects', { method: 'POST', body: { name: 'Side Quest' } })")
    page.wait_for_function("TribeClient.api('/projects').then(r => r.projects.length === 2)", timeout=5000)
    # feat/site-builder: the Website builder works in the demo (Instant, a theme, a suggestion card)
    if not phone:
        w = page.evaluate("(async () => { const p = TribeProjects.current(), a = (x, o) => TribeClient.api(`/projects/${p}/website${x}`, o); await a('/instant', { method: 'POST', body: { theme: 'cozy' } }); const i = await a('/ideas', { method: 'POST', body: {} }); return { w: (await a('')).website, i }; })()")
        assert w["w"]["gen"]["draft"]["theme"] == "cozy" and w["w"]["gen"]["draftUrl"].startswith("blob:") and w["i"]["idea"]["why"], w["w"]["gen"]["draft"]
        page.evaluate("TribeShell.go('website')")
        page.wait_for_selector("#wb-root .sg-modes", timeout=8000)
        page.wait_for_selector("#wb-frame", timeout=8000)
        v028(page, tag)

    # chat: post, and @claude answers
    page.evaluate("TribeApp.show('chat')")
    page.wait_for_selector("#chat-input", state="visible", timeout=8000)
    page.fill("#chat-input", "hello tribe, @claude can you help with level 2?")
    page.press("#chat-input", "Enter")
    wait_text(page, "#chat-list", "hello tribe")
    wait_text(page, "#chat-list", "pretend Claude", 10000)
    if "--shots" in sys.argv: page.screenshot(path=str(SHOTS / f"offline-demo-{'phone' if phone else 'desktop'}-chat.png"))
    sideways(page, tag + " chat")

    # tasks: add one; the pretend Claude picks it up
    page.evaluate("TribeApp.show('tasks')")
    if phone: page.evaluate("document.querySelector('#task-new').click()")   # phones: the quick task sheet
    else:
        page.click("#task-new")   # desktop: New task opens suggested tasks (assist.js; the demo answers with the game starters)
        if page.evaluate("TribeTasks.all().length") < 3:   # Suggested shows only while the board has fewer than 3 tasks (feat/setup-flow)
            page.wait_for_selector("#as-tasks", timeout=5000)
            wait_text(page, "#as-tasks", "title screen", 8000)
        else: assert page.locator("#as-tasks").count() == 0
        page.click("#board [data-add=backlog]")
    box = "#m2-qt-in" if phone else "#board .col .quick-add"   # phones add tasks from a sheet (mobile2.js), desktop inline on the board
    page.wait_for_selector(box, state="visible", timeout=5000)
    page.fill(box, "Add a lantern flicker")
    page.press(box, "Enter")
    page.wait_for_function("TribeClient.api('/tasks').then(r => r.tasks.some(t => t.title === 'Add a lantern flicker'))", timeout=5000)
    page.wait_for_function("TribeClient.api('/tasks').then(r => r.tasks.some(t => t.title === 'Add a lantern flicker' && t.assignee === 'claude'))", timeout=10000)
    sideways(page, tag + " tasks")

    # Files: a note and a picture
    page.evaluate("TribeHub.open('docs')")
    page.wait_for_selector("#hub-docs", timeout=8000)
    if phone: page.click("#dc-fab"); page.click("#dc-newsheet [data-do=note]")
    else: page.click("#dc-new"); page.click("#dc-newmenu [data-new=note]")   # + New › Note
    page.wait_for_selector("#note-text", state="visible", timeout=8000)
    page.fill("#note-title", "Demo idea")
    page.fill("#note-text", "Fireflies that follow Wick")
    page.click("#note-done")
    page.wait_for_function("TribeClient.api('/scratch').then(r => r.notes.some(n => n.text.startsWith('Demo idea')))", timeout=8000)
    pic = Path(tmp) / "lantern.png"; pic.write_bytes(PNG)
    with page.expect_file_chooser() as fc:
        if phone: page.click("#dc-fab"); page.click("#dc-newsheet [data-do=me]")
        else: page.click("#dc-up"); page.click("#dc-upmenu [data-scope=me]")
    fc.value.set_files(str(pic))
    page.wait_for_selector("img[data-thumb]", timeout=8000)
    page.wait_for_function("[...document.querySelectorAll('img[data-thumb]')].some(i => i.naturalWidth === 16)", timeout=8000)
    if "--shots" in sys.argv: page.screenshot(path=str(SHOTS / f"offline-demo-{'phone' if phone else 'desktop'}-files.png"))
    sideways(page, tag + " files")

    # the pill's popout: Host this for real explains the next step
    page.click("#demo-pill"); page.wait_for_selector("#demo-pop", state="visible")
    page.click("#od-real"); page.wait_for_selector("#invite-modal:not(.hidden) .od-steps")
    assert "desktop app" in page.text_content("#invite-body")
    page.click("#invite-body [data-close]")

    # an invite makes a pretend link, and a pretend friend joins
    page.evaluate("TribeApp.openInvite()")
    page.wait_for_selector("#invite-body .od-note", timeout=6000)
    assert "DEMO" in page.text_content("#inv-link")
    page.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
    page.wait_for_function("TribeClient.state().members.some(m => m.name === 'Rio' && m.online)", timeout=12000)
    if "--shots" in sys.argv:
        page.evaluate("TribeApp.show('home')"); time.sleep(0.6)
        page.screenshot(path=str(SHOTS / f"offline-demo-{'phone' if phone else 'desktop'}.png"))

    # reload: everything is still there
    page.reload(); page.wait_for_function("window.TribeOffline && TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=10000)
    page.wait_for_function("TribeClient.api('/tasks').then(r => r.tasks.some(t => t.title === 'Add a lantern flicker'))", timeout=5000)
    page.wait_for_function("TribeClient.api('/scratch').then(r => r.notes.length >= 1)", timeout=5000)
    page.wait_for_function("TribeClient.api('/uploads').then(r => r.mine.length === 1)", timeout=5000)
    page.wait_for_function("TribeClient.api('/chat/general').then(r => r.messages.some(m => m.text.includes('hello tribe')))", timeout=5000)
    # project sense (app/ui/sense.js): the Dashboard's Inspiration card works offline too (offline.js mock)
    page.evaluate("TribeApp.show('home')")
    page.wait_for_selector("#pj-insp .sx-item", timeout=8000)
    assert "game" in page.inner_text("#pj-insp h3").lower(), page.inner_text("#pj-insp h3")
    page.wait_for_selector("#demo-pill", state="visible")

def leave_and_reset(page, tag):
    # Reset: a fresh demo (your task is gone), still in the demo
    page.click("#demo-pill"); page.click("#od-reset")
    page.wait_for_function("window.TribeOffline && TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=10000)
    assert not page.evaluate("TribeClient.api('/tasks').then(r => r.tasks.some(t => t.title === 'Add a lantern flicker'))")
    # Leave: your own settings come back exactly
    page.wait_for_selector("#demo-pill", state="visible")
    page.click("#demo-pill"); page.click("#od-leave")
    page.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
    st = settings(page)
    assert st["server"] == REAL["server"], (tag, st["server"])
    assert st.get("hosting") == REAL["hosting"]
    assert page.evaluate("localStorage.getItem('tribecode.offlineDemo.v1')") is None
    assert page.locator("#demo-pill").count() == 0
    assert not page.evaluate("document.body.classList.contains('offline-demo')")

def main():
    errors = []; tmp = tempfile.mkdtemp(prefix="tribe-offline-", dir="/tmp")
    srv = serve()
    seed = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))   # try: it also runs in sandboxed preview frames
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- desktop ----
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(seed)
            pg = ctx.new_page(); watch(pg, "desktop", errors)
            flow(pg, "desktop", False, tmp)
            # the entry points: Help and Settings
            pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help=demo]"); pg.keyboard.press("Escape")
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#set-demo"); assert "Leave" in pg.text_content("#set-demo"); pg.evaluate("TribeSettings.close()")
            leave_and_reset(pg, "desktop")
            pg.click("#tb-help"); pg.click("#help-menu [data-help=demo]")   # Help starts it too (through the chooser)
            pg.click("#od-pick-quiet")
            pg.wait_for_function("TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=10000)
            pg.evaluate("TribeOffline.leave()"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            assert settings(pg)["server"] == REAL["server"]
            ctx.close()

            # ---- phone 390 ----
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); ctx.add_init_script(seed)
            ph = ctx.new_page(); watch(ph, "phone", errors)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeHub", timeout=15000)
            ph.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=15000) if ph.evaluate("!!navigator.serviceWorker") else None
            # the phone's projects sheet offers the demo before you're in a tribe
            ph.wait_for_selector("#m2-homebar [data-hb=pjs]", state="visible", timeout=8000)
            ph.click("#m2-homebar [data-hb=pjs]"); ph.wait_for_selector("#m2-demo", state="visible")
            ph.evaluate("TribeMobile.closeSheet()"); time.sleep(0.4)
            flow(ph, "phone", True, tmp)
            # offline: the shell comes from the service worker cache, the demo from this browser
            ph.wait_for_function("caches.keys().then(k => k.length > 0)", timeout=15000)
            time.sleep(1.5)   # let cache.addAll finish
            ctx.set_offline(True)
            ph.reload(); ph.wait_for_function("window.TribeOffline && TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=15000)
            ph.wait_for_function("TribeClient.api('/tasks').then(r => r.tasks.some(t => t.title === 'Add a lantern flicker'))", timeout=5000)
            ph.evaluate("TribeApp.show('chat')"); ph.wait_for_selector("#chat-input", state="visible")
            ph.fill("#chat-input", "still here offline"); ph.press("#chat-input", "Enter"); wait_text(ph, "#chat-list", "still here offline")
            sideways(ph, "phone offline chat")
            assert not ph.locator("#demo-pill").is_visible(), "phones: the pill steps aside in Chat (it would sit on the composer)"
            ctx.set_offline(False)
            ph.evaluate("TribeApp.show('home')")
            leave_and_reset(ph, "phone")
            ctx.close()
            b.close()
    finally:
        srv.shutdown()
    # Outside the demo, this static page has no tribe server: the app's own sign-in probe (GET /api/health, before you
    # start the demo and after you leave it) gets the static server's 404. That is the page, not the demo.
    probes = [e for e in errors if " http 404: " in e and e.endswith("/api/health")]
    noise = [e for e in errors if e not in probes and "favicon" not in e]
    for tag in ("desktop", "phone"):
        n = sum(1 for e in probes if e.startswith(tag))
        for e in [e for e in noise if e.startswith(tag + " console: Failed to load resource") and "404" in e][:n]: noise.remove(e)
    assert not noise, "\n".join(noise[:20])
    print("e2e_offline_demo: OK")

if __name__ == "__main__":
    main()
