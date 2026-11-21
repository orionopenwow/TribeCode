"""Online and offline in one set of words (p10, docs/ONLINE-MODES.md, app/ui/tribestatus.js).
  - the host's line under the name says "On this computer"; a friend's says "On Camp's computer"; the hosting pill agrees;
  - tapping the line opens one card with what it means and Run your own server;
  - the host's computer goes off: the friend's line, the top pill and the offline line all say the same thing, with the
    waiting count ("Offline · 1 waiting"), and the invite sheet shows one friendly line with Try again (never
    "Couldn't open this"), for a friend and for an AI helper;
  - back online: the waiting message sends, the invite sheet draws the link by itself;
  - Run your own server: the Docker and Node commands carry the generated setup code, the Tailscale part is honest;
  - GitHub says the same thing in Where it lives as the server does (a fake GitHub answer: signed in as @camp, then not).
GitHub's real API is never called: /api/github is answered in the page. Usage: python app/test/e2e_online_modes.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5600 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'online-{name}.png'))

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-online-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    def start(): return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    def up():
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); return
            except Exception: time.sleep(0.25)
        raise AssertionError("server did not start")
    srv = start(); up()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1300, "height": 820}); host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeStatus", timeout=20000)
            htok = host.evaluate("TribeStore.get().server.token"); inv = api("/invites", "POST", {"maxUses": 5}, htok)[1]["invite"]["code"]

            # the host: one place, one set of words
            host.wait_for_function("(document.querySelector('#ub-st') || {}).textContent === 'On this computer'", timeout=10000)
            assert host.get_attribute("#ub-st", "data-tone") == "live"
            assert host.evaluate("TribeStatus.now().key") == "here"
            host.click("#ub-st"); host.wait_for_selector("#ts-pop")
            pop = host.inner_text("#ts-pop"); assert "On this computer" in pop and "Run your own server" in pop and "Invite a friend" in pop, pop
            shot(host, "host-card")
            host.click("#ts-pop [data-ts='server']"); host.wait_for_selector("#os-sheet")
            code = host.inner_text("#os-code").strip(); cmd = host.inner_text("#os-cmd-text")
            assert len(code) >= 12 and f"TRIBE_SETUP_CODE={code}" in cmd and "docker run" in cmd and "--restart unless-stopped" in cmd and "-v tribecode-data:/data" in cmd, cmd
            host.click("[data-os-kind='node']"); cmd = host.inner_text("#os-cmd-text")
            assert f"TRIBE_CLOUD=1 TRIBE_SETUP_CODE={code} npm start" in cmd and "git clone https://github.com/orionopenwow/TribeCode.git" in cmd, cmd
            assert host.input_value("#os-setup") == code
            ts = host.inner_text("#os-p2p"); assert "Not built yet" in ts and "has to be on" in ts, ts
            shot(host, "own-server")
            host.keyboard.press("Escape"); host.wait_for_timeout(300)

            # GitHub: the same status in Where it lives as the server says (a fake answer, nothing reaches GitHub)
            host.route("**/api/github", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"github": {"signedIn": True, "login": "camp", "configured": True, "flow": {"state": "none"}}})))
            host.evaluate("TribeWhere.open(TribeClient.project())"); host.wait_for_selector("#whl-gh .ghc-chip-t b", timeout=10000)
            host.wait_for_function("/Connected as @camp/.test(document.querySelector('#whl-gh').innerText)", timeout=8000)
            assert host.locator("#whl-gh .ghc-chip-go").count() == 0, "no Connect when connected"
            assert "On this computer" in host.inner_text("[data-whl-runs]")
            host.unroute("**/api/github")
            host.route("**/api/github", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"github": {"signedIn": False, "configured": True, "flow": {"state": "none"}}})))
            host.evaluate("TribeGitHubConnect.chip(document.querySelector('#whl-gh'))")
            host.wait_for_function("/Not connected/.test(document.querySelector('#whl-gh').innerText) && !!document.querySelector('#whl-gh .ghc-chip-go')", timeout=8000)
            host.click("#whl-gh .ghc-chip-go"); host.wait_for_selector("#ghc-sheet", timeout=8000)   # Connect opens the one sheet
            host.unroute("**/api/github"); host.keyboard.press("Escape"); host.wait_for_timeout(300)
            host.evaluate("document.querySelectorAll('.ui-scrim').forEach(s => s.click())"); host.wait_for_timeout(300)

            # a friend
            fr = b.new_context(viewport={"width": 1300, "height": 820}).new_page(); fr.on("pageerror", lambda e: errors.append(f"friend: {e}"))
            fr.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")
            fr.goto(f"{BASE}/join/{inv}"); fr.wait_for_selector("#form:not(.hidden)"); fr.fill("#name", "Maya"); fr.click("#go")
            fr.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeStatus", timeout=20000)
            fr.wait_for_function("(document.querySelector('#ub-st') || {}).textContent === \"On Camp's computer\"", timeout=10000)
            fr.evaluate("TribeInvite.open()"); fr.wait_for_function("/\\/t\\//.test((document.querySelector('#tl-link') || {}).textContent || '')", timeout=10000)   # the link is kept for later
            fr.evaluate("TribeInvite.close()"); fr.evaluate("TribeApp.show('chat')"); fr.wait_for_timeout(500)

            # ---------- the host's computer goes off ----------
            srv.terminate(); srv.wait()
            fr.wait_for_function("TribeClient.state().status !== 'online'", timeout=15000)
            fr.evaluate("TribeClient.queue('/chat/general', { text: 'off-modes one', cid: 'om-1' }, { kind: 'chat', ch: 'general', label: 'off-modes one' })")
            fr.wait_for_function("(document.querySelector('#ub-st') || {}).textContent === 'Offline · 1 waiting'", timeout=20000)
            assert fr.get_attribute("#ub-st", "data-tone") == "off"
            fr.wait_for_selector("#health-pill:not(.hidden)", timeout=10000)
            assert fr.inner_text("#health-pill").strip() == "Offline · 1 waiting", fr.inner_text("#health-pill")
            fr.wait_for_selector("#chat-offline", timeout=10000)
            assert "Camp's computer is off or asleep" in fr.inner_text("#chat-offline")
            assert "Camp's computer is off or asleep" in fr.evaluate("TribeStatus.now().sub")
            # invites say why, with the one fix, and offer the tribe link from last time
            fr.evaluate("TribeInvite.open()"); fr.wait_for_selector("#io-pane .io-cant[data-cant='offline']", timeout=10000)
            txt = fr.inner_text("#invite-body")
            assert "Couldn't open this" not in txt and "Couldn’t open this" not in txt and "needs the tribe online" not in txt.lower(), txt
            assert "Camp's computer is off or asleep" in txt and "Try again" in txt and "/t/" in txt, txt
            shot(fr, "invite-offline-pre"); h = fr.evaluate("document.querySelector('#invite-body').getBoundingClientRect().height"); assert h < 720, f"no tall empty card: {h}"
            shot(fr, "invite-offline")
            fr.click("#io-who-agent"); fr.wait_for_selector("#io-pane .io-cant", timeout=10000)
            assert "Couldn" not in fr.inner_text("#io-pane"), fr.inner_text("#io-pane")
            fr.click("#io-who-friend"); fr.wait_for_selector("#io-pane .io-cant", timeout=10000)

            # ---------- back ----------
            srv = start(); up()
            fr.wait_for_function("TribeClient.state().status === 'online'", timeout=30000)
            fr.wait_for_selector("#io-pane #tl-link", timeout=15000)   # the link draws itself when the tribe is back
            fr.wait_for_function("(document.querySelector('#ub-st') || {}).textContent === \"On Camp's computer\"", timeout=15000)
            for _ in range(40):
                st, d = api("/chat/general", token=htok); lst = d if isinstance(d, list) else (d.get("messages") or [])
                if any(m.get("text") == "off-modes one" for m in lst): break
                time.sleep(0.5)
            else: raise AssertionError("the waiting message never sent")
            fr.evaluate("TribeInvite.close()")

            # phone: the invite sheet's friendly line fits
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
            ph.goto(BASE + "/?skipIntro=1&demo=1"); ph.wait_for_timeout(1500)
            ph.evaluate("window.TribeInvite && TribeClient.connected() && TribeInvite.open({ who: 'agent' })"); ph.wait_for_timeout(800)
            if ph.locator("#io-pane .io-cant").count():
                sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll: {sw}"
                assert "Couldn" not in ph.inner_text("#io-pane"), ph.inner_text("#io-pane")
                shot(ph, "invite-demo-390")
            b.close()
        assert not [e for e in errors if "Failed to fetch" not in e and "WebSocket" not in e], errors
        print("e2e_online_modes: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
