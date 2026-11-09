"""Sign-in that survives cleared storage (v0.19.6): joining sets an HttpOnly cookie; when the browser's storage comes up
empty (iPhone Safari's 7-day wipe, a cleared cache, another address of the same tribe), the app signs you back in from it.
Pages can't read the cookie, an agent's key never comes back this way, and a bad cookie signs nobody in."""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5230 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None, cookie=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if cookie: h["Cookie"] = cookie
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"{}"), x.headers
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}"), e.headers

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sess-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hc = b.new_context(); host = hc.new_page(); host.on("pageerror", lambda e: errors.append("host " + str(e)))
            host.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            htok = host.evaluate("TribeStore.get().server.token")
            st, inv, _ = api("/invites", "POST", {"maxUses": 5}, token=htok); code = inv["invite"]["code"]

            fc = b.new_context(); fr = fc.new_page(); fr.on("pageerror", lambda e: errors.append("friend " + str(e)))
            fr.goto(f"{BASE}/join/{code}"); fr.wait_for_selector("#form:not(.hidden)")
            fr.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")
            fr.fill("#name", "Jay"); fr.click("#go"); fr.wait_for_url(BASE + "/")
            fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            ck = [c for c in fc.cookies() if c["name"] == "tribe_s"]
            assert ck and ck[0]["httpOnly"] and ck[0]["sameSite"] == "Lax", ck
            assert fr.evaluate("document.cookie.indexOf('tribe_s') === -1"), "pages can't read the sign-in cookie"
            # storage wiped: still Jay after a reload
            fr.evaluate("localStorage.clear(); sessionStorage.clear()")
            fr.goto(BASE + "/?skipIntro=1"); fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            assert fr.evaluate("TribeClient.state().me.name") == "Jay", fr.evaluate("TribeClient.state().me")
            assert fr.evaluate("TribeStore.get().server.token"), "the key is back in storage"
            # a made-up or revoked cookie signs nobody in
            assert api("/session", cookie="tribe_s=nope")[1]["member"] is None
            assert api("/session")[1]["member"] is None
            b.close()
        if errors: raise AssertionError("errors:\n" + "\n".join(errors))
        print("e2e_session: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
