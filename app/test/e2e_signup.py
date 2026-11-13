"""End-to-end: the sign-up experience (app/ui/signup.js, app/ui/accounts.js, server/accounts.js; docs/ACCOUNTS.md › Sign up).

One sheet with three ways in (guest, Create an account, the providers the host turned on; Apple hidden until configured).
A guest starts a project on this device, gets one calm "Save your work" nudge (after the first project, in the invite
sheet, before logging out), and upgrades: username availability with suggestions, weak/strong passwords, an invalid
email, Create stays disabled until the form is valid, then Make it yours (skipped), then Home with the next step, and the
project is still there. A member of the tribe who makes an account keeps their membership (linked). Recent accounts sign
back in from Log in. Forgot password: the host makes a one-time code in Settings › Account › Password resets. Phone at
390px: a bottom sheet with the right autocomplete and keyboard types. Rate limits answer in plain words.
Usage: python app/test/e2e_signup.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5660 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []
SIGNED_OUT = "if (!localStorage.getItem('tribecode.accounts.v1')) localStorage.setItem('tribecode.accounts.v1', JSON.stringify({ mode: 'signedout', accounts: [] }));"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def shot(page, name):
    if take:
        page.wait_for_timeout(450)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))


def hint(page, sel):
    return page.evaluate(f"(() => {{ const h = document.querySelector('{sel}'); return [h.textContent, h.dataset.kind || ''] }})()")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-signup-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_ACCOUNTS": "1",
           "TRIBE_OAUTH_GITHUB_ID": "gh-test", "TRIBE_OAUTH_GITHUB_SECRET": "s", "TRIBE_OAUTH_DISCORD_ID": "dc-test", "TRIBE_OAUTH_DISCORD_SECRET": "s"}
    for k in ("TRIBE_OAUTH_APPLE_ID", "TRIBE_OAUTH_APPLE_SECRET"): env.pop(k, None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=open(os.path.join(tmp, "server.log"), "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(100):
        try:
            if api("/health")[0] == 200: break
        except Exception: time.sleep(0.1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- the host (their account is mapped as "Orion Host": that username is taken)
            hx = b.new_context(viewport={"width": 1440, "height": 900})
            hx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion Host', onboarded: true, tour: {done: true}}))")
            host = hx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("TribeClient.connected() && TribeClient.state().me && TribeClient.state().me.role === 'host'", timeout=20000)
            host_token = host.evaluate("TribeStore.get().server.token")

            # ---- 1. one sheet, three ways in
            gx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            gx.add_init_script(SIGNED_OUT)
            g = gx.new_page(); watch(g, "guest")
            g.goto(BASE + "/?skipIntro=1&freshopen=1&signup=1"); g.wait_for_selector("#sg #sg-guest", state="visible", timeout=15000)
            g.wait_for_selector("#sg #sg-oa [data-oa='github']", state="visible")
            order = g.evaluate("[...document.querySelectorAll('#sg .sg-path, #sg #sg-oa [data-oa]')].map(x => x.id || x.dataset.oa)")
            assert order[:2] == ["sg-guest", "sg-create"] and set(order[2:]) == {"github", "discord"}, order
            assert g.locator("#sg [data-oa='apple']").count() == 0, "Apple stays hidden until it is configured"
            g.wait_for_function("document.activeElement.id === 'sg-guest'")   # focus starts on the first way in
            assert g.evaluate("!!document.querySelector('#sg [role=dialog][aria-labelledby=sg-title]')")
            shot(g, "signup-sheet")
            g.keyboard.press("Escape"); g.wait_for_selector("#sg", state="detached")
            # guest: instant, local
            g.evaluate("TribeSignup.open()"); g.click("#sg-guest"); g.wait_for_function("TribeAccounts.mode() === 'guest'")
            assert g.locator("#sg").count() == 0

            # ---- 2. a guest starts a project: Save your work (calm, never blocking)
            g.evaluate("TribeLocalSetup.start()"); g.fill("#tn-name", "Moon Garden"); g.click("#tn-next")   # the one create-a-tribe flow (tribenew.js)
            g.click("#tn [data-tn-where='device']"); g.click("#tn-go"); g.wait_for_selector("#tn[data-step='3']", timeout=15000); g.click("#tn-skip")
            g.wait_for_selector("#tn", state="detached", timeout=8000)
            g.wait_for_selector("#sg-nudge", state="visible", timeout=15000)
            assert "Create an account" in g.inner_text("#sg-nudge")
            g.click("#sg-nudge [data-sgu='later']"); g.wait_for_selector("#sg-nudge", state="detached")
            # before inviting a friend: one quiet line in the invite sheet
            g.evaluate("TribeApp.openInvite()"); g.wait_for_selector("#invite-modal #sg-inv", state="visible", timeout=10000)
            g.evaluate("document.getElementById('invite-modal').classList.add('hidden')")
            # before leaving the device: Log out offers it too
            g.evaluate("TribeAccounts.confirmLogout()"); g.wait_for_selector("#ac-logout #ac-save", state="visible")
            g.keyboard.press("Escape"); g.wait_for_selector("#ac-logout", state="detached")
            # from the menu
            g.click("#pf-btn"); g.wait_for_selector("#pf-menu [data-act='acc-signup']", state="visible"); g.click("#pf-menu [data-act='acc-signup']")
            g.wait_for_selector("#sg #sg-form", state="visible")
            assert "Save your work" in g.text_content("#sg .eyebrow")
            g.wait_for_function("document.activeElement.id === 'sg-user'")

            # ---- 3. create an account: availability, suggestions, password strength, email
            sub = lambda: g.evaluate("document.getElementById('sg-submit').disabled")
            g.fill("#sg-user", "orion host"); g.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Taken')", timeout=8000)
            assert g.locator("#sg-sugs .sg-sug").count() >= 1 and sub()
            assert g.get_attribute("#sg-user", "aria-invalid") == "true"
            g.fill("#sg-user", "x"); assert "At least 2" in hint(g, "#sg-user-hint")[0]
            g.fill("#sg-user", "orion host"); g.wait_for_selector("#sg-sugs .sg-sug", state="visible", timeout=8000)
            pick = g.inner_text("#sg-sugs .sg-sug >> nth=0"); g.click("#sg-sugs .sg-sug >> nth=0")
            g.wait_for_function("document.getElementById('sg-user-hint').dataset.kind === 'good'", timeout=8000)
            g.fill("#sg-user", "Moon  Gardener "); g.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Available')", timeout=8000)
            assert g.input_value("#sg-name") == "Moon Gardener", "the display name follows the username until you edit it"
            assert pick and sub(), "no password yet"
            g.fill("#sg-pass", "short"); assert hint(g, "#sg-pass-hint")[0].startswith("Too short") and sub()
            g.fill("#sg-pass", "password123"); assert hint(g, "#sg-pass-hint")[0].startswith("Too easy") and sub()
            g.fill("#sg-pass", "moongardener1"); assert "username" in hint(g, "#sg-pass-hint")[0] and sub()
            g.fill("#sg-pass", "abcdefgh"); assert hint(g, "#sg-pass-hint")[1] == "bad" and sub()
            g.fill("#sg-pass", "night garden 42"); assert hint(g, "#sg-pass-hint")[1] == "good", hint(g, "#sg-pass-hint")
            assert g.get_attribute("#sg-meter", "data-score") == "4" and not sub()
            g.fill("#sg-email", "not-an-email"); g.press("#sg-email", "Tab"); assert sub() and hint(g, "#sg-email-hint")[1] == "bad"
            g.fill("#sg-email", "moon@example.com"); g.press("#sg-email", "Tab"); assert not sub()
            shot(g, "signup-create")
            g.click("#sg-submit")
            # then Make it yours (skippable), then Home with the next step
            g.wait_for_selector("#pz #pz-skip", state="visible", timeout=10000)
            assert g.inner_text("#pz-skip").strip() == "Skip"
            g.click("#pz-skip"); g.wait_for_selector("#pz", state="detached")
            g.wait_for_selector("#view-hub #sg-next", state="visible", timeout=10000)
            nxt = g.inner_text("#sg-next"); assert "Signed in as Moon Gardener" in nxt and "verify later" in nxt and "Next:" in nxt, nxt
            assert g.evaluate("document.body.dataset.view") == "hub"
            assert g.evaluate("TribeAccounts.mode()") in ("account", "signedin") and g.evaluate("TribeAccounts.signedAs()") == "Moon Gardener"
            g.wait_for_function("document.getElementById('ub-st').title.includes('Signed in as Moon Gardener')")
            assert "Moon Gardener" in g.inner_text("#ub-st")
            # the upgrade kept everything on this device
            assert g.evaluate("TribeOffline.state().projects.some(p => p.name === 'Moon Garden')"), "the project is still here"
            st, r = api("/accounts/login", "POST", {"username": "moon gardener", "password": "night garden 42"}); assert st == 200, r
            assert r["account"]["email"] == {"address": "moon@example.com", "verified": False}, r
            g.click("#pf-btn"); g.wait_for_selector("#pf-menu #ac-as", state="visible"); assert "Moon Gardener" in g.inner_text("#ac-as")
            assert g.locator("#pf-menu [data-act='acc-signup']").count() == 0, "no more nudges once you have an account"
            g.keyboard.press("Escape")

            # ---- 4. sign in from recent
            g.evaluate("TribeAccounts.logout()"); g.wait_for_load_state("load")
            g.wait_for_function("window.TribeAccounts && TribeAccounts.mode() === 'signedout'", timeout=15000)
            g.wait_for_selector("#ac-login .ac-row[data-acc^='acct:']", state="visible", timeout=10000)
            assert "Recent on this device" in g.text_content("#ac-login")
            g.click("#ac-login .ac-row[data-acc^='acct:']")
            g.wait_for_function("document.getElementById('ac-user') && document.getElementById('ac-user').value === 'Moon Gardener' && document.activeElement.id === 'ac-pass'", timeout=10000)
            assert g.get_attribute("#ac-pass", "autocomplete") == "current-password"

            # ---- 5. forgot password: the host completes it
            g.click("#ac-forgot"); g.wait_for_selector("#sg #sg-fp", state="visible")
            assert g.input_value("#sg-fp-user") == "Moon Gardener"
            g.click("#sg-fp-go"); g.wait_for_selector("#sg #sg-code", state="visible")
            assert "Settings" in g.inner_text("#sg .ac-lead") and g.get_attribute("#sg-code", "autocomplete") == "one-time-code"
            assert api("/accounts/reset/request", "POST", {"username": "nobody here"}) == (200, {"ok": True, "via": "host"}), "no enumeration"
            assert api("/accounts/resets")[0] == 403, "only the host sees requests"
            host.evaluate("TribeSettings.open('admin')"); host.wait_for_selector("#set-resets [data-rs-make]", state="visible", timeout=10000)
            assert "Moon Gardener" in host.inner_text("#set-resets")
            host.click("#set-resets [data-rs-make]"); host.wait_for_selector("#ac-rs-code"); code = host.inner_text("#ac-rs-code").strip()
            assert len(code) == 9 and code[4] == "-", code
            host.evaluate("TribeSettings.close()")
            g.fill("#sg-code", "AAAA-BBBB"); g.fill("#sg-newpass", "silver river 9"); g.click("#sg-fp-go")
            g.wait_for_selector("#sg-fp-err:not([hidden])"); assert "ask your host" in g.inner_text("#sg-fp-err").lower()
            g.fill("#sg-code", code.lower()); g.click("#sg-fp-go")
            g.wait_for_selector("#sg", state="detached", timeout=10000)
            g.wait_for_function("TribeAccounts.signedAs() === 'Moon Gardener'", timeout=10000)
            assert api("/accounts/login", "POST", {"username": "moon gardener", "password": "night garden 42"})[0] == 401
            assert api("/accounts/login", "POST", {"username": "moon gardener", "password": "silver river 9"})[0] == 200
            assert api("/accounts/reset/complete", "POST", {"username": "moon gardener", "code": code, "password": "another one 77"})[0] == 400, "a code works once"

            # ---- 6. a member of the tribe makes an account: membership is linked, the key keeps working
            inv = api("/invites", "POST", {}, token=host_token)[1]["invite"]
            st, jm = api("/join", "POST", {"code": inv["code"], "name": "Jay"}); assert st == 200, jm
            jx = b.new_context(viewport={"width": 1300, "height": 860})
            jx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Jay', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}}))" % (BASE, jm["token"]))
            j = jx.new_page(); watch(j, "jay")
            j.goto(BASE + "/?skipIntro=1"); j.wait_for_function("TribeClient.connected() && window.TribeSignup", timeout=20000)
            j.evaluate("TribeSignup.open('create', { upgrade: 'menu' })")
            j.fill("#sg-user", "Jay"); j.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Available')", timeout=8000)   # his own mapped account
            j.fill("#sg-pass", "jam session 88"); j.wait_for_function("!document.getElementById('sg-submit').disabled")
            j.click("#sg-submit"); j.wait_for_function("TribeAccounts.signedAs() === 'Jay'", timeout=10000)
            assert j.evaluate("TribeAccounts.mode()") == "signedin"
            acct = j.evaluate("TribeAccounts.current().acct")
            st, me = api("/accounts/me", token=acct); assert st == 200 and jm["member"]["id"] in me["account"]["members"], me
            assert api("/me", token=jm["token"])[0] == 200, "the member key still works"
            # POST /api/accounts/link: an account made first, then joined
            st, la = api("/accounts/signup", "POST", {"username": "Lin", "password": "paper lantern 3"}); assert st == 200, la
            st, lm = api("/join", "POST", {"code": api("/invites", "POST", {}, token=host_token)[1]["invite"]["code"], "name": "Lin"}); assert st == 200
            assert api("/accounts/link", "POST", {"member": "nope"}, token=la["token"])[0] == 400
            st, r = api("/accounts/link", "POST", {"member": lm["token"]}, token=la["token"]); assert st == 200 and lm["member"]["id"] in r["account"]["members"], r
            st, r = api("/accounts/login", "POST", {"username": "lin", "password": "paper lantern 3"}); assert st == 200 and r.get("memberToken"), r

            # ---- fix/review-4: no login on a username alone
            assert api("/accounts/login", "POST", {"username": "Orion Host"})[0] == 401, "a mapped member's passwordless account can't log in"
            st, r = api("/accounts/signup", "POST", {"username": "No Password"}); assert st == 400 and "password" in r["error"], (st, r)
            st, gu = api("/accounts/signup", "POST", {"username": "Couch Guest", "guest": True}); assert st == 200 and gu["deviceKey"].startswith("tcd_"), gu
            assert api("/accounts/login", "POST", {"username": "couch guest"})[0] == 401, "a guest needs its device key"
            assert api("/accounts/login", "POST", {"username": "couch guest", "deviceKey": "tcd_wrong"})[0] == 401
            assert api("/accounts/login", "POST", {"username": "couch guest", "deviceKey": gu["deviceKey"]})[0] == 200, "the device that made it gets back in"
            acc = json.loads(Path(tmp, ".tribe", "accounts.json").read_text())["accounts"]
            assert not any(gu["deviceKey"] in json.dumps(a) for a in acc), "only the device key's hash is stored"

            # ---- 7. phone at 390px: a bottom sheet with the right keyboards and autofill
            px = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            px.add_init_script(SIGNED_OUT)
            ph = px.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1&freshopen=1&signup=create"); ph.wait_for_selector("#sg #sg-user", state="visible", timeout=15000)
            attrs = ph.evaluate("""() => Object.fromEntries(['sg-user', 'sg-name', 'sg-pass', 'sg-email'].map(id => { const e = document.getElementById(id);
              return [id, [e.type, e.getAttribute('autocomplete'), e.getAttribute('inputmode') || '', e.name, e.getAttribute('autocapitalize') || '', !!document.querySelector(`label[for=${id}]`)]]; }))""")
            assert attrs["sg-user"][:2] == ["text", "username"] and attrs["sg-user"][4] == "none" and attrs["sg-user"][5], attrs
            assert attrs["sg-pass"][:2] == ["password", "new-password"] and attrs["sg-pass"][3] == "new-password", attrs
            assert attrs["sg-email"][:3] == ["email", "email", "email"], attrs
            assert all(a[5] for a in attrs.values()), "every field has a label"
            assert ph.get_attribute("#sg-pass", "passwordrules"), "iOS strong-password suggestions follow the rule"
            assert ph.evaluate("document.querySelector('#sg-user').closest('form') === document.querySelector('#sg-pass').closest('form')"), "username and password in one form (iOS autofill)"
            box = ph.evaluate("(() => { const r = document.querySelector('#sg .ac-sheet').getBoundingClientRect(); return [r.left, r.right, r.bottom, innerWidth, innerHeight]; })()")
            assert box[0] <= 0.5 and abs(box[1] - box[3]) <= 1 and abs(box[2] - box[4]) <= 1, box
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert ph.evaluate("parseFloat(getComputedStyle(document.getElementById('sg-user')).fontSize)") >= 16, "no zoom on focus"
            ph.fill("#sg-user", "Pocket Pal"); ph.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Available')", timeout=8000)
            shot(ph, "signup-phone")
            ph.keyboard.press("Escape"); ph.wait_for_selector("#sg", state="detached")

            # ---- 8. rate limits answer in plain words
            last = None
            for _ in range(62): last = api("/accounts/check?username=someone")
            assert last[0] == 429 and "wait a minute" in last[1]["error"], last
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("ok e2e_signup")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
