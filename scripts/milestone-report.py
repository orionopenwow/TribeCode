#!/usr/bin/env python3
"""Milestone comparison: the previous release vs this checkout, side by side.

  npm run milestone-report                       previous release = the last commit on origin/main that changed the app version
  python3 scripts/milestone-report.py --ref v0.5.0 [--name 0.5.1] [--full]

For each side it runs the Explorer (scripts/explore.py, this checkout's copy, so both sides are driven the same way)
against that version's server + UI on a fresh seeded tribe, saving the same screens (desktop and phone destinations
plus the end state of every intuitive journey). Then it writes docs/milestones/<name>.md:
  - a before | after table per screen with a pixel-diff percentage (big changes flagged),
  - the findings delta (fixed / new / still open),
  - journeys: pass/fail and clicks-to-goal, before vs after,
  - test counts (suites in npm test, test files).
Images go to docs/milestones/img/<name>/ as WebP, sized so the whole report stays under 3 MB.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--ref", default=None, help="git ref for 'before' (default: latest release commit on origin/main)")
ap.add_argument("--name", default=None, help="report name (default: this version, or today's date)")
ap.add_argument("--full", action="store_true", help="full explorer runs (click everything); default is --quick")
ap.add_argument("--budget-mb", type=float, default=2.8)
A = ap.parse_args()


def sh(*a, cwd=ROOT, check=True):
    return subprocess.run(list(a), cwd=cwd, check=check, capture_output=True, text=True).stdout.strip()


def release_ref():
    try: sh("git", "fetch", "-q", "origin", "main", check=False)
    except Exception: pass
    for base in ("origin/main", "main"):
        try:
            r = sh("git", "log", base, "-1", "--format=%H", "--", "app/src-tauri/tauri.conf.json")
            if r: return r
        except subprocess.CalledProcessError: pass
    return "HEAD~1"


def version_at(tree):
    try: return json.loads((Path(tree) / "package.json").read_text())["version"]
    except Exception: return "?"


def suites(tree):
    try:
        test = json.loads((Path(tree) / "package.json").read_text())["scripts"]["test"]
        return len(re.findall(r"app/test/\S+\.(?:py|js)", test)), len(list((Path(tree) / "app" / "test").glob("*_test.*"))) + len(list((Path(tree) / "app" / "test").glob("e2e_*.py")))
    except Exception: return 0, 0


def explore(app_root, shots, out_json, offset):
    cmd = [sys.executable, str(ROOT / "scripts" / "explore.py"), "--app-root", str(app_root), "--shots-dir", str(shots), "--json", str(out_json), "--report", "none", "--no-shots"]
    if not A.full: cmd.append("--quick")
    env = {**os.environ, "TRIBE_PORT_OFFSET": str(offset), "TRIBE_NO_DOWNLOAD": "1"}
    print(f"  milestone: exploring {app_root} …", flush=True)
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=3600)
    if r.returncode not in (0, 1): print(r.stdout[-2000:], r.stderr[-2000:])
    try: return json.loads(Path(out_json).read_text())
    except Exception: return {"findings": [], "journeys": [], "summary": {}, "version": version_at(app_root)}


def diff_pct(a, b):
    from PIL import Image, ImageChops
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if ia.size != ib.size: ib = ib.resize(ia.size)
    d = ImageChops.difference(ia, ib).convert("L").point(lambda v: 255 if v > 24 else 0)
    return round(100 * sum(d.histogram()[255:]) / (ia.size[0] * ia.size[1]), 1)


def save_small(src, dst, width, quality):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    if im.width > width: im = im.resize((width, round(im.height * width / im.width)))
    im.save(dst, "WEBP", quality=quality, method=6)
    return dst.stat().st_size


def main():
    ref = A.ref or release_ref()
    cur_version = version_at(ROOT)
    name = A.name or (cur_version if cur_version != "?" else time.strftime("%Y-%m-%d"))
    out_md = ROOT / "docs" / "milestones" / f"{name}.md"
    img_dir = ROOT / "docs" / "milestones" / "img" / name
    work = Path(tempfile.mkdtemp(prefix="tribe-milestone-", dir="/tmp"))
    before_tree = work / "before"
    sh("git", "worktree", "add", "-q", "--detach", str(before_tree), ref)
    try:
        before = explore(before_tree, work / "shots-before", work / "before.json", int(os.environ.get("TRIBE_PORT_OFFSET", "0")) + 300)
        after = explore(ROOT, work / "shots-after", work / "after.json", int(os.environ.get("TRIBE_PORT_OFFSET", "0")) + 301)
        sb, sa = suites(before_tree), suites(ROOT)
        bman = json.loads((work / "shots-before" / "manifest.json").read_text()).get("shots", {}) if (work / "shots-before" / "manifest.json").exists() else {}
        aman = json.loads((work / "shots-after" / "manifest.json").read_text()).get("shots", {}) if (work / "shots-after" / "manifest.json").exists() else {}
        names = sorted(set(bman) | set(aman), key=lambda n: (not n.startswith("desktop"), not n.startswith("phone"), n))
        if img_dir.exists(): shutil.rmtree(img_dir)
        img_dir.mkdir(parents=True)
        # size the images so the whole report stays under budget
        width, quality = 720, 68
        while True:
            total, rows = 0, []
            for n in names:
                b = work / "shots-before" / bman[n] if n in bman else None
                a = work / "shots-after" / aman[n] if n in aman else None
                w = width if not n.startswith("phone") else max(240, width // 2)
                bi = img_dir / f"{n}-before.webp" if b else None
                ai = img_dir / f"{n}-after.webp" if a else None
                if b: total += save_small(b, bi, w, quality)
                if a: total += save_small(a, ai, w, quality)
                rows.append((n, bi, ai, diff_pct(b, a) if b and a else None))
            if total < A.budget_mb * 1024 * 1024 or width <= 360: break
            width, quality = int(width * 0.8), max(45, quality - 8)
        # findings delta (ids are stable: kind + selector + label)
        bf = {f["id"]: f for f in before.get("findings", [])}; af = {f["id"]: f for f in after.get("findings", [])}
        fixed = [bf[i] for i in bf if i not in af]; new = [af[i] for i in af if i not in bf]; still = [af[i] for i in af if i in bf]
        sev = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        bj = {j["id"]: j for j in before.get("journeys", [])}; aj = {j["id"]: j for j in after.get("journeys", [])}
        rel = lambda p: os.path.relpath(p, out_md.parent) if p else ""
        L = [f"# Milestone {name}", "",
             f"Before: `{ref[:10]}` (v{before.get('version', version_at(before_tree))}) · After: this checkout (v{after.get('version', cur_version)}) · generated {time.strftime('%Y-%m-%d %H:%M')} by `npm run milestone-report`.", "",
             "## At a glance", "",
             "| | Before | After |", "|---|---|---|",
             f"| Findings (critical / high / medium / low) | {' / '.join(str(before.get('summary', {}).get(s, 0)) for s in sev)} | {' / '.join(str(after.get('summary', {}).get(s, 0)) for s in sev)} |",
             f"| Journeys passing | {sum(1 for j in bj.values() if j['pass'])} / {len(bj)} | {sum(1 for j in aj.values() if j['pass'])} / {len(aj)} |",
             f"| Test suites in `npm test` / test files | {sb[0]} / {sb[1]} | {sa[0]} / {sa[1]} |",
             f"| Findings fixed / new / still open | | {len(fixed)} / {len(new)} / {len(still)} |", "",
             "## Journeys (clicks to goal)", "", "| Journey | Before | After | Change |", "|---|---|---|---|"]
        for jid in sorted(set(bj) | set(aj), key=lambda k: (aj.get(k, bj.get(k))["kind"], k)):
            b, a = bj.get(jid), aj.get(jid)
            cell = lambda j: "—" if not j else (f"{'pass' if j['pass'] else '**fail**'} · {j['clicks']} clicks · {j['ms'] / 1000:.1f} s" + (f" · {sum(c['ok'] for c in j['checks'])}/{len(j['checks'])} checks" if j.get("checks") else ""))
            ch = "" if not (a and b) else ("fixed" if a["pass"] and not b["pass"] else "broke" if b["pass"] and not a["pass"] else (f"{a['clicks'] - b['clicks']:+d} clicks" if a["clicks"] != b["clicks"] else "same"))
            L.append(f"| {(a or b)['title']} | {cell(b)} | {cell(a)} | {ch} |")
        L += ["", "## Screens", "", "Pixel difference over 25% is flagged ⚑ (layout or content changed a lot).", ""]
        for n, bi, ai, d in rows:
            flag = " ⚑" if d is not None and d > 25 else ""
            L += [f"### {n}{flag}", "", f"Pixel difference: {d}%" if d is not None else ("new screen" if not bi else "gone in this version"), "",
                  "| Before | After |", "|---|---|", f"| {'![](' + rel(bi) + ')' if bi else '—'} | {'![](' + rel(ai) + ')' if ai else '—'} |", ""]
        def fl(lst):
            return [f"- {f['severity']}: **{f['title']}**{' · `' + f['selector'] + '`' if f.get('selector') else ''}{' · ' + f['label'] if f.get('label') else ''} ({', '.join(f.get('contexts', []))})" for f in sorted(lst, key=lambda f: sev.get(f["severity"], 3))[:40]]
        L += ["## Findings delta", "", f"### Fixed ({len(fixed)})", ""] + (fl(fixed) or ["- none"]) + ["", f"### New ({len(new)})", ""] + (fl(new) or ["- none"]) + ["", f"### Still open ({len(still)})", ""] + (fl(still) or ["- none"]) + [""]
        out_md.write_text("\n".join(L))
        size = sum(p.stat().st_size for p in img_dir.glob("*")) + out_md.stat().st_size
        print(f"  milestone: wrote {out_md.relative_to(ROOT)} ({size / 1024 / 1024:.2f} MB with images)")
    finally:
        sh("git", "worktree", "remove", "--force", str(before_tree), check=False)
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
