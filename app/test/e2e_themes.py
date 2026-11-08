"""Themes (Settings › Theme): every theme switches the CSS variables, keeps body text at 4.5:1, has no sideways
scroll at 390px, survives a reload, follows "Match system", and also paints join.html and go.html.
Saves one screenshot per theme into docs/screenshots/themes/. Usage: python app/test/e2e_themes.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4925 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots" / "themes"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

# Reads the live CSS variables and returns the lowest body-text contrast on the main surfaces.
CONTRAST_JS = """() => {
  const cs = getComputedStyle(document.body), v = n => cs.getPropertyValue(n).trim();
  const hex = s => { const m = /^#([0-9a-f]{6})$/i.exec(s); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const lum = c => { const l = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  let worst = 99, at = '';
  for (const fg of ['--text', '--muted', '--faint']) for (const bg of ['--canvas', '--surface', '--surface-2', '--raised', '--main', '--nest']) {
    const a = hex(v(fg)), b = hex(v(bg)); if (!a || !b) return { worst: 0, at: fg + ' on ' + bg + ' unreadable: ' + v(fg) + ' / ' + v(bg) };
    const r = ratio(a, b); if (r < worst) { worst = r; at = fg + ' on ' + bg; }
  }
  return { worst, at, canvas: v('--canvas'), surface: v('--surface'), text: v('--text'), bg: cs.backgroundColor };
}"""
NO_OVERFLOW_JS = """() => {
  const doc = document.scrollingElement, card = document.querySelector('#settings-body');
  const wide = [...document.querySelectorAll('#settings-body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className || e.tagName);
  return { page: doc.scrollWidth <= innerWidth + 1, card: !card || card.scrollWidth <= card.clientWidth + 1, wide: wide.slice(0, 5) };
}"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-th-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    SHOTS.mkdir(parents=True, exist_ok=True)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        # the static contrast check over the CSS files (same rule, every pair the app uses)
        r = subprocess.run(["node", str(ROOT / "scripts" / "theme-contrast.js")], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, color_scheme="dark")
            ctx.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, server: {{url: '{BASE}', token: ''}}}}))")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append("desk: " + str(e)))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeThemes && window.TribeSettings", timeout=15000)
            pg.wait_for_function("TribeStore.get().server.token", timeout=15000)
            token = pg.evaluate("TribeStore.get().server.token")
            themes = pg.evaluate("TribeThemes.list.map(t => ({ id: t.id, name: t.name, mode: t.mode, sw: t.sw }))")
            assert len(themes) >= 8, themes
            assert pg.evaluate("document.body.dataset.theme") == "campfire", "Campfire is the default"
            # a device from before v0.9.1 has theme 'dark' saved by default (never picked): it gets Campfire too...
            assert pg.evaluate("TribeThemes.resolve({ theme: 'dark', themeDark: 'dark' })") == "campfire"
            # ...but someone who picked TribeCode Dark keeps it
            assert pg.evaluate("TribeThemes.resolve({ ...TribeThemes.pick('dark') })") == "dark"

            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#settings-modal:not(.hidden) .th-chip")
            assert pg.locator(".th-chip").count() == len(themes)
            assert pg.locator(".set-seg").count() == 0, "the old Dark/Light/System control is gone"
            pg.locator("#settings-body .set-theme").screenshot(path=str(SHOTS / "picker.png"))
            seen = set()
            for t in themes:
                pg.click(f".th-chip[data-theme-id='{t['id']}']")
                pg.wait_for_function(f"document.body.dataset.theme === '{t['id']}'")
                assert pg.evaluate(f"document.body.classList.contains('{t['mode']}')"), t
                assert pg.evaluate(f"document.querySelector(\".th-chip[data-theme-id='{t['id']}']\").getAttribute('aria-checked')") == "true"
                c = pg.evaluate(CONTRAST_JS)
                assert c["canvas"].upper() == t["sw"][0].upper(), (t["id"], c)
                assert c["surface"].upper() == t["sw"][1].upper(), (t["id"], c)
                assert c["worst"] >= 4.5, (t["id"], c)
                assert pg.evaluate("TribeStore.get().theme") == t["id"]
                seen.add((c["canvas"], c["surface"], c["text"]))
                # one picture of the app per theme (Settings closed)
                pg.evaluate("TribeSettings.close()"); pg.wait_for_timeout(150)
                pg.screenshot(path=str(SHOTS / f"{t['id']}.png"))
                pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#settings-modal:not(.hidden) .th-chip")
            assert len(seen) == len(themes), "every theme has its own palette"

            # the choice survives a reload
            pg.click(".th-chip[data-theme-id='nordic']"); pg.wait_for_function("document.body.dataset.theme === 'nordic'")
            pg.reload(); pg.wait_for_function("window.TribeThemes")
            pg.wait_for_function("document.body.dataset.theme === 'nordic'", timeout=5000)
            assert pg.evaluate("getComputedStyle(document.body).getPropertyValue('--canvas').trim().toUpperCase()") == "#2A2F3A"

            # Match system: your last light theme in light mode, your last dark theme in dark mode
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#settings-modal:not(.hidden) .th-chip")
            pg.click(".th-chip[data-theme-id='solar-light']"); pg.wait_for_function("document.body.dataset.theme === 'solar-light'")
            pg.click(".th-chip[data-theme-id='campfire']"); pg.wait_for_function("document.body.dataset.theme === 'campfire'")
            pg.click("#set-theme-sys"); pg.wait_for_function("TribeStore.get().themeSystem === true")
            assert pg.get_attribute("#set-theme-sys", "aria-checked") == "true"
            assert pg.evaluate("document.body.dataset.theme") == "campfire"
            pg.emulate_media(color_scheme="light"); pg.wait_for_function("document.body.dataset.theme === 'solar-light'", timeout=5000)
            assert pg.evaluate("document.body.classList.contains('light')")
            pg.emulate_media(color_scheme="dark"); pg.wait_for_function("document.body.dataset.theme === 'campfire'", timeout=5000)
            pg.click("#set-theme-sys"); pg.wait_for_function("TribeStore.get().themeSystem === false")
            # Ctrl+Shift+L flips between your light and dark theme
            pg.evaluate("TribeSettings.close()")
            pg.keyboard.press("Control+Shift+L"); pg.wait_for_function("document.body.dataset.theme === 'solar-light'")
            pg.keyboard.press("Control+Shift+L"); pg.wait_for_function("document.body.dataset.theme === 'campfire'")
            # the old 'system' value still works
            pg.evaluate("TribeStore.set({ theme: 'system', themeSystem: false }); TribeApp.refresh()")
            assert pg.evaluate("document.body.dataset.theme") == "campfire"
            pg.evaluate("TribeStore.set({ theme: 'midnight' }); TribeApp.refresh()")
            ctx.close()

            # phone: the picker works at 390px, no sideways scroll in any theme
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, server: {{url: '{BASE}', token: '{token}'}}}}))")
            mp = ph.new_page(); mp.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeSettings && TribeClient.connected()", timeout=15000)
            mp.evaluate("TribeSettings.open()"); mp.wait_for_selector("#settings-modal:not(.hidden) .th-chip")
            for t in themes:
                mp.locator(f".th-chip[data-theme-id='{t['id']}']").scroll_into_view_if_needed()
                mp.tap(f".th-chip[data-theme-id='{t['id']}']")
                mp.wait_for_function(f"document.body.dataset.theme === '{t['id']}'")
                o = mp.evaluate(NO_OVERFLOW_JS)
                assert o["page"] and o["card"] and not o["wide"], (t["id"], o)
                box = mp.locator(f".th-chip[data-theme-id='{t['id']}']").bounding_box()
                assert box["x"] >= 0 and box["x"] + box["width"] <= 390 and box["height"] >= 40, (t["id"], box)
            mp.locator("#settings-body .set-theme").scroll_into_view_if_needed()
            mp.screenshot(path=str(SHOTS / "phone-picker.png"))
            mp.evaluate("TribeSettings.close()"); mp.wait_for_timeout(200)
            assert mp.evaluate("document.scrollingElement.scrollWidth") <= 390
            ph.close()

            # join.html and go.html honor the saved theme
            jc = b.new_context(viewport={"width": 390, "height": 844})
            jc.add_init_script("localStorage.setItem('tribecode.settings.v1', JSON.stringify({ theme: 'nightshade' }))")
            jp = jc.new_page(); jp.on("pageerror", lambda e: errors.append("join: " + str(e)))
            st, inv = api("/invites", "POST", {"role": "builder", "maxUses": 3}, token=token); assert st == 200, inv
            jp.goto(f"{BASE}/join/{inv['invite']['code']}")
            jp.wait_for_function("document.body.dataset.theme === 'nightshade'", timeout=8000)
            assert jp.evaluate("getComputedStyle(document.body).getPropertyValue('--canvas').trim().toUpperCase()") == "#21222C"
            assert jp.evaluate("document.scrollingElement.scrollWidth") <= 390
            jp.goto(f"{BASE}/go.html#s={BASE}&c={inv['invite']['code']}")
            jp.wait_for_function("document.body.dataset.theme === 'nightshade'", timeout=8000)
            assert jp.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(33, 34, 44)"
            jc.close()
            # a friend's first visit to go.html (nothing saved) follows the OS setting
            gc = b.new_context(viewport={"width": 390, "height": 844}, color_scheme="light")
            gp = gc.new_page(); gp.goto(f"{BASE}/go.html#s={BASE}&c={inv['invite']['code']}")
            gp.wait_for_function("document.body.dataset.theme === 'light'", timeout=8000)
            assert gp.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(244, 245, 247)"
            gc.close()
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("themes OK")

if __name__ == "__main__":
    main()
