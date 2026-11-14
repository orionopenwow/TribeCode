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
 7 a 390px phone fits, no page errors;
 8 under a council: the Company page offers a council member "Propose a change" (a request, not hidden buttons); the
   Task Board is open to claim in the browser, its own switch is locked with the reason, and a task can be put to a
   vote that the council counts; the ? next step becomes "Ask them" for someone who can't do the step;
 9 My folder in Files: mine to write, "Send to the main copy" is refused with who can, and Ask them works.
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
            tp = page(theo, "Theo", pid)
            # ---- 8: Company under a council: a council member proposes instead of the buttons being hidden ----
            tp.evaluate("TribeCompany.open()"); tp.wait_for_selector("#view-company #co-propose", timeout=15000)
            assert tp.locator("#co-settings").count() == 0 and "council decides changes here" in tp.inner_text("#co-propose-note").lower()
            tp.click("#co-propose")
            v = None
            for _ in range(40):
                v = next((x for x in ok(api(f"/chat/{chan}/votes", token=host, project=pid))["votes"] if x.get("council") and x["status"] == "open" and (x["council"].get("ask") or {}).get("cap") == "settings.edit"), None)
                if v: break
                time.sleep(0.25)
            assert v, "Propose a change didn't ask the council"
            ok(api(f"/chat/{chan}/vote/{v['id']}/close", "POST", {}, token=theo, project=pid), "withdraw the proposal")
            # ---- 8: the Task Board under a council, in the browser ----
            coin = ok(api("/tasks", "POST", {"title": "Draw the coin"}, token=host, project=pid))["task"]
            tp.evaluate("TribeShell.go('tasks')")
            tp.wait_for_function("[...document.querySelectorAll('#board [data-sec=needs] h5')].some(h => h.textContent.includes('Open to claim'))", timeout=15000)
            crow = tp.locator(f'#board .task[data-id="{coin["id"]}"]'); assert crow.locator('[data-qa="claim"]').inner_text().strip() == "Claim"
            assert "council" in tp.inner_text("#tk-mode").lower()
            tp.evaluate("document.querySelector('#tk-mode').click()"); tp.wait_for_selector('#tk-pop [data-wmode="council"]')
            assert tp.locator('#tk-pop [data-wmode]:not([disabled])').count() == 0 and "decides as a council" in tp.inner_text("#tk-pop"), "the board's own switch should be locked under a council"
            tp.screenshot(path=str(SHOTS / "group-styles-tasks-council-1440.png")); tp.keyboard.press("Escape")
            pg.evaluate("TribeShell.go('tasks')"); pg.wait_for_selector('#tk-mode', state="attached", timeout=15000); pg.wait_for_timeout(800); pg.evaluate("document.querySelector('#tk-mode').click()"); pg.wait_for_selector('#tk-pop [data-wmode="council"]')
            assert pg.locator('#tk-pop [data-wmode]:not([disabled])').count() == 0, "even the owner can't flip the board back while the group is a council"
            pg.keyboard.press("Escape")
            crow.locator('[data-qa="claim"]').click()
            tp.wait_for_function(f"fetch('/api/tasks', {{ headers: {{ Authorization: 'Bearer {theo}', 'X-Project': '{pid}' }} }}).then(r => r.json()).then(d => d.tasks.find(t => t.id === '{coin['id']}').assignee === '{theo_id}')", timeout=10000)
            ok(api(f"/chat/{chan}/vote", "POST", {"question": "Should we do “Draw the coin”?"}, token=theo, project=pid))
            v = next(x for x in ok(api(f"/chat/{chan}/votes", token=host, project=pid))["votes"] if x["q"].startswith("Should we do") and x["status"] == "open")
            assert v["council"]["need"] == "majority" and v["tally"]["needed"] == 2, "a vote about a task is counted by the council"
            for t in (host, maya): api(f"/chat/{chan}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=t, project=pid)
            # ---- 8: the ? next step for someone who can't do the step ----
            tp.wait_for_function("window.TribeNextStep && TribeNextStep.open", timeout=8000)
            nx = tp.evaluate("(async () => { await TribeGroupStyle.load(); const st = { tribe: true, project: { id: 'x', name: 'X', kind: 'site' }, vision: false, tasks: 0, cant: { 'settings.edit': 'Camp, Maya' } }; const p = TribeNextStep.pick ? TribeNextStep.pick(st) : null; return p && p.best ? [p.best.title, p.best.act, p.best.run, p.best.why] : null; })()")
            assert nx and nx[1] == "Ask them" and nx[2] == "ask" and "Camp, Maya" in nx[3], nx
            tp.evaluate("TribeNextStep.close && TribeNextStep.close()"); tp.wait_for_timeout(300)   # a finished task offers the next step; not what this checks
            WHO_OPENED = tp.evaluate("!!document.querySelector('.nx-scrim')")
            sheet(tp)
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

            # ---- 9: My folder in Files ----
            work = Path(tempfile.mkdtemp(prefix="gs-src-", dir="/tmp")) / "bakery"; work.mkdir()
            (work / "index.html").write_text("<h1>Bakery</h1>")
            gitc = lambda *a: subprocess.run(["git", "-C", str(work), "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
            gitc("init", "-q", "-b", "main"); gitc("add", "-A"); gitc("commit", "-q", "-m", "init")
            fp = ok(api("/projects", "POST", {"path": str(work)}, token=host))["project"]["id"]
            fpg = page(theo, "Theo", fp)
            fpg.evaluate("TribeApp.show('docs'); TribeCodeFiles.set('code')")
            fpg.wait_for_selector("#cf-mine:not([hidden])", timeout=15000); fpg.click("#cf-mine")
            fpg.wait_for_selector("#cf-viewer #cf-send", timeout=15000)
            assert fpg.evaluate("(TribeCodeFiles.current() || {}).path") == f"people/{theo_id}/README.md"
            fpg.click("#cf-new"); fpg.fill("#cf-new-name", "idea.md"); fpg.click("#cf-new-ok")
            fpg.wait_for_function(f"(TribeCodeFiles.current() || {{}}).path === 'people/{theo_id}/idea.md'", timeout=10000)
            assert api("/code/file", "PUT", {"path": f"people/{theo_id}/idea.md", "text": "nope"}, token=maya, project=fp)[0] == 403, "someone else wrote in Theo's folder"
            ok(api("/code/file", "PUT", {"path": f"people/{theo_id}/idea.md", "text": "A bread quiz"}, token=theo, project=fp))
            fpg.screenshot(path=str(SHOTS / "group-styles-myfolder-1440.png"))
            fpg.click("#cf-send"); fpg.wait_for_selector("#gs-askbar #gs-askbar-go", timeout=8000)
            assert "Camp can do this here" in fpg.inner_text("#gs-askbar") and not (work / "idea.md").exists()
            fpg.click("#gs-askbar-go"); fpg.wait_for_selector("#gs-askbar", state="detached", timeout=8000)
            fch = ok(api("/groupstyle", token=host, project=fp))["channel"]
            v = next(x for x in ok(api(f"/chat/{fch}/votes", token=host, project=fp))["votes"] if x.get("council") and x["status"] == "open")
            ok(api(f"/chat/{fch}/vote/{v['id']}/cast", "POST", {"option": "yes"}, token=host, project=fp)); fpg.wait_for_timeout(500)
            fpg.click("#cf-send"); fpg.wait_for_function("(TribeCodeFiles.current() || {}).path === 'idea.md'", timeout=10000)
            assert (work / "idea.md").read_text() == "A bread quiz"
            fpg.close()

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
