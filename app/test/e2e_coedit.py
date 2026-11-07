"""Live co-editing in Docs: three members open the same doc; two type at the same time at different spots
(a third joins in), every textarea and the file on disk converge to the same text, remote carets and the
"Editing now" roster show up, and a REST write made mid-typing merges in instead of conflicting.
Usage: python app/test/e2e_coedit.py [--shots]"""
import asyncio, json, re, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4793 + int(__import__('os').environ.get('TRIBE_PORT_OFFSET', '0'))  # offset lets parallel runs coexist
BASE = f"http://localhost:{PORT}"
take = "--shots" in sys.argv
errors = []

HOST_TEXT = " Host adds a sentence while Maya types below."
MAYA_TEXT = " Maya writes the closing words at the same time."
JAY_TEXT = "Jay: "


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


def file_body(tmp, slug):
    text = Path(tmp, "docs", slug + ".md").read_text()
    m = re.match(r"^---\n([\s\S]*?)\n---\n?([\s\S]*)$", text)
    meta = {k.strip(): v.strip() for k, v in (l.split(":", 1) for l in m.group(1).splitlines() if ":" in l)}
    return m.group(2).strip(), meta


async def open_as(browser, name, token):
    ctx = await browser.new_context(viewport={"width": 1600, "height": 1000})
    page = await ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
    page.on("console", lambda m: m.type == "error" and "11434" not in m.text and "localhost:9" not in m.text and "ERR_CONNECTION_REFUSED" not in m.text and "api.github.com" not in m.text and "ERR_NAME_NOT_RESOLVED" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"{name} console: {m.text}"))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    # keep a handle on sockets so the test can cut the connection
    await page.add_init_script("(() => { const W = window.WebSocket; window.__socks = []; window.WebSocket = function (...a) { const s = new W(...a); window.__socks.push(s); return s; }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3, CONNECTING: 0, CLOSING: 2 }); })()")
    await page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    await page.goto(BASE)
    await page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=10000)
    return page


