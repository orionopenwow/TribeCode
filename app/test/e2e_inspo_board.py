"""Your inspiration board (feat/flint-ai): genuine, openly licensed pictures and sounds, with a mocked Openverse (a local
fake server; the real network is never touched).
  1. Search pictures (Openverse), save one: the thumbnail is fetched through the server into the tribe's cache (served
     from /api/inspo/cache/<hash>, not hotlinked), its colors are measured on the server, and the credit (title, creator,
     license with its link, source) is shown on the board.
  2. Search sounds, save one: an audio player plays the cached preview (it loads), with its credit.
  3. "✦ Use my board's style": your accent changes to the board's color (fitted to the theme), and in a project the
     website's brand kit and design/inspiration.css follow. Flint does the same from "use my board's style".
  4. Wikimedia Commons as a second source; offline, search says so and the board still works.
  5. Phone at 390px: the masonry is two columns, no horizontal scroll. No console errors.
Usage: python app/test/e2e_inspo_board.py [--shots]   (--shots writes docs/screenshots/inspo-board.png)"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent)); import fake_openverse

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0")); PORT = 5490 + OFF; FAKE = PORT + 700
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"; take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def page_for(b, token, **ctx):
    c = b.new_context(**(ctx or {"viewport": {"width": 1440, "height": 900}}))
    c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, server: {{url: '{BASE}', token: '{token}'}}}}))")
    pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(m.text[:200]))
    pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=15000)
    return pg


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-inspo-"); fake = fake_openverse.start(FAKE)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_OPENVERSE_URL": f"http://localhost:{FAKE}", "TRIBE_WIKIMEDIA_URL": f"http://localhost:{FAKE}", "TRIBE_TEST_EMBED_ALLOW": f"localhost:{FAKE}"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=open(os.path.join(tmp, "log"), "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        st, boot = api("/bootstrap", "POST", {"name": "Orion"}); tok = boot["token"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = page_for(b, tok)
            pid = pg.evaluate("TribeProjects.current() || TribeClient.state().projects[0].id")
            before = pg.evaluate("getComputedStyle(document.body).getPropertyValue('--live').trim()")

            # ---------- 1. pictures ----------
            pg.evaluate("TribeInspoBoard.open({ board: 'me' })"); pg.wait_for_selector("#ibd:not(.hidden) #ibd-q")
            pg.fill("#ibd-q", "violet dusk"); pg.press("#ibd-q", "Enter")
            pg.wait_for_selector("#ibd-results .ibd-tile.image img", timeout=10000)
            assert "from openverse" in pg.inner_text("#ibd").lower() and "CC BY 4.0" in pg.inner_text("#ibd-results")
            src = pg.get_attribute("#ibd-results .ibd-tile.image img", "src"); assert "/api/inspo/cache/" in src and "localhost:%d" % FAKE not in src, src
            pg.wait_for_function("document.querySelector('#ibd-results .ibd-tile.image img').naturalWidth > 0", timeout=8000)
            pg.click("#ibd-results [data-save='openverse:image:img-violet-0001']")
            pg.wait_for_selector("#ibd-board .ibd-tile.image", timeout=10000)
            v = api("/inspo?board=me", token=tok)[1]; it = v["items"][0]
            assert it["cached"].startswith("/api/inspo/cache/") and it["colors"] and it["colors"][0] == "#7C3AED" and it["measured"] == "server", it
            assert it["license"] == "CC BY 4.0" and it["creator"] == "Ana Ruiz" and it["licenseUrl"].startswith("https://creativecommons.org/") and "Ana Ruiz" in it["attribution"], it
            cache = Path(tmp) / "tribe" / ".tribe" / "inspo" / "cache"; assert any(cache.iterdir()), "a copy is kept in the tribe folder"
            cred = pg.inner_text("#ibd-board .ibd-tile.image .ibd-cred"); assert "Ana Ruiz" in cred and "CC BY 4.0" in cred and "source" in cred, cred
            assert pg.get_attribute("#ibd-board .ibd-tile.image .ibd-lic", "href").startswith("https://creativecommons.org/licenses/by/")
            fake_openverse.hits.clear()
            pg.wait_for_function("document.querySelector('#ibd-board .ibd-tile.image img').naturalWidth > 0", timeout=8000)

            # ---------- 2. sounds ----------
            pg.click("#ibd [data-type='audio']"); pg.wait_for_selector("#ibd-results .ibd-tile.sound audio", timeout=10000)
            pg.click("#ibd-results [data-save='openverse:audio:snd-coin-0001']")
            pg.wait_for_selector("#ibd-board .ibd-tile.sound audio", timeout=10000)
            snd = pg.locator("#ibd-board .ibd-tile.sound").first
            assert "Leo Park" in snd.inner_text() and "CC0" in snd.inner_text(), snd.inner_text()
            asrc = snd.locator("audio").get_attribute("src"); assert "/api/inspo/cache/" in asrc, asrc
            dur = pg.evaluate("s => new Promise(r => { const a = new Audio(s); a.onloadedmetadata = () => r(a.duration); a.onerror = () => r(-1); })", asrc)
            assert 0.3 < dur < 0.5, dur
            assert sum("/audio/snd-coin" in h for h in fake_openverse.hits) == 1, ("fetched once into the cache, then played from there", fake_openverse.hits)

            # ---------- 3. use my board's style ----------
            pg.evaluate("TribeInspoBoard.open({ board: 'me' })"); pg.wait_for_selector("#ibd-style #ibd-use")
            if take:   # a richer board for the screenshot
                pg.evaluate("TribeInspoBoard.search('campfire', 'image')"); pg.wait_for_selector("#ibd-results [data-save='openverse:image:img-ember-0002']")
                pg.click("#ibd-results [data-save='openverse:image:img-ember-0002']"); pg.wait_for_function("document.querySelectorAll('#ibd-board .ibd-tile').length >= 3", timeout=10000)
                pg.evaluate("TribeInspoBoard.search('teal', 'image')"); pg.wait_for_selector("#ibd-results [data-save='openverse:image:img-teal-0003']")
            pg.click("#ibd-use"); pg.wait_for_selector("#ibd-style .ibd-applied", timeout=10000)
            after = pg.evaluate("getComputedStyle(document.body).getPropertyValue('--live').trim()")
            mine = pg.evaluate("TribeStore.get().look.accent")
            assert mine and after.upper() == mine.upper() and after.upper() != before.upper(), (before, after, mine)
            assert pg.evaluate("TribeLook.check('accent', TribeStore.get().look.accent)") == "", "the accent reads on this theme"
            applied = pg.inner_text("#ibd-style .ibd-applied"); assert "your accent is" in applied and "inspiration.css" in applied, applied
            css = next((Path(tmp) / "tribe").rglob("inspiration.css")).read_text(); assert "--insp-accent:" in css
            if take:
                SHOTS.mkdir(parents=True, exist_ok=True); pg.evaluate("document.querySelector('#ibd-results').closest('.ibd-sec').scrollIntoView({ block: 'start' }); document.querySelector('#ibd').scrollTop += 330"); pg.wait_for_function("!document.querySelector('.toast:not(.hidden), #toast.show')", timeout=8000) if False else time.sleep(4.5); pg.screenshot(path=str(SHOTS / "inspo-board.png"))
            pg.click("#ibd-close")
            # Flint does it from words too
            pg.evaluate("TribeStore.set({ look: { ...TribeStore.get().look, accent: null } }); TribeLook.apply()")
            pg.evaluate("TribeFlint.ask(\"use my board's style\")")
            pg.wait_for_function("TribeFlint.thread().slice(-1)[0].text.startsWith('Done.')", timeout=10000)
            assert pg.evaluate("TribeStore.get().look.accent"), "Flint set the accent from the board"

            # ---------- 4. Wikimedia Commons, then offline ----------
            pg.evaluate("TribeInspoBoard.open({ board: 'me' })"); pg.click("#ibd [data-type='image']")
            pg.select_option("#ibd-src", "wikimedia"); pg.fill("#ibd-q", "lagoon"); pg.press("#ibd-q", "Enter")
            pg.wait_for_function("(document.querySelector('#ibd') || {}).innerText.toLowerCase().includes('from wikimedia commons')", timeout=10000)
            assert "CC BY-SA 4.0" in pg.inner_text("#ibd-results")
            fake.shutdown(); fake.server_close()
            pg.select_option("#ibd-src", "openverse")
            pg.wait_for_selector("#ibd .ibd-note", timeout=15000)
            assert "offline" in pg.inner_text("#ibd .ibd-note").lower(), pg.inner_text("#ibd .ibd-note")
            assert pg.locator("#ibd-board .ibd-tile").count() >= 2, "the board still works"
            pg.click("#ibd-close")

            # ---------- 5. phone ----------
            ph = page_for(b, tok, viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.evaluate("TribeInspoBoard.open({ board: 'me' })"); ph.wait_for_selector("#ibd-board .ibd-tile", timeout=10000)
            assert ph.evaluate("document.querySelector('#ibd').scrollWidth <= innerWidth + 1"), "no horizontal scroll"
            assert ph.evaluate("getComputedStyle(document.querySelector('#ibd-board')).columnCount") == "2"
            b.close()
        assert not [e for e in errors if "502" not in e and "Failed to load resource" not in e], errors
        print("e2e_inspo_board: OK (mocked Openverse: pictures + sounds saved through the cache with credits, server-side colors, use my board's style, Flint, Wikimedia, offline, phone)")
    finally:
        srv.kill()


if __name__ == "__main__":
    main()
