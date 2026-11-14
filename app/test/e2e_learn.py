"""Learn (docs/LEARN-ASSESSMENT.md): quick guides, one learning place, progress, and Flint as the guide.
Checks the one data file (templates/quickguides.json) is what the app bundle, the server, Flint's knowledge base and
the website all serve; that the cards search, do the thing ("Do it for me") and point at the real control ("Show me");
that the ? menu, Ctrl K, empty states, the next-step sheet and Flint all reach them; that progress persists and is not
re-taught; that the Academy's lessons open from Learn; that a card hides when its part of the app is missing; and that
the Learn home and a card fit a 390px phone. Saves screenshots to docs/screenshots/learn-*.png.
Usage: python app/test/e2e_learn.py
"""
import functools, http.server, json, os, re, signal, subprocess, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4997 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
SITE_PORT = PORT + 1
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}})) } catch (e) {}"
RUNNERS = {"next", "help", "go", "settings", "call", "click", "ask", "path"}


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def data_checks():
    src = json.loads((ROOT / "templates" / "quickguides.json").read_text(encoding="utf8"))
    gs = src["guides"]; ids = [g["id"] for g in gs]
    assert len(gs) >= 40 and len(set(ids)) == len(ids), len(gs)
    groups = {g[0] for g in src["groups"]}
    for g in gs:
        n = len((g["title"] + " " + g["intro"] + " " + " ".join(g["steps"])).split())
        assert 3 <= len(g["steps"]) <= 5, g["id"]
        assert 50 <= n <= 120, (g["id"], n)
        assert g["group"] in groups and g["do"].split(":")[0] in RUNNERS and g.get("show"), g["id"]
        assert "lesson" in g["show"] or ("sel" in g["show"] and "say" in g["show"]), g["id"]
        assert not re.search(r"\b(repo|sync|host|ship|real tribe)\b", (g["title"] + " " + g["intro"] + " " + " ".join(g["steps"])).lower()), g["id"]   # plain words only
    for must in ["invite-friend", "bring-ai", "make-site", "publish", "back-up", "undo", "older-version", "android-app", "start-call", "share-screen", "add-task", "vote", "set-roles", "language", "cant-connect"]:
        assert must in ids, must
    bundle = json.loads((ROOT / "app" / "ui" / "guide-pages.json").read_text(encoding="utf8"))
    assert bundle["quick"]["guides"] == gs, "the app bundle carries the same cards (node scripts/dev/app-bundle.js)"
    site = json.loads((ROOT / "site" / "quick-guides.json").read_text(encoding="utf8"))
    assert [g["id"] for g in site["guides"]] == ids and all("{" not in s for g in site["guides"] for s in g["steps"]), "the website reads the same cards (node scripts/dev/site-quick.js)"
    return src


