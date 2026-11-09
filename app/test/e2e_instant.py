"""Instant invite: the fewest steps from "I want to build with a friend" to the friend's Claude Code connected.

  Host: Home -> "Invite a friend" (one tap). A fresh project is made, the host lands in its chat, and the sheet
        shows the link, already copied to the clipboard, with Share / QR / Connect my Claude Code.
  Friend (a computer): opens the link -> types a name -> Join -> lands in that project, and the same visit
        opens "One line connects your Claude Code" with the command ready to copy (the agent joins over MCP).
  Friend (a phone): the same link -> name -> Join -> the phone app (device link), no Claude Code sheet.
  Also: the + window's "Invite a friend now", and ?invite=1 (what tribecode://invite / Invite-A-Friend.bat runs).
Usage: python app/test/e2e_instant.py
"""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4877 + int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
SHOTS = "--shots" in sys.argv
errors = []


def named(page, name):
    page.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: %r}))" % name)

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def wait_text(page, sel, text, timeout=15000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))

def shot(page, name):
    if SHOTS: page.screenshot(path=str(ROOT / "docs" / "screenshots" / f"instant-{name}.png"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-ii-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "..", f"ii-server-{PORT}.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
            host = hctx.new_page(); named(host, "Orion"); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1&home=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            host.evaluate("TribeHub.open('home')")
            host.wait_for_selector("#hub-instant", state="visible", timeout=15000)
            shot(host, "home")
            before = len(api("/projects", token=host.evaluate("TribeStore.get().server.token"))[1].get("projects", []))

            # ---- one tap ----
            host.click("#hub-instant")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000)
            link = host.inner_text("#ii-link").strip()
            assert re.search(r"/join/[A-Za-z0-9]+", link), f"instant invite link: {link!r}"
            wait_text(host, ".modal-card.ii h2", "Link copied")
            clip = host.evaluate("navigator.clipboard.readText()")
            assert clip == link, f"the link is on the clipboard ({clip!r})"
            for sel in ["#ii-copy", "#ii-qrbtn", "#ii-claude"]: host.wait_for_selector(sel, state="visible")
            host.click("#ii-qrbtn"); host.wait_for_selector("#ii-qr .qr svg")
            shot(host, "sheet")
            tok = host.evaluate("TribeStore.get().server.token")
            projects = api("/projects", token=tok)[1]["projects"]
            assert len(projects) == before + 1, "a fresh project was made"
            fresh = host.evaluate("TribeProjects.current()")
            assert any(x["id"] == fresh for x in projects), "the host is in the fresh project"
            assert host.evaluate("TribeApp.view()") == "chat", "the host lands in the project's chat"
            host.click(".modal-card.ii [data-close]")
            assert host.is_hidden("#invite-modal")

            # ---- friend on a computer: link -> name -> Join -> Claude Code command ----
            fctx = b.new_context(viewport={"width": 1280, "height": 820})
            fr = fctx.new_page(); watch(fr, "friend")
            fr.goto(link.replace(re.match(r"https?://[^/]+", link).group(0), BASE))
            fr.wait_for_selector("#name", timeout=15000); fr.fill("#name", "Maya"); fr.click("#go")
            fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            fr.wait_for_function("window.TribeProjects && TribeProjects.current() === %r" % fresh, timeout=15000)
            fr.wait_for_selector("#jw-card #jw-hi", timeout=15000)   # just joined: the dashboard, Say hi, Connect my AI
            assert fr.evaluate("document.body.dataset.view") in ("home", None) or fr.evaluate("TribeApp.view()") == "home", fr.evaluate("TribeApp.view()")
            fr.click("#jw-ai")
            wait_text(fr, "#invite-body", "One line connects your Claude Code", 15000)
            fr.wait_for_selector("#cc-cmd", timeout=10000)
            cmd = fr.inner_text("#cc-cmd")
            assert "claude mcp add" in cmd, f"Claude Code command: {cmd!r}"
            shot(fr, "friend-claude")
            # the command's key works: the friend's agent joins over MCP and sees the fresh project
            key = re.search(r"Bearer\s+([A-Za-z0-9_\-\.]+)", cmd) or re.search(r"(?:token|key)=([A-Za-z0-9_\-\.]+)", cmd)
            if key:
                req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode(),
                                             headers={"Content-Type": "application/json", "Authorization": "Bearer " + key.group(1)})
                with urllib.request.urlopen(req, timeout=20) as r: assert json.loads(r.read())["result"]["tools"], "the friend's Claude Code sees TribeCode's tools"
            fr.click("#invite-body [data-close]")
            # once only: a reload doesn't open it again
            fr.reload(); fr.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000); fr.wait_for_timeout(1500)
            assert fr.is_hidden("#invite-modal"), "the Claude Code sheet opens once, right after joining"
            wait_text(host, "#room-members, .shell", "Maya", 15000)

            # ---- friend on a phone: same link, phone app, no Claude Code sheet ----
            pctx = b.new_context(**PHONE); ph = pctx.new_page(); watch(ph, "phone")
            ph.goto(link.replace(re.match(r"https?://[^/]+", link).group(0), BASE))
            ph.wait_for_selector("#name", timeout=15000); ph.fill("#name", "Jun"); ph.click("#go")
            ph.wait_for_url(re.compile(r"/m/"), timeout=20000)
            if ph.is_visible("#ins-later"): ph.click("#ins-later")
            ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000); ph.wait_for_timeout(1500)
            assert ph.is_hidden("#invite-modal") or "Claude Code" not in ph.inner_text("#invite-body"), "phones skip the Claude Code sheet"

            # ---- the + window, like Discord: Create my own -> name -> Create -> Invite friends (link copied) ----
            host.evaluate("TribeProjects.openNew()")
            host.click(".np-setup [data-ns='own']"); host.wait_for_selector("#np-input"); host.click("#np-create")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=20000)
            assert host.evaluate("TribeProjects.current()") != fresh, "another fresh project"
            host.click(".modal-card.ii [data-close]")

            # ---- the fresh project's overview: bio, living update, onboarding checklist ----
            host.evaluate("TribeApp.show('home')"); host.wait_for_selector("#pj-check.hero .ock-card", timeout=15000)
            assert host.locator("#pj-living").count() == 0, "a fresh project leads with the checklist, no Living update yet"
            host.wait_for_selector("#pj-check [data-step=vision]:not(.on) [data-ck=vision]")
            host.click("#pj-bio"); host.fill(".pj-bio-in", "A tiny game for friends"); host.keyboard.press("Enter")
            wait_text(host, "#pj-bio", "A tiny game for friends")
            cur = host.evaluate("TribeProjects.current()")
            assert any(x["id"] == cur and x.get("bio") == "A tiny game for friends" for x in api("/projects", token=tok)[1]["projects"]), "bio saved"
            host.click("#pj-check [data-ck=vision]"); host.fill("#pj-vtext", "A cozy platformer.\nFor friends.\nDone: 3 levels."); host.click("#pj-vsave")
            host.wait_for_selector("#pj-check [data-step=vision].on", timeout=10000)

            # ---- ?invite=1 (tribecode://invite, Invite-A-Friend.bat) ----
            n = len(api("/projects", token=tok)[1]["projects"])
            host.goto(BASE + "/?skipIntro=1&invite=1")
            host.wait_for_selector(".modal-card.ii #ii-link", timeout=25000)
            assert len(api("/projects", token=tok)[1]["projects"]) == n + 1, "?invite=1 makes a fresh project"
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, "page errors:\n" + "\n".join(bad)
        print("e2e_instant: OK (one tap -> fresh project + copied link -> friend joins -> Claude Code command; phone; + window; ?invite=1)")
    except Exception:
        log.flush(); log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.send_signal(signal.SIGTERM)
        try: srv.wait(10)
        except subprocess.TimeoutExpired: srv.kill()


if __name__ == "__main__":
    main()
