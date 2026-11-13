"""Security regression test 4: the post-v0.29.0 review (docs/REVIEW-2026-11-11.md).

I   inspiration board: a member's personal board (u-<member id>) is theirs alone. Another member can't read it, add to
    it or delete from it by passing ?project=u-<id> or { project: 'u-<id>' }.
T   ✦ file tags: PUT /api/ai/tags can't write the tags of a project the member can't see.
P   Flint's proof-of-work ZIPs hold a project's code: only the member who saved one and the host/admins list or download
    it; a friend can't overwrite someone else's ZIP by saving under the same name; the manifest only names the people
    this member can already see; the host folder path is only told to the host.
B   the Blender bridge's copy-paste command carries no shell syntax ($( ), backticks, ;) from the model name.
O   sign-in for the claude.ai connector (server/claudeauth.js): redirect URIs are validated (no open redirect), PKCE is
    required, only a signed-in person approves, tokens are hashes at rest and never work from a URL, refresh tokens rotate
    and a replay ends the grant, Pause and Remove end the sign-in, the endpoints are rate-limited.
F   the Agent fleet: a friend can't give a task to an agent outside their project.
H   folder homes and GitHub sync (feat/folder-sync): the folder picker is the host's, on the host computer only, under
    home only; a folder can't be a system folder, home, the data dir or overlap another project; writes can't leave the
    folder (.., absolute, .git, a symlink); only leads change sync settings; other projects' sync and folders are 404;
    branch and repo values can't smuggle git options.
Usage: python app/test/security4_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import json, os, tempfile, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 5390 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"


def api(path, method="GET", body=None, token=None, project=None, raw=None, ctype="application/json"):
    h = {"Content-Type": ctype}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            b = r.read()
            try: return r.status, json.loads(b or b"{}")
            except Exception: return r.status, {"bytes": len(b)}
    except urllib.error.HTTPError as e:
        b = e.read()
        try: return e.code, json.loads(b or b"{}")
        except Exception: return e.code, {"raw": b[:200]}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


def zip_bytes():
    # the smallest valid ZIP: one stored empty file "a.txt"
    import io, zipfile
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z: z.writestr("a.txt", "proof")
    return b.getvalue()


def main():
    import subprocess, time
    tmp = tempfile.mkdtemp(prefix="tribe-sec4-", dir="/tmp")
    home = Path(tmp) / "home"; (home / "code" / "game").mkdir(parents=True)
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "HOME": str(home)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(Path(tmp) / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(Path(tmp) / "server.log", "a"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        hj = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        host, host_id = hj["token"], hj["member"]["id"]
        A = ok(api("/projects", "POST", {"name": "Game"}, token=host), "project A")["project"]
        B = ok(api("/projects", "POST", {"name": "Secret"}, token=host), "project B")["project"]
        pa, pb = A["id"], B["id"]
        inv = lambda **kw: ok(api("/invites", "POST", {"maxUses": 1, **kw}, token=host))["invite"]["code"]
        bob = ok(api("/join", "POST", {"code": inv(role="builder", project="tribe"), "name": "Bob"}))
        maya = ok(api("/join", "POST", {"code": inv(role="builder", project=pa), "name": "Maya"}))   # only sees project A
        cleo = ok(api("/join", "POST", {"code": inv(role="builder", project=pb), "name": "Cleo"}))   # only sees project B
        bt, mt, ct = bob["token"], maya["token"], cleo["token"]
        bob_board = "u-" + bob["member"]["id"]

        # ================= I: personal inspiration boards =================
        ok(api("/inspo/font?board=me", "POST", {"name": "Space Grotesk"}, token=bt), "Bob adds to his own board")
        own = ok(api("/inspo?board=me", token=bt), "Bob reads his board")
        assert any(i.get("title") == "Space Grotesk" for i in own["items"]), own
        item = own["items"][0]["id"]
        r = api(f"/inspo?project={bob_board}", token=mt)
        assert r[0] == 404 and not r[1].get("items"), f"Maya reads Bob's private board: {r}"
        r = api("/inspo/font", "POST", {"project": bob_board, "name": "Comic Sans"}, token=mt)
        assert r[0] == 404, f"Maya adds to Bob's board: {r}"
        r = api(f"/inspo/{item}?project={bob_board}", "DELETE", token=mt)
        assert r[0] == 404, f"Maya deletes from Bob's board: {r}"
        r = api(f"/inspo/{item}", "PATCH", {"project": bob_board, "colors": ["#000000"]}, token=mt)
        assert r[0] == 404, f"Maya edits Bob's board: {r}"
        assert len(ok(api("/inspo?board=me", token=bt))["items"]) == 1, "Bob's board is unchanged"
        ok(api("/inspo/font", "POST", {"project": pa, "name": "Inter"}, token=mt), "Maya still adds to her project's board")
        print("I ok: personal boards stay personal")

        # ================= T: ✦ file tags =================
        r = api(f"/ai/tags?project={pa}", "PUT", {"project": pb, "key": "notes.md", "description": "pwned", "tags": ["x"]}, token=mt)
        assert r[0] == 404, f"Maya writes project B's tags: {r}"
        assert "notes.md" not in ok(api(f"/ai/tags?project={pb}", token=host))["tags"], "B's tags untouched"
        ok(api(f"/ai/tags?project={pa}", "PUT", {"project": pa, "key": "notes.md", "description": "ok", "tags": ["a"]}, token=mt), "own project's tags")
        print("T ok: tags stay in their project")

        # ================= P: proof-of-work ZIPs =================
        z = zip_bytes()
        hs = ok(api("/flint/proof/save?name=secret-proof.zip", "POST", raw=z, token=host, project=pb, ctype="application/zip"), "host saves B's proof")
        assert hs["path"], "the host is told where it was saved"
        ok(api("/flint/proof/save?name=game-proof.zip", "POST", raw=z, token=mt, project=pa, ctype="application/zip"), "Maya saves her own proof")
        lst = ok(api("/flint/proof", token=mt, project=pa))
        names = [f["name"] for f in lst["files"]]
        assert "secret-proof.zip" not in names and "game-proof.zip" in names, f"Maya's list: {names}"
        assert not lst.get("dir"), "the host folder path isn't told to friends"
        r = api("/flint/proof/file?name=secret-proof.zip", token=mt, project=pa)
        assert r[0] == 404, f"Maya downloads project B's proof: {r[0]}"
        assert ok(api("/flint/proof/file?name=game-proof.zip", token=mt, project=pa))["bytes"] == len(z), "Maya downloads her own"
        r = api("/flint/proof/save?name=secret-proof.zip", "POST", raw=z, token=mt, project=pa, ctype="application/zip")
        assert r[0] == 409, f"Maya overwrites the host's ZIP: {r}"
        hl = [f["name"] for f in ok(api("/flint/proof", token=host))["files"]]
        assert {"secret-proof.zip", "game-proof.zip"} <= set(hl), f"the host sees every export: {hl}"
        assert ok(api("/flint/proof/file?name=game-proof.zip", token=host))["bytes"] == len(z), "the host downloads any"
        man = ok(api("/flint/proof/manifest", token=mt, project=pa))
        seen = {m["id"] for m in man["members"]}
        assert cleo["member"]["id"] not in seen and maya["member"]["id"] in seen, f"Maya's manifest names people she can't see: {seen}"
        assert all(p["id"] != pb for p in man["projects"]), "Maya's manifest lists project B"
        print("P ok: proof ZIPs are the saver's and the host's")

        # ================= B: the Blender bridge command =================
        bl = ok(api("/flint/blender", "POST", {"model": 'hero.glb"; $(touch /tmp/x) `id`; rm -rf ~', "name": "hero"}, token=bt, project=pa))
        tail = bl["run"].split(" -- --model ", 1)[1]
        for bad in ["$(", "`", ";", '"; ']:
            assert bad not in tail.strip('"'), f"shell syntax in the run command: {bl['run']}"
        assert 'hero.glb' in tail
        print("B ok: the Blender command is plain")

        # ================= F: the Agent fleet =================
        cag = ok(api("/agents", "POST", token=ct, project=pb), "Cleo's agent in B")["agent"]["id"]
        r = api(f"/agents/fleet/{cag}/task", "POST", {"title": "delete the repo"}, token=mt, project=pa)
        assert r[0] == 404, f"Maya gives a task to an agent outside her project: {r}"
        ok(api(f"/agents/fleet/{cag}/task", "POST", {"title": "polish the title screen"}, token=ct, project=pb), "Cleo tasks her own agent")
        print("F ok: fleet tasks stay in the project")

        # ================= C: an invited Claude (server/inviteclaude.js) =================
        ck = ok(api("/invite-claude", "POST", {}, token=mt, project=pa), "Maya invites her Claude")["token"]
        assert ck not in Path(tmp, "tribe", ".tribe", "members.json").read_text(), "only the key's hash is stored"
        assert api(f"/chat/general", token=ck, project=pb)[0] == 403, "her Claude can't read project B"
        assert api("/invites", "POST", {"maxUses": 1}, token=ck, project=pa)[0] == 403, "her Claude can't invite people"
        assert api("/invite-claude", "PUT", {"adminAsMe": True}, token=ck)[0] == 403, "her Claude can't change its own access"
        assert api("/agents", "POST", {}, token=ck, project=pa)[0] == 403, "her Claude can't mint keys"
        assert api("/perms/mute", "POST", {"member": bob["member"]["id"], "minutes": 5}, token=ck, project=pa)[0] == 403, "no admin"
        bm = "dm-" + "-".join(sorted([bob["member"]["id"], maya["member"]["id"]]))
        ok(api(f"/chat/{bm}", "POST", {"text": "just us"}, token=bt))
        assert api(f"/chat/{bm}", token=ck)[0] == 403, "her Claude can't read her DMs with Bob"
        ok(api("/invite-claude", "PUT", {"paused": True}, token=mt))
        assert api("/tasks", token=ck, project=pa)[0] == 401, "paused: refused at once"
        ok(api("/invite-claude", "DELETE", token=mt))
        assert api("/tasks", token=ck, project=pa)[0] == 401, "removed: refused"
        assert ck not in Path(tmp, "server.log").read_text(errors="ignore"), "the key isn't logged"
        print("C ok: an invited Claude has its person's access and never more")
        # ================= O: sign-in for the claude.ai connector (server/claudeauth.js) =================
        import base64, hashlib, re, secrets, urllib.parse
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        _plain = urllib.request.build_opener(_NoRedirect)
        def web(path, method="GET", body=None, form=None, token=None, headers=None):
            h = dict(headers or {}); data = None
            if form is not None: data = urllib.parse.urlencode(form).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
            elif body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
            if token: h["Authorization"] = "Bearer " + token
            try:
                with _plain.open(urllib.request.Request(BASE + path, method=method, data=data, headers=h), timeout=30) as r: raw, st, hd = r.read(), r.status, r.headers
            except urllib.error.HTTPError as e: raw, st, hd = e.read(), e.code, e.headers
            try: return st, json.loads(raw or b"{}"), hd
            except Exception: return st, raw.decode("utf8", "replace"), hd
        def pkce():
            v = secrets.token_urlsafe(48); return v, base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode()
        CB = "https://claude.ai/api/mcp/auth_callback"
        # discovery never repeats a Host header a stranger sent
        for path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"):
            st, d, _ = web(path, headers={"Host": "evil.example"}); assert st == 200 and "evil.example" not in json.dumps(d), d
        # registration: only https (or http on this computer), no fragments, credentials, look-alike hosts or other schemes
        for bad in (["http://evil.example/cb"], ["http://localhost@evil.example/cb"], ["http://127.0.0.1.evil.example/cb"], ["https://claude.ai/cb#x"], ["https://u:p@claude.ai/cb"], ["javascript:alert(1)"], ["data:text/html,x"], ["file:///etc/passwd"], ["//evil.example"], [CB] * 6, [CB, 7], [], None):
            st, d, _ = web("/connect/register", "POST", {"redirect_uris": bad}); assert st == 400 and d.get("error") == "invalid_redirect_uri", (bad, st, d)
        assert web("/connect/register", "POST", {"redirect_uris": [CB], "token_endpoint_auth_method": "client_secret_basic"})[0] == 400, "no confidential clients"
        assert web("/connect/register", "POST", {"redirect_uris": [CB], "grant_types": ["client_credentials"]})[0] == 400, "no other grants"
        st, reg, _ = web("/connect/register", "POST", {"redirect_uris": [CB], "client_name": "<img src=x onerror=alert(1)>\u0000Claude"}); assert st == 201 and "<" not in reg["client_name"] and ">" not in reg["client_name"], reg
        cid = reg["client_id"]
        def authz(**over):
            q = {"response_type": "code", "client_id": cid, "redirect_uri": CB, "state": "s1", "code_challenge": over.pop("ch", pkce()[1]), "code_challenge_method": "S256"}; q.update(over)
            return web("/connect/authorize?" + urllib.parse.urlencode({k: v for k, v in q.items() if v is not None}))
        # an address that wasn't registered is never redirected to (no open redirect), and the page escapes what it shows
        for r in ("https://evil.example/cb", CB + "/..", CB + "?next=https://evil.example", "https://claude.ai.evil.example/api/mcp/auth_callback", "http://localhost/api/mcp/auth_callback", ""):
            st, body, hd = authz(redirect_uri=r) if r else web("/connect/authorize?" + urllib.parse.urlencode({"response_type": "code", "client_id": "tcc_<script>alert(1)</script>"}))
            assert st == 400 and "Location" not in hd and "<script>" not in body, (r, st, hd.get("Location"))
        for over in ({"code_challenge": None}, {"code_challenge_method": "plain"}, {"ch": "short"}):
            st, _, hd = authz(**over); assert st == 302 and hd["Location"].startswith(CB + "?") and "error=invalid_request" in hd["Location"], (over, hd.get("Location"))
        st, _, hd = authz(resource="https://other.example/mcp"); assert "error=invalid_target" in hd["Location"], "a token is only for this tribe's MCP address"
        ver, ch = pkce(); st, _, hd = authz(ch=ch); assert st == 302 and hd["Location"].startswith("/claude-consent.html#rid="), hd.get("Location")
        rid = hd["Location"].split("rid=")[1]
        # only a signed-in person approves: nobody, a Claude, a spectator and a guest can't; nor someone guessing the rid
        ck2 = ok(api("/invite-claude", "POST", {}, token=mt, project=pa))["token"]
        assert api("/claude-auth", "POST", {"rid": rid})[0] == 401, "nobody"
        assert api("/claude-auth", "POST", {"rid": rid}, token=ck2)[0] == 403, "a Claude can't approve a sign-in (for itself or anyone)"
        assert api("/claude-auth?code=AAAAAA", token=ck2)[0] == 403
        assert api("/claude-auth", "POST", {"rid": "x" * 32}, token=mt)[0] == 404, "an unknown request"
        st, req, _ = web("/connect/request?rid=" + rid); assert st == 200 and not req.get("done") and "redirect" not in req, req
        assert web("/connect/request?rid=" + "y" * 32)[0] == 404
        # the token endpoint: no code, no token
        tok = lambda **f: web("/connect/token", "POST", form={"grant_type": "authorization_code", "client_id": cid, "redirect_uri": CB, **f})
        assert tok(code="nope", code_verifier=ver)[0] == 400 and tok(code=rid, code_verifier=ver)[0] == 400, "a request id is not a code"
        done = ok(api("/claude-auth", "POST", {"rid": rid}, token=mt), "Maya approves")
        code = urllib.parse.parse_qs(urllib.parse.urlparse(done["redirect"]).query)["code"][0]
        assert done["redirect"].startswith(CB + "?") and "s1" in done["redirect"]
        st, reg2, _ = web("/connect/register", "POST", {"redirect_uris": ["https://other.example/cb"]})
        assert tok(code=code, code_verifier=ver, client_id=reg2["client_id"])[0] == 400, "a code belongs to its client"
        assert tok(code=code)[0] == 400, "no verifier, no token (and the code is spent)"
        assert tok(code=code, code_verifier=ver)[0] == 400, "one try per code"
        ver, ch = pkce(); st, _, hd = authz(ch=ch); rid = hd["Location"].split("rid=")[1]
        code = urllib.parse.parse_qs(urllib.parse.urlparse(ok(api("/claude-auth", "POST", {"rid": rid}, token=mt))["redirect"]).query)["code"][0]
        st, t, hd = tok(code=code, code_verifier=ver); assert st == 200 and hd["Cache-Control"] == "no-store", t
        at, rt_ = t["access_token"], t["refresh_token"]
        # it is Maya's Claude and nothing more; tokens never work from a URL; a refresh token is not a key
        assert api("/tasks", token=at, project=pa)[0] == 200 and api("/chat/general", token=at, project=pb)[0] == 403, "Maya's projects only"
        assert api("/invites", "POST", {"maxUses": 1}, token=at, project=pa)[0] == 403 and api("/invite-claude", token=at)[0] == 403 and api("/claude-auth", "POST", {"rid": "x"}, token=at)[0] == 403
        assert api("/tasks?token=" + at, project=pa)[0] == 401 and api("/tasks", token=rt_, project=pa)[0] == 401
        assert web("/mcp?token=" + at, "POST", {"jsonrpc": "2.0", "id": 1, "method": "ping"})[0] == 401
        st, _, hd = web("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": "ping"}, token=at + "x"); assert st == 401 and "resource_metadata=" in hd["WWW-Authenticate"]
        # hashed at rest, not logged
        store = Path(tmp, "tribe", ".tribe", "claude-oauth.json").read_text()
        for secret in (at, rt_, code, ver): assert secret not in store and secret not in Path(tmp, "server.log").read_text(errors="ignore"), "a secret was written down"
        # someone else can't end or see her Claude's sign-in
        gid = ok(api("/invite-claude", token=mt))["claudes"][0]["connections"][0]["id"]
        assert api("/invite-claude/connections/" + gid, "DELETE", token=bt)[0] in (403, 404), "Bob can't sign her Claude out"
        assert api("/tasks", token=at, project=pa)[0] == 200
        # rotation and reuse
        ref = lambda r, c=cid: web("/connect/token", "POST", form={"grant_type": "refresh_token", "refresh_token": r, "client_id": c})
        assert ref(rt_, reg2["client_id"])[0] == 400, "another client can't refresh it"
        st, t2, _ = ref(rt_); assert st == 200 and api("/tasks", token=at, project=pa)[0] == 401 and api("/tasks", token=t2["access_token"], project=pa)[0] == 200
        assert ref(rt_)[0] == 400 and api("/tasks", token=t2["access_token"], project=pa)[0] == 401 and ref(t2["refresh_token"])[0] == 400, "a replayed refresh token ends the grant"
        # Pause and Remove reach the sign-in too
        ver, ch = pkce(); st, _, hd = authz(ch=ch); rid = hd["Location"].split("rid=")[1]
        code = urllib.parse.parse_qs(urllib.parse.urlparse(ok(api("/claude-auth", "POST", {"rid": rid}, token=mt))["redirect"]).query)["code"][0]
        at = tok(code=code, code_verifier=ver)[1]["access_token"]
        ok(api("/invite-claude", "PUT", {"paused": True}, token=mt)); assert api("/tasks", token=at, project=pa)[0] == 401, "paused"
        ok(api("/invite-claude", "PUT", {"paused": False}, token=mt)); assert api("/tasks", token=at, project=pa)[0] == 200
        ok(api("/invite-claude", "DELETE", token=mt)); assert api("/tasks", token=at, project=pa)[0] == 401 and api("/tasks", token=ck2, project=pa)[0] == 401, "removed"
        # rate limits
        got = [web("/connect/token", "POST", form={"grant_type": "refresh_token", "refresh_token": "x"})[0] for _ in range(45)]; assert 429 in got, got
        got = [web("/connect/register", "POST", {"redirect_uris": [CB]})[0] for _ in range(24)]; assert 429 in got, got
        print("O ok: the connector sign-in validates redirects, needs PKCE and a person, keeps hashes only, rotates, and ends with Pause/Remove")
        # ================= H: folder homes and sync =================
        def raw(path, method="GET", body=None, headers=None):
            req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **(headers or {})})
            try:
                with urllib.request.urlopen(req, timeout=30) as r: return r.status
            except urllib.error.HTTPError as e: return e.code
        assert raw("/folders/browse", headers={"Origin": "https://evil.example"}) == 403, "a web page elsewhere can't list your folders"
        assert raw("/folders/browse", headers={"Origin": "https://evil.example", "Authorization": "Bearer " + host}) == 403, "not even with the host's key"
        assert raw("/folders/browse", headers={"X-Forwarded-For": "8.8.8.8"}) == 403, "not through a proxy"
        assert api("/folders/browse", token=mt)[0] == 403, "a builder doesn't browse the host's disk"
        assert api("/folders/browse?path=/etc", token=host)[0] == 403, "browsing stays under home"
        assert api("/folders/browse?path=" + str(home) + "/../..", token=host)[0] == 400
        for bad in ["/", "/etc", str(home), str(home / ".ssh"), "~/code/../code/game", str(Path(tmp) / "tribe"), str(Path(tmp) / "tribe" / "docs"), str(ROOT)]:
            r = api(f"/projects/{pa}/folder", "PUT", {"path": bad}, token=host)
            assert r[0] == 400, f"folder {bad}: {r}"
        assert api(f"/projects/{pa}/folder", "PUT", {"path": "~/code/game"}, token=mt)[0] == 403, "only leads pick the folder"
        ok(api(f"/projects/{pa}/folder", "PUT", {"path": "~/code/game"}, token=host), "the host picks A's folder")
        r = api(f"/projects/{pb}/folder", "PUT", {"path": "~/code/game/sub", "create": True}, token=host); assert r[0] == 400 and "overlaps" in r[1]["error"], r
        r = api(f"/projects/{pb}/folder", "PUT", {"path": "~/code", "create": True}, token=host); assert r[0] == 400, r
        assert api(f"/projects/{pa}/folder", token=ct)[0] == 404 and api(f"/projects/{pa}/folder/file", "PUT", {"path": "x.txt", "content": "x"}, token=ct)[0] == 404, "Cleo can't see A"
        assert "path" not in ok(api(f"/projects/{pa}/folder", token=mt))["folder"], "the host path is only told to the host"
        os.symlink("/etc", home / "code" / "game" / "out")
        for bad in ["../escape.txt", "/etc/x", "out/x.txt", ".git/config", "a/../../b", "C:/x"]:
            r = api(f"/projects/{pa}/folder/file", "PUT", {"path": bad, "content": "x"}, token=mt)
            assert r[0] == 400, f"write {bad}: {r}"
        assert not (home / "code" / "escape.txt").exists()
        ok(api(f"/projects/{pa}/folder/file", "PUT", {"path": "src/ok.js", "content": "ok"}, token=mt), "a builder writes inside")
        assert (home / "code" / "game" / "src" / "ok.js").read_text() == "ok"
        assert api(f"/projects/{pa}/folder/file?path=out/passwd", token=mt)[0] == 400, "no reading through a link out"
        assert api(f"/projects/{pa}/sync", "PUT", {"repo": "camp/game"}, token=mt)[0] == 403, "only leads change sync"
        assert api(f"/projects/{pa}/sync", token=ct)[0] == 404 and api(f"/projects/{pa}/sync/ship", "POST", {}, token=ct)[0] == 404, "Cleo can't see A's sync"
        for body in [{"branch": "--upload-pack=touch /tmp/x"}, {"branch": "a..b"}, {"repo": "--help"}, {"repo": "evil/../x y"}, {"exclude": "x"} if False else {"mode": "yolo"}]:
            assert api(f"/projects/{pa}/sync", "PUT", body, token=host)[0] == 400, body
        assert api(f"/projects/{pa}/sync/undo", "POST", {}, token=mt)[0] == 403, "only leads undo"
        print("H ok: folders stay safe and sync is the leads'")
        print("security4: all passed")
    finally:
        srv.kill()


if __name__ == "__main__":
    main()
