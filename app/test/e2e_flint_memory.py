"""Flint grown up (v0.27.1): he remembers you (per person, private, in Settings › Flint, never in anyone else's cloud copy),
teaches your way (lesson styles, another way, a light quiz), writes docs into Files as Flint drafts, builds from a
sentence, greets you with a brief, knows the project's own words, notices repeats, and saves/runs tribe skills
(builders and up only). MCP: flint_remember and flint_skills.
Usage: python app/test/e2e_flint_memory.py   (honours TRIBE_PORT_OFFSET)"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4870 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()


def wait(fn, timeout=12, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError("timed out waiting for " + what)


def mcp(token, name, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with http.open(req) as r: raw = r.read().decode()
    if raw.startswith("event:") or "data:" in raw[:20]: raw = [l[5:].strip() for l in raw.splitlines() if l.startswith("data:")][-1]
    return json.loads(raw)["result"]


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flintmem-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_SETUP_CODE": "flint-test-code", "TRIBE_CLOUD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(lambda: api("/api/health")[0] == 200, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        code2 = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        sam = api("/api/join", "POST", {"code": code2, "name": "Sam"})[1]["token"]
        members = api("/api/members", token=host)[1]
        members = members.get("members", members) if isinstance(members, dict) else members
        sam_id = next(m["id"] for m in members if m["name"] == "Sam")
        st, r = api("/api/perms/assign", "POST", {"member": sam_id, "role": "spectator"}, host); assert st == 200, (st, r)
        api("/api/vision", "PUT", {"text": "# Kombucha Empire\n\nTrack every kombucha batch from brewing to bottling. Batches have a day counter and a flavor. Orders come from cafés.\n"}, host)

        # ---- API: memory is per person and private ----
        st, r = api("/api/flint/memory", "POST", {"text": "I like code examples"}, host); assert st == 200 and r["note"]["kind"] in ("pref", "style", "fact"), r
        assert api("/api/flint/memory", token=maya)[1]["notes"] == [], "Maya must not see Camp's notes"
        snap = api("/api/cloud/snapshot", token=maya)[1]
        assert snap.get("enabled"), snap
        assert not any(k.startswith(".tribe/flint/memory/") for k in snap["files"]), "no one else's Flint memory in Maya's cloud copy"
        # ---- API: skills, roles ----
        st, r = api("/api/flint/skills", "POST", {"name": "peek", "steps": ["nope"]}, sam); assert st == 403, ("spectators can't save skills", st, r)
        st, r = api("/api/flint/skills", "POST", {"name": "loop", "steps": ["/loop"]}, host); assert st == 400, "a skill can't run itself"
        # ---- API: project words, drafts ----
        words = [w["term"] for w in api("/api/flint/vocab", token=host)[1]["words"]]
        assert "batch" in words, words
        # ---- MCP ----
        assert "Flint will remember" in mcp(host, "flint_remember", {"text": "working on the orders page"})["content"][0]["text"]
        assert "No Flint skills" in mcp(host, "flint_skills", {})["content"][0]["text"]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            settings = {"onboarded": True, "name": "Camp", "server": {"url": BASE, "token": host}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
            page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});")
            page.goto(BASE + "/?skipIntro=1")
            page.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlint && window.TribeFlintMem", timeout=15000)
            time.sleep(1)

            def ask(t, expect, timeout=12):
                n = page.evaluate("TribeFlint.thread().length")
                page.evaluate("t => TribeFlint.ask(t)", t)
                return wait(lambda: next((m for m in page.evaluate("TribeFlint.thread()")[n:] if m["who"] == "flint" and expect.lower() in m["text"].lower()), None), timeout, f"Flint to answer {t!r} with {expect!r}")

            ask("call me Camp", "Nice to meet you")
            m = ask("what do you know about me?", "only you can see")
            assert "code examples" in m["text"] and "orders page" in m["text"], m["text"]
            m = ask("teach me what a function is", "function")
            labels = [a["label"] for a in m["acts"]]
            assert "Another way" in labels and "Quiz me lightly" in labels, labels
            m = ask("teach me with pictures", "pictures")
            assert api("/api/flint/memory", token=host)[1]["style"] == "picture", "the style is remembered"
            m = ask("explain what an API is", "pictures edition")
            page.evaluate("TribeFlintMem.act('quiz:api')"); wait(lambda: "Quick one" in page.evaluate("TribeFlint.thread().slice(-1)[0].text"), what="quiz")
            page.evaluate("TribeFlintMem.act('ans:api:0')"); wait(lambda: "Right" in page.evaluate("TribeFlint.thread().slice(-1)[0].text"), what="quiz answer")
            m = ask("what are batches?", "In this project")
            m = ask("write the launch doc", "Flint draft", 20)
            docs = api("/api/docs", token=host)[1]["docs"]
            d = next(x for x in docs if x["title"] == "Launch plan")
            body = api(f"/api/docs/{d['slug']}", token=host)[1]
            body = body.get("doc", body).get("body", "") if isinstance(body, dict) else ""
            assert "Flint draft" in body and ("batch" in body.lower()), body[:300]
            m = ask("hi", "Camp")
            # repeats → offer → save → run
            for _ in range(2):
                ask("what's new", "")
                ask("list skills", "skills")
            wait(lambda: any("Want me to make it a skill" in x["text"] for x in page.evaluate("TribeFlint.thread()")), what="the skill offer")
            ask("save that as a skill called friday", "Saved")
            assert any(s["name"] == "friday" for s in api("/api/flint/skills", token=host)[1]["skills"])
            ask("/friday", "Running")
            wait(lambda: next(s for s in api("/api/flint/skills", token=host)[1]["skills"] if s["name"] == "friday")["runs"] == 1, what="the run to count")
            m = ask("build me a habit tracker for our flat", "On it")
            assert "Still needed" in m["text"] and "AI helper" in m["text"], m["text"]
            # Settings › Flint shows and edits the notes
            page.evaluate("TribeSettings.open()")
            page.wait_for_selector("#set-flintmem .fm-notes li[data-id]", timeout=8000)
            txt = page.inner_text("#set-flintmem") + " " + " ".join(page.eval_on_selector_all("#set-flintmem input, #set-flintmem textarea", "els => els.map(e => e.value)"))
            assert "code examples" in txt and "/friday" in txt, txt[:400]
            n_before = len(api("/api/flint/memory", token=host)[1]["notes"])
            page.locator("#set-flintmem .fm-notes li[data-id] .fm-del").first.click()
            wait(lambda: len(api("/api/flint/memory", token=host)[1]["notes"]) == n_before - 1, what="delete a note")
            page.screenshot(path=str(Path(tmp) / "flint-settings.png"))
            b.close()
        assert not errors, errors
        print("ok e2e_flint_memory")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
