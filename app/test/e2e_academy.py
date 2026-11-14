"""v0.27 company: the Academy (server/academy.js, server/legal.js, app/ui/academy.js, legal.js, offload.js).
Tracks are listed and every lesson is 120-250 words; the hero track comes from the seat you hold in company.json; lesson
progress persists across reloads; a legal draft makes a doc in Files with the filled fields and the "not legal advice"
banner, logs a company decision and can ask for a "Send for signature" approval; the offload prompt carries the project's
name and gist but never a key from the vision; bringing a result back makes a doc (source offload:<provider>) or a
capture; Flint opens the right place; academy_lesson works for agents; the phone layout has no sideways scroll.
Usage: python app/test/e2e_academy.py   (screenshots go to $ACADEMY_SHOTS or /tmp)
"""
import glob, json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5900 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("ACADEMY_SHOTS", "/tmp"))
FAKE_KEY = "sk-live1234567890abcdefXYZ"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="tribe-academy-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        boot = ok(api("/bootstrap", "POST", {"name": "Camp"})); host = boot["token"]; me = boot["member"]["id"]
        p = ok(api("/projects", "POST", {"name": "Firefly Garden", "bio": "A cozy night game"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api("/vision", "PUT", {"text": f"# Firefly Garden\n\nA cozy pixel game where friends water plants at night.\n\nAPI key: {FAKE_KEY}\n"}, token=host, project=pid))

        # ---- content: 10 tracks, 6-10 lessons each, 120-250 words, a real action, glossary and links ----
        data = json.loads((ROOT / "templates" / "academy.json").read_text())
        assert [t["id"] for t in data["tracks"]] == ["founder", "ceo", "cto", "design", "growth", "sales", "support", "ops", "finance", "legal"]
        for t in data["tracks"]:
            assert 6 <= len(t["lessons"]) <= 10 and t["glossary"] and 3 <= len(t["links"]) <= 8, t["id"]
            for l in t["lessons"]:
                w = len(" ".join(l["body"]).split()); assert 120 <= w <= 250, (l["id"], w)
                assert l["try"]["do"] and l["try"]["label"], l["id"]
            assert all(x["url"].startswith("https://") and x["checked"] for x in t["links"])

        # ---- no seat yet: Founder basics is the hero; with the CTO seat it's the CTO track ----
        assert ok(api("/academy", token=host, project=pid))["mine"] == "founder"
        cdir = tmp / "tribe" / "projects" / pid; cdir.mkdir(parents=True, exist_ok=True)
        (cdir / "company.json").write_text(json.dumps({"on": True, "name": "Firefly Studio", "template": "game-studio", "seats": [
            {"id": "ceo", "kind": "ceo", "title": "CEO", "holder": {"person": None, "agent": None}},
            {"id": "cto", "kind": "cto", "title": "CTO", "holder": {"person": me, "agent": None}}], "goals": []}))
        ov = ok(api("/academy", token=host, project=pid)); assert ov["mine"] == "cto" and ov["seat"]["title"] == "CTO" and len(ov["tracks"]) == 10, ov.get("seat")
        tr = ok(api("/academy/legal", token=host, project=pid))["track"]; assert tr["lessons"][0]["id"] == "legal-1"
        assert api("/academy/nope", token=host, project=pid)[0] == 404

        # ---- MCP: academy_lesson for agents ----
        out = subprocess.run(["node", "-e", """
const a = require('./server/academy.js')({ P: { current: () => 'x', defaultId: () => 'x', get: () => ({}) }, base: { p: (...x) => '/nonexistent/' + x.join('/'), readJSON: () => ({}) }, store: { p: () => '/nonexistent' }, docs: {}, nameOf: () => 'x' });
const r = a.mcpTools.academy_lesson.run({ track: 'finance', n: 2 }, { id: 'm' }); const l = a.mcpTools.academy_lesson.run({}, { id: 'm' });
console.log(JSON.stringify({ one: r.content[0].text.slice(0, 80), list: l.content[0].text.slice(0, 40), gist: a.gistOf('# T\\n\\nHello world.\\n\\npassword: hunter2hunter2\\n') }));"""], cwd=str(ROOT), capture_output=True, text=True, timeout=30)
        m = json.loads(out.stdout.strip().splitlines()[-1]); assert m["one"].startswith("# Finance · Lesson 2: Bookkeeping"), m; assert m["list"].startswith("# Founder basics"), m; assert m["gist"] == "Hello world.", m

        # ---- legal API: required fields are enforced ----
        tl = ok(api("/legal", token=host, project=pid))["templates"]; assert len(tl) == 10 and {t["id"] for t in tl} >= {"nda", "contractor", "cofounder", "ip", "privacy", "terms", "cookies", "service", "volunteer", "revshare"}
        assert api(f"/projects/{pid}/legal/draft", "POST", {"template": "nda", "fields": {"party_a": "x"}}, token=host, project=pid)[0] == 400

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host)
            ctx.add_init_script(init)
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAcademy && window.TribeShell", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); time.sleep(0.8)
            # the Academy from the shell (one DEST entry)
            assert pg.evaluate("TribeShell.dests().some(d => d.key === 'academy')")
            pg.evaluate("TribeShell.go('academy')"); pg.wait_for_selector("#ac-hero[data-track='cto']", timeout=10000)
            assert pg.locator(".ac-track-card").count() == 9
            pg.screenshot(path=str(SHOTS / "academy-home-1440.png"))
            # read lesson 1, Next marks it done
            pg.click("#ac-continue"); pg.wait_for_selector(".ac-read h1"); assert "Boring technology" in pg.inner_text(".ac-read h1")
            w = pg.evaluate("getComputedStyle(document.querySelector('.ac-read > p')).lineHeight"); fs = pg.evaluate("getComputedStyle(document.querySelector('.ac-read > p')).fontSize")
            assert abs(float(w[:-2]) / float(fs[:-2]) - 1.6) < 0.05, (w, fs)
            pg.screenshot(path=str(SHOTS / "academy-lesson-1440.png"))
            pg.click("#ac-next"); pg.wait_for_function("document.querySelector('.ac-read h1') && /Ship small/.test(document.querySelector('.ac-read h1').textContent)")
            pr = ok(api("/academy", token=host, project=pid))["progress"]; assert pr["cto"]["done"] == ["cto-1"], pr
            # persists across a reload
            pg.reload(); pg.wait_for_function("window.TribeAcademy && TribeClient.connected()", timeout=20000); pg.evaluate("TribeAcademy.open()")
            pg.wait_for_selector("#ac-hero"); assert "1 of 9 done" in pg.inner_text("#ac-hero") and "Continue · lesson 2" in pg.inner_text("#ac-continue")
            # the seat-sheet slot (Agent A mounts it in #co-academy-slot)
            pg.evaluate("(() => { const d = document.createElement('div'); d.id = 'co-academy-slot'; document.body.appendChild(d); return TribeAcademy.mount(d, 'legal'); })()")
            pg.wait_for_selector("#co-academy-slot .ac-mini [data-ac='legal']")

            # ---- Legal: template -> form -> preview -> Create doc ----
            pg.evaluate("TribeAcademy.open({ tab: 'legal', template: 'nda' })"); pg.wait_for_selector("#lg-form")
            pg.fill("#lg-f-party_a", "Firefly Studio"); pg.fill("#lg-f-party_b", "Acme Bakeries LLC"); pg.fill("#lg-f-purpose", "exploring an ordering partnership")
            pg.select_option("#lg-f-jurisdiction", "UK"); pg.fill("#lg-f-governing_law", "England and Wales")
            pg.wait_for_function("document.querySelector('#lg-md').textContent.includes('Acme Bakeries LLC')")
            assert "Ready to create" in pg.inner_text("#lg-miss")
            pg.check("#lg-sign")
            pg.screenshot(path=str(SHOTS / "academy-legal-1440.png"))
            pg.click("#lg-create"); pg.wait_for_selector("#lg-done", timeout=10000)
            docs = ok(api("/docs", token=host, project=pid))["docs"]; d = next(x for x in docs if x["title"].startswith("Mutual NDA"))
            body = ok(api("/docs/" + d["slug"], token=host, project=pid))["doc"]["body"]
            assert "Acme Bakeries LLC" in body and "Firefly Studio" in body and "England and Wales" in body and "exploring an ordering partnership" in body
            assert body.startswith("> ⚖️ **Starting point, not legal advice.**") and body.rstrip().endswith("before anyone signs or relies on it.") and "Notes for the United Kingdom" in body and "{{" not in body, body[:400]
            drafts = ok(api(f"/projects/{pid}/legal", token=host, project=pid))["drafts"]; assert drafts[0]["status"] == "waiting for approval", drafts
            assert any("Drafted Mutual NDA with Acme Bakeries LLC" in Path(f).read_text() for f in glob.glob(str(tmp / "tribe" / "**" / "decisions" / "*.md"), recursive=True)), "decision log"

            # ---- Offload: prompt has the project and no key; bring the result back ----
            pg.evaluate("TribeAcademy.open({ tab: 'offload', task: 'research' })"); pg.wait_for_selector("#of-prompt")
            pg.fill("#of-input", "other apps that take cake orders " + FAKE_KEY)
            pg.click("#of-copy"); time.sleep(0.3)
            clip = pg.evaluate("navigator.clipboard.readText().catch(() => document.querySelector('#of-prompt').value)")
            assert "Firefly Garden" in clip and "water plants at night" in clip and "sk-" not in clip and "API key" not in clip, clip
            pg.click(".of-opt[data-p='gemini']")
            pg.screenshot(path=str(SHOTS / "academy-offload-1440.png"), full_page=False)
            pg.fill("#of-text", "## Competitors\n\n- Cake Orders Pro: online forms for bakeries.\n- Bakesy: order inbox.")
            pg.fill("#of-title", "Bakery ordering competitors"); pg.click("#of-save"); pg.wait_for_selector("#of-ok", timeout=10000)
            docs = ok(api("/docs", token=host, project=pid))["docs"]; d2 = next(x for x in docs if x["title"] == "Bakery ordering competitors")
            assert d2.get("source") == "offload:gemini", d2
            # Captures as the target (API)
            r = ok(api("/academy/offload/bring", "POST", {"target": "captures", "provider": "aistudio", "task": "summarize", "text": "We decided to launch in March. Next we should email ten bakeries."}, token=host, project=pid))
            caps = ok(api("/captures", token=host, project=pid))["captures"]; assert any(c["id"] == r["capture"]["id"] and "offload" in c.get("tags", []) for c in caps), caps[:2]
            assert api("/academy/offload/bring", "POST", {"target": "files", "provider": "gemini", "task": "copy", "text": "here: " + FAKE_KEY}, token=host, project=pid)[0] == 400

            # ---- Flint ----
            pg.evaluate("TribeFlint.ask('draft an NDA')"); pg.wait_for_selector("#lg-form", timeout=8000)
            pg.evaluate("TribeFlint.ask('learn sales')"); pg.wait_for_function("document.querySelector('.ac-thead h3') && /Sales/.test(document.querySelector('.ac-thead h3').textContent)", timeout=8000)
            pg.evaluate("TribeFlint.ask('do this for free: translate our landing page')"); pg.wait_for_selector(".of-chip.on[data-task='translate']", timeout=8000)

            # ---- phone ----
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.add_init_script(init)
            pp = ph.new_page(); pp.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            pp.goto(BASE + "/?skipIntro=1"); pp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeAcademy", timeout=20000)
            pp.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); time.sleep(0.6)
            pp.evaluate("TribeAcademy.open()"); pp.wait_for_selector("#ac-hero")
            for tab in ["learn", "legal", "offload"]:
                pp.click(f"#ac-tabs [data-tab='{tab}']"); time.sleep(0.5)
                sw = pp.evaluate("(() => { const s = document.getElementById('view-academy'); return [s.scrollWidth, s.clientWidth, document.documentElement.scrollWidth, innerWidth]; })()")
                assert sw[0] <= sw[1] + 1 and sw[2] <= sw[3] + 1, (tab, sw)
                if tab == "learn": pp.screenshot(path=str(SHOTS / "academy-home-390.png"))
            pp.click("#ac-tabs [data-tab='learn']"); pp.wait_for_selector("#ac-continue"); pp.click("#ac-continue"); pp.wait_for_selector(".ac-read h1")
            pp.screenshot(path=str(SHOTS / "academy-lesson-390.png"))
            pp.evaluate("TribeAcademy.open({ tab: 'legal', template: 'contractor' })"); pp.wait_for_selector("#lg-form"); pp.screenshot(path=str(SHOTS / "academy-legal-390.png"))
            pp.evaluate("TribeAcademy.open({ tab: 'offload', task: 'copy' })"); pp.wait_for_selector("#of-prompt"); pp.screenshot(path=str(SHOTS / "academy-offload-390.png"))
            b.close()
        assert not errors, errors
        print("ok e2e_academy")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
