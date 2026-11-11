"""Company mode (v0.27, server/company.js + app/ui/company.js): one click on a template card makes the project a company
(seats with charters, goals, starter tasks); the seat sheet edits a charter and assigns a person and an AI helper; the
agent reads my_seat and posts a standup over MCP (it shows in Today); a CEO call lands in the decision log (and an
agent's proposed call only after a human approves it); the weekly rhythm sends exactly ONE notification per person; a
seat narrows rights but never adds any; "A business" in setup fills open seats with the host's AI; Flint answers
"who's in charge of marketing"; the dashboard shows a Company tile; a 390px phone has no horizontal scroll.
Usage: python app/test/e2e_company.py   (screenshots go to $COMPANY_SHOTS or /tmp)
"""
import json, os, subprocess, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5600 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("COMPANY_SHOTS", "/tmp"))

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, name, args, project=None):
    a = dict(args); a.update({"project": project} if project else {})
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": a}}
    r = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(r, timeout=30) as x: res = json.loads(x.read())["result"]
    return res["content"][0]["text"], bool(res.get("isError"))

def inbox(token, kind): return [i for i in ok(api("/notify/inbox", token=token))["items"] if i.get("type") == kind]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-company-", dir="/tmp"))
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
        p = ok(api("/projects", "POST", {"name": "Firefly Labs", "bio": "A small tool for night gardeners"}, token=host)); pid = (p.get("project") or p)["id"]
        v = ok(api(f"/projects/{pid}/company", token=host, project=pid))
        assert v["company"] is None and v["canLead"] and len(v["templates"]) == 8, v
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))
        maya_t, maya_id = maya["token"], maya["member"]["id"]
        sinv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; spec = ok(api("/join", "POST", {"code": sinv["code"], "name": "Watcher"}))
        ag = ok(api("/agents", "POST", {}, token=host, project=pid)); ag_t, ag_id = ag["token"], ag["agent"]["id"]
        assert api(f"/projects/{pid}/company/template", "POST", {"template": "saas"}, token=maya_t, project=pid)[0] == 403, "builders can't make the company"

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host)
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(init)
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(800)
            # the sidebar offers it to the host, then the empty state with template cards: one click makes it
            # v0.27 polish: the sidebar stays at five rows until it's a company; making one starts from Ctrl K / Recommended next
            assert pg.locator("#nest-company:not(.hidden)").count() == 0
            pg.evaluate("TribeCompany.open()"); pg.wait_for_selector("#view-company .co-tpl[data-tpl='saas']", timeout=10000)
            assert pg.locator("#view-company .co-tpl").count() == 8
            pg.click("#view-company .co-tpl[data-tpl='saas']")
            pg.wait_for_selector("#view-company .co-seat.ceo", timeout=10000)
            assert pg.locator("#view-company .co-seat").count() == 5 and pg.inner_text("#nest-company").strip().startswith("Company")
            c = ok(api(f"/projects/{pid}/company", token=host, project=pid))["company"]
            assert [s["kind"] for s in c["seats"]] == ["ceo", "cto", "growth", "support", "finance"] and c["seats"][0]["holder"]["person"], c["seats"]
            assert len(c["goals"]) == 2 and all(g["seat"] for g in c["goals"]), c["goals"]
            tasks = ok(api("/tasks", token=host, project=pid))["tasks"]
            assert len([t for t in tasks if t.get("source") == "company"]) == 5 and all(t.get("seat") for t in tasks if t.get("source") == "company"), tasks
            # the seat sheet: edit the charter, give the seat to Maya and the host's Claude
            pg.click("#view-company .co-seat[data-seat='growth']"); pg.wait_for_selector("#invite-body.co-sheet #cs-goal")
            assert pg.locator("#co-academy-slot").count() == 1 and pg.locator("#co-hire-slot").count() == 1
            pg.fill("#cs-goal", "Get 40 sign-ups from strangers")
            pg.fill("#cs-may .co-tag-in", "merge into main"); pg.keyboard.press("Enter")
            pg.click("#invite-body .co-more summary"); pg.fill("#cs-budget", "25")
            pg.select_option("#cs-person", maya_id); pg.select_option("#cs-agent", ag_id)
            pg.click("#cs-save"); pg.wait_for_selector("#invite-modal.hidden", state="attached", timeout=15000)
            pg.wait_for_function("document.querySelector(\"#view-company .co-seat[data-seat='growth']\").innerText.includes('Maya')", timeout=15000)
            g = next(s for s in ok(api(f"/projects/{pid}/company", token=host, project=pid))["company"]["seats"] if s["id"] == "growth")
            assert g["charter"]["goal"].startswith("Get 40") and "merge into main" in g["charter"]["mayDo"] and g["charter"]["budgetWeekly"] == 25, g
            assert g["holder"] == {"person": maya_id, "agent": ag_id} and g["status"] == "on-track", g
            assert api(f"/projects/{pid}/company/seats/growth", "PATCH", {"charter": {"goal": "x"}}, token=maya_t, project=pid)[0] == 403, "holders can't rewrite the charter"
            assert ok(api(f"/projects/{pid}/company/seats/growth", "PATCH", {"status": "needs-you", "last": "Need the pricing call"}, token=maya_t, project=pid))["seat"]["status"] == "needs-you"
            assert api(f"/projects/{pid}/company/seats/growth/assign", "POST", {"agent": "nobody-1234"}, token=host, project=pid)[0] == 400
            assert api(f"/projects/{pid}/company/seats/growth/assign", "POST", {"person": spec["member"]["id"]}, token=host, project=pid)[0] == 400, "no spectators in seats"

            # ---- the agent: my_seat, a standup (shows in Today), seat_check ----
            t, e = mcp(ag_t, "my_seat", {}, pid); assert not e and "Grow" in t and "Get 40 sign-ups" in t and "needsApproval" in t, t
            t, e = mcp(ag_t, "seat_standup", {"done": "Drafted the landing copy", "next": "List launch places", "blocked": ""}, pid); assert not e and "growth" in t, t
            t, _ = mcp(ag_t, "seat_check", {"action": "publish the launch post"}, pid); assert t.startswith("ASK"), t
            t, _ = mcp(ag_t, "seat_check", {"action": "draft posts for the launch"}, pid); assert t.startswith("YES"), t
            t, _ = mcp(ag_t, "company_brief", {}, pid); assert "Firefly Labs" in t and "Launch to the first real users" in t, t
            pg.wait_for_function("document.querySelector('#view-company .co-today').innerText.includes('Drafted the landing copy')", timeout=15000)

            # ---- seat caps: narrow or request, never more than the role ----
            chk = lambda tok, who, act: ok(api(f"/projects/{pid}/company/check?member={who}&action={urllib.parse.quote(act)}", token=tok, project=pid))
            assert chk(host, maya_id, "draft posts")["allowed"] == "yes"
            assert chk(host, maya_id, "publish the launch post")["allowed"] == "ask"          # needs a human's yes
            assert chk(host, maya_id, "rewrite the billing code")["allowed"] == "ask"         # outside the charter: narrowed
            assert chk(host, maya_id, "merge into main")["allowed"] == "ask", "a charter line can't grant what the builder role lacks"
            assert chk(host, spec["member"]["id"], "draft posts")["allowed"] == "no"
            assert api(f"/projects/{pid}/company/check?member=x&action=a", token=maya_t, project=pid)[0] in (403, 404)

            # ---- decisions: a CEO call from the UI; an agent's proposal only after approval ----
            pg.click("#co-dec summary"); pg.fill("#co-call-t", "We launch on Friday"); pg.fill("#co-call-w", "The main flow works"); pg.click("#co-call button[type=submit]")
            pg.wait_for_function("document.querySelector('#co-dec').innerText.includes('We launch on Friday')", timeout=15000)
            assert api(f"/projects/{pid}/company/decisions", "POST", {"title": "x"}, token=maya_t, project=pid)[0] == 403, "only the CEO seat or a lead"
            t, e = mcp(ag_t, "ceo_call", {"title": "Launch on a forum first", "why": "Our users hang out there"}, pid); assert not e and "Proposed" in t, t
            decs = ok(api(f"/projects/{pid}/company/decisions", token=host, project=pid))["decisions"]
            assert [d["kind"] for d in decs] == ["ceo-call"] and decs[0]["title"] == "We launch on Friday", decs
            ap = next(a for a in ok(api("/approvals", token=host))["approvals"] if a["kind"] == "ceo-call" and a["status"] == "pending")
            ok(api(f"/approvals/{ap['id']}/approve", "POST", {"note": "go"}, token=host))
            decs = ok(api(f"/projects/{pid}/company/decisions", token=host, project=pid))["decisions"]
            assert any(d["title"] == "Launch on a forum first" and d["kind"] == "ceo-call" for d in decs), decs
            t, _ = mcp(ag_t, "decisions_read", {}, pid); assert "Launch on a forum first" in t and "We launch on Friday" in t, t

            # ---- rhythms: weekly = ONE notification per person; board = a doc; standup nudges people ----
            assert api(f"/projects/{pid}/company/rhythms/run", "POST", {"kind": "weekly"}, token=maya_t, project=pid)[0] == 403
            before_m, before_h = len(inbox(maya_t, "company-weekly")), len(inbox(host, "company-weekly"))
            r = ok(api(f"/projects/{pid}/company/rhythms/run", "POST", {"kind": "weekly"}, token=host, project=pid))
            assert r["to"] == 2 and "Goals:" in r["report"]["text"], r
            time.sleep(0.4)
            assert len(inbox(maya_t, "company-weekly")) == before_m + 1 and len(inbox(host, "company-weekly")) == before_h + 1, "exactly one weekly notification each"
            wk = inbox(maya_t, "company-weekly")[0]; assert "Weekly review" in wk["title"] and "Goals:" in wk["body"] and "spending isn't tracked" in wk["body"], wk
            r = ok(api(f"/projects/{pid}/company/rhythms/run", "POST", {"kind": "board"}, token=host, project=pid))
            doc = ok(api(f"/docs/{r['doc']['slug']}", token=host, project=pid))
            body = json.dumps(doc)
            assert all(h in body for h in ["## Metrics", "## Wins", "## Risks", "## Asks"]), body[:400]
            ok(api(f"/projects/{pid}/company/rhythms/run", "POST", {"kind": "standup"}, token=host, project=pid))

            # ---- Flint ----
            ans = pg.evaluate("TribeCompany.flint(\"who's in charge of marketing?\")")
            assert ans and "Grow" in ans["text"] and "Maya" in ans["text"], ans
            assert pg.evaluate("TribeCompany.flint('what is the weather')") is None
            pg.wait_for_timeout(500)
            pg.evaluate("document.querySelector('#view-company .co-head').scrollIntoView({block: 'start'})"); pg.wait_for_timeout(300)
            pg.screenshot(path=str(SHOTS / "company-desktop.png"), full_page=False)
            # seat sheet screenshot
            pg.click("#view-company .co-seat[data-seat='growth']"); pg.wait_for_selector("#invite-body.co-sheet #cs-goal"); pg.wait_for_timeout(500)
            pg.screenshot(path=str(SHOTS / "company-sheet.png")); pg.keyboard.press("Escape"); pg.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            # the dashboard tile
            pg.evaluate("TribeShell.go('home')"); pg.wait_for_selector("#pj-overview", timeout=15000)
            ok(api("/tasks", "POST", {"title": "warm up"}, token=host, project=pid))
            pg.evaluate("TribeProjects.overview && TribeProjects.overview()")
            pg.wait_for_selector(".gl-tile.gl-company", timeout=10000)
            assert "%" in pg.inner_text(".gl-tile.gl-company")

            # ---- phone 390: stacked cards, no horizontal scroll ----
            ph = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany", timeout=20000)
            ph.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); ph.wait_for_timeout(600)
            ph.evaluate("TribeCompany.open()"); ph.wait_for_selector("#view-company .co-seat.ceo", timeout=10000); ph.wait_for_timeout(400)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#view-company').scrollWidth, document.querySelector('#view-company').clientWidth]")
            assert sw[0] <= 390 and sw[1] <= sw[2] + 1, f"horizontal scroll on phone: {sw}"
            ph.screenshot(path=str(SHOTS / "company-phone.png"))
            ph.click("#view-company .co-seat[data-seat='growth']"); ph.wait_for_selector("#invite-body.co-sheet #cs-goal"); ph.wait_for_timeout(300)
            assert ph.evaluate("document.querySelector('#invite-body').scrollWidth <= document.querySelector('#invite-body').clientWidth + 1")
            ph.screenshot(path=str(SHOTS / "company-phone-sheet.png"))
            b.close()

        # ---- "A business" in setup: a template + the host's AI in the open seats ----
        p2 = ok(api("/projects", "POST", {"name": "Dice Night"}, token=host)); pid2 = (p2.get("project") or p2)["id"]
        r = ok(api(f"/projects/{pid2}/setup/business", "POST", {"template": "club", "helpers": True}, token=host, project=pid2))
        assert r["helper"] and r["helper"]["id"] == ag_id and all(s["holder"]["agent"] == ag_id for s in r["company"]["seats"] if s["kind"] != "ceo"), r
        assert api(f"/projects/{pid2}/setup/business", "POST", {"template": "club"}, token=host, project=pid2)[0] == 409
        assert api(f"/projects/{pid2}/company/seats/ceo", "DELETE", token=host, project=pid2)[0] == 400
        assert errors == [], errors
        print("e2e_company: ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
