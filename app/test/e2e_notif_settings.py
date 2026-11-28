"""Notification settings per project and channel, Discord-style (p14, app/ui/notifgroups.js, server/notify.js groupVerdict).
  * right-click a project circle -> flyout -> Notification settings › Only @mentions: a plain message from a friend gives
    no push, no sound and no badge; an @mention does (push, inbox count, the circle's red count)
  * Mute project › For 1 hour: nothing, the circle looks muted; the mute runs out (test clock on the server)
  * a channel's own mute overrides the project's "All messages"; the chat header's bell opens the same menu
  * Settings › Notifications lists every project; settings follow to a second device of the same person
  * phones: long-press a circle -> a bottom sheet you drill into
Screenshots: docs/screenshots/notif-*.png (and the scratchpad when TRIBE_SHOTS is set).
Usage: python app/test/e2e_notif_settings.py   (honours TRIBE_PORT_OFFSET)"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4790 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("TRIBE_SHOTS") or (ROOT / "docs" / "screenshots")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

pushes = []
class Ntfy(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        pushes.append({"path": self.path, "headers": {k: v for k, v in self.headers.items()}, "body": body})
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b'{"id":"x"}')
    def log_message(self, *a): pass


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def wait(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.1)
    raise AssertionError("timed out waiting for " + what)


def _up():
    try: return api("/api/health")[0] == 200
    except Exception: return False


def open_as(browser, name, token, phone=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, has_touch=phone, is_mobile=phone)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and "11434" not in m.text and "ERR_" not in m.text and "api.github.com" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
    page.wait_for_function("window.TribeNotifGroups && window.TribeProjects && TribeProjects.list().length >= 2", timeout=15000)
    return page


def main():
    ntfy = ThreadingHTTPServer(("127.0.0.1", 0), Ntfy)
    threading.Thread(target=ntfy.serve_forever, daemon=True).start()
    NTFY = f"http://127.0.0.1:{ntfy.server_address[1]}"
    tmp = tempfile.mkdtemp(prefix="tribe-ng-")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Bell Crew", "--ollama", "http://localhost:9",
                            "--public-url", BASE], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(_up, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        st, made = api("/api/projects", "POST", {"name": "Pixel Quest"}, host)
        assert st == 200, made
        projects = api("/api/projects", token=maya)[1]["projects"]
        B = next(p for p in projects if p["name"] == "Pixel Quest")
        A = next(p for p in projects if p["id"] != B["id"])
        bid, bch = B["id"], B["channel"]
        # Maya's phone is ntfy (the fake server); "always" so pushes go out while she is in the app too
        r = api("/api/notify/prefs", "PUT", {"ntfy": {"server": NTFY, "enabled": True}, "when": {"mode": "always"}}, maya)[1]
        topic = r["prefs"]["ntfy"]["topic"]
        to_maya = lambda: [x for x in pushes if x["path"] == "/" + topic]
        prefs = lambda: api("/api/notify/prefs", token=maya)[1]
        recent = lambda: api("/api/notify/state", token=maya)[1]["recent"]
        say = lambda text: api(f"/api/chat/{bch}", "POST", {"text": text}, host)
        assert prefs()["defaults"][bid] == "all", "a project of two starts on All messages"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            mp = open_as(b, "Maya", maya)
            assert mp.evaluate("TribeClient.project()") == A["id"]
            circle = f"#pj-rail [data-pj-open='{bid}']"
            mp.wait_for_selector(circle)

            # 0. "All messages" (the default here): a plain message pushes and sounds
            notes0 = mp.evaluate("window.__tcMsgNotes || 0")
            say("the boss fight is in")
            wait(lambda: len(to_maya()) == 1, what="plain message push")
            assert "Orion in #general" in json.dumps(to_maya()[0]["headers"]) or "general" in to_maya()[0]["headers"].get("Title", ""), to_maya()[0]["headers"]
            mp.wait_for_function(f"(window.__tcMsgNotes || 0) > {notes0}", timeout=5000)
            mp.wait_for_selector(circle + " .pj-unread")

            # 1. right-click the circle: Discord's server menu; hover Notification settings ›, pick Only @mentions
            mp.click(circle, button="right")
            mp.wait_for_selector(".ng-menu #ng-read")
            for sel in ["#ng-read", "#ng-notif", "#ng-mute", "#ng-invite", "#ng-settings"]:
                assert mp.locator(".ng-menu " + sel).count() == 1, sel
            assert mp.evaluate("document.activeElement.id") == "ng-read", "the first row has focus"
            mp.keyboard.press("ArrowDown"); assert mp.evaluate("document.activeElement.id") == "ng-notif"
            mp.keyboard.press("ArrowRight")
            mp.wait_for_selector(".ng-menu.ng-sub #ng-lv-mentions")
            assert mp.evaluate("document.activeElement.id") == "ng-lv-all"
            assert mp.locator("#ng-lv-all").get_attribute("aria-checked") == "true"
            mp.keyboard.press("ArrowLeft"); assert mp.evaluate("document.activeElement.id") == "ng-notif" and mp.locator(".ng-sub").count() == 0
            mp.hover("#ng-notif"); mp.wait_for_selector(".ng-sub #ng-lv-mentions")
            mp.hover("#ng-lv-mentions"); mp.click("#ng-lv-mentions")
            wait(lambda: prefs()["prefs"]["groups"]["projects"].get(bid, {}).get("level") == "mentions", what="level saved")
            mp.wait_for_function("document.querySelector('#ng-lv-mentions').getAttribute('aria-checked') === 'true'")
            mp.wait_for_timeout(250)
            mp.screenshot(path=str(SHOTS / "notif-flyout.png"))
            mp.keyboard.press("Escape"); mp.keyboard.press("Escape")
            mp.wait_for_function("!document.querySelector('.ng-menu')")
            assert mp.evaluate("document.activeElement && document.activeElement.dataset.pjOpen") == bid, "focus returns to the circle"

            # a plain message: no push, no sound, no inbox count
            count = lambda: mp.evaluate("+(document.querySelector('#nf-count') || {}).textContent || 0")
            n0, c0, notes1 = len(to_maya()), count(), mp.evaluate("window.__tcMsgNotes || 0")
            say("just a plain update")
            wait(lambda: recent() and recent()[0]["title"].startswith("Orion in") and recent()[0]["reason"] == "mentions-only", what="mentions-only verdict")
            time.sleep(0.6)
            assert len(to_maya()) == n0 and count() == c0 and mp.evaluate("window.__tcMsgNotes || 0") == notes1
            # an @mention breaks through
            say("@Maya can you test the boss?")
            wait(lambda: len(to_maya()) == n0 + 1, what="mention push")
            mp.wait_for_function(f"+(document.querySelector('#nf-count') || {{}}).textContent > {c0}", timeout=5000)
            mp.wait_for_selector(circle + " .pj-badge")

            # 2. Mute project › For 1 hour (back on All messages first, so the mute is what silences it)
            mp.click(circle, button="right"); mp.hover("#ng-notif"); mp.click("#ng-lv-all")
            wait(lambda: prefs()["prefs"]["groups"]["projects"][bid].get("level") == "all", what="level all")
            mp.hover("#ng-mute"); mp.wait_for_selector(".ng-sub #ng-dur-1h")
            labels = mp.locator(".ng-sub .ng-t").all_inner_texts()
            assert labels == ["For 15 minutes", "For 1 hour", "For 3 hours", "For 8 hours", "For 24 hours", "Until I turn it back on"], labels
            mp.click("#ng-dur-1h")
            mp.wait_for_selector(circle + ".ng-muted .ng-mute-ic")
            until = prefs()["prefs"]["groups"]["projects"][bid]["until"]
            assert 3500e3 < until - prefs()["now"] <= 3600e3
            n1, notes2 = len(to_maya()), mp.evaluate("window.__tcMsgNotes || 0")
            say("muted chatter")
            wait(lambda: recent()[0]["title"] == "Orion in #general" and recent()[0]["reason"] == "muted", what="muted verdict")
            time.sleep(0.5)
            assert len(to_maya()) == n1 and mp.evaluate("window.__tcMsgNotes || 0") == notes2
            assert mp.locator(circle + " .pj-unread").count() == 0, "a muted circle shows no unread pill"
            mp.locator("#pj-rail").screenshot(path=str(SHOTS / "notif-muted-circle.png"))
            # the menu now offers Unmute with the time
            mp.click(circle, button="right"); mp.wait_for_selector("#ng-unmute")
            assert "Muted until" in mp.inner_text("#ng-unmute")
            mp.keyboard.press("Escape")
            # an hour later (test clock): the mute runs out by itself
            api("/api/notify/clock", "POST", {"skewMs": 3700 * 1000}, maya)
            mp.wait_for_selector(circle + ":not(.ng-muted)", timeout=12000)
            assert mp.locator(circle + " .ng-mute-ic").count() == 0
            say("back to normal")
            wait(lambda: len(to_maya()) == n1 + 1, what="push after the mute ran out")

            # 3. a channel's own mute beats the project's All messages; the chat header's bell
            mp.evaluate(f"TribeProjects.switchTo('{bid}', 'chat')")
            mp.wait_for_function(f"TribeClient.project() === '{bid}' && TribeApp.view() === 'chat'")
            mp.wait_for_selector("#chan-switch"); mp.wait_for_selector("#ng-chat-bell")
            mp.click("#chan-switch"); mp.wait_for_selector("#dm-menu [data-ch='general']")
            mp.click("#dm-menu [data-ch='general']", button="right")
            mp.wait_for_selector(".ng-menu #ng-mute")
            assert mp.locator(".ng-menu #ng-notif").count() == 1
            mp.hover(".ng-menu #ng-notif"); mp.wait_for_selector(".ng-sub #ng-clv-default")
            assert mp.locator("#ng-clv-default").get_attribute("aria-checked") == "true"
            mp.hover(".ng-menu #ng-mute"); mp.click("#ng-dur-forever")
            wait(lambda: prefs()["prefs"]["groups"]["channels"].get(bch, {}).get("until") == -1, what="channel muted")
            mp.wait_for_selector("#ng-chat-bell.on")
            n2 = len(to_maya())
            api("/api/notify/clock", "POST", {"skewMs": 3 * 3600 * 1000}, maya)   # past the message rate limit
            say("channel is muted")
            wait(lambda: recent()[0]["title"] == "Orion in #general" and recent()[0]["reason"] == "muted", what="channel muted verdict")
            time.sleep(0.4); assert len(to_maya()) == n2
            mp.click("#ng-chat-bell"); mp.wait_for_selector(".ng-menu #ng-unmute")
            mp.wait_for_timeout(200)
            mp.screenshot(path=str(SHOTS / "notif-channel-bell.png"))
            mp.click("#ng-unmute")
            wait(lambda: "until" not in prefs()["prefs"]["groups"]["channels"].get(bch, {}), what="channel unmuted")
            mp.wait_for_selector("#ng-chat-bell:not(.on)")

            # 4. Settings › Notifications: every project in one place
            mp.evaluate("TribeSettings.open('notifications')")
            mp.wait_for_selector("[data-sec='ng'] [data-ng-level]", timeout=10000)
            sec = mp.inner_text("[data-sec='ng']")
            assert "Pixel Quest" in sec and A["name"] in sec, sec
            mp.locator(f"[data-sec='ng'] [data-ng-level='{bid}']").scroll_into_view_if_needed()
            mp.wait_for_timeout(250)
            mp.screenshot(path=str(SHOTS / "notif-settings.png"))

            # 5. a second device of the same person follows (a phone), then long-press there
            ph = open_as(b, "Maya-phone", maya, phone=True)
            try: ph.wait_for_function(f"(TribeNotifGroups.state().groups.projects['{bid}'] || {{}}).level === 'all'", timeout=8000)
            except Exception: print("PHONE", ph.url, ph.evaluate("JSON.stringify(TribeNotifGroups.state())")); raise
            mp.select_option(f"[data-ng-level='{bid}']", "none")
            ph.wait_for_function(f"(TribeNotifGroups.state().groups.projects['{bid}'] || {{}}).level === 'none'", timeout=5000)
            mp.select_option(f"[data-ng-mute='{bid}']", "3h")
            ph.wait_for_function(f"TribeNotifGroups.isMuted('project', '{bid}')", timeout=5000)
            n3 = len(to_maya())
            say("@Maya nothing means nothing")
            wait(lambda: recent()[0]["type"] == "mention" and recent()[0]["reason"] == "nothing", what="Nothing silences mentions")
            assert len(to_maya()) == n3
            mp.select_option(f"[data-ng-mute='{bid}']", "off"); mp.select_option(f"[data-ng-level='{bid}']", "mentions")
            ph.wait_for_function(f"!TribeNotifGroups.isMuted('project', '{bid}') && TribeNotifGroups.level('{bid}') === 'mentions'", timeout=5000)

            # phone: long-press a circle in the drawer -> a bottom sheet; drill into Notification settings
            ph.evaluate("for (const id of ['install-sheet']) { const x = document.getElementById(id); if (x) x.remove(); } document.body.classList.add('drawer-open')")
            pc = f"#pj-strip [data-pj-open='{bid}'], #pj-rail [data-pj-open='{bid}']"
            ph.wait_for_function(f"[...document.querySelectorAll(\"{pc}\")].some(x => x.offsetParent)", timeout=8000)
            ph.evaluate(f"""(() => {{ const el = [...document.querySelectorAll("{pc}")].find(x => x.offsetParent); const r = el.getBoundingClientRect();
              const t = new Touch({{ identifier: 1, target: el, clientX: r.left + 10, clientY: r.top + 10 }});
              el.dispatchEvent(new TouchEvent('touchstart', {{ bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }})); }})()""")
            ph.wait_for_selector(".ng-sheet #ng-notif", timeout=3000)
            ph.evaluate("document.dispatchEvent(new TouchEvent('touchend', { bubbles: true }))")
            assert ph.locator(".ng-scrim").count() == 1
            ph.wait_for_timeout(300)
            ph.screenshot(path=str(SHOTS / "notif-phone-sheet.png"))
            ph.click(".ng-sheet #ng-notif")
            ph.wait_for_selector(".ng-sheet .ng-back")
            assert ph.locator(".ng-sheet #ng-lv-mentions").get_attribute("aria-checked") == "true"
            ph.click(".ng-sheet #ng-push")
            wait(lambda: prefs()["prefs"]["groups"]["projects"][bid].get("push") is False, what="mobile push off")
            assert ph.locator(".ng-sheet #ng-push").get_attribute("aria-checked") == "false"
            ph.wait_for_timeout(250)
            ph.screenshot(path=str(SHOTS / "notif-phone-drill.png"))
            ph.click(".ng-sheet .ng-back"); ph.wait_for_selector(".ng-sheet #ng-mute")
            ph.click(".ng-scrim", position={"x": 20, "y": 20}); ph.wait_for_function("!document.querySelector('.ng-sheet')")
            mp.wait_for_function(f"TribeNotifGroups.state().groups.projects['{bid}'].push === false", timeout=5000)

            # DMs always notify unless that DM is muted
            st, dmr = api("/api/me", token=maya); maya_id = dmr["member"]["id"]
            host_id = api("/api/me", token=host)[1]["member"]["id"]
            dch = "dm-" + "-".join(sorted([maya_id, host_id]))
            n4 = len(to_maya())
            api("/api/notify/clock", "POST", {"skewMs": 6 * 3600 * 1000}, maya)
            api(f"/api/chat/{dch}", "POST", {"text": "psst"}, host)
            wait(lambda: len(to_maya()) == n4 + 1, what="DM push")
            api("/api/notify/prefs", "PUT", {"groups": {"channels": {dch: {"mute": "forever"}}}}, maya)
            api("/api/notify/clock", "POST", {"skewMs": 9 * 3600 * 1000}, maya)
            api(f"/api/chat/{dch}", "POST", {"text": "psst again"}, host)
            wait(lambda: recent()[0]["type"] == "dm" and recent()[0]["reason"] == "muted", what="muted DM")
            assert len(to_maya()) == n4 + 1
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("notification settings e2e: OK")
    finally:
        srv.terminate()
        ntfy.shutdown()


if __name__ == "__main__":
    main()
