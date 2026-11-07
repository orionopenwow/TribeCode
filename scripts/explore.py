#!/usr/bin/env python3
"""TribeCode Explorer: clicks around the real app like a curious user, then writes what it found.

  npm run explore                  full run: crawl + click everything + journeys -> docs/EXPLORE-REPORT.md, .explore/findings.json
  python3 scripts/explore.py --quick   (in npm test) destinations + audits + journeys; fails only on critical findings
  python3 scripts/explore.py --app-root <checkout> --shots-dir <dir> --json <file>
                                   drive another checkout of TribeCode (scripts/milestone-report.py: before | after)

It starts a real server on a throwaway tribe folder, seeds a realistic tribe (host Orion + friend Maya + their
Claude agents over MCP, two projects, chat, tasks, votes, proposals, docs, gists, a bug), then drives the app in
four contexts: desktop 1440x900, phone 390x844, the desktop app (a fake window.__TAURI__) and not connected.

Detects: page errors, console errors, unhandled rejections, failed requests, dead buttons (no DOM change, no
request, no navigation), slow interactions (>1 s), horizontal overflow, cut labels, covered buttons, invisible
focus traps, low contrast, icon buttons with no name, duplicated nav labels, empty dead ends, layout shifts,
blank views. Then runs goal-based journeys (intuitive tests) and the core-intent journeys (collaboration with
agents, the Claude Code connector, repo autopilot, chat fidelity, notifications) and scores each one.
Docs: docs/EXPLORER.md
"""
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, tempfile, threading, time, traceback
import urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
AUDIT_JS = (ROOT / "scripts" / "explore_audit.js").read_text()
CHROME = "/usr/bin/google-chrome"
SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

ap = argparse.ArgumentParser()
ap.add_argument("--quick", action="store_true", help="destinations + audits + journeys, no click-everything crawl")
ap.add_argument("--app-root", default=str(ROOT), help="TribeCode checkout to drive (server/ + app/ui/)")
ap.add_argument("--port", type=int, default=4871 + OFF)
ap.add_argument("--json", default=None, help="where to write findings (default .explore/findings.json, quick: .explore/findings-quick.json)")
ap.add_argument("--report", default=None, help="markdown report (default docs/EXPLORE-REPORT.md on full runs, none on quick runs)")
ap.add_argument("--shots-dir", default=None, help="save a fixed set of screens here (milestone comparison)")
ap.add_argument("--no-shots", action="store_true", help="no finding screenshots")
ap.add_argument("--only", default="", help="comma list of phases: seed,desktop,crawl,phone,tauri,offline,journeys,core")
ap.add_argument("--keep", action="store_true", help="keep the temp tribe folder")
ARGS = ap.parse_args() if __name__ == "__main__" else ap.parse_args([])

APP = Path(ARGS.app_root).resolve()
PORT = ARGS.port
BASE = f"http://localhost:{PORT}"
OLLAMA = 11631 + OFF
OUT_JSON = Path(ARGS.json) if ARGS.json else ROOT / ".explore" / ("findings-quick.json" if ARGS.quick else "findings.json")
OUT_MD = None if ARGS.report == "none" else Path(ARGS.report) if ARGS.report else (None if ARGS.quick or ARGS.app_root != str(ROOT) else ROOT / "docs" / "EXPLORE-REPORT.md")
SHOT_DIR = ROOT / "docs" / "screenshots" / "explore"
PHASES = set(filter(None, ARGS.only.split(","))) or {"seed", "desktop", "crawl", "phone", "tauri", "offline", "journeys", "core"}
if ARGS.quick: PHASES.discard("crawl")


def log(*a): print("  explore:", *a, flush=True)


# ---------------------------------------------------------------- HTTP helpers
def api(path, method="GET", body=None, token=None, project=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            try: return r.status, json.loads(raw or b"{}")
            except ValueError: return r.status, {"raw": raw[:200].decode("utf8", "replace")}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b"{}")
        except ValueError: return e.code, {"raw": raw[:200].decode("utf8", "replace")}
    except Exception as e:
        return 0, {"error": str(e)}


