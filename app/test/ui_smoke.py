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



def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

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

        # ---- first run: zero steps. No wizard; name, color and folder fill themselves in ----
        page.goto(UI + "?reset=1&demo=1")
        page.wait_for_function("TribeStore.get().onboarded === true")
        st = page.evaluate("TribeStore.get()")
        assert st["name"] and st["color"], st
        page.wait_for_selector("#tour-rail .logo", state="visible")

        # ---- Settings: one calm page ----
        page.click("#nest-settings")   # Settings: the bottom row of the sidebar
        page.wait_for_selector("#settings-modal:not(.hidden) #set-name")
        page.fill("#set-name", "Riley Park"); page.press("#set-name", "Tab")
        page.click('#settings-body [data-color="#FFB86B"]')
        page.click('#settings-body [data-theme="dark"]')
        page.wait_for_function("!document.querySelector('#settings-body').innerText.includes('Looking')", timeout=5000)
        shot(page, "settings")
        assert page.inner_text("#room-me") == "RP"
        assert page.evaluate("TribeStore.get().color") == "#FFB86B"

        # ---- the tour is optional, from Settings ----
        page.click("#set-tour")
        page.wait_for_selector("#tour:not(.hidden)")
        page.wait_for_timeout(500)
        assert "STEP 1 OF" in page.inner_text("#tour-tip")
        shot(page, "tour")
        for _ in range(8):
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(200)
        if page.is_visible("#tour"): page.click("#tour-tip .btn.primary")  # Finish
        assert page.is_hidden("#tour")

        page.reload()
        page.wait_for_timeout(300)
        assert page.inner_text("#room-me") == "RP"

        # ---- theme toggle ----
        page.keyboard.press("Control+Shift+L")
        assert "light" in page.get_attribute("body", "class")
        page.keyboard.press("Control+Shift+L")

        # ---- updater ----
        page.goto(UI + "?demo=1&simulateUpdate=0.2.0")
        page.wait_for_selector("#update-btn:not(.hidden)")   # a quiet icon next to the profile (refresh glyph + Teal dot)
        page.wait_for_function("document.querySelector('#update-btn').classList.contains('ready') && document.querySelector('#update-btn-label').textContent.startsWith('Update ready')", timeout=5000)
        shot(page, "update-pill")
        page.click("#update-btn")
        page.wait_for_selector("#update-pop:not(.hidden)")
        assert "v0.2.0 is ready" in page.inner_text("#update-pop")
        assert page.locator(".handoff-to").count() == 2
        shot(page, "update-handoff")
        page.click('[data-u="later-menu"]')
        page.click('[data-ms="3600000"]')
        assert page.is_hidden("#update-pop")
        assert "quiet" in page.get_attribute("#update-btn", "class")
        page.click("#update-btn")
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
