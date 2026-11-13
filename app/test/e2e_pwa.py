"""The browser app (docs/BROWSER-APP.md):
 - the manifest as served (fields, icons, screenshots, shortcuts, share target, file + protocol handlers, launch handler)
   and scripts/dev/pwa-audit.js (score >= 90)
 - the service worker controls the page (network first on localhost), shortcuts and web+tribecode: links open their place
 - share target: a multipart POST with text + a file is kept by the service worker, the incoming sheet shows both and
   "Send to chat" posts it; without a service worker the server redirects with the text and counts the file
 - file handler path (incoming sheet for an opened .md), the Badging API (stubbed) from unread counts, the wake lock in a
   huddle (stubbed), Settings › This device (storage quota), the updater pill when a new shell arrives
 - offline: with the server gone, the app page opens from cache and an uncached page shows offline.html
Screenshots: docs/screenshots/pwa-install.png (the install sheet on an Android phone), offline-page.png.
Usage: python3 app/test/e2e_pwa.py"""
import json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6140 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=20) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

# Stubs recorded in window.__pwa: the Badging API and the Wake Lock API.
STUBS = """(() => {
  window.__pwa = { badge: [], wake: 0, released: 0 };
  Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: n => { window.__pwa.badge.push(n); return Promise.resolve(); } });
  Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: () => { window.__pwa.badge.push(0); return Promise.resolve(); } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { window.__pwa.wake++; const t = new EventTarget(); t.release = async () => { window.__pwa.released++; t.dispatchEvent(new Event('release')); }; return t; } } });
})();"""

