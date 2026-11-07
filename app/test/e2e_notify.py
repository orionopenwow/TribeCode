"""Pocket agent end to end: ntfy pushes for an away teammate, digest, MCP approvals with signed ntfy action
links, bulk low-risk approval, approve with a comment, forward to chat, away summary, quiet hours.
A tiny fake ntfy server records what would reach the phone.
Saves docs/screenshots/notify-inbox.png and notify-settings.png.
Usage: python app/test/e2e_notify.py   (honours TRIBE_PORT_OFFSET)"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4790 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# ---------- fake ntfy ----------
pushes = []
class Ntfy(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
        pushes.append({"path": self.path, "headers": {k: v for k, v in self.headers.items()}, "body": body})
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(b'{"id":"x"}')
    def log_message(self, *a): pass



def chat(page):
    """Chat is its own view in the shell: open it before typing or clicking in it."""
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def api(path, method="GET", body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with http.open(req) as r:
            data = r.read(); return r.status, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def mcp(token, tool, args):
    req = urllib.request.Request(BASE + "/mcp", method="POST", headers={"Content-Type": "application/json", "Authorization": "Bearer " + token},
                                 data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}).encode())
    with http.open(req) as r:
        res = json.loads(r.read())["result"]
    assert not res.get("isError"), res
    return json.loads(res["content"][0]["text"])


def wait(fn, timeout=10, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v: return v
        time.sleep(0.1)
    raise AssertionError("timed out waiting for " + what)


def title(p):
    t = p["headers"].get("Title", "")
    if t.startswith("=?UTF-8?B?"):
        import base64; t = base64.b64decode(t[10:-2]).decode()
    return t


def open_as(browser, name, token, extra_init=""):
    page = browser.new_context(viewport={"width": 1600, "height": 1000}).new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and "11434" not in m.text and "ERR_" not in m.text and "api.github.com" not in m.text and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))});" + extra_init)
    page.goto(BASE)
    page.wait_for_function("document.querySelector('#sync-status').textContent.includes('connected')", timeout=10000)
    return page


def main():
    ntfy = ThreadingHTTPServer(("127.0.0.1", 0), Ntfy)
    threading.Thread(target=ntfy.serve_forever, daemon=True).start()
    NTFY = f"http://127.0.0.1:{ntfy.server_address[1]}"
    tmp = tempfile.mkdtemp(prefix="tribe-n-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Pocket Crew", "--ollama", "http://localhost:9",
                            "--public-url", BASE], stdout=subprocess.DEVNULL)
    try:
        wait(_up, what="server")
        host = api("/api/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        code = api("/api/invites", "POST", {}, host)[1]["invite"]["code"]
        maya = api("/api/join", "POST", {"code": code, "name": "Maya"})[1]["token"]
        maya_id = api("/api/me", token=maya)[1]["member"]["id"]
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hp = open_as(b, "Orion", host)

            # 2. Maya points ntfy at the fake server in Settings → Notifications, then closes her tab (away)
            mp = open_as(b, "Maya", maya)
            mp.evaluate("TribeNotify.openSettings()")
            mp.wait_for_selector("#nf-server")
            assert mp.locator(".nf-tg[data-k='types.approval']").get_attribute("aria-checked") == "true"
            assert mp.locator(".nf-tg[data-k='types.release']").get_attribute("aria-checked") == "false"
            assert mp.locator("#nf-qr svg").count() == 1
            mp.fill("#nf-server", NTFY); mp.dispatch_event("#nf-server", "change")
            prefs = wait(lambda: (lambda r: r if r["prefs"]["ntfy"]["server"] == NTFY else None)(api("/api/notify/prefs", token=maya)[1]), what="ntfy server saved")
            topic = prefs["prefs"]["ntfy"]["topic"]
            assert len(topic) >= 10
            mp.close()
            wait(lambda: api("/api/notify/state", token=maya)[1]["away"], what="Maya away")
            to_maya = lambda: [x for x in pushes if x["path"] == "/" + topic]

            # 3. host @mentions Maya → exactly one push with the right title
            chat(hp).fill("#chat-input", "@Maya can you look at the save system?"); chat(hp).press("#chat-input", "Enter")
            wait(lambda: to_maya(), what="mention push")
            time.sleep(1.0)
            assert len(to_maya()) == 1, to_maya()
            m = to_maya()[0]
            assert title(m) == "Orion mentioned you in #general", title(m)
            assert m["headers"]["Priority"] == "4" and "save system" in m["body"] and "open=chat" in m["headers"]["Click"]

            # 4. a low-priority event (huddle started) does not push, but lands in the digest
            hp.evaluate("TribeClient.send({type: 'huddle-join', muted: true})")
            st = wait(lambda: (lambda s: s if s["digest"]["queued"] >= 1 else None)(api("/api/notify/state", token=maya)[1]), what="digest queue")
            hp.evaluate("TribeClient.send({type: 'huddle-leave'})")
            time.sleep(0.6)
            assert len(to_maya()) == 1, "huddle must not push"
            assert st["recent"][0]["type"] == "huddle" and st["recent"][0]["reason"] == "digest"

            # 5. Maya's Claude asks for a high-risk approval over MCP → host inbox + badge
            magent = api("/api/agents", "POST", {}, maya)[1]["token"]
            ap = mcp(magent, "request_approval", {"title": "Merge integration/2026-11-06", "details": "Fast-forward main to the integration branch. Undo: git reset to the old main tag.", "risk": "high"})
            assert ap["status"] == "pending" and "Orion" in ap["askedOf"]
            hp.wait_for_function("!document.querySelector('#nf-count').classList.contains('hidden') && +document.querySelector('#nf-count').textContent >= 1", timeout=8000)
            # the host's own agent asks two low-risk things and one medium one (addressed to the host)
            hagent = api("/api/agents", "POST", {}, host)[1]["token"]
            low1 = mcp(hagent, "request_approval", {"title": "Install date-fns", "risk": "low", "kind": "install-dependency"})
            low2 = mcp(hagent, "request_approval", {"title": "Run the full test suite", "risk": "low", "kind": "tests"})
            med = mcp(hagent, "request_approval", {"title": "Bump Node to 22 in CI", "details": "Updates .github/workflows/release.yml", "risk": "medium"})
            # away summary: pretend the host was away for two hours, reload, open the inbox
            ctx = hp.context; hp.close()   # leaving stamps "last active"; come back as if two hours later
            hp = ctx.new_page()
            hp.on("pageerror", lambda e: errors.append(f"Orion: {e}"))
            hp.add_init_script("localStorage.setItem('tribecode.lastActive', String(Date.now() - 2 * 3600e3))")
            hp.goto(BASE); hp.wait_for_function("document.querySelector('#sync-status').textContent.includes('connected')", timeout=10000)
            hp.wait_for_function("+document.querySelector('#nf-count').textContent >= 4", timeout=8000)
            hp.click("#nf-bell")
            hp.wait_for_selector("#nf-panel:not(.hidden) .nf-item[data-type='approval'] .nf-approve")
            hp.wait_for_selector("#nf-away-card")
            assert "While you were away" in hp.inner_text("#nf-away-card") and "approval" in hp.inner_text("#nf-away-card")
            assert "2 low-risk requests waiting" in hp.inner_text(".nf-bulk")
            hp.wait_for_timeout(400)
            hp.screenshot(path=str(SHOTS / "notify-inbox.png"))

            # bulk "approve all low-risk": both low ones, never the high or medium one
            hp.click("#nf-bulk")
            wait(lambda: mcp(hagent, "check_approval", {"id": low1["id"]})["status"] == "approved", what="bulk low1")
            assert mcp(hagent, "check_approval", {"id": low2["id"]})["status"] == "approved"
            assert mcp(hagent, "check_approval", {"id": med["id"]})["status"] == "pending"
            assert mcp(magent, "check_approval", {"id": ap["id"]})["status"] == "pending"

            # approve with a comment, from the inbox
            sel = f".nf-item[data-type='approval'] input[data-cm='{med['id']}']"
            hp.fill(sel, "ok, after the demo")
            hp.click(f"[data-decide='approve'][data-ap='{med['id']}']")
            r = wait(lambda: (lambda x: x if x["status"] == "approved" else None)(mcp(hagent, "check_approval", {"id": med["id"]})), what="comment approve")
            assert r["note"] == "ok, after the demo" and r["decidedBy"] == "Orion"
            hp.wait_for_function("document.querySelector('#chat-list').textContent.includes('ok, after the demo')", timeout=5000)

            # 6. Maya approves the high-risk one from her lock screen: the ntfy "Approve" http action
            push = wait(lambda: next((x for x in to_maya() if "Actions" in x["headers"]), None), what="approval push to Maya")
            acts = [a.strip() for a in push["headers"]["Actions"].split(";")]
            assert acts[0].startswith("http, Approve, ") and acts[1].startswith("http, Deny, ") and "method=POST" in acts[0]
            url = urlsplit(acts[0].split(", ")[2])
            st, text = api(url.path + "?" + url.query, "POST", raw=True)
            assert st == 200 and text.startswith("Approved: Merge integration"), (st, text)
            assert api(url.path + "?" + url.query, "POST", raw=True)[0] == 401, "signed link is one-time"
            chk = mcp(magent, "check_approval", {"id": ap["id"]})
            assert chk["status"] == "approved" and chk["decidedBy"] == "Maya", chk
            hp.wait_for_function(f"document.querySelector(\".nf-item[data-type='approval'] [data-decide][data-ap='{ap['id']}']\") === null", timeout=5000)

            # forward to chat: "…" → # general, then the link in chat opens the original item
            item_sel = f".nf-item[data-type='approval']:has(.nf-risk.high)"
            nid = hp.get_attribute(item_sel, "data-id")
            hp.hover(item_sel); hp.click(f"{item_sel} .nf-more")
            hp.click("#nf-menu [data-m='fwd'][data-ch='general']")
            hp.wait_for_function("document.querySelector('#chat-list').textContent.includes('forwarded by Orion')", timeout=5000)
            raw = api("/api/chat/general?limit=5", token=maya)[1]["messages"]
            fwd = next(x for x in raw if "forwarded by Orion" in x["text"])
            assert fwd["text"].startswith("> 🔔 **Approval:") and f"[open](#notif:{nid})" in fwd["text"], fwd["text"]
            hp.click("#nf-close")
            chat(hp).click(f"#chat-list a[href='#notif:{nid}']")
            hp.wait_for_selector(f"#nf-panel:not(.hidden) .nf-item[data-id='{nid}']")
            # Maya (another member) can open the forwarded item too
            assert api(f"/api/notify/items/{nid}", token=maya)[0] == 200
            hp.click("#nf-close")

            # settings screenshot
            hp.evaluate("TribeNotify.openSettings()")
            hp.wait_for_selector("#nf-qr svg"); hp.wait_for_timeout(400)
            hp.screenshot(path=str(SHOTS / "notify-settings.png"))
            hp.click("#nf-settings [data-x]")

            # 7. quiet hours (Maya's local time) suppress a push
            now = datetime.now(timezone.utc)
            q = {"on": True, "from": (now - timedelta(hours=1)).strftime("%H:%M"), "to": (now + timedelta(hours=1)).strftime("%H:%M")}
            assert api("/api/notify/prefs", "PUT", {"tz": "UTC", "when": {"quiet": q}}, maya)[0] == 200
            before = len(to_maya())
            tid = api("/api/tasks", "POST", {"title": "Polish the save system"}, host)[1]["task"]["id"]
            api(f"/api/tasks/{tid}", "PATCH", {"assignee": maya_id}, host)
            s = wait(lambda: (lambda s: s if s["recent"] and s["recent"][0]["type"] == "task-assigned" else None)(api("/api/notify/state", token=maya)[1]), what="assignment decision")
            time.sleep(0.8)
            assert s["recent"][0]["reason"] == "quiet", s["recent"][0]
            assert len(to_maya()) == before, "quiet hours must suppress the push"
            assert any(i["type"] == "task-assigned" for i in api("/api/notify/inbox", token=maya)[1]["items"]), "still lands in the inbox"
            b.close()
    finally:
        srv.terminate(); ntfy.shutdown()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print(f"Notify e2e passed ({len(pushes)} pushes recorded)")


def _up():
    try: return api("/api/health")[0] == 200
    except Exception: return False


if __name__ == "__main__":
    main()
