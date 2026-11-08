"""End-to-end: emoji reactions on chat bubbles and team votes in chat (server/votes.js, app/ui/chatx.js, app/ui/votes.js).

Reactions from two people (quick-react bar on hover, double-click = 👍, the picker, "+🔥" in the composer,
chips with counts/highlight/names), reaction-to-action (✅ approves an agent's request, 📌 pins), /vote,
a vote between two humans where an agent's ballot is refused, pass -> task -> Board, an MCP suggest_vote
poll with its rate limit, deadlines with a Decided item in Updates, nudges, "seen by", the brain's
"Turn this into a vote?" hint, the Start a vote sheet, project visibility on forward/vote, and a phone
(long-press opens the emoji bar above the action menu).
Usage: python app/test/e2e_votes.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4811 + OFF
MOCK = 11611 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page


def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
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


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def wait_for(fn, timeout=10, what="condition"):
    t = time.time()
    while time.time() - t < timeout:
        v = fn()
        if v: return v
        time.sleep(0.15)
    raise AssertionError("timed out waiting for " + what)


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-votes-")
    mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(MOCK)], stdout=subprocess.DEVNULL)
    time.sleep(0.3)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Pixel Crew", "--ollama", f"http://localhost:{MOCK}"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_VOTE_SWEEP_MS": "400"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            orion = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(orion, "orion")
            named(orion, "Orion")
            orion.goto(BASE + "/?skipIntro=1")
            wait_text(orion, "#sync-status", "connected")
            otok = orion.evaluate("TribeStore.get().server.token")
            oid = orion.evaluate("TribeClient.state().me.id")
            code = ok(api("/invites", "POST", {"hours": 1, "maxUses": 3}, token=otok))["invite"]["code"]
            maya = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(maya, "maya")
            maya.goto(f"{BASE}/join/{code}")
            maya.wait_for_selector("#form:not(.hidden)")
            maya.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")   # this test is not about the after-join Claude Code sheet (e2e_instant is)
            maya.fill("#name", "Maya"); maya.click("#go")
            maya.wait_for_function("!!document.querySelector('#sync-status')", timeout=15000)
            wait_text(maya, "#sync-status", "connected")
            mtok = maya.evaluate("TribeStore.get().server.token")
            mid = maya.evaluate("TribeClient.state().me.id")
            orion.wait_for_function(f"(TribeClient.state().members || []).some(m => m.id === '{mid}')")
            general = lambda: ok(api("/chat/general?limit=500", token=otok))["messages"]
            msg = lambda text: next(m for m in reversed(general()) if text in (m.get("text") or ""))
            vmsg = lambda text: next(m for m in reversed(general()) if m.get("vote") and text in m["vote"]["q"])
            bubble = lambda mid_: f"#chat-list .msg.dx[data-id='{mid_}']"

            # ---------------- 1. reactions on the bubble ----------------
            chat(orion).fill("#chat-input", "Level 2 is ready to play"); orion.keyboard.press("Enter")
            lvl = wait_for(lambda: next((m for m in general() if m.get("text") == "Level 2 is ready to play"), None), what="message")["id"]
            chat(maya).wait_for_selector(bubble(lvl))
            maya.hover(bubble(lvl) + " .mb p")
            maya.wait_for_selector("#qr-bar:not(.hidden) [data-q='👍']")
            assert maya.locator("#qr-bar [data-q]").count() == 7, "six emoji + more"
            maya.click("#qr-bar [data-q='👍']")
            orion.wait_for_function(f"document.querySelector(\"{bubble(lvl)} .rx[data-rx='👍']\")?.textContent.includes('1')")
            assert not orion.locator(f"{bubble(lvl)} .rx[data-rx='👍'].on").count(), "not Orion's reaction yet"
            maya.wait_for_selector(f"{bubble(lvl)} .rx[data-rx='👍'].on")
            # double-click = 👍 (and never toggles it off)
            chat(orion).dblclick(bubble(lvl) + " .mb p")
            orion.wait_for_selector(f"{bubble(lvl)} .rx[data-rx='👍'].on")
            wait_text(maya, f"{bubble(lvl)} .rx[data-rx='👍']", "2")
            title = orion.get_attribute(f"{bubble(lvl)} .rx[data-rx='👍']", "title")
            assert "Maya" in title and "Orion" in title, title
            orion.dblclick(bubble(lvl) + " .mb p"); orion.wait_for_timeout(500)
            assert set(msg("Level 2 is ready")["reactions"]["👍"]) == {oid, mid}
            # the picker has the rest
            maya.hover(bubble(lvl) + " .mb p"); maya.click(f"{bubble(lvl)} .rx-add")
            maya.wait_for_selector("#emoji-pick .ep-c[data-e='🚀']")   # feat/chat2: the full picker (app/ui/emojipick.js)
            assert maya.locator("#emoji-pick .ep-c").count() > 300
            maya.click("#emoji-pick .ep-c[data-e='🚀']")
            wait_text(orion, f"{bubble(lvl)} .reacts", "🚀")
            # tap a chip to toggle yours
            orion.click(f"{bubble(lvl)} .rx[data-rx='🚀']")
            wait_text(maya, f"{bubble(lvl)} .rx[data-rx='🚀']", "2")
            # "+🔥" / "+fire" in an empty composer reacts to the latest message instead of posting
            chat(maya).fill("#chat-input", "+fire"); maya.keyboard.press("Enter")
            wait_text(orion, f"{bubble(lvl)} .reacts", "🔥")
            assert not any(m.get("text") == "+fire" for m in general())
            assert api("/chat/general/react", "POST", {"id": lvl, "emoji": "💩"}, token=mtok)[0] == 400
            # keyboard: Ctrl+Shift+\ opens the quick bar on the latest message
            chat(orion).click("#chat-input"); orion.keyboard.press("Control+Shift+Backslash")
            orion.wait_for_selector("#qr-bar:not(.hidden)")
            assert orion.evaluate("document.querySelector('#qr-bar').dataset.id") == lvl
            orion.keyboard.press("Escape"); orion.wait_for_selector("#qr-bar.hidden", state="attached")
            # 📌 pins
            r = ok(api("/chat/general/react", "POST", {"id": lvl, "emoji": "📌"}, token=mtok))
            assert r.get("pinned"), r
            assert any(x["id"] == lvl for x in ok(api("/chat/general/pins", token=otok))["pins"])
            wait_text(orion, "#pin-strip", "1 pinned")

            # ✅ on your agent's request approves it
            ag = ok(api("/agents", "POST", {}, token=otok)); atok, aid = ag["token"], ag["agent"]["id"]
            mag = ok(api("/agents", "POST", {}, token=mtok)); matok = mag["token"]
            tools = [t["name"] for t in mcp(atok, None, method="tools/list")["tools"]]
            assert "suggest_vote" in tools and "check_vote" in tools, tools
            assert "suggest_vote" in mcp(atok, None, method="initialize")["instructions"]
            err, txt = mcp(atok, "request_approval", {"title": "Run the save-file migration", "risk": "medium"}); assert not err, txt
            apid = json.loads(txt)["id"]
            achan = "dm-" + "-".join(sorted([oid, aid]))
            ask = wait_for(lambda: next((m for m in ok(api(f"/chat/{achan}", token=otok))["messages"] if m.get("approval") == apid), None), what="approval in agent chat")
            assert api(f"/chat/{achan}/react", "POST", {"id": ask["id"], "emoji": "✅"}, token=mtok)[0] == 403   # Maya can't even read it
            r = ok(api(f"/chat/{achan}/react", "POST", {"id": ask["id"], "emoji": "✅"}, token=otok))
            assert r.get("approved", {}).get("id") == apid, r
            err, txt = mcp(atok, "check_approval", {"id": apid}); assert '"approved"' in txt, txt

            # ---------------- 2. /vote between two humans; agents can't vote ----------------
            chat(maya).fill("#chat-input", "/vote Should we add dark mode to the level editor?"); maya.keyboard.press("Enter")
            v1 = wait_for(lambda: next((m for m in general() if m.get("vote") and "dark mode" in m["vote"]["q"]), None), what="vote card")
            assert sum(1 for m in general() if "dark mode" in (m.get("text") or "")) == 1, "the raw /vote text is not posted"
            assert v1["vote"]["kind"] == "approve" and [o["label"] for o in v1["vote"]["options"]] == ["Approve", "Not yet"]
            card = f"{bubble(v1['id'])} .vt"
            orion.wait_for_selector(card)
            wait_text(orion, card, "Should we add dark mode")
            wait_text(orion, card, "0 of 2 voted")
            orion.click(f"{card} [data-vt-opt='yes']")
            orion.wait_for_selector(f"{card} .vt-o.yes.mine")
            wait_text(maya, card, "1 of 2 voted")
            st, d = api(f"/chat/general/vote/{v1['id']}/cast", "POST", {"option": "yes"}, token=atok)
            assert st == 403 and "agents cannot vote" in d["error"], (st, d)
            st, d = api(f"/chat/general/vote/{v1['id']}/cast", "POST", {"option": "maybe"}, token=mtok); assert st == 400, d
            # seen by: Orion has seen it (he voted); Maya's screen marks it seen too
            wait_for(lambda: mid in (vmsg("dark mode")["vote"].get("seen") or {}), what="Maya seen")
            wait_text(orion, card, "Seen by 2")
            shot(orion, "chat-votes")
            maya.click(f"{card} [data-vt-opt='yes']")
            wait_text(orion, card, "Approved")
            assert vmsg("dark mode")["vote"]["status"] == "passed"
            wait_text(orion, "#chat-list", "→ Approved")
            assert api(f"/chat/general/vote/{v1['id']}/cast", "POST", {"option": "no"}, token=otok)[0] == 409
            # pass -> task -> Board
            orion.click(f"{card} [data-vt='task']")
            wait_text(maya, card, "Task · Add dark mode to the level editor")
            tasks = ok(api("/tasks", token=otok))["tasks"]
            assert any(t["title"] == "Add dark mode to the level editor" and t["source"] == "vote" for t in tasks), [t["title"] for t in tasks]
            maya.click(f"{card} [data-vt='board']")
            wait_text(orion, card, "On the Board")
            props = ok(api("/proposals", token=otok))["proposals"]
            pr = next(x for x in props if x["title"] == "Add dark mode to the level editor")
            assert pr["votes"] == {oid: "yes", mid: "yes"} and pr["status"] == "approved", pr
            decisions = list(Path(tmp, "decisions").glob("*dark-mode*.md"))
            assert decisions and "Approved" in decisions[0].read_text(), decisions
            shot(orion, "chat-votes-passed")

            # ---------------- 3. Claude suggests a vote (MCP), rate-limited ----------------
            err, txt = mcp(matok, "suggest_vote", {"question": "Which engine for the boss fight?", "options": ["Godot", "Phaser"], "why": "Both prototypes run at 60fps"})
            assert not err and "Vote posted" in txt, txt
            v2 = next(m for m in reversed(general()) if m.get("vote") and m["vote"]["q"] == "Which engine for the boss fight?")
            assert v2["vote"]["suggested"]["owner"] == mid and v2["vote"]["kind"] == "poll"
            card2 = f"{bubble(v2['id'])} .vt"
            orion.wait_for_selector(card2)
            wait_text(orion, card2, "Suggested by Maya's Claude")
            wait_text(orion, card2, "Both prototypes run at 60fps")
            assert any(i["type"] == "vote" and "Maya's Claude suggests a vote" in i["title"] for i in ok(api("/notify/inbox", token=otok))["items"])
            err, txt = mcp(matok, "suggest_vote", {"question": "Ship the demo on Friday?"}); assert not err, txt
            err, txt = mcp(matok, "suggest_vote", {"question": "Rename the game?"}); assert err and "open vote suggestions" in txt, txt
            err, txt = mcp(matok, "post_chat", {"text": "/vote Add a pet system?"}); assert err, txt   # /vote from an agent is a suggestion too
            orion.click(f"{card2} [data-vt-opt='o2']"); maya.click(f"{card2} [data-vt-opt='o2']")
            wait_text(orion, card2, "Phaser")
            wait_for(lambda: vmsg("Which engine")["vote"]["status"] == "closed" and vmsg("Which engine")["vote"]["result"] == "o2", what="poll closed")
            err, txt = mcp(matok, "check_vote", {"id": v2["id"]}); assert "[closed]" in txt and "result: Phaser" in txt, txt
            orion.click(f"{card2} [data-vt='task']")
            wait_for(lambda: any(t["title"] == "Which engine for the boss fight: Phaser" for t in ok(api("/tasks", token=otok))["tasks"]), what="poll task")

            # ---------------- 4. deadlines, nudges, Decided in Updates ----------------
            v3 = ok(api("/chat/general/vote", "POST", {"question": "Use pixel fonts everywhere?", "deadline": (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()}, token=otok))["message"]
            ok(api(f"/chat/general/vote/{v3['id']}/cast", "POST", {"option": "yes"}, token=otok))
            r = ok(api(f"/chat/general/vote/{v3['id']}/remind", "POST", {}, token=otok)); assert r["reminded"] == ["Maya"], r
            assert api(f"/chat/general/vote/{v3['id']}/remind", "POST", {}, token=otok)[0] == 429
            assert any(i["type"] == "vote" and "Orion is waiting on your vote" in i["title"] for i in ok(api("/notify/inbox", token=mtok))["items"])
            wait_for(lambda: vmsg("pixel fonts")["vote"]["status"] != "open", timeout=12, what="deadline")
            pf = vmsg("pixel fonts")["vote"]
            assert pf["status"] == "failed" and pf["reason"] == "no quorum", pf   # at the deadline only 1 of 2 had voted: no majority turned up
            assert any(i["type"] == "decision" and "pixel fonts" in i["title"] for i in ok(api("/notify/inbox", token=mtok))["items"])
            assert api(f"/chat/general/vote/{v3['id']}/close", "POST", {}, token=otok)[0] == 409
            v4 = ok(api("/chat/general/vote", "POST", {"question": "Add a speedrun timer?", "options": ["Yes", "Later", "Never"]}, token=mtok))["message"]
            assert api(f"/chat/general/vote/{v4['id']}/close", "POST", {}, token=atok)[0] == 403
            ok(api(f"/chat/general/vote/{v4['id']}/close", "POST", {}, token=mtok))
            assert vmsg("speedrun timer")["vote"]["status"] == "closed" and vmsg("speedrun timer")["vote"]["reason"] == "no votes"
            assert api("/chat/general/vote", "POST", {"question": "x?", "options": ["only one"]}, token=otok)[0] == 400
            assert api(f"/chat/{achan}/vote", "POST", {"question": "In a DM?"}, token=otok)[0] == 400

            # ---------------- 5. the brain's hint + the Start a vote sheet ----------------
            chat(maya).fill("#chat-input", "should we use tiles or freeform maps?"); maya.keyboard.press("Enter")
            hint_id = wait_for(lambda: next((m["id"] for m in general() if m.get("text") == "should we use tiles or freeform maps?"), None), what="hint msg")
            maya.wait_for_selector(f"{bubble(hint_id)} .vt-hint")
            assert not orion.locator(f"{bubble(hint_id)} .vt-hint").count(), "only the author sees the hint"
            assert not next(m for m in general() if m["id"] == hint_id).get("vote"), "never auto-posted"
            maya.click(f"{bubble(hint_id)} [data-vh-go]")
            maya.wait_for_selector("#vt-sheet")
            assert maya.input_value("#vt-q") == "Should we use tiles or freeform maps?"
            assert maya.get_attribute("#vt-sheet [data-kind='poll']", "aria-checked") == "true"
            assert [maya.input_value(f"#vt-sheet .vt-oin[data-i='{i}']") for i in range(2)] == ["Tiles", "Freeform maps"]
            maya.click("#vt-sheet [data-min='60']")
            shot(maya, "chat-votes-sheet")
            maya.click("#vt-go")
            maya.wait_for_selector("#vt-sheet", state="detached")
            v5 = wait_for(lambda: next((m for m in general() if m.get("vote") and m["vote"]["q"].startswith("Should we use tiles")), None), what="sheet vote")
            assert v5["vote"]["deadline"] and [o["label"] for o in v5["vote"]["options"]] == ["Tiles", "Freeform maps"]
            wait_text(orion, f"{bubble(v5['id'])} .vt-when", "left")
            # window.TribeVotes.openComposer() (the phone "+" menu calls this)
            orion.evaluate("TribeVotes.openComposer()")
            orion.wait_for_selector("#vt-sheet"); orion.fill("#vt-q", "Playtest on Saturday?")
            orion.keyboard.press("Enter")
            wait_for(lambda: any(m.get("vote") and m["vote"]["q"] == "Playtest on Saturday?" for m in general()), what="composer vote")
            orion.evaluate("TribeVotes.openComposer({ question: 'x' })"); orion.wait_for_selector("#vt-sheet"); orion.keyboard.press("Escape")
            orion.wait_for_selector("#vt-sheet", state="detached")
            # message menu: Make it a vote
            chat(orion).hover(bubble(lvl)); orion.click(f"{bubble(lvl)} .msg-more"); orion.click("#msg-menu [data-act='vote']")
            orion.wait_for_selector("#vt-sheet"); assert orion.input_value("#vt-q") == "Level 2 is ready to play"; orion.keyboard.press("Escape")

            # ---------------- 6. project visibility (forward, votes) ----------------
            sec = ok(api("/projects", "POST", {"name": "Secret", "files": [{"path": "a.txt", "data": "eA=="}]}, token=otok), "secret project")["project"]
            pub = ok(api("/projects", "POST", {"name": "Open", "files": [{"path": "b.txt", "data": "eA=="}]}, token=otok), "open project")["project"]
            jcode = ok(api("/invites", "POST", {"hours": 1, "project": pub["id"]}, token=otok))["invite"]["code"]
            jay = ok(api("/join", "POST", {"code": jcode, "name": "Jay"}))
            jtok = jay["token"]
            jm = ok(api("/chat/general", "POST", {"text": "hello open room"}, token=jtok, project=pub["id"]))["message"]
            st, d = api("/chat/general/forward", "POST", {"id": jm["id"], "to": sec["channel"]}, token=jtok, project=pub["id"])
            assert st in (403, 404), (st, d)
            assert not any(m.get("fwd") for m in ok(api("/chat/general", token=otok, project=sec["id"]))["messages"])
            sv = ok(api("/chat/general/vote", "POST", {"question": "Secret plan?"}, token=otok, project=sec["id"]))["message"]
            assert api(f"/chat/{sec['channel']}/vote/{sv['id']}/cast", "POST", {"option": "yes"}, token=jtok, project=pub["id"])[0] == 403
            assert api(f"/chat/{sec['channel']}/react", "POST", {"id": sv["id"], "emoji": "👍"}, token=jtok, project=pub["id"])[0] == 403
            assert api(f"/chat/{sec['channel']}/votes", token=jtok, project=pub["id"])[0] == 403
            # a vote in the Open project counts only its people (Orion, Maya and Jay can all see it)
            pv = ok(api("/chat/general/vote", "POST", {"question": "Open room vote?"}, token=jtok, project=pub["id"]))["message"]
            assert len(pv["vote"]["eligible"]) == 3, pv["vote"]
            ok(api(f"/chat/general/vote/{pv['id']}/cast", "POST", {"option": "yes"}, token=jtok, project=pub["id"]))
            # forwarding into a channel you can see still works
            ok(api("/chat/general/forward", "POST", {"id": lvl, "to": pub["channel"]}, token=otok))

            # ---------------- 7. phone: long-press = emoji bar above the action menu ----------------
            ph_ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            phone = ph_ctx.new_page(); watch(phone, "phone")
            pcode = ok(api("/invites", "POST", {"hours": 1}, token=otok))["invite"]["code"]
            phone.goto(f"{BASE}/join/{pcode}")
            phone.wait_for_selector("#form:not(.hidden)"); phone.fill("#name", "Sam"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            chat(phone).wait_for_selector(f"{bubble(v5['id'])} .vt")
            phone.evaluate(f"document.querySelector(\"{bubble(v5['id'])}\").scrollIntoView({{block: 'center'}})")
            phone.tap(f"{bubble(v5['id'])} [data-vt-opt='o1']")
            phone.wait_for_selector(f"{bubble(v5['id'])} .vt-o.mine")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            shot(phone, "chat-votes-phone")
            el = phone.locator(f"{bubble(lvl)} .mb p").first
            phone.evaluate(f"document.querySelector(\"{bubble(lvl)}\").scrollIntoView({{block: 'center'}})")
            bx = el.bounding_box()
            phone.evaluate("window.__lp = []; ['pointerdown','pointerup','pointercancel','pointermove','click','contextmenu','touchstart','touchend'].forEach(t => document.addEventListener(t, e => __lp.push(t + ':' + (e.pointerType || '')), true))")
            cdp = ph_ctx.new_cdp_session(phone)
            pt = [{"x": bx["x"] + 20, "y": bx["y"] + bx["height"] / 2}]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pt})
            phone.wait_for_timeout(700)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            try:
                phone.wait_for_selector("#qr-bar.touch:not(.hidden)", timeout=4000)
            except Exception:
                print("LONGPRESS", phone.evaluate("JSON.stringify({bar: document.querySelector('#qr-bar')?.className, menu: !!document.querySelector('#msg-menu'), log: window.__lp})")); raise
            phone.wait_for_selector("#msg-menu")
            assert not phone.locator("#msg-menu .rx-row").count(), "the bar above replaces the menu's emoji row on touch"
            qb, mb = phone.locator("#qr-bar").bounding_box(), phone.locator("#msg-menu").bounding_box()
            assert qb["y"] + qb["height"] <= mb["y"] + 1 and qb["x"] >= 0 and qb["x"] + qb["width"] <= 390, (qb, mb)
            shot(phone, "chat-votes-phone-react")
            phone.tap("#qr-bar [data-q='🎉']")
            wait_text(orion, f"{bubble(lvl)} .reacts", "🎉")
            phone.wait_for_selector("#msg-menu", state="detached")
            b.close()
    finally:
        srv.terminate(); mock.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Votes test passed")


if __name__ == "__main__":
    main()
