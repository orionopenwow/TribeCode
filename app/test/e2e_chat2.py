"""End-to-end: feat/chat2 (server/channels.js, embeds.js, gifs.js; app/ui/channels.js, chatrich.js, chat2.css).

Channels: create from the "# general ▾" switcher, switch, history isolation, unread dot, archive, MCP post_chat with a
channel. Links: auto-linked http(s) URLs (target=_blank, rel=noopener noreferrer), [text](url), no javascript: links.
Pictures: several in one message render as a grid; a GIF file; click opens the viewer. Embeds: a local fake page (allowed
for tests only via TRIBE_TEST_EMBED_ALLOW) renders a preview card with a proxied picture; private addresses (10/8,
loopback, metadata, a redirect to a private host) are blocked. GIF links render inline; the GIF picker without a key
shows Your GIFs + paste a link. Pin / unpin from the message menu and the header's Pinned panel. A channel background
(pattern) sets the legibility class and stays dimmed; the personal switch turns it off. The header is compact, the hover
highlight spans the line, and a 390px phone has no sideways scroll (switcher + GIF picker as sheets, long-press pin).
Usage: python app/test/e2e_chat2.py
"""
import base64, http.server, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5070 + OFF
FAKE = 5170 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
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
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


# a 2-frame 4x4 animated GIF
GIF = base64.b64decode("R0lGODlhBAAEAPABAPJrHf///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAABAAEAAACBISPmQUAIfkEADIAAAAsAAAAAAQABAAAAgSMj6kFADs=")

PAGE = b"""<!doctype html><html><head><meta charset="utf-8"><title>Fallback title</title>
<meta property="og:title" content="Pixel Quest &amp; friends">
<meta property="og:description" content="A tiny platformer &lt;script&gt;alert(1)&lt;/script&gt; made by a tribe.">
<meta property="og:site_name" content="Quest Wiki">
<meta property="og:image" content="/hero.png">
<script>window.bad = 1</script></head><body>hi</body></html>"""


class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        if self.path == "/page":
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(PAGE)
        elif self.path == "/hero.png":
            b = png(40, 24, (56, 198, 177)); self.send_response(200); self.send_header("Content-Type", "image/png"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        elif self.path == "/cat.gif":
            self.send_response(200); self.send_header("Content-Type", "image/gif"); self.send_header("Content-Length", str(len(GIF))); self.end_headers(); self.wfile.write(GIF)
        elif self.path == "/redir":
            self.send_response(302); self.send_header("Location", "http://169.254.169.254/latest/meta-data/"); self.end_headers()
        elif self.path == "/redir-local":
            self.send_response(302); self.send_header("Location", f"http://localhost:{PORT}/api/health"); self.end_headers()
        else:
            self.send_response(404); self.end_headers()


def hov(page, row):
    """Hover a message until its quick-reaction bar shows (a scroll on the first hover hides it)."""
    for _ in range(3):
        page.mouse.move(5, 5); page.hover(row + " .mb > p")
        try: page.wait_for_selector("#qr-bar:not(.hidden) .qr-more", timeout=1500); return
        except Exception: pass
    page.wait_for_selector("#qr-bar:not(.hidden) .qr-more", timeout=3000)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, token, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); }} catch (e) {{}}")   # try: the init script also runs in the sandboxed video frame
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("(document.querySelector('#sync-status') || {}).textContent?.includes('connected')", timeout=15000)
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    page.wait_for_selector("#chat-head .cb-av")
    return page


