"""End-to-end journeys (v0.22): from joining a tribe to a finished product, for a game, an app and a website, plus a
"TribeCode-style" landing page. Each journey: the host starts the tribe, a friend joins with the invite, they make a
project from one sentence, set it up (vision, repo, starter), an AI agent joins and reports in public chat, a task is
finished, and the result is real files you can open: the game in the Preview, the app starter, the published site.

  Game:     vision -> engineer picks an engine -> repo -> starter (index.html + game code) -> Preview serves it
  App:      vision -> repo -> phone app starter (Expo) committed -> files on disk
  Website:  vision -> Instant site ("a site for my bakery") -> Publish -> site/index.html + styles.css with the name
  Landing:  a TribeCode-style landing page from one sentence -> Publish -> hero says it, features listed
  Everyone: the friend sees the project, an agent claims work and posts in the channel, a finished task is announced.
Usage: python app/test/e2e_journeys.py
"""
import http.client, json, os, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 5340 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"


def api(path, method="GET", body=None, token=None, project=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"; return r[1]


def raw(path):
    c = http.client.HTTPConnection("localhost", PORT, timeout=30); c.request("GET", path)
    r = c.getresponse(); b = r.read(); c.close(); return r.status, {k.lower(): v for k, v in r.getheaders()}, b


def mcp(token, tool, args=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args or {}}}
    req = urllib.request.Request(BASE + "/mcp", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as r: d = json.loads(r.read())["result"]
    return d.get("isError", False), d["content"][0]["text"]


def chat(tok, pid):
    return [m.get("text") or "" for m in ok(api("/chat/general?limit=200", token=tok, project=pid))["messages"]]


def wait_until(fn, timeout=15, what=""):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if fn(): return
        except Exception: pass
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)


def new_project(host, name, bio, vision):
    p = ok(api("/projects", "POST", {"name": name, "bio": bio}, token=host), f"create {name}")
    pid = (p.get("project") or p)["id"]
    ok(api("/vision", "PUT", {"text": f"# {name}\n\n{vision}\n"}, token=host, project=pid), "vision")
    return pid


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-jy-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_PHONEAPP_NPM": "true"}
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    try:
        wait_until(lambda: api("/health")[0] == 200, 20, "server")
        # ---- the tribe: host + a friend who joins with the invite ----
        host = ok(api("/bootstrap", "POST", {"name": "Camp"}))["token"]
        inv = ok(api("/invites", "POST", {}, token=host))["invite"]
        friend = ok(api("/join", "POST", {"code": inv["code"], "name": "Maya"}))["token"]
        agent = ok(api("/agents", "POST", {}, token=friend), "Maya connects her Claude")["token"]
        mcp(agent, "tribe_overview")

        def everyone(pid, label):
            # the friend can see and talk in the project
            assert any(p["id"] == pid for p in ok(api("/projects", token=friend))["projects"]), f"{label}: friend sees it"
            ok(api("/chat/general", "POST", {"text": f"Let's build {label}!"}, token=friend, project=pid))
            # an agent takes a task and posts progress in public
            t = ok(api("/tasks", "POST", {"title": f"[{label}] First version"}, token=host, project=pid))["task"]
            aid = [m for m in ok(api("/members", token=host))["members"] if m.get("role") == "agent"][0]["id"]
            ok(api(f"/tasks/{t['id']}", "PATCH", {"assignee": aid}, token=host, project=pid))
            err, txt = mcp(agent, "post_update", {"kind": "finished", "text": f"A first version of {label} is in.", "project": pid})   # v0.37: agents tell the tribe with a one-line update card
            assert not err, txt
            ok(api(f"/tasks/{t['id']}", "PATCH", {"status": "done"}, token=host, project=pid))
            wait_until(lambda: any("finished **[" + label + "]" in x for x in chat(host, pid)), 10, f"{label}: finished task announced")
            assert any(f"first version of {label}" in x for x in chat(friend, pid)), f"{label}: the agent's update is public"

        # ---- 1. a game ----
        g = new_project(host, "Pixel Garden", "A cozy pixel game", "A cozy pixel game where friends water plants at night. Done for now: one garden, five plants, plays on a phone.")
        s = ok(api(f"/projects/{g}/setup", token=host), "setup view")
        assert s["kind"] == "game", s["kind"]
        eng = (s.get("choices") or {}).get("engineer") or (next((r for r in s["roles"] if r.get("id") == "engineer"), {}) or {}).get("options", [{}])
        ok(api(f"/projects/{g}/setup/repo", "POST", {}, token=host), "game repo")
        st = ok(api(f"/projects/{g}/setup/starter", "POST", {}, token=host), "game starter")
        assert st["written"] and any(f.endswith("index.html") for f in st["written"]), st
        pt = ok(api("/preview/token", "POST", token=host, project=g), "preview token")
        tok = pt.get("pt") or pt.get("token"); path = pt.get("path") or f"/preview/{g}/{tok}/"
        code, hd, body = raw(path)
        if code in (301, 302): code, hd, body = raw(hd["location"])
        assert code == 200 and b"Pixel Garden" in body, (code, body[:200])
        everyone(g, "Pixel Garden")

        # ---- 2. an app ----
        a = new_project(host, "Habit Buddy", "An app that tracks our habits", "A phone app where friends track habits together and cheer each other on.")
        ok(api(f"/projects/{a}/setup/repo", "POST", {}, token=host), "app repo")
        ok(api("/phoneapp", "PUT", {"on": True, "stack": "expo"}, token=host, project=a), "phone app mode")
        pa = ok(api("/phoneapp/setup", "POST", {"stack": "expo"}, token=host, project=a), "phone app starter")
        info = ok(api("/phoneapp", token=host, project=a))
        assert info.get("setUp") and info.get("hasPackage"), info
        everyone(a, "Habit Buddy")

        # ---- 3. a website ----
        w = new_project(host, "Corner Bakery", "Fresh bread every morning", "A website for our neighborhood bakery: hours, the menu, where we are, and a way to order a cake.")
        ok(api(f"/projects/{w}/website/instant", "POST", {"hint": "build a site for my bakery"}, token=host), "instant site")
        ok(api(f"/projects/{w}/setup/repo", "POST", {}, token=host), "site repo")
        ok(api(f"/projects/{w}/website/publish", "POST", {}, token=host), "publish")
        site = tmp / "tribe" / "workspaces" / w / "site"
        ih = (site / "index.html").read_text(); cs = (site / "styles.css").read_text()
        assert "Corner Bakery" in ih and '<link rel="stylesheet" href="styles.css">' in ih and ":root {" in cs, ih[:300]
        everyone(w, "Corner Bakery")

        # ---- 4. a TribeCode-style landing page from one sentence ----
        l = new_project(host, "TribeCode Site", "Code anything, together", "TribeCode is where friends make apps, games and websites together with AI helpers. "
                        "Start with one sentence, send friends a link, build it together, ship it. Free and open source.")
        ok(api(f"/projects/{l}/website/instant", "POST", {"hint": "a landing page for an app that lets friends code together", "type": "app"}, token=host), "landing instant")
        site = ok(api(f"/projects/{l}/website", token=host), "site state")
        txt = json.dumps(site)
        assert "TribeCode" in txt, txt[:300]
        ok(api(f"/projects/{l}/setup/repo", "POST", {}, token=host), "landing repo")
        ok(api(f"/projects/{l}/website/publish", "POST", {}, token=host), "landing publish")
        lh = (tmp / "tribe" / "workspaces" / l / "site" / "index.html").read_text()
        assert "TribeCode" in lh and "section: hero" in lh, lh[:300]
        print("ok e2e_journeys")
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
