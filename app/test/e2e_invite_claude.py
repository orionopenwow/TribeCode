"""Invite your Claude (server/inviteclaude.js, app/ui/inviteclaude.js).

UI   the sheet opens from every entry point (sidebar row, People panel, Invite friends, a project's invite sheet, the
     empty chat, Flint "invite my claude"); the command and the Desktop config carry this tribe's /mcp URL and the key;
     a Claude connecting over MCP turns "Waiting for your Claude…" into "✓ Campw's Claude joined", says hello in chat and
     shows in People with the AI badge and "invited by Campw". Screenshots: docs/screenshots/invite-claude*.png.
API  it can do what its person can and nothing more: a builder's Claude can't do admin, nobody's Claude reads DMs (not
     even its own person's), a project-only friend's Claude can't touch another project; the host's Claude can't do
     admin either until "Let it act as me for admin" is ticked. Narrowing, Pause, Remove and a role downgrade take effect
     at once. An @mention reaches inbox_next. Its messages can be undone by its person. Rate limits apply. No key in logs.
Usage: python3 app/test/e2e_invite_claude.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import json, os, re, subprocess, tempfile, time, urllib.error, urllib.request
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
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInviteClaude", timeout=20000)
            htok = pg.evaluate("TribeStore.get().server.token"); host_id = pg.evaluate("TribeClient.state().me.id")
            pg.evaluate("localStorage.removeItem('tribecode.inviteclaude.kind')")
            shut = lambda: pg.evaluate("TribeInviteClaude.close()")
            opened = lambda: pg.wait_for_selector("#invite-modal:not(.hidden) #ic-body #ic-status", timeout=10000)   # the one invite sheet, on Your Claude

            # ---------- the sheet from the sidebar row ----------
            pg.click("#sf-claude"); opened()
            pg.wait_for_selector("#ic-body [data-ic-text='code']")
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
            pg.screenshot(path=str(SHOTS / "invite-claude.png"))
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
            time.sleep(2.5)   # let the copy toast go
            pg.screenshot(path=str(SHOTS / "invite-claude-joined.png"))
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

            # ---------- the other entry points ----------
            pg.click("#ppl-claude"); opened(); shut()   # People panel
            pg.evaluate("document.getElementById('ppl-close') && document.getElementById('ppl-close').click()")
            pg.click("#tour-invite"); pg.wait_for_selector("#io-who-claude", state="visible"); pg.click("#io-who-claude"); opened(); shut()   # Invite friends
            pg.evaluate("document.getElementById('invite-modal').classList.add('hidden')")
            pg.evaluate("TribeFlow.inviteSheet({ name: 'Game', invite: { link: 'http://x/join/abc', kind: 'local' } })")   # a project's invite sheet
            pg.wait_for_selector(".modal-card.ii #ii-link"); pg.click("#io-who-claude"); opened(); shut()
            pg.evaluate("document.getElementById('invite-modal').classList.add('hidden')")
            # the empty chat: the room's real empty state (the history call answers with no messages)
            pg.evaluate("TribeApp.show('chat')")
            pg.evaluate("(() => { const C = TribeClient, api = C.api; C.__api = api; C.api = (p, o) => /^\\/chat\\/general\\?/.test(p) ? Promise.resolve({ messages: [] }) : api(p, o); return Promise.resolve(TribeApp.reloadChat()).catch(() => null); })()")
            pg.wait_for_selector("#chat-list .empty-room [data-ic-open]", state="attached", timeout=6000)
            pg.evaluate("void (TribeClient.api = TribeClient.__api)")
            pg.evaluate("document.querySelector('#chat-list .empty-room [data-ic-open]').click()"); opened(); shut()
            # Flint
            pg.evaluate("document.querySelector('#flint') && document.querySelector('#flint').classList.remove('folded')")
            if pg.locator("#fl-input").count() and pg.locator("#fl-input").is_visible():
                pg.fill("#fl-input", "invite my claude"); pg.press("#fl-input", "Enter"); opened(); shut()
            else:
                pg.evaluate("TribeFlint && TribeFlint.ask ? TribeFlint.ask('invite my claude') : null"); opened(); shut()
            print("UI ok: every entry point opens the sheet; joined, hello, People badge")
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
        assert api("/invite-claude", "POST", {}, token=mk)[0] == 403, "a Claude can't invite a Claude"
        # only the hash is stored
        members_file = (tmp / "tribe" / ".tribe" / "members.json")
        mjs = members_file.read_text() if members_file.exists() else ""
        assert mk not in mjs, "raw key stored"
        mcp(mk, "initialize", {"protocolVersion": "2025-06-18"}); mcp(bk, "initialize", {"protocolVersion": "2025-06-18"})

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
        assert mcp(bk, "tools/list")[0] == 401 and api("/tasks", token=bk)[0] == 401
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
        print("ok e2e_invite_claude")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
