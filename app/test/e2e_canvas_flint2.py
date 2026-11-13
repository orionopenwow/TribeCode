"""Flint on the design canvas understands the user's report (feat/flint-site): the screenshot's phrases, no AI.

  "make a landing hero for Lantern" builds the screen. "link tree website" opens the website designer with the
  link-in-bio template and leaves the canvas alone. "functional buttons" wires every button to a screen (making the
  screens it needs); "Send to app"'s HTML has real links. "make a dark mode" recolors the layers in place (not the app
  theme, no "Switched to Campfire"), Ctrl Z brings the colors back. "Dark mode version" makes a dark copy beside it.
  "add a page" and "new screen called settings" add screens. With a layer selected: "wire this button to the login
  screen" links it; "edit this image" opens the file chooser and fills it with the picture; "make the picture round".
  A freeform ask gets the one AI-boost card ("Use my AI", "Get credits / Premium"), never "Send to my AI helper".
  "teach me the canvas" opens the lesson. No console errors.
Usage: python app/test/e2e_canvas_flint2.py
"""
import base64, json, os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
from e2e_canvas_flintpane import api, ok, settings_js, watch, errors  # noqa: E402
import e2e_canvas_flintpane as FP  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FP.PORT = PORT = 5520 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
FP.BASE = BASE = f"http://localhost:{PORT}"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGklEQVR4nGP4z8DwnwEKGBgYmBgY0AUQAgB9xwP9a7f1YQAAAABJRU5ErkJggg==")


def nodes(page): return page.evaluate("TribeCanvas.state().nodes")


def roots(page): return [n for n in nodes(page) if not n.get("p")]


def ask(page, text):
    return FP.ask(page, text)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cf2-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Lantern Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Orion", tok, pid))
            o = ctx.new_page(); watch(o, "orion")
            FP.open_canvas(o)
            theme0 = o.evaluate("document.documentElement.dataset.theme || ''")

            out = ask(o, "make a landing hero for Lantern")
            assert "Lantern" in out, out
            hero = roots(o)[-1]
            n0 = len(roots(o))

            # ---- "link tree website": a website, so the website designer opens with the template
            out = ask(o, "link tree website")
            assert "website designer" in out and "link" in out.lower(), out
            o.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().template === 'linkbio'", timeout=8000)
            assert len(roots(o)) == n0, "the canvas is left alone"
            o.click("#wdz [data-wdz='close']")

            # ---- "functional buttons": every button goes to a screen; Send to app has real links
            out = ask(o, "functional buttons")
            assert "Wired" in out, out
            linked = [n for n in nodes(o) if n.get("link")]
            assert linked, "buttons have links"
            names = {n["name"] for n in roots(o)}
            assert any(n["link"].get("name") in names for n in linked), (linked, names)
            html = o.evaluate("id => TribeCanvasScene.toHTML((() => { const S = TribeCanvasScene.create(); TribeCanvas.state().nodes.forEach(n => S.nodes.set(n.id, n)); return S; })(), id).html", hero["id"])
            assert "<a " in html and 'href="#' in html, html[:400]

            # ---- "make a dark mode": the layers themselves, not the app theme
            fill0 = next(n for n in nodes(o) if n["id"] == hero["id"]).get("fill")
            out = ask(o, "make a dark mode")
            assert "Campfire" not in out and "dark mode in place" in out, out
            fill1 = next(n for n in nodes(o) if n["id"] == hero["id"]).get("fill")
            assert fill1 != fill0 and fill1.upper() in ("#111318", "#22262E", "#1A1D23"), (fill0, fill1)
            assert o.evaluate("document.documentElement.dataset.theme || ''") == theme0, "the app theme did not change"
            o.focus("#cv-stage"); o.keyboard.press("Control+z")
            o.wait_for_function("([id, f]) => TribeCanvas.state().nodes.find(n => n.id === id).fill === f", arg=[hero["id"], fill0], timeout=4000)
            n1 = len(roots(o))
            out = ask(o, "Dark mode version")
            assert len(roots(o)) == n1 + 1 and "dark" in out.lower(), out

            # ---- pages and screens
            n2 = len(roots(o))
            out = ask(o, "add a page")
            assert len(roots(o)) == n2 + 1, out
            out = ask(o, "new screen called settings")
            assert any(r["name"].lower().startswith("settings") for r in roots(o)), out

            # ---- with a selection: wire, edit the image, round it
            btn = next(n for n in nodes(o) if n.get("p") and n.get("t") != "text" and n.get("r") and n.get("h", 99) <= 72)
            o.evaluate("id => TribeCanvas._e.select([id])", btn["id"])
            out = ask(o, "wire this button to the login screen")
            got = next(n for n in nodes(o) if n["id"] == btn["id"]).get("link") or {}
            assert "login" in (got.get("name") or "").lower() or "sign" in (got.get("name") or "").lower(), (out, got)
            pic = next(n for n in nodes(o) if n.get("p") and n.get("t") == "rect" and n.get("w", 0) >= 200 and n.get("h", 0) >= 120)
            o.evaluate("id => TribeCanvas._e.select([id])", pic["id"])
            with o.expect_file_chooser() as fc:
                ask(o, "edit this image")
            fc.value.set_files({"name": "pic.png", "mimeType": "image/png", "buffer": PNG})
            o.wait_for_function("id => (TribeCanvas.state().nodes.find(n => n.id === id).img || '').startsWith('data:image/')", arg=pic["id"], timeout=5000)
            ask(o, "make the picture round")
            got = next(n for n in nodes(o) if n["id"] == pic["id"])
            assert got.get("r", 0) >= min(got["w"], got["h"]) // 2 - 1, got

            # ---- a freeform ask: the one AI-boost card
            o.evaluate("TribeCanvas._e.select([])")
            ask(o, "draw a moody watercolor of lanterns over a lake")
            card = o.locator("#cv-fpane .fl-thread .boost").last
            assert card.is_visible(), "the AI-boost card"
            t = card.inner_text()
            assert "Use my AI" in t and "Get credits / Premium" in t, t
            assert "Send to my AI helper" not in o.content()

            # ---- a lesson
            ask(o, "teach me the canvas")
            o.wait_for_selector("#fls:not([hidden])", timeout=4000)
            assert "canvas" in o.inner_text("#fls h3").lower()
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_canvas_flint2: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
