#!/usr/bin/env python3
"""Web sizes of the real tool screenshots listed in templates/studio-shots.json (only pictures whose terms clearly
allow reuse; see site/assets/toolbox/CREDITS.md and docs/SCREENSHOT-PERMISSIONS.md).

  python3 -I scripts/dev/toolbox-shots.py                 download each record's 'original' and write the sizes
  python3 -I scripts/dev/toolbox-shots.py --from DIR      use DIR/<id>.<ext> instead of downloading (a blocked network)
  python3 -I scripts/dev/toolbox-shots.py --check         exit 1 when a file is missing, too big, or belongs to no record

Each picture is only resized and recompressed: no crop, no retouching, no watermark removed. Per record it writes
<file>-640.webp/.jpg and <file>-<w>.webp/.jpg (w from the record, never larger than the original), every file at most
120 KB, to site/assets/toolbox/ (the website) and the small size to app/ui/assets/studios/ (the app's Workshop).
"""
import io, json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REC = json.loads((ROOT / "templates" / "studio-shots.json").read_text(encoding="utf8"))
SITE, APP = ROOT / "site" / "assets" / "toolbox", ROOT / "app" / "ui" / "assets" / "studios"
MAX = 120 * 1024
SMALL = 640
args = sys.argv[1:]


def names(rec):
    """(folder, file name, width) for every file a record owns."""
    out = []
    for w in (SMALL, rec["w"]):
        for ext in ("webp", "jpg"):
            out.append((SITE, f"{rec['file']}-{w}.{ext}", w))
    for ext in ("webp", "jpg"):
        out.append((APP, f"{rec['file']}-{SMALL}.{ext}", SMALL))
    return out


def check():
    bad, want = [], {SITE: set(), APP: set()}
    studios = {s["id"] for s in json.loads((ROOT / "templates" / "studios.json").read_text(encoding="utf8"))["studios"]}
    for sid, rec in REC["shots"].items():
        if sid not in studios: bad.append(f"{sid}: has a screenshot record but is no longer in templates/studios.json")
        for k in ("file", "w", "h", "alt", "by", "license", "licenseUrl", "source", "original", "terms", "fetched", "changes"):
            if not rec.get(k): bad.append(f"{sid}: the record has no '{k}'")
        for folder, name, _ in names(rec):
            want[folder].add(name); p = folder / name
            if not p.is_file(): bad.append(f"missing {p.relative_to(ROOT)}")
            elif p.stat().st_size > MAX: bad.append(f"{p.relative_to(ROOT)} is {p.stat().st_size // 1024} KB (limit 120)")
    for folder in (SITE, APP):
        for p in sorted(folder.glob("*")) if folder.is_dir() else []:
            if p.suffix in (".webp", ".jpg", ".png") and p.name not in want[folder]:
                bad.append(f"{p.relative_to(ROOT)} belongs to no record in templates/studio-shots.json")
    for b in bad: print("toolbox-shots: " + b, file=sys.stderr)
    if bad: sys.exit(1)
    print(f"toolbox shots: {len(REC['shots'])} credited screenshots, every size present and at most 120 KB")


def save(im, path, fmt):
    """The highest quality that fits in 120 KB."""
    for q in range(86, 20, -4):
        buf = io.BytesIO()
        if fmt == "webp": im.save(buf, "WEBP", quality=q, method=6)
        else: im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= MAX: break
    path.write_bytes(buf.getvalue())
    return q, buf.tell()


def build():
    from PIL import Image
    src_dir = Path(args[args.index("--from") + 1]) if "--from" in args else None
    SITE.mkdir(parents=True, exist_ok=True); APP.mkdir(parents=True, exist_ok=True)
    for sid, rec in REC["shots"].items():
        if src_dir:
            hit = [p for p in src_dir.glob(sid + ".*")]
            if not hit: sys.exit(f"{sid}: no {sid}.* in {src_dir}")
            data = hit[0].read_bytes()
        else:
            with urllib.request.urlopen(rec["original"], timeout=60) as r: data = r.read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if rec["w"] > im.width: sys.exit(f"{sid}: the record asks for {rec['w']}px but the original is {im.width}px wide")
        if abs(im.height * rec["w"] / im.width - rec["h"]) > 1: sys.exit(f"{sid}: w/h in the record do not match the original's shape")
        for folder, name, w in names(rec):
            h = round(im.height * w / im.width)
            q, size = save(im.resize((w, h), Image.LANCZOS), folder / name, "webp" if name.endswith(".webp") else "jpg")
            print(f"  {(folder / name).relative_to(ROOT)}  {w}x{h}  q{q}  {size // 1024} KB")


check() if "--check" in args else build()
