"""One Flint chat everywhere (feat/flint-unify): TribeFlint.mount(el, { ctx }) in the website designer, the design canvas
and the live preview, plus a sample of Flint's new free commands run end to end.

  The same component (thread, composer, chips) in the designer, the canvas and the preview, with chips that fit each
  context, and none of the old chat boxes in the DOM (#wdz-log/#wdz-in/#wdz-chips, #fp-log/#fp-in, #pvf-feed/#pvf-in).
  Designer: "add a link for my book club" adds a link item and asks for the address; the reply sets it; Undo (the
  message's button and the designer's) takes it back. 14 more designer commands, then a clarifying question for what
  Flint didn't get (no AI card) and the AI card for real generation.
  Canvas: add shapes and text, align, group, duplicate, lock, order, resize, rename a layer; the message's Undo.
  App-wide (in the preview's Flint and the main Flint): a timer and its undo, animations off and on, pin and react to
  the last chat message, reopen / make urgent / unassign a task, appear away and back, clear the thread.
  390px: the designer, canvas and preview chats fit with no sideways scroll. No console errors.
Usage: python app/test/e2e_flint_unify.py [--shots]   (--shots writes docs/screenshots/flint-unified-*.png)
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5540 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
errors, ran = [], []
OLD = ["#wdz-log", "#wdz-in", "#wdz-chips", "#wdz-form", "#fp-log", "#fp-in", "#fp-chips", "#fp-form", "#pvf-feed", "#pvf-in", "#pvf-chips", "#pvf-form"]


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def settings_js(name, token, pid):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); localStorage.setItem('tribecode.flint.tour', 'done'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def thread(ctx):
    return f"[data-flctx={ctx}] .fl-thread"


def fask(page, ctx, text, timeout=15000):
    """Type into that context's Flint composer, press Enter, wait for Flint's answer; return its text."""
    sel = thread(ctx) + " > :not(.streaming):not(.fl-empty)"
    n = page.locator(sel).count()
    page.fill(f"#flm-in-{ctx}", text)
    page.press(f"#flm-in-{ctx}", "Enter")
    js = """([s, t]) => { const all = [...document.querySelectorAll(s)], th = s.split(' > ')[0]; const me = [...document.querySelectorAll(th + ' > .fl-msg.me')].pop();
      return me && me.querySelector('.fl-t') && me.querySelector('.fl-t').textContent.trim() === t && all.length && !all[all.length - 1].classList.contains('me') && !document.querySelector(th + ' .streaming'); }"""
    try: page.wait_for_function(js, arg=[sel, text.strip()], timeout=timeout)
    except Exception:
        raise AssertionError(f"{ctx}: no answer to {text!r}; the thread ends: {page.locator(sel).all_inner_texts()[-3:]}")
    page.wait_for_timeout(250)
    ran.append(f"{ctx}: {text}")
    return page.locator(sel).last.inner_text()


def gask(page, text, timeout=10000):
    """Flint's main chat (TribeFlint.ask): wait for his reply."""
    n = page.evaluate("TribeFlint.thread().length")
    page.evaluate("t => TribeFlint.ask(t)", text)
    page.wait_for_function("n => { const t = TribeFlint.thread(); return t.length >= n + 2 && t[t.length - 1].who === 'flint' && !t[t.length - 1].streaming; }", arg=n, timeout=timeout)
    page.wait_for_timeout(200)
    ran.append(f"app: {text}")
    t = page.evaluate("TribeFlint.thread()")
    return " ".join(m["text"] for m in t[n:] if m["who"] == "flint")


def same_component(page, ctx):
    root = f"[data-flctx={ctx}].flint-mount"
    page.wait_for_selector(root, timeout=10000)
    for part in [".flm-head", ".fl-thread", ".flm-chips .fl-chip", "form.fl-bar", "input.fl-in", ".fl-send", "[data-flme]"]:
        assert page.locator(f"{root} {part}").count() >= 1, f"{ctx}: no {part}"
    for old in OLD:
        assert page.locator(old).count() == 0, f"{ctx}: the old chat box {old} is still in the DOM"
    return page.locator(f"{root} .flm-chips .fl-chip").all_inner_texts()


