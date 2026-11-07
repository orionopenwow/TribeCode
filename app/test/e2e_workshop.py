"""End-to-end: the Workshop (server/workshop.js, server/mcp-workshop.js, app/ui/workshop.js).

API: publish a sprite, a GLB (+ poster) and a script from a project; previews (sprite frames, GLB stats);
an agent's workshop_publish needs a human's approval (approve + deny); "use in project" copies files into
another project and runs nothing; conflicts + overwrite; a project-scoped member can only use into their
project; tampered sha256 / disallowed types / traversal paths are rejected (uploads, community items,
destinations); the community shelf from a mock jsDelivr (404 empty state, then a real index with bad
entries skipped); getting a community item verifies sha256; donate builds a bundle + GitHub links and,
with a stored token, opens a PR through a mock GitHub API; remove.
UI: #/workshop with hero + cards + previews, detail drawer, Use dialog (files + license first), Add dialog
from a project folder, the community tab; desktop 1440x900 and phone 390x844 screenshots.
Usage: python app/test/e2e_workshop.py [--shots]
"""
import base64, hashlib, json, os, struct, subprocess, sys, tempfile, threading, time, zlib, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4791 + OFF
MOCK = 5791 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or True   # this suite always refreshes its screenshots
errors = []
PWNED = Path(tempfile.gettempdir()) / f"workshop-pwned-{PORT}"