def mcp_url(url, token, tool, args=None, method="tools/call"):
    params = {"name": tool, "arguments": args or {}} if method == "tools/call" else {}
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    req = urllib.request.Request(url, method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: d = json.loads(r.read())
    except Exception as e:
        return True, f"transport error: {e}"
    if "error" in d: return True, json.dumps(d["error"])
    res = d.get("result", {})
    if method != "tools/call": return False, res
    return res.get("isError", False), (res.get("content") or [{"text": ""}])[0].get("text", "")


def mcp(token, tool, args=None, method="tools/call"): return mcp_url(BASE + "/mcp", token, tool, args, method)


def ok(r, what=""):
    st, d = r
    if st != 200: raise RuntimeError(f"{what}: {st} {d}")
    return d


def sh(*a, cwd=None):
    return subprocess.run(list(a), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def wait_until(fn, timeout=10, step=0.2):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(step)
    return None


# ---------------------------------------------------------------- mocks: GitHub REST + ntfy
GH = {"root": None, "calls": []}
NTFY = {"posts": []}


class GitHubMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/user": return self.reply(200, {"login": "orion", "name": "Orion", "email": "orion@example.com", "id": 1})
        if self.path.startswith("/user/emails"): return self.reply(200, [{"email": "orion@example.com", "primary": True, "verified": True}])
        self.reply(404, {"message": "Not Found"})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        GH["calls"].append({"path": self.path, "body": body})
        if self.path != "/user/repos": return self.reply(404, {"message": "Not Found"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "orion/" + body["name"], "private": body.get("private", False), "clone_url": bare, "html_url": "https://github.com/orion/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


class NtfyMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode("utf8", "replace")
        NTFY["posts"].append({"path": self.path, "title": self.headers.get("Title", ""), "body": body})
        self.send_response(200); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}")


def serve(handler):
    s = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


# ---------------------------------------------------------------- findings
class Findings:
    def __init__(self):
        self.items = {}
        self.journeys = []
        self.stats = {"clicks": 0, "dead": 0, "destinations": 0, "contexts": [], "skipped_destructive": 0, "inputs": 0}

    def add(self, kind, severity, title, *, context, view, steps=None, detail="", selector="", label="", extra=None):
        fp = hashlib.sha1(f"{kind}|{selector}|{label}|{title if kind in ('pageerror', 'console', 'request', 'journey') else ''}".encode()).hexdigest()[:10]
        f = self.items.get(fp)
        if not f:
            f = self.items[fp] = {"id": fp, "kind": kind, "severity": severity, "title": title, "detail": detail, "selector": selector, "label": label,
                                  "contexts": [], "views": [], "steps": steps or [], "count": 0, "screenshot": None, **(extra or {})}
        f["count"] += 1
        if SEV_ORDER[severity] < SEV_ORDER[f["severity"]]: f["severity"] = severity
        if context not in f["contexts"]: f["contexts"].append(context)
        if view and view not in f["views"]: f["views"].append(view)
        return f

    def ranked(self):
        return sorted(self.items.values(), key=lambda f: (SEV_ORDER[f["severity"]], -len(f["contexts"]), -f["count"], f["kind"]))


F = Findings()

AUDIT_SEV = {"h-overflow": "medium", "clipped-text": "medium", "obscured": "medium", "focus-trap": "medium", "contrast": "low", "no-label": "medium",
             "dup-label": "low", "empty-dead-end": "low", "blank-view": "high"}
AUDIT_TITLE = {"h-overflow": "Page scrolls sideways", "clipped-text": "Label is cut off", "obscured": "Button is covered by another element",
               "focus-trap": "Invisible controls take keyboard focus", "contrast": "Text contrast too low", "no-label": "Icon button has no accessible name",
               "dup-label": "Same label twice in one navigation", "empty-dead-end": "Empty state with no next action", "blank-view": "View renders nothing"}


def record_audit(res, context, view, steps):
    for i in res["issues"]:
        k = i["kind"]; sev = AUDIT_SEV[k]
        if k == "h-overflow" and context.startswith("phone"): sev = "high"
        if k == "contrast": sev = "medium" if i.get("ratio", 5) < 3 else "low"
        sel = i.get("selector", "")
        if k == "contrast": sel = f"{i.get('fg')} on {i.get('bg')}"   # one finding per color pair, not per element
        F.add(k, sev, AUDIT_TITLE[k], context=context, view=view, steps=steps, detail=i.get("detail", ""), selector=sel,
              label=(i.get("label") or "") if k != "contrast" else "", extra={"example": i.get("selector")} if k == "contrast" else None)
    if res.get("cls", 0) > 0.1:
        F.add("layout-shift", "low", "Layout shifts after the view opens", context=context, view=view, steps=steps,
              detail=f"cumulative layout shift {res['cls']} (sources: {', '.join(res.get('clsSrc') or ['?'])})", selector=view)


# ---------------------------------------------------------------- page instrumentation
TAURI_JS = """
(() => {
  const calls = window.__tauriCalls = [];
  const rec = (n, a) => { calls.push([n, a === undefined ? null : a]); };
  const win = { minimize: async () => rec('window.minimize'), toggleMaximize: async () => rec('window.toggleMaximize'), close: async () => rec('window.close'),
    isMaximized: async () => false, onResized: async () => () => {}, listen: async () => () => {}, setTitle: async () => {}, show: async () => {}, setFocus: async () => {} };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { rec('invoke:' + cmd, args); if (cmd === 'host_start') return location.origin; if (cmd === 'host_log') return []; return null; } },
    window: { getCurrentWindow: () => win },
    app: { getVersion: async () => window.__TAURI_VERSION__ || '0.0.0' },
    deepLink: { getCurrent: async () => null, onOpenUrl: async () => () => {} },
    updater: { check: async () => null },
    path: { homeDir: async () => '/home/explorer/', join: async (...p) => p.join('/') },
    event: { listen: async () => () => {}, emit: async () => {} },
    process: { relaunch: async () => rec('process.relaunch'), exit: async () => rec('process.exit') },
    notification: { isPermissionGranted: async () => true, requestPermission: async () => 'granted', sendNotification: o => rec('notification', o) },
    dialog: { open: async () => null },
    autostart: { enable: async () => rec('autostart.enable'), disable: async () => rec('autostart.disable'), isEnabled: async () => false },
  };
})();
"""


class Watch:
    """Per-page error + network tracking. `mark()` starts a window; `take()` returns what happened since."""
    IGNORE_CONSOLE = ("ERR_", "Failed to load resource", "favicon", "[vite]", "Download the React DevTools")

    def __init__(self, page, context):
        self.page, self.context = page, context
        self.errors, self.reqs, self.bad, self.frames, self.popups, self.dialogs, self.files = [], 0, [], 0, 0, 0, 0
        self.pending = 0
        page.on("pageerror", lambda e: self.errors.append(("pageerror", str(e).split("\n")[0][:300], getattr(e, "stack", "") or "")))
        page.on("console", self._console)
        page.on("request", self._req)
        page.on("requestfinished", lambda r: self._done(r))
        page.on("requestfailed", lambda r: self._failed(r))
        page.on("response", self._resp)
        page.on("websocket", lambda ws: ws.on("framesent", lambda f: self._frame(f)))
        page.on("popup", lambda p: self._popup(p))
        page.on("dialog", lambda d: self._dialog(d))
        page.on("filechooser", lambda fc: self._file())
        page.on("download", lambda d: self._file())

    def _console(self, m):
        if m.type == "error" and not any(x in m.text for x in self.IGNORE_CONSOLE): self.errors.append(("console", m.text[:300], ""))
    def same(self, url): return url.startswith(BASE)
    def _req(self, r):
        if self.same(r.url): self.reqs += 1; self.pending += 1
    def _done(self, r):
        if self.same(r.url): self.pending = max(0, self.pending - 1)
    def _failed(self, r):
        if not self.same(r.url): return
        self.pending = max(0, self.pending - 1)
        err = r.failure or ""
        if "ERR_ABORTED" in err or "net::ERR_CONNECTION_REFUSED" in err and "/preview" in r.url: return
        self.bad.append((0, r.method, r.url, err))
    def _resp(self, r):
        if self.same(r.url) and r.status >= 400: self.bad.append((r.status, r.request.method, r.url, ""))
    def _frame(self, f):
        try:
            if '"type":"ping"' in f or '"type":"activity"' in f: return
        except Exception: pass
        self.frames += 1
    def _popup(self, p):
        self.popups += 1
        try: p.close()
        except Exception: pass
    def _dialog(self, d):
        self.dialogs += 1
        try: d.dismiss()
        except Exception: pass
    def _file(self): self.files += 1

    def mark(self):
        self.m = (len(self.errors), self.reqs, len(self.bad), self.frames, self.popups, self.dialogs, self.files)
    def take(self):
        e, r, b, fr, po, di, fi = self.m
        return {"errors": self.errors[e:], "reqs": self.reqs - r, "bad": self.bad[b:], "frames": self.frames - fr, "popups": self.popups - po, "dialogs": self.dialogs - di, "files": self.files - fi}


EXPECTED_BAD = [
    (401, "/api/"),                 # not connected: probes without a token
    (404, "/api/thumb"),            # no thumbnail yet
    (404, "/api/preview"),          # no app preview running
    (409, "/api/"),                 # "nothing to commit", "voting closed": answers, not failures
    (429, "/api/"),                 # nudged recently
]


def report_window(w, context, view, steps, during="interaction"):
    got = w.take()
    for kind, msg, stack in got["errors"]:
        sev = "critical" if during == "boot" and kind == "pageerror" else "high" if kind == "pageerror" else "medium"
        F.add(kind, sev, ("Script error: " if kind == "pageerror" else "Console error: ") + re.sub(r"\d{3,}", "N", msg)[:140], context=context, view=view, steps=steps, detail=(stack or msg)[:800])
    for st, method, url, err in got["bad"]:
        path = url.replace(BASE, "").split("?")[0]
        if st and any(st == s and path.startswith(p) for s, p in EXPECTED_BAD): continue
        sev = "high" if st >= 500 or st == 0 else "low" if st == 400 else "medium"   # 400 = a validation answer to what the explorer typed
        F.add("request", sev, f"{method} {re.sub(r'/[A-Za-z0-9_-]{10,}', '/:id', path)} → {st or err}", context=context, view=view, steps=steps, detail=f"{method} {path} answered {st or err}")
    return got


# ---------------------------------------------------------------- server
class Server:
    def __init__(self, tmp, env_extra):
        self.tmp, self.env_extra, self.proc = tmp, env_extra, None
    def start(self, version=None):
        logf = open(os.path.join(self.tmp, "server.log"), "a")
        env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_REPO_POLL_MS": "1000", "TRIBE_DASH_THROTTLE_MS": "300", **self.env_extra}
        if version: env["TRIBE_VERSION"] = version
        self.proc = subprocess.Popen(["node", str(APP / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(self.tmp, "tribe"), "--ollama", f"http://localhost:{OLLAMA}", "--name", "Pixel Crew"],
                                     stdout=logf, stderr=subprocess.STDOUT, env=env)
        if not wait_until(lambda: api("/health")[0] == 200, 20, 0.1): raise RuntimeError("server did not start: " + open(os.path.join(self.tmp, "server.log")).read()[-2000:])
    def stop(self):
        if self.proc:
            self.proc.terminate()
            try: self.proc.wait(5)
            except Exception: self.proc.kill()
            self.proc = None


# ---------------------------------------------------------------- seeding a realistic tribe
S = {}   # tokens, ids, projects


def seed(work):
    log("seeding a tribe: Orion (host), Maya, two Claude agents, two projects")
    boot = ok(api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}), "bootstrap")
    S["orion"], S["oid"] = boot["token"], boot["member"]["id"]
    # project 1: a real git repo (Pixel Quest) with an origin, so repo, conflicts and preview have something to show
    repo = os.path.join(work, "pixel-quest"); origin = os.path.join(work, "pixel-quest-origin.git")
    sh("git", "init", "-q", "--bare", "-b", "main", origin)
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src").mkdir(parents=True)
    Path(repo, "index.html").write_text("<!doctype html><title>Pixel Quest</title><canvas id=game></canvas><script type=module src=src/game.js></script>\n")
    Path(repo, "src/game.js").write_text("export const speed = 2\n")
    Path(repo, "src/world.js").write_text("export const tiles = ['grass', 'lava']\n")
    Path(repo, "src/player.js").write_text("export const jump = 4\n")
    Path(repo, "README.md").write_text("# Pixel Quest\nA co-op pixel adventure built by friends and their Claudes.\n")
    g = lambda *a: sh("git", "-C", repo, "-c", "user.email=orion@example.com", "-c", "user.name=Orion", *a)
    g("add", "."); g("commit", "-q", "-m", "First playable: walk, jump, lava"); g("remote", "add", "origin", origin); g("push", "-q", "-u", "origin", "main")
    S["repo"], S["origin"] = repo, origin
    pq = ok(api("/projects", "POST", {"path": repo, "name": "Pixel Quest", "emoji": "🎮"}, token=S["orion"]), "path project")["project"]
    S["pq"] = pq["id"]
    S["sq"] = ok(api("/projects", "POST", {"name": "Side Quest", "emoji": "🗺️"}, token=S["orion"]), "second project")["project"]["id"]
    S["default"] = ok(api("/me", token=S["orion"]))["projects"][0]["id"]
    inv = ok(api("/invites", "POST", {"hours": 2, "maxUses": 3, "role": "builder"}, token=S["orion"]), "invite")["invite"]
    j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya", "color": "#6C7CFF"}), "join")
    S["maya"], S["mid"] = j["token"], j["member"]["id"]
    p = S["pq"]
    # agents (MCP): Orion's Claude and Maya's Claude, both in Pixel Quest
    a1 = ok(api("/agents", "POST", {}, token=S["orion"], project=p)); S["a1"], S["a1id"], S["a1name"] = a1["token"], a1["agent"]["id"], a1["agent"]["name"]
    a2 = ok(api("/agents", "POST", {}, token=S["maya"], project=p)); S["a2"], S["a2id"], S["a2name"] = a2["token"], a2["agent"]["id"], a2["agent"]["name"]
    for t in (S["a1"], S["a2"]): mcp(t, "my_lane", {"tokens_used": 52000, "budget": 200000})
    mcp(S["a1"], "report_context", {"used_pct": 41, "focus": "Wiring the lava tiles"})
    mcp(S["a2"], "report_context", {"used_pct": 18, "focus": "Double jump feel"})
    # chat
    say = lambda tok, text: ok(api("/chat/general/send", "POST", {"text": text}, token=tok, project=p), "chat")["message"]
    m1 = say(S["orion"], "Welcome to Pixel Quest! Lava world first?")
    say(S["maya"], "Yes! I'll take the double jump.")
    ok(api("/chat/general/react", "POST", {"id": m1["id"], "emoji": "🔥"}, token=S["maya"], project=p))
    ok(api("/chat/general/send", "POST", {"text": "Reply: lava tiles are in src/world.js", "replyTo": m1["id"]}, token=S["orion"], project=p))
    mcp(S["a1"], "post_chat", {"text": "I'm wiring the lava tiles in src/world.js."})
    S["vote"] = ok(api("/chat/general/vote", "POST", {"question": "Ship the lava world first?", "options": ["Yes", "Later"]}, token=S["orion"], project=p), "vote")["message"]
    # tasks, proposals, docs, gists, a bug, a calendar item
    for title, status in [("Draw the lava tiles", "doing"), ("Double jump", "backlog"), ("Title screen", "backlog"), ("Save points at campfires", "review")]:
        ok(api("/tasks", "POST", {"title": title, "status": status}, token=S["orion"], project=p), "task")
    ok(api("/proposals", "POST", {"title": "Add a speedrun timer", "body": "A tiny timer in the corner for runs."}, token=S["maya"], project=p), "proposal")
    ok(api("/docs", "POST", {"title": "Level design notes", "body": "# Level design notes\nLava rises every 30 seconds. Campfires save the world."}, token=S["orion"], project=p), "doc")
    ok(api("/docs", "POST", {"title": "Side quest ideas", "body": "Fishing, a ghost ship, a map of the stars."}, token=S["orion"], project=S["sq"]), "doc 2")
    mcp(S["a2"], "post_gist", {"kind": "progress", "title": "Double jump prototype", "bullets": ["Second jump at 70% height", "Coyote time 80ms"], "files": ["src/player.js"]})
    ok(api("/bugs", "POST", {"title": "Player falls through lava edge", "details": "At the left edge of level 2", "repro": "Walk left on level 2"}, token=S["maya"], project=p), "bug")
    log(f"seeded: projects {S['pq']}, {S['sq']}; agents {S['a1name']}, {S['a2name']}")


def settings_js(token, name, color="#F26B1D", project=None):
    pj = f"localStorage.setItem('tribecode.project:{BASE}', {json.dumps(project)});" if project else ""
    return (f"if (window.top === window && !sessionStorage.getItem('ex-seeded')) {{ sessionStorage.setItem('ex-seeded','1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:{json.dumps(name)}, color:{json.dumps(color)}, onboarded:true, theme:'dark', tour:{{done:true}}, server:{{url:'{BASE}', token:{json.dumps(token)}}}}})); {pj} }}")


def new_page(browser, context_name, *, phone=False, token=None, name="Orion", tauri=False, version="0.0.0", project=None):
    vp = {"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}
    ctx = browser.new_context(viewport=vp, device_scale_factor=1, has_touch=phone, is_mobile=phone,
                              user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" if phone else None))
    ctx.add_init_script(AUDIT_JS)
    if tauri: ctx.add_init_script(f"if (window.top === window) {{ window.__TAURI_VERSION__ = {json.dumps(version)};\n" + TAURI_JS + "}")
    if token: ctx.add_init_script(settings_js(token, name, project=project))
    else: ctx.add_init_script("if (window.top === window && !localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Guest', onboarded:true, tour:{done:true}}))")
    page = ctx.new_page()
    w = Watch(page, context_name)
    return ctx, page, w


def settle(page, ms=350):
    page.wait_for_timeout(ms)
    try: page.wait_for_load_state("networkidle", timeout=1500)
    except Exception: pass


def boot(page, w, context, path="/?skipIntro=1", connected=True):
    w.mark(); t0 = time.time()
    page.goto(BASE + path)
    if connected:
        try: page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000)
        except Exception: F.add("boot", "critical", "App never connected to the tribe", context=context, view="boot", steps=[f"open {path}"], detail="TribeClient.connected() stayed false for 12 s")
    else: page.wait_for_function("document.readyState === 'complete'", timeout=12000)
    settle(page, 700)
    ms = int((time.time() - t0) * 1000)
    if ms > 6000: F.add("slow-boot", "medium", "Slow start", context=context, view="boot", steps=[f"open {path}"], detail=f"{ms} ms until connected and idle")
    report_window(w, context, "boot", [f"open {path}"], during="boot")
    return ms


# ---------------------------------------------------------------- destinations
def destinations(page, phone=False):
    """Every place a person can go: the shell's registry (nest rows, tabs, Ctrl K entries) plus overlays."""
    has_shell = page.evaluate("!!(window.TribeShell && TribeShell.dests)")
    out = []
    if has_shell:
        for d in page.evaluate("TribeShell.dests()"):
            if not d["visible"]: continue
            if d["key"] in ("panel", "huddle", "capture", "context"): continue   # toggles, not places (capture is a journey)
            out.append({"name": d["label"], "key": d["key"], "go": f"TribeShell.go({json.dumps(d['key'])})"})
    else:
        for v in page.evaluate("Object.keys({hub:1,home:1,chat:1,docs:1,tasks:1,board:1,bugs:1,repo:1,calendar:1,visuals:1,coord:1})"):
            out.append({"name": v, "key": v, "go": f"TribeApp.show({json.dumps(v)})"})
    extra = [
        ("Profile menu", "pf", "(() => { const b = document.querySelector('#pf-btn'); const m = document.querySelector('#m2-me'); (b && b.offsetParent ? b : m || b).click(); })()"),
        ("Inbox (bell)", "bell", "window.TribeNotify && TribeNotify.openInbox()"),
        ("Command palette", "palette", "window.TribePalette && TribePalette.open()"),
        ("Composer + menu", "plus", "TribeApp.show('chat'); setTimeout(() => window.TribePlus && TribePlus.open(document.querySelector('#composer-mount button, #chat-input')), 120)"),
        ("Workspace switcher", "switcher", "window.TribeShell && TribeShell.switcher && TribeShell.switcher(document.querySelector('#pj-switch') || document.querySelector('#nest-switch'))"),
        ("Agent detail (right panel)", "agent", f"window.TribeShell && TribeShell.previewAgent && TribeShell.previewAgent({json.dumps(S.get('a1id', ''))})"),
        ("Person view", "person", f"window.TribePeople && TribePeople.open({json.dumps(S.get('mid', ''))})"),
        ("App preview", "preview", "window.TribePreview && TribePreview.open()"),
        ("Workshop", "workshop", "window.TribeWorkshop && TribeWorkshop.open()"),
    ]
    for name, key, js in extra: out.append({"name": name, "key": key, "go": js, "overlay": True})
    return out


def go(page, dest):
    try:
        page.evaluate(f"(() => {{ {dest['go']} }})()")
    except Exception as e:
        return str(e).split("\n")[0]
    settle(page, 450)
    return None


CLOSE_ALL = """(() => { const t = (o, f) => { try { if (o && o[f]) o[f](); } catch {} };
  if (window.TribeWorkshop && TribeWorkshop.isOpen && TribeWorkshop.isOpen()) t(TribeWorkshop, 'close');
  if (window.TribeAgentsHub && TribeAgentsHub.isOpen && TribeAgentsHub.isOpen()) t(TribeAgentsHub, 'close');
  if (window.TribeSecretary && TribeSecretary.isOpen && TribeSecretary.isOpen()) t(TribeSecretary, 'close');
  t(window.TribePreview, 'close'); t(window.TribeNotify, 'closeInbox'); t(window.TribePeople, 'close'); t(window.TribePalette, 'close'); t(window.TribeSettings, 'close'); t(window.TribePlus, 'close');
  if (window.TribeShell && TribeShell.closePreview) t(TribeShell, 'closePreview');
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.fwin [data-x]').forEach(b => b.click());   // pop-out windows stay open on purpose; close them between views
  if (window.TribeFloat && TribeFloat.closePop) t(TribeFloat, 'closePop');
})()"""


def reset(page, home_js="window.TribeApp && TribeApp.show('home')"):
    for _ in range(2):
        try: page.keyboard.press("Escape")
        except Exception: pass
    page.wait_for_timeout(120)
    try: page.evaluate(CLOSE_ALL)
    except Exception: pass
    try: page.evaluate(f"(() => {{ {home_js} }})()")
    except Exception: pass


def signature(page):
    try: return page.evaluate("[document.body.dataset.view || '', location.hash, (window.__ex.overlay() || []).join(',')].join('|')")
    except Exception: return ""


def snap(page, f, element_sel=None):
    if ARGS.no_shots or OUT_MD is None or f.get("screenshot"): return
    if sum(1 for x in F.items.values() if x.get("screenshot")) >= 8: return
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    p = SHOT_DIR / f"{f['id']}.jpg"
    try:
        page.screenshot(path=str(p), type="jpeg", quality=55)
        f["screenshot"] = str(p.relative_to(ROOT))
    except Exception: pass


def visit_all(page, w, context, phone=False, crawl=False, shots=None):
    dests = destinations(page, phone)
    log(f"{context}: {len(dests)} destinations{' + clicking everything' if crawl else ''}")
    clicked = set()
    for d in dests:
        reset(page); settle(page, 150)
        w.mark(); page.evaluate("__ex.resetCls()")
        t0 = time.time(); err = go(page, d)
        steps = [f"open the app ({context})", f"go to {d['name']}" + (" (Ctrl K / nest)" if not d.get("overlay") else "")]
        if err:
            F.add("nav", "high", f"Cannot open {d['name']}", context=context, view=d["name"], steps=steps, detail=err); continue
        ms = int((time.time() - t0) * 1000)
        if ms > 1500: F.add("slow", "medium", f"Opening {d['name']} is slow", context=context, view=d["name"], steps=steps, detail=f"{ms} ms")
        F.stats["destinations"] += 1
        res = page.evaluate("__ex.audit()")
        before = len(F.items)
        record_audit(res, context, d["name"], steps)
        report_window(w, context, d["name"], steps)
        if len(F.items) > before:
            for f in list(F.items.values())[before:]:
                if f["severity"] in ("critical", "high"): snap(page, f)
        if shots is not None and d["key"] in shots:
            shots[d["key"]](page)
        if crawl: crawl_dest(page, w, context, d, clicked)


SAMPLE_TEXT = {"search": "lava", "url": "https://example.com/pixel", "email": "maya@example.com", "link": "https://example.com/join/abc12",
               "name": "Pixel Quest", "title": "Explorer check: campfire save points", "default": "Explorer check: lava tiles feel good"}


def crawl_dest(page, w, context, dest, clicked):
    sig0 = signature(page)
    cands = page.evaluate("__ex.cands()")
    n = 0
    for c in cands:
        if n >= 45: break
        if c["key"] in clicked: continue
        clicked.add(c["key"])
        if c["destructive"] or c["external"] or c["download"]:
            F.stats["skipped_destructive"] += 1; continue
        # back to where we were
        if signature(page) != sig0:
            reset(page); go(page, dest)
        el = page.evaluate_handle("k => __ex.find(k)", c["key"]).as_element()
        if not el: continue
        n += 1; F.stats["clicks"] += 1
        steps = [f"open the app ({context})", f"go to {dest['name']}", f"click \"{c['label'] or c['desc']}\" ({c['desc']})"]
        url0 = page.url
        w.mark(); page.evaluate("__ex.mark()")
        try:
            el.click(timeout=1500)
        except Exception as e:
            msg = str(e).split("\n")[0]
            if "intercepts pointer events" in str(e) or "not visible" in msg or "Timeout" in msg:
                F.add("unclickable", "medium", "Button cannot be clicked", context=context, view=dest["name"], steps=steps, detail=msg[:200], selector=c["desc"], label=c["label"])
            continue
        page.wait_for_timeout(650)
        end = time.time() + 2
        while w.pending and time.time() < end: page.wait_for_timeout(100)
        s = page.evaluate("__ex.since()") if not page.is_closed() else {"muts": 1, "first": 0}
        got = report_window(w, context, dest["name"], steps)
        moved = page.url != url0
        if not (s["muts"] or got["reqs"] or got["frames"] or moved or got["popups"] or got["dialogs"] or got["files"]):
            F.stats["dead"] += 1
            F.add("dead", "medium", "Button does nothing", context=context, view=dest["name"], steps=steps, detail="no DOM change, no request, no navigation within 0.65 s", selector=c["desc"], label=c["label"])
        elif s.get("first") and s["first"] > 1000:
            F.add("slow", "medium", "Slow response to a click", context=context, view=dest["name"], steps=steps, detail=f"first visible change after {s['first']} ms", selector=c["desc"], label=c["label"])
        if not page.url.startswith(BASE):
            page.goto(BASE + "/?skipIntro=1"); settle(page, 600)
        # an overlay that Escape cannot close is a trap
        ov = page.evaluate("__ex.overlay()")
        if ov:
            page.keyboard.press("Escape"); page.wait_for_timeout(150)
            if page.evaluate("__ex.overlay()") == ov:
                F.add("no-escape", "low", "Overlay ignores Escape", context=context, view=dest["name"], steps=steps + ["press Escape"], detail=f"still open: {', '.join(ov)}", selector=ov[0])
                page.reload(); settle(page, 700)
    # type into what can be typed into
    inputs = page.evaluate("""[...document.querySelectorAll('input:not([type]), input[type=text], input[type=search], input[type=url], input[type=email], textarea')]
      .filter(e => __ex.visible(e) && !e.disabled && !e.readOnly).slice(0, 5).map(e => ({ desc: __ex.desc(e), ph: e.placeholder || e.getAttribute('aria-label') || e.name || '', type: e.type }))""")
    for inp in inputs:
        if signature(page) != sig0: reset(page); go(page, dest)
        loc = page.locator(inp["desc"].split(" ")[-1]).first
        hint = (inp["ph"] + " " + inp["type"]).lower()
        text = next((v for k, v in SAMPLE_TEXT.items() if k in hint), SAMPLE_TEXT["default"])
        steps = [f"open the app ({context})", f"go to {dest['name']}", f"type \"{text}\" into {inp['desc']}", "press Enter"]
        w.mark()
        try:
            loc.fill(text, timeout=1200); loc.press("Enter", timeout=1200)
        except Exception: continue
        F.stats["inputs"] += 1
        page.wait_for_timeout(500)
        report_window(w, context, dest["name"], steps)
        try: page.keyboard.press("Escape")
        except Exception: pass


# ---------------------------------------------------------------- intuitive journeys (goal-based, by visible text/role)
def find_affordance(page, alts):
    """alts: list of dicts {role, name} | {text} | {css}. Returns (locator, how) for the first visible one."""
    for a in alts:
        try:
            if "role" in a: loc = page.get_by_role(a["role"], name=re.compile(a["name"], re.I))
            elif "text" in a: loc = page.get_by_text(re.compile(a["text"], re.I))
            else: loc = page.locator(a["css"])
            n = loc.count()
            for i in range(min(n, 8)):
                if loc.nth(i).is_visible(): return loc.nth(i), ("css" if "css" in a else "role" if "role" in a else "text")
        except Exception: pass
    return None, None


def run_journey(page, w, context, j):
    t0 = time.time(); clicks = 0; notes = []; ok_ = True; trail = []; skip_label = None
    try:
        page.evaluate(f"(() => {{ {j.get('start', 'TribeApp.show(\"home\")')} }})()"); settle(page, 500)
    except Exception as e:
        notes.append(f"could not reach the start: {e}")
    w.mark()
    for step in j["steps"]:
        kind = step[0]
        if kind == "click?":   # only when it is there (e.g. "New command" when Claude is already connected)
            loc, how = find_affordance(page, step[1])
            if loc:
                try: loc.click(timeout=2500); clicks += 1; trail.append(step[2]); settle(page, 400); skip_label = step[2]
                except Exception: pass
            continue
        if kind == "click" and len(step) > 2 and step[2] == skip_label: continue
        if kind == "click" and skip_label and j["id"] == "preview": continue
        if kind == "click":
            loc, how = find_affordance(page, step[1])
            if not loc:
                ok_ = False; notes.append(f"no visible affordance for: {step[2] if len(step) > 2 else step[1]}"); break
            if how == "css": notes.append(f"'{step[2] if len(step) > 2 else step[1][0]}' found only by its id (no visible text or role name)")
            try: loc.click(timeout=2500)
            except Exception as e:
                ok_ = False; notes.append(f"click failed: {str(e).splitlines()[0][:120]}"); break
            clicks += 1; trail.append(step[2] if len(step) > 2 else str(step[1][0])); settle(page, 400)
        elif kind == "fill":
            loc, how = find_affordance(page, step[1])
            if not loc: ok_ = False; notes.append(f"no field for: {step[3] if len(step) > 3 else step[1]}"); break
            loc.fill(step[2]); trail.append(f"type '{step[2]}'")
        elif kind == "key":
            page.keyboard.press(step[1]); settle(page, 300); trail.append(f"press {step[1]}")
        elif kind == "js":
            page.evaluate(f"(() => {{ {step[1]} }})()"); settle(page, 300)
        elif kind == "expect":
            try:
                page.wait_for_function(step[1], timeout=step[2] if len(step) > 2 else 6000)
            except Exception:
                ok_ = False; notes.append(f"goal not reached: {j['goal']}"); break
    ms = int((time.time() - t0) * 1000)
    got = report_window(w, context, f"journey: {j['title']}", [f"start: {j.get('start_label', 'project home')}"] + trail)
    if got["errors"]: notes.append(f"{len(got['errors'])} error(s) on the way")
    res = {"id": j["id"], "title": j["title"], "kind": "intuitive", "context": context, "pass": ok_, "clicks": clicks, "max_clicks": j["max"], "ms": ms, "notes": notes, "steps": trail}
    if ok_ and clicks > j["max"]: res["notes"].append(f"needs {clicks} clicks (target ≤ {j['max']})")
    F.journeys.append(res)
    if not ok_:
        f = F.add("journey", "high", f"Journey fails: {j['title']}", context=context, view="journey", steps=[f"start: {j.get('start_label', 'project home')}"] + trail, detail="; ".join(notes), label=j["id"])
        snap(page, f)
    elif clicks > j["max"]:
        F.add("journey-long", "medium", f"Journey takes too many clicks: {j['title']}", context=context, view="journey", steps=trail, detail=f"{clicks} clicks, target ≤ {j['max']}", label=j["id"])
    log(f"journey {j['id']} ({context}): {'pass' if ok_ else 'FAIL'} in {clicks} clicks, {ms} ms {('· ' + '; '.join(notes)) if notes else ''}")
    try: page.keyboard.press("Escape"); page.keyboard.press("Escape")
    except Exception: pass
    return res


VIS = "(sel) => { const e = document.querySelector(sel); return !!e && window.__ex.visible(e); }"
JOURNEYS = [
    {"id": "invite", "title": "Invite a friend and get a link", "goal": "a join link is on screen", "max": 2,
     "steps": [("click", [{"role": "button", "name": r"^invite"}, {"role": "button", "name": r"invite"}, {"css": "#tour-invite"}], "Invite friends"),
               ("expect", "[...document.querySelectorAll('input, code, .code, a, pre, span, div, textarea')].some(e => window.__ex.visible(e) && /https?:\\/\\/[^\\s]+(join|go\\.html|#s=|\\/m\\/)/.test(e.value || (e.children.length ? '' : e.textContent)))")]},
    {"id": "propose", "title": "Propose a feature and get it on the Board", "goal": "the proposal is listed on the Board", "max": 4,
     "start": "TribeApp.show('chat')", "start_label": "chat",
     "steps": [("click", [{"role": "button", "name": r"^add(:|$)"}, {"css": "#m2-plus, #composer-mount [aria-label^=Add]"}], "composer +"),
               ("click", [{"role": "menuitem", "name": r"propose"}, {"role": "button", "name": r"propose"}, {"text": r"^propose"}], "Propose to the tribe"),
               ("fill", [{"role": "textbox", "name": r"(question|title|propos|idea)"}, {"css": ".modal:not(.hidden) input, .vt-sheet input, [role=dialog] input, .sheet input"}], "Explorer: a photo mode", "proposal title"),
               ("click", [{"role": "button", "name": r"^propose$"}, {"role": "button", "name": r"^(propose|post|send)\b"}], "send proposal"),
               ("js", "TribeApp.show('board')"),
               ("expect", "document.querySelector('#view-board') && document.querySelector('#view-board').innerText.includes('photo mode') || [...document.querySelectorAll('#chat-list *')].some(e => /photo mode/.test(e.textContent || ''))")]},
    {"id": "connect-claude", "title": "Connect Claude Code",
     "steps_phone": [("click", [{"role": "button", "name": r"^you$|profile"}, {"css": "#m2-me"}], "You (profile)"),
                     ("click", [{"role": "button", "name": r"connect.*claude|connect from another computer"}, {"role": "menuitem", "name": r"connect.*claude"}, {"text": r"connect your claude"}], "Connect your Claude Code"),
                     ("click?", [{"role": "button", "name": r"^new command"}], "New command"),
                     ("expect", "[...document.querySelectorAll('code, pre, input, textarea, .code, span, div')].some(e => window.__ex.visible(e) && /claude mcp add/.test(e.value || (e.children.length ? '' : e.textContent)))")], "goal": "a `claude mcp add` command is on screen", "max": 2,
     "steps": [("click", [{"role": "button", "name": r"connect.*claude|claude code|connect your claude|add (an )?agent"}, {"text": r"connect (your )?claude"}, {"css": "#cc-connect button, #cc-connect"}], "Connect Claude"),
               ("click?", [{"role": "button", "name": r"^new command"}], "New command"),
               ("expect", "[...document.querySelectorAll('code, pre, input, textarea, .code, span, div')].some(e => window.__ex.visible(e) && /claude mcp add/.test(e.value || (e.children.length ? '' : e.textContent)))")]},
    # (phone variants live in steps_phone)
    {"id": "preview", "title": "Preview the app", "goal": "the preview pane is open", "max": 2,
     "steps": [("click?", [{"role": "button", "name": r"^preview app"}], "Preview app"),
               ("click", [{"role": "button", "name": r"^docs"}, {"text": r"^docs & files$"}], "Docs & Files"),
               ("click", [{"role": "button", "name": r"^preview app"}, {"role": "button", "name": r"preview"}], "Preview app"),
               ("expect", "(() => { const p = document.querySelector('#preview-pane'); return (p && window.__ex.visible(p)) || !!document.querySelector('iframe[src*=preview]'); })()")]},
    {"id": "bugs", "title": "Find the bug inbox",
     "steps_phone": [("click", [{"role": "tab", "name": r"^tasks"}, {"role": "button", "name": r"^tasks"}], "Tasks (rack)"),
                     ("click", [{"role": "tab", "name": r"^bugs"}, {"role": "button", "name": r"^bugs"}], "Bugs"),
                     ("expect", "!document.querySelector('#view-bugs').classList.contains('hidden')")], "goal": "the Bugs view is open", "max": 2,
     "steps": [("click", [{"role": "button", "name": r"^tasks"}, {"text": r"^tasks & board"}], "Tasks & Board"),
               ("click", [{"role": "tab", "name": r"^bugs"}, {"role": "button", "name": r"^bugs"}], "Bugs"),
               ("expect", "!document.querySelector('#view-bugs').classList.contains('hidden')")]},
    {"id": "capture", "title": "Turn on capture to notes", "goal": "capture is on", "max": 2,
     "start": "if (window.TribeCapture && TribeCapture.on()) TribeCapture.toggle(); TribeApp.show('home')",
     "steps": [("click", [{"role": "button", "name": r"profile|^you$"}, {"css": "#pf-btn"}], "profile"),
               ("click", [{"role": "menuitem", "name": r"capture"}, {"role": "button", "name": r"capture"}], "Capture to notes"),
               ("expect", "window.TribeCapture && TribeCapture.on()")]},
    {"id": "home-to-project", "title": "Start at Home and open a project", "goal": "a project view is open", "max": 2,
     "start": "window.TribeHub ? TribeHub.open('home') : TribeApp.show('hub')", "start_label": "Home",
     "steps": [("click", [{"role": "button", "name": r"pixel quest"}, {"role": "link", "name": r"pixel quest"}, {"text": r"^pixel quest$"}], "Pixel Quest"),
               ("expect", "document.body.dataset.view !== 'hub' && window.TribeClient.project() === " + json.dumps("__PQ__"))]},
]


# ---------------------------------------------------------------- core-intent journeys (collaboration with agents, autopilot, chat, notifications)
def core_result(jid, title, t0, ok_, clicks, notes, checks):
    res = {"id": jid, "title": title, "kind": "core", "context": "desktop+phone+api", "pass": ok_, "clicks": clicks, "ms": int((time.time() - t0) * 1000), "notes": notes, "checks": checks}
    F.journeys.append(res)
    failed = [c for c in checks if not c["ok"]]
    if failed:
        F.add("journey", "high", f"Core journey: {title}", context="core", view="journey", steps=[c["name"] for c in checks], detail="; ".join(f"{c['name']}: {c.get('why', 'failed')}" for c in failed), label=jid)
    log(f"core {jid}: {'pass' if ok_ else 'FAIL'} ({sum(c['ok'] for c in checks)}/{len(checks)} checks, {clicks} clicks, {res['ms']} ms){' · ' + '; '.join(notes) if notes else ''}")
    return res


class Checks:
    def __init__(self): self.list = []
    def __call__(self, name, cond, why=""):
        self.list.append({"name": name, "ok": bool(cond), **({} if cond else {"why": why or "not true"})})
        return bool(cond)
    def ok(self): return all(c["ok"] for c in self.list)


def fresh_agents():
    """New keys for both Claudes (the UI crawl may have clicked 'new key'), then make them active."""
    for who, k in (("orion", "a1"), ("maya", "a2")):
        r = ok(api("/agents", "POST", {}, token=S[who], project=S["pq"]), "agent key")
        S[k], S[k + "id"], S[k + "name"] = r["token"], r["agent"]["id"], r["agent"]["name"]
        mcp(S[k], "my_lane", {})


def core_collab(browser):
    """Two humans + two Claudes on one project: lanes stop overlap, the radar flags shared files, hand-off works."""
    fresh_agents()
    t0 = time.time(); ck = Checks(); notes = []; clicks = 0; p = S["pq"]
    err, txt = mcp(S["a1"], "claim_file", {"path": "src/player.js", "note": "tuning the jump"})
    ck("Orion's Claude claims src/player.js", not err and "conflict" not in txt.lower(), txt[:160])
    err, txt = mcp(S["a2"], "claim_file", {"path": "src/player.js", "note": "double jump"})
    refused = err or re.search(r"(already|claimed|held|conflict|owned|editing)", txt, re.I)
    ck("Maya's Claude gets a clear refusal", refused, txt[:200])
    ck("the refusal names who holds it", "Orion" in txt or S["a1name"] in txt, txt[:200])
    if refused and not re.search(r"hand ?-?off|ask|message|wait|release", txt, re.I): notes.append("the refusal does not say what to do next (ask, wait or hand-off)")
    # two branches touching the same file -> the conflict radar
    repo = S["repo"]
    for who, val in ((S["oid"], "5"), (S["mid"], "6")):
        b = f"explore/radar-{who}-{int(time.time())}"
        sh("git", "-C", repo, "branch", "-f", b, "main")
        tree = tempfile.mkdtemp(prefix="ex-wt-", dir="/tmp")
        sh("git", "-C", repo, "worktree", "add", "-q", "--force", tree, b)
        Path(tree, "src/world.js").write_text(f"export const tiles = ['grass', 'lava', 'ice{val}']\n")
        sh("git", "-C", tree, "-c", "user.email=x@example.com", "-c", f"user.name={who}", "commit", "-qam", f"Tiles by {who}")
        sh("git", "-C", repo, "worktree", "remove", "--force", tree)
    conf = wait_until(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("pairs") else None)(api("/coord/conflicts", token=S["orion"], project=p)), 15, 1)
    ck("conflict radar flags the two branches", conf and any("src/world.js" in x["files"] for x in conf["pairs"]), json.dumps(conf)[:200] if conf else "no pairs")
    # hand-off: Orion's Claude parks player.js for Maya's Claude
    err, txt = mcp(S["a1"], "handoff", {"title": "Jump tuning", "context": "Jump is 4, try 4.5. Tests in tests/jump.", "to": S["a2name"], "files": "src/player.js"})
    ck("hand-off accepted", not err, txt[:160])
    err, txt = mcp(S["a2"], "check_messages", {})
    ck("Maya's Claude hears about the hand-off", "Jump tuning" in txt or "handed" in txt.lower() or "player.js" in txt, txt[:200])
    err, txt = mcp(S["a2"], "claim_file", {"path": "src/player.js", "note": "taking over"})
    ck("after the hand-off Maya's Claude can claim the file", not err and not re.search(r"(already|conflict)", txt, re.I), txt[:200])
    # UI: the host sees the conflict in Agents Hub → Conflicts
    ctx, page, w = new_page(browser, "desktop", token=S["orion"], project=p)
    try:
        boot(page, w, "desktop")
        page.evaluate(f"TribeClient.switchProject({json.dumps(p)})"); settle(page, 600)
        loc, _ = find_affordance(page, [{"role": "button", "name": r"agents hub"}, {"text": r"^agents hub$"}])
        if loc: loc.click(); clicks += 1; settle(page)
        loc, _ = find_affordance(page, [{"role": "tab", "name": r"conflict"}, {"role": "button", "name": r"conflict"}])
        if loc: loc.click(); clicks += 1; settle(page, 900)
        seen = wait_until(lambda: page.evaluate("document.body.innerText.includes('src/world.js')"), 8, 0.4)
        ck("the host sees src/world.js on the Conflicts tab", seen, "not on screen")
        report_window(w, "desktop", "journey: collaboration", ["Agents Hub", "Conflicts"])
    finally: ctx.close()
    return core_result("collab", "Two humans + two Claudes: lanes, conflicts, hand-off", t0, ck.ok(), clicks, notes, ck.list)


def core_connect(browser):
    """The 'Connect your Claude Code' generator gives a command that works; the agent joins, posts, reads, shows up."""
    t0 = time.time(); ck = Checks(); notes = []; clicks = 0; p = S["pq"]
    ctx, page, w = new_page(browser, "desktop", token=S["maya"], name="Maya", project=p)
    try:
        boot(page, w, "desktop")
        page.evaluate(f"TribeClient.switchProject({json.dumps(p)})"); settle(page, 600)
        page.evaluate("TribeApp.show('home')"); settle(page)
        mcp(S["a2"], "my_lane", {})   # Maya's Claude is working right now
        loc, how = find_affordance(page, [{"role": "button", "name": r"connect.*claude|claude code"}, {"text": r"connect (your )?claude"}, {"css": "#cc-connect button"}])
        cmd = None
        if ck("a visible 'Connect Claude' affordance", loc, "none found"):
            loc.click(); clicks += 1; settle(page, 600)
            err, _ = mcp(S["a2"], "my_lane", {})
            ck("opening the generator keeps a working Claude connected", not err, "its key stopped working just by opening the dialog")
            nxt, _ = find_affordance(page, [{"role": "button", "name": r"^new command|new key|connect another"}])
            if nxt: nxt.click(); clicks += 1; settle(page, 600); notes.append("already connected: 'New command' is one extra deliberate tap")
            cmd = wait_until(lambda: page.evaluate("(() => { for (const e of document.querySelectorAll('code, pre, input, textarea, .code, span, div')) { const t = e.value || (e.children.length ? '' : e.textContent) || ''; if (/claude mcp add/.test(t) && window.__ex.visible(e)) return t.trim(); } return null; })()"), 8, 0.3)
        ck("the generator shows a `claude mcp add` command", cmd, "no command on screen")
        url = tok = None
        if cmd:
            m = re.search(r"(https?://\S+/mcp)", cmd); t = re.search(r"Bearer ([A-Za-z0-9_-]{16,})", cmd)
            url, tok = (m.group(1) if m else None), (t.group(1) if t else None)
            ck("the command carries an MCP URL and a key", url and tok, cmd[:160])
            if tok and "<key>" in cmd: notes.append("the command shows a <key> placeholder")
        cmds = (api("/agents/mine", token=S["maya"], project=p)[1] or {}).get("commands") or {}
        if cmds:
            ck("a 'This computer' command exists", cmds.get("here"), json.dumps(cmds)[:160])
            if not cmds.get("anywhere"): notes.append("no 'Anywhere' command until a public link (Funnel/cloudflared) is on")
        if url and tok:
            local = re.sub(r"https?://[^/]+", BASE, url)   # same server; the test can't resolve LAN names
            err, res = mcp_url(local, tok, None, method="initialize")
            ck("the agent can initialize", not err, str(res)[:160])
            err, txt = mcp_url(local, tok, "post_gist", {"kind": "plan", "title": "Explorer agent says hi", "bullets": ["Connected from the generator"]})
            ck("the agent posts a gist", not err, txt[:160])
            err, txt = mcp_url(local, tok, "read_chat", {})
            ck("the agent reads the chat", not err and "Lava" in txt or "lava" in txt, txt[:160])
            page.keyboard.press("Escape"); settle(page, 300)
            seen = wait_until(lambda: page.evaluate("(() => { const r = document.querySelector('#room-agents'); return !!r && /Claude · Maya/.test(r.textContent); })()"), 8, 0.4)
            ck("the agent appears in the room", seen, "not in #room-agents: " + page.evaluate("(document.querySelector('#room-agents') || {}).textContent || 'no #room-agents'")[:160])
        report_window(w, "desktop", "journey: connect Claude Code", ["Connect Claude", "copy the command"])
    finally: ctx.close()
    return core_result("connect", "Connect Claude Code: generator → working agent", t0, ck.ok(), clicks, notes, ck.list)


def core_autopilot(browser):
    """Repo autopilot: one-click project → GitHub (mock) repo; a commit by a person → pushed with their identity, a gist, the plan."""
    t0 = time.time(); ck = Checks(); notes = []; clicks = 0
    ok(api("/me/git", "PUT", {"githubToken": "ghp_explorerTOKEN0123456789"}, token=S["orion"]), "github token")
    st, d = api("/flow/create", "POST", {"name": "Autopilot Arcade"}, token=S["orion"], timeout=90)
    ck("one-click create answers", st == 200, f"{st} {str(d)[:160]}")
    pid = ((d or {}).get("flow") or {}).get("project") or ((d or {}).get("flow") or {}).get("id")
    if not pid: pid = next((x["id"] for x in api("/projects", token=S["orion"])[1].get("projects", []) if x["name"] == "Autopilot Arcade"), None)
    bare = os.path.join(GH["root"], "autopilot-arcade.git")
    ck("a GitHub repo was created and pushed", wait_until(lambda: os.path.isdir(bare) and sh("git", "--git-dir", bare, "log", "-1", "--format=%s", "main"), 20, 0.5), "no bare repo / no commit")
    plan0 = None
    if pid:
        st, fl = api("/flow/start", "POST", {}, token=S["orion"], project=pid, timeout=60)
        plan0 = ((fl or {}).get("flow") or {}).get("plan")
        ck("Start the flow makes a living plan", st == 200 and plan0, f"{st} {str(fl)[:120]}")
        st, br = api(f"/projects/{pid}/branch", "POST", {}, token=S["orion"], project=pid)
        ck("Give me a branch", st == 200, str(br)[:160])
        tree = (((br or {}).get("branch") or {}).get("dir")) or (((br or {}).get("branch") or {}).get("path"))
        if not tree:
            cand = list(Path(S["tmp"], "tribe", "workspaces", pid, ".trees").glob("*"))
            tree = str(cand[0]) if cand else None
        if ck("the branch has a worktree", tree and os.path.isdir(tree), str(br)[:160]):
            Path(tree, "app").mkdir(exist_ok=True)
            Path(tree, "app/coin.js").write_text("export const coin = 1\n")
            st, c = api(f"/projects/{pid}/branch/commit", "POST", {"message": "Add coins"}, token=S["orion"], project=pid)
            ck("Commit my changes", st == 200, str(c)[:160])
            st, pu = api(f"/projects/{pid}/branch/push", "POST", {}, token=S["orion"], project=pid, timeout=60)
            ck("Push my branch", st == 200, str(pu)[:160])
            branch = f"tribe/{S['oid']}"
            author = wait_until(lambda: sh("git", "--git-dir", bare, "log", "-1", "--format=%an <%ae>|%s", branch), 10, 0.5)
            ck("the commit reached GitHub with the person's identity", author and author.startswith("Orion") and "Add coins" in author, author or "branch not on origin")
            gist = wait_until(lambda: any("coin" in json.dumps(g).lower() or "Add coins" in json.dumps(g) for g in api("/gists", token=S["orion"], project=pid)[1].get("gists", [])), 12, 0.5)
            ck("the commit shows as a gist", gist, "no gist mentions the commit")
            fl = api("/flow", token=S["orion"], project=pid)[1].get("flow") or {}
            moved = plan0 and fl.get("plan") and (fl["plan"].get("updated") != plan0.get("updated") or fl["plan"].get("done") != plan0.get("done"))
            if not moved: notes.append("the plan does not mention the commit (only gists do)")
        if ck("PLAN.md is in the repo", os.path.exists(os.path.join(S["tmp"], "tribe", "workspaces", pid, "PLAN.md")), "no PLAN.md"): pass
    return core_result("autopilot", "Repo autopilot: create → commit → push to GitHub → gist → plan", t0, ck.ok(), clicks, notes, ck.list)


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def core_chat(browser, server):
    """Chat fidelity: every kind of message reaches everyone live, in order, and survives a restart."""
    t0 = time.time(); ck = Checks(); notes = []; clicks = 0; p = S["pq"]
    hctx, host, hw = new_page(browser, "desktop", token=S["orion"], project=p)
    pctx, phone, pw = new_page(browser, "phone", phone=True, token=S["maya"], name="Maya", project=p)
    try:
        for pg, w, c in ((host, hw, "desktop"), (phone, pw, "phone")):
            boot(pg, w, c); pg.evaluate(f"TribeClient.switchProject({json.dumps(p)})"); settle(pg, 500)
            pg.evaluate("TribeApp.show('chat')"); settle(pg, 500)
        # Maya types in the phone composer
        sent = False
        try:
            phone.locator("#chat-input").fill("Phone hello from Maya 🌋"); phone.locator("#chat-input").press("Enter"); clicks += 1; sent = True
        except Exception as e: notes.append(f"phone composer: {str(e).splitlines()[0][:100]}")
        ck("Maya sends from the phone composer", sent)
        base = api("/chat/general?limit=5", token=S["orion"], project=p)[1]["messages"][-1]
        rid = ok(api("/chat/general/send", "POST", {"text": "Reply to Maya", "replyTo": base["id"]}, token=S["orion"], project=p))["message"]["id"]
        ok(api("/chat/general/react", "POST", {"id": rid, "emoji": "👍"}, token=S["maya"], project=p))
        ok(api("/chat/general/image", "POST", {"data": base64.b64encode(PNG).decode(), "mime": "image/png", "text": "lava tile v2"}, token=S["maya"], project=p))
        ok(api("/chat/general/voice", "POST", {"data": base64.b64encode(b"\x1aE\xdf\xa3" + b"\0" * 64).decode(), "mime": "audio/webm;codecs=opus", "dur": 2, "transcript": "ice level next", "wave": [2, 5, 3]}, token=S["orion"], project=p))
        ok(api("/chat/general/file", "POST", {"data": base64.b64encode(b"%PDF-1.4\n%explorer\n").decode(), "name": "Level map.pdf", "mime": "application/pdf"}, token=S["maya"], project=p))
        vote = ok(api("/chat/general/vote", "POST", {"question": "Ice level after lava?", "options": ["Yes", "No"]}, token=S["maya"], project=p))["message"]
        want = ["Phone hello from Maya", "Reply to Maya", "lava tile v2", "ice level next", "Level map.pdf", "Ice level after lava?"]
        for pg, who in ((host, "desktop"), (phone, "phone")):
            live = wait_until(lambda: pg.evaluate("t => t.every(x => document.querySelector('#chat-list').innerText.includes(x))", want), 10, 0.4)
            missing = [] if live else pg.evaluate("t => t.filter(x => !document.querySelector('#chat-list').innerText.includes(x))", want)
            ck(f"everything arrives live on the {who}", live, f"missing: {missing}")
            order = pg.evaluate("t => t.map(x => document.querySelector('#chat-list').innerText.indexOf(x))", want)
            ck(f"in order on the {who}", all(a < b for a, b in zip(order, order[1:])) if live else False, f"positions {order}")
        has_img = host.evaluate("!!document.querySelector('#chat-list img[src*=\"/media/\"], #chat-list img[src*=\"media\"]')")
        ck("the image renders as an image", has_img, "no <img> for the photo")
        ck("the reaction shows", wait_until(lambda: host.evaluate("document.querySelector('#chat-list').innerText.includes('👍')"), 5, 0.3))
        # restart the server: everything is still there
        server.stop(); server.start()
        msgs = api("/chat/general?limit=60", token=S["maya"], project=p)[1].get("messages", [])
        blob = json.dumps(msgs)
        ck("everything persists across a server restart", all(x.replace("Level map.pdf", "Level map") in blob for x in want), "missing after restart")
        ck("the reply keeps its quote", any(m.get("replyTo") for m in msgs if m.get("text") == "Reply to Maya"))
        ck("the vote keeps its options", any(m.get("vote") and len(m["vote"].get("options", [])) == 2 for m in msgs if m["id"] == vote["id"]))
        host.reload(); settle(host, 1200)
        host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000)
        host.evaluate("TribeApp.show('chat')"); settle(host, 800)
        seen = wait_until(lambda: host.evaluate("t => t.every(x => document.querySelector('#chat-list').innerText.includes(x))", want), 8, 0.4)
        ck("the host sees it all after a reload", seen, "" if seen else f"missing: {host.evaluate('t => t.filter(x => !document.querySelector(`#chat-list`).innerText.includes(x))', want)} · project {host.evaluate('TribeClient.project()')}")
        report_window(hw, "desktop", "journey: chat fidelity", ["chat"]); report_window(pw, "phone", "journey: chat fidelity", ["chat"])
    finally:
        hctx.close(); pctx.close()
    return core_result("chat", "Chat fidelity: live, in order, every kind, survives a restart", t0, ck.ok(), clicks, notes, ck.list)


def core_notify(browser):
    """Notifications: @mention, approval request, vote nudge reach the inbox/bell with the right counts; quiet hours; phone parity."""
    t0 = time.time(); ck = Checks(); notes = []; clicks = 0; p = S["pq"]
    ntfy = f"http://127.0.0.1:{S['ntfy_port']}"
    unread = lambda tok: api("/notify/inbox", token=tok, project=p)[1].get("unread", 0)
    u0 = unread(S["orion"])
    ok(api("/chat/general/send", "POST", {"text": "@Orion can you check the lava edge?"}, token=S["maya"], project=p))
    ck("@mention lands in Orion's inbox", wait_until(lambda: unread(S["orion"]) > u0, 6, 0.3), f"unread stayed {u0}")
    err, txt = mcp(S["a1"], "request_approval", {"title": "Run the save-file migration", "risk": "medium"})
    ck("the agent asks for approval", not err, txt[:160])
    items = api("/notify/inbox", token=S["orion"], project=p)[1].get("items", [])
    ck("the approval request reaches its owner", any(i.get("type") == "approval" for i in items), [i.get("type") for i in items][:8])
    st, r = api(f"/chat/general/vote/{S['vote']['id']}/remind", "POST", {}, token=S["orion"], project=p)
    ck("vote nudge accepted", st == 200, f"{st} {r}")
    mi = api("/notify/inbox", token=S["maya"], project=p)[1].get("items", [])
    ck("'waiting on your vote' reaches Maya", any(i.get("type") == "vote" for i in mi), [i.get("type") for i in mi][:8])
    # quiet hours: Maya's pocket (ntfy mock) stays silent, the inbox still fills
    now = time.gmtime(); frm = f"{now.tm_hour:02d}:00"; to = f"{(now.tm_hour + 2) % 24:02d}:00"
    ok(api("/notify/prefs", "PUT", {"ntfy": {"enabled": True, "server": ntfy, "topic": "explorer-maya"}, "channels": {"ntfy": True}, "tz": "UTC", "when": {"mode": "always", "quiet": {"on": True, "from": frm, "to": to}}}, token=S["maya"]), "quiet prefs")
    n0 = len(NTFY["posts"]); mu0 = unread(S["maya"])
    ok(api("/chat/general/send", "POST", {"text": "@Maya quiet-hours test"}, token=S["orion"], project=p))
    ck("in quiet hours the inbox still gets it", wait_until(lambda: unread(S["maya"]) > mu0, 6, 0.3))
    time.sleep(1.0)
    ck("in quiet hours nothing is pushed", len(NTFY["posts"]) == n0, f"{len(NTFY['posts']) - n0} push(es) sent")
    ok(api("/notify/prefs", "PUT", {"when": {"mode": "always", "quiet": {"on": False}}}, token=S["maya"]))
    ok(api("/chat/general/send", "POST", {"text": "@Maya after quiet hours"}, token=S["orion"], project=p))
    ck("outside quiet hours the pocket gets a push", wait_until(lambda: len(NTFY["posts"]) > n0, 8, 0.3), "no ntfy post")
    # bells: desktop + phone show the server's count
    for phone, tok, name in ((False, S["orion"], "Orion"), (True, S["maya"], "Maya")):
        ctx, page, w = new_page(browser, "phone" if phone else "desktop", phone=phone, token=tok, name=name, project=p)
        try:
            boot(page, w, "phone" if phone else "desktop"); page.evaluate(f"TribeClient.switchProject({json.dumps(p)})"); settle(page, 800)
            want = unread(tok)
            shown = wait_until(lambda: page.evaluate("window.TribeNotify && TribeNotify.state().unread"), 6, 0.3)
            badge = page.evaluate("(() => { for (const c of document.querySelectorAll('#nf-count, #tabbar [data-bd=updates]')) if (window.__ex.visible(c)) return c.textContent.trim(); return ''; })()")
            ck(f"{'phone' if phone else 'desktop'} bell count matches the inbox ({want})", shown == want, f"client says {shown}, server {want}")
            ck(f"{'phone' if phone else 'desktop'} shows a visible unread badge", bool(re.search(r"\d", badge or "")), f"badge text '{badge}'")
            loc, _ = find_affordance(page, [{"role": "button", "name": r"^inbox|notifications|updates"}, {"role": "tab", "name": r"^updates"}, {"css": "#nf-bell"}])
            if loc:
                loc.click(); clicks += 1; settle(page)
                ck(f"{'phone' if phone else 'desktop'} inbox opens with the mention", wait_until(lambda: page.evaluate("/lava edge|quiet-hours|after quiet/.test(document.body.innerText)"), 5, 0.3))
            else: ck(f"{'phone' if phone else 'desktop'} has a visible inbox button", False, "no bell")
            report_window(w, "phone" if phone else "desktop", "journey: notifications", ["bell"])
        finally: ctx.close()
    return core_result("notify", "Notifications: mention, approval, vote nudge, quiet hours, phone parity", t0, ck.ok(), clicks, notes, ck.list)


# ---------------------------------------------------------------- contexts
def run_desktop(browser, crawl, shots):
    ctx, page, w = new_page(browser, "desktop", token=S["orion"], project=S["pq"])
    try:
        boot(page, w, "desktop")
        page.evaluate(f"TribeClient.switchProject({json.dumps(S['pq'])})"); settle(page, 600)
        if "journeys" in PHASES:
            pq = S["pq"]
            for j in JOURNEYS:
                j = json.loads(json.dumps(j).replace("__PQ__", pq), object_hook=lambda d: d)
                j["steps"] = [tuple(s) for s in j["steps"]]
                page.goto(BASE + "/?skipIntro=1"); page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000); settle(page, 500)
                if j["id"] != "home-to-project": page.evaluate(f"TribeClient.switchProject({json.dumps(pq)})"); settle(page, 400)
                run_journey(page, w, "desktop", j)
                if shots is not None and f"j-{j['id']}" in shots: shots[f"j-{j['id']}"](page)
            page.goto(BASE + "/?skipIntro=1"); page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000); settle(page, 500)
            page.evaluate(f"TribeClient.switchProject({json.dumps(S['pq'])})"); settle(page, 500)
        visit_all(page, w, "desktop", crawl=crawl, shots=shots)
    finally: ctx.close()


