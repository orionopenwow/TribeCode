"""Dashboard preview band + Needs attention (feat/dash-preview, app/ui/dashband.js, server/dashband.js).

A tribe with four projects: Rocket (a repo with index.html, plus a website and a design), Bakery (a website and a
design), Sketch (a design) and Blank (nothing). The band picks app, then website, then design, then "Set up your
preview". A lead pins the main project from the ⋯ menu; Switch (App / Website / Design) changes what's shown; the app's
thumbnail is the cached screenshot (an <img>) and the live iframe only appears after a click. Needs attention for
Maya (a builder) ranks a failing build, an approval, a task waiting for her Accept, an overdue task and website
comments in that order, with one action each; Accept works from the row; Blank is "All clear". Home shows the band for
your most recent project, a tribe with no projects gets "Start your first project", and with no tribe Home shows the
newest website kept on this device. 390px phones: stacked, the picture shorter, no sideways scroll.
--shots writes docs/screenshots/dash-preview.png, dash-criticals.png, dash-preview-phone.png.
Usage: python app/test/e2e_dash_preview.py [--shots]
"""
import base64, functools, http.server, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6731 + OFF; BASE = f"http://localhost:{PORT}"
STATIC = 6732 + OFF
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors, bad = [], []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: raise AssertionError(f"{method} {path}: {e.code} {e.read()[:300]}")


def png(w=320, h=180):
    """A small flat PNG (a teal page with an ember bar) for the app's screenshot."""
    rows = b"".join(b"\x00" + b"".join((b"\xf2\x6b\x1d" if y < 30 else b"\x38\xc6\xb1") for _ in range(w)) for y in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return base64.b64encode(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(rows)) + ch(b"IEND", b"")).decode()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("response", lambda r: "/api/" in r.url and r.status >= 500 and bad.append(f"{who} {r.status} {r.url}"))
    page.on("dialog", lambda d: d.dismiss())


