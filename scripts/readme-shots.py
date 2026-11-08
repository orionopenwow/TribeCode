"""README screenshots of the real app, with realistic data, in the default Campfire theme.

Starts a throwaway tribe server (temp --dir, mock Ollama, mock GitHub) and seeds it through the API and MCP:
Orion (the host), Maya and Jay, two agents (Orion's Claude and Maya's Claude), Pixel Quest made with one click and
filled from templates/starter-game, Lantern Run from templates/lantern-run, chat with replies, reactions, an image,
a voice note, an agent gist and a vote Claude suggested, a "Proposal to the tribe", tasks, docs, files, the vision,
Workshop items and the Secretary. Then it captures desktop (1440x900 @2x) and phone (390x844 @3x) screens, plus the
offline demo tribe, and the website's social card from the Dashboard shot.

Output: docs/screenshots/readme-*.png (256-colour PNGs, 1600px wide for desktop, 780px for phones) and
site/assets/og-image.png (1200x630).

Usage: python3 scripts/readme-shots.py [--only dashboard,chat,...] [--keep]   (npm run readme-shots; npm run dev:shots runs it too)
Needs: Python Playwright + Pillow, Google Chrome at /usr/bin/google-chrome, Node 20+, git.
"""
import base64, json, os, shutil, subprocess, sys, tempfile, threading, time, traceback, urllib.request, urllib.error, struct, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, OLLAMA = 4931 + OFF, 4932 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
OG = ROOT / "site" / "assets" / "og-image.png"
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
GH_TOKEN = "ghp_" + "Rd3m" * 9
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
PHONE_SCALE = 3
# Hooks for scripts/site-shots.py: extra Chrome flags, and a call at the end of run() with its locals.
CHROME_ARGS, AFTER = [], None
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
done, failed = [], []
SRV = {}


# ---------------------------------------------------------------- helpers
def api(path, method="GET", body=None, tok=None, pid=None):
    h = {"Content-Type": "application/json"}
    if tok: h["Authorization"] = "Bearer " + tok
    if pid: h["X-Project"] = pid
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=60) as r:
            raw = r.read()
            try: return json.loads(raw or b"{}")
            except ValueError: return raw.decode()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:300]!r}")

def upload(name, data, tok, pid=None, mime="application/octet-stream"):
    """A file in Files (POST /api/uploads, raw body): scope project when pid is given, else only you."""
    h = {"Authorization": "Bearer " + tok, "Content-Type": mime}
    if pid: h["X-Project"] = pid
    q = f"?name={urllib.request.quote(name)}&scope={'project' if pid else 'me'}"
    req = urllib.request.Request(BASE + "/api/uploads" + q, method="POST", data=data, headers=h)
    with opener.open(req, timeout=60) as r: return json.loads(r.read() or b"{}")

def mcp(tok, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + tok})
    with opener.open(req, timeout=60) as r: d = json.loads(r.read())["result"]
    if d.get("isError"): print(f"  ! mcp {tool}: {d['content'][0]['text'][:160]}")
    return d["content"][0]["text"]

def wait_until(fn, timeout=25, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.25)
    print(f"  ! timed out waiting for {what}")
    return False

def git(cwd, *a):
    """git as a person (a[0]); retries while the server's own commits hold the index lock."""
    for i in range(20):
        r = subprocess.run(["git", "-C", str(cwd), "-c", "user.name=" + a[0], "-c", f"user.email={a[0].lower()}@tribe.local", *a[1:]], capture_output=True, text=True)
        if r.returncode == 0: return r.stdout
        if "lock" not in r.stderr or i == 19: raise RuntimeError(f"git {' '.join(a[1:])}: {r.stderr.strip()}")
        time.sleep(0.4)

def b64(b): return base64.b64encode(b).decode()

def compress(src, dst_png, width):
    """2x/3x capture -> resized, 256-colour PNG (the flat UI quantizes well)."""
    from PIL import Image
    im = Image.open(src).convert("RGB")
    if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst_png, optimize=True)
    return im

def settings_js(name, color, tok, pid):
    return (f"try {{ if (location.port === '{PORT}') {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'campfire', themeDark:'campfire', "
            f"server:{{url:'{BASE}', token:'{tok}'}}, checklist:{{setup:true, tour:true}}, tour:{{done:true}}, hintDismissed:true}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.iosHint', '1'); }} }} catch (e) {{}}")

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

TMP = Path(tempfile.mkdtemp(prefix="readme-shots-"))
def shoot(page, name, prep=None, tries=2):
    """Capture one screen (one retry after Escape). Failures are reported, not fatal, so one broken screen doesn't stop the rest."""
    if ONLY and name not in ONLY: return
    for attempt in range(tries):
        try:
            if prep: prep()
            page.evaluate("document.querySelectorAll('.toast, .toasts > *, #toast').forEach(t => t.remove())")
            page.mouse.move(2, page.viewport_size["height"] - 2)
            page.wait_for_timeout(450)
            raw = TMP / f"{name}.png"; page.screenshot(path=str(raw))
            phone = page.viewport_size["width"] < 600
            compress(raw, SHOTS / f"readme-{name}.png", 780 if phone else 1600)
            done.append(name); print(f"  shot {name}")
            return raw
        except Exception as e:
            if os.environ.get("SHOTS_DEBUG"):
                try: page.screenshot(path=os.path.join(os.environ["SHOTS_DEBUG"], f"fail-{name}.png"))
                except Exception: pass
            if attempt + 1 < tries:
                print(f"  (retrying {name}: {str(e).splitlines()[0]})")
                try: page.keyboard.press("Escape"); page.wait_for_timeout(800)
                except Exception: pass
                continue
            failed.append(name); print(f"  ! {name}: {e}"); traceback.print_exc(limit=2)


