"""Work Phase 2 (feat/build-feeds, server/workfeed.js + workfetch.js, app/ui/workfeeds.js): two local tribes follow each
other's signed gig feeds.
  - a feed is members-only until the host opens it; an open feed needs no sign-in
  - follow by address + key fingerprint (a wrong fingerprint, a private address, plain http to another host: refused)
  - the other tribe's public gigs show in Gigs › Public with the tribe named; unsharing removes them on the next pull
  - Request: a note and a contact ride in this tribe's feed; the other tribe sees it only once it follows back; the
    person gets a message to copy, and the sheet says what crosses tribes
  - hosts: pause, block, remove, hide a gig; builders can't manage
--shots writes docs/screenshots/gigs-public-feeds.png.
Usage: python3 app/test/e2e_work_feeds.py [--shots]
"""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PA, PB = 6490 + OFF, 6491 + OFF
A, B = f"http://localhost:{PA}", f"http://localhost:{PB}"
SHOTS = ROOT / "docs" / "screenshots"
take = "--shots" in sys.argv
errors = []


def api(base, path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(base + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


def wait(fn, what, t=30):
    end = time.time() + t
    while time.time() < end:
        try: v = fn()
        except Exception: v = None
        if v: return v
        time.sleep(0.3)
    raise AssertionError("timed out: " + what)


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-feeds-", dir="/tmp"))
    def start(port, name):
        env = {**os.environ, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "NO_PROXY": "127.0.0.1,localhost", "TRIBE_FEED_ALLOW_LOCAL": "1", "TRIBE_PUBLIC_URL": f"http://localhost:{port}", "TRIBE_PUBLIC_GIGS_URL": "http://localhost:9/none.json"}
        return subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(port), "--dir", str(tmp / name), "--ollama", "http://localhost:9"], stdout=open(tmp / f"{name}.log", "w"), stderr=subprocess.STDOUT, env=env)
    sa, sb = start(PA, "otters"), start(PB, "bears")
    try:
        wait(lambda: api(A, "/health")[0] == 200 and api(B, "/health")[0] == 200, "servers")
        ha = ok(api(A, "/bootstrap", "POST", {"name": "Orion", "tribe": "Otters"}))["token"]
        hb = ok(api(B, "/bootstrap", "POST", {"name": "Bea", "tribe": "Bears"}))["token"]
        inv = ok(api(B, "/invites", "POST", {"role": "builder", "maxUses": 1}, token=hb))["invite"]["code"]
        maya = ok(api(B, "/join", "POST", {"code": inv, "name": "Maya"}))["token"]
        def gig(base, tok, title, desc):
            g = ok(api(base, "/talent/gigs", "POST", {"title": title, "kind": "task", "description": desc, "skills": ["pixel art"], "hours": 4}, token=tok), "gig")["gig"]
            ok(api(base, f"/talent/gigs/{g['id']}/share", "POST", {"contact": "@orion on Discord"}, token=tok), "share"); return g["id"]
        g1 = gig(A, ha, "Pixel artist for a cozy game", "Eight sprites for the title screen.")
        g2 = gig(A, ha, "Sound for a title screen", "A ten second loop.")
        adminA = ok(api(A, "/work/admin", token=ha)); fpA, urlA = adminA["fingerprint"], adminA["url"]
        assert urlA == A + "/api/work/feed.json" and adminA["publish"] == "members", adminA
        assert api(B, "/work/admin", token=maya)[0] == 403, "builders don't manage feeds"

        # ---------- members-only until the host opens it ----------
        assert api(A, "/work/feed.json")[0] == 401
        st, d = api(B, "/work/subscriptions", "POST", {"url": urlA, "fingerprint": fpA}, token=hb); assert st == 502 and "401" in d["error"], (st, d)
        assert api(A, "/work/settings", "PUT", {"publish": "open"}, token=None)[0] == 401
        ok(api(A, "/work/settings", "PUT", {"publish": "open"}, token=ha))
        feed = ok(api(A, "/work/feed.json"), "open feed, no sign-in"); assert len(feed["gigs"]) == 2 and feed["tribe"]["name"] == "Otters", feed
        assert "requests" not in feed and all(set(g) <= {"id", "title", "kind", "seatKind", "description", "skills", "hours", "pay", "contact", "posted"} for g in feed["gigs"])

        # ---------- follow by address + fingerprint; the careful fetch refuses the rest ----------
        for body, want in (({"url": urlA, "fingerprint": "0000-0000-0000-0000"}, "different key"), ({"url": urlA}, "fingerprint"), ({"url": "https://10.0.0.1/feed.json", "fingerprint": fpA}, "private or local"),
                           ({"url": "https://169.254.169.254/latest/meta-data/", "fingerprint": fpA}, "private or local"), ({"url": "http://example.com/feed.json", "fingerprint": fpA}, "https"),
                           ({"url": f"http://127.0.0.1:{PA}/api/health", "fingerprint": fpA}, "feed")):
            st, d = api(B, "/work/subscriptions", "POST", body, token=hb); assert st == 400 and want in d["error"], (body, st, d)
        assert api(B, "/work/subscriptions", "POST", {"url": urlA, "fingerprint": fpA}, token=maya)[0] == 403
        sub = ok(api(B, "/work/subscriptions", "POST", {"url": urlA, "fingerprint": fpA}, token=hb), "follow")["subscription"]
        assert sub["name"] == "Otters" and sub["fingerprint"] == fpA, sub
        imp = ok(api(B, "/work/imported", token=maya)); assert sorted(g["title"] for g in imp["gigs"]) == ["Pixel artist for a cozy game", "Sound for a title screen"] and not imp["canManage"], imp
        assert all(g["tribe"] == "Otters" and g["from"] == fpA and g["remote"] for g in imp["gigs"])
        assert (tmp / "bears" / ".tribe" / "work" / "feeds" / f"{sub['key']}.json").exists(), "stored on disk"

        # ---------- unshare on A: gone from B on the next pull ----------
        ok(api(A, f"/talent/gigs/{g2}/unshare", "POST", {}, token=ha))
        r = ok(api(B, "/work/fetch", "POST", {}, token=hb))["results"]; assert r[0].get("stored") and r[0]["gigs"] == 1, r
        assert [g["title"] for g in ok(api(B, "/work/imported", token=maya))["gigs"]] == ["Pixel artist for a cozy game"]
        assert api(B, "/work/fetch", "POST", {}, token=maya)[0] == 403
        g3 = gig(A, ha, "Playtesters this weekend", "Thirty minutes, tell us where you got stuck.")
        ok(api(B, "/work/fetch", "POST", {}, token=hb))

        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            def page(base, name, token):
                c = b.new_context(viewport={"width": 1320, "height": 900}); c.grant_permissions(["clipboard-read", "clipboard-write"], origin=base)
                c.add_init_script(f"if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({{name: '{name}', onboarded: true, tour: {{done: true}}, server: {{url: '{base}', token: '{token}'}}}})); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({{flint:1,brain:1,ai:1}}))")
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
                pg.goto(base + "/?skipIntro=1", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeTalent && window.TribeWorkFeeds", timeout=30000)
                return pg
            def public(pg):
                pg.evaluate("TribeTalent.open('gigs')"); pg.wait_for_selector("#view-work [data-where=public]", timeout=15000); pg.click("#view-work [data-where=public]")

            # ---------- Maya (a builder on Bears): the Otters' gigs in Gigs › Public, and Request ----------
            mp = page(B, "Maya", maya); public(mp)
            mp.wait_for_selector("#view-work .wf-gig", timeout=15000)
            cards = mp.eval_on_selector_all("#view-work .wf-gig", "els => els.map(e => [e.querySelector('h3').textContent, e.querySelector('.wf-from').textContent, e.querySelector('.wf-from').title])")
            assert sorted(c[0] for c in cards) == ["Pixel artist for a cozy game", "Playtesters this weekend"] and all(c[1] == "Otters" and fpA in c[2] for c in cards), cards
            assert "From Otters" in mp.inner_text("#view-work .wf-bar") and mp.locator("#wf-manage").count() == 0 and mp.locator("[data-wf-hide]").count() == 0, "a builder sees no host controls"
            mp.click("#view-work .wf-gig:has-text('Pixel artist') [data-wf-req]"); mp.wait_for_selector("#wf-rf")
            honest = mp.inner_text("#wf-r-honest")
            assert "another tribe on its own server" in honest and "only if they follow this tribe's feed" in honest and "Nothing else about you leaves" in honest, honest
            mp.fill("#wf-r-note", "I draw pixel cats."); mp.fill("#wf-r-contact", "maya@example.com"); mp.click("#wf-r-go")
            mp.wait_for_selector("#wf-sent"); msg = mp.input_value("#wf-r-msg")
            assert "Pixel artist for a cozy game" in msg and "maya@example.com" in msg and "Maya" in msg and "Bears" in msg, msg
            assert "members-only" in mp.inner_text("#wf-sent"), "Bears' feed is not open: said plainly"
            mp.click("#wf-r-copy"); assert mp.evaluate("navigator.clipboard.readText()") == msg
            mp.click("#wf-sent [data-x2]")
            assert len(ok(api(B, "/work/requests", token=maya))["sent"]) == 1
            # A can't see it: Bears' feed is members-only and A doesn't follow it
            assert ok(api(A, "/work/requests", token=ha))["received"] == []
            assert api(B, "/work/feed.json")[0] == 401

            # ---------- Bea (host of Bears): the Feeds sheet ----------
            bp = page(B, "Bea", hb); public(bp); bp.wait_for_selector("#view-work .wf-gig")
            bp.click("#wf-manage"); bp.wait_for_selector(".wf-manage")
            txt = bp.inner_text(".wf-manage")
            assert "Otters" in txt and "Following" in txt and fpA in txt and "2 gigs" in txt and "Members only" in txt, txt
            bp.click("[data-wf-publish=open]"); bp.wait_for_function("document.querySelector('#wf-pub-note') && document.querySelector('#wf-pub-note').textContent.startsWith('Open:')", timeout=10000)
            feedB = ok(api(B, "/work/feed.json"), "Bears open"); assert len(feedB["requests"]) == 1 and feedB["requests"][0]["contact"] == "maya@example.com" and "by" not in feedB["requests"][0], feedB
            fpB = bp.input_value("#wf-fp"); assert bp.input_value("#wf-url") == B + "/api/work/feed.json"
            # a wrong fingerprint in the form: said in place, nothing added
            bp.fill("#wf-add-url", urlA); bp.fill("#wf-add-fp", "1111-2222-3333-4444"); bp.click("#wf-add-go")
            bp.wait_for_selector("#wf-add-err"); assert "already" in bp.inner_text("#wf-add-err") or "different key" in bp.inner_text("#wf-add-err")
            if take: bp.wait_for_timeout(400); bp.screenshot(path=str(SHOTS / "gigs-public-feeds-manage.png"))
            bp.click("#tl-sheet [data-x]")
            # hide one gig for the tribe
            bp.click("#view-work .wf-gig:has-text('Playtesters') [data-wf-hide]")
            bp.wait_for_function("document.querySelectorAll('#view-work .wf-gig').length === 1", timeout=10000)
            mp.reload(); mp.wait_for_function("window.TribeClient && TribeClient.connected() && window.TribeTalent", timeout=30000); public(mp); mp.wait_for_selector("#view-work .wf-gig")
            assert mp.locator("#view-work .wf-gig").count() == 1, "hidden for everyone in the tribe"
            st, d = api(B, "/work/hide", "POST", {"key": sub["key"], "gig": [g["id"] for g in feed["gigs"]][0]}, token=maya); assert st == 403
            hid = ok(api(B, "/work/admin", token=hb))["hidden"]; ok(api(B, "/work/hide", "POST", {"key": sub["key"], "gig": hid[0].split(":")[1], "hidden": False}, token=hb))
            public(bp); bp.wait_for_function("document.querySelectorAll('#view-work .wf-gig').length === 2", timeout=10000)
            if take: bp.wait_for_timeout(500); bp.screenshot(path=str(SHOTS / "gigs-public-feeds.png"))

            # ---------- Otters follow back: now they see Maya's request ----------
            subB = ok(api(A, "/work/subscriptions", "POST", {"url": B + "/api/work/feed.json", "fingerprint": fpB}, token=ha), "follow back")["subscription"]
            rec = ok(api(A, "/work/requests", token=ha))["received"]
            assert len(rec) == 1 and rec[0]["contact"] == "maya@example.com" and rec[0]["tribe"] == "Bears" and rec[0]["from"] == "Maya" and rec[0]["title"] == "Pixel artist for a cozy game", rec
            ap = page(A, "Orion", ha); public(ap); ap.wait_for_selector("#wf-manage", timeout=15000); ap.click("#wf-manage"); ap.wait_for_selector(".wf-manage")
            assert "requests from other tribes (1)" in ap.inner_text(".wf-manage").lower() and "maya@example.com" in ap.inner_text(".wf-manage")

            # ---------- pause, block, remove ----------
            bp.click("#wf-manage"); bp.wait_for_selector(".wf-manage [data-wf-pause]"); bp.click(".wf-manage [data-wf-pause='1']")
            bp.wait_for_selector(".wf-manage [data-wf-pause='0']", timeout=10000); assert "Paused" in bp.inner_text(".wf-manage")
            g4 = gig(A, ha, "A fourth gig", "Posted while Bears paused.")
            r = ok(api(B, "/work/fetch", "POST", {}, token=hb))["results"]; assert r[0]["skipped"] == "paused", r
            assert len(ok(api(B, "/work/imported", token=maya))["gigs"]) == 2, "paused: nothing new arrives, what was stored stays"
            bp.click(".wf-manage [data-wf-pause='0']"); bp.wait_for_selector(".wf-manage [data-wf-pause='1']", timeout=10000)
            ok(api(B, "/work/fetch", "POST", {}, token=hb)); assert len(ok(api(B, "/work/imported", token=maya))["gigs"]) == 3
            bp.click(".wf-manage [data-wf-block='1']"); bp.wait_for_selector(".wf-manage [data-wf-block='0']", timeout=10000)
            assert "Blocked" in bp.inner_text(".wf-manage") and ok(api(B, "/work/imported", token=maya))["gigs"] == []
            assert not (tmp / "bears" / ".tribe" / "work" / "feeds" / f"{sub['key']}.json").exists(), "a blocked source's stored gigs are deleted"
            r = ok(api(B, "/work/fetch", "POST", {}, token=hb))["results"]; assert r[0]["skipped"] == "blocked", r
            assert api(B, "/work/import", "POST", {"feed": ok(api(A, "/work/feed.json"))}, token=hb)[0] == 403
            bp.click("#tl-sheet [data-x]"); public(bp); bp.wait_for_selector("#wk-empty-public", timeout=10000)
            assert api(B, f"/work/subscriptions/{sub['id']}", "DELETE", token=maya)[0] == 403
            ok(api(B, f"/work/subscriptions/{sub['id']}", "DELETE", token=hb)); assert ok(api(B, "/work/admin", token=hb))["subscriptions"] == []
            b.close()
        assert not [e for e in errors if "ResizeObserver" not in e], errors
        print("ok e2e_work_feeds")
    finally:
        sa.terminate(); sb.terminate()


if __name__ == "__main__":
    main()
