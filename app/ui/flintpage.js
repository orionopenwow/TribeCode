// Flint's page (feat/flint-max): who Flint is, "Flint's levels" (no AI, local helper, local model, your AI, credits) with the active one
// marked, and "What I can do": every free ability, searchable and grouped by editor, each with Try it (a safe demo on
// sample data, or what Flint understood from the example, never a change to your work) and the lessons with Show me.
// Open it from Flint's ✦ menu, "what can you do", a chip on Home, or #/flint.
//   window.TribeFlintPage = { open(query?), close(), CAPS, level() }
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLAN = 'https://github.com/orionopenwow/TribeCode/blob/dev/docs/FLINT-RESEARCH.md#3-the-model-plan';
  // [group, title, the example people can say, demo key (flintmax DEMOS) or '', tier]
  const G = { site: 'Website designer', canvas: 'Design canvas', docs: 'Docs', sheets: 'Sheets', slides: 'Slides', tasks: 'Tasks and chat', any: 'Anywhere', tribe: 'Your tribe' };
  const CAPS = [
    ['site', 'Several steps, one Undo', 'add a pricing section with three plans, make the middle one highlighted, then switch to dark mode', '', 'No AI'],
    ['site', 'Palettes from a mood or one color', 'warm autumn palette', 'palette', 'No AI'],
    ['site', 'Contrast check and auto-fix (WCAG)', 'fix the contrast', 'contrast', 'No AI'],
    ['site', 'Font pairing by mood', 'pick fonts that feel elegant', 'fonts', 'No AI'],
    ['site', 'Style moves: professional, elegant, brutalist…', 'make this more professional', 'style', 'No AI'],
    ['site', 'Tidy the layout (8px rhythm, one alignment)', 'tidy this up', '', 'No AI'],
    ['site', 'Headline ideas from what the site says', 'give me headline ideas', 'headlines', 'No AI'],
    ['site', 'A better call to action', 'what should the button say', 'cta', 'No AI'],
    ['site', 'Readability score (Flesch)', 'how readable is this', 'readability', 'No AI'],
    ['site', 'Title Case the headings', 'title case the headings', 'titlecase', 'No AI'],
    ['site', '“It”, “that”, “the same”', 'do the same on the about page', '', 'No AI'],
    ['site', 'Links, socials, buttons, pages, sections', 'add a link for my book club', '', 'No AI'],
    ['site', 'Make the buttons work', 'make the buttons work', '', 'No AI'],
    ['site', 'Website designer v2: 16 templates by meaning', 'something for my band', '', 'No AI'],
    ['canvas', 'Component recipes', 'add a navbar', 'recipe', 'No AI'],
    ['canvas', 'Turn a selection into a card grid', 'turn these into a card grid', '', 'No AI'],
    ['canvas', 'Recolor with a palette', 'apply a sunset palette', 'palette', 'No AI'],
    ['canvas', 'Screens from templates', 'make a login screen', '', 'No AI'],
    ['canvas', 'Align, distribute, group, resize, snap', 'align these to the left', '', 'No AI'],
    ['canvas', 'Dark version, variants, wiring', 'make a dark mode', '', 'No AI'],
    ['docs', 'Table of contents', 'make a table of contents', 'toc', 'No AI'],
    ['docs', 'Bullets into a checklist', 'turn this into a checklist', 'checklist', 'No AI'],
    ['docs', 'TL;DR from your own sentences', 'add a tldr at the top', 'summary', 'No AI'],
    ['docs', 'Fix capitalization', 'fix capitalization', 'caps', 'No AI'],
    ['docs', 'Reading level', 'whats the reading level', 'readability', 'No AI'],
    ['sheets', 'Sum, average, highest, count', 'sum this column', 'sum', 'No AI'],
    ['sheets', 'Charts from a sentence', 'make a chart of sales by month', 'chart', 'No AI'],
    ['sheets', 'Sort by any column', 'sort by sales, highest first', 'sort', 'No AI'],
    ['sheets', 'Format as currency or percent', 'format as currency', 'currency', 'No AI'],
    ['sheets', 'A total row with formulas', 'add a total row', 'total', 'No AI'],
    ['slides', 'A pitch from the vision or any doc', 'make a 5-slide pitch from the vision doc', 'pitch', 'No AI'],
    ['tasks', 'Tasks with dates and people', 'add a task to order samples by friday for Maya', '', 'No AI'],
    ['tasks', 'Messages, DMs, reactions, pins', 'tell Sam the build is ready', '', 'No AI'],
    ['tasks', 'Timers and reminders', 'remind me in 20 minutes to check the oven', '', 'No AI'],
    ['tasks', 'Summarize the chat', 'summarize the chat', '', 'No AI'],
    ['any', 'Palettes anywhere', 'show me an ocean palette', 'palette', 'No AI'],
    ['any', 'Tone shifts with word lists', 'make this more professional', 'tone', 'No AI'],
    ['any', 'Title case anything', 'title case: the night we met the sea', 'titlecase', 'No AI'],
    ['any', 'Math, units, dates', 'split 120 between 4', '', 'No AI'],
    ['any', 'How-to answers from the docs', 'how do I invite a friend', '', 'No AI'],
    ['any', 'Typos, slang, eight languages', 'ad a tsk to buy milk tomorow', '', 'No AI'],
    ['tribe', 'The Design flow: plan → template → tasks', 'design a website', '', 'No AI'],
    ['tribe', 'Presence: where everyone is', 'where is maya', '', 'No AI'],
    ['tribe', 'Folders and sync', 'open my files', '', 'No AI'],
    ['tribe', 'Invite your agent', 'invite my agent', '', 'Your AI'],
    ['tribe', 'Invite your Cursor, Codex or Gemini', 'invite my cursor', '', 'Your AI'],
    ['tribe', 'The free-AI bridge', 'pick flint\'s brain', '', 'Local'],
    ['tribe', 'Settings by saying so', 'turn off animations', '', 'No AI'],
    ['tribe', 'Watch Flint build', 'watch flint build', '', 'No AI'],
    ['any', 'A plan from a goal, step by step', 'launch page for our bake sale by friday', '', 'No AI'],
    ['any', 'Follow-ups: “tell Sam too”, “make that 15”', 'and another one to book the hall', '', 'No AI'],
    ['any', 'What I know about this project', 'when is the bake sale', '', 'No AI'],
    ['any', 'Where something was said', 'where did we talk about pricing', '', 'No AI'],
    ['tasks', 'Spots a task you already have', 'add a task to buy milk and eggs', '', 'No AI'],
    ['any', 'Rewrite in a tone, with a local model', 'rewrite this friendly: We regret to inform you the shop is closed.', '', 'Local'],
    ['any', 'Explain an error, with a local model', 'explain this error: TypeError: x is undefined', '', 'Local'],
  ];
  const LEVELS = [
    ['none', 'No AI', 'Always on. Rules, recipes, palettes, math and a built-in word list that finds commands, docs, tasks and chat by meaning: instant, offline, private.'],
    ['helper', 'Local brain', 'Recommended. A small word-meaning model on this device, no GPU needed: Flint understands more of your own words, sharpens the built-in search by meaning and spots duplicate tasks. One download, about 30 MB (8 MB on phones).'],
    ['local', 'Local model', 'Opt-in. A small language model on a computer you control (Ollama or LM Studio on this computer or the host, or in this browser with WebGPU). It writes summaries, rewrites and drafts, and turns loose requests into Flint’s own commands, checked and undoable.'],
    ['yours', 'Your AI', 'Your own Claude, OpenAI or Gemini key, on the host only. For writing and code.'],
    ['credits', 'Credits', 'TribeCode credits when you have no key. The same requests, billed per use.'],
  ];
  function level() {
    try { const P = window.TribePremium && window.TribePremium.plan && window.TribePremium.plan(); if (P && P.plan && P.plan !== 'free') return 'credits'; } catch {}
    const st = (window.TribeFlint && window.TribeFlint.status && window.TribeFlint.status()) || {};
    if (!st.online) return window.TribeFlintLLM && window.TribeFlintLLM.ready() ? 'local' : 'none';
    return st.browser || /ollama|local|qwen|llama|gemma|phi|smol|browser/i.test(`${st.via || ''} ${st.model || ''}`) ? 'local' : 'yours';
  }
  // level 1 adds to whatever else is active: it is on when the small model is installed on this device (flintmodel.js)
  const helperOn = () => !!(window.TribeFlintModel && window.TribeFlintModel.installed());
  let root = null, lastFocus = null;
  function understood(text) {
    const N = window.TribeNLU; if (!N) return '';
    const view = /palette|fonts|professional|tidy|headline|button say|readable|title case the|pricing|same on/.test(text) ? 'site' : /navbar|card grid|sunset palette|login screen|align these|dark mode/.test(text) ? 'canvas' : /chart|sum this|sort by|currency|total row/.test(text) ? 'sheet' : /contents|checklist|tldr|capitalization|reading level/.test(text) ? 'doc' : '';
    const P = N.parse(text, { view, now: new Date(), selection: view === 'canvas' });
    return P.steps.map(s => s.intent ? `${s.intent}${Object.keys(s.slots || {}).length ? ' ' + JSON.stringify(s.slots).replace(/"text":"[^"]*",?/, '') : ''}` : '(needs a model)').join(' → ');
  }
  function draw(q) {
    const want = String(q || '').toLowerCase().trim(), words = want.split(/\s+/).filter(Boolean);
    const hit = c => !words.length || words.every(w => `${G[c[0]]} ${c[1]} ${c[2]} ${c[4]}`.toLowerCase().includes(w));
    const lv = level(), list = $('#fp-list', root);
    const groups = Object.keys(G).map(g => [g, CAPS.map((c, i) => [c, i]).filter(([c]) => c[0] === g && hit(c))]).filter(([, l]) => l.length);
    list.innerHTML = groups.length ? groups.map(([g, l]) => `<section class="fpg-grp" aria-label="${esc(G[g])}"><h3 class="eyebrow">${esc(G[g])} <span class="faint">${l.length}</span></h3>
      <ul class="fpg-caps">${l.map(([c, i]) => `<li class="fpg-cap" data-i="${i}"><div class="fpg-cap-t"><b>${esc(c[1])}</b><small class="fpg-tier fpg-tier-${c[4] === 'No AI' ? 'none' : c[4] === 'Local' ? 'local' : 'yours'}">${esc(c[4])}</small></div>
        <p class="fpg-say">“${esc(c[2])}”</p><div class="fpg-acts"><button type="button" class="btn sm fpg-try" data-try="${i}">Try it</button><button type="button" class="btn ghost sm" data-ask="${i}" title="Put it in Flint's box">Ask Flint</button></div><div class="fpg-out" hidden></div></li>`).join('')}</ul></section>`).join('')
      : `<p class="faint fpg-none">Nothing matches “${esc(q)}”. Try “palette”, “sheet” or “undo”.</p>`;
    $('#fp-count', root).textContent = `${groups.reduce((a, [, l]) => a + l.length, 0)} of ${CAPS.length}`;
    root.querySelectorAll('.fpg-lv').forEach(el => { const on = el.dataset.lv === lv || (el.dataset.lv === 'helper' && helperOn()); el.classList.toggle('on', on); const b = el.querySelector('.fpg-lv-on'); if (b) b.hidden = !on; });
  }
  function tryIt(i, li) {
    const c = CAPS[i], FM = window.TribeFlintMax, out = li.querySelector('.fpg-out');
    let html = '';
    if (c[3] && FM && FM.DEMOS[c[3]]) { const r = FM.DEMOS[c[3]](c[2]); html = `${r.html || ''}${r.text ? `<p>${esc(r.text)}</p>` : ''}`; }
    const u = understood(c[2]);
    html += `<p class="fpg-u"><span class="faint">Flint understood:</span> <code>${esc(u || '…')}</code></p><p class="faint fpg-safe">A demo on sample data: nothing in your work changed.</p>`;
    out.innerHTML = html; out.hidden = false;
  }
  function lessons() {
    const L = window.TribeFlintLessons; if (!L || !L.LESSONS) return '';
    return `<section class="fpg-sec" aria-label="Lessons"><h2>Lessons</h2><div class="fpg-lessons">${Object.entries(L.LESSONS).map(([k, l]) => `<button type="button" class="fpg-lesson" data-lesson="${esc(k)}"><b>${esc(l.title)}</b><small>${(l.steps || []).length} steps · Show me</small></button>`).join('')}</div></section>`;
  }
  function open(q, focus) {
    lastFocus = document.activeElement;
    if (!root) {
      root = document.createElement('div'); root.id = 'flint-page'; root.className = 'fpg'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Flint');
      document.body.appendChild(root); root.classList.add('ui-sheet');   // the shared way in and out (uikit.css)
    }
    const lv = level();
    root.innerHTML = `<div class="fpg-card">
      <header class="fpg-head"><img src="assets/flint.svg" alt="" width="40" height="40"><div><span class="eyebrow">Your tribe's helper</span><h1>Flint</h1><p class="faint">Most of what he does needs no AI: rules, recipes, palettes and math, instant and offline. Bigger jobs go to a model you choose.</p></div>
        <button type="button" class="btn ghost fpg-x" id="fp-close" aria-label="Close">✕</button></header>
      <section class="fpg-sec" aria-label="Flint's levels"><h2>Flint's levels</h2><div class="fpg-levels">${LEVELS.map(([k, t, d], i) => `<div class="fpg-lv${k === lv || (k === 'helper' && helperOn()) ? ' on' : ''}" data-lv="${k}"><span class="fpg-lv-n">${i}</span><b>${esc(t)}</b><small>${esc(d)}</small><span class="fpg-lv-on"${k === lv || (k === 'helper' && helperOn()) ? '' : ' hidden'}>Active</span></div>`).join('')}</div>
        <p class="fpg-row"><button type="button" class="btn sm" id="fp-local">${helperOn() ? 'Local brain: manage' : 'Give Flint a local brain'}</button><button type="button" class="btn sm" id="fp-llm">Choose a local model</button><button type="button" class="btn sm" id="fp-facts">What Flint knows about this project</button><a class="btn ghost sm" id="fp-plan" href="${PLAN}" target="_blank" rel="noopener">Read the model plan</a></p></section>
      ${window.TribeFlintDevice ? window.TribeFlintDevice.html() : ''}
      <section class="fpg-sec" aria-label="What I can do"><div class="fpg-sh"><h2>What I can do</h2><span class="faint" id="fp-count"></span></div>
        <input class="input" id="fp-q" type="search" placeholder="Search: palette, sheet, undo, checklist…" aria-label="Search what Flint can do" value="${esc(q || '')}">
        <div id="fp-list" class="fpg-list"></div></section>
      ${lessons()}
    </div>`;
    root.hidden = false; document.body.classList.add('fpg-open');
    draw(q);
    const qi = $('#fp-q', root); qi.oninput = () => draw(qi.value);
    $('#fp-close', root).onclick = close;
    if (window.TribeFlintDevice) window.TribeFlintDevice.bind(root);
    $('#fp-llm', root).onclick = () => { if (window.TribeFlintLLM) window.TribeFlintLLM.open(); else if (window.TribeBrain) { close(); window.TribeBrain.open(); } };
    $('#fp-facts', root).onclick = () => window.TribeFlintFacts && window.TribeFlintFacts.open();
    if (focus === 'device') setTimeout(() => { const d = $('#fp-device', root); if (d) d.scrollIntoView({ block: 'start' }); }, 60);
    $('#fp-local', root).onclick = () => { if (window.TribeFlintModel) window.TribeFlintModel.open(); else if (window.TribeBrain && window.TribeBrain.open) { close(); window.TribeBrain.open(); } else window.open(PLAN, '_blank', 'noopener'); };
    root.onclick = e => {
      if (e.target === root) return close();
      const t = e.target.closest('[data-try]'); if (t) return tryIt(+t.dataset.try, t.closest('.fpg-cap'));
      const a = e.target.closest('[data-ask]'); if (a) { close(); if (window.TribeFlint && window.TribeFlint.prefill) window.TribeFlint.prefill(CAPS[+a.dataset.ask][2]); return; }
      const l = e.target.closest('[data-lesson]'); if (l && window.TribeFlintLessons) { close(); window.TribeFlintLessons.open(l.dataset.lesson); }
    };
    root.onkeydown = e => { if (e.key === 'Escape') close(); };
    if (focus !== 'device') setTimeout(() => qi.focus(), 30);
  }
  function close() { if (!root || root.hidden) return; const n = root; document.body.classList.remove('fpg-open'); if (window.TribeUI) window.TribeUI.dismiss(n, () => { if (!document.body.classList.contains('fpg-open')) n.hidden = true; }); else n.hidden = true; if (location.hash === '#/flint') history.replaceState(null, '', location.pathname + location.search); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }
  document.addEventListener('flintmodel', () => { if (root && !root.hidden) { draw($('#fp-q', root) ? $('#fp-q', root).value : ''); const b = $('#fp-local', root); if (b) b.textContent = helperOn() ? 'Local brain: manage' : 'Give Flint a local brain'; } });
  document.addEventListener('flintllm', () => { if (root && !root.hidden) draw($('#fp-q', root) ? $('#fp-q', root).value : ''); });   // installed or removed: the level's "Active" follows
  addEventListener('hashchange', () => { if (location.hash === '#/flint') open(''); });
  if (location.hash === '#/flint') addEventListener('load', () => setTimeout(() => open(''), 300));
  window.TribeFlintPage = { open, close, CAPS, level, understood };
})();
