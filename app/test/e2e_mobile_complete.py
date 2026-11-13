"""Mobile feature-complete (feat/mobile-complete, docs/MOBILE-COMPLETE.md).

A phone-only tribe (iPhone, 390x844, touch; offline.js solo mode + phonelocal.js) does real work with no server:
  a task and a doc; the calendar (an event, no crash); Money (an entry, the summary counts it); Work (a profile);
  the Academy (tracks from the bundled catalog); the website designer (a template, Flint "link tree website", the config
  persists over a reload, Download gives one HTML file); the Design flow builds a game Flint can tune for free and it runs
  in a sandboxed frame; Files › Code keeps files; GitHub from the phone with a token (api.github.com mocked):
  bring a repo in, edit a file, push a commit (blobs -> tree -> commit -> ref moved); host-only parts (AI helpers, the
  repository) show the "needs a computer or a host" card, and See options lists Move to a host · Free cloud · My laptop
  · and on an iPhone the plain "iPhones can't host" note. No raw "This needs a real tribe", no sideways scroll, no
  console errors.
A phone joined to a real host (Pixel): the same core flows reach the host (task, doc, website config) and nothing says
it needs a host.
Usage: python3 app/test/e2e_mobile_complete.py [--shots]
"""
import base64, functools, http.server, json, os, re, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SPORT, HPORT = 5740 + OFF, 5820 + OFF
STATIC, HOST = f"http://localhost:{SPORT}", f"http://localhost:{HPORT}"
SHOTS = "--shots" in sys.argv
SHOTDIR = Path(os.environ.get("MC_SHOTS") or tempfile.mkdtemp(prefix="tribe-mc-shots-")); SHOTDIR.mkdir(parents=True, exist_ok=True)
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PIXEL = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()

def api(method, path, body=None, token=None):
    req = urllib.request.Request(HOST + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read() or b"{}")

def wait_health(url, n=80):
    for _ in range(n):
        try: urllib.request.urlopen(url + "/api/health", timeout=2); return
        except Exception: time.sleep(0.25)
    raise SystemExit("host did not start")

def shot(pg, name):
    pg.screenshot(path=str(SHOTDIR / f"{name}.png"))

def no_sideways(pg, where):
    assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"sideways scroll: {where}"

def call(pg, method, path, body=None):
    return pg.evaluate("([m, p, b]) => TribeClient.api(p, { method: m, ...(b ? { body: b } : {}) }).then(d => ({ ok: true, d }), e => ({ ok: false, e: e.message, s: e.status }))", [method, path, body])

# ---------- a tiny GitHub (api.github.com) for the phone ----------
class FakeGH:
    def __init__(self):
        self.files = {"README.md": "# Lantern\n\nA small game.\n", "index.html": "<!doctype html><h1>Lantern</h1>", "src/game.js": "export const speed = 4;\n", "art/logo.png": None}
        self.head = "c0ffee0000000000000000000000000000000001"; self.commits = []; self.blobs = {}; self.patched = None
    def sha(self, text): return "b" + format(abs(hash(text)) % (16 ** 39), "039x")
    def handle(self, route):
        req = route.request; u = req.url.split("api.github.com", 1)[1]; m = req.method
        def j(d, s=200): route.fulfill(status=s, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(d))
        if m == "OPTIONS": return route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"})
        if "Bearer github_pat_" not in (req.headers.get("authorization") or ""): return j({"message": "Bad credentials"}, 401)
        if u == "/user": return j({"login": "rae-dev"})
        if u == "/repos/rae-dev/lantern": return j({"full_name": "rae-dev/lantern", "default_branch": "main"})
        if u.startswith("/repos/rae-dev/lantern/git/ref/heads/main"): return j({"object": {"sha": self.head}})
        if u.startswith("/repos/rae-dev/lantern/git/commits/") and m == "GET": return j({"sha": self.head, "tree": {"sha": "tree0"}})
        if u.startswith("/repos/rae-dev/lantern/git/trees/") and m == "GET":
            return j({"tree": [{"path": p, "type": "blob", "sha": self.sha(t or p), "size": len(t or "x" * 9000)} for p, t in self.files.items()]})
        if u.startswith("/repos/rae-dev/lantern/git/blobs/") and m == "GET":
            sha = u.rsplit("/", 1)[1]
            for p, t in self.files.items():
                if t is not None and self.sha(t) == sha: return j({"encoding": "base64", "content": base64.b64encode(t.encode()).decode()})
            return j({"message": "Not Found"}, 404)
        if u == "/repos/rae-dev/lantern/git/blobs" and m == "POST":
            b = json.loads(req.post_data); s = self.sha(b["content"]); self.blobs[s] = b["content"]; return j({"sha": s}, 201)
        if u == "/repos/rae-dev/lantern/git/trees" and m == "POST":
            b = json.loads(req.post_data); self.tree_items = b["tree"]; assert b["base_tree"] == "tree0"; return j({"sha": "tree1"}, 201)
        if u == "/repos/rae-dev/lantern/git/commits" and m == "POST":
            b = json.loads(req.post_data); assert b["parents"] == [self.head] and b["tree"] == "tree1"; self.commits.append(b["message"]); return j({"sha": "c0ffee0000000000000000000000000000000002", "message": b["message"]}, 201)
        if u == "/repos/rae-dev/lantern/git/refs/heads/main" and m == "PATCH":
            self.patched = json.loads(req.post_data)["sha"]; return j({"object": {"sha": self.patched}})
        return j({"message": "Not Found " + u}, 404)

