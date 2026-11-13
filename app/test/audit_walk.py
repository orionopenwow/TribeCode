"""Audit walker (docs/APP-AUDIT-2026-11-13.md): walks every route, global section and sheet and clicks what it finds.

For each state (no tribe on this device, a hosted tribe as host, as a builder, as a spectator) and each screen size
(desktop 1280, phone 390) it opens every destination in the router's registry, the global pages, every Settings tab and
the sheets (create a tribe, People, Invite your Claude, the home pill, Versions, plans, Flint's page, the free-AI bridge,
the + Add picker, Help, the palette, the profile menu, the preview, the website designer). On each it clicks every
visible button, tab and menu item (destructive ones are skipped), closes whatever opened, and records:
  page errors, console errors, failed /api calls (not 401/403/404/409), clicks with no visible effect, layers that
  Esc does not close, text under 12px, clipped text, sideways scroll, controls off screen, covered controls,
  "Loading…" that never ends, raw error strings (Failed to fetch, undefined, NaN, [object Object]) and duplicate ids.
Writes <out>/walk-<state>-<size>.json and screenshots of anything wrong. It is a report, not a pass/fail test.
Usage: TRIBE_PORT_OFFSET=2700 python3 app/test/audit_walk.py [--state none|host|builder|spectator] [--size desktop|phone] [--out /tmp/audit] [--clicks 30]
"""
import argparse, json, os, re, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5990 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
OK_4XX = {401, 403, 404, 409}
SKIP = re.compile(r"delete|remove|sign out|log out|logout|leave|reset|clear|revoke|disconnect|erase|wipe|quit|stop hosting|turn off|forget|restore|discard|kick|ban\b|mute|pay\b|buy|install|download|export|import|print|upload|record|start a huddle|join huddle|call|mic|camera|screen|ship|publish|push|restart|update now|open in|browse|choose a folder|pick a folder|sign in with|continue with|log in|github|google|discord|full ?screen", re.I)

