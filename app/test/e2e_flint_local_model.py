"""Flint's local helper, tier 1 (feat/build-feeds: app/ui/flintembed.js, flintmodel.js, server/flintmodel.js).
The host holds the fixture model (app/test/fixtures/flint-model, made by scripts/dev/flint-fixture-model.js), so the
whole opt-in flow runs with no outside network.
  - before: everything works, nothing is downloaded, the level is not active, no "by meaning" rows
  - "Set up a local model" on Flint's page: name, license, size, where it comes from, the Wi-Fi hint; Download with
    progress; the level turns Active; it survives a reload (IndexedDB)
  - "did you mean" for an unrecognized command now finds the right ability
  - the palette finds a task, a doc and a chat message by meaning (no shared words)
  - a how-to question still answers from the docs
  - Remove: gone from the device, the level is off, everything works exactly as before
  - a download that fails says so and installs nothing; a damaged model file is refused
--shots writes docs/screenshots/flint-local-model.png.
Usage: python3 app/test/e2e_flint_local_model.py [--shots]
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6500 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
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


def palette(page, q):
    page.evaluate("TribePalette.open()"); page.wait_for_selector("#palette:not(.hidden)")
    page.fill("#pal-input", q); page.wait_for_timeout(1200)
    rows = page.eval_on_selector_all("#pal-list .pal-item", "els => els.map(e => [e.querySelector('.k').textContent, e.querySelector('.l').textContent, (e.querySelector('.h') || {}).textContent || ''])")
    page.evaluate("TribePalette.close()")
    return rows


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flintmodel-", dir="/tmp"))
    mdir = tmp / "model"; shutil.copytree(ROOT / "app" / "test" / "fixtures" / "flint-model", mdir)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FLINT_MODEL_DIR": str(mdir)}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d; tok = d["token"]
        # the model's address: the host's own copy here; the documented one when the host has none
        info = api("/flint/model", token=tok)[1]
        assert info["hosted"] and info["name"] == "tribecode-fixture-64" and info["base"] == "/api/flint/model/file/" and info["bytes"] > 500000, info
        assert api("/flint/model")[0] == 401 and api("/flint/model/file/model.safetensors")[0] == 401, "members only"
        assert api("/flint/model/file/..%2F..%2Fpackage.json", token=tok)[0] == 404 and api("/flint/model/file/feed-key.json", token=tok)[0] == 404, "only the three model files"
        # things to find by meaning (none of the queries below shares a word with them)
        assert api("/tasks", "POST", {"title": "Fix the crash on the title screen"}, token=tok)[0] == 200
        assert api("/tasks", "POST", {"title": "Draw the boss sprite"}, token=tok)[0] == 200
        assert api("/docs", "POST", {"title": "Budget for the launch", "body": "What everything will cost.\n"}, token=tok)[0] == 200
        assert api("/chat/general", "POST", {"text": "the photo of the boss is too dim"}, token=tok)[0] == 200

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: 'Orion', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}})); localStorage.setItem('tribecode.brain', JSON.stringify('none')); localStorage.setItem('tribecode.flint.brain', 'none')")
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("request", lambda r: (not r.url.startswith(BASE) and not r.url.startswith("data:") and not r.url.startswith("blob:")) and outside.append(r.url))
            files = []; pg.on("request", lambda r: "/api/flint/model/file/" in r.url and files.append(r.url.rsplit("/", 1)[1]))
            def go():
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintModel && window.TribeNLU && window.TribeFlintPage && window.TribePalette", timeout=30000)
                pg.wait_for_selector("#fl-input", state="visible", timeout=20000)
            go()

            # ---------- before: no model, nothing downloaded, everything works ----------
            assert pg.evaluate("TribeFlintModel.status()") == {"ready": False, "installed": None}
            assert pg.evaluate("TribeNLU.hasSemantic()") is False
            base_parse = pg.evaluate("JSON.stringify(['add a task to buy milk', 'open the calendar', 'switch to dark theme', 'larger lettering', 'summarize the chat'].map(t => TribeNLU.parse(t, {}).steps.map(s => [s.intent, s.conf, s.alts])))")
            # ("larger lettering" itself is understood outright since feat/flint-local: flintconv.js rewrites it)
            said, chips = ask(pg, "digest of what people said"); assert not any("summar" in c for c in chips), (said, chips)
            said0, _ = ask(pg, "how do i invite a friend to a project?")
            assert not [r for r in palette(pg, "repair the glitch") if "by meaning" in r[2]], "no meaning rows without the model"
            assert files == [], "nothing is fetched until the person opts in"
            pg.evaluate("TribeFlintPage.open()"); pg.wait_for_selector("#flint-page .fpg-lv")
            assert pg.locator(".fpg-lv").count() == 5 and pg.locator(".fpg-lv[data-lv=helper]").inner_text().startswith("1")
            assert pg.locator(".fpg-lv.on").count() == 1 and pg.locator(".fpg-lv.on").get_attribute("data-lv") == "none"

            # ---------- the opt-in sheet ----------
            pg.click("#fp-local"); pg.wait_for_selector("#flint-model #fmd-get")
            assert pg.inner_text("#fmd-name") == "tribecode-fixture-64" and "KB" in pg.inner_text("#fmd-size") and "host" in pg.inner_text("#fmd-from"), pg.inner_text(".fmd-facts")
            assert "MIT" in pg.inner_text(".fmd-facts") and "Wi-Fi" in pg.inner_text("#fmd-wifi") and "remove it at any time" in pg.inner_text("#fmd-wifi")
            assert "works without this" in pg.inner_text(".fmd-foot") and "KB" in pg.inner_text("#fmd-get")
            assert files == [], "opening the sheet downloads nothing"
            # a failed download says so and installs nothing
            pg.route("**/api/flint/model/file/model.safetensors", lambda r: r.abort())
            pg.click("#fmd-get"); pg.wait_for_selector("#fmd-err", timeout=15000)
            assert "nothing was installed" in pg.inner_text("#fmd-err").lower() and pg.evaluate("TribeFlintModel.installed()") is False
            pg.unroute("**/api/flint/model/file/model.safetensors")
            # a damaged file is refused
            pg.route("**/api/flint/model/file/model.safetensors", lambda r: r.fulfill(status=200, content_type="application/octet-stream", body=b"this is not a model at all, sorry"))
            pg.click("#fmd-get"); pg.wait_for_function("(document.querySelector('#fmd-err') || {textContent: ''}).textContent.includes('safetensors')", timeout=15000)
            assert "not a safetensors file" in pg.inner_text("#fmd-err") and pg.evaluate("TribeFlintModel.installed()") is False
            pg.unroute("**/api/flint/model/file/model.safetensors")
            if take: pg.wait_for_timeout(300)
            # the real thing
            files.clear(); pg.click("#fmd-get"); pg.wait_for_selector("#fmd-installed", timeout=30000)
            assert sorted(set(files)) == ["config.json", "model.safetensors", "tokenizer.json"], files
            st_ = pg.evaluate("TribeFlintModel.status()"); assert st_["ready"] and st_["installed"]["name"] == "tribecode-fixture-64" and st_["installed"]["dim"] == 64, st_
            assert pg.evaluate("TribeNLU.hasSemantic()") is True
            assert pg.locator(".fpg-lv[data-lv=helper].on").count() == 1 and pg.locator(".fpg-lv.on").count() == 2, "the level is Active on Flint's page, next to No AI"
            assert pg.locator(".fpg-lv[data-lv=helper] .fpg-lv-on").is_visible()
            # try it, in the sheet
            pg.fill("#fmd-q", "repair the glitch"); pg.press("#fmd-q", "Enter"); pg.wait_for_selector("#fmd-hits li .fmd-l", timeout=15000)
            assert pg.locator("#fmd-hits li .fmd-l").first.inner_text() == "Fix the crash on the title screen", pg.inner_text("#fmd-hits")
            if take: pg.wait_for_timeout(400); pg.screenshot(path=str(SHOTS / "flint-local-model.png"))
            pg.click("#fmd-done"); pg.evaluate("TribeFlintPage.close()")

            # ---------- it survives a reload, from this device ----------
            files.clear(); go(); pg.wait_for_function("TribeFlintModel.ready()", timeout=20000)
            assert files == [], "loaded from IndexedDB, not downloaded again"

            # ---------- did you mean, by meaning ----------
            said, chips = ask(pg, "digest of what people said")
            assert "one of these" in said.lower() and any("summar" in c for c in chips), (said, chips)
            alts = pg.evaluate("TribeNLU.parse('digest of what people said', {}).steps[0].alts.map(a => a.intent)"); assert "chat.summarize" in alts, alts
            # recognized commands are untouched
            now_parse = pg.evaluate("JSON.stringify(['add a task to buy milk', 'open the calendar', 'switch to dark theme', 'summarize the chat'].map(t => TribeNLU.parse(t, {}).steps.map(s => [s.intent, s.conf])))")
            assert json.loads(now_parse) == [[[s[0], s[1]] for s in steps] for i, steps in enumerate(json.loads(base_parse)) if i != 3], "recognized commands parse exactly as before"

            # ---------- the palette: search by meaning across tasks, docs and chat ----------
            rows = palette(pg, "repair the glitch"); hit = [r for r in rows if "by meaning" in r[2]]
            assert hit and hit[0][0] == "Task" and hit[0][1] == "Fix the crash on the title screen", rows
            rows = palette(pg, "pricing"); assert any(r[0] == "Doc" and r[1] == "Budget for the launch" and "by meaning" in r[2] for r in rows), rows
            rows = palette(pg, "dark picture"); assert any(r[0] == "Chat" and "photo of the boss" in r[1] and "by meaning" in r[2] for r in rows), rows
            rows = palette(pg, "fix the crash"); assert rows[0][1] == "Fix the crash on the title screen" and "by meaning" not in rows[0][2], "an exact match stays first, once"
            assert len([r for r in rows if r[1] == "Fix the crash on the title screen"]) == 1, rows
            rows = palette(pg, "new task"); assert rows[0][1] == "New task", "commands rank as before"

            # ---------- feat/flint-local: the same matching in Flint's chat, related docs, duplicate tasks, comment groups ----------
            hits = pg.evaluate("TribeFlintModel.find('repair the glitch', 3).then(h => h.map(x => [x.kind, x.label]))")
            assert hits and hits[0] == ["Task", "Fix the crash on the title screen"], hits
            said, chips = ask(pg, "where did we talk about the dark picture?")
            assert "matched by meaning with my local brain" in said and any(c.startswith("Chat · the photo of the boss") for c in chips), (said, chips)
            assert api("/docs", "POST", {"title": "What things cost", "body": "Prices for the booth and the stickers.\n"}, token=tok)[0] == 200
            rel = pg.evaluate("(async () => { const M = TribeFlintModel.model(), S = TribeFlintSem; return S.related('Budget for the launch What everything will cost.', [{ id: 'a', text: 'What things cost Prices for the booth and the stickers.' }, { id: 'b', text: 'Draw the boss sprite' }], { nlu: TribeNLU, model: M }).map(r => r.id); })()")
            assert rel == ["a"], rel
            dup = pg.evaluate("[TribeFlintSem.duplicate('Repair the crash on the title screen', ['Draw the boss sprite', 'Fix the crash on the title screen'], { model: TribeFlintModel.model() }), TribeFlintSem.duplicate('Draw the hero sprite', ['Draw the boss sprite', 'Fix the crash on the title screen'], { model: TribeFlintModel.model() })]")
            assert dup == [1, -1], dup
            said, chips = ask(pg, "add a task to repair the crash on the title screen"); assert "already on the board" in said and chips[0] == "Add it anyway", (said, chips)
            groups = pg.evaluate("TribeFlintSem.cluster(['the boss is too hard', 'cannot beat the boss, too difficult', 'the music is lovely', 'love the soundtrack', 'save file got lost'], { model: TribeFlintModel.model() }).map(g => g.items)")
            assert [0, 1] in groups and [2, 3] in groups and [4] in groups, groups

            # ---------- help answers still come from the docs ----------
            kb = []; pg.on("request", lambda r: "/api/flint/kb" in r.url and kb.append(r.url))
            said1, _ = ask(pg, "how do i invite a friend to a project?")
            assert said1 == said0 or len(said1) > 20, said1
            assert all("k=8" in u for u in kb), kb

            # ---------- remove ----------
            pg.evaluate("TribeFlintModel.open()"); pg.wait_for_selector("#fmd-remove"); pg.click("#fmd-remove"); pg.wait_for_selector("#fmd-get", timeout=10000)
            assert pg.evaluate("TribeFlintModel.status()") == {"ready": False, "installed": None} and pg.evaluate("TribeNLU.hasSemantic()") is False
            assert pg.evaluate("new Promise(res => { const r = indexedDB.open('tribecode-flint-model'); r.onsuccess = () => { const t = r.result.transaction('files').objectStore('files').count(); t.onsuccess = () => res(t.result); }; })") == 0, "the files are gone from this device"
            pg.click("#fmd-done")
            after = pg.evaluate("JSON.stringify(['add a task to buy milk', 'open the calendar', 'switch to dark theme', 'larger lettering', 'summarize the chat'].map(t => TribeNLU.parse(t, {}).steps.map(s => [s.intent, s.conf, s.alts])))")
            assert after == base_parse, "without the model, Flint is exactly as before"
            assert not [r for r in palette(pg, "repair the glitch") if "by meaning" in r[2]]
            said, chips = ask(pg, "digest of what people said"); assert not any("summar" in c for c in chips)
            go(); assert pg.evaluate("TribeFlintModel.status()") == {"ready": False, "installed": None}
            pg.evaluate("TribeFlintPage.open()"); pg.wait_for_selector("#flint-page .fpg-lv"); assert pg.locator(".fpg-lv.on").count() == 1
            b.close()
        bad = [u for u in outside if "localhost" not in u and "127.0.0.1" not in u and "fonts" not in u]
        assert not [u for u in bad if "huggingface" in u], bad
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_flint_local_model")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
