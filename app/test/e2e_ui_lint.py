"""UI consistency lint (feat/ui-consistent): the shared rules in app/ui/uikit.css stay true on the main places.

Walks the main destinations of a hosted tribe at 1280 and at 390 and fails on:
  * text under the floor: 11px for mono uppercase labels (eyebrows, tags), 12px for everything else;
  * on the phone, tap targets (buttons, links, things with a click role) under 36px in both directions.
Deliberate exceptions live in ALLOW below, each with its reason.
  --report prints everything it finds and never fails (used to take a baseline).
Usage: TRIBE_PORT_OFFSET=8000 python3 app/test/e2e_ui_lint.py [--report]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6190 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
REPORT = "--report" in sys.argv

# selector fragments (matched against the element's own "tag#id.classes" and its ancestors'): why it is allowed
ALLOW = {
    "kbd": "key caps are drawn small on purpose",
    ".kbd": "key caps",
    "sup": "superscript", "sub": "subscript",
    ".cv-stage": "the design canvas shows the person's own design at its zoom",
    ".wdz-frame": "the website preview is the person's site, scaled",
    ".pv-frame": "the app preview is the person's app",
    ".ti-svg": "icons",
    ".fl-step": "the connect steps are small diagrams drawn to scale",
    ".rt-surface": "the person's own document text",
    ".sheet-grid": "spreadsheet cells follow the sheet's own zoom",
    ".os-": "the pixel office is art",
    ".logo": "the wordmark",
    ".brand": "the wordmark",
    ".win-btns": "desktop window buttons follow the platform size",
    ".avatar": "initials inside a small avatar",
    ".av": "initials inside a small avatar",
    ".badge-n": "count badges sit on a 36px parent target",
    ".rail-badge": "count badges sit on a 36px parent target",
}
# phone targets that are fine under 36px: inline text links inside a sentence, and controls whose parent row is the target
TARGET_ALLOW = {
    "a:inline": "a text link inside a sentence",
    ".seg ": "segmented control: the whole control is the target",
    "input[type=checkbox]": "its label row is the target",
    "input[type=radio]": "its label row is the target",
    ".ti-svg": "icon inside a button",
    ".chip-x": "the chip is the target",
}

MEASURE = r"""
(opts) => {
  const allow = opts.allow, tallow = opts.tallow, phone = opts.phone, out = { text: [], targets: [] };
  const sig = e => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const chain = e => { const a = []; for (let x = e; x && x !== document.body; x = x.parentElement) a.push(sig(x)); return a; };
  const allowed = (c, list) => list.some(k => c.some(s => k.startsWith('.') || k.includes('[') ? s.includes(k.trim()) || (k.includes('[') && false) : s.split(/[#.]/)[0] === k));
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null;
    for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return null; }
    return r; };
  const seen = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length < 2) continue;
    const e = n.parentElement; if (!e || seen.has(e)) continue; seen.add(e);
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TITLE'].includes(e.tagName)) continue;
    if (!vis(e)) continue;
    const cs = getComputedStyle(e), px = parseFloat(cs.fontSize);
    const label = cs.textTransform === 'uppercase' && /mono|Mono|Silkscreen/.test(cs.fontFamily);
    const floor = label ? 11 : 12;
    if (px + 0.01 < floor) { const c = chain(e); if (!allowed(c, allow)) out.text.push({ px: Math.round(px * 10) / 10, floor, sig: c.slice(0, 3).join(' < '), t: t.slice(0, 40) }); }
  }
  if (phone) {
    for (const e of document.querySelectorAll('button, a[href], [role=button], [role=tab], [data-go], summary, select, input:not([type=hidden])')) {
      const r = vis(e); if (!r) continue;
      if (e.disabled) continue;
      if (r.width >= 36 && r.height >= 36) continue;
      // a small visual control is fine when its hit area is extended to 36px (uikit.css: ::after centred on it)
      const after = getComputedStyle(e, '::after');
      if (after && after.content !== 'none' && after.position === 'absolute' && parseFloat(after.width) >= 36 && parseFloat(after.height) >= 36) continue;
      // an input or select inside a label box: the label is the target
      if ((e.tagName === 'INPUT' || e.tagName === 'SELECT') && e.closest('label')) { const lr = e.closest('label').getBoundingClientRect(); if (lr.height >= 36) continue; }
      // a control wholly inside a bigger clickable parent (a tab's row, a card): the parent is the target
      const c = chain(e);
      if (e.tagName === 'A' && getComputedStyle(e).display.startsWith('inline') && e.parentElement && e.parentElement.textContent.trim().length > e.textContent.trim().length + 8) continue;
      if (e.tagName === 'INPUT' && ['checkbox', 'radio'].includes(e.type)) continue;
      if (e.tagName === 'INPUT' || e.tagName === 'SELECT') { if (r.height >= 36) continue; }
      if (allowed(c, tallow)) continue;
      out.targets.push({ w: Math.round(r.width), h: Math.round(r.height), sig: c.slice(0, 3).join(' < '), t: (e.textContent || e.getAttribute('aria-label') || e.title || '').trim().slice(0, 30) });
    }
  }
  return out;
}
"""


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-uilint-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    found = {}
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        pid = api("/projects", token=host)[1]["projects"][0]["id"]
        api(f"/projects/{pid}/tasks", "POST", {"title": "Draw the title screen"}, host)
        api("/chat", "POST", {"text": "Morning crew"}, host)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            for size, vp in (("desktop", {"width": 1280, "height": 860}), ("phone", {"width": 390, "height": 844})):
                c = b.new_context(viewport=vp, **({"has_touch": True, "is_mobile": True} if size == "phone" else {}))
                s = {"name": "Orion", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": host}}
                c.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}))" % json.dumps(json.dumps(s)))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("dialog", lambda d: d.dismiss())
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
                pg.wait_for_function("window.TribeRouter && window.TribeHub && window.TribeShell", timeout=40000)
                pg.wait_for_function("TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1500)
                if pg.locator("#install-sheet #ins-later").count() and pg.locator("#install-sheet #ins-later").is_visible(): pg.click("#ins-later")
                dests = pg.evaluate("TribeShell.dests().filter(d => d.visible).map(d => d.key)")
                routes = [("hub", "TribeRouter.go('hub')")] + [(k, f"TribeShell.go('{k}')") for k in dests]
                routes += [("settings:" + t, f"TribeSettings.open('{t}')") for t in ("profile", "notifications", "account")]
                routes += [("people", "window.TribePeoplePanel && TribePeoplePanel.open && TribePeoplePanel.open()"), ("help", "window.TribeHelp && TribeHelp.open && TribeHelp.open()")]
                for name, js in routes:
                    try: pg.evaluate(js)
                    except Exception as e: errors.append(f"{name}: {e}"); continue
                    pg.wait_for_timeout(1100)
                    r = pg.evaluate(MEASURE, {"allow": list(ALLOW), "tallow": list(TARGET_ALLOW), "phone": size == "phone"})
                    for x in r["text"]: found.setdefault(("text", size, x["sig"], x["px"]), (name, x["t"], x["floor"]))
                    for x in r["targets"]: found.setdefault(("target", size, x["sig"], f'{x["w"]}x{x["h"]}'), (name, x["t"], 36))
                    try: pg.evaluate("window.TribeSettings && TribeSettings.isOpen && TribeSettings.isOpen() && TribeSettings.close(); window.TribePeoplePanel && TribePeoplePanel.close && TribePeoplePanel.close(); window.TribeHelp && TribeHelp.close && TribeHelp.close()")
                    except Exception: pass
                    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
                if size == "desktop":
                    # the shared rules that need code (uikit.js, shell.js)
                    assert pg.evaluate("!!(window.TribeUI && TribeUI.empty && TribeUI.layers)"), "TribeUI is loaded"
                    pg.evaluate("TribeShell.go('chat')"); pg.wait_for_timeout(900)
                    if pg.locator("#chat-head [data-cb='info']").count() and pg.locator("#chat-head [data-cb='info']").first.is_visible():
                        pg.click("#chat-head [data-cb='info']"); pg.wait_for_selector("#info-panel"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
                        assert not pg.locator("#info-panel").count(), "Esc closes the chat's Who is here panel"
                    pg.evaluate("(() => { const p = document.createElement('div'); p.id = 'info-panel'; p.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;height:100px'; p.textContent = 'who'; document.body.appendChild(p); })()")
                    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); assert not pg.locator("#info-panel").count(), "one Esc rule: a panel with no handler of its own still closes"
                    pg.evaluate("TribeUI.empty(document.createElement('div'), { title: 'T', line: 'L' })")
                    html = pg.evaluate("TribeUI.emptyHTML({ title: 'Nothing here yet', line: 'One line.', action: { label: 'Do it', run() {} }, how: { label: 'How it works', run() {} } })")
                    assert "ui-empty" in html and html.count("<button") == 2 and "btn primary" in html, html
                    assert pg.evaluate("(() => { TribeUI.emptyAction = k => k === 'x' ? { label: 'Next step', run() {} } : null; const h = TribeUI.emptyHTML({ kind: 'x', title: 'A' }); TribeUI.emptyAction = null; return h.includes('Next step'); })()"), "a provider can fill an empty state's action"
                c.close()
            # the right panel: open on Home, closed elsewhere, remembered per page (?panelrule=1 turns the rule on for automated browsers)
            c = b.new_context(viewport={"width": 1280, "height": 860})
            s = {"name": "Orion", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": host}}
            c.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}))" % json.dumps(json.dumps(s)))
            pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1&panelrule=1", wait_until="domcontentloaded")
            pg.wait_for_function("window.TribeRouter && window.TribeShell", timeout=40000); pg.wait_for_function("TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1200)
            off = lambda: pg.evaluate("document.body.classList.contains('panel-off')")
            pg.evaluate("TribeShell.go('home')"); pg.wait_for_timeout(600); assert not off(), "the panel is open on a project's dashboard"
            pg.evaluate("TribeShell.go('ws-tasks')"); pg.wait_for_timeout(600); assert off(), "the panel is closed outside Home"
            pg.click("#panel-toggle"); pg.wait_for_timeout(200); assert not off()
            pg.evaluate("TribeShell.go('home')"); pg.wait_for_timeout(500); pg.evaluate("TribeShell.go('ws-tasks')"); pg.wait_for_timeout(600)
            assert not off(), "what you chose on a page is remembered for that page"
            c.close()
            b.close()
    finally:
        srv.terminate()
    rows = sorted(found.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2]))
    for (kind, size, sig, val), (route, text, floor) in rows:
        print(f"  {kind:6} {size:7} {val:>8} (floor {floor}) on {route}: {sig}  “{text}”")
    nt = sum(1 for k in found if k[0] == "text"); ng = sum(1 for k in found if k[0] == "target")
    if REPORT:
        print(f"e2e_ui_lint report: {nt} small-text rules, {ng} small phone targets"); return
    assert not errors, errors[:5]
    assert not found, f"UI lint: {nt} places with text under the floor and {ng} phone targets under 36px (list above)"
    print("e2e_ui_lint: OK (text floors 11/12px at 1280 and 390, phone targets 36px, one Esc rule, shared empty state, right panel per page)")


if __name__ == "__main__":
    main()