def make_og(shot_png):
    """site/assets/og-image.png (1200x630): the wordmark, the pitch and a real screenshot (the Dashboard), flat."""
    a = (ROOT / "site" / "assets").as_uri()
    html = f"""<!doctype html><meta charset=utf-8><style>
    @font-face {{ font-family: Inter; font-weight: 400; src: url({a}/fonts/Inter-Regular.woff); }}
    @font-face {{ font-family: 'Inter Display'; font-weight: 800; src: url({a}/fonts/InterDisplay-ExtraBold.woff); }}
    body {{ margin: 0; width: 1200px; height: 630px; background: #1D2021; font-family: Inter; overflow: hidden; position: relative; }}
    .l {{ position: absolute; left: 64px; top: 72px; width: 470px; }}
    .wm {{ height: 40px; }} h1 {{ font: 800 50px/1.06 'Inter Display'; letter-spacing: -0.025em; color: #FFFFFF; margin: 44px 0 0; }}
    h1 span {{ color: #A8A29E; }} p {{ font: 400 15px/1 ui-monospace, monospace; color: #F26B1D; letter-spacing: .06em; text-transform: uppercase; position: absolute; left: 64px; bottom: 64px; margin: 0; }}
    .f {{ position: absolute; left: 590px; top: 72px; width: 900px; border: 1px solid #3C3836; border-radius: 16px; overflow: hidden; background: #282828; }}
    .f img {{ display: block; width: 100%; }}
    </style><div class=l><img class=wm src="{a}/brand/wordmark.svg"><h1>Build one app together with friends. <span>Each with your own Claude.</span></h1></div>
    <p>Open source · MIT · works with Claude Code</p>
    <div class=f><img src="{Path(shot_png).as_uri()}"></div>"""
    f = TMP / "og.html"; f.write_text(html)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server", "--allow-file-access-from-files"])
        pg = b.new_page(viewport={"width": 1200, "height": 630}); pg.goto(f.as_uri()); pg.wait_for_timeout(600)
        raw = TMP / "og.png"; pg.screenshot(path=str(raw)); b.close()
    from PIL import Image
    Image.open(raw).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OG, optimize=True)
    print(f"  og-image.png {OG.stat().st_size // 1024} KB")


