"""Security checks for Publish for real (server/publishreal.js, app/ui/pubcore.js, docs/PUBLISH.md).

No browser. GitHub is the stand-in in app/test/ghmock.py, which records every sign-in it is shown.
R  roles: no key gets 401 on every route; a spectator can read the status but can't change the kind, download, publish
   or add an app build; an AI helper's key can't publish outside the tribe or add an app build.
T  the sign-in: one member's GitHub sign-in is never used for another member's publish, never appears in any answer
   (status, publish, build, errors), in the publish record on disk, or in the log; a GitHub error that quotes a
   sign-in is scrubbed before it reaches the person.
S  what goes out: a secret in the project blocks the zip and the publish (nothing reaches GitHub); hidden files, key
   files and the project's own build files never ride along; the name in the link can't climb out of the account.
O  ownership: a project of theirs that TribeCode didn't make is never written to; a publish is never a forced update.
Usage: python app/test/security9_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import io, json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import ghmock

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, GH_PORT = 7640 + OFF, 7641 + OFF
BASE = f"http://localhost:{PORT}"
TOKEN = "ghp_" + "Sec9A" * 7
LEAK = "ghp_" + "Leak0" * 7
ghmock.GOOD[TOKEN] = "camp"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
seen = []   # every answer body, to search for the sign-in at the end


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=60) as r: data, code = r.read(), r.status
    except urllib.error.HTTPError as e: data, code = e.read(), e.code
    seen.append(data)
    if data[:2] == b"PK": return code, data
    try: return code, json.loads(data or b"{}")
    except Exception: return code, {"raw": data[:200].decode("utf8", "replace")}


def make_repo(path, files):
    for rel, txt in files.items():
        Path(path, rel).parent.mkdir(parents=True, exist_ok=True); Path(path, rel).write_text(txt)
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec9-", dir="/tmp"); work = tempfile.mkdtemp(prefix="sec9-src-", dir="/tmp")
    app = os.path.join(work, "bakery")
    make_repo(app, {"index.html": "<!doctype html><html><head><title>Bakery</title></head><body><h1>Bakery</h1><script src=\"app.js\"></script></body></html>", "app.js": "console.log(1)",
                    ".env": "SECRET=hunter2", "id_rsa": "PRIVATE", ".github/workflows/own.yml": "name: own\n", "android/x.txt": "theirs"})
    gh = ghmock.start(GH_PORT)
    logf = open(os.path.join(tmp, "server.log"), "wb")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Sec Crew"],
                           stdout=logf, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_GITHUB_API": f"http://127.0.0.1:{GH_PORT}", "NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        pid = api("/projects", "POST", {"path": app}, token=camp)[1]["project"]["id"]
        spec = api("/join", "POST", {"code": api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=camp)[1]["invite"]["code"], "name": "Watcher"})[1]["token"]
        sam = api("/join", "POST", {"code": api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=camp)[1]["invite"]["code"], "name": "Sam"})[1]["token"]
        agent = api("/agents", "POST", token=camp, project=pid)[1]["token"]
        Q = f"?project={pid}"
        assert api("/github/token", "POST", {"token": TOKEN}, token=camp)[0] == 200

        # ---------------- R: roles ----------------
        routes = [("GET", "/publish/real" + Q, None), ("PUT", "/publish/real", {"project": pid, "kind": "app"}), ("GET", "/publish/real/zip" + Q, None),
                  ("POST", "/publish/real/pages", {"project": pid}), ("POST", "/publish/real/wrapper", {"project": pid, "kind": "android", "on": True}), ("GET", "/publish/real/build" + Q, None)]
        for m, p, b in routes:
            assert api(p, m, b)[0] == 401, ("no key", m, p)
            assert api(p, m, b, token="not-a-key")[0] == 401, ("bad key", m, p)
        st, s = api("/publish/real" + Q, token=spec); assert st == 200 and not s["canSend"] and not s["github"]["signedIn"], s
        for m, p, b in routes[1:5]:
            assert api(p, m, b, token=spec)[0] == 403, ("spectator", m, p)
        for m, p, b in (routes[1], routes[3], routes[4]):
            st, d = api(p, m, b, token=agent); assert st == 403, ("AI helper", m, p, st, d)
        assert not api("/publish/real" + Q, token=agent)[1]["canSend"]
        assert not ghmock.STATE["repos"], "none of that reached GitHub"
        assert api("/publish/real?project=../../etc", token=camp)[0] in (200, 400, 404) and api("/publish/real/zip?project=nope", token=camp)[0] in (400, 403, 404, 409)

        # ---------------- T: one member's sign-in is theirs alone ----------------
        n = len(ghmock.STATE["auth"])
        st, d = api("/publish/real/pages", "POST", {"project": pid}, token=sam)
        assert st == 401 and d["needGithub"] and len(ghmock.STATE["auth"]) == n, "Sam is asked to sign in; Camp's sign-in is not borrowed"
        assert api("/publish/real" + Q, token=sam)[1]["github"] == {"signedIn": False, "login": None}
        st, r = api("/publish/real/pages", "POST", {"project": pid, "title": "Bakery", "desc": "Fresh bread daily."}, token=camp); assert st == 200, (st, r)
        full = r["repo"]; assert full == "camp/bakery"
        assert api("/publish/real/wrapper", "POST", {"project": pid, "kind": "android", "on": True}, token=camp)[0] == 200
        n = len(ghmock.STATE["auth"])
        b = api("/publish/real/build" + Q, token=sam)[1]
        assert b["state"] == "unknown" and len(ghmock.STATE["auth"]) == n, "the build is not looked up with someone else's sign-in"
        st, d = api("/publish/real/pages", "POST", {"project": pid}, token=sam); assert st == 401 and len(ghmock.STATE["auth"]) == n
        # a GitHub error that quotes a sign-in is scrubbed
        ghmock.STATE["fail"] = f"token {LEAK} is not allowed here"
        st, d = api("/publish/real/pages", "POST", {"project": pid}, token=camp)
        assert st >= 400 and LEAK not in json.dumps(d) and TOKEN not in json.dumps(d), (st, d)
        ghmock.STATE["fail"] = None

        # ---------------- S: what goes out ----------------
        t = ghmock.tree_of(full)
        assert ".env" not in t and "id_rsa" not in t and ".github/workflows/own.yml" not in t and "android/x.txt" not in t, sorted(t)
        assert ".github/workflows/tribecode-android.yml" in t and TOKEN.encode() not in b"".join(t.values()) and b"hunter2" not in b"".join(t.values())
        st, z = api("/publish/real/zip" + Q, token=camp); assert st == 200
        names = zipfile.ZipFile(io.BytesIO(z)).namelist(); assert not any(x.startswith(".") or x in ("id_rsa",) or ".." in x or x.startswith("/") for x in names), names
        for bad in ["../../evil", "..%2f..%2fx", "a/b", "CON .git", "x" * 300, "  "]:
            st, d = api("/publish/real/pages", "POST", {"project": pid, "name": bad}, token=camp)
            assert st in (200, 409) and all(re.match(r"^camp/[a-z0-9][a-z0-9-]{0,99}$", k) for k in ghmock.STATE["repos"]), (bad, st, list(ghmock.STATE["repos"]))
        pushes = {k: v["pushes"] for k, v in ghmock.STATE["repos"].items()}
        Path(app, "config.js").write_text("const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';")
        st, d = api("/publish/real/pages", "POST", {"project": pid}, token=camp); assert st == 409 and d.get("findings"), (st, d)
        assert api("/publish/real/zip" + Q, token=camp)[0] == 409 and api("/publish/real/zip" + Q + "&for=itch", token=camp)[0] == 409
        assert {k: v["pushes"] for k, v in ghmock.STATE["repos"].items()} == pushes and api("/publish/real" + Q, token=camp)[1]["next"] == "fix", "a secret stops everything before GitHub"
        os.remove(os.path.join(app, "config.js"))

        # ---------------- O: ownership ----------------
        ghmock.STATE["repos"]["camp/diary"] = {"head": "c0", "blobs": {}, "trees": {"t0": []}, "commits": {"c0": {"tree": "t0", "parents": []}}, "pages": None, "pushes": 0}
        st, d = api("/publish/real/pages", "POST", {"project": pid, "name": "diary"}, token=camp)
        assert st == 409 and d["taken"] and ghmock.STATE["repos"]["camp/diary"]["pushes"] == 0 and not ghmock.STATE["repos"]["camp/diary"]["blobs"], (st, d)
        assert not any(m in ("DELETE", "PUT") for m, _ in ghmock.STATE["calls"]), "nothing is ever deleted on GitHub"   # the mock itself refuses force and non-fast-forward updates

        # ---------------- the sign-in is nowhere it shouldn't be ----------------
        blob = b"".join(seen); assert TOKEN.encode() not in blob and LEAK.encode() not in blob, "no answer carries a sign-in"
        assert TOKEN not in Path(tmp, "server.log").read_text(errors="replace") and LEAK not in Path(tmp, "server.log").read_text(errors="replace")
        rec = Path(tmp, ".tribe", "publish-real.json"); assert rec.exists() and TOKEN not in rec.read_text()
        assert set(ghmock.STATE["auth"]) == {TOKEN}, "GitHub only ever saw Camp's own sign-in"
        print("security9_test: ok")
    finally:
        srv.terminate(); gh.shutdown(); logf.close()


if __name__ == "__main__":
    main()
