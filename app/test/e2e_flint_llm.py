"""Flint's local model, tier 2 (feat/flint-local: app/ui/flintllm.js, server/flintllm.js).
A FAKE OpenAI-compatible server runs inside this test on 127.0.0.1 (scripted replies, streamed as SSE). No real model
is involved: this proves the plumbing and the safety checks, not the quality of any model.
  - off by default: nothing is probed or sent until the person opens the picker; the picker finds the server, lists its
    models, refuses an address that is not on this computer
  - a request the rules miss -> the model's ops are validated and applied; Undo takes them back
  - unsafe or malformed output is refused and nothing changes: not JSON, an unknown field, a sentence that is not one
    of Flint's commands, a command a model may never start (hosting); an outbound command (posting to chat) becomes a
    button instead of running
  - writing jobs stream into the chat (rewrite in a tone), and the project's facts go into the prompt
  - a slow model: the timeout stops it and Flint carries on with tier 0; Cancel stops it at once
  - the server goes away: Flint falls back to what he does with no model
  - the host bridge: loopback only, host/admin unless shared, streams the same replies
  - nothing leaves this computer: every request the page makes goes to localhost
Usage: python3 app/test/e2e_flint_llm.py
"""
import json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6560 + OFF; BASE = f"http://localhost:{PORT}"; LPORT = 6580 + OFF; LLM = f"http://localhost:{LPORT}"
errors, urls, seen = [], [], []   # seen: what the fake model was sent


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "content-type"); self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        if self.path == "/v1/models":
            body = json.dumps({"object": "list", "data": [{"id": "fake-small"}, {"id": "fake-slow"}]}).encode()
            self.send_response(200); self.cors(); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        else: self.send_response(404); self.cors(); self.end_headers()
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        seen.append(req); sysmsg = req["messages"][0]["content"]; user = req["messages"][-1]["content"]; pieces, gap = None, 0.02
        if req.get("model") == "fake-slow": time.sleep(6)
        if sysmsg.startswith("You turn a person's request into commands"):
            if "groceries" in user: out = {"ops": [{"say": "add a task to buy groceries tomorrow"}]}
            elif "two things" in user: out = {"ops": [{"say": "add a task to water the plants"}, {"say": "add a task to feed the cat", "intent": "task.add"}]}
            elif "evil" in user: out = {"ops": [{"say": "start hosting"}]}
            elif "extra" in user: out = {"ops": [{"say": "add a task to do something", "run": "rm -rf /"}]}
            elif "nonsense" in user: out = {"ops": [{"say": "transmogrify the flux capacitor"}]}
            elif "wrong label" in user: out = {"ops": [{"say": "add a task to paint the fence", "intent": "task.delete"}]}
            elif "announce" in user: out = {"ops": [{"say": "post in chat that lunch is ready"}]}
            elif "garbage" in user: out = None
            else: out = {"text": "I am a scripted fake."}
            text = "sure, here you go!" if out is None else "```json\n" + json.dumps(out) + "\n```"
            pieces = [text[i:i + 12] for i in range(0, len(text), 12)]
        else:
            pieces = ["Good ", "news: ", "the ", "shop ", "is ", "taking ", "a ", "short ", "break ", "and ", "will ", "be ", "back ", "soon."]; gap = 0.12
        self.send_response(200); self.cors(); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        try:
            for pc in pieces:
                self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": pc}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(gap)
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        except Exception: pass


