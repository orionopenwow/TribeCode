"""Phone test: host shows the invite QR, an iPhone-sized browser scans it (decoded from a screenshot),
joins, uses the bottom tab bar, chats and moves a task by tap. Usage: python app/test/e2e_mobile.py [--shots]"""
import json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
import cv2
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4794 + int(__import__('os').environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    page.on("console", lambda m: m.type == "error" and print(who, "console:", m.text[:160]))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-m-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = b.new_context(viewport={"width": 1440, "height": 900}).new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1"); host.wait_for_selector("#onboard:not(.hidden)")
            host.click("#ob-next"); host.fill("#ob-name", "Orion"); host.click("#ob-skip")
            wait_text(host, "#sync-status", "connected")
            host.click("#tour-invite")
            host.wait_for_selector("#inv-qr svg")
            link = host.inner_text("#inv-link")
            assert "localhost" not in link, f"phone link must use a network address, got {link}"
            png = SHOTS / "invite-qr.png" if take else Path(tmp) / "qr.png"
            host.wait_for_timeout(300)
            host.locator(".modal-card").screenshot(path=str(png))
            decoded, _ = cv2.wechat_qrcode_WeChatQRCode().detectAndDecode(cv2.imread(str(png)))
            assert decoded and decoded[0] == link, f"QR decoded {decoded} != {link}"
            host.click("[data-close]")

            phone_ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            phone = phone_ctx.new_page(); watch(phone, "phone")
            phone.goto(decoded[0])
            phone.wait_for_selector("#form:not(.hidden)")
            phone.fill("#name", "Maya")
            if take: phone.wait_for_timeout(300); phone.screenshot(path=str(SHOTS / "phone-join.png"))
            phone.click("#go")
            # phones land on their private device link (/m/<key>/) with the Add to Home Screen sheet
            phone.wait_for_url("**/m/*/")
            phone.wait_for_selector("#install-sheet")
            phone.click("#ins-later")
            if take: phone.wait_for_timeout(400); phone.screenshot(path=str(SHOTS / "phone-home.png"))
            try:
                wait_text(phone, "#sync-status", "connected")
            except Exception:
                print("PHONE", phone.url, phone.inner_text("#sync-status"), phone.evaluate("JSON.stringify(TribeStore.get().server)")); raise
            # bottom tab bar, drawer, no horizontal overflow
            box = phone.locator(".rail").bounding_box()
            assert box["y"] > 700 and box["width"] >= 380, box
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            phone.click("#menu-btn")
            phone.wait_for_function("getComputedStyle(document.querySelector('.side')).transform === 'none'")
            phone.mouse.click(370, 400)
            phone.wait_for_function("!document.body.classList.contains('drawer-open')")
            # chat tab
            phone.click('.rail [data-nav="chat"]')
            phone.wait_for_selector(".panel", state="visible")
            wait_text(phone, "#chat-list", "Maya joined the tribe")
            phone.fill("#chat-input", "on my phone 📱 /task Campfire save points")
            phone.fill("#chat-input", "/task Campfire save points")
            phone.press("#chat-input", "Enter")
            wait_text(host, "#chat-list", "Made that a task")
            if take: phone.wait_for_timeout(400); phone.screenshot(path=str(SHOTS / "phone-chat.png"))
            # tasks: move by tap (no drag on touch)
            phone.click('.rail [data-nav="tasks"]')
            phone.wait_for_selector('[data-col="backlog"] .task')
            assert phone.locator(".panel").is_hidden()
            phone.select_option('[data-col="backlog"] .task select.mv', "doing")
            host.click('[data-nav="tasks"]')
            host.wait_for_selector('[data-col="doing"] .task', timeout=8000)
            assert host.locator(".task select.mv").first.is_hidden(), "move menu is phone-only"
            phone.wait_for_selector('[data-col="doing"] .task')
            if take: phone.wait_for_timeout(400); phone.screenshot(path=str(SHOTS / "phone-tasks.png"))
            # PWA bits are served
            m = json.loads(urllib.request.urlopen(BASE + "/manifest.webmanifest").read())
            assert m["display"] == "standalone" and any(i.get("purpose") == "maskable" for i in m["icons"])
            assert urllib.request.urlopen(BASE + "/assets/apple-touch-icon.png").status == 200
            b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Mobile test passed")


if __name__ == "__main__":
    main()
