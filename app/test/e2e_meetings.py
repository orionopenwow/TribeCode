"""Scheduled meetings (p14): schedule from the calendar, the chat card with live RSVPs, private DM meetings, reminders,
Join now (the project huddle, Notes on when asked, the note named after the meeting), .ics, edit/move, cancel, phone sheet.

Fake media (Chrome's fake mic) and a stubbed speech recognizer. Reminders: TRIBE_MEETING_TICK_MS=400 so the reminder loop
runs often; meetings are put a minute or a few seconds ahead so the 10-minute and start reminders are due at once.
Usage: python app/test/e2e_meetings.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4961 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("TRIBE_SHOTS") or tempfile.mkdtemp(prefix="meet-shots-", dir="/tmp")); SHOTS.mkdir(parents=True, exist_ok=True)
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
        time.sleep(0.25)
    raise AssertionError("timed out waiting for " + what)


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => [...document.querySelectorAll(s)].some(e => e.textContent.includes(t))", arg=[sel, text], timeout=timeout)


def iso(dt): return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def open_as(b, name, token, phone=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, is_mobile=phone, has_touch=phone, permissions=["microphone"], accept_downloads=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e} {(e.stack or '')[:300]}"))
    page.on("dialog", lambda d: d.accept())
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script(FAKE_SPEECH)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=20000)
    ins = page.locator("#ins-later")
    if ins.count() and ins.is_visible(): ins.click()
    return page


def shot(page, name):
    page.wait_for_timeout(350)
    page.screenshot(path=str(SHOTS / f"meet-{name}.png"))


def card_sel(mid): return f".mtg-card[data-meeting='{mid}']"


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-meet-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Meet Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_MEETING_TICK_MS": "400", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        hj = ok(api("/bootstrap", "POST", {"name": "Orion"})); host, orion_id = hj["token"], hj["member"]["id"]
        code = ok(api("/invites", "POST", {"maxUses": 4}, token=host))["invite"]["code"]
        mj = ok(api("/join", "POST", {"code": code, "name": "Maya"})); maya, maya_id = mj["token"], mj["member"]["id"]
        jj = ok(api("/join", "POST", {"code": code, "name": "Jay"})); jay, jay_id = jj["token"], jj["member"]["id"]
        dm = "dm-" + "-".join(sorted([orion_id, maya_id]))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            o, m = open_as(b, "Orion", host), open_as(b, "Maya", maya)

            # ---- 1. schedule from the calendar, for the whole project ----
            o.evaluate("TribeApp.show('calendar')")
            o.wait_for_selector("#cal-meet", timeout=8000)
            o.click("#cal-meet")
            o.wait_for_selector("#mtg-sheet .mtg-sheet")
            o.fill("#mtg-title", "Design review")
            o.click("#mtg-sheet [data-q='tomorrow']")
            o.fill("#mtg-time", "15:00")
            o.click("#mtg-sheet [data-len='60']")
            o.fill("#mtg-agenda", "Pick the title screen\nBoss fight balance")
            o.click("#mtg-notes")
            assert o.get_attribute("#mtg-notes", "aria-checked") == "true"
            assert "Your time" in o.inner_text("#mtg-sheet .mtg-tz")
            shot(o, "sheet-desktop")
            o.click("#mtg-save")
            o.wait_for_selector("#mtg-sheet", state="detached", timeout=8000)
            evs = ok(api("/meetings", token=maya))["meetings"]
            dr = next(e for e in evs if e["title"] == "Design review")
            mid = dr["id"]
            assert dr["kind"] == "meeting" and dr["scope"] == "project" and dr["notesOn"] and dr["agenda"].startswith("Pick the title"), dr
            assert round((datetime.fromisoformat(dr["end"].replace("Z", "+00:00")) - datetime.fromisoformat(dr["start"].replace("Z", "+00:00"))).total_seconds() / 60) == 60
            cal = ok(api(f"/calendar?from={iso(datetime.now(timezone.utc) - timedelta(days=1))}&to={iso(datetime.now(timezone.utc) + timedelta(days=9))}", token=maya))
            assert any(x["id"] == mid and x.get("kind") == "meeting" for x in cal["occurrences"]), "calendar entry"
            o.wait_for_function(f"TribePlan.state().occ.some(x => x.id === '{mid}' && x.kind === 'meeting')", timeout=8000)
            # the card in #general, for both
            for pg in (o, m):
                pg.evaluate("TribeApp.show('chat')")
                pg.wait_for_selector(card_sel(mid), timeout=10000)
            wait_text(m, card_sel(mid) + " .mtg-title", "Design review")
            wait_text(m, card_sel(mid) + " .mtg-meta", "1 h")

            # ---- 2. Maya says Going: live on both ----
            m.click(card_sel(mid) + " [data-mt-rsvp='yes']")
            o.wait_for_function(f"(() => {{ const b = document.querySelector(\"{card_sel(mid)} [data-mt-rsvp='yes'] b\"); return b && b.textContent === '2'; }})()", timeout=8000)
            m.wait_for_selector(card_sel(mid) + " [data-mt-rsvp='yes'].on")
            ev = ok(api(f"/meetings/{mid}", token=host))["meeting"]
            assert ev["rsvp"].get(maya_id) == "yes", ev["rsvp"]
            shot(o, "card-desktop")

            # ---- 3. .ics: a standard VEVENT, nothing secret ----
            with o.expect_download() as dl:
                o.click(card_sel(mid) + " [data-mt-ics]")
            path = dl.value.path(); txt = Path(path).read_bytes().decode("utf-8")
            assert dl.value.suggested_filename == "design-review.ics", dl.value.suggested_filename
            for need in ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", f"UID:{mid}@tribecode", "DTSTART:", "DTEND:", "SUMMARY:Design review", "DESCRIPTION:Pick the title screen\\nBoss fight balance", "END:VEVENT", "END:VCALENDAR"]:
                assert need in txt, (need, txt)
            assert "\r\n" in txt and host not in txt and maya not in txt and "token" not in txt.lower() and "http" not in txt

            # ---- 4. a DM meeting: only those two see it ----
            start = datetime.now(timezone.utc) + timedelta(days=2)
            dmm = ok(api("/meetings", "POST", {"title": "Private sync", "start": iso(start), "duration": 15, "scope": "dm", "dm": dm}, token=host))["meeting"]
            assert dmm["dm"] == dm and set(dmm["attendees"]) == {orion_id, maya_id}
            assert not any(e["id"] == dmm["id"] for e in ok(api("/meetings", token=jay))["meetings"]), "Jay must not see a DM meeting"
            assert api(f"/meetings/{dmm['id']}", token=jay)[0] == 404
            assert api(f"/calendar/{dmm['id']}", token=jay)[0] == 404
            calj = ok(api(f"/calendar?from={iso(datetime.now(timezone.utc))}&to={iso(datetime.now(timezone.utc) + timedelta(days=5))}", token=jay))
            assert not any(e["id"] == dmm["id"] for e in calj["events"] + calj["occurrences"])
            assert any(e["id"] == dmm["id"] for e in ok(api("/meetings", token=maya))["meetings"])
            assert api(f"/meetings/{dmm['id']}/rsvp", "POST", {"answer": "yes"}, token=jay)[0] == 404
            # a DM meeting can't be made by someone outside it
            assert api("/meetings", "POST", {"title": "Sneaky", "start": iso(start), "scope": "dm", "dm": dm}, token=jay)[0] == 400
            m.evaluate(f"TribeDM.open('{orion_id}')")
            m.wait_for_selector(card_sel(dmm["id"]), timeout=10000)
            wait_text(m, card_sel(dmm["id"]) + " .mtg-who", "Orion")

            # ---- 5. edit the time: attendees are told ----
            ok(api(f"/meetings/{mid}", "PATCH", {"start": iso(datetime.now(timezone.utc) + timedelta(days=3))}, token=host))
            wait_for(lambda: any("Design review moved" in i["title"] for i in ok(api("/notify/inbox", token=maya))["items"]), 8, "moved notice")
            assert api(f"/meetings/{mid}", "PATCH", {"title": "Mine now"}, token=jay)[0] == 403, "only the organizer or a lead edits"

            # ---- 6. reminders: 10 min before, and at the start, with Join ----
            soon = ok(api("/meetings", "POST", {"title": "Standup", "start": iso(datetime.now(timezone.utc) + timedelta(minutes=3)), "duration": 15}, token=host))["meeting"]
            it = wait_for(lambda: next((i for i in ok(api("/notify/inbox", token=maya))["items"] if i["title"].startswith("Standup in ")), None), 8, "10-minute reminder")
            assert it["type"] == "reminder" and it["view"] == "meeting:" + soon["id"] and any(a["label"] == "Join" for a in it.get("actions") or []), it
            assert it.get("project"), "reminder carries its project so per-group settings apply"
            m.evaluate("TribeNotify.openInbox()")
            m.wait_for_selector("#nf-list .nf-item, #nf-list .nf-group-head", timeout=8000)
            if m.locator("#nf-list .nf-group-head").count(): m.click("#nf-list .nf-group-head >> nth=0")   # reminders back to back collapse into one row
            wait_text(m, ".nf-item .nf-title", "Standup in ")
            m.evaluate("TribeNotify.closeInbox()")

            kick = ok(api("/meetings", "POST", {"title": "Kickoff", "start": iso(datetime.now(timezone.utc) + timedelta(seconds=4)), "duration": 30, "notesOn": True, "agenda": "Who builds what"}, token=host))["meeting"]
            wait_for(lambda: any(i["title"] == "Kickoff is starting" for i in ok(api("/notify/inbox", token=maya))["items"]), 12, "start reminder")

            # ---- 7. Join now: the project huddle, Notes on, the note named after the meeting ----
            m.evaluate("TribeDM.open && TribeDM.back && TribeDM.back()"); m.evaluate("TribeApp.show('chat')")
            m.wait_for_selector(card_sel(kick["id"]) + " [data-mt-join]", timeout=15000)
            shot(m, "join-now-desktop")
            m.click(card_sel(kick["id"]) + " [data-mt-join]")
            m.wait_for_function("TribeHuddle.inCall()", timeout=10000)
            m.wait_for_function("TribeCaptions.state().on", timeout=10000)
            wait_text(m, "#chat-list", "turned on Notes for the call")
            m.wait_for_function("__fakeSpeech.active()", timeout=8000)
            m.evaluate("__fakeSpeech.say('Maya builds the boss fight and Orion does the title screen')")
            time.sleep(1.0)
            m.evaluate("TribeHuddle.leave()")
            cap = wait_for(lambda: next((c for c in ok(api("/captures", token=host))["captures"] if c.get("title", "").startswith("Kickoff · ")), None), 20, "meeting note named after the meeting")
            assert "Who builds what" in (cap.get("summary") or "") or cap.get("agenda") == "Who builds what", cap

            # ---- 8. cancel: the card says Cancelled for everyone ----
            o.evaluate("TribeApp.show('chat')")
            o.wait_for_selector(card_sel(mid) + " [data-mt-edit]", timeout=8000)
            o.click(card_sel(mid) + " [data-mt-edit]")
            o.wait_for_selector("#mtg-cancel-m"); o.click("#mtg-cancel-m")
            m.wait_for_selector(card_sel(mid) + ".st-cancelled", timeout=8000)
            wait_text(m, card_sel(mid), "Cancelled")
            assert ok(api(f"/meetings/{mid}", token=maya))["meeting"]["cancelled"] is True
            wait_for(lambda: any(i["title"] == "Cancelled: Design review" for i in ok(api("/notify/inbox", token=maya))["items"]), 8, "cancel notice")
            assert api(f"/meetings/{soon['id']}/cancel", "POST", {}, token=jay)[0] == 403

            # ---- 9. the header call button: Start now / Schedule… ----
            o.wait_for_selector(".cb-btn[data-cb='huddle']", timeout=8000)
            o.click(".cb-btn[data-cb='huddle']")
            o.wait_for_selector(".tf-menu button", timeout=5000)
            wait_text(o, ".tf-menu", "Schedule")
            o.keyboard.press("Escape")
            # Home: the Next line
            o.evaluate("TribeMeetings.paint()")
            assert "Kickoff" in o.evaluate("TribeMeetings.nextLine()") and "data-mt-join" in o.evaluate("TribeMeetings.nextLine()"), o.evaluate("TribeMeetings.nextLine()")

            # ---- 10. phone: the sheet from the bottom, no sideways scroll ----
            j = open_as(b, "Jay", jay, phone=True)
            j.evaluate("TribeMeetings.open({ channel: 'general' })")
            j.wait_for_selector("#mtg-sheet.mtg-phone .mtg-sheet", timeout=8000)
            box = j.locator("#mtg-sheet .mtg-sheet").bounding_box()
            assert box["width"] >= 388 and box["x"] <= 1, box
            assert j.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert j.evaluate("(() => { const s = document.querySelector('#mtg-sheet .mtg-sheet'); return s.scrollWidth <= s.clientWidth + 1; })()")
            j.fill("#mtg-title", "Playtest")
            j.click("#mtg-sheet [data-scope='people']")
            j.click(f"#mtg-sheet [data-mid='{maya_id}']"); j.click(f"#mtg-sheet [data-mid='{orion_id}']")
            wait_text(j, "#mtg-big", "project huddle")
            shot(j, "sheet-phone")
            j.click("#mtg-save")
            j.wait_for_selector("#mtg-sheet", state="detached", timeout=8000)
            pt = next(e for e in ok(api("/meetings", token=jay))["meetings"] if e["title"] == "Playtest")
            assert pt["scope"] == "people" and set(pt["attendees"]) == {jay_id, maya_id, orion_id}
            assert ok(api(f"/meetings/{pt['id']}/join", "POST", {}, token=jay)).get("how") == "huddle"
            j.evaluate("TribeApp.show('chat')")
            j.wait_for_selector(card_sel(pt["id"]), timeout=10000)
            j.evaluate(f"document.querySelector(\"{card_sel(pt['id'])}\").scrollIntoView({{ block: 'center' }})")
            shot(j, "card-phone")

        assert not errors, errors
        print("e2e_meetings: OK  (shots in", SHOTS, ")")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
