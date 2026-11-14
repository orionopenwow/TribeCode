"""Watch Flint build (feat/flint-runthrough): the scripted run-through, headless, with no AI at all.
Flint drives the real app with his normal commands (a tribe, a project, the vision, company basics, tasks, a doc from a
template, a website from a template and an edit, a game from the starter, a design on the canvas, a chat post, a proposal
approved, a standup, a local summary, the product presentation, the proof ZIPs). Checks that the caption bar showed every
step with a caption and marked it done, that each step really changed the tribe (API), and that both ZIPs landed in
<tribe>/exports/ with the required files (opened with zipfile: README, timeline, manifest, website, game, docs, design
SVG + PNG, chat transcript, task board JSON, presentation). Also the download route and Flint's Blender bridge stub.
Usage: python app/test/e2e_flint_runthrough.py [--shots] [--out DIR]   (--out keeps the tribe folder there: scripts/flint-runthrough.js --headless)"""
import io, json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5530 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = Path(os.environ.get("SHOTS_DIR", "/tmp")); take = "--shots" in sys.argv
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
errors = []
# the website and game run in sandboxed preview frames; their own storage probes are not ours
NOISE = ("favicon", "sandboxed and lacks the 'allow-same-origin'", "ERR_NAME_NOT_RESOLVED", "net::ERR_", "Failed to load resource")

PROJECT_REQUIRED = ["README.md", "TIMELINE.md", "timeline.json", "tribe/manifest.json", "website/index.html", "game/index.html",
                    "design/design.svg", "design/design.png", "design/canvas.json", "chat/transcript.md", "chat/messages.json",
                    "tasks/board.json", "tasks/board.md", "vision/VISION.md", "company/company.json", "proposals/proposals.json",
                    "presentation/index.html", "presentation/slides.md"]
TRIBE_REQUIRED = ["README.md", "TIMELINE.md", "timeline.json", "tribe/manifest.json", "projects/glowbug/website/index.html",
                  "projects/glowbug/game/index.html", "projects/glowbug/design/design.png", "projects/glowbug/tasks/board.json",
                  "projects/glowbug/chat/transcript.md", "projects/glowbug/presentation/index.html"]
STEPS = ["tribe", "project", "vision", "company", "tasks", "doc", "website", "edit", "game", "design", "chat", "propose", "approve", "standup", "summary", "present", "proof"]


