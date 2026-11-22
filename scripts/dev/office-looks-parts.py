#!/usr/bin/env python3
"""Office Space character parts made from the shipped ones, in the same style, sheet layout and frame grid.

The source parts are Metro City (JIK-A-4, CC0) as shipped by Pixel Agents (MIT). Every new part here is an edit of
those pixels: mirrored partings, buns and curls grown from the hair's own shades, stripes and collars on the shirts,
brims on the caps, soles on the shoes. Parts stay grey, like the originals, so app/ui/officelooks-core.js can
palette-swap them; #f0f0f0 and #d0d0d0 mark details that keep a fixed cream (stripes, soles).

Run from the repo root (reproducible; it overwrites only the files it makes):
    python3 scripts/dev/office-looks-parts.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CH = ROOT / "app/ui/officespace/characters"
W, H, FW, FH = 128, 96, 16, 32
CREAM, CREAM_SH = (0xF0, 0xF0, 0xF0), (0xD0, 0xD0, 0xD0)


def load(rel):
    return np.array(Image.open(CH / rel).convert("RGBA"), dtype=np.uint8)


def save(arr, rel):
    p = CH / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(p, optimize=True)
    return rel


def frames():
    for r in range(3):
        for c in range(8):
            yield r, c, c * FW, r * FH


def lum(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def shades(a):
    """The part's distinct colours sorted dark to light, and the most common one."""
    cols = {}
    for y in range(H):
        for x in range(W):
            if a[y, x, 3] > 1:
                k = tuple(int(v) for v in a[y, x, :3])
                cols[k] = cols.get(k, 0) + 1
    order = sorted(cols, key=lum)
    return order, max(cols, key=cols.get)


def put(a, x, y, rgb, x0=None, x1=None):
    if 0 <= x < W and 0 <= y < H and (x0 is None or x0 <= x < x1):
        a[y, x, :3] = rgb
        a[y, x, 3] = 255


def opaque(a, x, y):
    return 0 <= x < W and 0 <= y < H and a[y, x, 3] > 1


BODY = load("body/flat.png")
TEE = load("top/tshirt.png")


def head(r, ox, oy):
    """Geometry of the head in one frame, from the body: top row, left/right/centre, the neckline row."""
    ys = [y for y in range(oy, oy + FH) if any(BODY[y, x, 3] > 1 for x in range(ox, ox + FW))]
    top = ys[0]
    xs = [x for y in range(top, top + 12) for x in range(ox, ox + FW) if BODY[y, x, 3] > 1]
    left, right = min(xs), max(xs)
    neck = next((y for y in range(oy, oy + FH) if any(TEE[y, x, 3] > 1 for x in range(ox, ox + FW))), top + 15)
    return dict(top=top, left=left, right=right, cx=(left + right) / 2, neck=neck, side=(r == 2))


# ---------------- hair ----------------
def mirror_front_back(src):
    """Partings on the other side: front and back frames mirrored about the head's centre; side frames kept."""
    a = load(src)
    out = a.copy()
    for r, c, ox, oy in frames():
        if r == 2:
            continue
        g = head(r, ox, oy)
        s = g["left"] + g["right"]
        out[oy:oy + FH, ox:ox + FW] = 0
        for y in range(oy, oy + FH):
            for x in range(ox, ox + FW):
                if a[y, x, 3] > 1:
                    put(out, s - x, y, a[y, x, :3], ox, ox + FW)
    return out


