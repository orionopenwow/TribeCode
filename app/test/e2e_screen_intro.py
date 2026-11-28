"""Screen intros (feat/p13b-intro: app/ui/screenintro.js + screenintro.css).

Every main screen shows a short set of slides the first time it opens on a device. Automated browsers never see them
unless the address has ?intro=1, so every other test is unaffected (checked first here).
  - Without ?intro=1: nothing shows and TribeIntro.maybe() resolves false.
  - With ?intro=1: the first screen's intro shows; Esc skips it. Home's first open shows 3 slides: Next, Back,
    arrow keys, the dots, Get started on the last; remembered after a reload.
  - Messages' first open shows its one slide (no dots); Skip closes it.
  - No stacking: a screen opened under an intro, and a maybe() called while one is up, wait their turn.
  - Settings: its own intro shows over the Settings window, Esc closes only the intro; "Show intros again" brings
    the screen's intro back. Help › Tour this screen shows the intro for where you are.
  - Files, Task Board, Design Studio, Code, Work and App Creator each show their own intro once.
  - 390px phone: a full-width bottom sheet, a swipe moves between slides, nothing scrolls sideways.
Usage: python app/test/e2e_screen_intro.py [--shots DIR]"""
import os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5660 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
def shot(pg, name):
    if SHOTS: time.sleep(0.35); SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'intro-{name}.png'))

SEED = "if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))"
# how many intro sheets were ever on screen at the same time
COUNT = "window.__sciMax=0;new MutationObserver(()=>{window.__sciMax=Math.max(window.__sciMax,document.querySelectorAll('.sci-wrap').length)}).observe(document,{childList:true,subtree:true})"

def key(pg): return pg.evaluate("(document.querySelector('#sci')||{dataset:{}}).dataset.key || ''")
def wait_intro(pg, k, timeout=10000):
    pg.wait_for_function(f"document.querySelector('#sci') && document.querySelector('#sci').dataset.key === '{k}' && document.querySelector('#sci').classList.contains('on')", timeout=timeout)
