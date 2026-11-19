"""Never show an old version (fix/p7-cache): the app page's scripts and styles carry the version (x.js?v=…) and the page
says its version; the desktop app's first start after an update drops old cached files and reloads once (no loop); and
Settings › About › "Clear the cache and restart" empties the caches and reloads fresh (the desktop app asks Rust to
restart with its web cache cleared). The desktop app is faked with a small window.__TAURI__.
Usage: python app/test/e2e_cache_clear.py"""
import json, os, re, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5520 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
VER = json.loads((ROOT / "app/src-tauri/tauri.conf.json").read_text())["version"]
FAKE = """window.__calls = []; window.__TAURI__ = { app: { getVersion: async () => '9.9.9' },
  core: { invoke: async (c, a) => { window.__calls.push(c); if (c === 'clear_web_cache_and_restart') return null; throw new Error('not in this test'); } } };
  sessionStorage.setItem('loads', String(+(sessionStorage.getItem('loads') || 0) + 1));"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cache-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        html = urllib.request.urlopen(BASE + "/", timeout=5).read().decode()
        srcs = re.findall(r'<script[^>]*\ssrc="([^"]+)"', html)
        local = [s for s in srcs if not s.startswith(("http", "//"))]
        assert local and all(s.endswith(f"?v={VER}") for s in local), [s for s in local if not s.endswith(f"?v={VER}")][:5]
        assert f'<meta name="tribe-version" content="{VER}">' in html or re.search(r'<meta name="tribe-version" content="[\d.]+">', html), "the page says its version"
        print(f"ok  {len(local)} scripts carry ?v={VER}; the page says its version")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # 1: a web page: the button empties caches and reloads with fresh files
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeSelfHeal && window.TribeSettings", timeout=20000)
            pg.evaluate("caches.open('tribecode-shell-old').then(c => c.put('/x.js', new Response('old')))")
            pg.evaluate("TribeSettings.open('about')"); pg.wait_for_selector("#set-clearcache")
            with pg.expect_navigation(): pg.click("#set-clearcache")
            assert "fresh=" in pg.url, pg.url
            pg.wait_for_function("window.TribeSelfHeal", timeout=20000)
            assert "tribecode-shell-old" not in pg.evaluate("caches.keys()"), "old cache dropped"
            print("ok  Clear the cache and restart: caches emptied, reloaded fresh"); ctx.close()
            # 2: the desktop app after an update: drop and reload once, then never again
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(FAKE); pg = ctx.new_page()
            pg.goto(BASE + "/?skipIntro=1"); pg.evaluate("localStorage.setItem('tribecode.uiVersion', '0.40.0'); caches.open('tribecode-shell-old').then(c => c.put('/x.js', new Response('old')))")
            pg.reload(); pg.wait_for_function("localStorage.getItem('tribecode.uiVersion') === '9.9.9' && +sessionStorage.getItem('loads') >= 3", timeout=20000)
            pg.wait_for_timeout(2500); loads = int(pg.evaluate("sessionStorage.getItem('loads')"))
            assert loads == 3, f"reloaded exactly once after the update (loads={loads})"
            assert "tribecode-shell-old" not in pg.evaluate("caches.keys()"), "old cache dropped on update"
            pg.evaluate("TribeSelfHeal.clearCache()"); pg.wait_for_function("window.__calls.includes('clear_web_cache_and_restart')", timeout=5000)
            print("ok  desktop: one reload after an update, no loop; the button asks the app to restart with its web cache cleared")
            ctx.close(); b.close()
        assert not [e for e in errors if "not in this test" not in e], errors
        print("e2e_cache_clear: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
