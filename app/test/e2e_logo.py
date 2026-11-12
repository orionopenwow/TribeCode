"""The logo's flicker: the top-left logo animates while something is working (a prompt in flight, an agent at work)
and rests otherwise; "Loading…" placeholders get the small flame. Usage: python app/test/e2e_logo.py
"""
import json, os, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4989 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-logo-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=30000)
            src = lambda: pg.get_attribute("#rail-logo img.logo", "src")
            pg.wait_for_function("!document.querySelector('#rail-logo').classList.contains('is-busy')", timeout=10000)   # resting once connected
            assert pg.get_attribute("#rail-logo img.logo", "data-logo-path").endswith("icon-mark-animated.svg"), "the flame idles (always flickers) in the top bar"
            # v0.25: the logo takes the theme's colors; Campfire: white brackets (the theme's ink, feat/shell-polish) around its own orange flame; Light gets dark brackets
            pg.wait_for_function("document.querySelector('#rail-logo img.logo').src.startsWith('data:image/svg+xml')", timeout=5000)
            lsrc = pg.get_attribute("#rail-logo img.logo", "src").upper(); assert "%23FFFFFF" in lsrc and "%23FE8019" in lsrc, lsrc[:300]
            pg.evaluate("TribeThemes.apply('light')"); pg.wait_for_function("decodeURIComponent(document.querySelector('#rail-logo img.logo').src).includes('#12151A')", timeout=5000)
            pg.evaluate("TribeThemes.apply('dark')"); pg.wait_for_function("document.querySelector('#rail-logo img.logo').src.endsWith('icon-mark-animated.svg')", timeout=5000)
            pg.evaluate("TribeThemes.apply(TribeThemes.saved())")
            assert pg.locator(".rail #rail-logo").count() == 1 and pg.locator("#rail-camp").count() == 0, "the flame tops the rail (Home); the wordmark is in the top bar"
            # a prompt in flight: the logo flickers until the reply is in
            pg.route("**/api/hub/ask", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"answer": "ok"})))
            st = pg.evaluate("""(() => { window.__p = TribeClient.api('/hub/ask', { method: 'POST', body: { prompt: 'hi' } }).catch(() => {});
              return [document.querySelector('#rail-logo img.logo').src, document.querySelector('#rail-logo').title]; })()""")
            assert "Thinking" in st[1], st
            pg.evaluate("window.__p"); pg.wait_for_function("!document.querySelector('#rail-logo').classList.contains('is-busy')", timeout=8000)
            # an agent at work: what an agent does over the socket starts a 20 s spell (same handler, fed directly)
            pg.evaluate("TribeLogo.agentPulse({ id: 'claude-x', name: \"Orion's Claude\", role: 'agent' })")
            pg.wait_for_function("document.querySelector('#rail-logo').classList.contains('is-busy')", timeout=3000)
            assert "Orion's Claude is working" in pg.get_attribute("#rail-logo", "title")
            # "Loading…" placeholders get the flame
            pg.evaluate("const d = document.createElement('div'); d.id = 'lt'; d.textContent = 'Loading…'; document.body.appendChild(d)")
            pg.wait_for_function("document.querySelector('#lt').classList.contains('tc-loading')", timeout=3000)
            # hover flickers
            pg.wait_for_function("!document.querySelector('#rail-logo').classList.contains('is-busy')", timeout=25000)
            assert pg.evaluate("getComputedStyle(document.querySelector('#rail-logo img.logo')).width") == "60px"   # feat/shell-polish: the mark fills its pressed tile (rail.css)
            b.close()
        assert not errors, errors
        print("e2e_logo: OK (rests when idle, flickers for prompts in flight and on hover, Loading… gets the flame)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()

if __name__ == "__main__":
    main()
