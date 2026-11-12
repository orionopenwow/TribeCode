"""Local summarize and small local features (feat/flint-runthrough, app/ui/localdoc.js, docs/DESIGN-SYSTEM.md §11).
  0. The core with no browser: TextRank-lite summary, key points + action items, titles, tags, reading time, glossary,
     and the text layer of a FlateDecode PDF and an HTML page (node).
  1. No AI: a doc's ✦ Summarize / Key points & action items (Add to Tasks works) / Suggest a title (a pick sets it) /
     Suggest tags / Reading time & outline / Explain like I'm new, each "Basic · no AI".
  2. Flint commands with no AI: "summarize the doc called …", "key points of this doc", "suggest tags for the doc called …",
     "how long to read the doc called …", "explain the terms in the doc called …", "summarize the file brief.pdf" and
     "… page.html" (files in the project's repo), "summarize the chat" (no brain needed any more).
     The docs API's summarize works with no brain (extractive).
  3. With the mock LLM: the same ✦ and the same Flint command are refined in place and say "via tiny-model".
Usage: python app/test/e2e_local_summarize.py"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OFF = int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
PORT = 5560 + OFF; FAKE = PORT + 700
BASE = f"http://localhost:{PORT}"
errors, asked = [], []

DOC = """# Lantern Run launch plan

Lantern Run is a small co-op platformer about carrying light through a dark forest. The goal is to ship a playable demo by Friday so friends can try it.
We decided to keep the art in pixel style because the team already has a tileset. The Model Context Protocol (MCP) lets each friend's AI helper use the tribe's tools.
The website needs a clear CTA and a landing page with a trailer. Performance matters on phones, so the game must hold 60 fps on an old phone.

## Risks

The level editor is not ready. Saves are not done yet and the API for scores is unclear.

## Next steps

- [ ] Record the trailer
- We should fix the jump bug before the demo.
"""


class FakeLLM(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0); body = json.loads(self.rfile.read(n) or b"{}")
        text = json.dumps(body.get("messages", [])); asked.append(text)
        if "Summarize this document" in text: out = "- Lantern Run ships a playable demo on Friday.\n- The art stays pixel style.\n- Saves and the score API are the open risks."
        elif "terms in this document" in text: out = "- MCP: a plug that lets AI helpers use the tribe's tools.\n- Tileset: one picture of small tiles a game uses to draw levels."
        else: out = "OK"
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for part in [out[:12], out[12:]]:
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": {"content": part}}]}) + "\n\n").encode()); self.wfile.flush(); time.sleep(0.02)
        self.wfile.write(b"data: [DONE]\n\n")


def api(path, method="GET", body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def pdf_bytes(lines):
    content = "BT /F1 12 Tf 72 720 Td " + " ".join(f"({l}) Tj 0 -16 Td" for l in lines) + " ET"
    z = zlib.compress(content.encode())
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Length " + str(len(z)).encode() + b" /Filter /FlateDecode >>\nstream\n" + z + b"\nendstream\nendobj\n%%EOF\n"


def spark(pg, where, kind, want_via="Basic · no AI"):
    pg.click(f"[data-ab='{where}']"); pg.click(f"#ab-pop [data-ab-do='{kind}']")
    pg.wait_for_selector(f"#ab-pop .ab-res[data-kind='{kind}'] #ab-out", timeout=8000)
    pg.wait_for_function("t => (document.querySelector('#ab-via') || {}).textContent && document.querySelector('#ab-via').textContent.includes(t)", arg=want_via, timeout=15000)
    return pg.inner_text("#ab-out")


def flint(pg, text, want=None, refined=None):
    n = pg.evaluate("TribeFlint.thread().length")
    pg.evaluate("t => TribeFlint.ask(t)", text)
    pg.wait_for_function("n => TribeFlint.thread().length >= n + 2", arg=n, timeout=15000)
    if refined: pg.wait_for_function("t => (TribeFlint.thread().slice(-1)[0].text || '').includes(t)", arg=refined, timeout=15000)
    out = pg.evaluate("TribeFlint.thread().slice(-1)[0].text")
    if want: assert want.lower() in out.lower(), f"{text!r} -> {out!r} (wanted {want!r})"
    return out


def core_checks():
    js = r"""