async def open_doc(page, title):
    await page.click('[data-nav="docs"]:visible')
    await page.wait_for_function("([t]) => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg=[title], timeout=10000)
    await page.wait_for_function("TribeDocs.live()", timeout=10000)


async def put_caret(page, after):
    """Click into the editor and put the caret right after the first occurrence of `after` (or at the end)."""
    await page.click("#doc-body")
    await page.evaluate("""([after]) => { const ta = document.querySelector('#doc-body'); ta.focus();
        const i = after === null ? ta.value.length : ta.value.indexOf(after) + after.length; ta.setSelectionRange(i, i); }""", [after])


async def type_chunks(page, text, chunk=4, delay=12):
    for i in range(0, len(text), chunk):
        await page.keyboard.type(text[i:i + chunk], delay=delay)
        await asyncio.sleep(0.01)


async def converged(pages, slug, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        vals = [await p.evaluate("([s]) => { const d = TribeCoedit.debug(s); return { v: document.querySelector('#doc-body').value, st: d && d.state }; }", [slug]) for p in pages]
        if all(v["st"] == "synchronized" for v in vals) and len({v["v"] for v in vals}) == 1:
            return vals[0]["v"]
        await asyncio.sleep(0.1)
    raise AssertionError("textareas did not converge: " + json.dumps(vals, indent=1))


async def main():
    tmp = tempfile.mkdtemp(prefix="tribe-co-")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Co-edit Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"})["token"]
        jay_tok = api("/join", "POST", {"code": code, "name": "Jay", "color": "#38C6B1"})["token"]
        doc = api("/docs", "POST", {"title": "Sprint notes", "body": "## Plan\nIntro line.\n\nMiddle paragraph stays put.\n\nEnd line."}, token=host_tok)["doc"]
        slug = doc["slug"]

        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host, maya, jay = await asyncio.gather(open_as(b, "Orion", host_tok), open_as(b, "Maya", maya_tok), open_as(b, "Jay", jay_tok))
            for pg in (host, maya, jay):
                await open_doc(pg, "Sprint notes")

            # everyone sees who else is here
            await host.wait_for_function("document.querySelector('#doc-peers').textContent.includes('Editing now:') && document.querySelector('#doc-peers').textContent.includes('Maya') && document.querySelector('#doc-peers').textContent.includes('Jay')", timeout=8000)
            await maya.wait_for_function("document.querySelector('#doc-peers').textContent.includes('Orion')", timeout=8000)

            # ---- two people type at the same time, at different spots ----
            await put_caret(host, "Intro line.")
            await put_caret(maya, None)
            await put_caret(jay, "Middle paragraph")
            await asyncio.gather(type_chunks(host, HOST_TEXT, 3, 10), type_chunks(maya, MAYA_TEXT, 4, 14))
            text = await converged([host, maya, jay], slug)
            assert "Intro line." + HOST_TEXT + "\n" in text, text
            assert text.endswith("End line." + MAYA_TEXT), text
            assert text.count("Host adds") == 1 and text.count("Maya writes") == 1, text

            # ---- a second round: interleaved at nearby spots, the host's inserts shift Maya's positions ----
            await put_caret(host, "## Plan")
            await put_caret(maya, "Intro line.")
            await asyncio.gather(type_chunks(host, " (week 12)", 2, 15), type_chunks(maya, " [ok]", 1, 20))
            text = await converged([host, maya, jay], slug)
            assert text.startswith("## Plan (week 12)\nIntro line. [ok]" + HOST_TEXT), text

            # the file on disk catches up (debounced persist) and matches what everyone sees
            for _ in range(60):
                body, meta = file_body(tmp, slug)
                if body == text.strip(): break
                await asyncio.sleep(0.1)
            assert body == text.strip(), (body, text)
            assert int(meta["version"]) > 1, meta

            # ---- remote carets: each side shows the other's caret with a name label, at the right place ----
            await jay.click("#doc-body")
            await jay.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('Middle paragraph'); ta.focus(); ta.setSelectionRange(i, i); }")
            await jay.keyboard.type(JAY_TEXT, delay=20)
            await host.wait_for_function("[...document.querySelectorAll('.co-label')].some(e => e.textContent === 'Maya')", timeout=8000)
            await host.wait_for_function("[...document.querySelectorAll('.co-label')].some(e => e.textContent === 'Jay')", timeout=8000)
            await maya.wait_for_function("[...document.querySelectorAll('.co-label')].some(e => e.textContent === 'Orion')", timeout=8000)
            text = await converged([host, maya, jay], slug)
            assert "\n\nJay: Middle paragraph" in text, text
            maya_pos = await maya.evaluate("document.querySelector('#doc-body').selectionEnd")
            jay_pos = await jay.evaluate("document.querySelector('#doc-body').selectionEnd")
            await host.wait_for_function("([m, j]) => { const c = TribeCoedit.debug(document.querySelector('.doc-item.on').dataset.slug).cursors;"
                                         " return c.some(x => x.name === 'Maya' && x.pos === m) && c.some(x => x.name === 'Jay' && x.pos === j); }", arg=[maya_pos, jay_pos], timeout=5000)
            # label sits on the caret, and the caret is drawn flat (no shadow/filter)
            style = await host.evaluate("""() => { const c = [...document.querySelectorAll('.co-caret')].find(e => e.textContent === 'Maya'); const cs = getComputedStyle(c), ls = getComputedStyle(c.firstChild);
                return { w: cs.width, shadow: cs.boxShadow + ls.boxShadow, filter: cs.filter + ls.filter, bg: cs.backgroundColor }; }""")
            assert style["w"] == "2px" and style["shadow"] == "nonenone" and style["filter"] == "nonenone", style
            assert style["bg"] == "rgb(108, 124, 255)", style

            # ---- the local selection survives remote edits above it ----
            await host.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('End line.'); ta.focus(); ta.setSelectionRange(i, i + 3); }")
            await maya.evaluate("() => { const ta = document.querySelector('#doc-body'); ta.focus(); ta.setSelectionRange(0, 0); }")
            await maya.keyboard.type("Top! ", delay=10)
            text = await converged([host, maya, jay], slug)
            sel = await host.evaluate("() => { const ta = document.querySelector('#doc-body'); return ta.value.slice(ta.selectionStart, ta.selectionEnd); }")
            assert sel == "End", sel

            # ---- a REST write (e.g. a script or agent) while Maya is typing merges instead of conflicting ----
            await put_caret(maya, "Middle paragraph stays put.")
            typing = asyncio.create_task(type_chunks(maya, " Still typing.", 2, 25))
            await asyncio.sleep(0.15)
            d = api("/docs/" + slug, token=host_tok)["doc"]
            r = api("/docs/" + slug, "PUT", {"title": d["title"], "body": d["body"] + "\n\nAppended by the API.", "baseVersion": d["version"]}, token=host_tok)
            assert "Appended by the API." in r["doc"]["body"], r
            await typing
            text = await converged([host, maya, jay], slug)
            assert "Middle paragraph stays put. Still typing." in text and text.endswith("Appended by the API."), text
            await maya.wait_for_function("document.body.textContent.includes('changed this doc outside the editor')", timeout=5000)

            # ---- connection drops mid-typing: edits made offline sync after the reconnect ----
            await put_caret(maya, "Still typing.")
            await maya.evaluate("() => window.__socks.at(-1).close()")
            await type_chunks(maya, " Typed offline.", 3, 10)
            await put_caret(host, "Top!")
            await type_chunks(host, " Host meanwhile.", 3, 10)
            await maya.wait_for_function("TribeDocs.live()", timeout=10000)
            text = await converged([host, maya, jay], slug)
            assert "Still typing. Typed offline." in text and "Top! Host meanwhile." in text, text

            # ---- title edits ride the live session too ----
            await maya.fill("#doc-title", "Sprint notes v2")
            await host.wait_for_function("document.querySelector('#doc-title').value === 'Sprint notes v2'", timeout=8000)

            for _ in range(60):
                body, meta = file_body(tmp, slug)
                if body == text.strip() and "Sprint notes v2" in meta.get("title", ""): break
                await asyncio.sleep(0.1)
            assert body == text.strip(), (body, text)
            assert "Sprint notes v2" in meta["title"], meta

            if take:
                # Maya and Jay park their carets on visible lines; screenshot the host's view with both remote carets.
                await maya.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('Host adds') + 4; ta.focus(); ta.setSelectionRange(i, i); }")
                await maya.keyboard.press("End")
                await jay.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('Still typing.') + 'Still typing.'.length; ta.focus(); ta.setSelectionRange(i, i); }")
                await jay.keyboard.press("ArrowLeft"); await jay.keyboard.press("ArrowRight")
                await host.evaluate("() => { const ta = document.querySelector('#doc-body'); const i = ta.value.indexOf('Middle'); ta.focus(); ta.setSelectionRange(i, i); }")
                await host.wait_for_timeout(600)
                await host.screenshot(path=str(ROOT / "docs" / "screenshots" / "docs-coedit.png"))

            # ---- leaving: the roster updates and the file has everything ----
            await jay.close()
            await host.wait_for_function("!document.querySelector('#doc-peers').textContent.includes('Jay')", timeout=8000)
            await host.wait_for_function("![...document.querySelectorAll('.co-label')].some(e => e.textContent === 'Jay')", timeout=8000)
            await b.close()
        body, _ = file_body(tmp, slug)
        assert body == text.strip(), (body, text)
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Co-edit test passed")


if __name__ == "__main__":
    asyncio.run(main())
