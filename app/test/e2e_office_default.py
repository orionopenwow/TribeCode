"""The office is on by default, with a character for everyone (feat/p13-office).

  1. A new tribe has the pixel floor on (no switch to find); an empty tribe shows your character, a desk that says
     "Invite a friend" and one that says "Add an AI helper"; the sidebar always has Agents & office.
  2. Make your character: the first time, the sheet opens by itself; pick a part, Randomize, change the name tag, Done.
     The look is saved on the tribe and kept on this device.
  3. A friend joins: her sheet opens too, she saves a look, and the host's floor shows her with that look. Her desk
     stays hers (seats are kept by the server).
  4. Real state moves people: an AI helper that claims a file walks to its desk and types; a friend in a call walks to
     the meeting corner; a channel message is a speech bubble; an offline friend leaves a "Back soon" sign.
  5. Clicks: a raised hand (an AI helper waiting for an OK) opens its card on Approve, and Approve works; a person's card
     has Message, Call, Profile and Give a task, and Message opens the DM.
  6. Calm: drawing stops while the floor is out of view.
  7. The Off switch (Settings › Tribe & admin › The office) shows the desk list instead, for everyone.
  8. Phones (390px): the floor fits with no sideways scroll and a tap on a character opens the card as a sheet.
Screenshots: $TRIBE_SHOTS_DIR or /tmp: office-default-1440.png, office-default-creator.png, office-default-390.png.
Usage: python app/test/e2e_office_default.py"""
import json, os, subprocess, sys, tempfile, time, shutil, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6950 + OFF; BASE = f"http://localhost:{PORT}"
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


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-officedef-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        # ---------- 1. on by default, for a new tribe ----------
        o = ok(api("/office", token=host))
        assert o["on"] is True, "the pixel floor is on in a new tribe"
        assert o.get("myLook") is None
        camp_id = o["me"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(token, name, w=1440, h=900, mobile=False, character=True):
                kw = {"viewport": {"width": w, "height": h}, "device_scale_factor": 2 if mobile else 1}
                if mobile: kw.update(is_mobile=True, has_touch=True)
                c = b.new_context(**kw)
                c.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                                  " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}" % (name, BASE, token))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1" + ("&character=1" if character else ""), wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOffice && window.TribeOfficeSpace && window.TribeOfficeLooks && window.TribeShell", timeout=45000)
                return pg

            def to_office(pg):
                pg.evaluate("TribeShell.go('ws-agents')")
                pg.wait_for_selector("#view-coord:not(.hidden) #ad-office .os-stage", timeout=20000)
                pg.wait_for_function(OS + " && " + OS + ".art()", timeout=20000)

            # ---------- 2. Make your character opens by itself the first time ----------
            cp = page(host, "Camp")
            cp.wait_for_timeout(1500); assert not cp.locator("#olk-sheet").count(), "not on app launch (feat/p13b-office)"
            to_office(cp)   # the first open of Agents & office starts the intro: Make your character first
            cp.wait_for_selector("#olk-sheet", timeout=15000)
            assert "Make your character" in cp.inner_text("#olk-sheet"), cp.inner_text("#olk-sheet")[:200]
            assert cp.inner_text("#olk-sheet [data-olk='save']").strip() == "Done"
            cp.click("#olk-sheet [data-olk-tab='hair']")
            sw = cp.locator("#olk-sheet .olk-sw[data-olk-f='hair'][aria-checked='false']").nth(3)
            hair = int(sw.get_attribute("data-olk-i")); sw.click()
            assert cp.evaluate("TribeOfficeLooks.current().state().draft.hair") == hair, "picking a hair style changes the draft"
            before = cp.evaluate("JSON.stringify(TribeOfficeLooks.current().state().draft)")
            cp.click("#olk-sheet [data-olk='random']")
            assert cp.evaluate("JSON.stringify(TribeOfficeLooks.current().state().draft)") != before, "Randomize changes the look"
            cp.fill("#olk-name", "Camp W")
            assert cp.inner_text("#olk-sheet .olk-tag").strip() == "Camp W", "the name tag shows live"
            cp.wait_for_timeout(300); cp.screenshot(path=f"{SHOTS}/office-default-creator.png")
            draft = cp.evaluate("TribeOfficeLooks.current().state().draft")
            cp.click("#olk-sheet [data-olk='save']")
            cp.wait_for_selector("#olk-sheet", state="detached", timeout=10000)
            mine = ok(api("/office", token=host))["myLook"]
            same = "((a, b) => JSON.stringify(TribeOfficeLooksCore.normalize(a)) === JSON.stringify(TribeOfficeLooksCore.normalize(b)))"
            assert mine and cp.evaluate(f"{same}({json.dumps(mine)}, {json.dumps(draft)})"), (mine, draft)
            assert [m for m in ok(api("/members", token=host))["members"] if m["id"] == camp_id][0]["name"] == "Camp W", "the name tag renames you"
            assert cp.evaluate("!!TribeOfficeLooks.kept()"), "the look is kept on this device for the next tribe"
            cp.reload(wait_until="domcontentloaded"); cp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOffice", timeout=45000)
            to_office(cp); cp.wait_for_timeout(2500); assert not cp.locator("#olk-sheet").count(), "it only opens the first time"
            print("ok  2. Make your character: opens once by itself; pick, Randomize, name tag, Done; saved on the tribe and kept here")

            # ---------- 1b. the empty tribe is alive ----------
            assert cp.locator("#nest-ws-agents").is_visible(), "Agents & office is always in the sidebar"
            to_office(cp)
            assert cp.evaluate("document.querySelector('#ad-dash').dataset.view") == "floor"
            cp.wait_for_selector("#ad-office .os-spare[data-os-ph='invite']", timeout=10000)
            cp.wait_for_selector("#ad-office .os-spare[data-os-ph='ai']", timeout=10000)
            cp.wait_for_function((CH % camp_id) + " && " + (CH % camp_id) + ".visible", timeout=10000)
            assert cp.evaluate(f"!!{OS}.desks()['{camp_id}']"), "you have a desk"
            cp.wait_for_timeout(1500); cp.screenshot(path=f"{SHOTS}/office-default-empty-1440.png")
            cp.click("#ad-office .os-spare[data-os-ph='invite']")
            cp.wait_for_function("!!document.querySelector('#invite-modal:not(.hidden), .ui-sheet, #ivo-sheet, [id*=invite]:not(.hidden)')", timeout=8000)
            cp.keyboard.press("Escape"); cp.wait_for_timeout(300)
            print("ok  1. on by default: a new tribe shows the floor, your character at your desk, Invite a friend and Add an AI helper desks")

            # ---------- 3. a friend joins and makes her character ----------
            inv = ok(api("/invites", "POST", {}, token=host))["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, maya_id = j["token"], j["member"]["id"]
            mp = page(maya, "Maya")
            to_office(mp); mp.wait_for_selector("#olk-sheet", timeout=15000)
            assert "Make your character" in mp.inner_text("#olk-sheet")
            mp.click("#olk-sheet [data-olk='random']"); mp.click("#olk-sheet [data-olk='random']")
            mlook = mp.evaluate("TribeOfficeLooks.current().state().draft")
            mp.click("#olk-sheet [data-olk='save']"); mp.wait_for_selector("#olk-sheet", state="detached", timeout=10000)
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function(f"(() => {{ const d = (TribeOffice.state().desks || []).find(x => x.id === '{maya_id}'); return !!(d && d.look) && {same}(d.look, {json.dumps(mlook)}); }})()", timeout=15000)
            cp.wait_for_function((CH % maya_id) + " && " + (CH % maya_id) + ".visible", timeout=15000)
            seats = {d["id"]: d["seat"] for d in ok(api("/office", token=host))["desks"]}
            assert seats[camp_id] != seats[maya_id], seats
            print("ok  3. a friend's sheet opens, she saves a look, the host sees her with it; everyone keeps their own desk")

            # ---------- 4. real state moves people ----------
            pid = cp.evaluate("TribeClient.project()")
            ag = ok(api("/agents", "POST", token=host, project=pid), "agent"); aid = ag["agent"]["id"]
            mcp(ag["token"], "tribe_overview", {})
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function((CH % aid) + " && " + (CH % aid) + ".visible && !" + (CH % aid) + ".moving", timeout=20000)
            assert not cp.evaluate((CH % aid) + ".desk"), "a helper with nothing to do rests in the lounge"
            x0 = cp.evaluate((CH % aid) + ".x"); y0 = cp.evaluate((CH % aid) + ".y")
            mcp(ag["token"], "claim_file", {"path": "src/score.js", "note": "scores"})
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function(f"(() => {{ const c = {CH % aid}; return c && c.desk && !c.moving && c.pose === 'type'; }})()", timeout=20000)
            assert (cp.evaluate((CH % aid) + ".x"), cp.evaluate((CH % aid) + ".y")) != (x0, y0), "it walked"
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{aid}'] .os-doing", timeout=8000)
            assert cp.locator("#ad-office .os-spare[data-os-ph='ai']").count() == 0 and cp.locator("#ad-office .os-spare").count() == 0, "the invitations leave once people and helpers are here"
            # a call: Maya joins the huddle, so she walks to the meeting corner
            mp.evaluate("TribeClient.send({ type: 'huddle-join', muted: true })")
            cp.wait_for_function(f"(() => {{ const c = {CH % maya_id}; return c && c.meet && c.spot === 'meet'; }})()", timeout=15000)
            mp.evaluate("TribeClient.send({ type: 'huddle-leave' })")
            cp.wait_for_function(f"(() => {{ const c = {CH % maya_id}; return c && !c.meet; }})()", timeout=15000)
            # a channel message: a speech bubble over her
            ok(api("/chat/general", "POST", {"text": "Pushing the level select now"}, token=maya, project=pid))
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{maya_id}'] .os-say", timeout=8000)
            assert "level select" in cp.inner_text(f"#ad-office .os-tag[data-os-who='{maya_id}'] .os-say")
            cp.wait_for_timeout(800); cp.screenshot(path=f"{SHOTS}/office-default-1440.png")
            print("ok  4. state: a helper claiming a file walks to its desk and types; a call walks to the meeting corner; a message is a bubble")

            # ---------- 5. clicks: the raised hand, and a person's card ----------
            ap = json.loads(mcp(ag["token"], "request_approval", {"title": "Rename the score table", "risk": "low"})["content"][0]["text"])
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{aid}'] [data-os-hand]", timeout=15000)
            cp.click(f"#ad-office .os-tag[data-os-who='{aid}'] [data-os-hand]")
            cp.wait_for_selector("#ad-office .os-card:not([hidden]) [data-os-ap='approve']", timeout=8000)
            assert cp.evaluate("document.activeElement && document.activeElement.dataset.osAp === 'approve'"), "the raised hand goes straight to Approve"
            cp.click("#ad-office .os-card [data-os-ap='approve']")
            for _ in range(50):
                st = [a for a in ok(api("/approvals", token=host, project=pid)).get("approvals", []) if a["id"] == ap["id"]]
                if st and st[0]["status"] == "approved": break
                time.sleep(0.2)
            else: raise AssertionError(("approve did not land", st))
            cp.click("#ad-office .os-card [data-os-close]")
            cp.click(f"#ad-office .os-tag[data-os-who='{maya_id}']")
            cp.wait_for_selector("#ad-office .os-card:not([hidden])", timeout=8000)
            for k in ("dm", "call", "profile"): assert cp.locator(f"#ad-office .os-card [data-os-do='{k}']").count() == 1, k
            assert cp.locator("#ad-office .os-card [data-os-give]").count() == 1, "Give a task"
            cp.click("#ad-office .os-card [data-os-do='dm']")
            cp.wait_for_function("document.body.dataset.view === 'chat' || !!document.querySelector('.dm-open, #view-chat:not(.hidden)')", timeout=10000)
            print("ok  5. clicks: the raised hand opens Approve and it works; a person's card has Message, Call, Profile, Give a task; Message opens the DM")

            # ---------- 4b. offline: Back soon ----------
            to_office(cp)
            mp.context.close()
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_selector(f"#ad-office .os-sign[data-os-who='{maya_id}']", timeout=20000)
            print("ok  4b. a friend who goes offline leaves a Back soon sign on her desk")

            # ---------- 6. calm: drawing stops out of view ----------
            cp.wait_for_timeout(300)
            assert cp.evaluate(OS + ".running()"), "drawing while on screen"
            cp.evaluate("document.querySelector('#ad-office').style.display = 'none'")
            cp.wait_for_function("!" + OS + ".running()", timeout=5000)
            cp.evaluate("document.querySelector('#ad-office').style.display = ''")
            cp.wait_for_function(OS + ".running()", timeout=5000)
            print("ok  6. calm: drawing pauses while the floor is out of view and carries on after")

            # ---------- 7. the Off switch ----------
            cp.evaluate("TribeSettings.open('admin')")
            cp.wait_for_selector("#set-office", timeout=10000)
            assert cp.get_attribute("#set-office", "aria-checked") == "true"
            cp.click("#set-office")
            for _ in range(50):
                if ok(api("/office", token=host))["on"] is False: break
                time.sleep(0.1)
            else: raise AssertionError("the Off switch did not land")
            assert json.loads((tmp / "tribe" / "office.json").read_text()).get("floorOff") is True, "kept as floorOff"
            cp.evaluate("TribeSettings.close()")
            to_office_desks = "#view-coord:not(.hidden) #ad-office .of-desk"
            cp.evaluate("TribeShell.go('ws-agents')"); cp.wait_for_selector(to_office_desks, timeout=15000)
            assert cp.locator("#ad-office .os-stage").count() == 0, "off: the desk list"
            ok(api("/office", "PUT", {"on": True}, token=host))
            cp.wait_for_selector("#ad-office .os-stage", timeout=15000)
            print("ok  7. the Off switch in Settings shows the desk list; on again brings the floor back")

            # ---------- 8. phone ----------
            pp = page(host, "Camp", 390, 844, mobile=True, character=False)
            to_office(pp)
            pp.wait_for_function((CH % camp_id) + " && " + (CH % camp_id) + ".visible && !" + (CH % camp_id) + ".moving", timeout=15000)
            assert pp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll"
            box = pp.locator("#ad-office .os-stage").bounding_box()
            assert box and box["width"] <= 390 and box["height"] >= 240, box
            pp.wait_for_timeout(1500)
            pp.screenshot(path=f"{SHOTS}/office-default-390.png")
            pp.locator(f"#ad-office .os-tag[data-os-who='{camp_id}']").tap()
            pp.wait_for_selector("#of-card", timeout=8000)
            assert pp.locator("#of-card [data-os-act='look']").count() == 1, "your own card offers your look"
            pp.wait_for_timeout(300); pp.screenshot(path=f"{SHOTS}/office-default-390-card.png")
            print("ok  8. phone: the floor fits 390px, no sideways scroll; a tap opens the card as a sheet")
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("PASS e2e_office_default")
    finally:
        srv.terminate()
        try: srv.wait(timeout=10)
        except Exception: srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