def run_phone(browser, shots):
    ctx, page, w = new_page(browser, "phone", phone=True, token=S["maya"], name="Maya", project=S["pq"])
    try:
        boot(page, w, "phone")
        page.evaluate(f"TribeClient.switchProject({json.dumps(S['pq'])})"); settle(page, 600)
        if "journeys" in PHASES:
            for j in JOURNEYS:
                if j["id"] not in ("invite", "bugs", "connect-claude"): continue
                jj = dict(j); jj["steps"] = [tuple(s) for s in j.get("steps_phone", j["steps"])]
                page.goto(BASE + "/?skipIntro=1"); page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000); settle(page, 500)
                run_journey(page, w, "phone", jj)
            page.goto(BASE + "/?skipIntro=1"); page.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=12000); settle(page, 500)
        visit_all(page, w, "phone", phone=True, shots=shots)
    finally: ctx.close()


def run_tauri(browser, version):
    ctx, page, w = new_page(browser, "desktop-app", token=S["orion"], tauri=True, version=version, project=S["pq"])
    try:
        boot(page, w, "desktop-app")
        if not page.evaluate("document.body.classList.contains('tauri')"):
            F.add("tauri", "medium", "Desktop app chrome missing", context="desktop-app", view="boot", steps=["open in the desktop app"], detail="body lacks the 'tauri' class with window.__TAURI__ present")
        for key in ("min", "max"):
            b = page.locator(f"#win-ctl [data-w={key}]")
            if b.count() and b.first.is_visible():
                b.first.click(); page.wait_for_timeout(200)
        calls = [c[0] for c in page.evaluate("window.__tauriCalls")]
        if "window.minimize" not in calls or "window.toggleMaximize" not in calls:
            F.add("tauri", "medium", "Window buttons don't reach the desktop window", context="desktop-app", view="titlebar", steps=["click minimize / maximize"], detail=f"calls: {calls}")
        for d in [x for x in destinations(page) if x["key"] in ("hub", "chat", "docs", "ws-tasks", "settings", "pf")]:
            reset(page); w.mark(); go(page, d)
            record_audit(page.evaluate("__ex.audit()"), "desktop-app", d["name"], ["open the desktop app", f"go to {d['name']}"])
            report_window(w, "desktop-app", d["name"], ["open the desktop app", f"go to {d['name']}"])
    finally: ctx.close()


