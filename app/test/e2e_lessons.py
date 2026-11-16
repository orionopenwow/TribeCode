"""Lessons (app/ui/lessons.js, the "tracks" in templates/quickguides.json).

  Data: five tracks; the two firsts have 8 to 12 steps; every step is short, in plain words, has a Show me and a check
  the app knows; the app bundle, the server and the website carry the same tracks.
  Learn: the page lists the tracks with progress and the next lesson. Starting one puts a card on screen; doing the
  step in the real website designer ticks it (words, look, section, page, phone size, Check, Download) with no
  "Done" pressed. Ticks are kept on the device and with the person on the host (GET|PUT /api/me/learn): cleared on
  the device, they come back.
  App Creator: the card stays usable while the full-screen tool is open; Play ticks its step; a first-timer gets one
  offer, and "no thanks" is remembered.
  Flint with no AI: "teach me to make a website" starts the lesson, "lessons" lists them, "stop the lesson" pauses.
  Suggestions: the learn provider offers "Build it together" once a friend has joined; Apply starts it.
  THE WALK: every quick guide's Show me and every lesson step's Show me must ring a real control. A step another
  branch is still adding (soon) is skipped until its control exists. Any Show me that rings nothing fails the test.
  Phone 390px: the card fits, 40px buttons, no sideways scroll. The website's Learn page lists the lessons.
Usage: python app/test/e2e_lessons.py
"""
import functools, http.server, json, os, re, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5730 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
SITE_PORT = PORT + 1
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}})) } catch (e) {}"
OPENERS = {"sitelib", "site", "design", "app", "phone", "invite", "roles", "changes", "versions", "publish", "suggest", "library", "home"}


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def data_checks():
    src = json.loads((ROOT / "templates" / "quickguides.json").read_text(encoding="utf8"))
    ts = src["tracks"]; ids = [t["id"] for t in ts]
    assert ids == ["first-site", "first-app", "together", "online", "power"], ids
    js = (ROOT / "app" / "ui" / "lessons.js").read_text(encoding="utf8")
    checks = set(re.findall(r"^\s+'([a-z]+\.[a-z]+)': ", js, re.M))
    for t in ts:
        real = [s for s in t["steps"] if not s.get("soon")]
        assert len({s["id"] for s in t["steps"]}) == len(t["steps"]), t["id"]
        if t["id"].startswith("first-"): assert 8 <= len(real) <= 12, (t["id"], len(real))
        else: assert 4 <= len(real) <= 8, (t["id"], len(real))
        assert t["title"] and t["intro"] and t.get("asks"), t["id"]
        for s in t["steps"]:
            words = (s["title"] + " " + s["text"]).lower()
            assert len(s["title"].split()) <= 8 and len(s["text"].split()) <= 30, (t["id"], s["id"])
            assert not re.search(r"\b(repo|repository|sync|host|ship|merge|real tribe)\b", words), (t["id"], s["id"])   # plain words only
            assert s["show"]["open"] in OPENERS and s["show"]["sel"], (t["id"], s["id"])
            c = s.get("check", "")
            assert not c or c.startswith("dom:") or c in checks, (t["id"], s["id"], c)
    bundle = json.loads((ROOT / "app" / "ui" / "guide-pages.json").read_text(encoding="utf8"))
    assert bundle["quick"]["tracks"] == ts, "the app bundle carries the same lessons (node scripts/dev/app-bundle.js)"
    site = json.loads((ROOT / "site" / "quick-guides.json").read_text(encoding="utf8"))
    assert [t["id"] for t in site["tracks"]] == ids and all(len(t["steps"]) >= 4 for t in site["tracks"]), "the website lists the same lessons (node scripts/dev/site-quick.js)"
    return src


