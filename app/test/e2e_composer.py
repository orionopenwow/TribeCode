"""The message box (v0.21): a textarea with no password-autofill hints, Enter sends and Shift+Enter makes a new line,
it grows with the text, the phone format strip wraps the selection in Markdown, the newest message stays above the
box, and the Add to Home Screen tip never covers the chat."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5310 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(r) as x: return json.loads(x.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cp-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: api("/health"); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            c = b.new_context(**p.devices["iPhone 13"]); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})); localStorage.removeItem('tribecode.iosHint') } catch (e) {}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeComposer", timeout=15000)
            tok = pg.evaluate("TribeStore.get().server.token")
            for i in range(14): api("/chat/general", "POST", {"text": f"message number {i}"}, token=tok)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-input", state="visible")
            a = pg.evaluate("(() => { const e = document.getElementById('chat-input'); return [e.tagName, e.getAttribute('autocomplete'), e.getAttribute('enterkeyhint'), e.hasAttribute('data-1p-ignore'), e.getAttribute('autocapitalize')]; })()")
            assert a == ["TEXTAREA", "off", "send", True, "sentences"], a
            # the tip never covers the chat
            assert not pg.locator(".ios-hint").is_visible()
            # newest message visible above the box
            pg.wait_for_function("[...document.querySelectorAll('#chat-list .msg')].some(m => m.textContent.includes('message number 13'))", timeout=10000)
            last = pg.locator("#chat-list .msg", has_text="message number 13").last.bounding_box(); box = pg.locator("#chat-input").bounding_box()
            assert last["y"] + last["height"] <= box["y"] + 2, (last, box)
            # Shift+Enter makes a new line and the box grows; Enter sends once
            pg.click("#chat-input"); h0 = pg.locator("#chat-input").bounding_box()["height"]
            pg.keyboard.type("line one"); pg.keyboard.press("Shift+Enter"); pg.keyboard.type("line two")
            assert pg.input_value("#chat-input") == "line one\nline two"
            assert pg.locator("#chat-input").bounding_box()["height"] > h0
            pg.keyboard.press("Enter")
            pg.wait_for_function("document.getElementById('chat-input').value === ''")
            time.sleep(1)
            msgs = [m["text"] for m in api("/chat/general?limit=50", token=tok)["messages"] if m.get("text")]
            assert msgs.count("line one\nline two") == 1, msgs[-3:]
            # format strip (phones, while typing): bold wraps the selection
            pg.evaluate("document.body.classList.add('kb-open')")
            assert pg.locator("#cf-bar").is_visible()
            pg.fill("#chat-input", "make it loud"); pg.evaluate("document.getElementById('chat-input').setSelectionRange(8, 12)")
            pg.click("#cf-bar [data-cf='b']")
            assert pg.input_value("#chat-input") == "make it **loud**", pg.input_value("#chat-input")
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_composer")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