def run_offline(browser):
    ctx, page, w = new_page(browser, "not-connected")
    try:
        boot(page, w, "not-connected", connected=False)
        views = page.evaluate("Object.keys({hub:1,home:1,chat:1,docs:1,tasks:1,board:1,bugs:1,repo:1,calendar:1,visuals:1,coord:1})")
        for v in views:
            reset(page, "0"); w.mark()
            try: page.evaluate(f"TribeApp.show({json.dumps(v)})")
            except Exception as e:
                F.add("nav", "high", f"{v} breaks without a tribe", context="not-connected", view=v, steps=["open the app with no tribe", f"go to {v}"], detail=str(e)[:200]); continue
            settle(page, 400)
            steps = ["open the app with no tribe yet", f"go to {v}"]
            record_audit(page.evaluate("__ex.audit()"), "not-connected", v, steps)
            report_window(w, "not-connected", v, steps)
            empty = page.evaluate("""(v) => { const el = document.querySelector('#view-' + v); if (!el || el.classList.contains('hidden')) return null;
               const btn = [...el.querySelectorAll('button, a[href], input')].some(b => window.__ex.visible(b) && !b.disabled); return { text: el.innerText.trim().length, btn }; }""", v)
            if empty and not empty["btn"]:
                F.add("offline-dead-end", "medium", f"{v} has no way forward without a tribe", context="not-connected", view=v, steps=steps, detail=f"{empty['text']} chars of text, no button or link")
    finally: ctx.close()


