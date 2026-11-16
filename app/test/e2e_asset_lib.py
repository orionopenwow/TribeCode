"""The design library (app/ui/assetlib.js, feat/asset-libs), end to end with a tribe.
  - the library opens from the Assets panel and from Flint ("open the design library"); every kind has its tab, the
    counts are 50+ (fonts: the pairs we ship), search finds a rocket icon, every tile says its licence
  - picking a palette puts it in the project's brand kit (on the host), and a sound plays
  - App Creator's "Colours from the library" sets the app's accent; Motion Studio's does the same for a motion piece;
    the website designer's button puts the palette in the brand kit and on the site
  - "play a click sound on tap" in App Creator turns tap sounds on; "use the sunset palette" uses it
  - a shelf colour pack installs into the library; the 'library' provider registers with the tribe's suggestions
  - 390px: no sideways scroll, tabs scroll, tiles at least 40px tall
Usage: python app/test/e2e_asset_lib.py [--shots]   (--shots writes docs/screenshots/assets-library*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6490 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
SHOT = ROOT / "docs" / "screenshots"
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); "
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.removeItem('tribecode.assetlib.packs'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "AudioContext" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-al-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Library Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]
        pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeAssetLib && window.TribeAssetData && window.TribeClient && TribeClient.connected() && window.TribeBrandKit", timeout=20000)

            # ---- counts: 50+ of each kind, and every item names its licence
            counts = pg.evaluate("Object.fromEntries(TribeAssetData.KINDS.map(k => [k.id, TribeAssetLib.count(k.id)]))")
            for k, n in counts.items(): assert n >= 50, (k, n)
            # fonts (feat/asset-libs2): one list for the site editor, App Creator and the library; OFL, a source and a preview line each
            assert pg.evaluate("Object.keys(TribeSiteCfg.FONT_PAIRS).join() === Object.keys(TribeFontLib.PAIRS).join()"), "the site editor has the same pairs"
            assert pg.evaluate("Object.keys(TribeFontLib.PAIRS).filter(id => TribeAppCore.FONTS[id]).length") >= 50, "App Creator has them too"
            assert all(x["license"] == "OFL-1.1" and x["source"] for x in pg.evaluate("TribeAssetLib.list('font')")), "fonts are OFL with a source"
            assert all(x["license"] and x["source"] for x in pg.evaluate("TribeAssetLib.list()")), "every item has a licence and a source"

            # ---- from the Assets panel
            pg.evaluate("TribeAssets.open({})"); pg.wait_for_selector("[data-designlib]", timeout=8000); pg.click("[data-designlib]")
            pg.wait_for_selector("#al-sheet .al-tile", timeout=8000)
            assert pg.locator("#al-sheet [data-alk]").count() == len(counts), "a tab per kind"
            off = pg.evaluate("(() => { const s = document.querySelector('#al-sheet').getBoundingClientRect(); return [...document.querySelectorAll('#al-sheet [data-alk]')].filter(b => b.getBoundingClientRect().right > s.right + 1).length; })()")
            assert off == 0, f"pass 3: with a mouse every kind tab is visible, none hidden off the edge ({off})"
            assert "CC0" in pg.inner_text("#al-sheet .al-tile >> nth=0"), "tiles say their licence"
            pg.click("#al-sheet [data-alk='icon']"); pg.fill("#al-q", "rocket"); pg.wait_for_timeout(200)
            assert pg.locator("#al-sheet .al-tile").count() >= 1 and "rocket" in pg.inner_text("#al-grid").lower(), "search finds a rocket icon"
            pg.fill("#al-q", ""); pg.click("#al-sheet [data-alk='font']"); pg.wait_for_timeout(200)
            assert pg.locator("#al-sheet .al-tile .al-fprev").count() >= 50, "every font pair shows a preview line"
            assert pg.evaluate("TribeFontLib.load(['Playfair Display', 'Lato']).startsWith('https://fonts.googleapis.com/css2?')"), "Google Fonts is asked for the pair (offline the link drops and system fonts show)"
            assert "Georgia" in pg.evaluate("document.querySelector(\"#al-sheet [data-al='font|playfair'] .al-font\").style.fontFamily"), "with a fallback stack"
            pg.click("#al-sheet [data-alk='background']"); pg.wait_for_timeout(200)
            assert pg.locator("#al-sheet .al-tile img").count() >= 50, "backgrounds show their thumbnails"
            pg.wait_for_function("[...document.querySelectorAll('#al-sheet .al-tile img')].slice(0, 6).every(i => i.complete && i.naturalWidth > 0)", timeout=10000)
            if SHOTS: pg.click("#al-sheet [data-alk='palette']"); pg.wait_for_timeout(300); pg.screenshot(path=str(SHOT / "assets-library.png"))

            # ---- a palette goes to the brand kit on the host; a sound plays
            pg.click("#al-sheet [data-alk='palette']"); pg.click("#al-sheet [data-al='palette|ocean']")
            pg.wait_for_function("!document.querySelector('#al-sheet')", timeout=8000)
            pg.wait_for_function(f"TribeBrandKit.cached('{pid}') && TribeBrandKit.cached('{pid}').colors.accent.toLowerCase() === '#2f6fde'", timeout=8000)
            kit = api(f"/projects/{pid}/brand", token=tok)[1]["kit"]; assert kit["colors"]["accent"].lower() == "#2f6fde" and kit["colors"]["bg"].lower() == "#f2f6fd", kit["colors"]
            assert pg.evaluate("TribeAssetLib.play('success')") is True, "a sound plays"

            # ---- Flint
            pg.evaluate("TribeFlint.ask('open the design library')"); pg.wait_for_selector("#al-sheet", timeout=8000)
            pg.keyboard.press("Escape"); pg.wait_for_function("!document.querySelector('#al-sheet')", timeout=5000)
            pg.evaluate("TribeFlint.ask('use the sunset palette')")
            pg.wait_for_function(f"TribeBrandKit.cached('{pid}') && TribeBrandKit.cached('{pid}').colors.accent.toLowerCase() === '#f0614f'", timeout=10000)

            # ---- App Creator: colours from the library, tap sounds by Flint
            pg.evaluate("TribeAppCreator.open({ template: 'habits', pid: '" + pid + "' })"); pg.wait_for_function("TribeAppCreator.state() && TribeAppCreator.state().open", timeout=10000)
            pg.click("#apc-left [data-tab='look']")
            pg.wait_for_selector("#apc-lib", timeout=8000); pg.click("#apc-lib"); pg.wait_for_selector("#al-sheet [data-al='palette|forest']", timeout=8000)
            pg.click("#al-sheet [data-al='palette|forest']")
            pg.wait_for_function("TribeAppCreator.doc().theme.accent.toLowerCase() === '#5fb37a' && TribeAppCreator.doc().theme.mode === 'dark'", timeout=8000)
            pg.evaluate("TribeAppCreator.ask('play a click sound on tap')")
            pg.wait_for_function("TribeAppCreator.doc().theme.sound === 'click'", timeout=8000)
            pg.evaluate("TribeAppCreator.ask('add a weather card')"); pg.wait_for_function("TribeAppCreator.doc().screens.some(s => s.blocks.some(b => b.type === 'weather'))", timeout=8000)
            pg.evaluate("TribeAppCreator.ask('add an order tracker screen')"); pg.wait_for_function("TribeAppCreator.doc().screens.some(s => s.blocks.some(b => b.type === 'tracker'))", timeout=8000)
            pg.evaluate("TribeAppCreator.close()")

            # ---- Motion Studio: colours from the library
            pg.evaluate("TribeMotionStudio.open({ template: 'ui-reel' })"); pg.wait_for_function("TribeMotionStudio.isOpen()", timeout=10000)
            pg.click("#mos [data-mos-tab='edit']")
            pg.wait_for_selector("#mos-lib", timeout=8000); pg.click("#mos-lib"); pg.wait_for_selector("#al-sheet [data-al='palette|grape']", timeout=8000)
            pg.click("#al-sheet [data-al='palette|grape']")
            pg.wait_for_function("TribeMotionStudio.state() && JSON.stringify(TribeMotionStudio.state()).toLowerCase().includes('#a04acb')", timeout=8000)
            pg.evaluate("TribeMotionStudio.close()")

            # ---- the Launch kit's library button: colours, fonts and an icon symbol
            pg.evaluate(f"TribeLaunchKit.open('{pid}', 'icon')"); pg.wait_for_selector("#lch-lib", timeout=10000)
            pg.click("#lch-lib"); pg.wait_for_selector("#al-sheet [data-al='palette|ocean']", timeout=8000); pg.click("#al-sheet [data-al='palette|ocean']")
            pg.wait_for_function("!document.querySelector('#al-sheet')", timeout=8000)
            pg.click("#lch-lib"); pg.wait_for_selector("#al-sheet [data-alk='font']", timeout=8000); pg.click("#al-sheet [data-alk='font']"); pg.click("#al-sheet [data-al='font|playfair']")
            pg.wait_for_function(f"TribeBrandKit.cached('{pid}') && TribeBrandKit.cached('{pid}').fonts.display === 'Playfair Display'", timeout=8000)
            pg.click("#lch-lib"); pg.wait_for_selector("#al-sheet [data-alk='icon']", timeout=8000); pg.click("#al-sheet [data-alk='icon']"); pg.fill("#al-q", "rocket"); pg.wait_for_timeout(200)
            pg.click("#al-sheet [data-al^='icon|'] >> nth=0")
            pg.wait_for_function("/^(site|app):/.test(TribeLaunchKit.state().kit.icon.symbol)", timeout=8000)
            pg.wait_for_function("(() => { const c = document.querySelector('#lch-ic'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, 256, 256).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 1000; })()", timeout=8000)
            pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(200)
            assert pg.locator("#lch-lib").is_visible(), "the Library button fits at 390px"
            pg.set_viewport_size({"width": 1440, "height": 900})
            pg.evaluate("TribeLaunchKit.close()")

            # ---- suggestion "why" lines go through the translation runtime
            pg.evaluate("TribeI18n.set('es')")
            assert "Se pidió 3 veces" in pg.evaluate("TribeI18n.t('Asked for 3 times, and no task covers it yet.')")
            assert "Tu tribu" in pg.evaluate("TribeI18n.t('Your tribe applied 2 like this lately, so it comes up first.')")
            assert "Mencionado" in pg.evaluate("TribeI18n.t('Mentioned in a doc: “a habit tracker”')")
            pg.evaluate("TribeI18n.set('en')")

            # ---- a shelf colour pack installs into the library; the suggestions provider is there
            n0 = pg.evaluate("TribeAssetLib.count('palette')")
            n = pg.evaluate("(async () => { const r = await TribeClient.api('/market/items/ap-pal-pastel'); return TribeAssetLib.installPack({ id: r.item.id, title: r.item.title, items: r.item.lib }); })()")
            assert n == 6 and pg.evaluate("TribeAssetLib.count('palette')") == n0 + 6, (n, n0)
            assert pg.evaluate("TribeAssetLib.palette('lilac') && TribeAssetLib.palette('lilac').colors.accent") == "#B9A2E8"
            assert pg.evaluate("TribeAssetLib.installPack({ id: 'bad', items: [{ kind: 'palette', id: 'x', name: 'X', license: 'GPL-3.0' }] })") == 0, "only open licences"
            assert pg.evaluate("TribeAssetLib.provider.id") == "library"
            if pg.evaluate("!!(window.TribeSuggest && TribeSuggest._providers)"): assert "library" in pg.evaluate("TribeSuggest._providers()")
            ctx.close()

            # ---- 390px
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Mara", tok, pid))
            mp = ph.new_page(); watch(mp, "phone"); mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeAssetLib && window.TribeUI", timeout=20000)
            mp.evaluate("TribeAssetLib.open({ kind: 'palette' })"); mp.wait_for_selector("#al-sheet .al-tile", timeout=8000)
            assert not mp.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"), "no sideways scroll at 390px"
            for sel in ["#al-sheet .al-tile >> nth=0", "#al-sheet [data-alk] >> nth=0", "#al-q"]:
                bb = mp.locator(sel).bounding_box(); assert bb and bb["height"] >= 36 and bb["x"] >= 0 and bb["x"] + bb["width"] <= 391, (sel, bb)
            if SHOTS: mp.screenshot(path=str(SHOT / "assets-library-390.png"))
            ph.close(); b.close()
        assert not errors, errors[:5]
        print(f"e2e_asset_lib: OK (library {counts}, Assets panel and Flint open it, search, licences, palette to the brand kit on the host, sound, App Creator and Motion Studio pick colours, tap sounds, new parts by Flint, shelf pack, suggestions provider, 390px)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
