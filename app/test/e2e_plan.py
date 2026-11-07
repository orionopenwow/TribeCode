"""End-to-end: planning, Notion-lite docs, visual compare and floating quick looks.

Starts the real server on a temp folder (TRIBE_TEST=1 for the bus log, fast reminder ticks), drives the host
and a friend in two browser contexts. Usage: python app/test/e2e_plan.py [--shots]
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4787 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
SHOTS = ROOT / "docs" / "screenshots"
errors = []



def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise AssertionError(f"{method} {path} -> {e.code} {e.read()[:300]}")


def mcp(token, tool, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())["result"]
        return res.get("isError", False), res["content"][0]["text"]


def png(w, h, px):
    """Minimal PNG encoder: px(x, y) -> (r, g, b)."""
    raw = b"".join(b"\x00" + b"".join(bytes(px(x, y)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


def mock_screen(version):
    """A little flat 'login screen' mock. Version 2 moves the button, recolors it and adds a 'remember me' row."""
    W, H = 640, 400
    bg, card, edge, ink, faint = (18, 21, 26), (27, 32, 40), (42, 49, 60), (248, 250, 252), (100, 116, 139)
    btn = (242, 107, 29) if version == 1 else (56, 198, 177)
    def px(x, y):
        if y < 44: return (27, 32, 40) if y < 43 else edge
        if 20 <= x < 44 and 12 <= y < 32: return (242, 107, 29)
        if 170 <= x < 470 and 80 <= y < 340:
            if x in (170, 469) or y in (80, 339): return edge
            if 200 <= x < 360 and 106 <= y < 120: return ink                      # title
            if 200 <= x < 440 and 140 <= y < 172: return (34, 40, 51) if not (x in (200, 439) or y in (140, 171)) else edge   # email
            if 200 <= x < 440 and 186 <= y < 218: return (34, 40, 51) if not (x in (200, 439) or y in (186, 217)) else edge   # password
            if version == 2 and 200 <= x < 214 and 232 <= y < 246: return btn         # remember-me box
            if version == 2 and 222 <= x < 330 and 236 <= y < 242: return faint
            by = 262 if version == 2 else 240
            if 200 <= x < 440 and by <= y < by + 36: return btn                       # sign-in button
            if 280 <= x < 360 and 312 <= y < 318: return faint
            return card
        return bg
    return png(W, H, px)


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "localhost:9" not in m.text and "ERR_CONNECTION_REFUSED" not in m.text and "api.github.com" not in m.text
            and "ERR_NAME_NOT_RESOLVED" not in m.text and "ERR_FAILED" not in m.text and "status of 404" not in m.text and errors.append(f"{who} console: {m.text}"))


def open_as(browser, name, token, viewport=(1600, 1000)):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
    page = ctx.new_page(); watch(page, name)
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.getItem('tribecode.settings.v1') || localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=10000)
    return page


def palette(page, text):
    page.keyboard.press("Control+k")
    page.wait_for_selector("#palette:not(.hidden)")
    page.fill("#pal-input", text)
    page.wait_for_timeout(150)


def bus(token, kind):
    return api(f"/debug/bus-log?type={kind}", token=token)["events"]


def wait_for(fn, timeout=8.0, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.1)
    raise AssertionError("timed out waiting for " + what)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-plan-")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_REMINDER_TICK_MS": "400"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"})
        maya_tok, maya_id = maya["token"], maya["member"]["id"]
        jay = api("/join", "POST", {"code": code, "name": "Jay", "color": "#38C6B1"})
        host_id = api("/me", token=host_tok)["member"]["id"]
        agent_tok = api("/agents", "POST", {}, token=host_tok)["token"]

        # some realistic context: a week with a few events and tasks with due dates
        now = datetime.now().astimezone()
        monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        at = lambda d, h, m=0: monday + timedelta(days=d, hours=h, minutes=m)
        api("/calendar", "POST", {"title": "Weekly planning", "start": iso(at(0, 10)), "duration": 60, "attendees": [host_id, maya_id, jay["member"]["id"]], "repeat": "weekly"}, token=host_tok)
        api("/calendar", "POST", {"title": "Design review", "start": iso(at(2, 14)), "duration": 90, "attendees": [maya_id, host_id]}, token=host_tok)
        api("/calendar", "POST", {"title": "Pairing: save points", "start": iso(at(3, 11, 30)), "duration": 60, "attendees": [jay["member"]["id"]], "huddle": True}, token=host_tok)
        api("/calendar", "POST", {"title": "Playtest", "start": iso(at(4, 16)), "duration": 120, "attendees": [host_id, maya_id, jay["member"]["id"]]}, token=host_tok)
        today = now.strftime("%Y-%m-%d")
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        late = api("/tasks", "POST", {"title": "Fix controller drift", "status": "doing", "due": yesterday}, token=host_tok)["task"]
        api(f"/tasks/{late['id']}", "PATCH", {"assignee": maya_id}, token=host_tok)
        soon = api("/tasks", "POST", {"title": "Campfire save points", "due": (now + timedelta(days=2)).strftime("%Y-%m-%d")}, token=host_tok)["task"]
        nodue = api("/tasks", "POST", {"title": "Write the trailer script"}, token=host_tok)["task"]
        assert late["due"] == yesterday

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = open_as(b, "Orion", host_tok)
            friend = open_as(b, "Maya", maya_tok)

            # ---------- 1. palette natural-language event -> calendar ----------
            palette(host, "huddle tomorrow 4pm with Maya")
            first = host.locator(".pal-item").first
            assert "schedule" in first.inner_text().lower() and "Huddle with Maya" in first.inner_text(), first.inner_text()
            host.keyboard.press("Enter")
            host.wait_for_selector("#view-calendar:not(.hidden) .cal-ev:has-text('Huddle with Maya')", timeout=8000)
            ev = [e for e in api("/calendar", token=host_tok)["events"] if e["title"] == "Huddle with Maya"][0]
            tomorrow4 = (now + timedelta(days=1)).replace(hour=16, minute=0, second=0, microsecond=0)
            assert ev["huddle"] is True and maya_id in ev["attendees"] and host_id in ev["attendees"], ev
            assert abs(datetime.fromisoformat(ev["start"].replace("Z", "+00:00")) - tomorrow4) < timedelta(minutes=1), ev["start"]
            assert host.locator(".cal-ad .due-chip.overdue").count() >= 0
            # drag an event two hours later; click an empty slot to quick-create
            if tomorrow4.weekday() != 0 or True:
                el = host.locator(".cal-ev:has-text('Design review')")
                if el.count():
                    box = el.bounding_box()
                    host.mouse.move(box["x"] + 20, box["y"] + 10); host.mouse.down()
                    host.mouse.move(box["x"] + 22, box["y"] + 40, steps=4); host.mouse.move(box["x"] + 22, box["y"] + 10 + 96, steps=6); host.mouse.up()
                    wait_for(lambda: [e for e in api("/calendar", token=host_tok)["events"] if e["title"] == "Design review" and e["start"] == iso(at(2, 16))], what="dragged event saved")
                    host.wait_for_selector(".cal-ev:has-text('Design review'):has-text('4 – 5:30')")
                    host.wait_for_timeout(300)
            cb = host.evaluate("([d]) => { const r = document.querySelector(`.cal-col[data-col='${d}']`).getBoundingClientRect(); return { x: r.left, top: r.top }; }", [tomorrow4.strftime('%Y-%m-%d')])
            host.mouse.click(cb["x"] + 30, cb["top"] + 9 * 48 + 10)
            host.wait_for_selector("#cq-title"); host.fill("#cq-title", "Standup"); host.keyboard.press("Enter")
            host.wait_for_selector(".cal-ev:has-text('Standup')", timeout=5000)
            st = [e for e in api("/calendar", token=host_tok)["events"] if e["title"] == "Standup"][0]
            assert datetime.fromisoformat(st["start"].replace("Z", "+00:00")).astimezone().hour == 9, st
            # month view renders the same events
            host.click("#cal-mode [data-mode='month']"); host.wait_for_selector(".cal-mev:has-text('Huddle with Maya')")
            host.click("#cal-mode [data-mode='week']"); host.wait_for_selector(".cal-ev:has-text('Huddle with Maya')")
            # event peek on hover
            host.hover(".cal-ev:has-text('Huddle with Maya')"); host.wait_for_selector(".tf-peek:has-text('Join')", timeout=4000)
            host.mouse.move(5, 5); host.wait_for_timeout(300)
            host.evaluate("document.querySelector('#cal-scroll').scrollTop = 8.5 * 48")
            shot(host, "calendar")

            # Upcoming card on Home lists the next items
            host.click('[data-nav="home"]:visible')
            host.wait_for_selector("#upcoming-card .up-item", state="attached", timeout=5000)   # the overview shows its own Upcoming; this one stays as data
            assert "Fix controller drift" in host.inner_text("#upcoming-card"), host.inner_text("#upcoming-card")

            # ---------- 2. reminders ----------
            soon_ev = api("/calendar", "POST", {"title": "Ship review", "start": iso(datetime.now().astimezone() + timedelta(seconds=40)), "duration": 15, "attendees": [maya_id], "remind": 1}, token=host_tok)["event"]
            r = wait_for(lambda: [e for e in bus(host_tok, "reminder") if e.get("ref") == soon_ev["id"]], what="event reminder on the bus")
            assert maya_id in r[0]["to"] and r[0]["priority"] == "normal", r
            friend.wait_for_function("(TribePlan.received || []).some(n => n.type === 'reminder' && n.ref === %s)" % json.dumps(soon_ev["id"]), timeout=5000)
            hud = api("/calendar", "POST", {"title": "Bug bash", "start": iso(datetime.now().astimezone() + timedelta(seconds=2)), "duration": 30, "huddle": True, "attendees": [host_id, maya_id], "remind": 0}, token=host_tok)["event"]
            chat(host).wait_for_selector("#chat-list .chat-join", timeout=10000)
            assert "Bug bash" in host.inner_text("#chat-list")
            # task due today: morning-of reminder to the assignee (morning hour is 9; force the tick via API if before 9am)
            todays = api("/tasks", "POST", {"title": "Record devlog", "due": today}, token=host_tok)["task"]
            api(f"/tasks/{todays['id']}", "PATCH", {"assignee": maya_id}, token=host_tok)
            if now.hour >= 9:
                wait_for(lambda: [e for e in bus(host_tok, "reminder") if e.get("ref") == todays["id"]], what="task-due reminder")

            # ---------- 3. task due chips + overdue color ----------
            host.click('[data-nav="tasks"]:visible')
            host.wait_for_selector(f".task[data-id='{late['id']}'] .due-chip.overdue")
            color = host.evaluate(f"getComputedStyle(document.querySelector(\".task[data-id='{late['id']}'] .due-chip\")).color")
            ember = host.evaluate("getComputedStyle(document.body).getPropertyValue('--ember-ink').trim()")
            assert color.replace(" ", "") in ("rgb(255,111,142)",) and ember.lower() == "#ff6f8e", (color, ember)
            assert "Yesterday" in host.inner_text(f".task[data-id='{late['id']}'] .due-chip")
            host.hover(f".task[data-id='{nodue['id']}']")
            host.click(f".task[data-id='{nodue['id']}'] .due-chip.none")
            host.click(".due-pop [data-d]:has-text('Tomorrow')")
            wait_for(lambda: [t for t in api("/tasks", token=host_tok)["tasks"] if t["id"] == nodue["id"] and t.get("due") == (now + timedelta(days=1)).strftime("%Y-%m-%d")], what="due date set from the chip")
            host.wait_for_selector(f".task[data-id='{nodue['id']}'] .due-chip:has-text('Tomorrow')")
            # palette: "task ... due friday"
            palette(host, "task polish the menu due friday")
            assert "add task" in host.locator(".pal-item").first.inner_text().lower()
            host.keyboard.press("Enter")
            wait_for(lambda: [t for t in api("/tasks", token=host_tok)["tasks"] if t["title"] == "Polish the menu" and t.get("due")], what="task from palette")

            # ---------- 4. template doc ----------
            api("/docs", "POST", {"title": "Roadmap", "body": "## Now\nCampfire save points and the controller fix.\n\n## Next\nA fishing mini-game with friends.\n\n## Later\nMod support."}, token=host_tok)
            palette(host, "new doc from template")
            host.keyboard.press("Enter")
            host.wait_for_selector("#tpl-modal .dx-tpl-item")
            assert host.locator("#tpl-modal .dx-tpl-item").count() == 5
            host.click("#tpl-modal .dx-tpl-item:has-text('Meeting notes')")
            host.wait_for_function("document.querySelector('#doc-title') && document.querySelector('#doc-title').value.startsWith('Meeting notes')", timeout=8000)
            meeting = [d for d in api("/docs", token=host_tok)["docs"] if d["title"].startswith("Meeting notes")][0]
            body = api(f"/docs/{meeting['slug']}", token=host_tok)["doc"]["body"]
            assert "## Agenda" in body and "## Action items" in body and "Orion" in body, body
            host.wait_for_function("TribeDocs.live()", timeout=8000)

            # ---------- 5. [[link]] + backlink + @mention ----------
            host.click("#doc-body")
            host.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('## Notes') + '## Notes'.length; ta.focus(); ta.setSelectionRange(i, i); }")
            host.keyboard.type("\nSee [[Road", delay=15)
            host.wait_for_selector("#doc-ac:not(.hidden) button:has-text('Roadmap')")
            host.keyboard.press("Enter")
            host.keyboard.type(" for scope. Over to @Ma", delay=15)
            host.wait_for_selector("#doc-ac:not(.hidden) button:has-text('Maya')")
            host.keyboard.press("Enter")
            host.keyboard.type("for the fishing spec.", delay=10)
            assert "See [[Roadmap]] for scope. Over to @Maya for the fishing spec." in host.input_value("#doc-body")
            wait_for(lambda: "@Maya for the fishing" in api(f"/docs/{meeting['slug']}", token=host_tok)["doc"]["body"], what="live edit persisted")
            m = wait_for(lambda: [e for e in bus(host_tok, "mention") if e["to"] == [maya_id] and e.get("ref") == meeting["slug"]], what="mention notification")
            assert "mentioned you" in m[0]["title"]
            host.click("[data-mode='read']")
            host.wait_for_selector("#doc-read .dx-link:has-text('Roadmap')")
            assert host.locator("#doc-read .dx-mention:has-text('@Maya')").count() == 1
            host.hover("#doc-read .dx-link"); host.wait_for_selector(".tf-peek:has-text('Roadmap')", timeout=4000)
            host.mouse.move(5, 5)
            host.click("#doc-read .dx-link")
            host.wait_for_function("document.querySelector('#doc-title').value === 'Roadmap'")
            host.wait_for_selector("#doc-backlinks:not(.hidden) .dx-bl", timeout=6000)
            assert meeting["title"] in host.inner_text("#doc-backlinks")

            # ---------- 6. comments: add, reply, resolve ----------
            friend.click('[data-nav="docs"]:visible')
            friend.wait_for_selector(".doc-item:has-text('Roadmap')"); friend.click(".doc-item:has-text('Roadmap')")
            friend.wait_for_function("document.querySelector('#doc-title').value === 'Roadmap'")
            host.click("[data-mode='read']") if host.locator("[data-mode='read'].on").count() == 0 else None
            host.evaluate("""() => { const el = document.querySelector('#doc-read'); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
                while ((n = w.nextNode())) { const i = n.nodeValue.indexOf('fishing mini-game'); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 'fishing mini-game'.length);
                  const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return; } } }""")
            host.wait_for_selector(".cm-add"); host.click(".cm-add")
            host.fill("#cm-new", "Should this be co-op from day one? @Maya")
            host.click("#cm-post")
            host.wait_for_selector("#doc-read mark.cm-hl:has-text('fishing mini-game')")
            th = wait_for(lambda: api("/docs/roadmap/comments", token=host_tok)["threads"], what="thread saved")[0]
            assert th["quote"] == "fishing mini-game", th
            wait_for(lambda: [e for e in bus(host_tok, "mention") if e["to"] == [maya_id] and "comment" in e["title"]], what="comment mention")
            friend.click("[data-mode='read']")
            friend.wait_for_selector(f"mark.cm-hl[data-thread='{th['id']}']", timeout=6000)
            assert friend.inner_text("#dx-ccount") == "1"
            friend.click(f"mark.cm-hl[data-thread='{th['id']}']")      # opens the comments drawer on narrower panes
            friend.wait_for_selector(f".cm-thread[data-tid='{th['id']}']", timeout=6000)
            friend.fill(f"[data-reply='{th['id']}']", "Yes! Two rods, shared bucket.")
            friend.press(f"[data-reply='{th['id']}']", "Enter")
            host.wait_for_selector(f".cm-thread[data-tid='{th['id']}'] .cm-reply:has-text('shared bucket')", timeout=6000)
            wait_for(lambda: [e for e in bus(host_tok, "comment-reply") if e["to"] == [host_id]], what="reply notification to thread author")
            # a second thread on another line, from Write mode (line comment)
            host.click("[data-mode='write']")
            host.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('Mod support'); ta.focus(); ta.setSelectionRange(i + 2, i + 2); }")
            host.click("#dx-comment"); host.fill("#cm-new", "Later = after 1.0, right?"); host.click("#cm-post")
            wait_for(lambda: len(api("/docs/roadmap/comments", token=host_tok)["threads"]) == 2, what="line comment")
            host.click("[data-mode='read']")
            host.wait_for_selector("#doc-read mark.cm-hl:has-text('Mod support')")
            host.click(f"mark.cm-hl[data-thread='{th['id']}']")
            shot(host, "doc-comments")
            host.click(f"[data-resolve='{th['id']}']")
            wait_for(lambda: api("/docs/roadmap/comments", token=host_tok)["threads"][0]["resolved"] is True, what="resolved")
            host.wait_for_function(f"!document.querySelector(\".cm-list .cm-thread[data-tid='{th['id']}']\")")
            friend.wait_for_function(f"!document.querySelector(\"mark.cm-hl[data-thread='{th['id']}']\")", timeout=5000)
            host.click("#cm-showres"); host.wait_for_selector(f".cm-thread.resolved[data-tid='{th['id']}']")
            host.click(f"[data-resolve='{th['id']}']")   # reopen
            wait_for(lambda: api("/docs/roadmap/comments", token=host_tok)["threads"][0]["resolved"] is False, what="reopened")
            # re-anchoring: text moves down, the highlight follows the quote
            d = api("/docs/roadmap", token=host_tok)["doc"]
            api("/docs/roadmap", "PUT", {"body": "## Intro\nA new paragraph at the top pushes everything down.\n\n" + d["body"], "baseVersion": d["version"]}, token=host_tok)
            host.wait_for_function("document.querySelector('#doc-read') && document.querySelector('#doc-read').textContent.includes('pushes everything')", timeout=6000)
            host.wait_for_selector(f"mark.cm-hl[data-thread='{th['id']}']:has-text('fishing mini-game')")

            # ---------- 7. history + restore through the live merge path ----------
            d = api("/docs/roadmap", token=host_tok)["doc"]
            d = api("/docs/roadmap", "PUT", {"body": d["body"].replace("Mod support.", "Mod support and a level editor."), "baseVersion": d["version"]}, token=maya_tok)["doc"]
            d = api("/docs/roadmap", "PUT", {"body": d["body"] + "\n\n## Cut\nVR mode.", "baseVersion": d["version"]}, token=host_tok)["doc"]
            friend.click("[data-mode='write']")
            friend.wait_for_function("TribeDocs.live() && document.querySelector('#doc-body').value.includes('VR mode')", timeout=8000)
            host.click("#dx-history")
            host.wait_for_selector("#history-modal .dx-ver")
            versions = api("/docs/roadmap/history", token=host_tok)["versions"]
            assert len(versions) >= 3 and host.locator("#history-modal .dx-ver").count() == len(versions), versions
            v1 = versions[-1]["version"]
            host.click(f"#history-modal .dx-ver[data-v='{v1}']")
            host.wait_for_selector("#history-modal .dx-diff .dl.add")
            assert host.locator("#history-modal .dx-diff .dl.del").count() >= 1
            shot(host, "doc-history")
            old = api(f"/docs/roadmap/history/{v1}", token=host_tok)["version"]["body"]
            host.click("#hist-restore")
            friend.wait_for_function("([t]) => document.querySelector('#doc-body').value.trim() === t.trim()", arg=[old], timeout=8000)
            assert "VR mode" not in friend.input_value("#doc-body")
            wait_for(lambda: api("/docs/roadmap", token=host_tok)["doc"]["body"].strip() == old.strip(), what="restore persisted")

            # ---------- 8. pinning + nesting ----------
            host.click("[data-mode='write']")
            host.click("#dx-pin")
            host.wait_for_selector("#doc-list .dx-sec:has-text('Pinned')")
            host.wait_for_selector("#side-pins:not(.hidden) .item:has-text('Roadmap')")
            assert api("/docs/roadmap", token=host_tok)["doc"].get("pinned") is True
            friend.wait_for_selector("#side-pins:not(.hidden) .item:has-text('Roadmap')", timeout=5000)
            host.click(f".doc-item[data-slug='{meeting['slug']}']")
            host.wait_for_function("document.querySelector('#doc-title').value.startsWith('Meeting notes')")
            host.click("#dx-more"); host.click(".tf-menu button:has-text('Move under a page')")
            host.fill("#pp-q", "Road"); host.click("[data-pp='roadmap']")
            host.wait_for_selector(".doc-crumbs button:has-text('Roadmap')")
            host.wait_for_selector(f".doc-row[style*='--depth:1'] .doc-item[data-slug='{meeting['slug']}']")
            assert api(f"/docs/{meeting['slug']}", token=host_tok)["doc"]["parent"] == "roadmap"
            host.click("#dx-more"); host.click(".tf-menu button:has-text('New sub-page')")
            host.wait_for_function("document.querySelector('#doc-title').value === 'Untitled'")
            wait_for(lambda: [x for x in api("/docs", token=host_tok)["docs"] if x["title"] == "Untitled" and x.get("parent") == meeting["slug"]], what="sub-page")
            host.wait_for_selector(".doc-row[style*='--depth:2']")
            host.click(".dx-caret[data-caret='roadmap']")
            host.wait_for_function(f"!document.querySelector(\".doc-row .doc-item[data-slug='{meeting['slug']}']\")")
            host.click(".dx-caret[data-caret='roadmap']")
            host.wait_for_selector(f".doc-item[data-slug='{meeting['slug']}']")
            try:
                api("/docs/roadmap/meta", "PATCH", {"parent": meeting["slug"]}, token=host_tok); raise SystemExit("cycle allowed")
            except AssertionError as e:
                assert "400" in str(e)

            # ---------- 9. visual compare ----------
            shots_dir = Path(tempfile.mkdtemp(prefix="vis-"))
            (shots_dir / "login-v1.png").write_bytes(mock_screen(1)); (shots_dir / "login-v2.png").write_bytes(mock_screen(2))
            palette(host, "visuals"); host.keyboard.press("Enter")
            host.wait_for_selector("#view-visuals:not(.hidden) #vis-first")
            host.set_input_files("#vis-file", str(shots_dir / "login-v1.png"))
            host.wait_for_selector("#va-name"); host.fill("#va-name", "Login page"); host.click("#va-go")
            host.wait_for_selector(".vis-screen:has-text('Login page')")
            host.set_input_files("#vis-file", str(shots_dir / "login-v2.png"))
            host.wait_for_selector("#va-name"); assert host.input_value("#va-name") == "Login page"; host.click("#va-go")
            host.wait_for_selector(".vis-thumb:nth-child(2)")
            host.wait_for_function("/^[0-9.]+% changed$/.test(document.querySelector('#vis-pct').textContent)", timeout=6000)
            pct = float(host.inner_text("#vis-pct").split("%")[0])
            assert 0 < pct < 20, pct
            vs = api("/visuals/login-page", token=host_tok)["versions"]
            assert len(vs) == 2 and vs[1]["diffPrev"] and abs(vs[1]["diffPrev"] - pct) < 0.5, (vs, pct)
            host.click("[data-vm='swipe']"); host.wait_for_selector("#vis-swipe .vis-handle")
            host.click("[data-vm='side']"); host.wait_for_selector(".vis-side-by img")
            host.click("[data-vm='diff']"); host.wait_for_selector("canvas.vis-diff")
            orange = host.evaluate("""() => { const c = document.querySelector('canvas.vis-diff'), x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
                for (let i = 0; i < x.length; i += 4) if (x[i] === 242 && x[i + 1] === 107 && x[i + 2] === 29) n++; return n / (c.width * c.height) * 100; }""")
            assert abs(orange - pct) < 0.2, (orange, pct)
            shot(host, "visuals-compare")
            # agents post screenshots too; a big change emits a low-priority visual-diff on the bus
            err, out = mcp(agent_tok, "add_visual", {"screen": "Login page", "png_base64": __import__("base64").b64encode(png(64, 40, lambda x, y: (200, 40, 40))).decode()})
            assert not err and "100" in out, out
            vd = wait_for(lambda: bus(host_tok, "visual-diff"), what="visual-diff on the bus")
            assert vd[-1]["priority"] == "low", vd

            # ---------- 10. floating windows survive view switches and reloads ----------
            host.click('[data-nav="docs"]:visible'); host.click(".doc-item:has-text('Roadmap')")
            host.wait_for_function("document.querySelector('#doc-title').value === 'Roadmap'")
            host.click("#dx-float")
            host.wait_for_selector(".fwin[data-float='doc:roadmap'] .fwin-md h2:has-text('Now')")
            head = host.locator(".fwin[data-float='doc:roadmap'] .fwin-head").bounding_box()
            host.mouse.move(head["x"] + 60, head["y"] + 18); host.mouse.down(); host.mouse.move(head["x"] - 340, head["y"] + 250, steps=8); host.mouse.up()
            pos = host.evaluate("JSON.parse(localStorage.getItem('tribecode.floats'))['doc:roadmap']")
            assert pos["open"] and abs(pos["x"] - (head["x"] - 400)) < 3, (pos, head)
            host.keyboard.press("Control+k"); host.fill("#pal-input", "pop out the task board"); host.keyboard.press("Enter")   # Ctrl K: Pop out the task board
            host.wait_for_selector(".fwin[data-float='tasks'] .ft-row:has-text('Fix controller drift')")
            host.evaluate("TribeApp.show('calendar')"); host.wait_for_selector("#view-calendar:not(.hidden)")
            assert host.locator(".fwin[data-float='doc:roadmap']").is_visible() and host.locator(".fwin[data-float='tasks']").is_visible()
            # the floating doc follows live edits
            d = api("/docs/roadmap", token=host_tok)["doc"]
            api("/docs/roadmap", "PUT", {"body": d["body"] + "\n\n## Ideas\nNight mode for the campfire.", "baseVersion": d["version"]}, token=maya_tok)
            host.wait_for_selector(".fwin[data-float='doc:roadmap'] .fwin-md:has-text('Night mode')", timeout=6000)
            # ticking a task in the floating board updates the board
            host.click(f".fwin[data-float='tasks'] [data-ft='{soon['id']}']")
            wait_for(lambda: [t for t in api("/tasks", token=host_tok)["tasks"] if t["id"] == soon["id"] and t["status"] == "done"], what="task done from floating window")
            if take:   # compose the screenshot: both windows parked over the calendar's empty evening hours
                host.evaluate("TribeApp.show('calendar')"); host.wait_for_selector("#view-calendar:not(.hidden) .cal-ev")
                host.evaluate("document.querySelector('#cal-scroll').scrollTop = 8.5 * 48")
                host.evaluate("""(() => { const put = (id, x, y, w, h) => { const e = document.querySelector(`.fwin[data-float='${id}']`); Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); };
                    put('tasks', 560, 618, 330, 330); put('doc:roadmap', 910, 560, 350, 388); })()""")
                shot(host, "floating-window")
            host.click('[data-nav="home"]:visible')
            pos = host.evaluate("(() => { const e = document.querySelector(\".fwin[data-float='doc:roadmap']\"); const r = { x: e.offsetLeft, y: e.offsetTop }; const all = JSON.parse(localStorage.getItem('tribecode.floats')); all['doc:roadmap'] = { ...all['doc:roadmap'], ...r }; localStorage.setItem('tribecode.floats', JSON.stringify(all)); return r; })()")
            host.reload()
            host.wait_for_selector(".fwin[data-float='doc:roadmap'] .fwin-md:has-text('Night mode')", timeout=8000)
            pos2 = host.evaluate("(() => { const e = document.querySelector(\".fwin[data-float='doc:roadmap']\"); return { x: e.offsetLeft, y: e.offsetTop }; })()")
            assert abs(pos2["x"] - pos["x"]) < 3 and abs(pos2["y"] - pos["y"]) < 3, (pos, pos2)
            host.click(".fwin[data-float='doc:roadmap'] [data-x]")
            assert host.locator(".fwin[data-float='doc:roadmap']").count() == 0
            # person peek from the room list
            host.hover("#room-list [data-follow]:has-text('Maya')")
            host.wait_for_selector(".tf-peek:has-text('Maya')", timeout=4000)

            # ---------- phone: comments sheet + calendar fit ----------
            phone = open_as(b, "Maya", maya_tok, viewport=(390, 844))
            phone.click('#menu-btn'); phone.click("#nest-calendar"); phone.wait_for_selector("#view-calendar:not(.hidden) .cal-week")   # phones: Project Hub lives in the panel
            b.close()

        assert not errors, "\n".join(errors)
        print("E2E plan test passed")
    finally:
        srv.terminate()
        try: out = srv.communicate(timeout=3)[0].decode()
        except Exception: out = ""
        if errors or sys.exc_info()[0]: print(out[-3000:])


if __name__ == "__main__":
    main()
