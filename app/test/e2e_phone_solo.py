"""Phone hosting (docs/PHONE-HOSTING.md): on a 390px phone with no tribe, "+" opens "Where should your tribe live?"
(app/ui/phonehost.js). The Android and Free cloud rows show their steps (Termux one-liner, Render link). "This phone"
starts a REAL tribe in the browser (offline.js solo mode: no pretend people), Flint adds a task by itself with no model,
a doc is written, and a reload keeps everything. Inviting asks to move first. Then "Move to a host" joins a real tribe
server with an invite link and imports it (POST /api/import/solo): the project, task, doc and chat arrive on the host
and the phone is signed in there. No console errors, no sideways scroll.
Usage: python app/test/e2e_phone_solo.py [--shots]
"""
import functools, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SPORT, HPORT = 5540 + OFF, 5620 + OFF
STATIC, HOST = f"http://localhost:{SPORT}", f"http://localhost:{HPORT}"
SHOTS = Path(os.environ.get("PH_SHOTS") or tempfile.mkdtemp(prefix="tribe-ph-shots-")); SHOTS.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()

def api(method, path, body=None, token=None):
    req = urllib.request.Request(HOST + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b"{}")

def wait_health(url, n=80):
    for _ in range(n):
        try: urllib.request.urlopen(url + "/api/health", timeout=2); return
        except Exception: time.sleep(0.25)
    raise SystemExit("host did not start")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ph-"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    host = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(HPORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                            stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        wait_health(HOST)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")
            ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false}))}catch(e){}")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
            pg.goto(STATIC + "/?skipIntro=1")
            pg.wait_for_function("window.TribePhoneHost && window.TribeOffline && window.TribeMobile", timeout=15000)

            # 1. the chooser: four homes, one row each
            pg.evaluate("TribeMobile.startTribe()")
            pg.wait_for_selector("#ph-start", state="visible")
            rows = pg.eval_on_selector_all("#ph-start .ph-row b", "els => els.map(e => e.childNodes[0].textContent.trim())")
            assert rows == ["This phone", "Free cloud", "My Android", "A computer"], rows
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "sideways scroll in chooser"
            pg.screenshot(path=str(SHOTS / "ph-1-chooser.png"))
            pg.click("#ph-start [data-ph='android']"); pg.wait_for_selector("#ph-android #ph-line")
            assert "termux-host.sh" in pg.text_content("#ph-line")
            pg.screenshot(path=str(SHOTS / "ph-2-android.png"))
            pg.click("#ph-android [data-ph-back]"); pg.wait_for_selector("#ph-start")
            pg.click("#ph-start [data-ph='cloud']"); pg.wait_for_selector("#ph-cloud #ph-render")
            assert "render.com/deploy" in pg.get_attribute("#ph-render", "href")
            pg.click("#ph-cloud [data-ph-back]"); pg.wait_for_selector("#ph-start")

            # 2. This phone: a real, empty tribe (no pretend friends)
            pg.click("#ph-start [data-ph='phone']")
            pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=15000)
            st = pg.evaluate("TribeOffline.state()")
            assert [m["id"] for m in st["members"]] == ["me"], st["members"]
            assert st["projects"][0]["name"] == "My first project"
            pg.wait_for_selector("#demo-pill.solo", state="visible")
            assert "On this phone" in pg.text_content("#demo-pill")

            # 3. Flint adds a task with no model (the built-in intent router)
            pg.evaluate("TribeFlint.ask('add a task: sketch the home screen')")
            pg.wait_for_function("(TribeOffline.state().tasks['first-project'] || []).some(t => /sketch the home screen/i.test(t.title))", timeout=10000)
            pg.wait_for_function("TribeFlint.thread().slice(-1)[0].who === 'flint' && /Added to Tasks/.test(TribeFlint.thread().slice(-1)[0].text)", timeout=8000)
            # a doc and a chat message through the same API the app uses
            pg.evaluate("TribeClient.api('/docs', { method: 'POST', body: { title: 'Ideas', body: '# Ideas\\n\\n- a calm home screen' } })")
            pg.evaluate("TribeClient.api('/chat/general', { method: 'POST', body: { text: 'first thought from the bus' } })")
            pg.wait_for_function("(TribeOffline.state().docs['first-project'] || []).length === 1", timeout=8000)
            time.sleep(1.2)
            assert not any(m["by"] in ("maya", "claude") for m in pg.evaluate("TribeOffline.state().chat['first-project']")), "a pretend person answered in solo mode"

            # 4. a reload keeps everything
            pg.reload(); pg.wait_for_function("window.TribeOffline && TribeOffline.solo() && TribeClient.connected()", timeout=15000)
            st = pg.evaluate("TribeOffline.state()")
            assert len(st["tasks"]["first-project"]) == 1 and len(st["docs"]["first-project"]) == 1, "reload lost the phone tribe"

            # 5. inviting asks to move first
            r = pg.evaluate("TribeClient.api('/invites', { method: 'POST', body: {} }).then(() => 'ok', e => e.message)")
            assert "Move it to a host" in r, r
            pg.wait_for_selector("#ph-move-sheet", state="visible", timeout=5000)
            pg.screenshot(path=str(SHOTS / "ph-3-move.png"))

            # 6. move to a real host with an invite link
            inv = api("POST", "/host/quick-invite", {"name": "Host Hal", "share": False})
            link = inv["join"]
            pg.fill("#ph-inv", link)
            pg.click("#ph-move")
            # the page moves to the host's own address, signed in there with a device link (/m/<key>/)
            pg.wait_for_url(f"**:{HPORT}/m/**", timeout=20000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            token = pg.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1')).server.token")
            assert token and token != "offline-demo", token
            pg.goto(STATIC + "/?skipIntro=1"); pg.wait_for_function("window.TribeOffline", timeout=15000)
            assert pg.evaluate("localStorage.getItem('tribecode.offlineDemo.v1')") is None, "the phone copy should be gone after a move"
            projs = api("GET", "/projects", token=token)["projects"]
            moved = [x for x in projs if x["name"] == "My first project"]
            assert moved, [x["name"] for x in projs]
            pid = moved[0]["id"]
            req = urllib.request.Request(HOST + "/api/tasks", headers={"Authorization": "Bearer " + token, "X-Project": pid})
            tasks = json.loads(urllib.request.urlopen(req, timeout=10).read())["tasks"]
            assert any("sketch the home screen" in t["title"].lower() for t in tasks), tasks
            req = urllib.request.Request(HOST + "/api/docs", headers={"Authorization": "Bearer " + token, "X-Project": pid})
            docs = json.loads(urllib.request.urlopen(req, timeout=10).read())
            docs = docs.get("docs", docs) if isinstance(docs, dict) else docs
            assert any(d.get("title") == "Ideas" for d in docs), docs
            req = urllib.request.Request(HOST + "/api/chat/general?limit=50", headers={"Authorization": "Bearer " + token, "X-Project": pid})
            msgs = json.loads(urllib.request.urlopen(req, timeout=10).read())["messages"]
            assert any("first thought from the bus" in m["text"] for m in msgs), [m["text"] for m in msgs]
            # a stranger without the right can't import
            try:
                api("POST", "/import/solo", {"projects": [{"name": "x"}]}); raise AssertionError("import without a key worked")
            except urllib.error.HTTPError as e: assert e.code in (401, 403), e.code
            pg.screenshot(path=str(SHOTS / "ph-4-moved.png"))
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print(f"e2e_phone_solo: OK (chooser, android + cloud steps, solo tribe, Flint task without a model, reload, move to host)  shots: {SHOTS}")
    finally:
        host.terminate(); srv.shutdown()

if __name__ == "__main__":
    main()
