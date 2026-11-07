"""Phone UI test (app/ui/mobile2.js): the bottom rack and its move into the Chat top bar, the Discord-mobile
panel (edge swipe), the composer ("+" menu, photo, one-tap recorder with pause/stop/delete, send arrow),
"Talk to…", profile sheets (add friend, network), one-tap approvals with a comment, the Docs hub with the
pinned repo hero and its Flare thumbnail (README image → screenshot → tile), suggested tasks, the orange
action, reduced motion, and the in-app-browser banner on join/go pages.
Usage: python app/test/e2e_mobile2.py [--shots]   (--shots saves docs/screenshots/phone-*.png)"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4796 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
MESSENGER_UA = IPHONE_UA.replace("Safari/604.1", "[FBAN/MessengerForiOS;FBAV/450.0;FBDV/iPhone15,2]")
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def named(page, name):
    """Zero-step setup: the app names you after the computer's user unless a name is already saved."""
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and print(who, "console:", m.text[:160]))

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def png(w, h, rgb):
    """A small solid-color PNG (stdlib only)."""
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

def shot(page, name):
    if take: page.wait_for_timeout(450); page.screenshot(path=str(SHOTS / f"phone-{name}.png"))

def no_overflow(page, where):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"horizontal overflow on {where}"

def swipe(cdp, x0, x1, y=420, steps=8):
    """A one-finger horizontal swipe through the DevTools protocol (Playwright has no touch drag)."""
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y}]})
        time.sleep(0.016)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-m2-")
    repo = os.path.join(tmp, "pixel-quest")
    g = lambda *a: subprocess.run(["git", "-C", repo, "-c", "user.email=maya@t", "-c", "user.name=Maya", *a], check=True, capture_output=True)
    os.makedirs(repo)
    subprocess.run(["git", "init", "-q", "-b", "main", repo], check=True)
    Path(repo, "README.md").write_text("# Pixel Quest\n\n[![build](https://img.shields.io/badge/build-passing-green)](x)\n\nA tiny platformer.\n")
    g("add", "-A"); g("commit", "-q", "-m", "Pixel Quest: first level")
    work = os.path.join(tmp, "tribe")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", work, "--name", "Campfire Crew", "--repo", repo, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            wait_text(host, "#sync-status", "connected")
            htok = host.evaluate("TribeStore.get().server.token")
            # desktop is untouched: no rack, no phone composer
            assert host.locator("#tabbar").is_hidden() and host.locator("#m2-plus").is_hidden() and host.locator("#m2-talk").is_hidden()

            st, inv = api("/invites", "POST", {"maxUses": 3}, htok); assert st == 200, inv
            ctx = b.new_context(**PHONE); ctx.grant_permissions(["microphone", "clipboard-read", "clipboard-write"], origin=BASE)
            phone = ctx.new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{inv['invite']['code']}")
            assert phone.locator("#tc-inapp").count() == 0, "no in-app banner in Safari"
            phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            phone.evaluate("document.querySelector('#hi-banner') && document.querySelector('#hi-banner').remove()")
            mtok = phone.evaluate("TribeStore.get().server.token")
            maya = api("/me", token=mtok)[1]["member"]["id"]
            orion = api("/me", token=htok)[1]["member"]["id"]

            # ---- the rack: avatar · Chat · Docs · Updates · Tasks · action, at the bottom; no header outside Chat
            phone.evaluate("TribeApp.show('home')")
            rack = phone.locator("#tabbar").bounding_box()
            assert rack["y"] > 760 and rack["width"] >= 380, rack
            for sel in ["#m2-me", '#tabbar [data-nav="chat"]', '#tabbar [data-nav="docs"]', '#tabbar [data-m2nav="updates"]', '#tabbar [data-nav="tasks"]', "#m2-act"]:
                assert phone.locator(sel).is_visible(), sel
            assert phone.evaluate("getComputedStyle(document.querySelector('#m2-act')).backgroundColor") == "rgb(242, 107, 29)", "orange action"
            assert phone.locator("#crumb-section").is_hidden() and phone.locator("#ws-name").is_hidden() and phone.locator("#sync-status").is_hidden(), "no header outside Chat"
            assert phone.locator(".titlebar").bounding_box()["height"] <= 60
            phone.wait_for_function("document.querySelector('#pj-switch').textContent.includes(TribeProjects.cur().name)")
            assert phone.locator("#pj-switch").is_visible() and phone.locator("#m2-face .pj-face").is_visible()
            no_overflow(phone, "home")

            # ---- Discord-mobile panel: swipe from the left edge opens circles + sections, swipe back closes
            cdp = ctx.new_cdp_session(phone)
            swipe(cdp, 4, 320)
            phone.wait_for_function("document.body.classList.contains('drawer-open')")
            assert phone.locator("#pj-strip").is_visible() and phone.locator('#pj-nav [data-nav="chat"]').is_visible()
            strip, nest = phone.locator("#pj-strip").bounding_box(), phone.locator("#nest").bounding_box()
            assert strip["x"] < nest["x"] and strip["width"] < 90, "circles column left of the section list"
            shot(phone, "panel")
            swipe(cdp, 300, 20)
            phone.wait_for_function("!document.body.classList.contains('drawer-open')")

            # ---- suggested tasks + take it
            st, t1 = api("/tasks", "POST", {"title": "Add coyote time to jumps", "status": "backlog"}, htok); assert st == 200, t1
            phone.click('#tabbar [data-nav="tasks"]')
            phone.wait_for_selector("#m2-sugg-tasks .m2-si", timeout=10000)
            wait_text(phone, "#m2-sugg-tasks", "Add coyote time")
            shot(phone, "tasks")
            no_overflow(phone, "tasks")
            phone.click(f"#m2-sugg-tasks [data-st='{t1['task']['id']}'] [data-take]")
            for _ in range(50):
                t = next(x for x in api("/tasks", token=htok)[1]["tasks"] if x["id"] == t1["task"]["id"])
                if t.get("assignee") == maya: break
                time.sleep(0.1)
            assert t["assignee"] == maya and t["status"] == "doing", t
            # the orange action on Tasks: a quick task sheet
            phone.click("#m2-act"); phone.wait_for_selector("#m2-task-sheet #m2-qt-in")
            phone.fill("#m2-qt-in", "Lantern glow"); phone.press("#m2-qt-in", "Enter")
            phone.wait_for_selector("#m2-task-sheet", state="detached")
            for _ in range(30):
                if any(x["title"] == "Lantern glow" for x in api("/tasks", token=htok)[1]["tasks"]): break
                time.sleep(0.1)
            else: raise AssertionError("quick task not created")

            # ---- Chat: the rack moves into the top bar; composer + / mic / send
            phone.click('#tabbar [data-nav="chat"]')
            phone.wait_for_selector("#view-chat:not(.hidden) #chat-input", state="visible")
            phone.wait_for_function("document.querySelector('#tabbar').getBoundingClientRect().top < 60")
            assert phone.locator("#m2-me").is_hidden() and phone.locator("#m2-act").is_hidden(), "top bar is icons only"
            assert phone.locator("#m2-talk").is_visible() and phone.inner_text("#m2-talk") .strip().startswith("#general")
            assert phone.locator("#m2-plus").is_visible() and phone.locator("#m2-mic").is_visible() and phone.locator("#m2-send").is_hidden()
            comp = phone.locator("#composer-mount").bounding_box(); assert comp["y"] + comp["height"] > 800, comp
            phone.fill("#chat-input", "hello from the phone")
            assert phone.locator("#m2-send").is_visible() and phone.locator("#m2-mic").is_hidden(), "typing turns the mic into the send arrow"
            phone.click("#m2-send")
            wait_text(host, "#chat-list", "hello from the phone")
            no_overflow(phone, "chat")
            # "+" menu (app/ui/plusmenu.js): attach, propose, poll, task, Claude, reminder, note, bug; "Quick poll" only when votes.js is loaded
            phone.click("#m2-plus"); phone.wait_for_selector(".pl-pop.sheet .pl-menu")
            items = phone.eval_on_selector_all(".pl-menu [data-pl]", "els => els.map(e => e.dataset.pl)")
            assert items[:4] == ["attach", "propose", "poll", "task"] and ("claude" in items or "ai" in items), items
            shot(phone, "plus")
            phone.click(".pl-menu [data-pl='poll']")
            phone.wait_for_function("TribeVotes.isOpen()")
            phone.evaluate("TribeVotes.closeComposer()")
            # without votes.js the poll entry hides itself
            phone.evaluate("window.__tv = window.TribeVotes; window.TribeVotes = undefined")
            phone.click("#m2-plus"); phone.wait_for_selector(".pl-pop.sheet .pl-menu")
            assert "poll" not in phone.eval_on_selector_all(".pl-menu [data-pl]", "els => els.map(e => e.dataset.pl)")
            phone.evaluate("TribePlus.close(); window.TribeVotes = window.__tv"); phone.wait_for_selector(".pl-pop", state="detached")
            # photo
            img = Path(tmp, "lantern.png"); img.write_bytes(png(48, 32, (242, 107, 29)))
            phone.click("#m2-plus"); phone.wait_for_selector(".pl-menu [data-pl='attach']")
            with phone.expect_file_chooser() as fc: phone.click(".pl-menu [data-pl='attach']")
            fc.value.set_files(str(img))
            phone.wait_for_selector("#chat-list .msg .thumb img", timeout=10000)
            # recorder: start, pause, resume, delete → nothing sent
            n_voice = lambda: sum(1 for m in api("/chat/general?limit=200", token=htok)[1]["messages"] if (m.get("media") or {}).get("kind") == "voice")
            phone.click("#m2-mic"); phone.wait_for_selector("#m2-rec:not([hidden])")
            phone.wait_for_function("document.querySelector('#m2-rec-time').textContent !== '0:00'", timeout=5000)
            assert phone.locator("#m2-plus").is_hidden() and phone.locator("#chat-form").is_hidden(), "the recorder owns the composer"
            phone.click("#m2-rec-pause"); phone.wait_for_selector("#composer-mount.paused")
            t_paused = phone.inner_text("#m2-rec-time"); phone.wait_for_timeout(1300)
            assert phone.inner_text("#m2-rec-time") == t_paused, "paused time stands still"
            phone.click("#m2-rec-pause"); phone.wait_for_function("!document.querySelector('#composer-mount').classList.contains('paused')")
            phone.click("#m2-rec-del"); phone.wait_for_selector("#m2-rec", state="hidden")
            assert phone.locator("#m2-plus").is_visible() and n_voice() == 0
            # record → stop (preview) → send
            phone.click("#m2-mic"); phone.wait_for_timeout(1600)
            shot(phone, "recorder")
            phone.click("#m2-rec-stop"); phone.wait_for_selector("#composer-mount.preview")
            assert phone.locator("#m2-rec-play").is_visible() and phone.locator("#m2-rec-pause").is_hidden()
            phone.click("#m2-rec-send"); phone.wait_for_selector("#m2-rec", state="hidden")
            for _ in range(50):
                if n_voice() == 1: break
                time.sleep(0.1)
            assert n_voice() == 1, "voice note sent"
            phone.wait_for_selector("#chat-list .vn", timeout=8000)
            shot(phone, "chat")

            # ---- Talk to…: my Claude, Qwen brain, my desktop, #agents, #general, DMs
            phone.click("#m2-talk"); phone.wait_for_selector("#m2-talk-sheet")
            keys = phone.eval_on_selector_all("#m2-talk-sheet [data-talk]", "els => els.map(e => e.dataset.talk)")
            # Ask AI first (the tribe's AI, no Claude of your own needed); My Claude / My desktop only once you have a Claude
            assert keys[0] == "ai" and "agents" in keys and "general" in keys and f"dm:{orion}" in keys, keys
            shot(phone, "talk-to")
            phone.click("#m2-talk-sheet [data-talk='ai']")
            phone.wait_for_function("document.querySelector('#chat-input').value.startsWith('@ai')")
            phone.fill("#chat-input", "")
            # profile from the people list: add friend, network
            phone.click("#m2-talk"); phone.wait_for_selector(f"#m2-talk-sheet [data-prof='{orion}']")
            phone.click(f"#m2-talk-sheet [data-prof='{orion}']"); phone.wait_for_selector("#m2-profile [data-pf='friend']")
            assert phone.locator("#m2-profile [data-pf='ask']").is_disabled(), "no Claude connected for Orion"
            phone.click("#m2-profile [data-pf='friend']")
            phone.wait_for_selector("#m2-profile [data-pf='friend'][aria-pressed='true']")
            assert orion in phone.evaluate("JSON.parse(localStorage.getItem('tribecode.friends.v1'))")
            shot(phone, "profile")
            phone.click("#m2-profile [data-pf='net']"); wait_text(phone, "#m2-profile", "network")
            phone.click("#m2-profile [data-pf='main']"); phone.click("#m2-profile [data-pf='dm']")
            phone.wait_for_function("document.querySelector('#m2-talk-l').textContent === 'Orion'")
            phone.fill("#chat-input", "psst"); phone.click("#m2-send")
            for _ in range(40):
                dm = api(f"/chat/dm-{'-'.join(sorted([maya, orion]))}?limit=10", token=htok)[1].get("messages", [])
                if any(m["text"] == "psst" for m in dm): break
                time.sleep(0.1)
            else: raise AssertionError("DM not sent")
            phone.click("#m2-talk"); phone.click("#m2-talk-sheet [data-talk='general']")
            phone.wait_for_function("document.querySelector('#m2-talk-l').textContent === '#general'")
            # my own profile from the rack avatar (back outside Chat)
            phone.click('#tabbar [data-nav="docs"]')
            phone.click("#m2-me"); phone.wait_for_selector("#m2-profile [data-pf='settings']")
            assert "Maya" in phone.inner_text("#m2-profile .m2-pf-id")
            phone.evaluate("TribeMobile.closeSheet()")

            # ---- one-tap approvals with a comment
            st, ap = api("/approvals", "POST", {"title": "Merge feat/double-jump", "details": "Coyote time + double jump reset. 12 tests pass.", "risk": "medium"}, htok); assert st == 200, ap
            phone.wait_for_function("(() => { const b = document.querySelector('#tabbar [data-bd=\"updates\"]'); return b && !b.classList.contains('hidden') && b.textContent === '1'; })()", timeout=8000)
            # a long project name + a badge must not widen the page
            pid = phone.evaluate("TribeProjects.current()")
            assert api(f"/projects/{pid}", "PATCH", {"name": "The Extraordinarily Long Pixel Quest Adventure Project"}, htok)[0] == 200
            phone.wait_for_function("document.querySelector('#pj-switch').textContent.includes('Extraordinarily')", timeout=8000)
            for v in ["home", "chat", "docs"]:
                phone.evaluate(f"TribeApp.show('{v}')"); phone.wait_for_timeout(250)
                no_overflow(phone, f"{v} with a long name"); assert phone.evaluate("document.querySelector('#main').getBoundingClientRect().width <= innerWidth + 1"), v
            phone.click('#tabbar [data-m2nav="updates"]')
            card = f"#view-updates .m2-ap[data-ap='{ap['approval']['id']}']"
            phone.wait_for_selector(card)
            assert phone.locator('#tabbar [data-m2nav="updates"]').get_attribute("class") == "on"
            phone.click(f"{card} [data-note]"); phone.fill(f"{card} textarea", "Ship it, nice work")
            shot(phone, "approvals")
            no_overflow(phone, "updates")
            phone.click(f"{card} [data-decide='approve']")
            for _ in range(40):
                a = api(f"/approvals/{ap['approval']['id']}", token=htok)[1]["approval"]
                if a["status"] != "pending": break
                time.sleep(0.1)
            assert a["status"] == "approved" and a["note"] == "Ship it, nice work" and a["decidedBy"] == maya, a
            phone.wait_for_selector("#view-updates .m2-decided .m2-ap.approved")
            # Updates is reachable from the panel too
            phone.click("#tabbar [data-m2nav='updates']"); phone.wait_for_selector("#view-updates:not(.hidden)")

            # ---- Docs hub: the pinned repo hero (Flare thumbnail), living notes, files, screenshots
            def hero_kind(kind):
                phone.evaluate("TribeRepoHero.refresh().then(() => TribeMobile.refresh())")
                phone.wait_for_function("k => { const h = document.querySelector('#m2-repo-hero'); return h && h.dataset.kind === k; }", arg=kind, timeout=10000)
            phone.click('#tabbar [data-nav="docs"]')
            phone.wait_for_selector("#m2-docs-hub #m2-repo-hero")
            assert api("/thumb", token=mtok)[1]["thumb"]["kind"] == "tile", "no README image, no screenshot → tile"
            hero_kind("tile")
            assert phone.locator("#m2-repo-hero .rhx-tile").inner_text().strip() == "PQ"
            shot(phone, "repo-tile")
            wait_text(phone, "#m2-repo-hero", "first level")       # the last commit
            wait_text(phone, "#m2-repo-hero", "main")              # the branch
            assert phone.locator("#m2-repo-hero .eyebrow").inner_text().strip().upper() == "PINNED REPO"
            # a screenshot of the running app → the hero shows it
            st, _ = api("/visuals", "POST", {"screen": "level-1", "png_base64": __import__("base64").b64encode(png(320, 180, (56, 198, 177))).decode()}, htok); assert st == 200, _
            assert api("/thumb", token=mtok)[1]["thumb"]["kind"] == "screenshot"
            hero_kind("screenshot")
            phone.wait_for_function("(() => { const i = document.querySelector('#m2-repo-hero .rhx-art img'); return i && i.complete && i.naturalWidth === 320; })()")
            phone.wait_for_selector("#m2-shots .m2-shot img")
            shot(phone, "repo-screenshot")
            # README with an image → the hero shows the README art (relative path, served from inside the repo only)
            Path(repo, "art").mkdir(); Path(repo, "art", "cover.png").write_bytes(png(400, 200, (108, 124, 255)))
            Path(repo, "README.md").write_text("# Pixel Quest\n\n[![build](https://img.shields.io/badge/build-passing-green)](x)\n\n![Pixel Quest cover](art/cover.png)\n\nA tiny platformer.\n")
            th = api("/thumb", token=mtok)[1]["thumb"]
            assert th["kind"] == "readme" and "art%2Fcover.png" in th["src"], th
            hero_kind("readme")
            phone.wait_for_function("(() => { const i = document.querySelector('#m2-repo-hero .rhx-art img'); return i && i.complete && i.naturalWidth === 400; })()")
            assert api("/thumb/file?p=..%2F..%2Fetc%2Fpasswd", token=mtok)[0] == 404 and api("/thumb/file?p=.git%2Fconfig", token=mtok)[0] == 404, "only images inside the repo"
            assert api("/thumb/file?p=art%2Fcover.png")[0] == 401, "members only"
            band = phone.evaluate("getComputedStyle(document.querySelector('#m2-repo-hero .rhx-band')).backgroundImage")
            assert band == "none", "solid band, no gradient"
            wait_text(phone, "#m2-docs-hub .m2-journal", "approved")   # the living notes journal picked up the approval
            assert phone.locator("#m2-files-h").is_visible() and phone.locator("#doc-list").is_visible()
            phone.evaluate("scrollTo(0, 0); document.querySelector('#main').scrollTop = 0")
            shot(phone, "docs")
            no_overflow(phone, "docs")
            phone.click("#m2-repo-hero")
            phone.wait_for_function("TribeApp.view() === 'repo'")

            # ---- reduced motion: no sheet animation
            rctx = b.new_context(**PHONE, reduced_motion="reduce"); rp = rctx.new_page(); watch(rp, "reduced")
            rp.goto(phone.url); rp.wait_for_function("window.TribeMobile && TribeClient.connected()", timeout=10000)
            rp.evaluate("TribeMobile.profile(TribeClient.state().me.id)"); rp.wait_for_selector("#m2-profile")
            assert rp.evaluate("getComputedStyle(document.querySelector('#m2-profile')).animationName") == "none"
            rctx.close()

            # ---- in-app browsers (Messenger…): an escape banner on the join page and the Pages friend link
            st, inv2 = api("/invites", "POST", {"maxUses": 3}, htok)
            ia = b.new_context(**{**PHONE, "user_agent": MESSENGER_UA}); iap = ia.new_page(); watch(iap, "messenger")
            iap.goto(f"{BASE}/join/{inv2['invite']['code']}")
            iap.wait_for_selector("#tc-inapp")
            wait_text(iap, "#tc-inapp", "Open in Safari")
            top = iap.locator(".jc").bounding_box()["y"]; bh = iap.locator("#tc-inapp").bounding_box()["height"]
            assert top >= bh - 1, "the page sits below the banner"
            shot(iap, "inapp")
            iap.goto(f"{BASE}/go.html#s={BASE}&c={inv2['invite']['code']}")
            iap.wait_for_selector("#tc-inapp"); wait_text(iap, "#view", "Join Campfire Crew")
            iap.wait_for_timeout(1300)
            assert "/go.html" in iap.url, "no auto-redirect inside an in-app browser"
            iap.click("#tc-ia-x"); assert iap.locator("#tc-inapp").count() == 0
            ia.close()
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Mobile 2 test passed")


if __name__ == "__main__":
    main()
