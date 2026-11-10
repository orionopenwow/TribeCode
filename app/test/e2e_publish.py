"""End-to-end: one-click Publish (server/publish.js, app/ui/publish.js).

API/HTTP: the safety check (an Anthropic key blocks; .env/node_modules/key files never copied; a page built from the address
bar is a warning that needs "publish anyway"), publish -> /play/<slug>/ with the sandbox CSP, the "Made with TribeCode ·
Remix this" bar and Open Graph tags, republish bumps the version, spectators can't publish, an AI helper's publish_project
becomes an approval and goes live when the owner approves, remix makes a new project from the snapshot (and is refused
when the maker turned remix off), unpublish takes the link down.
UI: the publish sheet (check result, play link, QR), the 🚀 button in the preview toolbar, the dashboard "Share it" card,
and the phone sheet.
Usage: python app/test/e2e_publish.py [--shots]
"""
import http.client, json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5361 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "docs" / "screenshots")
take = "--shots" in sys.argv or bool(os.environ.get("SHOTS_DIR"))
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


def raw(path):
    c = http.client.HTTPConnection("localhost", PORT, timeout=30); c.request("GET", path)
    r = c.getresponse(); body = r.read(); c.close()
    return r.status, {k.lower(): v for k, v in r.getheaders()}, body


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d["content"][0]["text"]


