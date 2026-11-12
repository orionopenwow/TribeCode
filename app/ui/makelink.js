// "Make this" links from tribecode.org's gallery (feat/site-showcase). The website's cards link into the app with:
//   ?ask=<a sentence>   Flint opens with the sentence typed in his box, ready to send (never sent for you: a link
//                       can't make Flint do anything). "make a cafe website", "make a to-do app", "design a dashboard
//                       screen" are his normal free commands (server/flintfree.js), so one Enter builds it.
//   ?make=doc:<id>      Work › Templates opens that company template (standup, launch, brand, …). Works with no tribe.
// Waits for the welcome (first visit) to finish first, then cleans the address so a reload doesn't repeat it.
// Public: window.TribeMakeLink = { last }   ({ kind, value, how } once handled; tests read it)
(function () {
  'use strict';
  let q; try { q = new URLSearchParams(location.search); } catch { return; }
  const ask = (q.get('ask') || '').replace(/\s+/g, ' ').trim().slice(0, 200), make = (q.get('make') || '').trim();
  const api = window.TribeMakeLink = { last: null };
  if (!ask && !make) return;
  const clean = () => { try { q.delete('ask'); q.delete('make'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch {} };
  const welcomeUp = () => { const w = document.getElementById('wl'); return !!(w && w.isConnected && !w.hidden && w.offsetParent !== null); };
  const until = (ok, then, ms = 30000) => { const t0 = Date.now(); (function tick() { if (ok()) return then(); if (Date.now() - t0 < ms || welcomeUp()) setTimeout(tick, 150); })(); };
  function go() {
    const m = /^doc:([a-z0-9-]{1,40})$/.exec(make);
    if (m) {
      return until(() => !welcomeUp() && window.TribeTalent && window.TribeTemplates, async () => {
        clean();
        window.TribeTalent.open('templates');
        await new Promise(r => setTimeout(r, 250));
        const ok = await window.TribeTemplates.open(m[1]);
        api.last = { kind: 'doc', value: m[1], how: ok ? 'template' : 'missing' };
      });
    }
    if (ask) {
      return until(() => !welcomeUp() && window.TribeFlint && window.TribeFlint.prefill && document.body.dataset.view !== undefined, () => {
        clean();
        window.TribeFlint.prefill(ask);
        api.last = { kind: 'ask', value: ask, how: 'prefill' };
      });
    }
  }
  if (document.readyState === 'complete') setTimeout(go, 300); else addEventListener('load', () => setTimeout(go, 300));
})();
