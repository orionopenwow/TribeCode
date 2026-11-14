#!/usr/bin/env python3
"""npm run dev:thumbs — every thumbnail the Workshop and the website show for TribeCode's own free things, made live
from the real thing with one command, and a check that none of them has outlived what it pictures.

  python3 scripts/dev/live-thumbs.py              regenerate every group (run before each release; about 10 minutes)
  python3 scripts/dev/live-thumbs.py --only a,b   just those groups (names below)
  python3 scripts/dev/live-thumbs.py --list       the groups, what each pictures and how many thumbnails it holds
  python3 scripts/dev/live-thumbs.py --check      exit 1 when a thumbnail's source item no longer exists, an item has
                                                  no thumbnail, or the website points at a picture that is not there
                                                  (npm test runs this; it starts nothing and takes under a second)
  python3 scripts/dev/live-thumbs.py --sheet OUT.png [--ref GITREF]
                                                  a contact sheet of every thumbnail; with --ref, the same thumbnails
                                                  as they were at that commit sit beside today's (before | after)

Groups (each is rendered from the real template, starter or app screen, with fixed example content, at a fixed size):
  sites      the 16 website templates: templates/sites/<id>/thumb.png, and the small copies the website's "Websites" tab
             (site/assets/sites) and the offline demo (app/ui/demo/sites) show
  gallery    the website designer's template gallery in the app: app/ui/sitetpl/thumbs/<id>.webp
  design     the Design flow's starters: apps and games running (app/ui/starters/thumbs), screens, slides, posters,
             logos and whiteboards (app/ui/assets/designflow)
  starters   the website's starter cards: site/assets/starters/<slug>.jpg
  showcase   the website's "whole studio" and gallery pictures of what TribeCode makes: site/assets/showcase/*.webp
  readme     the README screenshots and the website's social card: docs/screenshots/readme-*.png, site/assets/og-image.png
  toolbox    real, credited screenshots of other makers' tools (templates/studio-shots.json), only where their terms allow

Deterministic: fixed time zone (UTC) and locale (en-US), throwaway seeded tribes, no downloads. After a run, every
regenerated picture is compared with the committed one and put back when under --threshold percent of its pixels
moved (a clock, a caret, anti-aliasing), so `git status` shows only thumbnails that really changed.
"""
import json, os, re, subprocess, sys
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
opt = lambda name, default=None: args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default
THRESH = float(opt("--threshold", "0.3"))
PY = sys.executable
IMG = (".png", ".jpg", ".webp")


def ids_in(folder, suffix=None):
    d = ROOT / folder
    return sorted(p.stem if suffix else p.name for p in d.iterdir() if (p.suffix == suffix if suffix else p.is_dir()) and not p.name.startswith(("_", "."))) if d.is_dir() else []

def design_data():
    """The Design flow's template ids, read from the app's own data file (app/ui/designflow-data.js)."""
    js = "global.window={};require('./app/ui/designflow-data.js');const D=window.TribeDesignData,o={};for(const k of ['SCREENS','SLIDES','POSTERS','LOGOS','BOARDS','SITES'])o[k]=(Array.isArray(D[k])?D[k].map(x=>x.id||x):Object.keys(D[k]));console.log(JSON.stringify(o))"
    return json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

def text(path):
    p = ROOT / path
    return p.read_text(encoding="utf8") if p.is_file() else ""


# ---- each group: the thumbnails it owns as {path: source item}, and whether that item still exists ----------------
def g_sites():
    out = {}
    for tid in ids_in("templates/sites"):
        for p in (f"templates/sites/{tid}/thumb.png", f"site/assets/sites/{tid}.jpg", f"app/ui/demo/sites/{tid}.jpg"): out[p] = tid
    for folder in ("site/assets/sites", "app/ui/demo/sites"):
        for tid in ids_in(folder, ".jpg"): out.setdefault(f"{folder}/{tid}.jpg", tid)
    return out, lambda tid: (ROOT / "templates" / "sites" / tid / "index.html").is_file() or (ROOT / "templates" / "sites" / tid).is_dir()

