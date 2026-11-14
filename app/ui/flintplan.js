// Flint's planner, tier 0 (feat/flint-local): a goal becomes a short, visible plan of his ordinary commands.
//   "launch page for our bake sale by friday"  ->  1 make the page · 2 a task for the words · 3 check it on a phone ·
//                                                   4 a task to share the link · 5 put the date on the calendar
// No model: goal shapes and step templates, with the subject and the date taken from what was said and (when there is
// one) the project's memory. Every step is a sentence Flint already understands, so each one is checked by flintnlu.js
// before it is shown and runs through flintlocal.js with its own Undo. Nothing runs until the person presses Run plan.
// Pure part (browser + Node):   isGoal(text, nlu?, ctx?) · plan(text, { now, nlu, ...ctx }) -> { goal, subject, due, kind, steps: [{ say, label, intent }] } | null
// Browser:   window.TribeFlintPlan = { isGoal, plan, offer(text) -> bool, run(id), cancel(id), undoStep(id), state(id) }
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintPlan = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const WHEN = '(?:(?:next |this )?(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|today|tonight|next week|this week|the weekend|the \\d{1,2}(?:st|nd|rd|th)?|end of (?:the )?(?:week|month)|(?:in |this |next )?(?:january|february|march|april|may|june|july|august|september|october|november|december))';
  const VERB = /^(?:please\s+|can (?:you|we)\s+|let'?s\s+|help (?:me|us)\s+(?:to\s+)?|i (?:want|need) to\s+|we (?:want|need) to\s+)?(plan|organi[sz]e|prepare(?: for)?|get (?:us|me|everything|the team|things) ready for|set (?:us |me )?up everything for|set everything up for|kick ?off|launch)\s+(.+)$/i;
  const DEADLINE = new RegExp(`^(?:an?\\s+|the\\s+|our\\s+|my\\s+)?(.*\\b(?:page|site|website|deck|pitch|poster|video|trailer|newsletter|app|game|party|sale|demo|event)\\b.*?)\\s+(?:by|before|due)\\s+(${WHEN})$`, 'i');
  const tail = new RegExp(`\\s+(?:by|before|on|for|in|due)?\\s*(${WHEN})$`, 'i');
  const sureOf = (nlu, text, ctx) => { if (!nlu) return null; const P = nlu.parse(text, ctx || {}), s = P.steps[0]; return P.steps.length === 1 && s.intent && s.conf >= 0.6 ? s : null; };
  function shape(text, nlu, ctx) {
    const t = String(text || '').trim().replace(/[.!?]+$/, ''); let m;
    if (t.length < 8 || t.length > 200 || /\b(?:and then|then)\b/i.test(t)) return null;
    if ((m = VERB.exec(t))) {
      const verb = m[1].toLowerCase(), rest = m[2].trim();
      if (/^(?:it|this|that|them|these|those|my day|the day|today|ahead|(?:the |my |our |these |all (?:the |my )?)?(?:files?|folders?|tasks?|layers?|notes?|docs?|board|sidebar|widgets?|tabs?|chat)\b)/i.test(rest) || rest.split(/\s+/).length < 2) return null;
      if (/^launch$/.test(verb)) { const s = sureOf(nlu, t, ctx); if (s && !/^(?:site|build)\./.test(s.intent)) return null; }
      return { rest, verb };
    }
    if ((m = DEADLINE.exec(t))) { const s = sureOf(nlu, t, ctx); if (s && s.conf >= 0.9 && !/^(?:site|build|deck|doc|sheet)\./.test(s.intent)) return null; return { rest: `${m[1]} by ${m[2]}`, verb: 'make' }; }
    return null;
  }
  const isGoal = (text, nlu, ctx) => !!shape(text, nlu, ctx);
  const KINDS = [
    ['podcast', /\bpodcast\b/i], ['redesign', /\b(?:redesign|rebrand|refresh|revamp|makeover)\b/i], ['demo', /\b(?:demo|showcase|pitch|presentation|show and tell|talk)\b/i],
    ['page', /\b(?:page|site|website|landing|homepage)\b/i], ['event', /\b(?:offsite|party|meetup|meet-up|trip|workshop|wedding|sale|fundraiser|hackathon|game jam|jam|retreat|picnic|bbq|dinner|conference|tournament)\b/i],
    ['launch', /\b(?:launch|release|app|game|product|store|shop|album|book|newsletter)\b/i],
  ];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  function plan(text, o = {}) {
    const nlu = o.nlu || root.TribeNLU, sh = shape(text, nlu, o); if (!sh) return null;
    let rest = sh.rest, due = '', m;
    if ((m = tail.exec(' ' + rest))) { due = m[1].toLowerCase().replace(/^in /, ''); rest = (' ' + rest).replace(tail, '').trim(); }
    let subject = rest.replace(/^(?:the\s+)?(?:launch|release|redesign|kick-?off|start)\s+of\s+/i, '').replace(/^(?:a|an|the|our|my|your|new|a new|the new)\s+/i, '').replace(/^(?:new)\s+/i, '').replace(/\s+/g, ' ').trim() || rest;
    const kind = (KINDS.find(([, rx]) => rx.test(`${sh.verb} ${rest}`)) || ['generic'])[0];
    const S = subject, the = /^(?:our|my|the)\b/i.test(S) ? S : `the ${S}`;
    const by = due && !/^(?:january|february|march|april|may|june|july|august|september|october|november|december|this week|next week|the weekend)$/.test(due) ? ` by ${due}` : '', dayOk = !!by;
    const bare = S.replace(/\b(?:page|site|landing|launch|redesign|of|for)\b/gi, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:(?:a|an|the|our|my|new)\s+)+/i, '').trim() || S;
    const T = (what, label) => [`add a task to ${what}${by}`, label || cap(what), 'task.add'];
    const steps = {
      page: [[`make a landing page for ${bare}`, `Build the ${bare} page from a recipe`], T(`write the words for the ${bare} page`), T(`check the ${bare} page on a phone`), T(`share the ${bare} page link`), ...(dayOk ? [[`put ${bare} page goes live on the calendar ${due}`, `Put “${bare} page goes live” on the calendar, ${due}`]] : [])],
      demo: [[`make slides for the ${bare}`, `Start the slides for the ${bare}`], T(`write the ${bare} script`), T(`fix the top bugs before the ${bare}`), T(`rehearse the ${bare}`), ...(due ? [[`put the ${bare} on the calendar ${dayOk ? due : 'next friday'}`, `Put the ${bare} on the calendar`]] : [])],
      launch: [[`make a coming soon page for the ${bare}`, `A coming-soon page for the ${bare}`], [`make a doc for the ${bare} launch checklist`, 'Start the launch checklist doc'], T(`write the ${bare} announcement`), T(`make the ${bare} store page and screenshots`), T(`tell friends and testers about the ${bare}`), ...(dayOk ? [[`put ${bare} launch on the calendar ${due}`, `Put the launch on the calendar, ${due}`]] : [])],
      podcast: [['make a podcast site', 'A podcast website from the template'], [`make a doc for the episode plan`, 'Start the episode plan doc'], [`make a sheet for the episode schedule`, 'Start the episode schedule sheet'], T('record a trailer episode'), T('pick the cover art and the name')],
      event: [[`make a sheet for the ${bare} budget`, `Start the ${bare} budget sheet`], [`make a doc for the ${bare} agenda`, `Start the ${bare} agenda doc`], T(`book a place for the ${bare}`), T(`send the invites for the ${bare}`), T(`list what the ${bare} needs`), ...(dayOk ? [[`put the ${bare} on the calendar ${due}`, `Put the ${bare} on the calendar, ${due}`]] : [])],
      redesign: [[`make a doc for the ${bare} redesign notes`, 'Start the redesign notes doc'], T(`list what is wrong with the current ${bare}`), T(`decide the new look of the ${bare}`), T(`redo the home page of the ${bare}`), T(`check the new ${bare} on a phone`)],
      generic: [[`make a doc for the ${bare} plan`, `Start a plan doc for ${bare}`], T(`write down what done looks like for ${bare}`), T(`list what ${bare} needs`), T(`do the first piece of ${bare}`), ...(dayOk ? [[`put ${bare} on the calendar ${due}`, `Put ${bare} on the calendar, ${due}`]] : [])],
    }[kind];
    const out = [];
    for (const [say, label, want] of steps) { const s = sureOf(nlu, say, { now: o.now, members: o.members || [], tasks: [] }); if (s && (!want || s.intent === want)) out.push({ say, label, intent: s.intent }); }
    if (out.length < 3) return null;
    return { goal: String(text).trim(), subject: bare, due, kind, steps: out };
  }
  const api = { isGoal, plan, shape, version: 1 };
  if (typeof document === 'undefined') return api;

  // ---------- the plan card in Flint's chat ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PLANS = new Map(); let seq = 0;
  const MARK = { todo: '', run: '…', ok: '✓', fail: '!', undone: '↺', skip: '–' };
  function html(P) {
    const done = P.steps.filter(s => s.st === 'ok').length, n = P.steps.filter(s => s.st !== 'skip').length, running = P.state === 'run';
    return `<div class="fplan" data-fplan="${P.id}" data-state="${P.state}" role="group" aria-label="Plan: ${esc(P.goal)}">
      <p class="fplan-h"><span class="eyebrow">Plan · no AI</span><b>${esc(cap(P.subject))}</b>${P.due ? `<small>${esc(P.due)}</small>` : ''}</p>
      <div class="fplan-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${done}" aria-label="Steps done"><i style="width:${n ? Math.round(done / n * 100) : 0}%"></i></div>
      <ol class="fplan-steps">${P.steps.map((s, i) => `<li class="fplan-step is-${s.st}" data-i="${i}"><span class="fplan-mk" aria-hidden="true">${MARK[s.st] || i + 1}</span><span class="fplan-l">${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>${P.state === 'new' ? `<button type="button" class="fplan-x" data-fplan-skip="${i}" aria-label="${s.st === 'skip' ? 'Put this step back' : 'Skip this step'}" title="${s.st === 'skip' ? 'Put back' : 'Skip'}">${s.st === 'skip' ? '+' : '✕'}</button>` : ''}</li>`).join('')}</ol>
      <p class="fplan-acts">${P.state === 'new' ? `<button type="button" class="btn sm primary" data-fplan-run>Run plan</button><button type="button" class="btn sm ghost" data-fplan-cancel>Not now</button>`
        : running ? `<button type="button" class="btn sm" data-fplan-stop>Stop after this step</button><span class="faint">${done} of ${n}</span>`
        : P.state === 'cancelled' ? '<span class="faint">Left as it was. Nothing changed.</span>'
        : `<span class="fplan-sum">${done} of ${n} done${P.stopped ? ' · stopped' : ''}</span>${P.steps.some(s => s.st === 'ok' && s.undo) ? '<button type="button" class="btn sm" data-fplan-undo>Undo last step</button>' : ''}`}</p>
    </div>`;
  }
  function redraw(P) {
    P.msg.html = html(P);
    const el = document.querySelector(`[data-fplan="${P.id}"]`); if (el) el.outerHTML = P.msg.html; else if (root.TribeFlint && root.TribeFlint.redraw) root.TribeFlint.redraw();
    try { document.dispatchEvent(new CustomEvent('flintplan', { detail: { id: P.id, state: P.state } })); } catch {}
  }
  // Show the plan for a goal. Returns true when a card was shown (flintlocal.js stops there).
  function offer(text, H, ctx) {
    const p = plan(text, { now: new Date(), nlu: root.TribeNLU, ...(ctx || {}) }); if (!p) return false;
    const P = { id: 'p' + (++seq), ...p, steps: p.steps.map(s => ({ ...s, st: 'todo' })), state: 'new' };
    PLANS.set(P.id, P);
    P.msg = H.say(`Here is a plan for “${p.goal}”. Each step is something I do without AI, and each has its own Undo. Skip what you don’t want, then run it.`, [], { html: html(P) }) || {};
    if (!P.msg || typeof P.msg !== 'object') P.msg = {};
    return true;
  }
  async function run(id) {
    const P = PLANS.get(id), FL = root.TribeFlintLocal; if (!P || P.state !== 'new' || !FL || !FL.runSay) return;
    P.state = 'run'; P.stop = false; redraw(P);
    for (const s of P.steps) {
      if (s.st === 'skip') continue;
      if (P.stop) { P.stopped = true; break; }
      s.st = 'run'; redraw(P);
      let r = null; try { r = await FL.runSay(s.say, `plan: ${s.label}`); } catch (e) { r = { ok: false, text: e.message }; }
      s.st = r && r.ok ? 'ok' : 'fail'; s.undo = !!(r && r.undo); s.note = r && r.text ? String(r.text).replace(/\s+/g, ' ').slice(0, 110) : '';
      redraw(P);
      await new Promise(f => setTimeout(f, 260));
    }
    P.state = 'done'; redraw(P);
  }
  async function undoStep(id) {
    const P = PLANS.get(id), FL = root.TribeFlintLocal; if (!P || P.state !== 'done' || !FL) return;
    const s = P.steps.slice().reverse().find(x => x.st === 'ok' && x.undo); if (!s) return;
    const r = await FL.undo(); s.st = 'undone'; s.undo = false; s.note = (r && r.text) || 'Undone'; redraw(P);
  }
  document.addEventListener('click', e => {
    const card = e.target.closest && e.target.closest('[data-fplan]'); if (!card) return;
    const P = PLANS.get(card.dataset.fplan); if (!P) return;
    const sk = e.target.closest('[data-fplan-skip]');
    if (sk && P.state === 'new') { const s = P.steps[+sk.dataset.fplanSkip]; s.st = s.st === 'skip' ? 'todo' : 'skip'; return redraw(P); }
    if (e.target.closest('[data-fplan-run]')) return void run(P.id);
    if (e.target.closest('[data-fplan-cancel]') && P.state === 'new') { P.state = 'cancelled'; return redraw(P); }
    if (e.target.closest('[data-fplan-stop]')) { P.stop = true; return; }
    if (e.target.closest('[data-fplan-undo]')) return void undoStep(P.id);
  });
  return { ...api, offer, run, undoStep, cancel: id => { const P = PLANS.get(id); if (P && P.state === 'new') { P.state = 'cancelled'; redraw(P); } }, state: id => { const P = PLANS.get(id || [...PLANS.keys()].pop()); return P ? { id: P.id, state: P.state, steps: P.steps.map(s => ({ label: s.label, say: s.say, st: s.st })) } : null; } };
});
