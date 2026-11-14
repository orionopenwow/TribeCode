"""Help next (docs/HELP-NEXT.md): the slim ? menu (six entries by intent), the Help center (search, six goal paths at
three depths, the old menu's tours and set-up), one next-step engine used by the menu, the dashboard, the header chip
and Flint, the shared empty state, and the gentle stuck nudge with its switch. Desktop and a 390px phone.
Usage: python app/test/e2e_help_next.py
"""
import os, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4993 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}})) } catch (e) {}"
ST = "{tribe: true, project: {id: 'p', name: 'P', kind: 'site'}, vision: %s, tasks: %s, myTask: null, design: %s, site: %s, built: %s, checked: %s, published: %s, friends: %s, ai: false, company: false}"

def js(b): return "true" if b else "false"
def state(vision=0, tasks=0, design=0, built=0, checked=0, published=0, friends=0):
    return ST % (js(vision), tasks, js(design), js(built), js(built), js(checked), js(published), friends)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-helpnext-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(SEED)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeNextStep && window.TribeGuide", timeout=30000)

            # 1. the ? menu: six entries by intent, the first one is the main one
            pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help=next]")
            assert pg.evaluate("[...document.querySelectorAll('#help-menu .hm-sec [data-help]')].map(b => b.dataset.help).join()") == "next,learn,flint,wrong,keys,new"
            assert pg.locator("#help-menu .hm-primary").get_attribute("data-help") == "next"
            pg.screenshot(path=str(SHOTS / "help-next-menu.png"))
            pg.keyboard.press("Tab"); pg.keyboard.press("Enter") if pg.evaluate("document.activeElement && document.activeElement.dataset.help === 'next'") else pg.click("#help-menu [data-help=next]")

            # 2. the next-step sheet: one best step with a reason, up to two others, Not now, Esc closes
            pg.wait_for_selector("#ns-sheet .ns-best h4")
            first = pg.text_content("#ns-sheet .ns-best h4")
            assert first and pg.text_content("#ns-sheet .ns-best p"), "a step and why"
            assert pg.locator("#ns-sheet .ns-best [data-ns-run]").count() == 1 and pg.locator("#ns-sheet .nx-row").count() <= 2
            assert pg.locator("#ns-sheet .ns-strip li").count() == 6 and pg.locator("#ns-sheet .ns-ask").count() == 5
            pg.screenshot(path=str(SHOTS / "help-next-sheet.png"))
            if pg.locator("#ns-sheet [data-ns-not]").count():
                pg.click("#ns-sheet [data-ns-not]"); pg.wait_for_function("document.querySelector('#ns-sheet .ns-best h4').textContent !== %r" % first)
            pg.keyboard.press("Escape"); pg.wait_for_selector("#ns-sheet", state="detached")

            # 3. the engine is pure: the step moves as the project moves from idea to published and shared
            pick = lambda s: pg.evaluate("(() => { const n = TribeNextStep.pick(%s); return [n.best.id, n.stage, n.alts.length, n.done]; })()" % s)
            assert pick("{tribe: false, project: null}")[0] == "start"
            assert pick(state())[:2] == ["vision", "idea"]
            assert pick(state(vision=1))[0] == "task"
            assert pick(state(vision=1, tasks=1))[:2] == ["design", "design"]
            assert pick(state(vision=1, tasks=1, design=1))[:2] == ["build", "build"]
            assert pick(state(vision=1, tasks=1, design=1, built=1))[:2] == ["check", "check"]
            assert pick(state(vision=1, tasks=1, design=1, built=1, checked=1))[:2] == ["publish", "publish"]
            assert pick(state(vision=1, tasks=1, design=1, built=1, checked=1, published=1))[:2] == ["share", "share"]
            done = pick(state(vision=1, tasks=1, design=1, built=1, checked=1, published=1, friends=1)); assert done[3] is True and done[0] == "keepgoing", done
            assert pick(state())[2] <= 2
            assert pg.evaluate("TribeNextStep.pick(%s, ['vision']).best.id" % state()) == "task", "Not now moves to the next one"
            # feat/publish-real: TribePublish.status(pid).next steers the publishing steps (works before that branch merges)
            base = "{tribe: true, project: {id: 'p', name: 'P'}, vision: true, tasks: 1, design: true, site: true, built: true, checked: true, friends: 1, pubNext: %r, published: %s}"
            assert pg.evaluate("TribeNextStep.pick(%s).best.title" % (base % ("fix", "false"))) == "Fix what the safety check found"
            assert pg.evaluate("TribeNextStep.pick(%s).best.id" % (base % ("pages", "true"))) == "pages"
            assert pg.evaluate("(() => { const n = TribeNextStep.pick(%s); return [n.best.id, ...n.alts.map(a => a.id)].includes('app'); })()" % (base % ("app", "true")))
            # real state: saying what you are making moves the live answer off 'vision'
            pid = pg.evaluate("TribeClient.project()")
            if pid:
                before = pg.evaluate("TribeNextStep.next().then(n => n.best.id)")
                assert before in ("vision", "task", "design", "build", "check", "publish", "share", "mytask"), before

            # 4. Flint answers from the same engine
            r = pg.evaluate("TribeNextStep.flint('what should I do next?')"); assert r and "**" in r["text"] and any(a[1] == "nextstep" for a in r["acts"]), r   # always the engine: one voice
            assert pg.evaluate("TribeNextStep.flint('what next')") and pg.evaluate("TribeNextStep.pick({tribe: true, project: {id: 'p', name: 'P'}, vision: true, tasks: 2, myTask: {id: 't', title: 'Fix the menu'}}).best.id") == "mytask", "your own open task is the engine's top step"
            assert pg.locator(".rc-card").count() == 0, "one card: no second Recommended next"
            r = pg.evaluate("TribeNextStep.flint(\"I'm stuck\")"); assert r and "**" in r["text"] and r["acts"][0][1] == "nextstep", r
            r = pg.evaluate("TribeNextStep.flint('inspire me')"); assert r and "Website" in r["text"] and "Game" in r["text"], r
            r = pg.evaluate("TribeNextStep.flint('what can I make')"); assert r and len(r["acts"]) >= 3
            r = pg.evaluate("TribeNextStep.flint('how do I ship this')"); assert r and r["acts"], r
            assert pg.evaluate("TribeNextStep.flint('rename the project to Zed')") is None, "other phrases are left alone"
            n0 = pg.evaluate("TribeFlint.thread().length"); pg.evaluate("TribeFlint.ask(\"I'm stuck\")")
            pg.wait_for_function("TribeFlint.thread().length >= %d && TribeFlint.thread().slice(-1)[0].who !== 'me' && (TribeFlint.thread().slice(-1)[0].acts || []).some(a => a.act === 'nextstep')" % (n0 + 2), timeout=15000)
            assert len(pg.evaluate("TribeNextStep.prompts('canvas')")) == 5 and len(pg.evaluate("TribeNextStep.prompts('nowhere')")) == 5
            assert all(len(pg.evaluate("TribeNextStep.ideas(%r)" % k)) >= 5 for k in ["website", "game", "app"])

            # 5. the Help center: search first, six paths, the old menu's entries, and a path at three depths
            pg.click("#tb-help"); pg.click("#help-menu [data-help=learn]"); pg.wait_for_selector("#guide .gd-paths .gd-path")
            assert pg.locator("#guide .gd-paths .gd-path").count() == 6
            assert pg.evaluate("location.hash") == "#/guide/home"
            for k in ["tour", "watch", "flintrun", "demo", "start", "claude", "phones", "review", "docs", "gh"]: assert pg.locator(f"#guide [data-help={k}]").count() == 1, k
            assert pg.locator("#guide .gd-item").count() == pg.evaluate("fetch('/api/guide').then(r => r.json()).then(j => j.pages.length)"), "the numbered pages are still listed"
            pg.screenshot(path=str(SHOTS / "help-next-center.png"))
            pg.click("#guide .gd-path[data-gdp=game]"); pg.wait_for_selector("#guide .gd-journey li")
            assert pg.locator("#guide .gd-journey li").count() == 6 and pg.locator("#guide .gd-level").count() == 3
            assert pg.locator("#guide [data-gd-show]").count() == 1
            assert "starter" in pg.text_content("#guide .gd-deep").lower()
            pg.click("#guide .gd-level[data-gdl=practice]"); pg.wait_for_selector("#guide .gd-deep[data-level=practice]")
            pg.click("#guide .gd-level[data-gdl=production]"); pg.wait_for_selector("#guide .gd-deep[data-level=production]")
            txt = pg.text_content("#guide .gd-deep"); assert "Store submission" in txt and "Asset budgets" in txt and "Accessibility" in txt, txt[:200]
            assert "itch.io" in txt and "Google Play" in txt and "TestFlight" in txt and "Mac" in txt, "real destinations and store checklists"
            had = pg.evaluate("!!window.TribePublishReal"); pg.evaluate("window.TribePublishReal = window.TribePublishReal || {}; TribeGuide.path('game')")
            pg.wait_for_function("document.querySelector('#guide .gd-journey').textContent.includes('itch.io')")
            if not had: pg.evaluate("delete window.TribePublishReal")
            pg.evaluate("TribeGuide.path('game', 'production')"); pg.wait_for_selector("#guide .gd-deep[data-level=production]")
            assert pg.evaluate("location.hash") == "#/guide/path/game/production"
            pg.screenshot(path=str(SHOTS / "help-next-path.png"))
            paths = pg.evaluate("fetch('/api/guide').then(r => r.json()).then(j => j.paths)")
            assert len(paths) == 18 and all(len(x["body"].split()) < 480 for x in paths), "18 path pages, each under 480 words"
            for pid_ in pg.evaluate("TribeGuide.paths().map(p => p.id)"):
                for lv in ["basics", "practice", "production"]: assert any(x["slug"] == f"{pid_}-{lv}" for x in paths), (pid_, lv)
            pg.fill("#gd-q", "store submission"); pg.wait_for_selector("#guide .gd-nav[data-gdl=production]")
            pg.fill("#gd-q", ""); pg.wait_for_selector("#guide .gd-nav[data-gdh]")
            pg.click("#guide .gd-level[data-gdl=basics]"); pg.click("#guide [data-gd-run=publish]")   # Do it leaves the guide and runs the step
            pg.wait_for_function("!TribeGuide.isOpen()")
            pg.keyboard.press("Escape"); time.sleep(0.3)
            pg.evaluate("document.querySelectorAll('.modal:not(.hidden) [data-close], .pb-x, .nx-x').forEach(b => b.click())")
            pg.evaluate("TribeGuide.path('website')"); pg.wait_for_selector("#guide .gd-journey li")
            pg.keyboard.press("Escape"); pg.wait_for_function("!TribeGuide.isOpen()")

            # 6. the shared empty state: title, one line, one action that opens the sheet
            pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<div id=\"t-emp\" style=\"position:fixed;left:20px;bottom:20px;z-index:99\">' + TribeNextStep.empty({title: 'Nothing here yet', line: 'Start with one small thing.', act: 'What should I do next?'}) + '</div>')")
            pg.click("#t-emp [data-ns-emp]"); pg.wait_for_selector("#ns-sheet .ns-best"); pg.keyboard.press("Escape"); pg.wait_for_selector("#ns-sheet", state="detached")

            # against the real modules (uikit.js and publishreal.js are on this branch now): the engine is TribeUI's provider, a
            # shared empty state drawn by TribeUI gets its action from it, and the engine reads the real publish status
            r = pg.evaluate("""(async () => { const d = document.createElement('div'); d.id = 't-emp2'; document.body.appendChild(d); TribeUI.empty(d, { title: 'No tasks yet', line: 'Add the first one.', kind: 'tasks' });
              const b = d.querySelector('[data-ui-empty="act"]'); const st = await TribePublish.status(TribeClient.project && TribeClient.project());
              const out = [TribeUI.emptyAction === TribeNextStep.emptyAction, !!b && b.textContent.trim().length > 0, !!window.TribePublishReal, !!st && typeof st.next === 'string', !!document.querySelector('#t-emp .ui-empty')]; d.remove(); return out; })()""")
            assert r == [True, True, True, True, True], r
            # one pattern: when TribeUI (uikit.js) is there, this engine is its emptyAction provider and empty() is an alias
            r = pg.evaluate("(() => { const had = window.TribeUI; window.TribeUI = window.TribeUI || { emptyAction: null }; TribeNextStep._provide(); const a = TribeUI.emptyAction('tasks', null), b = TribeUI.emptyAction('', null); const out = [typeof a.run, a.label, typeof b.run, !!b.label]; if (!had) delete window.TribeUI; return out; })()")
            assert r == ["function", "New task", "function", True], r
            # 7. stuck, gently: the same failure twice offers the step once; it can be closed; the switch turns it off
            pg.evaluate("window.__nsNudgeTest = true; TribeNextStep._failed('Could not save'); TribeNextStep._failed('Could not save')")
            pg.wait_for_selector("#ns-nudge"); pg.screenshot(path=str(SHOTS / "help-next-nudge.png"))
            pg.click("#ns-nudge [data-ns-show]"); pg.wait_for_selector("#ns-sheet .ns-best")
            assert pg.locator("#ns-sheet [data-ns-nudge]").is_checked()
            pg.uncheck("#ns-sheet [data-ns-nudge]"); assert pg.evaluate("TribeNextStep.nudges()") is False
            pg.keyboard.press("Escape")
            pg.evaluate("TribeNextStep._failed('x'); TribeNextStep._failed('x')"); time.sleep(0.3)
            assert pg.locator("#ns-nudge").count() == 0, "offered once per visit"

            # idle on an empty screen (a fresh visit): one offer, then the switch off means none
            pg2 = b.new_page(viewport={"width": 1440, "height": 900}); pg2.on("pageerror", lambda e: errors.append(str(e)))
            pg2.add_init_script(SEED); pg2.add_init_script("window.__nsNudgeTest = true; window.__nsIdleMs = 400; try { localStorage.removeItem('tribecode.next.nudges') } catch (e) {}")
            pg2.goto(BASE + "/?skipIntro=1"); pg2.wait_for_function("window.TribeNextStep && document.body", timeout=30000); time.sleep(1)
            pg2.evaluate("TribeNextStep.nudges(true); document.body.insertAdjacentHTML('beforeend', '<div style=\"position:fixed;left:20px;bottom:20px;z-index:99\">' + TribeNextStep.empty({title: 'Nothing here yet', line: 'Start with one small thing.', act: 'Next'}) + '</div>')")
            pg2.keyboard.press("Shift"); pg2.wait_for_selector("#ns-nudge", timeout=8000)
            pg2.click("#ns-nudge .nx-x"); pg2.wait_for_selector("#ns-nudge", state="detached"); pg2.close()

            # 8. the dashboard: a Next chip in the project header opens the same sheet
            pg.evaluate("TribeApp && TribeApp.go ? TribeApp.go('home') : (location.hash = '')"); time.sleep(1.2)
            pg.evaluate("const e = document.getElementById('t-emp'); e && e.remove(); TribeNextStep.mount()")
            if pg.locator("#ns-chip").count():
                pg.click("#ns-chip"); pg.wait_for_selector("#ns-sheet .ns-best"); pg.keyboard.press("Escape")
            if pg.locator("#ns-card").count(): assert pg.locator("#ns-card [data-ns-run]").count() >= 1
            pg.screenshot(path=str(SHOTS / "help-next-dashboard.png"))

            # 9. another language: the menu and the sheet are translated
            pg.evaluate("TribeI18n.set('es')"); pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help=next]"); time.sleep(0.3)
            assert "¿Qué hago ahora?" in pg.text_content("#help-menu [data-help=next]")
            pg.click("#help-menu [data-help=learn]"); pg.wait_for_selector("#guide .gd-paths .gd-path")
            assert "Hacer un juego" in pg.text_content("#guide .gd-paths")
            assert pg.evaluate("TribeI18n.t('', 'what can I make')") == "qué puedo hacer" and pg.evaluate("TribeI18n.t('', 'A shared shopping list')") == "Una lista de la compra compartida", "prompt chips and ideas are translated"
            pg.keyboard.press("Escape"); pg.evaluate("TribeI18n.set('en')")

            # 10. a 390px phone: the Help center and a path fit with no sideways scroll; the sheet opens
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(SEED)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeGuide && window.TribeNextStep && window.TribeMD", timeout=30000); time.sleep(1)
            ph.evaluate("TribeGuide.home()"); ph.wait_for_selector("#guide .gd-paths .gd-path")
            assert ph.evaluate("document.querySelector('#gd-read').scrollWidth <= document.querySelector('#gd-read').clientWidth + 1"), "no sideways scroll"
            ph.screenshot(path=str(SHOTS / "help-next-center-390.png"))
            ph.evaluate("TribeGuide.path('app', 'production')"); ph.wait_for_selector("#guide .gd-deep[data-level=production]")
            assert ph.evaluate("document.querySelector('#gd-read').scrollWidth <= document.querySelector('#gd-read').clientWidth + 1")
            assert ph.evaluate("[...document.querySelectorAll('#guide .gd-level')].every(b => b.getBoundingClientRect().height >= 44)"), "44px tabs"
            ph.screenshot(path=str(SHOTS / "help-next-path-390.png"))
            ph.evaluate("TribeGuide.close(); TribeNextStep.open()"); ph.wait_for_selector("#ns-sheet .ns-best")
            assert ph.evaluate("(() => { const r = document.querySelector('#ns-sheet').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()")
            ph.screenshot(path=str(SHOTS / "help-next-sheet-390.png"))
            b.close()
        errors = [e for e in errors if "ResizeObserver" not in e]
        assert not errors, errors
        print("e2e_help_next: OK (slim ? menu, next-step sheet and engine, Flint, Help center paths at three depths, search, empty state, nudge, i18n, 390px)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()

if __name__ == "__main__":
    main()
