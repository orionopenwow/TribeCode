"""An AI agent adds a settings screen and dark mode to a phone app design from the master guide alone (feat/ai-guides:
docs/ai/APP.md, server/aiguides.js, the app_* MCP tools). The agent is a scripted MCP client.
 1 the tools point to the guide; app_catalog lists parts, kits and looks from the app's own data; answers are small;
 2 with no app design, app_propose can start one from a template (a proposal a person approves);
 3 the job, with "Change the app" taken from builders: a dry run sends nothing; a bad step comes back with the reason
   and a corrected example; the proposal adds Settings from the kit and turns the app dark; later steps (rewriting
   the kit's example words, with ids from the first answer) join the same request; the check on the proposal is
   clean; the request goes to Camp, nothing is saved until Camp approves, and one Undo brings the earlier app back;
 4 without Website and designs switched on for the agent, the app tools are refused; another project is refused;
 5 a motion graphic: the guide names the tools, a template starts one, and it reads back.
Usage: TRIBE_PORT_OFFSET=3000 python3 app/test/e2e_ai_agent_app.py
"""
import json, os, re, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from aiagent_helper import Tribe, guide_ops

PORT = 6480 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))


def wait(fn, what, secs=12):
    end = time.time() + secs
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)


def screens(answer):
    """{screen id: [(part id, type)]} from the "Screens now" lines of an app_propose answer."""
    out = {}
    for line in answer.split("Screens now")[1].splitlines()[1:]:
        m = re.match(r"\s+([\w-]+): [^:]+: (.*)$", line)
        if m: out[m.group(1)] = [tuple(x.split(" ")[:2]) for x in m.group(2).split(" · ")]
    return out


