"""Security regression test 4: the post-v0.29.0 review (docs/REVIEW-2026-11-11.md).

I   inspiration board: a member's personal board (u-<member id>) is theirs alone. Another member can't read it, add to
    it or delete from it by passing ?project=u-<id> or { project: 'u-<id>' }.
T   ✦ file tags: PUT /api/ai/tags can't write the tags of a project the member can't see.
P   Flint's proof-of-work ZIPs hold a project's code: only the member who saved one and the host/admins list or download
    it; a friend can't overwrite someone else's ZIP by saving under the same name; the manifest only names the people
    this member can already see; the host folder path is only told to the host.
B   the Blender bridge's copy-paste command carries no shell syntax ($( ), backticks, ;) from the model name.
F   the Agent fleet: a friend can't give a task to an agent outside their project.
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
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost"}
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
        print("security4: all passed")
    finally:
        srv.kill()


if __name__ == "__main__":
    main()
