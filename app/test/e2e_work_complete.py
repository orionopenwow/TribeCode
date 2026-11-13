"""Work, the whole loop (feat/work-company: server/talent.js loop routes, app/ui/workloop.js, app/ui/workcore.js).
  1. No tribe: Work's empty state has next steps (start, join, home), a 3-step plan and the templates library.
  2. In a tribe, Basic mode (no AI): "Suggested next" reads tasks and agents: "You have 3 untaken tasks in Design, so
     post a Designer role" and "Claude could take these 2" (Hand them over -> the agent is the tasks' assignee).
  3. Post role (prefilled, linked to the tasks) -> Match ranks Jay first -> Assign (tasks go to Jay) -> Jay posts
     progress and hands in -> the suggestion says review -> Approve with stars (tasks done) -> Credit 3 h (time bank,
     Jay confirms) -> credited. Agents can hold non-seat gigs; outsiders can't act on it.
Usage: python app/test/e2e_work_complete.py   (writes docs/screenshots/work-loop.png)"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6230 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-work-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(name, token=None):
                c = b.new_context(viewport={"width": 1440, "height": 900})
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}{srv_}}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{name} console: {m.text[:200]}"))
                return pg

            # ---------- 1. no tribe: empty state with next steps + templates ----------
            fresh = page("Orion"); fresh.goto(BASE + "/?skipIntro=1&freshopen=1"); fresh.wait_for_function("window.TribeTalent && window.TribeTemplates", timeout=15000)
            fresh.evaluate("TribeTalent.open()"); fresh.wait_for_selector("#tl-empty #tl-e-start", state="visible", timeout=10000)
            for sel in ["#tl-e-join", "#tl-e-home", "#tl-e-steps", "#dt-lib .dt-card[data-tpl='standup']", "#pm-foot"]: fresh.wait_for_selector(sel, state="visible")
            assert "Post a need" in fresh.inner_text("#tl-e-steps")
            fresh.context.close()

            # ---------- the tribe ----------
            boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok, oid = boot["token"], boot["member"]["id"]
            inv = ok(api("/invites", "POST", {"maxUses": 3}, token=tok))["invite"]
            jay = ok(api("/join", "POST", {"code": inv["code"], "name": "Jay"})); jtok, jid = jay["token"], jay["member"]["id"]
            ok(api("/talent/profile", "PUT", {"open": True, "skills": ["design", "figma", "pixel art"], "roles": ["design"], "hours": 10}, token=jtok), "profile")
            pid = (lambda p: (p.get("project") or p)["id"])(ok(api("/projects", "POST", {"name": "Pixel Quest"}, token=tok)))
            ag = ok(api("/agents", "POST", {}, token=tok, project=pid)); ag_id = ag["agent"]["id"]
            design = ["Design the title screen logo", "Pick the color palette for level 1", "Draw the player sprite"]
            agenty = ["Write tests for the save system", "Update the README docs"]
            tids = {t: ok(api("/tasks", "POST", {"title": t}, token=tok, project=pid))["task"]["id"] for t in design + agenty}
            tasks = lambda: {t["id"]: t for t in ok(api("/tasks", token=tok, project=pid))["tasks"]}

            # ---------- 2. suggestions (Basic · no AI) ----------
            pg = page("Orion", tok); pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeTalent", timeout=15000)
            pg.evaluate("TribeTalent.open('gigs')"); pg.wait_for_selector("#wl-suggest [data-sug='post-design']", timeout=15000)
            txt = pg.inner_text("#wl-suggest"); assert "You have 3 untaken tasks in Design, so post a Designer role" in txt, txt
            assert "Claude could take these 2" in txt and "Basic · no AI" in txt, txt
            pg.click("#wl-suggest [data-sug='agent'] [data-sug-do]")
            pg.wait_for_function("!document.querySelector(\"#wl-suggest [data-sug='agent']\")", timeout=15000)
            ts = tasks(); assert all(ts[tids[t]].get("assignee") == ag_id for t in agenty), [ts[tids[t]] for t in agenty]

            # ---------- 3. post role -> match -> assign ----------
            pg.click("#wl-suggest [data-sug='post-design'] [data-sug-do]"); pg.wait_for_selector("#tl-sheet #tl-p-title")
            assert pg.input_value("#tl-p-title") == "Designer for 3 Design tasks", pg.input_value("#tl-p-title")
            pg.click("#tl-p-go"); pg.wait_for_selector("#tl-sheet", state="detached")
            gig = next(g for g in ok(api("/talent/gigs", token=tok))["gigs"] if g["title"] == "Designer for 3 Design tasks"); gid = gig["id"]
            assert sorted(gig["tasks"]) == sorted(tids[t] for t in design) and gig["stage"] == "open", gig
            pg.wait_for_selector(f"[data-gig='{gid}'] [data-open]", timeout=10000); pg.click(f"[data-gig='{gid}'] [data-open]")
            pg.wait_for_selector(f"#wl-matches [data-match='{jid}']", timeout=10000)
            first = pg.locator("#wl-matches .wl-m").first; assert first.get_attribute("data-match") == jid and "Best match" in first.inner_text(), first.inner_text()
            assert pg.locator(f"#wl-matches [data-match='{ag_id}']").count() == 1, "agents are candidates too"
            assert api(f"/talent/gigs/{gid}/assign", "POST", {"member": jid}, token=jtok)[0] == 403, "only the poster assigns"
            pg.click(f"#wl-matches [data-assign='{jid}']"); pg.wait_for_selector("#wl-loop[data-stage='assigned']", timeout=10000)
            ts = tasks(); assert all(ts[tids[t]].get("assignee") == jid for t in design), "the linked tasks went to Jay"
            pg.keyboard.press("Escape")

            # ---------- track: Jay posts progress, hands in ----------
            assert api(f"/talent/gigs/{gid}/review", "POST", {"verdict": "approve"}, token=tok)[0] == 409, "nothing to review yet"
            ok(api(f"/talent/gigs/{gid}/progress", "POST", {"text": "Logo drafted, palette picked", "pct": 60}, token=jtok), "progress")
            g = next(x for x in ok(api("/talent/gigs", token=jtok))["gigs"] if x["id"] == gid); assert g["stage"] == "working" and g["mine"] and g["pct"] == 60, g
            ok(api(f"/talent/gigs/{gid}/submit", "POST", {"note": "All three done, have a look"}, token=jtok), "submit")
            assert all(tasks()[tids[t]]["status"] == "review" for t in design)

            # ---------- review from the suggestion ----------
            pg.wait_for_selector(f"#wl-suggest [data-sug='review-{gid}']", timeout=15000)
            assert "Jay handed in" in pg.inner_text(f"#wl-suggest [data-sug='review-{gid}']")
            pg.wait_for_selector(f"[data-gig='{gid}'] .wl-track li.now[data-step='review']")
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "work-loop.png"))
            pg.click(f"#wl-suggest [data-sug='review-{gid}'] [data-sug-do]"); pg.wait_for_selector("#wl-rev")
            pg.click("#wl-rev [data-star='5']"); pg.fill("#wl-rev-n", "Lovely palette"); pg.click("#wl-approve")
            pg.wait_for_selector("#wl-credit", timeout=10000)
            assert all(tasks()[tids[t]]["status"] == "done" for t in design), "approved -> tasks done"

            # ---------- credit ----------
            pg.fill("#wl-cr-h", "3"); pg.click("#wl-cr-go"); pg.wait_for_selector("#wl-loop[data-stage='credited']", timeout=10000)
            g = next(x for x in ok(api("/talent/gigs", token=tok))["gigs"] if x["id"] == gid)
            assert g["stage"] == "credited" and g["review"]["rating"] == 5 and g["credit"]["hours"] == 3, g
            bank = ok(api("/talent/timebank", token=jtok)); e = next(x for x in bank["entries"] if x.get("task") == gid)
            assert e["status"] == "proposed" and e["from"] == jid and e["to"] == oid, e
            ok(api(f"/talent/timebank/{e['id']}/confirm", "POST", {}, token=jtok)); assert ok(api("/talent/timebank", token=jtok))["balance"]["given"] == 3
            assert api(f"/talent/gigs/{gid}/credit", "POST", {"hours": 1}, token=tok)[0] == 409, "credit once"

            # an agent can take a task gig; seats go to people
            g2 = ok(api("/talent/gigs", "POST", {"title": "Write the changelog", "kind": "task"}, token=tok))["gig"]
            ok(api(f"/talent/gigs/{g2['id']}/assign", "POST", {"member": ag_id}, token=tok), "assign agent")
            g2v = next(x for x in ok(api("/talent/gigs", token=tok))["gigs"] if x["id"] == g2["id"]); assert g2v["filledAgent"] and g2v["mine"], g2v
            pg.keyboard.press("Escape")
            b.close()
        assert not errors, errors
        print("e2e_work_complete: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
