"""End-to-end friend smoke test: one-click project -> instant link -> a friend on a phone -> everything they
send lands live for the host AND on disk -> the server restarts -> everything is still there.

  1. Host one-click creates a project (POST /api/flow/create, what "+ -> Create" calls) and gets the invite
     link in the same response (instant; GitHub REST mocked, push to a local bare repo).
  2. A friend opens the link on a phone, picks a name, joins, lands in the project chat (/m/<key>/ device link).
  3. The friend sends text (composer), a reply, a reaction, an image, a voice note (the recorder's API),
     a file (PDF, kept as a download), drops a Markdown file into Docs, makes a task and votes.
  4. The host sees every one of them live.
  5. On disk: chat JSONL, chat/media, docs Markdown, tasks, project folder, members/devices with hashed
     tokens only. No plaintext token or device key anywhere in the tribe folder.
  6. The friend connects their Claude Code (MCP): tools/list, post_gist, read_chat; the stdio bridge round-trips.
  7. Integrations: ntfy + Web Push settings, GitHub push (bare repo), Workshop publish + use.
  8. Restart the server on the same --dir: chat, reactions, media, docs, tasks, votes, members, the device
     link and the agent key all still work; the phone reconnects and shows history.
  9. The socket does not churn when connect() runs twice (reconnect-loop regression).
  10. An existing member opening a second project's invite gets that project (no second account).
Usage: python app/test/e2e_friend_flow.py
"""
import base64, json, os, re, signal, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4841 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
errors = []
GH_TOKEN = "ghp_" + "Fr1e" * 9
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
WEBM = bytes.fromhex("1a45dfa3") + b"\x00" * 60   # the server keeps voice notes as-is; a tiny EBML header is enough
PDF = b"%PDF-1.4\n% friend smoke test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def chat(page):
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")
    return page

def api(path, method="GET", body=None, token=None, project=None, raw=False):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            if raw: return r.status, data, dict(r.headers)
            try: return r.status, json.loads(data or b"{}")
            except ValueError: return r.status, data.decode()
    except urllib.error.HTTPError as e:
        data = e.read()
        if raw: return e.code, data, dict(e.headers)
        try: return e.code, json.loads(data or b"{}")
        except ValueError: return e.code, data.decode()

def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]

