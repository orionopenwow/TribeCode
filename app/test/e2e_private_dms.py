"""Private messages (feat/p12-e2ee, app/ui/e2ee.js + server/dm.js): end-to-end encrypted DMs between two people.

A host (Camp), a friend (Maya) and a third member (Jo), each in their own browser. Checks, in order:
  1. Every device publishes only a PUBLIC key (.tribe/device-keys.json has d, pub, at: no private key anywhere on disk).
  2. A DM written before Maya had a key stays readable (plain, as before).
  3. Maya's DM header says "Private: only you and Camp can read this" with a lock; she sends a message.
     The server's stored copy is ciphertext (text '' + enc), and no file in the host's tribe folder or the server's
     log holds the words. Both Camp and Maya read it in the app.
  4. Jo can't read it: the server refuses the conversation (403), and even given the stored copy, Jo's device can't open it.
  5. No preview: Camp's notification has no words ("New message from Maya"), Home's Messages row says "New message",
     and the in-app toast says "New message".
  6. Offline: the host's computer stops, Maya writes; the outbox (and localStorage) hold only ciphertext; it sends when
     the host is back and Camp reads it.
  7. A new device for Maya: older private messages say plainly they can't be opened there; new ones open on both of
     Maya's devices. The "check it's really Camp" sheet shows a 10-group safety number that matches on both sides, the
     new-device line and what is not private.
  8. An AI helper DM is not sealed and says so ("Not private: … its AI provider sees it too").
  9. Edit and Forward are not offered (and are refused by the server) for a private message.
Usage: python app/test/e2e_private_dms.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6855 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors = []

def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(msg): print("ok ", msg)

def files_with(root, needle):
    hits = []
    for p in Path(root).rglob("*"):
        if p.is_file():
            try:
                if needle.encode() in p.read_bytes(): hits.append(str(p))
            except Exception: pass
    return hits

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-e2e-", dir="/tmp"))
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
            def page(ctx, who):
                pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{who}: {e}")); return pg
            host = page(b.new_context(viewport={"width": 1300, "height": 820}), "host")
            host.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeE2E && TribeClient.state().me", timeout=20000)
            htok = host.evaluate("TribeStore.get().server.token"); inv = api("/invites", "POST", {"maxUses": 5}, htok)[1]["invite"]["code"]
            hostId = host.evaluate("TribeClient.state().me.id")

            def join(name):
                ctx = b.new_context(viewport={"width": 1300, "height": 820}); pg = page(ctx, name)
                pg.add_init_script("try{localStorage.removeItem('tribecode.afterJoin')}catch(e){}")
                pg.goto(f"{BASE}/join/{inv}"); pg.wait_for_selector("#form:not(.hidden)"); pg.fill("#name", name); pg.click("#go")
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeE2E && window.TribeDM && TribeClient.state().me", timeout=20000)
                return ctx, pg
            mctx, maya = join("Maya")
            mayaId = maya.evaluate("TribeClient.state().me.id"); mtok = maya.evaluate("TribeStore.get().server.token")
            dm = maya.evaluate("TribeDM.channelWith(%r)" % hostId)

            # 2. a plain DM from before Maya's key existed... (sent by the server API, as an older app would)
            st, r = api(f"/chat/{dm}", "POST", {"text": "old-plain hello"}, htok); assert st == 200, (st, r)

            # 1. keys: published, public only
            for pg in (host, maya): assert pg.evaluate("TribeE2E.publish()"), "a device key is published"
            _, jctx_pg = None, None
            jctx, jo = join("Jo"); joId = jo.evaluate("TribeClient.state().me.id"); jtok = jo.evaluate("TribeStore.get().server.token")
            assert jo.evaluate("TribeE2E.publish()")
            kf = list((tmp / "tribe").rglob("device-keys.json")); assert kf, ".tribe/device-keys.json exists"
            keys = json.loads(kf[0].read_text())
            for mid, devs in keys.items():
                for d in devs: assert set(d) <= {"d", "pub", "at"}, ("only public keys are stored", d)
            assert {hostId, mayaId, joId} <= set(keys), keys.keys()
            assert not files_with(tmp, '"kty"') and not files_with(tmp, '"priv"'), "no private key material in the tribe folder"
            assert maya.evaluate("TribeE2E.device().then(d => { try { return crypto.subtle.exportKey('pkcs8', d.priv).then(() => 'exported', () => 'locked'); } catch (e) { return 'locked'; } })") == "locked", "the private key can't be exported"
            ok("each device publishes only a public key; the private key is non-extractable and never on the host's disk")

            # 3. Maya opens the DM: the honest lock line
            maya.evaluate("id => TribeDM.open(id)", hostId)
            maya.wait_for_selector("#dm-priv[data-pv='private']", timeout=10000)
            line = maya.inner_text("#dm-priv"); assert line.strip() == "Private: only you and Camp can read this", line
            assert maya.locator("#dm-priv svg").count() == 1, "a lock icon"
            maya.wait_for_function("[...document.querySelectorAll('#dm-list .msg')].some(x => x.textContent.includes('old-plain hello'))", timeout=8000)
            ok("an older plain DM stays readable")
            maya.fill("#chat-input", "secret-alpha 42"); maya.press("#chat-input", "Enter")
            maya.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pv-msg')].some(x => x.textContent.includes('secret-alpha 42'))", timeout=10000)
            st, d = api(f"/chat/{dm}", token=mtok); msgs = d["messages"]
            sealed = [m for m in msgs if m.get("enc")]; assert len(sealed) == 1, msgs
            s0 = sealed[0]; assert s0["text"] == "" and s0["enc"]["ct"] and len(s0["enc"]["to"]) >= 2, s0
            assert {t["m"] for t in s0["enc"]["to"]} == {hostId, mayaId}, s0["enc"]["to"]
            time.sleep(0.5)
            hits = files_with(tmp, "secret-alpha"); assert not hits, ("the words are nowhere on the host's computer", hits)
            ok("the stored DM is ciphertext; no file in the host's tribe folder (or the server log) has the words")
            host.evaluate("id => TribeDM.open(id)", mayaId)
            host.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pv-msg')].some(x => x.textContent.includes('secret-alpha 42'))", timeout=10000)
            assert host.inner_text("#dm-priv").strip() == "Private: only you and Maya can read this"
            ok("both people read it in the app")

            # 9. no Edit / Forward on a private message; the server refuses them too
            el = maya.locator("#dm-list .msg.pv-msg", has_text="secret-alpha").last; el.hover(); el.locator(".msg-more").click()
            acts = maya.evaluate("[...document.querySelectorAll('#msg-menu [data-act]')].map(b => b.dataset.act)")
            assert "edit" not in acts and "forward" not in acts, acts
            maya.keyboard.press("Escape")
            assert api(f"/chat/{dm}/forward/{s0['id']}", "POST", {"to": "general"}, mtok)[0] == 400
            assert api(f"/chat/{dm}/msg/{s0['id']}", "PATCH", {"text": "x"}, mtok)[0] == 400
            ok("Edit and Forward are not offered for a private message, and the server refuses them")

            # 4. Jo can't read it
            assert api(f"/chat/{dm}", token=jtok)[0] == 403, "the server refuses the conversation to a third member"
            v = jo.evaluate("([m, ch]) => TribeE2E.open(m, ch)", [s0, dm]); assert v["s"] == "nokey", v
            assert api(f"/chat/{dm}/send", "POST", {"enc": s0["enc"]}, jtok)[0] in (400, 403), "a third member can't post sealed copies here"
            ok("a third member can't read it: refused by the server, and their device has no key for it")

            # 5. no preview text anywhere
            st, nb = api("/notify/inbox", token=htok)
            dmn = [i for i in nb.get("items", []) if i.get("ref") == dm or i.get("type") == "dm"]
            assert dmn, nb
            assert "secret-alpha" not in json.dumps(nb), "no words in notifications"
            assert any(i.get("title") == "New message from Maya" and not i.get("body") for i in dmn), dmn
            st, hb = api("/hub/inbox", token=htok); row = [r for r in hb["rows"] if r.get("channel") == dm][0]
            assert row["last"]["text"] == "New message" and row["last"].get("enc"), row
            host.evaluate("TribeDM.back()")
            host.evaluate("window.__toasts = []; const t = TribeApp.toast; TribeApp.toast = (m, k) => { window.__toasts.push(String(m)); return t(m, k); }")
            maya.fill("#chat-input", "secret-delta toast"); maya.press("#chat-input", "Enter")
            host.wait_for_function("window.__toasts.some(t => t.includes('New message'))", timeout=10000)
            tl = host.evaluate("window.__toasts"); assert not any("secret-delta" in t for t in tl), tl
            assert not files_with(tmp, "secret-delta")
            ok("notifications, Home's Messages and the toast say \"New message\", with no words")

            # 6. offline: the outbox holds only ciphertext
            srv.terminate(); srv.wait()
            maya.wait_for_function("!TribeClient.connected()", timeout=15000)
            maya.fill("#chat-input", "secret-beta offline"); maya.press("#chat-input", "Enter")
            maya.wait_for_function("TribeClient.outbox().length >= 1", timeout=8000)
            ob = maya.evaluate("JSON.stringify(TribeClient.outbox())"); ls = maya.evaluate("JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('tribecode.outbox:'))))")   # the saved outbox (an unsent draft stays on this device only)
            assert "secret-beta" not in ob and "secret-beta" not in ls, ("the outbox and localStorage keep only ciphertext", ob[:400], [k for k, v in json.loads(ls).items() if "secret-beta" in v])
            assert '"enc"' in ob, ob[:300]
            assert maya.locator("#dm-list .msg.pending", has_text="secret-beta").count() == 1, "the writer still sees her words while it waits"
            srv = start(); up()
            maya.wait_for_function("TribeClient.connected() && TribeClient.outbox().length === 0", timeout=30000)
            assert not files_with(tmp, "secret-beta")
            host.wait_for_function("TribeClient.connected()", timeout=30000)
            host.evaluate("id => TribeDM.open(id)", mayaId)
            host.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pv-msg')].some(x => x.textContent.includes('secret-beta offline'))", timeout=15000)
            ok("an offline send queues ciphertext, sends when the host is back, and Camp reads it")

            # 7. a new device for Maya
            store = json.loads(maya.evaluate("JSON.stringify(Object.assign({}, localStorage))"))
            m2ctx = b.new_context(viewport={"width": 1300, "height": 820}); maya2 = page(m2ctx, "maya2")
            maya2.add_init_script("(s => { if (!localStorage.getItem('__seeded')) { for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('__seeded', '1'); } })(%s)" % json.dumps(store))
            maya2.goto(BASE + "/?skipIntro=1"); maya2.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeE2E && window.TribeDM && TribeClient.state().me", timeout=20000)
            assert maya2.evaluate("TribeClient.state().me.id") == mayaId
            assert maya2.evaluate("TribeE2E.publish()")
            for pg in (maya, maya2): pg.wait_for_function("TribeClient.state().me && TribeClient.state().me.id", timeout=15000)
            d1 = maya.evaluate("TribeE2E.device().then(d => d && d.d)"); d2 = maya2.evaluate("TribeE2E.device().then(d => d && d.d)"); assert d1 and d2 and d1 != d2, ("a key per device", d1, d2)
            maya2.evaluate("id => TribeDM.open(id)", hostId)
            maya2.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pv-msg .pv-locked')].some(x => x.textContent.includes('Sent before this device could read private messages'))", timeout=10000)
            assert maya2.locator("#dm-list .msg", has_text="secret-alpha").count() == 0
            ok("a new device says plainly that older private messages can't be opened there")
            host.evaluate("id => TribeDM.open(id)", mayaId); host.wait_for_timeout(500)
            host.fill("#chat-input", "secret-gamma both devices"); host.press("#chat-input", "Enter")
            for pg in (maya, maya2):
                pg.wait_for_function("[...document.querySelectorAll('#dm-list .msg.pv-msg')].some(x => x.textContent.includes('secret-gamma both devices'))", timeout=10000)
            assert not files_with(tmp, "secret-gamma")
            ok("new messages are sealed to every device of both people")
            maya2.click("#dm-priv"); maya2.wait_for_selector("#pv-sheet #pv-num span")
            groups = maya2.evaluate("[...document.querySelectorAll('#pv-num span')].map(s => s.textContent)")
            assert len(groups) == 10 and all(len(g) == 5 and g.isdigit() for g in groups), groups
            assert maya2.inner_text("#pv-sheet h3").strip() == "Check it's really Camp"
            assert "Moving them over from an old device isn't built yet" in maya2.inner_text("#pv-newdev")
            ne = maya2.inner_text("#pv-notenc"); assert "Channels, names, who talks to whom, and when." in ne and "Pictures, voice notes and files" in ne and "AI helper" in ne, ne
            hs = host.evaluate("id => TribeE2E.safety(id)", mayaId); assert hs == " ".join(groups), (hs, groups)
            ok("the compare screen: the same 10-group safety number on both sides, the new-device line, what isn't private")
            maya2.keyboard.press("Escape")

            # 8. an AI helper DM is not sealed and says so
            st, ag = api("/agents", "POST", {}, mtok); assert st == 200, (st, ag)
            agId = (ag.get("agent") or ag.get("member") or {}).get("id"); assert agId, ag
            maya.wait_for_function("id => (TribeClient.state().members || []).some(m => m.id === id)", arg=agId, timeout=10000)
            maya.evaluate("id => TribeDM.open(id)", agId)
            maya.wait_for_selector("#dm-priv[data-pv='helper']", timeout=8000)
            hl = maya.inner_text("#dm-priv"); assert "Not private" in hl and "AI provider sees it too" in hl, hl
            maya.fill("#chat-input", "helper-plain question"); maya.press("#chat-input", "Enter"); maya.wait_for_timeout(1200)
            agch = maya.evaluate("TribeDM.channelWith(%r)" % agId)
            st, d = api(f"/chat/{agch}", token=mtok); assert any(m.get("text") == "helper-plain question" and not m.get("enc") for m in d["messages"]), d
            ok("an AI helper DM stays readable by the helper and says so")

            assert not errors, errors
            print("PASS e2e_private_dms")
    finally:
        srv.terminate()

if __name__ == "__main__":
    try: main()
    except AssertionError as e: print("FAIL", e); sys.exit(1)
