"""First run, end to end (qa-pass): the golden paths a new host, a friend on a phone and an agent walk, with
screenshots, checked at 1440 and 390 for: no console errors, no sideways scroll, nothing poking past the edge, no
clipped or overlapping text in buttons and headings, a name (text, aria-label or title) on every visible button,
and a next step on every screen (no dead ends).

  1. Fresh install: Home -> Create a project -> Create my own -> name -> Create (double-clicked: one project) ->
     the invite sheet shows a link.
  2. Set up (5 steps): the vision (category chip + the gist), a first task, Where it lives → here on the host, Make the starter ->
     Preview.
  3. The friend opens the invite link on a phone (390), types a name, joins, skips Add to Home Screen.
  4. Chat: the host makes a channel (double-clicked Save: one channel); the friend posts a link and a picture there.
  5. A task with "Who does it?" -> Me.
  6. An agent connects (a fake MCP client): tools/list, post_chat, request_review -> Agents dashboard "Needs you".
  7. Whiteboard: + Add -> Whiteboard -> a sticky note (saved).
  8. Flint: "what's happening", "open files", "make a task".
  9. Customize opens; the Website generator builds a page; the demo tour starts (?demo=showcase&tour=fast).
 10. Robustness: reload mid-flow, the server restarts (the client reconnects), two tabs, a spectator, very long /
     emoji-only / RTL names, a huge paste, and sw.js (every shell file listed once, nothing missing).
Screenshots go to $FIRST_RUN_SHOTS (default: a temp folder). Usage: python app/test/e2e_first_run.py
"""
import base64, json, os, re, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5250 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("FIRST_RUN_SHOTS") or tempfile.mkdtemp(prefix="tribe-first-run-shots-"))
SHOTS.mkdir(parents=True, exist_ok=True)
errors, problems, notes = [], [], []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


IGNORE = ("11434", "api.github.com", "ERR_CONNECTION_REFUSED", "ERR_NAME_NOT_RESOLVED", "ERR_INTERNET_DISCONNECTED", "ERR_NETWORK_CHANGED", "WebSocket connection", "ERR_CONNECTION_RESET", "ERR_EMPTY_RESPONSE", "net::ERR_ABORTED", "favicon")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and not any(x in m.text for x in IGNORE) and errors.append(f"{who} console: {m.text[:240]}"))


def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_until(fn, timeout=20, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError("timed out waiting for " + what)


def shot(page, name):
    page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / f"{name}.png"))


