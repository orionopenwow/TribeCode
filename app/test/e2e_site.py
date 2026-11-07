"""GitHub Pages friend link: go.html#s=<host>&c=<code> checks the host, then hands off to its /join page.
Also: the server's quick invite builds site links for public hosts, and the installed app offers notifications.
Usage: python app/test/e2e_site.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, http.server, threading, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1].parent
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, SITE_PORT = 4786 + OFF, 4785 + OFF
BASE = f"http://localhost:{PORT}"
SITE = f"http://localhost:{SITE_PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def api(path, method="GET", body=None, tok=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"authorization": "Bearer " + tok} if tok else {})})
    try:
        with opener.open(req, timeout=10) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = tempfile.mkdtemp()
    # The "GitHub Pages" site: a static server over app/ui, like the Pages workflow publishes.
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(ROOT / "app" / "ui"))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_TEST_SITE": SITE}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        assert api("/health")[1]["site"] == SITE
        # quick invite: local only, makes the host, plain link for a non-public host
        st, q = api("/host/quick-invite", "POST", {"name": "Orion"})
        assert st == 200 and q["hostOpen"] and "/join/" in q["join"], q
        req = urllib.request.Request(BASE + "/api/host/quick-invite", method="POST", data=b"{}", headers={"content-type": "application/json", "x-forwarded-for": "8.8.8.8"})
        try: opener.open(req, timeout=5); assert False, "tunnelled request must not count as local"
        except urllib.error.HTTPError as e: assert e.code == 403
        code = q["join"].rsplit("/", 1)[1]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # iPhone: site page -> host online -> auto hand-off to the host's join page -> device link
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page()
            ph.goto(f"{SITE}/go.html#s={BASE}&c={code}")
            ph.wait_for_selector("text=Join Campfire Crew"); assert "computer is online" in ph.inner_text("#view")
            assert "Add to Home Screen" in ph.inner_text("#view")
            ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "friend-link-site.png"))
            ph.wait_for_url(f"{BASE}/join/{code}", timeout=8000)
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet")
            # desktop: no auto-redirect, a Continue button and a download link
            dk = b.new_page(viewport={"width": 1200, "height": 800})
            dk.goto(f"{SITE}/go.html#s={BASE}&c={code}"); dk.wait_for_selector("#go")
            assert "Download TribeCode" in dk.inner_text("#view"); dk.wait_for_timeout(1200); assert dk.url.startswith(SITE)
            # expired / bad / offline
            dk.goto(f"{SITE}/go.html#s={BASE}&c=nope1"); dk.wait_for_selector("text=Ask your friend for a fresh link")
            dk.goto(f"{SITE}/go.html#c=abc"); dk.wait_for_selector("text=missing a piece")
            dk.goto(f"{SITE}/go.html#s=http://localhost:{PORT + 7}&c={code}"); dk.wait_for_selector("text=computer is offline", timeout=12000)
            dk.screenshot(path=str(ROOT / "docs" / "screenshots" / "friend-link-offline.png"))
            # the app understands site links when pasted
            app = b.new_page(); app.goto(BASE + "/?skipIntro=1")
            app.wait_for_function("!!(window.TribeApp && window.TribeApp.parseInvite)")
            got = app.evaluate(f"TribeApp.parseInvite('https://orionopenwow.github.io/TribeCode/go.html#s=' + encodeURIComponent('https://pc.tail1.ts.net') + '&c={code}')")
            assert got == {"server": "https://pc.tail1.ts.net", "code": code}, got
            b.close()
        print("Site friend-link test passed")
    finally:
        srv.terminate(); httpd.shutdown()

if __name__ == "__main__":
    main()
