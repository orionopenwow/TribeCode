"""The offline demo behaves like your own tribe (app/ui/offline.js, feat/demo-auto), with NO tribe server (a static file
server over app/ui). In the calm demo: react to a message (double-click = 👍 in the real chat, and the quick-react
bar), reply, pin, edit and delete your own message, a picture in chat (an object URL, no server), a DM to a pretend
friend; create a task, assign it to Maya (she accepts and starts it), move it on the board, assign one to Claude (he
picks it up and asks for a merge), approve it from the Inbox (the task lands in Done); a doc and a note in Files, a
comment on the doc (Maya answers); a pretend huddle. None of these shows "This needs the tribe online", and nothing
logs an error. Usage: python app/test/e2e_demo_actions.py
"""
import base64, functools, http.server, json, os, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
PORT = 5250 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
PNG = base64.b64encode(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGP8z8DAQAxgIk4ZqIJRDaMahqcGAA6eAh/0Jb9QAAAAAElFTkSuQmCC")).decode()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def api(pg, path, body=None, method=None):
    m = method or ("POST" if body is not None else "GET")
    return pg.evaluate("([p, m, b]) => TribeClient.api(p, b === null ? { method: m } : { method: m, body: b })", [path, m, body])


def no_needs_card(pg, what):
    assert pg.locator("#od-needs").count() == 0, f"{what}: showed 'This needs the tribe online'"
    assert "not in the offline demo" not in (pg.text_content(".toast") or "").lower() if pg.locator(".toast").count() else True, what


def main():
    errors = []
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(SEED)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            pg.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeOffline && window.TribeHub", timeout=15000)
            pg.evaluate("TribeOffline.start('quiet')")
            pg.wait_for_function("TribeOffline.active() && TribeClient.connected() && (TribeClient.state().projects || []).length", timeout=15000)

            # ---- chat: send, then react in the real UI ----
            pg.evaluate("TribeApp.show('chat')")
            pg.wait_for_selector("#chat-input", state="visible", timeout=8000)
            pg.fill("#chat-input", "First playtest tonight?")
            pg.press("#chat-input", "Enter")
            pg.wait_for_function("[...document.querySelectorAll('#chat-list .msg')].some(e => e.textContent.includes('First playtest tonight'))", timeout=8000)
            mid = pg.evaluate("TribeOffline.state().chat['lantern-run'].filter(m => m.by === 'me').pop().id")
            pg.dblclick(f"#chat-list .msg[data-id='{mid}'] p")   # double-click = 👍
            pg.wait_for_selector(f"#chat-list .msg[data-id='{mid}'] .rx[data-rx='👍']", timeout=5000)
            assert "me" in pg.evaluate(f"TribeOffline.state().chat['lantern-run'].find(m => m.id === '{mid}').reactions['👍']")
            # the quick-react bar (the screenshot's "React 👍" row): ❤️
            r = api(pg, "/chat/general/react", {"id": mid, "emoji": "❤️"})
            assert r["message"]["reactions"]["❤️"] == ["me"], r
            pg.wait_for_selector(f"#chat-list .msg[data-id='{mid}'] .rx[data-rx='❤️']", timeout=5000)
            # a pretend friend reacts too (Maya)
            pg.wait_for_function(f"Object.values(TribeOffline.state().chat['lantern-run'].find(m => m.id === '{mid}').reactions || {{}}).some(l => l.includes('maya'))", timeout=6000)
            no_needs_card(pg, "reactions")

            # ---- reply, pin, edit, delete ----
            rep = api(pg, "/chat/general/send", {"text": "Yes! 8 pm", "replyTo": mid})["message"]
            assert rep["replyTo"]["id"] == mid and "First playtest" in rep["replyTo"]["text"], rep
            pins = api(pg, "/chat/general/pin", {"id": mid})["pins"]
            assert [x["id"] for x in pins] == [mid]
            assert [x["id"] for x in api(pg, "/chat/general/pins")["pins"]] == [mid]
            ed = api(pg, f"/chat/general/msg/{rep['id']}", {"text": "Yes! 9 pm"}, "PATCH")["message"]
            assert ed["text"] == "Yes! 9 pm" and ed["edited"]
            pg.wait_for_function("[...document.querySelectorAll('#chat-list .msg')].some(e => e.textContent.includes('9 pm'))", timeout=5000)
            gone = api(pg, f"/chat/general/msg/{rep['id']}", None, "DELETE")["message"]
            assert gone["deleted"] and not gone["text"]
            # a picture: an object URL, nothing on a server
            im = api(pg, "/chat/general/image", {"data": PNG, "mime": "image/png", "text": "concept art"})["message"]
            assert im["media"]["kind"] == "image"
            pg.wait_for_function(f"(() => {{ const i = document.querySelector(`#chat-list .msg[data-id='{im['id']}'] img`); return i && i.src.startsWith('blob:') && i.complete && i.naturalWidth === 16; }})()", timeout=8000)
            # a DM to Maya, and she answers
            dm = api(pg, "/chat/dm-maya-me/send", {"text": "psst, can you draw the lantern?"})["message"]
            assert dm["by"] == "me"
            pg.wait_for_function("TribeClient.api('/chat/dm-maya-me').then(r => r.messages.some(m => m.by === 'maya'))", timeout=6000)
            assert api(pg, "/dms")["conversations"][0]["with"] == "maya"
            no_needs_card(pg, "chat actions")

            # ---- tasks: create, assign to Maya (she accepts), move, assign to Claude, approve ----
            t = api(pg, "/tasks", {"title": "[Art] Lantern glow", "assignee": "maya"})["task"]
            pg.wait_for_function(f"TribeOffline.state().tasks['lantern-run'].find(x => x.id === '{t['id']}').status === 'doing'", timeout=6000)
            pg.wait_for_function("TribeOffline.state().chat['lantern-run'].some(m => m.by === 'maya' && /Accepted/.test(m.text))", timeout=6000)
            pg.evaluate("TribeApp.show('tasks')")
            pg.wait_for_selector(f"#board .task[data-id='{t['id']}']", timeout=8000)
            pg.evaluate(f"TribeTasks.patch('{t['id']}', {{ status: 'review' }})")
            pg.wait_for_function(f"TribeOffline.state().tasks['lantern-run'].find(x => x.id === '{t['id']}').status === 'review'", timeout=5000)
            c = api(pg, "/tasks", {"title": "[Audio] Jump sound"})["task"]
            api(pg, f"/tasks/{c['id']}", {"assignee": "claude"}, "PATCH")
            pg.wait_for_function(f"(TribeOffline.state().approvals || []).some(a => a.task === '{c['id']}' && a.status === 'pending')", timeout=15000)
            aid = pg.evaluate(f"TribeOffline.state().approvals.find(a => a.task === '{c['id']}').id")
            pg.evaluate("TribeNotify.openInbox()")
            pg.wait_for_selector(f"[data-decide='approve'][data-ap='{aid}']", state="visible", timeout=8000)
            pg.click(f"[data-decide='approve'][data-ap='{aid}']")
            pg.wait_for_function(f"TribeOffline.state().approvals.find(a => a.id === '{aid}').status === 'approved'", timeout=5000)
            pg.wait_for_function(f"TribeOffline.state().tasks['lantern-run'].find(x => x.id === '{c['id']}').status === 'done'", timeout=5000)
            pg.evaluate("TribeNotify.closeInbox && TribeNotify.closeInbox()")
            no_needs_card(pg, "tasks and approvals")

            # ---- files: a doc, a note, a comment on the doc ----
            d = api(pg, "/docs", {"title": "Level notes", "body": "# Level notes\n\nThe second gap is too wide."})["doc"]
            assert any(x["slug"] == d["slug"] for x in api(pg, "/docs")["docs"])
            notes = api(pg, "/scratch", {"notes": [{"text": "playtest at 9"}]}, "PUT")["notes"]
            assert notes and notes[0]["text"] == "playtest at 9"
            th = api(pg, f"/docs/{d['slug']}/comments", {"body": "Shorter gap?", "quote": "second gap", "offset": 18})["thread"]
            pg.wait_for_function(f"TribeClient.api('/docs/{d['slug']}/comments').then(r => r.threads.some(t => t.id === '{th['id']}' && t.replies.some(x => x.by === 'maya')))", timeout=6000)
            api(pg, f"/docs/{d['slug']}/comments/{th['id']}", {"resolved": True}, "PATCH")
            # an upload in Files keeps its picture as an object URL
            up = pg.evaluate("(async () => { const b = await (await fetch('data:image/png;base64," + PNG + "')).blob(); return (await (await fetch(TribeClient.base() + '/api/uploads?name=art.png&scope=project', { method: 'POST', body: b, headers: { Authorization: 'Bearer offline-demo' } })).json()).file; })()")
            assert up["kind"] == "image"
            assert pg.evaluate(f"TribeOffline.mediaUrl(TribeClient.base() + '/api/uploads/{up['id']}/raw')").startswith("blob:")
            no_needs_card(pg, "files")

            # ---- a proposal: your yes, then Maya's, and it passes ----
            pr = api(pg, "/proposals", {"title": "Add a double jump", "body": "- [ ] Double jump"})["proposal"]
            pg.wait_for_function(f"TribeClient.api('/proposals').then(r => r.proposals.find(p => p.id === '{pr['id']}').status === 'approved')", timeout=6000)

            # ---- a pretend huddle: Maya is in it ----
            got = pg.evaluate("new Promise(res => { TribeClient.on('huddle', m => { if (m && m.length) res(m); }); TribeClient.send({ type: 'huddle-join', muted: true }); })")
            assert {x["id"] for x in got} == {"me", "maya"}, got
            pg.evaluate("TribeClient.send({ type: 'huddle-leave' })")

            # only truly impossible things say "This needs the tribe online": a calm card with Host
            pg.evaluate("TribeClient.api('/agents/connect-real', { method: 'POST', body: {} }).catch(() => {})")
            pg.wait_for_selector("#od-needs", state="visible", timeout=4000)
            assert "The demo can’t do this" in pg.text_content("#od-needs") and pg.locator("#od-needs [data-od=real]").count() == 1
            ctx.close(); b.close()
    finally:
        srv.shutdown()
    noise = [e for e in errors if "favicon" not in e and "404" not in e]
    assert not noise, "\n".join(noise[:20])
    print("e2e_demo_actions: OK")


if __name__ == "__main__":
    main()