const L = require(process.argv[1]), zlib = require('zlib'), assert = require('assert');
const doc = process.argv[2];
const s = L.summarize(doc); assert(s.sentences.length >= 2 && s.sentences.length <= 5, s); assert(s.sentences.some(x => /demo by Friday/.test(x)), s);
const k = L.keyPoints(doc); assert(k.actions.some(a => a.title === 'Record the trailer') && k.actions.some(a => /jump bug/.test(a.title)), k.actions);
assert(L.titles(doc).length === 3); assert(L.tags(doc).includes('lantern-run'), L.tags(doc));
const r = L.reading(doc); assert(r.words > 90 && /Risks/.test(r.outline), r);
const g = L.glossary(doc); assert(g.some(x => x.term === 'MCP' && /Model Context Protocol/.test(x.def)) && g.some(x => x.term === 'Tileset'), g);
assert(/Hi/.test(L.htmlText('<h1>Hi</h1><script>bad()</script><p>a &amp; b</p>')) && !/bad/.test(L.htmlText('<script>bad()</script>')));
const c = 'BT (Hello PDF.) Tj 0 -14 Td [(Second) -250 (line.)] TJ ET', z = zlib.deflateSync(Buffer.from(c));
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n<< /Length ' + z.length + ' /Filter /FlateDecode >>\nstream\n'), z, Buffer.from('\nendstream\n%%EOF')]);
L.extract('a.pdf', new Uint8Array(pdf), d => zlib.inflateSync(d)).then(t => { assert.strictEqual(t, 'Hello PDF.\nSecond line.'); console.log('core ok'); });
"""
    out = subprocess.run(["node", "-e", js, str(ROOT / "app" / "ui" / "localdoc.js"), DOC], capture_output=True, text=True)
    assert out.returncode == 0 and "core ok" in out.stdout, out.stderr + out.stdout


def main():
    core_checks()
    tmp = tempfile.mkdtemp(prefix="tribe-localsum-")
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    fake = ThreadingHTTPServer(("127.0.0.1", FAKE), FakeLLM); threading.Thread(target=fake.serve_forever, daemon=True).start()
    srv = subprocess.Popen(["node", str(ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", os.path.join(tmp, "tribe"), "--name", "Lantern Crew", "--ollama", "http://localhost:9"],
                           stdout=open(os.path.join(tmp, "log"), "w"), stderr=subprocess.STDOUT, env=env)
    try:
        for _ in range(80):
            try: urllib.request.urlopen(BASE + "/api/health"); break
            except Exception: time.sleep(0.15)
        with sync_playwright() as p:
            b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
            pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
            pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and errors.append(m.text[:200]))
            pg.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', JSON.stringify({name: 'Orion'})); localStorage.setItem('tribecode.flint.brain', 'none'); localStorage.setItem('tribecode.brain', JSON.stringify('none'))")
            pg.goto(BASE + "/?skipIntro=1"); pg.wait_for_function("TribeClient.connected() && window.TribeLocalDoc && window.TribeAIBasics && window.TribeFlint", timeout=20000)
            tok = pg.evaluate("TribeStore.get().server.token")
            pg.evaluate("TribeStage.set(TribeProjects.current(), {vision:true, task:true, agent:false, repo:true}, {pin:true})")

            # ---------- 1. a doc's ✦ with no AI ----------
            slug = pg.evaluate("d => TribeDocs.create('Lantern notes', d).then(x => { TribeApp.show('docs'); setTimeout(() => TribeDocs.open(x.slug), 100); return x.slug; })", DOC)
            pg.wait_for_selector("#view-docs .doc-toolbar [data-ab='doc']", timeout=10000)
            out = spark(pg, "doc", "doc.summary"); assert "demo by Friday" in out, out
            out = spark(pg, "doc", "doc.points"); assert "Record the trailer" in out and "jump bug" in out.lower(), out
            n0 = len(api("/tasks", token=tok)[1]["tasks"])
            pg.click("#ab-acts [data-ab-apply='0']"); pg.wait_for_timeout(700)
            titles = [t["title"] for t in api("/tasks", token=tok)[1]["tasks"]]; assert len(titles) >= n0 + 2 and "Record the trailer" in titles, titles
            out = spark(pg, "doc", "doc.title"); picks = pg.locator("#ab-pop .ab-pick"); assert picks.count() == 3, out
            first = picks.first.inner_text(); picks.first.click(); pg.wait_for_timeout(200)
            assert pg.input_value("#dl-name") == first, (pg.input_value("#dl-name"), first)
            out = spark(pg, "doc", "doc.tags"); assert "#lantern-run" in out, out
            out = spark(pg, "doc", "doc.read"); assert "words" in out and "Risks" in out, out
            out = spark(pg, "doc", "doc.glossary"); assert "MCP" in out and "Model Context Protocol" in out and "tileset" in out.lower(), out
            pg.keyboard.press("Escape")

            # ---------- 2. Flint commands with no AI ----------
            assert api(f"/docs/{slug}/summarize", "POST", {}, token=tok)[1].get("via") == "basic"
            flint(pg, "key points of this doc", "Action items")
            flint(pg, "summarize the doc called lantern", "Basic · no AI")
            flint(pg, "suggest tags for the doc called lantern", "#lantern-run")
            flint(pg, "how long to read the doc called lantern", "words")
            flint(pg, "explain the terms in the doc called lantern", "Model Context Protocol")
            # files in the project's repo: a PDF and an HTML page
            pid = pg.evaluate("TribeProjects.current()")
            st, r = api(f"/projects/{pid}/setup/repo", "POST", {}, token=tok); assert st == 200, r
            repo = Path(r.get("repo") or next(p for p in Path(tmp).rglob(".git")).parent)
            (repo / "brief.pdf").write_bytes(pdf_bytes(["Lantern Run is a co-op platformer about carrying light.", "The demo ships on Friday so friends can play it.", "Saves are the biggest open risk."]))
            (repo / "page.html").write_text("<html><head><style>p{}</style><script>evil()</script></head><body><h1>Glowbug</h1><p>Glowbug is a cozy game about catching fireflies at dusk.</p><p>The shop funds the next level of the game.</p></body></html>")
            flint(pg, "summarize the file brief.pdf", "demo ships on Friday")
            out = flint(pg, "summarize the file page.html", "fireflies"); assert "evil" not in out, out
            # chat: no brain needed any more
            for t in ["We should record a coin sound.", "Let's go with pixel art, decided.", "Can someone fix the jump bug by friday?"]: api("/chat/general", "POST", {"text": t}, token=tok)
            flint(pg, "summarize the chat", "Basic · no AI")

            # ---------- 3. with the mock LLM: refined in place ----------
            st, d = api("/llm", "PUT", {"provider": "custom", "baseUrl": f"http://127.0.0.1:{FAKE}/v1", "model": "tiny-model", "key": "sk-test-0123456789"}, token=tok); assert st == 200, d
            pg.evaluate("window.dispatchEvent(new Event('tribe-brain'))")
            pg.evaluate("TribeApp.show('docs'); setTimeout(() => TribeDocs.open(%s), 100)" % json.dumps(slug))
            pg.wait_for_selector("#view-docs .doc-toolbar [data-ab='doc']", timeout=10000)
            out = spark(pg, "doc", "doc.summary", "via tiny-model"); assert "ships a playable demo on Friday" in out, out
            out = spark(pg, "doc", "doc.glossary", "via tiny-model"); assert "plug that lets AI helpers" in out, out
            pg.keyboard.press("Escape")
            flint(pg, "summarize the doc called lantern", refined="via tiny-model")
            assert any("Summarize this document" in a for a in asked) and any("terms in this document" in a for a in asked)
        assert not errors, errors
        print("e2e_local_summarize: OK (core + PDF/HTML; 6 doc ✦ with no AI; Flint commands on docs, files and chat; refined via a mock LLM)")
    finally:
        srv.kill(); fake.shutdown()


if __name__ == "__main__":
    main()