def g_gallery():
    cat = {t["id"] for t in json.loads(text("app/ui/sitetpl/catalog.json") or '{"templates":[]}')["templates"]}
    out = {f"app/ui/sitetpl/thumbs/{i}.webp": i for i in sorted(cat | set(ids_in("app/ui/sitetpl/thumbs", ".webp")))}
    return out, lambda i: i in cat and (ROOT / "app" / "ui" / "sitetpl" / f"{i}.json").is_file()

def g_design():
    D = design_data()
    kinds = {"screen": D["SCREENS"], "slides": D["SLIDES"], "poster": D["POSTERS"], "logo": D["LOGOS"], "board": D["BOARDS"], "site": D["SITES"]}
    starters = set(ids_in("app/ui/starters")) - {"thumbs"}
    out = {f"app/ui/starters/thumbs/{i}.webp": "starter:" + i for i in sorted(starters | set(ids_in("app/ui/starters/thumbs", ".webp")))}
    for k, lst in kinds.items():
        for i in lst: out[f"app/ui/assets/designflow/{k}-{i}.webp"] = f"{k}:{i}"
    for stem in ids_in("app/ui/assets/designflow", ".webp"):
        k, _, i = stem.partition("-"); out.setdefault(f"app/ui/assets/designflow/{stem}.webp", f"{k}:{i}")
    def alive(item):
        k, _, i = item.partition(":")
        return i in starters if k == "starter" else i in kinds.get(k, [])
    return out, alive

def g_starters():
    src = text("scripts/starter-shots.py")
    slugs = set(re.findall(r'"([a-z0-9-]+)": \("', src))
    out = {f"site/assets/starters/{s}.jpg": s for s in sorted(slugs | set(ids_in("site/assets/starters", ".jpg")))}
    def alive(s):
        m = re.search(r'"%s": \("([^"]+)"' % re.escape(s), src)
        if not m: return False
        page = m.group(1)   # p/<file> = scripts/starter-shots/<file>, game/ = templates/starter-game, site/ = templates/starter-site
        real = {"p": "scripts/starter-shots", "game": "templates/starter-game", "site": "templates/starter-site"}[page.split("/")[0]] + "/" + page.split("/", 1)[1]
        return (ROOT / real).is_file()
    return out, alive

def g_showcase():
    src = text("scripts/dev/showcase-thumbs.py")
    out = {f"site/assets/showcase/{n}.webp": n for n in ids_in("site/assets/showcase", ".webp")}
    def alive(n):
        kind, _, i = n.partition("-")
        if kind == "site" and (ROOT / "templates" / "sites" / i).is_dir(): return True
        if n == "game-lantern": return (ROOT / "templates" / "lantern-run").is_dir()
        return f'"{n}"' in src or f"'{n}'" in src   # the generator still makes it (apps, docs, phones, Flint's run)
    return out, alive

def g_readme():
    src = text("scripts/readme-shots.py")
    out = {f"docs/screenshots/{n}.png": n[len("readme-"):] for n in ids_in("docs/screenshots", ".png") if n.startswith("readme-")}
    out["site/assets/og-image.png"] = "og"
    return out, lambda n: n == "og" or f'"{n}"' in src or f"'{n}'" in src or f'"readme-{n}"' in src

def g_toolbox():
    rec = json.loads(text("templates/studio-shots.json") or '{"shots":{}}')["shots"]
    studios = {s["id"] for s in json.loads(text("templates/studios.json"))["studios"]}
    out = {}
    for sid, r in rec.items():
        for w in (640, r["w"]):
            for e in ("webp", "jpg"): out[f"site/assets/toolbox/{r['file']}-{w}.{e}"] = sid
        for e in ("webp", "jpg"): out[f"app/ui/assets/studios/{r['file']}-640.{e}"] = sid
    for folder in ("site/assets/toolbox", "app/ui/assets/studios"):
        for p in sorted((ROOT / folder).glob("*")) if (ROOT / folder).is_dir() else []:
            if p.suffix in IMG: out.setdefault(f"{folder}/{p.name}", p.stem.rsplit("-", 1)[0])
    return out, lambda sid: sid in rec and sid in studios

