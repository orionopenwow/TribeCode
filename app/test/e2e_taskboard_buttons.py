"""Every button on the Task Board does what it says (feat/tasks-company).
Board · Bugs · Proposals · Milestones · Calendar · Code repository · Visuals: first the buttons the user named, with
the exact effect each must have (Release with no repository explains and offers to set one up; Drift radar explains
why it's empty; New proposal opens the form; the Code repository tab can create one ...). Then a sweep clicks every
visible button in each tab and asserts a visible effect: a change in the tab, a toast, a dialog or sheet, a file
picker or a page change. Never nothing, never a page error, never a server error.
Usage: python app/test/e2e_taskboard_buttons.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6312 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
TABS = ["tasks", "bugs", "board", "milestones", "calendar", "repo", "visuals"]
# Buttons the sweep leaves alone: they leave the page, delete things or are covered above.
SKIP = ("Delete", "Remove", "Withdraw", "Send to a desktop")

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

WATCH = """() => { window.__fx = { mut: 0, toast: '' };
  const sec = document.querySelector('.main > section:not(.hidden)');
  if (window.__mo) window.__mo.disconnect();
  window.__mo = new MutationObserver(l => { for (const r of l) { const n = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    if (n && n.closest && n.closest('.toast')) { window.__fx.toast = (document.querySelector('.toast') || {}).textContent || 'toast'; continue; }
    if (n && n.closest && n.closest('#view-tabs, .rail, .side, #right, #rpanel, .userbar')) continue; window.__fx.mut++; } });
  window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  return [location.hash, document.body.dataset.view]; }"""
LIST = """() => { const seen = {}; return [...document.querySelectorAll('.main > section:not(.hidden) button, .main > section:not(.hidden) [role=switch]')]
  .filter(b => b.offsetParent && !b.disabled && !b.closest('#tk-drawer'))
  .map(b => { const t = (b.getAttribute('aria-label') || b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50); seen[t] = (seen[t] || 0) + 1; return { t, n: seen[t] - 1 }; }); }"""
PICK = """([t, n]) => { document.querySelectorAll('[data-sweep]').forEach(x => x.removeAttribute('data-sweep'));
  const l = [...document.querySelectorAll('.main > section:not(.hidden) button, .main > section:not(.hidden) [role=switch]')]
    .filter(b => b.offsetParent && !b.disabled && !b.closest('#tk-drawer') && (b.getAttribute('aria-label') || b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50) === t);
  if (!l[n]) return false; l[n].dataset.sweep = '1'; return true; }"""
SIG = """() => { const sec = document.querySelector('.main > section:not(.hidden)'); if (!sec) return '';
  return sec.innerText + '|' + [...sec.querySelectorAll('[aria-pressed],[aria-checked],[aria-selected],[aria-expanded],.on,.active,details')].map(x => (x.getAttribute('aria-pressed') || '') + (x.getAttribute('aria-checked') || '') + (x.getAttribute('aria-selected') || '') + (x.getAttribute('aria-expanded') || '') + x.className + (x.open ? 'o' : '') + ':' + (x.textContent || '').trim().slice(0, 30)).join(',')
    + '|' + [...sec.querySelectorAll('input,textarea,select')].map(x => x === document.activeElement ? 'F' : '').join(''); }"""
ON = """() => { const b = document.querySelector("[data-sweep='1']"); return !!b && (b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true' || b.getAttribute('aria-selected') === 'true' || b.classList.contains('on') || b.classList.contains('active')); }"""
OPEN = """() => [...document.querySelectorAll('#invite-modal, .modal, [role=dialog], #tk-pop, .tk-drawer, dialog, .sheet, .flint-panel, #flint')].filter(x => { const r = x.getBoundingClientRect(), c = getComputedStyle(x); return r.width > 40 && r.height > 40 && c.visibility !== 'hidden' && c.display !== 'none' && !x.classList.contains('hidden') && !x.hidden; }).map(x => x.id || x.className).join('|')"""
CLOSE = """() => { document.querySelectorAll('#invite-modal, .modal').forEach(m => m.classList.add('hidden')); const p = document.getElementById('tk-pop'); if (p) p.remove();
  if (window.TribeTasks) TribeTasks.close(); document.querySelectorAll('dialog[open]').forEach(d => d.close()); }"""

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-tbb-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors, bad = [], []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Lantern Run", "bio": "A cozy platformer"}, token=host)); pid = (p.get("project") or p)["id"]
        ok(api("/tasks", "POST", {"title": "Make level 1", "body": "Three jumps"}, token=host, project=pid))
        ok(api("/proposals", "POST", {"title": "Add a boss", "body": "## Plan\nA boss\n## Tasks\n- [ ] boss art"}, token=host, project=pid))
        ok(api("/bugs", "POST", {"title": "Jump feels floaty", "severity": "normal"}, token=host, project=pid)) if api("/bugs", "POST", {"title": "Jump feels floaty"}, token=host, project=pid)[0] != 200 else None

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_page(viewport={"width": 1400, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("response", lambda r: r.status >= 500 and "/api/" in r.url and bad.append(f"{r.status} {r.url}"))
            pg.on("dialog", lambda d: d.dismiss())
            pg.add_init_script("try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})) } catch (e) {}" % (BASE, host))
            pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
            pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeShell", timeout=20000)
            pg.evaluate(f"TribeProjects.switchTo('{pid}', 'home')"); pg.wait_for_timeout(900)
            def go(v):
                pg.evaluate(CLOSE); pg.evaluate("try { localStorage.setItem('tribecode.tasksView', 'list'); TribeTasks.view('list'); TribeTasks.filter(''); } catch (e) {}")
                pg.evaluate(f"TribeShell.go('{v}')"); pg.wait_for_timeout(1100)

            # ---- the named buttons, exactly
            go("board")
            pg.wait_for_selector("#radar-list [data-connect-repo]", timeout=8000)   # Drift radar empty: why + a way out
            assert "repo" in pg.inner_text("#radar-lead").lower() and pg.locator("#radar-list .radar-why p").is_visible()
            pg.click("#prop-new"); pg.wait_for_selector("#invite-modal:not(.hidden) #np-title", timeout=3000)   # New proposal opens the form
            pg.fill("#np-title", "Touch controls"); pg.click("#np-go")
            pg.wait_for_function("!document.querySelector('#invite-modal') || document.querySelector('#invite-modal').classList.contains('hidden')", timeout=5000)
            assert any(x["title"] == "Touch controls" for x in ok(api("/proposals", token=host, project=pid))["proposals"])
            go("milestones")   # the Milestones tab lands on the milestones
            pg.wait_for_selector("#ms-list [data-release]", timeout=5000)
            assert pg.evaluate("(() => { const r = document.querySelector('#ms-list').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()"), "milestones in view"
            pg.click("#ms-list [data-release]")   # Release with no repository: explains, offers to set one up
            pg.wait_for_selector("#invite-modal:not(.hidden) #rel-repo", timeout=3000)
            assert "no code repository" in pg.inner_text("#invite-body").lower()
            assert all(m["status"] != "released" for m in ok(api("/milestones", token=host, project=pid))["milestones"]), "nothing released yet"
            pg.click("#rel-plain")   # ...or records it without a tag, and says so
            pg.wait_for_function("document.querySelector('.toast') && /no git tag/.test(document.querySelector('.toast').textContent)", timeout=5000)
            go("repo")   # Code repository: one click makes one
            pg.wait_for_selector("#pj-mkrepo", timeout=8000); pg.click("#pj-mkrepo")
            pg.wait_for_function("document.querySelector('.toast') && /Code repository ready/.test(document.querySelector('.toast').textContent)", timeout=20000)
            assert ok(api("/milestones", token=host, project=pid))["repo"], "the project has a repository now"
            go("board"); pg.wait_for_function("!document.querySelector('#radar-list [data-connect-repo]') && /Branches compared/.test(document.querySelector('#radar-lead').textContent)", timeout=8000)
            go("calendar"); pg.click("#cal-new"); pg.wait_for_function(OPEN, timeout=3000)
            go("bugs"); pg.click("#bug-new"); pg.wait_for_function(OPEN, timeout=3000)
            go("visuals")
            with pg.expect_file_chooser(timeout=3000): pg.click("#vis-up")

            # ---- the sweep: every visible button in every tab has a visible effect
            silent = []
            for v in TABS:
                go(v)
                items = pg.evaluate(LIST); assert items, f"{v}: no buttons at all"
                for it in items:
                    if any(s in it["t"] for s in SKIP): continue
                    go(v)
                    if not pg.evaluate(PICK, [it["t"], it["n"]]): continue   # that button isn't on screen in this state
                    loc = pg.locator("[data-sweep='1']")
                    before = pg.evaluate(WATCH); sig0 = pg.evaluate(SIG); open0 = pg.evaluate(OPEN); e0 = len(errors); chooser = []
                    pg.once("filechooser", lambda f: chooser.append(f))
                    try: loc.first.click(timeout=2500)
                    except Exception as ex: silent.append(f"{v}: {it['t']!r} could not be clicked ({str(ex)[:60]})"); continue
                    pg.wait_for_timeout(700)
                    fx = pg.evaluate("window.__fx"); after = pg.evaluate("[location.hash, document.body.dataset.view]")
                    seen = pg.evaluate(SIG) != sig0 or fx["toast"] or chooser or after != before or pg.evaluate(OPEN) != open0 or (pg.evaluate(PICK, [it["t"], it["n"]]) and pg.evaluate(ON))
                    if errors[e0:]: silent.append(f"{v}: {it['t']!r} threw {errors[e0:]}")
                    elif not seen: silent.append(f"{v}: {it['t']!r} did nothing")
            assert not silent, "\n".join(silent)
            b.close()
        assert not bad, bad
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_taskboard_buttons")
    finally:
        srv.terminate()

if __name__ == "__main__":
    main()
