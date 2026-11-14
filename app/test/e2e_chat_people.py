"""Chat is for people (v0.37). Instructions meant for an AI go privately to the person's own agent and never post in a
channel; the person sees "Sent to your …" with their requests and the replies. A channel shows what people type, an
agent's reply when it was @mentioned, and one-line AI update cards of the kinds a lead chooses (finished, needs an OK,
build failed by default). Also: the larger invite sheet, and the way back to the main website."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5730 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("TRIBE_SHOTS") or tempfile.mkdtemp(prefix="tribe-cp-shots-", dir="/tmp")); SHOTS.mkdir(parents=True, exist_ok=True)
errors = []

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")
def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"; return r[1]
def tool(token, name, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]["content"][0]["text"]
def wait_until(fn, timeout=10, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError("timed out: " + what)
def msgs(tok): return ok(api("/chat/general?limit=200", token=tok))["messages"]
def texts(tok): return [m.get("text") or "" for m in msgs(tok)]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-cp-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait_until(lambda: api("/health")[0] == 200, 20, "server")
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]

        # ---- no agent of your own: the request waits for the tribe's agents; the channel gets one short line in the person's words
        r = ok(api("/ask/mine", "POST", {"text": "make a login screen", "detail": "On the design canvas. Use the canvas tools: get_canvas to read it.", "src": "canvas"}, token=maya), "ask with no agent")
        assert r["sent"] is False and r["queued"] is True, r
        assert not any("get_canvas" in t for t in texts(host)), "instructions leaked into the channel"
        assert any("make a login screen" in t and "asked the tribe" in t for t in texts(host)), texts(host)

        # ---- your own agent: private, never in the channel, never visible to others
        a = ok(api("/agents", "POST", {"kind": "cursor"}, token=host), "host connects Cursor")
        camp_agent = a["token"]; tool(camp_agent, "tribe_overview")
        n0 = len(texts(host))
        r = ok(api("/ask/mine", "POST", {"text": "make the button teal", "detail": "On the design canvas (Design, file \"Home\"). Use the canvas tools: get_canvas to read it, update_layer to draw.", "src": "canvas"}, token=host), "ask my agent")
        assert r["sent"] is True and r["agent"]["online"] is True, r
        time.sleep(0.5)
        assert len(texts(host)) == n0 and not any("get_canvas" in t for t in texts(maya)), "a private request reached the channel"
        got = tool(camp_agent, "check_messages")
        assert "make the button teal" in got and "get_canvas" in got and "private" in got, got
        assert "Sent" in tool(camp_agent, "reply", {"text": "Done: the button is teal now."})
        mine = ok(api("/ask/mine", token=host))
        assert mine["agents"] and mine["requests"][0]["text"] == "make the button teal" and mine["requests"][0]["replies"][0]["text"].startswith("Done"), mine
        other = ok(api("/ask/mine", token=maya))
        assert not other["requests"] and not other["agents"], "someone else can see my private requests"
        dm = mine["requests"][0]["channel"]
        assert api(f"/chat/{dm}?limit=20", token=maya)[0] in (403, 404), "another member can read my private agent chat"
        assert api("/ask/mine", "POST", {"text": "x"}, token=camp_agent)[0] == 403, "an agent can use the private ask route"

        # ---- an agent speaking unasked in a channel goes to its owner instead
        n1 = len(texts(maya))
        out = tool(camp_agent, "post_chat", {"text": "I refactored the save system and here are 14 details…"})
        assert "privately" in out, out
        assert len(texts(maya)) == n1, "an unaddressed agent post reached the channel"
        # ---- but it answers when a person @mentions it
        ok(api("/chat/general", "POST", {"text": "@my-agent what changed today?"}, token=host))
        wait_until(lambda: any("is on it" in t for t in texts(host)), 10, "public command ack")
        out = tool(camp_agent, "post_chat", {"text": "@Camp the save system is refactored."})
        assert out.startswith("Posted"), out
        assert any("save system is refactored" in t for t in texts(maya))

        # ---- one-line update cards, only for the kinds the lead chose
        p = ok(api("/ask/public", token=host))
        assert p["cards"] == ["finished", "approval", "failed"] and p["canEdit"], p
        assert "update card" in tool(camp_agent, "post_update", {"kind": "finished", "text": "Title screen is ready\nfor review"})
        card = [m for m in msgs(maya) if m.get("card") == "finished"][-1]
        assert "Title screen is ready for review" in card["text"] and "\n" not in card["text"] and card["by"] == "tribecode", card
        assert "privately" in tool(camp_agent, "post_update", {"kind": "started", "text": "Starting the boss fight"})
        assert not any(m.get("card") == "started" for m in msgs(maya))
        assert api("/ask/public", "PUT", {"cards": ["finished"]}, token=maya)[0] == 403
        p = ok(api("/ask/public", "PUT", {"cards": ["started", "bogus"]}, token=host))
        assert p["cards"] == ["started"] and p["postDone"] is False, p
        assert "update card" in tool(camp_agent, "post_update", {"kind": "started", "text": "Starting the boss fight"})
        assert "privately" in tool(camp_agent, "post_update", {"kind": "finished", "text": "Done with the boss"})
        ok(api("/ask/public", "PUT", {"cards": ["finished", "approval", "failed"]}, token=host))
        # a request for approval is a card too
        tool(camp_agent, "request_approval", {"title": "Delete the old save files", "details": "They are unused", "risk": "medium"})
        wait_until(lambda: any(m.get("card") == "approval" and "Delete the old save files" in m["text"] for m in msgs(maya)), 10, "approval card")

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 800})
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            signin = f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Camp', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{host}'}}}})) }} catch (e) {{}}"
            pg.add_init_script(signin)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAskAgent", timeout=15000)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-input", state="visible"); pg.wait_for_selector(".msg-card[data-card='finished']")
            assert pg.locator(".msg-card[data-card='approval']").count() >= 1
            assert pg.locator(".msg-card .mc-t").first.evaluate("e => getComputedStyle(e).whiteSpace") == "nowrap"
            assert pg.locator("#chat-list").inner_text().count("get_canvas") == 0, "agent instructions are visible in the channel"
            pg.screenshot(path=str(SHOTS / "cp-channel.png"))

            # the shared send: a pill says where it went, the panel lists requests and replies
            note = pg.evaluate("() => window.TribeAskAgent.send({ text: 'add a pause menu', detail: 'In the live preview. Save the change in the code.', src: 'preview' }).then(r => r.note)")
            assert "Sent to your Cursor" in note, note
            pg.wait_for_selector("#aa-pill.on"); assert "Sent to your Cursor" in pg.inner_text("#aa-pill")
            pg.screenshot(path=str(SHOTS / "cp-pill.png"))
            pg.click("#aa-pill-open"); pg.wait_for_selector("#aa-mine .aa-req")
            assert "Your requests to your Cursor" in pg.inner_text("#aa-mine-h")
            assert "add a pause menu" in pg.inner_text("#aa-mine") and "Done: the button is teal now." in pg.inner_text("#aa-mine")
            assert "Save the change in the code" not in pg.inner_text("#aa-mine"), "the panel shows the instructions, not the person's words"
            tool(camp_agent, "check_messages"); tool(camp_agent, "reply", {"text": "Pause menu added."})
            pg.wait_for_function("() => document.querySelector('#aa-mine').innerText.includes('Pause menu added.')")
            pg.screenshot(path=str(SHOTS / "cp-panel.png"))
            pg.fill("#aa-text", "and make it darker"); pg.click("#aa-send")
            pg.wait_for_function("() => document.querySelector('#aa-mine').innerText.includes('and make it darker')")
            pg.click("#invite-body [data-close]")
            assert pg.locator("#chat-list").inner_text().count("pause menu") == 0
            # Settings: the lead picks the kinds
            pg.evaluate("() => { const d = document.createElement('div'); d.id = 'cp-set'; document.body.appendChild(d); return window.TribeMentions.settingsRow(d); }")
            pg.wait_for_selector("#cp-set [data-card='started']")
            assert pg.is_checked("#cp-set [data-card='finished']") and not pg.is_checked("#cp-set [data-card='started']")
            pg.check("#cp-set [data-card='started']")
            wait_until(lambda: "started" in ok(api("/ask/public", token=host))["cards"], 10, "kinds saved")
            pg.evaluate("() => document.getElementById('cp-set').remove()")

            # ---- the invite sheet: larger, three large choices with stroke icons, a big link, the QR beside it
            pg.evaluate("() => window.TribeInvite.open()"); pg.wait_for_selector(".modal-card.io #tl-copy:not([disabled])")
            box = pg.locator(".modal-card.io").bounding_box()
            assert box["width"] >= 840 and box["height"] >= 600, box
            assert pg.locator(".io-opt .io-glyph svg").count() == 3, "the three choices need stroke icons"
            assert pg.locator(".io-opt").first.bounding_box()["height"] >= 120
            assert float(pg.locator("#tl-link").evaluate("e => parseFloat(getComputedStyle(e).fontSize)")) >= 15.5
            assert pg.locator("#tl-copy").bounding_box()["height"] >= 44 and pg.locator("#tl-copy").bounding_box()["width"] >= 100
            pg.wait_for_selector("#tl-qr svg", state="visible")
            lb, qb = pg.locator("#tl-box .linkbox").bounding_box(), pg.locator("#tl-qr").bounding_box()
            assert qb["x"] > lb["x"] + lb["width"] - 4, "the QR should sit beside the link"
            pg.screenshot(path=str(SHOTS / "cp-invite.png"))
            pg.click("#io-who-agent"); pg.wait_for_selector(".modal-card.io .ic-kinds .ic-chip")
            assert pg.locator(".modal-card.io .ic-kinds").evaluate("e => getComputedStyle(e).display") == "grid"
            pg.evaluate("document.querySelector(\"#ic-body .ic-kinds [data-ic-kind='code']\").click()"); pg.wait_for_selector(".modal-card.io .ic-steps li")
            assert pg.locator(".modal-card.io .ic-steps li").first.evaluate("e => getComputedStyle(e, '::before').content") not in ("none", "normal")
            assert float(pg.locator(".modal-card.io .ic-steps").evaluate("e => parseFloat(getComputedStyle(e).fontSize)")) >= 15
            pg.screenshot(path=str(SHOTS / "cp-invite-agent.png"))
            pg.keyboard.press("Escape")

            # ---- the way back to the main website: ? menu, profile menu, Home's footer
            pg.evaluate("() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; }")
            pg.click("#tb-help"); pg.wait_for_selector("#help-menu [data-help='site']")
            assert "TribeCode website" in pg.inner_text("#help-menu [data-help='site']")
            pg.screenshot(path=str(SHOTS / "cp-website-help.png"))
            pg.click("#help-menu [data-help='site']")
            assert pg.evaluate("() => window.__opened[0]") == "https://tribecode.org/"
            pg.evaluate("TribeApp.show('hub')"); pg.wait_for_selector("#hub-site")
            pg.locator("#hub-site").scroll_into_view_if_needed(); pg.click("#hub-site")
            assert pg.evaluate("() => window.__opened.length") == 2
            ctx.close()

            # ---- phone: the sheet fits, the choices stay three across, the QR waits behind its button
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(str(e)))
            pp.add_init_script(signin)
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function("() => window.TribeInvite && window.TribeClient && window.TribeClient.connected()", timeout=15000)
            pp.evaluate("() => window.TribeInvite.open()"); pp.wait_for_selector(".modal-card.io #tl-copy:not([disabled])")
            assert pp.evaluate("() => { const c = document.querySelector('.modal-card.io'), r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; }"), "the invite sheet overflows on a phone"
            assert pp.locator("#tl-qr").is_hidden()
            pp.click("#tl-qrb"); pp.wait_for_selector("#tl-qr svg", state="visible")
            assert pp.locator("#tl-copy").bounding_box()["height"] >= 44
            pp.screenshot(path=str(SHOTS / "cp-invite-390.png"))
            pp.keyboard.press("Escape")
            pp.evaluate("() => window.TribeAskAgent.openMine()"); pp.wait_for_selector("#aa-mine .aa-req")
            assert pp.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1")
            pp.screenshot(path=str(SHOTS / "cp-panel-390.png"))
            ph.close(); b.close()
        assert not errors, errors
        print(f"ok e2e_chat_people (private requests, no leak to others, agent posts only when addressed, update cards + kinds, pill + panel, invite sheet desktop + 390, website link)  shots: {SHOTS}")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
