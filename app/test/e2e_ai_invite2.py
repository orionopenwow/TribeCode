"""Bring an AI helper (app/ui/inviteagent.js, server/inviteagent.js): the one journey for bringing your own AI in.

UI   a person who never connected an AI gets the question first ("Which AI do you already use?") with nothing chosen
     for them: twelve tools, plus a model on this computer, a free one and "I don't have one" (none of which dead-ends).
     Every tool shows its own short steps and the one thing to copy, with the key masked. Three plain choices say what
     it may do; the choice made before Copy is what the helper starts with. A fake MCP agent connects: "Waiting for
     your Cursor to say hello…" becomes a welcome with a first job; the job lands in the private panel, the agent reads
     it and answers there. Coming back: "Show me the setup again" is the main action and it stays the same helper.
     390px: the question fits, nothing is cut off. Screenshots: docs/screenshots/ai-helper-*.png.
API  the three choices are only sets of the existing permissions. The key is shown once (never in GET, never to another
     member, only its hash on disk). A helper can never change what it may do: not over HTTP, not through MCP.
Usage: python3 app/test/e2e_ai_invite2.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import json, os, re, subprocess, tempfile, time, urllib.error, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 9440 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []
ALL = ["chat", "docs", "tasks", "files", "website", "approvals"]
PICKS = ["code", "desktop", "web", "cursor", "codex", "chatgpt", "gemini", "vscode", "windsurf", "cline", "zed", "other"]


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"{}")
        except Exception: return e.code, {"raw": b[:200]}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


_rid = [0]
def mcp(token, method, params=None):
    _rid[0] += 1
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": _rid[0], "method": method, "params": params or {}}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def tool(token, name, args=None):
    st, j = mcp(token, "tools/call", {"name": name, "arguments": args or {}})
    if st != 200: return False, f"HTTP {st}"
    res = j.get("result") or {}
    return not res.get("isError"), "".join(c.get("text", "") for c in res.get("content", []))


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ai2-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = tmp / "server.log"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(log, "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.grant_permissions(["clipboard-read", "clipboard-write"])
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Campw', onboarded: true, tour: {done: true}})) } catch (e) {}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInviteAgent && window.TribeAskAgent", timeout=20000)
            htok = pg.evaluate("TribeStore.get().server.token")
            body = "#invite-modal:not(.hidden) #ic-body"

            # ---- 1. a newcomer: the question first, nothing chosen, nothing made
            pg.evaluate("TribeInviteAgent.open()"); pg.wait_for_selector(f"{body} .ic-kinds.ic-big")
            assert pg.text_content(f"{body} .ic-qt") == "Which AI do you already use?"
            assert pg.locator(f"{body} [data-ic-kind].on").count() == 0 and pg.locator(f"{body} .ic-steps").count() == 0, "nothing is chosen for a newcomer"
            assert pg.eval_on_selector_all(f"{body} .ic-kinds [data-ic-kind]", "els => els.map(e => e.dataset.icKind)") == PICKS
            assert pg.eval_on_selector_all(f"{body} [data-ic-alt]", "els => els.map(e => e.dataset.icAlt)") == ["local", "free", "none"]
            words = pg.inner_text(body)
            for jargon in ("MCP", "CLI key", "API key", "stdio", "token"): assert jargon not in words, f"the question says {jargon}"
            assert ok(api("/invite-agent", token=htok))["agents"] == [], "opening the sheet makes nothing"
            pg.screenshot(path=str(SHOTS / "ai-helper-question.png"))
            print("Newcomer: the question, 12 tools + 3 other answers, nothing chosen or made")

            # ---- 2. the three answers that are not a tool: none dead-ends
            for alt, n in (("local", 1), ("free", 2), ("none", 3)):
                pg.click(f"{body} [data-ic-alt='{alt}']"); pg.wait_for_selector(f"{body} [data-ic-altpane='{alt}']")
                assert pg.locator(f"{body} .ic-opt [data-ic-go]").count() == n, (alt, n)
                if alt == "none":
                    assert pg.eval_on_selector_all(f"{body} [data-ic-go]", "els => els.map(e => e.dataset.icGo)") == ["flint", "brain", "bridge"]
                    pg.screenshot(path=str(SHOTS / "ai-helper-none.png"))
                pg.click(f"{body} #ic-back"); pg.wait_for_selector(f"{body} .ic-kinds.ic-big")
            pg.click(f"{body} [data-ic-alt='free']"); pg.click(f"{body} [data-ic-go='bridge']")
            pg.wait_for_function("document.body.classList.contains('aib-open')"); pg.evaluate("TribeAIBridge.close()")
            print("A model on this computer, a free one, I don't have one: each leads somewhere real")

            # ---- 3. every tool: its own short steps and the one thing to copy, key masked
            pg.evaluate("TribeInviteAgent.open()"); pg.wait_for_selector(f"{body} .ic-kinds.ic-big")
            for k in PICKS:
                pg.evaluate("k => document.querySelector(`#ic-body .ic-kinds [data-ic-kind='${k}']`).click()", k); pg.wait_for_selector(f"{body} [data-ic-kind='{k}'].on")
                if pg.locator(f"{body} .ic-need").count():   # an app in the cloud needs a public address first: it says so
                    assert k in ("web", "chatgpt") and "public" in pg.text_content(f"{body} .ic-need"), k; continue
                n = pg.locator(f"{body} .ic-steps > li").count(); assert 2 <= n <= 4, (k, n)
                first = pg.text_content(f"{body} .ic-setup [data-ic-text]"); assert f"localhost:{PORT}/mcp" in first or "tribecode" in first, (k, first[:80])
                assert "••••" in pg.inner_text(f"{body} .ic-setup") or k in ("web", "chatgpt"), f"{k}: the key is masked until Copy"
                assert pg.locator(f"{body} #ic-want [data-ic-preset]").count() == 3 and "to say hello" not in pg.inner_text(body), k
            assert ok(api("/invite-agent", token=htok))["agents"] == [], "looking at every tool makes nothing"
            print("Each of the 12 tools shows 2-4 steps and its copy block; still nothing made")

            # ---- 4. what it may do: chosen before Copy, it is what the helper starts with
            pg.evaluate("document.querySelector(\"#ic-body .ic-kinds [data-ic-kind='cursor']\").click()"); pg.wait_for_selector(f"{body} [data-ic-kind='cursor'].on")
            assert pg.get_attribute(f"{body} #ic-want .ic-preset.on", "data-ic-preset") == "build", "a new helper starts with Help build"
            # the chosen tool is one row; the cards are tucked away, and Change goes back to the question
            assert "Cursor" in pg.text_content(f"{body} #ic-chosen") and not pg.is_visible(f"{body} .ic-kinds") and pg.locator(f"{body} .ic-kinds [data-ic-kind]").count() == 12
            pg.click(f"{body} #ic-change"); pg.wait_for_selector(f"{body} .ic-kinds.ic-big [data-ic-kind='cursor'].on"); assert pg.text_content(f"{body} .ic-qt") == "Which AI do you already use?"
            pg.click(f"{body} .ic-kinds.ic-big [data-ic-kind='cursor']"); pg.wait_for_selector(f"{body} #ic-chosen")
            assert "never above your own role" in pg.inner_text(body)
            pg.click(f"{body} #ic-want [data-ic-preset='answer']"); pg.wait_for_selector(f"{body} #ic-want [data-ic-preset='answer'].on")
            pg.screenshot(path=str(SHOTS / "ai-helper-setup.png"))
            pg.click(f"{body} [data-ic-copy]"); pg.wait_for_selector(f"{body} .ic-wait")
            assert "Waiting for your Cursor to say hello" in pg.text_content(f"{body} .ic-wait")
            key = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", pg.text_content(f"{body} .ic-setup [data-ic-text]")).group(1)
            v = ok(api("/invite-agent", token=htok)); cur = v["agents"][0]; cid = cur["id"]
            assert cur["agentKind"] == "cursor" and cur["scopes"] == ["chat"] and cur["preset"] == "answer", cur
            assert [(x["id"], sorted(x["scopes"])) for x in v["presets"]] == [("answer", ["chat"]), ("build", sorted(["chat", "docs", "tasks", "files", "approvals"])), ("own", sorted(ALL))]
            print("Just answer me = chat only, set at the moment the helper is made")

            # ---- 5. a fake agent connects: hello, the welcome, a first job in the private panel
            st, j = mcp(key, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "cursor-vscode", "version": "1"}}); assert st == 200, j
            pg.wait_for_selector(f"{body} #ic-welcome", timeout=10000)
            assert "Campw's Cursor" in pg.text_content(f"{body} #ic-welcome .ic-wt b") and pg.locator(f"{body} [data-ic-job]").count() == 3
            assert pg.text_content(f"{body} .ic-about").startswith("Good at") and pg.locator(f"{body} .ic-day li.done").count() == 1
            assert "joined" in pg.text_content(f"{body} #ic-status")
            good, txt = tool(key, "write_doc", {"name": "x", "content": "y"}); assert not good, "chat only: no docs"
            pg.screenshot(path=str(SHOTS / "ai-helper-welcome.png"))
            pg.click(f"{body} [data-ic-job='intro']"); pg.wait_for_selector("#invite-modal:not(.hidden) #aa-mine")
            pg.wait_for_function("document.querySelector('#aa-mine').textContent.includes('Introduce yourself here')", timeout=10000)
            good, txt = tool(key, "check_messages"); assert good and "Introduce yourself here" in txt, txt[:300]
            good, txt = tool(key, "reply", {"text": "Hello Campw. I am good at editing code, and I can tidy the README today."}); assert good, txt
            pg.wait_for_function("document.querySelector('#aa-mine').textContent.includes('tidy the README')", timeout=10000)
            pg.screenshot(path=str(SHOTS / "ai-helper-first-job.png"))
            pg.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            print("Hello → welcome → first job → the private panel shows the ask and the answer")

            # ---- 6. coming back: the same helper, setup again is the main action; the presets change what it may do
            pg.evaluate("TribeInviteAgent.open()"); pg.wait_for_selector(f"{body} #ic-new")
            assert pg.get_attribute(f"{body} [data-ic-kind].on", "data-ic-kind") == "cursor", "a returning person lands on the helper they have"
            assert pg.text_content(f"{body} #ic-new") == "Show me the setup again" and "primary" in pg.get_attribute(f"{body} #ic-new", "class")
            assert pg.locator(f"{body} .ic-day li.done").count() == 2, "the first job is ticked"
            pg.click(f"{body} #ic-access [data-ic-preset='build']"); pg.wait_for_selector(f"{body} #ic-access [data-ic-preset='build'].on")
            cur = ok(api("/invite-agent", token=htok))["agents"][0]; assert sorted(cur["scopes"]) == sorted(["chat", "docs", "tasks", "files", "approvals"]) and cur["preset"] == "build", cur
            assert pg.eval_on_selector_all(f"{body} #ic-access [data-ic-scope]:checked", "els => els.map(e => e.dataset.icScope)") == ["chat", "docs", "tasks", "files", "approvals"]
            pg.click(f"{body} #ic-new"); pg.click(f"{body} [data-ic-copy]"); time.sleep(0.6)
            key2 = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", pg.text_content(f"{body} .ic-setup [data-ic-text]")).group(1)
            v = ok(api("/invite-agent", token=htok)); assert [a["id"] for a in v["agents"]] == [cid] and key2 != key, "reconnecting reuses the one helper"
            assert mcp(key, "initialize", {})[0] == 401 and mcp(key2, "initialize", {"protocolVersion": "2025-06-18"})[0] == 200
            assert sorted(v["agents"][0]["scopes"]) == sorted(["chat", "docs", "tasks", "files", "approvals"]), "a new key keeps what it may do"
            print("Returning: Show me the setup again, same helper, new key, same permissions")

            # ---- 6b. the default: a helper made from the sheet with nothing touched is "Help build"; a pending approval shows as "waiting for your OK"
            pg.click(f"{body} #ic-change"); pg.click(f"{body} .ic-kinds.ic-big [data-ic-kind='gemini']"); pg.wait_for_selector(f"{body} #ic-want [data-ic-preset='build'].on")
            pg.click(f"{body} [data-ic-copy]"); pg.wait_for_selector(f"{body} .ic-wait")
            gkey = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", pg.text_content(f"{body} .ic-setup [data-ic-text]")).group(1)
            gem = [a for a in ok(api("/invite-agent", token=htok))["agents"] if a["agentKind"] == "gemini"][0]
            assert gem["preset"] == "build" and "website" not in gem["scopes"], gem
            assert mcp(gkey, "initialize", {"protocolVersion": "2025-06-18"})[0] == 200
            good, txt = tool(gkey, "request_approval", {"title": "Rename the main file", "details": "It would be clearer.", "risk": "low"}); assert good, txt
            gem = [a for a in ok(api("/invite-agent", token=htok))["agents"] if a["agentKind"] == "gemini"][0]; assert gem["doing"] == "waiting for your OK", gem
            pg.wait_for_function("(document.querySelector('#ic-body .ic-doing') || {}).textContent === 'waiting for your OK'", timeout=10000)
            aid = [a for a in ok(api("/approvals", token=htok))["approvals"] if a["status"] == "pending"][0]["id"]
            ok(api(f"/approvals/{aid}/approve", "POST", {}, token=htok))
            gem = [a for a in ok(api("/invite-agent", token=htok))["agents"] if a["agentKind"] == "gemini"][0]; assert gem["doing"] != "waiting for your OK", gem
            ok(api("/invite-agent?id=" + gem["id"], "DELETE", token=htok))
            pg.evaluate("TribeInviteAgent.close()"); pg.evaluate("TribeInviteAgent.open({ kind: 'cursor' })"); pg.wait_for_selector(f"{body} #ic-access")
            print("Default = Help build; a pending approval reads 'waiting for your OK' and clears when answered")

            # ---- 7. its face: an about line and a colour, on its People card
            ok(api("/invite-agent", "PUT", {"id": cid, "about": "Tidies <b>code</b> and writes tests.", "color": "#6C7CFF"}, token=htok))
            assert api("/invite-agent", "PUT", {"id": cid, "color": "red"}, token=htok)[0] == 400
            me = [m for m in ok(api("/members", token=htok))["members"] if m["id"] == cid]
            assert len(me) == 1 and me[0]["about"] == "Tidies bcode/b and writes tests." and me[0]["color"] == "#6C7CFF" and me[0]["doing"], me[0]

            # ---- 8. phone: the question fits
            pg.evaluate("TribeInviteAgent.close()"); pg.set_viewport_size({"width": 390, "height": 844})
            pg.evaluate("TribeInviteAgent.open({ kind: 'ask' })"); pg.wait_for_selector(f"{body} .ic-kinds.ic-big")
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth") and pg.evaluate("[...document.querySelectorAll('#ic-body [data-ic-kind], #ic-body [data-ic-alt]')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height >= 36; })"), "a choice is cut off or too small at 390"
            pg.screenshot(path=str(SHOTS / "ai-helper-question-390.png"))
            pg.evaluate("document.querySelector(\"#ic-body .ic-kinds [data-ic-kind='cursor']\").click()"); pg.wait_for_selector(f"{body} #ic-welcome")
            assert pg.evaluate("[...document.querySelectorAll('#ic-body .ic-preset, #ic-body [data-ic-job], #ic-body [data-ic-find], #ic-body [data-ic-color]')].every(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.height >= 36; })"), "a control is cut off or too small at 390"
            pg.locator(f"{body} #ic-welcome").scroll_into_view_if_needed(); pg.screenshot(path=str(SHOTS / "ai-helper-welcome-390.png"))
            print("390px: the question and the welcome fit")
            b.close()

        # ---- security 1: the key is shown once, and never to another member
        v = ok(api("/invite-agent", token=htok)); dump = json.dumps(v, ensure_ascii=False)
        assert key2 not in dump and "tokenHash" not in dump and "••••" in dump, "GET never carries the key"
        inv = ok(api("/invites", "POST", {"maxUses": 1, "role": "builder", "project": "tribe"}, token=htok))["invite"]["code"]
        bob = ok(api("/join", "POST", {"code": inv, "name": "Bob"}))["token"]
        for path in ("/invite-agent", "/members", "/agents"):
            st, j = api(path, token=bob); d = json.dumps(j); assert key2 not in d and key not in d and "tokenHash" not in d, f"{path} leaks a key to another member"
        assert ok(api("/invite-agent", token=bob))["agents"] == [], "Bob sees none of Campw's helpers here"
        assert api("/invite-agent", "PUT", {"id": cid, "preset": "own"}, token=bob)[0] == 404 and api("/invite-agent?id=" + cid, "DELETE", token=bob)[0] == 404, "Bob can't change or remove it"
        assert api("/invite-agent", "POST", {"id": cid}, token=bob)[0] == 404, "Bob can't re-key it"
        store = "".join(f.read_text(errors="ignore") for f in (tmp / "tribe").rglob("*.json")); assert key2 not in store, "only the hash is stored"
        assert key2 not in log.read_text(errors="ignore"), "no key in the server log"
        print("Security: the key is shown once; not in GET, not to Bob, not on disk, not in the log")

        # ---- security 2: a helper can never raise its own permissions
        before = ok(api("/invite-agent", token=htok))["agents"][0]
        for body_ in ({"preset": "own"}, {"scopes": ALL}, {"adminAsMe": True}, {"paused": False}, {"id": cid, "preset": "own"}):
            assert api("/invite-agent", "PUT", body_, token=key2)[0] == 403, body_
        assert api("/invite-agent", "POST", {"kind": "cursor"}, token=key2)[0] == 403 and api("/invite-agent", "GET", token=key2)[0] == 403
        assert api("/invite-claude", "PUT", {"scopes": ALL}, token=key2)[0] == 403
        good, txt = tool(key2, "tribe_api", {"method": "PUT", "path": "/api/invite-agent", "body": {"preset": "own", "adminAsMe": True}}); assert not good or "403" in txt or "people only" in txt or "Not available" in txt, txt[:200]
        for path in ("/invites", "/agents"): assert api(path, "POST", {}, token=key2)[0] == 403, path
        after = ok(api("/invite-agent", token=htok))["agents"][0]
        assert after["scopes"] == before["scopes"] and after["adminAsMe"] is False and after["preset"] == "build", after
        good, txt = tool(key2, "site_get");
        st, _ = api("/projects/tribe/site", "PUT", {}, token=key2); assert st in (403, 404), f"website is off for 'Help build': {st}"
        assert api("/invite-agent", "PUT", {"id": cid, "preset": "nope"}, token=htok)[0] == 400
        print("Security: a helper can't widen its own access over HTTP or MCP; nothing changed")
        assert not errors, errors
        print("OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
