"""Voice + messaging test: dictation, huddle captions, meeting notes, capture to notes, direct messages, typing.

Headless Chrome can't recognize speech, so every page gets a fake SpeechRecognition the test drives with
window.__fakeSpeech.say('...'). Uses the mock Ollama for meeting notes.
Usage: python app/test/e2e_voice.py [--shots]
"""
import glob, json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))   # offset lets parallel runs coexist
PORT = 4788 + OFF
MOCK = 11588 + OFF
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
errors = []

FAKE_SPEECH = """(() => {
  const inst = [];
  class FakeSR {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.running = false; inst.push(this); }
    start() { if (this.running) throw new Error('already started'); this.running = true; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { this._end(); }
    abort() { this._end(); }
    _end() { if (!this.running) return; this.running = false; setTimeout(() => this.onend && this.onend(), 0); }
  }
  const res = (text, final) => { const r = [{ transcript: text, confidence: 0.95 }]; r.isFinal = final; return r; };
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  window.__fakeSpeech = {
    active: () => inst.some(i => i.running),
    say(text) {
      const live = inst.filter(i => i.running);
      for (const i of live) {
        i.onresult && i.onresult({ resultIndex: 0, results: [res(text.slice(0, Math.ceil(text.length / 2)), false)] });
        i.onresult && i.onresult({ resultIndex: 0, results: [res(text, true)] });
      }
      return live.length;
    },
    end() { inst.filter(i => i.running).forEach(i => i._end()); },   // the browser stopping recognition by itself
  };
})();"""



def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_for(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.15)
    raise AssertionError("timed out waiting for " + what)


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"{name}.png"))


def open_as(browser, name, token):
    page = browser.new_context(viewport={"width": 1600, "height": 1000}, permissions=["microphone"]).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and "api.github.com" not in m.text and "ERR_FAILED" not in m.text and "ERR_CONNECTION_REFUSED" not in m.text and "ERR_NAME_NOT_RESOLVED" not in m.text and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script(FAKE_SPEECH)
    page.goto(BASE)
    wait_text(page, "#sync-status", "connected")
    return page


def mcp_call(token, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, **({"params": params} if params is not None else {})}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def check_bus():
    """dm.js announces DMs (high, to the recipient) on the notification bus; @mentions in channels are left to notify.js."""
    script = """
      const bus = require('./server/bus'); const got = []; bus.on('notify', n => got.push(n));
      const members = [{ id: 'a-1', name: 'Orion' }, { id: 'b-2', name: 'Maya' }, { id: 'c-3', name: 'Jay' }];
      const dm = require('./server/dm')({ store: { readJSONL: () => [] }, getMembers: () => members, sendTo() {}, broadcast() {}, bus });
      const ch = dm.nameFor('b-2', 'a-1');
      if (ch !== 'dm-a-1-b-2' || !dm.pair(ch) || dm.canRead(ch, members[2])) throw new Error('pair/canRead');
      dm.onPost(ch, members[0], 'hi'); dm.onPost('general', members[0], 'hey @maya look');
      const [d, m] = got;
      if (got.length !== 1) throw new Error('channel mentions belong to notify.js, got ' + JSON.stringify(got));
      if (d.type !== 'dm' || d.priority !== 'high' || d.to[0] !== 'b-2') throw new Error('dm notify ' + JSON.stringify(d));
      console.log('bus ok');"""
    out = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True)
    assert "bus ok" in out.stdout, out.stdout + out.stderr


