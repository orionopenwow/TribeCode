"""Easy start (feat/easy-start, docs/SEAMLESS-PLAN.md): someone who has never coded gets from nothing to a first version
they changed, with nothing to set up, and the app says so plainly wherever something needs the tribe online.

A. The website (app/ui served as plain files: no TribeCode behind the page, like tribecode.org/app):
   Home takes one sentence -> a first version, made in this browser with no question asked and no "needs the tribe
   online" card. Keep editing opens App Creator; a change says "Saved on this device" and survives a reload. The
   dashboard shows what was made and one next step, also after a reload. The vision editor is one plain box (no
   "For whom / Done for v1 / Out of scope" template). A second idea (a website) and Motion Studio save on the device
   too. Bringing an AI in says it needs the tribe online, with the one button.
B. The desktop app (the bundled page at tauri.localhost under its CSP, window.__TAURI__ stubbed, a real server):
   the same sentence makes the first version without starting anything. "Put this tribe online" with a server that
   will not start shows the new screen (what happened, what to try, details, nothing lost); Keep working here closes
   it and the project is untouched; Try again with the first spot busy starts on the next one and the project, with
   the app that was designed, is on this computer.
C. The server started the way the desktop app starts it with no folder chosen (--dir "") comes up.
Usage: python app/test/e2e_easy_start.py [--shots DIR]
"""
import base64, functools, hashlib, http.server, json, mimetypes, os, re, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
WEB = 5890 + OFF; PORT = 5891 + OFF; DEADPORT = 5893 + OFF; EMPTY = 5894 + OFF
SRV = f"http://localhost:{PORT}"; DEAD = f"http://localhost:{DEADPORT}"
CONF = json.loads((ROOT / "app" / "src-tauri" / "tauri.conf.json").read_text())
CSP = "; ".join(f"{k} {v}" for k, v in CONF["app"]["security"]["csp"].items())
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
BAD = ("needs the tribe online", "Not saved", "did not start")
errors = []


def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, f"easy-{name}.png"))

def until(pg, js, timeout=25, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what or js}")

def watch(pg, tag):
    pg.on("pageerror", lambda e: errors.append(f"{tag}: {e}"))

def static_server():
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", WEB), functools.partial(H, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

def no_bad(pg, where):
    t = pg.inner_text("body")
    for b in BAD: assert b not in t, (where, b)

def idea(pg, text):
    pg.wait_for_selector("#hub-idea", timeout=20000) if pg.query_selector("#hub-idea") or not pg.evaluate("!!(window.TribeClient && TribeClient.connected())") else None
    pg.fill("#hub-idea", text); pg.click("#hub-idea-go")
    until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version shows")
    time.sleep(0.8)
    return pg.evaluate("(() => { const s = TribeFirstLook.state(); return { pid: s.pid, kind: s.kind, tpl: s.tpl, saved: s.saved, name: s.name }; })()")


