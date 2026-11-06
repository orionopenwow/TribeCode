"""Render the UI mockups in design/mockups/app.html to PNG screenshots for the README.

Usage: python design/mockups/render.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "design" / "mockups" / "app.html"
OUT = ROOT / "docs" / "screenshots"

SHOTS = [
    ("docs", "dark"), ("docs", "light"),
    ("tasks", "dark"), ("board", "dark"),
    ("join", "dark"), ("join", "light"),
]

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome")
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
        for view, theme in SHOTS:
            page.goto(f"{SRC.as_uri()}?view={view}&theme={theme}")
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / f"{view}-{theme}.png"))
            print("wrote", f"{view}-{theme}.png")
        browser.close()

if __name__ == "__main__":
    main()
