"""Website: every project gets its own public page (Docs & Files > Website), made from what the project already has.

  Host: a project with a repo (the one-click flow) -> bio, picture, vision, a screenshot, a remote, a commit by someone
        else -> Docs & Files > Website -> Build: site/index.html in the repo has the name, palette color, credits (names
        only, no emails), the https repo link, the screenshot, and the sandboxed preview shows it. The preview route
        sends a strict CSP + nosniff and needs a key or a signed preview token.
  Auto: "Keep it updated automatically" -> change the bio -> the page rebuilds by itself (file and preview).
  Escaping: a bio with <script> renders as text; the page has no script at all.
  Friend (second browser, project-scoped builder): fields are read-only, "Suggest an edit" -> a new tagline -> the host
        sees it, approves, the page updates; the friend cannot approve (403, no buttons).
  Phone 390px: editor above the preview, no sideways scroll. Overview: a small "Website" link once the page exists.
Usage: python app/test/e2e_website.py [--shots]
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4891 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return (r.status, data.decode(), dict(r.headers)) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        return (e.code, data.decode(), dict(e.headers)) if raw else (e.code, json.loads(data or b"{}"))


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def frame_text(page, text, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            f = page.frame_locator("#wb-frame")
            if text in f.locator("body").inner_text(timeout=1500): return
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError(f"preview never showed {text!r}")


def wait_file(path, cond, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        try:
            s = Path(path).read_text()
            if cond(s): return s
        except FileNotFoundError: pass
        time.sleep(0.3)
    raise AssertionError(f"{path} never matched")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e} {getattr(e, 'stack', '')}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "Content Security Policy" not in m.text and errors.append(f"{who} console: {m.text}"))


def shot(page, name):
    if SHOTS:
        page.wait_for_timeout(600)
        page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"website-{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-web-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_WEBSITE_POLL_MS": "700"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            host = hctx.new_page(); watch(host, "host")
            host.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'})) } catch (e) {}")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            tok = host.evaluate("TribeStore.get().server.token")

            # ---- a project with a repo (the one-click flow), its picture, bio, vision, a screenshot, a remote, someone else's commit
            st, r = api("/flow/create", "POST", {"name": "Pixel Quest"}, token=tok); assert st == 200, r
            pid, code = r["flow"]["project"], r["flow"]["invite"]["code"]
            repo = os.path.join(tmp, "workspaces", pid)
            for _ in range(100):
                if os.path.isdir(os.path.join(repo, ".git")) and any(x["id"] == pid and x["hasRepo"] for x in api("/projects", token=tok)[1]["projects"]): break
                time.sleep(0.2)
            else: raise AssertionError("the flow project never got its repo")
            logo = "data:image/png;base64," + base64.b64encode(png(8, 8, (56, 198, 177))).decode()
            st, r = api(f"/projects/{pid}", "PATCH", {"bio": "A cozy co-op platformer", "image": logo, "color": "#38C6B1"}, token=tok); assert st == 200, r
            st, r = api("/vision", "PUT", {"text": "# Pixel Quest\n\nA tiny platformer friends build together.\n\n- 3 levels\n- Local co-op"}, token=tok, project=pid); assert st == 200, r
            st, r = api("/visuals", "POST", {"screen": "Title screen", "png_base64": base64.b64encode(png(64, 40, (242, 107, 29))).decode()}, token=tok, project=pid); assert st == 200, r
            git = lambda *a: subprocess.run(["git", "-C", repo, *a], check=True, capture_output=True)
            git("remote", "add", "origin", "git@github.com:orion/pixel-quest.git")
            git("-c", "user.name=Lee Committer", "-c", "user.email=lee@example.com", "commit", "-q", "--allow-empty", "-m", "Add level 2")

            # ---- Docs & Files > Website
            host.evaluate("pid => TribeProjects.refresh().then(() => TribeProjects.switchTo(pid, 'home'))", pid)
            host.wait_for_function("pid => TribeProjects.current() === pid", arg=pid, timeout=10000)
            host.click("#nest-docs"); host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_selector("#view-tabs:not(.hidden) #wt-website")
            labels = host.evaluate("[...document.querySelectorAll('#view-tabs [data-tab]')].map(b => b.textContent.trim())"); assert labels[0] == "Files" and "Website" in labels, labels
            host.click("#wt-website"); host.wait_for_selector("#wb-root")
            wait_text(host, "#crumb-label", "Files › Website")
            assert host.evaluate("location.hash") == "#/docs/website"
            assert host.evaluate("document.querySelector('#nest-docs').classList.contains('on')")
            wait_text(host, ".wb-empty", "No page yet")
            assert host.get_attribute("#wb-tagline", "placeholder") == "A cozy co-op platformer"
            host.fill("#wb-headline", "Pixel Quest: jump together")
            host.click("#wb-build")
            host.wait_for_selector("#wb-frame", timeout=15000)
            site = os.path.join(repo, "site", "index.html")
            html = Path(site).read_text()
            for want in ["Pixel Quest: jump together", "A cozy co-op platformer", "#38C6B1", "Orion", "Lead", "Lee Committer", "https://github.com/orion/pixel-quest",
                         "Title screen", 'src="shots/title-screen.png"', "A tiny platformer friends build together.", "<li>Local co-op</li>", logo[:60], "prefers-color-scheme: dark"]:
                assert want in html, f"site/index.html has {want!r}"
            assert "lee@example.com" not in html and "@" not in html.split("<body>")[1].replace("&#39;", ""), "credits are names only, no emails"
            assert "<script" not in html.lower(), "the page needs no JavaScript"
            assert os.path.exists(os.path.join(repo, "site", "shots", "title-screen.png"))
            frame_text(host, "Pixel Quest: jump together"); frame_text(host, "Lee Committer")
            assert host.get_attribute("#wb-frame", "sandbox") == "allow-popups allow-popups-to-escape-sandbox"
            wait_text(host, "#wb-status", "site/index.html")
            wait_text(host, "#wb-hint", "GitHub Pages")
            shot(host, "desktop")
            # the preview route: strict CSP + nosniff, images inlined; no key, no page; a signed token works
            st, body, hdr = api(f"/projects/{pid}/website/preview", token=tok, raw=True)
            assert st == 200 and "sandbox" in hdr.get("Content-Security-Policy", "") and "default-src 'none'" in hdr["Content-Security-Policy"], hdr
            assert hdr.get("X-Content-Type-Options") == "nosniff" and "data:image/png;base64," in body and 'src="shots/' not in body
            assert api(f"/projects/{pid}/website/preview", raw=True)[0] == 401
            assert api(f"/projects/{pid}/website/preview?pt=pv1.bogusbogusbogus.bogusbogusbogusbogusbogus", raw=True)[0] == 403
            purl = api(f"/projects/{pid}/website", token=tok)[1]["website"]["previewUrl"]
            assert urllib.request.urlopen(BASE + purl, timeout=10).status == 200

            # ---- auto: change the bio, it rebuilds by itself
            host.click("#wb-auto"); host.wait_for_function("document.querySelector('#wb-auto').getAttribute('aria-checked') === 'true'")
            wait_text(host, "#wb-status", "auto")
            assert api(f"/projects/{pid}/website", token=tok)[1]["website"]["auto"] is True
            st, r = api(f"/projects/{pid}", "PATCH", {"bio": "Now with a boss fight"}, token=tok); assert st == 200, r
            wait_file(site, lambda s: "Now with a boss fight" in s)
            frame_text(host, "Now with a boss fight")
            # escaping: a bio with <script> is text
            api(f"/projects/{pid}", "PATCH", {"bio": "<script>alert(1)</script> & <b>bold</b>"}, token=tok)
            html = wait_file(site, lambda s: "alert(1)" in s)
            assert "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;" in html and "<script" not in html.lower(), "the bio is escaped"
            frame_text(host, "<script>alert(1)</script> & <b>bold</b>")
            api(f"/projects/{pid}", "PATCH", {"bio": "A cozy co-op platformer"}, token=tok)
            wait_file(site, lambda s: "alert(1)" not in s)

            # ---- a friend suggests a tagline, the host approves
            st, j = api("/join", "POST", {"code": code, "name": "Maya"}); assert st == 200, j
            ftok = j["token"]
            fctx = b.new_context(viewport={"width": 1280, "height": 820})
            fctx.add_init_script(settings_js("Maya", ftok, pid))
            fr = fctx.new_page(); watch(fr, "friend")
            fr.goto(BASE + "/?skipIntro=1#/docs/website")
            fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            fr.wait_for_selector("#wb-root", timeout=15000)
            assert fr.get_attribute("#wb-headline", "readonly") is not None, "friends can't edit the page directly"
            assert fr.locator("#wb-save").count() == 0
            fr.wait_for_selector("#wb-suggest")
            fr.select_option("#wb-sug-field", "tagline"); fr.fill("#wb-sug-text", "Jump, bonk, repeat. Together.")
            fr.click("#wb-sug-send")
            wait_text(fr, "#wb-sugs", "Jump, bonk, repeat. Together.")
            assert fr.locator("#wb-sugs [data-ok]").count() == 0, "no approve button for friends"
            sug = api(f"/projects/{pid}/website", token=ftok)[1]["website"]["suggestions"][0]
            assert sug["status"] == "open" and sug["byName"] == "Maya"
            st, r = api(f"/projects/{pid}/website/suggestions/{sug['id']}/approve", "POST", token=ftok); assert st == 403, (st, r)
            assert api(f"/projects/{pid}/website", "PUT", {"fields": {"tagline": "hijack"}}, token=ftok)[0] == 403
            chat = Path(tmp, "chat", f"p-{pid}"[:32] + ".jsonl").read_text()
            assert "Maya suggested a new tagline for the website" in chat, chat[-400:]
            wait_text(host, "#wb-sugs-title", "1 waiting")
            host.wait_for_selector(f"#wb-sugs [data-ok='{sug['id']}']")
            shot(host, "suggestion")
            host.click(f"#wb-sugs [data-ok='{sug['id']}']")
            wait_text(host, "#wb-sugs", "approved")
            wait_file(site, lambda s: "Jump, bonk, repeat. Together." in s)
            frame_text(host, "Jump, bonk, repeat. Together.")
            assert host.input_value("#wb-tagline") == "Jump, bonk, repeat. Together."
            wait_text(fr, "#wb-sugs", "approved")

            # ---- with the repo autopilot on, auto mode commits site/ (only site/)
            st, r = api("/repo/settings", "PUT", {"autopilot": {"enabled": True}}, token=tok, project=pid); assert st == 200, r
            Path(repo, "scratch.txt").write_text("not the website's business")
            st, r = api("/vision", "PUT", {"text": "# Pixel Quest\n\nCommitted by the autopilot."}, token=tok, project=pid); assert st == 200, r   # the tagline is set now, so the vision drives this change
            end = time.time() + 20
            while time.time() < end:
                logl = subprocess.run(["git", "-C", repo, "log", "-1", "--format=%s", "--name-only"], capture_output=True, text=True).stdout
                if logl.startswith("TribeCode: update the website") and "site/index.html" in logl: break
                time.sleep(0.4)
            else: raise AssertionError(f"auto mode never committed site/: {logl!r}")
            assert "scratch.txt" not in logl, "only site/ is committed"
            assert "Committed by the autopilot" in subprocess.run(["git", "-C", repo, "show", "HEAD:site/index.html"], capture_output=True, text=True).stdout
            assert subprocess.run(["git", "-C", repo, "status", "--porcelain", "--", "site"], capture_output=True, text=True).stdout.strip() == ""

            # ---- the overview links to it
            host.evaluate("TribeApp.show('home')")
            host.wait_for_selector("#pj-site", timeout=10000)
            host.click("#pj-site"); host.wait_for_selector("#view-website:not(.hidden) #wb-root")

            # ---- phone 390px: editor above the preview, no sideways scroll
            pctx = b.new_context(**PHONE); pctx.add_init_script(settings_js("Orion", tok, pid))
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1#/docs/website")
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            ph.wait_for_selector("#wb-root", timeout=15000); ph.wait_for_selector("#wb-frame")
            ph.wait_for_timeout(500)
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), ph.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            ed, pv = ph.locator(".wb-edit").bounding_box(), ph.locator(".wb-preview").bounding_box()
            assert pv["y"] >= ed["y"] + ed["height"] - 1 and pv["x"] >= 0 and pv["x"] + pv["width"] <= 391, (ed, pv)
            frame_text(ph, "Jump, bonk, repeat. Together.")
            shot(ph, "phone")
            ph.locator(".wb-preview").scroll_into_view_if_needed(); shot(ph, "phone-preview")
            # the phone's Docs shows the same two tabs
            ph.click('#tabbar [data-nav="docs"]'); ph.wait_for_selector("#view-tabs:not(.hidden) #wt-website")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E website test passed")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