def make_repo(path, files):
    os.makedirs(path, exist_ok=True)
    for rel, txt in files.items():
        Path(path, rel).parent.mkdir(parents=True, exist_ok=True); Path(path, rel).write_text(txt)
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.lang', 'en'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Kombucha Empire</title></head>
<body><h1 id="t">Kombucha Empire</h1><p id="s">batches: 6</p><script src="app.js"></script></body></html>"""


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-publish-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="publish-src-", dir="/tmp")
    app = os.path.join(work, "kombucha")
    make_repo(app, {"index.html": PAGE, "app.js": "localStorage.setItem('x','1'); document.getElementById('s').textContent = 'batches: 7';",
                    "config.js": "const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';", ".env": "SECRET=hunter2", "node_modules/x/i.js": "x", "id_rsa": "KEY", "README.md": "# Kombucha"})
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Publish Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap"); camp = boot["token"]
        kp = ok(api("/projects", "POST", {"path": app}, token=camp), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=camp))["invite"]
        spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        inv2 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=camp))["invite"]
        sam = ok(api("/join", "POST", {"code": inv2["code"], "name": "Sam"}))["token"]

        # ---------------- the safety check ----------------
        ch = ok(api("/publish/check", "POST", {"project": kp}, token=camp), "check")
        kinds = {(f["level"], f["kind"], f["file"]) for f in ch["findings"]}
        assert ch["blocked"] and ("block", "Anthropic key", "config.js") in kinds, ch
        assert not any(f["file"] in (".env", "node_modules/x/i.js") for f in ch["findings"]), "dotfiles and node_modules are never even looked at"
        st, d = api("/publish", "POST", {"project": kp, "force": True}, token=camp)
        assert st == 409 and any(f["kind"] == "Anthropic key" for f in d["findings"]), (st, d)   # secrets block, even with force
        assert api("/publish", "POST", {"project": kp}, token=spec)[0] == 403, "spectators can't publish"
        assert api("/publish/check", "POST", {"project": kp}, token=spec)[0] == 403

        # fix the secret, leave a warning
        Path(app, "config.js").write_text("const KEY = process.env.KEY;")
        Path(app, "app.js").write_text("document.getElementById('s').innerHTML = location.hash.slice(1) || 'batches: 7'; localStorage.setItem('x','1');")
        ch = ok(api("/publish/check", "POST", {"project": kp}, token=camp))
        assert not ch["blocked"] and any(f["level"] == "warn" and "address bar" in f["kind"] for f in ch["findings"]), ch
        st, d = api("/publish", "POST", {"project": kp, "title": "Kombucha Empire", "desc": "Batches, flavors and orders."}, token=camp)
        assert st == 409 and d.get("warnings"), (st, d)   # warnings need "publish anyway"
        r = ok(api("/publish", "POST", {"project": kp, "title": "Kombucha Empire", "desc": "Batches, flavors and orders.", "force": True}, token=camp), "publish")
        e = r["entry"]; slug = e["slug"]
        assert slug == "kombucha" and r["url"].endswith(f"/play/{slug}/") and e["version"] == 1 and e["allowRemix"], r

        # ---------------- the play link ----------------
        code, h, body = raw(f"/play/{slug}/")
        assert code == 200 and b"Kombucha Empire" in body, (code, body[:200])
        assert h["content-security-policy"].startswith("sandbox allow-scripts") and "allow-same-origin" not in h["content-security-policy"], h
        assert b'id="tribe-made"' in body and b"Made with <b" in body and f"/?remixPlay={slug}".encode() in body, "the badge with Remix"
        assert b'property="og:title" content="Kombucha Empire"' in body and b"og:description" in body, "share-card tags"
        assert b"data-tribe-play" in body, "in-memory storage for the sandbox"
        for gone in [".env", "node_modules/x/i.js", "id_rsa", "../index.html", "%2e%2e/%2e%2e/etc/passwd", ".git/config"]:
            c2, _, b2 = raw(f"/play/{slug}/{gone}"); assert c2 in (403, 404) and b"hunter2" not in b2 and b"[core]" not in b2, (gone, c2)
        assert raw(f"/play/{slug}/app.js")[0] == 200 and raw(f"/play/{slug}")[0] == 301 and raw("/play/nope/")[0] == 404
        # republish bumps the version, keeps the slug
        Path(app, "index.html").write_text(PAGE.replace("batches: 6", "batches: 8"))
        e2 = ok(api("/publish", "POST", {"project": kp, "force": True}, token=camp))["entry"]
        assert e2["slug"] == slug and e2["version"] == 2 and e2["title"] == "Kombucha Empire", e2
        assert b"batches: 8" in raw(f"/play/{slug}/")[2], "the snapshot updated"
        lst = ok(api(f"/publish?project={kp}", token=camp))
        assert lst["canPublish"] and lst["published"][0]["slug"] == slug and not ok(api(f"/publish?project={kp}", token=spec))["canPublish"]

        # ---------------- an AI helper asks; the owner approves ----------------
        ag = ok(api("/agents", "POST", token=camp, project=kp))
        txt = mcp(ag["token"], "publish_project", {"project": kp, "title": "Kombucha Empire v3"})
        assert "approve" in txt.lower(), txt
        aps = [a for a in ok(api("/approvals", token=camp))["approvals"] if a.get("kind") == "publish" and a["status"] == "pending"]
        assert aps, "an approval was created for the owner"
        assert "Published:" in mcp(ag["token"], "publish_status", {"project": kp})
        ok(api(f"/approvals/{aps[0]['id']}/approve", "POST", {}, token=camp), "approve")
        for _ in range(30):
            cur = ok(api(f"/publish?project={kp}", token=camp))["published"][0]
            if cur["version"] == 3: break
            time.sleep(0.2)
        assert cur["version"] == 3 and cur["title"] == "Kombucha Empire v3", cur

        # ---------------- remix ----------------
        rm = ok(api("/publish/remix", "POST", {"slug": slug}, token=sam), "remix")["project"]
        assert rm["name"].startswith("Kombucha Empire v3") and rm["repo"] and Path(rm["repo"], "index.html").exists(), rm
        assert "Remixed from" in Path(rm["repo"], "README.md").read_text()
        assert not Path(rm["repo"], ".env").exists() and not Path(rm["repo"], "id_rsa").exists()
        assert api("/publish/remix", "POST", {"slug": slug}, token=spec)[0] == 403, "spectators can't remix"
        ok(api(f"/publish/{slug}", "PATCH", {"allowRemix": False}, token=camp))
        assert api("/publish/remix", "POST", {"slug": slug}, token=sam)[0] == 403, "remix off"
        assert b"remixPlay" not in raw(f"/play/{slug}/")[2], "no Remix link when it's off"
        assert api(f"/publish/{slug}", "DELETE", token=sam)[0] == 403, "only who published it (or the host) can take it down"
        ok(api(f"/publish/{slug}", "PATCH", {"allowRemix": True}, token=camp))

        # ---------------- UI ----------------
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Camp", camp, kp))
            pg = ctx.new_page(); watch(pg, "camp")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribePublish && window.TribeClient && window.TribeClient.connected()", timeout=20000)
            pg.evaluate("window.TribePublish.open()")
            pg.wait_for_selector("#pb-url", timeout=10000)
            assert f"/play/{slug}/" in pg.text_content("#pb-url")
            assert "address bar" in pg.text_content("#pb-body"), "the warning shows in the sheet"
            pg.click("#pb-qrb"); pg.wait_for_selector("#pb-qr svg")
            if take: pg.wait_for_timeout(300); pg.locator("#invite-body").screenshot(path=str(SHOTS / "publish-sheet-1440.png"))
            pg.click("#invite-body [data-close]")
            # the preview toolbar gets a 🚀 button
            pg.evaluate("window.TribePreview.open()")
            pg.wait_for_selector(".pvw-btn.pb-tool", timeout=10000)
            pg.click(".pvw-btn.pb-tool"); pg.wait_for_selector("#pb-url", timeout=10000)
            pg.click("#invite-body [data-close]")
            # the dashboard card
            if pg.evaluate("!!(window.TribeShell && window.TribeShell.go)"):
                pg.evaluate("window.TribeShell.go('dashboard')")
            try:
                pg.wait_for_selector("#pb-dash", timeout=8000)
                assert "kombucha" in pg.text_content("#pb-dash").lower()
                if take: pg.locator("#pb-dash").screenshot(path=str(SHOTS / "publish-dash-1440.png"))
            except Exception:
                if pg.query_selector("#pj-reco-slot"): raise
            # phone sheet
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Camp", camp, kp))
            pp = ph.new_page(); watch(pp, "phone")
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function("window.TribePublish && window.TribeClient && window.TribeClient.connected()", timeout=20000)
            pp.evaluate("window.TribePublish.open()"); pp.wait_for_selector("#pb-url", timeout=10000)
            w = pp.evaluate("document.querySelector('#invite-body').getBoundingClientRect().right"); assert w <= 391, w
            if take: pp.wait_for_timeout(300); pp.screenshot(path=str(SHOTS / "publish-sheet-390.png"))
            # the play page itself runs (sandboxed, storage shim) and shows the bar
            pl = ctx.new_page(); watch(pl, "play")
            pl.goto(BASE + f"/play/{slug}/"); pl.wait_for_selector("#tribe-made")
            assert pl.text_content("#s") == "batches: 7", pl.text_content("#s")
            if take: pl.screenshot(path=str(SHOTS / "publish-play-1440.png"))
            pl.click("#tribe-made button"); assert not pl.query_selector("#tribe-made"), "the bar can be dismissed"
            b.close()

        ok(api(f"/publish/{slug}", "DELETE", token=camp), "unpublish")
        assert raw(f"/play/{slug}/")[0] == 404
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("ok e2e_publish")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
