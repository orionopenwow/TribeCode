"""Screenshots and the demo video for the showcase site (site/, published at /about/ by .github/workflows/pages.yml).

Reuses scripts/readme-shots.py: the same throwaway tribe (Orion, Maya and Jay, their Claudes, Pixel Quest with a
lively chat, tasks, docs, a vote, the Secretary), then adds the screens the showcase needs (project overview, huddle,
Agent fleet + Office, Website, pixel viewer, themes, more phone screens). Everything is the real app; nothing is
mocked except Ollama and GitHub (local stand-ins, as in readme-shots).

Output: site/assets/shots/<name>.webp (not used by the current site/index.html; kept for a future gallery) (desktop 1440x900 @2x stored 2000px wide, phone 390x844 @2x stored 780px wide).

The demo (--demo): a fresh tribe, driven step by step (create a project -> copy the invite link -> a friend joins on
a phone -> a Claude agent connects over MCP and posts in chat -> tasks and the plan update -> the preview), captured
frame by frame and assembled with ffmpeg into site/assets/demo.mp4, site/assets/demo.webm and site/assets/demo.gif.

A full run also writes the social card site/assets/og-image.png (1200x630) from the overview shot.

Usage: python3 scripts/site-shots.py [--only a,b] [--demo]     screenshots (+ the demo)
       python3 scripts/site-shots.py --demo-only | --og-only     just the demo video, or just the social card
Needs: what readme-shots needs, plus ffmpeg for --demo.
"""
import importlib.util, json, os, shutil, subprocess, sys, tempfile, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("readme_shots", ROOT / "scripts" / "readme-shots.py")
rs = importlib.util.module_from_spec(spec); spec.loader.exec_module(rs)

OUT = ROOT / "site" / "assets" / "shots"
ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
# readme-shots screens we keep for the site (the rest of its run still seeds data)
FROM_README = {"kickoff", "plus", "proposal", "chat", "person", "tasks", "files", "doc", "dashboard", "flint", "preview", "phone-chat", "phone-plus",
               "phone-panel", "phone-files", "phone-doc", "agents", "secretary", "home"}
TMP = Path(tempfile.mkdtemp(prefix="site-shots-"))
done, failed = [], []


def save(raw, name):
    from PIL import Image
    im = Image.open(raw).convert("RGB")
    w = 780 if im.width < 1200 else 2000
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(OUT / f"{name}.webp", "WEBP", quality=82, method=6)
    return im


def shoot(page, name, prep=None):
    if name not in FROM_README and not name.startswith("x-"): return
    name = name[2:] if name.startswith("x-") else name
    if ONLY and name not in ONLY: return
    try:
        if prep: prep()
        page.evaluate("document.querySelectorAll('.toast, .toasts > *, #toast').forEach(t => t.remove())")
        page.mouse.move(2, page.viewport_size["height"] - 2); page.wait_for_timeout(500)
        raw = TMP / f"{name}.png"; page.screenshot(path=str(raw)); save(raw, name)
        done.append(name); print(f"  shot {name}")
    except Exception as e:
        failed.append(name); print(f"  ! {name}: {e}")