# ---------------------------------------------------------------- A: the website, nothing behind the page
def website(p):
    static_server()
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    pg = b.new_page(viewport={"width": 1280, "height": 820}); watch(pg, "web")
    pg.goto(f"http://localhost:{WEB}/"); pg.wait_for_selector("#hub-idea", timeout=20000); time.sleep(0.6)
    hero = pg.inner_text("#hub-hero")
    assert "What do you want to make?" in hero and "Start building" in hero and "Join with a link" in hero, hero[:300]
    for jargon in ("GitHub", "repository", "server", "host"): assert jargon not in hero, ("no jargon on the first screen", jargon)
    shot(pg, "web-home")

    # 1. one sentence -> a first version; nothing asked, nothing refused
    st = idea(pg, "An app that tracks our habits")
    assert st["kind"] == "app" and st["tpl"] == "habits" and st["saved"], st
    assert pg.evaluate("TribeOffline.solo()"), "it was made in this browser"
    assert not pg.query_selector("#tn"), "no naming sheet, no where-it-lives question"
    assert not pg.query_selector("#od-needs, #nx-nudge"), "no 'needs the tribe online' card on the way"
    assert "An app that tracks our habits" in pg.evaluate("TribeClient.api('/vision').then(v => v.text)"), "the sentence is the vision"
    for a in ("Keep editing", "Make it better", "Invite a friend"): assert a in pg.inner_text("#fpv"), a
    shot(pg, "web-first")
    pid = st["pid"]

    # 2. change it: saved on this device, in the creator's own words
    pg.click('#fpv [data-fpv="edit"]'); pg.wait_for_selector("#apc-name", timeout=20000); time.sleep(0.8)
    pg.fill("#apc-name", "Our Habits"); until(pg, "document.querySelector('#apc-saved').textContent === 'Saved on this device'", 10, "App Creator says Saved on this device")
    no_bad(pg, "App Creator")
    assert pg.evaluate(f"TribePhoneLocal.designs()['{pid}'].app.name") == "Our Habits"
    shot(pg, "web-appcreator")
    pg.evaluate("TribeAppCreator.close()"); time.sleep(0.5)

    # 3. the dashboard: what was made, and one next step
    pg.evaluate("TribeApp.show('home')")
    until(pg, "!!document.querySelector('#pj-overview .db-band')", 20, "the dashboard shows what was made")
    assert pg.get_attribute("#pj-overview .db-band", "data-pick") == "phone"
    until(pg, "!!document.querySelector('#pj-check, #ns-card')", 10, "a next step is on the dashboard")
    assert not pg.query_selector("#ock-vis-in"), "no inline vision box"
    assert "Sharing and backup" in pg.inner_text("#view-home") and pg.query_selector("#sc-online"), "where it is saved, and the one button"
    shot(pg, "web-dashboard")

    # 4. the vision: one line under the name, edited in place (v0.42), holding the first sentence
    assert "An app that tracks our habits" in pg.evaluate("TribeClient.api('/vision').then(v => v.text)")
    pg.click("#pj-bio"); pg.fill("#pj-vis-in", "An app that tracks our habits, for our flat"); pg.keyboard.press("Enter"); time.sleep(0.6)
    v = pg.evaluate("TribeClient.api('/vision').then(v => v.text)")
    assert "for our flat" in v, v
    shot(pg, "web-vision")

    # 5. it is all still there after a reload, and so is the next step
    pg.reload(); until(pg, "!!(window.TribeClient && TribeClient.connected() && window.TribePhoneLocal)", 25, "back after a reload"); time.sleep(1.5)
    assert pg.evaluate(f"TribePhoneLocal.designs()['{pid}'].app.name") == "Our Habits"
    until(pg, "!!document.querySelector('#pj-check, #ns-card')", 15, "the next step is still there after a reload")
    r = pg.evaluate(f"TribeClient.api('/projects/{pid}/app-config')")
    assert r["config"]["name"] == "Our Habits" and r["canEdit"], "App Creator opens what was saved"

    # 6. a second idea, in the tribe that now exists: a website; and Motion Studio. Both save on the device
    pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("#np-idea", timeout=10000)
    pg.fill("#np-idea", "A website for my friend's bakery"); pg.click("#np-idea-go")
    until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the website's first version"); time.sleep(0.8)
    s2 = pg.evaluate("(() => { const s = TribeFirstLook.state(); return { pid: s.pid, kind: s.kind, saved: s.saved }; })()")
    assert s2["kind"] == "site" and s2["saved"], s2
    no_bad(pg, "the second idea")
    assert not pg.query_selector("#od-needs, #nx-nudge")
    pg.click('#fpv [data-fpv="edit"]'); pg.wait_for_selector("#wdz-saved", state="attached", timeout=25000); time.sleep(1.2)
    pg.evaluate("TribeSiteDesigner.ask('make it dark')")
    until(pg, "/Saved/.test(document.querySelector('#wdz-saved').textContent)", 12, "the website designer saved")
    saved = pg.evaluate("document.querySelector('#wdz-saved').textContent")
    assert "on this device" in saved and "Not saved" not in saved, saved
    no_bad(pg, "the website designer")
    pg.evaluate("TribeSiteDesigner.close()"); time.sleep(0.6)
    pg.evaluate(f"TribeMotionStudio.open({{ pid: '{s2['pid']}' }})"); pg.wait_for_selector("#mos-name", timeout=25000); time.sleep(0.8)
    pg.fill("#mos-name", "Bakery clip"); pg.press("#mos-name", "Tab")
    until(pg, "document.querySelector('#mos-saved').textContent === 'Saved on this device'", 10, "Motion Studio says Saved on this device")
    no_bad(pg, "Motion Studio")
    assert "Bakery clip" in json.dumps(pg.evaluate(f"TribePhoneLocal.designs()['{s2['pid']}'].motion"))
    pg.evaluate("TribeMotionStudio.close()"); time.sleep(0.4)
    pg.evaluate(f"TribeLaunchKit.open('{s2['pid']}')"); time.sleep(1.5); no_bad(pg, "the Launch kit"); pg.evaluate("TribeLaunchKit.close()")

    # 7. what needs the tribe online says so, with the one button
    pg.evaluate("TribeApp.show('home')"); time.sleep(0.5)
    pg.evaluate("TribeInvite.open({ who: 'claude' })"); pg.wait_for_selector("#ia-online", timeout=10000)
    t = pg.inner_text("#invite-body")
    assert "once this tribe is online" in t and "Couldn't open" not in t and "Put this tribe online" in t, t[:300]
    pg.evaluate("TribeInvite.close()")
    pg.evaluate("TribeInvite.open({ who: 'friend' })"); pg.wait_for_selector("#io-where", timeout=10000)
    assert "Put this tribe online" in pg.inner_text("#invite-body")
    pg.evaluate("TribeInvite.close()")
    b.close()


