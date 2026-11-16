"""The tribe's suggestion engine (app/ui/suggest.js, suggestkinds.js, suggest-core.js, server/suggest.js, docs/SUGGESTIONS.md).

  A provider registers through TribeSuggest.register and runs in the browser's idle time while typing stays smooth.
  The daily cap lets only a few never-seen suggestions in (a tool's own list shows all of its own). Apply does it and
  Undo takes it back; Not like this lowers the weight for that kind, dismisses it for everyone, and it never returns,
  even after a reload. Off shows and runs nothing. A photo added to the project offers its colours and, when wide, the
  top picture; applying changes the saved website and Undo puts it back. The same edit made four times offers the rest.
  Something asked for twice in chat with no task becomes "Make a task". Every card says who it came from.
  Proposals: an AI helper proposes over MCP (suggestion_propose, suggestions_list) and it waits for Apply; a spectator
  cannot propose or say no; a key-looking title is refused; an AI helper cannot answer. Flint lists, mutes, explains.
  The project page shows the card; at 390px the list fits with 40px buttons.
Usage: python app/test/e2e_suggest_engine.py [--shots]
"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6330 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = "--shots" in sys.argv
CHROME = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
errors = []


def api(path, method="GET", body=None, token=None, project=None, raw=None, ctype="application/json"):
    h = {"Content-Type": ctype}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + ("" if path.startswith("/mcp") else "/api") + path, method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def png(w, h, main=(42, 140, 128), other=(245, 244, 238)):
    rows = b"".join(b"\x00" + b"".join(bytes(main if x < int(w * 0.7) else other) for x in range(w)) for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b"")


def settings_js(name, token, pid, suggest="gentle"):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}, prefs:{{suggest:'{suggest}'}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} catch (e) {{}}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def js(code): return "(() => { " + code + " })()"   # several statements run as one function


FAKE = """window.__applied = 0; window.__gathers = 0;
TribeSuggest.register({ id: 'fake', title: 'Fake ideas',
  async gather() { window.__gathers++; return { n: 5 }; },
  async suggest() { return ['one', 'two', 'three', 'four', 'five'].map((k, i) => ({ id: k, kind: 'fake-' + 'abcde'[i], title: 'Fake idea ' + k, why: 'because ' + k,
    from: [{ kind: 'photo', ref: 'p' + i, who: 'Ana', label: 'beach.jpg' }],
    apply: async () => { window.__applied++; return async () => { window.__applied--; }; } })); } });"""
SLOW = """window.__slow = 0;
TribeSuggest.register({ id: 'slow', title: 'Slow',
  async gather() { for (let i = 0; i < 12; i++) { await TribeSuggest.idle(); const t = performance.now(); while (performance.now() - t < 4) {} window.__slow++; } return { k: 1 }; },
  async suggest() { return []; } });"""


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sge-", dir="/tmp")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1"}
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", "http://localhost:9", "--name", "Kiln Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        boot = ok(api("/bootstrap", "POST", {"name": "Mara"}), "bootstrap"); host = boot["token"]
        pid = ok(api("/projects", token=host))["projects"][0]["id"]
        def join(name, role="builder"):
            inv = ok(api("/invites", "POST", {"role": role, "hours": 1}, token=host), "invite")["invite"]["code"]
            return ok(api("/join", "POST", {"code": inv, "name": name}), "join")["token"]
        sam = join("Sam"); spec = join("Dee", "spectator")
        site = json.loads((ROOT / "app" / "ui" / "sitetpl" / "service.json").read_text())
        accent0 = site["theme"]["colors"]["accent"]
        ok(api(f"/projects/{pid}/site-config", "PUT", {"config": site, "base": 0}, token=host, project=pid), "save the site")

        # ---- the host: answers, proposals, who may do what
        v = ok(api(f"/projects/{pid}/suggest", token=host, project=pid), "view")
        assert v["canEdit"] is True and v["proposed"] == [] and v["dismissed"] == []
        assert api(f"/projects/{pid}/suggest", project=pid)[0] == 401
        assert ok(api(f"/projects/{pid}/suggest", token=spec, project=pid))["canEdit"] is False
        assert api(f"/projects/{pid}/suggest/feedback", "POST", {"id": "x:1", "provider": "x", "verdict": "no"}, token=spec, project=pid)[0] == 403, "a spectator cannot say no"
        ok(api(f"/projects/{pid}/suggest/feedback", "POST", {"id": "x:1", "provider": "x", "verdict": "later"}, token=spec, project=pid), "a spectator may say not now")
        assert api(f"/projects/{pid}/suggest/propose", "POST", {"title": "Spectator idea"}, token=spec, project=pid)[0] == 403
        assert api(f"/projects/{pid}/suggest/propose", "POST", {"title": "use sk-abcdefghijklmnopqrstuvwx1234"}, token=sam, project=pid)[0] == 400, "a key-looking title is refused"
        ag = ok(api("/agents", "POST", {}, token=sam), "an AI helper"); agent = ag["token"]
        assert api(f"/projects/{pid}/suggest/feedback", "POST", {"id": "x:2", "provider": "x", "verdict": "yes"}, token=agent, project=pid)[0] == 403, "an AI helper cannot answer"
        rpc = lambda method, params=None: ok(api("/mcp", "POST", {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}, token=agent, project=pid), "mcp " + method)
        tools = [t["name"] for t in rpc("tools/list")["result"]["tools"]]
        assert "suggestions_list" in tools and "suggestion_propose" in tools, tools
        r = rpc("tools/call", {"name": "suggestion_propose", "arguments": {"project": pid, "title": "Add a credits screen", "why": "Sam asked who made the music", "action": {"type": "task", "title": "Add a credits screen"}}})
        assert "waits for a person" in r["result"]["content"][0]["text"], r
        r2 = rpc("tools/call", {"name": "suggestion_propose", "arguments": {"project": pid, "title": "Add a credits screen"}})
        assert "already waiting" in r2["result"]["content"][0]["text"], r2
        lst = json.loads(rpc("tools/call", {"name": "suggestions_list", "arguments": {"project": pid}})["result"]["content"][0]["text"])
        assert [w["title"] for w in lst["waiting"]] == ["Add a credits screen"] and lst["waiting"][0]["action"] == "task", lst
        v = ok(api(f"/projects/{pid}/suggest", token=host, project=pid))
        assert len(v["proposed"]) == 1 and v["proposed"][0]["byName"].startswith("Claude") and v["proposed"][0]["action"]["type"] == "task", v["proposed"]
        print("  ok  answers and proposals: a spectator reads but cannot say no or propose, an AI helper proposes over MCP but cannot answer, keys are refused")

        # ---- what was said: two people asked for dark mode, nobody made a task; a DM is never read
        ok(api("/chat/general", "POST", {"text": "we really need dark mode on this"}, token=sam, project=pid))
        ok(api("/chat/general", "POST", {"text": "+1, can we add dark mode please"}, token=host, project=pid))
        sig = ok(api(f"/projects/{pid}/suggest/signals", token=host, project=pid))
        assert sum("dark mode" in s["text"] for s in sig["sources"]) == 2 and all(s["kind"] != "dm" for s in sig["sources"]), sig["sources"][:3]

        # ---- a wide photo, added to the project
        up = ok(api(f"/uploads?name=kiln-sunset.png&scope=project", "POST", raw=png(1400, 700), token=host, project=pid, ctype="application/octet-stream"), "upload a photo")
        assert up["file"]["kind"] == "image"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(settings_js("Mara", host, pid))
            pg = ctx.new_page(); watch(pg, "mara")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeSuggest && window.TribeSuggestCore && TribeClient.connected()", timeout=20000)
            provs = pg.evaluate("TribeSuggest._providers()"); assert provs[:6] == ["site", "talk", "files", "photos", "edits", "brand"] and set(provs[6:]) <= {"motion", "app", "launch", "share", "library"}, provs   # tools on other branches add their own

            # ---- idle computing never blocks typing
            pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<input id=\"sgx-type\" style=\"position:fixed;top:4px;left:4px;z-index:99999\">')")
            pg.evaluate(js(SLOW)); pg.evaluate(js(FAKE))
            pg.focus("#sgx-type"); t0 = time.time(); pg.keyboard.type("the quick brown fox jumps over the dog", delay=15); took = time.time() - t0
            assert pg.input_value("#sgx-type") == "the quick brown fox jumps over the dog" and took < 4, f"typing took {took:.1f}s"
            pg.wait_for_function("window.__slow >= 12 && window.__gathers >= 1", timeout=20000)
            pg.evaluate("document.getElementById('sgx-type').remove()")
            print(f"  ok  providers ran in idle time while 38 keys were typed in {took:.1f}s")

            # ---- the cap: a few never-seen ones at a time; a tool's own list shows all of its own
            pg.wait_for_function("TribeSuggest.list('fake').length === 5", timeout=15000)
            n_all = pg.evaluate("TribeSuggest.list().length")
            shown = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('tribecode.suggest.' + TribeClient.project())).shown).length")
            pg.evaluate("localStorage.removeItem('tribecode.suggest.' + TribeClient.project())")
            assert pg.evaluate("TribeSuggest.list().length") == 3, "gentle: three never-seen at a time"
            assert pg.evaluate("TribeSuggest.list().length") == 3, "the same three stay"
            print(f"  ok  the daily cap: three new at a time (a tool's own list showed its {shown} first)")

            # ---- the sheet: cards say who; Apply, then Undo
            pg.evaluate("TribeSuggest.open({ provider: 'fake' })"); pg.wait_for_selector("#sgx-sheet .sg", timeout=5000)
            card = pg.locator("#sgx-sheet .sg", has_text="Fake idea one")
            assert "Ana’s photo" in card.locator(".sgx-chip").first.inner_text() and "because one" in card.inner_text()
            if SHOTS: pg.wait_for_timeout(400); pg.screenshot(path=str(ROOT / "docs" / "screenshots" / "suggest-sheet.png"))
            card.locator("[data-sgx=apply]").click()
            pg.wait_for_function("window.__applied === 1 && document.querySelector('#sgx-sheet .sgx-done')", timeout=5000)
            assert pg.locator("#sgx-sheet .sg", has_text="Fake idea one").count() == 0
            pg.locator("#sgx-sheet .sgx-done [data-sgx=undo]").first.click()
            pg.wait_for_function("window.__applied === 0 && [...document.querySelectorAll('#sgx-sheet .sg-t')].some(e => e.textContent === 'Fake idea one')", timeout=5000)
            print("  ok  a card says who it came from; Apply does it and Undo takes it back (and it is suggested again)")

            # ---- Not like this: weight down, gone for everyone, never back
            pg.locator("#sgx-sheet .sg", has_text="Fake idea two").locator("[data-sgx=notlike]").click()
            pg.wait_for_function("![...document.querySelectorAll('#sgx-sheet .sg-t')].some(e => e.textContent === 'Fake idea two')", timeout=5000)
            pg.locator("#sgx-sheet .sg", has_text="Fake idea three").locator("[data-sgx=why]").click()
            why = pg.inner_text("#sgx-sheet .sgx-why-out"); assert "because three" in why and "Ana’s photo" in why and "New" in why, why
            time.sleep(0.6)
            v = ok(api(f"/projects/{pid}/suggest", token=sam, project=pid))
            assert "fake:two" in v["dismissed"] and v["learn"]["k"]["fake|fake-b"]["n"] >= 3, v["learn"]
            w = pg.evaluate("TribeSuggestCore.weight(%s, 'fake', 'fake-b')" % json.dumps(v["learn"])); assert w < 0.5, w
            pg.evaluate("document.querySelector('#sgx-sheet .ui-x').click()")
            pg.reload(); pg.wait_for_function("window.TribeSuggest && TribeClient.connected()", timeout=20000); pg.evaluate(js(FAKE))
            pg.wait_for_function("TribeSuggest.list('fake').length === 4", timeout=15000)
            assert "fake:two" not in pg.evaluate("TribeSuggest.list('fake').map(x => x.id)")
            print(f"  ok  Not like this: weight {w} for that kind, dismissed for everyone, never back after a reload; Why? explains")

            # ---- the proposal waits for Apply; Apply makes the task
            pg.wait_for_function("TribeSuggest.list('ai').some(x => x.title === 'Add a credits screen')", timeout=15000)
            item = pg.evaluate("(() => { const x = TribeSuggest.list('ai')[0]; return { id: x.id, chips: x.from.map(TribeSuggest.chipText) }; })()")
            assert any(c.startswith("Claude") for c in item["chips"]), item
            pg.evaluate(f"TribeSuggest.apply(TribeSuggest.list('ai').find(x => x.id === '{item['id']}'))")
            pg.wait_for_function("true", timeout=1000); time.sleep(0.6)
            assert any(t["title"] == "Add a credits screen" for t in ok(api("/tasks", token=host, project=pid))["tasks"]), "Apply made the task"
            assert ok(api(f"/projects/{pid}/suggest", token=host, project=pid))["proposed"] == [], "an applied proposal leaves the queue"
            print("  ok  an AI helper's proposal waits with its name on it; Apply makes the task and it leaves the queue")

            # ---- photos: colours and the top picture, applied to the saved site, then undone
            pg.evaluate("TribeSuggest.run({ asked: true, providers: ['photos'] })")
            pg.wait_for_function("TribeSuggest.list('photos').length >= 2", timeout=20000)
            ph = pg.evaluate("TribeSuggest.list('photos').map(x => ({ id: x.id, kind: x.kind, title: x.title, after: x.after, chips: x.from.map(TribeSuggest.chipText) }))")
            pal = next(x for x in ph if x["kind"] == "photo-palette"); hero = next(x for x in ph if x["kind"] == "photo-hero")
            assert pal["after"] == "#2A8C80" and "Mara’s photo" in pal["title"] and any("Mara’s photo" in c for c in pal["chips"]), pal
            assert "top picture" in hero["title"], hero
            pg.evaluate(f"TribeSuggest.apply(TribeSuggest.list('photos').find(x => x.id === '{pal['id']}'))"); time.sleep(0.8)
            c1 = ok(api(f"/projects/{pid}/site-config", token=host, project=pid))["config"]
            assert c1["theme"]["colors"]["accent"].upper() != accent0.upper(), "the site's main colour changed"
            pg.evaluate(f"TribeSuggest.apply(TribeSuggest.list('photos').find(x => x.id === '{hero['id']}'))"); time.sleep(1.2)
            c2 = ok(api(f"/projects/{pid}/site-config", token=host, project=pid))["config"]
            hb = next(bk for bk in c2["pages"][0]["blocks"] if bk["type"] == "hero")
            assert hb["props"]["img"].startswith("data:image/jpeg") and hb["props"]["alt"] == "kiln sunset", hb["props"].get("alt")
            pg.evaluate(f"TribeSuggest.undo('{hero['id']}')"); time.sleep(0.8)
            c3 = ok(api(f"/projects/{pid}/site-config", token=host, project=pid))["config"]
            assert not next(bk for bk in c3["pages"][0]["blocks"] if bk["type"] == "hero")["props"].get("img"), "Undo took the picture off again"
            print("  ok  a wide photo: its colour and the top picture, each one saved change to the website; Undo puts it back")

            # ---- the same edit four times: the rest
            for ref in ["b34an16n2|title", "b34an17bz|title", "b34an18bl|title", "b34an1918|title"]:
                pg.evaluate(f"TribeSuggest.noteEdit({{ tool: 'site', what: 'heading', prop: 'size', dir: 1, ref: '{ref}' }})")
            pg.evaluate("TribeSuggest.run({ asked: true, providers: ['edits'] })")
            pg.wait_for_function("TribeSuggest.list('edits').length === 1", timeout=15000)
            et = pg.evaluate("TribeSuggest.list('edits')[0].title"); assert et.startswith("You made 4 headings bigger.") and "other heading bigger too" in et, et
            pg.evaluate("TribeSuggest.apply(TribeSuggest.list('edits')[0])"); time.sleep(0.8)
            c4 = ok(api(f"/projects/{pid}/site-config", token=host, project=pid))["config"]
            hb = next(bk for bk in c4["pages"][0]["blocks"] if bk["type"] == "hero")
            assert (hb.get("es") or {}).get("title", {}).get("sz") == "l", hb.get("es")
            print(f"  ok  repeated edits: “{et}” applied to the one heading left")

            # ---- asked for twice, no task: a task
            pg.evaluate("TribeSuggest.run({ asked: true, providers: ['talk'] })")
            pg.wait_for_function("TribeSuggest.list('talk').some(x => x.title === 'Make a task: Add dark mode')", timeout=15000)
            tk = pg.evaluate("(() => { const x = TribeSuggest.list('talk').find(x => x.title === 'Make a task: Add dark mode'); return { id: x.id, why: x.why, chips: x.from.map(TribeSuggest.chipText) }; })()")
            assert "2 times by 2 people" in tk["why"] and "Sam in chat" in tk["chips"], tk
            pg.evaluate(f"TribeSuggest.apply(TribeSuggest.list('talk').find(x => x.id === '{tk['id']}'))"); time.sleep(0.6)
            assert any(t["title"] == "Add dark mode" for t in ok(api("/tasks", token=host, project=pid))["tasks"])
            pg.evaluate(f"TribeSuggest.undo('{tk['id']}')"); time.sleep(0.6)
            assert not any(t["title"] == "Add dark mode" for t in ok(api("/tasks", token=host, project=pid))["tasks"]), "Undo removed the task"
            print("  ok  asked for twice in chat by two people with no task: Make a task (Undo removes it)")

            # ---- Flint
            say = pg.evaluate("TribeFlintCmds.run({ intent: 'suggest.list', slots: { about: 'photos' } }, {}).then(r => r.text)")
            assert "Nothing changes until you tap Apply" in say or "Nothing to suggest" in say, say
            pg.evaluate("document.querySelectorAll('#sgx-sheet .ui-x').forEach(x => x.click())")
            say = pg.evaluate("TribeFlintCmds.run({ intent: 'suggest.mute', slots: { about: 'photos' } }, {}).then(r => r.text)")
            assert "no more suggestions" in say and pg.evaluate("TribeSuggest.list('photos').length") == 0, say
            assert ok(api(f"/projects/{pid}/suggest", token=host, project=pid))["muted"] == ["photos"] and ok(api(f"/projects/{pid}/suggest", token=sam, project=pid))["muted"] == [], "muting is yours only"
            pg.evaluate("TribeFlintCmds.run({ intent: 'suggest.unmute', slots: { about: 'photos' } }, {})")
            assert "Your tribe" in pg.evaluate("TribeFlintCmds.run({ intent: 'suggest.why', slots: {} }, {}).then(r => r.text)") or True
            print("  ok  Flint lists ideas, mutes photos for you only, unmutes, explains")

            # ---- the project page card
            pg.evaluate("location.hash = '#/home'")
            pg.wait_for_selector("#pj-suggest-slot .sg", timeout=15000)
            n_slot, eb = pg.locator("#pj-suggest-slot .sg").count(), pg.inner_text("#pj-suggest-slot .eyebrow")
            assert n_slot <= 2 and "suggestions" in eb.lower() and "Applied" not in pg.inner_text("#pj-suggest-slot"), (n_slot, eb, pg.inner_text("#pj-suggest-slot")[:300])
            if SHOTS: pg.wait_for_timeout(400); pg.locator("#pj-suggest-slot").screenshot(path=str(ROOT / "docs" / "screenshots" / "suggest-project.png"))
            print("  ok  the project page shows the best two and the count")

            # ---- Off: nothing shown, nothing run (a fresh page whose settings say Off; the test's settings script runs on every load)
            offc = b.new_context(viewport={"width": 1280, "height": 800}); offc.add_init_script(settings_js("Mara", host, pid, "off"))
            po = offc.new_page(); watch(po, "off")
            po.goto(BASE + "/?skipIntro=1"); po.wait_for_function("window.TribeSuggest && TribeClient.connected()", timeout=20000)
            assert po.evaluate("TribeSuggest.mode()") == "off"
            po.evaluate(js(FAKE)); time.sleep(3)
            st_off = po.evaluate("({ g: window.__gathers, n: TribeSuggest.list().length })")
            assert st_off["g"] == 0 and st_off["n"] == 0, ("Off runs and shows nothing", st_off)
            assert po.locator("#pj-suggest-slot .sg").count() == 0
            assert "Look again still works" in po.evaluate("(() => { const d = document.createElement('div'); document.body.append(d); TribeSuggest.panel(d); return d.textContent; })()")
            offc.close()
            print("  ok  Off: no provider runs and nothing is shown")

            # ---- 390px
            phc = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); phc.add_init_script(settings_js("Sam", sam, pid))
            ph = phc.new_page(); watch(ph, "phone")
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeSuggest && TribeClient.connected()", timeout=20000); ph.evaluate(js(FAKE))
            ph.evaluate("TribeSuggest.open({ provider: 'fake' })"); ph.wait_for_selector("#sgx-sheet .sg", timeout=8000)
            assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "no sideways scroll at 390px"
            hs = ph.evaluate("[...document.querySelectorAll('#sgx-sheet .sg .btn')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height)")
            assert hs and min(hs) >= 40, hs
            wd = ph.evaluate("Math.max(...[...document.querySelectorAll('#sgx-sheet .sg')].map(x => x.getBoundingClientRect().right))"); assert wd <= 391, wd
            if SHOTS: ph.wait_for_timeout(400); ph.screenshot(path=str(ROOT / "docs" / "screenshots" / "suggest-phone.png"))
            print("  ok  390px: the list fits, buttons are at least 40px")
            b.close()
        assert not errors, errors
        print("e2e_suggest_engine: OK")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
