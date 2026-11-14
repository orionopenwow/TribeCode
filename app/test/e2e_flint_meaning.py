"""Flint's built-in search by meaning (feat/flint-meaning: app/ui/flintmeaning.js + flintwords.bin, flintnlu.js,
flintsem.js, flintlocal.js, server/flintkb.js). Nothing is downloaded from outside and no helper is installed:
  - the word table loads from the app's own files; the level stays "No AI"; the helper is not installed
  - Ctrl K finds a task, a doc, a chat message and a Guide page by meaning (no shared words); exact matches stay first
  - TribeMeaning.search(query, { scopes, limit }) and TribeMeaning.nearestIntent(text) work as documented
  - Flint: a paraphrase gets one "Did you mean this?" chip and nothing runs until it is tapped; a looser one gets the
    usual three; "find …" and "where did we talk about …" answer by meaning; a taught phrase in other words is offered
  - private messages are never indexed
  - a phone (390 px): the chip and the palette rows fit
  - the stand-in helper (the fixture model, NOT a trained model) stacks on the table behind the same API
Usage: python3 app/test/e2e_flint_meaning.py
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 7400 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
errors, outside = [], []


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ask(page, text):
    n = page.locator("#flint .fl-msg.fl").count()
    page.fill("#fl-input", text); page.press("#fl-input", "Enter")
    page.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n && !document.querySelector('#flint .fl-msg.streaming')", arg=n, timeout=20000)
    page.wait_for_timeout(300)
    last = page.locator("#flint .fl-msg.fl").last
    return last.text_content(), last.locator(".fl-act").all_text_contents()


def palette(page, q, keep=False):
    page.evaluate("TribePalette.open()"); page.wait_for_selector("#palette:not(.hidden)")
    page.fill("#pal-input", q); page.wait_for_timeout(1200)
    rows = page.eval_on_selector_all("#pal-list .pal-item", "els => els.map(e => [e.querySelector('.k').textContent, e.querySelector('.l').textContent, (e.querySelector('.h') || {}).textContent || ''])")
    if not keep: page.evaluate("TribePalette.close()")
    return rows


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flintmeaning-", dir="/tmp"))
    mdir = tmp / "model"; shutil.copytree(ROOT / "app" / "test" / "fixtures" / "flint-model", mdir)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FLINT_MODEL_DIR": str(mdir)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d; tok = d["token"]
        for t in ["Fix the crash on the title screen", "Draw the boss sprite", "Order pizza for the playtest evening"]:
            assert api("/tasks", "POST", {"title": t}, token=tok)[0] == 200
        assert api("/docs", "POST", {"title": "Budget for the launch", "body": "What everything will cost.\n"}, token=tok)[0] == 200
        assert api("/docs", "POST", {"title": "Welcome speech", "body": "Words for the opening night.\n"}, token=tok)[0] == 200
        assert api("/chat/general", "POST", {"text": "the photo of the boss is too dim"}, token=tok)[0] == 200
        assert api("/chat/general", "POST", {"text": "parking near the hall fills up early"}, token=tok)[0] == 200
        # the knowledge base answers on the server with the same table (no model)
        kb = api("/flint/kb?q=" + urllib.request.quote("how do i add a person to my tribe") + "&k=2", token=tok)[1]["answers"]; assert kb and kb[0]["snippet"], kb

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1,agents:1,invite:1,voice:1,docs:1,tasks:1,calendar:1,canvas:1,website:1,market:1,design:1}}));"
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(init)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("request", lambda r: (not r.url.startswith(BASE) and not r.url.startswith("data:") and not r.url.startswith("blob:")) and outside.append(r.url))
            got = []; pg.on("request", lambda r: ("flintwords.bin" in r.url or "/api/flint/model/file/" in r.url or "/chat/dm-" in r.url) and got.append(r.url.rsplit("/", 1)[1]))
            def go(page=pg):
                page.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                page.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMeaning && window.TribeNLU && window.TribePalette", timeout=30000)
                page.wait_for_selector("#fl-input", state="visible", timeout=20000)
                assert page.evaluate("TribeMeaning.ready()") is True
            go()

            # ---------- the table: from the app's own files, no helper, no outside request ----------
            stt = pg.evaluate("TribeMeaning.status()"); assert stt["level"] == "built-in" and stt["words"] > 20000, stt
            assert got == ["flintwords.bin"], got
            assert pg.evaluate("TribeNLU.hasSemantic()") is True and pg.evaluate("TribeFlintModel.installed()") is False
            assert pg.evaluate("!!TribeMeaning.model().cover && !TribeMeaning.model().helper")
            # recognized commands are exactly what they are with no table
            pair = pg.evaluate("(() => { const T = ['add a task to buy milk', 'open the calendar', 'switch to dark theme', 'summarize the chat', 'scrap that chore'], run = () => JSON.stringify(T.map(t => TribeNLU.parse(t, {}).steps.map(s => [s.intent, s.conf]))); const a = run(); TribeNLU.setSemantic(null); const z = run(); TribeNLU.setSemantic(TribeMeaning.model()); return [a, z]; })()")
            assert pair[0] == pair[1], "recognized commands parse the same with and without the table"

            # ---------- Ctrl K ----------
            rows = palette(pg, "spending"); assert any(r[0] == "Doc" and r[1] == "Budget for the launch" and "by meaning" in r[2] for r in rows), rows
            rows = palette(pg, "gloomy image"); assert any(r[0] == "Chat" and "photo of the boss" in r[1] and "by meaning" in r[2] for r in rows), rows
            rows = palette(pg, "repair the glitch"); assert any(r[0] == "Task" and r[1] == "Fix the crash on the title screen" and "by meaning" in r[2] for r in rows), rows
            rows = palette(pg, "fix the crash"); assert rows[0][1] == "Fix the crash on the title screen" and "by meaning" not in rows[0][2], rows
            assert len([r for r in rows if r[1] == "Fix the crash on the title screen"]) == 1, rows
            rows = palette(pg, "new task"); assert rows[0][1] == "New task", "commands rank as before"
            rows = palette(pg, "let a friend onto my phone"); assert any(r[0] == "Guide" and "by meaning" in r[2] for r in rows), rows

            # ---------- the API other features call ----------
            r = pg.evaluate("TribeMeaning.search('how much money', { scopes: ['doc'], limit: 3 }).then(h => h.map(x => [x.kind, x.label, typeof x.run, x.score > 0]))")
            assert r and r[0] == ["Doc", "Budget for the launch", "function", True] and all(x[0] == "Doc" for x in r), r
            r = pg.evaluate("TribeMeaning.search('opening remarks').then(h => h.map(x => [x.kind, x.label]))"); assert r and r[0] == ["Doc", "Welcome speech"], r
            r = pg.evaluate("TribeMeaning.search('how does a friend join from a phone', { scopes: ['guide'] }).then(h => h.map(x => x.kind))"); assert r and set(r) == {"Guide"}, r
            r = pg.evaluate("TribeMeaning.search('get rid of a job', { scopes: ['command'], limit: 5 }).then(h => h.map(x => x.intent))"); assert r and r[0] == "task.delete", r
            assert pg.evaluate("TribeMeaning.search('x')") == []
            ni = pg.evaluate("TribeMeaning.nearestIntent('trash that job')"); assert ni["intent"] == "task.delete" and ni["confident"] and ni["example"] and len(ni["alts"]) >= 1, ni
            ni = pg.evaluate("TribeMeaning.nearestIntent('digest of what people said')"); assert ni["intent"] == "chat.summarize" and not ni["confident"], ni
            ni = pg.evaluate("TribeMeaning.nearestIntent('open the calendar')"); assert ni["intent"] == "nav.calendar" and ni["confident"], ni
            assert pg.evaluate("TribeMeaning.nearestIntent('qzx vvbb')") is None

            # ---------- Flint: one confirm chip; nothing runs until it is tapped ----------
            tasks0 = len(api("/tasks", token=tok)[1]["tasks"])
            said, chips = ask(pg, "jobs with nobody on them")
            assert "Did you mean this?" in said and len(chips) == 1 and pg.evaluate("c => TribeNLU.parse(c, {}).steps[0].intent", chips[0]) == "task.unassigned", (said, chips)
            said, chips = ask(pg, "digest of what people said"); assert "one of these" in said.lower() and any("summar" in c for c in chips) and len(chips) > 1, (said, chips)
            assert len(api("/tasks", token=tok)[1]["tasks"]) == tasks0, "nothing ran"
            said, chips = ask(pg, "jobs with nobody on them"); n = pg.locator("#flint .fl-msg.fl").count()
            pg.locator("#flint .fl-msg.fl").last.locator(".fl-act").first.click()
            pg.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n", arg=n, timeout=20000)
            # ---------- find, and where did we talk ----------
            said, chips = ask(pg, "find the gloomy image"); assert "by meaning" in said and any(c.startswith("Chat · the photo of the boss") for c in chips) and "Search everything" in chips, (said, chips)
            said, chips = ask(pg, "where did we talk about the gloomy image?"); assert "(matched by meaning)" in said and any(c.startswith("Chat · the photo of the boss") for c in chips), (said, chips)
            # ---------- a taught phrase, said in other words ----------
            ask(pg, "when I say start the daily meeting, open the calendar")
            said, chips = ask(pg, "begin the morning meeting"); assert "start the daily meeting" in chips, (said, chips)
            # ---------- help answers ----------
            said, _ = ask(pg, "how do i invite a friend to a project?"); assert len(said) > 40, said

            # ---------- private messages are never indexed ----------
            kinds = pg.evaluate("(async () => { const C = TribeClient, real = C.api; const seen = []; C.api = (p, o) => { seen.push(p); return p === '/channels' ? real.call(C, p, o).then(r => ({ ...r, channels: [...(r.channels || []), { id: 'dm-aaa-bbb', name: 'dm-aaa-bbb' }] })) : real.call(C, p, o); }; try { const c = await TribeFlintModel.corpus(true); return [seen.filter(p => /dm-/.test(p)), [...new Set(c.map(x => x.kind))].sort(), seen.some(p => p === '/channels')]; } finally { C.api = real; } })()")
            assert kinds[0] == [] and kinds[2] and "Chat" in kinds[1] and "Task" in kinds[1], kinds
            assert not [g for g in got if g.startswith("dm-")], got

            # ---------- a phone ----------
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.add_init_script(init)
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append(str(e)))
            pp.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMeaning && window.TribePalette", timeout=30000)
            assert pp.evaluate("TribeMeaning.ready()") is True
            rows = palette(pp, "spending", keep=True); assert any(r[1] == "Budget for the launch" and "by meaning" in r[2] for r in rows), rows
            fit = pp.evaluate("(() => { const l = document.querySelector('#pal-list'), box = document.querySelector('#palette .pal-box, #palette > div') || l; return [document.documentElement.scrollWidth <= innerWidth + 1, l.scrollWidth <= l.clientWidth + 1, [...l.querySelectorAll('.pal-item')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)]; })()")
            assert fit == [True, True, True], fit
            pp.evaluate("TribePalette.close()")
            hits = pp.evaluate("TribeMeaning.search('gloomy image', { limit: 2 }).then(h => h.map(x => x.kind))"); assert hits and hits[0] == "Chat", hits
            ph.close()

            # ---------- the stand-in helper stacks on the table (the fixture is not a trained model) ----------
            pg.evaluate("TribeFlintModel.install()"); pg.wait_for_function("TribeFlintModel.ready()", timeout=30000)
            stt = pg.evaluate("TribeMeaning.status()"); assert stt["level"] == "helper", stt
            assert pg.evaluate("!!TribeMeaning.model().helper && !!TribeMeaning.model().cover && TribeNLU.hasSemantic()")
            r = pg.evaluate("TribeMeaning.search('how much money', { scopes: ['doc'], limit: 2 }).then(h => h.map(x => x.label))"); assert r and r[0] == "Budget for the launch", r
            rows = palette(pg, "spending"); assert any(r[1] == "Budget for the launch" and "by meaning" in r[2] for r in rows), rows
            pg.evaluate("TribeFlintModel.remove()"); pg.wait_for_function("TribeMeaning.status().level === 'built-in'", timeout=10000)
            assert pg.evaluate("TribeNLU.hasSemantic()") is True, "removing the helper leaves the built-in table on"
            b.close()
        bad = [u for u in outside if "localhost" not in u and "127.0.0.1" not in u and "fonts" not in u]
        assert not bad, bad
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_flint_meaning")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
