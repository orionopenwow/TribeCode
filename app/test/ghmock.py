"""A stand-in for api.github.com, for the Publish tests (e2e_publish_real.py, security9_test.py).

Knows just what TribeCode's publish path uses: /user, a person's projects, the Git Data API (ref, blobs, trees,
commits), Pages, and the runs of one build file. Everything it is told is kept in STATE so a test can look.
"""
import base64, hashlib, http.server, json, re, threading

GOOD = {}     # token -> login
DEVICE = {"client": "Ov23liTESTCLIENT", "code": "WDJB-MJHT", "device": "dev-code-1", "token": None, "approved": False, "denied": False, "polls": 0}   # the sign-in stand-in (feat/setup-github)
STATE = {"repos": {}, "auth": [], "calls": [], "pages_allowed": True, "fail": None, "runs": "success"}


def reset():
    STATE.update({"repos": {}, "auth": [], "calls": [], "pages_allowed": True, "fail": None, "runs": "success"})


def tree_of(full):
    """{path: bytes} at the head of a mock project."""
    r = STATE["repos"][full]; c = r["commits"].get(r["head"]) or {}; t = r["trees"].get(c.get("tree")) or []
    return {x["path"]: r["blobs"][x["sha"]] for x in t}


class GH(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, obj=None):
        b = json.dumps(obj if obj is not None else {}).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
        self.send_header("X-OAuth-Scopes", "repo, workflow"); self.end_headers(); self.wfile.write(b)

    def _go(self, method):
        n = int(self.headers.get("Content-Length") or 0); raw = self.rfile.read(n) if n else b""; self._raw = raw
        try: body = json.loads(raw or b"{}") if n else {}
        except Exception: body = {}
        auth = self.headers.get("Authorization") or ""; tok = auth.split(" ", 1)[1] if " " in auth else ""
        path = self.path.split("?")[0]
        # GitHub's sign-in with a short code (github.com/login/device), for the Connect GitHub tests: form posts, no token yet
        if path in ("/login/device/code", "/login/oauth/access_token"):
            from urllib.parse import parse_qs
            form = {k: v[0] for k, v in parse_qs(getattr(self, "_raw", b"").decode()).items()}
            STATE["calls"].append((method, path))
            if form.get("client_id") != DEVICE["client"]: return self._send(200, {"error": "incorrect_client_credentials"})
            if path == "/login/device/code": return self._send(200, {"device_code": DEVICE["device"], "user_code": DEVICE["code"], "verification_uri": "https://github.test/login/device", "expires_in": 900, "interval": 1})
            DEVICE["polls"] += 1
            if DEVICE["denied"]: return self._send(200, {"error": "access_denied"})
            if not DEVICE["approved"] or form.get("device_code") != DEVICE["device"]: return self._send(200, {"error": "authorization_pending"})
            return self._send(200, {"access_token": DEVICE["token"], "token_type": "bearer", "scope": "repo,workflow"})
        STATE["auth"].append(tok); STATE["calls"].append((method, path))
        login = GOOD.get(tok)
        if not login: return self._send(401, {"message": "Bad credentials"})
        if STATE["fail"]: return self._send(500, {"message": STATE["fail"]})
        if path == "/user": return self._send(200, {"login": login, "id": 7, "name": login, "avatar_url": ""})
        if path == "/user/repos" and method == "GET":
            return self._send(200, [{"full_name": f, "private": r.get("private", True), "html_url": f"https://github.com/{f}", "pushed_at": "2026-11-10T10:00:00Z", "permissions": {"push": True}} for f, r in STATE["repos"].items() if f.startswith(login + "/")])
        if path == "/user/repos" and method == "POST":
            if STATE.get("no_create"): return self._send(403, {"message": "Resource not accessible by personal access token"})
            full = f"{login}/{body['name']}"
            if full in STATE["repos"]: return self._send(422, {"message": "name already exists on this account"})
            STATE["repos"][full] = {"head": "c0", "blobs": {}, "trees": {"t0": []}, "commits": {"c0": {"tree": "t0", "parents": []}}, "pages": None, "desc": body.get("description"), "pushes": 0, "private": body.get("private", False)}
            return self._send(201, {"full_name": full, "default_branch": "main", "private": body.get("private", False), "html_url": f"https://github.com/{full}", "clone_url": f"https://github.com/{full}.git"})
        m = re.match(r"^/repos/([^/]+/[^/]+)(/.*)?$", path)
        if not m: return self._send(404, {"message": "Not Found"})
        full, rest = m.group(1), m.group(2) or ""
        r = STATE["repos"].get(full)
        if not r or not full.startswith(login + "/"): return self._send(404, {"message": "Not Found"})
        if rest == "": return self._send(200, {"full_name": full, "default_branch": "main"})
        if rest.startswith("/contents/"):
            t = tree_of(full); p = rest[len("/contents/"):]
            return self._send(200, {"path": p}) if p in t else self._send(404, {"message": "Not Found"})
        if rest == "/git/ref/heads/main": return self._send(200, {"object": {"sha": r["head"]}})
        if rest == "/git/blobs" and method == "POST":
            data = base64.b64decode(body["content"]) if body.get("encoding") == "base64" else body.get("content", "").encode()
            sha = hashlib.sha1(data).hexdigest(); r["blobs"][sha] = data; return self._send(201, {"sha": sha})
        if rest == "/git/trees" and method == "POST":
            if "base_tree" in body: return self._send(422, {"message": "the test expects a whole tree"})
            sha = "t" + hashlib.sha1(json.dumps(body["tree"]).encode()).hexdigest()[:12]; r["trees"][sha] = body["tree"]; return self._send(201, {"sha": sha})
        if rest == "/git/commits" and method == "POST":
            sha = "c" + hashlib.sha1(json.dumps(body).encode()).hexdigest()[:12]; r["commits"][sha] = body; return self._send(201, {"sha": sha})
        if rest == "/git/refs/heads/main" and method == "PATCH":
            if body.get("force"): return self._send(422, {"message": "the test refuses a forced update"})
            if r["commits"][body["sha"]]["parents"] != [r["head"]]: return self._send(422, {"message": "not a fast forward"})
            r["head"] = body["sha"]; r["pushes"] += 1; return self._send(200, {"object": {"sha": r["head"]}})
        if rest == "/pages":
            url = f"https://{login.lower()}.github.io/{full.split('/')[1]}/"
            if method == "GET": return self._send(200, {"html_url": url}) if r["pages"] else self._send(404, {"message": "Not Found"})
            if not STATE["pages_allowed"]: return self._send(403, {"message": "Resource not accessible by integration"})
            r["pages"] = body.get("source"); return self._send(201, {"html_url": url})
        if rest in ("/actions/workflows/tribecode-android.yml/runs", "/actions/workflows/tribecode-desktop.yml/runs"):
            if ".github/workflows/" + rest.split("/")[3] not in tree_of(full): return self._send(404, {"message": "Not Found"})
            run = {"status": "completed", "conclusion": STATE["runs"], "html_url": f"https://github.com/{full}/actions/runs/1"} if STATE["runs"] in ("success", "failure") else {"status": "in_progress", "conclusion": None, "html_url": f"https://github.com/{full}/actions/runs/1"}
            return self._send(200, {"total_count": 1, "workflow_runs": [run]})
        return self._send(404, {"message": "Not Found"})

    def do_GET(self): self._go("GET")
    def do_POST(self): self._go("POST")
    def do_PATCH(self): self._go("PATCH")
    def do_PUT(self): self._go("PUT")
    def do_DELETE(self): self._go("DELETE")


def start(port):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), GH)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv
