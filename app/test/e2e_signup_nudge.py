"""End-to-end: "Ready to make your own?" after the tour (app/ui/signupnudge.js, demowatch.js, signin.html; docs/SIGNUP-FLOWS.md).

A real server with accounts on (TRIBE_ACCOUNTS=1) and GitHub + Discord sign-in configured. Checks: after the tour as a
guest (Skip to end), the pop-up appears only after the delay, with Create an account, the two configured providers (no
Google, no Apple), Continue as guest, Not now and Log in; it is a keyboard-reachable dialog, Esc and X close it, once per
session; Not now snoozes it for 7 days; never for a signed-in member; never in an automated browser without the flag;
with accounts off and no providers there is no sign-up, Host your own and Join a friend instead (Join opens the invite
field); a provider picked inside the demo leaves the demo first, then the mocked OAuth lands: success signs in to the real
tribe, cancel and an unknown account land on signin.html with next steps (no dead end), and signing in with the other
provider then offers to link the first; a guest who made a project on this device upgrades from the pop-up and keeps it;
a bottom sheet at 390px. No page errors.
Usage: python app/test/e2e_signup_nudge.py [--shots]   (--shots saves docs/screenshots/signup-nudge.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5985 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
GUEST = "if (!localStorage.getItem('tribecode.accounts.v1')) localStorage.setItem('tribecode.accounts.v1', JSON.stringify({ mode: 'guest', accounts: [] }));"
FORCE = "localStorage.setItem('tribecode.test.nudge', '1'); if (localStorage.getItem('tribecode.test.nudgeDelay') == null) localStorage.setItem('tribecode.test.nudgeDelay', '1500');"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def watch(page, who): page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))


def tour_end(pg):
    pg.goto(BASE + "/?demo=watch&speed=4")
    pg.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
    pg.evaluate("TribeDemoWatch.skipToEnd()")
    pg.wait_for_selector("#dw-end .dw-end-card", state="visible", timeout=15000)


def guest_ctx(b, vp=None, delay=None):
    cx = b.new_context(viewport=vp or {"width": 1440, "height": 900})
    cx.add_init_script(GUEST); cx.add_init_script(FORCE)
    if delay is not None: cx.add_init_script(f"localStorage.setItem('tribecode.test.nudgeDelay', '{delay}')")
    return cx


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-nudge-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_ACCOUNTS": "1",
           "TRIBE_OAUTH_GITHUB_ID": "gh-test", "TRIBE_OAUTH_GITHUB_SECRET": "s", "TRIBE_OAUTH_DISCORD_ID": "dc-test", "TRIBE_OAUTH_DISCORD_SECRET": "s"}
    for k in ("TRIBE_OAUTH_APPLE_ID", "TRIBE_OAUTH_APPLE_SECRET", "TRIBE_OAUTH_GOOGLE_ID", "TRIBE_OAUTH_GOOGLE_SECRET"): env.pop(k, None)
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=open(os.path.join(tmp, "server.log"), "w"), stderr=subprocess.STDOUT, env=env)
    for _ in range(100):
        try:
            if api("/health")[0] == 200: break
        except Exception: time.sleep(0.1)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---- the host: a signed-in member never sees it
            hx = b.new_context(viewport={"width": 1280, "height": 800}); hx.add_init_script(FORCE)
            hx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion Host', onboarded: true, tour: {done: true}}))")
            host = hx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("TribeClient.connected() && TribeClient.state().me && TribeClient.state().me.role === 'host'", timeout=20000)
            host_token = host.evaluate("TribeStore.get().server.token")
            host.wait_for_load_state("load"); host.wait_for_function("window.TribeSignupNudge && TribeClient.connected()", timeout=20000)
            assert host.evaluate("TribeSignupNudge.arm('end')") is False and host.evaluate("TribeSignupNudge.state().reason") == "signed-in"
            tour_end(host); host.wait_for_timeout(2500)
            assert host.locator("#sn").count() == 0, "not for signed-in users"
            st, jm = api("/join", "POST", {"code": api("/invites", "POST", {}, token=host_token)[1]["invite"]["code"], "name": "Nova"}); assert st == 200, jm
            nova = jm["token"]

            # ---- an automated browser without the flag: never
            nx = b.new_context(); nx.add_init_script(GUEST); n = nx.new_page(); watch(n, "noflag")
            tour_end(n); n.wait_for_timeout(2500)
            assert n.locator("#sn").count() == 0 and n.evaluate("TribeSignupNudge.state().reason") == "test"
            nx.close()

            # ---- after the tour as a guest: the delay, then the configured ways in
            gx = guest_ctx(b, delay=2500); g = gx.new_page(); watch(g, "guest")
            tour_end(g)
            g.wait_for_timeout(1200); assert g.locator("#sn").count() == 0, "a short beat first"
            g.wait_for_selector("#sn", state="visible", timeout=6000)
            s = g.evaluate("TribeSignupNudge.state()")
            assert s["kind"] == "signup" and set(s["providers"]) == {"github", "discord"} and s["accounts"], s
            assert "Ready to make your own?" in g.inner_text("#sn-title")
            ways = g.evaluate("[...document.querySelectorAll('#sn .sn-ways > *')].map(x => x.id || x.dataset.p)")
            assert ways[0] == "sn-create" and set(ways[1:]) == {"github", "discord"}, ways
            for sel in ("#sn-guest", "#sn-later", "#sn-login", "#sn .sn-x"): assert g.locator(sel).count() == 1, sel
            assert g.get_attribute("#sn", "role") == "dialog" and g.get_attribute("#sn", "aria-labelledby") == "sn-title"
            g.wait_for_function("document.activeElement && document.activeElement.id === 'sn'")
            if take: g.wait_for_timeout(400); g.screenshot(path=str(SHOTS / "signup-nudge.png"))
            g.keyboard.press("Tab"); assert g.evaluate("!!document.activeElement.closest('#sn')"), "keyboard reaches it"
            g.keyboard.press("Escape"); g.wait_for_selector("#sn", state="detached")
            assert g.locator("#dw-end").count() == 1, "Esc closes only the pop-up"
            assert g.evaluate("TribeSignupNudge.arm('end')") is False and g.evaluate("TribeSignupNudge.state().reason") == "shown", "once per session"
            assert not g.evaluate("localStorage.getItem('tribecode.signupNudge.snooze')"), "Esc is not a snooze"

            # ---- Not now: 7 days
            g2 = gx.new_page(); watch(g2, "guest2")   # a new tab: a new session
            tour_end(g2); g2.wait_for_selector("#sn", state="visible", timeout=8000)
            g2.click("#sn-later"); g2.wait_for_selector("#sn", state="detached")
            until = g2.evaluate("Number(localStorage.getItem('tribecode.signupNudge.snooze'))")
            assert 6.9 * 864e5 < until - time.time() * 1000 < 7.1 * 864e5, until
            g3 = gx.new_page(); watch(g3, "guest3")
            tour_end(g3); g3.wait_for_timeout(4000)
            assert g3.locator("#sn").count() == 0 and g3.evaluate("TribeSignupNudge.state().reason") == "snoozed"
            g3.evaluate("localStorage.removeItem('tribecode.signupNudge.snooze')")
            for x in (g2, g3): x.close()

            # ---- Exit before the delay: it shows in the real app afterwards (and never inside the playing tour)
            g4 = gx.new_page(); watch(g4, "guest4")
            g4.goto(BASE + "/?demo=watch&speed=4"); g4.wait_for_function("window.TribeDemoWatch && TribeDemoWatch._test.state().running", timeout=20000)
            g4.wait_for_timeout(3500); assert g4.locator("#sn").count() == 0, "never while the tour plays"
            g4.evaluate("TribeDemoWatch.skipToEnd()"); g4.wait_for_selector("#dw-end", state="visible", timeout=15000)
            g4.click("#dw-exit"); g4.wait_for_load_state("load")
            g4.wait_for_selector("#sn", state="visible", timeout=10000)
            assert not g4.evaluate("TribeOffline.active()"), "in the real app"
            g4.click("#sn .sn-x"); g4.wait_for_selector("#sn", state="detached")
            g4.close()

            # ---- mocked OAuth: picked inside the demo, it leaves the demo first, then lands
            RC = {"n": 0}
            def start_to(url):
                return lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"url": url}))
            g5 = gx.new_page(); watch(g5, "oauth")
            g5.route("**/api/oauth/github/start", start_to(BASE + "/signin.html#oauth=rc-ok"))
            g5.route("**/api/oauth/finish", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(
                {"mode": "signin", "provider": "github", "providerName": "GitHub", "member": {"id": jm["member"]["id"], "name": "Nova", "color": "#6C7CFF"}, "token": nova, "existing": True})))
            tour_end(g5); g5.wait_for_selector("#sn [data-p='github']", state="visible", timeout=8000)
            g5.click("#sn [data-p='github']")
            g5.wait_for_url("**/signin.html*", timeout=15000)
            g5.wait_for_url(lambda u: "/signin.html" not in u, timeout=15000)
            g5.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.state().me && TribeClient.state().me.name === 'Nova'", timeout=20000)
            assert not g5.evaluate("TribeOffline.active()"), "success lands in your own tribe, not the demo"
            g5.close()

            # cancelled at the provider
            cx2 = guest_ctx(b, delay=500); g6 = cx2.new_page(); watch(g6, "cancel")
            g6.route("**/api/oauth/github/start", start_to(BASE + "/signin.html#oauth_error=denied"))
            g6.goto(BASE + "/?skipIntro=1"); g6.wait_for_function("window.TribeSignupNudge", timeout=15000)
            g6.evaluate("TribeSignupNudge.show({ force: true })"); g6.wait_for_selector("#sn [data-p='github']", state="visible")
            g6.click("#sn [data-p='github']"); g6.wait_for_url("**/signin.html*", timeout=15000)
            g6.wait_for_function("/cancelled/i.test(document.getElementById('err').textContent)", timeout=10000)
            nxt = g6.inner_text("#next"); assert "nothing was shared" in nxt and "Create an account" in nxt and "Continue as guest" in nxt, nxt
            assert g6.locator("#oa-box [data-oa='github']").count() == 1, "try again right there"
            assert g6.get_attribute("#next a.pri", "href") == "/?signup=create"
            # an account no one here has linked: next steps, then the other provider offers to link it
            g6.route("**/api/oauth/finish", lambda route: route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": "no one in this tribe has linked that GitHub account yet: ask for an invite, or link it in Settings first", "code": "unknown"})))
            g6.unroute("**/api/oauth/github/start"); g6.route("**/api/oauth/github/start", start_to(BASE + "/signin.html?t=1#oauth=rc-unknown"))
            g6.click("#oa-box [data-oa='github']")
            g6.wait_for_function("/No one in this tribe/i.test(document.getElementById('err').textContent)", timeout=10000)
            nxt = g6.inner_text("#next"); assert "New here?" in nxt and "invite link" in nxt and "link GitHub too" in nxt, nxt
            g6.unroute("**/api/oauth/finish")
            g6.route("**/api/oauth/finish", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(
                {"mode": "signin", "provider": "discord", "providerName": "Discord", "member": {"id": jm["member"]["id"], "name": "Nova", "color": "#6C7CFF"}, "token": nova, "existing": True})))
            g6.route("**/api/oauth/discord/start", start_to(BASE + "/signin.html?t=2#oauth=rc-dc"))
            g6.click("#oa-box [data-oa='discord']")
            g6.wait_for_selector("#link-too", state="visible", timeout=10000)
            assert "Link GitHub" in g6.inner_text("#link-too")
            g6.click("#skip-link"); g6.wait_for_url(lambda u: "/signin.html" not in u, timeout=15000)
            g6.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.state().me && TribeClient.state().me.name === 'Nova'", timeout=20000)
            cx2.close()

            # ---- accounts off, no providers: no sign-up, the alternative
            cx3 = guest_ctx(b, delay=800); g7 = cx3.new_page(); watch(g7, "off")
            g7.route("**/api/accounts/me", lambda route: route.fulfill(status=404, content_type="application/json", body='{"error":"not found"}'))
            g7.route("**/api/oauth/providers", lambda route: route.fulfill(status=200, content_type="application/json", body='{"providers":[]}'))
            tour_end(g7); g7.wait_for_selector("#sn", state="visible", timeout=8000)
            assert g7.evaluate("TribeSignupNudge.state().kind") == "alt"
            assert g7.locator("#sn-create, #sn .sn-p, #sn-guest").count() == 0, "no sign-up when the host has it off"
            assert g7.locator("#sn-host").count() == 1 and g7.locator("#sn-join").count() == 1
            g7.click("#sn-join"); g7.wait_for_load_state("load")
            g7.wait_for_selector("#invite-modal:not(.hidden) #join-link", state="visible", timeout=15000)
            assert not g7.evaluate("TribeOffline.active()"), "Join a friend runs in the real app"
            cx3.close()

            # ---- a guest's project on this device survives the upgrade from the pop-up
            cx4 = guest_ctx(b); g8 = cx4.new_page(); watch(g8, "upgrade")
            g8.goto(BASE + "/?skipIntro=1&freshopen=1"); g8.wait_for_function("window.TribeLocalSetup && window.TribeSignupNudge", timeout=15000)
            g8.evaluate("TribeLocalSetup.start()"); g8.fill("#tn-name", "Moon Garden"); g8.click("#tn-options")   # the one create-a-tribe flow (tribenew.js)
            g8.click("#tn [data-tn-where='device']"); g8.click("#tn-go"); g8.wait_for_selector("#tn[data-step='3']", timeout=15000); g8.click("#tn-skip")
            g8.wait_for_timeout(600); g8.evaluate("document.getElementById('sg-nudge') && document.getElementById('sg-nudge').remove()")
            assert g8.evaluate("TribeSignupNudge.show({ force: true })")
            g8.wait_for_selector("#sn-create", state="visible"); g8.click("#sn-create")
            g8.wait_for_selector("#sg #sg-form", state="visible")
            assert "Save your work" in g8.text_content("#sg .eyebrow"), (g8.text_content("#sg .eyebrow"), g8.evaluate("JSON.parse(localStorage.getItem('tribecode.accounts.v1'))"))
            g8.fill("#sg-user", "Moon Nudger"); g8.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Available')", timeout=8000)
            g8.fill("#sg-pass", "night garden 42"); g8.click("#sg-submit")
            g8.wait_for_selector("#pz #pz-skip", state="visible", timeout=10000); g8.click("#pz-skip")
            g8.wait_for_function("TribeAccounts.signedAs() === 'Moon Nudger'", timeout=10000)
            assert g8.evaluate("TribeOffline.state().projects.some(p => p.name === 'Moon Garden')"), "the project is still here"
            assert g8.evaluate("TribeSignupNudge.blocked()") == "signed-in", "and no more nudges"
            cx4.close()

            # ---- 390px: a bottom sheet
            cx5 = guest_ctx(b, vp={"width": 390, "height": 844}, delay=500); g9 = cx5.new_page(); watch(g9, "phone")
            g9.goto(BASE + "/?skipIntro=1"); g9.wait_for_function("window.TribeSignupNudge", timeout=15000)
            g9.evaluate("TribeSignupNudge.show({ force: true })"); g9.wait_for_selector("#sn", state="visible"); g9.wait_for_timeout(500)   # after its entrance
            r = g9.evaluate("(() => { const r = document.getElementById('sn').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, h: innerHeight, w: document.documentElement.scrollWidth } })()")
            assert r["l"] == 0 and abs(r["r"] - 390) < 1 and abs(r["b"] - r["h"]) < 1 and r["w"] <= 390, r
            g9.click("#sn .sn-x"); g9.wait_for_selector("#sn", state="detached")
            cx5.close()
            b.close()
    finally:
        srv.terminate()
    assert not errors, errors
    print("PASS e2e_signup_nudge")


if __name__ == "__main__":
    main()