def api(path, method="GET", body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: data = r.read(); return r.status, (data if raw else json.loads(data or b"{}"))
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def main():
    tmp = OUT or tempfile.mkdtemp(prefix="tribe-flintrun-")
    os.makedirs(tmp, exist_ok=True); tribe_dir = os.path.join(tmp, "tribe")
    if OUT and os.path.exists(tribe_dir): shutil.rmtree(tribe_dir)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe_dir, "--name", "Test Crew", "--ollama", "http://localhost:9"],
                           stdout=open(os.path.join(tmp, "server.log"), "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.15)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
            pg.on("pageerror", lambda e: not any(n in str(e) for n in NOISE) and errors.append(f"page: {e}"))
            pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in NOISE) and errors.append(f"console: {m.text[:200]}"))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'})); localStorage.setItem('tribecode.flint.brain', 'none'); localStorage.setItem('tribecode.brain', JSON.stringify('none'))")
            # the help menu has the button
            pg.goto(BASE + "/?skipIntro=1")
            pg.wait_for_function("TribeClient.connected() && window.TribeFlintRun && window.TribeExport", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token")
            pg.click("#tb-help"); pg.click("[data-help=learn]"); pg.wait_for_selector("#guide [data-help='flintrun']", timeout=8000)
            assert "Watch Flint build" in pg.inner_text("#guide [data-help='flintrun']")
            pg.keyboard.press("Escape"); pg.evaluate("document.getElementById('help-menu') && document.getElementById('tb-help').click()")
            # every caption the bar shows, as it shows it
            pg.evaluate("""window.__caps = []; new MutationObserver(() => { const c = document.querySelector('#frun-cap'), s = document.querySelector('#frun-steps [data-state="now"]');
              if (c && s && c.textContent && !__caps.some(x => x.id === s.dataset.step)) __caps.push({ id: s.dataset.step, cap: c.textContent }); }).observe(document.body, { childList: true, subtree: true, characterData: true })""")
            t0 = time.time()
            log = pg.evaluate("TribeFlintRun.start({ fast: true })")
            took = time.time() - t0
            bad = [f"{l['id']}: {l['reply'][:160]}" for l in log if not l["ok"]]
            assert not bad, "steps that did not land:\n" + "\n".join(bad)
            assert [l["id"] for l in log] == STEPS, [l["id"] for l in log]
            # the UI showed each step, with a caption, and marked it done
            caps = pg.evaluate("__caps")
            assert [c["id"] for c in caps] == STEPS, caps
            assert all(len(c["cap"]) > 20 for c in caps), caps
            states = pg.evaluate("[...document.querySelectorAll('#frun-steps [data-step]')].map(e => [e.dataset.step, e.dataset.state])")
            assert states == [[s, "done"] for s in STEPS], states
            assert "Basic · no AI" in pg.inner_text("#frun-via")
            assert "17 of 17" in pg.inner_text("#frun-eyebrow").lower(), pg.inner_text("#frun-eyebrow")
            assert pg.locator("#frun-dl [data-frun-dl]").count() == 2
            # Flint's own thread holds each command he typed
            mine = pg.evaluate("TribeFlint.thread().filter(m => m.who === 'me').map(m => m.text)")
            for l in log: assert l["cmd"] in mine, l["cmd"]
            chips = pg.evaluate("TribeFlint.thread().filter(m => /Saved the proof/.test(m.text)).pop().acts.map(a => a.label)")
            assert chips == ["Download glowbug-proof.zip", "Download tribe-lantern-labs-proof.zip"], chips
            if take: pg.screenshot(path=str(SHOTS / "flint-runthrough-end.png"))

            # the tribe really changed
            assert api("/flint/proof/manifest", token=tok)[1]["tribe"]["name"] == "Lantern Labs"
            # ---------- the ZIPs on disk ----------
            exp = Path(tribe_dir) / "exports"
            pz, tz = exp / "glowbug-proof.zip", exp / "tribe-lantern-labs-proof.zip"
            assert pz.exists() and tz.exists(), list(exp.iterdir())
            with zipfile.ZipFile(pz) as z:
                assert z.testzip() is None
                names = set(z.namelist())
                missing = [n for n in PROJECT_REQUIRED if n not in names]; assert not missing, f"project ZIP lacks {missing}"
                assert any(n.startswith("docs/") and n.endswith(".md") and "presentation" not in n for n in names), "a doc from a template"
                assert any(n.startswith("docs/") and "presentation" in n for n in names), "the presentation deck"
                assert "What Flint built" in z.read("README.md").decode()
                assert "Catch the light" in z.read("website/index.html").decode(), "the edited headline"
                assert z.read("design/design.png")[:8] == b"\x89PNG\r\n\x1a\n" and b"<svg" in z.read("design/design.svg")
                tl = json.loads(z.read("timeline.json")); assert [s["id"] for s in tl["steps"]] == STEPS and all(s["at"] and s["ok"] for s in tl["steps"]), tl
                man = json.loads(z.read("tribe/manifest.json")); assert man["tribe"]["name"] == "Lantern Labs" and any(m["name"] == "Orion" and m["role"] == "host" for m in man["members"]), man
                assert len(json.loads(z.read("tasks/board.json"))) >= 3
                assert "press kit are up" in z.read("chat/transcript.md").decode() and "Standup" in z.read("chat/transcript.md").decode()
                assert "fireflies" in z.read("vision/VISION.md").decode()
                assert "Glowbug" in z.read("presentation/index.html").decode()
                assert any(p["status"] == "approved" for p in json.loads(z.read("proposals/proposals.json")))
            with zipfile.ZipFile(tz) as z:
                assert z.testzip() is None
                names = set(z.namelist()); missing = [n for n in TRIBE_REQUIRED if n not in names]; assert not missing, f"tribe ZIP lacks {missing}"
                assert any(n.startswith("projects/") and n.endswith("/tasks/board.json") and not n.startswith("projects/glowbug/") for n in names), "the tribe's other project too"
            st, raw = api("/flint/proof/file?name=glowbug-proof.zip", token=tok, raw=True); assert st == 200 and raw[:2] == b"PK"
            st, lst = api("/flint/proof", token=tok); assert {f["name"] for f in lst["files"]} >= {"glowbug-proof.zip", "tribe-lantern-labs-proof.zip"}, lst
            # the UI download button hands over the same file
            with pg.expect_download() as dl: pg.click("#frun-dl [data-frun-dl='glowbug-proof.zip']")
            assert zipfile.ZipFile(io.BytesIO(open(dl.value.path(), "rb").read())).namelist()

            # ---------- the Blender bridge stub: a script file, nothing runs ----------
            n = pg.evaluate("TribeFlint.thread().length")
            pg.evaluate("TribeFlint.ask('make a blender turntable for hero.glb')")
            pg.wait_for_function("n => TribeFlint.thread().length >= n + 2", arg=n, timeout=10000)
            reply = pg.evaluate("TribeFlint.thread().slice(-1)[0].text"); assert "turntable" in reply and "Nothing ran" in reply, reply
            py = exp / "blender" / "glowbug-turntable.py"; src = py.read_text()
            assert "import bpy" in src and "hero.glb" in src and "render.render(animation=True)" in src and "TC_Camera" in src
            if shutil.which("python3"): subprocess.run([sys.executable, "-c", f"import ast; ast.parse(open({str(py)!r}).read())"], check=True)
            assert not [e for e in errors], errors
            print(f"e2e_flint_runthrough: OK ({len(log)} steps in {took:.0f} s, no AI; project ZIP {pz.stat().st_size // 1024} KB, tribe ZIP {tz.stat().st_size // 1024} KB; Blender stub)")
            if OUT: print(f"  ZIPs: {pz}\n        {tz}")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
