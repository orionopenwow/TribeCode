"""Language audit (feat/languages): walks the app in every language and counts what is still English.

How: the same walk runs in English first, then in each language. A visible string (or placeholder / tooltip /
aria-label) that reads exactly the same as it did in English, and is not a name, a number or code, is untranslated.
It also reports text that is cut off or runs off the screen in a language but not in English, English dates and
times, mixed-language sentences (CJK with English words inside), and Flint replies that stay English.

  default            quick check for npm test: Japanese + German at 1280, Japanese at 390; fails when a count rises
                     above app/test/i18n_baseline.json (plus static checks on the table).
  --full             every language at 1280, German + Japanese at 390 (used by scripts/dev/i18n-audit.js).
  --json FILE        write everything found to FILE.
  --update           rewrite the baseline from this run.
Usage: TRIBE_PORT_OFFSET=3400 python3 app/test/e2e_i18n_audit.py [--full] [--json out.json] [--update]
"""
import json, os, re, signal, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PORT = 6230 + int(os.environ.get("TRIBE_PORT_OFFSET", "0"))
BASE = f"http://localhost:{PORT}"
FULL = "--full" in sys.argv
UPDATE = "--update" in sys.argv
# --skip a,b: places to leave out (used once, for the "before" column: two places froze the app in any language then)
SKIP_PLACES = set((sys.argv[sys.argv.index("--skip") + 1]).split(",")) if "--skip" in sys.argv else set()
# TRIBE_I18N_ROOT: walk another checkout's app (the "before" column is the starting commit, unpacked elsewhere)
APP_ROOT = Path(os.environ.get("TRIBE_I18N_ROOT") or ROOT)
TIMING = "--timing" in sys.argv
OUT = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
BASELINE = ROOT / "app" / "test" / "i18n_baseline.json"
ALLOW = json.loads((ROOT / "app" / "test" / "i18n_allow.json").read_text())
LANGS = ["es", "pt", "fr", "de", "ja", "zh", "ko"]
SLACK = 3   # a count may wobble by this much (timing: a toast or a tip that shows on one run and not the next)

COLLECT = r"""
(opts) => {
  const SKIP = '.cv-world,.cv-lname,.cv-fname,.cv-aname b,.cv-phead b,.cv-ins-name,script,style,textarea,code,pre,.msg-body,.msg .body,.md,.doc-body,.rt,.pvw-frame,.tk-title,.card .title,[contenteditable],[data-title],.pj-name,.pc-name,#chat-list,.dm-body,.nf-item .nf-t,[data-i18n-skip],kbd,.kbd,.avatar,.av,select option:not(:checked)';
  const out = { text: [], attr: [], over: [] };
  const sig = e => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null;
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return null; }
    return r; };
  const seenT = new Set(), seenE = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length < 2) continue;
    const e = n.parentElement; if (!e || e.closest(SKIP)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(e.tagName)) continue;
    const r = vis(e); if (!r) continue;
    if (!seenT.has(t)) { seenT.add(t); out.text.push({ t, sig: sig(e) }); }
    if (seenE.has(e)) continue; seenE.add(e);
    // cut off (ellipsis / clipped) or running off the right edge of the window
    const cs = getComputedStyle(e);
    const clipped = (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && e.scrollWidth > e.clientWidth + 1 && e.children.length === 0;
    const off = r.right > innerWidth + 1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0 && !e.closest('[data-scroll-x],.seg,.tabs,.sheet-grid,.cv-stage,.wdz-frame,.pv-frame');
    if (clipped || off) out.over.push({ t: t.slice(0, 60), sig: sig(e) + ' < ' + sig(e.parentElement || e), how: clipped ? 'cut' : 'off' });
  }
  for (const e of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    if (e.closest(SKIP)) continue; if (!vis(e)) continue;
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = (e.getAttribute(a) || '').trim(); if (v.length > 1 && !seenT.has(a + ':' + v)) { seenT.add(a + ':' + v); out.attr.push({ t: v, a, sig: sig(e) }); } }
  }
  return out;
}
"""

