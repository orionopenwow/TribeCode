"""Flint's lessons (app/ui/flintlessons.js): a short lesson for every feature, opened by "teach me <feature>" or
"how do I <thing>" in Flint's chat, the website designer or the canvas, with "Show me" ringing the real control.

  Flint's chat: "teach me tasks" opens the Tasks lesson; Show me goes to the Task Board and rings it.
  "how do i make a website" opens the website designer lesson; Show me opens the designer and rings its blocks.
  In the designer: "teach me export". Every one of the 14 lessons' Show me finds its real control in a project.
  Phone 390px: the lesson card fits. No console errors.
Usage: python app/test/e2e_flint_lessons.py [--shots]   (--shots writes docs/screenshots/flint-lesson.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.flint.brain', 'none'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def ring_on(page, timeout=6000):
    page.wait_for_selector(".fls-ring", timeout=timeout)
    return page.evaluate("(() => { const r = document.querySelector('.fls-ring').getBoundingClientRect(); return [r.width, r.height, document.querySelector('.fls-tip').textContent]; })()")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-lessons-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Lesson Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d
        tok = d["token"]; pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Orion", tok, pid))
            pg = ctx.new_page(); watch(pg, "orion")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeFlintLessons && window.TribeFlint && window.TribeFlintLocal && TribeClient.connected()", timeout=20000)
            pg.wait_for_timeout(600)
            n = len(pg.evaluate("TribeFlintLessons.FEATURES"))
            assert n == 19, n   # 14 + invite, people, market, design (feat/flint-cleanup) + local (feat/flint-local)

            # ---- Flint's chat: "teach me tasks"
            pg.evaluate("TribeFlint.ask('teach me tasks')")
            pg.wait_for_selector("#fls:not([hidden])", timeout=8000)
            assert pg.inner_text("#fls h3") == "Tasks"
            assert pg.locator("#fls ol li").count() >= 2
            pg.click("#fls [data-fls='show']")
            w, h, tip = ring_on(pg)
            assert w > 20 and h > 10 and "Task Board" in tip, (w, h, tip)

            # ---- "how do i make a website": the designer lesson, Show me opens it
            pg.evaluate("TribeFlint.ask('how do i make a website')")
            pg.wait_for_function("document.querySelector('#fls h3') && document.querySelector('#fls h3').textContent === 'The website designer' && !document.querySelector('#fls').hidden", timeout=8000)
            if SHOTS:
                out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True)
                pg.wait_for_timeout(400); pg.screenshot(path=str(out / "flint-lesson.png"))
            pg.click("#fls [data-fls='show']")
            ring_on(pg)
            assert pg.evaluate("TribeSiteDesigner.state().open"), "Show me opened the designer"

            # ---- in the designer: "teach me export"
            pg.fill("#flm-in-designer", "teach me export"); pg.press("#flm-in-designer", "Enter")
            pg.wait_for_function("document.querySelector('#fls h3').textContent === 'Export' && !document.querySelector('#fls').hidden", timeout=5000)
            pg.click("#fls [data-fls='show']")
            ring_on(pg)
            pg.click("#wdz [data-wdz='close']")

            # ---- every lesson's Show me finds its real control
            missing = []
            for f in pg.evaluate("TribeFlintLessons.FEATURES"):
                pg.evaluate("document.querySelectorAll('.fls-ring, .fls-tip').forEach(e => e.remove()); document.querySelectorAll('#pm-sheet, .pm-scrim').forEach(e => e.remove())")
                pg.keyboard.press("Escape")
                pg.evaluate("f => TribeFlintLessons.showMe(f)", f)
                try: ring_on(pg, 5000)
                except Exception: missing.append(f)
                pg.evaluate("() => { const D = window.TribeSiteDesigner; if (D && D.state() && D.state().open) D.close(); if (window.TribeInspoBoard) TribeInspoBoard.close(); if (window.TribeCanvas && TribeCanvas.state().open) TribeCanvas.close(); }")
                pg.wait_for_timeout(200)
            assert not missing, f"Show me found nothing for: {missing}"

            # ---- phone: the card fits
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.add_init_script(settings_js("Orion", tok, pid))
            m = ph.new_page(); watch(m, "phone")
            m.goto(BASE + "/?skipIntro=1")
            m.wait_for_function("window.TribeFlintLessons && TribeClient.connected()", timeout=20000)
            m.evaluate("TribeFlintLessons.open('chat')")
            bx = m.eval_on_selector("#fls", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 390, bx
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_flint_lessons: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
