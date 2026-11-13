"""Files, rebuilt (feat/files-dash): the one Files dashboard (app/ui/filesview.js) on Home with no tribe.

Checks: the title is "Files" with search, Where, sort, grid/list and one + Create; the category tabs each carry a small
stroke icon (All · Notes · Docs · Sheets · Slides · Designs · Websites · Pictures · Audio/Video · Code · Other); the
Studio makes every kind on this device (note, doc, sheet, slides, whiteboard, design, website, code file, a template,
an upload, Ask Flint's basic draft); every card has a real preview (never the word "Empty"), a type, an owner, a time
and a location chip; tabs filter and empty tabs offer one clear action; the ⋯ menu opens, renames, moves, duplicates,
downloads and deletes; a reload keeps everything; the Marketplace works offline from the saved list and never says
"failed to fetch"; nothing scrolls sideways on a 390px phone.
Usage: python app/test/e2e_files_rehaul.py
"""
import base64, functools, http.server, os, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5790 + OFF; BASE = f"http://localhost:{PORT}"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBgY/jMwAAA3BgP9tq9tMgAAAABJRU5ErkJggg==")
TABS = ["All", "Notes", "Docs", "Sheets", "Slides", "Designs", "Websites", "Pictures", "Audio/Video", "Code", "Other"]
STUDIO = ["Note", "Doc", "Sheet", "Slides", "Whiteboard", "Design", "Website", "Code file", "From a template", "Upload", "Ask Flint"]
SETTINGS = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def items(pg): return pg.evaluate("TribeLocalFiles.list().map(x => ({ id: x.id, kind: x.kind, title: x.title, fkind: x.fkind || '' }))")


def titles(pg): return pg.eval_on_selector_all("#hub-docs .fx-card .fx-name", "els => els.map(e => e.textContent.trim())")


def home_files(pg):
    pg.evaluate("document.querySelectorAll('.fx-pop').forEach(x => x.remove()); TribeLocalFiles.closePane(); const f = document.getElementById('lf-float'); if (f) f.remove(); const n = document.getElementById('note-ed'); if (n) n.remove(); TribeHub.open('docs')")
    pg.wait_for_selector("#dc-new", state="visible")