def cfg(page):
    return page.evaluate("TribeSiteDesigner.cfg()")


def links_block(page):
    return next(b for p in cfg(page)["pages"] for b in p["blocks"] if b["type"] == "links")


def shot(page, name):
    if SHOTS:
        out = ROOT / "docs" / "screenshots"; out.mkdir(parents=True, exist_ok=True)
        page.wait_for_timeout(500)
        page.evaluate("document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden'))")
        page.screenshot(path=str(out / name))


def fits(page, what):
    w = page.evaluate("document.documentElement.scrollWidth")
    assert w <= 392, f"{what}: sideways scroll ({w}px)"


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-unify-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Unify Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        tok = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap")["token"]
        pid = ok(api("/projects", token=tok))["projects"][0]["id"]
        ok(api("/chat/general", "POST", {"text": "the demo build is up"}, token=tok), "chat")
        logo = ok(api("/tasks", "POST", {"title": "Draw the logo"}, token=tok), "task")["task"]
        ok(api("/tasks", "POST", {"title": "Order samples"}, token=tok), "task")
        ok(api(f"/tasks/{logo['id']}", "PATCH", {"status": "done"}, token=tok), "done")

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}); ctx.add_init_script(settings_js("Mara", tok, pid))
            pg = ctx.new_page(); watch(pg, "mara")

            # ================= the website designer =================
            pg.goto(BASE + "/?skipIntro=1#/docs/website")
            pg.wait_for_function("window.TribeSiteDesigner && window.TribeFlint && TribeFlint.mount && window.TribeClient && TribeClient.connected()", timeout=20000)
            pg.wait_for_selector("#wb-design", timeout=15000); pg.click("#wb-design")
            pg.wait_for_selector("#wdz:not([hidden]) #wdz-start:not([hidden]) .wdz-tpl", timeout=10000)
            chips = same_component(pg, "designer")
            assert any("link" in c.lower() for c in chips) and any("buttons work" in c.lower() for c in chips), chips
            out = fask(pg, "designer", "link tree website")
            assert cfg(pg)["template"] == "linkbio", cfg(pg)["template"]
            chips = pg.locator("[data-flctx=designer] .flm-chips .fl-chip").all_inner_texts()
            assert "Add a link for…" in chips and "Add my Instagram" in chips, f"link-in-bio chips: {chips}"
            n0 = len(links_block(pg)["props"]["items"])

            # "add a link for my book club": a links-block item, then the address
            out = fask(pg, "designer", "add a link for my book club")
            items = links_block(pg)["props"]["items"]
            assert len(items) == n0 + 1 and items[-1]["label"] == "Book club" and not items[-1]["link"]["to"], items[-1]
            assert "address" in out.lower(), out
            assert pg.locator("[data-flctx=designer] .fl-thread .fl-msg.fl").last.locator(".fl-act", has_text="Leave it for now").count() == 1, "chips on the question"
            assert pg.evaluate("TribeSiteDesigner.state().pending.kind") == "url"
            out = fask(pg, "designer", "https://bookclub.example.com")
            assert links_block(pg)["props"]["items"][-1]["link"] == {"kind": "url", "to": "https://bookclub.example.com"}, links_block(pg)["props"]["items"][-1]
            assert "bookclub.example.com" in out, out
            assert "bookclub.example.com" in pg.frame_locator("#wdz-frame").locator("body").inner_html()
            # Undo: the message's button, then the designer's
            pg.locator("[data-flctx=designer] .fl-thread .fl-msg.fl").last.locator(".fl-act", has_text="Undo").click()
            pg.wait_for_function("() => { const c = TribeSiteDesigner.cfg(); const b = c.pages[0].blocks.find(x => x.type === 'links'); return !b.props.items[b.props.items.length - 1].link.to; }", timeout=4000)
            pg.click("[data-wdz='undo']")
            assert len(links_block(pg)["props"]["items"]) == n0, "Undo takes the link back"
            ran.append("designer: Undo (message) + Undo (toolbar)")
            # a link with the address in one go
            fask(pg, "designer", "add a link called Tickets to https://tix.example.com")
            it = links_block(pg)["props"]["items"][-1]
            assert it["label"] == "Tickets" and it["link"]["to"] == "https://tix.example.com", it
            fask(pg, "designer", "move the tickets link to the top")
            assert links_block(pg)["props"]["items"][0]["label"] == "Tickets"
            fask(pg, "designer", "add my instagram @mara.makes")
            assert any(s["link"]["to"] == "https://instagram.com/mara.makes" for s in links_block(pg)["props"]["socials"]), links_block(pg)["props"]["socials"]
            fask(pg, "designer", "remove the tickets link")
            assert not any(x["label"] == "Tickets" for x in links_block(pg)["props"]["items"])
            out = fask(pg, "designer", "add an email me button")
            assert "address" in out.lower() and pg.evaluate("TribeSiteDesigner.state().pending.kind") == "email", out
            fask(pg, "designer", "mara@example.com")
            assert any(x["link"] == {"kind": "email", "to": "mara@example.com"} for x in links_block(pg)["props"]["items"])
            fask(pg, "designer", "change my bio to potter and part time dj")
            assert links_block(pg)["props"]["bio"] == "Potter and part time dj"
            fask(pg, "designer", "add a faq: do you ship abroad? yes, everywhere")
            faq = next(b for b in cfg(pg)["pages"][0]["blocks"] if b["type"] == "faq")
            assert faq["props"]["items"][-1]["q"] == "Do you ship abroad?" and faq["props"]["items"][-1]["a"].startswith("Yes"), faq["props"]["items"]
            fask(pg, "designer", "change the faq title to Good questions")
            assert next(b for b in cfg(pg)["pages"][0]["blocks"] if b["type"] == "faq")["props"]["title"] == "Good questions"
            fask(pg, "designer", "make the faq section teal")
            assert next(b for b in cfg(pg)["pages"][0]["blocks"] if b["type"] == "faq").get("style", {}).get("tint", "").lower() == "#38c6b1"
            fask(pg, "designer", "add a pro plan for $19")
            pr = next(b for b in cfg(pg)["pages"][0]["blocks"] if b["type"] == "pricing")
            assert pr["props"]["plans"][-1]["name"] == "Pro" and pr["props"]["plans"][-1]["price"] == "$19"
            fask(pg, "designer", "footer should say made with love in leeds")
            assert next(b for b in cfg(pg)["pages"][0]["blocks"] if b["type"] == "footer")["props"]["text"] == "made with love in leeds"
            r0 = cfg(pg)["theme"]["radius"]
            fask(pg, "designer", "rounder corners pls")
            assert cfg(pg)["theme"]["radius"] > r0
            fask(pg, "designer", "add Shop to the menu")
            assert [x["title"] for x in cfg(pg)["pages"]][-1] == "Shop"
            fask(pg, "designer", "show where we are on a map, 12 harbor st")
            assert any(b["type"] == "cta" and b["props"]["title"] == "Find us" and "12 harbor st" in b["props"]["text"] for p in cfg(pg)["pages"] for b in p["blocks"])
            # not understood: a short question with chips, not the AI card
            out = fask(pg, "designer", "blorp the frobnicator")
            last = pg.locator("[data-flctx=designer] .fl-thread .fl-msg.fl").last
            assert last.locator(".boost").count() == 0 and last.locator(".fl-act").count() >= 2, out
            # real generation: the AI card
            fask(pg, "designer", "write a heartfelt paragraph about why pottery matters")
            assert pg.locator("[data-flctx=designer] .fl-thread .fl-msg.fl").last.locator(".boost").count() == 1, "the AI card for long copy"
            # not a site edit: Flint's full brain, answered right here
            out = fask(pg, "designer", "add a task to photograph the new mugs")
            assert "photograph the new mugs" in out.lower() and any(t["title"].lower().startswith("photograph the new mugs") for t in ok(api("/tasks", token=tok))["tasks"]), out
            pg.evaluate("document.querySelector('#wdz-pages .wdz-tab') && document.querySelector('#wdz-pages .wdz-tab').click()"); fask(pg, "designer", "add a link for my book club"); shot(pg, "flint-unified-designer.png")
            pg.click("[data-wdz='close']"); pg.wait_for_timeout(300)

            # ================= the design canvas =================
            pg.goto(BASE + "/?skipIntro=1&flintpane=1#/canvas")
            pg.wait_for_function("window.TribeCanvas && TribeCanvas.state().open", timeout=20000)
            pg.wait_for_selector("#cv-fpane [data-flctx=canvas]", timeout=10000); pg.wait_for_timeout(500)
            chips = same_component(pg, "canvas")
            assert "A login screen" in chips, chips
            nodes = lambda: pg.evaluate("TribeCanvas.state().nodes")
            fask(pg, "canvas", "add a rectangle")
            fask(pg, "canvas", "add a text that says hello")
            ns = nodes(); rect = next(n for n in ns if n["t"] == "rect"); txt = next(n for n in ns if n["t"] == "text" and n["tx"]["c"] == "hello")
            pg.evaluate("ids => TribeCanvas._e.select(ids)", [rect["id"], txt["id"]]); pg.wait_for_timeout(200)
            chips = pg.locator("[data-flctx=canvas] .flm-chips .fl-chip").all_inner_texts()
            assert "Align these to the left" in chips and "Group them" in chips, f"selection chips: {chips}"
            pg.evaluate("ids => TribeCanvas._e.patchMany(ids, n => { n.x = n.t === 'rect' ? 40 : 300; })", [rect["id"], txt["id"]])
            pg.wait_for_function("([a, b]) => { const x = TribeCanvas.box(a), y = TribeCanvas.box(b); return x && y && Math.abs(x.x - y.x) > 100; }", arg=[rect["id"], txt["id"]], timeout=5000)
            out = fask(pg, "canvas", "align these to the left")
            ns = {n["id"]: n for n in nodes()}
            assert ns[rect["id"]]["x"] == ns[txt["id"]]["x"], (ns[rect["id"]]["x"], ns[txt["id"]]["x"], out, pg.evaluate("TribeCanvas.state().selected"))
            out = fask(pg, "canvas", "group them")
            g = next(n for n in nodes() if n["t"] == "group")
            assert ns_parent(nodes(), rect["id"]) == g["id"], out
            pg.evaluate("id => TribeCanvas._e.select([id])", rect["id"])
            before = len(nodes())
            fask(pg, "canvas", "dupe this")
            assert len(nodes()) == before + 1, "duplicate"
            pg.evaluate("id => TribeCanvas._e.select([id])", rect["id"])
            fask(pg, "canvas", "lock this layer")
            assert next(n for n in nodes() if n["id"] == rect["id"]).get("lock") is True
            fask(pg, "canvas", "unlock it")
            assert not next(n for n in nodes() if n["id"] == rect["id"]).get("lock")
            fask(pg, "canvas", "resize it to 320 by 200")
            r = next(n for n in nodes() if n["id"] == rect["id"]); assert (r["w"], r["h"]) == (320, 200), (r["w"], r["h"])
            fask(pg, "canvas", "rename this layer to Header")
            assert next(n for n in nodes() if n["id"] == rect["id"])["name"] == "Header"
            fask(pg, "canvas", "send it to the back")
            # the message's Undo puts the old name back
            pg.locator("[data-flctx=canvas] .fl-thread .fl-msg.fl").nth(-2).locator(".fl-act", has_text="Undo").click()
            pg.wait_for_function("id => TribeCanvas.state().nodes.find(n => n.id === id).name !== 'Header'", arg=rect["id"], timeout=5000)
            ran.append("canvas: Undo (message)")
            pg.evaluate("TribeCanvas._e.fit(false)"); shot(pg, "flint-unified-canvas.png")

            # ================= the preview, and app-wide commands =================
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintCmds", timeout=15000)
            pg.evaluate("TribePreview.open()")
            pg.wait_for_selector("#pvf.is-open [data-flctx=preview]", timeout=10000)
            chips = same_component(pg, "preview")
            assert any(c in chips for c in ["Make the title bigger", "Add a score"]), chips
            out = fask(pg, "preview", "set a timer for 10 minutes")
            assert "10 minutes" in out and pg.evaluate("TribeFlintCmds.timers().length") == 1, out
            fask(pg, "preview", "undo")
            assert pg.evaluate("TribeFlintCmds.timers().length") == 0, "undo cancels the timer"
            fask(pg, "preview", "turn off animations")
            assert pg.evaluate("document.documentElement.dataset.motion") == "off"
            fask(pg, "preview", "bring back animations")
            assert pg.evaluate("document.documentElement.dataset.motion || ''") != "off"
            out = fask(pg, "preview", "pin the last message")
            assert "Pinned" in out, out
            assert any(m["text"] == "the demo build is up" for m in ok(api("/chat/general/pins", token=tok))["pins"]), "pinned on the host"
            out = fask(pg, "preview", "react thumbs up to the last message")
            msg = next(m for m in ok(api("/chat/general", token=tok))["messages"] if m.get("text") == "the demo build is up")
            assert "👍" in (msg.get("reactions") or {}), msg
            pg.evaluate("TribePreview.close && TribePreview.close()"); pg.wait_for_timeout(300)
            out = gask(pg, "reopen the logo task")
            assert next(t for t in ok(api("/tasks", token=tok))["tasks"] if t["id"] == logo["id"])["status"] != "done", out
            out = gask(pg, "make the logo task urgent")
            ts = ok(api("/tasks", token=tok))["tasks"]; col = [t for t in ts if t["status"] == next(x for x in ts if x["id"] == logo["id"])["status"]]
            assert min(col, key=lambda t: t.get("order") or 0)["id"] == logo["id"], out
            out = gask(pg, "appear away")
            assert pg.evaluate("TribePresence.prefs().away") is True, out
            gask(pg, "i'm back")
            assert pg.evaluate("TribePresence.prefs().away") is False
            pg.evaluate("TribeFlint.ask('clear our chat flint')"); ran.append("app: clear our chat flint")
            pg.wait_for_function("TribeFlint.thread().length === 1 && /Cleared/.test(TribeFlint.thread()[0].text)", timeout=8000)

            # ================= phones: 390px =================
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.add_init_script(settings_js("Mara", tok, pid))
            m = ph.new_page(); watch(m, "phone")
            m.goto(BASE + "/?skipIntro=1#/site-designer")
            m.wait_for_selector("#wdz:not([hidden]) [data-flctx=designer]", timeout=20000)
            if m.is_visible("#wdz-start"): m.evaluate("TribeSiteDesigner.useTemplate('linkbio')"); m.wait_for_timeout(600)
            m.locator("#flm-in-designer").scroll_into_view_if_needed()
            bx = m.eval_on_selector("[data-flctx=designer]", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 391, bx
            fits(m, "designer at 390")
            m.goto(BASE + "/?skipIntro=1#/canvas")
            m.wait_for_function("window.TribeCanvas && TribeCanvas.state().open", timeout=20000)
            m.evaluate("TribeCanvasFlintPane.open()"); m.wait_for_timeout(500)
            bx = m.eval_on_selector("#cv-fpane [data-flctx=canvas]", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 391 and m.is_visible("#flm-in-canvas"), bx
            fits(m, "canvas at 390")
            m.goto(BASE + "/?skipIntro=1"); m.wait_for_function("window.TribePreview && window.TribeClient && TribeClient.connected()", timeout=15000)
            m.evaluate("TribePreview.open()"); m.wait_for_selector("[data-flctx=preview]", state="attached", timeout=10000)
            m.evaluate("TribePreviewFlint.open()"); m.wait_for_timeout(500)
            bx = m.eval_on_selector("[data-flctx=preview]", "e => e.getBoundingClientRect().toJSON()")
            assert bx["left"] >= 0 and bx["right"] <= 391 and m.is_visible("#flm-in-preview"), bx
            fits(m, "preview at 390")
            b.close()

        bad = [e for e in errors if "favicon" not in e]
        assert not bad, "\n".join(bad[:8])
        print(f"e2e_flint_unify: OK ({len(ran)} commands run end to end: designer, canvas, preview and app-wide; same chat in 3 places; 390px)")
    finally:
        srv.terminate()


def ns_parent(nodes, nid):
    return next(n for n in nodes if n["id"] == nid).get("p")


if __name__ == "__main__":
    main()
