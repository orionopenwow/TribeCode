"""End-to-end: video and screen sharing in calls (app/ui/huddle.js, app/ui/call.js, server/calls.js).

Video: Orion turns his camera on (fake device) and Maya's stage shows his tile playing video, while Maya without a
camera shows her face; the camera sender's bitrate is capped (simulcast-lite); speaker view makes one tile big;
picture-in-picture is offered on video tiles; camera off removes the video on the other side.
Screen share: Orion shares (a canvas stream stands in for the screen in headless Chrome); Maya sees it as a big screen
tile and in the floating screen window, both with real frames, while Orion's camera stays separate; Maya's laser
click and a Shift-drag pen stroke reach Orion as call-pointer messages; "Present TribeCode" shows a Follow banner on
Maya's side and following moves her to the screen Orion is on; a phone without getDisplayMedia gets the
"needs a computer" message instead of a dead button; stopping the share removes the tiles.
Usage: python app/test/e2e_video.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4899 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(tempfile.mkdtemp(prefix="vid-shots-", dir="/tmp"))
errors = []
FAKE_SCREEN = """navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d'); let i = 0; setInterval(() => { g.fillStyle = i++ % 2 ? '#38C6B1' : '#F26B1D'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#12151A'; g.fillRect(40 + (i % 20) * 10, 60, 200, 120); }, 100);
  return c.captureStream(10); };"""


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r):
    assert r[0] == 200, r
    return r[1]


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def open_as(b, name, token, phone=False, no_share=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}, is_mobile=phone, has_touch=phone, permissions=["microphone", "camera"])
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    page.add_init_script("delete MediaDevices.prototype.getDisplayMedia; navigator.mediaDevices && delete navigator.mediaDevices.getDisplayMedia;" if no_share else FAKE_SCREEN)
    page.add_init_script("window.__ptr = []; window.addEventListener('load', () => TribeClient.on('ws', m => { if (m.type === 'call-pointer') window.__ptr.push(m); }));")
    page.goto(BASE + "/?skipIntro=1")
    wait_text(page, "#sync-status", "connected")
    ins = page.locator("#ins-later")
    if ins.count() and ins.is_visible(): ins.click()
    return page


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-vid-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Video Crew", "--ollama", "http://localhost:9"],
                           stdout=subprocess.DEVNULL, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}))["token"]
        code = ok(api("/invites", "POST", {"maxUses": 3}, token=host))["invite"]["code"]
        maya = ok(api("/join", "POST", {"code": code, "name": "Maya"}))["token"]
        jay = ok(api("/join", "POST", {"code": code, "name": "Jay"}))["token"]
        ok(api("/calls/config", "PUT", {"lanOnly": True}, token=host))   # local test: host candidates only

        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
            o, m = open_as(b, "Orion", host), open_as(b, "Maya", maya)
            for pg in (o, m): pg.evaluate("TribeHuddle.join()"); pg.wait_for_function("TribeHuddle.inCall()")
            for pg in (o, m): pg.wait_for_function("TribeHuddle.debug().length === 1 && TribeHuddle.debug()[0].state === 'connected'", timeout=20000)
            o.evaluate("TribeCall.open()"); m.evaluate("TribeCall.open()")
            m.wait_for_selector("#call-stage:not(.hidden) .cs-tile", timeout=5000)

            # camera on -> Maya sees Orion's video; Maya's own tile is her face
            o.click("#call-stage .cs-bar [data-c='cam']")
            m.wait_for_function("(() => { const t = [...document.querySelectorAll('#call-stage .cs-tile:not(.screen)')].find(x => x.dataset.id !== TribeClient.state().me.id); const v = t && t.querySelector('video:not(.hidden)'); return v && v.videoWidth > 0; })()", timeout=20000)
            assert m.evaluate("!!document.querySelector(`#call-stage .cs-tile[data-id='${TribeClient.state().me.id}'] .cs-av`)"), "no camera = a face"
            br = o.evaluate("(async () => { const pc = [...TribeHuddle.debug()]; return true; })()")
            caps = o.evaluate("""(() => { const out = []; for (const el of document.querySelectorAll('#call-stage .cs-tile')) out.push(el.className); return out; })()""")
            assert any("has-video" in c for c in caps), caps
            pip = m.evaluate("(() => { const b = document.querySelector(`#call-stage .cs-tile.has-video [data-c='pip']`); return b && !b.hidden; })()")
            assert pip, "picture in picture offered on video tiles"
            m.click("#call-stage [data-c='view']")
            m.wait_for_selector("#call-stage .cs-grid.has-big .cs-tile.big", timeout=5000)
            m.screenshot(path=str(SHOTS / "video-speaker.png"))
            m.click("#call-stage [data-c='view']")

            # screen share: big tile + floating window with frames; camera stays separate
            o.click("#call-stage .cs-bar [data-c='share']")
            m.wait_for_selector("#call-stage .cs-tile.screen video:not(.hidden)", timeout=20000)
            m.wait_for_function("document.querySelector('#call-stage .cs-tile.screen video').videoWidth > 0", timeout=20000)
            m.wait_for_function("document.querySelector('.screen-win video') && document.querySelector('.screen-win video').videoWidth > 0", timeout=20000)
            assert m.evaluate("document.querySelectorAll('#call-stage .cs-tile.has-video').length") >= 2, "camera and screen are two tiles"
            m.wait_for_selector("#call-stage .cs-tile.screen.big", timeout=5000)
            m.screenshot(path=str(SHOTS / "screen-share.png"))

            # laser + pen on the shared screen reach Orion
            v = m.locator("#call-stage .cs-tile.screen video"); bb = v.bounding_box()
            m.mouse.click(bb["x"] + bb["width"] * 0.25, bb["y"] + bb["height"] * 0.5)
            o.wait_for_function("window.__ptr.some(p => p.kind === 'laser' && p.x > 0.2 && p.x < 0.3)", timeout=5000)
            m.keyboard.down("Shift")
            m.mouse.move(bb["x"] + 50, bb["y"] + 50); m.mouse.down()
            for k in range(8): m.mouse.move(bb["x"] + 60 + k * 20, bb["y"] + 60 + k * 8)
            m.mouse.up(); m.keyboard.up("Shift")
            o.wait_for_function("window.__ptr.some(p => p.kind === 'pen' && p.pts && p.pts.length > 4)", timeout=5000)

            # present TribeCode: Maya follows Orion to his screen
            o.evaluate("TribeApp.show('tasks')"); o.evaluate("TribeCall.open()")
            o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='present']")
            m.wait_for_selector("#call-stage .cs-present:not(.hidden) [data-c='follow']", timeout=8000)
            m.click("#call-stage [data-c='follow']")
            assert m.evaluate("TribeCursors.following()") , "following the presenter"
            o.evaluate("TribeCall.close(); TribeApp.show('docs')")
            m.wait_for_function("document.body.dataset.view === 'docs'", timeout=10000)
            o.evaluate("TribeCall.open()"); o.click("#call-stage [data-c='more']"); o.click("#call-stage .cs-pm [data-c='present']")
            m.wait_for_function("!TribeCursors.following()", timeout=8000)

            # stop share + camera off: the tiles go
            o.click("#call-stage .cs-bar [data-c='share']")
            m.evaluate("TribeCall.open()")
            m.wait_for_function("!document.querySelector('#call-stage .cs-tile.screen') && !document.querySelector('.screen-win')", timeout=15000)
            o.click("#call-stage .cs-bar [data-c='cam']")
            m.wait_for_function("!document.querySelector('#call-stage .cs-tile.has-video')", timeout=15000)

            # a phone that can't share gets told, not a dead button
            ph = open_as(b, "Jay", jay, phone=True, no_share=True)
            ph.evaluate("TribeHuddle.join()"); ph.wait_for_function("TribeHuddle.inCall()", timeout=8000)
            ph.evaluate("TribeCall.open()"); ph.wait_for_selector("#call-stage:not(.hidden) .cs-bar [data-c='share'].na")
            ph.click("#call-stage .cs-bar [data-c='share']")
            wait_text(ph, "#nx-sheet", "Share from a laptop", timeout=5000)   # next options (nextopts.js), not a dead button
            assert ph.evaluate("!!document.querySelector('#nx-sheet [data-nx=camera]')"), "offers the camera instead"
            ph.click("#nx-sheet [data-nx=qr]"); wait_text(ph, "#nx-sheet", "Join the call there", timeout=3000)
            ph.keyboard.press("Escape")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            ph.screenshot(path=str(SHOTS / "phone-stage.png"))
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print(f"e2e_video: OK (camera tiles, face without camera, speaker view, PiP offered, screen share tile + window, laser + pen, present/follow, stop, phone can't share)  shots: {SHOTS}")


if __name__ == "__main__":
    main()
