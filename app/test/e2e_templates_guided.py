"""Company templates with a guided flow (feat/work-company: app/ui/doctpl.js, doctpl-data.js, server/rituals.js).
  1. No tribe, no AI: Work's empty state -> Daily standup -> Guided, one question at a time (answer, Skip, answer,
     Finish) -> the doc is saved on this device (TribeLocalFiles), rituals say they need a tribe.
  2. In a tribe: Work › Templates -> Product brief, guided; switch to Advanced mid-way: every question at once, the
     answers carried over, the preview follows; back to Guided lands on the next unanswered question; ✦ Draft the rest
     with no AI fills from the board ("Basic · no AI"); Save to Files.
  3. AI boost with a fake model: Launch plan -> ✦ Draft the rest says "✦ via tiny-model" and fills empty sections.
  4. Rituals: "Run standup every weekday at 9" is one calendar event (5 times a week); "Ask everyone now" shows the
     answer card; answers go to chat and into the Standup doc; "/standup did … | next … | stuck …" in chat too.
Usage: python app/test/e2e_templates_guided.py   (writes docs/screenshots/templates-guided.png)"""
import json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6250 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"; FAKE = PORT + 700
SHOTS = ROOT / "docs" / "screenshots"
asked = []


class FakeLLM(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}"); text = json.dumps(body.get("messages", [])); asked.append(text)
        out = "## Channels\n- The Pixel Quest Discord\n- itch.io devlog\n\n## Goal\n- [How many players would make it a good week?]\n\n## After launch\n- Read every comment and fix the top 3 bugs" if "Draft the empty sections" in text else "OK"
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for part in [out[:20], out[20:]]:
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": part}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.03)
        self.wfile.write(b"data: [DONE]\n\n")


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]


def guided_answer(pg, text):
    pg.fill("#dt-q .dt-in", text); pg.click("#dt-next")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-tpl-", dir="/tmp")); errors = []
    fake = ThreadingHTTPServer(("127.0.0.1", FAKE), FakeLLM); threading.Thread(target=fake.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(name, token=None):
                c = b.new_context(viewport={"width": 1440, "height": 900})
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}{srv_}}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{name} console: {m.text[:200]}"))
                return pg

            # ---------- 1. no tribe: guided standup saved on this device ----------
            fr = page("Orion"); fr.goto(BASE + "/?skipIntro=1&freshopen=1"); fr.wait_for_function("window.TribeTalent && window.TribeTemplates && window.TribeLocalFiles", timeout=15000)
            fr.evaluate("TribeTalent.open('templates')"); fr.click("#dt-lib .dt-card[data-tpl='standup']")
            fr.wait_for_selector("#dt-q[data-key='done']"); assert fr.text_content("#dt-eyebrow").startswith("Guided · 1 of 3"), fr.inner_text("#dt-eyebrow")
            guided_answer(fr, "Fixed the double jump bug")
            fr.wait_for_selector("#dt-q[data-key='next']"); fr.click("#dt-skip")
            fr.wait_for_selector("#dt-q[data-key='blocked']"); fr.click("#dt-back"); fr.wait_for_selector("#dt-q[data-key='next']"); fr.click("#dt-skip")
            fr.wait_for_selector("#dt-q[data-key='blocked']"); guided_answer(fr, "Nothing")
            fr.wait_for_selector("#dt-done #dt-preview")
            prev = fr.inner_text("#dt-preview"); assert "Fixed the double jump bug" in prev and "What are you doing next?" in prev, prev
            assert "once you have a tribe" in fr.inner_text("#dt-ritual")
            fr.click("#dt-save"); fr.wait_for_selector("#dt-saved .dt-ok")
            docs = fr.evaluate("TribeLocalFiles.list()")
            d = next(x for x in docs if x["title"].startswith("Daily standup")); assert "Fixed the double jump bug" in d["body"] and "## Stuck" in d["body"], d
            fr.context.close()

            # ---------- the tribe ----------
            boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok = boot["token"]
            inv = ok(api("/invites", "POST", {"maxUses": 3}, token=tok))["invite"]; jay = ok(api("/join", "POST", {"code": inv["code"], "name": "Jay"})); jtok = jay["token"]
            for t in ["Ship the main menu", "Add the coin sound"]: ok(api("/tasks", "POST", {"title": t}, token=tok))

            # ---------- 2. guided -> advanced mid-way -> back, basic boost, save ----------
            pg = page("Orion", tok); pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeTemplates", timeout=15000)
            pg.evaluate("TribeTalent.open('templates')"); pg.wait_for_selector("#tl-tpl #dt-lib .dt-card[data-tpl='prd']", timeout=10000)
            assert pg.locator("#dt-lib .dt-card").count() >= 16
            pg.click(".dt-card[data-tpl='prd']"); pg.wait_for_selector("#dt-q[data-key='problem']")
            guided_answer(pg, "Players lose progress when the browser closes")
            pg.wait_for_selector("#dt-q[data-key='who']"); pg.fill("#dt-q .dt-in", "Kids playing on school laptops")
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "templates-guided.png"))
            pg.click("#dt-adv"); pg.wait_for_selector(".dt-fill[data-mode='advanced'] #dt-form")
            assert pg.locator("#dt-form .dt-in").count() == 9, pg.locator("#dt-form .dt-in").count()
            assert pg.input_value("[data-q='problem']") == "Players lose progress when the browser closes" and pg.input_value("[data-q='who']") == "Kids playing on school laptops"
            pg.fill("[data-q='out']", "Cloud sync"); pg.wait_for_function("document.querySelector('#dt-preview').innerText.includes('Cloud sync')")
            pg.click("#dt-adv"); pg.wait_for_selector("#dt-q[data-key='solution']")
            pg.click("#dt-adv"); pg.wait_for_selector("#dt-form")
            pg.click("#dt-boost"); pg.wait_for_function("(document.querySelector('#dt-via') || {}).textContent === 'Basic · no AI'", timeout=10000)
            assert "Ship the main menu" in pg.input_value("[data-q='scope']"), "open tasks fill the scope"
            pg.click("#dt-save"); pg.wait_for_selector("#dt-saved .dt-ok", timeout=10000)
            dl = ok(api("/docs", token=tok))["docs"]; prd = next(x for x in dl if x["title"].startswith("Product brief (PRD)"))
            body = ok(api("/docs/" + prd["slug"], token=tok))["doc"]["body"]
            assert "Kids playing on school laptops" in body and "Cloud sync" in body and "Ship the main menu" in body, body

            # ---------- 3. AI boost with a fake model ----------
            ok(api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{FAKE}/v1", "model": "tiny-model", "key": "sk-test-0123456789"}, token=tok), "llm")
            pg.evaluate("window.dispatchEvent(new Event('tribe-brain'))")
            pg.click("#dt-libback"); pg.click(".dt-card[data-tpl='launch']"); pg.wait_for_selector("#dt-q[data-key='what']")
            guided_answer(pg, "Pixel Quest 1.0"); pg.wait_for_selector("#dt-q[data-key='when']"); guided_answer(pg, "Friday")
            pg.wait_for_selector("#dt-q[data-key='where']"); pg.click("#dt-skip"); pg.wait_for_selector("#dt-q[data-key='goal']"); pg.click("#dt-skip")
            pg.wait_for_selector("#dt-done"); pg.click("#dt-boost")
            pg.wait_for_function("(document.querySelector('#dt-via') || {}).textContent.startsWith('✦ via tiny-model')", timeout=20000)
            prev = pg.inner_text("#dt-preview"); assert "The Pixel Quest Discord" in prev and "Read every comment" in prev and "Pixel Quest 1.0" in prev, prev
            assert any("Draft the empty sections" in a and "Ship the main menu" in a for a in asked), "the project context went to the model"

            # ---------- 4. rituals ----------
            pg.click("#dt-libback"); pg.click(".dt-card[data-tpl='standup']"); pg.wait_for_selector("#dt-q"); pg.click("#dt-adv"); pg.wait_for_selector("#dt-rit-go")
            pg.click("#dt-rit-go"); pg.wait_for_function("document.querySelector('#dt-rit-go').disabled", timeout=10000)
            evs = ok(api("/rituals", token=tok))["events"]; assert len(evs) == 1 and evs[0]["ritual"] == "standup" and evs[0]["repeat"] == "weekdays", evs
            now = datetime.now(timezone.utc); occ = ok(api(f"/calendar?from={now.isoformat()}&to={(now + timedelta(days=7)).isoformat()}".replace("+", "%2B"), token=tok))["occurrences"]
            assert len([o for o in occ if o["id"] == evs[0]["id"]]) == 5, occ
            jp = page("Jay", jtok); jp.goto(BASE + "/?skipIntro=1"); jp.wait_for_function("TribeClient.connected() && window.TribeTemplates", timeout=15000)
            pg.click("#dt-rit-now"); pg.wait_for_selector("#rt-card", timeout=10000); jp.wait_for_selector("#rt-card", timeout=10000)
            pg.fill("#rt-card [data-rk='done']", "Wrote the launch plan"); pg.fill("#rt-card [data-rk='next']", "The trailer"); pg.click("#rt-send")
            pg.wait_for_selector("#rt-card", state="detached")
            ok(api("/chat/general", "POST", {"text": "/standup did the coin sound | next the shop | stuck nothing"}, token=jtok), "chat standup")
            time.sleep(0.5)
            sd = next(x for x in ok(api("/docs", token=tok))["docs"] if x["title"].startswith("Standup ·"))
            body = ok(api("/docs/" + sd["slug"], token=tok))["doc"]["body"]
            assert "## Orion" in body and "Wrote the launch plan" in body and "## Jay" in body and "the coin sound" in body and "Nothing is stuck" in body, body
            chat = json.dumps(ok(api("/chat/general", token=tok)))
            assert "Wrote the launch plan" in chat and "Standup" in chat, chat[-600:]
            jp.wait_for_selector("#rt-card", state="detached", timeout=10000)   # Jay answered in chat: his card goes away
            b.close()
        assert not errors, errors
        print("e2e_templates_guided: OK")
    finally:
        srv.terminate(); fake.shutdown()


if __name__ == "__main__":
    main()
