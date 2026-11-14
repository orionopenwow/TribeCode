"""The one invite sheet, one Claude per person, sign-in for the claude.ai connector, Log in again (feat/invite-one).

A  every entry point opens the one sheet on the right choice (Home, the sidebar rows, People, a project's menu, the
   create-a-tribe flow, the empty chat, Flint, Connect your AI, the old shims); nothing is made by opening it.
B  the friend link, a one-time link, a project-only link and a guest pass all work end to end.
C  no Claude member exists until Copy; a Connect-your-AI Claude shows as already connected (no second member), with
   narrowing, Pause and a new key on the same member; two Claudes show together with the merge hint and both work.
D  the OAuth flow with a scripted client: discovery, registration, PKCE authorize, TribeCode's consent page (signed in,
   and the typed code when not), token, refresh rotation, reuse, revoke (endpoint and the sheet), a bad redirect and
   a wrong verifier refused; the token acts as the person's Claude with its permissions.
E  the signed-out notice has Log in again and returns to the same place; Settings names a device's browser and system.
F  390px: the sheet fits a phone. Screenshot: docs/screenshots/invite-one.png.
Unit: a Claude that never connected is taken out after 24 hours (server/inviteagent.js sweep, a fake clock).
Usage: python3 app/test/e2e_invite_one.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, json, os, re, secrets, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6790 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
PUBLIC = "https://tribe.example"
WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
errors = []


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
plain = urllib.request.build_opener(NoRedirect)


def http(path, method="GET", body=None, token=None, form=None, headers=None, base=None):
    """(status, json-or-text, headers) without following redirects."""
    h = dict(headers or {})
    data = None
    if form is not None: data = urllib.parse.urlencode(form).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request((base or BASE) + path, method=method, data=data, headers=h)
    try:
        with plain.open(req, timeout=30) as r: raw, st, hd = r.read(), r.status, r.headers
    except urllib.error.HTTPError as e: raw, st, hd = e.read(), e.code, e.headers
    try: return st, json.loads(raw or b"{}"), hd
    except Exception: return st, raw.decode("utf8", "replace"), hd


def api(path, method="GET", body=None, token=None, headers=None):
    st, j, _ = http("/api" + path, method, body, token, headers=headers); return st, j


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


_rid = [0]
def mcp(token, method, params=None, query=""):
    _rid[0] += 1
    st, j, hd = http("/mcp" + query, "POST", {"jsonrpc": "2.0", "id": _rid[0], "method": method, "params": params or {}}, token)
    return st, j, hd


def tool(token, name, args=None):
    st, j, _ = mcp(token, "tools/call", {"name": name, "arguments": args or {}})
    if st != 200: return False, f"HTTP {st}"
    res = j.get("result") or {}
    return not res.get("isError"), "".join(c.get("text", "") for c in res.get("content", []))


def pkce():
    v = secrets.token_urlsafe(48)
    return v, base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode()


def agents(token, every=False): return [x for x in ok(api("/members", token=token))["members"] if x["role"] == "agent" and (every or "Claude" in x["name"])]   # the Claudes


def until(fn, what, secs=12):
    end = time.time() + secs
    while time.time() < end:
        if fn(): return
        time.sleep(0.2)
    raise AssertionError(what)


def unit_sweep():
    js = r"""
const make = require(process.argv[1]);
let t = Date.parse('2026-11-13T00:00:00Z'); const members = [{ id: 'cam', name: 'Campw', role: 'host' }]; let saves = 0;
const ic = make({ P: { current: () => 'p1', defaultId: () => 'p1' }, getMembers: () => members, saveMembers: () => { saves++; }, pushPresence() {}, perms: { audit() {}, roleIn: () => 'host', actingRole: () => 'builder' },
  hash: x => 'h:' + x, id: n => 'x'.repeat(n), slug: s => s.toLowerCase(), str: (v, n) => (typeof v === 'string' ? v.slice(0, n) : ''), endpoints: () => ({ url: 'http://h/mcp', urls: {} }),
  agentsHub: { desktopConfig: () => ({ json: '{}', files: {}, server: { command: 'node', args: [] } }) }, postChat() {}, sendTo() {}, agentSeen: new Map(), idleMs: 1000, publicMember: m => ({ id: m.id, name: m.name, role: m.role }),
  docs: {}, store: {}, chans: {}, nameOf: () => '', now: () => t, auth: () => ({ active: () => false, connections: () => [], revokeAgent() {} }) });
