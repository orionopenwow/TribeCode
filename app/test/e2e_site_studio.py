"""The website designer's whole-site tools (app/ui/sitestudio.js, brandkit.js, sitecfg.js, server/sitedesign.js).

  Style: one tap on a look, an accent, a font pair, the corners or the spacing restyles the whole site (one undo step each).
  Brand kit: "Save as my brand kit" keeps the site's logo, colours and fonts on the host; the canvas reads the same record.
  Check my site: lists what is wrong in plain words (dead buttons, missing picture descriptions, no description for
  search, sections with nothing in them), each safe one with a one-tap fix; "Fix what is safe" does them all, one undo.
  In the preview: every section has a small bar (move up/down, duplicate, add below, remove) and a grip to drag it.
  Have my agent do it: an agent reads the site (site_read) and proposes steps (site_propose) over MCP; nothing changes
  until the person taps Apply; Undo takes it back; an agent cannot approve its own proposal. Unsafe steps are skipped.
  Exported pages: no sideways scroll at 390px. No console errors.
Usage: python app/test/e2e_site_studio.py [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5490 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
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


def cfg(page):
    return page.evaluate("TribeSiteDesigner.cfg()")


def blocks(page):
    return page.evaluate("(() => { const s = TribeSiteDesigner.state(), c = TribeSiteDesigner.cfg(); return (c.pages.find(p => p.id === s.page) || c.pages[0]).blocks.map(b => b.id); })()")


def shot(page, name):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(500)
        page.screenshot(path=str(Path(SHOTS) / name))


def tab(page, name):
    page.click(f".wdz-ptabs [data-panel={name}]")
    page.wait_for_timeout(250)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-stu-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Studio Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]

        # ---- one brand record: what the older route saved is the kit, and the kit answers the older route
        ok(api(f"/projects/{pid}/website/brand", "PUT", {"primary": "#112233", "wordmark": "Old Co", "font": "grotesk"}, token=tok), "old brand route")
        k0 = ok(api(f"/projects/{pid}/brand", token=tok))["kit"]
        assert k0["colors"]["accent"] == "#112233" and k0["name"] == "Old Co" and k0["fonts"]["display"] == "Space Grotesk", k0
        ok(api(f"/projects/{pid}/brand", "PUT", {"kit": {**k0, "colors": {**k0["colors"], "accent": "#445566"}, "voice": "Dry"}}, token=tok), "kit route")
        old = ok(api(f"/projects/{pid}/website/brand", token=tok))["brand"]
        assert old["primary"] == "#445566" and old["wordmark"] == "Old Co" and old["font"] == "grotesk" and old["kit"]["voice"] == "Dry", old
        ok(api(f"/projects/{pid}/website/brand", "PUT", {"primary": "#778899"}, token=tok))
        k1 = ok(api(f"/projects/{pid}/brand", token=tok))["kit"]
        assert k1["colors"]["accent"] == "#778899" and k1["voice"] == "Dry", "a change through the older route keeps the rest of the kit"

        # ---- the model, with no browser: a change list is checked step by step, and Check my site finds real problems
        out = subprocess.run(["node", "-e", """
const S = require('./app/ui/sitecfg.js');
let c = S.fromTemplate('cafe', require('./templates/sites/cafe/site.json'), () => '');
const b0 = c.pages[0].blocks[0];
const r = S.applyOps(c, [
  { op: 'text', block: b0.id, path: 'title', value: 'Hello there' },
  { op: 'text', block: b0.id, path: '__proto__.x', value: 'no' },
  { op: 'text', block: b0.id, path: 'img', value: 'https://evil.example/x.png' },
  { op: 'add', type: 'steps', props: { title: 'How it works', img: 'javascript:alert(1)' } },
  { op: 'add', type: 'nope' },
  { op: 'accent', color: '#0b7285' },
  { op: 'fonts', pair: 'nope' },
]);
const iss = S.check(S.applyOps(c, [{ op: 'seo', description: '' }]).cfg);
console.log(JSON.stringify({ done: r.done.length, skipped: r.skipped.length, title: r.cfg.pages[0].blocks[0].props.title, same: c.pages[0].blocks[0].props.title !== 'Hello there',
  accent: r.cfg.theme.colors.accent, added: r.cfg.pages[0].blocks.some(b => b.type === 'steps' && !b.props.img), ids: iss.map(i => i.id.split(':')[0]), fixes: iss.filter(i => i.fix).length,
  out: Object.keys(S.outline(c)) }));
