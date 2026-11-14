"""End-to-end: every way an app gets built inside TribeCode updates the live preview by itself (v0.27).

1. The preview's "What should it be?" → Build it, with no AI connected: a first version runs right away.
2. An AI helper through MCP (code_write): the desktop pane and a phone-size page reload by themselves.
3. Files › Code save (PUT /api/code/file): the preview reloads.
4. Flint: an in-place text edit, "make the title bigger" with nothing picked (no AI needed), the Flint panel beside
   the preview ("Describe a change…" → a feed line + a reload), and "add a jump sound" (asset library) → reload.
5. Starters: a builder makes the starter once the repo exists; a project brought from a folder (remix) previews.
6. Code repository: a pull through Sync now changes files → reload; dev-server mode shows the dev server and
   reloads when the repo changes.
7. Two people (host + an invited friend) both see the update, and a plain shared-link tab updates too.
8. No index.html yet (the tab waits and shows it when it appears), index.html in a subfolder (public/), deleted.
Plus the Flint panel: visible with the preview open, resizable width remembered, a bottom sheet on phones.
Usage: python app/test/e2e_build_loop.py [--shots]
"""
import http.server, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4921 + OFF
DEV = 4961 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
errors = []
LIMIT = float(os.environ.get("BUILD_LOOP_LIMIT", "6"))   # seconds from a save to the new page on screen (typically ~0.5 s: 250 ms debounce + reload; generous for busy CI)


def api(path, method="GET", body=None, token=None, project=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, project, tool, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "X-Project": project})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    assert not d.get("isError"), d
    return d["content"][0]["text"]


def page_html(mark, title="Kombucha Empire"):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title></head>
<body><h1 id="title">{title}</h1><p id="mark">{mark}</p><p id="tag">Batches brewing</p></body></html>"""


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def make_repo(path, files):
    os.makedirs(path, exist_ok=True)
    for rel, txt in files.items():
        Path(path, rel).parent.mkdir(parents=True, exist_ok=True); Path(path, rel).write_text(txt)
    git(path, "init", "-q", "-b", "main"); git(path, "add", "-A"); git(path, "commit", "-q", "-m", "init")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and "EventSource" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def frame_mark(page, sel="#pvw-iframe"):
    try: return page.frame_locator(sel).locator("#mark").inner_text(timeout=300)
    except Exception: return None


def wait_mark(page, want, what, sel="#pvw-iframe", t0=None, limit=LIMIT):
    t0 = t0 or time.time()
    while time.time() - t0 < limit + 6:
        if frame_mark(page, sel) == want:
            dt = time.time() - t0
            assert dt <= limit, f"{what}: the preview took {dt:.1f}s (more than {limit}s)"
            return dt
        time.sleep(0.1)
    raise AssertionError(f"{what}: the preview never showed {want!r} (it shows {frame_mark(page, sel)!r})")


def tab_wait(page, fn, what, limit=LIMIT):
    t0 = time.time()
    while time.time() - t0 < limit + 6:
        try:
            if page.evaluate(fn): return time.time() - t0
        except Exception: pass
        time.sleep(0.1)
    raise AssertionError(f"{what}: the tab never updated ({page.evaluate('document.body ? document.body.innerText.slice(0,200) : \"\"')!r})")


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"build-loop-{name}.png"))


class Dev(http.server.BaseHTTPRequestHandler):
    word = "dev one"
    def log_message(self, *a): pass
    def do_GET(self):
        body = f"<!doctype html><html><head><title>Dev</title></head><body><p id=mark>{Dev.word}</p></body></html>".encode()
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-build-loop-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="build-loop-src-", dir="/tmp")
    kom = os.path.join(work, "kombucha"); make_repo(kom, {"README.md": "# Kombucha Empire\n"})
    remote = os.path.join(work, "kombucha-remote.git"); subprocess.run(["git", "clone", "-q", "--bare", kom, remote], check=True)
    git(kom, "remote", "add", "origin", remote); git(kom, "fetch", "-q", "origin"); git(kom, "branch", "-q", "--set-upstream-to=origin/main", "main")
    folder = os.path.join(work, "pixel-quest"); shutil.copytree(ROOT / "templates" / "starter-game", folder); make_repo(folder, {})
    later = os.path.join(work, "later-site"); make_repo(later, {"README.md": "# nothing to run yet"})
    builder_repo = os.path.join(work, "builder-site"); make_repo(builder_repo, {"README.md": "# a builder's project"})
    dev = http.server.ThreadingHTTPServer(("127.0.0.1", DEV), Dev); threading.Thread(target=dev.serve_forever, daemon=True).start()

    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Build Loop"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        kp = ok(api("/projects", "POST", {"path": kom}, token=camp), "kombucha")["project"]["id"]
        fp = ok(api("/projects", "POST", {"path": folder}, token=camp), "folder project")["project"]["id"]
        lp = ok(api("/projects", "POST", {"path": later}, token=camp), "later project")["project"]["id"]
        bp = ok(api("/projects", "POST", {"path": builder_repo}, token=camp), "builder project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=camp))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        ag = ok(api("/agents", "POST", {}, token=camp, project=kp), "agent"); atok = ag["token"]; aname = ag["agent"]["name"]

        # ---- 5 (API): a builder makes the starter in a project that has a repo; a folder project (remix) previews ----
        ok(api("/vision", "PUT", {"text": "# Club site\n\nA sign-up page for our running club.\n"}, token=camp, project=bp))
        st = ok(api(f"/projects/{bp}/setup/starter", "POST", {}, token=maya, project=bp), "builder starter")
        assert any(f.endswith("index.html") for f in st["written"]), st
        t = ok(api("/preview/token", "POST", token=maya, project=bp))
        assert t["hasIndex"], t
        t = ok(api("/preview/token", "POST", token=camp, project=fp))
        assert t["hasIndex"] and t["root"] == ".", t   # the remixed folder runs as it is

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, kp))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % kp, timeout=15000)

            # ---- 1: Build it with no AI connected → a first version runs right away ----
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw.is-empty #pvw-bprompt", timeout=10000)
            host.fill("#pvw-bprompt", "build me an app to manage my kombucha empire")
            t0 = time.time(); host.click("#pvw-bgo")
            host.wait_for_selector("#pvw:not(.is-empty) #pvw-iframe", timeout=12000)
            host.frame_locator("#pvw-iframe").locator("body").wait_for(timeout=8000)
            dt1 = time.time() - t0
            assert dt1 < 15, f"the first version took {dt1:.1f}s"
            tree = ok(api("/code/tree", token=camp, project=kp))
            assert "index.html" in json.dumps(tree), "the starter wrote index.html"
            assert "kombucha" in ok(api("/vision", token=camp, project=kp))["text"].lower(), "the description became the vision"
            msgs = ok(api("/ask/mine", token=camp, project=kp))["requests"]   # v0.37: privately to Camp's own agent, not into #agents
            assert any("kombucha" in (m.get("text") or "") for m in msgs), "the brief reached Camp's agent"
            assert not any("kombucha" in (m.get("text") or "") and "index.html at the top folder" in (m.get("text") or "") for m in ok(api("/chat/general", token=camp, project=kp))["messages"] + ok(api("/agents/channel", token=camp, project=kp))["messages"]), "the brief must not post in a channel"

            # the Flint panel is open beside the preview
            host.wait_for_selector("#pvf.is-open #flm-in-preview", timeout=5000)
            pw = host.evaluate("[document.querySelector('#pvf').getBoundingClientRect().width, document.querySelector('#pvw-stage').getBoundingClientRect().width]")
            assert 240 <= pw[0] <= 520 and pw[1] > 300, pw
            host.click("#pvw [data-dev='desktop']")

            # ---- 2: an AI helper writes with code_write → the desktop pane reloads by itself ----
            phone_ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            phone_ctx.add_init_script(settings_js("Camp", camp, kp))
            ph = phone_ctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % kp, timeout=15000)
            ph.evaluate("TribePreview.open()")
            ph.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            mcp(atok, kp, "code_write", {"path": "index.html", "text": page_html("v2 from the agent"), "message": "Kombucha batches page"}); t0 = time.time()
            d2 = wait_mark(host, "v2 from the agent", "agent code_write (desktop)", t0=t0)
            wait_mark(ph, "v2 from the agent", "agent code_write (phone)", t0=t0)
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-ev-file')].some(li => /saved index\\.html/.test(li.innerText) && /\\+\\d+/.test(li.innerText))", timeout=5000)
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-ev-reload')].length > 0", timeout=5000)
            mcp(atok, kp, "code_write", {"path": "index.html", "text": page_html("v3 again"), "message": "again"}); t0 = time.time()
            wait_mark(host, "v3 again", "second agent write (desktop)", t0=t0); wait_mark(ph, "v3 again", "second agent write (phone)", t0=t0)

            # ---- 3: Files › Code save → reload ----
            ok(api("/code/file", "PUT", {"path": "index.html", "text": page_html("v4 from Files"), "message": "edit in Files"}, token=camp, project=kp)); t0 = time.time()
            wait_mark(host, "v4 from Files", "Files › Code save", t0=t0)

            # ---- 4: Flint ----
            href = host.evaluate("document.querySelector('#pvw-iframe').src").replace(BASE, "")
            ok(api("/preview/edit", "POST", {"href": href, "tag": "p", "before": "v4 from Files", "after": "v5 edited in place"}, token=camp, project=kp)); t0 = time.time()
            wait_mark(host, "v5 edited in place", "in-place text edit", t0=t0)
            r = ok(api("/preview/flint", "POST", {"href": href, "ask": "make the title bigger"}, token=camp, project=kp), "flint bigger, no AI")
            assert r["via"] == "rules" and "bigger" in r["say"].lower(), r
            assert 'style="zoom: 1.25"' in Path(kom, "index.html").read_text(), Path(kom, "index.html").read_text()
            host.wait_for_function("(() => { try { return document.querySelector('#pvw-iframe') && true } catch (e) { return false } })()")
            def fz():
                try: return host.frame_locator("#pvw-iframe").locator("#title").get_attribute("style", timeout=1500) or ""
                except Exception: return ""   # mid-reload
            t0 = time.time()
            v = fz()
            while "1.25" not in v and time.time() - t0 < LIMIT + 2: time.sleep(0.1); v = fz()
            assert "1.25" in v, v
            # the Flint panel: a prompt makes a feed line, and the preview reloads with the change
            host.fill("#flm-in-preview", "Make the title bigger"); t0 = time.time(); host.press("#flm-in-preview", "Enter")
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-msg.fl')].some(li => /bigger/i.test(li.innerText))", timeout=6000)
            v = fz()
            while "1.56" not in v and time.time() - t0 < LIMIT + 4: time.sleep(0.1); v = fz()
            assert "1.56" in v, f"the panel's change reached the preview: {v}"
            # a build request goes to the AI helpers
            host.click("#pvf .flm-chips .fl-chip:text-is('Make it dark')")
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-ev-ask')].some(li => /Sent to your/.test(li.innerText))", timeout=6000)
            assert any("Make it dark" in (m.get("text") or "") for m in ok(api("/ask/mine", token=camp, project=kp))["requests"]), "the ask reached Camp's agent, privately"
            # its private reply shows in the feed too
            mcp(atok, kp, "reply", {"text": "Private reply: starting on the dark theme"})
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-ev-agent')].some(li => /Private reply/.test(li.innerText))", timeout=6000)
            # the agent answers in #agents → a feed line
            mcp(atok, kp, "agents_post", {"text": "Dark theme: on it, editing style.css"})
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-ev-agent')].some(li => /Dark theme/.test(li.innerText))", timeout=6000)
            # "add a jump sound": Flint's asset library → files land → reload
            host.fill("#flm-in-preview", "add a jump sound"); host.press("#flm-in-preview", "Enter")
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread .fl-msg.fl')].some(li => /jump/i.test(li.innerText))", timeout=10000)
            assert any(Path(kom).rglob("jump*.wav")), "the jump sound is in the repo"
            # picking an element in edit mode shows it as context
            host.click("#pvw .pvw-edit") if host.locator("#pvw .pvw-edit").count() else host.evaluate("document.querySelector('[data-act=\"edit\"]').click()")
            host.wait_for_timeout(600)
            host.frame_locator("#pvw-iframe").locator("#tag").dispatch_event("click")
            host.wait_for_selector("#pvf-pick:not(.hidden)", timeout=5000)
            assert "Batches brewing" in host.inner_text("#pvf-pick")
            shot(host, "flint-panel-1440")
            host.evaluate("document.querySelector('#pvw-edbar [data-act=\"edit\"]').click()")
            # the panel's width is remembered on this device
            host.evaluate("document.querySelector('.pvf-grip').focus()"); host.keyboard.press("ArrowLeft"); host.keyboard.press("ArrowLeft")
            assert host.evaluate("localStorage.getItem('tribecode.pvf.w')"), "width saved"

            # ---- 7: an invited friend's preview and a plain shared-link tab update too ----
            mctx = b.new_context(viewport={"width": 1280, "height": 860}); mctx.add_init_script(settings_js("Maya", maya, kp))
            mp = mctx.new_page(); watch(mp, "maya")
            mp.goto(BASE + "/?skipIntro=1")
            mp.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % kp, timeout=15000)
            mp.evaluate("TribePreview.open()"); mp.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            link = ok(api("/preview/token", "POST", token=maya, project=kp))["path"]
            tab = mctx.new_page(); tab.goto(BASE + link); tab.wait_for_selector("#mark")
            mcp(atok, kp, "code_write", {"path": "index.html", "text": page_html("v6 for everyone"), "message": "v6"}); t0 = time.time()
            wait_mark(host, "v6 for everyone", "host sees it", t0=t0); wait_mark(mp, "v6 for everyone", "the friend sees it", t0=t0)
            tab_wait(tab, "document.querySelector('#mark') && document.querySelector('#mark').textContent === 'v6 for everyone'", "shared link tab")

            # ---- 6: a pull through Sync now → reload ----
            other = os.path.join(work, "kombucha-friend"); subprocess.run(["git", "clone", "-q", remote, other], check=True)
            git(kom, "add", "-A"); git(kom, "commit", "-q", "-m", "wip", "--allow-empty"); git(kom, "push", "-q", "origin", "main")
            git(other, "pull", "-q", "origin", "main")
            Path(other, "index.html").write_text(page_html("v7 pulled from GitHub")); git(other, "commit", "-qam", "friend's change"); git(other, "push", "-q", "origin", "main")
            r = api("/repo/sync", "POST", {}, token=camp, project=kp, timeout=120); t0 = time.time()
            assert r[0] == 200, r
            try: wait_mark(host, "v7 pulled from GitHub", "pull via Sync now", t0=t0, limit=LIMIT + 2)
            except AssertionError as e: raise AssertionError(f"{e} · sync said {json.dumps(r[1])[:600]} · log {git(kom, 'log', '--oneline', '-5')} · status {git(kom, 'status', '--short')}")
            # dev-server mode: the dev server shows, and a repo change reloads it
            ok(api("/preview/settings", "PUT", {"port": DEV}, token=camp, project=kp))
            wait_mark(host, "dev one", "dev server mode", limit=LIMIT + 2)
            Dev.word = "dev two"; t0 = time.time(); Path(kom, "src.js").write_text("// changed\n")
            wait_mark(host, "dev two", "dev server reload on a repo change", t0=t0)
            ok(api("/preview/settings", "PUT", {"port": None}, token=camp, project=kp))
            wait_mark(host, "v7 pulled from GitHub", "back to static", limit=LIMIT + 2)

            # ---- 8: no index.html yet → appears in public/ → deleted → at the top ----
            wt = ok(api("/preview/token", "POST", token=camp, project=lp))
            assert not wt["hasIndex"]
            wtab = ctx.new_page(); watch(wtab, "waiting tab"); wtab.goto(BASE + wt["path"])
            assert "No index.html yet" in wtab.inner_text("body")
            ok(api("/code/file", "PUT", {"path": "public/index.html", "text": page_html("v8 in public/"), "message": "first page"}, token=camp, project=lp))
            tab_wait(wtab, "document.querySelector('#mark') && document.querySelector('#mark').textContent === 'v8 in public/'", "index.html appears in public/")
            assert ok(api("/preview", token=camp, project=lp))["preview"]["root"] == "public"
            os.remove(os.path.join(later, "public", "index.html"))
            tab_wait(wtab, "/No index.html yet/.test(document.body.innerText)", "index.html deleted")
            Path(later, "index.html").write_text(page_html("v9 at the top"))
            tab_wait(wtab, "document.querySelector('#mark') && document.querySelector('#mark').textContent === 'v9 at the top'", "index.html at the top")
            # the desktop pane: delete the page → back to the start screen; write it again → it runs
            os.remove(os.path.join(kom, "index.html"))
            host.wait_for_selector("#pvw.is-empty #pvw-bprompt", timeout=8000)
            Path(kom, "index.html").write_text(page_html("v10 back"))
            wait_mark(host, "v10 back", "page written again", limit=LIMIT + 2)

            # phones: Page · Edit · Saved tabs (feat/preview); Edit slides the Flint sheet over the preview
            ph.wait_for_selector("#pvf", state="attached", timeout=5000)
            assert not ph.evaluate("document.querySelector('#pvf').classList.contains('is-open')"), "the sheet starts closed on phones"
            ph.click("#pvw-ph [data-ph='edit']"); ph.wait_for_selector("#pvf.is-open", timeout=3000)
            ph.wait_for_timeout(400)
            box = ph.evaluate("(() => { const r = document.querySelector('#pvf').getBoundingClientRect(); return [r.left, r.right, r.bottom] })()")
            assert box[0] >= 0 and box[1] <= 391 and box[2] <= 845, box
            assert ph.evaluate("document.documentElement.scrollWidth") <= 391
            shot(ph, "flint-sheet-390")
            ph.keyboard.press("Escape") if ph.evaluate("document.activeElement && document.activeElement.closest && !!document.activeElement.closest('#pvf')") else ph.click("#pvw-ph [data-ph='page']")
            b.close()
        assert not errors, errors
        print(f"ok e2e_build_loop (agent write → preview {d2:.2f}s, first version {dt1:.1f}s)")
    finally:
        srv.terminate()
        try: dev.shutdown()
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
