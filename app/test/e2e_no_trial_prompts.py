"""No Premium or trial prompts while payments are closed (feat/flow-ease, app/ui/premium.js `TribePremium.offered()`).

The owner's rule: until payments are turned on (TRIBE_PAYMENTS=1 or the host's setting), nothing in the app puts Premium
or a "14-day free trial" in front of anyone. This walks the main places and reads what is on screen.

A. No tribe (a fresh browser, plain files): Home, a first version, the dashboard, App Creator, the website designer,
   Publish, the AI card ("This one needs an AI"), Flint's page, Settings (every tab), Work and its templates, the card
   picker. Flint is asked "how much does it cost", "start my trial", "upgrade", "buy credits", "what is premium",
   "see the plans": one honest line (everything is free right now), no pop-up.
B. A tribe on a server (the default: payments closed): the same places, the 4th project starts with no sheet, a 402
   opens nothing, the files "More AI" link goes to connecting an AI. A tribe that already has a trial shows nothing either.
C. The host opens payments: the Plan row, the chip, the credits button and the plans pop-out are back.
Usage: python app/test/e2e_no_trial_prompts.py
"""
import functools, http.server, json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
WEB = 5897 + OFF; PORT = 5898 + OFF; BASE = f"http://localhost:{PORT}"
errors = []

# What must not be on screen. Words about the person's OWN app (a paywall screen they design, a "free trial line" in
# their store listing) live inside the creators' catalogs and are not prompts; ALLOW names those places.
SCAN = r"""(() => {
  const BAD = /\bpremium\b|\btrial\b|14[- ]day|get credits|see plans|free plan\b|paid plans?\b|\bupgrade to\b/i;
  const ALLOW = '.apc-kits, .apc-kit, [data-kit], .lch, #lch, .lk-, .wdz-canvas, iframe, .apc-phone, .apc-screen, .fl-msg, .mk-card, #mk, .tl-card';
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.children.length || !BAD.test(e.textContent || '')) continue;
    if (e.closest(ALLOW)) continue;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    out.push((e.id ? '#' + e.id + ' ' : '') + (e.className && e.className.baseVal === undefined ? '.' + String(e.className).split(' ')[0] + ' ' : '') + (e.textContent || '').trim().slice(0, 90));
  }
  if (document.querySelector('#pm-sheet, #plans-pop, .plan-chip, #pm-foot, .dt-prem, [data-boost="credits"], [data-pm-try], [data-plp-try]')) out.push('a Premium element is in the page');
  return out;
})()"""


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def until(pg, js, timeout=25, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what or js}")

def clean(pg, where):
    time.sleep(0.5); bad = pg.evaluate(SCAN)
    assert not bad, (where, bad)

def static_server():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", WEB), functools.partial(H, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

ASKS = ["how much does it cost", "start my trial", "upgrade", "buy credits", "what is premium", "see the plans", "is tribecode free"]

def flint(pg, q):
    n = pg.evaluate("TribeFlint.thread().length"); pg.evaluate("q => { TribeFlint.ask(q); }", q)
    until(pg, f"(() => {{ const t = TribeFlint.thread(); const m = t[t.length - 1]; return t.length >= {n} + 2 && m && m.role !== 'me' && m.who !== 'me' && !m.streaming && !!m.text; }})()", 20, "Flint answered: " + q)
    return pg.evaluate("TribeFlint.thread().slice(-1)[0].text")

def ask_flint(pg, where):
    """Each money question gets the one honest line and no pop-up."""
    for q in ASKS:
        r = flint(pg, q)
        assert r and "free right now" in r and "no trial to start" in r, (where, q, r)
        assert pg.locator("#pm-sheet, #plans-pop, #fls-card, .fls-card").count() == 0, (where, q, "no pop-up, no lesson card")

