#!/usr/bin/env python3
"""Validates app/src-tauri/tauri.conf.json without building Rust (that only happens in CI):
 - against Tauri v2's config schema (from app/node_modules/@tauri-apps/cli, else downloaded once from GitHub and
   cached; skipped with a warning when neither is reachable and the jsonschema module is missing)
 - the installer images it names exist, are 24-bit BMPs and have the sizes NSIS / WiX expect
 - the updater's Windows installMode is one the plugin knows
Usage: python3 scripts/check-tauri-config.py
"""
import json, os, struct, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "app" / "src-tauri"
CONF = json.loads((TAURI / "tauri.conf.json").read_text())
SCHEMA_URL = "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-schema-generator/schemas/config.schema.json"
CACHE = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "tribecode" / "tauri-config.schema.json"
problems = []

def schema():
    local = ROOT / "app" / "node_modules" / "@tauri-apps" / "cli" / "config.schema.json"
    if local.is_file(): return json.loads(local.read_text())
    if CACHE.is_file(): return json.loads(CACHE.read_text())
    try:
        with urllib.request.urlopen(SCHEMA_URL, timeout=20) as r: data = r.read()
        CACHE.parent.mkdir(parents=True, exist_ok=True); CACHE.write_bytes(data)
        return json.loads(data)
    except Exception as e:
        print(f"warning: no Tauri schema available ({e}); checking the rest only")
        return None

s = schema()
if s is not None:
    try:
        import jsonschema
        v = jsonschema.validators.validator_for(s)(s)
        for err in sorted(v.iter_errors(CONF), key=lambda e: list(e.path)):
            problems.append("schema: " + "/".join(map(str, err.path)) + ": " + err.message[:300])
        print(f"schema: checked against {s.get('$id', 'Tauri v2 config schema')}")
    except ImportError:
        print("warning: pip install jsonschema to check the schema")

def bmp(path, size):
    p = TAURI / path
    if not p.is_file(): return problems.append(f"missing {p}")
    head = p.read_bytes()[:30]
    if head[:2] != b"BM": return problems.append(f"{path}: not a BMP")
    w, h = struct.unpack("<ii", head[18:26]); bpp = struct.unpack("<H", head[28:30])[0]
    if (w, abs(h)) != size: problems.append(f"{path}: {w}x{abs(h)}, expected {size[0]}x{size[1]}")
    if bpp != 24: problems.append(f"{path}: {bpp}-bit, expected 24-bit")

win = CONF.get("bundle", {}).get("windows", {})
nsis, wix = win.get("nsis", {}), win.get("wix", {})
if nsis.get("headerImage"): bmp(nsis["headerImage"], (150, 57))
if nsis.get("sidebarImage"): bmp(nsis["sidebarImage"], (164, 314))
if wix.get("bannerPath"): bmp(wix["bannerPath"], (493, 58))
if wix.get("dialogImagePath"): bmp(wix["dialogImagePath"], (493, 312))
for k in ("installerIcon", "uninstallerIcon"):
    if nsis.get(k) and not (TAURI / nsis[k]).is_file(): problems.append(f"missing {nsis[k]}")
mode = CONF.get("plugins", {}).get("updater", {}).get("windows", {}).get("installMode")
if mode not in (None, "basicUi", "quiet", "passive"): problems.append(f"updater windows.installMode {mode!r} is not basicUi | quiet | passive")

if problems:
    print("\n".join("FAIL " + p for p in problems)); sys.exit(1)
print("tauri.conf.json OK")
