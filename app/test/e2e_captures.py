"""End-to-end: feat/captures (server/captures.js, capture-html.js, capture-sum.js, packs.js; app/ui/captures.js).

A local fake website serves an article with nav/ads/cookie noise, a windows-1252 page with no charset, a 5 MB page, a
redirect to a private address, an XSS page, a robots "noarchive" page, a login-only page, fake oEmbed answers for
YouTube / TikTok / Instagram (allowed only under TRIBE_TEST, like server/embeds.js), and stand-in packs (a mock yt-dlp
and a mock whisper-cli, downloaded and sha256-checked like the real ones, plus a pack whose checksum is wrong).
Checks: extraction + summary + action items + tags, the .md/.json files, dedupe, charsets, size caps, SSRF blocks
(redirects, loopback, metadata, file:), XSS stays text (server and UI), no SVG thumbnails, oEmbed cards, packs (host
only, terms, checksum), video captions, local whisper transcripts, voice notes (mocked transcript, paste fallback),
huddle-style meeting capture via the chat voice note, DM privacy, spectator read-only, keep/discard weights,
"Make tasks" (people only), MCP tools (agents never make tasks), recipes proposed by an agent and approved by a person,
Flint "what did we decide" + "summarize <url>", auto-capture of a pasted link, the Captures view and notes editor,
the chat card, Settings › Packs, the phone at 390px (no sideways scroll, recorder) and no console errors.
Usage: python app/test/e2e_captures.py
"""
import base64, hashlib, http.server, json, os, stat, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5230 + OFF
FAKE = 5232 + OFF
BASE = f"http://localhost:{PORT}"
F = f"http://127.0.0.1:{FAKE}"
errors = []


