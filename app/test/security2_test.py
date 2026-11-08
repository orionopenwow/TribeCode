"""Security regression test 2 (API only, no browser): the fixes from the 2026-11-08 security review (fix/security-review).

S1  "only from this computer" endpoints (quick invite, demo tribe, bootstrap) refuse browser pages from any other origin on
    the host: a sandboxed preview or file:// page (Origin: null), another localhost port (a project's dev server), or a
    cross-site request without an Origin. The app's own page and the desktop app still work.
S2  a spectator or a muted member can't post through the WebSocket "announce" message.
S3  an expired guest's connected agent stops working with the guest.
S4  behind a tunnel the join/invite rate limit is per client (CF-Connecting-IP / X-Forwarded-For), not one bucket for all.
S5  /api/health only shows home network and Tailscale addresses to members and this machine.
S6  the app's pages can't be framed by other sites and aren't type-sniffed.
S7  a project-scoped member can't read or question another project's approval by id.
S8  the backup leaves out the sign-in client secrets (.tribe/oauth.json) and .tribe/secrets/.
Usage: python app/test/security2_test.py
"""
import base64, http.client, io, json, os, socket, subprocess, tarfile, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 5270 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"


def api(path, method="GET", body=None, token=None, project=None, headers=None, raw=False):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            return (r.status, data, r.headers) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        return (e.code, data, e.headers) if raw else (e.code, json.loads(data or b"{}"))


def local(path, body, headers):
    """A request from 127.0.0.1 with Host: localhost, like the host's own browser, plus the given headers."""
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=30)
    c.request("POST", "/api" + path, body=json.dumps(body), headers={"Host": f"localhost:{PORT}", "Content-Type": "application/json", **headers})
    r = c.getresponse(); data = r.read(); c.close()
    return r.status, data


def ok(r, what=""):
    st, d = r[0], r[1]
    assert st == 200, f"{what}: {st} {d}"
    return d


