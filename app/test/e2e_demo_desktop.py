"""See how TribeCode works in the DESKTOP APP (fix/desk-demo). The desktop context as close as a browser test gets:
  * a real tribe server on localhost, started the way the sidecar is (--port --dir --ui), already hosting a tribe;
  * the app's bundled page at http://tauri.localhost/ (the Windows webview origin), served from app/ui like Tauri does,
    under the CSP from app/src-tauri/tauri.conf.json (with hashes for the pages' inline scripts, as Tauri adds them);
  * window.__TAURI__ / __TAURI_INTERNALS__ stubs (core.invoke host_start / host_log / host_stop…, app.getVersion, window,
    event, shell), and navigator.webdriver false, so the first-run and desktop-only paths run as in the real app.
Checks: Help › See how TribeCode works starts the tour in the same window; the first frame is the blank slate (no
project circles, none of the real tribe's or the user's names); inside the demo TribeHost.isDesktop is false, a host
attempt (TribeApp.hostHere, the sidecar's host_start) is refused and the real server is never started, stopped or signed
in to; the tour plays to the end at 4x; Exit brings back the real tribe with the saved server and token unchanged and no
demo data in storage. Wait helpers poll with evaluate: the CSP (rightly) blocks the eval Playwright's waits use.
Usage: python app/test/e2e_demo_desktop.py
"""
import base64, hashlib, json, mimetypes, os, re, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 5410 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SRV = f"http://localhost:{PORT}"
CONF = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
CSP = "; ".join(f"{k} {v}" for k, v in CONF["app"]["security"]["csp"].items())
VERSION = CONF["version"]


def serve(route):
    path = route.request.url.split("#")[0].split("?")[0].replace("http://tauri.localhost/", "") or "index.html"
    f = UI / path
    if f.is_dir(): f = f / "index.html"
    if not f.is_file(): return route.fulfill(status=404, body="not found")
    body, headers = f.read_bytes(), {"Content-Type": mimetypes.guess_type(str(f))[0] or "application/octet-stream"}
    if f.suffix == ".html":   # Tauri adds a hash for every inline script of a bundled page
        hs = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode()).digest()).decode() for m in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", body.decode(), re.S)]
        headers["Content-Security-Policy"] = CSP.replace("script-src 'self'", "script-src 'self' " + " ".join(hs))
    route.fulfill(status=200, body=body, headers=headers)


