"""Quick wins from docs/FEATURES-NEXT.md, end to end:
  - Load earlier messages: chat history pages back 100 at a time (?before=<id>), keeping your place
  - Search the chat: /api/chat/<ch>/search and the MCP tool search_chat
  - One-click backup: Settings -> Download backup (host only) -> .tar.gz without secrets -> restore by
    starting a server on the extracted folder: members sign in, chat is there
  - Rename yourself: Settings name/color reach the server, friends see it live
  - Drafts: what you typed in the composer survives a reload; sending clears it
  - Unread count in the tab title while the tab is hidden
  - Photo or file (+ menu): a PDF is shared in chat as a download, a .md becomes a doc
Usage: python app/test/e2e_quickwins.py
"""
import io, json, os, subprocess, sys, tarfile, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, PORT2 = 4844 + OFF, 4845 + OFF
errors = []


def api(path, method="GET", body=None, token=None, port=PORT, raw=False):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(f"http://localhost:{port}/api{path}", method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            return (r.status, data, dict(r.headers)) if raw else (r.status, json.loads(data or b"{}"))
    except urllib.error.HTTPError as e:
        data = e.read()
        return (e.code, data, dict(e.headers)) if raw else (e.code, json.loads(data or b"{}"))

def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]

def mcp_tool(token, name, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": args}}
    req = urllib.request.Request(f"http://localhost:{PORT}/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def wait_until(fn, timeout=15, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        time.sleep(0.15)
    raise AssertionError(f"timed out waiting for {what}")

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))

def serve(d, port):
    p = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", d, "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         env={**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1"})
    wait_until(lambda: api("/health", port=port)[0] == 200, 15, "server up")
    return p

def login(b, name, token, phone=False):
    ctx = b.new_context(**({"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True} if phone else {"viewport": {"width": 1440, "height": 900}}), accept_downloads=True)
    ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r, onboarded: true, server: {url: location.origin, token: %r}, checklist: {setup: true}, tour: {done: true}})); }" % (name, token))
    page = ctx.new_page(); watch(page, name)
    page.goto(f"http://localhost:{PORT}/?skipIntro=1"); wait_text(page, "#sync-status", "connected")
    return page

