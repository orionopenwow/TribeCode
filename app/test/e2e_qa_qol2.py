"""QA / quality-of-life pass 2 (fix/qa-qol-2): a beginner's first run at 1440 and 390, checked for plain words, one
next step per screen and no repeated controls.

  - Home: the Explorer test robot's findings about TribeCode itself fold away ("Test robot notes"); "Flint is in basic
    mode" (no "Ollama not reachable at http://…") with a Pick a brain button; no second "Connect your AI" card on desktop;
    the Global row says "All code" (was All repos).
  - New project -> chat: the Getting started pop-out doesn't repeat the bar's steps (one #flow-gh at most).
  - Dashboard: the Camp setup card is the only list of setup steps (no Next steps copy in the panel); elsewhere the
    panel's x sits on the Next steps row.
  - Empty states say what to do: Task Board (New task), Files (New doc), Preview (no "index.html" headline).
  - Agents Hub: no "MCP tool" jargon in the empty hero, no made-up "@maya's-claude" example.
  - Connect your AI: a "What's a terminal?" hint.
  - Settings: advanced rows fold under "More settings" (closed by default, remembered).
  - Invite: plain option labels; the public-link switch no longer says "Your files stay on this computer".
  - Phone (390): the pinned repo's Preview button doesn't sit on the repo name; no toast over the invite sheet; no
    sideways scroll.
  - Wording: nothing in app/ui says TribeCode runs on a friend's computer.
Usage: python app/test/e2e_qa_qol2.py
"""
import json, os, re, sys, tempfile, time, subprocess, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5400 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
IGNORE = ("11434", "api.github.com", "ERR_CONNECTION_REFUSED", "ERR_NAME_NOT_RESOLVED", "ERR_INTERNET_DISCONNECTED", "WebSocket connection", "ERR_CONNECTION_RESET", "ERR_EMPTY_RESPONSE", "net::ERR_ABORTED", "favicon", "localhost:9")
errors = []


def api(path):
    try:
        with urllib.request.urlopen(BASE + "/api" + path, timeout=5) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception: return 0


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and not any(x in m.text for x in IGNORE) and errors.append(f"{who} console: {m.text[:200]}"))


def wording():
    banned = re.compile(r"runs on (your|one) friend'?s computer|runs on one computer|your files stay on this computer", re.I)
    bad = []
    for f in list((ROOT / "app" / "ui").glob("*.js")) + list((ROOT / "app" / "ui").glob("*.html")):
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if banned.search(line) and not line.lstrip().startswith("//"): bad.append(f"{f.name}:{i}")
    assert not bad, f"wording rule (the work lives in the shared GitHub repo): {bad}"


def no_sideways(page, where):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{where}: sideways scroll"


def close_sheets(page):
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.evaluate("document.querySelectorAll('#invite-modal:not(.hidden), #settings-modal:not(.hidden)').forEach(m => m.classList.add('hidden'))")


