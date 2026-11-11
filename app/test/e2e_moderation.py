"""Safety for the app stores (docs/APP-STORE.md, App Store 1.2 + 5.1.1(v)): report and block from a chat message and a
profile, the blocked person's messages hidden (and back after Unblock, kept across a reload), reports visible to the host
in Settings › Privacy & safety, the host's word filter, the host can't be blocked, and Delete my account (no accounts API
yet: it explains and clears this device). Screenshot: docs/screenshots/moderation.png.
Usage: python3 app/test/e2e_moderation.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6160 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=20) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r):
    assert r[0] == 200, r
    return r[1]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-mod-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hc = b.new_context(viewport={"width": 1280, "height": 820}); host = hc.new_page(); host.on("pageerror", lambda e: errors.append("host " + str(e)))
            host.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}})) } catch (e) {}")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            htok = host.evaluate("TribeStore.get().server.token"); hid = host.evaluate("TribeClient.state().me.id")
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 10, "role": "builder"}, htok))["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya", "color": "#6C7CFF"})); maya, mid = j["token"], j["member"]["id"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"})); sam, sid = j["token"], j["member"]["id"]

            # the API: nobody blocked yet, staff flags, the host can't be blocked, you can't report yourself
            assert ok(api("/moderation", token=sam)) ["blocks"] == []
            assert ok(api("/moderation", token=htok))["staff"] is True and ok(api("/moderation", token=sam))["staff"] is False
            st, r = api("/moderation/block", "PUT", {"id": hid, "on": True}, sam); assert st == 400 and "host" in r["error"].lower(), r
            assert api("/moderation/report", "POST", {"kind": "member", "target": sid, "reason": "spam"}, sam)[0] == 400
            assert api("/moderation/reports/x", "POST", {"status": "resolved"}, sam)[0] == 403   # people can't handle reports

            # the host's word filter masks words as a message is posted
            ok(api("/moderation/filter", "PUT", {"words": "bananas\nwombat"}, htok))
            assert api("/moderation/filter", "PUT", {"words": ["x"]}, sam)[0] == 403
            ok(api("/chat/general", "POST", {"text": "I like Bananas and kiwis"}, maya))
            ok(api("/chat/general", "POST", {"text": "Level 2 is coming along, the fog looks right"}, maya))
            last = [m for m in api("/chat/general?limit=50", token=sam)[1]["messages"] if m["by"] == mid]
            assert any(m["text"] == "I like ••••••• and kiwis" for m in last), [m["text"] for m in last]
            ok(api("/moderation/filter", "PUT", {"words": []}, htok))

            # ---- Sam's browser ----
            sc = b.new_context(viewport={"width": 1280, "height": 820}); pg = sc.new_page(); pg.on("pageerror", lambda e: errors.append("sam " + str(e)))
            seed = json.dumps({"name": "Sam", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": sam}})
            sc.add_init_script(f"try {{ if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', {json.dumps(seed)}) }} catch (e) {{}}")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeModeration", timeout=20000)
            pg.evaluate("TribeApp.show('chat')")
            sel = f'#chat-list .msg[data-by="{mid}"]'
            pg.wait_for_selector(sel, timeout=10000)
            row = pg.locator(sel).last
            row.hover(); row.locator(".msg-more").click(force=True)
            pg.wait_for_selector("#msg-menu [data-modx='report-msg']")
            assert "Block Maya" in pg.inner_text("#msg-menu")
            pg.click("#msg-menu [data-modx='report-msg']")
            pg.wait_for_selector("#mod-dlg .mod-reasons")
            assert "fog looks right" in pg.inner_text("#mod-dlg .mod-quote")
            pg.check("#mod-dlg input[value='harassment']"); pg.fill("#mod-dlg textarea[name='note']", "Keeps posting this at 3am")
            pg.wait_for_timeout(250); pg.screenshot(path=str(SHOTS / "moderation.png"))
            pg.click("#mod-dlg button[type='submit']")
            pg.wait_for_function("document.querySelector('#mod-dlg') && document.querySelector('#mod-dlg').innerText.includes('Thanks for telling us')", timeout=8000)
            reps = ok(api("/moderation", token=htok))["reports"]
            assert reps and reps[0]["target"] == mid and reps[0]["reason"] == "harassment" and reps[0]["by"] == sid and reps[0]["ref"], reps[0]
            assert "fog" in reps[0]["excerpt"] and reps[0]["note"].startswith("Keeps posting")

            # "Block Maya" right from the thank-you: her messages disappear
            pg.click("#mod-dlg [data-modx='block']")
            pg.wait_for_function(f"TribeModeration.isBlocked('{mid}')", timeout=5000)
            pg.wait_for_function(f"[...document.querySelectorAll('{sel}')].every(e => getComputedStyle(e).display === 'none')", timeout=5000)
            assert ok(api("/moderation", token=sam))["blocks"] == [mid]
            # a new message from her stays hidden too; others' messages still show
            ok(api("/chat/general", "POST", {"text": "are you there?"}, maya)); ok(api("/chat/general", "POST", {"text": "host here"}, htok))
            pg.wait_for_function("[...document.querySelectorAll('#chat-list .msg')].some(m => m.innerText.includes('host here'))", timeout=8000)
            assert pg.evaluate(f"[...document.querySelectorAll('{sel}')].filter(e => e.offsetParent).length") == 0
            # kept across a reload (stored on the server)
            pg.reload(); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeModeration && TribeModeration.blocked().length === 1", timeout=20000)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-list .msg", timeout=10000)
            assert pg.evaluate(f"[...document.querySelectorAll('{sel}')].filter(e => e.offsetParent).length") == 0

            # profile menu: Report… and Unblock
            pg.evaluate(f"TribeProfiles.open('{mid}')"); pg.wait_for_selector("#pf-pop .pf-more", timeout=8000)
            pg.click("#pf-pop .pf-more"); pg.wait_for_selector("#pf-menu2 [data-modx='report-member']")
            assert pg.inner_text("#pf-menu2 [data-modx='block']").strip() == "Unblock"
            pg.click("#pf-menu2 [data-modx='report-member']"); pg.wait_for_selector("#mod-dlg .mod-reasons")
            assert "Report Maya" in pg.inner_text("#mod-dlg h2")
            pg.check("#mod-dlg input[value='spam']"); pg.click("#mod-dlg button[type='submit']")
            pg.wait_for_function("document.querySelector('#mod-dlg').innerText.includes('Thanks')", timeout=8000); pg.keyboard.press("Escape")
            assert len(ok(api("/moderation", token=htok))["reports"]) == 2

            # Settings › Privacy & safety: the blocked list, Unblock brings her back
            pg.evaluate("TribeSettings.open()"); pg.wait_for_selector("#set-safety", timeout=8000)
            pg.click("#set-safety"); pg.wait_for_selector("#mod-dlg.mod-safety [data-modx='unblock']", timeout=8000)
            assert "Maya" in pg.inner_text("#mod-dlg") and "Reports" not in pg.inner_text("#mod-dlg"), "people don't see reports"
            assert pg.locator("#mod-dlg a[href='privacy.html']").count() == 1
            pg.click("#mod-dlg [data-modx='unblock']")
            pg.wait_for_function(f"!TribeModeration.isBlocked('{mid}')", timeout=5000)
            pg.keyboard.press("Escape"); pg.evaluate("TribeSettings.close()")
            pg.evaluate("TribeApp.show('chat')")
            pg.wait_for_function(f"[...document.querySelectorAll('{sel}')].some(e => e.offsetParent)", timeout=8000)

            # the host: reports in Privacy & safety, resolve one
            host.evaluate("TribeSettings.open()"); host.wait_for_selector("#set-safety", timeout=8000)
            host.wait_for_function("document.querySelector('#set-safety') && document.querySelector('#set-safety').innerText.includes('2')", timeout=8000)
            host.click("#set-safety"); host.wait_for_selector("#mod-reports [data-rep]", timeout=8000)
            assert "Harassment" in host.inner_text("#mod-reports") and "Keeps posting" in host.inner_text("#mod-reports")
            host.locator("#mod-reports [data-to='resolved']").first.click()
            host.wait_for_function("document.querySelectorAll('#mod-reports [data-rep]').length === 2", timeout=5000)   # one open report left (2 buttons)
            assert sum(1 for r in ok(api("/moderation", token=htok))["reports"] if r["status"] == "resolved") == 1
            host.keyboard.press("Escape")

            # Delete my account: no accounts API on this server yet -> explains, then clears this device
            pg.evaluate("TribeModeration.deleteAccount()"); pg.wait_for_selector("#mod-dlg.mod-delete", timeout=8000)
            t = pg.inner_text("#mod-dlg"); assert "host's computer" in t and "this device" in t, t
            assert pg.is_disabled("#mod-del-go"); pg.fill("#mod-del-in", "delete"); assert not pg.is_disabled("#mod-del-go")
            pg.click("#mod-del-go")
            pg.wait_for_function("document.querySelector('#mod-dlg') && document.querySelector('#mod-dlg').innerText.includes('This device is clear')", timeout=10000)
            assert pg.evaluate("localStorage.length") == 0, "local data deleted"
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("e2e_moderation: OK (report, block, hidden messages, host reports, word filter, delete account)")

if __name__ == "__main__":
    main()
