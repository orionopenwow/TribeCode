"""Invite your agent (server/inviteagent.js, app/ui/inviteagent.js): Claude, Cursor, Codex, ChatGPT, Gemini and more.

UI   the sheet opens from every entry point (sidebar row, People panel, Invite friends, a project's invite sheet, the
     empty chat, Flint); the picker lists every agent and each one's setup carries this tribe's /mcp URL with the key
     masked until Copy; Claude Code's command and the Desktop config carry the key; a Claude connecting over MCP turns
     "Waiting for your Claude…" into "✓ Campw's Claude joined". A Cursor does the same under its own name and glyph,
     says hello in chat and shows in People with the AI badge and "invited by Campw". Flint opens the sheet on the kind
     you name. 390px. Screenshots: docs/screenshots/invite-agent.png, invite-agent-joined.png.
API  every kind's setup has the right URL and a key of its own; one of each kind per person (asking twice re-keys the
     same member); two kinds coexist with separate access; "Something else" can be renamed. An agent of any kind can do
     what its person can and nothing more: a builder's can't do admin, nobody's reads DMs (not even its own person's),
     a project-only friend's can't touch another project; the host's can't do admin either until "Let it act as me for
     admin" is ticked. Narrowing, Pause, Remove and a role downgrade take effect at once. An @mention reaches
     inbox_next. Rate limits apply. No key in logs. A sign-in from an app registered as another product becomes that
     kind. An invited Claude from before kinds existed migrates as kind "claude" with nothing lost.
     The old names keep answering: /api/invite-claude, TribeInviteClaude, who: 'claude'.
Usage: python3 app/test/e2e_invite_agent.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, json, os, re, secrets, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6730 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
RATE = 60
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
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
def raw(path, method="GET", form=None, body=None):
    """A plain request that does not follow redirects: (status, json-or-{}, headers)."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    data = urllib.parse.urlencode(form).encode() if form is not None else json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/x-www-form-urlencoded"} if form is not None else {"Content-Type": "application/json"}
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=h)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r: b = r.read(); return r.status, (json.loads(b) if b[:1] in (b"{", b"[") else {}), dict(r.headers)
    except urllib.error.HTTPError as e:
        b = e.read(); return e.code, (json.loads(b) if b[:1] in (b"{", b"[") else {}), dict(e.headers)


def sign_in(client_name, person_token, redirect="https://app.example.com/oauth/callback"):
    """The whole sign-in an app does: register under a name, authorize with PKCE, the person approves, the code becomes a token."""
    st, reg, _ = raw("/connect/register", "POST", body={"client_name": client_name, "redirect_uris": [redirect]}); assert st == 201, (st, reg)
    ver = secrets.token_urlsafe(48); ch = base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()
    q = urllib.parse.urlencode({"response_type": "code", "client_id": reg["client_id"], "redirect_uri": redirect, "code_challenge": ch, "code_challenge_method": "S256", "state": "s1"})
    st, _, hd = raw("/connect/authorize?" + q); assert st == 302 and hd["Location"].startswith("/agent-consent.html#rid="), (st, hd.get("Location"))
    rid = hd["Location"].split("rid=")[1]
    st, ask, _ = raw("/connect/request?rid=" + rid); assert st == 200, ask
    done = ok(api("/agent-auth", "POST", {"rid": rid, "allow": True}, token=person_token), "approve")
    code = urllib.parse.parse_qs(urllib.parse.urlparse(done["redirect"]).query)["code"][0]
    st, tok, _ = raw("/connect/token", "POST", form={"grant_type": "authorization_code", "code": code, "client_id": reg["client_id"], "redirect_uri": redirect, "code_verifier": ver}); assert st == 200, tok
    return ask, done, tok["access_token"]


