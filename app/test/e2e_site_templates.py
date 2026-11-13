"""End-to-end: the website template library (templates/sites, server/sitelib.js, app/ui/sitelib.js). No AI anywhere.

1. GET /api/site-library lists all 16 templates with categories; thumbnails load without a sign-in header.
2. The gallery: every template is there, a category filter and the search narrow it, picking Link in bio shows the
   details with the three skill levels, "Use this template" puts it in the repo and opens Customize.
3. Easy: typing a new name and a link updates the preview at once and is saved to site.json and the page; a new link
   is added. Comfortable: a look (preset) and hiding a section show in the preview and are saved. Pro: the files are
   listed. Done saves a version (a commit).
4. Flint in the panel beside the preview: "make a merch store for Ember Socks" builds the merch template with the name
   filled in, free, and offers "Customize it".
5. Every template renders from the repo through the preview with no page errors and no sideways scroll at 390 px.
Usage: python app/test/e2e_site_templates.py [--shots]
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4961 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or (ROOT / "docs" / "screenshots"))
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return (r.status, data, r.headers.get("Content-Type")) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r[0], r[1]
    assert st == 200, f"{what}: {st} {d}"
    return d


def git(cwd, *a):
    return subprocess.run(["git", "-C", str(cwd), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True, text=True).stdout


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text
            and "EventSource" not in m.text and "jsdelivr" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"site-templates-{name}.png"))


def saved(page):
    try: page.wait_for_function("document.querySelector('#slx-state').textContent === 'Saved'", timeout=8000)
    except Exception:
        raise AssertionError(f"Customize never said Saved; it says {page.inner_text('#slx-state')!r}; errors: {errors}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sitelib-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="sitelib-src-", dir="/tmp")
    repo = os.path.join(work, "mara"); os.makedirs(repo)
    Path(repo, "README.md").write_text("# Mara\n"); git(repo, "init", "-q", "-b", "main"); git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "init")
    all_repo = os.path.join(work, "all"); os.makedirs(all_repo)
    Path(all_repo, "README.md").write_text("# All\n"); git(all_repo, "init", "-q", "-b", "main"); git(all_repo, "add", "-A"); git(all_repo, "commit", "-q", "-m", "init")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Site Lib"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"path": repo}, token=camp), "project")["project"]["id"]
        aid = ok(api("/projects", "POST", {"path": all_repo}, token=camp), "all project")["project"]["id"]

        # ---- 1: the catalog ----
        lib = ok(api("/site-library", token=camp))
        ids = [t["id"] for t in lib["templates"]]
        assert len(ids) == 16, ids
        for want in ["linkbio", "merch", "portfolio", "creator", "band", "cafe", "service", "wedding", "podcast", "blog", "saas", "gamepage", "resume", "nonprofit", "photography", "comingsoon"]:
            assert want in ids, want
        assert {c["id"] for c in lib["categories"]} >= {"personal", "business", "shop", "creative", "events", "writing"}
        assert all(t["thumb"] for t in lib["templates"]), "every template has a thumbnail"
        st, png, ct = api(lib["templates"][0]["thumb"].replace("/api", "", 1), raw=True)
        assert st == 200 and ct == "image/png" and png[:4] == b"\x89PNG", (st, ct)
        assert api("/site-library")[0] == 401, "the list itself needs a member"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings_js("Camp", camp, pid))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)

            # ---- 2: the gallery ----
            host.evaluate("TribeSiteLib.open()")
            host.wait_for_selector("#slx .slx-card", timeout=8000)
            assert host.locator("#slx .slx-card").count() == 16
            host.wait_for_function("[...document.querySelectorAll('#slx .slx-th img')].every(i => i.complete && i.naturalWidth > 0)", timeout=8000)
            shot(host, "gallery")
            host.click("#slx [data-cat=shop]")
            assert host.locator("#slx .slx-card").count() == 1 and "Merch" in host.inner_text("#slx .slx-card")
            host.click("#slx [data-cat=all]")
            host.fill("#slx-q", "link")
            host.wait_for_function("document.querySelectorAll('#slx .slx-card').length >= 1 && [...document.querySelectorAll('#slx .slx-card b')].some(b => /Link in bio/.test(b.textContent))")
            host.fill("#slx-q", "")
            host.click("#slx [data-tpl=linkbio]")
            host.wait_for_selector("#slx-pick:not([hidden]) #slx-use")
            assert host.locator("#slx-pick input[name=slx-lv]").count() == 3, "three skill levels"
            assert host.input_value("#slx-pick #slx-name") == "Mara", "the folder name reads as a title"
            host.check("#slx-pick input[name=slx-lv][value=easy]")
            host.fill("#slx-pick #slx-name", "Mara Makes Pots")
            shot(host, "detail")
            host.click("#slx-use")

            # ---- 3: Customize ----
            host.wait_for_selector("#slx.slx--edit #slx-form input[data-path=name]", timeout=10000)
            assert Path(repo, "index.html").exists() and Path(repo, "site.json").exists() and Path(repo, "site.js").exists(), "the template went into the repo"
            assert Path(repo, "fonts", "instrument-serif-latin-400-normal.woff2").exists(), "fonts came along"
            assert "Mara Makes Pots" in Path(repo, "index.html").read_text(), "the name was filled in"
            assert "Link in bio" in git(repo, "log", "-1", "--pretty=%s"), "committed"
            frame = host.frame_locator("#slx-iframe")
            frame.locator("h1").wait_for(timeout=10000)
            assert frame.locator("h1").inner_text().strip() == "Mara Makes Pots"
            # Easy shows only the main colors and no looks/sections
            assert host.locator("#slx-form [data-preset]").count() == 0 and host.locator("#slx-form [data-sec]").count() == 0
            host.fill("#slx-form input[data-path=name]", "Mara O. Ceramics")
            host.wait_for_function("document.querySelector('#slx-site-name').textContent === 'Mara O. Ceramics'")
            frame.locator("h1", has_text="Mara O. Ceramics").wait_for(timeout=4000)
            host.fill("#slx-form input[data-path='links.0.label']", "Shop the December batch")
            frame.locator(".links a", has_text="Shop the December batch").wait_for(timeout=4000)
            host.click("#slx-form [data-add=links]")
            host.fill("#slx-form input[data-path='links.4.label']", "Studio newsletter")
            frame.locator(".links a", has_text="Studio newsletter").wait_for(timeout=4000)
            saved(host)
            sj = json.loads(Path(repo, "site.json").read_text())
            assert sj["name"] == "Mara O. Ceramics" and len(sj["links"]) == 5 and sj["links"][4]["label"] == "Studio newsletter", sj["links"]
            page_html = Path(repo, "index.html").read_text()
            assert "Mara O. Ceramics" in page_html and "Studio newsletter" in page_html, "the static page was re-rendered"
            shot(host, "easy")
            # Comfortable: a look and a hidden section
            host.click("#slx [data-lv=comfortable]")
            host.wait_for_selector("#slx-form [data-preset=night]")
            host.click("#slx-form [data-preset=night]")
            host.wait_for_function("(() => { const f = document.querySelector('#slx-iframe'); return true; })()")
            frame.locator("html[data-preset=night]").wait_for(state="attached", timeout=4000)
            host.uncheck("#slx-form input[data-sec='1']")
            frame.locator("[data-section=socials][hidden]").wait_for(state="attached", timeout=4000)
            saved(host)
            sj = json.loads(Path(repo, "site.json").read_text())
            assert sj["theme"]["preset"] == "night" and sj["theme"]["colors"]["accent"] == "#D7FF3A", sj["theme"]
            assert sj["sections"][1]["on"] is False
            assert 'data-preset="night"' in Path(repo, "index.html").read_text() and re.search(r'<section data-section="socials"[^>]*\shidden>', Path(repo, "index.html").read_text())
            shot(host, "comfortable")
            host.click("#slx [data-lv=pro]")
            host.wait_for_selector("#slx-form .slx-code code")
            assert "site.json" in host.inner_text("#slx-form .slx-code")
            host.click("#slx [data-slx=done]")
            host.wait_for_function("!document.querySelector('#slx')", timeout=8000)
            assert "Customize" in git(repo, "log", "-1", "--pretty=%s"), "Done saved a version"

            # ---- 4: Flint builds the merch template for free ----
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvf.is-open #flm-in-preview", timeout=10000)
            host.fill("#flm-in-preview", "make a merch store for Ember Socks")
            host.press("#flm-in-preview", "Enter")
            host.wait_for_function("[...document.querySelectorAll('#pvf .fl-thread > :not(.streaming)')].some(li => /Built a merch shop for Ember Socks/.test(li.innerText))", timeout=15000)
            mp = Path(repo, "builds", "ember-socks", "index.html")
            assert mp.exists(), "the shop went into builds/, not over the link page"
            assert "Ember Socks" in mp.read_text() and "Mara O. Ceramics" in Path(repo, "index.html").read_text()
            assert host.locator("#pvf .fl-thread [data-pvf=customize]").count() >= 1, "Flint offers Customize"
            host.locator("#pvf .fl-thread [data-pvf=customize]").last.click()
            host.wait_for_selector("#slx.slx--edit #slx-form input[data-path=name]", timeout=10000)
            assert host.input_value("#slx-form input[data-path=name]") == "Ember Socks"
            host.keyboard.press("Escape")
            host.wait_for_function("!document.querySelector('#slx')", timeout=8000)

            # ---- 5: every template renders, no errors, no sideways scroll on a phone ----
            for t in ids:
                ok(api(f"/projects/{aid}/site-library", "POST", {"template": t}, token=camp), t)
            pv = ok(api("/preview/token", "POST", {}, token=camp, project=aid))
            purl = pv["path"] if pv["path"].startswith("http") else BASE + pv["path"]
            phone = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pg = phone.new_page()
            perr = []
            pg.on("pageerror", lambda e: perr.append(f"{pg.url}: {e}"))
            pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and perr.append(f"{pg.url}: {m.text}"))
            # the first went to the top of the repo, the rest into builds/<slug>/
            sj_all = [Path(all_repo, "site.json")] + sorted(Path(all_repo, "builds").glob("*/site.json"))
            seen = set()
            for sjp in sj_all:
                meta = json.loads(sjp.read_text())["meta"]["title"]
                rel = "" if sjp.parent == Path(all_repo) else f"builds/{sjp.parent.name}/"
                pg.goto(purl + rel)
                pg.wait_for_load_state("load")
                over = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
                assert over <= 1, f"{meta}: {over}px sideways scroll on a phone"
                seen.add(meta)
            assert len(seen) == 16, seen
            assert not perr, perr
            phone.close()
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_site_templates: OK (16 templates, gallery + filters, Easy/Comfortable/Pro customize, Flint merch build, phones)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
