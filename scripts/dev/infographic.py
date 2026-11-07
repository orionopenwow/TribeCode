#!/usr/bin/env python3
"""Render docs/infographic/index.html to docs/infographic/tribecode-infographic.png at 2x (Playwright + Chrome).
Usage: python3 scripts/dev/infographic.py   (npm run dev:infographic)"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "infographic" / "index.html"
OUT = ROOT / "docs" / "infographic" / "tribecode-infographic.png"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(SRC.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
    pg.locator("#poster").screenshot(path=str(OUT))
    # phone check: the poster scales down, no sideways scroll
    ph = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    ph.goto(SRC.as_uri()); ph.wait_for_timeout(300)
    assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll at 390px"
    b.close()
    assert not errors, errors
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
