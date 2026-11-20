"""The first version comes from the sentence, and the vision is one editable line (pass 9: app/ui/firstmake.js,
firstlook.js, projects.js).

Three sentences, three first versions that are about their own subject and have what the sentence named:
  "A habit tracker app for my running club with streaks and a weekly leaderboard"
        -> running words (Ready to run?, Log a run), a Leaderboard tab with placeholder members, no "Maya", no
           "Drink water"; chips say Phone app · running club · Leaderboard · Streaks
  "A website for my dog walking business with prices and a contact form, green"
        -> the name, dog-walking sections, Prices and a contact section, none of the template's own business
  "A to-do app for my chess club with chat"
        -> game-night words and a chat screen
Then the dashboard: the line under the project's name is the vision; a click edits it in place (Enter saves, Esc
cancels, Save and Cancel buttons); there is no second vision box anywhere (no inline box, no composer from "Write
it"); after a change it offers once "Update the first version to match?" and never does it by itself; the suggested
tasks come from the sentence ("Let members log a run"). "Change it" on the first preview asks before it replaces work
edited since. Phone 390: the line edits in place with 40px buttons and no sideways scroll. No console errors.
Usage: python app/test/e2e_vision_make.py [--shots DIR]
"""
import os, subprocess, sys, tempfile, time, pathlib, urllib.request
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
errors = []

def watch(pg, tag):
    pg.on("console", lambda m: errors.append(f"{tag}: {m.text}") if m.type == "error" and "favicon" not in m.text else None)
    pg.on("pageerror", lambda e: errors.append(f"{tag}: {e}"))

def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, f"vision-{name}.png"))

def create(pg, idea):
    pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
    pg.fill("#np-idea", idea); pg.click("#np-idea-go")
    pg.wait_for_selector("#fpv .fpv-acts", timeout=45000); pg.wait_for_timeout(900)
    return pg.evaluate("TribeFirstLook.state()")

def frame_text(pg):
    pg.wait_for_timeout(400)
    for fr in pg.frames:
        if fr != pg.main_frame and fr.parent_frame == pg.main_frame:
            try:
                t = fr.evaluate("document.body ? document.body.innerText : ''")
                if t.strip(): return t
            except Exception: pass
    return ""

def to_dash(pg):
    pg.click("#fpv [data-fpv=close]"); pg.wait_for_selector("#fpv", state="detached")
    pg.wait_for_selector("#pj-bio", timeout=15000); pg.wait_for_timeout(600)