def api(path, method="GET", body=None, token=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def raw(path, token):
    req = urllib.request.Request(BASE + "/api" + path, headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


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
        time.sleep(0.2)
    raise AssertionError("timed out: " + what)


def png(w, h, rgb):
    rows = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


ARTICLE = (ROOT / "app" / "test" / "fixtures" / "captures" / "article-pixel.html").read_bytes()
LATIN = b"<html><head><title>Caf\xe9 cr\xe8me notes</title></head><body><article><p>Le caf\xe9 est tr\xe8s bon, et la cr\xe8me aussi. We need to order more beans for the studio this week, because the team drinks a lot of coffee while building the game.</p><p>Second paragraph, with commas, so the reader has enough text to score this block above everything else on the page.</p></article></body></html>"
HUGE = b"<html><head><title>Huge page</title></head><body><article>" + b"".join(b"<p>Paragraph %d keeps the reader busy, with commas, and words, and more words about level design and sprites.</p>" % i for i in range(60000)) + b"</article></body></html>"
XSS = b"""<html><head><title>&lt;img src=x onerror="window.__xss=1"&gt; Totally safe</title><meta property="og:image" content="/evil.svg">
<meta property="og:description" content="&lt;script&gt;window.__xss=2&lt;/script&gt;"></head><body><article>
<p>&lt;script&gt;window.__xss=3&lt;/script&gt; This article talks about [links](javascript:alert(1)) and **markdown** and &lt;b onmouseover=alert(1)&gt;bold&lt;/b&gt; text, with enough words to be the main block of the page.</p>
<p>We decided to keep every string as plain text, because pages can contain anything, including tags that look like code.</p></article></body></html>"""
NOARCHIVE = b"""<html><head><title>Private-ish notes</title><meta name="robots" content="noarchive"><meta name="description" content="A page that asks not to be saved."></head><body><article><p>Secret long body text that must not be stored by the link reader, with commas, and many words to look like an article.</p></article></body></html>"""
ARTICLE2 = b"""<html><head><title>Coyote time explained</title></head><body><main><p>Coyote time lets a jump work a few frames after leaving a ledge. Players feel it is fair, even if they never notice it.</p><p>We need to add coyote time to the player controller, and test it with the cave level this weekend.</p></main></body></html>"""
EVIL_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>'
VTT = """WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:04.000
Welcome back to the dev log.

00:00:05.000 --> 00:00:09.000
Today we decided the boss gets two phases instead of three.

00:00:10.000 --> 00:00:14.000
Next we need to add a wind-up sound before the second attack.

00:01:05.000 --> 00:01:09.000
Thanks for watching and see you next week.
"""
YTDLP = r'''#!/usr/bin/env python3
# Stand-in yt-dlp for TribeCode tests: never touches the network.
import sys, os
a = sys.argv[1:]
assert "--" in a and "--no-cookies" in a and "--ignore-config" in a, a
url = a[a.index("--") + 1]
out = a[a.index("-o") + 1]
d = os.path.dirname(out)
if "private" in url:
    sys.stderr.write("ERROR: [youtube] xyz: Private video. Sign in if you've been granted access\n"); sys.exit(1)
if "--skip-download" in a:
    if "nocaps" not in url:
        open(os.path.join(d, "cap.en.vtt"), "w").write(open(os.environ["MOCK_VTT"]).read())
    sys.exit(0)
open(os.path.join(d, "audio.m4a"), "wb").write(b"fake audio")
'''
WHISPER = r'''#!/usr/bin/env python3
# Stand-in whisper-cli for TribeCode tests: writes whisper.cpp's -oj JSON.
import sys, json
a = sys.argv[1:]
of = a[a.index("-of") + 1]; f = a[a.index("-f") + 1]
assert a[a.index("-m") + 1].endswith("model.bin"), a
if f.endswith(".m4a"):
    segs = [(0, "This video has no captions but the audio says hello."), (4200, "We decided the cave gets a lantern. Maya will paint the lantern sprite.")]
else:
    segs = [(0, "Quick voice note about the boss fight."), (3000, "We decided the boss gets a shield phase."), (6500, "Orion will tune the shield timing tomorrow.")]
json.dump({"transcription": [{"offsets": {"from": t, "to": t + 2000}, "text": " " + s} for t, s in segs]}, open(of + ".json", "w"))
'''


def sha(b): return hashlib.sha256(b).hexdigest()


class Fake(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, body=b"", ctype="text/html; charset=utf-8", headers=None):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers()
        try: self.wfile.write(body)
        except (ConnectionResetError, BrokenPipeError): pass   # the reader stops at its size cap

    def do_GET(self):
        p = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(p.query)
        if p.path == "/article": return self.send(200, ARTICLE)
        if p.path == "/article2": return self.send(200, ARTICLE2)
        if p.path == "/thumb.png": return self.send(200, png(48, 32, (242, 107, 29)), "image/png")
        if p.path == "/yt.png": return self.send(200, png(64, 36, (56, 198, 177)), "image/png")
        if p.path == "/latin1": return self.send(200, LATIN, "text/html")
        if p.path == "/huge": return self.send(200, HUGE)
        if p.path == "/xss": return self.send(200, XSS)
        if p.path == "/evil.svg": return self.send(200, EVIL_SVG, "image/svg+xml")
        if p.path == "/noarchive": return self.send(200, NOARCHIVE)
        if p.path == "/login": return self.send(401, b"no")
        if p.path == "/redir-private": self.send_response(302); self.send_header("Location", "http://10.0.0.5/admin"); self.end_headers(); return
        if p.path == "/redir-meta": self.send_response(301); self.send_header("Location", "http://169.254.169.254/latest/meta-data/"); self.end_headers(); return
        if p.path.startswith("/oembed/"):
            plat, url = p.path.split("/")[2], q.get("url", [""])[0]
            if plat == "youtube":
                body = {"title": "Boss fight dev log " + ("(no captions)" if "nocaps" in url else ""), "author_name": "Pixel Crew", "thumbnail_url": F + "/yt.png", "provider_name": "YouTube"}
            elif plat == "tiktok":
                body = {"title": "Jump tutorial in 30 seconds #gamedev", "author_name": "jumpcat", "thumbnail_url": F + "/yt.png"}
            elif plat == "instagram":
                body = {"html": "<blockquote class=\"instagram-media\"><p>Our new pixel art tileset for the cave level &lt;script&gt;x&lt;/script&gt;</p><a href=\"#\">A post shared by Pixel Crew</a></blockquote><script async src=\"//www.instagram.com/embed.js\"></script>", "provider_name": "Instagram", "type": "rich"}
            else:
                return self.send(404, b"{}", "application/json")
            return self.send(200, json.dumps(body).encode(), "application/json")
        if p.path.startswith("/packs/"):
            b = PACKFILES.get(p.path[len("/packs/"):])
            return self.send(200, b, "application/octet-stream") if b is not None else self.send(404)
        self.send(404, b"nope")


PACKFILES = {"yt-dlp": YTDLP.encode(), "whisper-cli": WHISPER.encode(), "model.bin": b"fake model " * 100, "bad.bin": b"tampered"}


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, token, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1, permissions=["microphone"])
    ctx.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); }} catch (e) {{}}")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("(document.querySelector('#sync-status') || {}).textContent?.includes('connected')", timeout=15000)
    return page


def files_of(tmp, cid):
    return sorted(str(p.relative_to(tmp)) for p in Path(tmp).rglob(cid + ".*"))


