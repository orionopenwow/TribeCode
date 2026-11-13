"""End-to-end: feat/auth2, the sign-up and sign-in gaps (docs/SIGNUP-FLOWS.md, docs/ACCOUNTS.md).

A local fake provider plays Discord, GitHub and Google (authorize, token with PKCE, profile with a verified email); a fake
SMTP server in this test receives every mail. The server runs with TRIBE_ACCOUNTS=1. "Remote" requests carry
X-Forwarded-For (what a tunnel adds), so they are not the host computer.

Checks: a new person signs up with a provider and edits the suggested username; signing in again needs no ticket; a
provider whose verified email belongs to an account offers a link, which needs a sign-in to that account first; open
sign-up off answers "invite" (the code works, a wrong one doesn't); remote sign-up and sign-in work, admin routes stay
local-only, cross-site and non-JSON POSTs are refused; the desktop handoff trades a one-time code plus the PKCE verifier
(reuse, expiry and a wrong verifier refused; the 6-character typed code works); a magic link signs in once, not twice, not
after expiry; an email reset works once; rate limits and the per-username lockout are hit; unknown and known emails get the
same answer; the last sign-in method can't be removed; the UI: the username step on signin.html, the desktop code page,
Settings › Account (methods, open sign-up, email). Screenshots: docs/screenshots/auth-*.png.
Usage: python app/test/e2e_auth2.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, http.server, json, os, re, secrets, socketserver, subprocess, sys, tempfile, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, MOCK_PORT, SMTP_PORT = 5720 + OFF, 5721 + OFF, 5722 + OFF
BASE = f"http://localhost:{PORT}"
MOCK = f"http://127.0.0.1:{MOCK_PORT}"
SHOTS = ROOT / "docs" / "screenshots"
CLIENT_ID = "auth2client123"
SECRET = "auth2-SECRET-" + "Q" * 20
LINK_MS = 6000
errors = []

# ---------------- the fake provider ----------------
PEOPLE = {
    "nelly": {"id": "70000000000000001", "username": "nelly", "global_name": "Nelly Rivers", "email": "nelly@example.test", "verified": True},
    "maya": {"id": "70000000000000002", "username": "maya", "global_name": "Maya G", "email": "maya@example.test", "verified": True},
    "otto": {"id": "70000000000000003", "username": "otto", "global_name": "Otto", "email": "otto@example.test", "verified": True},
    "dee": {"id": "70000000000000004", "username": "dee", "global_name": "Dee Desk", "email": "dee@example.test", "verified": True},
    "ui": {"id": "70000000000000005", "username": "uiperson", "global_name": "Robin Vale", "email": "robin@example.test", "verified": True},
    "ty": {"id": "70000000000000006", "username": "ty", "global_name": "Ty Typed", "email": "", "verified": False},
}
state = {"who": "nelly", "codes": {}, "tokens": {}}


class Mock(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def reply(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        prov = {"/oauth2/authorize": "discord", "/login/oauth/authorize": "github", "/o/oauth2/v2/auth": "google"}.get(u.path)
        if prov:
            if q.get("client_id") != CLIENT_ID or q.get("code_challenge_method") != "S256" or not q.get("state"): return self.reply(400, {"error": "invalid_request"})
            if "email" not in q.get("scope", ""): return self.reply(400, {"error": "email scope missing"})
            code = secrets.token_urlsafe(16)
            state["codes"][code] = {"provider": prov, "challenge": q["code_challenge"], "redirect_uri": q["redirect_uri"], "user": state["who"]}
            self.send_response(302); self.send_header("Location", q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": code, "state": q["state"]})); self.send_header("Content-Length", "0"); self.end_headers(); return
        t = (self.headers.get("Authorization") or "")[7:]; info = state["tokens"].get(t)
        if u.path in ("/api/users/@me", "/user", "/user/emails", "/v1/userinfo"):
            if not info: return self.reply(401, {"message": "no"})
            p = PEOPLE[info["user"]]
            if u.path == "/api/users/@me": return self.reply(200, {k: p[k] for k in ("id", "username", "global_name", "email", "verified")})
            if u.path == "/user": return self.reply(200, {"id": int(p["id"][-6:]), "login": p["username"], "name": p["global_name"]})
            if u.path == "/user/emails": return self.reply(200, [{"email": "old@example.test", "primary": False, "verified": True}, {"email": p["email"], "primary": True, "verified": p["verified"]}])
            return self.reply(200, {"sub": "g" + p["id"], "name": p["global_name"], "email": p["email"], "email_verified": p["verified"]})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); f = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
        c = state["codes"].pop(f.get("code", ""), None)
        ch = base64.urlsafe_b64encode(hashlib.sha256(f.get("code_verifier", "").encode()).digest()).rstrip(b"=").decode()
        if not c or f.get("client_secret") != SECRET or ch != c["challenge"] or f.get("redirect_uri") != c["redirect_uri"]: return self.reply(400, {"error": "invalid_grant"})
        t = secrets.token_urlsafe(24); state["tokens"][t] = c
        self.reply(200, {"access_token": t, "token_type": "Bearer"})


# ---------------- the fake SMTP server (plain, on this computer) ----------------
MAIL = []


class Smtp(socketserver.StreamRequestHandler):
    def handle(self):
        w = lambda s: self.wfile.write((s + "\r\n").encode())
        w("220 fake.smtp ready"); msg = {"rcpt": [], "auth": None}
        while True:
            line = self.rfile.readline().decode("utf8", "replace")
            if not line: return
            cmd = line.strip(); up = cmd.upper()
            if up.startswith("EHLO"): w("250-fake.smtp"); w("250-AUTH PLAIN LOGIN"); w("250 8BITMIME")
            elif up.startswith("AUTH PLAIN"):
                raw = base64.b64decode(cmd.split(" ", 2)[2]).split(b"\0"); msg["auth"] = (raw[1].decode(), raw[2].decode())
                w("235 ok" if msg["auth"] == ("tribe", "smtp-pass") else "535 bad")
            elif up.startswith("MAIL FROM"): msg["from"] = cmd; w("250 ok")
            elif up.startswith("RCPT TO"): msg["rcpt"].append(re.search(r"<([^>]+)>", cmd).group(1)); w("250 ok")
            elif up == "DATA":
                w("354 go"); data = []
                while True:
                    l = self.rfile.readline().decode("utf8", "replace")
                    if l in (".\r\n", ".\n", ""): break
                    data.append(l[1:] if l.startswith("..") else l)
                msg["data"] = "".join(data); MAIL.append(dict(msg)); msg = {"rcpt": [], "auth": msg["auth"]}; w("250 queued")
            elif up == "QUIT": w("221 bye"); return
            else: w("250 ok")


# ---------------- helpers ----------------
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
ip_n = [10]


def remote(ip=None):
    if ip is None: ip_n[0] += 1; ip = f"203.0.113.{ip_n[0]}"
    return {"X-Forwarded-For": ip}


def api(path, method="GET", body=None, token=None, headers=None, ctype="application/json"):
    h = {"Content-Type": ctype, **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    data = (body if isinstance(body, bytes) else json.dumps(body).encode()) if body is not None else None
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with opener.open(req, timeout=30) as r: raw = r.read(); st = r.status
    except urllib.error.HTTPError as e: raw = e.read(); st = e.code
    try: return st, json.loads(raw or b"{}")
    except Exception: return st, {"raw": raw[:200]}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r[0]} {r[1]}"
    return r[1]


def raw_get(url, cookie=None, headers=None):
    req = urllib.request.Request(url, headers={**({"Cookie": cookie} if cookie else {}), **(headers or {})})
    try:
        with opener.open(req, timeout=30) as r: return r.status, r.headers.get("Location"), r.headers.get("Set-Cookie")
    except urllib.error.HTTPError as e: return e.code, e.headers.get("Location"), e.headers.get("Set-Cookie")


def provider_flow(p, who, body, token=None, headers=None):
    """start -> go -> provider -> callback, by hand. Returns the final Location (a fragment with the one-time code)."""
    state["who"] = who
    d = ok(api(f"/oauth/{p}/start", "POST", body, token=token, headers=headers), f"start {p}")
    st, loc, sc = raw_get(d["url"], headers=headers)
    assert st == 302 and sc, (st, loc)
    cookie = sc.split(";")[0]
    st, cb, _ = raw_get(loc)
    assert st == 302 and "/callback?" in cb, (st, cb)
    st, land, _ = raw_get(cb, cookie=cookie, headers=headers)
    assert st == 302, (st, land)
    return land


def frag(loc):
    return dict(urllib.parse.parse_qsl(loc.split("#", 1)[1]))


def oauth_finish(p, who, headers=None, token=None):
    land = provider_flow(p, who, {"mode": "signin"}, headers=headers)
    rc = frag(land)["oauth"]
    return api("/oauth/finish", "POST", {"rc": rc}, token=token, headers=headers)


def pkce():
    v = secrets.token_urlsafe(32)[:43]
    return v, base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode()


def wait_mail(n, what, timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if len(MAIL) >= n: return MAIL[n - 1]
        time.sleep(0.1)
    raise AssertionError(f"no mail: {what} ({len(MAIL)} so far)")


def link_in(mail, kind):
    m = re.search(r"/signin\.html#" + kind + r"=([A-Za-z0-9_-]+)", mail["data"])
    assert m, mail["data"][:400]
    assert m.group(0) and mail["data"].count("http://localhost:" + str(PORT)) >= 1, "links point at an allowed address"
    return m.group(1)


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-auth2-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    mock = http.server.ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), Mock); threading.Thread(target=mock.serve_forever, daemon=True).start()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    smtp = socketserver.ThreadingTCPServer(("127.0.0.1", SMTP_PORT), Smtp); threading.Thread(target=smtp.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1",
           "TRIBE_TEST_LINK_MS": str(LINK_MS), "TRIBE_TEST_HANDOFF_MS": str(LINK_MS),
           "TRIBE_OAUTH_DISCORD_BASE": MOCK, "TRIBE_OAUTH_GITHUB_BASE": MOCK, "TRIBE_OAUTH_GOOGLE_BASE": MOCK, "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in ("TRIBE_PUBLIC_URL", "TRIBE_OPEN_SIGNUP"): env.pop(k, None)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Auth Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        for p in ("discord", "github", "google"):
            ok(api(f"/oauth/config/{p}", "PUT", {"clientId": CLIENT_ID, "clientSecret": SECRET, "enabled": True}, token=host), f"turn on {p}")

        # ---------------- the host's settings: local only, never the SMTP password ----------------
        assert ok(api("/accounts/config", headers=remote())) == {"on": True, "openSignup": True, "email": False}, "public config"
        assert api("/accounts/admin/settings", token=host, headers=remote())[0] == 403, "admin settings: not over a tunnel"
        assert api("/accounts/admin/settings")[0] == 403, "admin settings: the host only"
        assert api("/accounts/admin/settings", "PUT", {"smtp": {"host": "smtp.example.com", "port": 25, "secure": "none", "from": "a@b.co"}}, token=host)[0] == 400, "plain SMTP only to this computer"
        s = ok(api("/accounts/admin/settings", "PUT", {"smtp": {"host": "127.0.0.1", "port": SMTP_PORT, "secure": "none", "user": "tribe", "pass": "smtp-pass", "from": "TribeCode <tribe@example.test>"}}, token=host), "smtp")
        assert s["smtp"]["on"] and s["smtp"]["hasPass"] and "pass" not in s["smtp"] and "smtp-pass" not in json.dumps(s), s
        assert "smtp-pass" not in json.dumps(ok(api("/accounts/admin/settings", token=host))), "the SMTP password never goes back out"
        assert api("/accounts/admin/smtp-test", "POST", {"to": "orion@example.test"}, token=host, headers=remote())[0] == 403
        ok(api("/accounts/admin/smtp-test", "POST", {"to": "orion@example.test"}, token=host), "test email")
        m = wait_mail(1, "test email"); assert m["rcpt"] == ["orion@example.test"] and m["auth"] == ("tribe", "smtp-pass") and "Subject: TribeCode test email" in m["data"], m
        assert ok(api("/accounts/config"))["email"] is True
        print("  host settings: local-only, SMTP stored and never shown, Send test email delivered")

        # ---------------- CSRF: same-origin JSON only ----------------
        assert api("/accounts/login", "POST", {"username": "x", "password": "y"}, headers={"Origin": "https://evil.example"})[0] == 403, "cross-site origin refused"
        assert api("/accounts/login", "POST", b'{"username":"x"}', ctype="text/plain")[0] == 403, "a form-style body refused"
        assert api("/accounts/login", "POST", {"username": "x", "password": "y"}, headers={"Origin": "tauri://localhost", **remote()})[0] == 401, "the desktop app's origin is fine"
        assert api("/accounts/login", "POST", {"username": "x", "password": "y"}, headers={"Origin": BASE})[0] == 401, "same origin is fine"
        print("  csrf: other sites and non-JSON bodies refused")

        # ---------------- remote sign-up and sign-in (a friend's browser through a tunnel) ----------------
        R = remote()
        maya = ok(api("/accounts/signup", "POST", {"username": "Maya", "password": "purple kites at noon", "email": "maya@example.test"}, headers=R), "remote signup")
        assert maya["account"]["username"] == "Maya" and maya["token"].startswith("tca_")
        vm = wait_mail(2, "verify mail"); assert vm["rcpt"] == ["maya@example.test"]
        assert ok(api("/accounts/email/complete", "POST", {"token": link_in(vm, "verify")}, headers=R))["verified"] == "maya@example.test"
        assert ok(api("/accounts/me", token=maya["token"], headers=R))["account"]["email"]["verified"] is True
        lg = ok(api("/accounts/login", "POST", {"username": "maya", "password": "purple kites at noon"}, headers=R), "remote login")
        assert lg["account"]["username"] == "Maya"
        assert api("/accounts/resets", token=host, headers=R)[0] == 403, "resets stay on the host computer"
        print("  remote: sign-up, email confirm and sign-in work; admin stays local")

        # ---------------- OAuth: a new person makes an account, username editable ----------------
        st, d = oauth_finish("discord", "nelly", headers=remote())
        assert st == 200 and d["mode"] == "new" and d["suggested"] == "Nelly Rivers" and d["email"] == "nelly@example.test" and d["ticket"], d
        st, e = api("/accounts/oauth/confirm", "POST", {"ticket": d["ticket"], "username": "maya"}, headers=remote())
        assert st == 409 and e.get("code") == "taken" and e.get("suggestions"), (st, e)
        nel = ok(api("/accounts/oauth/confirm", "POST", {"ticket": d["ticket"], "username": "nelly.codes", "displayName": "Nelly"}, headers=remote()), "confirm")
        assert nel["account"]["username"] == "nelly.codes" and nel["account"]["providers"][0]["provider"] == "discord" and nel["account"]["email"]["verified"]
        assert api("/accounts/oauth/confirm", "POST", {"ticket": d["ticket"], "username": "nelly2"}, headers=remote())[0] == 410, "a ticket works once"
        st, d2 = oauth_finish("discord", "nelly", headers=remote())
        assert st == 200 and d2["mode"] == "account" and d2["account"]["username"] == "nelly.codes" and d2["token"] and "ticket" not in d2, d2
        # GitHub: the primary verified address comes from /user/emails
        st, g = oauth_finish("github", "otto", headers=remote()); assert g["mode"] == "new" and g["email"] == "otto@example.test", g
        print("  oauth new person: account made with the edited username; signing in again needs no ticket")

        # ---------------- OAuth: the verified email already has an account -> link, after signing in to it ----------------
        st, lo = oauth_finish("google", "maya", headers=remote())
        assert st == 200 and lo["mode"] == "link-offer" and lo["username"] == "Maya", lo
        assert api("/accounts/oauth/link", "POST", {"ticket": lo["ticket"]}, headers=remote())[0] == 401, "link needs a sign-in to the account"
        st, e = api("/accounts/oauth/confirm", "POST", {"ticket": lo["ticket"], "username": "maya twin"}, headers=remote())
        assert st == 409 and e["code"] == "link", ("no duplicate account for a verified email", st, e)
        ses = ok(api("/accounts/login", "POST", {"username": "Maya", "password": "purple kites at noon"}, headers=remote()))
        lk = ok(api("/accounts/oauth/link", "POST", {"ticket": lo["ticket"]}, token=ses["token"], headers=remote()), "link")
        assert any(p["provider"] == "google" for p in lk["account"]["providers"])
        st, again = oauth_finish("google", "maya", headers=remote())
        assert again["mode"] == "account" and again["account"]["username"] == "Maya", again
        print("  oauth existing email: offered a link; linking needs a sign-in first")

        # ---------------- open sign-up off: the invite path ----------------
        ok(api("/accounts/admin/settings", "PUT", {"openSignup": False}, token=host))
        assert ok(api("/accounts/config", headers=remote()))["openSignup"] is False
        st, iv = oauth_finish("discord", "dee", headers=remote()); assert iv["mode"] == "invite", iv
        st, e = api("/accounts/oauth/confirm", "POST", {"ticket": iv["ticket"], "username": "Dee"}, headers=remote()); assert st == 403 and e["code"] == "invite" and "invite" in e["error"], (st, e)
        st, e = api("/accounts/oauth/confirm", "POST", {"ticket": iv["ticket"], "username": "Dee", "invite": "NOPE1234"}, headers=remote()); assert st == 403 and e["code"] == "invite", (st, e)
        st, e = api("/accounts/signup", "POST", {"username": "Walk In", "password": "seven green owls"}, headers=remote()); assert st == 403 and e["code"] == "invite", (st, e)
        assert api("/accounts/signup", "POST", {"username": "Host Side", "password": "seven green owls"})[0] == 200, "the host computer can still make accounts"
        code = ok(api("/invites", "POST", {"maxUses": 3}, token=host))["invite"]["code"]
        dee = ok(api("/accounts/oauth/confirm", "POST", {"ticket": iv["ticket"], "username": "Dee", "invite": code}, headers=remote()), "invite confirm")
        assert dee["memberToken"] and dee["member"]["name"] == "Dee" and dee["account"]["members"], dee
        assert ok(api("/me", token=dee["memberToken"]))["member"]["name"] == "Dee", "the invite made Dee a member too"
        ok(api("/accounts/admin/settings", "PUT", {"openSignup": True}, token=host))
        print("  open sign-up off: Ask for an invite; the code makes the account and the membership")

        # ---------------- the desktop handoff (PKCE) ----------------
        H = remote()
        v, ch = pkce()
        assert api("/oauth/discord/start", "POST", {"mode": "signin", "desktop": {"challenge": "short"}}, headers=H)[0] == 400, "a challenge is required"
        land = provider_flow("discord", "nelly", {"mode": "signin", "desktop": {"challenge": ch, "method": "S256"}}, headers=H)
        assert land.startswith("/signin.html#desktop="), land
        f = frag(land); hc, short = f["desktop"], f["short"]
        assert len(short) == 6 and "tca_" not in land and "token" not in land
        st, e = api("/oauth/desktop/exchange", "POST", {"code": hc, "verifier": pkce()[0]}, headers=H); assert st == 400 and e["code"] == "mismatch", (st, e)
        out = ok(api("/oauth/desktop/exchange", "POST", {"code": hc, "verifier": v}, headers={**H, "Origin": "tauri://localhost"}), "exchange")
        assert out["mode"] == "account" and out["account"]["username"] == "nelly.codes" and out["token"], out
        st, e = api("/oauth/desktop/exchange", "POST", {"code": hc, "verifier": v}, headers=H); assert st == 410, "a code works once"
        st, e = api("/oauth/desktop/exchange", "POST", {"short": short, "verifier": v}, headers=H); assert st == 410, "…and its typed twin with it"
        v2, ch2 = pkce()
        f2 = frag(provider_flow("discord", "ty", {"mode": "signin", "desktop": {"challenge": ch2}}, headers=H))
        typed = ok(api("/oauth/desktop/exchange", "POST", {"short": f2["short"].lower(), "verifier": v2}, headers=H), "typed code")
        assert typed["mode"] == "new" and typed["suggested"] == "Ty Typed", typed
        v3, ch3 = pkce()
        f3 = frag(provider_flow("discord", "ty", {"mode": "signin", "desktop": {"challenge": ch3}}, headers=H))
        time.sleep(LINK_MS / 1000 + 0.5)
        st, e = api("/oauth/desktop/exchange", "POST", {"code": f3["desktop"], "verifier": v3}, headers=H); assert st == 410 and e["code"] == "expired", (st, e)
        print("  desktop: code + verifier once; reuse, expiry and a wrong verifier refused; the typed code works")

        # ---------------- magic links: once, and not after expiry; no enumeration ----------------
        M = remote()
        n0 = len(MAIL)
        a1 = api("/accounts/email/request", "POST", {"email": "maya@example.test"}, headers=M)
        a2 = api("/accounts/email/request", "POST", {"email": "nobody-here@example.test"}, headers=M)
        assert a1 == a2 == (200, {"ok": True, "via": "email"}), (a1, a2)
        wait_mail(n0 + 2, "a sign-in link to Maya and a sign-up link to the new address")
        maya_mail = next(x for x in MAIL[n0:] if x["rcpt"] == ["maya@example.test"])
        new_mail = next(x for x in MAIL[n0:] if x["rcpt"] == ["nobody-here@example.test"])
        tok = link_in(maya_mail, "magic")
        r1 = ok(api("/accounts/email/complete", "POST", {"token": tok}, headers=M), "magic sign-in")
        assert r1["account"]["username"] == "Maya" and r1["token"]
        assert api("/accounts/email/complete", "POST", {"token": tok}, headers=M)[0] == 410, "a magic link works once"
        st, need = api("/accounts/email/complete", "POST", {"token": link_in(new_mail, "magic")}, headers=M)
        assert st == 200 and need["need"] == "username" and need["email"] == "nobody-here@example.test", need
        n0 = len(MAIL)
        api("/accounts/email/request", "POST", {"email": "maya@example.test"}, headers=remote())
        late = wait_mail(n0 + 1, "second magic link")
        time.sleep(LINK_MS / 1000 + 0.5)
        assert api("/accounts/email/complete", "POST", {"token": link_in(late, "magic")}, headers=remote())[0] == 410, "an expired link is refused"
        print("  magic link: signs in once, refused on reuse and after expiry; known and unknown emails get the same answer")

        # ---------------- email reset: once ----------------
        n1 = len(MAIL)
        r_known = api("/accounts/reset/request", "POST", {"username": "Maya"}, headers=remote())
        r_unknown = api("/accounts/reset/request", "POST", {"username": "Nobody At All"}, headers=remote())
        assert r_known == r_unknown == (200, {"ok": True, "via": "email"}), (r_known, r_unknown)
        rm = wait_mail(n1 + 1, "reset mail"); assert rm["rcpt"] == ["maya@example.test"]
        rt = link_in(rm, "reset")
        assert api("/accounts/reset/complete", "POST", {"token": rt, "password": "short"}, headers=remote())[0] == 400, "weak password: the link stays good"
        rs = ok(api("/accounts/reset/complete", "POST", {"token": rt, "password": "orange boats drift slowly"}, headers=remote()), "reset")
        assert rs["account"]["username"] == "Maya"
        assert api("/accounts/reset/complete", "POST", {"token": rt, "password": "another fine phrase"}, headers=remote())[0] == 410, "a reset link works once"
        assert api("/accounts/login", "POST", {"username": "Maya", "password": "purple kites at noon"}, headers=remote())[0] == 401
        assert api("/accounts/login", "POST", {"username": "Maya", "password": "orange boats drift slowly"}, headers=remote())[0] == 200
        print("  email reset: works once; the old password stops working")

        # ---------------- no enumeration ----------------
        X = remote()
        w1 = api("/accounts/login", "POST", {"username": "Maya", "password": "wrong wrong wrong"}, headers=X)
        w2 = api("/accounts/login", "POST", {"username": "No Such Person", "password": "wrong wrong wrong"}, headers=X)
        assert w1 == w2 and w1[0] == 401, (w1, w2)
        print("  no enumeration: logins, sign-in links and resets answer the same for known and unknown")

        # ---------------- rate limits and lockout ----------------
        L = remote()
        codes = [api("/accounts/email/request", "POST", {"email": f"rl{i}@example.test"}, headers=L)[0] for i in range(7)]
        assert codes[:5] == [200] * 5 and 429 in codes[5:], codes
        codes = [api("/oauth/desktop/exchange", "POST", {"short": "AAAAAA", "verifier": v}, headers=L)[0] for i in range(12)]
        assert 429 in codes, codes
        lock_known = [api("/accounts/login", "POST", {"username": "nelly.codes", "password": f"guess {i} guess"}, headers=remote())[0] for i in range(11)]
        lock_unknown = [api("/accounts/login", "POST", {"username": "ghost person", "password": f"guess {i} guess"}, headers=remote())[0] for i in range(11)]
        assert lock_known[:10] == [401] * 10 and lock_known[10] == 429, lock_known
        assert lock_known == lock_unknown, "a lockout says nothing about whether the account exists"
        st, e = api("/accounts/login", "POST", {"username": "nelly.codes", "password": "anything at all"}, headers=remote()); assert st == 429 and e["code"] == "locked", (st, e)
        burst = [api("/accounts/check?username=a" + str(i), headers=L)[0] for i in range(62)]
        assert 429 in burst, "check has its own limit"
        print("  rate limits: email requests, code exchange, name checks; 10 wrong passwords lock that username for anyone")

        # ---------------- sign-in methods: never remove the last one ----------------
        U = remote()
        st, d = oauth_finish("google", "otto", headers=U)
        otto = ok(api("/accounts/oauth/confirm", "POST", {"ticket": d["ticket"], "username": "Otto"}, headers=U))
        ms = ok(api("/accounts/methods", token=otto["token"], headers=U))["methods"]
        assert [x["id"] for x in ms] == ["email", "provider:google"], ms
        st, e = api("/accounts/methods/provider:google", "DELETE", token=otto["token"], headers=U)
        assert st == 200, "email (sign-in links are on) still signs Otto in"
        st, e = api("/accounts/methods/email", "DELETE", token=otto["token"], headers=U); assert st == 409 and e["code"] == "last", (st, e)
        ok(api("/accounts/password", "POST", {"password": "silver otters swim"}, token=otto["token"], headers=U), "set password")
        assert api("/accounts/methods/email", "DELETE", token=otto["token"], headers=U)[0] == 200
        st, e = api("/accounts/methods/password", "DELETE", token=otto["token"], headers=U); assert st == 409 and e["code"] == "last", (st, e)
        print("  methods: unlinking the last way in is refused")

        # ---------------- the UI ----------------
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            # a friend's browser (through the tunnel): Sign in with Discord as someone new -> the username step
            fx = b.new_context(viewport={"width": 1100, "height": 860}, extra_http_headers={"X-Forwarded-For": "198.51.100.77"})
            fp = fx.new_page(); fp.on("pageerror", lambda e: errors.append(f"friend: {e}"))
            state["who"] = "ui"
            fp.goto(BASE + "/signin.html")
            fp.wait_for_selector('#oa-box [data-oa="discord"]', timeout=15000)
            assert fp.locator("#mail-sec").is_visible(), "email sign-in shows when the host set up email"
            fp.click('#oa-box [data-oa="discord"]')
            fp.wait_for_selector("#au-user", timeout=15000)
            assert fp.input_value("#au-user") == "Robin Vale" and "Pick your username" in fp.inner_text("#title")
            assert "#" not in fp.url or "oauth=" not in fp.url, "the one-time code left the address bar"
            fp.fill("#au-user", "robin.vale")
            fp.wait_for_function("document.querySelector('#au-user-hint').dataset.kind === 'good'", timeout=10000)
            fp.wait_for_timeout(300)
            fp.screenshot(path=str(SHOTS / "auth-oauth-new.png"))
            fp.click("#au-create")
            fp.wait_for_url(re.compile(r"/(\?.*)?$"), timeout=15000)
            st2 = fp.evaluate("JSON.parse(localStorage.getItem('tribecode.accounts.v1'))")
            assert st2["mode"] == "account" and st2["accounts"][0]["username"] == "robin.vale" and st2["accounts"][0]["acct"].startswith("tca_"), st2

            # the desktop handoff page, as the browser shows it
            v4, ch4 = pkce()
            land = provider_flow("github", "ty", {"mode": "signin", "desktop": {"challenge": ch4}})
            dp = fx.new_page(); dp.goto(BASE + land)
            dp.wait_for_selector("#return-app", timeout=10000)
            assert dp.get_attribute("#return-app", "href").startswith("tribecode://auth?code=") and len(dp.inner_text("#hand-code").strip()) == 6
            assert "#" not in dp.url, "the fragment is cleared"
            dp.wait_for_timeout(300)
            dp.screenshot(path=str(SHOTS / "auth-desktop-code.png"))
            ok(api("/oauth/desktop/exchange", "POST", {"short": dp.inner_text("#hand-code").strip(), "verifier": v4}), "the code on the page works")

            # Settings › Account on the host: sign-in methods, open sign-up, email
            hx = b.new_context(viewport={"width": 1280, "height": 1000})
            ho = ok(api("/accounts/signup", "POST", {"username": "Orion Host", "password": "campfire stories glow", "email": "orion@example.test"}))
            hx.add_init_script("try { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Orion', color:'#F26B1D', onboarded:true, theme:'dark', server:{url:'%s', token:'%s'}, checklist:{setup:true}, tour:{done:true}})); localStorage.setItem('tribecode.intro.v1','seen');"
                               " if (!localStorage.getItem('tribecode.accounts.v1')) localStorage.setItem('tribecode.accounts.v1', JSON.stringify({mode:'signedin', current:'acct:%s:%s', accounts:[{id:'acct:%s:%s', kind:'server', name:'Orion Host', username:'Orion Host', acct:'%s', server:{url:'%s', token:'%s'}, tribes:[]}]})) } catch (e) {}"
                               % (BASE, host, BASE, ho["account"]["id"], BASE, ho["account"]["id"], ho["token"], BASE, host))
            hp = hx.new_page(); hp.on("pageerror", lambda e: errors.append(f"host: {e}"))
            hp.goto(BASE + "/?skipIntro=1")
            hp.wait_for_function("() => window.TribeClient && window.TribeClient.connected()", timeout=20000)
            hp.evaluate("() => window.TribeSettings.open()")
            hp.wait_for_selector("#set-methods li[data-m='password']", timeout=15000)
            hp.wait_for_selector("#set-signin-host #au-open", timeout=15000)
            assert hp.locator("#set-methods [data-unlink='password']").is_disabled(), "the only method can't be removed"
            assert hp.locator("#set-methods [data-link='discord']").count() == 1
            assert hp.get_attribute("#au-open", "aria-checked") == "true"
            hp.click("#au-open")
            hp.wait_for_function("document.querySelector('#au-open') && document.querySelector('#au-open').getAttribute('aria-checked') === 'false'", timeout=10000)
            assert ok(api("/accounts/config"))["openSignup"] is False
            hp.click("#au-open")
            hp.wait_for_function("document.querySelector('#au-open').getAttribute('aria-checked') === 'true'", timeout=10000)
            hp.click("#au-smtp summary")
            assert hp.input_value("#au-smtp-form [data-s='host']") == "127.0.0.1" and hp.input_value("#au-smtp-form [data-s='pass']") == ""
            n2 = len(MAIL)
            hp.fill("#au-test-to", "orion@example.test"); hp.click("#au-test-go")
            wait_mail(n2 + 1, "test email from Settings")
            hp.locator("#set-methods").scroll_into_view_if_needed()
            hp.wait_for_timeout(400)
            hp.screenshot(path=str(SHOTS / "auth-settings.png"))
            b.close()
        assert not errors, errors
        print("  ui: the username step, the desktop code page and Settings › Account work")
        print("E2E auth2 test passed")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        mock.shutdown(); smtp.shutdown()


if __name__ == "__main__":
    main()
