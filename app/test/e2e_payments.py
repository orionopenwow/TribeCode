"""End-to-end: feat/auth3-pay, real payments with Stripe (docs/PREMIUM.md › Payments, docs/LAUNCH.md › Money).

A local fake Stripe answers the two calls the server makes (Checkout Sessions, Billing Portal sessions) and records
them; this test signs webhooks itself with the webhook secret. The server's Stripe address is only overridable because
TRIBE_TEST=1 (TRIBE_STRIPE_BASE). A fake hosted AI answers the credit-priced questions.

Checks
  hidden    the default (no TRIBE_PAYMENTS, the host's setting off), even with Stripe keys saved: checkout, the portal and
            history answer 404 payments-hidden, the webhook 404, the plans pop-out is information ("Paid plans are
            coming", no buttons), no Billing or Payments section in Settings; plans by hand and the 402s are unchanged.
  off       opened, but with no Stripe keys: checkout and the portal answer "payments-off", the webhook 503, PUT /api/premium on the
            host computer still works, and the plans pop-out says the host hasn't turned on payments.
  settings  host-only, on the host computer; keys are sealed in a 0600 file and never sent back.
  checkout  a credit pack is a one-time session and a plan a subscription, with the right price, quantity and the
            scope (the tribe, or the buyer's account) in the metadata; the key travels as a Bearer header.
  webhook   a signed event tops up credits / upgrades the plan; a bad signature, a stale timestamp, a changed body and
            a missing header are refused; a duplicate event id and a second event for the same session change nothing;
            another TribeCode's event is ignored.
  plans     per account where an account exists (Ava's plan is hers; the friend without an account stays on the
            tribe's); updated, payment failed (grace, then free; a payment in time keeps the plan), canceled.
  refund    takes the pack's credits back, never below zero.
  portal    "Manage billing" gets Stripe's portal link for the right customer.
  credits   priced by size: a small answer costs 1, a big one more, and what was held but not used comes back.
  UI        the plans pop-out's buttons open Checkout; Settings › Plan & AI shows receipts; Flint opens the plans once
            on a 402 for credits, then falls back quietly. Screenshot: docs/screenshots/checkout.png.
Usage: python app/test/e2e_payments.py   (TRIBE_PORT_OFFSET to run beside other suites)
"""
import hashlib, hmac, http.server, json, os, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get('TRIBE_PORT_OFFSET', '0'))
PORT, STRIPE_PORT, AI_PORT = 7060 + OFF, 7061 + OFF, 7062 + OFF
BASE = f"http://localhost:{PORT}"
FAKE = f"http://127.0.0.1:{STRIPE_PORT}"
SHOTS = ROOT / "docs" / "screenshots"
SK = "sk_test_" + "k3Y" * 10
WH = "whsec_" + "w4H" * 10
PRICES = {"hosted": "price_hosted001", "tribe": "price_tribe001", "credits-10": "price_c10001", "credits-25": "price_c25001", "credits-50": "price_c50001"}
GRACE_MS = 2500
CALLS, AI_CALLS, errors = [], [], []
state = {"fail": False, "n": 0}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class FakeStripe(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def reply(self, status, obj, ctype="application/json"):
        data = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
        self.send_response(status); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):   # the page a browser lands on
        self.reply(200, b"<!doctype html><title>Fake Stripe</title><h1 id='fake'>Fake Stripe page</h1>", "text/html")

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); form = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
        CALLS.append({"path": self.path, "form": form, "auth": self.headers.get("Authorization"), "idem": self.headers.get("Idempotency-Key"), "ctype": self.headers.get("Content-Type")})
        if self.headers.get("Authorization") != "Bearer " + SK: return self.reply(401, {"error": {"message": "Invalid API Key provided"}})
        if state["fail"]: return self.reply(402, {"error": {"message": f"Declined for {SK} and {WH}", "code": "card_declined"}})
        state["n"] += 1
        if self.path == "/v1/checkout/sessions": return self.reply(200, {"id": f"cs_test_{state['n']}", "object": "checkout.session", "url": f"{FAKE}/pay/cs_test_{state['n']}"})
        if self.path == "/v1/billing_portal/sessions": return self.reply(200, {"id": f"bps_{state['n']}", "url": f"{FAKE}/portal/bps_{state['n']}"})
        self.reply(404, {"error": {"message": "no such route"}})