def watch(pg, errors, tag):
    pg.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"{tag} console: {m.text}"))

def phone_only(b, errors):
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent=IPHONE, accept_downloads=True)
    ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false}))}catch(e){}")
    gh = FakeGH(); ctx.route("https://api.github.com/**", gh.handle)
    pg = ctx.new_page(); watch(pg, errors, "phone")
    pg.goto(STATIC + "/?skipIntro=1")
    pg.wait_for_function("window.TribePhoneHost && window.TribeOffline && window.TribePhoneLocal && window.TribeNextOpts && window.TribeGhPhone", timeout=15000)
    pg.evaluate("TribePhoneHost.open()"); pg.wait_for_selector("#ph-start"); pg.click("#ph-start [data-ph='phone']")
    pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=15000)
    pid = pg.evaluate("TribeOffline.state().projects[0].id")
    bad = []
    pg.evaluate("""() => { const f = window.fetch; window.__nope = []; window.fetch = async (i, o) => { const r = await f(i, o); try { if (r.status === 404) { const d = await r.clone().json().catch(() => ({})); if (d.error === 'This needs a real tribe') window.__nope.push(String(i && i.url || i)); } } catch {} return r; }; }""")

    # 1. a task and a doc, kept over a reload
    r = call(pg, "POST", "/tasks", {"title": "Draw the lantern sprite", "due": time.strftime("%Y-%m-%d")}); assert r["ok"], r
    r = call(pg, "POST", "/docs", {"title": "Story notes", "body": "The lantern wakes up."}); assert r["ok"], r

    # 2. calendar: an event, the view draws with no crash (it used to throw on a missing list)
    r = call(pg, "POST", "/calendar", {"title": "Playtest", "start": time.strftime("%Y-%m-%dT18:00:00.000Z"), "duration": 45}); assert r["ok"], r
    cal = call(pg, "GET", "/calendar?from=2020-01-01T00:00:00Z&to=2100-01-01T00:00:00Z"); assert cal["ok"] and len(cal["d"]["occurrences"]) == 1, cal
    pg.evaluate("TribeShell.go('calendar')"); pg.wait_for_selector("#view-calendar:not(.hidden)", timeout=8000); pg.wait_for_timeout(500)

    # 3. Money: an entry and the summary
    r = call(pg, "POST", f"/projects/{pid}/ledger", {"kind": "revenue", "label": "First sticker sale", "amount": "12.50"}); assert r["ok"], r
    s = call(pg, "GET", f"/projects/{pid}/ledger/summary?month={time.strftime('%Y-%m')}"); assert s["ok"] and s["d"]["revenue"]["total"] == 12.5, s
    pg.evaluate("TribeShell.go('money')"); pg.wait_for_function("/12\\.50/.test(document.querySelector('#view-money') && document.querySelector('#view-money').innerText)", timeout=8000)
    shot(pg, "mc-money")

    # 4. Work profile, Academy tracks
    r = call(pg, "PUT", "/talent/profile", {"skills": ["pixel art"], "open": True}); assert r["ok"] and r["d"]["profile"]["skills"] == ["pixel art"], r
    a = call(pg, "GET", "/academy"); assert a["ok"] and len(a["d"]["tracks"]) >= 5, a

    # 5. the website designer on this phone: a template via Flint, persists over a reload, Download is one HTML file
    pg.evaluate("TribeShell.go('website')"); pg.wait_for_selector("#wb-design", timeout=10000)
    pg.click("#wb-design"); pg.wait_for_selector("#wdz:not([hidden])", timeout=10000)
    pg.wait_for_selector("#wdz-in", state="attached", timeout=8000)
    form_visible = pg.is_visible("#wdz-in")
    pg.evaluate("TribeSiteDesigner.ask('link tree website')")
    pg.wait_for_function("TribeSiteDesigner.cfg() && TribeSiteDesigner.cfg().template === 'linkbio'", timeout=10000)
    pg.evaluate("TribeSiteDesigner.flush()")   # the designer saves to the "host" (phonelocal.js on this phone)
    pg.wait_for_function(f"TribeClient.api('/projects/{pid}/site-config').then(r => window.__sc = r) && window.__sc && window.__sc.config && window.__sc.config.template === 'linkbio'", timeout=10000, polling=500)
    assert form_visible, "Tell Flint box is reachable on the phone"
    shot(pg, "mc-website")
    html = pg.evaluate("TribeSiteDesigner.html ? TribeSiteDesigner.html() : (window.TribeSiteCfg && TribeSiteCfg.toHTML ? TribeSiteCfg.toHTML(TribeSiteDesigner.cfg()) : '')")
    if html: assert "<!doctype html" in html.lower() or "<html" in html.lower()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 6. the Design flow: a game from a sentence, tuned for free, running in a frame on the phone
    pg.evaluate("TribeDesignFlow.open()")
    pg.wait_for_selector("#dfl [data-kind=game]", timeout=10000)
    no_sideways(pg, "design kinds")
    pg.click("#dfl [data-kind=game]"); pg.wait_for_selector("#dfl[data-step=gallery] .dfl-tpl[data-tpl=breakout]", timeout=8000)
    pg.fill("#dfl-ask", "a faster breakout in pink"); pg.click(".dfl-tpl[data-tpl=breakout]")
    pg.wait_for_selector("#dfl[data-step=workspace] #dfl-frame", timeout=15000)
    src = pg.eval_on_selector("#dfl-frame", "f => f.srcdoc || ''")
    assert "#FF6F8E" in src, "Flint's free words set the knobs (pink bricks): " + src[src.find('window.CONFIG'):src.find('window.CONFIG') + 160]
    pg.wait_for_timeout(600)
    assert pg.frame_locator("#dfl-frame").locator("canvas").count() >= 1, "the game runs on the phone"
    no_sideways(pg, "design workspace"); shot(pg, "mc-design")

    # 7. GitHub from the phone: connect, bring a repo in, edit a file, push one commit
    pg.evaluate("TribeShell.go('repo')"); pg.wait_for_selector(".nx-card[data-nx-card=repo]", timeout=8000)
    shot(pg, "mc-repo-card")
    pg.click(".nx-card [data-gp-open]"); pg.wait_for_selector("#gp-sheet #gp-tok")
    pg.fill("#gp-tok", "not-a-token"); pg.click("#gp-go"); pg.wait_for_selector("#gp-err:not([hidden])")
    pg.fill("#gp-tok", "github_pat_11ABCDEFG0123456789"); pg.click("#gp-go"); pg.wait_for_selector("#gp-sheet #gp-repo", timeout=8000)
    pg.fill("#gp-repo", "https://github.com/rae-dev/lantern"); pg.click("#gp-imp"); pg.wait_for_selector("#gp-sheet #gp-push", timeout=10000)
    st = pg.evaluate("TribeGhPhone.status()"); assert st["repo"] == "rae-dev/lantern" and st["files"] == 3 and st["changed"] == 0, st   # the PNG is skipped
    shot(pg, "mc-github")
    tree = call(pg, "GET", "/code/tree?path=src"); assert [e["name"] for e in tree["d"]["entries"]] == ["game.js"], tree
    f = call(pg, "GET", "/code/file?path=src/game.js"); assert "speed = 4" in f["d"]["text"], f
    r = call(pg, "PUT", "/code/file", {"path": "src/game.js", "text": "export const speed = 6;\n", "message": "Faster"}); assert r["ok"], r
    assert pg.evaluate("TribeGhPhone.status().changed") == 1
    pg.evaluate("TribeGhPhone.open()"); pg.wait_for_selector("#gp-push:not([disabled])")
    pg.fill("#gp-msg", "Faster lantern from my phone"); pg.click("#gp-push")
    pg.wait_for_function("TribeGhPhone.status().changed === 0", timeout=10000)
    assert gh.commits == ["Faster lantern from my phone"] and gh.patched and gh.tree_items[0]["path"] == "src/game.js", (gh.commits, gh.patched)
    assert any("export const speed = 6" in v for v in gh.blobs.values())
    pg.evaluate("TribeGhPhone.close()")

    # 8. host-only parts: the card, See options, the iPhone note
    pg.evaluate("TribeShell.go('agents-hub')"); pg.wait_for_selector(".nx-card[data-nx-card=agents]", timeout=8000)
    assert "This needs a real tribe" not in pg.inner_text("body")
    pg.click(".nx-card[data-nx-card=agents] [data-nx-open]"); pg.wait_for_selector("#nx-sheet")
    rows = pg.eval_on_selector_all("#nx-sheet .nx-row b", "els => els.map(e => e.textContent)")
    assert rows == ["Move to a host", "Free cloud", "My laptop", "iPhones can't host"], rows
    assert pg.locator("#nx-sheet .nx-row[data-nx=iphone]").is_disabled()
    no_sideways(pg, "next options"); shot(pg, "mc-next-options")
    pg.click("#nx-sheet [data-nx=laptop]"); pg.wait_for_selector("#nx-sheet .nx-qr svg")
    pg.keyboard.press("Escape"); pg.wait_for_selector("#nx-sheet", state="detached")
    pg.evaluate("TribeShell.go('ws-agents')"); pg.wait_for_timeout(1500)

    # 9. reload: everything stayed, and no screen hit a raw "needs a real tribe"
    pg.reload(); pg.wait_for_function("TribeOffline.solo() && TribeClient.connected() && window.TribePhoneLocal", timeout=15000)
    t = call(pg, "GET", "/tasks"); assert any(x["title"] == "Draw the lantern sprite" for x in t["d"]["tasks"]), t
    sc = call(pg, "GET", f"/projects/{pid}/site-config"); assert sc["d"]["config"]["template"] == "linkbio"
    assert pg.evaluate("TribeGhPhone.status().repo") == "rae-dev/lantern"
    for k in ["home", "chat", "docs", "ws-tasks", "website", "academy", "money", "work", "calendar", "company", "market", "settings"]:
        pg.evaluate("window.__nope = window.__nope || []")
        pg.evaluate(f"TribeShell.go({json.dumps(k)})"); pg.wait_for_timeout(700); no_sideways(pg, k)
        pg.keyboard.press("Escape")
    nope = pg.evaluate("window.__nope || []")
    assert not nope, f"raw 'needs a real tribe' on: {nope}"
    ctx.close()

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-mc-"))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    host = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(HPORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                            stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        wait_health(HOST)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            phone_only(b, errors)
            joined_phone(b, errors)
            b.close()
    finally:
        host.terminate(); srv.shutdown()
    errors = [e for e in errors if "ERR_INTERNET_DISCONNECTED" not in e]
    assert not errors, "\n".join(errors[:10])
    print(f"ok e2e_mobile_complete (phone-only: task, doc, calendar, Money, Work, Academy, website designer, Design flow game, GitHub import + push, next options; joined phone: core flows on the host)  shots: {SHOTDIR}")

