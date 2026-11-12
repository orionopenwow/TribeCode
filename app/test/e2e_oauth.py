"""End-to-end: Sign in with Discord / GitHub / Google (server/oauth.js, app/ui/oauth.js, join.html, signin.html).

A local mock plays all three providers (authorize, token, userinfo), checks the client id + secret, the redirect URI and
the PKCE verifier, and auto-approves as whichever user the test picks. The server points at it through
TRIBE_OAUTH_DISCORD_BASE / TRIBE_OAUTH_GITHUB_BASE / TRIBE_OAUTH_GOOGLE_BASE.

Checks: providers are off until configured; only the host on the host computer can change them; the host turns Discord on
in Settings › Sign-in (redirect URI shown); a friend joins from an invite with "Continue with Discord", gets the provider's
name + a CDN avatar, the invite use is consumed; unconfigured providers show no button and can't start; a replayed
callback, a callback without the starting browser's cookie, and a reused one-time result code are all refused; a second
join with the last invite use exhausts it; signing back in on a fresh browser gives a new device token (the old one keeps
working); an unknown account can't sign in; a member links / unlinks Discord in Settings (provider text escaped), and an
account linked to someone else can't be linked again; avatars from other hosts are dropped; the client secret never
appears in any API response; the join page at 390px has no horizontal scroll.
Usage: python app/test/e2e_oauth.py [--shots]
"""
import base64, hashlib, http.server, json, os, secrets, shutil, subprocess, sys, tempfile, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4911 + OFF
MOCK_PORT = 4912 + OFF
BASE = f"http://localhost:{PORT}"
MOCK = f"http://127.0.0.1:{MOCK_PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
errors = []
api_bodies = []   # every API response body the test saw (urllib + browser): the secret must be in none

CLIENT_ID = "1234567890discord"
SECRET = "s3cr3t-DISCORD-" + "Z" * 20
USERS = {
    "nelly": {"id": "80351110224678912", "username": "nelly", "global_name": "Nelly Discord", "avatar": "8342729096ea3675442027381ff50dfe"},
    "second": {"id": "80351110224678913", "username": "second", "global_name": "Second Friend", "avatar": None},
    "stranger": {"id": "99999999999999999", "username": "stranger", "global_name": "Stranger", "avatar": None},
    "vega": {"id": "80351110224678914", "username": "vega", "global_name": 'Vega & "Co" <i>x</i>', "avatar": None},
}
state = {"discord": "nelly", "codes": {}, "tokens": {}, "authorize": [], "token_calls": 0, "bad": []}


# ---------------- the mock provider ----------------
class Mock(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def reply(self, status, obj=None, headers=None):
        data = json.dumps(obj or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data)))
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        prov = {"/oauth2/authorize": "discord", "/login/oauth/authorize": "github", "/o/oauth2/v2/auth": "google"}.get(u.path)
        if prov:
            state["authorize"].append({"provider": prov, **q})
            if q.get("client_id") != CLIENT_ID or q.get("code_challenge_method") != "S256" or not q.get("code_challenge") or not q.get("state") or q.get("response_type") != "code":
                state["bad"].append(("authorize", q)); return self.reply(400, {"error": "invalid_request"})
            code = secrets.token_urlsafe(16)
            state["codes"][code] = {"provider": prov, "challenge": q["code_challenge"], "redirect_uri": q["redirect_uri"], "user": state[prov] if prov in state else "nelly"}
            sep = "&" if "?" in q["redirect_uri"] else "?"
            self.send_response(302); self.send_header("Location", q["redirect_uri"] + sep + urllib.parse.urlencode({"code": code, "state": q["state"]}))
            self.send_header("Content-Length", "0"); self.end_headers(); return
        user = {"/api/users/@me": "discord", "/user": "github", "/v1/userinfo": "google"}.get(u.path)
        if user:
            t = (self.headers.get("Authorization") or "")[7:]
            info = state["tokens"].get(t)
            if not info: return self.reply(401, {"message": "401: Unauthorized"})
            if info["provider"] == "discord": return self.reply(200, USERS[info["user"]])
            if info["provider"] == "github": return self.reply(200, {"id": 583231, "login": "octo", "name": None, "avatar_url": "https://evil.example.com/a.png"})
            return self.reply(200, {"sub": "1098765", "name": "Gwen Google", "picture": "https://lh3.googleusercontent.com/a/xyz"})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        f = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
        if u.path in ("/api/oauth2/token", "/login/oauth/access_token", "/token"):
            state["token_calls"] += 1
            c = state["codes"].pop(f.get("code", ""), None)   # codes are single use, like the real thing
            ch = base64.urlsafe_b64encode(hashlib.sha256(f.get("code_verifier", "").encode()).digest()).rstrip(b"=").decode()
            if not c or f.get("client_id") != CLIENT_ID or f.get("client_secret") != SECRET or f.get("redirect_uri") != c["redirect_uri"] or ch != c["challenge"] or f.get("grant_type") != "authorization_code":
                state["bad"].append(("token", {k: v for k, v in f.items() if k != "client_secret"})); return self.reply(400, {"error": "invalid_grant"})
            t = secrets.token_urlsafe(24); state["tokens"][t] = c
            return self.reply(200, {"access_token": t, "token_type": "Bearer", "expires_in": 600, "scope": "identify"})
        self.reply(404, {"error": "not found"})