def chat(page):
    page.evaluate("TribeApp.view() !== 'chat' && TribeApp.show('chat')")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-qw-", dir="/tmp")
    srv = serve(tmp, PORT); srv2 = None
    try:
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}))
        htok = host["token"]
        inv = ok(api("/invites", "POST", {"maxUses": 2}, token=htok))["invite"]
        maya = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))
        mtok, mid = maya["token"], maya["member"]["id"]
        for i in range(230): ok(api("/chat/general", "POST", {"text": f"history line {i:03d}" + (" lava portal" if i == 7 else "")}, token=mtok))

        # ---- API: pages and search
        newest = ok(api("/chat/general?limit=100", token=htok))["messages"]
        assert newest[-1]["text"] == "history line 229" and len(newest) == 100
        older = ok(api(f"/chat/general?limit=100&before={newest[0]['id']}", token=htok))["messages"]
        assert older[-1]["text"] == "history line 129" and len(older) == 100, older[-1]
        assert ok(api("/chat/general?before=nope", token=htok))["messages"] == []
        hits = ok(api("/chat/general/search?q=LAVA%20portal", token=htok))["messages"]
        assert [h["text"] for h in hits] == ["history line 007 lava portal"], hits
        assert ok(api("/chat/general/search?q=", token=htok))["messages"] == []
        atok = ok(api("/agents", "POST", {}, token=mtok))["token"]
        err, txt = mcp_tool(atok, "search_chat", {"query": "lava"}); assert not err and "history line 007" in txt and "Maya" in txt, txt
        err, txt = mcp_tool(atok, "search_chat", {"query": "zebra"}); assert not err and "No messages" in txt

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hp = login(b, "Orion", htok); chat(hp)
            mp = login(b, "Maya", mtok, phone=True); chat(mp)

            # ---- Load earlier messages, keeping the reader's place
            wait_text(hp, "#chat-list", "history line 229")
            hp.wait_for_selector("#chat-more")
            assert "history line 129" not in hp.inner_text("#chat-list")
            hp.evaluate("document.querySelector('#chat-list').scrollTop = 0")
            anchor = hp.evaluate("document.querySelector('#chat-list .msg[data-id]').dataset.id")
            hp.click("#chat-more")
            wait_text(hp, "#chat-list", "history line 129")
            top = hp.evaluate("id => { const l = document.querySelector('#chat-list'), e = l.querySelector(`.msg[data-id='${id}']`); return e.getBoundingClientRect().top - l.getBoundingClientRect().top; }", anchor)
            assert top > 0, f"the message you were reading stays in view (offset {top})"
            hp.evaluate("document.querySelector('#chat-list').scrollTop = 0"); hp.click("#chat-more")
            wait_text(hp, "#chat-list", "history line 000")
            assert hp.locator("#chat-more").count() == 0, "no button at the start of the chat"
            assert hp.locator("#chat-list .msg.dx[data-id]").count() >= 230, "older pages get the full bubble renderer"

            # ---- Unread count in the title while hidden
            base = hp.title()
            hp.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
            ok(api("/chat/general", "POST", {"text": "are you there?"}, token=mtok)); ok(api("/chat/general", "POST", {"text": "ping"}, token=mtok))
            hp.wait_for_function("document.title.startsWith('(2) ')")
            hp.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
            hp.wait_for_function("t => document.title === t", arg=base)

            # ---- Drafts survive a reload; sending clears them
            mp.click('#tabbar [data-nav="chat"]') if mp.locator('#tabbar [data-nav="chat"]').is_visible() else None
            mp.wait_for_selector("#chat-input", state="visible")
            mp.fill("#chat-input", "half-written idea about lava")
            mp.reload(); wait_text(mp, "#sync-status", "connected"); chat(mp)
            mp.wait_for_function("document.querySelector('#chat-input').value === 'half-written idea about lava'")
            mp.click("#m2-send") if mp.locator("#m2-send").is_visible() else mp.press("#chat-input", "Enter")
            wait_text(hp, "#chat-list", "half-written idea about lava")
            mp.reload(); wait_text(mp, "#sync-status", "connected"); chat(mp)
            mp.wait_for_timeout(400)
            assert mp.input_value("#chat-input") == "", "a sent draft is gone"

            # ---- Rename yourself: Settings -> server -> friends
            mp.evaluate("TribeSettings.open()"); mp.wait_for_selector("#set-name")
            mp.fill("#set-name", "Maya Q"); mp.press("#set-name", "Tab")
            wait_until(lambda: ok(api("/me", token=mtok))["member"]["name"] == "Maya Q", what="name on the server")
            hp.wait_for_function("id => (TribeClient.state().members || []).some(m => m.id === id && m.name === 'Maya Q')", arg=mid)
            mp.click("#settings-modal [data-color='#38C6B1']") if mp.locator("#settings-modal [data-color='#38C6B1']").count() else None
            assert api("/me", "PATCH", {"name": "x"}, token=atok)[0] == 403, "agents keep their names"
            assert api("/me", "PATCH", {"name": "  "}, token=mtok)[0] == 400
            mp.evaluate("TribeSettings.close()")
            assert mp.locator("#set-backup").count() == 0

            # ---- + menu: a PDF goes to chat as a download, a .md becomes a doc
            hp.click("#chat-form .cx-plus")
            hp.wait_for_selector(".pl-menu [data-pl='attach']")
            with hp.expect_file_chooser() as fc: hp.click(".pl-menu [data-pl='attach']")
            fc.value.set_files([{"name": "design.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 tiny"}, {"name": "notes.md", "mimeType": "text/markdown", "buffer": b"# Notes\n\nlava"}])
            hp.wait_for_selector("#chat-list .fchip-dl")
            assert "design.pdf" in hp.inner_text("#chat-list .fchip-dl")
            href = hp.get_attribute("#chat-list .fchip-dl", "href")
            body = hp.evaluate("u => fetch(u).then(r => r.text())", href); assert body == "%PDF-1.4 tiny", body
            wait_until(lambda: any(d["title"] == "notes" for d in api("/docs", token=htok)[1]["docs"]), what="notes.md became a doc")
            wait_text(mp, "#chat-list", "design.pdf")

            # ---- Backup from Settings (host), then restore it into a fresh server
            hp.evaluate("TribeSettings.open()"); hp.wait_for_selector("#set-backup")
            with hp.expect_download() as dl: hp.click("#set-backup")
            path = dl.value.path(); assert dl.value.suggested_filename.endswith(".tar.gz"), dl.value.suggested_filename
            assert api("/backup", token=mtok)[0] == 403, "only the host downloads backups"
            Path(tmp, ".tribe", "secrets").mkdir(parents=True, exist_ok=True); Path(tmp, ".tribe", "secrets", "x.json").write_text('{"githubToken":"ghp_secret"}')
            st, raw, hdr = api("/backup", token=htok, raw=True); assert st == 200 and hdr["Content-Type"] == "application/gzip"
            with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tf:
                names = tf.getnames()
                assert any(n.endswith("/chat/general.jsonl") for n in names) and any(n.endswith("/.tribe/members.json") for n in names), names[:20]
                assert not any("/.tribe/secrets" in n for n in names), "secrets never leave the host"
                assert not any(n.endswith(".tmp") for n in names)
                restore = tempfile.mkdtemp(prefix="tribe-restore-", dir="/tmp")
                tf.extractall(restore, filter="data")
            with tarfile.open(path, mode="r:gz") as tf: assert len(tf.getnames()) > 5   # the browser download is a real archive too
            root = Path(restore) / os.listdir(restore)[0]
            srv2 = serve(str(root), PORT2)
            assert ok(api("/me", token=mtok, port=PORT2))["member"]["name"] == "Maya Q", "members sign in on the restored tribe"
            msgs = ok(api("/chat/general?limit=500", token=htok, port=PORT2))["messages"]
            assert any(m["text"] == "history line 000" for m in msgs) and any((m.get("media") or {}).get("name") == "design.pdf" for m in msgs)
            pdf = next(m for m in msgs if (m.get("media") or {}).get("name") == "design.pdf")
            assert api(f"/chat/general/media/{pdf['media']['file']}", token=htok, port=PORT2, raw=True)[1] == b"%PDF-1.4 tiny"
            b.close()
        assert not errors, "\n".join(errors)
        print("Quick wins test passed")
    finally:
        srv.terminate()
        if srv2: srv2.terminate()


if __name__ == "__main__":
    main()
