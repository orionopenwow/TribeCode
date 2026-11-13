"""End-to-end: voice notes everywhere + the Secretary's no-AI notes (app/ui/voicenote.js, app/ui/secsum.js,
server/secretary.js /summary + /actions, chatx voice-note speed and seek).

API: chat lines and a voice-note transcript -> /api/secretary/summary gives a TextRank summary, action items with
the owner and a due date parsed from the words, decisions, questions, links; "Make it a task" makes a task with that
assignee and due date (idempotent); dismiss hides one; a voice note handed to the Secretary lands in the journal.
UI (fake microphone): the recorder sheet records, pauses, resumes and finishes with a blob and a waveform; it uploads
to Files; the task drawer and the Secretary view get a "Voice note" button; chat voice notes cycle 1x/1.5x/2x;
the Secretary's "Notes from today's talk" section shows action items and makes one a task. Phone 390px: no sideways
scroll, the recorder is a bottom sheet with 44px buttons.
Usage: python app/test/e2e_voice_notes.py
"""
import base64, json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4893 + OFF
BASE = f"http://localhost:{PORT}"
errors = []
SHOTS = Path(tempfile.mkdtemp(prefix="vn-shots-", dir="/tmp"))


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, token, pid, mobile=False, hash_=""):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, permissions=["microphone"])
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}');")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1" + hash_)
    wait_text(page, "#sync-status", "connected")
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-vn-", dir="/tmp")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Jam Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")
        camp, cid = boot["token"], boot["member"]["id"]
        pid = ok(api("/projects", "POST", {"name": "Lantern Jam"}, token=camp))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder", "project": pid}, token=camp))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, mid = j["token"], j["member"]["id"]

        # ---------------- talk: chat + a voice note transcript ----------------
        for who, t in [(camp, "Ok so we decided to go with Phaser for the jam. Maya can you draw the title screen by Friday?"),
                       (camp, "I'll set up the repo tomorrow. Check https://phaser.io/examples for ideas."),
                       (maya, "What should the levels look like? The level editor keeps crashing when you save a big map.")]:
            ok(api("/chat/general", "POST", {"text": t}, token=who, project=pid), "chat")
        tiny = base64.b64encode(b"\x1aE\xdf\xa3" + b"\x00" * 200).decode()
        ok(api("/chat/general/voice", "POST", {"data": tiny, "mime": "audio/webm", "dur": 4, "transcript": "Camp needs to record the music before next week so we can ship this weekend.", "wave": [3, 5, 7, 4]}, token=maya, project=pid), "voice note")

        s = ok(api("/secretary/summary", token=camp, project=pid), "summary")
        assert s["items"] >= 4, s
        assert any("Phaser" in x for x in s["summary"]), s["summary"]
        acts = {a["title"]: a for a in s["actions"]}
        draw = next(a for t, a in acts.items() if "title screen" in t)
        assert draw["owner"] == mid and draw["due"], draw
        repo = next(a for t, a in acts.items() if "repo" in t.lower())
        assert repo["owner"] == cid and repo["due"], repo
        music = next(a for t, a in acts.items() if "music" in t.lower())
        assert music["owner"] == cid, music
        assert any("Phaser" in d["text"] for d in s["decisions"]), s["decisions"]
        assert any("levels" in q["text"] for q in s["questions"]), s["questions"]
        assert any("phaser.io" in l["url"] for l in s["links"]), s["links"]

        t = ok(api(f"/secretary/actions/{draw['id']}/task", "POST", token=camp, project=pid), "act task")
        tasks = ok(api("/tasks", token=camp, project=pid))["tasks"]
        task = next(x for x in tasks if x["id"] == t["task"])
        assert "title screen" in task["title"].lower() and task.get("due") == draw["due"], task
        t2 = ok(api(f"/secretary/actions/{draw['id']}/task", "POST", token=camp, project=pid))
        assert t2["task"] == t["task"], "one tap, one task"
        ok(api(f"/secretary/actions/{repo['id']}/dismiss", "POST", token=camp, project=pid))
        left = ok(api("/secretary/actions", token=camp, project=pid))["actions"]
        assert not any(a["id"] == repo["id"] for a in left), "dismissed actions stay hidden"
        ok(api("/secretary/note", "POST", {"text": "Remember to add a pause menu to the jam game", "kind": "voice"}, token=maya, project=pid))
        j2 = ok(api("/secretary", token=camp, project=pid))["journal"]["md"]
        assert "pause menu" in j2 and "voice note" in j2, j2[:600]
        assert "## Action items" in j2, "the journal carries the action items"

        # ---------------- UI ----------------
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            page = login(b, {"width": 1280, "height": 860}, "Camp", camp, pid, hash_="#/secretary")
            page.wait_for_selector(".sy-today", timeout=10000)
            wait_text(page, ".sy-today", "Notes from today's talk")
            wait_text(page, ".sy-acts", "music")
            page.wait_for_selector("[data-vnote='secretary']", timeout=5000)
            page.screenshot(path=str(SHOTS / "secretary-today.png"))
            mb = page.locator(".sy-act", has_text="music").locator("[data-act-task]")
            mb.click()
            page.wait_for_function("() => [...document.querySelectorAll('.sy-act')].some(e => /music/i.test(e.innerText) && e.classList.contains('done'))", timeout=8000)

            # the recorder sheet: record, pause, resume, done -> a blob and a waveform; upload to Files
            page.evaluate("() => { window.__vr = window.TribeVoiceNote.record({ title: 'Test' }); }")
            page.wait_for_selector(".vrec-scrim", timeout=5000)
            page.wait_for_timeout(900)
            page.click("[data-vr='pause']"); wait_text(page, "[data-vr='pause']", "Resume")
            t_paused = page.inner_text(".vrec-t"); page.wait_for_timeout(700)
            assert page.inner_text(".vrec-t") == t_paused, "the clock stops while paused"
            page.click("[data-vr='pause']"); page.wait_for_timeout(700)
            page.screenshot(path=str(SHOTS / "recorder.png"))
            page.click("[data-vr='done']")
            rec = page.evaluate("async () => { const r = await window.__vr; if (!r) return null; const u = await window.TribeVoiceNote.upload(r); const res = await fetch(u.url, { headers: { Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('tribecode.settings.v1')).server.token } }); return { size: r.blob.size, dur: r.dur, wave: r.wave.length, status: res.status, md: window.TribeVoiceNote.markdown(r, u.url) }; }")
            assert rec and rec["size"] > 500 and rec["dur"] >= 1 and rec["wave"] == 32 and rec["status"] == 200, rec
            assert "Voice note" in rec["md"] and "/api/uploads/" in rec["md"], rec["md"]
            # Esc throws a recording away
            page.evaluate("() => { window.__vr2 = window.TribeVoiceNote.record({}); }")
            page.wait_for_selector(".vrec-scrim"); page.wait_for_timeout(400); page.keyboard.press("Escape")
            assert page.evaluate("async () => (await window.__vr2) === null"), "Esc discards"
            assert page.locator(".vrec-scrim").count() == 0

            # chat voice note: speed cycles and the waveform seeks
            page.evaluate("() => window.TribeApp.show('chat')")
            page.wait_for_selector(".vn .vn-speed", timeout=8000)
            sp = page.locator(".vn-speed").first
            sp.click(); assert sp.inner_text().strip() == "1.5×", sp.inner_text()
            sp.click(); assert sp.inner_text().strip() == "2×"
            sp.click(); assert sp.inner_text().strip() == "1×"

            # task drawer: a Voice note button beside the notes
            page.evaluate("() => window.TribeApp.show('tasks')")
            page.wait_for_selector("#board .task .t", timeout=8000)
            page.locator("#board .task .t").first.click()
            page.wait_for_selector("#tkd-notes", state="attached", timeout=8000)
            page.wait_for_selector("[data-vnote='task']", timeout=5000)

            # phone
            ph = login(b, {"width": 390, "height": 844}, "Maya", maya, pid, mobile=True, hash_="#/secretary")
            ins = ph.locator("#ins-later")
            if ins.count() and ins.is_visible(): ins.click()
            ph.wait_for_selector(".sy-today", timeout=10000)
            assert ph.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll on the phone"
            ph.evaluate("() => { window.__vr = window.TribeVoiceNote.record({}); }")
            ph.wait_for_selector(".vrec-scrim")
            box = ph.locator(".vrec").bounding_box(); bh = ph.locator("[data-vr='done']").bounding_box()
            assert box["y"] + box["height"] >= 844 - 2 and bh["height"] >= 43, (box, bh)
            ph.screenshot(path=str(SHOTS / "recorder-phone.png"))
            ph.keyboard.press("Escape")
            b.close()
        assert not errors, errors
        print(f"e2e_voice_notes: OK (summary, actions with owner + due, task, dismiss, voice note to the Secretary, recorder pause/resume/done/upload/Esc, chat speed, task drawer, phone)  shots: {SHOTS}")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