def wait_gone(pg, timeout=5000): pg.wait_for_function("!document.querySelector('#sci')", timeout=timeout)
def slide(pg): return int(pg.evaluate("document.querySelector('#sci').dataset.slide"))

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-intro-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/health", timeout=1); break
        except Exception: time.sleep(0.25)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- the webdriver gate: existing tests never see an intro
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeIntro", timeout=20000)
            time.sleep(2.5)
            assert pg.locator("#sci").count() == 0, "an intro showed in an automated browser without ?intro=1"
            assert pg.evaluate("TribeIntro.maybe('x', [{title:'x'}])") is False
            print("ok  automated browsers see no intro without ?intro=1")

            # ---- desktop (the same browser, now asking for intros)
            ctx.add_init_script(COUNT)
            pg.goto(BASE + "/?skipIntro=1&intro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeIntro", timeout=20000)
            first = pg.evaluate("TribeIntro.current()")
            wait_intro(pg, first, 12000)
            pg.wait_for_function("document.activeElement && document.activeElement.closest('#sci') !== null", timeout=3000)   # focus is in the intro
            pg.keyboard.press("Escape"); wait_gone(pg)
            assert pg.evaluate(f"TribeIntro.seen('{first}')"), "Esc did not remember the intro"
            print(f"ok  the first screen ({first}) shows its intro; Esc skips it and it is remembered")

            # Home: 3 slides
            pg.evaluate("TribeHub.open('home')"); wait_intro(pg, 'home')
            assert pg.locator("#sci .sci-dot").count() == 3 and slide(pg) == 0
            assert pg.locator("#sci .sci-back").is_hidden(), "Back shows on the first slide"
            assert pg.locator("#sci .sci-art img, #sci .sci-art .sci-m").count() >= 1, "no art"
            assert "TribeCode" in pg.text_content("#sci .sci-eye")
            shot(pg, "home-1-1440")
            pg.keyboard.press("ArrowRight"); time.sleep(0.25); assert slide(pg) == 1
            shot(pg, "home-2-1440")
            pg.click("#sci .sci-back"); time.sleep(0.2); assert slide(pg) == 0
            pg.click("#sci .sci-next"); pg.click("#sci .sci-next"); time.sleep(0.2); assert slide(pg) == 2
            assert pg.inner_text("#sci .sci-next").strip() == "Get started", pg.inner_text("#sci .sci-next")
            assert pg.locator("#sci .sci-bul li").count() >= 2
            shot(pg, "home-3-1440")
            pg.keyboard.press("ArrowLeft"); time.sleep(0.2); assert slide(pg) == 1
            pg.click("#sci [data-sci-dot='2']"); time.sleep(0.2); assert slide(pg) == 2
            # focus stays inside
            for _ in range(6): pg.keyboard.press("Tab")
            assert pg.evaluate("document.activeElement.closest('#sci') !== null"), "Tab left the intro"
            pg.click("#sci .sci-next"); wait_gone(pg)
            assert pg.evaluate("TribeIntro.seen('home')")
            print("ok  Home: 3 slides, Next/Back/arrows/dots, Get started on the last, focus stays inside")

            pg.reload(); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeIntro", timeout=20000)
            pg.evaluate("TribeHub.open('home')"); time.sleep(2.5)
            assert pg.locator("#sci").count() == 0, "Home's intro came back after a reload"
            print("ok  remembered after a reload")

            # Messages: one slide
            pg.evaluate("TribeApp.show('chat')"); wait_intro(pg, 'messages')
            assert not pg.locator("#sci .sci-dots").is_visible() and pg.inner_text("#sci .sci-next").strip() == "Get started"
            shot(pg, "messages-1440")
            pg.click("#sci .sci-skip"); wait_gone(pg)
            assert pg.evaluate("TribeIntro.seen('messages')")
            print("ok  Messages: its one slide on first open; Skip closes it")

            # No stacking
            pg.evaluate("TribeIntro.reset('files'); TribeIntro.reset('home'); window.__sciMax = 0")
            pg.evaluate("TribeHub.open('home')"); wait_intro(pg, 'home')
            pg.evaluate("() => { window.__q = null; TribeIntro.maybe('extra', [{eyebrow:'Test', title:'Queued', body:'Waits its turn.'}]).then(v => { window.__q = v; }); }")
            pg.evaluate("TribeApp.show('docs')"); time.sleep(1.5)
            assert pg.locator(".sci-wrap").count() == 1 and key(pg) == 'home', "an intro stacked on another"
            pg.keyboard.press("Escape")
            wait_intro(pg, 'extra'); assert pg.locator(".sci-wrap").count() == 1
            pg.keyboard.press("Escape"); pg.wait_for_function("window.__q === true", timeout=5000)
            wait_intro(pg, 'files')   # the screen that opened underneath gets its turn
            pg.keyboard.press("Escape"); wait_gone(pg)
            assert pg.evaluate("window.__sciMax") == 1, pg.evaluate("window.__sciMax")
            print("ok  no stacking: the queued maybe() and the screen opened underneath wait their turn")

            # Settings: its own intro over the window; Show intros again
            pg.evaluate("TribeSettings.open('about')"); wait_intro(pg, 'settings')
            shot(pg, "settings-1440")
            pg.keyboard.press("Escape"); wait_gone(pg)
            assert pg.evaluate("TribeSettings.isOpen()"), "Esc on the intro closed Settings too"
            pg.wait_for_selector("#set-intros", timeout=5000)
            pg.click("#set-intros")
            assert pg.evaluate("!TribeIntro.seen('home') && !TribeIntro.seen('messages')")
            wait_intro(pg, pg.evaluate("TribeIntro.current()") or 'files')
            pg.keyboard.press("Escape"); wait_gone(pg)
            print("ok  Settings: its intro over the window (Esc keeps Settings open); Show intros again brings them back")

            # Help › Tour this screen
            pg.click("#tb-help"); pg.click("#help-menu [data-help='screen']")
            wait_intro(pg, pg.evaluate("TribeIntro.current()") or 'home')
            pg.keyboard.press("Escape"); wait_gone(pg)
            print("ok  Help › Tour this screen")

            # the other main screens, once each
            for name, js in [('tasks', "TribeApp.show('tasks')"), ('design', "TribeHub.open('design')"), ('code', "TribeHub.open('repos')"), ('work', "TribeTalent.open()")]:
                pg.evaluate(js); wait_intro(pg, name, 12000)
                assert pg.locator("#sci h2").inner_text().strip(), name
                pg.keyboard.press("Escape"); wait_gone(pg)
            pg.evaluate("TribeAppCreator.open({})"); wait_intro(pg, 'appcreator', 15000)
            shot(pg, "appcreator-1440")
            pg.keyboard.press("Escape"); wait_gone(pg)
            assert pg.evaluate("document.body.classList.contains('apc-open')"), "Esc on the intro closed App Creator"
            print("ok  Task Board, Design Studio, Code, Work and App Creator show their own intro")
            state = ctx.storage_state(); ctx.close()

            # ---- phone (same person, a fresh intro memory)
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, storage_state=state)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1&intro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeIntro", timeout=20000)
            pg.evaluate("localStorage.setItem('tribecode.intro.v1', JSON.stringify({dashboard:1, messages:1}))")
            pg.evaluate("TribeHub.open('home')"); wait_intro(pg, 'home', 12000)
            time.sleep(0.4)
            box = pg.locator("#sci .sci-card").bounding_box()
            assert box["width"] >= 389 and abs(box["y"] + box["height"] - 844) <= 2, box
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('#sci .sci-card').scrollWidth <= 390"), "sideways scroll"
            shot(pg, "home-1-390")
            swipe = """dx => { const c = document.querySelector('#sci .sci-card'); const r = c.getBoundingClientRect(); const y = r.top + 120, x0 = r.left + 200;
              const mk = x => new Touch({ identifier: 1, target: c, clientX: x, clientY: y });
              c.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0)], changedTouches: [mk(x0)], bubbles: true }));
              c.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x0 + dx)], bubbles: true })); }"""
            pg.evaluate(swipe, -140); time.sleep(0.3); assert slide(pg) == 1, slide(pg)
            pg.evaluate(swipe, -140); time.sleep(0.3); assert slide(pg) == 2
            shot(pg, "home-3-390")
            pg.evaluate(swipe, 140); time.sleep(0.3); assert slide(pg) == 1
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth")
            pg.click("#sci .sci-skip"); wait_gone(pg)
            print("ok  390px: a full-width bottom sheet, swipe moves between slides, nothing scrolls sideways")
            ctx.close(); b.close()
        assert not errors, errors
        print("PASS e2e_screen_intro")
    finally:
        srv.terminate()
        subprocess.run(["rm", "-rf", str(tmp)])

if __name__ == "__main__":
    main()
