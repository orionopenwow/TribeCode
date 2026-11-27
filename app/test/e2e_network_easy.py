"""Your network, invites from the friends list, and joining (p13, docs/ONLINE-MODES.md).
  - How we're connected: the tribe's computer in the middle; a friend on the same Wi-Fi says "Same Wi-Fi", a friend who
    joined once and is offline says "Offline · has a copy", the host says "This computer"; three plain sentences, no
    peer/host/tunnel words; opened from the status line's card and from Settings (one sheet).
  - Invite from the friends list: a friend from another project shows in the invite sheet with Invite; it lands in their
    Home with Join / Not now; nobody is added before Join; Join lands them in the project with "Camp invited you".
    The profile card offers "Invite to <project>" for someone not in it yet.
  - The join page: checking, the tribe's computer is off (remembered, Try again now), expired, turned off, already a member.
  - Phones (390x844): the network sheet and the join page fit with no sideways scroll.
Usage: python3 app/test/e2e_network_easy.py   (TRIBE_PORT_OFFSET to run beside other suites; --shots DIR for pictures)"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6150 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
BANNED = ["peer", "P2P", "tunnel", " host ", "Host "]


def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'network-{name}.png'))


def api(path, method="GET", body=None, token=None, headers=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {}), **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=8) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


def signed_in(b, token, name, via=None, vp=(1300, 820), mobile=False):
    ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, **({"device_scale_factor": 2, "is_mobile": True, "has_touch": True} if mobile else {}),
                        extra_http_headers={"x-tribe-test-via": via} if via else {})
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    pg.add_init_script("localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %s, onboarded: true, tour: {done: true}, server: {url: %s, token: %s}}))"
                       % (json.dumps(name), json.dumps(BASE), json.dumps(token)))
    return pg


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-net-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    for _ in range(80):
        try: urllib.request.urlopen(BASE + "/api/health", timeout=1); break
        except Exception: time.sleep(0.25)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_page(viewport={"width": 1300, "height": 820}); host.on("pageerror", lambda e: errors.append(f"host: {e}"))
            host.add_init_script("if(!localStorage.getItem('tribecode.settings.v1'))localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Camp',onboarded:true,tour:{done:true}}))")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeNetMap", timeout=20000)
            camp = host.evaluate("TribeStore.get().server.token")
            pa = ok(api("/projects", "POST", {"name": "Pixel Quest"}, camp), "project A")["project"]["id"]
            pb = ok(api("/projects", "POST", {"name": "Lantern Run"}, camp), "project B")["project"]["id"]

            # Maya: the whole tribe, on the same Wi-Fi. Riley: joined once, now offline (has a copy). Jay: only Pixel Quest.
            code = ok(api("/invites", "POST", {"maxUses": 5, "project": None}, camp))["invite"]["code"]
            maya = ok(api("/join", "POST", {"code": code, "name": "Maya"}))["token"]
            riley = ok(api("/join", "POST", {"code": code, "name": "Riley"}))["token"]
            ok(api("/me", token=riley, headers={"x-tribe-test-via": "internet"}))
            jcode = ok(api("/invites", "POST", {"maxUses": 2, "project": pa}, camp))["invite"]["code"]
            jay_r = ok(api("/join", "POST", {"code": jcode, "name": "Jay"})); jay = jay_r["token"]
            assert jay_r.get("invitedBy") == "Camp", jay_r

            mp = signed_in(b, maya, "Maya", via="wifi")
            mp.goto(BASE + "/?skipIntro=1"); mp.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)

            # ---------- How we're connected (the host) ----------
            host.wait_for_function("(TribeClient.state().members || []).some(m => m.name === 'Maya' && m.online)", timeout=10000)
            host.click("#ub-st"); host.wait_for_selector("#ts-pop [data-ts='net']")
            host.click("#ts-pop [data-ts='net']"); host.wait_for_selector("#nm-sheet .nm-map", timeout=10000)
            def node(pg, name):
                return pg.evaluate("n => { const el = [...document.querySelectorAll('#nm-sheet .nm-node')].find(x => x.querySelector('.nm-name').textContent === n); return el ? el.querySelector('.nm-lab').textContent : null; }", name)
            host.wait_for_function("[...document.querySelectorAll('#nm-sheet .nm-node')].some(x => x.textContent.includes('Same Wi-Fi'))", timeout=8000)
            assert node(host, "Maya") == "Same Wi-Fi", node(host, "Maya")
            assert node(host, "Riley") == "Offline · has a copy", node(host, "Riley")
            assert node(host, "You") == "This computer", node(host, "You")
            say = host.inner_text("#nm-sheet .nm-say")
            assert "meets on this computer" in say and "everyone keeps a copy" in say and "friends on the same Wi-Fi" not in "" and "catch up when it is back" in say, say
            sheet = host.inner_text("#nm-sheet")
            for w in ["peer", "P2P", "tunnel", "Hosting"]: assert w not in sheet, (w, sheet)
            assert host.locator("#nm-sheet [data-nm='internet']").count() == 1, "the one fix: Turn on the internet link"
            assert "Turn on the internet link" in sheet
            shot(host, "sheet-host")
            host.keyboard.press("Escape"); host.wait_for_timeout(300)
            # Settings opens the same sheet
            host.evaluate("TribeSettings.open('projects')"); host.wait_for_selector("#set-netmap", timeout=8000)
            host.click("#set-netmap"); host.wait_for_selector("#nm-sheet .nm-map", timeout=8000)
            assert host.locator("#nm-sheet").count() == 1
            host.keyboard.press("Escape"); host.wait_for_timeout(300); host.keyboard.press("Escape"); host.wait_for_timeout(300)

            # ---------- invite from the friends list ----------
            jp = signed_in(b, jay, "Jay", via="tailscale")
            jp.goto(BASE + "/?skipIntro=1&home=1"); jp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFriendInvite", timeout=20000)
            host.evaluate(f"TribeProjects.switchTo({json.dumps(pb)})"); host.wait_for_function(f"TribeClient.state().project === {json.dumps(pb)}", timeout=8000)
            host.evaluate("TribeInvite.open()"); host.wait_for_selector("#io-known:not([hidden]) [data-fi-go]", timeout=10000)
            known = host.inner_text("#io-known"); assert "Jay" in known and "people you know" in known.lower() and "Lantern Run" in known, known
            assert host.locator("#tl-link").count() == 1, "the link and QR stay"
            shot(host, "invite-known")
            # nobody is added before Join
            assert pb not in (ok(api("/me", token=jay))["member"].get("projects") or []), "not added before Join"
            jid = ok(api("/me", token=jay))["member"]["id"]
            host.click(f"#io-known [data-fi-go='{jid}']")
            host.wait_for_function("[...document.querySelectorAll('#io-known [data-fi-go]')].some(b => b.textContent === 'Invited')", timeout=8000)
            assert all(p["id"] != pb for p in ok(api("/me", token=jay))["projects"]), "still not in it before Join"
            host.evaluate("TribeInvite.close()")
            # Jay sees it in their Home
            jp.evaluate("TribeHub && TribeHub.open('home')")
            jp.wait_for_selector("#fi-home [data-fi-join]", timeout=12000)
            card = jp.inner_text("#fi-home"); assert "Camp invited you to Lantern Run" in card and "Not now" in card, card
            shot(jp, "home-invite")
            jp.click("#fi-home [data-fi-join]")
            jp.wait_for_function(f"TribeClient.state().project === {json.dumps(pb)}", timeout=12000)
            jp.wait_for_selector("#jw-card #jw-by", timeout=8000)
            assert "Camp invited you." in jp.inner_text("#jw-card"), jp.inner_text("#jw-card")
            assert any(p["id"] == pb for p in ok(api("/me", token=jay))["projects"]), "Jay is in Lantern Run after Join"
            shot(jp, "joined-welcome")
            # Not now: hidden, nothing added
            pc = ok(api("/projects", "POST", {"name": "Bake Sale"}, camp))["project"]["id"]
            inv = ok(api("/friend-invites", "POST", {"to": ok(api("/me", token=jay))["member"]["id"], "project": pc}, camp))["invite"]
            ok(api(f"/friend-invites/{inv['id']}", "POST", {"answer": "later"}, jay))
            assert not ok(api("/friend-invites", token=jay))["forMe"], "Not now hides it"
            assert all(p["id"] != pc for p in ok(api("/me", token=jay))["projects"])
            # someone else's invite can't be answered for them
            inv2 = ok(api("/friend-invites", "POST", {"to": ok(api("/me", token=jay))["member"]["id"], "project": pc}, camp))["invite"]
            assert api(f"/friend-invites/{inv2['id']}", "POST", {"answer": "join"}, maya)[0] == 404
            # the profile card offers it too
            host.evaluate(f"TribeProjects.switchTo({json.dumps(pc)})"); host.wait_for_timeout(600)
            mid = ok(api("/me", token=maya))["member"]["id"]
            host.evaluate(f"TribeProfiles.open({json.dumps(mid)})")
            host.wait_for_selector("#pf-pop [data-fi-offer]", timeout=8000)
            assert "Invite to Bake Sale" in host.inner_text("#pf-pop [data-fi-offer]")
            host.keyboard.press("Escape")

            # ---------- the join page ----------
            fr = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
            fr.on("pageerror", lambda e: errors.append(f"join: {e}"))
            once = ok(api("/invites", "POST", {"maxUses": 1}, camp))["invite"]["code"]
            fr.route("**/api/invites/*", lambda r: r.abort())
            fr.goto(f"{BASE}/join/{once}")
            fr.wait_for_function("document.querySelector('#title').textContent.includes('off right now')", timeout=10000)
            assert "remember this link" in fr.inner_text("#lead") and fr.is_visible("#again")
            assert json.loads(fr.evaluate("localStorage.getItem('tribecode.pendingJoin')"))["code"] == once
            shot(fr, "join-off-390")
            fr.unroute("**/api/invites/*"); fr.click("#again")
            fr.wait_for_selector("#form:not(.hidden)", timeout=10000)
            assert fr.evaluate("localStorage.getItem('tribecode.pendingJoin')") is None, "forgotten once it works"
            sw = fr.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll: {sw}"
            shot(fr, "join-form-390")
            ok(api("/join", "POST", {"code": once, "name": "Zed"}))   # used up -> expired
            fr.goto(f"{BASE}/join/{once}"); fr.wait_for_function("document.querySelector('#title').textContent === 'This link has expired'", timeout=10000)
            assert "Ask your friend for a new one" in fr.inner_text("#lead")
            off = ok(api("/invites", "POST", {"maxUses": 3}, camp))["invite"]["code"]; ok(api(f"/invites/{off}", "DELETE", None, camp))
            fr.goto(f"{BASE}/join/{off}"); fr.wait_for_function("document.querySelector('#title').textContent === \"This link doesn't work\"", timeout=10000)
            # already a member: says so and opens it
            ok2 = ok(api("/invites", "POST", {"maxUses": 3}, camp))["invite"]["code"]
            mm = signed_in(b, maya, "Maya", vp=(390, 844), mobile=True)
            mm.goto(f"{BASE}/join/{ok2}"); mm.wait_for_function("/already in/.test(document.querySelector('#title').textContent)", timeout=10000)
            mm.wait_for_url(f"{BASE}/", timeout=8000)
            mm.close()

            # ---------- phone: Maya's network sheet ----------
            ph = signed_in(b, maya, "Maya", via="wifi", vp=(390, 844), mobile=True)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeNetMap", timeout=20000)
            ph.evaluate("TribeNetMap.open()"); ph.wait_for_selector("#nm-sheet .nm-map", timeout=10000)
            ph.wait_for_function("[...document.querySelectorAll('#nm-sheet .nm-node')].length >= 3", timeout=8000)
            assert node(ph, "You") == "Same Wi-Fi", node(ph, "You")
            assert "meets on Camp's computer" in ph.inner_text("#nm-sheet .nm-say"), ph.inner_text("#nm-sheet .nm-say")
            assert "need Camp to turn on the internet link" in ph.inner_text("#nm-sheet .nm-say")
            assert ph.locator("#nm-sheet [data-nm='internet']").count() == 0, "only the host can turn it on"
            sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll: {sw}"
            r = ph.evaluate("(() => { const m = document.querySelector('#nm-sheet .nm-map').getBoundingClientRect(); return [...document.querySelectorAll('#nm-sheet .nm-node')].every(n => { const b = n.getBoundingClientRect(); return b.left >= m.left - 1 && b.right <= m.right + 1; }); })()")
            assert r, "every node inside the picture"
            shot(ph, "sheet-390")
            b.close()
        bad = [e for e in errors if "Failed to fetch" not in e and "WebSocket" not in e and "net::ERR" not in e]
        assert not bad, bad
        print("e2e_network_easy: all ok")
    finally:
        srv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
