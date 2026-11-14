""""Give Flint a local brain (recommended)": the setup step (feat/flint-local: app/ui/flintsetup.js, flintmodel.js).
The host holds the fixture model (app/test/fixtures/flint-model), so the download runs with no outside network; where
the documented publisher would be asked (someone with no tribe), the test only checks what the card SAYS and that
nothing is fetched until Download is pressed.
  1. sign-up: after Create an account and Make it yours, Home shows the step under "You're in": one sentence, the size,
     "runs on this device", Download now / Later. Later is remembered across a reload; Settings › Plan & AI still offers it.
  2. first run as a guest: making a first tribe brings the same step to Home.
  3. the project dashboard's Getting started list has it as an extra row (the five counted steps stay five).
  4. a metered connection and low storage: it says why it would wait, and Later becomes the main button.
  5. download with progress, Pause, a reload, Resume with "Range: bytes=N-", then installed and working.
  6. the one-time re-offer in Flint's chat after Later ("I'd have understood that with my local brain"), never twice,
     and never for someone who was not asked before.
  7. phones get the smaller model by default; the card fits 390px.
--shots writes docs/screenshots/flint-setup-step.png.
Usage: python3 app/test/e2e_flint_setup.py [--shots]
"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6540 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors, outside = [], []
SIGNED_OUT = "if (!localStorage.getItem('tribecode.accounts.v1')) localStorage.setItem('tribecode.accounts.v1', JSON.stringify({ mode: 'signedout', accounts: [] }));"


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def watch(pg):
    pg.on("pageerror", lambda e: errors.append(str(e)))
    # "outside" = anything that is not this computer (Settings itself looks for Ollama on localhost:11434)
    pg.on("request", lambda r: (not r.url.startswith("http://localhost:") and not r.url.startswith("http://127.0.0.1:") and not r.url.startswith("data:") and not r.url.startswith("blob:")) and outside.append(r.url))


def ask(page, text):
    n = page.locator("#flint .fl-msg.fl").count()
    page.fill("#fl-input", text); page.press("#fl-input", "Enter")
    page.wait_for_function("n => document.querySelectorAll('#flint .fl-msg.fl').length > n && !document.querySelector('#flint .fl-msg.streaming')", arg=n, timeout=20000)
    page.wait_for_timeout(500)
    return [(m.text_content(), m.locator(".fl-act").all_text_contents()) for m in page.locator("#flint .fl-msg.fl").all()[n:]]


def member(tok, name="Orion"):
    return (f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}, server: {{url: '{BASE}', token: '{tok}'}}}}));"
            "localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.flint.brain', 'none');")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-flintsetup-", dir="/tmp"))
    mdir = tmp / "model"; shutil.copytree(ROOT / "app" / "test" / "fixtures" / "flint-model", mdir)
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FLINT_MODEL_DIR": str(mdir), "TRIBE_ACCOUNTS": "1"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.2)
        st, d = api("/bootstrap", "POST", {"name": "Orion"}); assert st == 200, d; tok = d["token"]
        # a download that stopped picks up where it was: the host answers Range
        req = urllib.request.Request(BASE + "/api/flint/model/file/model.safetensors", headers={"Authorization": "Bearer " + tok, "Range": "bytes=1000-1999"})
        with urllib.request.urlopen(req) as x: assert x.status == 206 and len(x.read()) == 1000 and x.headers["Content-Range"].startswith("bytes 1000-1999/"), x.headers
        req = urllib.request.Request(BASE + "/api/flint/model/file/model.safetensors", headers={"Authorization": "Bearer " + tok, "Range": "bytes=99999999-"})
        try: urllib.request.urlopen(req); assert False, "a range past the end is refused"
        except urllib.error.HTTPError as e: assert e.code == 416

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------- 1. sign-up ----------
            gx = b.new_context(viewport={"width": 1440, "height": 900}); gx.add_init_script(SIGNED_OUT)
            g = gx.new_page(); watch(g)
            g.goto(BASE + "/?skipIntro=1&freshopen=1&signup=1"); g.wait_for_selector("#sg #sg-create", state="visible", timeout=20000)
            assert g.evaluate("TribeFlintSetup.state()") == {"choice": None, "reoffered": False, "installed": False}
            assert g.locator("#fs-step").count() == 0, "nothing is offered before there is an account or a tribe"
            g.click("#sg-create"); g.wait_for_selector("#sg #sg-form", state="visible")
            g.fill("#sg-user", "Moon Gardener"); g.wait_for_function("document.getElementById('sg-user-hint').textContent.startsWith('Available')", timeout=8000)
            g.fill("#sg-pass", "night garden 42"); g.wait_for_function("!document.getElementById('sg-submit').disabled")
            g.click("#sg-submit"); g.wait_for_selector("#pz #pz-skip", state="visible", timeout=10000); g.click("#pz-skip")
            g.wait_for_selector("#view-hub #sg-next", state="visible", timeout=10000)
            g.wait_for_selector("#view-hub #fs-step .fsu", state="visible", timeout=10000)
            card = g.inner_text("#fs-step")
            assert "RECOMMENDED" in card.upper() and "Give Flint a local brain" in card, card
            assert "about 30 MB" in card and "huggingface.co" in card, card   # no tribe yet: the documented publisher and size
            assert "runs on this device" in card and "nothing you type is sent anywhere" in card, card
            assert g.inner_text("#fs-step [data-fs=get]") == "Download now" and g.inner_text("#fs-step [data-fs=later]") == "Later"
            assert "primary" in g.get_attribute("#fs-step [data-fs=get]", "class"), "recommended: Download is the main button"
            assert g.evaluate("document.querySelector('#sg-next').compareDocumentPosition(document.querySelector('#fs-step')) & 4") == 4, "under the You're in card"
            assert g.evaluate("getComputedStyle(document.querySelector('#fs-step .fsu')).boxShadow") == "none"
            if take: SHOTS.mkdir(parents=True, exist_ok=True); g.screenshot(path=str(SHOTS / "flint-setup-step.png"))
            assert not [u for u in outside if "huggingface" in u], "nothing is fetched until Download is pressed"
            # Later: gone, remembered across a reload, never blocking
            g.click("#fs-step [data-fs=later]"); g.wait_for_selector("#fs-step", state="detached")
            assert g.evaluate("TribeFlintSetup.state().choice") == "later"
            assert g.locator("#sg-next").count() == 1, "the rest of Home is untouched"
            g.reload(); g.wait_for_function("window.TribeFlintSetup && document.querySelector('#view-hub')", timeout=20000); g.wait_for_timeout(800)
            assert g.locator("#fs-step").count() == 0 and g.evaluate("TribeFlintSetup.state().choice") == "later", "Later is remembered"
            # Settings › Plan & AI still offers it
            g.evaluate("TribeSettings.open('ai')"); g.wait_for_selector("#set-flintsetup .fsu", timeout=10000)
            assert "Give Flint a local brain" in g.inner_text("#set-flintsetup") and g.locator("#set-flintsetup [data-fs=get]").count() == 1
            assert g.locator("#set-flintllm").count() == 1 and g.locator("#set-flintfacts").count() == 1
            g.evaluate("TribeSettings.close()")
            assert not [u for u in outside if "huggingface" in u], outside
            gx.close()

            # ---------- 2. first run as a guest: a first tribe brings the step to Home ----------
            fx = b.new_context(viewport={"width": 1440, "height": 900}); fx.add_init_script(SIGNED_OUT)
            f = fx.new_page(); watch(f)
            f.goto(BASE + "/?skipIntro=1&freshopen=1&signup=1"); f.wait_for_selector("#sg #sg-guest", state="visible", timeout=20000)
            f.click("#sg-guest"); f.wait_for_function("TribeAccounts.mode() === 'guest'")
            f.evaluate("TribeLocalSetup.start()"); f.fill("#tn-name", "Moon Garden"); f.click("#tn-options")
            f.click("#tn [data-tn-where='device']"); f.click("#tn-go"); f.wait_for_selector("#tn[data-step='3']", timeout=15000); f.click("#tn-skip")
            f.evaluate("window.TribeHub && TribeHub.open && TribeHub.open('home')")
            f.wait_for_selector("#view-hub #fs-step .fsu", state="visible", timeout=10000)
            assert "Give Flint a local brain" in f.inner_text("#fs-step")
            fx.close()

            # ---------- 3–5. a member of a tribe whose host keeps the model ----------
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script(member(tok))
            pg = ctx.new_page(); watch(pg)
            ranges = []; pg.on("request", lambda r: "/api/flint/model/file/model.safetensors" in r.url and ranges.append(r.headers.get("range", "")))
            def go():
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintSetup && window.TribeFlintModel && window.TribeNLU", timeout=30000)
                pg.wait_for_selector("#fl-input", state="visible", timeout=20000)
            go()
            # 3. the dashboard's Getting started list
            pg.evaluate("TribeApp.show('home')"); pg.wait_for_selector("#pj-check", timeout=15000)
            if pg.locator("#pj-check.one").count(): pg.click("#pj-check-all")
            pg.wait_for_selector("#pj-check .ock-flint .fsu", state="visible", timeout=10000)
            row = pg.inner_text("#pj-check .ock-flint")
            assert "Give Flint a local brain" in row and "your tribe’s host" in row and "KB" in row, row   # the host's own copy: its real size
            assert pg.locator("#pj-check .ock-card:not(.ock-flint)").count() == 5 and "5" in pg.inner_text("#pj-check-n"), "five counted steps, as before"
            # 4. metered, then low storage: it says why and suggests waiting
            pg.evaluate("Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false, type: 'cellular', effectiveType: '4g', downlink: 5 } })")
            adv = pg.evaluate("TribeFlintSetup.advise(30 * 1024 * 1024)"); assert adv["wait"] and adv["metered"] and "mobile data" in adv["why"], adv
            pg.evaluate("TribeSettings.open('ai')"); pg.wait_for_selector("#set-flintsetup .fsu.fsu-wait", timeout=10000)
            t = pg.inner_text("#set-flintsetup"); assert "mobile data" in t and "wait for Wi-Fi" in t and "You can still download it now" in t, t
            assert pg.inner_text("#set-flintsetup [data-fs=get]") == "Download anyway" and "primary" in pg.get_attribute("#set-flintsetup [data-fs=later]", "class")
            pg.evaluate("Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, type: 'wifi', effectiveType: '4g' } })")
            assert "Data saver" in pg.evaluate("TribeFlintSetup.advise(1)")["why"]
            pg.evaluate("Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '2g' } })")
            assert "slow" in pg.evaluate("TribeFlintSetup.advise(1)")["why"]
            pg.evaluate("Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined }); navigator.storage.estimate = async () => ({ quota: 40 * 1024 * 1024, usage: 30 * 1024 * 1024 })")
            adv = pg.evaluate("TribeFlintSetup.advise(30 * 1024 * 1024)"); assert adv["wait"] and adv["low"] and "10 MB free" in adv["why"] and "room" in adv["why"], adv
            pg.evaluate("TribeSettings.close()")
            go()   # a normal connection and storage again
            # 5. download with progress, Pause, reload, Resume
            pg.evaluate("TribeSettings.open('ai')"); pg.wait_for_selector("#set-flintsetup [data-fs=get]", timeout=10000)
            assert pg.inner_text("#set-flintsetup [data-fs=get]") == "Download now" and pg.locator("#set-flintsetup .fsu-wait").count() == 0
            cdp = ctx.new_cdp_session(pg); cdp.send("Network.enable")
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": 90 * 1024, "uploadThroughput": 500 * 1024})
            pg.click("#set-flintsetup [data-fs=get]")
            pg.wait_for_selector("#set-flintsetup [data-fs=cancel]", timeout=10000)
            pg.wait_for_function("(() => { const b = document.querySelector('#set-flintsetup .fmd-bar'); return b && +b.getAttribute('aria-valuenow') >= 15; })()", timeout=30000)
            assert "KB of" in pg.inner_text("#set-flintsetup .fsu-pct"), pg.inner_text("#set-flintsetup .fsu-pct")
            pg.click("#set-flintsetup [data-fs=cancel]")
            pg.wait_for_selector("#set-flintsetup [data-fs=get]", timeout=10000)
            part = pg.evaluate("TribeFlintModel.partial()"); assert part and 50000 < part["got"] < 740000, part
            assert pg.inner_text("#set-flintsetup [data-fs=get]") == "Resume" and "Paused at" in pg.inner_text("#set-flintsetup .fsu-pct")
            assert pg.evaluate("TribeFlintModel.installed()") is False and pg.evaluate("TribeNLU.hasSemantic()") is False, "half a model is never used"
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})
            go()   # the pieces survive a reload
            part2 = pg.evaluate("TribeFlintModel.partial()"); assert part2 and part2["got"] == part["got"], (part, part2)
            pg.evaluate("TribeSettings.open('ai')"); pg.wait_for_selector("#set-flintsetup [data-fs=get]", timeout=10000)
            assert pg.inner_text("#set-flintsetup [data-fs=get]") == "Resume"
            ranges.clear(); pg.click("#set-flintsetup [data-fs=get]")
            pg.wait_for_selector("#set-flintsetup .fsu-on", timeout=30000)
            assert ranges == [f"bytes={part['got']}-"], ranges   # only the rest was asked for
            assert pg.evaluate("TribeFlintModel.ready() && TribeNLU.hasSemantic()") is True
            assert pg.evaluate("TribeFlintModel.partial()") is None, "the pieces are gone once the model is whole"
            st2 = pg.evaluate("TribeFlintSetup.state()"); assert st2["installed"] and st2["choice"] == "done", st2
            on = pg.inner_text("#set-flintsetup"); assert "local brain is on" in on and "tribecode-fixture-64" in on and "KB on this device" in on, on
            assert pg.evaluate("TribeFlintModel.status().installed.bytes") > 700000, "the whole file, put back together"
            pg.click("#set-flintsetup [data-fs=device]"); pg.wait_for_selector("#flint-page #fp-device", timeout=10000)
            pg.evaluate("TribeFlintPage.close()")
            assert not outside, outside
            ctx.close()

            # ---------- 6. the one re-offer in Flint's chat ----------
            c2 = b.new_context(viewport={"width": 1440, "height": 900}); c2.add_init_script(member(tok))
            q = c2.new_page(); watch(q)
            q.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded"); q.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeFlintSetup && window.TribeFlintLocal", timeout=30000); q.wait_for_selector("#fl-input", state="visible", timeout=20000)
            out = ask(q, "zorble the frumious widget")
            assert len(out) == 1 and "local brain" not in out[0][0], out   # never asked before: no re-offer
            q.evaluate("TribeFlintSetup.later()")
            out = ask(q, "frobnicate the quux sideways")
            assert len(out) == 2 and "I’d have understood that with my local brain. Set it up?" in out[1][0] and out[1][1] == ["Set it up", "Not now"], out
            out = ask(q, "grumple the snark again")
            assert len(out) == 1 and "local brain" not in out[0][0], "only once"
            assert q.evaluate("TribeFlintSetup.state().reoffered") is True
            q.locator("#flint .fl-act", has_text="Set it up").last.click(); q.wait_for_selector("#flint-model #fmd-get", timeout=10000)
            assert "Local helper" in q.inner_text("#flint-model") or "Local" in q.inner_text("#flint-model h2")
            q.evaluate("TribeFlintModel.close()"); c2.close()

            # ---------- 7. phones ----------
            px = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
            px.add_init_script(SIGNED_OUT)
            ph = px.new_page(); watch(ph)
            ph.goto(BASE + "/?skipIntro=1&freshopen=1", wait_until="domcontentloaded"); ph.wait_for_function("window.TribeFlintModel && window.TribeFlintSetup", timeout=30000)
            info = ph.evaluate("TribeFlintModel.info()"); assert info["name"] == "potion-base-2M" and info["approx"] == 8 * 1024 * 1024 and info["phone"], info
            ph.evaluate("(() => { const d = document.createElement('div'); d.id = 'ph-slot'; d.style.cssText = 'position:fixed;inset:60px 0 auto 0;z-index:999'; document.body.appendChild(d); TribeFlintSetup.mount(d, 'home'); })()")
            ph.wait_for_selector("#ph-slot .fsu [data-fs=get]", timeout=10000)
            t = ph.inner_text("#ph-slot"); assert "about 8 MB" in t and "smaller version, for phones" in t, t
            assert ph.evaluate("document.querySelector('#ph-slot .fsu').getBoundingClientRect().right <= innerWidth + 1 && document.querySelector('#ph-slot [data-fs=get]').getBoundingClientRect().height >= 40"), "fits 390px with thumb-sized buttons"
            assert not [u for u in outside if "huggingface" in u], outside
            px.close(); b.close()
        assert not errors, errors
        print("e2e_flint_setup ok: sign-up, first run, the steps card and Settings offer it; Later is remembered; metered and low-storage say why; "
              f"pause at {part['got']} bytes, resume with Range, installed; one re-offer in chat; phones get the 8 MB model")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
