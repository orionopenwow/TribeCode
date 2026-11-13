"""Flint, maxed out with no AI (feat/flint-max): his new free moves end to end in the website designer, the design
canvas, sheets, docs and slides, and his refreshed page.

  Designer: one message with three steps (a pricing section with three plans, the middle one highlighted, dark mode)
  lands as ONE Undo; "undo that" takes all three back; "make it bigger" on the selection; "do the same on the about
  page"; a mood palette with its own dark variant and swatches in the thread; a broken palette fixed by "fix the
  contrast" (WCAG AA after); elegant fonts; "make this more professional"; tidy; headline ideas you tap to use; a CTA
  picker; readability; Title Case.
  Canvas: a navbar, a sign-up form, a footer and a sidebar from recipes; three layers into a card grid; a sunset palette.
  Sheets (Flint's chat and the sheet's Ask box): sum a column, sort, currency, a total row with =SUM, a chart drawn
  under the table, Undo in the Ask box. Docs: table of contents, checklist, capitals, TL;DR, reading level, Undo.
  Slides: a 5-slide pitch from the vision. Anywhere: a palette and title case.
  Flint's page: levels with the active one, search filters by editor, Try it shows a demo, Ask Flint fills his box.
Usage: python app/test/e2e_flint_max.py [--shots]   (docs/screenshots/flint-page.png, flint-compose.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5550 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors, ran = [], []
OLD_UNUSED = ["#wdz-log", "#wdz-in", "#wdz-chips", "#wdz-form", "#fp-log", "#fp-in", "#fp-chips", "#fp-form", "#pvf-feed", "#pvf-in", "#pvf-chips", "#pvf-form"]


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
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
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.flint.tour', 'done'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def thread(ctx):
    return f"[data-flctx={ctx}] .fl-thread"


def fask(page, ctx, text, timeout=15000):
    """Type into that context's Flint composer, press Enter, wait for Flint's answer; return its text."""
    sel = thread(ctx) + " > :not(.streaming):not(.fl-empty)"
    n = page.locator(sel).count()
    page.fill(f"#flm-in-{ctx}", text)
    page.press(f"#flm-in-{ctx}", "Enter")
    js = """([s, t]) => { const all = [...document.querySelectorAll(s)], th = s.split(' > ')[0]; const me = [...document.querySelectorAll(th + ' > .fl-msg.me')].pop();
      return me && me.querySelector('.fl-t') && me.querySelector('.fl-t').textContent.trim() === t && all.length && !all[all.length - 1].classList.contains('me') && !document.querySelector(th + ' .streaming'); }"""
    try: page.wait_for_function(js, arg=[sel, text.strip()], timeout=timeout)
    except Exception:
        raise AssertionError(f"{ctx}: no answer to {text!r}; the thread ends: {page.locator(sel).all_inner_texts()[-3:]}")
    page.wait_for_timeout(250)
    ran.append(f"{ctx}: {text}")
    return page.locator(sel).last.inner_text()


def gask(page, text, timeout=10000):
    """Flint's main chat (TribeFlint.ask): wait for his reply."""
    n = page.evaluate("TribeFlint.thread().length")
    page.evaluate("t => TribeFlint.ask(t)", text)
    page.wait_for_function("n => { const t = TribeFlint.thread(); return t.length >= n + 2 && t[t.length - 1].who === 'flint' && !t[t.length - 1].streaming; }", arg=n, timeout=timeout)
    page.wait_for_timeout(200)
    ran.append(f"app: {text}")
    t = page.evaluate("TribeFlint.thread()")
    return " ".join(m["text"] for m in t[n:] if m["who"] == "flint")


def same_component(page, ctx):
    root = f"[data-flctx={ctx}].flint-mount"
    page.wait_for_selector(root, timeout=10000)
    for part in [".flm-head", ".fl-thread", ".flm-chips .fl-chip", "form.fl-bar", "input.fl-in", ".fl-send", "[data-flme]"]:
        assert page.locator(f"{root} {part}").count() >= 1, f"{ctx}: no {part}"
    for old in OLD:
        assert page.locator(old).count() == 0, f"{ctx}: the old chat box {old} is still in the DOM"
    return page.locator(f"{root} .flm-chips .fl-chip").all_inner_texts()


