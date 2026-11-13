"""No stale UI (fix/desk-demo): an old version left behind (its service worker caches, its UI state in localStorage, an
old copy of a script in the shell cache) never brings an old layout back, and no legacy UI is reachable on any route.

  v_old:   before the app loads, old caches (tribecode-shell-v100, tribecode-v1, tribecode-cache) hold an old page and
           old scripts, and localStorage has the keys only old layouts read (docs.view, docs.sort, files.kind, nav, the
           old site builder's sitegen.*). The page is served from a real address (tribe.test, not localhost) so the
           service worker uses its phone/cloud strategy.
  current: the old caches are deleted, the dead keys are removed once (tribecode.uiCleanup), an old copy of a shell
           script planted in the CURRENT cache does not run (code is network first), and a new worker taking the page
           reloads it once (controllerchange).
  legacy:  on every destination of the router, Home's pages, the preview and the website designer, at 1440 and at 390,
           none of LEGACY is in the DOM, and the removed modules are gone (window.TribeSiteGen).
Usage: python app/test/e2e_no_stale.py
"""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5470 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
HOST = f"http://tribe.test:{PORT}"
OLD_CACHES = ["tribecode-shell-v100", "tribecode-v1", "tribecode-cache"]
DEAD_KEYS = ["tribecode.docs.sort", "tribecode.docs.view", "tribecode.files.kind", "tribecode.nav", "tribecode.sitegen.mode", "tribecode.sitegen.step"]
# Legacy UI that must not exist anywhere (docs/UI-CLEANUP.md)
LEGACY = {
    "the old site builder (sitegen.js)": "#wb-gen, .sg-modes, [data-sgmode], #sg-make, #sg-shuffle, .sg-step",
    "the old one-tap 'Make the website' card in the preview": "[data-act='mksite']",
    "the old onboarding wizard cards": ".ob-card, .ob-steps",
    "the old Home share/invite cards": ".home-share-card, .home-invite, .hub-docsearch",
    "the old Files grid and quick tiles": ".fg-grid, .fg-start, .fg-st",
    "the tour's old huddle and AI-boost cards": "#dw-huddle, #dw-boost, .dw-card",
    "the old Friends button and panel (friends.js; People › Friends now)": "#fr-btn, #fr-panel, #fr-scrim",
    # audit 2026-11-13 (docs/APP-AUDIT-2026-11-13.md)
    "the website designer's old chat log (Flint's one chat is mounted in #wdz-flint)": "#wdz-log",
    "the old setup sheet's first step (the create-a-tribe flow #tn replaced it)": "#su-start, .su-seats, .su-seat-t",
    "the rail's old camp button and the folding sidebar groups": "#rail-camp, .camp-btn, .nest-fold-head, .nest-fold-body, .pj-nav-legacy",
    "the old assist question chips, Flint nudges and the preview/canvas Flint boxes' own buttons": ".av-chips, .av-qs, .fl-nudges, .pvf-btns, .cvf-acts",
    "the old agents grid, invite pill and Work header": ".ag-grid, .invite-pill, .tl-head, .tl-cta",
}


