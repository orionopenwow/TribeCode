"""Sidebar widgets + the calmer right panel (app/ui/widgets.js, server/widgets.js, widgets.css).

  Rows: Dashboard · Messages · Files · Design · Task Board · Agents Hub, then Preview game (a game-template project, opens the
        preview pane), Website (only once the site is built), the tribe's widgets, and + Add (host and builders).
  + Add: the picker; Calendar adds a row that opens the calendar; a custom link opens in the preview pane; Remove
        (right-click) works; widgets persist across a reload and show for a second member; a spectator gets no + and a 403.
  Phone 390px: the same rows in the side panel, + opens a bottom sheet, no sideways scroll.
  Right panel: secondary text >= 13px (computed), helpers are one row of pills (no second status lines), the
        Connect card hides once your Claude Code is connected; no console errors.
Usage: python app/test/e2e_sidebar_widgets.py [--shots]   (--shots saves docs/screenshots/sidebar-widgets-*.png)
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4993 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
CORE = ["Dashboard", "Messages", "Files", "Design", "Task Board", "Agents Hub"]
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


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())["result"]


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def rows(page):
    return page.evaluate("[...document.querySelectorAll('#pj-nav .nest-row')].filter(e => e.offsetParent !== null).map(e => e.querySelector(':scope > span:not(.wg-emo)').textContent.trim())")


def shot(page, name):
    if SHOTS:
        page.wait_for_timeout(600)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"sidebar-widgets-{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "Content Security Policy" not in m.text and "X-Frame-Options" not in m.text and "frame-ancestors" not in m.text and errors.append(f"{who} console: {m.text}"))


def make_repo(path):
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


# Every visible bit of text in the right panel (people, agents, helpers, Connect, Start a note, Flint), except the
# mono eyebrows, avatar initials and screen-reader text: its computed font size.
SMALL_TEXT = """() => {
  const roots = ['#room-pane', '#flint'].map(s => document.querySelector(s)).filter(Boolean), out = [];
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (!el.offsetParent || el.closest('h6, .eyebrow, .hp-t, .fl-eyebrow, .avatar, .sr-only, svg, .room-head, input, .hidden')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 13) out.push(`${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 30)}" ${fs}px`);
  }
  return out;
}"""


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-widgets-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="widgets-src-", dir="/tmp")
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
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); orion = boot["token"]
        pid = ok(api("/projects", "POST", {"path": pq}, token=orion), "game project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---- API: auto rows + permissions
        w = ok(api(f"/projects/{pid}/widgets", token=orion))
        assert w["preview"] == {"show": True, "kind": "game", "label": "Preview game"}, w["preview"]
        assert w["website"]["show"] is False and w["widgets"] == [] and w["canEdit"] is True, w
        assert ok(api(f"/projects/{pid}/widgets", token=sam))["canEdit"] is False
        assert api(f"/projects/{pid}/widgets", "PUT", {"widgets": [{"kind": "builtin", "key": "bugs"}]}, token=sam)[0] == 403, "spectators can't add"
        assert api(f"/projects/{pid}/widgets", "PUT", {"widgets": [{"kind": "builtin", "key": "nope"}]}, token=orion)[0] == 400
        assert api(f"/projects/{pid}/widgets", "PUT", {"widgets": [{"kind": "link", "name": "X", "url": "javascript:alert(1)"}]}, token=orion)[0] == 400, "only http(s) links"

        ok(api("/vision", "PUT", {"text": "# Game\n\nA small platformer."}, token=orion, project=pid))   # + Add waits for the vision (feat/setup-flow)
        ok(api("/tasks", "POST", {"title": "First level"}, token=orion, project=pid))   # vision + task + repo: "going", so the helpers show
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            hctx.add_init_script(settings_js("Orion", orion, pid))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=15000)
            host.wait_for_selector("#nest-preview", state="visible")

            # ---- the rows, in order: core, Preview game, + Add
            host.wait_for_selector("#nest-add", state="visible")
            assert rows(host) == CORE, rows(host)   # Preview and + Add are not among the rows
            assert host.evaluate("!!document.querySelector('.nest-foot #nest-preview')"), "Preview sits at the bottom of the pane"
            assert host.evaluate("document.querySelector('#nest-add').getBoundingClientRect().top >= document.querySelector('#nest-pinned').getBoundingClientRect().bottom - 1"), "+ Add sits below the Repo row"
            assert "Preview game" in host.inner_text("#nest-preview")
            assert host.locator("#nest-website").count() == 0, "no Website row before the site is built"
            assert host.locator("#nest-extra .pin-tag, #nest-extra [href='#i-pin']").count() == 0, "no pin icons"
            sz = host.evaluate("(() => { const i = document.querySelector('#nest-preview svg.i'); const s = getComputedStyle(i); return [s.width, s.strokeWidth]; })()")
            assert sz[0] in ("16px", "20px"), sz
            host.click("#nest-preview")
            host.wait_for_selector("body.pvw-on #pvw", timeout=15000)
            assert host.text_content("#preview-kind") == "Preview"
            host.click("#preview-close"); host.wait_for_function("!document.body.classList.contains('pvw-on')")

            # ---- Website: shows only once the site is built
            ok(api(f"/projects/{pid}/website/build", "POST", {}, token=orion), "build")
            host.wait_for_selector("#nest-website", state="visible", timeout=15000)
            assert rows(host) == CORE + ["Website"], rows(host)
            host.click("#nest-website"); host.wait_for_selector("#wb-root", timeout=15000)
            wait_text(host, "#crumb-label", "Files › Website")

            # ---- + Add: the picker, Calendar
            host.click("#nest-add"); host.wait_for_selector("#wg-picker")
            # the gallery: search narrows the cards, starter packs are there
            host.fill("#wgx-q", "bug"); assert host.is_visible("#wg-picker [data-wadd='bugs']") and host.is_hidden("#wg-picker [data-wadd='repo']")
            host.fill("#wgx-q", ""); assert host.locator("#wg-picker [data-wpack]").count() == 3
            assert host.is_disabled("#wg-picker [data-wadd='website']") and host.is_disabled("#wg-picker [data-wadd='preview']"), "already rows of their own"
            shot(host, "picker")
            host.click("#wg-picker [data-wadd='calendar']")
            host.wait_for_selector("#wg-calendar", state="visible")
            host.click("#wg-calendar"); host.wait_for_selector("#view-calendar:not(.hidden)")
            # a custom link widget opens in the preview pane
            host.click("#nest-add"); host.click("#wg-picker [data-wcustom]"); host.wait_for_selector("#wg-form")
            host.fill("#wg-emoji", "🗺️"); host.fill("#wg-name", "Level map"); host.fill("#wg-url", BASE + "/demo.html")
            host.click("#wg-save")
            host.wait_for_selector("#nest-extra [data-wopen]:has-text('Level map')", state="visible")
            assert rows(host) == CORE + ["Website", "Calendar", "Level map"], rows(host)
            host.click("#nest-extra [data-wopen]:has-text('Level map')")
            host.wait_for_selector("#preview-body #wg-iframe")
            assert host.get_attribute("#wg-iframe", "src") == BASE + "/demo.html"
            assert host.text_content("#preview-title") == "Level map"
            host.click("#preview-close")

            # ---- Remove (right-click), and it persists for the tribe
            host.click("#wg-calendar", button="right"); host.wait_for_selector("#wg-menu")
            host.click("#wg-menu [data-wm='remove']")
            host.wait_for_selector("#wg-calendar", state="detached")
            assert [x.get("name", x.get("key")) for x in ok(api(f"/projects/{pid}/widgets", token=orion))["widgets"]] == ["Level map"]
            host.click("#nest-add"); host.click("#wg-picker [data-wadd='bugs']"); host.wait_for_selector("#wg-bugs", state="visible")
            host.reload(); host.wait_for_selector("#nest-extra [data-wopen]:has-text('Level map')", state="visible", timeout=15000)
            host.wait_for_selector("#wg-bugs", state="visible")
            assert rows(host) == CORE + ["Website", "Level map", "Bugs"], rows(host)

            # ---- the room panel: readable, fewer lines
            host.evaluate("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint: true, brain: true, ai: true})); window.TribeHelpers && TribeHelpers.render() } catch (e) {}")
            host.click("#nest-overview")
            host.evaluate("TribeStage && TribeStage.set(TribeProjects.current(), {vision:true, task:true, friend:true, agent:true, repo:true}, {pin:true})")   # past setup: the panel shows everything
            host.wait_for_selector("#room-helpers [data-helper='flint']", state="attached", timeout=45000)
            host.wait_for_selector("#cc-connect", state="visible")
            assert host.locator("#room-helpers .hp-pill").count() >= 2, "helpers are pills"
            assert host.locator("#room-helpers .what").count() == 0, "no second status lines under helpers"
            assert "basic mode" in host.text_content("#room-helpers [data-helper='flint']"), "the status stays for screen readers and tooltips"
            assert host.locator("#room-note-new").is_visible() and host.evaluate("document.querySelector('#room-note-new').getBoundingClientRect().height") <= 40, "Start a note is a slim row"
            small = host.evaluate(SMALL_TEXT); assert not small, small
            # the Flint chips sit in one row
            tops = host.evaluate("[...document.querySelectorAll('#flint .fl-chip')].map(e => Math.round(e.getBoundingClientRect().top))")
            assert tops and len(set(tops)) == 1, tops
            # Helpers start folded to one line; opening is remembered
            assert host.get_attribute("#helpers-toggle", "aria-expanded") == "false"
            host.click("#helpers-toggle"); host.wait_for_selector("#hp-pills", state="visible")
            host.reload(); host.wait_for_selector("#helpers-toggle", timeout=45000)
            assert host.get_attribute("#helpers-toggle", "aria-expanded") == "true"
            shot(host, "desktop")
            # Connect your Claude Code: gone once it's connected
            ag = ok(api("/agents", "POST", token=orion, project=pid), "agent")
            mcp(ag["token"], "my_lane", {"tokens_used": 1000, "budget": 100000})
            host.wait_for_selector("#cc-connect", state="hidden", timeout=15000)
            small = host.evaluate(SMALL_TEXT); assert not small, small

            # ---- a second member sees the same widgets
            mctx = b.new_context(viewport={"width": 1280, "height": 860}); mctx.add_init_script(settings_js("Maya", maya, pid))
            mp = mctx.new_page(); watch(mp, "maya"); mp.goto(BASE + "/?skipIntro=1")
            mp.wait_for_selector("#nest-extra [data-wopen]:has-text('Level map')", state="visible", timeout=20000)
            mp.wait_for_selector("#nest-add", state="visible")   # builders can add
            # live: the host adds Calendar, Maya sees it without a reload
            host.click("#nest-add"); host.click("#wg-picker [data-wadd='calendar']")
            mp.wait_for_selector("#wg-calendar", state="visible", timeout=15000)
            # ---- a spectator sees the rows but can't add or remove
            sctx = b.new_context(viewport={"width": 1280, "height": 860}); sctx.add_init_script(settings_js("Sam", sam, pid))
            sp = sctx.new_page(); watch(sp, "sam"); sp.goto(BASE + "/?skipIntro=1")
            sp.wait_for_selector("#wg-calendar", state="visible", timeout=20000)
            assert sp.locator("#nest-add").count() == 0 and sp.locator("#nest-extra [data-wmore]").count() == 0

            # ---- phone: the rows are in the side panel; + opens a sheet
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", orion, pid))
            ph = pctx.new_page(); watch(ph, "phone"); ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_selector("#tabbar.m2-rack", timeout=20000)
            ph.click("#menu-btn"); ph.wait_for_selector("#nest-preview", state="visible", timeout=15000)
            ph.wait_for_selector("#nest-extra [data-wopen]:has-text('Level map')", state="visible")
            ph.wait_for_timeout(400)
            assert rows(ph)[:len(CORE)] == CORE and ph.is_visible("#nest-preview") and ph.is_visible("#nest-add"), rows(ph)   # phones: Preview at the bottom, + Add below Repo
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            shot(ph, "phone")
            ph.click("#nest-add"); ph.wait_for_selector("#wg-picker.sheet", state="visible")
            shot(ph, "phone-picker")
            ph.click("#wg-picker [data-wadd='visuals']"); ph.wait_for_selector("#wg-visuals", state="visible")

            b.close()
        assert not errors, "\n".join(errors)
        print("E2E sidebar widgets test passed")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
