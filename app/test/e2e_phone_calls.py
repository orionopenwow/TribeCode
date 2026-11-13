"""Calls and the Secretary on a tribe that lives only on a phone (app/ui/phonelocal.js, nextopts.js, huddle.js).

A 390px phone starts a tribe on "This phone" (offline.js solo mode, no server). The Secretary works there without AI:
today's chat becomes a summary, an action item with its owner and due date, a decision and a question; "Make it a
task" adds the task to the phone's board; a note lands in today's talk; "ask" answers from today's decisions; the hero
says what runs here and "See options" opens the next-options sheet. A huddle on a phone-only tribe nudges "Voice
huddles need a host". The relay sheet (shown when a call fails without a TURN relay) lists Wi-Fi and the relay how-to.
No page errors, no sideways scroll.
Usage: python app/test/e2e_phone_calls.py
"""
import functools, http.server, os, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "app" / "ui"
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
SPORT = 5700 + OFF
STATIC = f"http://localhost:{SPORT}"
SHOTS = Path(tempfile.mkdtemp(prefix="phone-calls-shots-", dir="/tmp"))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", SPORT), functools.partial(Quiet, directory=str(UI)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-proxy-server", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, permissions=["microphone", "camera"],
                            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")
        ctx.add_init_script("try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',color:'#38C6B1',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.goto(STATIC + "/?skipIntro=1")
        pg.wait_for_function("window.TribePhoneHost && window.TribeOffline && window.TribePhoneLocal && window.TribeSecSum", timeout=15000)
        pg.evaluate("TribePhoneHost.open()")
        pg.wait_for_selector("#ph-start [data-ph='phone']", state="visible")
        pg.click("#ph-start [data-ph='phone']")
        pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=15000)
        ins = pg.locator("#ins-later")
        if ins.count() and ins.is_visible(): ins.click()

        # today's talk, straight into the phone's chat
        for t in ["We decided to ship the beta on Friday with the new pixel art.",
                  "I'll record the trailer voiceover tomorrow.",
                  "Should the boss fight have two phases or three?",
                  "The level editor feels much faster since the canvas rewrite landed this week."]:
            pg.evaluate("t => { const k = TribeOffline._k; k.post(k.cur(), 'me', t); }", t)

        s = pg.evaluate("TribeClient.api('/secretary/summary')")
        assert s.get("local") and s["items"] >= 4, s
        acts = s["actions"]
        assert any("record the trailer voiceover" in a["title"].lower() and a.get("due") for a in acts), acts
        assert any("ship the beta" in d["text"].lower() for d in s["decisions"]), s["decisions"]
        assert any("two phases" in q["text"] for q in s["questions"]), s["questions"]
        again = pg.evaluate("TribeClient.api('/secretary/summary')")
        assert [a["id"] for a in again["actions"]] == [a["id"] for a in acts], "action ids are stable"

        # the view: honest hero, today's notes, one tap to a task
        pg.evaluate("TribeSecretary.open()")
        wait_text(pg, "#view-secretary .sy-hero", "no AI needed")
        assert not pg.locator("#view-secretary #sy-rq-q").count(), "research requests need a host"
        pg.wait_for_selector("#view-secretary [data-act-task]")
        n0 = pg.evaluate("(TribeOffline._k.db().tasks[TribeOffline._k.cur()] || []).length")
        pg.locator("#view-secretary [data-act-task]").first.click()
        pg.wait_for_function(f"(TribeOffline._k.db().tasks[TribeOffline._k.cur()] || []).length === {n0 + 1}", timeout=5000)
        t = pg.evaluate("TribeOffline._k.db().tasks[TribeOffline._k.cur()].slice(-1)[0]")
        assert "trailer" in t["title"].lower() and t.get("due"), t
        assert pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "sideways scroll"
        pg.screenshot(path=str(SHOTS / "phone-secretary.png"))

        # ask + note, locally
        pg.fill("#sy-q", "what did we decide today?"); pg.press("#sy-q", "Enter")
        wait_text(pg, "#view-secretary .sy-answer", "ship the beta")
        r = pg.evaluate("TribeClient.api('/secretary/note', { method: 'POST', body: { text: 'Jay can you draw the title screen by next week?', kind: 'voice' } })")
        assert r["item"]["kind"] == "voice", r
        s2 = pg.evaluate("TribeClient.api('/secretary/summary')")
        assert any("title screen" in a["title"].lower() for a in s2["actions"]), s2["actions"]
        pg.click("#view-secretary [data-sy-next]")
        wait_text(pg, "#nx-sheet", "The Secretary runs on a host")
        pg.keyboard.press("Escape")

        # a huddle on a phone-only tribe says what would help
        pg.evaluate("TribeHuddle.join()")
        pg.wait_for_function("TribeHuddle.inCall()", timeout=8000)
        wait_text(pg, "#nx-nudge", "Voice huddles need a host", timeout=8000)
        pg.evaluate("TribeHuddle.leave()")

        # the relay sheet (a call that fails without TURN)
        pg.evaluate("TribeNextOpts.sheet('relay')")
        wait_text(pg, "#nx-sheet", "can't connect directly")
        assert pg.evaluate("document.querySelector('#nx-sheet [data-nx=wifi]').disabled && !!document.querySelector('#nx-sheet [data-nx=relay]')")
        pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / "phone-relay.png"))
        pg.keyboard.press("Escape")
        b.close()
    srv.shutdown()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print(f"e2e_phone_calls: OK (local Secretary summary/actions/decisions/questions, stable ids, task, ask, note, options; huddle nudge; relay sheet)  shots: {SHOTS}")


if __name__ == "__main__":
    main()
