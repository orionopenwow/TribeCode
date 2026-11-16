"""Working together in the creator tools (feat/cowork-editors: app/ui/cowork.js, app/ui/changes.js, server/changereq.js).
Checks:
 1 App Creator: a friend's pointer lands on the same part of the screen at a different window size; what they picked is
   outlined with their name; while they type in a part it says "<name> is editing" and a change to it from someone
   else is refused with "<name> is editing this; ask or wait";
 2 the website designer: pointers inside the sandboxed preview land on the same words at different widths;
 3 Motion Studio: a pointer on the canvas lands at the same spot;
 4 roles: with "Change the app" taken from builders, the strip says "Your changes go to Camp for OK"; the server refuses a
   direct save (with who can); the builder's edit stays a draft, "Suggest this change" sends it with before/after
   pictures; Camp approves from the requests list; it is applied, attributed, and Undo brings the earlier version back;
 5 an AI helper's refused change becomes a request that names the person it works for;
 6 a council: under our own roles with "Change the website" decided by the council (Camp and Theo, everyone), one yes
   isn't enough; the second applies it;
 7 a phone shows who is here and the outline, no pointers; with live cursors off, no pointers are drawn.
Usage: TRIBE_PORT_OFFSET=25 python3 app/test/e2e_cowork_editors.py   (screenshots: docs/screenshots/cowork-*.png)
"""
import json, os, re, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6400 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""): assert r[0] in (200, 202), f"{what}: {r}"; return r[1]


def ptr_xy(pg, sel):
    """The translate() of a drawn pointer, in viewport pixels."""
    t = pg.eval_on_selector(sel, "e => e.style.transform")
    m = re.search(r"translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)", t or "")
    assert m, t
    return float(m.group(1)), float(m.group(2))