GROUPS = {
    "sites":    (g_sites,    "website templates (templates/sites)", [["node", "scripts/dev/site-thumbs.js"], [PY, "scripts/dev/demo-thumbs.py"]]),
    "gallery":  (g_gallery,  "the website designer's gallery (app/ui/sitetpl/catalog.json)", [[PY, "scripts/dev/site-gallery.py"]]),
    "design":   (g_design,   "Design flow starters and templates (app/ui/starters, app/ui/designflow-data.js)", [[PY, "scripts/dev/design-thumbs.py"]]),
    "starters": (g_starters, "the website's starter cards (scripts/starter-shots.py)", [[PY, "scripts/starter-shots.py"]]),
    "showcase": (g_showcase, "what TribeCode makes, for the website (scripts/dev/showcase-thumbs.py)", [[PY, "scripts/dev/showcase-thumbs.py"]]),
    "readme":   (g_readme,   "README screenshots and the social card (scripts/readme-shots.py)", [[PY, "scripts/readme-shots.py"]]),
    "toolbox":  (g_toolbox,  "credited screenshots of other makers' tools (templates/studio-shots.json)", [[PY, "-I", "scripts/dev/toolbox-shots.py"], ["node", "scripts/dev/site-toolbox.js"]]),
}
# files a generator rewrites on the way that are not thumbnails: put back after the run
BYPRODUCTS = {"starters": ["site/play"]}
ONLY = opt("--only").split(",") if opt("--only") else list(GROUPS)
for g in ONLY:
    if g not in GROUPS: sys.exit(f"live-thumbs: no group '{g}' (groups: {', '.join(GROUPS)})")


def site_refs():
    """Pictures the website's pages and scripts point at under assets/ (thumbnail folders only)."""
    refs = {}
    for p in sorted((ROOT / "site").glob("*.html")) + sorted((ROOT / "site").glob("*.js")):
        for m in re.finditer(r"assets/(?:showcase|sites|starters|toolbox|remix)/[A-Za-z0-9_.-]+\.(?:png|jpg|webp)", p.read_text(encoding="utf8")):
            refs.setdefault("site/" + m.group(0), p.name)
    return refs

def check():
    bad, total = [], 0
    for g in GROUPS:
        thumbs, alive = GROUPS[g][0]()
        total += len(thumbs)
        for path, item in sorted(thumbs.items()):
            there = (ROOT / path).is_file()
            if there and not alive(item): bad.append(f"[{g}] {path} pictures '{item}', which no longer exists: delete the thumbnail or bring the item back")
            elif not there and alive(item): bad.append(f"[{g}] '{item}' has no thumbnail at {path}: run python3 scripts/dev/live-thumbs.py --only {g}")
            elif there and (ROOT / path).stat().st_size == 0: bad.append(f"[{g}] {path} is empty")
    for path, page in sorted(site_refs().items()):
        if not (ROOT / path).is_file(): bad.append(f"[website] site/{page} points at {path}, which is not there")
    for b in bad: print("live-thumbs: " + b, file=sys.stderr)
    if bad: sys.exit(1)
    print(f"live thumbnails: {total} thumbnails in {len(GROUPS)} groups, each with its source item; every picture the website points at exists")

def listing():
    for g in GROUPS:
        thumbs, _ = GROUPS[g][0]()
        print(f"{g:9} {len(thumbs):4}  {GROUPS[g][1]}\n{'':15}" + "  &&  ".join(" ".join(c).replace(PY, "python3") for c in GROUPS[g][2]))


# ---- regenerate ------------------------------------------------------------------------------------------------
def git(*a, raw=False):
    r = subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=not raw)
    return r.stdout

def diff_pct(path):
    from PIL import Image, ImageChops
    old = git("show", f"HEAD:{path}", raw=True)
    if not old: return 100.0
    try: a, b = Image.open(BytesIO(old)).convert("RGB"), Image.open(ROOT / path).convert("RGB")
    except Exception: return 100.0
    if a.size != b.size: return 100.0
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 16 else 0)
    return 100.0 * d.histogram()[255] / (a.size[0] * a.size[1])

