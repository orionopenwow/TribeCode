"""Agents & office: the Agents hub and the office as one view inside the app (app/ui/agentsoffice.js, agentsdash.js,
office.js, feat/agents-office). GitHub is a stand-in (app/test/ghmock.py); AI helpers are simulated MCP clients.
  1. The view renders in the main area (no overlay), the office filling it (desks while the pixel floor is off), and the
     side panel's Working on with Add an AI helper and the four loops (app/ui/officefull.js lays the page out). The old doors lead here: the sidebar row, TribeShell.go('agents'),
     TribeAgentsHub.office(), Settings, "Your AI tools"' back link, and Home's row (the same page for every project).
  2. Add an AI helper: Claude → the one setup (the invite sheet) → Copy → a simulated Claude Code connects → it sits at a
     desk and shows in the list → give it a first task from its card → it asks for an OK → Approve from the same card.
  3. Click a person or an AI helper: a desk, the avatars in the head line and the floor itself open the same actions.
  4. Bring a friend: the tribe link → a second browser on a 390px phone joins with join.html → the friend is at a desk.
  5. Where your tribe runs (from the office's ... menu, like 6 and 7): the current state and four options, each opening its flow (direct link, folder, free cloud).
  6. Back up to GitHub: no account → GitHub's sign-up link, then sign in (a token, stand-in) → create → linked, and the
     card says so.
  7. What's private: only true lines ("not end-to-end encrypted"; this computer talks to itself); a third person can't
     open someone else's private message.
  8. 390px: the desks are the list, nothing scrolls sideways, targets are at least 40px.
Screenshots: /tmp/agents-office-1440.png, /tmp/agents-office-add-ai.png, /tmp/agents-office-390.png.
Usage: python app/test/e2e_agents_office.py"""
import json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6790 + OFF; GH_PORT = 6791 + OFF; BASE = f"http://localhost:{PORT}"
TOKEN = "ghp_" + "q1W2e3R4t5" * 4
ghmock.GOOD[TOKEN] = "camp-dev"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def mcp(token, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())


