"""Preview thumbnails for the Design flow's galleries (feat/design-flow, app/ui/designflow.js): real renders, written as
small WebP (480x300).

  app/ui/starters/thumbs/<id>.webp       every app and game starter, running (headless Chrome, after a short play)
  app/ui/assets/designflow/site-<id>.webp     the website designer's templates (templates/sites/<id>/thumb.png)
  app/ui/assets/designflow/slides-<id>.webp   each slide template's first slide, drawn by deck.js
  app/ui/assets/designflow/screen-<id>.webp   each screen template, made by the flow and Flint's free canvas templates
  app/ui/assets/designflow/poster-<id>.webp, logo-<id>.webp   the poster and logo templates on the canvas
  app/ui/assets/designflow/board-<id>.webp    the whiteboard templates

Everything runs from app/ui served as plain files with no tribe (the same path as Home › Design on this device).
Usage: python3 scripts/dev/design-thumbs.py [--only starters|sites|slides|canvas|boards]   (TRIBE_PORT_OFFSET shifts the port)
"""
import base64, functools, http.server, io, json, os, sys, threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OUT_S = UI / "starters" / "thumbs"
OUT_D = UI / "assets" / "designflow"
PORT = 5995 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
B = f"http://127.0.0.1:{PORT}"
W, H = 480, 300
ONLY = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else ""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def webp(data, out, fit="cover", bg=(18, 21, 26)):
    im = Image.open(io.BytesIO(data) if isinstance(data, bytes) else data).convert("RGB")
    if fit == "cover":
        r = max(W / im.width, H / im.height); im = im.resize((max(W, round(im.width * r)), max(H, round(im.height * r))), Image.LANCZOS)
        x, y = (im.width - W) // 2, 0 if im.height > H * 1.3 else (im.height - H) // 2
        im = im.crop((x, y, x + W, y + H))
    else:   # contain, on the canvas color
        r = min((W - 24) / im.width, (H - 24) / im.height); im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        c = Image.new("RGB", (W, H), bg); c.paste(im, ((W - im.width) // 2, (H - im.height) // 2)); im = c
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=78, method=6)
    print(f"  {out.relative_to(ROOT)} {out.stat().st_size // 1024} KB")


PLAY = {   # a moment of play before the picture
    "blocks": lambda p: (p.keyboard.press("Space"), p.wait_for_timeout(2600)),
    "runner": lambda p: (p.keyboard.press("Space"), p.wait_for_timeout(1500)),
    "snake": lambda p: (p.keyboard.press("ArrowRight"), p.wait_for_timeout(1200)),
    "topdown": lambda p: (p.keyboard.down("KeyD"), p.mouse.click(600, 200), p.wait_for_timeout(500), p.keyboard.up("KeyD")),
    "memory": lambda p: (p.click(".card >> nth=0"), p.click(".card >> nth=5")),
    "todo": lambda p: (p.fill("#input", "Playtest on Friday"), p.press("#input", "Enter"), p.click(".todos li >> nth=0")),
    "kanban": lambda p: None,
    "sketch": lambda p: (p.mouse.move(150, 160), p.mouse.down(), p.mouse.move(300, 120, steps=8), p.mouse.move(420, 260, steps=8), p.mouse.up()),
    "survey": lambda p: (p.fill("#a", "Rae"), p.press("#a", "Enter")),
    "calculator": lambda p: (p.keyboard.type("12*(3+4)")),
    "chat": lambda p: (p.fill("#msg", "Ship it tonight?"), p.press("#msg", "Enter"), p.wait_for_timeout(1200)),
    "platformer": lambda p: (p.keyboard.down("ArrowRight"), p.wait_for_timeout(500), p.keyboard.up("ArrowRight")),
}


def starters(pg):
    print("starters")
    cat = json.loads((UI / "starters" / "catalog.json").read_text())["items"]
    pg.set_viewport_size({"width": 800, "height": 500})
    for s in cat:
        pg.goto(f"{B}/starters/{s['id']}/index.html"); pg.wait_for_timeout(500)
        pg.click("body", position={"x": 3, "y": 3})
        f = PLAY.get(s["id"])
        if f: f(pg)
        pg.wait_for_timeout(300)
        webp(pg.screenshot(), OUT_S / f"{s['id']}.webp")


def sites():
    print("website templates")
    for d in sorted((ROOT / "templates" / "sites").iterdir()):
        t = d / "thumb.png"
        if t.exists(): webp(t.read_bytes(), OUT_D / f"site-{d.name}.webp")


def app_page(p):
    ctx = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"]).new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("try{localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
    pg = ctx.new_page()
    pg.goto(f"{B}/?skipIntro=1#/hub/design")
    pg.wait_for_function("window.TribeDesignFlow && window.TribeLocalFiles && window.TribeDeck && document.querySelector('#dfl .dfl-kind')", timeout=20000)
    pg.add_style_tag(content="#dfl-dock{display:none!important}")
    return pg


def slides(pg):
    print("slides")
    data = pg.evaluate("TribeDesignData.SLIDES")
    for s in data:
        body = f"<!-- theme: {s['theme']} -->\n\n" + s["body"].replace("{{title}}", s["t"]).replace("{{sub}}", s["d"])
        html = pg.evaluate("b => TribeDeck.html(TribeDeck.parse(b), 'x')", body)
        p2 = pg.context.new_page(); p2.set_viewport_size({"width": 960, "height": 540}); p2.set_content(html); p2.wait_for_timeout(300)
        webp(p2.screenshot(), OUT_D / f"slides-{s['id']}.webp"); p2.close()


def canvas(pg):
    print("canvas templates (screens, posters, logos)")
    d = pg.evaluate("({ screen: TribeDesignData.SCREENS.map(x => x.id), poster: TribeDesignData.POSTERS.map(x => x.id), logo: TribeDesignData.LOGOS.map(x => x.id) })")
    asks = {"screen": "Ember Coffee", "poster": "Open mic night, Friday 8pm", "logo": "Lantern Studio"}
    for kind, ids in d.items():
        for i in ids:
            pg.goto(f"{B}/?skipIntro=1#/hub/design"); pg.wait_for_function("window.TribeDesignFlow && document.querySelector('#dfl .dfl-kind')", timeout=20000)
            pg.add_style_tag(content="#dfl-dock{display:none!important}")
            pg.evaluate("([k, i, a]) => TribeDesignFlow.create(k, i, a)", [kind, i, asks[kind]])
            pg.wait_for_function("window.TribeCanvas && TribeCanvas.state().open && TribeCanvas.state().nodes.some(n => n.t === 'frame' && !n.p)", timeout=15000)
            pg.wait_for_timeout(1800 if kind == "screen" else 600)
            fid = pg.evaluate("(() => { const f = TribeCanvas.state().nodes.filter(n => n.t === 'frame' && !n.p); return f[f.length - 1].id; })()")
            url = pg.evaluate("id => TribeCanvasCode.exportData(id, 'png', 1).then(r => r.url)", fid)
            webp(base64.b64decode(url.split(",", 1)[1]), OUT_D / f"{kind}-{i}.webp", fit="cover" if kind == "screen" else "contain")


def boards(pg):
    print("whiteboards")
    for i in pg.evaluate("TribeDesignData.BOARDS.map(x => x.id)"):
        pg.goto(f"{B}/?skipIntro=1#/hub/design"); pg.wait_for_function("window.TribeDesignFlow && document.querySelector('#dfl .dfl-kind')", timeout=20000)
        pg.add_style_tag(content="#dfl-dock{display:none!important}")
        pg.evaluate("i => TribeDesignFlow.create('whiteboard', i, 'What should level one feel like?')", i)
        pg.wait_for_timeout(1500)
        el = pg.query_selector("#view-whiteboard canvas, .wb-stage, #wb") or pg.query_selector("body")
        webp(el.screenshot(), OUT_D / f"board-{i}.webp")


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        if ONLY in ("", "sites"): sites()
        if ONLY in ("", "starters"):
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"]); starters(b.new_page()); b.close()
        if ONLY in ("", "slides", "canvas", "boards"):
            pg = app_page(p)
            if ONLY in ("", "slides"): slides(pg)
            if ONLY in ("", "canvas"): canvas(pg)
            if ONLY in ("", "boards"): boards(pg)
    srv.shutdown()


if __name__ == "__main__":
    main()