# ---------------------------------------------------------------- suggestions
FEATURE_IDEAS = [
    # (key, idea, why, trigger(findings, journeys) -> bool, keywords to match docs/FEATURES-NEXT.md)
    ("dead-buttons", "Wire or remove controls that do nothing", "the explorer clicked {dead} control(s) with no visible effect", lambda f, j: F.stats["dead"] > 0, []),
    ("contrast", "Lift faint text to 4.5:1 (the user wants white, not grey)", "{contrast} color pair(s) under WCAG AA in the dark theme", lambda f, j: any(x["kind"] == "contrast" for x in f), []),
    ("labels", "Name every icon button (aria-label) so screen readers and Ctrl K can find them", "{nolabel} unnamed icon control(s)", lambda f, j: any(x["kind"] == "no-label" for x in f), ["keyboard map", "focus-visible"]),
    ("journey-clicks", "Shortcuts for the journeys that take the longest", "slowest journeys: {slowj}", lambda f, j: any(x["kind"] == "intuitive" and x["pass"] and x["clicks"] > x["max_clicks"] for x in j), []),
    ("refusal-next", "Claim refusals that say what to do next (ask the owner, wait, request a hand-off) in one tap", "a second claimant only hears 'claimed by'", lambda f, j: any("next" in n for x in j for n in x.get("notes", [])), ["conflict pre-flight"]),
    ("anywhere", "Turn on the public link from the Connect Claude card when 'Anywhere' is missing", "the generator has no 'Anywhere' command until a tunnel runs", lambda f, j: any("Anywhere" in n for x in j for n in x.get("notes", [])), []),
    ("plan-commits", "Tick PLAN.md items from commit messages too, not only from gists", "a pushed commit becomes a gist but the plan does not move", lambda f, j: any("plan does not mention" in n for x in j for n in x.get("notes", [])), []),
    ("offline", "Every view gets a 'host or join' next step when there is no tribe", "{offline} view(s) are dead ends without a tribe", lambda f, j: any(x["kind"] == "offline-dead-end" for x in f), []),
    ("empty", "Empty states with one obvious action ('Nothing here' → 'Add the first …')", "{empty} empty state(s) with no button nearby", lambda f, j: any(x["kind"] == "empty-dead-end" for x in f), []),
    ("health", "A host health page: disk, JSONL sizes, backups, tunnel, version, errors in the last hour (now fed by /api/insights)", "the self-heal and insights work makes the data available", lambda f, j: True, ["health page"]),
    ("selfreport", "One-tap 'Send report' on any error toast, deduplicated by the self-heal error budget", "errors seen while exploring: {errs}", lambda f, j: any(x["kind"] in ("pageerror", "console") for x in f), []),
    ("explorer-nightly", "Nightly explorer run posts its delta (fixed / new) as a gist in #agents", "the explorer writes findings.json; the Insights panel reads it", lambda f, j: True, []),
    ("slash", "Slash-command autocomplete in the composer (/task, /vote, /decide, @brain)", "commands exist but the explorer found no visible hint for them", lambda f, j: True, ["slash-command"]),
    ("permalink", "Message permalinks: copy link → jumps and highlights", "pointing a friend or an agent at one message takes a screenshot today", lambda f, j: True, ["permalink"]),
]


