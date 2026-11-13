"""Updates (docs/UPDATES.md) with a mocked desktop bridge (window.__TAURI__):
 - background download on: quiet while downloading, a "Restart to update" pill only once it's ready; one click saves,
   stops the server, installs and relaunches, in that order, without downloading twice; the relaunched app is back
   on the view you were on
 - background download off: "Update available", the download starts only when clicked
 - closing the window with an update ready installs it (same bytes)
 - the Settings switch "Download updates in the background"
 - tauri.conf.json: quiet Windows installs and the installer images (scripts/check-tauri-config.py)
Usage: python app/test/e2e_updater.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4927 + OFF
BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

# A fake Tauri: every call lands in localStorage '__calls' (it survives the relaunch = a reload here).
MOCK = """(() => {
  const L = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const rec = n => { const c = L('__calls') || []; c.push(n); localStorage.setItem('__calls', JSON.stringify(c)); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ver = () => localStorage.getItem('__ver') || '0.7.5';
  window.__TAURI__ = {
    core: { invoke: async (cmd) => { rec('invoke:' + cmd); if (cmd === 'host_log') return []; return null; } },
    app: { getVersion: async () => ver() },
    updater: { check: async () => { rec('check'); if (ver() === '0.8.0') return null; return {
      version: '0.8.0', body: '- Faster restarts', date: '',
      download: async cb => { rec('download'); if (localStorage.getItem('__dlfail')) { localStorage.removeItem('__dlfail'); throw new Error('network down'); }
        cb({ event: 'Started', data: { contentLength: 1000 } });
        for (let k = 0; k < 10; k++) { await sleep(Number(localStorage.getItem('__dlms') || 120)); cb({ event: 'Progress', data: { chunkLength: 100 } }); }
        cb({ event: 'Finished', data: {} }); },
      install: async () => { rec('install'); },
    }; } },
    process: { relaunch: async () => { rec('relaunch'); localStorage.setItem('__ver', '0.8.0'); setTimeout(() => location.reload(), 50); } },
    notification: { sendNotification: () => rec('notify') },
    window: { getCurrentWindow: () => ({ close: async () => rec('close'), minimize: async () => {}, toggleMaximize: async () => {} }) },
  };
  // record saves too, so the order can be checked
  addEventListener('DOMContentLoaded', () => {
    const wrap = () => { if (!window.TribeApp || !TribeApp.saveAll || TribeApp.saveAll.__w) return setTimeout(wrap, 20);
      const f = TribeApp.saveAll; TribeApp.saveAll = async (...a) => { rec('save'); return f.apply(TribeApp, a); }; TribeApp.saveAll.__w = true; };
    wrap();
  });
})();"""

def calls(pg): return pg.evaluate("JSON.parse(localStorage.getItem('__calls') || '[]')")

def main():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "check-tauri-config.py")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    conf = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
    assert conf["plugins"]["updater"]["windows"]["installMode"] == "quiet", "no installer window on Windows updates"

    tmp = Path(tempfile.mkdtemp(prefix="tribe-up-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def fresh(settings):
                ctx = b.new_context(viewport={"width": 1440, "height": 900})
                seed = json.dumps({"name": "Orion", "onboarded": True, "server": {"url": BASE, "token": ""}, **settings})
                ctx.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', {json.dumps(seed)});")
                ctx.add_init_script(MOCK)
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: os.environ.get("DBG") and print("console:", m.text))
                pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("!!(window.TribeUpdater && window.TribeApp && TribeApp.show)", timeout=15000)
                return ctx, pg

            # ---- A) background download on (the default) ----
            ctx, pg = fresh({})
            assert pg.evaluate("TribeStore.get().startup.autoUpdate") is True
            pg.wait_for_function("JSON.parse(localStorage.getItem('__calls') || '[]').includes('download')", timeout=10000)
            assert pg.evaluate("TribeUpdater.pending().downloading") is True
            assert pg.is_hidden("#update-btn"), "a background download shows nothing"
            pg.wait_for_selector("#update-btn.ready:not(.hidden)", timeout=10000)
            assert pg.inner_text("#update-btn").strip() == "Restart to update"
            assert "v0.8.0" in pg.get_attribute("#update-btn", "title")
            pg.wait_for_timeout(250); pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "update-restart-pill.png"), clip={"x": 760, "y": 0, "width": 680, "height": 84})
            # more checks (window focus, the palette) reuse the downloaded update
            pg.evaluate("dispatchEvent(new Event('focus')); TribeUpdater.check({ manual: true })"); pg.wait_for_timeout(400)
            assert calls(pg).count("download") == 1, calls(pg)
            # the profile menu offers the same one-click restart
            pg.click("#pf-btn"); pg.wait_for_selector("#pf-menu [data-act='restart']"); pg.keyboard.press("Escape")
            # right-click: the details (notes, hand-off, Later)
            pg.click("#update-btn", button="right"); pg.wait_for_selector("#update-pop:not(.hidden)")
            assert "v0.8.0 is ready" in pg.inner_text("#update-pop") and "Faster restarts" in pg.inner_text("#update-pop")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#update-pop.hidden", state="attached")
            # be somewhere, then Restart to update
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_function("TribeApp.view() === 'chat'")
            pg.evaluate("localStorage.setItem('__calls', '[]')")
            pg.click("#update-btn")
            pg.wait_for_function("JSON.parse(localStorage.getItem('__calls') || '[]').includes('relaunch')", timeout=10000)
            seq = [c for c in calls(pg) if c in ("save", "invoke:host_stop", "invoke:host_kill_stale", "install", "relaunch", "download")]
            assert seq == ["save", "invoke:host_stop", "invoke:host_kill_stale", "install", "relaunch"], seq
            # the relaunched app (v0.8.0) is back on Chat and says so
            pg.wait_for_function("window.TribeApp && TribeApp.view && TribeApp.view() === 'chat'", timeout=15000)
            pg.wait_for_function("[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Updated to v0.8.0'))", timeout=5000)
            assert pg.evaluate("localStorage.getItem('tribecode.restoreAfterUpdate')") is None
            assert pg.is_hidden("#update-btn")
            ctx.close()

            # ---- B) background download off: "Update available", download on click ----
            ctx, pg = fresh({"startup": {"autoUpdate": False}})
            pg.wait_for_selector("#update-btn.available:not(.hidden)", timeout=10000)
            assert pg.inner_text("#update-btn").strip() == "Update available"
            pg.wait_for_timeout(600)
            assert "download" not in calls(pg), calls(pg)
            pg.click("#update-btn")
            pg.wait_for_selector("#update-btn.downloading:not(.hidden)", timeout=3000)   # you asked: progress shows
            pg.wait_for_selector("#update-btn.ready:not(.hidden)", timeout=10000)
            assert pg.inner_text("#update-btn").strip() == "Restart to update"
            assert calls(pg).count("download") == 1
            # the Settings switch
            pg.evaluate("TribeSettings.open('about')"); pg.wait_for_selector("#set-bgupdate")
            assert pg.get_attribute("#set-bgupdate", "aria-checked") == "false"
            pg.click("#set-bgupdate"); pg.wait_for_function("TribeStore.get().startup.autoUpdate === true")
            assert pg.get_attribute("#set-bgupdate", "aria-checked") == "true"
            pg.wait_for_timeout(300)
            assert calls(pg).count("download") == 1, "switching it on doesn't download again"
            pg.evaluate("TribeSettings.close()")
            ctx.close()

            # ---- C) close the window with an update ready: install on the way out, same bytes ----
            ctx, pg = fresh({})
            pg.wait_for_selector("#update-btn.ready:not(.hidden)", timeout=10000)
            pg.evaluate("localStorage.setItem('__calls', '[]'); document.querySelector('#win-ctl [data-w=close]').click()")
            pg.wait_for_function("JSON.parse(localStorage.getItem('__calls') || '[]').includes('close')", timeout=10000)
            seq = [c for c in calls(pg) if c in ("save", "invoke:host_stop", "install", "close", "download", "relaunch")]
            assert seq == ["save", "invoke:host_stop", "install", "close"], seq
            ctx.close()

            # ---- D) a failed download doesn't leave a broken pill; it retries on the next check ----
            ctx, pg = fresh({"startup": {"autoUpdate": False}})
            pg.wait_for_selector("#update-btn.available:not(.hidden)", timeout=10000)
            pg.evaluate("localStorage.setItem('__dlfail', '1')")
            pg.click("#update-btn")
            pg.wait_for_function("[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('could not download'))", timeout=5000)
            pg.wait_for_selector("#update-btn.available:not(.hidden)", timeout=3000)
            pg.click("#update-btn"); pg.wait_for_selector("#update-btn.ready:not(.hidden)", timeout=10000)
            assert calls(pg).count("download") == 2, calls(pg)
            ctx.close()
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("updater OK")

if __name__ == "__main__":
    main()
