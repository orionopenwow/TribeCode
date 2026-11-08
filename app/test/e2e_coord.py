"""End-to-end: coordinating many humans running many agents (server/coord.js, app/ui/coord.js) and the
bug board (server/bugs.js, app/ui/bugs.js).

API: agents panel (owner, task, files, tokens) and pause/stop seen through check_messages/my_lane;
ownership map with an overlap warning and a claim hand-off; conflict radar over two branches touching the
same file and "ask both to sync"; hand-off queue (MCP handoff, take); review queue (MCP request_review,
one-tap approve moves the task to done); daily plan + accept; bug triage, assign, give to agent,
attachments, duplicates, Markdown for Claude.
UI: the new shell (circle rail, nest, More menu, breadcrumbs, right panel, preview), the Coordinate view
tabs, the bug board with its ⋯ menu, the "+" new project dialog, and the phone drawer.
Usage: python app/test/e2e_coord.py [--shots]
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4781 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw or b"{}") if r.headers.get("Content-Type", "").startswith("application/json") else raw)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def shot(page, name):
    if take:
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-coord-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="coord-src-", dir="/tmp")
    sh = lambda *a, cwd=None: subprocess.run(list(a), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    repo = os.path.join(work, "pixel-quest")
    g = lambda *a: sh("git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=T", *a)
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src/ui").mkdir(parents=True); Path(repo, "src/game.js").write_text("export const speed = 1\n"); Path(repo, "src/ui/button.js").write_text("export {}\n")
    g("add", "."); g("commit", "-q", "-m", "init")

    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_AGENT_RATE": "16", "TRIBE_AGENT_HOPS": "4"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people, a project, agents ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder"}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))
        maya, mid = j["token"], j["member"]["id"]
        pq = ok(api("/projects", "POST", {"path": repo}, token=orion), "path project")["project"]["id"]
        o_ag = ok(api("/agents", "POST", token=orion, project=pq)); m_ag = ok(api("/agents", "POST", token=maya, project=pq))
        oa, ma, oa_id, ma_id = o_ag["token"], m_ag["token"], o_ag["agent"]["id"], m_ag["agent"]["id"]
        tools = [t["name"] for t in mcp(oa, None, method="tools/list")["tools"]]
        for t in ["my_lane", "suggest_task", "handoff", "request_review", "check_messages"]: assert t in tools, (t, tools)

        # ---------------- agents panel + pause/stop through check_messages ----------------
        err, txt = mcp(oa, "my_lane", {"tokens_used": 12000, "budget": 200000})
        assert not err and '"status": "go"' in txt, txt
        mcp(ma, "my_lane", {})
        ags = ok(api("/coord/agents", token=orion, project=pq))["agents"]
        mine = [a for a in ags if a["id"] == oa_id][0]
        assert mine["online"] and mine["tokens"] == 12000 and mine["budget"] == 200000 and mine["ownerName"] == "Orion" and mine["yours"], mine
        st, d = api(f"/coord/agents/{ma_id}/control", "POST", {"action": "pause"}, token=orion, project=pq)   # Orion is the host: allowed
        assert st == 200, d
        st, d = api(f"/coord/agents/{oa_id}/control", "POST", {"action": "stop"}, token=maya, project=pq)   # not Maya's agent
        assert st == 403, (st, d)
        ok(api(f"/coord/agents/{oa_id}/control", "POST", {"action": "pause", "note": "hold on, rebasing main"}, token=orion, project=pq))
        err, txt = mcp(oa, "check_messages")
        assert "PAUSE" in txt and "rebasing main" in txt, txt
        err, txt = mcp(oa, "my_lane")
        assert "PAUSE requested by Orion" in txt, txt
        ok(api(f"/coord/agents/{oa_id}/control", "POST", {"action": "resume"}, token=orion, project=pq))
        err, txt = mcp(oa, "my_lane"); assert '"status": "go"' in txt and "RESUME" in txt, txt
        ok(api(f"/coord/agents/{ma_id}/control", "POST", {"action": "resume"}, token=maya, project=pq))

        # ---------------- ownership map: lanes, overlap warning, claim hand-off ----------------
        ok(api("/coord/lanes", "POST", {"area": "src/ui/", "note": "UI kit"}, token=maya, project=pq))
        err, txt = mcp(oa, "claim_file", {"path": "src/ui/button.js", "note": "hover state"}); assert not err, txt
        own = ok(api("/coord/ownership", token=orion, project=pq))
        w = [x for x in own["warnings"] if x["kind"] == "claim-in-lane"]
        assert w and w[0]["a"]["id"] == oa_id and w[0]["b"]["id"] == mid, own["warnings"]
        assert any(o["id"] == mid and o["lanes"] for o in own["owners"]) and any(o["id"] == oa_id and o["claims"] for o in own["owners"])
        ok(api(f"/coord/claims/{w[0]['claim']}/handoff", "POST", {"to": mid}, token=orion, project=pq), "hand off claim")
        own = ok(api("/coord/ownership", token=orion, project=pq))
        assert not [x for x in own["warnings"] if x["kind"] == "claim-in-lane"], own["warnings"]
        assert any(c["path"] == "src/ui/button.js" for o in own["owners"] if o["id"] == mid for c in o["claims"])
        err, txt = mcp(oa, "check_messages"); assert "No new messages" in txt or "HANDOFF" not in txt

        # ---------------- conflict radar: two branches touch src/game.js ----------------
        for who, val in [(oid, 2), (mid, 3)]:
            g("checkout", "-q", "-b", f"tribe/{who}", "main"); Path(repo, "src/game.js").write_text(f"export const speed = {val}\n"); g("commit", "-qam", f"speed {val}")
        g("checkout", "-q", "main")
        c = ok(api("/coord/conflicts", token=orion, project=pq))
        assert c["enabled"] and len(c["pairs"]) == 1 and c["pairs"][0]["files"] == ["src/game.js"], c
        pair = c["pairs"][0]
        assert {pair["a"]["ownerName"], pair["b"]["ownerName"]} == {"Orion", "Maya"}, pair
        s = ok(api("/coord/conflicts/sync", "POST", {"a": pair["a"]["branch"], "b": pair["b"]["branch"]}, token=orion, project=pq))
        assert set(s["asked"]) == {"Orion", "Maya"}, s
        chat = ok(api("/chat/general?limit=20", token=orion, project=pq))["messages"]
        assert any("Orion asks" in m["text"] and "to sync" in m["text"] and "src/game.js" in m["text"] for m in chat), [m["text"] for m in chat]
        assert ok(api("/coord/conflicts", token=orion, project=pq))["pairs"][0]["asked"]

        # ---------------- hand-off queue ----------------
        t1 = ok(api("/tasks", "POST", {"title": "Save points at campfires", "assignee": oa_id, "status": "doing"}, token=orion, project=pq))["task"]
        err, txt = mcp(oa, "handoff", {"title": "Campfire save points", "context": "Saving works; loading is left. See src/save.js.", "to": "Maya", "task": t1["id"], "files": "src/save.js"})
        assert not err and "to Maya" in txt, txt
        hs = ok(api("/coord/handoffs", token=maya, project=pq))["handoffs"]
        assert hs[0]["status"] == "open" and hs[0]["toName"] == "Maya" and "loading is left" in hs[0]["context"], hs
        st, d = api(f"/coord/handoffs/{hs[0]['id']}/take", "POST", {}, token=orion, project=pq)
        assert st == 200 or st == 403   # the host may take it too; Maya takes it below if still open
        if st != 200: ok(api(f"/coord/handoffs/{hs[0]['id']}/take", "POST", {}, token=maya, project=pq))
        tk = [t for t in ok(api("/tasks", token=orion, project=pq))["tasks"] if t["id"] == t1["id"]][0]
        assert tk["assignee"] in (mid, oid), tk

        # ---------------- review queue: request_review, one-tap approve ----------------
        t2 = ok(api("/tasks", "POST", {"title": "Speed boots", "assignee": oa_id, "status": "doing"}, token=orion, project=pq))["task"]
        err, txt = mcp(oa, "request_review", {"branch": f"task/{t2['id']}", "title": "Speed boots", "summary": "Adds speed boots. Test: walk fast.", "task": t2["id"]})
        assert not err, txt
        apid = json.loads(txt)["approval"]
        tk = [t for t in ok(api("/tasks", token=orion, project=pq))["tasks"] if t["id"] == t2["id"]][0]; assert tk["status"] == "review", tk
        rv = ok(api("/coord/reviews", token=orion, project=pq))["reviews"]
        mine = [r for r in rv if r.get("approval") == apid][0]
        assert mine["canDecide"] and mine["status"] == "pending", mine
        assert not [r for r in ok(api("/coord/reviews", token=maya, project=pq))["reviews"] if r.get("approval") == apid][0]["canDecide"]   # medium risk: the owner decides
        assert ok(api("/coord/summary", token=orion, project=pq))["reviews"] >= 1
        ok(api(f"/coord/reviews/{mine['id']}/approve", "POST", {"note": "ship it"}, token=orion, project=pq))
        err, txt = mcp(oa, "check_approval", {"id": apid}); assert '"approved"' in txt, txt
        tk = [t for t in ok(api("/tasks", token=orion, project=pq))["tasks"] if t["id"] == t2["id"]][0]; assert tk["status"] == "done", tk
        err, txt = mcp(oa, "check_messages"); assert "approved your review" in txt, txt

        # ---------------- daily plan ----------------
        for title in ["Fix: jump clips through walls", "Title screen music", "Write tests for inventory"]:
            ok(api("/tasks", "POST", {"title": title}, token=orion, project=pq))
        ok(api("/coord/availability", "PUT", {"status": "in"}, token=maya, project=pq))
        p = ok(api("/coord/plan", "POST", {}, token=orion, project=pq))["plan"]
        assert p["items"] and p["focus"], p
        who = {i["title"]: i["name"] for i in p["items"]}
        assert "Title screen music" in who and "Write tests for inventory" in who, who
        assert any(i["kind"] == "agent" for i in p["items"]), p["items"]
        err, txt = mcp(ma, "suggest_task"); assert not err and '"task"' in txt, txt
        ok(api("/coord/plan/accept", "POST", {"all": True}, token=orion, project=pq))
        tasks = {t["title"]: t for t in ok(api("/tasks", token=orion, project=pq))["tasks"]}
        assert tasks["Title screen music"]["assignee"], tasks["Title screen music"]

        # ---------------- agents talk to agents: #agents, direct notes, delegation, approvals, loops ----------------
        for t in ["agents_read", "agents_post", "message_agent", "delegate", "accept_delegation", "decline_delegation", "recommend"]: assert t in tools, (t, tools)
        assert "delegate" in mcp(oa, None, method="initialize")["instructions"]
        err, txt = mcp(oa, "agents_post", {"text": "Hi all, I'm on campfire save points"}); assert not err, txt
        err, txt = mcp(ma, "agents_read"); assert "campfire save points" in txt and "Claude · Orion" in txt, txt
        err, txt = mcp(oa, "message_agent", {"to": "@maya's-claude", "text": "Are you touching src/ui/button.js?"}); assert not err and "Sent to Claude · Maya" in txt, txt
        th = txt.split("thread ")[1].rstrip(").")
        err, txt = mcp(ma, "check_messages"); assert "Are you touching src/ui/button.js?" in txt and "Claude · Orion" in txt, txt
        err, txt = mcp(ma, "message_agent", {"to": "Claude · Orion", "text": "Yes, done in 10 min", "thread": th}); assert not err, txt
        err, txt = mcp(oa, "check_messages"); assert "done in 10 min" in txt, txt
        ch = ok(api("/agents/channel", token=maya, project=pq))["messages"]
        assert any("Are you touching" in m["text"] and m.get("to") == ma_id for m in ch), ch   # owners see agent DMs
        assert api("/agents/channel", "POST", {"text": "hello agents"}, token=maya, project=pq)[0] == 400   # humans only @mention
        assert api("/agents/channel", "POST", {"text": "x"}, token=oa, project=pq)[0] == 403
        r = ok(api("/agents/channel", "POST", {"text": "@orion's-claude please pause after save points"}, token=maya, project=pq))
        assert r["mentioned"] == ["Claude · Orion"], r
        err, txt = mcp(oa, "check_messages"); assert "please pause after save points" in txt, txt
        # delegation, low risk across owners: delivered straight away, accepted
        err, txt = mcp(oa, "delegate", {"to": "@maya's-claude", "title": "Polish bridge sprites", "why": "You own src/ui/"}); assert not err, txt
        d1 = json.loads(txt); assert d1["status"] == "pending" and d1["to"] == "Claude · Maya", d1
        err, txt = mcp(ma, "check_messages"); assert "accept_delegation id=" + d1["delegation"] in txt, txt
        err, txt = mcp(oa, "accept_delegation", {"id": d1["delegation"]}); assert err and "not addressed to you" in txt, txt
        err, txt = mcp(ma, "accept_delegation", {"id": d1["delegation"]}); assert not err, txt
        tk = [t for t in ok(api("/tasks", token=orion, project=pq))["tasks"] if t["id"] == d1["task"]][0]
        assert tk["assignee"] == ma_id and tk["status"] == "doing", tk
        err, txt = mcp(oa, "check_messages"); assert "accepted task " + d1["task"] in txt, txt
        # medium risk across owners: Maya approves with one tap; agents can never approve
        err, txt = mcp(oa, "delegate", {"to": "Claude · Maya", "title": "Migrate save format", "why": "Touches your UI", "risk": "medium"})
        d2 = json.loads(txt); assert d2["status"] == "awaiting-approval", d2
        err, txt = mcp(ma, "accept_delegation", {"id": d2["delegation"]}); assert err and "approve" in txt, txt
        dl = [x for x in ok(api("/coord/delegations", token=maya, project=pq))["delegations"] if x["id"] == d2["delegation"]][0]
        aps = ok(api("/approvals", token=maya, project=pq))
        ap = [a for a in (aps.get("approvals") or aps.get("items") or []) if a["id"] == dl["approval"]][0]
        assert ap["to"] == [mid], ap
        assert api(f"/approvals/{dl['approval']}/approve", "POST", {}, token=ma, project=pq)[0] == 403
        assert api(f"/approvals/{dl['approval']}/approve", "POST", {}, token=oa, project=pq)[0] == 403
        ok(api(f"/approvals/{dl['approval']}/approve", "POST", {}, token=maya, project=pq), "owner approves")
        err, txt = mcp(ma, "decline_delegation", {"id": d2["delegation"], "reason": "busy with sprites"}); assert not err, txt
        err, txt = mcp(oa, "check_messages"); assert "declined" in txt and "busy with sprites" in txt, txt
        # no `to`: TribeCode picks the best agent
        err, txt = mcp(oa, "delegate", {"title": "Menu hover sound", "why": "UI polish", "files": "src/ui/menu.js"}); d3 = json.loads(txt)
        assert d3["to"] == "Claude · Maya" and "owns" in d3["picked"], d3
        # loop protection: 4 agent hops on one thread, then a human message resets it
        err, txt = mcp(oa, "message_agent", {"to": "Claude · Maya", "text": "ping 1"}); lt = txt.split("thread ")[1].rstrip(").")
        hops = 1; blocked = None
        for i in range(6):
            err, txt = mcp(ma if i % 2 == 0 else oa, "message_agent", {"to": "Claude · Orion" if i % 2 == 0 else "Claude · Maya", "text": f"pong {i}", "thread": lt})
            if err: blocked = txt; break
            hops += 1
        assert blocked and "Loop protection" in blocked and hops == 4, (hops, blocked)
        ok(api("/agents/channel", "POST", {"text": "@agents ok, carry on", "thread": lt}, token=orion, project=pq))
        err, txt = mcp(oa, "message_agent", {"to": "Claude · Maya", "text": "thanks", "thread": lt}); assert not err, txt
        # recommendations reach humans
        err, txt = mcp(ma, "recommend", {"text": "Add a settings screen for audio volume"}); assert not err and "Maya" in txt, txt
        assert any("audio volume" in r["text"] for r in ok(api("/coord/recommendations", token=maya, project=pq))["recommendations"])
        # rate limit
        limited = None
        for i in range(20):
            err, txt = mcp(ma, "agents_post", {"text": f"burst {i}"})
            if err: limited = txt; break
        assert limited and "Slow down" in limited, limited

        # ---------------- bugs: triage, assign, give to agent, attachment, duplicate, markdown ----------------
        b1 = ok(api("/bugs", "POST", {"title": "Player falls through the bridge", "repro": "1. Walk onto the bridge\n2. Jump twice", "details": "Happens on level 2."}, token=maya, project=pq))["bug"]
        assert b1["repro"].startswith("1. Walk"), b1
        b1 = ok(api(f"/bugs/{b1['id']}", "PATCH", {"status": "confirmed", "severity": "critical"}, token=orion, project=pq))["bug"]
        b1 = ok(api(f"/bugs/{b1['id']}", "PATCH", {"assignee": "me"}, token=orion, project=pq))["bug"]
        assert b1["assignee"] == oid and b1["status"] == "confirmed", b1
        r = ok(api(f"/bugs/{b1['id']}/agent", "POST", {}, token=orion, project=pq), "give to agent")
        assert r["bug"]["assignee"] == oa_id and r["bug"]["status"] == "progress" and r["bug"]["branch"] == f"task/{r['task']['id']}" and r["task"]["assignee"] == oa_id, r
        err, txt = mcp(oa, "check_messages"); assert "gave you bug" in txt and "Jump twice" in txt, txt
        a = ok(api(f"/bugs/{b1['id']}/attach", "POST", {"name": "../../evil.png", "data": "data:image/png;base64," + PNG}, token=maya, project=pq))["bug"]
        name = a["attachments"][0]["name"]; assert "/" not in name and not name.startswith("."), name
        assert not list(Path(tmp).glob("evil*")) and Path(tmp, "uploads/bugs", b1["id"], name).exists()
        st, raw = api(f"/bugs/{b1['id']}/files/{name}", token=orion, project=pq); assert st == 200 and raw[:4] == b"\x89PNG", st
        b2 = ok(api("/bugs", "POST", {"title": "Bridge collision is off near the river"}, token=maya, project=pq))["bug"]
        d = ok(api(f"/bugs/{b2['id']}/duplicate", "POST", {"of": b1["id"]}, token=orion, project=pq))
        assert d["bug"]["status"] == "duplicate" and d["into"]["count"] == 2, d
        md = ok(api(f"/bugs/{b1['id']}/markdown", token=orion, project=pq))["markdown"]
        assert "## Steps to reproduce" in md and "request_review" in md and "Merged duplicate" in md, md
        # spectators stay read-only
        sp = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=orion))["invite"]
        spt = ok(api("/join", "POST", {"code": sp["code"], "name": "Sam"}))["token"]
        assert api("/coord/lanes", "POST", {"area": "src/"}, token=spt, project=pq)[0] == 403
        assert api(f"/bugs/{b1['id']}", "PATCH", {"status": "resolved"}, token=spt, project=pq)[0] == 403
        print("coord API ok")

        if "--api-only" in sys.argv:
            return
        ui(orion, maya, pq, b1)
        assert not errors, "\n".join(errors)
        print("Coord test passed")
    finally:
        srv.terminate()
        try: out = srv.communicate(timeout=5)[0].decode()
        except Exception: out = ""
        if "--verbose" in sys.argv: print(out)


def ui(orion, maya, pq, b1):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1500, "height": 940})
        ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{orion}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pq}');")
        host = ctx.new_page(); watch(host, "host")
        try:
            ui_host(b, host, orion, maya, pq, b1)
        except Exception:
            host.screenshot(path="/tmp/coord-fail.png"); print("ERRORS:", errors); raise
        b.close()


def ui_host(b, host, orion, maya, pq, b1):
    if True:
        host.goto(BASE + "/?skipIntro=1")
        wait_text(host, "#sync-status", "connected")
        host.wait_for_selector(f"#pj-rail .pj-circle.on[data-pj-open='{pq}']")
        # the shell: circles, nest, breadcrumbs, right panel
        for sel in ["#pj-rail", "#pj-plus", "#nest", ".nest-row[data-nav='chat']", ".nest-row[data-nav='docs']", "#nest-ws-tasks", "#nest-ws-agents", "#ub-gear", "#tour-invite", "#tour-search", "#tour-room"]:
            host.wait_for_selector(sel, state="visible")
        assert host.locator("#crumbs").is_hidden(), "the breadcrumb is gone: the sidebar already says where you are"
        # the nest: four rows; the full feature set lives in the Tasks & Board and Agents Hub tabs (e2e_nav.py covers it in depth)
        for label in ["Messages", "Files", "Task Board", "Agents Hub"]:   # Settings: the gear in the bottom-left user bar
            wait_text(host, "#tour-side", label)
        host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tabs:not(.hidden)")
        for label in ["Board", "Bugs", "Proposals", "Milestones", "Calendar", "Repo", "Visuals"]: wait_text(host, "#view-tabs", label)
        host.click("#nest-ws-agents"); host.wait_for_selector("#view-tabs:not(.hidden) #wt-agents")
        for label in ["Agents", "Ownership", "Conflicts", "Hand-offs", "Reviews", "Daily plan"]: wait_text(host, "#view-tabs", label)
        host.click("#wt-agents")
        host.wait_for_selector("#view-coord:not(.hidden)")
        wait_text(host, "#coord-body", "Claude · Orion")
        wait_text(host, "#coord-body", "12k")
        wait_text(host, "#coord-body", "What the agents are saying"); wait_text(host, "#coord-body", "Polish bridge sprites")
        host.fill("#talk-input", "@agents nice work"); host.press("#talk-input", "Enter"); wait_text(host, "#coord-body .talk", "nice work")
        host.click("#coord-body [data-ctl='pause']")
        wait_text(host, "#coord-body", "Pause requested")
        shot(host, "coord-agents")
        host.click("#coord-body [data-ctl='resume']")
        for tab, text in [("ownership", "src/ui/"), ("conflicts", "src/game.js"), ("handoffs", "Campfire save points"), ("reviews", "Speed boots"), ("plan", "Title screen music")]:
            host.click(f"#wt-{tab}"); wait_text(host, "#coord-body", text)
        # agents also show in the right panel
        wait_text(host, "#room-agents", "Claude · Orion")
        # bugs board: columns, ⋯ menu, copy as Markdown, preview of the attachment
        host.click("#nest-ws-tasks"); host.click("#wt-bugs")
        host.wait_for_selector("#view-bugs:not(.hidden) .bug-col")
        wait_text(host, "#bug-list", "Player falls through the bridge")
        for col in ["New", "Confirmed", "In progress", "Fixed"]: wait_text(host, "#bug-list", col)
        card = f".bug[data-bid='{b1['id']}']"
        host.click(f"{card} [data-bug-menu]")
        for label in ["Assign to me", "Give to agent", "linked task", "Mark duplicate", "Close", "Copy as Markdown for Claude"]:
            wait_text(host, ".tf-menu", label)
        host.click(".tf-menu button:has-text('Copy as Markdown for Claude')")
        wait_text(host, ".toast", "Copied")
        host.click(f"{card} .bug-att")
        host.wait_for_selector("#tour-room.previewing #preview-body img")
        wait_text(host, "#bug-list .hero-card", "Player falls through the bridge")
        wait_text(host, "#preview-head", "png")
        shot(host, "bugs-board")
        host.click("#preview-close"); host.wait_for_selector("#tour-room:not(.previewing)")
        # + opens one simple dialog
        host.click("#pj-plus"); host.wait_for_selector(".np-setup [data-ns='own']")   # like Discord: Create my own · templates · Join
        wait_text(host, ".np-setup", "Create my own"); wait_text(host, ".np-setup", "Have an invite already")
        shot(host, "shell-new-project")
        host.keyboard.press("Escape")
        # home = project overview, chat has a docked composer mount
        host.click(".nest-row[data-nav='chat']"); host.wait_for_selector("#view-chat:not(.hidden) #composer-mount #chat-form")
        host.click("#nest-overview"); host.wait_for_selector("#view-home:not(.hidden) #pj-overview h1")
        host.wait_for_selector("#pj-living"); host.wait_for_selector("#pj-sec-tribe")
        host.wait_for_selector("#nest-pinned .pin-row[data-nav='repo']")
        shot(host, "shell-desktop")
        # right panel collapses and comes back
        assert host.locator("#panel-toggle").is_hidden(), "the reopen tab only shows while the panel is hidden"
        host.click("#panel-close"); host.wait_for_function("document.body.classList.contains('panel-off')")   # the X in the panel's corner
        host.wait_for_selector("#panel-toggle", state="visible")
        host.click("#panel-toggle"); host.wait_for_function("!document.body.classList.contains('panel-off')")   # the slim tab brings it back
        host.wait_for_selector("#panel-close", state="visible")
        # phone: circles in a strip inside the drawer, plus the nest
        phone_ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        phone_ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Maya', color:'#6C7CFF', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{maya}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pq}');")
        phone = phone_ctx.new_page(); watch(phone, "phone")
        phone.goto(BASE + "/?skipIntro=1")
        wait_text(phone, "#sync-status", "connected")
        phone.click("#menu-btn")
        phone.wait_for_selector("#pj-strip .pj-circle", state="visible")
        phone.wait_for_selector(".nest-row[data-nav='chat']", state="visible")
        assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        shot(phone, "shell-phone")
        phone.click(".nest-row[data-nav='tasks']"); phone.wait_for_selector("#view-tasks:not(.hidden)")


if __name__ == "__main__":
    main()
