"""Writes the small asset fixtures that app/test/e2e_viewers.py commits into a test repo (stdlib only, deterministic).
  cube.glb   a binary glTF cube: 1 mesh, 12 triangles, 1 material, 1 animation ("Spin")
  walk.png   a 64x16 sprite sheet: 4 frames of 16x16, a square that moves and changes color
  hero.png + hero.json   a 24x8 sheet with an Aseprite (hash) JSON: 3 frames of 8x8, durations and a "blink" tag
  blink.gif  an 8x8 GIF with 3 frames
Usage: python app/test/fixtures/make_viewer_fixtures.py [out_dir]   (default: this folder)
"""
import json, math, struct, sys, zlib
from pathlib import Path


def png(w, h, px):
    """px: function (x, y) -> (r, g, b, a)."""
    raw = b"".join(b"\x00" + b"".join(bytes(px(x, y)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


WALK = [(242, 107, 29, 255), (56, 198, 177, 255), (108, 124, 255, 255), (59, 209, 111, 255)]


def walk_px(x, y):
    f, lx = x // 16, x % 16
    ox = 2 + f * 2   # the square moves right frame by frame
    return WALK[f] if ox <= lx < ox + 8 and 4 <= y < 12 else (0, 0, 0, 0)


def hero_px(x, y):
    f, lx = x // 8, x % 8
    if lx in (0, 7) or y in (0, 7): return (248, 250, 252, 255)
    if f == 1 and y in (3, 4): return (18, 21, 26, 255)   # eyes closed
    if y == 3 and lx in (2, 5): return (18, 21, 26, 255)
    return (242, 107, 29, 255)


def hero_json():
    frames = {f"hero {i}.aseprite": {"frame": {"x": i * 8, "y": 0, "w": 8, "h": 8}, "rotated": False, "trimmed": False,
                                     "spriteSourceSize": {"x": 0, "y": 0, "w": 8, "h": 8}, "sourceSize": {"w": 8, "h": 8}, "duration": d}
              for i, d in enumerate([300, 100, 200])}
    return json.dumps({"frames": frames, "meta": {"app": "https://www.aseprite.org/", "image": "hero.png", "format": "RGBA8888", "size": {"w": 24, "h": 8}, "scale": "1",
                                                  "frameTags": [{"name": "blink", "from": 0, "to": 1, "direction": "forward"}]}}, indent=1)


def gif(w, h, palette, frames, delay_cs=10):
    """frames: lists of palette indexes (w*h). LZW with a clear code every 2 pixels, so codes stay 3 bits (<= 4 colors)."""
    assert len(palette) <= 4
    pal = (palette + [(0, 0, 0)] * 4)[:4]
    out = bytearray(b"GIF89a" + struct.pack("<HHBBB", w, h, 0x80 | 0x01, 0, 0))
    for c in pal: out += bytes(c)
    out += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"   # loop forever
    for px in frames:
        out += b"\x21\xF9\x04" + struct.pack("<BHB", 0x04, delay_cs, 0) + b"\x00"   # disposal 1 (keep), no transparency
        out += b"\x2C" + struct.pack("<HHHHB", 0, 0, w, h, 0)
        codes = []
        for i in range(0, len(px), 2): codes += [4] + px[i:i + 2]
        codes.append(5)
        bits = acc = 0; data = bytearray()
        for c in codes:
            acc |= c << bits; bits += 3
            while bits >= 8: data.append(acc & 255); acc >>= 8; bits -= 8
        if bits: data.append(acc & 255)
        out += b"\x02"
        for i in range(0, len(data), 255): out += bytes([len(data[i:i + 255])]) + data[i:i + 255]
        out += b"\x00"
    return bytes(out + b"\x3B")


def blink_gif():
    w = h = 8
    def frame(k):
        return [(1 if (2 + k <= x < 5 + k and 2 <= y < 6) else 0) for y in range(h) for x in range(w)]
    return gif(w, h, [(18, 21, 26), (56, 198, 177)], [frame(0), frame(1), frame(2)], 12)


def glb():
    # 24 vertices (4 per face, so each face has its own normal), 36 indices
    faces = [((1, 0, 0), (0, 1, 0)), ((-1, 0, 0), (0, 1, 0)), ((0, 1, 0), (0, 0, 1)), ((0, -1, 0), (0, 0, 1)), ((0, 0, 1), (0, 1, 0)), ((0, 0, -1), (0, 1, 0))]
    pos, nor, idx = [], [], []
    for n, up in faces:
        n_ = n; u = up; r = (u[1] * n_[2] - u[2] * n_[1], u[2] * n_[0] - u[0] * n_[2], u[0] * n_[1] - u[1] * n_[0])
        base = len(pos) // 3
        for su, sr in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
            pos += [0.5 * (n_[i] + su * u[i] + sr * r[i]) for i in range(3)]; nor += list(n_)
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    times = [0.0, 1.0, 2.0]
    rots = []
    for t in times:
        a = t * math.pi / 2; rots += [0.0, math.sin(a / 2), 0.0, math.cos(a / 2)]
    blobs = [struct.pack(f"<{len(pos)}f", *pos), struct.pack(f"<{len(nor)}f", *nor), struct.pack(f"<{len(idx)}H", *idx), struct.pack("<3f", *times), struct.pack(f"<{len(rots)}f", *rots)]
    buf, views = bytearray(), []
    for b in blobs:
        while len(buf) % 4: buf.append(0)
        views.append({"buffer": 0, "byteOffset": len(buf), "byteLength": len(b)}); buf += b
    while len(buf) % 4: buf.append(0)
    doc = {
        "asset": {"version": "2.0", "generator": "TribeCode test fixtures"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Cube"}],
        "meshes": [{"name": "Cube", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"name": "Ember", "pbrMetallicRoughness": {"baseColorFactor": [0.95, 0.42, 0.11, 1], "metallicFactor": 0, "roughnessFactor": 0.8}}],
        "animations": [{"name": "Spin", "samplers": [{"input": 3, "output": 4, "interpolation": "LINEAR"}], "channels": [{"sampler": 0, "target": {"node": 0, "path": "rotation"}}]}],
        "buffers": [{"byteLength": len(buf)}],
        "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3", "min": [-0.5, -0.5, -0.5], "max": [0.5, 0.5, 0.5]},
            {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": 36, "type": "SCALAR"},
            {"bufferView": 3, "componentType": 5126, "count": 3, "type": "SCALAR", "min": [0.0], "max": [2.0]},
            {"bufferView": 4, "componentType": 5126, "count": 3, "type": "VEC4"},
        ],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(buf), b"BIN\x00") + bytes(buf)
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


def write(out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    (out / "cube.glb").write_bytes(glb())
    (out / "walk.png").write_bytes(png(64, 16, walk_px))
    (out / "hero.png").write_bytes(png(24, 8, hero_px))
    (out / "hero.json").write_text(hero_json() + "\n")
    (out / "blink.gif").write_bytes(blink_gif())
    return out


if __name__ == "__main__":
    print(write(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "viewers"))