def run():
    env = {**os.environ, "TZ": "UTC", "LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1",
           "TRIBE_PORT_OFFSET": os.environ.get("TRIBE_PORT_OFFSET", "6900"), "NO_PROXY": "127.0.0.1,localhost"}
    ok, owned = True, set()
    for g in ONLY:
        print(f"\n== {g}: {GROUPS[g][1]}", flush=True)
        for cmd in GROUPS[g][2]:
            print("  $ " + " ".join(cmd).replace(PY, "python3"), flush=True)
            if subprocess.run(cmd, cwd=ROOT, env=env).returncode: ok = False; print("  (failed)")
        for by in BYPRODUCTS.get(g, []): git("checkout", "--", by)
        owned |= set(GROUPS[g][0]()[0])
    changed, restored, new = [], [], []
    for line in git("status", "--porcelain", "-uall").splitlines():
        st, path = line[:2], line[3:].strip('"')
        if not path.endswith(IMG): continue
        if st.strip() == "??": new.append(path); continue
        pct = diff_pct(path)
        if pct < THRESH: git("checkout", "--", path); restored.append(path)
        else: changed.append((path, pct, path in owned))
    print(f"\nlive-thumbs: {len(changed)} changed, {len(new)} new, {len(restored)} unchanged (put back: under {THRESH}% of pixels moved)")
    for p, pct, mine in sorted(changed, key=lambda x: -x[1]): print(f"  {pct:5.1f}%  {p}" + ("" if mine else "   (not a thumbnail of these groups: a by-product, put it back unless you meant it)"))
    for p in new: print(f"   new    {p}")
    sys.exit(0 if ok else 1)


# ---- contact sheet ---------------------------------------------------------------------------------------------
def sheet(out, ref):
    from PIL import Image, ImageDraw
    TW, TH, PAD, LAB = 200, 125, 10, 14
    cells = []   # (group, label, before image or None, after image or None)
    def fit(im):
        im = im.convert("RGB"); im.thumbnail((TW, TH), Image.LANCZOS)
        c = Image.new("RGB", (TW, TH), "#12151A"); c.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2)); return c
    def load_now(path):
        try: return fit(Image.open(ROOT / path))
        except Exception: return None
    def load_ref(path):
        if not ref: return None
        data = git("show", f"{ref}:{path}", raw=True)
        try: return fit(Image.open(BytesIO(data))) if data else None
        except Exception: return None
    for g in ONLY:
        thumbs, _ = GROUPS[g][0]()
        seen = set()
        for path in sorted(thumbs):
            if g == "sites" and not path.startswith("templates/"): continue   # the small copies are the same picture
            if g == "toolbox" and not path.startswith("site/") or g == "toolbox" and "-640." not in path or g == "toolbox" and path.endswith(".jpg"): continue
            key = (g, thumbs[path], Path(path).parent.as_posix())
            if key in seen: continue
            seen.add(key); cells.append((g, Path(path).stem, load_ref(path), load_now(path)))
    cw = (TW * 2 + 6) if ref else TW
    cols = max(1, 1500 // (cw + PAD))
    rows, y, layout, last = 0, PAD, [], None
    x = 0
    for c in cells:
        if c[0] != last:
            if last is not None: y += TH + LAB + PAD
            layout.append(("head", c[0], y)); y += 26; x = 0; last = c[0]
        elif x == cols: x = 0; y += TH + LAB + PAD
        layout.append(("cell", c, (PAD + x * (cw + PAD), y))); x += 1
    H = y + TH + LAB + PAD
    im = Image.new("RGB", (PAD + cols * (cw + PAD), H), "#1B2028"); d = ImageDraw.Draw(im)
    blank = Image.new("RGB", (TW, TH), "#2A313C")
    for kind, a, b in layout:
        if kind == "head":
            d.text((PAD, b + 6), f"{a.upper()}  ·  {GROUPS[a][1]}" + ("   (left: before, " + ref + "  |  right: now)" if ref else ""), fill="#F26B1D"); continue
        g, label, before, now = a; px, py = b
        if ref:
            im.paste(before or blank, (px, py)); im.paste(now or blank, (px + TW + 6, py))
            if before is None: d.text((px + 8, py + TH // 2 - 6), "none (a drawn card)" if g == "toolbox" else "not there before", fill="#9AA4B2")
        else: im.paste(now or blank, (px, py))
        d.text((px, py + TH + 1), label[:44], fill="#C9D1DC")
    Path(out).parent.mkdir(parents=True, exist_ok=True); im.save(out, optimize=True)
    print(f"contact sheet: {out}  ({len(cells)} thumbnails" + (f", before = {ref}" if ref else "") + ")")


if "--check" in args: check()
elif "--list" in args: listing()
elif "--sheet" in args: sheet(opt("--sheet"), opt("--ref"))
else: run()