def cfg(page):
    return page.evaluate("TribeSiteDesigner.cfg()")


def links_block(page):
    return next(b for p in cfg(page)["pages"] for b in p["blocks"] if b["type"] == "links")


def shot(page, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(out / name))


def fits(page, what):
    w = page.evaluate("document.documentElement.scrollWidth")
    assert w <= 392, f"{what}: sideways scroll ({w}px)"



def blocks(page, i=0):
    return cfg(page)["pages"][i]["blocks"]


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-fmax-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Max Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        ok(api("/vision", "PUT", {"text": "# Lantern Run\n\nFriends lose track of game ideas in scattered chats and it is frustrating. Lantern Run is a tiny co-op game we build together on weekends. It runs in the browser with one click, so anyone can join. More and more friends play small games together now. We plan a public demo next month. We need playtesters and feedback.\n"}, token=tok), "vision")
        sheet = ok(api("/docs", "POST", {"title": "Sales", "kind": "sheet", "body": "| Month | Sales | Cost |\n| --- | --- | --- |\n| Jan | 1200 | 400 |\n| Feb | 950 | 380 |\n| Mar | 1640 | 520 |\n| Apr | 1310 | 450 |\n"}, token=tok), "sheet")["doc"]
        doc = ok(api("/docs", "POST", {"title": "Offsite plan", "body": "# Offsite plan\n\nWe meet in Leeds on the 4th. The goal is to plan the launch together.\n\n## Travel\n\nbook trains by friday. i will send the list to everyone.\n\n## Agenda\n\n- review the roadmap\n- plan the launch\n- pick a venue for the party\n"}, token=tok), "doc")["doc"]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")

            # ================= the website designer =================
            pg.goto(BASE + "/?skipIntro=1#/docs/website")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeFlint && TribeFlint.mount && window.TribeFlintMax && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.wait_for_selector("#wb-design", timeout=15000); pg.click("#wb-design")
            pg.wait_for_selector("#wdz:not([hidden]) #wdz-start:not([hidden]) .wdz-tpl", timeout=10000)
            fask(pg, "designer", "website for my app")
            assert cfg(pg)["template"] == "saas", cfg(pg)["template"]
            mode0, hist0 = cfg(pg)["theme"]["mode"], pg.evaluate("TribeSiteDesigner.state().hist")
            # three steps, one Undo
            out = fask(pg, "designer", "add a pricing section with three plans, make the middle one highlighted, then switch to dark mode")
            pr = next(x for x in blocks(pg) if x["type"] == "pricing")
            assert len(pr["props"]["plans"]) == 3 and pr["props"]["plans"][1].get("hot") and not pr["props"]["plans"][0].get("hot"), pr["props"]["plans"]
            assert cfg(pg)["theme"]["mode"] == "dark", out
            assert pg.evaluate("TribeSiteDesigner.state().hist") == hist0 + 1, "three steps are one Undo"
            assert "most popular" in pg.frame_locator("#wdz-frame").locator(".plan.hot").inner_text().lower()
            pg.frame_locator("#wdz-frame").locator(".plan.hot").evaluate("e => e.scrollIntoView({ block: 'center' })")
            shot(pg, "flint-compose.png")
            fask(pg, "designer", "undo that")
            assert cfg(pg)["theme"]["mode"] == mode0 and pg.evaluate("TribeSiteDesigner.state().hist") == hist0, "undo that takes all three back"
            assert not any(pl.get("hot") for x in blocks(pg) if x["type"] == "pricing" for pl in x["props"].get("plans", [])), "the highlight is gone too"
            ran.append("designer: one Undo for three steps")
            fask(pg, "designer", "add a pricing section with 2 plans and then make the second one highlighted")
            pr = next(x for x in blocks(pg) if x["type"] == "pricing")
            assert [p_["name"] for p_ in pr["props"]["plans"]] == ["Basic", "Pro"] and pr["props"]["plans"][1].get("hot"), pr["props"]["plans"]
            # pronouns: "it" is the selection
            out = fask(pg, "designer", "make it bigger")
            assert next(x for x in blocks(pg) if x["type"] == "pricing").get("style", {}).get("sz") == "l", out
            # a mood palette, with its own dark variant and swatches in the thread
            out = fask(pg, "designer", "warm autumn palette")
            th = cfg(pg)["theme"]
            assert th.get("alt") and "palette" in out.lower(), (th, out)
            assert pg.locator("[data-flctx=designer] .fl-thread .fm-sw .fm-chip").count() >= 5, "swatches in the thread"
            # contrast: break it, then fix it
            pg.evaluate("() => { const c = TribeSiteDesigner.cfg(); const k = c.theme.mode === c.theme.base ? c.theme.colors : c.theme.alt[c.theme.mode]; k.muted = k.bg; k.ink = k.card; }")
            out = fask(pg, "designer", "fix the contrast")
            k = pg.evaluate("TribeSiteCfg.colors(TribeSiteDesigner.cfg())")
            r_ink, r_muted = pg.evaluate("k => [TribeFlintMax.contrast(k.ink, k.bg), TribeFlintMax.contrast(k.muted, k.bg)]", k)
            assert r_ink >= 4.5 and r_muted >= 4.5 and "Fixed" in out, (r_ink, r_muted, out)
            fask(pg, "designer", "pick fonts that feel elegant")
            assert cfg(pg)["theme"]["fonts"]["display"] == "Instrument Serif", cfg(pg)["theme"]["fonts"]
            out = fask(pg, "designer", "make this more professional")
            assert cfg(pg)["theme"]["fonts"]["display"] == "Inter" and cfg(pg)["theme"]["radius"] == 6, out
            out = fask(pg, "designer", "tidy this up")
            assert "tid" in out.lower(), out
            out = fask(pg, "designer", "give me headline ideas")
            btns = pg.locator("[data-flctx=designer] .fl-thread .fl-msg.fl").last.locator(".fl-act")
            assert btns.count() >= 3, out
            first = btns.first.inner_text()
            btns.first.click()
            pg.wait_for_function("t => { const h = TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero'); return h && h.props.title.startsWith(t.replace(/[.…]+$/, '')); }", arg=first, timeout=8000)
            ran.append("designer: tap a headline idea")
            out = fask(pg, "designer", "what should the button say")
            assert "“" in out and "verb" in out, out
            out = fask(pg, "designer", "how readable is this")
            assert "Flesch" in out, out
            out = fask(pg, "designer", "title case the headings")
            assert "Title Case" in out, out
            # "do the same on the about page"
            fask(pg, "designer", "add a page called About")
            pg.evaluate("TribeSiteDesigner.ask('go to the home page')"); pg.wait_for_timeout(400)
            fask(pg, "designer", "add a faq")
            out = fask(pg, "designer", "do the same on the about page")
            about = next(p_ for p_ in cfg(pg)["pages"] if p_["title"] == "About")
            assert any(x["type"] == "faq" for x in about["blocks"]), out

            # ================= the design canvas =================
            pg.goto(BASE + "/?skipIntro=1&flintpane=1#/canvas")
            pg.wait_for_function("window.TribeCanvas && TribeCanvas.state().open", timeout=20000)
            pg.wait_for_selector("#cv-fpane [data-flctx=canvas]", timeout=10000); pg.wait_for_timeout(500)
            nodes = lambda: pg.evaluate("TribeCanvas.state().nodes")
            for say, name in [("add a navbar", "Navbar"), ("add a sign up form", "Sign up form"), ("add a footer", "Footer"), ("add a sidebar", "Sidebar")]:
                out = fask(pg, "canvas", say)
                assert any(n.get("name") == name for n in nodes()), (say, out)
            ids = []
            for _ in range(3):
                pg.evaluate("TribeCanvas._e.select([])"); pg.wait_for_timeout(150)
                had = {n["id"] for n in nodes()}
                fask(pg, "canvas", "add a rectangle")
                ids.append(next(n["id"] for n in nodes() if n["t"] == "rect" and n["id"] not in had))
            pg.evaluate("ids => TribeCanvas._e.patchMany(ids, n => { n.x = 40 + Math.random() * 300; n.y = 900 + Math.random() * 200; })", ids)
            pg.evaluate("ids => TribeCanvas._e.select(ids)", ids); pg.wait_for_timeout(200)
            out = fask(pg, "canvas", "turn these into a card grid")
            ns = {n["id"]: n for n in nodes()}
            xs = sorted(ns[i]["x"] for i in ids)   # the grid keeps the layers' left-to-right order, which the random start positions decide
            assert ns[ids[0]]["y"] == ns[ids[1]]["y"] == ns[ids[2]]["y"] and abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.01 and xs[1] > xs[0], (out, [(ns[i]["x"], ns[i]["y"], ns[i].get("w"), ns[i].get("h")) for i in ids])
            pg.evaluate("TribeCanvas._e.select([])"); pg.wait_for_timeout(150)
            out = fask(pg, "canvas", "apply a sunset palette")
            assert "Recolored" in out, out

            # ================= sheets =================
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeDocs && window.TribeClient && TribeClient.connected() && window.TribeFlintMax", timeout=15000)
            pg.evaluate("TribeApp.show('docs')"); pg.wait_for_timeout(400)
            pg.evaluate("s => TribeDocs.open(s)", sheet["slug"]); pg.wait_for_selector("#sx-grid td", timeout=10000)
            body = lambda slug: ok(api("/docs/" + slug, token=tok))["doc"]["body"]
            out = gask(pg, "sum the sales column")
            assert "5,100" in out, out
            out = gask(pg, "whats the average of the cost column")
            assert "437.5" in out, out
            out = gask(pg, "sort by sales, highest first")
            bd = body(sheet["slug"]); assert bd.index("1640") < bd.index("1310") < bd.index("1200") < bd.index("950"), bd
            out = gask(pg, "format the sales as currency")
            assert "$1,640.00" in body(sheet["slug"]), body(sheet["slug"])
            out = gask(pg, "add a total row")
            assert "=SUM(B2:B5)" in body(sheet["slug"]) and "=SUM(C2:C5)" in body(sheet["slug"]), body(sheet["slug"])
            pg.wait_for_selector("#sx-grid td", timeout=8000)
            # the sheet's own Ask box: a chart, then Undo
            pg.click("#sx-flint"); pg.fill("#sx-ask-in", "make a chart of sales by month"); pg.click("#sx-ask-go")
            pg.wait_for_selector("#sx-chart:not([hidden]) svg rect", timeout=8000)
            assert "chart: bar x=A y=B" in body(sheet["slug"]), body(sheet["slug"])
            ran.append("sheet: chart from the Ask box")
            pg.click("#sx-flint"); pg.fill("#sx-ask-in", "undo"); pg.click("#sx-ask-go")
            pg.wait_for_function("() => document.querySelector('#sx-chart') && document.querySelector('#sx-chart').hidden", timeout=8000)
            assert "chart:" not in body(sheet["slug"]); ran.append("sheet: undo in the Ask box")

            # ================= docs =================
            pg.evaluate("s => TribeDocs.open(s)", doc["slug"]); pg.wait_for_selector("#doc-body", timeout=10000)
            ta = lambda: pg.evaluate("document.querySelector('#doc-body').value")
            out = gask(pg, "make a table of contents")
            assert "## Contents" in ta() and "- [Travel](#travel)" in ta(), (out, ta())
            out = gask(pg, "turn this into a checklist")
            assert "- [ ] review the roadmap" in ta(), ta()
            out = gask(pg, "fix capitalization")
            assert "Book trains by Friday. I will" in ta() and "## Travel" in ta(), ta()
            out = gask(pg, "add a tldr at the top")
            assert "> **TL;DR**" in ta(), ta()
            out = gask(pg, "whats the reading level")
            assert "Flesch" in out, out
            gask(pg, "undo")
            assert "TL;DR" not in ta(), "undo takes the TL;DR back"
            pg.wait_for_timeout(1500)
            assert "## Contents" in body(doc["slug"]), "saved to the host"

            # ================= slides and anywhere =================
            out = gask(pg, "make a 5-slide pitch from the vision doc")
            decks = [d for d in ok(api("/docs", token=tok))["docs"] if d.get("kind") == "deck"]
            assert decks, out
            dk = body(decks[0]["slug"]); assert dk.count("\n---\n") == 4 and "# Lantern Run" in dk and "## Problem" in dk, dk
            pg.wait_for_selector(".dk", timeout=8000)
            out = gask(pg, "show me an ocean palette")
            assert "Ocean palette" in out and pg.evaluate("TribeFlint.thread().slice(-1)[0].html || ''").count("fm-chip") >= 5, out
            out = gask(pg, "title case: the night we met the sea")
            assert "The Night We Met the Sea" in out, out

            # ================= Flint's page =================
            pg.evaluate("TribeFlintPage.open()"); pg.wait_for_selector("#flint-page:not([hidden]) .fpg-cap", timeout=5000)
            assert pg.locator(".fpg-lv.on").count() == 1 and pg.locator(".fpg-lv.on").get_attribute("data-lv") == "none", "no AI is the active level"
            assert pg.locator(".fpg-lv").count() == 5 and pg.is_visible("#fp-local") and "FLINT-RESEARCH" in pg.get_attribute("#fp-plan", "href")
            n_all = pg.locator(".fpg-cap").count(); assert n_all >= 40, n_all
            groups = pg.locator(".fpg-grp h3").all_inner_texts()
            for g in ["Website designer", "Design canvas", "Docs", "Sheets", "Slides", "Your tribe"]:
                assert any(g.lower() in x.lower() for x in groups), (g, groups)
            assert any("Invite your Claude" in x for x in pg.locator(".fpg-cap b").all_inner_texts()) and any("free-AI bridge" in x for x in pg.locator(".fpg-cap b").all_inner_texts())
            pg.fill("#fp-q", "palette"); pg.wait_for_timeout(150)
            n_pal = pg.locator(".fpg-cap").count(); assert 0 < n_pal < n_all, n_pal
            pg.locator(".fpg-cap", has_text="Palettes from a mood").locator("[data-try]").click()
            out = pg.locator(".fpg-cap", has_text="Palettes from a mood").locator(".fpg-out").inner_text()
            assert pg.locator(".fpg-cap", has_text="Palettes from a mood").locator(".fm-chip").count() >= 5 and "site.palette" in out, out
            pg.fill("#fp-q", "chart"); pg.wait_for_timeout(150)
            pg.locator(".fpg-cap", has_text="Charts from a sentence").locator("[data-try]").click()
            assert pg.locator(".fpg-cap", has_text="Charts from a sentence").locator("svg.fm-chart rect").count() == 4
            pg.fill("#fp-q", ""); pg.wait_for_timeout(150)
            pg.evaluate("window.scrollTo(0, 0)"); shot(pg, "flint-page.png")
            pg.fill("#fp-q", "checklist"); pg.wait_for_timeout(150)
            pg.locator(".fpg-cap").first.locator("[data-ask]").click()
            pg.wait_for_timeout(300)
            assert pg.is_hidden("#flint-page") and "checklist" in pg.evaluate("[...document.querySelectorAll('.fl-in')].map(i => i.value).join(' ')"), "Ask Flint fills his box"
            ran.append("flint page: levels, search, Try it, Ask Flint")
            out = gask(pg, "what can you do")
            assert any(a["act"] == "flintpage" for a in pg.evaluate("TribeFlint.thread().slice(-1)[0].acts")), out
            b.close()

        bad = [e for e in errors if "favicon" not in e]
        assert not bad, "\n".join(bad[:8])
        assert len(ran) >= 30, len(ran)
        print(f"e2e_flint_max: OK ({len(ran)} commands end to end: designer, canvas, sheets, docs, slides, anywhere, Flint's page)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
