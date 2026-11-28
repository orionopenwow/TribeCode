"""The office draws with no tribe and with the tribe out of reach, and its first open is one flow (feat/p13b-office).

  1. No tribe at all (only this device): Agents & office shows the pixel floor with your own character at a desk, the
     look kept on this device, and a plate on the wall: "Just you, on this device".
  2. First open: Make your character -> the office's slides (TribeIntro, stubbed here to record the call) -> the floor
     with "This is you" for a moment. "Not now" gives a random look. Remembered: the next open goes straight to the
     floor. The ... menu's "Show the intro again" plays the slides again.
  3. The tribe's computer goes off: the floor keeps drawing from what this device saw: you at your desk, the AI helper
     resting, the friend away with "Back soon", and "Offline · showing what this device saw" on the wall. The tribe
     comes back: the floor is live again.
  4. Phones (390px): the floor with your character, no sideways scroll.
Screenshots: $TRIBE_SHOTS_DIR or /tmp: office-offline-local-1440.png, office-offline-1440.png, office-offline-390.png,
office-offline-you.png.
Usage: python app/test/e2e_office_offline.py"""
import json, os, subprocess, sys, tempfile, time, shutil, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6970 + OFF; BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("TRIBE_SHOTS_DIR") or "/tmp"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())["result"]


OS = "(document.querySelector('#ad-office .os') || {}).__os"
CH = OS + ".chars().find(c => c.id === '%s')"
# TribeIntro (the shared screen intro, screenintro.js) is stubbed: it records what the office asks of it
STUB = """(() => { window.__introCalls = []; const stub = {
  maybe: (k, slides) => { window.__introCalls.push(['maybe', k, (slides || []).length, (slides || []).map(s => s.title)]); return Promise.resolve(true); },
  show: (k, slides) => { window.__introCalls.push(['show', k, (slides || []).length]); return Promise.resolve(); },
  seen: () => false, reset: () => {} };
  Object.defineProperty(window, 'TribeIntro', { get: () => stub, set: () => {}, configurable: true }); })();"""


def start(tmp):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    for _ in range(150):
        try:
            if api("/health")[0] == 200: break
        except Exception: pass
        time.sleep(0.2)
    return srv


