"""Fresh open (v0.28.1): opening TribeCode for the first time on the computer that runs it creates nothing and starts
no demo. The Dashboard shows an honest empty state (one primary action: Start your first project; Join with a link
beside it), Make it yours comes first, then Flint offers a quick look around and flies to each place (the project
places on a small "Inside a project" frame). Pause keeps your place and the Dashboard's link resumes it. The demo runs
only when asked: Ctrl K "Start demo" or ?demo=showcase. Start your first project then makes the tribe (you're host).
Screenshots go to $FO_SHOTS."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5350 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("FO_SHOTS") or tempfile.mkdtemp(prefix="tribe-fo-shots-")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []

def health():
    with urllib.request.urlopen(BASE + "/api/health", timeout=10) as r: return json.loads(r.read())

def bubble(pg):
    pg.wait_for_selector("#fg-bubble.on", timeout=10000)
    time.sleep(0.15)
    return pg.text_content("#fg-bubble")

def landed(pg):
    """Flint's sprite sits next to the ring around the target (he flew there)."""
    return pg.evaluate("""() => { const s = document.querySelector('#fg-sprite').getBoundingClientRect(), r = document.querySelector('#fg-ring');
      if (!r || !r.classList.contains('on')) return false; const b = r.getBoundingClientRect();
      const dx = Math.max(b.left - s.right, s.left - b.right, 0), dy = Math.max(b.top - s.bottom, s.top - b.bottom, 0); return Math.hypot(dx, dy) < 90; }""")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fo-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: health(); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            # 1. fresh open: nothing created, no demo, the Dashboard behind Make it yours
            pg.goto(BASE + "/?freshopen=1&personalize=1&flinttour=1"); pg.wait_for_selector("#pz", timeout=15000)
            assert health()["members"] == 0, "opening the app makes no tribe"
            assert not pg.evaluate("!!(window.TribeOffline && TribeOffline.active && TribeOffline.active())"), "no demo on open"
            assert pg.evaluate("TribeApp.fresh()"), "the app knows there's no tribe yet"
            assert pg.locator("#view-hub:not(.hidden) #hub-hero.hub-empty").count() == 1, "the Dashboard's empty state is underneath"
            assert "Start your first project" in pg.text_content("#hub-host")
            assert pg.locator("#hub-demo").count() == 0, "the demo isn't offered on the Dashboard"
            pg.screenshot(path=str(SHOTS / "fo-1-personalize.png"))
            # 2. Make it yours works without a tribe (saved on this device)
            pg.fill("#pz-name", "Camp"); pg.click("[data-av='emoji:🦊']")
            pg.click("#pz-next"); pg.wait_for_selector(".pz-th", timeout=5000); pg.click("#pz-next"); pg.click("#pz-next")
            pg.wait_for_selector("#pz", state="detached", timeout=5000)
            st = pg.evaluate("TribeStore.get()")
            assert st.get("name") == "Camp" and (st.get("pendingAvatar") or {}).get("emoji") == "🦊", st
            # ...and before any tribe, the user bar, the profile button and Home all show that you
            pg.wait_for_function("document.querySelector('#ub-name').textContent === 'Camp'", timeout=5000)
            assert pg.locator("#pf-face.pf-k-emoji").count() == 1 and "🦊" in pg.text_content("#pf-face"), "profile button shows your icon"
            assert pg.locator(".hub-head .hid-av.pf-k-emoji").count() == 1, "Home's greeting shows your icon"
            body = pg.evaluate("document.body.innerText")
            assert "not in a tribe" not in body.lower() and body.count("Just you for now") == 1, "said once, in the user bar (no repeated labels)"
            # 3. Flint offers a look around (alone on screen), then flies to each place
            txt = bubble(pg); assert "quick look around" in txt, txt
            assert pg.locator("#fr-start, #wl, #intro, #pz").count() == 0, "one thing at a time"
            pg.screenshot(path=str(SHOTS / "fo-2-offer.png"))
            pg.click("#fg-next")
            seen, total, paused = [], None, False
            for n in range(30):
                txt = bubble(pg)
                step = pg.text_content(".fg-steps") or ""
                cur, total = [int(x) for x in step.replace(" ", "").split("/")]
                assert landed(pg), f"Flint landed at stop {cur}: {txt}"
                seen.append(cur)
                if cur == 5:
                    assert pg.locator("#ft-mock").count() == 1, "project places shown on the Inside a project frame"
                    pg.screenshot(path=str(SHOTS / "fo-3-project-frame.png"))
                if cur == 3 and not paused:
                    pg.click("#fg-skip")   # Pause
                    pg.wait_for_selector("#fg-bubble.on", state="detached", timeout=5000) if pg.locator("#fg-bubble.on").count() else None
                    time.sleep(0.6)
                    s = pg.evaluate("TribeFlintTour.state()"); assert s.get("paused") and s.get("i") == 2, s
                    pg.wait_for_selector("#hub-tour", timeout=5000)
                    assert "Continue the tour" in pg.text_content("#hub-tour")
                    pg.click("#hub-tour"); paused = True
                    txt = bubble(pg); assert (pg.text_content(".fg-steps") or "").replace(" ", "").startswith("3/"), "resumes where you paused"
                    continue
                if cur == total:
                    pg.screenshot(path=str(SHOTS / "fo-4-last.png"))
                    pg.click("#fg-next"); break
                pg.click("#fg-next")
            visited = sorted(set(seen))
            assert len(visited) >= 8, f"tour visits at least 8 places: {visited}"
            time.sleep(0.6)
            assert pg.evaluate("TribeFlintTour.state()").get("done"), "tour marked done"
            assert pg.locator("#ft-mock").count() == 0, "the frame goes away"
            assert health()["members"] == 0, "the tour creates nothing"
            pg.screenshot(path=str(SHOTS / "fo-5-dashboard.png"))
            # 4. the demo only when asked: Ctrl K "Start demo" opens the chooser
            pg.keyboard.press("Control+k"); pg.wait_for_selector("#pal-input", timeout=5000)
            pg.fill("#pal-input", "Start demo"); time.sleep(0.3); pg.keyboard.press("Enter")
            pg.wait_for_selector("#invite-body .od-choice", timeout=5000)
            pg.click("#invite-body [data-close]")
            assert not pg.evaluate("TribeOffline.active()"), "choosing nothing starts nothing"
            # 5. Start your first project makes the tribe, with you as host
            pg.click("#hub-host")
            pg.wait_for_function("TribeClient.connected() && (TribeClient.state().me || {}).role === 'host'", timeout=15000)
            assert health()["members"] >= 1
            for _ in range(30):
                prof = pg.evaluate("TribeClient.api('/profile').then(r => r.profile).catch(() => ({}))")
                if (prof.get("avatar") or {}).get("emoji") == "🦊": break
                time.sleep(0.2)
            assert (prof.get("avatar") or {}).get("emoji") == "🦊", f"the icon you picked became your profile: {prof}"
            # 6. with a project, "Continue the tour" goes round the real places
            pg.wait_for_selector("#ft-chip", timeout=15000)
            pg.screenshot(path=str(SHOTS / "fo-6-continue-chip.png"))
            pg.click("#ft-chip-go")
            real = []
            for n in range(20):
                txt = bubble(pg); assert landed(pg), txt
                real.append(pg.evaluate("""(() => { const r = document.querySelector('#fg-ring').getBoundingClientRect();
                  return ['nest-chat', 'nest-docs', 'nest-canvas', 'nest-ws-tasks', 'nest-ws-agents'].find(id => { const e = document.getElementById(id); if (!e) return false; const b = e.getBoundingClientRect();
                    return Math.abs(b.left - (r.left + 6)) < 4 && Math.abs(b.top - (r.top + 6)) < 4; }) || ''; })()"""))
                if txt.startswith("Messages"):
                    assert pg.locator("#ft-mock").count() == 0, "no frame once you have a project"
                    pg.screenshot(path=str(SHOTS / "fo-7-real-messages.png"))
                cur, total2 = [int(x) for x in (pg.text_content(".fg-steps") or "0/0").replace(" ", "").split("/")]
                if cur == total2: pg.click("#fg-next"); break
                pg.click("#fg-next")
            assert "nest-chat" in real and "nest-canvas" in real and "nest-ws-tasks" in real, f"real project places: {real}"
            time.sleep(0.5); s = pg.evaluate("TribeFlintTour.state()"); assert s.get("project"), s
            assert pg.locator("#ft-chip").count() == 0
            ctx.close()
            # 6. ?demo=showcase still starts the demo (asked for by URL)
            ctx2 = b.new_context(viewport={"width": 1235, "height": 776}); pg2 = ctx2.new_page(); pg2.on("pageerror", lambda e: errors.append(str(e)))
            pg2.goto(BASE + "/?demo=showcase"); pg2.wait_for_function("window.TribeOffline && TribeOffline.active()", timeout=15000)
            ctx2.close(); b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print(f"ok e2e_fresh_open (nothing created, no demo, empty Dashboard, Make it yours offline, Flint tour {len(visited)}/{total} stops with pause + resume, Ctrl K demo, Start makes the tribe, ?demo=showcase)  shots: {SHOTS}")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
