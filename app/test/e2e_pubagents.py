"""Agents in public chat (v0.20): @my-claude / @maya's-claude in a channel gives that agent a public command, the
agent gets it with instructions to answer in the channel, owners' policies and the admin's rules apply, a plain
@person never wakes their agent, and finished agent tasks are posted in the channel. Plus the @ picker in the UI."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5290 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"; return r[1]
def tool(token, name, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]["content"][0]["text"]
def wait_until(fn, timeout=10, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)
def chat(tok): return [m.get("text") or "" for m in ok(api("/chat/general?limit=200", token=tok))["messages"]]
def said(tok, s): return any(s in t for t in chat(tok))

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-pa-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait_until(lambda: api("/health")[0] == 200, 20, "server")
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]
        camp_agent = ok(api("/agents", "POST", {}, token=host), "host connects Claude")["token"]
        maya_agent = ok(api("/agents", "POST", {}, token=maya), "maya connects Claude")["token"]
        tool(camp_agent, "tribe_overview"); tool(maya_agent, "tribe_overview")   # online

        # my own agent: straight through, publicly acknowledged, told to answer in the channel
        ok(api("/chat/general", "POST", {"text": "@my-claude add a jump sound"}, token=host))
        wait_until(lambda: said(host, "is on it"), 10, "ack")
        got = {}
        wait_until(lambda: "jump sound" in (got.__setitem__("t", tool(camp_agent, "check_messages")) or got["t"]), 10, "camp's agent got it")
        assert "public command" in got["t"] and "post_chat" in got["t"] and "#general" in got["t"], got["t"]
        # someone else's agent: the owner's policy (default ask) -> approval for Maya
        ok(api("/chat/general", "POST", {"text": "@mayas-claude make the title screen pixel art"}, token=host))
        wait_until(lambda: said(host, "Asked Maya"), 10, "asked maya")
        ap = [a for a in ok(api("/approvals", token=maya))["approvals"] if a["kind"] == "ask-claude" and a["status"] == "pending"][0]
        assert "title screen" in ap["details"]
        ok(api(f"/approvals/{ap['id']}/approve", "POST", {}, token=maya))
        wait_until(lambda: "title screen" in tool(maya_agent, "check_messages"), 10, "maya's agent got it after approval")
        # a plain @person is a person, not their agent
        n = len(chat(host)); ok(api("/chat/general", "POST", {"text": "@maya nice work today"}, token=host)); time.sleep(1)
        assert not any("is on it" in t or "Asked Maya" in t for t in chat(host)[n:])
        # never: Maya keeps her Claude to herself
        ok(api("/ask/policy", "PUT", {"policy": "never"}, token=maya))
        ok(api("/chat/general", "POST", {"text": "@maya's-claude fix the bug"}, token=host))
        wait_until(lambda: said(host, "keeps their Claude to themselves"), 10, "never")
        # admin rules: spectators can't; admins-only; channel limits; off
        assert api("/ask/public", "PUT", {"who": "admins"}, token=maya)[0] == 403
        p = ok(api("/ask/public", "PUT", {"who": "admins", "perHour": 0, "channels": ["#general"]}, token=host))
        assert p["who"] == "admins" and p["perHour"] == 1 and p["channels"] == ["general"], p
        ok(api("/ask/policy", "PUT", {"policy": "always"}, token=host))
        ok(api("/chat/general", "POST", {"text": "@camps-claude hello"}, token=maya))
        wait_until(lambda: said(host, "only admins"), 10, "admins only")
        ok(api("/ask/public", "PUT", {"on": False, "who": "members", "perHour": 20, "channels": []}, token=host))
        ok(api("/chat/general", "POST", {"text": "@my-claude ping"}, token=host))
        wait_until(lambda: said(host, "don't take commands in public chat"), 10, "off")
        ok(api("/ask/public", "PUT", {"on": True}, token=host))
        # finished agent tasks are posted in the channel
        t = ok(api("/tasks", "POST", {"title": "Add coins"}, token=host))["task"]
        me_agent = [m for m in ok(api("/members", token=host))["members"] if m.get("role") == "agent" and m.get("owner")]
        aid = [m for m in me_agent if "Camp" in (m.get("name") or "") or m.get("owner")][0]["id"]
        ok(api(f"/tasks/{t['id']}", "PATCH", {"assignee": aid}, token=host))
        ok(api(f"/tasks/{t['id']}", "PATCH", {"status": "done"}, token=host))
        wait_until(lambda: said(host, "finished **Add coins**"), 10, "done posted")

        # the @ picker in the chat box
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            c = b.new_context(viewport={"width": 1300, "height": 860}); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Camp', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{host}'}}}})) }} catch (e) {{}}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMentions", timeout=15000)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-input", state="visible")
            pg.click("#chat-input"); pg.keyboard.type("@my")
            pg.wait_for_selector("#mention-pop .mn-opt")
            assert "@my-claude" in pg.inner_text("#mention-pop")
            pg.keyboard.press("Enter")
            assert pg.input_value("#chat-input") == "@my-claude "
            # Settings › Agents in chat for the host
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#pa-on", state="attached"); pg.evaluate("document.querySelector('#set-more').open = true"); pg.wait_for_selector("#pa-on")
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_pubagents")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
