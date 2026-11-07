"""End-to-end: the person view (server/people.js, server/mcp-people.js, app/ui/people.js).

API: GET /api/people/:id (member, presence, now, context, timeline, counters) with commits from the project
repo, agent prompts (MCP calls + share_prompt), chat and notes; kind filter and paging; commit diff summary;
chat around a moment; report_context; the status line (uptime + commit counter); /api/health uptime; a person
from another project is 403.
UI: click a name in chat -> the panel opens inside the chat column with commits, prompts, chat and notes;
filter chips; a commit expands to its files and the chat around then; a chat item jumps to and highlights the
message in the main chat; room-list avatar opens the panel; the phone bottom sheet; the status line.
Usage: python app/test/e2e_people.py [--shots]   (screenshots are always written to docs/screenshots/people-*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4791 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
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


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, color, token, pq, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pq}');")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    wait_text(page, "#sync-status", "connected")
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-people-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="people-src-", dir="/tmp")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    repo = os.path.join(work, "pixel-quest")
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src").mkdir(parents=True); Path(repo, "src/game.js").write_text("export const speed = 1\n")
    sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=orion@x", "-c", "user.name=Orion", "commit", "-q", "-m", "Start Pixel Quest")

    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        h = ok(api("/health"))
        assert isinstance(h.get("uptime"), int) and h.get("startedAt"), h

        # ---------------- people: Orion (host), Maya (in Pixel Quest), Zed (only in another project) ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        pq = ok(api("/projects", "POST", {"path": repo}, token=orion), "path project")["project"]["id"]
        side = ok(api("/projects", "POST", {"name": "Side Quest"}, token=orion))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder", "project": pq}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, mid = j["token"], j["member"]["id"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder", "project": side}, token=orion))["invite"]
        z = ok(api("/join", "POST", {"code": inv2["code"], "name": "Zed"})); zed, zid = z["token"], z["member"]["id"]
        m_ag = ok(api("/agents", "POST", token=maya, project=pq)); ma, ma_id = m_ag["token"], m_ag["agent"]["id"]

        # ---------------- their work: a commit, chat, an agent at work, a note ----------------
        Path(repo, "src/menu.js").write_text("export function pause() {}\n"); Path(repo, "src/game.js").write_text("export const speed = 2\nexport const paused = false\n")
        sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=maya@x", "-c", "user.name=Maya", "commit", "-q", "-m", "Add a pause menu")
        ok(api("/chat/general", "POST", {"text": "Morning! Starting on the pause menu"}, token=maya, project=pq))
        ok(api("/chat/general", "POST", {"text": "Nice, I'll do the title screen"}, token=orion, project=pq))
        tools = [t["name"] for t in mcp(ma, None, method="tools/list")["tools"]]
        assert "share_prompt" in tools and "report_context" in tools, tools
        err, txt = mcp(ma, "share_prompt", {"summary": "Build the pause menu with resume and quit"}); assert not err, txt
        err, txt = mcp(ma, "report_context", {"used_pct": 63, "focus": "wiring the pause key"}); assert not err and "63%" in txt, txt
        err, txt = mcp(ma, "claim_file", {"path": "src/menu.js", "note": "pause menu"}); assert not err, txt
        err, txt = mcp(ma, "create_task", {"title": "Pause sound effect"}); assert not err, txt
        mcp(ma, "list_tasks")   # reads are not logged
        err, txt = mcp(ma, "share_prompt", {"summary": ""}); assert err, txt
        ok(api("/docs", "POST", {"title": "Pause menu notes", "body": "Esc pauses. Resume, Settings, Quit."}, token=maya, project=pq))
        for i in range(3): ok(api("/chat/general", "POST", {"text": f"later message {i}"}, token=orion, project=pq))

        # ---------------- API ----------------
        p = ok(api(f"/people/{mid}", token=orion, project=pq), "person")
        assert p["member"]["name"] == "Maya" and p["member"]["agentOf"]["id"] == ma_id, p["member"]
        kinds = {x["kind"] for x in p["timeline"]["items"]}
        assert kinds == {"commit", "prompt", "chat", "note"}, kinds
        texts = [x["text"] if x["kind"] != "note" else x["title"] for x in p["timeline"]["items"]]
        assert "Add a pause menu" in texts and "Build the pause menu with resume and quit" in texts and "Morning! Starting on the pause menu" in texts and "Pause menu notes" in texts, texts
        assert any(x["kind"] == "prompt" and "Claimed src/menu.js" in x["text"] for x in p["timeline"]["items"]), texts
        assert not any("list tasks" in t.lower() for t in texts), texts
        assert "Nice, I'll do the title screen" not in texts   # only their own messages
        ats = [x["at"] for x in p["timeline"]["items"]]; assert ats == sorted(ats, reverse=True), ats
        assert p["context"]["usedPct"] == 63 and p["context"]["focus"] == "wiring the pause key", p["context"]
        assert p["now"]["agent"]["files"][0]["path"] == "src/menu.js", p["now"]
        assert p["counters"]["commits"] == 1 and p["counters"]["projectCommits"] == 2 and p["counters"]["uptimeSec"] is None, p["counters"]
        c = [x for x in p["timeline"]["items"] if x["kind"] == "commit"][0]
        assert set(c["files"]) == {"src/menu.js", "src/game.js"}, c
        only = ok(api(f"/people/{mid}?kind=commit", token=orion, project=pq))["timeline"]["items"]
        assert [x["kind"] for x in only] == ["commit"], only
        pg = ok(api(f"/people/{mid}?limit=2", token=orion, project=pq))["timeline"]
        assert len(pg["items"]) == 2 and pg["more"] and pg["next"], pg
        pg2 = ok(api(f"/people/{mid}?limit=2&before={urllib.parse.quote(pg['next'])}", token=orion, project=pq))["timeline"]
        assert pg2["items"] and pg2["items"][0]["at"] < pg["next"], pg2
        d = ok(api(f"/people/{mid}/commit/{c['sha']}", token=maya, project=pq))["commit"]
        assert d["subject"] == "Add a pause menu" and {f["path"] for f in d["files"]} == {"src/menu.js", "src/game.js"}, d
        assert [f for f in d["files"] if f["path"] == "src/game.js"][0]["add"] == 2
        assert api(f"/people/{mid}/commit/zz;rm", token=maya, project=pq)[0] == 400
        ar = ok(api(f"/people/{mid}/around?at={urllib.parse.quote(c['at'])}", token=orion, project=pq))["messages"]
        assert ar and any("pause menu" in m["text"] for m in ar), ar
        host = ok(api(f"/people/{oid}", token=maya, project=pq))
        assert host["member"]["host"] and isinstance(host["counters"]["uptimeSec"], int), host["counters"]
        ag = ok(api(f"/people/{ma_id}", token=orion, project=pq))
        assert ag["member"]["agent"] and ag["context"]["focus"] == "wiring the pause key" and any(x["kind"] == "prompt" for x in ag["timeline"]["items"]), ag
        stl = ok(api("/people", token=maya, project=pq))["status"]
        assert stl["commitsTotal"] == 2 and stl["commitsToday"] == 2 and stl["uptimeSec"] >= 0 and stl["repo"], stl
        # project scope: Zed is only in Side Quest
        assert api(f"/people/{zid}", token=maya, project=pq)[0] == 403
        assert api(f"/people/{zid}", token=orion, project=pq)[0] == 403
        assert api(f"/people/{zid}", token=maya, project=side)[0] == 403   # Maya is not in Side Quest at all
        assert api(f"/people/{mid}", token=zed, project=pq)[0] == 403
        assert api(f"/people/{mid}", token=zed, project=side)[0] == 403
        assert api(f"/people/{mid}/commit/{c['sha']}", token=zed, project=side)[0] == 403
        assert api(f"/people/{mid}", project=pq)[0] == 401
        assert api("/people/nobody-here", token=orion, project=pq)[0] == 404

        # ---------------- UI ----------------
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = login(b, {"width": 1440, "height": 900}, "Orion", "#F26B1D", orion, pq)
            try:
                chat(page)
                page.wait_for_selector(f"#chat-list .msg.dx[data-by='{mid}']")
                page.click(f"#chat-list .msg.dx[data-by='{mid}'] .mb > b")
                page.wait_for_selector("#view-chat.pp-open #person-panel:not(.hidden)")
                wait_text(page, "#person-panel", "Add a pause menu")
                for t in ["Maya", "Build the pause menu with resume and quit", "Morning! Starting on the pause menu", "Pause menu notes", "src/menu.js", "wiring the pause key", "Ask their Claude"]:
                    wait_text(page, "#person-panel", t)
                assert page.is_visible("#chat-list"), "chat stays visible beside the panel"
                box = page.eval_on_selector("#person-panel", "e => e.getBoundingClientRect().toJSON()")
                cbox = page.eval_on_selector("#chat-list", "e => e.getBoundingClientRect().toJSON()")
                assert box["left"] >= cbox["right"] - 1 and cbox["width"] > 300, (box, cbox)
                assert page.eval_on_selector("#person-panel .pp-bar i", "e => e.style.width") == "63%"
                assert "63" not in page.inner_text("#person-panel .pp-ctx"), "no number unless hovered"
                page.mouse.move(700, 600); page.wait_for_timeout(250)
                page.screenshot(path=str(SHOTS / "people-desktop-timeline.png"))
                page.click("#person-panel [data-kind-f='commit']")
                page.wait_for_function("document.querySelectorAll('#person-panel .pp-it').length === 1 && document.querySelector('#person-panel .pp-it').dataset.kind === 'commit'")
                page.click("#person-panel .pp-it.k-commit .pp-main")
                wait_text(page, "#person-panel .pp-x", "src/game.js"); wait_text(page, "#person-panel .pp-x .pp-around", "Morning! Starting")
                page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "people-desktop.png"))
                page.click("#person-panel [data-kind-f='chat']")
                page.wait_for_function("[...document.querySelectorAll('#person-panel .pp-it')].every(e => e.dataset.kind === 'chat')")
                page.click("#person-panel .pp-it.k-chat .pp-main")
                page.wait_for_selector("#chat-list .msg.pp-flash")
                fl = page.eval_on_selector("#chat-list .msg.pp-flash", "e => e.innerText")
                assert "Morning! Starting on the pause menu" in fl, fl
                page.keyboard.press("Escape"); page.wait_for_selector("#person-panel", state="hidden")
                # room list: the avatar opens the profile; the row menu gains "Profile"
                page.click(f"#room-list .person[data-follow='{mid}'] .avatar")
                wait_text(page, "#person-panel", "Add a pause menu")
                page.click("#person-panel .pp-close"); page.wait_for_selector("#person-panel", state="hidden")
                page.click(f"#room-list .person[data-follow='{mid}']")
                page.wait_for_selector("#dm-menu [data-act='profile']")
                page.click("#dm-menu [data-act='profile']")
                wait_text(page, "#person-panel", "Maya")
                # their Claude: open from the agent chip, ask it something
                page.click("#person-panel .pp-agent")
                wait_text(page, "#person-panel h2", "Claude · Maya")
                wait_text(page, "#person-panel", "Build the pause menu with resume and quit")
                page.click("#person-panel [data-pp='ask']"); page.fill("#pp-ask input", "Is the pause key done?"); page.press("#pp-ask input", "Enter")
                for _ in range(40):
                    if any("Is the pause key done?" in m["text"] for m in ok(api("/agents/channel", token=orion, project=pq))["messages"]): break
                    time.sleep(0.15)
                else: raise AssertionError("ask their Claude did not post to #agents")
                err, txt = mcp(ma, "check_messages"); assert "Is the pause key done?" in txt, txt
                # status line: uptime + commit counter, quiet and mono (bottom of the room pane until the shell mounts it)
                page.keyboard.press("Escape"); page.wait_for_selector("#person-panel", state="hidden")
                page.wait_for_function("(document.querySelector('.pp-status') || {}).innerText?.includes('up ')")
                st = page.inner_text(".pp-status"); assert "2 commits today" in st, st
                page.evaluate("TribePeople.statusLine(document.body.appendChild(document.createElement('div')))")
                page.close()

                phone = login(b, {"width": 390, "height": 844}, "Maya", "#6C7CFF", maya, pq, mobile=True)
                chat(phone)
                phone.wait_for_selector(f"#chat-list .msg.dx[data-by='{oid}']")
                phone.click(f"#chat-list .msg.dx.g-first[data-by='{oid}'] > .avatar")   # one avatar per group, on its first line (list-style chat, v0.8.0)
                phone.wait_for_selector("#person-panel.sheet:not(.hidden)")
                wait_text(phone, "#person-panel", "Orion"); wait_text(phone, "#person-panel", "Host"); wait_text(phone, "#person-panel .pp-foot", "up ")
                wait_text(phone, "#person-panel", "Start Pixel Quest")
                sb = phone.eval_on_selector("#person-panel", "e => e.getBoundingClientRect().toJSON()")
                assert sb["bottom"] >= 843 and sb["width"] >= 389 and sb["top"] > 100, sb
                phone.wait_for_timeout(350)
                phone.screenshot(path=str(SHOTS / "people-phone.png"))
                phone.click("#person-panel [data-kind-f='chat']")
                phone.wait_for_function("[...document.querySelectorAll('#person-panel .pp-it')].length && [...document.querySelectorAll('#person-panel .pp-it')].every(e => e.dataset.kind === 'chat')")
                phone.click("#person-panel .pp-it.k-chat .pp-main")
                phone.wait_for_selector("#chat-list .msg.pp-flash"); phone.wait_for_selector("#person-panel", state="hidden")
                phone.wait_for_selector(".pp-pill:not(.hidden)"); phone.click(".pp-pill")
                phone.wait_for_selector("#person-panel.sheet:not(.hidden)")
                phone.click("#pp-scrim", position={"x": 20, "y": 20}); phone.wait_for_selector("#person-panel", state="hidden")
            except Exception:
                for pg_ in b.contexts:
                    for x in pg_.pages:
                        try: x.screenshot(path=f"/tmp/people-fail-{id(x)}.png")
                        except Exception: pass
                print("ERRORS:", errors); raise
            b.close()
        assert not errors, errors
        print("e2e_people: OK")
    finally:
        srv.terminate()
        try: out = srv.communicate(timeout=5)[0].decode()
        except Exception: out = ""
        if "Error" in out and "TypeError" in out: print(out[-3000:])


if __name__ == "__main__":
    main()