PAGE_JS = r"""
(() => {
  const W = window;
  const vis = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false;
    for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden') return false; }
    return true; };
  const short = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.'); if (c) s += '.' + c; return s; };
  const path = el => { const out = []; for (let p = el, i = 0; p && p !== document.body && i < 4; p = p.parentElement, i++) out.unshift(short(p)); return out.join(' > '); };
  const label = el => ((el.getAttribute('aria-label') || el.title || el.innerText || el.value || '') + '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const scrollsX = el => { for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const fixedRoot = el => { for (let p = el; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.position === 'fixed') return p; } return null; };
  // layers: fixed things that sit on top (sheets, modals, scrims, popovers, menus)
  const layers = () => [...document.querySelectorAll('body *')].filter(el => { const c = getComputedStyle(el); if (c.position !== 'fixed' || !vis(el)) return false;
      const z = parseInt(c.zIndex, 10) || 0; if (z < 20) return false; const r = el.getBoundingClientRect(); return r.width * r.height > innerWidth * innerHeight * 0.04; })
    .filter((el, i, a) => !a.some(o => o !== el && o.contains(el)));
  const SEL = 'button, [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], a[href], summary, [data-tab], [data-act], [data-go], [data-nav], input[type=checkbox], input[type=radio], select';
  function clickables(rootSel) {
    const tops = layers().filter(l => !l.hasAttribute('data-aw-base'));
    let roots;
    if (tops.length) roots = tops; else if (rootSel) roots = [...document.querySelectorAll(rootSel)].filter(vis); else roots = [document.querySelector('.main') || document.querySelector('#main') || document.body];
    if (!roots.length) roots = [document.body];
    document.querySelectorAll('[data-aw-i]').forEach(e => e.removeAttribute('data-aw-i'));
    const seen = new Set(), out = [];
    for (const root of roots) for (const el of root.querySelectorAll(SEL)) {
      if (seen.has(el) || !vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue; seen.add(el);
      if ([...seen].some(o => o !== el && o.contains(el) && o.matches('button, a, [role=button], [role=tab], [role=menuitem]'))) continue;
      const r = el.getBoundingClientRect();
      out.push({ sig: short(el) + '|' + label(el) + '|' + (el.getAttribute('data-tab') || el.getAttribute('data-act') || el.getAttribute('data-go') || el.getAttribute('href') || ''), label: label(el), path: path(el), tag: el.tagName, type: el.type || '', href: el.getAttribute('href') || '', target: el.target || '', x: r.x, y: r.y, w: r.width, h: r.height, i: out.length });
      el.setAttribute('data-aw-i', String(out.length - 1));
    }
    return out;
  }
  function checks(rootSel) {
    const res = { hscroll: document.documentElement.scrollWidth > innerWidth + 1, small: [], clipped: [], offscreen: [], covered: [], loading: [], raw: [], dupIds: [], tinyTargets: [] };
    const tops = layers().filter(l => !l.hasAttribute('data-aw-base'));
    const roots = tops.length ? tops : (rootSel ? [...document.querySelectorAll(rootSel)].filter(vis) : [document.body]);
    const smallSeen = new Set(), clipSeen = new Set();
    for (const root of roots.length ? roots : [document.body]) {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = tw.nextNode())) {
        const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest('svg, script, style, noscript, [aria-hidden=true]') || !vis(el)) continue;
        const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
        if (fs < 11.95 && /[A-Za-z0-9]{2}/.test(t)) { const k = short(el) + ':' + fs; if (!smallSeen.has(k) && res.small.length < 14) { smallSeen.add(k); res.small.push({ el: path(el), px: fs, text: t.slice(0, 40) }); } }
        if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && cs.whiteSpace.includes('nowrap') && !el.querySelector('*')) { const k = short(el); if (!clipSeen.has(k) && res.clipped.length < 10) { clipSeen.add(k); res.clipped.push({ el: path(el), text: t.slice(0, 50), by: el.scrollWidth - el.clientWidth }); } }
        if (/^Loading(…|\.\.\.)?$|Loading(…|\.\.\.)/.test(t) && res.loading.length < 6) res.loading.push({ el: path(el), text: t.slice(0, 50) });
        const m = /Failed to fetch|NetworkError|\bundefined\b|\[object Object\]|\bNaN\b|TypeError|SyntaxError|Unexpected token|Cannot read prop|is not a function|\bnull\b(?! and)|Invalid Date/.exec(t);
        if (m && !el.closest('pre, code, textarea, .cm-editor, [contenteditable]') && res.raw.length < 8) res.raw.push({ el: path(el), hit: m[0], text: t.slice(0, 90) });
      }
      for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=button]')) {
        if (!vis(el)) continue; const r = el.getBoundingClientRect();
        if ((r.right > innerWidth + 3 || r.left < -3) && !scrollsX(el) && res.offscreen.length < 10) res.offscreen.push({ el: path(el), label: label(el), left: Math.round(r.left), right: Math.round(r.right) });
        if (r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) {
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.labels && [...el.labels].some(l => l.contains(top))) && !(top.closest('label') && top.closest('label').contains(el)) && res.covered.length < 10) {
            const fa = fixedRoot(el), fb = fixedRoot(top);
            if (fa === fb || !fb || (fa && fa.contains(fb))) res.covered.push({ el: path(el), label: label(el), by: path(top) });
          }
          if (innerWidth < 500 && (r.width < 28 || r.height < 28) && el.matches('button, [role=tab], [role=button]') && res.tinyTargets.length < 8) res.tinyTargets.push({ el: path(el), label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
    }
    const ids = {}; for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
    res.dupIds = Object.entries(ids).filter(([k, v]) => v > 1 && k).map(([k, v]) => k + '×' + v).slice(0, 20);
    res.layers = tops.map(path);
    return res;
  }
  let muts = 0; new MutationObserver(l => { for (const m of l) { const t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (t && t.closest && t.closest('[data-aw-ignore]')) continue; if (m.type === 'attributes' && /^data-aw/.test(m.attributeName)) continue; muts++; } })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  let clip = 0; try { const w = navigator.clipboard && navigator.clipboard.writeText; if (w) navigator.clipboard.writeText = function () { clip++; return Promise.resolve(); }; } catch (e) {}
  let opened = 0; const wo = W.open; W.open = function (u) { opened++; W.__awOpened = String(u || ''); return null; };
  let dl = 0; const ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download || /^blob:/.test(this.href)) { dl++; return; } return ac.call(this); };
  W.__aw = { vis, layers, clickables, checks, baseline: () => { document.querySelectorAll('[data-aw-base]').forEach(e => e.removeAttribute('data-aw-base')); layers().forEach(l => l.setAttribute('data-aw-base', '1')); },
    snap: () => ({ muts, clip, opened, dl, hash: location.hash, view: document.body.dataset.view || '', focus: document.activeElement ? short(document.activeElement) : '', scroll: Math.round(scrollY + [...document.querySelectorAll('.main, .main > section, [class*=body], [class*=scroll]')].reduce((a, e) => a + e.scrollTop, 0)),
      checked: document.querySelectorAll(':checked').length, top: layers().filter(l => !l.hasAttribute('data-aw-base')).map(path) }) };
})();
"""


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}
    except Exception as e: return 0, {"error": str(e)}


