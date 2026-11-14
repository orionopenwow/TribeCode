"""End-to-end: Publish for real from a phone alone (app/ui/publishphone.js, docs/PUBLISH.md).

A phone-only tribe (390x844, touch; offline.js solo mode) has no computer behind it. The same Publish sheet works:
the check list, Download (a real zip made on the phone, installable files inside), the itch.io zip, and a GitHub page
sent straight from the phone with the person's own token. api.github.com is a stand-in (app/test/ghmock.py, reached
through a browser route); nothing here touches the real GitHub. Also checked: no play link is offered, a secret in
the files stops the zip and the publish, the token is sent to api.github.com and nowhere else, no sideways scroll.
Usage: python app/test/e2e_publish_phone.py [--shots]
"""
import functools, http.server, io, json, os, struct, sys, threading, urllib.request, urllib.error, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SPORT, GH_PORT = 7680 + OFF, 7681 + OFF
STATIC = f"http://localhost:{SPORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "docs" / "screenshots")
take = "--shots" in sys.argv or bool(os.environ.get("SHOTS_DIR"))
TOKEN = "github_pat_" + "Phone7" * 6
ghmock.GOOD[TOKEN] = "rae-dev"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
errors, leaks = [], []
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def to_mock(route):
    """api.github.com -> the stand-in, with the headers a browser needs."""
    req = route.request
    if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    r = urllib.request.Request(f"http://127.0.0.1:{GH_PORT}" + req.url.split("api.github.com", 1)[1], method=req.method, data=(req.post_data or "").encode() or None,
                               headers={"Authorization": req.headers.get("authorization") or "", "Content-Type": "application/json"})
    try:
        with opener.open(r, timeout=20) as x: code, body = x.status, x.read()
    except urllib.error.HTTPError as e: code, body = e.code, e.read()
    route.fulfill(status=code, content_type="application/json", headers=CORS, body=body.decode())


def call(pg, method, path, body=None):
    return pg.evaluate("([m, p, b]) => TribeClient.api(p, { method: m, ...(b ? { body: b } : {}) }).then(d => ({ ok: true, d }), e => ({ ok: false, e: e.message, s: e.status, data: e.data }))", [method, path, body])


def png_size(b):
    assert b[:8] == b"\x89PNG\r\n\x1a\n"; return struct.unpack(">II", b[16:24])


GAME = '<!doctype html><html><head></head><body><canvas id="c" width="320" height="480"></canvas><script src="game.js"></script></body></html>'
GAME_JS = "const c = document.getElementById('c').getContext('2d'); c.fillRect(10, 10, 50, 50);"


