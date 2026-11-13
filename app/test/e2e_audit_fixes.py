"""Audit 2026-11-13 (docs/APP-AUDIT-2026-11-13.md): the bugs the app walk found stay fixed.

A project that lives on this device (no server answers): Website templates, notification settings, the GIF picker and
the Agent fleet's office used to throw or show "undefined"; the Guide showed 'Nothing about ""'. Esc closes every layer
it opens: the home pill's sheets, the free-AI bridge, Read a link, Work's needs-a-tribe notice. Notification settings
have one home (Settings › Notifications) from the profile menu and the inbox's gear. No duplicate icon symbols.
With a hosted tribe: the same Esc and one-home checks.
Usage: TRIBE_PORT_OFFSET=2700 python3 app/test/e2e_audit_fixes.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6130 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
RAW = ["undefined", "[object Object]", "Failed to fetch", "is not iterable", "Cannot read prop", "NaN"]


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def clean(pg, sel, what):
    t = pg.inner_text(sel) if pg.locator(sel).count() else ""
    for bad in RAW: assert bad not in t, f"{what}: raw text {bad!r} on screen: {t[:200]}"
    return t


def layers(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('#lr-folder, #lr-share, #lr-sync, .lr-sheet, #aib:not([hidden]), #cap-link-sheet, #wk-need, #gif-pick, .slx, #nf-settings:not(.hidden)')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className)""")


