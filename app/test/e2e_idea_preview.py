"""The idea becomes a first preview (pass 6, app/ui/firstlook.js, docs/FIRST-PREVIEW.md).

New project › "What do you want to make?" › Start building: the sentence is saved as the vision once, a first working
version of the right kind is made with no AI, and the person lands on it full size with "Made from your idea · Change
it" and the next actions (Keep editing, Make it better, Invite a friend). No invite sheet pops up.
  website   "A website for my friend's bakery"  -> the café template, the name and line filled in, saved as the website
  app       "An app that tracks our habits"     -> App Creator's habit tracker, saved as the project's app
  game      "A snake game for our group"        -> the snake starter, written into the code and run in the preview
Then the dashboard: the band shows what was made (Website / Phone app / App), ONE compact next step under it with
"See all steps" (a sheet), no inline vision box, no Next chip in the header, no Next steps in the right panel and no
Getting started strip over the chat. Change it remakes it from new words; "Make it an app instead" switches the kind;
Keep editing opens the right creator. A save the tribe refuses still shows the preview ("Shown here only"); a preview
that cannot be made lands on the dashboard with one honest line and Try again. Phone 390: no sideways scroll, 40px
buttons. No console errors.
Usage: python app/test/e2e_idea_preview.py [--shots DIR]
"""
import os, subprocess, sys, tempfile, time, json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 5470 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
errors = []

def watch(pg, tag):
    pg.on("console", lambda m: errors.append(f"{tag}: {m.text}") if m.type == "error" and "favicon" not in m.text else None)
    pg.on("pageerror", lambda e: errors.append(f"{tag}: {e}"))

def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, f"idea-{name}.png"))

def create(pg, idea):
    pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
    pg.fill("#np-idea", idea); pg.click("#np-idea-go")
    pg.wait_for_selector("#fpv", timeout=15000)
    pg.wait_for_selector("#fpv .fpv-acts", timeout=40000); pg.wait_for_timeout(800)
    return pg.evaluate("TribeFirstLook.state()")

def frame_text(pg):
    pg.wait_for_function("(() => { const f = document.querySelector('#fpv-frame'); try { return f && f.contentDocument === null || (f.contentWindow && f.contentWindow.length >= 0); } catch { return true; } })()")
    for fr in pg.frames:
        if fr != pg.main_frame and fr.parent_frame == pg.main_frame:
            try: return fr.evaluate("document.body ? document.body.innerText : ''")
            except Exception: pass
    return ""

