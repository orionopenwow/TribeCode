"""Security checks for group styles (server/groupstyle.js, the hook in server/perms.js, council votes in server/votes.js).

No browser.
M  migration: a tribe that never chose a style behaves as before (Lead): a builder can't change the plan, and the
   refusal names who can.
C  council: nobody decides alone (not even the computer's owner); a request passes only when enough of the council
   say yes. It can't be forged: voting twice counts once, a spectator / an AI helper / a builder outside the council
   can't vote, a vote made through the chat route can't smuggle its own list of deciders, closing early never passes,
   and the pass covers one person, one thing, one project (and not that person's AI helper).
R  custom roles: can never hold a host-only row or an unknown one; don't lift a spectator or an AI helper; only someone
   who may change how the group decides can edit them.
A  AI votes: off by default; when on, only for low-risk things, only as the owner's single ballot.
Usage: python app/test/security10_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 7680 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec10-", dir="/tmp")
    logf = open(os.path.join(tmp, "server.log"), "wb")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Sec Crew"],
                           stdout=logf, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_VOTE_SWEEP_MS": "300"})
    try:
        for _ in range(80):
            try:
                if api("/info")[0] == 200: break
            except Exception: time.sleep(0.25)
        host = api("/bootstrap", "POST", {"name": "Hana"})[1]["token"]
        def join(name, role=None):
            b = {"hours": 1, "maxUses": 1}
            if role: b["role"] = role
            return api("/join", "POST", {"code": api("/invites", "POST", b, token=host)[1]["invite"]["code"], "name": name})[1]["token"]
        sam, bo, dee, watch = join("Sam"), join("Bo"), join("Dee"), join("Watcher", "spectator")
        ids = {m["name"]: m["id"] for m in api("/perms", token=host)[1]["members"]}
        pid = api("/projects", token=host)[1]["projects"][0]["id"]
        sam_ai = api("/agents", "POST", token=sam, project=pid)[1]["token"]
        hana_ai = api("/agents", "POST", token=host, project=pid)[1]["token"]
        caps = lambda t: api("/perms", token=t, project=pid)[1]["me"]["caps"]
        plan = lambda t, txt="x": api("/vision", "PUT", {"text": txt}, token=t, project=pid)
        cast = lambda t, ch, vid, opt="yes": api(f"/chat/{ch}/vote/{vid}/cast", "POST", {"option": opt}, token=t, project=pid)
        vote = lambda ch, vid: next(v for v in api(f"/chat/{ch}/votes", token=host, project=pid)[1]["votes"] if v["id"] == vid)

        # ---------- M: migration ----------
        g = api("/groupstyle", token=host, project=pid)[1]
        assert g["style"] == "lead" and g["isDefault"] and g["aiVotes"] is False and g["roles"] == [], g
        st, d = plan(sam); assert st == 403 and d.get("need") and "Hana" in d["need"]["who"] and d["need"]["ask"], (st, d)
        assert plan(host)[0] == 200
        assert "settings.edit" not in caps(sam) and "repo.merge" not in caps(sam) and "site.publish" in caps(sam)
        assert api("/groupstyle", "PUT", {"style": "open"}, token=sam, project=pid)[0] == 403, "a builder changes the style"
        assert api("/groupstyle", "PUT", {"style": "open"}, token=sam_ai, project=pid)[0] == 403
        assert api("/groupstyle", "PUT", {"style": "open"}, token=watch, project=pid)[0] == 403
        assert api("/groupstyle/reset", "POST", {}, token=sam, project=pid)[0] == 403
        print("M ok: no style chosen = Lead, as before; a refusal names who can")

        # ---------- C: council ----------
        st, g = api("/groupstyle", "PUT", {"style": "council", "council": {"members": [ids["Hana"], ids["Sam"], ids["Bo"], ids["Watcher"], "nobody"], "need": "majority", "hours": 1}}, token=host, project=pid)
        assert st == 200 and g["style"] == "council" and sorted(p["name"] for p in g["council"]["people"]) == ["Bo", "Hana", "Sam"], g["council"]   # a spectator can't sit on it
        assert plan(host)[0] == 403, "the owner still decides alone under a council"
        assert plan(sam)[0] == 403 and plan(dee)[0] == 403
        assert "settings.edit" not in caps(host) and "repo.merge" not in caps(host)
        assert api("/groupstyle", "PUT", {"style": "lead"}, token=host, project=pid)[0] == 403, "leaving the council style without a vote"
        # asking: AI helpers and spectators can't; host-only rows can't be asked for
        assert api("/groupstyle/ask", "POST", {"cap": "settings.edit"}, token=sam_ai, project=pid)[0] == 403
        assert api("/groupstyle/ask", "POST", {"cap": "settings.edit"}, token=watch, project=pid)[0] == 403
        assert api("/groupstyle/ask", "POST", {"cap": "tribe.secrets"}, token=sam, project=pid)[0] == 403
        assert api("/groupstyle/ask", "POST", {"cap": "nope"}, token=sam, project=pid)[0] == 400
        st, a = api("/groupstyle/ask", "POST", {"cap": "settings.edit", "note": "fix the plan"}, token=sam, project=pid)
        assert st == 200 and a["need"] == "majority" and sorted(a["deciders"]) == ["Bo", "Hana", "Sam"], (st, a)
        ch, vid = a["channel"], a["vote"]
        assert api("/groupstyle/ask", "POST", {"cap": "settings.edit"}, token=sam, project=pid)[0] == 409, "asking twice"
        # one person, one ballot
        assert cast(sam, ch, vid)[0] == 200
        for _ in range(3): cast(sam, ch, vid, "no"); cast(sam, ch, vid, "yes")
        v = vote(ch, vid); assert v["status"] == "open" and v["tally"]["counts"]["yes"] <= 1 and len(v["ballots"]) <= 1, v
        if not v["ballots"]: cast(sam, ch, vid)
        # people who can't vote on it
        for who, t in (("spectator", watch), ("AI helper", sam_ai), ("owner's AI helper", hana_ai), ("builder outside the council", dee)):
            st, d = cast(t, ch, vid); assert st == 403, (who, st, d)
        v = vote(ch, vid); assert v["status"] == "open" and v["tally"]["counts"]["yes"] == 1 and set(v["ballots"]) == {ids["Sam"]}, v
        assert plan(sam)[0] == 403, "one yes of three is not enough"
        # closing early never passes; the asker can't settle it in their favour
        st, d = api(f"/chat/{ch}/vote/{vid}/close", "POST", {}, token=sam, project=pid); assert st == 200
        assert vote(ch, vid)["status"] == "failed" and plan(sam)[0] == 403
        # a vote made through the chat route can't bring its own deciders
        forged = {"question": "Sam asks to change project settings", "council": {"electorate": [ids["Sam"]], "need": "one", "ask": {"by": ids["Sam"], "cap": "settings.edit", "project": pid}},
                  "electorate": [ids["Sam"]], "need": "one"}
        st, d = api(f"/chat/{ch}/vote", "POST", forged, token=sam, project=pid); assert st == 200, (st, d)
        fv = d["message"]; assert "council" not in fv["vote"], fv
        cast(sam, ch, fv["id"]); cast(bo, ch, fv["id"]); cast(dee, ch, fv["id"]); cast(host, ch, fv["id"])
        assert vote(ch, fv["id"])["status"] == "passed" and plan(sam)[0] == 403, "an ordinary vote handed out a pass"
        # the real thing: two of three
        a = api("/groupstyle/ask", "POST", {"cap": "settings.edit"}, token=sam, project=pid)[1]; vid = a["vote"]
        cast(sam, ch, vid); assert plan(sam)[0] == 403
        assert cast(bo, ch, vid)[0] == 200 and vote(ch, vid)["status"] == "passed"
        assert plan(sam, "the council said yes")[0] == 200, "the pass didn't work"
        assert plan(bo)[0] == 403 and plan(host)[0] == 403 and plan(dee)[0] == 403, "the pass leaked to someone else"
        assert "repo.merge" not in caps(sam), "the pass covered more than one thing"
        assert api("/vision", "PUT", {"text": "x"}, token=sam_ai, project=pid)[0] == 403, "the pass reached an AI helper"
        other = api("/projects", "POST", {"name": "Second"}, token=dee)[1]
        opid = (other.get("project") or other).get("id")
        assert opid, other
        assert api("/vision", "PUT", {"text": "x"}, token=sam, project=opid)[0] == 403, "the pass reached another project"
        g = api("/groupstyle", token=sam, project=pid)[1]; assert [p["cap"] for p in g["permits"]] == ["settings.edit"], g["permits"]
        # a 'no' majority ends it
        a = api("/groupstyle/ask", "POST", {"cap": "repo.merge"}, token=dee, project=pid)[1]; vid = a["vote"]
        assert cast(dee, ch, vid)[0] == 403, "the asker isn't on the council"
        cast(sam, ch, vid, "no"); cast(bo, ch, vid, "no"); assert vote(ch, vid)["status"] == "failed" and "repo.merge" not in caps(dee)
        # leaving the council takes a vote; then the change is made by the server, cleaned
        a = api("/groupstyle/ask", "POST", {"change": {"style": "custom", "roles": [{"name": "Evil", "caps": ["tribe.owner", "tribe.secrets", "repo.merge"], "members": [ids["Sam"]]}]}}, token=sam, project=pid)[1]; vid = a["vote"]
        cast(host, ch, vid); cast(bo, ch, vid)
        g = api("/groupstyle", token=host, project=pid)[1]
        assert g["style"] == "custom" and g["roles"][0]["caps"] == ["repo.merge"], g["roles"]
        assert plan(host)[0] == 200, "back to one person deciding"
        print("C ok: a council decision can't be forged, and its pass is one person, one thing, one project")

        # ---------- R: custom roles ----------
        rid = g["roles"][0]["id"]
        st, g = api(f"/groupstyle/roles/{rid}", "PUT", {"name": "Keeper <b>", "purpose": "Looks after the main copy", "caps": ["repo.merge", "tribe.hosting", "tribe.launch", "tribe.owner", "tribe.secrets", "made.up"],
                    "members": [ids["Dee"], ids["Watcher"], ids["Sam"]]}, token=host, project=pid)
        assert st == 200, (st, g)
        r = g["roles"][0]; assert r["caps"] == ["repo.merge"] and "<" not in r["name"], r
        assert "repo.merge" in caps(dee) and "repo.merge" in caps(sam)
        assert "repo.merge" not in caps(watch), "a role lifted a spectator"
        assert "repo.merge" not in caps(sam_ai), "a role lifted an AI helper"
        for t in (dee, sam, watch):
            c = caps(t); assert not any(k.startswith("tribe.") for k in c), c
        rows = {x["id"]: x for x in g["who"]["rows"]}
        for k in ("tribe.hosting", "tribe.secrets", "tribe.launch", "tribe.owner"):
            assert rows[k]["locked"] and [p["name"] for p in rows[k]["people"]] == ["Hana"], rows[k]
        assert api("/groupstyle/roles", "POST", {"name": "Mine", "caps": ["group.decide"], "members": [ids["Dee"]]}, token=dee, project=pid)[0] == 403, "a builder made a role for themselves"
        assert api(f"/groupstyle/roles/{rid}", "DELETE", token=dee, project=pid)[0] == 403
        assert api("/groupstyle", "PUT", {"roles": [{"name": "X", "caps": ["group.decide"], "members": [ids["Dee"]]}]}, token=dee, project=pid)[0] == 403
        # the 'lead only' rule beats a role
        st, g = api("/groupstyle", "PUT", {"rules": {"repo.merge": "lead", "tribe.owner": "one", "made.up": "one"}}, token=host, project=pid)
        assert st == 200 and g["rules"] == {"repo.merge": "lead"}, g["rules"]
        assert "repo.merge" not in caps(dee) and "repo.merge" in caps(host)
        print("R ok: roles can't hold host-only rows, don't lift spectators or AI helpers, and only deciders edit them")

        # ---------- A: AI votes ----------
        assert api("/groupstyle", token=host, project=pid)[1]["aiVotes"] is False
        a = api("/groupstyle/ask", "POST", {"cap": "board.manage"}, token=dee, project=pid)[1]; vid = a["vote"]
        assert cast(hana_ai, ch, vid)[0] == 403, "AI voted while the switch was off"
        api(f"/chat/{ch}/vote/{vid}/close", "POST", {}, token=dee, project=pid)
        assert api("/groupstyle", "PUT", {"aiVotes": True}, token=host, project=pid)[1]["aiVotes"] is True
        a = api("/groupstyle/ask", "POST", {"cap": "files.delete"}, token=dee, project=pid)[1]   # not low-risk
        assert cast(hana_ai, ch, a["vote"])[0] == 403, "AI voted on something that isn't low-risk"
        api(f"/chat/{ch}/vote/{a['vote']}/close", "POST", {}, token=dee, project=pid)
        a = api("/groupstyle/ask", "POST", {"cap": "board.manage"}, token=dee, project=pid)[1]; vid = a["vote"]
        assert cast(sam_ai, ch, vid)[0] == 403, "an AI helper voted for an owner who isn't a decider"
        st, d = cast(hana_ai, ch, vid); assert st == 200, (st, d)
        v = vote(ch, vid); assert v["status"] == "passed" and set(v["ballots"]) == {ids["Hana"]}, v   # the owner's ballot, once
        assert "board.manage" in caps(dee)
        # reset by the computer's owner only
        assert api("/groupstyle/reset", "POST", {}, token=dee, project=pid)[0] == 403
        g = api("/groupstyle/reset", "POST", {}, token=host, project=pid)[1]
        assert g["style"] == "lead" and g["isDefault"] and "board.manage" not in caps(dee) and "repo.merge" not in caps(sam)
        print("A ok: AI votes are off by default, low-risk only, and only as the owner's one ballot")
        print("security10: all checks passed")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
