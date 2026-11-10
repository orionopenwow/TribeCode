"""End-to-end: app preview (server/preview.js, server/mcp-preview.js, app/ui/preview.js).

API/HTTP: signed preview links (?pt= → path form), static serving with MIME types and strict headers
(CSP sandbox without allow-same-origin, nosniff, no-cache), expired / forged / other-project tokens → 403,
a member of another project → 403, traversal (../, encoded, backslashes) and dotfiles (.git/config, .env),
node_modules → 403/404, dev-server mode proxying a tiny local http server (redirects to other hosts blocked),
host-only settings, MCP preview_url.
UI: the right-panel preview opened from Ctrl K (frame content), device toggles (390 / 768 / 1280 px),
live reload when index.html changes on disk, open in a new tab without headers, the previewed page can't
read TribeCode's localStorage, the screenshot button saving to Visuals, the empty state with its one-tap
ask, the repo hero "Preview app" button and the phone full-screen sheet.
Usage: python app/test/e2e_preview.py [--shots]   (--shots saves docs/screenshots/preview-*.png)
"""
import base64, hashlib, hmac, http.client, http.server, json, os, re, shutil, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4841 + OFF
DEV = 4851 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
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
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def raw(path, method="GET", headers=None):
    """Exact path on the wire (no client-side normalising), no redirects followed."""
    c = http.client.HTTPConnection("localhost", PORT, timeout=30)
    c.request(method, path, headers=headers or {})
    r = c.getresponse(); body = r.read(); c.close()
    return r.status, {k.lower(): v for k, v in r.getheaders()}, body


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def shot(page, name):
    if take:
        page.wait_for_timeout(700)
        page.screenshot(path=str(SHOTS / f"preview-{name}.png"))


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid, color="#F26B1D"):
    # Init scripts run in every frame, the sandboxed preview too (no storage there): only the app's own pages.
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


HELLO_HTML = """<!doctype html><html><head><meta charset="utf-8"><title>Hello</title>
<link rel="stylesheet" href="style.css"></head><body><h1 id="out">loading</h1><p id="leak">?</p><p id="ver">VERSION</p>
<script src="app.js"></script></body></html>"""
HELLO_JS = """document.getElementById('out').textContent = 'hello from script';
let leak; try { leak = localStorage.getItem('tribecode.settings.v1'); leak = leak ? 'LEAKED ' + leak : 'none'; } catch (e) { leak = 'blocked'; }
let par = 'blocked'; try { par = window.top.document.title ? 'READ PARENT' : 'blocked'; } catch (e) {}
document.getElementById('leak').textContent = leak + ' / parent ' + par + ' / origin ' + window.origin;
localStorage.setItem('mine', 'ok');"""


def make_repo(path, files):
    os.makedirs(path, exist_ok=True)
    for rel, txt in files.items():
        Path(path, rel).parent.mkdir(parents=True, exist_ok=True); Path(path, rel).write_text(txt)
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


class DevHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/away":
            self.send_response(302); self.send_header("Location", "http://example.com/steal"); self.end_headers(); return
        if self.path == "/home":
            self.send_response(302); self.send_header("Location", "/index.html?from=home"); self.end_headers(); return
        auth = self.headers.get("Authorization") or self.headers.get("Cookie") or ""
        body = (f"<!doctype html><html><head><title>Dev</title></head><body><h1 id=dev>dev server says hi</h1><p id=path>{self.path}</p><p id=auth>[{auth}]</p></body></html>").encode()
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.send_header("Set-Cookie", "dev=1"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-preview-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="preview-src-", dir="/tmp")
    hello = os.path.join(work, "hello-app")
    make_repo(hello, {"index.html": HELLO_HTML.replace("VERSION", "v1"), "app.js": HELLO_JS, "style.css": "body{background:#12151A;color:#F8FAFC;font:16px system-ui}",
                      "data.json": "{\"a\":1}", ".env": "SECRET=hunter2", "node_modules/x/index.js": "x", "id_rsa": "KEY", "README.md": "# Hello"})
    pq = os.path.join(work, "pixel-quest")
    shutil.copytree(ROOT / "templates" / "starter-game", pq)
    make_repo(pq, {})
    os.symlink("/etc", os.path.join(hello, "etcdir"))   # a symlink inside the web root that points out of it
    sym = os.path.join(work, "sym-app")
    make_repo(sym, {"README.md": "# public/ is a symlink to another folder"})
    os.symlink(pq, os.path.join(sym, "public"))
    empty = os.path.join(work, "empty-app")
    make_repo(empty, {"README.md": "# Nothing yet"})

    dev = http.server.ThreadingHTTPServer(("127.0.0.1", DEV), DevHandler)
    threading.Thread(target=dev.serve_forever, daemon=True).start()

    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Preview Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people + projects ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); orion = boot["token"]
        hp = ok(api("/projects", "POST", {"path": hello}, token=orion), "hello project")["project"]["id"]
        pp = ok(api("/projects", "POST", {"path": pq}, token=orion), "pixel project")["project"]["id"]
        ep = ok(api("/projects", "POST", {"path": empty}, token=orion), "empty project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": ep}, token=orion))["invite"]   # Maya only sees the empty project
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]   # Sam: a tribe-wide builder
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---------------- status + signed links ----------------
        st = ok(api("/preview", token=orion, project=hp))["preview"]
        assert st["mode"] == "static" and st["root"] == "." and st["hasIndex"] and st["canConfigure"], st
        assert not ok(api("/preview", token=sam, project=hp))["preview"]["canConfigure"], "builders can't configure"
        t = ok(api("/preview/token", "POST", token=orion, project=hp), "mint")
        P = t["path"]
        assert re.match(rf"^/preview/{hp}/pv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/$", P), P
        assert orion not in json.dumps(t), "the member's key never goes into a preview link"
        code, h, body = raw(P)
        assert code == 200 and b"<h1 id=\"out\">" in body and b"data-tribe-preview" in body, (code, body[:200])
        assert h["content-security-policy"] == "sandbox allow-scripts allow-forms allow-pointer-lock allow-popups", h
        assert "allow-same-origin" not in h["content-security-policy"]
        assert h["x-content-type-options"] == "nosniff" and h["cache-control"] == "no-cache" and h["content-type"].startswith("text/html"), h
        for rel, mime in [("app.js", "text/javascript"), ("style.css", "text/css"), ("data.json", "application/json")]:
            c2, h2, _ = raw(P + rel); assert c2 == 200 and h2["content-type"].startswith(mime) and "sandbox" in h2["content-security-policy"], (rel, c2, h2)
        pt = P.split("/")[3]
        c2, h2, _ = raw(f"/preview/{hp}/?pt={pt}")
        assert c2 == 302 and h2["location"] == P, (c2, h2)   # ?pt= → the path form (relative URLs keep the token)
        c2, h2, _ = raw(f"/preview/{hp}/app.js?pt={pt}"); assert c2 == 302 and h2["location"] == P + "app.js", h2

        # ---------------- bad tokens ----------------
        assert raw(f"/preview/{hp}/")[0] == 403, "no token"
        assert raw(P.replace("pv1.", "pv1.X"))[0] == 403, "forged payload"
        body64, mac = pt.split(".")[1:]
        assert raw(f"/preview/{hp}/pv1.{body64}.{mac[:-2]}AA/")[0] == 403, "forged signature"
        secret = bytes.fromhex(Path(tmp, ".tribe", "preview-secret").read_text().strip())
        def signed(payload):
            b = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
            m = base64.urlsafe_b64encode(hmac.new(secret, ("preview:" + b).encode(), hashlib.sha256).digest()).decode().rstrip("=")
            return f"pv1.{b}.{m}"
        oid = boot["member"]["id"]
        assert raw(f"/preview/{hp}/{signed({'p': hp, 'm': oid, 'e': int(time.time() * 1000) + 60000})}/")[0] == 200, "a fresh, correctly signed token works"
        code, _, body = raw(f"/preview/{hp}/{signed({'p': hp, 'm': oid, 'e': int(time.time() * 1000) - 1000})}/")
        assert code == 403 and b"expired" in body, (code, body[:300])
        assert raw(f"/preview/{pp}/{pt}/")[0] == 403, "a token for one project doesn't open another"

        # ---------------- a member of another project ----------------
        assert api("/preview/token", "POST", token=maya, project=hp)[0] == 403, "Maya can't mint for a project she isn't in"
        mt = ok(api("/preview/token", "POST", token=maya, project=ep))
        assert raw(mt["path"])[0] == 404, "the empty project shows its empty page"   # no index.html
        assert raw(mt["path"].replace(f"/preview/{ep}/", f"/preview/{hp}/"))[0] == 403, "Maya's token can't open the hello project"
        maya_id = next(m["id"] for m in ok(api("/members", token=orion))["members"] if m["name"] == "Maya")
        assert raw(f"/preview/{hp}/{signed({'p': hp, 'm': maya_id, 'e': int(time.time() * 1000) + 60000})}/")[0] == 403, "membership is checked on every request"

        # ---------------- traversal + secrets ----------------
        for bad in ["../", "../../../../etc/passwd", "%2e%2e/%2e%2e/etc/passwd", "..%2f..%2f..%2fetc%2fpasswd", "src/..%5c..%5c..%5cetc%5cpasswd", "%2e%2e%5c%2e%2e%5cREADME.md"]:
            code, _, body = raw(P + bad)
            assert code in (403, 404) and b"root:" not in body, (bad, code)
        code, _, body = raw(f"/preview/{hp}/{pt}/..%2f..%2f{os.path.basename(pq)}/index.html")
        assert code in (403, 404) and b"Pixel Quest" not in body, code
        for secret_path in [".git/config", ".git/HEAD", ".env", "%2eenv", "node_modules/x/index.js", "id_rsa", ".tribe/x", "__tribe/x"]:
            code, _, body = raw(P + secret_path)
            assert code in (403, 404) and b"hunter2" not in body and b"KEY" != body.strip() and b"[core]" not in body, (secret_path, code, body[:120])

        for link_path in ["etcdir/passwd", "etcdir/hostname"]:
            code, _, body = raw(P + link_path); assert code in (403, 404) and b"root:" not in body, (link_path, code)
        sp = ok(api("/projects", "POST", {"path": sym}, token=orion), "symlink project")["project"]["id"]
        code, _, body = raw(ok(api("/preview/token", "POST", token=orion, project=sp))["path"])
        assert code == 403 and b"Pixel Quest" not in body, (code, body[:200])   # public/ → a folder outside the repo

        # ---------------- MCP preview_url ----------------
        ag = ok(api("/agents", "POST", token=orion, project=hp))
        tools = [x["name"] for x in mcp(ag["token"], None, method="tools/list")["tools"]]
        assert "preview_url" in tools, tools
        err, txt = mcp(ag["token"], "preview_url", {})
        assert not err and f"/preview/{hp}/pv1." in txt, txt
        link = re.search(rf"http://localhost:{PORT}/preview/\S+", txt).group(0)
        with urllib.request.urlopen(link) as r: assert b"hello" in r.read().lower() and r.headers["Content-Security-Policy"].startswith("sandbox")
        err, txt = mcp(ag["token"], "preview_url", {"project": ep})
        assert not err and "no index.html" in txt, txt

        # ---------------- dev-server mode (host only) ----------------
        assert api("/preview/settings", "PUT", {"port": DEV}, token=sam, project=hp)[0] == 403, "builders can't point the preview at a port"
        assert api("/preview/settings", "PUT", {"port": PORT}, token=orion, project=hp)[0] == 400, "not TribeCode's own port"
        assert api("/preview/settings", "PUT", {"port": 80}, token=orion, project=hp)[0] == 400
        assert api("/preview/settings", "PUT", {"root": "../x"}, token=orion, project=hp)[0] == 400
        st = ok(api("/preview/settings", "PUT", {"port": DEV}, token=orion, project=hp))["preview"]
        assert st["mode"] == "dev" and st["port"] == DEV, st
        code, h, body = raw(P + "some/page?x=1", headers={"Authorization": "Bearer " + orion, "Cookie": "a=b"})
        assert code == 200 and b"dev server says hi" in body and b"<p id=path>/some/page?x=1</p>" in body, (code, body[:300])
        assert b"[]" in body, "the viewer's credentials are never forwarded to the dev server"
        assert "sandbox" in h["content-security-policy"] and "set-cookie" not in h and b"data-tribe-preview" in body, h
        code, h, _ = raw(P + "home"); assert code == 302 and h["location"] == P + "index.html?from=home", (code, h)
        code, h, body = raw(P + "away"); assert code == 502 and "location" not in h and b"Redirect blocked" in body, (code, h)
        code, _, body = raw(P.split("?")[0] + "x", headers={"Referer": BASE + P})
        assert code == 200 and b"dev server says hi" in body
        code, _, body = raw("/@vite/client", headers={"Referer": BASE + P})   # absolute paths from the page reach the dev server
        assert code == 200 and b"<p id=path>/@vite/client</p>" in body, (code, body[:200])
        dev.shutdown(); dev.server_close()
        code, _, body = raw(P); assert code == 502 and f"localhost:{DEV}".encode() in body, (code, body[:200])
        st = ok(api("/preview/settings", "PUT", {"port": None, "root": "auto"}, token=orion, project=hp))["preview"]
        assert st["mode"] == "static", st
        code, _, body = raw("/@vite/client", headers={"Referer": BASE + P}); assert code == 404, "static mode never uses the Referer fallback"

        # ---------------- UI ----------------
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Orion", orion, hp))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % hp, timeout=15000)
            # desktop Docs: the pinned repo hero at the top of the doc list carries a visible "Preview app" button
            host.evaluate("TribeApp.show('docs')")
            host.wait_for_selector("#doc-pane .fg", timeout=10000)   # desktop Files opens on the file grid (the pinned repo lives in Code)
            shot(host, "desktop-docs-hero")
            host.evaluate("TribeApp.show('home')")
            # Ctrl K → Preview app
            host.keyboard.press("Control+k"); host.fill("#pal-input", "preview app"); host.wait_for_timeout(200)
            wait_text(host, "#pal-list", "Preview app"); host.keyboard.press("Enter")
            host.wait_for_selector("#tour-room.previewing #pvw #pvw-iframe", timeout=10000)
            assert host.evaluate("document.querySelector('#pvw-iframe').getAttribute('sandbox')") == "allow-scripts allow-forms allow-pointer-lock allow-popups"
            fr = host.frame_locator("#pvw-iframe")
            fr.locator("#out").filter(has_text="hello from script").wait_for(timeout=10000)
            leak = fr.locator("#leak").inner_text()
            assert leak.startswith("none / parent blocked / origin null"), leak   # sandbox: no TribeCode storage, no parent DOM
            panel_w = host.evaluate("document.querySelector('#tour-room').getBoundingClientRect().width")
            assert panel_w >= 380, panel_w
            # device toggles
            for dev_name, w in [("phone", 390), ("tablet", 768), ("desktop", 1280)]:
                host.click(f"#pvw [data-dev='{dev_name}']")
                host.wait_for_function("w => document.querySelector('#pvw-iframe').offsetWidth === w", arg=w, timeout=3000)
                fw = host.evaluate("document.querySelector('#pvw-frame').getBoundingClientRect().width")
                assert fw <= panel_w, (dev_name, fw, panel_w)
            host.click("#pvw [data-dev='phone']")
            # live reload: edit index.html on disk
            Path(hello, "index.html").write_text(HELLO_HTML.replace("VERSION", "v2 live"))
            fr.locator("#ver").filter(has_text="v2 live").wait_for(timeout=10000)
            fr.locator("#out").filter(has_text="hello from script").wait_for(timeout=5000)
            # open in a new tab: works with no headers, still sandboxed at the top level
            with ctx.expect_page() as pop:
                host.click("#pvw [data-act='tab']")
            tab = pop.value; tab.wait_for_load_state()
            tab.wait_for_function("document.querySelector('#out') && document.querySelector('#out').textContent === 'hello from script'", timeout=10000)
            assert f"/preview/{hp}/pv1." in tab.url and "token=" not in tab.url, tab.url
            tl = tab.evaluate("document.querySelector('#leak').textContent")
            assert tl.startswith("none /") and tl.endswith("origin null"), tl   # a top-level tab is sandboxed too
            tab.close()
            # share link (no public link here: the Wi-Fi/local one)
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            host.click("#pvw [data-act='share']")
            host.wait_for_function("document.querySelector('#pvw').dataset.share", timeout=3000)
            share = host.evaluate("document.querySelector('#pvw').dataset.share")
            assert f"/preview/{hp}/pv1." in share, share
            host.wait_for_selector(".toast", timeout=3000)
            # host settings form
            host.click("#pvw [data-act='more']"); host.click("#pvw [data-act='gear']"); host.wait_for_selector("#pvw-set:not(.hidden) select[name=root]")
            host.click("#pvw-set [data-set=cancel]")

            # Pixel Quest in the right panel, screenshot to Visuals
            host.evaluate("TribeClient.switchProject(%r)" % pp)
            host.wait_for_function("TribeClient.project() === %r" % pp, timeout=8000)
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            host.click("#pvw [data-dev='desktop']")
            host.frame_locator("#pvw-iframe").locator("canvas#game").wait_for(timeout=10000)
            host.wait_for_function("document.querySelector('#pvw').classList.contains('ready')", timeout=10000)
            host.wait_for_timeout(900)
            host.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())")
            shot(host, "desktop")
            host.click("#pvw [data-dev='phone']"); host.wait_for_timeout(500)
            shot(host, "desktop-phone")
            host.click("#pvw [data-act='more']"); host.click("#pvw [data-act='shot']")
            wait_text(host, ".toast", "Screenshot saved", timeout=12000)
            screens = ok(api("/visuals", token=orion, project=pp))["screens"]
            assert any(s["slug"] == "app-preview" for s in screens), screens
            v = [s for s in screens if s["slug"] == "app-preview"][0]["latest"]
            assert v["w"] and v["h"] and v["bytes"] > 2000, v   # a real picture of the page, not a blank

            # empty state + one-tap ask, then index.html appears → the preview shows it
            host.evaluate("TribeClient.switchProject(%r)" % ep)
            host.wait_for_function("TribeClient.project() === %r" % ep, timeout=8000)
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw.is-empty .pvw-empty", timeout=10000)
            wait_text(host, "#pvw", "What should it be?")   # v0.26: the AI Studio style start screen
            assert host.locator("#pvw [data-act='tab']").is_disabled()
            host.click("#pvw [data-bchip]")
            assert host.input_value("#pvw-bprompt") == "A pixel platformer game"
            host.click("#pvw-bgo")
            host.wait_for_function("/(Asked|running)/.test((document.querySelector('#pvw-bstat') ? document.querySelector('#pvw-bstat').innerText : '') + [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' '))", timeout=15000)   # the start screen can give way to the app before this looks
            msgs = ok(api("/chat/general", token=orion, project=ep))["messages"] + ok(api("/agents/channel", token=orion, project=ep))["messages"]
            assert any("index.html" in (m.get("text") or "") for m in msgs), msgs[-3:]
            shot(host, "empty")
            Path(empty, "index.html").write_text("<!doctype html><title>New</title><h1 id=new>brand new page</h1>")
            host.wait_for_selector("#pvw:not(.is-empty) #pvw-iframe", timeout=10000)
            host.evaluate("TribePreview.refresh && TribePreview.refresh()")
            host.frame_locator("#pvw-iframe").locator("#new").wait_for(timeout=10000)
            host.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")   # keys go to the app, not the reloaded frame
            host.keyboard.press("Escape")
            host.wait_for_function("!document.body.classList.contains('pvw-on')", timeout=3000)

            # phone: Docs hub → repo hero "Preview app" → full-screen sheet
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.add_init_script(settings_js("Orion", orion, pp))
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pp, timeout=15000)
            phone.click('#tabbar [data-nav="docs"]')
            phone.wait_for_selector("#m2-repo-hero .rhx-pv", timeout=10000)
            phone.wait_for_timeout(600); phone.evaluate("document.querySelector('#m2-repo-hero .rhx-pv')?.scrollIntoView({block: 'center'})"); shot(phone, "phone-hero")   # the hub re-renders as data lands
            phone.click("#m2-repo-hero .rhx-pv")
            phone.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            assert phone.evaluate("TribeApp.view()") == "docs", "the hero button opens the preview, not the repo view"
            box = phone.evaluate("(() => { const r = document.querySelector('#pvw-iframe').getBoundingClientRect(); return [r.left, r.width, r.bottom]; })()")
            assert box[0] <= 1 and box[1] >= 388, box   # full width
            phone.frame_locator("#pvw-iframe").locator("canvas#game").wait_for(timeout=10000)
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal overflow"
            phone.wait_for_timeout(900)
            shot(phone, "phone")
            b.close()

        assert not errors, "\n".join(errors)
        print("e2e_preview: OK")
    finally:
        srv.terminate()
        try: dev.shutdown()
        except Exception: pass
        shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
