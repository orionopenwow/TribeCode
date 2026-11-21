"""Bug report capture (app/ui/bugs.js): Take a screenshot grabs one frame of the app (the box hides while it does),
a log snapshot is attached as a .txt with tokens and keys blanked, "See what's in it" shows it first, a picture can be
removed before sending, the report arrives with both files, and Save to a file works with no tribe at all.
getDisplayMedia is faked with a canvas stream so the test needs no screen-share prompt. 1440 and 390.
Usage: python app/test/e2e_bug_capture.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5480 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
FAKE = """navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 200;
  const g = c.getContext('2d'); g.fillStyle = '#F26B1D'; g.fillRect(0, 0, 320, 200); const s = c.captureStream(5);
  setInterval(() => { g.fillRect(0, 0, 1, 1); }, 100); window.__shots = (window.__shots || 0) + 1; return s; };"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-bugcap-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(60):
            try: urllib.request.urlopen(BASE + "/api/health", timeout=2); break
            except Exception: time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True); ctx.add_init_script(FAKE)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            for w, h in ((1440, 900), (390, 844)):   # the same person (the host), at two sizes
                pg.set_viewport_size({"width": w, "height": h}); pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeBugs && window.TribeClient && TribeClient.connected() && TribeClient.project && TribeClient.project()", timeout=30000)
                pg.evaluate("console.error('boom with token=abcdef1234567890 and sk-ant-api03-SECRETSECRET and ghp_SECRET123456')")
                if w >= 1000:   # the bug button in the top bar, beside People
                    pg.wait_for_selector("#bug-top", timeout=8000); pg.click("#bug-top")
                else: pg.evaluate("TribeBugs.capture()")
                pg.wait_for_selector("#bug-what")
                pg.fill("#bug-what", f"Test bug {w}\nIt broke when I clicked Save.")
                # Send to the TribeCode team: a filled-in public form opens; nothing secret is in the address
                pg.evaluate("() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; }; }")
                pg.click("#bug-team"); pg.wait_for_function("window.__opened.length > 0", timeout=5000); url = pg.evaluate("window.__opened[0]")
                assert url.startswith("https://github.com/orionopenwow/TribeCode/issues/new?") and "template=feedback.yml" in url and "facet=Bug" in url and len(url) < 7000, url[:200]
                assert "SECRETSECRET" not in url and "abcdef1234567890" not in url and "SECRET123456" not in url, "secrets blanked in the link"
                foot = pg.evaluate("(() => { const f = document.querySelector('#invite-modal .modal-foot').getBoundingClientRect(); return f.right <= innerWidth + 1 && [...document.querySelectorAll('#invite-modal .modal-foot .btn')].every(b => b.getBoundingClientRect().right <= innerWidth + 1); })()")
                assert foot, "the report box's buttons fit"
                pg.click("#bug-shot"); pg.wait_for_selector("#bug-files .bug-cap-item img", timeout=8000)
                assert pg.evaluate("window.__shots") == 1 and not pg.locator("#invite-modal.hidden").count(), "one frame taken and the box is back"
                pg.click("#bug-shot"); pg.wait_for_function("document.querySelectorAll('#bug-files .bug-cap-item').length === 2")
                pg.click("#bug-files [data-bx='1']"); assert pg.locator("#bug-files .bug-cap-item").count() == 1, "a picture can be removed"
                pg.click("#bug-log-see"); pre = pg.inner_text("#bug-log-pre")
                assert "TribeCode log snapshot" in pre and "boom" in pre, pre[:300]
                assert "abcdef1234567890" not in pre and "SECRETSECRET" not in pre and "SECRET123456" not in pre, "secrets are blanked"
                sw = pg.evaluate("document.documentElement.scrollWidth"); assert sw <= w, f"no sideways scroll at {w}: {sw}"
                pg.click("#bug-go"); pg.wait_for_selector("#invite-modal.hidden", state="attached", timeout=10000)
                pg.wait_for_timeout(800); bugs = pg.evaluate("TribeClient.api('/bugs').then(r => r.bugs)")
                bug = next(x for x in bugs if x["title"] == f"Test bug {w}")
                names = [a["name"] for a in bug.get("attachments", [])]
                assert any(n.endswith(".png") for n in names) and any(n.startswith("log-") and n.endswith(".txt") for n in names), names
                logf = next(tmp.rglob(next(n for n in names if n.endswith(".txt"))))
                assert "SECRETSECRET" not in logf.read_text() and "boom" in logf.read_text(), "the sent log is blanked too"
                # Save to a file
                pg.evaluate("TribeBugs.capture()"); pg.wait_for_selector("#bug-what"); pg.fill("#bug-what", "Saved bug\nMore words.")
                with pg.expect_download() as d: pg.click("#bug-save")
                txt = Path(d.value.path()).read_text(); assert "# Saved bug" in txt and "TribeCode log snapshot" in txt and "SECRETSECRET" not in txt, txt[:200]
                pg.click("#invite-modal [data-close]")
                print(f"ok  {w}: screenshot, remove, log snapshot blanked, sent with both files, saved to a file")
            b.close()
        assert not errors, errors
        print("e2e_bug_capture: all ok")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
