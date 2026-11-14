"""Company dashboard v2 (feat/company-gigs, app/ui/company.js): the Company view reads like a one-page report.
Checks: the header (name, mission, one-sentence health) and the six sections render (Seats, This week, Money with a
chart, Charters & goals, Rituals, Activity); no text smaller than 12px anywhere in the view; no horizontal scroll at
390px and the sections fold on phones; every action button works (seat actions, Add a seat, Settings, Review in
inbox, Open Money, Run now x3, the CEO call, a new goal and +1); the empty state (four big tiles, one CTA, the example)
works. Screenshots: docs/screenshots/company-v2.png (1280) and company-v2-phone.png (390).
Usage: TRIBE_PORT_OFFSET=3000 python3 app/test/e2e_company_v2.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5640 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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

SMALL = """(() => { const v = document.querySelector('#view-company'), out = [];
  const w = document.createTreeWalker(v, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement;
    if (!el || !el.getClientRects().length || el.closest('[hidden], .co-tip, .folded .co-sec-b')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const f = parseFloat(cs.fontSize); if (f < 12) out.push(el.tagName + '.' + el.className + ' ' + f + 'px ' + n.textContent.trim().slice(0, 30)); }
  return out; })()"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-co2-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Firefly Labs"}, token=host)); pid = (p.get("project") or p)["id"]
        empty_p = ok(api("/projects", "POST", {"name": "Blank Slate"}, token=host)); epid = (empty_p.get("project") or empty_p)["id"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; mj = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, maya_id = mj["token"], mj["member"]["id"]
        ag = ok(api("/agents", "POST", {}, token=host, project=pid)); ag_t, ag_id = ag["token"], ag["agent"]["id"]
        # a company after a few days: seats held, a goal, standups, money over months, an approval waiting, a decision
        ok(api(f"/projects/{pid}/company/template", "POST", {"template": "saas"}, token=host, project=pid))
        ok(api(f"/projects/{pid}/company/seats/growth/assign", "POST", {"person": maya_id}, token=host, project=pid))
        ok(api(f"/projects/{pid}/company/seats/cto/assign", "POST", {"agent": ag_id}, token=host, project=pid))
        ok(api(f"/projects/{pid}/company/goals", "POST", {"title": "Founding members", "seat": "growth", "results": [{"text": "Members", "target": 25, "current": 9}]}, token=host, project=pid))
        ok(api(f"/projects/{pid}/company/standups", "POST", {"seat": "growth", "done": "Wrote the launch email", "next": "Post in two forums"}, token=maya, project=pid))
        now = datetime.now(timezone.utc)
        for k, (rv, cs) in enumerate([(0, 20), (60, 35), (140, 50), (310, 72)]):
            at = (now.replace(day=10) - timedelta(days=31 * (3 - k))).strftime("%Y-%m-%dT12:00:00Z")
            if rv: ok(api(f"/projects/{pid}/ledger", "POST", {"kind": "revenue", "label": "Sales", "amount": rv, "at": at}, token=host, project=pid))
            ok(api(f"/projects/{pid}/ledger", "POST", {"kind": "cost", "label": "Hosting", "amount": cs, "category": "hosting", "at": at}, token=host, project=pid))
        ok(api("/approvals", "POST", {"title": "Email 120 people about the launch", "details": "The launch email", "risk": "high"}, token=ag_t, project=pid))
        ok(api(f"/projects/{pid}/company/decisions", "POST", {"title": "Launch on Friday", "why": "The main flow works"}, token=host, project=pid))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}"
            def open_company(token, name, w, h, project, phone=False):
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=2 if phone else 1)
                c.add_init_script(init % (name, BASE, token))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{project}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeCompany.open()")
                return pg

            # ---- desktop 1280: the report ----
            pg = open_company(host, "Camp", 1280, 900, pid)
            pg.wait_for_selector("#view-company .co-v2 .co-seat.ceo", timeout=15000)
            secs = pg.evaluate("[...document.querySelectorAll('#view-company .co-sec')].map(s => s.dataset.sec)")
            assert secs == ["seats", "week", "money", "goals", "rituals", "activity"], secs
            for s in secs:   # each section: an icon, an eyebrow and a title
                assert pg.locator(f"#view-company .co-sec[data-sec={s}] .co-sec-ic svg").count() == 1 and pg.inner_text(f"#view-company .co-sec[data-sec={s}] h2").strip(), s
            assert "Firefly Labs" in pg.inner_text("#view-company .co-head h1") and pg.inner_text("#co-health").strip().endswith(".")
            h = pg.inner_text("#co-health"); assert "person’s OK" in h and "%" in h, h
            seat = pg.locator("#view-company .co-seat[data-seat='growth']")
            assert "Maya" in seat.inner_text() and "Post in two forums" in seat.inner_text() and seat.locator(".co-av.lg").count() == 1
            assert seat.locator("[data-seat-act]").count() == 1, "one action per seat"
            assert pg.evaluate("document.querySelector('#view-company .co-seat .co-av.lg').getBoundingClientRect().width") >= 44
            pg.wait_for_selector("#co-money .co-chart .co-ch-col", timeout=15000)
            assert pg.locator("#co-money .co-ch-col").count() == 6 and "$310" in pg.inner_text("#co-money .co-m-nums"), pg.inner_text("#co-money")
            assert "Email 120 people" in pg.inner_text("#view-company .co-appr") and "Launch on Friday" in pg.inner_text("#view-company .co-sec[data-sec=activity]")
            assert pg.locator("#view-company .co-rit [data-run]").count() == 3 and "Next:" in pg.inner_text("#view-company .co-rits")
            small = pg.evaluate(SMALL); assert not small, f"text under 12px: {small[:8]}"
            pg.evaluate("document.querySelector('#view-company .co-head').scrollIntoView({block: 'start'})"); pg.wait_for_timeout(300)
            pg.set_viewport_size({"width": 1280, "height": 2900}); pg.wait_for_timeout(500)   # the whole report in one picture
            pg.screenshot(path=str(SHOTS / "company-v2.png"))
            pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(300)
            # tooltip on the chart (hover)
            pg.hover("#co-money .co-ch-col:last-child"); assert pg.locator("#co-money .co-ch-col:last-child .co-tip").is_visible()

            # ---- every action button works ----
            def toast_has(t):
                pg.wait_for_function("t => [...document.querySelectorAll('.toast, #toast, .tc-toast, [role=status]')].some(x => x.innerText.includes(t)) || document.body.innerText.includes(t)", arg=t, timeout=10000)
            # seat actions: hire (an open seat) → the post-a-gig sheet for that seat
            open_seat = pg.evaluate("(document.querySelector('#view-company [data-seat-act=hire]') || {}).dataset.sid")
            assert open_seat, "the saas template has open seats"
            pg.click(f"#view-company [data-seat-act=hire][data-sid='{open_seat}']"); pg.wait_for_selector("#tl-sheet #tl-p-title", timeout=10000)
            assert pg.input_value("#tl-sheet #tl-p-title"); pg.keyboard.press("Escape"); pg.wait_for_selector("#tl-sheet", state="detached")
            # profile (a seat a person holds) → the work profile page
            pg.click("#view-company .co-seat[data-seat='growth'] [data-seat-act=profile]"); pg.wait_for_selector(f"#ab-page[data-id='{maya_id}']", timeout=10000)
            pg.evaluate("TribeAbilities.close()")
            # standup (the CEO seat: mine, not posted) → focuses the standup form
            pg.click("#view-company .co-seat.ceo [data-seat-act=standup]"); pg.wait_for_function("document.activeElement && document.activeElement.id === 'co-su-done'", timeout=5000)
            pg.fill("#co-su-done", "Picked the launch date"); pg.click("#co-su button[type=submit]")
            pg.wait_for_function("document.querySelector('#view-company .co-today').innerText.includes('Picked the launch date')", timeout=10000)
            # after posting, the CEO seat's action becomes Edit seat → the seat sheet
            pg.wait_for_selector("#view-company .co-seat.ceo [data-seat-act=open]", timeout=10000)
            pg.click("#view-company .co-seat.ceo [data-seat-act=open]"); pg.wait_for_selector("#invite-body.co-sheet #cs-goal", timeout=8000); pg.click("#invite-body [data-close]")
            # clicking a card (not its button) opens its charter
            pg.click("#view-company .co-seat[data-seat='growth'] .co-role"); pg.wait_for_selector("#invite-body.co-sheet #cs-goal", timeout=8000); pg.click("#invite-body [data-close]")
            # Add a seat, Settings
            pg.click("#co-add"); pg.wait_for_selector("#invite-body.co-sheet [data-kind]", timeout=8000); pg.click("#invite-body [data-close]")
            pg.click("#co-settings"); pg.wait_for_selector("#invite-body.co-sheet #cx-name", timeout=8000); pg.click("#invite-body [data-close]")
            # Review in inbox
            pg.click("#co-appr-open"); pg.wait_for_selector("#nf-panel:not(.hidden)", timeout=8000); pg.evaluate("TribeNotify.closeInbox()")
            # Run now x3
            for k in ["standup", "weekly", "board"]:
                pg.click(f"#view-company .co-rit[data-rit={k}] [data-run]"); pg.wait_for_timeout(600)
                pg.wait_for_selector(f"#view-company .co-rit[data-rit={k}] [data-run]:not([disabled])", timeout=15000)
            runs = ok(api(f"/projects/{pid}/company", token=host, project=pid))["today"]["runs"]
            assert runs.get("standup") and runs.get("weekly") and runs.get("board"), runs
            # the CEO call and goals
            pg.click("#co-dec summary"); pg.fill("#co-call-t", "Charge $5 a month"); pg.fill("#co-call-w", "Covers hosting"); pg.click("#co-call button[type=submit]")
            pg.wait_for_function("document.querySelector('#co-dec').innerText.includes('Charge $5 a month')", timeout=10000)
            pg.fill("#co-g-title", "Ship v1"); pg.fill("#co-g-target", "3"); pg.click("#co-goal-add button[type=submit]")
            pg.wait_for_function("[...document.querySelectorAll('#view-company .co-goal')].some(g => g.innerText.includes('Ship v1'))", timeout=10000)
            pg.click("#view-company .co-goal:has-text('Founding members') [data-inc]")
            pg.wait_for_function("[...document.querySelectorAll('#view-company .co-goal')].some(g => g.innerText.includes('10 / 25'))", timeout=10000)
            # Open Money
            pg.click("#co-money-open"); pg.wait_for_function("document.body.dataset.view === 'money'", timeout=10000)

            # ---- phone 390: sections fold, no horizontal scroll, nothing under 12px ----
            ph = open_company(host, "Camp", 390, 844, pid, phone=True)
            ph.wait_for_selector("#view-company .co-v2 .co-seat.ceo", timeout=15000); ph.wait_for_timeout(800)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#view-company').scrollWidth, document.querySelector('#view-company').clientWidth]")
            assert sw[0] <= 390 and sw[1] <= sw[2] + 1, f"horizontal scroll on phone: {sw}"
            small = ph.evaluate(SMALL); assert not small, f"phone text under 12px: {small[:8]}"
            assert ph.locator("#view-company .co-sec.folded").count() >= 1
            ph.click("#view-company .co-sec[data-sec=seats] [data-fold]"); assert ph.locator("#view-company .co-sec[data-sec=seats].folded").count() == 1
            assert not ph.locator("#view-company .co-sec[data-sec=seats] .co-seat").first.is_visible()
            ph.click("#view-company .co-sec[data-sec=seats] [data-fold]"); assert ph.locator("#view-company .co-seat.ceo").is_visible()
            ph.click("#view-company .co-sec[data-sec=activity] [data-fold]"); assert ph.locator("#view-company .co-sec[data-sec=activity] .co-act").is_visible()
            ph.evaluate("document.querySelector('#view-company .co-head').scrollIntoView({block: 'start'})"); ph.wait_for_timeout(300)
            ph.screenshot(path=str(SHOTS / "company-v2-phone.png"))

            # ---- the empty state: four big tiles, one CTA, the example ----
            pe = open_company(host, "Camp", 1280, 900, epid)
            pe.wait_for_selector("#view-company .co-ig-grid", timeout=15000)
            assert pe.evaluate("[...document.querySelectorAll('#view-company .co-ig-tile')].map(t => t.dataset.ig)") == ["seats", "money", "standup", "approve"]
            assert pe.locator("#view-company .co-ig .btn.primary").count() == 1, "one clear CTA"
            assert pe.evaluate("Math.min(...[...document.querySelectorAll('#view-company .co-ig-art')].map(a => a.getBoundingClientRect().height))") >= 130
            small = pe.evaluate(SMALL); assert not small, f"empty state text under 12px: {small[:8]}"
            pe.click("#co-example"); pe.wait_for_selector("#view-company .co-sample .co-sec[data-sec=money] .co-chart", timeout=8000)
            assert pe.locator("#view-company .co-sample .co-seat").count() == 5
            pe.click("#co-sample-back"); pe.wait_for_selector("#view-company .co-ig-grid", timeout=5000)
            pe.click("#co-quick"); pe.wait_for_selector("#view-company .co-v2 .co-seat.ceo", timeout=10000)   # feat/company3: "Skip the questions" is the one-click path
            assert pe.locator("#view-company .co-sec[data-sec=money] .co-none").count() == 1, "money has its own empty state"
            pe.click("#co-money-add"); pe.wait_for_function("document.body.dataset.view === 'money'", timeout=10000)
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_company_v2: ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
