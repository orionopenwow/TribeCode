"""Your look (feat/office-looks): the character creator for Office Space.

Opens Your look from the floor; every tab shows real pixel swatches; choosing a part and a colour changes the preview;
Randomize, Undo and Reset work; the arrow keys move between tabs and choices; Save stores the look and the floor and a
friend's browser draw it; an AI helper's owner changes the helper's look from its card (others can't); on a 390px phone
the sheet fits with 40px targets. Screenshots: /tmp/office-looks-creator.png, -floor.png, -390.png (TRIBE_SHOTS=0 skips).
Usage: python app/test/e2e_office_looks.py
"""
import json, os, random, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5630 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = os.environ.get("TRIBE_SHOTS", "1") != "0"
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
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())["result"]


OS = "(document.querySelector('#ad-office .os') || {}).__os"
PREV = "(() => { const c = document.querySelector('#olk-sheet .olk-prev'); return c ? c.toDataURL() : ''; })()"
DRAFT = "TribeOfficeLooks.current().state().draft"


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-officelooks-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        def join(name):
            inv = ok(api("/invites", "POST", {}, token=host))["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": name})); return j["token"], j["member"]["id"]
        maya, maya_id = join("Maya")
        ok(api("/office", "PUT", {"on": True}, token=host))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(token, name, w=1440, h=900, mobile=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile)
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOffice && window.TribeOfficeSpace && window.TribeOfficeLooks && window.TribeOfficeLooksCore", timeout=45000)
                return pg
            cp = page(host, "Camp")
            pid = cp.evaluate("TribeClient.project()")
            ag = ok(api("/agents", "POST", token=maya, project=pid), "Maya's helper")
            ag2 = ok(api("/agents", "POST", {"kind": "cursor", "label": "Cursor"}, token=host, project=pid), "Camp's helper")
            mcp(ag["token"], "my_lane", {}); mcp(ag2["token"], "tribe_overview", {})
            aid = ag["agent"]["id"]
            cp.evaluate("TribeShell.go('agents')")
            cp.wait_for_function(OS + " && " + OS + ".art() && " + OS + ".chars().length >= 4", timeout=30000)
            camp_id = cp.evaluate("TribeClient.state().me.id")

            # ---------- open Your look: a big preview and ten tabs, each with real pixel swatches ----------
            btn = cp.locator("#ad-office [data-os-act='look']:visible")
            if btn.count(): btn.first.click()
            else: cp.evaluate("TribeOfficeLooks.openMine()")   # the toolbar may keep it in a menu
            cp.wait_for_selector("#olk-sheet .olk-prev", timeout=10000)
            cp.wait_for_function(PREV + ".length > 200", timeout=10000)
            tabs = cp.evaluate("[...document.querySelectorAll('#olk-sheet [data-olk-tab]')].map(b => b.dataset.olkTab)")
            assert tabs == ["body", "face", "hair", "beard", "top", "jacket", "pants", "shoes", "acc", "hat"], tabs
            labels = cp.evaluate("[...document.querySelectorAll('#olk-sheet [role=tab]')].map(b => b.textContent.trim())")
            for want in ("Body & skin", "Face", "Hair", "Facial hair", "Top", "Jacket", "Bottoms", "Shoes", "Accessories", "Hat"): assert want in labels, (want, labels)
            drawn = """(() => { const cs = [...document.querySelectorAll('#olk-sheet .olk-sw canvas')]; if (!cs.length) return -1;
                return cs.filter(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; }).length / cs.length; })()"""
            counts = {}
            for t in tabs:
                cp.click(f"#olk-sheet [data-olk-tab='{t}']")
                cp.wait_for_function(drawn + " === 1", timeout=10000)
                counts[t] = cp.evaluate("document.querySelectorAll('#olk-sheet .olk-sw').length")
                assert counts[t] >= 2, (t, counts[t])
                assert cp.evaluate("document.querySelectorAll('#olk-sheet .olk-chip').length") > 0 or t in ("jacket", "hat", "beard", "acc"), f"{t}: colours"
            assert counts["hair"] >= 20 and counts["top"] >= 12 and counts["acc"] >= 12, counts
            print("ok  Your look opens: a large preview and ten tabs, each with drawn swatches of the real parts", counts)

            # ---------- choosing a part and a colour changes the preview; Undo, Randomize, Reset ----------
            cp.click("#olk-sheet [data-olk-tab='hair']")
            start = cp.evaluate(DRAFT)
            cp.evaluate("TribeOfficeLooks.current()") and cp.click("#olk-sheet [data-olk-pose='stand']")
            p0 = cp.evaluate(PREV)
            cp.click("#olk-sheet .olk-sws [data-olk-f='hair'][aria-checked='false'] >> nth=6")
            p1 = cp.evaluate(PREV); d1 = cp.evaluate(DRAFT)
            assert p1 != p0 and d1["hair"] != start["hair"], "a new hairstyle shows in the preview"
            cp.click("#olk-sheet .olk-chip[data-olk-f='hairColor'][aria-checked='false'] >> nth=12")
            p2 = cp.evaluate(PREV); d2 = cp.evaluate(DRAFT)
            assert p2 != p1 and d2["hairColor"] != d1["hairColor"], "a new hair colour shows in the preview"
            cp.click("#olk-sheet [data-olk-tab='top']")
            cp.click("#olk-sheet .olk-chip[data-olk-f='topColor'][aria-checked='false'] >> nth=4")
            assert cp.evaluate(PREV) != p2, "a new top colour shows"
            cp.click("#olk-sheet [data-olk='undo']")
            assert cp.evaluate(DRAFT) == d2 and cp.evaluate(PREV) == p2, "Undo puts the last change back"
            cp.click("#olk-sheet [data-olk='random']")
            r1 = cp.evaluate(DRAFT); assert r1 != d2, "Randomize makes a new look"
            cp.click("#olk-sheet [data-olk='reset']")
            assert cp.evaluate(DRAFT) == start, "Reset goes back to the look I opened with"
            cp.click("#olk-sheet [data-olk='undo']")
            assert cp.evaluate(DRAFT) == r1, "Undo after Reset"
            # turning and poses
            cp.click("#olk-sheet [data-olk-turn='1']"); assert "right" in cp.inner_text("#olk-sheet .olk-dir").lower()
            cp.click("#olk-sheet [data-olk-pose='sit']"); assert cp.get_attribute("#olk-sheet [data-olk-pose='sit']", "aria-checked") == "true"
            cp.click("#olk-sheet [data-olk-pose='walk']")
            print("ok  parts and colours change the preview; Undo, Randomize and Reset work; it turns and changes pose")

            # ---------- a clash gives way to what you just chose ----------
            cp.click("#olk-sheet [data-olk-tab='acc']")
            cp.click("#olk-sheet [data-olk-f='eyewear'][data-olk-i='3']")   # shades on the head
            cp.click("#olk-sheet [data-olk-tab='hat']")
            cp.click("#olk-sheet [data-olk-f='hat'][data-olk-i='1']")
            d = cp.evaluate(DRAFT); assert d["hat"] == 1 and d["eyewear"] == 0, d
            print("ok  a hat takes the shades off your head (no clipping)")

            # ---------- keyboard and screen readers ----------
            cp.focus("#olk-sheet [data-olk-tab='hat']"); cp.keyboard.press("ArrowLeft")
            assert cp.evaluate("document.activeElement.dataset.olkTab") == "acc" and cp.get_attribute("#olk-sheet [data-olk-tab='acc']", "aria-selected") == "true"
            cp.click("#olk-sheet [data-olk-tab='body']")
            cp.focus("#olk-sheet .olk-chip[data-olk-f='skin'][aria-checked='true']")
            before = cp.evaluate(DRAFT)["skin"]; cp.keyboard.press("ArrowRight")
            after = cp.evaluate(DRAFT)["skin"]; assert after == (before + 1) % 12, (before, after)
            assert cp.evaluate("document.activeElement.dataset.olkF") == "skin", "focus stays on the colours"
            assert cp.evaluate("document.querySelector('#olk-sheet [role=tabpanel]').getAttribute('aria-labelledby')") == "olk-t-body"
            label = cp.get_attribute("#olk-sheet .olk-prev", "aria-label"); assert "skin" in label and "hair" in label, label
            assert cp.evaluate("[...document.querySelectorAll('#olk-sheet [role=radio]')].every(b => b.getAttribute('aria-label') || b.textContent.trim())"), "every choice has a name"
            print("ok  arrow keys move along tabs and choices; the preview and every choice have names")

            # ---------- save: the floor and a friend see it ----------
            cp.click("#olk-sheet [data-olk-tab='hair']")
            cp.click("#olk-sheet [data-olk-f='hair'][data-olk-i='4']")
            cp.click("#olk-sheet [data-olk-tab='hat']")
            cp.click("#olk-sheet [data-olk-f='hat'][data-olk-i='0']")
            want = cp.evaluate(DRAFT)
            cp.click("#olk-sheet [data-olk-tab='hair']")
            if SHOTS: cp.wait_for_timeout(300); cp.screenshot(path="/tmp/office-looks-creator.png")
            cp.click("#olk-sheet [data-olk='save']")
            cp.wait_for_selector("#olk-sheet", state="detached", timeout=10000)
            saved = ok(api("/office", token=host))["myLook"]
            assert saved["v"] == 2 and cp.evaluate(f"JSON.stringify(TribeOfficeLooksCore.normalize({json.dumps(saved)})) === JSON.stringify({json.dumps(want)})"), (saved, want)
            key = cp.evaluate(f"TribeOfficeArt.lookKey({json.dumps(want)})")
            cp.wait_for_function(f"(() => {{ const d = (TribeOffice.state().desks || []).find(x => x.id === '{camp_id}'); return d && TribeOfficeArt.lookKey(TribeOfficeLooks.lookOf(d)) === {json.dumps(key)}; }})()", timeout=15000)
            mp = page(maya, "Maya")
            mp.evaluate("TribeShell.go('agents')")
            mp.wait_for_function(f"(() => {{ const d = ((TribeOffice.state() || {{}}).desks || []).find(x => x.id === '{camp_id}'); return d && TribeOfficeArt.lookKey(TribeOfficeLooks.lookOf(d)) === {json.dumps(key)}; }})()", timeout=20000)
            print("ok  Save: my look is stored, my floor and a friend's floor draw it")

            # ---------- an AI helper's owner changes its look from its card; others can't ----------
            mp.wait_for_function(OS + " && " + OS + ".art() && " + OS + ".chars().some(c => c.id === '" + aid + "')", timeout=20000)
            mp.evaluate(f"TribeOffice.openCard('{aid}')")
            mp.wait_for_selector(".of-card [data-os-do='look']", timeout=10000)
            mp.click(".of-card [data-os-do='look']")
            mp.wait_for_selector("#olk-sheet .olk-prev", timeout=10000)
            assert "Change its look" in mp.inner_text("#olk-sheet h3")
            base_agent = mp.evaluate(DRAFT)
            assert base_agent["lanyard"] == 1 and base_agent["hat"] == 3, "the helper starts in its tool's default look"
            mp.click("#olk-sheet [data-olk-tab='hat']"); mp.click("#olk-sheet [data-olk-f='hat'][data-olk-i='5']")
            mp.click("#olk-sheet [data-olk-tab='top']"); mp.click("#olk-sheet .olk-chip[data-olk-f='topColor'] >> nth=17")
            helper_look = mp.evaluate(DRAFT)
            mp.click("#olk-sheet [data-olk='save']"); mp.wait_for_selector("#olk-sheet", state="detached", timeout=10000)
            desk = [x for x in ok(api("/office", token=maya))["desks"] if x["id"] == aid][0]
            assert desk["look"] and desk["look"]["hat"] == 5, desk["look"]
            hk = cp.evaluate(f"TribeOfficeArt.lookKey({json.dumps(helper_look)})")
            cp.wait_for_function(f"(() => {{ const d = (TribeOffice.state().desks || []).find(x => x.id === '{aid}'); return d && TribeOfficeArt.lookKey(TribeOfficeLooks.lookOf(d)) === {json.dumps(hk)}; }})()", timeout=15000)
            st, _ = api("/office/look", "PUT", {"look": {"v": 2, "hat": 1}, "for": ag2["agent"]["id"]}, token=maya)
            assert st == 403, "only a helper's owner (or the host) changes its look"
            assert api("/office/look", "PUT", {"look": {"v": 2, "hat": 1}}, token=ag["token"])[0] == 403, "a helper can't set a look itself"
            print("ok  a helper's owner changes its look from its card; everyone sees it; others can't")

            # ---------- a fuller floor for the picture ----------
            r = random.Random(7)
            for name in ("Ana", "Bo", "Cy", "Dee"):
                t, _ = join(name)
                look = cp.evaluate(f"TribeOfficeLooksCore.compact(TribeOfficeLooksCore.seed('{name}{r.random()}'))")
                ok(api("/office/look", "PUT", {"look": look}, token=t))
                if SHOTS: page(t, name, 900, 700)   # online, so they come into the office
            if SHOTS:
                cp.evaluate("TribeOffice.refresh()")
                cp.wait_for_function(OS + ".chars().filter(c => c.visible).length >= 9", timeout=30000)
                cp.wait_for_timeout(5000)
                zin = cp.locator("#ad-office [data-os-act='in']:visible")
                if zin.count(): zin.first.click(); cp.wait_for_timeout(400)
                cp.locator("#ad-office .os-stage").screenshot(path="/tmp/office-looks-floor.png")

            # ---------- 390px: a sheet that fits, 40px targets ----------
            ph = page(host, "Camp", 390, 844, mobile=True)
            ph.evaluate("TribeOfficeLooks.openMine()")
            ph.wait_for_selector("#olk-sheet .olk-prev", timeout=10000)
            ph.click("#olk-sheet [data-olk-tab='hair']")
            box = ph.evaluate("(() => { const r = document.querySelector('#olk-sheet').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })()")
            assert box[0] >= -1 and box[1] <= 391 and box[3] <= 845, box
            small = ph.evaluate("""[...document.querySelectorAll('#olk-sheet .olk-chip, #olk-sheet .olk-tab, #olk-sheet .olk-sw, #olk-sheet .olk-pose, #olk-sheet .ui-foot .btn, #olk-sheet [data-olk-turn]')]
                .filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.className + (b.dataset.olkTab || b.dataset.olk || ''), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 40 || x[2] < 40)""")
            assert not small, small[:6]
            overflow = ph.evaluate("document.querySelector('#olk-sheet .olk-panel').scrollWidth <= document.querySelector('#olk-sheet .olk-panel').clientWidth + 1")
            assert overflow, "nothing spills sideways"
            if SHOTS: ph.wait_for_timeout(300); ph.screenshot(path="/tmp/office-looks-390.png")
            print("ok  390px: the sheet fits the screen and every target is at least 40px")

            assert not errors, errors
            b.close()
        print("PASS e2e_office_looks")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
