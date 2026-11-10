"""Money + seat autopilot (v0.27 company mode, server/ledger.js + server/seatpilot.js + app/ui/ledger.js): manual entries
and the summary math (revenue, costs by category, net, runway, users, other currencies), who may write, CSV import
(a Stripe balance export, re-import skips duplicates, a plain file, Plausible), the accountant CSV export (no formulas),
AI spend per seat vs the charter budget (HTTP + MCP report_spend), MCP ledger_add (finance seat agent only) and
ledger_summary, Stripe "Sync now" against a local mock (key stays on the host, 0600), seat autopilot runs (a job in
#agents, approvals for needsApproval items, compliance topics -> high risk, outreach footer + do-not-contact list),
pause-all blocks runs, the budget cap blocks runs, the weekly digest, and the Money view on desktop and phone.
Usage: python app/test/e2e_ledger.py
"""
import json, os, stat, subprocess, tempfile, threading, time, urllib.request, urllib.error
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5600 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("LEDGER_SHOTS", "/tmp/claude-0/-home-claude/b43b5d32-29af-5d3d-9a1e-d65b58a7dc31/scratchpad/agents"))
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
MONTH = TODAY[:7]
NOW_TS = int(time.time())
SEEN_AUTH = []

class Stripe(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        SEEN_AUTH.append(self.headers.get("Authorization", ""))
        if not self.path.startswith("/v1/balance_transactions"):
            self.send_response(404); self.end_headers(); return
        body = {"object": "list", "has_more": False, "data": [
            {"id": "txn_1", "type": "charge", "amount": 1000, "fee": 59, "net": 941, "currency": "usd", "created": NOW_TS - 60, "description": "Pro plan"},
            {"id": "txn_2", "type": "payout", "amount": -900, "fee": 0, "currency": "usd", "created": NOW_TS - 30, "description": "STRIPE PAYOUT"}]}
        b = json.dumps(body).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b)

def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            data = x.read()
            return x.status, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())["result"]
    return res.get("isError", False), "\n".join(c.get("text", "") for c in res.get("content", []))

