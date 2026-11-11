"""Basic features, supercharged by AI (feat/flint-ai, docs/DESIGN-SYSTEM.md §11): every ✦ works with no AI, and with the
tribe's AI on (a tiny local fake of an OpenAI-compatible model) the same answer is refined in place.
  1. No AI: chat ✦ summarizes the thread and turns it into tasks (added to the board); a task's ✦ splits it into a
     checklist, estimates it and suggests an owner (assigning works); a doc's ✦ tidies it; Files' ✦ describes and tags;
     a company seat's ✦ fills in the charter; Home's Flint gives today's plan. Each says "Basic · no AI".
  2. With AI: the same chat ✦ shows "✦ via tiny-model" with the model's tasks; the summary too.
  3. Phone at 390px: the ✦ answer opens as a bottom sheet. No console errors.
Usage: python app/test/e2e_ai_basics.py [--shots]   (--shots writes docs/screenshots/ai-basics-chat.png)"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5470 + OFF; FAKE = PORT + 700
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"; take = "--shots" in sys.argv
errors, asked = [], []


class FakeLLM(BaseHTTPRequestHandler):   # streams a canned answer that depends on what was asked
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        text = json.dumps(body.get("messages", [])); asked.append(text)
        if "One task per line" in text: out = "- Add the leaderboard screen\n- Fix the double jump bug (Jay)\n- Record a coin sound"
        elif "Summarize this team chat" in text: out = "Orion and Jay planned the leaderboard.\nJay takes the jump bug.\nCoin sounds are still open."
        else: out = "OK"
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for part in [out[:10], out[10:]]:
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": part}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.03)
        self.wfile.write(b"data: [DONE]\n\n")


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def page_for(b, name, token, **ctx):
    c = b.new_context(**(ctx or {"viewport": {"width": 1440, "height": 900}}))
    c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, server: {{url: '{BASE}', token: '{token}'}}}}))")
    pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}")); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(f"{name} console: {m.text[:200]}"))
    pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=15000)
    return pg


def spark_answer(pg, where, kind, want_via="Basic · no AI"):
    pg.click(f"[data-ab='{where}']")
    if pg.locator(f"#ab-pop [data-ab-do='{kind}']").count(): pg.click(f"#ab-pop [data-ab-do='{kind}']")
    pg.wait_for_selector(f"#ab-pop .ab-res[data-kind='{kind}'] #ab-out", timeout=8000)
    pg.wait_for_function("t => (document.querySelector('#ab-via') || {}).textContent && document.querySelector('#ab-via').textContent.includes(t)", arg=want_via, timeout=15000)
    return pg.inner_text("#ab-out")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-aibasics-")
    fake = ThreadingHTTPServer(("127.0.0.1", FAKE), FakeLLM); threading.Thread(target=fake.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=open(os.path.join(tmp, "log"), "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        st, boot = api("/bootstrap", "POST", {"name": "Orion"}); tok = boot["token"]
        st, inv = api("/invites", "POST", {"maxUses": 3}, token=tok)
        st, jay = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Jay"}); jtok = jay["token"]; jid = jay["member"]["id"]
        for who, t in [(tok, "We should add a leaderboard by friday"), (jtok, "Jay will fix the double jump bug"), (tok, "Decided: we will use pixel art for everything"), (jtok, "can someone record a coin sound?"), (tok, "leaderboard needs a top 10 list")]:
            assert api("/chat/general", "POST", {"text": t}, token=who)[0] == 200
        st, t1 = api("/tasks", "POST", {"title": "Build the leaderboard and add a share button"}, token=tok); tid = t1["task"]["id"]
        st, t0 = api("/tasks", "POST", {"title": "Leaderboard prototype", "assignee": jid}, token=tok)
        api("/tasks/" + t0["task"]["id"], "PATCH", {"status": "done"}, token=tok)

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = page_for(b, "Orion", tok)

            # ---------- 1. no AI: chat ----------
            pg.evaluate("TribeShell.go('chat')"); pg.wait_for_selector("#chat-head [data-ab='chat']", timeout=10000)
            pg.wait_for_function("document.querySelectorAll('#chat-list .msg:not(.sys)').length >= 5", timeout=10000)
            out = spark_answer(pg, "chat", "chat.summary")
            assert "5 messages from Orion and Jay" in out and "Decided" in out and "leaderboard" in out.lower(), out
            out = spark_answer(pg, "chat", "chat.tasks")
            assert "Add a leaderboard" in out and "Fix the double jump bug" in out and "Jay" in out and "Record a coin sound" in out, out
            n0 = len(api("/tasks", token=tok)[1]["tasks"])
            pg.click("#ab-pop [data-ab-apply='0']"); pg.wait_for_selector("#ab-pop", state="detached", timeout=8000)
            tasks = api("/tasks", token=tok)[1]["tasks"]; assert len(tasks) == n0 + 3, [t["title"] for t in tasks]
            fixed = next(t for t in tasks if t["title"] == "Fix the double jump bug"); assert fixed.get("assignee") == jid, fixed
            assert any(t["title"] == "Add a leaderboard" and t.get("due") for t in tasks), "the due date came along"

            # ---------- tasks: split, estimate, owner ----------
            pg.evaluate("TribeShell.go('ws-tasks')"); sel = f"#board .task[data-id='{tid}']"
            pg.wait_for_selector(sel + " [data-ab='task']", state="attached", timeout=10000); pg.hover(sel)
            pg.click(sel + " [data-ab='task']"); pg.click("#ab-pop [data-ab-do='task.split']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='task.split']")
            steps = pg.inner_text("#ab-out"); assert "Build the leaderboard" in steps and "Add a share button" in steps, steps
            pg.click("#ab-pop [data-ab-apply='0']"); pg.wait_for_function(f"TribeClient.api('/tasks').then(r => r.tasks.find(t => t.id === '{tid}').subtasks.length === 2)", timeout=8000)
            pg.hover(sel); pg.click(sel + " [data-ab='task']"); pg.click("#ab-pop [data-ab-do='task.estimate']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='task.estimate']")
            assert any(s in pg.inner_text("#ab-out") for s in ("S ·", "M ·", "L ·")), pg.inner_text("#ab-out")
            pg.keyboard.press("Escape")
            pg.hover(sel); pg.click(sel + " [data-ab='task']"); pg.click("#ab-pop [data-ab-do='task.owner']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='task.owner'] .ab-big")
            owner = pg.inner_text("#ab-out"); assert "Jay" in owner and "similar" in owner, owner
            pg.click("#ab-pop [data-ab-apply='0']"); time.sleep(0.6)
            assert next(t for t in api("/tasks", token=tok)[1]["tasks"] if t["id"] == tid).get("assignee") == jid

            # ---------- docs: tidy ----------
            pg.evaluate("TribeDocs.create('Plan', '#the plan\\n\\n\\n* first thing ,ok\\n*  second thing').then(d => { TribeApp.show('docs'); setTimeout(() => TribeDocs.open(d.slug), 100); })")
            pg.wait_for_selector("#view-docs .doc-toolbar [data-ab='doc']", timeout=10000)
            pg.click("[data-ab='doc']"); pg.click("#ab-pop [data-ab-do='doc.tidy']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='doc.tidy']")
            pg.click("#ab-pop [data-ab-apply='0']")
            val = pg.evaluate("document.querySelector('#doc-body').value"); assert "# The plan" in val and "- First thing, ok" in val and "- Second thing" in val, val

            # ---------- files: describe and tag (global Files) ----------
            pg.evaluate("TribeHub.open('docs')"); pg.wait_for_selector(".dc-bar [data-ab='files']", timeout=10000)
            pg.wait_for_selector("#hub-docs .dc-card", timeout=10000)
            pg.click(".dc-bar [data-ab='files']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='file.describe'] .ab-file", timeout=8000)
            assert "#doc" in pg.inner_text("#ab-out") and "Plan" in pg.inner_text("#ab-out"), pg.inner_text("#ab-out")
            pg.click("#ab-pop [data-ab-apply='0']"); time.sleep(0.5)
            assert any("doc" in v["tags"] for v in api("/ai/tags?project=local", token=tok)[1]["tags"].values()) or any("doc" in v["tags"] for v in api("/ai/tags", token=tok)[1]["tags"].values())

            # ---------- company: fill in a seat's charter ----------
            pid = pg.evaluate("TribeProjects.current()") or pg.evaluate("TribeClient.state().projects[0].id")
            pg.evaluate(f"TribeProjects.switchTo && TribeProjects.switchTo('{pid}')"); time.sleep(0.4)
            r = pg.evaluate("TribeCompany.create ? TribeCompany.create().then(() => 'ok').catch(e => e.message) : 'none'")
            pg.evaluate("TribeCompany.open()"); pg.wait_for_selector(".co-seat[data-seat]", timeout=10000)
            seat = pg.evaluate("[...document.querySelectorAll('.co-seat[data-seat]')].map(x => x.dataset.seat).find(Boolean)")
            pg.evaluate(f"TribeCompany.openSeat('{seat}')"); pg.wait_for_selector(".co-sh-body [data-ab='seat']", timeout=8000)
            pg.evaluate("document.querySelector('#cs-goal').value = ''")
            pg.click(".co-sh-body [data-ab='seat']"); pg.wait_for_selector("#ab-pop .ab-res[data-kind='seat.charter']")
            pg.click("#ab-pop [data-ab-apply='0']")
            assert len(pg.evaluate("document.querySelector('#cs-goal').value")) > 10, "the goal is filled in"
            pg.evaluate("document.querySelector('#invite-modal') && document.querySelector('#invite-modal').classList.add('hidden')")

            # ---------- Home: today's plan from Flint ----------
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#flint-home [data-fhq='plan my day']", timeout=10000)
            pg.click("#flint-home [data-fhq='plan my day']")
            pg.wait_for_function("document.querySelector('#flint-home .fh-thread').innerText.includes(\"Today's plan\")", timeout=8000)
            plan = pg.inner_text("#flint-home .fh-thread"); assert "Build the leaderboard" in plan or "Review" in plan or "Nobody" in plan, plan

            # ---------- 2. with AI: the same ✦, refined in place ----------
            st, d = api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{FAKE}/v1", "model": "tiny-model", "key": "sk-test-0123456789"}, token=tok); assert st == 200, d
            pg.evaluate("window.dispatchEvent(new Event('tribe-brain'))")
            pg.evaluate("TribeShell.go('chat')"); pg.wait_for_selector("#chat-head [data-ab='chat']")
            out = spark_answer(pg, "chat", "chat.tasks", "via tiny-model")
            assert "Add the leaderboard screen" in out and "Record a coin sound" in out, out
            assert "Jay" in out, out   # "(Jay)" from the model becomes the assignee
            if take:
                SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "ai-basics-chat.png"))
            pg.keyboard.press("Escape")
            out = spark_answer(pg, "chat", "chat.summary", "via tiny-model"); assert "Jay takes the jump bug" in out, out
            assert any("Summarize this team chat" in a for a in asked) and any("One task per line" in a for a in asked)

            # ---------- 3. phone: a bottom sheet ----------
            ph = page_for(b, "Jay", jtok, viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.evaluate("TribeShell.go('ws-tasks')"); ph.wait_for_selector(f"{sel} [data-ab='task']", state="attached", timeout=10000)
            ph.evaluate(f"document.querySelector(\"{sel} [data-ab='task']\").click()"); ph.click("#ab-pop [data-ab-do='task.estimate']")
            ph.wait_for_selector("#ab-pop.sheet .ab-res", timeout=8000)
            box = ph.evaluate("(() => { const r = document.querySelector('#ab-pop').getBoundingClientRect(); return [r.left, r.right, innerWidth]; })()")
            assert box[0] >= 0 and box[1] <= box[2], box
            b.close()
        assert not errors, errors
        print("e2e_ai_basics: OK (chat summary + tasks, task split/estimate/owner, doc tidy, files tags, seat charter, today's plan; refined via a fake model; phone sheet)")
    finally:
        srv.kill(); fake.shutdown()


if __name__ == "__main__":
    main()
