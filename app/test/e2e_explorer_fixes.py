"""Regression tests for the bugs scripts/explore.py found (docs/EXPLORE-REPORT.md).

- Connect Claude: opening it while your Claude Code is working keeps its key; "New command" makes a new one.
- Claim refusals tell the second agent what to do next (ask, hand-off, other files).
- Reviews: Approve on a board task in Review works (its id is URL-encoded in the path).
- Docs: switching project does not fetch the old project's open doc (was a 404).
- Palette: hovering moves the highlight without rebuilding the list.
- Phone: Settings fits a 390px screen; the closed drawer is inert; the Updates badge counts the inbox;
  the profile sheet can connect Claude again ("Connect from another computer").
- No tribe: Agents Hub offers "Start or join a tribe".
Usage: python app/test/e2e_explorer_fixes.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4875 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    except urllib.error.HTTPError as e: return True, f"HTTP {e.code}"
    return d.get("isError", False), d["content"][0]["text"]


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("response", lambda r: r.status == 404 and "/api/docs/" in r.url and errors.append(f"{who}: 404 {r.url}"))


def signed_in(ctx, token, name, project=None):
    pj = f"localStorage.setItem('tribecode.project:{BASE}', '{project}');" if project else ""
    ctx.add_init_script(f"if (!sessionStorage.getItem('s')) {{ sessionStorage.setItem('s','1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', tour:{{done:true}}, server:{{url:'{BASE}', token:'{token}'}}}})); {pj} }}")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-fixes-", dir="/tmp")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"})); otok = boot["token"]
        a = ok(api("/projects", "POST", {"name": "Alpha"}, token=otok))["project"]["id"]
        b2 = ok(api("/projects", "POST", {"name": "Beta"}, token=otok))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder"}, token=otok))["invite"]
        mtok = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        ok(api("/docs", "POST", {"title": "Beta only", "body": "in beta"}, token=otok, project=b2))
        ok(api("/docs", "POST", {"title": "Alpha notes", "body": "in alpha"}, token=otok, project=a))
        # claims: the refusal names a next step
        ag1 = ok(api("/agents", "POST", {}, token=otok, project=a))["token"]
        ag2 = ok(api("/agents", "POST", {}, token=mtok, project=a))["token"]
        assert not mcp(ag1, "claim_file", {"path": "src/x.js"})[0]
        err, txt = mcp(ag2, "claim_file", {"path": "src/x.js"})
        assert err and "Claude · Orion" in txt and "handoff" in txt and "message_agent" in txt, txt
        # reviews: a board task in Review can be approved from the queue
        t = ok(api("/tasks", "POST", {"title": "Review me", "status": "review"}, token=otok, project=a))["task"]
        revs = ok(api("/coord/reviews", token=otok, project=a))["reviews"]
        rid = next(r["id"] for r in revs if r.get("task") == t["id"])
        st, d = api(f"/coord/reviews/{urllib.request.quote(rid, safe='')}/approve", "POST", {}, token=otok, project=a)
        assert st == 200 and d["task"]["status"] == "done", (st, d)

        with sync_playwright() as p:
            br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # ---------- desktop ----------
            ctx = br.new_context(viewport={"width": 1440, "height": 900}); signed_in(ctx, otok, "Orion", b2)
            pg = ctx.new_page(); watch(pg, "desktop")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()")
            # docs: open Beta's doc, then switch to Alpha: no 404 for the old doc
            pg.evaluate(f"TribeClient.switchProject('{b2}')"); pg.wait_for_timeout(500)
            pg.evaluate("TribeApp.show('docs')"); pg.wait_for_function("document.querySelector('#view-docs').innerText.includes('Beta only')")
            pg.evaluate(f"TribeClient.switchProject('{a}')"); pg.wait_for_timeout(500)
            pg.evaluate("TribeApp.show('docs')"); pg.wait_for_function("document.querySelector('#view-docs').innerText.includes('Alpha notes')")
            pg.wait_for_timeout(500)
            # connect: your Claude is working -> no new key by just opening the dialog
            mcp(ag1, "my_lane", {})
            pg.evaluate("TribeApp.connectClaude()"); pg.wait_for_selector("#ic-new")   # the one invite sheet: this Claude shows as already connected
            assert "connected" in pg.inner_text("#invite-body").lower()
            assert not mcp(ag1, "my_lane", {})[0], "the running Claude keeps its key"
            pg.click("#ic-new"); pg.wait_for_selector("#cc-cmd")
            assert not mcp(ag1, "my_lane", {})[0], "asking for the setup changes nothing: the key is made on Copy"
            pg.wait_for_selector("#ic-body [data-ic-copy='code']", timeout=10000); pg.click("#ic-body [data-ic-copy='code']"); pg.wait_for_function("!document.querySelector('#cc-cmd').textContent.includes('••••')", timeout=10000)   # feat/invite-one: the key is made on Copy
            assert mcp(ag1, "my_lane", {})[0], "New command made a new key (the old one stops)"
            pg.keyboard.press("Escape")
            # palette: hover keeps the same elements
            pg.evaluate("TribePalette.open()"); pg.wait_for_selector("#pal-list .pal-item")
            pg.evaluate("window.__first = document.querySelectorAll('#pal-list .pal-item')[2]")
            pg.hover("#pal-list .pal-item >> nth=2")
            assert pg.evaluate("document.querySelectorAll('#pal-list .pal-item')[2] === window.__first && window.__first.classList.contains('on')"), "hover moved the highlight in place"
            pg.keyboard.press("Escape")
            ctx.close()

            # chat history that lands before chatx.js boots is still upgraded (bubbles, media) — a slow last script makes the race certain
            ok(api("/chat/general/send", "POST", {"text": "race check"}, token=otok, project=a))
            ctx = br.new_context(viewport={"width": 1280, "height": 800}); signed_in(ctx, otok, "Orion", a)
            ctx.add_init_script("sessionStorage.setItem('tribecode.view', 'chat')")
            def slow(route):
                time.sleep(1.2); route.continue_()
            ctx.route("**/hub.js", slow)
            pg = ctx.new_page(); watch(pg, "race")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()")
            pg.wait_for_function("document.querySelectorAll('#chat-list .msg[data-id]').length > 0", timeout=8000)
            pg.wait_for_function("document.querySelectorAll('#chat-list .msg[data-id]:not(.dx)').length === 0", timeout=5000)
            ctx.close()

            # ---------- phone ----------
            ctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); signed_in(ctx, mtok, "Maya", a)
            ph = ctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("TribeClient.connected()"); ph.wait_for_timeout(600)
            assert ph.evaluate("document.querySelector('#tour-side').inert && document.querySelector('#tour-rail').inert"), "closed drawer is inert"
            ph.evaluate("document.body.classList.add('drawer-open')"); ph.wait_for_timeout(100)
            assert not ph.evaluate("document.querySelector('#tour-side').inert"), "open drawer is usable"
            ph.evaluate("document.body.classList.remove('drawer-open')")
            # Updates badge = inbox unread
            ok(api("/chat/general/send", "POST", {"text": "@Maya badge check"}, token=otok, project=a))
            ph.wait_for_function("(() => { const b = document.querySelector('#m2-bell [data-bd=updates], #tabbar [data-bd=updates]'); return b && !b.classList.contains('hidden') && +b.textContent >= 1; })()", timeout=8000)
            # Settings fits
            ph.evaluate("TribeSettings.open()"); ph.wait_for_selector("#set-close")
            r = ph.evaluate("(() => { const c = document.querySelector('#settings-body').getBoundingClientRect(), d = document.querySelector('#set-close').getBoundingClientRect(); return [c.width, d.right]; })()")
            assert r[0] <= 390 and r[1] <= 390, f"Settings fits the phone: {r}"
            ph.keyboard.press("Escape")
            # profile sheet: connect again
            # (v0.8.1+: on phones your profile sits at the bottom of the side panel, a swipe or the top-left button away)
            ph.click("#menu-btn"); ph.wait_for_function("document.body.classList.contains('drawer-open')")
            ph.click("#pf-btn"); ph.wait_for_selector("[data-pf=connect]")
            ctx.close()

            # ---------- no tribe ----------
            ctx = br.new_context(viewport={"width": 1280, "height": 800})
            ctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Guest', onboarded:true}))")
            g = ctx.new_page(); watch(g, "offline")
            g.goto(BASE + "/?skipIntro=1"); g.wait_for_timeout(800)
            g.evaluate("TribeApp.show('coord')"); g.wait_for_selector("[data-coord-join]")
            g.click("[data-coord-join]"); g.wait_for_selector("#invite-modal:not(.hidden)")
            ctx.close()
            br.close()
    finally:
        srv.terminate()
    assert not errors, errors
    print("e2e_explorer_fixes: OK")


if __name__ == "__main__":
    main()
