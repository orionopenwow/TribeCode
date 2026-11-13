"""End-to-end: the one drop system (app/ui/dropzone.js) and Flint reading what is dropped (app/ui/folderread.js).

Drops are simulated with DataTransfer (files) and a synthetic folder tree (webkitGetAsEntry-style entries built from
app/test/fixtures/dropzone_fixtures.json), the pickers with setInputFiles. Covered: the overlay and its choices (folder
homes hidden until the API exists), dropping anywhere (the sheet with Flint's read), the folder walk with its skips
(node_modules, dist, .gitignore) and caps, secrets flagged and kept out until the box is ticked, the upload with folder
labels, duplicates (keep both, replace, skip), a failed file with Retry and Resume, Undo, the upload history in Recent
activity, every drop target (chat, the inspiration board, the website designer, the canvas, Files and its current
folder, a doc, Flint), paste (a picture, text), Flint's summary for 6+ kinds and each kind's suggestions, follow-up
questions answered locally (and the AI hand-off), "Flint is reading" kept across a reload and Forget, the keyboard
picker, drag out (DownloadURL), and phones at 390px (file and folder pickers). No console errors.
Usage: python app/test/e2e_dropzone.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib, struct
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6900 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
FX = json.loads((ROOT / "app" / "test" / "fixtures" / "dropzone_fixtures.json").read_text())
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and "EventSource" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def png(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    raw = b"".join(b"\x00" + bytes([r, g, b]) * 4 for _ in range(4))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


def write_fixture(name, where):
    for p, v in FX[name].items():
        f = where / name / p; f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(png(v[5:11]) if v.startswith("@png:") else v.encode())
    return where / name


# page helpers: files from the fixtures, a synthetic folder tree (webkitGetAsEntry-style), drops and pastes
HELPERS = """(FX) => {
  window.__FX = FX;
  window.__png = (hex, w = 40, h = 30) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#' + hex; g.fillRect(0, 0, w, h); c.toBlob(r, 'image/png'); });
  const typeOf = n => /\\.png$/i.test(n) ? 'image/png' : /\\.jpe?g$/i.test(n) ? 'image/jpeg' : /\\.html?$/i.test(n) ? 'text/html' : /\\.json$/i.test(n) ? 'application/json' : /\\.csv$/i.test(n) ? 'text/csv' : /\\.svg$/i.test(n) ? 'image/svg+xml' : 'text/plain';
  window.__file = async (path, v) => { const name = path.split('/').pop(); if (v.startsWith('@png:')) return new File([await __png(v.slice(5, 11))], name, { type: typeOf(name) }); return new File([v], name, { type: typeOf(name) }); };
  window.__tree = async (name, files) => {
    files = files || __FX[name]; const root = { isDirectory: true, isFile: false, name, kids: new Map() };
    for (const [p, v] of Object.entries(files)) { const parts = p.split('/'); let d = root; for (const seg of parts.slice(0, -1)) { if (!d.kids.has(seg)) d.kids.set(seg, { isDirectory: true, isFile: false, name: seg, kids: new Map() }); d = d.kids.get(seg); }
      const f = await __file(p, v); d.kids.set(parts[parts.length - 1], { isDirectory: false, isFile: true, name: parts[parts.length - 1], file: ok => ok(f) }); }
    const wrap = d => { if (d.isDirectory) { d.createReader = () => { let done = false; return { readEntries: ok => { if (done) return ok([]); done = true; ok([...d.kids.values()].map(wrap)); } }; }; d.getFile = (n, o, ok, err) => { const k = d.kids.get(n); k && k.isFile ? ok(k) : err(new Error('not found')); }; } return d; };
    return wrap(root);
  };
  const fire = (el, dt, x, y) => { for (const t of ['dragenter', 'dragover', 'drop']) { const ev = new DragEvent(t, { bubbles: true, cancelable: true, clientX: x || 0, clientY: y || 0 }); Object.defineProperty(ev, 'dataTransfer', { value: dt }); el.dispatchEvent(ev); } };
  const at = sel => typeof sel === 'string' ? document.querySelector(sel) : sel;
  window.__dropTree = async (sel, name, x, y) => { const e = await __tree(name); fire(at(sel), { types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => e }], files: [], getData: () => '' }, x, y); };
  window.__dropFiles = async (sel, list, x, y) => { const dt = new DataTransfer(); for (const [n, v] of list) dt.items.add(await __file(n, v)); fire(at(sel), dt, x, y); };
  window.__flintLast = () => { const t = TribeFlint.thread().filter(m => m.who === 'flint'); return t[t.length - 1] || null; };
}"""


def setup(page):
    page.evaluate(HELPERS, FX)


def sheet_text(page):
    return page.evaluate("(document.querySelector('#dz-sheet') || {}).innerText || ''")


def upload_done(page, timeout=20000):
    page.wait_for_selector("#dz-done", timeout=timeout)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-dz-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        p = ok(api("/projects", "POST", {"name": "Pixel Garden"}, token=host)); pid = (p.get("project") or p)["id"]
        ups = lambda: ok(api("/uploads", token=host, project=pid))["project"]

        # ---- the server: folder labels are cleaned, Undo by batch, the host-only path reader
        st, _ = api("/dropzone/scan", "POST", {"paths": [str(ROOT / "app" / "test" / "fixtures")]}, token=host)
        assert st == 200, st   # the test runs on this computer, as the host
        scan = ok(api("/dropzone/scan", "POST", {"paths": [str(write_fixture("recipe-site", tmp / "fx"))]}, token=host))
        assert any(f["path"] == "recipe-site/src/App.jsx" for f in scan["files"]), scan
        assert not any("/.git/" in f["path"] for f in scan["files"])
        req = urllib.request.Request(f"{BASE}/api/dropzone/file?root={urllib.parse.quote(scan['roots'][0]['path'])}&path=recipe-site/.env", headers={"Authorization": "Bearer " + host})
        try: urllib.request.urlopen(req); assert False, ".env must not be read"
        except urllib.error.HTTPError as e: assert e.code == 403, e.code
        req = urllib.request.Request(f"{BASE}/api/dropzone/file?root={urllib.parse.quote(scan['roots'][0]['path'])}&path=../../etc/passwd", headers={"Authorization": "Bearer " + host})
        try: urllib.request.urlopen(req); assert False, ".. must be refused"
        except urllib.error.HTTPError as e: assert e.code == 400, e.code
        r = urllib.request.Request(f"{BASE}/api/uploads?name=a.txt&scope=project&dir=../x/.git/y/ok&batch=srvtest01", method="POST", data=b"hello", headers={"Authorization": "Bearer " + host, "X-Project": pid})
        f = json.loads(urllib.request.urlopen(r).read())["file"]; assert f["dir"] == "x/y/ok" and f["batch"] == "srvtest01", f
        assert ok(api("/uploads?batch=srvtest01&scope=project", "DELETE", token=host, project=pid))["removed"] == 1 and not ups()

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1, permissions=["clipboard-read", "clipboard-write"])
            ctx.add_init_script(f"try {{ if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{host}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} }} catch (e) {{}}")
            pg = ctx.new_page(); watch(pg, "host")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeDropZone && window.TribeFolderRead", timeout=20000)
            if pg.evaluate("TribeClient.project()") != pid:
                pg.evaluate(f"TribeProjects.switchTo('{pid}')"); pg.wait_for_function(f"TribeClient.project() === '{pid}'")
            pg.wait_for_timeout(600); setup(pg)

            # ---- 1. the overlay: shows on a file drag, the choices fit, folder homes only when the API exists
            pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.txt')); for (const t of ['dragenter', 'dragover']) document.body.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 700, clientY: 400 })); }""")
            pg.wait_for_selector("#dz-ov.on")
            ch = pg.eval_on_selector_all("#dz-ov [data-dz-choice]", "l => l.map(x => x.dataset.dzChoice)")
            assert ch == ["files", "read", "inspo", "newproj"], ch
            assert "Pixel Garden" in pg.inner_text("#dz-ov")
            shot(pg, "drop-overlay")
            pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.txt')); document.body.dispatchEvent(new DragEvent('dragleave', { bubbles: true, dataTransfer: dt })); }""")
            pg.wait_for_function("!document.querySelector('#dz-ov.on')")
            pg.evaluate("window.TribeFolderHome = { use: o => { window.__home = o.name; } }")
            pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.txt')); document.body.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); }""")
            assert pg.eval_on_selector_all("#dz-ov [data-dz-choice]", "l => l.map(x => x.dataset.dzChoice)") == ["files", "read", "inspo", "home", "newproj"]
            # dropping on an overlay choice does it: "Make it the project's folder" calls the folder-homes API
            pg.evaluate("__dropTree('#dz-ov [data-dz-choice=home]', 'weather-py')")
            pg.wait_for_function("window.__home === 'weather-py'")
            pg.evaluate("delete window.TribeFolderHome"); assert not pg.evaluate("TribeDropZone.state().overlay")

            # ---- 2. dropping anywhere: the sheet with Flint's read, the walk skipped node_modules + dist (.gitignore)
            pg.evaluate("__dropTree(document.body, 'recipe-site', 700, 400)")
            pg.wait_for_selector("#dz-sheet.dz-choose"); pg.wait_for_function("document.querySelector('#dz-sheet .dz-say').innerText.includes('Vite + React')")
            assert "This looks like a Vite + React app with 4 components, no tests, and a README describing a recipe site for busy cooks" in sheet_text(pg)
            s = pg.evaluate("TribeDropZone.state().set"); assert s["name"] == "recipe-site" and s["skipped"] == 2, s   # node_modules (a folder) + dist (a folder)
            assert pg.eval_on_selector_all("#dz-sheet [data-dz-choice]", "l => l.map(x => x.dataset.dzChoice)") == ["files", "read", "inspo", "newproj"]
            # keyboard: focus is in the sheet, Tab stays in it, Escape closes
            assert pg.evaluate("document.activeElement.closest('#dz-sheet') !== null")
            for _ in range(8): pg.keyboard.press("Tab")
            assert pg.evaluate("document.activeElement.closest('#dz-sheet') !== null")

            # ---- 3. upload: secrets stay out, the skipped toggle, caps, folder labels
            pg.click("#dz-sheet [data-dz-choice=files]"); pg.wait_for_selector("#dz-sheet.dz-plan")
            t = sheet_text(pg)
            assert "To Pixel Garden’s files" in t and "1 secret stays out" not in t and ".env" in t and "an .env file" in t, t
            assert "Upload 11 files" in t, t   # 12 walked, .env kept out
            pg.check("#dz-incskip"); pg.wait_for_function("document.querySelector('#dz-go').innerText.includes('Upload 14 files')")
            pg.uncheck("#dz-incskip"); pg.wait_for_function("document.querySelector('#dz-go').innerText.includes('Upload 11 files')")
            pg.evaluate("TribeDropZone.CAP.files = 5"); pg.check("#dz-incsecret"); pg.uncheck("#dz-incsecret")
            assert "left out: at most 5 files" in sheet_text(pg); pg.evaluate("TribeDropZone.CAP.files = 400"); pg.check("#dz-incsecret"); pg.uncheck("#dz-incsecret")
            assert "Upload 11 files" in sheet_text(pg)
            pg.click("#dz-go"); upload_done(pg)
            assert "11 of 11 uploaded" in pg.inner_text("#dz-count")
            files = ups(); names = sorted(f["name"] for f in files)
            assert len(files) == 11 and "env" not in names and ".env" not in names and "index.js" not in names, names
            login = next(f for f in files if f["name"] == "Login.jsx"); assert login["dir"] == "recipe-site/src/components", login
            batch = login["batch"]; assert all(f["batch"] == batch for f in files)
            # Flint kept it in context and posted his card
            pg.wait_for_function("TribeDropZone.context() && TribeDropZone.context().name === 'recipe-site'")
            pg.wait_for_function("(__flintLast() || {}).text && __flintLast().text.includes('Added 11 files')")
            # Undo removes what was added
            pg.click("#dz-undo"); pg.wait_for_function("1", timeout=1000)
            for _ in range(40):
                if not ups(): break
                time.sleep(0.25)
            assert not ups(), "Undo removed the drop"
            pg.wait_for_function("TribeDropZone.history()[0].undone === true")

            # ---- 4. secrets go up only when the box is ticked (and the upload history is in Recent activity)
            pg.evaluate("__dropTree(document.body, 'recipe-site', 700, 400)"); pg.wait_for_selector("#dz-sheet.dz-choose")
            pg.click("#dz-sheet [data-dz-choice=files]"); pg.wait_for_selector("#dz-incsecret")
            pg.check("#dz-incsecret"); pg.wait_for_function("document.querySelector('#dz-go').innerText.includes('Upload 12 files')")
            pg.click("#dz-go"); upload_done(pg)
            assert any(f["name"] in ("env", ".env") for f in ups()), "with the box ticked, the .env went up"
            feed = ok(api("/hub", token=host))["feed"]
            assert any(x["kind"] == "drop" and "12 files from recipe-site" in x["title"] for x in feed), [x["title"] for x in feed][:8]
            pg.click("#dz-undo"); time.sleep(1); assert not ups()
            print("stage 1 ok")
            if os.environ.get("DZ_STAGE") == "1": return
            pg.on("dialog", lambda d: d.dismiss())
            stage2(pg, host, pid, ups, tmp, b)
            assert not errors, "\n".join(errors)
            print("e2e_dropzone: all good")
    finally:
        srv.terminate()


