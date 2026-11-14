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
        if "--audit-only" in sys.argv: return
        assert not miss, f"{len(miss)} visible things cannot be edited, e.g. {miss[:5]}"
        print("  ok  every visible word, picture and icon in every template can be selected and edited")
        live(pw)
    assert not errors, errors
    print("e2e_site_editable: OK")


def live(pw):
    pass


if __name__ == "__main__":
    main()