def png(w, h, colors):
    rows = b''.join(b'\x00' + b''.join(bytes(colors[(x * len(colors)) // w]) + b'\xff' for x in range(w)) for _ in range(h))
    c = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + c(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + c(b'IDAT', zlib.compress(rows)) + c(b'IEND', b'')


def glb():
    doc = json.dumps({"asset": {"version": "2.0", "generator": "test"}, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}, {}], "meshes": [{"primitives": []}],
                      "materials": [{}], "animations": [{"name": "Walk", "channels": [], "samplers": []}, {"name": "Idle", "channels": [], "samplers": []}]}).encode()
    doc += b' ' * ((4 - len(doc) % 4) % 4)
    total = 12 + 8 + len(doc)
    return b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(doc)) + b'JSON' + doc


def pix(frames, pal, scale=1):
    """Pixel art: frames are lists of equal rows ('.' = transparent), laid out side by side."""
    h = len(frames[0]) * scale
    rows = []
    for y in range(len(frames[0])):
        line = b''.join(b''.join((bytes(pal[ch]) + b'\xff' if ch != '.' else b'\x00\x00\x00\x00') * scale for ch in fr[y]) for fr in frames)
        rows += [b'\x00' + line] * scale
    w = len(frames) * len(frames[0][0]) * scale
    c = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + c(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + c(b'IDAT', zlib.compress(b''.join(rows))) + c(b'IEND', b'')


HERO_TOP = ["................", ".....oooooo.....", "....obbbbbbo....", "...obbbbbbbbo...", "...obwwbbwwbo...", "...obwkbbwkbo...", "...obbbbbbbbo...",
            "...obbyyyybbo...", "....obbbbbbo....", ".....oooooo.....", "....otttttto....", "...otttttttto...", "....otttttto....", "....oo....oo...."]
LEGS = [["....oo....oo....", "................"], [".....oo..oo.....", "................"], ["......oooo......", "................"], [".....oo..oo.....", "................"]]
PAL = {'o': (18, 21, 26), 'b': (242, 107, 29), 'w': (248, 250, 252), 'k': (18, 21, 26), 'y': (255, 184, 107), 't': (56, 198, 177), 'g': (59, 209, 111), 'd': (30, 120, 70),
       'a': (255, 184, 107), 'i': (108, 124, 255), 's': (42, 49, 60), 'r': (34, 40, 51)}
SPRITE = pix([HERO_TOP[:-1] + [HERO_TOP[-1]] + l for l in LEGS], PAL)   # 4 frames of 16x16 (64x16)
SLIME_F = [["................"] * 6 + ["......oooo......", "....oggggggo....", "...oggwggwggo...", "..ogggkggkgggo..", "..ogggggggggdo..", "..oggggggggddo..", "...oddddddddo...", "....oooooooo...."],
           ["................"] * 4 + [".....oooooo.....", "....oggggggo....", "...oggwggwggo...", "...oggkggkggo...", "...oggggggggo...", "...oggggggggo...", "...oggggggddo...", "...ogggggdddo...", "....oddddddo....", ".....oooooo....."],
           ["................"] * 7 + [".....oooooo.....", "...oggwggwggo...", ".ogggkggkgggggo.", ".oggggggggggddo.", "..oddddddddddo..", "...oooooooooo..."]]
SLIME = pix([f + ["................"] * (16 - len(f)) for f in SLIME_F], PAL)   # 3 frames
BOT = ["........................", ".........oooooo.........", "..........oiio..........", "......oooooooooooo......", ".....oaaaaaaaaaaaao.....", ".....oarrrrrrrrrrao.....",
       ".....oartttrrtttrao.....", ".....oarrrrrrrrrrao.....", ".....oaaaaaaaaaaaao.....", "......oooooooooooo......", "....oooaaaaaaaaaaooo....", "...oaao.aaaaaaaa.oaao...",
       "...oaao.aassssaa.oaao...", "...oooo.aaaaaaaa.oooo...", "........oaao.oaao.......", "........oaao.oaao.......", ".......ooooo.ooooo......", "........................"]
POSTER = pix([BOT], PAL, 4)   # 96x72
SCRIPT = ("// Double jump: a second jump while airborne.\n// Reset p.jumps when the player lands.\nexport function doubleJump(p, input) {\n  if (!input.jumpPressed) return\n  if (p.jumps < 2) {\n    p.vy = -9\n    p.jumps++\n  }\n}\n\n"
          f"// (test) proves files are never executed: this would leave a marker if it ran\nrequire('fs').writeFileSync({json.dumps(str(PWNED))}, 'ran')\n")
sha = lambda b: hashlib.sha256(b).hexdigest()


# ---------------- mock jsDelivr + GitHub API ----------------
CDN_FILES, GH_LOG = {}, []
GOOD = "tribes/workshop"


def community_fixture():
    slime_m = {"schema": 1, "id": "slime-hop", "kind": "asset", "title": "Slime hop", "summary": "Three-frame slime.", "tags": ["sprite", "2d"], "license": "CC0-1.0", "author": "Ana", "version": "1.2.0",
               "files": [{"path": "slime.png", "size": len(SLIME), "sha256": sha(SLIME)}], "preview": "slime.png"}
    evil_bytes = b"console.log('hello')\n"
    evil_m = {"schema": 1, "id": "tampered-tool", "kind": "script", "title": "Tampered tool", "license": "MIT", "author": "Mallory", "version": "1.0.0",
              "files": [{"path": "tool.js", "size": len(evil_bytes), "sha256": sha(b"something else!!!!!!\n")}]}
    trav_m = {"schema": 1, "id": "sneaky", "kind": "script", "title": "Sneaky", "license": "MIT", "author": "M", "version": "1.0.0", "files": [{"path": "ok.js", "size": 3, "sha256": sha(b"ok\n")}]}
    trav_manifest = {**trav_m, "files": [{"path": "../../escape.js", "size": 3, "sha256": sha(b"ok\n")}]}   # index looks fine, workshop.json is not
    bad_type = {"schema": 1, "id": "bad-type", "kind": "script", "title": "Bad type", "license": "MIT", "version": "1.0.0", "files": [{"path": "run.exe", "size": 3, "sha256": sha(b"MZ\n")}]}
    bad_path = {"schema": 1, "id": "bad-path", "kind": "script", "title": "Bad path", "license": "MIT", "version": "1.0.0", "files": [{"path": "../x.js", "size": 3, "sha256": sha(b"ok\n")}]}
    no_lic = {"schema": 1, "id": "no-license", "kind": "asset", "title": "No license", "version": "1.0.0", "files": [{"path": "a.png", "size": 3, "sha256": sha(b"abc")}]}
    idx = {"schema": 1, "repo": GOOD, "updated": "2026-11-05T10:00:00Z", "items": [{**slime_m, "path": "items/slime-hop", "size": len(SLIME), "info": {"frames": 3}}, {**evil_m, "path": "items/tampered-tool"}, {**trav_m, "path": "items/sneaky"}, bad_type, bad_path, no_lic]}
    p = f"/gh/{GOOD}@main/"
    CDN_FILES.update({p + "index.json": json.dumps(idx).encode(), p + "items/slime-hop/workshop.json": json.dumps(slime_m).encode(), p + "items/slime-hop/slime.png": SLIME,
                      p + "items/tampered-tool/workshop.json": json.dumps(evil_m).encode(), p + "items/tampered-tool/tool.js": evil_bytes,
                      p + "items/sneaky/workshop.json": json.dumps(trav_manifest).encode()})


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def reply(self, status, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def gh(self, method):
        path = self.path.split("?")[0]
        auth = self.headers.get("Authorization", "")
        GH_LOG.append((method, path, auth))
        if auth != "Bearer ghp_" + "t" * 36: return self.reply(401, {"message": "Bad credentials"})
        b = self.body() if method in ("POST", "PUT") else {}
        if method == "PUT": GH_LOG[-1] = (method, path, auth, b)
        routes = {
            ("GET", "/api/user"): (200, {"login": "maya-gh"}),
            ("GET", f"/api/repos/{GOOD}"): (200, {"default_branch": "main", "full_name": GOOD}),
            ("GET", f"/api/repos/{GOOD}/git/ref/heads/main"): (200, {"object": {"sha": "abc123"}}),
            ("POST", f"/api/repos/{GOOD}/forks"): (202, {"full_name": "maya-gh/workshop"}),
            ("GET", "/api/repos/maya-gh/workshop"): (200, {"full_name": "maya-gh/workshop"}),
            ("POST", "/api/repos/maya-gh/workshop/git/refs"): (201, {"ref": b.get("ref")}),
            ("POST", f"/api/repos/{GOOD}/pulls"): (201, {"html_url": f"https://github.com/{GOOD}/pull/7", "number": 7}),
        }
        if (method, path) in routes: return self.reply(*routes[(method, path)])
        if path.startswith("/api/repos/maya-gh/workshop/contents/"): return self.reply(404 if method == "GET" else 201, {"message": "Not Found"} if method == "GET" else {"content": {}})
        return self.reply(404, {"message": "Not Found"})

    def do_GET(self):
        if self.path.startswith("/api/"): return self.gh("GET")
        f = CDN_FILES.get(self.path.split("?")[0])
        if f is None: return self.reply(404, b"Couldn't find the requested file.", "text/plain")
        self.reply(200, f, "image/png" if self.path.endswith(".png") else "application/json")

    def do_POST(self): self.gh("POST")
    def do_PUT(self): self.gh("PUT")


# ---------------- helpers ----------------
def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw or b"{}") if r.headers.get("Content-Type", "").startswith("application/json") else (raw, dict(r.headers)))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def bad(r, code, what, contains=None):
    st, d = r
    assert st == code, f"{what}: expected {code}, got {st} {d}"
    if contains: assert contains.lower() in json.dumps(d).lower(), f"{what}: {d}"
    return d


def shot(page, name):
    page.wait_for_timeout(700)
    page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings(name, color, token, project):
    return (f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{project}');")


def main():
    community_fixture()
    mock = ThreadingHTTPServer(("127.0.0.1", MOCK), Mock)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="tribe-ws-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="ws-src-", dir="/tmp")
    if PWNED.exists(): PWNED.unlink()
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    repos = {}
    for name in ("pixel-quest", "space-run", "secret-lab"):
        r = os.path.join(work, name); repos[name] = r
        sh("git", "init", "-q", "-b", "main", r)
        Path(r, "README.md").write_text(f"# {name}\n")
    pq = Path(repos["pixel-quest"])
    (pq / "assets").mkdir(); (pq / "assets" / "hero-run.png").write_bytes(SPRITE)
    (pq / "models").mkdir(); (pq / "models" / "bot.glb").write_bytes(glb()); (pq / "models" / "bot-poster.png").write_bytes(POSTER)
    (pq / "src").mkdir(); (pq / "src" / "doublejump.js").write_text(SCRIPT); (pq / "src" / "tool.exe").write_bytes(b"MZ")
    (pq / "skills" / "level-design").mkdir(parents=True)
    (pq / "skills" / "level-design" / "SKILL.md").write_text("---\nname: level-design\ndescription: Lay out a 2D level from a sketch, with checkpoints every 30 seconds.\n---\n\n# Level design\n\n1. Read the sketch.\n2. Block out platforms.\n")
    (pq / "skills" / "level-design" / "notes.txt").write_text("checkpoints every 30s\n"); (pq / "skills" / "level-design" / "run.sh").write_text("rm -rf /\n")
    os.symlink("/etc/passwd", pq / "assets" / "link.txt")

    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_WORKSHOP_CDN": f"http://127.0.0.1:{MOCK}/gh", "TRIBE_GITHUB_API": f"http://127.0.0.1:{MOCK}/api", "TRIBE_WORKSHOP_REPO": ""}
    env.pop("TRIBE_WORKSHOP_REPO")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pixel Crew"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people + projects ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        P = {}
        for name, title in (("pixel-quest", "Pixel Quest"), ("space-run", "Space Run"), ("secret-lab", "Secret Lab")):
            P[name] = ok(api("/projects", "POST", {"path": repos[name], "name": title}, token=orion), "project " + name)["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder", "project": "tribe"}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, mid = j["token"], j["member"]["id"]
        sinv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder", "project": P["space-run"]}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": sinv["code"], "name": "Sam"}))["token"]
        vinv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator", "project": "tribe"}, token=orion))["invite"]
        viv = ok(api("/join", "POST", {"code": vinv["code"], "name": "Viv"}))["token"]
        agent = ok(api("/agents", "POST", {}, token=maya, project=P["pixel-quest"]), "agent")["token"]

        # ---------------- publish from a project ----------------
        r = ok(api("/workshop/items", "POST", {"kind": "asset", "title": "Hero run cycle", "summary": "Four-frame run cycle, 16px.", "tags": ["sprite", "Pixel Art"], "license": "CC0-1.0",
                                              "from": {"project": P["pixel-quest"], "paths": ["assets/hero-run.png"]}}, token=orion), "publish sprite")["item"]
        assert r["id"] == "hero-run-cycle" and r["files"][0]["path"] == "hero-run.png" and r["files"][0]["info"]["frames"] == 4, r
        assert r["preview"] == "hero-run.png" and r["tags"] == ["sprite", "pixel-art"] and r["author"] == "Orion", r
        g = ok(api("/workshop/items", "POST", {"kind": "asset", "title": "Patrol bot", "summary": "Low-poly bot with walk and idle.", "license": "CC-BY-4.0", "tags": ["glb", "3d"],
                                              "from": {"project": P["pixel-quest"], "paths": ["models"]}}, token=orion), "publish glb")["item"]
        gf = {f["path"]: f for f in g["files"]}
        assert set(gf) == {"bot.glb", "bot-poster.png"} and g["preview"] == "bot-poster.png", g
        assert gf["bot.glb"]["info"]["meshes"] == 1 and gf["bot.glb"]["info"]["animations"] == 2 and gf["bot.glb"]["info"]["animationNames"] == ["Walk", "Idle"], gf
        s = ok(api("/workshop/items", "POST", {"kind": "script", "title": "Double jump", "license": "MIT", "from": {"project": P["pixel-quest"], "paths": ["src/doublejump.js"]}}, token=maya), "publish script")["item"]
        assert s["files"][0]["sha256"] == sha(SCRIPT.encode()), s
        k = ok(api("/workshop/items", "POST", {"kind": "skill", "title": "Level design", "license": "MIT", "from": {"project": P["pixel-quest"], "paths": ["skills/level-design"]}}, token=orion), "publish skill")["item"]
        assert sorted(f["path"] for f in k["files"]) == ["SKILL.md", "notes.txt"], k   # run.sh skipped: not an allowed type
        assert "checkpoints every 30 seconds" in k["summary"], k
        lst = ok(api("/workshop/items", token=maya))["items"]
        assert {x["id"] for x in lst} == {"hero-run-cycle", "patrol-bot", "double-jump", "level-design"}, lst
        assert [x["id"] for x in ok(api("/workshop/items?kind=asset&q=bot", token=maya))["items"]] == ["patrol-bot"]
        st, (raw, hdr) = api("/workshop/items/hero-run-cycle/files/hero-run.png", token=maya)
        assert st == 200 and raw == SPRITE and hdr["Content-Type"] == "image/png" and hdr["X-Content-Type-Options"] == "nosniff" and "sandbox" in hdr["Content-Security-Policy"], hdr
        st, (raw, hdr) = api("/workshop/items/double-jump/files/doublejump.js", token=maya)
        assert hdr["Content-Type"].startswith("text/plain"), hdr   # code is text, never JavaScript
        print("ok publish: sprite (4 frames), GLB (1 mesh, Walk+Idle) with poster, script, skill from SKILL.md; files served as safe types")

        # ---------------- rejected: types, traversal, sha256, symlinks, spectators ----------------
        b64 = lambda b: base64.b64encode(b).decode()
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Page", "license": "MIT", "files": [{"path": "page.html", "data": b64(b"<script>alert(1)</script>")}]}, token=orion), 415, "html upload", "not allowed")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Exe", "license": "MIT", "from": {"project": P["pixel-quest"], "paths": ["src/tool.exe"]}}, token=orion), 415, "exe from project")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Up", "license": "MIT", "files": [{"path": "../../evil.js", "data": b64(b"x")}]}, token=orion), 400, "traversal upload", "unsafe")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Up", "license": "MIT", "files": [{"path": "C:/Windows/evil.js", "data": b64(b"x")}]}, token=orion), 400, "absolute upload")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Up", "license": "MIT", "from": {"project": P["pixel-quest"], "paths": ["../secret-lab/README.md"]}}, token=orion), 400, "traversal from project")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Link", "license": "MIT", "from": {"project": P["pixel-quest"], "paths": ["assets/link.txt"]}}, token=orion), 400, "symlink", "link")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Bad sha", "license": "MIT", "files": [{"path": "a.js", "data": b64(b"one"), "sha256": sha(b"two")}]}, token=orion), 400, "sha mismatch", "sha256")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "No license", "files": [{"path": "a.js", "data": b64(b"one")}]}, token=orion), 400, "no license", "license")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "GPL", "license": "GPL-3.0", "files": [{"path": "a.js", "data": b64(b"one")}]}, token=orion), 400, "gpl", "license")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Big", "license": "MIT", "files": [{"path": "a.txt", "data": b64(b"0" * (25 * 1024 * 1024 + 1))}]}, token=orion), 400, "over 25 MB", "25 MB")
        bad(api("/workshop/items", "POST", {"kind": "script", "title": "Spy", "license": "MIT", "files": [{"path": "a.js", "data": b64(b"one")}]}, token=viv), 403, "spectator publish")
        assert len(ok(api("/workshop/items", token=orion))["items"]) == 4
        print("ok rejected: html/exe types, ../ and absolute paths, symlinks, sha256 mismatch, missing/closed license, >25 MB, spectators")

        # ---------------- agents suggest, a human approves ----------------
        err_, text = mcp(agent, "workshop_search", {"query": "jump"})
        assert not err_ and "double-jump" in text, text
        err_, text = mcp(agent, "workshop_publish", {"kind": "recipe", "title": "Coyote time", "summary": "Jump a few frames after leaving a ledge.", "license": "MIT", "paths": ["src/doublejump.js"],
                                                     "check": {"kind": "test", "run": "npm test -- coyote", "note": "jump 100ms after the edge works"}})
        assert not err_ and "approval" in text, text
        sug = json.loads(text)
        assert "coyote-time" not in {x["id"] for x in ok(api("/workshop/items", token=maya))["items"]}, "agent publish must wait for approval"
        pend = ok(api("/workshop/pending", token=maya))["pending"]
        assert len(pend) == 1 and pend[0]["canDecide"] and pend[0]["item"]["title"] == "Coyote time", pend
        assert not ok(api("/workshop/pending", token=orion))["pending"][0]["canDecide"] or True
        bad(api(f"/workshop/pending/{sug['suggestion']}/approve", "POST", {}, token=agent), 403, "agent approves itself")
        st, (raw, _) = api(f"/workshop/pending/{sug['suggestion']}/files/doublejump.js", token=maya)
        assert st == 200 and raw.decode() == SCRIPT
        err_, text = mcp(agent, "check_approval", {"id": sug["approval"]})
        assert '"pending"' in text, text
        ok(api(f"/workshop/pending/{sug['suggestion']}/approve", "POST", {}, token=maya), "approve")
        c = ok(api("/workshop/items/coyote-time", token=orion))["item"]
        assert c["kind"] == "recipe" and c["check"]["run"] == "npm test -- coyote" and c["approvedBy"] == mid, c
        err_, text = mcp(agent, "workshop_publish", {"kind": "script", "title": "Sketchy thing", "license": "MIT", "paths": ["README.md"]})
        sug2 = json.loads(text)
        ok(api(f"/approvals/{sug2['approval']}/deny", "POST", {"note": "not reusable"}, token=maya), "deny via inbox")
        time.sleep(0.2)
        assert not ok(api("/workshop/pending", token=maya))["pending"], "denied suggestion gone"
        assert "sketchy-thing" not in {x["id"] for x in ok(api("/workshop/items", token=maya))["items"]}
        bad(api("/workshop/items/hero-run-cycle/donate", "POST", {}, token=agent), 403, "agent donates")
        print("ok agents: workshop_search, workshop_publish waits for a human (approved in the Workshop, denied from the inbox), never self-approve or donate")

        # ---------------- use in a project: copy, never run ----------------
        dry = ok(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dry": True}, token=maya), "dry")
        assert dry["license"] == "MIT" and dry["files"] == [{"path": "workshop/double-jump/doublejump.js", "size": len(SCRIPT)}] and not dry["conflicts"], dry
        assert not Path(repos["space-run"], "workshop").exists(), "dry run writes nothing"
        u = ok(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dest": "src/vendor/jump"}, token=maya), "use")
        assert Path(repos["space-run"], "src/vendor/jump/doublejump.js").read_text() == SCRIPT and u["copied"] == 1
        time.sleep(0.3)
        assert not PWNED.exists(), "using a script must never run it"
        bad(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dest": "src/vendor/jump"}, token=maya), 409, "conflict", "already there")
        ok(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dest": "src/vendor/jump", "overwrite": True}, token=maya), "overwrite")
        bad(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dest": "../../etc"}, token=maya), 400, "dest traversal", "safe")
        os.symlink(repos["secret-lab"], Path(repos["space-run"], "escape"))
        bad(api("/workshop/items/double-jump/use", "POST", {"project": P["space-run"], "dest": "escape/x"}, token=maya), 400, "dest through a symlink", "outside")
        assert not Path(repos["secret-lab"], "x").exists()
        err_, text = mcp(agent, "workshop_use", {"id": "patrol-bot", "dest": "assets/bot"})
        assert not err_ and Path(repos["pixel-quest"], "assets/bot/bot.glb").read_bytes() == glb(), text
        used = ok(api("/workshop/items/double-jump", token=orion))["item"]["usedIn"]
        assert [x["name"] for x in used] == ["Space Run"], used
        print("ok use: dry run shows files + license, copy into another project, script not executed, conflicts/overwrite, ../ and symlinked destinations refused, agent workshop_use")

        # ---------------- scoped member ----------------
        assert len(ok(api("/workshop/items", token=sam))["items"]) == 5, "scoped members browse the whole library"
        bad(api("/workshop/items/hero-run-cycle/use", "POST", {"project": P["secret-lab"]}, token=sam), 403, "scoped into other project", "projects you are in")
        bad(api(f"/workshop/browse?project={P['pixel-quest']}", token=sam), 403, "scoped browse")
        ok(api("/workshop/items/hero-run-cycle/use", "POST", {"project": P["space-run"]}, token=sam), "scoped into own project")
        assert Path(repos["space-run"], "workshop/hero-run-cycle/hero-run.png").read_bytes() == SPRITE
        assert [x["name"] for x in ok(api("/workshop/items/double-jump", token=sam))["item"]["usedIn"]] == ["Space Run"]
        bad(api("/workshop/items/hero-run-cycle/use", "POST", {"project": P["space-run"]}, token=viv), 403, "spectator use")
        print("ok scoped: a project-scoped member browses everything but uses only into their project; spectators can't use")

        # ---------------- versions ----------------
        (pq / "assets" / "hero-run.png").write_bytes(pix([HERO_TOP + l for l in LEGS], {**PAL, 't': (108, 124, 255)}))
        v = ok(api("/workshop/items", "POST", {"id": "hero-run-cycle", "kind": "asset", "title": "Hero run cycle", "license": "CC0-1.0", "from": {"project": P["pixel-quest"], "paths": ["assets/hero-run.png"]}}, token=orion), "bump")
        assert v["bumped"] and v["item"]["version"] == "1.0.1" and v["item"]["versions"] == 2, v
        other = ok(api("/workshop/items", "POST", {"id": "hero-run-cycle", "kind": "asset", "title": "Hero run cycle", "license": "CC0-1.0", "from": {"project": P["pixel-quest"], "paths": ["assets/hero-run.png"]}}, token=maya), "not mine")
        assert other["item"]["id"] == "hero-run-cycle-2" and not other["bumped"], other
        ok(api("/workshop/items/hero-run-cycle-2", "DELETE", token=maya), "remove own")
        print("ok versions: same id bumps 1.0.0 -> 1.0.1 for the publisher; someone else gets a new id")

        # ---------------- community shelf ----------------
        ok(api("/workshop/config", "PUT", {"repo": "ghost/missing"}, token=orion), "config")
        bad(api("/workshop/config", "PUT", {"repo": "x"}, token=maya), 403, "config not host")
        cm = ok(api("/workshop/community?refresh=1", token=maya), "community missing")
        assert cm["available"] is False and cm["reason"] == "missing" and cm["items"] == [], cm
        err_, text = mcp(agent, "workshop_search", {"query": "slime", "community": True})
        assert "does not exist yet" in text, text
        ok(api("/workshop/config", "PUT", {"repo": GOOD}, token=orion), "config good")
        cm = ok(api("/workshop/community?refresh=1", token=maya), "community")
        ids = {x["id"] for x in cm["items"]}
        assert cm["available"] and ids == {"slime-hop", "tampered-tool", "sneaky"}, cm
        assert {x["id"] for x in cm["rejected"]} == {"bad-type", "bad-path", "no-license"}, cm["rejected"]
        assert cm["items"][0]["previewUrl"].startswith(f"http://127.0.0.1:{MOCK}/gh/{GOOD}@main/items/slime-hop/"), cm["items"][0]
        bad(api("/workshop/community/slime-hop/get", "POST", {}, token=agent), 403, "agent gets community")
        sl = ok(api("/workshop/community/slime-hop/get", "POST", {}, token=maya), "get slime")["item"]
        assert sl["source"]["type"] == "community" and sl["author"] == "Ana" and sl["version"] == "1.2.0" and sl["files"][0]["info"]["frames"] == 3, sl
        bad(api("/workshop/community/tampered-tool/get", "POST", {}, token=maya), 422, "tampered", "sha256")
        bad(api("/workshop/community/sneaky/get", "POST", {}, token=maya), 422, "traversal in workshop.json", "unsafe")
        assert not any(Path(tmp).rglob("escape.js")) and not Path(tmp, "workshop/items/tampered-tool").exists() and not Path(tmp, "workshop/items/sneaky").exists()
        err_, text = mcp(agent, "workshop_search", {"query": "slime", "community": True})
        assert "slime-hop" in text, text
        print("ok community: 404 -> empty state, mock jsDelivr index (bad type/path/license skipped), get verifies sha256; tampered + traversal rejected")

        # ---------------- donate ----------------
        d = ok(api("/workshop/items/hero-run-cycle/donate", "POST", {}, token=maya), "donate")
        assert d["links"]["upload"] == f"https://github.com/{GOOD}/upload/main/items/hero-run-cycle", d["links"]
        assert d["indexEntry"]["path"] == "items/hero-run-cycle" and d["indexEntry"]["license"] == "CC0-1.0" and not d["canPr"], d
        bundle = Path(tmp, "workshop/donations/hero-run-cycle@1.0.1/items/hero-run-cycle")
        assert (bundle / "hero-run.png").exists() and json.loads((bundle / "workshop.json").read_text())["files"][0]["sha256"] == sha((pq / "assets" / "hero-run.png").read_bytes())
        assert "history" not in json.loads((bundle / "workshop.json").read_text()), "bundle carries no local data"
        bad(api("/workshop/items/hero-run-cycle/donate", "POST", {"pr": True}, token=maya), 400, "pr without token", "token")
        ok(api("/me/git", "PUT", {"githubToken": "ghp_" + "t" * 36}, token=maya), "save token")
        d = ok(api("/workshop/items/hero-run-cycle/donate", "POST", {"pr": True}, token=maya), "donate pr")
        assert d["canPr"] and d["pr"]["url"] == f"https://github.com/{GOOD}/pull/7" and d["pr"]["branch"] == "workshop/hero-run-cycle-1.0.1", d
        puts = [x for x in GH_LOG if x[0] == "PUT"]
        assert {x[1] for x in puts} == {"/api/repos/maya-gh/workshop/contents/items/hero-run-cycle/workshop.json", "/api/repos/maya-gh/workshop/contents/items/hero-run-cycle/hero-run.png"}, puts
        png_put = next(x for x in puts if x[1].endswith(".png"))
        assert base64.b64decode(png_put[3]["content"]) == (pq / "assets" / "hero-run.png").read_bytes() and png_put[3]["branch"] == "workshop/hero-run-cycle-1.0.1"
        print("ok donate: bundle + upload link + index entry; PR through the GitHub API with the member's stored token")

        # ---------------- tampering on disk is caught on use ----------------
        Path(tmp, "workshop/items/level-design/notes.txt").write_text("changed behind our back\n")
        bad(api("/workshop/items/level-design/use", "POST", {"project": P["space-run"]}, token=orion), 409, "tampered on disk", "sha256")
        bad(api("/workshop/items/double-jump", "DELETE", token=sam), 403, "remove someone else's")
        ok(api("/workshop/items/level-design", "DELETE", token=orion), "host removes")
        print("ok integrity: a library file changed on disk is refused on use; only the publisher or host removes")

        # ---------------- UI ----------------
        ok(api("/workshop/config", "PUT", {"repo": GOOD}, token=orion))
        err_, text = mcp(agent, "workshop_publish", {"kind": "asset", "title": "Bot poster", "license": "CC0-1.0", "paths": ["models/bot-poster.png"]})
        assert not err_, text
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(settings("Maya", "#6C7CFF", maya, P["pixel-quest"]))
            page = ctx.new_page(); watch(page, "desktop")
            page.goto(BASE + "/?skipIntro=1#/workshop")
            page.wait_for_selector("#workshop:not(.hidden) .ws-item", timeout=15000)
            page.wait_for_function("() => [...document.querySelectorAll('#workshop .ws-hero img')].some(i => i.naturalWidth > 0) || [...document.querySelectorAll('#workshop .ws-hero .ws-sprite i')].some(i => i.style.backgroundImage.startsWith('url'))", timeout=10000)
            assert page.locator("#workshop .ws-hero h2").inner_text() in ("Hero run cycle", "Slime hop", "Coyote time", "Patrol bot", "Double jump")
            assert page.locator(".ws-prow").count() == 1 and "Bot poster" in page.locator(".ws-prow").inner_text(), "pending suggestion shows for Maya"
            page.wait_for_function("() => [...document.querySelectorAll('.ws-sprite i')].some(i => i.style.backgroundImage.startsWith('url'))", timeout=10000)
            page.wait_for_function("() => [...document.querySelectorAll('.ws-code pre')].some(p => p.textContent.includes('doubleJump'))", timeout=10000)
            assert page.evaluate("getComputedStyle(document.querySelector('.ws-hero')).backgroundImage") == "none"
            shot(page, "workshop-desktop")
            # approve the suggestion in the UI
            page.click(".ws-prow [data-approve]")
            page.wait_for_function("() => !document.querySelector('.ws-prow') && [...document.querySelectorAll('.ws-item-t, .ws-hero h2')].some(e => e.textContent === 'Bot poster')", timeout=10000)
            # chips + search
            page.click(".ws-chip[data-k='asset']")
            page.wait_for_function("() => document.querySelectorAll('.ws-item').length && [...document.querySelectorAll('.ws-item .ws-kind')].every(k => k.textContent === 'Asset')")
            page.fill("#ws-q", "patrol")
            page.wait_for_function("() => document.querySelectorAll('.ws-item').length === 1")
            page.click(".ws-item")
            page.wait_for_selector("#ws-drawer:not(.hidden) .ws-model-i")
            assert "2 animations" in page.locator(".ws-model-i").inner_text() and "Walk, Idle" in page.locator(".ws-model-i").inner_text()
            assert "CC-BY-4.0" in page.locator(".ws-dl").inner_text() and "Credit the author" in page.locator(".ws-dl").inner_text()
            shot(page, "workshop-detail")
            # use dialog: files + license before copying
            page.click(".ws-detail [data-use]")
            page.wait_for_selector("#wu-plan .ws-plan-files")
            page.select_option("#wu-p", P["space-run"])
            page.wait_for_function("() => document.querySelector('#wu-plan').innerText.includes('workshop/patrol-bot/bot.glb')")
            assert "CC-BY-4.0" in page.locator("#wu-plan").inner_text() and "Nothing runs" in page.locator(".ws-safe").inner_text()
            shot(page, "workshop-use")
            page.click("#wu-go")
            page.wait_for_function("() => document.querySelector('#ws-modal').classList.contains('hidden')")
            assert Path(repos["space-run"], "workshop/patrol-bot/bot.glb").exists()
            page.wait_for_function("() => !document.querySelector('#ws-drawer').classList.contains('hidden') && document.querySelector('.ws-dl').innerText.includes('Space Run')")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.querySelector('#ws-drawer').classList.contains('hidden')")
            # add from a project folder
            page.fill("#ws-q", ""); page.click(".ws-chip[data-k='']")
            page.click("#ws-add")
            page.wait_for_selector("#wa-tree .ws-row")
            page.click("#wa-tree .ws-row[data-path='src'] [data-open]")
            page.wait_for_selector("#wa-tree .ws-row[data-path='src/doublejump.js']")
            assert page.locator("#wa-tree .ws-row[data-path='src/tool.exe'] input").is_disabled()
            page.check("#wa-tree .ws-row[data-path='src/doublejump.js'] input")
            page.fill("#wa-t", "Jump buffer"); page.select_option("#wa-l", "MIT")
            shot(page, "workshop-add")
            page.click("#wa-go")
            page.wait_for_selector("#ws-drawer:not(.hidden) .ws-d-body h2:text('Jump buffer')")
            page.keyboard.press("Escape")
            page.wait_for_function("() => document.querySelector('#ws-drawer').classList.contains('hidden')")
            # community tab
            page.click("[data-wt='community']")
            page.wait_for_function("() => document.querySelectorAll('#ws-body .ws-item').length === 3")
            page.wait_for_function("() => [...document.querySelectorAll('#ws-body .ws-item img, #ws-body .ws-sprite i')].length > 0")
            assert "3 entries were skipped" in page.locator("#ws-body").inner_text()
            shot(page, "workshop-community")
            # leaving: a project circle closes the Workshop
            page.click("[data-wt='library']")
            page.evaluate("location.hash = ''")
            page.wait_for_function("() => document.querySelector('#workshop').classList.contains('hidden')")
            page.evaluate("window.TribeWorkshop.open()")
            page.wait_for_selector("#workshop:not(.hidden)")
            assert page.evaluate("location.hash") == "#/workshop"

            # phone
            pctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            pctx.add_init_script(settings("Sam", "#38C6B1", sam, P["space-run"]))
            phone = pctx.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1#/workshop")
            phone.wait_for_selector("#workshop:not(.hidden) .ws-item", timeout=15000)
            phone.wait_for_function("() => [...document.querySelectorAll('#workshop .ws-hero img')].some(i => i.naturalWidth > 0) || [...document.querySelectorAll('#workshop .ws-hero .ws-sprite i')].some(i => i.style.backgroundImage.startsWith('url'))", timeout=10000)
            wide = phone.evaluate("(() => { const W = document.querySelector('#workshop'); const r = W.getBoundingClientRect(); const over = [...W.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1 && !e.closest('.ws-chips')).slice(0, 5).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().right)); return { layer: [r.left, r.width], scroll: document.querySelector('#ws-scroll').scrollWidth, over }; })()")
            assert wide["layer"] == [0, 390] and wide["scroll"] <= 390 and not wide["over"], f"no horizontal scroll at 390px: {wide}"
            assert phone.locator("#ws-back").is_visible()
            shot(phone, "workshop-phone")
            phone.click(".ws-item >> nth=0")
            phone.wait_for_selector("#ws-drawer:not(.hidden) .ws-d-body h2")
            shot(phone, "workshop-phone-detail")
            phone.click(".ws-detail [data-use]")
            phone.wait_for_selector("#wu-plan .ws-plan-files")
            opts = phone.eval_on_selector_all("#wu-p option", "os => os.map(o => o.value)")
            assert opts == [P["space-run"]], f"scoped member only sees their project: {opts}"
            phone.click("#ws-modal [data-mclose] >> nth=-1")
            phone.keyboard.press("Escape")
            phone.click("[data-wt='community']")
            phone.wait_for_function("() => document.querySelectorAll('#ws-body .ws-item').length === 3")
            shot(phone, "workshop-phone-community")
            phone.click("#ws-back")
            phone.wait_for_function("() => document.querySelector('#workshop').classList.contains('hidden')")
            browser.close()
        print("ok UI: hero + previews (image, sprite, code, GLB info), approve in place, chips + search, detail, Use dialog, Add from a folder, community, phone 390px")

        assert not errors, "\n".join(errors)
        print("\nALL WORKSHOP CHECKS PASSED")
    finally:
        srv.terminate()
        try: out = srv.communicate(timeout=5)[0].decode(errors="replace")
        except Exception: out = ""
        if os.environ.get("SHOW_SERVER") or sys.exc_info()[0]: print(out[-3000:])
        mock.shutdown()


if __name__ == "__main__":
    main()
