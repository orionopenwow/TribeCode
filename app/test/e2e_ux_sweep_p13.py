"""UX sweep, pass 13 (docs/UX-SWEEP-P13.md). At desktop (1440x900) and phone (390x844):
  1. "Two people changed this" (copies.js) names each part in plain words: the tool's own name for the block ("Big
     title"), what each side wrote ("Yours: “Mine again” · Theirs: “Theirs again”"), never a raw block id, type key or
     field name; "Keep all mine" answers every row at once; the rows fit a phone;
  2. on the tribe's own computer the tribe status popover has no "Your copy" send/get section (there is no second copy);
  3. Tasks: deleting a task offers Undo in the toast and Undo brings it back; while the board is empty the welcome's
     "Ask Flint to plan" is the one Flint button (the chip above hides);
  4. a plain ? opens the keyboard shortcuts (not while typing);
  5. plain words: the Settings preview has no "Ship it"/"Shipping", Files' code card says "Pinned code", not "Pinned repo";
  6. phones: the website designer's hint says "Press and hold" (no right-click, no Esc), and Flint's local-brain offer on
     Home sits under the page's header instead of above it.
Usage: python app/test/e2e_ux_sweep_p13.py   (honours TRIBE_PORT_OFFSET; --shots DIR saves screenshots)"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5700 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f'ux13-{name}.png'))


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req, timeout=8) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def wait(fn, msg, secs=15):
    end = time.time() + secs
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError(msg)


# a conflict on the same block (its title) and one on another block (a field that is not its title), from the habits
# template, then the sheet; returns what each row says
CONFLICT_JS = r"""async () => {
  const A = TribeAppCore, base = A.normalize(A.template('habits'));
  const J = x => JSON.parse(JSON.stringify(x)), mine = J(base), theirs = J(base);
  const bl = d => d.screens[0].blocks;
  const head = bl(base)[0], other = bl(base).find((b, i) => i > 0 && b.props && Object.keys(b.props).length);
  bl(mine)[0].props.title = 'Mine again'; bl(theirs)[0].props.title = 'Theirs again';
  const oi = bl(base).indexOf(other), k = Object.keys(other.props).find(x => x !== 'title' && typeof other.props[x] !== 'object') || 'sub';
  bl(mine)[oi].props[k] = 'Mine B'; bl(theirs)[oi].props[k] = 'Theirs B';
  const part = t => ((A.BLOCKS || {})[t] || {}).label;
  const r = TribeCopies.merge3(base, mine, theirs);
  window.__cp = { base, mine, theirs, part };
  return { ids: [head.id, other.id], types: [head.type, other.type], headLabel: part(head.type), n: r.conflicts.length,
           rows: r.conflicts.map(c => TribeCopies.describe(c, { part })) };
}"""


def check_conflicts(pg, size):
    info = pg.evaluate(CONFLICT_JS)
    assert info["n"] == 2, info
    head = info["rows"][0]
    assert head["name"] == info["headLabel"] and head["name"], info
    assert "Mine again" in head["detail"] and "Theirs again" in head["detail"] and head["detail"].startswith("Yours:"), head
    assert "Mine B" in info["rows"][1]["detail"] and "Theirs B" in info["rows"][1]["detail"], ("the words that differ", info["rows"][1])
    for row, bid, typ in zip(info["rows"], info["ids"], info["types"]):
        assert bid not in row["name"] + row["detail"], ("a raw block id", row)
        assert not row["name"].lower().startswith(typ.lower() + ":"), ("a raw type key", row)
    # the sheet itself
    pg.evaluate("() => { window.__dec = undefined; const c = window.__cp, r = TribeCopies.merge3(c.base, c.mine, c.theirs); TribeCopies.choose(r.conflicts, { what: 'App Creator', part: c.part }).then(d => { window.__dec = d; }); }")
    pg.wait_for_selector("#cp-choose")
    txt = pg.inner_text("#cp-choose")
    assert "Two people changed this" in txt and info["headLabel"] in txt and "Mine again" in txt and "Theirs again" in txt, txt
    assert info["ids"][0] not in txt and "header:" not in txt.lower(), txt
    assert "Keep all mine" in txt and "Keep all theirs" in txt, txt
    over = pg.evaluate("() => [...document.querySelectorAll('#cp-choose .cp-row')].some(r => r.scrollWidth > r.clientWidth + 1 || r.getBoundingClientRect().right > innerWidth)")
    assert not over, "a row runs past the edge"
    shot(pg, f"{size}-choose")
    pg.click("#cp-choose [data-all='mine']")
    dec = wait(lambda: pg.evaluate("window.__dec"), "Keep all mine answers")
    assert set(dec.values()) == {"mine"} and len(dec) == 2, dec
    pg.wait_for_selector("#cp-choose", state="detached")
    print(f"ok  {size}: Two people changed this · “{head['name']}” — {head['detail']} · Keep all mine")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ux13-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait(lambda: http.open(BASE + "/api/health", timeout=1), "server did not start", 25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---------------- desktop ----------------
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(f"desktop: {e}"))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCopies && window.TribeAppCore && window.TribeTasks", timeout=25000)
            tok = pg.evaluate("TribeStore.get().server.token")
            check_conflicts(pg, "desktop")

            # 2. the host's own computer: no "Your copy" section
            pg.click("#ub-st"); pg.wait_for_function("document.querySelector('.ts-pop, #ts-pop, [id^=ts-]') !== null", timeout=8000)
            pg.wait_for_timeout(300)
            assert pg.query_selector("#ts-copy") is None, "no send/get on the tribe's own computer"
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            print("ok  desktop: the tribe's own computer shows no Your copy send/get")

            # 3. tasks: the one Flint button while empty, then Undo after a delete
            pg.evaluate("location.hash = '#/tasks/board'"); pg.wait_for_selector("#board .tk-welcome", timeout=10000)
            assert pg.locator("#board .tk-welcome [data-flint-plan]").count() == 1, "the welcome keeps Ask Flint to plan"
            assert pg.locator("#board #tk-flint [data-flint-plan]").count() == 0, "the chip hides while the welcome shows"
            pg.fill("#tk-add", "Paint the sign"); pg.press("#tk-add", "Enter")
            wait(lambda: any(t["title"] == "Paint the sign" for t in api("/tasks", token=tok)[1]["tasks"]), "the task was added")
            pg.wait_for_function("document.querySelectorAll('#board #tk-flint [data-flint-plan]').length === 1", timeout=8000)
            tid = next(t["id"] for t in api("/tasks", token=tok)[1]["tasks"] if t["title"] == "Paint the sign")
            pg.evaluate(f"TribeTasks.open('{tid}')"); pg.click("[data-del]")
            wait(lambda: not any(t["title"] == "Paint the sign" for t in api("/tasks", token=tok)[1]["tasks"]), "the task was deleted")
            pg.wait_for_selector(".toast:not(.hidden) .toast-act")
            assert "Undo" in pg.inner_text(".toast .toast-act") and "Paint the sign" in pg.inner_text(".toast")
            shot(pg, "desktop-undo")
            pg.click(".toast .toast-act")
            wait(lambda: any(t["title"] == "Paint the sign" for t in api("/tasks", token=tok)[1]["tasks"]), "Undo brought the task back")
            pg.wait_for_function("[...document.querySelectorAll('#board .task')].some(e => /Paint the sign/.test(e.textContent))", timeout=8000)
            print("ok  desktop: Tasks · Deleted “Paint the sign” · Undo brings it back; one Flint button on an empty board")

            # 4. ? opens the shortcuts, not while typing
            pg.focus("#tk-add"); pg.keyboard.type("?"); pg.wait_for_timeout(250)
            assert pg.query_selector("#help-keys") is None, "typing ? in a box types it"
            assert pg.input_value("#tk-add") == "?"
            pg.fill("#tk-add", ""); pg.evaluate("document.activeElement.blur()")
            pg.keyboard.press("?"); pg.wait_for_selector("#help-keys")
            assert "Keyboard shortcuts" in pg.inner_text("#help-keys")
            pg.keyboard.press("Escape"); pg.wait_for_selector("#help-keys", state="detached")
            print("ok  desktop: ? opens the keyboard shortcuts (not while typing)")

            # 5. plain words
            pg.evaluate("location.hash = '#/settings/profile'"); pg.wait_for_selector(".set-pv-msgs", timeout=10000)
            stxt = pg.inner_text(".set-pv-msgs") + " " + pg.inner_text(".set-pv-msgs + .btn, .set-pv .btn.primary")
            assert "Ship" not in stxt and "Pushed" not in stxt, stxt
            pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
            print("ok  desktop: no Ship it in the Settings preview")
            ctx.close()

            # ---------------- phone ----------------
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(f"phone: {e}"))
            pp.add_init_script(f"try {{ localStorage.setItem('tribecode.flintsetup.offer', '1'); }} catch (e) {{}}")
            st, inv = api("/invites", "POST", {"maxUses": 3}, tok); assert st == 200, inv
            pp.goto(f"{BASE}/join/{inv['invite']['code']}"); pp.wait_for_selector("#form:not(.hidden)")
            pp.fill("#name", "Maya"); pp.click("#go")
            pp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeCopies && window.TribeAppCore", timeout=25000)
            pp.wait_for_timeout(800)
            if pp.locator("#install-sheet:visible").count(): pp.click("#ins-later")
            pp.evaluate("document.querySelector('#hi-banner') && document.querySelector('#hi-banner').remove()")
            check_conflicts(pp, "phone")
            pid = pp.evaluate("TribeClient.project()")
            pp.evaluate("location.hash = '#/docs/files'")   # the code card on the phone's Files (repohero.js)
            h = pp.wait_for_selector(".rhx", timeout=10000).inner_text()
            assert "Pinned repo" not in h and "A repo is" not in h and "pinned code" in h.lower(), h
            print("ok  phone: Files' code card says Pinned code, not Pinned repo")

            # 6a. Flint's local-brain offer sits under Home's header
            pp.evaluate("location.hash = '#/hub'"); pp.wait_for_selector("#view-hub .hub-head", timeout=10000)
            if pp.evaluate("!!window.TribeFlintModel"):
                pp.wait_for_selector("#fs-step", timeout=8000)
                order = pp.evaluate("() => { const h = document.querySelector('#view-hub .hub-head'), f = document.querySelector('#fs-step'); return !!(h.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); }")
                assert order, "the offer sits under the header"
                top = pp.evaluate("document.querySelector('#view-hub .hub-head').getBoundingClientRect().top")
                assert top < 200, f"Home's header starts near the top ({top}px)"
                shot(pp, "phone-home")
                print("ok  phone: Flint's local-brain offer sits under Home's header")
            # 6b. the website designer's hint on a touch screen
            pp.evaluate(f"void TribeSiteDesigner.open({{ pid: '{pid}', template: (TribeSiteCfg.TEMPLATES[0] || {{}}).id }})")
            pp.wait_for_function("[...document.querySelectorAll('.wdz-hint')].length > 0", timeout=15000)
            hint = " ".join(pp.eval_on_selector_all(".wdz-hint", "els => els.map(e => e.textContent)"))
            assert "Press and hold" in hint and "Right-click" not in hint and "Esc" not in hint, hint
            shot(pp, "phone-website")
            print("ok  phone: the website designer says Press and hold (no right-click, no Esc)")
            assert pp.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no sideways scroll"
            ph.close(); b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("PASS e2e_ux_sweep_p13")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
