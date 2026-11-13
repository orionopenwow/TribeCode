"""TribeCode MCP directory (feat/mcp-directory): a calm page of clients that can use the project through /mcp.
  1. The page opens from every entry point: the palette, Agents Hub, Settings, the Connect your AI sheet ("See all") and #/mcp.
  2. One hero card, one .btn.primary; the search icon filters the client grid.
  3. Every client's Connect opens the one-tap sheet and mints a key that works on /mcp (Bearer, or TRIBE_TOKEN for the
     Claude Desktop bridge). Claude.ai and ChatGPT show the public-link note while the host isn't sharing, and don't mint.
     Their setup (checked server side) is the https URL with ?token=, which /mcp accepts.
  4. Connected lists the keys; Remove revokes one (its key gets 401 on /mcp).
  5. Apps on this computer: the host adds a special connection with a dummy app and a temp watch folder; Open launches the
     app; a PNG dropped in the folder lands in Files and Visuals with a chat line. ArtCraft takes a path. Friends get 403 on
     add/launch and never see local paths.
  6. Phone 390px: no sideways scroll, apps read-only. No console errors anywhere.
Usage: python app/test/e2e_mcp_directory.py [--shots]   (--shots writes docs/screenshots/mcp-directory-*.png)
"""
import json, os, re, stat, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 5030 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
LOCAL_KINDS = ["claude-code", "codex", "cursor", "vscode", "gemini", "claude-desktop", "windsurf", "zed", "cline", "goose", "continue", "qwen", "mcp"]
KEEP = {"codex", "vscode", "zed", "goose"}


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    req = urllib.request.Request(BASE + (path if path.startswith("/mcp") else "/api" + path), method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        d = e.read().decode()
        try: return e.code, json.loads(d or "{}")
        except Exception: return e.code, d

def mcp_init(token=None, path="/mcp"):
    return api(path, "POST", {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}}, token=token)

def png_bytes(w=4, h=4, rgb=(242, 107, 29)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who}: {e}"))
    # Settings probes Ollama on this computer (localhost:11434): refused there is expected in CI. Any other failed request counts.
    page.on("requestfailed", lambda r: ":11434/" not in r.url and r.failure != "net::ERR_ABORTED" and errors.append(f"{who} request failed: {r.url} {r.failure}"))
    page.on("console", lambda m: m.type == "error" and "ERR_CONNECTION_REFUSED" not in m.text and errors.append(f"{who} console: {m.text[:200]}"))

def page_for(b, name, token, **ctx):
    c = b.new_context(**(ctx or {"viewport": {"width": 1440, "height": 900}}))
    c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', server: {{url: '{BASE}', token: '{token}'}}}}))")
    pg = c.new_page(); watch(pg, name)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected()", timeout=15000)
    return pg

def on_page(pg):
    pg.wait_for_selector("#view-mcp-directory:not(.hidden) .mcd-head h1", timeout=10000)
    assert pg.text_content("#view-mcp-directory .mcd-head h1").strip() == "Use TribeCode inside your tools"

def leave(pg):
    pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#view-mcp-directory.hidden", state="attached", timeout=5000)

def close_sheet(pg):
    pg.evaluate("document.querySelector('#invite-body [data-close]') ? document.querySelector('#invite-body [data-close]').click() : document.querySelector('#invite-modal').classList.add('hidden')")
    pg.wait_for_selector("#invite-modal.hidden", state="attached", timeout=5000)

