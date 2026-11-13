"""The document editor (app/ui/doclayout.js + docs.js + hub.js noteEditor): a Google Docs + Notion hybrid.

Desktop (1440px): a project doc opens in the shared layout (top bar with the inline title, where it lives, Saved and
who's editing; a role=toolbar formatting row with arrow-key navigation; a left panel with Document tabs and the
Outline; a centered page card). The toolbar edits Markdown: Bold wraps the selection in **, the style dropdown's
Heading 1 sets "## ", Checklist adds "- [ ] ", Ctrl+I / Ctrl+Alt+2 / Ctrl+Shift+8 work, the slash menu inserts a
heading, the Outline lists the headings and clicking one scrolls the page to it. Two people co-editing (one using the
toolbar) still converge. A personal note uses the same layout and saves (#note-title / #note-text / #note-done);
Escape and ✓ close it. Phone (390px), Google Docs mobile parity: the note editor's 64px header (✓ pill 49x38 at x=11;
undo, redo, +, comment, sparkle, ⋮ centered at 139…366, solid 22px+ glyphs), the 52px format bar (B I U A highlighter
| align | list, pinned A≡) riding on a simulated keyboard, bold's active state, the A≡ Text / Paragraph panel, the
color palette, Insert / More / Find and replace / Ask AI sheets; a project doc on the phone gets the same bar, the
Outline sheet and the slash menu; no sideways scroll.
Usage: python app/test/e2e_doc_editor.py [--shots]   (screenshots: docs/screenshots/doc-editor-desktop.png, -phone.png)
"""
import asyncio, json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4971 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []

BODY = "## Goals\nShip the lantern level.\n\nPlain line one\nPlain line two\nMake this bold please\n\n### Risks\nThe bridge may wobble.\n\n" + "".join(f"Filler paragraph {i}.\n\n" for i in range(40)) + "## Launch\nParty at the campfire."


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


def ignorable(t):
    return any(s in t for s in ("11434", "localhost:9", "ERR_CONNECTION_REFUSED", "api.github.com", "ERR_NAME_NOT_RESOLVED", "ERR_FAILED", "favicon"))


