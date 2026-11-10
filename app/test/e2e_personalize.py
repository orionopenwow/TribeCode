"""Make it yours (v0.28): the first-launch personalization a new host sees before the focused first run.
Three steps (you: name + icon, look: theme + accent, last touches: language + text size) with a live preview; choices
apply as you click and persist; Skip/Esc leave at any point; it hands off to the first run so only one onboarding thing
shows at a time; it reopens from Settings and the profile menu; never with ?skipIntro. Screenshots go to $PZ_SHOTS."""
import json, os, struct, subprocess, tempfile, time, urllib.request, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5310 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("PZ_SHOTS") or tempfile.mkdtemp(prefix="tribe-pz-shots-")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []

def png(path, w, h):
    raw = b"".join(b"\x00" + b"".join(bytes((x * 255 // max(1, w - 1), y * 255 // max(1, h - 1), 120)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

def api(path, token=None):
    r = urllib.request.Request(BASE + "/api" + path, headers={"Authorization": "Bearer " + token} if token else {})
    with urllib.request.urlopen(r, timeout=20) as x: return json.loads(x.read() or b"{}")

def overlays(pg):
    return pg.evaluate("['#pz', '#fr-start', '#wl', '.fg-bubble', '#fg-intro'].filter(s => { const e = document.querySelector(s); return e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; })")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-pz-", dir="/tmp")); pic = tmp / "me.png"; png(pic, 320, 320)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: api("/health"); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            # not with ?skipIntro, even with the test flag for the first run on
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePersonalize", timeout=15000)
            time.sleep(1); assert pg.locator("#pz").count() == 0, "never with ?skipIntro"
            assert not pg.evaluate("TribePersonalize.pending()")
            # 1. first launch of a fresh tribe: Make it yours comes first, alone
            pg.goto(BASE + "/?personalize=1&focus=1"); pg.wait_for_selector("#pz", timeout=15000)
            assert "What should friends call you?" in pg.text_content("#pz-t")
            time.sleep(1.2); assert overlays(pg) == ["#pz"], f"one onboarding thing at a time: {overlays(pg)}"
            assert pg.locator(".pz-av").count() == 12, "one tidy grid of 12 icons"
            pg.fill("#pz-name", "Camp Wilkins"); pg.click("[data-av='emoji:🦊']"); pg.click("[data-tint='indigo']")
            assert "Camp Wilkins" in pg.text_content(".pz-app"), "the preview shows your name live"
            assert pg.locator(".pz-app .pf-emo:has-text('🦊')").count() >= 1, "the preview shows your icon live"
            pg.screenshot(path=str(SHOTS / "pz-1-you.png"))
            tok = pg.evaluate("TribeStore.get().server.token")
            # upload path: the cropper opens above the card, Apply sets a photo
            pg.set_input_files("#pz-file", str(pic)); pg.wait_for_selector("#crop-wrap .crop-cv", timeout=8000)
            assert pg.evaluate("parseInt(getComputedStyle(document.querySelector('.crop-wrap')).zIndex) > parseInt(getComputedStyle(document.querySelector('#pz')).zIndex)")
            pg.click("#crop-apply"); pg.wait_for_selector(".pz-up.on img", timeout=10000)
            av = None
            for _ in range(30):
                prof = api("/profile", tok).get("profile", {}); av = prof.get("avatar") or {}
                if av.get("kind") == "photo": break
                time.sleep(0.2)
            assert av and av.get("kind") == "photo", f"photo saved: {av}"
            # back to an emoji (saved on Next)
            pg.click("[data-av='emoji:🦊']"); pg.click("#pz-next")
            pg.wait_for_selector(".pz-th", timeout=5000)
            for _ in range(30):
                prof = api("/profile", tok).get("profile", {}); av = prof.get("avatar") or {}
                if av.get("emoji") == "🦊": break
                time.sleep(0.2)
            assert av.get("kind") == "emoji" and av.get("emoji") == "🦊" and av.get("tint") == "indigo", f"icon saved: {av}"
            assert pg.evaluate("TribeStore.get().name") == "Camp Wilkins", "name saved"
            # 2. look: a theme applies the moment you click it
            assert "Pick a look" in pg.text_content("#pz-t")
            assert pg.locator(".pz-th").count() == pg.evaluate("TribeThemes.list.length")
            pg.click("[data-th='nordic']")
            assert pg.evaluate("document.body.dataset.theme") == "nordic", "theme applies live"
            pg.screenshot(path=str(SHOTS / "pz-2-look.png"))
            pg.click("[data-acc='#38C6B1']") if pg.locator("[data-acc='#38C6B1']").count() else None
            # back keeps your picks
            pg.click("#pz-back"); assert pg.input_value("#pz-name") == "Camp Wilkins"; pg.click("#pz-next")
            pg.click("#pz-next")
            # 3. last touches: text size applies live
            assert "Last touches" in pg.text_content("#pz-t")
            pg.click("[data-fs='l']"); assert pg.evaluate("document.documentElement.dataset.fs") == "l"
            pg.click("[data-lang='es']"); pg.wait_for_function("document.querySelector('#pz-t').textContent.includes('Últimos detalles')", timeout=5000)
            pg.screenshot(path=str(SHOTS / "pz-3-touch-es.png"))
            pg.click("[data-lang='en']"); pg.wait_for_function("document.querySelector('#pz-t').textContent.includes('Last touches')", timeout=5000)
            pg.click("[data-fs='']")
            pg.click("#pz-next")   # Done
            # hand-off: the focused first run takes over, alone
            pg.wait_for_selector("#fr-start", timeout=10000)
            assert pg.locator("#pz").count() == 0
            assert pg.evaluate("localStorage.getItem('tribecode.personalized')") == "done"
            assert overlays(pg) == ["#fr-start"], f"after Make it yours only the first run shows: {overlays(pg)}"
            # persists after reload, and doesn't show again
            pg.goto(BASE + "/?personalize=1"); pg.wait_for_function("TribeClient.connected() && window.TribePersonalize", timeout=15000); time.sleep(1)
            assert pg.locator("#pz").count() == 0, "shown once"
            assert pg.evaluate("document.body.dataset.theme") == "nordic", "theme persists"
            # 4. reopen from Settings (Close instead of Skip; Esc closes)
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#set-personalize", timeout=5000); pg.click("#set-personalize")
            pg.wait_for_selector("#pz"); assert pg.text_content("#pz-skip").strip() == "Close"
            assert pg.input_value("#pz-name") == "Camp Wilkins"
            pg.keyboard.press("Escape"); pg.wait_for_selector("#pz", state="detached", timeout=3000)
            # and from the profile menu
            if pg.locator("#pf-btn").count():
                pg.click("#pf-btn"); pg.click("[data-act='personalize']"); pg.wait_for_selector("#pz"); pg.click("#pz-skip"); pg.wait_for_selector("#pz", state="detached", timeout=3000)
            # 5. Skip on a first launch: leaves at once and remembers it
            pg.evaluate("localStorage.removeItem('tribecode.personalized')")
            pg.goto(BASE + "/?personalize=1"); pg.wait_for_selector("#pz", timeout=15000)
            pg.keyboard.press("Escape"); pg.wait_for_selector("#pz", state="detached", timeout=3000)
            assert pg.evaluate("localStorage.getItem('tribecode.personalized')") == "skipped"
            assert pg.evaluate("document.body.dataset.theme") == "nordic", "skipping keeps what you picked"
            # 6. phone width: the card fits, no preview
            pg.evaluate("localStorage.removeItem('tribecode.personalized')"); pg.set_viewport_size({"width": 390, "height": 844})
            pg.goto(BASE + "/?personalize=1"); pg.wait_for_selector("#pz", timeout=15000)
            assert pg.evaluate("document.querySelector('.pz-card').getBoundingClientRect().right <= innerWidth + 1")
            assert not pg.is_visible(".pz-prev")
            time.sleep(0.6); pg.screenshot(path=str(SHOTS / "pz-phone.png"))
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("e2e_personalize: OK (first launch alone, icon + photo, theme live + persists, text size, language, hand-off, reopen, skip, phone)")
    finally:
        srv.kill()

if __name__ == "__main__":
    main()
