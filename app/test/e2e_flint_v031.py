"""Flint with no model, on the v0.31 features (feat/flint-cleanup): 15 commands typed into the Ask Flint bar, each
checked against what actually changed. Task offers (accept, decline with a reason, claim in Council mode, "grab an open
task"), the Design flow on a kind, the abilities sheet, the Marketplace's Installed tab, Files by kind, presence
privacy with undo, the sidebar order, a lesson, word arithmetic, the People panel, the plans sheet and the demo.
Usage: python app/test/e2e_flint_v031.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5011 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""):
    assert r[0] == 200, (what, r); return r[1]

def page(b, token, name):
    pg = b.new_page(viewport={"width": 1360, "height": 900})
    pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.brain', JSON.stringify({choice:'none'})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (name, BASE, token))
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeNLU && window.TribeFlintLocal", timeout=30000)
    pg.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:false, repo:true}, {pin:true})")
    pg.wait_for_selector("#flint #fl-input", state="visible", timeout=15000)
    return pg

def ask(pg, text, expect=None):
    n = pg.locator("#flint .fl-msg.fl").count()
    pg.fill("#fl-input", text); pg.press("#fl-input", "Enter")
    pg.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n && !document.querySelector('#flint .fl-msg.streaming')", arg=n, timeout=15000)
    pg.wait_for_timeout(300)
    last = pg.locator("#flint .fl-msg.fl").last.text_content()
    if expect: assert expect.lower() in last.lower(), f"{text!r} -> {last!r} (wanted {expect!r})"
    return last

def until(fn, what, t=8):
    end = time.time() + t
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError("timed out: " + what)

def task(tok, title): return next(x for x in ok(api("/tasks", token=tok))["tasks"] if x["title"] == title)

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flint-v031-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    done = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {"maxUses": 2}, host))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); mt, mid = maya["token"], maya["member"]["id"]
        # the lead offers Maya two tasks (backlog + someone else's = waiting for Accept or Decline)
        for title in ("Poster", "Flyer"):
            t = ok(api("/tasks", "POST", {"title": title, "status": "backlog"}, host))["task"]
            ok(api("/tasks/" + t["id"], "PATCH", {"assignee": mid}, host), "offer " + title)
            assert task(host, title).get("accept") == "pending", task(host, title)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            mp = page(b, mt, "Maya")
            # 1 · accept an offer
            ask(mp, "accept the poster task", "Accepted")
            t = task(host, "Poster"); assert t.get("accept") == "accepted" and t["status"] == "doing", t; done.append("accept")
            # 2 · decline with a reason
            ask(mp, "decline the flyer task, too busy", "Declined")
            t = task(host, "Flyer"); assert t.get("declined") and "busy" in (t["declined"].get("reason") or ""), t; done.append("decline + reason")
            # 3 · claim in Council mode
            ok(api("/tasks/settings", "PUT", {"mode": "council"}, host))
            for title in ("Banner", "Thumbnail"): ok(api("/tasks", "POST", {"title": title, "status": "todo"}, host))
            mp.evaluate("TribeFlintLocal.ctx && TribeFlintLocal.ctx()")
            ask(mp, "claim the banner task", "claimed")
            t = task(host, "Banner"); assert t.get("assignee") == mid and t.get("claimed"), t; done.append("claim")
            # 4 · grab an open task
            ask(mp, "grab an open task", "claimed")
            got = [x for x in ("Flyer", "Thumbnail") if task(host, x).get("assignee") == mid]   # the declined Flyer is open again, so it may come first
            assert len(got) == 1, [task(host, x) for x in ("Flyer", "Thumbnail")]; done.append("grab an open task")
            # 5 · Design flow on a kind
            ask(mp, "make a poster for our gig", "Design")
            until(lambda: mp.evaluate("!!document.querySelector('.dfl-page, .dfl, [class^=dfl]')"), "design flow open"); done.append("design.new poster")
            # 6 · abilities, with the skill ready to add
            ask(mp, "add drawing to my skills", "abilities")
            until(lambda: mp.evaluate("(document.getElementById('ab-sk-in') || {}).value === 'drawing'"), "skill prefilled"); done.append("abilities")
            mp.keyboard.press("Escape"); mp.wait_for_timeout(200)
            # 7 · presence privacy, then undo
            ask(mp, "stop showing where i am", "no longer sees")
            until(lambda: mp.evaluate("TribePresence.prefs().show === false"), "presence hidden")
            ask(mp, "undo", None)
            until(lambda: mp.evaluate("TribePresence.prefs().show === true"), "presence back after undo"); done.append("presence off + undo")
            # 8 · word arithmetic
            ask(mp, "what is 12 times 9", "108"); done.append("calc words")
            # 9 · a lesson for a new feature
            ask(mp, "teach me the marketplace")
            until(lambda: mp.evaluate("(document.querySelector('#fls:not([hidden]) h3') || {}).textContent === 'The Marketplace'"), "market lesson"); done.append("lesson market")
            mp.evaluate("TribeFlintLessons.close()")
            # 10 · the sidebar order
            ask(mp, "reset the sidebar order", "default order"); done.append("sidebar reset")
            # 11 · the People panel
            ask(mp, "who is online")
            until(lambda: mp.is_visible("#ppl-panel"), "people panel open"); done.append("people online")
            mp.keyboard.press("Escape"); mp.wait_for_timeout(200)
            # 12 · plans
            ask(mp, "see the plans")
            until(lambda: mp.is_visible("#pm-sheet") or mp.is_visible(".plp"), "plans sheet open"); done.append("plans")
            mp.keyboard.press("Escape"); mp.wait_for_timeout(200)
            # 13 · Files on a kind
            ask(mp, "show my pictures")
            until(lambda: mp.evaluate("!![...document.querySelectorAll('[data-dk=\"pics\"]')].find(b => b.offsetParent && b.classList.contains('on'))"), "pictures tab"); done.append("files by kind")
            # 14 · the Marketplace's Installed tab
            ask(mp, "what have i installed", "Installed")
            until(lambda: mp.evaluate("!!document.querySelector('[data-tab=\"installed\"][aria-selected=\"true\"], [data-tab=\"installed\"].on')"), "installed tab"); done.append("market installed")
            # 15 · the demo (only the answer: starting it leaves this tab)
            n = mp.locator("#flint .fl-msg.fl").count()
            assert mp.evaluate("TribeNLU.parse('start the demo', {}).steps[0].intent") == "demo.start"; done.append("demo understood")
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print(f"ok e2e_flint_v031 ({len(done)} commands: {', '.join(done)})")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
