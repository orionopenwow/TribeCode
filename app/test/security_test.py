"""Security regression test (API only, no browser): the fixes from the 2026-11-06 security review.

C1  run_checks (runs the host's check command on a branch) is only for the host's master integrator agent.
H2  spectators can't mint invites; only the host or the invite's author can revoke it; scoped members
    don't see other projects' invite codes.
H3  forwarding a message into another project's channel is refused.
H4  "only from the host machine" endpoints refuse tunnelled requests (public Host header or foreign Origin),
    even though tunnels connect from 127.0.0.1.
M1  clone URLs: no file:// or git://.
Usage: python app/test/security_test.py
"""
import http.client, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 4799 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"


def api(path, method="GET", body=None, token=None, project=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def raw(path, body, host_header, origin=None):
    """A request from 127.0.0.1 with a chosen Host header, like a tunnel forwarding a public request."""
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=30)
    h = {"Host": host_header, "Content-Type": "application/json"}
    if origin: h["Origin"] = origin
    c.request("POST", "/api" + path, body=json.dumps(body), headers=h)
    r = c.getresponse(); r.read(); c.close()
    return r.status


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


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec-")
    repo = Path(tmp) / "game"; repo.mkdir()
    marker = Path(tmp) / "pwned.txt"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(Path(tmp) / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)

        # ---- H4: tunnelled requests are not "this machine" ----
        assert raw("/host/quick-invite", {}, "evil.trycloudflare.com") == 403, "public Host header must not count as local"
        assert raw("/host/quick-invite", {}, f"localhost:{PORT}", origin="https://evil.example") == 403, "foreign Origin must not count as local"
        assert raw("/bootstrap", {"name": "Mallory"}, "box.tail1234.ts.net") == 403, "bootstrap through a tunnel must be refused"
        h = urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/api/health", headers={"Host": "evil.trycloudflare.com"}))
        assert "user" not in json.loads(h.read()), "OS user name must not leak through a tunnel"

        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pa = ok(api("/projects", "POST", {"path": str(repo), "init": True}, token=host), "project A")["project"]["id"]
        pb = ok(api("/projects", "POST", {"name": "Secret"}, token=host), "project B")["project"]["id"]

        # ---- H2: invites ----
        spec_inv = ok(api("/invites", "POST", {"role": "spectator", "project": "tribe"}, token=host))["invite"]
        assert len(spec_inv["code"]) >= 8, spec_inv
        spec = ok(api("/join", "POST", {"code": spec_inv["code"], "name": "Sam"}))["token"]
        st, d = api("/invites", "POST", {"role": "builder", "maxUses": 100, "hours": 720}, token=spec)
        assert st == 403, f"spectator minted an invite: {st} {d}"
        b_inv = ok(api("/invites", "POST", {"role": "builder", "project": pa}, token=host))["invite"]
        maya = ok(api("/join", "POST", {"code": b_inv["code"], "name": "Maya"}))["token"]   # scoped to project A
        tribe_inv = ok(api("/invites", "POST", {"role": "builder", "project": "tribe"}, token=host))["invite"]
        seen = [i["code"] for i in ok(api("/invites", token=maya))["invites"]]
        assert tribe_inv["code"] not in seen, "a project-scoped member must not see whole-tribe invite codes"
        assert api(f"/invites/{tribe_inv['code']}", "DELETE", token=spec)[0] == 403, "spectator revoked the host's invite"
        assert api(f"/invites/{tribe_inv['code']}", "DELETE", token=maya)[0] == 403, "builder revoked someone else's invite"
        ok(api(f"/invites/{tribe_inv['code']}", "DELETE", token=host), "host revokes")

        # ---- H3: forwarding into another project's channel ----
        msg = ok(api("/chat/general", "POST", {"text": "hello A"}, token=maya, project=pa))["message"]
        projs = {p["id"]: p for p in ok(api("/projects", token=host))["projects"]}
        ch_b = projs[pb].get("channel") or f"p-{pb}"
        st, d = api("/chat/general/forward", "POST", {"id": msg["id"], "to": ch_b}, token=maya, project=pa)
        assert st == 403, f"forward into another project's channel: {st} {d}"
        leaked = [m for m in ok(api("/chat/general?limit=50", token=host, project=pb))["messages"] if m.get("text") == "hello A"]
        assert not leaked, "message leaked into project B"

        # ---- C1: run_checks is host-integrator only ----
        ag = ok(api("/agents", "POST", token=maya, project=pa))
        is_err, text = mcp(ag["token"], "run_checks", {"branch": "main"})
        assert is_err and "master integrator" in text, f"builder's agent ran checks: {text[:200]}"
        assert not marker.exists()

        # ---- Claude Code in and out: connect from anywhere, status, disconnect revokes the key ----
        assert ag["command"].startswith("claude mcp add --transport http tribecode ") and ag["url"].endswith("/mcp"), ag
        assert ag["commands"]["here"] and ag["remove"] == "claude mcp remove tribecode", ag
        mcp(ag["token"], "tribe_overview")
        assert ok(api("/agents/mine", token=maya, project=pa))["online"], "agent should show as connected"
        ok(api("/agents/mine", "DELETE", token=maya, project=pa), "disconnect")
        try:
            mcp(ag["token"], "tribe_overview"); raise AssertionError("revoked agent key still works")
        except urllib.error.HTTPError as e:
            assert e.code in (401, 403), e.code
        assert not ok(api("/agents/mine", token=maya, project=pa))["agent"], "no agent after disconnect"

        # ---- M1: clone URLs ----
        for u in ["file:///etc", "git://169.254.169.254/x.git", "ext::sh -c id", "--upload-pack=id"]:
            st, d = api("/projects", "POST", {"url": u}, token=host)
            assert st == 400, f"clone URL {u} accepted: {st} {d}"
    finally:
        srv.terminate()
    print("Security test passed")


if __name__ == "__main__":
    main()
