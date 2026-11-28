"""Company page layout (p13, app/ui/company.js + company.css): Company at a glance in three blocks.
Checks, on desktop (1280) and a phone (390): the header is the name + the purpose line, and with no purpose the line
itself is the prompt (muted, opens Settings) and the next-step card never repeats it; Who can do what and Settings are
quiet (no primary); one calm facts line instead of four tiles that only shows facts with content (roles filled, what
waits for an OK, money this month) and folds check-ins that are off into one "Turn on" link; one next-step card with
one primary button and a text "Not now"; filled roles are person cards with no thick colour bar and no "Quiet" /
"On track" pills; empty roles are grouped in one "Open roles" list with quiet "Find someone" buttons; at most one
primary button per area; no sideways scroll on the phone and 40px targets.
Usage: TRIBE_PORT_OFFSET=81 python3 app/test/e2e_company_layout.py   (COMPANY_SHOTS=dir COMPANY_TAG=before to only take pictures)
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5700 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("COMPANY_SHOTS") or tempfile.mkdtemp(prefix="co-layout-", dir="/tmp")); SHOTS.mkdir(parents=True, exist_ok=True)
TAG = os.environ.get("COMPANY_TAG", "after")
ONLY_SHOTS = TAG == "before"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

# primary buttons per area: the header, the facts line, the next step, the roles section and each lower section
PRIMARIES = """(() => { const v = document.querySelector('#view-company'), out = {};
  const areas = { head: '.co-head', facts: '#co-facts', next: '#co-next', ...Object.fromEntries([...v.querySelectorAll('.co-sec')].map(s => [s.dataset.sec, '.co-sec[data-sec=' + s.dataset.sec + ']'])) };
  for (const [k, sel] of Object.entries(areas)) { const el = v.querySelector(sel); if (!el) continue;
    out[k] = [...el.querySelectorAll('.btn.primary')].filter(b => b.getClientRects().length && !b.closest('details:not([open])')).length; }
  return out; })()"""

def check(pg, phone):
    v = "#view-company"
    # 1. who we are: name + purpose line; with no purpose the line is the prompt and nothing else repeats it
    assert pg.locator(f"{v} .co-head h1").inner_text().strip() == "Firefly Labs"
    assert pg.locator(f"{v} #co-edit-co.co-mission-add").count() == 1, "the purpose line is the prompt"
    assert "say what" not in pg.inner_text("#co-next").lower(), "the next step repeats the purpose prompt"
    assert pg.locator(f"{v} .co-head .btn.primary").count() == 0, "header actions are quiet"
    assert pg.locator(f"{v} #co-whocan").is_visible() and pg.locator(f"{v} #co-settings").is_visible()
    # 2. facts: one line, only facts with content, no zero tiles
    assert pg.locator(f"{v} #co-strip, {v} .co-strip-c").count() == 0, "the four tiles are gone"
    pg.wait_for_function("document.querySelector('#co-facts') && document.querySelector('#co-facts').innerText.includes('this month')", timeout=15000)
    facts = pg.inner_text(f"{v} #co-facts")
    assert "2 of 4 roles filled" in facts and "1 waiting for an OK" in facts and "$120" in facts, facts
    for zero in ["Nothing yet", "Nothing is waiting", "Off\n", "Nothing\n"]: assert zero not in facts + "\n", (zero, facts)
    assert pg.locator(f"{v} #co-facts [data-fact=checkins-off]").count() == 1 and "Turn on" in facts, facts
    # 3. one hero: the next step, one primary + a text Not now, no thick accent bar
    assert pg.locator(f"{v} .co-next").count() == 1 and pg.locator(f"{v} #co-next .btn.primary").count() == 1
    assert pg.locator(f"{v} #co-next .linkish[data-next=skip]").inner_text().strip() == "Not now"
    assert pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#co-next')).borderLeftWidth)") <= 1
    # 4. who does what: person cards, no colour bars, no meaningless pills; open roles grouped with quiet buttons
    cards = pg.locator(f"{v} .co-seat")
    assert cards.count() == 2, cards.count()
    assert pg.evaluate("[...document.querySelectorAll('#view-company .co-seat')].every(c => getComputedStyle(c, '::before').content === 'none' || getComputedStyle(c, '::before').width === 'auto' || parseFloat(getComputedStyle(c, '::before').width) <= 1)"), "thick colour bar on a role card"
    txt = pg.inner_text(f"{v} .co-sec[data-sec=seats]")
    assert "Quiet" not in txt and "On track" not in txt, txt
    grp = pg.locator(f"{v} #co-open")
    assert grp.count() == 1 and pg.locator(f"{v} #co-open .co-open-row").count() == 2, "empty roles are one group"
    assert pg.locator(f"{v} #co-open [data-seat-act=hire]").count() == 2 and pg.locator(f"{v} #co-open .btn.primary").count() == 0
    assert "Nobody yet" not in txt and "A friend or an AI helper can do it" not in txt, "the empty-role boilerplate repeats"
    prim = pg.evaluate(PRIMARIES)
    assert all(n <= 1 for n in prim.values()), f"more than one primary in an area: {prim}"
    assert pg.locator(f"{v} .co-sec[data-sec=seats] .btn.primary").count() <= 1
    if phone:
        sw = pg.evaluate("[document.documentElement.scrollWidth, document.querySelector('#view-company').scrollWidth, document.querySelector('#view-company').clientWidth]")
        assert sw[0] <= 391 and sw[1] <= sw[2] + 1, f"sideways scroll on phone: {sw}"
        small = pg.evaluate("""[...document.querySelectorAll('#view-company .co-head .btn, #co-facts button, #co-next .btn, #co-next .linkish, #co-open .btn, .co-seat .btn')]
          .filter(b => b.getClientRects().length).map(b => [b.textContent.trim().slice(0, 20) || b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)]).filter(x => x[1] < 40)""")
        assert not small, f"targets under 40px: {small}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-colay-", dir="/tmp")); errors = []
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
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; mj = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya_id = mj["member"]["id"]
        ag = ok(api("/agents", "POST", {}, token=host, project=pid)); ag_t = ag["token"]
        P = f"/projects/{pid}/company"
        c = ok(api(f"{P}/template", "POST", {"template": "blank"}, token=host, project=pid))["company"]
        seats = c["seats"]; ceo = next(x for x in seats if x["kind"] == "ceo")
        rest = [x for x in seats if x is not ceo]
        assert ceo["holder"]["person"], "the lead holds the CEO role"
        ok(api(f"{P}/seats/{rest[0]['id']}/assign", "POST", {"person": maya_id}, token=host, project=pid))
        ok(api(P, "PUT", {"mission": "", "rhythms": {"standup": False, "weekly": False, "board": False}}, token=host, project=pid))
        ok(api("/approvals", "POST", {"title": "Email 120 people about the launch", "details": "The launch email", "risk": "high"}, token=ag_t, project=pid))
        at = datetime.now(timezone.utc).replace(day=2, hour=12).strftime("%Y-%m-%dT%H:%M:%SZ")
        ok(api(f"/projects/{pid}/ledger", "POST", {"kind": "revenue", "label": "Sales", "amount": 120, "at": at}, token=host, project=pid))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host)
            def open_company(w, h, phone=False):
                cx = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=2 if phone else 1)
                cx.add_init_script(init); pg = cx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeCompany.open()"); pg.wait_for_selector("#view-company .co-head h1", timeout=15000); pg.wait_for_timeout(1500)
                return pg

            pg = open_company(1280, 900)
            pg.screenshot(path=str(SHOTS / f"company-{TAG}-desktop.png"))
            pg.set_viewport_size({"width": 1280, "height": 2400}); pg.wait_for_timeout(400)
            pg.screenshot(path=str(SHOTS / f"company-{TAG}-desktop-full.png"))
            pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(300)
            if not ONLY_SHOTS:
                check(pg, False)
                # every function stays reachable: the purpose prompt and Turn on open Settings, Find someone opens hiring
                pg.click("#co-edit-co"); pg.wait_for_selector("#invite-body.co-sheet #cx-name", timeout=8000); pg.click("#invite-body [data-close]")
                pg.click("#co-facts [data-fact=checkins-off]"); pg.wait_for_selector("#invite-body.co-sheet #cx-name", timeout=8000); pg.click("#invite-body [data-close]")
                pg.click("#co-settings"); pg.wait_for_selector("#invite-body.co-sheet #cx-name", timeout=8000); pg.click("#invite-body [data-close]")
                pg.click("#co-open [data-seat-act=hire] >> nth=0"); pg.wait_for_selector("#tl-sheet #tl-p-title, #invite-body.co-sheet", timeout=10000); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
                pg.locator("#co-open .co-open-row .co-open-name").first.click(); pg.wait_for_selector("#invite-body.co-sheet #cs-goal", timeout=8000); pg.click("#invite-body [data-close]")
                pg.click("#co-facts [data-jump=week]"); pg.wait_for_timeout(300)
            ph = open_company(390, 844, phone=True)
            ph.screenshot(path=str(SHOTS / f"company-{TAG}-phone.png"))
            ph.set_viewport_size({"width": 390, "height": 2000}); ph.wait_for_timeout(400)
            ph.screenshot(path=str(SHOTS / f"company-{TAG}-phone-full.png"))
            ph.set_viewport_size({"width": 390, "height": 844}); ph.wait_for_timeout(300)
            if not ONLY_SHOTS: check(ph, True)
            b.close()
        bad = [e for e in errors if "favicon" not in e and "ResizeObserver" not in e]
        assert not bad, bad
        print(f"e2e_company_layout: ok (purpose prompt once, quiet header, facts line, one hero, person cards, open roles grouped, one primary per area, phone)  shots: {SHOTS}")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
