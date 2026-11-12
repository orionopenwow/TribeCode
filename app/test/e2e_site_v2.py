"""Website designer v2 (feat/site-v2): Flint's website asks, the gallery, imported templates, auto-populate, comments ->
tasks, the Website row, and autosave.

  "link tree website" works from Flint's main chat in a project, from Home with no tribe, and opens the designer with the
  link-in-bio template (never the old repo build); in the project it is filled from the project.
  The gallery: 40+ templates with WebP thumbnails, category filter, search, Peek (a live preview) and Use this. An
  imported open-source template (Start Bootstrap, MIT) opens as blocks, takes an edit from Flint and exports; an HTML5 UP
  one (CC BY 3.0) carries its credit line in the export.
  Auto-populate: picking a template in a project fills the project name, opening hours from chat and the members, says
  what it used, and "Start blank instead" takes it back.
  Comments: comment mode, click a section, write; pins in the preview and a list; after three, Flint suggests tasks;
  "Flint, turn these into tasks" makes one task per section; marking the task done resolves its comments.
  The Website row appears in the project's sidebar once a draft exists, and opens the designer.
  Autosave: type in the preview, switch to Chat and back: the words are there; type and reload at once: still there.
  Server: versioned saves answer 409 to a stale rev; a second member's comment shows up for the first.
Usage: python app/test/e2e_site_v2.py [--shots]   (--shots writes docs/screenshots/site-gallery-v2.png, site-comments.png, site-autofill.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5530 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
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
    server = f"server:{{url:'{BASE}', token:'{token}'}}, " if token else ""
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', {server}checklist:{{setup:true}}, tour:{{done:true}}}}));"
            + (f"localStorage.setItem('tribecode.project:{BASE}', '{pid}');" if pid else "") + " } catch (e) {}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "401" not in m.text and errors.append(f"{who} console: {m.text}"))


def dask(page, text):
    n = page.evaluate("TribeSiteDesigner.state().log.length")
    page.fill("#wdz-in", text)
    page.press("#wdz-in", "Enter")
    page.wait_for_function("n => TribeSiteDesigner.state().log.length >= n + 2", arg=n, timeout=15000)
    page.wait_for_timeout(250)
    return page.locator("#wdz-log > *").last.inner_text()


def cfg(page): return page.evaluate("TribeSiteDesigner.cfg()")
def blocks(c): return c["pages"][0]["blocks"]


def flint_chat(page, text):
    """Flint's main chat (app/ui/flint.js), as typed."""
    page.wait_for_function("window.TribeFlint && TribeFlint.ask", timeout=15000)
    page.evaluate("t => TribeFlint.ask(t)", text)