def api(path, method="GET", body=None, token=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x:
            data = x.read(); return x.status, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read(); return e.code, (data.decode() if raw else json.loads(data or b"{}"))


def ask(page, text, timeout=25000):
    n = page.locator("#flint .fl-msg.fl").count()
    page.fill("#fl-input", text); page.press("#fl-input", "Enter")
    page.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n && !document.querySelector('#flint .fl-msg.streaming')", arg=n, timeout=timeout)
    page.wait_for_timeout(500)
    return [(m.text_content().strip(), m.locator(".fl-act").all_text_contents()) for m in page.locator("#flint .fl-msg.fl").all()[n:]]


def main():
    fake = ThreadingHTTPServer(("127.0.0.1", LPORT), Fake); threading.Thread(target=fake.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flintllm-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FLINT_LLM_URLS": f"http://127.0.0.1:{LPORT},https://example.com"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d; tok = d["token"]
        tasks = lambda: [t["title"] for t in api("/tasks", token=tok)[1]["tasks"]]

        # ---------- the host bridge ----------
        st, d = api("/flint/llm", token=tok); assert st == 200 and d["can"] and not d["share"], d
        assert [s["url"] for s in d["servers"]] == [f"http://127.0.0.1:{LPORT}"] and d["servers"][0]["models"] == ["fake-small", "fake-slow"], d   # the non-loopback address in the env was dropped
        assert api("/flint/llm")[0] == 401
        msg = {"model": "fake-small", "messages": [{"role": "system", "content": "Rewrite"}, {"role": "user", "content": "hello"}]}
        st, d = api("/flint/llm/chat", "POST", {**msg, "url": "https://api.openai.com"}, token=tok); assert st == 400 and "this computer" in d["error"], d
        st, d = api("/flint/llm/chat", "POST", {**msg, "url": "http://169.254.169.254"}, token=tok); assert st == 400, d
        st, d = api("/flint/llm/chat", "POST", {**msg, "url": "http://localhost.evil.example"}, token=tok); assert st == 400, d
        st, out = api("/flint/llm/chat", "POST", {**msg, "url": LLM}, token=tok, raw=True); assert st == 200 and out.startswith("Good news: the shop") and out.endswith("back soon."), out
        st, d = api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder"}, token=tok); code = d["invite"]["code"]
        st, j = api("/join", "POST", {"code": code, "name": "Maya"}); assert st == 200, j; mtok = j["token"]
        st, d = api("/flint/llm", token=mtok); assert st == 200 and d["servers"] == [] and not d["can"], d
        assert api("/flint/llm/chat", "POST", {**msg, "url": LLM}, token=mtok)[0] == 403, "a member can't use the host's model until the host shares it"
        assert api("/flint/llm", "PUT", {"share": True}, token=mtok)[0] == 403
        assert api("/flint/llm", "PUT", {"share": True}, token=tok)[0] == 200
        assert api("/flint/llm/chat", "POST", {**msg, "url": LLM}, token=mtok, raw=True)[0] == 200
        assert api("/flint/llm", "PUT", {"share": False}, token=tok)[0] == 200
        seen.clear()

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}})); localStorage.setItem('tribecode.flint.brain', 'none');")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("request", lambda r: urls.append(r.url))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintLLM && window.TribeFlintLocal && window.TribeNLU", timeout=30000)
            pg.wait_for_selector("#fl-input", state="visible", timeout=20000)

            # ---------- off by default ----------
            assert pg.evaluate("TribeFlintLLM.config()") == {"backend": "off"} and pg.evaluate("TribeFlintLLM.ready()") is False
            out = ask(pg, "groceries need sorting for tomorrow, handle it")
            assert "I read that as" not in out[0][0] and "buy groceries" not in " ".join(tasks()).lower(), out
            assert not seen and not [u for u in urls if str(LPORT) in u], "no model is contacted until one is chosen"

            # ---------- the picker ----------
            pg.evaluate("TribeFlintLLM.open()"); pg.wait_for_selector("#flint-llm .fll-card", timeout=15000)
            pg.wait_for_selector(f"#flint-llm .fll-pick[data-where=host][data-model='fake-small']", timeout=10000)   # found on the host (which is this computer here)
            assert "Off" in pg.inner_text("#fll-state") and "Only addresses on this computer" in pg.inner_text("#flint-llm")
            pg.fill("#fll-u", "https://api.example.com/v1"); pg.click("#fll-url button"); pg.wait_for_selector("#fll-note")
            assert "not on this computer" in pg.inner_text("#fll-note") and pg.evaluate("TribeFlintLLM.config().backend") == "off"
            pg.fill("#fll-u", LLM); pg.click("#fll-url button")
            pg.wait_for_selector(f"#flint-llm .fll-pick[data-where=device][data-model='fake-small']", timeout=10000)   # and straight from the page
            pg.click(f"#flint-llm .fll-pick[data-where=device][data-model='fake-small']"); pg.wait_for_selector("#fll-state.on")
            assert pg.evaluate("TribeFlintLLM.config()") == {"backend": "device", "url": LLM, "model": "fake-small"} and pg.evaluate("TribeFlintLLM.ready()")
            pg.click("#fll-test"); pg.wait_for_function("document.querySelector('#fll-note') && /tokens a second/.test(document.querySelector('#fll-note').textContent)", timeout=20000)
            pg.click("#fll-done")

            # ---------- ops: validated, applied, Undo ----------
            seen.clear(); before = tasks()
            out = ask(pg, "groceries need sorting for tomorrow, handle it")
            assert "I read that as one step" in out[-1][0] and "✓" in out[-1][0] and "Undo" in out[-1][1], out
            assert "fake-small on this device" in pg.locator("#flint .fl-msg.fl .fl-via").last.inner_text()
            assert [t for t in tasks() if t not in before] == ["Buy groceries"], tasks()
            assert "add a task to buy milk" in seen[0]["messages"][0]["content"] and seen[0].get("response_format") == {"type": "json_object"}, "the prompt lists Flint's own commands and asks for JSON"
            pg.locator("#flint .fl-act", has_text="Undo").last.click(); pg.wait_for_timeout(1500)
            assert tasks() == before, "Undo took the model's edit back"
            out = ask(pg, "two things please, you know which")
            assert "2 steps" in out[-1][0] and sorted(t for t in tasks() if t not in before) == ["Feed the cat", "Water the plants"], (out, tasks())
            out = ask(pg, "undo"); assert sorted(t for t in tasks() if t not in before) == ["Water the plants"], "one Undo entry per op"
            ask(pg, "undo"); assert tasks() == before

            # ---------- refused: nothing changes ----------
            hosting0 = pg.evaluate("!!TribeStore.get().hosting")
            for word, why in (("garbage", "not an object"), ("extra", "a field I do not know"), ("nonsense", "not one of my commands"), ("evil", "may not start"), ("wrong label", "does not mean")):
                out = ask(pg, f"the {word} thing, sort it out somehow")
                joined = " ".join(o[0] for o in out)
                assert "can’t safely apply" in joined and why in joined and "so I changed nothing" in joined, (word, out)
                assert len(out) >= 2, f"{word}: Flint carries on with what he does with no model"
            assert tasks() == before and pg.evaluate("!!TribeStore.get().hosting") == hosting0, "nothing was applied"
            # outbound: a button, not an action
            chat0 = len(api("/chat/general", token=tok)[1]["messages"])
            out = ask(pg, "the announce thing, sort it out somehow")
            assert "press to do it" in out[-1][0] and "post in chat that lunch is ready" in out[-1][1] and "Undo" not in out[-1][1], out
            assert len(api("/chat/general", token=tok)[1]["messages"]) == chat0, "nothing was posted"

            # ---------- writing: streamed, with the project's facts ----------
            ask(pg, "the bake sale is on Saturday 14 June")
            seen.clear(); n = pg.locator("#flint .fl-msg.fl").count()
            pg.fill("#fl-input", "rewrite this friendly: We regret to inform you that the shop is closed."); pg.press("#fl-input", "Enter")
            pg.wait_for_selector("#flint .fl-msg.fl.streaming", timeout=10000)
            assert pg.locator("#flint .fl-msg.streaming .fl-act", has_text="Cancel").count() == 1
            lens = set()
            for _ in range(40):
                lens.add(len(pg.locator("#flint .fl-msg.fl").last.locator(".fl-t").text_content()))
                if not pg.locator("#flint .fl-msg.streaming").count(): break
                pg.wait_for_timeout(100)
            assert len(lens) >= 4, f"the reply grew as it streamed: {sorted(lens)}"
            last = pg.locator("#flint .fl-msg.fl").last
            assert last.locator(".fl-t").text_content().strip() == "Good news: the shop is taking a short break and will be back soon." and last.locator(".fl-act").all_text_contents() == ["Copy"]
            s0 = seen[0]["messages"]; assert s0[0]["content"].startswith("Rewrite the text so it sounds friendly") and "Project facts:" in s0[0]["content"] and "bake sale = Saturday 14 June" in s0[0]["content"], s0
            assert s0[1]["content"] == "We regret to inform you that the shop is closed."

            # ---------- timeout, then Cancel ----------
            pg.evaluate("TribeFlint.clear()")
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'device', url: '{LLM}', model: 'fake-slow', timeoutMs: 1500 }})")
            t0 = time.time(); out = ask(pg, "groceries need sorting for tomorrow, handle it"); took = time.time() - t0
            joined = " ".join(o[0] for o in out); assert "took longer than 2 seconds" in joined and "changed nothing" in joined and took < 5.5, (out, took)
            assert len(out) >= 2 and tasks() == before, "after the timeout Flint answers with no model"
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'device', url: '{LLM}', model: 'fake-slow', timeoutMs: 20000 }})")
            n = pg.locator("#flint .fl-msg.fl").count(); pg.fill("#fl-input", "groceries need sorting for tomorrow, handle it"); pg.press("#fl-input", "Enter")
            pg.wait_for_selector("#flint .fl-msg.streaming .fl-act", timeout=10000); t0 = time.time()
            pg.locator("#flint .fl-msg.streaming .fl-act", has_text="Cancel").click()
            pg.wait_for_function("!document.querySelector('#flint .fl-msg.streaming')", timeout=5000)
            assert time.time() - t0 < 3 and "Stopped. Nothing changed." in pg.locator("#flint .fl-msg.fl").nth(n).text_content() and tasks() == before
            pg.wait_for_timeout(600)

            # ---------- through the host ----------
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'host', url: 'http://127.0.0.1:{LPORT}', model: 'fake-small' }})")
            out = ask(pg, "groceries need sorting for tomorrow, handle it")
            assert "I read that as one step" in out[-1][0] and "Buy groceries" in tasks(), out
            assert "on your tribe’s host" in pg.locator("#flint .fl-msg.fl .fl-via").last.inner_text()
            ask(pg, "undo"); assert tasks() == before

            # ---------- the device panel measures it ----------
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'device', url: '{LLM}', model: 'fake-small' }})")
            pg.evaluate("TribeFlintPage.open('', 'device')"); pg.wait_for_selector("#fp-device #fdv-run")
            assert pg.locator(".fpg-lv.on[data-lv=local]").count() == 1, "level 2 shows Active"
            pg.click("#fdv-run"); pg.wait_for_selector("#fdv-res[data-done]", timeout=30000)
            res = pg.inner_text("#fdv-res"); assert "tokens a second" in res and "First word after" in res, res
            assert "fake-small" in pg.inner_text("#fdv-dl")
            pg.evaluate("TribeFlintPage.close()")

            # ---------- the server goes away: tier 0 carries on ----------
            fake.shutdown(); fake.server_close()
            pg.evaluate("TribeFlint.clear()")   # the thread keeps 40 messages
            out = ask(pg, "groceries need sorting for tomorrow, handle it")
            joined = " ".join(o[0] for o in out); assert "didn’t answer, so I’m carrying on without it" in joined and len(out) >= 2 and tasks() == before, out
            out = ask(pg, "add a task to buy milk"); assert "Added to Tasks" in out[-1][0], "the rules never needed it"

            # ---------- nothing left this computer ----------
            hosts = {urlparse(u).hostname for u in urls if u.startswith("http")}
            assert hosts <= {"localhost", "127.0.0.1"}, hosts
            b.close()
        assert not errors, errors
        print("e2e_flint_llm ok (a scripted fake server, no real model): picker, ops validated and applied with Undo, 5 kinds of unsafe output refused, "
              "outbound waits for a press, streaming with project facts, timeout, cancel, the host bridge (loopback only), fallback, no request left localhost")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        try: fake.shutdown()
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
