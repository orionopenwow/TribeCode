"""End-to-end: profiles (server/profiles.js, app/ui/profiles.js).

API: validation (palette-only name colors, one emoji, http/https links only, lengths), status with expiry, presence
(invisible looks offline, agents can't pick do not disturb), do not disturb silences pushes (the notify decision log),
private notes only their author reads, mutes, per-project nicknames, photo + GIF avatars (with a still frame).
UI: every avatar kind shows in chat and the member list; the name color shows in chat and lists and falls back on a
low-contrast theme; bio links are safe (javascript: never becomes a link); the popout opens from a chat name; the
editor saves; the member list is grouped by presence; phone 390px sheets don't overflow; no console errors.
Usage: python app/test/e2e_profiles.py
"""
import base64, json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5110 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            try: return r.status, json.loads(raw or b"{}")
            except Exception: return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def png(w=64, h=64, rgb=(56, 198, 177)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(data).decode()


# a tiny two-frame GIF (1x1, red then white)
GIF = "data:image/gif;base64," + base64.b64encode(bytes.fromhex(
    "47494638396101000100800000ff0000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b")).decode()


def chat(page):
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, token, pq, mobile=False, theme="dark"):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'{theme}', themePicked:true, server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.project:{BASE}', '{pq}');")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("TribeClient.connected() && window.TribeProfiles", timeout=20000)
    return page


