"""End-to-end: Home, the command center (app/ui/hub.js, server/hub.js, server/scratch.js).

Not connected yet: Home (the hero's three panels, Ask explains it needs a tribe, a local scratchpad with "On this
device" activity, host or join, Get started at 0 of 5 and its dismiss is remembered) instead of a dead box.
Connected: the hero has three panels in a row; Ask goes to your own agent's private chat (its reply shows inline) or
to the local model (the mock's answer inline, Open in chat); POST /api/hub/ask is people-only and rate-limited; Get
started shows progress, Refine with AI suggests a first project, dismiss persists; the scratchpad's Refine with AI ->
Replace rewrites the note; Recent activity merges every project the member can see (scoped members only theirs, API
and UI) and updates live; Resume jumps back to the last project + view; typing on Home opens Ctrl K; Agents & models
shows an MCP agent (context %, tokens) and the mock Ollama model; the sidebar collapses into one Global group; the
workspace switcher pins projects; the right panel shows you, Connect your Claude Code, Share my hub link, Invite
friends and AI Insights (fallback cards, then /api/insights mocked with a one-tap action; collapsible, remembered);
the private scratchpad persists and files notes; the update icon opens the update flow; the phone layout (390px) has
no horizontal overflow.
Usage: python app/test/e2e_hub.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4851 + OFF
OLLAMA = 11571 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
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


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name, full=False):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def signed_in(ctx, token, name):
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:{json.dumps(name)}, onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-hub-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="hub-src-", dir="/tmp")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    repo = os.path.join(work, "lantern")
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src").mkdir(parents=True); Path(repo, "src/glow.js").write_text("export const glow = 1\n")
    sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=orion@x", "-c", "user.name=Orion", "commit", "-q", "-m", "Light the first lantern")

    oll = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(OLLAMA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.3)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", f"http://localhost:{OLLAMA}", "--name", "Lantern Crew"],
                           stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_DASH_THROTTLE_MS": "300"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people + projects: Orion hosts; Zed is only in Sketches ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        lan = ok(api("/projects", "POST", {"path": repo}, token=orion), "path project")["project"]["id"]
        sk = ok(api("/projects", "POST", {"name": "Sketches"}, token=orion))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder", "project": sk}, token=orion))["invite"]
        z = ok(api("/join", "POST", {"code": inv["code"], "name": "Zed"})); zed, zid = z["token"], z["member"]["id"]
        ok(api("/docs", "POST", {"title": "Lantern lore", "body": "# Lantern lore\nThe lanterns remember every traveller."}, token=orion, project=lan))
        ok(api("/docs", "POST", {"title": "Sketch list", "body": "Charcoal studies of the moon."}, token=zed, project=sk))
        ok(api("/tasks", "POST", {"title": "Ink the moon"}, token=zed, project=sk))

        # ---------------- API: member-scoped, never leaks ----------------
        h = ok(api("/hub", token=orion), "host hub")
        fp = {x["project"] for x in h["feed"]}
        assert lan in fp and sk in fp, (fp, [(x["kind"], x["title"]) for x in h["feed"]])
        assert any(x["kind"] == "commit" and "first lantern" in x["title"] for x in h["feed"]), h["feed"]
        zh = ok(api("/hub", token=zed), "zed hub")
        assert {x["project"] for x in zh["feed"]} <= {sk} and zh["feed"], zh["feed"]
        assert {p["id"] for p in zh["projects"]} == {sk}, zh["projects"]
        assert "Lantern" not in json.dumps(zh), "a scoped member never sees other projects"
        assert {r["project"] for r in ok(api("/hub/repos", token=zed))["repos"]} == {sk}
        repos = ok(api("/hub/repos", token=orion))["repos"]
        lr = [r for r in repos if r["project"] == lan][0]
        assert lr["repo"] and lr["repo"]["name"] == "lantern", lr
        assert [d["project"] for d in ok(api("/hub/docs?q=moon", token=zed))["docs"]] == [sk]
        assert ok(api("/hub/docs?q=lantern", token=zed))["docs"] == [], "global docs stay scoped"
        assert any(d["title"] == "Lantern lore" for d in ok(api("/hub/docs?q=traveller", token=orion))["docs"]), "body search"
        assert api("/hub/prefs", "PUT", {"pins": [lan]}, token=zed)[1]["pins"] == [], "cannot pin a project you are not in"
        assert api("/hub", token=None)[0] == 401
        # agents can't use the hub or the scratchpad
        ag = ok(api("/agents", "POST", token=orion, project=lan)); agt, agid = ag["token"], ag["agent"]["id"]
        mcp(agt, "my_lane", {"tokens_used": 42000, "budget": 200000})
        err, txt = mcp(agt, "report_context", {"used_pct": 37, "focus": "Wiring the lantern glow shader"}); assert not err, txt
        st, _ = api("/scratch", token=agt); assert st == 403
        # the scratchpad is private
        ok(api("/scratch", "PUT", {"notes": [{"text": "Zed's secret sketch idea"}]}, token=zed))
        assert ok(api("/scratch", token=orion))["notes"] == [], "the host cannot read Zed's scratchpad"

        # fleet: the agent (context %, tokens), the mock model, the loops
        f = ok(api("/hub/fleet", token=orion))
        a = [x for x in f["agents"] if x["id"] == agid][0]
        assert a["online"] and a["context"] == 37 and a["tokens"] == 42000 and "lantern glow" in a["doing"].lower(), a
        assert f["models"]["online"] and f["models"]["model"], f["models"]
        assert {l["id"] for l in f["loops"]} >= {"secretary", "autopilot", "preview"}, f["loops"]
        assert ok(api("/hub/fleet", token=zed))["agents"] == [], "Zed sees only his own agents"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------------- not connected yet: the hub, never a dead box ----------------
            octx = b.new_context(viewport={"width": 1440, "height": 900})
            octx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Guest', onboarded: true}))")
            off = octx.new_page(); watch(off, "offline")
            off.goto(BASE + "/?skipIntro=1")
            off.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            # Home is simple: one hero (Getting started: one honest empty state, one primary action), then Scratchpad | Recent activity
            wait_text(off, "#hub-hero .eyebrow", "GETTING STARTED")
            wait_text(off, "#hub-hero", "Make your first project"); wait_text(off, "#hub-hero", "Join with a link")
            assert off.locator("#hub-demo").count() == 0, "the demo isn't pushed on Home (it's in the ? menu and Ctrl K)"
            for gone in ["#hub-suggest", "#hub-ask-in", "#hub-start", "#hub-fleet"]: assert off.locator(gone).count() == 0, f"{gone} is gone from Home"
            for sel in ["#hub-join", "#hub-host", "#hub-note-new", "#hub-stream", "#grp-global"]: off.wait_for_selector(sel, state="visible")   # no "Your home" card: you are in the bar
            wait_text(off, ".hub-head .eyebrow", "YOUR COMMAND CENTER")   # eyebrows render uppercase
            assert off.locator("#home-share-btn").count() == 0 and off.locator("#home-invite").count() == 0, "no Share / Invite buttons in the Home panel"
            wait_text(off, "#home-ai-cards", "Start or join a tribe")
            assert off.locator(".solo-empty:visible").count() == 0
            off.evaluate("TribeApp.show('chat')")
            off.wait_for_selector("#view-hub:not(.hidden)")
            assert off.is_hidden("#view-chat"), "chat without a tribe lands on the hub"
            # Start a note (no tribe yet: it stays on this device) -> the editor -> it's in your docs center
            off.click("#hub-note-new"); off.wait_for_selector("#note-ed #note-text")
            off.fill("#note-title", "Offline idea: lanterns that hum"); off.click("#note-done")
            off.wait_for_selector("#hub-docs [data-mynote]"); wait_text(off, "#hub-docs", "lanterns that hum")
            off.reload(); off.evaluate("TribeHub.open('home')"); off.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(off, "#hub-notes", "lanterns that hum")
            wait_text(off, "#hub-feed", "On this device"); wait_text(off, "#hub-feed", "lanterns that hum")
            off.evaluate("scrollTo(0, 0)"); off.mouse.move(700, 880); shot(off, "home-desktop-not-connected")
            off.click("#hub-join"); off.wait_for_selector("#invite-modal:not(.hidden) #join-link")
            off.keyboard.press("Escape")
            octx.close()

            # ---------------- Orion: connected hub ----------------
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            signed_in(ctx, orion, "Orion")
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1&simulateUpdate=0.9.0")
            host.wait_for_function("TribeClient.connected()")
            host.wait_for_selector("#view-home:not(.hidden)")   # connected: the project home, as before
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            assert host.evaluate("location.hash") == "#/hub"
            # the hero once you're in: Quick start, two big choices side by side, and two small links
            wait_text(host, "#hub-hero .gs-band", "QUICK START")
            tops = host.evaluate("['#hub-resume', '#hub-instant'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left), Math.round(r.width)]; })")
            assert tops[0][0] == tops[1][0] and tops[0][1] < tops[1][1] and all(t[2] > 250 for t in tops), tops
            host.wait_for_selector("#hub-hero #hub-new"); host.wait_for_selector("#hub-hero #hub-join")
            wait_text(host, "#crumb-label", "Home")
            host.wait_for_selector("#hub-feed .ha-row")
            if host.locator("#hub-feed-more").count(): host.click("#hub-feed-more")
            wait_text(host, "#hub-feed", "Light the first lantern")
            wait_text(host, "#hub-feed", "Sketch list")
            host.wait_for_selector("#hub-feed .ha-row .ha-av")
            chips = host.evaluate("[...document.querySelectorAll('#hub-feed .hub-chip')].map(e => e.textContent.trim())")
            assert "lantern" in chips and "Sketches" in chips, chips   # a folder project is named after its folder
            # the sidebar: the four rows are the Global ones, plus a way into the project
            assert host.locator("#nest-ws-tasks").is_hidden() and host.locator("#nest-chat").is_hidden()
            _g = [t.strip() for t in host.locator("#grp-global .nest-row span").all_inner_texts()]; assert _g == ["Home", "All files", "All code", "Work", "Agent fleet"], _g   # v0.27: Work (gigs, hiring) lives on Home
            assert host.evaluate("document.body.classList.contains('global')")
            host.wait_for_selector("#pj-rail [data-pj-open]", state="attached")   # projects are the rail bubbles
            # right panel: agents + helpers + scratchpad
            host.wait_for_selector("#room-agents .ra-row, #room-agents [data-agent]")
            host.wait_for_selector("#helpers-toggle"); host.evaluate("document.querySelector('#helpers-toggle').getAttribute('aria-expanded') === 'false' && document.querySelector('#helpers-toggle').click()")   # helpers start folded
            wait_text(host, "#room-helpers", "Secretary"); wait_text(host, "#room-helpers", "Flint")   # the built-in helper (was "Local model")
            host.wait_for_selector("#hub-note-new")
            assert host.locator("#room-scratch").is_hidden(), "Home has Start a note in the page, not the panel"
            # right panel on Home: you, Connect your Claude Code, Share my hub link, Invite friends, AI Insights
            wait_text(host, "#home-me", "Orion"); host.wait_for_selector("#cc-connect", state="hidden")   # Orion's Claude Code is connected (MCP above): no Connect card
            order = host.evaluate("['#home-me', '#home-insights'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top))")
            assert order == sorted(order), order
            wait_text(host, "#home-ai-cards", "Ink the moon")   # no /api/insights here: the hub's suggestions
            host.wait_for_selector("#home-ai-cards .ai-card .ai-tag")
            host.evaluate("scrollTo(0, 0)"); host.mouse.move(700, 880); shot(host, "home-desktop-connected")
            host.evaluate("document.querySelector('#hub-notes').scrollIntoView({ block: 'start' })"); shot(host, "home-desktop-connected-bottom"); host.evaluate("scrollTo(0, 0); document.querySelector('#hub-hero').scrollIntoView({ block: 'end' })")

            # ---------------- the Ask API (Home's box is gone; @ai in chat asks): limits still hold ----------------
            assert api("/hub/ask", "POST", {"prompt": "hi"}, token=agt)[0] == 403, "agents cannot use Ask"
            assert api("/hub/ask", "POST", {"prompt": ""}, token=orion)[0] == 400
            codes = [api("/hub/ask", "POST", {"prompt": f"q{i}"}, token=zed)[0] for i in range(7)]
            assert codes[:6] == [200] * 6 and codes[6] == 429, codes

            # ---------------- Share my hub link, Invite friends ----------------
            host.click("#hub-instant"); host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000)
            assert "/join/" in host.inner_text("#ii-link")
            host.click(".modal-card.ii [data-close]"); host.wait_for_selector("#invite-modal.hidden", state="attached")
            host.evaluate("TribeHub.open('home')"); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero")

            # ---------------- AI Insights: collapsible (remembered), and fed by /api/insights when the host has it ----------------
            host.click("#home-ins-toggle"); host.wait_for_selector("#home-ai-cards", state="hidden")
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            host.wait_for_selector("#home-insights.closed"); host.click("#home-ins-toggle"); host.wait_for_selector("#home-ai-cards", state="visible")
            fake = {"items": [{"id": "i1", "kind": "optimization", "title": "Cache the repo status", "body": "git status runs on every request; cache it for 5 s.", "source": "Explorer", "at": "2026-11-07T08:00:00Z", "action": {"label": "Open docs", "view": "docs", "project": lan}},
                              {"id": "i2", "kind": "health", "title": "All checks green", "body": "15 pages explored, no errors.", "source": "Self-heal"}]}
            assert ok(api("/hub", token=orion)).get("insightsApi") in (False, True)
            def with_insights(route):   # pretend server/insights.js is on this host
                r = route.fetch(); d = r.json(); d["insightsApi"] = True
                route.fulfill(response=r, body=json.dumps(d))
            host.route(lambda u: u.endswith("/api/hub"), with_insights)
            host.route("**/api/insights", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(fake)))
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            wait_text(host, "#home-ai-cards", "Cache the repo status")
            host.wait_for_selector("#home-ai-cards .ai-card.k-optimization .ai-tag"); host.wait_for_selector("#home-ai-cards .ai-card.k-health")
            assert "Ink the moon" in host.inner_text("#home-ai-cards"), "your own suggestions stay next to the host's insights"
            shot(host, "home-insights")
            host.click("#home-ai-cards .ai-card.k-optimization [data-ai-card-go]")
            host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan, timeout=8000)
            host.unroute("**/api/insights"); host.unroute_all()
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            # live: a new doc in Lantern shows up without a reload
            ok(api("/docs", "POST", {"title": "Glow shader notes", "body": "Bloom off, flat rings."}, token=orion, project=lan))
            wait_text(host, "#hub-feed", "Glow shader notes", timeout=12000)
            # typing on Home (outside the boxes) types into Ctrl K
            host.click(".hub-head h1")
            host.keyboard.press("g"); host.wait_for_selector("#palette:not(.hidden)")
            assert host.input_value("#pal-input") == "g"
            host.keyboard.press("Escape")

            # ---------------- jump to an item, then Resume brings you back ----------------
            host.click("#hub-feed [data-feed^='doc:glow-shader-notes']")
            host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan, timeout=8000)
            host.wait_for_function("t => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg="Glow shader notes", timeout=10000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(host, "#hub-resume", "lantern"); wait_text(host, "#hub-resume", "Files")
            host.locator("#pj-rail .pj-circle.on").first.dispatch_event("click"); host.wait_for_selector("#view-home:not(.hidden)")
            assert not host.evaluate("document.body.classList.contains('global')")
            host.wait_for_selector("#nest-ws-tasks", state="visible")   # back in a project: its four rows
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tasks:not(.hidden)")
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(host, "#hub-resume", "Task Board")
            host.click("#hub-resume"); host.wait_for_selector("#view-tasks:not(.hidden)")

            # ---------------- Global group: All repos, Global docs, Agent fleet ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-repos-all"); host.wait_for_selector(f"#hub-repos [data-repo='{lan}']")
            wait_text(host, "#hub-repos", "main"); wait_text(host, "#hub-repos", "Sketches")
            assert host.evaluate("location.hash") == "#/hub/repos"
            assert host.evaluate("document.querySelector('#nest-repos-all').classList.contains('on')")
            host.click(f"#hub-repos [data-repo='{sk}']")
            host.wait_for_selector("#view-repo:not(.hidden)")
            host.wait_for_function("sk => TribeClient.project() === sk", arg=sk, timeout=8000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-docs-all"); host.wait_for_selector("#hub-dq")
            host.fill("#hub-dq", "traveller"); wait_text(host, "#hub-docs", "Lantern lore")
            host.wait_for_function("() => !document.querySelector('#hub-docs').innerText.includes('Glow shader')")   # filtered by the body text
            host.click("#hub-docs [data-gdoc$='|lantern-lore']"); host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan, timeout=8000)
            host.wait_for_function("t => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg="Lantern lore", timeout=10000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.mouse.move(700, 880); shot(host, "hub-sidebar-global")
            host.click("#nest-fleet"); host.wait_for_selector("#view-agents-hub:not(.hidden)")

            # ---------------- no dropdown: the logo is Home, the bubbles are projects; right-click a bubble to pin ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            assert host.query_selector("#nest-switch") is None, "no switcher dropdown at the top of the sidebar"
            assert host.locator("#ws-name").is_hidden(), "no tribe name in the breadcrumb"
            assert not host.inner_text("#nest-enter").strip(), "Home lists no projects in the sidebar: the rail bubbles are the projects"
            host.locator(f"#pj-rail [data-pj-open='{sk}']").first.dispatch_event("contextmenu"); host.wait_for_selector("#rail-menu [data-rc='pin']")
            host.click("#rail-menu [data-rc='pin']")
            for _ in range(40):
                if ok(api("/hub/prefs", token=orion))["pins"] == [sk]: break
                time.sleep(0.25)
            assert ok(api("/hub/prefs", token=orion))["pins"] == [sk], "pin saved"
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden)")
            host.wait_for_function("sk => { const b = document.querySelector('#pj-rail [data-pj-open]'); return b && b.dataset.pjOpen === sk; }", arg=sk)   # pinned first
            host.locator(f"#pj-rail [data-pj-open='{lan}']").first.dispatch_event("click")
            host.wait_for_selector("#view-home:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan)

            # ---------------- notes: Start a note -> editor -> your docs center (private, persists) ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#hub-note-new"); host.wait_for_selector("#note-ed #note-text")
            assert host.evaluate("TribeHub.mode()") == "docs", "a new note opens in your docs center"
            host.fill("#note-title", "Moon phases doc"); host.fill("#note-text", "New, waxing, full, waning"); host.click("#note-done")
            host.wait_for_selector("#hub-docs [data-mynote]"); wait_text(host, "#hub-docs", "Moon phases doc")
            for _ in range(30):
                if "waxing" in json.dumps(ok(api("/scratch", token=orion))["notes"]): break
                time.sleep(0.2)
            assert ok(api("/scratch", token=orion))["notes"][0]["text"].startswith("Moon phases doc")
            assert ok(api("/scratch", token=zed))["notes"][0]["text"] == "Zed's secret sketch idea", "Zed's own notes, untouched"
            # your notes sit above the project docs
            # one docs center: your notes and project docs as cards, newest first; list/grid is remembered
            host.click("[data-dv=list]"); host.wait_for_selector("#hub-docs.list"); host.reload(); host.evaluate("TribeHub.open('docs')"); host.wait_for_selector("#hub-docs.list"); host.click("[data-dv=grid]")
            # ---------------- Files: upload any kind of file (a picture, an odd type), filter, open, delete ----------------
            pic = Path(tempfile.mkdtemp(prefix="tribe-up-", dir="/tmp"))
            import struct, zlib; ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
            (pic / "dot.png").write_bytes(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(b"".join(b"\x00" + b"\xf2\x6b\x1d" * 8 for _ in range(8)))) + ch(b"IEND", b""))
            (pic / "level.tmx").write_text("<map/>")
            host.wait_for_selector("#dc-up", state="visible")
            with host.expect_file_chooser() as fc:
                host.click("#dc-up"); host.click("#dc-upmenu [data-scope=me]")
            fc.value.set_files([str(pic / "dot.png"), str(pic / "level.tmx")])
            host.wait_for_selector("#hub-docs [data-up] img.dc-thumb[src^='blob:']", timeout=15000)
            wait_text(host, "#hub-docs", "level.tmx")
            host.click("[data-dk=pics]"); host.wait_for_function("() => !document.querySelector('#hub-docs').innerText.includes('level.tmx') && document.querySelector('#hub-docs').innerText.includes('dot.png')")
            host.click("[data-dk=code]"); wait_text(host, "#hub-docs", "level.tmx")
            host.click("#hub-docs [data-up]"); host.wait_for_selector("#fv .fv-pre:has-text(\"map\")"); assert host.get_attribute("#fv-dl", "href").startswith("blob:")
            host.click("#fv-del"); host.click("#fv-del"); host.wait_for_selector("#fv", state="detached")
            host.wait_for_function("() => !document.querySelector('#hub-docs').innerText.includes('level.tmx')")
            ups = ok(api("/uploads", token=orion)); assert [f["name"] for f in ups["mine"]] == ["dot.png"], ups
            assert ok(api("/uploads", token=zed))["mine"] == [], "your files are only yours"
            host.click("[data-dk=all]")
            # reopen and edit autosaves
            host.click("#hub-docs [data-mynote]"); host.wait_for_selector("#note-text")
            host.fill("#note-text", "New, waxing, full, waning, gibbous"); host.wait_for_timeout(900); host.click("#note-done")
            for _ in range(30):
                if "gibbous" in json.dumps(ok(api("/scratch", token=orion))["notes"]): break
                time.sleep(0.2)
            assert "gibbous" in json.dumps(ok(api("/scratch", token=orion))["notes"])
            # filing a note into a project still works through the API (move / task)
            nid = ok(api("/scratch", token=orion))["notes"][0]["id"]
            ok(api(f"/scratch/{nid}/move", "POST", {"project": sk}, token=orion))
            assert any(d["title"] == "Moon phases doc" for d in ok(api("/docs", token=orion, project=sk))["docs"])
            assert api("/scratch/refine", "POST", {"text": "x"}, token=agt)[0] == 403
            st, d = api(f"/scratch/n-nope1234/move", "POST", {"project": sk}, token=zed); assert st == 404, (st, d)
            ok(api("/scratch", "PUT", {"notes": [{"text": "try to file elsewhere"}]}, token=zed))
            zn = ok(api("/scratch", token=zed))["notes"][0]["id"]
            st, d = api(f"/scratch/{zn}/move", "POST", {"project": lan}, token=zed); assert st == 403, (st, d)

            # ---------------- update icon: the same save / hand-off / restart flow ----------------
            assert host.locator("#update-pill").count() == 0
            host.wait_for_selector("#update-btn.ready:not(.hidden)")
            # desktop: the header keeps only the update button; you, the bell and Friends sit in the bottom-left user bar
            assert host.evaluate("[...document.querySelectorAll('.titlebar .tb-right > *')].filter(e => e.offsetParent !== null).map(e => e.id).filter(Boolean)") == ["update-btn", "tb-help"]
            assert host.evaluate("['#pf-btn', '#nf-bell', '#fr-btn'].every(s => document.querySelector(s).closest('#userbar'))"), "user bar holds profile, bell, friends"
            order = host.evaluate("['#pf-btn', '#nf-bell', '#fr-btn'].map(s => document.querySelector(s).getBoundingClientRect().left)")
            assert order == sorted(order), order
            assert host.locator(".titlebar #panel-toggle").count() == 0 and host.locator("#ctx-btn").is_hidden()
            host.keyboard.press("Control+Shift+K"); host.wait_for_selector("#ctx-win:not(.hidden)"); host.keyboard.press("Control+Shift+K")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "tribe context"); host.keyboard.press("Enter"); host.wait_for_selector("#ctx-win:not(.hidden)")
            host.keyboard.press("Control+Shift+K"); host.wait_for_selector("#ctx-win.hidden", state="attached")
            # the right panel: an X in its corner hides it, a slim tab brings it back (remembered)
            assert host.locator("#panel-toggle").is_hidden()
            host.click("#panel-close"); host.wait_for_function("document.body.classList.contains('panel-off')")
            host.wait_for_selector("#panel-toggle", state="visible")
            shot(host, "hub-header-panel-closed")
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden)"); host.wait_for_selector("#panel-toggle", state="visible")
            host.click("#panel-toggle"); host.wait_for_function("!document.body.classList.contains('panel-off')")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "toggle right panel"); host.keyboard.press("Enter")
            host.wait_for_function("document.body.classList.contains('panel-off')")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "toggle right panel"); host.keyboard.press("Enter")
            host.wait_for_function("!document.body.classList.contains('panel-off')")
            host.wait_for_selector("#update-btn.ready:not(.hidden)")
            host.click("#update-btn", button="right"); host.wait_for_selector("#update-pop:not(.hidden)")   # left click restarts at once
            assert "v0.9.0 is ready" in host.inner_text("#update-pop")
            shot(host, "hub-update")
            host.click("[data-u='close']"); host.wait_for_selector("#update-pop.hidden", state="attached")
            host.click("#pf-btn"); host.wait_for_selector("#pf-menu [data-act='restart']")
            wait_text(host, "#pf-menu", "Update ready · v0.9.0")   # its Restart restarts at once (app/test/e2e_updater.py)
            host.keyboard.press("Escape")

            # ---------------- Zed (scoped): only Sketches in the UI ----------------
            zctx = b.new_context(viewport={"width": 1440, "height": 900})
            signed_in(zctx, zed, "Zed")
            zp = zctx.new_page(); watch(zp, "zed")
            zp.goto(BASE + "/?skipIntro=1#/hub")
            zp.wait_for_selector("#view-hub:not(.hidden) #hub-feed")
            wait_text(zp, "#hub-feed", "Sketch list")
            assert "lantern" not in zp.inner_text("#view-hub").lower().replace("lantern crew", ""), zp.inner_text("#view-hub")
            wait_text(zp, "#hub-notes", "try to file elsewhere")   # Zed's own notes on Zed's Home
            assert "Moon phases" not in zp.inner_text("#hub-notes")
            zp.click("#nest-repos-all"); zp.wait_for_selector(f"#hub-repos [data-repo='{sk}']")
            assert zp.locator(f"#hub-repos [data-repo='{lan}']").count() == 0
            zctx.close()

            # ---------------- phone: hub at 390px, no horizontal overflow ----------------
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            signed_in(ph, orion, "Orion")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1#/hub")
            phone.wait_for_selector("#view-hub:not(.hidden) #hub-hero")
            wait_text(phone, "#hub-feed", "Glow shader notes")
            phone.wait_for_selector("#hub-note-new", state="visible")   # no right panel on phones: Start a note lives on Home
            phone.wait_for_selector("#hub-ins-phone .ai-card")               # and so do the AI insights
            assert phone.locator("#tabbar").is_hidden(), "no bottom rack on Home: it opens once you're in a project"
            phone.wait_for_selector("#hub-pjs [data-pj-go]")                  # phones have no rail: projects are rows on Home
            assert phone.locator(".titlebar .search").is_hidden() and phone.locator("#ctx-btn").is_hidden(), "no search or docs icons on the phone's top bar"
            assert phone.locator(".titlebar").is_hidden(), "phone Home has no top bar: the rack at the bottom has everything"
            phone.wait_for_selector("#m2-homebar [data-hb=home]", state="visible"); phone.wait_for_selector("#hpt-me .me-face", state="visible")   # Home tab in the rack; you sit top left of Home
            # stacked: the hero, notes, activity, insights
            ys = phone.evaluate("['#hub-hero', '#hub-pjs-sec', '#hub-notes', '#hub-stream', '#hub-insights'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY))")
            assert ys == sorted(ys), ys
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), phone.evaluate("document.documentElement.scrollWidth")
            wide = phone.evaluate("[...document.querySelectorAll('#view-hub *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.ha-row, .hf-row, .hub-li, .sc-text, .hs-li')).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))")
            assert not wide, wide
            shot(phone, "home-phone")
            phone.evaluate("document.querySelector('#hub-stream').scrollIntoView({ block: 'start' })"); shot(phone, "home-phone-3")
            phone.evaluate("scrollTo(0, 0); document.querySelector('#m2-homebar').classList.remove('away')"); phone.wait_for_timeout(300)
            r = phone.locator("#m2-homebar [data-hb=pjs]").bounding_box(); phone.mouse.click(r["x"] + r["width"] / 2, r["y"] + r["height"] / 2)   # tap Projects (no scrolling: that hides the rack)
            phone.wait_for_selector("#grp-global", state="visible")
            assert phone.evaluate("(() => { const s = document.querySelector('.window > .side'); return s.scrollWidth <= s.clientWidth + 1; })()")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E hub test passed")
    finally:
        srv.terminate(); oll.terminate()


if __name__ == "__main__":
    main()
