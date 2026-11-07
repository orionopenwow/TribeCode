"""README and website screenshots of the real app, with realistic data.

Starts a throwaway tribe server (temp --dir, mock Ollama, mock GitHub), seeds it through the API and MCP
(a host, two friends, their Claudes, the Pixel Quest project made with one click and filled from
templates/starter-game, a second project from a folder, chat with replies, reactions, an image, a voice
note, a vote Claude suggested, a "Proposal to the tribe", gists, tasks, docs, Workshop items, the
Secretary), then captures desktop (1440x900 @2x) and phone (390x844 @2x) screens.

Output: docs/screenshots/readme-*.png (quantized PNGs, ~1600px wide for desktop) and the website copies
in site/assets/shots/*.webp (site/ is published at /about/ by .github/workflows/pages.yml).

Usage: python3 scripts/readme-shots.py [--only chat,plus,...] [--keep]   (npm run readme-shots)
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
SITE_SHOTS = ROOT / "site" / "assets" / "shots"
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
GH_TOKEN = "ghp_" + "Rd3m" * 9
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
# Screens that also go on the website (site/assets/shots/<name>.webp), with the width to store.
SITE = {"chat": 1600, "plus": 1600, "proposal": 1600, "tasks": 1600, "kickoff": 1600, "person": 1600, "preview": 1600,
        "workshop": 1600, "secretary": 1600, "plan": 1600,
        "phone-chat": 600, "phone-plus": 600, "phone-docs": 600}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
done, failed = [], []


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
    """2x capture -> resized, 256-colour PNG (flat UI quantizes well) and, for the site, a WebP copy."""
    from PIL import Image
    im = Image.open(src).convert("RGB")
    if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(dst_png, optimize=True)
    return im

def settings_js(name, color, tok, pid):
    return (f"try {{ if (location.port === '{PORT}') {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', "
            f"server:{{url:'{BASE}', token:'{tok}'}}, checklist:{{setup:true}}, tour:{{done:true}}, hintDismissed:true}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.iosHint', '1'); }} }} catch (e) {{}}")

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

TMP = Path(tempfile.mkdtemp(prefix="readme-shots-"))
def shoot(page, name, prep=None):
    """Capture one screen. Failures are reported, not fatal, so one broken screen doesn't stop the rest."""
    if ONLY and name not in ONLY: return
    try:
        if prep: prep()
        page.evaluate("document.querySelectorAll('.toast, .toasts > *, #toast').forEach(t => t.remove())")
        page.mouse.move(2, page.viewport_size["height"] - 2)
        page.wait_for_timeout(450)
        raw = TMP / f"{name}.png"; page.screenshot(path=str(raw))
        phone = page.viewport_size["width"] < 600
        compress(raw, SHOTS / f"readme-{name}.png", 780 if phone else 1600)
        if name in SITE:
            from PIL import Image
            im = Image.open(raw).convert("RGB"); w = SITE[name]
            if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            im.save(SITE_SHOTS / f"{name}.webp", "WEBP", quality=80, method=6)
        done.append(name); print(f"  shot {name}")
    except Exception as e:
        failed.append(name); print(f"  ! {name}: {e}"); traceback.print_exc(limit=2)


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
        if "Summarize what changed for teammates" in p:
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


