"""Tasks: description, assign → accept / decline, Council claims (feat/tasks-company, server/taskflow.js).
A lead assigns a task: it waits as "Assigned to you · Accept / Decline" on that person's board and in their inbox;
accepting makes it theirs and starts it; declining (with a reason) hands it back to the lead. A builder can't assign
other people. The description renders as Markdown in the task sheet. In Council mode new tasks are "Open to claim":
Claim assigns + accepts, posts in chat and notifies; the claim limit holds. Agents: the owner accepts for them;
accept_task / decline_task / claim_task over MCP.
Usage: python app/test/e2e_tasks_accept.py   (screenshots: docs/screenshots/tasks-accept.png, tasks-council.png)
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6311 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, name, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}
    r = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(r, timeout=30) as x: res = json.loads(x.read())["result"]
    return res["content"][0]["text"], bool(res.get("isError"))

def wait(fn, t=8, what=""):
    end = time.time() + t
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError("timed out: " + what)

def page(b, token, name, errors, w=1360, h=900):
    pg = b.new_page(viewport={"width": w, "height": h}); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (name, BASE, token))
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeTasks", timeout=20000)
    return pg

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-taccept-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); mt, mid = maya["token"], maya["member"]["id"]
        inv2 = ok(api("/invites", "POST", {}, token=host))["invite"]
        jo = ok(api("/join", "POST", {"code": inv2["code"], "name": "Jo"})); jt, jid = jo["token"], jo["member"]["id"]
        ag = ok(api("/agents", "POST", {}, token=mt)); agt, agid = ag["token"], ag["agent"]["id"]

        # --- API: permissions and the accept / decline loop
        assert ok(api("/tasks/settings", token=host))["settings"]["mode"] == "lead"
        t = ok(api("/tasks", "POST", {"title": "Draw the boss", "body": "## Goal\nA **big** boss\n\n- three phases\n- one weak spot"}, token=host))["task"]
        r = api(f"/tasks/{t['id']}", "PATCH", {"assignee": mid}, token=jt); assert r[0] == 403 and "lead" in r[1]["error"], r
        tk = ok(api(f"/tasks/{t['id']}", "PATCH", {"assignee": mid}, token=host))["task"]
        assert tk["accept"] == "pending" and tk["assignedBy"] and tk["status"] == "backlog", tk
        assert api(f"/tasks/{t['id']}/accept", "POST", {}, token=jt)[0] == 403, "only Maya answers"
        inbox = [i for i in ok(api("/notify/inbox", token=mt))["items"] if i["type"] == "task-assigned"]
        assert inbox and "Accept" in inbox[0]["title"] and inbox[0]["ref"] == t["id"], inbox
        t2 = ok(api("/tasks", "POST", {"title": "Tune the jump", "assignee": mid}, token=host))["task"]; assert t2["accept"] == "pending"
        d = ok(api(f"/tasks/{t2['id']}/decline", "POST", {"reason": "On the boss this week"}, token=mt))["task"]
        assert not d.get("assignee") and d["declined"]["reason"] == "On the boss this week" and d["status"] == "backlog", d
        back = [i for i in ok(api("/notify/inbox", token=host))["items"] if i["type"] == "task-declined"]
        assert back and "On the boss this week" in back[0]["body"], back
        # self-assign needs no answer; an agent's owner answers for it
        t3 = ok(api("/tasks", "POST", {"title": "Write the credits", "assignee": jid}, token=jt))["task"]; assert t3["accept"] == "accepted"
        t4 = ok(api("/tasks", "POST", {"title": "Sprite sheet", "assignee": agid}, token=host))["task"]; assert t4["accept"] == "pending"
        assert [i for i in ok(api("/notify/inbox", token=mt))["items"] if i["type"] == "task-assigned" and i["ref"] == t4["id"]], "the owner is asked"
        txt, bad = mcp(agt, "accept_task", {"id": t4["id"]}); assert not bad and "Accepted" in txt, txt
        assert next(x for x in ok(api("/tasks", token=host))["tasks"] if x["id"] == t4["id"])["status"] == "doing"

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pm = page(b, mt, "Maya", errors)
            pm.evaluate("TribeShell.go('tasks')")
            pm.wait_for_selector(f'#board [data-sec="offer"] .task[data-id="{t["id"]}"]', timeout=10000)
            row = pm.locator(f'#board .task[data-id="{t["id"]}"]')
            assert "Assigned to you by Camp" in row.inner_text(), row.inner_text()
            assert row.locator('[data-qa="accept"]').is_visible() and row.locator('[data-qa="decline"]').is_visible()
            # the sheet: the description as Markdown, and the offer
            row.locator(".t").click(); pm.wait_for_selector("#tk-drawer:not([hidden]) .tkd-offer", timeout=5000)
            assert pm.locator("#tk-drawer .tkd-md strong").inner_text() == "big" and pm.locator("#tk-drawer .tkd-md li").count() == 2
            pm.wait_for_function("document.querySelector('#tk-drawer').classList.contains('is-in')"); time.sleep(0.6)
            pm.screenshot(path=str(SHOTS / "tasks-accept.png"))
            pm.click('#tk-drawer .tkd-offer [data-step="accept"]')
            wait(lambda: next(x for x in ok(api("/tasks", token=host))["tasks"] if x["id"] == t["id"])["status"] == "doing", what="accepted from the sheet")
            pm.keyboard.press("Escape")
            pm.wait_for_selector(f'#board [data-sec="doing"] .task[data-id="{t["id"]}"]', timeout=5000)
            # the inbox answers too: a fresh offer, Decline asks for a reason
            t5 = ok(api("/tasks", "POST", {"title": "Menu music", "assignee": mid}, token=host))["task"]
            pm.evaluate("TribeTasks.load()"); time.sleep(0.5)
            pm.evaluate("TribeNotify.reload && TribeNotify.reload()"); time.sleep(0.6); pm.evaluate("TribeNotify.openInbox()")
            pm.wait_for_selector(f'.nf-offer[data-offer="{t5["id"]}"]', timeout=8000)
            box = pm.locator(f'.nf-offer[data-offer="{t5["id"]}"]')
            box.locator('[data-tkans="decline"]').click(); box.locator(".nf-why").fill("No audio skills yet")
            box.locator('[data-tkans="decline"]').click()
            wait(lambda: (next(x for x in ok(api("/tasks", token=host))["tasks"] if x["id"] == t5["id"]).get("declined") or {}).get("reason") == "No audio skills yet", what="declined from the inbox")
            pm.close()

            # the lead sees who declined, and the waiting chip
            ph = page(b, host, "Camp", errors)
            ph.evaluate("TribeShell.go('tasks')")
            ph.wait_for_selector(f'#board .task[data-id="{t5["id"]}"] .tk-offer--no', timeout=8000)
            t6 = ok(api("/tasks", "POST", {"title": "Title screen", "assignee": jid}, token=host))["task"]
            ph.wait_for_selector(f'#board .task[data-id="{t6["id"]}"] .tk-offer--wait', timeout=8000)
            assert "Waiting for Jo" in ph.locator(f'#board .task[data-id="{t6["id"]}"] [data-qa="waiting"]').inner_text()

            # Council: the lead switches the mode from the board; tasks are Open to claim
            ph.click("#tk-mode"); ph.wait_for_selector('#tk-pop [data-wmode="council"]'); ph.click('#tk-pop [data-wmode="council"]')
            wait(lambda: ok(api("/tasks/settings", token=host))["settings"]["mode"] == "council", what="council on")
            ph.fill("#tk-pop #tk-lim", "2"); ph.press("#tk-pop #tk-lim", "Tab")
            wait(lambda: ok(api("/tasks/settings", token=host))["settings"]["claimLimit"] == 2, what="claim limit")
            ph.keyboard.press("Escape")
            for x in ["Coin sound", "Pause menu", "Save slots"]: ok(api("/tasks", "POST", {"title": x}, token=host))
            pj = page(b, jt, "Jo", errors)
            pj.evaluate("TribeShell.go('tasks')")
            pj.wait_for_function("[...document.querySelectorAll('#board [data-sec=needs] h5')].some(h => h.textContent.includes('Open to claim'))", timeout=10000)
            coin = next(x for x in ok(api("/tasks", token=host))["tasks"] if x["title"] == "Coin sound")
            crow = pj.locator(f'#board .task[data-id="{coin["id"]}"]')
            assert crow.locator('[data-qa="claim"]').inner_text().strip() == "Claim"
            pj.screenshot(path=str(SHOTS / "tasks-council.png"))
            crow.locator('[data-qa="claim"]').click()
            wait(lambda: next(x for x in ok(api("/tasks", token=host))["tasks"] if x["id"] == coin["id"]).get("assignee") == jid, what="claimed")
            c = next(x for x in ok(api("/tasks", token=host))["tasks"] if x["id"] == coin["id"]); assert c["accept"] == "accepted" and c["status"] == "doing" and c["claimed"]["by"] == jid
            pj.wait_for_selector(f'#board .task[data-id="{coin["id"]}"] .tk-offer--claim', timeout=5000)
            assert "claimed **Coin sound**" in json.dumps(ok(api("/chat/general", token=host))), "the claim shows in chat"
            assert [i for i in ok(api("/notify/inbox", token=host))["items"] if i["type"] == "task-claimed"], "the lead hears about the claim"
            # the limit: Jo holds 1 claimed + claims 1 more = 2; a third is refused with a reason
            pause = next(x for x in ok(api("/tasks", token=host))["tasks"] if x["title"] == "Pause menu")
            ok(api(f"/tasks/{pause['id']}/claim", "POST", {}, token=jt))
            save = next(x for x in ok(api("/tasks", token=host))["tasks"] if x["title"] == "Save slots")
            r = api(f"/tasks/{save['id']}/claim", "POST", {}, token=jt); assert r[0] == 409 and "limit" in r[1]["error"], r
            # MCP claim
            txt, bad = mcp(agt, "claim_task", {"id": save["id"]}); assert not bad and "Claimed" in txt, txt
            txt, bad = mcp(agt, "decline_task", {"id": save["id"], "reason": "x"}); assert bad, "nothing to decline"
            # Lead mode again: claiming explains itself
            ok(api("/tasks/settings", "PUT", {"mode": "lead"}, token=host))
            assert api("/tasks/settings", "PUT", {"mode": "council"}, token=jt)[0] == 403, "only leads change the mode"
            r = api(f"/tasks/{t6['id']}/claim", "POST", {}, token=mt); assert r[0] == 409 and "Lead mode" in r[1]["error"], r
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("ok e2e_tasks_accept")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