def main():
    src = data_checks(); tracks = src["tracks"]
    tmp = Path(tempfile.mkdtemp(prefix="tribe-lessons-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    web = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), functools.partial(Q, directory=str(ROOT / "site")))
    threading.Thread(target=web.serve_forever, daemon=True).start()
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        assert json.loads(urllib.request.urlopen(BASE + "/api/guide", timeout=5).read())["quick"]["tracks"] == tracks, "the server hands out the same lessons"
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(SEED)
            ready = "window.TribeClient && TribeClient.connected() && window.TribeQuick && window.TribeLessons && window.TribeGuide && window.TribeFlint && window.TribeUI && TribeClient.project && TribeClient.project()"
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function(ready, timeout=30000)
            pg.evaluate("TribeQuick.load()"); pg.wait_for_function("TribeLessons.tracks().length === 5")
            step = lambda: pg.evaluate("(TribeLessons.state() || {}).step || ''")
            at = lambda sid: pg.wait_for_function("s => (TribeLessons.state() || {}).step === s", arg=sid, timeout=8000)
            clean = "(() => { try { TribeFlintLessons.unring(); TribeLessons.stop(); if (TribeSiteDesigner.state() && TribeSiteDesigner.state().open) TribeSiteDesigner.close(); if (TribeAppCreator.state() && TribeAppCreator.state().open) TribeAppCreator.close(); if (window.TribeHomescreen && TribeHomescreen.state()) TribeHomescreen.close(); if (window.TribeVersions && TribeVersions.isOpen()) TribeVersions.close(); if (window.TribeQuick) TribeQuick.close(); const m = document.querySelector('#invite-modal'); if (m) m.classList.add('hidden'); document.querySelectorAll('.ui-sheet [data-ui-close], .ui-sheet .ui-x').forEach(x => x.click()); if (window.TribeGuide && TribeGuide.isOpen()) TribeGuide.close(); } catch (e) { return String(e); } return ''; })()"

            # 1. the Learn page lists the lessons with progress and the next one
            pg.evaluate("TribeGuide.home()"); pg.wait_for_selector("#les-home .les-track")
            assert pg.locator("#les-home .les-track").count() == 5 and "Your first website" in pg.text_content("#les-home .les-next")
            assert pg.locator("#les-home .les-track.is-next").get_attribute("data-les-track") == "first-site"
            pg.screenshot(path=str(SHOTS / "lessons-learn-1440.png"))

            # 2. start it: a card on screen; doing each step in the real designer ticks it, nothing pressed
            pg.click("#les-home [data-les-start=first-site]"); pg.wait_for_selector("#les-card h4")
            assert step() == "start" and "1/9" in pg.text_content("#les-card header") and not pg.evaluate("TribeGuide.isOpen()")
            pid = pg.evaluate("TribeClient.project()")
            pg.evaluate("p => TribeSiteDesigner.open({ pid: p, template: 'cafe' })", pid)
            pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages.length", timeout=15000)
            at("words")
            pg.click("#les-card [data-les=show]"); pg.wait_for_selector(".fls-ring"); pg.screenshot(path=str(SHOTS / "lessons-card-1440.png")); pg.evaluate("TribeFlintLessons.unring()")
            pg.evaluate("TribeSiteDesigner.ask('change the title to Maras Kitchen')"); at("look")
            pg.evaluate("TribeSiteDesigner.ask('dark mode')"); at("section")
            pg.evaluate("TribeSiteDesigner.ask('add a gallery')"); at("page")
            pg.evaluate("TribeSiteDesigner.ask('add a page called About')"); at("link")
            pg.click("#les-card [data-les=next]"); at("phone")                              # "Done, next" always works
            pg.click("#wdz [data-dev=phone]"); at("check")
            pg.click("#wdz [data-panel=check]"); at("out")
            with pg.expect_download(timeout=15000): pg.click("#wdz-dl")
            pg.wait_for_function("(TribeLessons.state() || {}).finished === true", timeout=8000)
            assert pg.evaluate("TribeLessons.done('first-site')") and "Your first phone app" in pg.text_content("#les-card")
            print("  ok  first website: 9 steps, 8 ticked by doing them in the designer, 1 by Done")

            # 3. kept with the person: gone from the device, the host gives the ticks back
            assert pg.evaluate("TribeLessons.sync()")
            tok = pg.evaluate("TribeClient.token ? TribeClient.token() : JSON.parse(localStorage.getItem('tribecode.settings.v1')).server.token")
            req = urllib.request.Request(BASE + "/api/me/learn", headers={"Authorization": "Bearer " + tok})
            saved = json.loads(urllib.request.urlopen(req, timeout=5).read())["track"]
            assert len(saved["first-site"]) == 9, saved
            pg.evaluate("(() => { const j = JSON.parse(localStorage.getItem('tribecode.learn')); delete j.track; localStorage.setItem('tribecode.learn', JSON.stringify(j)); })()")
            assert not pg.evaluate("TribeLessons.done('first-site')")
            assert pg.evaluate("TribeLessons.sync()") and pg.evaluate("TribeLessons.done('first-site')"), "ticks come back from the host"
            assert pg.evaluate("TribeLearn.get().quick !== undefined && !!TribeLearn.get().track"), "quick guides keep the lessons' ticks in the same record"
            pg.evaluate(clean)

            # 4. App Creator: the card stays usable over the full-screen tool; Play ticks; one offer for a first-timer
            pg.evaluate("p => TribeAppCreator.open({ pid: p, template: 'habits' })", pid); pg.wait_for_selector("#apc .apc-edit .ax-screen, #apc #apc-phone", timeout=10000)
            pg.wait_for_selector("#apc #apc-insp .les-offer", timeout=6000); assert "Your first phone app" in pg.text_content("#apc .les-offer")
            pg.screenshot(path=str(SHOTS / "lessons-offer-app-1440.png"))
            pg.click("#apc .les-offer [data-les-go]"); pg.wait_for_selector("#les-card h4")
            at("edit")                                                                      # the app is open already: step 1 ticked itself
            assert not pg.evaluate("document.querySelector('#les-card').inert"), "the lesson card is not made inert by the full-screen tool"
            pg.evaluate("TribeAppCreator.ask('make it dark')"); pg.wait_for_function("['screen','link','play','look'].includes((TribeLessons.state() || {}).step)", timeout=8000)
            # the card never sits on the control its step is about (Blank screen is bottom left, where the card starts)
            pg.evaluate("TribeLessons.start('first-app', 'screen')"); at("screen"); time.sleep(0.9)
            over = pg.evaluate("(() => { const a = document.querySelector('#les-card').getBoundingClientRect(), el = document.querySelector('#apc-addsc'); if (!el) return 'no #apc-addsc'; const b = el.getBoundingClientRect(); return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom); })()")
            assert over is False, over
            pg.evaluate("TribeLessons.start('first-app', 'play')"); at("play")
            pg.click("#les-card [data-les=show]"); pg.wait_for_selector(".fls-ring"); pg.evaluate("TribeFlintLessons.unring()")
            pg.click("#apc-play"); pg.wait_for_function("TribeLessons.done('first-app', 'play')", timeout=8000); pg.click("#apc-play")
            pg.click("#les-card [data-les=small]"); pg.wait_for_selector("#les-card.is-small .les-pill"); pg.click("#les-card .les-pill"); pg.wait_for_selector("#les-card h4")
            pg.click("#les-card [data-les=close]"); assert pg.locator("#les-card").count() == 0
            pg.evaluate("TribeAppCreator.close()"); pg.evaluate("p => TribeAppCreator.open({ pid: p })", pid); pg.wait_for_selector("#apc #apc-phone", timeout=10000); time.sleep(0.9)
            assert pg.locator(".les-offer").count() == 0, "the offer is made once"
            pg.evaluate(clean)
            print("  ok  App Creator: offer once, card usable over the tool, Play ticks its step")

            # 5. Flint with no AI
            pg.evaluate("localStorage.removeItem('tribecode.learn')")
            ask = lambda t: pg.evaluate("t => TribeFlint.ask(t)", t)
            last = lambda: pg.evaluate("(() => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' ? l.text : ''; })()")
            ask("teach me to make a website"); pg.wait_for_function("(TribeLessons.state() || {}).track === 'first-site'", timeout=8000)
            pg.wait_for_function("(() => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' && /Lesson started/.test(l.text); })()", timeout=8000)
            ask("stop the lesson"); pg.wait_for_function("!TribeLessons.state()", timeout=8000)
            ask("lessons"); pg.wait_for_function("(() => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' && /Your first phone app/.test(l.text) && /Take it online/.test(l.text); })()", timeout=8000)
            ask("teach me to make an app"); pg.wait_for_function("(TribeLessons.state() || {}).track === 'first-app'", timeout=8000)
            ask("what is my next lesson"); pg.wait_for_function("(() => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' && /Your first phone app/.test(l.text); })()", timeout=8000)
            pg.evaluate(clean)
            acts = pg.evaluate("(window.TribePaletteActions || []).flatMap(f => f() || []).filter(x => x.kind === 'Lesson').map(x => x.label)")
            assert len(acts) == 5 and "Lesson: Take it online" in acts, acts
            print("  ok  Flint starts, lists and pauses lessons with no AI; Ctrl K lists them")

            # 6. a gentle suggestion after a natural moment, through the Suggestions engine
            assert "learn" in pg.evaluate("TribeSuggest._providers()")
            assert pg.evaluate("TribeLessons.suggestProvider.gather().then(g => TribeLessons.suggestProvider.suggest({}, g)).then(r => r.length)") == 0, "nothing happened yet: nothing suggested"
            pg.evaluate("(() => { const j = JSON.parse(localStorage.getItem('tribecode.learn') || '{}'); j.moments = { friend: Date.now() }; localStorage.setItem('tribecode.learn', JSON.stringify(j)); })()")
            got = pg.evaluate("TribeLessons.suggestProvider.gather().then(g => TribeLessons.suggestProvider.suggest({}, g)).then(r => r.map(x => [x.id, x.title, x.from[0].ref]))")
            assert got == [["lesson-together", "Lesson: Build it together", "together"]], got
            pg.evaluate("TribeSuggest.run({ asked: true, providers: ['learn'] })")
            pg.wait_for_function("TribeSuggest.list().some(x => x.id === 'learn:lesson-together')", timeout=10000)
            pg.evaluate("TribeSuggest.apply(TribeSuggest.list().find(x => x.id === 'learn:lesson-together'))"); pg.wait_for_function("(TribeLessons.state() || {}).track === 'together'", timeout=8000)
            pg.evaluate(clean)
            print("  ok  the learn provider suggests Build it together after a friend joins; Apply starts it")

            # 7. THE WALK: every Show me rings a real control
            bad = []
            guides = pg.evaluate("TribeQuick.all().filter(g => g.show).map(g => g.id)")
            for gid in guides:
                pg.evaluate(clean); pg.evaluate("g => { TribeQuick.show(g); }", gid)
                try: pg.wait_for_selector(".fls-ring", timeout=7000)
                except Exception: bad.append("guide " + gid)
            walked = skipped = 0
            for t in tracks:
                for s in t["steps"]:
                    pg.evaluate(clean)
                    if s.get("soon"):
                        skipped += 1; continue
                    ok = pg.evaluate("([t, s]) => TribeLessons.show(t, s)", [t["id"], s["id"]])
                    if not ok or pg.locator(".fls-ring").count() == 0: bad.append(f"lesson {t['id']}/{s['id']}")
                    walked += 1
            pg.evaluate(clean)
            assert not bad, "Show me rang nothing for: " + ", ".join(bad)
            print(f"  ok  the walk: {len(guides)} quick guides and {walked} lesson steps each ring a real control ({skipped} steps wait for their control)")
            # a step whose control arrives later joins its track by itself
            n0 = pg.evaluate("TribeLessons.steps('power').length")
            pg.evaluate("(() => { const d = document.createElement('button'); d.id = 'wdz-zoom'; d.textContent = 'Zoom'; d.style.cssText = 'position:fixed;left:8px;top:80px;z-index:99'; document.body.appendChild(d); TribeLessons._see(); d.remove(); })()")
            assert pg.evaluate("TribeLessons.steps('power').length") == n0 + 1 and n0 == 7

            # 8. phone, 390px
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            keep = pg.evaluate("JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('tribecode.settings') || k.startsWith('tribecode.project')).map(k => [k, localStorage.getItem(k)])))")
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            pp.add_init_script("try { const k = " + keep + "; for (const [a, b] of Object.entries(k)) localStorage.setItem(a, b); } catch (e) {}")   # the same person, on their phone
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function(ready, timeout=30000)
            pp.evaluate("TribeQuick.load()"); pp.wait_for_function("TribeLessons.tracks().length === 5")
            pp.evaluate("TribeLessons.start('first-app')"); pp.wait_for_selector("#les-card h4")
            box = pp.evaluate("(() => { const r = document.querySelector('#les-card').getBoundingClientRect(); return [r.left, r.right, r.bottom, Math.min(...[...document.querySelectorAll('#les-card .btn, #les-card .les-x')].map(x => x.getBoundingClientRect().height))]; })()")
            assert box[0] >= 0 and box[1] <= 390 and box[2] <= 844 and box[3] >= 40, box
            assert pp.evaluate("document.documentElement.scrollWidth <= 390")
            pp.screenshot(path=str(SHOTS / "lessons-card-390.png"))
            pp.evaluate("TribeLessons.stop(); TribeGuide.home()"); pp.wait_for_selector("#les-home .les-track"); pp.screenshot(path=str(SHOTS / "lessons-learn-390.png"))
            ph.close()

            # 9. the website's Learn page lists the lessons
            wp = ctx.new_page(); wp.goto(f"http://127.0.0.1:{SITE_PORT}/learn.html"); wp.wait_for_function("document.documentElement.dataset.lessons === '5'", timeout=10000)
            assert wp.locator("#qk-lessons .qk-card").count() == 5 and wp.locator("#qk-lessons [data-lesson=first-site] li").count() == 9
            wp.close(); b.close()
        assert not errors, errors
        print("e2e_lessons: OK (5 tracks, 34 steps today + 9 waiting for their controls; ticks by doing, kept with the person; Flint, Suggestions, the walk, 390px, website)")
    finally:
        srv.terminate(); web.shutdown()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