SETTINGS_TABS = ["profile", "account", "ai", "notifications", "privacy", "workspace", "projects", "admin", "a11y", "storage", "about"]
# (name, open js, root selector or None for "whatever layer opened", close js)
SHEETS = [
    ("sheet:create-a-tribe", "TribeNew.open()", None, "TribeNew.close()"),
    ("sheet:people", "TribePeoplePanel.open()", None, "TribePeoplePanel.close()"),
    ("sheet:people-friends", "TribeFriends.open()", None, "TribePeoplePanel.close()"),
    ("sheet:invite-your-claude", "TribeInviteClaude.open()", None, "TribeInviteClaude.close && TribeInviteClaude.close()"),
    ("sheet:home-pill", "TribeHome.open()", None, "TribeHome.close(); TribeHome.closeSheet && TribeHome.closeSheet()"),
    ("sheet:versions", "TribeVersions.open(TribeClient.project && TribeClient.project())", None, "TribeVersions.close()"),
    ("sheet:plans", "TribePlans.open(document.querySelector('#userbar') || document.body)", None, "TribePlans.close()"),
    ("sheet:flint-page", "TribeFlintPage.open()", None, "TribeFlintPage.close()"),
    ("sheet:free-ai-bridge", "TribeAIBridge.open({ src: 'audit' })", None, "TribeAIBridge.close()"),
    ("sheet:widget-picker", "TribeWidgets.openPicker()", None, "TribeWidgets.closePop && TribeWidgets.closePop()"),
    ("sheet:help", "TribeHelp.open()", None, "TribeHelp.close()"),
    ("sheet:guide", "TribeGuide.open()", None, "TribeGuide.close()"),
    ("sheet:palette", "TribePalette.open()", None, "TribePalette.close()"),
    ("sheet:profile-menu", "TribeProfileMenu.open()", None, "TribeProfileMenu.close()"),
    ("sheet:plus-menu", "TribePlus.open(document.querySelector('#side-new, #nest-new, #pj-plus') || document.body)", None, "TribePlus.close && TribePlus.close()"),
    ("sheet:signup", "TribeSignup.open()", None, "TribeSignup.close()"),
    ("sheet:preview", "TribePreview.open()", None, "TribePreview.close()"),
    ("sheet:website-designer", "TribeSiteDesigner.open({ pid: TribeClient.project && TribeClient.project() })", None, "TribeSiteDesigner.close()"),
    ("sheet:flint-chat", "(document.querySelector('#flint-btn, #fl-btn, [data-flint-open]') || { click() {} }).click()", None, "window.TribeFlint && TribeFlint.close && TribeFlint.close()"),
    ("sheet:inbox", "(document.querySelector('#bell, #ub-bell, [data-bell], #inbox-btn') || { click() {} }).click()", None, ""),
]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--state", default="all"); ap.add_argument("--size", default="all")
    ap.add_argument("--out", default="/tmp/audit"); ap.add_argument("--clicks", type=int, default=30); ap.add_argument("--only", default="")
    a = ap.parse_args(); out = Path(a.out); (out / "shots").mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="tribe-walk-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            if api("/health")[0] == 200: break
            time.sleep(0.2)
        host = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        pid = api("/projects", token=host)[1]["projects"][0]["id"]
        tok = {"host": host}
        for role, name in (("builder", "Ada"), ("spectator", "Sam")):
            inv = api("/invites", "POST", {"role": role, "maxUses": 5, "project": "tribe"}, token=host)[1]["invite"]["code"]
            tok[role] = api("/join", "POST", {"code": inv, "name": name})[1]["token"]
        ada = api("/me", token=tok["builder"])[1].get("member", {}).get("id")
        # a little real content so pages are not all empty
        for t in ["hello team", "the build is green", "@Ada can you look at the menu?"]: api("/chat/general", "POST", {"text": t}, token=host, project=pid)
        api("/chat/general", "POST", {"text": "on it"}, token=tok["builder"], project=pid)
        for i, t in enumerate(["Design the start screen", "Fix the jump bug", "Write the store page"]):
            api("/tasks", "POST", {"title": t, **({"assignee": ada} if i == 0 else {})}, token=host, project=pid)
        api("/docs", "POST", {"title": "Game plan", "content": "# Game plan\n\nShip the demo."}, token=host, project=pid)
        api("/bugs", "POST", {"title": "Player falls through the floor", "description": "level 2"}, token=tok["builder"], project=pid)
        api("/talent/gigs", "POST", {"title": "Pixel art for level 2", "kind": "task", "description": "Four tiles"}, token=host, project=pid)

        states = ["none", "host", "builder", "spectator"] if a.state == "all" else [a.state]
        sizes = ["desktop", "phone"] if a.size == "all" else [a.size]
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            for state in states:
                for size in sizes:
                    walk(b, state, size, tok.get(state), out, a.clicks, a.only)
            b.close()
    finally:
        srv.terminate()


