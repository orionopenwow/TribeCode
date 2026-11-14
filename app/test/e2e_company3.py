"""Company made intuitive (feat/company3, app/ui/company.js + companysetup.js).
Checks: setup asks four plain questions (what you're making, name + one line, who does what, how you check in),
Back keeps answers, and the answers land (name, mission, a friend and an AI helper in roles, check-ins, a goal);
"Skip the questions" still sets it up in one click; the page shows a summary strip (roles, next check-in, money in
and out, what needs a person's OK) and ONE next step at a time ("Not now" moves on, actions work); a role an AI
holds says which AI, what it does alone and what waits for a person, and can be handed to a person in one click;
plain words (no seat / standup / charter / ritual / C-suite / runway in the page's text); a 390px phone fits.
Usage: TRIBE_PORT_OFFSET=6560 python3 app/test/e2e_company3.py
"""
import json, os, re, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5660 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(tempfile.mkdtemp(prefix="co3-shots-", dir="/tmp"))

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

JARGON = re.compile(r"\b(seats?|standups?|charters?|rituals?|c-suite|runway|rhythms?)\b", re.I)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-co3-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]; maya_id = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["member"]["id"]
        p = ok(api("/projects", "POST", {"name": "Firefly Labs"}, token=host)); pid = (p.get("project") or p)["id"]
        p2 = ok(api("/projects", "POST", {"name": "Moth Notes"}, token=host)); pid2 = (p2.get("project") or p2)["id"]
        ag_id = ok(api("/agents", "POST", {}, token=host, project=pid))["agent"]["id"]
        P = f"/projects/{pid}/company"

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host)
            def open_company(project, w=1280, h=900, phone=False):
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone)
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCompany && window.TribeCompanySetup", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{project}', 'home')"); pg.wait_for_timeout(700)
                pg.evaluate("TribeCompany.open()")
                return pg

            # ---- setup by questions ----
            pg = open_company(pid)
            pg.wait_for_selector("#view-company #co-make", timeout=15000)
            assert pg.inner_text("#co-make").strip() == "Set it up in 4 questions"
            pg.click("#co-make"); pg.wait_for_selector("#co-setup[data-step='1']")
            assert "What are you making?" in pg.inner_text("#co-setup h1") and pg.locator("#co-setup [data-tpl]").count() >= 4
            assert pg.locator("#cs-next").is_disabled(), "question 1 needs an answer (or Skip)"
            pg.click("#co-setup [data-tpl='game-studio']"); pg.wait_for_selector("#co-setup[data-step='2']")
            assert pg.input_value("#cs-name") == "Firefly Labs", "the name starts as the project's name"
            pg.fill("#cs-name", "Firefly Games"); pg.fill("#cs-mission", "Cozy little games for short breaks")
            pg.click("#cs-next"); pg.wait_for_selector("#co-setup[data-step='3']")
            assert pg.locator("#co-setup .co-set-you").count() == 1, "the lead is you"
            sel = pg.locator("#co-setup [data-role]"); assert sel.count() == 3
            sel.nth(0).select_option("ai"); sel.nth(1).select_option(f"p:{maya_id}")
            pg.click("#cs-back"); pg.wait_for_selector("#co-setup[data-step='2']"); assert pg.input_value("#cs-mission").startswith("Cozy"), "Back keeps answers"
            pg.click("#cs-next"); pg.wait_for_selector("#co-setup[data-step='3']")
            assert pg.locator("#co-setup [data-role]").nth(0).input_value() == "ai"
            pg.click("#cs-next"); pg.wait_for_selector("#co-setup[data-step='4']")
            pg.uncheck("#co-setup [data-rh='board']"); pg.fill("#cs-goal", "wishlist sign-ups"); pg.fill("#cs-target", "100")
            pg.screenshot(path=str(SHOTS / "q4.png"))
            pg.click("#cs-next"); pg.wait_for_selector("#view-company #co-strip", timeout=20000)
            c = ok(api(P, token=host, project=pid))["company"]
            assert c["name"] == "Firefly Games" and c["mission"].startswith("Cozy") and c["template"] == "game-studio", c
            assert c["seats"][1]["holder"]["agent"] == ag_id and c["seats"][2]["holder"]["person"] == maya_id and not c["seats"][3]["holder"]["person"], c["seats"]
            assert c["rhythms"] == {"standup": True, "weekly": True, "board": False}, c["rhythms"]
            assert any(g["title"] == "100 wishlist sign-ups" and g["results"][0]["target"] == 100 for g in c["goals"]), c["goals"]

            # ---- the summary strip ----
            pg.wait_for_function("document.querySelector('#co-strip-money').textContent.trim() === 'Nothing yet'", timeout=15000)
            strip = pg.inner_text("#co-strip")
            assert pg.locator("#co-strip [data-strip]").count() == 4 and "3 of 4 filled" in strip and "Daily check-in" in strip and "Nothing is waiting" in strip, strip
            pg.click("#co-strip [data-strip='oks']"); pg.wait_for_timeout(400)

            # ---- one next step at a time ----
            assert pg.locator("#view-company .co-next").count() == 1
            nx = pg.inner_text("#co-next"); assert "Give the Community role to someone" in nx and "more after this" in nx, nx
            pg.click("#co-next [data-next='skip']")   # Not now: the next one shows
            pg.wait_for_function("!document.querySelector('#co-next').innerText.includes('Community')", timeout=5000)
            assert "Post today’s update" in pg.inner_text("#co-next"), pg.inner_text("#co-next")
            pg.click("#co-next [data-next='checkin']"); pg.wait_for_function("document.activeElement && document.activeElement.id === 'co-su-done'", timeout=5000)
            pg.fill("#co-su-done", "Picked the launch date"); pg.click("#co-su button[type=submit]")
            pg.wait_for_function("document.querySelector('#co-next').innerText.includes('money in or out')", timeout=15000)
            pg.evaluate("localStorage.removeItem(Object.keys(localStorage).find(k => k.startsWith('tribecode.co.skip.')))"); pg.evaluate("TribeCompany.refresh()")
            pg.wait_for_function("document.querySelector('#co-next').innerText.includes('Community')", timeout=10000)
            pg.click("#co-next [data-next='take']")   # I'll do it: the role is mine, the step moves on
            pg.wait_for_function("!document.querySelector('#co-next').innerText.includes('Community')", timeout=10000)
            assert ok(api(P, token=host, project=pid))["company"]["seats"][3]["holder"]["person"], "I'll do it gives me the role"
            assert "4 of 4 filled" in pg.inner_text("#co-strip")

            # ---- an AI in a role: which AI, what alone, what waits, hand it over ----
            card = pg.locator("#view-company .co-seat[data-seat='cto']")
            assert "does this role. It asks a person before:" in card.locator("[data-ai-line]").inner_text(), card.inner_text()
            card.locator(".co-role").click(); pg.wait_for_selector("#invite-body.co-sheet #co-who.has-ai")
            who = pg.inner_text("#co-who")
            for t in ["an AI helper, does this role on its own", "Works alone on", "Asks a person first", "Always waits for an OK", "spending money, publishing, emailing people"]: assert t in who, (t, who)
            pg.screenshot(path=str(SHOTS / "ai-role.png"))
            pg.click("#co-who [data-who='take']"); pg.wait_for_function("!document.querySelector('#view-company .co-seat[data-seat=\"cto\"] [data-ai-line]')", timeout=10000)
            s1 = ok(api(P, token=host, project=pid))["company"]["seats"][1]["holder"]; assert s1["person"] and not s1["agent"], s1
            pg.locator("#view-company .co-seat[data-seat='cto'] .co-role").click(); pg.wait_for_selector("#co-who:not(.has-ai) [data-who='ai']")
            pg.click("#co-who [data-who='ai']"); pg.wait_for_selector("#view-company .co-seat[data-seat='cto'] [data-ai-line]", timeout=10000)

            # ---- plain words: the page never says seat, standup, charter, ritual, runway ----
            txt = pg.inner_text("#view-company"); bad = sorted(set(m.group(0).lower() for m in JARGON.finditer(txt)))
            assert not bad, f"jargon on the Company page: {bad}"
            for t in ["Who does what", "Today’s check-in", "Needs a person’s OK", "Money in and out this month", "When the team checks in"]: assert t.lower() in txt.lower(), t
            pg.set_viewport_size({"width": 1280, "height": 2400}); pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / "company3.png"))

            # ---- Skip the questions: one click still sets it up; a lead with nothing to do sees the calm card ----
            pq = open_company(pid2); pq.wait_for_selector("#co-make", timeout=15000); pq.click("#co-make"); pq.wait_for_selector("#co-setup")
            pq.click("#cs-skip"); pq.wait_for_selector("#view-company #co-strip", timeout=15000)
            assert [x["title"] for x in ok(api(f"/projects/{pid2}/company", token=host, project=pid2))["company"]["seats"]] == ["CEO", "Build", "Grow", "Run"]
            assert "lead" in pq.inner_text("#view-company .co-seat.ceo .co-role").lower(), "a role titled CEO reads Lead"
            assert "Say what this company is for" in pq.inner_text("#co-next")

            # ---- phone ----
            ph = open_company(pid, 390, 844, phone=True); ph.wait_for_selector("#view-company #co-strip", timeout=15000); ph.wait_for_timeout(600)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#view-company').scrollWidth, document.querySelector('#view-company').clientWidth]")
            assert sw[0] <= 391 and sw[1] <= sw[2] + 1, f"sideways scroll on phone: {sw}"
            assert ph.evaluate("Math.min(...[...document.querySelectorAll('#co-next .btn')].map(x => x.getBoundingClientRect().height))") >= 44, "thumb-sized next-step buttons"
            ph.screenshot(path=str(SHOTS / "company3-phone.png"))
            p3 = ok(api("/projects", "POST", {"name": "Pocket Co"}, token=host)); pid3 = (p3.get("project") or p3)["id"]
            ph.evaluate(f"TribeProjects.switchTo('{pid3}', 'home')"); ph.wait_for_timeout(700); ph.evaluate("TribeCompany.open()")
            ph.wait_for_selector("#co-make", timeout=15000); ph.click("#co-make"); ph.wait_for_selector("#co-setup[data-step='1']")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            ph.screenshot(path=str(SHOTS / "setup-phone.png"))
            b.close()
        bad = [e for e in errors if "favicon" not in e and "ResizeObserver" not in e]
        assert not bad, bad
        print(f"e2e_company3: ok (4 questions + Back + answers saved, skip, summary strip, one next step, AI in a role, plain words, phone)  shots: {SHOTS}")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
