// One way to say "this needs an AI" (feat/flint-site, docs/DESIGN-SYSTEM.md §11). When a request needs an AI and none is
// connected, Flint says plainly what he did for free and what an AI would add, with two buttons:
//   Use my AI              connect your own (Flint's brain: the built-in model, Ollama, your own key or Claude Code), free
//   Get credits / Premium  the plans and credits pop-out (TribePlans, plans.js); TribePremium.gate('credits') without it
//   Use a free AI          copy & paste with ChatGPT, Gemini, Claude, Copilot or Le Chat on a free plan (aibridge.js)
// The same words everywhere: the Flint chat, the design canvas, the preview and the website designer.
//   window.TribeBoost = { html({ did, would, ask }), bind(root, { onAI }), online() -> Promise<bool>, LINE }
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINE = 'This one needs an AI.';
  function html({ did, would, ask } = {}) {
    return `<div class="boost" role="group" aria-label="${esc(LINE)}"${ask ? ` data-ref="${esc(String(ask).slice(0, 400))}"` : ''}>
      <p class="boost-t"><b>${esc(LINE)}</b>${ask ? ` <span class="boost-ask">“${esc(String(ask).slice(0, 120))}”</span>` : ''}</p>
      <p class="boost-row"><span class="boost-k">Free · no AI</span><span>${esc(did || 'Nothing changed yet. I only do what I can do for sure.')}</span></p>
      <p class="boost-row"><span class="boost-k is-ai">With an AI</span><span>${esc(would || 'It reads what you mean and makes the change, even when it is not one of my commands.')}</span></p>
      <p class="boost-acts"><button type="button" class="btn sm primary" data-boost="ai" title="Connect your own AI: the built-in model, Ollama, your own key or Claude Code. Free.">Use my AI <span class="boost-sub">free</span></button><button type="button" class="btn sm" data-boost="credits" aria-haspopup="dialog">Get credits / Premium</button>${window.TribeAIBridge ? '<button type="button" class="btn sm" data-boost="free" title="Copy what the AI needs, paste it into ChatGPT, Gemini or another free chat, then paste its answer back">Use a free AI <span class="boost-sub">copy &amp; paste</span></button>' : ''}</p>
    </div>`;
  }
  function bind(root, opts = {}) {
    if (!root || root._boost) return; root._boost = true;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-boost]'); if (!b) return;
      if (b.dataset.boost === 'ai') { const card = b.closest('[data-ref]'); if (opts.onAI) return opts.onAI(card ? card.dataset.ref : '', b); if (window.TribeBrain && window.TribeBrain.open) window.TribeBrain.open(); return; }
      if (b.dataset.boost === 'free' && window.TribeAIBridge) { const card = b.closest('[data-ref]'), ask = card ? card.dataset.ref : ''; const D = window.TribeSiteDesigner, inSite = D && D.state && D.state() && D.state().open; return window.TribeAIBridge.open({ fresh: true, goal: ask, src: inSite ? 'site' : opts.src || undefined }); }   // feat/agents-free: the third way
      if (b.dataset.boost === 'credits' && window.TribePlans && !opts.onCredits) return window.TribePlans.open(b);   // feat/shell-polish: the plans and credits pop-out
      if (b.dataset.boost === 'credits' && window.TribePremium) { const ok = await window.TribePremium.gate('credits'); if (ok && opts.onCredits) opts.onCredits(); }
    });
  }
  async function online() { try { const AB = window.TribeAIBasics; const st = AB && AB.online ? await AB.online() : null; return !!(st && st.online); } catch { return false; } }
  window.TribeBoost = { html, bind, online, LINE };
})();
