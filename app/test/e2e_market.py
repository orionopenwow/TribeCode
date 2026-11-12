"""The Marketplace (v0.27 company, server/market.js + app/ui/market.js, catalog templates/marketplace.json): 300+ real
items load; Hot / Rising / New / Top each give a different order; filters and their counts agree; usage recorded in the
tribe makes an item Hot; using a widget item adds it to the project's sidebar; a playbook becomes a doc; pagination;
agents get an approval instead of installing; the Workshop's Marketplace tab, the Filters popover and the detail sheet
work; a phone (390px) has no horizontal scroll. Usage: python app/test/e2e_market.py
"""
import json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 5610 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"

def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def ok(r, what=""): assert r[0] == 200, f"{what}: {r}"; return r[1]

def mcp(token, tool, args):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]

def ids(r): return [x["id"] for x in r["items"]]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-market-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    errors = []
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        p = ok(api("/projects", "POST", {"name": "Firefly Studio", "bio": "A cozy pixel game"}, token=host)); pid = (p.get("project") or p)["id"]

        # ---- the catalog: 300+ real items, every kind, every item well formed ----
        cat = json.loads((ROOT / "templates" / "marketplace.json").read_text())["items"]
        assert len(cat) >= 300, len(cat)
        kinds = {}
        for it in cat:
            kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
            assert it["id"] and it["title"] and it["summary"] and isinstance(it["tags"], list) and it["for"] and it["added"] and 0 <= it["score"] <= 100, it
            assert it.get("url") or it.get("repo") or it.get("ref") or it.get("widget") or it.get("steps"), it
            if it.get("url"): assert it["url"].startswith("https://"), it
        assert len({it["id"] for it in cat}) == len(cat), "ids are unique"
        for k in ["widget", "company-template", "playbook", "skill", "library", "tool", "studio", "site-template", "connector", "asset-pack", "legal", "academy"]: assert kinds.get(k), k
        print("kinds:", kinds)

        # ---- list + pagination ----
        r = ok(api("/market?sort=top", token=host)); assert r["total"] == len(cat) and r["catalog"] == len(cat) and len(r["items"]) == 24, (r["total"], len(r["items"]))
        p2 = ok(api("/market?sort=top&offset=24", token=host)); assert len(p2["items"]) == 24 and not set(ids(r)) & set(ids(p2)), "page 2 is new"
        last = ok(api(f"/market?sort=top&offset={len(cat) - 5}", token=host)); assert len(last["items"]) == 5

        # ---- facets agree with the filters ----
        f = ok(api("/market/facets", token=host)); assert f["total"] == len(cat)
        kc = {k["id"]: k["n"] for k in f["kind"]}; assert kc == kinds, (kc, kinds)
        sk = ok(api("/market?kind=skill&limit=60", token=host)); assert sk["total"] == kinds["skill"] and all(x["kind"] == "skill" for x in sk["items"])
        two = ok(api("/market?kind=skill,connector", token=host)); assert two["total"] == kinds["skill"] + kinds["connector"]
        g = ok(api("/market/facets?for=game", token=host)); gk = {k["id"]: k["n"] for k in g["kind"]}
        assert ok(api("/market?for=game&kind=skill", token=host))["total"] == gk["skill"], "for+kind count matches the facet"
        seat = ok(api("/market/facets?seat=finance", token=host)); assert seat["total"] == ok(api("/market?seat=finance", token=host))["total"] > 0
        tag = f["tag"][0]["id"]; assert ok(api(f"/market?tag={tag}", token=host))["total"] == f["tag"][0]["n"]
        q = ok(api("/market?q=stripe", token=host)); assert q["total"] >= 3 and any(x["id"] == "w-stripe" for x in q["items"]), ids(q)
        assert ok(api("/market?q=zzzznotathing", token=host))["total"] == 0

        # ---- usage makes an item Hot; each sort gives a different order ----
        hot0 = ok(api("/market?sort=hot", token=host)); assert "TribeCode" in hot0["note"]
        low = sorted(cat, key=lambda x: x["score"])[0]["id"]
        for _ in range(3): ok(api(f"/market/{low}/use", "POST", {"only": "open"}, token=host), "record")
        hot = ok(api("/market?sort=hot", token=host)); assert ids(hot)[0] == low, (low, ids(hot)[:3])
        assert "your tribe" in hot["note"] and hot["items"][0]["uses"]["week"] == 3
        orders = {s: ids(ok(api(f"/market?sort={s}&limit=24", token=host))) for s in ["hot", "rising", "new", "top"]}
        assert len({tuple(v) for v in orders.values()}) == 4, orders
        assert ok(api("/market?sort=rising", token=host))["items"][0]["id"] == low, "used this week, more than last week"
        newest = ok(api("/market?sort=new", token=host))["items"]; assert newest[0]["added"] >= newest[-1]["added"]
        u = usage = json.loads((tmp / "tribe" / ".tribe" / "market" / "usage.json").read_text()); assert usage["items"][low]["all"] == 3

        # ---- using a widget item adds it to the sidebar (once) ----
        r = ok(api("/market/w-figma/use", "POST", {"project": pid}, token=host, project=pid), "use widget"); assert r["done"] == "widget" and not r["already"], r
        w = ok(api(f"/projects/{pid}/widgets", token=host, project=pid))["widgets"]; assert any(x["kind"] == "link" and "figma.com" in x["url"] for x in w), w
        assert ok(api("/market/w-figma/use", "POST", {"project": pid}, token=host, project=pid))["already"]
        r = ok(api("/market/w-builtin-calendar/use", "POST", {"project": pid}, token=host, project=pid)); assert r["done"] == "widget"
        assert any(x.get("key") == "calendar" for x in ok(api(f"/projects/{pid}/widgets", token=host, project=pid))["widgets"])
        # ---- a playbook becomes a checklist doc; a library goes to the Toolbox ----
        r = ok(api("/market/pb-growth-launch-week/use", "POST", {"project": pid}, token=host, project=pid)); assert r["done"] == "doc" and r["doc"], r
        r = ok(api("/market/oss-pocketbase/use", "POST", {"project": pid}, token=host, project=pid)); assert r["done"] == "toolbox", r
        # company / legal templates say what they need until those land
        r = ok(api("/market/co-saas/use", "POST", {"project": pid}, token=host, project=pid)); assert r.get("done") == "doc" and r["installed"], r   # feat/market-v2: the plan lands in Files
        # ---- spectators look, agents ask ----
        inv = ok(api("/invites", "POST", {"role": "spectator"}, token=host))["invite"]; spec = ok(api("/join", "POST", {"code": inv["code"], "name": "Watcher"}))["token"]
        assert api("/market/w-notion/use", "POST", {"project": pid}, token=spec, project=pid)[0] in (403, 404)
        agent = ok(api("/agents", "POST", {}, token=host))["token"]
        e, t = mcp(agent, "market_search", {"q": "notion", "kind": "widget"}); assert not e and "w-notion" in t, t
        e, t = mcp(agent, "market_use", {"id": "w-notion", "project": pid}); assert not e and "approval" in t.lower(), t
        assert not any("notion" in x.get("url", "") for x in ok(api(f"/projects/{pid}/widgets", token=host, project=pid))["widgets"]), "not before a human approves"
        aps = [a for a in ok(api("/approvals", token=host))["approvals"] if a["kind"] == "market-use" and a["status"] == "pending"]; assert aps, "an approval waits"
        ok(api(f"/approvals/{aps[0]['id']}/approve", "POST", {}, token=host), "approve")
        for _ in range(30):
            if any("notion" in x.get("url", "") for x in ok(api(f"/projects/{pid}/widgets", token=host, project=pid))["widgets"]): break
            time.sleep(0.3)
        else: raise AssertionError("approved widget never landed")

        # ---- Trending on GitHub (server/trending.js + templates/trending.json): bundled feed in tests, no download ----
        feed = json.loads((ROOT / "templates" / "trending.json").read_text())
        chk = subprocess.run(["node", str(ROOT / "scripts" / "dev" / "trending-check.js")], capture_output=True, text=True); assert chk.returncode == 0, chk.stderr
        tr = ok(api("/market/trending", token=host)); assert tr["source"] == "bundled" and tr["updated"] == feed["updated"] and len(tr["items"]) == len(feed["items"]) >= 30, (tr["source"], len(tr["items"]))
        assert all("trending" in x["tags"] and x["seenOn"] and x["why"] and x["id"].startswith("tr-") for x in tr["items"])
        assert not [x for x in tr["items"] if any(b in x["license"] for b in ["GPL", "AGPL", "BSL", "FSL", "SA"])], "permissive only"
        trc = [x for x in cat if x["id"].startswith("tr-")]; assert len(trc) == len(feed["items"]), "marketplace keeps the trending block in sync (trending-check.js --sync)"
        assert ok(api("/market?tag=trending", token=host))["total"] == len(trc)
        one = ok(api("/market/items/tr-opencut", token=host))["item"]; assert one["seenOn"] and one["stars"] and one["license"] == "MIT", one
        # the refresher: a good download wins, a bad one is ignored, and nothing downloads under TRIBE_TEST
        unit = subprocess.run(["node", "-e", r'''
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('./server/trending'); const feed = JSON.parse(fs.readFileSync('templates/trending.json', 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
const store = { p: f => path.join(dir, f), readJSON: (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return d; } }, writeJSON: (f, j) => fs.writeFileSync(path.join(dir, f), JSON.stringify(j)) };
const newer = { ...feed, updated: '2099-01-01', items: feed.items.slice(0, 3) };
const res = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
(async () => {
  const off = T({ store, root: '.', env: { TRIBE_TEST: '1' }, auto: false, fetchFn: async () => { throw new Error('should not fetch'); } });
  if (!(await off.refresh(true)).skipped) throw new Error('downloads under TRIBE_TEST');
  const bad = T({ store, root: '.', env: {}, auto: false, fetchFn: async () => res({ ...newer, items: [{ ...newer.items[0], license: 'AGPL-3.0' }] }) });
  const rb = await bad.refresh(true); if (rb.ok || bad.get().source !== 'bundled') throw new Error('bad feed accepted');
  const good = T({ store, root: '.', env: {}, auto: false, fetchFn: async () => res(newer) });
  const rg = await good.refresh(true); if (!rg.ok || good.get().updated !== '2099-01-01' || good.get().items.length !== 3) throw new Error('good feed not used');
  const again = T({ store, root: '.', env: {}, auto: false, fetchFn: async () => { throw new Error('offline'); } });
  if (again.get().updated !== '2099-01-01' || again.get().source !== 'downloaded') throw new Error('cache not used offline');
  console.log('trending unit ok');
})().catch(e => { console.error(e.message); process.exit(1); });
'''], capture_output=True, text=True, cwd=str(ROOT)); assert unit.returncode == 0, unit.stderr + unit.stdout

        # ---- the UI ----
        shots = Path(os.environ.get("MARKET_SHOTS", "/tmp")); shots.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            init = "try { localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Camp', onboarded: true, tour: {done: true}, server: {url: '%s', token: '%s'}})); localStorage.removeItem('tribecode.marketSort') } catch (e) {}" % (BASE, host)
            pg = b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.add_init_script(init)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMarket && window.TribeWorkshop", timeout=20000)
            pg.evaluate("TribeWorkshop.open('market')")
            pg.wait_for_selector("#market .mk-card", timeout=15000)
            assert pg.locator("#market .mk-card").count() == 24
            assert pg.locator("#mk-chips").is_hidden(), "no chip row without filters"
            assert "your tribe" in pg.inner_text("#mk-note").lower()
            pg.wait_for_selector("#mk-trend .mk-tcard", timeout=10000)
            assert "trending on github" in pg.inner_text("#mk-trend").lower()
            pg.screenshot(path=str(shots / "market-1440.png"))
            pg.click("#mk-trend [data-tf='video']"); pg.wait_for_function("document.querySelector('#mk-trend [data-tf=video]').classList.contains('on')")
            vids = pg.evaluate("[...document.querySelectorAll('#mk-trend .mk-tcard')].map(c => c.dataset.id)"); assert "tr-opencut" in vids and "tr-opencode" not in vids, vids
            pg.click("#mk-trend .mk-tcard[data-id='tr-opencut'] .mk-t"); pg.wait_for_selector("#mk-detail .mk-seen a")
            assert "why it’s here" in pg.inner_text("#mk-detail").lower() and "stars" in pg.inner_text("#mk-detail").lower()
            pg.screenshot(path=str(shots / "market-trending-detail-1440.png"))
            pg.keyboard.press("Escape")
            pg.click("#mk-trend [data-tall]"); pg.wait_for_function("document.querySelector('#mk-trend').hidden && !document.querySelector('#mk-chips').hidden")
            assert "#trending" in pg.inner_text("#mk-chips")
            pg.click("#mk-chips [data-chip]"); pg.wait_for_function("!document.querySelector('#mk-trend').hidden")
            # sorts
            pg.click("[data-sort='new']"); pg.wait_for_function("document.querySelector('[data-sort=new]').classList.contains('on')")
            pg.wait_for_function("document.querySelector('#mk-note').textContent.includes('Newest')")
            # filters popover with counts; chip row appears; clearing hides it
            pg.click("#mk-filters"); pg.wait_for_selector("#mk-pop [data-f='kind:skill']")
            assert str(kinds["skill"]) in pg.inner_text("#mk-pop [data-f='kind:skill']")
            pg.screenshot(path=str(shots / "market-filters-1440.png"))
            pg.click("#mk-pop [data-f='kind:skill']")
            pg.wait_for_function("document.querySelectorAll('#market .mk-card').length && [...document.querySelectorAll('#market .mk-kind')].every(k => k.textContent === 'Skill')")
            assert pg.evaluate("document.querySelector(\"[data-cat='skill']\").classList.contains('on')"), "a kind is a category chip"
            pg.click("[data-fdone]"); assert pg.locator("#mk-pop").count() == 0
            pg.click("[data-cat='']"); pg.wait_for_function("document.querySelector(\"[data-cat='']\").classList.contains('on') && [...document.querySelectorAll('#market .mk-kind')].some(k => k.textContent !== 'Skill')")
            # show more
            pg.click("#mk-more-btn"); pg.wait_for_function("document.querySelectorAll('#market .mk-card').length === 48")
            # detail sheet + add a widget from it
            pg.fill("#mk-q", "linear"); pg.wait_for_selector(".mk-card[data-id='w-linear']")
            pg.click(".mk-card[data-id='w-linear'] .mk-t"); pg.wait_for_selector("#mk-detail:not([hidden]) h2")
            assert "linear.app" in pg.inner_text("#mk-detail")
            pg.click("#mk-detail [data-use]")
            pg.wait_for_function("(TribeWidgets.state().widgets || []).some(w => (w.url || '').includes('linear.app'))", timeout=10000)
            pg.keyboard.press("Escape")
            pg.evaluate("TribeWorkshop.close()")
            # the sidebar's + Add gallery: Marketplace strip + Browse all
            pg.wait_for_selector("#nest-add", timeout=10000); pg.click("#nest-add"); pg.wait_for_selector("#wg-picker .wgx-mk-row", timeout=10000)
            assert "Browse all (" in pg.inner_text("#wgx-mk-all")
            assert pg.locator("#wg-picker [data-wadd='market']").count() == 1, "new built-in widgets"
            pg.screenshot(path=str(shots / "market-gallery-1440.png"))
            pg.click("#wgx-mk-all"); pg.wait_for_selector("#view-market .mk-card", timeout=10000)   # feat/market-v2: a full page in the main area
            pg.wait_for_function("[...document.querySelectorAll('#view-market .mk-kind')].length && [...document.querySelectorAll('#view-market .mk-kind')].every(k => k.textContent === 'Widget')")
            # phone: no horizontal scroll, filters as a sheet
            ph = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); ph.on("pageerror", lambda e: errors.append(str(e)))
            ph.add_init_script(init)
            ph.goto(BASE + "/?skipIntro=1"); ph.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeMarket", timeout=20000)
            ph.evaluate("TribeWorkshop.open('market')"); ph.wait_for_selector("#market .mk-card", timeout=15000)
            sw = ph.evaluate("[document.documentElement.scrollWidth, document.querySelector('#ws-scroll').scrollWidth, document.querySelector('#ws-scroll').clientWidth]")
            assert sw[0] <= 390 and sw[1] <= sw[2] + 1, sw
            over = ph.evaluate("[...document.querySelectorAll('#market .mk-card')].filter(c => c.getBoundingClientRect().right > 391).length"); assert over == 0, over
            ph.wait_for_selector("#mk-trend .mk-tcard", timeout=10000)
            tb = ph.evaluate("(() => { const r = document.querySelector('#mk-trend').getBoundingClientRect(); return [r.left, r.right]; })()"); assert tb[0] >= 0 and tb[1] <= 391, tb
            ph.screenshot(path=str(shots / "market-390.png"))
            ph.click("#mk-filters"); ph.wait_for_selector("#mk-pop.sheet [data-f]")
            box = ph.evaluate("(() => { const r = document.querySelector('#mk-pop').getBoundingClientRect(); return [r.left, r.right, r.bottom]; })()"); assert box[0] >= 0 and box[1] <= 391, box
            ph.screenshot(path=str(shots / "market-filters-390.png"))
            ph.click(".mk-scrim", position={"x": 20, "y": 20}); ph.click("#market .mk-card .mk-t"); ph.wait_for_selector("#mk-detail:not([hidden]) h2")
            ph.screenshot(path=str(shots / "market-detail-390.png"))
            b.close()
        bad = [e for e in errors if "ResizeObserver" not in e]
        assert not bad, bad
        print("e2e_market: OK", len(cat), "items")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()

if __name__ == "__main__":
    main()