def main():
    fake = http.server.ThreadingHTTPServer(("127.0.0.1", FAKE), Fake)
    threading.Thread(target=fake.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="tribe-chat2-", dir="/tmp")
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST_EMBED_ALLOW": f"127.0.0.1:{FAKE}"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}), "bootstrap")
        orion = boot["token"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 3}, token=orion))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya", "color": "#6C7CFF"}))["token"]
        sinv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=orion))["invite"]
        spec = ok(api("/join", "POST", {"code": sinv["code"], "name": "Sam"}))["token"]
        ag = ok(api("/agents", "POST", token=maya)); atok = ag["token"]

        # ---------- server: SSRF guard ----------
        for bad in ["http://10.0.0.1/", f"http://localhost:{PORT}/api/health", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://0x7f.0.0.1/",
                    f"http://127.0.0.1:{FAKE}/redir", f"http://127.0.0.1:{FAKE}/redir-local", "file:///etc/passwd", "javascript:alert(1)", "http://user:pw@example.com/"]:
            p = ok(api("/embeds?url=" + urllib.parse.quote(bad, safe=""), token=orion), bad)["preview"]
            assert p["kind"] == "blocked", (bad, p)
        st, _ = api("/embeds/img?u=" + urllib.parse.quote("http://10.1.2.3/x.png", safe=""), token=orion)
        assert st == 403, f"picture proxy blocks private hosts: {st}"
        good = ok(api("/embeds?url=" + urllib.parse.quote(f"http://127.0.0.1:{FAKE}/page", safe=""), token=orion))["preview"]
        assert good["kind"] == "page" and good["title"] == "Pixel Quest & friends" and good["site"] == "Quest Wiki" and good["image"].endswith("/hero.png"), good
        assert "<script>" in good["description"], "the description is plain text (escaped by the client, never rendered as HTML)"
        assert ok(api("/embeds/settings", "PATCH", {"previews": False}, token=maya)) if False else api("/embeds/settings", "PATCH", {"previews": False}, token=maya)[0] == 403, "only the host turns previews off"
        assert api("/gifs/search?q=cat", token=orion)[0] == 503, "no GIF search without a key"
        assert api("/gifs/settings", "PATCH", {"key": "abcdefghijk"}, token=maya)[0] == 403, "only the host sets the GIPHY key"
        ok(api("/gifs/settings", "PATCH", {"key": "abcdefghijk123"}, token=orion)); assert ok(api("/gifs/settings", token=maya))["provider"] == "giphy"
        secret = list(Path(tmp).rglob("gifs.json")); assert secret and oct(secret[0].stat().st_mode)[-3:] == "600" and ".tribe/secrets" in str(secret[0]), secret
        assert "abcdefghijk123" not in json.dumps(api("/gifs/settings", token=orion)[1]), "the key never goes to a browser"
        ok(api("/gifs/settings", "PATCH", {"key": ""}, token=orion)); assert ok(api("/gifs/settings", token=orion))["provider"] is None

        # ---------- server: channels ----------
        assert api("/channels", "POST", {"name": "nope"}, token=spec)[0] == 403, "spectators can't make channels"
        assert api("/channels", "POST", {"name": "general"}, token=orion)[0] == 409
        ok(api("/chat/general/send", "POST", {"text": "General only: lock the jump height"}, token=maya))
        art = ok(api("/channels", "POST", {"name": "Art & Sprites", "emoji": "🎨", "topic": "Tiles, sprites, palettes"}, token=maya))["channel"]
        assert art["name"] == "art-sprites" and art["id"].startswith("c-"), art
        ok(api(f"/chat/{art['id']}/send", "POST", {"text": "Art only: new grass tiles"}, token=maya))
        gen = [m["text"] for m in ok(api("/chat/general?limit=50", token=orion))["messages"]]
        artm = [m["text"] for m in ok(api(f"/chat/{art['id']}?limit=50", token=orion))["messages"]]
        assert "Art only: new grass tiles" not in gen and "General only: lock the jump height" in gen, gen
        assert artm == ["Art only: new grass tiles"], artm
        ok(api(f"/chat/{art['id']}", "POST", {"text": "@agents can one of you export the sprites?"}, token=orion))   # v0.37: an agent answers in a channel when someone asked it there
        r = mcp(atok, "post_chat", {"text": "Agent here: sprites exported", "channel": "art-sprites"})
        assert not r["result"].get("isError"), r
        assert "Agent here: sprites exported" in [m["text"] for m in ok(api(f"/chat/{art['id']}?limit=50", token=orion))["messages"]]
        assert mcp(atok, "post_chat", {"text": "x", "channel": "nowhere"})["result"].get("isError"), "unknown channel is an error"
        assert "sprites exported" in mcp(atok, "read_chat", {"channel": "#art-sprites"})["result"]["content"][0]["text"]
        old = ok(api("/channels", "POST", {"name": "old-ideas"}, token=orion))["channel"]
        ok(api(f"/channels/{old['id']}", "PATCH", {"archived": True}, token=orion))
        assert api(f"/chat/{old['id']}/send", "POST", {"text": "x"}, token=orion)[0] == 403, "archived channels are read-only"
        assert api("/chat/c-00000000?limit=5", token=orion)[0] == 404

        # pictures (server): several in one message; a mislabelled file is refused
        items = [{"data": base64.b64encode(png(60, 40, c)).decode(), "mime": "image/png"} for c in [(242, 107, 29), (56, 198, 177)]] + [{"data": base64.b64encode(GIF).decode(), "mime": "image/gif"}]
        grid = ok(api("/chat/general/images", "POST", {"items": items, "text": "Three frames"}, token=maya))["message"]
        assert len(grid["images"]) == 3 and grid["images"][2]["mime"] == "image/gif", grid
        assert api("/chat/general/image", "POST", {"data": base64.b64encode(b"<svg onload=alert(1)>").decode(), "mime": "image/png"}, token=maya)[0] == 415
        ok(api("/chat/general/send", "POST", {"text": f"http://127.0.0.1:{FAKE}/cat.gif"}, token=maya))
        ok(api("/chat/general/send", "POST", {"text": f"Read this: http://127.0.0.1:{FAKE}/page and https://example.com/a?b=1&c=2. Also [docs](https://example.org/x) but not javascript:alert(1)"}, token=maya))
        ok(api("/chat/general/send", "POST", {"text": "Blocked one: http://10.0.0.1/admin"}, token=maya))
        ok(api("/chat/general/send", "POST", {"text": "Trailer https://www.youtube.com/watch?v=dQw4w9WgXcQ"}, token=maya))
        pinme = ok(api("/chat/general/send", "POST", {"text": "Ship date: Friday 6pm"}, token=maya))["message"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = login(b, {"width": 1440, "height": 900}, "Orion", orion)
            try:
                page.wait_for_selector(f"#chat-list .msg.dx[data-id='{pinme['id']}']")
                # ---- header: tucked in, emoji instead of an icon tile, tight icons on the right ----
                hd = page.evaluate("""() => { const h = document.querySelector('#chat-head').getBoundingClientRect(), m = document.querySelector('.main').getBoundingClientRect(),
                    acts = document.querySelector('#chat-head .cb-acts').getBoundingClientRect();
                    return { h: h.height, gap: h.top - m.top, right: h.right - acts.right, emo: document.querySelector('#chat-head .cb-av').textContent.trim(), n: document.querySelectorAll('#chat-head .cb-btn[data-cb]').length }; }""")   # the 4 chat buttons; aibasics.js may add its ✦ beside them
                assert hd["h"] <= 52 and hd["gap"] <= 14 and hd["right"] <= 8 and hd["emo"] == "💬" and hd["n"] == 4, hd
                page.screenshot(path=str(ROOT / "docs" / "screenshots" / "chat2-desktop.png"))

                # ---- links ----
                links = page.eval_on_selector_all("#chat-list .msg.dx .mb > p a", "els => els.map(a => [a.getAttribute('href'), a.textContent, a.target, a.rel])")
                hrefs = [l[0] for l in links]
                assert "https://example.com/a?b=1&c=2" in hrefs, links   # trailing "." stays outside
                assert any(l[0] == "https://example.org/x" and l[1] == "docs" for l in links), links
                assert all(l[2] == "_blank" and "noopener" in l[3] and "noreferrer" in l[3] for l in links), links
                assert not any(h.lower().startswith("javascript") for h in hrefs) and page.locator("a[href^='javascript' i]").count() == 0

                # ---- embeds: a preview card for the fake page, nothing for the private one; the description is text ----
                page.wait_for_selector("#chat-list .emb-card", timeout=10000)
                card = page.inner_text("#chat-list .emb-card")
                assert "Pixel Quest & friends" in card and "Quest Wiki" in card and "<script>alert(1)</script>" in card, card
                assert page.evaluate("window.bad === undefined && document.querySelectorAll('#chat-list .emb script').length === 0")
                page.wait_for_function("(() => { const i = document.querySelector('#chat-list .emb-card .emb-im'); return i && i.complete && i.naturalWidth === 40; })()", timeout=8000)
                assert "/api/embeds/img?u=" in page.get_attribute("#chat-list .emb-card .emb-im", "src")
                blocked_row = page.locator("#chat-list .msg.dx", has_text="Blocked one")
                page.wait_for_timeout(600)
                assert blocked_row.locator(".emb-card").count() == 0, "no preview for a private address"
                # YouTube: a click-to-load card, no third-party frame until Play
                vid = page.locator("#chat-list .emb-vid").first
                assert vid.locator("iframe").count() == 0 and page.locator("iframe[src*='youtube']").count() == 0
                vid.locator(".emb-play").click()
                src = vid.locator("iframe").get_attribute("src"); sb = vid.locator("iframe").get_attribute("sandbox")
                assert src.startswith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") and "allow-scripts" in sb, (src, sb)

                # ---- pictures: a 3-up grid (the GIF animates), the viewer, a GIF link inline ----
                g = f"#chat-list .msg.dx[data-id='{grid['id']}'] .igrid"
                page.wait_for_function(f"[...document.querySelectorAll(\"{g} img\")].length === 3 && [...document.querySelectorAll(\"{g} img\")].every(i => i.complete && i.naturalWidth > 0)", timeout=8000)
                assert "n3" in page.get_attribute(g, "class")
                page.click(f"{g} .ig[data-i='2']"); page.wait_for_selector("#pv img")
                assert "Picture 3 of 3" == page.get_attribute("#pv img", "alt")
                page.keyboard.press("ArrowLeft"); assert page.get_attribute("#pv img", "alt") == "Picture 2 of 3"
                page.keyboard.press("Escape"); page.wait_for_selector("#pv", state="detached")
                page.wait_for_function("(() => { const i = document.querySelector('#chat-list .msg.dx.has-gif .emb-img img'); return i && i.complete && i.naturalWidth === 4; })()", timeout=8000)

                # ---- hover: the highlight spans the line; the reaction bar sits inside the row's top-right ----
                row = f"#chat-list .msg.dx[data-id='{pinme['id']}']"
                page.wait_for_timeout(800)   # pictures and the video frame settle (a scroll hides the bar)
                page.hover(row + " .mb > p"); page.wait_for_timeout(300)   # the first hover may scroll the row into view (a scroll hides the bar)
                page.mouse.move(5, 5); page.hover(row + " .mb > p"); page.wait_for_selector("#qr-bar:not(.hidden)")
                hv = page.evaluate(f"""() => {{ const r = document.querySelector("{row}"), l = r.closest('.chat'), q = document.querySelector('#qr-bar');
                    const rr = r.getBoundingClientRect(), lr = l.getBoundingClientRect(), qr = q.getBoundingClientRect();
                    return {{ bg: getComputedStyle(r).backgroundColor, w: rr.width, lw: lr.width, rad: parseFloat(getComputedStyle(r).borderTopLeftRadius), qRight: rr.right - qr.right, qTop: qr.top - rr.top, qh: qr.height, hidden: q.classList.contains('hidden') }}; }}""")
                assert hv["bg"] not in ("rgba(0, 0, 0, 0)", "transparent") and hv["w"] >= hv["lw"] - 16 and hv["rad"] > 0, hv
                assert not hv["hidden"] and 0 <= hv["qRight"] <= 60 and hv["qTop"] >= -hv["qh"], hv

                # ---- pin from the message menu, the header's Pinned panel, unpin ----
                page.click(row + " .msg-more"); page.click("#msg-menu [data-act='pin']")
                page.wait_for_selector("#chat-head .cb-pins .cb-n")
                assert page.inner_text("#chat-head .cb-pins .cb-n") == "1"
                page.click("#chat-head .cb-pins"); page.wait_for_selector("#pins-panel .pp-row")
                assert "Ship date" in page.inner_text("#pins-panel")
                page.click("#pins-panel [data-unpin]")
                page.wait_for_function("!document.querySelector('#chat-head .cb-pins .cb-n')")
                page.wait_for_selector("#pins-panel .pp-empty")
                page.keyboard.press("Escape")

                # ---- emoji: bigger quick bar, the full picker anchored to the message, search, keyboard, tone, frequent ----
                hov(page, row)
                qb = page.evaluate("(() => { const r = document.querySelector('#qr-bar [data-q]').getBoundingClientRect(); return [r.width, r.height]; })()")
                assert qb[0] >= 32 and qb[1] >= 32, f"32px quick targets: {qb}"
                page.click("#qr-bar .qr-more"); page.wait_for_selector("#emoji-pick .ep-c")
                ep = page.evaluate("""() => { const p = document.querySelector('#emoji-pick').getBoundingClientRect(), m = document.querySelector("%s .mb").getBoundingClientRect();
                    return { w: p.width, h: p.height, focused: document.activeElement.classList.contains('ep-q'), near: Math.min(Math.abs(p.top - m.bottom), Math.abs(p.bottom - m.top)), shadow: getComputedStyle(document.querySelector('#emoji-pick')).boxShadow,
                      first: document.querySelector('#emoji-pick .ep-sec').dataset.sec, tabs: document.querySelectorAll('#emoji-pick .ep-tab').length }; }""" % row)
                assert 340 <= ep["w"] <= 380 and 360 <= ep["h"] <= 400 and ep["focused"] and ep["near"] <= 12 and ep["shadow"] == "none" and ep["first"] == "freq" and ep["tabs"] >= 8, ep
                page.keyboard.type("rocket")
                page.wait_for_function("[...document.querySelectorAll('#emoji-pick .ep-c')].map(b => b.dataset.e).includes('🚀')")
                assert page.locator("#emoji-pick .ep-c").count() <= 5
                page.hover("#emoji-pick .ep-c[data-e='🚀']"); assert "rocket" in page.inner_text("#emoji-pick .ep-pv")
                page.keyboard.press("Enter"); page.wait_for_selector("#emoji-pick", state="detached")
                page.wait_for_selector(row + " .rx[data-rx='🚀']")
                hov(page, row); page.click("#qr-bar .qr-more"); page.wait_for_selector("#emoji-pick .ep-c")
                assert page.eval_on_selector("#emoji-pick .ep-sec[data-sec='freq'] .ep-c", "b => b.dataset.e") == "🚀", "Frequently used leads with what you picked"
                page.click("#emoji-pick .ep-tone"); page.click("#emoji-pick [data-tone='\U0001F3FD']")
                page.fill("#emoji-pick .ep-q", "thumbs up")
                page.wait_for_selector("#emoji-pick .ep-c[data-e='👍🏽']")
                page.keyboard.press("ArrowDown"); page.keyboard.press("ArrowUp"); page.keyboard.press("Enter")
                page.wait_for_selector(row + " .rx[data-rx='👍🏽']")
                hov(page, row); page.click("#qr-bar .qr-more"); page.wait_for_selector("#emoji-pick")
                page.keyboard.press("Escape"); page.wait_for_selector("#emoji-pick", state="detached")
                page.click("#chat-form .cx-emo"); page.wait_for_selector("#emoji-pick .ep-q")
                page.keyboard.type("taco"); page.keyboard.press("Enter")
                assert page.input_value("#chat-input").endswith("🌮"), page.input_value("#chat-input")
                page.fill("#chat-input", "")
                assert api("/chat/general/react", "POST", {"id": pinme["id"], "emoji": "<b>x</b>"}, token=maya)[0] == 400

                # ---- channels from the switcher: create, switch, isolation, unread dot ----
                page.click("#chan-switch"); page.wait_for_selector("#dm-menu .ch-row [data-ch='" + art["id"] + "']")
                assert page.locator("#dm-menu [data-ch='" + old["id"] + "']").count() == 0, "archived channels are tucked away"
                page.click("#dm-menu [data-ch-new]"); page.wait_for_selector("#ch-modal #ch-name")
                page.fill("#ch-name", "Level Design"); page.click("#ch-modal .ch-e[data-e='🎮']"); page.fill("#ch-topic", "Maps and puzzles")
                page.click("#ch-save")
                page.wait_for_function("document.querySelector('#chan-switch') && document.querySelector('#chan-switch').textContent.includes('level-design')")
                assert page.inner_text("#chat-head .cb-av") == "🎮" and "Maps and puzzles" in page.inner_text("#chat-head .cb-sub")
                lvl = [c for c in ok(api("/channels", token=orion))["channels"] if c["name"] == "level-design"][0]
                page.wait_for_selector("#dm-list .ch-start")
                page.fill("#chat-input", "Level only: the cave needs a checkpoint"); page.press("#chat-input", "Enter")
                page.wait_for_selector("#dm-list .msg.dx:has-text('Level only')")
                assert page.locator("#chat-list .msg.dx:has-text('Level only')").count() == 0
                assert "Level only: the cave needs a checkpoint" in [m["text"] for m in ok(api(f"/chat/{lvl['id']}", token=maya))["messages"]]
                assert "Level only: the cave needs a checkpoint" not in [m["text"] for m in ok(api("/chat/general", token=maya))["messages"]]
                # someone posts in #art-sprites while Orion is in #level-design: an unread dot in the switcher
                ok(api(f"/chat/{art['id']}/send", "POST", {"text": "Art again: palette locked"}, token=maya))
                page.wait_for_function("document.querySelector('#chan-switch .dm-badge')")
                page.click("#chan-switch"); page.wait_for_selector(f"#dm-menu [data-ch='{art['id']}'] .ch-dot")
                page.click(f"#dm-menu [data-ch='{art['id']}']")
                page.wait_for_selector("#dm-list .msg.dx:has-text('Art again')")
                assert page.locator("#dm-list .msg.dx:has-text('Level only')").count() == 0 and page.locator("#dm-list .msg.dx:has-text('Lock the jump')").count() == 0
                assert page.inner_text("#chat-head .cb-av") == "🎨"

                # ---- background: channel menu › Background › Pixel stars; legible; personal switch off ----
                page.click("#chan-switch"); page.click(f"#dm-menu [data-chm='{art['id']}']"); page.click("#ch-menu [data-a='bg']")
                page.wait_for_selector("#ch-modal .ch-bg.sw-p-stars"); page.click("#ch-modal .ch-bg.sw-p-stars")
                page.wait_for_function("document.querySelector('#view-chat .chat-col').classList.contains('cbg-pattern-stars')")
                bg = page.evaluate("""() => { const c = document.querySelector('#view-chat .chat-col'), s = getComputedStyle(c, '::before');
                    return { cls: [...c.classList], op: parseFloat(s.opacity), img: s.backgroundImage, grad: /gradient/.test(s.backgroundImage) }; }""")
                assert "cbg-on" in bg["cls"] and bg["op"] <= 0.3 and "svg" in bg["img"] and not bg["grad"], bg
                page.click("#ch-bg-me")
                page.wait_for_function("!document.querySelector('#view-chat .chat-col').classList.contains('cbg-on')")
                page.click("#ch-bg-me"); page.click("#ch-modal [data-x]")
                page.wait_for_timeout(300); page.screenshot(path=str(ROOT / "docs" / "screenshots" / "chat2-channel-bg.png"))
                assert ok(api("/channels", token=maya))["channels"][[c["id"] for c in ok(api("/channels", token=maya))["channels"]].index(art["id"])]["bg"] == {"kind": "pattern", "value": "stars"}
                # back to #general: no background there
                page.click("#chan-switch"); page.click("#dm-menu [data-ch='general']")
                page.wait_for_function("!document.querySelector('#view-chat .chat-col').classList.contains('cbg')")

                # ---- GIF picker (no key): Your GIFs lists the shared ones; paste a link ----
                page.click("#chat-form .cx-gif"); page.wait_for_selector("#gif-pick .gp-c")
                assert page.locator("#gif-pick [data-gt='search']").count() == 0 and "GIF search is off" in page.inner_text("#gif-pick")
                page.fill("#gp-url", f"http://127.0.0.1:{FAKE}/cat.gif?again=1"); page.press("#gp-url", "Enter")
                page.wait_for_selector("#gif-pick", state="detached")
                page.wait_for_function("document.querySelectorAll('#chat-list .msg.dx.has-gif').length >= 2")
            finally:
                page.close()

            # ---------- phone, 390px ----------
            ph = login(b, {"width": 390, "height": 844}, "Maya", maya, mobile=True)
            try:
                ph.wait_for_selector("#chat-list .msg.dx")
                wide = lambda: ph.evaluate("document.scrollingElement.scrollWidth - innerWidth")
                assert wide() <= 0, f"sideways scroll {wide()}"
                assert ph.locator("#chat-head .chan-switch").is_visible(), "a slim channel row on phones"
                ph.click("#chan-switch"); ph.wait_for_selector("#dm-menu.chan-menu [data-ch]")
                sh = ph.evaluate("(() => { const r = document.querySelector('#dm-menu').getBoundingClientRect(); return [r.left, r.right, Math.round(r.bottom)]; })()")
                assert sh[0] == 0 and sh[1] == 390 and sh[2] == 844, f"switcher is a bottom sheet: {sh}"
                ph.click(f"#dm-menu [data-ch='{art['id']}']"); ph.wait_for_selector("#dm-list .msg.dx:has-text('Art again')")
                assert ph.evaluate("document.querySelector('#view-chat .chat-col').classList.contains('cbg-pattern-stars')")
                assert wide() <= 0, f"sideways scroll in a channel {wide()}"
                ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "chat2-phone.png"))
                # long-press a message: the menu has Pin
                box = ph.locator("#dm-list .msg.dx:has-text('Art again') .mb").bounding_box()
                ph.dispatch_event("#dm-list .msg.dx:has-text('Art again') .mb", "pointerdown", {"pointerType": "touch", "clientX": box["x"] + 10, "clientY": box["y"] + 8, "bubbles": True})
                ph.wait_for_selector("#msg-menu [data-act='pin']", timeout=3000)
                ph.eval_on_selector("#msg-menu [data-act='pin']", 'b => b.click()')
                ph.wait_for_selector("#chat-head .cb-pins .cb-n")
                ph.click("#chat-head .cb-pins"); ph.wait_for_selector("#pins-panel .pp-row")
                pr = ph.evaluate("(() => { const r = document.querySelector('#pins-panel').getBoundingClientRect(); return [r.left, r.right]; })()")
                assert pr == [0, 390], f"Pinned is a sheet: {pr}"
                ph.keyboard.press("Escape")
                # GIF picker as a sheet from the +
                ph.evaluate("TribeChatRich.gifPicker()"); ph.wait_for_selector("#gif-pick")
                gp = ph.evaluate("(() => { const r = document.querySelector('#gif-pick').getBoundingClientRect(); return [r.left, r.right, Math.round(r.bottom)]; })()")
                assert gp == [0, 390, 844], f"GIF picker is a sheet: {gp}"
                ph.keyboard.press("Escape")
                # the emoji picker is a bottom sheet on phones
                ph.evaluate("TribeEmoji.open({ onPick: () => {} })"); ph.wait_for_selector("#emoji-pick.sheet .ep-c")
                es = ph.evaluate("(() => { const r = document.querySelector('#emoji-pick').getBoundingClientRect(); return [r.left, r.right, Math.round(r.bottom)]; })()")
                assert es == [0, 390, 844], f"emoji picker is a sheet: {es}"
                ph.keyboard.press("Escape"); ph.wait_for_selector("#emoji-pick", state="detached")
                assert wide() <= 0
            finally:
                ph.close()
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_chat2: OK (channels + isolation + unread + MCP channel, links, pictures grid + viewer, previews + SSRF blocks, click-to-load video, GIF link + picker, pin/unpin, emoji picker (search, tabs, frequent, skin tone, keys, sheet), backgrounds, compact header, full-width hover, phone 390)")
    finally:
        srv.terminate(); fake.shutdown()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    import urllib.parse
    main()
