"""End-to-end: solo mode (server/agentshub.js, app/ui/agentshub.js, scripts/mcp-stdio.js) and the Secretary
(server/secretary.js, server/mcp-secretary.js, app/ui/secretary.js).

Agents hub: two agent keys of different kinds for one person both show in the hub; one is revoked (gone from the
hub, its key stops working); the default single-agent POST /api/agents still works; Claude Desktop config snippet.
Bridge: `node scripts/mcp-stdio.js` round-trips initialize + tools/list against the server and never prints the key.
Secretary: off by default; only the host toggles or ticks it; after chat + a voice-note transcript + a doc, a tick
writes the journal, the digest and an inspiration with sources from two people; questions that need research
become requests; research request -> MCP secretary_inbox -> secretary_file -> findings appear in the notes;
secretary_ask; @secretary in chat; idea -> task and -> vote; a member of another project can't read these notes;
notes are committed into the repo at notes/secretary/ when the repo autopilot commits the tribe context.
UI: the hub and the Secretary view on desktop and phone (screenshots docs/screenshots/agents-hub-*.png, secretary-*.png).
Usage: python app/test/e2e_secretary.py
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4793 + OFF
OLLAMA = 11561 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp_raw(token, body):
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None, method="tools/call", project=None):
    a = dict(args or {})
    if project: a["project"] = project
    st, d = mcp_raw(token, {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": a} if method == "tools/call" else {}})
    assert st == 200, (st, d)
    d = d["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def wait_for(fn, timeout=15, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception:
            pass
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for {what}")


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, color, token, pq, mobile=False, hash_=""):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pq}');")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1" + hash_)
    wait_text(page, "#sync-status", "connected")
    return page


def bridge(token, lines, url=None):
    env = {**os.environ, "TRIBE_TOKEN": token}
    p = subprocess.run(["node", str(ROOT / "scripts" / "mcp-stdio.js"), url or (BASE + "/mcp")], input="".join(json.dumps(l) + "\n" for l in lines),
                       capture_output=True, text=True, timeout=30, env=env)
    out = [json.loads(l) for l in p.stdout.splitlines() if l.strip()]
    return p.returncode, out, p.stderr


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="sec-src-", dir="/tmp")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    repo = os.path.join(work, "pixel-quest")
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src").mkdir(parents=True); Path(repo, "src/game.js").write_text("export const speed = 1\n")
    sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=orion@x", "-c", "user.name=Orion", "commit", "-q", "-m", "Start Pixel Quest")

    oll = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(OLLAMA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", f"http://localhost:{OLLAMA}", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_SECRETARY_COMMIT_MS": "1", "TRIBE_REPO_POLL_MS": "500"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people: Orion (host), Maya + Jay (Pixel Quest), Zed (only Side Quest) ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        pq = ok(api("/projects", "POST", {"path": repo}, token=orion), "path project")["project"]["id"]
        side = ok(api("/projects", "POST", {"name": "Side Quest"}, token=orion))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 3, "role": "builder", "project": pq}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, mid = j["token"], j["member"]["id"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Jay"})); jay, jid = j["token"], j["member"]["id"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder", "project": side}, token=orion))["invite"]
        z = ok(api("/join", "POST", {"code": inv2["code"], "name": "Zed"})); zed = z["token"]

        # ---------------- agents hub: two kinds for one person, one revoked ----------------
        cc = ok(api("/agents", "POST", token=orion, project=pq), "default agent")   # old behaviour: no body
        assert cc["agent"]["kind"] == "claude-code" and cc["agent"]["name"] == "Claude · Orion" and cc["commands"]["here"], cc["agent"]
        cc2 = ok(api("/agents", "POST", token=orion, project=pq), "default again")
        assert cc2["agent"]["id"] == cc["agent"]["id"], "default POST keeps one agent and rotates its key"
        assert mcp_raw(cc["token"], {"jsonrpc": "2.0", "id": 1, "method": "ping"})[0] == 401, "the old key stopped working"
        cc = cc2
        dk = ok(api("/agents", "POST", {"kind": "claude-desktop", "label": "Claude Desktop"}, token=orion, project=pq), "desktop agent")
        assert dk["agent"]["id"] != cc["agent"]["id"] and dk["agent"]["kind"] == "claude-desktop" and dk["agent"]["label"] == "Claude Desktop", dk["agent"]
        cfg = json.loads(dk["desktop"]["json"])["mcpServers"]["tribecode"]
        assert cfg["args"][0].endswith("mcp-stdio.js") and os.path.isabs(cfg["args"][0]) and cfg["args"][1].endswith("/mcp") and cfg["env"]["TRIBE_TOKEN"] == dk["token"], cfg
        assert "claude_desktop_config.json" in dk["desktop"]["files"]["windows"] and "Application Support/Claude" in dk["desktop"]["files"]["mac"], dk["desktop"]["files"]
        cx = ok(api("/agents", "POST", {"kind": "mcp", "label": "Codex"}, token=maya, project=pq), "maya codex")
        assert cx["desktop"]["http"]["header"].startswith("Authorization: Bearer "), cx["desktop"]
        assert api("/agents", "POST", {"kind": "mcp", "label": "x"}, token=cc["token"], project=pq)[0] == 403, "agents can't make agents"
        for t in (cc["token"], dk["token"], cx["token"]):
            e, txt = mcp(t, "tribe_overview"); assert not e, txt
        hub = ok(api("/agents/hub", token=orion, project=pq), "hub")
        kinds = {a["id"]: a for a in hub["agents"]}
        assert cc["agent"]["id"] in kinds and dk["agent"]["id"] in kinds and cx["agent"]["id"] in kinds, list(kinds)
        assert kinds[dk["agent"]["id"]]["kind"] == "claude-desktop" and kinds[dk["agent"]["id"]]["live"] and kinds[dk["agent"]["id"]]["yours"], kinds[dk["agent"]["id"]]
        assert kinds[cx["agent"]["id"]]["kind"] == "mcp" and not kinds[cx["agent"]["id"]]["yours"], kinds[cx["agent"]["id"]]
        assert hub["models"]["online"] and set(hub["models"]["list"]) == {"llama3:8b", "qwen3:8b"}, hub["models"]
        assert hub["secretary"]["enabled"] is False, "the secretary is off by default"
        mine = ok(api("/agents/mine", token=orion, project=pq))["agents"]
        assert {a["kind"] for a in mine} == {"claude-code", "claude-desktop"}, mine
        # revoke the desktop key only
        assert api(f"/agents/mine?id={cx['agent']['id']}", "DELETE", token=orion, project=pq)[0] == 404, "can't revoke someone else's agent"
        ok(api(f"/agents/mine?id={dk['agent']['id']}", "DELETE", token=orion, project=pq), "revoke desktop")
        assert mcp_raw(dk["token"], {"jsonrpc": "2.0", "id": 1, "method": "ping"})[0] == 401, "the revoked key stopped working"
        e, txt = mcp(cc["token"], "list_tasks"); assert not e, "the other key still works"
        hub = ok(api("/agents/hub", token=orion, project=pq))
        ids = [a["id"] for a in hub["agents"]]
        assert dk["agent"]["id"] not in ids and cc["agent"]["id"] in ids, ids
        assert api("/agents/hub", token=zed, project=pq)[0] == 403
        assert cx["agent"]["id"] not in [a["id"] for a in ok(api("/agents/hub", token=zed, project=side))["agents"]], "Zed doesn't see Pixel Quest's agents"
        # the bridge file is served without secrets
        with urllib.request.urlopen(BASE + "/api/agents/bridge.js") as r:
            src = r.read().decode()
        assert "runBridge" in src and "TRIBE_TOKEN" in src and orion not in src

        # ---------------- stdio bridge: initialize + tools/list ----------------
        code, out, err = bridge(cc["token"], [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "claude-desktop-test", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        ])
        assert code == 0, (code, err)
        assert len(out) == 2, out   # the notification gets no answer
        byid = {o["id"]: o for o in out}
        assert byid[1]["result"]["serverInfo"]["name"] == "tribecode", byid[1]
        names = [t["name"] for t in byid[2]["result"]["tools"]]
        assert {"secretary_inbox", "secretary_file", "secretary_ask", "tribe_overview"} <= set(names), names
        assert cc["token"] not in err, "the bridge never prints the key"
        code, out, err = bridge("not-a-key", [{"jsonrpc": "2.0", "id": 7, "method": "tools/list"}])
        assert out and out[0]["id"] == 7 and out[0]["error"]["code"] == -32001 and "401" in out[0]["error"]["message"], out
        assert "not-a-key" not in err, err

        # ---------------- secretary: only the host configures it ----------------
        assert api("/secretary/config", "PUT", {"enabled": True}, token=maya, project=pq)[0] == 403
        assert api("/secretary/tick", "POST", {}, token=jay, project=pq)[0] == 403
        assert api("/secretary/config", "PUT", {"enabled": True}, token=cc["token"], project=pq)[0] == 403
        assert api("/secretary", project=pq)[0] == 401
        c = ok(api("/secretary/config", "PUT", {"enabled": True, "model": "llama3:8b", "quiet": {"from": "25:00", "to": "06:30"}, "everyMin": 1}, token=orion, project=pq), "enable")["config"]
        assert c["enabled"] and c["model"] == "llama3:8b" and c["quiet"]["from"] == "22:00" and c["quiet"]["to"] == "06:30" and c["everyMin"] == 2, c
        assert ok(api("/secretary", token=maya, project=pq))["host"] is False

        # ---------------- what the tribe makes ----------------
        ok(api("/chat/general", "POST", {"text": "I drew a slime sprite for the cave level, it wobbles when it jumps"}, token=maya, project=pq))
        audio = base64.b64encode(b"\x1aE\xdf\xa3fakewebm" * 20).decode()
        ok(api("/chat/general/voice", "POST", {"data": audio, "mime": "audio/webm", "dur": 6, "transcript": "The cave needs a boss fight at the end, a giant slime boss that splits when you hit it"}, token=jay, project=pq), "voice note")
        ok(api("/docs", "POST", {"title": "Level ideas", "body": "## Cave\n- slime enemies in the dark\n- a boss at the end\n- torches you can carry"}, token=orion, project=pq), "doc")
        ok(api("/chat/general", "POST", {"text": "Which library should we use for pathfinding in the cave?"}, token=jay, project=pq))
        ok(api("/chat/general", "POST", {"text": "Let's go with campfires as save points"}, token=orion, project=pq))
        Path(repo, "notes").mkdir(exist_ok=True); Path(repo, "notes/sound.md").write_text("# Sound ideas\n- squishy slime steps\n- echo in the cave\n")
        ok(api("/chat/general", "POST", {"text": "Secret plan in the side project"}, token=zed, project=side))

        t = ok(api("/secretary/tick", "POST", {}, token=orion, project=pq), "tick")
        res = t["projects"][0]
        assert res["project"] == pq and res["ingested"] >= 5 and res["ideas"] >= 1, res
        s = ok(api("/secretary", token=maya, project=pq), "secretary view")
        jm = s["journal"]["md"]
        for frag in ["slime sprite", "giant slime boss", "Level ideas", "Sound ideas", "campfires as save points", "voice note"]:
            assert frag in jm, (frag, jm)
        assert "Secret plan" not in jm, "other projects stay out"
        assert "## Decisions" in jm and "campfires" in jm.split("## Decisions")[1].split("##")[0], jm
        assert s["digest"]["items"] and len(s["digest"]["items"]) <= 10, s["digest"]
        idea = s["ideas"][0]
        assert len(idea["sources"]) >= 2 and len({x["who"] for x in idea["sources"]}) >= 2 and idea["title"], idea
        assert any("slime" in i["title"].lower() or "cave" in i["title"].lower() for i in s["ideas"]), [i["title"] for i in s["ideas"]]
        auto = [r for r in s["requests"] if r["auto"]]
        assert auto and "pathfinding" in auto[0]["question"], s["requests"]
        files = os.listdir(os.path.join(tmp, "secretary", pq, "notes"))
        assert "DIGEST.md" in files and "INSPIRATION.md" in files and any(f.endswith(".md") and f[:4].isdigit() for f in files), files
        assert "slime" in Path(tmp, "secretary", pq, "notes", "INSPIRATION.md").read_text().lower()

        # ---------------- research: request -> inbox -> file -> notes ----------------
        rq = ok(api("/secretary/requests", "POST", {"question": "What is a good way to save game state in the browser?"}, token=orion, project=pq))["request"]
        assert api("/secretary/requests", "POST", {"question": "x"}, token=cc["token"], project=pq)[0] == 403, "agents use MCP"
        e, txt = mcp(cx["token"], "secretary_inbox"); assert not e and rq["id"] in txt and "pathfinding" in txt, txt
        e, txt = mcp(cx["token"], "secretary_file", {"request_id": rq["id"], "findings": ["localStorage holds about 5 MB: fine for save slots", "IndexedDB for bigger worlds"], "sources": ["https://developer.mozilla.org/docs/Web/API/IndexedDB_API"]})
        assert not e and "Filed" in txt, txt
        e, txt = mcp(cx["token"], "secretary_file", {"request_id": rq["id"], "findings": ["again"]}); assert e and "already answered" in txt, txt
        e, txt = mcp(cx["token"], "secretary_file", {"request_id": "rq-nope", "findings": ["x"]}); assert e, txt
        s = ok(api("/secretary", token=orion, project=pq))
        assert "IndexedDB for bigger worlds" in s["journal"]["md"] and "Codex" in s["journal"]["md"], s["journal"]["md"]
        assert any(x["text"].startswith("Found:") for x in s["digest"]["items"]), s["digest"]["items"]
        e, txt = mcp(cx["token"], "secretary_inbox"); assert rq["id"] not in txt, txt
        e, txt = mcp(cx["token"], "secretary_ask", {"question": "How do we store save game state?"}); assert not e and txt.strip(), txt
        a = ok(api("/secretary/ask", "POST", {"question": "what about the slime boss?"}, token=jay, project=pq))
        assert a["answer"] and a["sources"], a

        # ---------------- project scope ----------------
        assert api("/secretary", token=zed, project=pq)[0] == 403
        assert api(f"/secretary/journal/{s['journal']['date']}", token=zed, project=pq)[0] == 403
        zs = ok(api("/secretary", token=zed, project=side))
        assert "slime" not in json.dumps(zs).lower() and "IndexedDB" not in json.dumps(zs), "Side Quest sees none of Pixel Quest's notes"
        e, txt = mcp(cx["token"], "secretary_inbox", project=side); assert e, "Maya's agent can't reach Side Quest"

        # ---------------- ideas: task + vote ----------------
        r = ok(api(f"/secretary/ideas/{idea['id']}/task", "POST", {}, token=maya, project=pq), "idea task")
        tasks = ok(api("/tasks", token=maya, project=pq))["tasks"]
        assert any(x["id"] == r["task"] and x["source"] == "secretary" for x in tasks), tasks
        assert api(f"/secretary/ideas/{idea['id']}/task", "POST", {}, token=cc["token"], project=pq)[0] == 403
        v = ok(api(f"/secretary/ideas/{idea['id']}/vote", "POST", {}, token=jay, project=pq), "idea vote")
        msgs = ok(api("/chat/general", token=jay, project=pq))["messages"]
        assert any(m["id"] == v["vote"] and m.get("vote") and m["text"].startswith("Should we try") for m in msgs), msgs[-3:]

        # ---------------- @secretary in chat ----------------
        ok(api("/chat/general", "POST", {"text": "@secretary what did we decide about save points?"}, token=maya, project=pq))
        wait_for(lambda: any(m["by"] == "secretary" for m in ok(api("/chat/general", token=maya, project=pq))["messages"]), what="secretary reply")
        ok(api("/chat/general", "POST", {"text": "@secretary research best tile map editor for pixel art"}, token=jay, project=pq))
        wait_for(lambda: any("tile map editor" in r["question"] for r in ok(api("/secretary", token=orion, project=pq))["requests"]), what="research from chat")
        ok(api("/chat/general", "POST", {"text": "@secretary note the boss music should be slow"}, token=maya, project=pq))
        wait_for(lambda: "boss music should be slow" in ok(api("/secretary", token=orion, project=pq))["journal"]["md"], what="note in journal")

        # ---------------- repo: notes/secretary/ rides the autopilot's commit path ----------------
        ok(api("/repo/settings", "PUT", {"autopilot": {"enabled": True, "commitContext": True, "autoPull": False}}, token=orion, project=pq), "autopilot on")
        def committed():
            ok(api("/secretary/tick", "POST", {}, token=orion, project=pq))
            return "TribeCode secretary: update notes" in sh("git", "-C", repo, "log", "--format=%s", "-n", "20")
        wait_for(committed, timeout=20, what="secretary commit")
        assert Path(repo, "notes/secretary/DIGEST.md").exists() and Path(repo, "notes/secretary/INSPIRATION.md").exists()
        assert "slime" in Path(repo, "notes/secretary/INSPIRATION.md").read_text().lower()

        # ---------------- UI ----------------
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = login(b, {"width": 1440, "height": 900}, "Orion", "#F26B1D", orion, pq)
            try:
                page.evaluate("TribeAgentsHub.open()")
                page.wait_for_selector("#view-agents-hub:not(.hidden) .ah-card")
                wait_text(page, "#view-agents-hub", "Secretary"); wait_text(page, "#view-agents-hub", "Claude · Orion"); wait_text(page, "#view-agents-hub", "Codex")
                wait_text(page, "#view-agents-hub", "llama3:8b")
                assert page.evaluate("location.hash") == "#/agents-hub"
                assert page.is_hidden("#view-home"), "the hub replaces the current view"
                page.click(".ah-tile[data-connect='claude-desktop']")
                page.fill("#ah-label", "Studio Mac")
                page.click("#ah-form button[type=submit]")
                page.wait_for_selector("#ah-cfg")
                wait_text(page, "#ah-cfg", "mcpServers"); wait_text(page, "#ah-cfg", "mcp-stdio.js")
                wait_text(page, "#view-agents-hub .ah-grid", "Studio Mac")
                page.click(".cc-tab[data-os='windows']"); wait_text(page, "#ah-cfg-file", "%APPDATA%")
                page.evaluate("window.scrollTo(0,0); document.querySelector('.main').scrollTop = 0")
                page.mouse.move(5, 890); page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "agents-hub-desktop.png"))
                page.locator("#ah-connect").scroll_into_view_if_needed(); page.wait_for_timeout(200)
                page.screenshot(path=str(SHOTS / "agents-hub-desktop-connect.png"))
                # revoke from the card
                page.once("dialog", lambda d: d.accept())
                studio = [a for a in ok(api("/agents/mine", token=orion, project=pq))["agents"] if a["label"] == "Studio Mac"][0]
                page.click(f"[data-revoke='{studio['id']}']")
                page.wait_for_function(f"!document.querySelector(\"#view-agents-hub [data-agent='{studio['id']}']\")")
                # the app's own nav closes the hub
                page.evaluate("TribeApp.show('tasks')")
                page.wait_for_selector("#view-agents-hub", state="hidden")
                assert page.evaluate("location.hash") == "#/tasks/board"   # the Board tab of Tasks & Board has its own deep link

                page.evaluate("TribeSecretary.open()")
                page.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li")
                page.wait_for_selector("#view-secretary .sy-idea")
                wait_text(page, "#view-secretary .sy-rqs", "IndexedDB for bigger worlds")
                wait_text(page, "#view-secretary .sy-journal", "giant slime boss")
                wait_text(page, "#view-secretary", "How the secretary works")
                page.fill("#sy-q", "what about the slime?")
                page.click("#sy-ask button[type=submit]")
                page.wait_for_selector("#view-secretary .sy-answer")
                page.evaluate("document.querySelector('.main').scrollTop = 0")
                page.mouse.move(5, 890); page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "secretary-desktop.png"))
                page.locator("#view-secretary .sy-ideas").scroll_into_view_if_needed(); page.wait_for_timeout(200)
                page.screenshot(path=str(SHOTS / "secretary-desktop-board.png"))
                # one tap: idea -> vote
                n_votes = len([m for m in ok(api("/chat/general", token=orion, project=pq))["messages"] if m.get("vote")])
                btn = page.locator("#view-secretary [data-vote]").first
                if btn.count():
                    btn.click()
                    wait_for(lambda: len([m for m in ok(api("/chat/general", token=orion, project=pq))["messages"] if m.get("vote")]) > n_votes, what="vote from the board")
                # chat: the secretary's replies are labelled
                page.evaluate("TribeApp.show('chat')")
                page.wait_for_selector("#chat-list .msg.sy-msg")
                assert "Secretary" in page.inner_text("#chat-list .msg.sy-msg .mb > b")
                page.wait_for_selector("#view-secretary", state="hidden")
                # a link to #/secretary opens the view
                page.goto(BASE + "/?skipIntro=1#/secretary"); wait_text(page, "#sync-status", "connected")
                page.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li")

                # Maya (not host): no host controls
                mp = login(b, {"width": 1440, "height": 900}, "Maya", "#6C7CFF", maya, pq, hash_="#/secretary")
                mp.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li")
                assert "How the secretary works" not in mp.inner_text("#view-secretary")
                mp.context.close()

                # phone
                ph = login(b, {"width": 390, "height": 844}, "Orion", "#F26B1D", orion, pq, mobile=True)
                ph.evaluate("TribeAgentsHub.open()")
                ph.wait_for_selector("#view-agents-hub:not(.hidden) .ah-card")
                ph.wait_for_timeout(300)
                assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll on phones"
                ph.screenshot(path=str(SHOTS / "agents-hub-phone.png"))
                ph.evaluate("TribeSecretary.open()")
                ph.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li")
                ph.wait_for_timeout(300)
                assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll on phones"
                ph.screenshot(path=str(SHOTS / "secretary-phone.png"))
                ph.context.close()
            except Exception:
                try: page.screenshot(path="/tmp/sec-fail.png")
                except Exception: pass
                print("\n".join(errors)); raise
            finally:
                b.close()
        assert not errors, "\n".join(errors)
        print("e2e_secretary: OK")
    finally:
        srv.terminate(); oll.terminate()
        try:
            out = srv.communicate(timeout=5)[0].decode()
            if "Error" in out or "error" in out: print(out[-3000:])
        except Exception:
            pass


if __name__ == "__main__":
    main()
