"""The website designer (app/ui/sitedesigner.js, app/ui/sitecfg.js, server/sitedesign.js), rebuilt on OpenPage's model.

  Files › Website › Open the designer opens it; the start screen shows the 16 templates.
  Flint, no AI: "link tree website" makes the link-in-bio template; "add a page called Shop" adds a page with nav;
  clicking a button in the live preview and "link this button to the shop page" wires it (the config says so and the
  preview's link points at the page); "replace the image" opens the file chooser and the picture lands in the config;
  "make the picture round"; "dark mode" is a real dark variant (the preview's background turns dark); Undo brings
  light back and Redo dark again; inline text editing in the preview is saved and undoable; a block is added from the
  picker and moved; "make the buttons work" wires every button.
  Download HTML: one standalone index.html (no scripts, no outside URLs, pictures inside) that opens from disk, shows the
  home page and goes to the Shop page from the menu; the zip has one file per page and assets/.
  The config is saved on the host; Save version puts it on the Saved shelf (designer: true) and Restore brings it back.
  Preview › Website has Design. "make it purple" changes the accent; an unknown ask shows the one AI-boost card with
  "Use my AI" and "Get credits / Premium". Phone 390px: no sideways scroll. No console errors.
Usage: python app/test/e2e_site_designer.py [--shots]   (--shots writes docs/screenshots/site-designer*.png)
"""
import base64, io, json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5480 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors = []
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGklEQVR4nGP4z8DwnwEKGBgYmBgY0AUQAgB9xwP9a7f1YQAAAABJRU5ErkJggg==")


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def ask(page, text):
    n = page.evaluate("TribeSiteDesigner.state().log.length")
    page.fill("#wdz-in", text)
    page.press("#wdz-in", "Enter")
    page.wait_for_function("n => TribeSiteDesigner.state().log.length >= n + 2", arg=n, timeout=10000)
    page.wait_for_timeout(250)
    return page.locator("#wdz-log > *").last.inner_text()


def cfg(page):
    return page.evaluate("TribeSiteDesigner.cfg()")


def frame(page):
    page.wait_for_timeout(350)
    return page.frame_locator("#wdz-frame")


