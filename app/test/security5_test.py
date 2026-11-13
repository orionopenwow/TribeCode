"""Security regression test 5: the auth endpoints of feat/auth2 (docs/ACCOUNTS.md, docs/SIGNUP-FLOWS.md).

A   admin routes (open sign-up, SMTP, Send test email, password resets) answer only the host, only on the host computer;
    the SMTP password is never sent back and .tribe/auth.json is 0600.
C   CSRF: account POSTs from another site's Origin, a cross-site fetch without Origin, or a non-JSON body are refused.
H   Host-header poisoning: a remote request with a forged Host still gets mail links to an allowed address.
I   header injection: CR/LF in an email address or the SMTP From is refused.
T   forged or missing one-time things: provider tickets, email links, reset links, desktop codes without the verifier,
    desktop starts without a proper S256 challenge (and never for join/link), account links without an account session.
R   the 6-character desktop code can't be brute-forced (rate-limited per client, three wrong verifiers kill a code).
Usage: python app/test/security5_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, json, os, re, socketserver, stat, subprocess, tempfile, threading, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, SMTP_PORT = 5430 + OFF, 5431 + OFF
BASE = f"http://localhost:{PORT}"
MAIL = []


class Smtp(socketserver.StreamRequestHandler):
    def handle(self):
        w = lambda s: self.wfile.write((s + "\r\n").encode())
        w("220 ok")
        while True:
            line = self.rfile.readline().decode("utf8", "replace")
            if not line: return
            up = line.strip().upper()
            if up.startswith("EHLO"): w("250-x"); w("250-AUTH PLAIN"); w("250 8BITMIME")
            elif up.startswith("AUTH"): w("235 ok")
            elif up == "DATA":
                w("354 go"); data = []
                while True:
                    l = self.rfile.readline().decode("utf8", "replace")
                    if l in (".\r\n", ""): break
                    data.append(l)
                MAIL.append("".join(data)); w("250 ok")
            elif up == "QUIT": w("221 bye"); return
            else: w("250 ok")


opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
n = [40]


def remote():
    n[0] += 1
    return {"X-Forwarded-For": f"198.51.100.{n[0]}"}


def api(path, method="GET", body=None, token=None, headers=None, ctype="application/json"):
    h = {"Content-Type": ctype, **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    data = (body if isinstance(body, bytes) else json.dumps(body).encode()) if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with opener.open(req, timeout=30) as r: raw = r.read(); st = r.status
    except urllib.error.HTTPError as e: raw = e.read(); st = e.code
    try: return st, json.loads(raw or b"{}")
    except Exception: return st, {}


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec5-", dir="/tmp")
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    smtp = socketserver.ThreadingTCPServer(("127.0.0.1", SMTP_PORT), Smtp); threading.Thread(target=smtp.serve_forever, daemon=True).start()
    env = {**os.environ, "TRIBE_NO_DOWNLOAD": "1", "TRIBE_TEST": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1", "NO_PROXY": "127.0.0.1,localhost",
           "TRIBE_OAUTH_DISCORD_ID": "sec5clientid", "TRIBE_OAUTH_DISCORD_SECRET": "sec5-secret-value"}
    env.pop("TRIBE_PUBLIC_URL", None)
    tribe = Path(tmp) / "tribe"
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tribe), "--ollama", "http://localhost:9"],
                           stdout=open(Path(tmp) / "server.log", "a"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try: opener.open(BASE + "/api/health"); break
            except Exception: time.sleep(0.1)
        host = api("/bootstrap", "POST", {"name": "Host"})[1]["token"]
        code = api("/invites", "POST", {}, token=host)[1]["invite"]["code"]
        friend = api("/join", "POST", {"code": code, "name": "Friend"})[1]["token"]

        # A: admin routes
        smtp_cfg = {"smtp": {"host": "127.0.0.1", "port": SMTP_PORT, "secure": "none", "user": "u", "pass": "hunter2-smtp", "from": "tribe@example.test"}}
        assert api("/accounts/admin/settings", "PUT", smtp_cfg, token=friend)[0] == 403, "A: a member can't change sign-in settings"
        assert api("/accounts/admin/settings", "PUT", smtp_cfg, token=host, headers=remote())[0] == 403, "A: not through a tunnel"
        assert api("/accounts/admin/settings", "PUT", smtp_cfg, token=host, headers={"Host": "evil.example"})[0] == 403, "A: not with a public Host"
        assert api("/accounts/admin/settings", "PUT", {"openSignup": False}, headers={})[0] == 403, "A: not without a key"
        st, s = api("/accounts/admin/settings", "PUT", smtp_cfg, token=host); assert st == 200 and "hunter2" not in json.dumps(s), (st, s)
        assert "hunter2" not in json.dumps(api("/accounts/admin/settings", token=host)[1]) and "hunter2" not in json.dumps(api("/accounts/config")[1])
        mode = stat.S_IMODE(os.stat(tribe / ".tribe" / "auth.json").st_mode); assert mode == 0o600, oct(mode)
        assert api("/accounts/admin/smtp-test", "POST", {"to": "x@example.test"}, token=host, headers=remote())[0] == 403
        assert api("/accounts/resets", token=host, headers=remote())[0] == 403, "A: resets stay on the host computer"
        print("  A: admin routes host-only and local-only; SMTP password never returned; auth.json 0600")

        # C: CSRF
        assert api("/accounts/signup", "POST", {"username": "csrf one", "password": "long enough phrase"}, headers={"Origin": "https://evil.example"})[0] == 403
        assert api("/accounts/signup", "POST", {"username": "csrf two", "password": "long enough phrase"}, headers={"Sec-Fetch-Site": "cross-site"})[0] == 403
        assert api("/accounts/signup", "POST", b'{"username":"csrf three","password":"long enough phrase"}', ctype="text/plain")[0] == 403
        assert api("/accounts/signup", "POST", b'username=x', ctype="application/x-www-form-urlencoded")[0] == 403
        assert api("/accounts/email/request", "POST", {"email": "a@example.test"}, headers={"Origin": "null"})[0] == 403
        print("  C: cross-site and non-JSON account POSTs refused")

        # H + I: mail links and headers
        st, a = api("/accounts/signup", "POST", {"username": "Vic", "password": "long enough phrase", "email": "vic@example.test"})
        assert st == 200
        for _ in range(50):
            if MAIL: break
            time.sleep(0.1)
        tok = re.search(r"#verify=([A-Za-z0-9_-]+)", MAIL[-1]).group(1)
        assert api("/accounts/email/complete", "POST", {"token": tok})[1].get("verified") == "vic@example.test"
        before = len(MAIL)
        st, _ = api("/accounts/email/request", "POST", {"email": "vic@example.test"}, headers={**remote(), "Host": "evil.example", "X-Forwarded-Host": "evil.example"})
        assert st == 200
        for _ in range(50):
            if len(MAIL) > before: break
            time.sleep(0.1)
        assert len(MAIL) > before and "evil.example" not in MAIL[-1] and f"http://localhost:{PORT}/signin.html#magic=" in MAIL[-1], MAIL[-1][-300:]
        assert api("/accounts/email/request", "POST", {"email": "a@example.test\r\nBcc: x@evil.example"}, headers=remote())[0] == 400, "I: CR/LF in an address"
        bad = {"smtp": {**smtp_cfg["smtp"], "from": "tribe@example.test\r\nBcc: x@evil.example"}}
        assert api("/accounts/admin/settings", "PUT", bad, token=host)[0] == 400, "I: CR/LF in From"
        assert api("/accounts/admin/settings", "PUT", {"smtp": {**smtp_cfg["smtp"], "host": "smtp.example.com"}}, token=host)[0] == 400, "plain SMTP to another computer refused"
        print("  H, I: mail links ignore a forged Host; CR/LF can't add headers")

        # T: forged one-time things
        R = remote()
        assert api("/accounts/oauth/confirm", "POST", {"ticket": "x" * 54, "username": "Forger"}, headers=R)[0] == 410
        assert api("/accounts/oauth/link", "POST", {"ticket": "x" * 54}, headers=R)[0] == 401
        assert api("/accounts/email/complete", "POST", {"token": "x" * 54}, headers=R)[0] == 410
        assert api("/accounts/reset/complete", "POST", {"token": "x" * 54, "password": "long enough phrase"}, headers=R)[0] == 410
        assert api("/accounts/email/complete", "POST", {"token": {"$ne": 1}}, headers=R)[0] == 410
        assert api("/oauth/discord/start", "POST", {"mode": "signin", "desktop": {}}, headers=R)[0] == 400
        assert api("/oauth/discord/start", "POST", {"mode": "signin", "desktop": {"challenge": "A" * 43, "method": "plain"}}, headers=R)[0] == 400
        assert api("/oauth/discord/start", "POST", {"mode": "join", "code": code, "desktop": {"challenge": "A" * 43}}, headers=R)[0] == 400
        assert api("/oauth/discord/start", "POST", {"mode": "link", "desktop": {"challenge": "A" * 43}}, token=friend, headers=R)[0] == 400
        assert api("/oauth/discord/start", "POST", {"mode": "account"}, headers=R)[0] == 401, "linking to an account needs its session"
        assert api("/oauth/desktop/exchange", "POST", {"code": "x" * 43, "verifier": "y" * 43}, headers=R)[0] == 410
        assert api("/accounts/methods/password", "DELETE", headers=R)[0] == 401
        assert api("/accounts/password", "POST", {"password": "long enough phrase"}, headers=R)[0] == 401
        vic = api("/accounts/login", "POST", {"username": "Vic", "password": "long enough phrase"}, headers=R)[1]["token"]
        assert api("/accounts/password", "POST", {"password": "another long phrase"}, token=vic, headers=R)[0] == 401, "changing a password needs the current one"
        print("  T: forged tickets, links, codes and starts refused")

        # R: brute force of the typed code
        B = remote()
        codes = [api("/oauth/desktop/exchange", "POST", {"short": f"AB{i:04d}"[-6:], "verifier": "v" * 43}, headers=B)[0] for i in range(14)]
        assert codes.count(429) >= 3 and set(codes) <= {410, 429}, codes
        print("  R: the typed desktop code is rate-limited")
        print("security5: OK")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        smtp.shutdown()


if __name__ == "__main__":
    main()