def main():
    web = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Quiet, directory=str(UI))); threading.Thread(target=web.serve_forever, daemon=True).start()
    gh = ghmock.start(GH_PORT)
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch(executable_path="/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None, args=["--no-proxy-server"])
            ctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPHONE, accept_downloads=True, service_workers="block")
            ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true},checklist:{setup:true}}));localStorage.setItem('tribecode.lang','en')}catch(e){}")
            ctx.route("https://api.github.com/**", to_mock)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console: {m.text[:200]}"))
            pg.on("request", lambda r: (TOKEN in (r.headers.get("authorization") or "") or TOKEN in r.url or TOKEN in (r.post_data or "")) and "api.github.com" not in r.url and leaks.append(r.url))
            pg.goto(STATIC + "/?skipIntro=1")
            pg.wait_for_function("window.TribePhoneHost && window.TribeOffline && window.TribePhoneLocal && window.TribeGhPhone && window.TribePublishPhone", timeout=20000)
            pg.evaluate("TribePhoneHost.open()"); pg.wait_for_selector("#ph-start"); pg.click("#ph-start [data-ph='phone']")
            pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=15000)
            pid = pg.evaluate("TribeOffline.state().projects[0].id")

            # nothing built yet: the next step is to build, nothing breaks
            s = pg.evaluate("TribePublish.status(undefined, true)")
            assert s["phone"] and s["next"] == "build" and s["problem"] and not s["checks"], s

            # files on the phone
            for path, text in [("index.html", GAME), ("game.js", GAME_JS), (".env", "SECRET=hunter2")]:
                r = call(pg, "PUT", "/code/file", {"path": path, "text": text}); assert r["ok"] or path == ".env", r
            s = pg.evaluate("TribePublish.status(undefined, true)")
            by = {c["id"]: c for c in s["checks"]}
            assert s["kind"] == "game" and s["canSend"] and s["next"] == "pages" and by["canvas"]["ok"] and by["phone"]["auto"] and s["itch"]["ok"] and not s["github"]["signedIn"], s

            # the same sheet
            pg.evaluate("TribePublish.open()"); pg.wait_for_selector("#pb-real .pbr-row[data-dest='pages']", timeout=15000)
            assert "from this phone" in pg.locator(".pb-sub").text_content() and not pg.locator("#pb-go").is_visible() and not pg.locator("#pb-remix").is_visible(), "no play link from a phone alone, and it says so"
            assert [x.get_attribute("data-dest") for x in pg.locator("#pb-real .pbr-row").all()] == ["zip", "pages", "itch", "install", "android", "ios", "desktop"]
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.pb-sheet').scrollWidth <= document.querySelector('.pb-sheet').clientWidth + 1"), "no sideways scroll"
            pg.fill("#pb-title", "Star Hopper"); pg.fill("#pb-desc", "Hop between stars.")

            # Download: a real zip, made on the phone
            with pg.expect_download(timeout=15000) as dl: pg.click("#pb-real [data-zip='web']")
            z = zipfile.ZipFile(dl.value.path()); assert z.testzip() is None and dl.value.suggested_filename == "star-hopper.zip", dl.value.suggested_filename
            names = set(z.namelist())
            assert {"index.html", "game.js", "manifest.webmanifest", "sw.js", "icons/icon-192.png", "icons/icon-512.png"} <= names and ".env" not in names, names
            html = z.read("index.html").decode()
            assert "<title>Star Hopper</title>" in html and 'name="viewport"' in html and "Hop between stars." in html and 'rel="manifest"' in html
            assert png_size(z.read("icons/icon-512.png")) == (512, 512) and json.loads(z.read("manifest.webmanifest"))["display"] == "standalone"
            with pg.expect_download(timeout=15000) as dl: pg.click("#pb-real [data-zip='itch']")
            zi = zipfile.ZipFile(dl.value.path()); assert dl.value.suggested_filename == "star-hopper-itch.zip" and "index.html" in zi.namelist() and "sw.js" not in zi.namelist()

            # A link that stays up: needs the phone's own GitHub token
            r = call(pg, "POST", "/publish/real/pages", {"project": pid}); assert not r["ok"] and r["s"] == 401 and r["data"]["needGithub"] and not ghmock.STATE["calls"], r
            pg.click("#pb-real [data-gh-signin]"); pg.wait_for_selector("#gp-tok", timeout=8000)
            pg.fill("#gp-tok", TOKEN); pg.click("#gp-go")
            pg.wait_for_selector("#pb-real [data-pages]", timeout=15000)   # back in the Publish sheet, at the same row
            pg.wait_for_selector("#pb-real .pbr-row.is-focus[data-dest='pages']", timeout=8000)
            pg.fill("#pb-title", "Star Hopper"); pg.fill("#pb-desc", "Hop between stars."); pg.fill("#pbr-name", "Star Hopper!")   # the name in the link is cleaned up
            pg.click("#pb-real [data-pages]")
            pg.wait_for_selector("#pb-real [data-dest='pages'] .pbr-link code", timeout=20000)
            assert "https://rae-dev.github.io/star-hopper/" in pg.locator("#pb-real [data-dest='pages']").text_content()
            full = "rae-dev/star-hopper"; t = ghmock.tree_of(full)
            assert {"index.html", "game.js", ".nojekyll", ".tribecode.json", "manifest.webmanifest", "sw.js", "icons/icon-192.png"} <= set(t) and ".env" not in t, sorted(t)
            assert b"<title>Star Hopper</title>" in t["index.html"] and t["game.js"].decode() == GAME_JS and png_size(t["icons/icon-192.png"]) == (192, 192)
            if take: pg.screenshot(path=str(SHOTS / "publish-real-phone-only.png"))
            s = pg.evaluate("TribePublish.status(undefined, true)"); assert s["dest"]["pages"]["url"] == "https://rae-dev.github.io/star-hopper/" and s["next"] == "app" and s["github"]["login"] == "rae-dev", s
            # it survives a reload (kept with the tribe on this phone), and publishing again updates the same place
            pg.reload(); pg.wait_for_function("window.TribeOffline && TribeOffline.solo() && TribeClient.connected() && window.TribePublishPhone", timeout=20000)
            r = call(pg, "POST", "/publish/real/pages", {"project": pid}); assert r["ok"] and r["d"]["version"] == 2 and not r["d"]["created"] and ghmock.STATE["repos"][full]["pushes"] == 2, r
            # an app build can be added from the phone too
            r = call(pg, "POST", "/publish/real/wrapper", {"project": pid, "kind": "android", "on": True}); assert r["ok"] and r["d"]["sent"], r
            assert ".github/workflows/tribecode-android.yml" in ghmock.tree_of(full) and "android/app/build.gradle" in ghmock.tree_of(full)
            assert call(pg, "GET", f"/publish/real/build?project={pid}")["d"]["state"] == "ready"

            # a secret in the files stops the zip and the publish
            pushes = ghmock.STATE["repos"][full]["pushes"]
            call(pg, "PUT", "/code/file", {"path": "config.js", "text": "const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';"})
            s = pg.evaluate("TribePublish.status(undefined, true)"); assert s["blocked"] and s["next"] == "fix" and s["findings"][0]["file"] == "config.js", s
            r = call(pg, "POST", "/publish/real/pages", {"project": pid}); assert not r["ok"] and r["s"] == 409 and ghmock.STATE["repos"][full]["pushes"] == pushes, r
            st = pg.evaluate("fetch('/api/publish/real/zip?project=' + encodeURIComponent(TribeClient.project())).then(r => r.status)"); assert st == 409, st

            assert set(ghmock.STATE["auth"]) == {TOKEN} and not leaks, ("the token only ever goes to api.github.com", leaks)
            assert TOKEN not in pg.evaluate("JSON.stringify(TribeOffline.state())"), "the token is not kept with the tribe's data"
            br.close()
        if errors: raise AssertionError("browser errors:\n" + "\n".join(errors[:10]))
        print("e2e_publish_phone: ok")
    finally:
        web.shutdown(); gh.shutdown()


if __name__ == "__main__":
    main()