def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="tribe-idea-"))
    env = dict(os.environ, TRIBE_NO_DOWNLOAD="1")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try:
                import urllib.request; urllib.request.urlopen(BASE + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900}); watch(pg, "1440")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeFirstLook && TribeClient.connected()", timeout=20000); pg.wait_for_timeout(1200)
            shot(pg, "1440-home")

            # ---------- 1: a website ----------
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea"); shot(pg, "1440-create")
            pg.fill("#np-idea", "A website for my friend's bakery"); pg.click("#np-idea-go")
            pg.wait_for_selector("#fpv", timeout=15000)
            assert "first preview" in pg.inner_text("#fpv").lower(), "the Making state names what is happening"
            shot(pg, "1440-making")
            pg.wait_for_selector("#fpv .fpv-acts", timeout=40000); pg.wait_for_timeout(1200)
            st = pg.evaluate("TribeFirstLook.state()")
            assert st["kind"] == "site" and st["tpl"] == "cafe" and st["saved"], st
            txt = pg.inner_text("#fpv")
            assert "made from your idea" in txt.lower() and "A website for my friend's bakery" in txt and "Change it" in txt, txt[:300]
            for b2 in ["Keep editing", "Make it better", "Invite a friend"]: assert b2 in txt, b2
            assert "Make it an app instead" in txt and "Make it a game instead" in txt
            assert not pg.evaluate("(() => { const m = document.querySelector('#invite-modal'); return !!m && !m.classList.contains('hidden'); })()"), "no invite sheet after creating"
            ft = frame_text(pg); assert "Bakery" in ft and "My friend's bakery" in ft, ("the site shows the name and the person's own line", ft[:200])
            shot(pg, "1440-site")
            pid = st["pid"]
            v = pg.evaluate(f"TribeClient.api('/vision', {{ project: '{pid}' }})")
            assert v["text"].count("A website for my friend's bakery") == 1, ("the vision is the first description, once", v)
            cfg = pg.evaluate(f"TribeClient.api('/projects/{pid}/site-config')")["config"]
            assert cfg and cfg["pages"] and cfg["name"] == "Bakery", ("the website was saved with the name", cfg and cfg.get("name"))
            # Change it: new words, made again
            pg.click('#fpv [data-fpv="change"]'); pg.fill("#fpv-change-in", "A link in bio page for my bakery's instagram"); pg.click("#fpv-change button[type=submit]")
            pg.wait_for_function("TribeFirstLook.state() && TribeFirstLook.state().sub === 'linkbio'", timeout=30000); pg.wait_for_selector("#fpv .fpv-acts")
            v = pg.evaluate(f"TribeClient.api('/vision', {{ project: '{pid}' }})"); assert "instagram" in v["text"], "Change it updates the vision"
            # the dashboard after
            pg.click('#fpv [data-fpv="close"]'); pg.wait_for_selector("#pj-overview .db-band", timeout=15000); pg.wait_for_timeout(1500)
            assert pg.get_attribute("#pj-overview .db-band", "data-pick") == "site", "the band shows the website"
            assert pg.locator("#pj-check.one").count() == 1 and pg.locator("#pj-check .ock-card.ock-next").is_visible(), "one compact next step"
            assert pg.locator("#pj-check .ock-card:visible").count() == 1, "only one step shows"
            assert "next step" in pg.inner_text("#pj-check .ock-head").lower(), pg.inner_text("#pj-check .ock-head")
            assert pg.locator("#ock-vis-in, [data-ock-vis]").count() == 0, "no inline vision box"
            assert pg.locator("#ns-chip").count() == 0, "no Next chip in the header"
            assert pg.locator("#room-next").count() == 0, "no Next steps in the right panel"
            assert pg.locator("#ns-card").count() == 0, "no second next-step card while steps are left"
            order = pg.evaluate("(() => { const a = document.querySelector('#pj-band-slot'), c = document.querySelector('#pj-check'); return !!(a && c && (a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)); })()")
            assert order, "the next step sits under the preview"
            shot(pg, "1440-dashboard")
            pg.click("#pj-check-all"); pg.wait_for_selector("#pj-steps .ock-row", timeout=5000)
            assert pg.locator("#pj-steps .ock-row:not(.ock-gap):not(.ock-flint)").count() == 5 and pg.locator("#pj-steps .ock-row.on").count() >= 1, "See all steps lists every step, ticked"
            shot(pg, "1440-steps"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            # the band opens the preview full size again, as it is now
            pg.click("#pj-overview .db-band [data-db='open']"); pg.wait_for_selector("#fpv .fpv-acts", timeout=15000)
            assert "instagram" in pg.inner_text("#fpv").lower(); pg.click('#fpv [data-fpv="close"]'); pg.wait_for_timeout(800)
            # no Getting started strip over the chat
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_timeout(600)
            assert "Getting started" not in (pg.evaluate("(document.querySelector('#flow-dock') || {}).innerText || ''")), "no Getting started strip over the chat"

            # ---------- 2: a phone app ----------
            st = create(pg, "An app that tracks our habits")
            assert st["kind"] == "app" and st["tpl"] == "habits" and st["saved"], st
            assert pg.locator("#fpv .fpv-stage.fpv-phone").count() == 1, "an app shows in a phone-size frame"
            ft = frame_text(pg); assert "habits" in ft.lower(), ft[:200]
            shot(pg, "1440-app")
            app = pg.evaluate(f"TribeClient.api('/projects/{st['pid']}/app-config')")["config"]
            assert app and app.get("screens") and app.get("name") == st["name"], ("the app was saved with the project's name", app and app.get("name"))
            pg.click('#fpv [data-fpv="edit"]'); pg.wait_for_function("window.TribeAppCreator && TribeAppCreator.state() && TribeAppCreator.state().open !== false && document.querySelector('#apc')", timeout=15000)
            pg.evaluate("TribeAppCreator.close()"); pg.wait_for_timeout(600)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#pj-overview .db-band", timeout=15000); pg.wait_for_timeout(1500)
            assert pg.get_attribute("#pj-overview .db-band", "data-pick") == "phone", "the band shows the phone app"
            assert pg.locator("#pj-overview .db-band .apc-mini").count() == 1, "the band draws the app's first screen"

            # ---------- 3: a game ----------
            st = create(pg, "A snake game for our group")
            assert st["kind"] == "game" and st["tpl"] == "snake" and st["saved"], st
            src = pg.get_attribute("#fpv-frame", "src") or ""
            assert "/preview/" in src, ("the game runs from the project's code in the preview", src)
            assert pg.locator('#fpv [data-fpv="better"]').count() == 0, "no Polish for a game"
            pg.wait_for_timeout(1500); shot(pg, "1440-game")
            # switch the kind
            pg.click('#fpv [data-fpv="as"][data-as="site"]'); pg.wait_for_function("TribeFirstLook.state() && TribeFirstLook.state().kind === 'site'", timeout=30000)
            pg.wait_for_selector("#fpv .fpv-acts"); assert "Make it a game instead" in pg.inner_text("#fpv")
            pg.click('#fpv [data-fpv="close"]'); pg.wait_for_timeout(800)

            # ---------- 4: the tribe refuses the save: the preview still shows, honestly ----------
            pg.route("**/site-config", lambda r: r.fulfill(status=503, body='{"error":"down"}', content_type="application/json") if r.request.method == "PUT" else r.continue_())
            st = create(pg, "A portfolio for my photography")
            assert st["kind"] == "site" and not st["saved"] and "Shown here only" in pg.inner_text("#fpv"), "an unsaved preview says so"
            pg.unroute("**/site-config"); pg.click('#fpv [data-fpv="close"]'); pg.wait_for_timeout(600)

            # ---------- 5: it cannot be made: the dashboard, one honest line, Try again ----------
            # (the website model breaks for a moment: the page's own service worker would answer a blocked template file)
            pg.evaluate("(() => { window.__norm = TribeSiteCfg.normalize; TribeSiteCfg.normalize = () => { throw new Error('broken on purpose'); }; return 1; })()")
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea"); pg.fill("#np-idea", "A blog about hiking"); pg.click("#np-idea-go")
            pg.wait_for_selector("#pj-flfail", timeout=30000)
            assert pg.locator("#fpv").count() == 0 and "did not finish" in pg.inner_text("#pj-flfail")
            pg.evaluate("(() => { TribeSiteCfg.normalize = window.__norm; return 1; })()")
            pg.click("#pj-flfail-go"); pg.wait_for_selector("#fpv .fpv-acts", timeout=30000)
            assert pg.evaluate("TribeFirstLook.state().kind") == "site"
            pg.click('#fpv [data-fpv="close"]'); pg.wait_for_timeout(1200)
            assert pg.locator("#pj-flfail").count() == 0, "Try again clears the line"

            # ---------- 6: phone 390 ----------
            m = pg; m.set_viewport_size({"width": 390, "height": 844}); m.reload(); m.wait_for_function("window.TribeFirstLook && TribeClient.connected()", timeout=20000); m.wait_for_timeout(1500)
            st = create(m, "A website for our running club")
            assert st["kind"] == "site"
            assert m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            small = m.evaluate("[...document.querySelectorAll('#fpv button')].filter(x => x.offsetParent && !x.classList.contains('linkish')).map(x => x.getBoundingClientRect()).filter(r => r.height < 40).length")
            assert small == 0, f"{small} buttons under 40px"
            shot(m, "390-site")
            m.click('#fpv [data-fpv="close"]'); m.wait_for_timeout(800)
            st = create(m, "An app for our book club"); shot(m, "390-app")
            m.click('#fpv [data-fpv="close"]'); m.wait_for_selector("#pj-overview .db-band", timeout=15000); m.wait_for_timeout(1500)
            assert m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "the dashboard has no sideways scroll"
            shot(m, "390-dashboard")
            b.close()
    finally:
        srv.terminate()
    errors[:] = [e for e in errors if "broken on purpose" not in e and "status of 503" not in e]   # the refused save in step 4 is on purpose
    assert not errors, errors[:6]
    print("e2e_idea_preview: ok (website, phone app, game, change it, switch kind, unsaved, failed + try again, dashboard, 390)")

if __name__ == "__main__":
    main()
