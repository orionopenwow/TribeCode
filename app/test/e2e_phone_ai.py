"""A friend with only a phone: no TribeCode at home, no Claude Code subscription. The whole thing still works.

  1. Host taps Invite a friend -> a fresh project. The friend opens the link on a phone, types a name, joins.
  2. Chat shows the friend's card, not the host's setup: "You're in", Ask AI / Voice note / Add an idea, roles to
     pick. No Connect GitHub, no invite link to manage, no "Start the flow". Picking a role works.
  3. Talk to… leads with Ask AI (who answers right now), no "My desktop", and a quiet "connect Claude Code too".
     The + menu offers Ask AI instead of "Ask my Claude".
  4. @ai with no AI on: the question becomes a task on the board for the next Claude, and chat says so.
  5. The host connects Claude Code. @ai now asks the host first (one-tap approval); after Approve, the host's
     Claude gets the question through check_messages, answers with post_chat, and the phone shows the answer.
  6. Host sets Settings > Friends can ask my Claude > Always: the next @ai goes straight to the host's Claude.
  7. Never: @ai falls back to the queue. With the local model on (mock Ollama), @ai answers right away.
Usage: python app/test/e2e_phone_ai.py
"""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4879 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
OLLAMA = 4881 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
SHOTS = "--shots" in sys.argv
errors = []


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]

def tool(token, name, args=None, project=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}
    h = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]["content"][0]["text"]

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def wait_until(fn, timeout=15, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)

def shot(page, name):
    if SHOTS: page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"phone-ai-{name}.png"))

