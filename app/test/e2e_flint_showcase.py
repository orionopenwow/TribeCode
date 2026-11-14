"""Flint as the showcase of local AI (feat/flint-local): the planner, conversation memory, project memory, duplicate
tasks, "where did we talk about…" and the "Running on your device" panel with its self-test. No model for most of it;
the fixture model (app/test/fixtures/flint-model, not a trained model) for the panel's embeddings number.
  - a goal gets a plan card: steps listed, one skipped, Run plan, progress, each step done through Flint's own commands,
    "Undo last step" takes back exactly one step
  - follow-ups lean on the session: "and another one to…", "tell sam too", "make that 15", "its due friday"
  - project memory: a stated fact is noted, answers a later question, is in <project>/.tribe/flint-facts.json, can be
    edited and forgotten in "What Flint knows about this project"; paused means nothing new is noticed
  - a task that says the same as an open one asks first; "Add it anyway" adds it
  - "where did we talk about how much it costs" finds the pricing doc and the chat line with no model
  - the device panel: what this device has, active levels, the self-test's numbers, what was downloaded, what leaves
--shots writes docs/screenshots/flint-plan-card.png and flint-device.png.
Usage: python3 app/test/e2e_flint_showcase.py [--shots]
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6600 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ask(page, text):
    n = page.locator("#flint .fl-msg.fl").count()
    page.fill("#fl-input", text); page.press("#fl-input", "Enter")
    page.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n && !document.querySelector('#flint .fl-msg.streaming')", arg=n, timeout=20000)
    page.wait_for_timeout(450)
    last = page.locator("#flint .fl-msg.fl").last
    return last.text_content().strip(), last.locator(".fl-act").all_text_contents()


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flintshow-", dir="/tmp"))
    mdir = tmp / "model"; shutil.copytree(ROOT / "app" / "test" / "fixtures" / "flint-model", mdir)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FLINT_MODEL_DIR": str(mdir)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d; tok = d["token"]
        inv = api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder"}, token=tok)[1]["invite"]
        sam = api("/join", "POST", {"code": inv["code"], "name": "Sam Ortiz"})[1]["token"]
        tasks = lambda: [t for t in api("/tasks", token=tok)[1]["tasks"]]
        titles = lambda: sorted(t["title"] for t in tasks())
        assert api("/docs", "POST", {"title": "Pricing notes", "body": "Three plans, the middle one at twelve dollars a month.\n"}, token=tok)[0] == 200
        assert api("/chat/general", "POST", {"text": "can we make the subscription cheaper for schools"}, token=sam)[0] == 200
        assert api("/chat/general", "POST", {"text": "the boss fight is way too hard"}, token=sam)[0] == 200

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}})); localStorage.setItem('tribecode.flint.brain', 'none');")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: "sandboxed" not in str(e) and errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintPlan && window.TribeFlintFacts && window.TribeFlintConv && window.TribeFlintSem && window.TribeFlintDevice", timeout=30000)
            pg.wait_for_selector("#fl-input", state="visible", timeout=20000)
            assert pg.evaluate("TribeFlintModel.installed()") is False

            # ---------- follow-ups ----------
            said, _ = ask(pg, "add a task to buy flour"); assert "Buy flour" in said
            said, _ = ask(pg, "and another one to book the hall"); assert "Book the hall" in said, said
            said, _ = ask(pg, "its due friday"); assert "Book the hall" in said, said
            hall = [t for t in tasks() if t["title"] == "Book the hall"][0]; assert hall.get("due"), hall
            said, _ = ask(pg, "and its for sam"); assert [t for t in tasks() if t["title"] == "Book the hall"][0].get("assignee"), said
            said, _ = ask(pg, "tell sam the hall is booked"); assert "Sam" in said, said
            said, _ = ask(pg, "set a timer for 10 minutes"); said, _ = ask(pg, "make that 15"); assert "15" in said, said
            said, _ = ask(pg, "never mind, delete it"); assert "Book the hall" not in titles(), (said, titles())
            assert pg.evaluate("TribeFlintLocal.memory().turns().length") >= 5
            pg.evaluate("window.TribeFlintCmds && document.querySelectorAll('.ft-timer [data-x], .tmr-x').forEach(b => b.click())")

            # ---------- a duplicate asks first ----------
            n0 = len(tasks()); said, chips = ask(pg, "add a task to get flour")
            assert "already on the board" in said and "Buy flour" in said and chips[0] == "Add it anyway" and len(tasks()) == n0, (said, chips)
            nmsg = pg.locator("#flint .fl-msg.fl").count(); pg.locator("#flint .fl-act", has_text="Add it anyway").last.click()
            pg.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n", arg=nmsg, timeout=10000); pg.wait_for_timeout(600)
            assert "Get flour" in titles() and len(tasks()) == n0 + 1
            said, _ = ask(pg, "add a task to record the trailer"); assert "Added to Tasks" in said, "an ordinary task is not held up"

            # ---------- the planner ----------
            before = titles(); pg.evaluate("TribeFlint.clear()")
            said, chips = ask(pg, "organise a team offsite by next friday")
            assert "Here is a plan" in said and pg.locator("[data-fplan][data-state=new]").count() == 1, said
            steps = pg.locator("[data-fplan] .fplan-step").all_text_contents(); assert len(steps) == 6, steps
            assert any("budget sheet" in s for s in steps) and any("agenda doc" in s for s in steps) and any("calendar" in s for s in steps), steps
            assert titles() == before, "nothing runs until Run plan"
            assert pg.evaluate("getComputedStyle(document.querySelector('.fplan')).boxShadow") == "none"
            pg.click("[data-fplan] [data-fplan-skip='4']"); assert pg.locator("[data-fplan] .fplan-step.is-skip").count() == 1
            if take: SHOTS.mkdir(parents=True, exist_ok=True)
            pg.click("[data-fplan-run]")
            pg.wait_for_selector("[data-fplan][data-state=done]", timeout=60000)
            st8 = pg.evaluate("TribeFlintPlan.state()"); assert [s["st"] for s in st8["steps"]] == ["ok", "ok", "ok", "ok", "skip", "ok"], st8
            assert pg.locator("[data-fplan] [role=progressbar]").get_attribute("aria-valuenow") == "5" and "5 of 5 done" in pg.inner_text("[data-fplan] .fplan-sum")
            new = [t for t in titles() if t not in before]; assert new == ["Book a place for the team offsite", "Send the invites for the team offsite"], new
            assert all(t.get("due") for t in tasks() if t["title"] in new), "the date went onto the tasks"
            docs = [d["title"] for d in api("/docs", token=tok)[1]["docs"]]; assert len(docs) >= 3, docs   # the budget sheet and the agenda doc joined the pricing notes
            if take:   # the whole card: give Flint's thread the room for it, for the picture only
                pg.add_style_tag(content=".fl-thread { max-height: none !important; height: 560px !important; } #flint { max-height: none !important; }")
                pg.locator("[data-fplan]").scroll_into_view_if_needed(); pg.wait_for_timeout(300); pg.screenshot(path=str(SHOTS / "flint-plan-card.png"))
            ev0 = api("/calendar", token=tok)[1]
            pg.click("[data-fplan-undo]"); pg.wait_for_selector("[data-fplan] .fplan-step.is-undone", timeout=10000)
            assert json.dumps(api("/calendar", token=tok)[1]) != json.dumps(ev0), "Undo last step took the calendar entry back"
            assert [t for t in titles() if t not in before] == new, "and only that step"
            said, _ = ask(pg, "plan my day"); assert "Here is a plan" not in said
            said, _ = ask(pg, "make a landing page for sunrise bakery"); assert pg.locator("[data-fplan]").count() == 1, "a plain build is still one command, no plan"

            # ---------- project memory ----------
            pg.evaluate("TribeFlint.clear()")
            said, chips = ask(pg, "the bake sale is on Saturday 14 June"); assert said.startswith("Noted: bake sale → Saturday 14 June") and "What Flint knows" in chips, said
            said, _ = ask(pg, "we decided to drop multiplayer for the first release"); assert said.startswith("Noted:"), said
            said, _ = ask(pg, "when is the bake sale?"); assert "Saturday 14 June" in said and "what I know about this project" in said, said
            said, _ = ask(pg, "what did we decide about multiplayer?"); assert "drop multiplayer" in said, said
            pfile = list((tmp / "tribe").rglob("flint-facts.json")); assert len(pfile) == 1 and ".tribe" in str(pfile[0]), pfile
            stored = json.loads(pfile[0].read_text()); assert [f["kind"] for f in stored["facts"]] == ["date", "decision"] and "never sent anywhere" in stored["about"], stored
            assert api("/flint/facts")[0] == 401
            pg.evaluate("document.querySelector('#chat-input') && (document.querySelector('#chat-input').value = 'heads up: the demo is on 3 December')"); pg.evaluate("TribeFlintFacts.learn('heads up: the demo is on 3 December', 'chat')"); pg.wait_for_timeout(400)
            pg.locator("#flint .fl-act", has_text="What Flint knows").last.click(); pg.wait_for_selector("#flint-facts .ffx-row", timeout=10000)
            sheet = pg.inner_text("#flint-facts"); assert "What Flint knows about this project" in sheet and "never sent anywhere" in sheet and "DATES" in sheet.upper() and "DECISIONS" in sheet.upper(), sheet
            assert pg.locator("#flint-facts .ffx-row").count() == 3
            row = pg.locator("#flint-facts .ffx-row", has=pg.locator(".ffx-k[value='bake sale']")); row.locator(".ffx-v").fill("Sunday 15 June"); row.locator(".ffx-v").dispatch_event("change"); pg.wait_for_timeout(500)
            pg.locator("#flint-facts .ffx-row", has=pg.locator(".ffx-k[value='demo']")).locator("[data-ffx-del]").click(); pg.wait_for_function("document.querySelectorAll('#flint-facts .ffx-row').length === 2", timeout=10000)
            pg.fill("#ffx-new", "MVP means the first playable level"); pg.click("#ffx-add button"); pg.wait_for_function("document.querySelectorAll('#flint-facts .ffx-row').length === 3", timeout=10000)
            pg.click("#ffx-pause"); assert pg.evaluate("TribeFlintFacts.paused()") is True
            pg.click("#ffx-done")
            said, _ = ask(pg, "when is the bake sale?"); assert "Sunday 15 June" in said, "an edit wins"
            said, _ = ask(pg, "the picnic is on Friday 20 June"); assert not said.startswith("Noted"), "paused: nothing new is noticed"
            pg.evaluate("TribeFlintFacts.open()"); pg.wait_for_selector("#ffx-pause"); pg.click("#ffx-pause"); assert pg.evaluate("TribeFlintFacts.paused()") is False; pg.click("#ffx-done")
            facts = api("/flint/facts", token=sam)[1]["facts"]; assert sorted(f["key"] for f in facts) == ["MVP", "bake sale", "drop multiplayer for the first"], "the project's members share it"

            # ---------- where did we talk about… (no model) ----------
            said, chips = ask(pg, "where did we talk about how much it costs?")
            assert "comes up" in said and any(c.startswith("Doc · Pricing notes") for c in chips) and any("cheaper for schools" in c for c in chips), (said, chips)
            assert not any("boss fight" in c for c in chips)
            pg.locator("#flint .fl-act", has_text="Doc · Pricing notes").last.click(); pg.wait_for_timeout(800)

            # ---------- Running on your device ----------
            pg.evaluate("TribeFlintPage.open('', 'device')"); pg.wait_for_selector("#fp-device #fdv-run", timeout=10000)
            lv = pg.locator(".fpg-lv").all_text_contents(); assert len(lv) == 5 and "Local brain" in lv[1] and "Recommended" in lv[1] and "Local model" in lv[2] and "checked and undoable" in lv[2], lv
            pg.wait_for_function("document.querySelectorAll('#fdv-caps li').length === 4", timeout=10000)
            caps = pg.inner_text("#fdv-caps"); assert "WebGPU:" in caps and "cores" in caps and "Free storage" in caps and "Memory" in caps, caps
            c = pg.evaluate("TribeFlintDevice.caps()"); assert isinstance(c["gpu"], bool) and c["cores"] >= 1 and (c["free"] is None or c["free"] > 0), c
            assert pg.locator("#fdv-levels li.on").all_text_contents() == ["●No AIactive"], pg.locator("#fdv-levels li.on").all_text_contents()
            assert "Nothing yet" in pg.inner_text("#fdv-dl")
            priv = pg.inner_text(".fdv-priv"); assert priv.count("Nothing") >= 1 and "Your own AI" in priv and "Credits" in priv and "None of your words" in priv, priv
            pg.click("#fdv-run"); pg.wait_for_selector("#fdv-res[data-done]", timeout=20000)
            res = pg.inner_text("#fdv-res"); m = re.search(r"Understand a command\s+([\d.]+) ms", res); assert m and 0 <= float(m.group(1)) < 50, res
            assert "not installed" in res and "not chosen" in res, res
            r0 = pg.evaluate("TribeFlintDevice.selfTest()"); assert r0["embedsPerSec"] is None and r0["tokensPerSec"] is None and r0["parsed"] == 40, r0
            # with the local brain on this device
            pg.click("#fp-local"); pg.wait_for_selector("#flint-model #fmd-get"); pg.click("#fmd-get"); pg.wait_for_selector("#fmd-installed", timeout=30000); pg.click("#fmd-done")
            pg.wait_for_function("document.querySelectorAll('#fdv-levels li.on').length === 2", timeout=10000)
            assert "tribecode-fixture-64" in pg.inner_text("#fdv-dl") and "KB" in pg.inner_text("#fdv-dl") and pg.inner_text("#fp-local") == "Local brain: manage"
            pg.click("#fdv-run"); pg.wait_for_function("/sentences a second/.test(document.querySelector('#fdv-res').textContent)", timeout=20000)
            r1 = pg.evaluate("TribeFlintDevice.selfTest()"); assert r1["embedsPerSec"] > 500, r1
            pg.locator("#fp-device").scroll_into_view_if_needed()
            if take: pg.screenshot(path=str(SHOTS / "flint-device.png"))
            pg.evaluate("TribeFlintPage.close()")
            # with the brain here, the same question is matched by meaning as well, and everything above still works
            said, chips = ask(pg, "where did we talk about how much it costs?"); assert "local brain" in said and any(c.startswith("Doc · Pricing notes") for c in chips), (said, chips)
            b.close()
        assert not errors, errors
        print(f"e2e_flint_showcase ok: follow-ups, a duplicate asks first, a 6-step plan (one skipped, 5 run, one undone), project memory kept with the project, where-said, "
              f"the device panel (understand a command {m.group(1)} ms; fixture brain {r1['embedsPerSec']} sentences/s)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
