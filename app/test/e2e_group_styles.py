"""How this group decides (feat/group-styles: server/groupstyle.js, app/ui/groupstyle.js, docs/ROLES-AND-PERMISSIONS.md).
Checks:
 1 a tribe that never chose a style is "One lead"; the sheet opens from Company, People and Settings and lists who can
   do what in plain words (the computer's owner rows are never askable);
 2 a friend who can't do something sees who can and "Ask them"; the lead says yes in the chat; the friend can then do it;
 3 the group's own words: Company -> Club, Lead -> Captain everywhere (also in Spanish), and back;
 4 Company setup asks who has the final say; choosing a council lands, the lead role reads "Council", tasks become
   open to claim, and nobody (not even the owner) changes settings alone; a friend's request passes with two of three;
 5 a custom role: name, purpose, what it looks after, who holds it; the holder gets exactly that;
 6 a non-decider's change to the style goes to a vote instead of being saved;
 7 a 390px phone fits, no page errors.
Usage: TRIBE_PORT_OFFSET=3320 python3 app/test/e2e_group_styles.py   (screenshots: docs/screenshots/group-styles-*.png)
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5700 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
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


def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-gs-", dir="/tmp")); errors = []
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
        p = ok(api("/projects", "POST", {"name": "Firefly Labs"}, token=host)); pid = (p.get("project") or p)["id"]
        p2 = ok(api("/projects", "POST", {"name": "Moth Notes"}, token=host)); pid2 = (p2.get("project") or p2)["id"]
        ch = lambda project: ok(api("/groupstyle/ask", "POST", {"cap": "nope"}, token=host, project=project)) if False else None

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(token, name, project, w=1280, h=900, phone=False, lang="en"):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.lang', '%s');"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (lang, name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, is_mobile=phone, has_touch=phone)
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                try: pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeGroupStyle && window.TribeCompany && window.TribeUI", timeout=45000)
                except Exception: raise AssertionError(("app didn't start", errors, pg.evaluate("[!!window.TribeClient, window.TribeClient && TribeClient.connected(), !!window.TribeGroupStyle, !!window.TribeCompany, !!window.TribeUI]")))
                pg.evaluate(f"TribeProjects.switchTo('{project}', 'home')"); pg.wait_for_timeout(700)
                return pg
            def sheet(pg):
                pg.evaluate("TribeGroupStyle.open()"); pg.wait_for_selector("#gs-sheet #gs-who li", timeout=15000)
            def close(pg):
                pg.click("#gs-sheet #gs-close"); pg.wait_for_selector("#gs-sheet", state="detached", timeout=8000)

            # ---- 1: default = one lead; the ways in; plain rows ----
            pg = page(host, "Camp", pid)
            sheet(pg)
            assert pg.get_attribute("#gs-sheet [data-style='lead']", "aria-checked") == "true", "a tribe that never chose is One lead"
            txt = pg.inner_text("#gs-who")
            for want in ("Send work to the main copy", "Publish the website or app for everyone", "Only the computer’s owner", "Invite people"):
                assert want in txt, want
            for bad in ("repo", "merge", "host"):
                assert bad not in txt.lower().replace("ghost", ""), f"plain words: {bad!r} in the list"
            assert pg.locator("#gs-who li.locked [data-ask]").count() == 0, "an owner-only row offers Ask"
            assert pg.locator("#gs-sheet #gs-save").count() == 0, "nothing to save before a change"
            pg.screenshot(path=str(SHOTS / "group-styles-who-1440.png")) if False else None
            close(pg)
            pg.evaluate("TribeCompany.open()"); pg.wait_for_selector("#view-company", timeout=15000)
            pg.evaluate("TribeSettings.open('admin')"); pg.click("#set-groupstyle"); pg.wait_for_selector("#gs-sheet #gs-who li"); close(pg)
            assert pg.locator("#ppl-whocan").count() == 1, "People has no way in"

            # ---- 2: a friend can't; sees who can; asks; the lead says yes ----
            mp = page(maya, "Maya", pid)
            r = mp.evaluate("TribeClient.api('/vision', { method: 'PUT', body: { text: 'x' } }).then(() => 'ok', e => e.status)")
            assert r == 403
            mp.wait_for_selector("#gs-askbar #gs-askbar-go", timeout=8000)
            bar = mp.inner_text("#gs-askbar"); assert "Camp can do this here" in bar and "Change project settings" in bar, bar
            mp.click("#gs-askbar-go"); mp.wait_for_selector("#gs-askbar", state="detached", timeout=8000)
            chan = ok(api("/groupstyle", token=host, project=pid))["channel"]
            votes = ok(api(f"/chat/{chan}/votes", token=host, project=pid))["votes"]
            v = next(x for x in votes if x.get("council")); assert v["status"] == "open" and "Maya asks to change project settings" in v["q"], v
            ok(api(f"/chat/{chan}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=host, project=pid), "the lead answers the request")
            mp.wait_for_timeout(600)
            assert mp.evaluate("TribeClient.api('/vision', { method: 'PUT', body: { text: 'Maya was allowed' } }).then(() => 'ok', e => e.status)") == "ok", "the pass didn't work"
            sheet(mp); assert "They said yes" in mp.inner_text("#gs-passes"); close(mp)

            # ---- 3: our own words, everywhere, in two languages ----
            sheet(pg)
            pg.fill("#gs-sheet [data-word='group']", "Club"); pg.fill("#gs-sheet #gs-w-lead2", "Captain")
            pg.click("#gs-sheet #gs-save"); pg.wait_for_function("(TribeGroupStyle.view() || {}).words && TribeGroupStyle.view().words.group === 'Club'", timeout=8000)
            close(pg)
            pg.evaluate("TribeCompany.open()"); pg.wait_for_selector("#view-company #co-make", timeout=15000)
            pg.wait_for_function("/club/i.test(document.querySelector('#view-company .eyebrow').innerText) && !/company/i.test(document.querySelector('#view-company .eyebrow').innerText)", timeout=8000)
            assert pg.evaluate("TribeI18n.plainWords('give the captain role to Maya in the club')") == "give the lead role to Maya in the company"
            es = page(host, "Camp", pid, lang="es")
            es.evaluate("TribeCompany.open()"); es.wait_for_selector("#view-company #co-make", timeout=15000)
            es.wait_for_function("/club/i.test(document.querySelector('#view-company .eyebrow').innerText) && !/empresa|company/i.test(document.querySelector('#view-company .eyebrow').innerText)", timeout=8000)
            es.close()

            # ---- 4: Company setup asks who has the final say; a council ----
            pg.click("#co-make"); pg.wait_for_selector("#co-setup[data-step='1']")
            pg.click("#co-setup [data-tpl='club']") if pg.locator("#co-setup [data-tpl='club']").count() else pg.click("#co-setup [data-tpl]")
            pg.wait_for_selector("#co-setup[data-step='2']"); pg.click("#cs-next"); pg.wait_for_selector("#co-setup[data-step='3']")
            assert pg.locator("#cs-style [data-gstyle]").count() == 3 and pg.get_attribute("#cs-style [data-gstyle='lead']", "aria-checked") == "true"
            pg.click("#cs-style [data-gstyle='council']"); pg.wait_for_selector("#cs-style [data-gstyle='council'][aria-checked='true']")
            assert "You decide the big things together" in pg.inner_text("#co-setup")
            pg.screenshot(path=str(SHOTS / "group-styles-setup-1440.png"))
            pg.click("#cs-next"); pg.wait_for_selector("#co-setup[data-step='4']"); pg.click("#cs-next")
            pg.wait_for_selector("#view-company .co-seat", timeout=20000)
            pg.wait_for_function("(TribeGroupStyle.view() || {}).style === 'council'", timeout=8000)
            DBG = lambda: pg.evaluate("[...document.querySelectorAll('#view-company .co-seat')].map(e => e.className + ' | ' + ((e.querySelector('.co-role') || {}).innerText || '-')).slice(0, 3).concat([TribeGroupStyle.leadName()])")
            try: pg.wait_for_function("/council/i.test((document.querySelector('#view-company .co-seat.ceo .co-role') || {}).innerText || '')", timeout=8000)
            except Exception: raise AssertionError(DBG())
            g = ok(api("/groupstyle", token=host, project=pid)); assert g["style"] == "council" and sorted(x["name"] for x in g["council"]["people"]) == ["Camp", "Maya", "Theo"]
            assert ok(api("/groupstyle", token=host, project=pid2))["style"] == "lead", "another project changed too"
            assert api("/vision", "PUT", {"text": "alone"}, token=host, project=pid)[0] == 403, "the owner decided alone under a council"
            assert ok(api("/tasks/settings", token=host, project=pid))["settings"]["mode"] == "council", "tasks didn't follow the council"
            assert ok(api("/ship", token=host, project=pid)).get("settings", {}).get("mode", "majority") == "majority"
            pg.click("#co-whocan"); pg.wait_for_selector("#gs-sheet #gs-who li", timeout=15000)   # the way in from the Company page
            assert pg.locator("#gs-council [data-cm]").count() == 3 and pg.input_value("#gs-need") == "majority"
            row = pg.inner_text("#gs-who li[data-cap='repo.merge']"); assert "The council agrees" in row and "Camp" in row and "Maya" in row, row
            pg.screenshot(path=str(SHOTS / "group-styles-council-1440.png"))
            # a friend asks from the list; two of three say yes
            tp = page(theo, "Theo", pid); sheet(tp)
            tp.click("#gs-who li[data-cap='site.publish'] [data-ask]"); tp.wait_for_function("document.querySelector(\"#gs-who li[data-cap='site.publish'] [data-ask]\").textContent === 'Asked'", timeout=8000)
            votes = ok(api(f"/chat/{chan}/votes", token=host, project=pid))["votes"]; v = next(x for x in votes if x.get("council") and x["status"] == "open")
            assert v["tally"]["needed"] == 2 and v["tally"]["n"] == 3, v["tally"]
            assert api(f"/chat/{chan}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=host, project=pid)[0] == 200
            assert "site.publish" not in ok(api("/perms", token=theo, project=pid))["me"]["caps"], "one yes was enough"
            assert api(f"/chat/{chan}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=maya, project=pid)[0] == 200
            assert "site.publish" in ok(api("/perms", token=theo, project=pid))["me"]["caps"], "two of three didn't pass it"
            close(tp)

            # ---- 6: a change by someone who can't decide alone goes to a vote ----
            sheet(tp); tp.click("#gs-sheet [data-style='custom']")
            assert tp.inner_text("#gs-sheet #gs-save").strip() == "Put it to a vote"
            tp.click("#gs-sheet #gs-save"); tp.wait_for_timeout(800)
            assert ok(api("/groupstyle", token=host, project=pid))["style"] == "council", "it was saved without a vote"
            v = next(x for x in ok(api(f"/chat/{chan}/votes", token=host, project=pid))["votes"] if x.get("council") and x["status"] == "open")
            for t in (host, maya): api(f"/chat/{chan}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=t, project=pid)
            assert ok(api("/groupstyle", token=host, project=pid))["style"] == "custom", "the vote passed but nothing changed"
            close(tp) if tp.locator("#gs-sheet").count() else None

            # ---- 5: a custom role ----
            pg.wait_for_function("(TribeGroupStyle.view() || {}).style === 'custom'", timeout=8000)
            if pg.locator("#gs-sheet").count(): close(pg)
            sheet(pg)
            pg.click("#gs-addrole"); pg.fill("#gs-sheet [data-rname='0']", "Keeper"); pg.fill("#gs-sheet [data-rpurpose='0']", "Looks after the main copy")
            pg.check("#gs-sheet [data-rcap='0'][value='repo.merge']"); pg.check(f"#gs-sheet [data-rmem='0'][value='{maya_id}']")
            assert pg.locator("#gs-sheet [data-rcap='0'][value^='tribe.']").count() == 0, "an owner-only thing can be ticked"
            pg.screenshot(path=str(SHOTS / "group-styles-role-1440.png"))
            pg.click("#gs-sheet #gs-save"); pg.wait_for_function("(TribeGroupStyle.view() || {}).roles.length === 1", timeout=8000)
            caps = ok(api("/perms", token=maya, project=pid))["me"]["caps"]; assert "repo.merge" in caps and "project.delete" not in caps, caps
            assert "repo.merge" not in ok(api("/perms", token=theo, project=pid))["me"]["caps"]
            row = pg.inner_text("#gs-who li[data-cap='repo.merge']"); assert "Maya" in row, row
            assert pg.locator("#gs-who [data-rule='repo.merge']").count() == 1, "custom: each thing has its own rule"
            pg.screenshot(path=str(SHOTS / "group-styles-who-1440.png"))
            close(pg)

            # ---- 7: phone ----
            ph = page(maya, "Maya", pid, 390, 844, phone=True); sheet(ph)
            assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "the phone page scrolls sideways"
            assert ph.evaluate("[...document.querySelectorAll('#gs-sheet *')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1)"), "something sticks out of the sheet at 390px"
            small = ph.evaluate("[...document.querySelectorAll('#gs-sheet button, #gs-sheet select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 28).map(e => e.id || e.className).slice(0, 5)")
            assert not small, f"small tap targets: {small}"
            ph.screenshot(path=str(SHOTS / "group-styles-who-390.png"))
            ph.evaluate("document.querySelector('#gs-who').scrollIntoView()"); ph.wait_for_timeout(200)
            ph.screenshot(path=str(SHOTS / "group-styles-list-390.png"))
            b.close()
        assert not errors, errors
        print("e2e_group_styles: all checks passed · screenshots in docs/screenshots/group-styles-*.png")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
