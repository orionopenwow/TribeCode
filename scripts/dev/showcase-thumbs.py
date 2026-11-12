"""Thumbnails for the website's gallery (site/index.html #gallery): genuine renders of what TribeCode makes, written as
WebP to site/assets/showcase/ plus proof.json (what is inside a Watch Flint build proof ZIP).

How: starts a throwaway tribe server, runs Watch Flint build (TribeFlintRun.start, no AI), then has Flint build and
design more things with his normal free commands (a to-do app, a video editor, a dashboard, a pricing page,
an onboarding screen), opens company templates in Work › Templates, and screenshots each. The builds Flint wrote
(builds/<name>/), the proof ZIP's website, game, presentation and the Lantern Run demo game are then served as plain files and screenshotted.
Website templates come from templates/sites/<id>/thumb.png (made by scripts/dev/site-thumbs.js from the real
templates). The Work loop and inspiration board come from their own tests' --shots (e2e_work_complete.py,
e2e_inspo_board.py), and the docs/screenshots they rewrite are put back with git.

Usage: python3 scripts/dev/showcase-thumbs.py   (TRIBE_PORT_OFFSET shifts the ports)
"""
import functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, zipfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "site" / "assets" / "showcase"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5730 + OFF
B = f"http://localhost:{PORT}"
W, H = 720, 450
SITES = ["cafe", "portfolio", "band", "merch", "linkbio", "wedding", "podcast", "nonprofit"]


def webp(src, name, crop=None):
    im = Image.open(src).convert("RGB")
    if crop: im = im.crop(crop)
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, 0
    im.crop((x, y, x + W, y + H)).save(OUT / f"{name}.webp", "WEBP", quality=80, method=6)
    print("  ", name)