FLINT = r"""
async (texts) => {
  const L = window.TribeFlintLocal; if (!L || !L.handle) return null; const res = [];
  for (const text of texts) {
    const said = []; const H = { say: (t) => { said.push(String(t || '')); return true; }, act: (a, b, c) => ({ label: a, kind: b, arg: c }), special: async () => false, legacyHit: () => false, legacy: () => null, modelOnline: () => false, guide: null };
    try { await Promise.race([L.handle(text, H), new Promise(r => setTimeout(r, 4000))]); } catch (e) { said.push(''); }
    res.push(said.join(' ').replace(/<[^>]+>/g, ' ').trim());
  }
  return res;
}
"""
STORM = r"""
async () => {
  if (!(window.TribeI18n && TribeI18n.held)) return { skipped: true };
  const el = document.createElement('span'); el.id = 'i18n-storm-probe'; document.body.appendChild(el);
  let writes = 0;
  const mo = new MutationObserver(() => { if (el.textContent !== 'Save') { writes++; el.textContent = 'Save'; } });   // the pattern that froze Files
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  el.textContent = 'Save';
  await new Promise(r => setTimeout(r, 700));
  const out = { text: el.textContent, writes, held: TribeI18n.held().some(h => String(h.el).includes('i18n-storm-probe')), translatedElsewhere: TribeI18n.t('Save') !== 'Save' };
  mo.disconnect(); el.remove(); return out;
}
"""
# things to say to Flint that change nothing: a sum, the time, a missing place, a conversion, small talk
FLINT_ASK = ["what time is it", "12 * 8", "open the tasks", "convert 5 km to miles", "what can you do", "thanks", "show me the calendar", "undo"]

BRAND = re.compile("|".join(re.escape(x) for x in ALLOW["brand"]))
NOT_WORDS = re.compile(r"^[\W\d_]*$|^[\d\W]*[A-Za-z]?[\d\W]*$")
CODEISH = re.compile(r"^(https?://|[\w.-]+@[\w.-]+|[\w./-]+\.(js|css|html|json|md|png|svg)|[A-Z0-9_]{2,}|v?\d+(\.\d+)+.*|#[0-9a-fA-F]{3,8}|[⌘⌥⇧^]?(Ctrl|Cmd|Alt|Shift|Esc|Enter|Tab)([ +].*)?)$")
CJK = re.compile(r"[぀-ヿ㐀-鿿가-힯]")
ENDATE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b|\b\d+ ?(s|sec|min|mins|h|hr|hours?|days?|d|w|weeks?|mo|months?) ago\b|\b\d{1,2}:\d{2} ?(AM|PM|am|pm)\b|\b(just now|yesterday|today|tomorrow)\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(day|sday|nesday|rsday|urday)?\b", re.I)


def skip_string(t, seeded):
    if NOT_WORDS.match(t) or CODEISH.match(t): return True
    if t in ALLOW["same"] or t in seeded: return True
    rest = BRAND.sub("", t)
    for s in seeded: rest = rest.replace(s, "")
    return not re.search(r"[A-Za-z]{2,}", rest)


