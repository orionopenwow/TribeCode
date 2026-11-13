"""Where everyone is (feat/presence): places over the websocket, avatars on the place and its list rows, the People
panel (top bar) with Jump to, privacy (Show where I am, DMs only as "in messages"), last seen, the frame budget and the
phone sheet. Three browser users in one tribe: Ana (host), Ben and Cleo (phone).
Usage: python3 app/test/e2e_presence.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5470 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def frames(page, log):
    """record every websocket frame this page sends and receives: (dir, text)"""
    def on_ws(ws):
        if not ws.url.endswith("/ws") and "/ws?" not in ws.url: return
        ws.on("framesent", lambda f: log.append(("out", f if isinstance(f, str) else str(f))))
        ws.on("framereceived", lambda f: log.append(("in", f if isinstance(f, str) else str(f))))
    page.on("websocket", on_ws)

def kind(t):
    try: return json.loads(t).get("type")
    except Exception: return None

def main():
    shots = "--shots" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="tribe-pz-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(tmp / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pre = "try { localStorage.setItem('tribecode.settings.v1', JSON.stringify(%s)); } catch (e) {}"
            def page(name, token, vp=(1360, 860), phone=False):
                ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, is_mobile=phone, has_touch=phone)
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                st = {"name": name, "onboarded": True, "tour": {"done": True}, **({"server": {"url": BASE, "token": token}} if token else {})}
                pg.add_init_script(pre % json.dumps(st))
                return pg
            # Ana hosts (her page claims the empty tribe)
            A = page("Ana", None); alog = []; frames(A, alog)
            A.goto(BASE + "/?skipIntro=1"); A.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePresence && window.TribePeoplePanel", timeout=20000)
            atok = A.evaluate("TribeStore.get().server.token"); assert atok
            aid = A.evaluate("TribeClient.state().me.id")
            st, inv = api("/invites", "POST", {"role": "builder", "maxUses": 5}, token=atok); assert st == 200, inv
            st, ben = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Ben"}); assert st == 200, ben
            st, cleo = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Cleo"}); assert st == 200, cleo
            bid = ben["member"]["id"]
            st, d = api("/docs", "POST", {"title": "Launch plan", "body": "# Launch plan\n\nShip it."}, token=atok); assert st == 200, d
            slug = d["doc"]["slug"]
            B = page("Ben", ben["token"]); blog = []; frames(B, blog)
            B.goto(BASE + "/?skipIntro=1"); B.wait_for_function("TribeClient.connected() && window.TribePresence", timeout=20000)
            time.sleep(0.8)

            # 1) Ana opens the doc; Ben sees her avatar on the doc's row and "in Launch plan doc" in People
            A.evaluate(f"(async () => {{ TribeApp.show('docs'); await new Promise(r => setTimeout(r, 150)); await TribeDocs.open('{slug}'); }})()")
            A.wait_for_function(f"TribePresence.here().k === 'doc' && TribePresence.here().id === '{slug}'")
            B.evaluate("TribeApp.show('docs')")
            B.wait_for_function(f"(TribePresence.of('{aid}') || {{}}).id === '{slug}'", timeout=10000)
            B.wait_for_function(f"[...document.querySelectorAll(\"[data-slug='{slug}'] .pz-stack[data-pz-ids*='{aid}']\")].some(e => e.getClientRects().length)", timeout=10000)
            assert B.evaluate("document.querySelector('#ppl-btn').closest('.titlebar') !== null"), "People sits in the top bar"
            assert not B.evaluate("!!document.querySelector('#ppl-btn').closest('#tour-side, .side, #userbar')"), "not in the left pane"
            B.wait_for_function("document.querySelector('#ppl-n') && !document.querySelector('#ppl-n').hidden && +document.querySelector('#ppl-n').textContent >= 1")
            B.click("#ppl-btn"); B.wait_for_selector("#ppl-panel:not([hidden])")
            row = f"#ppl-body .ppl-row[data-mid='{aid}']"
            B.wait_for_function(f"(document.querySelector(\"{row}\") || {{}}).textContent && document.querySelector(\"{row}\").textContent.includes('in Launch plan doc')", timeout=10000)
            assert "Ana" in B.text_content(row) and "online" in B.text_content(row)
            # filters: AIs hides Ana, Online keeps her; search
            B.click("[data-f='ai']"); assert B.locator(row).count() == 0; B.click("[data-f='ai']")
            B.fill("#ppl-q", "launch"); time.sleep(0.2); assert B.locator(row).count() == 1; B.fill("#ppl-q", "zzz"); time.sleep(0.2); assert B.locator(row).count() == 0; B.fill("#ppl-q", ""); time.sleep(0.2)
            if shots:
                B.wait_for_timeout(300); B.screenshot(path=str(ROOT / "docs" / "screenshots" / "people-panel.png"))

            # 2) Jump to: Ben lands on the doc; both see each other there, and Ana gets "Ben is here"
            B.click(f"{row} .ppl-jump")
            B.wait_for_function(f"(TribeDocs.current() || {{}}).slug === '{slug}'", timeout=10000)
            assert B.evaluate("document.querySelector('#ppl-panel').hidden"), "panel closes on Jump to"
            B.wait_for_selector(f".pz-head.pz-stack[data-pz-ids*='{aid}']", timeout=10000)
            A.wait_for_selector(f".pz-head.pz-stack[data-pz-ids*='{bid}']", timeout=10000)
            A.wait_for_selector(".pz-hello", timeout=5000); assert "Ben is here" in A.text_content(".pz-hello")
            if shots:
                B.wait_for_timeout(400); B.screenshot(path=str(ROOT / "docs" / "screenshots" / "presence-doc.png"))

            # 3) frame budget: place frames are small, and typing sends none (nor presence fan-outs)
            n0 = len(alog); m0 = len(blog)
            A.click("#doc-body"); A.keyboard.type("Typing a whole sentence here does not move anyone.", delay=25)
            time.sleep(2.5)
            sent = [t for d_, t in alog[n0:] if d_ == "out" and kind(t) == "place"]
            got = [t for d_, t in blog[m0:] if d_ == "in" and kind(t) in ("place", "presence")]
            assert not sent, f"no place frames while typing: {sent}"
            assert not got, f"no presence/place frames reach Ben while Ana types: {[g[:80] for g in got]}"

            # 4) Ana moves to the website designer: the indicator moves
            A.evaluate("TribeSiteDesigner.open({ pid: TribeClient.project() })")
            B.wait_for_function(f"(TribePresence.of('{aid}') || {{}}).k === 'site'", timeout=10000)
            B.wait_for_selector(f".pz-head.pz-stack[data-pz-ids*='{aid}']", state="detached", timeout=10000)
            B.evaluate("TribePeoplePanel.open()"); B.wait_for_function(f"document.querySelector(\"{row}\").textContent.includes('in the website designer')")
            B.evaluate("TribePeoplePanel.close()")
            A.evaluate("TribeSiteDesigner.close()")

            # 5) a DM shows only as "in messages", to Ben and to Cleo (on a phone), and no frame names the DM
            C = page("Cleo", cleo["token"], vp=(390, 844), phone=True); clog = []; frames(C, clog)
            C.goto(BASE + "/?skipIntro=1")
            try: C.wait_for_selector("#ins-later", timeout=4000); C.click("#ins-later")
            except Exception: pass
            C.wait_for_function("TribeClient.connected() && window.TribePresence", timeout=20000)
            A.evaluate(f"TribeDM.open('{bid}')")
            A.wait_for_function("TribePresence.here().k === 'dm'")
            for X in (B, C):
                X.wait_for_function(f"(TribePresence.of('{aid}') || {{}}).k === 'dm'", timeout=10000)
                pl = X.evaluate(f"TribePresence.of('{aid}')"); assert pl["l"] == "messages" and not pl.get("id"), pl
            cdm = [t for d_, t in clog if d_ == "in" and kind(t) == "place" and aid in t]
            assert cdm and all("dm-" not in t and bid not in t for t in cdm), cdm
            C.click("#ppl-btn"); C.wait_for_selector("#ppl-panel:not([hidden])")
            C.wait_for_function(f"document.querySelector(\"{row}\").textContent.includes('in messages')", timeout=10000)
            assert C.locator(f"{row} .ppl-jump").count() == 0, "no Jump to into someone's DM"
            # phone: a full-screen sheet, no sideways scroll
            box = C.evaluate("(() => { const r = document.querySelector('#ppl-panel').getBoundingClientRect(); return [r.left, r.top, r.width, r.height, innerWidth, innerHeight, document.documentElement.scrollWidth]; })()")
            assert box[0] == 0 and box[2] >= box[4] - 1 and box[3] >= box[5] - 2 and box[6] <= box[4] + 1, box
            if shots: C.screenshot(path=str(tmp / "phone.png"))
            C.evaluate("TribePeoplePanel.close()")

            # 6) "Show where I am" off (Settings): Ben sees Ana online, without a place
            A.evaluate("TribeApp.show('chat'); TribeDM.back && TribeDM.back()")
            B.wait_for_function(f"(TribePresence.of('{aid}') || {{}}).k === 'chat'", timeout=10000)
            A.evaluate("TribeSettings.open()"); A.wait_for_selector("#pz-show", timeout=10000)
            assert A.is_checked("#pz-show"), "on by default"
            A.click("#pz-show")
            B.wait_for_function(f"TribePresence.of('{aid}') === null", timeout=10000)
            B.evaluate("TribePeoplePanel.open()")
            t = B.text_content(row); assert "online" in t and "#general" not in t and " in " not in t.split("online", 1)[1], t
            assert api("/places", token=ben["token"])[1]["places"].get(aid) is None
            assert not any(m.get("where") for m in api("/members", token=ben["token"])[1]["members"] if m["id"] == aid), "the old where is hidden too"
            # Appear away
            A.click("#pz-away")
            B.wait_for_function(f"TribePresence.away('{aid}')", timeout=10000)
            B.wait_for_function(f"document.querySelector(\"{row}\").textContent.includes('away')")
            A.click("#pz-away"); A.click("#pz-show")
            B.wait_for_function(f"!!TribePresence.of('{aid}')", timeout=10000)
            B.evaluate("TribePeoplePanel.close()")

            # 7) every place frame stayed within 512 bytes
            allp = [t for lg in (alog, blog, clog) for _, t in lg if kind(t) == "place"]
            assert allp and max(len(t.encode()) for t in allp) <= 512, max(len(t.encode()) for t in allp)

            # 8) Ctrl K: People and "Where is Ana?"
            B.keyboard.press("Escape"); B.evaluate("TribePalette.open()"); B.keyboard.type("where is ana")
            B.wait_for_function("[...document.querySelectorAll('#palette .pl-item, #palette [data-i], .palette li, .pal-item')].some(e => e.textContent.includes('Where is Ana?')) || document.body.textContent.includes('Where is Ana?')", timeout=5000)
            B.keyboard.press("Escape")

            # 9) Ana leaves: offline with last seen
            A.context.close()
            B.wait_for_function(f"!(TribeClient.state().members.find(m => m.id === '{aid}') || {{}}).online", timeout=15000)
            assert B.evaluate(f"TribePresence.of('{aid}')") is None and B.evaluate(f"TribePresence.seen('{aid}')")
            B.evaluate("TribePeoplePanel.open()")
            B.wait_for_function(f"document.querySelector(\"{row}\").textContent.includes('last seen')", timeout=5000)
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("e2e_presence: OK (places, row and header avatars, People panel + Jump to, privacy, DMs, budget, last seen, phone)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-3000:]); raise
    finally:
        try: srv.terminate(); srv.wait(10)
        except Exception: pass

if __name__ == "__main__":
    main()
