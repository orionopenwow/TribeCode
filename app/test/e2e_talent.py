"""Company mode, the work side (v0.27, server/talent.js + app/ui/talent.js): work profiles (skills, seats, hours, rate
type, time zone, portfolio, open to work), gigs (post, apply, hire a member -> the seat in company.json, hire someone
from outside -> a one-use project invite, their seat when they join), the time bank (both people confirm before it
counts), compute offers (a request becomes a DM and an approval for the person who offered; nothing runs on its own),
the opt-in public board (community repository mocked through TRIBE_WORKSHOP_CDN), the MCP tools, Filters, and the
Work view on desktop and a phone. Usage: python app/test/e2e_talent.py
"""
import json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6120 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("TALENT_SHOTS", "/tmp/claude-0/-home-claude/b43b5d32-29af-5d3d-9a1e-d65b58a7dc31/scratchpad/agents"))

PUBLIC = {"updated": "2026-11-01", "gigs": [
    {"id": "lantern-abc123", "title": "Pixel artist for a cozy farming game", "kind": "task", "description": "Ten crop sprites, 16x16.", "skills": ["pixel art"], "hours": 6,
     "pay": {"type": "paid", "text": "$150"}, "contact": "https://example.org/contact", "tribe": "Lantern", "posted": "2026-10-30"},
    {"id": "bad id!", "title": "rejected: bad id"},
    {"id": "otter-q1", "title": "Growth lead for a tiny SaaS", "kind": "seat", "seatKind": "growth", "pay": {"type": "time"}, "contact": "@otter on Discord", "posted": "2026-10-28"}]}

class Cdn(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.endswith("/gigs/index.json"):
            b = json.dumps(PUBLIC).encode(); self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b); return
        self.send_response(404); self.end_headers()

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, tool, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]

def join(host, name, role="builder", project=None):
    body = {"role": role, **({"project": project} if project else {})}
    inv = ok(api("/invites", "POST", body, token=host), "invite")["invite"]
    j = ok(api("/join", "POST", {"code": inv["code"], "name": name}), "join")
    return j["token"], j["member"]["id"]