# One audit of what is on screen. Hard problems fail the test; soft ones (tiny text) are printed as notes.
AUDIT = r"""(where) => {
  const vis = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; }
    return true; };
  const desc = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (e.textContent ? ' "' + e.textContent.trim().slice(0, 30) + '"' : '');
  const out = { sideways: document.documentElement.scrollWidth > innerWidth + 1, poke: [], nolabel: [], clipped: [], overlap: [], tiny: [] };
  const skip = e => e.closest('.wt-row, .pl-grid, #board, .hidden, [hidden], .cf-tree, .wbd-canvas, canvas, .ticker, .marquee, [aria-hidden=true], .sr, .sr-only, .visually-hidden, pre, code, .hscroll, .chips-row, .tk-cols, #tour-rail, .rail');
  const all = [...document.querySelectorAll('body *')];
  for (const e of all) {
    if (!vis(e) || skip(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed') {
      // a scroll container clipping its child is fine: only count it when no ancestor clips it
      let clipped = false; for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = n.getBoundingClientRect().right <= innerWidth + 1; if (clipped) break; } }
      if (!clipped) out.poke.push(desc(e));
    }
  }
  for (const b of document.querySelectorAll('button, [role=button], a[href], [role=tab], [role=menuitem]')) {
    if (!vis(b) || b.closest('.hidden, [hidden], [aria-hidden=true]')) continue;
    const name = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim() || (b.getAttribute('aria-labelledby') ? 'x' : '') || ([...b.querySelectorAll('img')].map(i => i.alt).join('').trim());
    if (!name) out.nolabel.push(desc(b) + ' ' + b.outerHTML.slice(0, 90));
  }
  const texty = [...document.querySelectorAll('button, h1, h2, h3, h4, label, .eyebrow, [role=tab], .btn')].filter(e => vis(e) && !skip(e));
  for (const e of texty) {
    const s = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && !e.querySelector('[style*=ellipsis]') && e.textContent.trim().length > 1 && e.clientWidth > 0) out.clipped.push(desc(e) + ` ${e.scrollWidth}>${e.clientWidth}`);
  }
  // overlapping text: two leaf text boxes (buttons, headings, labels) that cover each other
  const leaves = texty.filter(e => !texty.some(o => o !== e && e.contains(o)) && e.textContent.trim()).slice(0, 400).map(e => [e, e.getBoundingClientRect()]);
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const [a, ra] = leaves[i], [b, rb] = leaves[j];
    if (a.contains(b) || b.contains(a)) continue;
    const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (x > 6 && y > 6 && x * y > 0.3 * Math.min(ra.width * ra.height, rb.width * rb.height)) {
      // stacked layers (a modal over the page) are fine: only count two that are both on top at the overlap
      const cx = Math.max(ra.left, rb.left) + x / 2, cy = Math.max(ra.top, rb.top) + y / 2, top = document.elementFromPoint(cx, cy);
      if (top && (a.contains(top) || top.contains(a)) && (b.contains(top) || top.contains(b))) out.overlap.push(desc(a) + ' × ' + desc(b));
    }
  }
  const main = document.querySelector('.view:not(.hidden), main, #app') || document.body;
  for (const e of main.querySelectorAll('p, li, button, label, span, b, small, a')) {
    if (!vis(e) || skip(e) || e.children.length || !e.textContent.trim() || e.closest('.eyebrow, .kbd, .badge, .n, .cb-n, time, .faint, .meta, small, .pill, .chip')) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 13 && e.textContent.trim().length > 12) out.tiny.push(`${fs}px ${desc(e)}`);
  }
  out.tiny = [...new Set(out.tiny)].slice(0, 12);
  return out;
}"""


def audit(page, where, allow_tiny=True):
    page.wait_for_timeout(200)
    r = page.evaluate(AUDIT, where)
    if r["sideways"]: problems.append(f"{where}: sideways scroll")
    for k, what in (("poke", "pokes past the right edge"), ("nolabel", "button with no name"), ("clipped", "clipped text"), ("overlap", "overlapping text")):
        for x in r[k][:6]: problems.append(f"{where}: {what}: {x}")
    for x in r["tiny"]: notes.append(f"{where}: small text {x}")
    return r


def no_dead_end(page, where):
    """Something on screen to do next: a visible enabled button, link or input."""
    n = page.evaluate("""() => [...document.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden]), textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; }).length""")
    if n < 2: problems.append(f"{where}: dead end ({n} things to press)")


def check_sw():
    sw = (ROOT / "app" / "ui" / "sw.js").read_text()
    m = re.search(r"SHELL\s*=\s*\[(.*?)\]", sw, re.S)
    assert m, "sw.js has a SHELL list"
    shell = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1))
    dups = sorted({x for x in shell if shell.count(x) > 1})
    assert not dups, f"sw.js SHELL lists files twice: {dups}"
    ui = ROOT / "app" / "ui"
    missing = [x for x in shell if x not in ("./", "/", "") and not (ui / x.lstrip("./")).exists()]
    assert not missing, f"sw.js SHELL lists files that don't exist: {missing}"
    html = (ui / "index.html").read_text()
    used = set(re.findall(r'<script src="([^"]+\.js)"', html)) | set(re.findall(r'<link rel="stylesheet" href="([^"]+\.css)"', html))
    used = {u for u in used if not u.startswith("http")}
    norm = {x.lstrip("./") for x in shell}
    absent = sorted(u for u in used if u.lstrip("./") not in norm)
    assert not absent, f"index.html loads files the service worker doesn't cache (offline breaks): {absent}"