def main():
    tmp = tempfile.mkdtemp(prefix="tribe-mcpdir-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_CONNECTIONS_POLL_MS": "300"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Campfire Crew", "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.15)
        st, boot = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, boot
        htok = boot["token"]
        st, inv = api("/invites", "POST", {"maxUses": 5}, token=htok)
        st, maya = api("/join", "POST", {"code": inv["invite"]["code"], "name": "Maya"}); assert st == 200, maya
        mtok = maya["token"]

        # the remote chat clients' setup: the public https URL with the key in it, and /mcp accepts ?token=
        out = subprocess.run(["node", "-e", "const h=require('./server/agentshub.js');console.log(JSON.stringify(['claude-ai','chatgpt'].map(k=>h.setupFor(k,'https://crew.example.ts.net/mcp','KEY123'))))"], cwd=ROOT, capture_output=True, text=True, check=True)
        for s in json.loads(out.stdout): assert s["blocks"][0]["text"] == "https://crew.example.ts.net/mcp?token=KEY123", s

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = page_for(b, "Orion", htok)

            # ---------- 1. every entry point ----------
            host.evaluate("TribePalette.open()"); host.fill("#pal-input", "TribeCode MCP"); host.wait_for_timeout(150); host.keyboard.press("Enter")
            on_page(host); leave(host)
            host.evaluate("TribeAgentsHub.open()"); host.wait_for_selector("#view-agents-hub:not(.hidden) .ah-all", timeout=10000); host.click(".ah-all"); on_page(host); leave(host)
            host.evaluate("TribeSettings.open('ai')"); host.wait_for_selector("#set-mcp", timeout=10000); host.click("#set-mcp"); on_page(host)
            assert host.evaluate("document.querySelector('#settings-modal').classList.contains('hidden')"), "Settings stays open"
            leave(host)
            host.evaluate("TribeApp.connectClaude({ fresh: true, tool: 'codex' })"); host.wait_for_selector("#invite-body .cai-all", timeout=10000)
            host.click("#invite-body .cai-all"); on_page(host)
            assert host.evaluate("document.querySelector('#invite-modal').classList.contains('hidden')"), "sheet stays open"
            leave(host)
            host.evaluate("location.hash = '#/mcp'"); on_page(host)

            # ---------- 2. one hero, one primary; search filters ----------
            assert host.locator("#view-mcp-directory .hero-card").count() == 1
            assert host.locator("#view-mcp-directory .btn.primary").count() == 1, "only the hero is .btn.primary"
            kinds = host.eval_on_selector_all("#mcd-grid .mcd-row", "els => els.map(e => e.dataset.kind)")
            for k in LOCAL_KINDS + ["claude-ai", "chatgpt"]: assert k in kinds, (k, kinds)
            host.click("#mcd-search-btn"); host.fill("#mcd-search", "zed")
            host.wait_for_function("document.querySelectorAll('#mcd-grid .mcd-row').length === 1")
            assert host.eval_on_selector_all("#mcd-grid .mcd-row", "els => els.map(e => e.dataset.kind)") == ["zed"]
            host.fill("#mcd-search", "copilot"); host.wait_for_function("document.querySelectorAll('#mcd-grid .mcd-row').length === 1")
            assert host.get_attribute("#mcd-grid .mcd-row", "data-kind") == "vscode"
            host.fill("#mcd-search", "nothing-like-this"); host.wait_for_selector(".mcd-empty")
            host.click("#mcd-search-btn"); host.wait_for_function("document.querySelectorAll('#mcd-grid .mcd-row').length > 10")
            if take: host.screenshot(path=str(SHOTS / "mcp-directory.png"), full_page=True)

            # ---------- 3. remote clients: the public-link note, no key ----------
            assert host.locator("#mcd-public-note").count() == 1 and "public link" in host.text_content("#mcd-public-note")
            assert host.locator("#mcd-public").count() == 1, "the host gets the turn-on button"
            host.click(".mcd-row[data-kind='claude-ai'] [data-enable]"); host.wait_for_timeout(300)
            assert host.evaluate("document.querySelector('#invite-modal').classList.contains('hidden')"), "no sheet without a public link"
            assert "flash" in host.get_attribute("#mcd-public-note", "class")

            # ---------- 3. each client's Connect mints a working key ----------
            tokens = {}
            for k in LOCAL_KINDS:
                # one atomic click: revoking the previous key can redraw the grid between Playwright's locate and click
                host.wait_for_selector(f".mcd-row[data-kind='{k}'] [data-enable]")
                host.evaluate("k => document.querySelector(`.mcd-row[data-kind='${k}'] [data-enable]`).click()", k)
                if k == "claude-code":
                    host.wait_for_selector("#cc-cmd", timeout=10000); text = host.text_content("#cc-cmd")
                else:
                    try: host.wait_for_function("k => { const s = document.querySelector('#cc-setup'); return s && s.dataset.kind === k && s.querySelector('.cai-pre'); }", arg=k, timeout=10000)
                    except Exception: raise AssertionError((k, host.text_content("#invite-body")[:400]))
                    text = "\n".join(host.eval_on_selector_all("#cc-setup .cai-pre", "els => els.map(e => e.textContent)"))
                    sel = host.get_attribute("#invite-body .cai-chip.on", "data-cai-tool"); assert sel == k, (k, sel)
                m = re.search(r"Bearer ([A-Za-z0-9_-]{20,})", text) or re.search(r'"TRIBE_TOKEN": "([A-Za-z0-9_-]{20,})"', text)
                assert m, (k, text)
                st, init = mcp_init(m.group(1)); assert st == 200 and "result" in init, (k, st, init)
                tokens[k] = m.group(1)
                close_sheet(host)
                if k not in KEEP:   # up to 8 keys per person: revoke the ones the Connected checks don't need
                    ag = next(a for a in api("/agents/mine", token=htok)[1]["agents"] if a["kind"] == k)
                    assert api(f"/agents/mine?id={ag['id']}", "DELETE", token=htok)[0] == 200
            st, init = mcp_init(path="/mcp?token=" + tokens["codex"]); assert st == 200 and "result" in init, "token in the URL works too"
            assert host.evaluate("localStorage.getItem('tribecode.mcpdir.last')") == "mcp", "the hero remembers the last tool"

            # ---------- 4. Connected lists and removes ----------
            host.click(".mcd-tab[data-tab='connected']")
            host.wait_for_function("document.querySelectorAll('#mcd-panel .mcd-conn').length >= 4", timeout=10000)
            mine = api("/agents/mine", token=htok)[1]["agents"]
            vs = next(a for a in mine if a["kind"] == "vscode")
            assert host.locator(f".mcd-conn[data-agent='{vs['id']}']").count() == 1
            assert host.text_content("#mcd-count").strip() == str(len(mine))
            host.click(f".mcd-conn[data-agent='{vs['id']}'] [data-remove]")
            host.wait_for_function("id => !document.querySelector(`.mcd-conn[data-agent='${id}']`)", arg=vs["id"], timeout=10000)
            assert mcp_init(tokens["vscode"])[0] == 401, "removed key still works"
            assert mcp_init(tokens["zed"])[0] == 200
            if take: host.screenshot(path=str(SHOTS / "mcp-directory-connected.png"))
            host.click(".mcd-tab[data-tab='discover']")

            # ---------- 5. Apps on this computer ----------
            app = os.path.join(tmp, "dummy-app.sh"); marker = os.path.join(tmp, "launched.txt")
            Path(app).write_text(f"#!/bin/sh\necho launched > '{marker}'\n"); os.chmod(app, 0o755)
            drop = os.path.join(tmp, "renders"); os.makedirs(drop)
            Path(drop, "old.png").write_bytes(png_bytes())   # already there before it is picked: not imported
            host.wait_for_selector("#mcd-apps [data-offer='artcraft']", timeout=10000)
            assert "Not found" in host.text_content("#mcd-apps [data-offer='artcraft']")
            host.click("#mcd-add"); host.fill("#nx-name", "Dummy Studio"); host.fill("#nx-emoji", "🎨"); host.fill("#nx-app", app); host.fill("#nx-watch", drop)
            host.click("#mcd-form button[type=submit]")
            host.wait_for_selector("#mcd-apps [data-launch]", timeout=10000)
            cid = host.get_attribute("#mcd-apps [data-launch]", "data-launch")
            host.click(f"[data-launch='{cid}']")
            for _ in range(50):
                if os.path.exists(marker): break
                time.sleep(0.1)
            assert os.path.exists(marker), "Open did not launch the app"
            # ArtCraft with a path the host browsed to
            host.fill("#mcd-art-path", app); host.click("#mcd-art-add")
            host.wait_for_function("() => [...document.querySelectorAll('#mcd-apps [data-conn] b')].some(b => b.textContent === 'ArtCraft')", timeout=10000)
            Path(drop, "render-1.png").write_bytes(png_bytes(rgb=(56, 198, 177)))
            Path(drop, "notes.txt").write_text("not media")
            os.symlink(os.path.join(tmp, "dummy-app.sh"), os.path.join(drop, "sneaky.png"))
            got = None
            for _ in range(60):
                files = api("/uploads", token=htok)[1].get("project", [])
                names = [f["name"] for f in files]
                if "render-1.png" in names: got = names; break
                time.sleep(0.2)
            assert got and "old.png" not in got and "notes.txt" not in got and "sneaky.png" not in got, got
            msgs = api("/chat/general", token=htok)[1]
            msgs = msgs.get("messages", msgs) if isinstance(msgs, dict) else msgs
            assert any("1 new render from Dummy Studio" in (x.get("text") or "") for x in msgs), msgs[-3:]
            screens = api("/visuals", token=htok)[1]["screens"]; assert any(s["name"] == "Dummy Studio" for s in screens), screens
            if take: host.evaluate("document.querySelector('#mcd-apps').scrollIntoView()"); host.wait_for_timeout(200); host.screenshot(path=str(SHOTS / "mcp-directory-apps.png"))

            # friends: 403 on add and launch, no local paths
            assert api("/connections", "POST", {"kind": "custom", "name": "x", "app": app}, token=mtok)[0] == 403
            assert api(f"/connections/{cid}/launch", "POST", {}, token=mtok)[0] == 403
            assert api(f"/connections/{cid}", "PATCH", {"app": "/bin/sh"}, token=mtok)[0] == 403
            st, seen = api("/connections", token=mtok); assert st == 200 and seen["connections"], seen
            assert all("app" not in c and "watch" not in c for c in seen["connections"]), seen
            assert app not in json.dumps(seen) and drop not in json.dumps(seen)
            # the host can't point the watcher at a link, or launch a path that isn't saved
            link = os.path.join(tmp, "renders-link"); os.symlink(drop, link)
            assert api(f"/connections/{cid}", "PATCH", {"watch": link}, token=htok)[0] == 400

            # ---------- 6. phone 390 ----------
            ph = b.new_context(**PHONE).new_page(); watch(ph, "phone")
            ph.goto(f"{BASE}/join/{inv['invite']['code']}")
            ph.wait_for_selector("#form:not(.hidden)"); ph.fill("#name", "Jay"); ph.click("#go")
            ph.wait_for_url("**/m/*/"); ph.wait_for_selector("#install-sheet"); ph.click("#ins-later")
            ph.wait_for_function("TribeClient.connected()", timeout=15000)
            ph.evaluate("TribeMcpDir.open()"); on_page(ph)
            ph.wait_for_selector("#mcd-apps .mcd-ro", timeout=10000)
            assert "host" in ph.text_content("#mcd-apps .mcd-ro").lower()
            assert ph.locator("#mcd-apps [data-launch], #mcd-apps input").count() == 0, "phones: read-only"
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "phone: sideways scroll"
            for sel in ["#mcd-grid", ".mcd-hero", "#mcd-apps"]:
                box = ph.locator(sel).bounding_box(); assert box and box["x"] >= 0 and box["x"] + box["width"] <= 391, (sel, box)
            cols = ph.evaluate("getComputedStyle(document.querySelector('#mcd-grid')).gridTemplateColumns.split(' ').length")
            assert cols == 1, cols
            if take: ph.screenshot(path=str(SHOTS / "mcp-directory-phone.png"), full_page=True)
            ph.click(".mcd-tab[data-tab='connected']"); ph.wait_for_selector(".mcd-empty-card")
            assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            b.close()
    finally:
        srv.terminate()
    if errors: print("\n".join(errors)); sys.exit(1)
    print("e2e_mcp_directory: OK")

if __name__ == "__main__":
    main()
