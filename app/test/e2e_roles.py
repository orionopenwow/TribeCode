"""Roles & privileges (server/perms.js, app/ui/roles.js): admin and mod roles, the capability table, mutes, audit log.

API (security first):
  * a builder can't moderate, mute, assign roles or change privileges
  * an admin can assign mod but not admin (until the host allows it) and never touches the host; no secrets, hosting
    or backup; can't toggle their own column or a locked row, nor grant a privilege they don't hold
  * a mod deletes anyone's message below them (not the host's), mutes, removes from a project, decides low-risk
    approvals only, and gets 403 on settings, widgets, the AI brain, hosting and project delete
  * agents never get roles; a muted member (and their agent) gets 403 on post until the mute expires
  * overrides persist across a restart; every role change and moderation action lands in the audit log
UI: Settings › Roles & privileges (matrix, lock cells, role picker, reset), role badges, chat mod tools, the muted
notice, and the phone (390px) profile sheet with mod tools, no sideways scroll.
Usage: python app/test/e2e_roles.py [--shots]
"""
import json, os, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5050 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **({"X-Project": project} if project else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            try: return r.status, json.loads(raw or b"{}")
            except Exception: return r.status, {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or b"{}")
        except Exception: return e.code, {}


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def no(r, what="", code=403):
    st, d = r
    assert st == code, f"{what}: expected {code}, got {st} {d}"
    return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    res = d.get("result") or {}
    return bool(res.get("isError") or d.get("error")), json.dumps(d)


def wait_up():
    for _ in range(80):
        try:
            if api("/health")[0] == 200: return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError("server did not start")


def start(tmp, log, env):
    return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-roles-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = start(tmp, log, env)
    try:
        wait_up()
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pa = ok(api("/projects", "GET", token=host))["projects"][0]["id"]
        pb = ok(api("/projects", "POST", {"name": "Side Quest"}, token=host), "project B")["project"]["id"]
        inv = ok(api("/invites", "POST", {"role": "builder", "maxUses": 10, "project": "tribe"}, token=host))["invite"]["code"]
        people = {}
        for n in ["Ada", "Max", "Bo", "Cy", "Di"]:
            d = ok(api("/join", "POST", {"code": inv, "name": n}), "join " + n)
            people[n] = (d["member"]["id"], d["token"])
        ada, ada_t = people["Ada"]; mx, mx_t = people["Max"]; bo, bo_t = people["Bo"]; cy, cy_t = people["Cy"]; di, di_t = people["Di"]
        host_id = ok(api("/me", token=host))["member"]["id"]

        # ---- defaults: builders get builder caps only ----
        me = ok(api("/perms", token=bo_t))["me"]
        assert me["role"] == "builder" and me["caps"].get("members.invite") and not me["caps"].get("chat.moderate"), me
        assert "matrix" not in ok(api("/perms", token=bo_t)), "builders don't see the matrix"
        hm = ok(api("/perms", token=host))
        assert all(c["cells"]["host"]["on"] for c in hm["matrix"]), "host has every capability"
        assert all(not c["cells"][r]["on"] for c in hm["matrix"] if c["locked"] for r in ("admin", "mod", "builder")), "locked rows are host only"

        # chat: a few messages
        m_host = ok(api("/chat/general", "POST", {"text": "host here"}, token=host))["message"]["id"]
        m_bo = ok(api("/chat/general", "POST", {"text": "bo says something rude"}, token=bo_t))["message"]["id"]
        m_cy = ok(api("/chat/general", "POST", {"text": "cy says hi"}, token=cy_t))["message"]["id"]

        # ---- a builder can't moderate ----
        no(api(f"/chat/general/msg/{m_cy}", "DELETE", token=bo_t), "builder deletes someone else's message")
        no(api("/perms/mute", "POST", {"member": cy, "minutes": 10}, token=bo_t), "builder mutes")
        no(api("/perms/assign", "POST", {"member": cy, "role": "mod"}, token=bo_t), "builder assigns")
        no(api("/perms/overrides", "PUT", {"cap": "chat.moderate", "role": "builder", "on": True}, token=bo_t), "builder toggles privileges")
        no(api("/perms/remove", "POST", {"member": cy, "project": pb}, token=bo_t), "builder removes from project")
        no(api("/perms/audit", token=bo_t), "builder reads the audit log")

        # ---- host makes Ada admin, Max mod ----
        ok(api("/perms/assign", "POST", {"member": ada, "role": "admin"}, token=host), "host -> admin")
        ok(api("/perms/assign", "POST", {"member": mx, "role": "mod"}, token=host), "host -> mod")
        roles = {m["id"]: m["role"] for m in ok(api("/members", token=bo_t))["members"]}
        assert roles[ada] == "admin" and roles[mx] == "mod", roles
        no(api("/perms/assign", "POST", {"member": host_id, "role": "builder"}, token=host), "nobody changes the host (not even the host)")
        no(api("/perms/assign", "POST", {"member": bo, "role": "host"}, token=host), "host is not assignable", code=400)

        # agents never get roles above builder
        ag = ok(api("/agents", "POST", {}, token=cy_t), "cy's agent")
        ag_id, ag_t = ag["agent"]["id"], ag["token"]
        no(api("/perms/assign", "POST", {"member": ag_id, "role": "mod"}, token=host), "agents never get roles")

        # ---- admin ----
        ok(api("/perms/assign", "POST", {"member": cy, "role": "mod"}, token=ada_t), "admin assigns mod")
        no(api("/perms/assign", "POST", {"member": bo, "role": "admin"}, token=ada_t), "admin assigns admin (not allowed by default)")
        no(api("/perms/assign", "POST", {"member": host_id, "role": "mod"}, token=ada_t), "admin touches host")
        no(api("/perms/assign", "POST", {"member": ada, "role": "mod"}, token=ada_t), "admin changes own role")
        ok(api("/perms/assign", "POST", {"member": cy, "role": "builder"}, token=ada_t), "admin demotes mod")
        # secrets, hosting, backup, launching stay with the host
        lv = ok(api("/llm", token=ada_t))
        assert "providers" not in lv and "hasKey" not in lv, "admin must not see AI key details"
        no(api("/llm", "PUT", {"provider": "none"}, token=ada_t), "admin changes the AI brain / keys")
        no(api("/share/public", "POST", {}, token=ada_t), "admin turns on public sharing")
        no(api("/backup", token=ada_t), "admin downloads backup")
        no(api("/repo/settings", "PUT", {}, token=ada_t), "admin changes repo settings (check commands run on the host)")
        assert ok(api("/openspace", token=ada_t)).get("hostOnly"), "Open Space stays host-only"
        # admin can do app things the host can
        ok(api(f"/projects/{pb}", "PATCH", {"name": "Side Quest II"}, token=ada_t))
        assert [p for p in ok(api("/projects", token=host))["projects"] if p["id"] == pb][0]["name"] == "Side Quest II", "admin renames a project"
        ok(api("/vision", "PUT", {"text": "# Vision\nAdmins can edit this."}, token=ada_t), "admin edits vision")
        # privileges: no more than the admin holds, never their own column, never locked rows
        no(api("/perms/overrides", "PUT", {"cap": "tribe.secrets", "role": "mod", "on": True}, token=ada_t), "locked row")
        no(api("/perms/overrides", "PUT", {"cap": "chat.moderate", "role": "admin", "on": False}, token=ada_t), "admin edits own column")
        no(api("/perms/overrides", "PUT", {"cap": "roles.manage_admins", "role": "admin", "on": True}, token=ada_t), "admin grants themselves admin management")
        no(api("/perms/overrides", "PUT", {"cap": "tribe.hosting", "role": "admin", "on": True}, token=host), "even the host can't share a locked row")
        ok(api("/perms/overrides", "PUT", {"cap": "settings.edit", "role": "mod", "on": True}, token=ada_t), "admin grants a privilege it holds to mods")
        assert ok(api("/perms", token=mx_t))["me"]["caps"].get("settings.edit"), "override applies"
        ok(api("/perms/overrides", "PUT", {"cap": "settings.edit", "role": "mod", "on": False}, token=ada_t))
        # the host lets admins manage admins
        ok(api("/perms/overrides", "PUT", {"cap": "roles.manage_admins", "role": "admin", "on": True}, token=host))
        ok(api("/perms/assign", "POST", {"member": di, "role": "admin"}, token=ada_t), "admin promotes admin when the host allows it")
        ok(api("/perms/assign", "POST", {"member": di, "role": "builder"}, token=ada_t), "admin demotes admin when the host allows it")

        # ---- mod ----
        d = ok(api(f"/chat/general/msg/{m_bo}", "DELETE", token=mx_t), "mod deletes a builder's message")["message"]
        assert d.get("deleted") and d.get("removedBy") == mx, d
        no(api(f"/chat/general/msg/{m_host}", "DELETE", token=mx_t), "mod deletes the host's message")
        no(api(f"/chat/general/msg/{m_cy}", "PATCH", {"text": "edited by mod"}, token=mx_t), "mod edits someone else's message")
        no(api("/llm", "PUT", {"provider": "none"}, token=mx_t), "mod changes AI brain")
        no(api("/share/public", "POST", {}, token=mx_t), "mod shares the tribe")
        no(api(f"/projects/{pb}/widgets", "PUT", {"widgets": []}, token=mx_t, project=pb), "mod changes widgets")
        no(api("/vision", "PUT", {"text": "nope"}, token=mx_t), "mod edits vision")
        no(api(f"/projects/{pb}", "DELETE", {"confirm": "Side Quest II"}, token=mx_t), "mod deletes a project")
        no(api("/perms/assign", "POST", {"member": bo, "role": "mod"}, token=mx_t), "mod assigns roles")
        no(api("/perms/mute", "POST", {"member": ada, "minutes": 10}, token=mx_t), "mod mutes an admin")
        # triage: a mod moves, assigns and closes someone else's task
        t = ok(api("/tasks", "POST", {"title": "Fix the campfire"}, token=bo_t))["task"]
        ok(api(f"/tasks/{t['id']}", "PATCH", {"status": "done", "assignee": cy}, token=mx_t), "mod triages a task")
        # approvals: low risk yes, high risk no
        low = ok(api("/approvals", "POST", {"title": "Rename a file", "risk": "low", "to": [host_id]}, token=cy_t))["approval"]["id"]
        high = ok(api("/approvals", "POST", {"title": "Delete prod", "risk": "high", "to": [host_id]}, token=cy_t))["approval"]["id"]
        ok(api(f"/approvals/{low}/approve", "POST", {"note": "fine"}, token=mx_t), "mod approves low risk")
        no(api(f"/approvals/{high}/approve", "POST", {}, token=mx_t), "mod approves high risk")
        ok(api(f"/approvals/{high}/deny", "POST", {}, token=ada_t), "admin decides any approval")
        # remove from project: Cy loses Side Quest, keeps the first project
        ok(api("/perms/remove", "POST", {"member": cy, "project": pb}, token=mx_t), "mod removes from project")
        no(api("/tasks", token=cy_t, project=pb), "removed member can't read that project")
        ok(api("/tasks", token=cy_t, project=pa), "removed member keeps the other project")
        # mute: Bo can't post (nor Bo's agent); reactions and reading still work
        bo_ag = ok(api("/agents", "POST", {}, token=bo_t))
        ok(api("/perms/mute", "POST", {"member": bo, "minutes": 10, "reason": "cool off"}, token=mx_t), "mod mutes")
        e = no(api("/chat/general", "POST", {"text": "let me talk"}, token=bo_t), "muted member posts")
        assert "muted" in e["error"], e
        no(api("/chat/general/send", "POST", {"text": "via send"}, token=bo_t), "muted member posts via send")
        ok(api("/chat/general", token=bo_t), "muted member still reads")
        err, txt = mcp(bo_ag["token"], "post_chat", {"text": "agent posting for a muted owner"})
        assert err, "a muted member's agent can't post either: " + txt
        assert any(m["id"] == bo and m.get("mutedUntil") for m in ok(api("/members", token=host))["members"]), "presence carries the mute"
        ok(api(f"/perms/mute/{bo}", "DELETE", token=mx_t), "mod unmutes")
        ok(api("/chat/general", "POST", {"text": "thanks"}, token=bo_t), "unmuted member posts")
        ok(api("/perms/mute", "POST", {"member": bo, "minutes": 5}, token=mx_t))

        # ---- audit log ----
        acts = [x["action"] for x in ok(api("/perms/audit", token=host))["entries"]]
        for a in ["role", "mute", "unmute", "message-delete", "remove", "privilege"]:
            assert a in acts, (a, acts)
        no(api("/perms/audit", token=mx_t), "mod reads the audit log")

        # ---- persistence + mute expiry across a restart ----
        ok(api("/perms/overrides", "PUT", {"cap": "members.invite", "role": "builder", "on": False}, token=host))
        srv.send_signal(signal.SIGTERM); srv.wait(10)
        pf = tmp / "tribe" / ".tribe" / "perms.json"; pj = json.loads(pf.read_text())
        assert pj["overrides"]["members.invite"]["builder"] is False, pj
        pj["mutes"][bo]["until"] = "2000-01-01T00:00:00.000Z"; pf.write_text(json.dumps(pj))
        srv = start(tmp, log, env); globals()["_srv"] = srv; wait_up()
        no(api("/invites", "POST", {"project": "tribe"}, token=bo_t), "override persisted: builders can't invite")
        ok(api("/chat/general", "POST", {"text": "back"}, token=bo_t), "mute expired")
        ok(api("/perms/reset", "POST", {}, token=host))
        ok(api("/invites", "POST", {"project": "tribe"}, token=bo_t), "reset restores defaults")

        # ---- UI ----
        mute_cy = ok(api("/chat/general", "POST", {"text": "cy's message for the menu"}, token=cy_t))["message"]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append("host: " + str(e)))
            pg.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', server: {{url: '{BASE}', token: '{host}'}}}}))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeRoles && TribeRoles.state().me", timeout=20000)
            # badges in the room list and chat names
            try: pg.wait_for_selector("#room-list .role-pill.rp-admin", state="attached", timeout=10000)
            except Exception: raise AssertionError(f"no admin badge: {pg.evaluate('document.querySelector(`#room-list`).outerHTML.slice(0, 3000)')} {pg.evaluate('JSON.stringify((TribeClient.state().members||[]).map(m=>[m.name,m.role]))')} {errors}")
            assert pg.locator("#room-list .role-pill.rp-mod").count() >= 1, "mod badge in Who is here"
            # Settings › Roles & privileges
            pg.evaluate("TribeSettings.open()"); pg.click("#set-roles")
            pg.wait_for_selector("#roles-modal:not(.hidden) .rl-matrix", timeout=10000)
            assert pg.locator(".rl-cell.locked[title='Host only']").count() == 4 * 3, "locked cells show a lock with 'Host only'"
            assert pg.locator(f"[data-role-for='{bo}'] option[value='admin']").count() == 1, "host can pick any role"
            cell = f".rl-cell[data-cap='chat.moderate'][data-col='builder']"
            pg.click(cell); pg.wait_for_selector(cell + "[aria-checked='true'].changed", timeout=5000)
            assert ok(api("/perms", token=bo_t))["me"]["caps"].get("chat.moderate"), "matrix toggle reaches the server"
            pg.select_option(f"[data-role-for='{di}']", "mod")
            pg.wait_for_function(f"(TribeClient.state().members||[]).some(m => m.id === '{di}' && m.role === 'mod')", timeout=8000)
            if "--shots" in sys.argv: pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "roles.png"))
            pg.click(".rl-foot [data-rl='log']"); pg.wait_for_selector(".rl-log li", timeout=5000)
            assert "Di" in pg.text_content(".rl-log"), pg.text_content(".rl-log")
            pg.click("[data-rl='reset']"); pg.wait_for_selector(cell + "[aria-checked='false']", timeout=5000)
            pg.click("[data-rl='close']")

            # a mod in chat: Delete for everyone + Mute in the message menu
            md = b.new_page(viewport={"width": 1280, "height": 860}); md.on("pageerror", lambda e: errors.append("mod: " + str(e)))
            md.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Max', server: {{url: '{BASE}', token: '{mx_t}'}}}}))")
            md.goto(BASE + "/?skipIntro=1"); md.wait_for_function("TribeClient.connected() && TribeRoles.can('chat.moderate')", timeout=20000)
            md.evaluate("TribeApp.show('chat')")
            row = f"#chat-list .msg[data-id='{mute_cy}']"
            md.wait_for_selector(row, timeout=10000)
            assert md.locator(f"#chat-list .msg[data-by='{mx}'] .nm .role-pill.rp-mod, #chat-list .msg[data-by='{host_id}'] .nm .role-pill.rp-host").count() >= 1, "role pill next to chat names"
            md.hover(row); md.click(row + " .msg-more")
            md.wait_for_selector("#msg-menu [data-act='mod-del']", timeout=5000)
            assert md.locator("#msg-menu [data-act='mod-mute']").count() == 3, "Mute 10m/1h/24h"
            md.click("#msg-menu [data-act='mod-mute'][data-min='10']")
            md.wait_for_function(f"(TribeClient.state().members||[]).some(m => m.id === '{cy}' && m.mutedUntil)", timeout=8000)
            md.hover(row); md.click(row + " .msg-more"); md.click("#msg-menu [data-act='mod-del']"); md.click("#msg-menu [data-act='mod-del']")
            md.wait_for_function(f"(document.querySelector(\"{row}\")||{{}}).textContent?.includes('removed by a moderator')", timeout=8000)
            # the host's own message has no mod tools for a mod
            hrow = f"#chat-list .msg[data-id='{m_host}']"
            if md.locator(hrow).count():
                md.hover(hrow); md.click(hrow + " .msg-more"); md.wait_for_selector("#msg-menu", timeout=3000)
                assert md.locator("#msg-menu [data-act='mod-del']").count() == 0, "mods can't delete the host's message"
                md.keyboard.press("Escape"); md.evaluate("document.getElementById('msg-menu') && document.getElementById('msg-menu').remove()")

            # the muted member sees a calm notice and can't post
            cp = b.new_page(viewport={"width": 1280, "height": 860}); cp.on("pageerror", lambda e: errors.append("cy: " + str(e)))
            cp.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Cy', server: {{url: '{BASE}', token: '{cy_t}'}}}}))")
            cp.goto(BASE + "/?skipIntro=1"); cp.wait_for_function("TribeClient.connected()", timeout=20000)
            cp.evaluate("TribeApp.show('chat')")
            cp.wait_for_selector("#mute-note", timeout=10000)
            assert "muted" in cp.text_content("#mute-note").lower()
            ok(api(f"/perms/mute/{cy}", "DELETE", token=mx_t))
            cp.wait_for_selector("#mute-note", state="detached", timeout=8000)

            # phones (390px): profile sheet with role badge and mod tools; matrix fits without sideways scroll
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page()
            ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Max', server: {{url: '{BASE}', token: '{mx_t}'}}}}))")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("TribeClient.connected() && window.TribeMobile && TribeRoles.state().me", timeout=20000)
            ph.evaluate(f"TribeMobile.profile('{bo}')")
            ph.wait_for_selector("#m2-profile .mod-acts [data-mod='mute']", timeout=8000)
            assert ph.locator("#m2-profile [data-mod='remove']").count() == 1, "Remove from project on the phone"
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll (profile)"
            sh = ph.evaluate("(() => { const s = document.querySelector('#m2-profile .mod-acts'); const r = s.getBoundingClientRect(); return [r.left, r.right]; })()")
            assert sh[0] >= 0 and sh[1] <= 391, sh
            if "--shots" in sys.argv: ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "roles-phone.png"))
            ph.evaluate(f"TribeMobile.profile('{host_id}')")
            ph.wait_for_selector("#m2-profile .role-pill.rp-host", timeout=8000)
            assert ph.locator("#m2-profile .mod-acts").count() == 0, "no mod tools on the host's profile"
            ph.evaluate("TribeMobile.closeSheet()")
            # the host's matrix on a phone
            hp = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True).new_page()
            hp.on("pageerror", lambda e: errors.append("host phone: " + str(e)))
            hp.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', server: {{url: '{BASE}', token: '{host}'}}}}))")
            hp.goto(BASE + "/?skipIntro=1"); hp.wait_for_function("TribeClient.connected() && window.TribeRoles", timeout=20000)
            hp.evaluate("TribeRoles.open()"); hp.wait_for_selector("#roles-modal:not(.hidden) .rl-matrix", timeout=10000)
            w = hp.evaluate("[document.documentElement.scrollWidth, innerWidth, document.querySelector('.rl-scroll').scrollWidth, document.querySelector('.rl-scroll').clientWidth]")
            assert w[0] <= w[1] + 1 and w[2] <= w[3] + 1, f"matrix fits 390px: {w}"
            if "--shots" in sys.argv: hp.screenshot(path=str(ROOT / "docs" / "screenshots" / "roles-matrix-phone.png"))
            b.close()
        assert not errors, errors
        print("e2e_roles: OK")
    finally:
        s = globals().get("_srv") or srv
        try: s.send_signal(signal.SIGTERM); s.wait(10)
        except Exception: pass
        try: srv.send_signal(signal.SIGTERM)
        except Exception: pass


if __name__ == "__main__":
    main()