def shot(page, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(600)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(out / name))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sd-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Site Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        assert api("/site-designer/templates")[0] == 401, "members only"
        tl = ok(api("/site-designer/templates", token=tok))["templates"]
        assert len(tl) == 16, len(tl)
        lb = ok(api("/site-designer/template/linkbio", token=tok))["config"]
        assert lb["pages"][0]["blocks"][0]["type"] == "links" and lb["pages"][0]["blocks"][0]["props"]["img"].startswith("data:image/"), "template pictures are inlined"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1#/docs/website")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.wait_for_selector("#wb-design", timeout=15000)
            pg.click("#wb-design")
            pg.wait_for_selector("#wdz:not([hidden]) #wdz-start:not([hidden]) .wdz-tpl", timeout=10000)
            assert pg.locator("#wdz-start .wdz-tpl").count() == 16, "16 templates"

            # ---- "link tree website" -> the link-in-bio template
            out = ask(pg, "link tree website")
            assert "link" in out.lower(), out
            c = cfg(pg)
            assert c["template"] == "linkbio" and c["pages"][0]["blocks"][0]["type"] == "links", c["pages"][0]["blocks"]
            assert pg.is_hidden("#wdz-start")
            frame(pg).locator("h1").first.wait_for(timeout=5000)
            assert "Mara Okafor" in frame(pg).locator("h1").first.inner_text()

            # ---- a new page, and a button wired to it
            out = ask(pg, "add a page called Shop")
            assert "Shop" in out, out
            assert [x["title"] for x in cfg(pg)["pages"]] == ["Home", "Shop"]
            pg.click("#wdz-pages .wdz-tab >> text=Home")
            fr = frame(pg)
            fr.locator("[data-btn]").nth(1).click()
            pg.wait_for_function("TribeSiteDesigner.state().sel && TribeSiteDesigner.state().sel.kind === 'button'", timeout=4000)
            assert pg.is_visible("#wdz-link"), "the button inspector"
            out = ask(pg, "link this button to the shop page")
            assert "Shop page" in out, out
            item = cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][1]
            assert item["link"] == {"kind": "page", "to": "shop"}, item
            assert frame(pg).locator("[data-btn]").nth(1).get_attribute("href") == "#p-shop"

            # ---- replace the image (upload) and make it round
            frame(pg).locator("[data-img]").first.click()
            pg.wait_for_function("TribeSiteDesigner.state().sel && TribeSiteDesigner.state().sel.kind === 'image'", timeout=4000)
            with pg.expect_file_chooser() as fc:
                ask(pg, "replace the image")
            fc.value.set_files({"name": "mara.png", "mimeType": "image/png", "buffer": PNG})
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.img.startsWith('data:image/png')", timeout=5000)
            ask(pg, "make the picture round")
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["shape"] == "round"
            out = ask(pg, "set the alt text to Mara at the wheel")
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["alt"] == "Mara at the wheel", out

            # ---- inline text editing in the preview
            h1 = frame(pg).locator("h1[data-e]").first
            h1.click(); h1.press("Control+a"); h1.type("Mara Makes Pots"); h1.press("Enter")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.name === 'Mara Makes Pots'", timeout=4000)

            # ---- blocks: the picker, drag-free move, "make the buttons work"
            pg.click("[data-wdz='picker']")
            pg.click("#wdz-picker [data-add='gallery'][data-v='masonry']")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.type === 'gallery' && b.variant === 'masonry')", timeout=4000)
            gi = next(i for i, x in enumerate(cfg(pg)["pages"][0]["blocks"]) if x["type"] == "gallery")
            pg.click(f"#wdz-blocks .wdz-blk:nth-child({gi + 1}) [data-move='up']")
            assert cfg(pg)["pages"][0]["blocks"][gi - 1]["type"] == "gallery", "moved up"
            out = ask(pg, "make the buttons work")
            assert "Wired" in out or "already goes somewhere" in out, out

            # ---- dark mode: a real theme variant; undo and redo
            out = ask(pg, "dark mode")
            assert cfg(pg)["theme"]["mode"] == "dark", out
            bg = frame(pg).locator("body").evaluate("e => getComputedStyle(e).backgroundColor")
            nums = [int(x) for x in re.findall(r"\d+", bg)[:3]]
            assert sum(nums) / 3 < 60, f"the preview is dark: {bg}"
            pg.click("[data-wdz='undo']")
            assert cfg(pg)["theme"]["mode"] == "light"
            pg.click("[data-wdz='redo']")
            assert cfg(pg)["theme"]["mode"] == "dark"
            ask(pg, "undo")
            assert cfg(pg)["theme"]["mode"] == "light", "Flint's undo"
            out = ask(pg, "make it purple")
            assert "purple" in out, out

            # ---- the one AI-boost card for what needs an AI
            ask(pg, "write me a heartfelt paragraph about why my pottery matters")
            card = pg.locator("#wdz-log .boost").last
            assert card.is_visible(), "the boost card"
            t = card.inner_text()
            assert "Use my AI" in t and "Get credits / Premium" in t and "Free · no AI" in t.replace("FREE · NO AI", "Free · no AI") or "free" in t.lower(), t
            assert "Send to my AI helper" not in pg.content()

            # ---- saved on the host
            pg.wait_for_timeout(700)
            saved = ok(api(f"/projects/{pid}/site-config", token=tok))["config"]
            assert [x["title"] for x in saved["pages"]] == ["Home", "Shop"] and saved["template"] == "linkbio"

            # ---- Download HTML: one standalone file that opens from disk
            with pg.expect_download() as dl:
                pg.click("#wdz-dl")
            path = dl.value.path()
            html = Path(path).read_text()
            assert dl.value.suggested_filename == "index.html"
            assert "<script" not in html.lower(), "no scripts"
            assert not re.search(r"""(src|href)=["']https?://(?!example\.com)""", html), "nothing loaded from outside"
            assert 'id="p-shop"' in html and "data:image/png" in html and "Mara Makes Pots" in html
            loc = Path(tmp) / "export.html"; loc.write_text(html)
            v = ctx.new_page(); watch(v, "export")
            v.goto(loc.as_uri())
            assert v.locator(".pg-home h1").inner_text() == "Mara Makes Pots"
            assert v.is_hidden("#p-shop"), "only the home page shows"
            v.click(".pg-home nav >> text=Shop")
            v.wait_for_timeout(200)
            assert v.is_visible("#p-shop") and v.is_hidden(".pg-home"), "the menu goes to the Shop page"
            v.close()

            # ---- the zip: pages and assets
            pg.click("[data-wdz='dlmenu']")
            with pg.expect_download() as dl:
                pg.click("#wdz-dlmenu [data-wdz='dl-zip']")
            z = zipfile.ZipFile(dl.value.path())
            names = z.namelist()
            assert "index.html" in names and "shop.html" in names and "site.json" in names and any(n.startswith("assets/") for n in names), names
            assert 'href="shop.html"' in z.read("index.html").decode()

            # ---- versions keep the config
            pg.click("[data-wdz='save']")
            pg.wait_for_function("TribeSiteDesigner.state().log.slice(-1)[0].text.includes('Saved shelf')", timeout=5000)
            vs = ok(api(f"/projects/{pid}/website/versions", token=tok))
            vd = [x for x in vs["saved"] if x.get("designer")]
            assert vd and vd[0]["thumb"].startswith("data:image/svg+xml"), vs["saved"]
            ask(pg, "delete the shop page")
            pg.wait_for_timeout(700)
            assert len(ok(api(f"/projects/{pid}/site-config", token=tok))["config"]["pages"]) == 1
            ok(api(f"/projects/{pid}/website/versions/{vd[0]['id']}/restore", "POST", {}, token=tok), "restore")
            assert len(ok(api(f"/projects/{pid}/site-config", token=tok))["config"]["pages"]) == 2, "restore brings the config back"
            r = ok(api(f"/projects/{pid}/site-config/publish", "POST", {}, token=tok), "publish")
            assert "index.html" in r["files"] and "shop.html" in r["files"], r

            # ---- screenshots for the docs: the café template, light and dark, a button selected
            if SHOTS:
                pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', template: 'cafe' }})")
                pg.wait_for_function("TribeSiteDesigner.cfg().template === 'cafe'", timeout=8000)
                frame(pg).locator("[data-btn]").first.click()
                pg.wait_for_timeout(300)
                ask(pg, "link this button to the menu page")
                shot(pg, "site-designer.png")
                ask(pg, "dark mode")
                shot(pg, "site-designer-dark.png")

            # ---- Preview › Website has Design; the designer closes back
            pg.click("[data-wdz='close']")
            assert pg.is_hidden("#wdz")
            pg.evaluate("TribePreview.open()")
            pg.wait_for_selector("#pvw .pvw-design", state="attached", timeout=8000)

            # ---- phone
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.add_init_script(settings_js("Mara", tok, pid))
            m = ph.new_page(); watch(m, "phone")
            m.goto(BASE + "/?skipIntro=1")
            m.wait_for_function("window.TribeSiteDesigner && TribeClient.connected()", timeout=20000)
            m.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})")
            m.wait_for_selector("#wdz:not([hidden]) #wdz-frame", timeout=8000)
            m.wait_for_timeout(500)
            sw = m.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            assert sw[0] <= sw[1] + 1, f"no sideways scroll: {sw}"
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_site_designer: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
