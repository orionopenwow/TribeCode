"""The demo, walked (pass 8): what a visitor sees after pressing Try the demo on the website.

A. The narrated tour (?demo=showcase): in every chapter Flint's spotlight lands on a control a person can see (exists,
   on screen, nothing over it), no chapter loses its target, no console errors, no "This needs the tribe online" card.
B. Show me inside the demo (?demo=showcase&tour=off): every quick guide and lesson step rings something visible, at
   1440 and on a 390px phone (the same judge as e2e_demo_rings.py, rings_check.py).
C. Overlays left open (the invite window, a sheet veil with no sheet, the website's "what kind of site" screen) are
   closed by Show me before it rings.
D. The Pages layout (site at /, app under /app/) loads the app with version-tagged script addresses.
Usage: python app/test/e2e_demo_walk.py [--shots DIR] [--only ABCD]
"""
import functools, http.server, json, os, re, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_showcase as ES
import rings_check as RC

ROOT = Path(__file__).resolve().parents[2]
PORT = 5870 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"; APP = BASE + "/app/"
ES.BASE = BASE
SHOTS = Path(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else None
ONLY = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else "ABCD"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}
SEED = "try { if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s) } catch (e) {}" % json.dumps(json.dumps(REAL))
IN_DEMO = "window.TribeOffline && TribeOffline.mode() === 'showcase' && window.TribeClient && TribeClient.connected() && window.TribeQuick && window.TribeLessons && window.TribeFlintLessons && TribeClient.project && TribeClient.project()"
CLEAN = "(() => { try { if (window.TribeFlintPage && document.querySelector('.fpg')) TribeFlintPage.close(); if (window.TribeFlint) TribeFlint.closeFull(); if (window.TribeSettings) TribeSettings.close(); document.querySelectorAll('.fls-ring, .fls-tip').forEach(e => e.remove()); } catch (e) {} })()"
SPOT = r"""() => { const s = document.querySelector('#dt-spot'); if (!s) return null; if (s.classList.contains('wide') || !s._el) return { want: s._want || null, v: s._want ? 'no target' : 'none asked' };
  const d = el => !el ? 'nothing' : (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
  if (getComputedStyle(s._el).pointerEvents === 'none') return { want: s._want || d(s._el), v: s._el.getClientRects().length ? 'ok' : 'no size' };   // a drawn caret or cursor: nothing to click, only to see
  return { want: s._want || d(s._el), v: window.__ringJudge(s._el, null, 0, d) }; }"""
NEEDS = "[...document.querySelectorAll('.toast, .ui-sheet, .modal, [class*=needs]')].filter(e => e.getClientRects().length && /needs the tribe online/i.test(e.textContent)).length"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text[:200]}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))


def shot(pg, name):
    if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / f"walk-{name}.png"))


def tour(pg, tag):
    """A: play the narrated tour quickly; judge every spotlight; press Next after each chapter."""
    pg.wait_for_function("window.TribeDirector && TribeDirector._test.state().running", timeout=30000)
    pg.wait_for_timeout(600)
    if pg.locator("#dt-in-skip").count(): pg.click("#dt-in-skip")
    pg.evaluate(RC.JUDGE); scenes = pg.evaluate("TribeDirector._test.state().scenes")
    seen, needs, t0, last = {}, 0, time.time(), None
    while True:
        st = pg.evaluate("TribeDirector._test.state()")
        if st["done"] or not st["running"]: break
        assert time.time() - t0 < 480, f"{tag}: the tour did not finish: {st}"
        pg.evaluate("TribeDirector._test.rush(6)")
        if st["id"] != last: last = st["id"]; pg.wait_for_timeout(350); shot(pg, f"{tag}-{scenes.index(last):02d}-{last}")
        r = pg.evaluate(SPOT)
        if r and r["v"] not in ("none asked", "the target left the page"):   # a redrawn caret or a tab that went with its page: the box stays where it was
            key = (st["id"], r["want"])
            if r["v"] == "ok": seen[key] = "ok"
            elif seen.get(key) != "ok":
                pg.wait_for_timeout(450); r2 = pg.evaluate(SPOT)   # give a moving layout a moment before judging it missed
                if r2 and r2["v"] == "ok" and r2["want"] == r["want"]: seen[key] = "ok"
                elif key not in seen: seen[key] = r["v"]; shot(pg, f"{tag}-miss-{st['id']}")
        needs += pg.evaluate(NEEDS)
        nx = pg.locator("#dt-say-next:visible")
        if nx.count():
            try: nx.first.click(timeout=2000)
            except Exception: pass
        pg.wait_for_timeout(120)
    log = pg.evaluate("TribeDirector._test.log()")
    reached = [e["scene"] for e in log if e["name"] == "reached"]
    assert reached == scenes, f"{tag}: chapters reached {reached} of {scenes}"
    bad = [f"{k[0]}: spotlight on {k[1]}: {v}" for k, v in seen.items() if v != "ok"] + [f"{e['scene']}: {e['name']} {e.get('info') or ''}" for e in log if not e["ok"]]
    assert not bad, f"{tag}: {len(bad)} tour problems:\n  " + "\n  ".join(bad)
    assert not needs, f"{tag}: 'This needs the tribe online' showed in the demo"
    per = {s: sum(1 for k in seen if k[0] == s) for s in scenes}
    print(f"  ok  {tag}: {len(scenes)} chapters, {len(seen)} spotlights all on something visible ({time.time() - t0:.0f} s); chapters with no spotlight: {[s for s, n in per.items() if not n]}")