def shot(page, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(700)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(out / name))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sv2-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Corner Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        ok(api(f"/projects/{pid}", "PATCH", {"name": "Ember Café", "bio": "Coffee, cake and a big table by the window."}, token=tok, project=pid), "project bio")
        for t in ["Reminder for the website: we're open mon-fri 8am-4pm and sat 9am-2pm, closed sundays", "our insta is https://instagram.com/embercafe", "email hello@ember.cafe for bookings"]:
            ok(api("/chat/general", "POST", {"text": t}, token=tok, project=pid), "chat")

        # ---- server: the gallery, an imported template, facts, versioned saves
        tl = ok(api("/site-designer/templates", token=tok))["templates"]
        assert len(tl) >= 40, len(tl)
        lic = {t.get("license") for t in tl}
        assert {"MIT", "CC BY 3.0"} <= lic, lic
        ag = ok(api("/site-designer/template/sb-agency", token=tok))["config"]
        assert [b["type"] for b in blocks(ag)][:2] == ["hero", "features"] and ag["template"] == "sb-agency", [b["type"] for b in blocks(ag)]
        facts = ok(api(f"/projects/{pid}/site-autofill", token=tok, project=pid))["facts"]
        assert facts["name"] == "Ember Café" and any(h["d"] == "Mon–Fri" for h in facts.get("hours", [])), facts
        assert facts.get("email") == "hello@ember.cafe" and facts.get("members"), facts

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ======== Home with no tribe: Flint's chat, the gallery, an imported template, export ========
            solo = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); solo.add_init_script(settings_js("Sol", "", ""))
            sp = solo.new_page(); watch(sp, "solo")
            sp.goto(BASE + "/?skipIntro=1")
            sp.wait_for_function("window.TribeSiteDesigner && window.TribeFlintLocal && window.TribeNLU", timeout=20000)
            assert not sp.evaluate("TribeClient.connected && TribeClient.connected() && TribeClient.hasToken && TribeClient.hasToken()"), "no tribe here"
            flint_chat(sp, "link tree website")
            sp.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().template === 'linkbio'", timeout=15000)
            c = cfg(sp)
            assert blocks(c)[0]["type"] == "links" and blocks(c)[0]["props"]["items"], "the link-in-bio template with its links (no tribe needed)"
            assert blocks(c)[0]["props"]["img"].startswith("data:image/"), "its picture is inside"
            sp.click("[data-wdz='templates']")
            sp.wait_for_function("document.querySelectorAll('#wdz-gal .wdz-tpl').length >= 40", timeout=10000)
            sp.wait_for_function("[...document.querySelectorAll('#wdz-gal .wdz-tpl img')].slice(0, 8).every(i => i.complete && i.naturalWidth > 100)", timeout=10000)
            assert sp.evaluate("document.querySelector('#wdz-gal .wdz-tpl img').src").endswith(".webp")
            n_all = sp.locator("#wdz-gal .wdz-tpl").count()
            sp.click("#wdz-gcats [data-gcat='Link in bio']")
            n_lb = sp.locator("#wdz-gal .wdz-tpl").count()
            assert 2 <= n_lb < n_all, (n_lb, n_all)
            sp.click("#wdz-gcats [data-gcat='All']")
            sp.fill("#wdz-gq", "bakery")
            sp.wait_for_timeout(200)
            titles = sp.locator("#wdz-gal .wdz-tpl b").all_inner_texts()
            assert 1 <= len(titles) < n_all, titles
            sp.fill("#wdz-gq", "agency")
            sp.wait_for_timeout(200)
            sp.click("#wdz-gal [data-peek='sb-agency']")
            sp.wait_for_function("(() => { const f = document.querySelector('#wdz-peek:not([hidden]) iframe'); return f && f.srcdoc.length > 2000; })()", timeout=10000)
            sp.click("#wdz-peek [data-peekclose]")
            sp.fill("#wdz-gq", "")
            sp.wait_for_timeout(200)
            if SHOTS: sp.evaluate("document.querySelector('#wdz-gal .wdz-tpl:nth-child(5)').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))"); shot(sp, "site-gallery-v2.png")
            sp.click("#wdz-gal .wdz-tpl[data-tpl='sb-agency'] [data-tpl='sb-agency']")
            sp.wait_for_function("TribeSiteDesigner.cfg().template === 'sb-agency'", timeout=10000)
            before = blocks(cfg(sp))[0]["props"]["title"]
            out = dask(sp, "change the headline to Posters for every shop on the street")
            assert blocks(cfg(sp))[0]["props"]["title"] == "Posters for every shop on the street", out
            out = dask(sp, "add a newsletter signup")
            assert any(x["type"] == "newsletter" for x in blocks(cfg(sp))), out
            out = dask(sp, "hide the newsletter")
            assert any(x["type"] == "newsletter" and x.get("hidden") for x in blocks(cfg(sp))), out
            html = sp.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg())['index.html']")
            assert "Posters for every shop on the street" in html and "Get the next update" not in html and "<script" not in html, "export: the edit, no hidden block, no scripts"
            # an HTML5 UP template keeps its credit in the export
            sp.evaluate("TribeSiteDesigner.useTemplate('h5-identity')")
            sp.wait_for_function("TribeSiteDesigner.cfg().template === 'h5-identity'", timeout=10000)
            html = sp.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg())['index.html']")
            assert "HTML5 UP" in html and "CC BY 3.0" in html, "CC BY credit in the footer"
            # autosave with no tribe: reload at once, the local draft is back
            sp.evaluate("TribeSiteDesigner.useTemplate('sb-agency')")
            sp.wait_for_function("TribeSiteDesigner.cfg().template === 'sb-agency'", timeout=10000)
            dask(sp, "change the headline to Kept on this device")
            sp.reload(); sp.wait_for_function("window.TribeSiteDesigner", timeout=15000)
            sp.evaluate("TribeSiteDesigner.open({})"); sp.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=10000)
            assert blocks(cfg(sp))[0]["props"]["title"] == "Kept on this device", "the local draft survives a reload"
            solo.close()

            # ======== a project in a tribe: Flint's chat, auto-populate, the Website row ========
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1#/chat/general")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeClient && TribeClient.connected()", timeout=20000)
            assert pg.locator("#nest-website").count() == 0, "no Website row before a draft exists"
            flint_chat(pg, "make me a link tree website")
            pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open && TribeSiteDesigner.cfg().template === 'linkbio'", timeout=15000)
            c = cfg(pg)
            assert c["name"] == "Ember Café" and blocks(c)[0]["props"]["name"] == "Ember Café", "filled from the project"
            assert any("instagram.com/embercafe" in (i["link"].get("to") or "") for i in blocks(c)[0]["props"]["items"]), "a link from chat"
            pg.wait_for_selector("#wdz-fill:not([hidden])", timeout=5000)
            assert "Filled from your project" in pg.inner_text("#wdz-fill")
            assert not pg.evaluate("document.body.innerText.includes('Failed to fetch')"), "no fetch failure"
            # a café-style template: hours from chat and the members
            pg.evaluate("TribeSiteDesigner.useTemplate('sb-agency')")
            pg.wait_for_function("TribeSiteDesigner.cfg().template === 'sb-agency'", timeout=10000)
            c = cfg(pg); types = [x["type"] for x in blocks(c)]
            hrs = [x for x in blocks(c) if x["type"] == "list" and "hour" in x["props"]["title"].lower()]
            assert hrs and any(i["title"] == "Mon–Fri" and i["meta"] == "8am–4pm" for i in hrs[0]["props"]["items"]), types
            team = [x for x in blocks(c) if x["type"] == "team"]
            assert team and any(i["name"] == "Mara" for i in team[0]["props"]["items"]), "the members"
            note = pg.inner_text("#wdz-fill")
            assert "hours" in note and "member" in note and "name" in note, note
            shot(pg, "site-autofill.png")
            pg.click("#wdz-fill [data-fill='blank']")
            pg.wait_for_function("!TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.type === 'list' && /hour/i.test(b.props.title || ''))", timeout=5000)
            assert cfg(pg)["name"] != "Ember Café", "Start blank instead: the template as it is"
            pg.evaluate("TribeSiteDesigner.undo()")
            pg.wait_for_function("TribeSiteDesigner.cfg().name === 'Ember Café'", timeout=5000)
            pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=8000)
            # the Website row appears and opens the designer
            pg.click("[data-wdz='close']")
            pg.wait_for_selector("#nest-website", timeout=10000)
            pg.click("#nest-website")
            pg.wait_for_function("TribeSiteDesigner.state().open", timeout=8000)

            # ---- autosave: type in the preview, switch to Chat at once, come back
            fr = pg.frame_locator("#wdz-frame")
            h = fr.locator("h1[data-e]").first
            h.click(); pg.keyboard.press("Control+A"); pg.keyboard.type("Typed then tabbed away")
            pg.click("[data-wdz='close']")   # leaves mid-edit (no blur commit by hand)
            pg.evaluate("location.hash = '#/chat/general'")
            pg.wait_for_timeout(300)
            pg.evaluate("TribeSiteDesigner.open({})")
            pg.wait_for_function("TribeSiteDesigner.state().open", timeout=8000)
            assert blocks(cfg(pg))[0]["props"]["title"] == "Typed then tabbed away", blocks(cfg(pg))[0]["props"]["title"]
            # type and reload at once
            fr = pg.frame_locator("#wdz-frame"); pg.wait_for_timeout(400)
            h = fr.locator("h1[data-e]").first
            h.click(); pg.keyboard.press("Control+A"); pg.keyboard.type("Typed then reloaded")
            pg.reload()
            pg.wait_for_function("window.TribeSiteDesigner && TribeClient.connected()", timeout=20000)
            pg.evaluate("TribeSiteDesigner.open({})")
            pg.wait_for_function("TribeSiteDesigner.state() && TribeSiteDesigner.state().open", timeout=10000)
            assert blocks(cfg(pg))[0]["props"]["title"] == "Typed then reloaded", blocks(cfg(pg))[0]["props"]["title"]
            pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=10000)
            srv_cfg = ok(api(f"/projects/{pid}/site-config", token=tok))
            assert blocks(srv_cfg["config"])[0]["props"]["title"] == "Typed then reloaded", "the host has it too"
            pg.wait_for_function("document.querySelector('#wdz-saved').textContent.startsWith('Saved')", timeout=8000)
            # a stale save is refused (conflict-safe), and the designer offers Keep both
            st, d = api(f"/projects/{pid}/site-config", "PUT", {"config": {**srv_cfg["config"], "name": "Stale"}, "base": srv_cfg["rev"] - 1}, token=tok)
            assert st == 409 and d.get("conflict"), (st, d)
            ok(api(f"/projects/{pid}/site-config", "PUT", {"config": {**srv_cfg["config"], "name": "Ember Café · from the phone"}, "base": srv_cfg["rev"]}, token=tok))
            dask(pg, "change the headline to Mine from the laptop")
            pg.wait_for_selector("#wdz-conflict:not([hidden]) [data-cf='both']", timeout=8000)
            pg.click("#wdz-conflict [data-cf='both']")
            pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=8000)
            assert blocks(ok(api(f"/projects/{pid}/site-config", token=tok))["config"])[0]["props"]["title"] == "Mine from the laptop"
            vs = ok(api(f"/projects/{pid}/website/versions", token=tok))["saved"]
            assert any("Their version" in (v.get("note") or "") for v in vs), "theirs is on the Saved shelf"

            # ---- comments -> tasks -> resolve
            pg.click("[data-wdz='comment']")
            assert pg.evaluate("TribeSiteDesigner.state().cmode")
            fr = pg.frame_locator("#wdz-frame"); pg.wait_for_timeout(400)
            for i, text in enumerate(["Make this bigger", "Wrong photo here", "Hours are wrong on Saturday"]):
                target = fr.locator("[data-block]").nth(0 if i < 2 else 1)
                target.click(position={"x": 200 + 40 * i, "y": 30})
                pg.wait_for_selector("#wdz-cpop:not([hidden]) textarea", timeout=5000)
                pg.fill("#wdz-ctext", text); pg.click("#wdz-cform [type=submit]")
                pg.wait_for_function("n => TribeSiteDesigner.comments().length >= n", arg=i + 1, timeout=5000)
            fr.locator(".wdz-pin").first.wait_for(timeout=5000)
            assert fr.locator(".wdz-pin").count() == 3, "three pins"
            assert pg.locator(".wdz-clist .wdz-c").count() == 3
            assert "turn them into tasks" in pg.inner_text("#wdz-log"), "Flint suggests tasks after 3 comments"
            shot(pg, "site-comments.png")
            # a teammate sees them too (server)
            assert len(ok(api(f"/projects/{pid}/site-comments", token=tok))["comments"]) == 3
            pg.locator("#wdz-insp [data-cact='tasks']").first.click()
            pg.wait_for_function("TribeSiteDesigner.comments().every(c => c.status === 'tasked')", timeout=10000)
            tasks = [t for t in ok(api("/tasks", token=tok, project=pid))["tasks"] if t.get("site")]
            assert len(tasks) == 2 and all(t["title"].startswith("Website ·") for t in tasks), [t["title"] for t in tasks]
            big = [t for t in tasks if len(t["site"]["comments"]) == 2][0]
            assert "Make this bigger" in big["body"] and big["site"]["block"], big
            ok(api(f"/tasks/{big['id']}", "PATCH", {"status": "done"}, token=tok, project=pid), "task done")
            cs = ok(api(f"/projects/{pid}/site-comments", token=tok))["comments"]
            assert sorted(c["status"] for c in cs) == ["resolved", "resolved", "tasked"], [c["status"] for c in cs]
            # the website preview's Comment button opens the designer in comment mode (same comments, same tasks)
            pg.click("[data-wdz='close']")
            pg.evaluate("TribeSiteDesigner.open({ comment: true })")
            pg.wait_for_function("TribeSiteDesigner.state().open && TribeSiteDesigner.state().cmode", timeout=8000)
            # Flint's words for it from the main chat too
            pg.click("[data-wdz='close']")
            flint_chat(pg, "add our opening hours to the website")
            pg.wait_for_function("TribeSiteDesigner.state().open", timeout=10000)
            # phone: no sideways scroll in the designer
            pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(400)
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll on a phone"
            ctx.close(); b.close()
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("e2e_site_v2: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
