"""The website editor's bar: in every template, everything a visitor can see can be selected and changed.

  Part 1 (no server): every template in app/ui/sitetpl, every page, rendered the way the editor's preview renders it.
    Every visible piece of text sits in something editable ([data-e]) or is a marked system note ([data-sys], which the
    editor explains when clicked); every picture can be replaced ([data-img]); every icon can be swapped ([data-icon]) or
    is marked as decoration that follows its item ([data-deco]). Counts are printed; anything uncovered fails the test.
  Part 2 (the real editor, with a tribe): see live() below.
Usage: python app/test/e2e_site_editable.py [--audit-only] [--json FILE] [--shots DIR]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 5730 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else ""
OUT = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else ""
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors = []

AUDIT_JS = r"""
(cfg) => {
  const S = window.TribeSiteCfg, c = S.normalize(cfg), out = { text: 0, textOk: 0, img: 0, imgOk: 0, icon: 0, iconOk: 0, sys: 0, miss: [] };
  const host = document.getElementById('host');
  for (const pg of c.pages) {
    const html = S.render(c, { page: pg.id, edit: true, mode: 'single' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    host.innerHTML = ''; const st = document.createElement('style'); st.textContent = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n'); host.appendChild(st);
    const body = document.createElement('div'); body.innerHTML = doc.body.innerHTML; host.appendChild(body);
    const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const where = el => { const b = el.closest('[data-block]'); return b ? b.className.split(' ')[0] : el.closest('header.nav') ? 'nav' : 'page'; };
    const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode, t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!t) continue;
      const p = n.parentElement; if (!p || p.closest('script,style,.skip,.wdz-bar') || !vis(p)) continue;
      out.text++;
      if (p.closest('[data-e]')) out.textOk++;
      else if (p.closest('[data-sys]')) { out.textOk++; out.sys++; }
      else if (p.closest('[data-deco]')) out.textOk++;
      else out.miss.push({ kind: 'text', where: where(p), tag: p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).split(' ')[0] : ''), text: t.slice(0, 50), page: pg.title });
    }
    body.querySelectorAll('img').forEach(im => { if (!vis(im)) return; out.img++; if (im.closest('[data-img]')) out.imgOk++; else out.miss.push({ kind: 'image', where: where(im), tag: 'img.' + im.className, text: im.alt || '', page: pg.title }); });
    body.querySelectorAll('svg').forEach(sv => { if (!vis(sv) || sv.closest('.wdz-bar')) return; out.icon++; if (sv.closest('[data-icon],[data-deco],[data-img]')) out.iconOk++; else out.miss.push({ kind: 'icon', where: where(sv), tag: 'svg', text: '', page: pg.title }); });
    body.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => { if (!vis(i)) return; out.text++; if (i.closest('[data-sys],[data-e]') || i.hasAttribute('data-ph')) out.textOk++; else out.miss.push({ kind: 'placeholder', where: where(i), tag: i.tagName.toLowerCase(), text: i.placeholder, page: pg.title }); });
  }
  host.innerHTML = '';
  return out;
}
"""

ALL_BLOCKS_JS = """() => { const S = window.TribeSiteCfg; let c = S.blank('Audit'); c.pages[0].blocks = [];
  for (const t of S.TYPES) for (const v of S.BLOCKS[t].variants) c = S.addBlock(c, c.pages[0].id, t, v).cfg; c = S.addPage(c, 'About').cfg; return c; }"""


def audit(pw):
    b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.set_content("<!doctype html><div id='host'></div>")
    page.add_script_tag(path=str(UI / "sitecfg.js"))
    tot = {"text": 0, "textOk": 0, "img": 0, "imgOk": 0, "icon": 0, "iconOk": 0, "sys": 0}
    rows, miss = [], []
    tpls = sorted(p for p in (UI / "sitetpl").glob("*.json") if p.name != "catalog.json")
    cfgs = [(f.stem, json.loads(f.read_text())) for f in tpls]
    cfgs.append(("(every block and variant)", page.evaluate(ALL_BLOCKS_JS)))   # a block no template uses is still covered
    for name, cfg in cfgs:
        r = page.evaluate(AUDIT_JS, cfg)
        for k in tot: tot[k] += r[k]
        rows.append((name, r))
        for m in r["miss"]:
            m["tpl"] = name
            miss.append(m)
    b.close()
    return tot, rows, miss


def main():
    with sync_playwright() as pw:
        tot, rows, miss = audit(pw)
        kinds = {}
        for m in miss: kinds[(m["kind"], m["where"], m["tag"])] = kinds.get((m["kind"], m["where"], m["tag"]), 0) + 1
        print(f"templates: {len(rows) - 1}  text {tot['textOk']}/{tot['text']}  pictures {tot['imgOk']}/{tot['img']}  icons {tot['iconOk']}/{tot['icon']}  system notes {tot['sys']}")
        for (k, w, t), n in sorted(kinds.items(), key=lambda x: -x[1])[:70]: print(f"  not editable: {n:4d} x {k} in {w} <{t}>")
        if OUT:
            per = {n: dict({k: v for k, v in r.items() if k != "miss"}, miss=len(r["miss"])) for n, r in rows}
            Path(OUT).write_text(json.dumps({"total": tot, "kinds": [[*k, n] for k, n in kinds.items()], "miss": miss[:400], "per": per}, indent=1))
        if "--walk" in sys.argv: walk(pw); return
        if "--audit-only" in sys.argv: return
        assert not miss, f"{len(miss)} visible things cannot be edited, e.g. {miss[:5]}"
        print("  ok  every visible word, picture and icon in every template can be selected and edited")
        live(pw)
    assert not errors, errors
    print("e2e_site_editable: OK")


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


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


def block(pg, t, page=0): return next(b for b in cfg(pg)["pages"][page]["blocks"] if b["type"] == t)


def shot(pg, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True); pg.wait_for_timeout(500)
        pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))"); pg.screenshot(path=str(out / name))


def open_tpl(pg, pid, tpl):
    pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', template: '{tpl}' }})")
    pg.wait_for_selector("#wdz:not([hidden]) #wdz-frame"); pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages[0].blocks.length > 0")
    pg.wait_for_timeout(700)
    f = fr(pg); f.wait_for_selector("[data-block]", timeout=8000); return f


def esc_to(pg, f, kind):
    """Press Esc until the selection is of this kind (stop typing, then step out)."""
    for _ in range(5):
        s = sel(pg)
        if (s or {}).get("kind") == kind or (kind is None and not s): return
        f.locator("body").press("Escape"); pg.wait_for_timeout(150)
    raise AssertionError(f"Esc never reached {kind}: {sel(pg)}")


WALK_JS = r"""
() => {
  // inside the preview: is every list entry a selectable box, does anything stick out sideways, is anything keyed twice by mistake
  const out = { entries: 0, entryBoxes: 0, missing: [], wide: document.documentElement.scrollWidth - innerWidth, keyed: 0, hidden: [] };
  const lists = p => { const seg = String(p || '').replace(/\.$/, '').split('.'), o = []; for (let n = 1; n < seg.length; n++) if (/^\d+$/.test(seg[n])) o.push(seg.slice(0, n + 1).join('.')); return o; };
  const want = new Set();
  document.querySelectorAll('[data-e],[data-btn],[data-img],[data-icon]').forEach(el => { out.keyed++; const k = el.dataset.e || el.dataset.btn || el.dataset.img || el.dataset.icon; const [b, p] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)]; if (b === '@') return; lists(p).forEach(it => want.add(b + '|' + it)); const r = el.getBoundingClientRect(); if ((r.width < 8 || r.height < 8) && el.dataset.e && el.textContent.trim()) out.hidden.push(k); });
  want.forEach(k => { out.entries++; if (document.querySelector('[data-item="' + CSS.escape(k) + '"]')) out.entryBoxes++; else out.missing.push(k); });
  return out;
}
"""


def walk(pw):
    """Every template in the real editor: every entry of every list is a box you can select; three random words are
    typed over and land in the right place; nothing sticks out sideways on a phone. Prints what it finds (--walk)."""
    import random
    random.seed(7)
    tmp = tempfile.mkdtemp(prefix="tribe-walk-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Walk"], stdout=open(os.path.join(tmp, "server.log"), "w+"), stderr=subprocess.STDOUT, env=env)
    res = {"templates": 0, "entries": 0, "entryBoxes": 0, "typed": 0, "typedOk": 0, "wide390": [], "missing": [], "typeFail": [], "tiny": []}
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]; pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
        pg = ctx.new_page(); watch(pg, "walk"); pg.goto(BASE + "/?skipIntro=1")
        pg.wait_for_function("window.TribeSiteDesigner && window.TribeSiteParts && TribeClient.connected()", timeout=20000)
        tpls = sorted(p.stem for p in (UI / "sitetpl").glob("*.json") if p.name != "catalog.json")
        for t in tpls:
            f = open_tpl(pg, pid, t); res["templates"] += 1
            w = f.evaluate(WALK_JS)
            res["entries"] += w["entries"]; res["entryBoxes"] += w["entryBoxes"]
            for k in w["missing"]: res["missing"].append(f"{t}: {k}")
            for k in w["hidden"]: res["tiny"].append(f"{t}: {k}")
            keys = f.evaluate("[...document.querySelectorAll('[data-e]:not([data-dbl])')].filter(e => e.getBoundingClientRect().height > 4 && !e.dataset.e.startsWith('@')).map(e => e.dataset.e)")
            for k in random.sample(keys, min(3, len(keys))):
                res["typed"] += 1
                try:
                    for _ in range(4):
                        if not sel(pg): break
                        f.locator("body").press("Escape"); pg.wait_for_timeout(60)
                    el = f.locator(f"[data-e='{k}']:not([data-dbl])").first; el.scroll_into_view_if_needed(timeout=2000); el.click(timeout=2000); el.press("Control+a"); el.type("Zq"); el.press("Enter"); pg.wait_for_timeout(150)
                    bid, path = k.split("|", 1)
                    got = pg.evaluate("([bid, path]) => { const c = TribeSiteDesigner.cfg(); for (const p of c.pages) { const b = p.blocks.find(x => x.id === bid); if (b) return TribeSiteCfg.getAt(b.props, path); } return null; }", [bid, path])
                    s = sel(pg) or {}
                    if got == "Zq" and s.get("block") == bid: res["typedOk"] += 1
                    else: res["typeFail"].append(f"{t}: {k} -> {got!r} sel={s}")
                except Exception as e:
                    res["typeFail"].append(f"{t}: {k} {str(e)[:80]}")
            pg.click("[data-dev=phone]"); pg.wait_for_timeout(350)
            wide = f.evaluate("document.documentElement.scrollWidth - innerWidth")
            if wide > 1: res["wide390"].append(f"{t}: {wide}px")
            pg.click("[data-dev=desktop]")
        b.close()
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
    print(json.dumps({k: (v if not isinstance(v, list) else {"n": len(v), "first": v[:12]}) for k, v in res.items()}, indent=1))
    if errors: print("console errors:", errors[:8])
    return res


# what the toolbar covers besides the thing it belongs to (must be nothing)
CLEAR_JS = """(() => { const tb = document.querySelector('.wdz-tb'), sel = document.querySelector('.wdz-sel'); if (!tb || !sel) return ['no toolbar'];
  const t = tb.getBoundingClientRect(); return [...document.querySelectorAll('[data-e],[data-btn],[data-img],[data-icon],.wdz-bar')].filter(e => e !== sel && !e.contains(sel) && !sel.contains(e)).filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && t.left < b.right && t.right > b.left && t.top < b.bottom && t.bottom > b.top; }).map(e => (e.dataset.e || e.dataset.btn || e.className).slice(0, 40)); })()"""


def live(pw):
    """The real editor with a tribe: the things that used to be dead ends, and that nothing glitches while you work."""
    tmp = tempfile.mkdtemp(prefix="tribe-se2-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Site Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = api("/bootstrap", "POST", {"name": "Mara"})[1]["token"]
        pid = api("/projects", token=tok)[1]["projects"][0]["id"]
        b = pw.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", tok, pid))
        pg = ctx.new_page(); watch(pg, "mara")
        pg.goto(BASE + "/?skipIntro=1")
        pg.wait_for_function("window.TribeSiteDesigner && window.TribeSiteParts && window.TribeClient && TribeClient.connected()", timeout=20000)

        # ---- the line from the report: a link with a small note under it ("Opens Friday at 10am")
        f = open_tpl(pg, pid, "linkbio")
        note = f.locator("small[data-e]").first
        assert "Opens Friday" in note.inner_text(), note.inner_text()
        f.evaluate("window.__same = 1")   # if the preview reloads, this is gone
        note.click()
        pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'text'", timeout=4000)
        assert sel(pg)["path"] == "items.0.note", sel(pg)
        assert f.locator(".wdz-tb").is_visible() and f.locator(".wdz-sel").count() == 1, "one outline and one toolbar"
        assert f.evaluate(CLEAR_JS) == [], "the toolbar never sits on words, a picture or the section's bar"
        assert pg.locator("#wdz-insp .sp-crumbs").is_visible() and pg.locator("#wdz-insp [data-etext]").input_value().startswith("Opens Friday")
        note.press("Control+a"); note.type("Opens Saturday at 9am")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[0].note === 'Opens Saturday at 9am'", timeout=4000)
        assert pg.locator("#wdz-insp [data-etext]").input_value() == "Opens Saturday at 9am", "the panel follows what is typed on the page"
        # Desktop at a real computer width (round 3): Full width lays the page out 1280 wide and scrolls sideways; clicks still land
        assert f.evaluate("innerWidth") < 1100
        pg.click("#wdz [data-wdz=more]"); pg.click("#wdz-wide"); pg.wait_for_function("document.querySelector('#wdz-framewrap').classList.contains('is-wide')"); pg.wait_for_timeout(300)
        assert f.evaluate("innerWidth") == 1280 and pg.evaluate("document.querySelector('#wdz-framewrap').scrollWidth > document.querySelector('#wdz-framewrap').clientWidth")
        f.locator("h1[data-e]").first.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).path === 'name'", timeout=3000)
        pg.click("#wdz [data-wdz=more]"); pg.click("#wdz-wide"); pg.wait_for_timeout(300); assert f.evaluate("innerWidth") < 1100
        print("  ok  the note under a link is selected with one click and typed over in place")

        # ---- the small toolbar: bigger, bold; the page is swapped in place (no reload), the outline and toolbar stay
        note.press("Escape")
        f.locator(".wdz-tb [data-a=bigger]").click()
        pg.wait_for_function("((TribeSiteDesigner.cfg().pages[0].blocks[0].es || {})['items.0.note'] || {}).sz === 'l'", timeout=4000)
        pg.wait_for_timeout(300)
        assert f.evaluate("window.__same") == 1, "the preview was not reloaded for a style change"
        assert "e-sz-l" in f.locator("small[data-e]").first.get_attribute("class") and f.locator(".wdz-sel").count() == 1 and f.locator(".wdz-tb").is_visible()
        f.locator(".wdz-tb [data-a=bold]").click()
        pg.wait_for_function("((TribeSiteDesigner.cfg().pages[0].blocks[0].es || {})['items.0.note'] || {}).b === 1", timeout=4000)
        # Undo selects the exact thing it changed (round 3), even after the selection moved elsewhere
        f.locator("h1[data-e]").first.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).path === 'name'"); f.locator("h1[data-e]").first.press("Escape")
        pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function("(s => s && s.kind === 'text' && s.path === 'items.0.note')(TribeSiteDesigner.state().sel)", timeout=3000)
        pg.evaluate("TribeSiteDesigner.redo()"); pg.wait_for_timeout(300); assert sel(pg)["path"] == "items.0.note"
        print("  ok  bigger and bold from the toolbar; the preview does not reload or lose the selection")

        # ---- Esc steps out: the entry, the section, nothing
        pg.wait_for_timeout(200); f.locator("small[data-e]").first.click()
        esc_to(pg, f, "item")
        assert sel(pg)["path"] == "items.0" and f.locator("[data-item].wdz-sel").count() == 1, sel(pg)
        assert f.locator("[data-item].wdz-sel").evaluate("e => e.matches('a.lk')"), "an entry with no box of its own is its link, not the whole section"
        first = cfg(pg)["pages"][0]["blocks"][0]["props"]["items"][0]["label"]
        f.locator("body").press("Alt+ArrowDown")
        pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[1].label === {json.dumps(first)}", timeout=4000)
        assert sel(pg)["path"] == "items.1", "the selection follows the entry"
        assert ((cfg(pg)["pages"][0]["blocks"][0].get("es") or {}).get("items.1.note") or {}).get("sz") == "l", "its look moved with it"
        pg.wait_for_timeout(300)
        f.locator("body").press("Control+z"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[0].label === {json.dumps(first)}", timeout=4000)
        f.locator("body").press("Control+Shift+z"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[1].label === {json.dumps(first)}", timeout=4000)
        f.locator("body").press("Control+z"); pg.wait_for_timeout(300)
        # drag the entry by its grip: a line shows where it lands; it drops as the third link
        f.locator("small[data-e]").first.click(); esc_to(pg, f, "item")
        fb = pg.locator("#wdz-frame").bounding_box(); grip = f.locator(".wdz-tb [data-a=igrip]").bounding_box(); third = f.locator("a.lk").nth(2).bounding_box()
        pg.mouse.move(grip["x"] + grip["width"] / 2, grip["y"] + grip["height"] / 2); pg.mouse.down()
        pg.mouse.move(third["x"] + 40, third["y"] + third["height"] * 0.8, steps=6); pg.wait_for_timeout(120)
        assert f.locator(".wdz-idrop").count() == 1 and f.locator(".wdz-idrop").bounding_box()["width"] > 100, "a clear line shows where it will land"
        pg.mouse.up()
        pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[2].label === {json.dumps(first)}", timeout=4000)
        pg.wait_for_timeout(300); assert sel(pg)["path"].startswith("items.2") and f.locator(".wdz-idrop").count() == 0, sel(pg)
        pg.wait_for_timeout(300); pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items[0].label === {json.dumps(first)}", timeout=4000); pg.wait_for_timeout(300)
        n0 = len(cfg(pg)["pages"][0]["blocks"][0]["props"]["items"])
        f.locator("small[data-e]").first.click(); esc_to(pg, f, "item")
        f.locator(".wdz-tb [data-a=dup]").click(); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items.length === {n0 + 1}", timeout=4000)
        pg.wait_for_timeout(300)
        f.locator("body").press("Delete"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items.length === {n0}", timeout=4000)
        assert sel(pg)["kind"] == "block"
        esc_to(pg, f, None)
        f.locator("body").press("Escape"); pg.wait_for_timeout(250)   # with nothing left to step out of, Esc in the page asks first
        assert pg.is_visible("#wdz") and "Press Esc again" in pg.inner_text("body"), "stepping out never closes the editor by surprise"
        # Undo shows what it changed: the section is selected again
        pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function("!!TribeSiteDesigner.state().sel", timeout=3000)
        pg.evaluate("TribeSiteDesigner.redo()"); pg.wait_for_timeout(300); esc_to(pg, f, None)
        print("  ok  Esc steps out to the entry, the section, then nothing; an entry moves, copies and goes by toolbar and keys; undo and redo cover it")

        # ---- several things at once (round 3): shift-click, one change to all, one Undo
        f.locator("small[data-e]").nth(0).click(); f.locator("small[data-e]").nth(1).click(modifiers=["Shift"]); f.locator("h1[data-e]").first.click(modifiers=["Shift"])
        pg.wait_for_function("TribeSiteDesigner.state().multi === 3", timeout=3000)
        assert f.locator(".wdz-msel").count() == 3 and "3 things selected" in pg.inner_text("#wdz-insp").lower()
        es0 = json.dumps(cfg(pg)["pages"][0]["blocks"][0].get("es") or {}, sort_keys=True)
        pg.click("#wdz-insp [data-sp=multi][data-val=hidephone]")
        pg.wait_for_function("(() => { const e = TribeSiteDesigner.cfg().pages[0].blocks[0].es || {}; return ['items.0.note', 'items.1.note', 'name'].every(k => (e[k] || {}).hide === 'phone'); })()", timeout=3000)
        pg.wait_for_timeout(300); assert fr(pg).locator(".wdz-msel").count() == 3, "they stay selected for the next change"
        pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_timeout(300)
        assert json.dumps(cfg(pg)["pages"][0]["blocks"][0].get("es") or {}, sort_keys=True) == es0, "one Undo takes the change back from all of them"
        f = fr(pg); f.locator("small[data-e]").nth(0).click(); pg.wait_for_function("TribeSiteDesigner.state().multi === 0", timeout=3000)
        n1 = len(cfg(pg)["pages"][0]["blocks"][0]["props"]["items"])
        f.locator("a.lk").nth(2).click(); f.locator("a.lk").nth(3).click(modifiers=["Shift"]); pg.wait_for_function("TribeSiteDesigner.state().multi === 2", timeout=3000)
        f.locator("body").press("Delete"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items.length === {n1 - 2}", timeout=3000)
        pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks[0].props.items.length === {n1}", timeout=3000); pg.wait_for_timeout(300); f = fr(pg); esc_to(pg, f, None)
        print("  ok  shift-click selects several things; one change (or Delete) applies to all and is one Undo")

        # ---- right-click: the same actions as a menu; hide on phones shows in the phone preview and the export
        f.locator("h1[data-e]").first.click(button="right")
        pg.wait_for_selector(".sp-menu:not([hidden])", timeout=3000)
        assert pg.locator(".sp-menu [data-val=hidephone]").inner_text().startswith("Hide on phones")
        pg.click(".sp-menu [data-val=hidephone]")
        pg.wait_for_function("((TribeSiteDesigner.cfg().pages[0].blocks[0].es || {}).name || {}).hide === 'phone'", timeout=4000)
        assert pg.is_hidden(".sp-menu")
        html = pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        assert "hide-phone" in html and "@media (max-width:640px){.hide-phone{display:none!important}}" in html
        pg.click("[data-dev=phone]"); pg.wait_for_timeout(600)
        assert f.evaluate("window.__same") == 1 and "ehide-phone" in f.locator("h1").first.get_attribute("class")
        assert float(f.evaluate("getComputedStyle(document.querySelector('h1')).opacity")) < 0.5, "dimmed in the phone preview, not gone, so it can be brought back"
        pg.click("[data-dev=desktop]"); pg.wait_for_timeout(400)
        print("  ok  right-click menu; Hide on phones is one tap, shows dimmed in the phone preview and is really hidden in the export")

        # ---- on another tab, a click in the page still shows what was clicked
        pg.click(".wdz-ptabs [data-panel=style]"); f.locator("[data-btn]").first.click()
        try: pg.wait_for_function("TribeSiteDesigner.state().panel === 'edit' && (TribeSiteDesigner.state().sel || {}).kind === 'button'", timeout=3000)
        except Exception: print('DEBUG', pg.evaluate("JSON.stringify(TribeSiteDesigner.state())")[:300], f.evaluate("document.activeElement && document.activeElement.outerHTML.slice(0,200)")); raise
        assert pg.is_visible("#wdz-link") and pg.locator(".wdz-ptabs [data-panel=edit]").get_attribute("aria-selected") == "true"
        nb = len(cfg(pg)["pages"][0]["blocks"])
        f.locator("[data-img]").first.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'image'", timeout=3000)
        f.locator(".wdz-tb [data-a=fit]").click(); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.fit === 'contain'", timeout=3000)
        pg.wait_for_timeout(300)
        f.locator("body").press("Delete"); pg.wait_for_timeout(400)
        assert len(cfg(pg)["pages"][0]["blocks"]) == nb and cfg(pg)["pages"][0]["blocks"][0]["props"]["img"] == "", "Delete on a picture takes the picture out, not the section"
        f.locator("body").press("Control+z"); pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks[0].props.img !== ''", timeout=3000)
        print("  ok  a click on the page always opens Edit; Delete on a picture is safe and undoable")

        # ---- reload: nothing is lost
        pg.evaluate("TribeSiteDesigner.flush()"); pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=8000)
        assert "Saved" in pg.inner_text("#wdz-saved")
        pg.reload(); pg.wait_for_function("window.TribeSiteDesigner && TribeClient.connected()", timeout=20000)
        pg.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().pages[0].blocks.length > 0")
        c = cfg(pg); b0 = c["pages"][0]["blocks"][0]
        assert b0["props"]["items"][0]["note"] == "Opens Saturday at 9am" and b0["es"]["items.0.note"] == {"sz": "l", "b": 1} and b0["es"]["name"]["hide"] == "phone", b0.get("es")
        print("  ok  after a reload the words, the look and the phone setting are all still there")

        # ---- a site with a menu, a form and a price list: the name, page names, form labels
        f = open_tpl(pg, pid, "cafe")
        for q in ["add a contact form", "add a pricing section", "add a page called Events"]:
            pg.evaluate(f"TribeSiteDesigner.ask({json.dumps(q)})"); pg.wait_for_timeout(600)
        pg.click("#wdz-pages .wdz-tab >> nth=0"); f = fr(pg); f.wait_for_selector("header.nav [data-e='@|name']")
        nm = f.locator("header.nav [data-e='@|name']"); nm.click(); nm.press("Control+a"); nm.type("Maras Kitchen"); nm.press("Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().name === 'Maras Kitchen'", timeout=4000)
        assert pg.inner_text("#wdz-name") == "Maras Kitchen", "the top bar follows"
        home = cfg(pg)["pages"][0]["id"]
        link = f.locator("header.nav [data-e='@|pages.1.title']"); link.dblclick(); pg.wait_for_timeout(200)
        assert pg.evaluate("TribeSiteDesigner.state().page") == home, "a double-click types in the name; it does not leave the page"
        link.press("Control+a"); link.type("Whats on"); link.press("Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[1].title === 'Whats on'", timeout=4000)
        assert pg.locator("#wdz-pages .wdz-tab").nth(1).inner_text() == "Whats on"
        lab = f.locator("form.cf label[data-e]").first; lab.scroll_into_view_if_needed(); lab.click(); lab.press("Control+a"); lab.type("Your name"); lab.press("Enter")
        pg.wait_for_function("(TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'contact') || {props:{}}).props.lName === 'Your name'", timeout=4000)
        sb = f.locator("form.cf button [data-e]"); sb.click(); sb.press("Control+a"); sb.type("Send it"); sb.press("Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'contact').props.button === 'Send it'", timeout=4000)
        # Shift Enter is a line break, on the page and on the published site (it used to vanish on the next redraw)
        lead = f.locator(".b-hero p.lead[data-e]").first; lead.scroll_into_view_if_needed(); lead.click(); lead.press("Control+a"); lead.type("Bread from 7"); lead.press("Shift+Enter"); lead.type("Soup at noon"); lead.press("Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').props.text === 'Bread from 7\\nSoup at noon'", timeout=4000)
        assert "Bread from 7<br>Soup at noon" in pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        # some of the words: select one with the mouse, make it bold, link another (round 2)
        PICK = "(w) => { const el = document.querySelector('.b-hero p.lead[data-e]'); el.focus(); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.nodeValue.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const g = getSelection(); g.removeAllRanges(); g.addRange(r); return true; } } return false; }"
        lead.click(); assert f.evaluate(PICK, "Bread"); f.locator(".wdz-tb [data-a=bold]").click()
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').props.text === '**Bread** from 7\\nSoup at noon'", timeout=4000)
        assert not (block(pg, "hero").get("es") or {}).get("text"), "only the word is bold, not the whole line"
        assert f.evaluate(PICK, "noon"); f.locator(".wdz-tb [data-a=wlink]").click(); pg.wait_for_selector("#sp-wlink-to", timeout=3000)
        pg.fill("#sp-wlink-to", "example.com/menu"); pg.press("#sp-wlink-to", "Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').props.text === '**Bread** from 7\\nSoup at [noon](https://example.com/menu)'", timeout=4000)
        out = pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        assert '<b>Bread</b> from 7<br>Soup at <a href="https://example.com/menu" rel="noopener">noon</a>' in out
        pg.wait_for_timeout(300); f = fr(pg); assert f.locator(".b-hero p.lead b").inner_text() == "Bread" and f.locator(".b-hero p.lead a").get_attribute("href") == "https://example.com/menu"
        assert f.evaluate(PICK, "Bread"); f.locator(".wdz-tb [data-a=bold]").click()   # again takes it off
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').props.text.startsWith('Bread from 7')", timeout=4000)
        # any colour, space around and font for this one element (round 2)
        f.locator(".b-hero h1[data-e]").first.click(); pg.wait_for_selector("#wdz-insp [data-escolor]")
        pg.click("#wdz-insp [data-sp=es][data-k=sp][data-val=l]"); pg.wait_for_function("((TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').es || {}).title || {}).sp === 'l'", timeout=3000)
        pg.click("#wdz-insp [data-sp=es][data-k=f][data-val=mono]"); pg.wait_for_timeout(250)
        pg.evaluate("(() => { const i = document.querySelector('#wdz-insp [data-escolor]'); i.value = '#12ab34'; i.dispatchEvent(new Event('change', { bubbles: true })); })()")
        pg.wait_for_function("((TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').es || {}).title || {}).c === '#12AB34'", timeout=3000)
        assert 'class="e-sp-l e-f-mono" style="color:#12AB34"' in pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        # a label the site shows in capitals is saved as it was typed, not in capitals
        cap = f.locator(".in h3[data-e]").first; cap.scroll_into_view_if_needed(); cap.click(); cap.press("Control+a"); cap.type("Where we are"); cap.press("Enter")
        pg.wait_for_function("TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'info').props.items[0].label === 'Where we are'", timeout=4000)
        assert f.evaluate("getComputedStyle(document.querySelector('.in h3')).textTransform") == "uppercase"
        f.locator("form.cf [data-sys]").click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'block'", timeout=3000)
        assert "only for you" in pg.locator("[data-flctx=designer] .fl-thread > *").last.inner_text()
        html = pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        assert ">Your name</label>" in html and "data-e=" not in html and "contenteditable" not in html, "the export carries the words and none of the editing marks"
        print("  ok  the site name, a page name in the menu, a form label and its button are typed over in place; notes meant for you explain themselves")

        # ---- section settings: lists by name, width, entrance; site settings: pages
        pb = block(pg, "pricing"); f.locator(f"[data-block='{pb['id']}'] h2").click(); esc_to(pg, f, "block")
        assert pg.locator("#wdz-insp .sp-list .sp-li").count() >= 2
        pg.click("#wdz-insp [data-sp=sty][data-k=w][data-val=narrow]"); pg.wait_for_function("(TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'pricing').style || {}).w === 'narrow'", timeout=3000)
        pg.click("#wdz-insp [data-sp=sty][data-k=anim][data-val=rise]"); pg.wait_for_timeout(300)
        assert "an-rise" in pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        pg.click("#wdz-insp .sp-li [data-sp=entry][data-val=down] >> nth=0"); pg.wait_for_timeout(400)
        assert block(pg, "pricing")["props"]["plans"][1]["name"] == pb["props"]["plans"][0]["name"]
        # the entrance can be played in the editor; where a browser has no scroll timelines it plays once on opening
        f.locator(f"[data-block='{pb['id']}'] h2").click(); esc_to(pg, f, "block")
        pg.click("#wdz-insp [data-sp=play]"); pg.wait_for_timeout(120)
        assert f.locator(f"[data-block='{pb['id']}'].an-play-rise").count() == 1, "Play it shows the entrance right here"
        assert "@supports not (animation-timeline:view()){.an-fade{animation:an-fade .7s" in pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        # drag a selected picture inside its frame: what stays in view is saved
        im = f.locator(".b-hero [data-img]").first; im.scroll_into_view_if_needed(); im.click(); pg.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'image'", timeout=3000)
        ib = im.bounding_box(); pg.mouse.move(ib["x"] + ib["width"] / 2, ib["y"] + ib["height"] / 2); pg.mouse.down(); pg.mouse.move(ib["x"] + ib["width"] / 2 - 60, ib["y"] + ib["height"] / 2 + 10, steps=5); pg.mouse.up()
        pg.wait_for_function("typeof TribeSiteDesigner.cfg().pages[0].blocks.find(b => b.type === 'hero').props.fx === 'number'", timeout=3000)
        assert (sel(pg) or {}).get("kind") == "image", "the end of a drag is not a click on something else"
        assert "object-position:" in pg.evaluate("TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'html')['index.html']")
        # a section can move to another page (above its footer); Undo brings it back
        f.locator(f"[data-block='{pb['id']}'] h2").click(); esc_to(pg, f, "block"); other = cfg(pg)["pages"][1]["id"]
        pg.select_option(f"#wdz-insp [data-sp-moveto='{pb['id']}']", other)
        pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[1].blocks.some(b => b.id === '{pb['id']}') && !TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.id === '{pb['id']}')", timeout=3000)
        pg.evaluate("TribeSiteDesigner.undo()"); pg.wait_for_function(f"TribeSiteDesigner.cfg().pages[0].blocks.some(b => b.id === '{pb['id']}')", timeout=3000); pg.wait_for_timeout(300)
        pg.click(".wdz-ptabs [data-panel=style]"); pg.click("#wdz-sub-style [data-panel=site]"); assert pg.locator("#wdz-insp .sp-pages .sp-li").count() == len(cfg(pg)["pages"]) >= 2
        pg.fill("#wdz-insp [data-pgseo=title]", "Maras Kitchen, open daily"); pg.locator("#wdz-insp [data-pgseo=title]").press("Tab")
        pg.wait_for_function("(TribeSiteDesigner.cfg().pages[0].seo || {}).title === 'Maras Kitchen, open daily'", timeout=3000)
        assert pg.locator("#wdz-insp [data-site=pageshare]").count() == 1, "each page can have its own share picture"
        files = pg.evaluate("Object.fromEntries(Object.entries(TribeSiteCfg.exportFiles(TribeSiteDesigner.cfg(), 'zip').files).filter(([k]) => /html$/.test(k)).map(([k, v]) => [k, /<title>([^<]*)/.exec(v)[1]]))")
        assert files["index.html"] == "Maras Kitchen, open daily" and "Whats on" in files[[k for k in files if k != "index.html"][0]], files
        shot(pg, "site-editor2-pages-1440.png")
        print("  ok  entries by name in a section's settings; width and a quiet entrance; each page has its own title for search")

        if SHOTS:
            pg.click(".wdz-ptabs [data-panel=edit]"); f = fr(pg); f.locator("h1[data-e]").first.click(); pg.wait_for_timeout(300); shot(pg, "site-editor2-words-1440.png")
            f.locator("h1[data-e]").first.click(button="right"); pg.wait_for_selector(".sp-menu:not([hidden])"); shot(pg, "site-editor2-menu-1440.png"); pg.keyboard.press("Escape")

        # ---- a phone: tap words, the toolbar stays on screen, nothing scrolls sideways
        pg.evaluate("TribeSiteDesigner.flush()"); pg.wait_for_function("!TribeSiteDesigner.state().dirty", timeout=8000)
        ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ph.add_init_script(settings_js("Mara", tok, pid)); m = ph.new_page(); watch(m, "phone")
        m.goto(BASE + "/?skipIntro=1"); m.wait_for_function("window.TribeSiteDesigner && TribeClient.connected()", timeout=20000)
        m.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); m.wait_for_selector("#wdz:not([hidden]) #wdz-frame"); m.wait_for_timeout(900)
        mf = fr(m); mf.wait_for_selector("h1[data-e]"); mf.locator("h1[data-e]").first.tap()
        m.wait_for_function("(TribeSiteDesigner.state().sel || {}).kind === 'text'", timeout=4000)
        box = mf.locator(".wdz-tb").bounding_box(); assert box and box["x"] >= 0 and box["x"] + box["width"] <= 391, box
        assert m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll on a phone"
        assert m.locator("#wdz-saved").is_visible(), "the saved state shows on a phone too"
        assert mf.evaluate(CLEAR_JS) == [], "on a phone too the toolbar is clear of the words"
        bar = m.locator(".wdz-top").bounding_box(); assert bar["height"] <= 60, f"the phone's top bar is one row, not {bar['height']}px"
        assert not m.locator("[data-wdz='dl-html']").first.is_visible()
        shot(m, "site-editor2-words-390.png")
        m.locator("[data-wdz='more']").tap(); m.wait_for_selector("#wdz-more", state="visible"); assert m.locator("#wdz-more [data-wdz='templates']").is_visible(); shot(m, "site-editor2-more-390.png")
        m.locator("[data-wdz='more']").tap(); m.wait_for_timeout(150); assert m.locator(".wdz-top").bounding_box()["height"] <= 60
        shot(m, "site-editor2-words-390.png")
        print("  ok  phone: tap words, the toolbar fits the screen, nothing scrolls sideways, the saved state is visible")
        b.close()
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
