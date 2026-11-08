"""Showcase mode (app/ui/showcase.js on top of the offline demo, app/ui/offline.js): a pretend "Campfire Crew" tribe
that plays out the workflow by itself. NO tribe server: the Pages layout (site/ at the root, app/ui under /app/, like
.github/workflows/pages.yml and e2e_showcase.py) is served by a plain static file server.

Checks: ?demo=showcase starts it with zero clicks (2 projects, 4 friends, the agents); at 2x, within ~20 s, at least
3 new chat messages, a task changing column, a gist and the milestone advancing; Pause stops events; a fast-forward
(test hook) ends the season with the celebration card; @claude still answers you; Leave restores your settings
exactly; the chooser's "Watch it come alive" starts it too; the website's "Watch a demo tribe" link and demo.html's
"Host a demo tribe" card go to app/?demo=showcase and land in it; a phone at 390 sees the events in Chat and on Tasks,
has no sideways scroll, and keeps working offline after the first visit. No console errors.
Usage: python app/test/e2e_showcase_demo.py [--shots]   (--shots saves docs/screenshots/showcase-demo-*.png)
"""
import functools, http.server, json, os, shutil, sys, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_showcase as ES   # the Pages layout and the mocked GitHub API (nothing leaves the test)
assemble, route_external = ES.assemble, ES.route_external

ROOT = Path(__file__).resolve().parents[2]
PORT = 4997 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
APP = BASE + "/app/"
ES.BASE = BASE   # route_external lets this server through
SHOTS = ROOT / "docs" / "screenshots"
REAL = {"name": "Orion", "color": "#7C5CFF", "onboarded": True, "server": {"url": "http://192.0.2.10:4747", "token": ""}, "hosting": False}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header("Cache-Control", "no-cache"); super().end_headers()


def watch(page, tag, errors):
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"{tag} console: {m.text}"))
    page.on("response", lambda r: r.status >= 400 and errors.append(f"{tag} http {r.status}: {r.url}"))


def settings(page): return page.evaluate("JSON.parse(localStorage.getItem('tribecode.settings.v1'))")


def sideways(page, tag):
    sw, iw = page.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    assert sw <= iw + 1, f"{tag}: sideways scroll ({sw} > {iw})"


def until(page, js, timeout=5000, arg=None):
    """Poll a (possibly async) expression until it is truthy. page.wait_for_function treats a Promise as truthy."""
    end = time.time() + timeout / 1000
    while True:
        v = page.evaluate(js) if arg is None else page.evaluate(js, arg)
        if v: return v
        assert time.time() < end, f"timed out waiting for: {js[:160]}"
        time.sleep(0.25)


def ready(page):
    page.wait_for_function("window.TribeOffline && TribeOffline.mode() === 'showcase' && window.TribeClient && TribeClient.connected()", timeout=15000)


SNAP = """async () => {
  const [c, t, g] = await Promise.all([TribeClient.api('/chat/general'), TribeClient.api('/tasks'), TribeClient.api('/gists')]);
  return { chat: c.messages.length, tasks: Object.fromEntries(t.tasks.map(x => [x.id, x.status])), gists: g.gists.length, done: TribeShowcase._test.info().done, step: TribeShowcase._test.info().step };
}"""


def started(page, tag):
    ready(page)
    assert "demo=" not in page.evaluate("location.search"), "the parameter is dropped so a reload keeps going"
    st = page.evaluate("TribeClient.state()")
    assert st["tribe"]["name"] == "Campfire Crew", st["tribe"]
    friends = sorted(m["name"] for m in st["members"] if m["role"] == "builder")
    assert friends == ["Jay", "Maya", "Rio", "Sam"], friends
    agents = [m["name"] for m in st["members"] if m["role"] == "agent"]
    assert len(agents) >= 2 and any(a.endswith("'s Claude") for a in agents), agents
    until(page, "TribeClient.api('/projects').then(r => r.projects.length === 2 && r.projects.some(p => p.name === 'Lantern Run') && r.projects.some(p => p.name === 'Tavern 3D'))", timeout=5000)
    until(page, "TribeClient.api('/tasks').then(r => r.tasks.length >= 10 && ['backlog', 'doing', 'review', 'done'].every(s => r.tasks.some(t => t.status === s)))", timeout=5000)
    until(page, "TribeClient.api('/docs').then(r => ['Level design', 'Art direction', 'Living notes'].every(n => r.docs.some(d => d.title === n)))", timeout=5000)
    until(page, "TribeClient.api('/milestones').then(r => r.milestones.some(m => m.version === 'v0.2' && m.status === 'planned'))", timeout=5000)
    until(page, "TribeClient.api('/proposals').then(r => r.proposals.some(p => p.status === 'open'))", timeout=5000)
    until(page, "TribeClient.api('/vision').then(r => r.text.includes('Lantern Run'))", timeout=5000)
    page.wait_for_selector("#demo-pill.sc", state="attached", timeout=5000)