def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="tribe-vmake-"))
    env = dict(os.environ, TRIBE_NO_DOWNLOAD="1")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900}); watch(pg, "1440")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeFirstLook && window.TribeFirstMake && TribeClient.connected()", timeout=20000); pg.wait_for_timeout(1200)

            # ---- 1. the running club: an app about running, with a leaderboard
            RUN = "A habit tracker app for my running club with streaks and a weekly leaderboard"
            r = create(pg, RUN); assert r["kind"] == "app", r
            chips = pg.evaluate("[...document.querySelectorAll('#fpv .fpv-chip')].map(x => x.textContent)")
            assert chips == ["running club", "Leaderboard", "Streaks"], chips
            t = frame_text(pg)
            assert "Ready to run?" in t and "Easy run" in t and "Log a run" in t, t[:400]
            assert "Maya" not in t and "Drink water" not in t and "Read 20 pages" not in t, "no stock sample: " + t[:400]
            assert "Leaderboard" in t, "the leaderboard is a tab: " + t[-300:]
            doc = pg.evaluate("TribeClient.api(`/projects/${encodeURIComponent(TribeFirstLook.state().pid)}/app-config`).then(d => d.config)")
            names = [s["name"] for s in doc["screens"]]
            assert "Leaderboard" in names and "New run" in names, names
            assert "streak" in (doc.get("features") or []), doc.get("features")
            lb = next(s for s in doc["screens"] if s["name"] == "Leaderboard")
            assert "Member 1" in str(lb) and "Priya" not in str(lb), "placeholder members, no made-up names"
            shot(pg, "1440-running-app"); print("ok  running club: running words, a Leaderboard tab with placeholder members, streaks on, no stock sample")

            # ---- the dashboard: the vision is one line under the name, edited in place; nothing else asks for it
            run_pid = r["pid"]; to_dash(pg)
            assert RUN in pg.text_content("#pj-bio"), pg.text_content("#pj-bio")
            assert pg.locator("#ock-vis-in, [data-ock-vis], #pj-vtext, #av-cats").count() == 0, "no second vision box"
            pg.wait_for_function("[...document.querySelectorAll('#ock-sugg .ock-sg')].length > 0", timeout=15000)
            sg = pg.evaluate("[...document.querySelectorAll('#ock-sugg .ock-sg')].map(x => x.dataset.title)")
            assert "Let members log a run" in sg and any("leaderboard" in x.lower() for x in sg), sg
            print("ok  dashboard: the sentence is the line under the name; suggested tasks come from it:", sg[:3])
            pg.click("#pj-bio"); pg.wait_for_selector("#pj-vis-in")
            assert pg.input_value("#pj-vis-in") == RUN and pg.locator("#pj-vis-save").count() == 1 and pg.locator("#pj-vis-x").count() == 1
            assert pg.evaluate("document.activeElement.id") == "pj-vis-in", "the cursor is in the line"
            pg.fill("#pj-vis-in", "something else"); pg.keyboard.press("Escape"); pg.wait_for_selector("#pj-vis-in", state="detached")
            assert RUN in pg.text_content("#pj-bio"), "Esc cancels"
            NEW = "A run log for my running club with a weekly leaderboard and a map of our routes"
            pg.click("#pj-bio"); pg.fill("#pj-vis-in", NEW); shot(pg, "1440-vision-edit"); pg.keyboard.press("Enter")
            pg.wait_for_function(f"(document.querySelector('#pj-bio') || {{}}).textContent && document.querySelector('#pj-bio').textContent.includes('map of our routes')", timeout=10000)
            vis = pg.evaluate("TribeClient.api('/vision').then(d => d.text)")
            assert NEW in vis and vis.startswith("# "), vis
            # offered once, never done by itself
            pg.wait_for_selector("#pj-vmatch"); assert "Update the first version to match?" in pg.text_content("#pj-vmatch")
            doc2 = pg.evaluate(f"TribeClient.api('/projects/{run_pid}/app-config').then(d => d.config)")
            assert [s["name"] for s in doc2["screens"]] == names, "nothing changed by itself"
            pg.click("#pj-vmatch-x"); pg.wait_for_selector("#pj-vmatch", state="detached")
            # "Write it" in the steps does not open a composer either: the same line
            pg.evaluate("TribeProjects.step('vision')"); pg.wait_for_selector("#pj-vis-in"); assert pg.locator("#pj-vtext, #av-cats").count() == 0, "no composer"
            pg.keyboard.press("Escape"); pg.wait_for_selector("#pj-vis-in", state="detached")
            # the vision keeps its other sections when the line changes
            pg.evaluate("""(async () => { const v = (await TribeClient.api('/vision')).text.trim(); await TribeClient.api('/vision', { method: 'PUT', body: { text: v + '\\n\\n## Done for v1\\n- one club\\n' } }); })()""")
            pg.wait_for_timeout(700); pg.click("#pj-bio"); pg.wait_for_selector("#pj-vis-in")
            assert "Done for v1" not in pg.input_value("#pj-vis-in"), "the line is the opening lines only"
            pg.fill("#pj-vis-in", NEW + "."); pg.click("#pj-vis-save"); pg.wait_for_selector("#pj-vmatch")
            vis = pg.evaluate("TribeClient.api('/vision').then(d => d.text)"); assert "## Done for v1" in vis and NEW + "." in vis, vis
            # Update it: the first version is made again from the new words (it was not edited, so no question)
            pg.click("#pj-vmatch-go"); pg.wait_for_selector("#fpv .fpv-acts", timeout=45000)
            pg.wait_for_function("TribeFirstLook.state() && /map of our routes/.test(TribeFirstLook.state().idea)", timeout=45000); pg.wait_for_timeout(900)
            chips = pg.evaluate("[...document.querySelectorAll('#fpv .fpv-chip')].map(x => x.textContent)"); assert "Map" in chips and "Leaderboard" in chips, chips
            vis = pg.evaluate("TribeClient.api('/vision').then(d => d.text)"); assert "## Done for v1" in vis, "remaking never drops the vision's sections"
            print("ok  the line edits in place (Enter, Esc, Save, Cancel); sections kept; Update offered once, then made again from the new words:", chips)
            # Change it asks before replacing edited work
            pg.evaluate(f"""(async () => {{ const d = await TribeClient.api('/projects/{run_pid}/app-config'); d.config.screens[0].name = 'My own name'; await TribeClient.api('/projects/{run_pid}/app-config', {{ method: 'PUT', body: {{ config: d.config }} }}); }})()""")
            pg.wait_for_timeout(500); pg.click("#fpv [data-fpv=change]"); pg.fill("#fpv-change-in", NEW + " and badges"); pg.click("#fpv-change button[type=submit]")
            pg.wait_for_selector("#fpv-keep:not([hidden])", timeout=8000); shot(pg, "1440-keep")
            pg.click("#fpv [data-fpv=keep-mine]"); pg.wait_for_selector("#fpv-keep", state="hidden")
            assert pg.evaluate(f"TribeClient.api('/projects/{run_pid}/app-config').then(d => d.config.screens[0].name)") == "My own name", "kept"
            pg.click("#fpv-change button[type=submit]"); pg.wait_for_selector("#fpv-keep:not([hidden])"); pg.click("#fpv [data-fpv=keep-replace]")
            pg.wait_for_function("TribeFirstLook.state() && /badges/.test(TribeFirstLook.state().idea)", timeout=45000); pg.wait_for_timeout(600)
            assert pg.evaluate(f"TribeClient.api('/projects/{run_pid}/app-config').then(d => d.config.screens[0].name)") != "My own name", "replaced after asking"
            print("ok  Change it asks before replacing edited work (Keep my version / Replace it)")
            to_dash(pg)

            # ---- 2. a website about its own business
            r = create(pg, "A website for my dog walking business with prices and a contact form, green"); assert r["kind"] == "site", r
            t = frame_text(pg); low = t.lower()
            assert "walk" in low and "prices" in low, t[:500]
            assert "plumb" not in low and "duluth" not in low, "none of the template's own business: " + t[:500]
            cfg = pg.evaluate("TribeClient.api(`/projects/${encodeURIComponent(TribeFirstLook.state().pid)}/site-config`).then(d => d.config)")
            kinds = [x["type"] for x in cfg["pages"][0]["blocks"]]; assert "pricing" in kinds and "contact" in kinds, kinds
            chips = pg.evaluate("[...document.querySelectorAll('#fpv .fpv-chip')].map(x => x.textContent)"); assert "Prices" in chips and "Contact" in chips, chips
            shot(pg, "1440-dog-site"); print("ok  dog walking site: its own words, Prices and Contact sections:", chips); to_dash(pg)

            # ---- 3. a to-do app for a chess club with chat
            r = create(pg, "A to-do app for my chess club with chat"); assert r["kind"] == "app", r
            t = frame_text(pg); assert "Game on" in t and "Pick the game" in t, t[:400]
            doc = pg.evaluate("TribeClient.api(`/projects/${encodeURIComponent(TribeFirstLook.state().pid)}/app-config`).then(d => d.config)")
            assert any(any(bk["type"] == "chat" for bk in s["blocks"]) or s["name"] in ("Messages", "Chat", "Conversation") for s in doc["screens"]), [s["name"] for s in doc["screens"]]
            shot(pg, "1440-chess-app"); print("ok  chess club: game-night words and a chat screen"); to_dash(pg)

            # ---- phone 390: the line edits in place
            ph = pg; ph.set_viewport_size({"width": 390, "height": 844})   # the same person, at phone width
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeProjects && TribeClient.connected()", timeout=20000); ph.wait_for_timeout(1500)
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_selector("#pj-bio", timeout=15000); ph.wait_for_timeout(600)
            ph.evaluate("document.querySelector('#pj-bio').click()"); ph.wait_for_selector("#pj-vis-in")
            hs = ph.evaluate("[...document.querySelectorAll('.pj-vis-acts .btn')].map(x => Math.round(x.getBoundingClientRect().height))"); assert all(h >= 40 for h in hs), hs
            sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll: {sw}"
            assert ph.locator("#ock-vis-in, [data-ock-vis], #pj-vtext").count() == 0
            shot(ph, "390-vision-edit"); ph.evaluate("document.querySelector('#pj-vis-x').click()"); ph.wait_for_selector("#pj-vis-in", state="detached")
            print("ok  phone 390: the line edits in place, 40px buttons, no sideways scroll")
            b.close()
        bad = [e for e in errors if "ERR_CONNECTION_REFUSED" not in e and "Failed to load resource" not in e]
        assert not bad, bad[:5]
        print("e2e_vision_make: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
