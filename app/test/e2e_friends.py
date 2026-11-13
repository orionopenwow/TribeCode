"""Friends (the People panel's Friends tab; the old Friends button is retired), one-time guest passes, and the Windows desktop origin (http://tauri.localhost)
signing in to its own server. Usage: python app/test/e2e_friends.py
"""
import json, os, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error, mimetypes
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4915 + OFF
BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fr-", dir="/tmp"))
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

            # 1) The Windows desktop app's page is http://tauri.localhost (its bundled files; any unknown path returns
            #    index.html, like Tauri). It must talk to its saved server, not to its own origin.
            # WebView2 today: Private Network Access preflights enforced (Chrome's newer Local Network Access prompt isn't
            # in WebView2 yet), so the server must answer the preflight with Access-Control-Allow-Private-Network.
            wb = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-features=LocalNetworkAccessChecks",
                 "--enable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults"])
            desk = wb.new_context(viewport={"width": 1280, "height": 800})
            def tauri(route):
                path = route.request.url.split("tauri.localhost", 1)[1].split("?")[0].split("#")[0].lstrip("/") or "index.html"
                f = UI / path
                if not f.is_file() or path.startswith("api/"): f = UI / "index.html"
                route.fulfill(status=200, body=f.read_bytes(), content_type=mimetypes.guess_type(str(f))[0] or "text/html")
            desk.route("http://tauri.localhost/**", tauri)
            dp = desk.new_page(); dp.on("pageerror", lambda e: errors.append("desk: " + str(e)))
            dp.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', server: {{url: '{BASE}', token: ''}}}}))")
            dp.goto("http://tauri.localhost/?skipIntro=1")
            dp.wait_for_function("window.TribeClient", timeout=15000)
            assert dp.evaluate("TribeClient.base()") == BASE, dp.evaluate("TribeClient.base()")
            # the page signs in by itself on start (it becomes the host of the empty tribe)
            try: dp.wait_for_function("TribeStore.get().server.token", timeout=15000)
            except Exception: raise AssertionError(dp.evaluate("window.__authError"))
            assert api("/health")[1]["members"] == 1
            host_tok = dp.evaluate("TribeStore.get().server.token"); assert host_tok
            desk.close(); wb.close()

            # 2) The old Friends button is gone; its entry points open People › Friends; star a friend; one-time guest pass
            st, inv = api("/invites", "POST", {"role": "builder", "maxUses": 3}, token=host_tok)
            st, sam = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Sam"}); assert st == 200, sam
            host = b.new_page(viewport={"width": 1440, "height": 900}); host.on("pageerror", lambda e: errors.append("host: " + str(e)))
            host.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', server: {{url: '{BASE}', token: '{host_tok}'}}}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("TribeClient.connected()", timeout=15000)
            assert host.evaluate("!document.querySelector('#fr-btn, #fr-panel')"), "the old Friends button and panel are retired"
            host.evaluate("TribeFriends.open()"); host.wait_for_selector("#ppl-panel:not([hidden])")
            assert host.evaluate("document.querySelector('#ppl-panel [data-tab=friends]').getAttribute('aria-selected')") == "true", "old entry points land on Friends"
            host.click("#ppl-close"); host.wait_for_selector("#ppl-panel", state="hidden")
            host.click("#ppl-btn"); host.click("#ppl-panel [data-tab=friends]")
            star = f"#ppl-body [data-star='{sam['member']['id']}']"
            host.wait_for_selector(star, timeout=10000); host.click(star)
            host.wait_for_selector(star + ".on", timeout=10000)
            assert "Sam" in host.text_content("#ppl-body")
            assert api("/friends", token=host_tok)[1]["friends"] == [sam["member"]["id"]]
            assert host.evaluate("TribeFriends.list()") == [sam["member"]["id"]]
            host.click("#ppl-guest"); host.wait_for_selector("#invite-modal:not(.hidden) #io-pane[data-who='guest'] #io-guest-make", timeout=10000)   # the one invite sheet, on A guest for a day
            host.click("#io-guest-make"); host.wait_for_selector("#io-guest-link", timeout=10000)
            link = host.text_content("#io-guest-link").strip(); host.evaluate("TribeInvite.close()"); code = link.rstrip("/").split("/")[-1].split("c=")[-1]
            assert "/join/" in link or "go.html" in link, link
            if "--shots" in sys.argv: host.screenshot(path=str(ROOT / "docs" / "screenshots" / "friends.png"))
            st, g = api("/join", "POST", {"code": code, "name": "Guest Gia"}); assert st == 200 and g["member"].get("guest"), g
            assert api("/join", "POST", {"code": code, "name": "Second"})[0] in (404, 410), "guest pass works once"
            assert api("/members", token=g["token"])[0] == 200
            # make the guest pass run out: the account stops working and leaves the list
            srv.send_signal(signal.SIGTERM); srv.wait(10)
            mf = tmp / "tribe" / ".tribe" / "members.json"; ms = json.loads(mf.read_text())
            for m in ms:
                if m.get("guestUntil"): m["guestUntil"] = "2000-01-01T00:00:00.000Z"
            mf.write_text(json.dumps(ms))
            srv2 = subprocess.Popen(srv.args, stdout=log, stderr=subprocess.STDOUT, env=env)
            globals()["srv"] = srv2
            for _ in range(60):
                try:
                    if api("/health")[0] == 200: break
                except Exception: pass
                time.sleep(0.25)
            assert api("/members", token=g["token"])[0] == 401, "expired guest refused"
            assert not any(m["name"] == "Guest Gia" for m in api("/members", token=host_tok)[1]["members"]), "expired guest hidden"
            # phone: the panel fits at 390px
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Sam', server: {{url: '{BASE}', token: '{sam['token']}'}}}}))")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeFriends.open()"); ph.wait_for_selector("#ppl-panel:not([hidden])")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            b.close()
        assert not errors, errors
        print("e2e_friends: OK (desktop origin signs in, People › Friends, one-time guest pass expires)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-2000:]); raise
    finally:
        s = globals().get("srv", srv)
        for x in {srv, s}:
            try: x.send_signal(signal.SIGTERM); x.wait(10)
            except Exception: pass


if __name__ == "__main__":
    main()
