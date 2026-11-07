"""Picture cropper: new-project setup and the overview's picture use a Discord-style frame step (drag, zoom,
round + square preview, Apply), with limits (type, 10 MB, at least 64 px). Usage: python app/test/e2e_cropper.py
"""
import json, os, signal, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4961 + OFF
BASE = f"http://localhost:{PORT}"
errors = []

def png(path, w, h):
    raw = b"".join(b"\x00" + b"".join(bytes((x * 255 // max(1, w - 1), y * 255 // max(1, h - 1), 120)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

def api(path, token=None):
    req = urllib.request.Request(BASE + "/api" + path, headers={"Authorization": "Bearer " + token} if token else {})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-crop-", dir="/tmp"))
    big, tiny = tmp / "wide.png", tmp / "tiny.png"; png(big, 480, 300); png(tiny, 40, 40)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: api("/health"); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=15000)
            tok = pg.evaluate("TribeStore.get().server.token")
            # too small: refused with a clear message, no editor
            with pg.expect_file_chooser() as fc: pg.evaluate("void TribeCropper.pick({})")
            fc.value.set_files(str(tiny)); pg.wait_for_selector(".toast:has-text('too small')", timeout=5000)
            assert pg.locator("#crop-wrap").count() == 0
            # new project setup: upload -> frame -> Apply -> the setup shows the framed picture
            pg.evaluate("TribeProjects.openNew()"); pg.wait_for_selector("[data-ns='tpl:game']", timeout=10000); pg.click("[data-ns='tpl:game']")
            pg.wait_for_selector("#np-pic", timeout=10000)
            pg.fill("#np-input", "Glow Garden")
            with pg.expect_file_chooser() as fc: pg.click("#np-pic")
            fc.value.set_files(str(big)); pg.wait_for_selector("#crop-wrap .crop-cv")
            box = pg.locator(".crop-cv").bounding_box()
            pg.mouse.move(box["x"] + 140, box["y"] + 140); pg.mouse.down(); pg.mouse.move(box["x"] + 60, box["y"] + 140, steps=5); pg.mouse.up()
            pg.fill("#crop-z", "2"); pg.dispatch_event("#crop-z", "input")
            if "--shots" in sys.argv: pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "cropper.png"))
            pg.click("#crop-apply"); pg.wait_for_selector("#crop-wrap", state="detached")
            src = pg.get_attribute("#np-pic img", "src"); assert src and src.startswith("data:image/"), src
            assert pg.input_value("#np-input") == "Glow Garden", "the name survives the picture step"
            pg.click("#np-create"); pg.wait_for_function("TribeProjects.cur() && TribeProjects.cur().name === 'Glow Garden'", timeout=15000)
            pg.wait_for_selector("#invite-modal:not(.hidden)", timeout=10000); pg.wait_for_timeout(1200)   # the invite sheet follows creating (it can open twice)
            pg.evaluate("TribeApp.closeInvite ? TribeApp.closeInvite() : document.querySelector('#invite-modal').classList.add('hidden')"); pg.wait_for_timeout(300); pg.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            pg.wait_for_selector("#invite-modal.hidden", state="attached", timeout=5000)
            pid = pg.evaluate("TribeProjects.current()")
            stored = [x for x in api("/projects", tok)["projects"] if x["id"] == pid][0]["image"]
            assert stored and stored.startswith("data:image/") and len(stored) < 300_000
            # change it from the overview: Cancel keeps the old one, Apply replaces it
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#pj-face", timeout=10000)
            with pg.expect_file_chooser() as fc: pg.click("#pj-face")
            fc.value.set_files(str(big)); pg.wait_for_selector("#crop-wrap"); pg.click("#crop-cancel")
            assert [x for x in api("/projects", tok)["projects"] if x["id"] == pid][0]["image"] == stored
            with pg.expect_file_chooser() as fc: pg.click("#pj-face")
            fc.value.set_files(str(big)); pg.wait_for_selector("#crop-wrap"); pg.fill("#crop-z", "3.5"); pg.dispatch_event("#crop-z", "input"); pg.click("#crop-apply")
            pg.wait_for_selector(".toast:has-text('Picture updated')", timeout=8000)
            assert [x for x in api("/projects", tok)["projects"] if x["id"] == pid][0]["image"] != stored
            # phone: the cropper fits at 390px
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', server: {{url: '{BASE}', token: '{tok}'}}}}))")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("TribeClient.connected()", timeout=15000)
            with ph.expect_file_chooser() as fc: ph.evaluate("void TribeCropper.pick({})")
            fc.value.set_files(str(big)); ph.wait_for_selector("#crop-wrap .crop-cv")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.crop').getBoundingClientRect().right <= innerWidth")
            b.close()
        assert not errors, errors
        print("e2e_cropper: OK (limits, frame + zoom + Apply in setup and overview, Cancel keeps the old picture, phone)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
