"""Customize + the site generator (feat/customize).

  Look:   tribe accent + background persist (server) and apply (CSS vars, pattern on .main), the contrast guard refuses
          bad accents (server 400, personal on a theme where it can't be seen), personal overrides win on this device
          only, project theme override, font size, the Dashboard cover (color, then the GitHub preview fetched by the
          host from a stand-in, cached in .tribe/look, offered only once the repo has a github.com remote).
  Site:   Design it for me -> a valid HTML draft with every section from seeded project data (vision bullets, a
          milestone, a commit, a screenshot, the team, a play link), Shuffle changes the layout, the mock brain
          improves the copy (hype words dropped), a hand edit survives Regenerate, a builder can't publish, the host
          publishes (site/index.html + site/fonts), export is one self-contained file, MCP tools, Flint "make our website".
  Phone 390: Dashboard with cover (about 96px) and the Customize sheet, no sideways scroll. No console errors.
Usage: python app/test/e2e_customize.py [--shots]
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib, base64
from html.parser import HTMLParser
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, MOCK = 5090 + OFF, 11690 + OFF
BASE, MBASE = f"http://localhost:{PORT}", f"http://localhost:{MOCK}"
SHOTS = "--shots" in sys.argv
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path if path.startswith("/") and not path.startswith("/api") else BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            return (r.status, data.decode(), dict(r.headers)) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        return (e.code, data.decode(), dict(e.headers)) if raw else (e.code, json.loads(data or b"{}"))


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class Check(HTMLParser):
    """Tag balance + the bits a valid page needs."""
    VOID = {"meta", "link", "img", "br", "hr", "input", "source", "area", "base", "col", "embed", "track", "wbr", "rect", "circle", "line", "path", "polygon", "ellipse"}
    def __init__(self):
        super().__init__(); self.stack, self.ids, self.h1, self.bad, self.tags = [], [], 0, [], set()
    def handle_starttag(self, t, a):
        self.tags.add(t); d = dict(a)
        if "id" in d: self.ids.append(d["id"])
        if t == "h1": self.h1 += 1
        if t not in self.VOID: self.stack.append(t)
    def handle_startendtag(self, t, a):
        self.tags.add(t); d = dict(a)
        if "id" in d: self.ids.append(d["id"])
    def handle_endtag(self, t):
        if t in self.VOID: return
        if not self.stack or self.stack[-1] != t: self.bad.append(f"</{t}> but open {self.stack[-3:]}"); return
        self.stack.pop()


def valid(html):
    assert html.lstrip().lower().startswith("<!doctype html>"), "doctype"
    c = Check(); c.feed(html)
    assert not c.bad and not c.stack, (c.bad[:3], c.stack[-3:])
    assert c.h1 == 1, f"one h1, got {c.h1}"
    assert len(c.ids) == len(set(c.ids)), "duplicate ids"
    for t in ["title", "main", "header", "footer"]: assert t in c.tags, t
    assert '<html lang="en">' in html and 'name="viewport"' in html
    assert "<script" not in html.lower()
    return c


def wait(page, js, arg=None, timeout=15000):
    page.wait_for_function(js, arg=arg, timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "Content Security Policy" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid, extra=""):
    return (f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'campfire', themePicked:true, server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}{extra}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def shot(page, name):
    if SHOTS:
        page.wait_for_timeout(500)
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"customize-{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-cust-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_OG_BASE": MBASE + "/og", "TRIBE_GH_API": MBASE + "/gh"}
    mlog = open(os.path.join(tmp, "mock.log"), "w+"); log = open(os.path.join(tmp, "server.log"), "w+")
    mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(MOCK)], stdout=mlog, stderr=subprocess.STDOUT)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", MBASE], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            hctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', theme: 'campfire', themePicked: true})) } catch (e) {}")
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            wait(host, "window.TribeClient && TribeClient.connected()")
            tok = host.evaluate("TribeStore.get().server.token")

            # ---- a seeded project: repo, bio, vision bullets, screenshot, milestone, a commit, a play link
            st, r = api("/flow/create", "POST", {"name": "Pixel Quest"}, token=tok); assert st == 200, r
            pid, code = r["flow"]["project"], r["flow"]["invite"]["code"]
            repo = os.path.join(tmp, "workspaces", pid)
            for _ in range(100):
                if os.path.isdir(os.path.join(repo, ".git")) and any(x["id"] == pid and x["hasRepo"] for x in api("/projects", token=tok)[1]["projects"]): break
                time.sleep(0.2)
            else: raise AssertionError("no repo")
            api(f"/projects/{pid}", "PATCH", {"bio": "A cozy co-op pixel art platformer", "color": "#38C6B1"}, token=tok)
            st, r = api("/vision", "PUT", {"text": "# Pixel Quest\n\nA tiny platformer friends build together.\n\n- Three levels: grass, caves and sky\n- Local co-op: two players, one keyboard\n- Pixel art: drawn by hand"}, token=tok, project=pid); assert st == 200, r
            st, r = api("/visuals", "POST", {"screen": "Title screen", "png_base64": base64.b64encode(png(64, 40, (242, 107, 29))).decode()}, token=tok, project=pid); assert st == 200, r
            Path(tmp, "projects", pid, "milestones.json").write_text(json.dumps([{"version": "v0.1", "title": "First playable level", "status": "planned"}]))
            git = lambda *a: subprocess.run(["git", "-C", repo, *a], check=True, capture_output=True)
            git("-c", "user.name=Lee Committer", "-c", "user.email=lee@example.com", "commit", "-q", "--allow-empty", "-m", "Add the cave level")
            st, r = api(f"/projects/{pid}/website", "PUT", {"fields": {"playUrl": "https://example.com/play"}}, token=tok); assert st == 200, r

            # ======== LOOK ========
            assert api("/look", "PUT", {"tribe": {"accent": "#2A2A2A"}}, token=tok)[0] == 400, "dark accent refused on the default theme"
            assert api("/look", "PUT", {"tribe": {"accent": "#FFFFFG"}}, token=tok)[0] == 400
            assert api("/look", "PUT", {"tribe": {"bg": {"kind": "image", "image": "data:image/png;base64," + base64.b64encode(png(8, 8, (255, 255, 255))).decode(), "dim": 0.3}}}, token=tok)[0] == 400, "an undimmed picture is refused"
            assert api("/look", token=tok)[1]["github"].get(pid) is None, "no GitHub cover option before a github.com remote"
            host.evaluate("pid => TribeProjects.refresh().then(() => TribeProjects.switchTo(pid, 'home'))", pid)
            wait(host, "pid => TribeProjects.current() === pid", pid)
            host.wait_for_selector("#pj-overview .pj-title2")
            # open Customize from the project menu
            host.evaluate("TribeShell.switcher(document.querySelector('#pj-rail [data-pj-open]'))")
            assert host.locator("#project-menu [data-dest='customize']").count() == 1, "the project menu has Customize"
            host.keyboard.press("Escape"); host.mouse.click(700, 500)
            host.locator(f"#pj-rail [data-pj-open='{pid}']").first.dispatch_event("contextmenu")
            host.click("#rail-menu [data-rc='customize']")
            host.wait_for_selector("#look-modal:not(.hidden) .lk-tab.on")
            assert host.evaluate("document.querySelector('.lk-tab.on').dataset.ltab") == "project"
            host.click("[data-ltab='tribe']")
            host.click("[data-tacc='#8EC07C']")
            wait(host, "document.body.dataset.lkAcc")
            live = host.evaluate("getComputedStyle(document.body).getPropertyValue('--live').trim().toUpperCase()")
            assert live == host.evaluate("document.body.dataset.lkAcc") == "#8EC07C", live
            host.click("[data-tbg='pattern:stars']")
            wait(host, "document.body.dataset.lkBg === 'pattern:stars'")
            assert "svg" in host.evaluate("getComputedStyle(document.querySelector('.main')).backgroundImage")
            host.click("[data-tfs='l']"); wait(host, "document.documentElement.dataset.fs === 'l'")
            host.click("[data-tden='compact']"); wait(host, "document.body.classList.contains('compact')")
            host.fill("#lk-emoji", "🔥"); host.press("#lk-emoji", "Tab")
            wait(host, "getComputedStyle(document.querySelector('#ws-name'), '::before').content.includes('🔥')")
            t = api("/look", token=tok)[1]["look"]["tribe"]
            assert t["accent"] == "#8EC07C" and t["bg"] == {"kind": "pattern", "id": "stars"} and t["fontSize"] == "l" and t["density"] == "compact" and t["emoji"] == "🔥", t
            shot(host, "tribe")
            # personal override (Just me): a different accent on this device only; then a bad one is refused
            host.click("[data-ltab='me']")
            host.click("[data-macc='#FF8FA6']")
            wait(host, "document.body.dataset.lkAcc === '#FF8FA6'")
            assert api("/look", token=tok)[1]["look"]["tribe"]["accent"] == "#8EC07C", "personal choices stay on this device"
            host.evaluate("() => { const i = document.querySelector('[data-macc-custom]'); i.value = '#1e1e1e'; i.dispatchEvent(new Event('change')); }")
            host.wait_for_selector("#lk-warn:not(.hidden)")
            assert "hard to see" in host.inner_text("#lk-warn")
            assert host.evaluate("TribeStore.get().look.accent") == "#FF8FA6"
            assert host.evaluate("TribeLook.check('tint', 'ember')") == "", "palette tints keep body text legible"
            host.click("[data-macc='']")   # back to the tribe's
            wait(host, "document.body.dataset.lkAcc === '#8EC07C'")
            # on a light theme: lime can't be seen, so it is refused for you, and the tribe accent is nudged darker
            host.evaluate("() => { TribeStore.set(TribeThemes.pick('light')); TribeApp.applyTheme(); }")
            wait(host, "document.body.dataset.theme === 'light' && document.body.dataset.lkAcc && document.body.dataset.lkAcc !== '#8EC07C'")
            ok = host.evaluate("""() => { const h = document.body.dataset.lkAcc, cs = getComputedStyle(document.body);
                const L = c => { const v = c.match(/\\w\\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
                const R = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
                return Math.min(R(h, cs.getPropertyValue('--canvas').trim()), R(h, cs.getPropertyValue('--surface').trim())); }""")
            assert ok >= 3, f"adapted accent {ok}"
            host.click("[data-macc='#B8E05A']")
            host.wait_for_selector("#lk-warn:not(.hidden)")
            assert host.evaluate("TribeStore.get().look.accent") in (None, ""), "lime on Light is refused"
            host.evaluate("() => { TribeStore.set(TribeThemes.pick('campfire')); TribeApp.applyTheme(); }")
            wait(host, "document.body.dataset.theme === 'campfire'")
            # project: theme override + a colored cover
            host.click("[data-ltab='project']")
            host.click("[data-pth='nordic']")
            wait(host, "document.body.dataset.theme === 'nordic'")
            host.click("[data-cov='color:#38C6B1']")
            host.wait_for_selector("#pj-overview .lk-banner.k-color")
            assert "56, 198, 177" in host.evaluate("getComputedStyle(document.querySelector('.lk-banner')).backgroundColor")
            assert host.locator("#lk-gh").count() == 0, "no GitHub option without a github.com remote"
            # the GitHub remote appears -> the option shows; the host fetches + caches the preview
            git("remote", "add", "origin", "git@github.com:orion/pixel-quest.git")
            time.sleep(0.2)
            host.evaluate("TribeLook.load()")
            for _ in range(80):
                if api("/look", token=tok)[1]["github"].get(pid) == "orion/pixel-quest": break
                time.sleep(0.5)
            else: raise AssertionError("github option never showed")
            host.evaluate("TribeLook.load()")
            host.wait_for_selector("#lk-gh", timeout=20000)
            host.click("#lk-gh")
            host.wait_for_selector("#pj-overview .lk-banner.k-github", timeout=15000)
            assert os.path.exists(os.path.join(tmp, ".tribe", "look", f"cover-{pid}.png")), "cached in .tribe/look"
            calls = json.loads(urllib.request.urlopen(MBASE + "/calls").read())
            assert any(c.get("kind") == "og" and c.get("repo") == "orion/pixel-quest" for c in calls), calls[-3:]
            assert "data:image/png" in host.evaluate("document.querySelector('.lk-banner').style.backgroundImage"), "the browser never hotlinks GitHub"
            host.click("#lk-close")
            host.hover("#pj-overview .lk-banner"); host.wait_for_selector("#lk-cover-btn", state="visible")
            shot(host, "cover")
            # reload: everything persists
            host.reload(); wait(host, "window.TribeClient && TribeClient.connected()")
            wait(host, "pid => TribeProjects.current() === pid", pid)
            try: wait(host, "document.body.dataset.theme === 'nordic'")
            except Exception:
                print("DEBUG", str(api("/look", token=tok))[:300], host.evaluate("({view: document.body.dataset.view, theme: document.body.dataset.theme, cur: TribeProjects.current(), proj: (TribeLook.state().server||{look:{}}).look.projects, mine: TribeLook.state().mine, patched: !!TribeThemes._lk})")); raise
            wait(host, "document.body.dataset.lkAcc && document.body.dataset.lkBg === 'pattern:stars' && document.documentElement.dataset.fs === 'l'")
            assert host.evaluate("TribeLook.state().effective.accent") == "#8EC07C"
            # a friend (builder) sees it; Just me can opt out of project themes
            st, j = api("/join", "POST", {"code": code, "name": "Maya"}); assert st == 200, j
            ftok = j["token"]
            assert api("/look", "PUT", {"tribe": {"name": "Hijack"}}, token=ftok)[0] == 403, "only the host renames the tribe"

            # ======== SITE GENERATOR ========
            host.evaluate("() => { TribeShell.go('website'); }")
            host.wait_for_selector("#wb-root #sg-make")
            host.click("#sg-make")
            host.wait_for_selector(".sg-lay.on")
            w = api(f"/projects/{pid}/website", token=tok)[1]["website"]["gen"]
            first = w["draft"]["layout"]
            st, html, hdr = api(w["draftUrl"], raw=True); assert st == 200, html[:200]
            assert "font-src data:" in hdr["Content-Security-Policy"]
            c = valid(html)
            for sec in ["top", "story", "features", "gallery", "play", "devlog", "roadmap", "team", "faq"]: assert sec in c.ids, f"section {sec} missing ({c.ids})"
            for want in ["Pixel Quest", "A cozy co-op pixel art platformer", "Three levels", "Grass, caves and sky", "First playable level", "Add the cave level", "Orion", "Title screen", "https://example.com/play", "data:font/woff2;base64,", "data:image/png;base64,"]:
                assert want in html, f"draft has {want!r}"
            assert "lee@example.com" not in html
            assert "gradient" not in html.lower(), "flat: no gradients"
            host.wait_for_function("document.querySelector('#wb-frame') && document.querySelector('#wb-frame').dataset.key.startsWith('draft:')")
            # Shuffle: another layout
            host.click("#sg-shuffle")
            wait(host, "f => document.querySelector('.sg-lay.on').dataset.lay !== f", first)
            w2 = api(f"/projects/{pid}/website", token=tok)[1]["website"]["gen"]
            assert w2["draft"]["layout"] != first
            html2 = api(w2["draftUrl"], raw=True)[1]
            assert f'class="l-{w2["draft"]["layout"]}"' in html2 and f'class="l-{first}"' not in html2
            valid(html2)
            # every layout renders valid HTML
            for lay in [x["id"] for x in w2["layouts"]]:
                st, r = api(f"/projects/{pid}/website/gen", "PUT", {"layout": lay}, token=tok); assert st == 200, r
                valid(api(r["website"]["gen"]["draftUrl"], raw=True)[1])
            # Write it for me (mock brain): better lines in, hype dropped
            host.click("#sg-write")
            wait(host, "document.querySelector('#sg-status') && document.querySelector('#sg-status').textContent.includes('polished by')", timeout=30000)
            copy = api(f"/projects/{pid}/website", token=tok)[1]["website"]["gen"]["draft"]["copy"]
            assert copy["features"]["items"][0]["body"] == "Brain line 1: simple and warm.", copy["features"]
            assert copy["hero"]["dek"] == "Jump through three small levels with a friend on the couch.", copy["hero"]
            assert "revolutionary" not in json.dumps(copy).lower() and copy["story"]["title"] == "Why we made it"
            assert json.dumps(copy).count("🎮") <= 1
            # per-section edit (UI), kept through Regenerate
            host.click("[data-sgmode='guided']"); host.click("[data-sgstep='3']")   # feat/site-builder: sections live in Guided step 3
            host.click("[data-sgedit='hero']"); host.wait_for_selector(".sg-ed [data-f='title']")
            host.fill(".sg-ed [data-f='title']", "Jump together")
            host.click("[data-sgsave]")
            host.wait_for_selector(".sg-sec .sg-tag")
            host.click("#sg-regen"); time.sleep(0.6)
            gen = api(f"/projects/{pid}/website", token=tok)[1]["website"]["gen"]
            assert gen["draft"]["copy"]["hero"]["title"] == "Jump together" and gen["draft"]["edited"]["hero"]
            assert "Jump together" in api(gen["draftUrl"], raw=True)[1]
            # sections can be switched off
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"off": {"faq": True}}, token=tok); assert st == 200
            assert 'id="faq"' not in api(r["website"]["gen"]["draftUrl"], raw=True)[1]
            # publishing: a builder can't, the host can
            assert api(f"/projects/{pid}/website/publish", "POST", token=ftok)[0] == 403
            host.click("#sg-publish")
            wait(host, "document.querySelector('#sg-status') && document.querySelector('#sg-status').textContent.includes('Published')", timeout=20000)
            site = Path(repo, "site", "index.html").read_text()
            assert "TribeCode site generator" in site and "Jump together" in site and 'href="styles.css"' in site
            assert "url('fonts/" in Path(repo, "site", "styles.css").read_text()   # feat/site-builder: the look is in styles.css
            assert any(Path(repo, "site", "fonts").glob("*.woff2")) and Path(repo, "site", "fonts", "inter-latin-400-normal.woff2").exists()
            valid(site)
            purl = api(f"/projects/{pid}/website", token=tok)[1]["website"]["previewUrl"]
            assert "data:font/woff2" in api(purl, raw=True)[1]
            # export: one self-contained file
            st, ex, hdr = api(f"/api/projects/{pid}/website/export", token=tok, raw=True)
            assert st == 200 and "attachment" in hdr["Content-Disposition"] and "pixel-quest-website.html" in hdr["Content-Disposition"]
            assert "data:font/woff2" in ex and 'src="shots/' not in ex
            # MCP: a connected Claude drafts and asks; it never publishes
            def mcp(name, args):
                req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": {**args, "project": pid}}}).encode(),
                                             headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + tok})
                return json.loads(urllib.request.urlopen(req, timeout=30).read())["result"]["content"][0]["text"]
            assert "Editorial" in mcp("website_draft", {"layout": "editorial"})
            assert "Updated the story section" in mcp("website_edit_section", {"section": "story", "title": "How it started", "body": "We wanted a small game to play together."})
            assert "review" in mcp("website_request_publish", {"note": "New story"}).lower() or "Asked" in mcp("website_request_publish", {})
            assert api(f"/projects/{pid}/website", token=tok)[1]["website"]["gen"]["unpublished"] is True
            # Flint: "make our website"
            host.evaluate("TribeFlint.ask('shuffle our website layout')")
            wait(host, "TribeFlint.thread().some(m => m.who === 'flint' && /draft in the/.test(m.text))", timeout=15000)

            # ======== PHONE 390 ========
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", tok, pid))
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            wait(ph, "window.TribeClient && TribeClient.connected()")
            wait(ph, "pid => window.TribeProjects && TribeProjects.current() === pid", pid)
            ph.evaluate("TribeApp.show('home')")
            ph.wait_for_selector("#pj-overview .lk-banner", timeout=15000)
            hgt = ph.evaluate("document.querySelector('.lk-banner').getBoundingClientRect().height")
            assert 90 <= hgt <= 110, hgt
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390, "no sideways scroll on the Dashboard"
            ph.evaluate("TribeLook.open('tribe')"); ph.wait_for_selector("#look-modal:not(.hidden) .lk-tiles")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390
            assert ph.evaluate("(() => { const c = document.querySelector('.lk-card'); return c.scrollWidth <= c.clientWidth + 1; })()"), "the sheet fits"
            shot(ph, "phone")
            ph.click("[data-ltab='project']"); ph.wait_for_selector(".lk-ban")
            assert ph.evaluate("(() => { const c = document.querySelector('.lk-card'); return c.scrollWidth <= c.clientWidth + 1; })()")
            ph.evaluate("TribeLook.open('tribe'); document.querySelector('#lk-close').click(); TribeShell.go('website')")
            ph.wait_for_selector("#wb-root .sg-lay")
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390, "Website + generator fit at 390"
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_customize: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate(); mock.terminate()


if __name__ == "__main__":
    main()
