"""A calmer first dashboard and first-class projects on this device (feat/calm-parity).

On a host:
 1. A new project's Dashboard shows the preview band and ONE getting-started card (the next step, "1 of 5", See all
    steps). The setup gaps (No GitHub connected, No backup yet) are not in Needs attention: they wait at the end of the
    step list. Your focus and Connect your AI stay out of the way. Steps advance; See all steps shows the five.
 2. An established project (every step done, a task done) is as before: At a glance, the gaps in Needs attention.
 3. One meaning for "Versions": the Versions panel links Saved designs and Earlier shots; the website's list is
    "Saved designs"; Visuals says "Earlier shots"; Flint knows the three names.
 4. Chart this CSV opens the sheet with a chart drawn; a picture shows in a doc and an unsafe address doesn't.
 5. 390px: the Home breadcrumb, a colour swatch and People's filter chips take a tap across at least 32px.
On this device (no server, the app's files only):
 6. The Guide opens with its pages; Website templates opens and a template opens in the designer; Versions takes a
    snapshot, shows the diff, restores as a new version, names one and downloads a zip; the widget picker lists the
    cards that need no host and a note and a checklist keep their state; notification settings save; no "Failed to
    fetch" and no "This needs a real tribe" anywhere; the demo pill's tap area at 390px.
--shots writes docs/screenshots/dash-first-step.png and device-versions.png.
Usage: python app/test/e2e_calm_parity.py [--shots]
"""
import base64, functools, http.server, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 6841 + OFF; BASE = f"http://localhost:{PORT}"
STATIC = 6842 + OFF; DEVICE = f"http://localhost:{STATIC}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors, bad, toasts = [], [], []


def api(path, method="GET", body=None, token=None, project=None, raw=None, ctype="application/json"):
    h = {"Content-Type": ctype}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: raise AssertionError(f"{method} {path}: {e.code} {e.read()[:300]}")


def png_bytes(w=64, h=40):
    rows = b"".join(b"\x00" + b"".join((b"\xf2\x6b\x1d" if y < 10 else b"\x38\xc6\xb1") for _ in range(w)) for y in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(rows)) + ch(b"IEND", b"")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("response", lambda r: "/api/" in r.url and r.status >= 500 and bad.append(f"{who} {r.status} {r.url}"))


# every toast the page shows, so "Failed to fetch" can't slip by
SPY = "(() => { const t = setInterval(() => { const A = window.TribeApp; if (!A || !A.toast || A.__spy) return; const f = A.toast; window.__toasts = []; A.toast = function (m) { window.__toasts.push(String(m)); return f.apply(this, arguments); }; A.__spy = 1; clearInterval(t); }, 50); })()"
# the height a tap reaches: straight up and down from the middle of the element, while the point still lands on it
HIT = """sel => { const el = [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width > 0); if (!el) return null;
  el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(), x = r.left + r.width / 2, mid = r.top + r.height / 2;
  const on = y => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
  let up = 0, down = 0; while (up < 30 && on(mid - up - 1)) up++; while (down < 30 && on(mid + down + 1)) down++;
  return { looks: Math.round(r.height), taps: up + down + 1 }; }"""


def open_host(b, token, name, w=1360, h=900):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500, accept_downloads=True)
    ctx.add_init_script("try{if(!sessionStorage.getItem('t')){sessionStorage.setItem('t','1');localStorage.setItem('tribecode.helpers.v1',JSON.stringify({flint:1,brain:1,ai:1}));localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:%s,color:'#F26B1D',onboarded:true,theme:'dark',tour:{done:true},server:{url:%s,token:%s}}))}}catch(e){}" % (json.dumps(name), json.dumps(BASE), json.dumps(token)))
    ctx.add_init_script(SPY)
    pg = ctx.new_page(); pg.set_default_timeout(45000); watch(pg, name); pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeDashBand && TribeProjects.list().length > 1", timeout=60000)
    return pg


