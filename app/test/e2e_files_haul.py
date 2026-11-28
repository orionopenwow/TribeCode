"""Files, design pass (p14): a project's Files (app/ui/filesview.js, filegrid.js, filesbrain.js) on a computer and a phone.

Checks, desktop 1366: the title "Files" with a count and one primary button, "New"; exactly one search box (it also
takes a pasted link: "Save link" shows); Website and Skills are not tabs over Files any more; "What we know" is one
compact line that opens and closes; one row of kind chips (All · Docs · Sheets · Slides · Links · Decisions · Questions,
the rest under More); the New menu lists Doc, Sheet, Slides, Whiteboard, Design, Note, Upload files, Paste a link with
their keys (Website etc. under More), arrows move, Escape closes, and pressing D makes a doc that opens with its name
selected; many files show as list rows by default (kind, name, who, when) grouped Pinned · Recent · Everything else;
grid cards are all one size; search narrows the list; empty kinds offer one next step ("No sheets yet" · New sheet);
dragging files over Files shows the drop overlay; nothing scrolls sideways.
Phone 390: the same order (title + New, the one search box, What we know, chips), list rows by default, the search
box stays on screen while scrolling, the New menu fits, no giant coloured tile, no sideways scroll; no console errors.
Usage: python app/test/e2e_files_haul.py   (FILES_HAUL_SHOTS=dir saves screenshots)
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5330 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("FILES_HAUL_SHOTS")
errors = []
MAIN_NEW = ["Doc", "Sheet", "Slides", "Whiteboard", "Design", "Note", "Upload files", "Paste a link"]


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, token, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); }} catch (e) {{}}")
    page = ctx.new_page(); watch(page, "phone" if mobile else "desk")
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("(document.querySelector('#sync-status') || {}).textContent?.includes('connected')", timeout=15000)
    return page


def files(pg):
    pg.evaluate("document.querySelectorAll('.fx-pop').forEach(x => x.remove()); TribeApp.show('docs')")
    for _ in range(8):   # an open doc goes back to all files (Done)
        pg.wait_for_timeout(250); pg.evaluate("TribeDocs.shelf && TribeDocs.shelf()")
        try: pg.wait_for_selector("#fg-title", timeout=1500); break
        except Exception: pass
    pg.wait_for_selector("#fg-title", timeout=5000)
    try: pg.wait_for_selector("#fb-hero .fb-sum:not(:has(.fb-skel))", timeout=10000)
    except Exception:
        if SHOTS: pg.screenshot(path=str(Path(SHOTS) / "files-haul-fail.png")); print(pg.evaluate("[document.body.dataset.view, !!document.querySelector('#fb-hero'), (document.querySelector('#fb-hero')||{}).outerHTML?.slice(0,300), TribeFilesBrain.state().data ? 'data' : 'nodata', TribeFilesBrain.state().pid, TribeClient.project()]"))
        raise


def shot(pg, name):
    if SHOTS: pg.wait_for_timeout(250); pg.screenshot(path=str(Path(SHOTS) / f"files-haul-{name}.png"))


def sideways(pg):
    return max(pg.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth]"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-haul-", dir="/tmp")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(Path(tmp) / "tribe"), "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        tok = ok(api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}), "bootstrap")["token"]
        for i in range(20):
            ok(api("/docs", "POST", {"title": f"Level {i + 1:02d} notes", "body": f"# Level {i + 1}\n\n- lanterns\n- caves"}, token=tok))
        ok(api("/docs", "POST", {"title": "Launch plan", "body": "# Launch plan\n\nFriday."}, token=tok))
        ok(api("/docs/level-03-notes/meta", "PATCH", {"pinned": True}, token=tok), "pin")
        ok(api("/brain", "POST", {"note": {"title": "Cabin music", "text": "Soft guitar, rain on the roof.", "tags": ["audio"]}}, token=tok))
        # opened from Files: Level 07 three times, Level 05 once (the project keeps the counts, per person)
        for slug in ["level-07-notes"] * 3 + ["level-05-notes"]: ok(api(f"/docs/{slug}/opened", "POST", {}, token=tok), "opened")
        d7 = next(d for d in ok(api("/docs", token=tok))["docs"] if d["slug"] == "level-07-notes")
        assert d7["myOpens"] == 3 and d7["opens"] == 3, d7

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = login(b, {"width": 1366, "height": 900}, tok)
            files(pg)

            # ---- 1. the header: Files, a count, one primary New ----
            assert pg.inner_text("#fg-title").strip() == "Files"
            assert "files" in pg.inner_text("#fg-count")
            assert pg.locator(".fx .btn.primary:visible").count() == 1, "one primary button"
            assert pg.inner_text("#fg-new-menu").strip() == "New"
            # Website and Skills are not tabs over Files (Website lives in Design Studio, Skills in Learn)
            for t in ("#wt-website", "#wt-academy"): assert not pg.locator(t).is_visible(), t
            # ---- 2. one search box ----
            assert pg.locator(".fx input[type=search]").count() == 1 and pg.locator("#fb-q").is_visible(), "one search box"
            assert pg.locator(".fb-find, .fb-box").count() == 0, "What we know has no box of its own"
            assert "paste a link" in pg.get_attribute("#fb-q", "placeholder")
            pg.fill("#fb-q", "https://example.com/some/page"); pg.wait_for_selector("#fb-save:not(.hidden)")
            pg.fill("#fb-q", ""); pg.wait_for_selector("#fb-save.hidden", state="attached")
            # "/" focuses it
            pg.click("#fg-title"); pg.keyboard.press("/"); assert pg.evaluate("document.activeElement.id") == "fb-q"
            pg.keyboard.press("Escape")
            # ---- 3. What we know: one compact line that opens ----
            h = pg.eval_on_selector("#fb-hero", "e => e.getBoundingClientRect().height")
            assert h < 90, f"What we know is compact: {h}"
            assert not pg.locator("#fb-more").is_visible()
            pg.click("#fb-toggle"); pg.wait_for_selector("#fb-more", state="visible")
            assert pg.get_attribute("#fb-toggle", "aria-expanded") == "true" and pg.locator("#fb-note").is_visible()
            pg.click("#fb-toggle"); pg.wait_for_selector("#fb-more", state="hidden")
            # order: header, search, What we know, chips, files
            ys = pg.evaluate("['.fx-head', '#fg-find', '#fb-hero', '.fx-row', '#fg-items'].map(s => document.querySelector(s).getBoundingClientRect().top)")
            assert ys == sorted(ys), ys
            # ---- 4. one row of chips, the rest under More ----
            row = pg.eval_on_selector_all(".fx-row .fx-tabs > [data-dk] .fx-tl", "e => e.map(x => x.textContent)")
            assert row == ["All", "Docs", "Sheets", "Slides", "Links", "Decisions", "Questions"], row
            tops = pg.eval_on_selector_all(".fx-row .fx-tabs > [data-dk], .fx-row details.fx-more", "e => e.map(x => Math.round(x.getBoundingClientRect().top))")
            assert len(set(tops)) == 1, f"one row: {tops}"
            assert pg.locator("details.fx-more [data-dk=pics]").count() == 1
            # ---- 5. many files: cards with real previews; Jump back in, Pinned, Recent, Everything else (collapsed) ----
            pg.wait_for_selector("#fg-items .fx-items.grid:not(.fx-jump)")
            heads = pg.eval_on_selector_all("#fg-items .fx-gh h2", "e => e.map(x => x.textContent)")
            assert heads[:4] == ["Jump back in", "Pinned", "Recent", "Everything else"], heads
            pg.evaluate("document.querySelector('#main').scrollTop = 330"); shot(pg, "desk-top")
            jump = pg.eval_on_selector_all("[data-group=jump] .fx-name", "e => e.map(x => x.textContent)")
            assert len(jump) == 6 and jump[0] == "Level 07 notes" and jump[1] == "Level 05 notes", f"opened more ranks higher: {jump}"
            assert "Level 03 notes" in pg.inner_text("[data-group=pinned]") and "Level 03 notes" not in jump
            # previews: a doc's first page with its text, a note's card; every card has one
            assert pg.eval_on_selector_all("#fg-items .fx-card", "e => e.every(c => c.querySelector('.fx-th .fg-th'))"), "every card has a preview"
            assert "lanterns" in pg.inner_text("[data-group=jump] .fx-card >> nth=0"), "a doc's preview shows its text"
            assert pg.locator("#fg-items .fx-card[data-cat=links] .fb-th").count() >= 1
            # Everything else shows its first six, Show all 8 opens the rest and is remembered
            assert pg.locator("[data-group=rest] .fx-card").count() == 6
            assert pg.inner_text("[data-show=rest]").strip() == "Show all 9"
            pg.click("[data-show=rest]"); pg.wait_for_function("document.querySelectorAll('[data-group=rest] .fx-card').length === 9")
            assert pg.inner_text("[data-show=rest]").strip() == "Show fewer"
            files(pg); assert pg.locator("[data-group=rest] .fx-card").count() == 9, "Show all is remembered"
            # grid: every card the same size
            sizes = pg.eval_on_selector_all("[data-group=rest] .fx-card, [data-group=recent] .fx-card", "e => e.map(x => [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)])")
            assert len({s[0] for s in sizes}) == 1 and len({s[1] for s in sizes}) == 1, f"uniform cards: {set(map(tuple, sizes))}"
            shot(pg, "desk-grid")
            pg.click("[data-show=rest]"); pg.wait_for_function("document.querySelectorAll('[data-group=rest] .fx-card').length === 6")
            # opening a card counts for you on the project
            pg.click("[data-group=rest] .fx-card >> nth=0"); pg.wait_for_selector("#doc-title", timeout=10000)
            t0 = time.time()
            while not any(d.get("myOpens") for d in ok(api("/docs", token=tok))["docs"] if d["slug"] not in ("level-07-notes", "level-05-notes")):
                assert time.time() - t0 < 10, "the open was counted"
                time.sleep(0.3)
            files(pg)
            # list rows: a small real preview, the name and kind, who, when; ⋯ on hover
            pg.click("[data-dv=list]"); pg.wait_for_selector("#fg-items .fx-items.list")
            r0 = pg.locator("#fg-items .fx-items.list .fx-card").first
            tb = r0.locator(".fx-th").bounding_box(); assert 40 <= tb["width"] <= 48 and r0.locator(".fx-th .fg-th").count() == 1, f"row preview: {tb}"
            assert r0.locator(".fx-c-who").is_visible() and r0.locator(".fx-c-when").is_visible()
            assert pg.locator("[data-group=jump] .fx-items.grid").count() == 1, "Jump back in stays cards"
            hh = pg.eval_on_selector_all("#fg-items .fx-items.list .fx-card", "e => e.map(x => Math.round(x.getBoundingClientRect().height))")
            assert min(hh) >= 52, f"rows are roomy: {hh}"
            r0.hover(); assert r0.locator(".fx-more").evaluate("e => getComputedStyle(e).opacity") == "1", "⋯ shows on hover"
            shot(pg, "desk-list")
            pg.click("[data-dv=grid]")
            # search narrows, flat (no groups, nothing folded)
            pg.fill("#fb-q", "launch"); pg.wait_for_function("document.querySelectorAll('#fg-items .fx-card').length === 1")
            assert "Launch plan" in pg.inner_text("#fg-items")
            pg.fill("#fb-q", "level"); pg.wait_for_function("document.querySelectorAll('#fg-items .fx-card').length === 20")
            assert pg.locator("#fg-items .fx-gh").count() == 0 and pg.locator("[data-show]").count() == 0, "search is flat"
            pg.fill("#fb-q", ""); pg.wait_for_selector("[data-group=jump]")
            # an empty kind: one clear next step
            pg.click("#fg-tab-slides"); pg.wait_for_selector("#fg-empty [data-empty-new=slides]")
            assert "No slides yet" in pg.inner_text("#fg-empty") and pg.inner_text("#fg-empty [data-empty-new]").strip() == "New slides"
            pg.click("#fg-tab-all")

            # ---- 6. the New menu ----
            pg.click("#fg-new-menu"); pg.wait_for_selector("#fg-newmenu", state="visible")
            assert pg.get_attribute("#fg-new-menu", "aria-expanded") == "true"
            names = pg.eval_on_selector_all("#fg-newmenu .fx-si b", "e => e.map(x => x.textContent)")
            assert names == MAIN_NEW, names
            assert pg.eval_on_selector_all("#fg-newmenu .fx-si .fx-key", "e => e.map(x => x.textContent)") == ["D", "S", "P", "W", "G", "N", "U", "L"]
            assert pg.locator("#fg-newmenu .fx-sm[data-new=site]").count() == 1, "Website under More"
            assert all(pg.eval_on_selector_all("#fg-newmenu .fx-si small", "e => e.map(x => x.textContent.length > 4)")), "each kind says what it is"
            box = pg.locator("#fg-newmenu").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 1366 and box["y"] + box["height"] <= 900, box
            assert pg.evaluate("document.activeElement.dataset.new") == "doc"
            pg.keyboard.press("ArrowDown"); assert pg.evaluate("document.activeElement.dataset.new") == "sheet"
            pg.keyboard.press("Escape"); pg.wait_for_selector("#fg-newmenu", state="detached")
            # N opens it, D makes a doc that opens with its name selected
            pg.click("#fg-title"); pg.keyboard.press("n"); pg.wait_for_selector("#fg-newmenu", state="visible")
            pg.keyboard.press("d"); pg.wait_for_selector("#doc-title", timeout=10000)
            pg.wait_for_function("document.activeElement && document.activeElement.id === 'doc-title'", timeout=5000)
            pg.keyboard.type("Boss fight ideas"); pg.keyboard.press("Tab")
            t0 = time.time()
            while not any(d["title"] == "Boss fight ideas" for d in ok(api("/docs", token=tok))["docs"]):
                assert time.time() - t0 < 15, "the new doc is named"
                time.sleep(0.3)
            files(pg)
            # an empty-state button makes it too: Sheets › New sheet opens the sheet
            pg.click("#fg-tab-sheets"); pg.click("#fg-empty [data-empty-new=sheet]"); pg.wait_for_selector("#sx-title", timeout=10000)
            files(pg); pg.click("#fg-tab-sheets"); pg.wait_for_selector("#fg-items .fx-card .fg-th-sheet")   # a sheet's preview is its grid
            pg.click("#fg-tab-all")

            # ---- 7. drop zone: dragging files over Files shows the overlay ----
            pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
                const el = document.querySelector('#fg-items'); el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt })); el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); }""")
            pg.wait_for_selector("#dz-ov.on", timeout=3000)
            assert "upload" in pg.inner_text("#dz-hint").lower(), pg.inner_text("#dz-hint")
            pg.evaluate("dispatchEvent(new DragEvent('dragend'))"); pg.wait_for_selector("#dz-ov.on", state="detached", timeout=3000)
            assert sideways(pg) <= 1366
            pg.evaluate("localStorage.removeItem('tribecode.pfiles.view')")

            # ---- 8. phone 390 ----
            ph = login(b, {"width": 390, "height": 844}, tok, mobile=True)
            files(ph); ph.wait_for_timeout(500)
            assert sideways(ph) <= 390, sideways(ph)
            ys = ph.evaluate("['.fx-head', '#fg-find', '#fb-hero', '.fx-row', '#fg-items'].map(s => document.querySelector(s).getBoundingClientRect().top)")
            assert ys == sorted(ys), ys
            assert ph.locator(".fx input[type=search]").count() == 1 and ph.locator("#fb-q").is_visible()
            assert ph.locator("#fg-items .fx-items.list").count() >= 1, "phones: rows"
            assert ph.locator("#fg-items .fx-items.list .fx-card .fx-th").first.is_visible(), "phone rows keep a small preview"
            assert ph.locator("[data-group=jump] .fx-card:visible").count() == 4, "phones: the top four to jump back in"
            nb = ph.locator("#fg-new-menu").bounding_box(); assert nb["x"] + nb["width"] <= 390 and nb["y"] < 260, f"New sits in the header: {nb}"
            assert ph.locator("#doc-list-wrap").is_hidden(), "the old list gives way to Files"
            # no giant coloured tile: the code card is compact
            tile = ph.evaluate("(() => { const t = document.querySelector('#m2-repo-hero .rhx-art'); return t ? t.getBoundingClientRect().height : 0; })()")
            assert tile <= 120, f"compact code card: {tile}"
            shot(ph, "phone")
            # the search box stays on screen
            ph.evaluate("document.querySelector('#main').scrollTop = 900")
            ph.wait_for_timeout(200)
            top = ph.eval_on_selector("#fb-q", "e => e.getBoundingClientRect().top")
            assert 0 <= top < 140, f"sticky search: {top}"
            shot(ph, "phone-scrolled")
            ph.evaluate("document.querySelector('#main').scrollTop = 0")
            ph.click("#fg-new-menu"); ph.wait_for_selector("#fg-newmenu", state="visible")
            box = ph.locator("#fg-newmenu").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 390, box
            assert ph.eval_on_selector_all("#fg-newmenu .fx-si b", "e => e.map(x => x.textContent)") == MAIN_NEW
            assert sideways(ph) <= 390
            shot(ph, "phone-new")
            ph.keyboard.press("Escape")
            ph.click("details.fx-more summary"); ph.wait_for_selector(".fx-more-m [data-dk=pics]", state="visible")
            mb = ph.locator(".fx-more-m").bounding_box(); assert mb["x"] >= 0 and mb["x"] + mb["width"] <= 390, mb
            assert sideways(ph) <= 390
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_files_haul: OK (one New menu with keys, one search box + paste a link, compact What we know, one row of chips, list rows grouped Pinned/Recent, uniform grid, empty states, new doc opens named, drop overlay, phone 390 same order + sticky search + no sideways scroll)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
