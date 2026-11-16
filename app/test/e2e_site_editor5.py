"""The website designer, pass 5 (app/ui/sitedesigner.js/.css, sitedesigner-frame.js, siteparts.js, sitecfg.js, flintcreate.js).
Checks:
 1 four columns: blocks, the page, the panel and Flint, left to right, with no overlap; the panel has the whole height
   (the last colour button is not cut off); Flint's thread ends at the box, at most three chips, Polish it is one row,
   the no-AI note is behind an info button;
 2 Ctrl J folds Flint to a slim rail on the far right and back, remembered when the designer opens again;
 3 under 1280 Flint is a rail; open, he is a drawer that never covers the panel;
 4 a phone: the box to type in is at the bottom, the handle opens his replies, no chips in the folded state;
 5 the Design flow's plan stays out of the designer;
 6 the list of blocks: drag to reorder (a line shows where it lands), rename (double-click, F2), hide, lock; a locked
   section cannot be removed, typed in or changed by Flint, and its bar on the page unlocks it;
 7 the right-click menu, on the list and on the page: cut, copy, paste, rename, copy look, paste look, lock, hide on computers;
 8 pages are dragged into a new order (Home stays first); a new block is dragged onto the page; an entry in the panel's
   list is dragged; a finger holds then drags in the list on a phone;
 9 Tab steps through the sections on the page; a link pasted onto selected words makes them a link; a picture file dropped
   on a picture replaces it;
10 find and replace on every page (one, all, one Undo, locked sections left alone); history goes back and forward;
11 a button's words: the first click puts the caret at the end, and the panel's box follows words typed on the page;
12 the shortcuts sheet lists the new keys.
Usage: TRIBE_PORT_OFFSET=61 python3 app/test/e2e_site_editor5.py [--shots DIR]
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6620 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
errors = []
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] in (200, 202), f"{what}: {r}"
    return r[1]


def shot(pg, name):
    if SHOTS: pg.screenshot(path=str(Path(SHOTS) / name))


def cfg(pg): return pg.evaluate("TribeSiteDesigner.cfg()")
def blocks(pg): return cfg(pg)["pages"][0]["blocks"]
def types(pg): return [b["type"] for b in blocks(pg)]
def rect(pg, sel): return pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {{ l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }}; }})()")
def frm(pg): return next(f for f in pg.frames if f != pg.main_frame)
def toast(pg): return pg.evaluate("[...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ')")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-se5-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Gubba"}, token=host)); pid = (p.get("project") or p)["id"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1440, h=900, phone=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, theme: 'dark', tour: {done: true}, checklist: {setup: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (BASE, host)
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=1)
                c.grant_permissions(["clipboard-read", "clipboard-write"])
                c.add_init_script(init); pg = c.new_page()
                pg.on("pageerror", lambda e: errors.append(f"{e} {(e.stack or '')[:300]}"))
                pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeSiteDesigner && window.TribeUI", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(400)
                return pg

            def open_designer(pg, tpl=True):
                pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}'{', template: \"linkbio\"' if tpl else ''} }})")
                pg.wait_for_selector("#wdz:not([hidden])", timeout=15000)
                pg.frame_locator("#wdz-frame").locator("[data-block]").first.wait_for(timeout=20000)
                pg.wait_for_timeout(600)

            cp = page(); open_designer(cp)
            fr = cp.frame_locator("#wdz-frame")

            # ---------- 11 (first, on the template's words): a button's words ----------
            labels = lambda: [x["label"] for x in next(x for x in blocks(cp) if x["type"] == "links")["props"]["items"]]
            fr.locator("[data-btn]").nth(1).click(); cp.wait_for_timeout(250); cp.keyboard.type(" now"); cp.wait_for_timeout(1300)
            assert labels()[1] == "Wheel-throwing class, Saturdays now", ("the first click puts the caret at the end", labels())
            fr.locator("[data-btn]").nth(1).click(); cp.wait_for_timeout(150); cp.keyboard.press("End"); cp.keyboard.type("!"); cp.wait_for_timeout(100)   # a second click puts the caret where it lands
            cp.click("#wdz-insp [data-lab]"); cp.wait_for_timeout(200)
            assert cp.input_value("#wdz-insp [data-lab]").endswith("!"), ("the panel's box follows what was typed on the page", cp.input_value("#wdz-insp [data-lab]"))
            cp.keyboard.press("End"); cp.keyboard.type("?"); cp.keyboard.press("Enter"); cp.wait_for_timeout(500)
            assert labels()[1].endswith("!?"), ("an edit in the panel keeps the words typed on the page", labels())
            cp.keyboard.press("Escape"); cp.wait_for_timeout(200)

            # ---------- 1: four columns ----------
            fr.locator("[data-btn]").nth(1).click(); cp.wait_for_timeout(300)
            L, M, R, F = rect(cp, "#wdz .wdz-left"), rect(cp, "#wdz .wdz-stage"), rect(cp, "#wdz .wdz-right"), rect(cp, "#wdz-fl")
            assert L["r"] <= M["l"] + 1 and M["r"] <= R["l"] + 1 and R["r"] <= F["l"] + 1 and F["r"] >= 1439, ("blocks, page, panel, Flint", L, M, R, F)
            assert F["w"] >= 300 and R["h"] >= 800 and F["h"] >= 800, (F, R)
            strong = cp.locator("#wdz-insp [data-escol='ink'], #wdz-insp button:has-text('Strong')").first
            strong.scroll_into_view_if_needed(); sr = strong.bounding_box(); ir = rect(cp, "#wdz-insp")
            assert sr["y"] + sr["height"] <= ir["b"] + 1, ("the colour row is not cut off", sr, ir)
            assert cp.locator("#wdz-fl .fl-chip").count() <= 3, "three chips at most"
            assert not cp.locator("#wdz-fl .flm-ctx").is_visible(), "no 'Website' label in the website designer"
            pr = rect(cp, "#wdz-fl .fc-row"); assert pr and pr["h"] <= 42, ("Polish it is one row", pr)
            assert cp.locator("#wdz-fl [data-fc-line]").count() == 1 and not cp.locator("#wdz-fl [data-fc-line]").is_visible()
            cp.click("#wdz-fl [data-fc-tip]"); assert cp.locator("#wdz-fl [data-fc-line]").is_visible(), "the info button shows the note"
            cp.click("#wdz-fl [data-fc-tip]")
            th, bar = rect(cp, "#wdz-fl .flm-thread .fl-empty, #wdz-fl .flm-thread > :last-child"), rect(cp, "#wdz-fl .fl-bar")
            assert th and bar and bar["t"] - th["b"] < 260, ("the newest words sit near the box", th, bar)
            shot(cp, "p5-site-1440.png")

            # ---------- 2: Ctrl J, the rail, remembered ----------
            cp.keyboard.press("Control+j"); cp.wait_for_timeout(200)
            F2 = rect(cp, "#wdz-fl"); assert F2["w"] <= 48 and cp.locator("#wdz-fl .wdz-fl-rail").is_visible(), F2
            assert rect(cp, "#wdz .wdz-stage")["w"] > M["w"] + 250, "the page gets the room back"
            shot(cp, "p5-site-rail-1440.png")
            cp.evaluate("TribeSiteDesigner.close()"); cp.wait_for_selector("#wdz", state="hidden")
            open_designer(cp, tpl=False)
            assert rect(cp, "#wdz-fl")["w"] <= 48, "folded stays folded"
            cp.click("#wdz-fl .wdz-fl-rail"); cp.wait_for_timeout(200)
            assert rect(cp, "#wdz-fl")["w"] >= 300 and cp.evaluate("document.activeElement && document.activeElement.classList.contains('fl-in')"), "open again, the box has the focus"

            # ---------- 5: the plan stays out ----------
            cp.evaluate("(() => { const c = document.createElement('button'); c.id = 'dfl-chip'; c.textContent = 'Plan 0/7'; document.querySelector('#wdz .wdz-top').appendChild(c); const d = document.createElement('aside'); d.id = 'dfl-dock'; d.textContent = 'Goal and audience'; document.body.appendChild(d); document.body.classList.add('dfl-side'); })()")
            assert not cp.locator("#dfl-chip").is_visible() and not cp.locator("#dfl-dock").is_visible(), "no plan in the designer"
            assert rect(cp, "#wdz")["r"] >= 1439, "the designer keeps the whole width"
            cp.evaluate("document.getElementById('dfl-chip').remove(); document.getElementById('dfl-dock').remove(); document.body.classList.remove('dfl-side')")

            # ---------- 6: the list of blocks ----------
            for ty in ["gallery", "faq"]:
                cp.click("[data-wdz='picker']"); cp.click(f"#wdz-picker [data-add='{ty}']"); cp.wait_for_timeout(250)
            assert types(cp) == ["links", "gallery", "faq", "footer"], types(cp)
            rows = cp.locator("#wdz-blocks .wdz-blk")
            # a line shows where it lands while dragging
            seen = cp.evaluate("""(() => { const rs = document.querySelectorAll('#wdz-blocks .wdz-blk'), dt = new DataTransfer(); rs[2].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
              const r = rs[0].getBoundingClientRect(); rs[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 3 }));
              const line = document.querySelector('.wdz-left .wdz-ldrop'); const ok = !!line && line.getBoundingClientRect().width > 100;
              rs[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 3 })); rs[2].dispatchEvent(new DragEvent('dragend', { bubbles: true })); return ok; })()""")
            cp.wait_for_timeout(300)
            assert seen, "a drop line while dragging"
            assert types(cp) == ["faq", "links", "gallery", "footer"], ("dragged to the top", types(cp))
            cp.keyboard.press("Control+z"); cp.wait_for_timeout(200); assert types(cp) == ["links", "gallery", "faq", "footer"], "one Undo"
            cp.keyboard.press("Control+Shift+z"); cp.wait_for_timeout(200)
            rows.nth(2).drag_to(rows.nth(1), target_position={"x": 20, "y": 3}); cp.wait_for_timeout(300)
            assert types(cp) == ["faq", "gallery", "links", "footer"], ("a real mouse drag", types(cp))
            # rename: double-click, and F2
            cp.locator("#wdz-blocks .wdz-blk-t").nth(0).dblclick(); cp.wait_for_selector(".wdz-ren")
            cp.keyboard.press("Control+a"); cp.keyboard.type("Questions"); cp.keyboard.press("Enter"); cp.wait_for_timeout(250)
            assert blocks(cp)[0].get("name") == "Questions" and cp.locator("#wdz-blocks .wdz-blk-n").nth(0).inner_text() == "Questions"
            cp.locator("#wdz-blocks [data-pick]").nth(1).click(); cp.wait_for_timeout(150); cp.keyboard.press("F2"); cp.wait_for_selector(".wdz-ren")
            cp.keyboard.type("Work"); cp.keyboard.press("Escape"); cp.wait_for_timeout(200)
            assert not blocks(cp)[1].get("name"), "Esc leaves the name as it was"
            # hide with the eye
            cp.locator("#wdz-blocks [data-hide]").nth(1).click(); cp.wait_for_timeout(200); assert blocks(cp)[1].get("hidden")
            cp.locator("#wdz-blocks [data-hide]").nth(1).click(); cp.wait_for_timeout(200); assert not blocks(cp)[1].get("hidden")
            # lock: nothing changes it, then the bar on the page unlocks it
            cp.locator("#wdz-blocks [data-lock]").nth(0).click(); cp.wait_for_timeout(250); assert blocks(cp)[0].get("locked")
            cp.locator("#wdz-blocks [data-pick]").nth(0).click(); cp.wait_for_timeout(150); cp.keyboard.press("Delete"); cp.wait_for_timeout(250)
            assert types(cp)[0] == "faq" and "locked" in toast(cp), ("a locked section is not removed", toast(cp))
            assert frm(cp).evaluate("[...document.querySelectorAll('[data-locked] [data-e]')].every(e => e.getAttribute('contenteditable') === 'false')"), "nobody types in it"
            cp.evaluate("TribeSiteDesigner.ask('remove this section')"); cp.wait_for_timeout(500)
            assert types(cp)[0] == "faq", "Flint does not remove it either"
            assert cp.locator("#wdz-blocks .wdz-blk").nth(0).get_attribute("draggable") == "false"
            frm(cp).evaluate("document.querySelector('[data-locked]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))")
            frm(cp).click(".wdz-bar [data-a='unlock']"); cp.wait_for_timeout(300)
            assert not blocks(cp)[0].get("locked"), "the bar unlocks it"
            shot(cp, "p5-site-list-1440.png")

            # ---------- 7: the right-click menu, copy and paste a look ----------
            cp.locator("#wdz-blocks .wdz-blk").nth(1).click(button="right"); cp.wait_for_selector(".sp-menu:not([hidden])")
            items = cp.locator(".sp-menu button").all_inner_texts()
            for want in ["Cut", "Copy", "Duplicate", "Rename", "Move up", "Copy look", "Hide on computers", "Lock", "Remove"]:
                assert any(x.startswith(want) for x in items), (want, items)
            shot(cp, "p5-site-menu-1440.png")
            cp.keyboard.press("Escape")
            cp.evaluate("TribeSiteDesigner.ask('make this section teal')"); cp.wait_for_timeout(400)
            look = blocks(cp)[1].get("style") or {}
            cp.locator("#wdz-blocks .wdz-blk").nth(1).click(button="right"); cp.click(".sp-menu [data-val='blk-copylook']"); cp.wait_for_timeout(150)
            cp.locator("#wdz-blocks .wdz-blk").nth(2).click(button="right"); cp.wait_for_selector(".sp-menu [data-val='blk-pastelook']"); cp.click(".sp-menu [data-val='blk-pastelook']"); cp.wait_for_timeout(250)
            assert {k: v for k, v in (blocks(cp)[2].get("style") or {}).items() if k != "hide"} == {k: v for k, v in look.items() if k != "hide"}, ("the look is pasted", look, blocks(cp)[2].get("style"))
            # on the page too, and Copy then Paste below
            fr.locator("[data-block]").nth(1).click(button="right", position={"x": 6, "y": 6}); cp.wait_for_selector(".sp-menu:not([hidden])")
            cp.click(".sp-menu [data-val='blk-copy']"); cp.wait_for_timeout(150)
            fr.locator("[data-block]").nth(1).click(button="right", position={"x": 6, "y": 6}); cp.click(".sp-menu [data-val='blk-paste']"); cp.wait_for_timeout(300)
            assert len(types(cp)) == 5 and types(cp)[2] == types(cp)[1], ("pasted below", types(cp))
            cp.keyboard.press("Control+z"); cp.wait_for_timeout(200)

            # ---------- 8: pages, a new block onto the page, an entry in the panel ----------
            cp.evaluate("TribeSiteDesigner.ask('add a page called About')"); cp.wait_for_timeout(400)
            cp.evaluate("TribeSiteDesigner.ask('add a page called Shop')"); cp.wait_for_timeout(400)
            cp.click("#wdz-pages .wdz-tab[data-page]:first-child"); cp.wait_for_timeout(200)
            tabs = cp.locator("#wdz-pages .wdz-tab[data-page]")
            assert tabs.nth(0).get_attribute("draggable") is None, "Home stays first"
            tabs.nth(2).drag_to(tabs.nth(1), target_position={"x": 3, "y": 10}); cp.wait_for_timeout(300)
            assert [x["title"] for x in cfg(cp)["pages"]] == ["Home", "Shop", "About"], [x["title"] for x in cfg(cp)["pages"]]
            n0 = len(types(cp))
            cp.click("[data-wdz='picker']"); cp.wait_for_timeout(200)
            cp.evaluate("document.querySelector('#wdz-picker [data-add=\"team\"]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }))")
            frm(cp).evaluate("""(() => { const b = document.querySelectorAll('[data-block]'), r = b[1].getBoundingClientRect(), x = r.left + 20, y = r.top + 4, t = document.elementFromPoint(x, y), dt = new DataTransfer();
              t.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
              t.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt })); })()""")
            cp.wait_for_timeout(400)
            assert len(types(cp)) == n0 + 1 and types(cp)[1] == "team", ("dropped where the line was", types(cp))
            cp.evaluate("document.querySelector('#wdz-picker [data-add]') && document.querySelector('#wdz-picker [data-add]').dispatchEvent(new DragEvent('dragend', { bubbles: true }))")
            li = next(i for i, x in enumerate(blocks(cp)) if x["type"] == "links")
            cp.locator("#wdz-blocks [data-pick]").nth(li).click(); cp.wait_for_timeout(250)
            before = labels(); ents = cp.locator("#wdz-insp .sp-list").first.locator(".sp-li")
            ents.nth(3).drag_to(ents.nth(0), target_position={"x": 20, "y": 3}); cp.wait_for_timeout(300)
            assert labels()[0] == before[3] and labels()[1] == before[0], ("an entry dragged in the panel", before, labels())

            # ---------- 9: Tab, paste a link, drop a picture ----------
            fr.locator("[data-block]").nth(0).click(position={"x": 5, "y": 5}); cp.wait_for_timeout(150)
            s0 = cp.evaluate("TribeSiteDesigner.state().sel"); frm(cp).press("body", "Tab"); cp.wait_for_timeout(150); s1 = cp.evaluate("TribeSiteDesigner.state().sel")
            assert s1 and s0 and s1["block"] == blocks(cp)[1]["id"], ("Tab selects the next section", s0, s1)
            frm(cp).press("body", "Shift+Tab"); cp.wait_for_timeout(150); assert cp.evaluate("TribeSiteDesigner.state().sel")["block"] == blocks(cp)[0]["id"]
            gi = next(i for i, x in enumerate(blocks(cp)) if x["type"] == "gallery")
            title = fr.locator(f"[data-block='{blocks(cp)[gi]['id']}'] [data-e]").first; title.click(); cp.wait_for_timeout(150)
            frm(cp).evaluate("""(() => { const el = document.activeElement, r = document.createRange(); r.selectNodeContents(el); const g = getSelection(); g.removeAllRanges(); g.addRange(r);
              const dt = new DataTransfer(); dt.setData('text/plain', 'https://example.com/work'); el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })); })()""")
            cp.wait_for_timeout(900)
            assert "(https://example.com/work)" in json.dumps(blocks(cp)[gi]["props"]), "the selected words became a link"
            cp.keyboard.press("Escape")
            frm(cp).evaluate("""(b64) => { const im = document.querySelector('[data-img]:not([data-img^="@"])'), bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
              const dt = new DataTransfer(); dt.items.add(new File([u], 'face.png', { type: 'image/png' })); const r = im.getBoundingClientRect();
              im.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 }));
              im.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 })); }""", PNG)
            cp.wait_for_timeout(1000)
            assert "data:image/png" in json.dumps(blocks(cp)), "the dropped file is the picture now"

            # ---------- 10: find and replace, history ----------
            cp.keyboard.press("Control+f"); cp.wait_for_selector("#wdz-find:not([hidden])")
            cp.fill("#wdz-fq", "Saturdays"); cp.wait_for_timeout(150)
            assert "1" in cp.inner_text("#wdz-find .wdz-fn"), cp.inner_text("#wdz-find .wdz-fn")
            cp.fill("#wdz-fr", "Sundays"); cp.click("#wdz-find [data-fr='one']"); cp.wait_for_timeout(250)
            assert "Sundays" in json.dumps(cfg(cp)) and "Saturdays" not in json.dumps(cfg(cp))
            cp.fill("#wdz-fq", "a"); cp.fill("#wdz-fr", "A")
            lk = next(x for x in blocks(cp) if x["type"] == "footer")["id"]
            cp.evaluate(f"(() => {{ const r = document.querySelector('#wdz-blocks .wdz-blk[data-blk=\"{lk}\"] [data-lock]'); r.click(); }})()"); cp.wait_for_timeout(200)
            foot0 = json.dumps(next(x for x in blocks(cp) if x["type"] == "footer")["props"])
            cp.keyboard.press("Control+f"); cp.click("#wdz-find [data-fr='all']"); cp.wait_for_timeout(300)
            assert json.dumps(next(x for x in blocks(cp) if x["type"] == "footer")["props"]) == foot0, "a locked section is left as it was"
            assert "Replaced" in cp.inner_text("#wdz .wdz-saved") or "Replaced" in toast(cp)
            shot(cp, "p5-site-find-1440.png")
            cp.keyboard.press("Escape"); cp.keyboard.press("Control+z"); cp.wait_for_timeout(250)
            assert "Sundays" in json.dumps(cfg(cp)) and "SundAys" not in json.dumps(cfg(cp)), "one Undo takes every replacement back"
            cp.click("#wdz [data-wdz='more']"); cp.click("#wdz-more [data-wdz='history']"); cp.wait_for_selector("#wdz-hist:not([hidden])")
            hist = cp.locator("#wdz-hist .wdz-hrow").all_inner_texts()
            assert any("Locked" in h for h in hist) and any("Moved" in h for h in hist) and hist[-1].startswith("Where you started"), hist
            shot(cp, "p5-site-history-1440.png")
            n = cp.locator("#wdz-hist .wdz-hrow").count(); now = types(cp)
            cp.locator("#wdz-hist .wdz-hrow").nth(n - 1).click(); cp.wait_for_timeout(300)
            assert types(cp) == ["links", "footer"], ("back to where it started", types(cp))
            cp.locator("#wdz-hist .wdz-hrow").nth(0).click(); cp.wait_for_timeout(300)
            assert types(cp) == now, "and forward again"
            cp.keyboard.press("Escape")

            # ---------- 12: shortcuts ----------
            cp.keyboard.press("?"); cp.wait_for_selector("#wdz-keys:not([hidden])")
            sheet = cp.inner_text("#wdz-keys")
            for want in ["Ctrl J", "F2", "Ctrl F", "Ctrl Shift L", "Ctrl Alt C", "Tab"]: assert want in sheet, (want, sheet[:400])
            cp.keyboard.press("Escape")

            # ---------- 3: under 1280, the drawer never covers the panel ----------
            cp.set_viewport_size({"width": 1100, "height": 800}); cp.wait_for_timeout(300)
            assert rect(cp, "#wdz-fl")["w"] <= 48, "a rail in a narrower window"
            cp.click("#wdz-fl .wdz-fl-rail"); cp.wait_for_timeout(250)
            D, R = rect(cp, "#wdz-flint"), rect(cp, "#wdz .wdz-right")
            assert D["w"] >= 280 and D["r"] <= R["l"] + 1, ("the drawer stays left of the panel", D, R)
            shot(cp, "p5-site-1100.png")
            cp.keyboard.press("Control+j"); cp.wait_for_timeout(150)
            assert not cp.locator("#wdz-flint").is_visible()

            # ---------- 4 and 8: a phone ----------
            pp = page(390, 844, True); open_designer(pp, tpl=False)
            bx = pp.locator("#wdz-flint input.fl-in"); assert bx.is_visible(), "the box is there on a phone"
            r = bx.bounding_box(); assert r["y"] + r["height"] > 844 - 80, ("at the bottom", r)
            assert not pp.locator("#wdz-fl .fl-chip").first.is_visible() if pp.locator("#wdz-fl .fl-chip").count() else True
            top = pp.evaluate("document.querySelector('#wdz .wdz-top').getBoundingClientRect().height"); assert top <= 56, top
            pp.click("#wdz-fl .wdz-fl-grab"); pp.wait_for_timeout(250)
            assert pp.locator("#wdz-fl .flm-thread").is_visible() and pp.evaluate("document.querySelector('#wdz-fl').getBoundingClientRect().height") > 400
            shot(pp, "p5-site-390-sheet.png")
            pp.click("#wdz-fl .wdz-fl-grab"); pp.wait_for_timeout(200)
            shot(pp, "p5-site-390.png")
            # a finger holds, then drags in the list of blocks
            pp.locator("#wdz .wdz-left").scroll_into_view_if_needed(); pp.wait_for_timeout(200)
            t0 = [x["type"] for x in cfg(pp)["pages"][0]["blocks"]]
            r0, r1 = pp.locator("#wdz-blocks .wdz-blk").nth(1).bounding_box(), pp.locator("#wdz-blocks .wdz-blk").nth(0).bounding_box()
            cdp = pp.context.new_cdp_session(pp)
            x0, y0 = r0["x"] + 70, r0["y"] + r0["height"] / 2
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]}); pp.wait_for_timeout(520)
            for k in range(1, 7): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0, "y": y0 - (y0 - (r1["y"] + 3)) * k / 6}]}); pp.wait_for_timeout(40)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); pp.wait_for_timeout(400)
            t1 = [x["type"] for x in cfg(pp)["pages"][0]["blocks"]]
            assert t1[0] == t0[1] and t1[1] == t0[0], ("a long press then a drag moves it", t0, t1)
            pp.context.close()

            assert not errors, errors
            print("e2e_site_editor5: OK")
            b.close()
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