def api(path, method="GET", body=None, token=None):
    h = {"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})}
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as x: return x.status, json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, {}


def static_checks():
    """Checks on the tables themselves: no browser needed."""
    src = (APP_ROOT / "app" / "ui" / "i18n.js").read_text()
    table = src[src.index("const D = {"):src.index("const KEY = 'tribecode.lang';")]
    keys = {}; dup_diff = []; short = []
    for m in re.finditer(r'^\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')\s*:\s*(\[.*?\]),?\s*$', table, re.M):
        try: k = json.loads(m.group(1)) if m.group(1)[0] == '"' else m.group(1)[1:-1]
        except Exception: continue
        row = m.group(2)
        if k in keys and keys[k] != row: dup_diff.append(k)
        keys[k] = row
        try:
            cells = json.loads(row)
            if len(cells) != 7 or any(not c for c in cells): short.append(k)
        except Exception: pass
    return {"rows": len(keys), "dup_diff": sorted(set(dup_diff)), "short": sorted(short)}


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tribe-i18n-", dir="/tmp")); errors = []
    env = {**os.environ, "TRIBE_NO_GH": "1", "TRIBE_TEST": "1", "TRIBE_NO_DOWNLOAD": "1", "NO_PROXY": "127.0.0.1,localhost"}
    srv = subprocess.Popen(["node", str(APP_ROOT / "server" / "index.js"), "--port", str(PORT), "--dir", str(tmp / "tribe"), "--ollama", "http://localhost:9"], stdout=open(tmp / "log", "w"), stderr=subprocess.STDOUT, env=env)
    res = {"static": static_checks(), "langs": {}, "routes": 0, "skipped": sorted(SKIP_PLACES)}
    seeded = {"Orion", "Draw the title screen", "Morning crew", "Pixel Quest", "Mira"}
    try:
        for _ in range(100):
            try:
                if api("/health")[0] == 200: break
            except Exception: pass
            time.sleep(0.2)
        host = api("/bootstrap", "POST", {"name": "Orion"})[1]["token"]
        proj = api("/projects", token=host)[1]["projects"][0]; pid = proj["id"]; seeded.add(proj.get("name", ""))
        # seed a task and a message; a seed that fails is an error here, not a silent gap (the walk would then miss those screens' filled states)
        for path, body in (("/tasks", {"title": "Draw the title screen"}), ("/chat/general/send", {"text": "Morning crew"})):
            code = api(path, "POST", body, host)[0]
            if code != 200: errors.append(f"seed {path}: HTTP {code}")
        plan = [("desktop", {"width": 1280, "height": 860}, LANGS if FULL else ["ja"])] + ([("phone", {"width": 390, "height": 844}, ["de", "ja"])] if FULL else [])
        where = {"at": "start"}

        def stalled(signum, frame):
            # the page stopped answering: say where, stop the server, and fail (never hang the test chain)
            print(f"i18n audit: the page stopped answering at {where['at']}", flush=True)
            try: srv.terminate()
            except Exception: pass
            os._exit(2)
        signal.signal(signal.SIGALRM, stalled)

        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])

            def fresh(size, vp, lang):
                c = b.new_context(viewport=vp, locale="en-US", **({"has_touch": True, "is_mobile": True} if size == "phone" else {}))
                c.set_default_timeout(30000)
                st = {"name": "Orion", "onboarded": True, "tour": {"done": True}, "server": {"url": BASE, "token": host}}
                c.add_init_script("if (!localStorage.getItem('tribecode.settings.v1')) localStorage.setItem('tribecode.settings.v1', %s); localStorage.setItem('tribecode.helpers.v1', JSON.stringify({flint:1,brain:1,ai:1})); localStorage.setItem('tribecode.lang', '%s');" % (json.dumps(json.dumps(st)), lang))
                pg = c.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)[:160])); pg.on("dialog", lambda d: d.dismiss())
                pg.goto(BASE + "/?skipIntro=1", wait_until="domcontentloaded")
                pg.wait_for_function("window.TribeRouter && window.TribeHub && window.TribeShell && window.TribeClient && TribeClient.connected()", timeout=45000); pg.wait_for_timeout(1200)
                if pg.locator("#install-sheet #ins-later").count() and pg.locator("#install-sheet #ins-later").is_visible(): pg.click("#ins-later")
                return c, pg

            def routes_for(pg):
                dests = pg.evaluate("TribeShell.dests().filter(d => d.visible).map(d => d.key)")
                routes = [("hub", "TribeRouter.go('hub')")] + [(k, f"TribeShell.go('{k}')") for k in dests]
                routes += [("settings:" + t, f"TribeSettings.open('{t}')") for t in ("profile", "notifications", "account", "ai", "admin", "privacy", "storage", "about", "workspace", "projects")]
                routes += [
                    ("people", "window.TribePeoplePanel && TribePeoplePanel.open()"), ("help", "window.TribeHelp && TribeHelp.open()"),
                    ("shortcuts", "window.TribeHelp && TribeHelp.shortcuts && TribeHelp.shortcuts()"),
                    ("guide", "window.TribeHelp && TribeHelp.close && TribeHelp.close(); window.TribeGuide && TribeGuide.home()"),
                    ("guide:website", "window.TribeGuide && TribeGuide.path('website', 'basics')"),
                    ("guide:close", "window.TribeGuide && TribeGuide.close()"),
                    ("next", "window.TribeNextStep && TribeNextStep.open()"), ("next:close", "window.TribeNextStep && TribeNextStep.close && TribeNextStep.close()"),
                    ("publish", f"window.TribePublish && TribePublish.open('{pid}')"), ("publish:close", "window.TribePublish && TribePublish.close && TribePublish.close()"),
                    ("versions", f"window.TribeVersions && TribeVersions.open('{pid}')"), ("versions:close", "window.TribeVersions && TribeVersions.close && TribeVersions.close()"),
                    ("new", "window.TribeNew && TribeNew.open()"), ("new:close", "window.TribeNew && TribeNew.close && TribeNew.close()"),
                    ("invite", "window.TribeInvite && TribeInvite.open()"), ("invite:close", "window.TribeInvite && TribeInvite.close && TribeInvite.close()"),
                    ("plans", "window.TribePlans && TribePlans.open()"), ("plans:close", "window.TribePlans && TribePlans.close && TribePlans.close()"),
                    ("flint", "window.TribeFlintPage && TribeFlintPage.open()"), ("flint:close", "window.TribeFlintPage && TribeFlintPage.close && TribeFlintPage.close()"), ("academy", "window.TribeAcademy && TribeAcademy.open()"),
                    ("market", "window.TribeMarket && TribeMarket.open()"), ("company", "window.TribeCompany && TribeCompany.open()"),
                    ("design", "window.TribeDesignFlow && TribeDesignFlow.open()"), ("design:close", "window.TribeDesignFlow && TribeDesignFlow.close && TribeDesignFlow.close()"),
                    ("site", f"window.TribeSiteDesigner && TribeSiteDesigner.open({{ pid: '{pid}' }})"), ("site:close", "window.TribeSiteDesigner && TribeSiteDesigner.close && TribeSiteDesigner.close()"),
                ]
                # the design canvas and the website builder go last: after them the page can stop answering to a new
                # navigation, so nothing is asked of this page afterwards (each language gets its own fresh page)
                last = lambda n: n.split(":")[0] in ("canvas", "design", "site", "design-all")
                routes = [r for r in routes if r[0] not in SKIP_PLACES]
                return [r for r in routes if not last(r[0])] + [r for r in routes if last(r[0])]

            def walk(size, vp, lang):
                print(f"  walking {size} {lang}", flush=True)
                where["at"] = f"{size} {lang} opening"; signal.alarm(90)
                c, pg = fresh(size, vp, lang)
                routes = routes_for(pg)
                res["routes"] = max(res["routes"], len([r for r in routes if not r[0].endswith(":close")]))
                flint = None
                if size == "desktop":
                    where["at"] = f"{size} {lang} asking Flint"; signal.alarm(90)
                    try: flint = pg.evaluate(FLINT, FLINT_ASK)
                    except Exception as e: errors.append(f"{size} {lang} flint: {str(e)[:120]}")
                got = {"text": {}, "attr": {}, "over": {}}
                for name, js in routes:
                    t0 = time.time(); where["at"] = f"{size} {lang} {name}"; signal.alarm(45)
                    if TIMING: print(f"    {name}", flush=True)
                    # never wait on what the call returns: some openers return a promise that settles when the sheet closes
                    try: pg.evaluate("() => { try { " + js + "; } catch (e) { return String(e); } return null; }")
                    except Exception as e:
                        if lang == "en": errors.append(f"{size} {name}: {str(e)[:120]}")
                        continue
                    if name.endswith(":close"): pg.keyboard.press("Escape"); pg.wait_for_timeout(250); continue
                    pg.wait_for_timeout(400)
                    try: r = pg.evaluate(COLLECT, {})
                    except Exception as e: errors.append(f"{size} {name} collect: {str(e)[:120]}"); continue
                    for x in r["text"]: got["text"].setdefault(x["t"], (name, x["sig"]))
                    for x in r["attr"]: got["attr"].setdefault(x["a"] + ":" + x["t"], (name, x["sig"]))
                    for x in r["over"]: got["over"].setdefault(name + " | " + x["sig"], (x["how"], x["t"]))
                    if name in ("people", "help", "shortcuts"): pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
                    if TIMING: print(f"      {time.time() - t0:.1f}s, {len(r['text'])} strings", flush=True)
                where["at"] = f"{size} {lang} closing"; signal.alarm(45)
                # labels the translator gave up on because other code kept writing them back (i18n.js: the rewrite-storm guard)
                try: got["held"] = pg.evaluate("window.TribeI18n && TribeI18n.held ? TribeI18n.held() : []")
                except Exception: got["held"] = []
                # the guard itself: stage the fight on purpose (a watcher that keeps writing the English back). The page
                # must keep answering, the label must end in English, and the translator must say it gave up on it.
                if lang != "en" and size == "desktop":
                    where["at"] = f"{size} {lang} the staged rewrite storm (the guard in i18n.js did not stop it)"; signal.alarm(30)
                    try: got["storm"] = pg.evaluate(STORM)
                    except Exception as e: got["storm"] = {"error": str(e)[:120]}
                c.close(); signal.alarm(0)
                return got, flint

            for size, vp, langs in plan:
                en, en_flint = walk(size, vp, "en")
                res.setdefault("english", {})[size] = len(en["text"])
                for lang in langs:
                    g, fl = walk(size, vp, lang); L = res["langs"].setdefault(lang, {})
                    un = sorted(t for t in g["text"] if t in en["text"] and not skip_string(t, seeded))
                    una = sorted(k for k in g["attr"] if k in en["attr"] and not skip_string(k.split(":", 1)[1], seeded))
                    over = sorted(k for k in g["over"] if k not in en["over"])
                    dates = sorted(t for t in g["text"] if ENDATE.search(t) and not skip_string(t, seeded) and (t in en["text"] or lang in ("ja", "zh", "ko")))
                    mixed = sorted(t for t in g["text"] if lang in ("ja", "zh", "ko") and CJK.search(t) and t not in en["text"] and re.search(r"[A-Za-z]{4,}", " ".join(w for w in re.split(r"\s+", BRAND.sub("", t)))) and not any(s2 in t for s2 in seeded if s2))
                    L[size] = {"untranslated": un, "attrs": una, "overflow": [f"{k} [{g['over'][k][0]}] {g['over'][k][1]}" for k in over], "dates": dates, "mixed": mixed,
                               "where": {t: g["text"][t][0] for t in un}, "held": [f"{h.get('el')} {json.dumps(h.get('en'), ensure_ascii=False)}" for h in g.get("held", [])], "storm": g.get("storm")}
                    if size == "desktop" and en_flint and fl:
                        L["flint_english"] = [FLINT_ASK[i] + " → " + r[:80] for i, r in enumerate(fl) if r and i < len(en_flint) and r == en_flint[i] and re.search(r"[A-Za-z]{3,}", BRAND.sub("", r))]
                        L["flint_asked"] = len([r for r in fl if r])
            b.close()
    finally:
        srv.terminate()
    counts = {"static": {"dup_diff": len(res["static"]["dup_diff"]), "short": len(res["static"]["short"])}}
    for lang, L in res["langs"].items():
        for size in ("desktop", "phone"):
            if size in L: counts[f"{lang}.{size}"] = {k: len(L[size][k]) for k in ("untranslated", "attrs", "overflow", "dates", "mixed")}
        if "flint_english" in L: counts[f"{lang}.flint_english"] = len(L["flint_english"])
    res["counts"] = counts; res["errors"] = errors[:20]
    if OUT: Path(OUT).write_text(json.dumps(res, ensure_ascii=False, indent=1))
    mode = "full" if FULL else "quick"
    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    if UPDATE:
        base[mode] = counts; BASELINE.write_text(json.dumps(base, indent=1, sort_keys=True) + "\n"); print("baseline updated:", mode)
    bad = []
    want = base.get(mode, {})
    for key, val in counts.items():
        if isinstance(val, dict):
            for k, v in val.items():
                lim = (want.get(key) or {}).get(k)
                if lim is not None and v > lim + (0 if key == "static" else SLACK): bad.append(f"{key}.{k}: {v} (baseline {lim})")
        else:
            lim = want.get(key)
            if lim is not None and val > lim: bad.append(f"{key}: {val} (baseline {lim})")
    for key, val in counts.items(): print(f"  {key}: {json.dumps(val)}")
    if errors: print("  page errors:", errors[:5])
    # two things are never baselined. A held label means other code and the translator were rewriting each other: that
    # froze Files in every language before the guard existed. And a seed that failed means the walk saw emptier screens.
    hard = [f"{lang} {size}: {h}" for lang, L in res["langs"].items() for size in ("desktop", "phone") if size in L for h in L[size].get("held", [])]
    hard += [e for e in errors if e.startswith("seed ")]
    for lang, L in res["langs"].items():
        st = (L.get("desktop") or {}).get("storm")
        if st is None or st.get("skipped"): continue   # a build without the guard (the "before" column)
        if st.get("error") or st.get("text") != "Save" or not st.get("held") or not st.get("translatedElsewhere"):
            hard.append(f"{lang}: the rewrite-storm guard did not behave: {json.dumps(st, ensure_ascii=False)} (want the label left as \"Save\", reported as held, with \"Save\" still translated everywhere else)")
    if hard:
        print("i18n audit: FAILED\n  " + "\n  ".join(hard))
        print("A held label: find the code that writes it (often `if (el.textContent !== text) el.textContent = text` with a watcher on the same element) and compare with TribeI18n.t(text) too. See app/ui/shell.js, the breadcrumb.")
        sys.exit(1)
    if bad and not UPDATE:
        print("i18n audit: counts rose above the baseline:\n  " + "\n  ".join(bad))
        for lang, L in res["langs"].items():
            for size in ("desktop", "phone"):
                if size in L and L[size]["untranslated"]: print(f"  {lang} {size} untranslated, first 15:", L[size]["untranslated"][:15])
        print("Add rows to app/ui/i18n-more.js (or a name to app/test/i18n_allow.json), or run with --update if the rise is meant.")
        sys.exit(1)
    print(f"i18n audit ({mode}): ok, {res['routes']} places walked per language")


if __name__ == "__main__":
    main()
