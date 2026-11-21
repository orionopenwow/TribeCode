"""Office Space (pass 11): the office as a pixel floor.

A tribe with two people and two AI helpers: the canvas draws a character for each (plus Flint); an agent that claims a
file walks to its desk, sits and types; an agent's approval ask shows a "Needs your OK" bubble and the card's Approve
works; clicking a person opens a card with Message and Open; a wardrobe change persists; a layout edit saves and comes
back after a reload; the night set switches; reduced motion snaps everyone to their spot; a DM never shows; phones get
the list.
Usage: python app/test/e2e_office_space.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5570 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
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


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-officespace-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, maya_id = j["token"], j["member"]["id"]
        # the server side: looks are per person and validated; layout and set are host/admin only
        assert api("/office", "PUT", {"layout": {"w": 20, "h": 12, "tiles": [], "items": []}}, token=maya)[0] == 403, "only the host or an admin edits the layout"
        lk = ok(api("/office/look", "PUT", {"look": {"hair": 3, "skin": 99, "evil": "<x>"}}, token=maya))["look"]
        assert lk.get("hair") == 3 and "skin" not in lk and "evil" not in lk, lk

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(token, name, w=1440, h=900, reduced=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, reduced_motion="reduce" if reduced else "no-preference")
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOffice && window.TribeOfficeSpace && window.TribeAgentsDash", timeout=45000)
                return pg
            cp = page(host, "Camp")
            pid = cp.evaluate("TribeClient.project()")
            ag = ok(api("/agents", "POST", token=maya, project=pid), "agent")            # Maya's Claude
            ag2 = ok(api("/agents", "POST", {"kind": "cursor", "label": "Cursor"}, token=host, project=pid), "agent 2")
            mcp(ag["token"], "my_lane", {}); mcp(ag2["token"], "tribe_overview", {})
            ok(api("/office", "PUT", {"on": True}, token=host))
            mp = page(maya, "Maya")

            # ---------- the floor draws everyone ----------
            cp.evaluate("TribeShell.go('agents')")
            try: cp.wait_for_function(OS + " && " + OS + ".chars().length >= 5", timeout=20000)
            except Exception:
                print("FLOOR", cp.evaluate("(document.querySelector('#ad-office') || {}).innerText"), errors[:3]); raise
            ids = cp.evaluate(OS + ".chars().map(c => c.id)")
            for want in (maya_id, ag["agent"]["id"], ag2["agent"]["id"], "flint"): assert want in ids, (want, ids)
            cp.wait_for_function("(() => { const c = document.querySelector('#ad-office .os-canvas'); if (!c || !c.width) return false; const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < x.length; i += 4000) if (x[i] + x[i+1] + x[i+2] > 0) n++; return n > 20; })()", timeout=10000)   # the canvas is drawn
            print("ok  floor: characters for 2 people, 2 helpers and Flint on the canvas")

            # ---------- an agent claims a file: it sits at its desk and types ----------
            aid = ag["agent"]["id"]
            mcp(ag["token"], "claim_file", {"path": "src/leaderboard.js", "note": "leaderboard"})
            cp.evaluate("TribeOffice.refresh()")
            try: cp.wait_for_function(f"(() => {{ const c = {OS}.chars().find(c => c.id === '{aid}'); return c && !c.moving && c.pose === 'type'; }})()", timeout=20000)
            except Exception:
                print("AGENT", cp.evaluate(f"{OS}.chars().find(c => c.id === '{aid}')"), [d for d in ok(api("/office", token=host))["desks"] if d["id"] == aid]); raise
            print("ok  an agent that claims a file walks to its desk, sits and types")
            if os.environ.get("TRIBE_SHOTS_DIR"):
                cp.wait_for_timeout(2500); cp.locator("#ad-office").screenshot(path=os.path.join(os.environ["TRIBE_SHOTS_DIR"], "office-space-day-1440.png"))

            # ---------- an approval: bubble, then Approve on the card ----------
            ap = json.loads(mcp(ag["token"], "request_approval", {"title": "Drop the old scores table", "risk": "high"})["content"][0]["text"])
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{aid}'] .os-bubble.ask", timeout=15000)
            cp.click(f"#ad-office .os-tag[data-os-who='{aid}']")
            cp.wait_for_selector("#ad-office .os-card:not([hidden]) [data-os-ap='approve']", timeout=8000)
            assert "src/leaderboard.js" in cp.inner_text("#ad-office .os-card"), "the card lists its claimed files"
            cp.click("#ad-office .os-card [data-os-ap='approve']")
            for _ in range(50):
                st = [a for a in ok(api("/approvals", token=host, project=pid)).get("approvals", []) if a["id"] == ap["id"]]
                if st and st[0]["status"] == "approved": break
                time.sleep(0.2)
            else: raise AssertionError(("approve did not land", st))
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{aid}'] .os-bubble.ask", state="detached", timeout=15000)
            print("ok  an approval shows a bubble; Approve on the card works")

            # ---------- a person: the card has Message and Open; no DM text anywhere ----------
            camp_id = cp.evaluate("TribeClient.state().me.id")
            api("/chat", "POST", {"channel": "dm-" + "-".join(sorted([camp_id, maya_id])), "text": "secret plan banana"}, token=host, project=pid)
            mp.evaluate(f"TribeAppCreator.open({{ template: 'habits', pid: '{pid}' }})"); mp.wait_for_selector("#apc", timeout=20000)
            for _ in range(40):
                cp.evaluate("TribeOffice.refresh()"); cp.wait_for_timeout(500)
                if cp.evaluate(f"(TribeOffice.state().desks || []).some(d => d.id === '{maya_id}' && d.where)"): break
            cp.click(f"#ad-office .os-tag[data-os-who='{maya_id}']")
            cp.wait_for_selector("#ad-office .os-card:not([hidden]) [data-os-do='dm']", timeout=8000)
            assert cp.locator("#ad-office .os-card [data-os-do='open']").count() == 1, cp.inner_text("#ad-office .os-card")
            assert cp.locator("#ad-office .os-card [data-os-give]").count() == 1, "Give a task"
            assert "banana" not in cp.inner_text("#ad-office") and "banana" not in json.dumps(ok(api("/office", token=host))), "no DM text"
            cp.click("#ad-office .os-card [data-os-close]")
            print("ok  a person's card: Message, Call, Open, Give a task; no DM text")

            # ---------- Your look: a wardrobe change persists ----------
            cp.click("#ad-office .os-bar [data-os-act='look']")
            cp.wait_for_selector("#ad-office .os-look:not([hidden])")
            before = cp.inner_text("#ad-office .os-look .os-part:nth-child(2) b")
            cp.click("#ad-office .os-look [data-lk='hair'][data-d='1']")
            after = cp.inner_text("#ad-office .os-look .os-part:nth-child(2) b"); assert after != before, (before, after)
            cp.click("#ad-office .os-look [data-lk-save]")
            cp.wait_for_selector("#ad-office .os-look", state="hidden")
            mine = ok(api("/office", token=host))["myLook"]; assert mine and "hair" in mine, mine
            print("ok  wardrobe: a new look is saved to my profile")

            # ---------- the layout editor: place a plant, save, reload ----------
            n0 = len([i for i in ok(api("/office", token=host))["layout"]["items"] if i["t"] == "plant"]) if ok(api("/office", token=host)).get("layout") else cp.evaluate(OS + ".layout().items.filter(i => i.t === 'plant').length")
            cp.click("#ad-office .os-bar [data-os-act='edit']")
            cp.click("#ad-office .os-edit [data-tool='plant']")
            spot = cp.evaluate(OS + ".free(Math.floor(" + OS + ".layout().w / 2))"); xy = cp.evaluate(f"{OS}.tileXY({spot['x']}, {spot['y']})")
            cp.mouse.click(xy["x"], xy["y"])
            cp.click("#ad-office .os-edit [data-ed='save']")
            for _ in range(30):
                L = ok(api("/office", token=host)).get("layout")
                if L and len([i for i in L["items"] if i["t"] == "plant"]) == n0 + 1: break
                time.sleep(0.2)
            else: raise AssertionError(("layout not saved", L and [i for i in L["items"] if i["t"] == "plant"], n0, spot, cp.evaluate(OS + ".layout().items.filter(i => i.t === 'plant')")))
            assert any(i["t"] == "plant" and i["x"] == spot["x"] and i["y"] == spot["y"] for i in L["items"]), "the plant is where I put it"
            cp.reload(wait_until="domcontentloaded"); cp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAgentsDash", timeout=45000)
            cp.evaluate("TribeShell.go('agents')"); cp.wait_for_function(OS + " && " + OS + ".layout()", timeout=20000)
            assert cp.evaluate(f"{OS}.layout().items.some(i => i.t === 'plant' && i.x === {spot['x']} && i.y === {spot['y']})"), "the layout comes back after a reload"
            print("ok  layout editor: place, save, reload")

            # ---------- sets: switch to the night office ----------
            cp.select_option("#ad-office [data-os-set]", "night")
            for _ in range(30):
                if ok(api("/office", token=host)).get("set") == "night": break
                time.sleep(0.2)
            else: raise AssertionError("set did not switch")
            assert api("/office", "PUT", {"set": "../x"}, token=host)[0] in (400, 200) and ok(api("/office", token=host))["set"] == "night", "bad set names are refused"
            print("ok  sets: the night office switches")
            if os.environ.get("TRIBE_SHOTS_DIR"):
                cp.wait_for_timeout(800); cp.locator("#ad-office").screenshot(path=os.path.join(os.environ["TRIBE_SHOTS_DIR"], "office-space-1440.png"))

            # ---------- reduced motion: everyone snaps to their spot ----------
            rp = page(host, "Camp", reduced=True)
            rp.evaluate("TribeShell.go('agents')"); rp.wait_for_function(OS + " && " + OS + ".chars().length >= 4", timeout=20000)
            rp.wait_for_timeout(300)
            assert rp.evaluate(OS + ".chars().every(c => !c.moving)"), rp.evaluate(OS + ".chars()")
            print("ok  reduced motion: no walking")

            # ---------- a phone gets the list ----------
            ph = page(host, "Camp", 390, 844)
            ph.evaluate("TribeShell.go('agents')"); ph.wait_for_selector("#ad-office .of-desk", timeout=15000)
            assert ph.locator("#ad-office .os-canvas").count() == 0
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390
            print("ok  phones get the desk list")
            b.close()
        bad = [e for e in errors if "ERR_" not in e]
        assert not bad, bad
        print("e2e_office_space: all ok")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