def after(L):
    """Runs at the end of readme-shots' run() with its locals: the seeded tribe and the open pages."""
    api, mcp = rs.api, rs.mcp
    host, friend, pid, O, M, ws = L["host"], L["friend"], L["pid"], L["O"], L["M"], L["ws"]
    open_as, chat, close_overlays, bottom = L["open_as"], L["chat"], L["close_overlays"], L["bottom"]
    ma = L["ma"]
    try: host.evaluate("TribeSecretary.close && TribeSecretary.close()")
    except Exception: pass

    # A sprite sheet in the repo for the pixel viewer, and a living update for the overview
    (ws / "art").mkdir(exist_ok=True); (ws / "art" / "hero-run.png").write_bytes(rs.run_cycle())
    rs.git(ws, "Jay", "add", "art/hero-run.png"); rs.git(ws, "Jay", "commit", "-q", "-m", "Hero run cycle, 4 frames", "--", "art/hero-run.png")
    api("/repo/refresh", "POST", {}, O, pid)
    mcp(ma, "post_gist", {"kind": "progress", "title": "Checkpoint flag works", "bullets": ["Touch the flag to save your respawn", "A test dies after the flag and respawns there"], "files": ["src/systems/checkpoint.js"]})
    api(f"/projects/{pid}", "PATCH", {"bio": "A cozy co-op platformer, made by three friends and their Claudes"}, O)
    api("/vision", "PUT", {"text": "# Pixel Quest\n\nA tiny platformer friends build together over a weekend.\n\n- Three short levels: cave, forest, sky\n- Double jump and checkpoints\n- Plays on a phone"}, O, pid)

    # ---------- project overview (the living update) ----------
    def prep_overview():
        close_overlays(host); host.evaluate("TribeApp.show('home')"); host.wait_for_timeout(1500)
        host.evaluate("document.querySelector('.main') && (document.querySelector('.main').scrollTop = 0)")
    shoot(host, "x-overview", prep_overview)

    # ---------- huddle: Orion starts it from the chat header, Maya joins (fake mic and camera) ----------
    def prep_huddle():
        chat(host); bottom(host); host.click(".cb-btn[data-cb='huddle']")
        chat(friend); friend.wait_for_selector("#nest-huddle.live #huddle-live:not(.hidden)", timeout=15000); friend.click("#nest-huddle-row")
        host.wait_for_function("document.querySelectorAll('#huddle-box .hface').length === 2", timeout=20000)
        host.wait_for_timeout(1500); bottom(host)
    shoot(host, "x-huddle", prep_huddle)
    try:
        host.click("#h-leave"); friend.click("#h-leave")
    except Exception: pass

    # ---------- Agent fleet (Home) with the Office card ----------
    def prep_fleet():
        host.evaluate("TribeHub.open('home')"); host.wait_for_selector("#nest-fleet", timeout=15000); host.click("#nest-fleet")
        host.wait_for_selector("#ah-office .ah-office", timeout=15000); host.wait_for_timeout(800)
        host.evaluate("document.querySelector('.main') && (document.querySelector('.main').scrollTop = 0)")
    shoot(host, "x-fleet", prep_fleet)

    # ---------- Website (Docs & Files > Website), built from what the project has ----------
    def prep_site():
        host.evaluate("pid => TribeProjects.switchTo(pid, 'home')", pid); host.wait_for_timeout(600)
        host.click("#nest-docs"); host.wait_for_selector("#view-tabs:not(.hidden) #wt-website", timeout=15000)
        host.click("#wt-website"); host.wait_for_selector("#wb-root", timeout=15000)
        if not host.query_selector("#wb-frame"):
            host.click("#wb-build"); host.wait_for_selector("#wb-frame", timeout=20000)
        host.wait_for_timeout(1800)
        host.evaluate("document.querySelector('#wb-frame-box').scrollIntoView({block: 'start'})"); host.wait_for_timeout(400)
        host.evaluate("const m = document.querySelector('#wb-frame-box').closest('.main, main, [class*=scroll]'); m && (m.scrollTop -= 220)")
        host.wait_for_timeout(500)
    shoot(host, "x-website", prep_site)

    # ---------- pixel viewer on the repo's sprite sheet ----------
    def prep_viewer():
        host.evaluate("TribeApp.show('docs')"); host.wait_for_timeout(600)
        host.evaluate("TribeViewers.open({ path: 'art/hero-run.png' })")
        host.wait_for_selector("#vw-body[data-ready='1']", timeout=15000)
        try: host.click("[data-zoom='8']")
        except Exception: pass
        host.wait_for_timeout(700)
    shoot(host, "x-viewer", prep_viewer)
    close_overlays(host)

    # ---------- themes: the same chat in four themes, sliced into one picture ----------
    if not ONLY or "themes" in ONLY:
        try:
            from PIL import Image
            parts = []
            for t in ["dark", "light", "nightshade", "solar-dark"]:
                host.evaluate(f"TribeStore.set(TribeThemes.pick('{t}')); TribeThemes.apply('{t}')")
                chat(host); bottom(host); host.wait_for_timeout(700)
                raw = TMP / f"theme-{t}.png"; host.screenshot(path=str(raw)); parts.append(Image.open(raw).convert("RGB"))
            host.evaluate("TribeStore.set(TribeThemes.pick('dark')); TribeThemes.apply('dark')")
            W, H = parts[0].size; out = Image.new("RGB", (W, H)); sw = W // 4
            for i, im in enumerate(parts): out.paste(im.crop((i * sw, 0, (i + 1) * sw if i < 3 else W, H)), (i * sw, 0))
            for i in range(1, 4):
                for y in range(H):
                    for dx in range(2): out.putpixel((i * sw + dx, y), (42, 49, 60))
            raw = TMP / "themes.png"; out.save(raw); save(raw, "themes"); done.append("themes"); print("  shot themes")
        except Exception as e:
            failed.append("themes"); print("  ! themes:", e)

    # ---------- more phone screens (Maya) ----------
    ph = open_as("Maya", "#6C7CFF", M, mobile=True)
    def prep_phone_home():
        ph.evaluate("TribeApp.show('home')"); ph.wait_for_timeout(1500); ph.evaluate("scrollTo(0,0)")
    shoot(ph, "x-phone-overview", prep_phone_home)
    def prep_phone_tasks():
        ph.click('#tabbar [data-nav="tasks"]'); ph.wait_for_timeout(1500); ph.evaluate("scrollTo(0,0)")
    shoot(ph, "x-phone-tasks", prep_phone_tasks)
    def prep_phone_agents():
        ph.evaluate("TribeAgentsHub.open()"); ph.wait_for_timeout(1500); ph.evaluate("scrollTo(0,0)")
    shoot(ph, "x-phone-agents", prep_phone_agents)
    ph.context.close()


