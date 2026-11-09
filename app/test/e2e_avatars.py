"""Avatars (v0.24): themed icon packs (campfire, space, ocean, fantasy, tech, food, play) and the avatar maker (skin,
hair, hair color, eyes, mouth, an extra, a shirt, Surprise me). Saving keeps the choice; the server refuses unknown parts."""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5360 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-av-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        time.sleep(2)
        tok = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        st, r = api("/profile", "PATCH", {"avatar": {"kind": "pixel", "pixel": "rocket", "tint": "indigo"}}, token=tok); assert st == 200, r
        st, r = api("/profile", "PATCH", {"avatar": {"kind": "maker", "spec": {"s": 2, "h": 3, "hc": 4, "e": 1, "m": 0, "x": 1, "sh": 2}, "tint": "teal"}}, token=tok); assert st == 200, r
        assert api("/profile", "PATCH", {"avatar": {"kind": "maker", "spec": {"h": 99}}}, token=tok)[0] == 400
        assert api("/profile", "PATCH", {"avatar": {"kind": "pixel", "pixel": "not-a-thing"}}, token=tok)[0] == 400
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1300, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Camp', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint: true, brain: true, ai: true}})) }} catch (e) {{}}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeProfiles", timeout=15000)
            assert pg.evaluate("Object.keys(TribeProfiles.packs).length") == 7 and pg.evaluate("TribeProfiles.pixels.length") >= 60
            pg.evaluate("TribeProfiles.edit()"); pg.wait_for_selector("[data-tab='maker']")
            pg.click("[data-tab='pixel']"); pg.click("[data-pack='ocean']"); pg.wait_for_selector("[data-px='octopus']"); pg.click("[data-px='octopus']")
            pg.click("[data-tab='maker']"); pg.wait_for_selector(".pf-mk-prev svg")
            pg.click("[data-mk='h:5']"); pg.click("[data-mk='x:4']"); pg.click("[data-mk-rnd]"); pg.click("[data-mk='x:2']")
            pg.click("[data-ed='save'], .pf-ed-foot .btn.primary")
            time.sleep(1)
            a = api("/profile", token=tok)[1]["profile"]["avatar"]
            assert a["kind"] == "maker" and a["spec"]["x"] == 2, a
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_avatars")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