def main():
    fake = http.server.ThreadingHTTPServer(("127.0.0.1", FAKE), Fake)
    threading.Thread(target=fake.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="tribe-captures-", dir="/tmp")
    vtt = Path(tmp) / "mock.vtt"; vtt.write_text(VTT)
    index = [
        {"id": "yt-dlp", "version": "test-1", "title": "Video captions (yt-dlp)", "what": "test", "license": "Unlicense", "kind": "tool", "terms": "You are responsible for following each site's terms.",
         "files": [{"path": "yt-dlp", "url": F + "/packs/yt-dlp", "sha256": sha(PACKFILES["yt-dlp"]), "bytes": len(PACKFILES["yt-dlp"]), "exec": True}]},
        {"id": "whisper-tiny", "version": "test-1", "title": "Local transcripts, small", "what": "test", "license": "MIT", "kind": "whisper",
         "files": [{"path": "model.bin", "url": F + "/packs/model.bin", "sha256": sha(PACKFILES["model.bin"]), "bytes": len(PACKFILES["model.bin"])},
                   {"path": "bin/whisper-cli", "url": F + "/packs/whisper-cli", "sha256": sha(PACKFILES["whisper-cli"]), "bytes": len(PACKFILES["whisper-cli"]), "exec": True}]},
        {"id": "whisper-base", "version": "test-1", "title": "unused", "what": "test", "license": "MIT", "kind": "whisper", "files": None, "platforms": {}},
        {"id": "bad", "version": "1", "title": "Tampered pack", "what": "test", "license": "MIT", "kind": "tool",
         "files": [{"path": "bad.bin", "url": F + "/packs/bad.bin", "sha256": "0" * 64, "bytes": 8}]},
    ]
    (Path(tmp) / "packs-index.json").write_text(json.dumps(index))
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST_EMBED_ALLOW": f"127.0.0.1:{FAKE}", "TRIBE_TEST_OEMBED": F,
           "TRIBE_TEST_PACKS_INDEX": str(Path(tmp) / "packs-index.json"), "TRIBE_TEST_PACKS_ALLOW": f"127.0.0.1:{FAKE}", "TRIBE_TEST_NO_PATH": "1", "MOCK_VTT": str(vtt)}
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
        sinv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": sinv["code"], "name": "Sam"}))["token"]
        atok = ok(api("/agents", "POST", token=maya))["token"]
        mem = {m["name"]: m["id"] for m in ok(api("/members", token=orion))["members"]}

        # ---------- web reader: article with noise ----------
        t0 = time.time()
        r = ok(api("/captures", "POST", {"url": F + "/article?utm_source=newsletter"}, token=maya), "article")
        c = r["capture"]
        assert c["title"] == "Why pixel art needs whole-number scaling" and c["author"] == "Rin Okafor" and c["kind"] == "article" and c["status"] == "ready", c
        for noise in ["cookies", "SHINY KEYBOARD", "Popular posts", "Share on Facebook", "newsletter", "Great post"]:
            assert noise.lower() not in c["text"].lower(), noise
        assert "image-rendering to pixelated" in c["text"] and c["summary"], c["summary"]
        assert 5 <= len(c["points"]) + 2 and any("phones" in a["text"] for a in c["actions"]), c["actions"]
        assert "pixel art" in c["tags"], c["tags"]
        assert any("320 by 180" in d["text"] for d in c["decisions"]), c["decisions"]
        assert c["thumbnail"] and c["thumbnail"].endswith(".png"), c
        st, h, body = raw(f"/captures/{c['id']}/thumb", maya)
        assert st == 200 and h["Content-Type"] == "image/png" and h["X-Content-Type-Options"] == "nosniff" and "sandbox" in h["Content-Security-Policy"] and body[:4] == b"\x89PNG", (st, h)
        fs_ = files_of(data, c["id"])
        assert any(f.endswith(f"files/captures/{c['id']}.md") for f in fs_) and any(f.endswith(f"files/captures/{c['id']}.json") for f in fs_), fs_
        md = next(Path(data).rglob(c["id"] + ".md")).read_text()
        assert md.startswith("---\n") and '"kind": "article"' not in md and 'kind: "article"' in md and "## Summary" in md and "## Action items" in md and "- [ ]" in md, md[:600]
        js = json.loads(next(Path(data).rglob(c["id"] + ".json")).read_text())
        for k in ["source", "kind", "title", "author", "published", "thumbnail", "summary", "points", "actions", "tags", "links", "by"]:
            assert k in js, k
        print(f"  article read in {time.time() - t0:.1f}s")
        # dedupe (tracking params, trailing slash)
        d2 = ok(api("/captures", "POST", {"url": F + "/article/?fbclid=abc"}, token=orion))
        assert d2["duplicate"] and d2["capture"]["id"] == c["id"], d2

        # ---------- charsets, size caps ----------
        lat = ok(api("/captures", "POST", {"url": F + "/latin1"}, token=maya))["capture"]
        assert lat["title"] == "Café crème notes" and "très bon" in lat["text"], lat["title"]
        t0 = time.time(); huge = ok(api("/captures", "POST", {"url": F + "/huge"}, token=maya), "huge")["capture"]
        assert huge["status"] == "ready" and "very long" in huge["note"] and huge["words"] > 1000 and time.time() - t0 < 25, (huge["note"], huge["words"], time.time() - t0)

        # ---------- SSRF: private addresses, redirects, schemes (nothing is saved) ----------
        before = len(list(Path(data).rglob("files/captures/*.json")))
        for bad in [F + "/redir-private", F + "/redir-meta", f"http://localhost:{PORT}/api/health", f"http://127.0.0.1:{PORT}/api/health", "http://169.254.169.254/latest/meta-data/",
                    "http://[::1]:22/", "http://10.0.0.1/", "http://0x7f.0.0.1/", "http://[::ffff:127.0.0.1]/"]:
            st, d = api("/captures", "POST", {"url": bad}, token=maya)
            assert st == 422 and ("private" in d["error"] or "couldn't" in d["error"].lower() or "find" in d["error"]), (bad, st, d)
        for bad in ["file:///etc/passwd", "javascript:alert(1)", "not a link", "ftp://x.test/"]:
            st, d = api("/captures", "POST", {"url": bad}, token=maya)
            assert st == 400, (bad, st, d)
        st, d = api("/captures", "POST", {"url": "http://user:pw@example.com/"}, token=maya)
        assert st == 422 and "password" in d["error"], d
        assert len(list(Path(data).rglob("files/captures/*.json"))) == before, "blocked links are never saved"
        st, d = api("/captures", "POST", {"url": F + "/login"}, token=maya)
        assert st == 422 and "private or needs a login" in d["error"], d

        # ---------- XSS stays text; no SVG thumbnails; robots ----------
        x = ok(api("/captures", "POST", {"url": F + "/xss"}, token=maya))["capture"]
        assert x["title"].startswith('<img src=x onerror="window.__xss=1">') and x["thumbnail"] is None, (x["title"], x["thumbnail"])
        xmd = next(Path(data).rglob(x["id"] + ".md")).read_text()
        import re; assert not re.search(r"(?<!\\)<(img|script|b )", xmd.split("---", 2)[2]) and "\\<img" in xmd and "\\<script\\>" in xmd, xmd[:800]
        na = ok(api("/captures", "POST", {"url": F + "/noarchive"}, token=maya))["capture"]
        assert na["status"] == "metadata" and not na["text"] and "asks not to be saved" in na["note"] and "Secret long body" not in json.dumps(na), na

        # ---------- oEmbed: YouTube, TikTok, Instagram ----------
        yt = ok(api("/captures", "POST", {"url": "https://www.youtube.com/watch?v=abc123XYZ00"}, token=maya))["capture"]
        assert yt["kind"] == "video" and yt["site"] == "YouTube" and yt["title"].startswith("Boss fight dev log") and yt["author"] == "Pixel Crew" and yt["thumbnail"], yt
        assert "Paste the transcript" in yt["note"], yt["note"]
        tt = ok(api("/captures", "POST", {"url": "https://www.tiktok.com/@jumpcat/video/7300000000000000000"}, token=maya))["capture"]
        assert tt["kind"] == "short" and tt["site"] == "TikTok" and tt["author"] == "jumpcat", tt
        ig = ok(api("/captures", "POST", {"url": "https://www.instagram.com/p/CxYz123/"}, token=maya))["capture"]
        assert ig["site"] == "Instagram" and "pixel art tileset" in ig["text"] and "<script>x</script>" in ig["text"] and "embed.js" not in json.dumps(ig), ig
        ok(api("/captures", "POST", {"url": "https://www.youtube.com/watch?v=nocaps12345"}, token=maya))

        # ---------- packs: host only, terms, checksum ----------
        pk = ok(api("/packs", token=maya))
        assert not pk["host"] and all("source" not in p for p in pk["packs"]), pk
        assert api("/packs/yt-dlp/install", "POST", {"accept": True}, token=maya)[0] == 403
        assert api("/packs/yt-dlp/install", "POST", {}, token=orion)[0] == 400, "the terms note must be accepted"
        ok(api("/packs/yt-dlp/install", "POST", {"accept": True}, token=orion))
        ok(api("/packs/whisper-tiny/install", "POST", {}, token=orion))
        ok(api("/packs/bad/install", "POST", {}, token=orion))
        packs = lambda: {p["id"]: p for p in ok(api("/packs", token=orion))["packs"]}
        until(lambda: packs()["yt-dlp"]["installed"] and packs()["whisper-tiny"]["ready"] and packs()["bad"].get("error"), "packs installed")
        assert "checksum" in packs()["bad"]["error"] and not packs()["bad"]["installed"], packs()["bad"]
        assert packs()["whisper-tiny"]["engine"] and packs()["whisper-tiny"]["installedBytes"] > 0
        ytd = next(Path(data).rglob("yt-dlp@test-1/yt-dlp")); assert os.stat(ytd).st_mode & stat.S_IXUSR, "executable bit"
        assert not list(Path(data).rglob(".tmp-*")), "no half downloads left"

        # ---------- video captions (yt-dlp) and audio -> whisper ----------
        assert api(f"/captures/{yt['id']}/transcribe", "POST", {}, token=maya)[0] == 400, "off until the host turns it on"
        assert api("/captures/settings", "PATCH", {"videoTools": True}, token=maya)[0] == 403
        ok(api("/captures/settings", "PATCH", {"videoTools": True}, token=orion))
        assert api(f"/captures/{yt['id']}/transcribe", "POST", {}, token=atok)[0] == 403, "a person starts video transcripts"
        v = ok(api(f"/captures/{yt['id']}/transcribe", "POST", {}, token=maya), "captions")["capture"]
        assert v["status"] == "ready" and v["transcriptVia"] == "published captions" and v["transcript"][1]["t"] == 5 and "two phases" in v["transcript"][1]["text"], v["transcript"]
        assert any("two phases" in d["text"] and d["t"] == 5 for d in v["decisions"]), v["decisions"]
        assert any("wind-up" in a["text"] for a in v["actions"]), v["actions"]
        nc = ok(api("/captures?q=no+captions", token=maya))["captures"][0]
        v2 = ok(api(f"/captures/{nc['id']}/transcribe", "POST", {}, token=maya), "whisper video")["capture"]
        assert v2["transcriptVia"].startswith("local transcript") and v2["transcript"][1]["t"] == 4.2 and "lantern" in v2["transcript"][1]["text"], v2["transcript"]
        assert any(a["text"].startswith("Maya: paint the lantern sprite") for a in v2["actions"]), v2["actions"]
        pv = ok(api("/captures", "POST", {"url": "https://www.youtube.com/watch?v=private1234"}, token=maya))["capture"]
        st, d = api(f"/captures/{pv['id']}/transcribe", "POST", {}, token=maya)
        assert st == 400 and "private or needs a login" in d["error"], d
        # a new video link with the tool on gets its captions on its own
        auto = ok(api("/captures", "POST", {"url": "https://youtu.be/autocaps001"}, token=maya))["capture"]
        until(lambda: ok(api(f"/captures/{auto['id']}", token=maya))["capture"]["status"] == "ready", "auto captions")

        # ---------- voice notes ----------
        audio = base64.b64encode(b"\x1aE\xdf\xa3fake webm audio").decode()
        vn = ok(api("/captures/voice", "POST", {"data": audio, "mime": "audio/webm", "dur": 9, "lines": [{"t": 1, "text": "browser words"}], "recipe": "meeting"}, token=maya))["capture"]
        assert vn["status"] == "working" and vn["recipe"] == "meeting", vn
        vn = until(lambda: (lambda c: c if c["status"] == "ready" else None)(ok(api(f"/captures/{vn['id']}", token=maya))["capture"]), "whisper voice")
        assert vn["transcriptVia"].startswith("local") and vn["transcript"][2]["t"] == 6.5 and any(a["text"].startswith("Orion: tune the shield timing") for a in vn["actions"]), vn
        st, h, body = raw(f"/captures/{vn['id']}/audio", maya)
        assert st == 200 and h["Content-Type"] == "audio/webm" and body.startswith(b"\x1aE"), (st, h)
        assert api("/captures/voice", "POST", {"data": audio, "mime": "image/svg+xml"}, token=maya)[0] == 415
        # remove whisper: a voice note with no transcript asks for one; pasting fills the notes
        ok(api("/packs/whisper-tiny", "DELETE", token=orion)); assert not packs()["whisper-tiny"]["installed"]
        bare = ok(api("/captures/voice", "POST", {"data": audio, "mime": "audio/webm", "dur": 4}, token=maya))["capture"]
        assert bare["status"] == "needs-transcript" and "Transcript unavailable" in bare["note"], bare
        pasted = ok(api(f"/captures/{bare['id']}", "PATCH", {"transcript": "[00:02] We decided the boss music stays.\n[00:05] Kai will mix the boss music by Friday."}, token=maya))["capture"]
        assert pasted["status"] == "ready" and pasted["transcript"][1]["t"] == 5 and any("Kai: mix the boss music" in a["text"] for a in pasted["actions"]), pasted
        # the chat's voice note -> notes (browser transcript)
        cv = ok(api("/chat/general/voice", "POST", {"data": audio, "mime": "audio/webm", "dur": 3, "transcript": "Remember to playtest the cave on Sunday. Kai will bring snacks."}, token=maya))["message"]
        cvn = ok(api("/captures/voice", "POST", {"channel": "general", "message": cv["id"]}, token=maya))["capture"]
        assert cvn["audio"] and cvn["transcriptVia"] == "your browser" and any("Kai: bring snacks" in a["text"] for a in cvn["actions"]), cvn

        # ---------- DM privacy ----------
        dm = "dm-" + "-".join(sorted([mem["Orion"], mem["Maya"]]))
        dv = ok(api("/captures/voice", "POST", {"channel": dm, "lines": [{"t": 0, "text": "Secret surprise: we decided the launch party is on Saturday."}], "title": "Party plan", "post": True}, token=maya))["capture"]
        assert ok(api(f"/captures/{dv['id']}", token=orion))["capture"]["dm"] == dm
        assert api(f"/captures/{dv['id']}", token=kai)[0] == 404, "DM captures stay in the DM"
        assert dv["id"] not in [x["id"] for x in ok(api("/captures", token=kai))["captures"]]
        assert dv["id"] not in [x["id"] for x in ok(api("/captures?q=party", token=kai))["captures"]]
        assert not ok(api("/captures/ask?q=" + urllib.parse.quote("what did we decide about the launch party"), token=kai))["quotes"]
        assert ok(api("/captures/ask?q=" + urllib.parse.quote("what did we decide about the launch party"), token=orion))["quotes"]
        assert "Party plan" not in mcp(atok, "captures_search", {"query": "party"})[1], "an agent (not in that DM) doesn't see it"
        assert api("/captures/voice", "POST", {"channel": dm, "lines": [{"t": 0, "text": "x"}]}, token=kai)[0] == 403
        dmchat = ok(api(f"/chat/{dm}?limit=20", token=orion))["messages"]
        assert any(m.get("capture", {}).get("id") == dv["id"] for m in dmchat), "the card lands in the DM only"
        assert not any(m.get("capture", {}).get("id") == dv["id"] for m in ok(api("/chat/general?limit=200", token=kai))["messages"])

        # ---------- spectators read only ----------
        assert api("/captures", token=sam)[0] == 200
        assert api("/captures", "POST", {"url": F + "/article2"}, token=sam)[0] == 403
        assert api(f"/captures/{c['id']}", "PATCH", {"summary": "x"}, token=sam)[0] == 403
        assert api(f"/captures/{c['id']}/tasks", "POST", {"items": [0]}, token=sam)[0] == 403

        # ---------- keep / discard learning ----------
        w0 = ok(api("/captures/weights", token=maya))
        full = ok(api(f"/captures/{c['id']}", token=maya))["capture"]
        keep = full["points"][1:-1]; keep[0] = {**keep[0], "text": keep[0]["text"] + " (edited)"}
        r = ok(api(f"/captures/{c['id']}", "PATCH", {"points": [{"id": p["id"], "text": p["text"]} for p in keep] + [{"text": "A point I wrote myself"}]}, token=maya))
        assert r["learned"] >= 3 and r["capture"]["edited"]["points"] and r["capture"]["points"][-1]["human"], r["learned"]
        w1 = ok(api("/captures/weights", token=maya))
        assert w1["signals"] >= 3 and w1["weights"] != w0["weights"] and list(Path(data).rglob("captures-weights.json")), w1
        again = ok(api(f"/captures/{c['id']}/summarize", "POST", {"depth": "quick"}, token=maya))["capture"]
        assert not again["edited"].get("points"), "summarize again replaces the points"
        assert api("/captures/weights", "DELETE", token=maya)[0] == 403
        assert ok(api("/captures/weights", "DELETE", token=orion))["signals"] == 0
        st, d = api(f"/captures/{c['id']}/summarize", "POST", {"depth": "model"}, token=maya)
        assert st == 503 and "No AI is set up" in d["error"], (st, d)

        # ---------- Make tasks: people only ----------
        n0 = len(ok(api("/tasks", token=orion))["tasks"])
        assert api(f"/captures/{v['id']}/tasks", "POST", {"items": [0]}, token=atok)[0] == 403, "agents can't make tasks"
        made = ok(api(f"/captures/{v['id']}/tasks", "POST", {"items": [0]}, token=maya))
        assert len(made["tasks"]) == 1 and made["capture"]["actions"][0]["task"] == made["tasks"][0]["id"] and made["tasks"][0]["source"] == "capture"
        assert len(ok(api(f"/captures/{v['id']}/tasks", "POST", {"items": [0]}, token=maya))["tasks"]) == 0, "no duplicate tasks"
        assert len(ok(api("/tasks", token=orion))["tasks"]) == n0 + 1

        # ---------- MCP: agents capture and read, never make tasks ----------
        res, txt = mcp(atok, "capture_link", {"url": F + "/article2"})
        assert not res.get("isError") and "Coyote time explained" in txt and "Make tasks" in txt, txt
        cid2 = json.loads(txt)["id"]
        res, txt = mcp(atok, "capture_read", {"id": cid2}); assert "coyote time" in txt.lower() and not res.get("isError")
        res, txt = mcp(atok, "captures_search", {"query": "pixel scaling"}); assert c["id"] in txt, txt
        res, txt = mcp(atok, "capture_summarize", {"id": cid2, "depth": "quick"}); assert not res.get("isError")
        res, txt = mcp(atok, "capture_link", {"url": "http://10.0.0.9/"}); assert res.get("isError") and "private" in txt
        assert len(ok(api("/tasks", token=orion))["tasks"]) == n0 + 1, "MCP capture tools never create tasks"
        assert not ok(api("/approvals", token=orion)).get("approvals", []) or all("capture" not in json.dumps(a).lower() for a in ok(api("/approvals", token=orion))["approvals"])
        res, txt = mcp(atok, "capture_recipe_propose", {"id": "standup", "title": "Standup", "emoji": "☀️", "sections": ["summary", "actions"], "key": ["blocked", "yesterday"]})
        assert not res.get("isError"), txt
        rec = ok(api("/captures/recipes", token=maya)); assert [p["id"] for p in rec["pending"]] == ["standup"] and "standup" not in [r["id"] for r in rec["recipes"]]
        assert api("/captures/recipes/standup/approve", "POST", {}, token=atok)[0] == 403, "a person approves recipes"
        rec = ok(api("/captures/recipes/standup/approve", "POST", {}, token=maya)); assert "standup" in [r["id"] for r in rec["recipes"]] and not rec["pending"]
        su = ok(api(f"/captures/{pasted['id']}", "PATCH", {"recipe": "standup"}, token=maya))["capture"]; assert su["sections"] == ["summary", "actions"]

        # ---------- Flint: what did we decide ----------
        a = ok(api("/captures/ask?q=" + urllib.parse.quote("what did we decide about the boss phases?"), token=maya))
        assert a["quotes"] and "two phases" in a["quotes"][0]["text"] and a["quotes"][0]["at"] == "00:05", a

        # ---------- auto-capture a pasted link in chat ----------
        ok(api("/chat/general/send", "POST", {"text": F + "/latin1#again"}, token=kai))
        card = until(lambda: next((m for m in ok(api("/chat/general?limit=50", token=kai))["messages"] if m.get("capture") and m["capture"]["id"] == lat["id"]), None), "auto card")
        assert card["by"] == "tribecode" and "already saved" in card["text"], card
        ok(api("/chat/general/send", "POST", {"text": F + "/thumb.png"}, token=kai)); time.sleep(1)
        assert not any(m.get("capture") and "thumb" in m["capture"].get("url", "") for m in ok(api("/chat/general?limit=50", token=kai))["messages"]), "pictures are not captured"

        # ---------- delete permissions ----------
        assert api(f"/captures/{lat['id']}", "DELETE", token=kai)[0] == 403, "only the author or an admin deletes"
        assert api(f"/captures/{lat['id']}", "DELETE", token=atok)[0] == 403
        ok(api(f"/captures/{huge['id']}", "DELETE", token=maya)); assert not files_of(data, huge["id"])

        # ---------- UI ----------
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            pg = login(b, {"width": 1280, "height": 860}, "Orion", orion)
            pg.evaluate("TribeShell.go('captures')")
            pg.wait_for_selector("#view-captures:not(.hidden) .cap-row")
            assert pg.locator("#wt-captures.on").count() == 1, "Files › Captures tab"
            assert pg.locator("#view-captures .btn.primary").count() == 1, "one primary action"
            # XSS never renders
            pg.fill("#cap-q", "Totally safe"); pg.wait_for_function("document.querySelectorAll('#cap-list .cap-row').length === 1")
            pg.click("#cap-list .cap-row"); pg.wait_for_selector(".cap-notes")
            pg.wait_for_timeout(300)
            assert pg.evaluate("window.__xss === undefined && !document.querySelector('.cap-notes img[src=x], .cap-notes script, .cap-notes b[onmouseover]')"), "XSS stayed text"
            assert '<img src=x onerror="window.__xss=1"> Totally safe' == pg.input_value("#cap-title")
            pg.click("#cap-back"); pg.fill("#cap-q", ""); pg.wait_for_function("document.querySelectorAll('#cap-list .cap-row').length > 5")
            # notes editor: delete a point, edit the summary, make tasks
            pg.evaluate(f"TribeCaptures.open({json.dumps(cid2)})"); pg.wait_for_selector(".cap-notes #cap-points .cap-i")
            n = pg.locator("#cap-points .cap-i").count()
            pg.locator("#cap-points .cap-i .cap-x").first.click()
            pg.wait_for_function("(document.querySelector('#cap-saved') || {}).textContent.startsWith('Saved')", timeout=5000)
            assert len(ok(api(f"/captures/{cid2}", token=orion))["capture"]["points"]) == n - 1
            pg.fill("#cap-sum", "My own summary of coyote time.")
            pg.wait_for_function("(document.querySelector('#cap-saved') || {}).textContent.startsWith('Saved')", timeout=5000); pg.wait_for_timeout(900)
            assert ok(api(f"/captures/{cid2}", token=orion))["capture"]["summary"] == "My own summary of coyote time."
            if pg.locator("#cap-tasks").count():
                pg.click("#cap-tasks"); pg.wait_for_selector("#cap-actions .cap-tk")
            # the chat card opens the notes
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector(".cap-card [data-cap-notes]")
            pg.locator(".cap-card [data-cap-notes]").last.click(); pg.wait_for_selector(".cap-notes")
            pg.evaluate(f"TribeCaptures.open({json.dumps(c['id'])})"); pg.wait_for_selector(".cap-notes .cap-i"); pg.wait_for_timeout(300)
            pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "captures-desktop.png"))
            # message menu: Read & summarize
            # Settings › Packs (host)
            pg.evaluate("localStorage.setItem('tribecode.set.more','1'); TribeSettings.open()"); pg.wait_for_selector("#set-packs .pk-row")
            assert pg.locator("#set-packs [data-pk-rm]").count() >= 1 and pg.locator("#set-packs").inner_text().count("MB") + pg.locator("#set-packs").inner_text().count("KB") >= 1
            pg.evaluate("TribeSettings.close()")
            # Flint
            pg.evaluate("TribeFlint.ask('what did we decide about the boss phases?')")
            pg.wait_for_function("TribeFlint.thread().slice(-1)[0].who === 'flint' && /two phases/.test(TribeFlint.thread().slice(-1)[0].text)", timeout=8000)
            pg.evaluate(f"TribeFlint.ask('summarize {F}/article2')")
            pg.wait_for_function("TribeFlint.thread().slice(-1)[0].who === 'flint' && /Coyote time explained/.test(TribeFlint.thread().slice(-1)[0].text)", timeout=8000)
            # desktop recorder: fake mic, no speech -> the host has no whisper now: paste fallback
            pg.evaluate("TribeCaptures.recorder()"); pg.wait_for_selector("#cap-rec #cap-rec-stop"); pg.wait_for_timeout(1500)
            pg.click("#cap-rec-stop"); pg.wait_for_selector(".cap-notes #cap-paste", timeout=10000)
            assert "Transcript unavailable" in pg.locator(".cap-note").inner_text()

            # phone 390
            ph = login(b, {"width": 390, "height": 844}, "Maya", maya, mobile=True)
            ph.evaluate("TribeApp.show('docs')"); ph.wait_for_selector("#cap-m2 .cap-row", timeout=10000)
            ph.click("#cap-m2-all"); ph.wait_for_selector("#view-captures:not(.hidden) .cap-row")
            sw = lambda: ph.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]")
            assert max(sw()[:2]) <= 390, f"captures list, no sideways scroll: {sw()}"
            ph.wait_for_timeout(300); ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "captures-phone.png"))
            ph.evaluate(f"TribeCaptures.open({json.dumps(v['id'])})"); ph.wait_for_selector(".cap-notes .cap-i")
            assert max(sw()[:2]) <= 390, f"notes, no sideways scroll: {sw()}"
            ph.evaluate(f"TribeCaptures.open({json.dumps(c['id'])})"); ph.wait_for_selector(".cap-notes .cap-i")
            assert max(sw()[:2]) <= 390, f"article notes: {sw()}"
            ph.evaluate("TribeApp.show('chat')"); ph.wait_for_selector(".cap-card")
            cw = ph.evaluate("Math.max(...[...document.querySelectorAll('.cap-card')].map(e => e.getBoundingClientRect().right))")
            assert cw <= 390 and max(sw()[:2]) <= 390, f"chat cards fit: {cw} {sw()}"
            ph.evaluate("TribeCaptures.recorder()"); ph.wait_for_selector("#cap-rec #cap-rec-stop")
            box = ph.evaluate("(() => { const r = document.querySelector('.cap-rec-card').getBoundingClientRect(); return [r.left, r.right]; })()")
            assert box[0] >= 0 and box[1] <= 390, f"recorder fits: {box}"
            ph.click("#cap-rec-x"); ph.wait_for_function("!document.querySelector('#cap-rec')")
            b.close()
        assert not errors, "\n".join(errors)
        print("e2e_captures: OK (article + noise, files, dedupe, charsets, size cap, SSRF + XSS blocks, no SVG, robots, oEmbed x3, packs + checksum, captions, whisper, voice notes, paste fallback, DM privacy, spectators, keep/discard, tasks, MCP, recipes, Flint, auto-capture, UI, phone 390)")
    finally:
        srv.terminate()
        try:
            out = srv.communicate(timeout=5)[0].decode(errors="replace")
            if os.environ.get("SHOW_LOG"): print(out)
        except Exception: pass
        fake.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback; traceback.print_exc(); sys.exit(1)
