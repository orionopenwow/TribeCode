"""Project sense + Inspiration (server/sense.js, app/ui/sense.js, sense.css).

  Two neutrally named projects (each a repo with a bare index.html):
    Project Nova  — chat + tasks about a landing page, pricing and signup  → kind site, sidebar says "Preview site"
    Project Orbit — chat about a platformer, levels and jumping            → kind game, "Preview game"; then chat turns
                    to multiplayer → one quiet Flint note in chat (once, not twice)
  Dashboard: the Inspiration card renders (eyebrow + title, 3 ideas on desktop), "Make it a task" creates the task,
  × hides an idea and it stays hidden after a reload.
  Override: the host picks "app" (Preview app), then "Sense it" again (back to site); a spectator gets 403; a friend
  who is only in Orbit gets 404 for Nova.
  Phone 390px: the card shows 2 ideas, nothing pokes past the edge. No console errors.
Usage: python app/test/e2e_project_sense.py
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5010 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
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


def make_repo(path, title):
    os.makedirs(path)
    Path(path, "index.html").write_text(f"<!doctype html><title>{title}</title><h1>{title}</h1>\n")
    Path(path, "README.md").write_text(f"# {title}\n")
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def until(fn, what, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what}")


def say(token, pid, text):
    ok(api("/chat/general", "POST", {"text": text}, token=token, project=pid), "chat")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sense-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="sense-src-", dir="/tmp")
    nova, orbit = os.path.join(work, "nova"), os.path.join(work, "orbit")
    make_repo(nova, "Nova"); make_repo(orbit, "Orbit")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_SENSE_NOTES": "1", "TRIBE_SENSE_DEBOUNCE_MS": "250"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Sense Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        nv = ok(api("/projects", "POST", {"path": nova, "name": "Project Nova"}, token=orion), "nova")["project"]["id"]
        ob = ok(api("/projects", "POST", {"path": orbit, "name": "Project Orbit"}, token=orion), "orbit")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]
        inv3 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": ob}, token=orion))["invite"]
        zed = ok(api("/join", "POST", {"code": inv3["code"], "name": "Zed"}))["token"]

        # ---- before anyone talks: neutral names sense nothing much
        s = ok(api(f"/projects/{nv}/sense", token=orion), "sense nova")
        assert s["kind"] == "other" and s["confidence"] == 0, s
        assert s["inspiration"], "even an unknown project gets a starter idea"

        # ---- Nova talks about a landing page → site
        for t in ["We need a landing page for this", "Pricing section with three plans?", "And a signup form under the hero", "Make the signup one email field"]:
            say(maya, nv, t)
        ok(api("/tasks", "POST", {"title": "Build the landing page hero"}, token=orion, project=nv))
        ok(api("/tasks", "POST", {"title": "Pricing table"}, token=orion, project=nv))
        s = until(lambda: (lambda d: d if d["kind"] == "site" else None)(ok(api(f"/projects/{nv}/sense", token=orion))), "nova senses site")
        assert s["confidence"] >= 0.45 and s["preview"] == "Preview site", s
        assert any(sg["from"] in ("chat", "task") for sg in s["signals"]), s["signals"]
        assert {"saas", "landing page"} & set(s["tags"]), s["tags"]
        w = ok(api(f"/projects/{nv}/widgets", token=orion))
        assert w["preview"] == {"show": True, "kind": "site", "label": "Preview site"}, w["preview"]

        # ---- Orbit talks about a platformer → game
        for t in ["ok so it's a platformer", "five short levels", "the jump feels floaty", "double jump after level 2?"]:
            say(orion, ob, t)
        until(lambda: ok(api(f"/projects/{ob}/sense", token=orion))["kind"] == "game", "orbit senses game")
        assert ok(api(f"/projects/{ob}/widgets", token=orion))["preview"]["label"] == "Preview game"
        assert "platformer" in ok(api(f"/projects/{ob}/sense", token=orion))["tags"]
        # once the chat settles on it: one quiet Flint note with ideas (and no second one when it turns multiplayer)
        notes = lambda: [m for m in ok(api("/chat/general?limit=100", token=orion, project=ob))["messages"] if m["by"] == "tribecode" and "Flint" in (m.get("text") or "")]
        n = until(notes, "a Flint note about the platformer")
        assert "platformer" in n[0]["text"].lower() and "Ideas:" in n[0]["text"] and "checkpoints" in n[0]["text"], n[0]["text"]
        for t in ["what if it's multiplayer", "co-op with a lobby", "multiplayer lobby, friends join by link"]:
            say(maya, ob, t)
        until(lambda: "multiplayer" in ok(api(f"/projects/{ob}/sense", token=orion))["tags"], "orbit picks up multiplayer")
        time.sleep(1)
        assert len(notes()) == 1, "at most one note every few hours"
        # the host can turn the notes off for a project
        assert ok(api(f"/projects/{ob}/sense", "PUT", {"notes": False}, token=orion))["notes"] is False
        # Nova had no Flint note: notes only come with a change sensed from chat after the first look
        # ---- permissions: spectators and outsiders can't change it
        assert api(f"/projects/{nv}/sense", "PUT", {"kind": "app"}, token=sam)[0] == 403, "spectators can't override"
        assert api(f"/projects/{nv}/sense", token=zed)[0] == 404, "an Orbit-only friend can't see Nova's sense"
        assert api(f"/projects/{nv}/sense", "PUT", {"kind": "app"}, token=zed)[0] == 404
        assert api(f"/projects/{nv}/sense", "PUT", {"kind": "spaceship"}, token=orion)[0] == 400
        assert api(f"/projects/{nv}/sense/dismiss", "POST", {"id": "x"}, token=zed)[0] == 404

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            hctx.add_init_script(settings_js("Orion", orion, nv))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=nv, timeout=15000)
            host.wait_for_selector("#nest-preview", state="visible", timeout=15000)
            host.wait_for_function("(document.querySelector('#nest-preview').getAttribute('aria-label') || '').includes('Preview site') && document.querySelector('#nest-preview > span').textContent === 'Preview'", timeout=10000)   # feat/shell-polish: the row says Preview (Preview game for a game); the kind is in its label
            assert host.get_attribute("#nest-preview", "data-kind") == "site"
            host.evaluate("TribeApp.show('home')")
            host.wait_for_selector("#pj-insp .sx-item", timeout=15000)
            assert "Inspiration" in host.text_content("#pj-insp .eyebrow") and "website" in host.inner_text("#pj-insp h3"), host.inner_text("#pj-insp h3")
            assert host.locator("#pj-insp .sx-item").count() == 3, "three ideas on desktop"
            assert host.evaluate("getComputedStyle(document.querySelector('#pj-insp')).boxShadow") == "none", "flat"
            # the card sits under the checklist and above the Tribe section
            assert host.evaluate("(() => { const a = document.querySelector('#pj-insp').getBoundingClientRect().top, b = document.querySelector('#pj-sec-tribe').getBoundingClientRect().top; return a < b; })()")
            # Ctrl K follows the project too
            host.keyboard.press("Control+k"); host.fill("#pal-input", "preview"); host.wait_for_timeout(250)
            host.wait_for_function("document.querySelector('#pal-list').innerText.includes('Preview site')", timeout=5000)
            host.keyboard.press("Escape")

            # Make it a task
            first = host.locator("#pj-insp .sx-item").first
            fid = first.get_attribute("data-sx")
            want = next(x for x in ok(api(f"/projects/{nv}/sense", token=orion))["inspiration"] if x["id"] == fid)
            first.locator(".sx-task").click()
            until(lambda: any(t["title"] == want["task"] for t in ok(api("/tasks", token=orion, project=nv))["tasks"]), "the idea became a task")
            host.wait_for_function("id => { const b = document.querySelector(`#pj-insp [data-sx='${id}'] .sx-task`); return b && b.disabled; }", arg=fid, timeout=5000)

            # × hides an idea, for good
            second = host.locator("#pj-insp .sx-item").nth(1); sid = second.get_attribute("data-sx")
            second.locator(".sx-x").click()
            host.wait_for_function("id => !document.querySelector(`#pj-insp [data-sx='${id}']`)", arg=sid, timeout=5000)
            assert sid not in [x["id"] for x in ok(api(f"/projects/{nv}/sense", token=orion))["inspiration"]]
            assert sid in [x["id"] for x in ok(api(f"/projects/{nv}/sense", token=maya))["inspiration"]], "hidden for you, not for everyone"
            host.reload(); host.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=nv, timeout=15000)
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-insp .sx-item", timeout=15000)
            assert host.locator(f"#pj-insp [data-sx='{sid}']").count() == 0, "still hidden after a reload"
            # More cycles
            before = host.eval_on_selector_all("#pj-insp .sx-item", "els => els.map(e => e.dataset.sx)")
            host.click("#sx-more"); host.wait_for_timeout(150)
            after = host.eval_on_selector_all("#pj-insp .sx-item", "els => els.map(e => e.dataset.sx)")
            assert before != after, "More shows other ideas"

            # Override: This is an app → Preview app; Sense it → back to site
            host.click("#sx-fix"); host.wait_for_selector("#sx-kinds")
            host.click("#sx-kinds [data-kind='app']")
            host.wait_for_function("(document.querySelector('#nest-preview').getAttribute('aria-label') || '').includes('Preview app') && document.querySelector('#nest-preview > span').textContent === 'Preview'", timeout=10000)   # feat/shell-polish: the row says Preview (Preview game for a game); the kind is in its label
            assert ok(api(f"/projects/{nv}/sense", token=maya))["kind"] == "app"
            host.wait_for_function("document.querySelector('#pj-insp h3') && document.querySelector('#pj-insp h3').innerText.includes('app')", timeout=8000)
            host.click("#sx-fix"); host.wait_for_selector("#sx-kinds"); host.click("#sx-kinds [data-kind='']")
            host.wait_for_function("(document.querySelector('#nest-preview').getAttribute('aria-label') || '').includes('Preview site') && document.querySelector('#nest-preview > span').textContent === 'Preview'", timeout=10000)   # feat/shell-polish: the row says Preview (Preview game for a game); the kind is in its label
            assert ok(api(f"/projects/{nv}/sense", token=orion))["override"] == ""
            # the spectator sees the card but no "Not a website?" and no task buttons
            sctx = b.new_context(viewport={"width": 1280, "height": 860}); sctx.add_init_script(settings_js("Sam", sam, nv))
            sp = sctx.new_page(); watch(sp, "sam"); sp.goto(BASE + "/?skipIntro=1")
            sp.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            sp.evaluate("TribeApp.show('home')"); sp.wait_for_selector("#pj-insp .sx-item", timeout=15000)
            assert sp.locator("#sx-fix").count() == 0 and sp.locator("#pj-insp .sx-task").count() == 0

            # ---- phone 390: Orbit's dashboard, 2 ideas, nothing past the edge
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Maya", maya, ob))
            ph = pctx.new_page(); watch(ph, "phone"); ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_selector("#pj-insp .sx-item", timeout=15000)
            ph.wait_for_timeout(500)
            if ph.locator("#install-sheet:not(.hidden) #ins-later").count(): ph.click("#ins-later")
            assert ph.locator("#pj-insp .sx-item").count() == 2, "two ideas on phones"
            assert "game" in ph.inner_text("#pj-insp h3")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            wide = ph.evaluate("[...document.querySelectorAll('#pj-insp *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).map(e => e.className).slice(0, 5)")
            assert not wide, f"nothing pokes past the edge: {wide}"
            small = ph.evaluate("[...document.querySelectorAll('#pj-insp *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('.eyebrow') && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.trim().slice(0, 20))")
            assert not small, f"no tiny text: {small}"
            ph.locator("#pj-insp").scroll_into_view_if_needed()
            ph.screenshot(path=str(Path(tmp) / "sense-phone.png"))
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E project sense test passed")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