def studio(pg, kind):
    home_files(pg)
    pg.click("#dc-new"); pg.wait_for_selector("#dc-newmenu", state="visible")
    pg.click(f"#dc-newmenu [data-new='{kind}']")


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fr-")); (tmp / "dot.png").write_bytes(PNG)
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1366, "height": 860}, accept_downloads=True)
        ctx.add_init_script(SETTINGS)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(BASE + "/?skipIntro=1#/hub/docs")
        pg.wait_for_function("window.TribeFilesView && window.TribeLocalFiles && TribeHub.mode() === 'docs' && document.querySelector('#dc-new')", timeout=15000)
        assert not pg.evaluate("TribeClient.connected()")

        # ---- header: Files, search, Where, sort, view, one + Create ----
        assert pg.inner_text("#dc-title").strip() == "Files"
        for sel in ("#hub-dq", "#dc-where", "#dc-sort", "[data-dv=grid]", "[data-dv=list]", "#dc-new"): assert pg.locator(sel).is_visible(), sel
        assert pg.locator(".fx-head .btn.primary, .fx-tools .btn.primary").count() == 1, "one primary Create"
        assert pg.eval_on_selector_all("#dc-where option", "o => o.map(x => x.textContent)")[:2] == ["Mine", "Everything"]
        assert pg.eval_on_selector(".hub-crumb", "e => e.textContent").replace(" ", "") == "Home›Files", pg.eval_on_selector(".hub-crumb", "e => e.textContent")
        # ---- tabs with icons ----
        assert pg.eval_on_selector_all(".fx-tabs [data-dk] .fx-tl", "els => els.map(e => e.textContent)") == TABS
        assert pg.eval_on_selector_all(".fx-tabs [data-dk]", "els => els.every(e => e.querySelector('svg.fx-i path, svg.fx-i rect, svg.fx-i circle'))"), "each tab has a stroke icon"
        # ---- an empty tab: one clear action ----
        pg.click("[data-dk=slides]"); pg.wait_for_selector("#dc-empty [data-empty-new=slides]")
        assert "Empty" not in pg.inner_text("#hub-docs")
        pg.click("[data-dk=all]")

        # ---- the Studio: every kind, made on this device ----
        pg.click("#dc-new"); pg.wait_for_selector("#dc-newmenu", state="visible")
        assert pg.eval_on_selector_all("#dc-newmenu [data-new] b", "els => els.map(e => e.textContent)") == STUDIO
        pg.keyboard.press("Escape"); pg.wait_for_selector("#dc-newmenu", state="detached")
        studio(pg, "note"); pg.wait_for_selector("#note-ed #note-title"); pg.fill("#note-title", "Shopping list"); pg.click("#note-text"); pg.keyboard.type("lanterns and string"); pg.click("#note-done")
        studio(pg, "doc"); pg.wait_for_selector("#note-ed #note-title"); pg.fill("#note-title", "Launch plan"); pg.click("#note-text"); pg.keyboard.type("Ship the lantern level on Friday"); pg.click("#note-done")
        studio(pg, "sheet"); pg.wait_for_selector("#lf-pane .sx, #lf-pane table, #lf-pane [class*=sx]", timeout=8000)
        studio(pg, "slides"); pg.wait_for_selector("#lf-pane .dk", timeout=8000)
        studio(pg, "whiteboard"); pg.wait_for_selector("#lf-float", timeout=8000)
        studio(pg, "design"); pg.wait_for_selector("#lf-float", timeout=8000)
        studio(pg, "site"); pg.wait_for_selector("#lf-pane #lf-site-pv", timeout=8000)
        assert "<h1>" in pg.input_value("#lf-src")
        studio(pg, "code"); pg.wait_for_selector("#lf-pane #lf-src", timeout=8000); pg.fill("#lf-src", "export const glow = () => 'warm';\n"); pg.wait_for_timeout(700)
        studio(pg, "template"); pg.wait_for_selector("#dc-tplmenu [data-tpl]"); pg.click("#dc-tplmenu [data-tpl] >> nth=0"); pg.wait_for_selector("#note-ed #note-title"); pg.click("#note-done")
        home_files(pg)
        with pg.expect_file_chooser() as fc:
            pg.click("#dc-new"); pg.click("#dc-newmenu [data-new='upload']")
        fc.value.set_files(str(tmp / "dot.png")); pg.wait_for_function("TribeLocalFiles.list().some(x => x.title === 'dot.png')")
        studio(pg, "flint"); pg.wait_for_selector("#fx-ask #fx-ask-in")
        pg.fill("#fx-ask-in", "slides about our lantern game"); pg.click("#fx-ask-go"); pg.wait_for_selector("#lf-pane .dk", timeout=10000)
        kinds = sorted(x["kind"] for x in items(pg))
        assert kinds == sorted(["doc", "doc", "sheet", "slides", "slides", "whiteboard", "design", "site", "file", "file"]), kinds
        assert any(x["title"].lower().startswith("lantern game") or "lantern" in x["title"].lower() for x in items(pg) if x["kind"] == "slides"), items(pg)

        # ---- cards: real previews, type, owner, time, location ----
        home_files(pg); pg.wait_for_function("document.querySelectorAll('#hub-docs .fx-card').length >= 11")
        cards = pg.eval_on_selector_all("#hub-docs .fx-card", """els => els.map(e => ({ cat: e.dataset.cat, th: e.querySelector('.fx-th').innerHTML, text: e.innerText,
            av: !!e.querySelector('.fx-av'), loc: (e.querySelector('.fx-loc') || {}).textContent || '', t: (e.querySelector('.fx-t') || {}).textContent || '' }))""")
        for c in cards:
            assert "Empty" not in c["text"], c
            assert c["av"] and "This device" in c["loc"] and "·" in c["t"], c
        by = {c["cat"]: c["th"] for c in cards}
        assert "fg-th-sheet" in by["sheets"] and ("fg-th-deck" in by["slides"] or "fx-th-slide" in by["slides"]), "sheet grid, slide thumb"
        assert "<iframe" in by["sites"] and "<svg" in by["designs"] and "fg-th-page" in by["docs"] and "fg-th-code" in by["code"], by.keys()
        pg.wait_for_function("[...document.querySelectorAll('#hub-docs img[data-lthumb]')].every(i => i.src && i.complete)")
        assert pg.evaluate("document.querySelector('#hub-docs .fx-card[data-cat=code] pre').textContent.includes('glow')"), "code thumb shows the code"
        heads = pg.eval_on_selector_all("#hub-docs .fx-gh h2", "els => els.map(e => e.textContent)")
        assert heads == ["On this device", "Only you"] or heads[0] == "On this device", heads
        # ---- tabs filter ----
        for k, want in (("slides", "slides"), ("pics", "pics"), ("designs", "designs"), ("sites", "sites")):
            pg.click(f"[data-dk={k}]"); cats = pg.eval_on_selector_all("#hub-docs .fx-card", "els => els.map(e => e.dataset.cat)")
            assert cats and set(cats) == {want}, (k, cats)
        assert pg.inner_text("[data-n=designs]") == "2"
        pg.click("[data-dk=all]")
        # ---- search, sort, list view ----
        pg.fill("#hub-dq", "launch"); pg.wait_for_function("document.querySelectorAll('#hub-docs .fx-card').length === 1")
        assert titles(pg) == ["Launch plan"]
        pg.fill("#hub-dq", ""); pg.wait_for_function("document.querySelectorAll('#hub-docs .fx-card').length >= 11")
        pg.click("#dc-sort"); first = titles(pg); assert first == sorted(first, key=str.lower), first
        pg.click("[data-dv=list]"); assert pg.locator("#hub-docs .fx-items.list").count() >= 1
        pg.click("[data-dv=grid]"); assert pg.locator("#hub-docs .fx-items.grid").count() >= 1

        # ---- the ⋯ menu ----
        doc = "#hub-docs .fx-card[data-lk=doc][title='Launch plan']"
        pg.click(f"{doc} .fx-more"); pg.wait_for_selector("#fx-more-menu")
        assert pg.eval_on_selector_all("#fx-more-menu [data-act] span", "e => e.map(x => x.textContent)") == ["Open", "Rename", "Move to…", "Duplicate", "Download (.md)", "Delete"]
        pg.click("#fx-more-menu [data-act=rename]"); pg.wait_for_selector("#fx-rename"); pg.fill("#fx-rename", "Launch plan v2"); pg.keyboard.press("Enter")
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.title === 'Launch plan v2')")
        doc = "#hub-docs .fx-card[data-lk=doc][title='Launch plan v2']"; pg.wait_for_selector(doc)
        pg.click(f"{doc} .fx-more"); pg.click("#fx-more-menu [data-act=duplicate]")
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.title === 'Launch plan v2 (copy)')")
        with pg.expect_download() as dl:
            pg.click(f"{doc} .fx-more"); pg.click("#fx-more-menu [data-act=download]")
        assert dl.value.suggested_filename == "Launch plan v2.md"
        assert "lantern level" in Path(dl.value.path()).read_text()
        pg.click(f"{doc} .fx-more"); pg.click("#fx-more-menu [data-act=move]"); pg.wait_for_selector("#lf-movemenu [data-to='__setup']")   # no tribe: Start a project
        pg.evaluate("document.getElementById('lf-movemenu').remove()")
        pg.click(f"{doc} .fx-more"); pg.click("#fx-more-menu [data-act=open]"); pg.wait_for_selector("#note-ed #note-title"); assert pg.input_value("#note-title") == "Launch plan v2"; pg.click("#note-done")
        home_files(pg)
        dup = "#hub-docs .fx-card[title='Launch plan v2 (copy)']"
        pg.click(f"{dup} .fx-more"); pg.click("#fx-more-menu [data-act=delete]"); pg.click("#fx-confirm-yes")
        pg.wait_for_function("!TribeLocalFiles.list().some(x => x.title === 'Launch plan v2 (copy)')")
        # a note's menu: no rename/move, but download and delete
        pg.click("#hub-docs .fx-card[data-mynote] .fx-more"); acts = pg.eval_on_selector_all("#fx-more-menu [data-act]", "e => e.map(x => x.dataset.act)")
        assert acts == ["open", "duplicate", "download", "delete"], acts
        pg.keyboard.press("Escape")

        # ---- a reload keeps everything; Where = Everything shows the same on this device ----
        n = len(items(pg)); pg.reload(); pg.wait_for_function("window.TribeLocalFiles && document.querySelector('#dc-new')")
        pg.wait_for_function(f"document.querySelectorAll('#hub-docs .fx-card[data-local]').length === {n}")
        pg.select_option("#dc-where", "all"); assert pg.locator("#hub-docs .fx-card[data-local]").count() == n
        pg.select_option("#dc-where", "mine")

        # ---- the Marketplace, offline: the saved list, never "failed to fetch" ----
        pg.evaluate("TribeMarket.open()"); pg.wait_for_selector("#mk-offline:not([hidden])", timeout=10000)
        pg.wait_for_function("document.querySelectorAll('.mk-card').length >= 12")
        assert "saved list" in pg.inner_text("#mk-offline").lower()
        assert "failed to fetch" not in pg.inner_text("body").lower()
        pg.fill("#mk-q", "figma"); pg.wait_for_function("[...document.querySelectorAll('.mk-card .mk-t')].some(e => /figma/i.test(e.textContent))")
        pg.click(".mk-card >> nth=0"); pg.wait_for_selector("#mk-detail h2")
        pg.keyboard.press("Escape"); pg.evaluate("TribeMarket.close(); TribeWorkshop && TribeWorkshop.close && TribeWorkshop.close()")

        # ---- phones: 390px, nothing scrolls sideways; the Studio fits ----
        ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ph.add_init_script(SETTINGS)
        pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(f"phone pageerror: {e}"))
        pp.goto(BASE + "/?skipIntro=1#/hub/docs"); pp.wait_for_function("window.TribeLocalFiles && document.querySelector('#dc-new')", timeout=15000)
        pp.evaluate("TribeLocalFiles.create('sheet').then(() => TribeLocalFiles.create('site'))"); pp.wait_for_function("document.querySelectorAll('#hub-docs .fx-card').length >= 2")
        assert pp.evaluate("document.documentElement.scrollWidth") <= 390, pp.evaluate("document.documentElement.scrollWidth")
        pp.click("#dc-new"); pp.wait_for_selector("#dc-newmenu", state="visible")
        box = pp.locator("#dc-newmenu").bounding_box(); assert box["x"] >= 0 and box["x"] + box["width"] <= 390, box
        assert pp.evaluate("document.documentElement.scrollWidth") <= 390
        ph.close()
        b.close()
    srv.shutdown()
    assert not errors, errors
    print("e2e_files_rehaul: OK")


if __name__ == "__main__":
    main()
