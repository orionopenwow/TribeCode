"""Free cloud in one step (app/ui/cloudhome.js, docs/CLOUD.md). A project starts on this device; "Where should it live?"
› Free cloud shows honest words about napping and one button that opens Render. The person brings back the cloud
address and the setup code, and the project moves in: the app claims the empty cloud tribe itself (no "open the address,
make an invite link, paste it back"). Runs against a real second TribeCode server in cloud mode, reached as a stranger
(an x-forwarded-for header, as a cloud host adds), so the setup code is really checked.
Also: the same fields in the phone chooser and the create flow, an invite link in the address box, and 390px.
Usage: python app/test/e2e_cloud_home.py [--shots]   (--shots writes docs/screenshots/cloud-home.png, cloud-home-phone.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6230 + OFF; BASE = f"http://localhost:{PORT}"
CPORT = 6231 + OFF; CLOUD = f"http://127.0.0.1:{CPORT}"
CODE = "lantern-setup-code"
SHOTS = "--shots" in sys.argv
SHOT_DIR = ROOT / "docs" / "screenshots"
FRESH = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"


def get(base, path, token=None):
    req = urllib.request.Request(base + "/api" + path, headers={"Authorization": "Bearer " + token} if token else {})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b"{}")


def stranger(ctx):
    """Requests to the cloud server arrive the way they do on a real cloud host: through a proxy, never as 'this machine'."""
    def handle(route):
        route.continue_(headers={**route.request.headers, "x-forwarded-for": "203.0.113.9"})
    ctx.route(CLOUD + "/**", handle)


def local_project(pg, name):
    pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub")
    pg.wait_for_function("window.TribeLocalSetup && window.TribeCloudHome && window.TribeApp && TribeApp.fresh()", timeout=15000)
    pg.wait_for_selector("#view-hub:not(.hidden) #hub-host", timeout=10000)
    pg.click("#hub-host"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.fill("#tn-name", name)
    pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']")
    pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go")
    pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=8000)
    pg.wait_for_selector("#tn[data-step='3'] #tn-skip", timeout=8000); pg.click("#tn-skip"); pg.wait_for_selector("#tn", state="detached", timeout=5000)
    pg.evaluate("TribeClient.api('/tasks', { method: 'POST', body: { title: 'Sketch the title screen' } })")
    pg.wait_for_function("Object.values(TribeOffline.state().tasks).some(t => t.length === 1)", timeout=5000)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ch-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    cenv = {**env, "TRIBE_CLOUD": "1", "TRIBE_SETUP_CODE": CODE}
    def serve(port, d, e): return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp / d), "--ollama", "http://localhost:9"], stdout=open(tmp / (d + ".log"), "w"), stderr=subprocess.STDOUT, env=e)
    srv, cloud = serve(PORT, "here", env), serve(CPORT, "cloud", cenv)
    try:
        for base in (BASE, CLOUD):
            for _ in range(80):
                try: get(base, "/health"); break
                except Exception: time.sleep(0.25)
        h = get(CLOUD, "/health"); assert h["cloud"] and h["members"] == 0, h
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(**kw):
                ctx = b.new_context(viewport={"width": 1280, "height": 820}, **kw); ctx.add_init_script(FRESH); stranger(ctx)
                pg = ctx.new_page()
                pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
                pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
                return pg

            # ---------- 1. the sheet: honest words, one button, two fields ----------
            pg = page(); local_project(pg, "Pixel Quest")
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where")
            row = pg.inner_text("#su-where [data-su='cloud']")
            assert "naps" in row and "Always online" not in row, row
            pg.click("#su-where [data-su='cloud']"); pg.wait_for_selector("#su-cloud #su-render")
            text = pg.inner_text("#su-cloud")
            for w in ("naps after 15 minutes", "about a minute to wake", "wipes its files", "GitHub", "your own free Render account"):
                assert w in text, f"the sheet says {w!r}: {text}"
            assert "Always online" not in text and "stays online" not in text
            assert "render.com/deploy" in pg.get_attribute("#su-render", "href") and pg.get_attribute("#su-render", "target") == "_blank"
            assert pg.locator("#su-cloud .btn.primary").count() == 1 and "primary" in pg.get_attribute("#su-render", "class")   # one main button: set up first
            pg.fill("#su-addr", "x"); assert pg.locator("#su-cloud .btn.primary").count() == 1 and "primary" in pg.get_attribute("#su-move", "class"); pg.fill("#su-addr", "")
            assert pg.locator("#su-cloud ol").count() == 0, "no numbered list of chores"
            if SHOTS: time.sleep(0.3); pg.screenshot(path=str(SHOT_DIR / "cloud-home.png"))

            # ---------- 2. plain sentences when something is missing or wrong ----------
            pg.click("#su-move"); pg.wait_for_selector("#su-cloud-err:not(.hidden)")
            assert "address Render gave you" in pg.inner_text("#su-cloud-err")
            pg.fill("#su-addr", f"http://127.0.0.1:{CPORT + 7}"); pg.click("#su-move")   # nothing listens there
            pg.wait_for_function("document.querySelector('#su-cloud-err').textContent.includes('Nothing answered')", timeout=10000)
            pg.fill("#su-addr", CLOUD + "/"); pg.click("#su-move")
            pg.wait_for_function("document.querySelector('#su-cloud-err').textContent.includes('Enter the setup code')", timeout=10000)
            assert pg.evaluate("document.activeElement.id") == "su-code"
            pg.fill("#su-code", "not-the-code"); pg.click("#su-move")
            pg.wait_for_function("document.querySelector('#su-cloud-err').textContent.includes('not right')", timeout=10000)
            assert get(CLOUD, "/health")["members"] == 0, "a wrong code claims nothing"
            assert pg.evaluate("TribeOffline.solo()"), "the project is still safe on this device"

            # ---------- 3. the right code: the project moves in and this person is the host ----------
            pg.fill("#su-code", CODE); pg.click("#su-move")
            pg.wait_for_function(f"window.TribeStore && TribeStore.get().server.url === '{CLOUD}' && !(window.TribeOffline && TribeOffline.solo && TribeOffline.solo())", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token")
            assert get(CLOUD, "/health")["members"] == 1
            me = get(CLOUD, "/me", tok); assert (me.get("member") or me).get("role") == "host", me
            projects = get(CLOUD, "/projects", tok); names = [x["name"] for x in (projects.get("projects") or projects)]
            assert "Pixel Quest" in names, names
            assert get(BASE, "/health")["members"] == 0, "nothing was made on this computer's server"
            inv = urllib.request.Request(CLOUD + "/api/invites", method="POST", data=b"{}", headers={"Content-Type": "application/json", "Authorization": "Bearer " + tok})
            code = json.loads(urllib.request.urlopen(inv, timeout=20).read())["invite"]["code"]
            pg.context.close()

            # ---------- 4. a cloud tribe that already has a host: the address is refused, an invite link works ----------
            pg = page(); local_project(pg, "Second Game")
            pg.evaluate("TribeLocalSetup.choose('cloud')"); pg.wait_for_selector("#su-cloud #su-addr")
            pg.fill("#su-addr", CLOUD); pg.fill("#su-code", CODE); pg.click("#su-move")
            pg.wait_for_function("document.querySelector('#su-cloud-err').textContent.includes('already has a host')", timeout=10000)
            pg.fill("#su-addr", f"{CLOUD}/join/{code}"); pg.fill("#su-code", ""); pg.click("#su-move")
            pg.wait_for_function(f"window.TribeStore && TribeStore.get().server.url === '{CLOUD}' && !(window.TribeOffline && TribeOffline.solo && TribeOffline.solo())", timeout=20000)
            assert get(CLOUD, "/health")["members"] == 2
            pg.context.close()

            # ---------- 5. the same step in the create flow and on a phone ----------
            pg = page()
            pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub"); pg.wait_for_selector("#view-hub:not(.hidden) #hub-host", timeout=15000)
            pg.click("#hub-host"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.fill("#tn-name", "Cloud Crew")
            pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2']")
            assert "naps" in pg.inner_text("#tn [data-tn-where='cloud']")
            pg.click("#tn [data-tn-where='cloud']"); pg.wait_for_selector("#tn #tn-render")
            assert "naps after 15 minutes" in pg.inner_text("#tn .tn-cloud") and pg.locator("#tn #tn-addr").count() == 1 and pg.locator("#tn #tn-code").count() == 1
            pg.click("#tn-go"); assert "free cloud" in pg.inner_text("#tn-err")
            pg.context.close()

            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
            ph.add_init_script(FRESH); pg = ph.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror (phone): {e}"))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribePhoneHost && window.TribeCloudHome", timeout=15000)
            pg.evaluate("TribePhoneHost.open()"); pg.wait_for_selector("#ph-start")
            assert "naps" in pg.inner_text("#ph-start [data-ph='cloud']")
            pg.click("#ph-start [data-ph='cloud']"); pg.wait_for_selector("#ph-cloud #ph-render")
            assert pg.locator("#ph-cloud #ph-addr").count() == 1 and pg.locator("#ph-cloud #ph-code").count() == 1 and pg.locator("#ph-cloud #ph-cloud-go").count() == 1
            wide = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
            assert not wide, "no sideways scroll at 390px"
            for sel in ("#ph-render", "#ph-cloud-go", "#ph-addr", "#ph-code"):
                bb = pg.locator(sel).bounding_box(); assert bb and bb["height"] >= 40 and bb["x"] >= 0 and bb["x"] + bb["width"] <= 391, (sel, bb)
            if SHOTS: time.sleep(0.3); pg.screenshot(path=str(SHOT_DIR / "cloud-home-phone.png"))
            pg.click("#ph-cloud [data-ph-back]"); pg.wait_for_selector("#ph-start")
            ph.close(); b.close()
        assert not errors, errors
        print("e2e_cloud_home: OK (honest sheet, one button, address + code claims the cloud tribe and moves the project, wrong code and taken tribe, invite link, create flow, 390px)")
    finally:
        srv.terminate(); cloud.terminate()


if __name__ == "__main__":
    main()
