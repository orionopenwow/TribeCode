// Company setup by questions (feat/company3). Four plain questions, one at a time, inside the Company view:
//   1. What are you making?            -> which starting shape (templates/companies.json)
//   2. What's it called, and what for?  -> name + one line
//   3. Who does what?                   -> each role: me, a friend, my AI helper, or nobody yet
//   4. How do you want to check in?     -> daily / weekly / monthly, and one optional goal for the month
// Every step can be skipped ("Skip the questions" sets it up the usual way) and every answer can be changed later
// from the Company page. It only calls routes that already exist (server/company.js): POST …/company/template,
// POST …/seats/:id/assign, PUT …/company, POST …/goals.
// Public: window.TribeCompanySetup = { start({ sec, view, pid, me, done, cancel, skip }) }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const roleName = t => (t === 'CEO' ? 'Lead' : t);
  // plain names for the starting shapes; anything new in the file falls back to its own name
  const KIND = { saas: 'An app or online tool', 'game-studio': 'A game', agency: 'Work for clients', creator: 'Videos, writing or a channel', local: 'A local shop or service', nonprofit: 'A cause or nonprofit', club: 'A club or community', blank: 'Something else, or not sure yet' };
  const STEPS = 4;

  function start({ sec, view, pid, me, done, cancel, skip }) {
    const tpls = (view.templates || []).slice().sort((a, b) => (a.id === 'blank') - (b.id === 'blank'));
    const proj = ((C.state() || {}).projects || []).find(p => p.id === pid) || {};
    const a = { step: 1, tpl: '', name: proj.name || '', mission: '', who: {}, rhythms: { standup: true, weekly: true, board: true }, goal: '', target: '', busy: false };
    const tpl = () => tpls.find(t => t.id === a.tpl) || tpls.find(t => t.id === 'blank') || tpls[0] || { id: 'blank', roles: [] };
    const roles = () => (tpl().roles || (tpl().seats || []).map(t => ({ kind: '', title: t, goal: '' })));
    const people = (view.people || []).filter(p => p.id !== me.id);

    function body() {
      if (a.step === 1) return `<h1 id="cs-q">What are you making?</h1><p class="co-lead">This picks a sensible set of roles to start from. You can add or remove roles later.</p>
        <div class="co-set-opts" role="radiogroup" aria-labelledby="cs-q">${tpls.map(t => `<button type="button" class="co-set-opt${a.tpl === t.id ? ' on' : ''}" role="radio" aria-checked="${a.tpl === t.id}" data-tpl="${esc(t.id)}"><b>${esc(KIND[t.id] || t.name)}</b><small>${esc((t.roles || []).map(r => roleName(r.title)).join(' · ') || (t.seats || []).map(roleName).join(' · '))}</small></button>`).join('')}</div>`;
      if (a.step === 2) return `<h1 id="cs-q">What’s it called, and what is it for?</h1><p class="co-lead">The one line helps every person and AI helper know the point.</p>
        <label class="co-f"><span class="co-fl">Name</span><input class="input" id="cs-name" maxlength="60" value="${esc(a.name)}" placeholder="Your company or project name"></label>
        <label class="co-f"><span class="co-fl">What it’s for <span class="faint">one line, optional</span></span><input class="input" id="cs-mission" maxlength="400" value="${esc(a.mission)}" placeholder="e.g. Cozy little games for short breaks"></label>`;
      if (a.step === 3) return `<h1 id="cs-q">Who does what?</h1><p class="co-lead">Give each role to yourself, a friend or an AI helper. “Nobody yet” is fine; you can fill it later.</p>
        <ul class="co-set-roles">${roles().map((r, i) => { const lead = r.kind === 'ceo', v = a.who[i] !== undefined ? a.who[i] : lead ? 'me' : '';
          return `<li><div><b>${esc(roleName(r.title))}</b><small>${esc(lead ? 'Sets the goal and makes the final decisions' : r.goal || '')}</small></div>
            ${lead ? '<span class="co-set-you">You</span>' : `<select class="input" data-role="${i}" aria-label="Who does ${esc(roleName(r.title))}">
              <option value=""${v === '' ? ' selected' : ''}>Nobody yet</option><option value="me"${v === 'me' ? ' selected' : ''}>Me</option>
              ${people.map(p => `<option value="p:${esc(p.id)}"${v === 'p:' + p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
              ${view.myAgent ? `<option value="ai"${v === 'ai' ? ' selected' : ''}>${esc(view.myAgent.name)} (my AI helper)</option>` : ''}</select>`}</li>`; }).join('')}</ul>
        <p class="faint co-note">${view.myAgent ? 'An AI helper works alone on small, safe things and asks a person before spending money, publishing or emailing anyone.' : 'No AI helper is connected yet. You can invite one later and hand it a role.'}</p>`;
      return `<h1 id="cs-q">How do you want to check in?</h1><p class="co-lead">Short, regular check-ins keep everyone pointed the same way. Turn any of them off.</p>
        <div class="co-set-checks">${[['standup', 'A short update each weekday', 'What got done, what’s next. People get a nudge at 9:00; AI helpers post on their own.'], ['weekly', 'A weekly look-back on Mondays', 'Goals, what’s waiting on a decision, money spent.'], ['board', 'A one-page summary each month', 'Numbers, wins and risks, written for you on the 1st.']]
          .map(([k, t, sub]) => `<label class="co-rh-l"><input type="checkbox" data-rh="${k}" ${a.rhythms[k] ? 'checked' : ''}><span><b>${t}</b><small>${sub}</small></span></label>`).join('')}</div>
        <div class="co-f"><span class="co-fl">One thing to aim for this month <span class="faint">optional</span></span>
          <div class="co-set-goal"><input class="input" id="cs-goal" maxlength="160" value="${esc(a.goal)}" placeholder="e.g. Sign-ups" aria-label="Goal"><input class="input co-g-n" id="cs-target" type="number" min="1" value="${esc(a.target)}" placeholder="How many" aria-label="How many"></div></div>`;
    }
    function draw() {
      sec.innerHTML = `<div class="co-wrap"><section class="card co-setup" id="co-setup" data-step="${a.step}" aria-labelledby="cs-q">
        <div class="co-set-h"><span class="eyebrow">Set up · question ${a.step} of ${STEPS}</span><span class="co-set-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS}" aria-valuenow="${a.step}"><i style="width:${a.step / STEPS * 100}%"></i></span></div>
        ${body()}
        <div class="co-set-f"><button class="btn" type="button" id="cs-back">${a.step === 1 ? 'Cancel' : 'Back'}</button><button class="linkish" type="button" id="cs-skip">Skip the questions</button><span style="flex:1"></span>
          <button class="btn primary" type="button" id="cs-next"${a.step === 1 && !a.tpl ? ' disabled' : ''}>${a.step === STEPS ? 'Set it up' : 'Next'}</button></div>
      </section></div>`;
      wire();
      const f = sec.querySelector(a.step === 2 ? '#cs-name' : '#cs-q'); if (f && a.step === 2 && !matchMedia('(max-width: 820px)').matches) f.focus();
    }
    function read() {
      const v = id => { const el = sec.querySelector(id); return el ? el.value : undefined; };
      if (a.step === 2) { a.name = (v('#cs-name') || '').trim(); a.mission = (v('#cs-mission') || '').trim(); }
      if (a.step === 3) sec.querySelectorAll('[data-role]').forEach(el => { a.who[el.dataset.role] = el.value; });
      if (a.step === 4) { sec.querySelectorAll('[data-rh]').forEach(el => { a.rhythms[el.dataset.rh] = el.checked; }); a.goal = (v('#cs-goal') || '').trim(); a.target = v('#cs-target') || ''; }
    }
    function wire() {
      sec.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { a.tpl = b.dataset.tpl; a.who = {}; a.step = 2; draw(); });
      sec.querySelector('#cs-back').onclick = () => { read(); if (a.step === 1) return cancel(); a.step--; draw(); };
      sec.querySelector('#cs-skip').onclick = () => { if (!a.busy) skip(); };
      const next = sec.querySelector('#cs-next');
      next.onclick = () => { read(); if (a.step < STEPS) { a.step++; return draw(); } finish(next); };
      sec.querySelectorAll('#cs-name, #cs-mission, #cs-goal, #cs-target').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } });
    }
    async function finish(btn) {
      if (a.busy) return; a.busy = true; btn.disabled = true; btn.classList.add('busy');
      const P = `/projects/${encodeURIComponent(pid)}/company`;
      try {
        const r = await C.api(`${P}/template`, { method: 'POST', body: { template: tpl().id, ...(a.name ? { name: a.name } : {}), mission: a.mission } });
        const seats = r.company.seats;
        // answers that didn't save (say a friend left meanwhile) never undo the company: it exists, the rest is editable on the page
        const soft = async fn => { try { await fn(); } catch (e) { toast(e.message); } };
        for (const [i, v] of Object.entries(a.who)) {
          const seat = seats[Number(i)]; if (!seat || seat.kind === 'ceo' || !v) continue;
          const bodyA = v === 'me' ? { person: me.id } : v === 'ai' && view.myAgent ? { agent: view.myAgent.id } : v.startsWith('p:') ? { person: v.slice(2) } : null;
          if (bodyA) await soft(() => C.api(`${P}/seats/${encodeURIComponent(seat.id)}/assign`, { method: 'POST', body: bodyA }));
        }
        await soft(() => C.api(P, { method: 'PUT', body: { rhythms: a.rhythms } }));
        if (a.goal) { const target = Number(a.target) || 0; await soft(() => C.api(`${P}/goals`, { method: 'POST', body: { title: target ? `${target} ${a.goal}` : a.goal, results: target ? [{ text: a.goal, target, current: 0 }] : [] } })); }
        const fresh = await C.api(P, { project: pid }).catch(() => r);
        done(fresh && fresh.company ? fresh : r);
      } catch (e) { a.busy = false; btn.disabled = false; btn.classList.remove('busy'); toast(e.message); }
    }
    draw();
  }
  window.TribeCompanySetup = { start };
})();
