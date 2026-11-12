// Ask once before data first goes to a cloud AI (App Store 5.1.2, docs/APP-STORE.md). The tribe's brain can be the host's
// cloud key (server/llm.js: OpenAI, Anthropic, Gemini, OpenRouter, Groq, a custom URL). Before this device first sends
// anything to one of them (a ✦ refine, a Flint question, the design canvas's ✦), a small sheet names the provider and
// asks. The answer is remembered per device and per provider; Settings › Privacy & safety lists them with Revoke.
// Local models (Ollama on the host, Built in / WebLLM in the browser) never ask: nothing leaves your machines.
//   window.TribeAIConsent = { status(force) -> { online, via, cloud, provider }, ensure(st?) -> Promise<boolean>,
//                             granted(provider), allow(provider), revoke(provider), list() -> [{ provider, label, at }], LABELS }
(function () {
  'use strict';
  const KEY = 'tribecode.aiconsent.v1';
  const LABELS = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', openrouter: 'OpenRouter', groq: 'Groq', custom: 'a custom AI service' };
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
  const granted = p => !!(p && read()[p]);
  function allow(p) { if (!p) return; const o = read(); o[p] = { at: new Date().toISOString() }; write(o); try { dispatchEvent(new CustomEvent('tribe-ai-consent', { detail: { provider: p, granted: true } })); } catch {} }
  function revoke(p) { const o = read(); delete o[p]; write(o); try { dispatchEvent(new CustomEvent('tribe-ai-consent', { detail: { provider: p, granted: false } })); } catch {} }
  const list = () => Object.entries(read()).map(([provider, v]) => ({ provider, label: LABELS[provider] || provider, at: v && v.at }));

  // what the tribe's brain is right now (GET /api/ai/basic, cached half a minute)
  let st = null, at = 0;
  async function status(force) {
    const c = C(); if (!c || !c.connected || !c.connected()) return { online: false };
    if (!force && st && Date.now() - at < 30000) return st;
    try { const r = await c.api('/ai/basic'); st = { online: !!r.online, via: r.via || '', cloud: !!r.cloud, provider: r.provider || '' }; } catch { st = { online: false }; }
    at = Date.now(); return st;
  }
  addEventListener('tribe-brain', () => { at = 0; });

  // true = go ahead (a local model, or already allowed); false = keep it on the device (the basic answer stands)
  let pending = null;
  async function ensure(s) {
    s = s || await status();
    if (!s || !s.cloud) return true;
    const p = s.provider || 'custom';
    if (granted(p)) return true;
    if (pending) return pending;
    pending = new Promise(resolve => sheet(p, s.via, resolve)).finally(() => { pending = null; });
    return pending;
  }
  function sheet(p, via, resolve) {
    const label = LABELS[p] || p;
    const el = document.createElement('div'); el.className = 'aic-dlg'; el.id = 'ai-consent';
    el.innerHTML = `<div class="aic-scrim" data-aic="no"></div><section class="aic-card" role="dialog" aria-modal="true" aria-labelledby="aic-t" tabindex="-1">
      <span class="eyebrow">Privacy · asked once</span>
      <h2 id="aic-t">Send this to ${esc(label)}?</h2>
      <p class="aic-p">Your tribe's AI is a cloud service the host chose${via ? ` (${esc(via)})` : ''}. To answer, TribeCode sends ${esc(label)} the words you asked about and what's on screen for it. Nothing else, and only when you tap ✦ or ask Flint.</p>
      <p class="aic-p aic-small">Local models (Ollama on the host, or Built in on this device) don't ask: nothing leaves your machines. Change this any time in Settings › Privacy &amp; safety. <a href="privacy.html#ai" target="_blank" rel="noopener">Privacy policy</a></p>
      <div class="aic-acts"><button type="button" class="btn ghost" data-aic="no">Not now</button><button type="button" class="btn primary" data-aic="yes" id="aic-yes">Allow on this device</button></div></section>`;
    document.body.appendChild(el);
    const done = ok => {
      el.remove(); removeEventListener('keydown', key, true);
      if (ok) allow(p);
      resolve(!!ok);
    };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    addEventListener('keydown', key, true);
    el.addEventListener('click', e => { const b = e.target.closest('[data-aic]'); if (b) done(b.dataset.aic === 'yes'); });
    el.querySelector('[data-aic="no"].btn').focus({ preventScroll: true });   // "Not now" first: nothing is sent unless you choose to
  }

  window.TribeAIConsent = { status, ensure, granted, allow, revoke, list, LABELS };
})();
