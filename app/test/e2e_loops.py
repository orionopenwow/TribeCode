"""End-to-end: the loops that cross features, walked as one journey (docs/LOOPS-REPORT.md).

1. A host with fixed push keys from the environment (TRIBE_VAPID_PUBLIC / TRIBE_VAPID_PRIVATE): /notify/vapid serves
   them, so phones keep push after a cloud host's files are wiped; the app re-sends its subscription on reconnect.
2. An AI helper connects over MCP: tools/list has the board, code and pin tools; it lists the board, takes a task,
   writes index.html with code_write, and the host's open preview reloads by itself.
3. The host pins a comment on the preview; the AI helper reads it with list_pins and answers with add_pin_reply; the
   host sees the reply in the open thread.
4. Live reload without Server-Sent Events (Cloudflare quick tunnels don't stream them): the preview's ?poll=1 answers
   the change count, and a preview page whose EventSource never delivers anything still reloads after a save.
5. A friend joins from a phone with a one-time invite, gets a task assigned and a DM, and both reach their Inbox.
Usage: python app/test/e2e_loops.py
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4891 + OFF
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
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def rpc(token, project, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "X-Project": project})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())["result"]


def tool(token, project, name, args=None):
    d = rpc(token, project, "tools/call", {"name": name, "arguments": args or {}})
    assert not d.get("isError"), f"{name}: {d}"
    return d["content"][0]["text"]


def raw(url):
    with urllib.request.urlopen(url, timeout=10) as r: return r.read().decode()


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))


def settings_js(name, token, pid, color="#F26B1D"):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'{color}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def page_html(mark):
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Cafe</title></head><body><h1 id="hero">Fresh bread daily</h1><p id="mark">{mark}</p></body></html>"""


def make_repo(path):
    os.makedirs(path, exist_ok=True)
    Path(path, "index.html").write_text(page_html("v1"))
    g = lambda *a: subprocess.run(["git", "-C", path, "-c", "user.email=t@t", "-c", "user.name=T", *a], check=True, capture_output=True)
    g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init")


def wait_mark(frame_page, want, what, limit=15):
    t0 = time.time()
    while time.time() - t0 < limit:
        try:
            if frame_page.frame_locator("#pvw-iframe").locator("#mark").inner_text(timeout=1000) == want: return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"{what}: the preview never showed {want!r}")


def main():
    out = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "vapid-keys.js")], capture_output=True, text=True, check=True).stdout
    kv = dict(l.split("=", 1) for l in out.split())
    keys = {"publicKey": kv["TRIBE_VAPID_PUBLIC"], "privateKey": kv["TRIBE_VAPID_PRIVATE"]}
    tmp = tempfile.mkdtemp(prefix="tribe-loops-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="loops-src-", dir="/tmp")
    cafe = os.path.join(work, "cafe"); make_repo(cafe)
    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_VAPID_PUBLIC": keys["publicKey"], "TRIBE_VAPID_PRIVATE": keys["privateKey"]}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Loop Crew"],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        pid = ok(api("/projects", "POST", {"path": cafe}, token=orion), "project")["project"]["id"]

        # ---- 1: push keys from the environment ----
        assert ok(api("/notify/vapid", token=orion))["publicKey"] == keys["publicKey"], "the server uses the keys from the environment"
        assert not os.path.exists(os.path.join(tmp, ".tribe", "vapid.json")), "fixed keys are not written to disk"

        # ---- 2: an AI helper over MCP ----
        ag = ok(api("/agents", "POST", {}, token=orion, project=pid), "agent"); atok = ag["token"]
        names = {t["name"] for t in rpc(atok, pid, "tools/list")["tools"]}
        need = {"list_tasks", "update_task", "code_write", "code_read", "list_pins", "add_pin_reply", "get_canvas"}
        assert need <= names, f"missing MCP tools: {need - names}"
        task = ok(api("/tasks", "POST", {"title": "Say what's fresh today", "status": "backlog"}, token=orion, project=pid), "task")
        tid = (task.get("task") or task)["id"]
        assert tid in tool(atok, pid, "list_tasks")
        assert "doing" in tool(atok, pid, "update_task", {"id": tid, "take": True, "status": "doing"})

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            co = b.new_context(viewport={"width": 1280, "height": 800}); co.add_init_script(settings_js("Orion", orion, pid))
            o = co.new_page(); watch(o, "orion")
            o.goto(BASE + "/?skipIntro=1")
            o.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            assert o.evaluate("typeof (window.TribeNotify && TribeNotify.resyncPush) === 'function'"), "the app re-sends its push subscription on reconnect"
            o.evaluate("TribePreview.open()")
            o.wait_for_selector("#pvw #pvw-iframe", timeout=10000)
            o.wait_for_function("document.querySelector('#pvw').classList.contains('ready')", timeout=10000)
            wait_mark(o, "v1", "first page")
            tool(atok, pid, "code_write", {"path": "index.html", "text": page_html("v2 from the helper"), "message": "Today's bread"})
            wait_mark(o, "v2 from the helper", "AI helper code_write")
            assert "review" in tool(atok, pid, "update_task", {"id": tid, "status": "review", "note": "Saved index.html"})

            # ---- 3: a pin, answered by the AI helper ----
            o.wait_for_selector("#pvw .pin-cbtn", timeout=5000)
            o.click("#pvw-stage"); o.keyboard.press("c")
            o.wait_for_function("document.querySelector('#pvw').classList.contains('pin-commenting')", timeout=3000)
            o.frame_locator("#pvw-iframe").locator("#hero").click(position={"x": 20, "y": 10})
            o.wait_for_selector(".pin-pop--new textarea", timeout=5000)
            o.fill(".pin-pop textarea", "Can the heading say sourdough?")
            o.press(".pin-pop textarea", "Enter")
            o.wait_for_selector(".pin-pop .pin-th li", timeout=5000)
            listing = tool(atok, pid, "list_pins")
            assert "sourdough" in listing, listing
            import re
            pin_id = re.search(r"\bp-[A-Za-z0-9_-]+", listing).group(0)
            tool(atok, pid, "add_pin_reply", {"id": pin_id, "text": "On it: changing the heading now."})
            o.wait_for_function("[...document.querySelectorAll('.pin-pop .pin-th li')].some(li => /On it/.test(li.innerText))", timeout=8000)
            o.keyboard.press("Escape")

            # ---- 4: live reload without Server-Sent Events ----
            src = o.evaluate("document.querySelector('#pvw-iframe').src")
            path = urllib.parse.urlparse(src).path
            prefix = path[:path.index("/", len("/preview/") + len(pid) + 1) + 1]
            v_before = raw(BASE + prefix + "__tribe/live?poll=1").strip()
            assert v_before.startswith("v"), v_before
            tool(atok, pid, "code_write", {"path": "index.html", "text": page_html("v3"), "message": "v3"})
            for _ in range(40):
                if raw(BASE + prefix + "__tribe/live?poll=1").strip() != v_before: break
                time.sleep(0.25)
            else: raise AssertionError("the poll answer never changed after a save")
            # a page where EventSource connects but never delivers (what a buffering tunnel looks like) still reloads
            cn = b.new_context(viewport={"width": 900, "height": 700})
            cn.add_init_script("window.EventSource = function () { this.readyState = 1; this.close = function () {}; };"
                               "(() => { const si = window.setInterval; window.setInterval = (f, ms, ...a) => si(f, ms === 5000 ? 300 : ms, ...a); const now = Date.now.bind(Date); let skew = 0; setTimeout(() => { skew = 60000; }, 800); Date.now = () => now() + skew; })();")
            n = cn.new_page(); n.goto(src)
            n.wait_for_selector("#mark", timeout=8000)
            first = n.inner_text("#mark")
            tool(atok, pid, "code_write", {"path": "index.html", "text": page_html("v4 by polling"), "message": "v4"})
            n.wait_for_function("document.querySelector('#mark') && document.querySelector('#mark').innerText === 'v4 by polling'", timeout=15000)
            assert first != "v4 by polling"
            cn.close()

            # ---- 5: a friend on a phone ----
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "project": pid}, token=orion), "invite")["invite"]
            sam = ok(api("/join", "POST", {"code": inv["code"], "name": "Sam"}), "join")["token"]
            sam_id = ok(api("/me", token=sam))["member"]["id"]; orion_id = ok(api("/me", token=orion))["member"]["id"]
            cp = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); cp.add_init_script(settings_js("Sam", sam, pid, "#38C6B1"))
            s = cp.new_page(); watch(s, "sam")
            s.goto(BASE + "/?skipIntro=1")
            s.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % pid, timeout=15000)
            t2 = ok(api("/tasks", "POST", {"title": "Photograph the loaves", "status": "backlog"}, token=orion, project=pid), "task2")
            t2id = (t2.get("task") or t2)["id"]
            ok(api(f"/tasks/{t2id}", "PATCH", {"assignee": sam_id}, token=orion, project=pid), "assign")
            dm = "dm-" + "-".join(sorted([orion_id, sam_id]))
            ok(api(f"/chat/{dm}", "POST", {"text": "Morning! Loaves are on your list."}, token=orion, project=pid), "dm")
            deadline = time.time() + 10
            while time.time() < deadline:
                inbox = ok(api("/notify/inbox", token=sam))
                kinds = {i.get("type") for i in inbox.get("items", [])}
                if "task-assigned" in kinds and "dm" in kinds: break
                time.sleep(0.3)
            else: raise AssertionError(f"Sam's inbox: {kinds}")
            s.wait_for_function("window.TribeNotify && TribeNotify.state().unread > 0", timeout=8000)
            b.close()
        assert not errors, "\n".join(errors[:10])
        print("e2e_loops: OK (push keys from env, MCP helper takes a task + code_write → preview, pin answered over MCP, live reload by polling without SSE, phone friend task + DM → inbox)")
    finally:
        srv.terminate()


if __name__ == "__main__":
    import urllib.parse
    main()
