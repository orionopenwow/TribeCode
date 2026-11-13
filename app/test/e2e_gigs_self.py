"""Gigs for yourself + an abilities profile (feat/company-gigs: app/ui/abilities.js, server/talent.js kind 'offer').
Maya lists her abilities (skills with levels, roles, tools, hours, rate "for fun", GitHub, bio) and posts a gig for
herself; Camp finds her with Work › Find people (skill + hours) and with Flint ("find someone who can draw"), opens her
profile page and requests the gig; Maya accepts and it becomes a task assigned to her through the board's accept flow;
once done it shows as finished work on her profile. Only Maya edits her gig; a lead can hide it as spam. MCP read
tools find people by skill. Flint opens the composer for "post a gig for me: …". With no tribe, abilities and a gig
are kept on the device and sync when the person joins. Screenshots: docs/screenshots/abilities.png, gig-self.png.
Usage: TRIBE_PORT_OFFSET=3000 python3 app/test/e2e_gigs_self.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5660 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, name, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}
    r = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(r, timeout=30) as x: res = json.loads(x.read())["result"]
    return res["content"][0]["text"], bool(res.get("isError"))

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-gigs-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Lantern Run"}, token=host)); pid = (p.get("project") or p)["id"]
        def join(name):
            inv = ok(api("/invites", "POST", {}, token=host))["invite"]; j = ok(api("/join", "POST", {"code": inv["code"], "name": name}))
            return j["token"], j["member"]["id"]
        maya, maya_id = join("Maya"); jo, jo_id = join("Jo")
        for t in (maya, jo): api(f"/projects/{pid}/join", "POST", {}, token=t)
        ag = ok(api("/agents", "POST", {}, token=host, project=pid)); ag_t = ag["token"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(name, token=None, w=1280, h=900):
                c = b.new_context(viewport={"width": w, "height": h})
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}{srv_}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeAbilities && window.TribeTalent", timeout=20000)
                if token: pg.wait_for_function("TribeClient.connected()", timeout=45000)
                return pg

            # ---- 1. Maya lists her abilities ----
            mp = page("Maya", maya)
            mp.evaluate("TribeTalent.open('gigs')"); mp.wait_for_selector("#view-work #ab-mount #ab-edit", timeout=15000)
            mp.click("#ab-edit"); mp.wait_for_selector("#ab-sheet #ab-pf")
            for sk in ["drawing", "pixel art", "javascript"]:
                mp.fill("#ab-sk-in", sk); mp.click("#ab-sk-add")
            mp.click("#ab-sks li[data-skill='drawing'] [data-v='3']")
            mp.click("#ab-sks li[data-skill='javascript'] [data-v='1']")
            mp.click("#ab-roles [data-role=design]")
            mp.fill("#ab-tools", "Aseprite, Figma"); mp.fill("#ab-hours", "12"); mp.fill("#ab-tz", "Europe/Lisbon")
            mp.click("#ab-rate [data-v=fun]"); mp.fill("#ab-gh", "https://github.com/maya"); mp.fill("#ab-pf-url", "https://maya.example.com")
            mp.fill("#ab-bio", "I draw small, cozy game art and the odd landing page.")
            mp.wait_for_timeout(200); mp.screenshot(path=str(SHOTS / "abilities.png"))
            mp.click("#ab-save"); mp.wait_for_selector("#ab-sheet", state="detached")
            prof = ok(api("/talent/profile", token=maya))["profile"]
            assert prof["skills"] == ["drawing", "pixel art", "javascript"] and prof["levels"] == {"drawing": 3, "pixel art": 2, "javascript": 1}, prof
            assert prof["roles"] == ["design"] and prof["tools"] == ["aseprite", "figma"] and prof["hours"] == 12 and prof["rate"]["type"] == "fun" and prof["open"], prof
            assert {l["label"] for l in prof["links"]} == {"GitHub", "Portfolio"} and prof["bio"].startswith("I draw"), prof
            assert api(f"/talent/profile", "PUT", {"skills": ["spam"]}, token=ag_t)[0] == 403, "agents have no work profile"

            # ---- 2. Maya posts a gig for herself ----
            mp.evaluate("TribeTalent.open('offers')"); mp.wait_for_selector("#ab-post"); mp.click("#ab-post"); mp.wait_for_selector("#ab-sheet #ab-gf")
            mp.fill("#ab-g-title", "I'll draw your game's sprites"); mp.fill("#ab-g-desc", "Small pixel characters with a walk cycle.")
            mp.fill("#ab-g-deliver", "4 characters, 8 frames each, PNG + Aseprite files"); mp.fill("#ab-g-time", "This weekend")
            mp.fill("#ab-g-tags", "pixel art, drawing"); mp.click("#ab-g-pay [data-v=fun]")
            mp.click(f"#ab-g-places [data-place='{pid}']"); mp.click("#ab-g-go"); mp.wait_for_selector("#ab-sheet", state="detached")
            mp.wait_for_selector("#ab-mygigs .ab-offer", timeout=10000)
            gig = [g for g in ok(api("/talent/gigs", token=maya))["gigs"] if g["kind"] == "offer"][0]
            assert gig["title"] == "I'll draw your game's sprites" and gig["places"] == [pid] and gig["deliver"].startswith("4 characters") and gig["timeline"] == "This weekend" and gig["pay"]["type"] == "fun", gig
            gid = gig["id"]
            # only Maya edits her gig; a lead can hide it as spam
            assert api(f"/talent/gigs/{gid}", "PATCH", {"title": "hijacked"}, token=host)[0] == 403, "the host can't edit someone's own gig"
            assert api(f"/talent/gigs/{gid}/hide", "POST", {"hidden": True}, token=jo)[0] == 403, "builders can't hide"
            ok(api(f"/talent/gigs/{gid}/hide", "POST", {"hidden": True}, token=host), "lead hides")
            assert not [g for g in ok(api("/talent/gigs", token=jo))["gigs"] if g["id"] == gid], "hidden from others"
            assert [g for g in ok(api("/talent/gigs", token=maya))["gigs"] if g["id"] == gid], "the poster still sees it"
            ok(api(f"/talent/gigs/{gid}/hide", "POST", {"hidden": False}, token=host), "lead unhides")

            # ---- 3. MCP: agents find people by skill ----
            t, e = mcp(ag_t, "talent_find", {"skills": ["drawing"], "minHours": 10}); assert not e and "Maya" in t, t
            t, e = mcp(ag_t, "gigs_offered", {"skills": ["pixel art"]}); assert not e and "draw your game" in t, t
            t, e = mcp(ag_t, "talent_profile", {"member": "maya"}); assert not e and "drawing (expert)" in t and "draw your game" in t, t

            # ---- 4. Camp finds her (Find people, skill + hours), opens her profile, requests the gig ----
            cp = page("Camp", host)
            cp.evaluate("TribeTalent.open('people')"); cp.wait_for_selector("#tl-find-skill", timeout=10000)
            cp.fill("#tl-find-skill", "draw"); cp.wait_for_timeout(600)
            cp.wait_for_selector(f"#view-work .tl-person[data-person='{maya_id}']", timeout=8000)
            cp.select_option("#tl-find-hours", "20"); cp.wait_for_timeout(300)
            assert cp.locator(f"#view-work .tl-person[data-person='{maya_id}']").count() == 0, "20+ h/week filters her out"
            cp.select_option("#tl-find-hours", "10"); cp.wait_for_selector(f"#view-work .tl-person[data-person='{maya_id}']")
            cp.click(f"#view-work .tl-person[data-person='{maya_id}'] button[data-ab-person]")
            cp.wait_for_selector("#ab-page .ab-skl", timeout=10000)
            txt = cp.inner_text("#ab-page")
            assert "drawing" in txt and "Expert" in txt and "draw your game" in txt and "12 h/week" in txt and "For fun" in txt, txt
            cp.click(f"#ab-page [data-request='{gid}']"); cp.wait_for_selector("#ab-sheet #ab-rf")
            cp.fill("#ab-r-note", "Our hero and three slimes, please!"); cp.click("#ab-r-go"); cp.wait_for_selector("#ab-rf", state="detached")
            g = [x for x in ok(api("/talent/gigs", token=maya))["gigs"] if x["id"] == gid][0]
            assert len(g["requests"]) == 1 and g["requests"][0]["status"] == "requested" and g["requests"][0]["member"], g
            assert api(f"/talent/gigs/{gid}/request", "POST", {}, token=host)[0] == 409, "one open request each"
            assert api(f"/talent/gigs/{gid}/request", "POST", {}, token=maya)[0] == 400, "not your own"
            # the gigs list shows the offer with Request for others
            cp.evaluate("TribeTalent.open('gigs')"); cp.wait_for_selector(f"#view-work .ab-offer[data-offer='{gid}']", timeout=10000)
            assert "Requested" in cp.inner_text(f"#view-work .ab-offer[data-offer='{gid}']")
            jp = page("Jo", jo); jp.evaluate("TribeTalent.open('gigs')"); jp.wait_for_selector(f"#view-work .ab-offer[data-offer='{gid}'] [data-request]", timeout=10000)

            # ---- 5. Maya accepts: a task assigned to her, accepted through the board's flow ----
            mp.evaluate("TribeTalent.open('offers')")
            mp.wait_for_selector(f"#ab-mygigs [data-accept^='{gid}|']", timeout=10000)
            mp.evaluate("document.querySelector('#ab-mygigs .ab-offer').scrollIntoView({block: 'center'})"); mp.wait_for_timeout(300)
            mp.screenshot(path=str(SHOTS / "gig-self.png"))
            rid = g["requests"][0]["id"]
            assert api(f"/talent/gigs/{gid}/requests/{rid}/accept", "POST", {}, token=host)[0] == 403, "only the poster accepts"
            mp.click(f"#ab-mygigs [data-accept='{gid}|{rid}']")
            mp.wait_for_function("document.querySelector('#ab-mygigs') && document.querySelector('#ab-mygigs').innerText.includes('Accepted')", timeout=20000)
            g = [x for x in ok(api("/talent/gigs", token=maya))["gigs"] if x["id"] == gid][0]
            r = g["requests"][0]; assert r["status"] == "accepted" and r["task"] and r["taskProject"] == pid, r
            tasks = ok(api("/tasks", token=maya, project=pid))["tasks"]; task = [x for x in tasks if x["id"] == r["task"]][0]
            assert task["assignee"] == maya_id and task["accept"] == "accepted" and task["status"] == "doing" and task["title"].startswith("I'll draw your game's sprites"), task
            inbox = [i for i in ok(api("/notify/inbox", token=host))["items"] if i.get("type") == "task-accepted"]
            assert inbox, "the requester hears it was accepted (the accept flow's own notification)"

            # ---- 6. finished work shows on her profile ----
            ok(api(f"/tasks/{task['id']}", "PATCH", {"status": "done"}, token=maya, project=pid))
            pp = ok(api(f"/talent/profile/{maya_id}", token=host))
            assert any(d["title"] == task["title"] for d in pp["done"]), pp["done"]
            cp.evaluate(f"TribeAbilities.profile('{maya_id}')"); cp.wait_for_selector("#ab-page .ab-done", timeout=10000)
            assert "draw your game" in cp.inner_text("#ab-page .ab-done")
            cp.evaluate("TribeAbilities.close()")

            # ---- 7. profile from a chat avatar (the popout links to the work profile) and per-tribe visibility ----
            cp.evaluate(f"TribeProfiles.open('{maya_id}')"); cp.wait_for_selector("#pf-pop [data-pop=work]", timeout=10000)
            cp.click("#pf-pop [data-pop=work]"); cp.wait_for_selector(f"#ab-page[data-id='{maya_id}']", timeout=10000); cp.evaluate("TribeAbilities.close()")
            p2 = ok(api("/projects", "POST", {"name": "Side quest"}, token=host)); pid2 = (p2.get("project") or p2)["id"]
            ok(api("/talent/profile", "PUT", {"visibleIn": [pid]}, token=maya))
            assert ok(api("/talent/profile", token=maya))["profile"]["visibleIn"] == [pid]

            # ---- 8. Flint: "post a gig for me: …" and "find someone who can draw" ----
            cp.evaluate("TribeFlint.ask(\"post a gig for me: I'll mix your game's music\")")
            cp.wait_for_selector("#ab-sheet #ab-g-title", timeout=10000)
            assert cp.input_value("#ab-g-title") == "I'll mix your game's music", cp.input_value("#ab-g-title")
            cp.evaluate("TribeAbilities.close()")
            cp.evaluate("TribeFlint.ask('find someone who can draw')")
            cp.wait_for_function("document.querySelector('#tl-find-skill') && document.querySelector('#tl-find-skill').value === 'draw'", timeout=10000)
            cp.wait_for_selector(f"#view-work .tl-person[data-person='{maya_id}']", timeout=8000)

            # ---- 9. Home with no tribe: abilities + a gig on this device, synced when joining ----
            c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            c.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}}))")
            op = c.new_page(); op.on("pageerror", lambda e: errors.append(f"orion: {e}"))
            op.goto(BASE + "/?skipIntro=1&freshopen=1", wait_until="domcontentloaded", timeout=90000); op.wait_for_function("window.TribeAbilities && window.TribeTalent", timeout=20000)
            assert not op.evaluate("TribeClient.connected()"), "no tribe yet"
            op.evaluate("TribeTalent.open()"); op.wait_for_selector("#tl-empty", timeout=10000); op.wait_for_selector("#ab-mount #ab-edit", timeout=10000)
            op.click("#ab-edit"); op.wait_for_selector("#ab-sheet.phone #ab-pf")
            op.fill("#ab-sk-in", "copywriting"); op.click("#ab-sk-add"); op.fill("#ab-hours", "6"); op.click("#ab-save"); op.wait_for_selector("#ab-sheet", state="detached")
            op.click("#wk-tabs [data-tab=offers]"); op.click("#ab-post"); op.wait_for_selector("#ab-sheet #ab-gf"); op.fill("#ab-g-title", "I'll write your landing page copy"); op.click("#ab-g-go"); op.wait_for_selector("#ab-sheet", state="detached")
            op.wait_for_selector("#ab-local .ab-offer", timeout=8000)
            sw = op.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"phone overflow {sw}"
            L = op.evaluate("TribeAbilities.local()"); assert L["profile"]["skills"] == ["copywriting"] and len(L["gigs"]) == 1, L
            otok, oid = join("Orion")
            op.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('tribecode.settings.v1')); s.server = {{url: '{BASE}', token: '{otok}'}}; localStorage.setItem('tribecode.settings.v1', JSON.stringify(s)); }})()")
            op.reload(wait_until="domcontentloaded"); op.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            for _ in range(40):
                gs = [g for g in ok(api("/talent/gigs", token=otok))["gigs"] if g["by"] == oid]
                if gs: break
                time.sleep(0.25)
            assert gs and gs[0]["title"] == "I'll write your landing page copy" and gs[0]["kind"] == "offer", gs
            assert ok(api("/talent/profile", token=otok))["profile"]["skills"] == ["copywriting"]
            b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_gigs_self: ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
