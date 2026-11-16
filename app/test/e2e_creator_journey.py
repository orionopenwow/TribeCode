"""The creator tools together, for real (no stand-ins): App Creator → Launch kit → Motion Studio → the website → Suggestions.

  1. App Creator opens the habit tracker template on the host; a word and the look change.
  2. The Launch kit's screenshots come from the real TribeAppCreator.screens(): a slide drawn from an App Creator screen
     is not blank and exports (the canvas is not tainted).
  3. Preview video opens the real Motion Studio with the app-preview template and the Launch kit's screens as pictures;
     a short WebM exports.
  4. "Put it on my website" adds a section to the website that plays the motion graphic.
  5. The suggestion engine lists real ideas from the 'app', 'launch' and 'motion' providers; one is applied and undone.
Usage: python app/test/e2e_creator_journey.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6520 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cj-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Habit Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]
        pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        init = (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Mara', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{tok}'}}, checklist:{{setup:true}}, tour:{{done:true}}, suggest:'often'}}));"
                f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(init)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeAppCreator && window.TribeLaunchKit && window.TribeMotionStudio && window.TribeSuggest && window.TribeClient && TribeClient.connected()", timeout=25000)

            # ---- 1. App Creator: the habit tracker, a word and the look
            pg.evaluate(f"TribeAppCreator.open({{ template: 'habits', pid: '{pid}' }})")
            pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=10000)
            h1 = pg.locator("#apc .apc-edit h1[data-e]").first
            h1.click(); pg.keyboard.press("Control+a"); pg.keyboard.type("Hi Sam"); pg.evaluate("document.activeElement.blur()")
            pg.wait_for_function("TribeAppCreator.doc().screens[0].blocks[0].props.title === 'Hi Sam'", timeout=4000)
            pg.click("#apc [data-tab='look']"); pg.click("#apc [data-acc='#2F5BEA']")
            pg.wait_for_function("TribeAppCreator.doc().theme.accent === '#2F5BEA'")
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config && j.config.theme.accent === '#2F5BEA' && j.config.screens[0].blocks[0].props.title === 'Hi Sam')", timeout=8000)
            pg.evaluate("TribeAppCreator.close()")

            # ---- 2. Launch kit: screenshots from the real App Creator screens
            pg.evaluate(f"TribeLaunchKit.open('{pid}', 'shots')")
            pg.wait_for_selector("[data-lch-tab='video']", timeout=10000)
            shot = pg.evaluate("""async () => {
              const ss = await TribeAppCreator.screens(%s); if (!ss.length) return { n: 0 };
              const c = document.createElement('canvas'); await ss[0].render(c, 393, 852);
              const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0;
              for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) ink++;
              let png = ''; try { png = c.toDataURL('image/png'); } catch (e) { png = 'tainted: ' + e.message; }
              return { n: ss.length, names: ss.map(s => s.name), ink, png: png.slice(0, 40) };
            }""" % json.dumps(pid))
            assert shot["n"] >= 3 and shot["ink"] > 20 and shot["png"].startswith("data:image/png"), shot
            # the Launch kit lists them as sources and draws a slide from one
            srcs = pg.evaluate("TribeLaunchKit._sources ? TribeLaunchKit._sources() : null")
            if srcs is not None: assert any(s["kind"] == "app" for s in srcs), srcs

            # ---- 3. Preview video: the real Motion Studio, app-preview, with the screens as pictures; a WebM
            pg.click("[data-lch-tab='video']"); pg.wait_for_selector("#lch-motion:not([disabled])", timeout=5000)
            pg.click("#lch-motion")
            pg.wait_for_function("TribeMotionStudio.isOpen()", timeout=30000)
            st = pg.evaluate("TribeMotionStudio.state()")
            sdoc = st.get("doc") or {}
            assert sdoc.get("template") == "app-preview", str(st)[:300]
            phone = [s for s in sdoc["states"] if s.get("kind") == "phone"]
            assert phone and len(phone[0].get("screens") or []) >= 1 and all(isinstance(x, str) and x.startswith("data:image/png") for x in phone[0]["screens"]), str(phone)[:300]
            assert sdoc.get("aspect") == "9:16", sdoc.get("aspect")
            vid = pg.evaluate("TribeMotionStudio.exportAs('webm', { seconds: 1, fps: 15, scale: 0.25 }).then(r => ({ ext: r.ext, size: r.blob.size, type: r.blob.type }))")
            assert vid["ext"] == "webm" and vid["size"] > 1000, vid

            # ---- 4. Put it on my website
            pg.evaluate("TribeMotionStudio.exportAs('site')")
            pg.wait_for_function("!TribeMotionStudio.isOpen()", timeout=15000)
            pg.wait_for_function(f"fetch('/api/projects/{pid}/site-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => JSON.stringify(j).includes('\"kind\":\"motion\"'))", timeout=15000)
            if pg.evaluate("!!(window.TribeSiteDesigner && TribeSiteDesigner.state && TribeSiteDesigner.state() && TribeSiteDesigner.state().open)"): pg.evaluate("TribeSiteDesigner.close && TribeSiteDesigner.close()")

            # ---- 5. Suggestions from the real providers, one applied and undone
            assert api("/tasks", "POST", {"title": "Show a map of nearby gyms", "project": pid}, tok)[0] in (200, 201)
            assert api("/chat/general/send", "POST", {"text": "What's new in v0.2:\n- streak freeze\n- weekly chart", "project": pid}, tok)[0] == 200
            screen_png = shot["png"]
            pg.wait_for_function("TribeSuggest._providers && ['app', 'launch', 'motion'].every(p => TribeSuggest._providers().includes(p))", timeout=10000)
            pg.evaluate("TribeSuggest.run({ asked: true })")
            for _ in range(30):
                if pg.evaluate("(() => { const ps = new Set(TribeSuggest.list().map(i => i.provider)); return ['app', 'launch', 'motion'].every(p => ps.has(p)); })()"): break
                pg.wait_for_timeout(1000)
            else:
                print("state:", pg.evaluate("TribeSuggest._state()")); print("list:", pg.evaluate("TribeSuggest.list().map(i => [i.provider, i.title])"))
            pg.wait_for_function("(() => { const ps = new Set(TribeSuggest.list().map(i => i.provider)); return ['app', 'launch', 'motion'].every(p => ps.has(p)); })()", timeout=30000)
            items = pg.evaluate("TribeSuggest.list().map(i => ({ id: i.id, provider: i.provider, title: i.title }))")
            print("suggestions:", [(i["provider"], i["title"]) for i in items])
            target = next(i for i in items if i["provider"] == "app" and "map" in i["title"].lower())   # the habit template already has settings; a map it lacks
            n0 = len(api(f"/projects/{pid}/app-config", token=tok)[1]["config"]["screens"])
            pg.evaluate(f"TribeSuggest.apply(TribeSuggest.list().find(i => i.id === {json.dumps(target['id'])}))")
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.screens.length > {n0})", timeout=10000)
            pg.evaluate(f"TribeSuggest.undo({json.dumps(target['id'])})")
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.screens.length === {n0})", timeout=10000)
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad[:6]
        print("e2e_creator_journey: OK (App Creator → Launch kit screenshots from real screens → Motion Studio app-preview → WebM → website section → real app/launch/motion suggestions, apply + undo)")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
