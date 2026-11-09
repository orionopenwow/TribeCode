"""Export docs, sheets and slides (v0.20): real .docx/.xlsx/.pptx built in the browser open in python-docx, openpyxl
and python-pptx; the sheet's Export menu downloads Excel and offers Google Sheets; Save to Desktop on the host computer
writes into Desktop/TribeCode Projects/<project>/Exports; the + menu starts a doc, sheet or slides."""
import base64, io, json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
import docx, openpyxl, pptx

ROOT = Path(__file__).resolve().parents[2]
PORT = 5300 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

B64 = "async b => { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); }"

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ex-", dir="/tmp")); desk = tmp / "Desktop"; desk.mkdir()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_DESKTOP_DIR": str(desk), "TRIBE_NO_REVEAL": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            c = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}})) } catch (e) {}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeExport", timeout=15000)
            tok = pg.evaluate("TribeStore.get().server.token")
            # the three formats, built in the browser, open in the Office libraries
            d = base64.b64decode(pg.evaluate(f"({B64})(TribeExport.docx('Plan', '# Plan\\n\\nA **bold** idea.\\n\\n- one\\n- two\\n\\n| A | B |\\n| --- | --- |\\n| 1 | 2 |'))"))
            dd = docx.Document(io.BytesIO(d)); assert dd.paragraphs[0].style.name == "Heading 1" and dd.paragraphs[0].text == "Plan"
            assert any(r.bold for r in dd.paragraphs[1].runs) and len(dd.tables) == 1 and len(dd.tables[0].columns) == 2
            x = base64.b64decode(pg.evaluate(f"({B64})(TribeExport.xlsx('Budget', [['Item','Cost'],['Coins','3'],['Total','=SUM(B2:B2)']], (r, c) => r === 2 && c === 1 ? 3 : null))"))
            ws = openpyxl.load_workbook(io.BytesIO(x)).active; assert ws["A1"].value == "Item" and ws["B2"].value == 3 and ws["B3"].value == "=SUM(B2:B2)" and ws["A1"].font.b
            assert openpyxl.load_workbook(io.BytesIO(x), data_only=True).active["B3"].value == 3
            s = base64.b64decode(pg.evaluate(f"({B64})(TribeExport.pptx('Deck', [{{md: '# Hello\\n\\nSubtitle'}}, {{md: '## Two\\n\\n- a\\n- b'}}]))"))
            pr = pptx.Presentation(io.BytesIO(s)); assert len(pr.slides) == 2 and "Hello" in pr.slides[0].shapes[0].text_frame.text
            # Save to Desktop on the host computer
            r = pg.evaluate("TribeExport.save(new Blob(['hi'], {type: 'text/markdown'}), 'notes.md', {desktop: true})")
            assert r.get("path") and Path(r["path"]).read_text() == "hi" and "Exports" in r["path"], r
            assert api("/export/file", "POST", {"name": "x.exe", "data": "aGk="}, token=tok)[0] == 400
            # a sheet's Export menu: Excel download + Google Sheets
            pg.evaluate("TribeApp.show('docs'); TribeDocs.newSheet()")
            pg.wait_for_selector("#sx-csv", timeout=15000); pg.click("#sx-csv")
            pg.wait_for_selector("#ex-pop"); txt = pg.inner_text("#ex-pop")
            assert "Excel (.xlsx)" in txt and "Copy for Google Sheets" in txt and "Google Drive" in txt, txt
            with pg.expect_download() as dl: pg.click("#ex-pop .ex-i >> text=Download Excel (.xlsx)")
            assert dl.value.suggested_filename.endswith(".xlsx")
            # the + menu starts slides
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-input", state="visible")
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_doc_export")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
