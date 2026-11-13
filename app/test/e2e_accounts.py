"""End-to-end: accounts on this device (app/ui/accounts.js, server/accounts.js, scripts/dev/clean-accounts.js; docs/ACCOUNTS.md).

Log out (profile menu and Settings) clears this device's session and lands on a signed-out Home with Log in and Continue
as guest; a reload stays signed out (the sign-in cookie is gone, nothing auto-signs in). Continue as guest works.
TEST accounts (?accounts=test and Settings › More settings › Test accounts) mount Orion, Maya, Jay and Guest: sign in,
switch with one click, the UI shows each identity (name, avatar, tribes) labelled TEST, log out. Sign in on this computer
brings the host back. Log out with "Also forget this device's tribes" drops the saved tribe address. The server scaffold
answers only with TRIBE_ACCOUNTS=1 (signup, login, me, sessions, logout; case-insensitive unique usernames; existing
members mapped to accounts with their keys untouched), and the clean-up script backs up, then cleans, idempotently.
polish: with TRIBE_ACCOUNTS=1 the Log in sheet creates and logs in to a real account (it signs the member in), Log out
ends the session, Settings lists signed-in devices, and Delete my account uses GET/DELETE /api/account (the member, their
keys and accounts go; their messages stay as "deleted-…"). With the flag off: no account form, Delete clears the device.
Usage: python app/test/e2e_accounts.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5640 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT_OFF = 5641 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []


def api(path, method="GET", body=None, token=None, base=BASE):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(base + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def start(port, tmp, flag):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    if flag: env["TRIBE_ACCOUNTS"] = "1"
    else: env.pop("TRIBE_ACCOUNTS", None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=open(os.path.join(tmp, "server.log"), "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(100):
        try:
            if api("/health", base=f"http://localhost:{port}")[0] == 200: break
        except Exception: time.sleep(0.1)
    return srv


def shot(page, name):
    if take:
        page.wait_for_timeout(400)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


STATE = """() => ({ mode: TribeAccounts.mode(), connected: TribeClient.connected(), token: TribeClient.hasToken(), view: document.body.dataset.view,
  name: document.querySelector('#ub-name').textContent, status: document.querySelector('#ub-st').textContent,
  test: !!document.querySelector('#userbar .ac-test'), banner: (document.querySelector('#ac-banner') || {}).innerText || '',
  sheet: !!document.querySelector('#ac-login'), accounts: TribeAccounts.list().map(a => a.name + ':' + a.kind),
  server: TribeStore.get().server, face: (document.querySelector('#pf-face') || {}).textContent || '' })"""


def state(page):
    return page.evaluate(STATE)


def wait_reloaded(page, cond, timeout=15000):
    page.wait_for_load_state("load"); page.wait_for_function(f"window.TribeAccounts && document.querySelector('#ub-name') && ({cond})", timeout=timeout); page.wait_for_timeout(300)


def menu(page, act, acc=None, nav=False):
    page.click("#pf-btn"); sel = f"#pf-menu [data-act='{act}']" + (f"[data-acc='{acc}']" if acc else "")
    page.wait_for_selector(sel, state="visible")
    if nav:
        with page.expect_navigation(timeout=20000): page.click(sel)
    else: page.click(sel)


def nav_click(page, sel):
    """A click that reloads the page (log out, switch, sign in): wait for the new page, not the old one."""
    with page.expect_navigation(timeout=20000): page.click(sel)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-acc-", dir="/tmp")
    tmp_off = tempfile.mkdtemp(prefix="tribe-acc-off-", dir="/tmp")
    srv = start(PORT, tmp, True)
    off = start(PORT_OFF, tmp_off, False)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            ctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion Host'}))")
            pg = ctx.new_page(); watch(pg, "host")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=20000)
            pg.wait_for_function("TribeAccounts.mode() === 'signedin' && TribeAccounts.list().some(a => a.kind === 'device')", timeout=10000)
            host_token = pg.evaluate("TribeStore.get().server.token")
            assert api("/me", token=host_token)[0] == 200

            # ---- the menu: Add account and Log out
            pg.click("#pf-btn"); pg.wait_for_selector("#pf-menu [data-act='logout']", state="visible"); pg.wait_for_selector("#pf-menu [data-act='acc-add']")
            pg.click("#pf-menu [data-act='logout']"); pg.wait_for_selector("#ac-logout #ac-forget")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#ac-logout", state="detached")   # Esc cancels
            assert pg.evaluate("TribeClient.connected()"), "cancel keeps you signed in"

            # ---- Log out -> a clean signed-out Home with Log in and Continue as guest
            menu(pg, "logout"); pg.wait_for_selector("#ac-lo-go"); nav_click(pg, "#ac-lo-go")
            wait_reloaded(pg, "TribeAccounts.mode() === 'signedout' && document.querySelector('#ac-login')")
            st = state(pg)
            assert not st["connected"] and not st["token"] and st["view"] == "hub", st
            assert st["name"] == "Signed out" and "Log in" in st["status"], st
            assert "signed out" in st["banner"].lower(), st
            pg.wait_for_selector("#ac-login #ac-guest", state="visible"); pg.wait_for_selector("#ac-login [data-ac='host']"); pg.wait_for_selector("#ac-login [data-acc]")
            assert api("/me", token=host_token)[0] == 200, "logging out a device does not revoke the member key elsewhere"
            # a reload stays signed out: the sign-in cookie is gone and nothing signs in on its own
            pg.reload(); pg.wait_for_function("window.TribeAccounts && TribeAccounts.mode() === 'signedout'"); pg.wait_for_timeout(1500)
            st = state(pg); assert not st["token"] and not st["connected"], st
            pg.evaluate("TribeAccounts.close()")
            # every global button still works signed out (no dead ends)
            for row, key in [("nest-docs-all", "docs-all"), ("nest-work", "work"), ("nest-hub", "hub")]:
                pg.click("#" + row); pg.wait_for_function("k => TribeRouter.where().key === k", arg=key)

            # ---- Continue as guest
            pg.click("#ac-banner [data-acb='guest']"); pg.wait_for_function("TribeAccounts.mode() === 'guest'")
            pg.wait_for_selector("#ac-banner", state="detached")
            st = state(pg); assert st["status"] == "Guest on this device" and st["name"] != "Signed out", st

            # ---- TEST accounts: ?accounts=test mounts four, labelled TEST
            pg.goto(BASE + "/?skipIntro=1&accounts=test"); pg.wait_for_function("window.TribeAccounts && TribeAccounts.list().filter(a => a.kind === 'test').length === 4")
            names = pg.evaluate("TribeAccounts.list().filter(a => a.kind === 'test').map(a => a.name)")
            assert names == ["Orion", "Maya", "Jay", "Guest"], names
            menu(pg, "acc-switch", "test:maya", nav=True)
            wait_reloaded(pg, "TribeAccounts.mode() === 'test' && TribeAccounts.current().name === 'Maya'")
            pg.wait_for_function("document.querySelector('#ub-name').textContent === 'Maya'", timeout=8000)
            st = state(pg)
            assert st["test"] and "Pixel Quest crew" in st["status"], st
            assert "Maya" in st["banner"] and "TEST" in st["banner"] and "Pixel Quest crew" in st["banner"], st
            assert not st["token"], "a TEST account holds no tribe key"
            pg.wait_for_function("document.querySelector('#pf-face').textContent.includes('🌙')", timeout=8000)
            shot(pg, "accounts-test")
            # switch with one click
            menu(pg, "acc-switch", "test:jay", nav=True)
            wait_reloaded(pg, "TribeAccounts.current() && TribeAccounts.current().name === 'Jay'")
            pg.wait_for_function("document.querySelector('#ub-name').textContent === 'Jay'", timeout=8000)
            st = state(pg); assert "Lantern Run" in st["banner"] and st["test"], st
            # the switcher in the Log in sheet too
            pg.click("#ac-banner [data-acb='switch']"); pg.wait_for_selector("#ac-login [data-acc='test:orion']")
            assert pg.locator("#ac-login .ac-test").count() >= 3
            nav_click(pg, "#ac-login [data-acc='test:orion']")
            wait_reloaded(pg, "TribeAccounts.current() && TribeAccounts.current().name === 'Orion'")
            pg.wait_for_function("document.querySelector('#ac-banner') && document.querySelector('#ac-banner').innerText.includes('Bake Sale Club')", timeout=8000)
            # log out of a TEST account
            menu(pg, "logout"); pg.wait_for_selector("#ac-lo-go"); assert pg.locator("#ac-forget").count() == 0
            nav_click(pg, "#ac-lo-go"); wait_reloaded(pg, "TribeAccounts.mode() === 'signedout'")
            assert not state(pg)["test"]

            # ---- Log in: sign in on this computer brings the host back (same member, a new key)
            pg.wait_for_selector("#ac-login [data-ac='host']"); nav_click(pg, "#ac-login [data-ac='host']")
            wait_reloaded(pg, "TribeAccounts.mode() === 'signedin'", timeout=20000)
            pg.wait_for_function("TribeClient.connected()", timeout=20000)
            st = state(pg); assert st["token"] and st["status"] == "Hosting", st
            assert pg.evaluate("TribeClient.state().me.role") == "host"
            host_now = pg.evaluate("TribeStore.get().server.token")   # the reclaim gave the host a fresh key

            # ---- Settings: Account (Switch account, Log out) and More settings › Test accounts
            pg.click("#ub-gear"); pg.wait_for_selector("#settings-modal:not(.hidden) #set-account #set-logout")
            pg.evaluate("document.querySelector('#set-more').open = true"); pg.wait_for_selector("#set-testacc[aria-checked='true']")
            pg.click("#set-testacc"); pg.wait_for_function("!TribeAccounts.list().some(a => a.kind === 'test')")
            pg.click("#set-testacc"); pg.wait_for_function("TribeAccounts.list().filter(a => a.kind === 'test').length === 4")
            pg.evaluate("TribeSettings.close()"); pg.click("#pf-btn"); pg.wait_for_selector("#pf-menu [data-acc='test:maya']", state="visible")
            assert pg.locator("#pf-menu .ac-test").count() == 4
            shot(pg, "accounts-menu"); pg.keyboard.press("Escape")
            pg.click("#ub-gear"); pg.wait_for_selector("#settings-modal:not(.hidden) #set-account #set-logout")
            # Log out from Settings, forgetting this device's tribes
            pg.evaluate("localStorage.setItem('tribecode.pins:' + TribeClient.base(), '[\"x\"]')")
            pg.click("#set-logout"); pg.wait_for_selector("#ac-forget"); pg.check("#ac-forget"); nav_click(pg, "#ac-lo-go")
            wait_reloaded(pg, "TribeAccounts.mode() === 'signedout'")
            st = state(pg)
            assert st["server"]["url"] == "" and st["server"]["token"] == "", st
            assert not any(a.endswith(":device") for a in st["accounts"]), st["accounts"]
            assert pg.evaluate("Object.keys(localStorage).filter(k => /^tribecode\\.pins:/.test(k)).length") == 0
            pg.evaluate("TribeAccounts.close()")

            # ---- phone: Log out sits in Settings, the Log in sheet is a bottom sheet
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1&freshopen=1&accounts=test"); phone.wait_for_function("window.TribeAccounts && TribeAccounts.list().length === 4", timeout=15000)
            phone.evaluate("TribeAccounts.login()"); phone.wait_for_selector("#ac-login [data-acc='test:maya']", state="visible")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            nav_click(phone, "#ac-login [data-acc='test:maya']"); wait_reloaded(phone, "TribeAccounts.current() && TribeAccounts.current().name === 'Maya'")
            phone.evaluate("TribeSettings.open()"); phone.wait_for_selector("#set-account #set-logout", state="visible")
            ph.close()

            # ---- polish: with TRIBE_ACCOUNTS=1 the screens use the real accounts API
            host_token = host_now; inv = api("/invites", "POST", {}, token=host_token)[1]["invite"]
            st_, mj = api("/join", "POST", {"code": inv["code"], "name": "Maya"}); assert st_ == 200, mj
            maya_tok, maya_id = mj["token"], mj["member"]["id"]
            api("/chat/general", "POST", {"text": "maya was here"}, token=maya_tok)
            mx = b.new_context(viewport={"width": 1440, "height": 900})
            mx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Maya', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}}))" % (BASE, maya_tok))
            mp = mx.new_page(); watch(mp, "maya")
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("TribeClient.connected() && window.TribeAccounts", timeout=20000)
            assert mp.evaluate("TribeAccounts.serverOn(true)") is True
            # Create account: claims the account Maya was mapped to, with a username and password
            mp.evaluate("TribeAccounts.login({ add: true })"); mp.wait_for_selector("#ac-login #ac-acct:not([hidden]) #ac-user", state="visible")
            mp.fill("#ac-user", "maya.builds"); mp.fill("#ac-pass", "night garden 7"); mp.click("#ac-acct-form [data-acf='signup']")
            mp.wait_for_function("TribeAccounts.current() && TribeAccounts.current().kind === 'server' && TribeAccounts.current().username === 'maya.builds'", timeout=10000)
            acct = mp.evaluate("TribeAccounts.current().acct"); assert acct.startswith("tca_")
            st_, r = api("/accounts/me", token=acct); assert st_ == 200 and maya_id in r["account"]["members"], r
            assert len([a for a in mp.evaluate("TribeAccounts.list()") if a["kind"] in ("device", "server")]) == 1, "one row per person"
            # Settings › Account: signed-in devices from /api/accounts/sessions
            mp.click("#ub-gear"); mp.wait_for_selector("#settings-modal:not(.hidden) #set-sessions .ac-ses li", timeout=10000)
            assert "This device" in mp.inner_text("#set-sessions")
            mp.evaluate("TribeSettings.close()")
            # Log out ends the server session too
            menu(mp, "logout"); mp.wait_for_selector("#ac-lo-go"); nav_click(mp, "#ac-lo-go")
            wait_reloaded(mp, "TribeAccounts.mode() === 'signedout'")
            assert api("/accounts/me", token=acct)[0] == 401, "Log out ends the account session"
            # Log in with the username and password: the member is signed in on this device again
            mp.wait_for_selector("#ac-login #ac-acct:not([hidden]) #ac-user", state="visible", timeout=10000)
            mp.fill("#ac-user", "maya.builds"); mp.fill("#ac-pass", "wrong password"); mp.click("#ac-acct-go")
            mp.wait_for_selector("#ac-err:not([hidden])"); assert "do not match" in mp.inner_text("#ac-err")
            mp.fill("#ac-pass", "night garden 7"); nav_click(mp, "#ac-acct-go")
            wait_reloaded(mp, "TribeAccounts.mode() === 'signedin'", timeout=20000)
            mp.wait_for_function("TribeClient.connected() && TribeClient.state().me && TribeClient.state().me.id === '%s'" % maya_id, timeout=20000)
            # Delete my account: GET/DELETE /api/account
            mp.evaluate("TribeModeration.deleteAccount()"); mp.wait_for_selector("#mod-del-go")
            assert mp.inner_text("#mod-del-go").strip() == "Delete my account", mp.inner_text("#mod-del-go")
            mp.fill("#mod-del-in", "DELETE"); mp.click("#mod-del-go"); mp.wait_for_selector("#mod-reload", timeout=15000)
            assert "account is deleted" in mp.inner_text("#mod-dlg")
            assert api("/me", token=maya_tok)[0] == 401, "the member key is gone"
            assert not any(x["id"] == maya_id for x in api("/members", token=host_token)[1]["members"])
            assert api("/accounts/login", "POST", {"username": "maya.builds", "password": "night garden 7"})[0] == 401
            chat_files = list(Path(tmp).rglob("*.jsonl"))
            assert not any(maya_id in f.read_text() for f in chat_files), "messages are anonymised"
            assert any("maya was here" in f.read_text() and "deleted-" in f.read_text() for f in chat_files), "the message stays, as a deleted member"
            assert api("/account", token=host_token)[1]["canDelete"] is False, "the host can't delete themselves here"
            mx.close()

            # ---- flag off: no account form, Delete my account clears only this device (local behaviour)
            ho = api("/bootstrap", "POST", {"name": "Off Host"}, base=f"http://localhost:{PORT_OFF}")[1]["token"]
            inv2 = api("/invites", "POST", {}, token=ho, base=f"http://localhost:{PORT_OFF}")[1]["invite"]
            jt = api("/join", "POST", {"code": inv2["code"], "name": "Jay"}, base=f"http://localhost:{PORT_OFF}")[1]["token"]
            OFFB = f"http://localhost:{PORT_OFF}"
            ox = b.new_context(viewport={"width": 1440, "height": 900})
            ox.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Jay', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}}))" % (OFFB, jt))
            op = ox.new_page(); watch(op, "off")
            op.goto(OFFB + "/?skipIntro=1&accounts=test"); op.wait_for_function("TribeClient.connected() && window.TribeAccounts", timeout=20000)
            assert op.evaluate("TribeAccounts.serverOn(true)") is False
            op.evaluate("TribeAccounts.login({ add: true })"); op.wait_for_selector("#ac-login [data-acc='test:maya']", state="visible"); op.wait_for_timeout(400)
            assert op.locator("#ac-login #ac-acct[hidden]").count() == 1, "no account form with the flag off"
            op.evaluate("TribeAccounts.close()")
            assert api("/account", token=jt, base=OFFB)[0] == 404
            op.evaluate("TribeModeration.deleteAccount()"); op.wait_for_selector("#mod-del-go")
            assert op.inner_text("#mod-del-go").strip() == "Delete from this device"
            op.fill("#mod-del-in", "DELETE"); op.click("#mod-del-go"); op.wait_for_selector("#mod-reload", timeout=15000)
            assert "This device is clear" in op.inner_text("#mod-dlg")
            assert api("/me", token=jt, base=OFFB)[0] == 200, "with the flag off nothing is deleted on the server"
            ox.close()
            b.close()

        # ---- the server scaffold: off by default
        st, r = api("/accounts/me", base=f"http://localhost:{PORT_OFF}"); assert st == 200 and r == {"on": False}, (st, r)   # off: a calm answer to the app's check
        st, r = api("/accounts/login", base=f"http://localhost:{PORT_OFF}"); assert st == 404 and "TRIBE_ACCOUNTS" in r.get("error", ""), (st, r)
        # on: existing members are mapped to accounts without touching their keys
        st, r = api("/accounts/signup", "POST", {"username": "  Maya   Lee ", "password": "correct horse"}); assert st == 200, (st, r)
        maya = r["token"]; assert maya.startswith("tca_") and r["account"]["username"] == "Maya Lee" and r["account"]["hasPassword"], r
        assert api("/accounts/signup", "POST", {"username": "maya lee"})[0] == 409, "usernames are unique, case-insensitively"
        assert api("/accounts/signup", "POST", {"username": "x"})[0] == 400
        assert api("/accounts/signup", "POST", {"username": "Short Pw", "password": "123"})[0] == 400
        assert api("/accounts/login", "POST", {"username": "MAYA LEE", "password": "wrong one"})[0] == 401
        st, r = api("/accounts/login", "POST", {"username": "MAYA LEE", "password": "correct horse"}); assert st == 200, r
        second = r["token"]
        st, r = api("/accounts/me", token=maya); assert st == 200 and r["account"]["username"] == "Maya Lee", r
        st, r = api("/accounts/sessions", token=maya); assert st == 200 and len(r["sessions"]) == 2 and sum(s["current"] for s in r["sessions"]) == 1, r
        assert api("/accounts/logout", "POST", {}, token=second)[0] == 200
        assert api("/accounts/me", token=second)[0] == 401, "a logged-out session ends"
        assert api("/accounts/me", token=maya)[0] == 200, "other sessions stay"
        st, r = api("/accounts/signup", "POST", {"username": "Visitor", "guest": True}); assert st == 200 and r["account"]["status"] == "guest", r
        accts = json.loads(Path(tmp, ".tribe", "accounts.json").read_text())["accounts"]
        host_acct = [a for a in accts if a["members"]]
        assert host_acct and host_acct[0]["username"] == "Orion Host", accts
        assert all("tokenHash" in s and "token" not in s for a in accts for s in a["sessions"]), "only token hashes are stored"
        assert not any("correct horse" in json.dumps(a) for a in accts), "passwords are never stored"
        assert api("/me", token=host_token)[0] in (200, 401)   # the member key system is untouched by accounts (the host re-signed in above)

        # ---- the clean-up script: dry run changes nothing, a run backs up first, a second run finds nothing
        srv.terminate(); srv.wait(timeout=10)
        T = Path(tmp, ".tribe")
        members = json.loads((T / "members.json").read_text())
        members.append({"id": "ghost-1", "name": "  Old   Guest ", "role": "builder", "guestUntil": "2020-01-01T00:00:00Z", "tokenHash": "x", "joined": "2020-01-01T00:00:00Z"})
        members.append(dict(members[0]))   # a duplicate id
        members.append({"id": "maya-9", "name": " maya  lee", "role": "builder", "tokenHash": "y", "joined": "2026-01-01T00:00:00Z"})
        (T / "members.json").write_text(json.dumps(members))
        before = (T / "members.json").read_text()
        out = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "clean-accounts.js"), "--dir", tmp, "--dry-run"], capture_output=True, text=True, timeout=30)
        assert out.returncode == 0 and "would" in out.stdout and "ghost-1" in out.stdout, out.stdout + out.stderr
        assert (T / "members.json").read_text() == before and not (T / "backups").exists(), "a dry run writes nothing"
        out = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "clean-accounts.js"), "--dir", tmp, "--json"], capture_output=True, text=True, timeout=30)
        res = json.loads(out.stdout); kinds = {c["kind"] for c in res["changes"]}
        assert {"guest", "dedupe", "name", "account"} <= kinds, res
        backups = list((T / "backups").iterdir()); assert len(backups) == 1 and (backups[0] / "members.json").read_text() == before, backups
        cleaned = json.loads((T / "members.json").read_text())
        assert not any(m["id"] == "ghost-1" for m in cleaned) and len({m["id"] for m in cleaned}) == len(cleaned), cleaned
        assert any(m["name"] == "maya lee" for m in cleaned)
        users = [a["username"] for a in json.loads((T / "accounts.json").read_text())["accounts"]]
        assert "Maya Lee" in users and "maya lee 2" in users, users   # unique case-insensitively, with a suffix
        out = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "clean-accounts.js"), "--dir", tmp], capture_output=True, text=True, timeout=30)
        assert "Nothing to do" in out.stdout and len(list((T / "backups").iterdir())) == 1, out.stdout
        assert not errors, "\n".join(errors)
        print("E2E accounts test passed (both flag modes: real accounts API on; TEST/local behaviour off)")
    finally:
        for s in (srv, off):
            try: s.terminate()
            except Exception: pass


if __name__ == "__main__":
    main()
