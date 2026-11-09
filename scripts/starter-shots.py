"""Real screenshots for the website's starter cards (site/assets/starters/*.jpg).
Each card shows a real, working page: the Pixel Quest and site starters from templates/, and small working pages in
scripts/starter-shots/ for the other starters (their real UI, real code and real output). Run after changing any of them:
    python3 scripts/starter-shots.py
"""
import functools, http.server, shutil, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]; SRC = ROOT / "scripts" / "starter-shots"; OUT = ROOT / "site" / "assets" / "starters"
OUT.mkdir(parents=True, exist_ok=True)
tmp = Path(tempfile.mkdtemp())
shutil.copytree(SRC, tmp / "p"); shutil.copytree(ROOT / "templates" / "starter-game", tmp / "game")
shutil.copytree(ROOT / "templates" / "starter-site", tmp / "site")
ix = tmp / "site" / "index.html"
ix.write_text(ix.read_text().replace("{{name}}", "Ana Ruiz · illustration").replace("{{tagline}}", "Little worlds, drawn by hand").replace("{{gist}}", "Picture books, posters and pixel art. Add what you'd like to see next.").replace("{{engine}}", "plain HTML"))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 5871), functools.partial(Q, directory=str(tmp)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = "http://127.0.0.1:5871/"
SHOTS = {
    "pixel-platformer": ("game/index.html", 2500), "endless-runner": ("p/endless-runner.html", 300), "3d-walkaround": ("p/3d-walkaround.html", 300),
    "party-quiz": ("p/party-quiz.html", 300), "habit-tracker": ("p/habit-tracker.html", 300), "shared-list": ("p/shared-list.html", 300),
    "club-signups": ("p/club-signups.html", 300), "portfolio": ("site/index.html", 600), "launch-page": ("p/launch-page.html", 300),
    "devlog": ("p/devlog.html", 300), "discord-bot": ("p/discord-bot.html", 300), "small-api": ("p/small-api.html", 300), "cli-helper": ("p/cli-helper.html", 300),
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    pg = b.new_page(viewport={"width": 800, "height": 500}, device_scale_factor=1)
    for slug, (path, wait) in SHOTS.items():
        pg.goto(B + path); pg.wait_for_timeout(wait)
        if slug == "pixel-platformer":   # play a moment so the hero is mid-jump on the first level
            pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(500); pg.keyboard.press("Space"); pg.wait_for_timeout(250); pg.keyboard.up("ArrowRight")
        if slug == "portfolio":
            for t in ["Poster: The Night Garden", "Book: Lantern Fox", "Pixel set: Meadow"]:
                pg.fill("#item", t); pg.click("#add button")
        pg.screenshot(path=str(OUT / f"{slug}.jpg"), type="jpeg", quality=82)
        print("shot", slug)
    b.close()
srv.shutdown()
# the playable demos on the website (site/play): the same pages, so a card can be played right in its thumbnail
PLAY = ROOT / "site" / "play"; PLAY.mkdir(exist_ok=True)
shutil.rmtree(PLAY / "pixel-quest", ignore_errors=True); shutil.copytree(ROOT / "templates" / "starter-game", PLAY / "pixel-quest", ignore=shutil.ignore_patterns("CLAUDE.md", "LANES.json", "VISION.md"))
shutil.rmtree(PLAY / "portfolio", ignore_errors=True); shutil.copytree(tmp / "site", PLAY / "portfolio")
for f in ["base.css", "habit-tracker.html", "shared-list.html"]: shutil.copy(SRC / f, PLAY / f)