# ---------------------------------------------------------------- mock GitHub (POST /user/repos -> local bare repo)
GH = {"root": tempfile.mkdtemp(prefix="readme-gh-")}
class GitHubMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path != "/user/repos": return self.reply(404, {"message": "Not Found"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "orion/" + body["name"], "private": True, "clone_url": bare, "html_url": "https://github.com/orion/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


# ---------------------------------------------------------------- mock Ollama: canned answers that read well on screen
class OllamaMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.reply({"models": [{"name": "qwen3:8b"}]} if self.path == "/api/tags" else {})
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        p, out = body.get("prompt", ""), ""
        if "project vision" in (body.get("system") or ""):
            out = ("Pixel Quest is a tiny co-op platformer you can finish in ten minutes, made by three friends and their Claudes.\n\n"
                   "## Who it's for\nFriends on a couch or on their phones. No tutorial: the first level teaches by itself.\n\n"
                   "## What makes it fun\n- A floaty double jump that forgives you\n- Slimes that hop in rhythm\n\n"
                   "## Done for v1\n- Three short levels: cave, forest, sky\n- Checkpoints and a title screen\n- Plays on a phone\n\n"
                   "## Out of scope\n- Online multiplayer, a level editor")
        elif "You are Flint" in (body.get("system") or ""):
            out = "Maya's double jump is in review and Jay finished the slimes. The title screen with the logo is still open: a good next pick."
        elif "Summarize what changed for teammates" in p:
            out = "- The second jump falls slower, so it feels floaty\n- Coyote time stays at 80 ms" if "double jump" in p else "- The README now opens with a screenshot of the first playable"
        elif "TL;DR" in p: out = "Two worlds: a dark cave with a slime boss that splits, then a windy sky level."
        elif "Question from" in p: out = "Maya is tuning the double jump; Jay drew the slimes and the checkpoint flag."
        elif "fit the vision" in p: out = "FITS\nIt keeps Pixel Quest small and friendly."
        self.reply({"model": body.get("model"), "response": out, "done": True})
    def reply(self, data):
        raw = json.dumps(data).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


def png(w, h, rows):
    """Tiny PNG writer: rows is a function (x, y) -> (r, g, b)."""
    raw = b"".join(b"\x00" + b"".join(bytes(rows(x, y)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

def run_cycle():
    """A 4-frame 16px 'hero run' sprite sheet (64x16), flat colours."""
    body, skin, leg, bg = (242, 107, 29), (248, 250, 252), (108, 124, 255), (18, 21, 26)
    def px(x, y):
        f, lx = x // 16, x % 16
        if 4 <= lx <= 11 and 2 <= y <= 5: return skin
        if 4 <= lx <= 11 and 6 <= y <= 10: return body
        step = [0, 2, 0, -2][f]
        if y >= 11 and (lx in (5 + step, 6 + step) or lx in (9 - step, 10 - step)): return leg
        return bg
    return png(64, 16, px)

def coin_wav():
    """A short 'coin' blip (WAV, 8-bit mono) for the Files center."""
    import math
    rate, n = 8000, 2400
    data = bytes(int(128 + 60 * math.sin(2 * math.pi * (988 if i < 700 else 1319) * i / rate) * (1 - i / n)) for i in range(n))
    return b"RIFF" + struct.pack("<I", 36 + n) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate, 1, 8) + b"data" + struct.pack("<I", n) + data

def tiny_pdf(title):
    """A one-page PDF with a title line, so Files shows a real PDF."""
    stream = f"BT /F1 28 Tf 72 720 Td ({title}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>stream\n" % len(stream) + stream + b"\nendstream", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1): offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    x = len(out); out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    return out + b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)


# ---------------------------------------------------------------- the server
def start_server(srv_dir):
    log = open(os.path.join(srv_dir, "server.log"), "a")
    SRV["p"] = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", srv_dir, "--name", "Campfire Crew", "--ollama", f"http://localhost:{OLLAMA}"],
                                stdout=log, stderr=subprocess.STDOUT,
                                env={**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{SRV['gh']}", "TRIBE_NO_GH": "1", "TRIBE_REPO_POLL_MS": "1000", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    wait_until(lambda: api("/health").get("ok"), what="server")

def stop_server():
    p = SRV.get("p")
    if p and p.poll() is None:
        p.terminate()
        try: p.wait(10)
        except Exception: p.kill()


# ---------------------------------------------------------------- the run
def main():
    keep = "--keep" in sys.argv
    srv_dir = tempfile.mkdtemp(prefix="readme-tribe-")
    work = Path(tempfile.mkdtemp(prefix="readme-src-"))
    gh = ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    oll = ThreadingHTTPServer(("127.0.0.1", OLLAMA), OllamaMock); threading.Thread(target=oll.serve_forever, daemon=True).start()
    SRV["gh"] = gh.server_address[1]
    SHOTS.mkdir(parents=True, exist_ok=True)
    try:
        start_server(srv_dir)
        run(srv_dir, work)
    finally:
        stop_server(); oll.shutdown(); gh.shutdown()
        if keep: print("kept", srv_dir, work, TMP)
        else:
            for d in (srv_dir, work, TMP, GH["root"]): shutil.rmtree(d, ignore_errors=True)
    print(f"\n{len(done)} screenshots: {', '.join(done)}")
    if failed: print(f"FAILED: {', '.join(failed)}"); sys.exit(1)


def run(srv_dir, work):
    # ---------- people + the one-click project ----------
    boot = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}); O, oid = boot["token"], boot["member"]["id"]
    api("/me/git", "PUT", {"githubToken": GH_TOKEN}, O)
    fl = api("/flow/create", "POST", {"name": "Pixel Quest", "emoji": "🕹️"}, O)["flow"]; pid = fl["project"]
    wait_until(lambda: all(s["s"] == "ok" for s in api("/flow", tok=O, pid=pid)["flow"]["steps"].values()), what="flow steps")
    code = api("/flow", tok=O, pid=pid)["flow"]["invite"]["code"]
    j = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"}); M, mid = j["token"], j["member"]["id"]
    j = api("/join", "POST", {"code": code, "name": "Jay", "color": "#38C6B1"}); J, jid = j["token"], j["member"]["id"]
    api("/flow/roles/frontend", "POST", {}, M, pid)
    api("/flow/roles/design", "POST", {}, J, pid)
    note = "# First playable\n- Player can double jump\n- Draw the hero sprite and coin art\n- Write tests for jumping\n- Checkpoint flag before the last platform\n# Online\n- Save high scores on the server\n"
    api("/flow/notes", "POST", {"name": "ideas.md", "data": b64(note.encode())}, O, pid)

    # The repo gets the playable Pixel Quest starter, so Preview and the repo show a real game
    ws = Path(srv_dir, "workspaces", pid)
    wait_until(lambda: (ws / ".git").exists() and "Initial commit" in git(ws, "Orion", "log", "--format=%s"), what="workspace repo")
    tpl = ROOT / "templates" / "starter-game"
    shutil.copy(tpl / "index.html", ws / "index.html"); shutil.copytree(tpl / "src", ws / "src", dirs_exist_ok=True)
    git(ws, "Orion", "add", "-A"); git(ws, "Orion", "commit", "-q", "-m", "Add the Pixel Quest starter (no build step)")
    git(ws, "Orion", "remote", "set-url", "origin", "https://github.com/orion/pixel-quest.git")   # the mock's bare repo path would show in the UI

    # A second project from a folder on disk: Lantern Run (templates/lantern-run), so the rail has more than one circle
    lantern = work / "lantern-run"; shutil.copytree(ROOT / "templates" / "lantern-run", lantern)
    subprocess.run(["git", "init", "-q", "-b", "main", str(lantern)], check=True)
    git(lantern, "Orion", "add", "-A"); git(lantern, "Orion", "commit", "-q", "-m", "Lantern Run starter")
    api("/projects", "POST", {"path": str(lantern), "name": "Lantern Run", "emoji": "🏮"}, O)

    # Each person's Claude, named the way people say it ("Orion's Claude"): the server names a new agent
    # "Claude · <owner>"; rename it in members.json while the server is stopped, then start it again.
    oa = api("/agents", "POST", {}, O, pid)["token"]
    ma = api("/agents", "POST", {}, M, pid)["token"]
    stop_server()
    mf = Path(srv_dir, ".tribe", "members.json"); mem = json.loads(mf.read_text())
    for m in mem:
        if m.get("role") == "agent" and m.get("name", "").startswith("Claude · "): m["name"] = m["name"][len("Claude · "):] + "'s Claude"
    mf.write_text(json.dumps(mem, indent=2))
    start_server(srv_dir)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server", *CHROME_ARGS])
        def open_as(name, color, tok, mobile=False, project=None):
            if mobile: ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=PHONE_SCALE, is_mobile=True, has_touch=True, user_agent=IPHONE_UA, timezone_id="UTC", locale="en-US")
            else: ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, timezone_id="UTC", locale="en-US")
            ctx.add_init_script(settings_js(name, color, tok, project or pid))
            pg = ctx.new_page(); pg.goto(BASE + "/?skipIntro=1"); wait_text(pg, "#sync-status", "connected")
            if pg.locator("#install-sheet:not(.hidden) #ins-later").count(): pg.click("#ins-later")
            return pg
        def chat(pg): pg.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')"); return pg
        def close_overlays(pg):
            pg.keyboard.press("Escape"); pg.wait_for_timeout(150); pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
        def top(pg): pg.evaluate("scrollTo(0, 0); document.querySelectorAll('.main, #main').forEach(m => m.scrollTop = 0)")
        host = open_as("Orion", "#F26B1D", O)
        friend = open_as("Maya", "#6C7CFF", M)   # keeps Maya online
        jay = open_as("Jay", "#38C6B1", J)        # and Jay

        # ---------- Create project dialog + the getting-started card ----------
        def prep_create():
            host.click("#pj-plus"); host.click(".np-setup [data-ns='tpl:game']"); host.wait_for_selector("#np-input"); host.fill("#np-input", "Night Market")
        shoot(host, "create", prep_create)
        close_overlays(host)
        def prep_kickoff():   # the card can take a moment after the dialog closes; reload once if it doesn't show
            chat(host)
            try: host.wait_for_selector("#flow-kick .fk-notechip", timeout=15000)
            except Exception: host.reload(); wait_text(host, "#sync-status", "connected"); chat(host); host.wait_for_selector("#flow-kick .fk-notechip", timeout=15000)
            host.evaluate("document.querySelector('#flow-kick').scrollIntoView({block: 'start'})")
        shoot(host, "kickoff", prep_kickoff)

        # ---------- the vision assistant (before the vision exists) ----------
        def prep_vision():
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check [data-ck=vision]", timeout=15000)
            host.click("#pj-check [data-ck=vision]"); host.wait_for_selector(".av-wrap [data-q=what]")
            host.fill(".av-wrap [data-q=what]", "Pixel Quest: a tiny co-op platformer you can finish in ten minutes")
            host.fill(".av-wrap [data-q=who]", "Friends on a couch or on their phones, no tutorial needed")
            host.click("#av-go"); host.wait_for_function("document.querySelector('#pj-vtext').value.includes('Done for v1')", timeout=20000); host.wait_for_timeout(600)
        shoot(host, "vision", prep_vision)
        close_overlays(host)
        try: host.click(".av-wrap [data-close]", timeout=1500)
        except Exception: pass
        api("/vision", "PUT", {"text": "# Pixel Quest\n\nA tiny co-op platformer three friends build together over a weekend.\n\n## Who it's for\nFriends on a couch or on their phones. No tutorial: the first level teaches by itself.\n\n"
                                       "## Done for v1\n- Three short levels: cave, forest, sky\n- Double jump and checkpoints\n- A title screen and a win screen\n- Plays on a phone\n\n## Out of scope\n- Online multiplayer, a level editor"}, O, pid)
        api(f"/projects/{pid}", "PATCH", {"bio": "A cozy co-op platformer, made by three friends and their Claudes"}, O)

        # ---------- Start the flow, then a lively chat ----------
        api("/flow/start", "POST", {}, O, pid)
        # Maya's commit on the repo (her person panel; becomes an auto-gist)
        tun = ws / "src" / "data" / "tuning.js"; tun.write_text(tun.read_text() + "\n// floatier fall for the double jump\n")
        git(ws, "Maya", "commit", "-q", "-m", "Tune the double jump", "--", "src/data/tuning.js"); api("/repo/refresh", "POST", {}, O, pid)
        send = lambda tok, text, **kw: api("/chat/general/send", "POST", {"text": text, **kw}, tok, pid)["message"]
        react = lambda tok, mid_, e: api("/chat/general/react", "POST", {"id": mid_, "emoji": e}, tok, pid)
        m1 = send(M, "Morning! I'm on the double jump today 🦘")
        send(O, "Nice. I'll sketch the cave level after lunch")
        react(O, m1["id"], "🔥"); react(J, m1["id"], "🔥")
        mcp(ma, "share_prompt", {"summary": "Make the double jump feel floatier, keep coyote time"})
        mcp(ma, "report_context", {"used_pct": 41, "focus": "tuning jump gravity in src/systems/movement.js"})
        mcp(ma, "claim_file", {"path": "src/systems/movement.js", "note": "double jump"})
        plan = api("/flow", tok=O, pid=pid)["flow"]["plan"] or {"milestones": []}
        jump = next((i for m in plan["milestones"] for i in m["items"] if "double jump" in i["text"].lower()), {})
        mcp(ma, "post_gist", {"kind": "progress", "title": "Double jump feels floaty now", "bullets": ["Lower gravity on the way down", "Coyote time 80 ms", "Next: tune the second jump height"],
                              "files": ["src/systems/movement.js", "src/data/tuning.js"], **({"task": jump["task"]} if jump.get("task") else {})})
        # an image: a real frame of the running game (through a signed preview link); it also feeds Visuals and Files
        pv = api("/preview/token", "POST", {}, O, pid)["path"]
        g = b.new_page(viewport={"width": 640, "height": 360}); g.goto(BASE + pv); g.wait_for_timeout(1500)
        frame = g.screenshot(); g.close()
        api("/visuals", "POST", {"screen": "level-1", "png_base64": b64(frame)}, O, pid)
        (ws / "screenshot.png").write_bytes(frame)
        readme = (ws / "README.md").read_text(); first, _, rest = readme.partition("\n")
        (ws / "README.md").write_text(f"{first}\n\n![Pixel Quest](screenshot.png)\n{rest}")
        git(ws, "Orion", "add", "screenshot.png", "README.md"); git(ws, "Orion", "commit", "-q", "-m", "README: a screenshot of the first playable", "--", "screenshot.png", "README.md")
        im = api("/chat/general/image", "POST", {"data": b64(frame), "mime": "image/png", "text": "First playable on my laptop 🎮"}, J, pid)["message"]
        react(M, im["id"], "❤️"); react(O, im["id"], "👍")
        send(O, "The slimes look great. Can they hop?", replyTo=im["id"])
        wave = [2, 5, 8, 6, 9, 4, 7, 3, 6, 8, 5, 2, 4, 7, 9, 6, 3, 5, 8, 4]
        api("/chat/general/voice", "POST", {"data": b64(b"\x1aE\xdf\xa3webm" * 40), "mime": "audio/webm", "dur": 9, "wave": wave,
                                           "transcript": "Slimes hop every two seconds now, and the checkpoint flag sits right before the last platform"}, J, pid)
        mcp(oa, "post_gist", {"kind": "progress", "title": "Checkpoint flag works", "bullets": ["Touch the flag to save your respawn", "A test dies after the flag and respawns there"],
                              "files": ["src/systems/checkpoint.js", "test/checkpoint.test.js"]})
        mcp(oa, "suggest_vote", {"question": "Add a speedrun timer?", "why": "Playtesters keep racing each other", "options": ["Yes", "Later", "No"]})
        msgs = api("/chat/general?limit=80", tok=O, pid=pid)["messages"]
        v = next((x for x in reversed(msgs) if x.get("vote") and "speedrun" in (x["vote"].get("q") or "")), None)
        if v:
            api(f"/chat/general/vote/{v['id']}/cast", "POST", {"option": "o1"}, M, pid)
            api(f"/chat/general/vote/{v['id']}/cast", "POST", {"option": "o2"}, J, pid)
        send(M, "Proposing the level select, vote when you can 🙏")
        prop = api("/chat/general/vote", "POST", {"pitch": {"title": "Level select screen", "body": "So playtesters can jump straight to the cave.\n- [ ] Level select UI\n- [ ] Remember unlocked levels"}}, M, pid)["message"]
        api(f"/chat/general/vote/{prop['id']}/cast", "POST", {"option": "yes"}, M, pid)

        # tasks, docs and files
        for t in ["Coin pickup sound", "Slime boss: splits when hit", "Title screen with the logo"]:
            api("/tasks", "POST", {"title": t}, O, pid)
        moves = {"Player can double jump": "review", "Draw the hero sprite and coin art": "doing", "Checkpoint flag before the last platform": "done", "Coin pickup sound": "done", "Write tests for jumping": "doing"}
        for t in api("/tasks", tok=O, pid=pid)["tasks"]:
            if t["title"] in moves: api(f"/tasks/{t['id']}", "PATCH", {"status": moves[t["title"]]}, O, pid)
        api("/docs", "POST", {"title": "Level ideas", "body": "## Cave\nSlimes in the dark and **torches you can carry**. The light is the clock.\n\n- [x] Slimes that hop every two seconds\n- [ ] A boss at the end that splits when hit\n- [ ] Torches that burn out\n\n"
                              "## Forest\n- Rope bridges and falling leaves\n- A hidden coin room behind the waterfall\n\n## Sky\n> Wind gusts push you sideways: time your double jump.\n\n- Moving platforms\n- The flag on the last cloud\n"}, O, pid)
        api("/docs", "POST", {"title": "Art style", "body": "## Palette\n16px sprites, flat colours, no outlines. **Ember** for the hero, **teal** for pickups.\n\n## Sprites\n- Hero: 4-frame run, 2-frame jump\n- Slimes: squash on landing\n"}, J, pid)
        api("/docs", "POST", {"title": "Playtest notes", "body": "## Saturday\n- Everyone found the double jump within 30 seconds\n- The cave is too dark on phones\n- Two people asked for a speedrun timer\n"}, M, pid)
        upload("level-1.png", frame, O, pid, "image/png")
        upload("hero-run.png", run_cycle(), J, pid, "image/png")
        upload("coin.wav", coin_wav(), J, pid, "audio/wav")
        upload("pitch-deck.pdf", tiny_pdf("Pixel Quest: the pitch"), O, pid, "application/pdf")
        note_md = ("Boss ideas\n## The Slime King\nA slime that **splits into three** when hit, then the three merge back.\n\n"
                   "- [x] Squash on landing\n- [x] Splits when hit\n- [ ] Merge back after 5 seconds\n\n## Music\n> Slow and heavy, like the cave is breathing.\n\n"
                   "1. Low drum loop\n2. Add a choir when it splits")
        api("/scratch", "PUT", {"notes": [{"text": note_md}]}, O)
        api("/scratch", "PUT", {"notes": [{"text": note_md}]}, M)

        # ---------- Dashboard ----------
        def prep_dashboard():
            close_overlays(host); host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-sec-repo", timeout=15000); host.wait_for_timeout(1800); top(host)
        SRV["dash"] = shoot(host, "dashboard", prep_dashboard)

        # ---------- Messages (desktop) ----------
        for attempt in range(3):   # the vote cards render once the chat history and votes are in
            host.reload(); wait_text(host, "#sync-status", "connected"); chat(host)
            try: host.wait_for_selector("#chat-list .vt", state="attached", timeout=15000); break
            except Exception:
                if attempt == 2: raise
        bottom = lambda pg: pg.evaluate("document.querySelector('#chat-list').scrollTop = 1e9")
        def prep_chat():
            v_el = "#chat-list .vt"
            host.evaluate(f"(() => {{ const v = [...document.querySelectorAll('{v_el}')].find(e => e.innerText.includes('speedrun')); const l = document.querySelector('#chat-list'); if (v) {{ v.closest('[data-id]').scrollIntoView({{block: 'end'}}); l.scrollTop += 24; }} }})()")
        shoot(host, "chat", prep_chat)
        def prep_plus():
            bottom(host); host.click(".cx-plus"); host.wait_for_selector(".pl-menu [data-pl]")
        shoot(host, "plus", prep_plus)
        close_overlays(host)
        shoot(host, "proposal", lambda: bottom(host))

        # ---------- profile menu, person panel, tasks, files, the doc editor, plan ----------
        def prep_profile():
            bottom(host); host.click("#pf-btn"); host.wait_for_selector("#pf-menu .pf-item, .pf-menu .pf-item")
        shoot(host, "profile", prep_profile)
        close_overlays(host)
        def prep_person():
            chat(host); bottom(host); host.evaluate(f"TribePeople.open('{mid}')"); host.wait_for_selector("#person-panel:not(.hidden) .pp-it", timeout=15000)
        shoot(host, "person", prep_person)
        host.evaluate("TribePeople.close()")
        def prep_tasks():
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#board .task"); host.wait_for_timeout(600); top(host)
        shoot(host, "tasks", prep_tasks)
        def prep_files():   # the Files center: your notes, project docs and uploaded files together
            host.evaluate("TribeHub.open('docs')"); host.wait_for_selector("#hub-docs [data-up]", timeout=15000); host.wait_for_timeout(1500); top(host)
        shoot(host, "files", prep_files)
        def prep_doc():   # the editor with the room panel closed: outline, toolbar and a centered page
            host.evaluate("TribeApp.show('docs')")
            if host.locator("#panel-close").is_visible(): host.click("#panel-close")
            host.wait_for_function("window.TribeDocs && TribeDocs.list().some(d => d.title === 'Level ideas')", timeout=10000)
            host.evaluate("TribeDocs.open(TribeDocs.list().find(d => d.title === 'Level ideas').slug)")
            host.wait_for_function("document.querySelector('#doc-title') && document.querySelector('#doc-title').value === 'Level ideas'", timeout=10000)
            host.wait_for_timeout(1200)
        shoot(host, "doc", prep_doc)
        try: host.click("#dl-close", timeout=1500)
        except Exception: close_overlays(host)
        if host.evaluate("document.body.classList.contains('panel-off')"): host.click("#panel-toggle")   # the room panel back for the rest
        def prep_plan():
            host.reload(); wait_text(host, "#sync-status", "connected"); chat(host); host.wait_for_timeout(500)   # a fresh page: the doc editor can leave Updates half-drawn
            host.evaluate("TribeFlow.openUpdates()"); host.wait_for_selector("#view-flow-updates:not(.hidden) #plan-hero .pi")
        shoot(host, "plan", prep_plan)

        # ---------- Flint, in the room panel ----------
        def prep_flint():
            chat(host); bottom(host)
            host.wait_for_selector("#flint #fl-input", state="visible", timeout=10000)
            for q in ["What's happening?", "task Pause menu with resume and quit"]:
                n = host.locator("#flint .fl-msg.fl").count()
                host.fill("#fl-input", q); host.press("#fl-input", "Enter")
                host.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n", arg=n, timeout=15000)
                host.wait_for_timeout(900)
        shoot(host, "flint", prep_flint)
        try: host.evaluate("document.querySelector('#fl-fold') && document.querySelector('#flint:not(.folded)') && document.querySelector('#fl-fold').click()")
        except Exception: pass

        # ---------- preview the app in the right panel ----------
        def prep_preview():
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-sec-repo", timeout=15000); top(host); host.evaluate("TribePreview.open()"); host.wait_for_timeout(2500)
        shoot(host, "preview", prep_preview)
        try: host.evaluate("TribePreview.close()")
        except Exception: pass

        # ---------- phone (Maya) ----------
        ph = open_as("Maya", "#6C7CFF", M, mobile=True)
        def prep_phone_chat():
            chat(ph); ph.wait_for_selector("#chat-list .vt"); ph.wait_for_timeout(500)
            ph.evaluate(f"document.querySelector(\"#chat-list [data-id='{im['id']}']\").scrollIntoView({{block: 'start'}})")
        shoot(ph, "phone-chat", prep_phone_chat)
        def prep_phone_plus():
            chat(ph); bottom(ph); ph.click("#m2-plus"); ph.wait_for_selector(".pl-pop.sheet .pl-menu")
        shoot(ph, "phone-plus", prep_phone_plus)
        close_overlays(ph)
        def prep_phone_dashboard():
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_selector("#pj-sec-repo", timeout=15000); ph.wait_for_timeout(1200); top(ph)
        shoot(ph, "phone-dashboard", prep_phone_dashboard)
        def prep_phone_panel():
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_timeout(300); ph.click("#menu-btn"); ph.wait_for_function("document.body.classList.contains('drawer-open')")
        shoot(ph, "phone-panel", prep_phone_panel)
        close_overlays(ph); ph.evaluate("document.body.classList.remove('drawer-open')")
        def prep_phone_files():
            ph.evaluate("TribeHub.open('docs')"); ph.wait_for_selector("#hub-docs [data-up]", timeout=15000); ph.wait_for_timeout(1500); top(ph)
        shoot(ph, "phone-files", prep_phone_files)
        def prep_phone_doc():   # the phone editor (Google Docs mobile): a personal note, full screen
            ph.evaluate("TribeHub.open('docs')"); ph.wait_for_selector("#hub-docs [data-mynote]", timeout=15000)
            ph.click("#hub-docs [data-mynote]:has-text('Boss ideas')")
            ph.wait_for_selector("#note-ed.gd-wrap .gd-head #note-done", timeout=10000); ph.wait_for_timeout(1000)
            ph.evaluate("() => { const ta = document.querySelector('#note-text'); if (ta && ta.focus) { ta.focus(); const i = ta.value.indexOf('three'); ta.setSelectionRange(i, i); ta.dispatchEvent(new Event('keyup')); } }")
            ph.wait_for_timeout(600)
        shoot(ph, "phone-doc", prep_phone_doc)
        try: ph.click("#note-done", timeout=2000)
        except Exception: close_overlays(ph)
        def prep_phone_messages():
            ph.evaluate("TribeHub.open('home')"); ph.wait_for_selector("#m2-homebar [data-hb=msgs]", timeout=10000); ph.wait_for_timeout(400)
            ph.click("#m2-homebar [data-hb=msgs]"); ph.wait_for_timeout(900)
        shoot(ph, "phone-messages", prep_phone_messages)
        ph.context.close()

        # ---------- Workshop ----------
        api("/workshop/items", "POST", {"kind": "asset", "title": "Hero run cycle", "summary": "Four-frame run cycle, 16px, flat colours.", "tags": ["sprite", "pixel-art"], "license": "CC0-1.0",
                                         "files": [{"path": "hero-run.png", "data": b64(run_cycle())}]}, O)
        api("/workshop/items", "POST", {"kind": "script", "title": "Double jump", "summary": "Second jump with coyote time and a floaty fall.", "tags": ["platformer", "movement"], "license": "MIT",
                                         "from": {"project": pid, "paths": ["src/systems/movement.js"]}}, M, pid)
        skill = "---\nname: Level design\ndescription: Lay out platformer levels that teach one idea at a time, with checkpoints every 30 seconds.\n---\n\n# Level design\n\n1. One new idea per screen.\n2. Show it safely, then test it.\n3. Checkpoint every 30 seconds of play.\n"
        api("/workshop/items", "POST", {"kind": "skill", "title": "Level design", "license": "MIT", "tags": ["claude-code", "games"], "files": [{"path": "SKILL.md", "data": b64(skill.encode())}]}, J, pid)
        api("/workshop/items", "POST", {"kind": "recipe", "title": "Checkpoint flag", "summary": "Respawn at the last flag you touched. Check: a test that dies after the flag.", "tags": ["platformer"], "license": "MIT",
                                         "files": [{"path": "RECIPE.md", "data": b64(b"# Checkpoint flag\n\nTouch a flag to save your respawn point.\n")}]}, O)
        def prep_ws():
            host.evaluate("TribeWorkshop.open('library')"); host.wait_for_selector("#workshop:not(.hidden) .ws-item", timeout=15000); host.wait_for_timeout(800)
        shoot(host, "workshop", prep_ws)
        host.evaluate("TribeWorkshop.close()")

        # ---------- Agents Hub + Secretary ----------
        api("/agents", "POST", {"kind": "claude-desktop", "label": "Claude Desktop"}, O, pid)
        api("/agents", "POST", {"kind": "mcp", "label": "Codex"}, J, pid)
        api("/secretary/config", "PUT", {"enabled": True, "model": "qwen3:8b"}, O, pid)
        api("/chat/general", "POST", {"text": "Let's go with campfires as save points"}, O, pid)
        api("/chat/general", "POST", {"text": "@secretary research best tile map editor for pixel art"}, J, pid)
        api("/chat/general", "POST", {"text": "@secretary note the boss music should be slow"}, M, pid)
        rq = api("/secretary/requests", "POST", {"question": "What is a good way to save game state in the browser?"}, O, pid)["request"]
        mcp(ma, "secretary_file", {"request_id": rq["id"], "findings": ["localStorage holds about 5 MB: fine for save slots", "IndexedDB for bigger worlds"], "sources": ["https://developer.mozilla.org/docs/Web/API/IndexedDB_API"]})
        api("/secretary/tick", "POST", {}, O, pid)
        def prep_agents():
            host.evaluate("TribeAgentsHub.open()"); host.wait_for_selector("#view-agents-hub:not(.hidden) .ah-card"); host.wait_for_timeout(600); top(host)
        shoot(host, "agents", prep_agents)
        def prep_sec():
            host.evaluate("TribeSecretary.open()"); host.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li", timeout=15000); top(host)
        shoot(host, "secretary", prep_sec)
        try: host.evaluate("TribeSecretary.close && TribeSecretary.close()")
        except Exception: pass

        # ---------- Home (your command center across projects) ----------
        def prep_home():
            host.evaluate("TribeHub.open('home')"); host.wait_for_selector("#view-hub:not(.hidden) #hub-hero", timeout=15000)
            host.wait_for_timeout(800); top(host)
        shoot(host, "home", prep_home)

        # ---------- the offline demo tribe (a fresh browser, no server involved once it starts) ----------
        def prep_demo():
            dctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, timezone_id="UTC", locale="en-US")
            dctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'campfire', tour:{{done:true}}, checklist:{{setup:true, tour:true}}, hintDismissed:true}})); }} catch (e) {{}}")
            dp = dctx.new_page(); SRV["demo"] = dp
            dp.goto(BASE + "/?skipIntro=1"); dp.wait_for_function("window.TribeOffline && window.TribeHub", timeout=15000)
            if not dp.evaluate("document.body.dataset.view === 'hub'"): dp.evaluate("TribeHub.open('home')")
            dp.wait_for_selector("#hub-demo", state="visible", timeout=10000); dp.click("#hub-demo")
            dp.wait_for_function("TribeOffline.active() && window.TribeClient && TribeClient.connected()", timeout=10000)
            dp.wait_for_function("(TribeClient.state().projects || []).some(p => p.name === 'Lantern Run')", timeout=8000)
            dp.evaluate("TribeApp.show('chat')"); dp.wait_for_timeout(600)
            dp.fill("#chat-input", "@claude can you add a pause menu?"); dp.press("#chat-input", "Enter"); dp.wait_for_timeout(3500)
            return dp
        if not ONLY or "demo" in ONLY:
            try:
                dp = prep_demo(); shoot(dp, "demo")
                dp.context.close()
            except Exception as e:
                failed.append("demo"); print(f"  ! demo: {e}")
        if AFTER: AFTER(dict(locals()))
    if SRV.get("dash") and (not ONLY or "og" in ONLY): make_og(SRV["dash"])


if __name__ == "__main__":
    main()
