"""Files works with no tribe (feat/setup-local). In the global Files dashboard, + New makes a note, a doc, a sheet,
a whiteboard and a design, and Upload keeps a picture and a code file, all on this device (IndexedDB) and each opening in
the project's own editor (the note editor with rich text, sheet.js, whiteboard.js, the design canvas, the file viewer,
a code editor). The new filter chips sort them. A reload keeps everything. Then each one moves into a project with
Move to… and arrives there (the project is the instant local draft from setup).
Usage: python app/test/e2e_files_local.py [--shots]   (--shots writes docs/screenshots/files-local.png)
"""
import base64, functools, http.server, os, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5760 + OFF; BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwnwEIGBgY/jMwAAA3BgP9tq9tMgAAAABJRU5ErkJggg==")

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()

def items(pg): return pg.evaluate("TribeLocalFiles.list().map(x => ({ id: x.id, kind: x.kind, title: x.title, fkind: x.fkind || '' }))")

def chips(pg): return pg.eval_on_selector_all(".fx-tabs [data-dk] .fx-tl", "els => els.map(e => e.textContent.trim())")

def visible_titles(pg): return pg.eval_on_selector_all("#hub-docs .dc-card .fx-name", "els => els.map(e => e.textContent.trim())")

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fl-"))
    (tmp / "dot.png").write_bytes(PNG)
    (tmp / "main.js").write_text("export const hello = () => 'hi';\n")
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1280, "height": 820})
        ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text}"))
        pg.goto(BASE + "/?skipIntro=1#/hub/docs")
        pg.wait_for_function("window.TribeLocalFiles && window.TribeHub && TribeHub.mode() === 'docs' && document.querySelector('#dc-new')", timeout=15000)
        assert not pg.evaluate("TribeClient.connected()"), "no tribe in this test"
        assert chips(pg) == ["All", "Notes", "Docs", "Sheets", "Slides", "Designs", "Websites", "Pictures", "Audio/Video", "Code", "Other"], chips(pg)

        def new(kind):
            pg.click("#dc-new"); pg.wait_for_selector("#dc-newmenu", state="visible")
            rows = pg.eval_on_selector_all("#dc-newmenu [data-new] b", "els => els.map(e => e.textContent)")
            assert rows == ["Note", "Doc", "Sheet", "Slides", "Whiteboard", "Design", "Website", "Code file", "From a template", "Upload", "Ask Flint"], rows
            pg.click(f"#dc-newmenu [data-new='{kind}']")

        # 1. a note (the scratchpad, local until a tribe)
        new("note"); pg.wait_for_selector("#note-ed #note-title")
        pg.fill("#note-title", "Shopping list"); pg.click("#note-text"); pg.keyboard.type("lanterns and string")
        pg.click("#note-done"); pg.wait_for_selector("#note-ed", state="detached")
        # 2. a doc: the same rich-text editor, kept on this device
        new("doc"); pg.wait_for_selector("#note-ed #note-title")
        assert "On this device" in pg.text_content("#note-ed")
        pg.fill("#note-title", "Level ideas"); pg.click("#note-text"); pg.keyboard.type("A cave with glowing moss")
        time.sleep(0.5); pg.click("#note-done"); pg.wait_for_selector("#note-ed", state="detached")
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.kind === 'doc' && x.title === 'Level ideas' && /glowing moss/.test(x.body))", timeout=5000)
        # 3. a sheet with a formula
        new("sheet"); pg.wait_for_selector("#lf-pane .sx-grid td[data-r='0'][data-c='0']")
        pg.fill("#lf-pane #sx-title", "Budget")
        pg.click("#lf-pane td[data-r='1'][data-c='0']"); pg.keyboard.type("4"); pg.keyboard.press("Enter")
        pg.click("#lf-pane td[data-r='2'][data-c='0']"); pg.keyboard.type("=A2*3"); pg.keyboard.press("Enter")
        pg.wait_for_function("document.querySelector(\"#lf-pane td[data-r='2'][data-c='0']\").textContent === '12'", timeout=5000)
        time.sleep(1.0); pg.click("#lf-pane #sx-close"); pg.wait_for_selector("#lf-pane", state="detached")
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.kind === 'sheet' && x.title === 'Budget' && x.body.includes('=A2*3'))", timeout=5000)
        # 4. a whiteboard: the real whiteboard, on the local backend
        new("whiteboard"); pg.wait_for_function("TribeWhiteboard.state().open && TribeWhiteboard.local()", timeout=8000)
        pg.wait_for_selector("#lf-float", state="visible")
        cv = pg.locator("#wbd-canvas").bounding_box()
        pg.keyboard.press("r"); pg.mouse.move(cv["x"] + 200, cv["y"] + 200); pg.mouse.down(); pg.mouse.move(cv["x"] + 320, cv["y"] + 290, steps=6); pg.mouse.up()
        pg.wait_for_function("TribeWhiteboard.state().count >= 1", timeout=5000)
        time.sleep(0.4)
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.kind === 'whiteboard' && Object.values(x.elements).some(e => !e.del && e.t === 'rect'))", timeout=5000)
        pg.click("#lf-fback"); pg.wait_for_function("TribeHub.mode() === 'docs' && document.body.dataset.view === 'hub'", timeout=5000)
        # 5. a design: the design canvas, on the local backend
        new("design"); pg.wait_for_function("TribeCanvas.state().open && TribeCanvas.local()", timeout=8000)
        pg.evaluate("TribeCanvas.insertSample()")
        pg.wait_for_function("TribeCanvas.state().nodes.length >= 1", timeout=5000)
        time.sleep(0.5)
        pg.wait_for_function("TribeLocalFiles.list().some(x => x.kind === 'design' && Object.values(x.nodes).filter(n => !n.del).length >= 1)", timeout=5000)
        pg.click("#lf-fback"); pg.wait_for_function("TribeHub.mode() === 'docs' && document.body.dataset.view === 'hub'", timeout=5000)
        # 6. uploads: a picture and a code file, with no tribe
        with pg.expect_file_chooser() as fc: pg.click("#dc-new"); pg.click("#dc-newmenu [data-new='upload']")
        fc.value.set_files([str(tmp / "dot.png"), str(tmp / "main.js")])
        pg.wait_for_function("TribeLocalFiles.list().filter(x => x.kind === 'file').length === 2", timeout=5000)
        # the picture opens in the viewer; the code file in the code editor and can be edited
        pg.click("#hub-docs [data-lk='file'][data-cat='pics']"); pg.wait_for_selector("#fv img", timeout=5000); pg.click("#fv-close")
        pg.click("#hub-docs [data-lk='file'][data-cat='code']"); pg.wait_for_selector("#lf-pane #lf-src")
        assert "hello" in pg.input_value("#lf-src")
        pg.click("#lf-src"); pg.keyboard.press("Control+End"); pg.keyboard.type("// edited\n"); time.sleep(0.8)
        pg.click("#lf-done"); pg.wait_for_selector("#lf-pane", state="detached")

        # filters
        pg.wait_for_function("document.querySelectorAll('#hub-docs .dc-card').length >= 7", timeout=5000)
        for chip, want in [("sheets", ["Budget"]), ("designs", ["Untitled board", "Untitled design"]), ("pics", ["dot.png"]), ("code", ["main.js"]), ("docs", ["Level ideas"]), ("notes", ["Shopping list"])]:
            pg.click(f"[data-dk={chip}]"); time.sleep(0.15)
            t = sorted(visible_titles(pg)); assert t == want, (chip, t)
        pg.click("[data-dk=all]")
        if SHOTS: time.sleep(0.4); pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "files-local.png"))

        # 7. a reload keeps everything
        pg.reload(); pg.wait_for_function("window.TribeLocalFiles && TribeHub.mode() === 'docs'", timeout=15000)
        pg.evaluate("TribeLocalFiles.ready")
        kinds = sorted(x["kind"] + ":" + x["fkind"] for x in items(pg))
        assert kinds == ["design:", "doc:", "file:code", "file:image", "sheet:", "whiteboard:"], kinds
        pg.wait_for_function("document.querySelectorAll('#hub-docs .dc-card').length >= 7", timeout=5000)
        b64src = pg.evaluate("(async () => (await (await TribeLocalFiles.blob(TribeLocalFiles.list().find(x => x.fkind === 'code').id)).text()))()")
        assert "// edited" in b64src, b64src

        # 8. Move to… a project: the menu offers to start one when there is none
        pg.click("#hub-docs [data-lk='doc'] .fx-more"); pg.click("#fx-more-menu [data-act=move]"); pg.wait_for_selector("#lf-movemenu [data-to='__setup']")
        pg.click("#lf-movemenu [data-to='__setup']"); pg.wait_for_selector("#su-start")
        pg.fill("#su-name", "Lantern Town"); pg.click("#su-create")
        pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=8000)
        pg.wait_for_selector("#su-where", timeout=8000); pg.click("#su-later")
        pid = pg.evaluate("TribeOffline.state().projects[0].id")
        for it in items(pg):
            pg.evaluate(f"TribeLocalFiles.moveTo('{it['id']}', '{pid}')")
        assert items(pg) == [], items(pg)
        st = pg.evaluate("TribeOffline.state()")
        dk = sorted((d["title"], d.get("kind", "")) for d in st["docs"][pid])
        assert ("Budget", "sheet") in dk and ("Level ideas", "") in dk, dk
        assert any(f["name"] == "dot.png" and f["scope"] == "project" for f in st["uploads"]) and any(f["name"] == "main.js" for f in st["uploads"]), st["uploads"]
        boards = [x for k, x in st["whiteboard"][pid].items() if k != "main"]
        assert boards and any(e.get("t") == "rect" for e in boards[0]["elements"].values()), boards
        designs = [x for k, x in st["canvas"][pid].items() if k != "main"]
        assert designs and len([n for n in designs[0]["nodes"].values() if not n.get("del")]) >= 1, designs
        # the moved doc shows in Files as a project doc now
        pg.evaluate("TribeHub.open('docs')"); pg.wait_for_selector("#dc-where"); pg.select_option("#dc-where", "all")
        pg.wait_for_function("[...document.querySelectorAll('#hub-docs .dc-card .fx-loc')].some(s => s.textContent.includes('Lantern Town'))", timeout=8000)
        ctx.close(); b.close()
    srv.shutdown()
    bad = [e for e in errors if "ResizeObserver" not in e]
    assert not bad, bad
    print("ok e2e_files_local (note, doc, sheet, whiteboard, design, picture, code with no tribe; filters; reload keeps them; Move to… a project)")

if __name__ == "__main__":
    main()
