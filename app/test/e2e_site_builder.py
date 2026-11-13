"""The site builder (feat/site-builder): brand kit, site types, three levels, human-editable files, themes, suggestions.

  Brand:    PUT/GET /website/brand: colors, font pair, wordmark, logo (PNG; a scripted SVG is refused), a too-light color is
            fixed for contrast with a plain note, a builder can't change the brand.
  Types:    every kind (game, app, portfolio, business, event, docs) renders valid HTML with its own sections (business shows
            hours + address, event shows date + place + RSVP), facts are cleaned (an http RSVP is refused).
  Instant:  one call makes a typed draft ("a site for my bakery" -> Small business); Flint does the same from a sentence.
  Themes:   one tap sets layout + palette + font pair; the theme list puts what this project picked first.
  Suggest:  "Suggest for me" falls back to rules with no model on: a card (theme, type, palette, font, order, tagline, why),
            nothing applied until Apply; Not now is remembered and the next suggestion changes; Apply is remembered too.
  Publish:  site/index.html (section markers, styles.css linked, no inline styles) + site/styles.css (commented :root brand
            tokens) + fonts + logo; a hand edit is detected (409), Keep skips that file, Replace overwrites; Export stays one file.
  UI:       Instant -> Guided steps -> Code view, at 1440 and 390 (no sideways scroll). No console errors.
Usage: python app/test/e2e_site_builder.py
"""
import base64, json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from html.parser import HTMLParser
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5580 + OFF
BASE = f"http://localhost:{PORT}"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []


def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    url = BASE + path if path.startswith("/api") else BASE + "/api" + path
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
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
    VOID = {"meta", "link", "img", "br", "hr", "input", "source", "area", "base", "col", "embed", "track", "wbr", "rect", "circle", "line", "path", "polygon", "ellipse"}
    def __init__(self):
        super().__init__(); self.stack, self.ids, self.h1, self.bad = [], [], 0, []
    def handle_starttag(self, t, a):
        d = dict(a)
        if "id" in d: self.ids.append(d["id"])
        if t == "h1": self.h1 += 1
        if t not in self.VOID: self.stack.append(t)
    def handle_startendtag(self, t, a):
        d = dict(a)
        if "id" in d: self.ids.append(d["id"])
    def handle_endtag(self, t):
        if t in self.VOID: return
        if not self.stack or self.stack[-1] != t: self.bad.append(f"</{t}> but open {self.stack[-3:]}"); return
        self.stack.pop()


def valid(html):
    assert html.lstrip().lower().startswith("<!doctype html>")
    c = Check(); c.feed(html)
    assert not c.bad and not c.stack, (c.bad[:3], c.stack[-3:])
    assert c.h1 == 1 and len(c.ids) == len(set(c.ids))
    assert "<script" not in html.lower() and "gradient" not in html.lower()
    return c


def lum(h):
    v = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