def lively(page, tag):
    """At 2x: within ~20 s, 3+ chat messages, a task changing column, a gist and the milestone advancing."""
    before = page.evaluate(SNAP)
    t0 = time.time()
    while True:
        now = page.evaluate(SNAP)
        moved = [k for k, s in now["tasks"].items() if k in before["tasks"] and before["tasks"][k] != s]
        if now["chat"] - before["chat"] >= 3 and moved and now["gists"] > before["gists"] and now["done"] > before["done"]: break
        assert time.time() - t0 < 24, f"{tag}: not lively enough in 24 s: {before} -> {now}"
        time.sleep(0.5)
    print(f"  {tag}: lively after {time.time() - t0:.1f} s")
    return moved


def main():
    errors = []
    root = assemble()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(root)))
    srv.handle_error = lambda *a: None   # a reload cancels requests in flight (broken pipe): not an error
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    seed = "if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s)" % json.dumps(json.dumps(REAL))
    shots = "--shots" in sys.argv
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---- desktop: zero clicks from the URL ----
            ctx = b.new_context(viewport={"width": 1440, "height": 900}); ctx.add_init_script(seed); seen = []; route_external(ctx, "ok", seen)
            pg = ctx.new_page(); watch(pg, "desktop", errors)
            pg.goto(APP + "?demo=showcase")
            started(pg, "desktop")
            assert pg.locator("#intro").count() == 0, "no intro"
            assert "Showcase" in pg.text_content("#demo-pill")
            # the pill's speed control
            pg.click("#demo-pill"); pg.wait_for_selector("#demo-pop.sc-pop", state="visible")
            for sel in ["#sc-play", "#sc-speed-2", "#sc-restart", "#sc-quiet", "#od-leave"]: assert pg.locator(sel).is_visible(), sel
            pg.click("#sc-speed-2"); assert pg.evaluate("TribeShowcase._test.info().speed") == 2
            pg.keyboard.press("Escape")
            pg.wait_for_selector("#sc-mile", state="visible", timeout=8000)   # the milestone card on the project home
            m0 = pg.evaluate("TribeShowcase._test.info().done")
            lively(pg, "desktop")
            pg.wait_for_function(f"document.querySelector('#sc-mile .sc-mile-n') && parseInt(document.querySelector('#sc-mile .sc-mile-n').textContent) > {m0}", timeout=6000)
            if shots: pg.screenshot(path=str(SHOTS / "showcase-demo-desktop.png"))
            # the board shows it too
            pg.evaluate("TribeApp.show('tasks')"); pg.wait_for_selector("#board [data-col=done] .task", timeout=8000)

            # Pause stops events
            pg.click("#demo-pill"); pg.click("#sc-play")
            assert pg.evaluate("TribeShowcase._test.info().paused")
            pg.keyboard.press("Escape")
            a = pg.evaluate(SNAP); time.sleep(6); z = pg.evaluate(SNAP)
            assert a["step"] == z["step"] and a["chat"] == z["chat"] and a["tasks"] == z["tasks"], ("paused but things happened", a, z)
            assert "paused" in pg.text_content("#demo-pill")

            # your own actions still work: @claude answers
            pg.evaluate("TribeApp.show('chat')"); pg.wait_for_selector("#chat-input", state="visible")
            pg.fill("#chat-input", "this is fun, @claude what are you working on?"); pg.press("#chat-input", "Enter")
            pg.wait_for_function("[...document.querySelectorAll('#chat-list *')].some(e => e.textContent.includes('this is fun'))", timeout=6000)
            until(pg, "TribeClient.api('/chat/general').then(r => r.messages.slice(-3).some(m => m.by === 'claude' && m.text.includes('pretend Claude')))", timeout=8000)
            if shots: pg.screenshot(path=str(SHOTS / "showcase-demo-desktop-chat.png"))

            # fast-forward to the end of the season: the release and the celebration
            pg.evaluate("TribeApp.show('home')")
            pg.evaluate("TribeShowcase._test.finish()")
            pg.wait_for_selector("#sc-cele", state="visible", timeout=5000)
            assert "v0.2 shipped" in pg.text_content("#sc-cele"), pg.text_content("#sc-cele")
            info = pg.evaluate("TribeShowcase._test.info()")
            assert info["shipped"] == ["v0.2"] and info["season"] == 2 and info["milestone"] == "v0.3", info   # the vote made the next milestone
            until(pg, "TribeClient.api('/milestones').then(r => r.milestones.some(m => m.version === 'v0.2' && m.status === 'released'))", timeout=5000)
            until(pg, "TribeClient.api('/notify/inbox').then(r => r.items.some(i => i.type === 'release'))", timeout=5000)
            until(pg, "TribeClient.api('/projects/lantern-run/pulse').then(r => !!r.repo && r.recent.some(x => x.kind === 'commit'))", timeout=5000)   # the repo got pinned, commits landed
            pg.wait_for_selector("#pj-check.done", timeout=8000)   # the Onboarding Checklist ticked to All set
            nf = pg.text_content("#nf-count"); assert nf.strip() and int(nf.replace("+", "")) >= 3, f"the bell counts up: {nf!r}"
            if shots: time.sleep(0.5); pg.screenshot(path=str(SHOTS / "showcase-demo-desktop-shipped.png"))
            # a new season keeps going
            pg.evaluate("TribeShowcase._test.beat(3)")
            assert pg.evaluate("TribeShowcase._test.info().step") == 3

            # Leave restores your settings exactly
            pg.click("#demo-pill"); pg.click("#od-leave")
            pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            st = settings(pg)
            assert st["server"] == REAL["server"] and st.get("hosting") == REAL["hosting"], st["server"]
            assert pg.evaluate("localStorage.getItem('tribecode.offlineDemo.v1')") is None
            assert pg.locator("#demo-pill").count() == 0 and pg.locator("#sc-cele").count() == 0

            # the chooser: Watch it come alive
            pg.wait_for_function("window.TribeHub", timeout=10000); pg.evaluate("TribeHub.open('home')"); pg.wait_for_selector("#hub-demo", state="visible", timeout=10000)
            pg.click("#hub-demo"); pg.wait_for_selector("#od-pick-alive", state="visible")
            assert pg.locator("#od-pick-quiet").is_visible()
            pg.click("#od-pick-alive"); ready(pg)
            assert pg.evaluate("TribeClient.state().tribe.name") == "Campfire Crew"
            # Explore quietly from the showcase keeps the tribe and stops the script
            pg.click("#demo-pill"); pg.click("#sc-quiet")
            pg.wait_for_function("window.TribeOffline && TribeOffline.mode() === 'quiet' && window.TribeClient && TribeClient.connected()", timeout=10000)
            assert pg.evaluate("TribeClient.state().tribe.name") == "Campfire Crew"
            pg.evaluate("TribeOffline.leave()"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            assert settings(pg)["server"] == REAL["server"]

            # the website: "Watch a demo tribe" goes to app/?demo=showcase and lands in it
            pg.goto(BASE + "/")
            link = pg.locator(".hero a:has-text('Watch a demo tribe')")
            assert link.get_attribute("href") == "app/?demo=showcase"
            for sel in ["footer a:has-text('Demo tribe')"]: assert pg.locator(sel).get_attribute("href") == "app/?demo=showcase", sel
            link.click(); pg.wait_for_url("**/app/**", timeout=10000); started(pg, "site link")
            pg.evaluate("TribeOffline.leave()"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            # demo.html: "Host a demo tribe"
            pg.goto(APP + "demo.html"); pg.wait_for_selector("#host-demo", state="visible")
            pg.click("#host-demo"); started(pg, "demo.html card")
            pg.evaluate("TribeOffline.leave()"); pg.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            assert settings(pg)["server"] == REAL["server"]
            ctx.close()

            # ---- phone 390 ----
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); ctx.add_init_script(seed); route_external(ctx, "ok", [])
            ph = ctx.new_page(); watch(ph, "phone", errors)
            ph.goto(APP + "?demo=showcase"); started(ph, "phone")
            sideways(ph, "phone home")
            ph.evaluate("TribeShowcase.speed(2)")
            if shots: ph.wait_for_selector("#sc-mile", timeout=8000); time.sleep(0.5); ph.screenshot(path=str(SHOTS / "showcase-demo-phone.png"))
            # Chat: new messages appear by themselves
            ph.evaluate("TribeApp.show('chat')"); ph.wait_for_selector("#chat-list", state="attached", timeout=8000)
            ids0 = set(ph.evaluate("TribeClient.api('/chat/general').then(r => r.messages.map(m => m.id))"))
            t0 = time.time()
            while True:
                fresh = [m for m in ph.evaluate("TribeClient.api('/chat/general').then(r => r.messages)") if m["id"] not in ids0 and m["by"] != "tribecode"]
                if len(fresh) >= 2: break
                assert time.time() - t0 < 20, "phone: no new chat messages in 20 s"
                time.sleep(0.5)
            newest = fresh[-1]
            snip = ph.evaluate("t => t.replace(/[*`_#>]/g, '').split('\\n')[0].trim().slice(0, 18)", newest["text"])
            ph.wait_for_function("s => document.querySelector('#chat-list').textContent.replace(/\\s+/g, ' ').includes(s)", arg=snip, timeout=6000)   # on screen, not just in the store
            sideways(ph, "phone chat")
            if shots: ph.screenshot(path=str(SHOTS / "showcase-demo-phone-chat.png"))
            # Tasks: a card moves column by itself
            ph.evaluate("TribeApp.show('tasks')"); ph.wait_for_selector("#board [data-col] .task", state="attached", timeout=8000)
            cols0 = ph.evaluate("Object.fromEntries([...document.querySelectorAll('#board .task[data-id]')].map(t => [t.dataset.id, t.closest('[data-col]').dataset.col]))")
            ph.wait_for_function("c0 => [...document.querySelectorAll('#board .task[data-id]')].some(t => c0[t.dataset.id] && c0[t.dataset.id] !== t.closest('[data-col]').dataset.col)", arg=cols0, timeout=25000)
            sideways(ph, "phone tasks")
            if shots: ph.screenshot(path=str(SHOTS / "showcase-demo-phone-tasks.png"))
            ph.evaluate("TribeShowcase._test.finish()"); ph.wait_for_selector("#sc-cele", state="visible", timeout=5000)
            sideways(ph, "phone celebration")
            if shots: ph.screenshot(path=str(SHOTS / "showcase-demo-phone-shipped.png"))
            # offline after the first visit: the shell from the service worker cache, the tribe from this browser
            if ph.evaluate("!!navigator.serviceWorker"):
                ph.wait_for_function("navigator.serviceWorker.controller", timeout=15000)
                until(ph, "caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.match('showcase.js'))))).then(r => r.some(Boolean))", timeout=15000)
                ctx.set_offline(True)
                ph.reload(); ready(ph)
                assert ph.evaluate("TribeShowcase._test.info().shipped") == ["v0.2"]
                ctx.set_offline(False)
            ph.evaluate("TribeApp.show('home')"); time.sleep(0.3)
            ph.wait_for_selector("#demo-pill", state="visible"); ph.click("#demo-pill"); ph.wait_for_selector("#demo-pop", state="visible")
            sideways(ph, "phone popout")
            ph.click("#od-leave"); ph.wait_for_function("window.TribeOffline && !TribeOffline.active()", timeout=10000)
            assert settings(ph)["server"] == REAL["server"]
            ctx.close()
            b.close()
    finally:
        srv.shutdown(); shutil.rmtree(root, ignore_errors=True)
    # Outside the demo this static page has no tribe server: the app's sign-in probe (GET /api/health) gets a 404.
    probes = [e for e in errors if " http 404: " in e and e.endswith("/api/health")]
    noise = [e for e in errors if e not in probes and "favicon" not in e]
    for tag in ("desktop", "phone"):
        n = sum(1 for e in probes if e.startswith(tag))
        for e in [e for e in noise if e.startswith(tag + " console: Failed to load resource") and "404" in e][:n]: noise.remove(e)
    assert not noise, "\n".join(noise[:20])
    print("e2e_showcase_demo: OK")


if __name__ == "__main__":
    main()