# ---------------------------------------------------------------- the run
def main():
    keep = "--keep" in sys.argv
    srv_dir = tempfile.mkdtemp(prefix="readme-tribe-")
    work = Path(tempfile.mkdtemp(prefix="readme-src-"))
    gh = ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    oll = ThreadingHTTPServer(("127.0.0.1", OLLAMA), OllamaMock); threading.Thread(target=oll.serve_forever, daemon=True).start()
    log = open(os.path.join(srv_dir, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", srv_dir, "--name", "Campfire Crew", "--ollama", f"http://localhost:{OLLAMA}"],
                           stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}", "TRIBE_NO_GH": "1", "TRIBE_REPO_POLL_MS": "1000", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    SHOTS.mkdir(parents=True, exist_ok=True); SITE_SHOTS.mkdir(parents=True, exist_ok=True)
    try:
        wait_until(lambda: api("/health").get("ok"), what="server")
        run(srv_dir, work)
    finally:
        srv.terminate(); oll.shutdown(); gh.shutdown()
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

    # The repo gets the playable Pixel Quest starter, so Preview and the repo hero show a real game
    ws = Path(srv_dir, "workspaces", pid)
    wait_until(lambda: (ws / ".git").exists() and "Initial commit" in git(ws, "Orion", "log", "--format=%s"), what="workspace repo")
    tpl = ROOT / "templates" / "starter-game"
    shutil.copy(tpl / "index.html", ws / "index.html"); shutil.copytree(tpl / "src", ws / "src", dirs_exist_ok=True)
    git(ws, "Orion", "add", "-A"); git(ws, "Orion", "commit", "-q", "-m", "Add the Pixel Quest starter (no build step)")
    git(ws, "Orion", "remote", "set-url", "origin", "https://github.com/orion/pixel-quest.git")   # the mock's bare repo path would show in the UI

    # A second project from a folder on disk (project-from-path), so the rail has more than one circle
    arena = work / "slime-arena"; shutil.copytree(tpl, arena)
    subprocess.run(["git", "init", "-q", "-b", "main", str(arena)], check=True)
    git(arena, "Orion", "add", "-A"); git(arena, "Orion", "commit", "-q", "-m", "Slime Arena from the starter")
    api("/projects", "POST", {"path": str(arena), "name": "Slime Arena", "emoji": "🟢"}, O)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
        def open_as(name, color, tok, mobile=False):
            if mobile: ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            else: ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
            ctx.add_init_script(settings_js(name, color, tok, pid))
            pg = ctx.new_page(); pg.goto(BASE + "/?skipIntro=1"); wait_text(pg, "#sync-status", "connected"); return pg
        def chat(pg): pg.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')"); return pg
        def close_overlays(pg):
            pg.keyboard.press("Escape"); pg.wait_for_timeout(150); pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
        host = open_as("Orion", "#F26B1D", O)
        friend = open_as("Maya", "#6C7CFF", M)   # keeps Maya online

        # ---------- Create project dialog + the getting-started card ----------
        def prep_create():
            host.click("#pj-plus"); host.wait_for_selector("#np-input"); host.fill("#np-input", "Night Market")
        shoot(host, "create", prep_create)
        close_overlays(host)
        chat(host); host.wait_for_selector("#flow-kick .fk-notechip", timeout=15000)
        shoot(host, "kickoff", lambda: host.evaluate("document.querySelector('#flow-kick').scrollIntoView({block: 'start'})"))

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
        ma = api("/agents", "POST", {}, M, pid)["token"]
        oa = api("/agents", "POST", {}, O, pid)["token"]
        mcp(ma, "share_prompt", {"summary": "Make the double jump feel floatier, keep coyote time"})
        mcp(ma, "report_context", {"used_pct": 41, "focus": "tuning jump gravity in src/systems/movement.js"})
        mcp(ma, "claim_file", {"path": "src/systems/movement.js", "note": "double jump"})
        plan = api("/flow", tok=O, pid=pid)["flow"]["plan"] or {"milestones": []}
        jump = next((i for m in plan["milestones"] for i in m["items"] if "double jump" in i["text"].lower()), {})
        mcp(ma, "post_gist", {"kind": "progress", "title": "Double jump feels floaty now", "bullets": ["Lower gravity on the way down", "Coyote time 80 ms", "Next: tune the second jump height"],
                              "files": ["src/systems/movement.js", "src/data/tuning.js"], **({"task": jump["task"]} if jump.get("task") else {})})
        # an image: a real frame of the running game (through a signed preview link); it also feeds Visuals and the repo hero
        pv = api("/preview/token", "POST", {}, O, pid)["path"]
        g = b.new_page(viewport={"width": 640, "height": 360}); g.goto(BASE + pv); g.wait_for_timeout(1500)
        frame = g.screenshot(); g.close()
        api("/visuals", "POST", {"screen": "level-1", "png_base64": b64(frame)}, O, pid)
        (ws / "screenshot.png").write_bytes(frame)   # README art: the pinned repo hero shows it
        readme = (ws / "README.md").read_text(); first, _, rest = readme.partition("\n")
        (ws / "README.md").write_text(f"{first}\n\n![Pixel Quest](screenshot.png)\n{rest}")
        git(ws, "Orion", "add", "screenshot.png", "README.md"); git(ws, "Orion", "commit", "-q", "-m", "README: a screenshot of the first playable", "--", "screenshot.png", "README.md")
        im = api("/chat/general/image", "POST", {"data": b64(frame), "mime": "image/png", "text": "First playable on my laptop 🎮"}, J, pid)["message"]
        react(M, im["id"], "❤️"); react(O, im["id"], "👍")
        send(O, "The slimes look great. Can they hop?", replyTo=im["id"])
        wave = [2, 5, 8, 6, 9, 4, 7, 3, 6, 8, 5, 2, 4, 7, 9, 6, 3, 5, 8, 4]
        api("/chat/general/voice", "POST", {"data": b64(b"\x1aE\xdf\xa3webm" * 40), "mime": "audio/webm", "dur": 9, "wave": wave,
                                           "transcript": "Slimes hop every two seconds now, and the checkpoint flag sits right before the last platform"}, J, pid)
        mcp(oa, "suggest_vote", {"question": "Add a speedrun timer?", "why": "Playtesters keep racing each other", "options": ["Yes", "Later", "No"]})
        msgs = api("/chat/general?limit=80", tok=O, pid=pid)["messages"]
        v = next((x for x in reversed(msgs) if x.get("vote") and "speedrun" in (x["vote"].get("q") or "")), None)
        if v:
            api(f"/chat/general/vote/{v['id']}/cast", "POST", {"option": "o1"}, M, pid)
            api(f"/chat/general/vote/{v['id']}/cast", "POST", {"option": "o2"}, J, pid)
        send(M, "Proposing the level select, vote when you can 🙏")
        prop = api("/chat/general/vote", "POST", {"pitch": {"title": "Level select screen", "body": "So playtesters can jump straight to the cave.\n- [ ] Level select UI\n- [ ] Remember unlocked levels"}}, M, pid)["message"]
        api(f"/chat/general/vote/{prop['id']}/cast", "POST", {"option": "yes"}, M, pid)

        # tasks and docs
        for t in ["Coin pickup sound", "Slime boss: splits when hit", "Title screen with the logo"]:
            api("/tasks", "POST", {"title": t}, O, pid)
        moves = {"Player can double jump": "doing", "Draw the hero sprite and coin art": "doing", "Checkpoint flag before the last platform": "review", "Coin pickup sound": "done"}
        for t in api("/tasks", tok=O, pid=pid)["tasks"]:
            if t["title"] in moves: api(f"/tasks/{t['id']}", "PATCH", {"status": moves[t["title"]]}, O, pid)
        api("/docs", "POST", {"title": "Level ideas", "body": "## Cave\n- slimes in the dark, torches you can carry\n- a boss at the end that splits when hit\n\n## Sky\n- moving platforms, wind gusts\n"}, O, pid)
        api("/docs", "POST", {"title": "Art style", "body": "16px sprites, flat colours, no outlines. Ember for the hero, teal for pickups."}, J, pid)

        # ---------- Chat (desktop) ----------
        for attempt in range(3):   # the vote cards render once the chat history and votes are in
            host.reload(); wait_text(host, "#sync-status", "connected"); chat(host)
            try: host.wait_for_selector("#chat-list .vt", state="attached", timeout=15000); break
            except Exception:
                if attempt == 2: raise
        bottom = lambda pg: pg.evaluate("document.querySelector('#chat-list').scrollTop = 1e9")
        def prep_plus():
            bottom(host); host.click(".cx-plus"); host.wait_for_selector(".pl-menu [data-pl]")
        shoot(host, "plus", prep_plus)
        close_overlays(host)
        shoot(host, "proposal", lambda: bottom(host))
        def prep_chat_top():
            host.evaluate(f"document.querySelector(\"#chat-list [data-id='{m1['id']}']\").scrollIntoView({{block: 'start'}}); document.querySelector('#chat-list').scrollTop -= 8")
        shoot(host, "chat", prep_chat_top)

        # ---------- profile menu, person panel, tasks, docs, plan ----------
        def prep_profile():
            bottom(host); host.click("#pf-btn"); host.wait_for_selector("#pf-menu .pf-item, .pf-menu .pf-item")
        shoot(host, "profile", prep_profile)
        close_overlays(host)
        def prep_person():
            chat(host); bottom(host); host.evaluate(f"TribePeople.open('{mid}')"); host.wait_for_selector("#person-panel:not(.hidden) .pp-it", timeout=15000)
        shoot(host, "person", prep_person)
        host.evaluate("TribePeople.close()")
        def prep_tasks():
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#board .task")
            host.evaluate("document.querySelector('#nest, .nest') && (document.querySelector('#nest, .nest').scrollTop = 1e6)")
        shoot(host, "tasks", prep_tasks)
        host.evaluate("document.querySelector('#nest, .nest') && (document.querySelector('#nest, .nest').scrollTop = 0)")
        def prep_docs():
            host.evaluate("TribeApp.show('docs')"); host.wait_for_timeout(800)
            host.click("#doc-list >> text=Level ideas"); host.wait_for_timeout(800)
            btn = host.locator("text=Summarize with local brain")
            if btn.count(): btn.first.click(); host.wait_for_timeout(1500)
            rd = host.locator("button:text-is('Read')")
            if rd.count(): rd.first.click(); host.wait_for_timeout(500)
        shoot(host, "docs", prep_docs)
        def prep_plan():
            host.evaluate("TribeFlow.openUpdates()"); host.wait_for_selector("#view-flow-updates:not(.hidden) #plan-hero .pi")
        shoot(host, "plan", prep_plan)

        # ---------- preview the app in the right panel ----------
        def prep_preview():
            chat(host); bottom(host); host.evaluate("TribePreview.open()"); host.wait_for_timeout(2500)
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
        def prep_phone_panel():
            ph.evaluate("TribeApp.show('home')"); ph.wait_for_timeout(300); ph.click("#menu-btn"); ph.wait_for_function("document.body.classList.contains('drawer-open')")
        shoot(ph, "phone-panel", prep_phone_panel)
        close_overlays(ph); ph.evaluate("document.body.classList.remove('drawer-open')")
        def prep_phone_docs():
            ph.click('#tabbar [data-nav="docs"]'); ph.wait_for_selector("#m2-docs-hub #m2-repo-hero"); ph.wait_for_timeout(1200)
            ph.evaluate("scrollTo(0, 0); document.querySelector('#main').scrollTop = 0")
        shoot(ph, "phone-docs", prep_phone_docs)
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
            host.evaluate("TribeWorkshop.open()"); host.wait_for_selector("#workshop:not(.hidden) .ws-item", timeout=15000); host.wait_for_timeout(800)
        shoot(host, "workshop", prep_ws)
        host.evaluate("TribeWorkshop.close()")

        # ---------- Agents hub + Secretary ----------
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
            host.evaluate("TribeAgentsHub.open()"); host.wait_for_selector("#view-agents-hub:not(.hidden) .ah-card")
            host.evaluate("document.querySelector('.main') && (document.querySelector('.main').scrollTop = 0)")
        shoot(host, "agents", prep_agents)
        def prep_sec():
            host.evaluate("TribeSecretary.open()"); host.wait_for_selector("#view-secretary:not(.hidden) .sy-digest li", timeout=15000)
            host.evaluate("document.querySelector('.main') && (document.querySelector('.main').scrollTop = 0)")
        shoot(host, "secretary", prep_sec)


if __name__ == "__main__":
    main()