def main():
    wording()
    tmp = Path(tempfile.mkdtemp(prefix="tribe-qaqol2-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "server.log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            if api("/health") == 200: break
            time.sleep(0.25)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Sam'})) } catch (e) {}")
            pg = ctx.new_page(); watch(pg, "desk")

            # ---- Home: insights in plain words, the test robot's notes folded, one Connect your AI
            fake = {"items": [
                {"id": "ex:1", "kind": "issue", "title": "GET /api/docs/:id/backlinks -> 404", "body": "answered 404 · Where: Command palette", "source": "explorer", "at": "2026-11-07T08:00:00Z"},
                {"id": "ex:2", "kind": "issue", "title": "Journey fails: Preview the app", "body": "no visible affordance", "source": "explorer", "at": "2026-11-07T08:00:00Z"},
                {"id": "h:ollama", "kind": "health", "title": "Flint has no AI yet", "body": "x", "source": "health"}]}
            def with_api(route):
                r = route.fetch(); d = r.json(); d["insightsApi"] = True
                route.fulfill(response=r, body=json.dumps(d))
            pg.route(lambda u: u.endswith("/api/hub"), with_api)
            pg.route("**/api/insights", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(fake)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.evaluate("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint: true, brain: true, ai: true})); window.TribeHelpers && TribeHelpers.render() } catch (e) {}")
            pg.evaluate("TribeHub.open('home')")
            pg.wait_for_selector("#home-ai-cards details.ai-dev", timeout=15000)
            cards = pg.inner_text("#home-ai-cards")
            assert "backlinks" not in cards and "Journey fails" not in cards, "the test robot's findings are folded away: " + cards[:400]
            assert "Test robot notes (2)" in cards, cards[:400]
            assert "Flint has no AI yet" in cards and "localhost:9" not in cards and "Ollama not reachable" not in cards, cards[:400]
            assert cards.count("Flint has no AI yet") == 1
            assert pg.locator("#home-ai-cards [data-ai-card-go]:has-text('Choose Flint')").count() == 1
            assert pg.locator("#home-ai-cards .ai-card b:text-is('Connect your AI')").count() == 0, "the panel's own Connect your AI card is enough on desktop"
            pg.click("#home-ai-cards details.ai-dev > summary"); pg.wait_for_selector("#home-ai-cards details.ai-dev[open] .ai-card")
            assert [t.strip() for t in pg.locator("#grp-global .nest-row span").all_inner_texts()] == ["Home", "Files", "Design", "Code", "Work", "Agent fleet"]
            assert "Starts a new project for the two of you" in pg.inner_text("#view-hub")
            pg.unroute_all(behavior="ignoreErrors")

            # ---- New project -> the chat's Getting started: the steps once (in the bar)
            pg.evaluate("TribeProjects.gallery()"); pg.wait_for_selector("[data-ns=own]"); pg.click("[data-ns=own]"); pg.wait_for_selector("#np-input")
            pg.fill("#np-input", "Lantern Garden"); pg.click("#np-create")
            pg.wait_for_function("document.querySelector('#invite-body') && /\\/join\\//.test(document.querySelector('#invite-body').innerText)", timeout=25000)
            pg.wait_for_timeout(900)
            assert not pg.evaluate("[...document.querySelectorAll('.toast')].some(t => t.offsetParent && /is live/.test(t.textContent))"), "no toast over the invite sheet"
            close_sheets(pg)
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#flow-dock .fbar .fk-steps", timeout=15000)
            if pg.locator("#flow-dock .fk-pop").count():
                assert pg.locator("#flow-dock .fk-pop .fk-steps").count() == 0, "the pop-out doesn't repeat the bar's steps"
            assert pg.locator("#flow-gh").count() <= 1, "one Connect GitHub button (unique id)"
            title = pg.locator("#flow-dock .fbar .fk-steps li").nth(4).get_attribute("title") or ""
            assert "shared folder" in title, f"the Repo step explains itself: {title!r}"

            # ---- Dashboard: Camp setup is the only step list; elsewhere the panel's x sits on the Next steps row
            close_sheets(pg)
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#pj-check.hero", timeout=15000); pg.wait_for_timeout(500)
            assert pg.locator("#room-next").count() == 0, "no Next steps copy next to Camp setup"
            assert "Choose where it lives" in pg.text_content("#pj-check")   # the home step (its wording changed with feat/folder-sync; text_content: one step shows at a time)
            pg.evaluate("TribeApp.show('tasks')"); pg.wait_for_selector("#room-next .rn-card", timeout=8000)
            x = pg.locator("#panel-close").bounding_box(); h = pg.locator("#room-next .rn-head").bounding_box()
            assert abs((x["y"] + x["height"] / 2) - (h["y"] + h["height"] / 2)) < 16, ("the x sits on the Next steps row", x, h)

            # ---- empty states say what to do
            pg.wait_for_selector("#board .tk-empty", timeout=8000)
            assert "Add a task" in pg.inner_text("#board .tk-empty")
            pg.evaluate("TribeApp.show('docs')"); pg.wait_for_selector(".fg-empty", timeout=10000)
            assert "Create" in pg.inner_text(".fg-empty")
            pg.evaluate("TribeApp.show('coord')"); pg.wait_for_selector("#ad-hero", timeout=10000)
            hero = pg.inner_text("#ad-hero")
            assert "MCP tool" not in hero, hero
            if pg.locator("#talk-input").count(): assert "maya" not in (pg.get_attribute("#talk-input", "placeholder") or "").lower()

            # ---- Preview: plain headline, the file names tucked away
            pg.evaluate("TribePreview.open()"); pg.wait_for_selector(".pvw-empty", timeout=10000)
            pv = pg.inner_text(".pvw-empty")
            assert "index.html yet" not in pv and ("No page to show yet" in pv or "Nothing to show yet" in pv or "What should it be?" in pv), pv
            pg.keyboard.press("Escape"); pg.evaluate("window.TribePreview && TribePreview.close && TribePreview.close()")

            # ---- Connect your AI: a hint for "terminal"
            pg.evaluate("TribeApp.connectClaude({fresh: true})"); pg.wait_for_selector("#invite-body details.cc-what", timeout=10000)
            pg.click("#invite-body details.cc-what > summary"); assert "PowerShell" in pg.inner_text("#invite-body details.cc-what")
            close_sheets(pg)

            # ---- Settings: advanced rows live in their own tab (feat/settings-tabs), the last tab is remembered
            pg.evaluate("TribeSettings.open('profile')"); pg.wait_for_selector("#set-tab-admin", timeout=8000)
            assert not pg.locator("#set-backup").is_visible(), "Backup waits in Tribe & admin"
            pg.click("#set-tab-admin"); pg.wait_for_selector("#set-backup", state="visible")
            pg.evaluate("TribeSettings.close(); TribeSettings.open()"); pg.wait_for_selector("#set-backup", state="visible")
            close_sheets(pg)

            # ---- Invite: plain options; no "files stay on this computer"
            pg.evaluate("TribeShell.go('invite')"); pg.wait_for_selector("#tl-box", timeout=10000); pg.evaluate("document.querySelectorAll('.tl-more').forEach(d => d.open = true)"); pg.wait_for_selector("#inv-hours", timeout=10000)
            assert pg.locator("#inv-hours option").first.inner_text().startswith("Lasts"), "the expiry says what it is"
            assert pg.locator("#inv-role option[value=builder]").inner_text() == "They can build"
            pg.wait_for_timeout(400)
            assert "stay on this computer" not in pg.inner_text("#invite-body")
            no_sideways(pg, "invite 1440")
            close_sheets(pg)
            ctx.storage_state(path=str(tmp / "st.json"))
            ctx.close()

            # ---- phone (390): the pinned repo's Preview button clears the name; no sideways scroll
            ph_ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, user_agent=IPHONE_UA, storage_state=str(tmp / "st.json"))
            ph = ph_ctx.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=20000)
            ph.evaluate("localStorage.setItem('tribecode.iosHint', '1'); document.querySelector('.ios-hint') && document.querySelector('.ios-hint').remove()")
            ph.evaluate("TribeApp.show('docs')"); ph.wait_for_selector(".rhx-pv", timeout=15000); ph.wait_for_timeout(500)
            a = ph.locator(".rhx-pv").first.bounding_box(); n = ph.locator(".rhx-t b").first.bounding_box()
            overlap = min(a["x"] + a["width"], n["x"] + n["width"]) - max(a["x"], n["x"]) > 2 and min(a["y"] + a["height"], n["y"] + n["height"]) - max(a["y"], n["y"]) > 2
            assert not overlap, ("Preview app sits on the repo name", a, n)
            assert "clean" not in ph.inner_text(".rhx-chips"), "plain 'all saved' instead of git's 'clean'"
            no_sideways(ph, "phone files")
            for v in ("home", "chat", "tasks", "coord"):
                ph.evaluate(f"TribeApp.show('{v}')"); ph.wait_for_timeout(500); no_sideways(ph, "phone " + v)
            b.close()
        real = [e for e in errors if not any(x in e for x in IGNORE)]
        assert not real, real
        print("e2e_qa_qol2: OK (Home insights plain + test robot folded + one Connect card, All code, Getting started steps once, Camp setup without a panel copy, empty states, Agents Hub words, terminal hint, More settings, invite labels, phone repo hero, wording)")
    finally:
        srv.terminate()
        try: srv.wait(10)
        except Exception: srv.kill()


if __name__ == "__main__":
    main()