def walk(b, state, size, token, out, max_clicks, only):
    t_start = time.time()
    vp = {"width": 1280, "height": 800} if size == "desktop" else {"width": 390, "height": 844}
    kw = dict(viewport=vp) if size == "desktop" else dict(viewport=vp, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx = b.new_context(**kw)
    names = {"none": "Orion", "host": "Orion", "builder": "Ada", "spectator": "Sam"}
    srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
    ctx.add_init_script(f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{names[state]}', onboarded: true, tour: {{done: true}}{srv_}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}})); }} catch (e) {{}}")
    ctx.add_init_script(PAGE_JS)
    pg = ctx.new_page()
    rep = {"state": state, "size": size, "routes": [], "pageErrors": [], "consoleErrors": [], "apiFails": [], "apiCalls": 0, "clicks": 0, "skipped": 0}
    cur = {"route": "boot"}
    pg.on("pageerror", lambda e: rep["pageErrors"].append({"route": cur["route"], "after": cur.get("click", ""), "err": str(e)[:300]}))
    pg.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and rep["consoleErrors"].append({"route": cur["route"], "after": cur.get("click", ""), "err": m.text[:300]}))
    pg.on("dialog", lambda d: d.dismiss())

    def on_resp(r):
        u = r.url
        if "/api/" not in u and not u.endswith("/mcp"): return
        rep["apiCalls"] += 1
        if r.status >= 500 or (r.status >= 400 and r.status not in OK_4XX):
            rep["apiFails"].append({"route": cur["route"], "after": cur.get("click", ""), "call": f"{r.request.method} {u.split(str(PORT), 1)[-1][:120]}", "status": r.status})
    pg.on("response", on_resp)
    pg.on("popup", lambda p: p.close())

    def load():
        pg.goto(BASE + "/?skipIntro=1" + ("&freshopen=1" if state == "none" else ""), wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_function("window.TribeRouter && window.TribeHub && window.TribeShell && window.__aw", timeout=40000)
        if token: pg.wait_for_function("TribeClient.connected()", timeout=45000)
        pg.wait_for_timeout(1500)
    load()

    dests = pg.evaluate("TribeShell.dests().filter(d => d.visible).map(d => d.key)")
    hidden = pg.evaluate("TribeShell.dests().filter(d => !d.visible).map(d => d.key)")
    routes = []
    if state == "none":
        routes += [("go:" + k, f"TribeRouter.go('{k}')") for k in ["hub", "docs-all", "design-all", "repos-all", "work", "fleet"]]
        routes += [("blocked:" + k, f"TribeShell.go('{k}')") for k in ["chat", "ws-tasks", "company"]]
    else:
        routes += [("go:" + k, f"TribeShell.go('{k}')") for k in dests]
        routes += [("hidden:" + k, f"TribeShell.go('{k}')") for k in hidden]
    routes += [("hash:#/workshop", "location.hash = '#/workshop'"), ("hash:#/market", "location.hash = '#/market'"), ("hash:#/studios", "location.hash = '#/studios'")]
    routes += [("settings:" + t, f"TribeSettings.open('{t}')") for t in SETTINGS_TABS]
    sheets = {n: (o, c) for n, o, _, c in SHEETS}
    routes += [(n, o) for n, o, _, _ in SHEETS]
    if only: routes = [r for r in routes if re.search(only, r[0])]

    def close_layers(name):
        left = []
        for _ in range(3):
            if not pg.evaluate("__aw.snap().top.length"): break
            pg.keyboard.press("Escape"); pg.wait_for_timeout(180)
        left = pg.evaluate("__aw.snap().top")
        if left:   # Esc did not close it: try its own close call, then any close button
            c = sheets.get(name, ("", ""))[1]
            try:
                if name.startswith("settings:"): pg.evaluate("TribeSettings.close()")
                elif c: pg.evaluate(c)
            except Exception: pass
            pg.wait_for_timeout(150)
            if pg.evaluate("__aw.snap().top.length"):
                try: pg.evaluate("document.querySelectorAll('[data-close], [aria-label=Close], .x, .close, [data-x]').forEach(b => { try { if (__aw.vis(b)) b.click() } catch (e) {} })")
                except Exception: pass
                pg.wait_for_timeout(150)
        return left

    def enter(name, js):
        cur["route"] = name; cur["click"] = ""
        try: pg.evaluate("() => { " + js + " }")
        except Exception as e: return str(e)[:200]
        pg.wait_for_timeout(700)
        return None

    for name, js in routes:
        is_layer = name.startswith(("settings:", "sheet:"))
        try:
            pg.evaluate("__aw.baseline()")
        except Exception:
            load(); pg.evaluate("__aw.baseline()")
        r = {"route": name, "noop": [], "stuck": [], "escFails": [], "wrong": [], "clicked": 0, "skipped": 0}
        err = enter(name, js)
        if err: r["openError"] = err
        if not is_layer:
            tops = pg.evaluate("__aw.snap().top")
            if tops: is_layer = True; r["opened"] = tops   # this destination is itself a sheet (Versions, Customize, project settings…): walk it and close it
        if not is_layer: pass
        else:
            r["opened"] = pg.evaluate("__aw.snap().top")
            if not r["opened"]: r["didNotOpen"] = True
        pg.wait_for_timeout(1800)   # let slow loads finish, so "Loading…" still on screen is real
        r["where"] = pg.evaluate("(() => { try { return TribeRouter.where() } catch (e) { return null } })()")
        try: r["checks"] = pg.evaluate("__aw.checks()")
        except Exception as e: r["checks"] = {"error": str(e)[:200]}
        base_view = pg.evaluate("document.body.dataset.view || ''"); base_hash = pg.evaluate("location.hash")
        done = set(); guard = 0
        while r["clicked"] < max_clicks and guard < max_clicks * 3:
            guard += 1
            try: items = pg.evaluate("__aw.clickables()")
            except Exception: break
            nxt = next((it for it in items if it["sig"] not in done), None)
            if not nxt: break
            done.add(nxt["sig"])
            if SKIP.search(nxt["label"]) or SKIP.search(nxt["sig"]) or nxt["tag"] == "SELECT" or (nxt["href"] and not nxt["href"].startswith("#")) or nxt["type"] in ("file",):
                r["skipped"] += 1; continue
            cur["click"] = nxt["label"] or nxt["sig"]
            before = pg.evaluate("__aw.snap()"); n_api = rep["apiCalls"]; n_err = len(rep["pageErrors"])
            try:
                loc = pg.locator(f"[data-aw-i='{nxt['i']}']").first
                loc.scroll_into_view_if_needed(timeout=1000)
                loc.click(timeout=1500)
            except Exception as e:
                msg = str(e)
                if "intercepts pointer events" in msg:
                    m = re.search(r"<([^>]{0,120})>[^<]*intercepts pointer events", msg)
                    r["stuck"].append({"label": nxt["label"], "el": nxt["path"], "by": m.group(1) if m else "?"})
                elif "Timeout" in msg: r["stuck"].append({"label": nxt["label"], "el": nxt["path"], "by": "not clickable in 1.5s"})
                continue
            r["clicked"] += 1
            pg.wait_for_timeout(320)
            try: after = pg.evaluate("__aw.snap()")
            except Exception:
                pg.wait_for_timeout(800)
                try: after = pg.evaluate("__aw.snap()")
                except Exception: load(); enter(name, js); continue
            changed = any(after[k] != before[k] for k in ("hash", "view", "clip", "opened", "dl", "checked", "scroll")) or after["muts"] - before["muts"] > 0 or rep["apiCalls"] > n_api or after["top"] != before["top"]
            if not changed: r["noop"].append({"label": nxt["label"], "el": nxt["path"]})
            new_layers = [l for l in after["top"] if l not in before["top"]]
            if new_layers:
                try:
                    ck = pg.evaluate("__aw.checks()")
                    bad = {k: v for k, v in ck.items() if k in ("small", "clipped", "offscreen", "covered", "raw", "loading") and v} | ({"hscroll": True} if ck.get("hscroll") else {})
                    if bad:
                        r.setdefault("layerChecks", []).append({"after": nxt["label"], "layer": new_layers, **bad})
                        if len(r.get("layerChecks", [])) <= 2:
                            try: pg.screenshot(path=str(out / "shots" / f"{state}-{size}-{re.sub(r'[^a-z0-9]+', '-', name.lower())}-layer{len(r['layerChecks'])}.png"))
                            except Exception: pass
                except Exception: pass
                # close what this click opened (not the sheet under test)
                for _ in range(2):
                    if not [l for l in pg.evaluate("__aw.snap().top") if l not in before["top"]]: break
                    pg.keyboard.press("Escape"); pg.wait_for_timeout(180)
                still = [l for l in pg.evaluate("__aw.snap().top") if l not in before["top"]]
                if still:
                    r["escFails"].append({"after": nxt["label"], "layer": still})
                    try: pg.evaluate("document.querySelectorAll('[data-close], [aria-label=Close], .x, .close, [data-x]').forEach(b => { try { if (__aw.vis(b)) b.click() } catch (e) {} })")
                    except Exception: pass
                    pg.wait_for_timeout(150)
            # a click that left the page: note where it went, come back
            now_view = pg.evaluate("document.body.dataset.view || ''")
            gone_layer = is_layer and not pg.evaluate("__aw.snap().top.length")
            if (not is_layer and (now_view != base_view)) or gone_layer:
                r["wrong"].append({"label": nxt["label"], "to": now_view + " " + pg.evaluate("location.hash")}) if len(r["wrong"]) < 25 else None
                close_layers(name); enter(name, js)
                if not is_layer: pg.evaluate("__aw.baseline()")
        cur["click"] = ""
        left = close_layers(name)
        if is_layer and left: r["escDoesNotClose"] = left
        still = pg.evaluate("__aw.snap().top")
        if still:
            r["leftOpen"] = still; load()
        ck = r.get("checks") or {}
        bad = r["stuck"] or r.get("escDoesNotClose") or r.get("leftOpen") or r.get("didNotOpen") or any(ck.get(k) for k in ("hscroll", "clipped", "offscreen", "covered", "loading", "raw"))
        if bad:
            try:
                enter(name, js); pg.wait_for_timeout(900)
                pg.screenshot(path=str(out / "shots" / f"{state}-{size}-{re.sub(r'[^a-z0-9]+', '-', name.lower())}.png")); close_layers(name)
                if pg.evaluate("__aw.snap().top.length"): load()
            except Exception: pass
        rep["clicks"] += r["clicked"]; rep["skipped"] += r["skipped"]
        rep["routes"].append(r)
        print(f"  {state}/{size} {name}: {r['clicked']} clicks, {len(r['noop'])} no-op, {len(r['stuck'])} blocked" + (" DID-NOT-OPEN" if r.get("didNotOpen") else "") + (" LEFT-OPEN" if r.get("leftOpen") else ""), flush=True)
    rep["seconds"] = int(time.time() - t_start)
    (out / f"walk-{state}-{size}.json").write_text(json.dumps(rep, indent=1))
    print(f"{state}/{size}: {len(rep['routes'])} routes, {rep['clicks']} clicks, {len(rep['pageErrors'])} page errors, {len(rep['consoleErrors'])} console errors, {len(rep['apiFails'])} api fails, {rep['seconds']}s", flush=True)
    ctx.close()


if __name__ == "__main__":
    main()