def ratio(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True)
    return (x + 0.05) / (y + 0.05)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "Content Security Policy" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sb-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "localhost,127.0.0.1"}
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
            hctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', theme: 'campfire', themePicked: true})) } catch (e) {}")
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            tok = host.evaluate("TribeStore.get().server.token")
            # a project with a repo (Publish writes site/ there)
            st, r = api("/flow/create", "POST", {"name": "Crumb Bakery"}, token=tok); assert st == 200, r
            pid, code = r["flow"]["project"], r["flow"]["invite"]["code"]
            repo = os.path.join(tmp, "workspaces", pid)
            for _ in range(100):
                if os.path.isdir(os.path.join(repo, ".git")) and any(x["id"] == pid and x["hasRepo"] for x in api("/projects", token=tok)[1]["projects"]): break
                time.sleep(0.2)
            else: raise AssertionError("no repo")
            api(f"/projects/{pid}", "PATCH", {"bio": "Sourdough and cinnamon buns, baked every morning"}, token=tok)
            st, j = api("/join", "POST", {"code": code, "name": "Maya"}); assert st == 200, j
            ftok = j["token"]
            W = lambda: api(f"/projects/{pid}/website", token=tok)[1]["website"]
            draft = lambda w=None: api((w or W())["gen"]["draftUrl"], raw=True)[1]

            # ======== SUGGEST (no model on: rules) — before anything exists ========
            assert W()["gen"]["brain"] is False
            st, r = api(f"/projects/{pid}/website/ideas", "POST", {}, token=tok); assert st == 200, r
            idea = r["idea"]
            assert idea["via"] == "rules" and idea["type"] == "business" and idea["theme"] == "bakery", idea
            for k in ["primary", "font", "layout", "order", "tagline", "why"]: assert idea.get(k), (k, idea)
            assert idea["order"][0] == "hero" and "visit" in idea["order"] and "suits a small business" in idea["why"], idea
            assert r["website"]["gen"]["idea"]["id"] == idea["id"] and r["website"]["gen"]["draft"] is None, "a suggestion is never applied by itself"
            st, r = api(f"/projects/{pid}/website/ideas/skip", "POST", {}, token=tok); assert st == 200 and r["website"]["gen"]["idea"] is None
            st, r = api(f"/projects/{pid}/website/ideas", "POST", {}, token=tok)
            assert r["idea"]["theme"] != "bakery", "Not now is remembered: the next suggestion changes"
            st, r = api(f"/projects/{pid}/website/ideas/skip", "POST", {}, token=tok)

            # ======== INSTANT ========
            st, r = api(f"/projects/{pid}/website/instant", "POST", {"hint": "build a site for my bakery"}, token=tok); assert st == 200, r
            assert r["type"] == "business" and r["guessed"] is True
            g = r["website"]["gen"]; assert g["draft"]["type"] == "business" and g["draft"]["layout"] == "journal" and g["unpublished"]
            assert "visit" in g["draft"]["secs"] and g["draftUrl"]
            valid(draft())
            # the builder adds the facts (step 1); an http RSVP / a bad email is refused
            assert api(f"/projects/{pid}/website/gen", "PUT", {"info": {"email": "not-an-email"}}, token=tok)[0] == 400
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"info": {"hours": "Tue-Fri 7-15\nSat 8-13", "address": "12 Elm Street, Springfield", "phone": "555 0100", "email": "hello@crumb.example"}}, token=tok); assert st == 200, r
            html = draft(); c = valid(html)
            for want in ["Tue-Fri 7-15", "12 Elm Street, Springfield", "mailto:hello@crumb.example", "tel:5550100", "When are you open?", 'href="#visit"', "Visit us"]: assert want in html, want
            assert "visit" in c.ids and "AI agent" not in html and "How is it made" not in html

            # ======== TYPES: each renders its own sections ========
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"info": {"date": "Saturday 3 May", "time": "6 pm", "place": "The old mill", "rsvp": "http://example.com/rsvp"}}, token=tok); assert st == 400, "RSVP must be https"
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"info": {"date": "Saturday 3 May", "time": "6 pm", "place": "The old mill", "rsvp": "https://example.com/rsvp", "link": "https://example.com/shop"}}, token=tok); assert st == 200, r
            want_ids = {"game": {"top", "faq"}, "app": {"top", "contact"}, "portfolio": {"top", "contact"}, "business": {"top", "visit"}, "event": {"top", "event"}, "docs": {"top", "story"}}
            never = {"game": {"visit", "event"}, "app": {"visit", "event"}, "portfolio": {"visit", "event", "faq"}, "business": {"event", "contact"}, "event": {"visit", "contact"}, "docs": {"visit", "event", "contact"}}
            for t in ["game", "app", "portfolio", "business", "event", "docs"]:
                st, r = api(f"/projects/{pid}/website/gen", "PUT", {"type": t}, token=tok); assert st == 200, (t, r)
                h = draft(r["website"]); c = valid(h)
                assert set(c.ids) >= want_ids[t], (t, c.ids)
                assert not (set(c.ids) & never[t]), (t, c.ids)
                assert f'data-type="{t}"' in h, t
                if t == "event": assert 'href="https://example.com/rsvp"' in h and "Saturday 3 May" in h and "The old mill" in h
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"type": "nope"}, token=tok); assert st == 400

            # ======== BRAND KIT ========
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"type": "business"}, token=tok)
            assert api(f"/projects/{pid}/website/brand", "PUT", {"primary": "#00FF00"}, token=ftok)[0] == 403, "only the host or the lead"
            assert api(f"/projects/{pid}/website/brand", "PUT", {"primary": "yellow"}, token=tok)[0] == 400
            assert api(f"/projects/{pid}/website/brand", "PUT", {"font": "comic"}, token=tok)[0] == 400
            bad_svg = "data:image/svg+xml;base64," + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').decode()
            assert api(f"/projects/{pid}/website/brand", "PUT", {"logo": bad_svg}, token=tok)[0] == 400, "a scripted SVG is refused"
            assert api(f"/projects/{pid}/website/brand", "PUT", {"logo": "data:image/png;base64," + base64.b64encode(b"GIF89a....").decode()}, token=tok)[0] == 400, "not really a PNG"
            logo = "data:image/png;base64," + base64.b64encode(png(40, 20, (180, 67, 43))).decode()
            st, r = api(f"/projects/{pid}/website/brand", "PUT", {"primary": "#FFE600", "accent": "#FFD0E0", "font": "grotesk", "wordmark": "Crumb", "logo": logo}, token=tok); assert st == 200, r
            br = r["brand"]
            assert br["primary"] == "#FFE600" and br["font"] == "grotesk" and br["wordmark"] == "Crumb" and br["logo"]["type"] == "png"
            assert any(n["which"] == "primary" and "readable" in n["text"] for n in br["notes"]), br["notes"]
            assert any(n["which"] == "accent" for n in br["notes"]), "a pale accent is adjusted too"
            assert len(br["swatches"]) == 8 and {f["feel"] for f in br["fonts"]} >= {"Classic", "Modern", "Playful", "Techy", "Retro"}
            assert api(f"/projects/{pid}/website/brand", token=tok)[1]["brand"]["primary"] == "#FFE600"
            h = draft()
            assert "Space Grotesk" in h and "data:image/png;base64," in h and 'alt="Crumb"' in h
            link = h.split("--link: ")[1][:7]; paper = h.split("--paper: ")[1][:7]
            assert ratio(link, paper) >= 4.5, ("links stay readable", link, paper)
            st, r = api(f"/projects/{pid}/website/brand", "PUT", {"primary": "#1F5F7A"}, token=tok)
            assert not [n for n in r["brand"]["notes"] if n["which"] == "primary"], r["brand"]["notes"]

            # ======== THEMES ========
            g = W()["gen"]
            assert 8 <= len(g["themes"]) <= 10 and g["themes"][0]["id"] == "garden", ("bakery and cozy were skipped, so the next business theme leads", [t["id"] for t in g["themes"]][:3])
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"theme": "minimal"}, token=tok); assert st == 200, r
            g = r["website"]["gen"]
            assert g["draft"]["layout"] == "swiss" and g["draft"]["theme"] == "minimal" and g["brand"]["primary"] == "#2F5BEA" and g["brand"]["font"] == "grotesk"
            assert g["brand"]["logo"], "a theme keeps the logo"
            assert g["themes"][0]["id"] == "minimal" and "you picked Minimal before" in g["themes"][0]["why"], g["themes"][0]
            st, r = api(f"/projects/{pid}/website/instant", "POST", {"type": "business", "theme": "cozy"}, token=tok); assert st == 200
            assert r["website"]["gen"]["draft"]["layout"] == "journal" and r["website"]["gen"]["brand"]["primary"] == "#C0653A"

            # ======== SUGGEST -> APPLY ========
            st, r = api(f"/projects/{pid}/website/ideas", "POST", {}, token=tok); assert st == 200
            idea = r["idea"]; assert idea["theme"] in ("cozy", "minimal") and "before" in idea["why"], idea
            st, r = api(f"/projects/{pid}/website/ideas/apply", "POST", {}, token=tok); assert st == 200, r
            g = r["website"]["gen"]
            assert g["idea"] is None and g["draft"]["theme"] == idea["theme"] and g["draft"]["type"] == idea["type"] and g["brand"]["primary"] == idea["primary"]
            assert g["draft"]["copy"]["hero"]["dek"] == idea["tagline"]
            st, r = api(f"/projects/{pid}/website/gen", "POST", {"how": "regenerate"}, token=tok)
            assert r["website"]["gen"]["draft"]["copy"]["hero"]["dek"] == idea["tagline"], "the applied tagline survives Regenerate"

            # ======== PUBLISH: split files, tokens, markers, logo ========
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"type": "business"}, token=tok)
            assert api(f"/projects/{pid}/website/publish", "POST", {}, token=ftok)[0] == 403
            st, r = api(f"/projects/{pid}/website/publish", "POST", {}, token=tok); assert st == 200, r
            site = Path(repo, "site")
            ih, cs = (site / "index.html").read_text(), (site / "styles.css").read_text()
            valid(ih)
            assert '<link rel="stylesheet" href="styles.css">' in ih and "<style" not in ih, "no inline styles in the published page"
            assert "<!-- ===== section: hero ===== -->" in ih and "<!-- ===== section: visit ===== -->" in ih and "<!-- ===== section: footer ===== -->" in ih
            assert "\n<main" in ih and ih.count("\n") > 40, "readable, one element group per line"
            assert cs.startswith("/*") and "Brand tokens" in cs and ":root {" in cs
            for tk in ["--paper:", "--ink:", "--primary:", "--link:", "--accent:", "--display:", "--body:", "--wrap:", "--gutter:", "--section:", "/* page background */", "/* spacing */"]: assert tk in cs, tk
            assert "url('fonts/" in cs and cs.count("\n") > 200, "one rule per line"
            assert (site / "logo.png").read_bytes() == png(40, 20, (180, 67, 43)) and 'src="logo.png"' in ih
            assert any((site / "fonts").glob("*.woff2"))
            prev = api(W()["previewUrl"], raw=True)[1]
            assert "<style>" in prev and "--paper:" in prev and "data:image/png;base64," in prev and "data:font/woff2" in prev, "the preview inlines the stylesheet, logo and fonts"
            # code view lists the files
            st, cv = api(f"/projects/{pid}/website/code", token=tok); assert st == 200
            names = [f["name"] for f in cv["files"]]
            assert names[:2] == ["index.html", "styles.css"] and "logo.png" in names and any(n.startswith("fonts/") for n in names) and "marker" in cv["files"][0]["note"]
            assert cv["handEdited"] == [] and "never overwrites" in cv["howTo"]

            # ======== HAND EDITS ========
            (site / "styles.css").write_text(cs.replace("--wrap: 1160px;", "--wrap: 980px;"))
            g = W()["gen"]
            assert g["handEdited"] == ["styles.css"] and g["unpublished"] is False
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"section": "story", "copy": {"title": "Since 1998"}}, token=tok)
            st, r = api(f"/projects/{pid}/website/publish", "POST", {}, token=tok)
            assert st == 409 and r["handEdited"] == ["styles.css"] and "by hand" in r["error"], (st, r)
            assert "Since 1998" not in (site / "index.html").read_text(), "nothing written on a 409"
            st, r = api(f"/projects/{pid}/website/publish", "POST", {"onEdited": "keep"}, token=tok); assert st == 200, r
            assert "--wrap: 980px;" in (site / "styles.css").read_text(), "Keep their edits: styles.css untouched"
            assert "Since 1998" in (site / "index.html").read_text(), "the other file still updates"
            assert r["website"]["gen"]["handEdited"] == ["styles.css"]
            # the automatic rebuild keeps them too
            api(f"/projects/{pid}/website", "PUT", {"auto": True}, token=tok); time.sleep(0.5)
            api(f"/projects/{pid}/website/build", "POST", {}, token=tok)
            assert "--wrap: 980px;" in (site / "styles.css").read_text(), "a build never overwrites hand edits"
            api(f"/projects/{pid}/website", "PUT", {"auto": False}, token=tok)
            st, r = api(f"/projects/{pid}/website/gen", "PUT", {"section": "story", "copy": {"title": "Since 1999"}}, token=tok)
            st, r = api(f"/projects/{pid}/website/publish", "POST", {"onEdited": "replace"}, token=tok); assert st == 200, r
            assert "--wrap: 1160px;" in (site / "styles.css").read_text() and r["website"]["gen"]["handEdited"] == []
            # Export stays one self-contained file
            st, ex, hdr = api(f"/api/projects/{pid}/website/export", token=tok, raw=True)
            assert st == 200 and "attachment" in hdr["Content-Disposition"] and "<style>" in ex and 'href="styles.css"' not in ex and "data:font/woff2" in ex and "data:image/png" in ex

            # ======== UI: the Website page offers the website designer, and the old site builder is gone (fix/desk-demo) ========
            host.evaluate("pid => TribeProjects.refresh().then(() => TribeProjects.switchTo(pid, 'home'))", pid)
            host.wait_for_function("pid => TribeProjects.current() === pid", arg=pid)
            host.evaluate("TribeShell.go('website')")
            host.wait_for_selector("#wb-root")
            assert host.locator("#wb-gen, .sg-modes, #sg-shuffle, [data-sgmode]").count() == 0, "the old site builder still shows beside the designer"
            assert host.evaluate("typeof window.TribeSiteGen") == "undefined"
            # Flint: a sentence no template claims runs Instant ("birthday party" now picks the party/RSVP template: flint_eval)
            host.evaluate("TribeFlint.ask('make a website for our conference')")
            host.wait_for_function("TribeFlint.thread().some(m => m.who === 'flint' && /as an event/.test(m.text))", timeout=15000)
            assert W()["gen"]["draft"]["type"] == "event"
            # phone 390: Website + builder fit
            pctx = b.new_context(**PHONE)
            pctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'campfire', themePicked:true, server:{{url:'{BASE}', token:'{tok}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pid}'); if (!sessionStorage.getItem('sb-once')) {{ sessionStorage.setItem('sb-once', '1'); localStorage.setItem('tribecode.mode', 'intermediate'); }} }} catch (e) {{}}")
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1")
            ph.wait_for_function("pid => window.TribeProjects && TribeProjects.current() === pid", arg=pid, timeout=20000)
            ph.evaluate("TribeShell.go('website')")
            ph.wait_for_selector("#wb-root")
            assert ph.locator("#wb-gen, .sg-modes, [data-sgmode]").count() == 0
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390, "the Website page fits at 390"
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_site_builder: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
