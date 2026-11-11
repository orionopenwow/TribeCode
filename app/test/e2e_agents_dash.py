"""End-to-end: the Agents dashboard (app/ui/agentsdash.js, feat/agents-dash).

The Agents Hub opens on one dashboard of a few big cards, each only when it has something to say: the empty state
(No agents yet + Connect your AI + See all tools), then with a friend's agent at work the hero lists it, Needs you
merges a review and a hand-off (one-tap Approve / Take it resolve them), Who owns what and #agents appear. The top
line holds only Dashboard and pinned tabs: "+" pins a tab (kept across a reload), × unpins it, a deep link opens a
temporary tab. Phones (390px): the cards stack, "+" opens a sheet, nothing scrolls sideways. No console errors.
Usage: python app/test/e2e_agents_dash.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5130 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["result"]


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(SHOTS / f"{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def tabs(page):
    return page.evaluate("[...document.querySelectorAll('#view-tabs [data-tab]')].map(b => b.childNodes[0].textContent.trim())")


CARDS = ["#ad-hero", "#ad-needs", "#ad-owners", "#ad-chan", "#ad-today"]


def cards(page):
    return [c for c in CARDS if page.locator(c).count()]


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-adash-", dir="/tmp")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"})
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            host = ctx.new_page(); watch(host, "host")
            named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("TribeClient.connected()")
            token = host.evaluate("TribeStore.get().server.token")
            pid = host.evaluate("TribeClient.project()")
            oid = host.evaluate("TribeClient.state().me.id")

            # ---- a fresh tribe: one calm empty state, one tab, a +
            host.click("#nest-ws-agents"); host.wait_for_selector("#view-coord:not(.hidden) #ad-hero.ad-empty")
            wait_text(host, "#ad-hero", "No agents yet")
            assert cards(host) == ["#ad-hero"], cards(host)
            assert tabs(host) == ["Dashboard"], tabs(host)
            host.wait_for_selector("#view-tabs #wt-plus", state="visible")
            assert host.evaluate("location.hash") == "#/agents/agents"
            wait_text(host, "#crumb-label", "Agents Hub › Dashboard")
            fs = host.evaluate("parseFloat(getComputedStyle(document.querySelector('#ad-hero .ad-title')).fontSize)")
            assert fs >= 18, fs
            shot(host, "agents-dash-empty")
            # Connect your AI opens the existing sheet
            host.click("#ad-connect"); host.wait_for_selector("#invite-modal:not(.hidden)")
            wait_text(host, "#invite-body", "Connect your AI")
            host.evaluate("(document.querySelector('#invite-body [data-close]') || {click(){}}).click(); document.querySelector('#invite-modal').classList.add('hidden')")
            host.wait_for_selector("#ad-tools", state="visible", timeout=10000)
            # See all tools: the MCP page, as a temporary tab; × closes it back to the dashboard
            host.click("#ad-tools"); host.wait_for_function("window.TribeMcpDir && TribeMcpDir.isOpen()")
            host.wait_for_selector("#wt-mcp-directory.on .wt-x.temp")
            assert tabs(host) == ["Dashboard", "MCP"], tabs(host)
            host.click("#wt-mcp-directory .wt-x"); host.wait_for_selector("#view-coord:not(.hidden) #ad-hero")
            assert tabs(host) == ["Dashboard"], tabs(host)

            # ---- a friend with an agent at work, a review and a hand-off waiting
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 2, "role": "builder"}, token=token), "invite")["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}), "join")
            maya, mid = j["token"], j["member"]["id"]
            ag = ok(api("/agents", "POST", token=maya, project=pid), "agent")
            mcp(ag["token"], "my_lane", {"tokens_used": 3000, "budget": 100000})
            t = ok(api("/tasks", "POST", {"title": "Speed boots"}, token=maya, project=pid), "task")
            t = t.get("task", t)
            r = mcp(ag["token"], "request_review", {"branch": f"task/{t['id']}", "title": "Speed boots", "summary": "Adds speed boots.", "task": t["id"]})
            assert not r.get("isError"), r
            ok(api("/coord/handoffs", "POST", {"title": "Campfire save points", "context": "Saving works; loading is left.", "to": oid}, token=maya, project=pid), "handoff")
            ok(api("/coord/lanes", "POST", {"area": "src/ui/", "owner": mid}, token=token, project=pid), "lane")
            host.evaluate("TribeCoord.refresh()")
            host.wait_for_selector("#ad-hero:not(.ad-empty)")
            wait_text(host, "#ad-hero", "1 agent working now"); wait_text(host, "#ad-hero", "Maya")
            wait_text(host, "#ad-needs", "Speed boots"); wait_text(host, "#ad-needs", "Campfire save points")
            wait_text(host, "#ad-needs", "2 things need you")
            wait_text(host, "#ad-owners", "src/ui/")
            host.wait_for_selector("#ad-chan #talk-input")
            assert host.locator("#ad-today").count() == 0 or host.locator("#ad-today .ad-plan").count() > 0, "Today only with a plan"
            host.mouse.move(720, 860); shot(host, "agents-dash")
            # one tap resolves each
            host.click("#ad-needs .ad-need:has-text('Speed boots') [data-ad-rv='approve']")
            host.wait_for_function("!document.querySelector('#ad-needs') || !document.querySelector('#ad-needs').innerText.includes('Speed boots')", timeout=8000)
            st = [x for x in ok(api("/coord/reviews", token=token, project=pid))["reviews"] if x["title"] == "Speed boots"][0]["status"]
            assert st == "approved", st
            host.click("#ad-needs .ad-need:has-text('Campfire save points') [data-ad-take]")
            host.wait_for_selector("#ad-needs", state="detached", timeout=8000)
            assert [h for h in ok(api("/coord/handoffs", token=token, project=pid))["handoffs"] if h["title"] == "Campfire save points"][0]["status"] == "taken"
            # a card header links to its full view (as a temporary tab)
            host.click("#ad-owners [data-ad-open='ownership']"); host.wait_for_function("TribeCoord.tab() === 'ownership'")
            host.wait_for_selector("#wt-ownership.on .wt-x.temp")
            host.click("#wt-agents"); host.wait_for_selector("#ad-hero")
            assert tabs(host) == ["Dashboard"], tabs(host)

            # ---- + pins a tab; it stays across a reload; × unpins it
            host.click("#wt-plus"); host.wait_for_selector("#ad-menu [data-ad-pin='reviews']")
            labels = host.evaluate("[...document.querySelectorAll('#ad-menu [data-ad-pin]')].map(b => b.querySelector('b').textContent)")
            assert labels == ["Your agents", "Ownership", "Conflicts", "Hand-offs", "Reviews", "Daily plan", "Secretary", "MCP"], labels
            shot(host, "agents-dash-plus")
            host.click("#ad-menu [data-ad-pin='reviews']"); host.wait_for_function("TribeCoord.tab() === 'reviews'")
            assert host.locator("#ad-menu").count() == 0
            host.wait_for_selector("#wt-reviews.on"); assert host.locator("#wt-reviews .wt-x.temp").count() == 0
            host.click("#wt-agents"); host.wait_for_selector("#ad-hero")
            assert tabs(host) == ["Dashboard", "Reviews"], tabs(host)
            host.reload(); host.wait_for_function("TribeClient.connected()")
            host.evaluate("TribeShell.go('agents')"); host.wait_for_selector("#view-coord:not(.hidden) #ad-hero")
            host.wait_for_function("[...document.querySelectorAll('#view-tabs [data-tab]')].length === 2")
            assert tabs(host) == ["Dashboard", "Reviews"], tabs(host)
            host.hover("#wt-reviews"); host.click("#wt-reviews .wt-x")
            host.wait_for_function("!document.querySelector('#wt-reviews')")
            assert tabs(host) == ["Dashboard"], tabs(host)
            host.reload(); host.wait_for_function("TribeClient.connected()")
            host.evaluate("TribeShell.go('agents')"); host.wait_for_selector("#view-coord:not(.hidden) #ad-hero")
            assert tabs(host) == ["Dashboard"], tabs(host)

            # ---- deep links still work: a temporary tab
            host.goto(BASE + "/?skipIntro=1#/agents/conflicts")
            host.wait_for_function("window.TribeCoord && TribeCoord.tab() === 'conflicts' && !document.querySelector('#view-coord').classList.contains('hidden')", timeout=10000)
            host.wait_for_selector("#wt-conflicts.on .wt-x.temp")
            assert tabs(host) == ["Dashboard", "Conflicts"], tabs(host)
            host.evaluate("TribeCoord.open('handoffs')"); host.wait_for_selector("#wt-handoffs.on")
            assert tabs(host) == ["Dashboard", "Hand-offs"], tabs(host)

            # ---- phone: stacked cards, + as a sheet, no sideways scroll
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            ph.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'Orion', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_function("TribeClient.connected()")
            phone.evaluate("TribeShell.go('agents')"); phone.wait_for_selector("#view-coord:not(.hidden) #ad-hero")
            wait_text(phone, "#ad-hero", "Maya")
            phone.wait_for_selector("#ad-chan #talk-input")
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), phone.evaluate("document.documentElement.scrollWidth")
            boxes = phone.evaluate("[...document.querySelectorAll('.ad-card')].map(c => { const r = c.getBoundingClientRect(); return [r.left, r.right]; })")
            assert boxes and all(l >= 0 and r <= 391 for l, r in boxes), boxes
            shot(phone, "agents-dash-phone")
            phone.click("#wt-plus"); phone.wait_for_selector("#ad-menu.sheet")
            phone.wait_for_timeout(350); bx = phone.locator("#ad-menu").bounding_box()
            assert bx["width"] >= 380 and abs(bx["y"] + bx["height"] - 844) < 6, bx
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            shot(phone, "agents-dash-phone-plus")
            phone.click(".ad-scrim", position={"x": 20, "y": 40}); phone.wait_for_selector("#ad-menu", state="detached")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E agents dashboard test passed")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