def suggestions():
    ranked = F.ranked()
    try: nxt = (ROOT / "docs" / "FEATURES-NEXT.md").read_text().lower()
    except Exception: nxt = ""
    fmt = {"dead": F.stats["dead"], "contrast": sum(1 for x in ranked if x["kind"] == "contrast"), "nolabel": sum(1 for x in ranked if x["kind"] == "no-label"),
           "offline": sum(1 for x in ranked if x["kind"] == "offline-dead-end"), "empty": sum(1 for x in ranked if x["kind"] == "empty-dead-end"),
           "errs": sum(1 for x in ranked if x["kind"] in ("pageerror", "console")),
           "slowj": ", ".join(f"{x['title']} ({x['clicks']})" for x in sorted([x for x in F.journeys if x["kind"] == "intuitive"], key=lambda x: -x["clicks"])[:3]) or "none"}
    out = []
    for key, idea, why, trig, kws in FEATURE_IDEAS:
        try:
            if not trig(ranked, F.journeys): continue
        except Exception: continue
        dup = next((k for k in kws if k in nxt), None)
        out.append({"key": key, "idea": idea, "why": why.format(**fmt), "in_features_next": bool(dup)})
    return out


# ---------------------------------------------------------------- report
def write_outputs(started, version):
    ranked = F.ranked()
    sev = {s: sum(1 for f in ranked if f["severity"] == s) for s in SEV_ORDER}
    data = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "version": version, "quick": ARGS.quick, "app_root": str(APP),
            "seconds": int(time.time() - started), "stats": F.stats, "summary": sev, "findings": ranked, "journeys": F.journeys, "suggestions": suggestions()}
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    log(f"wrote {OUT_JSON.relative_to(ROOT) if OUT_JSON.is_relative_to(ROOT) else OUT_JSON}")
    if OUT_MD: write_md(data)
    return data


