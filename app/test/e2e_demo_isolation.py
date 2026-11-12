"""The demo never leaks into the real app (feat/demo-auto, app/ui/offline.js). NO tribe server (a static file server
over app/ui). Every demo lives in its tab only (sessionStorage) and never rewrites your saved settings:
  1 the calm demo: while it runs, localStorage keeps your real server; Leave clears every trace (no demo data, no
    offline flag, no keys for the pretend server, no pretend tribe name from the welcome).
  2 the watch demo, then Exit: the same.
  3 a second tab opened while a demo runs is the real app.
  4 signing in while in a demo ends it: the real sign-in is saved, the demo data is gone, the offline flag is off.
  5 hosting for real while in a demo: the same, with hosting on.
  6 a pretend tribe left in localStorage by an older version is cleaned up on the next open: your settings come back.
  7 the real app loads no demo scripts' state: no showcase clock, no director, no demo pill.
Usage: python app/test/e2e_demo_isolation.py
"""
import functools, http.server, json, os, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 5270 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
KEY = "tribecode.offlineDemo.v1"
CLEAN = """(() => {
  const ls = Object.keys(localStorage), ss = Object.keys(sessionStorage);
  return { demoLs: localStorage.getItem('%s'), demoSs: sessionStorage.getItem('%s'), backup: localStorage.getItem('tribecode.offlineDemo.backup'),
    pretendKeys: ls.concat(ss).filter(k => k.includes('offline-demo.tribecode.invalid')), welcome: localStorage.getItem('tribecode.welcome.tribe'),
    flag: document.body.classList.contains('offline-demo'), pill: !!document.querySelector('#demo-pill'), active: TribeOffline.active(),
    server: JSON.parse(localStorage.getItem('tribecode.settings.v1')).server, hosting: JSON.parse(localStorage.getItem('tribecode.settings.v1')).hosting };
})()""" % (KEY, KEY)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def is_clean(pg, tag, server=None):
    c = pg.evaluate(CLEAN)
    assert c["demoLs"] is None and c["demoSs"] is None and c["backup"] is None, f"{tag}: demo data left {c}"
    assert not c["pretendKeys"], f"{tag}: keys for the pretend server {c['pretendKeys']}"
    assert not c["flag"] and not c["pill"] and not c["active"], f"{tag}: offline flag left {c}"
    assert c["welcome"] is None, f"{tag}: the pretend tribe's name is left"
    assert c["server"] == (server or REAL["server"]), f"{tag}: settings {c['server']}"
    return c


def boot(pg, url="/?skipIntro=1"):
    pg.goto(BASE + url)
    pg.wait_for_function("window.TribeOffline && window.TribeClient", timeout=15000)


def in_demo(pg, mode):
    pg.wait_for_function(f"TribeOffline.active() && TribeOffline.mode() === '{mode}' && TribeClient.connected()", timeout=15000)
    st = pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server")
    assert st == REAL["server"], f"{mode}: the demo rewrote your saved settings {st}"
    assert pg.evaluate(f"localStorage.getItem('{KEY}') === null && sessionStorage.getItem('{KEY}') !== null"), f"{mode}: the demo must live in this tab only"


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(SEED)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            boot(pg)

            # 1 the calm demo, then Leave
            pg.evaluate("localStorage.setItem('tribecode.welcome.tribe', JSON.stringify({ name: 'Snack Squad', emoji: '🍪' }))")
            pg.evaluate("TribeOffline.start('quiet')")
            in_demo(pg, "quiet")
            assert pg.evaluate("TribeClient.state().tribe.name") == "Snack Squad"
            pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'demo only' } })")
            # 3 a second tab is the real app
            pg2 = ctx.new_page(); boot(pg2)
            assert not pg2.evaluate("TribeOffline.active()") and not pg2.evaluate("document.body.classList.contains('offline-demo')"), "a new tab opened in the demo"
            pg2.close()
            pg.evaluate("TribeOffline.leave()")
            pg.wait_for_load_state("load"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=15000)
            is_clean(pg, "after Leave")

            # 2 the watch demo, then Exit
            boot(pg, "/?demo=watch&speed=4")
            in_demo(pg, "watch")
            pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=15000)
            pg.evaluate("TribeDemoWatch.exit()")
            pg.wait_for_load_state("load"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=15000)
            is_clean(pg, "after Exit")
            assert pg.locator("#dw-ui, #dw-layer").count() == 0

            # 4 signing in from inside a demo ends it
            pg.evaluate("TribeOffline.start('quiet')"); in_demo(pg, "quiet")
            real = {"url": "http://192.0.2.10:4747", "token": "tok-real-123"}
            pg.evaluate("s => TribeStore.set({ server: s })", real)
            c = is_clean(pg, "after signing in", real)
            assert pg.evaluate("TribeStore.get().server.token") == "tok-real-123"
            pg.evaluate("TribeStore.set({ server: { url: 'http://192.0.2.10:4747', token: '' } })")

            # 5 hosting for real from inside a demo
            boot(pg); pg.evaluate("TribeOffline.start('showcase')"); in_demo(pg, "showcase")
            host = {"url": "http://localhost:4747", "token": "tok-host-456"}
            pg.evaluate("s => TribeStore.set({ server: s, hosting: true })", host)
            c = is_clean(pg, "after hosting", host)
            assert c["hosting"] is True
            pg.evaluate("s => TribeStore.set({ server: s, hosting: false })", REAL["server"])

            # 6 a pretend tribe saved by an older version (localStorage) is cleaned up on the next open
            pg.evaluate("""() => {
              const old = { on: true, v: 1, mode: 'quiet', tribe: { name: 'Demo Tribe' }, members: [{ id: 'me', name: 'Orion' }], projects: [{ id: 'lantern-run', name: 'Lantern Run' }], current: 'lantern-run', chat: {}, tasks: {}, docs: {}, vision: {}, gists: {} };
              localStorage.setItem('tribecode.offlineDemo.v1', JSON.stringify(old));
              localStorage.setItem('tribecode.offlineDemo.backup', JSON.stringify({ server: { url: 'http://192.0.2.10:4747', token: '' }, hosting: false, projKey: 'tribecode.project:x', projVal: null }));
              const st = JSON.parse(localStorage.getItem('tribecode.settings.v1')); st.server = { url: 'https://offline-demo.tribecode.invalid', token: 'offline-demo' };
              localStorage.setItem('tribecode.settings.v1', JSON.stringify(st));
              localStorage.setItem('tribecode.project:https://offline-demo.tribecode.invalid', 'lantern-run');
            }""")
            boot(pg)
            is_clean(pg, "an old demo, next open")

            # 7 the real app runs no demo machinery
            assert not pg.evaluate("TribeDirector.active()") and not pg.evaluate("TribeDemoWatch.active()")
            assert pg.evaluate("TribeOffline.mode()") is None
            ctx.close(); b.close()
    finally:
        srv.shutdown()
    assert not errors, "\n".join(errors[:20])
    print("e2e_demo_isolation: OK")


if __name__ == "__main__":
    main()
