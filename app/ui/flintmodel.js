// Flint's local helper, tier 1 (feat/build-feeds, docs/FLINT-RESEARCH.md §3): a small word-embedding model the person
// opts into downloading. It lives on this device (IndexedDB) and runs in plain JS (app/ui/flintembed.js): no GPU, no
// outside service once it is here, removable at any time. With it, Flint matches by meaning:
//   · "did you mean" for a command he didn't recognize ranks his abilities by meaning (flintnlu.js setSemantic)
//   · help answers from the docs are re-ranked by meaning (flintlocal.js kbAnswer -> rerank)
//   · the Ctrl+K palette finds docs, tasks and chat messages by meaning (a TribePalette provider)
// Without it everything works exactly as before; nothing is downloaded until the person presses Download.
//   window.TribeFlintModel = { open(), close(), install(onProgress?), remove(), ready(), installed(), status(), info(),
//                              embed(text), rerank(q, items, textOf, baseOf?), search(q, k?), whenReady }
(function () {
  'use strict';
  const C = window.TribeClient, KEY = 'tribecode.flintmodel', DBN = 'tribecode-flint-model', STORE = 'files';
  // The documented default (the same as server/flintmodel.js): a Model2Vec static embedding model, MIT.
  const DEFAULT = { name: 'potion-base-8M', base: 'https://huggingface.co/minishlab/potion-base-8M/resolve/main/', card: 'https://huggingface.co/minishlab/potion-base-8M', license: 'MIT', approx: 30 * 1024 * 1024, files: { model: 'model.safetensors', tokenizer: 'tokenizer.json', config: 'config.json' }, hosted: false };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const mb = n => (n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024 * 10) / 10} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const flag = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const setFlag = v => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch {} };
  let M = null, loading = null, abort = null, root = null, lastFocus = null;

  // ---------- storage: IndexedDB on this device ----------
  const db = () => new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const d = await db(); try { return await new Promise((res, rej) => { const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result); t.onerror = t.onabort = () => rej(t.error || new Error('storage failed')); }); } finally { d.close(); } };
  const put = (k, v) => tx('readwrite', s => s.put(v, k));
  const get = k => tx('readonly', s => s.get(k));
  const wipe = () => tx('readwrite', s => s.clear());

  async function info() {
    if (C && C.connected && C.connected()) { try { const i = await C.api('/flint/model'); if (i && i.base && i.files) return i; } catch {} }
    return { ...DEFAULT };
  }
  function activate(model, meta) {
    M = model; corpus = null;
    if (window.TribeNLU && window.TribeNLU.setSemantic) window.TribeNLU.setSemantic(model);
    if (meta) setFlag(meta);
    try { document.dispatchEvent(new CustomEvent('flintmodel', { detail: { ready: !!model } })); } catch {}
  }
  // On start: a model that is already on this device loads quietly; nothing is ever fetched here.
  function boot() {
    if (!flag() || M || loading) return loading || Promise.resolve(!!M);
    loading = (async () => {
      try {
        const [model, tokenizer, config] = await Promise.all([get('model'), get('tokenizer'), get('config')]);
        if (!model || !tokenizer) { setFlag(null); return false; }
        activate(window.TribeEmbed.fromFiles({ model, tokenizer, config, name: (flag() || {}).name }));
        return true;
      } catch (e) { console.warn('Flint local helper:', e.message); return false; } finally { loading = null; }
    })();
    return loading;
  }
  async function download(url, signal, onBytes, auth) {
    const r = await fetch(url, { signal, headers: auth || {}, cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error(r.status === 404 ? 'The model file isn’t at that address.' : `The download didn’t start (${r.status}).`);
    const total = Number(r.headers.get('content-length')) || 0;
    if (!r.body || !r.body.getReader) { const b = await r.arrayBuffer(); onBytes(b.byteLength, b.byteLength); return b; }
    const rd = r.body.getReader(), chunks = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onBytes(n, total); }
    const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return out.buffer;
  }
  async function install(onProgress) {
    if (!window.TribeEmbed) throw new Error('The helper’s code didn’t load. Reload and try again.');
    const i = await info(), tk = (() => { try { return ((window.TribeStore.get() || {}).server || {}).token || ''; } catch { return ''; } })(), own = i.hosted && tk ? { Authorization: 'Bearer ' + tk } : null;
    const at = f => (i.hosted ? (C.base ? C.base() : '') : '') + i.base + f;
    abort = new AbortController();
    try {
      const say = (n, total) => onProgress && onProgress({ got: n, total: total || i.bytes || i.approx || 0 });
      const tokenizer = new TextDecoder().decode(await download(at(i.files.tokenizer), abort.signal, () => {}, own));
      let config = null; try { config = new TextDecoder().decode(await download(at(i.files.config), abort.signal, () => {}, own)); JSON.parse(config); } catch (e) { if (e.name === 'AbortError') throw e; config = null; }
      const model = await download(at(i.files.model), abort.signal, say, own);
      const built = window.TribeEmbed.fromFiles({ model, tokenizer, config, name: i.name });   // checked before it is kept
      await wipe(); await put('model', model); await put('tokenizer', tokenizer); if (config) await put('config', config);
      activate(built, { name: i.name, bytes: model.byteLength + tokenizer.length, dim: built.dim, tokens: built.vocabSize, license: i.license, from: i.hosted ? 'your tribe’s host' : new URL(i.base).host, at: new Date().toISOString() });
      return flag();
    } finally { abort = null; }
  }
  async function remove() { try { await wipe(); } catch {} setFlag(null); activate(null); return true; }

  // ---------- using it ----------
  const ready = () => !!M;
  const embed = t => (M ? M.embed(t) : null);
  // Re-rank a short list by meaning, blended with the score it came with. Each item gets .cos.
  function rerank(q, items, textOf, baseOf) {
    if (!M || !items || !items.length) return items || [];
    const qv = M.embed(q), top = Math.max(1e-6, ...items.map(a => (baseOf ? baseOf(a) : 0) || 0));
    return items.map(a => { const cos = M.sim(qv, M.embed(textOf(a))); return { ...a, cos, blend: cos * 0.6 + ((baseOf ? baseOf(a) : 0) || 0) / top * 0.4 }; }).sort((a, b) => b.blend - a.blend);
  }
  // Search by meaning across docs, tasks and recent chat (what this person can already see).
  let corpus = null, corpusAt = 0, building = null;
  async function build() {
    if (!M || !C || !C.connected || !C.connected()) return null;
    if (corpus && Date.now() - corpusAt < 60000) return corpus;
    if (building) return building;
    building = (async () => {
      const items = [], add = (kind, label, text, run, hint) => { const t = `${label} ${text || ''}`.trim(); if (t.length > 2) items.push({ kind, label: String(label).slice(0, 90), hint, run, vec: M.embed(t.slice(0, 600)) }); };
      const [docs, tasks, chans] = await Promise.all([C.api('/docs').catch(() => ({})), C.api('/tasks').catch(() => ({})), C.api('/channels').catch(() => ({}))]);
      for (const d of docs.docs || []) add('Doc', d.title || d.slug, d.summary || '', () => { window.TribeApp.show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open(d.slug), 80); });
      for (const t of tasks.tasks || []) add('Task', t.title, t.body || '', () => window.TribeApp.show('tasks'), t.status);
      const names = [...new Set(['general', ...((chans.channels || []).map(c => c.name || c.id).filter(Boolean))])].slice(0, 6);
      for (const ch of names) { let r = {}; try { r = await C.api('/chat/' + encodeURIComponent(ch)); } catch {} for (const m of (r.messages || []).filter(x => !x.deleted && x.text && x.by !== 'tribecode').slice(-150)) add('Chat', String(m.text).replace(/\s+/g, ' ').slice(0, 90), m.text, () => { window.TribeApp.show('chat'); if (window.TribeChannels && window.TribeChannels.open) try { window.TribeChannels.open(ch); } catch {} }, `#${ch}${m.byName || m.name ? ' · ' + (m.byName || m.name) : ''}`); }
      corpus = items; corpusAt = Date.now(); return items;
    })().finally(() => { building = null; });
    return building;
  }
  function searchNow(q, k = 5, min = 0.42) {
    if (!M || !corpus) return [];
    const qv = M.embed(q), out = [];
    for (const it of corpus) { const s = M.sim(qv, it.vec); if (s >= min) out.push({ ...it, score: s }); }
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
  async function search(q, k) { await build(); return searchNow(q, k); }
  // The palette: rows found by meaning sit under exact matches and above loose letter matches.
  function paletteRows(q) {
    if (!M || !q || q.length < 3) return [];
    if (!corpus || Date.now() - corpusAt > 60000) { build().then(c => { const i = document.getElementById('pal-input'); if (c && i && !document.getElementById('palette').classList.contains('hidden') && i.value.trim().toLowerCase() === q) i.dispatchEvent(new Event('input', { bubbles: true })); }); if (!corpus) return []; }
    return searchNow(q, 4).filter(it => !it.label.toLowerCase().includes(q)).map(it => ({ kind: it.kind, label: it.label, hint: `by meaning${it.hint ? ' · ' + it.hint : ''}`, score: 30 + it.score * 20, run: it.run, sem: true }));
  }
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(paletteRows);

  // ---------- the opt-in sheet ----------
  function close() { if (!root) return; if (abort) abort.abort(); root.remove(); root = null; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }
  async function open() {
    lastFocus = document.activeElement; if (root) root.remove();
    root = document.createElement('div'); root.id = 'flint-model'; root.className = 'fmd'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Flint’s local helper');
    document.body.appendChild(root);
    root.onclick = e => { if (e.target === root) close(); };
    root.onkeydown = e => { if (e.key === 'Escape') close(); };
    await draw();
  }
  async function draw(err) {
    if (!root) return;
    const i = await info(), f = flag(), conn = navigator.connection || {}, metered = !!(conn.saveData || conn.type === 'cellular' || /(^|-)2g$|^3g$/.test(conn.effectiveType || ''));
    const size = i.bytes ? mb(i.bytes) : `about ${mb(i.approx)}`, host = i.hosted ? 'your tribe’s host' : new URL(i.base).host;
    if (!root) return;
    root.innerHTML = `<div class="fmd-card">
      <header class="fmd-head"><div><span class="eyebrow">Flint · level 1</span><h2>Local helper</h2></div><button type="button" class="btn ghost" id="fmd-x" aria-label="Close">✕</button></header>
      <p class="fmd-lead">A small model that knows which words mean similar things. With it, Flint finds what you meant even when you use different words: better “did you mean”, better help answers, and search by meaning across docs, tasks and chat.</p>
      <ul class="fmd-facts">
        <li><span>Model</span><b id="fmd-name">${esc(i.name)}</b><small>${esc(i.license)} license${i.card ? ` · <a href="${esc(i.card)}" target="_blank" rel="noopener noreferrer">model card</a>` : ''}</small></li>
        <li><span>Size</span><b id="fmd-size">${esc(size)}</b><small>Downloaded once, kept on this device.</small></li>
        <li><span>Comes from</span><b id="fmd-from">${esc(host)}</b><small>${i.hosted ? 'Your host keeps a copy, so nothing outside your tribe is contacted.' : 'One download from the model’s publisher. After that it runs here and nothing you type leaves this device for it.'}</small></li>
      </ul>
      ${f ? `<div class="fmd-state on" id="fmd-installed"><b>Installed</b><span>${esc(f.name)} · ${esc(mb(f.bytes || 0))} on this device${M ? '' : ' · loading…'}</span></div>
        <form class="fmd-try" id="fmd-try" autocomplete="off"><label for="fmd-q">Try it: search by meaning</label><div class="fmd-row"><input class="input" id="fmd-q" placeholder="Words that are not in the title…"><button class="btn sm">Search</button></div><ul id="fmd-hits" class="fmd-hits" aria-live="polite"></ul></form>
        <div class="fmd-acts"><button type="button" class="btn" id="fmd-remove">Remove from this device</button><button type="button" class="btn ghost" id="fmd-done">Done</button></div>`
      : `<p class="fmd-hint${metered ? ' warn' : ''}" id="fmd-wifi">${metered ? 'You look to be on mobile data or a data saver. This download is best on Wi-Fi.' : 'Best on Wi-Fi. You can remove it at any time.'}</p>
        ${err ? `<p class="fmd-err" id="fmd-err" role="alert">${esc(err)}</p>` : ''}
        <div class="fmd-prog" id="fmd-prog" hidden><span class="fmd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Download"><i></i></span><small id="fmd-pct">Starting…</small></div>
        <div class="fmd-acts"><button type="button" class="btn primary" id="fmd-get">Download (${esc(size)})</button><button type="button" class="btn ghost" id="fmd-done">Not now</button></div>`}
      <p class="fmd-foot">Everything Flint does today works without this. Want Flint to write, not only match? <button type="button" class="linkish" id="fmd-brain">Set up a bigger local model</button></p>
    </div>`;
    const $ = s => root.querySelector(s);
    $('#fmd-x').onclick = close; $('#fmd-done').onclick = close;
    $('#fmd-brain').onclick = () => { close(); if (window.TribeFlintPage) window.TribeFlintPage.close(); if (window.TribeBrain && window.TribeBrain.open) window.TribeBrain.open(); };
    if ($('#fmd-get')) $('#fmd-get').onclick = async () => {
      const b = $('#fmd-get'); b.disabled = true; b.textContent = 'Downloading…'; $('#fmd-prog').hidden = false; $('#fmd-done').textContent = 'Cancel';
      try {
        await install(p => { if (!root) return; const pct = p.total ? Math.min(100, Math.round(p.got / p.total * 100)) : 0, bar = root.querySelector('.fmd-bar'); if (!bar) return; bar.setAttribute('aria-valuenow', pct); bar.firstElementChild.style.width = pct + '%'; root.querySelector('#fmd-pct').textContent = `${mb(p.got)}${p.total ? ` of ${mb(p.total)}` : ''}`; });
        toast('Flint’s local helper is on'); draw();
      } catch (e) { if (root) draw(e.name === 'AbortError' ? '' : /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? `Couldn’t reach ${host}. Check the connection and try again; nothing was installed.` : `${e.message} Nothing was installed.`); }
    };
    if ($('#fmd-remove')) $('#fmd-remove').onclick = async () => { await remove(); toast('Removed. Flint works as before.'); draw(); };
    if ($('#fmd-try')) $('#fmd-try').onsubmit = async e => {
      e.preventDefault(); const q = $('#fmd-q').value.trim(), box = $('#fmd-hits'); if (!q) return;
      await (loading || Promise.resolve()); const hits = await search(q, 5);
      box.innerHTML = hits.length ? hits.map(h => `<li><span class="fmd-k">${esc(h.kind)}</span><span class="fmd-l">${esc(h.label)}</span><small>${Math.round(h.score * 100)}%</small></li>`).join('') : `<li class="faint">${C && C.connected && C.connected() ? 'Nothing close to that in your docs, tasks or chat.' : 'Connect to a tribe to search its docs, tasks and chat.'}</li>`;
    };
    setTimeout(() => { const b = root && (root.querySelector('#fmd-get') || root.querySelector('#fmd-q') || root.querySelector('#fmd-x')); if (b) b.focus(); }, 30);
  }

  const whenReady = () => boot();
  if (flag()) (window.requestIdleCallback || (f => setTimeout(f, 800)))(() => boot());
  window.TribeFlintModel = { open, close, install, remove, ready, installed: () => !!flag(), status: () => ({ ready: !!M, installed: flag() }), info, embed, rerank, search, whenReady, DEFAULT };
})();
