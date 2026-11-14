"""Communications smoke test, end to end: host + friend on desktop, a friend on a phone, all in one project.

  1. Chat: project channel and DMs arrive live on the other pages, survive a reload, unread counts move; another
     project's chat never reaches project-only friends.
  2. Huddle: three people join; every WebRTC peer connection reaches "connected" and receives audio
     (RTCPeerConnection stats: inbound-rtp audio packetsReceived > 0); leaving cleans up on every side.
  3. Voice to text: the speech pipeline (a fake SpeechRecognition, the same object Chrome/Safari give the page)
     feeds huddle captions and Capture to notes: lines land in the meeting notes doc and the project's notes.
  4. After-huddle summary: "Post a summary after the huddle" (host/lead) posts summary + mood in the project's
     chat and commits notes/huddles/<date>-<HHMM>.md to the project's repo. Local model on (a fake Ollama) and
     off (extractive), setting off (nothing posted), and a project without a repo (chat only).
  5. Claude Code: a key made through the UI (connectClaude), MCP over HTTP exactly as Claude Code 2.1 sends it
     (server/discover probe, initialize, notifications/initialized, GET stream, tools/list, tools/call), shows
     online, reads and posts chat live, answers "@ai" questions from the desktop friend (owner approves) and the
     phone friend (always allowed). When the `claude` CLI is installed, `claude mcp add` + `claude mcp list` too.
Usage: python app/test/e2e_comms_smoke.py      (ports 4921 / 4923 + TRIBE_PORT_OFFSET)
"""
import json, os, re, shlex, shutil, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, OLLAMA = 4921 + OFF, 4923 + OFF
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
DESK = dict(viewport={"width": 1440, "height": 900})
errors, passed = [], []

# ---------- a tiny fake Ollama: /api/tags, /api/generate, /api/chat ----------
FAKE = {"mode": "on", "calls": []}
class Ollama(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if FAKE["mode"] != "on": return self._send(503, {"error": "down"})
        if self.path == "/api/tags": return self._send(200, {"models": [{"name": "qwen3:8b"}]})
        self._send(404, {})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if FAKE["mode"] != "on": return self._send(503, {"error": "down"})
        prompt = body.get("prompt") or "\n".join(m.get("content", "") for m in body.get("messages", []))
        kind = "huddle" if "Huddle transcript:" in prompt else "meeting" if "Meeting transcript:" in prompt else "other"
        FAKE["calls"].append(kind)
        if kind == "huddle": out = "MOOD: positive - upbeat planning\nSUMMARY:\n- Maya builds the campfire save point tonight\n- Orion plans the save points"
        elif kind == "meeting": out = "## Summary\nThe crew planned the campfire save points.\n\n## Decisions\n- Save points use campfires.\n\n## Action items\n- [ ] Maya: Build the campfire save point"
        else: out = "ok"
        if self.path == "/api/chat": return self._send(200, {"model": body.get("model"), "message": {"role": "assistant", "content": out}, "done": True})
        if self.path == "/api/generate": return self._send(200, {"model": body.get("model"), "response": out, "done": True})
        self._send(404, {})

FAKE_SPEECH = """(() => {
  const inst = [];
  class FakeSR {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.running = false; inst.push(this); }
    start() { if (this.running) throw new Error('already started'); this.running = true; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { this._end(); } abort() { this._end(); }
    _end() { if (!this.running) return; this.running = false; setTimeout(() => this.onend && this.onend(), 0); }
  }
  const res = (text, final) => { const r = [{ transcript: text, confidence: 0.95 }]; r.isFinal = final; return r; };
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  window.__fakeSpeech = {
    active: () => inst.some(i => i.running),
    say(text) { const live = inst.filter(i => i.running); for (const i of live) { i.onresult && i.onresult({ resultIndex: 0, results: [res(text.slice(0, 8), false)] }); i.onresult && i.onresult({ resultIndex: 0, results: [res(text, true)] }); } return live.length; },
  };
})();"""

# Keep every RTCPeerConnection and microphone stream the page makes, to read real WebRTC stats and check cleanup.
RTC_SPY = """(() => {
  const O = window.RTCPeerConnection, pcs = [], streams = [];
  window.RTCPeerConnection = class extends O { constructor(...a) { super(...a); pcs.push(this); } };
  const gum = navigator.mediaDevices && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  if (gum) navigator.mediaDevices.getUserMedia = async c => { const s = await gum(c); streams.push(s); return s; };
  window.__rtc = async () => {
    const out = [];
    for (const pc of pcs) {
      if (pc.connectionState === 'closed') { out.push({ state: 'closed' }); continue; }
      let rx = 0, tx = 0; (await pc.getStats()).forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'audio') rx += r.packetsReceived || 0; if (r.type === 'outbound-rtp' && r.kind === 'audio') tx += r.packetsSent || 0; });
      out.push({ state: pc.connectionState, rx, tx, tracks: pc.getReceivers().filter(r => r.track && r.track.kind === 'audio' && r.track.readyState === 'live').length });
    }
    return out;
  };
  window.__micLive = () => streams.flatMap(s => s.getTracks()).filter(t => t.readyState === 'live').length;
})();"""


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def mcp(token, payload, extra=None, method="POST"):
    """One HTTP request to /mcp with the headers Claude Code sends."""
    h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token, **(extra or {})}
    req = urllib.request.Request(BASE + "/mcp", method=method, data=json.dumps(payload).encode() if payload is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: raw = e.read(); return e.code, (json.loads(raw) if raw else None)


def tool(token, name, args=None):
    st, r = mcp(token, {"jsonrpc": "2.0", "id": int(time.time() * 1000) % 100000, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}, {"MCP-Protocol-Version": "2025-11-25"})
    assert st == 200 and "result" in r and not r["result"].get("isError"), (name, st, r)
    return r["result"]["content"][0]["text"]


def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_for(fn, timeout=15, what="condition"):
    end, last = time.time() + timeout, None
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception as e: last = e
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for {what}" + (f" (last error: {last})" if last else ""))


def chat(page):
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page


def step(name):
    passed.append(name); print("  ok ·", name, flush=True)


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True).stdout.strip()