def mcp(token, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["result"]

def tool(token, name, args=None):
    d = mcp(token, "tools/call", {"name": name, "arguments": args or {}})
    return d.get("isError", False), d["content"][0]["text"]

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def wait_until(fn, timeout=20, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for {what}")

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and "api.github.com" not in m.text and errors.append(f"{who} console: {m.text}"))

b64 = lambda b: base64.b64encode(b).decode()


# ---------- a tiny GitHub REST API: POST /user/repos makes a local bare repo to push to ----------
GH = {"calls": [], "root": None}
class GitHubMock(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        GH["calls"].append({"path": self.path, "body": body})
        if self.headers.get("Authorization") != "Bearer " + GH_TOKEN: return self.reply(401, {"message": "Bad credentials"})
        if self.path != "/user/repos": return self.reply(404, {"message": "Not Found"})
        bare = os.path.join(GH["root"], body["name"] + ".git")
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", bare], check=True)
        self.reply(201, {"name": body["name"], "full_name": "orion/" + body["name"], "private": True, "clone_url": bare, "html_url": "https://github.com/orion/" + body["name"]})
    def reply(self, code, data):
        raw = json.dumps(data).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)


def start_server(tmp, env, log):
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    wait_until(lambda: api("/health")[0] == 200, 15, "server up")
    return srv

def stop_server(srv):
    srv.send_signal(signal.SIGTERM)
    try: srv.wait(10)
    except subprocess.TimeoutExpired: srv.kill(); srv.wait()


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-ff-", dir="/tmp")
    GH["root"] = tempfile.mkdtemp(prefix="ff-gh-", dir="/tmp")
    gh = ThreadingHTTPServer(("127.0.0.1", 0), GitHubMock); threading.Thread(target=gh.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_GITHUB_API": f"http://127.0.0.1:{gh.server_address[1]}", "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_REPO_POLL_MS": "1000"}
    log = open(os.path.join(tmp, "..", f"ff-server-{PORT}.log"), "w+")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    srv = start_server(tmp, env, log)
    secrets = []   # every token / key we see: none may appear on disk
    ok_all = False
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900})
            host = hctx.new_page(); watch(host, "host"); named(host, "Orion")
            host.goto(BASE + "/?skipIntro=1"); wait_text(host, "#sync-status", "connected")
            htok = host.evaluate("TribeStore.get().server.token"); secrets.append(htok)
            ok(api("/me/git", "PUT", {"githubToken": GH_TOKEN}, token=htok), "github token")
            secrets.append(GH_TOKEN)

            # ---- 1. one click: project + instant invite link in the same response
            t0 = time.time()
            fl = ok(api("/flow/create", "POST", {"name": "Pixel Party"}, token=htok), "one-click create")["flow"]
            took = time.time() - t0
            pid = fl["project"]; link = fl["invite"]["link"]
            assert "/join/" in link and took < 3, (link, took)
            code = link.rstrip("/").split("/join/")[-1]
            print(f"  one-click create -> link in {took:.2f}s: {link}")
            host.evaluate(f"TribeClient.switchProject({pid!r})")
            wait_until(lambda: host.evaluate("TribeClient.project()") == pid, what="host in project")
            chat(host)

            # ---- 2. friend on a phone: link -> name -> Join -> device link -> project chat
            fctx = b.new_context(**PHONE)
            fctx.add_init_script("""(() => { const W = window.WebSocket; window.__wsOpened = 0;
              window.WebSocket = function (...a) { window.__wsOpened++; return new W(...a); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 }); })()""")
            phone = fctx.new_page(); watch(phone, "phone")
            phone.goto(link); phone.wait_for_selector("#form:not(.hidden)")
            assert "Pixel Party" in phone.inner_text("#lead")
            phone.fill("#name", "Maya"); phone.click("#go")
            phone.wait_for_url("**/m/*/"); phone.wait_for_selector("#install-sheet"); phone.click("#ins-later")
            wait_text(phone, "#sync-status", "connected")
            device_key = re.search(r"/m/([A-Za-z0-9_-]+)/", phone.url).group(1); secrets.append(device_key)
            ftok = phone.evaluate("TribeStore.get().server.token"); secrets.append(ftok)
            assert phone.evaluate("TribeClient.project()") == pid, "friend lands in the project"
            maya = ok(api("/me", token=ftok))["member"]; assert maya["projects"] == [pid], maya
            wait_text(host, "#chat-list", "Maya joined Pixel Party")

            # ---- 3. the friend sends everything
            phone.click('#tabbar [data-nav="chat"]'); phone.wait_for_selector("#view-chat:not(.hidden) #chat-input", state="visible")
            phone.fill("#chat-input", "hey team, phone here"); phone.click("#m2-send")
            wait_text(host, "#chat-list", "hey team, phone here")
            msgs = ok(api("/chat/general?limit=50", token=ftok))["messages"]
            first = next(m for m in msgs if m["text"] == "hey team, phone here")
            ok(api("/chat/general/send", "POST", {"text": "replying to myself", "replyTo": first["id"]}, token=ftok), "reply")
            ok(api("/chat/general/react", "POST", {"id": first["id"], "emoji": "🔥"}, token=ftok), "react")
            ok(api("/chat/general/react", "POST", {"id": first["id"], "emoji": "👍"}, token=htok), "host react")
            img = ok(api("/chat/general/image", "POST", {"data": b64(PNG), "mime": "image/png", "text": "the hero"}, token=ftok), "image")["message"]
            vn = ok(api("/chat/general/voice", "POST", {"data": b64(WEBM), "mime": "audio/webm;codecs=opus", "dur": 3, "transcript": "double jump feels great", "wave": [1, 4, 7, 3]}, token=ftok), "voice")["message"]
            fil = ok(api("/chat/general/file", "POST", {"data": b64(PDF), "name": "Level plan.pdf", "mime": "application/pdf"}, token=ftok), "file")["message"]
            assert fil["media"]["kind"] == "file" and fil["media"]["name"] == "Level plan.pdf" and fil["media"]["file"].endswith(".bin"), fil
            # the Docs drop (plus menu: text files become docs)
            phone.evaluate("""() => window.TribeDocs.importFiles([new File(['# Level ideas\\n\\n- lava world\\n- ice world\\n'], 'level-ideas.md', { type: 'text/markdown' })])""")
            wait_until(lambda: any(d["title"] == "level-ideas" for d in api("/docs", token=ftok)[1]["docs"]), what="doc imported")
            task = ok(api("/tasks", "POST", {"title": "Draw the lava tiles"}, token=ftok), "task")["task"]
            vote = ok(api("/chat/general/vote", "POST", {"question": "Ship the lava world first?", "options": []}, token=htok), "vote")["message"]
            opt = vote["vote"]["options"][0]["id"]
            ok(api(f"/chat/general/vote/{vote['id']}/cast", "POST", {"option": opt}, token=ftok), "cast")

            # ---- 4. the host sees all of it live
            wait_text(host, "#chat-list", "replying to myself")
            host.wait_for_selector(f'.msg[data-id="{first["id"]}"] .rx[data-rx="🔥"]')
            host.wait_for_selector(f'.msg[data-id="{img["id"]}"] .thumb img')
            host.wait_for_selector(f'.msg[data-id="{vn["id"]}"].has-vn')
            host.wait_for_selector(f'.msg[data-id="{fil["id"]}"] .fchip-dl')
            assert "Level plan.pdf" in host.inner_text(f'.msg[data-id="{fil["id"]}"]')
            host.wait_for_selector(".msg.dx .quote")
            wait_text(host, "#chat-list", "Ship the lava world first?")
            # the image, voice note and file are served back (file: always a download)
            st, data, hdr = api(f"/chat/general/media/{fil['media']['file']}", token=htok, project=pid, raw=True)
            assert st == 200 and data == PDF and hdr.get("Content-Type") == "application/octet-stream" and "attachment" in hdr.get("Content-Disposition", ""), (st, hdr)
            st, data, hdr = api(f"/chat/general/media/{img['media']['file']}", token=htok, project=pid, raw=True); assert st == 200 and data == PNG
            assert api(f"/chat/general/media/{img['media']['file']}", token=htok, project=pid, raw=True)[0] == 200

            # ---- 5. on disk
            T = Path(tmp)
            proj = next(x for x in json.loads((T / ".tribe" / "projects.json").read_text()) if x["id"] == pid)
            chan = T / "chat" / f"{proj['channel']}.jsonl"
            lines = [json.loads(l) for l in chan.read_text().splitlines() if l.strip()]
            texts = [l.get("text") for l in lines]
            assert "hey team, phone here" in texts and "replying to myself" in texts, texts
            assert next(l for l in lines if l["id"] == first["id"])["reactions"] == {"🔥": [maya["id"]], "👍": [ok(api('/me', token=htok))['member']['id']]}
            media = T / "chat" / "media"
            for m in (img, vn, fil): assert (media / m["media"]["file"]).exists(), m["media"]
            assert (media / fil["media"]["file"]).read_bytes() == PDF
            doc = next(f for f in (T / "docs").glob("*.md") if "level-ideas" in f.name)
            assert f'project: "{pid}"' in doc.read_text() and "lava world" in doc.read_text()
            assert (T / "tasks" / f"{task['id']}.md").exists()
            ws = T / "workspaces" / pid
            for f in ["README.md", "VISION.md", "CLAUDE.md"]: assert (ws / f).exists(), f
            members = json.loads((T / ".tribe" / "members.json").read_text())
            assert all("token" not in m and len(m.get("tokenHash") or "x" * 64) == 64 for m in members)
            devices = json.loads((T / ".tribe" / "devices.json").read_text())
            assert devices and all(len(d["keyHash"]) == 64 for d in devices)

            # ---- 6. the friend's Claude Code
            ag = ok(api("/agents", "POST", {}, token=ftok), "connect claude")
            atok = ag["token"]; secrets.append(atok)
            assert "claude mcp add" in ag["command"] and atok in ag["command"]
            names = {t["name"] for t in mcp(atok, "tools/list")["tools"]}
            assert {"post_chat", "read_chat", "post_gist", "list_tasks", "check_messages"} <= names, names
            err, txt = tool(atok, "read_chat"); assert not err and "hey team, phone here" in txt, txt
            err, txt = tool(atok, "post_gist", {"kind": "progress", "title": "Lava tiles drafted", "bullets": ["Six tiles in assets/lava", "Next: animate the glow"]})
            assert not err, txt
            wait_text(host, "#chat-list", "Lava tiles drafted")
            err, txt = tool(atok, "post_chat", {"text": "Claude here: tiles are in"}); assert not err, txt
            wait_text(host, "#chat-list", "Claude here: tiles are in")
            # Claude Desktop stdio bridge round-trip
            pr = subprocess.run(["node", str(ROOT / "scripts" / "mcp-stdio.js"), BASE + "/mcp"], capture_output=True, text=True, timeout=30, env={**os.environ, "TRIBE_TOKEN": atok},
                                input=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}}) + "\n"
                                + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "read_chat", "arguments": {}}}) + "\n")
            out = {o["id"]: o for o in map(json.loads, filter(str.strip, pr.stdout.splitlines()))}
            assert pr.returncode == 0 and "hey team" in out[2]["result"]["content"][0]["text"] and atok not in pr.stderr + pr.stdout, (pr.returncode, pr.stderr)

            # ---- 7. integrations
            prefs = ok(api("/notify/prefs", "PUT", {"ntfy": {"enabled": True, "topic": "pixel-party-maya"}}, token=ftok), "ntfy prefs")
            assert json.dumps(prefs).count("pixel-party-maya"), prefs
            sub = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "BOrX" * 20, "auth": "aGVsbG8"}}
            assert ok(api("/notify/webpush", "POST", {"subscription": sub}, token=ftok), "webpush")["devices"] == 1
            assert api("/notify/webpush", "POST", {"subscription": {"endpoint": "http://insecure"}}, token=ftok)[0] == 400
            bare = os.path.join(GH["root"], f"{pid}.git")
            wait_until(lambda: os.path.isdir(bare) and sh("git", "--git-dir", bare, "log", "-1", "--format=%s", "main"), 30, "pushed to the GitHub mock")
            assert GH["calls"] and GH["calls"][0]["body"]["private"] is True
            (ws / "app" / "jump.js").write_text("export const JUMP = 2;\n")
            item = ok(api("/workshop/items", "POST", {"kind": "script", "title": "Jump constant", "license": "MIT", "from": {"project": pid, "paths": ["app/jump.js"]}}, token=htok, project=pid), "workshop publish")["item"]
            used = ok(api(f"/workshop/items/{item['id']}/use", "POST", {"project": pid, "dest": "vendor/jump"}, token=ftok, project=pid), "workshop use")
            assert (ws / "vendor" / "jump" / "jump.js").read_text() == "export const JUMP = 2;\n", used

            # no plaintext secret anywhere in the tribe folder (tokens, device key, agent key, GitHub token stays in secrets only)
            leaks = []
            for f in T.rglob("*"):
                if not f.is_file() or ".git" in f.parts: continue
                data = f.read_bytes()
                for s in secrets:
                    if s.encode() in data and not (s == GH_TOKEN and ".tribe" in f.parts and "secrets" in str(f)): leaks.append((str(f.relative_to(T)), s[:6]))
            assert not leaks, f"plaintext secrets on disk: {leaks}"

            # ---- 9. reconnect-loop regression: connect() twice must leave one socket, not churn
            n0 = phone.evaluate("window.__wsOpened")
            phone.evaluate("TribeClient.connect(); TribeClient.connect()")
            phone.wait_for_timeout(3500)
            opened = phone.evaluate("window.__wsOpened") - n0
            assert opened == 2, f"socket churn: {opened} sockets opened in 3.5 s after two connect() calls"
            wait_text(phone, "#sync-status", "connected")

            # ---- 8. restart on the same folder: everything persists
            stop_server(srv)
            wait_text(phone, "#sync-status", "reconnecting", 10000)
            srv = start_server(tmp, env, log)
            wait_text(phone, "#sync-status", "connected", 25000)
            wait_text(host, "#sync-status", "connected", 25000)
            assert ok(api("/me", token=ftok))["member"]["id"] == maya["id"], "friend token still works"
            msgs = ok(api("/chat/general?limit=100", token=ftok))["messages"]
            byid = {m["id"]: m for m in msgs}
            assert byid[first["id"]]["reactions"]["🔥"] == [maya["id"]] and img["id"] in byid and vn["id"] in byid and fil["id"] in byid
            assert any(m.get("replyTo", {}).get("id") == first["id"] for m in msgs)
            assert api(f"/chat/general/media/{vn['media']['file']}", token=ftok, raw=True)[0] == 200
            assert any(d["title"] == "level-ideas" for d in ok(api("/docs", token=ftok))["docs"])
            assert any(t["id"] == task["id"] for t in ok(api("/tasks", token=ftok))["tasks"])
            vs = ok(api("/chat/general/votes", token=ftok))["votes"]
            v = next(x for x in vs if x["id"] == vote["id"]); assert v["tally"]["voted"] >= 1, v
            r = ok(api("/device-link/redeem", "POST", {"key": device_key}), "device link after restart"); secrets.append(r["token"])
            assert r["member"]["id"] == maya["id"]
            err, txt = tool(atok, "read_chat"); assert not err and "Claude here: tiles are in" in txt, "agent key survives the restart"
            assert ok(api("/flow", token=htok, project=pid))["flow"]["invite"]["code"] == code
            phone.reload(); wait_text(phone, "#sync-status", "connected")
            chat(phone); wait_text(phone, "#chat-list", "hey team, phone here")

            # ---- 10. an existing member opens a second project's invite: no second account
            p2 = ok(api("/flow/create", "POST", {"name": "Side Quest"}, token=htok), "second project")["flow"]
            link2 = p2["invite"]["link"]
            phone.goto(link2)
            phone.wait_for_url(re.compile(r".*/(\?.*)?$"), timeout=15000)
            wait_text(phone, "#sync-status", "connected")
            me2 = ok(api("/me", token=ftok))["member"]
            assert sorted(me2["projects"]) == sorted([pid, p2["project"]]), me2
            assert sum(1 for m in json.loads((T / ".tribe" / "members.json").read_text()) if m["name"] == "Maya") == 1
            wait_until(lambda: phone.evaluate("TribeClient.project()") == p2["project"], what="phone opens the new project")

            b.close()
        assert not errors, "\n".join(errors)
        ok_all = True
        print("Friend flow smoke test passed")
    finally:
        try: stop_server(srv)
        except Exception: pass
        gh.shutdown()
        if not ok_all:
            log.seek(0); print(log.read()[-4000:])


if __name__ == "__main__":
    main()
