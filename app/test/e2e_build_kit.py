"""Build kit (server/buildkit.js, templates/buildkit.json, templates/starter-3d, templates/starter-video): one curated,
permissively licensed open-source stack per kind of project. Checks: the catalog is well formed (no GPL, exact pinned
versions, https CDN import URLs that carry the version); a 3D project gets the 3d-game stack, TRIBE_CONTEXT.md has a
"Build kit" section with the import map and quality bar, and Make the starter copies starter-3d (three.js + cannon-es
import map, loading screen, canvas); with the CDN blocked the 3D preview still shows its canvas and says the engine
could not load; a project that sounds like a video editor gets the video stack and starter-video, whose editor works
offline (sample clips, select, trim, title, play); the Studios tab and Project setup show the stack chips; preview
Flint's build requests carry the kit hint. Usage: python app/test/e2e_build_kit.py
"""
import json, os, re, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5760 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("TRIBE_SHOTS")
OK_LICENSES = {"MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Zlib", "Apache-2.0", "MPL-2.0", "CC0-1.0", "Unlicense"}

def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            d = x.read(); return x.status, (d.decode() if raw else json.loads(d or b"{}"))
    except urllib.error.HTTPError as e: return e.code, (e.read().decode() if raw else json.loads(e.read() or b"{}"))

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def until(fn, what, t=15):
    end = time.time() + t
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)

