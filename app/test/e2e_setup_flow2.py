"""Setup, seen as a newcomer (feat/setup-github, app/ui/tribenew.js, setuplocal.js, browserfolder.js).
  1. Starting a tribe: step 1 is the name; "More options" opens "Where should it be kept?" with the places in one
     order and plain words (no repo, living repo, home, host, ship or sync in what people read): On this computer
     (recommended) · A folder you pick or create · GitHub · Free cloud · A shared folder · In this browser only.
  2. A folder during setup: the page TribeCode serves browses the computer's folders and has New folder.
  3. A step with one choice is skipped: inside a tribe that lives in this browser, a new project has no More options
     and Create goes straight on.
  4. With no TribeCode behind the page, "A folder you pick or create" uses the browser's own folder window and saves a
     copy of the files there; a browser with no folder window says so calmly and still makes the tribe.
  5. The same list, in the same words, from Sharing and backup later ("Where should it be kept?").
  6. All of it fits a 390px phone.
Usage: python app/test/e2e_setup_flow2.py [--shots]   (--shots writes docs/screenshots/setup2-*.png)"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6770 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv; SHOT_DIR = ROOT / "docs" / "screenshots"
FRESH = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"
BANNED = ("repo", "living", " home", "host", "ship", "sync")
# a folder window that remembers what was written, standing in for the browser's own
FAKE_PICKER = """window.__written = {}; window.__picks = 0;
const mk = (name, base) => ({ kind: 'directory', name, requestPermission: async () => 'granted',
  getDirectoryHandle: async (n) => mk(n, base + n + '/'),
  getFileHandle: async (n) => ({ createWritable: async () => ({ write: async t => { window.__written[base + n] = String(t); }, close: async () => {} }) }) });