class FakeAI(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); self.rfile.read(n); AI_CALLS.append(1)
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        self.wfile.write(b'data: {"choices":[{"delta":{"content":"a short answer"}}]}\n\ndata: [DONE]\n\n')


def api(path, method="GET", body=None, token=None, headers=None, raw=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    if token: h["Authorization"] = "Bearer " + token
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=data, headers=h)
    try:
        with opener.open(req, timeout=30) as r: st, out = r.status, r.read()
    except urllib.error.HTTPError as e: st, out = e.code, e.read()
    try: return st, json.loads(out or b"{}")
    except Exception: return st, {"text": out.decode("utf8", "replace")}   # a streamed answer


def ok(r, what=""):
    assert r[0] == 200, f"{what}: {r}"
    return r[1]


evn = [0]


def event(kind, obj, eid=None):
    evn[0] += 1
    return {"id": eid or f"evt_test_{evn[0]}", "object": "event", "type": kind, "data": {"object": obj}}


def hook(ev, secret=WH, t=None, raw=None, header=None):
    body = raw if raw is not None else json.dumps(ev).encode(); t = int(time.time()) if t is None else t
    sig = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return api("/premium/webhook", "POST", raw=body, headers={} if header is False else {"Stripe-Signature": header or f"t={t},v1={sig}"})


def meta(call, prefix="metadata"):
    return {k[len(prefix) + 1:-1]: v for k, v in call["form"].items() if k.startswith(prefix + "[")}


def remote(): return {"X-Forwarded-For": "203.0.113.50"}


