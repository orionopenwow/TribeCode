"""Flint with no model at all (flint-local: app/ui/flintnlu.js + flintlocal.js, server/flintkb.js): 15 real commands
typed into the Ask Flint bar on desktop, then the phone's full-screen thread at 390px. Checks what actually changed
(tasks, DMs, chat, calendar, theme, accent, language), typos and another language, a many-step command, "it" as the
last task, undo, a taught phrase, "did you mean", a how-to answer from the docs, and the honest card for what needs a
model. Usage: python app/test/e2e_flint_local.py [--shots]"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error, datetime
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4995 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR", "/tmp"))
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""):
    assert r[0] == 200, (what, r); return r[1]

def wait_up():
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/health"); return
        except Exception: time.sleep(0.15)

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(f"{who} console: {m.text[:200]}"))

def ask(page, text, expect=None, scope="#flint", inp="#fl-input", n_new=1):
    n = page.locator(f"{scope} .fl-msg.fl").count()
    page.fill(inp, text); page.press(inp, "Enter")
    page.wait_for_function("([s, n, k]) => document.querySelectorAll(s + ' .fl-msg.fl').length >= n + k && !document.querySelector(s + ' .fl-msg.streaming')", arg=[scope, n, n_new], timeout=15000)
    page.wait_for_timeout(250)
    last = page.locator(f"{scope} .fl-msg.fl").last.text_content()
    if expect: assert expect.lower() in last.lower(), f"{text!r} -> {last!r} (wanted {expect!r})"
    return last

def tasks(tok): return ok(api("/tasks", token=tok))["tasks"]

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flint-local-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Lantern Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    done = []
    try:
        wait_up()
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            host.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'})); localStorage.setItem('tribecode.brain', JSON.stringify('none')); localStorage.setItem('tribecode.flint.brain', 'none')")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("TribeClient.connected() && window.TribeNLU && window.TribeFlintLocal", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            inv = ok(api("/invites", "POST", {"maxUses": 3}, tok))["invite"]
            maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))
            maya_tok, maya_id = maya["token"], maya["member"]["id"]
            host.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:false, repo:true}, {pin:true})")
            host.wait_for_selector("#flint #fl-input", state="visible", timeout=10000)
            host.wait_for_function("(TribeClient.state().members || []).some(m => m.name === 'Maya')", timeout=10000)
            assert "basic mode" in host.text_content("#flint [data-flst]"), "no model is configured"
            tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

            # 1 · a typo'd task with a date
            ask(host, "ad a tsk to buy lanterns tomorow", "Added to Tasks")
            t = next(x for x in tasks(tok) if x["title"] == "Buy lanterns"); assert t.get("due") == tomorrow, t; done.append("typo task + due date")
            # 2 · "it" is the last task
            ask(host, "mark it done", "done")
            assert next(x for x in tasks(tok) if x["title"] == "Buy lanterns")["status"] == "done"; done.append("'it' = last task")
            # 3 · undo puts it back
            ask(host, "undo", "Undone")
            assert next(x for x in tasks(tok) if x["title"] == "Buy lanterns")["status"] != "done"; done.append("undo")
            # 4 · a task for someone, by a weekday
            ask(host, "add a task to fix the menu for Maya by friday", "Added to Tasks")
            t = next(x for x in tasks(tok) if x["title"] == "Fix the menu"); assert t.get("assignee") == maya_id and t.get("due"), t; done.append("assignee + weekday")
            # 5 · a DM to a person
            ask(host, "tell maya the build is up", "Maya")
            dms = ok(api("/chat/dm-" + "-".join(sorted([host.evaluate("TribeClient.state().me.id"), maya_id])), token=maya_tok))["messages"]
            assert any("the build is up" in (m.get("text") or "") for m in dms), dms; done.append("DM")
            # 6 · a many-step command: a task, then a chat post that summarizes it
            ask(host, "add a task to order samples for friday, then tell everyone", "Done")
            assert any(x["title"] == "Order samples" for x in tasks(tok))
            gen = ok(api("/chat/general", token=tok))["messages"]
            assert any("Order samples" in (m.get("text") or "") for m in gen), [m.get("text") for m in gen[-3:]]; done.append("many steps")
            # 7 · the calendar
            ask(host, "schedule a playtest tomorrow at 5pm", "calendar")
            cal = ok(api("/calendar", token=tok))
            assert any("Playtest" in e["title"] for e in cal["events"]), cal["events"]; done.append("calendar event")
            # 8 · theme, then undo restores it
            before = host.evaluate("document.body.dataset.theme || ''")
            ask(host, "switch to the nordic theme", "Nordic")
            host.wait_for_function("document.body.dataset.theme === 'nordic'", timeout=5000)
            ask(host, "undo", "Undone")
            host.wait_for_function("b => (document.body.dataset.theme || '') === b", arg=before, timeout=5000); done.append("theme + undo")
            # 9 · accent color
            ask(host, "change the accent to teal", "teal")
            assert (host.evaluate("TribeStore.get().look.accent") or "").lower() == "#38c6b1"; done.append("accent")
            # 10 · Spanish
            ask(host, "añade una tarea comprar velas mañana", "Comprar velas")
            assert any(x["title"] == "Comprar velas" and x.get("due") == tomorrow for x in tasks(tok)); done.append("Spanish")
            # 11 · teach a phrase, then use it
            ask(host, "when i say standup, open the calendar", "standup")
            ask(host, "standup", "Opened")
            host.wait_for_function("location.hash.includes('calendar') || document.body.dataset.view === 'calendar' || !!document.querySelector('#view-calendar:not(.hidden), .cal-view')", timeout=5000)
            assert ok(api("/flint/learned", token=tok))["items"][0]["say"] == "standup"; done.append("taught phrase")
            # 12 · local math
            ask(host, "split 120 between 4 people", "30"); done.append("math")
            # 13 · how-to from the docs, no model
            last = ask(host, "how does cloud save work")
            assert "basic mode" not in last.lower() and ("save" in last.lower() or "copy" in last.lower()), last; done.append("how-to answer from the docs")
            ask(host, "how do i invite a friend")   # an ask that is really a command: opens Invite
            host.wait_for_selector("#invite-modal:not(.hidden)", timeout=5000)
            host.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            # 14 · "did you mean" for a near miss, and the chip teaches + runs
            last = ask(host, "shedule thing", "one of these")
            chip = host.locator("#flint .fl-msg.fl").last.locator(".fl-act").first; label = chip.text_content()
            n_learned = len(ok(api("/flint/learned", token=tok))["items"])
            chip.click(); host.wait_for_timeout(900)
            assert len(ok(api("/flint/learned", token=tok))["items"]) == n_learned + 1, "tapping a 'did you mean' teaches Flint"; done.append(f"did you mean ({label})")
            # 15 · the honest card for what needs a model
            last = ask(host, "write me a sonnet about our bug tracker", "basic mode")
            last_msg = host.locator("#flint .fl-msg.fl").last   # feat/flint-site: the one AI-boost pair (aiboost.js)
            assert last_msg.locator(".fl-act", has_text="Use my AI").count() == 1 and last_msg.locator(".fl-act", has_text="Get credits / Premium").count() == 1 and "This one needs an AI" in last; done.append("honest card")
            if take: host.wait_for_timeout(300); host.locator("#flint").screenshot(path=str(SHOTS / "flint-local-desktop.png"))

            # ---- the phone at 390px
            pinv = ok(api("/invites", "POST", {"maxUses": 2}, tok))["invite"]
            ctx = b.new_context(**PHONE); ph = ctx.new_page(); watch(ph, "phone")
            ph.add_init_script("localStorage.setItem('tribecode.flint.brain', 'none')")
            ph.goto(f"{BASE}/join/{pinv['code']}")
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Sam"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet"); ph.click("#ins-later")
            ph.wait_for_function("TribeClient.connected() && window.TribeFlintLocal", timeout=15000)
            ph.evaluate("TribeFlint.openFull()")
            ph.wait_for_selector("#flint-full #ff-input", state="visible")
            sam_tok = ph.evaluate("TribeStore.get().server.token")
            ask(ph, "remind me to charge the speaker tonight", "Added to Tasks", scope="#flint-full", inp="#ff-input")
            assert any(x["title"] == "Charge the speaker" for x in tasks(sam_tok))
            ask(ph, "whats overdue", None, scope="#flint-full", inp="#ff-input")
            w = ph.evaluate("document.documentElement.scrollWidth"); assert w <= 391, w
            if take: ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "flint-local-phone.png"))
            done.append("phone 390px")
            b.close()
        bad = [e for e in errors if "Failed to load resource" not in e and "net::" not in e]
        assert not bad, bad
        print("e2e_flint_local: OK (" + ", ".join(done) + ")")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