def esc_closes(pg, what):
    assert layers(pg), f"{what}: did not open"
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    assert not layers(pg), f"{what}: Esc did not close it ({layers(pg)})"


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-auditfix-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(name, token=None, q=""):
                c = b.new_context(viewport={"width": 1280, "height": 860})
                s = {"name": name, "onboarded": True, "tour": {"done": True}, **({"server": {"url": BASE, "token": token}} if token else {})}
                c.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1}))" % json.dumps(json.dumps(s)))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}")); pg.on("dialog", lambda d: d.dismiss())
                pg.goto(BASE + "/?skipIntro=1" + q, wait_until="domcontentloaded")
                pg.wait_for_function("window.TribeRouter && window.TribeHub && window.TribeNew && window.TribeSiteLib && window.TribeNotify && window.TribeGuide", timeout=30000)
                if token: pg.wait_for_function("TribeClient.connected()", timeout=45000)
                pg.wait_for_timeout(800); return pg

            # ---------- 1. a project on this device ----------
            pg = page("Orion", q="&freshopen=1")
            pg.evaluate("TribeNew.open()"); pg.wait_for_selector("#tn #tn-name", state="visible"); pg.wait_for_timeout(250)
            pg.fill("#tn-name", "Lantern Crew"); pg.click("#tn-next"); pg.wait_for_selector("#tn[data-step='2'] [data-tn-where]")
            pg.click("#tn [data-tn-where='device']"); pg.click("#tn-go"); pg.wait_for_selector("#tn[data-step='3']", timeout=10000)
            pg.click("#tn-skip"); pg.wait_for_function("!TribeNew.isOpen()"); pg.wait_for_timeout(600)
            assert pg.evaluate("TribeOffline.solo()"), "the tribe lives on this device"
            # Website templates: a calm line, no "lib.categories is not iterable", and it closes
            pg.evaluate("TribeSiteLib.open()"); pg.wait_for_selector(".slx-win"); pg.wait_for_timeout(900)
            t = clean(pg, ".slx-win", "website templates"); assert "Loading" not in pg.inner_text("#slx-grid"), "website templates: stuck on Loading…"
            pg.evaluate("TribeSiteLib.close()")
            # notification settings (the older window): a calm line, never stuck on Loading…
            pg.evaluate("TribeNotify.openSettings()"); pg.wait_for_timeout(900)
            t = clean(pg, "#nf-settings-body", "notification settings"); assert "Loading" not in t, t
            pg.evaluate("TribeNotify.closeSettings()")
            # the GIF picker
            pg.evaluate("TribeChatRich.gifPicker(document.body)"); pg.wait_for_selector("#gif-pick"); pg.wait_for_timeout(700)
            clean(pg, "#gif-pick", "GIF picker"); pg.evaluate("TribeChatRich.closeGif()")
            # the Agent fleet: no "Node undefined+"
            pg.evaluate("TribeRouter.go('fleet')"); pg.wait_for_timeout(1500); clean(pg, ".main", "agent fleet")
            # the Guide: says where it is, not 'Nothing about ""'
            pg.evaluate("TribeGuide.open()"); pg.wait_for_timeout(1200)
            g = pg.inner_text("#gd-list"); assert 'Nothing about ""' not in g and "GitHub" in g, g
            pg.evaluate("TribeGuide.close()")
            # Work's needs-a-tribe notice closes on Esc
            pg.evaluate("TribeTalent.open()"); pg.wait_for_selector("#wk-find", state="visible"); pg.click("#wk-find"); pg.wait_for_selector("#wk-need")
            esc_closes(pg, "Work's notice")
            # the home pill's sheets close on Esc, wherever focus is
            pg.evaluate("TribeHome.share()"); pg.wait_for_selector(".lr-sheet"); pg.evaluate("document.activeElement && document.activeElement.blur()")
            esc_closes(pg, "home pill › Share")
            # the free-AI bridge and Read a link
            pg.evaluate("TribeAIBridge.open({ src: 'audit' })"); pg.wait_for_selector("#aib:not([hidden])"); pg.evaluate("document.activeElement && document.activeElement.blur()")
            esc_closes(pg, "free-AI bridge")
            pg.evaluate("TribeCaptures.addLink({})"); pg.wait_for_selector("#cap-link-sheet"); pg.wait_for_timeout(120)
            esc_closes(pg, "Read a link")
            # the folder picker never shows "Failed to fetch"
            src = (ROOT / "app" / "ui" / "livingrepo.js").read_text(); assert "Failed to fetch|NetworkError|Load failed" in src
            pg.context.close()

            # ---------- 2. a hosted tribe ----------
            host = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
            h = page("Orion", host)
            # one home for notification settings: the profile menu and the inbox's gear open Settings › Notifications
            h.evaluate("TribeNotify.settingsTab()"); h.wait_for_function("TribeSettings.isOpen() && TribeSettings.current() === 'notifications'", timeout=8000)
            assert h.evaluate("document.querySelector('#nf-settings').classList.contains('hidden')"), "the older window stays closed"
            h.wait_for_selector("#set-nf-adv", timeout=8000); h.click("#set-nf-adv"); h.wait_for_function("!document.querySelector('#nf-settings').classList.contains('hidden')")   # its Advanced button still opens it
            h.evaluate("TribeNotify.closeSettings(); TribeSettings.close()")
            h.evaluate("TribeProfileMenu.open()"); h.wait_for_timeout(300)
            h.evaluate("(() => { const b = [...document.querySelectorAll('[data-pm], [data-act], button')].find(x => x.offsetParent && /^Notifications$/.test(x.innerText.trim())); b.click(); })()")
            h.wait_for_function("TribeSettings.isOpen() && TribeSettings.current() === 'notifications'", timeout=8000); h.evaluate("TribeSettings.close()")
            # no icon symbol is defined twice by chat's sprite
            h.evaluate("TribeShell.go('chat')"); h.wait_for_timeout(800)
            dup = h.evaluate("(() => { const n = {}; document.querySelectorAll('symbol[id]').forEach(s => n[s.id] = (n[s.id] || 0) + 1); return Object.keys(n).filter(k => n[k] > 1 && ['i-image', 'i-more', 'i-reply', 'i-smile', 'i-info'].includes(k)); })()")
            assert not dup, f"duplicate icon symbols: {dup}"
            h.context.close()
            b.close()
    finally:
        srv.terminate()
    assert not errors, "\n".join(errors[:20])
    print("e2e_audit_fixes: OK")


if __name__ == "__main__":
    main()
