"""A fixed clock and seeded randomness for every screenshot and thumbnail run, so two runs give the same pictures.

Import it first in a generator. Importing sets the environment for everything the generator starts:
  TRIBE_FIXED_NOW    the pretend "now" when the run starts, in ms (default 2026-06-15 15:00 UTC, a Monday afternoon)
  TRIBE_FIXED_REAL0  the real time the run started, in ms (so servers, restarted servers and pages share one timeline)
  NODE_OPTIONS       --require scripts/dev/fixed-clock.js, so the tribe server's clock is the pretend one too
  GIT_AUTHOR_DATE / GIT_COMMITTER_DATE   commits made during the run carry the pretend time
  TZ, LANG, LC_ALL   UTC and en_US
scripts/dev/live-thumbs.py sets the same values once, so all its generators share them.

  fixedclock.apply(context_or_page)   pages get the same clock and a seeded Math.random (before any page script runs)
  fixedclock.freeze(page)             for games: time stands still from the first script on; step it with
  fixedclock.step(page, ms)           ... which runs timers and animation frames for exactly ms, so the frame captured
                                      is the same frame every run (Playwright's clock)
"""
import os, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHIM = HERE / "fixed-clock.js"
DEFAULT_NOW = 1781535600000   # 2026-06-15T15:00:00Z
SEED = 20260615

NOW = int(os.environ.setdefault("TRIBE_FIXED_NOW", str(DEFAULT_NOW)))
REAL0 = int(os.environ.setdefault("TRIBE_FIXED_REAL0", str(int(time.time() * 1000))))
_req = f"--require={SHIM}"
if _req not in os.environ.get("NODE_OPTIONS", ""):
    os.environ["NODE_OPTIONS"] = (os.environ.get("NODE_OPTIONS", "") + " " + _req).strip()
_iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(NOW / 1000))
os.environ.setdefault("GIT_AUTHOR_DATE", _iso); os.environ.setdefault("GIT_COMMITTER_DATE", _iso)
os.environ["TZ"] = "UTC"; os.environ.setdefault("LANG", "en_US.UTF-8"); os.environ.setdefault("LC_ALL", "en_US.UTF-8")
try: time.tzset()
except AttributeError: pass


def script(seed=SEED):
    return f"window.__TRIBE_FIXED = {{ now: {NOW}, real0: {REAL0}, seed: {int(seed)} }};\n" + SHIM.read_text(encoding="utf8")

def apply(target, seed=SEED):
    """A browser context or a page: the pretend clock (ticking) and seeded Math.random in every document it loads."""
    target.add_init_script(script(seed))
    return target

def freeze(page, seed=SEED):
    """Games and anything animated: seeded randomness, and time that only moves when step() moves it."""
    page.add_init_script(f"window.__TRIBE_FIXED = {{ now: NaN, real0: 0, seed: {int(seed)} }};\n" + SEED_ONLY)
    page.clock.install(time=NOW / 1000)
    page.clock.pause_at(NOW / 1000 + 1)
    return page

def step(page, ms):
    page.clock.run_for(int(ms))

# Math.random only (freeze() leaves Date to Playwright's clock)
SEED_ONLY = """(() => { let s = (window.__TRIBE_FIXED.seed >>> 0) || 1;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();"""
