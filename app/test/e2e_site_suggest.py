"""Suggested changes to the website, drawn from what the tribe said (app/ui/sitesuggest-core.js, sitesuggest.js,
server/sitesuggest.js). The tribe is the context for every part of the design.

  Server (matching and privacy):
    A chat line ("we open Saturday at 9 now"), a task ("Add a contact form to the website"), a doc with a new tagline and
    a quoted fix become suggestions with before/after, the source (who, where, when, a link) and steps that really apply.
    Small talk that happens to hold a time suggests nothing. A DM, a private scratchpad note and a line that looks like a
    key are never read. A guest gets nothing; a spectator and an AI helper cannot dismiss or mark one applied.
    A suggestion the site already carries out is gone; a dismissed one stays gone.
  Browser (the editor):
    The Suggestions tab lists them; Apply is one normal edit (Undo takes it back, and the suggestion returns); Not now
    hides it; Dismiss removes it for everyone. The selected element shows "What the tribe said about this" and, after
    Apply, where its words came from. Flint: "what should we update on the site?" lists them; "apply what we decided"
    applies them as one Undo. A spectator sees "Ask them", which leaves a comment on that section.
    Flint on the selection: "make this bigger", "hide this on phones", "change the opening time to Sunday 10am",
    "make all buttons rounder", "move this up", "undo that".
Usage: python app/test/e2e_site_suggest.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5745 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors = []


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


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def cfg(pg): return pg.evaluate("TribeSiteDesigner.cfg()")
def sel(pg): return pg.evaluate("TribeSiteDesigner.state().sel")


def fr(pg):
    pg.wait_for_timeout(250)
    return next(f for f in pg.frames if f.parent_frame and f.frame_element().get_attribute("id") == "wdz-frame")


def ask(pg, text):
    n = pg.evaluate("TribeSiteDesigner.state().log.length")
    pg.evaluate(f"TribeSiteDesigner.ask({json.dumps(text)})")
    pg.wait_for_function(f"(() => {{ const l = TribeSiteDesigner.state().log; return l.length > {n} + 1 && l[l.length - 1].who === 'flint' && (l[l.length - 1].text || l[l.length - 1].html); }})()", timeout=8000)
    pg.wait_for_timeout(250)
    return pg.evaluate("TribeSiteDesigner.state().log.slice(-1)[0].text")


def shot(pg, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True); pg.wait_for_timeout(500)
        pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))"); pg.screenshot(path=str(out / name))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sg-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pot Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        boot = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap"); host = boot["token"]
        pid = ok(api("/projects", token=host))["projects"][0]["id"]
        me = ok(api("/me", token=host)); mara_id = (me.get("member") or me).get("id")
        def join(name, role="builder"):
            inv = ok(api("/invites", "POST", {"role": role, "hours": 1}, token=host), "invite")["invite"]["code"]
            j = ok(api("/join", "POST", {"code": inv, "name": name}), "join"); return j["token"], (j.get("member") or {}).get("id") or j.get("id")
        sam, sam_id = join("Sam"); spec, _ = join("Dee", "spectator")
        base_cfg = json.loads((ROOT / "app" / "ui" / "sitetpl" / "linkbio.json").read_text())
        ok(api(f"/projects/{pid}/site-config", "PUT", {"config": base_cfg, "base": 0}, token=host, project=pid), "save the site")

        # ---- what the tribe says, in the open
        ok(api("/chat/general", "POST", {"text": "heads up everyone, we open Saturday at 9 now"}, token=sam, project=pid), "chat")
        ok(api("/chat/general", "POST", {"text": "the weather is lovely at 9 today"}, token=sam, project=pid))
        ok(api("/chat/general", "POST", {"text": "my test key is sk-abcdefghijklmnopqrstuvwxyz123456 and the new tagline is: Leaked Tagline"}, token=sam, project=pid))
        ok(api("/tasks", "POST", {"title": "Add a contact form to the website"}, token=host, project=pid), "task")
        ok(api("/docs", "POST", {"title": "Brand notes", "body": "Some thoughts on how we sound.\n\nNew tagline: Pots that outlive the trend.\n\nAlso please change \"4 spots left\" to \"2 spots left\" on the site."}, token=host, project=pid), "doc")
        # ---- and what must never be read: a DM and a private note
        dm = "dm-" + "-".join(sorted([mara_id, sam_id]))
        ok(api(f"/chat/{dm}", "POST", {"text": "between us: we open Sunday at 7 now, and rename the site to Secret Pots"}, token=host), "dm")
        ok(api("/scratch", "PUT", {"notes": [{"text": "private idea: new tagline: My Hidden Idea"}]}, token=host), "scratch")

        d = ok(api(f"/projects/{pid}/site-suggestions", token=host, project=pid), "suggestions")
        S = {s["kind"] + ":" + s["after"]: s for s in d["suggestions"]}
        t = next(s for s in d["suggestions"] if s["kind"] == "time")
        assert t["before"] == "Opens Friday at 10am" and t["after"] == "Opens Saturday at 9am" and t["source"]["who"] == "Sam" and t["source"]["kind"] == "chat" and t["source"]["link"] == "#/chat" and t["source"]["at"], t
        assert t["ops"] == [{"op": "text", "block": t["target"]["block"], "path": "items.0.note", "value": "Opens Saturday at 9am"}], t["ops"]
        add = next(s for s in d["suggestions"] if s["kind"] == "add"); assert add["title"] == "Add a contact form" and add["source"]["kind"] == "task" and add["ops"][0]["type"] == "contact", add
        tag = next(s for s in d["suggestions"] if s["title"] == "Use the new tagline"); assert tag["after"] == "Pots that outlive the trend" and tag["source"]["kind"] == "doc" and tag["source"]["link"].startswith("#/docs/"), tag
        fix = next(s for s in d["suggestions"] if s["title"] == "Change the words"); assert fix["before"] == "4 spots left" and fix["after"] == "2 spots left", fix
        blob = json.dumps(d)
        for secret in ["Sunday at 7", "Secret Pots", "My Hidden Idea", "Leaked Tagline", "sk-abcdefghijklmnop", "between us"]:
            assert secret not in blob, f"{secret!r} came from somewhere private"
        assert not any("weather" in s["source"]["text"] for s in d["suggestions"]), "small talk with a time in it suggests nothing"
        assert len(d["suggestions"]) == 4, [s["title"] for s in d["suggestions"]]
        print("  ok  chat, a task and a doc become suggestions with before, after and their source; a DM, a private note and a key are never read")

        # ---- who may do what
        guest_inv = api("/invites", "POST", {"role": "guest", "hours": 1}, token=host)
        assert api(f"/projects/{pid}/site-suggestions", project=pid)[0] == 401, "members only"
        ds = ok(api(f"/projects/{pid}/site-suggestions", token=spec, project=pid), "a spectator may read")
        assert ds["canEdit"] is False and len(ds["suggestions"]) == 4
        assert api(f"/projects/{pid}/site-suggestions/dismiss", "POST", {"id": fix["id"]}, token=spec, project=pid)[0] == 403, "a spectator cannot dismiss"
        assert api(f"/projects/{pid}/site-suggestions/applied", "POST", {"id": fix["id"]}, token=spec, project=pid)[0] == 403
        ag = api("/agents", "POST", {}, token=host)
        if ag[0] == 200 and ag[1].get("token"):
            assert api(f"/projects/{pid}/site-suggestions/dismiss", "POST", {"id": fix["id"]}, token=ag[1]["token"], project=pid)[0] == 403, "an AI helper cannot answer a suggestion"
        ok(api(f"/projects/{pid}/site-suggestions/dismiss", "POST", {"id": fix["id"]}, token=sam, project=pid), "a builder dismisses")
        d2 = ok(api(f"/projects/{pid}/site-suggestions", token=host, project=pid))
        assert fix["id"] in d2["dismissed"] and not any(s["id"] == fix["id"] for s in d2["suggestions"]) and len(d2["suggestions"]) == 3
        print("  ok  a spectator reads but cannot answer; a dismissed suggestion is gone for everyone")

        # ---- a contact form that delivers into the project (round 2): off until the design points a form at it
        def post_form(fields, pid2=None):
            req = urllib.request.Request(f"{BASE}/api/site-form/{pid2 or pid}", method="POST", data=urllib.parse.urlencode(fields).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
            try:
                with urllib.request.urlopen(req, timeout=20) as r: return r.status, r.read().decode()
            except urllib.error.HTTPError as e: return e.code, e.read().decode()
        assert post_form({"name": "Ann", "message": "hello"})[0] == 404, "a form nobody switched on takes nothing"
        cur = ok(api(f"/projects/{pid}/site-config", token=host, project=pid)); c2 = cur["config"]
        c2["pages"][0]["blocks"].insert(1, {"id": "bform1", "type": "contact", "variant": "form", "props": {"title": "Write to us", "text": "", "email": "", "action": f"{BASE}/api/site-form/{pid}", "button": "Send"}})
        ok(api(f"/projects/{pid}/site-config", "PUT", {"config": c2, "base": cur["rev"]}, token=host, project=pid), "save with the form on")
        st, body = post_form({"name": "Ann <b>", "email": "ann@example.org", "message": "Do you ship to Leeds?\nThanks!", "website": ""})
        assert st == 200 and "Thank you" in body and "<script" not in body
        chat = ok(api("/chat/general", token=host, project=pid)); texts = [m.get("text", "") for m in (chat.get("messages") or chat if isinstance(chat, dict) else chat)]
        hit = [t for t in texts if "From the website form" in t]; assert len(hit) == 1 and "Ann" in hit[0] and "ann@example.org" in hit[0] and "Do you ship to Leeds?" in hit[0] and "<b>" not in hit[0], hit
        assert post_form({"name": "Bot", "message": "buy now", "website": "http://spam.example"})[0] == 200   # the hidden field was filled: same answer, nothing kept
        assert post_form({"message": "a http://a.example b http://b.example c http://c.example d http://d.example"})[0] == 200
        assert post_form({"email": "not-an-email", "message": "x"})[0] in (400, 429) and post_form({"message": "x" * 9000})[0] in (413, 429)
        chat = ok(api("/chat/general", token=host, project=pid)); texts = [m.get("text", "") for m in (chat.get("messages") or chat if isinstance(chat, dict) else chat)]
        assert len([t for t in texts if "From the website form" in t]) == 1, "bots, link floods and bad input add nothing"
        ok(api(f"/projects/{pid}/site-config", "PUT", {"config": base_cfg, "base": ok(api(f"/projects/{pid}/site-config", token=host, project=pid))["rev"]}, token=host, project=pid), "back to the plain design")
        assert post_form({"name": "Ann", "message": "hello"})[0] in (404, 429)   # off again, or the per-minute limit said no first
        print("  ok  a contact form delivers into the project's chat only when switched on; a hidden field, link floods and bad input are dropped")

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", host, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeSiteDesigner && window.TribeSiteSuggest && TribeClient.connected()", timeout=20000)
            pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); pg.wait_for_selector("#wdz:not([hidden]) #wdz-frame")
            pg.wait_for_function("document.querySelector('#wdz-sn') && !document.querySelector('#wdz-sn').hidden && document.querySelector('#wdz-sn').textContent === '3'", timeout=8000)
            assert "could change the site" in pg.inner_text("[data-flctx=designer] .fl-thread"), "Flint says so once, without changing anything"
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["note"] == "Opens Friday at 10am"
            pg.click("[data-panel=ideas]"); pg.wait_for_selector("#wdz-insp .sg", timeout=5000)
            assert pg.locator("#wdz-insp .sg").count() == 3
            card = pg.locator("#wdz-insp .sg", has_text="Update when you open")
            assert "Opens Friday at 10am" in card.locator("del").inner_text() and "Opens Saturday at 9am" in card.locator("ins").inner_text() and "Sam" in card.locator(".sg-src").inner_text() and "in chat" in card.locator(".sg-src").inner_text()
            shot(pg, "site-editor2-suggestions-1440.png")

            # Apply: one normal edit; Undo takes it back and the suggestion returns
            card.locator("[data-sg=apply]").click()
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[0].note === 'Opens Saturday at 9am'", timeout=4000)
            pg.wait_for_function("document.querySelectorAll('#wdz-insp .sg').length === 2", timeout=4000)
            assert "Opens Saturday at 9am" in fr(pg).locator("small[data-e]").first.inner_text() and sel(pg)["path"] == "items.0.note"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(400); pg.click("[data-panel=ideas]")
            pg.wait_for_function("document.querySelectorAll('#wdz-insp .sg').length === 3", timeout=4000)
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["note"] == "Opens Friday at 10am"
            pg.evaluate("TribeSiteDesigner.redo()"); pg.wait_for_timeout(400)
            print("  ok  Apply is one edit with its source; Undo takes it back and the suggestion returns")

            # the element remembers: what was said about it, and where its words came from
            f = fr(pg); f.locator("small[data-e]").first.click()
            pg.wait_for_function("document.querySelector('#wdz-said') && /What the tribe said about this/.test(document.querySelector('#wdz-said').textContent)", timeout=5000)
            said = pg.inner_text("#wdz-said"); assert "Sam" in said and "we open Saturday at 9 now" in said and "Changed to" in said, said
            shot(pg, "site-editor2-said-1440.png")
            # Not now hides one for this visit
            pg.click("[data-panel=ideas]"); pg.locator("#wdz-insp .sg", has_text="tagline").locator("[data-sg=later]").click()
            pg.wait_for_function("document.querySelectorAll('#wdz-insp .sg').length === 1", timeout=4000)
            print("  ok  the selected words show what the tribe said about them and where they came from; Not now hides a suggestion")

            # Flint: ask, then apply what was decided (one Undo)
            out = ask(pg, "what should we update on the site?")
            assert "add a contact form" in out.lower() and "Suggestions" in out, out
            n_blocks = len(cfg(pg)["pages"][0]["blocks"])
            out = ask(pg, "apply what we decided in chat")
            assert "Applied 1 thing" in out and "contact form" in out, out
            assert len(cfg(pg)["pages"][0]["blocks"]) == n_blocks + 1 and any(x["type"] == "contact" for x in cfg(pg)["pages"][0]["blocks"])
            out = ask(pg, "undo that"); assert len(cfg(pg)["pages"][0]["blocks"]) == n_blocks, out
            out = ask(pg, "what should we update on the site?"); assert "contact form" in out.lower()
            print("  ok  Flint lists what the tribe said and applies it as one Undo")

            # Flint on what is selected
            f = fr(pg); f.locator("small[data-e]").first.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'text'")
            out = ask(pg, "make this bigger"); assert "large" in out, out
            assert cfg(pg)["pages"][0]["blocks"][0]["es"]["items.0.note"]["sz"] == "l" and sel(pg)["path"] == "items.0.note", "the selection stays"
            out = ask(pg, "hide this on phones"); assert "phones" in out, out
            assert cfg(pg)["pages"][0]["blocks"][0]["es"]["items.0.note"]["hide"] == "phone"
            out = ask(pg, "show this on phones again"); assert "every screen size" in out, out
            out = ask(pg, "change the opening time to Sunday 10am"); assert "Opens Sunday at 10am" in out, out
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["note"] == "Opens Sunday at 10am"
            out = ask(pg, "change this to Opens soon"); assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["note"] == "Opens soon", out
            first = cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["label"]
            out = ask(pg, "move this down"); assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][1]["label"] == first and sel(pg)["path"] == "items.1.note", out
            out = ask(pg, "undo that"); assert cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["label"] == first, out
            out = ask(pg, "make all buttons rounder"); assert cfg(pg)["theme"].get("btn") == "pill", out
            fr(pg).locator("small[data-e]").first.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).path === 'items.0.note'")
            out = ask(pg, "make this bold"); assert cfg(pg)["pages"][0]["blocks"][0]["es"]["items.0.note"].get("b") == 1, out
            print("  ok  Flint acts on the selection: bigger, phones, the opening time, new words, move, every button, bold, undo")

            # a spectator asks instead of applying
            pg.evaluate("TribeSiteDesigner.flush()"); pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=8000)
            c2 = b.new_context(viewport={"width": 1280, "height": 860}); c2.add_init_script(settings_js("Dee", spec, pid))
            dee = c2.new_page(); watch(dee, "dee")
            dee.goto(BASE + "/?skipIntro=1"); dee.wait_for_function("window.TribeSiteDesigner && TribeClient.connected()", timeout=20000)
            dee.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); dee.wait_for_selector("#wdz:not([hidden]) #wdz-frame"); dee.wait_for_timeout(1200)
            dee.click("[data-panel=ideas]"); dee.wait_for_selector("#wdz-insp .sg", timeout=6000)
            assert dee.locator("#wdz-insp [data-sg=apply]").count() == 0 and dee.locator("#wdz-insp [data-sg=ask]").count() >= 1 and dee.locator("#wdz-insp [data-sg=dismiss]").count() == 0
            before = len(ok(api(f"/projects/{pid}/site-comments", token=host, project=pid))["comments"])
            dee.locator("#wdz-insp [data-sg=ask]").first.click()
            dee.wait_for_function("/Asked/.test(document.querySelector('[data-flctx=designer] .fl-thread').textContent)", timeout=5000)
            cs = ok(api(f"/projects/{pid}/site-comments", token=host, project=pid))["comments"]
            assert len(cs) == before + 1 and cs[-1]["text"].startswith("Suggestion:"), cs[-1]
            print("  ok  someone who cannot change the site asks instead: a comment on that section for the builders")
            b.close()
        assert not errors, errors
        print("e2e_site_suggest: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
