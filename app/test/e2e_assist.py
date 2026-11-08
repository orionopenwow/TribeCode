"""Assist (server/assist.js, app/ui/assist.js): write the vision with help, and suggested tasks in New task.
- The vision composer opens from the Overview checklist: category chips (pre-picked from project sense) and one gist
  box fill the draft locally; "Improve with" Flint drafts it in basic mode (no local model); Save ticks the row.
- My Claude: the ask lands in your private chat with your agent; the agent's reply (simulated via the API) fills the editor.
- New task shows 3-5 suggestions; one tap adds a task, ✕ dismisses it (remembered), no duplicates of open tasks.
- Phone at 390px: the New task sheet, Up next and the composer, with no sideways scroll; no console errors.
Usage: python app/test/e2e_assist.py   (writes docs/screenshots/assist-*.png and phone-assist-*.png)"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4991 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && (e.value || e.textContent).includes(t); }", arg=[sel, text], timeout=timeout)

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text[:200]}"))

def api(path, method="GET", body=None, token=None, project=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""):
    assert r[0] == 200, (what, r); return r[1]

def no_overflow(page, where):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"horizontal overflow on {where}"

def shot(page, name):
    page.wait_for_timeout(350); page.screenshot(path=str(SHOTS / f"{name}.png"))

def words(s): return set(w for w in re.sub(r"[^a-z0-9 ]+", " ", s.lower()).split() if len(w) > 2)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-assist-")
    repo = os.path.join(tmp, "pixel-quest")
    g = lambda *a: subprocess.run(["git", "-C", repo, "-c", "user.email=maya@t", "-c", "user.name=Maya", *a], check=True, capture_output=True)
    os.makedirs(os.path.join(repo, "assets"))
    subprocess.run(["git", "init", "-q", "-b", "main", repo], check=True)
    Path(repo, "README.md").write_text("# Pixel Quest\n\nA tiny platformer.\n")
    Path(repo, "index.html").write_text("<!doctype html><title>Pixel Quest</title><script src='game.js'></script>\n")
    Path(repo, "game.js").write_text("// TODO: add a pause menu\nconsole.log('hi')\n")
    Path(repo, "assets", "hero.txt").write_text("sprite\n")
    g("add", "-A"); g("commit", "-q", "-m", "Pixel Quest: first level")
    work = os.path.join(tmp, "tribe")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", work, "--name", "Pixel Quest", "--repo", repo, "--ollama", "http://localhost:9"],
                           stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            htok = host.evaluate("TribeStore.get().server.token")
            orion = ok(api("/me", token=htok))["member"]["id"]
            host.wait_for_function("window.TribeProjects && TribeProjects.cur()")
            pj = host.evaluate("TribeProjects.cur()")
            pid, pname = pj["id"], pj["name"]

            # ---- server: guesses come from the project's name and the game template; agents and strangers are refused
            ctx = ok(api("/assist/vision", token=htok, project=pid), "assist context")
            assert ctx["kind"] == "game" and "game" in ctx["types"], ctx["types"]
            assert ctx["answers"]["what"].startswith(pname) and "short levels" in ctx["answers"]["who"], ctx["answers"]
            assert ctx["helpers"]["claude"] is None and ctx["model"]["online"] is False
            assert api("/assist/vision", token=None)[0] == 401
            d = ok(api("/assist/vision", "POST", {"helper": "flint", "answers": ctx["answers"]}, token=htok, project=pid))
            assert d["by"] == "basic" and "## Done for v1" in d["draft"] and "## Out of scope" in d["draft"], d

            # ---- the composer opens from the checklist with prefilled prompts
            host.evaluate("TribeApp.show('home')")
            host.wait_for_selector("#pj-check [data-ck=vision]")
            host.click("#pj-check [data-ck=vision]")
            host.wait_for_selector(".av-wrap #av-gist")
            what = host.input_value("#av-gist")
            assert pname in what, what
            assert host.get_attribute(".av-cat[data-cat=game]", "aria-checked") == "true", "sense says game"
            assert "## Done for v1" in host.input_value("#pj-vtext"), "the local draft is there at once"
            assert host.locator(".av-imp[data-helper=claude]").is_disabled(), "no Claude connected yet"
            # the draft follows the gist
            host.fill("#av-gist", "A cozy game")
            assert host.input_value("#pj-vtext").startswith("## What\nA cozy game."), host.input_value("#pj-vtext")
            # Flint improves it (basic mode: no local model)
            host.fill("#av-gist", what)
            host.click(".av-imp[data-helper=flint]")
            wait_text(host, "#pj-vtext", "## Done for v1")
            wait_text(host, "#av-status", "from your answers")
            assert pname in host.input_value("#pj-vtext"), (pname, host.input_value("#pj-vtext"))
            shot(host, "assist-vision")
            host.click(".av-wrap [data-close]")

            # ---- My Claude: the ask goes to the private chat; the agent's reply fills the editor
            ag = ok(api("/agents", "POST", token=htok, project=pid), "connect claude")
            atok, aid = ag["token"], ag["agent"]["id"]
            host.wait_for_function("(TribeClient.state().members || []).some(m => m.role === 'agent')")
            host.click("#pj-check [data-ck=vision]")
            host.wait_for_selector(".av-imp[data-helper=claude]:not([disabled])")
            host.click(".av-imp[data-helper=claude]")
            wait_text(host, "#av-status", "Waiting for your Claude")
            ch = "dm-" + "-".join(sorted([orion, aid]))
            msgs = ok(api(f"/chat/{ch}", token=htok, project=pid))["messages"]
            assert any("Help me write the vision" in m["text"] and m["by"] == orion for m in msgs), msgs
            ok(api(f"/chat/{ch}", "POST", {"text": "@Orion A cozy pixel platformer friends finish in one sitting.\nFor friends on a couch.\n\n## Done for v1\n- Three levels\n- A boss\n\n## Out of scope\n- Online play"}, token=atok, project=pid), "agent reply")
            wait_text(host, "#pj-vtext", "cozy pixel platformer friends finish")
            assert not host.input_value("#pj-vtext").startswith("@"), "the @mention is stripped"
            wait_text(host, "#av-status", "Drafted by your Claude")
            # Save: VISION.md, the checklist ticks
            host.click("#pj-vsave")
            host.wait_for_selector("#invite-modal.hidden", state="attached")
            host.wait_for_selector("#pj-check [data-step=vision].on", timeout=10000)
            assert "Three levels" in ok(api("/vision", token=htok, project=pid))["text"]

            # ---- suggested tasks: no duplicates, one tap adds, ✕ is remembered
            ok(api("/tasks", "POST", {"title": "Add a title screen with a Start button", "status": "backlog"}, token=htok, project=pid))
            s1 = ok(api("/assist/tasks", token=htok, project=pid))["suggestions"]
            assert 3 <= len(s1) <= 5, s1
            assert not any("title screen" in s["title"].lower() for s in s1), s1
            srcs = {s["src"] for s in s1}
            assert "vision" in srcs, s1   # "Three levels" / "A boss" from the saved vision
            allt = [s["title"] for s in s1]
            assert len(set(map(lambda t: frozenset(words(t)), allt))) == len(allt), "no duplicate suggestions"
            host.wait_for_selector("#pj-check [data-ck=newtask]")
            host.click("#pj-check [data-ck=newtask]")
            host.wait_for_selector("#as-tasks .as-idea", timeout=10000)
            k = host.locator("#as-tasks .as-idea").count(); assert 3 <= k <= 5, k
            ui_titles = host.eval_on_selector_all("#as-tasks .as-it b", "els => els.map(e => e.textContent)")
            assert not any("title screen" in t.lower() for t in ui_titles), ui_titles
            shot(host, "assist-tasks")
            first, second = host.eval_on_selector_all("#as-tasks .as-idea", "els => els.slice(0, 2).map(e => [e.dataset.sid, e.querySelector('b').textContent])")
            host.click(f"#as-tasks [data-sid='{first[0]}'] [data-as-add]")
            for _ in range(50):
                if any(t["title"] == first[1] for t in ok(api("/tasks", token=htok, project=pid))["tasks"]): break
                time.sleep(0.1)
            else: raise AssertionError("tapping a suggestion did not create the task")
            host.wait_for_selector(f"#as-tasks [data-sid='{first[0]}']", state="detached")
            host.click(f"#as-tasks [data-sid='{second[0]}'] [data-as-dismiss]")
            host.wait_for_selector(f"#as-tasks [data-sid='{second[0]}']", state="detached")
            for _ in range(30):
                s2 = ok(api("/assist/tasks", token=htok, project=pid))["suggestions"]
                if second[0] not in [s["id"] for s in s2]: break
                time.sleep(0.1)
            assert second[0] not in [s["id"] for s in s2] and first[0] not in [s["id"] for s in s2], s2
            assert not any(s["title"] == first[1] for s in s2), "an added task is not suggested again"
            # More ideas (no model: the next heuristics)
            host.click("#as-tasks [data-as-more]")
            host.wait_for_function("document.querySelectorAll('#as-tasks .as-idea').length >= 3")
            # remembered after a reload
            host.reload(); wait_text(host, "#sync-status", "connected")
            host.evaluate("TribeApp.show('tasks')"); host.click("#task-new")
            host.wait_for_selector("#as-tasks .as-idea")
            assert host.locator(f"#as-tasks [data-sid='{second[0]}']").count() == 0, "dismissed stays dismissed"
            no_overflow(host, "desktop tasks")

            # ---- phone at 390px: Up next, the New task sheet, the composer
            st, inv = api("/invites", "POST", {"maxUses": 3}, htok); assert st == 200, inv
            pc = b.new_context(**PHONE); phone = pc.new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{inv['invite']['code']}")
            phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            phone.evaluate("document.querySelector('#hi-banner') && document.querySelector('#hi-banner').remove()")
            mtok = phone.evaluate("TribeStore.get().server.token")
            phone.click('#tabbar [data-nav="tasks"]')
            phone.wait_for_selector("#m2-sugg-tasks .as-idea", timeout=10000)
            no_overflow(phone, "phone tasks")
            shot(phone, "phone-assist-tasks")
            phone.click("#task-new"); phone.wait_for_selector("#m2-task-sheet .as-idea", timeout=10000)
            no_overflow(phone, "phone new task sheet")
            mid, mtitle = phone.eval_on_selector("#m2-task-sheet .as-idea", "e => [e.dataset.sid, e.querySelector('b').textContent]")
            phone.click(f"#m2-task-sheet [data-sid='{mid}'] [data-as-add]")
            for _ in range(50):
                if any(t["title"] == mtitle for t in ok(api("/tasks", token=mtok))["tasks"]): break
                time.sleep(0.1)
            else: raise AssertionError("phone: tapping a suggestion did not create the task")
            phone.evaluate("TribeMobile.closeSheet()")
            phone.evaluate("TribeApp.show('home'); TribeAssist.vision(TribeProjects.cur(), { host: false })")
            phone.wait_for_selector(".av-wrap #av-cats .av-cat")
            assert "Three levels" in phone.input_value("#pj-vtext"), "with a vision already saved, it starts from it"
            assert phone.locator("#pj-vsave").inner_text().strip() == "Send to chat"
            phone.click(".av-imp[data-helper=flint]"); wait_text(phone, "#av-status", "Drafted by Flint")
            no_overflow(phone, "phone vision composer")
            shot(phone, "phone-assist-vision")
            # spectators/agents: assist is for people
            assert api("/assist/tasks", token=atok, project=pid)[0] == 403
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_assist: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
