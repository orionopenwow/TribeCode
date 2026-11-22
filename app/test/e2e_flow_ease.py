"""Ease of flow (feat/flow-ease): small things a newcomer tripped on, each checked where it shows.

A. No tribe, then a tribe kept in this browser (plain files, nothing behind the page):
   1. Home's ideas card says what to do in plain words (no "local model on the tribe's host").
   2. The dashboard says the project "is saved on this device" (it said "lives on this phone" on a laptop).
   3. Changing the vision posts "The vision was updated" in chat (it said "VISION.md was updated").
   4. Agents › Connect your AI: no key that never arrives. One plain line and the one button, Put this tribe online.
   5. The tool tabs end in "Another tool" (was "Other MCP"), and the lead says "goes live" (was "ships").
B. A tribe on a server:
   6. Publish with nothing made yet: "Nothing to put online yet" and one main button, Make a website, which opens
      the website designer (it showed a red error and only "Open the Launch kit").
   7. Changing the vision posts "The vision was updated" there too.
   8. Files › Website asks for screenshots without naming a tool call ("add_visual").
Usage: python app/test/e2e_flow_ease.py
"""
import functools, http.server, json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
WEB = 5899 + OFF; PORT = 5900 + OFF; BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def until(pg, js, timeout=25, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what or js}")

def static_server():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", WEB), functools.partial(H, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ease-", dir="/tmp"))
    static_server()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- A. no tribe, then a tribe kept in this browser ----------
            pg = b.new_page(viewport={"width": 1280, "height": 820}); pg.on("pageerror", lambda e: errors.append(f"web: {e}"))
            pg.goto(f"http://localhost:{WEB}/"); pg.wait_for_selector("#hub-idea", timeout=20000); time.sleep(1.0)
            home = pg.inner_text("#view-hub") if pg.query_selector("#view-hub") else pg.inner_text("body")
            assert "local model" not in home and "tribe's host" not in home and "tribe’s host" not in home, "1: Home has no host or local-model talk"
            assert "Ideas for what to do next show up here once you have a project" in pg.inner_text("body"), "1: the ideas card says what to do"
            pg.fill("#hub-idea", "A website for my friend's bakery"); pg.click("#hub-idea-go")
            until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version shows"); time.sleep(0.8)
            pg.evaluate("TribeFirstLook.close && TribeFirstLook.close()"); pg.evaluate("TribeApp.show('home')")
            until(pg, "/is saved on this device/.test(document.querySelector('#view-home').innerText)", 20, "2: the dashboard says saved on this device")
            assert "this phone" not in pg.inner_text("#view-home"), "2: a laptop is not called a phone"
            pg.evaluate("TribeClient.api('/vision', { method: 'PUT', body: { text: 'A website for my friend\\'s bakery, with the menu' } })"); time.sleep(0.6)
            pg.evaluate("TribeShell.go('chat')"); until(pg, "/The vision was updated/.test(document.body.innerText)", 15, "3: chat says the vision was updated")
            assert "VISION.md" not in pg.inner_text("#view-chat"), "3: no file name in chat"
            # Agents & office (v0.46): Add an AI helper → Claude in a browser tribe says what it needs, with one button
            pg.evaluate("TribeShell.go('ws-agents')"); pg.wait_for_selector("[data-ao-pick='claude']", timeout=15000)
            t0 = pg.inner_text("#view-coord")
            assert "ships" not in t0 and "Another tool" in t0 and "Other MCP" not in t0, ("5", t0[:400])
            pg.click("[data-ao-pick='claude']"); pg.wait_for_selector("[data-sc-online]:visible", timeout=10000)
            t = pg.evaluate("[...document.querySelectorAll('[data-sc-online]')].filter(b => b.offsetParent).map(b => (b.closest('.sc-needs, .fl-needs, .ph, .ui-sheet, section') || b).innerText).join(' ')")
            assert "Making a key" not in t and "online" in t, ("4", t[:400])
            pg.locator("[data-sc-online]:visible").first.click(); pg.wait_for_selector("#su-where, .su-where, [id^=su-]", timeout=10000)   # the one button goes to where it's kept
            pg.close(); print("  A: plain words on Home and the dashboard, the vision line in chat, and Connect your AI says what it needs with one button")

            # ---------- B. a tribe on a server ----------
            tok = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
            c = b.new_context(viewport={"width": 1440, "height": 900})
            c.add_init_script(f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); }} catch (e) {{}}")
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"tribe: {e}"))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePublish && window.TribeProjects", timeout=20000); time.sleep(1.0)
            pg.evaluate("TribePublish.open()"); pg.wait_for_selector("#pb-none [data-pb-make]", timeout=15000)
            t = pg.inner_text("#pb-body"); assert "Nothing to put online yet" in t and "Make a website" in t and pg.locator("#pb-body .pb-err").count() == 0, ("6", t)
            assert pg.locator("#pb-body .btn.primary").count() == 1, "6: one main button"
            pg.click("#pb-none [data-pb-make]"); pg.wait_for_function("window.TribeSiteDesigner && TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=25000)
            pg.evaluate("TribeSiteDesigner.close()"); time.sleep(0.6)
            ok(api("/vision", "PUT", {"text": "A cozy game about lanterns"}, token=tok)); time.sleep(0.5)
            msgs = json.dumps(ok(api("/chat/general", token=tok)))
            assert "The vision was updated" in msgs and "VISION.md was updated" not in msgs, "7: the chat line"
            src = (UI / "website.js").read_text(); assert "add_visual" not in src.split("wb-note")[1][:200] if "wb-note" in src else True
            assert "let your agent call" not in src, "8: no tool call named in the screenshots note"
            b.close(); print("  B: Publish with nothing made offers Make a website; the vision line in chat is plain")
        assert not errors, errors
        print("e2e_flow_ease: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
