"""The office, full page (app/ui/officefull.js, feat/office-full): a project's Agents & office.
  1. 1440x900: the pixel floor fills the main area (beside the side panel, open and folded), most of its height, at a
     whole-pixel zoom; the head is one line; no people grid under the floor; no "Get set up" cards once an AI helper is in.
  2. The toolbar: Floor | Desks, zoom - +, and one ... menu holding Your look, the office's set, Edit layout, Sound, Hide
     the office for me, Where your tribe runs, What's private and GitHub.
  3. The box at the bottom: plain words land in the tribe's chat; "@my-claude ..." reaches the AI helper; "/task ..."
     makes a task; "invite a friend" opens the invite sheet (Flint, no AI); the chips; replies show in the strip.
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

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1440, h=900, mobile=False):
                kw = {"viewport": {"width": w, "height": h}}
                if mobile: kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
                c = b.new_context(**kw)
                c.add_init_script("try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.office.view', 'floor');"
                                  " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, theme: 'dark', tour: {done: true}, server: {url: '%s', token: '%s'}})); } } catch (e) {}" % (BASE, camp))
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
            g = geo()
            assert abs((g["w"] + g["side"]) - g["mw"]) <= 4 and abs(g["l"] - g["ml"]) <= 2, ("panel open: the floor fills the width beside it", g)
            assert g["side"] >= 340, g
            assert g["h"] >= 0.7 * g["mh"] and abs(g["top"] + g["h"] - g["dock"]) <= 2, ("most of the height, down to the box", g)
            assert g["head"] <= 60, ("the head is one line", g)
            assert g["scale"] == int(g["scale"]) and g["scale"] >= 1, ("whole pixels", g["scale"])
            assert cp.evaluate("getComputedStyle(document.querySelector('#ad-office .os-canvas')).imageRendering") in ("pixelated", "crisp-edges")
            assert cp.locator("#ad-office .of-roster, #ao-setup, #ao-head .eyebrow").count() == 0, "no people grid, no setup cards, no eyebrow"
            assert cp.locator(f"#ao-here [data-desk='{aid}']").count() == 1, "the avatars in the head"
            cp.click("#ofl-fold"); cp.wait_for_function("document.querySelector('#ad-dash').dataset.panel === 'closed'"); cp.wait_for_timeout(500)
            g2 = geo()
            assert g2["side"] <= 56 and abs((g2["w"] + g2["side"]) - g2["mw"]) <= 4 and g2["w"] > g["w"] + 300, ("folded to a rail, the floor grows", g2)
            cp.click("#ofl-tab-preview"); cp.wait_for_function("document.querySelector('#ad-dash').dataset.panel === 'open'")
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
            assert items == ["look", "edit", "sound", "hide", "where", "privacy", "github"], items
            assert cp.locator("#ao-menu [data-aom-set] option").count() >= 2, "the office's set"
            cp.click("#ao-menu [data-aom='sound']"); assert cp.get_attribute("#ao-menu [data-aom='sound']", "aria-checked") == "true"
            cp.click("#ao-menu [data-aom='sound']")
            cp.click("#ao-menu [data-aom='look']"); cp.wait_for_selector("#ad-office .os-look:not([hidden])", timeout=5000)
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

            # ---------- 3. the box at the bottom ----------
            inp = "#ao-box .fl-in"
            chips = cp.eval_on_selector_all("#ao-box .fl-chip", "els => els.map(e => e.textContent)")
            assert len(chips) == 3 and "Invite a friend" in chips and any(c.startswith("Give ") for c in chips), chips
            def chat_has(t):
                end = time.time() + 15
                while time.time() < end:
                    ms = ok(api("/chat/general", token=camp)).get("messages", [])
                    if any(m.get("text") == t for m in ms): return ms
                    time.sleep(0.3)
                raise AssertionError(f"not in chat: {t}")
            cp.fill(inp, "Morning all, the trail map is next"); cp.press(inp, "Enter")
            chat_has("Morning all, the trail map is next")
            cp.wait_for_selector("#ad-dash[data-replies='on'] #ao-replies .fl-ev", timeout=5000)
            assert "chat" in cp.inner_text("#ao-replies").lower()
            # a reply in the chat shows in the strip
            sam = ok(api("/join", "POST", {"code": ok(api("/invites", "POST", {"maxUses": 1}, token=camp))["invite"]["code"], "name": "Sam"}))["token"]
            ok(api("/chat/general", "POST", {"text": "On it after lunch"}, token=sam, project=pid))
            until(cp, "document.querySelector('#ao-replies').innerText.includes('On it after lunch')", 10, "a reply shows above the box")
            cp.click("#ao-replies-x"); cp.wait_for_function("!document.querySelector('#ad-dash').dataset.replies")
            # @ an AI helper: the @ picker, then a public command it hears
            cp.click(inp); cp.keyboard.type("@my"); cp.wait_for_selector("#mention-pop .mn-opt", timeout=5000); cp.keyboard.press("Enter")
            assert cp.input_value(inp) == "@my-claude ", cp.input_value(inp)
            cp.keyboard.type("add a weekly leaderboard"); cp.keyboard.press("Enter")
            chat_has("@my-claude add a weekly leaderboard")
            end = time.time() + 15; heard = ""
            while time.time() < end:
                heard = json.dumps(tool(akey, "check_messages", {}))
                if "weekly leaderboard" in heard: break
                time.sleep(0.5)
            assert "weekly leaderboard" in heard, heard[:400]
            # /task makes a task
            cp.fill(inp, "/task Draw the trail map"); cp.press(inp, "Enter")
            end = time.time() + 15; ts = []
            while time.time() < end:
                ts = [t for t in ok(api("/tasks", token=camp, project=pid)).get("tasks", []) if t.get("title") == "Draw the trail map"]
                if ts: break
                time.sleep(0.3)
            assert ts, "the task was made"
            # a request goes to Flint (no AI): invite a friend opens the invite sheet
            n_chat = len(ok(api("/chat/general", token=camp)).get("messages", []))
            cp.fill(inp, "invite a friend"); cp.press(inp, "Enter")
            cp.wait_for_selector("#invite-modal:not(.hidden), #inv-sheet, .ui-sheet [data-inv], #io-sheet", timeout=10000)
            assert len(ok(api("/chat/general", token=camp)).get("messages", [])) == n_chat, "Flint's, not the chat's"
            cp.keyboard.press("Escape"); cp.wait_for_timeout(400)
            if cp.evaluate("window.TribeInvite && TribeInvite.close"): cp.evaluate("TribeInvite.close()")
            # what's everyone doing: answered from the office
            cp.click("#ao-box .fl-chip:has-text('everyone')")
            until(cp, "document.querySelector('#ao-replies').innerText.includes('Claude')", 8, "who is doing what")
            print("ok  3. the box: chat, @ an AI helper (it heard), /task, Flint opens the invite, replies in the strip")

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
            cp.wait_for_selector("#ao-work #ao-asks [data-ao-ap='approve']", timeout=15000)
            assert "Drop the old scores table" in cp.inner_text("#ao-asks")
            cp.wait_for_selector(f"#ao-work [data-fl-agent='{aid}']", timeout=10000)
            assert "src/leaderboard.js" in cp.inner_text(f"#ao-work [data-fl-agent='{aid}']"), cp.inner_text("#ao-work")
            cp.wait_for_timeout(500); cp.screenshot(path="/tmp/office-full-1440-working.png")
            cp.click("#ao-work #ao-asks [data-ao-ap='approve']")
            end = time.time() + 10; done = False
            while time.time() < end:
                aps = ok(api("/approvals", token=camp, project=pid)).get("approvals", [])
                if any(a.get("title") == "Drop the old scores table" and a.get("status") == "approved" for a in aps): done = True; break
                time.sleep(0.3)
            assert done, "approved from Working on"
            cp.wait_for_selector("#ao-asks", state="detached", timeout=15000)
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
            pp.wait_for_selector("#view-coord:not(.hidden) .ao-full #ad-office .of-desk", timeout=20000)
            assert pp.locator("#ad-office .os-stage").count() == 0, "phones get the desks"
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
            print("ok  5. 390px: desks, the box at the bottom, the panel as a bottom sheet, 40px targets")
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
