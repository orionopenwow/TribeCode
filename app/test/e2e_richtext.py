"""Rich text editing (app/ui/richtext.js): docs and notes are edited as formatted text while Markdown stays the format.

Desktop (1440px), a project doc:
- typing "# Hello" makes an H1-styled block, and the file the server stores is exactly the Markdown typed;
- Markdown shortcuts autoformat as you type: - / 1. / [] / > / ``` / --- blocks, **bold**, *italic*, `code`;
- the toolbar's bold / italic / underline / text color / highlight / align change the rich DOM and the Markdown;
- clicking a checkbox ticks it (- [x]) without moving the caret into the text;
- undo / redo (Ctrl+Z / Ctrl+Y and the toolbar) step through our own history;
- the round trip Markdown -> DOM -> Markdown is the identical string over a large corpus;
- pasting HTML with scripts, handlers and javascript: links leaves only the supported Markdown, nothing runs;
- ⋮ More > View Markdown shows the raw textarea, View formatted brings the rich editor back;
- two people typing into the same doc at the same time converge with no text lost (remote carets show);
- a 20k-word doc stays fast to type in.
Phone (390px): the format bar's bold works on the rich DOM, the bar rides on a simulated keyboard with the caret
kept above it, tapping a checkbox ticks it without focusing the editor, and nothing scrolls sideways; the personal
note editor is rich too.
Usage: python app/test/e2e_richtext.py   (screenshots: docs/screenshots/richtext-desktop.png, richtext-phone.png)
"""
import asyncio, json, os, random, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4975 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
errors = []


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
    page.on("dialog", lambda d: (errors.append(f"{name}: a dialog opened: {d.message}"), asyncio.ensure_future(d.dismiss())))
    settings = {"onboarded": True, "name": name, "server": {"url": BASE, "token": token}, "tour": {"done": True}, "checklist": {"setup": True, "tour": True}}
    await page.add_init_script(f"localStorage.setItem('tribecode.settings.v1', {json.dumps(json.dumps(settings))})")
    await page.goto(BASE + "/?skipIntro=1")
    await page.wait_for_function("document.querySelector('#sync-status') && document.querySelector('#sync-status').textContent.includes('connected')", timeout=15000)
    if await page.locator("#ins-later").count() and await page.locator("#ins-later").is_visible():
        await page.click("#ins-later")
    return page


async def open_doc(page, slug):
    await page.evaluate("TribeApp.show('docs')")
    await page.wait_for_function("([s]) => window.TribeDocs && TribeDocs.list().some(d => d.slug === s)", arg=[slug], timeout=10000)
    want = "([s]) => TribeDocs.current() && TribeDocs.current().slug === s && TribeDocs.live() && document.querySelector('#doc-body.rt')"
    for attempt in range(3):   # a list reload in flight can supersede an open(): ask again
        await page.evaluate("([s]) => TribeDocs.open(s)", [slug])
        try:
            await page.wait_for_function(want, arg=[slug], timeout=6000); return
        except Exception:
            if attempt == 2:
                print("open_doc state:", await page.evaluate("([s]) => ({ cur: TribeDocs.current() && TribeDocs.current().slug, live: TribeDocs.live(), el: document.querySelector('#doc-body') && document.querySelector('#doc-body').tagName })", [slug]))
                raise


async def value(page, sel="#doc-body"):
    return await page.evaluate("([s]) => document.querySelector(s).value", [sel])


async def select(page, text, sel="#doc-body", collapse=None):
    await page.evaluate("""([sel, t, c]) => { const ta = document.querySelector(sel); const i = ta.value.indexOf(t); if (i < 0) throw new Error('not found: ' + t);
        ta.focus(); if (c === 'start') ta.setSelectionRange(i, i); else if (c === 'end') ta.setSelectionRange(i + t.length, i + t.length); else ta.setSelectionRange(i, i + t.length); }""", [sel, text, collapse])