def rings(pg, tag):
    """B: every Show me inside the demo."""
    bad, n = [], 0
    for gid in pg.evaluate("TribeQuick.all().filter(g => g.show).map(g => g.id)"):
        pg.evaluate(CLEAN); pg.wait_for_timeout(150); pg.evaluate("g => TribeQuick.show(g)", gid); n += 1
        v = RC.judge_fls(pg)
        if v != "ok": bad.append(f"guide {gid}: {v}"); shot(pg, f"{tag}-ring-{gid}")
    for tid, steps in pg.evaluate("TribeLessons.tracks().map(t => [t.id, TribeLessons.steps(t.id).map(s => s.id)])"):
        for sid in steps:
            pg.evaluate(CLEAN); pg.wait_for_timeout(150); pg.evaluate("([t, s]) => TribeLessons.show(t, s)", [tid, sid]); n += 1
            v = RC.judge_fls(pg)
            if v != "ok": bad.append(f"lesson {tid}/{sid}: {v}"); shot(pg, f"{tag}-ring-{tid}-{sid}")
    pg.evaluate(CLEAN)
    assert not bad, f"{tag}: {len(bad)} of {n} rings miss in the demo:\n  " + "\n  ".join(bad)
    assert not pg.evaluate(NEEDS), f"{tag}: 'This needs the tribe online' showed in the demo"
    print(f"  ok  {tag}: all {n} Show me rings land on something visible inside the demo")


def main():
    errors = []
    root = ES.assemble()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(root)))
    srv.handle_error = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def page(w, h, tag, phone=False):
                ctx = b.new_context(viewport={"width": w, "height": h}, **({"is_mobile": True, "has_touch": True} if phone else {}))
                ctx.add_init_script(SEED); ES.route_external(ctx, "ok", [])
                pg = ctx.new_page(); watch(pg, tag, errors); return pg

            def demo(w, h, tag, phone=False):
                pg = page(w, h, tag, phone); pg.goto(APP + "?demo=showcase&tour=off"); pg.wait_for_function(IN_DEMO, timeout=30000)
                pg.evaluate("TribeQuick.load()"); pg.wait_for_function("TribeLessons.tracks().length === 5")
                pg.evaluate("window.TribeShowcase && TribeShowcase.hold && TribeShowcase.hold(true)"); return pg

            if "D" in ONLY:
                html = (root / "app" / "index.html").read_text()
                local = [s for s in re.findall(r'<script[^>]*\ssrc="([^"]+)"', html) if not s.startswith(("http", "//"))]
                assert local and all("?v=" in s for s in local), [s for s in local if "?v=" not in s][:5]
                pg = page(1440, 900, "site"); pg.goto(BASE + "/"); pg.wait_for_load_state("domcontentloaded")
                href = pg.evaluate("(() => { const a = [...document.querySelectorAll('a[href*=\"demo=showcase\"]')][0]; return a ? a.href : ''; })()")
                assert href, "the website has a Try the demo link"
                pg.goto(href); pg.wait_for_function("window.TribeOffline && TribeOffline.mode() === 'showcase' && TribeClient.connected()", timeout=30000)
                print(f"  ok  the website's demo link opens the demo ({len(local)} version-tagged scripts)"); pg.context.close()

            if "A" in ONLY:
                pg = page(1440, 900, "tour-1440"); pg.goto(APP + "?demo=showcase"); tour(pg, "tour-1440"); pg.context.close()
                pg = page(390, 844, "tour-390", True); pg.goto(APP + "?demo=showcase"); tour(pg, "tour-390"); pg.context.close()

            if "C" in ONLY:
                pg = demo(1440, 900, "over-1440")
                pg.evaluate("document.querySelector('#invite-modal').classList.remove('hidden')"); pg.wait_for_timeout(300)   # the invite window left open
                pg.evaluate("TribeQuick.show('add-task')"); v = RC.judge_fls(pg); assert v == "ok", ("Show me with the invite window open", v)
                pg.evaluate(CLEAN); pg.evaluate("(() => { const v = document.createElement('div'); v.className = 'ui-veil'; v.id = 'stray-veil'; document.body.appendChild(v); })()")   # a veil with no sheet
                pg.evaluate("TribeQuick.show('add-task')"); v = RC.judge_fls(pg); assert v == "ok" and not pg.locator("#stray-veil").count(), ("Show me with a stray veil", v)
                pg.evaluate(CLEAN); pg.evaluate("TribeSiteDesigner.open(TribeClient.project(), { start: true })"); pg.wait_for_selector("#wdz-start", timeout=15000)   # the website's kinds screen
                pg.evaluate("TribeQuick.show('add-task')"); v = RC.judge_fls(pg); assert v == "ok", ("Show me with the website start screen open", v)
                print("  ok  Show me closes the invite window, a stray veil and the website start screen first"); pg.context.close()

            if "B" in ONLY:
                pg = demo(1440, 900, "demo-1440"); rings(pg, "demo-1440"); pg.context.close()
                pp = demo(390, 844, "demo-390", True); rings(pp, "demo-390"); pp.context.close()
            b.close()
        errors[:] = [e for e in errors if "192.0.2.10" not in e]
        assert not errors, errors[:12]
        print("e2e_demo_walk: OK")
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
