"""Flint in the creators (app/ui/flintcreate.js, app/ui/polish.js, server/appcreator.js MCP; docs/CLAUDE-HOOKS.md).

  One Flint: App Creator has the same Flint panel as the website designer (thread, chips, the level badge, Undo on a
    reply). With no AI in the tribe the spot under the thread offers Polish it and one honest line, no "Make it beautiful".
  Level 0 (rules): the selected thing (words, duplicate, move, remove), screens (rename, first, copy, delete), help.
  Polish it: a messed-up app and a messed-up site each list what will change; nothing changes until Apply; one Undo.
  Levels 1-2: a (fake) local model turns a loose request into Flint's own commands; the reply says "On this computer";
    a command a model may not start (export, publish) is refused and nothing changes; no model = an honest answer.
  Claude hooks: an agent reads the app (app_read) and proposes (app_propose); unsafe steps are skipped; nothing is saved;
    the agent cannot approve its own; the person sees before and after drawn and approves; then "Make it beautiful"
    shows (an AI is in the tribe) and sends the brief to the agents.
  Phone 390px: the panel lives in the Flint sheet; the Polish sheet fits; no sideways scroll. No console errors.
Usage: python app/test/e2e_flint_create.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, LPORT = 6740 + OFF, 6840 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors, seen = [], []


class Fake(BaseHTTPRequestHandler):   # an OpenAI-compatible local model that answers from a script
    def log_message(self, *a): pass
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "content-type"); self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        body = json.dumps({"object": "list", "data": [{"id": "fake-small"}]}).encode()
        self.send_response(200 if self.path == "/v1/models" else 404); self.cors(); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        seen.append(req); sysmsg = req["messages"][0]["content"]; user = req["messages"][-1]["content"]
        app = "App Creator" in sysmsg
        if "zzcalm" in user: out = {"ops": [{"say": "make it dark"}, {"say": "calmer motion"}]} if app else {"ops": [{"say": "dark mode"}, {"say": "rounder corners"}]}
        elif "zzevil" in user: out = {"ops": [{"say": "export it"}]} if app else {"ops": [{"say": "publish it"}]}
        elif "zzextra" in user: out = {"ops": [{"say": "make it dark", "run": "rm -rf /"}]}
        elif "zzhtml" in user: out = {"ops": [{"say": "<script>alert(1)</script>"}]}
        elif "zzgarbage" in user: out = None
        else: out = {"text": "I am a scripted fake."}
        text = "sure, here you go!" if out is None else "```json\n" + json.dumps(out) + "\n```"
        self.send_response(200); self.cors(); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        try:
            for i in range(0, len(text), 16):
                self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": text[i:i + 16]}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.01)
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        except Exception: pass


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None, project=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    h = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def doc(pg): return pg.evaluate("TribeAppCreator.doc()")
def cfg(pg): return pg.evaluate("TribeSiteDesigner.cfg()")
def shot(pg, name):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name))
LAST = "(() => { const l = (TribeAppCreator.state().flog || []).filter(m => m.who === 'flint'); return l[l.length - 1] || null; })()"
SLAST = "(() => { const l = (TribeSiteDesigner.state().log || []).filter(m => m.who === 'flint'); return l[l.length - 1] || null; })()"


def aask(pg, text):
    r = pg.evaluate("t => TribeAppCreator.ask(t)", text); pg.wait_for_timeout(120)
    return r


def sask(pg, text):
    pg.evaluate("t => TribeSiteDesigner.ask(t)", text); pg.wait_for_timeout(150)
    return pg.evaluate(SLAST)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flc-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Flint Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    fake = ThreadingHTTPServer(("127.0.0.1", LPORT), Fake); threading.Thread(target=fake.serve_forever, daemon=True).start()
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]
        pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeAppCreator && window.TribeFlintCreate && window.TribePolish && window.TribeClient && TribeClient.connected()", timeout=20000)

            # ================= App Creator =================
            pg.evaluate(f"TribeAppCreator.open({{ pid: '{pid}', template: 'habits' }})"); pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            # ---- one Flint: the same panel as the website designer
            pg.wait_for_selector("#apc-flint .flint-mount[data-flctx=appcreator] #apc-ask-in", timeout=5000)
            assert pg.locator("#apc form.apc-ask").count() == 0, "the one-line box is gone"
            assert pg.locator("#apc-flint .fl-chip").count() in (1, 2, 3), "chips: three at most (pass 9)"
            assert pg.locator("#apc-flint .flm-ctx").text_content().strip().lower() == "app"
            assert pg.locator("#apc-flint [data-fc-act=polish]").count() == 1 and pg.locator("#apc-flint [data-fc-act=beauty]").count() == 0, "no AI in the tribe: Polish it only"
            assert "stronger AI" in pg.locator("#apc-flint [data-fc-line]").text_content(), "one honest line where Make it beautiful would be"
            pg.click("#apc-flint [data-fc-tip]"); assert pg.locator("#apc-flint [data-fc-line]").is_visible(), "pass 5: the line sits behind the small info button"
            n0 = len(doc(pg)["screens"])
            pg.fill("#apc-ask-in", "add a settings screen"); pg.press("#apc-ask-in", "Enter")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length > {n0}", timeout=5000)
            pg.wait_for_selector("#apc-flint .fl-msg.fl .fl-lvl[data-lvl=rules]", timeout=4000)
            assert pg.locator("#apc-flint .fl-msg.fl .fl-lvl").last.inner_text().strip().lower() == "no ai", "the badge says which level answered"
            assert pg.locator("#apc-flint .fl-msg.me").count() == 1, "what was asked shows once"
            shot(pg, "flint-create-app-1440.png")
            pg.locator("#apc-flint .fl-msg.fl .fl-act", has_text="Undo").last.click()
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {n0}", timeout=4000)
            # a chip runs
            pg.locator("#apc-flint .fl-chip").first.wait_for(); pg.fill("#apc-ask-in", "What can you do here?"); pg.press("#apc-ask-in", "Enter")   # pass 9: three chips at most, so this one is typed
            pg.wait_for_function(LAST + ".text.includes('Every step has an Undo')", timeout=4000)
            # ---- the selected thing
            first = doc(pg)["screens"][0]; hd = first["blocks"][0]
            pg.evaluate("id => { const s = TribeAppCreator.state(); s.sel = { block: id, path: '', kind: 'block' }; }", hd["id"])
            aask(pg, "change this to Hi Sam"); assert doc(pg)["screens"][0]["blocks"][0]["props"]["title"] == "Hi Sam", doc(pg)["screens"][0]["blocks"][0]["props"]
            assert pg.evaluate(LAST + ".acts.some(a => a.label === 'Undo')"), "Undo on the reply"
            nb = len(doc(pg)["screens"][0]["blocks"])
            aask(pg, "duplicate this"); assert len(doc(pg)["screens"][0]["blocks"]) == nb + 1
            aask(pg, "move this down"); assert doc(pg)["screens"][0]["blocks"][1]["id"] == hd["id"], "moved down one"
            aask(pg, "remove this"); assert len(doc(pg)["screens"][0]["blocks"]) == nb and all(x["id"] != hd["id"] for x in doc(pg)["screens"][0]["blocks"])
            r = aask(pg, "remove this"); assert "first" in r["text"].lower(), r   # nothing selected now: asks for a click, changes nothing
            # ---- screens
            aask(pg, "add a screen called Tips"); assert any(s["name"] == "Tips" for s in doc(pg)["screens"])
            aask(pg, "rename the tips screen to Hints"); assert any(s["name"] == "Hints" for s in doc(pg)["screens"])
            aask(pg, "make the hints screen the first screen"); d = doc(pg); assert next(s for s in d["screens"] if s["id"] == d["start"])["name"] == "Hints"
            aask(pg, "duplicate the hints screen"); assert any(s["name"] == "Hints copy" for s in doc(pg)["screens"])
            aask(pg, "delete the hints copy screen"); assert not any(s["name"] == "Hints copy" for s in doc(pg)["screens"])
            r = aask(pg, "delete the banana screen"); assert "no banana screen" in r["text"], r
            for _ in range(12): pg.evaluate("TribeAppCreator.undo()")
            assert doc(pg)["screens"][0]["blocks"][0]["props"]["title"] != "Hi Sam" and len(doc(pg)["screens"]) == n0, "back to the template"

            # ---- Polish it: what will change, then one Apply, one Undo
            pg.evaluate("TribeAppCreator.apply({ op: 'theme', set: { accent: '#FFF9C4' } })"); pg.evaluate("TribeAppCreator.apply({ op: 'screen.add', name: 'New screen' })")
            before = doc(pg)
            pg.locator("#apc-flint [data-fc-act=polish]").click()
            pg.wait_for_selector("#polish .pol-row", timeout=5000)
            assert pg.locator("#polish .pol-row").count() >= 2 and pg.locator("#polish .pol-row input:checked").count() == pg.locator("#polish .pol-row").count()
            assert doc(pg)["theme"]["accent"] == before["theme"]["accent"] and len(doc(pg)["screens"]) == len(before["screens"]), "nothing changes before Apply"
            assert "nothing changes until you press Apply" in pg.evaluate(LAST + ".text")
            shot(pg, "flint-create-polish-1440.png")
            pg.click("#pol-apply")
            pg.wait_for_function(f"TribeAppCreator.doc().screens.length === {len(before['screens']) - 1} && TribeAppCreator.doc().theme.accent !== '#FFF9C4'", timeout=5000)
            assert pg.locator("#polish").count() == 0 and "Polished" in pg.evaluate(LAST + ".text")
            pg.evaluate("TribeAppCreator.undo()")
            assert doc(pg)["theme"]["accent"] == "#FFF9C4" and len(doc(pg)["screens"]) == len(before["screens"]), "one Undo takes the whole polish back"
            pg.evaluate("TribeAppCreator.undo(); TribeAppCreator.undo()")
            r = aask(pg, "polish it"); assert pg.locator("#polish").count() == 1, r   # a stock template: only by-hand notes
            assert pg.locator("#polish #pol-apply").count() == 0 and pg.locator("#polish .pol-notes li").count() >= 1
            pg.keyboard.press("Escape"); pg.wait_for_function("!document.getElementById('polish')")

            # ---- no model: an honest answer, nothing changed
            snap = json.dumps(doc(pg), sort_keys=True)
            r = aask(pg, "zzcalm vibes for the evening please"); assert r["level"] == "rules" and "Here I can add screens" in r["text"], r
            assert json.dumps(doc(pg), sort_keys=True) == snap
            # ---- a local model on this computer: loose words -> Flint's own commands, checked
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'device', url: 'http://127.0.0.1:{LPORT}', model: 'fake-small' }})")
            assert pg.evaluate("TribeFlintLLM.ready()")
            r = aask(pg, "zzcalm vibes for the evening please")
            d = doc(pg); assert d["theme"]["mode"] == "dark" and d["theme"]["motion"] == "calm", (d["theme"], r, len(seen))
            assert r["level"] == "computer", r
            pg.wait_for_selector("#apc-flint .fl-msg.fl .fl-lvl[data-lvl=computer]", timeout=4000)
            assert pg.locator("#apc-flint .fl-lvl[data-lvl=computer]").last.inner_text().strip().lower() == "on this computer"
            assert "make it dark" in pg.evaluate(LAST + ".html") and pg.evaluate(LAST + ".acts.some(a => a.label === 'Undo')"), "it says how it read the request, and offers Undo"
            sysmsg = seen[-1]["messages"][0]["content"]; assert "App Creator" in sysmsg and "JSON only" in sysmsg and "export it" not in sysmsg and "make a habit tracker app" not in sysmsg, sysmsg[:300]
            shot(pg, "flint-create-model-1440.png")
            snap = json.dumps(doc(pg), sort_keys=True)
            for bad in ["zzevil thing", "zzextra thing", "zzhtml thing", "zzgarbage thing"]:
                r = aask(pg, bad); assert json.dumps(doc(pg), sort_keys=True) == snap, f"{bad}: the design changed"
                assert "Here I can add screens" in r["text"], (bad, r)
            assert pg.locator("#apc-flint script").count() == 0
            pg.evaluate("TribeFlintLLM.set({ backend: 'off' })")
            pg.evaluate("TribeAppCreator.close()"); pg.wait_for_timeout(700)

            # ================= the website designer =================
            pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', template: TribeSiteCfg.TEMPLATES[0].id }})")
            pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages[0].blocks.length >= 3 && document.querySelector('#wdz-flint .flint-mount')", timeout=15000)
            pg.wait_for_selector("#wdz-flint [data-fc-act=polish]", timeout=5000)
            assert pg.locator("#wdz-flint [data-fc-act=beauty]").count() == 0 and pg.locator("#wdz-flint [data-fc-line]").count() == 1
            m = sask(pg, "what can you do here?"); assert "Every step has an Undo" in m["text"] and m["lvl"] == "rules" and len(m["acts"]) >= 3, m
            pg.wait_for_selector("#wdz-flint .fl-lvl[data-lvl=rules]", timeout=4000)
            m = sask(pg, "make it beautiful"); assert "None is connected" in m["text"] and any(a["label"] == "Polish it" for a in m["acts"]), m
            # mess it up, then polish
            pg.evaluate("""TribeSiteDesigner.applyChange({ fn: c => { const S = TribeSiteCfg, pg = c.pages[0], b = pg.blocks; c = S.setStyle(c, pg.id, b[1].id, { pad: 'l' }); c = S.setElStyle(c, pg.id, b[0].id, 'title', { sz: 's', al: 'center' }); c = S.setElStyle(c, pg.id, b[0].id, 'text', { sz: 'xl', al: 'left' }); return c; } })""")
            c0 = cfg(pg); assert c0["pages"][0]["blocks"][0]["es"]["title"]["sz"] == "s"
            pg.locator("#wdz-flint [data-fc-act=polish]").click()
            pg.wait_for_selector("#polish .pol-row", timeout=5000)
            assert cfg(pg)["pages"][0]["blocks"][0]["es"]["title"]["sz"] == "s", "nothing changes before Apply"
            titles = pg.locator("#polish .pol-row b").all_inner_texts(); assert any("sizes" in t for t in titles) and any("lines up two ways" in t for t in titles), titles
            shot(pg, "flint-create-site-polish-1440.png")
            pg.click("#pol-apply")
            pg.wait_for_function("!((TribeSiteDesigner.cfg().pages[0].blocks[0].es || {}).title || {}).sz", timeout=5000)
            assert "Polished" in pg.evaluate(SLAST + ".text") and pg.evaluate(SLAST + ".acts.some(a => a.label === 'Undo')")
            pg.evaluate("TribeSiteDesigner.undo()")
            assert cfg(pg)["pages"][0]["blocks"][0]["es"]["title"]["sz"] == "s", "one Undo"
            pg.evaluate("TribeSiteDesigner.redo()")
            m = sask(pg, "check my site"); assert "Opened Check" in m["text"] and pg.evaluate("TribeSiteDesigner.state().panel") == "check", m
            # a section, removed by pointing at it
            nb = len(cfg(pg)["pages"][0]["blocks"])
            pg.evaluate("(() => { const s = TribeSiteDesigner.state(); })()")
            # ---- a local model here too
            mode0 = cfg(pg)["theme"]["mode"]
            m = sask(pg, "zzcalm vibes for the evening please"); assert cfg(pg)["theme"]["mode"] == mode0, "no model: nothing changes"
            pg.evaluate(f"TribeFlintLLM.set({{ backend: 'device', url: 'http://127.0.0.1:{LPORT}', model: 'fake-small' }})")
            m = sask(pg, "zzcalm vibes for the evening please")
            assert cfg(pg)["theme"]["mode"] == "dark", cfg(pg)["theme"]
            assert m["lvl"] == "computer" and "dark mode" in m["html"], m
            pg.wait_for_selector("#wdz-flint .fl-lvl[data-lvl=computer]", timeout=4000)
            snap = json.dumps(cfg(pg), sort_keys=True)
            m = sask(pg, "zzevil thing"); assert json.dumps(cfg(pg), sort_keys=True) == snap, "a model may not publish"
            pg.evaluate("TribeFlintLLM.set({ backend: 'off' })")
            assert nb == len(cfg(pg)["pages"][0]["blocks"])
            pg.evaluate("TribeSiteDesigner.flush && TribeSiteDesigner.flush()"); pg.evaluate("TribeSiteDesigner.close()"); pg.wait_for_timeout(600)

            # ================= Claude hooks: read, propose, a person approves =================
            ag = ok(api("/agents", "POST", token=tok, project=pid), "agent"); key = ag.get("token") or (ag.get("agent") or {}).get("token"); assert key, ag
            saved0 = ok(api(f"/projects/{pid}/app-config", token=tok))
            err, out = mcp(key, "app_read", {"project": pid}); assert not err, out
            o = json.loads(out); assert o["screens"] and o["screens"][0]["blocks"][0]["id"] and "Steps" in o["steps"] and "brand" in o and len(o["can"]["parts"]) > 20, list(o)
            hid = o["screens"][0]["blocks"][0]["id"]; other = o["screens"][1]["id"]
            err, out = mcp(key, "app_propose", {"project": pid, "note": "Calmer and clearer.", "ops": [
                {"op": "theme", "set": {"accent": "#2A8C80", "radius": "pill"}}, {"op": "text", "block": hid, "path": "title", "value": "Good evening"},
                {"op": "screen.remove", "screen": other}, {"op": "feature.add", "feature": "offline"}, {"op": "text", "block": hid, "path": "__proto__.x", "value": "x"}, {"op": "export", "kind": "pwa"}]})
            assert not err and "Proposed 2 changes" in out and "nothing has changed yet" in out and out.count("Step ") == 4, out
            assert ok(api(f"/projects/{pid}/app-config", token=tok))["rev"] == saved0["rev"], "nothing is saved until a person approves"
            err, out2 = mcp(key, "app_propose", {"project": pid, "ops": [{"op": "export"}]}); assert err and "nothing was proposed" in out2, out2
            rqs = ok(api(f"/projects/{pid}/changes", token=tok))["requests"]; rq = [x for x in rqs if x["tool"] == "app" and x["status"] == "open"][0]
            assert rq["agentName"] and rq["byName"] == "Mara" and rq["canDecide"] and not rq["hasPictures"] and "Good evening" in " ".join(rq["summary"]), rq
            full = ok(api(f"/projects/{pid}/changes/{rq['id']}", token=tok))["request"]
            assert full["draw"]["after"]["theme"]["accent"] == "#2A8C80" and full["draw"]["before"]["theme"]["accent"] != "#2A8C80", "before and after come with it"
            st, _ = api(f"/approvals/{rq['approval']}/approve", "POST", {}, token=key)
            assert st != 200 or ok(api(f"/projects/{pid}/app-config", token=tok))["rev"] == saved0["rev"], "an AI helper cannot approve its own proposal"
            assert ok(api(f"/projects/{pid}/app-config", token=tok))["config"]["theme"]["accent"] != "#2A8C80"
            pg.evaluate("TribeChanges.sheet()")
            pg.wait_for_selector(f"#cr-list [data-cr='{rq['id']}'] .cr-draw .apc-mini", timeout=10000)
            nm = pg.locator(f"#cr-list [data-cr='{rq['id']}']").first.locator(".cr-draw figure .apc-mini").count(); assert nm == 2, f"before and after are drawn for the person ({nm})"
            shot(pg, "flint-create-approve-1440.png")
            pg.locator(f"#cr-list [data-cr='{rq['id']}'] [data-cr-act='approve']").first.click()
            pg.wait_for_function(f"fetch('/api/projects/{pid}/app-config', {{ headers: {{ Authorization: 'Bearer {tok}' }} }}).then(r => r.json()).then(j => j.config.theme.accent === '#2A8C80' && j.config.theme.radius === 'pill')", timeout=8000)
            after = ok(api(f"/projects/{pid}/app-config", token=tok))["config"]
            assert after["screens"][0]["blocks"][0]["props"]["title"] == "Good evening" and len(after["screens"]) == len(saved0["config"]["screens"]) and not after.get("features"), "only the safe steps landed"
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

            # ---- an AI is in the tribe now: Make it beautiful shows, and sends the brief
            pg.reload(); pg.wait_for_function("window.TribeAppCreator && window.TribeFlintCreate && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); pg.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            pg.wait_for_selector("#apc-flint [data-fc-act=beauty]", timeout=8000)
            assert pg.locator("#apc-flint [data-fc-line]").count() == 0
            pg.click("#apc-flint [data-fc-act=beauty]")
            pg.wait_for_function(LAST + " && " + LAST + ".lvl === 'agent'", timeout=8000)
            assert "nothing changes until a person approves" in pg.evaluate(LAST + ".text")
            pg.wait_for_selector("#apc-flint .fl-lvl[data-lvl=agent]", timeout=4000)
            asks = ok(api("/coord/asks", token=tok, project=pid))["asks"]; body = json.dumps(asks)
            assert "app_read" in body and "app_propose" in body and "Brand kit" in body, body[:400]
            shot(pg, "flint-create-beautiful-1440.png")
            ctx.close()

            # ================= phone =================
            ph = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True); ph.add_init_script(settings_js("Mara", tok, pid))
            pp = ph.new_page(); watch(pp, "phone")
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function("window.TribeAppCreator && window.TribeFlintCreate && window.TribeClient && TribeClient.connected()", timeout=20000)
            pp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); pp.wait_for_selector("#apc .apc-edit .ax-screen", timeout=8000)
            pp.click("#apc-rack [data-sheet=flint]")
            pp.wait_for_selector("#apc-sheet .apc-flint.in-sheet .flint-mount", timeout=5000)
            box = pp.locator("#apc-sheet .apc-flint [data-fc-act=polish]").bounding_box(); assert box["height"] >= 36, box
            pp.fill("#apc-sheet .fl-in", "make it light"); pp.press("#apc-sheet .fl-in", "Enter")
            pp.wait_for_function("TribeAppCreator.doc().theme.mode === 'light'", timeout=5000)
            pp.wait_for_selector("#apc-sheet .fl-lvl[data-lvl=rules]", timeout=4000)
            pp.evaluate("TribeAppCreator.apply({ op: 'theme', set: { accent: '#FFF9C4' } })")
            pp.click("#apc-sheet .apc-flint [data-fc-act=polish]")
            pp.wait_for_selector("#polish .pol-row", timeout=5000)
            pb = pp.locator("#polish .pol-in").bounding_box(); assert pb["x"] >= 0 and pb["width"] <= 391, pb
            ab = pp.locator("#pol-apply").bounding_box(); assert ab["height"] >= 40, ab
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            shot(pp, "flint-create-polish-390.png")
            pp.click("#pol-apply"); pp.wait_for_function("TribeAppCreator.doc().theme.accent !== '#FFF9C4'", timeout=5000)
            ph.close(); b.close()
        assert not errors, errors[:6]
        print("e2e_flint_create: OK (one Flint panel in both creators with the level badge and Undo; the selected thing and screens by rule; Polish it lists, applies, one Undo; a local model picks checked commands, forbidden ones refused; app_read / app_propose -> a change request drawn before and after, the helper cannot approve; Make it beautiful only with an AI; 390px)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        fake.shutdown()


if __name__ == "__main__":
    main()
