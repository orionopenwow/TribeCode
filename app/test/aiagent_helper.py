"""Shared by e2e_ai_agent_site.py and e2e_ai_agent_app.py: a tribe on its own port, and a scripted MCP agent.
The agent is a plain MCP client (JSON-RPC over HTTP): it knows nothing about TribeCode but what the tools return."""
import json, os, re, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Tribe:
    def __init__(self, port, prefix="tribe-ai-"):
        self.port = port; self.base = f"http://localhost:{port}"; self.tmp = Path(tempfile.mkdtemp(prefix=prefix, dir="/tmp")); self._rid = 0
        env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_DESIGNFILES_MS": "150", "NO_PROXY": "127.0.0.1,localhost"}
        env.pop("TRIBE_NO_AI_FILES", None)
        self.srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(self.tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(self.tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
        for _ in range(150):
            try:
                if self.api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)

    def stop(self):
        self.srv.terminate()
        try: self.srv.wait(timeout=10)
        except Exception: self.srv.kill()

    def log(self): return (self.tmp / "log").read_text()[-3000:]

    def api(self, path, method="GET", body=None, token=None, project=None):
        h = {"Content-Type": "application/json"}
        if token: h["Authorization"] = "Bearer " + token
        if project: h["X-Project"] = project
        r = urllib.request.Request(self.base + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try: return e.code, json.loads(raw or b"{}")
            except Exception: return e.code, {"raw": raw[:300].decode("utf8", "replace")}

    def ok(self, r, what=""):
        assert r[0] in (200, 202), f"{what}: {r}"; return r[1]

    def rpc(self, token, method, params=None):
        self._rid += 1
        req = urllib.request.Request(self.base + "/mcp", method="POST", data=json.dumps({"jsonrpc": "2.0", "id": self._rid, "method": method, "params": params or {}}).encode(), headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
        try:
            with urllib.request.urlopen(req, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

    def join(self, host, name, role="builder", project=None):
        body = {"role": role}
        if project: body["project"] = project
        inv = self.ok(self.api("/invites", "POST", body, token=host))["invite"]
        j = self.ok(self.api("/join", "POST", {"code": inv["code"], "name": name})); return j["token"], j["member"]["id"]

    def agent(self, owner, scopes=None, kind="claude"):
        r = self.ok(self.api("/invite-agent", "POST", {"kind": kind}, token=owner), "invite an agent")
        if scopes is not None: self.ok(self.api("/invite-agent", "PUT", {"kind": kind, "scopes": scopes}, token=owner))
        a = Agent(self, r["token"]); st, j = self.rpc(r["token"], "initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "scripted-agent"}}); assert st == 200, j
        a.init = j["result"]; return a


class Agent:
    """Calls tools and keeps count of what it was sent, so the test can check answers fit a model's context."""
    def __init__(self, tribe, key): self.t = tribe; self.key = key; self.calls = []; self.biggest = ("", 0)

    def call(self, name, args=None, project=None):
        a = dict(args or {})
        if project: a["project"] = project
        st, j = self.t.rpc(self.key, "tools/call", {"name": name, "arguments": a}); assert st == 200, (name, st, j)
        if "error" in j: return True, j["error"].get("message", "")
        res = j["result"]; out = "".join(c.get("text", "") for c in res.get("content", []))
        self.calls.append(name)
        if len(out) > self.biggest[1]: self.biggest = (name, len(out))
        return bool(res.get("isError")), out

    def good(self, name, args=None, project=None):
        err, out = self.call(name, args, project); assert not err, (name, args, out[:600]); return out

    def bad(self, name, args=None, project=None):
        err, out = self.call(name, args, project); assert err, (name, args, out[:300]); return out

    def tools(self):
        st, j = self.t.rpc(self.key, "tools/list"); assert st == 200, j; return {x["name"]: x for x in j["result"]["tools"]}


def guide_ops(guide):
    """The steps a guide documents: the op names in its steps section (lines like "- `add`: …")."""
    part = guide.split("## ")
    sec = next(p for p in part if re.match(r"\d+\. The steps", p))
    return re.findall(r"^- `([a-z.]+)`:", sec, re.M)


def guide_recipe(guide, starts):
    """A row of the guide's layout table as [(type, variant), …]."""
    row = next(l for l in guide.splitlines() if l.startswith("| " + starts))
    return [tuple(x.strip() for x in s.split("·")) for s in row.split("|")[2].split("→")]
