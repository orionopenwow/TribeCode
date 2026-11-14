"""Flint on the Dashboard (feat/flint-ai): on a fresh computer with no tribe at all, Home shows Ask Flint, and he still
acts on global things: today's plan (start a project), "Grow my idea" (three tappable questions, then a plan that links
company + app + website + resources), explaining a feature from the local knowledge base, recommending resources for a
goal with deep links that open (the Guide works with no tribe), opening your files, and opening the inspiration board.
Then "Start a project" from Flint makes the tribe. No console errors.
Usage: python app/test/e2e_flint_dashboard.py [--shots]   (--shots writes docs/screenshots/flint-home.png)"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5480 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"; take = "--shots" in sys.argv
errors = []


def health():
    with urllib.request.urlopen(BASE + "/api/health", timeout=10) as r: return json.loads(r.read())


def last_flint(pg):
    return pg.evaluate("(() => { const m = [...document.querySelectorAll('#flint-home .fl-msg.fl')].pop(); return m ? m.innerText : ''; })()")


def ask(pg, text, want, timeout=8000):
    pg.fill("#fh-input", text); pg.press("#fh-input", "Enter")
    pg.wait_for_function("w => { const m = [...document.querySelectorAll('#flint-home .fl-msg.fl')].pop(); return m && m.innerText.includes(w); }", arg=want, timeout=timeout)
    return last_flint(pg)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fdash-"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_OPENVERSE_URL": "http://localhost:9"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: health(); break
            except Exception: time.sleep(0.2)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(m.text[:200]))
            pg.goto(BASE + "/?freshopen=1&skipIntro=1"); pg.wait_for_selector("#view-hub:not(.hidden) #flint-home", timeout=15000)
            assert health()["members"] == 0, "no tribe"
            assert not pg.evaluate("TribeClient.connected()")
            assert "works without a tribe" in pg.inner_text("#flint-home .fh-head").lower()
            chips = pg.eval_on_selector_all("#flint-home [data-fhq]", "els => els.map(e => e.textContent.trim())")
            assert any("Today" in c for c in chips) and any("Grow my idea" in c for c in chips) and any("Start a project" in c for c in chips), chips

            # today's plan with nothing yet: start a project
            pg.click("#flint-home [data-fhq='plan my day']")
            pg.wait_for_function("document.querySelector('#flint-home .fh-thread').innerText.includes(\"Today's plan\")", timeout=8000)
            assert "Start your first project" in last_flint(pg)

            # Grow my idea: three tappable questions, then a plan with resources
            pg.click("#flint-home [data-fhq='grow my idea']")
            pg.wait_for_function("(document.querySelector('#flint-home .fh-thread').innerText || '').includes('What are you growing?')", timeout=8000)
            for label in ["All three, together", "Just an idea", "Making it look like one thing"]:
                pg.locator("#flint-home .fl-msg.fl").last.locator(".fl-act", has_text=label).click()
                time.sleep(0.25)
            plan = last_flint(pg)
            for part in ["Company", "App", "Website", "One thing, not three", "board"]: assert part in plan, (part, plan)
            acts = pg.locator("#flint-home .fl-msg.fl").last.locator(".fl-act").all_inner_texts()
            assert any("Inspiration board" in a for a in acts) and any("Design" in a for a in acts), acts

            # a resource deep link: with no tribe, the Academy falls back to its Guide page
            pg.locator("#flint-home .fl-msg.fl").last.locator(".fl-act", has_text="Design").click()
            pg.wait_for_function("window.TribeGuide && TribeGuide.isOpen()", timeout=8000)
            pg.evaluate("TribeGuide.close()")

            # resources for a goal
            out = ask(pg, "where can I learn how to start a company", "For the company")
            assert "Founder basics" in out and "Company mode" in out, out

            # explain a feature from the local knowledge base (no model, no tribe)
            out = ask(pg, "explain the inspiration board", "inspiration board", timeout=10000)
            assert len(out) > 60, out

            # acting on global things: the inspiration board and your files
            ask(pg, "open my inspiration board", "inspiration board")
            pg.wait_for_selector("#ibd:not(.hidden) #ibd-q", timeout=5000)
            pg.click("#ibd-close")
            pg.fill("#fh-input", "open my files"); pg.press("#fh-input", "Enter")
            pg.wait_for_selector("#hub-docs", timeout=8000)   # Home becomes your files (the card goes with it)
            pg.wait_for_function("TribeFlint.thread().slice(-1)[0].text.includes('Opened your files')", timeout=5000)
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#view-hub:not(.hidden) #flint-home", timeout=8000)
            assert pg.locator("#flint-home .fl-msg").count() >= 8, "the thread survives the Home re-render"
            if take:
                SHOTS.mkdir(parents=True, exist_ok=True)
                pg.evaluate("document.querySelector('#flint-home').scrollIntoView({block: 'start'})"); time.sleep(0.3)
                pg.screenshot(path=str(SHOTS / "flint-home.png"))

            # Start a project from Flint: the optimistic Start sheet (feat/setup-local) makes it on this device with no
            # server call; choosing "This computer" as its home makes your own tribe here
            ask(pg, "start a project", "Starting your first project")
            pg.wait_for_selector("#tn #tn-name", state="visible", timeout=8000)   # the one create flow (tribenew.js)
            pg.fill("#tn-name", "Flint's project"); pg.click("#tn-options")
            assert health()["members"] == 0, "nothing goes to the server before a home is chosen"
            pg.click("#tn [data-tn-where='folder']"); pg.click("#tn-go")
            for _ in range(60):
                if health()["members"] >= 1: break
                time.sleep(0.25)
            assert health()["members"] >= 1, "Flint started the project"
            b.close()
        assert not errors, errors
        print("e2e_flint_dashboard: OK (Flint on Home with no tribe: plan, grow your idea, resources, explain, board, files, start a project)")
    finally:
        srv.kill()


if __name__ == "__main__":
    main()
