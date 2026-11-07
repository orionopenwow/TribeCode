"""End-to-end: the Global Hub (app/ui/hub.js, server/hub.js, server/scratch.js).

Not connected yet: the hub (quick launch, a local scratchpad, host or join) instead of a dead "Chat lives in a tribe" box.
Connected: the stream merges every project the member can see (scoped members only theirs, API and UI), updates live,
Resume jumps back to the last project + view, the search opens Ctrl K, Agents & models shows an MCP agent (context %,
tokens) and the mock Ollama model, the sidebar collapses into one Global group (All repos, Global docs, Agent fleet),
the workspace switcher pins projects (persisted per member), the right panel lists agents and helpers, the private
scratchpad persists and files notes (Move to project, Make a task), the update icon opens the update flow, and the
phone layout has no horizontal overflow.
Usage: python app/test/e2e_hub.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4851 + OFF
OLLAMA = 11571 + OFF
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv or os.environ.get("TRIBE_SHOTS") == "1"
errors = []


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.innerText.includes(t); }", arg=[sel, text], timeout=timeout)


def shot(page, name, full=False):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def signed_in(ctx, token, name):
    ctx.add_init_script(f"localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:{json.dumps(name)}, onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}}}));")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-hub-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="hub-src-", dir="/tmp")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    repo = os.path.join(work, "lantern")
    sh("git", "init", "-q", "-b", "main", repo)
    Path(repo, "src").mkdir(parents=True); Path(repo, "src/glow.js").write_text("export const glow = 1\n")
    sh("git", "-C", repo, "add", "."); sh("git", "-C", repo, "-c", "user.email=orion@x", "-c", "user.name=Orion", "commit", "-q", "-m", "Light the first lantern")

    oll = subprocess.Popen(["node", str(ROOT / "app" / "test" / "mock_ollama.js"), str(OLLAMA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.3)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--ollama", f"http://localhost:{OLLAMA}", "--name", "Lantern Crew"],
                           stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_DASH_THROTTLE_MS": "300"})
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.1)

        # ---------------- people + projects: Orion hosts; Zed is only in Sketches ----------------
        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")
        orion, oid = boot["token"], boot["member"]["id"]
        lan = ok(api("/projects", "POST", {"path": repo}, token=orion), "path project")["project"]["id"]
        sk = ok(api("/projects", "POST", {"name": "Sketches"}, token=orion))["project"]["id"]
        inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 1, "role": "builder", "project": sk}, token=orion))["invite"]
        z = ok(api("/join", "POST", {"code": inv["code"], "name": "Zed"})); zed, zid = z["token"], z["member"]["id"]
        ok(api("/docs", "POST", {"title": "Lantern lore", "body": "# Lantern lore\nThe lanterns remember every traveller."}, token=orion, project=lan))
        ok(api("/docs", "POST", {"title": "Sketch list", "body": "Charcoal studies of the moon."}, token=zed, project=sk))
        ok(api("/tasks", "POST", {"title": "Ink the moon"}, token=zed, project=sk))

        # ---------------- API: member-scoped, never leaks ----------------
        h = ok(api("/hub", token=orion), "host hub")
        fp = {x["project"] for x in h["feed"]}
        assert lan in fp and sk in fp, (fp, [(x["kind"], x["title"]) for x in h["feed"]])
        assert any(x["kind"] == "commit" and "first lantern" in x["title"] for x in h["feed"]), h["feed"]
        zh = ok(api("/hub", token=zed), "zed hub")
        assert {x["project"] for x in zh["feed"]} <= {sk} and zh["feed"], zh["feed"]
        assert {p["id"] for p in zh["projects"]} == {sk}, zh["projects"]
        assert "Lantern" not in json.dumps(zh), "a scoped member never sees other projects"
        assert {r["project"] for r in ok(api("/hub/repos", token=zed))["repos"]} == {sk}
        repos = ok(api("/hub/repos", token=orion))["repos"]
        lr = [r for r in repos if r["project"] == lan][0]
        assert lr["repo"] and lr["repo"]["name"] == "lantern", lr
        assert [d["project"] for d in ok(api("/hub/docs?q=moon", token=zed))["docs"]] == [sk]
        assert ok(api("/hub/docs?q=lantern", token=zed))["docs"] == [], "global docs stay scoped"
        assert any(d["title"] == "Lantern lore" for d in ok(api("/hub/docs?q=traveller", token=orion))["docs"]), "body search"
        assert api("/hub/prefs", "PUT", {"pins": [lan]}, token=zed)[1]["pins"] == [], "cannot pin a project you are not in"
        assert api("/hub", token=None)[0] == 401
        # agents can't use the hub or the scratchpad
        ag = ok(api("/agents", "POST", token=orion, project=lan)); agt, agid = ag["token"], ag["agent"]["id"]
        mcp(agt, "my_lane", {"tokens_used": 42000, "budget": 200000})
        err, txt = mcp(agt, "report_context", {"used_pct": 37, "focus": "Wiring the lantern glow shader"}); assert not err, txt
        st, _ = api("/scratch", token=agt); assert st == 403
        # the scratchpad is private
        ok(api("/scratch", "PUT", {"notes": [{"text": "Zed's secret sketch idea"}]}, token=zed))
        assert ok(api("/scratch", token=orion))["notes"] == [], "the host cannot read Zed's scratchpad"

        # fleet: the agent (context %, tokens), the mock model, the loops
        f = ok(api("/hub/fleet", token=orion))
        a = [x for x in f["agents"] if x["id"] == agid][0]
        assert a["online"] and a["context"] == 37 and a["tokens"] == 42000 and "lantern glow" in a["doing"].lower(), a
        assert f["models"]["online"] and f["models"]["model"], f["models"]
        assert {l["id"] for l in f["loops"]} >= {"secretary", "autopilot", "preview"}, f["loops"]
        assert ok(api("/hub/fleet", token=zed))["agents"] == [], "Zed sees only his own agents"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------------- not connected yet: the hub, never a dead box ----------------
            octx = b.new_context(viewport={"width": 1440, "height": 900})
            octx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Guest', onboarded: true}))")
            off = octx.new_page(); watch(off, "offline")
            off.goto(BASE + "/?skipIntro=1")
            off.wait_for_selector("#view-hub:not(.hidden) #hub-launch")
            for sel in ["#hub-new", "#hub-join", "#hub-search", "#hub-host", "#hub-join2", "#hub-scratch .sc-in", "#grp-global"]: off.wait_for_selector(sel, state="visible")
            assert off.locator(".solo-empty:visible").count() == 0
            off.evaluate("TribeApp.show('chat')")
            off.wait_for_selector("#view-hub:not(.hidden)")
            assert off.is_hidden("#view-chat"), "chat without a tribe lands on the hub"
            off.fill("#hub-scratch .sc-in", "Offline idea: lanterns that hum")
            off.click("#hub-scratch .sc-add"); wait_text(off, "#hub-scratch .sc-list", "lanterns that hum")
            off.mouse.move(700, 880); shot(off, "hub-not-connected")
            off.reload(); off.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(off, "#hub-scratch .sc-list", "lanterns that hum")
            off.click("#hub-join2"); off.wait_for_selector("#invite-modal:not(.hidden) #join-link")
            off.keyboard.press("Escape")
            octx.close()

            # ---------------- Orion: connected hub ----------------
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
            signed_in(ctx, orion, "Orion")
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1&simulateUpdate=0.9.0")
            host.wait_for_function("TribeClient.connected()")
            host.wait_for_selector("#view-home:not(.hidden)")   # connected: the project home, as before
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden) #hub-launch")
            assert host.evaluate("location.hash") == "#/hub"
            wait_text(host, "#crumb-label", "Home")
            wait_text(host, "#hub-feed", "Light the first lantern")
            wait_text(host, "#hub-feed", "Sketch list")
            chips = host.evaluate("[...document.querySelectorAll('#hub-feed .hub-chip')].map(e => e.textContent.trim())")
            assert "lantern" in chips and "Sketches" in chips, chips   # a folder project is named after its folder
            # Agents & models
            wait_text(host, "#hub-fleet", "Claude")
            wait_text(host, "#hub-fleet", "37%"); wait_text(host, "#hub-fleet", "42k tok")
            wait_text(host, "#hub-fleet", "Ollama")
            wait_text(host, "#hub-fleet", "Secretary")
            # the sidebar: the four rows are the Global ones, plus a way into the project
            assert host.locator("#nest-ws-tasks").is_hidden() and host.locator("#nest-chat").is_hidden()
            assert [t.strip() for t in host.locator("#grp-global .nest-row span").all_inner_texts()] == ["Home", "Global docs", "All repos", "Agent fleet"]
            assert host.evaluate("document.body.classList.contains('global')")
            host.wait_for_selector("#nest-open", state="visible")
            # right panel: agents + helpers + scratchpad
            host.wait_for_selector("#room-agents .ra-row, #room-agents [data-agent]")
            wait_text(host, "#room-helpers", "Secretary"); wait_text(host, "#room-helpers", "Local model")
            host.wait_for_selector("#room-scratch .sc-in")
            host.mouse.move(700, 880); shot(host, "hub-connected")
            # live: a new doc in Lantern shows up without a reload
            ok(api("/docs", "POST", {"title": "Glow shader notes", "body": "Bloom off, flat rings."}, token=orion, project=lan))
            wait_text(host, "#hub-feed", "Glow shader notes", timeout=12000)
            # search opens Ctrl K, typing on the hub types into it
            host.click("#hub-search"); host.wait_for_selector("#palette:not(.hidden)")
            host.keyboard.press("Escape"); host.wait_for_selector("#palette.hidden", state="attached")
            host.keyboard.press("g"); host.wait_for_selector("#palette:not(.hidden)")
            assert host.input_value("#pal-input") == "g"
            host.keyboard.press("Escape")

            # ---------------- jump to an item, then Resume brings you back ----------------
            host.click("#hub-feed [data-feed^='doc:glow-shader-notes']")
            host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan, timeout=8000)
            host.wait_for_function("t => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg="Glow shader notes", timeout=10000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(host, "#hub-resume", "lantern"); wait_text(host, "#hub-resume", "Docs")
            host.click("#nest-open"); host.wait_for_selector("#view-home:not(.hidden)")
            assert not host.evaluate("document.body.classList.contains('global')")
            host.wait_for_selector("#nest-ws-tasks", state="visible")   # back in a project: its four rows
            host.click("#nest-ws-tasks"); host.wait_for_selector("#view-tasks:not(.hidden)")
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(host, "#hub-resume", "Tasks")
            host.click("#hub-resume"); host.wait_for_selector("#view-tasks:not(.hidden)")

            # ---------------- Global group: All repos, Global docs, Agent fleet ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-repos-all"); host.wait_for_selector(f"#hub-repos [data-repo='{lan}']")
            wait_text(host, "#hub-repos", "main"); wait_text(host, "#hub-repos", "Sketches")
            assert host.evaluate("location.hash") == "#/hub/repos"
            assert host.evaluate("document.querySelector('#nest-repos-all').classList.contains('on')")
            host.click(f"#hub-repos [data-repo='{sk}']")
            host.wait_for_selector("#view-repo:not(.hidden)")
            host.wait_for_function("sk => TribeClient.project() === sk", arg=sk, timeout=8000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-docs-all"); host.wait_for_selector("#hub-dq")
            host.fill("#hub-dq", "traveller"); wait_text(host, "#hub-docs", "Lantern lore")
            host.wait_for_function("() => !document.querySelector('#hub-docs').innerText.includes('Glow shader')")   # filtered by the body text
            host.click("#hub-docs [data-gdoc$='|lantern-lore']"); host.wait_for_selector("#view-docs:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan, timeout=8000)
            host.wait_for_function("t => document.querySelector('#doc-title') && document.querySelector('#doc-title').value === t", arg="Lantern lore", timeout=10000)
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.mouse.move(700, 880); shot(host, "hub-sidebar-global")
            host.click("#nest-fleet"); host.wait_for_selector("#view-agents-hub:not(.hidden)")

            # ---------------- workspace switcher: pins persist per member ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-switch"); host.wait_for_selector("#project-menu .sh-switch")
            for t in ["Tribe", "Personal scratchpad", "Paste invite link", "New project"]: wait_text(host, "#project-menu", t)
            host.click(f"#project-menu [data-pin='{sk}']")
            host.wait_for_function("sk => { const b = document.querySelector(`#project-menu [data-pin='${sk}']`); return b && b.classList.contains('on'); }", arg=sk)
            assert ok(api("/hub/prefs", token=orion))["pins"] == [sk]
            shot(host, "hub-switcher")
            host.keyboard.press("Escape")
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden)")
            host.click("#nest-switch"); host.wait_for_selector("#project-menu .sh-switch")
            heads = host.evaluate("[...document.querySelectorAll('#project-menu h6')].map(e => e.textContent)")
            assert heads[:2] == ["Tribe", "Pinned"], heads
            host.wait_for_selector(f"#project-menu [data-pin='{sk}'].on")
            host.click(f"#project-menu .sw-row [data-pj-open='{lan}']")
            host.wait_for_selector("#view-home:not(.hidden)")
            host.wait_for_function("lan => TribeClient.project() === lan", arg=lan)

            # ---------------- scratchpad: persists, private, Move to project, Make a task ----------------
            host.click("#rail-logo"); host.wait_for_selector("#view-hub:not(.hidden)")
            host.fill("#room-scratch .sc-in", "Lantern flicker\nRandomize the glow a little every frame")
            host.click("#room-scratch .sc-add"); wait_text(host, "#room-scratch .sc-list", "Lantern flicker")
            host.fill("#room-scratch .sc-in", "Moon phases doc"); host.keyboard.press("Control+Enter")
            wait_text(host, "#room-scratch .sc-list", "Moon phases doc")
            host.wait_for_function("TribeHub.scratch.notes().every(n => n.id)")
            notes = ok(api("/scratch", token=orion))["notes"]
            assert [n["text"].split("\n")[0] for n in notes] == ["Moon phases doc", "Lantern flicker"], notes
            assert ok(api("/scratch", token=zed))["notes"][0]["text"] == "Zed's secret sketch idea", "Zed's own notes, untouched"
            host.mouse.move(700, 880); shot(host, "hub-panel")
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden)")
            wait_text(host, "#room-scratch .sc-list", "Lantern flicker")
            # edit in place autosaves
            host.click("#room-scratch .sc-note:has-text('Moon phases') .sc-text")
            host.fill("#room-scratch .sc-edit", "Moon phases doc\nNew, waxing, full, waning")
            host.click("#room-scratch .sc-head"); host.wait_for_timeout(300)
            host.wait_for_function("() => true")
            for _ in range(30):
                if "waxing" in json.dumps(ok(api("/scratch", token=orion))["notes"]): break
                time.sleep(0.2)
            assert "waxing" in json.dumps(ok(api("/scratch", token=orion))["notes"])
            # Make a task (Lantern)
            host.click("#room-scratch .sc-note:has-text('Lantern flicker') [data-sc='task']")
            host.click(f".scratch-pick [data-pick='{lan}']")
            wait_text(host, ".toast", "Task added to lantern")
            tasks = ok(api("/tasks", token=orion, project=lan))["tasks"]
            assert any(t["title"] == "Lantern flicker" and "Randomize the glow" in t.get("body", "") for t in tasks), tasks
            # Move to project (Sketches) as a doc
            host.click("#room-scratch .sc-note:has-text('Moon phases') [data-sc='move']")
            host.click(f".scratch-pick [data-pick='{sk}']")
            wait_text(host, ".toast", "Filed in Sketches")
            docs = ok(api("/docs", token=orion, project=sk))["docs"]
            assert any(d["title"] == "Moon phases doc" for d in docs), docs
            assert ok(api("/scratch", token=orion))["notes"] == []
            st, d = api(f"/scratch/n-nope1234/move", "POST", {"project": sk}, token=zed); assert st == 404, (st, d)
            ok(api("/scratch", "PUT", {"notes": [{"text": "try to file elsewhere"}]}, token=zed))
            zn = ok(api("/scratch", token=zed))["notes"][0]["id"]
            st, d = api(f"/scratch/{zn}/move", "POST", {"project": lan}, token=zed); assert st == 403, (st, d)

            # ---------------- update icon: the same save / hand-off / restart flow ----------------
            assert host.locator("#update-pill").count() == 0
            host.wait_for_selector("#update-btn.ready:not(.hidden)")
            # top right: update · bell · profile (rightmost icon); no panel toggle or Context icon in the header
            order = host.evaluate("['#update-btn', '#nf-bell', '#pf-btn'].map(s => document.querySelector(s).getBoundingClientRect().left)")
            assert order == sorted(order), order
            assert host.evaluate("[...document.querySelectorAll('.titlebar .tb-right > *')].filter(e => e.offsetParent !== null).map(e => e.id).filter(Boolean)") == ["update-btn", "nf-bell", "pf-btn"]
            assert host.locator(".titlebar #panel-toggle").count() == 0 and host.locator("#ctx-btn").is_hidden()
            host.keyboard.press("Control+Shift+K"); host.wait_for_selector("#ctx-win:not(.hidden)"); host.keyboard.press("Control+Shift+K")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "tribe context"); host.keyboard.press("Enter"); host.wait_for_selector("#ctx-win:not(.hidden)")
            host.keyboard.press("Control+Shift+K"); host.wait_for_selector("#ctx-win.hidden", state="attached")
            # the right panel: an X in its corner hides it, a slim tab brings it back (remembered)
            assert host.locator("#panel-toggle").is_hidden()
            host.click("#panel-close"); host.wait_for_function("document.body.classList.contains('panel-off')")
            host.wait_for_selector("#panel-toggle", state="visible")
            shot(host, "hub-header-panel-closed")
            host.reload(); host.wait_for_selector("#view-hub:not(.hidden)"); host.wait_for_selector("#panel-toggle", state="visible")
            host.click("#panel-toggle"); host.wait_for_function("!document.body.classList.contains('panel-off')")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "toggle right panel"); host.keyboard.press("Enter")
            host.wait_for_function("document.body.classList.contains('panel-off')")
            host.keyboard.press("Control+k"); host.fill("#pal-input", "toggle right panel"); host.keyboard.press("Enter")
            host.wait_for_function("!document.body.classList.contains('panel-off')")
            host.wait_for_selector("#update-btn.ready:not(.hidden)")
            host.click("#update-btn"); host.wait_for_selector("#update-pop:not(.hidden)")
            assert "v0.9.0 is ready" in host.inner_text("#update-pop")
            shot(host, "hub-update")
            host.click("[data-u='close']"); host.wait_for_selector("#update-pop.hidden", state="attached")
            host.click("#pf-btn"); host.wait_for_selector("#pf-menu [data-act='restart']")
            wait_text(host, "#pf-menu", "Update ready · v0.9.0")
            host.click("#pf-menu [data-act='restart']"); host.wait_for_selector("#update-pop:not(.hidden)")
            host.keyboard.press("Escape")

            # ---------------- Zed (scoped): only Sketches in the UI ----------------
            zctx = b.new_context(viewport={"width": 1440, "height": 900})
            signed_in(zctx, zed, "Zed")
            zp = zctx.new_page(); watch(zp, "zed")
            zp.goto(BASE + "/?skipIntro=1#/hub")
            zp.wait_for_selector("#view-hub:not(.hidden) #hub-feed")
            wait_text(zp, "#hub-feed", "Sketch list")
            assert "lantern" not in zp.inner_text("#view-hub").lower().replace("lantern crew", ""), zp.inner_text("#view-hub")
            zp.click("#nest-repos-all"); zp.wait_for_selector(f"#hub-repos [data-repo='{sk}']")
            assert zp.locator(f"#hub-repos [data-repo='{lan}']").count() == 0
            wait_text(zp, "#room-scratch .sc-list", "try to file elsewhere")
            assert "Lantern flicker" not in zp.inner_text("#room-scratch")
            zctx.close()

            # ---------------- phone: hub at 390px, no horizontal overflow ----------------
            ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            signed_in(ph, orion, "Orion")
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1#/hub")
            phone.wait_for_selector("#view-hub:not(.hidden) #hub-launch")
            wait_text(phone, "#hub-feed", "Glow shader notes")
            phone.wait_for_selector("#hub-scratch .sc-in", state="visible")   # no right panel on phones: the scratchpad lives in the hub
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), phone.evaluate("document.documentElement.scrollWidth")
            wide = phone.evaluate("[...document.querySelectorAll('#view-hub *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.hub-item, .hf-row, .hub-li, .sc-text')).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))")
            assert not wide, wide
            shot(phone, "hub-phone")
            phone.click("#menu-btn"); phone.wait_for_selector("#grp-global", state="visible")
            assert phone.evaluate("(() => { const s = document.querySelector('.window > .side'); return s.scrollWidth <= s.clientWidth + 1; })()")
            b.close()
        assert not errors, "\n".join(errors)
        print("E2E hub test passed")
    finally:
        srv.terminate(); oll.terminate()


if __name__ == "__main__":
    main()
