"""End-to-end: Flint's free tier (docs/FLINT-TIERS.md, server/flintfree.js). No AI is connected anywhere in this test.

1. The capability map (GET /api/flint/tiers) and the honest classifier (POST /api/flint/tier).
2. In the Flint panel beside the preview: "make a 3D game called Gem Rush" builds the three.js starter into the empty
   repo and the preview shows it; "make a landing page for Sunrise Bakery in green" builds a landing page into
   builds/sunrise-bakery/ (never over the 3D game) and the preview switches to it.
3. Picked-element edits with no model: "make it blue", "change it to …", "round the corners", "more padding".
3b. The property sheet for the picked element (P1-G): padding, fill, alignment written to the file, bad values
   refused, Undo takes back the last change. 3c. Notes queued and applied together (P1-F): the free one is done
   for free, the rest goes to the AI helpers in one brief.
4. A request bigger than the free tier ("add multiplayer and a leaderboard") gets the honest card; "Send to my AI
   helper" with Plan first on shows editable steps, and the edited plan goes with the request. No "Try the tribe's
   AI" button when the tribe has no AI. 4b. Build history: save this version, restore an earlier one, restore back.
5. "What can you do for free?" in Flint's chat lists the tiers.
6. Phones (390 px): the Flint sheet over the preview fits, shows the free line, and builds a to-do app.
Usage: python app/test/e2e_flint_free.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4931 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text
            and "EventSource" not in m.text and "jsdelivr" not in m.text and "unpkg" not in m.text and "three" not in m.text.lower() and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if take:
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"flint-free-{name}.png"))


def send(page, text):
    page.fill("#pvf-in", text)
    page.press("#pvf-in", "Enter")


def feed_has(page, rx, timeout=12000):
    try: page.wait_for_function("rx => [...document.querySelectorAll('#pvf-feed .pvf-it')].some(li => new RegExp(rx, 'i').test(li.innerText))", arg=rx, timeout=timeout)
    except Exception:
        raise AssertionError(f"the Flint feed never said {rx!r}; it says: {page.evaluate('[...document.querySelectorAll(`#pvf-feed .pvf-it`)].map(li => li.innerText.replace(/\\s+/g, ` `)).slice(-4)')}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flint-free-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="flint-free-src-", dir="/tmp")
    repo = os.path.join(work, "gems"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Gems\n"); git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    phone_repo = os.path.join(work, "chores"); os.makedirs(phone_repo)
    Path(phone_repo, "README.md").write_text("# Chores\n"); git(phone_repo, "init", "-q", "-b", "main"); git(phone_repo, "add", "-A"); git(phone_repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Flint Free"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        gp = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]
        cp = ok(api("/projects", "POST", {"path": phone_repo}, token=camp), "phone project")["project"]["id"]

        # ---- 1: the map and the classifier ----
        t = ok(api("/flint/tiers", token=camp))
        assert [x["id"] for x in t["tiers"]] == ["rules", "recipe", "small", "agent"], t
        assert t["now"]["host"]["online"] is False, t
        def tier(a, picked=False): return ok(api("/flint/tier", "POST", {"ask": a, "picked": picked}, token=camp))
        assert tier("make a 3D game where you explore a forest")["recipe"] == "3d"
        assert tier("build me a video editor")["recipe"] == "video"
        assert tier("build a todo app")["recipe"] == "todo"
        assert tier("make a platformer")["recipe"] == "game"
        assert tier("make a landing page for my yoga studio")["recipe"] == "landing"
        assert tier("add multiplayer and a leaderboard")["tier"] == "agent"
        assert tier("refactor the whole codebase to typescript")["tier"] == "agent"
        assert tier("make it blue", True)["tier"] == "rules"
        blob = json.dumps(t).lower()
        assert "$" not in blob and "price" not in blob, "no prices in the capability map"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, gp))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % gp, timeout=15000)

            # ---- 2: free builds in the panel beside the preview ----
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw.is-empty", timeout=10000)
            host.wait_for_selector("#pvf.is-open #pvf-in", timeout=5000)
            host.wait_for_function("/no AI/i.test((document.querySelector('#pvf-tier') || {}).innerText || '')", timeout=5000)
            send(host, "make a 3D game called Gem Rush")
            feed_has(host, "Built a 3D game for Gem Rush")
            host.wait_for_selector("#pvw:not(.is-empty) #pvw-iframe", timeout=12000)
            tree = json.dumps(ok(api("/code/tree", token=camp, project=gp)))
            assert "index.html" in tree and "src" in tree, tree[:400]
            top = Path(repo, "index.html").read_text()
            assert "Gem Rush" in top and "three" in top.lower(), "the 3D starter got the name and uses three.js"
            assert "Gem Rush" in git(repo, "log", "-1", "--pretty=%s"), "the build was committed"
            shot(host, "3d")

            send(host, "make a landing page for Sunrise Bakery in green")
            feed_has(host, "Built a landing page for Sunrise Bakery")
            assert Path(repo, "builds", "sunrise-bakery", "index.html").exists(), "the landing page went into builds/, not over the game"
            assert "Gem Rush" in Path(repo, "index.html").read_text(), "the 3D game was not touched"
            lp = Path(repo, "builds", "sunrise-bakery", "index.html").read_text()
            assert "#3BD16F" in lp and "Order ahead" in lp, "green accent and bakery words from what was said"
            fr = host.frame_locator("#pvw-iframe")
            fr.locator("h1", has_text="Sunrise Bakery").wait_for(timeout=10000)
            shot(host, "landing")

            # ---- 3: picked-element edits, no model ----
            h1 = fr.locator("h1").inner_text().strip()
            host.evaluate("t => TribePreviewFlint.pick({ tag: 'h1', text: t, rect: { left: 40, top: 120, width: 400, height: 60 } })", h1)
            send(host, "make it blue")
            feed_has(host, "Made it blue")
            src = Path(repo, "builds", "sunrise-bakery", "index.html").read_text()
            assert "color: #3B82F6" in src, "the h1 got the blue color"
            send(host, "round the corners")
            feed_has(host, "Rounded the corners")
            send(host, "more padding")
            feed_has(host, "Gave it more room")
            src = Path(repo, "builds", "sunrise-bakery", "index.html").read_text()
            assert "border-radius: 12px" in src and "padding: 20px" in src, src[src.find("<h1"):src.find("<h1") + 200]
            send(host, "change it to Fresh bread every morning")
            feed_has(host, "Changed the words")
            assert "Fresh bread every morning" in Path(repo, "builds", "sunrise-bakery", "index.html").read_text()
            LP = Path(repo, "builds", "sunrise-bakery", "index.html")

            # ---- 3b: the property sheet (P1-G): no prompt, no AI; Undo ----
            host.evaluate("TribePreviewFlint.pick({ tag: 'h1', text: 'Fresh bread every morning', rect: { left: 40, top: 120, width: 400, height: 60 }, cs: { padding: '20px', margin: '0px 0px 16px', width: '600px', height: '64px', 'font-size': '58px', 'font-weight': '700', color: 'rgb(59, 130, 246)', 'background-color': 'rgba(0, 0, 0, 0)', 'border-radius': '12px', 'text-align': 'start' } })")
            host.wait_for_selector("#pvf-props:not(.hidden) input[data-prop='padding']", timeout=5000)
            assert host.input_value("#pvf-props input.pvf-pv[data-prop='color']") == "#3b82f6", "the sheet shows the element's current color"
            host.fill("#pvf-props input[data-prop='padding']", "24px 32px"); host.press("#pvf-props input[data-prop='padding']", "Enter")
            host.wait_for_function("/Saved padding/.test(document.querySelector('#pvf-pstat').innerText)", timeout=8000)
            host.fill("#pvf-props input.pvf-pv[data-prop='background-color']", "#222222"); host.press("#pvf-props input.pvf-pv[data-prop='background-color']", "Enter")
            host.wait_for_function("/Saved background-color/.test(document.querySelector('#pvf-pstat').innerText)", timeout=8000)
            host.click("#pvf-props [data-pvf='seg'][data-v='center']")
            host.wait_for_function("/Saved text-align/.test(document.querySelector('#pvf-pstat').innerText)", timeout=8000)
            src = LP.read_text()
            assert "padding: 24px 32px" in src and "background-color: #222222" in src and "text-align: center" in src, src[src.find("<h1"):src.find("<h1") + 300]
            fr.locator("h1", has_text="Fresh bread").wait_for(timeout=8000)
            host.wait_for_function("() => [...document.querySelectorAll('#pvf-feed .pvf-reload')].length > 0", timeout=8000)   # the preview reloaded with the new styles
            r = api("/preview/props", "POST", {"href": host.evaluate("TribePreview.info().path") + "builds/sunrise-bakery/", "pick": {"tag": "h1", "text": "Fresh bread every morning"}, "set": {"color": "red; } body { display:none"}}, token=camp, project=gp)
            assert r[0] == 400, f"bad values are refused: {r}"
            shot(host, "props")
            host.click("#pvf-props [data-pvf='undo']")
            host.wait_for_function("/Undid/.test(document.querySelector('#pvf-pstat').innerText)", timeout=8000)
            src = LP.read_text()
            assert "text-align: center" not in src and "background-color: #222222" in src, "Undo took back only the last change"

            # ---- 3c: notes applied together (P1-F) ----
            send_note = lambda t: (host.fill("#pvf-in", t), host.click("#pvf-add"))
            send_note("make it bold")
            host.evaluate("TribePreviewFlint.pick(null)")
            send_note("add a score counter to the header")
            host.wait_for_selector("#pvf-queue:not(.hidden) li:nth-child(2)", timeout=3000)
            assert host.evaluate("TribePreviewFlint.notes().length") == 2
            host.click("#pvf-queue [data-pvf='applyall']")
            feed_has(host, "Made it bold")
            feed_has(host, "Sent to your AI helpers")
            assert host.locator("#pvf-queue.hidden").count() == 1

            def reached(word):
                msgs = (api("/agents/channel", token=camp, project=gp)[1].get("messages") or []) + (api("/chat/general", token=camp, project=gp)[1].get("messages") or [])
                return next((m.get("text") for m in msgs if word in (m.get("text") or "")), None)
            for _ in range(30):
                if reached("score counter"): break
                time.sleep(0.2)
            assert reached("score counter") and not reached("1) make it bold"), "the free note was applied for free; only the other went to the AI helpers"

            # ---- 4: bigger than free → an honest card; Plan first → editable steps → hand-off ----
            host.check("#pvf-plan")
            send(host, "add multiplayer and a leaderboard")
            host.wait_for_selector("#pvf-feed .pvf-honest", timeout=8000)
            assert host.locator("#pvf-feed [data-pvf='tribeai']").count() == 0, "no tribe-AI button when the tribe has no AI"
            shot(host, "honest")
            host.click("#pvf-feed [data-pvf='hand']")
            host.wait_for_selector("#pvf-feed .pvf-plancard textarea", timeout=5000)
            ta = host.locator("#pvf-feed .pvf-plancard textarea").last
            ta.fill(ta.input_value() + "\nTest it with two players")
            shot(host, "plan")
            host.click("#pvf-feed [data-pvf='runplan']")
            feed_has(host, "Sent to your AI helpers")
            for _ in range(30):
                if reached("multiplayer"): break
                time.sleep(0.2)
            msg = reached("multiplayer")
            assert msg and "Plan to follow" in msg and "Test it with two players" in msg, f"the edited plan went with the request: {msg}"
            host.uncheck("#pvf-plan")

            # ---- 4b: build history with one-click restore (P1-F) ----
            host.click("#pvf [data-pvf='history']")
            host.wait_for_selector("#pvf-hist:not(.hidden) li", timeout=8000)
            host.click("#pvf-hist [data-pvf='savever']")   # the preview edits were not saved as a version yet
            host.wait_for_function("[...document.querySelectorAll('#pvf-hist li')].some(li => /Save a version/.test(li.innerText)) && !document.querySelector('#pvf-hist [data-pvf=savever]')", timeout=8000)
            shot(host, "history")
            host.locator("#pvf-hist li", has_text="a 3D game for Gem Rush").locator("[data-pvf='restore']").click()
            feed_has(host, "Restored")
            assert not LP.exists(), "restoring the 3D version takes the later landing page out of the files"
            assert "Restore the version" in git(repo, "log", "-1", "--pretty=%s") and "Save a version" in git(repo, "log", "-3", "--pretty=%s"), "restore adds a version; nothing is rewritten"
            host.locator("#pvf-hist li", has_text="Save a version").locator("[data-pvf='restore']").click()
            for _ in range(40):
                if LP.exists(): break
                time.sleep(0.2)
            assert LP.exists() and "padding: 24px 32px" in LP.read_text(), "restoring the saved version brings the edited landing page back"
            host.click("#pvf [data-pvf='history']")

            # ---- 5: "what can you do for free?" ----
            host.evaluate("TribeFlint.ask('What can you do for free?')")
            host.wait_for_function("() => { const t = TribeFlint.thread(); const l = t[t.length - 1]; return l && l.who === 'flint' && /Free · recipes/.test(l.text) && /A stronger AI/.test(l.text); }", timeout=8000)

            # ---- 6: phone ----
            pc = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pc.add_init_script(settings_js("Camp", camp, cp))
            ph = pc.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % cp, timeout=15000)
            ph.evaluate("TribePreview.open()")
            ph.wait_for_selector("#pvf", state="attached", timeout=8000)   # phones open on the Page tab; the sheet waits behind Edit
            ph.evaluate("TribePreviewFlint.open()")
            ph.wait_for_selector("#pvf.is-open #pvf-in", timeout=5000)
            ph.wait_for_timeout(450)   # the sheet slides up
            box = ph.evaluate("(() => { const r = document.querySelector('#pvf').getBoundingClientRect(); const i = document.querySelector('#pvf-in').getBoundingClientRect(); const t = document.querySelector('#pvf-tier').getBoundingClientRect(); return [r.left, r.right, i.width, i.bottom, t.height, document.documentElement.scrollWidth]; })()")
            shot(ph, "phone-open")
            assert box[0] >= -1 and box[1] <= 391 and box[2] > 200 and box[3] <= 845 and box[4] > 0 and box[5] <= 391, f"the phone sheet fits: {box}"
            send(ph, "build a todo app for our chores")
            feed_has(ph, "Built a to-do app")
            assert Path(phone_repo, "index.html").exists()
            ph.evaluate("TribePreviewFlint.close()")
            ph.frame_locator("#pvw-iframe").locator("#add").wait_for(timeout=10000)
            ph.wait_for_timeout(800); ph.frame_locator("#pvw-iframe").locator("#add").wait_for(timeout=10000)   # the live reload for the new files can land just after the first paint (and wipe what was typed)
            ph.frame_locator("#pvw-iframe").locator("#new").fill("Take out the bins")
            ph.frame_locator("#pvw-iframe").locator("#new").press("Enter")
            ph.frame_locator("#pvw-iframe").locator("#list", has_text="Take out the bins").wait_for(timeout=8000)   # the list redraws after Enter (and after a late reload)
            assert "Take out the bins" in ph.frame_locator("#pvw-iframe").locator("#list").inner_text()
            shot(ph, "phone-todo")
            b.close()
        assert not errors, "\n".join(errors[:10])
        print("e2e_flint_free: OK (tiers, 3D + landing builds with no AI, picker edits, honest hand-off, chat map, phone to-do)")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
