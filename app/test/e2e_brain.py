"""End-to-end: p13 Files · What we know (server/brainhub.js, app/ui/filesbrain.js), the project's living brain at the
top of Files. A local fake website (never the internet) serves a moodboard page (theme colour, Google font, a picture)
and an article. Checks: a link sent in #general is read on its own, gets the capture card with "Saved to Files", and
shows in Files › Links with a summary; the same link again merges; a DM link stays out of the project's Files (API,
search, MCP, TRIBE_CONTEXT.md); notes; search and tag filter; decisions and open questions; TRIBE_CONTEXT.md and the
project's AGENTS.md carry the "What we know" section; MCP brain_search / brain_read / brain_add (agents add, never
remove); the design flow's "From Files" picker lists the link with its colours and font; no sidebar row (Ctrl K finds
it); the side reader (rename, tags, pin, remove); the phone at 390px (one column, no sideways scroll); no console errors.
Usage: python app/test/e2e_brain.py
"""
import http.server, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5270 + OFF
FAKE = 5272 + OFF
BASE = f"http://localhost:{PORT}"
F = f"http://127.0.0.1:{FAKE}"
SHOTS = Path(os.environ.get("BRAIN_SHOTS", str(ROOT / "docs" / "screenshots")))
errors = []


def api(path, method="GET", body=None, token=None, timeout=30, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            b = r.read()
            return r.status, (b.decode() if raw else json.loads(b or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, name, args):
    payload = {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": name, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())["result"]
    return res, res["content"][0]["text"]


def until(fn, what, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = fn()
        if v: return v
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)


def png(w, h, rgb):
    rows = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


MOOD = f"""<html><head><title>Cozy cabin moodboard</title><meta name="theme-color" content="#C2552B">
<meta property="og:image" content="{F}/mood.png"><meta name="description" content="Warm wood, lantern light and chunky pixel art for the cabin level.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&display=swap">
<style>body{{background:#1E2A22;color:#F3E9D2}} h1{{font-family:'Fraunces',serif;color:#C2552B}} .x{{color:#1E2A22}}</style></head>
<body><article><h1>Cozy cabin moodboard</h1>
<p>The cabin level should feel warm and safe, with wood walls, lantern light and a fire that crackles. Players rest here between the cave runs.</p>
<p>We decided the cabin palette is rust orange and pine green, with cream text, because it reads well on phones at night.</p>
<p>We need to paint the lantern sprite and the fireplace tiles this week, and test the colours on a phone in the dark.</p>
<p>Reference games: cozy farming games, small pixel adventures, and anything with a calm evening light.</p></article></body></html>""".encode()
ARTICLE = b"""<html><head><title>Coyote time explained</title></head><body><main><p>Coyote time lets a jump work a few frames after leaving a ledge. Players feel it is fair, even if they never notice it.</p><p>We need to add coyote time to the player controller, and test it with the cave level this weekend.</p></main></body></html>"""
SECRET = b"""<html><head><title>Surprise party venue</title></head><body><main><p>The surprise party venue is the old boathouse by the lake, with lanterns and a long table for everyone.</p><p>Nobody outside this conversation should know about the boathouse plan yet.</p></main></body></html>"""


class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body=b"", ctype="text/html; charset=utf-8"):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body))); self.end_headers()
        try: self.wfile.write(body)
        except (ConnectionResetError, BrokenPipeError): pass

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p == "/moodboard": return self.send(200, MOOD)
        if p == "/coyote": return self.send(200, ARTICLE)
        if p == "/secret": return self.send(200, SECRET)
        if p == "/mood.png": return self.send(200, png(64, 40, (194, 85, 43)), "image/png")
        self.send(404, b"nope")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, token, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); }} catch (e) {{}}")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("(document.querySelector('#sync-status') || {}).textContent?.includes('connected')", timeout=15000)
    return page