def tool(token, name, args=None): return mcp(token, "tools/call", {"name": name, "arguments": args or {}})["result"]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ao-", dir="/tmp"))
    gh = ghmock.start(GH_PORT); ghmock.reset()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_GITHUB_API": f"http://127.0.0.1:{GH_PORT}", "TRIBE_GITHUB_WEB": f"http://127.0.0.1:{GH_PORT}"}
    env.pop("TRIBE_GITHUB_CLIENT_ID", None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"name": "Star Hopper"}, token=camp))["project"]["id"]
        # feat/p13-office: the pixel floor is on by default; this test starts with it off to cover the desks and the offer
        assert ok(api("/office", token=camp))["on"] is True, "the pixel floor is on in a new tribe"
        ok(api("/office", "PUT", {"on": False}, token=camp))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(tok, name, w=1440, h=900, mobile=False):
                kw = {"viewport": {"width": w, "height": h}}
                if mobile: kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
                c = b.new_context(**kw)
                c.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.office.view', 'floor');"
                                  " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}" % (name, BASE, tok))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAgentsOffice && window.TribeOffice && window.TribeShell && window.TribeInvite", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_function(f"TribeProjects.current() === '{pid}'", timeout=10000)
                return pg

            def to_view(pg):
                pg.evaluate("TribeShell.go('ws-agents')")
                pg.wait_for_selector("#view-coord:not(.hidden) #ao-head", timeout=15000)
                pg.wait_for_selector("#ad-office .of-desk, #ad-office .os-stage", timeout=15000)

            def work(pg):   # the side panel's Working on
                pg.evaluate("TribeOfficeFull.open('work')"); pg.wait_for_selector("#ofl-pane-work:not([hidden])", timeout=5000)

            def menu(pg, k):   # an item of the office's ... menu
                if not pg.locator("#ao-menu").count(): pg.click("#ao-more")
                pg.wait_for_selector(f"#ao-menu [data-aom='{k}']", timeout=5000)
                return f"#ao-menu [data-aom='{k}']"

            cp = page(camp, "Camp")

            # ---------- 1. one view, inside the app ----------
            assert cp.inner_text("#nest-ws-agents").strip() == "Agents & office", cp.inner_text("#nest-ws-agents")
            cp.click("#nest-ws-agents"); cp.wait_for_selector("#view-coord:not(.hidden) #ao-head", timeout=15000)
            cp.wait_for_selector("#ad-office [data-desk='flint']", timeout=15000)
            work(cp)
            assert cp.evaluate("!!document.querySelector('#main #view-coord #ad-office') && !document.querySelector('.ui-scrim') && !document.querySelector('#invite-modal:not(.hidden)')"), "in the main area, not an overlay"
            assert cp.evaluate("document.querySelector('#ao-head').compareDocumentPosition(document.querySelector('#ad-office')) & Node.DOCUMENT_POSITION_FOLLOWING"), "the office right under the title"
            assert cp.evaluate("document.querySelector('#ad-office').compareDocumentPosition(document.querySelector('#ad-hero')) & Node.DOCUMENT_POSITION_FOLLOWING"), "the agents' state under the office"
            assert cp.locator("#ad-hero[data-state='connect'] [data-ao-pick]").count() == 8, cp.inner_text("#ad-hero")
            picks = cp.eval_on_selector_all("#ad-hero .ao-picks [data-ao-pick]", "els => els.map(e => e.dataset.aoPick)")
            assert picks == ["claude", "chatgpt", "codex", "gemini", "cursor", "local", "free"], picks
            assert cp.locator("#ao-setup .ao-card").count() == 4
            assert not [m for m in ok(api("/members", token=camp))["members"] if m["role"] == "agent"], "opening the view makes no AI helper"
            assert cp.get_attribute("#ad-office [data-of-on]", "class") is not None, "the host is offered the pixel floor"
            text = cp.inner_text("#view-coord")
            for w in ("MCP", " repo", "P2P", "deploy", " sync "): assert w not in text, f"plain words: {w}"
            cp.wait_for_timeout(500); cp.screenshot(path="/tmp/agents-office-empty-1440.png")
            # every old door leads here
            for door in ["TribeShell.go('home')", "TribeShell.go('agents')"]:
                cp.evaluate(door)
            cp.wait_for_selector("#view-coord:not(.hidden) #ao-head", timeout=10000)
            cp.evaluate("TribeShell.go('home')"); cp.wait_for_timeout(300); cp.evaluate("TribeAgentsHub.office()"); cp.wait_for_selector("#view-coord:not(.hidden) #ao-head", timeout=10000)
            cp.evaluate("TribeAgentsHub.open()"); cp.wait_for_selector("#view-agents-hub:not(.hidden) [data-ah-back]", timeout=10000)
            assert "Your AI tools" in cp.inner_text("#view-agents-hub h1")
            cp.click("[data-ah-back]"); cp.wait_for_selector("#view-coord:not(.hidden) #ao-head", timeout=10000)
            cp.evaluate("TribeHub.open('home')"); cp.wait_for_selector("#nest-fleet", timeout=10000)
            assert cp.inner_text("#nest-fleet").strip() == "All agents & offices", cp.inner_text("#nest-fleet")
            cp.click("#nest-fleet"); cp.wait_for_selector("#view-agents-hub:not(.hidden) #ao-head", timeout=10000)
            cp.wait_for_selector("#view-agents-hub #ad-office [data-desk='flint']", timeout=10000)
            cp.wait_for_selector("#view-agents-hub #ao-setup", timeout=10000)
            assert cp.evaluate("document.body.dataset.view") == "agents-hub"
            cp.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); cp.wait_for_timeout(400)
            to_view(cp); work(cp)
            print("ok  1. one view inside the app; every old door leads to it")

            # ---------- 2. add an AI helper, end to end ----------
            cp.context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            cp.evaluate("document.querySelector('#ad-hero').scrollIntoView({ block: 'center' })"); cp.wait_for_timeout(300)
            cp.screenshot(path="/tmp/agents-office-add-ai.png")
            cp.click("#ad-hero [data-ao-pick='claude']")
            cp.wait_for_selector("#invite-modal:not(.hidden) #ic-body [data-ic-kind='code'].on", timeout=10000)
            cp.wait_for_timeout(300); cp.screenshot(path="/tmp/agents-office-add-ai-setup.png")
            cp.click("#ic-body [data-ic-copy='code']")
            cp.wait_for_function("!document.querySelector(\"#ic-body [data-ic-text='code']\").textContent.includes('••••')", timeout=10000)
            cmd = cp.text_content("#ic-body [data-ic-text='code']")
            m = re.search(r'Bearer ([A-Za-z0-9_-]{20,})', cmd); assert m, cmd
            key = m.group(1)
            st = mcp(key, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "claude-code"}}); assert st["result"]["serverInfo"]["name"] == "tribecode"
            tool(key, "my_lane", {})
            cp.wait_for_function("document.querySelector('#ic-status') && document.querySelector('#ic-status').textContent.includes('joined')", timeout=15000)
            cp.evaluate("TribeInvite.close()")
            aid = [m for m in ok(api("/members", token=camp))["members"] if m["role"] == "agent"][0]["id"]
            cp.wait_for_function("document.querySelector('[data-hub]') && document.querySelector('[data-hub]').dataset.hub === 'dash'", timeout=20000)
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_selector(f"#ad-office .of-desk[data-desk='{aid}'][data-role='agent']", timeout=15000)
            cp.wait_for_selector(f"#fl-agents [data-fl-agent='{aid}']", timeout=15000)
            assert "Not connected" not in cp.inner_text(f"#fl-agents [data-fl-agent='{aid}']")
            # a first task, from its card
            cp.click(f"#ad-office .of-desk[data-desk='{aid}']"); cp.wait_for_selector("#of-card [data-os-give] input", timeout=8000)
            cp.fill("#of-card [data-os-give] input", "Add a high score screen"); cp.press("#of-card [data-os-give] input", "Enter")
            deadline = time.time() + 10
            while time.time() < deadline:
                ts = [t for t in ok(api("/tasks", token=camp, project=pid)).get("tasks", []) if t.get("title") == "Add a high score screen"]
                if ts: break
                time.sleep(0.3)
            assert ts and ts[0].get("assignee") == aid, ts
            cp.keyboard.press("Escape"); cp.wait_for_selector("#of-card", state="detached", timeout=5000)
            # it asks for an OK; Approve from the same card
            tool(key, "request_approval", {"title": "Drop the old scores table", "risk": "high"})
            cp.evaluate("TribeOffice.refresh()"); cp.wait_for_timeout(800)
            cp.click(f"#ad-office .of-desk[data-desk='{aid}']"); cp.wait_for_selector("#of-card [data-os-ap='approve']", timeout=10000)
            cp.click("#of-card [data-os-ap='approve']")
            cp.wait_for_function("[...document.querySelectorAll('.toast, #toast, [role=status]')].some(e => (e.textContent || '').includes('Approved'))", timeout=8000)
            cp.keyboard.press("Escape")
            print("ok  2. add an AI helper: pick, the one setup, connected at a desk and in the list, a first task, approve")

            # ---------- 4. bring a friend (before 3, so there is a person to click) ----------
            cp.click("#ao-head [data-ao='friend']"); cp.wait_for_function("/\\/t\\//.test((document.querySelector('#tl-link') || {}).textContent || '')", timeout=10000)
            link = cp.text_content("#tl-link").strip()
            cp.evaluate("TribeInvite.close()")
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page()
            ph.on("pageerror", lambda e: errors.append(f"maya: {e}"))
            ph.goto(BASE + urllib.parse.urlparse(link).path)   # the link carries this computer's network address; the test browser uses localhost
            ph.wait_for_selector("#form:not(.hidden)", timeout=20000); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=30000)
            if ph.locator("#install-sheet:visible").count(): ph.click("#ins-later")
            maya = [m for m in ok(api("/members", token=camp))["members"] if m["name"] == "Maya"][0]["id"]
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_selector(f"#ad-office .of-desk[data-desk='{maya}'][data-role='person']", timeout=15000)
            cp.wait_for_function(f"document.querySelector(\"#ad-office .of-desk[data-desk='{maya}']\").dataset.state !== 'off'", timeout=15000)
            cp.wait_for_function("document.querySelector('#ao-lead').textContent.includes('2 people online')", timeout=10000)
            print("ok  4. bring a friend: one link, a phone joins, she is at a desk and online")

            # ---------- 3. the same actions from a desk, the list and the floor ----------
            cp.click(f"#ad-office .of-desk[data-desk='{maya}']"); cp.wait_for_selector("#of-card [data-os-do='dm']", timeout=8000)
            desk_acts = cp.eval_on_selector_all("#of-card [data-os-do], #of-card [data-os-give]", "els => els.map(e => e.dataset.osDo || 'give')")
            cp.keyboard.press("Escape"); cp.wait_for_selector("#of-card", state="detached")
            cp.click("#ad-office [data-of-on]")
            cp.wait_for_selector("#ad-office .os-stage", timeout=15000); cp.wait_for_selector(f"#ao-here [data-desk='{maya}']", timeout=10000)
            cp.click(f"#ao-here [data-desk='{maya}']"); cp.wait_for_selector("#of-card [data-os-do='dm']", timeout=8000)
            list_acts = cp.eval_on_selector_all("#of-card [data-os-do], #of-card [data-os-give]", "els => els.map(e => e.dataset.osDo || 'give')")
            cp.keyboard.press("Escape")
            cp.wait_for_selector(f"#ad-office .os-tag[data-os-who='{maya}']", timeout=15000)
            cp.click(f"#ad-office .os-tag[data-os-who='{maya}']"); cp.wait_for_selector("#ad-office .os-card:not([hidden]) [data-os-do='dm']", timeout=8000)
            floor_acts = cp.eval_on_selector_all("#ad-office .os-card [data-os-do], #ad-office .os-card [data-os-give]", "els => els.map(e => e.dataset.osDo || 'give')")
            assert desk_acts == list_acts == floor_acts and {"dm", "call", "profile", "give"} <= set(desk_acts), (desk_acts, list_acts, floor_acts)
            cp.click("#ad-office .os-card [data-os-close]")
            cp.wait_for_timeout(1200); cp.screenshot(path="/tmp/agents-office-1440.png")
            print("ok  3. a desk, the list and the floor open the same actions:", desk_acts)

            # ---------- 5. where your tribe runs ----------
            assert "On this computer" in cp.inner_text(menu(cp, "where"))
            cp.click(menu(cp, "where")); cp.wait_for_selector("#ao-where-sheet .ao-opt", timeout=8000)
            assert cp.eval_on_selector_all("#ao-where-sheet [data-ao-opt]", "els => els.map(e => e.dataset.aoOpt)") == ["here", "direct", "folder", "cloud"]
            assert "Runs here now" in cp.inner_text("#ao-where-sheet [data-ao-opt='here']")
            for w in ("P2P", "host", "sync", "deploy"): assert w not in cp.inner_text("#ao-where-sheet"), w
            cp.click("#ao-where-sheet [data-ao-go='direct']"); cp.wait_for_selector("#os-sheet #os-p2p", timeout=8000)
            cp.wait_for_function("!document.querySelector('#os-ts').textContent.includes('Looking')", timeout=10000)
            cp.keyboard.press("Escape"); cp.wait_for_selector("#os-sheet", state="detached", timeout=5000)
            cp.click(menu(cp, "where")); cp.wait_for_selector("#ao-where-sheet [data-ao-go='cloud']")
            cp.click("#ao-where-sheet [data-ao-go='cloud']"); cp.wait_for_selector("#ao-cloud-sheet #ao-cloud-go", timeout=8000)
            assert "render.com" in cp.inner_html("#ao-cloud-sheet")
            cp.keyboard.press("Escape"); cp.wait_for_selector("#ao-cloud-sheet", state="detached", timeout=5000)
            cp.click(menu(cp, "where")); cp.wait_for_selector("#ao-where-sheet [data-ao-go='folder']")
            fb = cp.locator("#ao-where-sheet [data-ao-go='folder']")
            if fb.is_disabled(): assert cp.locator("#ao-folder-why").count() == 1, "a disabled choice says why"
            cp.keyboard.press("Escape"); cp.wait_for_selector("#ao-where-sheet", state="detached", timeout=5000)
            print("ok  5. where your tribe runs: state + this computer, connect directly, shared folder, free cloud")

            # ---------- 6. back up to GitHub ----------
            menu(cp, "github"); cp.wait_for_function("document.querySelector('#ao-menu [data-aom=\"github\"] small').textContent.includes('No GitHub account')", timeout=10000)
            cp.click(menu(cp, "github")); cp.wait_for_selector("#ghc-sheet [data-ghc='signin']", timeout=10000)
            assert cp.get_attribute("#ghc-signup", "href") == "https://github.com/signup" and cp.get_attribute("#ghc-signup", "target") == "_blank"
            cp.evaluate("document.querySelector('#ghc-signup').addEventListener('click', e => e.preventDefault(), { once: true })"); cp.click("#ghc-signup")
            cp.wait_for_selector("#ghc-back:not([hidden])", timeout=5000)
            cp.click("#ghc-sheet .gh-paste summary"); cp.fill("#ghc-sheet #gh-tok", TOKEN); cp.click("#ghc-sheet [data-gh='token']")
            cp.wait_for_selector("#ghc-sheet [data-ghc='pick']", timeout=10000)
            cp.click("#ghc-go"); cp.wait_for_selector("#ghc-sheet [data-ghc='done']", timeout=15000)
            assert "Connected as @camp-dev" in cp.inner_text("#ghc-login")
            cp.click("#ghc-close")
            cp.wait_for_timeout(500); menu(cp, "github")
            cp.wait_for_function("document.querySelector('#ao-menu [data-aom=\"github\"]').textContent.includes('camp-dev/star-hopper')", timeout=15000)
            assert cp.inner_text("#ao-menu [data-aom='github'] b") == "Back up now", cp.inner_text("#ao-menu [data-aom='github']")
            cp.keyboard.press("Escape")
            print("ok  6. GitHub: a way in with no account, sign in, create, linked, and the card says so")

            # ---------- 7. what's private: only true lines ----------
            cp.click(menu(cp, "privacy")); cp.wait_for_selector("#ao-privacy-sheet #ao-facts", timeout=8000)
            facts = cp.inner_text("#ao-privacy-sheet")
            assert "not end-to-end encrypted" in facts and "talks to itself" in facts, facts
            low = facts.lower().replace("not end-to-end encrypted", "")
            assert "end-to-end encrypted" not in low, "never claims encryption that isn't real"
            cp.keyboard.press("Escape")
            # the claim behind "Only the two people in a private message can open it"
            sam = ok(api("/join", "POST", {"code": ok(api("/invites", "POST", {"maxUses": 1}, token=camp))["invite"]["code"], "name": "Sam"}))["token"]
            camp_id = cp.evaluate("TribeClient.state().me.id")
            dm = "dm-" + "-".join(sorted([camp_id, maya]))
            ok(api(f"/chat/{dm}", "POST", {"text": "secret plan banana"}, token=camp), "a DM")
            assert "banana" in json.dumps(ok(api(f"/chat/{dm}", token=camp))), "the two people in it can read it"
            st, d = api(f"/chat/{dm}", token=sam)
            assert st != 200 or "banana" not in json.dumps(d), ("a third person can't open it", st)
            assert "banana" not in cp.inner_text("#ad-office"), "never on the office"
            print("ok  7. what's private: true lines only; a third person can't open a private message")

            # ---------- 8. phone, 390px ----------
            pp = page(camp, "Camp", 390, 844, mobile=True)
            to_view(pp)
            pp.wait_for_selector("#ad-office .os-stage", timeout=15000)   # feat/p13-office: phones get the pixel floor too
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "the floor fits"
            pp.evaluate("TribeOffice.setView('desks')")
            pp.wait_for_selector(f"#ad-office .of-desk[data-desk='{maya}']", timeout=15000)
            assert pp.locator("#ad-office .os-stage").count() == 0, "Desks shows the desk list"
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), pp.evaluate("document.documentElement.scrollWidth")
            small = pp.evaluate("[...document.querySelectorAll('#ao-head .btn, #ao-setup .btn, .of-desk')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 40).length")
            assert small == 0, small
            pp.wait_for_timeout(500); pp.screenshot(path="/tmp/agents-office-390.png")
            print("ok  8. 390px: the floor, and the desk list under Desks; no sideways scroll, 40px targets")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E agents & office test passed")
    except Exception:
        try: print(open(tmp / "log").read()[-2000:])
        except Exception: pass
        raise
    finally:
        srv.terminate()
        try: gh.shutdown()
        except Exception: pass


if __name__ == "__main__":
    main()
