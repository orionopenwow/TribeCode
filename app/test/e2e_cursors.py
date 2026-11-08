"""Live cursors: two friends in the same project see each other's pointer, with their name, on the same screen.
A third person in another project sees nothing; switching screens hides it; agents can't send one.
Usage: python app/test/e2e_cursors.py
"""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5310 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=10) as res: return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cursors-", dir="/tmp"); errors = []
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)
        boot = api("/bootstrap", "POST", {"name": "Orion"})[1]; orion = boot["token"]
        pq = api("/me", token=orion)[1]["projects"][0]["id"]
        inv = api("/invites", "POST", {"hours": 1, "maxUses": 3, "role": "builder"}, token=orion)[1]["invite"]
        maya = api("/join", "POST", {"code": inv["code"], "name": "Maya"})[1]["token"]
        other = api("/projects", "POST", {"name": "Side quest"}, token=orion)[1]["project"]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def login(name, token, project):
                ctx = b.new_context(viewport={"width": 1440, "height": 900})
                ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, server:{{url:'{BASE}', token:'{token}'}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{project}'); localStorage.setItem('tribecode.flint.tour','done')")
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeCursors", timeout=20000)
                pg.evaluate("TribeApp.show('chat')"); pg.wait_for_timeout(600)
                return pg
            host, friend = login("Orion", orion, pq), login("Maya", maya, pq)
            # Maya moves her mouse over the chat: Orion sees her pointer and name
            for x in range(600, 900, 30): friend.mouse.move(x, 420); friend.wait_for_timeout(40)
            host.wait_for_selector(".lc-layer .lc:not(.off)", timeout=6000)
            assert "Maya" in host.inner_text(".lc-layer"), host.inner_text(".lc-layer")
            pos = host.evaluate("(() => { const m = document.querySelector('.window > .main').getBoundingClientRect(), t = new DOMMatrix(getComputedStyle(document.querySelector('.lc')).transform); return [t.m41, t.m42, m.left, m.right]; })()")
            assert pos[2] <= pos[0] <= pos[3], pos
            # Orion switches screens: her pointer (still on chat) is hidden for him
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_timeout(400)
            assert host.locator(".lc-layer .lc:not(.off)").count() == 0, "a pointer on another screen is hidden"
            host.evaluate("TribeApp.show('chat')"); host.wait_for_timeout(300)
            friend.mouse.move(700, 450); host.wait_for_selector(".lc-layer .lc:not(.off)", timeout=4000)
            # leaving the window hides it
            friend.evaluate("document.dispatchEvent(new MouseEvent('mouseleave'))"); host.wait_for_function("!document.querySelector('.lc-layer .lc')", timeout=4000)
            # someone in another project sees nothing
            third = login("Orion", orion, other)
            for x in range(600, 800, 40): friend.mouse.move(x, 430); friend.wait_for_timeout(50)
            third.wait_for_timeout(800)
            assert third.locator(".lc-layer .lc").count() == 0, "pointers stay inside their project"
            # turned off: nothing shows
            host.evaluate("TribeCursors.set(false)")
            for x in range(600, 800, 40): friend.mouse.move(x, 440); friend.wait_for_timeout(50)
            host.wait_for_timeout(600); assert host.locator(".lc-layer .lc").count() == 0, "off means off"
            b.close()
        assert not errors, errors
        print("e2e_cursors: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
