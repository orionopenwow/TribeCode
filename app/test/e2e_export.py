"""End-to-end: GitHub sign-in, Desktop folders and Home Screen app links
(server/github-auth.js, server/export.js, server/applink.js, app/ui/github.js, app/ui/folders.js).

A local mock plays GitHub: the OAuth device flow (/login/device/code, /login/oauth/access_token), the REST API
(/user, /user/repos) and git smart HTTP (git http-backend behind Basic auth that only accepts issued tokens), so
"the token is used by a push" is checked on the wire. A fake `gh` on PATH plays the GitHub CLI. The server runs with
HOME/USERPROFILE set to a temp folder, so its Desktop is <tmp>/home/Desktop.

Checks: client id setup (host only), Settings › GitHub › Sign in with GitHub end to end in the browser (code shown,
approved on the mock, signed in as @login, the token never reaches the browser), a new flow project then gets a
private repo and a push authenticated with that token, sign out, "Use my GitHub CLI login" (host computer only),
token paste validation; Export "Just the files" (working tree, no .git, ignored files left out) and "With history"
(a clone whose origin is the project's GitHub remote) into ~/Desktop/TribeCode Projects/<name>/; Keep a copy on my
Desktop (follows new commits, waits while it has local edits); the desktop shortcut file; the per-project manifest
(name, icons, start_url, theme) and the launcher page (fresh preview, no member token, stable key, revocable);
remote (tunnelled) requests to export / shortcut / mirror / gh refused; a member of another project refused;
phone 390px: the repo hero's Home Screen button opens the Add to Home Screen sheet; the preview pane's button and
the Folder sheet on desktop.
Usage: python app/test/e2e_export.py [--shots]
"""
import base64, http.server, json, os, shutil, struct, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT = 4893 + OFF
MOCK_PORT = 4894 + OFF
BASE = f"http://localhost:{PORT}"
MOCK = f"http://127.0.0.1:{MOCK_PORT}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
errors = []

DEVICE_TOKEN = "gho_" + "D" * 36
CLI_TOKEN = "gho_" + "C" * 36
PASTE_TOKEN = "ghp_" + "P" * 36
LOGINS = {DEVICE_TOKEN: "orion-gh", CLI_TOKEN: "cli-user", PASTE_TOKEN: "paste-user"}
USER_CODE = "WDJB-MJHT"
seen = {"approved": False, "polls": 0, "repos": [], "pushes": [], "device_client": None}