def blob(a, cx, by, w, h, dark, main, light, ox):
    """A round bun of w x h with its bottom row at by, centred on cx, in the hair's own shades."""
    x0 = int(round(cx - w / 2))
    for j in range(h):
        for i in range(w):
            corner = (i in (0, w - 1)) and (j in (0, h - 1))
            if corner:
                continue
            edge = i in (0, w - 1) or j in (0, h - 1) or ((i in (1, w - 2)) and (j in (0, h - 1)))
            col = dark if edge else (light if (j == 1 and i <= w // 2 - 1) else main)
            put(a, x0 + i, by - h + 1 + j, col, ox, ox + FW)


def hair_top(a, ox, oy):
    for y in range(oy, oy + FH):
        if any(a[y, x, 3] > 1 for x in range(ox, ox + FW)):
            return y
    return oy


def bun(src, two=False):
    a = load(src)
    order, main = shades(a)
    dark, light = order[0], order[-1]
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t = hair_top(a, ox, oy)
        if two and r != 2:
            blob(a, g["left"] + 2.5, t + 2, 5, 4, dark, main, light, ox)
            blob(a, g["right"] - 1.5, t + 2, 5, 4, dark, main, light, ox)
        elif two:
            blob(a, g["cx"] - 3, t + 1, 5, 4, dark, main, light, ox)
        else:
            blob(a, g["cx"] - (3 if r == 2 else 0) + 0.5, t + 1, 6, 4, dark, main, light, ox)
    return a


def curls(src, grow=2, below=8):
    """Volume: the hair's silhouette grown up and out (never down over the face), outlined, with a curl texture."""
    a = load(src)
    order, _ = shades(a)
    cnt = {tuple(int(v) for v in a[y, x, :3]): 0 for y in range(H) for x in range(W) if a[y, x, 3] > 1}
    for y in range(H):
        for x in range(W):
            if a[y, x, 3] > 1:
                cnt[tuple(int(v) for v in a[y, x, :3])] += 1
    upper = order[len(order) // 2:]
    main = max(upper, key=lambda k: cnt[k])
    dark, mid, light = order[0], order[len(order) // 2 - 1], order[-1]
    out = a.copy()
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        m = np.zeros((FH, FW), bool)
        for y in range(FH):
            for x in range(FW):
                m[y, x] = a[oy + y, ox + x, 3] > 1
        grown = m.copy()
        lim = g["top"] - oy + below
        for y in range(FH):
            for x in range(FW):
                if not m[y, x] or y > lim:
                    continue
                for dy in range(-grow, 1):
                    for dx in range(-grow, grow + 1):
                        if abs(dx) + abs(dy) <= grow + (1 if dy < 0 else 0) and 0 <= y + dy < FH and 0 <= x + dx < FW:
                            grown[y + dy, x + dx] = True
        for y in range(FH):
            for x in range(FW):
                if not grown[y, x]:
                    continue
                edge = any(not (0 <= y + dy < FH and 0 <= x + dx < FW and grown[y + dy, x + dx]) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)))
                new = not m[y, x]
                if not new and y > lim:
                    col = tuple(int(v) for v in a[oy + y, ox + x, :3])   # the fringe over the face stays as drawn
                elif edge:
                    col = dark
                else:
                    k = (3 * x + 5 * y) % 9
                    col = light if (k == 0 and y < lim - 1) else mid if k in (4, 6) else main
                put(out, ox + x, oy + y, col)
    return out


def buzz():
    """Close-cropped: the scalp in the hair's shades, a fine stipple, the head's own outline."""
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, mid = (0x3D, 0x3D, 0x3D), (0x7B, 0x7B, 0x7B), (0x64, 0x64, 0x64)
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t = g["top"]
        for y in range(t, t + 12):
            for x in range(ox, ox + FW):
                if BODY[y, x, 3] < 2:
                    continue
                if r == 0 and y > t + 5:
                    continue
                if r == 2 and y > t + 5 and x > g["cx"] - 1:
                    continue
                if r == 1 and y > t + 10:
                    continue
                outline = tuple(BODY[y, x, :3]) == (0x49, 0x3E, 0x38) or tuple(BODY[y, x, :3]) == (0x40, 0x36, 0x32)
                put(a, x, y, dark if outline else (mid if (x + 2 * y) % 5 == 0 else main))
        # a soft hairline: the bottom row of the cropped area loses every other pixel
        if r == 0:
            for x in range(ox, ox + FW):
                y = t + 5
                if a[y, x, 3] and tuple(a[y, x, :3]) != dark and x % 2:
                    a[y, x, 3] = 0
    return a


def mohawk():
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, light = (0x3D, 0x3D, 0x3D), (0x7B, 0x7B, 0x7B), (0x95, 0x95, 0x95)
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t = g["top"]
        if r != 2:
            cx = int(g["cx"])
            for y in range(t - 3, t + (5 if r == 0 else 10)):
                put(a, cx - 1, y, dark)
                put(a, cx + 2, y, dark)
                put(a, cx, y, light if (r == 0 and y < t) else main)
                put(a, cx + 1, y, main)
            put(a, cx, t - 4, dark)
            put(a, cx + 1, t - 4, dark)
        else:
            for x in range(g["left"] + 1, g["right"] - 2):
                ht = next(y for y in range(oy, oy + FH) if BODY[y, x, 3] > 1)
                put(a, x, ht - 3, dark)
                put(a, x, ht - 2, light if x % 2 else main)
                put(a, x, ht - 1, main)
                put(a, x, ht, dark)
            for y in range(t - 3, t + 1):
                put(a, g["left"], y + 1, dark)
                put(a, g["right"] - 2, y + 1, dark)
    return a


# ---------------- hats ----------------
def cap_box(a, ox, oy):
    ys = [y for y in range(oy, oy + FH) if any(a[y, x, 3] > 1 for x in range(ox, ox + FW))]
    xs = [x for y in ys for x in range(ox, ox + FW) if a[y, x, 3] > 1]
    return min(ys), max(ys), min(xs), max(xs)


def bobble_hat():
    a = load("hat/plain_cap.png")
    order, main = shades(a)
    dark, light, shadow = order[0], order[-1], order[1]
    for r, c, ox, oy in frames():
        t, b, l, rr = cap_box(a, ox, oy)
        for y in (b - 1, b):
            for x in range(l, rr + 1):
                if a[y, x, 3] > 1 and tuple(a[y, x, :3]) != dark:
                    put(a, x, y, light if x % 2 else shadow)
        cx = (l + rr) / 2 - (2 if r == 2 else 0)
        blob(a, cx + 0.5, t, 4, 3, dark, light, light, ox)
    return a


def headband():
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, light = (0x34, 0x34, 0x34), (0x6E, 0x6E, 0x6E), (0x8E, 0x8E, 0x8E)
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        y0 = g["top"] + 4
        for y, col in ((y0, light), (y0 + 1, main)):
            xs = [x for x in range(ox, ox + FW) if BODY[y, x, 3] > 1]
            if not xs:
                continue
            lo, hi = min(xs), max(xs)
            for x in range(lo, hi + 1):
                put(a, x, y, dark if x in (lo, hi) else col, ox, ox + FW)
        for x in range(ox, ox + FW):
            if a[y0, x, 3] and not a[y0 - 1, x, 3]:
                pass
    return a


def ball_cap():
    a = load("hat/plain_cap.png")
    order, main = shades(a)
    dark, light, shadow = order[0], order[-1], order[1]
    for r, c, ox, oy in frames():
        t, b, l, rr = cap_box(a, ox, oy)
        if r == 0:   # the brim faces us: a lighter band with a dark edge under it
            for x in range(l, rr + 1):
                if a[b - 1, x, 3] > 1:
                    put(a, x, b - 1, light if l < x < rr else dark)
                if a[b, x, 3] > 1:
                    put(a, x, b, dark)
        elif r == 2:   # the brim sticks out in front
            for x in range(rr - 1, min(rr + 4, ox + FW)):
                put(a, x, b - 1, light if x < rr + 3 else dark, ox, ox + FW)
                put(a, x, b, dark, ox, ox + FW)
        else:   # the strap's gap at the back
            cx = int((l + rr) / 2)
            for x in (cx, cx + 1):
                put(a, x, b - 1, shadow)
    return a


def bucket_hat():
    a = load("hat/plain_cap.png")
    order, main = shades(a)
    dark, light, shadow = order[0], order[-1], order[1]
    for r, c, ox, oy in frames():
        t, b, l, rr = cap_box(a, ox, oy)
        for x in range(l - 1, rr + 2):
            put(a, x, b, dark, ox, ox + FW)
            if l <= x <= rr:
                put(a, x, b - 1, shadow if (x in (l, rr)) else main)
        put(a, l - 1, b - 1, dark, ox, ox + FW)
        put(a, rr + 1, b - 1, dark, ox, ox + FW)
        for x in range(l + 1, rr):   # a band
            if a[b - 3, x, 3] > 1 and tuple(a[b - 3, x, :3]) != dark:
                put(a, x, b - 3, shadow)
    return a


# ---------------- tops ----------------
def top_rows(a, ox, oy):
    ys = [y for y in range(oy, oy + FH) if any(a[y, x, 3] > 1 for x in range(ox, ox + FW))]
    return ys[0], ys[-1]


def stripes(src):
    a = load(src)
    order, main = shades(a)
    dark = order[0]
    for r, c, ox, oy in frames():
        t, b = top_rows(a, ox, oy)
        for y in range(t + 1, b + 1):
            if (y - t) % 2:
                continue
            for x in range(ox, ox + FW):
                if a[y, x, 3] > 1 and tuple(a[y, x, :3]) != dark:
                    put(a, x, y, CREAM_SH if lum(a[y, x, :3]) < lum(main) else CREAM)
    return a


def ringer():
    a = load("top/tshirt.png")
    order, main = shades(a)
    dark = order[0]
    for r, c, ox, oy in frames():
        t, b = top_rows(a, ox, oy)
        for x in range(ox, ox + FW):   # neckline
            if a[t, x, 3] > 1 and tuple(a[t, x, :3]) != dark:
                put(a, x, t, CREAM)
        if r == 2:
            continue
        xs = [x for y in range(t, b + 1) for x in range(ox, ox + FW) if a[y, x, 3] > 1]
        lo, hi = min(xs), max(xs)
        for x in list(range(lo, lo + 3)) + list(range(hi - 2, hi + 1)):   # sleeve hems: the lowest sleeve pixel
            ys = [y for y in range(t, b + 1) if a[y, x, 3] > 1 and tuple(a[y, x, :3]) != dark]
            if ys and ys[-1] < b - 1:
                put(a, x, ys[-1], CREAM)
    return a


def pocket():
    a = load("top/tshirt.png")
    order, main = shades(a)
    dark, shadow, light = order[0], order[1], order[-1]
    for r, c, ox, oy in frames():
        if r != 0:
            continue
        g = head(r, ox, oy)
        t, b = top_rows(a, ox, oy)
        x0, y0 = int(g["cx"]) + 1, t + 2
        for i in range(3):
            put(a, x0 + i, y0, shadow)
        put(a, x0 + 2, y0 + 1, shadow)
        put(a, x0, y0 + 1, light)
        put(a, x0 + 1, y0 + 1, main)
    return a


def polo():
    a = load("top/tshirt.png")
    order, main = shades(a)
    dark, shadow, light = order[0], order[1], order[-1]
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t, b = top_rows(a, ox, oy)
        cx = int(g["cx"])
        if r == 0:
            for x in range(cx - 2, cx + 4):
                put(a, x, t, light)
            put(a, cx - 1, t + 1, light)
            put(a, cx + 2, t + 1, light)
            put(a, cx, t + 1, shadow)
            put(a, cx + 1, t + 1, shadow)
            put(a, cx, t + 2, dark)
        elif r == 1:
            for x in range(cx - 2, cx + 4):
                put(a, x, t, light)
        else:
            for x in range(ox, ox + FW):
                if a[t, x, 3] > 1:
                    put(a, x, t, light)
    return a


def hood(a, back_only=False):
    """A hood bunched round the neck (front) or lying on the upper back (back and side), in the part's shades."""
    order, main = shades(a)
    dark, shadow, light = order[0], order[1], order[-1]
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t, b = top_rows(a, ox, oy)
        cx = int(g["cx"])
        if r == 0 and not back_only:
            for x in range(cx - 3, cx + 5):
                put(a, x, t, dark if x in (cx - 3, cx + 4) else shadow)
            put(a, cx - 1, t + 1, light)
            put(a, cx - 1, t + 2, light)
            put(a, cx + 2, t + 1, light)
            put(a, cx + 2, t + 2, light)
            for x in range(cx - 2, cx + 4):   # the front pocket's seam
                if a[t + 5, x, 3] > 1:
                    put(a, x, t + 5, shadow)
        elif r == 1:
            for j, (w, col) in enumerate(((6, dark), (8, main), (8, main), (6, shadow))):
                for x in range(cx - w // 2 + 1, cx + w // 2 + 1):
                    edge = x in (cx - w // 2 + 1, cx + w // 2)
                    put(a, x, t - 2 + j, dark if edge or j == 0 else col)
    return a


# ---------------- shoes and bottoms ----------------
def soles(src):
    a = load(src)
    for r, c, ox, oy in frames():
        ys = [y for y in range(oy, oy + FH) if any(a[y, x, 3] > 1 for x in range(ox, ox + FW))]
        if not ys:
            continue
        b = ys[-1]
        for x in range(ox, ox + FW):
            if a[b, x, 3] > 1:
                put(a, x, b, CREAM)
    return a


def cuffs():
    a = load("pants/jeans.png")
    order, main = shades(a)
    dark, light = order[0], order[-1]
    for r, c, ox, oy in frames():
        for x in range(ox, ox + FW):
            ys = [y for y in range(oy, oy + FH) if a[y, x, 3] > 1]
            if not ys:
                continue
            y = ys[-1]
            if tuple(a[y, x, :3]) not in (dark,) and lum(a[y, x, :3]) > 20:
                put(a, x, y, light)
    return a


def pleats():
    a = load("pants/skirt.png")
    order, main = shades(a)
    dark, shadow = order[0], order[1]
    for r, c, ox, oy in frames():
        t, b = top_rows(a, ox, oy)
        for y in range(t + 1, b + 1):
            for x in range(ox, ox + FW):
                if a[y, x, 3] > 1 and tuple(a[y, x, :3]) != dark and x % 2 == 0:
                    put(a, x, y, shadow)
    return a


def hem(src):
    a = load(src)
    order, main = shades(a)
    dark, shadow = order[0], order[1]
    for r, c, ox, oy in frames():
        for x in range(ox, ox + FW):
            ys = [y for y in range(oy, oy + FH) if a[y, x, 3] > 1 and tuple(a[y, x, :3]) != dark]
            if ys:
                put(a, x, ys[-1], shadow)
    return a


# ---------------- facial hair ----------------
def minus(src, other, keep_cx=None):
    a, o = load(src), load(other)
    a[o[:, :, 3] > 1] = 0
    if keep_cx is not None:
        for r, c, ox, oy in frames():
            g = head(r, ox, oy)
            for y in range(oy, oy + FH):
                for x in range(ox, ox + FW):
                    if a[y, x, 3] > 1 and (abs(x - g["cx"] - (2 if r == 2 else 0)) > keep_cx):
                        a[y, x, 3] = 0
    return a


def handlebar():
    a = load("beard/moustache.png")
    order, main = shades(a)
    dark = order[0]
    for r, c, ox, oy in frames():
        pts = [(x, y) for y in range(oy, oy + FH) for x in range(ox, ox + FW) if a[y, x, 3] > 1]
        if not pts:
            continue
        ys = [p[1] for p in pts]
        yb = max(ys)
        lo = min(p[0] for p in pts if p[1] == yb)
        hi = max(p[0] for p in pts if p[1] == yb)
        if r == 0:
            put(a, lo - 1, yb, dark, ox, ox + FW)
            put(a, lo - 1, yb - 1, dark, ox, ox + FW)
            put(a, hi + 1, yb, dark, ox, ox + FW)
            put(a, hi + 1, yb - 1, dark, ox, ox + FW)
        elif r == 2:
            put(a, hi + 1, yb, dark, ox, ox + FW)
            put(a, hi + 1, yb - 1, dark, ox, ox + FW)
    return a


# ---------------- neck and head accessories ----------------
TIE = load("tie/suit_and_tie.png")


def bow_tie():
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, shadow, light = (0x34, 0x34, 0x34), (0x6E, 0x6E, 0x6E), (0x63, 0x63, 0x63), (0x8E, 0x8E, 0x8E)
    for r, c, ox, oy in frames():
        pts = [(x, y) for y in range(oy, oy + FH) for x in range(ox, ox + FW) if TIE[y, x, 3] > 1]
        if not pts or r == 1:
            continue
        ty = min(p[1] for p in pts)
        xs = sorted(p[0] for p in pts if p[1] == ty)
        cx = xs[0]
        if r == 0:
            for i, col in enumerate((dark, light, shadow, light, dark)):
                put(a, cx - 2 + i + (1 if len(xs) > 1 else 0) - 1, ty, col)
                put(a, cx - 2 + i + (1 if len(xs) > 1 else 0) - 1, ty + 1, dark if i in (0, 4) else (shadow if i == 2 else main))
        else:
            put(a, cx, ty, main)
            put(a, cx, ty + 1, shadow)
    return a


def scarf():
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, shadow, light = (0x34, 0x34, 0x34), (0x6E, 0x6E, 0x6E), (0x63, 0x63, 0x63), (0x8E, 0x8E, 0x8E)
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t = g["neck"]
        cx = int(g["cx"])
        if r == 2:
            lo, hi = cx - 2, cx + 3
        else:
            lo, hi = cx - 3, cx + 4
        for x in range(lo, hi + 1):
            put(a, x, t - 1, dark if x in (lo, hi) else light)
            put(a, x, t, dark if x in (lo, hi) else main)
        put(a, lo, t - 2, dark)
        put(a, hi, t - 2, dark)
        for x in range(lo + 1, hi):
            put(a, x, t - 2, dark)
        if r == 0:   # the tail hangs in front
            for y in range(t + 1, t + 4):
                put(a, cx + 2, y, shadow)
                put(a, cx + 3, y, dark)
                put(a, cx + 1, y, dark)
            put(a, cx + 2, t + 4, dark)
        elif r == 2:
            for y in range(t + 1, t + 3):
                put(a, hi - 1, y, shadow)
                put(a, hi, y, dark)
    return a


def headphones():
    a = np.zeros((H, W, 4), np.uint8)
    dark, main, light = (0x34, 0x34, 0x34), (0x6E, 0x6E, 0x6E), (0x8E, 0x8E, 0x8E)
    for r, c, ox, oy in frames():
        g = head(r, ox, oy)
        t, l, rr = g["top"], g["left"], g["right"]
        if r != 2:
            for x in range(l + 2, rr - 1):
                put(a, x, t - 1, dark)
                put(a, x, t, light if x < g["cx"] else main)
            for (x, d) in ((l + 1, 1), (rr - 1, -1)):
                put(a, x, t, dark)
                for y in range(t + 1, t + 7):
                    put(a, x, y, main)
                    put(a, x - d, y, dark)
            for x0 in (l - 1, rr - 1):   # the cups
                for y in range(t + 7, t + 11):
                    for i in range(3):
                        edge = i in (0, 2) or y in (t + 7, t + 10)
                        put(a, x0 + i, y, dark if edge else light if r == 0 else main, ox, ox + FW)
        else:
            cx = int(g["cx"]) - 1
            for x in range(l + 1, rr):
                ht = next((y for y in range(oy, oy + FH) if BODY[y, x, 3] > 1), t)
                put(a, x, ht - 1, dark)
                put(a, x, ht, main)
            for y in range(t, t + 7):
                put(a, cx, y, main)
                put(a, cx + 1, y, dark)
                put(a, cx - 1, y, dark)
            for y in range(t + 7, t + 12):
                for i in range(4):
                    edge = i in (0, 3) or y in (t + 7, t + 11)
                    put(a, cx - 1 + i, y, dark if edge else light if i == 1 else main)
    return a


def studs():
    a = load("earrings/earrings.png")
    for r, c, ox, oy in frames():
        seen = set()
        for y in range(oy, oy + FH):
            for x in range(ox, ox + FW):
                if a[y, x, 3] > 1:
                    if any((x + dx) in seen for dx in (-1, 0, 1)):
                        a[y, x, 3] = 0
                        a[y, x, :3] = 0
                    else:
                        seen.add(x)
    return a


def main():
    made = [
        save(mirror_front_back("hair/parted.png"), "hair/parted_left.png"),
        save(mirror_front_back("hair/side_swept.png"), "hair/swept_left.png"),
        save(bun("hair/slicked_back.png"), "hair/top_bun.png"),
        save(bun("hair/slicked_back.png", two=True), "hair/space_buns.png"),
        save(curls("hair/short.png", 2, 8), "hair/afro.png"),
        save(curls("hair/long_waves.png", 1, 9), "hair/curly_long.png"),
        save(buzz(), "hair/buzz.png"),
        save(mohawk(), "hair/mohawk.png"),
        save(stripes("top/tshirt.png"), "top/striped_tee.png"),
        save(pocket(), "top/pocket_tee.png"),
        save(polo(), "top/polo.png"),
        save(ringer(), "top/ringer_tee.png"),
        save(hood(load("top/long_sleeved_shirt.png")), "top/hoodie.png"),
        save(stripes("top/long_sleeved_shirt.png"), "top/striped_long.png"),
        save(cuffs(), "pants/cuffed_jeans.png"),
        save(pleats(), "pants/pleated_skirt.png"),
        save(soles("shoes/boots.png"), "shoes/high_tops.png"),
        save(soles("shoes/sneakers.png"), "shoes/white_soles.png"),
        save(hem("jacket/open_shirt.png"), "jacket/cardigan.png"),
        save(hood(load("jacket/bomber.png"), back_only=True), "jacket/zip_hoodie.png"),
        save(minus("beard/full_beard.png", "beard/moustache.png"), "beard/chin_strap.png"),
        save(minus("beard/goatee.png", "beard/moustache.png", keep_cx=1.5), "beard/soul_patch.png"),
        save(handlebar(), "beard/handlebar.png"),
        save(bobble_hat(), "hat/beanie.png"),
        save(bucket_hat(), "hat/bucket_hat.png"),
        save(headband(), "hat/headband.png"),
        save(ball_cap(), "hat/ball_cap.png"),
        save(bow_tie(), "tie/bow_tie.png"),
        save(scarf(), "tie/scarf.png"),
        save(headphones(), "headphones/headphones.png"),
        save(studs(), "earrings/studs.png"),
    ]
    print("\n".join(made))


if __name__ == "__main__":
    main()
