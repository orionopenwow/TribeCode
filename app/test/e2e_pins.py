"""End-to-end: comment pins + presence on the live preview (P1-E: server/pins.js, app/ui/pins.js, cursors.js follow).

Orion presses C on the preview and clicks the heading: a pin with "@Sam" lands. Sam sees it live in his preview and
gets a mention in his Inbox; his reply shows up live in Orion's open thread and Orion gets a comment-reply. Resolve and
the list filters (Open / Resolved / Mine), the pin survives a reload and a layout change (it follows the element),
Claude Code reads and answers it over MCP (list_pins, add_pin_reply, resolve_pin), the Inbox item opens the pin,
follow mode (Sam follows Orion's scroll), spectators can't comment, and the 390px phone sheet.
Usage: python app/test/e2e_pins.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4871 + OFF
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
SHOTDIR = Path(os.environ.get("PIN_SHOTS", str(ROOT / "docs" / "screenshots")))
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None, project=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    h = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def shot(page, name):
    if take:
        SHOTDIR.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(500); page.screenshot(path=str(SHOTDIR / f"pins-{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid, color):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Cafe</title>
<style>body{margin:0;font:16px system-ui;background:#fff;color:#111} header{padding:40px} .tall{height:2400px;background:#f4f4f4} #order{margin:40px}</style></head>
<body>BANNER<header><h1 id="hero">Fresh bread daily</h1><p class="sub">Open 7 to 3</p></header><section class="tall"></section><button id="order">Order now</button></body></html>"""