def serve(folder, port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=str(folder)))
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="showcase-")); tribe = tmp / "tribe"; shots = tmp / "shots"; shots.mkdir()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tribe), "--name", "Lantern Labs", "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "server.log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(B + "/api/health"); break
            except Exception: time.sleep(0.15)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'})); localStorage.setItem('tribecode.flint.brain', 'none');")
            pg.goto(B + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeFlintRun", timeout=20000)
            print("Watch Flint build…")
            log = pg.evaluate("TribeFlintRun.start({ fast: true })"); assert all(l["ok"] for l in log), [l["id"] for l in log if not l["ok"]]
            pg.wait_for_timeout(600); pg.screenshot(path=str(shots / "flint-run.png"))
            pg.evaluate("for (const id of ['frun-close', 'frun-stop']) { const x = document.getElementById(id); if (x) x.click(); } document.querySelectorAll('.frun, #frun').forEach(e => e.remove())")
            def ask(q, wait=4500):
                pg.evaluate(f"TribeFlint.ask({q!r})"); pg.wait_for_timeout(wait)
                return pg.evaluate("TribeFlint.thread().slice(-1)[0].text")
            for q, name in [("design a dashboard screen", "app-dashboard"), ("design a pricing page", "design-pricing"), ("design an onboarding screen", "design-onboarding")]:
                print(" ", ask(q)[:80])
                pg.evaluate("document.querySelectorAll('.toast, .frun').forEach(e => e.remove())")
                fr = pg.evaluate("(() => { const s = TribeCanvas.state(); const f = (s.nodes || []).filter(n => !n.p && !n.del).pop(); return f && f.id; })()")
                if fr: pg.evaluate(f"TribeCanvas.select && TribeCanvas.select({fr!r}); TribeCanvas.zoomTo && TribeCanvas.zoomTo({fr!r})")
                pg.wait_for_timeout(500); pg.screenshot(path=str(shots / f"{name}.png"))
            for q in ["make a to-do app called Chore Wheel", "make a video editor called Clipboard"]:
                print(" ", ask(q)[:90])
            pg.goto(B + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeTemplates", timeout=20000)
            for tid, name in [("standup", "doc-standup"), ("launch", "doc-launch"), ("brand", "doc-brand")]:
                pg.evaluate("TribeTalent.open('templates')"); pg.wait_for_timeout(500)
                pg.evaluate(f"TribeTemplates.open({tid!r})"); pg.wait_for_timeout(700)
                pg.evaluate("document.querySelectorAll('.toast').forEach(e => e.remove())")
                pg.screenshot(path=str(shots / f"{name}.png"))
            b.close()
    finally:
        srv.terminate(); srv.wait()
    ws = next((tribe / "workspaces").iterdir())
    z = next((tribe / "exports").glob("*-proof.zip")); proof = tmp / "proof"
    with zipfile.ZipFile(z) as zf:
        zf.extractall(proof); names = zf.namelist()
    groups = {}
    for n in names:
        if n.endswith("/"): continue
        top = n.split("/")[0] if "/" in n else n; groups[top] = groups.get(top, 0) + 1
    json.dump({"zip": z.name, "kb": round(z.stat().st_size / 1024), "files": len([n for n in names if not n.endswith("/")]), "groups": groups},
              open(OUT / "proof.json", "w"), indent=1)
    builds = {d.name: d for d in (ws / "builds").iterdir()}
    pick = lambda frag: next(v for k, v in builds.items() if frag in k)
    static = [(proof / "website", "site-presskit", "index.html"), (proof / "game", "game-platformer", "index.html"), (proof / "presentation", "doc-presentation", "index.html"),
              (pick("todo"), "app-todo", "index.html"), (pick("video"), "app-video", "index.html"), (ROOT / "templates" / "lantern-run", "game-lantern", "index.html")]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1280, "height": 800})
        for i, (folder, name, page) in enumerate(static):
            s = serve(folder, PORT + 1 + i)
            pg.goto(f"http://127.0.0.1:{PORT + 1 + i}/{page}"); pg.wait_for_timeout(1800)
            if name == "app-todo":
                for t in ["Water the plants", "Take out the recycling", "Vacuum the hall", "Buy oat milk"]: pg.fill("#new", t); pg.keyboard.press("Enter")
                pg.locator("#list input[type=checkbox], [data-done], .done-toggle").first.click() if pg.locator("#list input[type=checkbox], [data-done], .done-toggle").count() else None
            if name.startswith("game-"): pg.mouse.click(640, 400); pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(700); pg.keyboard.up("ArrowRight")
            pg.screenshot(path=str(shots / f"{name}.png")); s.shutdown()
        b.close()
    # their own tests draw these (seeded gigs, fixture pictures); keep the repo's copies as they were
    for test, shot, name in [("e2e_work_complete.py", "work-loop.png", "doc-work"), ("e2e_inspo_board.py", "inspo-board.png", "design-inspo")]:
        subprocess.run([sys.executable, str(ROOT / "app" / "test" / test), "--shots"], cwd=ROOT, check=True, env=env, stdout=subprocess.DEVNULL)
        shutil.copy(ROOT / "docs" / "screenshots" / shot, shots / f"{name}.png")
        subprocess.run(["git", "checkout", "--", f"docs/screenshots/{shot}"], cwd=ROOT)
    print("writing", OUT)
    pane = (330, 64, 1120, 560)
    crops = {"app-todo": (300, 0, 1000, 440), "doc-standup": pane, "doc-launch": pane, "doc-brand": pane, "doc-work": pane, "flint-run": (240, 60, 1440, 900), "app-dashboard": (240, 52, 1176, 900), "design-pricing": (240, 52, 1176, 900), "design-onboarding": (240, 52, 1176, 900)}
    for f in sorted(shots.glob("*.png")): webp(f, f.stem, crops.get(f.stem))
    for sid in SITES: webp(ROOT / "templates" / "sites" / sid / "thumb.png", f"site-{sid}")
    phones()
    shutil.rmtree(tmp, ignore_errors=True)


def phones():
    """Phone screens for "Why TribeCode", from the demo tribe's phone test shots (e2e_showcase_demo.py --shots)."""
    for shot, name, top in [("demo-phone-chat.png", "phone-approve", 250), ("demo-phone-tasks.png", "phone-tasks", 0)]:
        im = Image.open(ROOT / "docs" / "screenshots" / shot).convert("RGB")
        im = im.crop((0, top, im.width, top + round(im.width * 1.3))).resize((360, 468), Image.LANCZOS)
        im.save(OUT / f"{name}.webp", "WEBP", quality=80, method=6); print("  ", name)


if __name__ == "__main__":
    phones() if "--phones" in sys.argv else main()