def open_as(browser, name, token, phone=False):
    ctx = browser.new_context(**(PHONE if phone else DESK), permissions=["microphone"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and not any(x in m.text for x in ("api.github.com", "ERR_FAILED", "ERR_CONNECTION_REFUSED", "ERR_NAME_NOT_RESOLVED", "404", "503")) and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script(FAKE_SPEECH); page.add_init_script(RTC_SPY)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
    if phone and page.query_selector("#ins-later"): page.click("#ins-later")
    return page


def summaries(token, project=None):
    return [m for m in api("/chat/general?limit=500", token=token, project=project)[1]["messages"] if "Huddle summary" in (m.get("text") or "")]


def cap_end(host, *said):
    """One person, a short captioned huddle, End & summarize."""
    host.evaluate("TribeHuddle.inCall() || TribeHuddle.join()")
    host.wait_for_function("TribeHuddle.inCall() && TribeHuddle.roster().length === 1", timeout=15000)
    host.wait_for_selector("#h-cc"); host.click("#h-cc")
    host.wait_for_function("__fakeSpeech.active()", timeout=10000)
    for s in said: host.evaluate(f"__fakeSpeech.say({json.dumps(s)})")
    host.wait_for_function(f"TribeCaptions.lines().length >= {len(said)}", timeout=10000)
    host.click("#cap-end")
    host.wait_for_function("!TribeCaptions.state().on", timeout=10000)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-comms-"))
    repo = tmp / "pixel-quest"; repo.mkdir(); (repo / "README.md").write_text("# Pixel Quest\n")
    oll = ThreadingHTTPServer(("127.0.0.1", OLLAMA), Ollama); threading.Thread(target=oll.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--name", "Comms Crew", "--ollama", f"http://localhost:{OLLAMA}"],
                           stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        wait_for(lambda: api("/health")[0] == 200, 20, "server")
        host_tok = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        st, r = api("/projects", "POST", {"path": str(repo), "name": "Pixel Quest", "init": True}, token=host_tok); assert st == 200, r
        pq = r["project"]["id"]; default = next(p["id"] for p in api("/projects", token=host_tok)[1]["projects"] if p["default"])
        assert (repo / ".git").exists(), "project repo initialised"
        code = api("/invites", "POST", {"project": pq, "maxUses": 5}, token=host_tok)[1]["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        jay_tok = api("/join", "POST", {"code": code, "name": "Jay"})[1]["token"]
        ids = {m["name"]: m["id"] for m in api("/members", token=host_tok)[1]["members"]}

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            host = open_as(b, "Orion", host_tok)
            host.evaluate(f"TribeProjects.switchTo('{pq}')"); host.wait_for_function(f"TribeClient.project() === '{pq}'")
            maya = open_as(b, "Maya", maya_tok)
            jay = open_as(b, "Jay", jay_tok, phone=True)
            for pg in (maya, jay): assert pg.evaluate("TribeClient.project()") == pq

            # ================= 1. chat =================
            chat(maya).fill("#chat-input", "hello from maya on desktop"); maya.keyboard.press("Enter")
            wait_text(chat(host), "#chat-list", "hello from maya on desktop"); wait_text(chat(jay), "#chat-list", "hello from maya on desktop")
            chat(jay).fill("#chat-input", "jay here, on my phone"); jay.keyboard.press("Enter")
            wait_text(host, "#chat-list", "jay here, on my phone"); wait_text(maya, "#chat-list", "jay here, on my phone")
            stored = (tmp / "tribe" / "chat" / f"p-{pq}.jsonl")
            assert stored.exists() and "jay here" in stored.read_text(), "project chat is stored in the project's channel"
            assert "jay here" not in ((tmp / "tribe" / "chat" / "general.jsonl").read_text() if (tmp / "tribe" / "chat" / "general.jsonl").exists() else "")
            api("/chat/general", "POST", {"text": "default-project secret"}, token=host_tok, project=default)
            time.sleep(0.6)
            assert "default-project secret" not in maya.text_content("#chat-list") and "default-project secret" not in jay.text_content("#chat-list")
            assert all("default-project secret" not in (m.get("text") or "") for m in api("/chat/general", token=maya_tok)[1]["messages"])
            maya.reload(); maya.wait_for_function("TribeClient.connected()", timeout=20000)
            wait_text(chat(maya), "#chat-list", "jay here, on my phone"); wait_text(maya, "#chat-list", "hello from maya on desktop")
            step("project chat: live on host, desktop friend and phone; persisted across reload; other projects stay out")

            dm = "dm-" + "-".join(sorted([ids["Maya"], ids["Jay"]]))
            jay.evaluate(f"TribeDM.open('{ids['Maya']}')"); jay.wait_for_function(f"TribeDM.current() === '{dm}'")
            chat(jay).fill("#chat-input", "psst maya, private question"); jay.keyboard.press("Enter")
            wait_text(jay, "#dm-list", "private question")
            maya.wait_for_function(f"(TribeDM.unread()['{dm}'] || 0) === 1", timeout=10000)
            wait_text(maya, "#chan-switch .dm-badge", "1")
            assert "private question" not in maya.text_content("#chat-list") and "private question" not in host.text_content("body")
            assert api(f"/chat/{dm}", token=host_tok)[0] == 403
            maya.evaluate(f"TribeDM.open('{ids['Jay']}')"); wait_text(maya, "#dm-list", "private question")
            maya.wait_for_function(f"!TribeDM.unread()['{dm}']")
            chat(maya).fill("#chat-input", "sure, ask away"); maya.keyboard.press("Enter")
            wait_text(jay, "#dm-list", "sure, ask away")                               # Jay has the thread open: no unread
            assert not jay.evaluate(f"TribeDM.unread()['{dm}']")
            chat(host).fill("#chat-input", "team: huddle in a minute"); host.keyboard.press("Enter")
            wait_text(maya, "#dm-back .dm-badge", "1")                                  # #general counts up while Maya is in the DM
            jay.evaluate("TribeDM.back()")
            chat(maya).fill("#chat-input", "one more thing"); maya.keyboard.press("Enter")
            jay.wait_for_function(f"(TribeDM.unread()['{dm}'] || 0) === 1", timeout=10000)
            jay.reload(); jay.wait_for_function("TribeClient.connected()", timeout=20000)
            jay.wait_for_function(f"(TribeDM.unread()['{dm}'] || 0) === 1", timeout=10000)   # unread survives a reload (server knows what came in)
            jay.evaluate(f"TribeDM.open('{ids['Maya']}')"); wait_text(jay, "#dm-list", "one more thing"); wait_text(jay, "#dm-list", "private question")
            jay.wait_for_function(f"!TribeDM.unread()['{dm}']")
            jay.evaluate("TribeDM.back()"); maya.evaluate("TribeDM.back()")
            assert jay.evaluate("document.documentElement.scrollWidth") <= 391, "no sideways scroll on the phone"
            step("DMs: live both ways (desktop and phone), private, unread badges count up and clear, persisted across reload")

            # ================= 2. huddle =================
            chat(host).click(".cb-btn[data-cb='huddle']")
            maya.wait_for_selector("#nest-huddle.live #huddle-live:not(.hidden)", timeout=10000)
            maya.click("#nest-huddle-row")
            jay.evaluate("TribeHuddle.join()")
            for pg in (host, maya, jay): pg.wait_for_function("TribeHuddle.inCall() && TribeHuddle.roster().length === 3", timeout=15000)
            def audio_ok(pg):
                s = pg.evaluate("__rtc()"); live = [x for x in s if x["state"] != "closed"]
                return len(live) == 2 and all(x["state"] == "connected" and x["rx"] > 0 and x["tx"] > 0 and x["tracks"] == 1 for x in live) and s
            for name, pg in (("host", host), ("maya", maya), ("jay", jay)):
                try: wait_for(lambda: audio_ok(pg), 30, f"{name}: 2 connected peers receiving audio")
                except AssertionError: print(name, pg.evaluate("__rtc()"), pg.evaluate("TribeHuddle.debug()")); raise
            assert all(len(pg.evaluate("TribeHuddle.debug()")) == 2 for pg in (host, maya, jay))
            step("huddle: 3-way WebRTC mesh connected, audio packets received on every side (desktop + phone)")

            # ================= 3. voice to text: captions -> meeting notes; capture -> project notes =================
            host.click("#h-cc"); host.wait_for_selector("#cap-strip #h-summary")
            host.check("#h-summary")
            wait_for(lambda: next(x for x in api("/projects", token=host_tok)[1]["projects"] if x["id"] == pq)["huddleSummary"], 10, "summary setting saved")
            maya.wait_for_selector("#cap-strip #cap-share")
            assert not maya.query_selector("#h-summary"), "only the host or the project lead switches the summary"
            st, _ = api(f"/projects/{pq}", "PATCH", {"huddleSummary": False}, token=maya_tok); assert st == 403
            host.wait_for_function("__fakeSpeech.active()")
            host.evaluate("__fakeSpeech.say('great, lets plan the campfire save points')")
            wait_text(maya, "#cap-strip .cap-lines", "plan the campfire save points")
            maya.click("#cap-share"); maya.wait_for_function("__fakeSpeech.active()")
            maya.evaluate("__fakeSpeech.say('I will build the campfire save point tonight, this is fun')")
            wait_text(host, "#cap-strip .cap-lines", "campfire save point tonight")
            jay.wait_for_function("TribeCaptions.lines().some(l => l.text.includes('campfire save point tonight'))")   # the phone hears captions too
            assert not jay.evaluate("__fakeSpeech.active()"), "Jay's mic is not transcribed until he opts in"
            jay.evaluate("TribeCapture.toggle(true)"); jay.wait_for_function("__fakeSpeech.active()")
            jay.evaluate("__fakeSpeech.say('phone note remember the marshmallows')")
            date = jay.evaluate("TribeCapture.today()")
            note = wait_for(lambda: next((d for d in api("/docs", token=jay_tok)[1]["docs"] if d["title"] == f"Notes · Jay · {date}"), None), 15, "Jay's notes doc")
            wait_for(lambda: "remember the marshmallows" in api(f"/docs/{note['slug']}", token=host_tok, project=pq)[1]["doc"]["body"], 10, "note line in the project's notes")
            assert not any(d["title"].startswith("Notes · Jay") for d in api("/docs", token=host_tok, project=default)[1]["docs"])
            jay.evaluate("TribeCapture.toggle(false)")
            step("voice to text: captions shared live (opt-in per person), phone speech captured into the project's notes doc")

            # everyone leaves; the host by closing the tab (the socket closes outside any project)
            maya.click("#h-leave")
            host.wait_for_function("TribeHuddle.debug().length === 1 && TribeHuddle.roster().length === 2", timeout=10000)
            jay.evaluate("TribeHuddle.leave()")
            for pg in (maya, jay):
                pg.wait_for_function("!TribeHuddle.inCall() && TribeHuddle.debug().length === 0 && !document.querySelector('#huddle-audio audio')", timeout=10000)
                wait_for(lambda: all(x["state"] == "closed" for x in pg.evaluate("__rtc()")) and pg.evaluate("__micLive()") == 0, 10, "peer connections closed and mic released")
            host.context.close()
            maya.wait_for_function("TribeHuddle.roster().length === 0", timeout=10000)
            step("huddle: leaving closes every peer connection, removes remote audio and releases the mic; closing the tab leaves too")

            # ================= 4. meeting notes + after-huddle summary (local model on) =================
            wait_text(maya, "#chat-list", "Meeting notes are ready", timeout=20000)
            meeting = wait_for(lambda: next((d for d in api("/docs", token=maya_tok)[1]["docs"] if d["title"].startswith("Meeting · ")), None), 10, "meeting doc in the project")
            body = api(f"/docs/{meeting['slug']}", token=maya_tok)[1]["doc"]["body"]
            for want in ("plan the campfire save points", "campfire save point tonight", "**Maya**", "**Orion**", "## Summary", "## Action items"):
                assert want in body, (want, body)
            assert not any(d["title"].startswith("Meeting · ") for d in api("/docs", token=host_tok, project=default)[1]["docs"]), "meeting notes stay in the huddle's project"
            wait_text(maya, "#chat-list", "Huddle summary", timeout=20000)
            wait_text(maya, "#chat-list", "mood: positive"); wait_text(maya, "#chat-list", "Maya builds the campfire save point tonight")
            assert "huddle" in FAKE["calls"], FAKE["calls"]
            files = sorted((repo / "notes" / "huddles").glob("*.md")); assert len(files) == 1, files
            md = files[0].read_text()
            assert re.match(r"\d{4}-\d{2}-\d{2}-\d{4}\.md$", files[0].name) and "**Mood** positive" in md and "local model (qwen3:8b)" in md and "Maya builds" in md, md
            assert "this is fun" not in md, "the repo file carries the summary, not the transcript"
            assert git(repo, "log", "-1", "--format=%s") == f"TribeCode: huddle notes {files[0].name[:10]}"
            assert git(repo, "show", "--name-only", "--format=", "HEAD") == f"notes/huddles/{files[0].name}"
            assert git(repo, "status", "--porcelain", "notes") == ""
            s = summaries(maya_tok)[-1]; assert f"notes/huddles/{files[0].name}" in s["text"], s
            step("after-huddle summary (local model): mood + summary in the project's chat, notes/huddles/*.md committed to the repo")

            # ---- local model off: extractive summary, mood from the words ----
            FAKE["mode"] = "down"
            commits = int(git(repo, "rev-list", "--count", "HEAD"))
            host = open_as(b, "Orion", host_tok)
            host.wait_for_function(f"TribeClient.project() === '{pq}'", timeout=10000)
            cap_end(host, "the build is broken and I am stuck on the save bug", "we should fix the crash tomorrow, it is a real problem")
            wait_for(lambda: len(summaries(maya_tok)) == 2, 20, "second summary")
            s = summaries(maya_tok)[-1]["text"]
            assert "mood: **negative**" in s and "fix the crash tomorrow" in s, s
            files = sorted((repo / "notes" / "huddles").glob("*.md"), key=lambda f: f.stat().st_mtime); assert len(files) == 2, files
            md2 = files[-1].read_text()
            assert "extractive" in md2 and "**Mood** negative" in md2 and int(git(repo, "rev-list", "--count", "HEAD")) == commits + 1, md2
            wait_text(maya, "#chat-list", "mood: negative")
            step("after-huddle summary (model off): extractive summary, mood from the words, committed")

            # ---- setting off: notes yes, summary no ----
            st, _ = api(f"/projects/{pq}", "PATCH", {"huddleSummary": False}, token=host_tok); assert st == 200
            n_docs = len([d for d in api("/docs", token=host_tok, project=pq)[1]["docs"] if d["title"].startswith("Meeting · ")])
            cap_end(host, "quick sync about the soundtrack")
            wait_for(lambda: len([d for d in api("/docs", token=host_tok, project=pq)[1]["docs"] if d["title"].startswith("Meeting · ")]) == n_docs + 1, 15, "third meeting doc")
            time.sleep(1.5)
            assert len(summaries(maya_tok)) == 2 and len(list((repo / "notes" / "huddles").glob("*.md"))) == 2
            host.evaluate("TribeHuddle.leave()")
            step("summary setting off: meeting notes still written, nothing posted or committed")

            # ---- a project without a repo: chat only ----
            api(f"/projects/{default}", "PATCH", {"huddleSummary": True}, token=host_tok)
            host.evaluate(f"TribeProjects.switchTo('{default}')"); host.wait_for_function(f"TribeClient.project() === '{default}'")
            cap_end(host, "default project chat about the logo, looks great")
            wait_for(lambda: summaries(host_tok, default), 20, "summary in the default project")
            s = summaries(host_tok, default)[-1]["text"]; assert "Saved to the repo" not in s and "Could not commit" not in s and "mood:" in s, s
            assert len(summaries(maya_tok)) == 2, "nothing leaked into Pixel Quest"
            host.evaluate("TribeHuddle.leave()")
            host.evaluate(f"TribeProjects.switchTo('{pq}')"); host.wait_for_function(f"TribeClient.project() === '{pq}'")
            step("summary in a project without a repo: chat only, no commit attempt")

            # ================= 5. Claude Code connects and chats =================
            host.evaluate("TribeApp.connectClaude({ fresh: true })")
            host.wait_for_selector("#ic-body [data-ic-copy='code']", timeout=10000); host.click("#ic-body [data-ic-copy='code']"); host.wait_for_function("!document.querySelector('#cc-cmd').textContent.includes('••••')", timeout=10000)   # feat/invite-one: the key is made on Copy
            cmd = host.text_content("#cc-cmd").strip()
            m = re.fullmatch(r'claude mcp add --transport http tribecode (\S+) --header "Authorization: Bearer ([A-Za-z0-9_-]{20,})"', cmd)
            assert m, cmd
            url, atok = m.group(1), m.group(2)
            assert url == f"http://localhost:{PORT}/mcp", url
            agent = next(x for x in api("/members", token=host_tok)[1]["members"] if x["role"] == "agent")
            # Exactly what Claude Code 2.1 sends (recorded from `claude mcp list`): a 2026-07-28 discovery probe first,
            # then the initialize handshake on 2025-11-25.
            st, r = mcp(atok, {"jsonrpc": "2.0", "id": "server-discover-probe-1", "method": "server/discover", "params": {}}, {"MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "server/discover"})
            assert st == 200 and r["error"]["code"] == -32601, r                      # "not that revision": Claude Code falls back
            st, r = mcp(atok, {"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {"roots": {"listChanged": True}}, "clientInfo": {"name": "claude-code", "version": "2.1.319"}}})
            assert st == 200 and r["result"]["protocolVersion"] == "2025-11-25" and r["result"]["capabilities"]["tools"] is not None and "Orion's Claude" in r["result"]["instructions"], r
            st, r = mcp(atok, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2026-07-28", "capabilities": {}, "clientInfo": {"name": "x", "version": "1"}}})
            assert r["result"]["protocolVersion"] == "2025-11-25", r                 # never claims a revision it doesn't speak
            assert mcp(atok, {"jsonrpc": "2.0", "method": "notifications/initialized"}, {"MCP-Protocol-Version": "2025-11-25"})[0] == 202
            assert mcp(atok, None, {"Accept": "text/event-stream"}, method="GET")[0] == 405       # no server-initiated stream: allowed by the spec
            assert mcp("not-a-key", {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})[0] == 401
            # connected (initialize) is enough to show online, before any tool call
            host.wait_for_function(f"(TribeClient.state().members || []).some(m => m.id === '{agent['id']}' && m.online)", timeout=10000)
            wait_text(host, "#ic-status", "joined", timeout=15000)
            st, r = mcp(atok, {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}, {"MCP-Protocol-Version": "2025-11-25"})
            names = {t["name"] for t in r["result"]["tools"]}
            assert {"tribe_overview", "read_chat", "post_chat", "check_messages", "reply", "list_tasks"} <= names, names
            assert all(t["inputSchema"]["type"] == "object" for t in r["result"]["tools"])
            host.keyboard.press("Escape")
            step("Claude Code: UI command has the right URL/header; MCP handshake as Claude Code 2.1 sends it; online on connect")

            if shutil.which("claude"):
                home = tmp / "cc-home"; work = tmp / "cc-work"; home.mkdir(); work.mkdir()
                cenv = {**os.environ, "HOME": str(home), "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
                add = subprocess.run(shlex.split(cmd), cwd=work, env=cenv, capture_output=True, text=True, timeout=60)
                assert add.returncode == 0, add.stderr
                lst = subprocess.run(["claude", "mcp", "list"], cwd=work, env=cenv, capture_output=True, text=True, timeout=120)
                assert re.search(r"tribecode: http://localhost:\d+/mcp \(HTTP\) - .*Connected", lst.stdout), lst.stdout + lst.stderr
                step("real Claude Code CLI: `claude mcp add` with the printed command, `claude mcp list` says Connected")
            else:
                print("  (claude CLI not installed: skipped the real `claude mcp list` check)")

            overview = tool(atok, "tribe_overview"); assert "Pixel Quest" in tool(atok, "list_projects") and "Orion's Claude" in overview
            recent = tool(atok, "read_chat", {"limit": 50})
            assert "hello from maya on desktop" in recent and "jay here, on my phone" in recent and "default-project secret" not in recent, recent
            assert api("/chat/general", "POST", {"text": "@agents say hello when you are connected"}, token=host_tok, project=pq)[0] == 200   # v0.37: agents speak in a channel when asked there
            tool(atok, "post_chat", {"text": "Claude Code here: I can see the board and the chat."})
            for pg in (host, maya, jay): wait_text(chat(pg), "#chat-list", "Claude Code here: I can see the board")
            assert "Claude Code here" in (tmp / "tribe" / "chat" / f"p-{pq}.jsonl").read_text()
            step("Claude Code: reads the project chat and posts into it live (host, desktop friend, phone)")

            # @ai from the desktop friend: the host's Claude, with the host's one-tap approval
            chat(maya).fill("#chat-input", "@ai what should I build first?"); maya.keyboard.press("Enter")
            wait_text(maya, "#chat-list", "Asked Orion to let their Claude answer", timeout=10000)
            ap = wait_for(lambda: next((a for a in api("/approvals", token=host_tok, project=pq)[1]["approvals"] if a["kind"] == "ask-claude" and a["status"] == "pending"), None), 10, "approval for the host")
            assert api(f"/approvals/{ap['id']}/approve", "POST", {}, token=host_tok)[0] == 200
            wait_text(maya, "#chat-list", "said yes", timeout=10000)
            inbox = tool(atok, "check_messages")
            assert "what should I build first?" in inbox and f'project "{pq}"' in inbox and "@Maya" in inbox, inbox
            tool(atok, "post_chat", {"text": "@Maya start with the campfire save point: it unlocks the rest.", "project": pq})
            wait_text(maya, "#chat-list", "start with the campfire save point: it unlocks the rest")
            # @ai from the phone friend, owner set to "always": straight to the agent
            assert api("/ask/policy", "PUT", {"policy": "always"}, token=host_tok)[0] == 200
            chat(jay).fill("#chat-input", "@ai how do I add a jump sound?"); jay.keyboard.press("Enter")
            wait_text(jay, "#chat-list", "is on Jay's question", timeout=10000)
            inbox = tool(atok, "check_messages"); assert "how do I add a jump sound?" in inbox and "from their phone" in inbox, inbox
            tool(atok, "post_chat", {"text": "@Jay drop a .wav in assets/sfx and call playSound('jump').", "project": pq})
            wait_text(jay, "#chat-list", "drop a .wav in assets/sfx")
            jay.reload(); jay.wait_for_function("TribeClient.connected()", timeout=20000)
            wait_text(chat(jay), "#chat-list", "drop a .wav in assets/sfx")
            assert jay.evaluate("document.documentElement.scrollWidth") <= 391
            step("@ai: desktop friend's question approved by the owner and answered by Claude Code; phone friend's answered at once")
            b.close()
    finally:
        srv.terminate(); oll.shutdown()
    if errors:
        print("\n".join(errors)); print("server log:", tmp / "server.log"); sys.exit(1)
    print(f"Comms smoke test passed ({len(passed)} checks)")


if __name__ == "__main__":
    main()