def open_page(b, token, name, w=1360, h=900, base=BASE):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500)
    ctx.add_init_script("try{if(!sessionStorage.getItem('t')){sessionStorage.setItem('t','1');localStorage.setItem('tribecode.helpers.v1',JSON.stringify({flint:1,brain:1,ai:1}));localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:%s,color:'#F26B1D',onboarded:true,theme:'dark',tour:{done:true},server:{url:%s,token:%s}}))}}catch(e){}" % (json.dumps(name), json.dumps(BASE if token else ""), json.dumps(token)))
    pg = ctx.new_page(); watch(pg, name)
    pg.goto(base + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    if token: pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeDashBand && TribeProjects.list().length > 1", timeout=30000)
    return pg


def dash(pg, pid):
    pg.evaluate("document.querySelectorAll('.pvw,#sd,.db-menu').forEach(x => x.remove())")
    pg.evaluate(f"TribeProjects.switchTo({json.dumps(pid)}, 'home')")
    pg.wait_for_function(f"(() => {{ const b = document.querySelector('#pj-band-slot .db-band'); return b && (b.dataset.pid === {json.dumps(pid)} || b.dataset.pick === 'none'); }})()", timeout=15000)
    pg.wait_for_function("document.querySelector('#pj-crit-slot .db-crit')", timeout=15000)
    pg.wait_for_timeout(300)


def pick(pg): return pg.evaluate("document.querySelector('#pj-band-slot .db-band').dataset.pick")


def shot(pg, name):
    if take: pg.wait_for_timeout(600); pg.screenshot(path=str(SHOTS / f"{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-dashpv-", dir="/tmp")
    repo = Path(tempfile.mkdtemp(prefix="rocket-", dir="/tmp"))
    (repo / "index.html").write_text("<!doctype html><title>Rocket</title><body style='background:#12151A;color:#F8FAFC;font:20px sans-serif'><h1>Rocket launch</h1><p>Tap to fly.</p></body>")
    (repo / "README.md").write_text("# Rocket\nA tiny game.\n")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Launch Crew", "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"})
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC), functools.partial(Quiet, directory=str(ROOT / "app" / "ui")))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        for _ in range(120):
            try:
                if api("/health"): break
            except Exception: time.sleep(0.25)
        boot = api("/bootstrap", "POST", {"name": "Orion"}); tok, me = boot["token"], boot["member"]["id"]
        inv = api("/invites", "POST", {}, token=tok)["invite"]
        maya = api("/join", "POST", {"code": inv["code"], "name": "Maya"}); mt, mid = maya["token"], maya["member"]["id"]
        rocket = api("/projects", "POST", {"path": str(repo)}, token=tok)["project"]["id"]
        bakery = api("/projects", "POST", {"name": "Bakery"}, token=tok)["project"]["id"]
        sketch = api("/projects", "POST", {"name": "Sketch"}, token=tok)["project"]["id"]
        blank = api("/projects", "POST", {"name": "Blank"}, token=tok)["project"]["id"]
        for pid in (rocket, bakery, sketch, blank):
            for m in (mid,):
                try: api(f"/projects/{pid}/members", "POST", {"member": m, "role": "builder"}, token=tok)
                except AssertionError: pass

        def design(pid, name):
            cv = api("/canvas", "POST", {"name": name}, token=tok, project=pid)["file"]["id"]
            api(f"/canvas/{cv}/ops", "POST", {"ops": [{"id": "frame1", "t": "frame", "p": "", "i": 1, "v": 1, "x": 0, "y": 0, "w": 390, "h": 800, "fill": "#FBF7F2", "name": "Screen"},
                                                      {"id": "box001", "t": "rect", "p": "frame1", "i": 2, "v": 1, "x": 30, "y": 60, "w": 330, "h": 120, "fill": "#F26B1D", "name": "Hero"}]}, token=tok, project=pid)
            return cv
        site = lambda pid, title: api(f"/projects/{pid}/site-config", "PUT", {"config": {"pages": [{"blocks": [{"type": "hero", "props": {"title": title, "subtitle": "Fresh bread every Saturday"}}]}]}, "force": True}, token=tok, project=pid)
        design(rocket, "Rocket HUD"); site(rocket, "Rocket")
        site(bakery, "Sunrise Bakery"); design(bakery, "Bakery menu")
        design(sketch, "Title screen")
        api("/visuals", "POST", {"screen": "App preview", "png_base64": png()}, token=tok, project=rocket)

        # 1. the band picks app, then website, then design, then empty (server)
        picks = {p: api("/dash/band", token=tok, project=p)["band"]["pick"] for p in (rocket, bakery, sketch, blank)}
        assert picks == {rocket: "app", bakery: "site", sketch: "design", blank: "none"}, picks

        # criticals seeded in Bakery, seen by Maya (a builder: no setup gaps)
        api("/dash/signal", "POST", {"kind": "build", "ok": False, "text": "npm test: 3 failing"}, token=tok, project=bakery)
        api("/approvals", "POST", {"title": "Publish the menu page", "risk": "high"}, token=tok, project=bakery)
        api("/tasks", "POST", {"title": "Photograph the croissants", "assignee": mid}, token=tok, project=bakery)
        api("/tasks", "POST", {"title": "Order flour", "due": "2024-01-05"}, token=tok, project=bakery)
        for t in ("Make the hero warmer", "Hours are wrong"):
            api(f"/projects/{bakery}/site-comments", "POST", {"page": "index", "block": "b1", "blockType": "hero", "label": "Hero", "text": t}, token=mt, project=bakery)
        cr = api("/dash/criticals", token=mt, project=bakery)["items"]
        assert [x["k"] for x in cr][:5] == ["build", "approval", "accept", "overdue", "comments"], [x["k"] for x in cr]
        assert api("/dash/criticals", token=mt, project=blank)["items"] == [], "nothing in Blank for Maya"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = open_page(b, tok, "Orion")

            # 2. the band in the UI: app, website, design, empty
            for pid, want in ((rocket, "app"), (bakery, "site"), (sketch, "design"), (blank, "none")):
                dash(pg, pid); assert pick(pg) == want, (pid, pick(pg))
            assert "Set up your preview" in pg.inner_text("#pj-band-slot"), "the calm empty card"
            assert pg.locator("#pj-band-slot [data-db=new-site]").count() == 1

            # 3. the thumbnail is the cached screenshot, and the iframe only appears on interaction
            dash(pg, rocket)
            pg.wait_for_function("(() => { const i = document.querySelector('#pj-band-slot img.db-shot'); return i && i.complete && i.naturalWidth > 0; })()", timeout=10000)
            assert pg.locator("#pj-band-slot .db-frame").count() == 0, "no iframe before interaction"
            txt = pg.inner_text("#pj-band-slot .db-strip")
            assert "ROCKET" in txt.upper() and "App" in txt and "Open preview" in txt and "Open code" in txt and "Share link" in txt, txt
            pg.wait_for_timeout(1200)   # the overview settles; the band is kept, not reloaded
            assert pg.locator("#pj-band-slot .db-frame").count() == 0, "still no iframe without interaction"
            shot(pg, "dash-preview")
            pg.click("#pj-band-slot .db-stage")
            pg.wait_for_selector("#pj-band-slot .db-frame", timeout=10000)
            src = pg.get_attribute("#pj-band-slot .db-frame", "src"); assert "/preview/" in src, src
            assert "allow-same-origin" not in pg.get_attribute("#pj-band-slot .db-frame", "sandbox")

            # 4. Switch what's shown: App -> Website -> Design -> back to automatic
            pg.click("#pj-band-slot [data-show=site]")
            pg.wait_for_function("document.querySelector('#pj-band-slot .db-band').dataset.pick === 'site'", timeout=8000)
            assert "Rocket" in pg.inner_text("#pj-band-slot .db-site") and "Open designer" in pg.inner_text("#pj-band-slot .db-strip")
            pg.click("#pj-band-slot [data-show=design]")
            pg.wait_for_function("document.querySelector('#pj-band-slot .db-band').dataset.pick === 'design'", timeout=8000)
            assert pg.locator("#pj-band-slot .db-pic svg").count() == 1, "the design's own shapes"
            assert api("/dash/band", token=mt, project=rocket)["band"]["pick"] == "design", "the switch is saved for the tribe"
            pg.click("#pj-band-slot [data-db=more]"); pg.click(".db-menu [data-dbm=auto]")
            pg.wait_for_function("document.querySelector('#pj-band-slot .db-band').dataset.pick === 'app'", timeout=8000)

            # 5. pin a main project from the ⋯ menu (leads)
            dash(pg, sketch)
            pg.click("#pj-band-slot [data-db=more]"); pg.click(".db-menu [data-dbm=pin]")
            pg.wait_for_function("(() => { const m = document.querySelector('#pj-band-slot .db-main'); return m && m.textContent.includes('Main project'); })()", timeout=8000)
            assert api("/dash/band", token=mt, project=rocket)["band"]["main"] == sketch
            mb = open_page(b, mt, "Maya"); dash(mb, sketch)
            mb.click("#pj-band-slot [data-db=more]")
            assert mb.locator(".db-menu [data-dbm=pin], .db-menu [data-dbm=unpin]").count() == 0, "builders can't pin"
            mb.keyboard.press("Escape")

            # 6. Needs attention for Maya: ranked, one action each, Accept works in place
            dash(mb, bakery)
            ks = mb.eval_on_selector_all("#pj-crit-slot .db-item", "els => els.map(e => e.dataset.k)")
            assert ks[:5] == ["build", "approval", "accept", "overdue", "comments"], ks
            assert len(ks) <= 5
            assert all(n == 1 for n in mb.eval_on_selector_all("#pj-crit-slot .db-item", "els => els.map(e => e.querySelectorAll('button').length)")), "one action per row"
            assert "NEEDS ATTENTION" in mb.inner_text("#pj-crit-slot").upper()
            ys = mb.evaluate("['#pj-band-slot', '#pj-crit-slot', '#pj-living, #pj-check'].map(s => document.querySelector(s).getBoundingClientRect().top)")
            assert ys[0] < ys[1] < ys[2], f"band, then criticals, then the rest {ys}"
            assert mb.locator("#pj-living .gl-needs").count() == 0, "Needs you moved up into Needs attention"
            shot(mb, "dash-criticals")
            mb.click("#pj-crit-slot .db-item[data-k=accept] button")
            mb.wait_for_function("!document.querySelector('#pj-crit-slot .db-item[data-k=accept]')", timeout=8000)
            t = [x for x in api("/tasks", token=mt, project=bakery)["tasks"] if x["title"] == "Photograph the croissants"][0]
            assert t["accept"] == "accepted" and t["status"] == "doing", t
            # more than five: Show all
            for i in range(2): api("/tasks", "POST", {"title": f"Blocked thing {i}", "labels": ["blocked"]}, token=tok, project=bakery)
            for x in api("/tasks", token=tok, project=bakery)["tasks"]:
                if x["title"].startswith("Blocked thing"): api(f"/tasks/{x['id']}", "PATCH", {"labels": ["blocked"]}, token=tok, project=bakery)
            api("/dash/signal", "POST", {"kind": "preview", "ok": False, "text": "TypeError: x is undefined"}, token=tok, project=bakery)
            mb.evaluate("TribeDashBand.refresh()")
            mb.wait_for_selector("#pj-crit-slot #db-all", timeout=8000)
            assert mb.locator("#pj-crit-slot .db-item").count() == 5
            mb.click("#pj-crit-slot #db-all"); assert mb.locator("#pj-crit-slot .db-item").count() > 5

            # 7. All clear
            dash(mb, blank)
            assert "All clear" in mb.inner_text("#pj-crit-slot"), mb.inner_text("#pj-crit-slot")
            mb.context.close()

            # 8. Home: the band for your most recent project
            dash(pg, bakery); pg.evaluate("TribeHub.remember && TribeHub.remember('home')")
            pg.evaluate("TribeHub.open('home')")
            pg.wait_for_function(f"(() => {{ const b = document.querySelector('#hub-band-slot .db-band'); return b && b.dataset.pid === {json.dumps(bakery)}; }})()", timeout=15000)
            assert pg.locator("#hub-band-slot .db-frame").count() == 0
            # a tribe with no projects: Start your first project
            pg.evaluate("(async () => { const L = TribeProjects.list; TribeProjects.list = () => []; await TribeDashBand.mountHome(document.querySelector('#hub-band-slot'), true); window.__restore = () => { TribeProjects.list = L; }; })()")
            pg.wait_for_function("document.querySelector('#hub-band-slot .db-band.db-start')", timeout=5000)
            assert "Start your first project" in pg.inner_text("#hub-band-slot")
            pg.evaluate("window.__restore(); TribeDashBand.mountHome(document.querySelector('#hub-band-slot'), true)")
            pg.context.close()

            # 9. phones at 390px: stacked, the picture shorter, no sideways scroll
            ph = open_page(b, tok, "Orion", 390, 844)
            dash(ph, rocket)
            ph.wait_for_function("(() => { const i = document.querySelector('#pj-band-slot img.db-shot'); return i && i.naturalWidth > 0; })()", timeout=10000)
            g = ph.evaluate("""(() => { const s = document.querySelector('#pj-band-slot .db-stage').getBoundingClientRect(), i = document.querySelector('#pj-band-slot .db-id').getBoundingClientRect(), a = document.querySelector('#pj-band-slot .db-acts').getBoundingClientRect();
              return { stage: s.height, stacked: a.top >= i.bottom - 1, sw: document.documentElement.scrollWidth, w: innerWidth }; })()""")
            assert g["stage"] < 200 and g["stacked"] and g["sw"] <= g["w"] + 1, g
            ph.evaluate("document.querySelector('#pj-band-slot').scrollIntoView()")
            shot(ph, "dash-preview-phone")
            ph.context.close()

            # 10. no tribe: Home shows the newest website kept on this device
            lo = open_page(b, "", "Orion", base=f"http://127.0.0.1:{STATIC}")
            lo.wait_for_function("window.TribeLocalFiles && window.TribeDashBand && window.TribeHub", timeout=30000)
            lo.evaluate("(async () => { await TribeLocalFiles.ready; await TribeLocalFiles.create('site', { title: 'Bake sale', body: '<h1>Bake sale</h1>' }); TribeHub.open('home'); })()")
            lo.wait_for_function("(() => { const b = document.querySelector('#hub-band-slot .db-band.db-local'); return b && b.textContent.includes('Bake sale'); })()", timeout=10000)
            assert lo.locator("#hub-band-slot .db-frame").count() == 0
            lo.click("#hub-band-slot .db-stage"); lo.wait_for_selector("#hub-band-slot .db-frame", timeout=5000)
            lo.context.close()
            b.close()
        real = [e for e in errors if "ResizeObserver" not in e]
        assert not real, "\n".join(real[:10])
        assert not bad, "\n".join(bad[:10])
        print("e2e_dash_preview: ok")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate(); httpd.shutdown()


if __name__ == "__main__":
    main()