def main():
    src = data_checks(); N = len(src["guides"])
    tmp = Path(tempfile.mkdtemp(prefix="tribe-learn-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    web = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), functools.partial(Q, directory=str(ROOT / "site")))
    threading.Thread(target=web.serve_forever, daemon=True).start()
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        assert json.loads(urllib.request.urlopen(BASE + "/api/guide", timeout=5).read())["quick"]["guides"] == src["guides"], "the server hands out the same cards"
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(SEED)
            ready = "window.TribeClient && TribeClient.connected() && window.TribeQuick && window.TribeLearn && window.TribeGuide && window.TribeFlint && window.TribeUI"
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function(ready, timeout=30000)
            pg.evaluate("TribeQuick.load()"); pg.wait_for_function("TribeQuick.all().length > 30")
            shown = pg.evaluate("TribeQuick.all().length"); assert 38 <= shown <= N, shown

            # 1. the ? menu has Quick guides; the list searches; a card has steps, Do it and Show me
            pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help=quick]")
            pg.click("#help-menu [data-help=quick]"); pg.wait_for_selector("#qg-list .qg-row")
            assert pg.locator("#qg-list .qg-row").count() == shown and pg.locator("#qg-list .qg-g").count() >= 8
            pg.screenshot(path=str(SHOTS / "learn-quick-list-1440.png"))
            pg.fill("#qg-list [data-qg-q]", "back up"); pg.wait_for_function("document.querySelector('#qg-list .qg-row').dataset.qg === 'back-up'")
            pg.fill("#qg-list [data-qg-q]", "zzzqqq"); pg.wait_for_selector("#qg-list .qg-none")
            pg.fill("#qg-list [data-qg-q]", "language"); pg.click("#qg-list .qg-row[data-qg=language]"); pg.wait_for_selector("#qg-card .qg-steps li")
            assert 3 <= pg.locator("#qg-card .qg-steps li").count() <= 5 and pg.locator("#qg-card [data-qg-do]").count() == 1 and pg.locator("#qg-card [data-qg-show]").count() == 1
            assert pg.locator("#qg-list").count() == 0, "one sheet at a time"
            # a {token} is the live name of the Settings tab, never a word the app does not show
            tab = pg.evaluate("TribeSettings.tabs().find(t => t.id === 'profile').label")
            assert tab in pg.text_content("#qg-card .qg-steps") and "{" not in pg.text_content("#qg-card .qg-steps")
            pg.screenshot(path=str(SHOTS / "learn-quick-card-1440.png"))

            # 2. Do it for me does the real thing and marks the card done; Show me rings the real control
            pg.click("#qg-card [data-qg-do]"); pg.wait_for_selector("#set-lang", state="visible")
            assert pg.locator("#qg-card").count() == 0 and pg.evaluate("TribeLearn.done('quick', 'language')")
            pg.evaluate("TribeSettings.close()")
            pg.evaluate("TribeQuick.open('whats-next')"); pg.wait_for_selector("#qg-card [data-qg-show]"); pg.click("#qg-card [data-qg-show]")
            pg.wait_for_selector(".fls-ring"); assert pg.locator(".fls-tip").count() == 1
            pg.evaluate("TribeFlintLessons.unring()")
            pg.evaluate("TribeQuick.show('language')"); pg.wait_for_selector(".fls-ring"); assert pg.locator("#set-lang").is_visible()
            pg.evaluate("TribeFlintLessons.unring(); TribeSettings.close()")
            assert pg.evaluate("TribeLearn.get().quick['whats-next'].seen > 0") and not pg.evaluate("TribeLearn.done('quick', 'whats-next')"), "seen is not done"

            # 3. Ctrl K lists them; an empty state's How it works opens the card for that kind of place
            acts = pg.evaluate("(window.TribePaletteActions || []).flatMap(f => f() || []).filter(x => x.kind === 'Guide' || x.label === 'Quick guides').map(x => x.label)")
            assert "Quick guides" in acts and "Invite a friend" in acts and len(acts) == shown + 1
            pg.keyboard.press("Control+k"); pg.wait_for_selector("#palette:not(.hidden)"); pg.fill("#pal-input", "undo a mistake"); time.sleep(0.4)
            assert "Undo a mistake" in pg.text_content("#pal-list"); pg.keyboard.press("Escape")
            html = pg.evaluate("TribeUI.emptyHTML({ title: 'No tasks yet', line: 'Add one.', kind: 'tasks' })")
            assert 'data-qg="add-task"' in html and "How it works" in html
            assert 'data-qg' not in pg.evaluate("TribeUI.emptyHTML({ title: 'x', line: 'y', kind: 'nothing-like-this' })")
            assert 'data-qg' not in pg.evaluate("TribeUI.emptyHTML({ title: 'x', line: 'y', kind: 'tasks', how: false })")
            pg.evaluate("(() => { const d = document.createElement('div'); d.id = 'emp-t'; d.style.cssText = 'position:fixed;left:8px;top:80px;z-index:99'; document.body.appendChild(d); TribeUI.empty(d, { title: 'No tasks yet', line: 'Add one.', kind: 'tasks', action: { label: 'New task', run() {} } }); })()")
            pg.click("#emp-t [data-ui-empty=how]"); pg.wait_for_selector("#qg-card [data-qg-id=add-task]"); pg.keyboard.press("Escape"); pg.evaluate("document.querySelector('#emp-t').remove()")

            # 4. a card whose part of the app is missing is not listed (nothing is named that the UI does not show)
            assert pg.evaluate("(() => { const h = window.TribeHuddle; window.TribeHuddle = null; const r = [TribeQuick.get('start-call'), TribeQuick.match('how do I start a call')]; window.TribeHuddle = h; return r.every(x => !x) && !!TribeQuick.get('start-call'); })()")

            # 5. Flint: a "how do I" question gets the card inline with Do it and Show me; by name; what to learn next
            def ask(t):
                n = pg.evaluate("TribeFlint.thread().length"); pg.evaluate("t => { TribeFlint.ask(t); }", t)
                pg.wait_for_function("n => { const th = TribeFlint.thread(); return th.length >= n + 2 && th[th.length - 1].who === 'flint' && !th[th.length - 1].streaming; }", arg=n, timeout=20000)
                return pg.evaluate("(() => { const m = TribeFlint.thread().slice(-1)[0]; return { text: m.text, acts: (m.acts || []).map(a => [a.act, a.arg]), quick: m.quick || '' }; })()")
            r = ask("how do i back up everything"); assert r["quick"] == "back-up" and ["quickdo", "back-up"] in r["acts"] and ["quickshow", "back-up"] in r["acts"], r
            assert pg.locator(".qg-inline[data-qg-id=back-up] .qg-steps li").count() >= 3, "the steps are in the reply"
            r = ask("how do I go back to an older version"); assert r["quick"] == "older-version", r
            r = ask("open the guide for voting on an idea"); assert r["quick"] == "vote", r
            r = ask("quick guides"); pg.wait_for_selector("#qg-list"); pg.keyboard.press("Escape")
            r = ask("what should I learn next"); first = r["quick"]; assert first and any(a[0] == "quick" for a in r["acts"]), r
            pg.evaluate("id => TribeLearn.mark('quick', id, 'done')", first)
            pg.evaluate("localStorage.setItem('tribecode.learn', JSON.stringify(Object.assign(TribeLearn.get(), { last: null })))")
            r = ask("what should I learn next"); assert r["quick"] and r["quick"] != first, "what was learned is not taught again"
            r = ask("my progress"); assert " of %d " % shown in r["text"], r
            assert pg.evaluate("TribeQuick.flint('rename the project to Zed')") is None, "other phrases are left alone"
            # the knowledge base answers with the same card
            kb = pg.evaluate("TribeClient.api('/flint/kb?q=' + encodeURIComponent('how do I invite a friend'))")
            assert kb["quick"]["id"] == "invite-friend" and len(kb["quick"]["steps"]) >= 3 and kb["answers"], kb.get("quick")

            # 6. the next-step sheet offers "How do I do this?" until that step was done once
            pg.evaluate("TribeNextStep.open()"); pg.wait_for_selector("#ns-sheet .ns-best")
            step = pg.get_attribute("#ns-sheet .ns-best", "data-ns-step"); gid = pg.evaluate("s => TribeLearn.STEP_GUIDE[s] || ''", step)
            if gid and not pg.evaluate("id => TribeLearn.done('quick', id)", gid):
                assert pg.get_attribute("#ns-sheet .ns-how", "data-qg") == gid
                pg.evaluate("id => TribeLearn.mark('quick', id, 'done')", gid); pg.evaluate("TribeNextStep.open()"); pg.wait_for_selector("#ns-sheet .ns-best")
            assert pg.locator("#ns-sheet .ns-how").count() == 0, "never re-taught"
            assert pg.locator("#ns-sheet .ns-best [data-ns-run]").count() == 1
            pg.keyboard.press("Escape")
            pg.evaluate("document.dispatchEvent(new CustomEvent('tribe:nextstep', { detail: { id: 'publish' } }))")
            assert pg.evaluate("TribeLearn.done('quick', 'publish')"), "doing a project step is learning it"

            # 7. ONE learning place: Learn has My progress, quick guides, the six paths and the skills lessons (the Academy)
            pg.evaluate("TribeGuide.home()"); pg.wait_for_selector("#guide #qg-home .qg-row"); pg.wait_for_selector("#guide #gd-skills .qg-skill")
            assert pg.text_content("#guide .gd-pg-eye").strip() == "Learn"
            assert pg.locator("#guide #qg-prog").count() == 1 and pg.locator("#guide .gd-paths .gd-path").count() == 6
            assert pg.locator("#guide #gd-skills .qg-skill").count() == 10, "every Academy track is reachable from Learn"
            done_n = pg.evaluate("TribeLearn.counts().quick"); assert done_n >= 3 and pg.text_content("#guide #qg-prog .qg-stats b").startswith(str(done_n))
            pg.fill("#guide #qg-home [data-qg-q]", "publish"); pg.wait_for_selector("#guide #qg-home .qg-row[data-qg=publish] .qg-done")
            pg.fill("#guide #qg-home [data-qg-q]", "")
            pg.fill("#gd-q", "invite"); pg.wait_for_selector("#guide .gd-list [data-qg=invite-friend]"); pg.fill("#gd-q", "")
            pg.evaluate("TribeGuide.home()"); pg.wait_for_selector("#guide #gd-skills .qg-skill"); pg.evaluate("document.querySelector('#gd-read').scrollTop = 0")
            pg.screenshot(path=str(SHOTS / "learn-home-1440.png"))
            pg.click("#guide #gd-skills .qg-skill[data-gd-track=growth]"); pg.wait_for_selector("#view-academy", state="visible")
            pg.wait_for_function("document.querySelector('#view-academy') && document.querySelector('#view-academy').textContent.includes('Growth')", timeout=30000); assert not pg.evaluate("TribeGuide.isOpen()") and pg.locator("#view-academy #ac-back").count() == 1

            # 8. progress persists across a reload
            pg.reload(); pg.wait_for_function(ready, timeout=30000); pg.evaluate("TribeQuick.load()"); pg.wait_for_function("TribeQuick.all().length > 30")
            assert pg.evaluate("TribeLearn.done('quick', 'language') && TribeLearn.done('quick', 'publish')") and pg.evaluate("TribeLearn.counts().quick") == done_n
            pg.evaluate("TribeQuick.open()"); pg.wait_for_selector("#qg-list .qg-row[data-qg=language] .qg-done"); pg.keyboard.press("Escape")

            # 9. another language: the chrome and the card titles are translated
            pg.evaluate("TribeI18n.set('es')"); pg.evaluate("TribeQuick.open()"); pg.wait_for_selector("#qg-list .qg-row")
            assert "Guías rápidas" in pg.text_content("#qg-list") and "Invitar a un amigo" in pg.text_content("#qg-list")
            pg.keyboard.press("Escape"); pg.evaluate("TribeI18n.set('en')")

            # 10. a 390px phone: Learn and a card fit, with big enough buttons
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(SEED)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeGuide && window.TribeQuick && window.TribeMD && window.TribeUI", timeout=30000); time.sleep(1)
            ph.evaluate("TribeGuide.home()"); ph.wait_for_selector("#guide #qg-home .qg-row")
            assert ph.evaluate("document.querySelector('#gd-read').scrollWidth <= document.querySelector('#gd-read').clientWidth + 1"), "no sideways scroll"
            assert ph.evaluate("[...document.querySelectorAll('#guide .qg-row')].every(b => b.getBoundingClientRect().height >= 44)")
            ph.screenshot(path=str(SHOTS / "learn-home-390.png"))
            ph.evaluate("TribeGuide.close(); TribeQuick.open('invite-friend')"); ph.wait_for_selector("#qg-card .qg-steps li"); ph.wait_for_timeout(500)
            assert ph.evaluate("(() => { const r = document.querySelector('#qg-card').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })()")
            assert ph.evaluate("[...document.querySelectorAll('#qg-card .qg-foot .btn')].every(b => b.getBoundingClientRect().height >= 36)")
            ph.screenshot(path=str(SHOTS / "learn-quick-card-390.png"))
            ph.close()

            # 11. the website's Learn page shows the same cards and searches them
            st = ctx.new_page(); st.on("pageerror", lambda e: errors.append(str(e)))
            site = f"http://127.0.0.1:{SITE_PORT}/"
            st.route("**/*", lambda r: r.continue_() if r.request.url.startswith(site) else r.abort())
            st.goto(site + "learn.html#quick"); st.wait_for_function("document.documentElement.dataset.quick", timeout=10000)
            assert st.evaluate("document.documentElement.dataset.quick") == str(N) and st.locator("#qk-out .qk-card").count() == N
            st.fill("#qk-q", "roll back"); st.wait_for_function("document.documentElement.dataset.quickShown === '1'")
            assert st.locator("#qk-out .qk-card").get_attribute("data-qk") == "older-version"
            st.click("#qk-out .qk-card summary"); assert st.locator("#qk-out .qk-card ol li").count() >= 3
            st.fill("#qk-q", ""); st.screenshot(path=str(SHOTS / "learn-site-quick-1440.png"))
            st.set_viewport_size({"width": 390, "height": 844}); time.sleep(0.3)
            assert st.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "the site page does not scroll sideways at 390px"
            st.evaluate("document.querySelector('#quick').scrollIntoView()"); st.screenshot(path=str(SHOTS / "learn-site-quick-390.png"))
            b.close()
        errors = [e for e in errors if "ResizeObserver" not in e]
        assert not errors, errors
        print(f"e2e_learn: OK ({N} quick guides in one file for the app, Flint and the site; search, Do it, Show me, Ctrl K, empty states, next-step, Flint cards and learn-next, progress, Academy inside Learn, i18n, 390px)")
    finally:
        web.shutdown()
        try: srv.send_signal(signal.SIGTERM); srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
