"""Any LLM (feat/any-llm): bring any coding agent, pick Flint's brain, and build without an AI of your own.
  1. Agents Hub › Your agents: Codex CLI, Gemini CLI, Qwen Code, Cursor and Any MCP client cards render their exact
     command/config with a real minted key (the key works on /mcp). Maya's "Connect your AI" › Codex: a fake MCP client
     connecting with an Authorization: Bearer header flips "Waiting for it to connect…" to "Connected · Maya's Codex".
  2. The provider layer (server/llm.js): the host points "custom OpenAI-compatible" at a tiny local fake that streams a
     chat completion; Flint answers through it with "via tiny-model (custom)". The key never shows up in anything a member
     gets (API responses, /api/health, the WebSocket); non-hosts can't read or set it; a friend's Flint works through the
     host's proxy when allowed, gets 403 when it's off, and 403 again past the daily cap.
  3. Built in (WebLLM): the WebGPU check shows the friendly fallback when headless Chrome has no adapter (no download).
  4. Ask an agent: Maya queues a request; an agent sees it in my_lane and takes it with take_handoff over MCP.
  5. Phone at 390px: Settings and Flint's brain fit. No console errors anywhere.
Usage: python app/test/e2e_any_llm.py [--shots]   (--shots writes docs/screenshots/any-llm-*.png)
"""
import json, os, re, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4999 + OFF
FAKE = PORT + 700
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
KEY = "sk-test-SECRET-key-0123456789abcdef"
errors, seen_auth = [], []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


class FakeOpenAI(BaseHTTPRequestHandler):   # a tiny OpenAI-compatible server: streams one chat completion
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        seen_auth.append(self.headers.get("Authorization"))
        if not self.path.endswith("/chat/completions"): self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for t in ["<think>hmm</think>Dragons ", "hoard ", "semicolons."]:
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": t}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.05)
        self.wfile.write(b"data: [DONE]\n\n")


