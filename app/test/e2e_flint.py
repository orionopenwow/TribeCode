"""Flint, the built-in helper (app/ui/flint.js, server/flint.js): the "Ask Flint…" bar pinned in the desktop right panel,
the suggestion chips, notes, tasks, Guide answers, connect Claude, the thread kept across a reload, the basic-mode
fallback with no model, the phone's Talk to… › Flint full-screen thread at 390px, and the local-model step streaming
from a fake Ollama. Usage: python app/test/e2e_flint.py [--shots]
(--shots writes docs/screenshots/flint-desktop.png and docs/screenshots/phone-flint.png)"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4983 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)


def api(path, method="GET", body=None, token=None, base=BASE, raw=False):
    req = urllib.request.Request(base + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return r.status, (data.decode() if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait_up(base):
    for _ in range(80):
        try: urllib.request.urlopen(base + "/api/health"); return
        except Exception: time.sleep(0.15)

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{who} console: {m.text[:200]}"))

def ask(page, text, expect, inp="#fl-input"):
    n = page.locator(".fl-thread .fl-msg.fl").count() if inp == "#fl-input" else page.locator("#flint-full .fl-msg.fl").count()
    page.fill(inp, text); page.press(inp, "Enter")
    scope = "#flint" if inp == "#fl-input" else "#flint-full"
    page.wait_for_function("([s, n]) => document.querySelectorAll(s + ' .fl-msg.fl').length > n", arg=[scope, n], timeout=10000)
    last = page.locator(f"{scope} .fl-msg.fl").last.text_content()
    assert expect.lower() in last.lower(), f"{text!r} -> {last!r}"
    return last

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-flint-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    mock = srv2 = None
    try:
        wait_up(BASE)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            host.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("TribeClient.connected()", timeout=15000)
            htok = host.evaluate("TribeStore.get().server.token")

            # ---- the bar: pinned at the bottom of the right panel, visible, below the people list
            host.wait_for_selector("#flint #fl-input", state="visible", timeout=10000)
            panel, bar = host.locator("#tour-room").bounding_box(), host.locator("#flint .fl-bar").bounding_box()
            assert abs((panel["y"] + panel["height"]) - (bar["y"] + bar["height"])) < 20, (panel, bar)
            assert host.locator("#flint .fl-eyebrow").first.text_content().strip().lower() == "flint"
            assert "basic mode" in host.text_content("#flint [data-flst]")
            assert not host.locator("#room-list").is_visible(), "the right panel has no people list on desktop"
            # ---- a new project: big Next steps cards at the top of the panel, Flint just says hi, Helpers wait
            host.evaluate("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint: true, brain: true, ai: true})); window.TribeHelpers && TribeHelpers.render() } catch (e) {}")
            host.evaluate("TribeApp.show('chat')")   # qa-qol-2: on the Dashboard the Camp setup card lists the steps instead
            host.evaluate("TribeStage.set(TribeProjects.current(), {vision:false, task:false, agent:false, repo:false})")
            host.wait_for_selector("#room-next .rn-card", timeout=5000)
            assert host.locator("#room-next .rn-card").count() == 4 and host.locator("#flint .fl-chip").count() == 0
            assert host.evaluate("document.querySelector('#room-next').getBoundingClientRect().top - document.querySelector('#room-pane').getBoundingClientRect().top < 80"), "next steps sit at the top"
            assert host.locator("#room-helpers").is_hidden()
            # ---- once the tribe is going: the full chips and the privacy line on an empty thread
            host.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:false, repo:true}, {pin:true})")
            host.wait_for_selector("#room-next", state="detached", timeout=5000)
            chips = host.locator("#flint .fl-chip").all_text_contents()
            assert chips == ["Connect my AI", "What's happening?"], chips   # simple right panel: two chips
            assert "leaves it" in host.text_content("#flint .fl-priv")
            # ---- the Helpers row is Flint now
            host.wait_for_selector("#room-helpers [data-helper='flint']", state="attached", timeout=40000)
            assert "basic mode" in host.text_content("#room-helpers [data-helper='flint']")
            assert "Local model" not in host.text_content("#room-helpers")

            # ---- note
            ask(host, "capture a note: buy lanterns", "Saved to your notes")
            notes = api("/scratch", token=htok)[1]["notes"]
            assert any("buy lanterns" in n["text"].lower() for n in notes), notes
            assert host.locator("#flint .fl-act", has_text="Open note").count() == 1
            # ---- task
            ask(host, "task fix the bridge", "Added to Tasks")
            assert any(t["title"] == "Fix the bridge" for t in api("/tasks", token=htok)[1]["tasks"])
            # ---- the thread opens upward and stays within ~45% of the panel
            th = host.locator("#flint").bounding_box(); assert th["height"] <= panel["height"] * 0.47, (th, panel)
            # ---- a Guide answer with Open in Guide
            ask(host, "how do invites work", "invite")
            host.locator("#flint .fl-act", has_text="Open in Guide").last.click()
            host.wait_for_function("TribeGuide.isOpen()", timeout=10000)
            host.evaluate("TribeGuide.close()")
            # ---- status
            ask(host, "what's new", "open task")
            # ---- connect Claude opens the connect flow
            ask(host, "connect claude", "Claude Code")
            host.wait_for_selector("#invite-modal:not(.hidden)", timeout=5000)
            host.wait_for_function("document.querySelector('#invite-body').textContent.includes('Claude')", timeout=10000)
            host.evaluate("document.querySelector('#invite-modal').classList.add('hidden')")
            # ---- no model: a helpful fallback
            last = ask(host, "tell me a joke about dragons", "basic mode")
            assert host.locator("#flint .fl-msg.fl").last.locator(".fl-act", has_text="Give Flint a brain").count() == 1
            # ---- the ? menu has Ask Flint, which focuses the bar
            host.evaluate("document.querySelector('#fl-fold').click()")   # fold
            assert host.evaluate("document.querySelector('#flint').classList.contains('folded')")
            host.click("#tb-help"); host.click("[data-help='flint']")
            host.wait_for_function("document.activeElement && document.activeElement.id === 'fl-input' && !document.querySelector('#flint').classList.contains('folded')")
            if take: host.wait_for_timeout(300); host.screenshot(path=str(SHOTS / "flint-desktop.png"))
            # ---- the thread persists across a reload
            n = host.locator("#flint .fl-msg").count(); assert n >= 12, n
            host.reload(); host.wait_for_function("TribeClient.connected()", timeout=15000)
            host.wait_for_selector("#flint .fl-msg", timeout=10000)
            assert host.locator("#flint .fl-msg").count() == n
            assert "buy lanterns" in host.text_content("#flint .fl-thread")

            # ---- phone at 390px: Talk to… › Flint opens the full-screen thread
            st, inv = api("/invites", "POST", {"maxUses": 3}, htok); assert st == 200, inv
            ctx = b.new_context(**PHONE); ph = ctx.new_page(); watch(ph, "phone")
            ph.goto(f"{BASE}/join/{inv['invite']['code']}")
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Maya"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet"); ph.click("#ins-later")
            ph.wait_for_function("TribeClient.connected()", timeout=15000)
            ph.evaluate("document.querySelector('#hi-banner') && document.querySelector('#hi-banner').remove()")
            assert ph.locator("#flint").is_hidden(), "no dock on phones"
            ph.evaluate("TribeApp.show('chat')")
            ph.evaluate("TribeMobile.talkTo()")   # Talk to… (opened from the side panel, Agents, or here)
            ph.wait_for_selector("#m2-talk-sheet [data-talk='flint']", state="visible")
            assert "Qwen" not in ph.text_content("#m2-talk-sheet")
            ph.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:false, repo:true}, {pin:true})")
            ph.click("#m2-talk-sheet [data-talk='flint']")
            ph.wait_for_selector("#flint-full:not(.hidden) #ff-input", state="visible")
            assert ph.locator("#flint-full .fl-chip").count() == 2
            ask(ph, "what's happening?", "here with you", inp="#ff-input")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "sideways scroll"
            assert ph.evaluate("document.querySelector('#flint-full').scrollWidth <= innerWidth + 1")
            if take: ph.wait_for_timeout(300); ph.screenshot(path=str(SHOTS / "phone-flint.png"))
            ph.click("#ff-back"); ph.wait_for_selector("#flint-full", state="hidden")
            b.close()

        # ---- with a local model: the reply streams from the (fake) Ollama, <think> stripped
        mport, p2 = PORT + 900, PORT + 901
        mock = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(mport)], stdout=subprocess.DEVNULL)
        srv2 = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(p2), "--dir", os.path.join(tmp, "tribe2"), "--ollama", f"http://localhost:{mport}"], stdout=subprocess.DEVNULL, env=env)
        b2 = f"http://localhost:{p2}"; wait_up(b2)
        st, boot = api("/bootstrap", "POST", {"name": "Orion"}, base=b2); assert st == 200, boot
        tok = boot["token"]
        for _ in range(40):
            if api("/flint", token=tok, base=b2)[1]["model"]["online"]: break
            time.sleep(0.25)
        assert api("/flint", token=tok, base=b2)[1]["model"]["online"]
        st, text = api("/flint/ask", "POST", {"text": "what should I build?", "room": "Online: Orion"}, token=tok, base=b2, raw=True)
        assert st == 200 and text.strip() == "Hi, Flint here. The room looks calm.", (st, text)
        assert api("/flint/ask", "POST", {"text": "hi"}, base=b2)[0] == 401
        assert api("/flint/ask", "POST", {"text": "hi"}, token=htok)[0] == 503, "no model: basic mode"
    finally:
        for x in (srv, srv2, mock):
            if x: x.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("e2e_flint: OK")

if __name__ == "__main__":
    main()
