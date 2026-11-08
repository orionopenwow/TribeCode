"""Sheets and Slides in Files (feat/crafts: app/ui/sheet.js, deck.js; server/flint.js /api/flint/make).

Desktop: the Files grid offers 📊 Sheet and 🎞️ Slides next to + New doc and shows sheet and deck thumbnails. A sheet
opens in the grid editor: typing a value and a formula works (=SUM, =B2*C2, a cycle shows #CYCLE!), the formula bar
shows the raw cell, the status bar sums a selection, a pasted block from a spreadsheet lands in place, and the body
on disk stays a plain Markdown table. A second person's edit appears live. Slides: the strip, editing a slide, adding
one, the theme switch, Present (arrow keys, Esc), and the body stays Markdown split by ---. Flint ("make a sheet for
our snack budget") writes a sheet in basic mode from a template, and the docs list carries the kind.
Phone (390px): a sheet and a deck open with no sideways scroll.
Usage: python app/test/e2e_crafts.py   (screenshots: docs/screenshots/crafts-sheet.png, crafts-deck.png)
"""
import asyncio, json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5460 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


def api(path, method="GET", body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        data = r.read()
        return data.decode() if raw else json.loads(data or b"{}")


def ignorable(t):
    return any(s in t for s in ("11434", "localhost:9", "ERR_CONNECTION_REFUSED", "api.github.com", "ERR_NAME_NOT_RESOLVED", "ERR_FAILED", "favicon", "503"))


async def open_as(browser, name, token, phone=False):
    ctx = await browser.new_context(**({"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True} if phone else {"viewport": {"width": 1440, "height": 900}}))
    await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = await ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and not ignorable(m.text) and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    await page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    await page.goto(BASE + "/?skipIntro=1")
    await page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=15000)
    return page


async def open_file(page, title):
    await page.evaluate("TribeApp.show('docs')")
    await page.wait_for_function("([t]) => window.TribeDocs && TribeDocs.list().some(d => d.title === t)", arg=[title], timeout=10000)
    await page.evaluate("([t]) => TribeDocs.open(TribeDocs.list().find(d => d.title === t).slug)", [title])


async def type_cell(page, ref_r, ref_c, text):
    await page.click(f"td[data-r='{ref_r}'][data-c='{ref_c}']")
    await page.keyboard.type(text)
    await page.keyboard.press("Enter")


async def main():
    tmp = tempfile.mkdtemp(prefix="tribe-crafts-")
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1", "TRIBE_NO_GH": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Snack Squad", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"})["token"]
        sheet = api("/docs", "POST", {"title": "Snack budget", "kind": "sheet", "body": "| Item | Qty | Price | Total |\n| --- | --- | --- | --- |\n| Chips | 2 | 3 | =B2*C2 |\n"}, token=host_tok)["doc"]
        assert sheet["kind"] == "sheet"
        deck = api("/docs", "POST", {"title": "Pitch", "kind": "deck", "body": "<!-- theme: campfire -->\n\n# Lantern Quest\n\nA cozy platformer\n\n---\n\n## Why\n\n- Friends\n- Fun\n"}, token=host_tok)["doc"]
        api("/docs", "POST", {"title": "Plain note", "body": "## Hi"}, token=host_tok)

        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = await open_as(b, "Orion", host_tok)
            await host.evaluate("TribeApp.show('docs')")
            await host.wait_for_selector(".fg-card[data-type='sheet']", timeout=10000)
            assert await host.locator("#fg-new-sheet").is_visible() and await host.locator("#fg-new-deck").is_visible()
            assert await host.locator(".fg-card[data-type='deck'] .fg-th-deck .sd").count() == 1
            assert "Chips" in await host.inner_text(".fg-card[data-type='sheet'] .fg-th-sheet") and "6" in await host.inner_text(".fg-card[data-type='sheet'] .fg-th-sheet")

            # ---- sheet ----
            await host.click(".fg-card[data-type='sheet']")
            await host.wait_for_selector(".sx-grid td[data-r='1'][data-c='3']")
            assert await host.inner_text("td[data-r='1'][data-c='3']") == "6", "=B2*C2 works out"
            await type_cell(host, 2, 0, "Juice")
            await type_cell(host, 2, 1, "4")
            await type_cell(host, 2, 2, "2.5")
            await type_cell(host, 2, 3, "=B3*C3")
            await type_cell(host, 3, 3, "=SUM(D2:D3)")
            assert await host.inner_text("td[data-r='3'][data-c='3']") == "16"
            await host.click("td[data-r='3'][data-c='3']")
            assert await host.input_value("#sx-formula") == "=SUM(D2:D3)", "the formula bar shows the raw cell"
            await type_cell(host, 4, 3, "=D5")
            assert await host.inner_text("td[data-r='4'][data-c='3']") == "#CYCLE!"
            await host.click("td[data-r='4'][data-c='3']"); await host.keyboard.press("Delete")
            # select a range: the status bar sums it
            await host.click("td[data-r='1'][data-c='3']"); await host.click("td[data-r='2'][data-c='3']", modifiers=["Shift"])
            assert "Sum 16" in await host.inner_text("#sx-foot")
            # paste a block from a spreadsheet (tab separated)
            await host.click("td[data-r='6'][data-c='0']")
            await host.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Napkins\\t1\\t2\\nCups\\t3\\t1'); document.querySelector('#sx-wrap').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); }""")
            assert await host.inner_text("td[data-r='7'][data-c='0']") == "Cups"
            await host.wait_for_function("document.querySelector('#sx-status').textContent.startsWith('Saved')", timeout=8000)
            disk = api("/docs/" + sheet["slug"], token=host_tok)["doc"]
            assert disk["kind"] == "sheet" and "| Juice | 4 | 2.5 | =B3*C3 |" in disk["body"] and "| Cups | 3 | 1 |" in disk["body"], disk["body"]
            await host.wait_for_timeout(300); await host.screenshot(path=str(SHOTS / "crafts-sheet.png"))
            # a teammate's change shows up live
            api("/docs/" + sheet["slug"], "PUT", {"body": disk["body"].replace("| Chips | 2 |", "| Chips | 5 |"), "baseVersion": disk["version"]}, token=maya_tok)
            await host.wait_for_function("document.querySelector(\"td[data-r='1'][data-c='3']\").textContent === '15'", timeout=8000)

            # ---- slides ----
            await host.click("#sx-close")
            await host.wait_for_selector(".fg-card[data-type='deck']")
            await host.click(".fg-card[data-type='deck']")
            await host.wait_for_selector("#dk-stage .sd")
            assert await host.locator(".dk-th").count() == 2 and await host.locator("#dk-stage .sd.sd-title").count() == 1
            await host.click(".dk-th[data-i='1']")
            assert "Why" in await host.input_value("#dk-src")
            await host.fill("#dk-src", "## Why us\n\n- Friends\n- Fun\n- Phones")
            assert "Phones" in await host.inner_text("#dk-stage")
            await host.click("#dk-add")
            assert await host.locator(".dk-th").count() == 3
            await host.fill("#dk-src", "## Next\n\n- Ship it")
            await host.fill("#dk-notes", "Smile")
            await host.select_option("#dk-theme", "paper")
            assert await host.locator("#dk-stage .sd.th-paper").count() == 1
            await host.wait_for_function("document.querySelector('#dk-status').textContent.startsWith('Saved')", timeout=8000)
            body = api("/docs/" + deck["slug"], token=host_tok)["doc"]["body"]
            assert body.startswith("<!-- theme: paper -->") and body.count("\n---\n") == 2 and "Notes: Smile" in body and "- Phones" in body, body
            await host.wait_for_timeout(300); await host.screenshot(path=str(SHOTS / "crafts-deck.png"))
            await host.click("#dk-play")
            await host.wait_for_selector(".dk-present .sd")
            await host.keyboard.press("ArrowRight")
            assert "3 / 3" in await host.inner_text("#dk-pn") and "Smile" in await host.inner_text("#dk-pnotes")
            await host.keyboard.press("Escape")
            assert await host.locator(".dk-present").count() == 0
            html = await host.evaluate("TribeDeck.html(TribeDeck.parse(TribeDocs.current().body), 'x')")
            assert html.count('<section class="sd') == 3 and "@media print" in html

            # ---- Flint writes a sheet (basic mode: a template) ----
            await host.click("#dk-close")
            r = await host.evaluate("TribeFlint.ask('make a sheet for our snack budget')")
            await host.wait_for_function("TribeDocs.current() && TribeDocs.current().kind === 'sheet' && TribeDocs.current().title.toLowerCase().includes('snack budget') && TribeDocs.current().slug !== %s" % json.dumps(sheet["slug"]), timeout=10000)
            await host.wait_for_selector(".sx-grid td[data-r='0'][data-c='0']")
            assert await host.inner_text("td[data-r='0'][data-c='0']") == "Item"
            last = await host.evaluate("TribeFlint.thread().slice(-1)[0].text")
            assert "template" in last.lower(), last
            # deck and doc from Flint too
            await host.evaluate("TribeFlint.ask('make slides about our game jam')")
            await host.wait_for_function("TribeDocs.current() && TribeDocs.current().kind === 'deck'", timeout=10000)
            await host.wait_for_selector("#dk-stage .sd")
            await host.evaluate("TribeFlint.ask('write a doc about the art style')")
            await host.wait_for_function("TribeDocs.current() && !TribeDocs.current().kind && TribeDocs.current().title.toLowerCase().includes('art style')", timeout=10000)
            # /api/flint/make refuses edits without a brain (503) and checks its input
            try: api("/flint/make", "POST", {"kind": "sheet", "ask": "add a row", "body": "| a |\n| --- |\n"}, token=host_tok); assert False
            except urllib.error.HTTPError as e: assert e.code == 503
            try: api("/flint/make", "POST", {"kind": "nope", "ask": "x"}, token=host_tok); assert False
            except urllib.error.HTTPError as e: assert e.code == 400

            # ---- phone ----
            ph = await open_as(b, "Maya", maya_tok, phone=True)
            await open_file(ph, "Snack budget")
            await ph.wait_for_selector(".sx-grid td[data-r='1'][data-c='3']", timeout=10000)
            assert await ph.evaluate("document.documentElement.scrollWidth") <= 391
            await open_file(ph, "Pitch")
            await ph.wait_for_selector("#dk-stage .sd", timeout=10000)
            assert await ph.evaluate("document.documentElement.scrollWidth") <= 391
            await ph.wait_for_timeout(300); await ph.screenshot(path=str(SHOTS / "crafts-phone.png"))
            await b.close()

        # the list carries the kind (agents see it in list_docs too)
        kinds = {d["title"]: d.get("kind") for d in api("/docs", token=host_tok)["docs"]}
        assert kinds["Snack budget"] == "sheet" and kinds["Pitch"] == "deck" and kinds["Plain note"] is None, kinds
        assert not errors, errors
        print("e2e_crafts: ok")
    finally:
        srv.send_signal(2)
        try: srv.wait(timeout=10)
        except Exception: srv.kill()


if __name__ == "__main__":
    asyncio.run(main())
