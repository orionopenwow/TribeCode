"""Security regression test 7: the build runner and the feed fetcher (feat/build-feeds).

B   Build runner (server/checks.js): only leads turn it on, and it is off on a project others can write; spectators,
    guests-by-role and strangers can't run it; a check line with shell syntax never reaches a shell (";", "&&", "$()",
    backticks and ">" are plain arguments); a token a check prints is cut from the stored log; the check sees none of
    the server's environment; a run of a project you can't see is not readable; an invited-style agent can't switch it on.
W   Feed fetcher (server/workfetch.js, workfeed.js): following a private, loopback, link-local or metadata address, a
    plain-http address, an address with credentials or an odd port is refused before any request is made (a canary
    server on loopback records zero hits); only hosts and admins follow, fetch, hide, block or publish; the feed is
    members-only by default and, when open, carries no member ids and is rate-limited; requests need a person.
M   Flint's model files: members only, and only the three fixed file names.
Usage: python3 app/test/security7_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import http.server, json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, CANARY = 5820 + OFF, 5821 + OFF
BASE = f"http://localhost:{PORT}"
SECRET = "sk-live-NEVERLEAK-0123456789abcdefghij"
HITS = []


class Canary(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        HITS.append(self.path); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b"{}")


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def wait(fn, what, t=60):
    end = time.time() + t
    while time.time() < end:
        try: v = fn()
        except Exception: v = None
        if v: return v
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-sec7-", dir="/tmp")); home = tmp / "home"; home.mkdir()
    pwned = tmp / "pwned"
    def folder(name, files):
        d = home / "Code" / name; d.mkdir(parents=True)
        for f, t in files.items(): (d / f).write_text(t)
    # one line with every shell trick: if a shell ever saw it, the marker files would exist
    line = f"node show.js ; touch {pwned}-semi && touch {pwned}-and $(touch {pwned}-sub) `touch {pwned}-tick` > {pwned}-redir | touch {pwned}-pipe"
    folder("tricky", {"tribe.json": json.dumps({"check": line}), "show.js": "console.log('ARGS ' + JSON.stringify(process.argv.slice(2))); console.log('ENV ' + JSON.stringify(process.env)); console.log('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 and https://user:hunter2@example.com/x');\n"})
    folder("shared", {"package.json": json.dumps({"scripts": {"test": f"node -e \"require('fs').writeFileSync('{pwned}-ran','1')\""}})})
    folder("private", {"tribe.json": json.dumps({"check": ["node", "-e", "console.log('private run')"]})})
    canary = http.server.HTTPServer(("127.0.0.1", CANARY), Canary); threading.Thread(target=canary.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home), "OPENAI_API_KEY": SECRET, "TRIBE_SETUP_CODE_X": SECRET}
    env.pop("TRIBE_FEED_ALLOW_LOCAL", None)
    log = open(tmp / "server.log", "w")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        wait(lambda: api("/health")[0] == 200, "server")
        host = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        pids = {}
        for n in ("tricky", "shared", "private"):
            pids[n] = api("/projects", "POST", {"name": n.title()}, token=host)[1]["project"]["id"]
            st, d = api(f"/projects/{pids[n]}/folder", "PUT", {"path": f"~/Code/{n}"}, token=host); assert st == 200, d
        def join(role, name, n):
            code = api("/invites", "POST", {"role": role, "maxUses": 1, "project": pids[n]}, token=host)[1]["invite"]["code"]
            return api("/join", "POST", {"code": code, "name": name})[1]["token"]
        maya, sam = join("builder", "Maya", "shared"), join("spectator", "Sam", "shared")
        done = lambda n: wait(lambda: (lambda c: c if c["runs"] and not c["running"] and not c["queued"] else None)(api("/checks", token=host, project=pids[n])[1]), n)

        # ---------- B: the build runner ----------
        assert api("/checks", project=pids["shared"])[0] == 401 and api("/checks/run", "POST", {}, project=pids["shared"])[0] == 401
        c = api("/checks", token=maya, project=pids["shared"])[1]; assert not c["allowed"] and c["needsLead"], c
        for tok in (maya, sam):
            assert api("/checks", "PUT", {"on": True}, token=tok, project=pids["shared"])[0] == 403
            assert api("/checks/run", "POST", {}, token=tok, project=pids["shared"])[0] in (403, 409)
        st, ag = api("/agents", "POST", {}, token=maya, project=pids["shared"]); assert st == 200, ag
        assert api("/checks", "PUT", {"on": True}, token=ag["token"], project=pids["shared"])[0] == 403, "an agent can't switch the runner on"
        assert api("/checks/run", "POST", {}, token=ag["token"], project=pids["shared"])[0] == 409
        time.sleep(1.5); assert not Path(f"{pwned}-ran").exists(), "nothing ran while it was off"
        # no shell: the tricks arrive as plain arguments
        assert api("/checks/run", "POST", {}, token=host, project=pids["tricky"])[0] == 200
        c = done("tricky"); r = c["runs"][0]; assert r["ok"], r
        run = api(f"/checks/runs/{r['id']}", token=host, project=pids["tricky"])[1]["run"]; text = run["log"]
        args = json.loads(next(l for l in text.split("\n") if l.startswith("ARGS "))[5:])
        assert ";" in args and "&&" in args and any(a.startswith("$(touch") for a in args) and ">" in args and "|" in args, args
        left = [p.name for p in tmp.iterdir() if p.name.startswith("pwned")]; assert left == [], f"a shell ran part of the check line: {left}"
        seen = json.loads(next(l for l in text.split("\n") if l.startswith("ENV "))[4:])
        assert SECRET not in text and not [k for k in seen if "KEY" in k or "TOKEN" in k or "SECRET" in k or (k.startswith("TRIBE_") and k != "TRIBE_CHECK")], sorted(seen)
        assert "ghp_abcdefghijklmnopqrstuvwxyz0123456789" not in text and "[token]" in text and "hunter2" not in text, "credentials a check prints are cut from the stored log"
        assert "ghp_" not in json.dumps(api("/dash/band", token=host, project=pids["tricky"])[1]) and "ghp_" not in json.dumps(c)
        # a run in a project you are not in
        assert api("/checks/run", "POST", {}, token=host, project=pids["private"])[0] == 200; pr = done("private")["runs"][0]
        assert api(f"/checks/runs/{pr['id']}", token=maya, project=pids["private"])[0] in (403, 404), "not your project"
        assert api(f"/checks/runs/{pr['id']}", token=maya, project=pids["shared"])[0] == 404, "run ids don't cross projects"
        assert api("/checks/runs/..%2F..%2Fmembers", token=host, project=pids["private"])[0] == 404
        print("  B: runner off on shared projects until a lead says so; no shell; clean env; tokens cut from logs; runs stay in their project")

        # ---------- W: the feed fetcher ----------
        fp = "aaaa-bbbb-cccc-dddd"
        bad = [f"http://localhost:{CANARY}/feed.json", f"http://127.0.0.1:{CANARY}/feed.json", f"https://127.0.0.1:{CANARY}/feed.json", f"https://localhost:{CANARY}/feed.json", f"https://[::1]:{CANARY}/feed.json",
               f"https://[::ffff:127.0.0.1]:{CANARY}/feed.json", f"https://2130706433:{CANARY}/x", f"https://0x7f.0.0.1:{CANARY}/x", f"https://017700000001:{CANARY}/x", "https://10.0.0.1/feed.json", "https://192.168.1.1/feed.json", "https://172.16.0.9/feed.json",
               "https://169.254.169.254/latest/meta-data/iam/", "https://[fd00:ec2::254]/latest/", "https://[fe80::1]/x", "https://0.0.0.0/x", "https://user:pw@example.com/feed.json", "https://example.com:25/feed.json",
               "file:///etc/passwd", "gopher://127.0.0.1/x", "ftp://example.com/x", "javascript:alert(1)"]
        for u in bad:
            st, d = api("/work/subscriptions", "POST", {"url": u, "fingerprint": fp}, token=host); assert st == 400, (u, st, d)
            st, d = api("/work/subscriptions", "POST", {"url": u, "key": "A" * 43, "name": "x"}, token=host); assert st == 400, (u, st, d)
        assert HITS == [], f"a refused address was still requested: {HITS}"
        assert api("/work/admin", token=host)[1]["subscriptions"] == []
        for path, method, body in (("/work/subscriptions", "POST", {"key": "B" * 43}), ("/work/fetch", "POST", {}), ("/work/hide", "POST", {"key": "B" * 43, "gig": "abc"}), ("/work/settings", "PUT", {"publish": "open"}), ("/work/admin", "GET", None)):
            for tok in (maya, sam, ag["token"]): assert api(path, method, body, token=tok)[0] == 403, (path, tok == maya)
        assert api("/work/feed.json")[0] == 401, "members-only by default"
        assert api("/work/requests", "POST", {"from": "B" * 43, "gig": "abc", "contact": "x"}, token=sam)[0] == 403 and api("/work/requests", "POST", {"from": "B" * 43, "gig": "abc", "contact": "x"}, token=ag["token"])[0] == 403
        g = api("/talent/gigs", "POST", {"title": "Sprites wanted", "kind": "task", "description": "Eight sprites"}, token=host)[1]["gig"]
        assert api(f"/talent/gigs/{g['id']}/share", "POST", {"contact": "@camp"}, token=host)[0] == 200
        assert api("/work/settings", "PUT", {"publish": "open"}, token=host)[0] == 200
        st, feed = api("/work/feed.json"); assert st == 200 and feed["gigs"][0]["title"] == "Sprites wanted", feed
        members = [m["id"] for m in api("/members", token=host)[1]["members"]]; blob = json.dumps(feed)
        assert not [m for m in members if m in blob] and host not in blob and "privateKey" not in blob and "PRIVATE KEY" not in blob, "no member ids, tokens or key material in the feed"
        codes = [api("/work/feed.json")[0] for _ in range(40)]; assert 429 in codes and codes[0] == 200, codes
        assert api("/work/settings", "PUT", {"publish": "members"}, token=host)[0] == 200 and api("/work/feed.json")[0] == 401
        print("  W: private, loopback, link-local and metadata addresses are refused before any request; hosts only; the open feed is clean and rate-limited")

        # ---------- M: Flint's model files ----------
        assert api("/flint/model")[0] == 401 and api("/flint/model/file/model.safetensors")[0] == 401
        info = api("/flint/model", token=maya)[1]; assert info["hosted"] is False and info["base"].startswith("https://") and info["license"] == "MIT", info
        for name in ("model.safetensors", "..%2F..%2Fpackage.json", "feed-key.json", "%2e%2e%2fmembers.json"): assert api(f"/flint/model/file/{name}", token=maya)[0] == 404, name
        print("  M: the model's address is for members; only the fixed file names are ever served")
        print("ok security7")
    except Exception:
        log.flush(); print(open(tmp / "server.log").read()[-2000:]); raise
    finally:
        srv.terminate(); canary.shutdown()


if __name__ == "__main__":
    main()
