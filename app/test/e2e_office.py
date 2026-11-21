"""The office and the Agents hub's three states (feat/p10-office).

Agents hub: (1) no agent yet -> the connect flow is the page (no stuck "Looking at your agents…", how it works folded,
no bare "+" row); an agent connecting turns it into (2) the dashboard by itself; (3) "AI helpers can work" off -> a calm
turned-off card with one switch, and agents' MCP calls are refused until it is back on.
The office: off by default; the host turns it on; desks for two people, two AI helpers and Flint; screens follow what
a person opens (App Creator) and what an agent claims; someone who leaves shows the screensaver; no DM text anywhere;
"Hide the office for me" is per person; 1440 and 390; reduced motion stops the caret.
Usage: python app/test/e2e_office.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5560 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r; assert st == 200, f"{what}: {st} {d}"; return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())["result"]


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-office-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"})); maya, maya_id = j["token"], j["member"]["id"]

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(token, name, w=1440, h=900, reduced=False):
                init = ("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.office.view', 'desks');"
                        " localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: '%s', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); } catch (e) {}") % (name, BASE, token)
                c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, reduced_motion="reduce" if reduced else "no-preference")
                c.add_init_script(init); pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                try: pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeOffice && window.TribeAgentsDash", timeout=45000)
                except Exception:
                    print("STATE", pg.evaluate("[!!window.TribeClient, window.TribeClient && TribeClient.connected(), !!window.TribeOffice, !!window.TribeAgentsDash]"), errors[:3]); raise
                return pg
            cp = page(host, "Camp")
            pid = cp.evaluate("TribeClient.project()")

            # ---------- Agents hub, state 1: connect ----------
            cp.evaluate("TribeShell.go('agents')"); cp.wait_for_selector("#ad-dash[class*='ad-connectflow']", timeout=15000)
            try: cp.wait_for_function("document.querySelector('[data-hub]') && document.querySelector('[data-hub]').dataset.hub === 'connect'", timeout=8000)
            except Exception:
                print("HUB", cp.evaluate("[...document.querySelectorAll('[data-hub]')].map(e => e.id + ':' + e.dataset.hub)"), cp.inner_text("#ad-dash")[:300]); raise
            assert "Looking at your agents" not in cp.inner_text("#ad-dash")
            assert cp.locator("#ad-how").count() == 1 and not cp.evaluate("document.querySelector('#ad-how').open"), "how it works is folded"
            assert cp.locator("#ad-hero [data-ao-pick='free']").count() == 1 and cp.locator("#ad-waiting").count() == 1, (cp.locator("#ad-waiting").count(), cp.inner_text("#ad-dash")[:400])   # feat/agents-office: Add an AI helper, with a free one
            assert cp.evaluate("!document.querySelector('#view-tabs') || document.querySelector('#view-tabs').classList.contains('hidden') || !document.querySelector('#view-tabs #wt-plus')"), "no bare + row"
            if os.environ.get("TRIBE_SHOTS_DIR"):
                cp.wait_for_timeout(600); cp.screenshot(path=os.path.join(os.environ["TRIBE_SHOTS_DIR"], "hub-connect-1440.png"))
            print("ok  hub: no agent -> the connect flow is the page")

            # ---------- state 2: an agent connects, the page turns into the dashboard by itself ----------
            ag = ok(api("/agents", "POST", token=maya, project=pid), "agent")
            mcp(ag["token"], "my_lane", {})
            cp.wait_for_function("document.querySelector('[data-hub]') && document.querySelector('[data-hub]').dataset.hub === 'dash'", timeout=15000)
            cp.wait_for_selector("#ad-office [data-of-on]", timeout=10000)   # the office: off by default, one offer
            print("ok  hub: an agent connected -> the dashboard, live; the office is offered")

            # ---------- the office ----------
            assert ok(api("/office", token=host))["on"] is False
            mp = page(maya, "Maya")
            cp.click("#ad-office [data-of-on]")
            try: cp.wait_for_selector("#ad-office .of-desk[data-desk='flint']", timeout=10000)
            except Exception:
                print("OFFICE", api("/office", token=host), cp.inner_text("#ad-office")[:300], errors[:3]); raise
            ag2 = ok(api("/agents", "POST", {"kind": "cursor", "label": "Cursor"}, token=host, project=pid), "agent 2")
            mcp(ag2["token"], "tribe_overview", {})
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function("document.querySelectorAll('#ad-office .of-desk').length >= 5", timeout=10000)   # Camp, Maya, 2 helpers, Flint
            roles = cp.evaluate("[...document.querySelectorAll('#ad-office .of-desk')].map(d => d.dataset.role)")
            assert roles.count("person") == 2 and roles.count("agent") >= 2 and roles.count("flint") == 1, roles   # plus any helper the tribe already had
            # a DM must never show on a screen
            camp_id = cp.evaluate("TribeClient.state().me.id")
            dmch = "dm-" + "-".join(sorted([camp_id, maya_id]))
            api("/chat", "POST", {"channel": dmch, "text": "secret plan banana"}, token=host, project=pid)
            # Maya opens App Creator: her screen says so
            mp.evaluate(f"TribeAppCreator.open({{ template: 'habits', pid: '{pid}' }})"); mp.wait_for_selector("#apc", timeout=20000)
            try: cp.wait_for_function("(document.querySelector(\"#ad-office .of-desk[data-desk='%s'] .of-screen\") || {}).innerText && /App/i.test(document.querySelector(\"#ad-office .of-desk[data-desk='%s'] .of-screen\").innerText)" % (maya_id, maya_id), timeout=15000)
            except Exception:
                d = [x for x in ok(api("/office", token=host))["desks"] if x["id"] == maya_id]
                print("MAYA", d, mp.evaluate("TribePresence.here()"), cp.inner_text("#ad-office")[:400]); raise
            # the agent claims a file: its screen says so
            mcp(ag["token"], "claim_file", {"path": "src/leaderboard.js", "note": "leaderboard"})
            cp.evaluate("TribeOffice.refresh()")
            cp.wait_for_function("(document.querySelector(\"#ad-office .of-desk[data-desk='%s'] .of-screen\") || {innerText: ''}).innerText.includes('leaderboard')" % ag["agent"]["id"], timeout=10000)
            assert "banana" not in cp.inner_text("#ad-office"), "no DM text"
            # Maya leaves: her desk shows the screensaver
            mp.context.close()
            cp.wait_for_function("(document.querySelector(\"#ad-office .of-desk[data-desk='%s']\") || {}).dataset && document.querySelector(\"#ad-office .of-desk[data-desk='%s']\").dataset.state === 'off'" % (maya_id, maya_id), timeout=20000)
            assert cp.locator(f"#ad-office .of-desk[data-desk='{maya_id}'] .of-screen.saver").count() == 1
            print("ok  office: desks for people, helpers and Flint; screens follow App Creator and a claimed file; screensaver; no DM text")

            if os.environ.get("TRIBE_SHOTS_DIR"):
                cp.locator("#ad-office").scroll_into_view_if_needed(); cp.wait_for_timeout(500)
                cp.screenshot(path=os.path.join(os.environ["TRIBE_SHOTS_DIR"], "office-1440.png"), full_page=False)
            # per-person hide
            cp.click("#ad-office [data-of-hide]"); cp.wait_for_selector("#ad-office [data-of-show]")
            assert ok(api("/office", token=host))["on"] is True, "hiding is only for me"
            cp.click("#ad-office [data-of-show]"); cp.wait_for_selector("#ad-office .of-desk")
            # the compact strip for the dashboard
            assert cp.evaluate("(() => { const d = document.createElement('div'); document.body.appendChild(d); TribeOffice.mount(d, { compact: true }); return new Promise(r => setTimeout(() => r(!!d.querySelector('.of-strip')), 800)); })()")
            print("ok  office: hide for me only; compact strip mounts")

            # ---------- 390 and reduced motion ----------
            ph = page(host, "Camp", 390, 844, reduced=True)
            ph.evaluate("TribeShell.go('agents')"); ph.wait_for_selector("#ad-office .of-desk", timeout=15000)
            sw = ph.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"no sideways scroll: {sw}"
            assert ph.evaluate("getComputedStyle(document.querySelector('#ad-office .of-caret') || document.body).animationName") in ("none", ""), "reduced motion stops the caret"
            if os.environ.get("TRIBE_SHOTS_DIR"):
                ph.evaluate("(() => { const o = document.querySelector('#ad-office'); if (o) o.scrollIntoView(); })()"); ph.wait_for_timeout(500)
                ph.screenshot(path=os.path.join(os.environ["TRIBE_SHOTS_DIR"], "office-390.png"))
            print("ok  390px and reduced motion")

            # ---------- state 3: agents turned off ----------
            ok(api("/office", "PUT", {"agentsOff": True}, token=host))
            r = mcp(ag["token"], "my_lane", {}); txt = json.dumps(r)
            assert "turned off" in txt, txt[:200]
            cp.wait_for_function("document.querySelector('[data-hub]') && document.querySelector('[data-hub]').dataset.hub === 'off'", timeout=15000)
            cp.click("#ad-agents-on")
            cp.wait_for_function("document.querySelector('[data-hub]').dataset.hub === 'dash'", timeout=15000)
            assert ok(api("/office", token=host))["agentsOff"] is False
            assert "turned off" not in json.dumps(mcp(ag["token"], "my_lane", {}))
            print("ok  hub: turned off -> one switch back on; agents refused while off")
            b.close()
        bad = [e for e in errors if "ERR_" not in e]
        assert not bad, bad
        print("e2e_office: all ok")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