async def caret_end(page, sel="#doc-body"):
    await page.evaluate("([s]) => { const ta = document.querySelector(s); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }", [sel])


async def stored(slug, tok, want, timeout=8.0):
    end = time.time() + timeout
    body = None
    while time.time() < end:
        body = api("/docs/" + slug, token=tok)["doc"]["body"]
        if body == want: return body
        await asyncio.sleep(0.15)
    raise AssertionError(f"server body {body!r} != {want!r}")


async def converged(pages, slug, timeout=12.0):
    end = time.time() + timeout
    vals = []
    while time.time() < end:
        vals = [await p.evaluate("([s]) => { const d = TribeCoedit.debug(s); return { v: document.querySelector('#doc-body').value, st: d && d.state }; }", [slug]) for p in pages]
        if all(v["st"] == "synchronized" for v in vals) and len({v["v"] for v in vals}) == 1:
            return vals[0]["v"]
        await asyncio.sleep(0.1)
    raise AssertionError("editors did not converge: " + json.dumps(vals, indent=1)[:2000])


def corpus():
    """Every block and mark the toolbar, menus and shortcuts produce, plus awkward Markdown; then mixed documents."""
    lines = [
        "", "Plain text", "  leading spaces", "trailing spaces  ", "tab\tinside", "# Title", "## Heading 1", "### Heading 2", "#### Heading 3", "##### Subtitle", "###### six hashes",
        "#nospace", "#  two spaces", "## {center} Centered heading", "{center} Centered", "{right} Right", "{justify} Justified", "{left} Left", "{center} ",
        "**bold**", "*italic*", "++underline++", "~~strike~~", "`code`", "{teal}teal{/}", "{ember}ember text{/}", "==highlight==", "=={teal}teal mark==", "=={amber}amber==",
        "Mix **bold *nested* bold** and ++u++ with `a*b*c` code", "{indigo}**bold color**{/}", "**{rose}color in bold{/}**", "==**marked bold**==", "a **b** c *d* e ~~f~~ g",
        "[link](https://example.com)", "[**bold link**](https://example.com/path?q=1)", "see https://example.com/x and more", "[not a link](javascript:alert(1))",
        "- bullet", "* star bullet", "  - nested bullet", "    - deeper", "- [ ] todo", "- [x] done", "- [X] Done caps", "  - [ ] nested todo", "1. one", "2) paren", "10. ten", "  3. nested num",
        "> quote", ">tight quote", "> {center} centered quote", "---", "***", "___", " --- ",
        "unmatched **bold", "unmatched *em", "lone * star", "5 * 3 * 2", "**", "****", "a****b", "**a****b**", "***x***", "`", "``", "`unclosed", "==", "{teal}{/}", "{teal}open", "{/}", "++ spaced ++", "++a++b++",
        "<script>alert(1)</script>", "<b onclick=x>tag</b>", "&amp; &lt; \" '", "emoji 🌙 ünïcödé", "| not | a table", "|", "||",
        "[[Roadmap]] and @Maya", "[[task: Build camp]]", "\\*escaped\\*", "line with trailing backslash\\",
    ]
    blocks = [
        "```\ncode block\n```", "```js\nconst a = 1;\n\nlet b = `x`;\n```", "```\n```", "```\n\n```", "```\nunclosed fence\nstill code", "```", "```\n\nleading blank\n```",
        "| Column | Column |\n| --- | --- |\n|  |  |\n|  |  |", "| a | **b** |\n|---|---|\n| c | d |  ", "|x|y|\n| :-- | --: |", "| h |\n| --- |\n| r1 |\n| r2 |\nafter table",
    ]
    docs = list(lines) + blocks + ["\n".join(lines), "\n".join(blocks), "\n\n".join(lines[:30]), "a\n", "\n", "\n\n", "\na", "x\n\n\ny"]
    rnd = random.Random(7)
    pool = lines + blocks
    for _ in range(120):
        docs.append("\n".join(rnd.choice(pool) for _ in range(rnd.randint(2, 14))))
    return docs