def joined_phone(b, errors):
    # a host tribe and an invite (the same calls the app makes)
    tok = api("POST", "/bootstrap", {"name": "Hal"})["token"]
    inv = api("POST", "/invites", {"hours": 1, "maxUses": 1}, tok)["invite"]
    j = api("POST", "/join", {"code": inv["code"], "name": "Pia", "color": "#6C7CFF"})
    ptok = j["token"]
    ctx = b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, user_agent=PIXEL)
    ctx.add_init_script(f"try{{localStorage.setItem('tribecode.settings.v1',JSON.stringify({{name:'Pia',color:'#6C7CFF',onboarded:true,server:{{url:'{HOST}',token:'{ptok}'}},hosting:false}}))}}catch(e){{}}")
    pg = ctx.new_page(); watch(pg, errors, "joined")
    pg.goto(HOST + "/?skipIntro=1")
    pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
    pid = pg.evaluate("TribeClient.project()")
    r = call(pg, "POST", "/tasks", {"title": "Pia's task"}); assert r["ok"], r
    r = call(pg, "POST", "/docs", {"title": "Pia's notes", "body": "hi"}); assert r["ok"], r
    assert any(t["title"] == "Pia's task" for t in api("GET", "/tasks", token=tok)["tasks"]), "the task reached the host"
    r = call(pg, "PUT", f"/projects/{pid}/site-config", {"config": {"name": "Lantern", "template": "linkbio", "pages": [{"id": "home", "title": "Home", "blocks": []}]}})
    assert r["ok"], r
    assert not pg.evaluate("window.TribeOffline && TribeOffline.solo && TribeOffline.solo()"), "a joined phone is not a phone-only tribe"
    pg.evaluate("TribeShell.go('agents-hub')"); pg.wait_for_timeout(1200)
    assert pg.locator(".nx-card").count() == 0, "a joined phone doesn't say it needs a host"
    no_sideways(pg, "joined agents hub"); shot(pg, "mc-joined-agents")
    ctx.close()

if __name__ == "__main__":
    main()
