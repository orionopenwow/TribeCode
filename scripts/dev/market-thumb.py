#!/usr/bin/env python3
"""Make one small Marketplace thumbnail: python3 -I scripts/dev/market-thumb.py <in-image> <out.webp>
Reads a repo's own preview image (taken from its README by scripts/dev/market-catalog.js --fetch, never executed),
fits it inside 320x180 (keeps transparency), writes WebP at quality 52 and prints "<w> <h> <bytes>".
Exits 2 when the picture is too small or not an image."""
import sys
from PIL import Image, ImageSequence

src, out = sys.argv[1], sys.argv[2]
try:
    im = Image.open(src)
    im = next(iter(ImageSequence.Iterator(im))).copy()   # a GIF: its first frame
    w, h = im.size
    if w < 96 or h < 48 or w * h > 60_000_000: sys.exit(2)
    im = im.convert('RGBA')
    im.thumbnail((320, 180), Image.LANCZOS)
    # flat matte rule: opaque photos stay opaque (smaller files); logos keep their alpha
    from PIL import ImageStat
    a = im.getchannel('A')
    if a.getextrema() == (255, 255): im = im.convert('RGB')
    else:
        # a logo on transparency: dark ink would vanish on the dark theme, so it gets a white card of its own
        ink = ImageStat.Stat(im.convert('L'), mask=a.point(lambda v: 255 if v > 128 else 0)).mean[0] if a.getbbox() else 0
        if ink < 110:
            card = Image.new('RGB', im.size, (255, 255, 255)); card.paste(im, mask=a); im = card
    # blank or near-blank pictures (a white page, an empty frame) say nothing: use the drawn tile instead
    flat = im.convert('RGBA'); bg = Image.new('RGBA', flat.size, (128, 128, 128, 255)); bg.alpha_composite(flat)
    if sum(ImageStat.Stat(bg.convert('RGB')).stddev) / 3 < 14: sys.exit(2)
    im.save(out, 'WEBP', quality=52, method=6)
    import os
    print(im.size[0], im.size[1], os.path.getsize(out))
except SystemExit: raise
except Exception:
    sys.exit(2)
