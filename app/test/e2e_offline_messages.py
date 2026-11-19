"""Offline messages (p7, app/ui/offlinechat.js + the outbox in tribe.js): a friend can keep writing while the host's computer
is off, and nothing is lost or sent twice.

A host, a friend on a computer (1300px) and a friend on a phone (/m/<key>/, 390px). The server stops. Then:
  - Messages shows one line above the composer ("Camp's computer is off or asleep · … will send when it's back") with the
    count of waiting messages, and the tribe's circles get a small dot; the composer is NOT greyed out and still says
    "Message the tribe…".
  - The friend sends in #general, in a DM and as a thread reply; the phone sends from its composer; a small picture waits
    too. Each shows at once as "Waiting to send" with a clock icon.
  - A reload keeps them (drawn again from the outbox).
  - The server comes back: everything arrives once, in order (the server keeps one message per client id), the waiting
    bubbles turn into real messages, the line and the dot go away.
  - A refusal (a channel the friend may not post in) shows "Didn't send · Try again · Delete".
  - Project icons are drawn in full colour (no filter on .pj-face.emo).
Usage: python app/test/e2e_offline_messages.py [--shots DIR]"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5590 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA)
PNG = "data:image/png;base64," + base64.b64encode(bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a2f5d6cc0000000049454e44ae426082")).decode()
errors = []
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'offline-{name}.png'))

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))

def texts(ch, tok):
    st, d = api(f"/chat/{ch}", token=tok); lst = d if isinstance(d, list) else (d.get("messages") or [])
    return [m for m in lst if "off-" in str(m.get("text")) or (m.get("media") or {}).get("kind") == "image" or m.get("images")]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-offline-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    def start(): return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    def up():
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=1); return
            except Exception: time.sleep(0.25)
        raise AssertionError("server did not start")
    srv = start(); up()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1300, "height": 820}); watch(host, "host")
            host.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            htok = host.evaluate("TribeStore.get().server.token"); inv = api("/invites", "POST", {"maxUses": 5}, htok)[1]["invite"]["code"]
            api("/projects/" + host.evaluate("TribeClient.project()"), "PATCH", {"emoji": "🌐"}, htok)
            st, q = api("/chat/general", "POST", {"text": "question for later"}, htok); assert st == 200, (st, q)

            fr = b.new_context(viewport={"width": 1300, "height": 820}).new_page(); watch(fr, "friend")
            fr.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")
            fr.goto(f"{BASE}/join/{inv}"); fr.wait_for_selector("#form:not(.hidden)"); fr.fill("#name", "Maya"); fr.click("#go")
            fr.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOfflineChat", timeout=20000)
            ph = b.new_context(**PHONE).new_page(); watch(ph, "phone")
            ph.goto(f"{BASE}/join/{inv}"); ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Jo"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet"); ph.click("#ins-later")
            ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOfflineChat", timeout=20000)
            hostId = host.evaluate("TribeClient.state().me.id")
            for pg in (fr, ph): pg.evaluate("TribeApp.show('chat')"); pg.wait_for_timeout(600)

            # icons: full colour
            f = fr.evaluate("(() => { const e = document.querySelector('.pj-face.emo'); return e ? getComputedStyle(e).filter : 'missing'; })()")
            assert f in ("none", "missing"), f"project icons are not dimmed: {f}"
            assert fr.locator("#chat-offline").count() == 0, "no offline line while online"

            # the app saves what it loaded, so it can open whole later with the host off
            for pg in (fr, ph): pg.wait_for_function("caches.match(new URL('dm.js', location.href).href).then(r => !!r) && caches.match(new URL('lessons.js', location.href).href).then(r => !!r)", timeout=30000, polling=1000)
            # ---------- the host's computer goes off ----------
            srv.terminate(); srv.wait()
            for pg in (fr, ph): pg.wait_for_selector("#chat-offline", timeout=15000)
            bar = fr.inner_text("#chat-offline"); assert "Camp's computer is off or asleep" in bar and "will send when" in bar, bar
            assert fr.evaluate("document.body.classList.contains('tribe-off') && !!document.querySelector('.pj-circle[data-off-tip]')"), "a dot on the tribe's circle"
            dot = fr.evaluate("getComputedStyle(document.querySelector('.pj-circle[data-off-tip]'), '::after').content"); assert dot not in ("none", "normal", ""), dot
            assert not fr.evaluate("document.querySelector('#chat-form').classList.contains('disabled')"), "the composer is not greyed out"
            assert fr.get_attribute("#chat-input", "placeholder") == "Message the tribe…", fr.get_attribute("#chat-input", "placeholder")

            # #general, then a thread reply, from the friend's computer
            fr.fill("#chat-input", "off-1 general"); fr.press("#chat-input", "Enter")
            el = fr.locator("#chat-list .msg.dx", has_text="question for later").last; el.hover(); el.locator(".msg-more").click(); fr.click("#msg-menu [data-act='reply']")
            fr.fill("#chat-input", "off-2 reply"); fr.press("#chat-input", "Enter")
            fr.wait_for_function("document.querySelectorAll('#chat-list .msg.pending').length === 2")
            st_txt = fr.inner_text("#chat-list .msg.pending .msg-state"); assert "Waiting to send" in st_txt, st_txt
            assert fr.locator("#chat-list .msg.pending .msg-state svg").count() >= 1, "a clock icon"
            # a DM to the host
            dm = fr.evaluate("TribeDM.channelWith(%r)" % hostId); fr.evaluate("id => TribeDM.open(id)", hostId); fr.wait_for_timeout(800)
            fr.fill("#chat-input", "off-3 dm"); fr.press("#chat-input", "Enter")
            fr.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pending')].some(x => x.textContent.includes('off-3 dm'))", timeout=5000)   # a DM written offline shows in the DM
            # a small picture (offline: it waits in the outbox)
            fr.evaluate("""async (png) => { const b = await (await fetch(png)).blob(); await window.TribeChatRich.sendImages([new File([b], 'dot.png', { type: 'image/png' })]); }""", PNG) if fr.evaluate("!!(window.TribeChatRich && TribeChatRich.sendImages)") else None
            fr.wait_for_timeout(400)
            n_wait = fr.evaluate("TribeClient.outbox().length"); assert n_wait >= 3, n_wait
            fr.wait_for_function("document.querySelector('#chat-offline') && /\\d+ messages will send/.test(document.querySelector('#chat-offline').innerText)", timeout=5000)
            # the phone
            ph.fill("#chat-input", "off-4 phone"); ph.press("#chat-input", "Enter")
            ph.wait_for_selector("#chat-list .msg.pending", timeout=5000)
            sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll on the phone: {sw}"
            shot(ph, "phone-390"); shot(fr, "desk-1300")

            # ---------- a channel switch away and back draws the waiting messages again ----------
            fr.evaluate("TribeDM.back ? TribeDM.back() : null"); fr.wait_for_timeout(500)
            fr.evaluate("id => TribeDM.open(id)", hostId); fr.wait_for_timeout(600); fr.evaluate("TribeDM.back()"); fr.wait_for_timeout(1000)
            dbg = fr.evaluate("({cur: TribeDM.current(), ob: TribeClient.outbox().map(i => i.ch + ':' + (i.body.text || i.label)), pend: [...document.querySelectorAll('.msg.pending')].map(x => x.parentElement.id + ':' + x.textContent.slice(0, 30))})")
            assert fr.locator("#chat-list .msg.pending", has_text="off-1 general").count() == 1 and fr.locator("#chat-list .msg.pending", has_text="off-2 reply").count() == 1, ("waiting messages are drawn again", dbg)

            # ---------- a reload while still offline: the outbox is kept; the app opens from its saved copy when it can ----------
            box_before = fr.evaluate("TribeClient.outbox().map(i => i.body.cid)")
            fr.reload(); fr.wait_for_timeout(2500)
            if fr.evaluate("!!(window.TribeClient && window.TribeDM && window.TribeApp)"):
                fr.evaluate("TribeApp.show('chat')")
                fr.wait_for_function("document.querySelectorAll('#chat-list .msg.pending').length >= 2", timeout=10000)
                assert fr.evaluate("TribeClient.outbox().map(i => i.body.cid)") == box_before, "the outbox survives a reload"
                print("ok  reload while offline: the app opened from its saved copy and drew the waiting messages again")
                reopened = False
            else:
                print("..  the page could not open offline here (plain localhost); the outbox is checked after the tribe is back")
                reopened = True

            # ---------- the host is back ----------
            srv = start(); up()
            if reopened:   # the reloaded page comes back with the outbox it had in this browser
                fr.goto(BASE + "/?skipIntro=1"); fr.wait_for_function("window.TribeClient && window.TribeApp", timeout=20000); fr.evaluate("TribeApp.show('chat')")
            for pg in (fr, ph): pg.wait_for_function("TribeClient.connected() && TribeClient.outbox().length === 0", timeout=30000)
            for pg in (fr, ph): pg.wait_for_selector("#chat-offline", state="detached", timeout=20000)
            assert not fr.evaluate("document.body.classList.contains('tribe-off')"), "the dot is gone"
            time.sleep(1)
            gen = [m["text"] for m in texts("general", htok)]
            assert gen.count("off-1 general") == 1 and gen.count("off-2 reply") == 1 and gen.count("off-4 phone") == 1, gen
            assert gen.index("off-1 general") < gen.index("off-2 reply"), "in order"
            reply = next(m for m in texts("general", htok) if m["text"] == "off-2 reply"); assert reply.get("replyTo"), "the reply kept its thread"
            dms = [m["text"] for m in texts(dm, htok)]; assert dms.count("off-3 dm") == 1, dms
            assert sum(1 for m in texts(dm, htok) if (m.get("media") or {}).get("kind") == "image") == 1, ("the picture sent in the DM arrived once", texts(dm, htok))
            fr.wait_for_function("document.querySelectorAll('#chat-list .msg.pending').length === 0", timeout=20000)
            assert fr.locator("#chat-list .msg", has_text="off-1 general").count() == 1, "no duplicate on screen"

            # ---------- a refusal: Didn't send · Try again · Delete ----------
            fr.evaluate("TribeApp.sendQueued('general', '/chat/__nope__/send', { text: 'off-5 refused' })")
            fr.wait_for_selector("#chat-list .msg.pending.failed", timeout=20000)
            t = fr.inner_text("#chat-list .msg.pending.failed .msg-state"); assert "Didn't send" in t and "Try again" in t and "Delete" in t, t
            fr.click("#chat-list .msg.pending.failed [data-drop]"); assert fr.locator("#chat-list .msg.pending.failed").count() == 0
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e and "Failed to fetch" not in e]
        assert not bad, bad
        print("e2e_offline_messages: all ok")
    finally:
        try: srv.terminate()
        except Exception: pass

if __name__ == "__main__":
    main()
