"""The Marketplace v2 (feat/market-v2: app/ui/market.js + server/market.js, catalog verified by
scripts/dev/market-catalog.js --fetch). Checks:
  - the catalog: `market-catalog.js --check` (schema, http(s) source, license, author, thumbnail files), every item's
    source link is http(s), every thumbnail file is a small WebP the server serves
  - each category loads with thumbnails and no broken image
  - search, sort (Popular / New / A-Z), the Installed tab and empty states
  - the detail panel (in the page, not a floating window): larger preview, what Add does, Open source / Docs, license
  - Add then Remove for one item of each kind in a project (with real effects: the sidebar widget, TOOLBOX.md, the
    copied skill folder, .mcp.json, the doc in Files, the inspiration board) and Undo from the result line
  - no tribe: Add asks "Pick a project first", This device saves the setup as a doc in Files, Remove deletes it
  - the full page (#/market in the main area) and a 390px phone with no horizontal scroll, detail as a page with Back
Screenshots: docs/screenshots/market-v2.png, market-detail.png. Usage: python app/test/e2e_market_v2.py
"""
import functools, http.server, json, os, subprocess, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5660 + OFF
CDN_PORT = 5690 + OFF
STATIC_PORT = 5720 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
LABELS = {"skill": ["Skill"], "connector": ["MCP server"], "library": ["Library"], "tool": ["Tool"], "studio": ["Studio"], "site-template": ["Starter"], "widget": ["Widget"], "asset-pack": ["Assets"], "company-template,legal": ["Company", "Legal"], "playbook": ["Playbook"], "academy": ["Academy"]}
KINDS = ["widget", "company-template", "playbook", "skill", "library", "tool", "studio", "site-template", "connector", "asset-pack", "legal", "academy"]

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

# a stand-in for jsDelivr, so copying a skill folder works with no network (server/shelf.js TRIBE_SHELF_CDN / _DATA)
SKILL = {}
class Cdn(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        p = self.path
        if p.startswith("/data/"):
            body = json.dumps({"files": [{"name": f"/{SKILL['path']}/SKILL.md", "size": 60}, {"name": f"/{SKILL['path']}/notes.md", "size": 10}]}).encode()
        elif p.endswith("/SKILL.md"): body = b"---\nname: test\ndescription: a test skill\n---\n# Test skill\n"
        elif p.endswith("/notes.md"): body = b"# notes\n"
        else: self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)

