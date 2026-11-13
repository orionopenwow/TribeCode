"""End-to-end: feat/auth3, two-step sign-in (TOTP) and passkeys (docs/ACCOUNTS.md, docs/SIGNUP-FLOWS.md).

The server runs with TRIBE_ACCOUNTS=1 and a 2-second TOTP step (TRIBE_TEST_TOTP_STEP_MS), so a fresh code is never far
away. The fake provider and SMTP server come from e2e_auth2. Passkeys use Chrome's virtual authenticator over CDP
(WebAuthn.enable / addVirtualAuthenticator).

Checks
  TOTP   enrol (secret, otpauth URI, a wrong first code refused, ten recovery codes); a password sign-in stops at the
         code; a wrong code and a replayed code are refused; a recovery code works once; a trusted device skips the
         code and a forged trust token doesn't; a provider sign-in, the desktop handoff, an email link and a password
         reset all stop at the code too; a member signed back in by a provider stops at it; 10 wrong codes lock the
         second step; turning it off needs a current code.
  Admins the host requires two-step for admins: an admin's sign-in gets no tribe key until two-step is on; a builder is
         not held; the switch is host-only, on the host computer.
  Passkeys  register in Settings, sign in from signin.html and from the Log in sheet, as the second step; a wrong
         challenge, a challenge issued for another origin, a replayed answer and a counter that went backwards are
         refused; rename, remove, the last sign-in method is protected; the plain line where passkeys can't work.
  UI     Settings › Account & sign-in: turn on (QR, key, code), recovery codes (copy, download), the code sheet with
         "Trust this device", turn off with a code. Screenshots: docs/screenshots/two-step.png, passkey.png.
Usage: python app/test/e2e_auth3.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import base64, hashlib, hmac, http.server, json, os, re, socketserver, struct, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_auth2 as a2   # the fake OAuth provider, the fake SMTP server and the flow helpers

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, MOCK_PORT, SMTP_PORT = 7040 + OFF, 7041 + OFF, 7042 + OFF
BASE = f"http://localhost:{PORT}"
a2.PORT, a2.MOCK_PORT, a2.SMTP_PORT = PORT, MOCK_PORT, SMTP_PORT
a2.BASE, a2.MOCK = BASE, f"http://127.0.0.1:{MOCK_PORT}"
api, ok, remote = a2.api, a2.ok, a2.remote
SHOTS = ROOT / "docs" / "screenshots"
STEP = 2
PW = "lantern river 42"
errors = []
used = {}


def totp_at(secret, step):
    k = base64.b32decode(secret); h = hmac.new(k, struct.pack(">Q", step), hashlib.sha1).digest(); o = h[19] & 15
    return "%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7fffffff) % 1000000)


def code(secret):
    """A code from a step this secret has not used yet (the server refuses a step twice)."""
    while True:
        s = int(time.time() / STEP)
        if s > used.get(secret, 0): used[secret] = s; return totp_at(secret, s)
        time.sleep(0.15)


def wrong(secret):
    c = totp_at(secret, int(time.time() / STEP) + 50)
    return c if c not in [totp_at(secret, int(time.time() / STEP) + d) for d in (-1, 0, 1, 2)] else "%06d" % ((int(c) + 1) % 1000000)


def enrol(tok, headers=None):
    s = ok(api("/accounts/two-step/setup", "POST", {}, token=tok, headers=headers), "setup")
    out = ok(api("/accounts/two-step/confirm", "POST", {"code": code(s["secret"])}, token=tok, headers=headers), "confirm")
    return s["secret"], out


def login(user, pw=PW, headers=None):
    return api("/accounts/login", "POST", {"username": user, "password": pw}, headers=headers or remote())


def step2(ticket, headers=None, **kw):
    return api("/accounts/two-step", "POST", {"ticket": ticket, **kw}, headers=headers or remote())


def init_script(name, acct=None, member=None):
    s = "try { if (sessionStorage.getItem('tc.noinit')) throw 0; localStorage.setItem('tribecode.intro.v1','seen');"
    s += " if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:%s, color:'#F26B1D', onboarded:true, theme:'dark', checklist:{setup:true}, tour:{done:true}%s}));" % (
        json.dumps(name), (", server:{url:'%s', token:'%s'}" % (BASE, member)) if member else "")
    if acct:
        aid = "acct:%s:%s" % (BASE, acct["account"]["id"])
        s += " if (!localStorage.getItem('tribecode.accounts.v1')) localStorage.setItem('tribecode.accounts.v1', JSON.stringify({mode:%s, current:%s, accounts:[{id:%s, kind:'server', name:%s, username:%s, acct:%s, server:{url:'%s', token:%s}, tribes:[]}]}));" % (
            json.dumps("signedin" if member else "account"), json.dumps(aid), json.dumps(aid), json.dumps(name), json.dumps(acct["account"]["username"]), json.dumps(acct["token"]), BASE, json.dumps(member or ""))
    return s + " } catch (e) {}"


PK_JS = """async (o) => {
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const post = async (p, body) => { const r = await fetch('/api/accounts' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
  if (o.replay) return post('/passkey/finish', o.replay);
  let ch = o.challenge;
  if (!ch) { const s = await post('/passkey/start', {}); if (s.status !== 200) return s; ch = s.data.publicKey.challenge; }
  const bytes = o.swap ? crypto.getRandomValues(new Uint8Array(32)) : unb64(ch);
  const cred = await navigator.credentials.get({ publicKey: { challenge: bytes, rpId: location.hostname, userVerification: 'preferred' } });
  const r = cred.response;
  const body = { credential: { id: cred.id, type: cred.type, response: { clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature), userHandle: r.userHandle ? b64(r.userHandle) : '' } } };
  const f = await post('/passkey/finish', body);
  return { ...f, body };
}"""


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-auth3-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    mock = http.server.ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), a2.Mock); threading.Thread(target=mock.serve_forever, daemon=True).start()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    smtp = socketserver.ThreadingTCPServer(("127.0.0.1", SMTP_PORT), a2.Smtp); threading.Thread(target=smtp.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1",
           "TRIBE_TEST_TOTP_STEP_MS": str(STEP * 1000), "TRIBE_OAUTH_DISCORD_BASE": a2.MOCK, "TRIBE_OAUTH_GITHUB_BASE": a2.MOCK, "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in ("TRIBE_PUBLIC_URL", "TRIBE_OPEN_SIGNUP"): env.pop(k, None)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Step Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.1)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        for p in ("discord", "github"): ok(api(f"/oauth/config/{p}", "PUT", {"clientId": a2.CLIENT_ID, "clientSecret": a2.SECRET, "enabled": True}, token=host), p)
        ok(api("/accounts/admin/settings", "PUT", {"smtp": {"host": "127.0.0.1", "port": SMTP_PORT, "secure": "none", "user": "tribe", "pass": "smtp-pass", "from": "tribe@example.test"}}, token=host), "smtp")
        invite = lambda: ok(api("/invites", "POST", {}, token=host))["invite"]["code"]

        # ---------------- TOTP: enrol ----------------
        tess = ok(api("/accounts/signup", "POST", {"username": "Tess", "password": PW, "email": "tess@example.test", "invite": invite()}, headers=remote()), "Tess")
        tt = tess["token"]
        assert ok(api("/accounts/two-step", token=tt))["on"] is False
        assert api("/accounts/two-step")[0] == 401 and api("/accounts/two-step/setup", "POST", {})[0] == 401, "settings need the account"
        s = ok(api("/accounts/two-step/setup", "POST", {}, token=tt), "setup")
        assert re.fullmatch(r"[A-Z2-7]{32}", s["secret"]) and s["uri"].startswith("otpauth://totp/TribeCode%3ATess?secret=" + s["secret"]) and "issuer=TribeCode" in s["uri"], s
        st, e = api("/accounts/two-step/confirm", "POST", {"code": wrong(s["secret"])}, token=tt); assert st == 400 and e["code"] == "wrong", (st, e)
        assert ok(api("/accounts/two-step", token=tt))["on"] is False, "a wrong first code turns nothing on"
        out = ok(api("/accounts/two-step/confirm", "POST", {"code": code(s["secret"])}, token=tt), "confirm")
        sec, recs = s["secret"], out["recovery"]
        assert len(recs) == 10 and len(set(recs)) == 10 and all(re.fullmatch(r"[A-Z2-9]{5}-[A-Z2-9]{5}", r) for r in recs), recs
        stt = ok(api("/accounts/two-step", token=tt)); assert stt["on"] and stt["recoveryLeft"] == 10, stt
        assert api("/accounts/two-step/setup", "POST", {}, token=tt)[0] == 409, "already on"
        disk = open(os.path.join(tribe, ".tribe", "auth3.json")).read()
        assert sec not in disk and all(r not in disk and r.replace("-", "") not in disk for r in recs), "the secret is sealed and recovery codes are hashes"
        for f in ("auth3.json", "secret.key"): assert oct(os.stat(os.path.join(tribe, ".tribe", f)).st_mode & 0o777) == "0o600", f
        print("  TOTP: enrol with a QR secret, a wrong first code refused, ten recovery codes; sealed and hashed in 0600 files")

        # ---------------- sign in with a code; wrong and replayed codes ----------------
        st, d = login("Tess"); assert st == 200 and d["need"] == "two-step" and d["ticket"] and "token" not in d and "memberToken" not in d and d["methods"]["code"], d
        tk = d["ticket"]
        st, e = step2(tk, code=wrong(sec)); assert st == 401 and e["code"] == "wrong" and e["left"] == 4, (st, e)
        good = code(sec)
        st, d = step2(tk, code=good); assert st == 200 and d["token"].startswith("tca_") and d["account"]["username"] == "Tess" and d["memberToken"] and d["account"]["twoStep"] is True, d
        assert step2(tk, code=code(sec))[0] == 410, "a ticket works once"
        st, d = login("Tess"); st, e = step2(d["ticket"], code=good); assert st == 401 and e["code"] == "replay", "the same code twice is refused"
        assert step2(d["ticket"], code=code(sec))[0] == 200, "the next code works"
        assert login("Tess", "not the password")[0] == 401, "a wrong password never reaches the second step"
        assert step2("x" * 40, code="123456")[0] == 410 and step2(None, code="123456")[0] == 410
        print("  sign-in: password -> ticket -> code; wrong and replayed codes refused; a ticket works once")

        # ---------------- recovery code: single use ----------------
        st, d = login("Tess"); st, r = step2(d["ticket"], recovery=recs[0].lower()); assert st == 200 and r["token"] and r["recoveryLeft"] == 9, (st, r)
        st, d = login("Tess"); st, e = step2(d["ticket"], recovery=recs[0]); assert st == 401 and e["code"] == "wrong", "a recovery code works once"
        assert step2(d["ticket"], recovery=recs[1])[0] == 200
        assert ok(api("/accounts/two-step", token=tt))["recoveryLeft"] == 8
        # new recovery codes need a current code; the old ones stop working
        assert api("/accounts/two-step/recovery", "POST", {"code": wrong(sec)}, token=tt)[0] == 401
        recs2 = ok(api("/accounts/two-step/recovery", "POST", {"code": code(sec)}, token=tt))["recovery"]
        st, d = login("Tess"); assert step2(d["ticket"], recovery=recs[2])[0] == 401 and step2(d["ticket"], recovery=recs2[0])[0] == 200
        print("  recovery codes: single use, counted, replaced with a current code")

        # ---------------- trust this device ----------------
        st, d = login("Tess"); st, r = step2(d["ticket"], code=code(sec), remember=True); assert st == 200 and r["trust"].startswith("tct_"), r
        trust = r["trust"]
        st, d = login("Tess"); st, r = step2(d["ticket"], trust=trust); assert st == 200 and r["token"] and "trust" not in r, "a trusted device needs no code"
        st, d = login("Tess"); st, e = step2(d["ticket"], trust="tct_" + "A" * 32); assert st == 401 and e["code"] == "untrusted", (st, e)
        assert step2(d["ticket"], code=code(sec))[0] == 200, "a wrong trust token is not a wrong code: the ticket lives"
        ok(api("/accounts/two-step/trusted", "DELETE", token=tt))
        st, d = login("Tess"); assert step2(d["ticket"], trust=trust)[0] == 401, "forgotten devices ask again"
        print("  trusted device: 30-day token skips the code; forged or forgotten tokens don't")

        # ---------------- every other way in stops at the code ----------------
        # a provider account
        st, nw = a2.oauth_finish("discord", "nelly", headers=remote()); assert nw["mode"] == "new", nw
        nelly = ok(api("/accounts/oauth/confirm", "POST", {"ticket": nw["ticket"], "username": "Nelly"}, headers=remote()))
        nsec, _ = enrol(nelly["token"])
        st, d = a2.oauth_finish("discord", "nelly", headers=remote()); assert st == 200 and d["need"] == "two-step" and "token" not in d, d
        st, r = step2(d["ticket"], code=code(nsec)); assert st == 200 and r["mode"] == "account" and r["account"]["username"] == "Nelly", r
        # the desktop handoff
        v, ch = a2.pkce(); land = a2.provider_flow("discord", "nelly", {"mode": "signin", "desktop": {"challenge": ch}})
        st, d = api("/oauth/desktop/exchange", "POST", {"code": a2.frag(land)["desktop"], "verifier": v}); assert st == 200 and d["need"] == "two-step" and "token" not in d, d
        assert step2(d["ticket"], code=code(nsec))[0] == 200
        # an email link (Nelly's provider email is verified), and a password reset by email
        n0 = len(a2.MAIL); ok(api("/accounts/email/request", "POST", {"email": "nelly@example.test"}, headers=remote()))
        tok = a2.link_in(a2.wait_mail(n0 + 1, "magic link"), "magic")
        st, d = api("/accounts/email/complete", "POST", {"token": tok}, headers=remote()); assert st == 200 and d["need"] == "two-step" and "token" not in d, d
        assert step2(d["ticket"], code=code(nsec))[0] == 200
        ok(api("/accounts/password", "POST", {"password": PW}, token=nelly["token"]))
        n0 = len(a2.MAIL); ok(api("/accounts/reset/request", "POST", {"username": "Nelly"}, headers=remote()))
        tok = a2.link_in(a2.wait_mail(n0 + 1, "reset link"), "reset")
        st, d = api("/accounts/reset/complete", "POST", {"token": tok, "password": "a brand new phrase 7"}, headers=remote()); assert st == 200 and d["need"] == "two-step" and "token" not in d, d
        assert step2(d["ticket"], code=code(nsec))[0] == 200
        # a member of the tribe who signs back in with a provider (no account session at all): the same step
        a2.state["who"] = "maya"
        land = a2.provider_flow("github", "maya", {"mode": "join", "code": invite()}, headers=remote())
        maya = ok(api("/oauth/finish", "POST", {"rc": a2.frag(land)["oauth"]}, headers=remote())); assert maya["mode"] == "join" and maya["token"], maya
        macc = ok(api("/accounts/signup", "POST", {"username": "Maya G", "password": PW, "link": True}, token=maya["token"], headers=remote()), "Maya claims her account")
        msec, _ = enrol(macc["token"])
        st, d = a2.oauth_finish("github", "maya", headers=remote()); assert st == 200 and d["need"] == "two-step" and "token" not in d and "member" not in d, d
        st, r = step2(d["ticket"], code=code(msec)); assert st == 200 and r["mode"] == "signin" and r["token"] and r["member"]["name"], r
        assert ok(api("/me", token=r["token"]))["member"]["id"] == maya["member"]["id"]
        print("  provider, desktop handoff, email link, email reset and a member's provider sign-in all stop at the code")

        # ---------------- lockout ----------------
        lock = ok(api("/accounts/signup", "POST", {"username": "Lock", "password": PW}, headers=remote()))
        lsec, _ = enrol(lock["token"])
        codes = []
        for i in range(2):
            st, d = login("Lock"); R = remote()
            for j in range(5): codes.append(step2(d["ticket"], headers=R, code=wrong(lsec)))
        assert [c[0] for c in codes[:4]] == [401] * 4 and codes[4][1].get("left") == 0, codes[:5]
        assert codes[9][0] == 429 and codes[9][1]["code"] == "locked", codes[9]
        st, d = login("Lock"); st, e = step2(d["ticket"], code=code(lsec)); assert st == 429 and e["code"] == "locked", "locked: even the right code waits"
        st, e = api("/accounts/two-step/disable", "POST", {"code": code(lsec)}, token=lock["token"]); assert st == 429, (st, e)
        st, d = login("Tess"); assert step2(d["ticket"], code=code(sec))[0] == 200, "someone else's lockout is theirs alone"
        print("  lockout: a ticket dies after 5 wrong codes, 10 lock the second step for that account only")

        # ---------------- required for admins ----------------
        assert api("/accounts/admin/settings", "PUT", {"twoStepAdmins": True}, token=host, headers=remote())[0] == 403, "host computer only"
        assert api("/accounts/admin/settings", "PUT", {"twoStepAdmins": True}, token=tess["memberToken"])[0] == 403, "host only"
        ada = ok(api("/accounts/signup", "POST", {"username": "Ada", "password": PW, "invite": invite()}, headers=remote()))
        bob = ok(api("/accounts/signup", "POST", {"username": "Bob", "password": PW, "invite": invite()}, headers=remote()))
        ok(api("/perms/assign", "POST", {"member": ada["member"]["id"], "role": "admin"}, token=host), "Ada is an admin")
        st, d = login("Ada"); assert d.get("memberToken") and "twoStep" not in d, "not required yet"
        assert ok(api("/accounts/admin/settings", "PUT", {"twoStepAdmins": True}, token=host))["twoStepAdmins"] is True
        st, d = login("Ada"); assert st == 200 and d["token"] and "memberToken" not in d and "member" not in d and d["twoStep"]["required"] is True, d
        assert ok(api("/accounts/two-step", token=d["token"]))["required"] is True
        st, b = login("Bob"); assert b.get("memberToken") and "twoStep" not in b, "a builder is not held"
        asec, aout = enrol(d["token"], headers=remote()); assert aout["memberToken"] and aout["member"]["id"] == ada["member"]["id"], "turning it on hands over the tribe key"
        st, d = login("Ada"); st, r = step2(d["ticket"], code=code(asec)); assert st == 200 and r["memberToken"] and "twoStep" not in r, r
        ok(api("/accounts/admin/settings", "PUT", {"twoStepAdmins": False}, token=host))
        print("  required for admins: no tribe key until two-step is on; builders aren't held; host-only, on the host computer")

        # ---------------- turning it off needs a current code ----------------
        assert api("/accounts/two-step/disable", "POST", {"code": wrong(sec)}, token=tt)[0] == 401
        assert api("/accounts/two-step/disable", "POST", {}, token=tt)[0] == 401
        ok(api("/accounts/two-step/disable", "POST", {"code": code(sec)}, token=tt), "disable")
        st, d = login("Tess"); assert d.get("token") and "need" not in d, "off: the password is enough again"
        print("  turning it off needs a current code")

        # =============================== the browser: passkeys and the UI ===============================
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pia = ok(api("/accounts/signup", "POST", {"username": "Pia", "password": PW, "invite": invite()}), "Pia")
            cx = b.new_context(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
            cx.add_init_script(init_script("Pia", pia, pia["memberToken"]))
            pg = cx.new_page(); pg.on("pageerror", lambda e: errors.append(f"pia: {e}"))
            cdp = cx.new_cdp_session(pg); cdp.send("WebAuthn.enable")
            auth = cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {"protocol": "ctap2", "transport": "internal", "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})["authenticatorId"]
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("() => window.TribeClient && window.TribeClient.connected() && window.TribeAuth3", timeout=20000)
            pg.evaluate("() => window.TribeSettings.open('account')")
            pg.wait_for_selector("#set-twostep", timeout=15000); pg.wait_for_selector("#a3-add-pk")
            assert pg.text_content("#a3-state") == "Off"

            # ---- UI: turn on two-step ----
            pg.click("#a3-on"); pg.wait_for_selector("#a3-qr svg", timeout=10000)
            usec = pg.inner_text("#a3-secret").replace(" ", ""); assert re.fullmatch(r"[A-Z2-7]{32}", usec), usec
            pg.locator("#a3-enrol").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "two-step.png"))
            pg.fill("#a3-first", "000000" if totp_at(usec, int(time.time() / STEP)) != "000000" else "111111"); pg.click("#a3-confirm-go")
            pg.wait_for_function("document.querySelector('#a3-enrol-err').textContent.length > 5")
            pg.fill("#a3-first", code(usec)); pg.click("#a3-confirm-go")
            pg.wait_for_selector("#a3-recovery", timeout=10000)
            ui_recs = pg.eval_on_selector_all("#a3-recs code", "els => els.map(e => e.textContent)"); assert len(ui_recs) == 10, ui_recs
            with pg.expect_download() as dl: pg.click("[data-a3='dl-recs']")
            text = open(dl.value.path()).read(); assert all(r in text for r in ui_recs) and "Pia" in text
            pg.click("#a3-saved"); pg.wait_for_function("document.querySelector('#a3-state') && document.querySelector('#a3-state').textContent === 'On'", timeout=10000)
            assert "10 recovery codes left" in pg.inner_text("#set-twostep")
            print("  UI: Settings › Account turns two-step on (QR, key, a wrong code, the code), ten recovery codes to download")

            # ---- passkeys: register in Settings ----
            pg.click("#a3-add-pk"); pg.wait_for_selector("#a3-pklist li", timeout=15000)
            keys = ok(api("/accounts/passkeys", token=pia["token"]))["passkeys"]; assert len(keys) == 1 and keys[0]["where"] == "localhost", keys
            pg.click("[data-pk-rename]"); pg.fill("#a3-rename input", "Pia's laptop"); pg.press("#a3-rename input", "Enter")
            pg.wait_for_function("document.querySelector('#a3-pklist li b') && document.querySelector('#a3-pklist li b').textContent === \"Pia's laptop\"", timeout=10000)
            pg.locator("#set-passkeys").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            pg.screenshot(path=str(SHOTS / "passkey.png"))
            assert any(m["kind"] == "passkey" for m in ok(api("/accounts/methods", token=pia["token"]))["methods"])
            disk = json.load(open(os.path.join(tribe, ".tribe", "auth3.json")))["accounts"][pia["account"]["id"]]["passkeys"][0]
            assert disk["jwk"]["kty"] in ("EC", "RSA") and "d" not in disk["jwk"], "only the public key is kept"
            print("  passkey: registered with the virtual authenticator, renamed, listed as a sign-in method")

            # ---- sign in with the passkey: API-level checks from the page ----
            r = pg.evaluate(PK_JS, {}); assert r["status"] == 200 and r["data"]["account"]["username"] == "Pia" and r["data"]["token"].startswith("tca_") and r["data"]["memberToken"], r
            assert "need" not in r["data"], "a passkey sign-in counts as two-step"
            rp = pg.evaluate(PK_JS, {"replay": r["body"]}); assert rp["status"] == 401 and rp["data"]["code"] == "challenge", "a replayed answer is refused: the challenge is single use"
            w = pg.evaluate(PK_JS, {"swap": True}); assert w["status"] == 401 and w["data"]["code"] == "challenge", w
            st, other = api("/accounts/passkey/start", "POST", {}, headers={"Origin": "http://tauri.localhost"}); assert st == 200 and other["publicKey"]["rpId"] == "tauri.localhost", other
            w = pg.evaluate(PK_JS, {"challenge": other["publicKey"]["challenge"]}); assert w["status"] == 401 and w["data"]["code"] == "origin", w
            for o_, c_ in (("http://192.168.1.20:%d" % PORT, 403), ("http://127.0.0.1:%d" % PORT, 400)):
                st, e = api("/accounts/passkey/start", "POST", {}, headers={"Origin": o_, "Host": o_[7:]}); assert st in (400, 403), (o_, st, e)
            st, e = api("/accounts/passkey/start", "POST", {}, headers={"Origin": "http://127.0.0.1:%d" % PORT, "Host": "127.0.0.1:%d" % PORT}); assert st == 400 and e["code"] == "ip", (st, e)
            # the counter went backwards (a copied key): refused
            creds = cdp.send("WebAuthn.getCredentials", {"authenticatorId": auth})["credentials"]; assert len(creds) == 1 and creds[0]["signCount"] >= 1, creds
            c0 = creds[0]
            cdp.send("WebAuthn.removeCredential", {"authenticatorId": auth, "credentialId": c0["credentialId"]})
            cdp.send("WebAuthn.addCredential", {"authenticatorId": auth, "credential": {**c0, "signCount": 0}})
            w = pg.evaluate(PK_JS, {}); assert w["status"] == 401 and w["data"]["code"] == "counter", w
            cdp.send("WebAuthn.removeCredential", {"authenticatorId": auth, "credentialId": c0["credentialId"]})
            cdp.send("WebAuthn.addCredential", {"authenticatorId": auth, "credential": {**c0, "signCount": c0["signCount"] + 50}})
            assert pg.evaluate(PK_JS, {})["status"] == 200, "a counter that moves forward is fine"
            print("  passkey sign-in: counts as two-step; replay, wrong challenge, another origin's challenge and a counter regression refused")

            # ---- sign in with the passkey from signin.html and from the Log in sheet ----
            pg.evaluate("() => { sessionStorage.setItem('tc.noinit', '1'); localStorage.clear(); }")   # from here on this browser only knows what a sign-in gives it
            pg.goto(BASE + "/signin.html"); pg.wait_for_selector("#a3-passkey", timeout=15000)
            assert pg.evaluate("() => localStorage.getItem('tribecode.accounts.v1')") is None
            pg.click("#a3-passkey")
            pg.wait_for_url(re.compile(r"/(\?.*)?$"), timeout=20000)
            pg.wait_for_function("() => { try { const a = JSON.parse(localStorage.getItem('tribecode.accounts.v1')); return a && a.accounts[0].username === 'Pia' && a.accounts[0].acct.startsWith('tca_'); } catch { return false; } }", timeout=15000)
            print("  signin.html: Sign in with a passkey signs Pia in")
            # the second step with a passkey, in the Log in sheet
            pg.wait_for_function("() => window.TribeAccounts && window.TribeAuth3", timeout=20000)
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("() => window.TribeAccounts && window.TribeAuth3 && window.TribeClient && window.TribeClient.connected()", timeout=20000)
            try: pg.evaluate("() => { window.TribeAccounts.logout({ forget: false }); }")   # Log out: the page reloads signed out
            except Exception: pass
            pg.wait_for_timeout(2500); pg.wait_for_load_state("load")
            pg.wait_for_function("() => document.readyState === 'complete' && window.TribeAccounts && window.TribeAuth3 && window.TribeAccounts.mode() === 'signedout'", timeout=20000); pg.wait_for_timeout(800)
            if pg.locator("#ac-login").count() == 0: pg.evaluate("() => window.TribeAccounts.login()")
            pg.wait_for_selector("#ac-user", state="visible", timeout=15000); pg.wait_for_selector("#ac-passkey #a3-passkey", timeout=10000)
            pg.fill("#ac-user", "Pia"); pg.fill("#ac-pass", PW); pg.click("#ac-acct-go")
            pg.wait_for_selector("#a3-step #a3-code", timeout=15000)
            assert "Pia" in pg.inner_text("#a3-step") and pg.locator("#a3-use-pk").count() == 1
            pg.fill("#a3-code", "12345"); pg.click("#a3-go"); assert "6 digits" in pg.inner_text("#a3-err")
            pg.click("#a3-use-pk")
            pg.wait_for_function("() => { try { const a = JSON.parse(localStorage.getItem('tribecode.accounts.v1')); return a && a.mode === 'signedin' && a.accounts[0].username === 'Pia'; } catch { return false; } }", timeout=20000)
            pg.wait_for_function("() => window.TribeClient && window.TribeClient.connected()", timeout=20000)
            print("  Log in: password -> the code sheet -> Use a passkey")

            # ---- the code sheet with a typed code and "Trust this device" ----
            fx = b.new_context(viewport={"width": 1100, "height": 860}, extra_http_headers={"X-Forwarded-For": "198.51.100.90"})
            fx.add_init_script("try { localStorage.setItem('tribecode.intro.v1','seen'); if (!localStorage.getItem('tribecode.settings.v1')) { localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Pia', onboarded:true, tour:{done:true}})); localStorage.setItem('tribecode.accounts.v1', JSON.stringify({ mode: 'signedout', accounts: [] })); } } catch (e) {}")
            fp = fx.new_page(); fp.on("pageerror", lambda e: errors.append(f"friend: {e}"))
            fp.goto(BASE + "/?skipIntro=1"); fp.wait_for_function("() => window.TribeAccounts && window.TribeAuth3", timeout=20000)
            fp.evaluate("() => window.TribeAccounts.login()"); fp.wait_for_selector("#ac-user", state="visible", timeout=15000)
            fp.fill("#ac-user", "Pia"); fp.fill("#ac-pass", PW); fp.click("#ac-acct-go")
            fp.wait_for_selector("#a3-step #a3-code", timeout=15000)
            fp.fill("#a3-code", wrong(usec)); fp.click("#a3-go"); fp.wait_for_function("document.querySelector('#a3-err').textContent.includes('does not match')", timeout=10000)
            fp.click("#a3-swap"); assert "recovery" in fp.inner_text("#a3-title").lower(); fp.click("#a3-swap")
            fp.check("#a3-remember"); fp.fill("#a3-code", code(usec)); fp.click("#a3-go")
            fp.wait_for_function("() => { try { const a = JSON.parse(localStorage.getItem('tribecode.accounts.v1')); return a && a.mode === 'signedin' && a.accounts[0].username === 'Pia' && Object.values(JSON.parse(localStorage.getItem('tribecode.trust.v1') || '{}'))[0].startsWith('tct_'); } catch { return false; } }", timeout=20000)
            tr = list(fp.evaluate("() => JSON.parse(localStorage.getItem('tribecode.trust.v1'))").values())[0]
            st, d = login("Pia"); assert step2(d["ticket"], trust=tr)[0] == 200, "the device the sheet trusted is trusted"
            print("  the code sheet: a wrong code says so, a recovery-code view, Trust this device keeps a token")

            # ---- where passkeys can't work: one plain line ----
            np_ = fx.new_page(); np_.goto(f"http://127.0.0.1:{PORT}/signin.html"); np_.wait_for_selector("#a3-pk-off", timeout=15000)
            assert "aren't available" in np_.inner_text("#a3-pk-off") and "localhost" in np_.inner_text("#a3-pk-off") and np_.locator("#a3-passkey").count() == 0

            # ---- remove; the last sign-in method is protected ----
            ptok = pia["token"]
            ok(api("/accounts/two-step/disable", "POST", {"code": code(usec)}, token=ptok), "two-step off")
            kid = ok(api("/accounts/passkeys", token=ptok))["passkeys"][0]["id"]
            assert api("/accounts/passkeys/" + kid, "PUT", {"name": ""}, token=ptok)[0] == 400
            ok(api("/accounts/methods/password", "DELETE", token=ptok), "the passkey is a way in, so the password may go")
            st, e = api("/accounts/passkeys/" + kid, "DELETE", token=ptok); assert st == 409 and e["code"] == "last", (st, e)
            st, e = api("/accounts/methods/passkey:" + kid, "DELETE", token=ptok); assert st == 409 and e["code"] == "last", (st, e)
            assert api("/accounts/passkeys/" + kid, "DELETE", token=bob["token"])[0] == 404, "someone else's passkey is not yours to remove"
            ok(api("/accounts/password", "POST", {"password": PW}, token=ptok))
            ok(api("/accounts/passkeys/" + kid, "DELETE", token=ptok), "remove")
            assert ok(api("/accounts/passkeys", token=ptok))["passkeys"] == []
            w = pg.evaluate(PK_JS, {}); assert w["status"] == 401 and w["data"]["code"] == "unknown", "a removed passkey signs nobody in"
            print("  remove: never the last way in (passkeys and methods routes), not someone else's; a removed passkey is dead; plain line at 127.0.0.1")
            b.close()
        assert not errors, errors
        print("ok e2e_auth3")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        mock.shutdown(); smtp.shutdown()


if __name__ == "__main__":
    main()
