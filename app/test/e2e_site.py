"""GitHub Pages friend link: go.html#s=<host>&c=<code> checks the host, then hands off to its /join page.
Also: the server's quick invite builds site links for public hosts, and the installed app offers notifications.
Usage: python app/test/e2e_site.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, http.server, threading, functools
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1].parent
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT, SITE_PORT = 4786 + OFF, 4785 + OFF
BASE = f"http://localhost:{PORT}"
SITE = f"http://localhost:{SITE_PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def api(path, method="GET", body=None, tok=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", **({"authorization": "Bearer " + tok} if tok else {})})
    try:
        with opener.open(req, timeout=10) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def no_overflow(pg, where):
    sw, iw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw, f"horizontal overflow on {where}: {sw} > {iw}"

def demo(b):
    """The website demo (demo.html) matches the real app on dev: bubbles, the composer pill and "+" menu, proposals that land
    on the Board, the top right (profile menu, bell, window lights), people, Workshop, the Secretary digest, Create project."""
    shots = ROOT / "docs" / "screenshots"
    def enter(pg, tour=False):
        pg.goto(f"{SITE}/demo.html"); pg.fill("#name", "Sam"); pg.click("#join")
        pg.wait_for_selector("#s-room:not(.hidden)"); pg.wait_for_selector("#tq-skip", timeout=5000)
        if tour: return
        pg.click("#tq-skip")
        if pg.viewport_size["width"] < 900 and "iPhone" in pg.evaluate("navigator.userAgent"):  # the Home Screen tip follows the skipped tour
            pg.wait_for_selector("#tip-later", timeout=4000); pg.click("#tip-later")
    def say(pg, text):
        pg.fill("#box", text); pg.evaluate("document.querySelector('#act').click()")
    def box(pg, sel): return pg.locator(sel).first.bounding_box()
    def shot(pg, name):  # transient toasts would cover the top bar
        pg.evaluate("document.querySelectorAll('.toast').forEach(t => t.remove())"); pg.screenshot(path=str(shots / name))

    # ---------------- desktop 1440x900 ----------------
    dk = b.new_page(viewport={"width": 1440, "height": 900}); derrs = []; dk.on("pageerror", lambda e: derrs.append(str(e)))
    enter(dk)
    assert dk.is_visible(".mhead") and not dk.is_visible("#tabbar")
    # top right: panel · Context · profile (teal dot) · bell (badge) · window lights in Mac order after a divider; no "connected" pill
    order = dk.evaluate("[...document.querySelector('.mhead .right').children].map(e => e.id)")
    assert order == ["panel-toggle", "ctx-btn", "pf-btn", "nf-bell", "win-ctl"], order
    assert dk.evaluate("[...document.querySelectorAll('#win-ctl .wl')].map(e => getComputedStyle(e).backgroundColor)") == ["rgb(255, 95, 87)", "rgb(254, 188, 46)", "rgb(40, 200, 64)"]
    assert dk.evaluate("getComputedStyle(document.querySelector('#win-ctl')).borderLeftWidth") == "1px"
    assert dk.evaluate("getComputedStyle(document.querySelector('#pf-btn .pf-dot')).backgroundColor") == "rgb(56, 198, 177)"
    assert dk.inner_text("#nf-bell .bdg") == "2"
    assert "connected" not in dk.inner_text(".mhead").lower()
    # chat header bar
    assert "#general" in dk.inner_text("#cbar") and "5 members · 4 online" in dk.inner_text("#cbar") and dk.locator("#cbar .cb-btn").count() == 3
    # bubbles: date pill, a time separator, others left with one avatar per group and the name in the first bubble
    assert dk.inner_text("#log .sysline.day") == "Today" and dk.locator("#log .sysline.tsep").count() >= 1
    o1, o2 = dk.locator("#log .row.them[data-who=Orion]").nth(0), dk.locator("#log .row.them[data-who=Orion]").nth(1)
    assert "head" in o1.get_attribute("class") and "head" not in o2.get_attribute("class") and "tail" in o2.get_attribute("class")
    assert o1.locator(".bub .bn").inner_text() == "Orion" and o2.locator(".bn").count() == 0
    assert o1.locator(".avc .av").evaluate("e => getComputedStyle(e).visibility") == "hidden" and o2.locator(".avc .av").evaluate("e => getComputedStyle(e).visibility") == "visible"
    assert o1.locator(".bub .rxr .mt time").is_visible()   # the time sits inside the bubble (on the reactions row here)
    # reactions inside the bubble with tiny reactor faces
    assert o1.locator(".bub .rxc .fs i").count() == 2
    # voice note bubble, reply quote with a colored bar
    vn = dk.locator("#log .bub.voice").first
    assert "0:09 · 35.5 KB" in vn.inner_text() and "checkpoint" in vn.inner_text()
    assert vn.locator(".play").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(242, 107, 29)"
    assert dk.locator("#log .bub .quote").count() == 1 and "Maya" in dk.inner_text("#log .bub .quote b")
    # mine: right, flat ember tint, ✓ then ✓✓ once read
    dk.wait_for_timeout(2400); say(dk, "Hi all 👋")
    mine = dk.locator("#log .row.me").last
    assert mine.locator(".bub").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(58, 36, 22)"
    assert mine.locator(".avc .av").count() == 0 and mine.locator(".mt .tck").count() >= 1
    theirs = box(dk, "#log .row.them[data-who=Orion] .bub")
    mb, chat = mine.locator(".bub").bounding_box(), box(dk, "#log")
    assert mb["x"] + mb["width"] > chat["x"] + chat["width"] - 4 and theirs["x"] < chat["x"] + 50, (mb, theirs, chat)
    # several of my bubbles carry ticks; wait until any one of them shows as read (the demo marks them after a short delay)
    dk.wait_for_function("[...document.querySelectorAll('#log .row.me .mt .tck.read')].some(e => e.offsetParent !== null)", timeout=15000)
    dk.wait_for_timeout(3500)
    dk.evaluate("document.querySelector('#v-chat').scrollTop = 0"); dk.wait_for_timeout(200)
    shot(dk, "demo-desktop-chat-top.png")
    dk.evaluate("document.querySelector('#v-chat').scrollTop = 1e6"); dk.wait_for_timeout(200)
    shot(dk, "demo-desktop.png"); no_overflow(dk, "desktop")
    # the team vote suggested by Maya's Claude: Orion votes live, my Approve passes it, then it becomes a task
    vt = dk.locator('.vt[data-vote="vt1"]')
    assert "Approve: double-jump for Pixel Quest?" in vt.inner_text() and "Suggested by Maya's Claude" in vt.inner_text()
    dk.wait_for_function("document.querySelector('.vt[data-vote=vt1] [data-vt=\"vt1|yes\"] .vt-n').textContent === '2'", timeout=6000)
    dk.click('[data-vt="vt1|yes"]'); dk.wait_for_selector('.vt[data-vote="vt1"].st-passed [data-vtask]')
    dk.click('.vt[data-vote="vt1"] [data-vtask]'); dk.wait_for_selector('.vt[data-vote="vt1"] .vt-done')
    assert dk.evaluate("__demo.tasks.s[0].t") == "Ship the double jump"
    # the composer: one pill, emoji · message · mic · image · +
    pill = box(dk, "#composer .pillc")
    xs = {k: box(dk, s)["x"] for k, s in [("emo", "#emoji"), ("box", "#box"), ("mic", "#act"), ("img", "#img-btn"), ("plus", "#attach")]}
    assert xs["emo"] < xs["box"] < xs["mic"] < xs["img"] < xs["plus"], xs
    for s in ["#emoji", "#act", "#img-btn", "#attach"]:
        bb = box(dk, s); assert pill["x"] <= bb["x"] and bb["x"] + bb["width"] <= pill["x"] + pill["width"], s
    # "+": Add · Decide together · Get it done
    dk.click("#attach"); dk.wait_for_selector("#amenu .pl-item"); dk.wait_for_timeout(250)
    assert dk.locator("#amenu .pl-group").all_inner_texts() == ["ADD", "DECIDE TOGETHER", "GET IT DONE"] or \
        [t.lower() for t in dk.locator("#amenu .pl-group").all_inner_texts()] == ["add", "decide together", "get it done"]
    labels = [t.split("\n")[0] for t in dk.locator("#amenu .pl-item .pl-t").all_inner_texts()]
    assert labels == ["Photo or file", "Propose to the tribe", "Quick poll", "Task", "Ask my Claude", "Reminder or event", "Note", "Report a bug"], labels
    shot(dk, "demo-attach-menu.png")
    # Propose to the tribe -> the proposal sheet -> a "Proposal to the tribe" card -> passes -> On the Board
    dk.click("#amenu [data-pl=propose]"); dk.wait_for_selector("#pl-prop")
    assert dk.is_visible("#pl-title") and dk.is_visible("#pl-body") and dk.locator("#pl-dl option").count() == 4
    dk.fill("#pl-title", "Add a level select screen"); dk.fill("#pl-body", "So playtesters can jump straight to Level 2.\n- [ ] Level select UI\n- [ ] Remember unlocked levels")
    dk.wait_for_timeout(300); shot(dk, "demo-desktop-proposal.png")
    dk.click("#pl-prop [type=submit]")
    prop = dk.locator("#log .row.me .vt").last
    prop.wait_for(); assert "proposal to the tribe" in prop.inner_text().lower() and "Goes to the Board if approved" in prop.inner_text()
    assert prop.locator(".vt-pitch li").count() == 2
    dk.wait_for_timeout(3300); prop.locator('[data-vt$="|yes"]').click()
    dk.wait_for_selector("#log .row.me .vt.st-passed .vt-ontb"); assert "On the Board" in prop.inner_text()
    assert dk.evaluate("__demo.tasks.s.some(t => t.t === 'Level select UI')")
    dk.wait_for_function("[...document.querySelectorAll('#log .sysline')].some(s => s.textContent.includes('on the Board'))", timeout=4000)
    dk.wait_for_timeout(400); shot(dk, "demo-desktop-board.png")
    # profile menu
    dk.click("#pf-btn"); dk.wait_for_selector("#pf-menu .pf-item")
    items = dk.locator("#pf-menu .pf-item span:first-of-type").all_inner_texts()
    assert items == ["My profile and activity", "Connect your Claude Code", "Your agents", "Invite friends", "Notifications", "Capture to notes", "Settings", "Check for updates"], items
    shot(dk, "demo-profile.png")
    dk.click("#pf-menu [data-act=capture]"); assert dk.locator("#pf-menu .pf-sw.on").count() == 1
    dk.keyboard.press("Escape")
    # person panel: click a name -> now + timeline
    dk.click(".sd-p[data-p=Maya]"); dk.wait_for_selector("#side .pp-now")
    assert "Drawing the slime boss" in dk.inner_text("#side .pp-now")
    dk.click("#side [data-ppt=Commits]"); assert dk.locator("#side .pp-tl").count() == 2 and dk.locator("#side .pp-tl .k-commit").count() == 2
    shot(dk, "demo-desktop-person.png"); dk.click("#side [data-ppx]")
    # Updates: the Secretary's digest; Docs and Tasks
    dk.click(".nav[data-v=updates]"); dk.wait_for_timeout(300)
    assert dk.locator("#digest .dg-i").count() == 5 and "What matters now" in dk.inner_text("#v-updates")
    shot(dk, "demo-desktop-updates.png")
    for v in ["docs", "tasks"]:
        dk.click(f".nav[data-v={v}]"); dk.wait_for_timeout(300); shot(dk, f"demo-desktop-{v}.png")
    # Workshop in the rail
    dk.click("#rail-ws"); dk.wait_for_selector("#v-workshop.on .ws-hero")
    assert "Slime hop" in dk.inner_text("#v-workshop") and "on" in dk.get_attribute("#rail-ws", "class")
    shot(dk, "demo-desktop-workshop.png")
    # one-click Create project from the rail "+"
    dk.click("#rail-add"); dk.wait_for_selector("#np")
    assert "Create a new project" in dk.inner_text("#np") and "Paste an invite link" in dk.inner_text("#np")
    dk.wait_for_timeout(250); shot(dk, "demo-new-project.png")
    dk.click("#np-create"); dk.wait_for_selector(".rail .pc.newp")
    no_overflow(dk, "desktop end")
    assert not derrs, derrs

    # ---------------- iPhone 390x844 ----------------
    ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page()
    errs = []; ph.on("pageerror", lambda e: errs.append(str(e)))
    enter(ph)
    # Chat: the rack sits in a compact top bar with the "#general" pill; no bottom rack
    assert ph.is_visible("#pmid .seg") and not ph.is_visible("#tabbar") and "#general" in ph.inner_text("#chan")
    cb, pb = box(ph, "#chan"), box(ph, "#pmid .seg button:last-child")
    assert pb["x"] + pb["width"] <= cb["x"], "the channel pill overlaps the section icons"
    # the composer: one pill with + and mic inside
    pill = box(ph, "#composer .pillc")
    for s in ["#attach", "#act"]:
        bb = box(ph, s); assert pill["x"] <= bb["x"] and bb["x"] + bb["width"] <= pill["x"] + pill["width"] and pill["y"] <= bb["y"] and bb["y"] + bb["height"] <= pill["y"] + pill["height"], s
    assert box(ph, "#attach")["x"] < box(ph, "#box")["x"] < box(ph, "#act")["x"]
    assert not ph.is_visible("#emoji") and not ph.is_visible("#img-btn")
    ph.wait_for_timeout(2400); say(ph, "Hi all 👋"); ph.wait_for_timeout(4500)
    shot(ph, "demo-phone-chat.png"); no_overflow(ph, "phone chat")
    # "+" opens the sheet
    ph.evaluate("document.querySelector('#attach').click()"); ph.wait_for_selector("#amenu.sheet .pl-item"); ph.wait_for_timeout(300)
    assert ph.locator("#amenu .pl-group").count() == 3
    shot(ph, "demo-phone-plus.png"); no_overflow(ph, "phone plus")
    ph.evaluate("document.querySelector('#amenu-scrim').click()")
    # long-press a bubble -> quick-react bar -> my reaction inside the bubble
    rid = ph.locator("#log .row.them .bub.txt:not(.has-rx)").first.evaluate("b => b.closest('.row').dataset.rid")
    bub = ph.locator(f"#log .row[data-rid='{rid}'] .bub")
    bub.scroll_into_view_if_needed(); bx = bub.bounding_box()
    ph.mouse.move(bx["x"] + 30, bx["y"] + bx["height"] / 2); ph.mouse.down(); ph.wait_for_timeout(600); ph.mouse.up()
    ph.wait_for_selector("#qr"); assert ph.locator("#qr button").count() == 6
    shot(ph, "demo-phone-react.png")
    ph.click("#qr [aria-label='React 👍']"); ph.wait_for_selector("#qr", state="detached")
    ph.wait_for_selector(f".row[data-rid='{rid}'] .bub .rxc.mine")
    assert ph.evaluate(f"__demo.RX['{rid}']['👍'].includes('me')")
    ph.click(f".row[data-rid='{rid}'] .rxc.mine"); ph.wait_for_selector(f".row[data-rid='{rid}'] .rxc.mine", state="detached")
    # other sections: no header, a distinct bottom rack with avatar, labels and the orange action
    for v, act in [("docs", "Upload"), ("updates", "Ask"), ("tasks", "Suggest")]:
        ph.evaluate(f"document.querySelector('#seg [data-v={v}]').click()"); ph.wait_for_timeout(350)
        assert not ph.is_visible(".pbar") and ph.is_visible("#tabbar #seg")
        assert ph.is_visible("#rk-me .av") and act in ph.inner_text("#rk-act")
        assert ph.evaluate("getComputedStyle(document.querySelector('#rk-act .ab')).backgroundColor") == "rgb(242, 107, 29)"
        assert ph.get_attribute(f"#seg [data-v={v}]", "aria-current") == "page"
        assert ph.evaluate("getComputedStyle(document.querySelector('#tabbar')).backgroundColor") == "rgb(27, 32, 40)"
        shot(ph, f"demo-phone-{v}.png"); no_overflow(ph, "phone " + v)
    assert ph.locator("#digest .dg-i").count() >= 4
    # the avatar opens the side panel (rail with Workshop, sections, pinned repo, people)
    ph.click("#rk-me"); ph.wait_for_function("document.querySelector('#s-room').classList.contains('peek')"); ph.wait_for_timeout(400)
    assert ph.is_visible("#rail-ws") and ph.is_visible(".nest .pin-repo")
    shot(ph, "demo-phone-panel.png")
    # a person from the panel opens as a sheet
    ph.click(".nest .person[data-p=Orion]"); ph.wait_for_selector("#s-room.pp-open #side .pp-now"); ph.wait_for_timeout(300)
    shot(ph, "demo-phone-person.png"); no_overflow(ph, "phone person")
    ph.click("#pp-scrim", position={"x": 20, "y": 20})
    assert not errs, errs

    # tour, recording, DMs, iOS tip, in-app banner
    t = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page()
    terrs = []; t.on("pageerror", lambda e: terrs.append(str(e)))
    enter(t, tour=True); t.click("#tq-go"); t.wait_for_selector(".tcap"); t.click("#t-next"); t.wait_for_timeout(400)
    shot(t, "demo-tour.png"); t.click("#t-skip")
    t.wait_for_selector("#tip-later", timeout=4000); t.wait_for_timeout(300); shot(t, "demo-ios-tip.png"); t.click("#tip-later")
    t.evaluate("document.querySelector('#act').click()"); t.wait_for_selector("#composer.rec"); t.wait_for_timeout(1500)
    shot(t, "demo-recording.png"); t.click("#act"); t.wait_for_selector("#log .row.me .bub.voice")
    t.click("#chan"); t.wait_for_selector("#thr-m [data-th='dm:Orion']"); t.click("#thr-m [data-th='dm:Orion']")
    t.wait_for_function("document.querySelector('#chan').textContent.includes('Orion')"); say(t, "hey!"); t.wait_for_timeout(3000)
    shot(t, "demo-dm.png"); no_overflow(t, "phone dm")
    assert not terrs, terrs
    ia = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                       user_agent=IPHONE_UA.replace("Safari/604.1", "[FBAN/MessengerForiOS;FBAV/450.0]")).new_page()
    ia.goto(f"{SITE}/demo.html"); ia.wait_for_selector("#inapp"); shot(ia, "demo-inapp.png")
    print("Demo test passed")

def main():
    tmp = tempfile.mkdtemp()
    # The "GitHub Pages" site: a static server over app/ui, like the Pages workflow publishes.
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=str(ROOT / "app" / "ui"))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_TEST_SITE": SITE}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        assert api("/health")[1]["site"] == SITE
        # quick invite: local only, makes the host, plain link for a non-public host
        st, q = api("/host/quick-invite", "POST", {"name": "Orion"})
        assert st == 200 and q["hostOpen"] and "/join/" in q["join"], q
        req = urllib.request.Request(BASE + "/api/host/quick-invite", method="POST", data=b"{}", headers={"content-type": "application/json", "x-forwarded-for": "8.8.8.8"})
        try: opener.open(req, timeout=5); assert False, "tunnelled request must not count as local"
        except urllib.error.HTTPError as e: assert e.code == 403
        code = q["join"].rsplit("/", 1)[1]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # iPhone: site page -> host online -> auto hand-off to the host's join page -> device link
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA).new_page()
            ph.goto(f"{SITE}/go.html#s={BASE}&c={code}")
            ph.wait_for_selector("text=Join Campfire Crew"); assert "computer is online" in ph.inner_text("#view")
            assert "Add to Home Screen" in ph.inner_text("#view")
            ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "friend-link-site.png"))
            ph.wait_for_url(f"{BASE}/join/{code}", timeout=8000)
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet")
            # desktop: no auto-redirect, a Continue button and a download link
            dk = b.new_page(viewport={"width": 1200, "height": 800})
            dk.goto(f"{SITE}/go.html#s={BASE}&c={code}"); dk.wait_for_selector("#go")
            assert "Download TribeCode" in dk.inner_text("#view"); dk.wait_for_timeout(1200); assert dk.url.startswith(SITE)
            # expired / bad / offline
            dk.goto(f"{SITE}/go.html#s={BASE}&c=nope1"); dk.wait_for_selector("text=Ask your friend for a fresh link")
            dk.goto(f"{SITE}/go.html#c=abc"); dk.wait_for_selector("text=missing a piece")
            dk.goto(f"{SITE}/go.html#s=http://localhost:{PORT + 7}&c={code}"); dk.wait_for_selector("text=computer is offline", timeout=12000)
            dk.screenshot(path=str(ROOT / "docs" / "screenshots" / "friend-link-offline.png"))
            # the app understands site links when pasted
            app = b.new_page(); app.goto(BASE + "/?skipIntro=1")
            app.wait_for_function("!!(window.TribeApp && window.TribeApp.parseInvite)")
            got = app.evaluate(f"TribeApp.parseInvite('https://orionopenwow.github.io/TribeCode/go.html#s=' + encodeURIComponent('https://pc.tail1.ts.net') + '&c={code}')")
            assert got == {"server": "https://pc.tail1.ts.net", "code": code}, got
            demo(b)
            b.close()
        print("Site friend-link test passed")
    finally:
        srv.terminate(); httpd.shutdown()

if __name__ == "__main__":
    main()
