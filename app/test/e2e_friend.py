"""Friend-link test: the first-visit web intro, joining from an iPhone via a private device link (/m/<key>/)
that keeps the Home Screen app signed in, revoking that link, and the "Share beyond my Wi-Fi" status.
Usage: python app/test/e2e_friend.py   (saves docs/screenshots/intro-1.png, intro-final.png, phone-install-sheet.png)"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4791 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))


def connected(page, timeout=10000):
    page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=timeout)


def token_of(page):
    return page.evaluate("TribeStore.get().server.token")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-f-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- 1. fresh browser: intro -> onboarding ----
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            host.goto(BASE)
            host.wait_for_selector("#intro")
            assert host.get_attribute("#intro", "data-panel") == "0"
            assert host.locator("#intro .intro-panel").count() == 5
            assert "cooperative" in host.inner_text('.intro-panel[data-i="0"]').lower()
            host.wait_for_function("[...document.querySelectorAll('.intro-art img')].every(i => i.complete && i.naturalWidth > 0)")
            host.wait_for_timeout(300); host.screenshot(path=str(SHOTS / "intro-1.png"))
            host.keyboard.press("ArrowRight")
            assert host.get_attribute("#intro", "data-panel") == "1"
            host.click("#intro-next")
            assert host.get_attribute("#intro", "data-panel") == "2"
            # swipe left with the mouse/finger
            host.mouse.move(900, 450); host.mouse.down(); host.mouse.move(700, 455, steps=6); host.mouse.move(500, 460, steps=6); host.mouse.up()
            host.wait_for_function("document.querySelector('#intro').dataset.panel === '3'")
            host.click('[data-dot="4"]')
            assert "Open TribeCode in your browser" in host.inner_text("#intro-open")
            dl = host.inner_text("#intro-download")
            assert dl.startswith("Download for "), dl
            assert host.get_attribute("#intro-download", "href").endswith("/releases/latest")
            host.wait_for_timeout(350); host.screenshot(path=str(SHOTS / "intro-final.png"))
            host.click("#intro-open")
            host.wait_for_selector("#intro", state="detached")
            assert host.locator("#onboard:not(.hidden)").count() == 1, "intro hands off to first-run setup"
            assert host.locator("#chat-list .solo-empty").count() == 1, "solo mode: friendly chat empty state"
            host.reload(); host.wait_for_selector("#onboard:not(.hidden)")
            host.wait_for_timeout(200)
            assert host.locator("#intro").count() == 0, "the intro is shown once"
            host.click("#ob-next"); host.fill("#ob-name", "Orion"); host.click("#ob-skip")
            connected(host)
            htok = token_of(host)
            # palette: desktop app entry in a browser
            host.keyboard.press("Control+k"); host.fill("#pal-input", "desktop app")
            assert "Get the desktop app" in host.inner_text("#pal-list"); host.keyboard.press("Escape")

            # ---- 2. arriving via /join/<code> skips the intro ----
            st, inv = api("/invites", "POST", {"maxUses": 10}, htok); assert st == 200, inv
            code = inv["invite"]["code"]
            friend = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(friend, "friend")
            friend.goto(f"{BASE}/join/{code}")
            friend.wait_for_selector("#form:not(.hidden)")
            assert friend.locator("#intro").count() == 0
            friend.fill("#name", "Jay"); friend.click("#go")
            friend.wait_for_url(BASE + "/")
            friend.wait_for_selector("#onboard:not(.hidden)")
            friend.wait_for_timeout(200)
            assert friend.locator("#intro").count() == 0, "joined via link: no intro"
            # ...and the intro's own "Have an invite link?" field joins too
            fresh = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(fresh, "fresh")
            fresh.goto(BASE); fresh.wait_for_selector("#intro")
            fresh.click('[data-dot="4"]'); fresh.fill("#intro-link", f"{BASE}/join/{code}"); fresh.click("#intro-join")
            fresh.wait_for_selector("#jn-name"); fresh.fill("#jn-name", "Kai"); fresh.click("#jn-go")
            connected(fresh)

            # ---- 3. iPhone: join -> /m/<key>/ -> Home Screen app signed in -> revoke ----
            phone = b.new_context(**PHONE).new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{code}")
            phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya"); phone.click('[data-c="#38C6B1"]'); phone.click("#go")
            phone.wait_for_url("**/m/*/")
            key = phone.url.rstrip("/").split("/m/")[1]
            assert len(key) >= 32, key
            phone.wait_for_selector("#install-sheet.ins-bottom")
            arrow = phone.locator(".ins-arrow").bounding_box()
            assert arrow["y"] > 700 and abs(arrow["x"] + arrow["width"] / 2 - 195) < 12, f"arrow points at Safari's Share button: {arrow}"
            connected(phone)
            assert phone.locator("#onboard:not(.hidden)").count() == 0, "phones skip desktop setup"
            phone.wait_for_timeout(450); phone.screenshot(path=str(SHOTS / "phone-install-sheet.png"))
            phone.click("#ins-later")
            man = json.loads(urllib.request.urlopen(f"{BASE}/m/{key}/manifest.webmanifest").read())
            assert man["start_url"] == f"/m/{key}/" and man["scope"] == f"/m/{key}/", man
            assert phone.evaluate("document.querySelector('link[rel=manifest]').href") == f"{BASE}/m/{key}/manifest.webmanifest"
            assert urllib.request.urlopen(f"{BASE}/m/{key}/tokens.css").status == 200
            assert urllib.request.urlopen(f"{BASE}/m/{key}/assets/apple-touch-icon.png").status == 200
            assert urllib.request.urlopen(f"{BASE}/m/{key}").geturl().endswith(f"/m/{key}/")

            # the installed Home Screen app: a brand-new context with empty storage, running standalone
            home_ctx = b.new_context(**PHONE)
            home_ctx.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
            home = home_ctx.new_page(); watch(home, "homescreen")
            home.goto(f"{BASE}/m/{key}/")
            connected(home)
            home.wait_for_function("TribeClient.state().me && TribeClient.state().me.name === 'Maya'", timeout=8000)
            assert home.evaluate("TribeStore.get().name") == "Maya" and home.evaluate("TribeStore.get().color") == "#38C6B1"
            assert home.locator("#install-sheet").count() == 0, "already installed: no sheet"
            assert home.locator("#onboard:not(.hidden)").count() == 0 and home.locator("#intro").count() == 0
            home_tok = token_of(home)
            assert api("/me", token=home_tok)[1]["member"]["name"] == "Maya"

            # Settings -> Devices: list, then sign the device out
            home.evaluate("TribeWeb.openDevices()")
            home.wait_for_selector("#dev-list .dev")
            assert "this device" in home.inner_text("#dev-list")
            home.keyboard.press("Escape")
            # sign the Home Screen app out from Safari (e.g. a lost phone)
            phone.evaluate("TribeWeb.openDevices()")
            phone.wait_for_selector("#dev-list .dev")
            assert "this device" not in phone.inner_text("#dev-list")
            phone.click("[data-revoke]")
            phone.wait_for_selector("#dev-list .dev-empty")
            assert api("/me", token=home_tok)[0] == 401, "revoking a device signs it out"
            st, r = api("/device-link/redeem", "POST", {"key": key}); assert st == 404, r
            gone = b.new_context(**PHONE).new_page(); watch(gone, "revoked")
            gone.goto(f"{BASE}/m/{key}/")
            gone.wait_for_selector("#device-revoked")
            assert "turned off" in gone.inner_text("#device-revoked")
            assert not gone.evaluate("TribeClient.hasToken()")
            # the Safari join token itself still works (only the device link was revoked)
            assert api("/me", token=token_of(phone))[0] == 200

            # ---- 4. Share beyond my Wi-Fi: tools are missing here ----
            st, s = api("/share/public", token=htok)
            assert st == 200 and s["status"] == "unavailable" and "tailscale" in s["install"] and "cloudflared" in s["install"], s
            st, s = api("/share/public", "POST", {"provider": "tailscale"}, htok)
            assert st == 200 and s["status"] == "unavailable", s
            assert api("/share/public", "POST", {}, token_of(phone))[0] == 403, "host only"
            assert api("/share/public")[0] == 401
            assert all(x["kind"] != "public" for x in api("/health")[1]["lan"])
            # host-only toggle in the invite modal explains what to install
            host.click("#tour-invite"); host.wait_for_selector("#share-pub-t")
            host.click("#share-pub-t"); host.wait_for_selector("#share-pub-msg.warn")
            assert "cloudflared" in host.inner_text("#share-pub-msg")
            friend.click("#ob-skip"); connected(friend); friend.click("#tour-invite"); friend.wait_for_selector("#inv-qr svg")
            assert friend.locator("#share-pub").count() == 0, "toggle is host-only"
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Friend link test passed")


if __name__ == "__main__":
    main()