# ---------------------------------------------------------------- B: the desktop app
def serve(route):
    path = route.request.url.split("#")[0].split("?")[0].replace("http://tauri.localhost/", "") or "index.html"
    f = UI / path
    if f.is_dir(): f = f / "index.html"
    if not f.is_file(): return route.fulfill(status=404, body="not found")
    body, headers = f.read_bytes(), {"Content-Type": mimetypes.guess_type(str(f))[0] or "application/octet-stream"}
    if f.suffix == ".html":   # Tauri adds a hash for every inline script of a bundled page
        hs = ["'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode()).digest()).decode() for m in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", body.decode(), re.S)]
        headers["Content-Security-Policy"] = CSP.replace("script-src 'self'", "script-src 'self' " + " ".join(hs))
    route.fulfill(status=200, body=body, headers=headers)

# host_start by mode (kept in localStorage so it survives the reload after the move):
#   dead   nothing ever answers on any spot (another program holds them)
#   crash  the server stops at once with a line about its folder
#   busy   the first spot (4747) never answers, the next one is the real server
STUB = """
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
  window.__TAURI_INTERNALS__ = {}; window.__inv = [];
  const mode = () => localStorage.getItem('test.hostMode') || 'dead';
  let logs = [];
  window.__TAURI__ = { core: { invoke: async (c, a) => { window.__inv.push([c, a && a.port, a && a.dir]);
      if (c === 'host_start') { const m = mode(); logs = [];
        if (m === 'crash') { logs = ['Could not open the tribe folder Z:\\\\gone: ENOENT no such file or directory', '[server stopped, exit code Some(1)]']; return '%(dead)s'; }
        if (m === 'busy') return a.port === 4747 ? '%(dead)s' : '%(srv)s';
        return '%(dead)s'; }
      if (c === 'host_log') return logs; if (c === 'host_status') return null; return null; } },
    app: { getVersion: async () => '%(ver)s' }, path: { homeDir: async () => '/home/tester' },
    window: { getCurrentWindow: () => ({ close: async () => {}, minimize: async () => {}, toggleMaximize: async () => {} }) },
    event: { listen: async () => () => {} }, shell: { open: async () => {} } };
  try { localStorage.setItem('tribecode.personalized', '1'); localStorage.setItem('tribecode.flint.tour', 'done'); localStorage.setItem('tribecode.firstrun.done', '1'); } catch (e) {}
""" % {"dead": DEAD, "srv": SRV, "ver": CONF["version"]}

