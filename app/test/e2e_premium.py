"""Premium gates (feat/work-company: app/ui/premium.js, docs/PREMIUM.md). Calm, honest, never in the way.
  1. Starting a 4th project shows the sheet (Free forever / Premium adds / do-it-yourself links / "Not now" first);
     "Not now" continues to the new-project sheet, and the next time it stays quiet (snoozed). The server never limits.
  2. A premium template shows the sheet; "Not now" just closes; every everyday template opens with no sheet.
     "Try Premium free for 14 days" sets a local trial (no payments: checkout() is a stub that says so) and opens it.
  3. Seats: under the line nothing shows; over it the sheet shows and Esc continues.
  4. No tribe: templates and local files work, no sheet, no footer (payments go through a tribe's host).
  0. Payments closed (the default, feat/flow-ease): none of the above shows. gate() is true, open() does nothing, no footer,
     no Premium templates, no plan row in Settings, no credits button on the AI card. The host opening payments
     (PUT /api/premium/admin { enabled: true }, the same as TRIBE_PAYMENTS=1) brings 1 to 3 back unchanged.
Usage: python app/test/e2e_premium.py   (writes docs/screenshots/premium-sheet.png)"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6270 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-prem-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(name, token=None):
                c = b.new_context(viewport={"width": 1440, "height": 900})
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}{srv_}}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{name} console: {m.text[:200]}"))
                return pg

            # ---------- 4 first: no tribe, nothing gated ----------
            fr = page("Orion"); fr.goto(BASE + "/?skipIntro=1&freshopen=1"); fr.wait_for_function("window.TribePremium && window.TribeTemplates && window.TribeLocalFiles", timeout=15000)
            fr.evaluate("TribeTalent.open('templates')"); fr.wait_for_selector(".dt-card[data-tpl='okrs']"); assert fr.locator("#pm-foot").count() == 0 and fr.locator(".dt-prem").count() == 0, "no tribe: no plan footer, no Premium templates"
            fr.click(".dt-card[data-tpl='okrs']"); fr.wait_for_selector("#dt-q"); assert fr.locator("#pm-sheet").count() == 0
            assert fr.evaluate("TribeLocalFiles.create('doc', { title: 'Local note', body: 'hi' }).then(d => !!d.id)")
            assert fr.evaluate("TribePremium.gate('projects', { count: 2 })") is True and fr.locator("#pm-sheet").count() == 0
            assert fr.evaluate("TribePremium.offered()") is False and fr.evaluate("TribePremium.gate('projects', { count: 9 })") is True and fr.evaluate("TribePremium.gate('credits')") is True
            fr.evaluate("TribePremium.open(); window.TribePlans && TribePlans.open(null)"); fr.wait_for_timeout(300); assert fr.locator("#pm-sheet, #plans-pop").count() == 0, "no tribe: nothing to open"
            fr.context.close()

            # ---------- the tribe with 3 projects ----------
            boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok = boot["token"]
            pg = page("Orion", tok); pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribePremium && window.TribeProjects", timeout=15000)
            n = len(ok(api("/projects", token=tok))["projects"])
            for i in range(max(0, 3 - n)): ok(api("/projects", "POST", {"name": f"Side project {i + 1}"}, token=tok))
            pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length === 3", timeout=10000)

            # ---------- 0. payments closed (the default): nothing mentions Premium or a trial ----------
            WORDS = "/premium|\\btrial\\b|credits|free plan/i"
            vis = "(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && e.children.length === 0 && " + WORDS + ".test(e.textContent || '')).map(e => (e.textContent || '').trim().slice(0, 80)))()"
            pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.offered() === false")
            assert pg.evaluate("TribePremium.gate('projects', { count: 4 })") is True and pg.evaluate("TribePremium.gate('seats', { count: 9 })") is True and pg.evaluate("TribePremium.gate('credits')") is True
            pg.evaluate("TribePremium.open(); TribePlans.open(null); window.dispatchEvent(new CustomEvent('tribe-402', { detail: { need: 'credits' } }))"); pg.wait_for_timeout(300)
            assert pg.locator("#pm-sheet, #plans-pop").count() == 0, "closed: no sheet, no plans pop-out, not even on a 402"
            assert pg.evaluate("TribePremium.footHtml()") == "" and pg.evaluate("TribePlans.chip({ id: 'x' })") == ""
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#tn #tn-name, #np-prompt, #np-idea", state="visible", timeout=8000)
            assert pg.locator("#pm-sheet").count() == 0, "closed: the 4th project just starts"; pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            pg.evaluate("TribeTalent.open('templates')"); pg.wait_for_selector(".dt-card[data-tpl='retro']")
            assert pg.locator(".dt-card[data-tpl='board-meeting'], .dt-prem, #pm-foot").count() == 0, "closed: no Premium templates, no plan footer"
            assert pg.evaluate("TribeTemplates.open('board-meeting')") is False and pg.locator("#pm-sheet").count() == 0
            assert not pg.evaluate(vis), pg.evaluate(vis)
            pg.evaluate("TribeSettings.open('ai')"); pg.wait_for_selector("#set-flintbrain, #set-model, .set-brain"); assert pg.locator("#set-plan-chip").count() == 0, "closed: no Plan row in Settings"
            assert not pg.evaluate(vis), pg.evaluate(vis)
            pg.evaluate("TribeSettings.close && TribeSettings.close()"); pg.keyboard.press("Escape")
            boost = pg.evaluate("TribeBoost.html({})"); assert "Use my AI" in boost and "credits" not in boost.lower() and "Premium" not in boost, boost
            # a tribe that already has a trial keeps it, and still shows nothing
            ok(api("/premium", "PUT", {"plan": "trial"}, token=tok)); pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.plan().plan === 'trial'")
            assert pg.evaluate("TribePremium.footHtml()") == "" and pg.evaluate("TribePlans.chip()") == "" and pg.evaluate("TribePremium.gate('seats', { count: 9 })") is True
            ok(api("/premium", "PUT", {"plan": "free"}, token=tok))
            # the host opens payments: everything below is as it was
            ok(api("/premium/admin", "PUT", {"enabled": True}, token=tok), "the host opens payments"); pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.offered() === true && TribePremium.plan().plan === 'free'")
            assert "Get credits / Premium" in pg.evaluate("TribeBoost.html({})") and "What does Premium add?" in pg.evaluate("TribePremium.footHtml()") and "plan-chip" in pg.evaluate("TribePlans.chip()")

            # ---------- 1. the 4th project ----------
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#pm-sheet[data-feature='projects']", timeout=8000)
            sh = pg.text_content("#pm-sheet"); assert "Free forever" in sh and "Premium adds" in sh and "Not now" in sh and "Tailscale" in sh, sh
            assert pg.locator("#pm-sheet a[target='_blank'][rel~='noopener']").count() >= 2
            assert pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-pm-notnow')"), "Not now has focus"
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "premium-sheet.png"))
            pg.click("[data-pm-notnow]"); pg.wait_for_selector("#pm-sheet", state="detached")
            pg.wait_for_selector("#tn #tn-name, #np-prompt, #np-idea", state="visible", timeout=8000)   # the new-project sheet goes on
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            p4 = ok(api("/projects", "POST", {"name": "Fourth"}, token=tok), "the server never limits projects")
            pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length === 4", timeout=10000)
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#tn #tn-name, #np-prompt, #np-idea", state="visible", timeout=8000)
            assert pg.locator("#pm-sheet").count() == 0, "snoozed for a week after Not now"
            pg.keyboard.press("Escape")

            # ---------- 2. templates ----------
            pg.evaluate("TribeTalent.open('templates')"); pg.wait_for_selector(".dt-card[data-tpl='board-meeting'] .dt-prem")
            pg.click(".dt-card[data-tpl='board-meeting']"); pg.wait_for_selector("#pm-sheet[data-feature='template']")
            assert "Board meeting pack" in pg.inner_text("#pm-sheet h2") and "handbook.gitlab.com" in pg.inner_html("#pm-sheet")
            pg.click("[data-pm-notnow]"); pg.wait_for_selector("#pm-sheet", state="detached"); assert pg.locator("#dt-lib").count() == 1 and pg.locator("[data-tpl-open]").count() == 0
            pg.click(".dt-card[data-tpl='retro']"); pg.wait_for_selector("[data-tpl-open='retro']"); assert pg.locator("#pm-sheet").count() == 0, "everyday templates are free"
            pg.click("#dt-libback"); pg.click(".dt-card[data-tpl='board-meeting']"); pg.wait_for_selector("#pm-sheet[data-feature='template']")
            pg.click("[data-pm-try]"); pg.wait_for_selector("[data-tpl-open='board-meeting']", timeout=8000)
            assert pg.evaluate("TribePremium.plan().plan") == "trial"
            co = pg.evaluate("TribePremium.checkout()"); assert co["ok"] is False and co["reason"] == "no-provider", co
            pg.click("#dt-libback"); pg.click(".dt-card[data-tpl='fundraise']"); pg.wait_for_selector("[data-tpl-open='fundraise']"); assert pg.locator("#pm-sheet").count() == 0, "trial: no sheet"
            pg.evaluate("TribePremium.setPlan('free')")

            # ---------- 3. seats ----------
            assert pg.evaluate("TribePremium.gate('seats', { count: 4 })") is True and pg.locator("#pm-sheet").count() == 0
            pg.evaluate("window.__g = TribePremium.gate('seats', { count: 6 }); 0")
            pg.wait_for_selector("#pm-sheet[data-feature='seats']"); pg.keyboard.press("Escape"); pg.wait_for_selector("#pm-sheet", state="detached")
            assert pg.evaluate("window.__g") is True, "Esc on a soft gate continues"
            pg.evaluate("window.__c = TribePremium.gate('cloud'); 0"); pg.wait_for_selector("#pm-sheet[data-feature='cloud']"); pg.click("[data-pm-notnow]")
            assert pg.evaluate("window.__c") is False, "an extra (hosted cloud) simply closes"
            b.close()
        assert not errors, errors
        print("e2e_premium: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