def stop(srv):
    srv.terminate()
    try: srv.wait(timeout=10)
    except Exception: srv.kill()


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-officeoff-", dir="/tmp"))
    srv = start(tmp)
    try:
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, maya_id = j["token"], j["member"]["id"]
        camp_id = ok(api("/office", token=host))["me"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def ctx(w=1440, h=900, mobile=False):
                kw = {"viewport": {"width": w, "height": h}, "device_scale_factor": 2 if mobile else 1}
                if mobile: kw.update(is_mobile=True, has_touch=True)
                c = b.new_context(**kw); c.add_init_script(STUB); return c

            def open_page(c, token, name, query="&character=1"):
                settings = {"name": name, "onboarded": True, "tour": {"done": True}}
                if token: settings["server"] = {"url": BASE, "token": token}
                c.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify(%s)); } catch (e) {}" % json.dumps(settings))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1" + query, wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeOffice && window.TribeOfficeSpace && window.TribeAgentsOffice && window.TribeShell", timeout=45000)
                return pg

            def floor(pg, me):
                pg.wait_for_selector("#ad-office .os-stage", timeout=20000)
                pg.wait_for_function(OS + " && " + OS + ".art()", timeout=20000)
                pg.wait_for_function(f"(() => {{ const c = {CH % me}; return c && c.visible && !c.moving; }})()", timeout=20000)

            # ---------- 1. no tribe: only this device ----------
            lc = ctx()
            lp = open_page(lc, None, "Robin", query="")
            lp.evaluate("try { localStorage.setItem('tribecode.office.intro', '1'); } catch (e) {}")   # the intro is covered in 2
            lp.evaluate("localStorage.setItem('tribecode.office.look', JSON.stringify({ v: 2, hair: 5, hairColor: 13, topColor: 18 }))")
            assert not lp.evaluate("TribeClient.hasToken()"), "no tribe in this browser"
            lp.evaluate("TribeAgentsHub.open({ global: true })")
            floor(lp, "me")
            st = lp.evaluate("TribeOffice.state()")
            assert st["local"] == "none" and st["me"] == "me", st.get("local")
            me = [d for d in st["desks"] if d["id"] == "me"][0]
            assert me["look"] and me["look"].get("hair") == 5 and me["name"] == "Robin", me
            assert lp.evaluate(f"{CH % 'me'}.desk"), "you sit at your desk"
            lp.wait_for_selector("#ad-office .os-plate[data-local='none']", timeout=8000)
            assert "Just you" in lp.inner_text("#ad-office .os-plate")
            lp.wait_for_selector("#ad-office .os-spare[data-os-ph='invite']", timeout=8000)
            lp.wait_for_timeout(1200); lp.screenshot(path=f"{SHOTS}/office-offline-local-1440.png")
            lc.close()
            print("ok  1. no tribe: the floor draws with your own character at a desk, your kept look, and 'Just you, on this device'")

            # ---------- 2. first open: creator -> slides -> "This is you" ----------
            pid = None
            cc = ctx()
            cp = open_page(cc, host, "Camp")
            cp.wait_for_function("TribeClient.connected()", timeout=30000)
            pid = cp.evaluate("TribeClient.project()")
            ag = ok(api("/agents", "POST", token=host, project=pid), "agent"); aid = ag["agent"]["id"]
            mcp(ag["token"], "tribe_overview", {})
            cp.wait_for_timeout(1200); assert not cp.locator("#olk-sheet").count(), "nothing on app launch"
            cp.evaluate("TribeShell.go('ws-agents')")
            cp.wait_for_selector("#olk-sheet", timeout=15000)
            assert "Make your character" in cp.inner_text("#olk-sheet")
            cp.wait_for_timeout(500)
            assert cp.evaluate("window.__introCalls.length") == 0, "the slides wait for the character"
            assert ok(api("/office", token=host))["myLook"] is None
            cp.click("#olk-sheet [data-olk='cancel']")   # Not now
            cp.wait_for_function("window.__introCalls.length === 1", timeout=10000)
            call = cp.evaluate("window.__introCalls[0]")
            assert call[0] == "maybe" and call[1] == "office" and 1 <= call[2] <= 2, call
            assert "Everyone has a desk" in call[3], call
            floor(cp, camp_id)
            cp.wait_for_function(OS + ".focusing()", timeout=8000)
            cp.wait_for_selector(f"#ad-office .os-tag.os-focus[data-os-who='{camp_id}'] .os-you", timeout=5000)
            assert "This is you" in cp.inner_text("#ad-office .os-you")
            cp.screenshot(path=f"{SHOTS}/office-offline-you.png")
            cp.wait_for_function("!" + OS + ".focusing()", timeout=6000)
            for _ in range(50):
                if ok(api("/office", token=host))["myLook"]: break
                time.sleep(0.1)
            else: raise AssertionError("Not now gives a random look")
            assert cp.evaluate("localStorage.getItem('tribecode.office.intro')") == "1"
            # remembered: the next open goes straight to the floor
            cp.reload(wait_until="domcontentloaded"); cp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeShell", timeout=45000)
            cp.evaluate("TribeShell.go('ws-agents')"); floor(cp, camp_id); cp.wait_for_timeout(1500)
            assert not cp.locator("#olk-sheet").count() and cp.evaluate("window.__introCalls.length") == 0, "only the first time"
            # Show the intro again (the ... menu)
            cp.click("#ao-more"); cp.click("#ao-menu [data-aom='intro']")
            cp.wait_for_function("window.__introCalls.length === 1 && window.__introCalls[0][0] === 'show' && window.__introCalls[0][1] === 'office'", timeout=8000)
            cp.wait_for_function(OS + ".focusing()", timeout=8000)
            print("ok  2. first open: Make your character -> the slides -> 'This is you'; Not now gives a random look; remembered; Show the intro again")

            # ---------- 3. the tribe's computer goes off ----------
            mc = ctx(); mp = open_page(mc, maya, "Maya", query="")
            mp.wait_for_function("TribeClient.connected()", timeout=30000)
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function(f"(() => {{ const c = {CH % maya_id}; return c && c.visible; }})()", timeout=15000)
            cp.wait_for_function(f"(() => {{ const c = {CH % aid}; return c && c.visible; }})()", timeout=15000)
            cp.wait_for_function(f"(JSON.parse(localStorage.getItem('tribecode.office.last') || '{{}}').__last || {{ desks: [] }}).desks.some(d => d.id === '{maya_id}')", timeout=8000)
            stop(srv)
            cp.wait_for_function("TribeOffice.state() && TribeOffice.state().local === 'offline'", timeout=20000)
            cp.wait_for_selector("#ad-office .os-plate[data-local='offline']", timeout=8000)
            assert cp.evaluate(f"{CH % camp_id}.visible"), "you are still at your desk"
            cp.wait_for_selector(f"#ad-office .os-sign[data-os-who='{maya_id}']", timeout=10000)
            ag_d = cp.evaluate(f"TribeOffice.state().desks.find(d => d.id === '{aid}')")
            assert ag_d and ag_d["state"] == "away" and ag_d["lines"] == ["Resting"], ag_d
            cp.wait_for_function(f"(() => {{ const c = {CH % aid}; return c && c.visible && !c.desk; }})()", timeout=10000)
            assert "Offline" in cp.inner_text("#ao-lead")
            cp.wait_for_timeout(1200); cp.screenshot(path=f"{SHOTS}/office-offline-1440.png")
            srv = start(tmp)   # back
            cp.wait_for_function("TribeClient.connected() && TribeOffice.state() && !TribeOffice.state().local", timeout=60000)
            cp.wait_for_selector("#ad-office .os-plate", state="detached", timeout=10000)
            print("ok  3. tribe off: you, the helper resting, the friend 'Back soon', the offline plate; back on: live again")
            mc.close()

            # ---------- 4. phone ----------
            pc = ctx(390, 844, mobile=True); pp = open_page(pc, host, "Camp", query="")
            pp.evaluate("try { localStorage.setItem('tribecode.office.intro', '1'); } catch (e) {}")
            pp.wait_for_function("TribeClient.connected()", timeout=30000)
            pp.evaluate("TribeShell.go('ws-agents')"); floor(pp, camp_id)
            assert pp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll"
            pp.wait_for_timeout(1200); pp.screenshot(path=f"{SHOTS}/office-offline-390.png")
            print("ok  4. phone: the floor with your character fits 390px")
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e and "Failed to fetch" not in e and "NetworkError" not in e]
        assert not bad, bad
        print("PASS e2e_office_offline")
    finally:
        try: stop(srv)
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
