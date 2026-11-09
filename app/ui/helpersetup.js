// Set up your helpers (v0.22): the right panel's first card, until it's done. Three short steps, one click each:
//   1 Meet Flint      who he is and what he does across the app (Got it)
//   2 Flint's AI      Built in (free, in this browser) · On this computer (Ollama) · Cloud AI (your key) · or keep basic
//   3 Your own AI     connect Claude Code, Codex, Cursor or Gemini so they build with the tribe (or later)
// Steps tick themselves when they're already true (a brain is on, your agent is online). Once all three are done or
// skipped the card goes away for good; Settings › Flint's brain and the Agents Hub stay the places to change things.
// While this card shows, the panel's separate "Connect your AI" card and the "Flint is in basic mode" insight stay hidden.
(function () {
  'use strict';
  const KEY = 'tribecode.helpers.v1';
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const put = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const brainOn = () => { const F = window.TribeFlint; return !!(F && F.status && F.status().online); };
  const myAgent = () => { const st = C() && C().state(); const id = st && st.me && st.me.id; return !!(id && (st.members || []).some(m => m.role === 'agent' && m.owner === id)); };
  function state() {
    const s = get();
    return { flint: !!s.flint, brain: !!s.brain || brainOn(), ai: !!s.ai || myAgent() };
  }
  const allDone = () => { const s = state(); return s.flint && s.brain && s.ai; };

  function html() {
    const s = state(), n = [s.flint, s.brain, s.ai].filter(Boolean).length;
    const step = (k, ok, e, t, body) => `<li class="hs-step${ok ? ' ok' : ''}${!ok && firstOpen() === k ? ' open' : ''}" data-hs="${k}"><button type="button" class="hs-row" data-hs-toggle="${k}" aria-expanded="${!ok && firstOpen() === k}"><span class="hs-e" aria-hidden="true">${ok ? '✓' : e}</span><b>${t}</b></button>${ok ? '' : `<div class="hs-body">${body}</div>`}</li>`;
    function firstOpen() { return !s.flint ? 'flint' : !s.brain ? 'brain' : !s.ai ? 'ai' : ''; }
    return `<section class="hs-card" id="helper-setup" aria-label="Set up your helpers">
      <div class="hs-head"><span class="eyebrow mono">Your helpers · ${n} of 3</span></div>
      <ol class="hs-steps">
        ${step('flint', s.flint, '🔥', 'Meet Flint', `<p>Flint is TribeCode's built-in guide. He shows you around, writes docs, sheets and slides, plans tasks and answers questions about your project. Ask him anything in the box at the bottom.</p><div class="hs-acts"><button class="btn sm primary" data-hs-do="flint">Got it</button></div>`)}
        ${step('brain', s.brain, '🧠', 'Give Flint an AI', `<p>Without one, Flint answers with simple rules. Pick where his AI runs:</p>
          <div class="hs-opts"><button class="hs-opt" data-hs-brain="browser"><b>Built in</b><small>Free, runs in this browser. A one-time download.</small></button>
          <button class="hs-opt" data-hs-brain="local"><b>On this computer</b><small>Uses Ollama if you have it.</small></button>
          <button class="hs-opt" data-hs-brain="cloud"><b>Cloud AI</b><small>Your own key (Anthropic, OpenAI, Google…).</small></button></div>
          <div class="hs-acts"><button class="linkish" data-hs-do="brain">Keep simple rules for now</button></div>`)}
        ${step('ai', s.ai, '🤖', 'Bring your own AI', `<p>Connect Claude Code, Codex, Cursor or Gemini. Your AI joins the tribe, takes tasks and builds with everyone.</p><div class="hs-acts"><button class="btn sm primary" data-hs-connect>Connect my AI</button><button class="linkish" data-hs-do="ai">Later</button></div>`)}
      </ol></section>`;
  }
  function mark(k) { const s = get(); s[k] = true; put(s); render(); }
  function render() {
    const pane = document.getElementById('room-pane') || document.getElementById('tour-room');
    let card = document.getElementById('helper-setup');
    const show = !!pane && C() && C().connected() && !allDone() && !get().hidden;
    document.body.classList.toggle('hs-on', !!show);
    if (!show) { if (card) card.remove(); return; }
    const box = document.createElement('div'); box.innerHTML = html(); const fresh = box.firstElementChild;
    if (card) card.replaceWith(fresh); else pane.prepend(fresh);
    card = fresh;
    card.querySelectorAll('[data-hs-toggle]').forEach(b => b.onclick = () => { const li = b.closest('.hs-step'); if (li.classList.contains('ok')) return; card.querySelectorAll('.hs-step.open').forEach(x => x !== li && x.classList.remove('open')); li.classList.toggle('open'); b.setAttribute('aria-expanded', li.classList.contains('open')); });
    card.querySelectorAll('[data-hs-do]').forEach(b => b.onclick = () => mark(b.dataset.hsDo));
    card.querySelectorAll('[data-hs-brain]').forEach(b => b.onclick = () => {
      const B = window.TribeBrain;
      if (B && B.open) B.open(b.dataset.hsBrain); else if (window.TribeSettings) window.TribeSettings.open();
      // ticks itself once Flint reports a brain (see the interval below)
    });
    const cc = card.querySelector('[data-hs-connect]'); if (cc) cc.onclick = () => { if (A() && A().connectClaude) A().connectClaude(); };
  }
  function boot() {
    render();
    const c = C(); if (c && c.on) { c.on('hello', render); c.on('presence', () => { if (myAgent() && !get().ai) mark('ai'); }); }
    setInterval(() => { if (document.getElementById('helper-setup') && (brainOn() && !get().brain)) mark('brain'); }, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.TribeHelpers = { render, state, reset: () => { put({}); render(); } };
})();