# ---------------- helpers ----------------
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))


def api(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with opener.open(req, timeout=30) as r: raw = r.read(); st = r.status
    except urllib.error.HTTPError as e: raw = e.read(); st = e.code
    api_bodies.append(raw.decode("utf8", "replace"))
    return st, json.loads(raw or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def raw_get(url, cookie=None):
    """GET without following redirects: (status, location, set-cookie)."""
    req = urllib.request.Request(url, headers={"Cookie": cookie} if cookie else {})
    try:
        with opener.open(req, timeout=30) as r: return r.status, r.headers.get("Location"), r.headers.get("Set-Cookie")
    except urllib.error.HTTPError as e: return e.code, e.headers.get("Location"), e.headers.get("Set-Cookie")


def flow_by_hand(mode, code=None, token=None):
    """start -> go -> provider -> callback URL, by hand (no browser). Returns (callback_url, cookie)."""
    d = ok(api("/oauth/discord/start", "POST", {"mode": mode, "code": code}, token=token), f"start {mode}")
    st, loc, sc = raw_get(d["url"])
    assert st == 302 and loc.startswith(MOCK + "/oauth2/authorize?") and sc and "HttpOnly" in sc and "SameSite=Lax" in sc, f"go: {st} {loc} {sc}"
    cookie = sc.split(";")[0]
    st, cb, _ = raw_get(loc)
    assert st == 302 and cb.startswith(BASE + "/api/oauth/discord/callback?"), f"mock authorize: {st} {cb}"
    return cb, cookie


def wait_for(fn, what, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = fn()
        if v: return v
        time.sleep(0.2)
    raise AssertionError(f"timed out: {what}")


def shot(page, name):
    if take:
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOTS / f"oauth-{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))

    def resp(r):
        if "/api/" in r.url and r.request.method != "OPTIONS":
            try: api_bodies.append(r.text())
            except Exception: pass
    page.on("response", resp)


def settings_js(name, token):
    return (f"try {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}})); localStorage.setItem('tribecode.intro.v1','seen'); }} catch (e) {{}}")


def href(page):
    try: return page.evaluate("location.href")
    except Exception: return ""   # mid-navigation


def stored_token(page):
    return page.evaluate("() => { try { return (JSON.parse(localStorage.getItem('tribecode.settings.v1') || '{}').server || {}).token || '' } catch (e) { return '' } }")


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-oauth-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    mock = http.server.ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), Mock)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_REVEAL": "1",
           "TRIBE_OAUTH_DISCORD_BASE": MOCK, "TRIBE_OAUTH_GITHUB_BASE": MOCK, "TRIBE_OAUTH_GOOGLE_BASE": MOCK,
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in ("TRIBE_PUBLIC_URL",): env.pop(k, None)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Sign-in Crew"],
                           stdout=log, stderr=subprocess.STDOUT, env=env)
    REMOTE = {"X-Forwarded-For": "203.0.113.9"}
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)
        orion = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        inv0 = ok(api("/invites", "POST", {"maxUses": 5}, token=orion), "invite")["invite"]["code"]
        vega = ok(api("/join", "POST", {"code": inv0, "name": "Vega"}), "vega joins")["token"]

        # ---------------- off until configured; host only; host computer only ----------------
        assert ok(api("/oauth/providers"))["providers"] == [], "every provider is off at first"
        cfg = ok(api("/oauth/config", token=orion), "config")
        assert [p["id"] for p in cfg["providers"]] == ["discord", "github", "google", "apple"] and cfg["canEdit"] and not any(p["on"] for p in cfg["providers"]), cfg
        assert cfg["providers"][0]["redirectUri"] == f"{BASE}/api/oauth/discord/callback", cfg["providers"][0]["redirectUri"]
        assert "discord.com/developers" in cfg["providers"][0]["register"] and "console.cloud.google.com" in cfg["providers"][2]["register"] and "github.com/settings/developers" in cfg["providers"][1]["register"]
        assert api("/oauth/config", token=vega)[0] == 403, "members can't see the provider setup"
        assert api("/oauth/config/discord", "PUT", {"clientId": CLIENT_ID, "clientSecret": SECRET, "enabled": True}, token=vega)[0] == 403, "members can't change it"
        assert api("/oauth/config/discord", "PUT", {"clientId": CLIENT_ID, "clientSecret": SECRET, "enabled": True}, token=orion, headers=REMOTE)[0] == 403, "not from a tunnel"
        assert api("/oauth/config/discord", "PUT", {"enabled": True}, token=orion)[0] == 400, "can't switch on without id + secret"
        assert api("/oauth/discord/start", "POST", {"mode": "signin"})[0] == 404, "an unconfigured provider can't start"
        print("  setup: off by default, host only, host computer only")

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            # ---------------- host turns Discord on in Settings › Sign-in ----------------
            hctx = b.new_context(viewport={"width": 1280, "height": 860}, permissions=["clipboard-read", "clipboard-write"])
            hctx.add_init_script(settings_js("Orion", orion))
            host = hctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("() => window.TribeClient && window.TribeClient.connected()", timeout=20000)
            host.evaluate("() => { localStorage.setItem('tribecode.set.more','1'); window.TribeSettings.open() }")
            prov = host.locator('#set-oauth .oa-prov[data-p="discord"]')
            prov.wait_for(timeout=10000)
            prov.locator("summary").click()
            assert f"{BASE}/api/oauth/discord/callback" in prov.locator("code").inner_text(), "the redirect URI to copy is shown"
            prov.locator('[data-f="clientId"]').fill(CLIENT_ID)
            prov.locator('[data-f="clientSecret"]').fill(SECRET)
            prov.locator('[data-act="save"]').click()
            host.wait_for_selector('#set-oauth .oa-prov[data-p="discord"] .oa-st.on', timeout=10000)
            assert host.locator('#set-oauth .oa-prov[data-p="discord"] [data-f="clientSecret"]').input_value() == "", "the secret field is not refilled"
            assert "Saved" in host.locator('#set-oauth .oa-prov[data-p="discord"] [data-f="clientSecret"]').get_attribute("placeholder")
            host.locator('#set-oauth .oa-prov[data-p="discord"]').scroll_into_view_if_needed()
            shot(host, "settings")
            assert SECRET not in host.content(), "the secret is not in the page"
            assert ok(api("/oauth/providers"))["providers"] == [{"id": "discord", "name": "Discord"}], "only Discord is on"
            conf = json.loads(Path(tribe, ".tribe", "oauth.json").read_text())
            assert conf["discord"]["clientSecret"] == SECRET and (os.stat(Path(tribe, ".tribe", "oauth.json")).st_mode & 0o077) == 0, "secret stored 0600 on the host"
            print("  Settings › Sign-in: host turns Discord on (redirect URI shown, secret write-only)")

            # ---------------- a friend joins with Discord ----------------
            inv = ok(api("/invites", "POST", {"maxUses": 2}, token=orion), "invite 2")["invite"]["code"]
            fctx = b.new_context(viewport={"width": 1280, "height": 860})
            friend = fctx.new_page(); watch(friend, "friend")
            callbacks = []
            friend.on("request", lambda r: callbacks.append(r.url) if "/api/oauth/discord/callback" in r.url else None)
            friend.goto(f"{BASE}/join/{inv}")
            friend.wait_for_selector('.oa-btn[data-oa="discord"]', timeout=10000)
            assert friend.locator('.oa-btn[data-oa="github"]').count() == 0 and friend.locator('.oa-btn[data-oa="google"]').count() == 0, "unconfigured providers show no button"
            assert "Continue with Discord" in friend.locator('.oa-btn[data-oa="discord"]').inner_text()
            assert friend.locator("#oa-signin").is_visible(), "a sign-in link for people already in"
            shot(friend, "join")
            state["discord"] = "nelly"
            friend.locator('.oa-btn[data-oa="discord"]').click()
            wait_for(lambda: href(friend).rstrip("/") == BASE, "friend lands in the app", 20)
            ftoken = wait_for(lambda: stored_token(friend), "friend token stored")
            assert "#oauth" not in href(friend) and "code=" not in href(friend)
            meN = ok(api("/me", token=ftoken), "friend /me")["member"]
            assert meN["name"] == "Nelly Discord" and meN["role"] == "builder", meN
            assert meN["avatar"] == "https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png?size=128", meN
            invs = {i["code"]: i for i in ok(api("/invites", token=orion))["invites"]}
            assert invs[inv]["uses"] == 1, f"the invite use is consumed: {invs[inv]}"
            assert len(callbacks) == 1 and ftoken not in callbacks[0], "the key never rides in a URL"
            members_now = len(ok(api("/members", token=orion))["members"])
            print("  join with Discord: name + CDN avatar from the provider, invite use consumed")

            # ---------------- replays and forwarded links ----------------
            friend.goto(callbacks[0])   # the same callback again, same browser
            friend.wait_for_function("() => /expired|already used/i.test((document.querySelector('#err') || {}).textContent || '')", timeout=10000)
            st, loc, _ = raw_get(callbacks[0])
            assert st == 302 and "oauth_error=" in loc, f"a replayed state is refused: {loc}"
            cb, cookie = flow_by_hand("join", inv)
            st, loc, _ = raw_get(cb)   # no cookie: a link forwarded to another browser
            assert st == 302 and "oauth_error=mismatch" in loc, f"callback without the starting browser's cookie: {loc}"
            st, loc, _ = raw_get(cb, cookie)
            assert st == 302 and "oauth_error=" in loc, f"and the flow is dead after that: {loc}"
            st, loc, _ = raw_get(f"{BASE}/api/oauth/discord/callback?code=x&state=forged")
            assert st == 302 and "oauth_error=expired" in loc, "a forged state is refused"
            assert len(ok(api("/members", token=orion))["members"]) == members_now, "no one was added by the replays"

            # one-time result code: works once, then never
            state["discord"] = "second"
            cb, cookie = flow_by_hand("join", inv)
            st, loc, _ = raw_get(cb, cookie)
            assert st == 302 and loc.startswith(f"/join/{inv}#oauth="), loc
            rc = loc.split("#oauth=")[1]
            d = ok(api("/oauth/finish", "POST", {"rc": rc}), "finish")
            assert d["member"]["name"] == "Second Friend" and d["token"] and d["mode"] == "join"
            st, d2 = api("/oauth/finish", "POST", {"rc": rc})
            assert st == 410 and "token" not in d2, f"a reused result code is refused: {st} {d2}"
            assert api(f"/invites/{inv}")[0] == 410, "the last use of the invite is gone"
            st, _ = api("/oauth/discord/start", "POST", {"mode": "join", "code": inv})
            assert st == 410, "an exhausted invite can't start a join"
            print("  replays: callback, forwarded link, forged state and reused result code all refused; invite exhausted")

            # ---------------- sign back in on a fresh browser ----------------
            state["discord"] = "nelly"
            sctx = b.new_context(viewport={"width": 1280, "height": 860})
            s = sctx.new_page(); watch(s, "signin")
            s.goto(BASE + "/signin.html")
            s.wait_for_selector('.oa-btn[data-oa="discord"]', timeout=10000)
            assert "Sign-in Crew" in s.locator("#title").inner_text()
            shot(s, "signin")
            s.locator('.oa-btn[data-oa="discord"]').click()
            wait_for(lambda: href(s).rstrip("/") == BASE, "signed back in", 20)
            stoken = wait_for(lambda: stored_token(s), "new token stored")
            assert stoken != ftoken
            assert ok(api("/me", token=stoken))["member"]["id"] == meN["id"], "same member"
            assert ok(api("/me", token=ftoken))["member"]["id"] == meN["id"], "the first device stays signed in"
            devs = ok(api("/devices", token=stoken))["devices"]
            assert any(x["label"] == "Discord sign-in" and x["current"] for x in devs), f"the new sign-in is a revocable device: {devs}"
            assert len(ok(api("/members", token=orion))["members"]) == members_now + 1, "no new account (only Second Friend was added)"

            # an account no one linked can't sign in
            state["discord"] = "stranger"
            s2 = sctx.new_page(); watch(s2, "signin2")
            s2.goto(BASE + "/signin.html")
            s2.wait_for_selector('.oa-btn[data-oa="discord"]', timeout=10000)
            s2.locator('.oa-btn[data-oa="discord"]').click()
            s2.wait_for_function("() => /No one in this tribe/i.test(document.querySelector('#err').textContent)", timeout=15000)
            print("  sign back in: fresh browser gets a new device token, old one still works; unknown account refused")

            # ---------------- link / unlink in Settings ----------------
            state["discord"] = "vega"
            vctx = b.new_context(viewport={"width": 1280, "height": 860})
            vctx.add_init_script(settings_js("Vega", vega))
            v = vctx.new_page(); watch(v, "vega")
            v.goto(BASE + "/?skipIntro=1")
            v.wait_for_function("() => window.TribeClient && window.TribeClient.connected()", timeout=20000)
            v.evaluate("() => { localStorage.setItem('tribecode.set.more','1'); window.TribeSettings.open() }")
            link = v.locator('#set-oauth .oa-link[data-p="discord"]')
            link.wait_for(timeout=10000)
            assert v.locator("#set-oauth .oa-prov").count() == 0, "members don't see the provider setup"
            assert "Not linked" in link.inner_text()
            link.locator('[data-act="link"]').click()
            wait_for(lambda: href(v).rstrip("/") == BASE, "back in the app after linking", 20)
            mine = ok(api("/oauth/me", token=vega))
            assert mine["linked"] and mine["linked"][0]["provider"] == "discord" and mine["linked"][0]["name"] == 'Vega & "Co" ix/i', mine
            v.wait_for_function("() => window.TribeClient && window.TribeClient.connected()", timeout=20000)
            v.evaluate("() => { localStorage.setItem('tribecode.set.more','1'); window.TribeSettings.open() }")
            v.wait_for_selector('#set-oauth .oa-link[data-p="discord"] [data-act="unlink"]', timeout=10000)
            txt = v.locator('#set-oauth .oa-link[data-p="discord"] small').inner_text()
            assert txt == 'Linked as Vega & "Co" ix/i', f"provider text is shown as text: {txt}"
            assert v.locator("#set-oauth i").count() == 0, "no markup injected from the provider"
            shot(v, "linked")
            # Nelly's Discord is Nelly's: Vega can't link it too
            state["discord"] = "nelly"
            cb, cookie = flow_by_hand("link", token=vega)
            st, loc, _ = raw_get(cb, cookie)
            rc = loc.split("#oauth=")[1]
            st, d = api("/oauth/finish", "POST", {"rc": rc}, token=vega)
            assert st == 409, f"an account linked to someone else can't be linked: {st} {d}"
            # and a link flow can only be finished by the member who started it
            state["discord"] = "vega"
            cb, cookie = flow_by_hand("link", token=vega)
            rc = raw_get(cb, cookie)[1].split("#oauth=")[1]
            assert api("/oauth/finish", "POST", {"rc": rc}, token=orion)[0] == 403, "someone else can't finish your link"
            v.locator('#set-oauth .oa-link[data-p="discord"] [data-act="unlink"]').click()
            v.wait_for_selector('#set-oauth .oa-link[data-p="discord"] [data-act="link"]', timeout=10000)
            assert ok(api("/oauth/me", token=vega))["linked"] == [], "unlinked"
            assert api("/oauth/me/discord", "DELETE")[0] == 401, "unlink needs a member"
            print("  link / unlink in Settings: escaped provider text, taken accounts refused, only the starter finishes")

            # ---------------- GitHub + Google: avatar host allowlist ----------------
            for pid in ("github", "google"):
                ok(api(f"/oauth/config/{pid}", "PUT", {"clientId": CLIENT_ID, "clientSecret": SECRET, "enabled": True}, token=orion), f"{pid} on")
            inv3 = ok(api("/invites", "POST", {"maxUses": 3}, token=orion), "invite 3")["invite"]["code"]
            for pid, name, av in (("github", "octo", None), ("google", "Gwen Google", "https://lh3.googleusercontent.com/a/xyz")):
                d = ok(api(f"/oauth/{pid}/start", "POST", {"mode": "join", "code": inv3}), f"{pid} start")
                st, loc, sc = raw_get(d["url"]); cookie = sc.split(";")[0]
                st, cb, _ = raw_get(loc)
                st, loc, _ = raw_get(cb, cookie)
                assert loc.startswith(f"/join/{inv3}#oauth="), f"{pid}: {loc}"
                m = ok(api("/oauth/finish", "POST", {"rc": loc.split("#oauth=")[1]}), f"{pid} finish")["member"]
                assert m["name"] == name and m.get("avatar") == av, f"{pid}: {m}"
            google_auth = [a for a in state["authorize"] if a["provider"] == "google"][-1]
            assert google_auth.get("nonce") and google_auth["scope"] == "openid profile", google_auth
            for pid in ("github", "google"):
                ok(api(f"/oauth/config/{pid}", "PUT", {"enabled": False}, token=orion), f"{pid} off")
            print("  GitHub + Google: names from the profile, avatars only from the provider CDN")

            # ---------------- phone: the join page at 390px ----------------
            inv4 = ok(api("/invites", "POST", {"maxUses": 2}, token=orion), "invite 4")["invite"]["code"]
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(f"{BASE}/join/{inv4}")
            phone.wait_for_selector('.oa-btn[data-oa="discord"]', timeout=10000)
            assert phone.evaluate("() => document.documentElement.scrollWidth") <= 390, "no horizontal scroll at 390px"
            box = phone.locator('.oa-btn[data-oa="discord"]').bounding_box()
            assert box["x"] >= 0 and box["x"] + box["width"] <= 390 and box["height"] >= 44, f"a full-width, thumb-sized button: {box}"
            shot(phone, "phone-join")
            state["discord"] = "nelly"   # already in: a join with a linked account signs in instead of making a duplicate
            phone.locator('.oa-btn[data-oa="discord"]').click()
            wait_for(lambda: "/m/" in href(phone), "phone opens its private device link", 20)
            assert len(ok(api("/members", token=orion))["members"]) == members_now + 3, "no duplicate account for a linked identity"
            print("  phone 390px: no horizontal scroll; a linked account joining signs in (device link), no duplicate")

            # ---------------- the secret never left the host ----------------
            for path in ("/oauth/config", "/oauth/me", "/me", "/members", "/health", "/oauth/providers"):
                api(path, token=orion)
            leaks = [x[:120] for x in api_bodies if SECRET in x]
            assert not leaks, f"the client secret appeared in an API response: {leaks}"
            assert not state["bad"], f"the mock saw bad requests: {state['bad']}"
            print(f"  secret: in none of {len(api_bodies)} API responses")
            b.close()
        real = [e for e in errors if "ResizeObserver" not in e]
        assert not real, real
        print("e2e_oauth: OK")
    except Exception:
        log.seek(0); print(log.read()[-4000:]); raise
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        mock.shutdown()
        if os.environ.get("KEEP"): print("kept", tmp)
        else: shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