def drop_to_files(pg, name, mode=None):
    pg.evaluate(f"__dropTree(document.body, '{name}', 700, 400)"); pg.wait_for_selector("#dz-sheet.dz-choose")
    pg.click("#dz-sheet [data-dz-choice=files]"); pg.wait_for_selector("#dz-go")
    if mode: pg.click(f"[data-dup={mode}]")
    pg.click("#dz-go"); upload_done(pg)


def flint_say(pg, text):
    pg.evaluate("TribeFlint.say('·')")   # a marker (the thread keeps the last 40)
    pg.evaluate("t => TribeFlint.ask(t)", text)
    try: pg.wait_for_function("t => { const l = TribeFlint.thread(), n = l.length; return n > 2 && l[n - 3].text === '·' && l[n - 2].who === 'me' && l[n - 2].text === t && l[n - 1].who === 'flint'; }", arg=text, timeout=12000)
    except Exception: raise AssertionError(f"Flint did not answer {text!r}: " + json.dumps(pg.evaluate("TribeFlint.thread().slice(-4).map(m => [m.who, m.text.slice(0, 80)])")))
    return pg.evaluate("__flintLast()")


def read(pg, name):
    pg.evaluate("TribeDropZone.forget(); TribeFlint.say('·')")
    pg.evaluate(f"__dropTree('#flint', '{name}')")   # dropping on Flint: he reads it
    pg.wait_for_function(f"TribeDropZone.context() && TribeDropZone.context().name === '{name}'")
    pg.wait_for_function(f"(__flintLast() || {{}}).html && __flintLast().html.includes('dz-card') && __flintLast().text === TribeDropZone.context().summary")
    return pg.evaluate("TribeDropZone.context()")