def main():
    check_bus()
    tmp = tempfile.mkdtemp(prefix="tribe-v-")
    mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(MOCK)], stdout=subprocess.DEVNULL)
    time.sleep(0.3)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", f"http://localhost:{MOCK}"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        orion_tok = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        code = api("/invites", "POST", {}, token=orion_tok)[1]["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        jay_tok = api("/join", "POST", {"code": code, "name": "Jay"})[1]["token"]
        ids = {m["name"]: m["id"] for m in api("/members", token=orion_tok)[1]["members"]}

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                  args=["--no-proxy-server", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            orion, maya, jay = open_as(b, "Orion", orion_tok), open_as(b, "Maya", maya_tok), open_as(b, "Jay", jay_tok)
            jay.evaluate("window.__chats = []; TribeClient.on('chat', m => window.__chats.push(m.channel))")

            # ---- 1. dictation into chat ----
            assert orion.evaluate("TribeSpeech.supported()")
            chat(orion).click("#chat-form [data-dictate]")
            orion.wait_for_function("__fakeSpeech.active()")
            wait_text(orion, "#voice-pill", "dictating")
            assert orion.evaluate("__fakeSpeech.say('hello from my voice')") == 1
            orion.wait_for_function("document.querySelector('#chat-input').value === 'Hello from my voice'")
            orion.evaluate("__fakeSpeech.end()")                        # browser stops it: we restart by ourselves
            orion.wait_for_function("__fakeSpeech.active()", timeout=5000)
            orion.evaluate("__fakeSpeech.say('over a campfire')")
            orion.wait_for_function("document.querySelector('#chat-input').value === 'Hello from my voice over a campfire'")
            orion.keyboard.press("Control+Shift+D")                     # toggles dictation off
            orion.wait_for_function("!__fakeSpeech.active() && document.querySelector('#voice-pill').classList.contains('hidden')")
            chat(orion).focus("#chat-input"); orion.keyboard.press("Enter")
            wait_text(maya, "#chat-list", "Hello from my voice over a campfire")

            # dictation into a doc goes through live co-editing
            slug = api("/docs", "POST", {"title": "Dictated plan", "body": "Plan:"}, token=orion_tok)[1]["doc"]["slug"]
            orion.evaluate("TribeApp.show('docs')"); orion.evaluate(f"TribeDocs.load('{slug}')")
            orion.wait_for_function(f"TribeCoedit.get('{slug}') && TribeCoedit.get('{slug}').joined && document.querySelector('.doc-toolbar [data-dictate]')")
            orion.evaluate("const t = document.querySelector('#doc-body'); t.focus(); t.setSelectionRange(t.value.length, t.value.length)")
            orion.click(".doc-toolbar [data-dictate]")
            orion.wait_for_function("__fakeSpeech.active()")
            orion.evaluate("__fakeSpeech.say('build the save points first')")
            orion.wait_for_function("document.querySelector('#doc-body').value === 'Plan: build the save points first'")
            wait_for(lambda: "build the save points first" in api(f"/docs/{slug}", token=maya_tok)[1]["doc"]["body"], what="dictated doc text on the server")
            orion.click(".doc-toolbar [data-dictate]")
            orion.wait_for_function("!__fakeSpeech.active()")
            orion.evaluate("TribeApp.show('home')")

            # ---- 5. direct messages ----
            dm = "dm-" + "-".join(sorted([ids["Orion"], ids["Maya"]]))
            orion.click(f"#room-list .person[data-follow='{ids['Maya']}']")
            chat(orion).click("#dm-menu [data-act='message']")
            wait_text(orion, "#chat-head", "Maya")
            chat(orion).fill("#chat-input", "secret plan: surprise party for Jay")
            orion.keyboard.press("Enter")
            wait_text(orion, "#dm-list", "surprise party")
            maya.wait_for_function(f"document.querySelector(\"#room-list .person[data-follow='{ids['Orion']}'] .dm-badge\")?.textContent === '1'")
            assert "surprise party" not in maya.text_content("#chat-list")     # not in #general
            st, d = api(f"/chat/{dm}", token=maya_tok); assert st == 200 and any("surprise party" in m["text"] for m in d["messages"]), d
            assert api(f"/chat/{dm}", token=jay_tok)[0] == 403
            assert api(f"/chat/{dm}", "POST", {"text": "let me in"}, token=jay_tok)[0] == 403
            assert api("/chat/dm-nobody-here", token=jay_tok)[0] == 403
            convs = api("/dms", token=maya_tok)[1]["conversations"]; assert convs and convs[0]["with"] == ids["Orion"], convs
            assert api("/dms", token=jay_tok)[1]["conversations"] == []
            assert dm not in jay.evaluate("window.__chats"), jay.evaluate("window.__chats")
            maya.evaluate(f"TribeDM.open('{ids['Orion']}')")
            wait_text(maya, "#dm-list", "surprise party")
            maya.wait_for_function(f"!document.querySelector(\"#room-list .person[data-follow='{ids['Orion']}'] .dm-badge\")")

            # ---- 6. typing indicator (DM, then #general) ----
            chat(maya).click("#chat-input"); maya.keyboard.type("on it", delay=30)
            wait_text(orion, "#typing-line", "Maya is typing")
            maya.keyboard.press("Enter")
            wait_text(orion, "#dm-list", "on it")
            orion.wait_for_function("document.querySelector('#typing-line').classList.contains('hidden')")
            shot(orion, "dm-thread")
            assert "Maya is typing" not in jay.text_content("body")
            chat(maya).click("#dm-back")
            chat(jay).click("#chat-input"); jay.keyboard.type("anyone up for", delay=30)
            wait_text(maya, "#typing-line", "Jay is typing")
            chat(jay).fill("#chat-input", "")
            chat(orion).click("#dm-back")

            # ---- 2. huddle captions ----
            orion.evaluate("TribeApp.show('chat')"); orion.click(".cb-btn[data-cb='huddle']")   # the huddle starts from the chat header
            maya.wait_for_selector("#nest-huddle.live #huddle-live:not(.hidden)")
            maya.click("#nest-huddle-row")
            for pg in (orion, maya):
                pg.wait_for_function("TribeHuddle.roster().length === 2 && TribeHuddle.inCall()")
            orion.click("#h-cc")
            maya.wait_for_selector("#cap-strip #cap-share")              # Maya decides for herself: off by default
            wait_text(maya, "#cap-strip .vpill", "captions · Orion")
            orion.wait_for_function("__fakeSpeech.active()")
            assert not maya.evaluate("__fakeSpeech.active()"), "Maya's mic must not be transcribed before she agrees"
            wait_text(orion, "#voice-pill", "captions")
            orion.evaluate("__fakeSpeech.say('lets plan the campfire save points')")
            wait_text(maya, "#cap-strip .cap-lines", "lets plan the campfire save points")
            maya.click("#cap-share")
            maya.wait_for_function("__fakeSpeech.active()")
            wait_text(orion, "#cap-strip .vpill", "Orion, Maya")
            maya.evaluate("__fakeSpeech.say('I will build the campfire save point tonight')")
            wait_text(orion, "#cap-strip .cap-lines", "I will build the campfire save point")
            orion.evaluate("__fakeSpeech.say('great and I will write the fishing spec')")
            wait_text(maya, "#cap-strip .cap-lines", "fishing spec")
            # Jay is not in the huddle: sees that captions are on, but no caption text
            wait_text(jay, "#huddle-box", "captions")
            assert "fishing spec" not in jay.text_content("body")
            files = glob.glob(os.path.join(tmp, "meetings", "*.jsonl"))
            assert len(files) == 1, files
            lines = [json.loads(l) for l in Path(files[0]).read_text().splitlines()]
            assert [l["name"] for l in lines] == ["Orion", "Maya", "Orion"], lines
            shot(maya, "huddle-captions")

            # ---- 3. huddle ends → meeting doc + tasks ----
            maya.click("#h-leave")
            orion.click("#h-leave")
            wait_text(orion, "#chat-list", "Meeting notes are ready", timeout=15000)
            docs = api("/docs", token=orion_tok)[1]["docs"]
            meeting = next(x for x in docs if x["title"].startswith("Meeting · "))
            body = api(f"/docs/{meeting['slug']}", token=orion_tok)[1]["doc"]["body"]
            for want in ["## Summary", "campfire save points", "## Decisions", "## Action items", "Maya: Build the campfire save point", "## Transcript", "**Maya**"]:
                assert want in body, (want, body)
            tasks = [t for t in api("/tasks", token=orion_tok)[1]["tasks"] if t.get("source") == "meeting"]
            by_title = {t["title"]: t for t in tasks}
            assert by_title["Build the campfire save point"]["assignee"] == ids["Maya"], tasks
            assert by_title["Write the fishing mini-game spec"]["assignee"] == ids["Orion"], tasks
            assert by_title["Pick a soundtrack"].get("assignee") is None, tasks
            assert json.loads(urllib.request.urlopen(f"http://localhost:{MOCK}/calls").read())[-1]["kind"] in ("meeting", "summary")
            orion.evaluate("TribeApp.show('docs')"); orion.evaluate(f"TribeDocs.load('{meeting['slug']}')")
            orion.click(".doc-toolbar [data-mode='read']")
            wait_text(orion, "#doc-read", "Action items")
            shot(orion, "meeting-notes")
            orion.evaluate("TribeApp.show('home')")

            # "End & summarize" writes notes without ending the huddle
            orion.evaluate("TribeApp.show('chat')"); orion.click(".cb-btn[data-cb='huddle']"); orion.wait_for_function("TribeHuddle.inCall() && TribeHuddle.roster().length === 1")
            orion.click("#h-cc"); orion.wait_for_function("__fakeSpeech.active()")
            orion.evaluate("__fakeSpeech.say('quick sync about the soundtrack')")
            orion.wait_for_function("TribeCaptions.lines().length >= 1")
            orion.click("#cap-end")
            wait_for(lambda: len([x for x in api("/docs", token=orion_tok)[1]["docs"] if x["title"].startswith("Meeting · ")]) == 2, what="second meeting doc")
            orion.wait_for_function("!TribeCaptions.state().on && !__fakeSpeech.active() && TribeHuddle.inCall()")
            orion.click("#h-leave")

            # ---- 4. capture to notes ----
            jay.click("#pf-btn"); jay.click("#pf-menu [data-act='capture']"); jay.keyboard.press("Escape")   # Capture to notes lives in the profile menu
            jay.wait_for_function("__fakeSpeech.active()")
            wait_text(jay, "#capture-box", "visible to the tribe")
            wait_text(jay, "#voice-pill", "notes")
            date = jay.evaluate("TribeCapture.today()")
            title = f"Notes · Jay · {date}"
            jay.evaluate("__fakeSpeech.say('remember to buy marshmallows')")
            find = lambda: next((x for x in api("/docs", token=jay_tok)[1]["docs"] if x["title"] == title), None)
            note = wait_for(find, what="daily notes doc")
            wait_for(lambda: "remember to buy marshmallows" in api(f"/docs/{note['slug']}", token=jay_tok)[1]["doc"]["body"], what="first note line")
            # survives a reload
            jay.reload(); wait_text(jay, "#sync-status", "connected")
            jay.wait_for_function("__fakeSpeech.active() && TribeCapture.on()")
            jay.evaluate("__fakeSpeech.say('ask Maya about the lake level')")
            wait_for(lambda: "ask Maya about the lake level" in api(f"/docs/{note['slug']}", token=jay_tok)[1]["doc"]["body"], what="note after reload")
            # doc open in the editor: lines arrive through live co-editing
            jay.evaluate("TribeApp.show('docs')"); jay.evaluate(f"TribeDocs.load('{note['slug']}')")
            jay.wait_for_function(f"TribeCoedit.get('{note['slug']}') && TribeCoedit.get('{note['slug']}').joined && document.querySelector('#doc-body')")
            jay.evaluate("__fakeSpeech.say('the fishing rod needs a bobber')")
            jay.wait_for_function("document.querySelector('#doc-body').value.includes('the fishing rod needs a bobber')")
            wait_for(lambda: "the fishing rod needs a bobber" in api(f"/docs/{note['slug']}", token=orion_tok)[1]["doc"]["body"], what="live note line")
            body = api(f"/docs/{note['slug']}", token=jay_tok)[1]["doc"]["body"]
            assert body.count("- **") == 3, body
            # personal option keeps them on this device
            jay.evaluate("TribeApp.show('home')")
            jay.check("#capture-local")
            jay.evaluate("__fakeSpeech.say('private thought about dinner')")
            jay.wait_for_function(f"(localStorage.getItem('tribecode.notes.{date}') || '').includes('private thought about dinner')")
            time.sleep(0.5)
            assert "private thought" not in api(f"/docs/{note['slug']}", token=jay_tok)[1]["doc"]["body"]
            jay.keyboard.press("Control+Shift+N")
            jay.wait_for_function("!__fakeSpeech.active() && !TribeCapture.on() && document.querySelector('#voice-pill').classList.contains('hidden')")

            # ---- 7. chat extras: voice notes, reply, forward, pin, react, edit, delete, task, image, @brain, agent ----
            jay.evaluate("TribeApp.show('home')")
            general = lambda tok=orion_tok: api("/chat/general?limit=500", token=tok)[1]["messages"]
            msg_id = lambda text: next(m["id"] for m in reversed(general()) if text in (m.get("text") or ""))
            def menu(page, mid, act):
                chat(page).hover(f".chat:not(.hidden) .msg[data-id='{mid}']")
                page.click(f".chat:not(.hidden) .msg[data-id='{mid}'] .msg-more")
                page.click(f"#msg-menu [data-act='{act}']")

            # voice note: hold the composer mic; the transcript comes from the same speech pipeline
            box = chat(orion).locator("#chat-form [data-dictate]").bounding_box()
            orion.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); orion.mouse.down()
            orion.wait_for_selector("#chat-form .rec-bar")
            orion.wait_for_function("__fakeSpeech.active()")
            wait_text(orion, "#voice-pill", "recording")
            orion.evaluate("__fakeSpeech.say('voice note about the lake level')")
            wait_text(orion, "#chat-form .rec-bar", "voice note about the lake level")
            orion.wait_for_timeout(900)
            orion.mouse.up()
            maya.wait_for_selector("#chat-list .msg .vn", timeout=10000)
            wait_text(maya, "#chat-list", "voice note about the lake level")
            orion.wait_for_function("!__fakeSpeech.active() && !document.querySelector('#chat-form .rec-bar') && !TribeSpeech.active().length")
            vn = next(m for m in reversed(general()) if m.get("media", {}).get("kind") == "voice")
            assert vn["text"] == "voice note about the lake level" and vn["media"]["dur"] >= 1 and len(vn["media"]["wave"]) == 32, vn
            with urllib.request.urlopen(f"{BASE}/api/chat/general/media/{vn['media']['file']}?token={jay_tok}") as r:
                assert r.status == 200 and r.headers["Content-Type"].startswith("audio/") and len(r.read()) > 500
            assert api("/chat/general/media/nope.webm", token=jay_tok)[0] == 404
            maya.click(f"#chat-list .msg[data-id='{vn['id']}'] .vn-play")
            maya.wait_for_function(f"document.querySelector(\"#chat-list .msg[data-id='{vn['id']}'] .vn-play\").getAttribute('aria-label') === 'Pause voice note'")
            shot(maya, "chat-voice-note")
            menu(maya, vn["id"], "notes")                                 # Add to my notes
            wait_for(lambda: any("voice note about the lake level" in (api(f"/docs/{d['slug']}", token=maya_tok)[1]["doc"]["body"])
                                 for d in api("/docs", token=maya_tok)[1]["docs"] if d["title"].startswith("Notes · Maya")), what="voice note in Maya's notes")

            # reply quotes the original
            hello = msg_id("Hello from my voice")
            menu(maya, hello, "reply")
            wait_text(maya, "#reply-bar", "Replying to Orion")
            chat(maya).fill("#chat-input", "count me in"); maya.keyboard.press("Enter")
            wait_text(orion, "#chat-list .msg .quote", "Hello from my voice")
            reply_id = msg_id("count me in")
            assert next(m for m in general() if m["id"] == reply_id)["replyTo"]["id"] == hello

            # forward the voice note to a DM; only the two members can fetch it there
            menu(orion, vn["id"], "forward")
            orion.click(f"#msg-menu [data-to='{dm}']")
            wait_for(lambda: any(m.get("fwd") and m.get("media") for m in api(f"/chat/{dm}", token=maya_tok)[1]["messages"]), what="forwarded voice note")
            assert api(f"/chat/{dm}/media/{vn['media']['file']}", token=jay_tok)[0] == 403
            maya.wait_for_function(f"document.querySelector(\"#room-list .person[data-follow='{ids['Orion']}'] .dm-badge\")")

            # pin, react, edit, delete, make task
            menu(orion, reply_id, "pin")
            wait_text(jay, "#pin-strip", "1 pinned")
            wait_text(jay, "#pin-strip", "count me in")
            menu(jay, hello, "reply"); chat(jay).click("#reply-bar button")   # cancel a reply
            jay.wait_for_selector("#reply-bar.hidden", state="attached")
            jay.hover(f"#chat-list .msg[data-id='{hello}']"); jay.click(f"#chat-list .msg[data-id='{hello}'] .msg-more")
            jay.click("#msg-menu [data-emoji='🔥']")
            orion.wait_for_function(f"document.querySelector(\"#chat-list .msg[data-id='{hello}'] .rx\")?.textContent.includes('1')")
            assert api("/chat/general/msg/" + hello, "PATCH", {"text": "hijack"}, token=jay_tok)[0] == 403
            menu(maya, reply_id, "edit")
            maya.fill(f"#chat-list .msg[data-id='{reply_id}'] .edit-in", "count me in, bringing snacks"); maya.keyboard.press("Enter")
            wait_text(orion, f"#chat-list .msg[data-id='{reply_id}']", "edited")
            wait_text(jay, "#pin-strip", "bringing snacks")
            menu(maya, reply_id, "task")
            wait_for(lambda: any(t["title"] == "count me in, bringing snacks" for t in api("/tasks", token=maya_tok)[1]["tasks"]), what="task from message")
            shot_menu = lambda: (orion.hover(f"#chat-list .msg[data-id='{reply_id}']"), orion.click(f"#chat-list .msg[data-id='{reply_id}'] .msg-more"))
            shot_menu(); orion.wait_for_selector("#msg-menu"); shot(orion, "chat-actions"); orion.keyboard.press("Escape")
            menu(orion, hello, "delete"); orion.click("#msg-menu [data-act='delete']")
            wait_text(maya, f"#chat-list .msg[data-id='{hello}']", "message deleted")
            assert next(m for m in general() if m["id"] == hello)["text"] == ""

            # paste an image
            chat(maya).click("#chat-input")
            maya.evaluate("""() => { const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGPMeP/8PwMDAwMTAwMDAA+YAzG2ByhBAAAAAElFTkSuQmCC';
              const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
              document.querySelector('#chat-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
            orion.wait_for_function("[...document.querySelectorAll('#chat-list .thumb img')].some(i => i.complete && i.naturalWidth === 2)", timeout=10000)

            # @brain answers in the channel with the mock Ollama
            chat(jay).fill("#chat-input", "@brain who is building the save point?"); jay.keyboard.press("Enter")
            wait_text(orion, "#chat-list", "Maya is building the campfire save point.", timeout=15000)
            wait_text(orion, "#chat-list .msg.brain", "Local Brain")

            # your own agent: private channel, delivered → read, MCP check_messages / reply
            r = api("/agents", "POST", {}, token=orion_tok)[1]; atok, agent = r["token"], r["agent"]["id"]
            orion.wait_for_function(f"(TribeClient.state().members || []).some(m => m.id === '{agent}')")
            orion.click("#chan-switch")
            orion.wait_for_selector(f"#dm-menu [data-dm='{agent}']")
            assert orion.evaluate("document.querySelector('#dm-menu [data-dm]').dataset.dm") == agent   # agent first
            orion.click(f"#dm-menu [data-dm='{agent}']")
            wait_text(orion, "#chat-head", "Claude · Orion")
            chat(orion).fill("#chat-input", "please run the save tests"); orion.keyboard.press("Enter")
            wait_text(orion, "#dm-list .rcpt", "delivered")
            achan = "dm-" + "-".join(sorted([ids["Orion"], agent]))
            assert api(f"/chat/{achan}", token=maya_tok)[0] == 403
            assert api(f"/chat/{achan}", "POST", {"text": "psst"}, token=maya_tok)[0] == 403
            api("/chat/general", "POST", {"text": "@claude also check the build"}, token=orion_tok)
            names = [t["name"] for t in mcp_call(atok, "tools/list")["result"]["tools"]]
            assert {"check_messages", "reply"} <= set(names), names
            out = mcp_call(atok, "tools/call", {"name": "check_messages", "arguments": {}})["result"]["content"][0]["text"]
            assert "please run the save tests" in out and "also check the build" in out, out
            wait_text(orion, "#dm-list .rcpt", "read")
            assert "No new messages" in mcp_call(atok, "tools/call", {"name": "check_messages", "arguments": {}})["result"]["content"][0]["text"]
            mcp_call(atok, "tools/call", {"name": "reply", "arguments": {"text": "All 42 save tests pass."}})
            wait_text(orion, "#dm-list", "All 42 save tests pass.")
            shot(orion, "agent-channel")
            chat(orion).click("#dm-back")

            # unread divider + jump to latest
            mark = msg_id("@brain who is building")
            at = next(m["at"] for m in general() if m["id"] == mark)
            jay.context.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('tribecode.lastSeen.v1', JSON.stringify({{ general: '{at}' }})); }}")
            jay.reload(); wait_text(jay, "#sync-status", "connected")
            jay.wait_for_selector("#chat-list .unread-div")
            assert jay.evaluate("document.querySelector('#chat-list .unread-div').nextElementSibling.dataset.at") > at
            if jay.evaluate("(l => l.scrollHeight > l.clientHeight + 300)(document.querySelector('#chat-list'))"):
                jay.evaluate("document.querySelector('#chat-list').scrollTop = 0")
                jay.wait_for_selector("#jump-latest:not(.hidden)")
                jay.click("#jump-latest")
                jay.wait_for_selector("#jump-latest.hidden", state="attached")
            b.close()
    finally:
        srv.terminate(); mock.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Voice test passed")


if __name__ == "__main__":
    main()