def main():
    # ---- the catalog ----
    kit = json.loads((ROOT / "templates" / "buildkit.json").read_text())
    ids = [s["id"] for s in kit["stacks"]]
    assert set(ids) == {"3d-game", "2d-game", "video", "app-ui", "site", "data-viz"}, ids
    for s in kit["stacks"]:
        assert s["title"] and s["what"] and len(s["rules"]) >= 5 and s["libs"], s["id"]
        assert (ROOT / "templates" / s["starter"]).is_dir(), s["starter"]
        for l in s["libs"]:
            assert l["license"] in OK_LICENSES, (s["id"], l["name"], l["license"])
            assert "GPL" not in l["license"]
            if l["version"] != "built-in":
                assert re.fullmatch(r"\d+\.\d+\.\d+", l["version"]), l
                assert l["import"], l
            for spec, url in l["import"].items():
                assert url.startswith("https://cdn.jsdelivr.net/npm/") and f"@{l['version']}/" in url, (spec, url)
    assert "ffmpeg" not in json.dumps([l["pkg"] for s in kit["stacks"] for l in s["libs"]])   # GPL core left out
    for t in ("starter-3d", "starter-video"):
        for f in ("index.html", "README.md", "CLAUDE.md", "src/main.js", "style.css"): assert (ROOT / "templates" / t / f).is_file(), (t, f)
    im = re.search(r'<script type="importmap">\s*(\{.*?\})\s*</script>', (ROOT / "templates/starter-3d/index.html").read_text(), re.S)
    assert im and json.loads(im.group(1))["imports"]["three"].endswith("three@0.186.1/build/three.module.js")

    tmp = Path(tempfile.mkdtemp(prefix="tribe-buildkit-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_CONTEXT_DEBOUNCE_MS": "300"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]

        # ---- the whole kit ----
        allk = ok(api("/buildkit", token=host)); assert len(allk["stacks"]) == 6
        assert api("/buildkit")[0] == 401

        # ---- a 3D project ----
        p = ok(api("/projects", "POST", {"name": "Crystal Caves", "bio": "A first-person 3D cave explorer in three.js"}, token=host)); d3 = (p.get("project") or p)["id"]
        ok(api(f"/projects/{d3}/sense", "PUT", {"kind": "3d"}, host, project=d3))
        bk = until(lambda: (lambda d: d if d["stack"]["id"] == "3d-game" else None)(ok(api(f"/projects/{d3}/buildkit", token=host))), "3d stack")
        assert bk["importMap"]["imports"]["three"].startswith("https://cdn.jsdelivr.net/npm/three@") and "cannon-es" in bk["importMap"]["imports"]
        assert bk["hint"].startswith("Build kit (3D game or world): three.js@0.186.1"), bk["hint"]
        ok(api("/vision", "PUT", {"text": "# Crystal Caves\n\nExplore glowing caves and collect crystals.\n"}, token=host, project=d3))
        ok(api(f"/projects/{d3}/setup/repo", "POST", {}, token=host, project=d3))
        su = ok(api(f"/projects/{d3}/setup", token=host, project=d3))
        assert su["starter"]["template"] == "starter-3d" and su["starter"]["kit"]["id"] == "3d-game", su["starter"]
        st = ok(api(f"/projects/{d3}/setup/starter", "POST", {}, token=host, project=d3), "3d starter")
        assert st["template"] == "starter-3d" and any(f.endswith("src/main.js") for f in st["written"]), st
        repo = tmp / "tribe" / "workspaces" / d3
        html = (repo / "index.html").read_text()
        assert "<title>Crystal Caves</title>" in html and "three@0.186.1" in html and "{{" not in html, html[:400]
        ctx = until(lambda: (lambda md: md if "## Build kit: 3D game or world" in md else None)(ok(api("/context", token=host, project=d3, raw=True))), "context has the kit", 20)
        assert '"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js"' in ctx and "Quality bar" in ctx and "ACESFilmic" in ctx and "templates/starter-3d" in ctx
        t3 = ok(api("/preview/token", "POST", token=host, project=d3)); assert t3["hasIndex"], t3

        # ---- a video editor project ----
        p = ok(api("/projects", "POST", {"name": "Clip Cutter", "bio": "A video editor to trim clips, add titles and export reels"}, token=host)); vid = (p.get("project") or p)["id"]
        ok(api("/vision", "PUT", {"text": "# Clip Cutter\n\nA simple video editor: trim clips on a timeline, add titles, export.\n"}, token=host, project=vid))
        ok(api(f"/projects/{vid}/sense", "PUT", {"kind": "app"}, host, project=vid))
        until(lambda: ok(api(f"/projects/{vid}/buildkit", token=host))["stack"]["id"] == "video", "video stack", 20)
        ok(api(f"/projects/{vid}/setup/repo", "POST", {}, token=host, project=vid))
        st = ok(api(f"/projects/{vid}/setup/starter", "POST", {}, token=host, project=vid), "video starter")
        assert st["template"] == "starter-video", st
        tv = ok(api("/preview/token", "POST", token=host, project=vid)); assert tv["hasIndex"], tv

        # a website still gets the site stack and the old starter
        p = ok(api("/projects", "POST", {"name": "Oak St Bakers", "bio": "A website for orders"}, token=host)); site = (p.get("project") or p)["id"]
        ok(api(f"/projects/{site}/sense", "PUT", {"kind": "site"}, host, project=site))
        assert until(lambda: ok(api(f"/projects/{site}/buildkit", token=host))["stack"]["id"] == "site", "site stack")
        assert api("/projects/nope/buildkit", token=host)[0] == 404

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- the 3D starter in the preview, CDN blocked: canvas + a clear message, no blank page ----
            c3 = b.new_context(viewport={"width": 1280, "height": 760})
            c3.route(re.compile(r"https://cdn\.jsdelivr\.net/.*"), lambda r: r.abort())
            pg = c3.new_page()
            pg.goto(BASE + t3["path"]); pg.wait_for_selector("canvas#game", state="attached")
            assert pg.locator("#loader h1").inner_text() == "Crystal Caves"
            pg.wait_for_function("document.getElementById('load-note').textContent.includes('Could not load the 3D engine')", timeout=10000)
            if SHOTS: pg.screenshot(path=f"{SHOTS}/buildkit-3d-offline.png")
            c3.close()
            # ---- the video starter works offline ----
            cv = b.new_context(viewport={"width": 1280, "height": 800})
            cv.route(re.compile(r"https://cdn\.jsdelivr\.net/.*"), lambda r: r.abort())
            vg = cv.new_page(); vg.on("pageerror", lambda e: errors.append("video: " + str(e)))
            vg.goto(BASE + tv["path"]); vg.wait_for_selector("#sample")
            assert vg.locator("h1").inner_text() == "Clip Cutter"
            assert vg.locator("#export").is_disabled()
            vg.click("#sample"); vg.wait_for_function("document.querySelectorAll('#track .clip').length === 3")
            assert not vg.locator("#edit").is_hidden() and vg.locator("#clip-name").inner_text() == "Opening"
            vg.fill("#title", "Hello tribe"); assert "Hello tribe" in vg.locator("#track .clip.sel").inner_text()
            vg.locator("#out").fill("500"); assert vg.locator("#out-v").inner_text() == "0:01.5", vg.locator("#out-v").inner_text()
            vg.click("#track .clip >> nth=1"); assert vg.locator("#clip-name").inner_text() == "The build"
            vg.click("#right"); assert vg.eval_on_selector_all("#track .clip", "els => els.map(e => e.textContent)")[2].startswith("The build")
            vg.click("#play"); time.sleep(0.8)
            assert vg.locator("#play").inner_text() == "Pause" and not vg.locator("#time").inner_text().startswith("0:00.0"), vg.locator("#time").inner_text()
            assert not vg.locator("#export").is_disabled()
            if SHOTS: vg.screenshot(path=f"{SHOTS}/buildkit-video.png")
            cv.close()

            # ---- the app: Studios shows the stack, Project setup shows chips, preview Flint carries the hint ----
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}" % (BASE, host)
            ap = b.new_page(viewport={"width": 1440, "height": 900}); ap.on("pageerror", lambda e: errors.append(str(e)))
            ap.add_init_script(init)
            ap.goto(BASE + "/?skipIntro=1"); ap.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeStudios && window.TribeProjects", timeout=20000)
            ap.evaluate(f"TribeProjects.switchTo('{d3}', 'home')"); ap.wait_for_function(f"TribeClient.project() === '{d3}'", timeout=10000)
            ap.evaluate("TribeStudios.open()"); ap.wait_for_selector("#sto-kit .sto-chip", timeout=15000)
            chips = ap.eval_on_selector_all("#sto-kit .sto-chip b", "els => els.map(e => e.textContent)")
            assert chips[:3] == ["three.js", "postprocessing", "cannon-es"], chips
            assert "3D game" in ap.text_content("#sto-kit .sto-eyebrow") and "MIT" in ap.inner_text("#sto-kit")
            if SHOTS: ap.locator("#sto-kit").screenshot(path=f"{SHOTS}/buildkit-studios.png")
            assert ap.evaluate("fetch('/api/projects/%s/buildkit', { headers: { Authorization: 'Bearer %s' } }).then(r => r.json()).then(d => d.hint)" % (d3, host)).startswith("Build kit")
            ap.close()
            b.close()
        assert not errors, errors
        print("e2e_build_kit: OK")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