def run_s(pg, sid):
    pg.evaluate(f"TribeDropZone.run('s:{sid}')")


def stage2(pg, host, pid, ups, tmp, b):
    # ---- 5. duplicates: keep both (renamed), skip, replace
    drop_to_files(pg, "sales-data"); pg.click("#dz-done")
    assert len(ups()) == 3
    pg.evaluate("__dropTree(document.body, 'sales-data', 700, 400)"); pg.wait_for_selector("#dz-sheet.dz-choose"); pg.click("#dz-sheet [data-dz-choice=files]"); pg.wait_for_selector("#dz-go")
    assert "3 files already in Pixel Garden’s files" in sheet_text(pg), sheet_text(pg)
    pg.click("[data-dup=skip]"); pg.click("#dz-go"); upload_done(pg); assert "3 skipped" in pg.inner_text("#dz-count") and len(ups()) == 3; pg.click("#dz-done")
    drop_to_files(pg, "sales-data", "rename"); pg.click("#dz-done")
    names = sorted(f["name"] for f in ups()); assert "sales (2).csv" in names and len(names) == 6, names
    before = {f["id"] for f in ups() if f["name"] == "sales.csv"}
    drop_to_files(pg, "sales-data", "replace"); pg.click("#dz-done")
    after = [f for f in ups() if f["name"] == "sales.csv"]; assert len(after) == 1 and after[0]["id"] not in before and len(ups()) == 6
    for h in pg.evaluate("TribeDropZone.history()"):
        if not h.get("undone"): pg.evaluate("b => TribeDropZone.undo(b)", h["batch"])
    time.sleep(0.8); assert not ups(), [f["name"] for f in ups()]

    # ---- 6. a file fails: Retry; the drop resumes where it stopped (done files are not sent again)
    pg.route("**/api/uploads?*name=app.py*", lambda r: r.fulfill(status=500, body='{"error":"disk hiccup"}') if r.request.method == "POST" else r.continue_())
    drop_to_files(pg, "weather-py")
    assert "1 failed" in pg.inner_text("#dz-count") and "disk hiccup" in pg.inner_text("#dz-files")
    assert pg.is_visible("#dz-retryall") and pg.is_visible("[data-retry]:not([hidden])")
    pg.unroute("**/api/uploads?*name=app.py*")
    pg.click("[data-retry]:not([hidden])"); pg.wait_for_function("document.querySelector('#dz-count').innerText.startsWith('5 of 5')")
    assert len(ups()) == 5; pg.click("#dz-undo"); time.sleep(0.8); assert not ups()
    pg.route("**/api/uploads?*name=fetch.py*", lambda r: r.fulfill(status=500, body='{"error":"offline"}') if r.request.method == "POST" else r.continue_())
    drop_to_files(pg, "weather-py"); pg.click("#dz-done"); pg.unroute("**/api/uploads?*name=fetch.py*")
    assert len(ups()) == 4
    drop_to_files(pg, "weather-py", "skip")   # the same drop again: the 4 done earlier are not sent twice
    t = pg.inner_text("#dz-files"); assert t.count("Done earlier") == 4, t
    assert len(ups()) == 5 and len({f["batch"] for f in ups()}) == 1, "one batch, resumed"
    pg.click("#dz-undo"); time.sleep(0.8); assert not ups()

    # ---- 7. Flint reads 7 kinds; each kind's suggestions run
    kinds = {}
    for name, want in [("recipe-site", "web-react"), ("weather-py", "python"), ("lantern-site", "static"), ("beach-photos", "photos"), ("sales-data", "data"), ("moss-quest", "godot"), ("star-unity", "unity"), ("notes-docs", "docs")]:
        c = read(pg, name); kinds[name] = c; assert c["kind"] == want, (name, c)
        last = pg.evaluate("__flintLast()"); assert last["text"] == c["summary"] and [a["arg"] for a in last["acts"] if a["act"] == "dz"][:len(c["suggestions"])] == ["s:" + x for x in c["suggestions"]], last
    assert pg.is_visible("#dz-chip") and "notes-docs" in pg.inner_text("#dz-chip")
    tasks0 = len(ok(api("/tasks", token=host, project=pid))["tasks"])
    docs0 = {d["slug"] for d in ok(api("/docs", token=host, project=pid))["docs"]}
    def new_docs():
        return [d for d in ok(api("/docs", token=host, project=pid))["docs"] if d["slug"] not in docs0]

    read(pg, "recipe-site"); assert set(kinds["recipe-site"]["suggestions"]) >= {"preview", "project", "todos", "bug"}
    shot(pg, "drop-flint-summary")
    run_s(pg, "preview"); pg.wait_for_selector("#dz-pv")
    assert pg.get_attribute("#dz-pv", "sandbox") == "" and "root" in pg.get_attribute("#dz-pv", "srcdoc"); pg.click("#dz-sheet [data-dz=close]")
    run_s(pg, "todos"); pg.wait_for_function(f"(__flintLast() || {{}}).text && __flintLast().text.startsWith('Made 3 tasks')")
    tl = ok(api("/tasks", token=host, project=pid))["tasks"]; assert len(tl) == tasks0 + 3 and any("dark mode (App.jsx:2)" in x["title"] for x in tl), [x["title"] for x in tl]
    run_s(pg, "bug"); pg.wait_for_function("TribeAIBridge.state() && TribeAIBridge.state().open")
    assert pg.evaluate("document.querySelector('#aib-pack') ? document.querySelector('#aib-pack').textContent : ''").count("### src/") >= 2
    pg.evaluate("TribeAIBridge.close()")
    run_s(pg, "project"); pg.wait_for_function("document.querySelector('#np-status') && document.querySelector('#np-status').innerText.includes('recipe-site')")
    assert "env" not in pg.inner_text("#np-status").replace("environment", "")
    pg.keyboard.press("Escape"); pg.evaluate("document.querySelectorAll('.modal-wrap').forEach(m => m.classList.add('hidden'))")

    read(pg, "weather-py"); run_s(pg, "todos"); pg.wait_for_function("__flintLast().text.startsWith('Made 1 task')")
    read(pg, "lantern-site"); run_s(pg, "preview"); pg.wait_for_selector("#dz-pv")
    src = pg.get_attribute("#dz-pv", "srcdoc"); assert "font-family: serif" in src and 'src="data:image/png' in src and "<script" not in src and "__ran" not in src and "Lantern Cafe" in src; pg.click("#dz-sheet [data-dz=close]")
    read(pg, "beach-photos")
    run_s(pg, "moodboard"); pg.wait_for_function(f"fetch('{BASE}/api/inspo?project={pid}', {{ headers: {{ Authorization: 'Bearer {host}' }} }}).then(r => r.json()).then(d => (d.items || []).length === 5)", polling=500)
    pg.evaluate("TribeInspoBoard.close && TribeInspoBoard.close()")
    run_s(pg, "gallery"); pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.type === 'gallery' && b.props.items.length === 5)", timeout=15000)
    pg.evaluate("TribeSiteDesigner.close()")
    read(pg, "sales-data"); run_s(pg, "sheet"); pg.wait_for_function("__flintLast().text.startsWith('Opened sales.csv as a sheet')")
    sh = [d for d in new_docs() if d.get("kind") == "sheet"]; assert sh, new_docs()
    body = ok(api("/docs/" + sh[0]["slug"], token=host, project=pid))["doc"]["body"]; assert "| date | region | units | price | total |" in body and "=SUM(C2:C5)" in body, body
    read(pg, "moss-quest"); run_s(pg, "readme"); pg.wait_for_function("__flintLast().text.startsWith('Drafted a README for moss-quest')")
    assert any(d["title"] == "README · moss-quest" for d in new_docs())
    read(pg, "star-unity"); assert "readme" in pg.evaluate("TribeDropZone.context().suggestions")
    read(pg, "notes-docs"); run_s(pg, "deck"); pg.wait_for_function("__flintLast().text.startsWith('Started a deck')")
    dk = [d for d in new_docs() if d.get("kind") == "deck"]; assert dk and "Launch plan" in ok(api("/docs/" + dk[0]["slug"], token=host, project=pid))["doc"]["body"]
    pg.evaluate("TribeApp.show('home')")

    # ---- 8. follow-ups answered here; real reasoning offers an AI with the context pack
    read(pg, "recipe-site")
    a = flint_say(pg, "where is the API key used?"); assert "src/components/Login.jsx:3" in a["text"] and "sk-proj" not in a["text"], a
    a = flint_say(pg, "how many components are there?"); assert "4 components" in a["text"], a
    a = flint_say(pg, "what does the login code do?"); assert "Login.jsx" in a["text"] and [x["label"] for x in a["acts"]] == ["Ask my AI", "Ask a free AI"], a
    free = a["acts"][1]["arg"]
    a = flint_say(pg, "what is in the readme?"); assert "recipe site" in a["text"], a
    pg.evaluate("a => TribeDropZone.run(a)", free); pg.wait_for_function("TribeAIBridge.state() && TribeAIBridge.state().open")
    pack = pg.evaluate("document.querySelector('#aib-pack').textContent"); assert "Login.jsx" in pack and "sk-proj" not in pack
    pg.evaluate("TribeAIBridge.close()")
    read(pg, "beach-photos"); a = flint_say(pg, "how many images are there?"); assert "5 pictures" in a["text"], a

    # ---- 9. kept across a reload (IndexedDB), Forget clears it
    pg.reload(); pg.wait_for_function("window.TribeDropZone && TribeClient.connected()", timeout=20000); setup(pg)
    pg.wait_for_selector("#dz-chip"); assert "beach-photos" in pg.inner_text("#dz-chip")
    a = flint_say(pg, "how many photos are there?"); assert "5 pictures" in a["text"], a
    pg.click("#dz-chip [data-dz-forget]"); pg.wait_for_function("!document.querySelector('#dz-chip')")
    assert pg.evaluate("TribeDropZone.context()") is None
    pg.reload(); pg.wait_for_function("window.TribeDropZone && TribeClient.connected()", timeout=20000); setup(pg); pg.wait_for_timeout(800)
    assert not pg.query_selector("#dz-chip") and pg.evaluate("TribeDropZone.context()") is None
    print("stage 2 ok")
    if os.environ.get("DZ_STAGE") == "2": return
    stage3(pg, host, pid, ups, tmp, b)


def stage3(pg, host, pid, ups, tmp, b):
    pass


if __name__ == "__main__":
    import urllib.parse
    main()