def places(pg, where, pid=None):
    """The main places, one after another; each must be free of Premium and trial words."""
    clean(pg, where + ": where it starts")
    pg.evaluate("TribeSettings.open('ai')"); time.sleep(0.8)
    tabs = pg.evaluate("TribeSettings.tabs().map(t => t.id)")
    for t in tabs:
        pg.evaluate("t => TribeSettings.open(t)", t); clean(pg, f"{where}: Settings › {t}")
    assert pg.locator("#set-plan-chip").count() == 0, (where, "no Plan row in Settings")
    pg.evaluate("TribeSettings.close()"); time.sleep(0.3)
    pg.evaluate("TribeTalent.open('templates')"); pg.wait_for_selector(".dt-card[data-tpl='retro']", timeout=15000); clean(pg, where + ": Work › Templates")
    assert pg.locator(".dt-card[data-tpl='board-meeting']").count() == 0, (where, "no Premium templates listed")
    pg.evaluate("TribeTalent.open('gigs')"); clean(pg, where + ": Work")
    pg.evaluate("TribeApp.show('home')"); time.sleep(0.4)
    pg.evaluate("TribeFlintPage.open()"); pg.wait_for_selector(".fpg-levels", timeout=10000); clean(pg, where + ": Flint's page")
    assert pg.locator(".fpg-lv[data-lv=credits]").count() == 0 and pg.locator(".fpg-lesson[data-lesson=premium]").count() == 0, (where, "no credits level, no Premium lesson")
    pg.evaluate("TribeFlintPage.close()"); time.sleep(0.3)
    # the AI card: two ways (your own AI, a free chat), no credits button
    pg.evaluate("(() => { const d = document.createElement('div'); d.id = 'ntp-boost'; d.style.cssText = 'position:fixed;top:90px;left:380px;z-index:50'; d.innerHTML = TribeBoost.html({ ask: 'write a sonnet' }); document.body.append(d); })()")
    assert "Use my AI" in pg.inner_text("#ntp-boost"); clean(pg, where + ": the AI card"); pg.evaluate("document.querySelector('#ntp-boost').remove()")
    pg.evaluate("TribeBrain.open()"); clean(pg, where + ": Flint's brain"); pg.evaluate("TribeBrain.close()"); time.sleep(0.3)
    if pg.evaluate("!!(window.TribeWidgets && TribeWidgets.openPicker && document.querySelector('#wg-cards, #wg-home, .wg'))"):
        pg.evaluate("TribeWidgets.openPicker()"); time.sleep(0.6); clean(pg, where + ": the card picker")
        assert pg.locator("#wg-picker [data-wcard='credits']").count() == 0, (where, "no Plan & credits card to add")
        pg.evaluate("TribeWidgets.closePop && TribeWidgets.closePop()")
    pg.evaluate("p => TribePublish.open(p || undefined)", pid); time.sleep(1.2); clean(pg, where + ": Publish"); pg.keyboard.press("Escape"); time.sleep(0.3)
    pg.evaluate("TribeInvite.open({ who: 'claude' })"); time.sleep(1.0); clean(pg, where + ": invite an AI"); pg.evaluate("TribeInvite.close()")
    pg.evaluate("TribeInvite.open({ who: 'friend' })"); time.sleep(1.0); clean(pg, where + ": invite a friend"); pg.evaluate("TribeInvite.close()")
    # nothing opens when asked to, and every gate says go ahead
    pg.evaluate("TribePremium.open(); TribePlans.open(null); window.dispatchEvent(new CustomEvent('tribe-402', { detail: { need: 'credits' } }))"); time.sleep(0.3)
    assert pg.locator("#pm-sheet, #plans-pop").count() == 0, (where, "nothing to open")
    for f, n in (("projects", 9), ("seats", 9), ("template", 0), ("cloud", 0), ("credits", 0)):
        assert pg.evaluate("([f, n]) => TribePremium.gate(f, { count: n })", [f, n]) is True, (where, f)
    assert pg.evaluate("TribePremium.footHtml()") == "" and pg.evaluate("TribePlans.chip({ id: 'x' })") == ""
    ask_flint(pg, where)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ntp-", dir="/tmp"))
    static_server()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    env.pop("TRIBE_PAYMENTS", None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- A. no tribe: a fresh browser on plain files ----------
            pg = b.new_page(viewport={"width": 1280, "height": 820}); pg.on("pageerror", lambda e: errors.append(f"web: {e}"))
            pg.goto(f"http://localhost:{WEB}/"); pg.wait_for_selector("#hub-idea", timeout=20000); time.sleep(0.8)
            clean(pg, "A: Home, first open")
            pg.fill("#hub-idea", "An app that tracks our habits"); pg.click("#hub-idea-go")
            until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version shows"); clean(pg, "A: the first version")
            pid = pg.evaluate("TribeFirstLook.state().pid")
            pg.click('#fpv [data-fpv="edit"]'); pg.wait_for_selector("#apc-name", timeout=20000); time.sleep(0.8); clean(pg, "A: App Creator")
            pg.evaluate("TribeAppCreator.close()"); time.sleep(0.5)
            pg.evaluate("TribeApp.show('home')"); until(pg, "!!document.querySelector('#pj-overview .db-band')", 20, "the dashboard"); clean(pg, "A: the dashboard")
            pg.evaluate("TribeSiteDesigner.open({})"); pg.wait_for_selector("#wdz-saved", state="attached", timeout=25000); time.sleep(1.2); clean(pg, "A: the website designer")
            pg.evaluate("TribeSiteDesigner.close()"); time.sleep(0.6)
            places(pg, "A (no tribe)", pid)
            pg.close(); print("  A: no tribe: Home, the creators, Settings, Work, Publish, the AI card and Flint say nothing about Premium or a trial")

            # ---------- B. a tribe on a server, payments closed (the default) ----------
            tok = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
            assert ok(api("/premium", token=tok))["payments"]["offered"] is False
            for i in range(3): ok(api("/projects", "POST", {"name": f"Side project {i + 1}"}, token=tok))
            c = b.new_context(viewport={"width": 1440, "height": 900})
            c.add_init_script(f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); }} catch (e) {{}}")
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"tribe: {e}"))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePremium && window.TribeProjects", timeout=20000)
            pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.offered() === false"); time.sleep(1.0)
            places(pg, "B (a tribe, payments closed)")
            pg.evaluate("TribeApp.show('home')"); pg.evaluate("TribeProjects.refresh()"); pg.wait_for_function("TribeProjects.list().length >= 4", timeout=10000)
            pg.evaluate("TribeProjects.openNew(); 0"); pg.wait_for_selector("#tn #tn-name, #np-prompt, #np-idea", state="visible", timeout=8000)
            assert pg.locator("#pm-sheet").count() == 0, "the 5th project starts with no sheet"; clean(pg, "B: a new project"); pg.keyboard.press("Escape"); time.sleep(0.3)
            # a tribe that already started a trial: it keeps it, and still nothing shows
            ok(api("/premium", "PUT", {"plan": "trial"}, token=tok)); pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.plan().plan === 'trial'")
            pg.evaluate("TribeSettings.open('ai')"); time.sleep(0.8); clean(pg, "B: Settings with a trial already running"); pg.evaluate("TribeSettings.close()")
            pg.evaluate("TribeTalent.open('gigs')"); clean(pg, "B: Work with a trial already running"); pg.evaluate("TribeApp.show('home')")
            ok(api("/premium", "PUT", {"plan": "free"}, token=tok))
            print("  B: a tribe with payments closed: the same places are clean, the next project just starts, an old trial shows nothing")

            # ---------- C. the host opens payments: it all comes back ----------
            ok(api("/premium/admin", "PUT", {"enabled": True}, token=tok), "the host opens payments (TRIBE_PAYMENTS=1 does the same)")
            pg.evaluate("TribePremium.sync()"); pg.wait_for_function("TribePremium.offered() === true && TribePremium.plan().plan === 'free'")
            pg.evaluate("TribeSettings.open('ai')"); pg.wait_for_selector("#set-plan-chip", timeout=10000); pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop [data-plp-try]", timeout=10000)
            assert "Try Premium free for 14 days" in pg.inner_text("#plans-pop"); pg.keyboard.press("Escape"); pg.wait_for_selector("#plans-pop", state="detached"); pg.evaluate("TribeSettings.close()")
            assert "Get credits / Premium" in pg.evaluate("TribeBoost.html({})") and "What does Premium add?" in pg.evaluate("TribePremium.footHtml()")
            r = flint(pg, "how much does it cost"); assert "plans are open" in r, r
            pg.wait_for_selector("#plans-pop", timeout=8000); pg.keyboard.press("Escape")
            pg.evaluate("window.__g = TribePremium.gate('seats', { count: 6 }); 0"); pg.wait_for_selector("#pm-sheet[data-feature='seats'] [data-pm-try]", timeout=8000); pg.keyboard.press("Escape")
            print("  C: payments opened: the Plan row, the plans pop-out with its trial button, the credits button and the sheets are back")
            b.close()
        assert not errors, errors
        print("e2e_no_trial_prompts: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
