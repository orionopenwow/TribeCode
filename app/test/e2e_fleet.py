"""End-to-end: the Agent fleet (app/ui/fleet.js, server/agentshub.js /api/agents/fleet, feat/fleet).

1. No tribe yet: the global Agent fleet shows one hero (Start a project / Try the demo) and How agents work here.
   Start a project makes the tribe, and the hero becomes Connect your AI.
2. Add an AI helper (feat/agents-office): seven choices and Another tool, each opening the one setup (the invite sheet);
   looking makes no key.
3. The page moves on by itself when the agent's first MCP call arrives (a simulated MCP client).
4. Agent rows inside the project: status (working / idle / paused / offline), task + branch, files, last things it
   did. Pause and Resume reach the agent through check_messages; so do Message and Give a task. An agent waiting for
   an approval becomes the hero, and Approve works from there. Connect command makes a new key (the old one stops).
5. The global fleet never switches project by itself: tapping an agent opens a preview with "Open in tribe".
6. Phone, 390px: stacked cards, no sideways scroll, the copy fallback works without navigator.clipboard (iOS on http).
Screenshots: docs/screenshots/fleet-empty.png, fleet-connect.png, fleet-agents.png, fleet-phone.png.
Usage: python app/test/e2e_fleet.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5940 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp_raw(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {}


def mcp(token, tool, args=None):
    st, d = mcp_raw(token, tool, args)
    assert st == 200, (tool, st)
    return d["result"]


def text_of(res):
    return "\n".join(c.get("text", "") for c in res.get("content", []))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name, full=False):
    page.wait_for_timeout(400)
    page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def quiet(page):
    """Close first-run layers (Make it yours, Flint's offer) that would sit over the page."""
    page.evaluate("""() => { for (const s of ['#pz', '#fg-bubble', '#fg-sprite', '#fg-ring', '#wl', '#intro', '#fr-start']) document.querySelectorAll(s).forEach(e => e.remove()); }""")


STUB = "window.__copied = []; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) {}"


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="tribe-fleet-", dir="/tmp")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            ctx.add_init_script("localStorage.setItem('tribecode.settings.v1', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}'), {name: 'Orion'})))")
            ctx.add_init_script(STUB)
            host = ctx.new_page(); watch(host, "host")

            # ---- 1. no tribe: the friendly empty hero, nothing jumps anywhere
            host.goto(BASE + "/?freshopen=1"); host.wait_for_function("window.TribeApp && TribeApp.fresh && TribeApp.fresh()", timeout=15000)
            assert api("/health")[1]["members"] == 0
            quiet(host)
            host.evaluate("TribeAgentsHub.open({ global: true })")
            host.wait_for_selector("#view-agents-hub:not(.hidden) #fl-hero[data-state='notribe']", timeout=10000)
            wait_text(host, "#fl-hero", "Start a project first")
            assert "agents join a tribe" in host.inner_text("#fl-hero").lower()
            assert host.locator("#fl-hero #fl-start").is_visible() and host.locator("#fl-hero #fl-demo").is_visible()
            assert host.evaluate("[...document.querySelectorAll('.hero-card')].filter(e => e.offsetParent).length") == 1, "one hero card"
            assert host.locator("#fl-how .fl-step").count() == 4 and host.locator("#fl-how .fl-ill").count() == 4
            wait_text(host, "#fl-how", "TRIBE_CONTEXT"); host.wait_for_selector("#fl-guide")
            assert host.locator("#fl-agents").count() == 0
            quiet(host); shot(host, "fleet-empty")
            # Start a project: the instant Start sheet (feat/setup-local) makes it on this device; agents need a tribe, so
            # choosing This computer as its home makes your own tribe, and the hero moves on to Connect your AI (a real key)
            host.click("#fl-start")
            host.wait_for_selector("#tn #tn-name", state="visible", timeout=8000)   # the one create flow (tribenew.js)
            host.fill("#tn-name", "Fleet test"); host.click("#tn-options")
            host.click("#tn [data-tn-where='folder']"); host.click("#tn-go")
            host.wait_for_selector("#tn[data-step='3'] #tn-done", timeout=20000)
            with host.expect_navigation(timeout=20000): host.click("#tn-done")   # a new host: the page reloads into it
            for _ in range(80):   # the page reloads into the tribe on this computer
                try:
                    if host.evaluate("!!(window.TribeClient && TribeClient.hasToken() && TribeClient.connected() && !(window.TribeOffline && TribeOffline.active()))"): break
                except Exception: pass
                time.sleep(0.25)
            host.wait_for_function("TribeClient.hasToken() && !(window.TribeOffline && TribeOffline.active())", timeout=20000)
            host.wait_for_function("TribeClient.connected()", timeout=15000)
            assert api("/health")[1]["members"] >= 1
            host.evaluate("TribeAgentsHub.open({ global: true })")
            host.wait_for_selector("#fl-hero[data-state='connect'] [data-ao-pick]", timeout=15000)
            token = host.evaluate("TribeStore.get().server.token")
            pid = host.evaluate("TribeClient.project()")
            assert host.evaluate("document.body.dataset.view") == "agents-hub" and host.evaluate("document.body.dataset.scope") == "global", "stays in the global fleet"

            # ---- 2. Add an AI helper (feat/agents-office): pick the AI, and the one setup opens; looking makes nothing
            picks = host.eval_on_selector_all("#fl-hero [data-ao-pick]", "els => els.map(e => e.dataset.aoPick)")
            assert picks == ["claude", "chatgpt", "codex", "gemini", "cursor", "local", "free", "other"], picks
            assert not [m for m in ok(api("/members", token=token))["members"] if m["role"] == "agent"], "opening the page makes no key"
            host.click("#fl-hero [data-ao-pick='cursor']"); host.wait_for_selector("#invite-modal:not(.hidden) #ic-body [data-ic-kind='cursor'].on", timeout=10000)
            host.evaluate("TribeInvite.close()")
            host.click("#fl-hero [data-ao-pick='free']"); host.wait_for_selector("#invite-modal:not(.hidden) #ic-alt[data-ic-altpane='free']", timeout=10000)
            host.evaluate("TribeInvite.close()")
            host.mouse.move(700, 880); shot(host, "fleet-connect")
            # keys made elsewhere (Your AI tools, an older setup): one per tool, for the rows below
            keys = {k: ok(api("/agents", "POST", {"kind": k}, token=token, project=pid), k) for k in ["claude-code", "codex", "gemini", "cursor", "qwen", "mcp"]}

            # ---- 3. the first MCP call: the hero moves on by itself
            ctok = keys["claude-code"]["token"]; cid = keys["claude-code"]["agent"]["id"]
            mcp(ctok, "my_lane", {"tokens_used": 12000, "budget": 100000})
            host.evaluate("TribeAgentsHub.open({ global: true })")
            host.wait_for_selector("#fl-hero[data-state='next']", timeout=20000)

            # ---- 4. inside the project: rows, actions, the next step
            ok(api("/tasks", "POST", {"title": "Speed boots"}, token=token, project=pid))
            mcp(ctok, "claim_file", {"path": "src/game.js"})
            mcp(ctok, "agents_post", {"text": "On the title screen now"})
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder"}, token=token), "invite")["invite"]
            maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}), "join")["token"]
            mag = ok(api("/agents", "POST", token=maya, project=pid), "maya agent")
            mcp(mag["token"], "my_lane", {})
            host.evaluate("TribeShell.go('agents')"); host.wait_for_selector(f"#view-coord:not(.hidden) #fl-agents [data-fl-agent='{cid}']", timeout=10000)
            row = f"#view-coord #fl-agents [data-fl-agent='{cid}']"
            wait_text(host, row, "Working"); wait_text(host, row, "src/game.js"); wait_text(host, row, "On the title screen now")
            wait_text(host, row, "Claude Code"); wait_text(host, row, "Yours")
            mrow = f"#view-coord #fl-agents [data-fl-agent='{mag['agent']['id']}']"
            wait_text(host, mrow, "Maya's"); wait_text(host, mrow, "Idle")
            assert host.evaluate("[...document.querySelectorAll('.hero-card')].filter(e => e.offsetParent).length") == 1
            # the keys made while browsing the tabs (never connected) fold into one quiet line, not 5 rows
            wait_text(host, "#view-coord #fl-agents h2", "2 agents")
            wait_text(host, "#view-coord #fl-unused summary", "5 keys you made that never connected")
            host.click("#view-coord #fl-unused summary")
            host.once("dialog", lambda dlg: dlg.accept())
            host.click(f"#view-coord #fl-unused [data-fl-act='remove'][data-id='{keys['codex']['agent']['id']}']")
            wait_text(host, "#view-coord #fl-unused summary", "4 keys", 10000)
            assert mcp_raw(keys["codex"]["token"], "my_lane")[0] == 401, "Remove revoked the key"
            for a in ["msg", "task", "pause", "cmd", "remove"]: assert host.locator(f"{row} [data-fl-act='{a}']").count() == 1, a
            assert host.locator(f"{mrow} [data-fl-act='remove']").count() == 0, "only your own agents can be removed here"
            # Give a task: on the board, assigned, and the agent hears about it
            host.click(f"{row} [data-fl-act='task']"); host.fill(f"{row} [data-fl-form='task'] input", "Add a title screen"); host.press(f"{row} [data-fl-form='task'] input", "Enter")
            host.wait_for_function("([s]) => { const e = document.querySelector(s); return e && e.innerText.includes('Add a title screen') && e.innerText.includes('task/'); }", arg=[row], timeout=10000)
            t = [x for x in ok(api("/tasks", token=token, project=pid))["tasks"] if x["title"] == "Add a title screen"][0]
            assert t["assignee"] == cid, t
            # Message
            host.click(f"{row} [data-fl-act='msg']"); host.fill(f"{row} [data-fl-form='msg'] input", "Use the pixel font please"); host.press(f"{row} [data-fl-form='msg'] input", "Enter")
            host.wait_for_selector(f"{row} [data-fl-form='msg']", state="detached", timeout=8000)
            inbox = text_of(mcp(ctok, "check_messages"))
            assert "Add a title screen" in inbox and "Use the pixel font please" in inbox, inbox
            # Pause / Resume, seen through check_messages
            host.click(f"{row} [data-fl-act='pause']"); host.wait_for_selector(f"{row}.s-paused [data-fl-act='resume']", timeout=8000)
            wait_text(host, row, "Paused")
            inbox = text_of(mcp(ctok, "check_messages")); assert "PAUSE" in inbox, inbox
            assert host.evaluate("document.querySelector('#ad-hero').dataset.next") == "paused", "your paused agent is the next step"
            host.click(f"{row} [data-fl-act='resume']"); host.wait_for_selector(f"{row}:not(.s-paused) [data-fl-act='pause']", timeout=8000)
            inbox = text_of(mcp(ctok, "check_messages")); assert "RESUME" in inbox, inbox
            # an agent waiting for an approval is the next step; Approve right there
            ap = json.loads(text_of(mcp(mag["token"], "request_approval", {"title": "Drop the old save format", "details": "Migrates saves.", "risk": "high"})))
            host.evaluate("TribeCoord.refresh()")
            host.wait_for_function("() => { const h = document.querySelector('#ad-hero'); return h && h.dataset.next === 'approval'; }", timeout=10000)
            wait_text(host, "#ad-hero", "Claude · Maya is waiting for an approval"); wait_text(host, "#ad-hero", "Drop the old save format")
            host.mouse.move(700, 880); shot(host, "fleet-agents")
            host.click("#ad-hero [data-fl-ap='approve']")
            host.wait_for_function("() => document.querySelector('#ad-hero') && document.querySelector('#ad-hero').dataset.next !== 'approval'", timeout=10000)
            assert "approved" in text_of(mcp(mag["token"], "check_approval", {"id": ap["id"]})).lower()
            # Connect command: a new key, the old one stops working
            host.click(f"{row} [data-fl-act='cmd']"); host.click(f"{row} [data-fl-rotate]")
            host.wait_for_selector(f"{row} [data-fl-rowcmd]", timeout=8000)
            new = host.inner_text(f"{row} [data-fl-rowcmd]")
            assert ctok not in new and "Bearer " in new, new
            ntok = new.split("Bearer ")[1].split('"')[0].strip()
            host.click(f"{row} [data-fl-rowcopy]"); host.wait_for_function("t => window.__copied[window.__copied.length - 1] === t", arg=host.evaluate(f"document.querySelector(\"{row} [data-fl-rowcmd]\").textContent"))
            assert mcp_raw(ctok, "my_lane")[0] == 401, "the old key stopped working"
            mcp(ntok, "my_lane")
            assert host.locator("#fl-how .fl-step").count() == 4

            # ---- 5. the global fleet: your agents in every project; a tap previews, never switches by itself
            host.evaluate("TribeHub.open('home')"); host.wait_for_selector("#nest-fleet", timeout=10000); host.click("#nest-fleet")
            host.wait_for_selector(f"#fl-root [data-fl-agent='{cid}']", timeout=10000)
            assert host.locator(f"#fl-root [data-fl-agent='{mag['agent']['id']}']").count() == 0, "the global fleet shows your agents"
            host.click(f"#fl-root [data-fl-agent='{cid}'] .fl-id")
            host.wait_for_selector("#tour-room.previewing .fl-pv", timeout=8000)
            wait_text(host, "#preview-actions", "Open in tribe")
            host.wait_for_timeout(600)
            assert host.evaluate("document.body.dataset.view") == "agents-hub" and host.evaluate("document.body.dataset.scope") == "global", "no jump into the tribe"
            host.click("#preview-actions [data-pa='0']")
            host.wait_for_selector("#view-coord:not(.hidden) #ad-hero", timeout=10000)

            # ---- 6. phone, 390px
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")
            ph.add_init_script("window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); const ex = document.execCommand.bind(document); document.execCommand = (c, ...r) => { if (c === 'copy') { window.__copied.push(String(getSelection()) || (document.activeElement && document.activeElement.value) || ''); return true; } return ex(c, ...r); };")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1"); phone.wait_for_function("TribeClient.connected()")
            phone.evaluate("TribeShell.go('agents')"); phone.wait_for_selector("#ofl-strip [data-ofl-sheet='work']", timeout=10000)
            phone.click("#ofl-strip [data-ofl-sheet='work']"); phone.wait_for_selector(f"#fl-agents [data-fl-agent='{cid}']", timeout=10000)   # feat/office-full: Working on, a bottom sheet on phones
            prow = f"#view-coord #fl-agents [data-fl-agent='{cid}']"
            def no_sideways():
                assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), phone.evaluate("document.documentElement.scrollWidth")
                boxes = phone.evaluate("[...document.querySelectorAll('.fl-row, .fl-hero, .fl-step, .ad-card')].filter(e => e.offsetParent).map(c => { const r = c.getBoundingClientRect(); return [r.left, r.right]; })")
                assert boxes and all(l >= -0.5 and r <= 390.5 for l, r in boxes), boxes
            no_sideways()
            steps = phone.evaluate("[...document.querySelectorAll('#fl-how .fl-step')].map(e => Math.round(e.getBoundingClientRect().left))")
            assert len(set(steps)) == 1, ("steps stack", steps)
            phone.click(f"{prow} [data-fl-act='cmd']"); phone.click(f"{prow} [data-fl-rotate]"); phone.wait_for_selector(f"{prow} [data-fl-rowcmd]", timeout=8000)
            phone.click(f"{prow} [data-fl-rowcopy]")
            phone.wait_for_function("() => window.__copied.length && window.__copied[0].includes('claude mcp add')", timeout=5000)
            no_sideways()
            phone.evaluate("document.querySelector('#ad-dash').scrollIntoView()"); phone.evaluate("scrollTo(0, 0)")
            shot(phone, "fleet-phone")
            phone.evaluate("TribeAgentsHub.open({ global: true })"); phone.wait_for_selector(f"#fl-root [data-fl-agent='{cid}']", timeout=10000)
            no_sideways()
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E fleet test passed")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