def write_md(d):
    L = ["# Explore report", "",
         f"Generated by `npm run explore` (scripts/explore.py) on {d['generated'][:16].replace('T', ' ')} UTC against v{d['version']}. "
         f"{d['stats']['destinations']} destinations, {d['stats']['clicks']} clicks, {d['stats']['inputs']} inputs typed, {d['seconds']} s. "
         "Machine-readable: `.explore/findings.json`. How it works: docs/EXPLORER.md.", "",
         "| Critical | High | Medium | Low |", "|---|---|---|---|", f"| {d['summary']['critical']} | {d['summary']['high']} | {d['summary']['medium']} | {d['summary']['low']} |", ""]
    L += ["## Journeys", "", "| Journey | Kind | Where | Result | Clicks | Time | Notes |", "|---|---|---|---|---|---|---|"]
    for j in d["journeys"]:
        res = "pass" if j["pass"] else "**fail**"
        if j["kind"] == "core": res += f" ({sum(c['ok'] for c in j['checks'])}/{len(j['checks'])})"
        tgt = f" / ≤{j['max_clicks']}" if j.get("max_clicks") else ""
        L.append(f"| {j['title']} | {j['kind']} | {j['context']} | {res} | {j['clicks']}{tgt} | {j['ms'] / 1000:.1f} s | {'; '.join(j['notes'])[:220]} |")
    L.append("")
    fails = [(j, c) for j in d["journeys"] if j["kind"] == "core" for c in j["checks"] if not c["ok"]]
    if fails:
        L += ["Failed core checks:", ""] + [f"- {j['id']}: {c['name']} ({str(c.get('why', ''))[:160]})" for j, c in fails] + [""]
    L += ["## Findings (ranked by severity)", ""]
    for s in SEV_ORDER:
        group = [f for f in d["findings"] if f["severity"] == s]
        if not group: continue
        L += [f"### {s.capitalize()} ({len(group)})", ""]
        for f in group[:40]:
            where = ", ".join(f["contexts"]); views = ", ".join(f["views"][:4]) + (f" +{len(f['views']) - 4}" if len(f["views"]) > 4 else "")
            L.append(f"- **{f['title']}**{' · `' + f['selector'] + '`' if f['selector'] else ''}{' · \"' + f['label'] + '\"' if f['label'] else ''} — {where} · {views} · seen {f['count']}×  ")
            if f["detail"]: L.append(f"  {f['detail'][:300]}  ")
            if f["steps"]: L.append(f"  Steps: {' → '.join(f['steps'])[:300]}  ")
            if f.get("screenshot"): L.append(f"  Screenshot: [{f['screenshot']}](../{f['screenshot']})  ")
            L.append(f"  `id {f['id']}`")
        if len(group) > 40: L.append(f"- … and {len(group) - 40} more in .explore/findings.json")
        L.append("")
    L += ["## Suggestions", "", "Derived from what the explorer saw (friction, dead ends, repeated manual steps). Ideas already in docs/FEATURES-NEXT.md are marked and not repeated there.", ""]
    for s in d["suggestions"]:
        L.append(f"- **{s['idea']}**: {s['why']}.{' *(already in FEATURES-NEXT)*' if s['in_features_next'] else ''}")
    L.append("")
    OUT_MD.write_text("\n".join(L))
    log(f"wrote {OUT_MD.relative_to(ROOT)}")