def make_repo(path, files):
    os.makedirs(path, exist_ok=True)
    for rel, txt in files.items(): Path(path, rel).write_text(txt)
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def open_preview(page):
    page.evaluate("TribePreview.open()")
    page.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
    page.wait_for_function("document.querySelector('#pvw').classList.contains('ready')", timeout=10000)
    page.wait_for_selector("#pvw .pin-cbtn", timeout=5000)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-pins-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="pins-src-", dir="/tmp")
    cafe = os.path.join(work, "cafe")
    make_repo(cafe, {"index.html": PAGE.replace("BANNER", "")})
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pin Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": cafe}, token=orion), "project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": None}, token=orion))["invite"]
        sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}))["token"]
        orion_id = ok(api("/me", token=orion))["member"]["id"]

        # ---------------- API basics ----------------
        st, d = api("/pins", "POST", {"surface": "preview", "target": {}, "text": "  "}, token=orion, project=pid); assert st == 400, (st, d)
        st, d = api("/pins/p-nope/reply", "POST", {"text": "x"}, token=orion, project=pid); assert st == 404, (st, d)
        assert ok(api("/pins", token=sam, project=pid))["pins"] == []

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            co = b.new_context(viewport={"width": 1440, "height": 900}); co.add_init_script(settings_js("Orion", orion, pid, "#F26B1D"))
            cs = b.new_context(viewport={"width": 1440, "height": 900}); cs.add_init_script(settings_js("Sam", sam, pid, "#38C6B1"))
            o = co.new_page(); watch(o, "orion"); s = cs.new_page(); watch(s, "sam")
            for pg in (o, s):
                pg.goto(BASE + "/?skipIntro=1")
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            open_preview(o); open_preview(s)

            # presence: each sees the other's avatar in the preview bar
            o.wait_for_selector("#pvw .pin-vw", timeout=8000); s.wait_for_selector("#pvw .pin-vw", timeout=8000)

            # ---- Orion: C, click the heading, write with an @mention ----
            o.click("#pvw-stage"); o.keyboard.press("c")
            o.wait_for_function("document.querySelector('#pvw').classList.contains('pin-commenting')", timeout=3000)
            assert o.is_visible("#pvw .pin-hint"), "comment mode shows its hint"
            fr = o.frame_locator("#pvw-iframe")
            fr.locator("#hero").click(position={"x": 30, "y": 10})
            o.wait_for_selector(".pin-pop--new textarea", timeout=5000)
            assert "h1" in o.inner_text(".pin-pop .pin-on"), "the composer names the picked element"
            o.fill(".pin-pop textarea", "Make this heading bigger @Sa")
            o.wait_for_selector(".pin-mention:not(.hidden) [data-name='Sam']", timeout=3000)   # the @ picker
            o.dispatch_event(".pin-mention [data-name='Sam']", "mousedown")
            assert "@Sam" in o.input_value(".pin-pop textarea"), o.input_value(".pin-pop textarea")
            o.press(".pin-pop textarea", "Enter")
            o.wait_for_selector("#pvw .pin-mk", timeout=5000)
            assert not o.evaluate("document.querySelector('#pvw').classList.contains('pin-commenting')"), "comment mode ends after a pin"
            o.wait_for_selector(".pin-pop .pin-th li", timeout=5000)   # the new thread opens
            pins = ok(api("/pins", token=orion, project=pid))["pins"]
            assert len(pins) == 1 and pins[0]["target"]["sel"].endswith("#hero") or "#hero" in pins[0]["target"]["sel"], pins
            pin_id = pins[0]["id"]
            # the marker sits on the heading (layer coords include the scale of the device frame)
            def mk_box(pg):
                return pg.evaluate("(() => { const m = document.querySelector('#pvw .pin-mk'), h = document.querySelector('#pvw-iframe'); const r = m.getBoundingClientRect(), f = h.getBoundingClientRect(); return { x: r.left - f.left, y: r.bottom - f.top, s: f.width / h.offsetWidth }; })()")
            bx = mk_box(o)
            assert 20 < bx["y"] / bx["s"] < 140, bx   # the heading is ~40-80px from the top of the page
            shot(o, "thread")

            # ---- Sam: live marker + mention in the Inbox ----
            s.wait_for_selector("#pvw .pin-mk", timeout=8000)
            s.wait_for_function("document.querySelector('#pvw .pin-count') && document.querySelector('#pvw .pin-count').textContent === '1'", timeout=5000)
            inbox = ok(api("/notify/inbox", token=sam))["items"]
            assert any(i["type"] == "mention" and i["view"] == "pins" and i["ref"] == f"{pid}:{pin_id}" for i in inbox), inbox
            s.click("#pvw .pin-mk"); s.wait_for_selector(".pin-pop .pin-th li", timeout=5000)
            assert "bigger" in s.inner_text(".pin-pop .pin-th") and s.locator(".pin-pop .pin-at").count() == 1
            s.fill(".pin-pop textarea", "On it, making it 48px"); s.press(".pin-pop textarea", "Enter")
            s.wait_for_function("document.querySelectorAll('.pin-pop .pin-th li').length === 2", timeout=5000)
            o.wait_for_function("document.querySelectorAll('.pin-pop .pin-th li').length === 2", timeout=8000)   # live in Orion's open thread
            o.wait_for_selector("#pvw .pin-mk em", timeout=5000)   # reply count badge
            assert any(i["type"] == "comment-reply" for i in ok(api("/notify/inbox", token=orion))["items"]), "Orion gets the reply"

            # ---- the list: Open / Mine / Resolved, then resolve ----
            o.click("#pvw [data-pin-act='list']"); o.wait_for_selector("#pvw .pin-list li [data-open]", timeout=5000)
            o.click("#pvw .pin-list [data-filter='mine']"); assert o.locator("#pvw .pin-list [data-open]").count() == 1
            o.click("#pvw .pin-list [data-open]"); o.wait_for_selector(".pin-pop .pin-th li", timeout=5000)   # the list item opens the thread
            shot(o, "list")
            o.click(".pin-pop [data-res]")
            o.wait_for_function("(() => { const r = document.querySelector('.pin-pop .pin-resby'); return !!r; })()", timeout=5000)
            assert ok(api("/pins", token=orion, project=pid))["pins"][0]["resolved"] is True
            o.click("#pvw .pin-list [data-filter='open']"); o.wait_for_selector("#pvw .pin-list .pin-none", timeout=3000)
            o.click("#pvw .pin-list [data-filter='resolved']"); assert o.locator("#pvw .pin-list [data-open]").count() == 1
            o.click("#pvw .pin-list [data-close]")
            s.wait_for_function("!document.querySelector('#pvw .pin-mk') || document.querySelector('#pvw .pin-count').classList.contains('hidden')", timeout=8000)   # resolved pins leave the page for Sam too

            # ---- MCP: Sam's Claude Code reads and answers ----
            ag = ok(api("/agents", "POST", token=sam, project=pid), "agent")
            key = ag.get("token") or ag.get("key") or (ag.get("agent") or {}).get("token")
            assert key, ag
            err, txt = mcp(key, "list_pins", {}, project=pid); assert not err and "No open comments" in txt, txt
            err, txt = mcp(key, "list_pins", {"state": "all"}, project=pid); assert not err and pin_id in txt and "bigger" in txt and "#hero" in txt, txt
            err, txt = mcp(key, "resolve_pin", {"id": pin_id, "resolved": False}, project=pid); assert not err and "open again" in txt, txt
            err, txt = mcp(key, "add_pin_reply", {"id": pin_id, "text": "Done: heading is 48px now"}, project=pid); assert not err, txt
            err, txt = mcp(key, "add_pin_reply", {"id": "p-nope", "text": "x"}, project=pid); assert err, txt
            o.wait_for_selector("#pvw .pin-mk", timeout=8000)   # reopened: back on the page, live
            pin = ok(api(f"/pins/{pin_id}", token=orion, project=pid))["pin"]
            assert len(pin["thread"]) == 3 and pin["resolved"] is False and "48px" in pin["thread"][-1]["text"], pin

            # ---- persists + follows the element after a layout change ----
            before = mk_box(o)["y"] / mk_box(o)["s"]
            Path(cafe, "index.html").write_text(PAGE.replace("BANNER", '<div style="height:220px;background:#eee">Big new banner</div>'))
            o.wait_for_timeout(1500)
            o.reload(); o.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            open_preview(o)
            o.frame_locator("#pvw-iframe").locator("text=Big new banner").wait_for(timeout=8000)
            o.wait_for_selector("#pvw .pin-mk", timeout=8000)
            o.wait_for_timeout(300)
            after = mk_box(o)["y"] / mk_box(o)["s"]
            assert after - before > 150, (before, after)   # moved down with the heading
            assert not o.evaluate("document.querySelector('#pvw .pin-mk').classList.contains('is-gone')")

            # ---- the Inbox item opens the pin ----
            o.evaluate("TribePreview.close()"); o.wait_for_timeout(300)
            o.evaluate("TribePins.openRef(%r)" % f"{pid}:{pin_id}")
            o.wait_for_selector(".pin-pop .pin-th li", timeout=10000)
            assert "48px" in o.inner_text(".pin-pop .pin-th")
            o.keyboard.press("Escape")

            # ---- follow mode: Sam follows Orion's scroll ----
            s.reload(); s.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000); open_preview(s)
            s.wait_for_selector(f"#pvw .pin-vw[data-follow='{orion_id}']" if orion_id else "#pvw .pin-vw", timeout=8000)
            s.click("#pvw .pin-vw")
            s.wait_for_selector("#pvw .pin-following:not(.hidden)", timeout=3000)
            assert "Orion" in s.inner_text("#pvw .pin-following")
            o.frame_locator("#pvw-iframe").locator("body").evaluate("() => window.scrollTo(0, 1500)")
            sy = 0
            for _ in range(40):
                sy = s.frame_locator("#pvw-iframe").locator("body").evaluate("() => window.scrollY")
                if sy > 600: break
                s.wait_for_timeout(150)
            assert sy > 600, f"Sam's preview follows Orion's scroll (scrollY={sy})"
            shot(s, "follow")
            s.click("#pvw .pin-following [data-pin-act='unfollow']")
            assert s.is_hidden("#pvw .pin-following")
            assert s.evaluate("TribeCursors.following()") is None

            # ---- spectators can't comment ----
            inv3 = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": pid, "role": "spectator"}, token=orion))["invite"]
            spec = api("/join", "POST", {"code": inv3["code"], "name": "Vee"})
            if spec[0] == 200:
                st, d = api("/pins", "POST", {"surface": "preview", "target": {}, "text": "hi"}, token=spec[1]["token"], project=pid)
                role = ok(api("/me", token=spec[1]["token"]))["member"].get("role")
                if role == "spectator": assert st == 403, (st, d)

            # ---- phone: the preview sheet ----
            cp = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); cp.add_init_script(settings_js("Orion", orion, pid, "#F26B1D"))
            ph = cp.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            open_preview(ph)
            ph.wait_for_selector("#pvw .pin-mk", timeout=8000)
            ph.click("#pvw [data-pin-act='list']"); ph.wait_for_selector("#pvw .pin-list [data-open]", timeout=5000)
            w = ph.evaluate("document.querySelector('#pvw .pin-list').getBoundingClientRect().width")
            assert w >= 380, w
            ph.click("#pvw .pin-list [data-open]"); ph.wait_for_selector(".pin-pop .pin-th li", timeout=8000)
            r = ph.evaluate("(() => { const b = document.querySelector('.pin-pop').getBoundingClientRect(); return [b.left, b.right]; })()")
            assert r[0] >= 0 and r[1] <= 390, r
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll on the phone"
            shot(ph, "phone")
            b.close()

        real = [e for e in errors if "WebSocket" not in e and "net::" not in e]
        assert not real, real
        print("e2e_pins: OK (pin on preview, @mention -> inbox, live reply, list filters, resolve, MCP, persists + follows layout, inbox opens it, follow mode, phone)")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