def send(ph, text):
    ph.fill("#chat-input", text); ph.press("#chat-input", "Enter")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-pai-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "..", f"pai-server-{PORT}.log"), "w+")
    # The local model starts off (port with nothing on it); step 7 turns the mock on.
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", f"http://localhost:{OLLAMA}"], stdout=log, stderr=subprocess.STDOUT, env=env)
    ollama = None
    try:
        wait_until(lambda: api("/health")[0] == 200, 15, "server up")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1440, "height": 900}); named(host, "Orion")
            host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            host.evaluate("TribeFlow.instant()"); host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000)
            link = re.sub(r"https?://[^/]+", BASE, host.inner_text("#ii-link").strip())
            host.click(".modal-card.ii [data-close]")
            htok = host.evaluate("TribeStore.get().server.token"); pid = host.evaluate("TribeProjects.current()")

            # ---- 1. the friend joins on a phone ----
            ctx = b.new_context(**PHONE); ph = ctx.new_page(); ph.on("pageerror", lambda e: errors.append(f"phone: {e}"))
            ph.goto(link); ph.wait_for_selector("#name", timeout=15000); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url(re.compile(r"/m/"), timeout=20000)
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            try: ph.wait_for_selector("#ins-later", state="visible", timeout=6000); ph.click("#ins-later")
            except Exception: pass
            ftok = ph.evaluate("TribeStore.get().server.token")

            # ---- 2. the friend's card in chat ----
            ph.click('#tabbar [data-nav="chat"]')
            ph.wait_for_selector(".fk-phone", timeout=15000)
            wait_text(ph, ".fk-phone", "No computer needed")
            for sel in ["#fk-ai", "#fk-voice", "#fk-idea"]: ph.wait_for_selector(sel, state="visible")
            for gone in ["#flow-gh", "#flow-link", "#flow-start"]: assert ph.query_selector(f"#flow-dock {gone}") is None, f"{gone} is not on the friend's phone card"
            shot(ph, "card")
            ph.click('.fk-phone [data-role="design"]') if ph.query_selector('.fk-phone [data-role="design"]') else ph.click('.fk-phone .role-chip.open')
            ph.wait_for_timeout(400)
            m = ph.query_selector("#flow-rmenu:not(.hidden) button")
            if m: m.click()
            wait_until(lambda: any("Maya" in json.dumps(r) or any(x for x in r.get("members", []) if x) for r in ok(api("/flow", token=ftok, project=pid), "flow")["flow"]["roles"] if r["id"] != "lead" and r["members"]), 10, "Maya picked a role")
            ph.click("#fk-idea"); ph.fill("#flow-note", "Pixel art cats as enemies"); ph.press("#flow-note", "Enter")
            wait_until(lambda: any("cats" in json.dumps(n).lower() for n in ok(api("/flow", token=ftok, project=pid), "flow")["flow"]["notes"]), 10, "the idea landed in the notes")

            # ---- 3. Talk to… and the + menu ----
            ph.click("#m2-talk"); ph.wait_for_selector("#m2-talk-sheet [data-talk='ai']")
            wait_text(ph, "#m2-ai-sub", "next Claude")
            assert ph.query_selector("#m2-talk-sheet [data-talk='desktop']") is None, "no 'My desktop' for a phone-only friend"
            assert ph.query_selector("#m2-talk-sheet .m2-byo"), "a quiet way to connect Claude Code later"
            shot(ph, "talk")
            ph.click("#m2-talk-sheet [data-talk='ai']")
            ph.wait_for_function("document.querySelector('#chat-input').value.startsWith('@ai')")
            ph.fill("#chat-input", "")
            ph.click("#m2-plus"); wait_text(ph, ".pm, body", "Ask AI"); ph.keyboard.press("Escape")
            ph.evaluate("window.TribePlus && TribePlus.close && TribePlus.close()")

            # ---- 4. @ai with nothing on: a task for the next Claude ----
            send(ph, "@ai how should the double jump feel?")
            wait_until(lambda: any("double jump" in t["title"] for t in ok(api("/tasks", token=htok, project=pid), "tasks")["tasks"]), 10, "queued as a task")
            wait_text(ph, "#chat-list", "next Claude that connects")

            # ---- 5. the host's Claude, with one-tap approval ----
            ag = ok(api("/agents", "POST", {}, token=htok, project=pid), "host connects Claude Code"); atok = ag["token"]
            tool(atok, "tribe_overview", project=pid)   # online
            r = ok(api("/ask", token=ftok, project=pid), "who answers")
            assert r["kind"] == "theirs" and r["needsOk"], r
            send(ph, "@ai what engine are we using?")
            wait_until(lambda: [a for a in ok(api("/approvals", token=htok, project=pid), "approvals").get("approvals", []) if a["kind"] == "ask-claude" and a["status"] == "pending"], 10, "approval for the host")
            ap = [a for a in ok(api("/approvals", token=htok, project=pid), "approvals")["approvals"] if a["kind"] == "ask-claude" and a["status"] == "pending"][0]
            assert "engine" in ap["details"]
            wait_text(ph, "#chat-list", "One tap on their phone")
            ok(api(f"/approvals/{ap['id']}/approve", "POST", {}, token=htok, project=pid), "approve")
            got = {}
            def asked():
                got["t"] = tool(atok, "check_messages", project=pid)
                return "engine" in got["t"]
            wait_until(asked, 10, "the host's Claude gets the question")
            assert "@Maya" in got["t"] and "post_chat" in got["t"], got["t"]
            tool(atok, "post_chat", {"text": "@Maya Plain JavaScript and a canvas, no engine."}, project=pid)
            wait_text(ph, "#chat-list", "no engine", 10000)
            shot(ph, "answer")

            # ---- 6. Always ----
            ok(api("/ask/policy", "PUT", {"policy": "always"}, token=htok), "always")
            assert ok(api("/ask", token=ftok, project=pid), "who")["needsOk"] is False
            send(ph, "@ai can slimes hop?")
            wait_until(lambda: "slimes" in tool(atok, "check_messages", project=pid), 10, "straight to the host's Claude")
            wait_text(ph, "#chat-list", "is on Maya")

            # ---- 7. Never -> queue; the local model answers when it's on ----
            ok(api("/ask/policy", "PUT", {"policy": "never"}, token=htok), "never")
            assert ok(api("/ask", token=ftok, project=pid), "who")["kind"] == "queue"
            ollama = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(OLLAMA)], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            time.sleep(0.8); api("/brain", token=htok)
            wait_until(lambda: ok(api("/ask", token=ftok, project=pid), "who")["kind"] == "brain", 10, "the local model is the answer now")
            send(ph, "@ai what is next?")
            wait_until(lambda: "Local" in ph.inner_text("#chat-list") or "brain" in ph.inner_text("#chat-list").lower(), 15, "the local model answered in chat")

            # Settings shows the policy to the host
            host.evaluate("TribeSettings.open()"); host.wait_for_selector("#set-askai")
            host.wait_for_function("document.querySelector('#set-askai').value === 'never'")
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, "page errors:\n" + "\n".join(bad)
        print("e2e_phone_ai: OK (phone-only friend: card, Ask AI, queue -> host's Claude with approval -> answer in chat; always; never; local model)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-3000:]); raise
    finally:
        if ollama: ollama.kill()
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
