"""Settings with tabs (feat/settings-tabs, docs/SETTINGS-AUDIT.md).
Every tab renders; every setting that existed before is reachable from search (the mapping table below); deep links;
the admin tab is hidden from members; quiet hours silence a notification; sound; export/import settings round-trip;
density; default home page; phone drill-in and Back; Esc; custom shortcuts; accessibility; who can DM me; typing off;
channel mutes; sign out other devices; download my data; settings sync; deletion with a grace period.
Ana hosts, Ben and Cy are builders.
Usage: python3 app/test/e2e_settings_tabs.py [--shots]   (--shots writes docs/screenshots/settings-*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile, io
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5490 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []

# Every setting Settings had before the tabs (feat/settings-tabs), the words that find it, the element that must show, its tab.
MAPPING = [
    ("Account", "#set-account", "account"), ("Switch account", "#set-account", "account"), ("Plan", "#set-plan-chip", "ai"),
    ("Personalize", "#set-personalize", "profile"), ("Profile", "#set-profile", "profile"), ("Show where I am", "#pz-show", "privacy"),
    ("Appear away", "#pz-away", "privacy"), ("Experience", "#set-mode", "workspace"), ("Name", "#set-name", "profile"),
    ("Color", "[data-color]", "profile"), ("Language", "#set-lang", "profile"), ("Theme", "#set-theme-sys", "profile"),
    ("Sidebar order", "#set-reorder", "workspace"), ("Look", "#set-look", "profile"), ("Storage & sync", "#set-storage", "projects"),
    ("Flint", "#set-flintmem", "ai"), ("Flint's brain", "#set-flintbrain", "ai"), ("Friends can ask my AI", "#set-askai", "ai"),
    ("GitHub", "#set-github", "projects"), ("Save a copy", "#set-copy", "storage"), ("TribeCode MCP", "#set-mcp", "ai"),
    ("Chat", "#set-chat", "workspace"), ("Sign-in", "#set-oauth", "account"), ("Fix problems", "#set-refresh", "storage"),
    ("Crash reports", "#set-crash", "privacy"), ("Agents in chat", "#set-pubagents", "ai"), ("Starting modes", "#set-rolemodes", "admin"),
    ("Roles", "#set-roles", "admin"), ("Packs", "#set-packs", "storage"), ("Backup", "#set-backup", "admin"),
    ("Freesound", "#set-fs", "admin"), ("Test accounts", "#set-testacc", "account"), ("Privacy & safety", "#set-safety", "privacy"),
    ("This device", "#set-device-row", "storage"), ("Tour with Flint", "#set-tour", "about"), ("Start a new tribe", "#set-new", "account"),
    ("Join another tribe", "#set-join", "account"), ("Demo", "#set-demo", "about"), ("Guide", "#set-guide", "about"),
    # new in the tabs
    ("Quiet hours", "#set-quiet", "notifications"), ("Sound", "#set-nf-sound", "notifications"), ("Digest", "#set-digest", "notifications"),
    ("Who can DM me", "#set-dm", "privacy"), ("Download my data", "#set-mydata", "privacy"), ("Blocked", "#set-blocked", "privacy"),
    ("Default home page", "#set-home", "workspace"), ("Shortcuts", "#set-keys", "workspace"), ("Spellcheck", "#set-spell", "workspace"),
    ("Density", "#set-density", "profile"), ("Text size", "#set-textsize", "profile"), ("Export settings", "#set-export-settings", "storage"),
    ("Import settings", "#set-import-settings", "storage"), ("Reset settings", "#set-reset-settings", "storage"),
    ("Check for updates", "#set-check-update", "about"), ("Version", "#set-version", "about"), ("Licenses", "#set-licenses", "about"),
    ("Increase contrast", "#set-contrast", "a11y"), ("Readable font", "#set-readable", "a11y"), ("Focus rings", "#set-focus", "a11y"),
    ("Reduce motion", "#set-motion", "a11y"), ("Captions", "#set-captions", "a11y"), ("Announce notifications", "#set-sr", "a11y"),
    ("Sign out other devices", "#set-signout-others", "account"), ("Delete my account", "#set-delete", "account"),
    ("Sync my settings", "#set-sync", "account"), ("Default home for new projects", "#set-projhome", "projects"),
    ("Invites", "#set-invite", "admin"), ("Moderation", "#set-mod", "admin"), ("Server address", "#set-server", "admin"),
    ("Allowed cloud AIs", "#set-aiconsent", "ai"), ("Free AI tools", "#set-offload", "ai"), ("Report a bug", "#set-bug", "about"),
]

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", "Origin": BASE, **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def main():
    shots = "--shots" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="tribe-st-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_DELETE_GRACE_MS": "2500"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"])
            pre = "try { if (!sessionStorage.getItem('st-init')) { localStorage.setItem('tribecode.settings.v1', JSON.stringify(%s)); sessionStorage.setItem('st-init', '1'); } } catch (e) {}"
            def page(name, token, vp=(1360, 860), phone=False):
                ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, is_mobile=phone, has_touch=phone, accept_downloads=True)
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                st = {"name": name, "onboarded": True, "tour": {"done": True}, **({"server": {"url": BASE, "token": token}} if token else {})}
                pg.add_init_script(pre % json.dumps(st))
                return pg
            def opened(pg): return pg.evaluate("TribeSettings.isOpen()")
            def visible(pg, sel): return pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); return !!e && !!e.getClientRects().length && !e.closest('[hidden]'); }})()")

            A = page("Ana", None)
            A.goto(BASE + "/?skipIntro=1"); A.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeSettings && window.TribePrefs", timeout=20000)
            atok = A.evaluate("TribeStore.get().server.token"); aid = A.evaluate("TribeClient.state().me.id")
            st, inv = api("/invites", "POST", {"role": "builder", "maxUses": 5}, token=atok); assert st == 200, inv
            st, ben = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Ben"}); assert st == 200, ben
            st, cy = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Cy"}); assert st == 200, cy
            btok, bid, ctok, cid = ben["token"], ben["member"]["id"], cy["token"], cy["member"]["id"]

            # 1) every tab renders, with sections; no layout jump (the window keeps its size)
            A.evaluate("TribeSettings.open()"); A.wait_for_selector("#set-tab-profile")
            tabs = A.evaluate("TribeSettings.tabs().map(t => t.id)")
            assert tabs == ["profile", "account", "ai", "notifications", "privacy", "workspace", "projects", "admin", "a11y", "storage", "about"], tabs
            size = A.evaluate("(() => { const r = document.querySelector('#settings-body').getBoundingClientRect(); return [r.width, r.height]; })()")
            for t in tabs:
                A.click(f"#set-tab-{t}"); A.wait_for_selector(f"#set-pane-{t}:not([hidden]) .set-sec", timeout=8000)
                assert A.evaluate(f"document.querySelector('#set-tab-{t}').getAttribute('aria-selected')") == "true"
                assert A.evaluate("(() => { const r = document.querySelector('#settings-body').getBoundingClientRect(); return [r.width, r.height]; })()") == size, f"{t}: the window changed size"
                assert A.evaluate("location.hash") == f"#/settings/{t}"
            if shots:
                A.click("#set-tab-profile"); A.wait_for_timeout(300); A.screenshot(path=str(SHOTS / "settings-profile.png"))
                A.click("#set-tab-notifications"); A.wait_for_selector("#set-quiet"); A.wait_for_timeout(300); A.screenshot(path=str(SHOTS / "settings-notifications.png"))

            # 2) every setting that existed before is still reachable via search, and lands in its tab
            A.wait_for_selector("#set-account #set-logout", state="attached", timeout=10000)
            A.wait_for_function("!!document.querySelector('#set-safety') && !!document.querySelector('#pz-show') && !!document.querySelector('#set-device-row')", timeout=10000)
            for words, sel, tab in MAPPING:
                A.fill("#set-search", words); A.wait_for_selector("#set-results:not([hidden])")
                hits = A.evaluate("[...document.querySelectorAll('[data-hit]')].map(b => [b.dataset.hit, b.dataset.hitTab])")
                want = A.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); const r = e && (e.closest('.set-row') || e); return r ? r.id : null; }})()")
                assert want, f"{words}: {sel} is not in Settings"
                assert [want, tab] in hits, f"search '{words}' should find {want} in {tab}: {hits[:6]}"
                A.click(f"[data-hit='{want}'][data-hit-tab='{tab}']")
                A.wait_for_function(f"!document.querySelector('#set-pane-{tab}').hidden")
                A.wait_for_function(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); return !!e && !!e.getClientRects().length; }})()", timeout=5000)
            A.fill("#set-search", "zzzz nothing"); A.wait_for_selector("#set-results:not([hidden])"); assert "Nothing found" in A.inner_text("#set-results")
            # Esc clears the search first, then closes
            A.keyboard.press("Escape"); assert opened(A) and A.input_value("#set-search") == ""
            A.keyboard.press("Escape"); A.wait_for_function("!TribeSettings.isOpen()"); assert not A.evaluate("location.hash.startsWith('#/settings')")

            # 3) deep links: #/settings/<tab> and #/settings/<tab>/<setting>, and the API
            A.evaluate("location.hash = '#/settings/notifications'"); A.wait_for_function("TribeSettings.isOpen() && !document.querySelector('#set-pane-notifications').hidden", timeout=8000)
            A.evaluate("TribeSettings.close()")
            A.goto(BASE + "/?skipIntro=1#/settings/privacy/set-dm"); A.wait_for_function("window.TribeSettings && TribeSettings.isOpen() && TribeSettings.current() === 'privacy'", timeout=20000)
            A.wait_for_function("document.querySelector('#sr-who-can-dm-me') && document.querySelector('#sr-who-can-dm-me').getBoundingClientRect().top > 0")
            A.evaluate("TribeSettings.open('ai', 'set-flintbrain')"); A.wait_for_function("TribeSettings.current() === 'ai'")
            A.evaluate("TribeSettings.close(); TribeSettings.open('set-github')"); A.wait_for_function("TribeSettings.current() === 'projects'")
            A.evaluate("TribeSettings.close(); TribeSettings.open()"); A.wait_for_function("TribeSettings.current() === 'projects'"); A.evaluate("TribeSettings.close()")   # the last tab is remembered
            # addSection: another feature's settings plug into a tab
            A.evaluate("TribeSettings.addSection('projects', { id: 'sync-test', title: 'GitHub sync', render: el => '<div class=\"set-row\" id=\"set-sync-test\"><div class=\"set-l\"><b>Ship on merge</b></div><div class=\"set-c\"></div></div>' })")
            A.evaluate("TribeSettings.open('projects')"); A.wait_for_selector("#set-ext-sync-test #set-sync-test")
            A.fill("#set-search", "ship on merge"); A.wait_for_selector("[data-hit='set-sync-test']"); A.evaluate("TribeSettings.close()")

            # 4) the admin tab is hidden from members; Ben's page
            B = page("Ben", btok)
            B.goto(BASE + "/?skipIntro=1"); B.wait_for_function("TribeClient.connected() && window.TribeSettings && window.TribePrefs", timeout=20000)
            B.evaluate("TribeSettings.open()"); B.wait_for_selector("#set-tab-profile")
            assert "admin" not in B.evaluate("TribeSettings.tabs().map(t => t.id)") and B.query_selector("#set-tab-admin") is None
            B.fill("#set-search", "backup"); B.wait_for_selector("#set-results:not([hidden])"); assert B.query_selector("[data-hit='sr-backup']") is None
            B.evaluate("TribeSettings.close(); TribeSettings.open('admin')"); B.wait_for_function("TribeSettings.current() === 'profile'")
            B.evaluate("TribeSettings.close()")

            # 5) density applies at once; text size too
            B.evaluate("TribeSettings.open('profile')"); B.click("#set-density [data-den='compact']")
            B.wait_for_function("document.body.classList.contains('compact') && TribeStore.get().density === 'compact'")
            B.wait_for_selector("#set-saved.on")
            B.click("#set-textsize [data-fs='l']"); B.wait_for_function("document.documentElement.dataset.fs === 'l'")
            B.click("#set-textsize [data-fs='m']"); B.wait_for_function("!document.documentElement.dataset.fs")
            B.click("#set-density [data-den='comfortable']"); B.wait_for_function("!document.body.classList.contains('compact')")

            # 6) quiet hours hold a notification (no sound, no pop-up); outside them it chimes
            B.click("#set-tab-notifications"); B.wait_for_selector("#set-quiet")
            now_hm = B.evaluate("(() => { const n = new Date(); const f = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); return [f(new Date(n - 3600e3)), f(new Date(+n + 3600e3)), Intl.DateTimeFormat().resolvedOptions().timeZone]; })()")
            st, _ = api("/notify/prefs", "PUT", {"tz": now_hm[2]}, token=btok)
            B.fill("#set-quiet-from", now_hm[0]); B.dispatch_event("#set-quiet-from", "change")
            B.fill("#set-quiet-to", now_hm[1]); B.dispatch_event("#set-quiet-to", "change")
            B.click("#set-quiet"); B.wait_for_function("TribePrefs.quiet() === true", timeout=8000)
            B.evaluate("TribeSettings.close(); window.__tcDings = 0; window.__tcQuietHeld = 0")
            st, _ = api("/chat/general", "POST", {"text": "@Ben quiet one"}, token=atok); assert st == 200
            B.wait_for_function("window.__tcQuietHeld >= 1", timeout=8000)
            assert B.evaluate("window.__tcDings") == 0, "no sound in quiet hours"
            api("/notify/prefs", "PUT", {"when": {"quiet": {"on": False}}}, token=btok); B.evaluate("TribePrefs.notifyPrefs(true)"); B.wait_for_function("TribePrefs.quiet() === false")
            st, _ = api("/chat/general", "POST", {"text": "@Ben loud one"}, token=atok)
            B.wait_for_function("window.__tcDings >= 1", timeout=8000)
            # sound off: no chime
            B.evaluate("TribePrefs.set({ sound: false }); window.__tcDings = 0")
            api("/chat/general", "POST", {"text": "@Ben silent one"}, token=atok); B.wait_for_timeout(1200); assert B.evaluate("window.__tcDings") == 0
            B.evaluate("TribePrefs.set({ sound: true })")
            # channel mute: nothing from #general reaches Ben's inbox
            B.evaluate("TribeSettings.open('notifications')"); B.wait_for_selector("[data-mute-kind='channels']")
            ch = B.evaluate("document.querySelector(\"[data-mute-kind='channels']\").dataset.mute")
            B.select_option(f"[data-mute-kind='channels'][data-mute='{ch}']", "none")
            B.wait_for_function(f"TribeClient.api('/notify/prefs').then(r => r.prefs.mutes.channels['{ch}'] === 'none')", timeout=8000)
            time.sleep(0.6)
            api("/chat/general", "POST", {"text": "@Ben muted one"}, token=atok); time.sleep(1.2)
            st, inbox = api("/notify/inbox", token=btok); assert not any("muted one" in (i.get("body") or "") for i in inbox["items"]), "a muted channel stays silent"
            st, state = api("/notify/state", token=btok); assert any(r.get("reason") == "muted" for r in state["recent"]), state["recent"][:3]
            B.select_option(f"[data-mute-kind='channels'][data-mute='{ch}']", "all"); B.evaluate("TribeSettings.close()")

            # 7) export / import settings round-trip (and reset)
            B.evaluate("TribeSettings.open('profile')"); B.click("[data-theme-id='nordic']"); B.wait_for_function("TribeStore.get().theme === 'nordic'")
            B.evaluate("TribePrefs.set({ contrast: true, homePage: 'chat' })")
            B.click("#set-tab-storage")
            with B.expect_download() as dl: B.click("#set-export-settings")
            path = dl.value.path(); data = json.loads(Path(path).read_text())
            assert data["kind"] == "settings" and data["settings"]["theme"] == "nordic" and data["settings"]["prefs"]["contrast"] is True and "server" not in data["settings"]
            B.on("dialog", lambda d: d.accept())
            B.click("#set-reset-settings"); B.wait_for_function("TribeStore.get().theme !== 'nordic' && !TribePrefs.get().contrast")
            assert B.evaluate("!!TribeStore.get().server.token"), "reset keeps you signed in"
            B.set_input_files("#set-import-file", path)
            B.wait_for_function("TribeStore.get().theme === 'nordic' && TribePrefs.get().contrast === true && document.documentElement.dataset.contrast === 'more'", timeout=8000)
            try: B.import_settings_bad = B.evaluate("(() => { try { TribePrefs.importSettings({ kind: 'nope' }); return 'ok'; } catch (e) { return e.message; } })()")
            except Exception: pass
            assert "not a TribeCode settings file" in B.import_settings_bad
            B.evaluate("TribePrefs.set({ contrast: false }); TribeSettings.close()")

            # 8) default home page applies on the next start
            B.reload(); B.wait_for_function("TribeClient.connected() && window.TribePrefs", timeout=20000)
            B.wait_for_function("document.body.dataset.view === 'chat'", timeout=10000)
            B.evaluate("TribePrefs.set({ homePage: '' })")

            # 9) accessibility: contrast, focus rings, readable font, reduced motion
            B.evaluate("TribeSettings.open('a11y')"); B.click("#set-contrast"); B.wait_for_function("document.documentElement.dataset.contrast === 'more'")
            B.click("#set-focus [data-focus='strong']"); B.wait_for_function("document.documentElement.dataset.focus === 'strong'")
            B.click("#set-readable"); B.wait_for_function("document.documentElement.dataset.readable === 'on' && getComputedStyle(document.body).fontFamily.includes('Verdana')")
            B.click("#set-motion [data-motion='off']"); B.wait_for_function("document.documentElement.dataset.motion === 'off' && !TribeMotion.enabled()")
            B.click("#set-motion [data-motion='system']"); B.wait_for_function("document.documentElement.dataset.motion !== 'off'")
            B.click("#set-contrast"); B.click("#set-readable"); B.click("#set-focus [data-focus='normal']")
            B.evaluate("TribeSettings.close()")

            # 10) custom shortcuts: move "Search" to Alt+K; Ctrl+K stops opening it
            B.evaluate("TribeSettings.open('workspace')"); B.wait_for_selector("[data-key-change='palette']")
            B.click("[data-key-change='palette']"); B.keyboard.press("Alt+k")
            B.wait_for_function("TribeShortcuts.keyOf('palette') === 'Alt+K' && document.querySelector('#set-key-palette').textContent === 'Alt K'")
            B.keyboard.press("Escape"); B.wait_for_function("!TribeSettings.isOpen()")
            B.keyboard.press("Control+k"); B.wait_for_timeout(300); assert B.evaluate("document.querySelector('#palette').classList.contains('hidden')"), "Ctrl K moved away"
            B.keyboard.press("Alt+k"); B.wait_for_function("!document.querySelector('#palette').classList.contains('hidden')", timeout=5000)
            B.keyboard.press("Escape"); B.evaluate("TribeShortcuts.reset()")
            B.keyboard.press("Control+Comma"); B.wait_for_function("TribeSettings.isOpen()"); B.evaluate("TribeSettings.close()")

            # 11) who can DM me + typing off (server-enforced)
            dm = "dm-" + "-".join(sorted([bid, cid]))
            B.evaluate("TribeSettings.open('privacy')"); B.wait_for_selector("#set-dm")
            B.select_option("#set-dm", "staff"); B.wait_for_function("TribeClient.api('/me/privacy').then(r => r.privacy.dm === 'staff')", timeout=8000)
            time.sleep(0.4)
            st, e = api(f"/chat/{dm}", "POST", {"text": "hi Ben"}, token=ctok); assert st == 403, (st, e)
            st, _ = api("/chat/dm-" + "-".join(sorted([aid, bid])), "POST", {"text": "host can"}, token=atok); assert st == 200
            B.select_option("#set-dm", "everyone"); B.wait_for_function("TribeClient.api('/me/privacy').then(r => r.privacy.dm === 'everyone')")
            B.click("#set-typing"); B.wait_for_function("TribeClient.api('/me/privacy').then(r => r.privacy.typing === false)", timeout=8000)
            B.click("#set-show-typing"); B.wait_for_function("document.documentElement.dataset.typing === 'off'"); B.click("#set-show-typing")
            B.click("#set-typing"); B.evaluate("TribeSettings.close()")

            # 12) download my data: a .zip with my messages and nobody else's
            assert api("/chat/general", "POST", {"text": "Ben's own words"}, token=btok)[0] == 200
            B.evaluate("TribeSettings.open('privacy')")
            with B.expect_download() as dl: B.click("#set-mydata")
            z = zipfile.ZipFile(dl.value.path()); names = z.namelist()
            assert "profile.json" in names and "README.txt" in names and any(n.startswith("messages/") for n in names), names
            msgs = [m for n in names if n.startswith("messages/") for m in json.loads(z.read(n))]
            assert msgs and all(m["by"] == bid for m in msgs), "only Ben's own messages"
            B.evaluate("TribeSettings.close()")

            # 13) settings sync: Ben turns it on here; a new device picks up his theme
            B.evaluate("TribeSettings.open('account')"); B.click("#set-sync")
            B.wait_for_function("TribeClient.api('/me/settings').then(r => !!r.settings && r.settings.theme === 'nordic' && r.settings.prefs.sync === true)", timeout=10000)
            B2 = page("Ben2", btok)
            B2.goto(BASE + "/?skipIntro=1"); B2.wait_for_function("TribeClient.connected() && TribeStore.get().theme === 'nordic' && TribePrefs.get().sync === true", timeout=20000)
            B2.context.close()

            # 14) sign out other devices: a device link stops working, this device stays in (with a new key)
            st, link = api("/device-link", "POST", {"label": "Ben's phone"}, token=btok); assert st == 200
            st, red = api("/device-link/redeem", "POST", {"key": link["key"]}); assert st == 200; phone_tok = red["token"]
            assert api("/me", token=phone_tok)[0] == 200
            B.evaluate("TribeSettings.close(); TribeSettings.open('account')"); B.wait_for_selector("#set-devices [data-dev]", timeout=10000)
            B.click("#set-signout-others"); B.wait_for_function("!document.querySelector('#set-devices [data-dev]')", timeout=10000)
            assert api("/me", token=phone_tok)[0] == 401, "the phone is signed out"
            assert api("/me", token=btok)[0] == 401, "the old key is replaced"
            nb = B.evaluate("TribeStore.get().server.token"); assert nb != btok and api("/me", token=nb)[0] == 200, "this device keeps working"
            btok = nb
            B.evaluate("TribeSettings.close()")

            # 15) deletion with a grace period: Cy asks, undoes, asks again; after the grace period Cy is gone
            C2 = page("Cy", ctok)
            C2.goto(BASE + "/?skipIntro=1"); C2.wait_for_function("TribeClient.connected() && window.TribeSettings", timeout=20000)
            C2.evaluate("TribeSettings.open('account')"); C2.wait_for_selector("#set-del-in")
            C2.fill("#set-del-in", "DELETE"); C2.click("#set-del-go"); C2.wait_for_selector("#set-del-undo")
            C2.click("#set-del-undo"); C2.wait_for_selector("#set-del-in"); time.sleep(3.2)
            assert api("/me", token=ctok)[0] == 200, "undo kept the account"
            C2.fill("#set-del-in", "DELETE"); C2.click("#set-del-go"); C2.wait_for_selector("#set-del-pending")
            for _ in range(40):
                if api("/me", token=ctok)[0] == 401: break
                time.sleep(0.25)
            assert api("/me", token=ctok)[0] == 401, "deleted after the grace period"
            C2.context.close()
            A.evaluate("TribeSettings.open('account')"); A.wait_for_selector("#set-delete .set-info"); assert "host" in A.inner_text("#set-delete")
            A.evaluate("TribeSettings.close()")

            # 16) phones: the tab list, drill into a tab, Back; Esc closes
            Ph = page("BenPhone", btok, vp=(390, 844), phone=True)
            Ph.goto(BASE + "/?skipIntro=1"); Ph.wait_for_function("TribeClient.connected() && window.TribeSettings", timeout=20000)
            Ph.evaluate("TribeSettings.open()"); Ph.wait_for_selector("#set-tab-notifications", state="visible")
            assert not visible(Ph, "#set-main"), "phones start on the tab list"
            if shots: Ph.wait_for_timeout(300); Ph.screenshot(path=str(SHOTS / "settings-phone.png"))
            Ph.click("#set-tab-privacy"); Ph.wait_for_selector("#set-back", state="visible"); Ph.wait_for_selector("#set-dm", state="visible")
            assert not visible(Ph, "#set-tab-privacy"), "the list hides inside a tab"
            w = Ph.evaluate("document.querySelector('#settings-body').getBoundingClientRect().width"); assert w <= 390, w
            assert Ph.evaluate("document.documentElement.scrollWidth <= innerWidth"), "no sideways scroll"
            Ph.click("#set-back"); Ph.wait_for_selector("#set-tab-privacy", state="visible"); assert not visible(Ph, "#set-dm")
            Ph.evaluate("TribeSettings.close(); TribeSettings.open('account', 'set-sync')"); Ph.wait_for_selector("#set-sync", state="visible")
            Ph.keyboard.press("Escape"); Ph.wait_for_function("!TribeSettings.isOpen()")
            b.close()
        assert not errors, errors
        print("e2e_settings_tabs: OK")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
