"""An AI agent builds and restyles a website from the master guide alone (feat/ai-guides: docs/ai/WEBSITE.md,
server/aiguides.js, the site_* MCP tools). The agent is a scripted MCP client: what it knows comes from the tools.
 1 the tools teach the workflow: site_* descriptions point to the guides, get_guide("website") returns the guide, and
   the guides and the brief are MCP resources and prompts;
 2 the project brief has the vision, the brand kit, a fact from the project's memory and who approves, and nothing
   from a project the agent's person cannot see; that project is refused by every tool;
 3 job one, a café site from an empty project: a dry run sends nothing; a bad step comes back with the reason and a
   corrected example; the proposal starts the site, later steps join the same request; Check on the proposal has
   nothing left to fix; nothing is saved until the person approves; then the site is real files in the folder;
 4 job two, restyle and fix the phone layout, with "Change the website" taken from builders: the request goes to Camp
   (not to the agent's own person), Camp approves, and one Undo brings the earlier site back;
 5 answers fit a model's context (the biggest is the guide itself);
 6 with Website switched off for the agent, the site and app tools are refused; the guide and the brief still answer;
 7 "Make it beautiful" (a design request) reaches the agent with the project brief on top;
 8 the project folder: AGENTS.md with a marked block (rewritten when the project changes, words outside it kept),
   CLAUDE.md pointing to it, the guides and the brief in .tribe/ai/; a hand-written AGENTS.md is never touched;
   the bridge's brief and guide essentials come from the same source and follow who can see the project.
Usage: TRIBE_PORT_OFFSET=3000 python3 app/test/e2e_ai_agent_site.py
"""
import json, os, re, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from aiagent_helper import Tribe, guide_ops, guide_recipe

PORT = 6470 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SECRET = "ZEBRA-7741"


def wait(fn, what, secs=12):
    end = time.time() + secs
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)


def ids(answer):
    """{type: id} from the "Sections now" lines of a site_propose answer."""
    return {m.group(2): m.group(1) for m in re.finditer(r"(b[a-z0-9]+) ([a-z]+)/[a-z]+", answer.split("Sections now")[1])}


