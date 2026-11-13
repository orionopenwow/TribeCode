"""The website designer and the starters' play frame under the DESKTOP APP's CSP (fix/batch-fixes).
The designer's live preview is an about:srcdoc frame, which inherits the window's CSP (app/src-tauri/tauri.conf.json:
script-src without 'unsafe-inline', and security tests keep it that way). Its click-to-edit helper is a real file
(sitedesigner-frame.js) loaded by src from the app's origin; starters played on this device go through framerun.js.
Reuses the desktop simulation from e2e_demo_desktop.py (http://tauri.localhost/ under the conf CSP, Tauri stubs).
Checks: no CSP violation inside the preview, click-to-edit changes the site's name, a page's inline script runs in a
sandboxed srcdoc frame through TribeFrameRun.wrap, and the CSP itself still has no 'unsafe-inline'.
Usage: python app/test/e2e_desktop_csp.py
"""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
import e2e_demo_desktop as dd

PORT = 5420 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SRV = f"http://localhost:{PORT}"


def api(path, token=None, body=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(SRV + "/api" + path, data=json.dumps(body).encode() if body is not None else None, headers=h)
    return json.load(urllib.request.urlopen(req))


def main():
    assert "unsafe-inline" not in dd.CONF["app"]["security"]["csp"]["script-src"], "the desktop CSP must not allow inline scripts"
    tmp = Path(tempfile.mkdtemp(prefix="tribe-dcsp-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(dd.ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--name", "Desk Crew", "--ui", str(dd.UI), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors, csp = [], []
    try:
        for _ in range(60):
            try: urllib.request.urlopen(SRV + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        token = api("/bootstrap", body={"name": "Mara", "color": "#7C5CFF", "tribe": "Desk Crew"})["token"]
        pid = api("/projects", token)["projects"][0]["id"]
        real = {"name": "Mara", "onboarded": True, "server": {"url": SRV, "token": token}, "hosting": True, "tribeHere": True, "tour": {"done": True}}
        stub = """
          Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
          window.__TAURI_INTERNALS__ = {};
          window.__TAURI__ = { core: { invoke: async (c) => { if (c === 'host_start') return '%s'; if (c === 'host_log') return []; if (c === 'host_status') return %d; return null; } },
            app: { getVersion: async () => '%s' }, window: { getCurrentWindow: () => ({ close: async () => {}, minimize: async () => {}, toggleMaximize: async () => {} }) },
            event: { listen: async () => () => {} }, shell: { open: async () => {} } };
          try { localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.project:%s', '%s'); localStorage.setItem('tribecode.personalized', '1');
                localStorage.setItem('tribecode.flint.tour', 'done'); localStorage.setItem('tribecode.firstrun.done', '1'); } catch (e) {}
        """ % (SRV, PORT, dd.VERSION, json.dumps(json.dumps(real)), SRV, pid)
        with sync_playwright() as p:
            # IsolateSandboxedIframes off: Playwright cannot route requests from an out-of-process sandboxed frame
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,IsolateSandboxedIframes"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(stub); ctx.route("http://tauri.localhost/**", dd.serve)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: "Content Security Policy" in m.text and csp.append(((m.location or {}).get("url", ""), m.text[:160])))
            pg.goto("http://tauri.localhost/")
            dd.until(pg, "!!(window.TribeClient && TribeClient.connected() && window.TribeSiteDesigner)", 40, "the tribe connects")

            # ---- the website designer: the preview's helper runs, click-to-edit works
            pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', template: 'cafe', name: 'Sunrise Bakery' }})")
            dd.until(pg, "!!document.querySelector('#wdz:not([hidden]) #wdz-frame')", 15, "the designer opens")
            fr = pg.frame_locator("#wdz-frame")
            h1 = fr.locator("h1[data-e]").first
            h1.wait_for(timeout=10000)
            h1.click(); h1.press("Control+a"); h1.type("Desk Bakery"); h1.press("Enter")
            dd.until(pg, "TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.props && b.props.title === 'Desk Bakery')", 8, "click-to-edit changes the name")
            fr.locator("[data-block]").nth(1).click()
            dd.until(pg, "!!(TribeSiteDesigner.state().sel)", 5, "a click in the preview selects a block")
            bad = [c for c in csp if "about:srcdoc" in c[0] or "inline" in c[1]]
            assert not bad, bad

            # ---- a starter's inline scripts in a sandboxed srcdoc frame (Design flow on this device)
            ran = pg.evaluate("""() => new Promise(res => {
              const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts');
              addEventListener('message', e => { if (e.source === f.contentWindow) res(e.data); });
              f.srcdoc = TribeFrameRun.wrap('<!doctype html><html><body><p id=x>a</p><script>window.A = document.getElementById("x") ? 1 : 0;</script>'
                + '<script>document.addEventListener("DOMContentLoaded", () => parent.postMessage("ran:" + window.A, "*"));</script></body></html>');
              document.body.appendChild(f); setTimeout(() => res('timeout'), 6000); })""")
            assert ran == "ran:1", ran
            ctx.close(); b.close()
    finally:
        srv.terminate()
    assert not errors, "\n".join(errors[:20])
    print("e2e_desktop_csp: OK")


if __name__ == "__main__":
    main()