const out = {};
const ag = ic.ensure(members[0]); out.made = members.length === 2 && ag.invited === true;
t += 23 * 3600e3; out.kept23 = ic.sweep() === 0 && members.length === 2;
t += 2 * 3600e3; out.gone25 = ic.sweep() === 1 && members.length === 1;
const ag2 = ic.ensure(members[0]); ag2.firstSeen = new Date(t).toISOString(); t += 72 * 3600e3; out.connectedStays = ic.sweep() === 0 && members.length === 2;
members.push({ id: 'old', name: 'Claude · Campw', role: 'agent', owner: 'cam', tokenHash: 'h:k', joined: '2026-01-01T00:00:00Z' }); out.legacyStays = ic.sweep() === 0 && members.length === 3;
console.log(JSON.stringify(out)); process.exit(0);
"""
    r = subprocess.run(["node", "-e", js, str(ROOT / "server" / "inviteagent.js")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert all(out.values()), out
    print("unit ok: a Claude that never connected is taken out after 24 hours; connected and Connect-your-AI ones stay")


def main():
    unit_sweep()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-io-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = tmp / "server.log"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9", "--public-url", PUBLIC], stdout=open(log, "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            seed = lambda name: "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}})) } catch (e) {}" % name
            ctx = b.new_context(viewport={"width": 1360, "height": 900}); ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(seed("Campw"))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInvite && window.TribeInviteClaude", timeout=25000)
            htok = pg.evaluate("TribeStore.get().server.token"); host_id = pg.evaluate("TribeClient.state().me.id")
            pg.evaluate("localStorage.removeItem('tribecode.inviteclaude.kind')")
            # a second project, so "Just this project" means something
            pid2 = ok(api("/projects", "POST", {"name": "Lantern Run"}, token=htok), "second project")["project"]["id"]
            pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length >= 2", timeout=10000)
            cur = pg.evaluate("TribeProjects.current()")

            def sheet(who, project=None, what=""):
                pg.wait_for_selector(f"#invite-modal:not(.hidden) .modal-card.io #io-pane[data-who='{who}']", timeout=10000)
                stt = pg.evaluate("TribeInvite.state()")
                assert stt and stt["who"] == who and stt["project"] == project, (what, stt)
                assert pg.get_attribute(f"#io-who-{who}", "aria-selected") == "true", what
                assert pg.locator(".modal-card.io").count() == 1 and pg.locator("#ic-modal").count() == 0, "one sheet, no second modal"
                pg.evaluate("TribeInvite.close()"); pg.wait_for_selector("#invite-modal", state="hidden")

            # ================= A: every entry point, the right choice =================
            invites0 = len(ok(api("/invites", token=htok))["invites"])
            pg.click("#tour-invite"); pg.wait_for_selector("#invite-modal:not(.hidden) #tl-link")
            assert "Who are you inviting?" in pg.text_content("#io-title") and pg.locator("[data-io-who]").count() == 3
            assert [x.strip() for x in pg.locator("[data-io-who] b").all_text_contents()] == ["A friend", "A guest for a day", "Your AI agent"]
            pg.wait_for_function("/\\/t\\//.test(document.querySelector('#tl-link').textContent)", timeout=10000)
            assert pg.locator("#io-made").is_hidden() and pg.locator("#tl-box").is_visible()
            time.sleep(1.5); pg.screenshot(path=str(SHOTS / "invite-one.png"))
            sheet("friend", None, "sidebar row")
            pg.click("#sf-claude"); sheet("agent", None, "sidebar agent row")
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#hub-instant", state="visible", timeout=10000)
            pg.click("#hub-instant"); sheet("friend", None, "Home's Invite a friend")
            pg.evaluate(f"TribeProjects.switchTo('{cur}', 'home')"); pg.wait_for_function(f"TribeProjects.current() === '{cur}' && !document.body.classList.contains('global')", timeout=10000)
            pg.click("#ppl-btn"); pg.wait_for_selector("#ppl-panel:not([hidden])")
            pg.click("#ppl-invite"); sheet("friend", None, "People › Invite")
            pg.click("#ppl-btn"); pg.wait_for_selector("#ppl-panel:not([hidden])"); pg.click("#ppl-claude"); sheet("agent", None, "People › Invite your agent")
            pg.evaluate("TribeFriends.open()"); pg.wait_for_selector("#ppl-panel:not([hidden]) #ppl-guest")   # the old shim still opens Friends
            pg.click("#ppl-guest"); sheet("guest", None, "People › guest pass")
            pg.evaluate("TribeFriends.open()"); pg.click("#ppl-new-invite"); sheet("friend", cur, "People › Invite a friend (this project)")
            pg.evaluate("TribeFriends.open()"); pg.click("#ppl-new-claude"); sheet("agent", None, "People › Add your Claude")
            pg.evaluate("TribeFriends.close()")
            pg.click(f"#pj-rail [data-pj-open='{cur}']", button="right"); pg.click("[data-rc='invite']"); sheet("friend", cur, "the project menu")
            pg.evaluate(f"TribeFlow.inviteSheet({{ name: 'Game', project: '{cur}', invite: {{ link: '{BASE}/join/abc', kind: 'local' }} }})")
            pg.wait_for_selector(".modal-card.ii #ii-link"); assert "/join/abc" in pg.text_content("#ii-link"); sheet("friend", cur, "a new project's invite")
            pg.evaluate("TribeApp.connectClaude()"); sheet("agent", None, "Connect your AI")
            pg.evaluate("TribeApp.connectClaude({ tool: 'claude-desktop', fresh: true })"); pg.wait_for_selector("#ic-body [data-ic-kind='desktop'].on"); sheet("agent", None, "Connect your AI › Claude Desktop")
            pg.evaluate("TribeInviteClaude.open()"); sheet("agent", None, "TribeInviteClaude.open()")
            pg.evaluate("TribeApp.openInvite()"); sheet("friend", None, "TribeApp.openInvite()")
            # another tool still gets Connect your AI, and its Claude chip comes back to the one sheet
            pg.evaluate("TribeApp.connectClaude({ tool: 'codex' })"); pg.wait_for_selector("#invite-modal:not(.hidden) #cc-setup[data-kind='codex']", timeout=10000)
            assert pg.locator(".modal-card.io").count() == 0
            pg.click("#invite-body [data-cai-tool='claude-code']"); sheet("agent", None, "Connect your AI › Claude Code chip")
            ok(api("/agents/mine?id=" + agents(htok, True)[0]["id"], "DELETE", token=htok))   # the Codex key that sheet made
            # the empty chat
            pg.evaluate("TribeApp.show('chat')")
            pg.evaluate("(() => { const C = TribeClient, api = C.api; C.__api = api; C.api = (p, o) => /^\\/chat\\/general\\?/.test(p) ? Promise.resolve({ messages: [] }) : api(p, o); return Promise.resolve(TribeApp.reloadChat()).catch(() => null); })()")
            pg.wait_for_selector("#chat-list .empty-room [data-ic-open]", state="attached", timeout=6000)
            pg.evaluate("void (TribeClient.api = TribeClient.__api)")
            pg.evaluate("document.querySelector('#chat-list .empty-room [data-ic-open]').click()"); sheet("agent", None, "the empty chat")
            # Flint
            pg.evaluate("document.querySelector('#flint') && document.querySelector('#flint').classList.remove('folded')")
            if pg.locator("#fl-input").count() and pg.locator("#fl-input").is_visible(): pg.fill("#fl-input", "invite my claude"); pg.press("#fl-input", "Enter")
            else: pg.evaluate("TribeFlint && TribeFlint.ask ? TribeFlint.ask('invite my claude') : null")
            sheet("agent", None, "Flint")
            # the create-a-tribe flow's invite step
            pg.evaluate("TribeNew.open({ name: 'Side Quest' })"); pg.wait_for_selector("#tn[data-step='1']")
            pg.click("#tn-next") if pg.locator("#tn-next").count() else pg.press("#tn input", "Enter")
            pg.wait_for_selector("#tn[data-step='2']"); pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3'] #tn-invite", timeout=15000)
            assert pg.locator("#tn-link").count() == 0, "the create flow has no invite link of its own"
            pg.click("#tn-invite"); pg.wait_for_selector("#invite-modal:not(.hidden) .modal-card.io #io-pane[data-who='friend']", timeout=15000)
            pg.evaluate("TribeInvite.close()")
            # opening the sheet made nothing: no invite, no Claude
            # (the two entries that ask for "this project" get that project's link at once; nothing else makes one)
            made = [i for i in ok(api("/invites", token=htok))["invites"] if not i.get("tribeLink")]   # the tribe link is the tribe's one standing link
            assert len(made) == invites0 + 2 and all(i.get("project") == cur for i in made[-2:]), ("no invite is made by opening the sheet", invites0, made)
            assert not agents(htok), "no Claude member by opening the sheet"
            assert not pg.evaluate("!!document.querySelector('#inv-claude, #ii-myclaude, #ii-claude, #ppl-link')"), "the old sheets are gone"
            print("A ok: every entry point opens the one sheet on the right choice; nothing is made by opening it")

            # ================= B: friend link, one-time, project-only, guest pass =================
            pg.evaluate(f"TribeProjects.switchTo('{cur}', 'home')"); pg.wait_for_function(f"TribeProjects.current() === '{cur}'", timeout=10000)
            pg.click("#tour-invite"); pg.wait_for_function("/\\/t\\//.test((document.querySelector('#tl-link') || {}).textContent || '')", timeout=10000)
            tl = pg.text_content("#tl-link").strip()
            pg.wait_for_selector("#tl-qr svg", state="visible")   # v0.37: on a computer the QR sits beside the link from the start
            pg.click("#tl-copy"); assert pg.evaluate("navigator.clipboard.readText()") == tl
            st, _, hd = http(urllib.parse.urlparse(tl).path, base=BASE); assert st == 302 and hd["Location"].startswith("/join/"), (st, hd.get("Location"))
            maya = ok(api("/join", "POST", {"code": hd["Location"].split("/join/")[1], "name": "Maya"}), "tribe link join")
            mtok, mid = maya["token"], maya["member"]["id"]
            assert not maya["member"].get("projects") and not maya["member"].get("guest"), maya["member"]
            # one-time
            pg.click("#io-once"); pg.wait_for_function("/\\/join\\//.test(document.querySelector('#inv-link').textContent)", timeout=10000)
            assert pg.get_attribute("#io-once", "aria-checked") == "true" and pg.locator("#tl-box").is_hidden() and pg.locator("#inv-qr svg").is_visible()
            assert pg.input_value("#inv-uses") == "1"
            code1 = pg.text_content("#inv-link").strip().rsplit("/", 1)[1]
            one = [i for i in ok(api("/invites", token=htok))["invites"] if i["code"] == code1][0]
            assert one["maxUses"] == 1 and not one.get("project") and not one.get("guest"), one
            sam = ok(api("/join", "POST", {"code": code1, "name": "Sam"}), "one-time join")
            assert api("/join", "POST", {"code": code1, "name": "Twice"})[0] in (404, 410), "a one-time link works once"
            # project-only (with the one-time switch off again: a link to this project)
            pg.click("#io-once"); pg.wait_for_selector("#tl-box", state="visible")
            pg.click("#io-project"); pg.wait_for_function(f"/\\/join\\//.test(document.querySelector('#inv-link').textContent) && !document.querySelector('#inv-link').textContent.includes('{code1}')", timeout=10000)
            assert pg.get_attribute("#io-project", "aria-checked") == "true" and "Link to" in pg.text_content("#io-made-eyebrow")
            code2 = pg.text_content("#inv-link").strip().rsplit("/", 1)[1]
            rio = ok(api("/join", "POST", {"code": code2, "name": "Rio"}), "project-only join")
            assert rio["member"]["projects"] == [cur], rio["member"]
            assert api("/tasks", token=rio["token"], headers={"X-Project": pid2})[0] == 403, "a project-only friend can't open another project"
            # guest pass
            pg.click("#io-who-guest"); pg.wait_for_selector("#io-guest-make")
            before = len(ok(api("/invites", token=htok))["invites"])
            pg.click("#io-project") if pg.get_attribute("#io-project", "aria-checked") == "true" else None
            pg.wait_for_selector("#io-guest-make"); assert len(ok(api("/invites", token=htok))["invites"]) == before, "no pass until asked"
            pg.click("#io-guest-make"); pg.wait_for_selector("#io-guest-link")
            gcode = pg.text_content("#io-guest-link").strip().rsplit("/", 1)[1]
            g = ok(api("/join", "POST", {"code": gcode, "name": "Gus"}), "guest join")
            assert g["member"].get("guest") and g["member"].get("guestUntil"), g["member"]
            ends = time.mktime(time.strptime(g["member"]["guestUntil"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
            assert 23 * 3600 < ends - time.time() < 25 * 3600, "a guest pass lasts a day"
            assert api("/join", "POST", {"code": gcode, "name": "Gus2"})[0] in (404, 410), "a guest pass works once"
            assert api("/invite-claude", "POST", {}, token=g["token"])[0] == 403, "a guest can't bring an AI"
            pg.evaluate("TribeInvite.close()")
            print("B ok: tribe link (QR, copy), one-time, project-only and guest pass all work end to end")

            # ================= C: one Claude per person =================
            pg.click("#sf-claude"); pg.wait_for_selector("#ic-body [data-ic-text='code']")
            assert "••••" in pg.text_content("#cc-cmd") and "Nothing is made yet" in pg.text_content("#ic-status")
            pg.click("#ic-body [data-ic-kind='desktop']"); assert "••••" in pg.text_content("#ic-body [data-ic-text='desktop']")
            pg.click("#ic-body [data-ic-kind='web']")
            assert pg.text_content("#ic-body [data-ic-text='web']").strip() == PUBLIC + "/mcp", "the address for claude.ai carries no key"
            assert "token=" not in pg.inner_text("#ic-body") and pg.locator("#ic-code").is_visible()
            pg.click("#ic-body [data-ic-copy='web']"); time.sleep(0.6)
            assert not agents(htok), "copying the claude.ai address makes no member either"
            pg.click("#ic-body [data-ic-kind='code']"); time.sleep(0.4)
            assert not agents(htok), "no Claude member until Copy"
            pg.click("#ic-body [data-ic-copy='code']")
            pg.wait_for_function("!document.querySelector('#cc-cmd').textContent.includes('••••')", timeout=10000)
            cmd = pg.text_content("#cc-cmd").strip()
            m = re.match(r'^claude mcp add --transport http tribecode (\S+/mcp) --header "Authorization: Bearer ([A-Za-z0-9_-]{20,})"$', cmd); assert m, cmd
            hkey = m.group(2); assert pg.evaluate("navigator.clipboard.readText()") == cmd
            mine = agents(htok); assert len(mine) == 1 and mine[0]["name"] == "Campw's Claude" and mine[0]["invited"], mine
            hclaude = mine[0]["id"]
            assert "Waiting for your Claude" in pg.text_content("#ic-status")
            assert mcp(hkey, "initialize", {"protocolVersion": "2025-06-18"})[0] == 200
            pg.wait_for_function("document.querySelector('#ic-status').textContent.includes(\"Campw's Claude joined\")", timeout=10000)
            pg.evaluate("TribeInvite.close()")

            # Maya connected a Claude with Connect your AI before: it shows as already connected, and no second member is made
            leg = ok(api("/agents", "POST", {}, token=mtok), "Connect your AI (the old way)")
            lkey, lid = leg["token"], leg["agent"]["id"]; assert leg["agent"]["name"] == "Claude · Maya"
            mctx = b.new_context(viewport={"width": 1360, "height": 900}); mctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            mp = mctx.new_page(); mp.on("pageerror", lambda e: errors.append("maya: " + str(e)))
            mp.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Maya', onboarded: true, tour: {done: true}, server: {url: '', token: '%s'}})) } catch (e) {}" % mtok)
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInvite", timeout=25000)
            mp.evaluate("TribeInviteClaude.open()"); mp.wait_for_selector("#ic-body #ic-access")
            assert "Claude · Maya is already connected" in mp.text_content("#ic-status") and "already connected" in mp.text_content("#ic-body .lead")
            assert mp.locator("#ic-body [data-ic-text]").count() == 0 and mp.locator("#ic-new").is_visible(), "the setup waits behind New key and setup"
            assert mp.locator("#ic-merge").count() == 0 and mp.locator("#ic-pause").is_visible() and mp.locator("#ic-remove").is_visible() and mp.locator("#ic-body [data-ic-scope]").count() == 6
            ma = [a for a in agents(mtok) if a.get("owner") == mid]; assert [a["id"] for a in ma] == [lid], "no second member"
            # its controls: narrow, pause
            assert tool(lkey, "list_tasks")[0]
            mp.uncheck("#ic-body [data-ic-scope='tasks']"); mp.wait_for_function("!document.querySelector(\"#ic-body [data-ic-scope='tasks']\").checked")
            until(lambda: "turned off Tasks" in tool(lkey, "list_tasks")[1], "narrowing a Connect-your-AI Claude takes effect")
            assert tool(lkey, "list_docs")[0], "the other areas still work"
            mp.check("#ic-body [data-ic-scope='tasks']"); until(lambda: tool(lkey, "list_tasks")[0], "ticked again")
            mp.check("#ic-pause"); mp.wait_for_function("document.querySelector('#ic-status').textContent.includes('Paused')")
            assert mcp(lkey, "ping")[0] == 401, "Pause refuses a Connect-your-AI Claude's key at once"
            mp.uncheck("#ic-pause"); until(lambda: mcp(lkey, "ping")[0] == 200, "resumed")
            # a new key: the same member, the old key stops
            mp.click("#ic-new"); mp.wait_for_selector("#cc-cmd"); assert "••••" in mp.text_content("#cc-cmd")
            assert mcp(lkey, "ping")[0] == 200, "nothing changes until Copy"
            mp.click("#ic-body [data-ic-copy='code']"); mp.wait_for_function("!document.querySelector('#cc-cmd').textContent.includes('••••')", timeout=10000)
            nkey = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", mp.text_content("#cc-cmd")).group(1)
            until(lambda: mcp(lkey, "ping")[0] == 401, "the old key stops"); assert mcp(nkey, "ping")[0] == 200
            ma = [a for a in agents(mtok) if a.get("owner") == mid]; assert [a["id"] for a in ma] == [lid], ("still one member", ma)
            st, j, _ = mcp(nkey, "initialize", {}); assert "Claude · Maya" in j["result"]["instructions"]
            mp.evaluate("TribeInvite.close()")

            # Sam has two (one from each feature, as before this change): both keep working, shown together with the merge hint
            stok, sid = sam["token"], sam["member"]["id"]
            s_inv = ok(api("/invite-claude", "POST", {}, token=stok))["token"]
            s_leg = ok(api("/agents", "POST", {}, token=stok))["token"]
            v = ok(api("/invite-claude", token=stok)); assert v["merge"] and [c["via"] for c in v["claudes"]] == ["invite", "connect"], v["claudes"]
            assert mcp(s_inv, "ping")[0] == 200 and mcp(s_leg, "ping")[0] == 200, "two Claudes both keep working"
            sp = mctx.new_page(); sp.on("pageerror", lambda e: errors.append("sam: " + str(e)))
            sp.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Sam', onboarded: true, tour: {done: true}, server: {url: '', token: '%s'}})) } catch (e) {}" % stok)
            sp.goto(BASE + "/?skipIntro=1"); sp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInvite && TribeClient.state().me && TribeClient.state().me.name === 'Sam'", timeout=25000)
            sp.evaluate("TribeInviteClaude.open()"); sp.wait_for_selector("#ic-merge")
            assert "two Claudes" in sp.text_content("#ic-merge") and sp.locator("#ic-body .ic-access").count() == 2 and sp.locator("#ic-body [data-ic-keep]").count() == 2
            assert "Sam's Claude" in sp.text_content("#ic-body") and "Claude · Sam" in sp.text_content("#ic-body")
            sp.screenshot(path=str(SHOTS / "invite-one-merge.png"))
            keep = sp.locator("#ic-body .ic-access").first.locator("[data-ic-keep]")
            keep.click(); time.sleep(0.8); assert mcp(s_leg, "ping")[0] == 200, "one tap asks first: nothing is removed silently"
            keep.click(); sp.wait_for_selector("#ic-merge", state="detached", timeout=10000)
            assert mcp(s_leg, "ping")[0] == 401 and mcp(s_inv, "ping")[0] == 200
            sp.close()
            print("C ok: no Claude until Copy; a Connect-your-AI Claude is shown as already connected with its controls; two show with Merge")

            # ================= D: sign-in for the claude.ai connector (a scripted client) =================
            st, j, hd = http("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": "ping"})
            assert st == 401 and "resource_metadata=" in hd["WWW-Authenticate"], hd.get("WWW-Authenticate")
            prm_url = re.search(r'resource_metadata="([^"]+)"', hd["WWW-Authenticate"]).group(1)
            assert prm_url == BASE + "/.well-known/oauth-protected-resource/mcp"
            st, prm, _ = http("/.well-known/oauth-protected-resource/mcp"); assert st == 200 and prm["resource"] == BASE + "/mcp" and prm["authorization_servers"] == [BASE], prm
            assert http("/.well-known/oauth-protected-resource")[1] == prm
            st, asm, _ = http("/.well-known/oauth-authorization-server"); assert st == 200 and asm["issuer"] == BASE, asm
            assert asm["code_challenge_methods_supported"] == ["S256"] and "none" in asm["token_endpoint_auth_methods_supported"] and asm["registration_endpoint"] and "refresh_token" in asm["grant_types_supported"]
            ep = lambda k: urllib.parse.urlparse(asm[k]).path
            # asked on the public address, the documents name the public address
            st, pprm, _ = http("/.well-known/oauth-protected-resource", headers={"Host": "tribe.example", "X-Forwarded-Proto": "https"}); assert pprm["resource"] == PUBLIC + "/mcp", pprm
            # registration: redirect URIs are validated
            CB = f"http://127.0.0.1:{PORT}/api/health"
            for bad in (["http://evil.example/cb"], ["javascript:alert(1)"], ["https://claude.ai/cb#frag"], ["https://user:pw@claude.ai/cb"], [], "https://claude.ai/cb", ["myapp://cb"]):
                st, j, _ = http(ep("registration_endpoint"), "POST", {"redirect_uris": bad, "client_name": "x"}); assert st == 400 and j["error"] == "invalid_redirect_uri", (bad, st, j)
            st, j, _ = http(ep("registration_endpoint"), "POST", {"redirect_uris": ["https://claude.ai/api/mcp/auth_callback"], "token_endpoint_auth_method": "client_secret_post"}); assert st == 400, "public clients only"
            st, reg, _ = http(ep("registration_endpoint"), "POST", {"redirect_uris": ["https://claude.ai/api/mcp/auth_callback", CB], "client_name": "Claude <script>"})
            assert st == 201 and reg["client_id"].startswith("tcc_") and reg["token_endpoint_auth_method"] == "none" and "<" not in reg["client_name"], reg
            cid = reg["client_id"]

            def authorize(redirect=CB, challenge=None, state="st8", extra=None, client=cid):
                q = {"response_type": "code", "client_id": client, "redirect_uri": redirect, "state": state, "resource": BASE + "/mcp", "scope": "tribe"}
                if challenge: q.update(code_challenge=challenge, code_challenge_method="S256")
                q.update(extra or {})
                return http(ep("authorization_endpoint") + "?" + urllib.parse.urlencode({k: v for k, v in q.items() if v is not None}))
            ver, ch = pkce()
            # a redirect that wasn't registered: a page, never a redirect
            for badr in ("https://evil.example/cb", "https://claude.ai/api/mcp/auth_callback/x", CB + "?x=1", "http://127.0.0.1.evil.example/api/health"):
                st, body, hd = authorize(redirect=badr, challenge=ch); assert st == 400 and not hd.get("Location") and "can't continue" in body, (badr, st)
            st, body, hd = authorize(challenge=ch, client="tcc_nope"); assert st == 400 and not hd.get("Location")
            # a loopback redirect may use any port
            st, _, hd = authorize(redirect=f"http://127.0.0.1:{PORT + 1}/api/health", challenge=ch); assert st == 302 and hd["Location"].startswith("/agent-consent.html#rid="), hd.get("Location")
            # no PKCE, a plain challenge, another resource: back to the client with an error
            for extra, err in (({}, "invalid_request"), ({"code_challenge": ch, "code_challenge_method": "plain"}, "invalid_request"), ({"code_challenge": ch, "code_challenge_method": "S256", "resource": "https://other.example/mcp"}, "invalid_target"), ({"code_challenge": ch, "code_challenge_method": "S256", "response_type": "token"}, "unsupported_response_type")):
                st, _, hd = authorize(extra=extra); loc = urllib.parse.urlparse(hd["Location"]); qq = urllib.parse.parse_qs(loc.query)
                assert st == 302 and hd["Location"].startswith(CB) and qq["error"] == [err] and qq["state"] == ["st8"], (extra, hd["Location"])

            def consent_url(v_c=None):
                v, c = v_c or pkce()
                st, _, hd = authorize(challenge=c); assert st == 302 and hd["Location"].startswith("/agent-consent.html#rid="), (st, hd.get("Location"))
                return v, hd["Location"]
            def code_of(url):
                qq = urllib.parse.parse_qs(urllib.parse.urlparse(url).query); assert qq.get("state") == ["st8"] and qq.get("iss") == [BASE], url
                return qq["code"][0]
            def exchange(code, verifier, **more):
                return http(ep("token_endpoint"), "POST", form={"grant_type": "authorization_code", "code": code, "code_verifier": verifier, "client_id": cid, "redirect_uri": CB, "resource": BASE + "/mcp", **more})
            def refresh(rt): return http(ep("token_endpoint"), "POST", form={"grant_type": "refresh_token", "refresh_token": rt, "client_id": cid})

            # --- the consent page, signed in: Gus's guest can't, the host approves
            # Rio (project-only friend, no Claude yet) approves on TribeCode's own page: the member is made by that approval
            rctx = b.new_context(viewport={"width": 1100, "height": 800})
            rp = rctx.new_page(); rp.on("pageerror", lambda e: errors.append("rio: " + str(e)))
            rp.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Rio', onboarded: true, tour: {done: true}, server: {url: '', token: '%s'}})) } catch (e) {}" % rio["token"])
            v1, loc = consent_url()
            assert not [a for a in agents(htok) if a.get("owner") == rio["member"]["id"]]
            rp.goto(BASE + loc); rp.wait_for_selector("#c-signed:not([hidden]) #c-yes", timeout=15000)
            assert "Let Claude join as Rio's Claude?" in rp.text_content("#c-title"), rp.text_content("#c-title")
            facts = rp.inner_text("#c-facts"); assert "Claude script" in facts.replace("<", "").replace(">", "") and f"127.0.0.1:{PORT}" in facts and "<script>" not in rp.inner_html("#c-facts"), facts
            rp.screenshot(path=str(SHOTS / "invite-one-consent.png"))
            assert not [a for a in agents(htok) if a.get("owner") == rio["member"]["id"]], "nothing is made until the person approves"
            with rp.expect_navigation(url=re.compile(r"/api/health\?"), timeout=15000): rp.click("#c-yes")
            code = code_of(rp.url)
            # a wrong verifier is refused, and the code is spent
            st, j, _ = exchange(code, pkce()[0]); assert st == 400 and j["error"] == "invalid_grant", j
            st, j, _ = exchange(code, v1); assert st == 400 and j["error"] == "invalid_grant", "one try per code"
            # again, properly
            v1, loc = consent_url(); rp.goto(BASE + loc); rp.wait_for_selector("#c-signed:not([hidden]) #c-yes", timeout=15000)
            with rp.expect_navigation(url=re.compile(r"/api/health\?"), timeout=15000): rp.click("#c-yes")
            code = code_of(rp.url)
            st, j, _ = exchange(code, v1, client_id="tcc_other"); assert st == 400, "another client can't redeem it"
            st, j, _ = exchange(code, v1, redirect_uri="https://claude.ai/api/mcp/auth_callback"); assert st == 400, "the redirect must match"
            st, tok, hd = exchange(code, v1); assert st == 200 and tok["token_type"] == "Bearer" and tok["expires_in"] == 3600 and tok["refresh_token"] and hd["Cache-Control"] == "no-store", tok
            a1, r1 = tok["access_token"], tok["refresh_token"]; assert a1.startswith("tcm_") and r1.startswith("tcmr_")
            st, j, _ = exchange(code, v1); assert st == 400 and j["error"] == "invalid_grant", "a code works once"
            assert mcp(a1, "ping")[0] == 401, "replaying a code ends the tokens it made"
            # once more for a grant we keep
            v1, loc = consent_url(); rp.goto(BASE + loc); rp.wait_for_selector("#c-yes")
            with rp.expect_navigation(url=re.compile(r"/api/health\?"), timeout=15000): rp.click("#c-yes")
            st, tok, _ = exchange(code_of(rp.url), v1); assert st == 200, tok
            a1, r1 = tok["access_token"], tok["refresh_token"]
            # the token is Rio's invited Claude, with Rio's access and never more
            rc = [a for a in agents(htok) if a.get("owner") == rio["member"]["id"]]; assert len(rc) == 1 and rc[0]["name"] == "Rio's Claude" and rc[0]["invited"], rc
            st, j, _ = mcp(a1, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "claude-ai"}}); assert st == 200 and "You are Rio's Claude" in j["result"]["instructions"], j
            assert tool(a1, "list_tasks")[0]
            st, j, _ = mcp(a1, "tools/call", {"name": "list_tasks", "arguments": {"project": pid2}}); assert j["result"].get("isError"), "its projects are Rio's: not the other project"
            okk, txt = tool(a1, "tribe_api", {"method": "GET", "path": "invite-claude"}); assert not okk and "Not available" in txt, txt
            okk, txt = tool(a1, "tribe_api", {"method": "POST", "path": "invites", "body": {}}); assert not okk, "it can't invite people"
            assert api("/claude-auth", "POST", {"rid": "x"}, token=a1)[0] == 403 and api("/me", token=a1)[0] == 200
            assert mcp("", "ping", query="?token=" + a1)[0] == 401, "an access token never works from a URL"
            assert api("/me", token=r1)[0] == 401, "a refresh token is not a key"
            rt = rio["token"]
            ok(api("/invite-claude", "PUT", {"scopes": ["chat"]}, token=rt)); okk, txt = tool(a1, "list_tasks"); assert not okk and "turned off Tasks" in txt
            ok(api("/invite-claude", "PUT", {"scopes": ["chat", "docs", "tasks", "files", "website", "approvals"], "paused": True}, token=rt)); assert mcp(a1, "ping")[0] == 401, "Pause refuses the token"
            ok(api("/invite-claude", "PUT", {"paused": False}, token=rt)); assert mcp(a1, "ping")[0] == 200
            conns = ok(api("/invite-claude", token=rt))["claudes"][0]["connections"]; assert len(conns) == 1 and conns[0]["client"] == "Claude script" and conns[0]["host"] == f"127.0.0.1:{PORT}", conns
            # hashed at rest: no token, code or verifier in the tribe folder or the log
            disk = "".join(f.read_text(errors="ignore") for f in (tmp / "tribe" / ".tribe").glob("*.json")) + log.read_text(errors="ignore")
            for secret in (a1, r1, hkey, nkey, v1): assert secret not in disk, "a secret reached the disk or the log"
            assert hashlib.sha256(a1.encode()).hexdigest() in disk
            # refresh rotates; the old pair stops
            st, tok2, _ = refresh(r1); assert st == 200 and tok2["access_token"] != a1 and tok2["refresh_token"] != r1, tok2
            a2, r2 = tok2["access_token"], tok2["refresh_token"]
            assert mcp(a1, "ping")[0] == 401 and mcp(a2, "ping")[0] == 200
            st, j, _ = http(ep("token_endpoint"), "POST", form={"grant_type": "refresh_token", "refresh_token": r2, "client_id": "tcc_other"}); assert st == 400, "another client can't refresh it"
            # a used refresh token again: refused, and the whole grant ends
            st, j, _ = refresh(r1); assert st == 400 and j["error"] == "invalid_grant", j
            assert mcp(a2, "ping")[0] == 401 and refresh(r2)[0] == 400, "reuse ends the grant"
            st, j, _ = http(ep("token_endpoint"), "POST", form={"grant_type": "password", "username": "x"}); assert st == 400 and j["error"] == "unsupported_grant_type"
            # revoke (RFC 7009)
            v1, loc = consent_url(); rp.goto(BASE + loc); rp.wait_for_selector("#c-yes")
            with rp.expect_navigation(url=re.compile(r"/api/health\?"), timeout=15000): rp.click("#c-yes")
            st, tok, _ = exchange(code_of(rp.url), v1); a3, r3 = tok["access_token"], tok["refresh_token"]; assert mcp(a3, "ping")[0] == 200
            assert http(ep("revocation_endpoint"), "POST", form={"token": r3})[0] == 200
            assert mcp(a3, "ping")[0] == 401 and refresh(r3)[0] == 400, "revoked"
            # Not now: back to the client with access_denied, nothing issued
            v1, loc = consent_url(); rp.goto(BASE + loc); rp.wait_for_selector("#c-no")
            with rp.expect_navigation(url=re.compile(r"/api/health\?"), timeout=15000): rp.click("#c-no")
            assert "error=access_denied" in rp.url and "code=" not in rp.url
            rctx.close()

            # --- not signed in on that address: the page shows a code, the host types it in the sheet and approves there
            actx = b.new_context(viewport={"width": 1100, "height": 800}); ap = actx.new_page(); ap.on("pageerror", lambda e: errors.append("anon: " + str(e)))
            v4, loc = consent_url(); ap.goto(BASE + loc); ap.wait_for_selector("#c-code:not([hidden]) #c-usercode", timeout=15000)
            ucode = ap.text_content("#c-usercode").replace(" ", ""); assert re.match(r"^[A-Z2-9]{6}$", ucode), ucode
            assert ap.locator("#c-yes").is_hidden(), "nobody to approve here"
            assert api("/claude-auth?code=" + ucode, token=g["token"])[0] == 200 and api("/claude-auth", "POST", {"code": ucode}, token=g["token"])[0] == 403, "a guest can't approve"
            pg.click("#sf-claude"); pg.wait_for_selector("#ic-body #ic-access"); pg.click("#ic-new"); pg.click("#ic-body [data-ic-kind='web']")
            pg.fill("#ic-code", "ZZZZZZ"); pg.click("#ic-code-go"); time.sleep(0.8); assert pg.locator("#ic-ask-yes").count() == 0, "a wrong code shows nothing to approve"
            pg.fill("#ic-code", ucode.lower()); pg.click("#ic-code-go"); pg.wait_for_selector("#ic-ask-yes")
            assert "Claude script" in pg.text_content("#ic-approve").replace("<", "").replace(">", "") and f"127.0.0.1:{PORT}" in pg.text_content("#ic-approve") and "Campw's Claude" in pg.text_content("#ic-approve")
            with ap.expect_navigation(url=re.compile(r"/api/health\?"), timeout=20000): pg.click("#ic-ask-yes")
            st, tok, _ = exchange(code_of(ap.url), v4); assert st == 200, tok
            a4 = tok["access_token"]
            st, j, _ = mcp(a4, "initialize", {}); assert "You are Campw's Claude" in j["result"]["instructions"]
            hc = [a for a in agents(htok) if a.get("owner") == host_id]; assert [a["id"] for a in hc] == [hclaude], "the sign-in maps to the Claude the host already has: no second member"
            assert mcp(hkey, "ping")[0] == 200, "the header key (Claude Code, Desktop) keeps working beside it"
            actx.close()
            # revocable from the sheet
            pg.wait_for_selector("#ic-body [data-ic-revoke]", timeout=10000)
            assert "Claude script" in pg.text_content("#ic-body .ic-conns").replace("<", "").replace(">", "")
            pg.click("#ic-body [data-ic-revoke]"); pg.wait_for_selector("#ic-body [data-ic-revoke]", state="detached", timeout=10000)
            until(lambda: mcp(a4, "ping")[0] == 401, "Sign out ends that sign-in"); assert mcp(hkey, "ping")[0] == 200, "…and only that one"
            pg.evaluate("TribeInvite.close()")
            # the old link with the key in it still works for people who have one
            assert mcp("", "ping", query="?token=" + hkey)[0] == 200
            # Remove ends every sign-in too
            v5, c5 = pkce(); st, _, hd = authorize(challenge=c5); rid5 = hd["Location"].split("rid=")[1]
            r = ok(api("/claude-auth", "POST", {"rid": rid5}, token=mtok)); st, tok, _ = exchange(code_of(r["redirect"]), v5); a5 = tok["access_token"]
            st, j, _ = mcp(a5, "initialize", {}); assert "Claude · Maya" in j["result"]["instructions"], "Maya's sign-in maps to the Claude she has"
            ok(api("/invite-claude", "DELETE", token=mtok)); assert mcp(a5, "ping")[0] == 401 and mcp(nkey, "ping")[0] == 401
            # rate-limited
            codes = [http(ep("registration_endpoint"), "POST", {"redirect_uris": ["https://claude.ai/api/mcp/auth_callback"]})[0] for _ in range(24)]
            assert 429 in codes and codes[0] == 201, codes
            codes = [http(ep("token_endpoint"), "POST", form={"grant_type": "refresh_token", "refresh_token": "tcmr_nope"})[0] for _ in range(45)]
            assert 429 in codes and codes.count(400) >= 10, codes
            print("D ok: discovery, registration, PKCE, consent (page and typed code), token, rotation, reuse, revoke; bad redirect and wrong verifier refused; the token is the person's Claude")

            # ================= E: signed out isn't stuck; devices are named =================
            dev = ok(api("/device-link", "POST", {}, token=mtok)); red = ok(api("/device-link/redeem", "POST", {"key": dev["key"]}, headers={"User-Agent": WIN_UA}))
            d = [x for x in ok(api("/devices", token=mtok))["devices"] if x["id"] == red["device"]["id"]][0]
            assert d["browser"] == "Chrome" and d["os"] == "Windows", d
            mp.evaluate("TribeSettings.open('account')"); mp.wait_for_selector("#set-devices .set-list li", timeout=10000)
            mp.wait_for_function("document.querySelector('#set-devices').innerText.includes('Chrome on Windows')", timeout=10000)
            assert "This device" in mp.inner_text("#set-devices") and "Chrome on Linux" in mp.inner_text("#set-devices"), mp.inner_text("#set-devices")
            mp.evaluate("TribeSettings.close && TribeSettings.close()"); mp.keyboard.press("Escape")
            mp.evaluate(f"TribeProjects.switchTo('{pid2}', 'home')"); mp.wait_for_function(f"TribeProjects.current() === '{pid2}'", timeout=10000)
            mp.evaluate("TribeRouter.go('tasks')"); mp.wait_for_function("TribeRouter.where().key === 'tasks'", timeout=10000)
            was = mp.evaluate("TribeRouter.where()")
            ok(api("/me/signout-others", "POST", {}, token=red["token"])); new = red["token"]   # another device signs this browser out (and keeps its own sign-in)
            assert api("/me", token=mtok)[0] == 401
            mp.wait_for_selector("#so-note #so-login", timeout=60000)
            assert "This device was signed out of the tribe" in mp.inner_text("#so-note")
            mp.screenshot(path=str(SHOTS / "invite-one-signed-out.png"))
            mp.click("#so-login"); mp.wait_for_selector("#ac-login", state="visible", timeout=10000)
            assert json.loads(mp.evaluate("sessionStorage.getItem('tribecode.return')"))["key"] == "tasks"
            mp.evaluate("TribeApp.show('home')")   # wander off behind the sign-in sheet; signing in still returns to where they were
            mp.evaluate("(t) => { TribeStore.set({ server: { ...TribeStore.get().server, token: t } }); TribeClient.connect(); }", new)   # what any sign-in ends with
            mp.wait_for_function("TribeClient.connected() && !document.querySelector('#so-note') && !document.querySelector('#ac-login')", timeout=20000)
            mp.wait_for_function("TribeRouter.where().key === 'tasks'", timeout=10000)
            now = mp.evaluate("TribeRouter.where()"); assert now["project"] == was["project"] == pid2 and now["key"] == "tasks", (was, now)
            assert mp.evaluate("sessionStorage.getItem('tribecode.return')") is None
            mctx.close()
            print("E ok: Log in again opens sign-in and returns to the same place; the device list names browser and system")

            # ================= F: 390px =================
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page(); ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Campw', onboarded: true, tour: {done: true}, server: {url: '', token: '%s'}})); localStorage.setItem('tribecode.intro.v1', 'seen') } catch (e) {}" % htok)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeInvite", timeout=25000)
            if ph.locator("#ins-later").count() and ph.locator("#ins-later").is_visible(): ph.click("#ins-later")
            fits = "(() => { const c = document.querySelector('.modal-card.io'), r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 && [...c.querySelectorAll('.io-opt, .linkbox, .io-sw, .cai-pre, .ic-scope, .btn')].every(e => { const b = e.getBoundingClientRect(); return !b.width || (b.left >= r.left - 1 && b.right <= r.right + 1); }); })()"
            for who in ("friend", "guest", "agent"):
                ph.evaluate(f"TribeApp.openInvite({{ who: '{who}' }})"); ph.wait_for_selector(f"#invite-modal:not(.hidden) #io-pane[data-who='{who}']")
                ph.wait_for_selector("#tl-link" if who == "friend" else "#io-guest-make" if who == "guest" else "#ic-body #ic-status"); time.sleep(0.5)
                assert ph.evaluate(fits), f"the {who} pane fits 390px"
                assert all(ph.locator(f"#io-who-{w}").is_visible() for w in ("friend", "guest", "agent"))
                if who == "friend":
                    ph.tap("#io-once"); ph.wait_for_function("/\\/join\\//.test(document.querySelector('#inv-link').textContent)", timeout=10000); time.sleep(0.3); assert ph.evaluate(fits), "the one-time link fits 390px"
                    ph.screenshot(path=str(SHOTS / "invite-one-phone.png"))
                ph.evaluate("TribeInvite.close()")
            print("F ok: 390px")
            b.close()
        assert not errors, errors
        print("ok e2e_invite_one")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
