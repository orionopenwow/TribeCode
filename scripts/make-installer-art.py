#!/usr/bin/env python3
"""Draws the Windows installer images (NSIS + MSI/WiX) in the matte TribeCode style: canvas #12151A, the fire logo,
one thin Ember line, no gradients or glows. Writes 24-bit BMPs to app/src-tauri/installer/ (tauri.conf.json
bundle.windows.nsis / .wix point at them). Needs Pillow:  pip install pillow   Usage: python3 scripts/make-installer-art.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "src-tauri" / "installer"
ICON = ROOT / "app" / "ui" / "assets" / "icon-512.png"
WORDMARK = ROOT / "assets" / "brand" / "logo-text-dark.png"     # white "Tribe" + Ember "Code", transparent
FONT = ROOT / "app" / "ui" / "assets" / "fonts" / "Inter-Medium.otf"
CANVAS, SURFACE, BORDER, EMBER, BODY, WHITE = "#12151A", "#1B2028", "#2A313C", "#F26B1D", "#94A3B8", "#FFFFFF"
X = 4   # draw at 4x, then scale down: crisp edges without any blur effects in the art itself

def logo(size):
    return Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)

def wordmark(width):
    w = Image.open(WORDMARK).convert("RGBA")
    return w.resize((width, round(w.height * width / w.width)), Image.LANCZOS)

def text(draw, xy, s, size, fill):
    draw.text(xy, s, font=ImageFont.truetype(str(FONT), size), fill=fill)

def save(img, name, size):
    img = img.resize(size, Image.LANCZOS).convert("RGB")   # BMP without alpha: what NSIS and WiX expect
    img.save(OUT / name, format="BMP")
    print(f"wrote {OUT / name} {img.size}")

def panel(w, h):
    """The tall dark panel: logo, wordmark, one line of copy, a short Ember rule. Used by NSIS and WiX."""
    img = Image.new("RGBA", (w * X, h * X), CANVAS)
    d = ImageDraw.Draw(img)
    pad = 22 * X
    img.alpha_composite(logo(64 * X), (pad, 34 * X))
    wm = wordmark(w * X - 2 * pad)
    img.alpha_composite(wm, (pad, 116 * X))
    y = 116 * X + wm.height + 12 * X
    d.rectangle([pad, y, pad + 22 * X, y + 2 * X - 1], fill=EMBER)          # the one Ember accent
    text(d, (pad, y + 12 * X), "Code with friends", 11 * X, BODY)
    text(d, (pad, y + 27 * X), "and Claude.", 11 * X, BODY)
    d.rectangle([w * X - X, 0, w * X - 1, h * X], fill=BORDER)               # 1px edge against the white page
    return img

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # NSIS sidebar: Welcome and Finish pages (164 x 314)
    save(panel(164, 314), "nsis-sidebar.bmp", (164, 314))

    # NSIS header: top-left of every other page, beside the white title area (150 x 57)
    w, h = 150, 57
    img = Image.new("RGBA", (w * X, h * X), CANVAS)
    d = ImageDraw.Draw(img)
    img.alpha_composite(logo(33 * X), (12 * X, 11 * X))
    wm = wordmark(88 * X)
    img.alpha_composite(wm, (53 * X, (h * X - wm.height) // 2 - X))
    d.rectangle([0, h * X - 2 * X, w * X, h * X], fill=EMBER)
    save(img, "nsis-header.bmp", (w, h))

    # MSI (WiX) banner: the dialog title is drawn over its left side in black, so that side stays white (493 x 58)
    w, h = 493, 58
    img = Image.new("RGBA", (w * X, h * X), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle([w * X - 58 * X, 0, w * X, h * X], fill=CANVAS)
    img.alpha_composite(logo(38 * X), (w * X - 48 * X, 10 * X))
    d.rectangle([0, h * X - 2 * X, w * X, h * X], fill=EMBER)
    save(img, "wix-banner.bmp", (w, h))

    # MSI (WiX) dialog: Welcome and Finish; the text sits on the white right side (493 x 312)
    w, h = 493, 312
    img = Image.new("RGBA", (w * X, h * X), WHITE)
    img.alpha_composite(panel(164, 312), (0, 0))
    save(img, "wix-dialog.bmp", (w, h))

if __name__ == "__main__":
    main()