def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="tribe-talent-", dir="/tmp"))
    cdn = ThreadingHTTPServer(("127.0.0.1", 0), Cdn); threading.Thread(target=cdn.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_WORKSHOP_CDN": f"http://127.0.0.1:{cdn.server_address[1]}/gh"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        boot = ok(api("/bootstrap", "POST", {"name": "Camp"})); host = boot["token"]; host_id = boot["member"]["id"]
        p = ok(api("/projects", "POST", {"name": "Firefly Studio", "bio": "A tiny game studio"}, token=host)); pid = (p.get("project") or p)["id"]
        co_file = tmp / "tribe" / "projects" / pid / "company.json"; co_file.parent.mkdir(parents=True, exist_ok=True)
        co_file.write_text(json.dumps({"on": True, "name": "Firefly Studio", "template": "game-studio", "seats": [
            {"id": "ceo", "kind": "ceo", "title": "CEO", "color": "#F26B1D", "holder": {"person": host_id, "agent": None}, "charter": {}, "status": "on-track"},
            {"id": "growth", "kind": "growth", "title": "Grow", "color": "#FABD2F", "holder": {"person": None, "agent": None}, "charter": {"goal": "100 players"}, "status": "idle"}],
            "goals": [], "rhythms": {}, "created": "2026-11-09T00:00:00Z"}))
        maya, maya_id = join(host, "Maya")
        spec, _ = join(host, "Watcher", role="spectator")

        # ---- work profile ----
        assert api("/talent/profile", "PUT", {"tz": "Mars/Olympus"}, token=maya)[0] == 400, "bad time zone refused"
        prof = ok(api("/talent/profile", "PUT", {"open": True, "skills": "Copywriting, social, Pixel Art", "roles": ["growth", "nope"], "hours": 10, "rate": {"type": "time", "text": "hour for hour"},
                                                "tz": "Europe/Berlin", "links": [{"url": "https://example.org/maya"}, {"url": "javascript:alert(1)"}], "projects": [pid]}, token=maya))["profile"]
        assert prof["open"] and prof["skills"] == ["copywriting", "social", "pixel art"] and prof["roles"] == ["growth"] and prof["hours"] == 10, prof
        assert prof["rate"]["type"] == "time" and prof["tz"] == "Europe/Berlin" and len(prof["links"]) == 1, prof
        ppl = ok(api("/talent/people?seat=growth&skills=social", token=host))["people"]
        assert [x["id"] for x in ppl] == [maya_id] and ppl[0]["projects"][0]["name"] == "Firefly Studio", ppl
        assert ok(api("/talent/people?seat=legal", token=host))["people"] == []

        # ---- gigs: post (spectators can't), apply, hire a member -> the seat ----
        assert api("/talent/gigs", "POST", {"title": "x"}, token=spec)[0] == 403
        assert api("/talent/gigs", "POST", {"title": "Seat without project", "kind": "seat"}, token=host)[0] == 400
        g = ok(api("/talent/gigs", "POST", {"title": "Run our launch posts", "kind": "seat", "project": pid, "seat": "growth", "description": "Grow to 100 players.",
                                           "skills": ["social", "writing"], "hours": 5, "pay": {"type": "time", "text": "1 h for 1 h"}}, token=host))["gig"]
        gid = g["id"]; assert g["status"] == "open" and g["seatKind"] == "growth" and g["color"] == "#FABD2F", g
        ok(api("/talent/gigs", "POST", {"title": "Bug bash bounty", "kind": "bounty", "skills": ["testing"], "hours": 2, "pay": {"type": "paid", "text": "$50"}}, token=host))
        a = ok(api(f"/talent/gigs/{gid}/apply", "POST", {"note": "I run a dev blog"}, token=maya))["gig"]
        assert a["applied"] and a["applicantCount"] == 1, a
        assert api(f"/talent/gigs/{gid}/apply", "POST", {}, token=maya)[0] == 409, "no double apply"
        hv = [x for x in ok(api("/talent/gigs", token=host))["gigs"] if x["id"] == gid][0]
        assert hv["canManage"] and hv["applicants"][0]["name"] == "Maya", hv
        assert api(f"/talent/gigs/{gid}/hire", "POST", {"applicant": hv["applicants"][0]["id"]}, token=maya)[0] == 403, "only the poster hires"
        r = ok(api(f"/talent/gigs/{gid}/hire", "POST", {"applicant": hv["applicants"][0]["id"]}, token=host))
        assert r["seat"]["id"] == "growth" and r["gig"]["status"] == "filled", r
        co = json.loads(co_file.read_text()); assert [s for s in co["seats"] if s["id"] == "growth"][0]["holder"]["person"] == maya_id, co
        dm = tmp / "tribe" / "chat" / ("dm-" + "-".join(sorted([host_id, maya_id])) + ".jsonl")
        assert dm.exists() and "You're in" in dm.read_text(), dm

        # ---- hire someone from outside: a one-use project invite; their seat when they join ----
        g2 = ok(api("/talent/gigs", "POST", {"title": "Design lead", "kind": "seat", "project": pid, "seatKind": "design", "pay": {"type": "paid", "text": "$30/h"}}, token=host))["gig"]
        assert api(f"/talent/gigs/{g2['id']}/apply", "POST", {"name": "Rin", "contact": "rin@example.org"}, token=maya)[0] == 403, "only the poster adds outsiders"
        e2 = ok(api(f"/talent/gigs/{g2['id']}/apply", "POST", {"name": "Rin", "contact": "rin@example.org", "note": "met at a jam"}, token=host))["gig"]
        r2 = ok(api(f"/talent/gigs/{g2['id']}/hire", "POST", {"applicant": e2["applicants"][0]["id"]}, token=host))
        assert r2["invite"]["code"] and r2["invite"]["code"] in r2["invite"]["link"], r2
        j = ok(api("/join", "POST", {"code": r2["invite"]["code"], "name": "Rin"})); rin_id = j["member"]["id"]
        co = json.loads(co_file.read_text()); ds = [s for s in co["seats"] if s["kind"] == "design"]
        assert ds and ds[0]["holder"]["person"] == rin_id and ds[0]["color"] == "#E86A92", co
        g2v = [x for x in ok(api("/talent/gigs", token=host))["gigs"] if x["id"] == g2["id"]][0]
        assert g2v["status"] == "filled" and g2v["applicants"][0]["status"] == "hired", g2v
        assert api("/join", "POST", {"code": r2["invite"]["code"], "name": "Twice"})[0] != 200, "one use"

        # ---- time bank: both people confirm ----
        t = ok(api("/talent/timebank", "POST", {"from": maya_id, "to": host_id, "hours": 2, "note": "wrote the launch thread"}, token=maya))["entry"]
        assert t["status"] == "proposed" and t["ok"]["from"] and not t["ok"]["to"], t
        assert ok(api("/talent/timebank", token=maya))["balance"]["net"] == 0, "not counted before both confirm"
        assert api(f"/talent/timebank/{t['id']}/confirm", "POST", {}, token=maya)[0] == 200   # her side again: still waiting
        assert api("/talent/timebank", "POST", {"from": host_id, "to": rin_id, "hours": 1}, token=maya)[0] == 403, "only your own hours"
        c = ok(api(f"/talent/timebank/{t['id']}/confirm", "POST", {}, token=host))["entry"]; assert c["status"] == "confirmed", c
        assert ok(api("/talent/timebank", token=maya))["balance"] == {"given": 2, "received": 0, "net": 2}
        assert ok(api("/talent/timebank", token=host))["balance"]["received"] == 2
        t2 = ok(api("/talent/timebank", "POST", {"from": host_id, "to": maya_id, "hours": 0.5}, token=host))["entry"]   # left waiting for Maya (the UI shows Confirm)

        # ---- compute: offer, request -> DM + approval to the offerer; usage counted ----
        off = ok(api("/talent/compute/offers", "PUT", {"what": "claude-code", "hoursPerWeek": 3, "rules": "Evenings, small tasks"}, token=host))["offer"]
        cv = ok(api("/talent/compute", token=maya)); o = [x for x in cv["offers"] if x["id"] == off["id"]][0]
        assert o["askPolicy"] == "ask" and "own" in cv["note"], cv
        assert api("/talent/compute/request", "POST", {"offer": off["id"], "hours": 1}, token=host)[0] == 400, "not your own offer"
        rq = ok(api("/talent/compute/request", "POST", {"offer": off["id"], "hours": 1, "note": "tests for the save system"}, token=maya))["request"]
        aps = [x for x in ok(api("/approvals", token=host))["approvals"] if x["id"] == rq["approval"]]
        assert aps and aps[0]["to"] == [host_id] and aps[0]["kind"] == "compute-request", aps
        assert "borrow 1 h" in dm.read_text(), "the request is a DM too"
        assert api(f"/talent/compute/requests/{rq['id']}/used", "POST", {"hours": 1}, token=host)[0] == 409, "approve first"
        ok(api(f"/approvals/{rq['approval']}/approve", "POST", {"note": "sure"}, token=host))
        assert [x for x in ok(api("/talent/compute", token=maya))["requests"] if x["id"] == rq["id"]][0]["status"] == "approved"
        u = ok(api(f"/talent/compute/requests/{rq['id']}/used", "POST", {"hours": 1}, token=host))["request"]; assert u["status"] == "done" and u["used"] == 1, u
        assert [x for x in ok(api("/talent/compute", token=host))["offers"] if x["id"] == off["id"]][0]["usedThisWeek"] == 1

        # ---- public board: opt-in share needs a contact; community gigs are read and validated ----
        g3 = ok(api("/talent/gigs", "POST", {"title": "Music for our trailer", "kind": "task", "pay": {"type": "free"}}, token=host))["gig"]
        assert api(f"/talent/gigs/{g3['id']}/share", "POST", {}, token=host)[0] == 400, "no contact, no share"
        sh = ok(api(f"/talent/gigs/{g3['id']}/share", "POST", {"contact": "@camp on Discord"}, token=host))
        assert sh["bundle"]["contact"] == "@camp on Discord" and sh["path"].startswith("gigs/") and "github.com" in sh["links"]["file"], sh
        assert "Camp" not in json.dumps({k: v for k, v in sh["bundle"].items() if k != "tribe"}), "nothing personal added"
        pub = ok(api("/talent/public?refresh=1", token=maya))
        assert pub["available"] and [x["id"] for x in pub["gigs"]] == ["lantern-abc123", "otter-q1"], pub

        # ---- MCP: an agent finds people, drafts a gig (approval), proposes hours ----
        agent = ok(api("/agents", "POST", {}, token=maya))["token"]
        e, txt = mcp(agent, "talent_find", {"seatKind": "growth"}); assert not e and "Maya" in txt, txt
        e, txt = mcp(agent, "gig_post", {"title": "Write the press kit", "kind": "task", "pay": {"type": "time"}}); assert not e and "waits for your owner" in txt, txt
        assert not [x for x in ok(api("/talent/gigs", token=j["token"]))["gigs"] if x["title"] == "Write the press kit"], "drafts stay hidden from others"
        assert [x for x in ok(api("/talent/gigs", token=maya))["gigs"] if x["title"] == "Write the press kit"][0]["status"] == "draft", "the owner sees the draft"
        e, txt = mcp(agent, "timebank_log", {"from": maya_id, "to": rin_id, "hours": 1}); assert not e and "both of them confirm" in txt, txt
        tb = ok(api("/talent/timebank", token=maya)); assert tb["entries"][0]["ok"] == {"from": False, "to": False}, tb["entries"][0]

        # ---- the app: Work on desktop (gigs hero, filters, time bank), then a phone ----
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}"
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(init % ("Maya", BASE, maya))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeTalent", timeout=20000)
            pg.evaluate("TribeShell.go('work')"); pg.wait_for_selector("#view-work .tl-gig.hero", timeout=15000)
            assert pg.locator("#view-work .tl-gig").count() >= 2
            pg.click("#tl-filters"); pg.wait_for_selector("#tl-fpop")
            pg.select_option("#tl-f-seat", "design"); pg.wait_for_timeout(200)
            assert pg.locator("#view-work .tl-gig.hero").count() == 0 and "No open gigs" in pg.inner_text("#view-work"), "filtered out"
            pg.click("[data-fclear]"); pg.wait_for_selector("#view-work .tl-gig.hero")
            assert "Filters" in pg.inner_text("#tl-filters") and pg.locator(".tl-fn").count() == 0
            pg.screenshot(path=str(SHOTS / "talent-gigs-desktop.png"))
            # apply from the app: the bounty
            pg.click("#view-work [data-apply]"); pg.wait_for_selector("#tl-af"); pg.fill("#tl-a-note", "I love breaking things"); pg.click("#tl-a-go")
            pg.wait_for_selector("#view-work .tl-ok", timeout=8000)
            # time bank: confirm the half hour Camp logged
            pg.click("[data-tab=bank]"); pg.wait_for_selector(f"[data-tx-ok='{t2['id']}']"); pg.click(f"[data-tx-ok='{t2['id']}']")
            pg.wait_for_function("!document.querySelector(\"[data-tx-ok='%s']\")" % t2["id"], timeout=8000)
            assert "1.5" in pg.inner_text(".tl-bal-n"), pg.inner_text(".tl-bal-n")
            pg.screenshot(path=str(SHOTS / "talent-bank-desktop.png"))
            # people + compute + public tabs render
            pg.click("[data-tab=people]"); pg.wait_for_selector(f"[data-person='{maya_id}']")
            pg.click("[data-tab=compute]"); pg.wait_for_selector("[data-off-ask]"); pg.screenshot(path=str(SHOTS / "talent-compute-desktop.png"))
            pg.click("[data-tab=public]"); pg.wait_for_function("document.querySelector('#tl-body').innerText.includes('Pixel artist')", timeout=10000)
            # post a gig from the sheet, and the profile editor's Work section opens the work profile
            pg.click("#tl-post"); pg.wait_for_selector("#tl-pf"); pg.fill("#tl-p-title", "Trailer voice-over"); pg.click("#tl-p-go")
            pg.wait_for_function("document.querySelector('#view-work') && document.querySelector('#view-work').innerText.includes('Trailer voice-over')", timeout=8000)
            pg.evaluate("TribeProfiles.edit()"); pg.wait_for_selector("#pf-work", timeout=8000)
            pg.click("#pf-work"); pg.wait_for_selector("#tl-wf"); assert pg.is_checked("#tl-w-open") and pg.locator("#tl-w-roles .on").count() == 1
            pg.click("#tl-w-roles [data-role=design]"); pg.click("#tl-w-save"); pg.wait_for_selector("#tl-wf", state="detached")
            assert sorted(ok(api("/talent/profile", token=maya))["profile"]["roles"]) == ["design", "growth"]
            pg.close()
            # phone
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(init % ("Camp", BASE, host))
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeTalent", timeout=20000)
            ph.evaluate("TribeTalent.open('gigs')"); ph.wait_for_selector("#view-work .tl-gig.hero", timeout=15000)
            assert ph.evaluate("document.documentElement.scrollWidth") <= 392, "no sideways scroll on a phone"
            ph.screenshot(path=str(SHOTS / "talent-gigs-phone.png"))
            ph.click("#view-work [data-open]"); ph.wait_for_selector("#tl-sheet.phone"); ph.screenshot(path=str(SHOTS / "talent-sheet-phone.png"))
            b.close()
        assert not errors, errors
        print("e2e_talent: OK")
    finally:
        srv.terminate(); cdn.shutdown()
        if os.environ.get("KEEP"): print("log:", tmp / "log")

if __name__ == "__main__":
    main()