async def open_as(browser, name, token, phone=False):
    ctx = await browser.new_context(**({"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True, "device_scale_factor": 2} if phone else {"viewport": {"width": 1440, "height": 900}}))
    await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = await ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and not ignorable(m.text) and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    await page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    await page.goto(BASE + "/?skipIntro=1")
    await page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=15000)
    return page


async def open_doc(page, title):
    await page.evaluate("TribeApp.show('docs')")
    await page.wait_for_function("([t]) => window.TribeDocs && TribeDocs.list().some(d => d.title === t)", arg=[title], timeout=10000)
    await page.evaluate("([t]) => TribeDocs.open(TribeDocs.list().find(d => d.title === t).slug)", [title])
    await page.wait_for_function("([t]) => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg=[title], timeout=10000)
    await page.wait_for_function("TribeDocs.live()", timeout=10000)


async def select(page, text, ta="#doc-body", collapse=None):
    """Select `text` in the editor (or put the caret at its start / end with collapse='start'|'end')."""
    await page.evaluate("""([sel, t, c]) => { const ta = document.querySelector(sel); const i = ta.value.indexOf(t); if (i < 0) throw new Error('not found: ' + t);
        ta.focus(); if (c === 'start') ta.setSelectionRange(i, i); else if (c === 'end') ta.setSelectionRange(i + t.length, i + t.length); else ta.setSelectionRange(i, i + t.length); }""", [ta, text, collapse])


async def value(page, sel="#doc-body"):
    return await page.evaluate("([s]) => document.querySelector(s).value", [sel])   # the rich editor keeps the textarea's .value


async def converged(pages, slug, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        vals = [await p.evaluate("([s]) => { const d = TribeCoedit.debug(s); return { v: document.querySelector('#doc-body').value, st: d && d.state }; }", [slug]) for p in pages]
        if all(v["st"] == "synchronized" for v in vals) and len({v["v"] for v in vals}) == 1:
            return vals[0]["v"]
        await asyncio.sleep(0.1)
    raise AssertionError("editors did not converge: " + json.dumps(vals, indent=1)[:2000])


async def main():
    tmp = tempfile.mkdtemp(prefix="tribe-ed-")
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Lantern Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        for _ in range(80):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"})["token"]
        doc = api("/docs", "POST", {"title": "Lantern level", "body": BODY}, token=host_tok)["doc"]
        api("/docs", "POST", {"title": "Art direction", "body": "## Palette\nEmber and teal."}, token=host_tok)
        slug = doc["slug"]

        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = await open_as(b, "Orion", host_tok)
            await open_doc(host, "Lantern level")
            # with the room panel open the pane is narrower: a slimmer side panel (doc list still there), nothing overflows
            assert await host.locator(".panel").first.is_visible(), "the editor leaves the room panel as it was"
            assert await host.locator(".dl-body.narrow.side-off").count() == 1, "the side panel starts hidden"
            await host.click("#dl-side-open"); assert await host.locator("#dl-tabs .doc-item").first.is_visible()
            assert await host.evaluate("document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth")
            # hide the room panel (its ×): the full Google Docs-style layout
            await host.click("#panel-close")
            await host.wait_for_selector(".dl-body:not(.narrow)")
            # the side panel folds away and comes back
            await host.click("#dl-side-x"); assert await host.locator("#dl-side").is_hidden()
            await host.click("#dl-side-open"); assert await host.locator("#dl-side").is_visible()   # left open for the layout checks below

            # ---------------- the layout ----------------
            for sel in [".dl-top .dl-ic", "#dl-name", ".dl-meta .dl-where", "#doc-status", ".dl-fmt[role=toolbar]", "#dl-side", "#dl-tabs #doc-list", "#dl-outline", ".dl-canvas .dl-page #doc-body", "#dl-link", "#dl-close"]:
                assert await host.locator(sel).count() == 1, f"missing {sel}"
            assert await host.input_value("#dl-name") == "Lantern level"
            assert "Lantern Crew" in await host.inner_text(".dl-where") or len(await host.inner_text(".dl-where")) > 0
            await host.wait_for_function("document.querySelector('#doc-status').textContent.length > 0")
            # the page: a centered card with a ~720px writing column; no gradients or shadows
            geo = await host.evaluate("""() => { const p = document.querySelector('.dl-page'), c = document.querySelector('.dl-canvas'), cs = getComputedStyle(p), ta = document.querySelector('#doc-body');
                const pr = p.getBoundingClientRect(), cr = c.getBoundingClientRect();
                return { w: ta.getBoundingClientRect().width, left: pr.left - cr.left, right: cr.right - pr.right, radius: cs.borderRadius, shadow: cs.boxShadow, bg: cs.backgroundImage, lh: getComputedStyle(ta).lineHeight, fs: getComputedStyle(ta).fontSize }; }""")
            assert 560 <= geo["w"] <= 760, geo
            assert abs(geo["left"] - geo["right"]) < 4, geo
            assert geo["radius"] == "12px" and geo["shadow"] == "none" and geo["bg"] == "none", geo
            assert geo["fs"] == "16px" and abs(float(geo["lh"].replace("px", "")) - 25.6) < 0.5, geo
            # Document tabs: the project's other docs, with + to create one
            await host.wait_for_selector("#dl-tabs .doc-item:has-text('Art direction')")
            assert await host.locator("#dl-tabs #doc-new").count() == 1
            # every toolbar button has an aria-label; arrow keys move along it
            assert await host.evaluate("[...document.querySelectorAll('.dl-fmt .dl-tb')].every(b => b.getAttribute('aria-label'))")
            await host.focus(".dl-fmt .dl-tb[data-fmt=undo]")
            await host.keyboard.press("ArrowRight")
            assert await host.evaluate("document.activeElement.dataset.fmt") == "redo"
            await host.keyboard.press("End")
            assert await host.evaluate("document.activeElement.dataset.fmt") == "clear"
            await host.keyboard.press("ArrowRight")
            assert await host.evaluate("document.activeElement.dataset.fmt") == "undo"

            # ---------------- the outline ----------------
            items = await host.locator("#dl-outline .dl-ol-i").all_inner_texts()
            assert items == ["Goals", "Risks", "Launch"], items
            await host.click("#dl-outline .dl-ol-i:has-text('Launch')")
            await host.wait_for_function("document.querySelector('main').scrollTop > 400", timeout=4000)
            await host.wait_for_timeout(700)
            caret_line = await host.evaluate("() => { const ta = document.querySelector('#doc-body'); const v = ta.value, i = ta.selectionStart; return v.slice(v.lastIndexOf('\\n', i - 1) + 1, i); }")
            assert caret_line == "## Launch", caret_line
            vis = await host.evaluate("""() => { const ta = document.querySelector('#doc-body'), m = document.querySelector('main'); const r = ta.getBoundingClientRect(), mr = m.getBoundingClientRect();
                const i = ta.value.indexOf('## Launch'); const d = document.createElement('div'); const cs = getComputedStyle(ta);
                ['fontFamily','fontSize','lineHeight','width','padding','boxSizing'].forEach(k => d.style[k] = cs[k]); Object.assign(d.style, { position: 'absolute', whiteSpace: 'pre-wrap', visibility: 'hidden' });
                d.textContent = ta.value.slice(0, i); ta.parentNode.appendChild(d); const y = r.top + d.offsetHeight; d.remove(); return y > mr.top && y < mr.bottom; }""")
            assert vis, "the Launch heading is on screen after clicking it in the outline"
            assert await host.locator("#dl-outline .dl-ol-i.on").inner_text() == "Launch"
            # the current section follows scrolling
            await host.evaluate("document.querySelector('main').scrollTop = 0")
            await host.wait_for_function("document.querySelector('#dl-outline .dl-ol-i.on') && document.querySelector('#dl-outline .dl-ol-i.on').textContent === 'Goals'", timeout=4000)
            # the side panel stays put while the page scrolls, and folds away
            await host.click("#dl-ol-head"); assert await host.locator("#dl-outline").is_hidden()
            await host.click("#dl-ol-head"); assert await host.locator("#dl-outline").is_visible()

            # ---------------- toolbar edits (Markdown) ----------------
            await select(host, "bold")
            await host.click(".dl-fmt [data-fmt=bold]")
            assert "Make this **bold** please" in await value(host), await value(host)
            await select(host, "Plain line one", collapse="end")
            await host.click(".dl-fmt .dl-style")
            await host.wait_for_selector(".dl-menu [data-st=h1]")
            assert await host.get_attribute(".dl-fmt .dl-style", "aria-expanded") == "true"
            await host.click(".dl-menu [data-st=h1]")
            assert "\n## Plain line one\n" in await value(host), await value(host)
            await host.wait_for_function("document.querySelector('.dl-style-l').textContent === 'Heading 1'")
            await select(host, "Plain line two", collapse="start")
            await host.click(".dl-fmt [data-fmt=todo]")
            assert "\n- [ ] Plain line two\n" in await value(host), await value(host)
            assert await host.get_attribute(".dl-fmt [data-fmt=todo]", "aria-pressed") == "true"
            await host.click(".dl-fmt [data-fmt=todo]")   # toggles back off
            assert "\nPlain line two\n" in await value(host)
            await host.click(".dl-fmt [data-fmt=todo]")
            # undo (toolbar) reverts the last edit, redo brings it back
            await host.click(".dl-fmt [data-fmt=undo]")
            assert "\nPlain line two\n" in await value(host), await value(host)
            await host.click(".dl-fmt [data-fmt=redo]")
            assert "\n- [ ] Plain line two\n" in await value(host), await value(host)
            # keyboard shortcuts
            await select(host, "lantern")
            await host.keyboard.press("Control+i")
            assert "Ship the *lantern* level." in await value(host)
            await select(host, "The bridge may wobble.", collapse="start")
            await host.keyboard.press("Control+Alt+2")
            assert "\n### The bridge may wobble.\n" in await value(host), await value(host)
            await host.keyboard.press("Control+Alt+0")
            await host.keyboard.press("Control+Shift+8")
            assert "\n- The bridge may wobble.\n" in await value(host), await value(host)
            await select(host, "campfire")
            await host.keyboard.press("Control+k")
            assert await host.locator("#palette:not(.hidden)").count() == 0, "Ctrl+K in the editor inserts a link, not the palette"
            assert "Party at the [campfire](https://)." in await value(host)
            assert await host.evaluate("() => { const ta = document.querySelector('#doc-body'); return ta.value.slice(ta.selectionStart, ta.selectionEnd); }") == "https://"
            # divider + table
            await select(host, "Filler paragraph 3.", collapse="end")
            await host.click(".dl-fmt [data-fmt=hr]")
            assert "Filler paragraph 3.\n\n---\n" in await value(host)
            await host.click(".dl-fmt [data-fmt=table]")
            assert "| Column | Column |\n| --- | --- |" in await value(host)
            # clear formatting
            await select(host, "Make this **bold** please")
            await host.click(".dl-fmt [data-fmt=clear]")
            assert "\nMake this bold please\n" in await value(host)

            # ---------------- slash menu ----------------
            await host.evaluate("() => { const ta = document.querySelector('#doc-body'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }")
            await host.keyboard.press("Enter"); await host.keyboard.press("Enter")
            await host.keyboard.type("/head")
            await host.wait_for_selector("#doc-slash:not(.hidden)")
            labels = await host.locator("#doc-slash button").all_inner_texts()
            assert labels[:3] == ["Heading 1", "Heading 2", "Heading 3"], labels
            await host.keyboard.press("ArrowDown"); await host.keyboard.press("ArrowUp")
            await host.keyboard.press("Enter")
            await host.keyboard.type("Afterparty")
            assert (await value(host)).endswith("\n\n## Afterparty"), (await value(host))[-60:]
            await host.wait_for_selector("#dl-outline .dl-ol-i:has-text('Afterparty')", timeout=4000)
            await host.keyboard.press("Enter"); await host.keyboard.type("/to"); await host.wait_for_selector("#doc-slash:not(.hidden)")
            await host.keyboard.press("Escape")
            assert await host.locator("#doc-slash.hidden").count() == 1
            await host.keyboard.press("Backspace"); await host.keyboard.press("Backspace"); await host.keyboard.press("Backspace")

            # title in the top bar and on the page stay in step
            await host.fill("#doc-title", "Lantern level plan")
            assert await host.input_value("#doc-title") == "Lantern level plan"

            # ---------------- two people co-editing still converge ----------------
            maya = await open_as(b, "Maya", maya_tok)
            await open_doc(maya, "Lantern level plan")
            await host.wait_for_function("document.querySelector('#doc-peers').textContent.includes('Maya')", timeout=8000)
            assert await host.locator(".dl-meta #doc-peers .co-av").count() >= 1, "who's editing shows in the top bar"
            await select(host, "Ship the", collapse="end")
            await select(maya, "Party at the", collapse="start")
            async def maya_bold():
                await select(maya, "Filler paragraph 7.")
                await maya.click(".dl-fmt [data-fmt=bold]")
                await select(maya, "Party at the", collapse="start")
                await maya.keyboard.type("Maya: ", delay=15)
            await asyncio.gather(host.keyboard.type(" shiny", delay=18), maya_bold())
            text = await converged([host, maya], slug)
            assert "Ship the shiny *lantern* level." in text and "**Filler paragraph 7.**" in text and "Maya: Party at the" in text, text[-400:]
            await maya.wait_for_function("document.querySelector('#dl-name').value === 'Lantern level plan'")
            # a remote title change reaches the top bar too
            await maya.fill("#doc-title", "Lantern level v2")
            await host.wait_for_function("document.querySelector('#dl-name').value === 'Lantern level v2' && document.querySelector('#doc-title').value === 'Lantern level v2'", timeout=8000)
            # the file on disk matches
            for _ in range(60):
                disk = api("/docs/" + slug, token=host_tok)["doc"]["body"]
                if disk.strip() == text.strip(): break
                await asyncio.sleep(0.1)
            assert disk.strip() == text.strip()

            # read mode: checklist items toggle
            await host.click(".doc-toolbar [data-mode='read']")
            await host.wait_for_selector("#doc-read input[type=checkbox]")
            await host.click("#doc-read input[type=checkbox]")
            await host.wait_for_function("document.querySelector('#doc-body').value.includes('- [x] Plain line two')", timeout=4000)
            await host.click(".doc-toolbar [data-mode='write']")
            await converged([host, maya], slug)

            # screenshot: the outline, the toolbar, the page, Maya editing (before any toast)
            await host.evaluate("document.querySelector('main').scrollTop = 0")
            await select(host, "Ship the shiny", collapse="end")
            await host.wait_for_timeout(2500)
            await host.screenshot(path=str(SHOTS / "doc-editor-desktop.png"))

            # Share copies a link that opens this doc
            await host.click("#dl-link")
            link = await host.evaluate("navigator.clipboard.readText()")
            assert f"#/doc/" in link and link.endswith("/" + slug), link
            await maya.close()

            # Close goes back to the docs list (with the repo hero)
            await host.click("#dl-close")
            await host.wait_for_selector("#fg-new-menu")
            assert await host.locator(".docs-grid.dl-on").count() == 0 and await host.locator(".docs-grid > #doc-list-wrap").count() == 1
            assert not await host.evaluate("document.body.classList.contains('dl-wide')")

            # ---------------- a personal note: same layout, saves, Escape / ✓ close ----------------
            await host.evaluate("TribeHub.open('docs')")
            await host.wait_for_selector("#hub-docs")
            await host.click("#dc-new"); await host.click("#dc-newmenu [data-new=note]")   # + New › Note
            await host.wait_for_selector("#note-ed .note-ed.dl-shell #note-text")
            for sel in ["#note-ed .dl-top", "#note-ed .dl-fmt[role=toolbar]", "#note-ed #note-undo", "#note-ed #note-redo", "#note-ed #note-done", "#note-ed #note-ai", "#note-ed #note-more", "#note-ed .dl-page #note-title", "#note-outline"]:
                assert await host.locator(sel).count() == 1, f"note: missing {sel}"
            assert "Only you" in await host.inner_text("#note-ed .dl-meta")
            await host.fill("#note-title", "Moon garden")
            assert await host.input_value("#note-name") == "Moon garden"
            await host.click("#note-text")
            await host.keyboard.type("/head"); await host.wait_for_selector("#note-ed .dl-slash:not(.hidden)"); await host.keyboard.press("Enter")
            await host.keyboard.type("Plants"); await host.keyboard.press("Enter")
            await host.keyboard.type("Silver sage glows at night")
            await select(host, "Silver", ta="#note-text")
            await host.click("#note-ed .dl-fmt [data-fmt=bold]")
            await host.evaluate("() => { const ta = document.querySelector('#note-text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }")
            await host.keyboard.press("Enter")
            await host.click("#note-ed .dl-fmt [data-fmt=todo]"); await host.keyboard.type("Water weekly")
            assert await value(host, "#note-text") == "## Plants\n**Silver** sage glows at night\n- [ ] Water weekly", await value(host, "#note-text")
            await host.wait_for_selector("#note-outline .dl-ol-i:has-text('Plants')")
            await host.wait_for_function("document.querySelector('#note-status').textContent === 'Saved'", timeout=5000)
            await host.keyboard.press("Escape")
            await host.wait_for_selector("#note-ed", state="detached")
            await host.wait_for_selector("#hub-docs [data-mynote]:has-text('Moon garden')")
            await host.click("#hub-docs [data-mynote]:has-text('Moon garden')")
            await host.wait_for_selector("#note-ed #note-text")
            assert await value(host, "#note-text") == "## Plants\n**Silver** sage glows at night\n- [ ] Water weekly"
            await host.click("#note-done")
            await host.wait_for_selector("#note-ed", state="detached")
            notes = api("/scratch", token=host_tok)["notes"]
            assert any(n["text"].startswith("Moon garden\n## Plants") for n in notes), notes

            # ---------------- phone (390px): Google Docs mobile ----------------
            ph = await open_as(b, "Orion", host_tok, phone=True)
            if await ph.locator("#ins-later").count() and await ph.locator("#ins-later").is_visible(): await ph.click("#ins-later")
            # the note editor: header (✓ pill; undo, redo, +, comment, sparkle, ⋮) and the format bar on the keyboard
            await ph.evaluate("TribeHub.open('docs')")
            await ph.wait_for_selector("#hub-docs [data-mynote]")
            await ph.click("#hub-docs [data-mynote]:has-text('Moon garden')")
            await ph.wait_for_selector("#note-ed.gd-wrap .gd-head #note-done")
            assert await ph.locator("#note-ed .dl-fmt").count() == 0, "the desktop toolbar is not on phones"
            hdr = await ph.evaluate("""() => { const r = e => { const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, w: q.width, h: q.height }; };
                const head = document.querySelector('.gd-head'), done = document.querySelector('#note-done'), cs = getComputedStyle(done);
                return { head: head.getBoundingClientRect().height, border: getComputedStyle(head).borderBottomWidth, done: { ...r(done), left: done.getBoundingClientRect().left, radius: cs.borderRadius, bg: cs.backgroundColor, op: cs.opacity },
                  icons: [...document.querySelectorAll('.gd-head .gd-ib')].map(b => { const s = b.querySelector('svg').getBoundingClientRect(), c = getComputedStyle(b); return { k: b.dataset.act, id: b.id, ...r(b), glyph: Math.min(s.width, s.height), op: c.opacity, color: c.color }; }) }; }""")
            assert hdr["head"] == 64 and hdr["border"] == "0px", hdr
            d = hdr["done"]
            assert abs(d["left"] - 11) <= 1 and round(d["w"]) == 49 and round(d["h"]) == 38 and float(d["radius"].replace("px", "")) >= 19, d
            text_rgb = await ph.evaluate("() => { const e = document.createElement('i'); e.style.color = 'var(--text)'; document.body.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c; }")
            assert d["bg"] == text_rgb and d["op"] == "1", (d, text_rgb)   # a solid near-white pill in dark themes (var(--text)), dark in light ones
            assert [i["k"] for i in hdr["icons"]] == ["undo", "redo", "plus", "comment", "sparkle", "more"], hdr["icons"]
            assert [i["id"] for i in hdr["icons"][:2]] == ["note-undo", "note-redo"]
            for i, want in zip(hdr["icons"], [139, 184, 230, 275, 321, 366]):
                assert abs(i["x"] - want) <= 4 and abs(i["y"] - 32) <= 4 and i["w"] >= 44 and i["h"] >= 44, (i, want)
                assert i["glyph"] >= 22 and i["op"] == "1" and "rgba" not in i["color"], i
            # the format bar: positions, solid glyphs, pinned A≡
            bar = await ph.evaluate("""() => [...document.querySelectorAll('#note-ed .gd-fmt .gd-b, #note-ed .gd-fmt .gd-div')].map(b => { const q = b.getBoundingClientRect(), s = b.querySelector('svg, .gd-t, .gd-a'), sr = s ? s.getBoundingClientRect() : { width: 0, height: 0 };
                return { k: b.dataset.fmt || 'div', x: q.x + q.width / 2, h: q.height, glyph: Math.max(sr.width, sr.height), op: getComputedStyle(b).opacity }; })""")
            want = [("bold", 23), ("italic", 68), ("underline", 114), ("color", 160), ("highlight", 206), ("div", 234), ("align", 260), ("div", 299), ("bullet", 323)]
            for (k, x), got in zip(want, bar):
                assert got["k"] == k and abs(got["x"] - x) <= 4, (k, x, got)
                if k != "div": assert got["glyph"] >= 18 and got["op"] == "1", got
            pin = await ph.evaluate("() => { const p = document.querySelector('#note-ed .gd-pin').getBoundingClientRect(), b = document.querySelector('#note-ed [data-fmt=textfmt]').getBoundingClientRect(); return { l: p.left, r: p.right, c: b.x + b.width / 2, h: p.height }; }")
            assert abs(pin["l"] - 329) <= 4 and abs(pin["r"] - 390) <= 1 and abs(pin["c"] - 356) <= 4 and pin["h"] == 52, pin
            assert {"num", "todo", "indent", "clear"} <= {x["k"] for x in bar}, "more items scroll under the pinned cell"
            # rides on the keyboard: fixed at the bottom, above a simulated on-screen keyboard (visualViewport)
            await ph.click("#note-text")
            pos = await ph.evaluate("() => { const w = document.querySelector('#note-ed .gd-fmt-wrap'); const r = w.getBoundingClientRect(); return { pos: getComputedStyle(w).position, bottom: r.bottom, h: innerHeight }; }")
            assert pos["pos"] == "fixed" and abs(pos["bottom"] - pos["h"]) <= 1, pos
            await ph.evaluate("""() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 500 }); Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 }); vv.dispatchEvent(new Event('resize')); }""")
            await ph.wait_for_timeout(100)
            pos = await ph.evaluate("() => { const w = document.querySelector('#note-ed .gd-fmt-wrap'); const r = w.getBoundingClientRect(); return { pos: getComputedStyle(w).position, top: r.top, bottom: r.bottom, vis: r.height > 0 && document.activeElement.id === 'note-text' }; }")
            assert pos["pos"] == "fixed" and abs(pos["bottom"] - 500) <= 1 and pos["vis"], pos
            await ph.evaluate("() => { const vv = window.visualViewport; delete vv.height; delete vv.offsetTop; vv.dispatchEvent(new Event('resize')); }")
            # bold toggles the active state
            await ph.evaluate("() => { const ta = document.querySelector('#note-text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }")
            await ph.keyboard.press("Enter"); await ph.keyboard.type("Mulch the roots")
            await select(ph, "roots", ta="#note-text")
            await ph.wait_for_timeout(50)
            assert await ph.get_attribute("#note-ed .gd-fmt [data-fmt=bold]", "aria-pressed") != "true"
            await ph.click("#note-ed .gd-fmt [data-fmt=bold]")
            assert (await value(ph, "#note-text")).endswith("Mulch the **roots**")
            on = await ph.evaluate("() => { const b = document.querySelector('#note-ed .gd-fmt [data-fmt=bold]'), g = b.querySelector('.gd-g').getBoundingClientRect(); return { on: b.classList.contains('on'), bg: getComputedStyle(b.querySelector('.gd-g')).backgroundColor, w: g.width, h: g.height }; }")
            assert on["on"] and on["bg"] == text_rgb and round(on["w"]) == 30 and round(on["h"]) == 34, on
            await ph.click("#note-ed .gd-fmt [data-fmt=bold]")
            assert (await value(ph, "#note-text")).endswith("Mulch the roots")
            assert not await ph.evaluate("document.querySelector('#note-ed .gd-fmt [data-fmt=bold]').classList.contains('on')")
            # A≡: the Text / Paragraph panel
            await ph.click("#note-ed [data-fmt=textfmt]")
            await ph.wait_for_selector(".dl-sheet .dl-tabs2 [data-tab=text].on")
            assert await ph.locator(".dl-sheet .dl-tabs2 [role=tab]").all_inner_texts() == ["Text", "Paragraph"]
            assert await ph.locator(".dl-sheet .dl-styles .dl-mi").all_inner_texts() == ["Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "Normal text"]
            await ph.click(".dl-sheet .dl-styles [data-op=h1]")
            assert (await value(ph, "#note-text")).endswith("\n## Mulch the roots"), await value(ph, "#note-text")
            await ph.click(".dl-sheet [data-tab=para]")
            await ph.wait_for_selector(".dl-sheet [data-op=center]")
            await ph.click(".dl-sheet [data-op=center]")
            assert (await value(ph, "#note-text")).endswith("\n## {center} Mulch the roots"), await value(ph, "#note-text")
            assert await ph.locator(".dl-sheet [data-lh]").all_inner_texts() == ["1", "1.15", "1.5", "2"]
            await ph.click(".dl-sheet [data-op=left]")
            await ph.click(".dl-sheet [data-close]")
            await ph.wait_for_selector(".dl-sheet-wrap", state="detached")
            # text color palette (our swatches + none), + Insert, ⋮ More (with #note-del), Ask AI options
            await select(ph, "sage", ta="#note-text")
            await ph.click("#note-ed .gd-fmt [data-fmt=color]")
            await ph.click(".dl-sheet .dl-sw[data-c=teal]")
            assert "**Silver** {teal}sage{/} glows" in await value(ph, "#note-text")
            await ph.click("#note-ed .gd-head [data-act=plus]")
            assert await ph.locator(".dl-sheet .dl-li").all_inner_texts() == ["Link", "Table", "Horizontal line", "Checklist", "Code block", "Table of contents"]
            await ph.click(".dl-sheet [data-close]")
            await ph.click("#note-ed .gd-head [data-act=more]")
            assert await ph.locator(".dl-sheet .dl-li").all_inner_texts() == ["Find and replace", "Share & export", "Outline", "View Markdown", "Details", "Rename", "Delete"]
            assert await ph.locator(".dl-sheet #note-del").count() == 1
            await ph.click(".dl-sheet .dl-li:has-text('Find and replace')")
            await ph.fill("#dl-find-q", "sage"); await ph.fill("#dl-find-r", "thyme"); await ph.click("#dl-find-all")
            assert "{teal}thyme{/}" in await value(ph, "#note-text")
            await ph.click(".dl-sheet [data-close]")
            await ph.click("#note-ed .gd-head [data-act=sparkle]")
            assert await ph.locator(".dl-sheet .dl-chip").all_inner_texts() == ["Summarize", "Help me write", "Tidy up"]
            await ph.click(".dl-sheet [data-close]")
            sw = await ph.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            assert sw[0] <= sw[1], f"sideways scroll in the phone note editor: {sw}"
            await ph.evaluate("() => { const ta = document.querySelector('#note-text'); ta.focus(); const i = ta.value.indexOf('Silver'); ta.setSelectionRange(i + 2, i + 2); ta.dispatchEvent(new Event('keyup')); }")
            await ph.wait_for_timeout(3500)   # let the "Replaced" toast go
            await ph.screenshot(path=str(SHOTS / "doc-editor-phone.png"))
            await ph.click("#note-done")
            await ph.wait_for_selector("#note-ed", state="detached")
            notes = api("/scratch", token=host_tok)["notes"]
            assert any("{teal}thyme{/}" in n["text"] for n in notes), notes

            # a project doc on the phone: the same format bar (docks on the keyboard), Outline sheet, slash menu
            await ph.evaluate("TribeApp.show('docs')")
            await ph.wait_for_function("() => window.TribeDocs && TribeDocs.list().length", timeout=10000)
            await ph.evaluate("([s]) => TribeDocs.open(s)", [slug])
            await ph.wait_for_selector("#doc-body")
            assert await ph.locator(".dl-fmt").count() == 0 and await ph.locator("#dl-side").count() == 0, "no desktop toolbar or outline panel on phones"
            await ph.wait_for_selector("#doc-pane .gd-fmt[role=toolbar]", state="visible")
            await ph.wait_for_function("TribeDocs.live()", timeout=10000)
            await select(ph, "level.")
            await ph.click("#doc-pane .gd-fmt [data-fmt=bold]")
            assert "**level.**" in await value(ph), await value(ph)
            await select(ph, "Filler paragraph 9.", collapse="start")
            await ph.click("#doc-pane [data-fmt=textfmt]")
            await ph.click(".dl-sheet .dl-styles [data-op=h1]")
            await ph.click(".dl-sheet [data-close]")
            assert "\n## Filler paragraph 9.\n" in await value(ph)
            await ph.click("#dl-outline-btn")
            await ph.wait_for_selector(".dl-sheet .dl-ol-i:has-text('Filler paragraph 9.')")
            await ph.click(".dl-sheet .dl-ol-i:has-text('Launch')")
            await ph.wait_for_selector(".dl-sheet-wrap", state="detached")
            await ph.evaluate("() => { const ta = document.querySelector('#doc-body'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }")
            await ph.keyboard.press("Enter"); await ph.keyboard.type("/bul"); await ph.wait_for_selector("#doc-slash:not(.hidden)"); await ph.wait_for_timeout(150); await ph.keyboard.press("Enter"); await ph.keyboard.type("From the phone")
            assert (await value(ph)).endswith("\n- From the phone"), (await value(ph))[-40:]
            # while typing with the keyboard up, the bar docks on top of it
            await ph.evaluate("""() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 480 }); vv.dispatchEvent(new Event('resize')); }""")
            await ph.wait_for_timeout(100)
            dk = await ph.evaluate("() => { const w = document.querySelector('#doc-pane .gd-fmt-wrap'); return { d: w.classList.contains('docked'), pos: getComputedStyle(w).position, bottom: w.getBoundingClientRect().bottom }; }")
            assert dk["d"] and dk["pos"] == "fixed" and abs(dk["bottom"] - 480) <= 1, dk
            await ph.evaluate("() => { const vv = window.visualViewport; delete vv.height; vv.dispatchEvent(new Event('resize')); }")
            sw = await ph.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]")
            assert sw[0] <= sw[2] and sw[1] <= sw[2], f"sideways scroll on the phone: {sw}"
            await b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Doc editor test passed")


if __name__ == "__main__":
    asyncio.run(main())