def inside(x, y, box, pad=3):
    return box["x"] - pad <= x <= box["x"] + box["width"] + pad and box["y"] - pad <= y <= box["y"] + box["height"] + pad


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cw-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        def join(name):
            inv = ok(api("/invites", "POST", {}, token=host))["invite"]; j = ok(api("/join", "POST", {"code": inv["code"], "name": name})); return j["token"], j["member"]["id"]
        maya, maya_id = join("Maya"); theo, theo_id = join("Theo")
        p = ok(api("/projects", "POST", {"name": "Lantern Run"}, token=host)); pid = (p.get("project") or p)["id"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(token, name, w=1280, h=900, phone=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}));"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone, device_scale_factor=1)
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e} {(e.stack or '')[:300]}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCowork && window.TribeChanges && window.TribeAppCreator && window.TribeUI", timeout=45000)
                pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(600)
                return pg

            # ---------- 1: App Creator, two people, different window sizes ----------
            cp = page(host, "Camp", 1280, 900)
            cp.evaluate(f"TribeAppCreator.open({{ template: 'habits', pid: '{pid}' }})"); cp.wait_for_selector("#apc #apc-stage [data-b]", timeout=20000)
            cp.wait_for_function("(() => { const s = TribeAppCreator.state(); return s && !s.dirty && s.rev > 0; })()", timeout=15000)
            mp = page(maya, "Maya", 1500, 1000)
            mp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); mp.wait_for_selector("#apc #apc-stage [data-b]", timeout=20000)
            # who is here: each sees the other in the top bar
            cp.wait_for_function("document.querySelector('#apc-cw') && !document.querySelector('#apc-cw').hidden && /Maya/.test(document.querySelector('#apc-cw').innerHTML)", timeout=15000)
            assert "Maya" in cp.inner_text("#apc-cw") or "M" in cp.inner_text("#apc-cw .cw-chips")
            blk = mp.eval_on_selector("#apc-stage [data-b]:nth-of-type(2), #apc-stage [data-b]", "e => e.dataset.b")
            mbox = mp.locator(f'#apc-stage [data-b="{blk}"]').first.bounding_box()
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.3, mbox["y"] + mbox["height"] * 0.5)
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.31, mbox["y"] + mbox["height"] * 0.5)
            cp.wait_for_selector(f".cw-layer [data-cwp='{maya_id}']", timeout=10000)
            cbox = cp.locator(f'#apc-stage [data-b="{blk}"]').first.bounding_box()
            x, y = ptr_xy(cp, f".cw-layer [data-cwp='{maya_id}']")
            assert inside(x, y, cbox), ("Maya's pointer lands on the same part in Camp's window", x, y, cbox, mbox)
            assert abs((x - cbox["x"]) / cbox["width"] - 0.31) < 0.08, ((x - cbox["x"]) / cbox["width"])
            # her selection: outlined with her name
            mp.locator(f'#apc-stage [data-b="{blk}"]').first.click(position={"x": 4, "y": 4})
            cp.wait_for_selector(f".cw-layer [data-cwo='{maya_id}']", timeout=10000)
            assert "Maya" in cp.inner_text(f".cw-layer [data-cwo='{maya_id}'] .cw-tag")
            # her typing: "Maya is editing" + a soft lock for Camp
            ed = mp.locator('#apc-stage [data-e]').first
            eblk = mp.evaluate("el => el.closest('[data-b]').dataset.b", ed.element_handle())
            ed.click(); mp.keyboard.type(" again", delay=20)
            cp.wait_for_function(f"(() => {{ const o = document.querySelector(\".cw-layer [data-cwo='{maya_id}']\"); return o && o.classList.contains('is-editing') && /Maya/.test(o.textContent); }})()", timeout=10000)
            assert "is editing" in cp.inner_text(f".cw-layer [data-cwo='{maya_id}'] .cw-tag")
            assert "Maya" in cp.inner_text("#apc-cw .cw-say"), cp.inner_text("#apc-cw")
            if SHOTS.exists(): cp.screenshot(path=str(SHOTS / "cowork-app-1280.png"))
            before = cp.evaluate(f"JSON.stringify(TribeAppCore.findBlock(TribeAppCreator.doc(), '{eblk}').block)")
            cp.evaluate(f"(() => {{ const s = TribeAppCreator.state(); s.sel = {{ block: '{eblk}', kind: 'block', path: '' }}; }})()")
            epath = ed.get_attribute("data-e")
            cp.evaluate(f"TribeAppCreator.apply({{ op: 'text', block: '{eblk}', path: '{epath}', value: 'Camp was here' }})")
            cp.wait_for_timeout(300)
            body = cp.inner_text("body")
            assert "Maya is editing this; ask or wait" in body, "Camp is told to ask or wait"
            assert "Camp was here" not in cp.evaluate(f"JSON.stringify(TribeAppCore.findBlock(TribeAppCreator.doc(), '{eblk}').block)"), "Camp's change to the part Maya types in was not made"
            mp.keyboard.press("Enter"); mp.wait_for_timeout(300)   # she stops typing: the lock goes
            cp.wait_for_function(f"(() => {{ const o = document.querySelector(\".cw-layer [data-cwo='{maya_id}']\"); return o && !o.classList.contains('is-editing'); }})()", timeout=10000)
            mp.evaluate("TribeAppCreator.close()"); cp.evaluate("TribeAppCreator.close()")
            cp.wait_for_timeout(400)
            assert cp.locator(".cw-layer [data-cwp]").count() == 0, "pointers leave with the tool"

            # ---------- 2: the website designer: pointers inside the sandboxed preview ----------
            cp.set_viewport_size({"width": 1366, "height": 900})
            cp.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}', template: 'cafe' }})"); cp.wait_for_selector("#wdz:not([hidden])", timeout=20000)
            cp.wait_for_function("(() => { const s = TribeSiteDesigner.state(); return s && s.open && !s.dirty && s.rev > 0; })()", timeout=20000)
            mp.set_viewport_size({"width": 1600, "height": 1000})
            mp.evaluate(f"TribeSiteDesigner.open({{ pid: '{pid}' }})"); mp.wait_for_selector("#wdz:not([hidden])", timeout=20000)
            cf, mf = cp.frame_locator("#wdz-frame"), mp.frame_locator("#wdz-frame")
            mf.locator("[data-e]").first.wait_for(timeout=20000); cf.locator("[data-e]").first.wait_for(timeout=20000)
            key = mf.locator("[data-e]").first.get_attribute("data-e")
            mbox = mf.locator(f'[data-e="{key}"]').first.bounding_box()
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.4, mbox["y"] + mbox["height"] * 0.5)
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.41, mbox["y"] + mbox["height"] * 0.5)
            cfr = cp.frame(url="about:srcdoc") or [f for f in cp.frames if f != cp.main_frame][0]
            cfr.wait_for_selector(f"[data-cw-ptr='{maya_id}']", timeout=15000)
            got = cfr.evaluate(f"""(() => {{ const p = document.querySelector("[data-cw-ptr='{maya_id}']"), m = /translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/.exec(p.style.transform), r = document.querySelector('[data-e="{key}"]').getBoundingClientRect(); return {{ x: +m[1], y: +m[2], r: {{ x: r.left, y: r.top, width: r.width, height: r.height }} }}; }})()""")
            assert inside(got["x"], got["y"], got["r"]), ("Maya's pointer lands on the same words in Camp's preview", got)
            assert abs((got["x"] - got["r"]["x"]) / got["r"]["width"] - 0.41) < 0.1, got
            mf.locator(f'[data-e="{key}"]').first.click()
            cfr.wait_for_selector(f"[data-cw-out='{maya_id}']", timeout=10000)
            assert "Maya" in cfr.inner_text(f"[data-cw-out='{maya_id}']")
            if SHOTS.exists(): cp.screenshot(path=str(SHOTS / "cowork-site-1366.png"))
            mp.evaluate("TribeSiteDesigner.close()"); cp.evaluate("TribeSiteDesigner.close()")

            # ---------- 3: Motion Studio: a pointer on the canvas ----------
            cp.evaluate(f"TribeMotionStudio.open({{ pid: '{pid}', template: 'ui-reel', autoplay: false }})"); cp.wait_for_selector("#mos #mos-cv", timeout=20000)
            cp.wait_for_function("TribeMotionStudio.state().key && TribeMotionStudio.state().saved", timeout=20000)
            mkey = cp.evaluate("TribeMotionStudio.state().key")
            # pass 4 polish: someone who can change it directly sees no strip, so the requests list has its own button
            try: cp.wait_for_selector("#mos [data-cr-entry]:not([hidden])", timeout=8000)
            except Exception: raise AssertionError(cp.evaluate("(() => { const e = document.querySelector('#mos [data-cr-entry]'); return e ? JSON.stringify({ hidden: e.hidden, disp: getComputedStyle(e).display, r: e.getBoundingClientRect().toJSON(), n: document.querySelectorAll('[data-cr-entry]').length, conn: TribeClient.connected(), proj: TribeClient.project && TribeClient.project() }) : 'no entry element in #mos'; })()"))
            cp.click("#mos [data-cr-entry]"); cp.wait_for_selector(".ui-card", timeout=8000); cp.keyboard.press("Escape")
            cp.wait_for_function("!document.querySelector('.ui-card')", timeout=5000); cp.wait_for_timeout(200)
            assert cp.locator("#mos #mos-cv").count() == 1, "Esc closed the sheet, not Motion Studio under it"
            mp.evaluate(f"TribeMotionStudio.open({{ pid: '{pid}', key: '{mkey}', autoplay: false }})"); mp.wait_for_selector("#mos #mos-cv", timeout=20000)
            mbox = mp.locator("#mos-cv").bounding_box()
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.25, mbox["y"] + mbox["height"] * 0.7)
            mp.mouse.move(mbox["x"] + mbox["width"] * 0.26, mbox["y"] + mbox["height"] * 0.7)
            cp.wait_for_selector(f".cw-layer [data-cwp='{maya_id}']", timeout=10000)
            cbox = cp.locator("#mos-cv").bounding_box(); x, y = ptr_xy(cp, f".cw-layer [data-cwp='{maya_id}']")
            assert inside(x, y, cbox) and abs((x - cbox["x"]) / cbox["width"] - 0.26) < 0.06 and abs((y - cbox["y"]) / cbox["height"] - 0.7) < 0.06, ("same spot on the canvas", x, y, cbox)
            mp.evaluate("TribeMotionStudio.close()"); cp.evaluate("TribeMotionStudio.close()")

            # ---------- 4: roles: builders suggest app changes, Camp approves, Undo ----------
            ok(api("/perms/overrides", "PUT", {"cap": "app.edit", "role": "builder", "on": False}, token=host), "take app.edit from builders")
            how = ok(api(f"/projects/{pid}/changes/how", token=maya))["how"]
            assert how["app"]["can"] is False and "Camp" in how["app"]["who"], how["app"]
            cfg = ok(api(f"/projects/{pid}/app-config", token=maya))
            assert cfg["canEdit"] is False and cfg["canSuggest"] is True
            r = api(f"/projects/{pid}/app-config", "PUT", {"config": cfg["config"], "base": cfg["rev"]}, token=maya)
            assert r[0] == 403 and r[1].get("need") and "Camp" in r[1]["need"]["who"], r   # the server refuses, and says who can
            mp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); mp.wait_for_selector("#apc #apc-stage [data-e]", timeout=20000)
            mp.wait_for_function("document.querySelector('#apc-cr') && !document.querySelector('#apc-cr').hidden", timeout=15000)
            strip = mp.inner_text("#apc-cr")
            assert "Your changes go to Camp for OK" in strip, strip
            assert mp.is_disabled("#apc-cr [data-cr-suggest]"), "nothing to suggest yet"
            title_el = mp.locator('#apc-stage [data-e]').first
            old_word = title_el.inner_text()
            title_el.click(); mp.keyboard.press("End"); mp.keyboard.type(" (new)", delay=15); mp.keyboard.press("Enter")
            mp.wait_for_function("!document.querySelector('#apc-cr [data-cr-suggest]').disabled", timeout=10000)
            assert "Draft" in mp.inner_text("#apc-saved")
            assert ok(api(f"/projects/{pid}/app-config", token=host))["config"] == cfg["config"], "the draft is not saved to the tribe"
            mp.click("#apc-cr [data-cr-suggest]")
            mp.wait_for_selector("#cr-sheet #cr-send", timeout=10000)
            mp.wait_for_function("document.querySelectorAll('#cr-pics img').length === 2", timeout=15000)
            assert "Changed the screen" in mp.inner_text("#cr-sum") or mp.locator("#cr-sum li").count() >= 1
            mp.fill("#cr-why", "The title reads better")
            if SHOTS.exists(): mp.screenshot(path=str(SHOTS / "cowork-suggest-1500.png"))
            mp.click("#cr-send")
            try: mp.wait_for_selector("#cr-sheet", state="detached", timeout=10000)
            except Exception: raise AssertionError(("the suggestion did not send", [t for t in mp.locator(".toast, [role=status], .ui-toast").all_inner_texts() if t.strip()][-3:]))
            reqs = ok(api(f"/projects/{pid}/changes", token=host))["requests"]
            rq = [x for x in reqs if x["tool"] == "app" and x["status"] == "open"][0]
            assert rq["byName"] == "Maya" and rq["canDecide"] and rq["why"] == "The title reads better" and rq["hasPictures"], rq
            # Camp: the requests list, Approve
            cp.evaluate("TribeChanges.sheet()"); cp.wait_for_selector(f"#cr-list [data-cr='{rq['id']}'] [data-cr-act='approve']", timeout=10000)
            cp.wait_for_selector(f"#cr-list [data-cr='{rq['id']}'] .cr-pics img", timeout=10000)
            if SHOTS.exists(): cp.screenshot(path=str(SHOTS / "cowork-approve-1366.png"))
            cp.click(f"#cr-list [data-cr='{rq['id']}'] [data-cr-act='approve']")
            for _ in range(50):
                st = [x for x in ok(api(f"/projects/{pid}/changes", token=host))["requests"] if x["id"] == rq["id"]][0]
                if st["status"] != "open": break
                time.sleep(0.2)
            assert st["status"] == "applied" and st["decidedByName"] == "Camp", st
            saved = ok(api(f"/projects/{pid}/app-config", token=host))
            assert "(new)" in json.dumps(saved["config"]) and saved["savedBy"] == "Camp", "applied, saved by the approver"
            # Maya's open App Creator takes the approved version without a reload
            mp.wait_for_function("JSON.stringify(TribeAppCreator.doc()).includes('(new)') && !TribeAppCreator.state().pendingDraft", timeout=15000)
            # Undo puts the earlier version back
            ok(api(f"/projects/{pid}/changes/{rq['id']}/undo", "POST", {}, token=maya), "the asker undoes")
            assert "(new)" not in json.dumps(ok(api(f"/projects/{pid}/app-config", token=host))["config"])
            mp.evaluate("TribeAppCreator.close()")
            cp.keyboard.press("Escape")

            # ---------- 5: an AI helper's refused change becomes a request for its person ----------
            ok(api("/perms/overrides", "PUT", {"cap": "site.edit", "role": "builder", "on": False}, token=host), "take site.edit from builders")
            ag = ok(api("/agents", "POST", token=maya, project=pid))["token"]
            site = ok(api(f"/projects/{pid}/site-config", token=host))
            cfg2 = dict(site["config"]); cfg2["name"] = "Lantern Run (helper)"
            r = api(f"/projects/{pid}/site-config", "PUT", {"config": cfg2, "base": site["rev"]}, token=ag)
            assert r[0] == 202 and r[1]["request"]["agentName"] and r[1]["request"]["byName"] == "Maya" and "Camp" in r[1]["request"]["to"], r
            assert ok(api(f"/projects/{pid}/site-config", token=host))["config"]["name"] != "Lantern Run (helper)", "nothing changes until a person says yes"
            hid = r[1]["request"]["id"]
            ap = [a for a in ok(api("/approvals", token=host))["approvals"] if (a.get("change") or {}).get("id") == hid][0]
            ok(api(f"/approvals/{ap['id']}/deny", "POST", {"note": "Not now"}, token=host))
            assert [x for x in ok(api(f"/projects/{pid}/changes", token=maya))["requests"] if x["id"] == hid][0]["status"] == "denied"

            # ---------- 6: a council decides website changes: one yes isn't enough ----------
            ok(api("/groupstyle", "PUT", {"style": "custom", "rules": {"site.edit": "council"}, "council": {"members": [host and None or "", theo_id], "need": "all"}}, token=host, project=pid), "custom style")
            me_host = ok(api("/me", token=host))["member"]["id"]
            ok(api("/groupstyle", "PUT", {"council": {"members": [me_host, theo_id], "need": "all"}}, token=host, project=pid), "council")
            how = ok(api(f"/projects/{pid}/changes/how", token=maya))["how"]["site"]
            assert how["rule"] == "council" and how["can"] is False, how
            site = ok(api(f"/projects/{pid}/site-config", token=maya)); cfg3 = dict(site["config"]); cfg3["name"] = "Lantern Run (council)"
            rq3 = ok(api(f"/projects/{pid}/changes", "POST", {"tool": "site", "payload": cfg3, "why": "New name", "summary": ["Renamed the site"]}, token=maya))["request"]
            assert sorted(rq3["to"]) == ["Camp", "Theo"], rq3
            ap3 = [a for a in ok(api("/approvals", token=host))["approvals"] if (a.get("change") or {}).get("id") == rq3["id"]][0]
            a1 = ok(api(f"/approvals/{ap3['id']}/approve", "POST", {}, token=host))["approval"]
            assert a1["status"] == "pending" and a1["tally"]["yes"] == 1 and a1["tally"]["needed"] == 2, a1
            assert ok(api(f"/projects/{pid}/site-config", token=host))["config"]["name"] != "Lantern Run (council)", "one yes of two isn't enough"
            a2 = ok(api(f"/approvals/{ap3['id']}/approve", "POST", {}, token=theo))["approval"]
            assert a2["status"] == "approved", a2
            assert ok(api(f"/projects/{pid}/site-config", token=host))["config"]["name"] == "Lantern Run (council)", "the second yes applies it"
            ok(api("/groupstyle/reset", "POST", {}, token=host, project=pid))

            # ---------- 7: a phone: who is here and outlines, no pointers; cursors off ----------
            ok(api("/perms/reset", "POST", {}, token=host))
            php = page(theo, "Theo", 390, 844, phone=True)
            cp.set_viewport_size({"width": 1280, "height": 900})
            cp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); cp.wait_for_selector("#apc #apc-stage [data-b]", timeout=20000)
            php.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); php.wait_for_selector("#apc #apc-stage [data-b]", timeout=20000)
            blk = cp.eval_on_selector("#apc-stage [data-b]", "e => e.dataset.b")
            cp.locator(f'#apc-stage [data-b="{blk}"]').first.click(position={"x": 4, "y": 4})
            cbx = cp.locator(f'#apc-stage [data-b="{blk}"]').first.bounding_box()
            cp.mouse.move(cbx["x"] + 10, cbx["y"] + 10); cp.mouse.move(cbx["x"] + 12, cbx["y"] + 11)
            php.wait_for_function("document.querySelector('#apc-cw') && !document.querySelector('#apc-cw').hidden", timeout=15000)
            php.wait_for_selector(".cw-layer .cw-out", timeout=10000)
            php.wait_for_timeout(600)
            assert php.locator(".cw-layer .cw-ptr").count() == 0, "no pointers on a phone"
            wide = php.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            assert not wide, "no sideways scroll at 390px"
            if SHOTS.exists(): php.screenshot(path=str(SHOTS / "cowork-phone-390.png"))
            # live cursors off: Camp draws no pointers
            mp.evaluate(f"TribeAppCreator.open({{ pid: '{pid}' }})"); mp.wait_for_selector("#apc #apc-stage [data-b]", timeout=20000)
            cp.evaluate("TribeCursors.set(false)")
            mbx = mp.locator(f'#apc-stage [data-b="{blk}"]').first.bounding_box()
            for i in range(4): mp.mouse.move(mbx["x"] + 20 + i, mbx["y"] + 12); mp.wait_for_timeout(80)
            cp.wait_for_timeout(700)
            assert cp.locator(f".cw-layer [data-cwp='{maya_id}']").count() == 0, "live cursors off: no pointers"
            cp.evaluate("TribeCursors.set(true)")
            b.close()
        noise = [e for e in errors if "ResizeObserver" not in e]
        assert not noise, noise
        print("e2e_cowork_editors: OK (App Creator pointers, outline, typing lock; website preview pointers; Motion canvas pointer; draft -> suggest -> approve -> undo; helper's request; council needs both; phone presence; cursors off)")
    finally:
        srv.terminate()
        try: srv.wait(10)
        except Exception: pass


if __name__ == "__main__":
    main()