# ---------------------------------------------------------------- main
def main():
    from playwright.sync_api import sync_playwright
    started = time.time()
    tmp = tempfile.mkdtemp(prefix="tribe-explore-", dir="/tmp"); S["tmp"] = tmp
    work = os.path.join(tmp, "src"); os.makedirs(work)
    GH["root"] = os.path.join(tmp, "github"); os.makedirs(GH["root"])
    gh, nt = serve(GitHubMock), serve(NtfyMock); S["ntfy_port"] = nt.server_address[1]
    oll = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(OLLAMA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = Server(tmp, {"TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}"})
    shots = None; shot_manifest = {}
    if ARGS.shots_dir:
        sd = Path(ARGS.shots_dir); sd.mkdir(parents=True, exist_ok=True)
        def mk(name):
            def f(page):
                page.mouse.move(5, 5); page.wait_for_timeout(300)
                page.screenshot(path=str(sd / f"{name}.png")); shot_manifest[name] = f"{name}.png"
            return f
        shots = {k: mk(f"desktop-{k}") for k in ("hub", "chat", "docs", "ws-tasks", "bugs", "ws-agents", "settings", "invite", "pf", "plus")}
        shots.update({f"j-{j['id']}": mk(f"journey-{j['id']}") for j in JOURNEYS})
    try:
        server.start()
        version = api("/health")[1].get("version", "?")
        log(f"server v{version} from {APP} on :{PORT}")
        seed(work)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            if "core" in PHASES:
                for fn in (core_collab, core_connect, core_autopilot, lambda b: core_chat(b, server), core_notify):
                    try: fn(browser)
                    except Exception as e:
                        name = getattr(fn, "__name__", "core_chat")
                        F.journeys.append({"id": name.replace("core_", ""), "title": name, "kind": "core", "context": "api", "pass": False, "clicks": 0, "ms": 0, "notes": [f"crashed: {e}"], "checks": [{"name": "ran", "ok": False, "why": str(e)[:200]}]})
                        F.add("journey", "high", f"Core journey crashed: {name}", context="core", view="journey", detail=traceback.format_exc()[-600:], label=name)
                        log(f"core {name} crashed: {e}")
            if "desktop" in PHASES: F.stats["contexts"].append("desktop"); run_desktop(browser, "crawl" in PHASES, shots)
            if "phone" in PHASES:
                F.stats["contexts"].append("phone")
                pshots = None
                if shots is not None: pshots = {k: (lambda n: (lambda page: (page.wait_for_timeout(300), page.screenshot(path=str(Path(ARGS.shots_dir) / n)), shot_manifest.__setitem__(n[:-4], n))))(f"phone-{k}.png") for k in ("hub", "chat", "docs", "ws-tasks")}
                run_phone(browser, pshots)
            if "tauri" in PHASES: F.stats["contexts"].append("desktop-app"); run_tauri(browser, version)
            if "offline" in PHASES: F.stats["contexts"].append("not-connected"); run_offline(browser)
            browser.close()
        data = write_outputs(started, version)
        if ARGS.shots_dir: (Path(ARGS.shots_dir) / "manifest.json").write_text(json.dumps({"version": version, "shots": shot_manifest}, indent=1))
        crit = [f for f in data["findings"] if f["severity"] == "critical"]
        log(f"done in {data['seconds']} s: {data['summary']} · journeys {sum(j['pass'] for j in F.journeys)}/{len(F.journeys)} pass")
        if ARGS.quick and crit:
            for f in crit: print(f"  CRITICAL: {f['title']} ({', '.join(f['contexts'])}) {f['detail'][:200]}")
            return 1
        return 0
    finally:
        server.stop(); oll.terminate(); gh.shutdown(); nt.shutdown()
        if not ARGS.keep: shutil.rmtree(tmp, ignore_errors=True)
        else: log(f"kept {tmp}")


if __name__ == "__main__":
    sys.exit(main())