def main():
    t = Tribe(PORT)
    try:
        host = t.ok(t.api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = t.ok(t.api("/projects", "POST", {"name": "Bean and Gone"}, token=host))["project"]["id"]
        other = t.ok(t.api("/projects", "POST", {"name": "Night Market"}, token=host))["project"]["id"]
        t.ok(t.api("/vision", "PUT", {"text": "# Bean and Gone\n\nA small coffee roaster on Mill Street. We roast on Tuesdays and open every day from 7 to 4.\n\nAudience: neighbours and commuters\n"}, token=host, project=pid))
        t.ok(t.api("/vision", "PUT", {"text": f"# Night Market\n\nA secret pop-up, code name {SECRET}.\n"}, token=host, project=other))
        t.ok(t.api(f"/projects/{pid}/brand", "PUT", {"kit": {"name": "Bean and Gone", "colors": {"accent": "#B4532C"}, "fonts": {"display": "Fraunces", "body": "Inter"}, "voice": "Warm, short sentences."}}, token=host))
        t.ok(t.api("/flint/facts", "POST", {"facts": [{"kind": "decision", "key": "Oat milk", "value": "No extra charge for oat milk"}]}, token=host, project=pid))
        t.ok(t.api("/flint/facts", "POST", {"facts": [{"kind": "fact", "key": "Password", "value": SECRET}]}, token=host, project=other))
        cafe = t.ok(t.api("/site-designer/template/cafe", token=host))["config"]; cafe["name"] = f"Night Market {SECRET}"
        t.ok(t.api(f"/projects/{other}/site-config", "PUT", {"config": cafe}, token=host), "the other project has a site")
        maya, maya_id = t.join(host, "Maya", project=pid)
        assert t.api(f"/projects/{other}/site-config", token=maya)[0] in (403, 404), "Maya cannot see the other project"
        ag = t.agent(maya)

        # ---------- 1: the tools teach the workflow ----------
        tools = ag.tools()
        for n in ("get_guide", "project_brief", "site_catalog", "site_read", "site_view", "site_check", "site_propose"): assert n in tools, n
        assert 'get_guide("website")' in tools["site_propose"]["description"] and "dry_run" in tools["site_propose"]["description"] and "get_guide" in tools["site_read"]["description"]
        assert "dry_run" in tools["site_propose"]["inputSchema"]["properties"] and "start" in tools["site_propose"]["inputSchema"]["properties"]
        assert "project_brief" in ag.init["instructions"] and "get_guide" in ag.init["instructions"] and "resources" in ag.init["capabilities"] and "prompts" in ag.init["capabilities"]
        guide = ag.good("get_guide", {"name": "website"})
        for n in ("project_brief", "site_catalog", "site_read", "site_view", "site_propose", "site_check"): assert f"`{n}`" in guide, f"the guide names {n}"
        assert "<!-- gen" not in guide and "What you must never do" in guide
        assert ag.good("get_guide", {"name": "website", "section": "never"}).startswith("## ") and len(ag.good("get_guide", {"name": "index"})) < 4000
        ag.bad("get_guide", {"name": "website", "section": "zzz"})
        st, j = t.rpc(ag.key, "resources/list"); uris = [r["uri"] for r in j["result"]["resources"]]
        assert "tribecode://guide/website" in uris and "tribecode://project/brief" in uris, uris
        st, j = t.rpc(ag.key, "resources/read", {"uri": "tribecode://guide/website"}); assert j["result"]["contents"][0]["text"] == guide
        st, j = t.rpc(ag.key, "resources/read", {"uri": "tribecode://guide/nope"}); assert "error" in j
        st, j = t.rpc(ag.key, "prompts/list"); assert {"design_website", "design_app", "design_motion"} <= {p["name"] for p in j["result"]["prompts"]}
        st, j = t.rpc(ag.key, "prompts/get", {"name": "design_website", "arguments": {"ask": "A calmer home page"}}); ptxt = j["result"]["messages"][0]["content"]["text"]
        assert ptxt.startswith("# Project brief: Bean and Gone") and "A calmer home page" in ptxt and "## 5. The steps" in ptxt

        # ---------- 2: the brief ----------
        brief = ag.good("project_brief")
        for want in ("Bean and Gone", "coffee roaster on Mill Street", "#B4532C", "Fraunces + Inter", "Warm, short sentences", "No extra charge for oat milk", "neighbours and commuters", "Maya approves what you propose", "You work for Maya"):
            assert want in brief, (want, brief)
        assert SECRET not in brief and "Night Market" not in brief and len(brief) < 9000, brief
        assert len(ag.good("project_brief", {"short": True})) < len(brief)
        for name, args in (("project_brief", {}), ("site_read", {}), ("site_view", {}), ("site_check", {}), ("site_propose", {"ops": [{"op": "name", "value": "x"}]}), ("app_read", {})):
            out = ag.bad(name, args, project=other); assert SECRET not in out and "No project" in out, (name, out)
        st, j = t.rpc(ag.key, "resources/read", {"uri": "tribecode://project/brief", "project": other}); assert "error" in j and SECRET not in json.dumps(j)
        st, j = t.rpc(ag.key, "prompts/get", {"name": "design_website", "arguments": {"project": other}}); assert "error" in j and SECRET not in json.dumps(j)

        # ---------- 3: job one, a café site from nothing ----------
        ops_ok = set(guide_ops(guide)); recipe = guide_recipe(guide, "A place people visit")
        assert ("list", "menu") in recipe and recipe[0][0] == "hero", recipe
        out = ag.bad("site_read"); assert "start" in out and "site_propose" in out, out
        cat = json.loads(ag.good("site_catalog")); kinds = {b["type"]: b for b in cat["blocks"]}
        for typ, var in recipe: assert var in kinds[typ]["variants"], (typ, var)
        assert "paper" in [l["id"] for l in cat["looks"]] and len(cat["steps"]) == len(ops_ok)
        tpl = json.loads(ag.good("site_catalog", {"part": "templates", "limit": 5}))["templates"]; assert len(tpl["items"]) <= 5 and tpl["total"] >= 5
        words = {
            "list": {"title": "On the bar", "items": [{"title": "Espresso", "meta": "", "text": "Our own roast"}, {"title": "Flat white", "meta": "", "text": "Oat milk at no extra charge"}, {"title": "Filter", "meta": "", "text": "Roasted on Tuesdays"}]},
            "info": {"title": "Find us", "items": [{"label": "Where", "text": "Mill Street"}, {"label": "Hours", "text": "Every day, 7 to 4"}]},
            "cta": {"title": "Come by before work", "text": "We open at 7, every day.", "buttons": [{"label": "See what is on the bar"}]},
        }
        first = [{"op": "theme", "preset": "paper"}, {"op": "accent", "color": "#B4532C"}, {"op": "fonts", "pair": "classic"}, {"op": "name", "value": "Bean and Gone"}]
        first += [{"op": "add", "type": typ, "variant": var, "props": words[typ]} for typ, var in recipe if typ in words]
        first += [{"op": "seo", "title": "Bean and Gone · Coffee on Mill Street", "description": "A small coffee roaster on Mill Street. Open every day from 7 to 4."}]
        assert {o["op"] for o in first} <= ops_ok, "the agent only uses steps the guide documents"
        dry = ag.good("site_propose", {"start": {"blank": True}, "ops": first, "dry_run": True})
        assert dry.startswith("Dry run: nothing was sent") and "Starts a new website" in dry and "Check my site on the result" in dry and "Sections now" in dry, dry
        assert t.ok(t.api(f"/projects/{pid}/changes", token=maya))["requests"] == [] and t.ok(t.api(f"/projects/{pid}/site-config", token=maya))["config"] is None, "a dry run sends nothing"
        # a bad step: the reason and a corrected example; the good steps of the same call would still go
        bad = ag.good("site_propose", {"start": {"blank": True}, "dry_run": True, "ops": [{"op": "add", "type": "menu", "props": {"title": "Menu"}}, {"op": "add", "type": "list", "variant": "fancy", "props": {"heading": "Menu"}}, {"op": "recolor", "color": "red"}, {"op": "fonts", "pair": "comic"}]})
        assert 'there is no "menu" section' in bad and 'Try: {"op":"add","type":"list"' in bad and '"fancy" is not a layout of list' in bad and "rows, cards, menu" in bad and 'has no "heading"' in bad and '"recolor" is not a step' in bad and "no font pair" in bad, bad
        out = ag.bad("site_propose", {"start": {"blank": True}, "ops": [{"op": "recolor"}, {"op": "theme", "preset": "neon"}]}); assert "nothing was proposed" in out and "Try:" in out and "Looks: " in out, out
        out = ag.bad("site_propose", {"start": {"template": "no-such-template"}, "ops": []}); assert "Some that exist" in out, out
        sent = ag.good("site_propose", {"start": {"blank": True}, "ops": first, "note": "A first site for Bean and Gone from the vision: what it is, what is on the bar, where and when."})
        assert sent.startswith(f"Proposed {len(first) + 1} changes") and "(Maya)" in sent and "nothing has changed yet" in sent, sent
        at = ids(sent)
        for typ in ("hero", "features", "contact", "list", "info", "cta", "footer"): assert typ in at, (typ, at)
        prop = json.loads(ag.good("site_read", {"proposed": True, "detail": "summary"})); assert prop["look"] == "paper" and prop["accent"].upper() == "#B4532C", prop
        # second call: the hero in the project's words, its layout from the recipe, links, a picture, the starters that do not fit go
        second = [
            {"op": "variant", "block": at["hero"], "variant": dict(recipe)["hero"]},
            {"op": "text", "block": at["hero"], "path": "eyebrow", "value": "Mill Street"},
            {"op": "text", "block": at["hero"], "path": "title", "value": "Coffee roasted next door"},
            {"op": "text", "block": at["hero"], "path": "text", "value": "We roast on Tuesdays and pour every day from 7 to 4."},
            {"op": "text", "block": at["hero"], "path": "buttons.0.label", "value": "See what is on the bar"},
            {"op": "link", "block": at["hero"], "path": "buttons.0", "kind": "section", "to": at["list"]},
            {"op": "text", "block": at["hero"], "path": "buttons.1.label", "value": "Find us"},
            {"op": "link", "block": at["hero"], "path": "buttons.1", "kind": "section", "to": at["info"]},
            {"op": "illustration", "block": at["hero"], "path": "", "name": "cafe"},
            {"op": "link", "block": at["cta"], "path": "buttons.0", "kind": "section", "to": at["list"]},
            {"op": "link", "block": at["info"], "path": "button", "kind": "section", "to": at["list"]},
            {"op": "text", "block": at["info"], "path": "button.label", "value": "See what is on the bar"},
            {"op": "style", "block": at["list"], "bg": "card", "pad": ""},
            {"op": "remove", "block": at["features"]}, {"op": "remove", "block": at["contact"]},
            {"op": "move", "block": at["list"], "to": 1},
        ]
        assert {o["op"] for o in second} <= ops_ok
        more = ag.good("site_propose", {"ops": second}); assert "added to your waiting proposal" in more and "Skipped" not in more, more
        reqs = t.ok(t.api(f"/projects/{pid}/changes", token=maya))["requests"]; open_ = [r for r in reqs if r["status"] == "open"]
        assert len(open_) == 1 and open_[0]["tool"] == "site" and open_[0]["byName"] == "Maya" and open_[0]["agentName"] and open_[0]["to"] == ["Maya"] and "first site" in open_[0]["why"], reqs
        chk = json.loads(ag.good("site_check", {"proposed": True})); assert chk["fix"] == 0, chk
        assert not [i for i in chk["items"] if "example words" in i["title"]], chk["items"]
        phone = ag.good("site_view", {"proposed": True, "device": "phone"})
        assert "phone view" in phone and "# Coffee roasted next door" in phone and "( See what is on the bar → section " in phone and "HERO · split" in phone and "→ nowhere" not in phone and "[picture: A cup of coffee" in phone, phone
        assert phone.index("HERO") < phone.index("LIST") < phone.index("VISIT US") < phone.index("CALL TO ACTION") < phone.index("FOOTER"), phone
        assert t.ok(t.api(f"/projects/{pid}/site-config", token=maya))["config"] is None, "nothing is saved until a person approves"
        ag.bad("site_view")   # the saved site does not exist yet
        t.ok(t.api(f"/approvals/{open_[0]['approval']}/approve", "POST", {}, token=maya), "Maya approves her helper's proposal")
        cfg = wait(lambda: t.ok(t.api(f"/projects/{pid}/site-config", token=maya))["config"], "the site is saved")
        assert cfg["name"] == "Bean and Gone" and [b["type"] for b in cfg["pages"][0]["blocks"]] == ["hero", "list", "info", "cta", "footer"], [b["type"] for b in cfg["pages"][0]["blocks"]]
        assert json.loads(ag.good("site_check"))["fix"] == 0 and ag.bad("site_read", {"proposed": True})
        folder = t.tmp / "tribe" / "projects" / pid
        wait(lambda: (folder / "site" / "index.html").exists() and "Coffee roasted next door" in (folder / "site" / "index.html").read_text(), "the site is files in the project folder")

        # ---------- 4: job two, restyle and fix the phone layout; the role needs Camp's OK; one Undo ----------
        cur = t.ok(t.api(f"/projects/{pid}/site-config", token=host)); c2 = cur["config"]
        c2["pages"][0]["blocks"].insert(2, {"type": "pricing", "variant": "table", "props": {"title": "Beans to take home", "note": "", "plans": [{"name": f"Roast {i}", "price": "$12", "per": "250 g", "features": ["Whole bean"], "button": {"label": "Ask at the bar", "link": {"kind": "section", "to": c2["pages"][0]["blocks"][1]["id"]}}} for i in range(1, 6)]}})
        c2["pages"][0]["blocks"].insert(3, {"type": "gallery", "variant": "grid", "props": {"title": "The shop", "items": [{"img": "", "alt": "", "caption": ""}] * 3}})
        t.ok(t.api(f"/projects/{pid}/site-config", "PUT", {"config": c2, "base": cur["rev"]}, token=host), "Camp adds a price table and a gallery")
        t.ok(t.api("/perms/overrides", "PUT", {"cap": "site.edit", "role": "builder", "on": False}, token=host), "take site.edit from builders")
        assert "Camp" in ag.good("project_brief", {"short": True}).split("Who approves what")[1].split("\n")[1], "the brief says Camp approves the website now"
        before = t.ok(t.api(f"/projects/{pid}/site-config", token=host))["config"]
        summ = json.loads(ag.good("site_read", {"detail": "summary"})); full = ag.good("site_read")
        assert len(json.dumps(summ)) < len(full) / 2 and "can" not in summ and summ["pages"][0]["sections"][0].split(" ")[1].startswith("hero/"), summ
        one = json.loads(ag.good("site_read", {"page": "Home"})); assert len(one["pages"]) == 1 and "can" not in one
        sec = {s.split(" ")[1].split("/")[0]: s.split(" ")[0] for s in summ["pages"][0]["sections"]}
        chk = json.loads(ag.good("site_check")); table = [i for i in chk["items"] if "price table" in i["title"]]
        assert table and table[0]["fix_ops"] == [{"op": "variant", "block": sec["pricing"], "variant": "cards"}], chk
        assert "5 entries" not in ag.good("site_view", {"device": "phone"}) and "[empty picture slot]" in ag.good("site_view", {"device": "phone"})
        restyle = [{"op": "theme", "preset": "night"}, {"op": "mode", "value": "dark"}, {"op": "accent", "color": "#B4532C"}, {"op": "fonts", "pair": "modern"}, {"op": "space", "value": "roomy"}, {"op": "radius", "value": 4},
                   *table[0]["fix_ops"], {"op": "show", "block": sec["gallery"], "hide": "phone"}, {"op": "style", "block": sec["cta"], "bg": "accent", "pad": "l"}]
        assert {o["op"] for o in restyle} <= ops_ok
        out = ag.good("site_propose", {"ops": restyle, "note": "A darker evening look in the brand colour; on phones the price table becomes cards and the empty gallery is hidden."})
        assert out.startswith("Proposed 9 changes") and "(Camp)" in out and "Maya" not in out.split("\n")[0], out
        rq = [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=host))["requests"] if r["status"] == "open"]; assert len(rq) == 1 and rq[0]["to"] == ["Camp"] and rq[0]["byName"] == "Maya", rq
        assert t.ok(t.api(f"/projects/{pid}/site-config", token=host))["config"] == before, "nothing changed yet"
        assert t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=maya)[0] in (400, 403, 404), "the agent's own person cannot approve what needs Camp"
        assert t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=ag.key)[0] in (400, 401, 403, 404), "the agent cannot approve its own proposal"
        phone = ag.good("site_view", {"proposed": True, "device": "phone"}); assert "GALLERY · grid · HIDDEN ON PHONE" in phone and "PRICING · cards" in phone and "look night (dark)" in phone, phone
        assert "HIDDEN" not in ag.good("site_view", {"proposed": True, "device": "desktop"})
        t.ok(t.api(f"/approvals/{rq[0]['approval']}/approve", "POST", {}, token=host), "Camp approves")
        after = wait(lambda: (lambda c: c if c["theme"]["preset"] == "night" else None)(t.ok(t.api(f"/projects/{pid}/site-config", token=host))["config"]), "the restyle is applied")
        pr = [b for b in after["pages"][0]["blocks"] if b["type"] == "pricing"][0]; assert pr["variant"] == "cards" and after["theme"]["space"] == "roomy"
        t.ok(t.api(f"/projects/{pid}/changes/{rq[0]['id']}/undo", "POST", {}, token=host), "one Undo")
        assert t.ok(t.api(f"/projects/{pid}/site-config", token=host))["config"] == before, "Undo brings the earlier site back"

        # ---------- 5: answers fit a model's context ----------
        assert ag.biggest[0] == "get_guide" and ag.biggest[1] < 32000, ag.biggest
        assert len(full) < 12000 and len(json.dumps(cat)) < 20000 and len(phone) < 6000, (len(full), len(json.dumps(cat)), len(phone))

        # ---------- 6: Website switched off for the agent ----------
        t.ok(t.api("/invite-agent", "PUT", {"kind": "claude", "scopes": ["chat", "docs", "tasks", "files", "approvals"]}, token=maya))
        for name, args in (("site_read", {}), ("site_view", {}), ("site_check", {}), ("site_catalog", {}), ("site_propose", {"ops": [{"op": "name", "value": "Mine now"}]}), ("app_read", {}), ("app_propose", {"start": {"blank": True}, "ops": []}), ("app_catalog", {}), ("motion_list", {})):
            out = ag.bad(name, args); assert "turned off Website" in out, (name, out)
        listed = ag.tools(); assert "site_propose" not in listed and "app_propose" not in listed and "get_guide" in listed and "project_brief" in listed
        assert "Bean and Gone" in ag.good("project_brief") and "## 5. The steps" in ag.good("get_guide", {"name": "website"})
        assert not [r for r in t.ok(t.api(f"/projects/{pid}/changes", token=host))["requests"] if r["status"] == "open"], "a refused call proposes nothing"
        t.ok(t.api("/invite-agent", "PUT", {"kind": "claude", "scopes": ["chat", "docs", "tasks", "files", "website", "approvals"]}, token=maya))

        # ---------- 7: a design request carries the project brief ----------
        ask = t.ok(t.api("/coord/asks", "POST", {"text": "Website design request from Maya: make it calmer.", "design": "site"}, token=maya, project=pid))["ask"]
        assert ask["title"].startswith("Website design request") and ask["context"].startswith("# Project brief: Bean and Gone") and "#B4532C" in ask["context"] and ask["context"].rstrip().endswith("make it calmer.") and SECRET not in ask["context"], ask
        took = ag.good("take_handoff", {"id": ask["id"]}); assert "Project brief: Bean and Gone" in took and "make it calmer" in took, took[:400]
        plain = t.ok(t.api("/coord/asks", "POST", {"text": "What is for lunch?"}, token=maya, project=pid))["ask"]; assert plain["context"] == "What is for lunch?", plain

        # ---------- 8: the project folder, and the bridge's source ----------
        agents = wait(lambda: (folder / "AGENTS.md").exists() and (folder / "AGENTS.md").read_text(), "AGENTS.md in the project folder")
        assert "<!-- tribecode:start" in agents and "<!-- tribecode:end -->" in agents and "coffee roaster on Mill Street" in agents and "site/site.json" in agents and "site_propose" in agents and ".tribe/ai/WEBSITE.md" in agents, agents
        assert (folder / "CLAUDE.md").read_text().startswith("@AGENTS.md")
        for f in ("WEBSITE.md", "APP.md", "MOTION.md", "PROJECT.md"): assert (folder / ".tribe" / "ai" / f).exists(), f
        assert (folder / ".tribe" / "ai" / "WEBSITE.md").read_text() == guide and "Bean and Gone" in (folder / ".tribe" / "ai" / "PROJECT.md").read_text() and SECRET not in (folder / ".tribe" / "ai" / "PROJECT.md").read_text()
        (folder / "AGENTS.md").write_text("My own rule: always say hello.\n\n" + agents + "\nAnd goodbye.\n")
        t.ok(t.api("/vision", "PUT", {"text": "# Bean and Gone\n\nA coffee roaster and bakery on Mill Street.\n"}, token=host, project=pid))
        cur = t.ok(t.api(f"/projects/{pid}/site-config", token=host)); cur["config"]["name"] = "Bean and Gone Bakery"
        t.ok(t.api(f"/projects/{pid}/site-config", "PUT", {"config": cur["config"], "base": cur["rev"]}, token=host), "a save writes the folder again")
        now = wait(lambda: (lambda x: x if "roaster and bakery" in x else None)((folder / "AGENTS.md").read_text()), "the block follows the project")
        assert now.startswith("My own rule: always say hello.") and now.rstrip().endswith("And goodbye.") and now.count("<!-- tribecode:start") == 1 and "We roast on Tuesdays" not in now, now
        # a hand-written AGENTS.md (no block of ours) is never touched
        ofolder = t.tmp / "tribe" / "projects" / other
        wait(lambda: (ofolder / ".tribe" / "ai" / "PROJECT.md").exists(), "the other project's folder has its guides")
        (ofolder / "AGENTS.md").write_text("# Night Market\n\nWritten by hand. Do not touch.\n")
        oc = t.ok(t.api(f"/projects/{other}/site-config", token=host)); oc["config"]["name"] = "Night Market 2"
        t.ok(t.api(f"/projects/{other}/site-config", "PUT", {"config": oc["config"], "base": oc["rev"]}, token=host))
        wait(lambda: "Night Market 2" in (ofolder / ".tribe" / "ai" / "PROJECT.md").read_text(), "the other project's brief follows")
        time.sleep(0.5); assert (ofolder / "AGENTS.md").read_text() == "# Night Market\n\nWritten by hand. Do not touch.\n", "a hand-written AGENTS.md is left alone"
        # the bridge and Flint read the same brief and the same guide
        ab = t.ok(t.api(f"/projects/{pid}/ai-brief?kind=site", token=maya))
        assert ab["brief"].startswith("# Project brief: Bean and Gone") and "How to make this website good" in ab["essentials"] and "Design rules:" in ab["trimmed"] and ab["line"].startswith("Project: Bean and Gone") and len(ab["line"]) < 500, ab
        assert "one main button" in t.ok(t.api(f"/projects/{pid}/ai-brief?kind=app", token=maya))["trimmed"]
        assert t.api(f"/projects/{other}/ai-brief?kind=site", token=maya)[0] == 404 and t.api(f"/projects/{pid}/ai-brief", method="POST", body={}, token=maya)[0] in (404, 405)
        assert t.ok(t.api("/ai-guides/website", token=maya))["text"] == guide and t.api("/ai-guides/nope", token=maya)[0] == 404 and t.api("/ai-guides", token=None)[0] == 401
        print("e2e_ai_agent_site: OK (the guide teaches the workflow; the brief has the vision and brand and nothing from another project; a café site from nothing with a dry run, useful errors, one request and a clean Check; a restyle that needs Camp's OK and one Undo; refused without Website; a design request carries the brief; AGENTS.md in a marked block, hand-written files untouched)")
    except Exception:
        print(t.log()); raise
    finally:
        t.stop()


if __name__ == "__main__":
    main()