def run_shots():
    OUT.mkdir(parents=True, exist_ok=True)
    rs.shoot = shoot
    rs.AFTER = after
    rs.CHROME_ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
    rs.SHOTS = TMP; rs.SITE_SHOTS = TMP   # readme-shots' own outputs are not written (our shoot replaces its)
    try: rs.main()
    except SystemExit: pass
    print(f"\n{len(done)} site screenshots: {', '.join(done)}")
    if failed: print("FAILED:", ", ".join(failed))


# ======================================================================== the demo video
def run_demo():
    """A fresh tribe, driven step by step; frames every ~100 ms of page time, assembled with ffmpeg."""
    from playwright.sync_api import sync_playwright
    from PIL import Image, ImageDraw, ImageFont
    port = rs.PORT + 5; rs.BASE = base = f"http://localhost:{port}"
    srv_dir = tempfile.mkdtemp(prefix="site-demo-")
    gh = rs.ThreadingHTTPServer(("127.0.0.1", 0), rs.GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    oll = rs.ThreadingHTTPServer(("127.0.0.1", 0), rs.OllamaMock); threading.Thread(target=oll.serve_forever, daemon=True).start()
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", srv_dir, "--name", "Campfire Crew", "--ollama", f"http://localhost:{oll.server_address[1]}"],
                           stdout=open(os.path.join(srv_dir, "server.log"), "w"), stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}", "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_REPO_POLL_MS": "1000"})
    frames = TMP / "frames"; frames.mkdir(exist_ok=True)
    W, H = 1200, 750   # output frame
    n = [0]
    font_p = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    font = ImageFont.truetype(font_p, 22) if os.path.exists(font_p) else ImageFont.load_default()

    def compose(desk_png, phone_png, caption):
        """The desktop window, optionally a phone on the right, and a caption chip; flat canvas, 1px borders."""
        canvas = Image.new("RGB", (W, H), (18, 21, 26))
        d = Image.open(desk_png).convert("RGB")
        dw = 1060 if phone_png else 1140; dh = round(d.height * dw / d.width)
        d = d.resize((dw, dh), Image.LANCZOS)
        x0, y0 = (24 if phone_png else (W - dw) // 2), 64
        g = ImageDraw.Draw(canvas)
        g.rectangle((x0 - 1, y0 - 1, x0 + dw, y0 + dh), outline=(42, 49, 60))
        canvas.paste(d, (x0, y0))
        if phone_png:
            p = Image.open(phone_png).convert("RGB"); pw = 300; ph_ = round(p.height * pw / p.width)
            p = p.resize((pw, ph_), Image.LANCZOS); px, py = W - pw - 24, H - ph_ - 20
            g.rounded_rectangle((px - 7, py - 7, px + pw + 6, py + ph_ + 6), radius=30, fill=(30, 36, 45), outline=(42, 49, 60))
            canvas.paste(p, (px, py))
        if caption:
            tw = g.textlength(caption, font=font)
            g.rounded_rectangle((24, 14, 24 + tw + 36, 50), radius=8, fill=(27, 32, 40), outline=(42, 49, 60))
            g.ellipse((36, 28, 44, 36), fill=(242, 107, 29))
            g.text((52, 19), caption, font=font, fill=(230, 233, 238))
        return canvas

    state = {"phone": None, "caption": ""}
    def snap(desk, count=1, phone=None):
        for _ in range(count):
            dp = TMP / "d.png"; desk.screenshot(path=str(dp))
            pp = None
            if phone is not None or state["phone"] is not None:
                pg = phone or state["phone"]; pp = TMP / "p.png"; pg.screenshot(path=str(pp))
            compose(dp, pp, state["caption"]).save(frames / f"f{n[0]:05d}.png"); n[0] += 1
    def hold(desk, seconds):   # repeat the last frame (10 fps)
        last = frames / f"f{n[0] - 1:05d}.png"
        for _ in range(int(seconds * 10)): shutil.copy(last, frames / f"f{n[0]:05d}.png"); n[0] += 1
    def cap(text): state["caption"] = text

    try:
        rs.wait_until(lambda: rs.api("/health").get("ok"), what="server")
        boot = rs.api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}); O = boot["token"]
        rs.api("/me/git", "PUT", {"githubToken": rs.GH_TOKEN}, O)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=rs.CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, permissions=["clipboard-read", "clipboard-write"])
            ctx.add_init_script(f"try {{ if (location.port === '{port}') {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{base}', token:'{O}'}}, checklist:{{setup:true}}, tour:{{done:true}}, hintDismissed:true}})); }} }} catch (e) {{}}")
            host = ctx.new_page(); host.goto(base + "/?skipIntro=1"); rs.wait_text(host, "#sync-status", "connected")
            host.evaluate("TribeHub.open('home')"); host.wait_for_timeout(1200)
            host.evaluate("TribeShell.setPanel(true)"); host.wait_for_timeout(300)
            bottom = lambda pg: pg.evaluate("document.querySelector('#chat-list') && (document.querySelector('#chat-list').scrollTop = 1e9)")
            # 1. create a project, in the real dialog
            cap("1  Create a project"); snap(host); hold(host, 0.8)
            host.click("#pj-plus"); host.wait_for_timeout(450); snap(host); hold(host, 0.5)
            host.click(".np-setup [data-ns='tpl:game']"); host.wait_for_selector("#np-input"); host.fill("#np-input", ""); host.wait_for_timeout(200)
            for i in range(1, len("Pixel Quest") + 1):
                host.fill("#np-input", "Pixel Quest"[:i]); snap(host)
            hold(host, 0.4)
            before = host.evaluate("TribeProjects.current()")
            host.click("#np-create")
            host.wait_for_function("b => TribeProjects.current() && TribeProjects.current() !== b", arg=before, timeout=20000)
            pid = host.evaluate("TribeProjects.current()")
            # 2. the invite link: creating a project copies it and says so
            host.wait_for_timeout(1200); cap("2  The invite link is already copied"); snap(host, 3); hold(host, 1.8)
            host.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            host.evaluate("TribeShell.setPanel(false)")
            rs.wait_until(lambda: all(s["s"] == "ok" for s in rs.api("/flow", tok=O, pid=pid)["flow"]["steps"].values()), what="flow steps")
            host.evaluate("TribeApp.show('chat')"); host.wait_for_selector("#flow-copy", timeout=20000); host.wait_for_timeout(600)
            snap(host, 3); hold(host, 0.6)
            code = rs.api("/flow", tok=O, pid=pid)["flow"]["invite"]["code"]
            # 3. a friend joins on a phone
            cap("3  A friend taps it on their phone")
            pctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=rs.IPHONE_UA)
            ph = pctx.new_page(); ph.goto(f"{base}/join/{code}"); ph.wait_for_selector("#form:not(.hidden)", timeout=15000)
            state["phone"] = ph; snap(host, 3); hold(host, 0.5)
            for i in range(1, 5): ph.fill("#name", "Maya"[:i]); snap(host)
            hold(host, 0.4); ph.click("#go"); ph.wait_for_url("**/m/*/", timeout=15000)
            try: ph.wait_for_selector("#install-sheet", timeout=8000); ph.wait_for_timeout(400); snap(host, 3); hold(host, 0.7); ph.click("#ins-later")
            except Exception: pass
            ph.evaluate("window.TribeApp && TribeApp.show('chat')"); ph.wait_for_timeout(1500); bottom(host); bottom(ph)
            snap(host, 3); hold(host, 0.9)
            M = ph.evaluate("TribeStore.get().server.token")
            # 4. Maya's Claude connects (one claude mcp add line) and posts
            cap("4  Her Claude connects and reports in chat")
            ma = rs.api("/agents", "POST", {}, M, pid)["token"]
            rs.mcp(ma, "report_context", {"used_pct": 23, "focus": "double jump in src/systems/movement.js"})
            rs.mcp(ma, "claim_file", {"path": "src/systems/movement.js", "note": "double jump"})
            rs.api("/chat/general/send", "POST", {"text": "I'm in! My Claude is taking the double jump 🦘"}, M, pid)
            host.wait_for_timeout(900); bottom(host); bottom(ph); snap(host, 3); hold(host, 0.6)
            rs.mcp(ma, "post_gist", {"kind": "progress", "title": "Double jump works", "bullets": ["Second jump at 80% height", "Floaty fall, coyote time 80 ms", "Next: a test for jumping"], "files": ["src/systems/movement.js", "src/data/tuning.js"]})
            host.wait_for_timeout(1200); bottom(host); bottom(ph)
            snap(host, 3); hold(host, 2.0)
            # 5. tasks and the plan update
            cap("5  Tasks and the plan keep up")
            for t in ["Coin pickup sound", "Slime boss splits when hit", "Title screen"]: rs.api("/tasks", "POST", {"title": t}, O, pid)
            for t in rs.api("/tasks", tok=O, pid=pid)["tasks"]:
                if "double jump" in t["title"].lower(): rs.api(f"/tasks/{t['id']}", "PATCH", {"status": "done"}, O, pid)
                elif "sound" in t["title"].lower(): rs.api(f"/tasks/{t['id']}", "PATCH", {"status": "doing"}, O, pid)
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_timeout(1500); state["phone"] = None
            snap(host, 3); hold(host, 1.3)
            rs.api("/docs", "POST", {"title": "Level ideas", "body": "## Cave\n- slimes in the dark\n- a boss that splits when hit\n\n## Sky\n- moving platforms, wind gusts\n"}, M, pid)
            host.evaluate("TribeApp.show('docs')"); host.wait_for_timeout(1600); snap(host, 3); hold(host, 1.2)
            # 6. preview
            cap("6  Play it in the preview")
            ws = Path(srv_dir, "workspaces", pid); tpl = ROOT / "templates" / "starter-game"
            shutil.copy(tpl / "index.html", ws / "index.html"); shutil.copytree(tpl / "src", ws / "src", dirs_exist_ok=True)
            rs.git(ws, "Orion", "add", "-A"); rs.git(ws, "Orion", "commit", "-q", "-m", "Pixel Quest starter")
            host.evaluate("TribeApp.show('chat')"); host.wait_for_timeout(600)
            host.evaluate("TribePreview.open()"); host.wait_for_timeout(2500)
            for _ in range(14): snap(host); host.wait_for_timeout(80)
            hold(host, 1.5)
            b.close()
    finally:
        srv.terminate(); gh.shutdown(); oll.shutdown()

    assets = ROOT / "site" / "assets"
    seq = str(frames / "f%05d.png")
    print(f"  {n[0]} frames ({n[0] / 10:.1f} s at 10 fps)")
    run = lambda *a: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)
    run("-framerate", "10", "-i", seq, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow", "-movflags", "+faststart", str(assets / "demo.mp4"))
    run("-framerate", "10", "-i", seq, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1", str(assets / "demo.webm"))
    pal = TMP / "pal.png"
    run("-framerate", "10", "-i", seq, "-vf", "scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff", str(pal))
    run("-framerate", "10", "-i", seq, "-i", str(pal), "-lavfi", "scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle", str(assets / "demo.gif"))
    Image.open(frames / f"f{min(n[0] - 1, 120):05d}.png").save(assets / "demo-poster.webp", "WEBP", quality=82)
    for f in ["demo.mp4", "demo.webm", "demo.gif"]: print(f"  {f}: {(assets / f).stat().st_size / 1e6:.2f} MB")


# ======================================================================== the social card
def make_og():
    """site/assets/og-image.png: made by scripts/readme-shots.py from its Dashboard shot (npm run dev:shots)."""
    src = ROOT / "docs" / "screenshots" / "readme-dashboard.png"
    rs.make_og(src)


if __name__ == "__main__":
    args = set(sys.argv[1:])
    if "--og-only" in args: make_og()
    elif "--demo-only" in args: run_demo()
    else:
        run_shots()
        if "--demo" in args: run_demo()
        if not ONLY: make_og()
    shutil.rmtree(TMP, ignore_errors=True)
