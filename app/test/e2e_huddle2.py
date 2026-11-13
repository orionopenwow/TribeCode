"""End-to-end: calls beyond the basics (app/ui/huddle.js core, app/ui/call.js stage, server/calls.js).

Two (fake-device) people in a call: relay config (host only; LAN-only empties the ICE list), the call stage opens,
deafen mutes everyone for me and shows muted to the other side, raise hand shows on both, push to talk keeps the mic
off until Space is held, in-call chat and a /poll with a vote, reactions float on the other side, notes panel reads the
Secretary's summary, recording is announced to everyone (red dot + chat line) and saves to Files, a locked call makes a
newcomer knock and be let in, ringing someone shows a card and an unanswered ring becomes a missed-call card,
reconnecting the WebSocket puts you back in the call, call history lists the call with its people and chat.
Phone 390px: the stage fits with no sideways scroll and the bar's buttons are at least 44px tall.
Usage: python app/test/e2e_huddle2.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4897 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(tempfile.mkdtemp(prefix="h2-shots-", dir="/tmp"))
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def open_as(b, name, token, phone=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, is_mobile=phone, has_touch=phone, permissions=["microphone", "camera"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script("(() => { const W = window.WebSocket; window.__socks = []; const P = function (u, p) { const s = p ? new W(u, p) : new W(u); window.__socks.push(s); return s; }; P.prototype = W.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => P[k] = W[k]); window.WebSocket = P; })()")
    page.goto(BASE + "/?skipIntro=1")
    wait_text(page, "#sync-status", "connected")
    ins = page.locator("#ins-later")
    if ins.count() and ins.is_visible(): ins.click()
    return page


def in_call(page, n):
    page.wait_for_function(f"TribeHuddle.debug().length === {n} && TribeHuddle.debug().every(d => d.state === 'connected')", timeout=20000)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-h2-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Call Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_RING_MS": "1500"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}))["token"]
        code = ok(api("/invites", "POST", {"maxUses": 3}, token=host))["invite"]["code"]
        maya = ok(api("/join", "POST", {"code": code, "name": "Maya"}))["token"]
        jay_j = ok(api("/join", "POST", {"code": code, "name": "Jay"})); jay, jay_id = jay_j["token"], jay_j["member"]["id"]

        # relay config: host only; LAN-only means no STUN/TURN at all
        assert api("/calls/config", "PUT", {"lanOnly": True}, token=maya)[0] == 403
        ok(api("/calls/config", "PUT", {"turn": [{"urls": ["turn:relay.example.org:3478"], "username": "u", "credential": "secret"}]}, token=host))
        ice = ok(api("/calls/ice", token=maya))
        assert any("turn:relay.example.org:3478" in json.dumps(s) for s in ice["iceServers"]), ice
        assert ok(api("/calls/config", token=maya))["turn"][0]["credential"] == "••••", "friends don't see the TURN password in settings"
        ok(api("/calls/config", "PUT", {"lanOnly": True}, token=host))
        assert ok(api("/calls/ice", token=maya)) == {"iceServers": [], "lanOnly": True}

        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            o, m = open_as(b, "Orion", host), open_as(b, "Maya", maya)
            o.evaluate("TribeHuddle.join()"); o.wait_for_function("TribeHuddle.inCall()")
            m.evaluate("TribeHuddle.join()")
            in_call(o, 1); in_call(m, 1)

            # the stage
            o.evaluate("TribeCall.open()"); o.wait_for_selector("#call-stage:not(.hidden) .cs-tile", timeout=5000)
            o.wait_for_function("document.querySelectorAll('#call-stage .cs-tile').length === 2", timeout=8000)

            # deafen: my speakers off, and the other side sees me muted
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='deaf']")
            assert o.evaluate("[...document.querySelectorAll('#huddle-audio audio')].every(a => a.muted)"), "deafened = remote audio muted"
            m.wait_for_function("TribeHuddle.roster().find(x => x.deaf && x.muted)", timeout=5000)
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='deaf']")
            assert o.evaluate("[...document.querySelectorAll('#huddle-audio audio')].every(a => !a.muted)")

            # raise hand
            o.click("#call-stage .cs-bar [data-c='hand']")
            m.wait_for_function("TribeHuddle.roster().some(x => x.hand)", timeout=5000)
            m.wait_for_selector("#huddle-box .hface .hand", timeout=5000)
            o.click("#call-stage .cs-bar [data-c='hand']")
            m.wait_for_function("!TribeHuddle.roster().some(x => x.hand)", timeout=5000)

            # push to talk: muted until Space is held (focus outside text fields)
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='ptt']")
            assert o.evaluate("TribeHuddle.me().ptt && TribeHuddle.me().muted")
            o.locator("#call-stage .cs-top").click()
            o.keyboard.down("Space"); o.wait_for_function("!TribeHuddle.me().muted", timeout=2000)
            m.wait_for_function("TribeHuddle.roster().some(x => !x.muted && x.id !== TribeClient.state().me.id)", timeout=5000)
            o.keyboard.up("Space"); o.wait_for_function("TribeHuddle.me().muted", timeout=2000)
            o.evaluate("TribeHuddle.setPtt(false)"); o.wait_for_function("!TribeHuddle.me().muted")

            # in-call chat + a poll + a reaction
            m.evaluate("TribeCall.open()"); m.wait_for_selector("#call-stage:not(.hidden)")
            m.click("#call-stage .cs-bar [data-c='chat']"); m.fill("#cs-chat-in", "can everyone hear me?"); m.press("#cs-chat-in", "Enter")
            o.wait_for_function("document.querySelector('#call-stage .cs-bar [data-c=\"chat\"] .cs-badge:not(.hidden)')", timeout=5000)
            o.click("#call-stage .cs-bar [data-c='chat']"); wait_text(o, "#call-stage .cs-chat", "can everyone hear me?")
            o.fill("#cs-chat-in", "/poll Ship tonight? yes, tomorrow"); o.press("#cs-chat-in", "Enter")
            m.wait_for_selector("#call-stage .cs-poll", timeout=5000)
            m.locator("#call-stage .cs-poll [data-vote='0']").click()
            o.wait_for_function("document.querySelector('#call-stage .cs-poll small') && document.querySelector('#call-stage .cs-poll small').textContent.startsWith('1 vote')", timeout=5000)
            m.evaluate("TribeCall.react('🎉')")
            o.wait_for_selector("#call-stage .cs-float", timeout=5000)

            # notes panel: the Secretary's no-AI summary
            ok(api("/chat/general", "POST", {"text": "We decided to ship the title screen tonight. Maya can you test it by Friday?"}, token=host))
            o.click("#call-stage .cs-bar [data-c='notes']"); wait_text(o, "#call-stage .cs-notes", "title screen", timeout=8000)

            # recording: everyone told, saved to Files
            o.on("dialog", lambda d: d.accept())
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='rec']")
            m.wait_for_selector("#call-stage .cs-rec:not(.hidden)", timeout=5000)
            m.evaluate("TribeApp.show('chat')"); wait_text(m, "#chat-list", "started recording", timeout=8000)
            o.wait_for_timeout(1500)
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='rec']")
            m.wait_for_selector("#call-stage .cs-rec.hidden", state="attached", timeout=8000)
            files = ok(api("/uploads?all=1", token=host))
            assert any(f["name"].startswith("huddle-") for f in files.get("project", []) + files.get("mine", [])), files
            o.screenshot(path=str(SHOTS / "stage.png"))

            # lock: Jay knocks, Orion lets him in
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='lock']")
            o.wait_for_selector("#call-stage .cs-lock:not(.hidden)")
            j = open_as(b, "Jay", jay)
            j.evaluate("TribeHuddle.join()")
            j.wait_for_function("TribeHuddle.inLobby()", timeout=8000)
            o.wait_for_selector("#call-stage .cs-knock:not(.hidden) [data-admit]", timeout=8000)
            o.click("#call-stage [data-admit]")
            j.wait_for_function("TribeHuddle.inCall() && TribeHuddle.roster().length === 3", timeout=15000)
            j.evaluate("TribeHuddle.leave()"); o.wait_for_function("TribeHuddle.roster().length === 2", timeout=8000)

            # ring Jay: a card; unanswered -> a missed-call card
            o.evaluate(f"TribeCall.ring('{jay_id}')")
            j.wait_for_selector(".call-ring [data-ring-join]", timeout=5000)
            wait_text(j, ".call-ring", "is calling you")
            j.wait_for_function("document.querySelector('.call-ring') && document.querySelector('.call-ring').textContent.includes('Missed huddle')", timeout=8000)

            # reconnect: drop Maya's WebSocket; she comes back into the call by herself
            m.evaluate("window.__socks[window.__socks.length - 1].close()")
            m.wait_for_function("!TribeHuddle.inCall()", timeout=8000)
            m.wait_for_function("TribeHuddle.inCall() && TribeHuddle.debug().length === 1 && TribeHuddle.debug()[0].state === 'connected'", timeout=25000)

            # phone fits
            ph = open_as(b, "Jay", jay, phone=True)
            ph.evaluate("TribeHuddle.join()")
            ph.wait_for_function("TribeHuddle.inLobby() || TribeHuddle.inCall()", timeout=8000)
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='lock']")   # unlock
            if ph.evaluate("TribeHuddle.inLobby()"):
                o.wait_for_selector("#call-stage [data-admit]", timeout=8000); o.click("#call-stage [data-admit]")
            ph.wait_for_function("TribeHuddle.inCall()", timeout=15000)
            ph.evaluate("TribeCall.open()"); ph.wait_for_selector("#call-stage:not(.hidden) .cs-tile")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            hb = ph.locator("#call-stage .cs-bar [data-c='mic']").bounding_box(); assert hb["height"] >= 44, hb
            ph.screenshot(path=str(SHOTS / "stage-phone.png"))
            ph.evaluate("TribeHuddle.leave()")

            # history after everyone leaves
            for pg in (m, o): pg.evaluate("TribeHuddle.leave()")
            time.sleep(0.6)
            hist = ok(api("/calls/history", token=host))["calls"]
            assert hist and "Maya" in hist[0]["names"] and any("hear me" in c["text"] for c in hist[0]["chat"]) and hist[0]["polls"], hist[:1]
            assert any(r.get("file") for r in hist[0]["recordings"]), hist[0]["recordings"]
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print(f"e2e_huddle2: OK (relay config, stage, deafen, hand, push to talk, chat, poll, reaction, notes, recording, lock/knock/admit, ring + missed, reconnect, phone, history)  shots: {SHOTS}")


if __name__ == "__main__":
    main()