def desktop(p, tmp):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ui", str(UI), "--ollama", "http://localhost:9", "--exit-with-parent"],
                           stdin=subprocess.PIPE, stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(SRV + "/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,IsolateSandboxedIframes"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(STUB); ctx.route("http://tauri.localhost/**", serve)
        pg = ctx.new_page(); watch(pg, "desktop")
        pg.on("console", lambda m: "Content Security Policy" in m.text and "about:srcdoc" not in (m.location or {}).get("url", "") and "blob:" not in m.text and errors.append("csp: " + m.text[:200]))
        pg.goto("http://tauri.localhost/"); until(pg, "!!document.querySelector('#hub-idea')", 40, "the desktop app's fresh Home")
        assert pg.evaluate("TribeHost.isDesktop")

        # 1. the sentence makes the first version without starting anything on this computer
        pg.fill("#hub-idea", "An app that tracks our habits"); pg.click("#hub-idea-go")
        until(pg, "!!document.querySelector('#fpv .fpv-acts')", 40, "the first version in the desktop app"); time.sleep(0.8)
        assert pg.evaluate("TribeOffline.solo()") and not pg.evaluate("window.__inv.some(x => x[0] === 'host_start')"), "nothing was started, so nothing could fail"
        pid = pg.evaluate("TribeFirstLook.state().pid")
        pg.evaluate("document.querySelector('#fpv [data-fpv=\"edit\"]').click()"); until(pg, "!!document.querySelector('#apc-name')", 20, "App Creator")
        time.sleep(0.8)
        pg.evaluate("(() => { const i = document.querySelector('#apc-name'); i.value = 'Desk Habits'; i.dispatchEvent(new Event('input', { bubbles: true })); })()")
        until(pg, "document.querySelector('#apc-saved').textContent === 'Saved on this device'", 10, "Saved on this device in the desktop app")
        no_bad(pg, "desktop App Creator")
        pg.evaluate("TribeAppCreator.close()"); time.sleep(0.4); pg.evaluate("TribeApp.show('home')")
        until(pg, "!!document.querySelector('#sc-online')", 20, "Sharing and backup")
        until(pg, "!!document.querySelector('#pj-check, #ns-card')", 10, "a next step in the desktop app")

        # 2. the server will not start: the new screen, and it never traps
        pg.evaluate("document.querySelector('#sc-online').click()")
        until(pg, "!!document.querySelector('#su-fail #su-retry')", 60, "the failure screen")
        t = pg.evaluate("document.querySelector('#su-computer').innerText")
        assert "It’s still on this device, and it still works." in t and "Nothing was lost" in t, t
        assert "Other programs on this computer are using the spots TribeCode needs." in t and "Restart your computer, then press Try again." in t, t
        assert "Details for support" in t and pg.evaluate("!!document.querySelector('#su-copy')")
        assert pg.evaluate("document.querySelector('#su-prog').hidden && getComputedStyle(document.querySelector('#su-prog')).display === 'none'"), "the spinner is gone once it failed"
        ports = pg.evaluate("window.__inv.filter(x => x[0] === 'host_start').map(x => x[1])")
        assert ports[:2] == [4747, 4748] and len(ports) >= 3, ("it tried spare spots before giving up", ports)
        assert pg.evaluate("window.__inv.filter(x => x[0] === 'host_start').every(x => x[2] === '/home/tester/TribeCode')"), "never an empty folder"
        shot(pg, "desk-failed")
        pg.evaluate("document.querySelector('#su-offline').click()"); time.sleep(0.6)
        assert not pg.evaluate("!!document.querySelector('#su-computer')"), "Keep working here closes it"
        assert pg.evaluate("TribeOffline.solo()") and pg.evaluate(f"TribePhoneLocal.designs()['{pid}'].app.name") == "Desk Habits", "the project is untouched"
        assert pg.evaluate("!!document.querySelector('#sc-online')"), "and the way to try again stays on the dashboard"

        # 2b. it stopped because of its folder: other words, and the one thing to try
        pg.evaluate("localStorage.setItem('test.hostMode', 'crash')")
        pg.evaluate("document.querySelector('#sc-online').click()")
        until(pg, "!!document.querySelector('#su-fail #su-retry')", 60, "the failure screen (folder)")
        t = pg.evaluate("document.querySelector('#su-fail').textContent")
        assert "could not save into its folder" in t and "Settings › Storage" in t and "Z:\\gone" in t, t

        # 3. Try again with the first spot busy: the next one answers, and the project moves with its app
        pg.evaluate("localStorage.setItem('test.hostMode', 'busy'); window.__inv = []")
        pg.evaluate("document.querySelector('#su-retry').click()")
        until(pg, "!!(window.TribeClient && TribeClient.connected() && window.TribeOffline && !TribeOffline.active() && TribeClient.state().tribe)", 90, "the tribe is on this computer")
        time.sleep(4)   # the desktop page reloads once more by itself the first time (it clears an old service worker)
        until(pg, "!!(window.TribeClient && TribeClient.connected() && window.TribeOffline && !TribeOffline.active() && TribeClient.state().tribe)", 60, "settled on this computer")
        assert pg.evaluate("TribeStore.get().server.url") == SRV and pg.evaluate("TribeStore.get().hosting") is True
        until(pg, "(window.TribeProjects && TribeProjects.list().length) > 0", 20, "its project")
        projs = pg.evaluate("TribeProjects.list().map(p => ({ id: p.id, name: p.name }))")
        assert any(x["name"] == "Habits App" for x in projs), projs
        hp = next(x["id"] for x in projs if x["name"] == "Habits App")
        cfg = pg.evaluate(f"TribeClient.api('/projects/{hp}/app-config')")
        assert cfg["config"] and cfg["config"]["name"] == "Desk Habits", ("the app that was designed in the browser came along", str(cfg)[:300], open(tmp / "log").read()[-500:])
        v = pg.evaluate(f"TribeClient.api('/vision', {{ project: '{hp}' }})")
        assert "An app that tracks our habits" in v["text"]
        assert not pg.evaluate("!!localStorage.getItem('tribecode.offlineDemo.v1')"), "the device let go of its copy only after the host had it"
        shot(pg, "desk-moved")
        b.close()
    finally:
        srv.kill()


# ---------------------------------------------------------------- C: the server with no folder chosen
def empty_dir(tmp):
    home = tmp / "home"; home.mkdir()
    env = {**os.environ, "HOME": str(home), "USERPROFILE": str(home), "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(EMPTY), "--dir", "", "--name", "", "--ui", str(UI), "--ollama", "http://localhost:9"], stdout=open(tmp / "log2", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        ok = False
        for _ in range(60):
            try: ok = json.load(urllib.request.urlopen(f"http://localhost:{EMPTY}/api/health", timeout=1))["ok"]; break
            except Exception: time.sleep(0.25)
        assert ok, "the server starts with an empty --dir: " + (tmp / "log2").read_text()[-600:]
        assert (home / "TribeCode").is_dir(), "it used its usual folder"
    finally: srv.kill()
    bad = subprocess.run(["node", str(ROOT / "server" / "index.js"), "--port", str(EMPTY), "--dir", str(tmp / "log2" / "x")], capture_output=True, text=True, env=env, timeout=30)
    assert bad.returncode == 1 and "Could not open the tribe folder" in bad.stderr and "at " not in bad.stderr.split("\n")[1:2].__str__(), bad.stderr[:300]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-easy-", dir="/tmp"))
    empty_dir(tmp)
    with sync_playwright() as p:
        website(p)
        desktop(p, tmp)
    assert not errors, errors[:6]
    print("e2e_easy_start: ok")


if __name__ == "__main__":
    main()
