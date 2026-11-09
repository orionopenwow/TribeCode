"""Start fresh (v0.22): the host, on this computer, moves the whole tribe into a backup folder; the server stops; when it
starts again the tribe is empty, the next local person becomes host, and an admin sign-in link is shown once.
Guests and others can't do it, and the confirm phrase is required."""
import json, os, subprocess, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 5330 + int(os.environ.get("TRIBE_PORT_OFFSET", "0")); BASE = f"http://localhost:{PORT}"

def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=20) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

def start(tmp, env):
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "a"), stderr=subprocess.STDOUT, env=env)
    for _ in range(80):
        try:
            if api("/health")[0] == 200: return srv
        except Exception: pass
        time.sleep(0.25)
    raise AssertionError("server did not start")

def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-fr-", dir="/tmp"))
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = start(tmp, env)
    try:
        host = api("/bootstrap", "POST", {"name": "Camp"})[1]["token"]
        inv = api("/invites", "POST", {}, token=host)[1]["invite"]
        guest = api("/join", "POST", {"code": inv["code"], "name": "Riley"})[1]["token"]
        api("/chat/general", "POST", {"text": "old message"}, token=host)
        assert api("/host/fresh-start", "POST", {"confirm": "START FRESH"}, token=guest)[0] == 403
        assert api("/host/fresh-start", "POST", {"confirm": "yes"}, token=host)[0] == 400
        st, r = api("/host/fresh-start", "POST", {"confirm": "START FRESH"}, token=host)
        assert st == 200 and "backup" in r, r
        srv.wait(timeout=10)   # it stops so the app can start an empty tribe
        backup = Path(r["backup"]); assert (backup / ".tribe" / "members.json").exists(), list(backup.iterdir())
        assert not any((tmp / "tribe").iterdir()), "the tribe folder is empty"
        srv = start(tmp, env)
        assert api("/members", token=host)[0] == 401, "old keys are gone"
        st, b = api("/bootstrap", "POST", {"name": "Camp"}); assert st == 200, b
        new = b["token"]; ms = api("/members", token=new)[1]["members"]
        assert [m["name"] for m in ms if m.get("role") != "agent"] == ["Camp"], ms
        assert not any("old message" in (m.get("text") or "") for m in api("/chat/general", token=new)[1]["messages"])
        st, link = api("/device-link", "POST", {"label": "Admin sign-in", "days": 365}, token=new); assert st == 200 and link["path"].startswith("/m/"), link
        print("ok e2e_fresh")
    finally:
        try: srv.terminate()
        except Exception: pass

if __name__ == "__main__":
    main()
