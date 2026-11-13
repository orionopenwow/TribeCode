"""Security regression test 6: the hardening pass (docs/REVIEW-2026-11-12.md).

K   the tribe_s cookie never holds an account token (tca_…): sign-up with an invite and login put the member key there.
S   search is rate-limited per client and per endpoint (429 with a calm message); one endpoint's budget isn't another's.
Z   proof ZIPs: per-person and per-project caps keep the newest (oldest removed, a note says so); too big is a 413.
G   a gated feature (a premium template) is refused on the server without the plan (402 need: plan); the trial is once per
    tribe, people only; plans and credits change only on the host computer.
$   AI credits: 20 concurrent hosted-AI answers with 5 credits -> exactly 5 answers, 15 calm 402s, balance 0, never < 0;
    a failed hosted call gives its credit back.
R   agents can't start rituals (run now, the calendar, settings) until a lead allows it; a builder isn't a lead.
P   pending email links and desktop handoff codes survive a restart (hashes only, 0600), still work once, still expire.
M   memory caps: the limiter map stays under its cap; a member keeps at most 24 sockets; presence floods are dropped.
H   with a public https address, plain-http remote account routes are refused with the secure address; https passes.
F   code files (PUT/DELETE /api/code/file, GET /api/code/list): write needs write permission on the project (a friend
    who is a spectator in this project can't, even as a builder elsewhere); delete is path-safe (no .., no secrets, no
    node_modules, no symlinked folder that leads outside); the list hides secrets and node_modules.
Usage: python app/test/security6_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, http.server, io, json, os, re, secrets, socket, socketserver, stat, subprocess, sys, tempfile, threading, time, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_auth2 as a2   # the fake OAuth provider, the fake SMTP server and the flow helpers

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, MOCK_PORT, SMTP_PORT, AI_PORT, PORT2, PORT3 = 5800 + OFF, 5801 + OFF, 5802 + OFF, 5803 + OFF, 5804 + OFF, 5805 + OFF
BASE = f"http://localhost:{PORT}"
a2.PORT, a2.MOCK_PORT, a2.SMTP_PORT = PORT, MOCK_PORT, SMTP_PORT
a2.BASE, a2.MOCK = BASE, f"http://127.0.0.1:{MOCK_PORT}"
api, ok, remote = a2.api, a2.ok, a2.remote
LINK_MS = 15000


# ---------------- a fake hosted AI (OpenAI-compatible, streamed) ----------------
AI_CALLS = []


class FakeAI(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        AI_CALLS.append(1)
        text = json.dumps(body.get("messages", []))
        time.sleep(0.5)   # overlap the concurrent requests
        if "PLEASEFAIL" in text:
            self.send_response(500); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}"); return
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        self.wfile.write(b'data: {"choices":[{"delta":{"content":"hello from credits"}}]}\n\ndata: [DONE]\n\n')


def raw(path, method="GET", body=None, token=None, headers=None):
    """api() plus the response headers (for Set-Cookie)."""
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with a2.opener.open(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}"), r.headers.get_all("Set-Cookie") or []
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}"), e.headers.get_all("Set-Cookie") or []


def zip_bytes(size=0, name="a.txt"):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w", zipfile.ZIP_STORED) as z: z.writestr(name, os.urandom(size) if size else b"proof")
    return b.getvalue()


def save_zip(name, data, token, project):
    req = urllib.request.Request(f"{BASE}/api/flint/proof/save?name={name}&project={project}", method="POST", data=data, headers={"Content-Type": "application/zip", "Authorization": "Bearer " + token, "X-Project": project})
    try:
        with a2.opener.open(req, timeout=30) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


# ---------------- a tiny WebSocket client ----------------
class WS:
    def __init__(self, token, port=PORT):
        self.s = socket.create_connection(("127.0.0.1", port), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(f"GET /ws?token={token} HTTP/1.1\r\nHost: localhost:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
        buf = b""
        while b"\r\n\r\n" not in buf: buf += self.s.recv(4096)
        assert b" 101 " in buf.split(b"\r\n")[0], buf[:100]
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def send(self, obj):
        data = json.dumps(obj).encode(); mask = os.urandom(4); n = len(data)
        head = bytes([0x81, 0x80 | n]) if n < 126 else bytes([0x81, 0x80 | 126]) + n.to_bytes(2, "big")
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def frames(self, seconds):
        out, end = [], time.time() + seconds
        self.s.settimeout(0.2)
        while time.time() < end:
            try:
                c = self.s.recv(65536)
                if not c: break
                self.buf += c
            except socket.timeout: pass
            while len(self.buf) >= 2:
                n = self.buf[1] & 0x7f; i = 2
                if n == 126:
                    if len(self.buf) < 4: break
                    n = int.from_bytes(self.buf[2:4], "big"); i = 4
                elif n == 127:
                    if len(self.buf) < 10: break
                    n = int.from_bytes(self.buf[2:10], "big"); i = 10
                if len(self.buf) < i + n: break
                payload, self.buf = self.buf[i:i + n], self.buf[i + n:]
                try: out.append(json.loads(payload))
                except Exception: pass
        return out

    def close(self):
        try: self.s.close()
        except Exception: pass


def start(tribe, env, port, log):
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Harden Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    for _ in range(150):
        try:
            if urllib.request.build_opener(urllib.request.ProxyHandler({})).open(f"http://localhost:{port}/api/health", timeout=2).status == 200: return srv
        except Exception: time.sleep(0.1)
    raise AssertionError("server did not start")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec6-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), a2.Mock), http.server.ThreadingHTTPServer(("127.0.0.1", AI_PORT), FakeAI)]
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    servers.append(socketserver.ThreadingTCPServer(("127.0.0.1", SMTP_PORT), a2.Smtp))
    for s in servers: threading.Thread(target=s.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1",
           "TRIBE_TEST_LINK_MS": str(LINK_MS), "TRIBE_TEST_HANDOFF_MS": str(LINK_MS), "TRIBE_TEST_HITS_MAX": "300",
           "TRIBE_EXPORT_USER_MAX": "2", "TRIBE_EXPORT_PROJECT_MAX": "3", "TRIBE_EXPORT_USER_MB": "1",
           "TRIBE_HOSTED_AI_BASE": f"http://127.0.0.1:{AI_PORT}/v1", "TRIBE_HOSTED_AI_KEY": "hosted-test-key",
           "TRIBE_OAUTH_DISCORD_BASE": a2.MOCK, "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in ("TRIBE_PUBLIC_URL", "TRIBE_OPEN_SIGNUP"): env.pop(k, None)
    log = open(os.path.join(tmp, "server.log"), "a")
    srv = start(tribe, env, PORT, log); srv2 = None
    try:
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        ok(api("/oauth/config/discord", "PUT", {"clientId": a2.CLIENT_ID, "clientSecret": a2.SECRET, "enabled": True}, token=host), "discord on")
        ok(api("/accounts/admin/settings", "PUT", {"smtp": {"host": "127.0.0.1", "port": SMTP_PORT, "secure": "none", "user": "tribe", "pass": "smtp-pass", "from": "tribe@example.test"}}, token=host), "smtp")
        code = ok(api("/invites", "POST", {}, token=host))["invite"]["code"]
        friend = ok(api("/join", "POST", {"code": code, "name": "Friend"}))["token"]
        pid = ok(api("/projects", token=host))["projects"][0]["id"]

        # K: the cookie holds a member key, never an account token
        code2 = ok(api("/invites", "POST", {}, token=host))["invite"]["code"]
        st, j, cookies = raw("/accounts/signup", "POST", {"username": "Kay", "password": "long enough phrase", "invite": code2}, headers=remote())
        assert st == 200 and j["token"].startswith("tca_") and j.get("memberToken"), (st, j)
        tribe_s = [c for c in cookies if c.startswith("tribe_s=")]
        assert tribe_s and "tca_" not in tribe_s[0] and urllib.parse.unquote(tribe_s[0].split(";")[0][8:]) == j["memberToken"], cookies
        st, j, cookies = raw("/accounts/login", "POST", {"username": "Kay", "password": "long enough phrase"}, headers=remote())
        assert st == 200 and j["token"].startswith("tca_"), (st, j)
        assert all("tca_" not in c for c in cookies), cookies
        st, j, _ = raw("/session", headers={"Cookie": tribe_s[0].split(";")[0]})
        assert st == 200 and j.get("member") and not j["token"].startswith("tca_"), "the cookie still signs the member back in"
        print("  K: tribe_s holds the member key (sign-up with an invite, login), never tca_; /api/session still works")

        # S: search rate limits, per endpoint
        R = remote()
        codes = [api("/gifs/search?q=cat", token=friend, headers=R)[0] for _ in range(32)]
        assert 429 in codes and codes.index(429) <= 30, codes
        st, e = api("/gifs/search?q=cat", token=friend, headers=R); assert st == 429 and "minute" in e["error"], e
        assert api("/chat/general/search?q=hi", token=friend, headers=R)[0] == 200, "another endpoint keeps its own budget"
        assert api("/gifs/search?q=cat", token=host, headers=remote())[0] != 429, "another client keeps its own budget"
        print(f"  S: search 429s after 30 a minute ({codes.index(429)} ok), per endpoint and per client")

        # Z: proof ZIP caps
        for i in range(3): r = save_zip(f"f{i}.zip", zip_bytes(), friend, pid); assert r[0] == 200, r; time.sleep(0.05)
        assert r[1]["removed"] == ["f0.zip"] and "oldest" in r[1]["note"], r
        files = [f["name"] for f in ok(api("/flint/proof", token=friend))["files"]]
        assert sorted(files) == ["f1.zip", "f2.zip"], files
        for i in range(2): r = save_zip(f"h{i}.zip", zip_bytes(), host, pid); assert r[0] == 200, r; time.sleep(0.05)
        left = sorted(os.listdir(Path(tribe) / "exports")); zips = [n for n in left if n.endswith(".zip")]
        assert len(zips) == 3 and "f1.zip" not in zips, ("the project cap keeps the newest 3", zips)
        st, e = save_zip("big.zip", zip_bytes(1_500_000), friend, pid)
        assert st == 413 and "at most" in e["error"], (st, e)
        print("  Z: proof ZIPs: 2 per person, 3 per project, oldest first with a note; 1.5 MB over a 1 MB cap is a 413")

        # G: gated feature + the trial
        st, e = api("/docs", "POST", {"title": "Board pack", "body": "x", "source": "template:board-meeting"}, token=friend)
        assert st == 402 and e["need"] == "plan" and e["feature"] == "template", (st, e)
        ok(api("/docs", "POST", {"title": "Standup", "body": "x", "source": "template:standup"}, token=friend), "free templates stay free")
        assert api("/premium", "PUT", {"plan": "premium"}, token=friend)[0] == 403
        assert api("/premium", "PUT", {"plan": "premium"}, token=host, headers=remote())[0] == 403, "plans change on the host computer only"
        agent = ok(api("/agents", "POST", {}, token=friend))["token"]
        assert api("/premium/trial", "POST", {}, token=agent)[0] == 403, "agents don't start trials"
        assert ok(api("/premium/trial", "POST", {}, token=friend))["plan"] == "trial"
        assert api("/premium/trial", "POST", {}, token=friend)[0] == 409, "one trial per tribe"
        ok(api("/docs", "POST", {"title": "Board pack", "body": "x", "source": "template:board-meeting"}, token=friend), "with the trial")
        ok(api("/premium", "PUT", {"plan": "free"}, token=host))
        assert api("/docs", "POST", {"title": "Board 2", "body": "x", "source": "template:fundraise"}, token=friend)[0] == 402
        print("  G: premium template refused without the plan (402 need plan); trial once, people only; plan changes host-local")

        # $: credits, concurrently
        ok(api("/llm", "PUT", {"provider": "hosted"}, token=host), "hosted AI")
        ok(api("/premium", "PUT", {"addCredits": 5}, token=host))
        def ask(i):
            return api("/flint/ask", "POST", {"text": f"question {i}"}, token=host)[0]
        with ThreadPoolExecutor(20) as ex: results = list(ex.map(ask, range(20)))
        assert results.count(200) == 5 and results.count(402) == 15, results
        v = ok(api("/premium", token=friend)); assert v["credits"] == 0, v
        st, e = api("/ai/refine", "POST", {"kind": "doc.summary", "input": "some text here"}, token=friend)
        assert st == 402 and e.get("need") == "credits", (st, e)
        ok(api("/premium", "PUT", {"addCredits": 1}, token=host))
        calls = len(AI_CALLS)
        assert api("/flint/ask", "POST", {"text": "PLEASEFAIL"}, token=host)[0] != 200
        assert len(AI_CALLS) == calls + 1 and ok(api("/premium", token=host))["credits"] == 1, "a failed call gives its credit back"
        ok(api("/llm", "PUT", {"provider": "ollama"}, token=host))
        print(f"  $: 20 concurrent answers on 5 credits -> {results.count(200)} answered, {results.count(402)} x 402, balance 0; a failure refunds")

        # R: rituals and agents
        assert api("/rituals/run", "POST", {"kind": "standup"}, token=agent)[0] == 403
        assert api("/rituals", "POST", {"kind": "retro", "start": "2030-01-01T09:00:00Z"}, token=agent)[0] == 403
        assert api("/calendar", "POST", {"title": "x", "start": "2030-01-01T09:00:00Z", "ritual": "standup"}, token=agent)[0] == 403
        ok(api("/calendar", "POST", {"title": "agent meeting", "start": "2030-01-01T09:00:00Z"}, token=agent), "a plain event is fine")
        assert api("/rituals/settings", "PUT", {"agents": True}, token=agent)[0] == 403
        assert api("/rituals/settings", "PUT", {"agents": True}, token=friend)[0] == 403, "a builder is not a lead"
        assert ok(api("/rituals/settings", "PUT", {"agents": True}, token=host))["agents"] is True
        ok(api("/rituals/run", "POST", {"kind": "standup"}, token=agent), "allowed by a lead")
        print("  R: agents can't start rituals (run, schedule, calendar) until a lead allows it")

        # M: memory caps
        for i in range(400): api("/accounts/check?username=x", headers={"X-Forwarded-For": f"10.9.{i // 250}.{i % 250}"})
        mem = ok(api("/dev/mem", token=host)); assert mem["hits"] <= 300, mem
        socks = [WS(friend) for _ in range(30)]; time.sleep(0.5)
        mem = ok(api("/dev/mem", token=host)); assert max(mem["sockets"].values()) <= 24, mem
        for s in socks: s.close()
        time.sleep(0.5)
        watcher, flooder = WS(host), WS(friend)
        watcher.frames(0.8)
        for i in range(200): flooder.send({"type": "activity", "where": f"room {i}"})
        got = [f for f in watcher.frames(2.5) if f.get("type") == "presence"]
        assert len(got) <= 60, f"presence floods are dropped: {len(got)} frames"
        watcher.close(); flooder.close()
        print(f"  M: limiter map {mem['hits']} <= 300; sockets per member <= 24; 200 presence frames -> {len(got)} fan-outs")

        # P: pending codes survive a restart
        st, j = api("/accounts/signup", "POST", {"username": "Pat", "password": "long enough phrase", "email": "pat@example.test"}, headers=remote()); assert st == 200, j
        for _ in range(50):
            if any("pat@example.test" in m["rcpt"] for m in a2.MAIL): break
            time.sleep(0.1)
        vt = a2.link_in([m for m in a2.MAIL if "pat@example.test" in m["rcpt"]][-1], "verify")
        ok(api("/accounts/email/complete", "POST", {"token": vt}, headers=remote()), "verify")
        n0 = len(a2.MAIL)
        ok(api("/accounts/email/request", "POST", {"email": "pat@example.test"}, headers=remote()))
        t1 = a2.link_in(a2.wait_mail(n0 + 1, "magic 1"), "magic")
        ok(api("/accounts/email/request", "POST", {"email": "pat@example.test"}, headers=remote()))
        t2 = a2.link_in(a2.wait_mail(n0 + 2, "magic 2"), "magic")
        v, ch = a2.pkce()
        land = a2.provider_flow("discord", "dee", {"mode": "signin", "desktop": {"challenge": ch, "method": "S256"}})
        f = a2.frag(land); hc, short = f["desktop"], f["short"]
        t_issued = time.time()
        for name in ("pending-auth.json", "pending-desktop.json"):
            pth = Path(tribe) / ".tribe" / name; txt = pth.read_text()
            assert stat.S_IMODE(os.stat(pth).st_mode) == 0o600, (name, oct(os.stat(pth).st_mode))
            for secret in (t1, t2, hc, short): assert secret not in txt, f"{name} holds a raw code"
        srv.terminate(); srv.wait(10)
        srv = start(tribe, env, PORT, log)
        out = ok(api("/accounts/email/complete", "POST", {"token": t1}, headers=remote()), "magic link after a restart")
        assert out["account"]["username"] == "Pat", out
        assert api("/accounts/email/complete", "POST", {"token": t1}, headers=remote())[0] == 410, "still once"
        ex = ok(api("/oauth/desktop/exchange", "POST", {"code": hc, "verifier": v}, headers=remote()), "desktop code after a restart")
        assert api("/oauth/desktop/exchange", "POST", {"code": hc, "verifier": v}, headers=remote())[0] == 410, "still once"
        assert api("/oauth/desktop/exchange", "POST", {"short": short, "verifier": v}, headers=remote())[0] == 410, "…its typed twin too"
        time.sleep(max(0, LINK_MS / 1000 - (time.time() - t_issued)) + 1)
        assert api("/accounts/email/complete", "POST", {"token": t2}, headers=remote())[0] == 410, "and still expires"
        print(f"  P: a magic link and a desktop code survive a restart (hashes only, 0600), once, then expire (mode {ex.get('mode')})")

        # H: plain http refused when a public https address is set
        tribe2 = os.path.join(tmp, "tribe2"); os.makedirs(tribe2)
        env2 = {**env, "TRIBE_PUBLIC_URL": "https://tribe.example.test"}
        srv2 = start(tribe2, env2, PORT2, log)
        B2 = f"http://localhost:{PORT2}/api"
        def call2(path, headers):
            req = urllib.request.Request(B2 + path, method="POST", data=b'{"username":"nobody","password":"long enough phrase"}', headers={"Content-Type": "application/json", **headers})
            try:
                with a2.opener.open(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
        st, e = call2("/accounts/login", {"X-Forwarded-For": "198.51.100.7"})
        assert st == 403 and e.get("code") == "https" and "https://tribe.example.test" in e["error"], (st, e)
        st, e = call2("/accounts/login", {"X-Forwarded-For": "198.51.100.7", "X-Forwarded-Proto": "http", "Host": "tribe.example.test", "Origin": "https://tribe.example.test"})
        assert st == 403 and e.get("code") == "https", (st, e)
        st, e = call2("/accounts/login", {"X-Forwarded-For": "198.51.100.8", "X-Forwarded-Proto": "https", "Host": "tribe.example.test", "Origin": "https://tribe.example.test"})
        assert st == 401, ("https passes to the normal answer", st, e)
        st, e = call2("/accounts/login", {"X-Forwarded-For": "198.51.100.9", "Host": "tribe.example.test", "Origin": "https://tribe.example.test"})
        assert st == 401, ("the public host name came through the tunnel", st, e)
        assert call2("/accounts/login", {})[0] == 401, "the host computer itself is fine"
        print("  H: plain-http remote account routes refused with the https address; https, the tunnel host and this computer pass")

        # F: code files
        srv2.terminate(); srv2.wait(10); srv2 = None
        repo, outside = os.path.join(tmp, "repo"), os.path.join(tmp, "outside"); os.makedirs(repo); os.makedirs(outside)
        Path(outside, "victim.txt").write_text("keep me")
        g = lambda *a: subprocess.run(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
        g("init", "-q", "-b", "main")
        for rel, t in {"README.md": "# r", ".env": "TOKEN=1", "node_modules/a.js": "x", "src/game.js": "let a = 1"}.items():
            Path(repo, rel).parent.mkdir(parents=True, exist_ok=True); Path(repo, rel).write_text(t)
        os.symlink(outside, os.path.join(repo, "out"))
        g("add", "-f", "-A"); g("commit", "-q", "-m", "init")
        tribe3 = os.path.join(tmp, "tribe3"); os.makedirs(tribe3)
        srv2 = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT3), "--dir", tribe3, "--repo", repo, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
        B3 = f"http://localhost:{PORT3}/api"
        def c3(path, method="GET", body=None, token=None, project=None):
            h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
            req = urllib.request.Request(B3 + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
            try:
                with a2.opener.open(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
            except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
        for _ in range(150):
            try:
                if c3("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        h3 = c3("/bootstrap", "POST", {"name": "Host"})[1]["token"]
        pa = [p for p in c3("/projects", token=h3)[1]["projects"] if p.get("repo") or p.get("hasRepo")][0]["id"] if any(p.get("repo") or p.get("hasRepo") for p in c3("/projects", token=h3)[1]["projects"]) else c3("/projects", token=h3)[1]["projects"][0]["id"]
        pb = (lambda r: (r.get("project") or r)["id"])(c3("/projects", "POST", {"name": "Other game"}, token=h3)[1])
        inv_b = c3("/invites", "POST", {"project": pb, "role": "builder"}, token=h3)[1]["invite"]["code"]
        sam = c3("/join", "POST", {"code": inv_b, "name": "Sam"})[1]["token"]
        inv_a = c3("/invites", "POST", {"project": pa, "role": "spectator"}, token=h3)[1]["invite"]["code"]
        assert c3("/join", "POST", {"code": inv_a}, token=sam)[0] == 200
        inv_t = c3("/invites", "POST", {"role": "builder"}, token=h3)[1]["invite"]["code"]
        bo = c3("/join", "POST", {"code": inv_t, "name": "Bo"})[1]["token"]
        st, e = c3("/code/file", "PUT", {"path": "src/new.js", "text": "x"}, token=sam, project=pa); assert st == 403, ("spectator here, builder elsewhere", st, e)
        assert c3("/code/file?path=src/game.js", "DELETE", token=sam, project=pa)[0] == 403
        assert Path(repo, "src/game.js").exists()
        assert c3("/code/list", token=sam, project=pa)[0] == 200, "reading is fine"
        ok_ = c3("/code/file", "PUT", {"path": "src/new.js", "text": "let b = 2"}, token=bo, project=pa); assert ok_[0] == 200, ok_
        for bad, want in (("../outside/victim.txt", 400), ("/etc/passwd", 400), (".env", 403), ("node_modules/a.js", (403, 404)), ("out/victim.txt", 400), ("src/../../outside/victim.txt", 400)):
            st, e = c3(f"/code/file?path={urllib.parse.quote(bad)}", "DELETE", token=bo, project=pa)
            assert (st in want if isinstance(want, tuple) else st == want), (bad, st, e)
        assert Path(outside, "victim.txt").read_text() == "keep me" and Path(repo, ".env").exists() and Path(repo, "node_modules/a.js").exists()
        st, r = c3("/code/file?path=src/new.js", "DELETE", token=bo, project=pa); assert st == 200 and r["removed"], (st, r)
        paths = c3("/code/list", token=bo, project=pa)[1]["paths"]
        assert "README.md" in paths and ".env" not in paths and not any(p.startswith("node_modules/") for p in paths), paths
        print("  F: code write needs write permission here; delete refuses .., absolute, secrets, node_modules and symlinked folders; list hides secrets")
        print("ok security6")
    except Exception:
        log.flush(); print(open(os.path.join(tmp, "server.log")).read()[-3000:]); raise
    finally:
        for s in (srv, srv2):
            if s: s.terminate()
        for s in servers: s.shutdown()


if __name__ == "__main__":
    main()
