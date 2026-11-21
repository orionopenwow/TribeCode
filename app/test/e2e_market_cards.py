"""Marketplace cards and TribeCode's own browser (feat/p10-market):
- every card's picture is a screenshot or a drawn picture of what it is (market-art.js), never a two-letter monogram;
- every kind chip and card kind icon is a real, distinct drawing (no TribeIcons paperclip fallback);
- an app kit's picture is App Creator's real first screen;
- the detail pane says what it is, what Add does, what it needs, the license and the source, and lists related items;
- TribeBrowser.open() shows a page from this server in its panel (sandboxed: no allow-same-origin), sends a site that
  refuses framing (github.com) to your own browser, and refuses non-http addresses; Esc closes it;
- /api/market/frameable never checks a private address.
1440 and 390. Usage: python app/test/e2e_market_cards.py"""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-mkcards-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            for w, h in ((1440, 900), (390, 844)):   # the same person (the host) at two sizes
                pg.set_viewport_size({"width": w, "height": h}); pg.goto(BASE + "/?skipIntro=1")
                pg.wait_for_function("window.TribeMarket && window.TribeMarketArt && window.TribeBrowser && TribeClient.connected()", timeout=30000)
                pg.evaluate("TribeMarket.page()"); pg.wait_for_selector("#market .mk-card", timeout=15000); pg.wait_for_timeout(600)
                # pictures: a screenshot or a drawn picture, never a monogram
                bad = pg.evaluate("""[...document.querySelectorAll('#market .mk-card')].filter(c => { const t = c.querySelector('.mk-thumb');
                    return !t || (!t.querySelector('img') && !t.querySelector('svg.ma, .ma-phone')) || t.querySelector('.mk-tile > b'); }).map(c => c.dataset.id)""")
                assert not bad, f"cards without a real picture: {bad[:8]}"
                # kind icons: every category chip's icon is a real drawing and they are all different
                chips = pg.evaluate("""[...document.querySelectorAll('#market button')].filter(b => b.querySelector('svg') && /^(All|Skills|MCP servers|Libraries|Tools|Studios|Starters|Widgets|Assets|App kits|Templates|Playbooks|Academy)$/.test(b.textContent.trim()))
                    .map(b => ({ t: b.textContent.trim(), other: b.querySelector('svg').getAttribute('data-i') === 'other', d: b.querySelector('svg').innerHTML }))""")
                assert len(chips) >= 12, chips
                assert not [c["t"] for c in chips if c["other"]], [c["t"] for c in chips if c["other"]]
                assert len({c["d"] for c in chips}) == len(chips), "every kind has its own icon"
                # an app kit draws App Creator's real first screen
                pg.evaluate("() => { const b = [...document.querySelectorAll('#market button')].find(x => x.textContent.trim() === 'App kits'); b && b.click(); }")
                pg.wait_for_function("document.querySelector('#market .mk-card[data-id^=\"ak-\"] .ma-phone .apc-mini')", timeout=10000)
                # the detail pane
                pg.locator('#market .mk-card[data-id^="ak-"]').first.click(); pg.wait_for_selector("#mk-detail h2", timeout=8000)
                d = pg.inner_text("#mk-detail")
                for want in ("What Add does", "It needs", "License", "Source", "Made for"):
                    assert want.lower() in d.lower(), (want, d[:300])
                pg.wait_for_selector("#mk-detail #mk-related:not([hidden]) .mk-relb", timeout=8000)
                # an MCP server says what it needs
                pg.evaluate("TribeMarket.open && 0"); pg.evaluate("() => { const b = document.querySelector('#mk-detail [data-dclose]'); b && b.click(); }")
                pg.evaluate("() => { const b = [...document.querySelectorAll('#market button')].find(x => x.textContent.trim() === 'MCP servers'); b && b.click(); }")
                pg.wait_for_selector('#market .mk-card[data-id^="mcp-"]', timeout=10000)
                pg.locator('#market .mk-card[data-id="mcp-github"], #market .mk-card[data-id^="mcp-"]').first.click(); pg.wait_for_selector("#mk-detail .mk-needs")
                assert pg.inner_text("#mk-detail .mk-needs").strip(), "an MCP server says what it needs"
                sw = pg.evaluate("document.documentElement.scrollWidth"); assert sw <= w, f"no sideways scroll at {w}: {sw}"
                print(f"ok  {w}: real pictures, distinct kind icons, App Creator screen for app kits, a full detail pane")
                # TribeCode's own browser
                pg.evaluate("() => { window.__ext = []; window.open = u => { window.__ext.push(String(u)); return null; }; }")
                r = pg.evaluate("TribeBrowser.open(location.origin + '/go.html', { title: 'Docs here' })")
                pg.wait_for_selector("#tb-browser.in", timeout=5000)
                sb = pg.get_attribute("#tb-browser .tbw-frame", "sandbox"); src = pg.get_attribute("#tb-browser .tbw-frame", "src")
                assert "allow-same-origin" not in sb and src.endswith("/go.html"), (sb, src)
                assert pg.inner_text("#tb-browser .tbw-title") == "Docs here"
                pg.keyboard.press("Escape"); pg.wait_for_function("!TribeBrowser.state().open", timeout=3000)
                r = pg.evaluate("TribeBrowser.open('https://github.com/orionopenwow/TribeCode')")
                assert r == "external" and pg.evaluate("window.__ext[0]") == "https://github.com/orionopenwow/TribeCode", (r, pg.evaluate("window.__ext"))
                assert pg.evaluate("TribeBrowser.open('javascript:alert(1)')") is False and pg.evaluate("TribeBrowser.open('file:///etc/passwd')") is False
                # the framing check never looks at private addresses
                f = pg.evaluate("Promise.all(['http://127.0.0.1:22/', 'http://192.168.1.1/', 'http://localhost/'].map(u => TribeClient.api('/market/frameable?url=' + encodeURIComponent(u))))")
                assert all(x.get("frame") is False and x.get("why") == "not a public page" for x in f), f
                print(f"ok  {w}: the browser shows this server's page sandboxed, sends github.com out, refuses non-web addresses; private hosts are never checked")
            b.close()
        assert not errors, errors
        print("e2e_market_cards: all ok")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
