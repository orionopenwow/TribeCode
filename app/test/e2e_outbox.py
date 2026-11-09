"""The outbox (v0.20): your message shows at once, waits while you're offline or the tribe is waking up, then sends by
itself, exactly once (a client id makes a resend harmless). Queued messages survive a reload."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5260 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def count(tok, text):
    return sum(1 for m in api("/chat/general?limit=200", token=tok)[1]["messages"] if m.get("text") == text)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ob-", dir="/tmp"))
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
            tok = host.evaluate("TribeStore.get().server.token")
            # a resend with the same client id posts once
            for _ in range(2): assert api("/chat/general", "POST", {"text": "only once", "cid": "abc123xyz"}, token=tok)[0] == 200
            assert count(tok, "only once") == 1
            # online: shows at once (faint), then turns into the real message
            host.evaluate("TribeApp.show('chat')"); host.wait_for_selector("#chat-input")
            host.fill("#chat-input", "hello right away"); host.press("#chat-input", "Enter")
            host.wait_for_function("[...document.querySelectorAll('#chat-list .msg')].some(m => m.innerText.includes('hello right away'))", timeout=3000)
            host.wait_for_function("!document.querySelector('#chat-list .msg.pending')", timeout=10000)
            assert count(tok, "hello right away") == 1
            # offline: waits, survives a reload... then sends by itself once
            hc.set_offline(True); host.wait_for_timeout(800)
            host.fill("#chat-input", "sent while offline"); host.press("#chat-input", "Enter")
            host.wait_for_selector("#chat-list .msg.pending", timeout=3000)
            assert "sent while offline" in host.inner_text("#chat-list .msg.pending")
            assert host.evaluate("TribeClient.outbox().length") == 1
            host.wait_for_selector("#health-pill:not(.hidden)", timeout=8000); assert "waiting" in host.inner_text("#health-pill").lower()   # the health pill says so
            host.wait_for_timeout(1500); assert count(tok, "sent while offline") == 0
            hc.set_offline(False)
            host.wait_for_function("TribeClient.outbox().length === 0", timeout=20000)
            host.wait_for_function("!document.querySelector('#chat-list .msg.pending')", timeout=10000)
            time.sleep(0.5); assert count(tok, "sent while offline") == 1
            try: host.wait_for_selector("#health-pill.hidden", state="attached", timeout=8000)   # quiet again
            except Exception: raise AssertionError(host.evaluate("[document.querySelector('#health-pill').className, document.querySelector('#health-pill').innerText, TribeClient.state().status, navigator.onLine]"))
            # Refresh TribeCode: caches gone, still signed in, same tribe, back on the same view
            me = host.evaluate("TribeClient.state().me.id")
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_timeout(300)
            host.evaluate("setTimeout(() => TribeSelfHeal.refresh(), 50)"); host.wait_for_url(lambda u: "fresh=" in u, timeout=15000)
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            assert host.evaluate("TribeClient.state().me.id") == me
            assert host.evaluate("caches.keys().then(k => k.length)") <= 1   # the new service worker may cache again; the old copies are gone
            b.close()
        if errors: raise AssertionError("errors:\n" + "\n".join(errors))
        print("e2e_outbox: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