def main():
    # ---- the manifest as served + the self-check ----
    tmp = Path(tempfile.mkdtemp(prefix="tribe-pwa-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with urllib.request.urlopen(BASE + "/manifest.webmanifest") as r:
            assert "application/manifest+json" in r.headers["Content-Type"]; man = json.loads(r.read())
        assert man["id"] == "./" and man["scope"] == "./" and man["start_url"].startswith("./")
        assert man["display_override"] == ["window-controls-overlay", "standalone"]
        assert {s["name"] for s in man["shortcuts"]} == {"New note", "Ask Flint", "Tasks", "Chat"}
        assert {s["form_factor"] for s in man["screenshots"]} == {"wide", "narrow"}
        assert {i.get("purpose", "any") for i in man["icons"]} >= {"any", "maskable", "monochrome"}
        st = man["share_target"]; assert st["method"] == "POST" and st["enctype"] == "multipart/form-data" and st["params"]["files"]
        assert {".md", ".json", ".glb", ".png"} <= set(sum(man["file_handlers"][0]["accept"].values(), []))
        assert man["protocol_handlers"][0]["protocol"] == "web+tribecode" and man["launch_handler"]["client_mode"][0] == "focus-existing"
        for u in [s["src"] for s in man["screenshots"]] + [i["src"] for i in man["icons"]] + [s["icons"][0]["src"] for s in man["shortcuts"]] + ["offline.html", "privacy.html", "terms.html", ".well-known/assetlinks.json"]:
            with urllib.request.urlopen(BASE + "/" + u) as r: assert r.status == 200, u
        a = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "pwa-audit.js"), "--json", "--url", BASE], capture_output=True, text=True)
        audit = json.loads(a.stdout); assert a.returncode == 0 and audit["score"] >= 90, [c for c in audit["checks"] if not c["ok"]]
        # the share target without a service worker: the server redirects with the text and counts files it can't keep
        boundary = "----tc"
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"text\"\r\n\r\nfrom the server\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\nPNG\r\n--{boundary}--\r\n").encode()
        op = urllib.request.build_opener(NoRedirect)
        try: op.open(urllib.request.Request(BASE + "/share-target", data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})); raise AssertionError("expected a redirect")
        except urllib.error.HTTPError as e:
            assert e.code == 303 and "share-target=1" in e.headers["Location"] and "text=from+the+server" in e.headers["Location"] and "dropped=1" in e.headers["Location"], e.headers["Location"]

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 820})
            ctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion', onboarded: true, tour: {done: true}})) } catch (e) {}")
            ctx.add_init_script(STUBS)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribePWA", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token")
            pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=15000)
            pg.wait_for_function("TribePWA.state().strategy === 'network'", timeout=8000)   # localhost: network first (dev live reload)
            pg.wait_for_function("(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); if (await c.match(location.origin + '/offline.html')) return true; } return false; })()", timeout=20000)

            # shortcuts and web+tribecode: links
            pg.goto(BASE + "/?skipIntro=1&shortcut=tasks"); pg.wait_for_function("window.TribeApp && TribeApp.view && TribeApp.view() === 'tasks'", timeout=15000)
            assert "shortcut" not in pg.url
            pg.goto(BASE + "/?skipIntro=1&protocol=" + urllib.parse.quote("web+tribecode://open/chat")); pg.wait_for_function("window.TribeApp && TribeApp.view && TribeApp.view() === 'chat'", timeout=15000)

            # share target through the service worker: text + a picture + a markdown file
            pg.evaluate("""() => {
              const f = document.createElement('form'); f.method = 'POST'; f.action = './share-target'; f.enctype = 'multipart/form-data';
              const add = (n, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); };
              add('title', 'Level ideas'); add('text', 'Fog that lifts when you light a lantern'); add('url', 'https://example.org/fog');
              const fi = document.createElement('input'); fi.type = 'file'; fi.name = 'files'; fi.multiple = true;
              const dt = new DataTransfer(); dt.items.add(new File(['# Fog\\nLift it slowly'], 'fog.md', { type: 'text/markdown' })); dt.items.add(new File([new Uint8Array([137,80,78,71])], 'lantern.png', { type: 'image/png' }));
              fi.files = dt.files; f.appendChild(fi); document.body.appendChild(f); f.submit(); }""")
            pg.wait_for_selector("#pwa-in .pwa-in-card", timeout=15000)
            t = pg.inner_text("#pwa-in")
            assert "SHARED TO TRIBECODE" in t.upper() and "Fog that lifts" in t and "fog.md" in t and "lantern.png" in t, t
            assert "share-target" not in pg.url, pg.url
            assert pg.evaluate("caches.open('tribecode-runtime').then(c => c.match('__share/meta')).then(r => !r)"), "read once, then forgotten"
            pg.click("#pwa-in [data-pin='chat']")
            pg.wait_for_function("TribeApp.view() === 'chat' && !document.querySelector('#pwa-in')", timeout=8000)
            for _ in range(40):
                if any("Fog that lifts" in (m.get("text") or "") and "example.org/fog" in m["text"] for m in api("/chat/general?limit=50", token=tok)[1]["messages"]): break
                time.sleep(0.25)
            else: raise AssertionError("the shared text reached the chat")
            # Share… in a message's menu (the Web Share API)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-list .msg[data-id]", timeout=8000)
            pg.evaluate("Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared = d; } })")
            pg.evaluate("[...document.querySelectorAll('#chat-list .msg.dx[data-id]:not(.sys)')].pop().querySelector('.msg-more').click()")
            pg.wait_for_selector("#msg-menu [data-pwa-share]")
            pg.click("#msg-menu [data-pwa-share]"); pg.wait_for_function("window.__shared && window.__shared.text.length > 0", timeout=5000)

            # the server fallback's redirect shows the text and says the file didn't come through
            pg.goto(BASE + "/?skipIntro=1&share-target=1&text=hello+there&dropped=1"); pg.wait_for_selector("#pwa-in", timeout=15000)
            assert "hello there" in pg.inner_text("#pwa-in") and "couldn't come through" in pg.inner_text("#pwa-in")
            pg.click("#pwa-in .pwa-in-acts [data-pin='close']")

            # a file opened with TribeCode (what launchQueue hands over): Open as a note
            pg.evaluate("TribePWA.incoming({ kind: 'file', files: [new File(['Plan\\n- fog\\n- lanterns'], 'plan.md', { type: 'text/markdown' })] })")
            pg.wait_for_selector("#pwa-in [data-pin='fnote']"); assert "OPENED WITH TRIBECODE" in pg.inner_text("#pwa-in").upper()
            pg.click("#pwa-in [data-pin='fnote']"); pg.wait_for_function("!document.querySelector('#pwa-in')", timeout=8000)

            # the Badging API (stubbed): unread notifications + DMs on the app icon
            pg.evaluate("window.TribeNotify.state = () => ({ unread: 4, items: 4, pending: 0 })")
            pg.wait_for_function("window.__pwa.badge.includes(4)", timeout=9000)
            pg.evaluate("window.TribeNotify.state = () => ({ unread: 0, items: 0, pending: 0 })")
            pg.wait_for_function("window.__pwa.badge[window.__pwa.badge.length - 1] === 0", timeout=9000)

            # the wake lock (stubbed) only while in a huddle
            pg.evaluate("window.__inCall = true; window.TribeHuddle.inCall = () => window.__inCall")
            assert pg.evaluate("TribePWA.wake()") is True and pg.evaluate("window.__pwa.wake") == 1
            pg.evaluate("window.__inCall = false"); assert pg.evaluate("TribePWA.wake()") is False and pg.evaluate("window.__pwa.released") == 1

            # Settings › This device: the quota and "Keep it on this device"
            pg.evaluate("TribeSettings.open('storage')"); pg.wait_for_selector("#set-device .pwa-store", timeout=8000)
            assert "used on this device" in pg.inner_text("#set-device")
            pg.evaluate("TribeSettings.close()")

            # a new shell from the service worker: the updater's own pill says Restart to update
            pg.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'tribe-sw-updated', version: '99.0.0' } }))")
            pg.wait_for_selector("#update-btn.ready:not(.hidden)", timeout=8000)
            assert pg.inner_text("#update-btn").strip() == "Restart to update"

            # the install sheet on an Android phone, with the browser's install offer (screenshot)
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2,
                               user_agent="Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36")
            ph.add_init_script(f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Maya', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); sessionStorage.setItem('tribecode.installSheet', '1') }} catch (e) {{}}")
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append("phone " + str(e)))
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeWeb", timeout=20000)
            pp.evaluate("TribeApp.show('chat')"); pp.wait_for_timeout(1200)
            pp.evaluate("const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' }); dispatchEvent(e); TribeWeb.showInstallSheet()")
            pp.wait_for_selector("#install-sheet #ins-install:not(.hidden)", timeout=5000)
            pp.wait_for_timeout(400); pp.screenshot(path=str(SHOTS / "pwa-install.png"))
            ph.close()

            # ---- offline: the server is gone ----
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("navigator.serviceWorker.controller && window.TribePWA", timeout=15000); pg.wait_for_timeout(800)
            srv.terminate(); srv.wait(timeout=10)
            pg.goto(BASE + "/?skipIntro=1&shortcut=chat")
            pg.wait_for_function("document.title === 'TribeCode' && !!document.querySelector('#settings-modal, .side, #rail-logo')", timeout=15000)
            pg.goto(BASE + "/join/abc123")
            pg.wait_for_selector("#offline h1", timeout=10000)
            assert "You're offline" in pg.inner_text("#offline h1")
            assert pg.locator("#off-retry").count() == 1
            pg.set_viewport_size({"width": 430, "height": 860}); pg.wait_for_timeout(400)
            pg.screenshot(path=str(SHOTS / "offline-page.png"))
            b.close()
    finally:
        if srv.poll() is None: srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("e2e_pwa: OK (manifest, audit, shortcuts, protocol, share target, file handler, badge, wake lock, storage, update pill, offline)")

if __name__ == "__main__":
    main()
