"""Widgets v2 (app/ui/wcards.js, app/ui/widgets.js, server/widgets.js, reorder.js): the "+ Add" picker and every widget.

  Picker: lists every widget (live cards + built-in views), categories, search, a preview before adding, "Added ✓",
          no duplicates unless a widget allows more, arrow keys, Esc; on Home it only offers Home's cards and links.
  Every card: add it, its main interaction, survives a reload, then remove; the ⋯ menu (Settings, Refresh, Rename,
          Move up/down, Remove) and Esc; reorder (Alt+↑ and a pointer drag by the header); live between two members
          (note, checklist, poll, Accept); a spectator only looks; empty and error states (Retry); 390px layout.
Usage: python app/test/e2e_widgets_v2.py [--shots]   (--shots saves docs/screenshots/widgets-picker.png, widgets-sidebar.png)
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5871 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
CARDS = ["mytasks", "presence", "activity", "clocks", "poll", "timeline", "ritual", "countdown", "checklist", "build", "ship",
         "thumb", "sitestatus", "note", "bookmarks", "quickdocs", "inspo", "tip", "credits"]
HOME_CARDS = ["presence", "activity", "clocks", "countdown", "checklist", "note", "bookmarks", "quickdocs", "tip", "credits"]
BUILT = ["whiteboard", "calendar", "bugs", "board", "milestones", "repo", "visuals", "website", "preview", "workshop", "plan", "secretary", "captures", "assets", "mcp", "market"]
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


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "Content Security Policy" not in m.text and "X-Frame-Options" not in m.text and "frame-ancestors" not in m.text and errors.append(f"{who} console: {m.text}"))


def make_repo(path):
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def card(page, key):
    return f"#wg-cards .wgc[data-key='{key}']"


def settled(page, key, timeout=15000):
    """The card is drawn and has loaded (no Loading…), and shows no error."""
    page.wait_for_selector(card(page, key), state="visible", timeout=timeout)
    page.wait_for_function("s => { const c = document.querySelector(s); return c && !c.querySelector('.wgc-loading'); }", arg=card(page, key), timeout=timeout)
    assert page.locator(card(page, key) + " .wgc-err").count() == 0, f"{key} shows an error: {page.inner_text(card(page, key))}"


def add(page, key):
    page.click("#nest-add"); page.wait_for_selector("#wg-picker")
    page.click(f"#wg-picker [data-wcard='{key}']")
    page.wait_for_selector("#wg-picker", state="detached")
    settled(page, key)


def widgets(token, pid):
    return ok(api(f"/projects/{pid}/widgets", token=token))


def cards_of(token, pid):
    return [w for w in widgets(token, pid)["widgets"] if w["kind"] == "card"]


def wid(token, pid, key):
    return next(w["id"] for w in cards_of(token, pid) if w["key"] == key)


def menu(page, key, item):
    page.click(card(page, key) + " .wgc-more"); page.wait_for_selector("#wg-menu")
    page.click(f"#wg-menu [data-wm='{item}']")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-wv2-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="wv2-src-", dir="/tmp")
    pq = os.path.join(work, "pixel-quest")
    shutil.copytree(ROOT / "templates" / "starter-game", pq); make_repo(pq)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Widget Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": pq}, token=orion), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        mj = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya = mj["token"]; maya_id = mj["member"]["id"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---- API: cards, their state, permissions
        assert set(widgets(orion, pid)["cards"]) == set(CARDS), widgets(orion, pid)["cards"]
        assert api(f"/projects/{pid}/widgets", "PUT", {"widgets": [{"kind": "card", "key": "nope"}]}, token=orion)[0] == 400
        d = ok(api(f"/projects/{pid}/widgets", "PUT", {"widgets": [{"kind": "card", "key": "tip"}, {"kind": "card", "key": "tip"}, {"kind": "card", "key": "note"}, {"kind": "card", "key": "note"}]}, token=orion))
        assert [w["key"] for w in d["widgets"]] == ["tip", "note", "note"], "one tip (no duplicates), two notes (allowed)"
        n1 = d["widgets"][1]["id"]
        assert api("/widgets/act", "POST", {"scope": pid, "wid": n1, "op": "set", "text": "x"}, token=sam)[0] == 403, "spectators can't write"
        assert api(f"/projects/{pid}/widgets", "PUT", {"widgets": []}, token=sam)[0] == 403
        ok(api("/widgets/act", "POST", {"scope": pid, "wid": n1, "op": "set", "text": "hello"}, token=maya), "builders write")
        assert widgets(orion, pid)["data"][n1]["text"] == "hello"
        assert api("/widgets/home", "PUT", {"widgets": [{"kind": "card", "key": "timeline"}]}, token=orion)[0] == 400, "project-only cards stay off Home"
        assert api("/widgets/home", "PUT", {"widgets": [{"kind": "builtin", "key": "bugs"}]}, token=orion)[0] == 400
        ok(api(f"/projects/{pid}/widgets", "PUT", {"widgets": []}, token=orion))
        assert widgets(orion, pid)["data"] == {}, "removing a card takes its state with it"

        # ---- real data for the cards to show
        ok(api("/vision", "PUT", {"text": "# Game\n\nA small platformer."}, token=orion, project=pid))
        task = ok(api("/tasks", "POST", {"title": "Draw the title screen", "assignee": maya_id}, token=orion, project=pid))["task"]
        assert task.get("accept") == "pending", task
        start = (datetime.now() + timedelta(hours=3)).replace(microsecond=0)
        ok(api("/calendar", "POST", {"title": "Standup", "start": start.isoformat(), "end": (start + timedelta(minutes=15)).isoformat(), "ritual": "standup"}, token=orion, project=pid), "ritual")
        prop = ok(api("/proposals", "POST", {"title": "Playable demo", "body": "- Level one\n- Title screen"}, token=orion, project=pid))["proposal"]
        for t in (orion, maya): api(f"/proposals/{prop['id']}/vote", "POST", {"vote": "yes"}, token=t, project=pid)
        assert ok(api("/milestones", token=orion, project=pid))["milestones"], "a milestone from the approved proposal"
        ok(api("/dash/signal", "POST", {"kind": "build", "ok": True, "text": "npm run build: ok"}, token=orion, project=pid))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}); hctx.add_init_script(settings_js("Orion", orion, pid))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid && window.TribeCards", arg=pid, timeout=15000)
            host.wait_for_selector("#nest-add", state="visible", timeout=15000)

            # ---- the picker: every widget, categories, search, preview, keys
            host.click("#nest-add"); host.wait_for_selector("#wg-picker")
            listed = host.evaluate("[...document.querySelectorAll('#wg-picker [data-wcard]')].map(e => e.dataset.wcard)")
            assert sorted(listed) == sorted(CARDS), listed
            assert sorted(host.evaluate("[...document.querySelectorAll('#wg-picker [data-wadd]')].map(e => e.dataset.wadd)")) == sorted(BUILT)
            icons = host.evaluate("[...document.querySelectorAll('#wg-picker [data-wcard]')].every(e => e.querySelector('.wgx-top svg') && e.querySelector('small').textContent.trim())")
            assert icons, "each card has an icon and a one-line description"
            host.click("#wg-picker [data-wcat='Team']")
            assert host.is_visible("#wg-picker [data-wcard='mytasks']") and host.is_hidden("#wg-picker [data-wcard='note']") and host.is_hidden("#wg-picker [data-wadd='bugs']")
            host.keyboard.press("ArrowRight"); assert host.evaluate("document.activeElement.dataset.wcat") == "Plan", "the tabs walk with the arrows"
            host.click("#wg-picker [data-wcat='all']")
            host.fill("#wgx-q", "scratch"); assert host.is_visible("#wg-picker [data-wcard='note']") and host.is_hidden("#wg-picker [data-wcard='poll']")
            host.fill("#wgx-q", "")
            host.hover("#wg-picker [data-wcard='poll']"); host.wait_for_selector("#wgx-pv h4:has-text('Poll')")
            assert host.is_visible("#wgx-pv .wgc-mini") and host.is_visible("#wgx-pv-add")
            host.focus("#wg-picker [data-wcard='mytasks']"); host.keyboard.press("ArrowRight")
            assert host.evaluate("document.activeElement.dataset.wcard") == "presence", host.evaluate("document.activeElement.outerHTML.slice(0, 80)")
            host.wait_for_selector("#wgx-pv h4:has-text(\"Who's here\")")
            if SHOTS:
                host.wait_for_timeout(300); host.screenshot(path=str(ROOT / "docs" / "screenshots" / "widgets-picker.png"))
            host.keyboard.press("Escape"); host.wait_for_selector("#wg-picker", state="detached")
            assert host.evaluate("document.activeElement && document.activeElement.id") == "nest-add", "focus goes back to + Add"

            # ---- add every card, then its main interaction
            for k in CARDS:
                add(host, k)
                txt = host.inner_text(card(host, k))
                if k == "mytasks": assert "Nothing on your plate" in txt and host.is_visible(card(host, k) + " [data-wgc-act]"), txt
                if k == "presence": assert "Orion" in txt or "Only you" in txt, txt
                if k == "timeline": assert "v0.1.0" in txt and "Playable demo" in txt, txt
                if k == "ritual": assert "Standup" in txt and ("h" in txt or "m" in txt), txt
                if k == "build": assert "passing" in txt, txt
                if k == "ship": assert "main" in txt, txt
                if k == "thumb": assert host.locator(card(host, k) + " .wgc-shot").count() == 1
                if k == "sitestatus": assert "No website yet" in txt and host.is_visible(card(host, k) + " [data-wgc-act='site']"), txt
                if k == "quickdocs": assert "No docs yet" in txt, txt
                if k == "inspo": assert "inspiration board is empty" in txt, txt
                if k == "credits": assert "AI credits" in txt and "Free" in txt, txt
                if k == "tip":
                    before = host.inner_text(card(host, k) + " .wgc-tip"); host.click(card(host, k) + " [data-wgc-act='tipnext']")
                    assert host.inner_text(card(host, k) + " .wgc-tip") != before
                if k == "clocks":
                    host.click(card(host, k) + " [data-wgc-act='tz']")
                    host.wait_for_function("s => document.querySelector(s).querySelector('.wgc-list') && document.querySelector(s).innerText.includes('Orion')", arg=card(host, k), timeout=10000)
                if k == "note":
                    host.fill(card(host, k) + " textarea", "Palette: warm, 4 colors")
                    host.wait_for_function("s => document.querySelector(s + ' [data-wgc-saved]').textContent.includes('Saved')", arg=card(host, k), timeout=10000)
                if k == "checklist":
                    for item in ("Title screen", "Sound"):
                        host.fill(card(host, k) + " .wgc-add input", item); host.press(card(host, k) + " .wgc-add input", "Enter")
                        host.wait_for_selector(card(host, k) + f" .wgc-txt:has-text('{item}')")
                    host.check(card(host, k) + " input[type=checkbox] >> nth=0")
                    host.wait_for_selector(card(host, k) + " .wgc-txt.done"); host.wait_for_selector(card(host, k) + " :text('1/2 done')")
                if k == "bookmarks":
                    host.fill(card(host, k) + " .wgc-add input", "example.com/docs"); host.press(card(host, k) + " .wgc-add input", "Enter")
                    host.wait_for_selector(card(host, k) + " a.wgc-link[href='https://example.com/docs']")
                if k == "countdown":
                    host.wait_for_selector("#wgc-settings")   # a countdown asks for its date right away
                    host.fill("#wgc-settings [name=title]", "Demo day"); host.fill("#wgc-settings [name=date]", (datetime.now() + timedelta(days=12)).strftime("%Y-%m-%d"))
                    host.click("#wgc-settings .btn.primary"); host.wait_for_selector(card(host, k) + " .wgc-big:has-text('Demo day')")
                    assert "d " in host.inner_text(card(host, k) + " .wgc-num")
                if k == "poll":
                    host.wait_for_selector("#wgc-settings")
                    host.fill("#wgc-settings [name=q]", "Which art style?"); host.fill("#wgc-settings [name=o0]", "Pixel art"); host.fill("#wgc-settings [name=o1]", "Low-poly")
                    host.click("#wgc-settings .btn.primary"); host.wait_for_selector(card(host, k) + " .wgc-q:has-text('Which art style?')")
                    host.click(card(host, k) + " [data-wgc-vote='0']"); host.wait_for_selector(card(host, k) + " .wgc-opt.on")
                # no duplicates unless the card allows more: the picker says so
                host.click("#nest-add"); host.wait_for_selector("#wg-picker")
                multi = k in ("note", "checklist", "bookmarks", "countdown", "poll")
                assert host.is_disabled(f"#wg-picker [data-wcard='{k}']") != multi, k
                assert "Added ✓" in host.inner_text(f"#wg-picker [data-wcard='{k}']"), k
                host.keyboard.press("Escape"); host.wait_for_selector("#wg-picker", state="detached")
            assert [w["key"] for w in cards_of(orion, pid)] == CARDS
            assert not host.evaluate("[...document.querySelectorAll('#wg-cards .wgc-t')].some(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')"), "no clipped titles"
            heights = host.evaluate("[...document.querySelectorAll('#wg-cards .wgc-h')].map(e => e.getBoundingClientRect().height)")
            assert len(set(round(h) for h in heights)) == 1, f"one header height: {heights}"
            widths = host.evaluate("[...document.querySelectorAll('#wg-cards .wgc')].map(e => Math.round(e.getBoundingClientRect().width))")
            assert len(set(widths)) == 1, f"one card width: {widths}"

            # ---- reload: everything persists
            host.reload(); host.wait_for_function("() => document.querySelectorAll('#wg-cards .wgc').length === %d" % len(CARDS), timeout=20000)
            assert host.evaluate("[...document.querySelectorAll('#wg-cards .wgc')].map(e => e.dataset.key)") == CARDS
            settled(host, "note"); assert host.input_value(card(host, "note") + " textarea") == "Palette: warm, 4 colors"
            settled(host, "poll"); assert host.locator(card(host, "poll") + " .wgc-opt.on").count() == 1
            settled(host, "checklist"); assert host.locator(card(host, "checklist") + " .wgc-txt.done").count() == 1

            # ---- the ⋯ menu: Esc closes it; Rename; Move up / down; reorder by keys and by dragging the header
            host.click(card(host, "tip") + " .wgc-more"); host.wait_for_selector("#wg-menu")
            assert host.locator("#wg-menu [data-wm]").evaluate_all("els => els.map(e => e.dataset.wm)") == ["refresh", "rename", "up", "down", "remove"]
            host.keyboard.press("Escape"); host.wait_for_selector("#wg-menu", state="detached")
            menu(host, "poll", "settings"); host.wait_for_selector("#wgc-settings"); host.keyboard.press("Escape"); host.wait_for_selector("#wgc-settings", state="detached")
            menu(host, "note", "rename"); host.fill("#wg-rename", "Art notes"); host.press("#wg-rename", "Enter")
            host.wait_for_selector(card(host, "note") + " .wgc-t:has-text('Art notes')")
            assert next(w for w in cards_of(orion, pid) if w["key"] == "note")["title"] == "Art notes"
            menu(host, "presence", "up")
            host.wait_for_function("pid => true", arg=pid); time.sleep(0.6)
            assert [w["key"] for w in cards_of(orion, pid)][:2] == ["presence", "mytasks"]
            host.focus(card(host, "presence") + " .wgc-more"); host.keyboard.press("Alt+ArrowDown"); time.sleep(0.8)
            assert [w["key"] for w in cards_of(orion, pid)][:2] == ["mytasks", "presence"], "Alt+↓ moves a card for everyone"
            host.locator(card(host, "credits")).scroll_into_view_if_needed()
            src = host.locator(card(host, "credits") + " .wgc-h").bounding_box(); dst = host.locator(card(host, "tip")).bounding_box()
            host.mouse.move(src["x"] + 40, src["y"] + 10); host.mouse.down(); host.mouse.move(src["x"] + 40, src["y"] - 10, steps=4)
            host.mouse.move(dst["x"] + 40, dst["y"] + 6, steps=8); host.mouse.up(); time.sleep(0.8)
            assert [w["key"] for w in cards_of(orion, pid)][-2:] == ["credits", "tip"], [w["key"] for w in cards_of(orion, pid)]
            assert host.evaluate("[...document.querySelectorAll('#wg-cards .wgc')].slice(-2).map(e => e.dataset.key)") == ["credits", "tip"]

            # ---- error state with Retry
            host.route("**/api/milestones", lambda r: r.abort())
            menu(host, "timeline", "refresh"); host.wait_for_selector(card(host, "timeline") + " .wgc-err [data-wgc-act='retry']", timeout=10000)
            host.unroute("**/api/milestones")
            host.click(card(host, "timeline") + " [data-wgc-act='retry']"); settled(host, "timeline")
            assert "v0.1.0" in host.inner_text(card(host, "timeline"))

            # ---- a second member: live both ways
            mctx = b.new_context(viewport={"width": 1280, "height": 860}); mctx.add_init_script(settings_js("Maya", maya, pid))
            mp = mctx.new_page(); watch(mp, "maya"); mp.goto(BASE + "/?skipIntro=1")
            mp.wait_for_function("n => document.querySelectorAll('#wg-cards .wgc').length === n", arg=len(CARDS), timeout=20000)
            settled(mp, "mytasks"); assert mp.is_visible(card(mp, "mytasks") + " [data-wgc-accept]"), "Maya's task waits for her Accept"
            mp.click(card(mp, "mytasks") + " [data-wgc-accept]")
            mp.wait_for_function("s => !document.querySelector(s + ' [data-wgc-accept]')", arg=card(mp, "mytasks"), timeout=10000)
            assert next(t for t in ok(api("/tasks", token=orion, project=pid))["tasks"] if t["id"] == task["id"])["accept"] == "accepted"
            host.wait_for_function("s => document.querySelector(s).innerText.includes('Maya')", arg=card(host, "presence"), timeout=15000)   # who's here: live
            host.fill(card(host, "note") + " textarea", "Palette: warm, 5 colors"); host.click(card(host, "tip") + " .wgc-t")   # blur saves
            mp.wait_for_function("s => document.querySelector(s + ' textarea').value.includes('5 colors')", arg=card(mp, "note"), timeout=10000)
            mp.check(card(mp, "checklist") + " input[type=checkbox] >> nth=1")
            host.wait_for_function("s => document.querySelectorAll(s + ' .wgc-txt.done').length === 2", arg=card(host, "checklist"), timeout=10000)
            mp.click(card(mp, "poll") + " [data-wgc-vote='1']")
            host.wait_for_function("s => document.querySelector(s + ' .wgc-sub').textContent.startsWith('2 votes')", arg=card(host, "poll"), timeout=10000)
            ok(api("/dash/signal", "POST", {"kind": "build", "ok": False, "text": "TypeError in level.js"}, token=orion, project=pid))
            mp.wait_for_function("s => document.querySelector(s).innerText.includes('failing')", arg=card(mp, "build"), timeout=10000)
            mp.close()

            # ---- a spectator: sees the cards, can't change them
            sctx = b.new_context(viewport={"width": 1280, "height": 860}); sctx.add_init_script(settings_js("Sam", sam, pid))
            sp = sctx.new_page(); watch(sp, "sam"); sp.goto(BASE + "/?skipIntro=1")
            sp.wait_for_function("n => document.querySelectorAll('#wg-cards .wgc').length === n", arg=len(CARDS), timeout=20000)
            settled(sp, "poll"); assert sp.locator("#nest-add").count() == 0
            assert sp.is_disabled(card(sp, "poll") + " [data-wgc-vote='0']") and sp.get_attribute(card(sp, "note") + " textarea", "readonly") is not None
            sp.click(card(sp, "note") + " .wgc-more"); sp.wait_for_selector("#wg-menu")
            assert sp.locator("#wg-menu [data-wm]").evaluate_all("els => els.map(e => e.dataset.wm)") == ["refresh"]
            sp.close()

            if SHOTS:
                keep = ["mytasks", "presence", "timeline", "ritual", "build", "note", "checklist", "poll"]
                for w in cards_of(orion, pid):
                    pass
                host.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
                host.evaluate("""keep => { const box = document.querySelector('#wg-cards'); box.querySelectorAll('.wgc').forEach(c => { if (!keep.includes(c.dataset.key)) c.style.display = 'none'; }); }""", keep)
                host.evaluate("document.querySelector('#wg-cards').scrollIntoView({block: 'start'})"); host.wait_for_timeout(500)
                host.screenshot(path=str(ROOT / "docs" / "screenshots" / "widgets-sidebar.png"))
                host.evaluate("document.querySelectorAll('#wg-cards .wgc').forEach(c => c.style.display = '')")

            # ---- phone 390px: the cards in the side panel, the picker as a sheet
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", orion, pid))
            ph = pctx.new_page(); watch(ph, "phone"); ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_selector("#tabbar.m2-rack", timeout=20000)
            ph.click("#menu-btn"); ph.wait_for_selector("#wg-cards .wgc", state="visible", timeout=15000); ph.wait_for_timeout(400)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            over = ph.evaluate("[...document.querySelectorAll('#wg-cards .wgc')].filter(c => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > innerWidth + 1).map(c => c.dataset.key)")
            assert not over, f"cards wider than the panel: {over}"
            assert ph.evaluate("getComputedStyle(document.querySelector('#wg-cards .wgc-more')).width") == "36px", "big enough to tap"
            ph.click("#nest-add"); ph.wait_for_selector("#wg-picker.sheet", state="visible")
            assert ph.evaluate("document.querySelector('#wg-picker').getBoundingClientRect().width <= innerWidth")
            ph.keyboard.press("Escape"); ph.wait_for_selector("#wg-picker", state="detached")
            pctx.close()

            # ---- remove every card from its ⋯ menu
            for k in CARDS:
                menu(host, k, "remove"); host.wait_for_selector(card(host, k), state="detached", timeout=10000)
            assert cards_of(orion, pid) == [] and widgets(orion, pid)["data"] == {}
            assert host.locator("#wg-cards .wgc").count() == 0 and host.is_hidden("#wg-cards")

            # ---- Home: its own cards (yours alone), the same picker with only what works there
            host.goto(BASE + "/?skipIntro=1#/hub"); host.wait_for_function("document.body.classList.contains('global')", timeout=15000)
            host.wait_for_selector("#nest-add", state="visible", timeout=15000)
            host.click("#nest-add"); host.wait_for_selector("#wg-picker")
            assert "your Home" in host.inner_text("#wg-picker .wgx-to")
            assert sorted(host.evaluate("[...document.querySelectorAll('#wg-picker [data-wcard]')].map(e => e.dataset.wcard)")) == sorted(HOME_CARDS)
            assert host.locator("#wg-picker [data-wadd], #wg-picker [data-wpack]").count() == 0
            host.click("#wg-picker [data-wcard='checklist']"); settled(host, "checklist")
            host.fill(card(host, "checklist") + " .wgc-add input", "Call the playtesters"); host.press(card(host, "checklist") + " .wgc-add input", "Enter")
            host.wait_for_selector(card(host, "checklist") + " .wgc-txt:has-text('Call the playtesters')")
            hw = ok(api("/widgets/home", token=orion)); assert [w["key"] for w in hw["widgets"]] == ["checklist"]
            assert ok(api("/widgets/home", token=maya))["widgets"] == [], "Home is personal"
            host.reload(); host.wait_for_function("document.body.classList.contains('global')", timeout=15000); settled(host, "checklist")
            assert "Call the playtesters" in host.inner_text(card(host, "checklist"))
            host.click(f"#pj-rail [data-pj-open='{pid}']"); host.wait_for_function("!document.body.classList.contains('global')", timeout=15000)
            host.wait_for_function("() => !document.querySelector('#wg-cards .wgc')", timeout=10000)   # a project shows its own (none now)
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E widgets v2 test passed")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    try: main()
    except Exception:
        import traceback; traceback.print_exc(); sys.exit(1)