def api(path, method="GET", body=None, token=None, raw=False, headers=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **(headers or {})}
    req = urllib.request.Request(BASE + path if path.startswith("/mcp") else BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read().decode()
            return r.status, (data if raw else json.loads(data or "{}")), dict(r.headers)
    except urllib.error.HTTPError as e:
        data = e.read().decode()
        try: return e.code, json.loads(data or "{}"), dict(e.headers)
        except Exception: return e.code, data, dict(e.headers)

def mcp(token, method, params=None):
    st, d, _ = api("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}, token=token)
    assert st == 200, (st, d); return d

def tool(token, name, args=None):
    r = mcp(token, "tools/call", {"name": name, "arguments": args or {}})["result"]
    return r.get("isError", False), r["content"][0]["text"]

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{who} console: {m.text[:200]}"))

def page_for(b, name, token, hook=None, **ctx):
    c = b.new_context(**(ctx or {"viewport": {"width": 1440, "height": 900}}))
    c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', server: {{url: '{BASE}', token: '{token}'}}}}))")
    pg = c.new_page(); watch(pg, name)
    if hook: hook(pg)
    pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=15000)
    return pg

def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-anyllm-")
    fake = ThreadingHTTPServer(("127.0.0.1", FAKE), FakeOpenAI); threading.Thread(target=fake.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        st, boot, _ = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, boot
        htok = boot["token"]
        st, inv, _ = api("/invites", "POST", {"maxUses": 5}, token=htok)
        st, maya, _ = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Maya"}); assert st == 200, maya
        mtok = maya["token"]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = page_for(b, "Orion", htok)

            # ---------- 1. Your agents: a card per tool, each with a real minted key ----------
            host.evaluate("TribeAgentsHub.open()")
            host.wait_for_selector("#view-agents-hub:not(.hidden) .ah-tile[data-connect='codex']", timeout=15000)
            tiles = host.eval_on_selector_all(".ah-tile", "els => els.map(e => e.dataset.connect)")
            assert tiles == ["claude-code", "codex", "gemini", "qwen", "cursor", "claude-desktop", "mcp"], tiles
            expect = {"codex": "[mcp_servers.tribecode]", "gemini": "gemini mcp add -s user -t http -H \"Authorization: Bearer ", "qwen": "qwen mcp add --scope user --transport http tribecode",
                      "cursor": "\"mcpServers\"", "mcp": "Authorization: Bearer "}
            for kind, frag in expect.items():
                host.click(f".ah-tile[data-connect='{kind}']")
                if kind == "mcp": host.click("#ah-form button[type=submit]")
                host.wait_for_function("k => { const r = document.querySelector('#ah-connect .ah-result .cai-pre'); return r && document.querySelector('.ah-tile.on') && document.querySelector('.ah-tile.on').dataset.connect === k; }", arg=kind, timeout=10000)
                text = "\n".join(host.eval_on_selector_all("#ah-connect .cai-pre", "els => els.map(e => e.textContent)"))
                assert frag in text, (kind, text)
                m = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", text); assert m, (kind, text)
                init = mcp(m.group(1), "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": kind, "version": "1"}})
                assert "result" in init, (kind, init)
                assert host.locator("#ah-status").count() == 1 and "connect" in host.text_content("#ah-status").lower()
                if kind == "codex":
                    assert "Orion's Codex" in host.text_content("#ah-connect"), host.text_content("#ah-connect")
                    if take: host.evaluate("document.querySelector('#ah-connect').scrollIntoView({block: 'end'})"); host.wait_for_timeout(300); host.screenshot(path=str(SHOTS / "any-llm-agents.png"))
            names = [a["name"] for a in api("/agents/mine", token=htok)[1]["agents"]]
            for n in ["Orion's Codex", "Orion's Gemini", "Orion's Qwen", "Orion's Cursor"]: assert n in names, names

            # ---------- Maya: Connect your AI › Codex, a fake MCP client with a Bearer header -> connected live ----------
            ws_frames = []
            mp = page_for(b, "Maya", mtok, hook=lambda pg: pg.on("websocket", lambda ws: ws.on("framereceived", lambda f: ws_frames.append(f if isinstance(f, str) else str(f)))))
            bodies = []
            def grab(r):
                if "/api/" in r.url:
                    try: bodies.append(r.text())
                    except Exception: pass
            mp.on("response", grab)
            mp.evaluate("TribeApp.connectClaude({ fresh: true })")
            mp.wait_for_selector("#invite-modal:not(.hidden) #ic-body #ic-other", timeout=10000); mp.click("#ic-other")   # feat/invite-one: a Claude joins from the one invite sheet; the other tools are one link away
            mp.wait_for_selector("#invite-body .cai-chip[data-cai-tool='codex']", timeout=10000)
            assert "Connect your AI" in mp.text_content("#invite-body h2")
            mp.click("#invite-body .cai-chip[data-cai-tool='codex']")
            mp.wait_for_selector("#cc-setup .cai-pre", timeout=10000)
            cfg = mp.text_content("#cc-setup .cai-pre")
            assert "[mcp_servers.tribecode]" in cfg and 'http_headers = { "Authorization" = "Bearer ' in cfg, cfg
            mkey = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", cfg).group(1)
            wait_text(mp, "#cc-status", "Waiting for it to connect")
            init = mcp(mkey, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "codex-mcp-client", "version": "0.1"}})
            assert "Maya's Codex" in json.dumps(init), init
            wait_text(mp, "#cc-status", "Connected · Maya's Codex", 15000)
            if take: mp.screenshot(path=str(SHOTS / "any-llm-connect.png"))
            err, txt = tool(mkey, "claim_file", {"path": "src/menu.js", "note": "pause menu"}); assert not err, txt
            assert any(c["name"] == "Maya's Codex" for c in api("/claims", token=htok)[1]["claims"]), "Maya's Codex claims files like Claude"
            mp.click("#invite-body [data-close]")

            # ---------- 2. the provider layer: custom OpenAI-compatible -> the fake ----------
            st, d, _ = api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{FAKE}/v1", "model": "tiny-model", "key": KEY}, token=mtok)
            assert st == 403, "friends can't set the key"
            assert api("/llm/test", "POST", {}, token=mtok)[0] == 403
            st, d, _ = api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{FAKE}/v1", "model": "tiny-model", "key": KEY, "friends": True, "cap": 3}, token=htok)
            assert st == 200 and d["ready"] and d["hasKey"] and KEY not in json.dumps(d), d
            secret = Path(tmp) / "tribe" / ".tribe" / "secrets" / "llm.json"
            assert secret.exists() and (secret.stat().st_mode & 0o777) == 0o600, oct(secret.stat().st_mode)
            st, t, _ = api("/llm/test", "POST", {}, token=htok); assert t["ok"] and t["via"] == "tiny-model (custom)", t
            assert seen_auth[-1] == "Bearer " + KEY
            # Flint on the host's desktop: the reply streams through it, with "via …"
            host.evaluate("TribeApp.show('chat')")
            host.wait_for_selector("#flint #fl-input", state="visible", timeout=10000)
            host.evaluate("TribeFlint.clear && TribeFlint.clear()")
            host.fill("#fl-input", "tell me a joke about dragons"); host.press("#fl-input", "Enter")
            # polish: the provider was set through the API (not this device's brain picker), so the device asks once first
            host.wait_for_selector("#ai-consent", timeout=10000); assert "Send this to" in host.inner_text("#ai-consent"); host.click("#aic-yes")
            host.wait_for_function("() => [...document.querySelectorAll('#flint .fl-msg.fl')].some(m => m.textContent.includes('Dragons hoard semicolons.') && m.querySelector('.fl-via'))", timeout=15000)
            via = host.locator("#flint .fl-msg.fl .fl-via").last.text_content()
            assert via == "via tiny-model (custom)", via
            assert "hmm" not in host.text_content("#flint .fl-thread"), "<think> is stripped"
            wait_text(host, "#flint [data-flst]", "the host's AI")
            if take: host.screenshot(path=str(SHOTS / "any-llm-flint.png"))
            # a friend's Flint goes through the host's proxy
            st, text, hd = api("/flint/ask", "POST", {"text": "hi"}, token=mtok, raw=True)
            assert st == 200 and text == "Dragons hoard semicolons." and "tiny-model" in hd.get("X-Flint-Via", ""), (st, text, hd)
            # what a member can see never holds the key
            st, view, _ = api("/llm", token=mtok)
            assert st == 200 and "providers" not in view and "hasKey" not in view and "baseUrl" not in view and view["via"] == "tiny-model (custom)", view
            for path in ["/llm", "/health", "/flint", "/members", "/agents/hub", "/me"]:
                st, d, _ = api(path, token=mtok, raw=True); assert KEY not in d and "SECRET" not in d, path
            st, d, _ = api("/llm", token=htok, raw=True); assert KEY not in d, "not even the host gets it back"
            # Maya's browser: open Settings › Flint's brain, then check every response and WebSocket frame
            mp.evaluate("TribeSettings.open('ai')")
            mp.wait_for_selector("#set-flintbrain [data-bp-open]", timeout=10000); mp.click("#set-flintbrain [data-bp-open]")
            mp.wait_for_selector("#brain-modal:not(.hidden) [data-bp='host']", timeout=10000)
            wait_text(mp, "#brain-modal", "tiny-model (custom)")
            assert mp.locator("#bp-key").count() == 0 and mp.locator("[data-bp='cloud']").count() == 0, "friends don't see the key form"
            mp.click("#bp-close"); mp.evaluate("TribeSettings.close()")
            mp.wait_for_timeout(500)
            leaked = [x for x in bodies + ws_frames if KEY in x or "SECRET-key" in x]
            assert not leaked and bodies and ws_frames, (len(bodies), len(ws_frames), leaked[:1])
            # the host turns friends off -> 403; on again, past the soft daily cap -> 403
            assert api("/llm", "PUT", {"friends": False}, token=htok)[0] == 200
            st, d, _ = api("/flint/ask", "POST", {"text": "hi again"}, token=mtok); assert st == 403 and d.get("basic"), (st, d)
            st, text, _ = api("/flint/ask", "POST", {"text": "host still works"}, token=htok, raw=True); assert st == 200 and "semicolons" in text
            assert api("/llm", "PUT", {"friends": True, "cap": 1}, token=htok)[0] == 200
            st, d, _ = api("/flint/ask", "POST", {"text": "over the cap"}, token=mtok); assert st == 403 and "limit" in d["error"], (st, d)
            assert api("/llm", "PUT", {"cap": 50}, token=htok)[0] == 200
            # the host's sheet: provider form, key never echoed back
            host.evaluate("TribeBrain.open()")
            host.wait_for_selector("#brain-modal:not(.hidden) [data-bp='cloud'][aria-checked='true']", timeout=10000)
            assert host.input_value("#bp-key") == "" and host.input_value("#bp-provider") == "custom" and host.input_value("#bp-model") == "tiny-model"
            assert KEY not in host.content()

            # ---------- 3. Built in: the WebGPU check (no model download in tests) ----------
            g = host.evaluate("TribeBrain.gpu()")
            if g["ok"]:
                host.click("[data-bp='browser']"); host.wait_for_selector("#bp-load", timeout=5000)
                assert "500 MB" in host.text_content("#brain-modal") or "1 GB" in host.text_content("#brain-modal")
            else:
                wait_text(host, "#bp-gpu", "host's model or a cloud key")
                host.click("[data-bp='browser']")
                assert host.evaluate("TribeBrain.choice()") == "host", "no WebGPU: stays on the host's brain"
            assert not host.evaluate("[...document.scripts].some(s => (s.src || '').includes('web-llm'))"), "WebLLM loads only on opt-in"
            if take: host.screenshot(path=str(SHOTS / "any-llm-brain.png"))
            host.click("#bp-close")

            # ---------- 4. Ask an agent: queued for the next agent, taken over MCP ----------
            mp.evaluate("TribeAskAgent.open({ text: 'Add a pause menu with resume and quit' })")
            # Maya has an agent of her own (step 1), so Ask an agent opens her private panel (chat-for-people); the tribe's queue is the API's
            mp.wait_for_selector("#aa-send"); assert mp.locator("#aa-mine").count() == 1, "with an agent of your own, asking is private"
            mp.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            r3 = api("/coord/asks", "POST", {"text": "Add a pause menu with resume and quit"}, token=mtok); assert r3[0] == 200, r3
            asks = api("/coord/asks", token=htok)[1]["asks"]; assert asks and asks[0]["title"] == "Add a pause menu with resume and quit" and asks[0]["status"] == "open", asks
            hid = asks[0]["id"]
            err, lane = tool(mkey, "my_lane"); assert hid in lane, lane
            err, txt = tool(mkey, "take_handoff", {"id": hid}); assert not err and "Add a pause menu" in txt, txt
            assert api("/coord/asks", token=mtok)[1]["asks"][0]["status"] == "taken"
            wait_text(host, "#chat-list", "picked up Maya's request", 10000)
            err, txt = tool(mkey, "take_handoff", {"id": hid, "done": True}); assert not err, txt
            # the Requests view lists it; the composer "+" menu offers it
            mp.evaluate("TribeApp.show('requests')"); mp.wait_for_selector("#pj-asks", timeout=10000); wait_text(mp, "#pj-asks", "Add a pause menu")
            mp.evaluate("TribeApp.show('chat')"); mp.wait_for_timeout(300)
            mp.evaluate("TribePlus.open(document.querySelector('#chat-input'))"); mp.wait_for_selector(".pl-item[data-pl='askagent']"); mp.keyboard.press("Escape")
            mp.evaluate("document.querySelector('.pl-scrim') && document.querySelector('.pl-scrim').click()")

            # ---------- 5. phone 390: Settings and Flint's brain fit ----------
            ph = b.new_context(**PHONE).new_page(); watch(ph, "phone")
            ph.goto(f"{BASE}/join/{inv['invite']['code']}")
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Jay"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet"); ph.click("#ins-later")
            ph.wait_for_function("TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeSettings.open('ai')"); ph.wait_for_selector("#set-flintbrain [data-bp-open]", timeout=10000)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Settings: sideways scroll"
            assert ph.evaluate("document.querySelector('#settings-body').scrollWidth <= document.querySelector('#settings-body').clientWidth + 1")
            ph.click("#set-flintbrain [data-bp-open]"); ph.wait_for_selector("#brain-modal:not(.hidden) [data-bp='none']")
            box = ph.locator("#brain-body").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 391, box
            assert ph.evaluate("document.querySelector('#brain-body').scrollWidth <= document.querySelector('#brain-body').clientWidth + 1"), "brain sheet: sideways scroll"
            if take: ph.screenshot(path=str(SHOTS / "any-llm-phone-brain.png"))
            ph.click("[data-bp='none']"); assert ph.evaluate("TribeBrain.choice()") == "none"
            b.close()
    finally:
        srv.terminate(); fake.shutdown()
    bad = errors
    if bad: print("\n".join(bad)); sys.exit(1)
    print("e2e_any_llm: OK")

if __name__ == "__main__":
    main()
