"""End-to-end calls (p13b): phone calls, video, screen share and the transcriber that knows who said what.

Fake media (Chrome's fake camera/mic/screen) across three people:
  * a private 1:1 call from a person's card: ringing card, Answer, connected both ways; a third member can't see or
    join it; video on, screen share from the desktop, mute, switching the mic, leave and rejoin (the Notes notice shows
    again on rejoin); Notes on with each person's own (stubbed) speech recognizer -> one merged transcript with both
    names in order, live captions with the speaker's name, pause my mic, a shared mic's "Speaker" line renamed;
    the call ends -> ONE meeting capture (attendees, duration, transcript, summary, action items with owners) and one
    note per person, all private to the two of them, a "Meeting notes saved" line in their DM;
  * decline ("Not now" tells the caller) and a missed call (card + a DM line);
  * a three-person project huddle with Notes -> meeting capture + personal notes the project sees, chat line;
  * a phone (390x844) without screen capture: no dead Share button, More says so plainly.
Usage: python app/test/e2e_calls_e2e.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4931 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("TRIBE_SHOTS") or tempfile.mkdtemp(prefix="calls-shots-", dir="/tmp")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []

FAKE_SPEECH = """(() => {
  const inst = [];
  class FakeSR {
    constructor() { this.running = false; inst.push(this); }
    start() { if (this.running) throw new Error('already started'); this.running = true; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { this._end(); } abort() { this._end(); }
    _end() { if (!this.running) return; this.running = false; setTimeout(() => this.onend && this.onend(), 0); }
  }
  const res = (text, final) => { const r = [{ transcript: text, confidence: 0.95 }]; r.isFinal = final; return r; };
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  window.__fakeSpeech = {
    active: () => inst.some(i => i.running),
    say(text) { const live = inst.filter(i => i.running); for (const i of live) { i.onresult && i.onresult({ resultIndex: 0, results: [res(text, true)] }); } return live.length; },
  };
})();"""
NO_SCREEN = "try { delete MediaDevices.prototype.getDisplayMedia; } catch (e) {}"


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


def wait_for(fn, timeout=15, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.2)
    raise AssertionError("timed out waiting for " + what)


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def open_as(b, name, token, phone=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, is_mobile=phone, has_touch=phone, permissions=["microphone", "camera"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script(FAKE_SPEECH)
    if phone: page.add_init_script(NO_SCREEN)
    page.goto(BASE + "/?skipIntro=1")
    wait_text(page, "#sync-status", "connected")
    ins = page.locator("#ins-later")
    if ins.count() and ins.is_visible(): ins.click()
    return page


def in_call(page, n):
    page.wait_for_function(f"TribeHuddle.debug().length === {n} && TribeHuddle.debug().every(d => d.state === 'connected')", timeout=25000)


def shot(page, name):
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / f"calls-{name}.png"))


def captures(token):
    return ok(api("/captures", token=token))["captures"]


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-calls-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Call Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_RING_MS": "2500"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        host_j = ok(api("/bootstrap", "POST", {"name": "Orion"})); host, orion_id = host_j["token"], host_j["member"]["id"]
        code = ok(api("/invites", "POST", {"maxUses": 4}, token=host))["invite"]["code"]
        mj = ok(api("/join", "POST", {"code": code, "name": "Maya"})); maya, maya_id = mj["token"], mj["member"]["id"]
        jj = ok(api("/join", "POST", {"code": code, "name": "Jay"})); jay, jay_id = jj["token"], jj["member"]["id"]
        dm = "dm-" + "-".join(sorted([orion_id, maya_id]))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                  "--auto-select-desktop-capture-source=Entire screen", "--autoplay-policy=no-user-gesture-required"])
            o, m, j = open_as(b, "Orion", host), open_as(b, "Maya", maya), open_as(b, "Jay", jay)

            # ---- 1. a private call from Maya's card: rings, Answer ----
            o.evaluate(f"TribeProfiles.open('{maya_id}', document.body)")
            o.wait_for_selector("[data-pop='call']", timeout=8000)
            o.click("[data-pop='call']")
            o.wait_for_function("TribeHuddle.inCall() && TribeHuddle.dm()", timeout=10000)
            assert o.evaluate("TribeHuddle.dm()") == dm, o.evaluate("TribeHuddle.dm()")
            m.wait_for_selector(".call-ring [data-ring-join]", timeout=8000); wait_text(m, ".call-ring", "is calling you")
            shot(m, "ringing")
            m.click(".call-ring [data-ring-join]")
            in_call(o, 1); in_call(m, 1)
            m.wait_for_selector("#call-stage:not(.hidden)", timeout=5000)
            wait_text(m, "#call-stage .cs-title", "Private call"); wait_text(m, "#call-stage .cs-name", "Orion")
            # Jay can't see it and can't join it
            assert j.evaluate("TribeHuddle.roster().length") == 0, "a private call is invisible to others"
            assert j.evaluate("document.querySelectorAll('.call-ring').length") == 0
            j.evaluate("TribeHuddle.join()")
            j.wait_for_function("!TribeHuddle.inCall()", timeout=8000)
            time.sleep(0.5); assert not j.evaluate("TribeHuddle.inCall()"), "Jay must not get into the private call"
            assert o.evaluate("TribeHuddle.roster().length") == 2

            # ---- 2. video, screen share, mute, switch mic ----
            o.evaluate("TribeCall.open()"); o.wait_for_selector("#call-stage:not(.hidden) .cs-tile")
            o.click("#call-stage .cs-bar [data-c='cam']")
            m.wait_for_function(f"!!TribeHuddle.streamsOf('{orion_id}').cam", timeout=15000)
            o.click("#call-stage .cs-bar [data-c='share']")
            o.wait_for_function("TribeHuddle.me().sharing", timeout=10000)
            m.wait_for_function(f"!!TribeHuddle.streamsOf('{orion_id}').screen", timeout=15000)
            m.wait_for_selector("#call-stage .cs-tile.screen", timeout=8000)
            shot(m, "screen-share")
            o.click("#call-stage .cs-bar [data-c='mic']")
            m.wait_for_function(f"TribeHuddle.roster().some(x => x.id === '{orion_id}' && x.muted)", timeout=5000)
            o.click("#call-stage .cs-bar [data-c='mic']")
            m.wait_for_function(f"TribeHuddle.roster().some(x => x.id === '{orion_id}' && !x.muted)", timeout=5000)
            mics = o.evaluate("TribeHuddle.devices().then(d => d.mic.map(x => x.deviceId))")
            if len(mics) > 1:
                before = o.evaluate("TribeHuddle.localAudio().getAudioTracks()[0].id")
                o.evaluate(f"TribeHuddle.setDevice('mic', {json.dumps(mics[-1])})")
                o.wait_for_function(f"TribeHuddle.localAudio().getAudioTracks()[0].id !== {json.dumps(before)}", timeout=5000)
                in_call(o, 1)
            o.evaluate("TribeHuddle.setDevice('mic', '')")
            o.click("#call-stage .cs-bar [data-c='share']"); o.wait_for_function("!TribeHuddle.me().sharing")
            m.wait_for_function(f"!TribeHuddle.streamsOf('{orion_id}').screen", timeout=10000)

            # ---- 3. Notes on: each person's own mic, merged with names, live captions, notice ----
            o.click("#call-stage .cs-bar [data-c='notes']")
            o.click("#call-stage [data-c='notes-on']")
            for pg in (o, m): pg.wait_for_function("TribeCaptions.state().on && __fakeSpeech.active()", timeout=8000)
            m.wait_for_selector("#call-stage .cs-notice:not(.hidden)", timeout=5000)
            wait_text(m, "#call-stage .cs-notice", "Notes is on"); wait_text(m, "#call-stage .cs-notice", "the two of you")
            m.wait_for_selector("#call-stage .cs-noteson:not(.hidden)")
            shot(m, "notes-notice")
            m.click("#call-stage [data-c='notice-x']")
            o.evaluate("__fakeSpeech.say('lets decide the title screen ships tonight')")
            m.wait_for_function("TribeCaptions.lines().length === 1", timeout=5000)
            wait_text(m, "#call-stage .cs-cc", "Orion")
            m.evaluate("__fakeSpeech.say('I will build the campfire save point tonight')")
            o.wait_for_function("TribeCaptions.lines().length === 2", timeout=5000)
            o.evaluate("__fakeSpeech.say('Maya will test the boss fight on Friday')")
            m.wait_for_function("TribeCaptions.lines().length === 3", timeout=5000)
            names = o.evaluate("TribeCaptions.lines().map(l => l.name)")
            assert names == ["Orion", "Maya", "Orion"], names
            wait_text(o, "#call-stage .cs-tr", "campfire save point")
            shot(o, "notes-transcript")
            # pause my mic: no more transcription on Maya's side; resume
            m.click("#call-stage .cs-bar [data-c='notes']"); m.click("#call-stage [data-c='notes-pause']")
            m.wait_for_function("!__fakeSpeech.active() && TribeCaptions.state().paused.length === 1", timeout=5000)
            assert m.evaluate("__fakeSpeech.say('this should not be heard')") == 0
            m.click("#call-stage [data-c='notes-pause']"); m.wait_for_function("__fakeSpeech.active()", timeout=5000)
            # a shared mic: "Speaker", renamed by someone in the call
            m.check("#call-stage [data-c='notes-shared']")
            m.wait_for_function("TribeCaptions.state().shared.length === 1", timeout=5000)
            m.evaluate("__fakeSpeech.say('Sam here, I can draw the new sprites')")
            o.wait_for_function("TribeCaptions.lines().some(l => l.name === 'Speaker')", timeout=5000)
            n = o.evaluate("TribeCaptions.lines().find(l => l.name === 'Speaker').n")
            o.evaluate(f"TribeCaptions.rename({n}, 'Sam')")
            m.wait_for_function("TribeCaptions.lines().some(l => l.name === 'Sam')", timeout=5000)
            m.uncheck("#call-stage [data-c='notes-shared']")

            # ---- 4. leave and rejoin: the notice shows again ----
            m.evaluate("TribeHuddle.leave()"); o.wait_for_function("TribeHuddle.roster().length === 1", timeout=8000)
            m.evaluate(f"TribeHuddle.join({{ dm: '{dm}' }})")
            in_call(o, 1); in_call(m, 1)
            m.evaluate("TribeCall.open()")
            m.wait_for_selector("#call-stage .cs-notice:not(.hidden)", timeout=5000)
            m.wait_for_function("__fakeSpeech.active()", timeout=5000)

            # ---- 5. end the call -> one meeting note + a note each, only for the two of them ----
            m.evaluate("TribeHuddle.leave()"); o.evaluate("TribeHuddle.leave()")
            def meeting(tok):
                return next((c for c in captures(tok) if c["title"].startswith("Call · ")), None)
            mc = wait_for(lambda: meeting(host), what="meeting capture")
            full = ok(api(f"/captures/{mc['id']}", token=host))["capture"]
            assert full["dm"] == dm, full.get("dm")
            assert full["attendees"] == ["Orion", "Maya"] or set(full["attendees"]) == {"Orion", "Maya"}, full.get("attendees")
            assert full["duration"] and full["duration"] >= 1, full.get("duration")
            whos = [l.get("who") for l in full["transcript"]]
            assert whos[:3] == ["Orion", "Maya", "Orion"], whos
            assert "Sam" in whos, whos
            assert full["summary"], full
            assert any((a.get("owner") or "").lower() == "maya" for a in full["actions"]), full["actions"]
            mine = wait_for(lambda: [c for c in captures(maya) if c["title"].startswith("Maya's notes — Call · ")], what="Maya's own note")
            his = wait_for(lambda: [c for c in captures(host) if c["title"].startswith("Orion's notes — Call · ")], what="Orion's own note")
            mn = ok(api(f"/captures/{mine[0]['id']}", token=maya))["capture"]
            assert all("Orion" not in (l.get("who") or "") for l in mn["transcript"]), mn["transcript"]
            assert any("campfire" in l["text"] for l in mn["transcript"]), mn["transcript"]
            assert any((a.get("owner") or "").lower() == "maya" for a in mn["actions"]), mn["actions"]
            assert mn["dm"] == dm
            # Jay: none of it
            assert not [c for c in captures(jay) if "Call · " in c["title"]], "DM call notes must not reach a third member"
            assert api(f"/captures/{mc['id']}", token=jay)[0] == 404
            msgs = ok(api(f"/chat/{dm}", token=host))
            msgs = msgs.get("messages", msgs if isinstance(msgs, list) else [])
            assert any("Meeting notes saved" in (x.get("text") or "") and x.get("capture") for x in msgs), [x.get("text") for x in msgs][-5:]
            o.evaluate(f"TribeDM.open('{maya_id}')")
            wait_text(o, "#dm-list", "Meeting notes saved", timeout=8000)
            shot(o, "notes-saved")
            # Files lists the captures (Files > Captures)
            o.evaluate(f"TribeCaptures.open('{mc['id']}')")
            o.wait_for_timeout(800)
            shot(o, "meeting-note")

            # ---- 6. decline + missed call ----
            o.evaluate("window.__toasts = []; const t0 = TribeApp.toast; TribeApp.toast = (a, b, c) => { __toasts.push(String(a)); return t0(a, b, c); }")
            o.evaluate(f"TribeCall.callPerson('{jay_id}')")
            j.wait_for_selector(".call-ring [data-ring-x]", timeout=8000)
            j.click(".call-ring [data-ring-x]")
            try: o.wait_for_function("__toasts.some(t => t.includes(\"can't talk right now\"))", timeout=8000)
            except Exception: raise AssertionError(o.evaluate("__toasts"))
            o.evaluate("TribeHuddle.leave()")
            o.wait_for_timeout(500)
            o.evaluate(f"TribeCall.callPerson('{jay_id}')")
            j.wait_for_selector(".call-ring", timeout=8000)
            j.wait_for_function("document.querySelector('.call-ring') && document.querySelector('.call-ring').textContent.includes('Missed call')", timeout=10000)
            jdm = "dm-" + "-".join(sorted([orion_id, jay_id]))
            wait_for(lambda: any("Missed call from Orion" in (x.get("text") or "") for x in (lambda r: r.get("messages", []))(ok(api(f"/chat/{jdm}", token=jay)))), what="missed-call DM line")
            o.evaluate("TribeHuddle.leave()"); j.evaluate("document.querySelectorAll('.call-ring').forEach(x => x.remove())")
            o.wait_for_timeout(600)

            # ---- 7. three people in a project huddle, Notes from two of them ----
            for pg in (o, m, j): pg.evaluate("TribeHuddle.join()"); pg.wait_for_function("TribeHuddle.inCall()", timeout=10000)
            for pg in (o, m, j): in_call(pg, 2)
            assert o.evaluate("TribeHuddle.dm()") is None
            o.evaluate("TribeCall.open()"); o.wait_for_function("document.querySelectorAll('#call-stage .cs-tile').length === 3", timeout=10000)
            o.click("#call-stage .cs-bar [data-c='notes']"); o.click("#call-stage [data-c='notes-on']")
            for pg in (o, m, j): pg.wait_for_function("TribeCaptions.state().on && __fakeSpeech.active()", timeout=8000)
            j.click("#call-stage .cs-bar [data-c='notes']") if j.evaluate("TribeCall.isOpen()") else j.evaluate("TribeCaptions.pause(true)")
            j.wait_for_function("TribeCaptions.state().paused.length === 1", timeout=5000)
            o.evaluate("__fakeSpeech.say('we agreed the fishing game is next')")
            m.wait_for_function("TribeCaptions.lines().length === 1", timeout=5000)
            m.evaluate("__fakeSpeech.say('I will write the fishing spec tomorrow')")
            o.wait_for_function("TribeCaptions.lines().length === 2", timeout=5000)
            o.click("#call-stage .cs-bar [data-c='people']")
            shot(o, "three-people")
            o.click("#call-stage .cs-bar [data-c='notes']"); o.click("#call-stage [data-c='notes-off']")   # Notes off saves now
            def proj_meeting():
                return next((c for c in captures(jay) if c["title"].startswith("Meeting · ")), None)
            pm = wait_for(proj_meeting, what="project meeting capture")
            pfull = ok(api(f"/captures/{pm['id']}", token=jay))["capture"]
            assert not pfull.get("dm") and set(pfull["attendees"]) == {"Orion", "Maya", "Jay"}, pfull.get("attendees")
            assert [l["who"] for l in pfull["transcript"]] == ["Orion", "Maya"], pfull["transcript"]
            own = wait_for(lambda: [c["title"] for c in captures(jay) if "'s notes — Meeting · " in c["title"]], what="personal notes")
            assert any(t.startswith("Maya's notes") for t in own) and any(t.startswith("Orion's notes") for t in own), own
            assert not any(t.startswith("Jay's notes") for t in own), "Jay paused and had no actions: no empty note"
            o.evaluate("TribeApp.show('chat')"); wait_text(o, "#chat-list", "Meeting notes saved", timeout=8000)
            for pg in (o, m, j): pg.evaluate("TribeHuddle.leave()")

            # ---- 8. a phone without screen capture ----
            ph = open_as(b, "Jay", jay, phone=True)
            o.evaluate("TribeHuddle.join()"); o.wait_for_function("TribeHuddle.inCall()")
            ph.evaluate("TribeHuddle.join()"); in_call(ph, 1)
            ph.evaluate("TribeCall.open()"); ph.wait_for_selector("#call-stage:not(.hidden) .cs-tile")
            assert ph.evaluate("document.querySelector('#call-stage .cs-bar [data-c=\"share\"]').hidden"), "no dead Share button on a phone that can't share"
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            shot(ph, "phone-stage")
            ph.click("#call-stage .cs-bar [data-c='more']")
            wait_text(ph, "#call-stage .cs-pop", "Screen sharing isn't available on this phone")
            shot(ph, "phone-more")
            ph.keyboard.press("Escape")
            o.click("#call-stage .cs-bar [data-c='notes']") if o.evaluate("TribeCall.isOpen()") else o.evaluate("TribeCall.open()")
            o.evaluate("TribeCaptions.toggle(true)")
            ph.wait_for_function("TribeCaptions.state().on", timeout=5000)
            ph.wait_for_selector("#call-stage .cs-notice:not(.hidden)", timeout=5000)
            o.evaluate("__fakeSpeech.say('phone check, can you read this caption')")
            wait_text(ph, "#call-stage .cs-cc", "Orion")
            shot(ph, "phone-notes")
            for pg in (ph, o): pg.evaluate("TribeHuddle.leave()")
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print(f"e2e_calls_e2e: OK (private call from a card: ring/answer, invisible to others; video, screen share, mute, mic switch, leave/rejoin; Notes: merged transcript with names, captions, notice, pause, shared-mic rename; meeting + personal notes as captures, DM-private; decline + missed; 3-person huddle notes; phone without screen share)  shots: {SHOTS}")


if __name__ == "__main__":
    main()