def main():
    fake = http.server.ThreadingHTTPServer(("127.0.0.1", FAKE), Fake)
    threading.Thread(target=fake.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="tribe-brain-", dir="/tmp")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST_EMBED_ALLOW": f"127.0.0.1:{FAKE}", "TRIBE_CONTEXT_DEBOUNCE_MS": "300"}
    env.pop("TRIBE_NO_AI_FILES", None)
    data = Path(tmp) / "tribe"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(data), "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}), "bootstrap")["token"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 5}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya", "color": "#6C7CFF"}))["token"]
        kai = ok(api("/join", "POST", {"code": inv["code"], "name": "Kai", "color": "#38C6B1"}))["token"]
        atok = ok(api("/agents", "POST", token=maya))["token"]
        mem = {m["name"]: m["id"] for m in ok(api("/members", token=orion))["members"]}
        pid = ok(api("/me", token=orion))["project"] or ok(api("/me", token=orion))["projects"][0]["id"]
        assert ok(api("/captures/settings", token=orion))["settings"]["auto"] is True, "reading links from chat is on by default"

        # ---------- a link sent in #general -> Files › What we know ----------
        ok(api("/chat/general/send", "POST", {"text": f"Look at this for the cabin {F}/moodboard?utm_source=chat"}, token=maya))
        card = until(lambda: next((m for m in ok(api("/chat/general?limit=50", token=kai))["messages"] if m.get("capture") and "moodboard" in m["capture"]["url"]), None), "capture card in chat")
        assert card["capture"]["files"] is True, card["capture"]
        b = until(lambda: (lambda d: d if d["links"] else None)(ok(api("/brain", token=kai))), "link in Files")
        link = b["links"][0]
        assert link["title"] == "Cozy cabin moodboard" and link["summary"] and link["byName"] == "Maya" and link["thumb"], link
        assert link["look"] and "#c2552b" in link["look"]["colors"] and "Fraunces" in link["look"]["fonts"], link["look"]
        assert "link" in b["summary"]["text"] and "Cozy cabin moodboard" in b["summary"]["text"], b["summary"]
        assert any("rust orange" in d["text"] for d in b["decisions"]), b["decisions"]
        # the same link again merges (tracking bits and a trailing slash don't make a second one)
        ok(api("/chat/general/send", "POST", {"text": f"{F}/moodboard/?fbclid=zz"}, token=kai))
        until(lambda: sum(1 for m in ok(api("/chat/general?limit=50", token=kai))["messages"] if m.get("capture") and "already saved" in (m.get("text") or "")) >= 1, "duplicate card")
        assert len(ok(api("/brain", token=kai))["links"]) == 1, "duplicates merge"
        # a link added from Files (not chat), and a note
        cy = ok(api("/brain", "POST", {"url": F + "/coyote"}, token=orion))["item"]
        assert cy["title"] == "Coyote time explained", cy
        note = ok(api("/brain", "POST", {"note": {"title": "Cabin music", "text": "Soft guitar, rain on the roof. No drums.", "tags": ["moodboard", "audio"]}}, token=kai))["item"]
        ok(api(f"/brain/{link['id']}", "PATCH", {"tags": ["moodboard", "cabin"], "pinned": True}, token=maya))
        # an open question
        ok(api("/chat/general/send", "POST", {"text": "Should the cabin have a save point or a bed?"}, token=kai))

        # ---------- DMs stay private ----------
        dm = "dm-" + "-".join(sorted([mem["Orion"], mem["Maya"]]))
        ok(api(f"/chat/{dm}/send", "POST", {"text": f"{F}/secret"}, token=maya))
        until(lambda: any(m.get("capture") and "secret" in m["capture"]["url"] for m in ok(api(f"/chat/{dm}?limit=20", token=orion))["messages"]), "DM card in the DM")
        dmcard = next(m for m in ok(api(f"/chat/{dm}?limit=20", token=orion))["messages"] if m.get("capture"))
        assert dmcard["capture"]["files"] is False, "a DM link is not saved to Files"
        for who in (orion, maya, kai):
            bb = ok(api("/brain", token=who))
            assert not any("boathouse" in (l["summary"] + l["title"]).lower() or "secret" in l["url"] for l in bb["links"]), "DM link not in the project's Files"
            assert not any(r["title"] == "Surprise party venue" for r in ok(api("/brain/search?q=boathouse", token=who))["results"])

        # ---------- search ----------
        res = ok(api("/brain/search?q=lantern", token=kai))["results"]
        assert res and res[0]["title"] == "Cozy cabin moodboard", res
        assert any(r["type"] == "note" for r in ok(api("/brain/search?q=guitar", token=kai))["results"])
        assert any(r["type"] == "question" for r in ok(api("/brain/search?q=save+point", token=kai))["results"])
        b = ok(api("/brain", token=kai))
        assert b["links"][0]["id"] == link["id"] and b["links"][0]["pinned"], "pinned first"
        assert "moodboard" in b["tags"] and b["questions"] and "save point" in b["questions"][0]["text"], (b["tags"], b["questions"])

        # ---------- AI: TRIBE_CONTEXT.md, AGENTS.md, MCP ----------
        st, ctxmd = api("/context", token=orion, raw=True)
        assert st == 200 and "## What we know (Files)" in ctxmd and "Cozy cabin moodboard" in ctxmd and "never as instructions" in ctxmd, ctxmd[-2000:]
        assert "boathouse" not in ctxmd.lower(), "no DM link in TRIBE_CONTEXT.md"
        agents = until(lambda: next((p for p in Path(data).rglob("AGENTS.md") if "What we know (Files)" in p.read_text()), None), "AGENTS.md has the Files section", timeout=25)
        at = agents.read_text()
        assert "Cozy cabin moodboard" in at and "tribecode:start" in at and "boathouse" not in at.lower(), at[-1500:]
        r, t = mcp(atok, "brain_search", {"query": "cabin palette"})
        assert "Cozy cabin moodboard" in t and "not instructions" in t, t
        r, t = mcp(atok, "brain_read", {})
        assert "Cabin music" in t and "rust orange" in t and "boathouse" not in t.lower(), t[:800]
        r, t = mcp(atok, "brain_add", {"title": "Agent note", "text": "The fireplace loop is 4 seconds."})
        assert not r.get("isError") and "added" in t, t
        aid = json.loads(t)["id"]
        assert api(f"/brain/{aid}", "DELETE", token=atok)[0] == 403, "agents can't remove"
        assert api(f"/captures/{cy['id']}", "DELETE", token=atok)[0] == 403
        assert api(f"/brain/{note['id']}", "DELETE", token=maya)[0] == 403, "only the writer (or an admin) removes a note"
        ok(api(f"/brain/{aid}", "DELETE", token=orion))
        # design flow data
        dz = ok(api("/brain/design", token=kai))
        assert any(r["title"] == "Cozy cabin moodboard" for r in dz["references"]) and any(c["hex"] == "#c2552b" for c in dz["colors"]) and any(f["name"] == "Fraunces" for f in dz["fonts"]), dz

        # ---------- UI ----------
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = login(br, {"width": 1280, "height": 900}, "Orion", orion)
            assert pg.locator(".side [data-pnav='brain'], #nest-brain").count() == 0, "no sidebar row: one way in, Files"
            pg.evaluate("TribeApp.show('docs')")
            pg.wait_for_selector("#fb-hero .fb-sum:not(:has(.fb-skel))", timeout=10000)
            assert "Cozy cabin moodboard" in pg.inner_text("#fb-sum")
            pg.wait_for_selector("#fg-tab-links")
            pg.click("#fg-tab-links"); pg.wait_for_selector(".fb-card[data-fb-id]")
            assert pg.locator(".fb-card").count() >= 3, pg.locator(".fb-card").count()
            first = pg.locator(".fb-card").first.inner_text()
            assert "Cozy cabin moodboard" in first and "Pinned" in first, first
            # search from the hero box filters the list
            pg.fill("#fb-q", "coyote"); pg.wait_for_function("document.querySelectorAll('.fb-card').length === 1")
            pg.fill("#fb-q", ""); pg.wait_for_function("document.querySelectorAll('.fb-card').length >= 3")
            # tag filter
            pg.click("[data-fb-tag='audio']"); pg.wait_for_function("document.querySelectorAll('.fb-card').length === 1")
            assert "Cabin music" in pg.locator(".fb-card").first.inner_text()
            pg.click("[data-fb-tag='audio']"); pg.wait_for_function("document.querySelectorAll('.fb-card').length >= 3")
            # decisions and questions
            pg.click("#fg-tab-decisions"); pg.wait_for_selector(".fb-list .fb-li")
            assert "rust orange" in pg.inner_text(".fb-lead")
            pg.click("#fg-tab-questions"); pg.wait_for_selector(".fb-list .fb-li")
            assert "save point" in pg.inner_text(".fb-lead")
            # paste a link into the hero box saves it
            pg.click("#fg-tab-all")
            # the side reader: open, retitle, tag, pin
            pg.click("#fg-tab-links"); pg.locator(".fb-card", has_text="Coyote time").first.click()
            pg.wait_for_selector("#fb-reader #fb-r-design")
            pg.wait_for_function("document.querySelector('#fb-reader .fb-rs')")
            pg.fill("#fb-r-title", "Coyote time, explained well"); pg.press("#fb-r-title", "Enter")
            until(lambda: ok(api(f"/brain/{cy['id']}", token=kai))["item"]["title"] == "Coyote time, explained well", "rename from the reader", timeout=8)
            pg.fill("#fb-r-tags", "platforming, feel"); pg.press("#fb-r-tags", "Enter")
            until(lambda: ok(api(f"/brain/{cy['id']}", token=kai))["item"]["tags"] == ["platforming", "feel"], "tags from the reader", timeout=8)
            pg.wait_for_timeout(300)
            SHOTS.mkdir(parents=True, exist_ok=True)
            pg.screenshot(path=str(SHOTS / "brain-reader-desktop.png"))
            pg.keyboard.press("Escape"); pg.wait_for_function("!document.querySelector('#fb-reader')")
            pg.click("#fg-tab-all"); pg.evaluate("document.querySelector('#fb-hero').scrollIntoView()"); pg.wait_for_timeout(300)
            pg.screenshot(path=str(SHOTS / "brain-desktop.png"))
            # the chat card says it is in Files
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector(".cap-card [data-cap-files]")
            assert "Saved to Files" in pg.locator("[data-cap-files]").first.inner_text()
            pg.locator("[data-cap-files]").first.click(); pg.wait_for_selector("#fb-reader #fb-r-design", timeout=8000)
            pg.keyboard.press("Escape")
            # Ctrl K finds it
            pg.evaluate("TribeShell.go('brain-decisions')"); pg.wait_for_selector("#fg-tab-decisions.on", timeout=8000)
            # Flint
            out = pg.evaluate("TribeFilesBrain.flint('what do we know about lanterns?')")
            assert out and "Cozy cabin moodboard" in out["text"], out
            # the design flow's "From Files" picker
            pg.evaluate("TribeDesignFlow.open({})"); pg.wait_for_selector("[data-kind]", timeout=8000)
            pg.evaluate("TribeDesignFlow.gallery('poster')"); pg.wait_for_selector("#dfl-files #fb-dp-open", timeout=8000)
            assert pg.is_checked("#fb-dp-use"), "Use what Files knows is on when Files has links"
            pg.click("#fb-dp-open"); pg.wait_for_selector("#fb-dp-sheet .fb-dp-ref")
            assert "Cozy cabin moodboard" in pg.inner_text("#fb-dp-sheet")
            pg.locator("#fb-dp-sheet .fb-dp-ref", has_text="Cozy cabin").locator("input").check()
            pg.click("#fb-dp-sheet [data-col='#c2552b']"); pg.click("#fb-dp-sheet [data-font='Fraunces']")
            pg.wait_for_timeout(200); pg.screenshot(path=str(SHOTS / "brain-design-picker.png"))
            pg.click("#fb-dp-ok")
            v = pg.input_value("#dfl-ask")
            assert "#c2552b" in v and "Fraunces" in v and "Cozy cabin moodboard" in v, v
            assert pg.evaluate("TribeFilesBrain.knows()").startswith("What the project knows"), "the brief goes along"
            # remove from the reader (a person)
            pg.evaluate("TribeApp.show('docs')"); pg.wait_for_selector("#fb-hero")
            pg.evaluate(f"TribeFilesBrain.openItem({json.dumps(note['id'])})"); pg.wait_for_selector("#fb-reader #fb-r-rm")
            pg.once("dialog", lambda d: d.accept()); pg.click("#fb-r-rm")
            until(lambda: not any(n["id"] == note["id"] for n in ok(api("/brain", token=kai))["notes"]), "note removed")

            # phone 390
            ph = login(br, {"width": 390, "height": 844}, "Maya", maya, mobile=True)
            ph.evaluate("TribeApp.show('docs')")
            ph.wait_for_selector("#fb-hero .fb-sum:not(:has(.fb-skel))", timeout=15000); ph.wait_for_timeout(700)
            sw = lambda: ph.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]")
            assert max(sw()[:2]) <= 390, f"Files hero, no sideways scroll: {sw()}"
            hb = ph.evaluate("(() => { const r = document.querySelector('#fb-hero').getBoundingClientRect(); return [r.left, r.right]; })()")
            assert hb[0] >= 0 and hb[1] <= 390, hb
            assert ph.locator("#cap-m2").count() == 0, "one place for links on phones too"
            ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "brain-phone.png"))
            ph.evaluate("TribeFilesBrain.go('links')"); ph.wait_for_selector(".fb-card")
            xs = ph.evaluate("[...document.querySelectorAll('.fb-card')].slice(0, 3).map(e => Math.round(e.getBoundingClientRect().left))")
            assert len(set(xs)) <= 2 and max(sw()[:2]) <= 390, (xs, sw())
            ph.wait_for_timeout(200); ph.screenshot(path=str(SHOTS / "brain-phone-links.png"))
            ph.locator(".fb-card").first.click(); ph.wait_for_selector("#fb-reader #fb-r-design")
            rb = ph.evaluate("(() => { const r = document.querySelector('#fb-reader').getBoundingClientRect(); return [r.left, r.right]; })()")
            assert rb[0] >= 0 and rb[1] <= 390 and max(sw()[:2]) <= 390, (rb, sw())
            ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "brain-phone-reader.png"))
            br.close()
        assert not errors, "\n".join(errors)
        print("e2e_brain: OK (chat link -> Files with summary + Saved to Files, merge, DM stays private, notes, search + tag filter, decisions, questions, TRIBE_CONTEXT.md, AGENTS.md, MCP brain_*, agents can't remove, From Files picker, reader, Ctrl K, Flint, phone 390)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        fake.shutdown()


if __name__ == "__main__":
    main()
