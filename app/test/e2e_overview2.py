"""Project Overview v2 (app/ui/projects.js overview): identity, Living update, Onboarding Checklist, then
Tribe & Agents, Project Stream, Repo & Tools. Checks section order, the checklist ticking from the API, the
collapse being remembered, Who is here / Agents, the standup + drop zone moved in, and the phone at 390px.
Usage: python app/test/e2e_overview2.py   (writes docs/screenshots/overview2-desktop.png and overview2-phone.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4979 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []

def api(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: errors.append(f"{who} console: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)

ORDER = """() => ['.pj-title2', '#pj-living', '#pj-sec-stream', '#pj-check', '#pj-sec-tribe', '#pj-sec-repo']
  .map(s => { const e = document.querySelector('#pj-overview ' + s); return e ? e.getBoundingClientRect().top + scrollY : -1; })"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ov2-", dir="/tmp"))
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
            ctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Campw', theme: 'campfire'}))")
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")
            # a fresh project, like Discord's "Create my own"
            host.evaluate("TribeProjects.gallery()")
            host.click(".np-setup [data-ns='own']"); host.wait_for_selector("#np-input"); host.fill("#np-input", "My Tribe"); host.click("#np-create")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000); host.click(".modal-card.ii [data-close]")
            pid = host.evaluate("TribeProjects.current()")
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-more", state="attached", timeout=15000); host.evaluate("document.querySelector('#pj-more').open = true"); host.wait_for_selector("#pj-sec-repo", timeout=15000)

            # 0. a brand-new project: the checklist is the hero and there's no Living update yet
            # feat/calm-parity: one card first (the next step), then See all steps shows the five as before
            host.wait_for_selector("#pj-check.hero.one .ock-next", timeout=10000)
            assert host.eval_on_selector_all("#pj-check .ock-card", "els => els.filter(e => e.offsetParent).length") == 1
            host.evaluate("(() => { const b = document.querySelector('#pj-check-all'); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); })()"); host.wait_for_selector("#pj-check:not(.one)", timeout=15000)   # feat/calm-parity: See all steps
            host.wait_for_selector("#pj-check.hero .ock-hero-t", timeout=10000)
            assert host.locator("#pj-living").count() == 0, "no Living update before the tribe has begun"
            assert host.locator("#pj-check.hero .ock-card .ock-emo").count() == 5   # vision, task, AI, where it lives, share
            assert host.evaluate("parseFloat(getComputedStyle(document.querySelector('#pj-check .ock-hero-t')).fontSize)") >= 24
            n0 = host.evaluate("+document.querySelector('#pj-check .ock-bar').getAttribute('aria-valuenow')")
            host.wait_for_selector("#pj-check [data-step=task]:not(.on) [data-ck=newtask]", state="attached")
            assert host.locator("#pj-check .ock-next .btn.primary").count() == 1 and host.locator("#pj-check .btn.primary").count() == 1, "one solid button: the next step"
            st, _ = api("/tasks", "POST", {"title": "Draw the title screen"}, token=tok, headers={"X-Project": pid}); assert st in (200, 201), st
            # v0.24: the step cards stay until every step is done, so nobody skips the AI and the repository
            host.wait_for_selector("#pj-check.hero [data-step=task].on", timeout=10000, state="attached")
            assert host.locator("#pj-check.hero").count() == 1

            # 1-2. identity row, then the Living update: a pill and 3 equal tiles, no long sentence
            assert "Add a short description" in host.text_content("#pj-bio") and "1 person" in host.text_content(".pj-meta")
            assert "Invite to My Tribe" in host.text_content("#pj-invite")
            assert "At a glance" in host.text_content("#pj-living .eyebrow")
            labels = host.eval_on_selector_all("#pj-living .gl-tile .gl-top small", "els => els.map(e => e.textContent.trim().toUpperCase())")
            assert labels == ["UNREAD", "TASKS", "NEW FILES"], labels   # feat/dash-preview: Needs you moved into Needs attention
            widths = host.eval_on_selector_all("#pj-living .gl-tile", "els => els.map(e => Math.round(e.getBoundingClientRect().width))")
            assert max(widths) - min(widths) <= 2, f"equal tiles {widths}"
            assert host.locator("#pj-living .pl-sum").count() == 0, "no duplicate sentence"
            # section order, top to bottom
            ys = host.evaluate(ORDER)
            if host.locator("#pj-check.hero").count(): assert ys[3] < ys[1], "unfinished setup: the step cards sit right under the title"; ys = ys[:3] + ys[4:]
            assert -1 not in ys and ys == sorted(ys), f"section order {ys}"
            titles = host.eval_on_selector_all("#pj-overview .pj-sec-t", "els => els.map(e => e.textContent.trim())")
            assert titles == ["Recent changes and what’s next", "Tribe & Agents", "Code & Tools"], titles
            assert host.evaluate("getComputedStyle(document.querySelector('.pj-sec-t')).fontSize") == "18px"
            # old blocks are gone
            for gone in ["#pj-vnudge", "#pj-hero"]: assert host.locator(gone).count() == 0, gone
            assert host.locator("#home-start").is_hidden(), "the old Standup and files section is folded into Repo & Tools"

            # 3. Onboarding checklist: ticks itself
            assert host.text_content("#pj-check h3").strip() in ("Set up", "Steps", "Getting started")   # v0.16.x: "Set up", not "Onboarding Checklist"
            host.wait_for_selector("#pj-check [data-step=vision]:not(.on) [data-ck=vision]", state="attached")
            host.wait_for_selector("#pj-check [data-step=task].on", timeout=10000, state="attached")
            assert host.evaluate("+document.querySelector('#pj-check .ock-bar').getAttribute('aria-valuenow')") == n0 + 1
            assert host.get_attribute("#pj-check [data-step=task] .ock-box", "aria-checked") == "true"
            # collapse, remembered across a reload
            host.click("#pj-check-fold"); host.wait_for_selector("#pj-check.folded", timeout=30000)
            assert host.locator("#pj-check .ock-list").is_hidden() and host.locator("#pj-check .ock-bar").is_visible()
            host.reload(); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check.folded", timeout=15000)
            host.click("#pj-check-fold"); host.wait_for_selector("#pj-check:not(.folded) .ock-list", state="visible")

            # 4. Tribe & Agents
            wait_text = lambda sel, t: host.wait_for_function("([s, t]) => (document.querySelector(s) || {}).textContent?.includes(t)", arg=[sel, t], timeout=10000)
            wait_text("#pj-who", "Campw"); wait_text("#pj-who", "host")
            assert "Who is here" in host.text_content("#pj-who h3")
            assert host.locator("#pj-agents .pj-live").count() >= 1, "teal dot"
            assert "Connect your AI" in host.text_content("#pj-agents #pj-cc")
            # 5. Project Stream: the task shows in Recent changes; Upcoming has a clean empty state
            wait_text("#pj-recent", "Draw the title screen")
            assert "Draw the title screen" in host.text_content("#pj-upcoming")   # simple-dashboard: Up next lists open tasks first
            # 6. Repo & Tools: repo empty state + standup button top right + the drop zone, wired as before
            wait_text("#pj-repo", "Code repository"); host.wait_for_function("document.querySelector('#pj-repo .pj-repo-sum, #pj-repo [data-go=repo]')")   # a summary + Open, or the empty state with Set up the repo
            host.wait_for_selector("#pj-sf h3 #standup-go", state="visible", timeout=15000)   # standup button in the card head (a redraw may be moving it back in)
            host.wait_for_selector("#pj-context #dropzone", state="visible", timeout=8000)   # drop zone moved in (after the overview settles)
            assert host.evaluate("getComputedStyle(document.querySelector('#pj-context #dropzone')).borderStyle") == "dashed"
            # a redraw keeps the live nodes (they are moved, not copied)
            host.evaluate("document.querySelector('#dropzone').dataset.mark = 'x'")
            host.evaluate("TribeProjects.overview ? TribeProjects.overview() : TribeApp.show('home')")
            api("/tasks", "POST", {"title": "Second task"}, token=tok, headers={"X-Project": pid})
            wait_text("#pj-recent", "Second task")
            assert host.evaluate("document.querySelectorAll('#dropzone').length === 1 && document.querySelector('#pj-context #dropzone').dataset.mark === 'x'")
            # two columns on desktop
            xs = host.eval_on_selector_all("#pj-sec-tribe .pj-grid > .card", "els => els.map(e => Math.round(e.getBoundingClientRect().left))")
            assert len(set(xs)) == 2, f"two columns {xs}"
            host.evaluate("scrollTo(0, 0); document.querySelector('#main') && document.querySelector('#main').scrollTo(0, 0)")
            host.set_viewport_size({"width": 1440, "height": 2300}); host.wait_for_timeout(300)
            host.screenshot(path=str(SHOTS / "overview2-desktop.png"))

            # phone at 390: one column, no sideways scroll
            settings = host.evaluate("JSON.stringify({...TribeStore.get(), onboarded: true, tour: {done: true}})")
            pctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(settings)}); localStorage.setItem('tribecode.project:{BASE}', '{pid}');")
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_selector("#pj-more", state="attached", timeout=15000); ph.evaluate("document.querySelector('#pj-more').open = true"); ph.wait_for_selector("#pj-sec-repo", timeout=15000)
            ph.wait_for_timeout(600)
            if ph.locator("#install-sheet:not(.hidden) #ins-later").count(): ph.click("#ins-later")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            for s in ["#pj-sec-tribe", "#pj-sec-stream", "#pj-sec-repo"]:
                xs = ph.eval_on_selector_all(f"{s} .pj-grid > .card", "els => els.map(e => Math.round(e.getBoundingClientRect().left))")
                assert len(set(xs)) == 1, f"{s} single column {xs}"
            wide = ph.evaluate("[...document.querySelectorAll('#pj-overview *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).map(e => e.id || e.className).slice(0, 5)")
            assert not wide, f"nothing pokes past the edge: {wide}"
            ys = ph.evaluate(ORDER)
            if ph.locator("#pj-check.hero").count(): ys = ys[:3] + ys[4:]   # unfinished setup: the step cards sit under the title
            assert ys[1:] == sorted(ys[1:]), f"phone order {ys}"
            ph.set_viewport_size({"width": 390, "height": 3000}); ph.wait_for_timeout(300)
            ph.screenshot(path=str(SHOTS / "overview2-phone.png"))
            b.close()
        if errors: raise AssertionError("errors:\n" + "\n".join(errors))
        print("e2e_overview2: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
