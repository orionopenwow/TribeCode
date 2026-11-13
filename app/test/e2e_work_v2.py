"""Work, redesigned (feat/work-v2: app/ui/talent.js, abilities.js, flintlessons.js, server/workfeed.js).
One header and one line; three action tiles (Get help, Offer help, Find people); a compact "you" strip (Your abilities
+ Your tasks, one line when there are none); the three-step guide with Show me (Flint's director rings the real UI);
four tabs with icons, each empty tab with one action and "How it works". With no tribe, or a tribe that lives in this
tab, nothing waits on "Loading…": Work shows what this device has and says exactly what needs a tribe, with Create a
tribe. A network error is a calm card with Retry. Text sizes: body 14px+, labels 12px+. 390px phone layout.
The signed gig feed (/api/work/feed.json) verifies. Screenshots: docs/screenshots/work-v2.png, work-v2-phone.png.
Usage: TRIBE_PORT_OFFSET=3500 python3 app/test/e2e_work_v2.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5710 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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


# every visible text in Work: labels >= 12px; body copy >= 14px
SIZES = """(() => {
  const root = document.querySelector('#view-work'); const small = [], body = [];
  for (const el of root.querySelectorAll('*')) {
    if (!el.offsetParent || el.closest('svg')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) small.push(el.className + ':' + fs + ':' + el.textContent.trim().slice(0, 30));
  }
  for (const el of root.querySelectorAll('.wk-sub, .wk-tile-t small, .wk-empty p, .wk-how li, .wk-guide li, .wk-row-v, .tl-desc, .tl-none'))
    if (el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 14) body.push(el.className + ':' + getComputedStyle(el).fontSize);
  return { small, body };
})()"""

HEADERS = """(() => [...document.querySelectorAll('#view-work h1, #view-work h2, #view-work .eyebrow')].filter(e => e.offsetParent).map(e => e.textContent.trim()))()"""


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-workv2-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(name, token=None, w=1280, h=900, q=""):
                c = b.new_context(viewport={"width": w, "height": h})
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}{srv_}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1" + q, wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeAbilities && window.TribeTalent && window.TribeFlintLessons", timeout=20000)
                if token: pg.wait_for_function("TribeClient.connected()", timeout=45000)
                return pg

            # ---------- 1. no tribe: one header, tiles, no endless Loading, exact needs-a-tribe notice ----------
            fr = page("Orion", q="&freshopen=1"); assert not fr.evaluate("TribeClient.connected()"), "no tribe here"; fr.evaluate("TribeTalent.open()"); fr.wait_for_selector("#wk-head", state="visible", timeout=10000)
            hs = fr.evaluate(HEADERS)
            assert hs.count("Work") == 1 and not any("Company" in h or "Your tasks" in h for h in hs), hs
            assert fr.locator("#view-work h1").count() == 1 and fr.inner_text(".wk-sub") == "Find help, offer help, trade time."
            assert [fr.inner_text(f"#wk-{k} b") for k in ("get", "offer", "find")] == ["Get help", "Offer help", "Find people"]
            assert fr.locator("#wk-tiles .wk-tile svg").count() == 3, "tiles have stroke icons"
            fr.wait_for_selector("#tl-empty #tl-e-start", state="visible")
            fr.wait_for_timeout(1500); assert "Loading" not in fr.inner_text("#view-work"), "no endless Loading with no tribe"
            assert "Nothing assigned to you" in fr.inner_text("#hub-mytasks")
            tabs = fr.eval_on_selector_all("#wk-tabs [data-tab]", "e => e.map(x => [x.dataset.tab, !!x.querySelector('svg')])")
            assert 3 <= len(tabs) <= 4 and all(t[1] for t in tabs), tabs
            for k in ("people", "trade"):   # every tab: an empty state with one action and How it works
                fr.click(f"#wk-tabs [data-tab={k}]"); fr.wait_for_selector("#tl-body .wk-empty .wk-how")
                assert fr.locator("#tl-body .wk-empty .btn.primary").count() == 1 and fr.locator("#tl-body .wk-how li").count() == 3
                assert "Loading" not in fr.inner_text("#tl-body")
            fr.click("#wk-tabs [data-tab=offers]"); fr.wait_for_selector("#ab-empty #ab-post")
            fr.click("#wk-tabs [data-tab=gigs]"); fr.wait_for_selector("#tl-empty .wk-how")
            # Get help with no tribe: says exactly what needs a tribe, and opens the create-a-tribe flow
            fr.click("#wk-get"); fr.wait_for_selector("#wk-need", state="visible")
            assert "Posting a gig needs a tribe" in fr.inner_text("#wk-need"), fr.inner_text("#wk-need")
            assert "real tribe" not in fr.inner_text("body")
            fr.click("#wk-need-go"); fr.wait_for_function("window.TribeNew && TribeNew.isOpen()", timeout=8000)
            assert fr.locator("#wk-need").count() == 0
            fr.keyboard.press("Escape"); fr.evaluate("TribeNew.close && TribeNew.close()")
            fr.click("#wk-find"); fr.wait_for_selector("#wk-need"); assert "Finding people needs a tribe" in fr.inner_text("#wk-need")
            fr.click("#wk-need [data-need-x]")
            # Offer help works here (kept on this device); templates are one link away
            fr.click("#wk-offer"); fr.wait_for_selector("#ab-sheet #ab-gf"); fr.evaluate("TribeAbilities.close()")
            fr.click("#tl-e-tpl"); fr.wait_for_selector("#wk-tpl #tl-tpl #dt-lib .dt-card", timeout=10000)
            fr.click("[data-tpl-x]"); fr.wait_for_selector("#wk-tpl", state="detached")
            # the guide is three direct steps; Show me rings the real tiles, then the gigs, then your tasks
            assert [x.strip() for x in fr.eval_on_selector_all("#wk-guide li", "e => e.map(x => x.innerText)")] == ["1\nSay what you need.", "2\nFriends or AIs offer.", "3\nAccept and it becomes a task."], fr.eval_on_selector_all("#wk-guide li", "e => e.map(x => x.innerText)")
            fr.click("#wk-show"); fr.wait_for_selector(".fls-ring", timeout=5000)
            assert "Get help" in fr.inner_text(".fls-tip")
            fr.wait_for_function("document.querySelector('.fls-ring') && document.querySelector('.fls-ring').dataset.step === '2'", timeout=6000)
            fr.wait_for_function("document.querySelector('.fls-ring') && document.querySelector('.fls-ring').dataset.step === '3'", timeout=6000)
            assert "task" in fr.inner_text(".fls-tip")
            fr.evaluate("TribeFlintLessons.unring()")
            sz = fr.evaluate(SIZES); assert not sz["small"] and not sz["body"], sz
            fr.context.close()

            # ---------- 2. a tribe that lives in this tab (offline.js): local data, never "Loading…" or "real tribe" ----------
            dm = page("Orion", q="&freshopen=1"); dm.evaluate("TribeOffline.start('quiet')"); dm.wait_for_function("TribeClient.connected()", timeout=20000)
            dm.evaluate("TribeTalent.open()"); dm.wait_for_selector("#tl-empty #tl-e-start", state="visible", timeout=10000)
            dm.wait_for_timeout(1500); txt = dm.inner_text("body")
            assert "Loading" not in dm.inner_text("#view-work") and "This needs a real tribe" not in txt, txt[:400]
            dm.click("#wk-get"); dm.wait_for_selector("#wk-need"); assert "Posting a gig needs a tribe" in dm.inner_text("#wk-need")
            dm.context.close()

            # ---------- 3. a real tribe ----------
            host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
            p = ok(api("/projects", "POST", {"name": "Lantern Run"}, token=host)); pid = (p.get("project") or p)["id"]
            inv = ok(api("/invites", "POST", {}, token=host))["invite"]; j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya = j["token"]
            pg = page("Camp", host); pg.evaluate("TribeTalent.open('gigs')"); pg.wait_for_selector("#wk-empty-gigs", timeout=15000)
            assert pg.locator("#wk-empty-gigs .wk-how li").count() == 3 and pg.locator("#wk-empty-gigs [data-post]").count() == 1
            assert pg.evaluate(HEADERS).count("Work") == 1
            assert "Nothing assigned to you" in pg.inner_text("#hub-mytasks")
            # Get help -> the post sheet; Find people -> the people tab with the search focused
            pg.click("#wk-get"); pg.wait_for_selector("#tl-sheet #tl-pf"); assert pg.locator("#tl-p-tpl").count() == 1
            pg.fill("#tl-p-title", "Pixel artist for the title screen"); pg.fill("#tl-p-skills", "pixel art"); pg.click("#tl-p-go"); pg.wait_for_selector("#tl-sheet", state="detached")
            pg.wait_for_selector("#view-work .tl-gig.hero", timeout=10000)
            pg.click("#wk-find"); pg.wait_for_selector("#tl-find-skill"); pg.wait_for_function("document.activeElement.id === 'tl-find-skill'", timeout=5000)
            pg.click("#wk-offer"); pg.wait_for_selector("#ab-sheet #ab-gf"); pg.evaluate("TribeAbilities.close()")
            # a task assigned to me -> one compact row in the strip
            ok(api("/tasks", "POST", {"title": "Ink the moon", "assignee": ok(api("/me", token=host))["member"]["id"]}, token=host, project=pid))
            pg.evaluate("TribeTalent.open('trade')"); pg.wait_for_selector("#view-work [data-trade]")
            pg.click("[data-trade=compute]"); pg.wait_for_selector("#wk-empty-ai, [data-off-new]")
            pg.click("[data-trade=bank]"); pg.wait_for_selector(".tl-bal")
            pg.click("#wk-tabs [data-tab=gigs]"); pg.wait_for_selector("#view-work .tl-gig.hero")
            pg.evaluate("TribeTalent.reload()")
            pg.wait_for_selector("#hub-mytasks .hmt-row", timeout=20000); assert "Ink the moon" in pg.inner_text("#hub-mytasks")
            # Public is a visibility choice on the gig, and the feed carries it, signed
            gid = ok(api("/talent/gigs", token=host))["gigs"][0]["id"]
            pg.click(f"#view-work [data-open='{gid}']"); pg.wait_for_selector("#tl-vis")
            pg.click("#tl-vis [data-v=public]"); pg.wait_for_selector("#tl-share:not([hidden])"); pg.fill("#tl-share-c", "@camp on Discord"); pg.click("#tl-share button[type=submit]")
            pg.wait_for_selector("#tl-share-link", timeout=10000); pg.keyboard.press("Escape")
            feed = ok(api("/work/feed.json", token=maya), "feed")
            assert [g["title"] for g in feed["gigs"]] == ["Pixel artist for the title screen"] and feed["gigs"][0]["contact"] == "@camp on Discord", feed
            v = ok(api("/work/feed/verify", "POST", {"feed": feed}, token=maya)); assert v["ok"], v
            feed["gigs"][0]["title"] = "Tampered"; assert not ok(api("/work/feed/verify", "POST", {"feed": feed}, token=maya))["ok"]
            assert api("/work/feed.json")[0] == 401, "members only"
            pg.click(f"#view-work [data-open='{gid}']"); pg.wait_for_selector("#tl-vis [data-v=public].on"); pg.click("#tl-vis [data-v=tribe]")
            pg.wait_for_function("document.querySelector('#tl-vis-note').textContent.includes('left your gig feed')", timeout=8000); pg.keyboard.press("Escape")
            assert ok(api("/work/feed.json", token=maya))["gigs"] == [], "unshared gigs leave the feed"
            # Gigs › Public (the community board) is a switch, not a tab
            pg.click("[data-where=public]"); pg.wait_for_selector("#wk-empty-public, #tl-body .tl-grid", timeout=10000); pg.click("[data-where=tribe]")
            # a network error: calm card with Retry (no toast, no endless Loading)
            pat = __import__("re").compile(r".*/api/talent(\?.*)?$"); pg.route(pat, lambda r: r.abort()); pg.evaluate("TribeTalent.open('people')")
            pg.evaluate("TribeTalent.reload()"); pg.wait_for_selector("#wk-err #wk-retry", timeout=10000)
            assert "Work didn’t load" in pg.inner_text("#wk-err")
            pg.unroute(pat); pg.click("#wk-retry"); pg.wait_for_selector("#tl-find-skill", timeout=10000)
            pg.evaluate("TribeTalent.open('gigs')"); pg.wait_for_selector("#view-work .tl-gig.hero")
            sz = pg.evaluate(SIZES); assert not sz["small"] and not sz["body"], sz
            pg.evaluate("document.querySelector('#wk-head').scrollIntoView({block: 'start'}); document.querySelector('.toast') && document.querySelector('.toast').classList.add('hidden')"); pg.wait_for_timeout(300)
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "work-v2.png"))
            # 1280: three tiles side by side, nothing overflowing
            boxes = pg.eval_on_selector_all("#wk-tiles .wk-tile", "e => e.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left), r.width, x.scrollWidth <= x.clientWidth + 1]; })")
            assert (len({b_[0] for b_ in boxes}) == 1 or len({b_[1] for b_ in boxes}) == 1) and all(b_[3] and b_[2] >= 140 for b_ in boxes), boxes   # one row, or one column when the column is narrow
            g = pg.eval_on_selector_all("#wk-guide li", "e => e.map(x => x.getBoundingClientRect().width)"); assert all(w >= 200 for w in g), g
            assert pg.evaluate("document.querySelector('#view-work').scrollWidth <= document.querySelector('#view-work').clientWidth + 1")

            # ---------- 4. 390px phone ----------
            ph = page("Camp", host, 390, 844); ph.evaluate("TribeTalent.open('gigs')"); ph.wait_for_selector("#view-work .tl-gig.hero", timeout=15000)
            ph.wait_for_selector("#hub-mytasks .hmt-row", timeout=20000)
            assert ph.evaluate("document.documentElement.scrollWidth <= 391 && document.querySelector('#view-work').scrollWidth <= document.querySelector('#view-work').clientWidth + 1")
            tops = ph.eval_on_selector_all("#wk-tiles .wk-tile", "e => e.map(x => x.getBoundingClientRect())")
            assert all(t["width"] >= 320 and t["right"] <= 390 for t in tops) and len(set(round(t["left"]) for t in tops)) == 1, tops
            tb = ph.eval_on_selector_all("#wk-tabs [data-tab]", "e => e.map(x => { const r = x.getBoundingClientRect(); return [r.right, x.scrollWidth <= x.clientWidth + 1]; })")
            assert all(r <= 390 for r, _ in tb), tb
            sz = ph.evaluate(SIZES); assert not sz["small"] and not sz["body"], sz
            ph.screenshot(path=str(SHOTS / "work-v2-phone.png"))
            ph.context.close(); pg.context.close(); b.close()
        assert not errors, errors
        print("e2e_work_v2 ok")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