def main():
    t = Tribe(PORT, prefix="tribe-aiapp-")
    try:
        host = t.ok(t.api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = t.ok(t.api("/projects", "POST", {"name": "Bean and Gone"}, token=host))["project"]["id"]
        other = t.ok(t.api("/projects", "POST", {"name": "Night Market"}, token=host))["project"]["id"]
        t.ok(t.api("/vision", "PUT", {"text": "# Bean and Gone\n\nOrder coffee ahead from the roaster on Mill Street and skip the queue.\n"}, token=host, project=pid))
        t.ok(t.api(f"/projects/{pid}/brand", "PUT", {"kit": {"name": "Bean and Gone", "colors": {"accent": "#B4532C"}, "voice": "Warm, short sentences."}}, token=host))
        maya, maya_id = t.join(host, "Maya", project=pid)
        ag = t.agent(maya)

        # ---------- 1: the tools and the guide ----------
        tools = ag.tools()
        for n in ("app_catalog", "app_read", "app_view", "app_check", "app_propose"): assert n in tools, n
        assert 'get_guide("app")' in tools["app_propose"]["description"] and "dry_run" in tools["app_propose"]["inputSchema"]["properties"] and "get_guide" in tools["app_read"]["description"]
        guide = ag.good("get_guide", {"name": "app"}); ops_ok = set(guide_ops(guide))
        for n in ("project_brief", "app_catalog", "app_read", "app_view", "app_propose", "app_check"): assert f"`{n}`" in guide, n
        assert "settings" in guide and '"mode": "dark"' in guide and len(guide) < 32000
        cat = json.loads(ag.good("app_catalog")); assert "settings" in [k["id"] for k in cat["kits"]] and "toggles" in [p["type"] for p in cat["parts"]] and len(cat["steps"]) == len(ops_ok) and len(json.dumps(cat)) < 30000, len(json.dumps(cat))
        tp = json.loads(ag.good("app_catalog", {"part": "templates", "limit": 6}))["templates"]; assert len(tp["items"]) == 6 and tp["total"] > 6 and tp["next_offset"] == 6, tp
        brief = ag.good("project_brief"); assert "skip the queue" in brief and "#B4532C" in brief and "Phone app:** none yet" in brief, brief

        # ---------- 2: no app yet: start one from a template ----------
        out = ag.bad("app_read"); assert "start" in out and "app_propose" in out, out
        out = ag.bad("app_propose", {"ops": [{"op": "tabbar"}]}); assert "start" in out, out
        out = ag.bad("app_propose", {"start": {"template": "nope"}, "ops": []}); assert "Some that exist" in out, out
        tid = tp["items"][0]["id"]
        st = ag.good("app_propose", {"start": {"template": tid}, "ops": [{"op": "rename", "name": "Bean and Gone Go"}], "note": "A first app to start from."})
        assert st.startswith("Proposed 2 changes") and "(Maya)" in st and f"Starts an app from the {tid} template" in st, st
        assert t.ok(t.api(f"/projects/{pid}/app-config", token=maya))["config"] is None
        rq = [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=maya))["requests"] if r["status"] == "open"]; assert len(rq) == 1 and rq[0]["tool"] == "app", rq
        t.ok(t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=maya))
        base = wait(lambda: t.ok(t.api(f"/projects/{pid}/app-config", token=maya))["config"], "the app design is saved")
        assert base["name"] == "Bean and Gone Go" and len(base["screens"]) >= 2 and base["theme"]["mode"] == "light", (base["name"], base["theme"])
        assert not any(s["id"] == "settings" for s in base["screens"]), "the fixture has no settings screen yet"
        folder = t.tmp / "tribe" / "projects" / pid
        wait(lambda: (folder / "app-web" / "app-design.json").exists(), "the app is files in the project folder")
        agents = wait(lambda: (folder / "AGENTS.md").exists() and "app-web/app-design.json" in (folder / "AGENTS.md").read_text() and (folder / "AGENTS.md").read_text(), "AGENTS.md says where the app is")
        assert "app_propose" in agents and (folder / ".tribe" / "ai" / "APP.md").read_text() == guide

        # ---------- 3: the job: a settings screen and dark mode, with Camp's OK ----------
        t.ok(t.api("/perms/overrides", "PUT", {"cap": "app.edit", "role": "builder", "on": False}, token=host), "take app.edit from builders")
        summ = json.loads(ag.good("app_read", {"detail": "summary"})); full = ag.good("app_read")
        assert len(json.dumps(summ)) < len(full) / 2 and summ["mode"] == "light" and summ["screens"][0]["parts"], summ
        one = json.loads(ag.good("app_read", {"screen": summ["screens"][0]["id"]})); assert len(one["screens"]) == 1 and "steps" not in one
        view = ag.good("app_view"); assert "Opens on:" in view and "== Screen: " in view and "NOTHING LEADS HERE" not in view, view[:600]
        job = [{"op": "kit", "kit": "settings"}, {"op": "theme", "set": {"mode": "dark"}}]
        assert {o["op"] for o in job} <= ops_ok
        dry = ag.good("app_propose", {"ops": job, "dry_run": True})
        assert dry.startswith("Dry run: nothing was sent") and "Added Settings screen" in dry and "mode dark" in dry and "settings: Settings" in dry and "The check on the result" in dry, dry
        assert not [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=host))["requests"] if r["status"] == "open"], "a dry run sends nothing"
        bad = ag.good("app_propose", {"dry_run": True, "ops": [{"op": "kit", "kit": "preferences"}, {"op": "block.add", "screen": "nowhere", "type": "toggles"}, {"op": "screen.remove", "screen": "x"}, {"op": "link", "block": "zzz", "to": "settings"}, {"op": "theme", "mode": "dark"}, {"op": "preset", "id": "ember"}]})
        assert 'no kit "preferences"' in bad and 'Try: {"op":"kit","kit":"settings"}' in bad and 'no screen "nowhere"' in bad and "Screens (id: name)" in bad and '"screen.remove" is not a step' in bad and 'no part has the id "zzz"' in bad and 'the look goes in "set"' in bad and 'Try: {"op":"theme","set"' in bad, bad
        out = ag.bad("app_propose", {"ops": [{"op": "export"}]}); assert "nothing was proposed" in out and "Steps are" in out, out
        sent = ag.good("app_propose", {"ops": job, "note": "Adds a Settings screen from the kit and switches the app to dark mode."})
        assert sent.startswith("Proposed 2 changes") and "(Camp)" in sent, sent
        sc = screens(sent); assert "settings" in sc and [x for x in sc["settings"] if x[1] == "settings"], sc
        prop = json.loads(ag.good("app_read", {"proposed": True, "screen": "settings"}))["screens"][0]
        rows = [b for b in prop["blocks"] if b["type"] == "settings"]; acct = next(b for b in rows if any("example.com" in str(i.get("value", "")) for i in b["props"]["items"]))
        ei = next(i for i, x in enumerate(acct["props"]["items"]) if "example.com" in str(x.get("value", "")))
        more = [{"op": "text", "block": acct["id"], "path": f"items.{ei}.value", "value": "maya@beanandgone.example"}, {"op": "text", "block": prop["blocks"][0]["id"], "path": "title", "value": "Your settings"}]
        out = ag.good("app_propose", {"ops": more}); assert "added to your waiting proposal" in out and "(now 4 in all)" in out and "Skipped" not in out, out
        rq = [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=host))["requests"] if r["status"] == "open"]
        assert len(rq) == 1 and rq[0]["to"] == ["Camp"] and rq[0]["byName"] == "Maya" and rq[0]["agentName"] and len(rq[0]["summary"]) == 4 and "dark mode" in rq[0]["why"], rq
        pv = ag.good("app_view", {"proposed": True, "screen": "settings"}); assert "dark mode" in ag.good("app_view", {"proposed": True}).splitlines()[0] and "# Your settings" in pv and "maya@beanandgone.example" in pv and "Dark mode [switch off]" in pv and "NOTHING LEADS HERE" not in pv, pv
        chk = json.loads(ag.good("app_check", {"proposed": True})); assert not [i for i in chk["items"] if "nothing opens" in i["title"] or "Settings" in i["title"]], chk
        assert t.ok(t.api(f"/projects/{pid}/app-config", token=host))["config"] == base, "nothing is saved until a person approves"
        assert t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=maya)[0] in (400, 403, 404) and t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=ag.key)[0] in (400, 401, 403, 404)
        t.ok(t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=host), "Camp approves")
        after = wait(lambda: (lambda c: c if c["theme"]["mode"] == "dark" else None)(t.ok(t.api(f"/projects/{pid}/app-config", token=host))["config"]), "dark mode is applied")
        sset = next(s for s in after["screens"] if s["id"] == "settings"); assert sset["blocks"][0]["props"]["title"] == "Your settings" and "maya@beanandgone.example" in json.dumps(sset)
        reach = set(l["to"] for s in after["screens"] for b in s["blocks"] for l in b.get("links", {}).values()); assert "settings" in reach, "Settings can be reached"
        t.ok(t.api(f"/projects/{pid}/changes/{rq[0]['id']}/undo", "POST", {}, token=host), "one Undo")
        back = t.ok(t.api(f"/projects/{pid}/app-config", token=host))["config"]; assert back["theme"]["mode"] == "light" and not any(s["id"] == "settings" for s in back["screens"]), "Undo brings the earlier app back"
        assert ag.biggest[1] < 32000 and len(full) < 16000, (ag.biggest, len(full))

        # ---------- 4: refusals ----------
        for name, args in (("app_read", {}), ("app_view", {}), ("app_check", {}), ("app_propose", {"ops": [{"op": "tabbar"}]})):
            out = ag.bad(name, args, project=other); assert "No project" in out, (name, out)
        t.ok(t.api("/invite-agent", "PUT", {"kind": "claude", "scopes": ["chat", "tasks"]}, token=maya))
        for name, args in (("app_read", {}), ("app_view", {}), ("app_check", {}), ("app_catalog", {}), ("app_propose", {"ops": [{"op": "theme", "set": {"mode": "dark"}}]}), ("motion_write", {"key": "x", "doc": {"template": "ui-reel"}})):
            out = ag.bad(name, args); assert "turned off Website" in out, (name, out)
        assert not [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=host))["requests"] if r["status"] == "open"]
        t.ok(t.api("/invite-agent", "PUT", {"kind": "claude", "scopes": ["chat", "docs", "tasks", "files", "website", "approvals"]}, token=maya))

        # ---------- 5: a motion graphic from the guide ----------
        mg = ag.good("get_guide", {"name": "motion"})
        for n in ("motion_list", "motion_read", "motion_write", "project_brief"): assert f"`{n}`" in mg, n
        ml = json.loads(ag.good("motion_list")); tpl = ml["templates"][0]; tpl = tpl if isinstance(tpl, str) else tpl["id"]; assert f"`{tpl}`" in mg, tpl
        ag.good("motion_write", {"key": "opening-reel", "doc": {"template": tpl, "name": "Opening reel", "accent": "#B4532C"}})
        got = ag.good("motion_read", {"key": "opening-reel"}); assert "Opening reel" in got or "sent as a change request" in got.lower() or "No motion graphic" in got, got[:300]
        print("e2e_ai_agent_app: OK (the guide and catalogue; an app started from a template as a proposal; Settings from the kit and dark mode with a dry run, useful errors, one request to Camp, a clean check and one Undo; refused without access or in another project; a motion graphic from a template)")
    except Exception:
        print(t.log()); raise
    finally:
        t.stop()


if __name__ == "__main__":
    main()
