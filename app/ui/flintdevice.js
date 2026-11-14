// "Running on your device" (feat/flint-local): the panel on Flint's page that shows local AI plainly. What this device
// has (WebGPU or not, processor cores, the browser's memory hint, free storage), which of Flint's levels are active,
// what was downloaded and how big it is, a self-test the person runs (how long Flint takes to understand a command,
// how many sentences a second the local brain turns into vectors, how many tokens a second the local model writes),
// and what leaves this device (nothing, unless they connect their own AI or use credits).
// Every number is measured here, now, on this device; nothing is estimated from a table and nothing is sent anywhere.
//   window.TribeFlintDevice = { html(), bind(root), caps() -> Promise, selfTest() -> Promise<{ parseMs, embedsPerSec, tokensPerSec }> }
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = n => (n >= 1024 ** 3 ? `${Math.round(n / 1024 ** 3 * 10) / 10} GB` : n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const FM = () => window.TribeFlintModel, LLM = () => window.TribeFlintLLM, B = () => window.TribeBrain;
  async function caps() {
    const out = { gpu: false, gpuNote: '', cores: navigator.hardwareConcurrency || 0, memory: navigator.deviceMemory || 0, free: null, quota: null, phone: !!(FM() && FM().isPhone && FM().isPhone()), desktopApp: !!(window.__TAURI__ || window.__TAURI_INTERNALS__) };
    if (navigator.gpu) { try { const ad = await navigator.gpu.requestAdapter(); if (ad) { out.gpu = true; let info = ad.info || null; try { if (!info && ad.requestAdapterInfo) info = await ad.requestAdapterInfo(); } catch {} out.gpuNote = info ? [info.vendor, info.architecture || info.device].filter(Boolean).join(' ') : ''; } else out.gpuNote = 'WebGPU is here, but no graphics chip answered'; } catch { out.gpuNote = 'WebGPU did not start'; } }
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e && typeof e.quota === 'number') { out.quota = e.quota; out.free = Math.max(0, e.quota - (e.usage || 0)); } } } catch {}
    return out;
  }
  const SAMPLE = ['add a task to buy milk tomorrow for maya', 'switch to dark theme', 'make a landing page for sunrise bakery', 'tell everyone the build is up', 'what are my tasks', 'set a timer for 10 minutes', 'schedule a demo friday at 3pm', 'make a 5 slide pitch from the vision doc', 'ad a tsk to cal the venue', 'where is maya'];
  async function selfTest() {
    const N = window.TribeNLU, res = { parseMs: null, embedsPerSec: null, tokensPerSec: null, firstMs: null, llmError: '' };
    if (N) { const ctx = { now: new Date(), members: [{ id: 'm1', name: 'Maya Lee' }], tasks: [] }, times = []; for (let r = 0; r < 4; r++) for (const t of SAMPLE) { const t0 = performance.now(); N.parse(t, ctx); times.push(performance.now() - t0); } times.sort((a, b) => a - b); res.parseMs = Math.round(times[times.length >> 1] * 100) / 100; res.parsed = times.length; }
    const M = FM();
    if (M && M.ready()) { const t0 = performance.now(); let n = 0; while (performance.now() - t0 < 250) { for (const t of SAMPLE) M.embed(t); n += SAMPLE.length; } res.embedsPerSec = Math.round(n / ((performance.now() - t0) / 1000)); }
    const L = LLM();
    if (L && L.ready()) { try { const s = await L.speed(); if (s) { res.tokensPerSec = s.tokensPerSec; res.firstMs = s.firstMs; } } catch (e) { res.llmError = e.message; } }
    return res;
  }
  const row = (k, v, note) => `<li><span>${esc(k)}</span><b>${v}</b>${note ? `<small>${note}</small>` : ''}</li>`;
  function levels() {
    const P = window.TribeFlintPage, lv = P && P.level ? P.level() : 'none', m = FM() && FM().installed(), l = LLM() && LLM().ready();
    return [['No AI', true], ['Local brain', !!m], ['Local model', !!l || lv === 'local'], ['Your AI', lv === 'yours'], ['Credits', lv === 'credits']];
  }
  function downloads() {
    const out = [], f = FM() && FM().status().installed, L = LLM(), c = L ? L.config() : {};
    if (f) out.push(`<li><b>${esc(f.name)}</b><small>the local brain · ${esc(size(f.bytes || 0))} · from ${esc(f.from || 'its publisher')} · kept in this browser</small></li>`);
    if (L && L.ready() && c.backend !== 'browser') out.push(`<li><b>${esc(c.model)}</b><small>the local model · kept by the model server on ${c.backend === 'host' ? 'your tribe’s host' : 'this computer'} (its size is shown there)</small></li>`);
    if (B() && B().browserReady && B().browserReady()) out.push('<li><b>The built-in model</b><small>in this browser’s cache · about 500 MB to 1 GB</small></li>');
    return out;
  }
  const shell = () => `<section class="fpg-sec fdv" id="fp-device" aria-label="Running on your device">
      <div class="fpg-sh"><h2>Running on your device</h2><span class="faint">local AI, in plain numbers</span></div>
      <p class="fdv-lead">Most of Flint is ordinary code that runs right here: no server, no AI service. The levels above add small models that also run on hardware you control. This is what this device has and how fast it goes.</p>
      <div class="fdv-grid"><div class="fdv-box"><h3 class="eyebrow">This device</h3><ul class="fdv-facts" id="fdv-caps"><li><span>Checking…</span></li></ul></div>
        <div class="fdv-box"><h3 class="eyebrow">Active now</h3><ul class="fdv-levels" id="fdv-levels"></ul><h3 class="eyebrow fdv-gap">Downloaded</h3><ul class="fdv-dl" id="fdv-dl"></ul></div></div>
      <div class="fdv-box fdv-test"><div class="fdv-test-h"><h3 class="eyebrow">Self-test</h3><button type="button" class="btn sm" id="fdv-run">Run the self-test</button></div>
        <ul class="fdv-facts" id="fdv-res"><li><span>Not run yet</span><b>–</b><small>Takes a second or two. Everything it measures happens on this device.</small></li></ul></div>
      <div class="fdv-box fdv-priv"><h3 class="eyebrow">What leaves this device</h3><p id="fdv-priv"><b>Nothing</b>, for any of the above: what you type to Flint with no AI, with the local brain or with a local model stays on hardware you control.</p>
        <ul class="fdv-out"><li>Downloading a model asks its publisher (or your host) for the file once. None of your words go with that request.</li><li><b>Your own AI</b>, only if you connect one: what you ask Flint then goes to that provider, through your host.</li><li><b>Credits</b>, only if you use them: the same requests go to the model the credits pay for.</li></ul></div>
    </section>`;
  async function fill(root) {
    const box = root.querySelector('#fp-device'); if (!box) return;
    box.querySelector('#fdv-levels').innerHTML = levels().map(([t, on]) => `<li class="${on ? 'on' : ''}"><i aria-hidden="true">${on ? '●' : '○'}</i>${esc(t)}<small>${on ? 'active' : 'off'}</small></li>`).join('');
    const dl = downloads(); box.querySelector('#fdv-dl').innerHTML = dl.length ? dl.join('') : '<li class="faint">Nothing yet. Flint’s rules need no download.</li>';
    const c = await caps(); if (!box.isConnected) return;
    box.querySelector('#fdv-caps').innerHTML = [
      row('Graphics', c.gpu ? 'WebGPU: yes' : 'WebGPU: no', c.gpu ? `${esc(c.gpuNote || 'a graphics chip answered')}. A model can run inside this ${c.desktopApp ? 'app' : 'browser'}.` : `${esc(c.gpuNote || 'This browser has no WebGPU')}. Flint’s rules and the local brain don’t need it; a model inside the ${c.desktopApp ? 'app' : 'browser'} does. A local server (Ollama) works without it.`),
      row('Processor', c.cores ? `${c.cores} cores` : 'not told', c.cores ? '' : 'This browser doesn’t say.'),
      row('Memory', c.memory ? `${c.memory >= 8 ? 'at least ' : 'about '}${c.memory} GB` : 'not told', c.memory ? 'A rounded hint from the browser, capped at 8.' : 'This browser doesn’t share a memory hint.'),
      row('Free storage', c.free != null ? esc(size(c.free)) : 'not told', c.free != null ? 'What this site may still use on this device.' : ''),
    ].join('');
  }
  function bind(root) {
    const run = root.querySelector('#fdv-run'); if (!run || run._b) return; run._b = true;
    run.onclick = async () => {
      run.disabled = true; run.textContent = 'Running…'; const out = root.querySelector('#fdv-res');
      let r; try { r = await selfTest(); } catch (e) { r = { err: e.message }; }
      const fmt = n => Number(n).toLocaleString('en-US');
      out.innerHTML = r.err ? row('The test stopped', '–', esc(r.err)) : [
        row('Understand a command', r.parseMs != null ? `${r.parseMs} ms` : '–', r.parseMs != null ? `The middle of ${r.parsed} runs over ${SAMPLE.length} everyday commands, with no model.` : 'Flint’s rules didn’t load.'),
        row('Local brain', r.embedsPerSec != null ? `${fmt(r.embedsPerSec)} sentences a second` : 'not installed', r.embedsPerSec != null ? 'Sentences turned into meaning vectors, in plain JavaScript on the processor.' : 'Give Flint a local brain to measure this.'),
        row('Local model', r.tokensPerSec != null ? `about ${r.tokensPerSec} tokens a second` : r.llmError ? 'did not answer' : 'not chosen', r.tokensPerSec != null ? `First word after ${fmt(r.firstMs)} ms. Counted as characters ÷ 4, so it is approximate.` : r.llmError ? esc(r.llmError) : 'Choose a local model (level 2) to measure this.'),
      ].join('');
      out.dataset.done = '1'; run.disabled = false; run.textContent = 'Run it again';
    };
    fill(root);
  }
  document.addEventListener('flintmodel', () => { const r = document.getElementById('flint-page'); if (r && !r.hidden) fill(r); });
  document.addEventListener('flintllm', () => { const r = document.getElementById('flint-page'); if (r && !r.hidden) fill(r); });
  window.TribeFlintDevice = { html: shell, bind, caps, selfTest, fill };
})();
