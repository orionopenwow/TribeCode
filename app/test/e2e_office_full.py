"""The office, full page (app/ui/officefull.js, feat/office-full): a project's Agents & office.
  1. 1440x900: the pixel floor fills the main area (beside the side panel, open and folded), most of its height, at a
     whole-pixel zoom; its art covers the whole floor area (more building around the office, no dark bands) with
     everyone in view, at 1440 (panel open and folded), 1920x1080 and 1100 wide; drag looks around, Fit puts it back; the head is one line; no people grid under the floor; no "Get set up" cards once an AI helper is in.
  2. The toolbar: Floor | Desks, zoom - +, and one ... menu holding Your look, the office's set, Edit layout, Sound, Hide
     the office for me, Where your tribe runs, What's private and GitHub.
  3. The box: one slim pill over the floor (not a band), two chips only while focused and empty; a plain message shows in
     Messages #general for a second browser; replies show above it; Up recalls, Esc clears; "/" lists the commands and
     "/task ..." makes a task; "@claude ..." gives the AI helper a task; Flint commands ("invite a friend", "what's
     everyone doing") run in Flint and never post to the chat; "add claude" opens Claude's setup.
  4. The side panel: Preview shows App and Website tabs (both exist) and switches; Working on shows the AI helper's
     work and an approval that works right there; Updates lists recent events, newest first.
  5. 390px: the desks, the box pinned at the bottom, the panel as a bottom sheet from a tab strip; no sideways scroll,
     40px targets.
Screenshots: /tmp/office-full-1440.png (Preview), /tmp/office-full-1440-working.png, /tmp/office-full-390.png.
Usage: python app/test/e2e_office_full.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 7790 + OFF; BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def mcp(token, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())


def tool(token, name, args=None): return mcp(token, "tools/call", {"name": name, "arguments": args or {}})["result"]


def until(pg, js, timeout=20, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError(f"timed out: {what or js}")


COVER = """(() => { const os = document.querySelector('#ad-office .os').__os, st = document.querySelector('#ad-office .os-stage').getBoundingClientRect();
  const p = os.painted(), c = document.querySelector('#ad-office .os-canvas'), x = c.getContext('2d'), W = c.width, H = c.height;
  // the art reaches every edge: no pixel of the dark backdrop (the set's void colour) along the borders
  // every 6px along all four edges, two pixels in, and a column 40px in (under the toolbar): never the backdrop colour or near it
  const edge = []; for (let a = 0; a < W; a += 6) edge.push([a, 1], [a, H - 2]); for (let b = 0; b < H; b += 6) edge.push([1, b], [W - 2, b], [40, b]);
  const near = d => Math.abs(d[0] - 18) <= 12 && Math.abs(d[1] - 21) <= 12 && Math.abs(d[2] - 26) <= 12;
  const bareAt = edge.filter(([a, b]) => near(x.getImageData(a, b, 1, 1).data)), bare = bareAt.length;
  const ch = os.chars().filter(q => q.visible).map(q => { const t = os.tileXY(q.x, q.y); return [q.id, t.x >= st.left && t.x <= st.right && t.y - 20 >= st.top && t.y <= st.bottom]; });
  const L = os.layout(), whole = (() => { const a = os.tileXY(0, 0), b = os.tileXY(L.w - 1, L.h - 1); return a.x >= st.left - 1 && a.y >= st.top - 1 && b.x <= st.right + 1 && b.y <= st.bottom + 1; })();
  return { st: [st.left, st.top, st.right, st.bottom], p: [p.left, p.top, p.right, p.bottom], bare, bareAt: bareAt.slice(0, 5), whole, off: ch.filter(q => !q[1]).map(q => q[0]), n: ch.length, scale: os.scale() }; })()"""


def covers(pg, what):
    until(pg, "(document.querySelector('#ad-office .os') || {}).__os && document.querySelector('#ad-office .os').__os.art() && document.querySelector('#ad-office .os').__os.scale() > 0", 20, "drawn")
    pg.wait_for_timeout(700)
    r = pg.evaluate(COVER)
    assert all(abs(a - b) <= 2 for a, b in zip(r["st"], r["p"])), (what, "the art covers the floor area", r)
    assert r["bare"] == 0, (what, "no dark bands", r)
    assert r["n"] >= 2 and not r["off"], (what, "everyone in view", r)
    assert r["scale"] == int(r["scale"]) and r["scale"] >= 1, (what, "whole pixels", r)
    assert r["whole"] or r["scale"] == 2, (what, "the whole office is in view", r)
    tg = pg.evaluate("""(() => { const t = [...document.querySelectorAll('#ad-office .os-tag')].map(e => [e.querySelector('.os-name').getBoundingClientRect(), e.dataset.osWho]);
      const hit = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i][0], b = t[j][0]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hit.push([t[i][1], t[j][1]]); }
      return { h: t.map(x => Math.round(x[0].height)), hit }; })()""")
    assert tg["h"] and min(tg["h"]) >= 18, (what, "name tags are pixel plates, not slim pills", tg)
    assert not tg["hit"], (what, "tags never overlap", tg)
    return r


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ofl-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        pid = ok(api("/projects", "POST", {"name": "Trail Mates"}, token=camp))["project"]["id"]
        ok(api("/office", "PUT", {"on": True}, token=camp), "the pixel floor on")
        ok(api(f"/projects/{pid}/site-config", "PUT", {"config": {"pages": [{"blocks": [{"type": "hero", "props": {"title": "Trail Mates online", "subtitle": "Run together"}}]}]}, "force": True}, token=camp, project=pid), "a website")
        # an AI helper of Camp's, connected
        key = ok(api("/agents", "POST", {"kind": "claude"}, token=camp, project=pid))
        akey = key.get("key") or key.get("token"); aid = key["agent"]["id"]
        assert akey, key
        mcp(akey, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "claude-code"}})
        tool(akey, "my_lane", {})
        tool(akey, "claim_file", {"path": "src/leaderboard.js", "note": "the leaderboard"})
        # a second AI helper, so four characters share the floor (their tags must not overlap)
        k2 = ok(api("/agents", "POST", {"kind": "codex"}, token=camp, project=pid)); c2key = k2.get("key") or k2.get("token")
        mcp(c2key, "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "codex"}}); tool(c2key, "claim_file", {"path": "src/map.js", "note": "the map"})

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1440, h=900, mobile=False, token=None, name='Camp'):
                kw = {"viewport": {"width": w, "height": h}}
                if mobile: kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
                c = b.new_context(**kw)
                c.add_init_script("try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.office.view', 'floor');"
                                  " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, theme: 'dark', tour: {done: true}, server: {url: '%s', token: '%s'}})); } } catch (e) {}" % (name, BASE, token or camp))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOfficeFull && window.TribeShell && window.TribeAppCore", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_function(f"TribeProjects.current() === '{pid}'", timeout=10000)
                return pg

            cp = page()
            # an app too (App Creator's own template, no AI): the Preview gets App | Website
            cp.evaluate("([pid]) => TribeClient.api(`/projects/${pid}/app-config`, { method: 'PUT', project: pid, body: { config: TribeAppCore.template('running', { name: 'Trail Mates' }) } })", [pid])
            cp.evaluate("TribeShell.go('ws-agents')")
            cp.wait_for_selector("#view-coord:not(.hidden) .ao-full #ao-head", timeout=15000)
            cp.wait_for_selector("#ad-office .os-stage", timeout=20000)
            cp.wait_for_function("document.querySelector('[data-hub]') && document.querySelector('[data-hub]').dataset.hub === 'dash'", timeout=20000)
            cp.evaluate("TribeOfficeFull.panel(true)"); cp.wait_for_timeout(600)
            until(cp, "(document.querySelector('#ad-office .os') || {}).__os && document.querySelector('#ad-office .os').__os.art() && document.querySelector('#ad-office .os').__os.scale() > 0", 20, "the floor is drawn")

            # ---------- 1. the floor fills the page ----------
            def geo():
                return cp.evaluate("""(() => { const r = e => document.querySelector(e).getBoundingClientRect();
                  const m = r('#main'), s = r('#ao-side'), st = r('#ad-office .os-stage'), dock = r('#ao-dock'), head = r('#ao-head');
                  const os = document.querySelector('#ad-office .os').__os;
                  return { mw: m.width, ml: m.left, mt: m.top, mh: m.height, side: s.width, sl: s.left, w: st.width, l: st.left, top: st.top, h: st.height, dock: dock.top, head: head.height, scale: os.scale() }; })()""")
            g = geo(); c1 = covers(cp, "1440 open")
            assert abs((g["w"] + g["side"]) - g["mw"]) <= 4 and abs(g["l"] - g["ml"]) <= 2, ("panel open: the floor fills the width beside it", g)
            assert g["side"] >= 340, g
            assert g["h"] >= 0.8 * g["mh"] and abs(g["top"] + g["h"] - (g["mt"] + g["mh"])) <= 2, ("most of the height, down to the bottom edge under the box", g)
            assert g["head"] <= 60, ("the head is one line", g)
            assert g["scale"] == int(g["scale"]) and g["scale"] >= 1, ("whole pixels", g["scale"])
            assert cp.evaluate("getComputedStyle(document.querySelector('#ad-office .os-canvas')).imageRendering") in ("pixelated", "crisp-edges")
            assert cp.locator("#ad-office .of-roster, #ao-setup, #ao-head .eyebrow").count() == 0, "no people grid, no setup cards, no eyebrow"
            assert cp.locator(f"#ao-here [data-desk='{aid}']").count() == 1, "the avatars in the head"
            cp.click("#ofl-fold"); cp.wait_for_function("document.querySelector('#ad-dash').dataset.panel === 'closed'"); cp.wait_for_timeout(500)
            g2 = geo(); c2 = covers(cp, "1440 folded")
            assert g2["side"] <= 56 and abs((g2["w"] + g2["side"]) - g2["mw"]) <= 4 and g2["w"] > g["w"] + 300, ("folded to a rail, the floor grows", g2)
            cp.screenshot(path="/tmp/office-full-1440-folded.png")
            cp.click("#ofl-tab-preview"); cp.wait_for_function("document.querySelector('#ad-dash').dataset.panel === 'open'")
            sizes = {}
            for w, h in ((1920, 1080), (1100, 800)):
                cp.set_viewport_size({"width": w, "height": h}); cp.wait_for_timeout(500)
                sizes[w] = covers(cp, f"{w}x{h}")["scale"]
                gg = geo(); assert abs(gg["top"] + gg["h"] - (gg["mt"] + gg["mh"])) <= 2, (w, "the floor runs to the bottom edge", gg)
                cp.screenshot(path=f"/tmp/office-full-{w}.png")
            cp.set_viewport_size({"width": 1440, "height": 900}); cp.wait_for_timeout(500)
            # drag to look around; Fit in the menu puts it back
            o0 = cp.evaluate("document.querySelector('#ad-office .os').__os.tileXY(5, 5)")
            st = cp.evaluate("document.querySelector('#ad-office .os-stage').getBoundingClientRect().toJSON()")
            cp.mouse.move(st["x"] + st["width"] / 2, st["y"] + st["height"] / 2); cp.mouse.down(); cp.mouse.move(st["x"] + st["width"] / 2 + 120, st["y"] + st["height"] / 2 + 40, steps=6); cp.mouse.up()
            o1 = cp.evaluate("document.querySelector('#ad-office .os').__os.tileXY(5, 5)")
            assert abs(o1["x"] - o0["x"] - 120) <= 2, (o0, o1)
            cp.click("#ao-more"); cp.click("#ao-menu [data-aom='fit']"); cp.wait_for_timeout(300)
            o2 = cp.evaluate("document.querySelector('#ad-office .os').__os.tileXY(5, 5)")
            assert abs(o2["x"] - o0["x"]) <= 1, (o0, o2)
            covers(cp, "after Fit")
            box = cp.evaluate("(() => { const r = [...document.querySelectorAll('#ad-office .os-tag')].map(e => e.getBoundingClientRect()); const x0 = Math.min(...r.map(q => q.left)) - 40, y0 = Math.min(...r.map(q => q.top)) - 20, x1 = Math.max(...r.map(q => q.right)) + 40, y1 = Math.max(...r.map(q => q.bottom)) + 70; return { x: Math.max(0, x0), y: Math.max(0, y0), width: x1 - Math.max(0, x0), height: y1 - Math.max(0, y0) }; })()")
            cp.screenshot(path="/tmp/office-full-tags.png", clip=box)
            print("ok  1b. the art covers the floor area with no dark bands, everyone in view: 1440 open %dx, folded %dx, 1920 %dx, 1100 %dx; drag and Fit" % (c1["scale"], c2["scale"], sizes[1920], sizes[1100]))
            print("ok  1. the floor fills the main area (open %dx%d at %dx, folded %d wide); one-line head" % (g["w"], g["h"], g["scale"], g2["w"]))

            # ---------- 2. the toolbar ----------
            bar = cp.eval_on_selector_all("#ao-bar > *", "els => els.map(e => e.className.split(' ')[0])")
            assert bar == ["ofl-seg", "ofl-zoom", "ofl-ib"], bar
            assert cp.locator("#ao-bar [data-ofl-view]").count() == 2 and cp.locator("#ad-office .os-bar:visible").count() == 0
            s0 = cp.evaluate("document.querySelector('#ad-office .os').__os.scale()")
            cp.click("#ao-bar [data-ofl-zoom='in']"); cp.wait_for_timeout(200)
            assert cp.evaluate("document.querySelector('#ad-office .os').__os.scale()") == s0 + 1
            cp.click("#ao-bar [data-ofl-zoom='out']")
            cp.click("#ao-more"); cp.wait_for_selector("#ao-menu")
            items = cp.eval_on_selector_all("#ao-menu [data-aom]", "els => els.map(e => e.dataset.aom)")
            assert items == ["fit", "look", "edit", "sound", "hide", "where", "privacy", "how", "github"], items
            assert cp.locator("#ao-menu [data-aom-set] option").count() >= 2, "the office's set"
            cp.click("#ao-menu [data-aom='sound']"); assert cp.get_attribute("#ao-menu [data-aom='sound']", "aria-checked") == "true"
            cp.click("#ao-menu [data-aom='sound']")
            cp.click("#ao-menu [data-aom='look']"); cp.wait_for_selector("#olk-sheet [data-olk-tab='hair']", timeout=5000)   # the character creator (officelooks.js)
            cp.keyboard.press("Escape")
            cp.click("#ao-more"); cp.click("#ao-menu [data-aom='where']"); cp.wait_for_selector("#ao-where-sheet .ao-opt", timeout=8000); cp.keyboard.press("Escape")
            cp.wait_for_selector("#ao-where-sheet", state="detached", timeout=5000)
            cp.click("#ao-more"); cp.click("#ao-menu [data-aom='privacy']"); cp.wait_for_selector("#ao-privacy-sheet #ao-facts", timeout=8000); cp.keyboard.press("Escape")
            cp.wait_for_selector("#ao-privacy-sheet", state="detached", timeout=5000)
            cp.click("#ao-more"); cp.wait_for_function("(document.querySelector('#ao-menu [data-aom=\"github\"] small') || {}).textContent && document.querySelector('#ao-menu [data-aom=\"github\"] small').textContent.includes('Not backed up')", timeout=8000)
            cp.keyboard.press("Escape"); cp.wait_for_selector("#ao-menu", state="detached")
            cp.click("#ao-bar [data-ofl-view='desks']"); cp.wait_for_selector("#ad-office .of-desk[data-desk='flint']", timeout=8000)
            assert cp.locator("#ao-bar .ofl-zoom").count() == 0, "no zoom on the desks"
            cp.click("#ao-more"); cp.click("#ao-menu [data-aom='hide']"); cp.wait_for_selector("#ad-office [data-of-show]", timeout=5000)
            cp.click("#ad-office [data-of-show]"); cp.wait_for_selector("#ad-office .of-desk", timeout=5000)
            cp.click("#ao-bar [data-ofl-view='floor']"); cp.wait_for_selector("#ad-office .os-stage", timeout=8000)
            print("ok  2. toolbar: Floor | Desks, zoom, one ... menu:", items)

            # ---------- 3. the box: one slim pill over the floor ----------
            inp = "#ao-box .fl-in"
            pill = cp.evaluate("(() => { const p = document.querySelector('#ao-box .fl-bar').getBoundingClientRect(), m = document.querySelector('.ofl-main').getBoundingClientRect(); return { w: p.width, mw: m.width, bottom: p.bottom, mb: m.bottom }; })()")
            assert pill["w"] <= 722 and pill["w"] < pill["mw"] - 40 and 0 <= pill["mb"] - pill["bottom"] <= 24, ("a pill over the floor, not a band", pill)
            assert cp.get_attribute(inp, "placeholder") == "Message the tribe or ask Flint…"
            # the same bar as Messages: radius, height, border, font and button size
            same = cp.evaluate("""(() => { const g = (e, k) => getComputedStyle(e)[k], a = document.querySelector('#ao-box .compose'), b = document.querySelector('#chat-form');
              const ab = a.querySelector('.fl-send'), bb = document.querySelector('#chat-form .cx-btn'), ai = a.querySelector('.fl-in'), bi = document.querySelector('#chat-input');
              return { r: [g(a, 'borderTopLeftRadius'), g(b, 'borderTopLeftRadius')], h: [a.getBoundingClientRect().height, parseFloat(g(b, 'height'))], bd: [g(a, 'borderTopWidth') + g(a, 'borderTopStyle'), g(b, 'borderTopWidth') + g(b, 'borderTopStyle')],
                bg: [g(a, 'backgroundColor'), g(b, 'backgroundColor')], f: [g(ai, 'fontSize'), g(bi, 'fontSize')], btn: [ab.getBoundingClientRect().width, bb ? parseFloat(g(bb, 'width')) : 0] }; })()""")
            assert same["r"][0] == same["r"][1] and abs(same["h"][0] - same["h"][1]) <= 2 and same["bd"][0] == same["bd"][1] and same["bg"][0] == same["bg"][1] and same["f"][0] == same["f"][1] and abs(same["btn"][0] - same["btn"][1]) <= 1, ("the Messages composer's look", same)
            # toasts sit above the pill; nothing sits over it
            cp.evaluate("TribeApp.toast('Needs your OK: a very long line that would sit right over the box at the bottom')"); cp.wait_for_timeout(300)
            ov = cp.evaluate("""(() => { const p = document.querySelector('#ao-box .compose').getBoundingClientRect(), t = [...document.querySelectorAll('.toast')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
              const hit = t.some(r => r.bottom > p.top && r.top < p.bottom && r.right > p.left && r.left < p.right);
              const pts = [[p.left + 14, p.top + p.height / 2], [p.left + p.width / 2, p.top + 4], [p.right - 14, p.top + p.height / 2]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#ao-box')); });
              return { hit, pts }; })()""")
            assert not ov["hit"] and all(ov["pts"]), ("nothing over the pill", ov)
            assert cp.locator("#ao-box .fl-chip:visible").count() == 0, "no chips until the box is focused"
            cp.click(inp); cp.wait_for_selector("#ao-box .fl-chip", timeout=3000)
            chips = cp.eval_on_selector_all("#ao-box .fl-chip", "els => els.map(e => e.textContent)")
            assert len(chips) == 2 and chips[0].startswith("Give "), chips
            cp.keyboard.type("M"); cp.wait_for_function("!document.querySelector('#ao-box .fl-chip')", timeout=3000)
            cp.fill(inp, "")
            def chat_has(t):
                end = time.time() + 15
                while time.time() < end:
                    ms = ok(api("/chat/general", token=camp, project=pid)).get("messages", [])
                    if any(m.get("text") == t for m in ms): return ms
                    time.sleep(0.3)
                raise AssertionError(f"not in chat: {t}")
            # a plain message is a message in Messages #general, for everyone
            sam = ok(api("/join", "POST", {"code": ok(api("/invites", "POST", {"maxUses": 1}, token=camp))["invite"]["code"], "name": "Sam"}))["token"]
            sp = page(token=sam, name="Sam"); sp.evaluate("TribeApp.show('chat')"); sp.wait_for_selector("#chat-list", timeout=10000)
            cp.fill(inp, "Morning all, the trail map is next"); cp.press(inp, "Enter")
            chat_has("Morning all, the trail map is next")
            sp.wait_for_function("document.querySelector('#chat-list').innerText.includes('the trail map is next')", timeout=15000)
            cp.wait_for_selector("#ad-dash[data-replies='on'] #ao-replies .fl-ev", timeout=5000)
            assert "Open in Messages" in cp.inner_text("#ao-replies") and "Ask Flint instead" in cp.inner_text("#ao-replies")
            # a reply in the chat shows in the strip
            sp.fill("#chat-input", "On it after lunch"); sp.press("#chat-input", "Enter")
            until(cp, "document.querySelector('#ao-replies').innerText.includes('On it after lunch')", 10, "a reply shows above the box")
            sp.context.close()
            cp.click("#ao-replies-x"); cp.wait_for_function("!document.querySelector('#ad-dash').dataset.replies")
            # Up brings back what you sent; Esc clears
            cp.click(inp); cp.keyboard.press("ArrowUp"); assert cp.input_value(inp) == "Morning all, the trail map is next"
            cp.keyboard.press("Escape"); assert cp.input_value(inp) == ""
            # "/" opens the commands
            cp.keyboard.type("/"); cp.wait_for_selector("#ao-cmds:not([hidden]) [data-ofl-cmd]", timeout=3000)
            cmds = cp.eval_on_selector_all("#ao-cmds [data-ofl-cmd]", "els => els.map(e => e.dataset.oflCmd.trim())")
            assert cmds == ["/task", "/ai", "/invite", "/flint", "/look", "/where"], cmds
            cp.keyboard.press("Enter"); assert cp.input_value(inp) == "/task ", cp.input_value(inp)
            cp.keyboard.type("Draw the trail map"); cp.keyboard.press("Enter")
            end = time.time() + 15; ts = []
            while time.time() < end:
                ts = [t for t in ok(api("/tasks", token=camp, project=pid)).get("tasks", []) if t.get("title") == "Draw the trail map"]
                if ts: break
                time.sleep(0.3)
            assert ts, "/task made the task"
            # "@claude do X": a task for that AI helper, straight from the box (the @ picker offers it)
            cp.click(inp); cp.keyboard.type("@my"); cp.wait_for_selector("#mention-pop .mn-opt", timeout=5000); cp.keyboard.press("Escape")
            cp.fill(inp, "@claude add a weekly leaderboard"); cp.press(inp, "Enter")
            end = time.time() + 15; ts = []
            while time.time() < end:
                ts = [t for t in ok(api("/tasks", token=camp, project=pid)).get("tasks", []) if t.get("title") == "add a weekly leaderboard"]
                if ts: break
                time.sleep(0.3)
            assert ts and ts[0].get("assignee") == aid, ts
            until(cp, "document.querySelector('#ao-replies').innerText.includes('Task given to')", 8, "it says so")
            # Flint commands run in Flint, never in the chat
            n_chat = len(ok(api("/chat/general", token=camp, project=pid)).get("messages", []))
            cp.fill(inp, "invite a friend"); cp.press(inp, "Enter")
            cp.wait_for_selector("#invite-modal:not(.hidden), #inv-sheet, .ui-sheet [data-inv], #io-sheet", timeout=10000)
            cp.keyboard.press("Escape"); cp.wait_for_timeout(400)
            if cp.evaluate("!!(window.TribeInvite && TribeInvite.close)"): cp.evaluate("TribeInvite.close()")
            cp.wait_for_timeout(2600)
            assert cp.evaluate("!document.querySelector('#flint-fly.on')"), "Flint's flame does not stay parked on this page"
            cp.fill(inp, "What's everyone doing?"); cp.press(inp, "Enter")
            until(cp, "document.querySelector('#ao-replies').innerText.includes('Claude · Camp:')", 8, "who is doing what")
            assert len(ok(api("/chat/general", token=camp, project=pid)).get("messages", [])) == n_chat, "Flint's, not the chat's"
            # "add claude": the Add an AI helper setup, on Claude
            cp.fill(inp, "add claude"); cp.press(inp, "Enter")
            cp.wait_for_selector("#invite-modal:not(.hidden) #ic-body [data-ic-kind='code'].on", timeout=10000)
            assert "claude" in cp.inner_text("#invite-modal:not(.hidden)").lower()
            cp.evaluate("TribeInvite.close()"); cp.wait_for_timeout(300)
            cp.click("#ao-replies-x") if cp.evaluate("document.querySelector('#ad-dash').dataset.replies === 'on'") else None
            print("ok  3. the box: a pill, chips on focus, a message lands in Messages for Sam, / commands, /task, @claude gets a task, Flint commands stay out of the chat, add claude opens its setup")

            # ---------- 4. the side panel ----------
            cp.click("#ofl-tab-preview")
            cp.wait_for_selector("#ao-preview-slot #db-band-office [role=tab]", timeout=15000)
            tabs = cp.eval_on_selector_all("#db-band-office [role=tablist] [role=tab]", "els => els.map(e => e.textContent.trim())")
            assert tabs == ["App", "Website"], tabs
            cp.click("#db-band-office [role=tab][data-show=site]")
            cp.wait_for_function("document.querySelector('#db-band-office').dataset.pick === 'site'", timeout=8000)
            assert "Open designer" in cp.inner_text("#db-band-office .db-acts")
            cp.click("#db-band-office [role=tab][data-show=phone]")
            cp.wait_for_function("document.querySelector('#db-band-office').dataset.pick === 'phone'", timeout=8000)
            cp.click("#ao-replies-x") if cp.evaluate("document.querySelector('#ad-dash').dataset.replies === 'on'") else None
            cp.wait_for_timeout(800); cp.screenshot(path="/tmp/office-full-1440.png")
            # Working on: its work, and an approval that works right there
            tool(akey, "request_approval", {"title": "Drop the old scores table", "risk": "high"})
            cp.evaluate("TribeOffice.refresh()")
            cp.click("#ofl-tab-work")
            APPROVE = "#ao-work #ad-needs [data-ao-ap='approve']"
            cp.wait_for_selector(APPROVE, timeout=15000)
            until(cp, "document.querySelector('#ad-needs').innerText.includes('Drop the old scores table')", 10, "the ask shows under Needs you")
            cp.wait_for_selector(f"#ao-work #fl-agents [data-fl-agent='{aid}']", timeout=10000)
            veil = cp.evaluate("[...document.querySelectorAll('.ui-veil, .ui-scrim')].map(e => (e.nextElementSibling || {}).id || e.className)")
            assert not veil, ("nothing covers the page when an AI helper asks", veil)
            # one order: Needs you, Working now, Up next, Here; plain words, no task slugs
            order = cp.evaluate("[...document.querySelectorAll('#ao-work > .ofl-sec')].map(e => e.id)")
            assert order[:2] == ["ad-needs", "fl-agents"] and order.index("fl-agents") < order.index("ao-people"), order
            assert [x for x in ["ad-needs", "fl-agents", "ao-doing", "ao-people"] if x in order] == [x for x in order if x in ["ad-needs", "fl-agents", "ao-doing", "ao-people"]], order
            wtxt = cp.inner_text("#ao-work")
            assert "task/t-" not in wtxt and "Claimed" not in wtxt and "1 agent ·" not in wtxt and "Next step" not in wtxt, wtxt
            row = f"#ao-work [data-fl-agent='{aid}']"
            line = cp.inner_text(f"{row} .fl-lhead")
            assert "Claude" in line and "yours" in line and "leaderboard" in line.lower(), line
            assert cp.locator(f"{row} .fl-r-acts").count() == 0 and cp.locator(f"{row} .fl-lmore").count() == 1, "collapsed: only the ⋯"
            cp.wait_for_timeout(500); cp.screenshot(path="/tmp/office-full-1440-working.png")
            cp.click(f"{row} .fl-lhead"); cp.wait_for_selector(f"{row} .fl-lbody [data-fl-act='pause']", timeout=5000)
            acts = cp.eval_on_selector_all(f"{row} .fl-r-acts [data-fl-act]", "els => els.map(e => e.dataset.flAct)")
            assert acts[:2] == ["msg", "task"] and "pause" in acts and "cmd" in acts and "remove" in acts, acts
            assert "leaderboard.js" in cp.inner_text(f"{row} .fl-lbody")
            cp.click(f"{row} [data-fl-act='task']"); cp.wait_for_selector(f"{row} [data-fl-form='task'] input", timeout=5000)
            cp.click(f"{row} .fl-lmore"); cp.wait_for_function(f"!document.querySelector(\"{row} .fl-lbody\")", timeout=5000)
            cp.locator(APPROVE).first.click()
            end = time.time() + 10; done = False
            while time.time() < end:
                aps = ok(api("/approvals", token=camp, project=pid)).get("approvals", [])
                if any(a.get("title") == "Drop the old scores table" and a.get("status") == "approved" for a in aps): done = True; break
                time.sleep(0.3)
            assert done, "approved from Working on"
            until(cp, "!document.querySelector('#ad-needs') || !document.querySelector('#ad-needs').innerText.includes('Drop the old scores table')", 15, "the ask goes away")
            # Updates: recent events, newest first
            tool(akey, "post_update", {"text": "Leaderboard skeleton is in"}) if "post_update" in json.dumps(mcp(akey, "tools/list")) else None
            cp.click("#ofl-tab-updates")
            cp.wait_for_function("document.querySelectorAll('#ao-updates .ofl-up').length >= 2", timeout=15000)
            times = cp.eval_on_selector_all("#ao-updates .ofl-up time[datetime]", "els => els.map(e => e.getAttribute('datetime'))")
            assert times == sorted(times, reverse=True), times
            # keyboard: the tabs are real tabs
            cp.focus("#ofl-tab-updates"); cp.keyboard.press("ArrowLeft")
            until(cp, "document.querySelector('#ofl-tab-work').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'ofl-tab-work'", 5)
            print("ok  4. side panel: Preview App | Website, Working on (its file, approve there), Updates newest first")

            # ---------- 5. phone, 390px ----------
            pp = page(390, 844, mobile=True)
            pp.evaluate("TribeShell.go('ws-agents')")
            pp.wait_for_selector("#view-coord:not(.hidden) .ao-full #ad-office .os-stage", timeout=20000)   # feat/p13-office: phones get the pixel floor too
            pp.wait_for_selector("#ao-box .fl-in", timeout=10000)
            # the box stays at the bottom of the screen, above the phone's tab bar, while the page scrolls
            nav = "[...document.querySelectorAll('#tabbar, .m2-tabbar, nav')].filter(n => getComputedStyle(n).display !== 'none' && getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().bottom >= innerHeight - 2).map(n => n.getBoundingClientRect().top).concat([innerHeight])"
            r = pp.evaluate(f"(() => {{ const d = document.querySelector('#ao-dock').getBoundingClientRect(); return {{ bottom: d.bottom, top: d.top, nav: Math.min(...{nav}) }}; }})()")
            assert r["nav"] - 24 <= r["bottom"] <= r["nav"] + 1, ("the box sits at the bottom, above the tab bar", r)
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), pp.evaluate("document.documentElement.scrollWidth")
            pp.click("#ofl-strip [data-ofl-sheet='work']")
            pp.wait_for_function("document.querySelector('#ad-dash').dataset.sheet === 'open'")
            pp.wait_for_timeout(400)
            sh = pp.evaluate("document.querySelector('#ao-side').getBoundingClientRect().toJSON()")
            assert sh["bottom"] >= 843 and sh["top"] > 100, sh
            small = pp.evaluate("[...document.querySelectorAll('#ao-head .btn, #ao-head .ofl-av, #ao-bar button, #ofl-strip .btn, #ao-side .ofl-tab, #ao-side .ofl-fold, #ao-box .fl-chip, #ao-box .fl-ic')].filter(e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map(e => [e.className, e.getBoundingClientRect().height]).filter(x => x[1] < 40)")
            assert not small, small
            pp.wait_for_timeout(300); pp.screenshot(path="/tmp/office-full-390.png")
            pp.click("#ofl-fold"); pp.wait_for_function("!document.querySelector('#ad-dash').dataset.sheet")
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            print("ok  5. 390px: the floor, the box at the bottom, the panel as a bottom sheet, 40px targets")
            b.close()
        errs = [e for e in errors if "ResizeObserver" not in e]
        assert not errs, "\n".join(errs)
        print("E2E office full test passed")
    except Exception:
        try: print(open(tmp / "log").read()[-2000:])
        except Exception: pass
        raise
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
