"""End-to-end: Ship it (review what changed, approve/deny, vote to push), Turbo, Share, Pulse and Split.

A temp project repo with a bare "origin" (main pushed), then new saved changes on main by a person and an AI helper.
Starts the server with --repo, a desktop host (Orion), a friend (Maya) and Maya's agent.
  1. GET /api/ship: what changed since the last push (saved changes, files, who, linked tasks)
  2. host mode: the host's Ship it pushes exactly the reviewed change; a deny ships nothing
  3. vote to push (majority of 2 people): one yes waits, agents can't vote, the second yes ships; one-tap approvals count
  4. Turbo: off by default; on, it waits for a quiet moment / skips during a vote / ships in one push / rate limits
  5. Share text (copied in the UI), the pulse line, MCP ship_status + request_ship (request yes, approve never), Split
Usage: python app/test/e2e_ship_flow.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 4911 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ok(r, what):
    assert r[0] == 200, (what, r)
    return r[1]


def mcp(token, tool, args=None, method="tools/call"):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": {"name": tool, "arguments": args or {}} if method == "tools/call" else {}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read())["result"]
    return d if method != "tools/call" else (d.get("isError", False), d["content"][0]["text"])


def wait_text(page, sel, text, timeout=10000):
    page.wait_for_function("([s, t]) => { const e = document.querySelector(s); return e && e.textContent.includes(t); }", arg=[sel, text], timeout=timeout)


def wait_until(fn, timeout=20, what="condition"):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError(f"timed out waiting for {what}")


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and "ERR_" not in m.text and "Failed to load resource" not in m.text and errors.append(f"{who} console: {m.text}"))


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-ship-", dir="/tmp")
    work = tempfile.mkdtemp(prefix="proj-ship-", dir="/tmp")
    origin, repo = os.path.join(work, "origin.git"), os.path.join(work, "game")
    sh = lambda *a: subprocess.run(list(a), check=True, capture_output=True, text=True).stdout.strip()
    def g(*a, who="Orion"): return sh("git", "-C", repo, "-c", f"user.email={who.lower()}@t", "-c", f"user.name={who}", *a)
    def save(name, text, msg, who="Orion"):
        Path(repo, name).write_text(text); g("add", name, who=who); g("commit", "-q", "-m", msg, who=who)
    sh("git", "init", "-q", "--bare", "-b", "main", origin)
    sh("git", "init", "-q", "-b", "main", repo)
    save("README.md", "# Lantern Run\n", "init")
    g("remote", "add", "origin", origin); g("push", "-q", "-u", "origin", "main")
    origin_main = lambda: sh("git", "-C", origin, "rev-parse", "main")
    start = origin_main()

    env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_REPO_POLL_MS": "2000", "TRIBE_TURBO_TICK_MS": "600000", "TRIBE_TURBO_QUIET_MS": "1500", "NO_PROXY": "127.0.0.1,localhost"}
    log = open(Path(tmp) / "server.log", "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tmp, "--name", "Lantern Crew", "--repo", repo, "--ollama", "http://localhost:9"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.25)
        assert api("/ship")[0] == 401

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            hctx = b.new_context(viewport={"width": 1500, "height": 1000})
            hctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
            hctx.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'}))")
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            htok = host.evaluate("TribeStore.get().server.token")

            # a friend and her AI helper
            inv = ok(api("/invites", "POST", {"hours": 1, "maxUses": 3, "role": "builder"}, htok), "invite")["invite"]
            j = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}), "join")
            maya, mid = j["token"], j["member"]["id"]
            ag = ok(api("/agents", "POST", token=maya), "agent"); atok, aname = ag["token"], ag["agent"]["name"]
            tools = [t["name"] for t in mcp(atok, None, method="tools/list")["tools"]]
            assert "ship_status" in tools and "request_ship" in tools, tools

            # ---- 1. what changed since the last push ----
            o = ok(api("/ship", token=htok), "ship")
            assert o["enabled"] and not o["canShip"] and "Nothing new" in o["blocker"], o
            t = ok(api("/tasks", "POST", {"title": "Title screen"}, htok), "task"); t = t.get("task", t)
            ok(api(f"/tasks/{t['id']}", "PATCH", {"status": "done"}, htok), "task done")
            save("title.js", "export const title = 'Lantern Run';\n", "Add the title screen")
            save("lantern.js", "export const swing = 1;\n", "Swing the lantern", who=aname)
            o = ok(api("/ship", token=htok), "ship")
            assert o["canShip"] and o["count"] == 2 and set(o["files"]) == {"title.js", "lantern.js"}, o
            assert any(x["kind"] == "agent" and x["name"] == aname for x in o["people"]), o["people"]
            assert any(x["title"] == "Title screen" for x in o["tasks"]), o["tasks"]
            assert o["mode"] == "host" and not o["turbo"]["on"], o

            # ---- 2. host mode: a deny ships nothing; the host's Ship it pushes exactly what was reviewed ----
            r = ok(api("/ship/request", "POST", {"note": "Title screen is in"}, maya), "maya asks")["request"]
            assert r["status"] == "pending" and r["tally"]["needed"] == 1 and "Orion" in r["tally"]["waitingOn"], r
            assert api(f"/ship/{r['id']}/vote", "POST", {"vote": "yes"}, maya)[0] == 403, "in host mode Maya can't decide"
            r = ok(api(f"/ship/{r['id']}/vote", "POST", {"vote": "no", "comment": "Let's add sound first"}, htok), "deny")["request"]
            assert r["status"] == "denied" and origin_main() == start, r
            # the UI: the Ready to ship card shows the overview; Ship it pushes
            host.evaluate("TribeApp.show('repo')")
            host.wait_for_selector("#ship-card .sh-commit", timeout=15000)
            wait_text(host, "#ship-card", "2 saved changes"); wait_text(host, "#ship-card", "title.js")
            wait_text(host, "#ship-card", "Title screen")
            if take: host.wait_for_timeout(400); host.locator("#ship-card").screenshot(path=str(SHOTS / "ship-card.png"))
            host.click("#ship-card [data-sh=ship]")
            wait_until(lambda: origin_main() == g("rev-parse", "HEAD"), what="host ship pushed")
            wait_text(host, "#ship-card", "on GitHub", timeout=15000)
            o = ok(api("/ship", token=htok), "ship")
            assert not o["canShip"] and o["lastShip"] and o["log"][0]["kind"] == "ship", o

            # ---- 3. vote to push: majority of 2 people ----
            assert api("/ship/settings", "PUT", {"mode": "majority"}, maya)[0] == 403, "only the host changes the mode"
            ok(api("/ship/settings", "PUT", {"mode": "majority"}, htok), "majority")
            save("sound.js", "export const creak = true;\n", "Add a creak sound", who="Maya")
            head = g("rev-parse", "HEAD")
            err, out = mcp(atok, "request_ship", {"note": "Sound is in, tests pass"}); assert not err, out
            req = json.loads(out); assert req["status"] == "pending", req
            st, body = api(f"/ship/{req['id']}/vote", "POST", {"vote": "yes"}, atok); assert st == 403 and "only people" in body["error"], (st, body)
            r = ok(api(f"/ship/{req['id']}/vote", "POST", {"vote": "yes"}, maya), "maya yes")["request"]
            assert r["status"] == "pending" and r["tally"]["yes"] == 1 and r["tally"]["needed"] == 2 and origin_main() != head, r
            pl = ok(api("/ship/pulse", token=htok), "pulse"); assert any(x["kind"] == "ship" and "waiting on Orion" in x["text"] for x in pl["lines"]), pl
            # Orion's one-tap approval (the inbox / phone path) counts as his vote
            aps = ok(api("/approvals", token=htok), "approvals")["approvals"]
            mine = [a for a in aps if a["kind"] == "ship" and a["status"] == "pending" and a["to"] == [j_host_id(htok)]]
            assert mine, aps
            ok(api(f"/approvals/{mine[0]['id']}/approve", "POST", {"note": "ship it"}, htok), "one-tap")
            wait_until(lambda: origin_main() == head, what="vote ship pushed")
            wait_until(lambda: api("/ship", token=htok)[1]["request"]["status"] == "shipped", what="request marked shipped")
            err, out = mcp(atok, "ship_status"); s = json.loads(out); assert not err and s["canShip"] is False and s["request"]["status"] == "shipped", s

            # ---- 4. Turbo ----
            ok(api("/ship/settings", "PUT", {"mode": "host"}, htok), "host mode")
            assert ok(api("/ship/turbo/run", "POST", {}, htok), "turbo")["reason"]  # forced check works even when off
            assert api("/ship/turbo/run", "POST", {}, maya)[0] == 403
            ok(api("/ship/settings", "PUT", {"turbo": {"on": True, "maxPerHour": 1}}, htok), "turbo on")
            save("level2.json", "{}\n", "Level 2 layout")
            save("level2.js", "export const l2 = 1;\n", "Level 2 code")
            two = g("rev-parse", "HEAD")
            r = ok(api("/ship/turbo/run", "POST", {}, htok), "turbo quiet"); assert not r["shipped"] and "quiet" in r["reason"], r
            # a vote in progress holds Turbo
            vr = ok(api("/ship/request", "POST", {"note": "manual"}, maya), "maya asks")["request"]
            time.sleep(1.7)
            r = ok(api("/ship/turbo/run", "POST", {}, htok), "turbo vote"); assert not r["shipped"] and "vote" in r["reason"], r
            ok(api(f"/ship/{vr['id']}/cancel", "POST", {}, maya), "cancel")
            r = ok(api("/ship/turbo/run", "POST", {}, htok), "turbo ship"); assert r["shipped"], r
            assert origin_main() == two, "both saved changes went out in one push"
            o = ok(api("/ship", token=htok), "ship"); assert o["log"][0]["kind"] == "turbo" and "2 saved changes" in o["log"][0]["text"], o["log"]
            save("level3.js", "export const l3 = 1;\n", "Level 3"); time.sleep(1.7)
            r = ok(api("/ship/turbo/run", "POST", {}, htok), "turbo rate"); assert not r["shipped"] and "this hour" in r["reason"], r
            host.evaluate("TribeShip && TribeShip.refresh()")
            wait_text(host, "#ship-card", "Turbo is on")
            ok(api("/ship/settings", "PUT", {"turbo": {"on": False}}, htok), "turbo off")

            # ---- 5. share, pulse, split ----
            sh_ = ok(api("/ship/share", token=htok), "share")
            assert "game on TribeCode" in sh_["text"] and "1 done" in sh_["text"] and "Code: " in sh_["text"] and "Latest saved changes" in sh_["text"], sh_
            pt = ok(api("/tasks", "POST", {"title": "Add jump, coins and a score"}, maya), "task"); pt = pt.get("task", pt)
            ok(api(f"/tasks/{pt['id']}", "PATCH", {"status": "doing", "assignee": mid}, maya), "doing")
            pl = ok(api("/ship/pulse", token=htok), "pulse"); assert any("Maya is working on" in x["text"] for x in pl["lines"]), pl
            sp = ok(api(f"/tasks/{pt['id']}/split", "POST", {}, maya), "split"); assert len(sp["tasks"]) == 3 and sp["by"] == "rules", sp
            assert [x["title"] for x in sp["tasks"]] == ["Add jump", "Add coins", "Add a score"], sp
            host.evaluate("TribeShip.refresh()"); host.wait_for_selector("#ship-share", timeout=10000)
            host.click("#ship-share")
            wait_until(lambda: "on TribeCode" in (host.evaluate("navigator.clipboard.readText()") or ""), what="share text copied")
            clip = host.evaluate("navigator.clipboard.readText()"); assert "/join/" in clip or "go.html" in clip, clip
            b.close()
        if errors: raise AssertionError("errors:\n" + "\n".join(errors))
        print("e2e_ship_flow: OK")
    except Exception:
        log.seek(0); print(log.read()[-3000:]); raise
    finally:
        srv.terminate()


_host_ids = {}
def j_host_id(tok):
    if tok not in _host_ids: _host_ids[tok] = api("/me", token=tok)[1].get("member", api("/me", token=tok)[1]).get("id")
    return _host_ids[tok]


if __name__ == "__main__":
    main()
