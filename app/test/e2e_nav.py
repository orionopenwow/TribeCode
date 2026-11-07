"""End-to-end: the sidebar navigation (app/ui/shell.js).

The nest: header (project + switcher), the core daily drivers in order (Chat, Docs & files, Updates, Tasks,
Huddle, Capture to notes) with their badges, live state and toggle; two collapsible groups (Project Hub,
Coordinate & Ops) that remember their state; Settings and Invite friends at the bottom. Every destination opens
its view, no destination is listed twice, the breadcrumb menu mirrors the hierarchy, Ctrl K finds each one
exactly once, and the phone panel shows the same list without horizontal overflow.
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

CORE = ["Chat", "Docs & files", "Updates", "Tasks", "Huddle", "Capture to notes"]
HUB = ["Bugs", "Proposals & board", "Milestones", "Calendar", "Repo", "Visuals & screenshots"]
OPS = ["Agents", "Ownership map", "Conflict radar", "Hand-offs", "Reviews", "Daily plan", "Your agents", "Secretary"]
# destination key -> how to tell its view is on screen
OPENS = {
    "chat": "#view-chat:not(.hidden)", "docs": "#view-docs:not(.hidden)", "tasks": "#view-tasks:not(.hidden)",
    "bugs": "#view-bugs:not(.hidden)", "board": "#view-board:not(.hidden)", "milestones": "#view-board:not(.hidden)",
    "calendar": "#view-calendar:not(.hidden)", "repo": "#view-repo:not(.hidden)", "visuals": "#view-visuals:not(.hidden)",
    "agents": "#view-coord:not(.hidden) #coord-tabs [data-ct='agents'].on", "ownership": "#coord-tabs [data-ct='ownership'].on",
    "conflicts": "#coord-tabs [data-ct='conflicts'].on", "handoffs": "#coord-tabs [data-ct='handoffs'].on",
    "reviews": "#coord-tabs [data-ct='reviews'].on", "plan": "#coord-tabs [data-ct='plan'].on",
    "agents-hub": "#view-agents-hub:not(.hidden)", "secretary": "#view-secretary:not(.hidden)",
    "roles": "#view-flow-roles:not(.hidden)",
}


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


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def rows(page, sel):
    return page.evaluate("""s => [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null).map(e => {
        const sp = e.querySelector(':scope > span'); if (sp && sp.textContent.trim() === '+') return e.textContent.replace('+', '').trim(); if (sp && !sp.classList.contains('sw') && sp.textContent.trim()) return sp.textContent.trim();
        return [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); })""", sel)


def no_dupes(page):
    labels = rows(page, ".nest [data-pnav], .nest #capture-toggle, .nest-foot [data-pnav], .nest-foot #tour-invite")
    labels = [l.replace("+", "").strip() for l in labels]
    assert len(labels) == len(set(labels)), labels
    return labels


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
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            host = ctx.new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            token = host.evaluate("TribeStore.get().server.token")
            pid = host.evaluate("TribeClient.project()")
            host.wait_for_selector("#grp-hub .nest-fold-head")

            # ---- the rail: logo, circles, +, Workshop; no gear, "?" or avatar any more
            for sel in ["#rail-logo", "#pj-rail", "#pj-plus", "#rail-workshop"]: host.wait_for_selector(sel, state="visible")
            for gone in ["#help-btn", "#settings-btn", "#me-avatar", "#nest-new", "#nest-search", "#nest-more"]:
                assert host.locator(gone).count() == 0, gone

            # ---- core rows, exactly, in order; badges, live state, toggle
            assert rows(host, "#pj-nav > .nest-row, #pj-nav #nest-huddle-row, #pj-nav #capture-toggle") == CORE, rows(host, "#pj-nav > .nest-row, #pj-nav #nest-huddle-row, #pj-nav #capture-toggle")
            for t in ["One", "Two"]: assert api("/tasks", "POST", {"title": f"Task {t}"}, token=token, project=pid)[0] == 200
            host.wait_for_function("document.querySelector('#nn-tasks').textContent === '2'", timeout=8000)
            # Updates mirrors the bell's unread count
            host.evaluate("(() => { const c = document.querySelector('#nf-count'); c.classList.remove('hidden'); c.textContent = '2'; })()")
            host.wait_for_function("document.querySelector('#nn-updates').textContent === '2'")
            # Huddle · Live when someone talks (the row starts/joins; no second Start button)
            assert host.locator("#huddle-live").is_hidden()
            assert host.locator("#h-join").count() == 0 or host.locator("#h-join").is_hidden()
            host.evaluate("(() => { TribeClient.state().huddle = [{ id: TribeClient.state().me.id }]; const r = TribeHuddle.roster; TribeHuddle.roster = () => [{ id: TribeClient.state().me.id }]; TribeClient.emit ? TribeClient.emit('huddle', {}) : null; window.__r = r; })()")
            host.evaluate("document.querySelector('#huddle-box').appendChild(document.createElement('i'))")   # nudge the live line
            host.wait_for_selector("#huddle-live:not(.hidden)")
            wait_text(host, "#nest-huddle-row", "Live")
            host.evaluate("(() => { TribeHuddle.roster = window.__r; TribeClient.state().huddle = []; document.querySelector('#huddle-box').appendChild(document.createElement('i')); })()")
            host.wait_for_selector("#huddle-live.hidden", state="attached")
            # Capture to notes is a row with a switch
            host.wait_for_selector("#pj-nav #capture-toggle[role='switch'] .sw")
            shot(host, "nav-desktop-expanded")

            # ---- groups: exact rows, collapse/expand, remembered across a reload
            assert rows(host, "#grp-hub-body .nest-row") == HUB, rows(host, "#grp-hub-body .nest-row")
            assert rows(host, "#grp-ops-body .nest-row") == OPS, rows(host, "#grp-ops-body .nest-row")
            for g in ["hub", "ops"]:
                host.click(f"#grp-{g} .nest-fold-head"); host.wait_for_selector(f"#grp-{g}-body", state="hidden")
                assert host.get_attribute(f"#grp-{g} .nest-fold-head", "aria-expanded") == "false"
            assert host.evaluate("[localStorage.getItem('tribecode.nav.hub'), localStorage.getItem('tribecode.nav.ops')]") == ["0", "0"]
            # a folded group still shows what waits on you
            st, r = api("/changes", "POST", {"title": "Hook up the gamepad"}, token=token, project=pid); assert st == 200, r
            host.wait_for_selector("#gn-hub.hot", timeout=8000)
            shot(host, "nav-desktop-collapsed")
            host.reload(); host.wait_for_selector("#grp-hub .nest-fold-head")
            assert host.locator("#grp-hub-body").is_hidden() and host.locator("#grp-ops-body").is_hidden()
            for g in ["hub", "ops"]:
                host.click(f"#grp-{g} .nest-fold-head"); host.wait_for_selector(f"#grp-{g}-body", state="visible")
            host.reload(); host.wait_for_selector("#grp-ops-body", state="visible")
            wait_text(host, "#sync-status", "connected")
            # Requests shows up in Project Hub only while something waits
            host.wait_for_selector("#nest-requests:not(.hidden) .n.hot", timeout=8000)

            # ---- every destination opens its view (and lights its row)
            for key, sel in OPENS.items():
                if key == "roles": continue
                if key == "chat": host.click(".nest-row[data-nav='chat']")
                else: host.click(f".nest [data-pnav='{key}']")
                host.wait_for_selector(sel, timeout=8000)
                host.wait_for_function("k => { const b = document.querySelector(`.nest [data-pnav='${k}']`); return b && b.classList.contains('on'); }", arg=key, timeout=4000)
                assert host.locator(".nest [data-pnav].on").count() == 1, (key, rows(host, ".nest [data-pnav].on"))
            host.click("#nest-requests"); host.wait_for_selector("#view-requests:not(.hidden)"); wait_text(host, "#pj-requests", "Hook up the gamepad")
            host.click("#nest-updates"); host.wait_for_selector("#nf-panel:not(.hidden)")
            host.keyboard.press("Escape")
            # no destination twice in the nest
            labels = no_dupes(host)
            for l in CORE + HUB + OPS + ["Settings", "Invite friends"]: assert l in labels, (l, labels)

            # ---- breadcrumb menu mirrors the hierarchy
            host.click("#crumb-section"); host.wait_for_selector("#section-menu")
            menu = host.evaluate("[...document.querySelectorAll('#section-menu h6, #section-menu button')].map(e => (e.tagName === 'H6' ? '# ' : '') + (e.querySelector('span') || e).textContent.trim())")
            assert menu[:4] == ["Chat", "Docs & files", "Updates", "Tasks"], menu
            assert menu[menu.index("# Project Hub") + 1: menu.index("# Project Hub") + 7] == HUB, menu
            assert menu[menu.index("# Coordinate & Ops") + 1:] == OPS, menu
            host.click("#section-menu [data-dest='calendar']"); host.wait_for_selector("#view-calendar:not(.hidden)")

            # ---- Ctrl K finds every destination exactly once
            dests = host.evaluate("TribeShell.dests().filter(d => d.visible)")
            for d in dests:
                host.keyboard.press("Control+k"); host.wait_for_selector("#palette:not(.hidden)")
                host.fill("#pal-input", d["label"].lower()); host.wait_for_timeout(60)
                found = host.evaluate("l => [...document.querySelectorAll('#pal-list .pal-item')].filter(b => b.querySelector('.l').textContent.trim().toLowerCase().split(/ & | · /)[0] === l.toLowerCase().split(/ & | · /)[0] && ['Go to', 'Action'].includes(b.querySelector('.k').textContent)).length", d["label"])
                assert found == 1, (d, found, host.inner_text("#pal-list"))
                host.keyboard.press("Escape")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "ownership map"); host.keyboard.press("Enter")
            host.wait_for_selector("#coord-tabs [data-ct='ownership'].on")

            # ---- bottom row: Settings and Invite work
            host.click("#nest-settings"); host.wait_for_selector("#settings-modal:not(.hidden) #set-name")
            host.keyboard.press("Escape"); host.evaluate("TribeSettings.close()")
            host.click("#tour-invite"); host.wait_for_selector("#invite-modal:not(.hidden) #inv-link")
            host.keyboard.press("Escape")
            # the header's switcher has project settings
            host.click("#nest-switch"); host.wait_for_selector("#project-menu [data-dest='project-settings']")
            host.click("#project-menu [data-dest='project-settings']"); wait_text(host, "#invite-body", "settings")
            host.keyboard.press("Escape")

            # ---- Roles: only for flow projects, a real row in Project Hub
            assert host.locator("#nest-roles").is_hidden()
            host.click("#pj-plus"); host.wait_for_selector("#np-input"); host.click("#np-create")
            host.wait_for_selector("#view-chat:not(.hidden)", timeout=20000)
            host.wait_for_selector("#grp-hub-body #nest-roles:not(.hidden)", timeout=15000)
            host.click("#nest-roles"); host.wait_for_selector(OPENS["roles"])
            host.wait_for_function("document.querySelector('#nest-roles').classList.contains('on')")
            assert rows(host, "#grp-hub-body .nest-row")[:7] == HUB + ["Roles"], rows(host, "#grp-hub-body .nest-row")
            no_dupes(host)

            # ---- phone: the swipe-in panel shows the same list, Settings + Invite at the bottom, no overflow
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_selector("#tabbar.m2-rack")
            phone.click("#menu-btn"); phone.wait_for_selector(".nest-row[data-nav='chat']", state="visible")
            phone.wait_for_timeout(400)
            assert rows(phone, "#pj-nav > .nest-row, #pj-nav #nest-huddle-row, #pj-nav #capture-toggle") == CORE
            assert rows(phone, "#grp-hub-body .nest-row")[:6] == HUB and rows(phone, "#grp-ops-body .nest-row") == OPS
            for sel in ["#nest-settings", "#tour-invite"]: phone.wait_for_selector(sel, state="visible")
            fs, inv, nest = (phone.locator(s).bounding_box() for s in ["#nest-settings", "#tour-invite", "#nest"])
            assert fs["y"] < inv["y"] and fs["y"] >= nest["y"] + nest["height"] - 2, (fs, inv, nest)
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert phone.evaluate("(() => { const s = document.querySelector('.window > .side'); return s.scrollWidth <= s.clientWidth + 1 && document.querySelector('#nest').scrollWidth <= document.querySelector('#nest').clientWidth + 1; })()")
            no_dupes(phone)
            shot(phone, "nav-phone-panel")
            phone.click("#nest-agents"); phone.wait_for_selector("#view-coord:not(.hidden)")
            assert not phone.evaluate("document.body.classList.contains('drawer-open')")
            phone.wait_for_selector("#tabbar.m2-rack", state="visible")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E nav test passed")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
