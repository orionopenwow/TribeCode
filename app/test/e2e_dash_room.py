"""p12 (feat/p12-dash): the dashboard's preview has room.

- The preview is the hero: at least ~60% of the content width on desktop, full width on phones.
- Its controls are one quiet row above the picture: tabs on the left, at most two buttons (Open, Change it) and ⋯.
- Nothing sits on the picture (no chips, labels or buttons over it).
- Flint's card sits beside it only when there is room (wide screens), otherwise below it at full width.
- The leftovers are gone: no "Most active" chip, no second Invite button, At a glance is one slim line.
- fleet.js's old Connect tabs are gone; their links open Agents & office's Add an AI helper.
"""
import os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5570 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

GEO = """() => {
  const r = s => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const band = document.querySelector('#pj-band-slot .db-band'), stage = band && band.querySelector('.db-stage');
  const sr = stage.getBoundingClientRect();
  // every visible thing in the band that is not part of the picture must stay off the picture
  const over = [...band.querySelectorAll('*')].filter(e => !stage.contains(e) && !e.contains(stage) && e.offsetParent).filter(e => {
    const b = e.getBoundingClientRect(); if (!b.width || !b.height) return false;
    return b.left < sr.right - 1 && b.right > sr.left + 1 && b.top < sr.bottom - 1 && b.bottom > sr.top + 1; }).map(e => e.className || e.tagName);
  const onPic = [...stage.querySelectorAll('.db-hint, .db-sk-tag, .db-kind, .db-main, button, .btn')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.className);
  const btns = [...band.querySelectorAll('.db-bar .db-acts [data-db]')].filter(e => e.offsetParent);
  return { ov: r('#pj-overview'), band: r('#pj-band-slot'), stage: r('#pj-band-slot .db-stage'), bar: r('#pj-band-slot .db-bar'), flint: r('#pj-flint-slot'),
    buttons: btns.filter(e => e.dataset.db !== 'more').map(e => e.dataset.db), more: btns.filter(e => e.dataset.db === 'more').length,
    tabs: [...band.querySelectorAll('.db-bar .db-tab')].length,
    rowTops: btns.concat([...band.querySelectorAll('.db-bar .db-tab')]).map(e => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)),
    over, onPic, sw: document.documentElement.scrollWidth, w: innerWidth };
}"""


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-room-"))
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeProjects && TribeClient.connected()", timeout=20000)
            # a project with an app and a website
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
            pg.fill("#np-idea", "A habit tracker app for my running club with streaks and a weekly leaderboard"); pg.click("#np-idea-go")
            pg.wait_for_timeout(6000); pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
            pid = pg.evaluate("TribeClient.project()")
            pg.evaluate("""pid => TribeClient.api(`/projects/${encodeURIComponent(pid)}/site-config`, { method: 'PUT', project: pid, body: { config: { pages: [{ blocks: [{ type: 'hero', props: { title: 'Run Club', subtitle: 'Every Saturday at 7' } }] }] }, force: true } })""", pid)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#pj-band-slot .db-band .db-bar", timeout=15000)
            pg.wait_for_function("document.querySelectorAll('#pj-band-slot .db-tab').length >= 2", timeout=15000)
            pg.wait_for_selector("#fd", timeout=15000)

            # 1. desktop: the hero, one quiet row, nothing on the picture, Flint beside only when there is room
            for w, h, beside in ((1280, 820, False), (1440, 900, False), (1920, 1080, True)):
                pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(900)
                g = pg.evaluate(GEO)
                assert g["band"]["w"] >= 0.6 * g["ov"]["w"] - 1, (w, g["band"], g["ov"])
                assert g["stage"]["h"] >= 300, (w, g["stage"])
                assert len(g["buttons"]) <= 2 and g["buttons"][0] == "open" and g["more"] == 1, (w, g["buttons"], g["more"])
                assert g["tabs"] >= 2 and max(g["rowTops"]) - min(g["rowTops"]) <= 4, (w, "one row", g["rowTops"])
                assert g["bar"]["b"] <= g["stage"]["t"] + 1, (w, "the controls sit above the picture")
                assert not g["over"] and not g["onPic"], (w, g["over"], g["onPic"])
                if beside: assert g["flint"]["l"] >= g["band"]["r"] - 1 and abs(g["flint"]["t"] - g["band"]["t"]) <= 2, (w, "Flint beside", g["flint"], g["band"])
                else: assert g["flint"]["t"] >= g["band"]["b"] - 1 and g["flint"]["w"] >= g["ov"]["w"] - 2, (w, "Flint below at full width", g["flint"], g["band"])
                assert g["sw"] <= g["w"] + 1, (w, "no sideways scroll")
            # Change it names the tool; Share link, pin and refresh are in ⋯
            assert pg.get_attribute("#pj-band-slot [data-db=open]", "title") in ("Open preview", "Open design")
            pg.click("#pj-band-slot [data-db=more]"); pg.wait_for_selector(".db-menu")
            menu = pg.inner_text(".db-menu"); assert "Refresh the picture" in menu, menu
            pg.keyboard.press("Escape")
            pg.click("#pj-band-slot [data-show=site]"); pg.wait_for_function("document.querySelector('#pj-band-slot .db-band').dataset.pick === 'site'", timeout=8000)
            assert pg.get_attribute("#pj-band-slot [data-db=designer]", "title") == "Open designer"
            pg.click("#pj-band-slot [data-db=more]"); assert "Share link" in pg.inner_text(".db-menu"); pg.keyboard.press("Escape")

            # 2. the leftovers are gone
            ov = pg.inner_text("#pj-overview")
            assert "Most active" not in ov and "MOST ACTIVE" not in ov.upper().replace("MOST ACTIVE PROJECT", ""), "no Most active chip"
            assert pg.locator("#pj-invite").count() == 0 and pg.locator("#pj-overview .gl-grid").count() == 0, "no second Invite, no tile block"
            assert pg.locator("#pj-band-slot .db-id, #pj-band-slot [data-db=share]").count() == 0, "no name repeat and no third button"

            # 3. phones: full width, one row, Flint below
            pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(1200)
            g = pg.evaluate(GEO)
            assert g["band"]["w"] >= g["ov"]["w"] - 2, ("full width", g["band"], g["ov"])
            assert len(g["buttons"]) <= 2 and g["more"] == 1 and max(g["rowTops"]) - min(g["rowTops"]) <= 4 and g["bar"]["h"] <= 52, ("one row", g)
            assert not g["over"] and not g["onPic"], (g["over"], g["onPic"])
            assert g["flint"]["t"] >= g["band"]["b"] - 1, "Flint below"
            assert g["sw"] <= g["w"] + 1, "no sideways scroll"
            assert g["stage"]["h"] >= 220, g["stage"]

            assert not errs, errs
            b.close()
        print("ok  e2e_dash_room: the preview has room")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