def near(a, b): return abs(a - b) < 0.001

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ledger-", dir="/tmp"))
    SHOTS.mkdir(parents=True, exist_ok=True)
    st = ThreadingHTTPServer(("127.0.0.1", 0), Stripe); threading.Thread(target=st.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_TEST_STRIPE_BASE": f"http://127.0.0.1:{st.server_address[1]}"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Firefly"}, token=host)); pid = (p.get("project") or p)["id"]
        def join(name, role="builder"):
            inv = ok(api("/invites", "POST", {"role": role, "maxUses": 1}, token=host, project=pid))["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": name}))
            return j["token"], j["member"]["id"]
        fin, fin_id = join("Fin")
        bo, bo_id = join("Bo")
        spec, _ = join("Watcher", "spectator")
        fin_agent = ok(api("/agents", "POST", token=fin, project=pid))
        grow_agent = ok(api("/agents", "POST", token=bo, project=pid))
        host_id = ok(api("/me", token=host))["member"]["id"]
        company = {"on": True, "name": "Firefly Studio", "mission": "Cozy games", "template": "game-studio", "seats": [
            {"id": "ceo", "kind": "ceo", "title": "CEO", "color": "#F26B1D", "holder": {"person": host_id, "agent": None}, "charter": {"goal": "Ship the demo", "mayDo": [], "needsApproval": ["spend"], "budgetWeekly": 0}},
            {"id": "finance", "kind": "finance", "title": "Finance", "color": "#2DD4BF", "holder": {"person": fin_id, "agent": fin_agent["agent"]["id"]}, "charter": {"goal": "Clean books", "needsApproval": ["spend"], "budgetWeekly": 5}},
            {"id": "growth", "kind": "growth", "title": "Grow", "color": "#FABD2F", "holder": {"person": bo_id, "agent": grow_agent["agent"]["id"]},
             "charter": {"goal": "Reach 100 players", "mayDo": ["draft posts"], "needsApproval": ["publish", "email customers"], "budgetWeekly": 2}}],
            "goals": [], "rhythms": {}, "created": TODAY, "updated": TODAY}
        d = tmp / "tribe" / "projects" / pid; d.mkdir(parents=True, exist_ok=True); (d / "company.json").write_text(json.dumps(company))
        L = f"/projects/{pid}/ledger"

        # ---- who may see and write ----
        assert api(L, token=spec, project=pid)[0] in (403, 404), "spectators don't see money"
        r = ok(api(L, token=bo, project=pid)); assert r["canWrite"] is False and r["company"]["name"] == "Firefly Studio"
        assert api(L, "POST", {"kind": "revenue", "amount": 5, "label": "x"}, token=bo, project=pid)[0] == 403
        assert ok(api(L, token=fin, project=pid))["canWrite"] is True

        # ---- manual entries + summary math ----
        for e, tok in [({"kind": "revenue", "amount": 100, "label": "Supporter pack", "at": TODAY}, host), ({"kind": "revenue", "amount": "49.50", "label": "Pro plan", "at": TODAY}, fin),
                       ({"kind": "cost", "amount": 30, "label": "Server", "category": "hosting", "at": TODAY}, host), ({"kind": "cost", "amount": "$12.25", "label": "Figma", "category": "tools", "at": TODAY}, host),
                       ({"kind": "users", "amount": 7, "label": "Sign-ups", "at": TODAY}, host), ({"kind": "revenue", "amount": 20, "currency": "EUR", "label": "EU sale", "at": TODAY}, host),
                       ({"kind": "revenue", "amount": 1, "label": "=HYPERLINK(\"http://x\")", "at": TODAY}, host)]:
            ok(api(L, "POST", e, token=tok, project=pid), e["label"])
        assert api(L, "POST", {"kind": "users", "amount": 2.5, "label": "x"}, token=host, project=pid)[0] == 400
        assert api(L, "POST", {"kind": "bogus", "amount": 2, "label": "x"}, token=host, project=pid)[0] == 400
        s = ok(api(f"{L}/summary?month={MONTH}", token=bo, project=pid))
        assert near(s["revenue"]["total"], 150.5) and near(s["costs"]["total"], 42.25) and near(s["net"], 108.25), s
        assert s["users"]["total"] == 7 and s["costs"]["byCategory"][0] == {"category": "hosting", "total": 30, "count": 1}, s
        assert s["otherCurrencies"] == [{"currency": "EUR", "count": 1}] and s["revenue"]["sources"][0]["type"] == "manual"
        assert s["runway"]["months"] is None and "cash" in s["runway"]["reason"].lower()
        ok(api(f"{L}/settings", "PUT", {"cash": {"amount": "1000"}}, token=host, project=pid))
        s = ok(api(f"{L}/summary?month={MONTH}", token=host, project=pid)); assert s["runway"]["months"] is None and "not burning" in s["runway"]["reason"].lower(), s["runway"]
        big = ok(api(L, "POST", {"kind": "cost", "amount": 500, "label": "Contractor", "category": "people", "at": TODAY}, token=host, project=pid))["entry"]
        s = ok(api(f"{L}/summary?month={MONTH}", token=host, project=pid))
        assert near(s["net"], -391.75) and near(s["runway"]["burn"], 391.75) and s["runway"]["months"] == round(1000 / 391.75, 1), s["runway"]

        # ---- CSV import: a Stripe balance export, again (duplicates), a plain file, Plausible ----
        stripe_csv = ('id,Type,Source,Amount,Fee,Net,Currency,Created (UTC),Description\n'
                      f'txn_a,charge,ch_1,20.00,0.88,19.12,usd,{TODAY} 10:00,"Pro plan, monthly"\n'
                      f'txn_b,refund,re_1,-5.00,0.00,-5.00,usd,{TODAY} 11:00,Refund\n'
                      f'txn_c,payout,po_1,-100.00,0.00,-100.00,usd,{TODAY} 12:00,STRIPE PAYOUT\n'
                      f'txn_d,stripe_fee,,-2.00,0.00,-2.00,usd,{TODAY} 13:00,Billing fee\n')
        r = ok(api(f"{L}/import", "POST", {"csv": stripe_csv}, token=fin, project=pid), "stripe csv")
        assert r["format"] == "stripe-balance" and r["added"] == 5 and r["skipped"] == 0, r
        r = ok(api(f"{L}/import", "POST", {"csv": stripe_csv}, token=fin, project=pid)); assert r["added"] == 0 and r["skipped"] == 5, r
        assert api(f"{L}/import", "POST", {"csv": stripe_csv}, token=bo, project=pid)[0] == 403
        r = ok(api(f"{L}/import", "POST", {"csv": f"date,amount,label\n{TODAY},3.50,Ko-fi tip\n{TODAY},nope,bad row\n", "kind": "revenue"}, token=host, project=pid))
        assert r["format"] == "generic" and r["added"] == 1 and r["bad"] == 1, r
        r = ok(api(f"{L}/import", "POST", {"csv": f"date,visitors,pageviews\n{TODAY},40,90\n"}, token=host, project=pid)); assert r["format"] == "plausible" and r["added"] == 1, r
        s = ok(api(f"{L}/summary?month={MONTH}", token=host, project=pid))
        assert near(s["revenue"]["total"], 150.5 + 15 + 3.5), s["revenue"]
        assert near(s["costs"]["total"], 542.25 + 0.88 + 2.0) and any(c["category"] == "fees" and near(c["total"], 2.88) for c in s["costs"]["byCategory"]), s["costs"]
        assert s["users"]["total"] == 47 and any(x["name"] == "Stripe CSV" for x in s["revenue"]["sources"])
        ok(api(f"{L}/{big['id']}", "DELETE", token=host, project=pid))

        # ---- CSV export for the accountant ----
        st_, csv = api(f"/projects/{pid}/ledger.csv?month={MONTH}", token=host, project=pid, raw=True)
        assert st_ == 200 and csv.startswith("date,kind,category,label,amount,currency,source_type,source_name,source_ref"), csv[:200]
        assert "'=HYPERLINK" in csv and "Contractor" not in csv and "Stripe CSV" in csv and "\"Stripe · Pro plan, monthly\"" in csv, csv
        assert len(csv.strip().splitlines()) == 1 + 7 + 5 + 2, len(csv.strip().splitlines())
        j = ok(api(f"/projects/{pid}/ledger.csv?month={MONTH}&format=json", token=bo, project=pid)); assert j["filename"].endswith(f"-ledger-{MONTH}.csv")

        # ---- MCP: summary for any agent, ledger_add for the finance seat's agent only ----
        e_, t = mcp(grow_agent["token"], "ledger_summary"); assert not e_ and "Revenue" in t and "Stripe CSV" in t and "EUR" in t, t
        e_, t = mcp(grow_agent["token"], "ledger_add", {"kind": "revenue", "amount": 9, "label": "x", "from": "made up"}); assert e_ and "finance" in t, t
        e_, t = mcp(fin_agent["token"], "ledger_add", {"kind": "cost", "amount": 4, "label": "Domain renewal", "category": "hosting", "from": "Cloudflare invoice INV-1"}); assert not e_, t
        es = ok(api(f"{L}?q=domain", token=host, project=pid))["entries"]; assert es[0]["source"]["type"] == "ai" and es[0]["source"]["ref"] == "Cloudflare invoice INV-1", es

        # ---- seat autopilot: a run posts a job to #agents and asks for approval where it must ----
        SP = f"/projects/{pid}/seatpilot"
        tasks = ["Draft two posts about the launch", "Publish the launch post on the blog", "Email customers about the new plan", "Write a post about the health benefits of walking breaks"]
        assert api(f"{SP}/seats/growth", "PUT", {"tasks": tasks}, token=fin, project=pid)[0] == 403, "only the seat's holder, CEO, admin or host"
        r = ok(api(f"{SP}/seats/growth", "PUT", {"on": True, "every": "weekdays", "at": "09:30", "tasks": tasks}, token=bo, project=pid))
        assert r["seats"]["growth"]["on"] and r["seats"]["growth"]["next"] and r["seats"]["growth"]["tasks"] == tasks
        ok(api(f"{SP}/dnc", "PUT", {"list": ["rival@example.com", "@spam.test"]}, token=host, project=pid))
        run = ok(api(f"{SP}/run", "POST", {"seat": "growth"}, token=bo, project=pid), "run")["run"]
        assert run["status"] == "posted" and run["jobs"] == 4 and len(run["approvals"]) == 3 and run["high"] == 1, run
        risks = {t["text"]: t["risk"] for t in run["tasks"]}
        assert risks[tasks[0]] == "low" and risks[tasks[1]] == "medium" and risks[tasks[2]] == "medium" and risks[tasks[3]] == "high", risks
        aps = {a["id"]: a for a in ok(api("/approvals", token=host, project=pid))["approvals"]}
        for aid in run["approvals"]: assert aid in aps and aps[aid]["status"] == "pending" and aps[aid]["project"] == pid, aid
        high = [aps[a] for a in run["approvals"] if aps[a]["risk"] == "high"][0]
        assert "health" in high["details"] and host_id in high["to"], high
        med = [aps[a] for a in run["approvals"] if "Email customers" in aps[a]["title"]][0]
        assert "Sent by Firefly Studio" in med["details"] and "rival@example.com" in med["details"] and med["to"] == [bo_id], med
        msgs = ok(api("/agents/channel?limit=10", token=host, project=pid))["messages"]
        job = [m for m in msgs if m.get("kind") == "seat-job"][-1]
        assert "Seat job · Grow" in job["text"] and "WAIT for approval" in job["text"] and "Do not contact: rival@example.com" in job["text"] and "Sent by Firefly Studio" in job["text"], job["text"]
        e_, t = mcp(grow_agent["token"], "check_messages"); assert "Seat job" in t, t
        e_, t = mcp(grow_agent["token"], "seat_job"); assert not e_ and "Seat: Grow" in t and "Next job:" in t and "publish" in t and "rival@example.com" in t, t
        # compliance keywords force high risk even with no needsApproval match
        r = ok(api(f"{SP}/seats/ceo", "PUT", {"tasks": ["Ask our lawyer to review the contract with the publisher", "Plan next week"]}, token=host, project=pid))
        run2 = ok(api(f"{SP}/run", "POST", {"seat": "ceo"}, token=host, project=pid))["run"]
        assert run2["high"] == 1 and len(run2["approvals"]) == 1 and run2["tasks"][0]["topics"] == ["legal"], run2

        # ---- pause-all blocks runs; resume ----
        assert api(f"{SP}/pause", "POST", {"paused": True}, token=bo, project=pid)[0] == 403
        r = ok(api(f"{SP}/pause", "POST", {"paused": True}, token=host, project=pid)); assert r["paused"] and r["seats"]["growth"]["next"] is None
        stc, body = api(f"{SP}/run", "POST", {"seat": "growth"}, token=bo, project=pid); assert stc == 409 and "paused" in body["error"], body
        e_, t = mcp(grow_agent["token"], "seat_job"); assert "PAUSED" in t, t
        ok(api(f"{SP}/pause", "POST", {"paused": False}, token=host, project=pid))

        # ---- AI spend per seat vs the charter budget, then the budget cap blocks runs ----
        e_, t = mcp(grow_agent["token"], "report_spend", {"tokensIn": 12000, "tokensOut": 3000, "model": "claude-sonnet", "cost": 1.5}); assert not e_ and "of" in t, t
        ok(api(f"{L}/ai-spend", "POST", {"seat": "growth", "tokensIn": 4000, "tokensOut": 1000, "model": "claude-haiku", "cost": 0.75}, token=grow_agent["token"], project=pid), "spend http")
        assert api(f"{L}/ai-spend", "POST", {"seat": "growth", "model": "x", "cost": 1}, token=fin_agent["token"], project=pid)[0] == 200, "finance may record spend"
        assert api(f"{L}/ai-spend", "POST", {"seat": "finance", "model": "x", "cost": 1}, token=grow_agent["token"], project=pid)[0] == 403
        w = ok(api(f"{L}/ai-spend", token=host, project=pid)); g = [x for x in w["seats"] if x["seat"] == "growth"][0]
        assert near(g["spent"], 3.25) and g["budget"] == 2 and g["over"] and g["tokensIn"] == 16000 and set(g["models"]) >= {"claude-sonnet", "claude-haiku"}, g
        stc, body = api(f"{SP}/run", "POST", {"seat": "growth"}, token=bo, project=pid); assert stc == 409 and "budget" in body["error"].lower(), body
        st2 = ok(api(SP, token=host, project=pid)); assert any(a["action"] == "run-blocked" for a in st2["audit"]) and any(a["action"] == "pause-all" for a in st2["audit"])

        # ---- Stripe "Sync now": no key, the host's key (0600, never logged), sync, again ----
        stc, body = api(f"{L}/connectors/stripe/sync", "POST", {}, token=fin, project=pid); assert stc == 400 and "key" in body["error"], body
        key = "rk_test_" + "A1b2C3d4E5f6G7h8"
        assert api(f"{L}/connectors/stripe/key", "PUT", {"key": key}, token=fin, project=pid)[0] == 403
        assert api(f"{L}/connectors/stripe/key", "PUT", {"key": "hello"}, token=host, project=pid)[0] == 400
        ok(api(f"{L}/connectors/stripe/key", "PUT", {"key": key}, token=host, project=pid))
        sec = tmp / "tribe" / ".tribe" / "secrets" / "connectors.json"; assert stat.S_IMODE(sec.stat().st_mode) == 0o600
        cn = ok(api(f"{L}/connectors", token=fin, project=pid))["connectors"]; s_ = [c for c in cn if c["id"] == "stripe"][0]
        assert s_["status"]["key"] and s_["status"]["hint"] is None and len(cn) == 8 and key not in json.dumps(cn), s_
        assert {c["name"] for c in cn} == {"Stripe", "PostHog", "Plausible", "Buttondown", "Resend", "Help Scout", "Crisp", "Cloudflare"}
        r = ok(api(f"{L}/connectors/stripe/sync", "POST", {}, token=fin, project=pid), "sync"); assert r["added"] == 3, r
        assert SEEN_AUTH and SEEN_AUTH[-1] == "Bearer " + key
        r = ok(api(f"{L}/connectors/stripe/sync", "POST", {}, token=fin, project=pid)); assert r["added"] == 0 and r["skipped"] == 3, r
        es = ok(api(f"{L}?source=Stripe", token=host, project=pid))["entries"]
        assert any(e["kind"] == "revenue" and near(e["amount"], 10.0) for e in es) and any(e["kind"] == "cost" and near(e["amount"], 0.59) for e in es), es
        assert key not in (tmp / "log").read_text()

        # ---- the weekly digest ----
        dg = ok(api(f"{SP}/digest", "POST", {}, token=host, project=pid))["digest"]
        assert "Grow" in dg["body"] and dg["sent"] >= 2 and dg["title"].startswith("What your agents did this week"), dg
        assert api(f"{SP}/digest", "POST", {}, token=bo, project=pid)[0] == 403

        # ---- the Money view: desktop + phone ----
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host)
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(init)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeLedger && window.TribeProjects", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')")
            pg.wait_for_selector("#nest-money:not(.hidden)", timeout=10000)
            pg.click("#nest-money")
            pg.wait_for_selector("#view-money:not(.hidden) .lg-hero .lg-v", timeout=10000)
            assert pg.evaluate("location.hash") == "#/money" and pg.evaluate("document.body.dataset.view") == "money"
            rev = pg.inner_text("#lg-rev .lg-v"); assert "179.00" in rev, rev
            assert pg.locator("#lg-rev .lg-chip").count() >= 2 and pg.locator(".lg-conn").count() == 8
            pg.wait_for_selector("#lg-pilot .sp-seathead", timeout=10000)
            assert pg.locator("#lg-pilot .sp-seathead").count() == 3
            pg.screenshot(path=str(SHOTS / "ledger-desktop.png"), full_page=False)
            pg.set_viewport_size({"width": 1440, "height": 2600}); pg.wait_for_timeout(300)
            pg.screenshot(path=str(SHOTS / "ledger-desktop-full.png")); pg.set_viewport_size({"width": 1440, "height": 900})
            # one Filters popover: costs only
            pg.click("#lg-filt"); pg.click("#lg-pop [data-k='cost']"); pg.click("#lg-fapply")
            pg.wait_for_function("document.querySelectorAll('#lg-list .lg-row').length > 0 && [...document.querySelectorAll('#lg-list .lg-dot')].every(d => d.classList.contains('k-cost'))", timeout=10000)
            assert "1" in pg.inner_text("#lg-filt")
            pg.click("#lg-filt"); pg.click("#lg-fclear"); pg.wait_for_function("!document.querySelector('#lg-filt .lg-badge')")
            # add an entry from the form
            pg.click("#lg-add"); pg.fill("#lg-addform [name=label]", "Sticker sale"); pg.fill("#lg-addform [name=amount]", "6"); pg.click("#lg-addform button.primary")
            pg.wait_for_function("document.querySelector('#lg-rev .lg-v').textContent.includes('185.00')", timeout=10000)
            # drop a CSV file
            f = tmp / "tips.csv"; f.write_text(f"date,amount,label\n{TODAY},2.00,Tip jar\n")
            pg.set_input_files("#lg-file", str(f))
            pg.wait_for_function("document.querySelector('#lg-result') && !document.querySelector('#lg-result').classList.contains('hidden') && document.querySelector('#lg-result').textContent.includes('added 1')", timeout=10000)
            # the Stripe connector sheet + an embedded seat autopilot panel (the Company view's slot)
            pg.click(".lg-conn[data-conn='stripe']"); pg.wait_for_selector(".lg-sheet #lg-sync")
            assert "mcp.stripe.com" in pg.inner_text(".lg-sheet")
            pg.screenshot(path=str(SHOTS / "ledger-connector.png"))
            pg.click("#lg-sheet-x")
            pg.evaluate(f"(() => {{ const d = document.createElement('div'); d.id = 'co-autopilot-slot'; document.querySelector('#view-money').appendChild(d); TribeSeatPilot.mount(d, '{pid}', 'growth'); }})()")
            pg.wait_for_selector("#co-autopilot-slot .sp-panel .sp-tasks input", timeout=10000)
            assert pg.locator("#co-autopilot-slot .sp-tasks input").count() == 4
            # phone
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1#/money"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeProjects", timeout=20000)
            ph.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); ph.evaluate("TribeLedger.open()")
            ph.wait_for_selector("#view-money:not(.hidden) .lg-hero .lg-v", timeout=10000)
            ph.wait_for_selector("#lg-pilot .sp-seathead", timeout=10000)
            sw = ph.evaluate("Math.max(document.documentElement.scrollWidth, document.querySelector('#view-money').scrollWidth)"); assert sw <= 390, f"phone scrolls sideways: {sw}"
            ph.screenshot(path=str(SHOTS / "ledger-phone.png"))
            ph.set_viewport_size({"width": 390, "height": 3400}); ph.wait_for_timeout(300)
            ph.screenshot(path=str(SHOTS / "ledger-phone-full.png")); ph.set_viewport_size({"width": 390, "height": 844})
            ph.click("#lg-filt"); ph.wait_for_selector("#lg-pop"); ph.screenshot(path=str(SHOTS / "ledger-phone-filters.png"))
            b.close()
        assert not errors, errors
        print("ok e2e_ledger")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
