"""End-to-end: Jam mode (server/jam.js, app/ui/jam.js).

API: only the host (or an admin) starts a jam; "Join the jam" makes a project from the game starter with a VISION for the
theme; submitting needs a published play link; voting opens when the host ends the live phase; one vote per person, never
for your own entry, AI helpers don't vote; closing the vote picks the winner and posts it; MCP jam_status / jam_submit.
UI: the countdown banner, the jam board (entries, Join, vote buttons, results card), Start a jam form, phone layout.
Usage: python app/test/e2e_jam.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5461 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR") or ROOT / "docs" / "screenshots")
take = "--shots" in sys.argv or bool(os.environ.get("SHOTS_DIR"))
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]["content"][0]["text"]


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.lang', 'en'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-jam-", dir="/tmp")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Jam Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        camp = ok(api("/bootstrap", "POST", {"name": "Camp"}), "bootstrap")["token"]
        join = lambda name, role=None: ok(api("/join", "POST", {"code": ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, **({"role": role} if role else {})}, token=camp))["invite"]["code"], "name": name}))["token"]
        maya, jay, watcher = join("Maya"), join("Jay"), join("Watcher", "spectator")

        assert ok(api("/jam", token=maya))["phase"] == "none"
        assert api("/jam", "POST", {"theme": "Only one button", "hours": 1}, token=maya)[0] == 403, "only the host starts a jam"
        assert api("/jam", "POST", {"theme": "", "hours": 1}, token=camp)[0] == 400
        j = ok(api("/jam", "POST", {"theme": "Only one button", "hours": 1, "voteHours": 1, "rules": "Any engine, credit your assets"}, token=camp), "start")["jam"]
        assert j["phase"] == "live" and j["theme"] == "Only one button" and j["rules"], j
        assert api("/jam", "POST", {"theme": "Again", "hours": 1}, token=camp)[0] == 409, "one jam at a time"

        # entries: join (a project from the starter), publish, submit
        entries = {}
        for who, tok in [("Maya", maya), ("Jay", jay)]:
            pj = ok(api("/jam/join", "POST", token=tok), f"join {who}")["project"]
            assert pj["repo"] and Path(pj["repo"], "index.html").exists() and "Only one button" in Path(pj["repo"], "VISION.md").read_text(), pj
            st, d = api("/jam/submit", "POST", {"project": pj["id"]}, token=tok)
            assert st == 409 and "publish" in d["error"].lower(), (st, d)
            ok(api("/publish", "POST", {"project": pj["id"], "title": f"{who}'s one-button game", "force": True}, token=tok), f"publish {who}")
            ok(api("/jam/submit", "POST", {"project": pj["id"]}, token=tok), f"submit {who}")
            entries[who] = pj["id"]
        assert api("/jam/join", "POST", token=watcher)[0] == 403, "spectators watch and vote, they don't enter"
        s = ok(api("/jam", token=camp))
        assert len(s["jam"]["entries"]) == 2 and all(e["url"] and "/play/" in e["url"] for e in s["jam"]["entries"]), s
        assert api("/jam/vote", "POST", {"project": entries["Maya"]}, token=jay)[0] == 409, "no voting while it's live"
        ag = ok(api("/agents", "POST", token=camp))
        txt = mcp(ag["token"], "jam_status")
        assert "Only one button" in txt and "live" in txt and "Maya's one-button game" in txt, txt

        # voting
        assert api("/jam/end", "POST", token=maya)[0] == 403
        assert ok(api("/jam/end", "POST", token=camp))["jam"]["phase"] == "voting"
        assert api("/jam/submit", "POST", {"project": entries["Maya"]}, token=maya)[0] == 409, "submissions closed"
        assert api("/jam/vote", "POST", {"project": entries["Maya"]}, token=maya)[0] == 403, "not your own"
        assert api("/jam/vote", "POST", {"project": entries["Maya"]}, token=ag["token"])[0] == 403, "AI helpers don't vote"
        ok(api("/jam/vote", "POST", {"project": entries["Maya"]}, token=jay))
        ok(api("/jam/vote", "POST", {"project": entries["Jay"]}, token=camp))
        ok(api("/jam/vote", "POST", {"project": entries["Maya"]}, token=camp))   # changing your vote is fine
        v = ok(api("/jam/vote", "POST", {"project": entries["Maya"]}, token=watcher))["jam"]
        assert v["voters"] == 3 and v["myVote"] == entries["Maya"], v

        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Camp", camp, entries["Maya"]))
            pg = ctx.new_page(); watch(pg, "camp")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_selector("#jam-banner", timeout=20000)
            assert "Only one button" in pg.text_content("#jam-banner") and "Voting" in pg.text_content("#jam-banner")
            if take: pg.locator("#jam-banner").screenshot(path=str(SHOTS / "jam-banner-1440.png"))
            pg.click("#jam-open"); pg.wait_for_selector(".jam-list .jam-e")
            assert pg.locator(".jam-e").count() == 2 and pg.locator("[data-vote]").count() == 2   # Camp has no entry: both votable
            assert pg.locator('[data-vote][aria-pressed="true"]').count() == 1
            if take: pg.wait_for_timeout(300); pg.locator("#invite-body").screenshot(path=str(SHOTS / "jam-board-voting-1440.png"))
            pg.click("#invite-body [data-close]")
            # close the vote -> results
            ok(api("/jam/end", "POST", token=camp))
            pg.wait_for_function("document.querySelector('#jam-banner') && document.querySelector('#jam-banner').textContent.includes('results')", timeout=10000)
            pg.click("#jam-open"); pg.wait_for_selector(".jam-win")
            assert "Maya's one-button game" in pg.text_content(".jam-win") and "3 votes" in pg.text_content(".jam-win"), pg.text_content(".jam-win")
            if take: pg.wait_for_timeout(300); pg.locator("#invite-body").screenshot(path=str(SHOTS / "jam-results-1440.png"))
            # start another from the board (the host's form)
            pg.click("#jam-again"); pg.wait_for_selector("#jam-theme")
            pg.fill("#jam-theme", "Tiny worlds"); pg.select_option("#jam-hours", "3"); pg.click("#jam-go")
            pg.wait_for_function("document.querySelector('#jam-banner') && document.querySelector('#jam-banner').textContent.includes('Tiny worlds')", timeout=10000)
            assert pg.query_selector("#jam-join"), "the board offers Join"
            if take: pg.wait_for_timeout(300); pg.locator("#invite-body").screenshot(path=str(SHOTS / "jam-board-live-1440.png"))
            # phone
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Maya", maya, entries["Maya"]))
            pp = ph.new_page(); watch(pp, "maya-phone")
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_selector("#jam-banner", timeout=20000)
            r = pp.evaluate("(() => { const b = document.querySelector('#jam-banner').getBoundingClientRect(); return [b.left, b.right, document.documentElement.scrollWidth] })()")
            assert r[0] >= 0 and r[1] <= 390 and r[2] <= 391, r
            pp.click("#jam-open"); pp.wait_for_selector("#jam-join")
            if take: pp.wait_for_timeout(300); pp.screenshot(path=str(SHOTS / "jam-board-390.png"))
            b.close()

        past = ok(api("/jam", token=camp))
        assert past["jam"]["theme"] == "Tiny worlds" and past["phase"] == "live"
        assert api("/jam", "DELETE", token=maya)[0] == 403
        ok(api("/jam", "DELETE", token=camp)); assert ok(api("/jam", token=camp))["phase"] == "none"
        chat = ok(api("/chat/general", token=camp))["messages"]
        assert any("wins with 3 votes" in (m.get("text") or "") for m in chat), "the winner is announced"
        bad = [e for e in errors if "favicon" not in e]
        assert not bad, bad
        print("ok e2e_jam")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