def no_overflow(page, what):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{what}: sideways scroll"
    for sel in ["#pf-pop", "#pf-editor"]:
        r = page.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.right, e.scrollWidth, e.clientWidth]; }})()")
        if r: assert r[0] >= -1 and r[1] <= 391 and r[2] <= r[3] + 1, f"{what}: {sel} overflows {r}"


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-profiles-", dir="/tmp")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        pq = ok(api("/me", token=orion))["projects"][0]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 3, "role": "builder"}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, mid = j["token"], j["member"]["id"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"})); sam, sid = j["token"], j["member"]["id"]

        # ---------------- API: validation ----------------
        P = lambda body, tok=maya: api("/profile", "PATCH", body, token=tok)
        assert P({"links": ["javascript:alert(1)"]})[0] == 400, "javascript: link rejected"
        assert P({"links": [{"url": "data:text/html,hi"}]})[0] == 400
        assert P({"links": ["https://a.dev", "https://b.dev", "https://c.dev", "https://d.dev"]})[0] == 400, "max 3 links"
        assert P({"nameColor": "#ff0000"})[0] == 400, "palette only"
        assert P({"avatar": {"kind": "emoji", "emoji": "ab"}})[0] == 400, "one emoji"
        assert P({"avatar": {"kind": "emoji", "emoji": "🔥🔥"}})[0] == 400, "one emoji only"
        assert P({"avatar": {"kind": "pixel", "pixel": "mickey"}})[0] == 400, "known pixel avatars only"
        assert P({"avatar": {"kind": "photo"}})[0] == 400, "photo needs an upload"
        assert P({"banner": {"color": "#123456"}})[0] == 400
        assert P({"tz": "Mars/Olympus"})[0] == 400
        assert P({"presence": "away"})[0] == 400
        assert api("/profile/avatar", "POST", {"image": "data:image/png;base64," + base64.b64encode(b"GIF89a-not-a-png").decode()}, token=maya)[0] == 400, "content must match its type"
        assert api("/profile", "PATCH", {"bio": "x"})[0] == 401
        long = ok(P({"bio": "a" * 900, "pronouns": "p" * 90}))["profile"]
        assert len(long["bio"]) == 300 and len(long["pronouns"]) == 40, long
        assert api(f"/profile/{oid}", "PATCH", {"bio": "hi"}, token=maya)[0] == 403, "only your own profile"

        # agents: own profile fields, no do not disturb / invisible
        ag = ok(api("/agents", "POST", {}, token=maya)); atok = ag.get("token") or ag.get("key")
        assert atok, ag
        assert P({"presence": "dnd"}, atok)[0] == 400 and P({"presence": "invisible"}, atok)[0] == 400, "agents can't pick dnd/invisible"
        assert ok(P({"avatar": {"kind": "pixel", "pixel": "owl", "tint": "teal"}, "presence": "idle"}, atok))["profile"]["avatar"]["pixel"] == "owl"

        # ---------------- set each avatar type ----------------
        ok(P({"avatar": {"kind": "emoji", "emoji": "🦊", "tint": "amber"}, "nameColor": "lime", "pronouns": "she/her",
              "bio": "Builds **pixel** worlds. https://maya.dev [bad](javascript:alert(1)) <img src=x onerror=alert(1)>",
              "links": [{"url": "https://maya.dev/blog", "label": "Blog"}], "tz": "Europe/Paris", "banner": {"color": "violet"}}), "maya profile")
        ok(P({"avatar": {"kind": "pixel", "pixel": "campfire", "tint": "indigo"}, "nameColor": "sky"}, orion), "orion pixel")
        sp = ok(api("/profile/avatar", "POST", {"image": png()}, token=sam), "sam photo")["profile"]["avatar"]
        assert sp["kind"] == "photo" and sp["file"].endswith(".png") and not sp["anim"], sp
        st, raw = api(f"/profile/media/{sp['file']}", token=orion); assert st == 200 and raw[:4] == b"\x89PNG", st
        assert api(f"/profile/media/{sp['file']}")[0] == 401, "pictures are for members only"
        assert api("/profile/media/..%2F..%2Fmembers.json", token=orion)[0] in (400, 404)
        g = ok(api("/profile/avatar", "POST", {"image": GIF, "still": png(16, 16)}, token=sam), "sam gif")["profile"]["avatar"]
        assert g["anim"] and g["file"].endswith(".gif") and g["still"].endswith(".png"), g

        # ---------------- status with expiry ----------------
        soon = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() + 3))
        ok(P({"status": {"emoji": "☕", "text": "Back in a bit", "clear": "today", "until": soon}}, sam))
        sm = [m for m in ok(api("/members", token=orion))["members"] if m["id"] == sid][0]
        assert sm["profile"]["status"]["text"] == "Back in a bit", sm
        thirty = ok(P({"status": {"emoji": "🛠️", "text": "Shipping the map", "clear": "30m"}}))["profile"]["status"]
        left = (time.mktime(time.strptime(thirty["until"][:19], "%Y-%m-%dT%H:%M:%S")) - time.mktime(time.gmtime()))
        assert 25 * 60 < left < 31 * 60, left
        assert P({"status": {"emoji": "nope", "text": "x"}})[0] == 400

        # ---------------- private notes + mutes ----------------
        ok(api(f"/profile/{mid}/note", "PUT", {"text": "Loves the night shift"}, token=orion))
        assert ok(api(f"/profile/{mid}", token=orion))["note"] == "Loves the night shift"
        assert ok(api(f"/profile/{mid}", token=maya))["note"] == "", "the subject never sees it"
        assert ok(api(f"/profile/{mid}", token=sam))["note"] == "", "nobody else sees it"
        assert "Loves" not in json.dumps(ok(api("/members", token=sam))), "notes never ride along with presence"
        ok(api(f"/profile/{sid}/mute", "PUT", {"on": True}, token=orion))
        assert api(f"/profile/{oid}/mute", "PUT", {"on": True}, token=orion)[0] == 400, "can't mute yourself"

        # ---------------- nicknames per project ----------------
        ok(P({"nick": {"project": pq, "text": "Mayday"}}))
        assert api("/profile", "PATCH", {"nick": {"project": "nope", "text": "x"}}, token=maya)[0] == 400

        # ---------------- DND suppresses push (the notify decision log) ----------------
        ok(api("/notify/prefs", "PUT", {"when": {"mode": "always"}}, token=maya))
        ok(api("/chat/general", "POST", {"text": "@Maya the map loads now"}, token=orion, project=pq))
        def last_reason():
            for _ in range(40):
                r = ok(api("/notify/state", token=maya))["recent"]
                if r: return r
                time.sleep(0.1)
            return []
        r1 = last_reason(); assert r1 and r1[0]["reason"] == "push", r1
        ok(P({"presence": "dnd"}))
        ok(api("/chat/general", "POST", {"text": "@Maya and the tiles too"}, token=orion, project=pq))
        for _ in range(40):
            r2 = ok(api("/notify/state", token=maya))["recent"]
            if len(r2) > len(r1): break
            time.sleep(0.1)
        assert r2[0]["reason"] == "dnd" and not r2[0].get("pocket"), r2[0]
        assert any("tiles" in (i.get("body") or "") for i in ok(api("/notify/inbox", token=maya))["items"]), "the inbox still keeps it"
        ok(P({"presence": "online"}))

        ok(api("/chat/general", "POST", {"text": "Morning! Pixel map is in."}, token=maya, project=pq))
        ok(api("/chat/general", "POST", {"text": "Nice one @Maya"}, token=orion, project=pq))
        ok(api("/chat/general", "POST", {"text": "a message from Sam"}, token=sam, project=pq))

        # ---------------- UI ----------------
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = login(b, {"width": 1440, "height": 900}, "Orion", orion, pq)
            chat(page)
            page.wait_for_selector(f"#chat-list .msg[data-by='{mid}'] > .avatar.pf-k-emoji", timeout=15000)
            assert "🦊" in page.inner_text(f"#chat-list .msg[data-by='{mid}'] > .avatar"), "emoji avatar in chat"
            page.wait_for_selector(f"#chat-list .msg[data-by='{oid}'] > .avatar.pf-k-pixel svg.pf-px")
            page.wait_for_selector(f"#chat-list .msg[data-by='{sid}'] > .avatar.pf-k-photo img")
            # the GIF shows its still until hovered
            img = f"#chat-list .msg[data-by='{sid}'] > .avatar img"
            assert ".png" in page.get_attribute(img, "src"), "GIF paused: still frame"
            # name color in chat + nickname
            nm = f"#chat-list .msg[data-by='{mid}'] .mb > .nm"
            page.wait_for_function(f"document.querySelector(\"{nm}\") && document.querySelector(\"{nm}\").dataset.pfColor === 'lime'")
            col = page.evaluate(f"getComputedStyle(document.querySelector(\"{nm}\")).color")
            assert col == "rgb(154, 214, 92)", col
            assert "Mayday" in page.inner_text(nm), "per-project nickname in chat"
            # mention colored
            page.wait_for_selector(f"#chat-list .pf-mention[data-pid='{mid}']")
            # muted Sam (for Orion only)
            page.wait_for_selector(f"#chat-list .msg.pf-muted[data-by='{sid}']")
            # member list: grouped, name color, avatar
            page.wait_for_selector("#room-list .pf-grp", state="attached")
            page.wait_for_selector(f"#room-list .person[data-follow='{mid}'] .avatar.pf-k-emoji", state="attached")
            assert page.evaluate(f"getComputedStyle(document.querySelector(\"#room-list .person[data-follow='{mid}'] > div:not(.avatar) > span\")).color") == "rgb(154, 214, 92)"
            # hover the GIF -> animates
            page.hover(f"#chat-list .msg[data-by='{sid}'] > .avatar")
            page.wait_for_function(f"document.querySelector(\"{img}\").src.includes('.gif')", timeout=5000)
            page.mouse.move(5, 5)
            page.wait_for_function(f"document.querySelector(\"{img}\").src.includes('.png')", timeout=5000)
            shots = os.environ.get("PROFILE_SHOTS")
            if shots: page.screenshot(path=f"{shots}/desk-chat.png")

            # popout from a chat name
            page.click(nm)
            page.wait_for_selector("#pf-pop .pf-bio")
            wait_text(page, "#pf-pop", "she/her"); wait_text(page, "#pf-pop", "Member since"); wait_text(page, "#pf-pop", "Shipping the map")
            assert page.evaluate("[...document.querySelectorAll('#pf-pop .pf-bio a')].every(a => /^https:/.test(a.getAttribute('href')))")
            assert page.evaluate("!document.querySelector('#pf-pop a[href^=\"javascript\"], #pf-pop .pf-bio img')"), "javascript: link and raw HTML never render"
            assert "javascript:alert(1)" in page.inner_text("#pf-pop .pf-bio"), "shown as text"
            assert page.input_value("#pf-note-in") == "Loves the night shift"
            page.fill("#pf-note-in", "Loves the night shift. Ask about tiles.")
            page.wait_for_function(f"fetch('/api/profile/{mid}', {{headers: {{Authorization: 'Bearer {orion}'}}}}).then(r => r.json()).then(d => d.note.includes('tiles'))", timeout=8000)
            assert "tiles" not in json.dumps(ok(api(f"/profile/{mid}", token=maya))), "the note stays private"
            if shots: page.screenshot(path=f"{shots}/desk-pop.png")
            page.click("#pf-pop [data-pop='more']"); page.wait_for_selector("#pf-menu2 [data-pop='copy']")
            page.keyboard.press("Escape"); page.wait_for_selector("#pf-pop", state="detached")

            # low-contrast fallback: lime on the Light theme
            page.evaluate("TribeStore.set(TribeThemes.pick('light')); TribeApp.applyTheme()")
            page.wait_for_function(f"document.querySelector(\"{nm}\").dataset.pfFallback === '1'", timeout=8000)
            col2 = page.evaluate(f"getComputedStyle(document.querySelector(\"{nm}\")).color")
            assert col2 != "rgb(154, 214, 92)", col2
            ratio = page.evaluate(f"""(() => {{
              const L = c => {{ const m = c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => {{ v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }}); return 0.2126*m[0] + 0.7152*m[1] + 0.0722*m[2]; }};
              const a = L(getComputedStyle(document.querySelector("{nm}")).color), s = getComputedStyle(document.body).getPropertyValue('--surface').trim();
              const i = document.createElement('i'); i.style.color = s; document.body.appendChild(i); const b = L(getComputedStyle(i).color); i.remove();
              return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }})()""")
            assert ratio >= 4.4, ratio
            page.evaluate("TribeStore.set(TribeThemes.pick('campfire')); TribeApp.applyTheme()")

            # the editor: your own profile, pick a pixel avatar + a name color + a status
            page.evaluate("TribeProfiles.edit()"); page.wait_for_selector("#pf-editor [data-tab='pixel']")
            page.click("#pf-editor [data-tab='pixel']"); page.click("#pf-editor [data-px='tent']")
            page.click("#pf-editor [data-nc='rose']")
            page.fill("#pf-st", "Pairing on the map"); page.select_option("#pf-clear", "4h")
            page.click("#pf-editor [data-pres='idle']")
            if shots: page.screenshot(path=f"{shots}/desk-editor.png")
            page.click("#pf-save"); page.wait_for_selector("#pf-editor", state="detached")
            pr = ok(api("/profile", token=orion))["profile"]
            assert pr["avatar"]["pixel"] == "tent" and pr["nameColor"] == "rose" and pr["status"]["text"] == "Pairing on the map" and pr["presence"] == "idle", pr
            page.wait_for_selector(f"#chat-list .msg[data-by='{oid}'] > .avatar[data-pf-sig*='rect']")

            # invisible: Maya looks offline to others
            ok(P({"presence": "invisible"}))
            mm = [m for m in ok(api("/members", token=orion))["members"] if m["id"] == mid][0]
            assert mm["online"] is False and mm["state"] == "offline", mm
            ok(P({"presence": "online"}))

            # status expiry: Sam's 3-second status is gone
            time.sleep(max(0, 3.5))
            sm = [m for m in ok(api("/members", token=orion))["members"] if m["id"] == sid][0]
            assert not (sm.get("profile") or {}).get("status"), sm

            # ---------------- phone 390 ----------------
            ph = login(b, {"width": 390, "height": 844}, "Maya", maya, pq, mobile=True)
            chat(ph)
            ph.wait_for_selector(f"#chat-list .msg[data-by='{oid}'] > .avatar.pf-k-pixel", timeout=15000)
            ph.click(f"#chat-list .msg.g-first[data-by='{oid}'] > .avatar") if ph.query_selector(f"#chat-list .msg.g-first[data-by='{oid}'] > .avatar") else ph.click(f"#chat-list .msg[data-by='{oid}'] > .avatar")
            ph.wait_for_selector("#pf-pop.sheet .pf-acts")
            no_overflow(ph, "phone popout")
            if shots: ph.screenshot(path=f"{shots}/phone-pop.png")
            ph.click(".pf-scrim", position={"x": 10, "y": 10}); ph.wait_for_selector("#pf-pop", state="detached")
            ph.evaluate("TribeProfiles.edit()"); ph.wait_for_selector("#pf-editor.sheet [data-tab='emoji']")
            no_overflow(ph, "phone editor")
            ph.click("#pf-editor [data-tab='pixel']"); no_overflow(ph, "phone editor pixel grid")
            if shots: ph.screenshot(path=f"{shots}/phone-editor.png")
            ph.evaluate("document.querySelector('#pf-editor .pf-ed-body').scrollTop = 99999"); no_overflow(ph, "phone editor bottom")
            ph.click("#pf-editor [data-ed='cancel']")
            b.close()
        assert not errors, errors
        print("e2e_profiles: OK (avatars, name colors + fallback, safe bio, status expiry, presence, DND push, notes, mutes, nicknames, popout, editor, phone)")
    except Exception:
        try:
            srv.terminate(); print(srv.stdout.read().decode()[-3000:])
        except Exception: pass
        if errors: print("ERRORS:", errors)
        raise
    finally:
        try: srv.terminate(); srv.wait(10)
        except Exception: pass


if __name__ == "__main__":
    main()
