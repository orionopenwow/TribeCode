// Flint's brain (feat/any-llm): pick what Flint thinks with. Settings › Flint's brain opens this sheet.
//   Built in (in your browser)  WebLLM runs Qwen3 on this device: one-time ~500 MB (0.6B) or ~1 GB (1.7B) download,
//                               cached by the browser. Needs WebGPU; where it's missing (Safari, iPhone, Firefox) we say
//                               so and suggest the host's model or a key. The script loads from the CDN only on opt-in,
//                               pinned and SHA-384 checked, in a worker without the sign-in key (app/ui/brainworker.js, fix/security-2).
//   This computer (Ollama)      the host's local model (server/brain.js)
//   A cloud model with your key OpenAI, Anthropic, Google Gemini, OpenRouter, Groq or any OpenAI-compatible URL. The
//                               key is stored on the HOST only (server/llm.js, .tribe/secrets/llm.json, 0600) and never
//                               reaches anyone's browser; friends' questions go through the host's server, if allowed.
//   None                        basic mode: Flint's built-in answers only.
// The built-in choice is per device (localStorage); the tribe's brain (Ollama / cloud / none) is the host's choice and
// is used by everything on the server: Ask AI, drafts, suggested tasks, TL;DRs, huddle notes, standups.
//   window.TribeBrain = { choice(), open(), mountRow(el), gpu(), browserReady(), askBrowser(messages, onText), info() }
(function () {
  'use strict';
  const C = window.TribeClient, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const KEY = 'tribecode.flint.brain';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const face = (sz = 28) => `<img class="fl-face" src="assets/flint.svg" alt="" width="${sz}" height="${sz}" aria-hidden="true">`;
  const choice = () => { const c = ls.get(KEY, 'host'); return ['host', 'browser', 'none'].includes(c) ? c : 'host'; };
  const setChoice = c => { ls.set(KEY, c); window.dispatchEvent(new CustomEvent('tribe-brain', { detail: { choice: c } })); };
  const isHost = () => !!(C && C.connected && C.connected() && (C.state().me || {}).role === 'host');

  // ---------- WebGPU + WebLLM ----------
  let gpuInfo = null, engine = null, loading = null, progress = null;
  const isPhoneDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && matchMedia('(max-width: 820px)').matches);
  async function gpu() {
    if (gpuInfo) return gpuInfo;
    // phones (flint-free): iPhone Safari has WebGPU from iOS 26, Android Chrome from 121. A phone always gets the smallest
    // model, with a battery and storage note; without WebGPU Flint still does edits and recipe builds with no model at all.
    const phone = isPhoneDevice();
    const no = why => (gpuInfo = { ok: false, phone, why: `${why} ${phone ? 'Flint still edits pages and builds from recipes here with no model; for chat, use the host\'s model.' : 'Use the host\'s model or a cloud key instead.'}` });
    if (!('gpu' in navigator) || !navigator.gpu) return no(phone ? 'This phone\'s browser has no WebGPU (it needs Safari on iOS 26 or later, or Chrome on Android), so the built-in model can\'t run here.' : 'This browser has no WebGPU yet (older Safari and Firefox often don\'t), so the built-in model can\'t run here.');
    let ad = null; try { ad = await navigator.gpu.requestAdapter(); } catch {}
    if (!ad) return no('WebGPU is here, but no graphics chip answered, so the built-in model can\'t run here.');
    const f16 = !!(ad.features && ad.features.has('shader-f16'));
    const big = !phone && f16 && (navigator.deviceMemory || 8) >= 8 && ((ad.limits && ad.limits.maxBufferSize) || 0) >= 2 ** 30;
    return (gpuInfo = { ok: true, phone, model: big ? 'Qwen3-1.7B-q4f16_1-MLC' : f16 ? 'Qwen3-0.6B-q4f16_1-MLC' : 'Qwen3-0.6B-q4f32_1-MLC', size: big ? 'about 1 GB' : 'about 500 MB', label: big ? 'Qwen3 1.7B' : 'Qwen3 0.6B',
      note: phone ? 'On a phone: download it on Wi-Fi, it uses some battery while it thinks, and it stays in this browser\'s storage until you clear it.' : '' });
  }
  // fix/security-2: WebLLM runs in app/ui/brainworker.js, a module worker (no localStorage there, so it never sees the sign-in
  // key), from the pinned npm file checked against its SHA-384 before it runs. The page only sends messages.
  let seq = 0, onProg = null;
  const waiting = new Map();   // request id -> { onDelta, resolve, reject }
  function spawn() {
    const w = new Worker('brainworker.js', { type: 'module', name: 'tribecode-brain' });
    w.onmessage = e => {
      const m = e.data || {};
      if (m.type === 'progress') { progress = { p: m.p || 0, text: m.text || '' }; if (onProg) onProg(progress); drawProgress(); return; }
      if (!m.id) { const l = waiting.get('load'); if (l && (m.type === 'ready' || m.type === 'error')) { waiting.delete('load'); m.type === 'ready' ? l.resolve() : l.reject(new Error(m.error)); } return; }
      const r = waiting.get(m.id); if (!r) return;
      if (m.type === 'delta') r.onDelta(m.text);
      else { waiting.delete(m.id); m.type === 'done' ? r.resolve() : r.reject(new Error(m.error)); }
    };
    w.onerror = e => { const err = new Error((e && e.message) || 'The built-in model stopped.'); waiting.forEach(r => r.reject(err)); waiting.clear(); };
    return w;
  }
  async function loadBrowser(onProgress) {
    if (engine) return engine;
    if (loading) return loading;
    loading = (async () => {
      const g = await gpu(); if (!g.ok) throw new Error(g.why);
      onProg = onProgress || null;
      const w = spawn();
      try { await new Promise((resolve, reject) => { waiting.set('load', { resolve, reject }); w.postMessage({ type: 'load', model: g.model }); }); }
      catch (e) { w.terminate(); throw e; }
      engine = { worker: w };
      progress = { p: 1, text: 'Ready' }; drawProgress();
      return engine;
    })();
    try { return await loading; } catch (e) { loading = null; progress = { p: 0, text: '', error: e.message }; drawProgress(); throw e; }
  }
  // Flint's ask path in the page: streams, nothing leaves this device.
  async function askBrowser(messages, onText) {
    const eng = await loadBrowser();
    let out = '', thinking = false;
    const id = 'q' + (++seq);
    await new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject, onDelta: t => {
        if (!t) return;
        out += t; const clean = out.replace(/<think>[\s\S]*?(<\/think>|$)/g, ''); thinking = /<think>(?![\s\S]*<\/think>)/.test(out);
        if (!thinking) onText(clean.trimStart());
      } });
      eng.worker.postMessage({ type: 'chat', id, request: { messages, max_tokens: 300, temperature: 0.3, extra_body: { enable_thinking: false } } });
    });
    return { via: `${(gpuInfo && gpuInfo.label) || 'Qwen3'} in your browser`, text: out.replace(/<think>[\s\S]*?<\/think>/g, '').trim() };
  }

  // ---------- the tribe's brain (server/llm.js) ----------
  let info = null;
  async function refresh() { if (!(C && C.connected && C.connected())) return (info = null); try { info = await C.api('/llm'); } catch { info = null; } return info; }
  const hostLabel = () => !info ? 'not connected' : info.online ? (info.you.block ? info.you.block : `${info.via}${info.cloud ? ' · the host\'s key' : ''}`) : info.provider === 'none' ? 'off on the host' : info.cloud && !info.ready ? 'the host is still setting it up' : 'no model on the host right now';
  function label() {
    const c = choice();
    if (c === 'browser') return engine ? `${(gpuInfo && gpuInfo.label) || 'Qwen3'} in your browser` : 'Built in (in your browser)';
    if (c === 'none') return 'None · basic mode';
    return info && info.online && !info.you.block ? info.via : 'Basic mode for now';
  }

  // ---------- the sheet ----------
  let draft = null, busy = false;
  const modal = () => $('#brain-modal');
  function ensure() {
    if (modal()) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="brain-modal" role="dialog" aria-label="Flint\'s brain"><div class="modal-card bp-card" id="brain-body"></div></div>');
    modal().addEventListener('click', e => { if (e.target === modal()) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal() && !modal().classList.contains('hidden')) close(); });
  }
  function close() { if (modal()) modal().classList.add('hidden'); rows.forEach(drawRow); }
  async function open() {
    ensure(); modal().classList.remove('hidden');
    $('#brain-body').innerHTML = `<p class="faint">Looking…</p>`;
    await Promise.all([refresh(), gpu()]);
    draft = null; draw();
  }
  function selected() {
    const c = choice();
    if (c !== 'host') return c;
    if (!isHost()) return 'host';
    return !info ? 'none' : info.provider === 'ollama' ? 'ollama' : info.provider === 'none' ? 'none' : 'cloud';
  }
  const opt = (k, title, sub, body, attrs = '') => { const on = selected() === k; return `<div class="bp-opt${on ? ' on' : ''}" data-opt="${k}">
      <button type="button" class="bp-pick" role="radio" aria-checked="${on}" data-bp="${k}" ${attrs}><span class="bp-dot" aria-hidden="true"></span><span class="bp-t"><b>${title}</b><small>${sub}</small></span></button>${on || k === 'browser' ? body : ''}</div>`; };
  function browserBody() {
    const g = gpuInfo || {};
    if (!g.ok) return `<p class="bp-nogpu" id="bp-gpu">${esc(g.why || 'Checking WebGPU…')}</p>`;
    if (choice() !== 'browser') return '';
    return `<div class="bp-body"><p class="bp-note">One-time download of ${esc(g.size)} (${esc(g.label)}), kept in this browser's cache. It runs on your graphics chip; nothing you ask leaves this device.${g.note ? ' ' + esc(g.note) : ''}</p>
      <div class="bp-prog" id="bp-prog">${progHtml()}</div>${engine ? '' : `<button class="btn primary" id="bp-load"${loading ? ' disabled' : ''}>${loading ? 'Downloading…' : 'Download and start'}</button>`}</div>`;
  }
  const progHtml = () => progress ? (progress.error ? `<p class="bp-err">${esc(progress.error)}</p>` : `<div class="bp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress.p * 100)}"><i style="width:${Math.round(progress.p * 100)}%"></i></div><small class="faint">${esc(progress.p >= 1 ? 'Ready: Flint thinks on this device.' : progress.text.slice(0, 90))}</small>`) : '';
  function drawProgress() { const el = $('#bp-prog'); if (el) el.innerHTML = progHtml(); const b = $('#bp-load'); if (b && engine) b.remove(); rows.forEach(drawRow); }
  function cloudBody() {
    const i = info || {}, list = (i.providers || []).filter(p => p.cloud);
    const cur = draft || { provider: i.cloud ? i.provider : 'openai', model: i.cloud ? i.model : '', baseUrl: i.baseUrl || '', friends: i.friends !== false, cap: i.cap ?? 50 };
    draft = cur;
    const P = list.find(p => p.id === cur.provider) || list[0] || {};
    return `<div class="bp-body bp-cloud">
      <div class="bp-grid">
        <label class="bp-f"><span class="eyebrow">Provider</span><select class="input" id="bp-provider">${list.map(p => `<option value="${p.id}" ${p.id === cur.provider ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
        <label class="bp-f"><span class="eyebrow">Model</span><input class="input" id="bp-model" spellcheck="false" autocomplete="off" placeholder="${esc(P.model || 'model name')}" value="${esc(cur.model)}"></label>
        ${cur.provider === 'custom' ? `<label class="bp-f bp-wide"><span class="eyebrow">Base URL</span><input class="input" id="bp-base" spellcheck="false" autocomplete="off" placeholder="http://localhost:1234/v1 (LM Studio, vLLM, Together…)" value="${esc(cur.baseUrl)}"></label>` : ''}
        <label class="bp-f bp-wide"><span class="eyebrow">API key${cur.provider === 'custom' ? ' (if it needs one)' : ''}</span><input class="input" id="bp-key" type="password" spellcheck="false" autocomplete="off" placeholder="${i.hasKey && i.provider === cur.provider ? 'Saved on this computer. Leave empty to keep it.' : 'Paste your key'}"></label>
      </div>
      ${P.keys ? `<p class="bp-note"><a href="${esc(P.keys)}" target="_blank" rel="noopener">Get a ${esc(P.label)} key</a>. It stays on this computer (the host), in a file only you can read. It is never shown to friends or sent to their browsers.</p>` : '<p class="bp-note">The key (if any) stays on this computer, in a file only you can read.</p>'}
      <div class="bp-friends"><div><b>Friends can use it</b><small>Their Flint asks go through this computer. A soft daily limit per friend.</small></div>
        <input class="input bp-cap" id="bp-cap" type="number" min="0" max="10000" value="${esc(cur.cap)}" aria-label="Daily limit per friend" title="Daily limit per friend (0 = no limit)">
        <button class="toggle set-toggle" role="switch" id="bp-friends" aria-label="Friends can use it" aria-checked="${!!cur.friends}"><span class="switch"></span></button></div>
      <div class="bp-acts"><button class="btn primary" id="bp-save">Save</button><button class="btn" id="bp-test">Test</button><span class="bp-res faint" id="bp-res"></span></div></div>`;
  }
  function draw() {
    const box = $('#brain-body'); if (!box) return;
    const host = isHost(), i = info;
    const ollamaSub = i && i.ollama.online ? `${esc(i.ollama.model)} is ready on ${host ? 'this computer' : 'the host'}.` : `Not found. Install Ollama (ollama.com), then <code>ollama pull qwen3</code>.`;
    const opts = [
      opt('browser', 'Built in · in your browser', 'Qwen3 runs on this device with WebGPU. Free, private, works offline once downloaded.', browserBody()),
      ...(host ? [
        opt('ollama', 'This computer (Ollama)', ollamaSub, ''),
        opt('cloud', 'A cloud model with your own key', 'OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, or any OpenAI-compatible URL (LM Studio, vLLM, Together…).', cloudBody()),
      ] : [
        opt('host', 'The host\'s brain', esc(hostLabel()), '', i && (!i.online || i.you.block) ? 'data-off="1"' : ''),
      ]),
      opt('none', 'None · basic mode', 'Flint answers what it knows by heart: notes, tasks, invites, the Guide.', ''),
    ];
    box.innerHTML = `<header class="bp-head"><span class="bp-face">${face(30)}</span><div class="bp-ht"><span class="eyebrow">Flint's brain</span><h2>What Flint thinks with</h2></div><button class="btn ghost" id="bp-close">Done</button></header>
      <p class="bp-lead">${host ? 'Your choice for the tribe also writes summaries, drafts, suggested tasks, huddle notes and standups.' : 'Built in runs on your device. The host\'s brain is whatever the host picked.'}</p>
      <div class="bp-opts" role="radiogroup" aria-label="Flint's brain">${opts.join('')}</div>`;
    wire();
  }
  async function put(body) {
    busy = true;
    try { info = await C.api('/llm', { method: 'PUT', body }); return true; } catch (e) { toast(e.message); return false; } finally { busy = false; }
  }
  function readForm() {
    const v = id => { const el = $(id); return el ? el.value.trim() : undefined; };
    return { provider: v('#bp-provider'), model: v('#bp-model'), ...(draft && draft.provider === 'custom' ? { baseUrl: v('#bp-base') } : {}), friends: $('#bp-friends') ? $('#bp-friends').getAttribute('aria-checked') === 'true' : undefined, cap: Number(v('#bp-cap') || 0) };
  }
  function wire() {
    $('#bp-close').onclick = close;
    document.querySelectorAll('#brain-body [data-bp]').forEach(b => b.onclick = async () => {
      const k = b.dataset.bp; if (busy) return;
      if (k === 'browser') { if (!(gpuInfo && gpuInfo.ok)) { toast('The built-in model needs WebGPU, which this browser doesn\'t have.'); return; } setChoice('browser'); }
      else if (k === 'host') setChoice('host');
      else if (k === 'none') { setChoice('none'); if (isHost()) await put({ provider: 'none' }); }
      else if (k === 'ollama') { setChoice('host'); await put({ provider: 'ollama' }); }
      else if (k === 'cloud') { setChoice('host'); if (info && !info.cloud) info = { ...info, provider: (draft && draft.provider) || 'openai', cloud: true }; }
      draw();
    });
    const ld = $('#bp-load'); if (ld) ld.onclick = () => { ld.disabled = true; ld.textContent = 'Downloading…'; loadBrowser().then(() => { toast('Flint now thinks on this device.'); draw(); }).catch(e => toast(e.message)); };
    const pv = $('#bp-provider'); if (pv) pv.onchange = () => { draft = { ...draft, ...readForm(), provider: pv.value, model: '' }; draw(); };
    const fr = $('#bp-friends'); if (fr) fr.onclick = () => { fr.setAttribute('aria-checked', String(fr.getAttribute('aria-checked') !== 'true')); draft = { ...draft, friends: fr.getAttribute('aria-checked') === 'true' }; };
    const sv = $('#bp-save'); if (sv) sv.onclick = async () => {
      const f = readForm(), key = $('#bp-key').value.trim(); draft = { ...draft, ...f };
      if (await put({ ...f, ...(key ? { key } : {}) })) { $('#bp-key').value = ''; draft = null; toast(info.ready ? `Flint now answers with ${info.via}.` : 'Saved. Add a key to finish.'); draw(); if (info.ready) test(); }
    };
    const ts = $('#bp-test'); if (ts) ts.onclick = test;
  }
  async function test() {
    const res = $('#bp-res'); if (res) res.textContent = 'Testing…';
    try { const r = await C.api('/llm/test', { method: 'POST' }); const el = $('#bp-res'); if (el) { el.textContent = r.ok ? `Works · via ${r.via}` : r.error; el.classList.toggle('ok', !!r.ok); el.classList.toggle('bad', !r.ok); }
      if (r.ok && window.TribeFlintGuide && !matchMedia('(max-width: 820px)').matches && document.querySelector('#flint')) { close(); window.TribeFlintGuide.point('#flint', `I think with ${r.via} now. Ask me anything down here.`).catch(() => {}); }
    } catch (e) { if (res) res.textContent = e.message; }
  }

  // ---------- Settings row ----------
  const rows = new Set();
  function drawRow(el) { if (!el.isConnected) { rows.delete(el); return; } el.innerHTML = `<span class="set-brain bp-row-l">${face(16)}<span>${esc(label())}</span></span><button class="btn" data-bp-open>Choose</button>`; el.querySelector('[data-bp-open]').onclick = open; }
  function mountRow(el) { rows.add(el); drawRow(el); refresh().then(() => drawRow(el)); }

  window.TribeBrain = { choice, setChoice, open, close, mountRow, gpu, browserReady: () => !!engine, loadBrowser, askBrowser, info: () => info, refresh, label, WEBLLM: 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/lib/index.js' };   // fix/security-2: loaded in brainworker.js
})();