def main():
    tmp = tempfile.mkdtemp(prefix="tribe-pay-", dir="/tmp")
    tribe, home = os.path.join(tmp, "tribe"), os.path.join(tmp, "home")
    os.makedirs(tribe); os.makedirs(home)
    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", STRIPE_PORT), FakeStripe), http.server.ThreadingHTTPServer(("127.0.0.1", AI_PORT), FakeAI)]
    for s in servers: threading.Thread(target=s.serve_forever, daemon=True).start()
    env = {**os.environ, "HOME": home, "USERPROFILE": home, "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "TRIBE_NO_GH": "1", "TRIBE_ACCOUNTS": "1",
           "TRIBE_STRIPE_BASE": FAKE, "TRIBE_TEST_GRACE_MS": str(GRACE_MS), "TRIBE_HOSTED_AI_BASE": f"http://127.0.0.1:{AI_PORT}/v1", "TRIBE_HOSTED_AI_KEY": "hosted-test-key",
           "NO_PROXY": "localhost,127.0.0.1", "no_proxy": "localhost,127.0.0.1"}
    for k in list(env):
        if k.startswith("STRIPE_") or k in ("TRIBE_PUBLIC_URL", "TRIBE_OPEN_SIGNUP", "TRIBE_PAYMENTS"): env.pop(k)   # payments start hidden; the host's setting opens them below
    logf = os.path.join(tmp, "server.log"); log = open(logf, "w+")
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", tribe, "--ollama", "http://localhost:9", "--name", "Pay Crew"], stdout=log, stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(150):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.1)
        host = ok(api("/bootstrap", "POST", {"name": "Orion"}), "bootstrap")["token"]
        invite = lambda: ok(api("/invites", "POST", {}, token=host))["invite"]["code"]
        friend = ok(api("/join", "POST", {"code": invite(), "name": "Friend"}))["token"]                      # no account: the tribe's plan
        ava = ok(api("/accounts/signup", "POST", {"username": "Ava", "password": "lantern river 42", "invite": invite()}), "Ava")   # an account: her own plan
        avt, aid = ava["memberToken"], ava["account"]["id"]
        credits = lambda tok: ok(api("/premium", token=tok))["credits"]

        # ---------------- the default: payments are hidden, even with keys ----------------
        def hidden(what):
            v = ok(api("/premium", token=friend)); assert v["payments"] == {"offered": False, "on": False, "items": []}, (what, v)
            for path, m, body in (("/premium/checkout", "POST", {"item": "credits-10"}), ("/premium/portal", "POST", {}), ("/premium/history", "GET", None)):
                st, e = api(path, m, body, token=friend); assert st == 404 and e["code"] == "payments-hidden", (what, path, st, e)
            assert hook(event("checkout.session.completed", {"id": "cs_x", "mode": "payment"}))[0] == 404, what
        hidden("no keys")
        v = ok(api("/premium/admin", "PUT", {"secretKey": SK, "webhookSecret": WH, "prices": PRICES}, token=host)); assert v["enabled"] is False and v["on"] is False and v["hasSecret"], v
        hidden("keys, but not turned on"); assert not CALLS
        assert ok(api("/premium", "PUT", {"addCredits": 2}, token=host))["credits"] == 2 and ok(api("/premium", "PUT", {"addCredits": -2}, token=host))["credits"] == 0, "by hand still works"
        assert api("/docs", "POST", {"title": "Board 0", "body": "x", "source": "template:board-meeting"}, token=friend)[0] == 402, "the plan gate is the same"
        assert api("/premium/admin", "PUT", {"enabled": True}, token=host, headers=remote())[0] == 403 and api("/premium/admin", "PUT", {"enabled": True}, token=friend)[0] == 403
        ok(api("/premium/admin", "PUT", {"secretKey": "", "webhookSecret": "", "enabled": True}, token=host), "the host opens payments (the setting; TRIBE_PAYMENTS=1 does the same)")
        print("  default: hidden even with keys (checkout, portal, history 404, the webhook 404); plans by hand and the 402s unchanged; the host's setting opens it")

        # ---------------- payments shown, but no keys yet ----------------
        v = ok(api("/premium", token=friend)); assert v["payments"]["offered"] is True and v["payments"]["on"] is False and v["scope"] == "tribe" and v["plan"] == "free", v
        assert ok(api("/premium", token=avt))["scope"] == "account"
        st, e = api("/premium/checkout", "POST", {"item": "credits-10"}, token=friend); assert st == 409 and e["code"] == "payments-off" and "hasn't turned on payments" in e["error"], (st, e)
        st, e = api("/premium/portal", "POST", {}, token=friend); assert st == 409 and e["code"] == "payments-off", (st, e)
        assert hook(event("checkout.session.completed", {"id": "cs_x", "mode": "payment"}))[0] == 503, "no webhook secret: nothing to verify against"
        assert ok(api("/premium", "PUT", {"addCredits": 3}, token=host))["credits"] == 3 and credits(friend) == 3, "the host computer still sets plans and credits by hand"
        ok(api("/premium", "PUT", {"addCredits": -3}, token=host)); assert not CALLS
        print("  off: checkout and portal say payments-off, the webhook 503, PUT /api/premium on the host computer keeps working")

        # ---------------- the host's settings ----------------
        conf = {"secretKey": SK, "webhookSecret": WH, "prices": PRICES}
        assert api("/premium/admin", token=friend)[0] == 403 and api("/premium/admin", "PUT", conf, token=friend)[0] == 403
        assert api("/premium/admin", "PUT", conf, token=host, headers=remote())[0] == 403, "the host computer only"
        assert api("/premium/admin", "PUT", {"secretKey": "pk_test_notasecretkey123"}, token=host)[0] == 400
        assert api("/premium/admin", "PUT", {"prices": {"hosted": "prod_notaprice"}}, token=host)[0] == 400
        view = ok(api("/premium/admin", "PUT", conf, token=host), "save")
        assert view["enabled"] and view["on"] and view["mode"] == "test" and view["hasSecret"] and view["hasWebhook"] and view["prices"]["credits-25"]["id"] == PRICES["credits-25"], view
        assert view["webhookUrl"].endswith("/api/premium/webhook") and "charge.refunded" in view["events"]
        assert SK not in json.dumps(view) and WH not in json.dumps(view), "a key is never sent back"
        f = os.path.join(tribe, ".tribe", "stripe.json"); disk = open(f).read()
        assert SK not in disk and WH not in disk and oct(os.stat(f).st_mode & 0o777) == "0o600", "sealed, in a 0600 file"
        v = ok(api("/premium", token=friend)); assert v["payments"]["on"] is True and set(v["payments"]["items"]) == set(PRICES), v
        print("  settings: host-only on the host computer; keys sealed in a 0600 file and never sent back")

        # ---------------- checkout sessions ----------------
        assert api("/premium/checkout", "POST", {"item": "credits-25"})[0] == 401
        assert api("/premium/checkout", "POST", {"item": "yacht"}, token=friend)[0] == 400
        r = ok(api("/premium/checkout", "POST", {"item": "credits-25"}, token=friend), "pack"); assert r["url"].startswith(FAKE + "/pay/cs_test_") and r["mode"] == "payment", r
        c = CALLS[-1]; fm = c["form"]
        assert c["path"] == "/v1/checkout/sessions" and c["auth"] == "Bearer " + SK and c["idem"] and c["ctype"] == "application/x-www-form-urlencoded", c
        assert fm["mode"] == "payment" and fm["line_items[0][price]"] == PRICES["credits-25"] and fm["line_items[0][quantity]"] == "1" and len([k for k in fm if k.startswith("line_items[")]) == 2, fm
        assert fm["success_url"] == BASE + "/?billing=success" and fm["cancel_url"] == BASE + "/?billing=cancel" and fm["customer_creation"] == "always", fm
        pack_md = meta(c); assert pack_md["scope"] == "tribe" and pack_md["item"] == "credits-25" and pack_md["credits"] == "2500" and pack_md["tribecode"].startswith("tc_"), pack_md
        assert meta(c, "payment_intent_data[metadata]")["scope"] == "tribe"
        r = ok(api("/premium/checkout", "POST", {"item": "hosted"}, token=avt), "plan"); assert r["mode"] == "subscription"
        c = CALLS[-1]; fm = c["form"]
        assert fm["mode"] == "subscription" and fm["line_items[0][price]"] == PRICES["hosted"] and fm["line_items[0][quantity]"] == "1" and "customer_creation" not in fm, fm
        plan_md = meta(c); assert plan_md["scope"] == "acct:" + aid and plan_md["account"] == aid and plan_md["item"] == "hosted", plan_md
        assert meta(c, "subscription_data[metadata]") == plan_md
        print("  checkout: one-time session for a pack, subscription for a plan; price, quantity 1, scope and item in the metadata")

        # ---------------- the webhook: signatures ----------------
        pack = {"id": "cs_pack_1", "object": "checkout.session", "mode": "payment", "payment_status": "paid", "customer": "cus_tribe", "payment_intent": "pi_pack_1", "amount_total": 2500, "currency": "usd", "metadata": pack_md}
        ev = event("checkout.session.completed", pack)
        assert hook(ev, secret="whsec_" + "x" * 30)[0] == 400, "a bad signature"
        assert hook(ev, t=int(time.time()) - 900)[0] == 400, "a stale timestamp"
        assert hook(ev, t=int(time.time()) + 900)[0] == 400, "a timestamp from the future"
        assert hook(ev, header=False)[0] == 400 and hook(ev, header="t=1,v1=zz")[0] == 400 and hook(ev, header="v1=" + "a" * 64)[0] == 400
        t = int(time.time()); sig = hmac.new(WH.encode(), f"{t}.".encode() + json.dumps(ev).encode(), hashlib.sha256).hexdigest()
        bigger = json.dumps({**ev, "data": {"object": {**pack, "metadata": {**pack_md, "item": "credits-50"}}}}).encode()
        assert hook(None, raw=bigger, header=f"t={t},v1={sig}")[0] == 400, "a body that changed after signing"
        assert credits(friend) == 0, "nothing was applied"
        # signed: the pack arrives
        r = ok(hook(ev), "signed"); assert r["did"] == "credits +2500", r
        assert credits(friend) == 2500 and credits(host) == 2500
        r = ok(hook(ev)); assert r.get("duplicate") is True and credits(friend) == 2500, "the same event twice changes nothing"
        r = ok(hook(event("checkout.session.async_payment_succeeded", pack))); assert r["did"] == "already applied" and credits(friend) == 2500, r
        r = ok(hook(event("checkout.session.completed", {**pack, "id": "cs_other", "metadata": {**pack_md, "tribecode": "tc_someoneelse"}}))); assert r["did"] == "not ours" and credits(friend) == 2500, r
        r = ok(hook(event("checkout.session.completed", {**pack, "id": "cs_unpaid", "payment_status": "unpaid"}))); assert credits(friend) == 2500, "an unpaid session waits"
        assert ok(hook(event("some.other.event", {"id": "x"})))["did"] == "ignored"
        print("  webhook: bad signature, stale or future timestamp, changed body, missing header refused; signed tops up; duplicates change nothing")

        # ---------------- plans, per account ----------------
        sub = {"id": "cs_plan_1", "object": "checkout.session", "mode": "subscription", "payment_status": "paid", "customer": "cus_ava", "subscription": "sub_1", "amount_total": 600, "currency": "usd", "metadata": plan_md}
        assert api("/docs", "POST", {"title": "Board", "body": "x", "source": "template:board-meeting"}, token=avt)[0] == 402
        ok(hook(event("checkout.session.completed", sub)))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "premium" and v["tier"] == "hosted" and v["scope"] == "account" and v["billing"]["manage"] and v["billing"]["status"] == "active", v
        assert v["credits"] == 2500 and v["pools"] == {"mine": 0, "tribe": 2500}, v
        assert ok(api("/premium", token=friend))["plan"] == "free", "Ava's plan is hers: the tribe stays free"
        assert api("/docs", "POST", {"title": "Board", "body": "x", "source": "template:board-meeting"}, token=avt)[0] == 200
        assert api("/docs", "POST", {"title": "Board 2", "body": "x", "source": "template:board-meeting"}, token=friend)[0] == 402
        st, e = api("/premium/checkout", "POST", {"item": "tribe"}, token=avt); assert st == 409 and e["code"] == "has-plan", (st, e)
        subobj = lambda **kw: {"id": "sub_1", "object": "subscription", "customer": "cus_ava", "status": "active", "current_period_end": int(time.time()) + 30 * 86400, "cancel_at_period_end": False, "metadata": plan_md, "items": {"data": [{"price": {"id": PRICES["hosted"]}}]}, **kw}
        ok(hook(event("customer.subscription.updated", subobj(items={"data": [{"price": {"id": PRICES["tribe"]}}]}))))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "premium" and v["tier"] == "tribe" and v["billing"]["periodEnd"], v
        # the portal
        r = ok(api("/premium/portal", "POST", {}, token=avt), "portal"); assert r["url"].startswith(FAKE + "/portal/bps_"), r
        c = CALLS[-1]; assert c["path"] == "/v1/billing_portal/sessions" and c["form"] == {"customer": "cus_ava", "return_url": BASE + "/?billing=portal"}, c
        # a failed payment: grace, a payment in time keeps the plan
        inv = {"id": "in_1", "object": "invoice", "customer": "cus_ava", "subscription": "sub_1", "amount_due": 2400, "amount_paid": 0, "currency": "usd", "hosted_invoice_url": "https://invoice.stripe.com/i/acct_1/test_1"}
        ok(hook(event("invoice.payment_failed", inv)))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "premium" and v["billing"]["graceUntil"] and v["billing"]["status"] == "past_due", v
        ok(hook(event("invoice.paid", {**inv, "amount_paid": 2400})))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "premium" and v["billing"]["graceUntil"] is None and v["billing"]["status"] == "active", v
        time.sleep(GRACE_MS / 1000 + 0.4); assert ok(api("/premium", token=avt))["plan"] == "premium", "paid in time: the plan stays"
        # a failed payment nobody fixes: free after the grace
        ok(hook(event("invoice.payment_failed", {**inv, "id": "in_2"})))
        assert ok(api("/premium", token=avt))["plan"] == "premium", "still on during the grace"
        time.sleep(GRACE_MS / 1000 + 0.4)
        v = ok(api("/premium", token=avt)); assert v["plan"] == "free" and v["billing"]["status"] == "lapsed" and v["billing"]["graceUntil"] is None, v
        assert api("/docs", "POST", {"title": "Board 3", "body": "x", "source": "template:board-meeting"}, token=avt)[0] == 402
        # a new plan, then canceled
        ok(hook(event("checkout.session.completed", {**sub, "id": "cs_plan_2", "subscription": "sub_2"})))
        assert ok(api("/premium", token=avt))["plan"] == "premium"
        ok(hook(event("customer.subscription.updated", subobj(id="sub_2", cancel_at_period_end=True))))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "premium" and v["billing"]["cancelAt"], "cancel at the end of the period: still on, with the date"
        ok(hook(event("customer.subscription.deleted", subobj(id="sub_2", status="canceled"))))
        v = ok(api("/premium", token=avt)); assert v["plan"] == "free" and v["billing"]["status"] == "canceled", v
        h = ok(api("/premium/history", token=avt)); kinds = [r["kind"] for r in h["receipts"]]
        assert h["scope"] == "account" and kinds.count("plan") == 2 and "invoice" in kinds and kinds.count("failed") == 2 and "canceled" in kinds, kinds
        assert any(r.get("url", "").startswith("https://invoice.stripe.com/") for r in h["receipts"]) and "tribe" not in h, h
        print("  plans: per account; updated; failed payment -> grace -> free (a payment in time keeps it); canceled; portal link; receipts")

        # ---------------- a refund: never below zero ----------------
        ok(api("/premium", "PUT", {"addCredits": -2400}, token=host)); assert credits(friend) == 100, "most of the pack was used"
        ch = {"id": "ch_1", "object": "charge", "payment_intent": "pi_pack_1", "amount": 2500, "amount_refunded": 1000, "currency": "usd", "receipt_url": "https://pay.stripe.com/receipts/x"}
        r = ok(hook(event("charge.refunded", ch))); assert r["did"] == "refund -100" and credits(friend) == 0, (r, credits(friend))
        r = ok(hook(event("charge.refunded", {**ch, "amount_refunded": 2500}))); assert credits(friend) == 0, "the rest of the refund takes what is left: nothing"
        assert ok(hook(event("charge.refunded", {**ch, "payment_intent": "pi_unknown"})))["did"] == "no pack for that charge"
        h = ok(api("/premium/history", token=host)); kinds = [r["kind"] for r in h["receipts"]]; assert kinds.count("credits") == 1 and kinds.count("refund") == 2, kinds
        assert ok(api("/premium/history", token=friend))["receipts"] == [], "the tribe's receipts are for the host and admins"
        raw = json.load(open(os.path.join(tribe, ".tribe", "premium.json"))); assert raw["credits"] == 0 and all(a["credits"] >= 0 for a in raw["accounts"].values()), raw
        print("  refund: the pack's credits come back out, never below zero; receipts for the host, not for every member")

        # ---------------- Stripe says no: a calm answer, no secrets in it or in the log ----------------
        state["fail"] = True
        st, e = api("/premium/checkout", "POST", {"item": "credits-10"}, token=friend); assert st == 502 and SK not in json.dumps(e) and WH not in json.dumps(e), (st, e)
        state["fail"] = False

        # ---------------- credits by size ----------------
        v = ok(api("/premium", token=host)); table = v["gated"]["aiCostTable"]; assert table[0] == {"upToTokens": 2000, "credits": 1} and table[-1]["upToTokens"] is None and [r["credits"] for r in table] == [1, 3, 10, 25], table
        ok(api("/llm", "PUT", {"provider": "hosted"}, token=host), "hosted AI"); ok(api("/premium", "PUT", {"addCredits": 20}, token=host))
        assert api("/flint/ask", "POST", {"text": "a small question"}, token=friend)[0] == 200 and credits(friend) == 19, "a small answer: 1 credit"
        r = api("/flint/make", "POST", {"kind": "doc", "ask": "tighten this", "title": "Notes", "body": "word " * 5600}, token=friend); assert r[0] == 200, r
        assert credits(friend) == 16, f"a bigger answer costs 3 (10 were held, 7 came back): {credits(friend)}"
        use = ok(api("/premium/history", token=host))["usage"]; assert any(u["n"] == -10 for u in use) and any(u["n"] == 7 and "smaller" in u["why"] for u in use), use
        # Ava's own credits are used before the tribe's pool
        ok(api("/premium", "PUT", {"addCredits": 2, "account": aid}, token=host))
        assert api("/flint/ask", "POST", {"text": "mine first"}, token=avt)[0] == 200
        v = ok(api("/premium", token=avt)); assert v["pools"] == {"mine": 1, "tribe": 16}, v
        print("  credits by size: 1 for a small answer, 3 for a bigger one (the unused hold comes back); your own before the tribe's")

        # =============================== the browser ===============================
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            cx = b.new_context(viewport={"width": 1280, "height": 1000})
            cx.add_init_script("try { localStorage.setItem('tribecode.intro.v1','seen'); if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name:'Orion', color:'#F26B1D', onboarded:true, theme:'dark', server:{url:'%s', token:'%s'}, checklist:{setup:true}, tour:{done:true}})); } catch (e) {}" % (BASE, host))
            pg = cx.new_page(); pg.on("pageerror", lambda e: errors.append(f"host: {e}"))
            go = lambda q="": (pg.goto(BASE + "/?skipIntro=1" + q), pg.wait_for_function("() => window.TribeClient && window.TribeClient.connected() && window.TribePlans && window.TribeBilling", timeout=20000))
            go(); pg.wait_for_function("() => window.TribePremium.payments() === true", timeout=15000)
            # the plans pop-out: real buttons
            pg.evaluate("() => window.TribeSettings.open('ai')"); pg.wait_for_selector("#set-plan-chip", timeout=15000)
            pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop [data-plp-plan='hosted']", timeout=10000)
            txt = pg.inner_text("#plans-pop"); assert "Choose Hosted" in txt and "Choose Tribe" in txt and "AVAILABLE" in txt.upper() and "PLANNED" not in txt.upper() and "Manage billing" in txt, txt
            pg.wait_for_timeout(400); SHOTS.mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(SHOTS / "checkout.png"))
            n0 = len(CALLS)
            pg.click("#plans-pop [data-plp-pack='10']"); pg.wait_for_url(FAKE + "/pay/**", timeout=15000); pg.wait_for_selector("#fake")
            assert CALLS[n0]["form"]["line_items[0][price]"] == PRICES["credits-10"] and CALLS[n0]["form"]["mode"] == "payment"
            go("&billing=success"); pg.wait_for_function("() => [...document.querySelectorAll('.toast')].some(t => /Thank you/.test(t.textContent))", timeout=10000)
            assert "billing=" not in pg.url, "the return marker leaves the address bar"
            pg.evaluate("() => window.TribeSettings.open('ai')"); pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop [data-plp-plan='tribe']")
            pg.click("#plans-pop [data-plp-plan='tribe']"); pg.wait_for_url(FAKE + "/pay/**", timeout=15000)
            assert CALLS[-1]["form"]["mode"] == "subscription" and CALLS[-1]["form"]["line_items[0][price]"] == PRICES["tribe"]
            # Settings › Plan & AI: receipts, the price table, Manage billing
            go(); pg.evaluate("() => window.TribeSettings.open('ai')"); pg.wait_for_selector("#bl-receipts li", timeout=15000)
            assert pg.locator("#bl-receipts li").count() == 3 and "2,500 AI credits" in pg.inner_text("#bl-receipts") and pg.locator("#bl-cost tbody tr").count() == 4
            assert "This tribe" in pg.text_content("#set-billing") and pg.locator("#bl-usage li").count() >= 3
            pg.click("#bl-manage"); pg.wait_for_url(FAKE + "/portal/**", timeout=15000)
            assert CALLS[-1]["form"]["customer"] == "cus_tribe"
            # Settings › Tribe & admin: the host's payment settings (nothing secret in the page)
            go(); pg.evaluate("() => window.TribeSettings.open('admin')"); pg.wait_for_selector("#set-payments", timeout=15000)
            assert "test mode" in pg.text_content("#bl-pay-state") and pg.input_value("#bl-pay-form [data-k='secretKey']") == "" and pg.input_value("#bl-pay-form [data-p='hosted']") == PRICES["hosted"]
            assert SK not in pg.content() and WH not in pg.content()
            print("  UI: Choose Hosted / Tribe and the packs open Checkout; back with a thank-you; receipts, the price table, Manage billing; the host's settings")

            # Flint: a 402 for credits opens the plans once, then falls back quietly
            ok(api("/premium", "PUT", {"addCredits": -16}, token=host)); ok(api("/premium", "PUT", {"addCredits": -1, "account": aid}, token=host)); assert credits(host) == 0
            pg.evaluate("() => window.TribeSettings.close()"); pg.wait_for_selector("#flint #fl-input", state="visible", timeout=15000)
            def ask(text, pg=pg):
                n = pg.locator("#flint .fl-thread .fl-msg.fl").count()
                pg.fill("#flint #fl-input", text); pg.press("#flint #fl-input", "Enter")
                try: pg.wait_for_selector("#aic-yes", timeout=2500); pg.click("#aic-yes")   # the cloud-AI consent, asked once
                except Exception: pass
                try: pg.wait_for_function("n => { const m = document.querySelectorAll('#flint .fl-thread .fl-msg.fl'); return m.length > n && !/^…?$/.test(m[m.length - 1].textContent.trim()); }", arg=n, timeout=20000)
                except Exception: pg.screenshot(path="/tmp/pay-flint.png"); print(pg.evaluate("() => document.querySelector('#flint').innerText.slice(-600)")); raise
                pg.wait_for_timeout(500); return pg.locator("#flint .fl-thread .fl-msg.fl").last.inner_text()
            a1 = ask("imagine a quiet lantern festival by the river in two lines")
            assert "credits have run out" in a1, a1
            pg.wait_for_selector("#plans-pop", timeout=10000)
            pg.keyboard.press("Escape"); pg.wait_for_selector("#plans-pop", state="detached")
            a2_ = ask("imagine the same festival in the rain in two lines")
            pg.wait_for_timeout(800); assert pg.locator("#plans-pop").count() == 0 and "credits have run out" not in a2_, a2_
            print("  Flint: out of credits -> one calm line and the plans, once per session; then the basic answer, quietly")

            # payments off again: the buttons say so and nothing opens
            ok(api("/premium/admin", "PUT", {"secretKey": "", "webhookSecret": ""}, token=host))
            go(); pg.wait_for_function("() => window.TribePremium.payments() === false", timeout=15000)
            pg.evaluate("() => window.TribeSettings.open('ai')"); pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop [data-plp-pack='25']")
            assert "PLANNED" in pg.inner_text("#plans-pop").upper()
            n0 = len(CALLS); pg.click("#plans-pop [data-plp-pack='25']"); pg.wait_for_function("() => { const m = document.querySelector('#plp-msg'); return m && !m.hidden && /hasn't turned on payments/.test(m.textContent); }", timeout=10000)
            pg.click("#plans-pop [data-plp-plan='hosted']"); pg.wait_for_timeout(500)
            assert len(CALLS) == n0 and pg.url.startswith(BASE), "nothing was opened"
            co = pg.evaluate("() => window.TribePremium.checkout('hosted')"); assert co["ok"] is False and co["reason"] == "no-provider", co
            # hidden again (the default), with the keys in place: information only
            ok(api("/premium/admin", "PUT", {"secretKey": SK, "webhookSecret": WH, "enabled": False}, token=host)); hidden("turned off again")
            go(); pg.wait_for_function("() => window.TribePremium.offered() === false", timeout=15000)
            pg.evaluate("() => window.TribeSettings.open('ai')"); pg.click("#set-plan-chip"); pg.wait_for_selector("#plans-pop #plp-coming", timeout=10000)
            txt = pg.inner_text("#plans-pop"); assert "Paid plans are coming" in txt and "$6" in txt and "1,000" in txt and "Choose" not in txt and "Manage billing" not in txt, txt
            assert pg.locator("#plans-pop [data-plp-plan], #plans-pop [data-plp-pack], #plans-pop [data-plp-manage], #plans-pop button.plp-pack").count() == 0, "nothing to buy with"
            pg.keyboard.press("Escape"); pg.wait_for_timeout(600)
            assert pg.locator("#set-billing").count() == 0 and pg.locator("#bl-receipts").count() == 0 and not pg.locator("#set-ext-billing").is_visible(), "no receipts section"
            pg.evaluate("() => window.TribeSettings.open('admin')"); pg.wait_for_timeout(1500)
            assert pg.locator("#set-payments").count() == 0 and not pg.locator("#set-ext-payments").is_visible() and "Stripe" not in pg.inner_text("#set-pane-admin"), "no Payments section"
            co = pg.evaluate("() => window.TribePremium.checkout('hosted')"); assert co["ok"] is False and co["reason"] == "no-provider" and "coming" in co["message"], co
            # Flint's line, in a new session: it doesn't promise a purchase
            p2 = cx.new_page(); p2.goto(BASE + "/?skipIntro=1"); p2.wait_for_function("() => window.TribeClient && window.TribeClient.connected() && window.TribePlans", timeout=20000)
            p2.wait_for_selector("#flint #fl-input", state="visible", timeout=15000)
            a3_ = ask("imagine a quiet harbour at dawn in two lines", p2); assert "credits have run out" in a3_ and "plans" not in a3_.lower() and "own AI" in a3_, a3_
            assert ok(api("/premium", "PUT", {"plan": "premium"}, token=host))["plan"] == "premium", "by hand still works"
            b.close()
        logtxt = open(logf).read(); assert SK not in logtxt and WH not in logtxt and "sk_test" not in logtxt, "no key in the log"
        assert not errors, errors
        print("  not configured: the buttons explain it, nothing opens, the host computer still sets plans; no key in the log")
        print("ok e2e_payments")
    finally:
        srv.terminate()
        try: srv.wait(timeout=5)
        except Exception: srv.kill()
        for s in servers: s.shutdown()


if __name__ == "__main__":
    main()
