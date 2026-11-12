"""Premium gates (feat/work-company: app/ui/premium.js, docs/PREMIUM.md). Calm, honest, never in the way.
  1. Starting a 4th project shows the sheet (Free forever / Premium adds / do-it-yourself links / "Not now" first);
     "Not now" continues to the new-project sheet, and the next time it stays quiet (snoozed). The server never limits.
  2. A premium template shows the sheet; "Not now" just closes; every everyday template opens with no sheet.
     "Try Premium free for 14 days" sets a local trial (no payments: checkout() is a stub that says so) and opens it.
  3. Seats: under the line nothing shows; over it the sheet shows and Esc continues.
  4. No tribe: templates and local files work, no sheet; Work's footer says "Free plan".
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
            fr.evaluate("TribeTalent.open()"); fr.wait_for_selector("#pm-foot"); assert "Free plan" in fr.inner_text("#pm-foot")
            fr.click(".dt-card[data-tpl='okrs']"); fr.wait_for_selector("#dt-q"); assert fr.locator("#pm-sheet").count() == 0
            assert fr.evaluate("TribeLocalFiles.create('doc', { title: 'Local note', body: 'hi' }).then(d => !!d.id)")
            assert fr.evaluate("TribePremium.gate('projects', { count: 2 })") is True and fr.locator("#pm-sheet").count() == 0
            fr.click("[data-pm-open]"); fr.wait_for_selector("#pm-sheet[data-feature='overview']"); fr.click("[data-pm-notnow]"); fr.wait_for_selector("#pm-sheet", state="detached")
            fr.context.close()

            # ---------- the tribe with 3 projects ----------
            boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok = boot["token"]
            pg = page("Orion", tok); pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribePremium && window.TribeProjects", timeout=15000)
            n = len(ok(api("/projects", token=tok))["projects"])
            for i in range(max(0, 3 - n)): ok(api("/projects", "POST", {"name": f"Side project {i + 1}"}, token=tok))
            pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length === 3", timeout=10000)

            # ---------- 1. the 4th project ----------
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#pm-sheet[data-feature='projects']", timeout=8000)
            sh = pg.text_content("#pm-sheet"); assert "Free forever" in sh and "Premium adds" in sh and "Not now" in sh and "Tailscale" in sh, sh
            assert pg.locator("#pm-sheet a[target='_blank'][rel~='noopener']").count() >= 2
            assert pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-pm-notnow')"), "Not now has focus"
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "premium-sheet.png"))
            pg.click("[data-pm-notnow]"); pg.wait_for_selector("#pm-sheet", state="detached")
            pg.wait_for_selector("#np-prompt, #np-idea", state="visible", timeout=8000)   # the new-project sheet goes on
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            p4 = ok(api("/projects", "POST", {"name": "Fourth"}, token=tok), "the server never limits projects")
            pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length === 4", timeout=10000)
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#np-prompt, #np-idea", state="visible", timeout=8000)
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
