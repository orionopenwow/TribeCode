"""Setup flow (feat/setup-flow): app/ui/projects.js checklist + header, stage.js, assist.js vision composer,
setup.js role flows + Make the starter (server/setup.js), tasks.js type chips + "Who does it?", shell.js tab gating,
sense.js Inspiration cards.

  1. A project with no repo: the hero checklist has 4 steps (vision · task · AI · repo, no "A friend joins"); the Task
     Board has no sub-tab row and the sidebar "+ Add" waits for the vision.
  2. Vision: category chips + "What's the gist?" fill VISION.md locally (what / for whom / done / out of scope); Save
     sets the sense kind (game).
  3. Role flows: the artist picks a palette, the engineer picks KAPLAY; each adds two typed starter tasks.
  4. Create the repo in one click; the project is "going" and the Task Board shows its tabs.
  5. Make the starter: files land in the repo (index.html, src/main.js, design/palette.css), one commit.
  6. Task Board: type chips on create, the "Who does it?" row (Flint only for text tasks), Suggested hidden at 3+ tasks.
  7. Header: rename inline (Enter saves, Esc cancels), the face opens an emoji grid with Upload a picture.
  8. Inspiration cards: thumbnail strip, 17px/700 title, one line of body, the button bottom right.
  9. Phone 390px: Dashboard, a role chooser, the vision composer and the New task sheet never overflow. No console errors.
Usage: python app/test/e2e_setup_flow.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5170 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
errors = []
SHOTS = os.environ.get("SETUP_SHOTS")   # a folder: save a few screenshots there to look at


def shot(pg, name):
    if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(SHOTS, name + ".png"))


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e} @ {(e.stack or '')[:300]}"))
    page.on("console", lambda m: errors.append(f"{who} console: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)


NO_OVERFLOW = """() => { const wide = [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.wt-row, .pl-grid, #board, .hidden, [hidden]')).map(e => e.id || e.className).slice(0, 5);
  return { page: document.documentElement.scrollWidth <= innerWidth + 1, wide }; }"""


def no_overflow(pg, where):
    r = pg.evaluate(NO_OVERFLOW)
    assert r["page"], f"{where}: sideways scroll"
    assert not r["wide"], f"{where}: pokes past the edge {r['wide']}"


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-setup-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 1000})
            ctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Campw', theme: 'campfire'})) } catch (e) {}")   # init scripts run in the sandboxed preview too
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            st, r = api("/projects", "POST", {"name": "Lantern Garden"}, token=tok); assert st == 200, (st, r)
            pid = r["project"]["id"]
            host.evaluate("pid => TribeProjects.refresh().then(() => TribeProjects.switchTo(pid, 'home'))", pid)
            host.wait_for_function("pid => TribeProjects.current() === pid", arg=pid, timeout=10000)
            host.evaluate("TribeApp.show('home')")

            # 1. four steps, no friend step; the repo comes last
            host.wait_for_selector("#pj-check.hero .ock-card", timeout=15000)
            steps = host.eval_on_selector_all("#pj-check .ock-row", "els => els.map(e => e.dataset.step)")
            assert steps == ["vision", "task", "claude", "repo"], steps
            assert "4 steps" in host.text_content("#pj-check .ock-hero-t")
            assert "create the code repository" in host.text_content("#pj-check [data-step=repo]").lower() and host.locator("#pj-check [data-step=repo] .ock-ghm").count() == 1   # the GitHub mark
            assert host.locator("#pj-check [data-step=friend]").count() == 0
            host.wait_for_function("document.body.dataset.stage === 'new' && document.body.dataset.vision === '0'", timeout=5000)
            assert host.evaluate("!document.querySelector('#nest-add') || getComputedStyle(document.querySelector('#nest-add')).display === 'none'"), "+ Add waits for the vision"
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_timeout(300)
            assert host.locator("#view-tabs").is_hidden(), "no sub-tab row until the project is going"
            host.evaluate("TribeApp.show('bugs')"); host.wait_for_selector("#view-tabs:not(.hidden) #wt-bugs", timeout=5000)   # deep links still work
            assert host.locator("#view-tabs #wt-calendar").count() == 0, "only the Board and the tab on screen"
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check.hero [data-ck=vision]", timeout=10000)

            # 2. the vision: category chips + the gist -> a local draft; Save sets the kind
            host.click("#pj-check [data-ck=vision]"); host.wait_for_selector("#av-cats .av-cat")
            assert host.locator("#av-cats .av-cat").count() == 6
            assert host.locator(".av-q").count() == 0, "no guided prompts any more"
            host.click("#av-cats [data-cat=game]")
            host.fill("#av-gist", "A cozy platformer where you light lanterns to find your way home")
            draft = host.input_value("#pj-vtext")
            for part in ["## What", "light lanterns", "## For whom", "## Done for v1", "One level you can play", "## Out of scope"]:
                assert part in draft, (part, draft)
            host.click("#av-cats [data-cat=site]"); assert "Visitors who should get it" in host.input_value("#pj-vtext"), "the draft follows the chip"
            host.click("#av-cats [data-cat=game]"); shot(host, "vision")
            assert host.locator(".av-imp[data-helper=flint]").count() == 1 and host.locator("[data-close]").first.text_content().strip() == "Later"
            host.click("#pj-vsave")
            host.wait_for_selector("#pj-check [data-step=vision].on", timeout=10000)
            sense = api(f"/projects/{pid}/sense", token=tok)[1]
            assert sense["override"] == "game" and sense["kind"] == "game", sense.get("kind")
            st, vis = api("/vision", token=tok, project=pid)
            assert "light lanterns" in json.dumps(vis), vis

            # 3. role flows -> starter tasks
            host.wait_for_selector("#pj-setup .su-role", timeout=10000)
            assert host.locator("#pj-setup .su-role").count() == 4
            assert host.evaluate("document.body.dataset.vision") == "1"
            host.click("#pj-setup [data-role=artist]"); host.wait_for_selector(".su-flow .su-opt")
            assert host.locator(".su-flow .su-opt").count() == 6 and host.locator(".su-flow .su-opt .su-sw").count() == 6
            pal = host.text_content(".su-flow .su-opt b"); shot(host, "artist")
            host.click(".su-flow .su-opt >> nth=0")
            host.wait_for_selector("#pj-setup [data-role=artist].on", timeout=10000)
            tasks = api("/tasks", token=tok, project=pid)[1]["tasks"]
            assert len(tasks) == 2 and all(t.get("type") == "design" for t in tasks), tasks
            assert pal in tasks[0]["title"], (pal, tasks[0]["title"])
            host.click("#pj-setup [data-role=engineer]"); host.wait_for_selector(".su-flow .su-opt")
            names = host.eval_on_selector_all(".su-flow .su-opt b", "els => els.map(e => e.textContent)")
            assert names[:1] == ["KAPLAY"] and "Phaser" in names, names
            host.click(".su-flow [data-opt=kaplay]"); host.wait_for_selector("#pj-setup [data-role=engineer].on", timeout=10000)
            tasks = api("/tasks", token=tok, project=pid)[1]["tasks"]
            assert len(tasks) == 4 and any(t["title"] == "Set up KAPLAY" and t.get("type") == "build" for t in tasks), [t["title"] for t in tasks]
            host.wait_for_selector("#pj-check [data-step=task].on", timeout=10000)
            assert host.evaluate("document.body.dataset.stage") == "growing"

            # 4. Create the repo in one click -> going -> the Task Board gets its tabs
            host.click("#pj-check [data-ck=repo]")
            host.wait_for_selector("#pj-check [data-step=repo].on", timeout=20000)
            repo = tmp / "tribe" / "workspaces" / pid
            assert (repo / ".git").exists() and (repo / "README.md").exists() and (repo / "VISION.md").exists()
            host.wait_for_function("document.body.dataset.stage === 'going'", timeout=10000)
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#view-tabs:not(.hidden) #wt-calendar", timeout=5000)

            # 5. Make the starter
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#su-starter", timeout=10000); shot(host, "dashboard")
            host.wait_for_timeout(500)
            host.click("#su-starter")
            try: host.wait_for_selector("#su-preview, #pj-setup:not(:has(#su-starter))", timeout=20000)
            except Exception: raise AssertionError("starter: " + str(host.evaluate("[(document.querySelector('.toast') || {}).textContent, (document.querySelector('#pj-setup') || {}).outerHTML]")) + json.dumps(api(f"/projects/{pid}/setup", token=tok)[1].get("starter")))
            for f in ["index.html", "src/main.js", "design/palette.css"]: assert (repo / f).exists(), f
            assert pal.split()[0].lower() in (repo / "design" / "palette.css").read_text().lower()
            logs = subprocess.run(["git", "log", "--oneline"], cwd=repo, capture_output=True, text=True).stdout
            assert "starter" in logs, logs

            # 6. Task Board: type chips, Who does it?, Suggested only under 3 tasks
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#board .task", timeout=10000)
            host.click("#task-new"); host.wait_for_selector(".quick-wrap .tk-type")
            assert host.locator(".quick-wrap .tk-type").count() == 5
            host.click(".quick-wrap [data-type=write]"); host.fill(".quick-wrap .quick-add", "Write the how-to-play text"); host.keyboard.press("Enter")
            host.wait_for_function("TribeTasks.all().some(t => t.title === 'Write the how-to-play text')", timeout=10000)
            t5 = next(t for t in api("/tasks", token=tok, project=pid)[1]["tasks"] if t["title"] == "Write the how-to-play text")
            assert t5.get("type") == "write", t5
            assert host.locator("#as-tasks").count() == 0, "no Suggested box with 3+ tasks"
            host.keyboard.press("Escape")
            card = host.locator(f"#board .task[data-id='{t5['id']}']")
            card.locator(".tk-tchip").wait_for(timeout=5000)
            shot(host, "board")
            labels = card.locator(".tk-do").all_text_contents()
            assert [l.strip() for l in labels] == ["🙋Me", "👋A friend", "🤖An agent", "🔥Flint"], labels
            build = next(t for t in api("/tasks", token=tok, project=pid)[1]["tasks"] if t["title"] == "Set up KAPLAY")
            bcard = host.locator(f"#board .task[data-id='{build['id']}']")
            assert bcard.locator(".tk-do").count() == 3, "Flint is only for text tasks"
            bcard.locator("[data-do=me]").click()
            bcard.locator(".tk-who-chip").wait_for(timeout=5000)
            me_id = host.evaluate("TribeClient.state().me.id")
            assert next(t for t in api("/tasks", token=tok, project=pid)[1]["tasks"] if t["id"] == build["id"])["assignee"] == me_id

            # 7. header: rename inline, the emoji grid
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-name", timeout=10000)
            host.click("#pj-name"); host.wait_for_selector(".pj-name-in"); host.fill(".pj-name-in", "Lantern Grove"); host.keyboard.press("Enter")
            try: host.wait_for_function("(document.querySelector('#pj-name') || {}).textContent === 'Lantern Grove'", timeout=10000)
            except Exception: raise AssertionError(str(host.evaluate("[(document.querySelector('.toast') || {}).textContent, (document.querySelector('.pj-id h1') || {}).outerHTML]")))
            host.click("#pj-name"); host.wait_for_selector(".pj-name-in"); host.fill(".pj-name-in", "Nope"); host.keyboard.press("Escape")
            host.wait_for_selector("#pj-name", timeout=5000); assert host.text_content("#pj-name") == "Lantern Grove"
            host.click("#pj-face"); host.wait_for_selector("#pj-face-pop .pfp-e")
            shot(host, "face")
            assert host.locator("#pj-face-pop .pfp-e").count() == 24 and "Upload a picture" in host.text_content("#pfp-upload")
            host.click("#pj-face-pop [data-face='🐉']")
            host.wait_for_function("pid => (TribeProjects.list().find(p => p.id === pid) || {}).emoji === '🐉'", arg=pid, timeout=10000)
            assert host.evaluate("getComputedStyle(document.querySelector('#pj-bio')).outlineStyle") in ("solid", "auto")

            # 8. Inspiration cards
            host.wait_for_selector("#pj-insp .sx-item .sx-thumb", timeout=15000)
            for _try in range(5):   # the card can redraw as sense updates: retry the read
                try:
                    it = host.evaluate("""() => { const i = document.querySelector('#pj-insp .sx-item'), b = i.querySelector('.sx-body b'), p = i.querySelector('.sx-body p'), btn = i.querySelector('.sx-task'), th = i.querySelector('.sx-thumb');
                  const ib = i.getBoundingClientRect(); return { fs: getComputedStyle(b).fontSize, fw: getComputedStyle(b).fontWeight, ws: getComputedStyle(p).whiteSpace,
                    thumbLeft: Math.round(th.getBoundingClientRect().left - ib.left), shadow: getComputedStyle(i).boxShadow, bg: getComputedStyle(i).backgroundImage,
                    btnRight: btn ? Math.round(ib.right - btn.getBoundingClientRect().right) : 0, btnBottom: btn ? Math.round(ib.bottom - btn.getBoundingClientRect().bottom) : 0 }; }""")
                    break
                except Exception:
                    host.wait_for_timeout(400)

            assert it["fs"] == "17px" and it["fw"] == "700" and it["ws"] in ("nowrap", "normal"), it   # v0.25: descriptions get two lines (clamped)
            assert it["thumbLeft"] <= 1 and it["shadow"] == "none" and it["bg"] == "none", it
            assert it["btnRight"] <= 20 and it["btnBottom"] <= 20, f"Make it a task sits bottom right {it}"
            host.evaluate("document.querySelector('#pj-insp')?.scrollIntoView()"); shot(host, "inspiration")
            pal_card = host.locator("#pj-insp .sx-item[data-type=palette] .sx-pal i")
            if pal_card.count(): assert pal_card.count() >= 3

            # 9. phone at 390
            settings = host.evaluate("JSON.stringify({...TribeStore.get(), onboarded: true, tour: {done: true}})")
            pctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', {json.dumps(settings)}); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            ph.wait_for_timeout(500)
            if ph.locator("#install-sheet:not(.hidden) #ins-later").count(): ph.click("#ins-later")
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_selector("#pj-setup .su-role", timeout=15000)
            ph.wait_for_selector("#pj-insp .sx-item", timeout=15000); ph.wait_for_timeout(300)
            no_overflow(ph, "phone dashboard"); ph.evaluate("(document.querySelector('#pj-setup') || document.body).scrollIntoView()"); shot(ph, "phone-dashboard")
            ph.click("#pj-setup [data-role=writer]"); ph.wait_for_selector(".su-flow .su-opt"); no_overflow(ph, "phone role chooser")
            ph.click(".su-flow .su-opt >> nth=0"); ph.wait_for_selector("#pj-setup [data-role=writer].on", timeout=10000)
            ph.evaluate("TribeProjects.step('vision')"); ph.wait_for_selector("#av-cats .av-cat"); ph.wait_for_timeout(200); no_overflow(ph, "phone vision composer"); shot(ph, "phone-vision")
            assert len(set(ph.eval_on_selector_all("#av-cats .av-cat", "els => els.map(e => Math.round(e.getBoundingClientRect().top))"))) >= 2, "chips wrap"
            ph.click("[data-close]"); ph.wait_for_timeout(200)
            ph.evaluate("TribeApp.show('tasks')"); ph.wait_for_selector("#task-new", timeout=10000)
            ph.evaluate("document.querySelector('#task-new').click()"); ph.wait_for_selector("#m2-task-sheet .tk-type", timeout=5000)
            ph.click("#m2-task-sheet [data-type=research]"); ph.fill("#m2-qt-in", "Look at three lantern games"); ph.wait_for_timeout(150); no_overflow(ph, "phone task sheet"); shot(ph, "phone-task")
            ph.press("#m2-qt-in", "Enter")
            ph.wait_for_function("TribeTasks.all().some(t => t.title === 'Look at three lantern games' && t.type === 'research')", timeout=10000)
            b.close()
        if errors: raise AssertionError("errors:\n" + "\n".join(errors))
        print("e2e_setup_flow: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
