"""End-to-end: the sidebar navigation (app/ui/shell.js).

The nest is communication and core only: Chat & Streams (#general, #agents and DMs fold out under it), Docs & Files,
Tasks & Board and Agents Hub, then Settings and Invite friends. Tasks & Board and Agents Hub are tabbed workspaces
(the old Project Hub and Coordinate & Ops groups): every tab opens its view, the last tab per workspace is remembered,
deep links (#/tasks/bugs, #/agents/conflicts) work, breadcrumbs say View › Tab, the breadcrumb menu mirrors it and
Ctrl K finds every destination exactly once. Updates live in the bell, the huddle in the chat header (the nest shows it
only while live), Capture to notes in the profile menu. Clicking an agent in the right panel opens its detail there.
The phone panel shows the same four rows without horizontal overflow.
Usage: python app/test/e2e_nav.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4841 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []

CORE = ["Dashboard", "Messages", "Files", "Design", "Task Board", "Agents Hub"]
TASK_TABS = ["📋 Board", "🐞 Bugs", "🗳️ Proposals", "🏁 Milestones", "📅 Calendar", "🌿 Code repository", "📸 Visuals"]
AGENT_KEYS = ["agents", "agents-hub", "ownership", "conflicts", "handoffs", "reviews", "plan", "secretary"]   # the Agents Hub shows Dashboard + pinned tabs (feat/agents-dash)
# tab key -> how to tell its view is on screen
OPENS = {
    "tasks": "#view-tasks:not(.hidden)", "bugs": "#view-bugs:not(.hidden)", "board": "#view-board:not(.hidden)", "milestones": "#view-board:not(.hidden)",
    "calendar": "#view-calendar:not(.hidden)", "repo": "#view-repo:not(.hidden)", "visuals": "#view-visuals:not(.hidden)",
    "agents": "#view-coord:not(.hidden) #coord-body", "agents-hub": "#view-agents-hub:not(.hidden)", "ownership": "#view-coord:not(.hidden)",
    "conflicts": "#view-coord:not(.hidden)", "handoffs": "#view-coord:not(.hidden)", "reviews": "#view-coord:not(.hidden)", "plan": "#view-coord:not(.hidden)",
    "secretary": "#view-secretary:not(.hidden)",
}
SLUG = {"tasks": "board", "board": "proposals", "agents-hub": "yours"}


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)


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


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["result"]


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e} {getattr(e, 'stack', '')}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def rows(page, sel):
    return page.evaluate("""s => [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null).map(e => {
        const sp = e.querySelector(':scope > span'); if (sp && sp.textContent.trim() === '+') return e.textContent.replace('+', '').trim(); if (sp && sp.textContent.trim()) return sp.textContent.trim();
        return [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); })""", sel)


def tabs(page):
    return page.evaluate("[...document.querySelectorAll('#view-tabs [data-tab]')].map(b => b.childNodes[0].textContent.trim())")


def no_dupes(page):
    labels = rows(page, ".nest [data-pnav], .nest-foot [data-pnav], .nest-foot #tour-invite")
    labels = [l.replace("+", "").strip() for l in labels]
    assert len(labels) == len(set(labels)), labels
    return labels


# ---- the one router (app/ui/router.js, docs/NAVIGATION.md): global sections keep the global dashboard, Back works,
# Work with no tribe stays global with a next step, the logo is always Home, one pane on screen, no dead ends.
GLOBAL = [("nest-hub", "hub", "Home", "#/hub"), ("nest-docs-all", "docs-all", "All files", "#/hub/docs"), ("nest-repos-all", "repos-all", "All code", "#/hub/repos"),
          ("nest-work", "work", "Work", "#/hub/work"), ("nest-fleet", "fleet", "Agent fleet", "#/fleet")]
STATE = """() => ({ view: document.body.dataset.view, global: document.body.classList.contains('global'), place: TribeRouter.where().place,
  lit: [...document.querySelectorAll('.side [data-pnav].on')].filter(e => e.offsetParent).map(e => e.dataset.pnav),
  rows: [...document.querySelectorAll('.side [data-pnav]')].filter(e => e.offsetParent).map(e => e.dataset.pnav),
  panes: [...document.querySelectorAll('.main > section[id^="view-"]')].filter(s => !s.classList.contains('hidden')).map(s => s.id),
  crumb: (document.querySelector('#crumb-label') || {}).textContent, hash: location.hash })"""


def settled(page):
    page.wait_for_timeout(260)   # the router settles 140 ms after a move
    return page.evaluate(STATE)


def check_global(page, row, key, crumb, hsh, tribe):
    page.click("#" + row); page.wait_for_function("k => TribeRouter.where().key === k", arg=key, timeout=8000)
    st = settled(page)
    assert st["global"] and st["place"] == "global", (row, st)
    assert st["rows"] == [g[1] for g in GLOBAL], (row, st["rows"])   # the global sidebar stays: never a tribe's nest
    assert st["lit"] == [key], (row, st["lit"])
    assert len(st["panes"]) == 1, (row, st["panes"])   # no stale panes from the previous dashboard
    assert st["crumb"] == crumb and st["hash"] == hsh, (row, st)
    return st


def global_nav(page, tribe):
    page.click("#rail-logo"); page.wait_for_function("TribeRouter.where().key === 'hub'")
    for row, key, crumb, hsh in GLOBAL[1:] + GLOBAL[:1]: check_global(page, row, key, crumb, hsh, tribe)
    # Work: with no tribe its empty state says what to do, inside the global dashboard; Back to Home works
    check_global(page, "nest-work", "work", "Work", "#/hub/work", tribe)
    if not tribe:
        page.wait_for_selector("#tl-empty #tl-e-start", state="visible"); page.wait_for_selector("#tl-e-join", state="visible")
        shot(page, "nav-work-empty")
        page.click("#tl-e-home"); page.wait_for_function("TribeRouter.where().key === 'hub'")
        page.click("#nest-work"); page.wait_for_selector("#tl-empty")
    else:
        page.wait_for_selector("#view-work .tl-tabs", timeout=8000)
    # Back walks the places you've been, one step at a time
    page.click("#nest-repos-all"); page.wait_for_function("TribeRouter.where().key === 'repos-all'"); settled(page)
    page.go_back(); page.wait_for_function("TribeRouter.where().key === 'work'", timeout=8000)
    page.go_back(); page.wait_for_function("TribeRouter.where().key === 'hub'", timeout=8000)
    page.go_forward(); page.wait_for_function("TribeRouter.where().key === 'work'", timeout=8000)
    st = settled(page); assert st["global"] and st["rows"] == [g[1] for g in GLOBAL] and len(st["panes"]) == 1, st
    # the logo is always Home, and it closes the Workshop layer on its way
    page.click("#rail-workshop"); page.wait_for_function("TribeWorkshop.isOpen()")
    assert page.locator("#rail-workshop use").get_attribute("href") == "#i-wrench", "the Workshop is a wrench"
    page.click("#rail-logo"); page.wait_for_function("TribeRouter.where().key === 'hub' && !TribeWorkshop.isOpen()")
    if not tribe:
        shot(page, "nav-home")
        # a project place asked for with no tribe: Home with a next step, never an empty page
        page.evaluate("TribeShell.go('chat')"); st = settled(page); assert st["view"] == "hub" and st["global"], st
        page.evaluate("TribeShell.go('ws-tasks')"); st = settled(page); assert st["view"] == "hub", st
        # the + sheet always has a way out
        # (feat/setup-local: with no tribe, + is the instant Start sheet on this device)
        page.click("#pj-plus"); page.wait_for_selector("#su-start .su-x", state="visible")
        page.click("#su-start .su-x"); page.wait_for_selector("#su-start", state="detached")
        return
    # with a tribe: into a project from the rail, Back returns to the global section you came from
    page.click("#nest-work"); page.wait_for_function("TribeRouter.where().key === 'work'"); settled(page)
    page.locator("#pj-rail [data-pj-open]").first.click(); page.wait_for_function("TribeRouter.where().place === 'project'", timeout=10000)
    st = settled(page); assert not st["global"] and "home" in st["rows"] and len(st["panes"]) == 1, st
    page.click("#nest-chat"); page.wait_for_selector("#view-chat:not(.hidden)"); settled(page)
    page.go_back(); page.wait_for_function("TribeRouter.where().place === 'project' && document.body.dataset.view === 'home'", timeout=8000)
    page.go_back(); page.wait_for_function("TribeRouter.where().key === 'work'", timeout=8000)
    st = settled(page); assert st["global"] and st["lit"] == ["work"] and st["panes"] == ["view-work"], st
    page.go_forward(); page.wait_for_function("TribeRouter.where().place === 'project'", timeout=8000)
    page.click("#rail-logo"); page.wait_for_function("TribeRouter.where().key === 'hub'")
    st = settled(page); assert st["global"] and st["lit"] == ["hub"] and len(st["panes"]) == 1, st
    # the palette's Marketplace entry is a wrench too
    assert any(d["key"] == "market" for d in page.evaluate("TribeShell.dests()"))
    page.keyboard.press("Control+k"); page.fill("#pal-input", "marketplace"); page.wait_for_timeout(80)
    assert page.evaluate("[...document.querySelectorAll('#pal-list .pal-item')].some(b => b.textContent.includes('Marketplace') && b.querySelector('use') && b.querySelector('use').getAttribute('href') === '#i-wrench')"), page.inner_text("#pal-list")
    page.keyboard.press("Escape")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-nav-", dir="/tmp")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- no tribe yet (fresh open): every global button stays on the global dashboard
            nt = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1); fresh = nt.new_page(); watch(fresh, "fresh")
            named(fresh, "Orion"); fresh.goto(BASE + "/?skipIntro=1&freshopen=1"); fresh.wait_for_function("window.TribeRouter && TribeApp.fresh()", timeout=15000)
            fresh.wait_for_selector("#nest-work", state="visible"); global_nav(fresh, tribe=False); nt.close()
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            host = ctx.new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("TribeClient.connected()")
            host.wait_for_selector("#view-home:not(.hidden)")
            token = host.evaluate("TribeStore.get().server.token")
            pid = host.evaluate("TribeClient.project()")

            # ---- the rail: logo, circles, +, Workshop; no gear, "?" or avatar any more
            for sel in ["#rail-logo", "#pj-rail", "#pj-plus", "#rail-workshop"]: host.wait_for_selector(sel, state="visible")
            for gone in ["#help-btn", "#settings-btn", "#me-avatar", "#nest-new", "#nest-search", "#nest-more", "#nest-updates", "#grp-hub", "#grp-ops"]:
                assert host.locator(gone).count() == 0, gone

            # ---- four rows, exactly, in order; nothing else between them and Settings
            assert rows(host, "#pj-nav .nest-row.core") == CORE, rows(host, "#pj-nav .nest-row.core")
            api("/vision", "PUT", {"text": "# Nav\n\nA small test project."}, token=host.evaluate("TribeStore.get().server.token"), project=pid)   # + Add waits for the vision (feat/setup-flow)
            host.wait_for_selector("#nest-add", state="visible", timeout=10000)   # the + row (widgets.js) closes the list for the host
            assert rows(host, "#pj-nav .nest-row") == CORE, rows(host, "#pj-nav .nest-row")   # + Add sits below the Repo row, outside the rows
            assert host.locator("#nest-huddle").is_hidden() and host.locator("#capture-toggle").is_hidden(), "huddle and capture have no rows"
            for t in ["One", "Two"]: assert api("/tasks", "POST", {"title": f"Task {t}"}, token=token, project=pid)[0] == 200
            # v0.26: the Task Board badge counts others' task updates you haven't seen (e2e_counts.py), never your own
            host.wait_for_timeout(800); assert host.evaluate("document.querySelector('#nn-tasks').textContent") == '', "own tasks don't count"
            # Chat & Streams: #general, #agents and DMs fold out, remembered
            assert host.locator("#nest-streams").is_hidden()
            host.click("#streams-toggle"); host.wait_for_selector("#nest-streams [data-stream='general']", state="visible")
            host.wait_for_selector("#nest-streams [data-stream='agents']")
            host.reload(); host.wait_for_selector("#nest-streams [data-stream='general']", state="visible")
            host.click("#nest-streams [data-stream='general']"); host.wait_for_selector("#view-chat:not(.hidden)")
            host.wait_for_function("document.querySelector('#nest-chat').classList.contains('on')")
            # the huddle: started from the chat header; the nest shows it only while live, the call button gets a Teal dot
            host.wait_for_selector(".cb-btn[data-cb='huddle']")
            host.evaluate("(() => { TribeClient.state().huddle = [{ id: TribeClient.state().me.id }]; window.__r = TribeHuddle.roster; TribeHuddle.roster = () => [{ id: TribeClient.state().me.id }]; document.querySelector('#huddle-box').appendChild(document.createElement('i')); })()")
            host.wait_for_selector("#nest-huddle.live #huddle-live:not(.hidden)")
            assert host.evaluate("document.body.classList.contains('huddle-live')")
            host.evaluate("(() => { TribeHuddle.roster = window.__r; TribeClient.state().huddle = []; document.querySelector('#huddle-box').appendChild(document.createElement('i')); })()")
            host.wait_for_selector("#nest-huddle", state="hidden")
            # Capture to notes lives in the profile menu
            host.click("#pf-btn"); host.wait_for_selector("#pf-menu [data-act='capture']"); host.keyboard.press("Escape")
            host.mouse.move(720, 600); shot(host, "nav-desktop")

            # ---- Tasks & Board: one tabbed workspace
            host.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:true, repo:true}, {pin:true})")   # past setup: the Task Board shows its tabs (feat/setup-flow)
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tabs:not(.hidden)")
            assert tabs(host) == TASK_TABS, tabs(host)
            assert host.text_content("#view-tabs .wt-eye") == "Task Board"
            for key in ["tasks", "bugs", "board", "milestones", "calendar", "repo", "visuals"]:
                host.click(f"#wt-{key}"); host.wait_for_selector(OPENS[key], timeout=8000)
                host.wait_for_function("k => document.querySelector(`#wt-${k}`).classList.contains('on')", arg=key)
                assert host.locator("#view-tabs .wt.on").count() == 1
                assert host.evaluate("document.querySelector('#nest-ws-tasks').classList.contains('on')"), key
                assert host.evaluate("location.hash") == f"#/tasks/{SLUG.get(key, key)}", (key, host.evaluate("location.hash"))
            host.click("#wt-bugs"); host.wait_for_selector("#view-bugs:not(.hidden)")
            wait_text(host, "#crumb-label", "Task Board › Bugs")
            host.mouse.move(720, 600); shot(host, "nav-tabs-bugs")
            # remembered: away and back lands on Bugs
            host.click("#nest-docs"); host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_selector("#view-tabs:not(.hidden) #wt-website"); assert tabs(host) == ["📝 Notes", "🌐 Website", "📎 Captures", "🎓 Academy"], tabs(host)   # Files: one emoji row (v0.27: + Academy)
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-bugs:not(.hidden)")
            # Requests shows up as a tab only while something waits
            st, r = api("/changes", "POST", {"title": "Hook up the gamepad"}, token=token, project=pid); assert st == 200, r
            host.wait_for_selector("#wt-requests .n.hot", timeout=8000)
            host.click("#wt-requests"); host.wait_for_selector("#view-requests:not(.hidden)"); wait_text(host, "#pj-requests", "Hook up the gamepad")

            # ---- Agents Hub: one dashboard; every deep view still opens (as a temporary tab when it isn't pinned)
            host.click("#nest-ws-agents"); host.wait_for_selector("#view-tabs:not(.hidden)")
            assert tabs(host) == ["Dashboard"], tabs(host)
            for key in AGENT_KEYS:
                host.evaluate("k => TribeShell.go(k)", key); host.wait_for_selector(OPENS[key], timeout=8000)
                host.wait_for_function("k => document.querySelector(`#wt-${k}`) && document.querySelector(`#wt-${k}`).classList.contains('on')", arg=key, timeout=6000)
                assert host.evaluate("document.querySelector('#nest-ws-agents').classList.contains('on')"), key
                assert len(tabs(host)) == (1 if key == "agents" else 2), (key, tabs(host))
                if host.locator("#coord-tabs").count(): assert host.locator("#coord-tabs").is_hidden()
            host.evaluate("TribeShell.go('conflicts')"); host.wait_for_function("TribeCoord.tab() === 'conflicts'")
            wait_text(host, "#crumb-label", "Agents Hub › Conflicts")
            host.mouse.move(720, 600); shot(host, "nav-tabs-conflicts")
            # deep links
            host.goto(BASE + "/?skipIntro=1#/tasks/calendar"); host.wait_for_selector("#view-calendar:not(.hidden)", timeout=10000)
            host.wait_for_function("document.querySelector('#wt-calendar') && document.querySelector('#wt-calendar').classList.contains('on')")
            host.goto(BASE + "/?skipIntro=1#/agents/reviews"); host.wait_for_function("window.TribeCoord && TribeCoord.tab() === 'reviews' && !document.querySelector('#view-coord').classList.contains('hidden')", timeout=10000)
            no_dupes(host)
            for l in CORE + ["Invite friends"]: assert l in no_dupes(host), l
            assert host.locator("#userbar #ub-gear").is_visible(), "Settings is the gear in the user bar"

            # ---- breadcrumb menu mirrors the hierarchy
            host.evaluate("document.querySelector('#crumb-section').click()"); host.wait_for_selector("#section-menu")
            menu = host.evaluate("[...document.querySelectorAll('#section-menu h6, #section-menu button')].map(e => (e.tagName === 'H6' ? '# ' : '') + (e.querySelector('span') || e).textContent.trim())")
            assert menu[:len(CORE)] == CORE, menu
            assert "# Task Board" in menu and "# Agents Hub" in menu, menu
            assert menu[menu.index("# Agents Hub") + 1:] == ["Agents dashboard", "Your agents", "TribeCode MCP", "Ownership map", "Conflict radar", "Hand-offs", "Reviews", "Daily plan", "Secretary"], menu
            host.click("#section-menu [data-dest='calendar']"); host.wait_for_selector("#view-calendar:not(.hidden)")

            # ---- Ctrl K finds every destination exactly once
            dests = host.evaluate("TribeShell.dests().filter(d => d.visible)")
            for d in dests:
                host.keyboard.press("Control+k"); host.wait_for_selector("#palette:not(.hidden)")
                host.fill("#pal-input", d["label"].lower()); host.wait_for_timeout(60)
                found = host.evaluate("l => [...document.querySelectorAll('#pal-list .pal-item')].filter(b => b.querySelector('.l').textContent.trim().toLowerCase().split(/ & | · /)[0] === l.toLowerCase().split(/ & | · /)[0] && ['Go to', 'Action'].includes(b.querySelector('.k').textContent)).length", d["label"])
                assert found == 1, (d, found, host.inner_text("#pal-list"))
                host.keyboard.press("Escape")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "conflict radar"); host.keyboard.press("Enter")
            host.wait_for_function("TribeCoord.tab() === 'conflicts' && document.querySelector('#wt-conflicts').classList.contains('on')")

            # ---- bottom row: Settings and Invite work
            host.click("#ub-gear"); host.wait_for_selector("#settings-modal:not(.hidden) #set-name")
            host.keyboard.press("Escape"); host.evaluate("TribeSettings.close()")
            host.click("#tour-invite"); host.wait_for_selector("#invite-modal:not(.hidden) #tl-link"); host.evaluate("document.querySelectorAll('.tl-more').forEach(d => d.open = true)"); host.wait_for_selector("#invite-modal:not(.hidden) #inv-link")
            host.keyboard.press("Escape")
            # right-click the project's bubble: overview, chat, pin, invite, project settings (no dropdown in the sidebar)
            host.evaluate("TribeShell.go('repo')"); host.wait_for_selector("#view-repo:not(.hidden)")
            host.locator("#pj-rail .pj-circle.on").first.dispatch_event("contextmenu"); host.wait_for_selector("#rail-menu [data-rc='settings']")
            host.click("#rail-menu [data-rc='settings']"); wait_text(host, "#invite-body", "settings")
            host.keyboard.press("Escape")

            # ---- the right panel: an agent's detail next to chat
            ag = api("/agents", "POST", token=token, project=pid)[1]
            mcp(ag["token"], "my_lane", {"tokens_used": 5000, "budget": 100000})
            host.click("#nest-chat"); host.wait_for_selector("#view-chat:not(.hidden)")
            host.wait_for_selector(f"#room-agents [data-agent='{ag['agent']['id']}']", timeout=10000)
            host.click(f"#room-agents [data-agent='{ag['agent']['id']}']")
            host.wait_for_selector("#tour-room.previewing .ad-head")
            wait_text(host, "#preview-kind", "Agent")
            host.wait_for_function("ts => ts.every(t => document.querySelector('#preview-body').textContent.includes(t))", arg=["Now", "Hand-offs", "Conflict radar", "Review queue", "Timeline"])
            assert host.locator("#view-chat:not(.hidden)").count() == 1, "the detail opens beside chat"
            host.mouse.move(720, 600); shot(host, "nav-agent-detail")
            host.click("#preview-body [data-ad='0']"); host.wait_for_selector("#person-panel:not(.hidden)")
            host.keyboard.press("Escape")

            # ---- Roles: only for flow projects, a tab in Tasks & Board
            host.evaluate("document.getElementById('pj-plus').click()"); host.click(".np-setup [data-ns='own']"); host.wait_for_selector("#np-input"); host.click("#np-create")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=25000); host.click(".modal-card.ii [data-close]")
            host.wait_for_selector("#view-chat:not(.hidden)", timeout=20000)
            host.click("#nest-ws-tasks"); host.wait_for_selector("#wt-roles", timeout=15000)
            host.click("#wt-roles"); host.wait_for_selector("#view-flow-roles:not(.hidden)")
            host.wait_for_function("document.querySelector('#wt-roles').classList.contains('on')")
            assert tabs(host)[:8] == TASK_TABS + ["👥 Roles"], tabs(host)
            no_dupes(host)

            # ---- with a tribe: global sections still keep the global dashboard; Back crosses into a project and out again
            global_nav(host, tribe=True)

            # ---- phone: the swipe-in panel shows the same four rows, Settings + Invite at the bottom, no overflow
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_selector("#tabbar.m2-rack")
            phone.click("#menu-btn"); phone.wait_for_selector(".nest-row[data-nav='chat']", state="visible")
            phone.wait_for_timeout(400)
            assert rows(phone, "#pj-nav .nest-row.core") == CORE
            for sel in ["#ub-gear", "#tour-invite"]: phone.wait_for_selector(sel, state="visible")
            fs, inv = (phone.locator(s).bounding_box() for s in ["#ub-gear", "#tour-invite"])
            assert fs["y"] > inv["y"], (fs, inv)   # your bar (with Settings) sits at the very bottom of the panel, under Invite friends
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert phone.evaluate("(() => { const s = document.querySelector('.window > .side'); return s.scrollWidth <= s.clientWidth + 1 && document.querySelector('#nest').scrollWidth <= document.querySelector('#nest').clientWidth + 1; })()")
            no_dupes(phone)
            shot(phone, "nav-phone-panel")
            phone.click("#nest-ws-agents"); phone.wait_for_selector("#view-tabs:not(.hidden)")
            assert not phone.evaluate("document.body.classList.contains('drawer-open')")
            phone.evaluate("TribeShell.go('conflicts')"); phone.wait_for_function("TribeCoord.tab() === 'conflicts'")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            phone.wait_for_selector("#tabbar.m2-rack", state="visible")
            shot(phone, "nav-phone-tabs")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E nav test passed")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
