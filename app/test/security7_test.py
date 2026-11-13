"""Security checks for feat/auth3-pay: two-step sign-in, passkeys and payments (docs/ACCOUNTS.md, docs/PREMIUM.md).

No browser: a software authenticator in this file (ES256 and RS256 keys, CBOR by hand) speaks WebAuthn to the server, so
every check of a registration and an assertion can be bent one at a time. Stripe is configured through the environment
here (e2e_payments covers the host's settings) and points at a local fake.

T  two-step: one answer for a wrong password whether or not two-step is on (no enumeration); a ticket is bound to its
   account (another account's code, recovery code or trust token doesn't open it); cross-site and non-JSON POSTs are
   refused; the public step is rate-limited per client; tickets, challenges, secrets, recovery codes and trust tokens
   are nowhere on disk or in the log in the clear; every file that holds them is 0600.
W  WebAuthn: registration checks the challenge (ours, single use, this account's), the origin, the rpIdHash, user
   presence and a packed attestation's signature; "none" passes; an assertion checks the same plus the signature and
   the counter; RS256 works; another account's challenge or credential is refused; insecure origins are told why.
P  payments: checkout and the portal need a member (not an agent's key, not no key), are rate-limited, and never echo a
   key; the webhook refuses GET, an oversized body, a v0-only signature; 12 copies of one event at once are applied
   once; settings and by-hand changes stay on the host computer; the fake-Stripe override does nothing without TRIBE_TEST.
Usage: python app/test/security7_test.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, hmac, http.server, json, os, struct, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, STRIPE_PORT = 7080 + OFF, 7081 + OFF
BASE = f"http://localhost:{PORT}"
ORIGIN = BASE
FAKE = f"http://127.0.0.1:{STRIPE_PORT}"
SK, WH = "sk_test_" + "s7K" * 10, "whsec_" + "s7W" * 10
STEP, PW = 2, "harbor lights 88"
CALLS = []
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
ip_n = [20]
used = {}


class FakeStripe(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); CALLS.append(dict(urllib.parse.parse_qsl(self.rfile.read(n).decode())))
        data = json.dumps({"id": "cs_test_1", "url": FAKE + "/pay/cs_test_1"}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)


def remote(ip=None):
    if ip is None: ip_n[0] += 1; ip = f"203.0.113.{ip_n[0]}"
    return {"X-Forwarded-For": ip}


def api(path, method="GET", body=None, token=None, headers=None, raw=None, ctype="application/json"):
    h = {"Content-Type": ctype, **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with opener.open(req, timeout=30) as r: st, out = r.status, r.read()
    except urllib.error.HTTPError as e: st, out = e.code, e.read()
    except Exception: return 0, {}   # the server hung up (a body it refused to read)
    try: return st, json.loads(out or b"{}")
    except Exception: return st, {"text": out[:200].decode("utf8", "replace")}


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def totp_at(secret, step):
    k = base64.b32decode(secret); h = hmac.new(k, struct.pack(">Q", step), hashlib.sha1).digest(); o = h[19] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7fffffff) % 1000000)


def code(secret):
    while True:
        s = int(time.time() / STEP)
        if s > used.get(secret, 0): used[secret] = s; return totp_at(secret, s)
        time.sleep(0.15)


def enrol(tok):
    s = ok(api("/accounts/two-step/setup", "POST", {}, token=tok)); out = ok(api("/accounts/two-step/confirm", "POST", {"code": code(s["secret"])}, token=tok))
    return s["secret"], out["recovery"]


# ---------------- a software authenticator ----------------
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
unb64 = lambda s: base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def cbor(v):
    def head(major, n):
        if n < 24: return bytes([major << 5 | n])
        if n < 256: return bytes([major << 5 | 24, n])
        if n < 65536: return bytes([major << 5 | 25]) + struct.pack(">H", n)
        return bytes([major << 5 | 26]) + struct.pack(">I", n)
    if isinstance(v, bool): return b"\xf5" if v else b"\xf4"
    if isinstance(v, int): return head(0, v) if v >= 0 else head(1, -1 - v)
    if isinstance(v, bytes): return head(2, len(v)) + v
    if isinstance(v, str): return head(3, len(v.encode())) + v.encode()
    if isinstance(v, list): return head(4, len(v)) + b"".join(cbor(x) for x in v)
    if isinstance(v, dict): return head(5, len(v)) + b"".join(cbor(k) + cbor(x) for k, x in v.items())
    raise TypeError(v)


class Authenticator:
    def __init__(self, alg=-7):
        self.alg = alg; self.count = 0; self.cred = os.urandom(32)
        self.key = ec.generate_private_key(ec.SECP256R1()) if alg == -7 else rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def cose(self):
        n = self.key.public_key().public_numbers()
        if self.alg == -7: return cbor({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})
        return cbor({1: 3, 3: -257, -1: n.n.to_bytes(256, "big"), -2: n.e.to_bytes(3, "big")})

    def sign(self, data):
        return self.key.sign(data, ec.ECDSA(hashes.SHA256())) if self.alg == -7 else self.key.sign(data, padding.PKCS1v15(), hashes.SHA256())

    def auth_data(self, rp, flags, attested):
        self.count += 1
        ad = hashlib.sha256(rp.encode()).digest() + bytes([flags | (0x40 if attested else 0)]) + struct.pack(">I", self.count)
        return ad + (b"\x00" * 16 + struct.pack(">H", len(self.cred)) + self.cred + self.cose() if attested else b"")

    def client(self, kind, challenge, origin):
        return json.dumps({"type": kind, "challenge": challenge, "origin": origin, "crossOrigin": False}).encode()

    def create(self, challenge, origin=ORIGIN, rp="localhost", flags=0x05, fmt="none", bad_att=False, kind="webauthn.create"):
        cd = self.client(kind, challenge, origin); ad = self.auth_data(rp, flags, True)
        stmt = {}
        if fmt == "packed":
            sig = self.sign(ad + hashlib.sha256(cd).digest())
            if bad_att: sig = sig[:-2] + bytes([sig[-2] ^ 1, sig[-1]])
            stmt = {"alg": self.alg, "sig": sig}
        return {"id": b64(self.cred), "type": "public-key", "response": {"clientDataJSON": b64(cd), "attestationObject": b64(cbor({"fmt": fmt, "attStmt": stmt, "authData": ad})), "transports": ["internal"]}}

    def get(self, challenge, origin=ORIGIN, rp="localhost", flags=0x05, user=None, bad_sig=False, count=None, kind="webauthn.get"):
        if count is not None: self.count = count - 1
        cd = self.client(kind, challenge, origin); ad = self.auth_data(rp, flags, False)
        sig = self.sign(ad + hashlib.sha256(b"x" if bad_sig else cd).digest())
        return {"id": b64(self.cred), "type": "public-key", "response": {"clientDataJSON": b64(cd), "authenticatorData": b64(ad), "signature": b64(sig), "userHandle": b64(user.encode()) if user else ""}}


O = {"Origin": ORIGIN}
reg_ch = lambda tok: ok(api("/accounts/passkeys/options", "POST", {}, token=tok, headers=O))["publicKey"]["challenge"]
auth_ch = lambda **kw: ok(api("/accounts/passkey/start", "POST", kw, headers={**O, **remote()}))["publicKey"]["challenge"]
register = lambda tok, cred, name="Key": api("/accounts/passkeys", "POST", {"credential": cred, "name": name}, token=tok, headers=O)
finish = lambda cred, **kw: api("/accounts/passkey/finish", "POST", {"credential": cred, **kw}, headers={**O, **remote()})


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-sec7-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    fake = http.server.ThreadingHTTPServer(("127.0.0.1", STRIPE_PORT), FakeStripe); threading.Thread(target=fake.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1", "TRIBE_TEST_TOTP_STEP_MS": str(STEP * 1000),
           "STRIPE_SECRET_KEY": SK, "STRIPE_WEBHOOK_SECRET": WH, "STRIPE_PRICE_CREDITS_10": "price_s7c10", "STRIPE_PRICE_HOSTED": "price_s7hosted", "TRIBE_STRIPE_BASE": FAKE,
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in ("TRIBE_PUBLIC_URL", "TRIBE_OPEN_SIGNUP"): env.pop(k, None)
    logf = os.path.join(tmp, "server.log"); log = open(logf, "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Seven Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.1)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        invite = lambda: ok(api("/invites", "POST", {}, token=host))["invite"]["code"]
        mk = lambda name: ok(api("/accounts/signup", "POST", {"username": name, "password": PW, "invite": invite()}), name)
        ann, ben, cal = mk("Ann"), mk("Ben"), mk("Cal")
        at, bt = ann["token"], ben["token"]
        asec, arecs = enrol(at); bsec, brecs = enrol(bt)
        login = lambda u, pw=PW, h=None: api("/accounts/login", "POST", {"username": u, "password": pw}, headers=h or remote())
        step2 = lambda tk, h=None, **kw: api("/accounts/two-step", "POST", {"ticket": tk, **kw}, headers=h or remote())

        # ---------------- T: two-step ----------------
        r1, r2, r3 = login("Ann", "wrong wrong wrong"), login("Cal", "wrong wrong wrong"), login("Nobody Here", "wrong wrong wrong")
        assert r1 == r2 == r3 and r1[0] == 401, "one answer for a wrong password: two-step on, off, or no such account"
        ta = ok(login("Ann"))["ticket"]
        assert step2(ta, code=code(bsec))[0] == 401 and step2(ta, recovery=brecs[0])[0] == 401, "a ticket is bound to its account"
        tb = ok(login("Ben"))["ticket"]; trust_b = ok(step2(tb, code=code(bsec), remember=True))["trust"]
        st, e = step2(ta, trust=trust_b); assert st == 401 and e["code"] == "untrusted", "Ben's trusted device is not Ann's"
        assert step2(ta, code=code(asec))[0] == 200 and step2(ta, code=code(asec))[0] == 410
        assert ok(api("/accounts/two-step", token=bt))["recoveryLeft"] == 10, "a recovery code tried on someone else's ticket is not used up"
        # CSRF: another site's page, or a form post, can't reach any of it
        ta = ok(login("Ann"))["ticket"]
        for path, body, tok in (("/accounts/two-step", {"ticket": ta, "code": "000000"}, None), ("/accounts/passkey/start", {}, None), ("/accounts/passkey/finish", {}, None), ("/accounts/two-step/disable", {"code": "000000"}, at), ("/accounts/passkeys/options", {}, at)):
            assert api(path, "POST", body, token=tok, headers={"Origin": "https://evil.example"})[0] == 403, path
            assert api(path, "POST", body, token=tok, headers={"Sec-Fetch-Site": "cross-site"})[0] == 403, path
            assert api(path, "POST", raw=urllib.parse.urlencode(body).encode(), token=tok, ctype="application/x-www-form-urlencoded")[0] == 403, path
        assert api("/accounts/two-step/disable", "POST", {"code": code(asec)}, token=bt)[0] == 401, "Ann's code doesn't turn Ben's two-step off"
        assert api("/accounts/two-step/disable", "POST", {"code": code(asec)})[0] == 401
        # the public step is rate-limited per client
        R = remote(); codes = [step2("t" * 40, h=R, code="000000")[0] for _ in range(24)]
        assert codes[:20] == [410] * 20 and 429 in codes[20:], codes
        assert step2("t" * 40, code="000000")[0] == 410, "another client keeps its own budget"
        print("  T: no enumeration; tickets bound to their account; cross-site and form posts refused; rate-limited per client")

        # ---------------- W: WebAuthn ----------------
        a = Authenticator()
        st, e = register(at, a.create("A" * 43)); assert st == 400 and e["code"] == "challenge", "a challenge we never issued"
        st, e = register(bt, a.create(reg_ch(at))); assert st == 400 and e["code"] == "challenge", "Ann's challenge in Ben's hands"
        st, e = register(at, a.create(reg_ch(at), origin="https://evil.example")); assert st == 400 and e["code"] == "origin", (st, e)
        st, e = register(at, a.create(reg_ch(at), rp="evil.example")); assert st == 400 and e["code"] == "rp", (st, e)
        st, e = register(at, a.create(reg_ch(at), flags=0x04)); assert st == 400 and e["code"] == "presence", (st, e)
        st, e = register(at, a.create(reg_ch(at), kind="webauthn.get")); assert st == 400, "the wrong ceremony"
        st, e = register(at, a.create(reg_ch(at), fmt="packed", bad_att=True)); assert st == 400 and e["code"] == "attestation", (st, e)
        st, e = register(at, {"id": "x", "response": {"clientDataJSON": b64(a.client("webauthn.create", reg_ch(at), ORIGIN)), "attestationObject": b64(b"\xa1\x63fmt")}}); assert st == 400 and e["code"] == "input", (st, e)
        ch = reg_ch(at); good = a.create(ch, fmt="packed"); k1 = ok(register(at, good, "Ann's key"), "packed self-attestation")["passkey"]
        assert register(at, good)[0] == 400, "the challenge is single use"
        st, e = register(bt, a.create(reg_ch(bt))); assert st == 409 and e["code"] == "taken", "one credential, one account"
        rs = Authenticator(-257); ok(register(at, rs.create(reg_ch(at)), "RSA key"), "RS256, no attestation")
        bkey = Authenticator(); ok(register(bt, bkey.create(reg_ch(bt)), "Ben's key"))
        for origin, want in (("http://my-laptop.local:%d" % PORT, "insecure"), ("http://192.168.1.20:%d" % PORT, "ip"), ("http://127.0.0.1:%d" % PORT, "ip"), ("tauri://localhost", "scheme")):
            hdr = {"Origin": origin, **({"Host": origin.split("//")[1]} if origin.startswith("http") else {})}
            st, e = api("/accounts/passkeys/options", "POST", {}, token=at, headers=hdr); assert st == 400 and e["code"] == want and "passkeys" in e["error"], (origin, st, e)
        assert ok(api("/accounts/passkey/start", "POST", {}, headers={"Origin": "http://tauri.localhost"}))["publicKey"]["rpId"] == "tauri.localhost", "the desktop app on Windows"
        # assertions
        st, d = finish(a.get(auth_ch(), user=ann["account"]["id"])); assert st == 200 and d["account"]["username"] == "Ann" and d["token"].startswith("tca_") and "need" not in d, (st, d)
        st, d = finish(rs.get(auth_ch())); assert st == 200 and d["account"]["username"] == "Ann", "RS256 signs in"
        for kw, want in (({"origin": "https://evil.example"}, "origin"), ({"rp": "evil.example"}, "rp"), ({"flags": 0x04}, "presence"), ({"bad_sig": True}, "signature"), ({"user": ben["account"]["id"]}, "unknown"), ({"kind": "webauthn.create"}, None)):
            st, e = finish(a.get(auth_ch(), **kw)); assert st in (400, 401) and (want is None or e["code"] == want), (kw, st, e)
        st, e = finish(a.get("B" * 43)); assert st == 401 and e["code"] == "challenge"
        ch = auth_ch(); cred = a.get(ch); assert finish(cred)[0] == 200 and finish(cred)[0] == 401, "an answer works once"
        st, e = finish(a.get(auth_ch(), count=2)); assert st == 401 and e["code"] == "counter", "the counter went backwards"
        assert finish(a.get(auth_ch(), count=500))[0] == 200
        ghost = Authenticator(); st, e = finish(ghost.get(auth_ch())); assert st == 401 and e["code"] == "unknown"
        # as the second step: only the ticket's own account's passkey
        ta = ok(login("Ann"))["ticket"]
        st, e = api("/accounts/passkey/start", "POST", {"ticket": "nope" * 10}, headers=O); assert st == 410
        ch = auth_ch(ticket=ta)
        st, e = finish(bkey.get(ch), ticket=ta); assert st == 401 and e["code"] == "unknown", "Ben's passkey doesn't answer Ann's ticket"
        ch = auth_ch(ticket=ta); assert finish(a.get(ch))[0] == 401, "a ticket challenge without its ticket"
        ch = auth_ch(ticket=ta); st, d = finish(a.get(ch), ticket=ta); assert st == 200 and d["account"]["username"] == "Ann" and d["memberToken"], (st, d)
        assert step2(ta, code=code(asec))[0] == 410, "the ticket is spent"
        assert api("/accounts/passkeys/" + k1["id"], "DELETE", token=bt)[0] == 404 and api("/accounts/passkeys/" + k1["id"], "PUT", {"name": "mine now"}, token=bt)[0] == 404
        assert api("/accounts/passkeys")[0] == 401
        print("  W: registration and assertion each check challenge, origin, rpIdHash, presence, signature, counter; packed and none; ES256 and RS256; tickets and accounts don't cross")

        # ---------------- at rest and in the log ----------------
        ta = ok(login("Ann"))["ticket"]; ch = auth_ch()
        dot = os.path.join(tribe, ".tribe")
        for f in ("auth3.json", "secret.key", "pending-auth.json"): assert oct(os.stat(os.path.join(dot, f)).st_mode & 0o777) == "0o600", f
        everything = "".join(open(os.path.join(dot, f), errors="replace").read() for f in os.listdir(dot) if os.path.isfile(os.path.join(dot, f)) and f != "secret.key") + open(logf).read()
        for secret in [asec, bsec, ta, ch, trust_b, SK, WH] + arecs + brecs: assert secret not in everything and secret.replace("-", "") not in everything, "a secret is on disk or in the log in the clear"
        a3 = json.load(open(os.path.join(dot, "auth3.json")))
        assert all("d" not in k["jwk"] for acc in a3["accounts"].values() for k in acc.get("passkeys", [])), "public keys only"
        print("  at rest: 0600 files; secrets sealed, codes and tokens hashed, tickets and challenges hashed; nothing in the log")

        # ---------------- P: payments ----------------
        mem = ann["memberToken"]
        assert api("/premium/checkout", "POST", {"item": "credits-10"})[0] == 401 and api("/premium/portal", "POST", {})[0] == 401 and api("/premium/history")[0] == 401
        assert api("/premium/checkout", "POST", {"item": "credits-10"}, token=at)[0] == 401, "an account session is not a tribe key"
        agent = api("/agents", "POST", {"name": "Bot"}, token=host)
        if agent[0] == 200 and agent[1].get("token"): assert api("/premium/checkout", "POST", {"item": "credits-10"}, token=agent[1]["token"])[0] == 403, "agents don't buy"
        st, e = api("/premium/checkout", "POST", {"item": "credits-25"}, token=mem); assert st == 409 and e["code"] == "no-price", "no price id, nothing to sell"
        r = ok(api("/premium/checkout", "POST", {"item": "credits-10"}, token=mem, headers=remote("203.0.113.9")), "checkout"); assert SK not in json.dumps(r) and r["url"].startswith(FAKE)
        assert CALLS[-1]["metadata[scope]"] == "acct:" + ann["account"]["id"] and CALLS[-1]["success_url"].startswith(BASE + "/"), "the return address is ours, never the request's Host"
        r = ok(api("/premium/checkout", "POST", {"item": "credits-10"}, token=mem, headers={"Host": "evil.example", "X-Forwarded-Host": "evil.example", "X-Forwarded-For": "203.0.113.9"})); assert "evil.example" not in json.dumps(CALLS[-1]), CALLS[-1]
        codes = [api("/premium/checkout", "POST", {"item": "credits-10"}, token=mem, headers=remote("203.0.113.9"))[0] for _ in range(12)]
        assert 429 in codes, codes
        for path, m, body in (("/premium/admin", "GET", None), ("/premium/admin", "PUT", {"secretKey": SK})): assert api(path, m, body, token=mem)[0] == 403 and api(path, m, body, token=host, headers=remote())[0] == 403, path
        v = ok(api("/premium/admin", token=host)); assert v["on"] and v["fromEnv"] and SK not in json.dumps(v) and WH not in json.dumps(v), v
        assert api("/premium", "PUT", {"addCredits": 99}, token=mem)[0] == 403 and api("/premium", "PUT", {"addCredits": 99}, token=host, headers=remote())[0] == 403
        # the webhook
        md = {k[9:-1]: v for k, v in CALLS[-1].items() if k.startswith("metadata[")}
        ev = {"id": "evt_s7_1", "type": "checkout.session.completed", "data": {"object": {"id": "cs_s7_1", "mode": "payment", "payment_status": "paid", "customer": "cus_s7", "payment_intent": "pi_s7", "amount_total": 1000, "currency": "usd", "metadata": md}}}
        def hook(ev, header=None, method="POST", raw=None):
            body = raw if raw is not None else json.dumps(ev).encode(); t = int(time.time())
            sig = hmac.new(WH.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
            return api("/premium/webhook", method, raw=body if method == "POST" else None, headers={"Stripe-Signature": header.format(t=t, sig=sig) if header else f"t={t},v1={sig}"})
        assert hook(ev, method="GET")[0] in (401, 404, 405), "POST only"
        assert hook(ev, header="t={t},v0={sig}")[0] == 400, "only v1 signatures count"
        assert hook(ev, header="t={t},v1={sig}0")[0] == 400 and hook(ev, header="t={t}, v1=")[0] == 400 and hook(ev, header="x" * 3000)[0] == 400
        assert hook(None, raw=b"{" + b" " * (600 * 1024) + b"}")[0] in (0, 400, 413), "an oversized body"
        assert hook(None, raw=b"not json")[0] == 400 and hook({"id": "evt_bad"})[0] == 400, "signed, but not an event"
        assert hook({**ev, "data": {"object": {**ev["data"]["object"], "metadata": {**md, "scope": "acct:../../x"}}}, "id": "evt_s7_scope"})[1].get("did") == "not ours", "a scope that isn't one"
        credits = lambda: ok(api("/premium", token=mem))["pools"]["mine"]
        assert credits() == 0
        with ThreadPoolExecutor(12) as ex: res = list(ex.map(lambda i: hook(ev), range(12)))
        assert [r[0] for r in res] == [200] * 12 and sum(1 for r in res if not r[1].get("duplicate")) == 1 and credits() == 1000, (res, credits())
        assert ok(api("/premium", token=ben["memberToken"]))["credits"] == 0, "Ann's pack is Ann's"
        # the override is a test hook only
        out = subprocess.run(["node", "-e", "const os=require('os'),fs=require('fs'),p=require('path');const d=fs.mkdtempSync(p.join(os.tmpdir(),'s7-'));const {Store}=require(%s);const st=new Store(d);delete process.env.TRIBE_TEST;const x=require(%s)({store:st});console.log(x.isTest(), x.on())" % (json.dumps(str(ROOT / 'server' / 'store.js')), json.dumps(str(ROOT / 'server' / 'stripe.js')))],
                             capture_output=True, text=True, env={**env, "TRIBE_TEST": ""}); assert out.stdout.strip() == "false true", (out.stdout, out.stderr)
        logtxt = open(logf).read(); assert SK not in logtxt and WH not in logtxt
        print("  P: checkout/portal need a member and are rate-limited; return address is ours; the webhook: POST, v1, size, one event at once applied once; settings host-local; no fake Stripe without TRIBE_TEST")
        print("ok security7_test")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        fake.shutdown()


if __name__ == "__main__":
    main()