def ws_send(token, msg):
    """Open /ws with a token, send one JSON message, read for a moment, close."""
    s = socket.create_connection(("127.0.0.1", PORT), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall(f"GET /ws?token={token} HTTP/1.1\r\nHost: localhost:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
    assert s.recv(4096).startswith(b"HTTP/1.1 101"), "websocket handshake"
    data = json.dumps(msg).encode(); mask = os.urandom(4)
    head = bytes([0x81, 0x80 | len(data)]) if len(data) < 126 else bytes([0x81, 0x80 | 126, len(data) >> 8, len(data) & 255])
    s.sendall(head + mask + bytes(b ^ mask[i & 3] for i, b in enumerate(data)))
    time.sleep(0.4); s.close()


def start(tmp):
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(Path(tmp) / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, env={**os.environ, "TRIBE_NO_DOWNLOAD": "1"})
    for _ in range(100):
        try: urllib.request.urlopen(BASE + "/api/health"); return srv
        except Exception: time.sleep(0.1)
    raise RuntimeError("server did not start")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec2-")
    victim = Path(tmp) / "victim"; victim.mkdir(); (victim / "notes.txt").write_text("private")
    srv = start(tmp)
    try:
        # ---- S1: foreign pages on the host machine are not "this computer" ----
        evil = {"project": {"path": str(victim), "name": "Loot"}, "agent": True}
        for origin in ["null", "http://localhost:5173", f"http://127.0.0.1:{PORT + 1}", "https://evil.example"]:
            st, d = local("/host/quick-invite", evil, {"Origin": origin})
            assert st == 403, f"quick-invite from Origin {origin}: {st} {d[:200]}"
            st, d = local("/host/demo-tribe", {"projects": [{"name": "x"}]}, {"Origin": origin})
            assert st == 403, f"demo-tribe from Origin {origin}: {st} {d[:200]}"
            st, d = local("/bootstrap", {"name": "Mallory"}, {"Origin": origin})
            assert st == 403, f"bootstrap from Origin {origin}: {st} {d[:200]}"
        st, d = local("/host/quick-invite", evil, {"Sec-Fetch-Site": "cross-site"})
        assert st == 403, f"cross-site request without an Origin: {st} {d[:200]}"
        st, d = local("/host/quick-invite", evil, {"Sec-Fetch-Site": "same-site"})   # another port on localhost is the same site
        assert st == 403, f"same-site request without an Origin: {st} {d[:200]}"
        # the app's own page and the desktop app still count as this computer
        host = json.loads(local("/bootstrap", {"name": "Orion"}, {"Origin": f"http://localhost:{PORT}", "Sec-Fetch-Site": "same-origin"})[1])["token"]
        st, d = local("/host/quick-invite", {}, {"Origin": "http://tauri.localhost"})
        assert st == 200 and b"/join/" in d, f"desktop app quick invite: {st} {d[:200]}"
        st, d = local("/host/quick-invite", {}, {"Origin": f"http://127.0.0.1:{PORT}"})
        assert st == 200, f"own page quick invite: {st} {d[:200]}"

        pa = ok(api("/projects", "POST", {"name": "Game"}, token=host), "project A")["project"]["id"]
        pb = ok(api("/projects", "POST", {"name": "Secret"}, token=host), "project B")["project"]["id"]

        # ---- S2: announce over the WebSocket follows the posting rules ----
        spec_inv = ok(api("/invites", "POST", {"role": "spectator", "project": "tribe"}, token=host))["invite"]
        spec = ok(api("/join", "POST", {"code": spec_inv["code"], "name": "Sam"}))["token"]
        ws_send(spec, {"type": "announce", "text": "spectator-shout-123"})
        b_inv = ok(api("/invites", "POST", {"role": "builder", "project": "tribe"}, token=host))["invite"]
        bob_join = ok(api("/join", "POST", {"code": b_inv["code"], "name": "Bob"}))
        bob, bob_id = bob_join["token"], bob_join["member"]["id"]
        ok(api("/perms/mute", "POST", {"member": bob_id, "minutes": 5}, token=host), "mute Bob")
        ws_send(bob, {"type": "announce", "text": "muted-shout-456"})
        texts = [m.get("text") for m in ok(api("/chat/general?limit=100", token=host, project=pa))["messages"]]
        texts += [m.get("text") for m in ok(api("/chat/general?limit=100", token=host))["messages"]]
        assert "spectator-shout-123" not in texts, "a spectator posted through announce"
        assert "muted-shout-456" not in texts, "a muted member posted through announce"

        # ---- S4: per-client rate limit behind a tunnel ----
        tun = {"X-Forwarded-For": "203.0.113.7", "Tailscale-Funnel-Request": "?1"}
        codes = [api("/join", "POST", {"code": "nope1234", "name": "x"}, headers=tun)[0] for _ in range(12)]
        assert 429 in codes, f"one tunnel client should hit the limit: {codes}"
        st, _ = api("/join", "POST", {"code": "nope1234", "name": "x"}, headers={"X-Forwarded-For": "198.51.100.9", "Tailscale-Funnel-Request": "?1"})
        assert st == 410, f"another tunnel client must not share that limit: {st}"
        st, _ = api("/join", "POST", {"code": "nope1234", "name": "x"}, headers={"CF-Connecting-IP": "198.51.100.10", "CF-Ray": "x"})
        assert st == 410, f"a cloudflared client must not share that limit: {st}"

        # ---- S5: health ----
        pub = json.loads(urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/api/health", headers={"Host": "box.tail1234.ts.net"})).read())
        assert "lan" not in pub and "user" not in pub, f"health leaks network details through a tunnel: {list(pub)}"
        assert "lan" in ok(api("/health", token=host)), "members still get the addresses"

        # ---- S6: page headers ----
        for p in ["/", "/join/abc12345", "/index.html"]:
            with urllib.request.urlopen(BASE + p) as r:
                csp = r.headers.get("Content-Security-Policy") or ""
                assert "frame-ancestors 'self'" in csp, f"{p}: {csp}"
                assert r.headers.get("X-Content-Type-Options") == "nosniff", p

        # ---- S7: approvals by id stay in their project ----
        m_inv = ok(api("/invites", "POST", {"role": "builder", "project": pa}, token=host))["invite"]
        maya = ok(api("/join", "POST", {"code": m_inv["code"], "name": "Maya"}))["token"]
        ap = ok(api("/approvals", "POST", {"title": "Drop the prod database", "risk": "high"}, token=host, project=pb), "approval in B")["approval"]
        st, d = api(f"/approvals/{ap['id']}", token=maya, project=pa)
        assert st == 404, f"scoped member read another project's approval: {st} {d}"
        st, d = api(f"/approvals/{ap['id']}/question", "POST", {"text": "hi"}, token=maya, project=pa)
        assert st == 404, f"scoped member questioned another project's approval: {st} {d}"

        # ---- S8: backup contents ----
        st, d = local("/oauth/config/github", {"clientId": "Iv1.testclient", "clientSecret": "supersecretvalue123"}, {"Authorization": "Bearer " + host})
        assert st == 200, f"oauth config: {st} {d[:200]}"
        gif = Path(tmp) / "tribe" / ".tribe" / "secrets"; gif.mkdir(parents=True, exist_ok=True); (gif / "probe.json").write_text('{"k":"v"}')
        st, data, _ = api("/backup", token=host, raw=True)
        assert st == 200, st
        names = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz").getnames()
        assert not [n for n in names if n.endswith(".tribe/oauth.json") or "/.tribe/secrets" in "/" + n], [n for n in names if ".tribe" in n]
        assert any(n.endswith(".tribe/members.json") for n in names), names[:20]

        # ---- S3: an expired guest's agent ----
        g_inv = ok(api("/invites", "POST", {"role": "builder", "project": pa, "guest": True, "hours": 1}, token=host))["invite"]
        guest = ok(api("/join", "POST", {"code": g_inv["code"], "name": "Gus"}))
        ag = ok(api("/agents", "POST", token=guest["token"], project=pa))
        assert ok(api("/me", token=ag["token"]))["member"]["role"] == "agent"
        srv.terminate(); srv.wait(10)
        mf = Path(tmp) / "tribe" / ".tribe" / "members.json"
        mem = json.loads(mf.read_text())
        for m in mem:
            if m["id"] == guest["member"]["id"]: m["guestUntil"] = "2020-01-01T00:00:00.000Z"
        mf.write_text(json.dumps(mem))
        srv = start(tmp)
        assert api("/me", token=guest["token"])[0] == 401, "expired guest still signed in"
        assert api("/me", token=ag["token"])[0] == 401, "an expired guest's agent still works"
    finally:
        srv.terminate()
    print("Security test 2 passed")


if __name__ == "__main__":
    main()