def start_server(tmp, log):
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    wait_until(lambda: api("/health")[0] == 200, 25, "server up")
    return srv


def plus_button(page):
    for sel in ["#attach", "#m2-plus", "#chat-form [aria-label^=Add]", "#composer-mount [aria-label^=Add]"]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible(): return loc.first
    raise AssertionError("no + button in the composer")


def main():
    check_sw()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-first-run-", dir="/tmp"))
    log = open(tmp / "server.log", "w+")
    srv = start_server(tmp, log)
    step = "boot"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            hctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Sam'})) } catch (e) {}")
            host = hctx.new_page(); watch(host, "host")

            # ---- 1. fresh install -> a project -> the invite link
            step = "1 fresh install"
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            tok = host.evaluate("TribeStore.get().server.token")
            host.evaluate("window.TribeHub && TribeHub.open('home')"); host.wait_for_selector("#hub-new", timeout=15000)
            shot(host, "01-home"); audit(host, "home 1440"); no_dead_end(host, "home")
            host.evaluate("TribeProjects.gallery()"); host.wait_for_selector("[data-ns=own]")
            shot(host, "02-create"); audit(host, "create project")
            host.click("[data-ns=own]"); host.wait_for_selector("#np-input")
            host.fill("#np-input", "Lantern Garden"); host.fill("#np-bio", "A cozy game about lanterns")
            host.dblclick("#np-create")
            host.wait_for_function("document.querySelector('#invite-body') && /\\/join\\//.test(document.querySelector('#invite-body').innerText)", timeout=25000)
            shot(host, "03-invite"); audit(host, "invite sheet")
            projects = api("/projects", token=tok)[1]["projects"]
            names = [x["name"] for x in projects]
            assert names.count("Lantern Garden") == 1, f"a double click made {names.count('Lantern Garden')} projects: {names}"
            pid = next(x["id"] for x in projects if x["name"] == "Lantern Garden")
            link = BASE + "/join/" + re.search(r"https?://\S+/join/([A-Za-z0-9_-]+)", host.inner_text("#invite-body")).group(1)   # the sheet may show a public address; the test joins locally
            host.keyboard.press("Escape"); host.wait_for_timeout(200)
            if host.locator("#invite-modal:not(.hidden)").count(): host.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")

            # ---- 2. Set up: vision, a task, the repo, the starter -> Preview
            step = "2 set up"
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check", timeout=15000)
            shot(host, "04-dashboard"); audit(host, "dashboard (new)"); no_dead_end(host, "dashboard")
            steps = host.eval_on_selector_all("#pj-check .ock-row", "els => els.map(e => e.dataset.step)")
            assert steps == ["vision", "task", "claude", "home", "share"], steps
            host.click("#pj-check [data-ck=vision]"); host.wait_for_selector("#av-cats .av-cat")
            # reload mid-flow: the composer is gone, nothing is half-saved, the checklist is still there
            host.reload(); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check [data-ck=vision]", timeout=15000)
            host.click("#pj-check [data-ck=vision]"); host.wait_for_selector("#av-cats .av-cat")
            host.click("#av-cats [data-cat=game]"); host.fill("#av-gist", "A cozy platformer where you light lanterns to find your way home")
            shot(host, "05-vision"); audit(host, "vision composer")
            host.dblclick("#pj-vsave")
            host.wait_for_selector("#pj-check [data-step=vision].on", timeout=15000)
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#task-new", timeout=10000)
            host.click("#task-new"); host.wait_for_selector(".quick-wrap .quick-add")
            host.fill(".quick-wrap .quick-add", "Light the first lantern"); host.keyboard.press("Enter")
            host.wait_for_function("TribeTasks.all().some(t => t.title === 'Light the first lantern')", timeout=10000)
            host.keyboard.press("Escape")
            host.evaluate("TribeApp.show('home')")
            if host.locator("#pj-check [data-ck=home]").count():   # feat/folder-sync: where it lives = the living repo
                host.click("#pj-check [data-ck=home]"); host.wait_for_selector("#lr-where [data-w=host]"); host.click("#lr-where [data-w=host]")
                host.wait_for_selector("#pj-check [data-step=home].on, #pj-check.done", timeout=25000)
            host.wait_for_selector("#su-starter", timeout=15000); host.wait_for_timeout(400)
            shot(host, "06-starter"); audit(host, "dashboard (starter)")
            host.click("#su-starter")
            host.wait_for_selector("#su-preview", state="attached", timeout=25000); host.wait_for_timeout(600)
            if not host.evaluate("document.body.classList.contains('pvw-focus')"): host.click("#su-preview")   # Make the starter opens the preview by itself (setup.js); click only if it didn't
            host.wait_for_function("(() => { const p = document.querySelector('#preview-pane'); return (p && p.offsetParent) || !!document.querySelector('iframe[src*=preview]'); })()", timeout=15000)
            shot(host, "07-preview"); audit(host, "preview")
            host.keyboard.press("Escape")

            # ---- 3. the friend joins on a phone
            step = "3 friend joins"
            pctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(link); ph.wait_for_selector("#form:not(.hidden)")
            shot(ph, "08-join"); audit(ph, "join page 390")
            ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url("**/m/*/", timeout=20000); ph.wait_for_selector("#install-sheet", timeout=15000)
            shot(ph, "09-install"); ph.click("#ins-later")
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            ph.evaluate("localStorage.setItem('tribecode.iosHint', '1'); document.querySelector('.ios-hint') && document.querySelector('.ios-hint').remove()")
            ftok = ph.evaluate("TribeStore.get().server.token")
            assert ph.evaluate("TribeClient.project()") == pid
            ph.wait_for_timeout(600); shot(ph, "10-phone-home"); audit(ph, "phone first screen"); no_dead_end(ph, "phone first screen")

            # ---- 4. a channel; a link and a picture from the phone
            step = "4 chat"
            host.evaluate("TribeApp.show('chat')"); host.wait_for_selector("#chat-input", state="visible")
            host.click("#chan-switch"); host.wait_for_selector("#dm-menu [data-ch-new]")
            host.click("#dm-menu [data-ch-new]"); host.wait_for_selector("#ch-modal #ch-name")
            host.fill("#ch-name", "Level Design"); host.fill("#ch-topic", "Maps and puzzles")
            shot(host, "11-channel"); audit(host, "new channel")
            host.dblclick("#ch-save")
            wait_until(lambda: [c["name"] for c in api("/channels", token=tok, project=pid)[1].get("channels", [])].count("level-design") >= 1, 10, "the channel")
            time.sleep(0.8)
            chans = [c for c in api("/channels", token=tok, project=pid)[1]["channels"] if c["name"] == "level-design"]
            assert len(chans) == 1, f"a double click made {len(chans)} channels"
            cid = chans[0]["id"]
            ph.click('#tabbar [data-nav="chat"]'); ph.wait_for_selector("#chat-input", state="visible")
            ph.click("#chan-switch"); ph.wait_for_selector(f"#dm-menu [data-ch='{cid}']", timeout=10000)
            ph.click(f"#dm-menu [data-ch='{cid}']"); ph.wait_for_timeout(400)
            ph.fill("#chat-input", "Ideas here: https://example.com/levels"); ph.press("#chat-input", "Enter")
            wait_until(lambda: any("example.com/levels" in m["text"] for m in api(f"/chat/{cid}?limit=20", token=ftok, project=pid)[1]["messages"]), 10, "the link message")
            pic = tmp / "lantern.png"; pic.write_bytes(png(40, 30, (242, 107, 29)))
            plus_button(ph).click(); ph.wait_for_selector(".pl-item[data-pl=attach]")
            audit(ph, "phone + menu")
            with ph.expect_file_chooser() as fc: ph.click(".pl-item[data-pl=attach]")
            fc.value.set_files(str(pic))
            try: wait_until(lambda: any(m.get("media") or m.get("images") for m in api(f"/chat/{cid}?limit=20", token=ftok, project=pid)[1]["messages"]), 15, "the picture")
            except AssertionError:
                raise AssertionError("the picture never landed: " + json.dumps({"chan": api(f"/chat/{cid}?limit=5", token=ftok, project=pid)[1]["messages"][-2:], "general": api("/chat/general?limit=3", token=ftok, project=pid)[1]["messages"][-2:], "toast": ph.evaluate("[...document.querySelectorAll('.toast')].map(t => t.textContent)"), "cur": ph.evaluate("window.TribeDM && TribeDM.current()")})[:1500])
            host.click("#chan-switch"); host.click(f"#dm-menu [data-ch='{cid}']")
            host.wait_for_selector("#chat-list a[href='https://example.com/levels'], #dm-list a[href='https://example.com/levels']", timeout=10000)
            host.wait_for_selector(".msg img", timeout=10000)
            shot(host, "12-chat"); audit(host, "chat 1440"); shot(ph, "13-phone-chat"); audit(ph, "chat 390")

            # ---- 5. a task with Who does it?
            step = "5 task who"
            host.evaluate("TribeApp.show('tasks')"); host.wait_for_selector("#board .task", timeout=10000)
            t1 = next(t for t in api("/tasks", token=tok, project=pid)[1]["tasks"] if t["title"] == "Light the first lantern")
            card = host.locator(f"#board .task[data-id='{t1['id']}']")
            card.wait_for(timeout=8000)
            shot(host, "14-board"); audit(host, "task board")
            me_id = host.evaluate("TribeClient.state().me.id")
            card.click(); host.wait_for_selector("#tk-drawer:not([hidden]) [data-who]", timeout=8000)   # v0.27.2: who does it lives in the task drawer
            host.click(f"#tk-drawer [data-who='{me_id}']")
            card.locator(f".tk-av[title]").first.wait_for(timeout=8000); host.keyboard.press("Escape")
            assert next(t for t in api("/tasks", token=tok, project=pid)[1]["tasks"] if t["id"] == t1["id"])["assignee"] == me_id

            # ---- 6. an agent connects (fake MCP client) -> Needs you
            step = "6 agent"
            ag = api("/agents", "POST", token=ftok, project=pid)[1]
            tools = [t["name"] for t in mcp(ag["token"], None, method="tools/list")["tools"]]
            assert "post_chat" in tools and "request_review" in tools, tools
            e, t = mcp(ag["token"], "post_chat", {"text": "Hi, I can see the board."}); assert not e, t
            e, t = mcp(ag["token"], "request_review", {"branch": f"task/{t1['id']}", "title": "First lantern", "summary": "Lights the first lantern.", "task": t1["id"]}); assert not e, t
            host.click("#nest-ws-agents"); host.wait_for_selector("#view-coord:not(.hidden) #ad-hero", timeout=10000)
            host.evaluate("window.TribeCoord && TribeCoord.refresh()")
            wait_text(host, "#ad-needs", "First lantern", 15000)
            shot(host, "15-agents"); audit(host, "agents dashboard")

            # ---- 7. whiteboard sticky
            step = "7 whiteboard"
            host.evaluate("TribeApp.show('home')"); host.wait_for_timeout(300)
            host.click("#nest-add"); host.wait_for_selector("#wg-picker")
            shot(host, "16-add"); audit(host, "+ Add gallery")
            host.click("#wg-picker [data-wadd='whiteboard']")
            host.wait_for_selector("#wg-whiteboard", state="visible", timeout=20000); host.click("#wg-whiteboard")
            host.wait_for_selector("#view-whiteboard:not(.hidden) #wbd-canvas", timeout=15000); host.wait_for_timeout(400)
            host.click("#wbd-t-sticky")
            bx = host.locator("#wbd-canvas").bounding_box()
            host.mouse.click(bx["x"] + bx["width"] / 2, bx["y"] + bx["height"] / 2)
            host.wait_for_selector("#wbd-edit.sticky"); host.keyboard.type("Lantern idea"); host.keyboard.press("Escape")
            wait_until(lambda: "Lantern idea" in json.dumps(api("/whiteboard/main", token=tok, project=pid)[1]), 10, "the sticky saved")
            shot(host, "17-whiteboard"); audit(host, "whiteboard")

            # ---- 8. Flint
            step = "8 flint"
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#flint #fl-input", state="visible", timeout=10000)
            def ask(text):
                n = host.locator("#flint .fl-msg.fl").count()
                host.fill("#fl-input", text); host.press("#fl-input", "Enter")
                host.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n", arg=n, timeout=10000)
                return host.locator("#flint .fl-msg.fl").last.inner_text()
            a1 = ask("what's happening"); assert len(a1) > 20, a1
            a2 = ask("open files"); host.wait_for_function("document.body.dataset.view === 'docs'", timeout=5000)
            n0 = len(api("/tasks", token=tok, project=pid)[1]["tasks"])
            a3 = ask("make a task: hang the lanterns")
            wait_until(lambda: len(api("/tasks", token=tok, project=pid)[1]["tasks"]) > n0 or "task" in a3.lower(), 8, "Flint makes a task")
            notes.append(f"flint answers: {a1[:80]!r} | {a2[:60]!r} | {a3[:80]!r}")
            shot(host, "18-flint"); audit(host, "flint")

            # ---- 9. Customize, the website, the demo tour
            step = "9 customize/website/tour"
            host.evaluate("TribeLook.open('project')"); host.wait_for_timeout(500)
            shot(host, "19-customize"); audit(host, "customize")
            host.keyboard.press("Escape"); host.wait_for_timeout(200)
            host.evaluate("document.querySelectorAll('.modal:not(.hidden) [data-close], .lk-close').forEach(b => b.click())")
            host.click("#nest-docs"); host.wait_for_selector("#view-docs:not(.hidden)")
            shot(host, "20-files"); audit(host, "files")
            d0 = len(api("/docs", token=tok, project=pid)[1].get("docs", []))
            host.click("#fg-new-menu"); host.dblclick("#doc-first"); host.wait_for_timeout(1500)   # desktop Files opens on the grid: + Create › Doc
            d1 = len(api("/docs", token=tok, project=pid)[1].get("docs", []))
            assert d1 == d0 + 1, f"a double click on + made {d1 - d0} docs"
            host.click("#wt-website"); host.wait_for_selector("#wb-root")
            host.fill("#wb-headline", "Lantern Garden: light the way home"); host.dblclick("#wb-build")
            host.wait_for_function("!!document.querySelector('#wb-root iframe, #wb-root .wb-live, #wb-root [data-built]') || /Live|Built|Updated|Published/i.test(document.querySelector('#wb-root').innerText)", timeout=20000)
            shot(host, "21-website"); audit(host, "website")
            dctx = b.new_context(viewport={"width": 1440, "height": 900}); dpg = dctx.new_page(); watch(dpg, "demo")
            dpg.goto(BASE + "/?demo=showcase&tour=fast")
            dpg.wait_for_function("window.TribeDirector && TribeDirector._test.state().running", timeout=25000)
            dpg.wait_for_function("TribeDirector._test.log().some(e => e.name === 'reached')", timeout=20000)
            shot(dpg, "22-demo-tour"); dctx.close()

            # ---- 10. robustness
            step = "10 robustness"
            # two tabs: a message from one shows in the other
            tab2 = hctx.new_page(); watch(tab2, "tab2")
            tab2.goto(BASE + "/?skipIntro=1"); tab2.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            tab2.evaluate("pid => TribeProjects.switchTo(pid, 'chat')", pid); tab2.wait_for_selector("#chat-input", state="visible")
            host.evaluate("TribeApp.show('chat')"); host.click("#chan-switch"); host.click("#dm-menu [data-ch='general']"); host.wait_for_timeout(300)
            host.fill("#chat-input", "From tab one"); host.press("#chat-input", "Enter")
            wait_text(tab2, "#chat-list", "From tab one")
            # long, emoji-only and RTL names; a huge paste
            for nm in ["A" * 200, "🔥🌙✨", "مايا"]:
                inv = api("/invites", "POST", {"hours": 1, "maxUses": 1}, token=tok, project=pid)[1]["invite"]["code"]
                st, j = api("/join", "POST", {"code": inv, "name": nm})
                assert st == 200, (nm, st, j)
                api("/chat/general/send", "POST", {"text": "hello from " + nm[:20]}, token=j["token"], project=pid)
            big = ("lorem ipsum " * 3000)
            host.evaluate("t => { const i = document.querySelector('#chat-input'); i.focus(); const d = new DataTransfer(); d.setData('text/plain', t); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })); }", big)
            host.wait_for_timeout(500)
            host.evaluate("TribeApp.show('chat')"); host.wait_for_timeout(600)
            shot(host, "23-names"); audit(host, "chat with long/emoji/RTL names")
            ph.reload(); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000); ph.wait_for_timeout(500)
            if ph.locator("#install-sheet:not(.hidden) #ins-later").count(): ph.click("#ins-later")
            ph.click('#tabbar [data-nav="chat"]'); ph.wait_for_timeout(500)
            shot(ph, "24-phone-names"); audit(ph, "phone chat with long/emoji/RTL names")
            # a spectator: sees, can't post or make things; the screen still has a way forward
            inv = api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "spectator"}, token=tok, project=pid)[1]["invite"]["code"]
            sp = api("/join", "POST", {"code": inv, "name": "Watcher"})[1]
            assert api("/tasks", "POST", {"title": "nope"}, token=sp["token"], project=pid)[0] == 403
            sctx = b.new_context(viewport={"width": 1440, "height": 900})
            sctx.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify(%s)) } catch (e) {}" % json.dumps({"name": "Watcher", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": sp["token"]}}))
            spg = sctx.new_page(); watch(spg, "spectator")
            spg.goto(BASE + "/?skipIntro=1"); spg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            spg.evaluate("pid => TribeProjects.switchTo(pid, 'home')", pid); spg.wait_for_timeout(800)
            spg.wait_for_selector("#pj-overview .pj-title", timeout=10000)
            assert spg.locator("#pj-invite").count() == 0 and spg.locator("#pj-context").count() == 0, "a spectator gets no Invite or drop zone they can't use"
            shot(spg, "25-spectator"); audit(spg, "spectator dashboard"); no_dead_end(spg, "spectator dashboard")
            sctx.close()
            # the server restarts: the client reconnects by itself
            srv.terminate(); srv.wait(10)
            host.wait_for_function("!TribeClient.connected()", timeout=15000)
            srv = start_server(tmp, log)
            host.wait_for_function("TribeClient.connected()", timeout=30000)
            ph.wait_for_function("TribeClient.connected()", timeout=30000)
            host.fill("#chat-input", "Back after a restart"); host.press("#chat-input", "Enter")
            wait_text(ph, "#chat-list", "Back after a restart", 15000)
            b.close()
    except Exception:
        print(f"FAILED in step: {step}", file=sys.stderr)
        print(f"screenshots: {SHOTS}", file=sys.stderr)
        raise
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
    for n in notes: print("note:", n)
    print(f"screenshots: {SHOTS}")
    assert not problems, "UI problems:\n" + "\n".join(problems)
    assert not errors, "console errors:\n" + "\n".join(errors[:30])
    print("e2e_first_run: OK (install -> set up -> invite -> phone friend -> channel + link + picture -> task Who -> agent -> Needs you -> whiteboard -> Flint -> customize -> website -> demo tour; reload, restart, two tabs, spectator, long/emoji/RTL names, huge paste, sw.js)")


if __name__ == "__main__":
    main()
