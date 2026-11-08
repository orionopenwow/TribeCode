"""Security regression test 3: the follow-ups from the 2026-11-08 review (fix/security-2).

M   media links: short-lived, signed, read-only, one resource each (mt=), no sign-in key in the page's media URLs.
    DM media still needs DM membership, project media still needs project visibility; a signed-out device's links die;
    a media link can't mint a media key, open other API routes or POST; the old ?token= still works (deprecation window).
    The page's synchronous SHA-256/HMAC (app/ui/media.js) matches Python's.
G   Connect GitHub: a builder without their own token doesn't create repos on the host's GitHub; their explicit
    Connect GitHub asks the host (an approval); once approved it works.
J   jsDelivr code: three.js and WebLLM are pinned to SHA-384 hashes and checked before they run; WebLLM runs in a worker.
H   huddle state and captions only reach people who can see the huddle's project; they can't join it either.
T   WebSocket "typing" into another project's channel goes nowhere.
A   MCP check_approval only answers for approvals in the agent's projects.
L   admins (and mods) can change the look; spectators can't.
C   cloudflared download: checked against the published SHA-256 before it is kept; a mismatch is deleted and refused.
D   device links: optional end date, "last used", turn off after 90 days unused.
K   Tauri: a real CSP (the app runs under it with no violations), and no remote origin gets IPC by default.
Usage: python app/test/security3_test.py
"""
import base64, hashlib, re, hmac, http.server, json, mimetypes, os, socket, struct, subprocess, tempfile, threading, time, urllib.error, urllib.parse, urllib.request, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 5290 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
GH_TOKEN = "ghp_" + "s" * 36
errors = []


def api(path, method="GET", body=None, token=None, project=None, headers=None, raw=False):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    url = BASE + path if path.startswith("/mcp") else BASE + "/api" + path
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            return (r.status, data, r.headers) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        if raw: return e.code, data, e.headers
        try: return e.code, json.loads(data or b"{}")
        except Exception: return e.code, {"raw": data[:200]}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


def get(path_and_query, method="GET"):
    """A plain request with no Authorization header (like an <img src>)."""
    req = urllib.request.Request(BASE + path_and_query, method=method, data=b"{}" if method == "POST" else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()


def b64u(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def unb64u(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign(key, path, query=None):
    """What app/ui/media.js does: HMAC(media key, path?query) -> path?query&mt=..."""
    q = urllib.parse.urlencode(query or {})
    canon = path + ("?" + q if q else "")
    sig = b64u(hmac.new(unb64u(key["key"]), canon.encode(), hashlib.sha256).digest())
    mt = f"mt1.{key['member']}.{key['exp']}.{key['tok']}.{sig}"
    return canon + ("&" if q else "?") + "mt=" + urllib.parse.quote(mt, safe="")


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


# ---------- a tiny WebSocket client (text frames) ----------
class WS:
    def __init__(self, token, project=None):
        self.s = socket.create_connection(("127.0.0.1", PORT), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        q = f"token={token}" + (f"&project={project}" if project else "")
        self.s.sendall(f"GET /ws?{q} HTTP/1.1\r\nHost: localhost:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        head = b""
        while b"\r\n\r\n" not in head: head += self.s.recv(1)
        assert head.startswith(b"HTTP/1.1 101"), head
        self.buf = b""; self.msgs = []
        self.alive = True
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        try:
            while self.alive:
                d = self.s.recv(65536)
                if not d: break
                self.buf += d
                while len(self.buf) >= 2:
                    op, ln = self.buf[0] & 15, self.buf[1] & 127; i = 2
                    if ln == 126: ln = struct.unpack(">H", self.buf[2:4])[0]; i = 4
                    elif ln == 127: ln = struct.unpack(">Q", self.buf[2:10])[0]; i = 10
                    if len(self.buf) < i + ln: break
                    payload, self.buf = self.buf[i:i + ln], self.buf[i + ln:]
                    if op == 1:
                        try: self.msgs.append(json.loads(payload))
                        except Exception: pass
        except Exception: pass

    def send(self, msg):
        data = json.dumps(msg).encode(); mask = os.urandom(4)
        head = bytes([0x81, 0x80 | len(data)]) if len(data) < 126 else bytes([0x81, 0x80 | 126, len(data) >> 8, len(data) & 255])
        self.s.sendall(head + mask + bytes(b ^ mask[i & 3] for i, b in enumerate(data)))

    def of(self, t): return [m for m in self.msgs if m.get("type") == t]
    def close(self): self.alive = False; self.s.close()


def start(tmp, env_extra=None):
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", **(env_extra or {})}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(Path(tmp) / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(Path(tmp) / "server.log", "a"), stderr=subprocess.STDOUT, env=env)
    for _ in range(100):
        try: urllib.request.urlopen(BASE + "/api/health"); return srv
        except Exception: time.sleep(0.1)
    raise RuntimeError("server did not start")


def wait(fn, what, t=15):
    end = time.time() + t
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError("timed out: " + what)


# ---------- GitHub API mock (POST /user/repos makes a local bare repo) ----------
GH = {"calls": [], "root": None}
class GitHubMock(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        GH["calls"].append({"path": self.path, "auth": self.headers.get("Authorization"), "name": body.get("name")})
        if self.headers.get("Authorization") != "Bearer " + GH_TOKEN: return self.reply(401, {"message": "Bad credentials"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "host/" + body["name"], "private": True, "clone_url": bare, "html_url": "https://github.com/host/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


def csp_header():
    conf = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
    csp = conf["app"]["security"]["csp"]
    return "; ".join(f"{k} {v}" for k, v in csp.items()) if isinstance(csp, dict) else csp


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec3-", dir="/tmp")
    GH["root"] = tempfile.mkdtemp(prefix="sec3-gh-", dir="/tmp")
    gh = http.server.ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    srv = start(tmp, {"TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}"})
    try:
        host_join = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + "/api/bootstrap", data=json.dumps({"name": "Orion"}).encode(), headers={"Content-Type": "application/json"})).read())
        host, host_id = host_join["token"], host_join["member"]["id"]
        A = ok(api("/projects", "POST", {"name": "Game"}, token=host), "project A")["project"]
        B = ok(api("/projects", "POST", {"name": "Secret"}, token=host), "project B")["project"]
        pa, pb = A["id"], B["id"]
        inv = lambda **kw: ok(api("/invites", "POST", {"maxUses": 1, **kw}, token=host))["invite"]["code"]
        bob = ok(api("/join", "POST", {"code": inv(role="builder", project="tribe"), "name": "Bob"}))
        maya = ok(api("/join", "POST", {"code": inv(role="builder", project=pa), "name": "Maya"}))   # only sees project A
        sam = ok(api("/join", "POST", {"code": inv(role="spectator", project="tribe"), "name": "Sam"}))
        ann = ok(api("/join", "POST", {"code": inv(role="builder", project="tribe"), "name": "Ann"}))

        # ================= M: signed media links =================
        img = png(6, 6, (242, 107, 29))
        b64 = "data:image/png;base64," + base64.b64encode(img).decode()
        ma = ok(api("/chat/general/image", "POST", {"data": b64, "mime": "image/png"}, token=host, project=pa), "image in A")["message"]
        mb = ok(api("/chat/general/image", "POST", {"data": b64, "mime": "image/png"}, token=host, project=pb), "image in B")["message"]
        dm = "dm-" + "-".join(sorted([host_id, bob["member"]["id"]]))
        md = ok(api(f"/chat/{dm}/image", "POST", {"data": b64, "mime": "image/png"}, token=host), "image in a DM")["message"]
        pathA = f"/api/chat/{A['channel']}/media/{ma['media']['file']}"
        pathB = f"/api/chat/{B['channel']}/media/{mb['media']['file']}"
        pathD = f"/api/chat/{dm}/media/{md['media']['file']}"
        hk = ok(api("/media/key", token=host), "host media key")
        assert set(hk) >= {"member", "exp", "tok", "key", "expires"} and hk["member"] == host_id, hk
        assert hk["tok"] == hashlib.sha256(host.encode()).hexdigest()[:12], "bound to the sign-in key it came from"
        left = (time.mktime(time.strptime(hk["expires"][:19], "%Y-%m-%dT%H:%M:%S")) - time.mktime(time.gmtime()))
        assert 45 * 60 < left <= 61 * 60, f"about an hour: {left}"
        st, body = get(sign(hk, pathA)); assert st == 200 and body == img, ("signed link opens the picture", st)
        st, body = get(sign(hk, pathD)); assert st == 200 and body == img, ("host opens their DM picture", st)
        assert get(pathA)[0] == 401, "no key, no picture"
        good = sign(hk, pathA)
        assert get(good.replace(ma["media"]["file"], mb["media"]["file"]).replace(A["channel"], B["channel"]))[0] == 401, "a link opens only its own resource"
        assert get(sign(hk, pathA) + "x")[0] == 401, "a changed signature is refused"
        parts = urllib.parse.unquote(good.split("mt=")[1]).split(".")
        later = dict(hk, exp=format(int(parts[2], 36) + 600000, "x"))
        assert get(sign(later, pathA))[0] == 401, "a changed expiry is refused"
        assert get(sign(hk, pathA, {"project": pa}))[0] == 200, "the query is part of what's signed"
        assert get(sign(hk, pathA).replace("?mt=", f"?project={pb}&mt="))[0] == 401, "an added query parameter breaks the signature"
        assert get(sign(hk, pathA), method="POST")[0] in (401, 404, 405), "read-only"
        assert get(sign(hk, "/api/me"))[0] == 401, "a media link opens media routes only"
        assert get(sign(hk, "/api/media/key"))[0] == 401, "a media link can't mint a media key"
        assert get(sign(hk, "/api/backup"))[0] in (401, 403), "and never the backup"
        assert get(f"{pathA}?token={host}")[0] == 200, "?token= still works during the deprecation window"
        # DM membership and project visibility still apply
        mk = ok(api("/media/key", token=maya["token"]), "maya media key")
        assert get(sign(mk, pathA))[0] == 200, "Maya sees project A's picture"
        assert get(sign(mk, pathB))[0] == 403, "Maya can't open project B's picture with her own signed link"
        assert get(sign(mk, pathD))[0] in (403, 404), "Maya can't open a DM she isn't in"
        bk = ok(api("/media/key", token=bob["token"]), "bob media key")
        assert get(sign(bk, pathD))[0] == 200, "Bob opens his DM picture"
        # a device link's media links die when the device is signed out
        dl = ok(api("/device-link", "POST", {"label": "Phone"}, token=bob["token"]))
        dtok = ok(api("/device-link/redeem", "POST", {"key": dl["path"].split("/")[2]}))["token"]
        dk = ok(api("/media/key", token=dtok), "device media key")
        assert get(sign(dk, pathD))[0] == 200, "the phone opens it"
        ok(api(f"/devices/{dl['device']['id']}", "DELETE", token=bob["token"]), "revoke")
        assert get(sign(dk, pathD))[0] == 401, "a signed-out device's media links stop working"
        assert get(sign(bk, pathD))[0] == 200, "Bob's other sign-in is untouched"

        # ================= T: typing into another project's channel =================
        hw = WS(host, pb); mw = WS(maya["token"], pa); time.sleep(0.5)
        mw.send({"type": "typing", "channel": B["channel"]}); mw.send({"type": "typing", "channel": "general"}); time.sleep(0.6)
        assert not [m for m in hw.of("typing") if m.get("by") == maya["member"]["id"]], f"typing leaked into project B: {hw.of('typing')}"
        bw = WS(bob["token"], pa); time.sleep(0.4)
        mw.send({"type": "typing", "channel": "general"}); time.sleep(0.6)
        assert [m for m in bw.of("typing") if m.get("by") == maya["member"]["id"]], "typing still works in your own project"

        # ================= H: huddle and captions stay in their project =================
        hw.send({"type": "huddle-join", "muted": True}); time.sleep(0.6)
        assert [m for m in bw.of("huddle") if m.get("members")], "Bob (whole tribe) sees the huddle"
        assert not [m for m in mw.of("huddle") if m.get("members")], f"Maya saw project B's huddle: {mw.of('huddle')}"
        hw.send({"type": "captions", "on": True}); time.sleep(0.6)
        assert [m for m in bw.of("captions") if m.get("on")], "Bob sees captions turn on"
        assert not [m for m in mw.of("captions") if m.get("on")], "Maya doesn't see project B's captions"
        mw.send({"type": "voice-sync"}); time.sleep(0.4)
        assert not [m for m in mw.of("captions") if m.get("on")], "voice-sync doesn't reveal it either"
        mw.send({"type": "huddle-join"}); time.sleep(0.5)
        assert mw.of("huddle-error"), "Maya can't join another project's huddle"
        assert [m for m in hw.of("huddle") if m.get("members")][-1]["members"] and all(x["id"] != maya["member"]["id"] for x in [m for m in hw.of("huddle")][-1]["members"]), "and she isn't in it"
        m2 = WS(maya["token"], pa); time.sleep(0.5)
        hello = m2.of("hello")[0]; assert hello["huddle"] == [], f"hello hides another project's huddle: {hello['huddle']}"
        m2.close(); hw.send({"type": "huddle-leave"}); time.sleep(0.4)
        for w in (hw, mw, bw): w.close()

        # ================= A: MCP check_approval =================
        ag = ok(api("/agents", "POST", token=maya["token"], project=pa), "maya's agent")["token"]
        apB = ok(api("/approvals", "POST", {"title": "Drop prod", "risk": "high"}, token=host, project=pb))["approval"]
        apA = ok(api("/approvals", "POST", {"title": "Ship it", "risk": "low"}, token=host, project=pa))["approval"]
        call = lambda i: ok(api("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "check_approval", "arguments": {"id": i}}}, token=ag))["result"]
        rb = call(apB["id"]); assert rb.get("isError") and "Drop prod" not in json.dumps(rb), f"agent read another project's approval: {rb}"
        ra = call(apA["id"]); assert not ra.get("isError") and "pending" in json.dumps(ra), ra

        # ================= L: look =================
        ok(api("/perms/assign", "POST", {"member": ann["member"]["id"], "role": "admin"}, token=host), "Ann is an admin")
        assert api("/look", "PUT", {"tribe": {"emoji": "🔥"}}, token=ann["token"])[0] == 200, "admins change the look"
        assert api("/look", "PUT", {"tribe": {"emoji": "🌊"}}, token=sam["token"])[0] == 403, "spectators can't"
        assert ok(api("/look", token=ann["token"]))["canEdit"] is True

        # ================= G: Connect GitHub =================
        assert api("/me/git", "PUT", {"githubToken": GH_TOKEN}, token=host)[0] == 200, "host saves a GitHub token"
        fl = ok(api("/flow/create", "POST", {"name": "Bob Quest"}, token=bob["token"]), "Bob starts a project")["flow"]
        bp = fl["project"]
        f = wait(lambda: (lambda x: x if x["steps"]["repo"]["s"] == "ok" and x["steps"]["github"]["s"] != "run" else None)(ok(api("/flow", token=bob["token"], project=bp))["flow"]), "Bob's repo step")
        assert f["steps"]["github"]["s"] == "todo", f["steps"]["github"]
        assert not GH["calls"], f"Bob's project went to the host's GitHub: {GH['calls']}"
        r = ok(api("/flow/github", "POST", {}, token=bob["token"], project=bp), "Bob presses Connect GitHub")
        assert r["step"]["s"] == "todo" and "host" in r["step"]["note"], r["step"]
        assert not GH["calls"], "still not on the host's account"
        ap = [a for a in ok(api("/approvals", token=host, project=bp))["approvals"] if a.get("kind") == "github-host"]
        assert ap and ap[0]["status"] == "pending" and host_id in ap[0]["to"], ap
        assert len([a for a in ok(api("/approvals", token=host, project=bp))["approvals"] if a.get("kind") == "github-host"]) == 1
        api("/flow/github", "POST", {}, token=bob["token"], project=bp)
        assert len([a for a in ok(api("/approvals", token=host, project=bp))["approvals"] if a.get("kind") == "github-host"]) == 1, "asking again doesn't pile up approvals"
        ok(api(f"/approvals/{ap[0]['id']}/approve", "POST", {}, token=host, project=bp), "host approves")
        r = ok(api("/flow/github", "POST", {}, token=bob["token"], project=bp), "Bob tries again")
        assert r["step"]["s"] == "ok", r["step"]
        assert len(GH["calls"]) == 1 and GH["calls"][0]["auth"] == "Bearer " + GH_TOKEN, GH["calls"]
        # an admin uses the host's GitHub directly
        fl2 = ok(api("/flow/create", "POST", {"name": "Ann Quest"}, token=ann["token"]), "Ann starts a project")["flow"]
        wait(lambda: ok(api("/flow", token=ann["token"], project=fl2["project"]))["flow"]["steps"]["github"]["s"] in ("ok", "fail"), "Ann's GitHub step")
        assert ok(api("/flow", token=ann["token"], project=fl2["project"]))["flow"]["steps"]["github"]["s"] == "ok" and len(GH["calls"]) == 2, "admins may"

        # ================= C: cloudflared checksum =================
        check_cloudflared(tmp)

        # ================= J + K + M (page): the app under the desktop app's CSP =================
        page_checks(host, pa, A, ma)

        # ================= J: pinned code =================
        vw = (UI / "viewers.js").read_text(); bw_ = (UI / "brainworker.js").read_text(); bp_ = (UI / "brainpick.js").read_text()
        assert "esm.run" not in bp_ and "import(" not in bp_.replace("import(blob)", ""), "WebLLM isn't imported into the page"
        assert "sha384-" in bw_ and "crypto.subtle.digest('SHA-384'" in bw_ and "@mlc-ai/web-llm@0.2.83/lib/index.js" in bw_
        assert len(re.findall(r"sha384-[A-Za-z0-9+/]{64}", vw)) == 4 and "importmap" not in vw.split("let threeP")[1], "three.js files are hash-checked, no import map"

        # ================= D: device links =================
        d1 = ok(api("/device-link", "POST", {"label": "Tablet", "days": 7}, token=bob["token"]))
        d2 = ok(api("/device-link", "POST", {"label": "Old phone"}, token=bob["token"]))
        t2 = ok(api("/device-link/redeem", "POST", {"key": d2["path"].split("/")[2]}))["token"]
        devs = {d["label"]: d for d in ok(api("/devices", token=bob["token"]))["devices"]}
        assert devs["Tablet"]["expires"] and devs["Old phone"]["expires"] is None and devs["Old phone"]["idleDays"] == 90, devs
        assert devs["Old phone"]["lastUsed"], "last used shows"
        assert ok(api("/me", token=t2))["member"]["name"] == "Bob"
        srv.terminate(); srv.wait(10)
        df = Path(tmp) / "tribe" / ".tribe" / "devices.json"
        dd = json.loads(df.read_text())
        for d in dd:
            if d["id"] == devs["Old phone"]["id"]: d["lastUsed"] = "2020-01-01T00:00:00.000Z"
            if d["id"] == devs["Tablet"]["id"]: d["expires"] = "2020-01-01T00:00:00.000Z"
        df.write_text(json.dumps(dd))
        srv = start(tmp)
        assert api("/me", token=t2)[0] == 401, "a device unused for 90 days is signed out"
        assert api("/device-link/redeem", "POST", {"key": d1["path"].split("/")[2]})[0] == 404, "a link past its end date doesn't redeem"
        labels = [d["label"] for d in ok(api("/devices", token=bob["token"]))["devices"]]
        assert "Tablet" not in labels and "Old phone" not in labels, labels
        assert ok(api("/me", token=bob["token"]))["member"]["name"] == "Bob", "the main sign-in is untouched"

        # ================= K: Tauri config =================
        conf = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
        csp = conf["app"]["security"]["csp"]
        assert isinstance(csp, dict) and "'unsafe-inline'" not in csp["script-src"] and "'unsafe-eval'" not in csp["script-src"] and csp["object-src"] == "'none'", csp
        cap = json.loads((ROOT / "app" / "src-tauri" / "capabilities" / "default.json").read_text())
        assert "remote" not in cap, "no remote origin gets IPC by default"
        dev = json.loads((ROOT / "app" / "src-tauri" / "dev-capabilities" / "working-lane.json").read_text())
        assert dev["remote"]["urls"] and all(":4848/" in u for u in dev["remote"]["urls"]) and dev["local"] is False, dev
        rs = (ROOT / "app" / "src-tauri" / "src" / "main.rs").read_text()
        assert "working_lane_enabled()" in rs and "TRIBECODE_WORKING_LANE" in rs and 'include_str!("../dev-capabilities/working-lane.json")' in rs
        r = subprocess.run(["python3", str(ROOT / "scripts" / "check-tauri-config.py")], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
    finally:
        srv.terminate(); gh.shutdown()
    assert not errors, "\n".join(errors[:20])
    print("Security test 3 passed")


def check_cloudflared(tmp):
    good, bad = b"#!/bin/sh\necho cloudflared fake\n", b"#!/bin/sh\necho evil\n"
    sha = hashlib.sha256(good).hexdigest()
    rel = {"name": None}
    class Rel(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            port = self.server.server_address[1]
            if self.path == "/release":
                body = {"tag_name": "2099.1.0", "body": rel["body"], "assets": [{"name": "cloudflared-linux-amd64", "browser_download_url": f"http://127.0.0.1:{port}/bin", **({"digest": rel["digest"]} if rel.get("digest") else {})}]}
                data = json.dumps(body).encode()
            elif self.path == "/bin": data = rel["bytes"]
            else: self.send_response(404); self.end_headers(); return
            self.send_response(200); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Rel); threading.Thread(target=s.serve_forever, daemon=True).start()
    dest = Path(tmp) / "cf" / "cloudflared"; dest.parent.mkdir()
    js = ("require(process.argv[1]).verifiedDownload('cloudflared-linux-amd64', process.argv[2])"
          ".then(v => console.log(JSON.stringify({ ok: true, ...v })), e => console.log(JSON.stringify({ ok: false, error: e.message })))")
    def run():
        env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_CLOUDFLARED_API": f"http://127.0.0.1:{s.server_address[1]}/release", "NO_PROXY": "127.0.0.1"}
        out = subprocess.run(["node", "-e", js, str(ROOT / "server" / "share.js"), str(dest)], capture_output=True, text=True, env=env, timeout=30)
        return json.loads(out.stdout.strip().splitlines()[-1])
    try:
        notes = "## Changes\n- stuff\n\nSHA256 Checksums:\n```\ncloudflared-darwin-amd64.tgz: " + "a" * 64 + "\ncloudflared-linux-amd64: {sha}\n```\n"
        rel.update(body=notes.format(sha=sha), bytes=bad)
        r = run(); assert not r["ok"] and "does not match" in r["error"] and "not run" in r["error"], r
        assert not dest.exists() and not Path(str(dest) + ".part").exists(), "a mismatched download is deleted"
        rel.update(body="no checksums here", bytes=good)
        r = run(); assert not r["ok"] and "no SHA-256" in r["error"], r
        assert not dest.exists()
        rel.update(body=notes.format(sha=sha), bytes=good, digest="sha256:" + "b" * 64)
        r = run(); assert not r["ok"] and "two different" in r["error"], f"release notes and asset digest disagree: {r}"
        rel.update(body=notes.format(sha=sha), bytes=good, digest="sha256:" + sha)
        r = run(); assert r["ok"] and r["sha"] == sha and r["tag"] == "2099.1.0", r
        assert dest.read_bytes() == good
        env = {**os.environ, "TRIBE_CLOUDFLARED_API": "http://example.com/release"}
        out = subprocess.run(["node", "-e", js, str(ROOT / "server" / "share.js"), str(dest) + "2"], capture_output=True, text=True, env=env, timeout=30)
        assert "not https" in out.stdout, out.stdout
    finally:
        s.shutdown()


def until(page, js, timeout=15000):
    """wait_for_function evaluates strings with eval(), which the CSP (rightly) blocks: poll with evaluate instead."""
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(js): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError("timed out: " + js[:120])


def page_checks(host, pa, A, ma):
    from playwright.sync_api import sync_playwright
    csp = csp_header()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-features=LocalNetworkAccessChecks",
                              "--enable-features=PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        # the desktop app's page: the bundled files at http://tauri.localhost, served with tauri.conf.json's CSP
        def tauri(route):
            path = route.request.url.split("tauri.localhost", 1)[1].split("?")[0].split("#")[0].lstrip("/") or "index.html"
            f = UI / path
            if not f.is_file() or path.startswith("api/"): f = UI / "index.html"
            ct = mimetypes.guess_type(str(f))[0] or "text/html"
            route.fulfill(status=200, body=f.read_bytes(), headers={"Content-Type": ct, "Content-Security-Policy": csp})
        ctx.route("http://tauri.localhost/**", tauri)
        ctx.add_init_script(
            f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{host}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pa}'); }} catch (e) {{}}"
            "window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || '') + ':' + e.lineNumber));")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"page: {e}"))
        page.goto("http://tauri.localhost/?skipIntro=1")
        until(page, "window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pa, 20000)
        # the synchronous SHA-256 / HMAC in media.js agrees with Python's
        for k, m in [(b64u(b"k"), "/api/x"), (b64u(os.urandom(32)), "/api/chat/p-x/media/a.png?project=abc"), (b64u(os.urandom(80)), "x" * 200), (b64u(os.urandom(64)), "é✓" * 40)]:
            want = b64u(hmac.new(unb64u(k), m.encode(), hashlib.sha256).digest())
            assert page.evaluate("([k, m]) => TribeMedia._hmac(k, m)", [k, m]) == want, (k, m)
        for m in ["", "abc", "a" * 55, "a" * 56, "a" * 64, "b" * 1000]:
            assert page.evaluate("m => TribeMedia._sha256hex(m)", m) == hashlib.sha256(m.encode()).hexdigest(), len(m)
        until(page, "TribeMedia.ready()", 10000)
        page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
        sel = f"img[src*='{ma['media']['file']}']"
        page.wait_for_selector(sel, timeout=15000)
        src = page.get_attribute(sel, "src")
        assert "mt=mt1." in src and "token=" not in src, src
        until(page, f"(() => {{ const i = document.querySelector(\"{sel}\"); return i && i.complete && i.naturalWidth === 6; }})()", 10000)
        assert host not in page.content(), "the sign-in key isn't anywhere in the page's HTML"
        # links made before the key arrives get signed in place
        page.evaluate("localStorage.removeItem('tribecode.mediaKey')")
        page.reload(); until(page, "window.TribeClient && TribeClient.connected()", 20000)
        page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
        until(page, f"(() => {{ const i = document.querySelector(\"{sel}\"); return i && /mt=mt1\\./.test(i.src) && i.complete && i.naturalWidth === 6; }})()", 15000)
        # walk a few views under the CSP
        for v in ["docs", "tasks", "updates", "chat"]:
            try: page.evaluate(f"TribeApp.show({v!r})")
            except Exception: pass
            page.wait_for_timeout(500)
        # the brain worker loads under the CSP and refuses code that doesn't match its hash
        ctx.route("https://cdn.jsdelivr.net/**", lambda r: r.fulfill(status=200, body=b"export const CreateMLCEngine = () => { self.postMessage({ type: 'pwned' }); };", headers={"Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*"}))
        res = page.evaluate("""() => new Promise(res => { const w = new Worker('brainworker.js', { type: 'module' }); const got = [];
            w.onmessage = e => { got.push(e.data); if (e.data.type === 'error' || e.data.type === 'ready' || e.data.type === 'pwned') res(got); };
            w.onerror = e => res([{ type: 'workererror', error: e.message }]); w.postMessage({ type: 'load', model: 'x' }); setTimeout(() => res(got), 8000); })""")
        assert res and res[-1]["type"] == "error" and "integrity" in res[-1]["error"], f"tampered WebLLM must be refused: {res}"
        # the viewer refuses a tampered three.js the same way
        msg = page.evaluate("""async () => { try { await TribeViewers.open({ name: 'cube.glb', src: 'data:application/octet-stream;base64,AA==' }); } catch (e) {}
            await new Promise(r => setTimeout(r, 1500)); const e = document.querySelector('#vw .vw-err'); return e ? e.textContent : ''; }""")
        assert "integrity" in msg and not page.evaluate("!!TribeViewers.threeVerified"), f"tampered three.js must be refused: {msg}"
        violations = page.evaluate("window.__csp")
        assert not violations, "the app breaks the desktop CSP:\n" + "\n".join(violations[:20])
        ctx.close(); b.close()


if __name__ == "__main__":
    main()
