"""Clean-slate dev profile (feat/flint-runthrough, scripts/dev/clean-slate.js, app/ui/devslate.js, docs/DEV-TOOLS.md).
  1. The script starts TribeCode on its own port with a throwaway folder (marked .tribecode-dev), local only, --dev on.
  2. The page it opens is signed in as the local TEST Guest: no tribe yet (no key, the server has no members), no intro.
  3. Something made in that run (a host member, a file, browser storage) is gone after the next run: folder wiped, and the
     same browser's TribeCode storage is reset by the new run id. --keep keeps both.
  4. Live reload works with no tribe (GET /api/dev/stamp changes when app/ui changes), and it refuses to wipe a folder
     it did not make.
Usage: python app/test/e2e_clean_slate.py"""
import json, os, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5590 + OFF
BASE = f"http://localhost:{PORT}"
errors = []


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def post(path, body):
    req = urllib.request.Request(BASE + path, method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r: return json.loads(r.read())


def start(d, *extra):
    p = subprocess.Popen(["node", str(ROOT / "scripts" / "dev" / "clean-slate.js"), "--port", str(PORT), "--dir", d, "--no-open", "--quiet", "--print-url", *extra],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env={**os.environ, "NO_PROXY": "127.0.0.1,localhost"}, start_new_session=True)
    url, t = None, time.time()
    while time.time() - t < 30:
        line = p.stdout.readline()
        if line.startswith("URL "): url = line.split(" ", 1)[1].strip(); break
        if not line and p.poll() is not None: break
    assert url, f"clean-slate did not start (code {p.poll()})"
    return p, url


def stop(p):
    os.killpg(p.pid, signal.SIGTERM); p.wait(timeout=10)
    for _ in range(40):
        try: urllib.request.urlopen(BASE + "/api/health", timeout=1); time.sleep(0.15)
        except Exception: return


def open_page(ctx, url):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(m.text[:200]))
    pg.goto(url); pg.wait_for_function("window.TribeAccounts && window.TribeDevSlate && window.TribeClient", timeout=20000); pg.wait_for_timeout(800)
    return pg


def main():
    tmp = tempfile.mkdtemp(prefix="tc-slate-"); d = os.path.join(tmp, "TribeCode-Dev")
    # it refuses to wipe a folder it did not make
    other = os.path.join(tmp, "precious"); os.makedirs(other); Path(other, "keep.txt").write_text("mine")
    r = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "clean-slate.js"), "--port", str(PORT), "--dir", other, "--no-open", "--quiet"], capture_output=True, text=True, timeout=20)
    assert r.returncode == 2 and Path(other, "keep.txt").exists(), (r.returncode, r.stdout, r.stderr)

    p, url = start(d)
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860})
            # ---------- run 1: a guest, no tribe ----------
            assert Path(d, ".tribecode-dev").exists()
            run1 = json.loads(Path(d, ".tribecode-dev").read_text())["run"]
            pg = open_page(ctx, url)
            assert pg.evaluate("TribeAccounts.mode()") == "test" and pg.evaluate("TribeAccounts.current().name") == "Guest", pg.evaluate("TribeAccounts.state()")
            assert pg.evaluate("!TribeClient.hasToken()"), "a guest has no tribe key"
            assert get("/api/health")[1].get("members") == 0, "no tribe yet: nobody claimed the server"
            assert "devslate=" not in pg.url and "accounts=test" in pg.url
            assert "Guest" in pg.inner_text("body")
            assert not pg.locator("#intro:not(.hidden)").count() or not pg.locator("#intro").is_visible()
            # live reload with no socket: the stamp moves when app/ui changes
            st, s1 = get("/api/dev/stamp"); assert st == 200 and s1["dev"], s1
            probe = ROOT / "app" / "ui" / ".devslate-probe.tmp"; probe.write_text(str(time.time()))
            try:
                for _ in range(40):
                    time.sleep(0.15)
                    if get("/api/dev/stamp")[1]["stamp"] != s1["stamp"]: break
                else: raise AssertionError("the dev stamp did not move after a UI change")
            finally: probe.unlink()
            # make some state: a host member on the server, a file in the folder, browser storage
            post("/api/bootstrap", {"name": "Tester"}); assert get("/api/health")[1]["members"] == 1
            Path(d, "scratch.txt").write_text("from run 1")
            pg.evaluate("localStorage.setItem('tribecode.scratch', 'run 1')")
            pg.close(); stop(p)

            # ---------- run 2: nothing from run 1 is left ----------
            p, url = start(d)
            run2 = json.loads(Path(d, ".tribecode-dev").read_text())["run"]; assert run2 != run1
            assert not Path(d, "scratch.txt").exists() and get("/api/health")[1]["members"] == 0
            pg = open_page(ctx, url)
            assert pg.evaluate("localStorage.getItem('tribecode.scratch')") is None, "browser storage from run 1 survived"
            assert pg.evaluate("TribeAccounts.mode()") == "test" and pg.evaluate("!TribeClient.hasToken()")
            pg.evaluate("localStorage.setItem('tribecode.scratch', 'run 2')"); Path(d, "scratch.txt").write_text("from run 2")
            pg.close(); stop(p)

            # ---------- run 3 with --keep: both stay ----------
            p, url = start(d, "--keep")
            assert json.loads(Path(d, ".tribecode-dev").read_text())["run"] == run2 and Path(d, "scratch.txt").read_text() == "from run 2"
            pg = open_page(ctx, url)
            assert pg.evaluate("localStorage.getItem('tribecode.scratch')") == "run 2"
            # from the guest's clean slate, Flint starts a tribe (the run-through's first step)
            pg.wait_for_function("window.TribeFlint && window.TribeFlintRun", timeout=10000)
            pg.evaluate("TribeFlint.ask('start a tribe called Dev Crew')")
            pg.wait_for_function("TribeClient.hasToken() && TribeClient.connected()", timeout=15000)
            h = get("/api/health")[1]; assert h["members"] == 1, h
            assert "Dev Crew" in pg.evaluate("TribeFlint.thread().slice(-1)[0].text")
            pg.close()
        assert not errors, errors
        print("e2e_clean_slate: OK (own port + marked throwaway folder, TEST Guest with no tribe, wiped between runs incl. browser storage, --keep, Flint starts a tribe from it, dev live-reload stamp, refuses foreign folders)")
    finally:
        try: stop(p)
        except Exception: pass


if __name__ == "__main__":
    main()