async def main():
    tmp = tempfile.mkdtemp(prefix="tribe-rt-")
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Garden Crew", "--ollama", "http://localhost:9"], stdout=subprocess.DEVNULL, env=env)
    try:
        for _ in range(80):
            try: api("/health"); break
            except Exception: time.sleep(0.1)
        host_tok = api("/bootstrap", "POST", {"name": "Orion", "color": "#F26B1D"})["token"]
        code = api("/invites", "POST", {}, token=host_tok)["invite"]["code"]
        maya_tok = api("/join", "POST", {"code": code, "name": "Maya", "color": "#6C7CFF"})["token"]
        slug = api("/docs", "POST", {"title": "Moon garden", "body": ""}, token=host_tok)["doc"]["slug"]
        slug2 = api("/docs", "POST", {"title": "Planting plan", "body": "## Beds\nNorth bed gets the silver sage.\n\nSouth bed gets thyme.\n\n- [ ] Water weekly\n- [ ] Mulch\n\nLast line."}, token=host_tok)["doc"]["slug"]

        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            host = await open_as(b, "Orion", host_tok)
            await open_doc(host, slug)
            if await host.locator("#panel-close").count() and await host.locator("#panel-close").is_visible():
                await host.click("#panel-close")
            ed = "#doc-body"
            assert await host.evaluate("document.querySelector('#doc-body').tagName") == "DIV", "the editor is the rich surface"
            assert await host.evaluate("document.querySelector('#doc-body').isContentEditable")

            # ---------------- typing "# Hello" makes a heading; the stored Markdown is exact ----------------
            await host.click(ed)
            await host.keyboard.type("# Hello")
            h = await host.evaluate("""() => { const h = document.querySelector('#doc-body > h1.rt-h'), p = document.createElement('p'); p.className = 'rt-b rt-p'; p.textContent = 'x';
                document.querySelector('#doc-body').appendChild(p); const f = parseFloat(getComputedStyle(p).fontSize); p.remove();
                return h && { text: h.textContent, fs: parseFloat(getComputedStyle(h).fontSize), pfs: f, weight: getComputedStyle(h).fontWeight }; }""")
            assert h and h["text"] == "Hello" and h["fs"] > h["pfs"] * 1.5 and int(h["weight"]) >= 600, h
            assert "#" not in await host.inner_text(ed), "no raw Markdown markers while editing"
            await host.keyboard.press("Enter")
            await host.keyboard.type("The garden opens at **dusk** and the *moths* arrive with `lanterns`.")
            dom = await host.evaluate("() => { const b = document.querySelector('#doc-body'); return { strong: [...b.querySelectorAll('strong')].map(e => e.textContent), em: [...b.querySelectorAll('em')].map(e => e.textContent), code: [...b.querySelectorAll('code')].map(e => e.textContent), text: b.innerText }; }")
            assert dom["strong"] == ["dusk"] and dom["em"] == ["moths"] and dom["code"] == ["lanterns"] and "**" not in dom["text"] and "`" not in dom["text"], dom
            # typing after a closed mark continues as plain text
            assert "arrive with `lanterns`." in await value(host), await value(host)
            await stored(slug, host_tok, "# Hello\nThe garden opens at **dusk** and the *moths* arrive with `lanterns`.")

            # ---------------- block shortcuts ----------------
            await host.keyboard.press("Enter"); await host.keyboard.type("- silver sage"); await host.keyboard.press("Enter"); await host.keyboard.type("thyme")
            await host.keyboard.press("Enter"); await host.keyboard.press("Enter")   # an empty item ends the list (that line becomes normal text, like Google Docs)
            await host.keyboard.type("1. dig"); await host.keyboard.press("Enter"); await host.keyboard.type("plant"); await host.keyboard.press("Enter"); await host.keyboard.press("Enter")
            await host.keyboard.type("[] water"); await host.keyboard.press("Enter"); await host.keyboard.type("weed"); await host.keyboard.press("Enter"); await host.keyboard.press("Enter")
            await host.keyboard.type("> Night blooms need patience"); await host.keyboard.press("Enter"); await host.keyboard.press("Enter")
            await host.keyboard.type("---")
            await host.keyboard.type("```"); await host.keyboard.type("let lamp = 1;")
            await host.keyboard.press("Enter"); await host.keyboard.press("Enter")   # Enter on an empty last code line leaves the block
            await host.keyboard.type("## Plants")
            want = ("# Hello\nThe garden opens at **dusk** and the *moths* arrive with `lanterns`.\n- silver sage\n- thyme\n1. dig\n2. plant\n- [ ] water\n- [ ] weed\n"
                    "> Night blooms need patience\n---\n```\nlet lamp = 1;\n```\n## Plants")
            assert await value(host) == want, repr(await value(host))
            kinds = await host.evaluate("[...document.querySelectorAll('#doc-body > *')].map(e => e.className.replace('rt-b ', '').split(' ')[0] + (e.tagName.match(/^H\\d/) ? ':' + e.tagName : ''))")
            assert kinds == ["rt-h:H1", "rt-p", "rt-li", "rt-li", "rt-ol", "rt-ol", "rt-todo", "rt-todo", "rt-q", "rt-hr", "rt-code", "rt-h:H2"], kinds
            assert await host.evaluate("[...document.querySelectorAll('#doc-body > .rt-ol')].map(e => e.dataset.n).join(',')") == "1.,2."
            await stored(slug, host_tok, want)

            # ---------------- toolbar: bold / italic / underline / color / highlight / align ----------------
            await host.keyboard.press("Enter"); await host.keyboard.type("Silver sage glows under the full moon")
            await select(host, "glows")
            await host.click(".dl-fmt [data-fmt=bold]")
            assert "Silver sage **glows** under" in await value(host)
            assert await host.evaluate("[...document.querySelectorAll('#doc-body strong')].some(e => e.textContent === 'glows')")
            assert await host.get_attribute(".dl-fmt [data-fmt=bold]", "aria-pressed") == "true", "bold shows as on for the selection"
            await select(host, "full")
            await host.click(".dl-fmt [data-fmt=italic]")
            await select(host, "moon", collapse=None)
            await host.click(".dl-fmt [data-fmt=underline]")
            v = await value(host)
            assert v.endswith("Silver sage **glows** under the *full* ++moon++"), v
            await select(host, "Silver")
            await host.click(".dl-fmt [data-fmt=color]"); await host.click(".dl-sheet .dl-sw[data-c=teal]")
            await select(host, "under")
            await host.click(".dl-fmt [data-fmt=highlight]"); await host.click(".dl-sheet .dl-sw[data-c=amber]")
            v = await value(host)
            assert v.endswith("{teal}Silver{/} sage **glows** ==under== the *full* ++moon++"), v
            marks = await host.evaluate("() => { const b = document.querySelector('#doc-body'); return { tc: [...b.querySelectorAll('span.tc-teal')].map(e => e.textContent), hl: [...b.querySelectorAll('mark.hl-amber')].map(e => e.textContent), em: [...b.querySelectorAll('em')].map(e => e.textContent), u: [...b.querySelectorAll('u')].map(e => e.textContent) }; }")
            assert marks == {"tc": ["Silver"], "hl": ["under"], "em": ["moths", "full"], "u": ["moon"]}, marks
            await select(host, "Silver", collapse="start")
            await host.click(".dl-fmt [data-fmt=align]"); await host.click(".dl-sheet .dl-li:has-text('Center')")
            assert (await value(host)).endswith("\n{center} {teal}Silver{/} sage **glows** ==under== the *full* ++moon++")
            assert await host.evaluate("document.querySelector('#doc-body > .rt-p.md-al-center') !== null && getComputedStyle(document.querySelector('#doc-body > .rt-p.md-al-center')).textAlign === 'center'")
            # the style menu makes a heading that looks like one
            await select(host, "The garden opens", collapse="start")
            await host.click(".dl-fmt .dl-style"); await host.click(".dl-menu [data-st=h2]")
            assert "\n### The garden opens at **dusk**" in await value(host)
            assert await host.evaluate("document.querySelector('#doc-body > h3.rt-h strong').textContent") == "dusk"
            await host.keyboard.press("Control+Alt+0")
            assert "\nThe garden opens at **dusk**" in await value(host)
            # Ctrl+B on a selection
            await select(host, "patience")
            await host.keyboard.press("Control+b")
            assert "> Night blooms need **patience**" in await value(host)

            # ---------------- checklist: a click ticks it, the caret stays out of the text ----------------
            await select(host, "Hello", collapse="end")
            await host.click("#doc-body > .rt-todo .rt-cb")
            assert "- [x] water\n- [ ] weed" in await value(host)
            assert await host.evaluate("document.querySelector('#doc-body > .rt-todo').classList.contains('done')")
            assert await host.evaluate("document.querySelector('#doc-body').selectionStart") == len("# Hello"), "the caret did not move"
            await host.click("#doc-body > .rt-todo .rt-cb")
            assert "- [ ] water\n- [ ] weed" in await value(host)

            # ---------------- undo / redo ----------------
            await caret_end(host)
            await host.keyboard.press("Enter"); await host.keyboard.type("Fireflies")
            before = await value(host)
            await host.wait_for_timeout(1100)   # a pause starts a new undo group
            await host.keyboard.type(" everywhere")
            await host.keyboard.press("Control+z")
            assert await value(host) == before, (await value(host))[-60:]
            await host.keyboard.press("Control+y")
            assert (await value(host)).endswith("Fireflies everywhere")
            await host.click(".dl-fmt [data-fmt=undo]")
            assert await value(host) == before
            await host.click(".dl-fmt [data-fmt=redo]")
            assert (await value(host)).endswith("Fireflies everywhere")
            # Backspace at the start of a list item removes the bullet, then merges with the line above
            await select(host, "thyme", collapse="start")
            await host.keyboard.press("Backspace")
            assert "- silver sage\nthyme\n" in await value(host)
            await host.keyboard.press("Backspace")
            assert "- silver sagethyme\n" in await value(host)
            await host.keyboard.press("Control+z"); await host.keyboard.press("Control+z")
            assert "- silver sage\n- thyme\n" in await value(host), await value(host)

            # ---------------- round trip: Markdown -> DOM -> Markdown, identical ----------------
            docs = corpus()
            bad = await host.evaluate("(docs) => docs.map((d, i) => [i, TribeRich.roundTrip(d)]).filter(([i, out]) => out !== docs[i]).slice(0, 5).map(([i, out]) => ({ want: docs[i], got: out }))", docs)
            assert not bad, "round trip changed the Markdown: " + json.dumps(bad, indent=1)[:3000]
            # the live editor too: set each doc as the value, read the DOM back
            bad = await host.evaluate("""(docs) => { const el = document.querySelector('#doc-body'), keep = el.value, out = [];
                for (const d of docs.slice(0, 160)) { el.value = d; const back = [...el.children].map(k => k._md).join('\\n'); if (back !== d) out.push({ want: d, got: back }); }
                el.value = keep; return out.slice(0, 5); }""", docs)
            assert not bad, json.dumps(bad, indent=1)[:3000]
            await converged([host], slug)

            # ---------------- paste: sanitized ----------------
            await caret_end(host)
            await host.keyboard.press("Enter")
            await host.evaluate("""() => { const dt = new DataTransfer();
                dt.setData('text/html', '<meta charset=utf-8><style>p{color:red}</style><p>Hi <b onclick="window.__xss=1">bold</b> <img src=x onerror="window.__xss=2"><script>window.__xss=3</script><a href="javascript:window.__xss=4">bad link</a> <a href="https://example.com">good link</a> <span style="font-style:italic">slanted</span></p><h2>Pasted heading</h2><ul><li>first</li><li>second</li></ul><iframe src="https://example.com"></iframe>');
                dt.setData('text/plain', 'plain fallback');
                document.querySelector('#doc-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
            await host.wait_for_timeout(300)
            v = await value(host)
            assert v.endswith("Hi **bold** bad link [good link](https://example.com) *slanted*\n## Pasted heading\n- first\n- second"), repr(v[-160:])
            safe = await host.evaluate("() => { const b = document.querySelector('#doc-body'); return { xss: window.__xss || 0, bad: b.querySelectorAll('script,img,iframe,style,[onclick],[onerror],a[href^=javascript]').length, html: b.innerHTML.includes('onerror') || b.innerHTML.includes('javascript:') }; }")
            assert safe == {"xss": 0, "bad": 0, "html": False}, safe
            # plain text with HTML in it stays text
            await host.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', ' <img src=x onerror="window.__xss=5">');
                document.querySelector('#doc-body').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
            assert (await value(host)).endswith('- second <img src=x onerror="window.__xss=5">')
            assert await host.evaluate("!window.__xss && !document.querySelector('#doc-body img')")
            await host.keyboard.press("Control+z"); await host.keyboard.press("Control+z")

            # ---------------- remote edits re-render without stealing the caret ----------------
            await select(host, "Fireflies", collapse="end")
            base = await value(host)
            cur = api("/docs/" + slug, token=host_tok)["doc"]
            api("/docs/" + slug, "PUT", {"title": cur["title"], "body": "Prepended by the API.\n" + cur["body"], "baseVersion": cur["version"]}, token=host_tok)
            await host.wait_for_function("document.querySelector('#doc-body').value.startsWith('Prepended by the API.')", timeout=8000)
            sel = await host.evaluate("() => { const ta = document.querySelector('#doc-body'); return { focus: document.activeElement === ta, before: ta.value.slice(0, ta.selectionStart).split('\\n').pop() }; }")
            assert sel["focus"] and sel["before"].endswith("Fireflies"), sel
            assert await host.evaluate("document.querySelector('#doc-body > .rt-p').textContent") == "Prepended by the API."

            # ---------------- View Markdown and back ----------------
            await host.click("#dx-more")
            await host.click(".tf-menu button:has-text('View Markdown')")
            await host.wait_for_function("document.querySelector('#doc-body').tagName === 'TEXTAREA'")
            raw = await host.input_value("#doc-body")
            assert raw.startswith("Prepended by the API.\n# Hello\n") and "**dusk**" in raw
            await host.click("#dx-more")
            await host.click(".tf-menu button:has-text('View formatted')")
            await host.wait_for_function("document.querySelector('#doc-body').tagName === 'DIV' && document.querySelector('#doc-body h1.rt-h')")

            # ---------------- two people typing at once converge ----------------
            maya = await open_as(b, "Maya", maya_tok)
            await open_doc(maya, slug)
            await host.wait_for_function("document.querySelector('#doc-peers') && document.querySelector('#doc-peers').textContent.includes('Maya')", timeout=8000)
            await select(host, "Night blooms need", collapse="end")
            await select(maya, "Fireflies everywhere", collapse="end")
            async def maya_types():
                for ch in [" — and owls", " hoot softly.", " Then **quiet**."]:
                    await maya.keyboard.type(ch, delay=14)
                await maya.keyboard.press("Enter"); await maya.keyboard.type("Maya's new line", delay=12)
            async def host_types():
                for ch in [" a lot of", " patience", " and time"]:
                    await host.keyboard.type(ch, delay=17)
            await asyncio.gather(host_types(), maya_types())
            text = await converged([host, maya], slug)
            assert "> Night blooms need a lot of patience and time **patience**" in text, text
            assert "Fireflies everywhere — and owls hoot softly. Then **quiet**.\n{center} Maya's new line" in text, text[-200:]
            # both editors show the same formatted DOM, and the host sees Maya's caret
            assert await host.evaluate("document.querySelector('#doc-body').innerHTML") == await maya.evaluate("document.querySelector('#doc-body').innerHTML")
            await host.wait_for_selector(".co-layer:not(.hidden) .co-caret", timeout=5000)
            for _ in range(60):
                if api("/docs/" + slug, token=host_tok)["doc"]["body"] == text: break
                await asyncio.sleep(0.15)
            assert api("/docs/" + slug, token=host_tok)["doc"]["body"] == text

            # screenshot: the rich editor on desktop
            await host.evaluate("document.querySelector('main') && (document.querySelector('main').scrollTop = 0)")
            await select(host, "Silver", collapse="end")
            await host.wait_for_timeout(600)
            await host.screenshot(path=str(SHOTS / "richtext-desktop.png"))
            await maya.close()

            # ---------------- a 20k-word doc stays fast ----------------
            big = "\n\n".join((f"## Section {i}\n" if i % 25 == 0 else "") + f"Paragraph {i} with **bold**, *italic* and a [link](https://example.com/{i}) " + "lorem ipsum dolor sit amet " * 6 for i in range(800))
            words = len(big.split())
            assert words >= 20000, words
            slug3 = api("/docs", "POST", {"title": "Big doc", "body": big}, token=host_tok)["doc"]["slug"]
            await open_doc(host, slug3)
            t_open = await host.evaluate("() => { const el = document.querySelector('#doc-body'), t = performance.now(); el.value = el.value + ' '; el.value = el.value.slice(0, -1); return performance.now() - t; }")
            await select(host, "Paragraph 400 with", collapse="end")
            per_key = await host.evaluate("""() => { const el = document.querySelector('#doc-body'), t = performance.now();
                for (let i = 0; i < 40; i++) el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }));
                return (performance.now() - t) / 40; }""")
            assert "Paragraph 400 with" + "x" * 40 in await value(host)
            assert per_key < 25, f"typing in a 20k-word doc takes {per_key:.1f} ms per key"
            print(f"20k words: re-render {t_open:.0f} ms, {per_key:.1f} ms per keystroke")

            # ---------------- phone (390px) ----------------
            ph = await open_as(b, "Orion", host_tok, phone=True)
            await open_doc(ph, slug2)
            await ph.wait_for_selector("#doc-pane .gd-fmt[role=toolbar]", state="visible")
            assert await ph.evaluate("document.querySelector('#doc-body > h2.rt-h').textContent") == "Beds"
            await select(ph, "silver sage")
            await ph.click("#doc-pane .gd-fmt [data-fmt=bold]")
            assert "North bed gets the **silver sage**." in await value(ph)
            assert await ph.evaluate("document.querySelector('#doc-body strong').textContent") == "silver sage"
            await select(ph, "thyme")
            await ph.click("#doc-pane .gd-fmt [data-fmt=italic]")
            await ph.click("#doc-pane .gd-fmt [data-fmt=underline]")
            assert "South bed gets *++thyme++*." in await value(ph) or "South bed gets ++*thyme*++." in await value(ph), await value(ph)
            # tapping a checkbox ticks it without focusing the editor (no keyboard)
            await ph.evaluate("document.activeElement && document.activeElement.blur()")
            await ph.tap("#doc-body > .rt-todo .rt-cb")
            await ph.wait_for_function("document.querySelector('#doc-body').value.includes('- [x] Water weekly')")
            assert await ph.evaluate("document.activeElement !== document.querySelector('#doc-body')"), "the checkbox tap did not open the keyboard"
            # the bar rides on a simulated keyboard and the caret stays above it
            await ph.evaluate("([s]) => { const el = document.querySelector('#doc-body'); el.value = el.value + '\\n' + Array.from({ length: 60 }, (_, i) => 'Row ' + i).join('\\n'); }", [slug2])
            await ph.tap("#doc-body > .rt-p")
            await ph.evaluate("""() => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable: true, get: () => 480 }); Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => 0 }); vv.dispatchEvent(new Event('resize')); }""")
            await ph.wait_for_timeout(150)
            await caret_end(ph)
            await ph.keyboard.type(" and more")
            await ph.wait_for_timeout(200)
            geo = await ph.evaluate("""() => { const w = document.querySelector('#doc-pane .gd-fmt-wrap'), r = w.getBoundingClientRect(), s = getSelection().getRangeAt(0).getClientRects()[0];
                return { docked: w.classList.contains('docked'), pos: getComputedStyle(w).position, top: r.top, bottom: r.bottom, caretTop: s ? s.top : null, caretBottom: s ? s.bottom : null }; }""")
            assert geo["docked"] and geo["pos"] == "fixed" and abs(geo["bottom"] - 480) <= 1, geo
            assert geo["caretBottom"] is not None and geo["caretBottom"] <= geo["top"] and geo["caretTop"] > 0, f"the caret is hidden behind the format bar: {geo}"
            sw = await ph.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]")
            assert sw[0] <= sw[2] and sw[1] <= sw[2], f"sideways scroll on the phone: {sw}"
            await ph.evaluate("() => { const vv = window.visualViewport; delete vv.height; delete vv.offsetTop; vv.dispatchEvent(new Event('resize')); }")
            await select(ph, "Beds", collapse="end")
            await ph.evaluate("document.querySelector('main') && (document.querySelector('main').scrollTop = 0); window.scrollTo(0, 0)")
            await ph.wait_for_timeout(400)
            await ph.screenshot(path=str(SHOTS / "richtext-phone.png"))

            # the personal note editor is rich too, and its ⋮ More has View Markdown
            await ph.evaluate("TribeHub.open('docs')")
            await ph.wait_for_selector("#dc-new", state="attached")
            await ph.evaluate("document.querySelector('#dc-new').click()")
            await ph.wait_for_selector("#note-ed #note-text.rt")
            await ph.fill("#note-title", "Night list")
            await ph.tap("#note-text")
            await ph.keyboard.type("## Owls\n[] Count the owls")
            assert await value(ph, "#note-text") == "## Owls\n- [ ] Count the owls", await value(ph, "#note-text")
            assert await ph.evaluate("!!document.querySelector('#note-text > h2.rt-h') && !!document.querySelector('#note-text > .rt-todo')")
            await ph.click("#note-ed .gd-head [data-act=more]")
            await ph.click(".dl-sheet #rt-view-md")
            await ph.wait_for_function("document.querySelector('#note-text') && document.querySelector('#note-text').tagName === 'TEXTAREA'")
            assert await ph.input_value("#note-text") == "## Owls\n- [ ] Count the owls"
            await ph.click("#note-ed .gd-head [data-act=more]")
            await ph.click(".dl-sheet #rt-view-md")
            await ph.wait_for_function("document.querySelector('#note-text').tagName === 'DIV'")
            sw = await ph.evaluate("[document.documentElement.scrollWidth, innerWidth]")
            assert sw[0] <= sw[1], sw
            await ph.click("#note-done")
            await ph.wait_for_selector("#note-ed", state="detached")
            assert any(n["text"] == "Night list\n## Owls\n- [ ] Count the owls" for n in api("/scratch", token=host_tok)["notes"])
            await b.close()
    finally:
        srv.terminate()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    print("Rich text test passed")


if __name__ == "__main__":
    asyncio.run(main())