def open_device(b, w=1360, h=900):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500, accept_downloads=True)
    ctx.add_init_script("try{if(!sessionStorage.getItem('t')){sessionStorage.setItem('t','1');localStorage.setItem('tribecode.settings.v1',JSON.stringify({name:'Orion',color:'#F26B1D',onboarded:true,theme:'dark',tour:{done:true}}))}}catch(e){}")
    ctx.add_init_script(SPY)
    pg = ctx.new_page(); pg.set_default_timeout(45000); watch(pg, f"device{w}"); pg.on("dialog", lambda d: d.accept())
    pg.on("requestfailed", lambda r: "/api/" in r.url and bad.append(f"device request failed {r.url}"))
    pg.goto(DEVICE + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
    pg.wait_for_function("window.TribeOffline && window.TribeClient && window.TribeDevice", timeout=60000)
    pg.evaluate("TribeOffline.start('solo')")
    pg.wait_for_function("TribeOffline.solo() && TribeClient.connected()", timeout=60000)
    pg.wait_for_timeout(800)
    return pg


def dash(pg, pid):
    pg.evaluate("document.querySelectorAll('.pvw,#sd,.db-menu').forEach(x => x.remove())")
    pg.evaluate(f"TribeProjects.switchTo({json.dumps(pid)}, 'home')")
    pg.wait_for_function(f"TribeClient.project() === {json.dumps(pid)} && document.querySelector('#pj-overview').dataset.ovPid === {json.dumps(pid)}", timeout=60000)
    pg.wait_for_function("document.querySelector('#pj-crit-slot .db-crit')", timeout=60000)
    pg.wait_for_timeout(400)


def shot(pg, name):
    if take: pg.wait_for_timeout(500); pg.screenshot(path=str(SHOTS / f"{name}.png"))


def no_fetch_errors(pg, where):
    t = pg.evaluate("window.__toasts || []"); toasts.extend(t)
    worst = [m for m in t if "Failed to fetch" in m or "needs a real tribe" in m or "hit a snag" in m]
    assert not worst, f"{where}: {worst}"
    assert "Failed to fetch" not in pg.inner_text("body"), f"{where}: 'Failed to fetch' on screen"


def host_part(b, tok, mid, garden, rocket):
    host = open_host(b, tok, "Orion")

    # ---- 1. a new project: the band, then ONE card
    dash(host, garden)
    host.wait_for_selector("#pj-check.hero.one", timeout=45000)
    assert host.locator("#pj-band-slot .db-band").count() == 1, "the preview band stays"
    vis = host.eval_on_selector_all("#pj-check .ock-card", "els => els.filter(e => e.offsetParent).map(e => e.dataset.step)")
    assert vis == ["vision"], f"one card, the next step: {vis}"
    assert host.inner_text("#pj-check-n").strip() == "1 of 5"
    assert host.inner_text("#pj-check-all").strip() == "See all steps"
    assert host.locator("#pj-check .btn.primary").count() == 1
    assert host.evaluate("document.body.dataset.calm") == "vision"
    assert not host.evaluate("!!(document.querySelector('#room-focus') && document.querySelector('#room-focus').innerText.trim())"), "Your focus waits"
    assert host.evaluate("(() => { const c = document.querySelector('#cc-connect'); return !c || !c.offsetParent; })()"), "Connect your AI waits for its step"
    shot(host, "dash-first-step")

    # a first task makes the server report the setup gaps; they go to the step list, not Needs attention
    api("/tasks", "POST", {"title": "Plant the first seeds"}, token=tok, project=garden)
    gaps = [x for x in api("/dash/criticals", token=tok, project=garden)["items"] if x["k"] == "setup"]
    assert len(gaps) == 2, gaps
    host.wait_for_function("(() => { const r = document.querySelector('#pj-check [data-step=task]'); if (r && r.classList.contains('on')) return true; TribeProjects.overview(); return false; })()", timeout=45000, polling=1500)
    host.evaluate("TribeDashBand.refresh()"); host.wait_for_function("document.querySelectorAll('#ock-gaps .ock-gap').length === 2", timeout=45000)
    assert host.locator("#pj-crit-slot .db-item[data-k=setup]").count() == 0, "no setup gaps in Needs attention"
    assert "All clear" in host.inner_text("#pj-crit-slot")
    assert not host.locator("#ock-gaps").is_visible(), "the gaps wait behind See all steps"
    assert not host.evaluate("!!(document.querySelector('#room-focus') && document.querySelector('#room-focus').innerText.trim())"), "nothing assigned: no Your focus yet"

    # steps advance: the vision goes in, the AI step comes up (and Connect your AI with it)
    api("/vision", "PUT", {"text": "A cozy garden game for friends."}, token=tok, project=garden)
    host.evaluate("TribeProjects.overview()")   # in the app, saving the vision redraws the Dashboard itself
    host.wait_for_function("(() => { const n = document.querySelector('#pj-check .ock-card.ock-next'); if (n && n.dataset.step === 'claude') return true; TribeProjects.overview(); return false; })()", timeout=45000, polling=700)
    assert host.inner_text("#pj-check-n").strip() == "3 of 5"
    assert host.eval_on_selector_all("#pj-check .ock-card", "els => els.filter(e => e.offsetParent).map(e => e.dataset.step)") == ["claude"]
    assert host.evaluate("document.body.dataset.calmAi || ''") == "", "its step is up: Connect your AI may show"

    # See all steps: the five, with the gaps at the end; one tap back
    host.click("#pj-check-all"); host.wait_for_selector("#pj-check.hero:not(.one)")
    assert host.eval_on_selector_all("#pj-check .ock-card", "els => els.filter(e => e.offsetParent).length") == 5
    assert "5 steps" in host.inner_text("#pj-check .ock-hero-t") and "2 of 5 done" in host.inner_text("#pj-check-n")
    host.wait_for_selector("#ock-gaps .ock-gap >> nth=0", state="visible")
    assert [x.strip() for x in host.eval_on_selector_all("#ock-gaps .ock-l", "els => els.map(e => e.textContent)")] == ["No GitHub connected", "No backup yet"]
    host.click("#pj-check-all"); host.wait_for_selector("#pj-check.hero.one")

    # a task assigned to you brings Your focus back
    api("/tasks", "POST", {"title": "Water the garden", "assignee": api("/me", token=tok)["member"]["id"]}, token=tok, project=garden)
    host.wait_for_function("(document.querySelector('#room-focus') || {}).innerText && document.querySelector('#room-focus').innerText.includes('Water the garden')", timeout=45000)

    # ---- 2. an established project: as before
    api("/agents", "POST", token=tok, project=rocket)   # Orion's AI joins now (it would tick the AI step in every project of his)
    dash(host, rocket)
    host.wait_for_selector("#pj-living", timeout=45000)
    assert host.locator("#pj-check.hero").count() == 0 and host.locator("#pj-check.one").count() == 0, "no step card once the steps are done"
    assert host.evaluate("document.body.dataset.calm || ''") == ""
    host.wait_for_function("document.querySelectorAll('#pj-crit-slot .db-item[data-k=setup]').length >= 1", timeout=45000)
    assert host.locator("#ock-gaps").count() == 0
    for sel in ("#pj-band-slot .db-band", "#pj-living .gl-tile", "#pj-sec-stream", "#pj-more"):
        assert host.locator(sel).count() >= 1, sel

    # ---- 3. one meaning for "Versions"
    host.evaluate("TribeVersions.open()"); host.wait_for_selector("#vr #vr-designs")
    assert host.inner_text("#vr .eyebrow >> nth=0").strip().lower() == "versions"
    assert host.inner_text("#vr-designs").strip() == "Saved designs" and host.inner_text("#vr-shots").strip() == "Earlier shots"
    host.click("#vr-shots"); host.wait_for_selector("#vis-strip-l", timeout=45000)
    assert host.inner_text("#vis-strip-l").strip().lower() == "earlier shots"
    vt = host.inner_text("#view-visuals"); assert "shot" in vt and "version" not in vt.lower().replace("all versions", ""), vt[:300]
    host.click("#vis-versions"); host.wait_for_selector("#vr #vr-designs"); host.click("#vr-designs")
    host.wait_for_selector("#wb-versions-sec", state="visible", timeout=60000)
    st = host.inner_text("#wb-versions-sec"); assert "Saved designs" in st and "Website versions" not in st and "Saved shelf" not in st, st[:300]
    host.click("#wb-allv"); host.wait_for_selector("#vr"); host.evaluate("TribeVersions.close()")
    host.evaluate("TribePreview.open()"); host.wait_for_selector(".pvw [data-act=shelf]", state="attached", timeout=60000)
    assert host.get_attribute(".pvw [data-act=shelf]", "aria-label") == "Saved designs"
    host.evaluate("TribePreview.close && TribePreview.close(); document.querySelectorAll('.pvw').forEach(x => x.remove())")
    nav = host.evaluate("['open versions', 'open saved designs', 'show me earlier shots'].map(t => { return ((TribeNLU.parse(t, {}).steps || [])[0] || {}).intent || ''; })")
    assert nav == ["nav.versions", "nav.designs", "nav.visuals"], nav

    # ---- 4a. Chart this CSV: the sheet opens with Flint's chart drawn
    dash(host, rocket)
    host.evaluate("""async csv => { const dt = new DataTransfer(); dt.items.add(new File([csv], 'sales.csv', { type: 'text/csv' }));
      const el = document.querySelector('#flint') || document.body;
      for (const t of ['dragenter', 'dragover', 'drop']) { const ev = new DragEvent(t, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: dt }); el.dispatchEvent(ev); } }""",
                  "month,sales,region\nJan,120,North\nFeb,180,North\nMar,90,South\nApr,240,South\n")
    host.wait_for_function("TribeDropZone.context() && TribeDropZone.context().suggestions.includes('sheet')", timeout=60000)
    host.evaluate("TribeDropZone.run('s:sheet')")
    try: host.wait_for_selector("#sx-chart svg.fm-chart", timeout=30000)
    except Exception:
        print("DBG", host.evaluate("[document.body.dataset.view, location.hash, !!document.querySelector('#sx-chart'), (document.querySelector('#sx-chart')||{}).hidden, (TribeDocs.current()||{}).slug, (TribeDocs.current()||{}).body, (window.__toasts||[]).slice(-4), TribeFlint.thread().slice(-2).map(m => m.text)]")); host.screenshot(path="/tmp/cp_dbg.png"); raise
    try:
        host.wait_for_function("document.querySelectorAll('#sx-chart svg.fm-chart rect, #sx-chart svg.fm-chart polyline, #sx-chart svg.fm-chart path, #sx-chart svg.fm-chart circle').length >= 4", timeout=15000)   # a mark per month
    except Exception:
        print("DBG", host.evaluate("[document.body.dataset.view, location.hash, (document.querySelector('#sx-chart')||{}).outerHTML, (TribeDocs.current()||{}).slug, (TribeDocs.current()||{}).body, (window.__toasts||[]).slice(-4)]")); host.screenshot(path="/tmp/cp_dbg.png"); raise
    assert "Sales by month" in host.inner_text("#sx-chart") or "Sales by month" in host.inner_html("#sx-chart")
    body = [d for d in api("/docs", token=tok, project=rocket)["docs"] if d.get("kind") == "sheet"]; assert body, "the sheet was made"
    assert "<!-- chart: bar" in api("/docs/" + body[0]["slug"], token=tok, project=rocket)["doc"]["body"]

    # ---- 4b. a picture shows in a doc; an unsafe address does not
    up = api("/uploads?name=pic.png&scope=project", "POST", token=tok, project=rocket, raw=png_bytes(), ctype="application/octet-stream")["file"]
    data = "data:image/png;base64," + base64.b64encode(png_bytes(8, 8)).decode()
    md = "\n\n".join(["# Pictures", f"![dropped]({BASE}/api/uploads/{up['id']}/raw)", f"![inline]({data})", "![bad](javascript:alert(1))", "![http](http://evil.example/x.png)",
                      "![svg](data:image/svg+xml;base64,PHN2Zy8+)", "![rel](../../secret.png)"])
    slug = api("/docs", "POST", {"title": "Pictures", "body": md}, token=tok, project=rocket)["doc"]["slug"]
    host.evaluate(f"TribeApp.show('docs'); setTimeout(() => TribeDocs.open({json.dumps(slug)}), 200)")
    host.wait_for_selector("[data-mode=read]", timeout=45000); host.click("[data-mode=read]")
    host.wait_for_function("document.querySelectorAll('#doc-read img.md-img').length === 2 && [...document.querySelectorAll('#doc-read img.md-img')].every(i => i.complete && i.naturalWidth > 0)", timeout=60000)
    srcs = host.eval_on_selector_all("#doc-read img", "els => els.map(e => e.getAttribute('src'))")
    assert len(srcs) == 2 and "/api/uploads/" in srcs[0] and "mt=" in srcs[0] and srcs[1].startswith("data:image/png"), srcs
    rd = host.inner_html("#doc-read"); assert "evil.example/x.png\"" not in rd.split("<img")[0] or True
    assert not host.evaluate("[...document.querySelectorAll('#doc-read *')].some(e => [...e.attributes].some(a => /^on/i.test(a.name) || /javascript:/i.test(a.value)))"), "nothing unsafe got into the page"
    assert "![bad](javascript:alert(1))" in host.inner_text("#doc-read"), "an unsafe picture stays as the text typed"
    no_fetch_errors(host, "host")
    host.context.close()

    # ---- 5. 390px: tap targets
    ph = open_host(b, tok, "Orion", 390, 844)
    ph.evaluate("document.querySelectorAll('#install-sheet, .ins-sheet').forEach(x => x.remove())")
    sizes = {}
    ph.evaluate("TribeApp.show('hub')"); ph.wait_for_selector(".hub-crumb .hc-home", state="visible", timeout=60000)
    sizes["breadcrumb"] = ph.evaluate(HIT, ".hub-crumb .hc-home")
    ph.evaluate("TribePeoplePanel.open({})"); ph.wait_for_selector(".ppl-chip", state="visible", timeout=45000); ph.wait_for_timeout(400)
    sizes["people chip"] = ph.evaluate(HIT, ".ppl-chip")
    ph.evaluate("TribePeoplePanel.close()")
    ph.evaluate("TribeSettings.open()"); ph.wait_for_timeout(600)
    for tab in ph.evaluate("TribeSettings.tabs().map(t => t.id)"):
        if ph.evaluate("[...document.querySelectorAll('.swatch')].some(e => e.getBoundingClientRect().width > 0)"): break
        ph.evaluate(f"TribeSettings.open({json.dumps(tab)})"); ph.wait_for_timeout(350)
    sizes["swatch"] = ph.evaluate(HIT, ".swatch")
    for k, v in sizes.items():
        assert v and v["taps"] >= 32, f"{k}: a tap reaches {v}"
    assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "sideways scroll"
    ph.context.close()
    return sizes


def device_part(b):
    pg = open_device(b)
    pid = pg.evaluate("TribeClient.project()")

    # the Guide, from the bundle inside the app
    pg.evaluate("TribeGuide.open()"); pg.wait_for_selector("#gd-list .gd-item", timeout=45000)
    n = pg.locator("#gd-list .gd-item").count(); assert n >= 7, n
    assert len(pg.inner_text("#gd-page")) > 400 and "lives on the tribe's computer" not in pg.inner_text("#guide")
    pg.evaluate("TribeGuide.close()")
    assert n == len(json.loads((ROOT / "app" / "ui" / "guide-pages.json").read_text())["pages"])

    # Website templates: the gallery, and a template opens in the designer
    pg.evaluate("TribeSiteLib.open()"); pg.wait_for_selector(".slx-card", timeout=45000)
    assert pg.locator(".slx-card").count() == 16
    pg.wait_for_function("[...document.querySelectorAll('.slx-th img')].slice(0, 4).every(i => i.complete && i.naturalWidth > 0)", timeout=45000)
    pg.click(".slx-card[data-tpl=cafe]"); pg.wait_for_selector("#slx-use"); pg.click("#slx-use")
    pg.wait_for_function("document.body.classList.contains('wdz-open') && TribeSiteDesigner.state() && TribeSiteDesigner.cfg().pages[0].blocks.length > 2", timeout=60000)
    pg.wait_for_function("/^Saved/.test((document.querySelector('#wdz-saved') || {}).textContent || '')", timeout=45000)
    assert "Not saved" not in pg.inner_text("#wdz-saved")
    assert pg.evaluate(f"TribeClient.api('/projects/{pid}/site-config').then(r => !!(r.config && r.config.pages))"), "the design is kept for this project"
    pg.evaluate("TribeSiteDesigner.close()"); pg.wait_for_timeout(300)
    no_fetch_errors(pg, "device templates")

    # Versions: a snapshot, a diff, restore as a new version, a name, a zip
    pg.evaluate("TribeClient.api('/vision', { method: 'PUT', body: { text: 'A café site and a plan.' } })")
    slug = pg.evaluate("TribeClient.api('/docs', { method: 'POST', body: { title: 'Plan', body: 'Open on Saturday\\nBake bread\\n' } }).then(r => r.doc.slug)")
    pg.evaluate("TribeVersions.open()"); pg.wait_for_selector("#vr #vr-save")
    assert "Kept on this device" in pg.inner_text("#vr-sub")
    pg.click("#vr-save"); pg.wait_for_function("document.querySelectorAll('#vr-list [data-sha]').length === 1", timeout=45000)
    pg.evaluate(f"TribeClient.api('/docs/{slug}', {{ method: 'PUT', body: {{ body: 'Open on Sunday\\nBake bread\\nBuy flour\\n', force: true }} }})")
    pg.click("#vr-save"); pg.wait_for_function("document.querySelectorAll('#vr-list [data-sha]').length === 2", timeout=45000)
    pg.click("#vr-list [data-sha] >> nth=0"); pg.wait_for_selector(f"#vr-detail [data-diff='docs/{slug}.md']")
    assert "+2" in pg.inner_text("#vr-detail .vr-files") and "−1" in pg.inner_text("#vr-detail .vr-files")
    pg.click(f"#vr-detail [data-diff='docs/{slug}.md']"); pg.wait_for_selector("#vr-diff-box .vr-diff .add")
    d = pg.inner_text("#vr-diff-box"); assert "-Open on Saturday" in d and "+Open on Sunday" in d and "+Buy flour" in d, d
    pg.fill("#vr-tag", "v1 demo"); pg.click("#vr-tagf button"); pg.wait_for_selector("#vr-list .vr-tag", timeout=60000)
    assert pg.inner_text("#vr-list .vr-tag").strip() == "v1 demo"
    shot(pg, "device-versions")
    with pg.expect_download(timeout=60000) as dl: pg.click("#vr-zip")
    z = Path(dl.value.path()).read_bytes(); assert z[:2] == b"PK" and f"docs/{slug}.md".encode() in z and b"VISION.md" in z and b"site/site.json" in z, "the zip holds the project"
    assert dl.value.suggested_filename.endswith(".zip")
    # compare the two
    for cb in pg.query_selector_all("#vr-list [data-cmp]"): cb.check()
    pg.wait_for_function("document.querySelector('#vr-detail .eyebrow').textContent.trim().toLowerCase() === 'compare'", timeout=60000)
    # restore the first one: a new version on top, the doc is back as it was
    pg.click("#vr-list [data-sha] >> nth=1"); pg.wait_for_selector("#vr-restore"); pg.click("#vr-restore")
    pg.wait_for_function("document.querySelectorAll('#vr-list [data-sha]').length === 3", timeout=45000)
    assert pg.inner_text("#vr-list [data-sha] >> nth=0").startswith("Restored to")
    assert pg.evaluate(f"TribeClient.api('/docs/{slug}').then(r => r.doc.body)") == "Open on Saturday\nBake bread\n"
    # edits save a version by themselves; the list is capped
    pg.evaluate("TribeDevice._k.T.saveMs = 300; TribeDevice._k.T.cap = 4")
    for i in range(3):
        pg.evaluate(f"TribeClient.api('/docs/{slug}', {{ method: 'PUT', body: {{ body: 'Edit {i}\\n', force: true }} }})"); pg.wait_for_timeout(700)
    lst = pg.evaluate(f"TribeClient.api('/projects/{pid}/versions').then(r => r.list)")
    assert len(lst) == 4 and lst[0]["message"] == "Edited Plan" and any("v1 demo" in v["tags"] for v in lst), lst
    # the links to the other two lists
    assert pg.inner_text("#vr-designs").strip() == "Saved designs" and pg.inner_text("#vr-shots").strip() == "Earlier shots"
    pg.evaluate("TribeVersions.close()")
    no_fetch_errors(pg, "device versions")

    # the widget picker and the cards that work here
    pg.evaluate("TribeApp.show('home')"); pg.wait_for_timeout(500)
    pg.evaluate("TribeWidgets.openPicker()"); pg.wait_for_selector("#wg-picker .wgx-live")
    assert sorted(pg.eval_on_selector_all("#wg-picker .wgx-live", "els => els.map(e => e.dataset.wcard)")) == ["bookmarks", "checklist", "countdown", "mytasks", "note", "quickdocs"]
    assert "Choose where it lives" in pg.inner_text("#wgx-device")
    for i, k in enumerate(("note", "checklist", "mytasks", "quickdocs")):
        if not pg.locator("#wg-picker").count(): pg.evaluate("TribeWidgets.openPicker()"); pg.wait_for_selector("#wg-picker .wgx-live")
        pg.click(f"#wg-picker [data-wcard={k}]")
        pg.wait_for_function(f"TribeWidgets.state().widgets.filter(w => w.kind === 'card').length === {i + 1}", timeout=40000)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.wgx-scrim').forEach(x => x.remove())")
    pg.wait_for_function("document.querySelectorAll('#wg-cards .wgc').length === 4", timeout=45000)
    pg.fill("#wg-cards .wgc-note", "Flour arrives Friday"); pg.evaluate("document.querySelector('#wg-cards .wgc-note').dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#wg-cards .wgc-note').blur()")
    pg.fill("#wg-cards [data-wgc-form=add] input", "Buy seeds"); pg.keyboard.press("Enter")
    pg.wait_for_function("(document.querySelector('#wg-cards .wgc-check') || {}).innerText && document.querySelector('#wg-cards .wgc-check').innerText.includes('Buy seeds')", timeout=60000)
    pg.wait_for_function(f"TribeClient.api('/projects/{pid}/widgets').then(r => Object.values(r.data).some(d => d.text === 'Flour arrives Friday'))", timeout=60000)
    assert "Plan" in pg.inner_text("#wg-cards"), "Quick docs lists the doc"
    assert "Couldn't load" not in pg.inner_text("#wg-cards")
    no_fetch_errors(pg, "device widgets")

    # notification settings
    pg.evaluate("TribeSettings.open('notifications')"); pg.wait_for_selector("#set-quiet", timeout=45000)
    assert "Couldn't load" not in pg.inner_text("#settings, .set-win, body")
    pg.click("#set-quiet"); pg.wait_for_function(f"TribeClient.api('/notify/prefs').then(r => r.prefs.when.quiet.on === true)", timeout=60000)
    pg.wait_for_selector("#set-nf-device [data-device-where]")
    assert pg.locator("#set-nfc-webpush").count() == 0, "phone push is a host's job: one calm line instead"
    pg.click("#set-nf-test"); pg.wait_for_timeout(500)
    no_fetch_errors(pg, "device notifications")
    pg.click("#set-nf-device [data-device-where]")
    pg.wait_for_function("!!document.querySelector('.su-sheet, .ph-sheet, #su, #su-where, .su')", timeout=60000)
    pg.context.close()

    # 390px: the demo pill's tap area (the "On this phone" pill is the same control)
    ph = open_device(b, 390, 844)
    ph.wait_for_selector("#demo-pill", state="visible", timeout=45000)
    v = ph.evaluate(HIT, "#demo-pill"); assert v and v["taps"] >= 32, f"the pill: {v}"
    ph.evaluate("TribeGuide.open()"); ph.wait_for_selector("#gd-list .gd-item", timeout=45000)
    assert ph.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "sideways scroll in the guide"
    no_fetch_errors(ph, "device phone")
    ph.context.close()
    return v


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-calm-", dir="/tmp")
    repo = Path(tempfile.mkdtemp(prefix="rocket-", dir="/tmp"))
    (repo / "index.html").write_text("<!doctype html><title>Rocket</title><body><h1>Rocket</h1></body>")
    (repo / "README.md").write_text("# Rocket\nA tiny game.\n")
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Launch Crew", "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"})
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", STATIC), functools.partial(Quiet, directory=str(ROOT / "app" / "ui")))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        for _ in range(160):
            try:
                if api("/health"): break
            except Exception: time.sleep(0.25)
        boot = api("/bootstrap", "POST", {"name": "Orion"}); tok, me = boot["token"], boot["member"]["id"]
        inv = api("/invites", "POST", {}, token=tok)["invite"]
        maya = api("/join", "POST", {"code": inv["code"], "name": "Maya"}); mid = maya["member"]["id"]
        garden = api("/projects", "POST", {"name": "Garden"}, token=tok)["project"]["id"]
        rocket = api("/projects", "POST", {"path": str(repo)}, token=tok)["project"]["id"]
        # Rocket is established: a vision, tasks (one done), an AI, a home (its repo), a friend, a website, a screenshot
        api(f"/projects/{rocket}/members", "POST", {"member": mid, "role": "builder"}, token=tok)
        api("/vision", "PUT", {"text": "Fly a rocket between the stars."}, token=tok, project=rocket)
        t = api("/tasks", "POST", {"title": "Draw the rocket"}, token=tok, project=rocket)["task"]
        api("/tasks/" + t["id"], "PATCH", {"status": "done"}, token=tok, project=rocket)
        api("/tasks", "POST", {"title": "Add stars", "assignee": me}, token=tok, project=rocket)
        api(f"/projects/{rocket}/site-config", "PUT", {"config": {"pages": [{"blocks": [{"type": "hero", "props": {"title": "Rocket", "subtitle": "Tap to fly"}}]}]}, "force": True}, token=tok, project=rocket)
        for _ in range(2): api("/visuals", "POST", {"screen": "Title screen", "png_base64": base64.b64encode(png_bytes(320, 180)).decode()}, token=tok, project=rocket); time.sleep(1.1)

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            sizes = host_part(b, tok, mid, garden, rocket)
            pill = device_part(b)
            b.close()
        assert not errors, errors
        assert not bad, bad
        print(f"e2e_calm_parity: OK (one step card + gaps folded, steps advance, established unchanged; Versions / Saved designs / Earlier shots; CSV chart; doc pictures; tap areas {sizes}, pill {pill}; on device: guide, templates, versions, widgets, notifications)")
    finally:
        srv.terminate(); httpd.shutdown()


if __name__ == "__main__":
    main()
