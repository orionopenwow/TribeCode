"""Studios (v0.27, server/studios.js + app/ui/studios.js, catalog templates/studios.json): free creative tools beside
TribeCode, linked never bundled. Checks: the catalog is well formed (official https links, licenses, platforms) and
matches the Marketplace's studio items; the API recommends by project kind (game vs site) with ArtCraft first; builders
pin "We use" tools (spectators and agents can't); the Studios tab in the Workshop renders cards with TribeCode-drawn
thumbnails and Download ↗ links (https, new tab, rel=noopener); the detail pane explains how a tool helps THIS project
(different for a game and a website); it's reachable from Ctrl K and the + menu; a phone (390px) gets a sheet and no
horizontal scroll. Usage: python app/test/e2e_studios.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5710 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("TRIBE_SHOTS")

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def until(fn, what, t=15):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)

def main():
    # ---- the catalog ----
    cat = json.loads((ROOT / "templates" / "studios.json").read_text())
    st = cat["studios"]; ids = {s["id"] for s in st}
    assert len(st) >= 20 and len(ids) == len(st), len(st)
    for s in st:
        assert s["url"].startswith("https://") and s["title"] and s["what"] and s["good"] and s["back"] and s["license"] and s["platforms"] and s["glyph"] and s["color"].startswith("#"), s
    assert [s["id"] for s in st if s.get("featured")] == ["artcraft"]
    for k, rec in cat["recommend"].items(): assert rec[0] == "artcraft" and set(rec) <= ids and 3 <= len(rec) <= 4, (k, rec)
    market = json.loads((ROOT / "templates" / "marketplace.json").read_text())["items"]
    for it in [i for i in market if i["kind"] == "studio"]: assert it.get("url", "").startswith("https://"), it

    tmp = Path(tempfile.mkdtemp(prefix="tribe-studios-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        g = ok(api("/projects", "POST", {"name": "Lantern Run", "bio": "A pixel platformer"}, token=host)); game = (g.get("project") or g)["id"]
        w = ok(api("/projects", "POST", {"name": "Oak St Bakers", "bio": "A website for orders"}, token=host)); site = (w.get("project") or w)["id"]
        ok(api(f"/projects/{game}/sense", "PUT", {"kind": "game"}, host, project=game), "game kind")
        ok(api(f"/projects/{site}/sense", "PUT", {"kind": "site"}, host, project=site), "site kind")

        # ---- the API: recommendations follow the project kind ----
        rg = until(lambda: (lambda d: d if d["kind"] == "game" else None)(ok(api(f"/projects/{game}/studios", token=host))), "game studios")
        rs = until(lambda: (lambda d: d if d["kind"] == "site" else None)(ok(api(f"/projects/{site}/studios", token=host))), "site studios")
        assert rg["recommended"][0] == "artcraft" and "pixelorama" in rg["recommended"] and "godot" in rg["recommended"], rg["recommended"]
        assert rs["recommended"][0] == "artcraft" and "penpot" in rs["recommended"], rs["recommended"]
        assert rg["recommended"] != rs["recommended"] and rg["helps"] != rs["helps"]
        assert len(rg["studios"]) == len(st) and rg["pinned"] == []

        # ---- pins: builders yes, spectators and agents no; unknown ids dropped ----
        r = ok(api(f"/projects/{game}/studios", "PUT", {"pinned": ["godot", "pixelorama", "nope"]}, host), "pin")
        assert r["pinned"] == ["godot", "pixelorama"], r["pinned"]
        inv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        assert api(f"/projects/{game}/studios", "PUT", {"pinned": []}, spec)[0] == 403
        assert ok(api(f"/projects/{game}/studios", token=spec))["pinned"] == ["godot", "pixelorama"], "spectators can read"
        keys = api("/agents", "POST", {"name": "Camp's Claude"}, host)
        if keys[0] == 200 and (keys[1].get("token") or keys[1].get("key")):
            at = keys[1].get("token") or keys[1].get("key")
            assert api(f"/projects/{game}/studios", "PUT", {"pinned": []}, at)[0] in (401, 403), "agents can't pin"
        assert api("/projects/nope/studios", token=host)[0] == 404

        with sync_playwright() as p:
            b = p.chromium.launch()
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}" % (BASE, host)
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(init)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeStudios && window.TribeWorkshop && window.TribeProjects", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{game}', 'home')"); pg.wait_for_function(f"TribeClient.project() === '{game}'", timeout=10000)
            pg.evaluate("TribeStudios.open()")
            pg.wait_for_selector("#studios #sto-grid .sto-card", timeout=15000)
            assert pg.inner_text("#ws-title") == "Studios"
            assert pg.locator("#studios #sto-grid .sto-card").count() == len(st)
            assert "game" in pg.inner_text("#studios .sto-hero h2").lower()
            rec = pg.eval_on_selector_all("#sto-rec .sto-card", "els => els.map(e => e.dataset.id)")
            assert "pixelorama" in rec and "godot" in rec and "artcraft" not in rec, rec   # ArtCraft is the featured card above
            assert pg.locator("#studios .sto-card.wide[data-id='artcraft']").count() == 1
            assert pg.eval_on_selector_all("#sto-pinned .sto-card", "els => els.map(e => e.dataset.id)") == ["godot", "pixelorama"]
            links = pg.eval_on_selector_all("#studios .sto-dl", "els => els.map(a => [a.href, a.target, a.rel])")
            assert links and all(h.startswith("https://") and t == "_blank" and "noopener" in r for h, t, r in links), links[:3]
            hrefs = {a[0] for a in links}; assert "https://getartcraft.com/" in hrefs and "https://www.blender.org/download/" in hrefs
            # thumbnails are our own tiles (no <img> logos)
            assert pg.locator("#studios .sto-thumb img").count() == 0 and pg.locator("#studios .sto-thumb i").count() >= len(st)
            # real screenshots only where the tool's terms allow it (templates/studio-shots.json): credited, lazy, sized, never a logo
            shots = {x["id"]: x["shot"] for x in rg["studios"] if x.get("shot")}
            assert set(shots) == {"godot", "penpot"}, shots.keys()
            for sid, h in shots.items():
                assert h["source"].startswith("https://") and h["licenseUrl"].startswith("https://") and h["by"] and h["license"] and h["alt"], h
                im = pg.locator(f'#sto-grid .sto-card[data-id="{sid}"] .sto-shot img')
                assert im.count() == 1 and im.get_attribute("loading") == "lazy" and im.get_attribute("alt") == h["alt"], sid
                assert im.get_attribute("width") == str(h["w"]) and im.get_attribute("height") == str(h["h"]), "no layout shift: the picture's own size"
                cr = pg.locator(f'#sto-grid .sto-card[data-id="{sid}"] .sto-credit').inner_text()
                assert h["by"] in cr and h["license"] in cr, cr
                im.scroll_into_view_if_needed(); pg.wait_for_function("el => el.complete && el.naturalWidth > 0", arg=im.element_handle(), timeout=8000)
            assert pg.locator('#sto-grid .sto-card[data-id="blender"] .sto-shot').count() == 0, "no clear terms: the drawn tile only"
            # category filter, keyboard
            pg.click("[data-cat='sound']"); pg.wait_for_function("[...document.querySelectorAll('#sto-grid .sto-card')].map(c => c.dataset.id).sort().join() === 'audacity,beepbox,lmms'")
            pg.keyboard.press("ArrowRight"); pg.wait_for_function("document.querySelector('[data-cat=video]').classList.contains('on')")
            pg.click("[data-cat='']")
            if SHOTS: pg.screenshot(path=f"{SHOTS}/studios-1440.png", full_page=False); pg.locator("#sto-grid").screenshot(path=f"{SHOTS}/studios-grid-1440.png")
            # the detail pane explains for THIS project (a game)
            pg.click("#sto-grid .sto-card[data-id='pixelorama'] .sto-what"); pg.wait_for_selector("#sto-detail .sto-detail h2")
            helps_game = pg.inner_text("#sto-detail [data-helps]"); assert helps_game.startswith("In this game, use Pixelorama"), helps_game
            assert "assets/CREDITS.md" in pg.inner_text("#sto-detail") and pg.locator("#sto-detail [data-assets='pixel']").count() == 1
            d = pg.eval_on_selector("#sto-detail .sto-dl", "a => [a.href, a.target, a.rel]"); assert d[0] == "https://orama-interactive.itch.io/pixelorama" and d[1] == "_blank" and "noopener" in d[2], d
            if SHOTS: pg.screenshot(path=f"{SHOTS}/studios-detail-1440.png")
            # pin from the pane, the card shows "We use"
            pg.click("#sto-detail [data-pin]"); pg.wait_for_function("document.querySelector('#sto-detail [data-pin]').getAttribute('aria-pressed') === 'false'")
            until(lambda: ok(api(f"/projects/{game}/studios", token=host))["pinned"] == ["godot"], "unpinned pixelorama")
            pg.keyboard.press("Escape"); assert pg.locator("#sto-detail").count() == 0
            # a website project gets different recommendations and a different "how it helps"
            pg.evaluate("TribeWorkshop.close()")
            pg.evaluate(f"TribeProjects.switchTo('{site}', 'home')"); pg.wait_for_function(f"TribeClient.project() === '{site}'", timeout=10000)
            pg.evaluate("TribeStudios.open()"); pg.wait_for_function("document.querySelector('#studios .sto-hero h2') && document.querySelector('#studios .sto-hero h2').textContent.includes('website')", timeout=15000)
            rec2 = pg.eval_on_selector_all("#sto-rec .sto-card", "els => els.map(e => e.dataset.id)"); assert "penpot" in rec2 and rec2 != rec, rec2
            pg.evaluate("TribeStudios.detail('pixelorama')"); pg.wait_for_selector("#sto-detail [data-helps]")
            helps_site = pg.inner_text("#sto-detail [data-helps]"); assert helps_site != helps_game and "website" in helps_site, helps_site
            pg.keyboard.press("Escape"); pg.evaluate("TribeWorkshop.close()")
            # Ctrl K finds it
            assert pg.evaluate("(window.TribePaletteActions || []).flatMap(f => f()).some(a => a.label.startsWith('Studios'))")
            # the + menu has it
            pg.evaluate("window.TribeApp && TribeApp.show && TribeApp.show('chat')"); time.sleep(0.4)
            pg.evaluate("TribePlus.open(document.querySelector('#chat-input'))"); pg.wait_for_selector("[data-pl='studios']", state='attached', timeout=5000)
            pg.keyboard.press("Escape")
            # phone: a sheet, no horizontal scroll
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeStudios && window.TribeProjects", timeout=20000)
            ph.evaluate(f"TribeProjects.switchTo('{game}')"); ph.wait_for_function(f"TribeClient.project() === '{game}'", timeout=10000)
            ph.evaluate("TribeStudios.open()"); ph.wait_for_selector("#studios #sto-grid .sto-card", timeout=15000)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#ws-scroll') ? document.querySelector('#ws-scroll').scrollWidth : 0, document.querySelector('#ws-scroll') ? document.querySelector('#ws-scroll').clientWidth : 390]")
            assert sw[0] <= 390 and sw[1] <= sw[2] + 1, sw
            over = ph.evaluate("[...document.querySelectorAll('#studios .sto-card')].filter(c => c.getBoundingClientRect().right > 391).length"); assert over == 0, over
            if SHOTS: ph.screenshot(path=f"{SHOTS}/studios-390.png")
            ph.evaluate("TribeStudios.detail('godot')"); ph.wait_for_selector("#sto-detail .sto-detail.sheet")
            box = ph.evaluate("(() => { const r = document.querySelector('#sto-detail .sto-detail').getBoundingClientRect(); return [r.left, r.right]; })()"); assert box[0] >= 0 and box[1] <= 391, box
            if SHOTS: ph.screenshot(path=f"{SHOTS}/studios-detail-390.png")
            b.close()
        assert not errors, errors
        print("ok e2e_studios")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