def until(pg, js, timeout=20, what="", arg=None):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if pg.evaluate(js, arg) if arg is not None else pg.evaluate(js): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out: {what or js}")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-ns-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost,tribe.test"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"],
                           stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors, seen = [], {}
    try:
        for _ in range(60):
            try: urllib.request.urlopen(f"http://localhost:{PORT}/api/health", timeout=1); break
            except Exception: time.sleep(0.25)
        # the host's sign-in, made from this computer (a page on tribe.test is not "this computer" to the server)
        req = urllib.request.Request(f"http://localhost:{PORT}/api/bootstrap", data=json.dumps({"name": "Camp"}).encode(), headers={"Content-Type": "application/json"})
        token = json.load(urllib.request.urlopen(req))["token"]
        seed = json.dumps(json.dumps({"name": "Camp", "onboarded": True, "tour": {"done": True}, "server": {"url": "", "token": token}}))
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server", f"--host-resolver-rules=MAP tribe.test 127.0.0.1",
                                  f"--unsafely-treat-insecure-origin-as-secure={HOST}"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            ctx.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % seed)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

            # ---- v_old: an old version's caches and UI state, planted before the app runs ----
            pg.goto(HOST + "/offline.html")
            pg.evaluate("""async ([names, keys]) => {
              for (const n of names) { const c = await caches.open(n);
                await c.put(new Request('/'), new Response('<!doctype html><title>old</title><div id="old-ui">OLD LAYOUT</div>', { headers: { 'Content-Type': 'text/html' } }));
                await c.put(new Request('/hub.js'), new Response('window.__OLD_HUB = true', { headers: { 'Content-Type': 'text/javascript' } })); }
              for (const k of keys) localStorage.setItem(k, k.endsWith('mode') ? 'guided' : 'grid');
              localStorage.removeItem('tribecode.uiCleanup');
            }""", [OLD_CACHES, DEAD_KEYS])

            # ---- current: the app loads, its worker installs and takes the page ----
            pg.goto(HOST + "/?skipIntro=1")
            until(pg, "!!(window.TribeClient && TribeClient.connected())", 40, "the app connects")
            assert pg.locator("#old-ui").count() == 0 and not pg.evaluate("window.__OLD_HUB === true")
            left = pg.evaluate("keys => keys.filter(k => localStorage.getItem(k) !== null)", DEAD_KEYS)
            assert not left, f"old UI state survived: {left}"
            assert pg.evaluate("localStorage.getItem('tribecode.uiCleanup')"), "the clean-up ran"
            until(pg, "navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))", 30, "the worker is active")
            until(pg, "caches.keys().then(ks => !ks.some(k => ['tribecode-shell-v100', 'tribecode-v1', 'tribecode-cache'].includes(k)))", 20, "old caches deleted")
            cur = pg.evaluate("caches.keys()")
            assert all(k == "tribecode-runtime" or k.startswith("tribecode-shell-v") for k in cur) and len([k for k in cur if k.startswith("tribecode-shell-v")]) <= 1, cur

            # ---- an old copy of a shell script in the CURRENT cache never runs: code is network first ----
            if not pg.evaluate("!!navigator.serviceWorker.controller"):
                pg.reload(); until(pg, "!!navigator.serviceWorker.controller", 20, "the worker controls the page")
            shell = [k for k in pg.evaluate("caches.keys()") if k.startswith("tribecode-shell-v")][0]
            pg.evaluate("""async name => { const c = await caches.open(name);
              await c.put(new Request(location.origin + '/hub.js'), new Response('window.__OLD_HUB = true;' + (await (await fetch('/hub.js?plant=' + Date.now(), { cache: 'no-store' })).text()), { headers: { 'Content-Type': 'text/javascript' } })); }""", shell)
            pg.reload()
            until(pg, "!!(window.TribeClient && TribeClient.connected() && window.TribeHub)", 30, "reloaded")
            assert not pg.evaluate("window.__OLD_HUB === true"), "an old cached script ran (stale-while-revalidate on code)"
            # the page reloads once when a new worker takes it (pwa.js)
            assert pg.evaluate("navigator.serviceWorker.controller && typeof window.TribePWA === 'object'")
            src = (ROOT / "app" / "ui" / "pwa.js").read_text()
            assert "controllerchange" in src and "location.reload()" in src

            # ---- legacy UI: on every route, desktop and phone ----
            settings = pg.evaluate("localStorage.getItem('tribecode.settings.v1')")
            for dev, vp in [("desktop", {"width": 1440, "height": 900}), ("phone", {"width": 390, "height": 844})]:
                c2 = b.new_context(viewport=vp, is_mobile=dev == "phone", has_touch=dev == "phone")
                c2.add_init_script("try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(settings))
                q = c2.new_page(); q.on("pageerror", lambda e: errors.append(f"{dev} pageerror: {e}"))
                q.goto(f"http://localhost:{PORT}/?skipIntro=1")
                until(q, "!!(window.TribeClient && TribeClient.connected() && window.TribeShell && window.TribeHub)", 40, f"{dev} connects")
                assert q.evaluate("typeof window.TribeSiteGen") == "undefined", "the old site builder module still loads"
                keys = q.evaluate("TribeShell.dests().map(d => d.key)") + ["hub:home", "hub:files", "hub:design", "hub:code", "hub:work", "preview", "designer"]
                for k in keys:
                    try:
                        if k.startswith("hub:"): q.evaluate("k => TribeHub.open(k)", k[4:])
                        elif k == "preview": q.evaluate("window.TribePreview && TribePreview.open().then(() => TribePreview.setSource && TribePreview.setSource('site'))")
                        elif k == "designer": q.evaluate("window.TribeSiteDesigner && TribeSiteDesigner.open({ pid: TribeClient.project() })")
                        else: q.evaluate("k => TribeShell.go(k)", k)
                    except Exception: pass
                    time.sleep(0.5)
                    hits = q.evaluate("L => Object.entries(L).filter(([, s]) => document.querySelector(s)).map(([n]) => n)", LEGACY)
                    if hits: seen[f"{dev}:{k}"] = hits
                    try: q.evaluate("() => { try { TribePreview.close(); } catch (e) {} try { if (TribeSiteDesigner.state().open) TribeSiteDesigner.close(); } catch (e) {} document.querySelectorAll('.modal:not(.hidden) [data-close], #lk-close').forEach(b => b.click()); }")
                    except Exception: pass
                print(f"  {dev}: {len(keys)} routes, no legacy UI" if not any(x.startswith(dev) for x in seen) else f"  {dev}: legacy found")
                c2.close()
            b.close()
    finally:
        srv.terminate()
    assert not seen, json.dumps(seen, indent=1)
    assert not errors, "\n".join(errors[:20])
    print("e2e_no_stale: OK")


if __name__ == "__main__":
    main()