window.showDirectoryPicker = async () => { window.__picks++; return mk('Lantern Files', ''); };"""


def api(path, method="GET", body=None):
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=20) as x: return json.loads(x.read() or b"{}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sf2-", dir="/tmp")); errors = []
    home = tmp / "home"; (home / "Games").mkdir(parents=True)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try: api("/health"); break
            except Exception: time.sleep(0.2)
        if SHOTS: SHOT_DIR.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(w=1280, h=820, extra=""):
                ctx = b.new_context(viewport={"width": w, "height": h}); ctx.add_init_script(FRESH + extra)
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(BASE + "/?freshopen=1&skipIntro=1#/hub"); pg.wait_for_function("window.TribeNew && window.TribeLocalSetup && window.TribeApp && window.TribeBrowserFolder && window.TribeGitHubConnect", timeout=20000)
                pg.wait_for_timeout(400)
                return pg
            def step2(pg, name):
                pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.fill("#tn-name", name)
                pg.click("#tn-options"); pg.wait_for_selector("#tn[data-step='2'] [data-tn-where]"); pg.wait_for_timeout(250)
            titles = lambda pg: [t.strip() for t in pg.locator("#tn [data-tn-where] .ph-tt b").evaluate_all("els => els.map(e => e.firstChild.textContent)")]
            prog = lambda pg: [x.strip() for x in pg.locator("#tn .tn-prog li").all_text_contents()]
            def plain(text, where):
                low = text.lower()
                for w in BANNED: assert w not in low, f"{where}: plain words only, found '{w.strip()}' in: {text[:300]}"

            # ---- 1. starting a tribe on a computer ----
            pg = page()
            pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.wait_for_timeout(250)
            assert prog(pg) == ["Name", "Friends"], "two steps unless you ask for more"
            plain(pg.inner_text("#tn"), "step 1")
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup2-tribe-1-1280.png"))
            pg.click("#tn-x"); pg.wait_for_selector("#tn", state="detached")
            step2(pg, "Lantern Crew")
            assert pg.evaluate("TribeNew.homes()") == ["computer", "folder", "github", "cloud", "shared", "device"], pg.evaluate("TribeNew.homes()")
            assert titles(pg) == ["On this computer", "A folder you pick or create", "GitHub", "Free cloud", "A shared folder", "In this browser only"], titles(pg)
            assert pg.inner_text("#tn-h") == "Where should it be kept?" and prog(pg) == ["Name", "Where", "Friends"]
            assert pg.evaluate("TribeNew.recommended()") == "computer" and pg.get_attribute("#tn [data-tn-where='computer']", "aria-checked") == "true"
            assert pg.locator("#tn [data-tn-where='computer'] .ph-tag").text_content().strip() == "Recommended"
            assert "Sharing and backup" in pg.inner_text("#tn .ph-lead"), "and it says where to change it later"
            plain(pg.inner_text("#tn"), "step 2")
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup2-tribe-where-1280.png"))
            # GitHub: the one Connect GitHub block, inline (this browser has no tribe yet: a link and an optional token)
            pg.click("#tn [data-tn-where='github']"); pg.wait_for_selector("#tn #ghc-repo")
            assert pg.is_visible("#ghc-local-note") and pg.locator("#tn #ghc-tok").count() == 1
            pg.click("#tn-go"); assert "owner/name" in pg.inner_text("#tn-err"), "a calm inline note, nothing made"

            # ---- 2. a folder you pick or create: browse this computer, with New folder ----
            pg.click("#tn [data-tn-where='folder']"); pg.wait_for_selector("#tn-folder #lr-browse-go"); pg.click("#tn-folder #lr-browse-go")
            pg.wait_for_selector("#tn-folder .lr-dir"); pg.click("#tn-folder [data-open$='Games']"); pg.wait_for_timeout(400)
            assert pg.locator("#tn-folder #lr-mk, #tn-folder [data-lr-mk], #tn-folder .lr-mk").count() >= 1, "New folder is right there"
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup2-tribe-folder-1280.png"))
            pg.click("#tn-x"); pg.wait_for_selector("#tn", state="detached")
            pg.context.close()

            # ---- 4. no TribeCode behind the page: the browser's own folder window, or a calm fallback ----
            NOAPP = "addEventListener('DOMContentLoaded', () => { const t = setInterval(() => { if (window.TribeHome) { window.TribeHome.canPickFolder = () => ({ ok: false, why: 'This page comes from the web.' }); clearInterval(t); } }, 20); });"
            pg = page(extra=NOAPP + FAKE_PICKER)
            pg.wait_for_function("window.TribeHome && !TribeHome.canPickFolder().ok")
            step2(pg, "Paper Boats")
            hs = pg.evaluate("TribeNew.homes()"); assert "bfolder" in hs and "folder" not in hs and "shared" not in hs, hs
            assert titles(pg)[hs.index("bfolder")] == "A folder you pick or create"
            pg.click("#tn [data-tn-where='bfolder']"); pg.wait_for_selector("#tn #bf-pick")
            assert pg.inner_text("#bf-name") == "No folder chosen yet"
            pg.click("#bf-pick"); pg.wait_for_function("document.querySelector('#bf-name').textContent === 'Lantern Files'")
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup2-browser-folder-1280.png"))
            pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3']", timeout=15000)
            wr = pg.evaluate("window.__written"); assert "README.md" in wr and "Paper Boats" in wr["README.md"], wr.keys()
            assert pg.evaluate("TribeOffline.solo()"), "and it stays in this browser too"
            pg.click("#tn-skip") if pg.locator("#tn-skip").count() else pg.click("#tn-x")
            pg.wait_for_selector("#tn", state="detached"); pg.wait_for_timeout(600)

            # ---- 3. one choice is no step: a new project inside this browser's tribe ----
            pg.evaluate("TribeNew.open({ name: 'Gubba' })"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.wait_for_timeout(250)
            assert pg.evaluate("TribeNew.homes()") == ["tribe"], pg.evaluate("TribeNew.homes()")
            assert pg.locator("#tn-options").count() == 0, "no More options when there is nothing to choose"
            assert pg.text_content("#tn .tn-head .eyebrow").strip() == "New project"
            if SHOTS: pg.screenshot(path=str(SHOT_DIR / "setup2-project-1280.png"))
            pg.click("#tn-create"); pg.wait_for_selector("#tn[data-step='3']", timeout=10000)
            assert prog(pg) == ["Name", "Friends"], "straight from the name to friends"
            pg.click("#tn-x"); pg.wait_for_selector("#tn", state="detached")

            # ---- 5. the same list later, from Sharing and backup ----
            pg.evaluate("TribeLocalSetup.where()"); pg.wait_for_selector("#su-where, .su-sheet", timeout=8000); pg.wait_for_timeout(300)
            sheet = pg.locator(".ph-sheet:not(.out)").last
            t = sheet.inner_text(); assert "Where should it be kept?" in t, t[:200]
            rows = [x.strip() for x in sheet.locator("[data-su] .ph-tt b").evaluate_all("els => els.map(e => e.firstChild.textContent)")]
            assert rows == ["On this computer", "A folder you pick or create", "GitHub", "Free cloud"], rows
            plain(t.replace("Sharing and backup", ""), "where, later")
            before = pg.evaluate("window.__picks")
            sheet.locator("[data-su='bfolder']").click(); pg.wait_for_function(f"window.__picks === {before} || document.querySelectorAll('.ph-sheet:not(.out)').length === 0", timeout=8000)
            pg.wait_for_timeout(500)
            assert pg.evaluate("TribeBrowserFolder.name(TribeLocalSetup.pid())") == "Lantern Files", "the folder is remembered: Save again needs no second pick"
            pg.context.close()

            # a browser with no folder window: said calmly, and the tribe is still made
            pg = page(extra=NOAPP + "try { delete window.showDirectoryPicker; Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }); } catch (e) {}")
            pg.wait_for_function("window.TribeHome && !TribeHome.canPickFolder().ok")
            assert not pg.evaluate("TribeBrowserFolder.can()")
            step2(pg, "Quiet Pond"); pg.click("#tn [data-tn-where='bfolder']"); pg.wait_for_selector("#bf-fallback")
            assert "can’t open folders" in pg.inner_text("#bf-fallback") and "Sharing and backup" in pg.inner_text("#bf-fallback")
            pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3']", timeout=15000)
            pg.context.close()

            # ---- 6. a 390px phone ----
            ph = page(390, 800)
            ph.evaluate("TribeNew.open()"); ph.wait_for_selector("#tn #tn-name", state="visible"); ph.wait_for_timeout(300)
            if SHOTS: ph.screenshot(path=str(SHOT_DIR / "setup2-tribe-1-390.png"))
            ph.fill("#tn-name", "Pocket Crew"); ph.click("#tn-options"); ph.wait_for_selector("#tn[data-step='2'] [data-tn-where]"); ph.wait_for_timeout(300)
            assert titles(ph)[0] == "On this phone only" and ph.get_attribute("#tn [data-tn-where='device']", "aria-checked") == "true" and "A folder you pick or create" in titles(ph) and "GitHub" in titles(ph), titles(ph)
            plain(ph.inner_text("#tn"), "phone step 2")
            fit = ph.evaluate("(() => { const r = document.querySelector('#tn').getBoundingClientRect(); return [r.left >= 0, r.right <= innerWidth + 1, document.documentElement.scrollWidth <= innerWidth + 1]; })()")
            assert all(fit), fit
            if SHOTS: ph.screenshot(path=str(SHOT_DIR / "setup2-tribe-where-390.png"))
            ph.click("#tn [data-tn-where='github']"); ph.wait_for_selector("#tn #ghc-repo"); ph.wait_for_timeout(200)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            ph.context.close(); b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, errs
        print("ok e2e_setup_flow2")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
