"""Help: the filled ? at the far right of the title bar (right of the window buttons) opens the Guide, shortcuts,
bug report, updates and links. Also: Campfire is the default theme, and an old saved 'dark' default becomes Campfire.
Usage: python app/test/e2e_help.py
"""
import os, signal, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4977 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-help-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=30000)
            assert pg.evaluate("document.body.dataset.theme") == "campfire", "Campfire is the default"
            pg.evaluate("document.body.classList.add('tauri')")   # show the window buttons like the desktop app
            pg.wait_for_selector("#tb-help", state="visible")
            assert pg.evaluate("document.querySelector('#tb-help').getBoundingClientRect().right <= document.querySelector('#win-ctl .tl-max').getBoundingClientRect().left"), "? sits left of the window buttons (left of the green one)"
            assert pg.evaluate("document.querySelector('#tb-help').getBoundingClientRect().top < 60"), "? is in the title bar"
            # feat/help-next: six entries by intent; "Something's wrong" opens a short second list; the rest is in the Help center
            pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help=next]")
            assert pg.evaluate("[...document.querySelectorAll('#help-menu .hm-sec [data-help]')].map(b => b.dataset.help).join()") == "next,quick,learn,flint,wrong,keys,new"
            pg.click("#help-menu [data-help=wrong]"); pg.wait_for_selector("#help-menu [data-help=bug]")
            for k in ["trouble", "bug", "update"]: assert pg.locator(f"#help-menu [data-help={k}]").count() == 1, k
            pg.click("#help-menu [data-help-back]"); pg.wait_for_selector("#help-menu [data-help=keys]")
            pg.click("[data-help=keys]"); pg.wait_for_selector("#help-keys .hk-row"); pg.keyboard.press("Escape"); pg.wait_for_selector("#help-keys", state="detached")
            pg.keyboard.press("Control+/"); pg.wait_for_selector("#help-keys"); pg.click("#hk-close")
            pg.click("#tb-help"); pg.click("[data-help=learn]"); pg.wait_for_function("TribeGuide.isOpen()", timeout=8000)
            pg.wait_for_selector("#guide .gd-paths .gd-path")
            for k in ["tour", "watch", "demo", "start", "claude", "phones", "docs", "gh"]: assert pg.locator(f"#guide [data-help={k}]").count() == 1, k
            # an old device with theme 'dark' saved by default gets Campfire; picking TribeCode Dark sticks
            old = b.new_page(); old.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', theme: 'dark', themeDark: 'dark'})); }")
            old.goto(BASE + "/?skipIntro=1"); old.wait_for_function("window.TribeThemes", timeout=15000)
            assert old.evaluate("document.body.dataset.theme") == "campfire"
            old.evaluate("TribeStore.set(TribeThemes.pick('dark')); TribeThemes.apply(TribeStore.get())"); assert old.evaluate("document.body.dataset.theme") == "dark"
            old.reload(); old.wait_for_function("window.TribeThemes", timeout=15000); assert old.evaluate("document.body.dataset.theme") == "dark", "a picked theme sticks"
            b.close()
        assert not errors, errors
        print("e2e_help: OK (? left of the window buttons, menu, shortcuts, Guide; Campfire default + migration)")
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()

if __name__ == "__main__":
    main()