def api(path, method="GET", body=None, token=None, project=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    if project: h["X-Project"] = project
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    st, d = r
    assert st == 200, f"{what}: {st} {d}"
    return d


def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as r: return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()


def git(*a, cwd=None):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def commit(repo, files, msg):
    for rel, txt in files.items():
        Path(repo, rel).parent.mkdir(parents=True, exist_ok=True); Path(repo, rel).write_text(txt)
    git("-c", "user.email=t@t", "-c", "user.name=T", "add", "-A", cwd=repo)
    git("-c", "user.email=t@t", "-c", "user.name=T", "commit", "-q", "-m", msg, cwd=repo)


def wait_for(fn, what, timeout=15):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = fn()
        if v: return v
        time.sleep(0.2)
    raise AssertionError(f"timed out: {what}")


def shot(page, name):
    if take:
        page.wait_for_timeout(500)
        page.screenshot(path=str(SHOTS / f"export-{name}.png"))


def watch(page, who):
    page.on("pageerror", lambda e: errors.append(f"{who} pageerror: {e}"))


def settings_js(name, token, pid):
    return (f"try {{ if (location.pathname.indexOf('/preview/') !== 0) {{ localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name:'{name}', color:'#F26B1D', onboarded:true, theme:'dark', server:{{url:'{BASE}', token:'{token}'}}, checklist:{{setup:true}}, tour:{{done:true}}}}));"
            f"localStorage.setItem('tribecode.project:{BASE}', '{pid}'); }} }} catch (e) {{}}")


# ---------------- the GitHub mock ----------------
class Mock(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    remotes = None

    def log_message(self, *a): pass

    def body(self):
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            out = b""
            while True:
                n = int(self.rfile.readline().strip() or b"0", 16)
                if n == 0: self.rfile.readline(); break
                out += self.rfile.read(n); self.rfile.readline()
            return out
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def reply(self, status, obj=None, raw=None, ctype="application/json", extra=None):
        data = raw if raw is not None else json.dumps(obj or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers()
        try: self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass

    def bearer(self):
        a = self.headers.get("Authorization", "")
        return a[7:] if a.startswith("Bearer ") else None

    def do_GET(self):
        if self.path.startswith("/git/"): return self.git_http(b"")
        if self.path == "/user":
            t = self.bearer()
            return self.reply(200, {"login": LOGINS[t]}) if t in LOGINS else self.reply(401, {"message": "Bad credentials"})
        if self.path.startswith("/login/device"): return self.reply(200, raw=b"<!doctype html><title>Device activation</title><h1>Enter code</h1>", ctype="text/html")
        return self.reply(404, {"message": "Not Found"})

    def do_POST(self):
        b = self.body()
        if self.path.startswith("/git/"): return self.git_http(b)
        form = dict(urllib.parse.parse_qsl(b.decode())) if b and "json" not in self.headers.get("Content-Type", "") else {}
        if self.path == "/login/device/code":
            seen["device_client"] = form.get("client_id"); seen["scope"] = form.get("scope")
            return self.reply(200, {"device_code": "dc-test-1", "user_code": USER_CODE, "verification_uri": MOCK + "/login/device", "expires_in": 900, "interval": 1})
        if self.path == "/login/oauth/access_token":
            seen["polls"] += 1
            if form.get("device_code") != "dc-test-1": return self.reply(200, {"error": "incorrect_device_code"})
            return self.reply(200, {"access_token": DEVICE_TOKEN, "token_type": "bearer", "scope": "repo,workflow"} if seen["approved"] else {"error": "authorization_pending"})
        if self.path == "/user/repos":
            t = self.bearer()
            if t not in LOGINS: return self.reply(401, {"message": "Bad credentials"})
            name = json.loads(b or b"{}").get("name", "x")
            subprocess.run(["git", "init", "--bare", "-q", "-b", "main", os.path.join(self.remotes, name + ".git")], check=True)
            seen["repos"].append({"name": name, "token": t})
            return self.reply(201, {"clone_url": f"{MOCK}/git/{name}.git", "html_url": f"{MOCK}/{LOGINS[t]}/{name}", "full_name": f"{LOGINS[t]}/{name}", "private": True})
        return self.reply(404, {"message": "Not Found"})

    def git_http(self, body):
        auth = self.headers.get("Authorization", "")
        user = pw = None
        if auth.startswith("Basic "):
            user, _, pw = base64.b64decode(auth[6:]).decode().partition(":")
        if pw not in LOGINS:
            return self.reply(401, {"message": "auth"}, extra={"WWW-Authenticate": 'Basic realm="GitHub"'})
        path, _, qs = self.path[len("/git"):].partition("?")
        if "git-receive-pack" in path or "service=git-receive-pack" in qs: seen["pushes"].append({"user": user, "token": pw, "path": path})
        env = {**os.environ, "GIT_PROJECT_ROOT": self.remotes, "GIT_HTTP_EXPORT_ALL": "1", "REMOTE_USER": user or "x", "REQUEST_METHOD": self.command, "PATH_INFO": path,
               "QUERY_STRING": qs, "CONTENT_TYPE": self.headers.get("Content-Type", ""), "CONTENT_LENGTH": str(len(body)), "HTTP_CONTENT_ENCODING": self.headers.get("Content-Encoding", ""),
               "GIT_PROTOCOL": self.headers.get("Git-Protocol", "")}
        out = subprocess.run(["git", "http-backend"], input=body, env=env, capture_output=True).stdout
        head, _, data = out.partition(b"\r\n\r\n")
        status, hdrs = 200, {}
        for line in head.decode("latin-1").split("\r\n"):
            k, _, v = line.partition(":")
            if k.lower() == "status": status = int(v.strip().split()[0])
            elif k: hdrs[k] = v.strip()
        ct = hdrs.pop("Content-Type", "application/octet-stream")
        return self.reply(status, raw=data, ctype=ct, extra={k: v for k, v in hdrs.items() if k.lower() not in ("content-length",)})


import urllib.parse  # noqa: E402  (used by the mock)


def png_size(buf):
    assert buf[:8] == b"\x89PNG\r\n\x1a\n", "a PNG"
    return struct.unpack(">II", buf[16:24])


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-export-", dir="/tmp")
    tribe, home, work, remotes, binp = (os.path.join(tmp, d) for d in ("tribe", "home", "work", "remotes", "bin"))
    for d in (tribe, home, work, remotes, binp): os.makedirs(d)
    Mock.remotes = remotes
    mock = http.server.ThreadingHTTPServer(("127.0.0.1", MOCK_PORT), Mock)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    # a fake GitHub CLI: signed in as cli-user
    gh = Path(binp, "gh"); gh.write_text(f"#!/bin/sh\nif [ \"$1 $2\" = \"auth status\" ]; then echo 'github.com'; echo '  Logged in to github.com account cli-user (keyring)'; exit 0; fi\n"
                                         f"if [ \"$1 $2\" = \"auth token\" ]; then echo '{CLI_TOKEN}'; exit 0; fi\necho 'not in this test' >&2; exit 1\n"); gh.chmod(0o755)

    hello = os.path.join(work, "hello-app")
    os.makedirs(hello)
    git("init", "-q", "-b", "main", cwd=hello)
    commit(hello, {"index.html": "<!doctype html><title>Hello</title><h1 id=hi>hello from the app</h1><script src=app.js></script>", "app.js": "console.log(1)",
                   "assets/logo.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>", ".gitignore": "secret.txt\nbuild/\n", "README.md": "# Hello"}, "init")
    git("remote", "add", "origin", "https://github.com/orion/hello-app.git", cwd=hello)
    Path(hello, "secret.txt").write_text("do not export")
    Path(hello, "build").mkdir(); Path(hello, "build", "out.js").write_text("built")
    Path(hello, "notes").mkdir(); Path(hello, "notes", "new.md").write_text("# not committed yet")

    env = {**os.environ, "HOME": home, "USERPROFILE": home, "PATH": binp + os.pathsep + os.environ.get("PATH", ""), "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1",
           "TRIBE_NO_REVEAL": "1", "TRIBE_GITHUB_API": MOCK, "TRIBE_GITHUB_WEB": MOCK, "TRIBE_MIRROR_POLL_MS": "400", "TRIBE_MIRROR_DEBOUNCE_MS": "300",
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1", "GIT_CONFIG_NOSYSTEM": "1"}
    for k in ("TRIBE_GITHUB_CLIENT_ID", "TRIBE_NO_GH", "TRIBE_DESKTOP_DIR", "TRIBE_SHORTCUT_KIND"): env.pop(k, None)
    log = open(os.path.join(tmp, "server.log"), "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Folder Crew"],
                           stdout=log, stderr=subprocess.STDOUT, env=env)
    desk = Path(home, "Desktop"); projects = desk / "TribeCode Projects"
    REMOTE = {"X-Forwarded-For": "203.0.113.9"}
    try:
        for _ in range(80):
            try:
                if api("/health")[0] == 200: break
            except Exception: time.sleep(0.15)

        boot = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap"); orion = boot["token"]
        hp = ok(api("/projects", "POST", {"path": hello, "name": "Hello App"}, token=orion), "hello project")["project"]["id"]
        ok(api(f"/projects/{hp}", "PATCH", {"color": "#38C6B1"}, token=orion, project=hp), "project color")
        other = ok(api("/projects", "POST", {"name": "Side Quest"}, token=orion), "side project")["project"]["id"]
        inv = ok(api("/invites", "POST", {"project": other}, token=orion, project=other), "invite")
        code = inv.get("code") or inv.get("invite", {}).get("code")
        vega = ok(api("/join", "POST", {"code": code, "name": "Vega"}), "vega joins")["token"]

        # ---------------- GitHub: setup ----------------
        g = ok(api("/github", token=orion, project=hp))["github"]
        assert not g["configured"] and g["canConfigure"] and not g["signedIn"], g
        assert g["gh"] and g["gh"]["signedIn"] and g["gh"]["user"] == "cli-user", f"the fake gh is detected on the host: {g['gh']}"
        assert api("/github/config", "PUT", {"clientId": "bad id!"}, token=orion)[0] == 400, "a bad client id is refused"
        assert api("/github/config", "PUT", {"clientId": "Ov23liTestClient01"}, token=vega)[0] == 403, "only the host sets the client id"
        assert ok(api("/github/config", "PUT", {"clientId": "Ov23liTestClient01"}, token=orion))["github"]["configured"]
        assert api("/github/gh", "POST", {}, token=orion, headers=REMOTE)[0] == 403, "the gh CLI login only from the host computer"
        st, d = api("/github/token", "POST", {"token": "ghp_" + "x" * 36}, token=vega)
        assert st == 401 and "did not accept" in d["error"], f"a token GitHub rejects is not saved: {st} {d}"

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
            ctx.add_init_script(settings_js("Orion", orion, hp))
            host = ctx.new_page(); watch(host, "host")
            host.goto(BASE + "/?skipIntro=1")
            host.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % hp, timeout=15000)

            # ---------------- Sign in with GitHub (device flow), end to end ----------------
            host.evaluate("TribeSettings.open()")
            host.wait_for_selector("#set-github [data-gh='start']", timeout=10000)
            assert host.locator("#set-github [data-gh='cli']").is_visible(), "Use my GitHub CLI login is offered on the host"
            with ctx.expect_page(timeout=10000) as popup:
                host.click("#set-github [data-gh='start']")
            gp = popup.value; gp.wait_for_url(MOCK + "/login/device**", timeout=10000)
            assert gp.url.startswith(MOCK + "/login/device"), f"github.com/login/device opened: {gp.url}"
            gp.close()
            host.wait_for_selector("#gh-code", timeout=10000)
            assert host.inner_text("#gh-code").strip() == USER_CODE
            assert seen["device_client"] == "Ov23liTestClient01" and "repo" in seen["scope"], seen
            assert host.evaluate("navigator.clipboard.readText()") == USER_CODE, "the code is on the clipboard"
            shot(host, "github-code")
            time.sleep(1.5); assert seen["polls"] >= 1, "the server polls GitHub"
            seen["approved"] = True
            host.wait_for_function("(document.querySelector('#gh-login')||{}).textContent === '@orion-gh'", timeout=15000)
            shot(host, "github-signed-in")
            raw = urllib.request.urlopen(urllib.request.Request(BASE + "/api/github", headers={"Authorization": "Bearer " + orion}), timeout=10).read().decode()
            assert DEVICE_TOKEN not in raw and "gho_" not in raw, "the token never reaches the browser"
            secret = json.loads(Path(tribe, ".tribe", "secrets").joinpath(next(f for f in os.listdir(Path(tribe, ".tribe", "secrets")) if f.startswith("orion"))).read_text())
            assert secret["githubToken"] == DEVICE_TOKEN and secret["githubLogin"] == "orion-gh" and secret["githubVia"] == "device", secret
            assert DEVICE_TOKEN not in host.evaluate("JSON.stringify(localStorage)"), "no token in browser storage"
            host.evaluate("TribeSettings.close()")

            # ---------------- the new project's GitHub step pushes with that token ----------------
            fl = ok(api("/flow/create", "POST", {"name": "Pixel Push"}, token=orion), "flow create")["flow"]
            fp = fl["project"]
            step = wait_for(lambda: (lambda f: f and f["steps"]["github"]["s"] in ("ok", "fail") and f)(api("/flow", token=orion, project=fp)[1].get("flow")), "github step", 40)
            assert step["steps"]["github"]["s"] == "ok", f"github step: {step['steps']['github']}"
            assert seen["repos"] and seen["repos"][-1]["token"] == DEVICE_TOKEN, f"the repo was created with the signed-in token: {seen['repos']}"
            assert any(x["token"] == DEVICE_TOKEN and x["user"] == "x-access-token" for x in seen["pushes"]), f"the push authenticated with the token: {seen['pushes']}"
            name = seen["repos"][-1]["name"]
            assert git("--git-dir", os.path.join(remotes, name + ".git"), "rev-parse", "--verify", "main"), "main arrived on the mock GitHub"
            assert step["github"]["url"].endswith("/orion-gh/" + name)
            print(f"  github: device flow sign-in, repo {name} created and pushed with the token ({len(seen['pushes'])} authed receive-pack calls)")

            # sign out, then the gh CLI login, then back
            assert not ok(api("/github/signout", "POST", {}, token=orion))["github"]["signedIn"]
            r = ok(api("/github/gh", "POST", {}, token=orion), "gh login")
            assert r["login"] == "cli-user" and r["github"]["via"] == "gh", r
            assert ok(api("/github/token", "POST", {"token": PASTE_TOKEN}, token=vega), "paste")["login"] == "paste-user"
            ok(api("/github/signout", "POST", {}, token=vega))

            # ---------------- Export: refused from elsewhere ----------------
            for path, method, body in [("/export", "POST", {"mode": "files"}), ("/shortcut", "POST", {}), ("/export/mirror", "PUT", {"enabled": True}), ("/export/reveal", "POST", {})]:
                st, d = api(path, method, body, token=orion, project=hp, headers=REMOTE)
                assert st == 403, f"{path} from a tunnel: {st} {d}"
                st, d = api(path, method, body, token=orion, project=hp, headers={"Host": "tribe.example.ts.net"})
                assert st == 403, f"{path} with a public Host: {st} {d}"
            remote_view = ok(api("/export", token=orion, project=hp, headers=REMOTE))
            assert remote_view["local"] is False and remote_view["desktop"] is None, remote_view
            assert api("/applink", "POST", {}, token=vega, project=hp)[0] in (403, 404), "a member of another project gets no app link"
            assert not projects.exists(), "nothing was written"

            # Just the files
            ex = ok(api("/export", "POST", {"mode": "files"}, token=orion, project=hp), "export files")
            assert ex["path"] == str(projects / "Hello App"), ex["path"]
            got = sorted(str(f.relative_to(ex["path"])) for f in Path(ex["path"]).rglob("*") if f.is_file())
            assert got == sorted([".gitignore", "README.md", "TRIBE_CONTEXT.md", "app.js", "assets/logo.svg", "index.html", "notes/new.md"]), f"files export: {got}"
            assert not Path(ex["path"], ".git").exists() and ex["revealed"] is False
            # With history (a second folder: the first is taken)
            eh = ok(api("/export", "POST", {"mode": "history"}, token=orion, project=hp), "export history")
            assert eh["path"] == str(projects / "Hello App 2"), eh["path"]
            assert Path(eh["path"], ".git").is_dir() and Path(eh["path"], "index.html").exists() and not Path(eh["path"], "notes", "new.md").exists()
            assert git("remote", "get-url", "origin", cwd=eh["path"]) == "https://github.com/orion/hello-app.git", "origin is the project's GitHub repo"
            assert git("log", "--format=%s", cwd=eh["path"]) == "init"
            print("  export: files (7, no .git, ignored left out) and history (clone, origin = GitHub)")

            # Keep a copy on my Desktop
            mi = ok(api("/export/mirror", "PUT", {"enabled": True}, token=orion, project=hp), "mirror on")["mirror"]
            assert mi["enabled"] and mi["path"] == str(projects / "Hello App (live copy)") and mi["state"] == "ok", mi
            assert Path(mi["path"], "index.html").exists()
            assert git("remote", "get-url", "origin", cwd=mi["path"]) == "https://github.com/orion/hello-app.git" and git("remote", "get-url", "tribe", cwd=mi["path"]) == hello
            commit(hello, {"level2.html": "<h1>level 2</h1>"}, "level 2")
            wait_for(lambda: Path(mi["path"], "level2.html").exists(), "the Desktop copy follows a new commit", 15)
            Path(mi["path"], "README.md").write_text("my local edit")
            commit(hello, {"level3.html": "<h1>level 3</h1>"}, "level 3")
            m2 = wait_for(lambda: (lambda m: m["state"] == "local-changes" and m)(ok(api("/export", token=orion, project=hp))["mirror"]), "the copy waits on local edits", 15)
            assert not Path(mi["path"], "level3.html").exists() and Path(mi["path"], "README.md").read_text() == "my local edit", "local edits are never touched"
            git("checkout", "--", "README.md", cwd=mi["path"])
            m3 = ok(api("/export/mirror/sync", "POST", {}, token=orion, project=hp))["mirror"]
            assert m3["state"] == "ok" and Path(mi["path"], "level3.html").exists(), m3
            assert not ok(api("/export/mirror", "PUT", {"enabled": False}, token=orion, project=hp))["mirror"]["enabled"]
            assert Path(mi["path"]).exists(), "turning it off keeps the folder"
            print("  desktop copy: follows commits, waits on local edits, catches up, off keeps the folder")

            # ---------------- Desktop shortcut + app link ----------------
            sc = ok(api("/shortcut", "POST", {}, token=orion, project=hp), "shortcut")
            assert sc["kind"] == "desktop" and sc["path"] == str(desk / "Hello App.desktop"), sc
            txt = Path(sc["path"]).read_text()
            assert f"URL=http://localhost:{PORT}/app/" in txt and "Type=Link" in txt and "Name=Hello App" in txt, txt
            icon = next(l[5:] for l in txt.splitlines() if l.startswith("Icon="))
            assert png_size(Path(icon).read_bytes()) == (256, 256), "the shortcut has a 256px icon"
            assert os.stat(sc["path"]).st_mode & 0o111, ".desktop is executable"
            app_url = sc["url"]; key = app_url.rstrip("/").split("/")[-1]
            l1 = ok(api("/applink", "POST", {}, token=orion, project=hp)); l2 = ok(api("/applink", "POST", {}, token=orion, project=hp))
            assert l1["key"] == l2["key"] == key, "the app link is stable (same as the shortcut's)"
            st, hd, html = get(app_url); html = html.decode()
            assert st == 200 and f"/preview/{hp}/pv1." in html and 'sandbox="allow-scripts' in html and orion not in html, "launcher: a fresh sandboxed preview, no member token"
            assert "manifest.webmanifest" in html and "apple-touch-icon" in html and "default-src 'none'" in hd.get("Content-Security-Policy", "")
            src = html.split('id="app" src="')[1].split('"')[0]
            st, _, page = get(BASE + src.replace("&amp;", "&"))
            assert st == 200 and b"hello from the app" in page, "the launcher's iframe shows the live app"
            st, _, man = get(app_url + "manifest.webmanifest"); man = json.loads(man)
            assert man["name"] == "Hello App" and man["start_url"] == f"/app/{key}/" and man["scope"] == f"/app/{key}/" and man["theme_color"] == "#38C6B1", man
            assert man["display"] in ("fullscreen", "standalone") and {"192x192", "512x512"} <= {i["sizes"] for i in man["icons"]}, man["icons"]
            st, hd, ic = get(app_url + "icon-192.png")
            assert st == 200 and png_size(ic) == (192, 192) and hd.get("Content-Type") == "image/png"
            # every shortcut format
            fmt = subprocess.run(["node", "-e", "const e=require(%r);for(const k of ['url','webloc','desktop'])console.log(JSON.stringify(e.shortcutFile(k,{name:'Hello App',url:'http://localhost:1/app/k/',icon:'C:/i.ico'})))" % str(ROOT / "server" / "export.js")],
                                 capture_output=True, text=True, check=True).stdout.splitlines()
            win, mac, lin = (json.loads(x) for x in fmt)
            assert win.startswith("[InternetShortcut]\r\nURL=http://localhost:1/app/k/\r\n") and "IconFile=C:/i.ico" in win
            assert "<key>URL</key>" in mac and "<string>http://localhost:1/app/k/</string>" in mac and lin.startswith("[Desktop Entry]")
            # turning it off: the old address stops, the next one is new
            ok(api("/applink", "DELETE", token=orion, project=hp))
            st, _, body = get(app_url); assert st == 404 and b"turned off" in body, "a turned-off app link stops working"
            l3 = ok(api("/applink", "POST", {}, token=orion, project=hp)); assert l3["key"] != key, "a new link after turning it off"
            st, _, _ = get(f"{BASE}/app/{'A' * 32}/"); assert st == 404
            print("  shortcut + app link: .desktop with icon, stable key, manifest, launcher, revocable")

            # ---------------- desktop UI: preview pane button + Folder sheet ----------------
            host.reload(); host.wait_for_function("window.TribeClient && TribeClient.connected()", timeout=15000)
            host.evaluate("TribePreview.open()")
            host.wait_for_selector("#pvw [data-act='home']", timeout=10000)
            host.click("#pvw [data-act='home']")
            host.wait_for_selector("#fld-modal:not(.hidden) #fld-desk", timeout=10000)
            assert host.locator("#fld-modal .fld-qr .qr svg").count() == 1, "a QR for the phone"
            shot(host, "shortcut-sheet")
            os.remove(desk / "Hello App.desktop")
            host.click("#fld-desk")
            wait_for(lambda: (desk / "Hello App.desktop").exists(), "the desktop shortcut from the UI")
            host.evaluate("TribeFolders.close(); TribePreview.close()")
            host.evaluate("TribeApp.show('docs')")
            host.wait_for_selector("#doc-repo-hero .fld-hb-folder:not(.hidden)", timeout=10000)
            host.click("#doc-repo-hero .fld-hb-folder")
            host.wait_for_selector("#fld-modal:not(.hidden) [data-exp='files']", timeout=10000)
            host.wait_for_selector("#fld-modal #fld-gh [data-gh]", timeout=10000)
            shot(host, "folder-sheet")
            host.click("#fld-modal [data-exp='files']")
            host.wait_for_function("document.querySelector('#fld-card').dataset.exported", timeout=15000)
            assert host.evaluate("document.querySelector('#fld-card').dataset.exported") == str(projects / "Hello App 3")
            host.evaluate("TribeFolders.close()")

            # ---------------- phone 390px: Add to Home Screen sheet ----------------
            ph = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=IPHONE_UA)
            ph.add_init_script(settings_js("Orion", orion, hp))
            phone = ph.new_page(); watch(phone, "phone")
            phone.goto(BASE + "/?skipIntro=1")
            phone.wait_for_function("window.TribeClient && TribeClient.connected() && TribeClient.project() === %r" % hp, timeout=15000)
            phone.click('#tabbar [data-nav="docs"]')
            phone.wait_for_selector("#m2-repo-hero .fld-hb-home", timeout=10000)
            assert phone.locator("#m2-repo-hero .fld-hb-folder").is_hidden(), "no Folder button on a phone"
            phone.locator("#m2-repo-hero .fld-hb-home").scroll_into_view_if_needed()
            phone.click("#m2-repo-hero .fld-hb-home")
            phone.wait_for_selector("#fld-modal:not(.hidden) .fld-steps li", timeout=10000)
            steps = phone.inner_text("#fld-modal .fld-steps")
            assert "Share" in steps and "Add to Home Screen" in steps, steps
            href = phone.get_attribute("#fld-open", "href")
            assert "/app/" in href and phone.locator("#fld-desk").count() == 0, href
            assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "no horizontal overflow"
            phone.wait_for_timeout(500)   # the sheet's rise animation
            box = phone.evaluate("(() => { const r = document.querySelector('#fld-card').getBoundingClientRect(); return [r.left, r.right, r.bottom]; })()")
            assert box[0] >= 0 and box[1] <= 391 and box[2] <= 845, f"the sheet fits the phone: {box}"
            shot(phone, "phone-sheet")
            # the launcher itself on the phone: full screen app + the Add to Home Screen tip
            phone.goto(href)
            phone.wait_for_selector("#tip:not([hidden])", timeout=10000)
            assert "Add to Home Screen" in phone.inner_text("#tip")
            phone.frame_locator("#app").locator("#hi").wait_for(timeout=10000)
            fb = phone.evaluate("(() => { const r = document.querySelector('#app').getBoundingClientRect(); return [r.width, r.height]; })()")
            assert fb[0] >= 389 and fb[1] >= 800, f"the app fills the screen: {fb}"
            shot(phone, "phone-launcher")
            b.close()

        assert not errors, "\n".join(errors)
        print("e2e_export: OK")
    finally:
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()
        mock.shutdown()
        if os.environ.get("KEEP"): print("kept", tmp)
        else: shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    try: main()
    except AssertionError as e:
        print("FAIL:", e)
        log = Path(tempfile.gettempdir())
        sys.exit(1)