def until(pg, js, timeout=20, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what or js}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-dd-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--name", "Real Tribe", "--ui", str(UI), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(60):
            try: urllib.request.urlopen(SRV + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        req = urllib.request.Request(SRV + "/api/bootstrap", data=json.dumps({"name": "Orion", "color": "#7C5CFF", "tribe": "Real Tribe"}).encode(), headers={"Content-Type": "application/json"})
        token = json.load(urllib.request.urlopen(req))["token"]
        real = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": SRV, "token": token}, "hosting": True, "tribeHere": True, "tour": {"done": True}}
        stub = """
          Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
          window.__TAURI_INTERNALS__ = {};
          window.__inv = [];
          window.__TAURI__ = { core: { invoke: async (c, a) => { window.__inv.push(c); if (c === 'host_start') return '%s'; if (c === 'host_log') return []; if (c === 'host_status') return %d; return null; } },
            app: { getVersion: async () => '%s' }, window: { getCurrentWindow: () => ({ close: async () => {}, minimize: async () => {}, toggleMaximize: async () => {} }) },
            event: { listen: async () => () => {} }, shell: { open: async () => {} } };
          try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.personalized', '1'); localStorage.setItem('tribecode.flint.tour', 'done'); localStorage.setItem('tribecode.firstrun.done', '1'); } catch (e) {}
        """ % (SRV, PORT, VERSION, json.dumps(json.dumps(real)))
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,IsolateSandboxedIframes"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(stub); ctx.route("http://tauri.localhost/**", serve)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "warning" and m.text.startswith("demo watch:") and errors.append(m.text))
            pg.on("console", lambda m: "Content Security Policy" in m.text and "about:srcdoc" not in (m.location or {}).get("url", "") and errors.append("csp: " + m.text[:200]))
            pg.goto("http://tauri.localhost/")
            until(pg, "!!(window.TribeClient && TribeClient.connected())", 40, "the real tribe connects")
            assert pg.evaluate("TribeHost.isDesktop") and pg.evaluate("TribeClient.state().tribe.name") == "Real Tribe"

            # ---- Help › See how TribeCode works, in the desktop window ----
            until(pg, "!!document.querySelector('#tb-help')", 10)
            pg.click("#tb-help"); pg.click("[data-help=watch]")
            until(pg, "!!(window.TribeDemoWatch && TribeDemoWatch._test.state().running)", 30, "the tour starts")
            until(pg, "!!document.querySelector('#hub-hero.hub-empty')", 10, "the blank slate")
            first = pg.evaluate("""() => ({ circles: document.querySelectorAll('#pj-rail [data-pj-open]').length, projects: TribeOffline.state().projects.length,
              desk: TribeHost.isDesktop, text: document.body.innerText, server: TribeStore.get().server.url })""")
            assert first["circles"] == 0 and first["projects"] == 0, first
            assert not first["desk"], "inside the demo the desktop app behaves like the browser"
            assert "Orion" not in first["text"] and "Real Tribe" not in first["text"], "real data inside the demo"
            assert "offline-demo" in first["server"], first["server"]
            time.sleep(1)   # fix/batch-fixes: the blank slate holds a token before its fake socket opens: no connection pills
            pills = pg.evaluate("[...document.querySelectorAll('#health-pill:not(.hidden), .hid-chip, #ub-st')].map(e => e.textContent).join(' | ') + ' | ' + document.body.innerText")
            assert "Reconnecting" not in pills and "Waking up the tribe" not in pills, pills[:300]
            n0 = len(pg.evaluate("window.__inv"))
            r = pg.evaluate("TribeApp.hostHere({ silent: true }).then(x => x || null, e => String(e))")
            assert not r or not (isinstance(r, dict) and r.get("ok")), r
            assert pg.evaluate("TribeOffline.mode()") == "watch", "a host attempt must not end the demo"
            assert not [c for c in pg.evaluate("window.__inv")[n0:] if c.startswith("host_")], pg.evaluate("window.__inv")

            # ---- the whole tour, 4x ----
            pg.evaluate("TribeDemoWatch.stop(); TribeDemoWatch.start({ speed: 4 })")
            t0 = time.time()
            until(pg, "TribeDemoWatch._test.state().finished", 150, "the tour finishes")
            missed = [e for e in pg.evaluate("TribeDemoWatch._test.log()") if not e["found"]]
            assert not missed, missed
            assert not [c for c in pg.evaluate("window.__inv")[n0:] if c.startswith("host_")], "the demo touched the sidecar"
            print(f"  desktop app: the tour from blank to Your turn in {time.time() - t0:.1f} s, no host calls")

            # ---- Exit: the real tribe, unchanged ----
            pg.click("#dw-exit")
            until(pg, "!!(window.TribeOffline && !TribeOffline.active() && window.TribeClient && TribeClient.connected())", 40, "back in the real tribe")
            saved = pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1'))")
            assert saved["server"] == real["server"] and saved["name"] == "Orion" and saved.get("hosting") is True, saved
            assert pg.evaluate("TribeClient.state().tribe.name") == "Real Tribe"
            left = pg.evaluate("Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k => /offlineDemo|offline-demo|ember-cafe|setup.wherePending/.test(k))")
            assert not left, left
            ctx.close(); b.close()
    finally:
        srv.terminate()
    assert not errors, "\n".join(errors[:20])
    print("e2e_demo_desktop: OK")


if __name__ == "__main__":
    main()
