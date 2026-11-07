#!/usr/bin/env python3
"""npm run dev:shots — regenerate the README/docs screenshots, keeping only real changes.

  python3 scripts/dev/shots.py                 README shots (scripts/readme-shots.py) + docs shots (npm run screenshots)
  python3 scripts/dev/shots.py --readme-only   just the README / website shots
  python3 scripts/dev/shots.py --docs-only     just the docs shots (ui_smoke --shots, e2e_tribe --shots)
  python3 scripts/dev/shots.py --threshold 0.5 percent of pixels that must differ to count as a change (default 0.3)

Deterministic: every run uses a fixed time zone (UTC), locale (en-US) and a throwaway seeded tribe, and afterwards
every regenerated PNG is compared with the committed one: a file whose pixels barely moved (clock text, a blinking
caret, anti-aliasing) is restored from git, so `git status` only shows screens that really changed.
"""
import os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
THRESH = float(args[args.index("--threshold") + 1]) if "--threshold" in args else 0.3
env = {**os.environ, "TZ": "UTC", "LANG": "en_US.UTF-8", "LC_ALL": "en_US.UTF-8", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1",
       "TRIBE_PORT_OFFSET": os.environ.get("TRIBE_PORT_OFFSET", "6900"), "NO_PROXY": "127.0.0.1,localhost"}
WATCH = ["docs/screenshots", "site/assets/shots"]

def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout

def run(cmd):
    print("  $ " + " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=ROOT, env=env)
    if r.returncode: print(f"  (exit {r.returncode})")
    return r.returncode == 0

def diff_pct(path):
    """Percent of pixels that differ from the committed version (100 when there is none)."""
    from io import BytesIO
    from PIL import Image, ImageChops
    old = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=ROOT, capture_output=True).stdout
    if not old: return 100.0
    try:
        a, b = Image.open(BytesIO(old)).convert("RGB"), Image.open(ROOT / path).convert("RGB")
    except Exception:
        return 100.0
    if a.size != b.size: return 100.0
    d = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 16 else 0)
    return 100.0 * d.histogram()[255] / (a.size[0] * a.size[1])

ok = True
if "--docs-only" not in args: ok &= run([sys.executable, "scripts/readme-shots.py"])
if "--readme-only" not in args:
    ok &= run([sys.executable, "app/test/ui_smoke.py", "--shots"])
    ok &= run([sys.executable, "app/test/e2e_tribe.py", "--shots"])

changed, restored, new = [], [], []
for line in git("status", "--porcelain", "--", *WATCH).splitlines():
    st, path = line[:2], line[3:]
    if st.strip() == "??": new.append(path); continue
    if not path.endswith((".png", ".webp")): changed.append((path, 100.0)); continue
    pct = diff_pct(path)
    if pct < THRESH: git("checkout", "--", path); restored.append(path)
    else: changed.append((path, pct))

print(f"\ndev:shots — {len(changed)} changed, {len(new)} new, {len(restored)} unchanged (restored: under {THRESH}% of pixels moved)")
for p, pct in sorted(changed, key=lambda x: -x[1]): print(f"  {pct:5.1f}%  {p}")
for p in new: print(f"   new    {p}")
sys.exit(0 if ok else 1)
