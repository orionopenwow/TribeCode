"""Smoke test + screenshots for the desktop UI (runs the UI in headless Chrome).

Usage: python app/test/ui_smoke.py [--shots]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = (ROOT / "app" / "ui" / "index.html").as_uri()
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []


def shot(page, name):
    if take:
        page.wait_for_timeout(450)  # let entry animations finish
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
        ctx = b.new_context(viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and "Failed to fetch" not in m.text and "ERR_" not in m.text and errors.append(f"console: {m.text}"))

        # ---- first run ----
        page.goto(UI + "?reset=1&demo=1")
        page.wait_for_selector("#onboard:not(.hidden)")
        assert page.locator("#ob-body img.brand-wm").count() == 1 and "set up this device" in page.inner_text("#ob-body")
        shot(page, "setup-1-welcome")
        page.click("#ob-next")
        assert page.is_disabled("#ob-next"), "name required"
        page.fill("#ob-name", "Riley Park")
        page.click('[data-color="#FFB86B"]')
        assert page.inner_text("#ob-av") == "RP"
        shot(page, "setup-2-profile")
        page.keyboard.press("Enter")
        page.click('[data-theme="dark"]')
        page.click("#ob-next")
        assert page.input_value("#ob-folder"), "default folder"
        page.fill("#ob-folder", "C:\\Users\\riley\\TribeCode")
        page.click("#ob-next")
        page.wait_for_function("!document.querySelector('#ob-body').innerText.includes('Looking for Ollama')", timeout=5000)
        shot(page, "setup-3-brain")
        page.click("#ob-next")
        page.click('[data-key="launchAtLogin"]')
        assert page.get_attribute('[data-key="launchAtLogin"]', "aria-checked") == "true"
        page.click("#ob-next")
        assert "Riley" in page.inner_text("#ob-body")
        shot(page, "setup-4-ready")
        page.click("#ob-next")

        # ---- tour ----
        page.wait_for_selector("#tour:not(.hidden)")
        page.wait_for_timeout(500)
        assert "STEP 1 OF 7" in page.inner_text("#tour-tip")
        page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowRight")
        page.wait_for_timeout(500)
        shot(page, "tour")
        for _ in range(3):
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(200)
        page.click("#tour-tip .btn.primary")  # Finish
        assert page.is_hidden("#tour")

        # ---- home state persisted ----
        assert page.inner_text("#hello") == "Welcome, Riley"
        assert page.inner_text("#check-count").startswith("2 of 5")
        page.reload()
        page.wait_for_timeout(300)
        assert page.is_hidden("#onboard"), "onboarding should not reappear"
        assert page.inner_text("#me-avatar") == "RP"

        # ---- theme toggle ----
        page.keyboard.press("Control+Shift+L")
        assert "light" in page.get_attribute("body", "class")
        page.keyboard.press("Control+Shift+L")

        # ---- updater ----
        page.goto(UI + "?demo=1&simulateUpdate=0.2.0")
        page.wait_for_selector("#update-pill:not(.hidden)")
        page.wait_for_function("document.querySelector('#update-pill-label').innerText.startsWith('Restart')", timeout=5000)
        shot(page, "update-pill")
        page.click("#update-pill")
        page.wait_for_selector("#update-pop:not(.hidden)")
        assert "v0.2.0 is ready" in page.inner_text("#update-pop")
        assert page.locator(".handoff-to").count() == 2
        shot(page, "update-handoff")
        page.click('[data-u="later-menu"]')
        page.click('[data-ms="3600000"]')
        assert page.is_hidden("#update-pop")
        assert "quiet" in page.get_attribute("#update-pill", "class")
        page.click("#update-pill")
        page.click("#up-go")
        page.wait_for_function("!location.search.includes('simulateUpdate')", timeout=8000)
        page.wait_for_timeout(1000)
        assert "Updated to v0.2.0" in page.inner_text(".toast")

        b.close()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("UI smoke test passed")


if __name__ == "__main__":
    main()
