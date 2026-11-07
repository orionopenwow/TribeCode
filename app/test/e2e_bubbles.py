"""End-to-end: the chat bubble layout (app/ui/chatx.js + app/ui/bubbles.css).

A realistic conversation (two humans + an agent, yesterday and today, a reply, reactions, a voice note,
an image, a vote) checked for: grouping (one avatar per group, the name only on the first bubble), your
own bubbles on the right without avatar or name, date pills, the reply quote and reactions inside the
bubble, the voice note's "0:09 · 35.5 KB" meta, a tick on yours, the conversation header and composer
pill on desktop, and no horizontal overflow at 390px. Screenshots: docs/screenshots/chat-bubbles*.png.
Usage: python app/test/e2e_bubbles.py
"""
import base64, glob, json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4831 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def png(w, h, px):
    raw = b"".join(b"\x00" + b"".join(bytes(px(x, y)) for x in range(w)) for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def level(x, y):
    """A flat pixel-art level: sky, a sun, two platforms, a hero, a coin, grass and dirt (240x300)."""
    if (x - 190) ** 2 + (y - 50) ** 2 < 18 ** 2: return (255, 184, 107)
    if 150 <= y < 162 and 30 <= x < 120: return (56, 198, 177)
    if 200 <= y < 212 and 130 <= x < 220: return (56, 198, 177)
    if 118 <= y < 150 and 60 <= x < 84: return (242, 107, 29) if y > 126 else (248, 250, 252)
    if (x - 175) ** 2 + (y - 180) ** 2 < 7 ** 2: return (255, 214, 102)
    if y >= 262: return (59, 209, 111) if y < 270 else (92, 64, 51)
    return (40, 52, 84) if y < 140 else (52, 66, 104)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def login(b, viewport, name, color, token, mobile=False):
    ctx = b.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));")
    page = ctx.new_page(); watch(page, name)
    page.goto(BASE + "/?skipIntro=1")
    page.wait_for_function("(document.querySelector('#sync-status') || {}).textContent?.includes('connected')", timeout=15000)
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-bubbles-", dir="/tmp")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Pixel Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2}, token=orion))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya", "color": "#6C7CFF"})); maya, mid = j["token"], j["member"]["id"]
        ag = ok(api("/agents", "POST", token=maya)); atok, aid = ag["token"], ag["agent"]["id"]

        post = lambda tok, text, **kw: ok(api("/chat/general/send", "POST", {"text": text, **kw}, token=tok))["message"]
        # yesterday
        y1 = post(maya, "Pushed the new tileset to feat/tiles. Grass, dirt and the cave set.")
        y2 = post(maya, "Coins sparkle now ✨")
        y3 = post(orion, "Looks great. Merging after dinner.")
        # today
        t1 = post(maya, "Can we lock the jump height before Friday? Playtesters keep overshooting the second platform.")
        t2 = post(orion, "Yes. 3.2 tiles feels right to me", replyTo=t1["id"])
        t3 = post(orion, "Let's ask the team")
        vote = ok(api("/chat/general/vote", "POST", {"question": "Lock jump height at 3.2 tiles?"}, token=orion))["message"]
        ok(api(f"/chat/general/vote/{vote['id']}/cast", "POST", {"option": "yes"}, token=maya))
        t4 = ok(api("/chat/general/send", "POST", {"text": "Ran the platformer tests: 42 pass. Double jump now resets on wall touch."}, token=atok))["message"]
        t5 = ok(api("/chat/general/image", "POST", {"data": base64.b64encode(png(240, 300, level)).decode(), "mime": "image/png", "text": ""}, token=maya))["message"]
        t6 = ok(api("/chat/general/voice", "POST", {"data": base64.b64encode(os.urandom(36352)).decode(), "mime": "audio/webm", "dur": 9,
                                                   "transcript": "Quick one: the cave level needs a checkpoint before the spikes.", "wave": [2, 4, 7, 5, 8, 9, 6, 3, 5, 7, 8, 6, 4, 2, 3, 6, 8, 9, 7, 5, 4, 6, 7, 5, 3, 2, 4, 6, 5, 3, 2, 1]}, token=maya))["message"]
        t7 = post(orion, "On it 👍")
        for tok, mid_, e in [(orion, t1["id"], "👍"), (atok, t1["id"], "👍"), (maya, t2["id"], "🔥"), (orion, t4["id"], "🎉"), (maya, t4["id"], "🎉"), (orion, y2["id"], "❤️")]:
            ok(api("/chat/general/react", "POST", {"id": mid_, "emoji": e}, token=tok))

        # spread the times: yesterday evening, then this morning in bursts
        files = glob.glob(os.path.join(tmp, "**", "chat", "general.jsonl"), recursive=True)
        assert files, "chat file"
        now = datetime.now(timezone.utc)
        yday = now - timedelta(days=1)
        when = {y1["id"]: yday - timedelta(minutes=34), y2["id"]: yday - timedelta(minutes=33), y3["id"]: yday - timedelta(minutes=20),
                t1["id"]: now - timedelta(minutes=48), t2["id"]: now - timedelta(minutes=46), t3["id"]: now - timedelta(minutes=46), vote["id"]: now - timedelta(minutes=45),
                t4["id"]: now - timedelta(minutes=30), t5["id"]: now - timedelta(minutes=12), t6["id"]: now - timedelta(minutes=11), t7["id"]: now - timedelta(minutes=4)}
        iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        for f in files:
            rows = [json.loads(l) for l in open(f) if l.strip()]
            for r in rows:
                if r.get("id") in when: r["at"] = iso(when[r["id"]])
                elif r.get("by") == "tribecode": r["at"] = iso(yday - timedelta(minutes=40))
            rows.sort(key=lambda r: r["at"])
            with open(f, "w") as fh: fh.write("".join(json.dumps(r) + "\n" for r in rows))

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            page = login(b, {"width": 1440, "height": 900}, "Orion", "#F26B1D", orion)
            try:
                page.wait_for_selector(f"#chat-list .msg.dx[data-id='{t7['id']}']")
                page.wait_for_selector(f"#chat-list .msg.dx[data-id='{vote['id']}'] .vt")
                row = lambda i: f"#chat-list .msg.dx[data-id='{i}']"
                cls = lambda i: page.eval_on_selector(row(i), "e => [...e.classList]")
                # grouping: Maya's two yesterday messages are one group
                assert "g-first" in cls(y1["id"]) and "g-last" not in cls(y1["id"]), cls(y1["id"])
                assert "g-last" in cls(y2["id"]) and "g-first" not in cls(y2["id"]), cls(y2["id"])
                vis = lambda sel: page.eval_on_selector(sel, "e => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'")
                assert not vis(row(y1["id"]) + " > .avatar") and vis(row(y2["id"]) + " > .avatar"), "one avatar per group, on the last bubble"
                assert vis(row(y1["id"]) + " .mb > b.nm") and not vis(row(y2["id"]) + " .mb > b.nm"), "name only on the first bubble"
                # every group of someone else's shows exactly one avatar
                groups = page.evaluate("""() => { const out = []; let cur = null;
                  for (const el of document.querySelectorAll('#chat-list .msg.dx:not(.sys):not(.mine)')) {
                    if (el.classList.contains('g-first')) { cur = { n: 0 }; out.push(cur); }
                    const a = el.querySelector(':scope > .avatar'); if (a && getComputedStyle(a).visibility !== 'hidden') cur.n++; }
                  return out.map(g => g.n); }""")
                assert groups and all(n == 1 for n in groups), groups
                # mine: right-aligned, no avatar, no name, a tick inside
                mb = page.eval_on_selector(row(t7["id"]) + " .mb", "e => e.getBoundingClientRect().toJSON()")
                lb = page.eval_on_selector("#chat-list", "e => e.getBoundingClientRect().toJSON()")
                assert "mine" in cls(t7["id"]) and lb["right"] - mb["right"] < 24, (mb, lb)
                assert not vis(row(t7["id"]) + " > .avatar") and not vis(row(t7["id"]) + " .mb > b.nm")
                assert page.locator(row(t7["id"]) + " .mb .mt .tk svg").count() == 1
                other = page.eval_on_selector(row(t1["id"]) + " .mb", "e => e.getBoundingClientRect().toJSON()")
                assert other["left"] - lb["left"] < 60, (other, lb)
                # time sits inside the bubble
                assert page.locator(row(t1["id"]) + " .mb .mt time").count() == 1
                # date pills: yesterday and today
                seps = page.eval_on_selector_all("#chat-list .day-sep", "els => els.map(e => e.textContent)")
                assert "Yesterday" in seps and "Today" in seps, seps
                # reply quote inside the bubble, colored by the quoted member, jumps to the original
                q = row(t2["id"]) + " .mb .quote"
                assert page.locator(q).count() == 1 and "Maya" in page.inner_text(q)
                page.click(q); page.wait_for_selector(row(t1["id"]) + ".flash")
                # reactions inside the bubble: faces for <= 3 reactors, yours highlighted, the count stays readable
                rx = row(t1["id"]) + " .mb .reacts .rx[data-rx='👍']"
                assert page.locator(rx + ".on").count() == 1 and page.locator(rx + " .rx-f").count() == 2, "faces + mine highlighted"
                assert "2" in page.text_content(rx)
                # voice note meta: duration + size, the time and the transcript
                vn = row(t6["id"])
                assert "0:09 · 35.5 KB" in page.inner_text(vn + " .vn-meta"), page.inner_text(vn + " .vn-meta")
                assert "checkpoint before the spikes" in page.inner_text(vn + " .vn-tx")
                # image: time on a solid pill over the picture
                page.wait_for_function(f"(i => i && i.complete && i.naturalWidth === 240)(document.querySelector(\"{row(t5['id'])} .thumb img\"))")
                assert page.locator(row(t5["id"]) + " .thumb .mt").count() == 1
                # vote card sits in the alignment system (mine -> right)
                vb = page.eval_on_selector(row(vote["id"]) + " .vt", "e => e.getBoundingClientRect().toJSON()")
                assert lb["right"] - vb["right"] < 24, vb
                # agent: teal name with the Claude glyph
                assert page.locator(row(t4["id"]) + " .mb > b.nm .nm-g").count() == 1
                # header + composer pill
                page.wait_for_selector("#chat-head .cb-av"); assert page.locator("#chat-head .cb-btn").count() == 3
                assert "members" in page.inner_text("#chat-head .cb-sub")
                assert page.locator("#chat-form .cx-emo").count() == 1 and page.locator("#chat-form .cx-plus").count() == 1
                page.click("#chat-form .cx-emo"); page.click("#rx-picker [data-ins='🚀']")
                assert page.input_value("#chat-input") == "🚀"; page.fill("#chat-input", "")
                # people.js hooks still work on the bubbles: Maya's name opens her profile
                page.click(row(t1["id"]) + " .mb > b.nm")
                page.wait_for_selector("#person-panel:not(.hidden)"); page.keyboard.press("Escape")
                page.wait_for_selector("#person-panel", state="hidden")
                page.mouse.move(5, 5); page.evaluate("document.querySelector('#chat-list').scrollTop = 1e9"); page.wait_for_timeout(400)
                page.screenshot(path=str(SHOTS / "chat-bubbles.png"))
                page.evaluate("document.querySelector('#chat-list').scrollTop = 0"); page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "chat-bubbles-top.png"))
                page.close()

                phone = login(b, {"width": 390, "height": 844}, "Orion", "#F26B1D", orion, mobile=True)
                phone.wait_for_selector(f"#chat-list .msg.dx[data-id='{t7['id']}']")
                phone.wait_for_selector(f"#chat-list .msg.dx[data-id='{vote['id']}'] .vt")
                phone.wait_for_timeout(400)
                over = phone.evaluate("() => ({ doc: document.documentElement.scrollWidth, list: (l => l.scrollWidth - l.clientWidth)(document.querySelector('#chat-list')) })")
                assert over["doc"] <= 390 and over["list"] <= 1, over
                w = phone.eval_on_selector(f"#chat-list .msg.dx[data-id='{t1['id']}'] .mb", "e => e.getBoundingClientRect().width")
                assert w <= 390 * 0.84, w
                phone.evaluate("document.querySelector('#chat-list').scrollTop = 1e9"); phone.wait_for_timeout(300)
                phone.screenshot(path=str(SHOTS / "chat-bubbles-phone.png"))
                phone.evaluate(f"document.querySelector(\"#chat-list .msg.dx[data-id='{t1['id']}']\").scrollIntoView({{block: 'start'}})"); phone.wait_for_timeout(300)
                phone.screenshot(path=str(SHOTS / "chat-bubbles-phone-top.png"))
            except Exception:
                for c in b.contexts:
                    for p_ in c.pages:
                        try: p_.screenshot(path=f"/tmp/bubbles-fail-{id(p_)}.png")
                        except Exception: pass
                raise
            finally:
                b.close()
        assert not errors, errors
        print("e2e_bubbles: OK")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
