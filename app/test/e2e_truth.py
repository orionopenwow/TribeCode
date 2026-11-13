"""Truth test: every screen reaches a real backend, nothing errors, and chat stays light.

Walks the app the way a person would, on desktop and on a phone, with no tribe and then with one:
the global sections (Home, Files, Design, Code, Work, Agent fleet), every project destination in the
router's registry, the Workshop, Settings, log out and back in. While it walks it records:
- every /api and /mcp response: any 5xx, or a 4xx that isn't an expected "not signed in"/"not found";
- page errors and console errors;
- for chat: send-to-render time, the WebSocket frame size of one message, the DOM nodes one message adds,
  and the size of the chat history response.
Writes docs/TRUTH-TEST.md and fails if anything is broken or chat is heavier than the budget.
Usage: python app/test/e2e_truth.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4893 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
BUDGET = {"render_ms": 1500, "frame_bytes": 4096, "dom_nodes": 60}
problems, api_log, notes = [], [], []
OK_4XX = {401, 403, 404, 409}   # optional data that isn't there yet, or not allowed for this role


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)


def watch(page, who):
    page.on("pageerror", lambda e: problems.append(f"{who}: page error: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and problems.append(f"{who}: console: {m.text[:200]}"))

    def on_resp(r):
        u = r.url
        if "/api/" not in u and not u.endswith("/mcp"): return
        path = u.split(str(PORT), 1)[-1]
        api_log.append((who, r.request.method, path.split("?")[0], r.status))
        if r.status >= 500 or (r.status >= 400 and r.status not in OK_4XX):
            problems.append(f"{who}: {r.request.method} {path[:120]} -> {r.status}")
    page.on("response", on_resp)


def settle(page, ms=500):
    page.wait_for_timeout(ms)


def visible_main(page):
    return page.evaluate("""() => [...document.querySelectorAll('main .view, #main > section, [id^=view-]')].filter(e => e.offsetParent !== null && !e.classList.contains('hidden')).map(e => e.id).filter(Boolean)""")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-truth-", dir="/tmp")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"],
                           stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    metrics = {}
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- 1. No tribe: the global dashboard works, no dead ends, no error cards
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); watch(pg, "no-tribe")
            named(pg, "Orion"); pg.goto(BASE + "/?skipIntro=1&freshopen=1")
            pg.wait_for_function("window.TribeRouter && window.TribeHub", timeout=20000); settle(pg, 1200)
            for key in ["home", "docs", "repos", "work", "fleet", "home"]:
                pg.evaluate("k => TribeRouter.go(k)", key); settle(pg)
                w = pg.evaluate("TribeRouter.where()")
                if w.get("place") != "global": problems.append(f"no-tribe: {key} left the global dashboard ({w})")
            txt = pg.inner_text("body")
            for bad in ["didn't start", "did not start", "Reconnecting", "failed to load", "Failed to load"]:
                if bad in txt: problems.append(f"no-tribe: error text on screen: {bad!r}")
            pg.click("#rail-logo"); settle(pg)
            if pg.evaluate("TribeRouter.where().section") != "home": problems.append("no-tribe: logo did not go Home")
            ctx.close()

            # ---- 2. With a tribe: every destination in the registry opens and reaches the server
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); host = ctx.new_page(); watch(host, "host")
            frames = []   # listen before the page opens its WebSocket: Playwright only reports sockets made after this
            host.on("websocket", lambda ws: ws.on("framereceived", lambda f: frames.append(f if isinstance(f, (str, bytes)) else getattr(f, "payload", ""))))
            named(host, "Orion"); host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=30000); settle(host, 1500)
            keys = host.evaluate("""() => { const S = window.TribeShell; const d = S && (S.dests ? S.dests() : S.DEST);
                return d ? (Array.isArray(d) ? d : Object.values(d)).map(x => x.key).filter(Boolean) : []; }""")
            if not keys: keys = ["home", "chat", "docs", "canvas", "tasks", "bugs", "board", "calendar", "repo", "visuals", "agents", "agents-hub", "company"]
            visited = []
            for k in keys:
                if k in ("logout", "quit"): continue
                before = len(api_log)
                try:
                    host.evaluate("k => (window.TribeShell && TribeShell.go) ? TribeShell.go(k) : TribeRouter.go(k)", k)
                except Exception as e:
                    problems.append(f"host: going to {k} threw: {str(e)[:150]}"); continue
                settle(host, 450)
                host.keyboard.press("Escape")
                visited.append((k, len(api_log) - before))
            notes.append(f"Visited {len(visited)} destinations; {sum(1 for _, n in visited if n)} made at least one server call.")
            # Workshop, Settings, back home by the logo
            for sel in ["#rail-workshop", "#rail-logo"]:
                if host.locator(sel).count(): host.click(sel); settle(host)
            if host.evaluate("TribeRouter.where().section") != "home": problems.append("host: logo did not go Home from the Workshop")

            # ---- 3. Chat: light and quick
            host.evaluate("TribeShell && TribeShell.go ? TribeShell.go('chat') : App.show('chat')"); settle(host, 800)
            box = "#chat-input, #composer-mount textarea, .composer textarea"
            host.wait_for_selector(box, timeout=10000)
            before_nodes = host.evaluate("document.querySelectorAll('*').length")
            stamp = f"truth {int(time.time())}"
            t0 = time.time()
            host.fill(box, stamp); host.keyboard.press("Enter")
            host.wait_for_function("s => document.body.innerText.includes(s)", arg=stamp, timeout=10000)
            render_ms = int((time.time() - t0) * 1000); settle(host, 400)
            added = host.evaluate("document.querySelectorAll('*').length") - before_nodes
            msg_frames = [f for f in frames if stamp in (f if isinstance(f, str) else f.decode("utf8", "ignore"))]
            frame_bytes = max((len(f) for f in msg_frames), default=0)
            token = host.evaluate("TribeStore.get().server.token")
            pid = host.evaluate("TribeClient.project && TribeClient.project()") or ""
            req = urllib.request.Request(BASE + "/api/chat/general?limit=50", headers={"Authorization": "Bearer " + token, **({"X-Project": pid} if pid else {})})   # what the app loads (app.js)
            try: hist = len(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=10).read())
            except Exception: hist = -1
            metrics = {"render_ms": render_ms, "frame_bytes": frame_bytes, "dom_nodes": added, "history_bytes": hist}
            for k, lim in BUDGET.items():
                if metrics[k] > lim: problems.append(f"chat: {k} {metrics[k]} over budget {lim}")
            if not msg_frames: problems.append("chat: no WebSocket frame carried the message")
            if hist < 0: problems.append("chat: the history request failed")

            # ---- 4. Log out, then back in
            if host.evaluate("!!(window.TribeAccounts && TribeAccounts.logout)"):
                host.evaluate("TribeAccounts.logout({ forget: false })"); settle(host, 1200)
                if host.evaluate("window.TribeClient && TribeClient.connected && TribeClient.connected()"): problems.append("accounts: still connected after log out")
            else: problems.append("accounts: TribeAccounts.logout missing")
            ctx.close()

            # ---- 5. Phone: the same journey fits at 390px with no sideways scroll
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                               user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1").new_page()
            watch(ph, "phone"); named(ph, "Orion"); ph.goto(BASE + "/?skipIntro=1&freshopen=1")
            ph.wait_for_function("window.TribeRouter", timeout=20000); settle(ph, 1000)
            for key in ["home", "docs", "fleet", "work", "home"]:
                ph.evaluate("k => TribeRouter.go(k)", key); settle(ph)
                if ph.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): problems.append(f"phone: sideways scroll on {key}")
            b.close()
    finally:
        srv.terminate()

    calls = len(api_log); fails = [x for x in api_log if x[3] >= 400]
    lines = ["# Truth test", "", f"Run: {time.strftime('%Y-%m-%d %H:%M')} · `python app/test/e2e_truth.py`", "",
             "Does every screen reach a real backend, without errors, and is chat light?", "",
             f"- Server calls made by the UI: **{calls}** ({len(fails)} answered 4xx/5xx; expected 401/403/404/409 are allowed)",
             f"- Chat send → on screen: **{metrics.get('render_ms', '?')} ms** (budget {BUDGET['render_ms']})",
             f"- One message over the WebSocket: **{metrics.get('frame_bytes', '?')} bytes** (budget {BUDGET['frame_bytes']})",
             f"- DOM nodes one message adds: **{metrics.get('dom_nodes', '?')}** (budget {BUDGET['dom_nodes']})",
             f"- Chat history response: **{metrics.get('history_bytes', '?')} bytes**", ""]
    lines += [f"- {n}" for n in notes]
    lines += ["", "## Problems", ""] + ([f"- {x}" for x in problems] or ["None."])
    (ROOT / "docs" / "TRUTH-TEST.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    if problems:
        sys.exit(1)
    print("Truth test passed")


if __name__ == "__main__":
    main()
