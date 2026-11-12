// Languages for the website (v0.25, whole pages since v0.30): a 🌐 picker in the top bar. The pages are written in
// English; picking a language loads lang/<code>.json (English text -> translation) and swaps every visible string on
// the page, including text the page's scripts add later (a MutationObserver). Keys are the element's own text with
// whitespace collapsed; an element that mixes words with inline elements (a link, <b>, <code>) is keyed as a pattern,
// e.g. "Read the {0} first.", so a translation can move the link where its grammar needs it (the link's own words are
// keyed separately). Animated mocks of the app (.stage and friends, [data-no-i18n], translate="no") stay as drawn.
// TribeLang.missing() lists the strings on this page with no translation for the current language; the site test
// (app/test/e2e_site_i18n.py) fails when it finds any. The choice is remembered on this device; on a first visit the
// browser's language is used when we have it.
(function () {
  'use strict';
  const LANGS = [
    ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['zh', '简体中文'], ['ko', '한국어'],
  ];
  const NOTE = ['Algunas partes siguen en inglés.', 'Algumas partes ainda estão em inglês.', 'Certaines parties restent en anglais.', 'Einige Teile sind noch auf Englisch.', '一部はまだ英語です。', '部分内容仍为英文。', '일부는 아직 영어예요.'];
  const KEY = 'tribecode.lang';
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');
  const idx = code => LANGS.findIndex(l => l[0] === code) - 1;   // -1 for English
  // never translated: code, the app mocks (they picture the app's own screens), and names that are the same everywhere
  const SKIP = 'script, style, noscript, template, svg, code, pre, kbd, samp, textarea, [data-no-i18n], [translate="no"], .sr-only, .stage, .mk-win, .dzw, .cs, .vs, .kit__mock, .mini, .fa-win, .mm-spot__view, [aria-hidden="true"]';
  const KEEP = new Set(['TribeCode', 'Flint', 'GitHub', 'Claude', 'Claude Code', 'Codex', 'Gemini', 'Gemini CLI', 'Cursor', 'Ollama', 'Qwen', 'Discord', 'Slack', 'Notion', 'Figma', 'Penpot', 'Blender', 'Godot', 'Phaser', 'three.js', 'Expo', 'Tailscale', 'Docker', 'Render', 'Fly.io', 'itch.io', 'MIT', 'Windows', 'macOS', 'Mac', 'Linux', 'iPhone', 'Android', 'iOS', 'JavaScript', 'HTML', 'CSS', 'API', 'Markdown', 'Lovable', 'Bolt', 'Replit', 'v0', 'Pixel Quest', 'Lantern Run', 'Campton', 'Camp', 'Maya', 'Jay', 'Orion', 'Ana', 'EN', 'ZIP', 'PWA', 'MCP', 'GLB', 'OK', 'CEO', 'DeepSeek', 'Llama', 'Mistral', 'KAPLAY', 'Node', 'Node.js', 'Astro', 'Kenney', 'CC0', 'H5BP', 'TasteJS', 'TodoMVC', 'PixiJS', 'melonJS', 'Frank Force', 'Gabriele Cirulli', 'Phaser Studio', 'KAPLAY team', 'Godot Engine contributors', 'Stripe', 'AppImage', 'Apple Silicon', 'ArtCraft', 'Krita', 'Steam', 'Vite', 'Web Push', 'Open Space', 'Grok', 'OpenAI', 'Anthropic', 'Playwright', 'Tauri']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const dicts = { en: {} }; let cur = 'en', D = {}, obs = null, busy = false;
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const wordy = s => /\p{L}{2,}/u.test(s) && !KEEP.has(s) && !/^(https?:\/\/|[\w.-]+\.(com|org|io|app|md|html|json|js)\b|github\.com\/|@|#\w)/.test(s);
  const textless = n => n.nodeType === 1 && !/\p{L}/u.test(n.textContent);
  const skipped = el => !!(el.closest && el.closest(SKIP));
  // every element that owns a direct text node with words
  function blocks(root) {
    const out = [], w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_ELEMENT, { acceptNode: e => e.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let e = w.currentNode; e; e = w.nextNode()) {
      if (e.nodeType !== 1 || (e === (root || document.body) && skipped(e))) continue;
      for (const n of e.childNodes) if (n.nodeType === 3 && /\p{L}/u.test(n.nodeValue)) { out.push(e); break; }
    }
    return out;
  }
  // the element's tokens: inner elements become {0}, {1}…; icons at either end are left out of the key
  function shape(el) {
    const kids = [...el.childNodes].filter(n => n.nodeType === 3 || n.nodeType === 1);
    let a = 0, b = kids.length; while (a < b && kids[a].nodeType === 1 && textless(kids[a])) a++; while (b > a && kids[b - 1].nodeType === 1 && textless(kids[b - 1])) b--;
    const mid = kids.slice(a, b), els = mid.filter(n => n.nodeType === 1); let k = 0;
    const key = norm(mid.map(n => n.nodeType === 3 ? n.nodeValue : `{${k++}}`).join(''));
    return { key, head: kids.slice(0, a), mid, els, tail: kids.slice(b), texts: mid.filter(n => n.nodeType === 3 && /\p{L}/u.test(n.nodeValue)) };
  }
  function restore(el) {
    const s = el.__tl; if (!s) return;
    const now = [...el.childNodes];
    const ours = now.length === s.out.length && now.every((n, i) => n === s.out[i] && (n.nodeType !== 3 || n.nodeValue === s.outVals[i]));
    if (ours) { el.replaceChildren(...s.nodes); s.nodes.forEach((n, i) => { if (n.nodeType === 3) n.nodeValue = s.vals[i]; }); }
    el.__tl = null;
  }
  function translateEl(el) {
    restore(el);
    if (cur === 'en') return;
    const sh = shape(el); if (!sh.key || !wordy(sh.key)) return;
    const nodes = [...el.childNodes], vals = nodes.map(n => n.nodeType === 3 ? n.nodeValue : null);
    const tr = D[sh.key];
    if (tr != null) {
      if (!sh.els.length) {   // plain text (maybe with icons around it): change the one text node, keep its spacing
        const t = sh.texts[0]; if (!t) return; let first = true;
        sh.mid.forEach(n => { if (n.nodeType === 3) { if (first && n === t) { n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, tr); first = false; } else n.nodeValue = ''; } });
      } else {
        const parts = tr.split(/\{(\d+)\}/), mid = [];
        parts.forEach((p, i) => { if (i % 2) { const e = sh.els[+p]; if (e) mid.push(e); } else if (p) mid.push(document.createTextNode(p)); });
        const lead = sh.mid[0] && sh.mid[0].nodeType === 3 && /^\s/.test(sh.mid[0].nodeValue) ? [document.createTextNode(' ')] : [];
        el.replaceChildren(...sh.head, ...lead, ...mid, ...sh.tail);
      }
    } else {   // no pattern: translate each run of words on its own (older keys)
      let any = false;
      sh.texts.forEach(n => { const k = norm(n.nodeValue), t = D[k]; if (t != null) { n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, t); any = true; } });
      if (!any) return;
    }
    const out = [...el.childNodes];
    el.__tl = { nodes, vals, out, outVals: out.map(n => n.nodeType === 3 ? n.nodeValue : null) };
  }
  function translateAttrs(root) {
    (root || document.body).querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(el => {
      if (skipped(el)) return;
      const o = el.__tla || (el.__tla = {});
      ATTRS.forEach(a => {
        if (!el.hasAttribute(a)) return;
        const v = el.getAttribute(a);
        if (!(a in o) || (v !== o[a] && v !== o[a + '#'])) o[a] = v;   // the page changed it: that's the new source
        const t = cur === 'en' ? null : D[norm(o[a])];
        const next = t != null ? t : o[a]; o[a + '#'] = next; if (v !== next) el.setAttribute(a, next);
      });
    });
  }
  function run(root) {
    busy = true;
    try { blocks(root).forEach(translateEl); translateAttrs(root); if (root === document.body || !root) { const t = document.querySelector('title'); if (t) { t.__src = t.__src || t.textContent; t.textContent = cur !== 'en' && D[norm(t.__src)] || t.__src; } } }
    finally { if (obs) obs.takeRecords(); busy = false; }
  }
  function watch() {
    if (obs || !window.MutationObserver) return;
    let roots = new Set(), timer = 0;
    obs = new MutationObserver(list => {
      if (busy || cur === 'en') return;
      for (const m of list) { const t = m.target.nodeType === 3 ? m.target.parentElement : m.target; if (t && !skipped(t)) roots.add(t); }
      if (roots.size && !timer) timer = setTimeout(() => { timer = 0; const r = [...roots]; roots = new Set(); r.forEach(x => { if (x.isConnected) { run(x); if (x.parentElement && !skipped(x.parentElement)) translateEl(x.parentElement); } }); }, 30);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function load(code) {
    if (dicts[code]) return Promise.resolve(dicts[code]);
    return fetch(BASE + 'lang/' + code + '.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(d => (dicts[code] = d));
  }
  let seq = 0;
  function apply(code) {
    const want = LANGS.some(l => l[0] === code) ? code : 'en', my = ++seq;
    return load(want).then(d => {
      if (my !== seq) return;
      cur = want; D = d; const i = idx(cur);
      document.documentElement.lang = cur === 'zh' ? 'zh-Hans' : cur === 'pt' ? 'pt-BR' : cur;
      run(document.body); watch();
      const b = document.getElementById('lang-btn'); if (b) { b.querySelector('b').textContent = cur.toUpperCase(); b.setAttribute('aria-label', `Language: ${LANGS.find(l => l[0] === cur)[1]}`); }
      document.querySelectorAll('#lang-menu [data-lang]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.lang === cur)));
      document.querySelectorAll('#lang-chips [data-lang]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.lang === cur)));
      const note = document.getElementById('lang-note'); if (note) note.textContent = i >= 0 && missing().length ? NOTE[i] : '';
      document.dispatchEvent(new CustomEvent('tribe-lang', { detail: cur }));
    });
  }
  function set(code) { try { localStorage.setItem(KEY, code); } catch {} return apply(code); }
  // strings on this page (as it is now) with no translation in the current language
  function missing() {
    if (cur === 'en') return [];
    const keep = cur, out = new Set(); cur = 'en'; run(document.body); cur = keep;   // read the English source
    blocks(document.body).forEach(el => {
      const sh = shape(el); if (!sh.key || !wordy(sh.key) || D[sh.key] != null) return;
      sh.texts.forEach(n => { const k = norm(n.nodeValue); if (wordy(k) && D[k] == null) out.add(sh.els.length ? sh.key : k); });
    });
    document.body.querySelectorAll('[placeholder]').forEach(el => { const o = (el.__tla && el.__tla.placeholder) || el.getAttribute('placeholder'), k = norm(o); if (!skipped(el) && wordy(k) && D[k] == null) out.add(k); });
    run(document.body);
    return [...out];
  }
  function picker() {
    const end = document.querySelector('.nav__end'); if (!end || document.getElementById('lang-btn')) return;
    const wrap = document.createElement('div'); wrap.className = 'lang';
    wrap.innerHTML = `<button class="lang__btn" id="lang-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="lang-menu" aria-label="Language" data-no-i18n><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9s1.3-6.3 3.9-9z"/></svg><b>EN</b></button>
      <ul class="lang__menu" id="lang-menu" role="menu" data-no-i18n hidden>${LANGS.map(([c, n]) => `<li><button type="button" role="menuitemradio" aria-checked="false" data-lang="${c}" lang="${c}">${n}</button></li>`).join('')}<li class="lang__note" id="lang-note" aria-live="polite"></li></ul>`;
    end.insertBefore(wrap, end.firstChild);
    const btn = wrap.querySelector('#lang-btn'), menu = wrap.querySelector('#lang-menu');
    const open = on => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button')).focus(); };
    btn.onclick = e => { e.stopPropagation(); open(menu.hidden); };
    menu.onclick = e => { const b = e.target.closest('[data-lang]'); if (!b) return; set(b.dataset.lang); open(false); btn.focus(); };
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('[data-lang]')], k = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Escape') { open(false); btn.focus(); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) open(false); });
    // phones: the top bar is full, so the languages also sit in the menu (☰) as a row of chips
    const extra = document.querySelector('.nav__mobile-extra');
    if (extra && !document.getElementById('lang-chips')) {
      const row = document.createElement('div'); row.className = 'lang__chips'; row.dataset.noI18n = ''; row.id = 'lang-chips'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Language');
      row.innerHTML = LANGS.map(([c, n]) => `<button type="button" data-lang="${c}" lang="${c}" aria-pressed="false">${n}</button>`).join('');
      row.onclick = e => { const b = e.target.closest('[data-lang]'); if (!b) return; set(b.dataset.lang); };
      extra.appendChild(row);
    }
  }
  function start() {
    picker();
    let want = null; try { want = localStorage.getItem(KEY); } catch {}
    if (!want) { const nav = (navigator.languages || [navigator.language || 'en']).map(x => String(x).slice(0, 2).toLowerCase()); want = nav.find(c => LANGS.some(l => l[0] === c)) || 'en'; }
    window.TribeLang.ready = apply(want);
  }
  window.TribeLang = { set, get: () => cur, langs: LANGS.map(l => l[0]), missing, t: s => { const k = norm(s); return cur !== 'en' && D[k] != null ? D[k] : s; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
