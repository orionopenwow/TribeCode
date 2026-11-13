"""The app shell's polish (feat/shell-polish): the rail's "you are here", Home's heading, the shared stroke icons, the plans
pop-out, Connect GitHub on Home › Code, the sidebar's foot rows, the Workshop as a destination and your own order.
  1. Rail: Home, a tribe and the Workshop wrench light the same way: a pressed tile (no box-shadow) and a 32px Ember pill
     on the far-left edge; Back leaves the Workshop.
  2. Home's sidebar has no heading; the lit logo and the breadcrumb say where you are.
  3. Tabs (a workspace's, the Workshop's) and Settings carry stroke icons from app/ui/icons.js.
  4. Preview and Invite friends are rows like Files (same height, padding, type, radius, no border), with thumbnails:
     a 40x28 picture for Preview, faces (or a dashed add circle) for Invite.
  5. Every FREE / plan chip opens the plans pop-out (Free, Premium prices, credit packs, Use my AI, your credits); Esc
     closes it and gives focus back; it fits a 390px phone.
  6. Home › Code: Connect GitHub, signed out (three ways in, Check again) and signed in (the account and the repos).
  7. Drag to reorder the rail and the sidebar rows; the order survives a reload and reaches the member's prefs;
     Alt+Up/Down moves the focused item and says so; Reset puts it back.
Usage: python app/test/e2e_shell_polish.py   (writes docs/screenshots/rail-active.png, home-header.png, plans-popout.png,
home-code-github.png)"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6610 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAGElEQVR42mP8z8Dwn4EIwMjAwMBApEIGAN8NBAFh3xQ4AAAAAElFTkSuQmCC"
SIGNED_OUT = {"detect": {"ready": None, "oauth": {"configured": False, "signedIn": False, "login": None, "member": True},
                         "gh": {"installed": False, "signedIn": False, "user": None}, "git": {"installed": True, "version": "2.43.0", "helper": None, "credential": None}, "local": True, "platform": "linux"}}
SIGNED_IN = {"detect": {"ready": "oauth", "oauth": {"configured": True, "signedIn": True, "login": "orion-dev", "member": True}, "gh": None, "git": None, "local": True, "platform": "linux"}}


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]


PILL = """s => { const e = document.querySelector(s); const c = getComputedStyle(e), b = getComputedStyle(e, '::before');
  return { shadow: c.boxShadow, h: parseFloat(b.height), op: b.opacity, bg: b.backgroundColor, left: e.getBoundingClientRect().left + parseFloat(b.left), on: e.classList.contains('on') }; }"""
ROW = """s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect();
  return { h: Math.round(r.height), pl: c.paddingLeft, fs: c.fontSize, fw: c.fontWeight, ff: c.fontFamily, rad: c.borderRadius, bw: c.borderTopWidth, bg: c.backgroundColor, color: c.color, w: Math.round(r.width) }; }"""
ORDER = "s => [...document.querySelectorAll(s)].map(e => e.id || e.dataset.pjOpen || (e.querySelector('[data-pnav]') || e).dataset.pnav)"


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-polish-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9", "--name", "Lantern Crew"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); tok = boot["token"]
        pq = ok(api("/projects", "POST", {"name": "Pixel Quest"}, token=tok))["project"]["id"]
        ok(api("/projects", "POST", {"name": "Sketches"}, token=tok))
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder"}, token=tok))["invite"]
        ok(api("/join", "POST", {"code": inv["code"], "name": "Zed"}), "Zed joins")
        SHOTS.mkdir(parents=True, exist_ok=True)

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w=1440, h=900, token=tok, scale=1):
                c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=scale)
                srv_ = f", server: {{url: '{BASE}', token: '{token}'}}" if token else ""
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}{srv_}}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
                pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "favicon" not in m.text and errors.append(f"console: {m.text[:200]}"))
                return pg

            pg = page()
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeHub && window.TribeProjects && TribeProjects.list().length >= 2 && window.TribeReorder", timeout=20000)

            # ---------- 1 + 2. Home: the lit logo and the heading ----------
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#rail-logo.on"); pg.wait_for_selector("#grp-global"); pg.mouse.move(700, 600); pg.wait_for_timeout(400)
            lg = pg.evaluate(PILL, "#rail-logo")
            assert lg["shadow"] == "none" and lg["h"] == 32 and lg["op"] == "1" and lg["left"] <= 1, ("Home: a pressed tile and the pill at the edge", lg)
            assert pg.evaluate("getComputedStyle(document.querySelector('#rail-logo')).outlineStyle") == "solid", "the tile's inset 1px border is an outline, not a shadow"
            assert pg.evaluate("!document.querySelector('#nest-home-h')"), "no Home heading in the sidebar (removed: the lit logo says where you are)"
            assert "your dashboard" not in pg.inner_text("#nest-groups").lower().replace("your dashboard", "", 1), "no '· your dashboard' left"
            pg.screenshot(path=str(SHOTS / "home-header.png"), clip={"x": 0, "y": 0, "width": 760, "height": 460})

            # ---------- 4. the foot rows on Home: Invite friends with faces ----------
            pg.wait_for_selector("#tour-invite", state="visible")
            assert pg.locator("#sf-faces .sf-av").count() >= 1, "Zed's face on Invite friends"

            # ---------- 1. a tribe: the same pill, the logo goes quiet ----------
            pg.evaluate(f"TribeProjects.switchTo('{pq}', 'home')"); pg.wait_for_selector(f"#pj-rail .pj-circle.on[data-pj-open='{pq}']"); pg.wait_for_function("!document.querySelector('#rail-logo').classList.contains('on')")
            pg.mouse.move(700, 600); pg.wait_for_timeout(400)
            pc = pg.evaluate(PILL, f"#pj-rail .pj-circle[data-pj-open='{pq}']")
            assert pc["shadow"] == "none" and pc["h"] == 32 and pc["op"] == "1" and pc["left"] <= 1, ("a tribe: the same pill", pc)
            assert pg.evaluate("getComputedStyle(document.querySelector('#pj-rail .pj-circle.on .pj-face')).boxShadow") == "none"
            assert pg.evaluate(PILL, "#rail-logo")["h"] == 0, "the logo has no pill inside a tribe"
            other = pg.locator("#pj-rail .pj-circle:not(.on)").first; other.hover(); pg.wait_for_timeout(300)
            assert 10 <= pg.evaluate("e => parseFloat(getComputedStyle(e, '::before').height)", other.element_handle()) < 32, "hover: a shorter pill"
            pg.screenshot(path=str(SHOTS / "rail-active.png"), clip={"x": 0, "y": 0, "width": 340, "height": 420})
            pg.mouse.move(700, 600)

            # ---------- 4. Preview and Invite are rows like Files, with thumbnails ----------
            pg.wait_for_selector("#nest-preview", state="visible"); pg.wait_for_timeout(300)
            ref, inv_, pv = (pg.evaluate(ROW, s) for s in ["#nest-docs", "#tour-invite", "#nest-preview"])
            for k in ["h", "pl", "fs", "fw", "ff", "rad", "bw", "bg", "color"]:
                assert inv_[k] == ref[k] and pv[k] == ref[k], (k, ref, inv_, pv)
            assert abs(inv_["w"] - ref["w"]) <= 2 and abs(pv["w"] - ref["w"]) <= 2, (ref, inv_, pv)
            assert pg.text_content("#nest-preview > span").strip() in ("Preview", "Preview game") and pg.text_content("#tour-invite > span").strip() == "Invite friends", (pg.inner_text("#nest-preview"), pg.inner_text("#tour-invite"))
            assert pg.locator("#nest-preview .sf-pv svg").count() == 1, "no picture yet: the stroke icon"
            pg.route("**/api/thumb", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"thumb": {"kind": "screenshot", "src": PNG, "initials": "PQ", "color": "#38C6B1", "name": "Pixel Quest"}})))
            pg.evaluate("TribeSideFoot.refresh()"); pg.wait_for_selector("#nest-preview .sf-pv.has-img img", timeout=8000)
            bx = pg.locator("#nest-preview .sf-pv").bounding_box(); assert round(bx["width"]) == 40 and round(bx["height"]) == 28, bx
            assert pg.evaluate(ROW, "#nest-preview")["h"] == ref["h"], "the picture keeps the row's height"
            pg.unroute("**/api/thumb")

            # ---------- 3. icons on tabs ----------
            pg.evaluate("TribeShell.go('ws-agents')"); pg.wait_for_selector("#view-tabs:not(.hidden) [data-tab]")
            assert pg.evaluate("[...document.querySelectorAll('#view-tabs [data-tab]')].every(t => t.querySelector('svg'))"), "every workspace tab has an icon"
            assert pg.evaluate("[...document.querySelectorAll('#view-tabs [data-tab] svg')].every(s => s.getAttribute('stroke') === 'currentColor' && s.getAttribute('fill') === 'none')")

            # ---------- 1. the Workshop: a destination, lit like a tribe; Back leaves ----------
            pg.click("#rail-workshop"); pg.wait_for_function("TribeWorkshop.isOpen() && TribeRouter.where().place === 'workshop'"); pg.mouse.move(700, 600); pg.wait_for_timeout(400)
            ws = pg.evaluate(PILL, "#rail-workshop")
            assert ws["on"] and ws["shadow"] == "none" and ws["h"] == 32 and ws["left"] <= 1, ("the wrench is lit", ws)
            assert pg.evaluate("location.hash") == "#/workshop" and pg.is_visible("#nest") and pg.is_visible(".titlebar"), "the Workshop sits in the main area; the sidebar stays"
            assert pg.evaluate("!!TribeWorkshop.container() && TribeWorkshop.container().id === 'ws-body'")
            assert pg.locator(".ws-tabs [role=tab] .ti svg").count() == 5, "Workshop tabs carry icons"
            pg.go_back(); pg.wait_for_function("!TribeWorkshop.isOpen() && TribeRouter.where().place === 'project'", timeout=8000)
            assert not pg.evaluate("document.querySelector('#rail-workshop').classList.contains('on')")

            # ---------- 5. the plans pop-out, from Settings › Plan ----------
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#set-plan-chip")
            assert pg.locator(".set-l b .ti svg").count() >= 5, "Settings sections carry icons"
            pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop[role=dialog]")
            t = pg.inner_text("#plans-pop")
            for want in ["Free", "$0", "Premium", "$6", "$24", "1,000", "2,500", "5,000", "Use my AI", "AI credit"]: assert want in t, (want, t)
            assert pg.get_attribute("#set-plan-chip", "aria-expanded") == "true"
            pg.screenshot(path=str(SHOTS / "plans-popout.png"))
            pg.keyboard.press("Escape"); pg.wait_for_selector("#plans-pop", state="detached")
            assert pg.evaluate("document.activeElement && document.activeElement.id") == "set-plan-chip", "focus returns to the chip"
            assert pg.is_visible("#set-plan-chip"), "Esc closed only the pop-out, not Settings"
            pg.evaluate("TribeSettings.close ? TribeSettings.close() : document.querySelector('#set-close').click()")
            # a chip drawn by another feature (the canvas Flint's FREE) and the AI-boost card's button
            pg.evaluate("(() => { const d = document.createElement('div'); d.id = 'tchips'; d.style.cssText = 'position:fixed;top:80px;left:400px;z-index:5'; d.innerHTML = '<p class=\"fp-free\"><span class=\"fp-chip\">Free</span></p>' + TribeBoost.html({}); document.body.append(d); TribeBoost.bind(d); })()")
            pg.wait_for_selector("#tchips .fp-chip[role=button][tabindex='0']")
            pg.focus("#tchips .fp-chip"); pg.keyboard.press("Enter"); pg.wait_for_selector("#plans-pop"); pg.keyboard.press("Escape"); pg.wait_for_selector("#plans-pop", state="detached")
            pg.evaluate("document.querySelector(\"#tchips [data-boost='credits']\").click()"); pg.wait_for_selector("#plans-pop"); assert pg.locator("#pm-sheet").count() == 0
            pg.keyboard.press("Escape"); pg.evaluate("document.getElementById('tchips').remove()")

            # ---------- 7. your own order: drag, reload, keyboard, reset ----------
            pg.evaluate(f"TribeProjects.switchTo('{pq}', 'home')"); pg.wait_for_selector("#nest-overview.on")
            first = pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line")
            assert first[0] == "nest-overview", first
            def drag(src, dst, above=True):
                a, d = pg.locator(src).first.bounding_box(), pg.locator(dst).first.bounding_box()
                pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2); pg.mouse.down()
                ty = d["y"] + (3 if above else d["height"] - 3)
                for i in range(1, 9): pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2 + (ty - a["y"] - a["height"] / 2) * i / 8); pg.wait_for_timeout(20)
                assert pg.is_visible(".ro-line.on"), "a drop line shows where it lands"
                pg.mouse.up(); pg.wait_for_timeout(250)
            drag("#nest-ws-agents", "#nest-overview")
            got = pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line"); assert got[0] == "nest-ws-agents", got
            assert pg.evaluate("document.body.dataset.view") == "home", "a drop is not a click"
            drag("#rail-workshop", f"#pj-rail [data-pj-open]")
            rail = pg.evaluate(ORDER, "#pj-rail > *"); assert rail[0] == "rail-workshop", rail
            assert pg.evaluate(PILL, f"#pj-rail .pj-circle[data-pj-open='{pq}']")["h"] == 32, "the pill survives a reorder"
            pg.wait_for_timeout(700)
            pr = ok(api("/hub/prefs", token=tok)); assert any(k.startswith("project:") and v[0] == "ws-agents" for k, v in pr["order"].items()), pr
            pg.reload(); pg.wait_for_function(f"TribeClient.connected() && window.TribeProjects && TribeProjects.list().length >= 2 && document.querySelector('#pj-rail [data-pj-open]')", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pq}', 'home')"); pg.wait_for_timeout(600)
            assert pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line")[0] == "nest-ws-agents", "the order survives a reload"
            assert pg.evaluate(ORDER, "#pj-rail > *")[0] == "rail-workshop", "the rail order survives a reload"
            # keyboard: Alt+Up on Files
            before = pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line"); i = before.index("nest-docs")
            pg.focus("#nest-docs"); pg.keyboard.press("Alt+ArrowUp"); pg.wait_for_timeout(150)
            after = pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line"); assert after.index("nest-docs") == i - 1, (before, after)
            assert pg.evaluate("document.activeElement.id") == "nest-docs", "focus stays on the moved row"
            pg.wait_for_function("(document.getElementById('ro-live') || {}).textContent && document.getElementById('ro-live').textContent.includes('moved up')")
            assert pg.evaluate("document.querySelector('#nest-streams').previousElementSibling.matches('.nest-line')"), "the channels stay under Messages"
            # Home's rows: keyboard too
            pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#grp-global #nest-work")
            hb = pg.evaluate(ORDER, "#grp-global > .nest-row"); pg.focus("#grp-global #nest-work"); pg.keyboard.press("Alt+ArrowUp"); pg.wait_for_timeout(150)
            ha = pg.evaluate(ORDER, "#grp-global > .nest-row"); assert ha.index("nest-work") == hb.index("nest-work") - 1, (hb, ha)
            # reset: the right-click menu (one list), then Settings (everything)
            pg.evaluate(f"TribeProjects.switchTo('{pq}', 'home')"); pg.wait_for_selector("#nest-overview.on")
            pg.click("#nest-docs", button="right"); pg.wait_for_selector(".ro-menu [data-ro='reset']"); pg.click(".ro-menu [data-ro='reset']")
            assert pg.evaluate(ORDER, "#pj-nav > .nest-row, #pj-nav > .nest-line") == first, "Reset order (menu) puts the rows back"
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#set-reorder"); pg.click("#set-reorder"); pg.wait_for_timeout(300)
            assert pg.evaluate(ORDER, "#pj-rail > *")[0] != "rail-workshop" and pg.evaluate(ORDER, "#pj-rail > *")[-1] == "rail-workshop", "Settings › Reset order puts the rail back"
            pg.evaluate("TribeSettings.close ? TribeSettings.close() : document.querySelector('#set-close').click()")

            # ---------- 6. Home › Code: Connect GitHub, signed out, then signed in ----------
            state = {"d": SIGNED_OUT}
            pg.route("**/api/github/detect*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(state["d"])))
            pg.evaluate("TribeHub.open('repos')"); pg.wait_for_selector("#hub-github .hgh-st.is-off", timeout=10000)
            g = pg.inner_text("#hub-github")
            for want in ["Connect GitHub", "Not connected", "Repos", "Pushes", "Pull requests", "Agents", "Make a fine-grained token", "Read and write", "gh auth login", "Check again"]: assert want in g, (want, g)
            assert pg.locator("#hub-github #su-way-token #su-gh-pat").count() == 1 and pg.locator("#hub-github #su-way-cli").count() == 1
            pg.screenshot(path=str(SHOTS / "home-code-github.png"))
            pg.route("**/api/hub/repos", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"repos": [{"project": pq, "name": "Pixel Quest", "repo": {"name": "pixel-quest", "branch": "main", "remote": "orion-dev/pixel-quest", "ahead": 0, "behind": 0, "dirty": 0, "last": None}}]})))
            pg.evaluate("TribeHub.open('home')"); pg.evaluate("TribeHub.open('repos')"); pg.wait_for_selector("#hub-github .hgh-st.is-off")
            state["d"] = SIGNED_IN; pg.click("#hgh-recheck"); pg.wait_for_selector("#hub-github .hgh-st.is-on", timeout=8000)
            g = pg.inner_text("#hub-github"); assert "GitHub is connected" in g and "@orion-dev" in g and "orion-dev/pixel-quest" in g, g
            pg.unroute("**/api/github/detect*"); pg.unroute("**/api/hub/repos")
            pg.context.close()

            # ---------- 5. phone: the pop-out is a sheet that fits 390px ----------
            ph = page(390, 844)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribePlans && window.TribePremium", timeout=15000)
            ph.evaluate("(() => { const b = document.createElement('button'); b.innerHTML = TribePlans.chip({ id: 'ph-chip' }); const c = b.firstChild; c.style.cssText = 'position:fixed;top:120px;left:20px;z-index:500'; document.body.append(c); })()")
            ph.click("#ph-chip"); ph.wait_for_selector("#plans-pop.is-sheet")
            bx = ph.locator("#plans-pop").bounding_box(); assert bx["x"] >= 0 and bx["x"] + bx["width"] <= 390.5, bx
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no horizontal scroll"
            ph.keyboard.press("Escape"); ph.wait_for_selector("#plans-pop", state="detached")
            # phone: the side panel's foot rows match its other rows too
            ph.wait_for_function("TribeClient.connected() && window.TribeProjects && TribeProjects.list().length >= 2", timeout=15000)
            ph.evaluate(f"TribeProjects.switchTo('{pq}', 'home')"); ph.wait_for_timeout(600)
            ph.click("#menu-btn"); ph.wait_for_selector("#tour-invite", state="visible", timeout=8000)
            r0, r1 = ph.evaluate(ROW, "#nest-docs"), ph.evaluate(ROW, "#tour-invite")
            for k in ["h", "pl", "fs", "fw", "rad", "bw", "bg"]: assert r0[k] == r1[k], ("phone", k, r0, r1)
            assert r1["h"] >= 44, r1
            ph.context.close()
            b.close()
        errs = [e for e in errors if "ERR_CONNECTION_REFUSED" not in e]
        assert not errs, errs
        print("e2e_shell_polish: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