def main():
    errors = []
    # ---------- the catalog ----------
    chk = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "market-catalog.js"), "--check"], capture_output=True, text=True)
    assert chk.returncode == 0, chk.stderr + chk.stdout
    cat = json.loads((ROOT / "app" / "ui" / "market-catalog.json").read_text())["items"]
    full = json.loads((ROOT / "templates" / "marketplace.json").read_text())["items"]
    assert len(cat) == len(full) >= 450, (len(cat), len(full))
    counts = {}
    for it in cat:
        counts[it["kind"]] = counts.get(it["kind"], 0) + 1
        assert it["source"].startswith(("https://", "http://")) and " " not in it["source"], it["id"]
        assert it["license"] and it["author"], it["id"]
        if it.get("docs"): assert it["docs"].startswith(("https://", "http://")), it["id"]
        if it.get("thumb"):
            f = ROOT / "app" / "ui" / it["thumb"]; assert f.exists() and f.read_bytes()[8:12] == b"WEBP" and f.stat().st_size < 40_000, it["thumb"]
    assert set(counts) == set(KINDS), counts
    thumbs = sorted({it["thumb"] for it in cat if it.get("thumb")}); assert len(thumbs) >= 50, len(thumbs)
    size = sum((ROOT / "app" / "ui" / t).stat().st_size for t in thumbs); assert size < 1_000_000, size
    dropped = json.loads((ROOT / "templates" / "market-dropped.json").read_text())["items"]
    assert not {d["id"] for d in dropped} & {it["id"] for it in cat}, "dropped items stay out"
    print("kinds:", counts, f"| thumbnails {len(thumbs)} ({size // 1024} KB) | dropped {len(dropped)}")

    tmp = Path(tempfile.mkdtemp(prefix="tribe-mkv2-", dir="/tmp"))
    repo = tmp / "game"; repo.mkdir(); (repo / "README.md").write_text("# game\n")
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    cdn = ThreadingHTTPServer(("127.0.0.1", CDN_PORT), Cdn); threading.Thread(target=cdn.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_SHELF_CDN": f"http://127.0.0.1:{CDN_PORT}/cdn", "TRIBE_SHELF_DATA": f"http://127.0.0.1:{CDN_PORT}/data"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Firefly", "path": str(repo)}, token=host), "project with a folder"); pid = (p.get("project") or p)["id"]
        for t in thumbs[:12]:
            with urllib.request.urlopen(BASE + "/" + t, timeout=10) as r: assert r.status == 200 and r.headers.get("Content-Type", "").startswith("image/"), t

        # ---------- Add then Remove, one item of each kind, with its real effect ----------
        pick = {}
        for k in KINDS:
            c = [it for it in cat if it["kind"] == k]
            if k == "widget": c = [it for it in c if (it.get("source") or "").startswith("https://") and "TribeCode" not in it["source"]] or c
            if k == "skill": c = [it for it in c if it.get("path")]
            if k == "connector": c = [it for it in c if it.get("mcp")]
            pick[k] = c[0]
        SKILL["path"] = pick["skill"]["path"]
        tb = lambda: (repo / "TOOLBOX.md").read_text() if (repo / "TOOLBOX.md").exists() else ""
        mcpj = lambda: json.loads((repo / ".mcp.json").read_text()) if (repo / ".mcp.json").exists() else {}
        widgets = lambda: ok(api(f"/projects/{pid}/widgets", token=host, project=pid))["widgets"]
        inspo = lambda: ok(api(f"/inspo?project={pid}", token=host, project=pid))["items"]
        for k, it in pick.items():
            r = ok(api(f"/market/{it['id']}/use", "POST", {"project": pid}, token=host, project=pid), f"add {k}")
            assert r["installed"] and r["message"], (k, r)
            if k == "widget": assert any(w.get("url") == it["url"] for w in widgets()), k
            elif k in ("library", "tool", "studio", "skill", "connector"): assert f"<!-- shelf:{it['id']} -->" in tb(), k
            if k == "skill": assert (repo / ".claude" / "skills" / Path(it["path"]).name / "SKILL.md").exists(), r
            if k == "connector": assert mcpj()["mcpServers"][it["mcp"]["name"]] == it["mcp"]["config"], mcpj()
            if k in ("playbook", "legal", "academy", "company-template", "site-template"):
                assert r["done"] == "doc" and r["doc"] and ok(api(f"/docs/{r['doc']}", token=host, project=pid))["doc"]["body"], (k, r)
            if k == "asset-pack": assert any(x.get("market") == it["id"] for x in inspo()), k
            assert ok(api(f"/market/{it['id']}/use", "POST", {"project": pid}, token=host, project=pid))["already"], "adding twice says so"
            pick[k] = {**it, "_r": r}
        inst = ok(api(f"/market?installed=1&project={pid}&limit=60", token=host, project=pid))
        assert inst["total"] == len(KINDS) and all(x["installed"] for x in inst["items"]), inst["total"]
        for k, it in pick.items():
            r = ok(api(f"/market/{it['id']}/remove", "POST", {"project": pid}, token=host, project=pid), f"remove {k}"); assert r["removed"] and not r["item"]["installed"], (k, r)
            if k == "widget": assert not any(w.get("url") == it["url"] for w in widgets()), k
            if k == "skill": assert not (repo / ".claude" / "skills" / Path(it["path"]).name).exists(), k
            if k == "connector": assert it["mcp"]["name"] not in mcpj().get("mcpServers", {}), k
            if k in ("playbook", "legal", "academy", "company-template", "site-template"): assert api(f"/docs/{it['_r']['doc']}", token=host, project=pid)[0] == 404, k
            if k == "asset-pack": assert not any(x.get("market") == it["id"] for x in inspo()), k
        assert f"<!-- shelf:" not in tb(), tb()
        assert ok(api(f"/market?installed=1&project={pid}", token=host, project=pid))["total"] == 0
        # a doc someone edited after Add is kept on Remove
        r = ok(api("/market/" + pick["playbook"]["id"] + "/use", "POST", {"project": pid}, token=host, project=pid)); d = ok(api(f"/docs/{r['doc']}", token=host, project=pid))["doc"]
        ok(api(f"/docs/{r['doc']}", "PUT", {"body": d["body"] + "\n- [ ] our own step\n", "baseVersion": d["version"]}, token=host, project=pid), "edit")
        r2 = ok(api("/market/" + pick["playbook"]["id"] + "/remove", "POST", {"project": pid}, token=host, project=pid)); assert r2["kept"], r2
        assert api(f"/docs/{r['doc']}", token=host, project=pid)[0] == 200
        # sort A-Z on the server
        az = [x["title"] for x in ok(api("/market?sort=az&limit=30", token=host))["items"] if x["title"][0].isalpha()]; assert az == sorted(az, key=str.lower), az[:6]

        # ---------- the page ----------
        init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.removeItem('tribecode.marketSort') } catch (e) {}" % (BASE, host)
        noinit = "try{localStorage.getItem('tribecode.settings.v1')||localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Rae',onboarded:true,server:{url:'',token:''},hosting:false,tour:{done:true}}))}catch(e){}"
        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a): pass
        static = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC_PORT), functools.partial(Quiet, directory=str(ROOT / "app" / "ui"))); threading.Thread(target=static.serve_forever, daemon=True).start()
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900})
            pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
            bad_img = []
            pg.on("response", lambda r: bad_img.append(r.url) if "market-thumbs/" in r.url and r.status >= 400 else None)
            pg.add_init_script(init)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMarket", timeout=20000)
            pg.evaluate(f"window.TribeProjects && TribeProjects.switchTo && TribeProjects.switchTo('{pid}')")
            pg.wait_for_function(f"TribeProjects.current() === '{pid}'", timeout=10000); pg.wait_for_timeout(1200)
            pg.evaluate("location.hash = '#/market'")
            pg.wait_for_selector("#view-market #market .mk-card", timeout=20000)
            assert pg.evaluate("document.body.classList.contains('mk-page-on') && !document.querySelector('#workshop:not(.hidden)')"), "a page in the main area, not a layer"
            assert pg.evaluate("getComputedStyle(document.querySelector('#view-market')).position") != "fixed"
            # each category: cards, each with a thumbnail or a drawn tile, no broken image
            for cat_id in [c for c in ["", "skill", "connector", "library", "tool", "studio", "site-template", "widget", "asset-pack", "company-template,legal", "playbook", "academy"]]:
                pg.click(f"#market [data-cat='{cat_id}']")
                labels = json.dumps(LABELS.get(cat_id, []))
                pg.wait_for_function(f"(() => {{ const want = {labels}, k = [...document.querySelectorAll('#market .mk-card .mk-kind')].map(x => x.textContent); return document.querySelector(\"[data-cat='{cat_id}']\").classList.contains('on') && k.length > 0 && (!want.length || k.every(x => want.includes(x))); }})()", timeout=10000)
                pg.wait_for_timeout(400)
                st = pg.evaluate("""[...document.querySelectorAll('#market .mk-card')].map(c => { const t = c.querySelector('.mk-thumb'), i = t && t.querySelector('img');
                    const r = c.getBoundingClientRect(), vis = r.top < innerHeight && r.bottom > 0;
                    return { thumb: !!t, tile: !!(t && t.querySelector('.mk-tile')), img: !!i, broken: !!(i && vis && i.complete && i.naturalWidth === 0), lazy: !i || i.loading === 'lazy',
                      src: !!c.querySelector('a.mk-src[href^="http"]') }; })""")
                assert all(x["thumb"] and x["tile"] and x["lazy"] and x["src"] for x in st), (cat_id, st[:3])
                assert not any(x["broken"] for x in st), (cat_id, [x for x in st if x["broken"]])
            assert not bad_img, bad_img
            pg.click("#market [data-cat='']")
            # search
            pg.fill("#mk-q", "playwright"); pg.wait_for_function("[...document.querySelectorAll('#market .mk-card .mk-t')].some(t => /playwright/i.test(t.textContent))", timeout=10000)
            pg.fill("#mk-q", "zzqqnotathing"); pg.wait_for_selector("#mk-grid .mk-empty [data-reset-all]"); pg.click("[data-reset-all]")
            pg.wait_for_function("document.querySelectorAll('#market .mk-card').length >= 24 && document.querySelector('#mk-q').value === ''")
            # sort
            pg.click("[data-sort='az']"); pg.wait_for_function("document.querySelector('[data-sort=az]').classList.contains('on')")
            pg.wait_for_function("(() => { const t = [...document.querySelectorAll('#market .mk-card .mk-t')].map(x => x.textContent.toLowerCase()); return t.length > 5 && t.every((x, i) => !i || t[i - 1].localeCompare(x, 'en', {sensitivity: 'base'}) <= 0); })()", timeout=10000)
            pg.click("[data-sort='new']"); pg.wait_for_function("document.querySelector('#mk-note').textContent.includes('Newest')")
            pg.click("[data-sort='hot']")
            pg.wait_for_function("document.querySelector('[data-sort=hot]').classList.contains('on')")
            pg.click("#market [data-cat='library']"); pg.wait_for_function("[...document.querySelectorAll('#market .mk-card .mk-kind')].every(k => k.textContent === 'Library')")
            pg.evaluate("document.querySelector('#mk-cats').scrollIntoView({block: 'start'})"); pg.wait_for_timeout(900)
            pg.screenshot(path=str(SHOTS / "market-v2.png"))
            shot = next(it for it in cat if it["kind"] == "library" and it.get("thumb") and it.get("thumbWide"))
            pg.fill("#mk-q", shot["title"]); pg.wait_for_selector(f".mk-card[data-id='{shot['id']}']"); pg.click(f".mk-card[data-id='{shot['id']}'] .mk-t")
            pg.wait_for_selector("#mk-detail .mk-thumb.big img"); pg.wait_for_timeout(500)
            pg.screenshot(path=str(SHOTS / "market-detail.png"))
            pg.click("#mk-detail [data-dclose]"); pg.fill("#mk-q", ""); pg.click("#market [data-cat='']")
            # the detail panel, in the page
            mcp_item = pick["connector"]
            pg.fill("#mk-q", mcp_item["title"]); pg.wait_for_selector(f".mk-card[data-id='{mcp_item['id']}']")
            pg.click(f".mk-card[data-id='{mcp_item['id']}'] .mk-t"); pg.wait_for_selector("#mk-detail h2")
            dt = pg.inner_text("#mk-detail")
            assert "What Add does" in dt.replace("WHAT ADD DOES", "What Add does") and ".mcp.json" in dt and mcp_item["license"] in dt and "Open source ↗" in dt and "Docs ↗" in dt, dt
            assert pg.evaluate("document.querySelector('#mk-detail').closest('#market') && getComputedStyle(document.querySelector('#mk-detail')).position !== 'fixed'"), "an in-page panel"
            assert pg.evaluate("document.querySelector('#mk-detail a[data-visit]').href.startsWith('https://')")
            assert pg.locator("#mk-detail .mk-thumb.big").count() == 1
            # Add from the panel -> .mcp.json; Undo from the result line takes it back
            pg.click("#mk-detail [data-use]"); pg.wait_for_selector("#mk-result:not([hidden]) [data-res-undo]", timeout=15000)
            assert mcp_item["mcp"]["name"] in mcpj().get("mcpServers", {}), "added"
            assert pg.locator("#mk-detail [data-remove]").count() == 1 and pg.locator(f".mk-card[data-id='{mcp_item['id']}'].is-in").count() == 1
            pg.click("#mk-result [data-res-undo]"); pg.wait_for_selector("#mk-detail [data-use]", timeout=10000)
            assert mcp_item["mcp"]["name"] not in mcpj().get("mcpServers", {}), "undone"
            # Add a library, see it under Installed, Remove it there
            lib = pick["library"]; pg.click("#mk-detail [data-dclose]")
            pg.fill("#mk-q", lib["title"]); pg.wait_for_selector(f".mk-card[data-id='{lib['id']}'] [data-use]"); pg.click(f".mk-card[data-id='{lib['id']}'] [data-use]")
            pg.wait_for_selector(f".mk-card[data-id='{lib['id']}'] [data-remove]"); assert f"shelf:{lib['id']}" in tb()
            pg.click("[data-tab='installed']"); pg.wait_for_function(f"document.querySelectorAll('#market .mk-card').length === 1 && document.querySelector(\".mk-card[data-id='{lib['id']}']\")")
            assert pg.inner_text("#mk-icount") == "1"
            pg.click(f".mk-card[data-id='{lib['id']}'] [data-remove]"); pg.wait_for_selector("#mk-grid .mk-empty [data-goto-browse]")
            assert f"shelf:{lib['id']}" not in tb()
            # leaving: a section click closes the page
            pg.evaluate("location.hash = ''"); pg.wait_for_function("!document.body.classList.contains('mk-page-on')")
            ctx.close()

            # ---------- no tribe: Pick a project first -> This device -> a doc in Files; Remove deletes it ----------
            nt = b.new_context(viewport={"width": 1280, "height": 860}); np_ = nt.new_page(); np_.on("pageerror", lambda e: errors.append("no-tribe: " + str(e)))
            np_.add_init_script(noinit)
            np_.goto(f"http://localhost:{STATIC_PORT}/?skipIntro=1#/market"); np_.wait_for_selector("#view-market .mk-card", timeout=20000)
            assert np_.locator("#mk-offline:not([hidden])").count() == 1
            np_.fill("#mk-q", pick["playbook"]["title"]); np_.wait_for_selector(f".mk-card[data-id='{pick['playbook']['id']}'] [data-use]")
            np_.click(f".mk-card[data-id='{pick['playbook']['id']}'] [data-use]")
            np_.wait_for_selector("#mk-picker [data-pick='local']", timeout=10000)
            assert "Pick a project first" in np_.inner_text("#mk-picker") and not np_.locator(".toast.t-err").is_visible()
            np_.click("#mk-picker [data-pick='local']"); np_.wait_for_selector("#mk-detail [data-remove]", timeout=10000)
            for k in KINDS:
                if k == "playbook": continue
                r = np_.evaluate(f"TribeMarket.use('{pick[k]['id']}')"); assert r and r.get("local"), (k, r)
            ids = np_.evaluate("TribeLocalFiles.list().map(x => x.title)")
            assert len([t for t in ids if ":" in t]) >= len(KINDS), ids
            body = np_.evaluate(f"TribeLocalFiles.list().find(x => x.title.includes({json.dumps(pick['connector']['title'])})).body")
            assert "mcpServers" in body, body
            np_.click("#mk-detail [data-dclose]"); np_.fill("#mk-q", ""); np_.click("[data-tab='installed']"); np_.wait_for_function(f"document.querySelectorAll('#market .mk-card').length === {len(KINDS)}")
            for k in KINDS: np_.evaluate(f"TribeMarket.remove('{pick[k]['id']}')")
            np_.wait_for_selector("#mk-grid .mk-empty [data-goto-browse]", timeout=10000)
            left = np_.evaluate("TribeLocalFiles.list().filter(x => /: /.test(x.title)).length"); assert left == 0, left
            nt.close()

            # ---------- phone ----------
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMarket", timeout=20000); ph.wait_for_timeout(800)
            ph.evaluate("location.hash = '#/market'")
            ph.wait_for_selector("#view-market .mk-card", timeout=20000)
            ph.wait_for_timeout(400)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.body.scrollWidth, document.querySelector('#view-market').scrollWidth, document.querySelector('#view-market').clientWidth]")
            assert sw[0] <= 390 and sw[1] <= 390 and sw[2] <= sw[3] + 1, sw
            over = ph.evaluate("[...document.querySelectorAll('#market .mk-card, #market .mk-bar, #market .mk-tabs')].filter(c => c.getBoundingClientRect().right > 391).length"); assert over == 0, over
            ph.screenshot(path="/tmp/market-v2-390.png")
            ph.click("#market .mk-card .mk-t"); ph.wait_for_selector("#mk-detail:not([hidden]) h2")
            assert ph.evaluate("getComputedStyle(document.querySelector('#market .mk-list')).display") == "none", "the detail is the page on phones"
            assert ph.evaluate("document.documentElement.scrollWidth") <= 390
            ph.screenshot(path="/tmp/market-detail-390.png")
            ph.click("#mk-detail [data-dclose]"); ph.wait_for_selector("#market .mk-list .mk-card")
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("e2e_market_v2: OK", len(cat), "items")
    finally:
        srv.terminate(); cdn.shutdown()
        try: static.shutdown()
        except Exception: pass
        try: srv.wait(5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