def mcp(token, method, params=None):
    _rid[0] += 1
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": _rid[0], "method": method, "params": params or {}}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def tool(token, name, args=None):
    """(ok, text) for a tools/call; ok False on an HTTP error or isError."""
    st, j = mcp(token, "tools/call", {"name": name, "arguments": args or {}})
    if st != 200: return False, f"HTTP {st}"
    res = j.get("result") or {}
    txt = "".join(c.get("text", "") for c in res.get("content", []))
    return not res.get("isError"), txt


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ic-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_CLAUDE_RATE": str(RATE), "NO_PROXY": "127.0.0.1,localhost"}
    log = tmp / "server.log"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(log, "w"), stderr=subprocess.STDOUT, env=env)
    keys = []
    try:
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1360, "height": 860}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Campw', onboarded: true, tour: {done: true}})) } catch (e) {}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInviteAgent && window.TribeInviteClaude", timeout=20000)
            htok = pg.evaluate("TribeStore.get().server.token"); host_id = pg.evaluate("TribeClient.state().me.id")
            pg.evaluate("localStorage.removeItem('tribecode.inviteclaude.kind')")
            shut = lambda: pg.evaluate("TribeInviteClaude.close()")   # the first name of TribeInviteAgent still works
            opened = lambda: pg.wait_for_selector("#invite-modal:not(.hidden) #ic-body #ic-status", timeout=10000)   # the one invite sheet, on Your AI agent
            on_pick = lambda k: pg.wait_for_selector(f"#invite-modal:not(.hidden) #ic-body [data-ic-kind='{k}'].on", timeout=10000)

            # ---------- the sheet from the sidebar row ----------
            assert "Invite your agent" in pg.text_content("#sf-claude")
            pg.click("#sf-claude"); opened()
            assert pg.evaluate("TribeInvite.state().who") == "agent" and "Your AI agent" in pg.text_content("#io-who-agent")
            pg.wait_for_selector("#ic-body [data-ic-text='code']")
            # the picker: every agent, each with a glyph of its kind
            picks = pg.eval_on_selector_all("#ic-body [data-ic-kind]", "els => els.map(e => [e.dataset.icKind, e.dataset.icFamily, e.textContent.trim(), !!e.querySelector('svg')])")
            assert [x[0] for x in picks] == ["code", "desktop", "web", "cursor", "codex", "chatgpt", "gemini", "vscode", "windsurf", "cline", "zed", "other"], picks
            assert all(x[3] for x in picks) and picks[3][2] == "Cursor" and picks[-1][2] == "Something else", picks
            # each one's setup: numbered steps, this tribe's /mcp address, the key masked, one line on how it behaves
            for k, fam, name, _ in picks:
                pg.click(f"#ic-body [data-ic-kind='{k}']"); on_pick(k)
                if k in ("web", "chatgpt"):   # they connect from their maker's cloud: no public address here, so nothing to paste yet
                    assert "public https" in pg.text_content("#ic-body .ic-need") and name.split(" on ")[0] in pg.text_content("#ic-body .ic-need"), k
                    continue
                text = "\n".join(pg.eval_on_selector_all("#ic-body .cai-pre", "els => els.map(e => e.textContent)"))
                assert f":{PORT}/mcp" in text and "••••" in text and not re.search(r"Bearer [A-Za-z0-9_-]{20,}", text), (k, text)
                assert pg.locator("#ic-body .ic-steps li").count() >= 2, k
                beh = pg.text_content("#ic-body .ic-behaves")
                assert ("on its own" in beh) == (k in ("code", "codex", "gemini", "cline")) and ("when you ask it" in beh) == (k not in ("code", "codex", "gemini", "cline")), (k, beh)
                assert "Nothing is made yet" in pg.text_content("#ic-status") and "Campw's " in pg.text_content("#ic-body .lead"), k
            assert "Campw's agent" in pg.text_content("#ic-body .lead") and pg.locator("#ic-bridge").count() == 1, "Something else: the generic setup and the copy-and-paste bridge"
            assert not [x for x in ok(api("/members", token=htok))["members"] if x["role"] == "agent"], "looking at every setup makes nothing"
            pg.click("#ic-body [data-ic-kind='code']"); on_pick("code")
            # nothing is made when the sheet opens: the key is masked and there is no Claude member yet
            assert "••••" in pg.text_content("#ic-body [data-ic-text='code']") and "Nothing is made yet" in pg.text_content("#ic-status")
            assert not [x for x in ok(api("/members", token=htok))["members"] if x["role"] == "agent"], "no Claude before Copy"
            pg.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            pg.click("#ic-body [data-ic-copy='code']")
            pg.wait_for_function("!document.querySelector(\"#ic-body [data-ic-text='code']\").textContent.includes('••••')", timeout=10000)
            cmd = pg.text_content("#ic-body [data-ic-text='code']")
            m = re.match(r'^claude mcp add --transport http tribecode (http://\S+/mcp) --header "Authorization: Bearer ([A-Za-z0-9_-]{20,})"$', cmd.strip())
            assert m, cmd
            assert m.group(1).endswith(f":{PORT}/mcp"), m.group(1)
            key = m.group(2); keys.append(key)
            assert "Waiting for your Claude" in pg.text_content("#ic-status")
            assert "Campw's Claude" in pg.text_content("#ic-body .lead")
            # copy → "Copied — paste it in your terminal"
            pg.wait_for_selector("#ic-body .ic-steps li.now")
            assert "paste it in your terminal" in pg.text_content("#ic-body .ic-steps").lower()
            # Claude Desktop: the config carries the same URL and key, and can be downloaded
            pg.click("#ic-body [data-ic-kind='desktop']")
            cfg = json.loads(pg.text_content("#ic-body [data-ic-text='desktop']"))
            srvc = cfg["mcpServers"]["tribecode"]
            assert srvc["env"]["TRIBE_TOKEN"] == key and srvc["args"][-1] == m.group(1), srvc
            with pg.expect_download() as dl: pg.click("#ic-dl")
            assert dl.value.suggested_filename == "claude_desktop_config.json"
            # Claude on the web: no public https address here, so it explains and offers "Work with friends anywhere"
            pg.click("#ic-body [data-ic-kind='web']")
            assert "public https" in pg.text_content("#ic-body .ic-need") and pg.locator("#ic-public").is_visible()
            pg.click("#ic-body [data-ic-kind='code']")

            # ---------- it connects: joined, hello in chat, People with the AI badge ----------
            st, j = mcp(key, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "claude-code"}})
            assert st == 200 and j["result"]["serverInfo"]["name"] == "tribecode", j
            pg.wait_for_function("document.querySelector('#ic-status') && document.querySelector('#ic-status').textContent.includes(\"Campw's Claude joined\")", timeout=10000)
            msgs = ok(api("/chat/general", token=htok))["messages"]
            hello = [x for x in msgs if "invited by Campw" in (x.get("text") or "")]
            assert hello, [x.get("text") for x in msgs]
            hc_id = hello[0]["by"]
            mem = [x for x in ok(api("/members", token=htok))["members"] if x["id"] == hc_id][0]
            assert mem["role"] == "agent" and mem["invited"] and mem["ownerName"] == "Campw" and mem["name"] == "Campw's Claude", mem
            shut()
            pg.click("#ppl-btn"); pg.wait_for_selector("#ppl-panel:not([hidden])")
            row = pg.locator(f"#ppl-panel .ppl-row[data-mid='{hc_id}']")
            row.wait_for(timeout=10000)
            assert "AI" in row.locator(".ppl-ai").text_content() and "invited by Campw" in row.text_content(), row.text_content()
            assert row.locator(".ppl-ai[data-kind='claude'] svg[data-i='agent-claude']").count() == 1, "the AI badge wears its kind's glyph"
            pg.evaluate("document.getElementById('ppl-close') && document.getElementById('ppl-close').click()")

            # ---------- a second kind: Cursor, next to the Claude ----------
            pg.evaluate("TribeInviteAgent.open({ kind: 'cursor' })"); opened(); on_pick("cursor")
            assert pg.locator("#ic-body [data-ic-family='claude'] .ic-has").count() == 3 and pg.locator("#ic-body [data-ic-kind='cursor'] .ic-has").count() == 0, "a dot on the kinds you have"
            assert "Nothing is made yet" in pg.text_content("#ic-status") and "Campw's Cursor" in pg.text_content("#ic-body .lead")
            assert "Campw's Claude" in pg.text_content("#ic-body .ic-also"), "the other kind is one tap away"
            time.sleep(5)   # let the "Claude joined" toast go
            pg.screenshot(path=str(SHOTS / "invite-agent.png"))
            with pg.expect_download() as dl: pg.click("#ic-dl")   # Download makes it, like Copy
            assert dl.value.suggested_filename == "mcp.json"
            pg.wait_for_function("!document.querySelector(\"#ic-body [data-ic-text='cursor']\").textContent.includes('••••')", timeout=10000)
            ccfg = json.loads(pg.text_content("#ic-body [data-ic-text='cursor']"))["mcpServers"]["tribecode"]
            assert ccfg["url"].endswith(f":{PORT}/mcp") and json.loads(Path(dl.value.path()).read_text())["mcpServers"]["tribecode"] == ccfg, ccfg
            ckey = ccfg["headers"]["Authorization"].split("Bearer ")[1]; keys.append(ckey)
            assert ckey != key and "Waiting for your Cursor" in pg.text_content("#ic-status")
            st, j = mcp(ckey, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "cursor-vscode", "version": "1"}})
            assert st == 200 and "Campw's Cursor" in json.dumps(j), j
            pg.wait_for_function("document.querySelector('#ic-status') && document.querySelector('#ic-status').textContent.includes(\"Campw's Cursor joined\")", timeout=10000)
            # opened again: it is here, with its own checkboxes, Pause and Remove; a new key is one deliberate tap
            shut(); pg.evaluate("TribeInviteAgent.open({ kind: 'cursor' })"); opened(); on_pick("cursor"); pg.wait_for_selector("#ic-body #ic-access #ic-pause")
            assert "Campw's Cursor joined" in pg.text_content("#ic-status") and pg.locator("#ic-new").count() == 1 and pg.locator("#ic-body [data-ic-text]").count() == 0, "no key on screen until asked"
            assert pg.get_attribute("#ic-access", "data-ic-agentkind") == "cursor" and pg.locator("#ic-body [data-ic-of]").count() == 1, "only the Cursor's controls on the Cursor's tab"
            time.sleep(5)   # let the toast go
            pg.screenshot(path=str(SHOTS / "invite-agent-joined.png"))
            msgs = ok(api("/chat/general", token=htok))["messages"]
            chello = [x for x in msgs if "I'm Campw's Cursor, invited by Campw" in (x.get("text") or "")]
            assert chello and chello[0]["by"] != hc_id, [x.get("text") for x in msgs]
            cur_id = chello[0]["by"]
            cmem = [x for x in ok(api("/members", token=htok))["members"] if x["id"] == cur_id][0]
            assert cmem["role"] == "agent" and cmem["invited"] and cmem["agentKind"] == "cursor" and cmem["ownerName"] == "Campw", cmem
            shut()
            pg.click("#ppl-btn"); pg.wait_for_selector("#ppl-panel:not([hidden])")
            crow = pg.locator(f"#ppl-panel .ppl-row[data-mid='{cur_id}']"); crow.wait_for(timeout=10000)
            assert "Campw's Cursor" in crow.text_content() and "invited by Campw" in crow.text_content() and crow.locator(".ppl-ai[data-kind='cursor'] svg[data-i='agent-cursor']").count() == 1, crow.text_content()
            assert "Invite your agent" in pg.text_content("#ppl-claude")

            # ---------- the other entry points ----------
            pg.click("#ppl-claude"); opened(); shut()   # People panel
            pg.evaluate("document.getElementById('ppl-close') && document.getElementById('ppl-close').click()")
            pg.click("#tour-invite"); pg.wait_for_selector("#io-who-agent", state="visible"); pg.click("#io-who-agent"); opened(); shut()   # Invite friends
            pg.evaluate("document.getElementById('invite-modal').classList.add('hidden')")
            pg.evaluate("TribeFlow.inviteSheet({ name: 'Game', invite: { link: 'http://x/join/abc', kind: 'local' } })")   # a project's invite sheet
            pg.wait_for_selector(".modal-card.ii #ii-link"); pg.click("#io-who-agent"); opened(); shut()
            pg.evaluate("document.getElementById('invite-modal').classList.add('hidden')")
            # the empty chat: the room's real empty state (the history call answers with no messages)
            pg.evaluate("TribeApp.show('chat')")
            pg.evaluate("(() => { const C = TribeClient, api = C.api; C.__api = api; C.api = (p, o) => /^\\/chat\\/general\\?/.test(p) ? Promise.resolve({ messages: [] }) : api(p, o); return Promise.resolve(TribeApp.reloadChat()).catch(() => null); })()")
            pg.wait_for_selector("#chat-list .empty-room [data-ic-open]", state="attached", timeout=6000)
            pg.evaluate("void (TribeClient.api = TribeClient.__api)")
            pg.evaluate("document.querySelector('#chat-list .empty-room [data-ic-open]').click()"); opened(); shut()
            pg.evaluate("TribeInvite.open({ who: 'claude' })"); opened(); assert pg.get_attribute("#ic-body [data-ic-kind].on", "data-ic-family") == "claude"; shut()   # the old name of the third choice
            # Flint: the sheet opens on the kind you name
            pg.evaluate("document.querySelector('#flint') && document.querySelector('#flint').classList.remove('folded')")
            typed = pg.locator("#fl-input").count() and pg.locator("#fl-input").is_visible()
            for phrase, fam in (("invite my claude", "claude"), ("invite my cursor", "cursor"), ("add codex", "codex"), ("connect gemini", "gemini"), ("invite my agent", None)):
                if typed: pg.fill("#fl-input", phrase); pg.press("#fl-input", "Enter")
                else: pg.evaluate("p => TribeFlint && TribeFlint.ask ? TribeFlint.ask(p) : null", phrase)
                opened()
                if fam: pg.wait_for_function("f => { const b = document.querySelector('#ic-body [data-ic-kind].on'); return b && b.dataset.icFamily === f; }", arg=fam, timeout=10000)
                shut()
            # Settings: every invited agent with its own checkboxes, Pause and Remove
            pg.evaluate("TribeSettings.open('ai', 'set-myagents')"); pg.wait_for_selector("#set-agentaccess [data-ic-of]", timeout=10000)
            assert pg.eval_on_selector_all("#set-agentaccess [data-ic-of]", "els => els.map(e => e.dataset.icAgentkind)") == ["claude", "cursor"]
            assert pg.locator("#set-agentaccess [data-ic-pause]").count() == 2 and pg.locator("#set-agentaccess [data-ic-remove]").count() == 2
            pg.evaluate("TribeSettings.close()")
            # the Agents Hub's card
            pg.evaluate("TribeAgentsHub.open()"); pg.wait_for_selector("#ah-invite .ic-hubcard", timeout=10000)
            assert "Invite your agent" in pg.text_content("#ah-invite"); pg.click("#ah-invite [data-ic-open]"); opened(); shut()

            # ---------- 390px: the sheet fits a phone ----------
            ph = b.new_page(viewport={"width": 390, "height": 844}); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Campw', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{htok}'}}}})) }} catch (e) {{}}")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInviteAgent", timeout=20000)
            ph.evaluate("TribeInviteAgent.open({ kind: 'codex', fresh: true })")
            ph.wait_for_selector("#invite-modal:not(.hidden) #ic-body [data-ic-kind='codex'].on", timeout=10000); ph.wait_for_selector("#ic-body [data-ic-text='codex']")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "the page scrolls sideways at 390px"
            assert ph.evaluate("(() => { const b = document.querySelector('#invite-body'); return b.scrollWidth <= b.clientWidth + 1; })()"), "the sheet scrolls sideways at 390px"
            box = ph.locator("#invite-body").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 391, box
            assert ph.evaluate("[...document.querySelectorAll('#ic-body [data-ic-kind]')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })"), "a chip runs off the screen"
            ph.close()
            print("UI ok: every entry point opens the sheet; every setup; Claude and Cursor joined under their own names; Flint; Settings; 390px")
            b.close()

        # ================= API: what it may and may not do =================
        A = ok(api("/projects", "POST", {"name": "Game"}, token=htok))["project"]["id"]
        B = ok(api("/projects", "POST", {"name": "Secret"}, token=htok))["project"]["id"]
        inv = lambda **kw: ok(api("/invites", "POST", {"maxUses": 1, **kw}, token=htok))["invite"]["code"]
        bob = ok(api("/join", "POST", {"code": inv(role="builder", project="tribe"), "name": "Bob"}))
        maya = ok(api("/join", "POST", {"code": inv(role="builder", project=A), "name": "Maya"}))
        bt, mt = bob["token"], maya["token"]
        mr = ok(api("/invite-claude", "POST", {}, token=mt, project=A), "Maya invites her Claude")
        mk = mr["token"]; keys.append(mk)
        assert mr["agent"]["name"] == "Maya's Claude" and f"Bearer {mk}" in mr["code"]["command"] and "/mcp" in mr["code"]["command"]
        assert mr["web"]["available"] is False
        br = ok(api("/invite-claude", "POST", {}, token=bt, project=A)); bk = br["token"]; keys.append(bk)
        hc = ok(api("/invite-claude", "GET", token=htok)); assert hc["agent"] and hc["joined"], hc
        assert [(a["name"], a["agentKind"]) for a in hc["agents"]] == [("Campw's Claude", "claude"), ("Campw's Cursor", "cursor")] and len(hc["claudes"]) == 1 and not hc["merge"], hc["agents"]
        assert api("/invite-claude", "POST", {}, token=mk)[0] == 403, "a Claude can't invite a Claude"
        # only the hash is stored
        members_file = (tmp / "tribe" / ".tribe" / "members.json")
        mjs = members_file.read_text() if members_file.exists() else ""
        assert mk not in mjs, "raw key stored"
        mcp(mk, "initialize", {"protocolVersion": "2025-06-18"}); mcp(bk, "initialize", {"protocolVersion": "2025-06-18"})

        # ---------- every kind: the right address, a key of its own; one of each per person ----------
        KINDS = ["claude", "cursor", "codex", "chatgpt", "gemini", "vscode", "windsurf", "cline", "zed", "other"]
        SHORT = {"claude": "Claude", "cursor": "Cursor", "codex": "Codex", "chatgpt": "ChatGPT", "gemini": "Gemini", "vscode": "VS Code", "windsurf": "Windsurf", "cline": "Cline", "zed": "Zed", "other": "agent"}
        sam = ok(api("/join", "POST", {"code": inv(role="builder", project="tribe"), "name": "Sam"})); smt = sam["token"]
        pre = ok(api("/invite-agent", "GET", token=smt))
        assert [k["id"] for k in pre["kinds"]] == KINDS and not pre["agents"] and len(pre["preview"]["setups"]) == 12, pre["kinds"]
        sam_keys = {}
        for k in KINDS:
            r = ok(api("/invite-agent", "POST", {"kind": k}, token=smt), f"Sam invites a {k}")
            tk = r["token"]; keys.append(tk); sam_keys[k] = tk
            assert r["kind"] == k and r["agent"]["name"] == f"Sam's {SHORT[k]}" and r["agent"]["invited"], (k, r["agent"])
            assert tk not in sam_keys.values() or list(sam_keys.values()).count(tk) == 1
            assert r["setups"] and all(x["kind"] == k for x in r["setups"].values()), (k, list(r["setups"]))
            for pick_id, su in r["setups"].items():
                assert su["as"] == f"Sam's {SHORT[k]}" and su["behaves"], (pick_id, su)
                if not su["available"]: assert su["signin"] and "public https" in su["why"]; continue   # Claude on the web, ChatGPT: no public address in this test
                assert len(su["steps"]) >= 2 and su["blocks"], (pick_id, su)
                for blk in su["blocks"]:
                    if blk.get("nokey"): assert tk not in blk["text"], (pick_id, blk)
                    else: assert tk in blk["text"], (pick_id, blk["label"])
                    assert f":{PORT}/mcp" in blk["text"] or blk["text"].startswith("Authorization: Bearer "), (pick_id, blk)
            st, j = mcp(tk, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": k}}); assert st == 200 and f"Sam's {SHORT[k]}" in json.dumps(j), (k, j)
        assert len(set(sam_keys.values())) == 10
        sv = ok(api("/invite-agent", "GET", token=smt))
        assert [a["agentKind"] for a in sv["agents"]] == KINDS and not sv["dupes"] and all(a["joined"] for a in sv["agents"]), sv["agents"]
        hellos = [x["text"] for x in ok(api("/chat/general", token=smt))["messages"] if "invited by Sam" in (x.get("text") or "")]
        for k in KINDS: assert any(f"I'm Sam's {SHORT[k]}," in h for h in hellos), (k, hellos)
        sam_agents = {a["agentKind"]: a for a in sv["agents"]}
        mem = {m["id"]: m for m in ok(api("/members", token=smt))["members"]}
        assert all(mem[a["id"]]["agentKind"] == k and mem[a["id"]]["invited"] and mem[a["id"]]["ownerName"] == "Sam" for k, a in sam_agents.items())
        # asking for a kind again re-keys the same member: never a second one
        r2 = ok(api("/invite-agent", "POST", {"pick": "codex"}, token=smt)); keys.append(r2["token"])
        assert r2["agent"]["id"] == sam_agents["codex"]["id"] and r2["token"] != sam_keys["codex"]
        assert mcp(sam_keys["codex"], "tools/list")[0] == 401 and mcp(r2["token"], "tools/list")[0] == 200, "the old key stops, the new one works"
        sam_keys["codex"] = r2["token"]
        assert len([a for a in ok(api("/invite-agent", "GET", token=smt))["agents"] if a["agentKind"] == "codex"]) == 1
        assert len([m for m in ok(api("/members", token=smt))["members"] if m.get("owner") == sam["member"]["id"]]) == 10, "still ten: one of each"
        assert api("/invite-agent", "POST", {"kind": "skynet"}, token=smt)[0] == 400
        assert api("/invite-agent", "POST", {"kind": "cursor"}, token=sam_keys["claude"])[0] == 403, "an agent can't invite an agent"
        # two kinds, separate access: Sam's Codex loses chat and is paused; Sam's Claude is untouched
        ok(api("/invite-agent", "PUT", {"kind": "codex", "scopes": ["docs", "tasks"]}, token=smt))
        good, t = tool(sam_keys["codex"], "post_chat", {"text": "should not post"}); assert not good and "turned off" in t, t
        good, t = tool(sam_keys["claude"], "post_chat", {"text": "Sam's Claude still talks"}); assert good, t
        good, t = tool(sam_keys["cursor"], "post_chat", {"text": "so does Sam's Cursor"}); assert good, t
        last = ok(api("/chat/general", token=smt))["messages"][-2:]
        assert [mem[x["by"]]["name"] for x in last] == ["Sam's Claude", "Sam's Cursor"], "each message carries its own agent's name"
        ok(api("/invite-agent", "PUT", {"id": sam_agents["codex"]["id"], "paused": True}, token=smt))
        assert mcp(sam_keys["codex"], "tools/list")[0] == 401 and mcp(sam_keys["claude"], "tools/list")[0] == 200 and mcp(sam_keys["gemini"], "tools/list")[0] == 200
        after = {a["agentKind"]: a for a in ok(api("/invite-agent", "GET", token=smt))["agents"]}
        assert after["codex"]["paused"] and after["codex"]["scopes"] == ["docs", "tasks"] and not after["claude"]["paused"] and len(after["claude"]["scopes"]) == 6
        # the same wall for every kind: no admin, no DMs, no keys, no invites
        for k in ("cursor", "gemini", "chatgpt", "other"):
            good, t = tool(sam_keys[k], "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": bob["member"]["id"], "minutes": 5}}); assert not good, f"Sam's {k} did admin: {t}"
            for path in ("invites", "agents", "invite-agent", "invite-claude", "agent-auth", "tribe-link"):
                good, t = tool(sam_keys[k], "tribe_api", {"method": "POST", "path": path, "body": {}}); assert not good, (k, path, t)
            assert api("/invites", "POST", {}, token=sam_keys[k])[0] == 403
        # a role downgrade cuts every one of them at once; Remove takes one out and leaves the rest
        ok(api("/perms/assign", "POST", {"member": sam["member"]["id"], "role": "spectator"}, token=htok))
        for k in ("claude", "cursor", "zed"):
            good, t = tool(sam_keys[k], "create_task", {"title": "x"}); assert not good, f"downgrade didn't cut Sam's {k}: {t}"
        ok(api("/perms/assign", "POST", {"member": sam["member"]["id"], "role": "builder"}, token=htok))
        good, t = tool(sam_keys["zed"], "create_task", {"title": "Zed is back"}); assert good, t
        ok(api("/invite-agent?kind=windsurf", "DELETE", token=smt))
        assert mcp(sam_keys["windsurf"], "tools/list")[0] == 401 and mcp(sam_keys["cline"], "tools/list")[0] == 200
        assert "Sam's Windsurf" not in [m["name"] for m in ok(api("/members", token=htok))["members"]]
        # "@Sam's Cursor" from anyone and "@cursor" from Sam reach the Cursor only
        for k in ("cursor", "claude"): tool(sam_keys[k], "inbox_next")
        ok(api("/chat/general", "POST", {"text": "@Sam's Cursor can you look at the menu?"}, token=bt))
        ok(api("/chat/general", "POST", {"text": "@cursor tidy the imports"}, token=smt))
        ok(api("/chat/general", "POST", {"text": "@cursor this one is Bob's, not for Sam's"}, token=bt))
        good, t = tool(sam_keys["cursor"], "inbox_next"); assert good and "look at the menu" in t and "tidy the imports" in t and "Bob's, not" not in t, t
        good, t = tool(sam_keys["claude"], "inbox_next"); assert "No new mentions" in t, t
        # "Something else" can be renamed; the others keep their names
        rn = ok(api("/invite-agent", "PUT", {"kind": "other", "name": "Robo  <b>Helper</b>"}, token=smt))
        assert [a["name"] for a in rn["agents"] if a["agentKind"] == "other"] == ["Robo bHelper/b"], [a["name"] for a in rn["agents"]]
        assert api("/invite-agent", "PUT", {"kind": "other", "name": "Campw"}, token=smt)[0] == 409, "not someone else's name"
        assert api("/invite-agent", "PUT", {"kind": "cursor", "name": "Robo 2"}, token=smt)[0] == 400
        assert ok(api("/invite-agent", "POST", {"kind": "other"}, token=smt))["agent"]["name"] == "Robo bHelper/b", "a new key keeps the name it was given"
        print("Every kind: its own setup, name, key and hello; one of each; separate access; the same wall for all")

        # ---------- an app that signs in under another product's name becomes that kind ----------
        ask, done, at = sign_in("Cursor", bt)
        assert ask["client"] == "Cursor" and ask["kind"] == "cursor" and ask["kindLabel"] == "Cursor" and done["name"] == "Bob's Cursor", (ask, done)
        st, j = mcp(at, "initialize", {"protocolVersion": "2025-06-18"}); assert st == 200 and "Bob's Cursor" in json.dumps(j), j
        ask, done, at2 = sign_in("ChatGPT", bt, "https://chatgpt.com/connector_platform_oauth_redirect"); assert ask["kind"] == "chatgpt" and done["name"] == "Bob's ChatGPT", (ask, done)
        ask, done, at3 = sign_in("Acme Bot 3000", bt); assert ask["kind"] == "other" and done["name"] == "Bob's agent", (ask, done)
        ask, done, at4 = sign_in("Claude", bt); assert ask["kind"] == "claude" and done["name"] == "Bob's Claude", (ask, done)
        ask, done, at5 = sign_in("Cursor", bt, "http://localhost:8787/callback"); assert done["name"] == "Bob's Cursor"   # the same Cursor: a second sign-in, not a second member
        bobs = ok(api("/invite-agent", "GET", token=bt))["agents"]
        assert sorted(a["agentKind"] for a in bobs) == ["chatgpt", "claude", "cursor", "other"], [(a["name"], a["agentKind"]) for a in bobs]
        bcur = [a for a in bobs if a["agentKind"] == "cursor"][0]
        assert len(bcur["connections"]) == 2 and not bcur["key"] and {c["client"] for c in bcur["connections"]} == {"Cursor"}, bcur
        good, t = tool(at, "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": maya["member"]["id"], "minutes": 5}}); assert not good, "a signed-in Cursor did admin"
        ok(api("/invite-agent", "PUT", {"kind": "cursor", "paused": True}, token=bt)); assert mcp(at, "tools/list")[0] == 401 and mcp(at5, "tools/list")[0] == 401 and mcp(at2, "tools/list")[0] == 200
        ok(api("/invite-agent?kind=cursor", "DELETE", token=bt)); ok(api("/invite-agent", "PUT", {"kind": "chatgpt", "paused": False}, token=bt))
        assert mcp(at, "tools/list")[0] == 401 and mcp(at2, "tools/list")[0] == 200, "Remove ends the Cursor's sign-ins and nobody else's"
        for k in ("chatgpt", "other"): ok(api(f"/invite-agent?kind={k}", "DELETE", token=bt))
        assert api("/claude-auth?code=ZZZZZZ", token=bt)[0] == 404 and api("/agent-auth?code=ZZZZZZ", token=bt)[0] == 404   # both names answer
        keys.extend([at, at2, at3, at4, at5])
        print("Sign-in: the app's registered name picks the kind; Pause and Remove reach its sign-ins")

        # everything Maya can do, in her project
        good, t = tool(mk, "post_chat", {"text": "Hi from Maya's Claude", "project": A}); assert good, t
        good, t = tool(mk, "write_doc", {"name": "Launch plan", "body": "# Launch plan\n\n- ship it", "project": A}); assert good, t
        good, t = tool(mk, "read_doc", {"name": "Launch plan", "project": A}); assert good and "ship it" in t, t
        where = [x for x in ok(api("/members", token=mt, project=A))["members"] if x["name"] == "Maya's Claude"][0]
        assert where.get("where") == "in Launch plan doc", where
        good, t = tool(mk, "create_task", {"title": "Polish the menu", "project": A}); assert good, t
        tid = re.search(r"Created (\S+):", t).group(1)
        good, t = tool(mk, "update_task", {"id": tid, "take": True, "status": "doing", "project": A}); assert good, t
        good, t = tool(mk, "comment_task", {"id": tid, "text": "Started on it", "project": A}); assert good, t
        task = [x for x in ok(api("/tasks", token=mt, project=A))["tasks"] if x["id"] == tid][0]
        assert "Started on it" in task["body"] and "Maya's Claude" in task["body"], task
        good, t = tool(mk, "where_is", {"name": "Maya", "project": A}); assert good and "Maya" in t, t
        good, t = tool(mk, "list_projects"); assert good and A in t and B not in t, t
        msg_id = [x for x in ok(api("/chat/general", token=mt, project=A))["messages"] if x.get("text") == "Hi from Maya's Claude"][0]["id"]
        good, t = tool(mk, "react_chat", {"id": msg_id, "emoji": "👍", "project": A}); assert good, t
        good, t = tool(mk, "reply_chat", {"id": msg_id, "text": "a reply", "project": A}); assert good, t
        good, t = tool(mk, "tribe_api", {"method": "GET", "path": "market", "project": A}); assert good or "404" in t, t   # the Marketplace reads
        good, t = tool(mk, "tribe_api", {"method": "POST", "path": "market/add", "body": {"id": "x"}, "project": A}); assert not good and "read-only" in t, t
        print("Can: chat, react, reply, docs, tasks, presence, Marketplace reads")

        # …and nothing more: another project, DMs, admin, keys
        good, t = tool(mk, "read_chat", {"project": B}); assert not good, f"Maya's Claude read project B: {t}"
        good, t = tool(mk, "code_write", {"path": "x.txt", "text": "pwn", "project": B}); assert not good, t
        assert api("/chat/general", token=mk, project=B)[0] == 403
        ok(api(f"/chat/dm-{'-'.join(sorted([bob['member']['id'], host_id]))}", "POST", {"text": "secret plans"}, token=bt), "Bob DMs Campw")
        dm_bh = "dm-" + "-".join(sorted([bob["member"]["id"], host_id]))
        dm_mb = "dm-" + "-".join(sorted([bob["member"]["id"], maya["member"]["id"]]))
        ok(api(f"/chat/{dm_mb}", "POST", {"text": "maya and bob"}, token=bt))
        for ch in (dm_bh, dm_mb):
            st, j = api(f"/chat/{ch}", token=mk); assert st == 403 and not j.get("messages"), f"Maya's Claude read {ch}: {st}"
            good, t = tool(mk, "tribe_api", {"method": "GET", "path": f"chat/{ch}"}); assert not good and "secret" not in t, t
        good, t = tool(mk, "read_chat", {"channel": dm_mb, "project": A}); assert "maya and bob" not in t, t
        good, t = tool(bk, "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": maya["member"]["id"], "minutes": 5}}); assert not good, f"builder's Claude did admin: {t}"
        for path in ("invites", "agents", "invite-claude", "share/public", "tribe-link"):
            good, t = tool(mk, "tribe_api", {"method": "POST", "path": path, "body": {}}); assert not good, (path, t)
        # the host's Claude: no admin until "act as me for admin"
        good, t = tool(key, "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": bob["member"]["id"], "minutes": 1}}); assert not good, f"host's Claude did admin unticked: {t}"
        ok(api("/invite-claude", "PUT", {"adminAsMe": True}, token=htok))
        good, t = tool(key, "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": bob["member"]["id"], "minutes": 1}}); assert good, f"ticked: {t}"
        ok(api(f"/perms/mute/{bob['member']['id']}", "DELETE", token=htok))
        ok(api("/invite-claude", "PUT", {"adminAsMe": False}, token=htok))
        assert api("/invite-claude", "PUT", {"adminAsMe": True}, token=mt)[1].get("adminAsMe") in (True, False)   # stored, but…
        good, t = tool(mk, "tribe_api", {"method": "POST", "path": "perms/mute", "body": {"member": bob["member"]["id"], "minutes": 1}}); assert not good, "…a builder's tick gives nothing"
        ok(api("/invite-claude", "PUT", {"adminAsMe": False}, token=mt))
        print("Can't: other projects, DMs, admin (builder or unticked host), keys or invites")

        # ---------- undo: Maya can delete her Claude's message, Bob can't ----------
        assert api(f"/chat/general/msg/{msg_id}", "DELETE", token=bt, project=A)[0] == 403
        ok(api(f"/chat/general/msg/{msg_id}", "DELETE", token=mt, project=A), "Maya undoes her Claude's message")

        # ---------- narrowing, Pause, Remove, role downgrade ----------
        ok(api("/invite-claude", "PUT", {"scopes": ["docs", "tasks", "files", "website", "approvals"]}, token=mt))
        good, t = tool(mk, "post_chat", {"text": "should not post", "project": A}); assert not good and "turned off" in t, t
        good, t = tool(mk, "tribe_api", {"method": "POST", "path": "chat/general/send", "body": {"text": "nope"}, "project": A}); assert not good, t
        names = [x["name"] for x in mcp(mk, "tools/list")[1]["result"]["tools"]]
        assert "post_chat" not in names and "write_doc" in names, names[:20]
        good, t = tool(mk, "list_tasks", {"project": A}); assert good, t
        ok(api("/invite-claude", "PUT", {"scopes": ["chat", "docs", "tasks", "files", "website", "approvals"]}, token=mt))
        good, t = tool(mk, "post_chat", {"text": "back", "project": A}); assert good, t
        ok(api("/invite-claude", "PUT", {"paused": True}, token=mt))
        assert mcp(mk, "tools/list")[0] == 401 and api("/tasks", token=mk, project=A)[0] == 401, "paused = refused at once"
        assert not any(x["name"] == "Maya's Claude" and x.get("online") for x in ok(api("/members", token=mt, project=A))["members"])
        ok(api("/invite-claude", "PUT", {"paused": False}, token=mt))
        good, t = tool(mk, "list_tasks", {"project": A}); assert good, t
        ok(api("/perms/assign", "POST", {"member": maya["member"]["id"], "role": "spectator"}, token=htok), "Maya can only watch")
        good, t = tool(mk, "create_task", {"title": "x", "project": A}); assert not good, f"downgrade didn't cut access: {t}"
        assert api("/tasks", "POST", {"title": "x"}, token=mk, project=A)[0] == 403
        good, t = tool(mk, "read_chat", {"project": A}); assert good, "reading still works"
        ok(api("/perms/assign", "POST", {"member": maya["member"]["id"], "role": "builder"}, token=htok))
        good, t = tool(mk, "create_task", {"title": "Back to building", "project": A}); assert good, t
        print("Narrowing, Pause and a role downgrade take effect at once")

        # ---------- @mention → inbox_next ----------
        good, t = tool(mk, "inbox_next", {"project": A}); assert good   # drain
        ok(api("/chat/general", "POST", {"text": "@Maya's Claude can you check the build?"}, token=bt, project=A))
        ok(api("/chat/general", "POST", {"text": "@claude this one is for my own Claude, not Maya's"}, token=bt, project=A))
        ok(api("/chat/general", "POST", {"text": "@claude please add tests"}, token=mt, project=A))
        good, t = tool(mk, "inbox_next", {"project": A}); assert good, t
        assert "check the build" in t and "please add tests" in t and "not Maya's" not in t, t
        good, t = tool(mk, "inbox_next", {"project": A}); assert "No new mentions" in t, t
        print("@mentions reach inbox_next")

        # ---------- Remove ----------
        ok(api("/invite-claude", "DELETE", token=bt))
        assert mcp(bk, "tools/list")[0] == 401 and api("/tasks", token=bk)[0] == 401 and mcp(at4, "tools/list")[0] == 401
        assert not any(x["name"] == "Bob's Claude" for x in ok(api("/members", token=htok))["members"]), "removed from People"
        print("Remove revokes at once")

        # ---------- rate limit ----------
        hit = None
        for i in range(RATE + 10):
            good, t = tool(mk, "list_docs", {"project": A})
            if not good and "Slow down" in t: hit = i; break
        assert hit is not None, "no rate limit"
        assert api("/tasks", token=mk, project=A)[0] == 429
        print(f"Rate-limited after {hit} calls")

        # ---------- no key in logs or files ----------
        time.sleep(0.5)
        blob = log.read_text(errors="ignore")
        for root, _, files in os.walk(tmp / "tribe"):
            for f in files:
                try: blob += (Path(root) / f).read_text(errors="ignore")
                except Exception: pass
        for k in keys: assert k not in blob, "a key leaked into the log or the tribe folder"
        print("No key in logs or files")
        assert not [e for e in errors if "ResizeObserver" not in e], errors

        # ---------- migration: an invited Claude from before kinds existed is the kind "claude", nothing lost ----------
        ok(api("/invite-agent", "PUT", {"kind": "claude", "scopes": ["chat", "docs"], "adminAsMe": True}, token=htok))
        srv.terminate(); srv.wait(timeout=20)
        mf = tmp / "tribe" / ".tribe" / "members.json"
        data = json.loads(mf.read_text()); rows = data if isinstance(data, list) else data["members"]
        old = [m for m in rows if m.get("invited") and m.get("name") == "Campw's Claude"]; assert len(old) == 1, [m.get("name") for m in rows]
        old_id, old_hash = old[0]["id"], old[0]["tokenHash"]
        for m in rows:
            if m.get("invited") and m.get("agentKind") == "claude": del m["agentKind"]; m["kind"] = "claude-code"; m["label"] = "Invited Claude"   # exactly what v0.35 wrote
        mf.write_text(json.dumps(data))
        srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(log, "a"), stderr=subprocess.STDOUT, env=env)
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        mig = ok(api("/invite-agent", "GET", token=htok), "after the restart")
        mc = [a for a in mig["agents"] if a["agentKind"] == "claude"]
        assert len(mc) == 1 and mc[0]["id"] == old_id and mc[0]["name"] == "Campw's Claude" and mc[0]["scopes"] == ["chat", "docs"] and mc[0]["adminAsMe"] and mc[0]["joined"], mc
        assert [a["agentKind"] for a in mig["agents"]] == ["claude", "cursor"], "the Cursor next to it is untouched"
        assert mcp(key, "tools/list")[0] == 200 and mcp(ckey, "tools/list")[0] == 200, "both keys still work"
        good, t = tool(key, "write_doc", {"name": "After", "body": "x"}); assert good, t
        good, t = tool(key, "create_task", {"title": "nope"}); assert not good and "turned off" in t, "its narrowing came across"
        rows2 = json.loads(mf.read_text()); rows2 = rows2 if isinstance(rows2, list) else rows2["members"]
        now_ = [m for m in rows2 if m["id"] == old_id][0]
        assert now_["agentKind"] == "claude" and now_["tokenHash"] == old_hash, "written back as kind claude, same key"
        assert ok(api("/invite-claude", "GET", token=htok))["agent"]["id"] == old_id, "the old path still means your Claude"
        assert ok(api("/invite-agent", "POST", {"kind": "claude"}, token=htok))["agent"]["id"] == old_id, "a new key goes to the same member"
        print("Migration: an invited Claude becomes kind claude with its key, access and name")
        print("ok e2e_invite_agent")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
