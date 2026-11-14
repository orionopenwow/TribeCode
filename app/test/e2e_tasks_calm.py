"""The Task Board dashboard (v0.28): stat tiles that filter (Needs someone · In progress · Waiting for review · Done this
week · Overdue), one "Add a task" line with type / for me / due chips, full-width rows grouped by what happens next
(Needs someone, In progress, Waiting for review, Up next, Done collapsed to three), one always-visible next-step button
per row (Assign → Start → Send for review → Approve / Send back → Reopen), the "⋯" menu, the drawer, drag between
sections, keyboard (↑/↓, Enter, Esc, X), a List | Board toggle, and on phones the same rows stacked with thumb-size
buttons and the drawer as a bottom sheet.
The v0.36 design pass is checked here too: no emoji in the page chrome (stroke icons instead), a status count filters
and shows it is selected, an empty board is one welcome (not four empty boxes) and an empty section is one quiet line,
text is at least 12px (titles and inputs 14px), and a 390px phone never scrolls sideways.
Usage: python app/test/e2e_tasks_calm.py   (honours TRIBE_PORT_OFFSET; TRIBE_SHOTS=1 saves screenshots)"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import date, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4870 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("TRIBE_SHOTS")
SHOT_DIR = Path(os.environ.get("TRIBE_SHOT_DIR", str(ROOT / "docs" / "screenshots")))
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, e.read().decode()


def wait(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError("timed out waiting for " + what)


def open_as(browser, name, token, vp, mobile=False, lang=None):
    page = browser.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if SHOTS else 1).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    init = f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});"
    if lang: init += f"localStorage.setItem('tribecode.lang', '{lang}');"
    page.add_init_script(init)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
    time.sleep(1.0)
    page.evaluate("TribeApp.show('tasks')"); page.wait_for_selector("#board.tkb .tk-cols .col", timeout=10000)
    return page


# design pass: the Tasks page chrome (header, counts, add line and chips, section headers, row buttons) has no emoji
NO_EMOJI = """() => { const bad = [];
  for (const el of document.querySelectorAll('#view-tasks .view-head, #tk-seg, #board .tk-top, #board .col h5, #board .tk-acts, #board .tk-welcome, #board .tk-own, #board .tk-meta')) {
    const m = (el.textContent || '').match(/\\p{Extended_Pictographic}/u); if (m) bad.push(el.className + ': ' + m[0]); }
  const before = getComputedStyle(document.querySelector('#view-tasks .view-head h1'), '::before').content;
  if (before !== 'none' && before !== 'normal') bad.push('h1::before ' + before);
  if (!document.querySelector('#view-tasks .view-head h1 svg')) bad.push('no title icon');
  return bad; }"""
# design pass: every visible piece of text is at least 12px (avatar initials aside); titles and inputs at least 14px
SMALL = """() => { const bad = [], vis = el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden';
  for (const el of document.querySelectorAll('#view-tasks *')) {
    if (!vis(el) || el.closest('.tk-av, svg, #tk-drawer')) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) continue;
    const px = parseFloat(getComputedStyle(el).fontSize); if (px < 12) bad.push(el.className + ' ' + px + ' ' + el.textContent.trim().slice(0, 20)); }
  for (const el of document.querySelectorAll('#board .task .t, #tk-add')) { if (vis(el) && parseFloat(getComputedStyle(el).fontSize) < 14) bad.push('body ' + el.className); }
  return bad; }"""


def task(tok, title):
    return next(t for t in api("/api/tasks", token=tok)[1]["tasks"] if t["title"] == title)


def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOT_DIR / name))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-dash-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        wait(lambda: api("/api/health")[0] == 200, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        ms = api("/api/members", token=host)[1]["members"]
        camp_id = next(m["id"] for m in ms if m["name"] == "Camp"); maya_id = next(m["id"] for m in ms if m["name"] == "Maya")
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = open_as(b, "Camp", host, {"width": 1280, "height": 900})

            # 0. an empty board: one welcome with its two ways in, instead of four empty boxes; the counts step back
            pg.wait_for_selector("#board .tk-welcome", timeout=8000)
            assert pg.locator("#board .col").count() == 1 and pg.locator("#board .tk-list").count() == 0, "one welcome, no empty boxes"
            assert "Add a task" in pg.inner_text("#board .tk-welcome") and "No tasks yet" in pg.inner_text("#board .tk-welcome")
            assert pg.locator("#board .tk-welcome ol li").count() == 4, "the four stages in one line"
            assert pg.evaluate("document.querySelector('#tk-seg').classList.contains('is-quiet')"), "all-zero counts are quiet"
            assert pg.evaluate("document.querySelectorAll('#tk-seg .tk-stat.is-zero').length") == 5
            assert not pg.evaluate(NO_EMOJI), pg.evaluate(NO_EMOJI)
            assert not pg.evaluate(SMALL), pg.evaluate(SMALL)
            shot(pg, "tasks-v2-empty.png")
            pg.click('#board .tk-welcome [data-add="backlog"]'); pg.fill("#board .col .quick-add", "A first small thing"); pg.press("#board .col .quick-add", "Enter")
            pg.wait_for_selector('#board [data-sec="needs"] .task:has-text("A first small thing")', timeout=8000)
            assert pg.locator("#board .tk-welcome").count() == 0, "the welcome leaves with the first task"
            # sections with nothing in them are one quiet line: no box, and still a place to drop a task
            quiet = pg.evaluate("[...document.querySelectorAll('#board .col.is-empty')].map(c => [c.dataset.sec, getComputedStyle(c.querySelector('.tk-list')).borderTopWidth, c.getBoundingClientRect().height])")
            assert [q[0] for q in quiet] == ["doing", "review", "done"] and all(q[1] == "0px" and q[2] <= 40 for q in quiet), quiet
            assert not pg.evaluate("document.querySelector('#tk-seg').classList.contains('is-quiet')")
            api(f"/api/tasks/{task(host, 'A first small thing')['id']}", "DELETE", token=host)
            pg.wait_for_selector("#board .tk-welcome", timeout=8000)

            yday = (date.today() - timedelta(days=1)).isoformat()
            seed = [("Orders page with a daily total and a print button", "doing", camp_id, "build", None),
                    ("Delivery routes", "review", maya_id, "build", None),
                    ("Price sheet for cafés", "backlog", None, "write", yday),
                    ("Flavor photos", "backlog", None, "design", None),
                    ("Fix the totals rounding on the receipt", "backlog", maya_id, "fix", None),
                    ("Batch counter", "done", camp_id, "build", None),
                    ("Write the how-to text", "done", maya_id, "write", None),
                    ("Pick the app colors", "done", None, "design", None),
                    ("Logo sketch", "done", maya_id, "design", None)]
            for title, st, who, ty, due in seed:
                t = api("/api/tasks", "POST", {"title": title, "status": st, "type": ty, "due": due}, host)[1]["task"]
                if who: api(f"/api/tasks/{t['id']}", "PATCH", {"assignee": who}, host)
                if who == maya_id and st == "backlog": api(f"/api/tasks/{t['id']}/accept", "POST", {}, maya); api(f"/api/tasks/{t['id']}", "PATCH", {"status": "backlog"}, host)   # feat/tasks-company: she accepts, it's queued
            orders = task(host, "Orders page with a daily total and a print button")
            api(f"/api/tasks/{orders['id']}", "PATCH", {"subtasks": [{"t": "Table", "done": True}, {"t": "Total", "done": True}, {"t": "Print", "done": False}]}, host)
            pg.evaluate("TribeTasks.load()")

            # 1. stat tiles count what needs doing
            n = lambda k: int(pg.inner_text(f'#tk-seg [data-segn="{k}"]'))
            wait(lambda: n("doing") == 1 and n("review") == 1 and n("needs") == 2 and n("overdue") == 1 and n("done") == 4, what="stat tiles")
            # sections in the order you act on them; Done shows three until you ask for all
            secs = pg.evaluate("[...document.querySelectorAll('#board .col')].map(c => c.dataset.sec)")
            assert secs == ["needs", "doing", "review", "ready", "done"], secs
            assert pg.locator('#board .col[data-sec="done"] .task').count() == 3, "Done is collapsed to three"
            assert pg.locator('#board .col[data-sec="done"] [data-done-toggle]').is_visible()
            # rows are full-width and one per line, titles never cut to a word
            rows = pg.evaluate("[...document.querySelectorAll('#board .task')].map(r => r.getBoundingClientRect().width)")
            bw = pg.evaluate("document.querySelector('#board').getBoundingClientRect().width")
            assert min(rows) >= bw - 4 and bw > 500, (rows, bw)
            assert "print button" in pg.inner_text(f'#board .task[data-id="{orders["id"]}"] .t')
            assert "2/3" in pg.inner_text(f'#board .task[data-id="{orders["id"]}"]'), "checklist progress on the row"
            # every row shows its next step without hovering
            pg.mouse.move(5, 5)
            for title, label in [("Flavor photos", "Assign"), ("Fix the totals rounding on the receipt", "Start"), ("Orders page with a daily total and a print button", "Send for review"), ("Delivery routes", "Approve")]:
                btn = pg.locator(f'#board .task[data-id="{task(host, title)["id"]}"] .tk-acts .tk-btn:not(.tk-btn--back)')
                assert btn.is_visible() and btn.inner_text().strip() == label, (title, btn.inner_text())
            pr = task(host, "Price sheet for cafés")
            assert pg.locator(f'#board .task[data-id="{pr["id"]}"] .due-chip.overdue').count() == 1, "overdue chip"
            assert not pg.evaluate(NO_EMOJI), pg.evaluate(NO_EMOJI)
            assert not pg.evaluate(SMALL), pg.evaluate(SMALL)
            # the facts sit in the same order on every row: title, kind, who, due, the next step
            order = pg.evaluate(f"""(() => {{ const r = document.querySelector('#board .task[data-id="{pr["id"]}"]'); const x = s => r.querySelector(s).getBoundingClientRect(); return [x('.t').left <= x('.tk-ty').left, x('.tk-ty').right <= x('.tk-acts').left, x('.due-chip').right <= x('.tk-acts').left, r.getBoundingClientRect().height >= 44]; }})()""")
            assert all(order), order
            assert pg.evaluate(f"""document.querySelector('#board .task[data-id="{pr["id"]}"]').classList.contains('is-late')"""), "an overdue row is marked"
            shot(pg, "tasks-dashboard-desktop.png")

            # 2. tiles filter; tap again to clear
            pg.click('#tk-seg [data-seg="overdue"]')
            wait(lambda: pg.evaluate("[...document.querySelectorAll('#board .task')].map(t => t.dataset.id)") == [pr["id"]], what="overdue filter")
            assert pg.locator("#tk-filter").is_visible()
            assert pg.get_attribute('#tk-seg [data-seg="overdue"]', "aria-pressed") == "true" and pg.locator('#tk-seg [aria-pressed="true"]').count() == 1
            wait(lambda: pg.evaluate("""(() => { const b = document.querySelector('#tk-seg [data-seg="overdue"]'), o = document.querySelector('#tk-seg [data-seg="doing"]'); return getComputedStyle(b).backgroundColor !== getComputedStyle(o).backgroundColor && getComputedStyle(b, '::after').opacity === '1'; })()"""), what="the selected count looks selected")
            assert pg.evaluate("[...document.querySelectorAll('#board .col')].map(c => c.dataset.sec)") == ["needs"], "only the sections that hold a match"
            pg.click('#tk-seg [data-seg="overdue"]')
            assert pg.locator('#tk-seg [aria-pressed="true"]').count() == 0
            wait(lambda: pg.locator("#board .task").count() == 8, what="filter cleared")

            # 3. one Add line: Enter makes a task that needs someone; "For me" + due assign it on the way in
            pg.fill("#tk-add", "Label the ginger batch"); pg.press("#tk-add", "Enter")
            pg.wait_for_selector('#board [data-sec="needs"] .task:has-text("Label the ginger batch")', timeout=8000)
            t1 = task(host, "Label the ginger batch"); assert t1["status"] == "backlog" and not t1.get("assignee"), t1
            pg.click("#tk-add"); pg.click("#board [data-forme]"); pg.fill("#tk-add", "Order more bottles"); pg.press("#tk-add", "Enter")
            wait(lambda: task(host, "Order more bottles").get("assignee") == camp_id, what="For me assigns on create")
            pg.wait_for_selector('#board [data-sec="ready"] .task:has-text("Order more bottles")', timeout=8000)

            # 4. assign from the row: Assign → a short menu → Maya; the row moves to Up next with Start
            row = pg.locator(f'#board .task[data-id="{t1["id"]}"]')
            row.locator('[data-qa="assign"]').click()
            pg.wait_for_selector("#tk-pop .tkp-i", timeout=3000)
            pg.click('#tk-pop .tkp-i:has-text("Maya")')
            wait(lambda: task(host, "Label the ginger batch").get("assignee") == maya_id, what="assigned from the row")
            pg.wait_for_selector(f'#board [data-sec="ready"] .task[data-id="{t1["id"]}"] .tk-av[title="Maya"]', timeout=5000)
            # feat/tasks-company: it waits for Maya; once she accepts, it is hers and in progress
            pg.wait_for_selector(f'#board .task[data-id="{t1["id"]}"] [data-qa="waiting"]', timeout=5000)
            api(f"/api/tasks/{t1['id']}/accept", "POST", {}, maya)
            assert pg.locator("#tk-drawer").is_hidden() or pg.locator("#tk-drawer").count() == 0, "assigning doesn't open the drawer"

            # 5. the primary button walks the task along: Start → Send for review → Approve
            def press(label):
                pg.locator(f'#board .task[data-id="{t1["id"]}"] .tk-acts .tk-btn:has-text("{label}")').click()
            wait(lambda: task(host, "Label the ginger batch")["status"] == "doing", what="accepted = started")
            pg.wait_for_selector(f'#board .task[data-id="{t1["id"]}"] .tk-acts .tk-btn:has-text("Send for review")', timeout=5000)
            press("Send for review"); wait(lambda: task(host, "Label the ginger batch")["status"] == "review", what="sent for review")
            pg.locator(f'#board .task[data-id="{t1["id"]}"] [data-qa="back"]').click(); wait(lambda: task(host, "Label the ginger batch")["status"] == "doing", what="sent back")
            press("Send for review"); wait(lambda: task(host, "Label the ginger batch")["status"] == "review", what="review again")
            press("Approve"); wait(lambda: task(host, "Label the ginger batch")["status"] == "done", what="approved")
            # done collapses: newest first, "Show all" opens the rest
            pg.wait_for_selector(f'#board [data-sec="done"] .task[data-id="{t1["id"]}"]', timeout=5000)
            assert pg.locator('#board [data-sec="done"] .task').count() == 3
            pg.click('#board [data-done-toggle]'); wait(lambda: pg.locator('#board [data-sec="done"] .task').count() == 5, what="show all done")
            pg.click('#board [data-done-toggle]'); wait(lambda: pg.locator('#board [data-sec="done"] .task').count() == 3, what="collapse done")
            # the check circle marks done / not done
            fl = task(host, "Flavor photos")
            pg.locator(f'#board .task[data-id="{fl["id"]}"] .tk-check').click(); wait(lambda: task(host, "Flavor photos")["status"] == "done", what="check marks done")
            pg.click('#tk-seg [data-seg="done"]')
            pg.locator(f'#board .task[data-id="{fl["id"]}"] .tk-check').click(); wait(lambda: task(host, "Flavor photos")["status"] == "backlog", what="check again reopens")
            pg.click('#tk-seg [data-seg="done"]')

            # 6. the ⋯ menu: move and delete
            dr = task(host, "Delivery routes")
            pg.locator(f'#board .task[data-id="{dr["id"]}"] [data-qa="more"]').click()
            pg.wait_for_selector('#tk-pop [data-m="move:backlog"]'); pg.click('#tk-pop [data-m="move:backlog"]')
            wait(lambda: task(host, "Delivery routes")["status"] == "backlog", what="moved from the menu")
            ob = task(host, "Order more bottles")
            pg.locator(f'#board .task[data-id="{ob["id"]}"] [data-qa="more"]').click(); pg.click('#tk-pop [data-m="delete"]')
            wait(lambda: not any(t["title"] == "Order more bottles" for t in api("/api/tasks", token=host)[1]["tasks"]), what="deleted from the menu")

            # 7. the drawer: open from the row, labels, checklist, notes, next step
            row = pg.locator(f'#board .task[data-id="{fl["id"]}"]')
            row.locator(".t").click(); pg.wait_for_selector("#tk-drawer:not([hidden]) #tkd-title", timeout=5000)
            assert pg.input_value("#tkd-title") == "Flavor photos"
            pg.fill("#tkd-label", "design"); pg.press("#tkd-label", "Enter")
            wait(lambda: task(host, "Flavor photos").get("labels") == ["design"], what="label saved")
            pg.fill("#tkd-sub", "Shoot the ginger one"); pg.press("#tkd-sub", "Enter")
            wait(lambda: (task(host, "Flavor photos").get("subtasks") or [{}])[0].get("t") == "Shoot the ginger one", what="checklist step saved")
            pg.fill("#tkd-notes", "Daylight, kraft paper."); pg.locator("#tkd-notes").blur()
            wait(lambda: task(host, "Flavor photos").get("body") == "Daylight, kraft paper.", what="notes saved")
            pg.click('#tk-drawer .tkd-who:has-text("Maya")')
            wait(lambda: task(host, "Flavor photos").get("assignee") == maya_id, what="assigned in the drawer")
            pg.wait_for_selector("#tk-drawer .tkd-offer--wait", timeout=5000)
            pg.click('#tk-drawer .tkd-who:has-text("Me")')
            wait(lambda: task(host, "Flavor photos").get("assignee") == camp_id, what="taken back in the drawer")
            pg.click('#tk-drawer [data-step="start"]'); wait(lambda: task(host, "Flavor photos")["status"] == "doing", what="next step in the drawer")
            shot(pg, "tasks-dashboard-drawer.png")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#tk-drawer", state="hidden")

            # 8. keyboard: ↓ moves between rows, Enter opens, Esc closes
            first = pg.locator("#board .task").first; first.focus(); pg.keyboard.press("ArrowDown")
            assert pg.evaluate("document.activeElement.classList.contains('task') && document.activeElement !== document.querySelector('#board .task')"), "arrow down moves focus"
            pg.keyboard.press("Enter"); pg.wait_for_selector("#tk-drawer:not([hidden])", timeout=3000)
            pg.keyboard.press("Escape"); pg.wait_for_selector("#tk-drawer", state="hidden")

            # 9. drag a row into another section
            fx = task(host, "Fix the totals rounding on the receipt")
            pg.drag_and_drop(f'#board .task[data-id="{fx["id"]}"]', '#board [data-sec="review"]')
            wait(lambda: task(host, "Fix the totals rounding on the receipt")["status"] == "review", what="dragged to review")

            # 10. Board view: four columns (two by two on a narrow board), wide enough for titles; the choice sticks
            pg.click('#view-tasks .view-head [data-view="board"]')   # List | Board sits in the page header, beside New task
            pg.wait_for_function("document.querySelector('#board').dataset.view === 'board'")
            tops = pg.evaluate("[...document.querySelectorAll('#board .col')].map(c => Math.round(c.getBoundingClientRect().top))")
            widths = pg.evaluate("[...document.querySelectorAll('#board .col')].map(c => c.getBoundingClientRect().width)")
            assert len(tops) == 4 and len(set(tops)) <= 2 and min(widths) >= 230, (tops, widths)
            shot(pg, "tasks-dashboard-board.png")
            pg.reload(); pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000); time.sleep(0.8)
            pg.evaluate("TribeApp.show('tasks')"); pg.wait_for_function("document.querySelector('#board').dataset.view === 'board'", timeout=8000)
            sw = pg.locator("#view-tasks .tk-views").bounding_box(); nt = pg.locator("#task-new").bounding_box()
            assert abs((sw["y"] + sw["height"] / 2) - (nt["y"] + nt["height"] / 2)) <= 2 and sw["x"] + sw["width"] <= nt["x"], ("the switch and New task share the header line", sw, nt)
            pg.click('#view-tasks .view-head [data-view="list"]')

            # 11. a friend sees the change live
            mp = open_as(b, "Maya", maya, {"width": 1280, "height": 800})
            mp.wait_for_selector(f'#board [data-col="doing"] .task[data-id="{fl["id"]}"] .tk-av[title="Camp"]', timeout=8000)

            # 12. phones: same rows stacked, thumb-size next step, tiles filter, bottom sheet
            ph = open_as(b, "Camp", host, {"width": 390, "height": 844}, mobile=True)
            assert ph.locator("#tk-seg").is_visible()
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            assert ph.evaluate("(() => { const m = document.querySelector('.main'); return !m || m.scrollWidth <= m.clientWidth + 1; })()"), "the page never scrolls sideways"
            assert ph.evaluate("[...document.querySelectorAll('#tk-seg .tk-stat')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= 391 && r.height >= 44; })"), "all five counts fit, thumb-size"
            assert ph.evaluate("(() => { const c = document.querySelector('#board .tk-top__more'); return getComputedStyle(c).flexWrap === 'nowrap' && c.scrollWidth > c.clientWidth && c.getBoundingClientRect().height <= 60; })()"), "the chips are one scroller"
            assert ph.evaluate("[...document.querySelectorAll('#board .task')].every(r => r.getBoundingClientRect().height >= 44)"), "rows stay tappable"
            assert not ph.evaluate(NO_EMOJI), ph.evaluate(NO_EMOJI)
            assert not ph.evaluate(SMALL), ph.evaluate(SMALL)
            prow = ph.locator(f'#board .task[data-id="{pr["id"]}"]')
            btn = prow.locator('.tk-acts .tk-btn').bounding_box(); rb = prow.bounding_box()
            assert btn["height"] >= 44 and btn["width"] >= rb["width"] * 0.6, ("thumb-size button", btn, rb)
            shot(ph, "tasks-dashboard-phone.png")
            ph.click('#tk-seg [data-seg="doing"]')
            ph.wait_for_selector(f'#board [data-col="doing"] .task[data-id="{fl["id"]}"]', state="visible", timeout=5000)
            assert ph.locator('#board [data-sec="needs"]').count() == 0, "filtered to in progress"
            ph.locator(f'#board .task[data-id="{fl["id"]}"] .t').click(); ph.wait_for_selector("#tk-drawer:not([hidden])", timeout=5000)
            box = ph.locator("#tk-drawer").bounding_box(); assert box["y"] + box["height"] >= 840 and box["width"] >= 385, ("bottom sheet", box)
            ph.keyboard.press("Escape")

            # 13. Spanish: the board's chrome is translated
            es = open_as(b, "Camp", host, {"width": 1280, "height": 900}, lang="es")
            es.wait_for_function("document.querySelector('#board [data-sec=needs] .tk-sec__l') && document.querySelector('#board [data-sec=needs] .tk-sec__l').textContent !== 'Needs someone'", timeout=8000)
            assert "Asignar" in es.inner_text("#board"), "Assign button translated"
            es.locator(f'#board .task[data-id="{pr["id"]}"] .t').click(); es.wait_for_selector("#tk-drawer:not([hidden])", timeout=5000)
            assert "¿Quién lo hace?" in es.inner_text("#tk-drawer")
            shot(es, "tasks-dashboard-drawer-es.png")
            b.close()
    finally:
        srv.terminate()
    assert not errors, errors
    print("ok e2e_tasks_calm")


if __name__ == "__main__":
    main()