"""], cwd=str(ROOT), capture_output=True, text=True)
        assert out.returncode == 0, out.stderr
        m = json.loads(out.stdout)
        assert m["done"] == 3 and m["skipped"] == 4 and m["title"] == "Hello there" and m["same"] and m["accent"].lower() == "#0b7285" and m["added"], m
        assert "pages" in m["out"] and "theme" in m["out"], m

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1#/docs/website")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeSiteStudio && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.wait_for_selector("#wb-design", timeout=15000)
            pg.click("#wb-design")
            pg.wait_for_selector("#wdz:not([hidden]) #wdz-start:not([hidden]) .wdz-tpl", timeout=10000)
            pg.click("#wdz-start .wdz-tpl[data-tpl=cafe]")
            pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages.length >= 1 && document.querySelector('#wdz-start').hidden", timeout=10000)
            pg.wait_for_timeout(600)

            # ---- Style: the whole site in one tap, each an undo step
            tab(pg, "style")
            pg.wait_for_selector("[data-stu=look]", timeout=5000)
            assert pg.locator("[data-stu=look]").count() >= 6 and pg.locator("[data-stu=accent]").count() >= 8 and pg.locator("[data-stu=fonts]").count() >= 4
            shot(pg, "studio-style-1440.png")
            before = cfg(pg)["theme"]
            pg.locator("[data-stu=look][aria-pressed=false]").first.click(); pg.wait_for_timeout(300)
            t1 = cfg(pg)["theme"]
            assert t1["preset"] != before["preset"] and t1["colors"] != before["colors"], "a look changes the colours"
            pg.locator("[data-stu=accent]").nth(3).click(); pg.wait_for_timeout(300)
            want = pg.locator("[data-stu=accent]").nth(3).get_attribute("data-val")
            assert cfg(pg)["theme"]["colors"]["accent"].lower() == want.lower(), "accent"
            fr = pg.frame_locator("#wdz-frame")
            pg.wait_for_timeout(400)
            assert fr.locator("html").evaluate("e => getComputedStyle(e).getPropertyValue('--accent').trim().toLowerCase()") == want.lower(), "the preview shows the new accent"
            pg.locator("[data-stu=fonts][aria-pressed=false]").first.click(); pg.wait_for_timeout(300)
            assert cfg(pg)["theme"]["fonts"] != t1["fonts"], "fonts"
            pg.locator("[data-stu=space][data-val=roomy]").click(); pg.wait_for_timeout(200)
            assert cfg(pg)["theme"]["space"] == "roomy"
            pg.locator("[data-stu=radius][aria-pressed=false]").first.click(); pg.wait_for_timeout(200)
            for _ in range(5): pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(120)
            assert cfg(pg)["theme"] == before, "five Undos bring the first look back"
            pg.locator("[data-stu=accent]").nth(3).click(); pg.wait_for_timeout(300)

            # ---- Brand kit: saved on the host, one record
            pg.click("[data-stu=kit-save]"); pg.wait_for_timeout(600)
            kit = ok(api(f"/projects/{pid}/brand", token=tok))["kit"]
            assert kit["colors"]["accent"].lower() == want.lower() and kit["fonts"]["display"], kit
            assert pg.evaluate("pid => TribeBrandKit.colors(TribeBrandKit.cached(pid)).length >= 3", pid), "the canvas reads the same kit"
            pg.fill("#stu-voice", "Warm and plain"); pg.press("#stu-voice", "Tab"); pg.wait_for_timeout(500)
            assert ok(api(f"/projects/{pid}/brand", token=tok))["kit"]["voice"] == "Warm and plain", "how we sound is part of the kit"
            assert pg.locator("[data-stu=fonts][data-val=elegant]").count() == 1 and pg.locator("[data-stu=fonts][data-val=friendly]").count() == 1, "the two new font pairs"
            assert ok(api(f"/projects/{pid}/website/brand", token=tok))["brand"]["primary"].lower() == want.lower(), "the project page uses the same colour"
            assert api(f"/projects/{pid}/brand")[0] == 401, "members only"

            # ---- Check my site: plain problems, one-tap fixes, one undo
            # break two things on purpose: an unlinked button and no description for search
            pg.evaluate("""(() => { const S = TribeSiteCfg, c = TribeSiteDesigner.cfg(); const hero = c.pages[0].blocks.find(b => (b.props.buttons || []).length);
              const r = S.applyOps(c, [{ op: 'seo', description: '' }]); const h = r.cfg.pages[0].blocks.find(b => b.id === hero.id); h.props.buttons[0].link = null; h.props.buttons[0].label = 'Menu'; TribeSiteDesigner.importCfg(r.cfg, "test"); })()""")
            pg.wait_for_timeout(300)
            tab(pg, "check")
            pg.click("[data-stu=check]")
            pg.wait_for_selector(".stu-issue", timeout=8000)
            txt = pg.inner_text("#wdz-insp")
            assert "description" in txt.lower() and pg.locator("[data-stu=fix]").count() >= 1, txt
            shot(pg, "studio-check-1440.png")
            n0 = pg.locator(".stu-issue").count()
            pg.click("[data-stu=fixall]"); pg.wait_for_timeout(700)
            c2 = cfg(pg)
            hero = next(x for x in c2["pages"][0]["blocks"] if x["props"].get("buttons"))
            assert hero["props"]["buttons"][0].get("link"), "the Menu button now goes to the menu"
            assert (c2.get("seo") or {}).get("description"), "a description for search was written from the site's own words"
            pg.wait_for_selector("[data-stu=check]", timeout=5000)
            assert pg.locator(".stu-issue").count() < n0, "fixed problems leave the list"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(200)
            assert not (cfg(pg).get("seo") or {}).get("description"), "one Undo takes every fix back"
            pg.evaluate("TribeSiteDesigner.redo()"); pg.wait_for_timeout(200)

            # ---- in the preview: the section bar
            tab(pg, "edit")
            ids = blocks(pg)
            fr = pg.frame_locator("#wdz-frame")
            fr.locator(f"[data-block='{ids[1]}']").hover(position={"x": 40, "y": 20})
            fr.locator(".wdz-bar [data-a=down]").click(); pg.wait_for_timeout(400)
            assert blocks(pg)[2] == ids[1], "down moves the section"
            fr.locator(f"[data-block='{ids[1]}']").hover(position={"x": 40, "y": 20})
            fr.locator(".wdz-bar [data-a=dup]").click(); pg.wait_for_timeout(400)
            assert len(blocks(pg)) == len(ids) + 1, "duplicate"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(300)
            # drag the grip of the third section above the first
            ids = blocks(pg)
            fr.locator(f"[data-block='{ids[2]}']").hover(position={"x": 40, "y": 20})
            grip = fr.locator(".wdz-bar [data-a=grip]")
            gb = grip.bounding_box()
            pg.mouse.move(gb["x"] + gb["width"] / 2, gb["y"] + gb["height"] / 2); pg.mouse.down()
            fb = pg.locator("#wdz-frame").bounding_box()
            for y in (gb["y"] - 40, fb["y"] + 40, fb["y"] + 12, fb["y"] + 12, fb["y"] + 12, fb["y"] + 12):
                pg.mouse.move(gb["x"], y, steps=4); pg.wait_for_timeout(120)
            if SHOTS: shot(pg, "studio-drag-1440.png")
            pg.mouse.up(); pg.wait_for_timeout(500)
            after = blocks(pg)
            assert after.index(ids[2]) < 2 and sorted(after) == sorted(ids), f"dragging the grip moves the section up: {ids} -> {after}"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(300)
            assert blocks(pg) == ids, "and Undo puts it back"
            # add below: the picker opens and the new section lands under the one whose + was pressed
            fr.locator(f"[data-block='{ids[0]}']").hover(position={"x": 40, "y": 20})
            fr.locator(".wdz-bar [data-a=add]").click()
            pg.wait_for_selector("#wdz-picker:not([hidden]) [data-add=steps]", timeout=5000)
            pg.locator("#wdz-picker [data-add=steps]").first.click(); pg.wait_for_timeout(400)
            c3 = cfg(pg); st = pg.evaluate("TribeSiteDesigner.state().page")
            bl = next(x for x in c3["pages"] if x["id"] == st)["blocks"]
            assert bl[1]["type"] == "steps", [x["type"] for x in bl]
            shot(pg, "studio-bar-1440.png")

            # ---- Have my agent do it: read, propose, the person approves, Undo
            pg.click("#wdz-agent")
            pg.wait_for_selector("#stu-agent", timeout=5000)
            shot(pg, "studio-agent-1440.png")
            assert pg.locator("#stu-agent [data-stu=agent-flint]").count() == 1, "works with no agent too: Flint is offered"
            pg.click("#stu-agent [data-stu=agent-close]")
            pg.evaluate("TribeSiteDesigner.flush()"); pg.wait_for_timeout(1500)
            ag = ok(api("/agents", "POST", token=tok, project=pid), "agent")
            key = ag.get("token") or ag.get("key") or (ag.get("agent") or {}).get("token")
            assert key, ag
            err, txt = mcp(key, "site_read", {}, project=pid); assert not err, txt
            o = json.loads(txt)
            assert o["pages"] and o["pages"][0]["blocks"][0]["id"] and "data:image" not in txt, "the outline has ids and words, no pictures"
            assert o["brand"]["voice"] == "Warm and plain", "the agent reads the brand kit too"
            bid = o["pages"][0]["blocks"][0]["id"]
            err, txt = mcp(key, "site_propose", {"note": "A warmer headline and a short how-it-works.", "ops": [
                {"op": "text", "block": bid, "path": "title", "value": "Coffee worth the walk"},
                {"op": "text", "block": bid, "path": "img", "value": "https://evil.example/x.png"},
                {"op": "accent", "color": "#c2255c"}]}, project=pid)
            assert not err and "Proposed 2 changes" in txt and "Skipped" in txt, txt
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["title"] != "Coffee worth the walk", "nothing changes until a person says yes"
            lst = ok(api(f"/projects/{pid}/site-proposals", token=tok))["proposals"]
            assert len(lst) == 1 and lst[0]["status"] == "open", lst
            assert api(f"/projects/{pid}/site-proposals/{lst[0]['id']}/applied", "POST", {}, token=key)[0] == 403, "an agent cannot approve its own proposal"
            pg.wait_for_function("[...document.querySelectorAll('[data-flctx=designer] .fl-thread button')].some(b => /Apply/.test(b.textContent))", timeout=10000)
            shot(pg, "studio-proposal-1440.png")
            pg.evaluate("[...document.querySelectorAll('[data-flctx=designer] .fl-thread button')].filter(b => /Apply/.test(b.textContent)).pop().click()")
            pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.title === 'Coffee worth the walk'", timeout=5000)
            assert cfg(pg)["theme"]["colors"]["accent"].lower() == "#c2255c"
            pg.wait_for_timeout(500)
            assert ok(api(f"/projects/{pid}/site-proposals", token=tok))["proposals"] == [], "answered"
            pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(300)
            assert cfg(pg)["pages"][0]["blocks"][0]["props"]["title"] != "Coffee worth the walk" and cfg(pg)["theme"]["colors"]["accent"].lower() != "#c2255c", "one Undo takes the agent's changes back"

            # ---- phone: the panels fit, no sideways scroll
            pg.set_viewport_size({"width": 390, "height": 800}); pg.wait_for_timeout(500)
            assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll at 390"
            shot(pg, "studio-390.png")
            ctx.close(); b.close()
        assert not errors, errors
        print("e2e_site_studio: OK")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        if "--keep" not in sys.argv:
            import shutil; shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
