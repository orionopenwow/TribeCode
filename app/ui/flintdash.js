// Flint's card on the project dashboard (p10): "Do this next" (one to three concrete things, each one click from done)
// and "Living updates" (what is happening right now, in plain words). No AI needed: the suggestions come from the
// project's own state (the next setup step, the vision brief, tasks, suggested changes, unread messages) and the
// updates from presence, agents, the outbox and the project's recent changes. With an AI helper in the tribe, one
// line opens Flint to ask about the project. It replaces the scattered next-step bits on the dashboard; the one next
// setup step (#pj-check) lives inside this card.
//
// Public: window.TribeFlintDash = { html(ctx, nextHtml), bind(root, ctx), updates(ctx) }
//   ctx = { p, d, steps, nextIx, tasks, meId, canEdit }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const ico = (n, s = 14) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#${n}"/></svg>`;
  const FLAME = '<svg class="fd-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c.6 3.2 3.9 4.9 3.9 9a3.9 3.9 0 0 1-7.8 0c0-1.6.8-2.8 1.7-3.8.2 1.4 1 2.3 2 2.3-.8-2.8-.4-5.2.2-7.5z" fill="currentColor"/><path d="M12 21.5a7 7 0 0 1-7-7c0-3.4 2.2-5.6 3.6-7.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const DKEY = pid => `tribecode.fd.dismiss.${pid}`;
  const ago = iso => {
    const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s) || s < 0) return '';
    return s < 60 ? tr('just now') : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`;
  };
  const MOOD = { buzzing: 'Buzzing', steady: 'Steady', quiet: 'Quiet', fresh: 'Brand new' };

  // ---------- Do this next ----------
  // Each: { id, t (what), why (one short reason), btn, act: 'ck:<step>' | 'go:<view>' | 'creator' | 'changes' | 'task:<title>' }
  function suggestions(ctx) {
    const { p, d, steps = [], nextIx = -1, tasks = [], meId } = ctx, out = [];
    const gone = new Set(ls.get(DKEY(p.id), []));
    const add = x => { if (!gone.has(x.id) && !out.some(o => o.id === x.id)) out.push(x); };
    // 1. things waiting on people
    const W = window.TribeChanges && window.TribeChanges.waiting ? window.TribeChanges.waiting() : 0;
    const waiting = typeof W === 'number' ? W : (W && W.length) || 0;
    if (waiting) add({ id: 'changes', t: waiting === 1 ? tr('Look at 1 suggested change') : `${tr('Look at')} ${waiting} ${tr('suggested changes')}`, why: tr('Someone is waiting for an OK'), btn: tr('Look'), act: 'changes', tone: '--peer' });
    const review = tasks.filter(t => t.status === 'review');
    if (review.length) add({ id: 'review', t: review.length === 1 ? `${tr('Review')} “${review[0].title}”` : `${tr('Review')} ${review.length} ${tr('tasks')}`, why: tr('Done and waiting for a look'), btn: tr('Open'), act: 'go:tasks', tone: '--live' });
    // 2. the next setup step (the card under this list has the full step; here it is one line)
    // 3. from the vision: features named in the sentence that have no task yet
    const FM = window.TribeFirstMake, text = (d.vision && (d.vision.lead || d.vision.excerpt)) || d.bio || p.bio || '';
    if (FM && FM.brief && text) {
      let b = null; try { b = FM.brief(text); } catch {}
      const NAMES = { leaderboard: 'the leaderboard', streaks: 'streaks', chat: 'chat', map: 'the map', calendar: 'the calendar', booking: 'booking', shop: 'the shop', photos: 'the photo gallery', gallery: 'the photo gallery', timer: 'the timer', notes: 'notes', login: 'sign-in', profile: 'the profile screen', search: 'search', favourites: 'favourites', reminders: 'reminders', faq: 'the FAQ', pricing: 'pricing', contact: 'the contact form', signup: 'the sign-up form' };
      const have = tasks.map(t => String(t.title || '').toLowerCase()).join(' | ');
      const site = ctx.kind === 'site', named = [];
      // feat/dash-layout: a website's next things are website tasks; an app's are its features, then its own tasks
      if (!site) for (const f of (b && b.features) || []) {
        const nm = NAMES[f] || String(f).replace(/[-_]/g, ' ');
        if (have.includes(String(f).toLowerCase()) || have.includes(nm.replace(/^the /, ''))) continue;
        add({ id: 'feat:' + f, t: `${tr('Make')} ${nm} ${tr('work')}`, why: tr('You asked for it in your idea'), btn: tr('Add as a task'), act: 'task:' + `Make ${nm} work`, tone: '--ember' });
        named.push(String(f).toLowerCase().replace(/s$/, ''));
        if (out.length >= 2) break;
      }
      if (b && FM.tasks && (ctx.made || site)) for (const t of FM.tasks(b, ctx.kind || '')) {
        if (out.length >= 3) break;
        const lo = t.toLowerCase(); if (have.includes(lo) || named.some(n => lo.includes(n))) continue;
        add({ id: 'mk:' + lo.replace(/[^a-z0-9]+/g, '-').slice(0, 40), t: tr(t), why: tr(site ? 'Next for your website' : 'Next for what you made'), btn: tr('Add as a task'), act: 'task:' + t, tone: '--ember' });
      }
    }
    // 4. catching up
    const N = window.TribeNotify && window.TribeNotify.state ? window.TribeNotify.state() : {};
    if ((N.unread || 0) > 0) add({ id: 'unread', t: `${tr('Catch up on')} ${N.unread} ${N.unread === 1 ? tr('message') : tr('messages')}`, why: tr('New since you last looked'), btn: tr('Open chat'), act: 'go:chat', tone: '--peer' });
    const mine = tasks.filter(t => t.status !== 'done' && t.assignee === meId);
    if (mine.length) add({ id: 'mine', t: `${tr('Keep going')}: ${mine[0].title}`, why: mine.length > 1 ? `${mine.length} ${tr('tasks are yours')}` : tr('Your task'), btn: tr('Open'), act: 'go:tasks', tone: '--live' });
    if (!out.length && nextIx < 0) add({ id: 'creator', t: tr('Keep building'), why: tr('Open where you left off'), btn: tr('Open'), act: 'creator', tone: '--ember' });
    return out.slice(0, 3);
  }

  // ---------- Living updates ----------
  function updates(ctx) {
    const { p, d, meId } = ctx, out = [];
    const st = C() && C().state ? C().state() : {}, members = st.members || [];
    const nameOf = id => (members.find(m => m.id === id) || {}).name || '';
    for (const m of members) {
      if (m.id === meId || !m.online || m.project !== p.id) continue;
      out.push({ k: m.role === 'agent' ? 'agent' : 'person', color: m.color, who: m.name, t: m.where ? `${m.name} ${tr('is on')} ${m.where}` : `${m.name} ${tr('is here')}`, at: m.since || '' });
    }
    for (const a of d.agents || []) if (!out.some(o => o.who === a.name)) out.push({ k: 'agent', who: a.name, t: `${a.name} ${tr('is working')}${a.where ? ` · ${a.where}` : ''}`, at: a.since || '' });
    const ob = C() && C().outbox ? C().outbox().length : 0;
    if (ob) out.push({ k: 'wait', t: ob === 1 ? tr('1 message waiting to send') : `${ob} ${tr('messages waiting to send')}`, at: '' });
    const W = window.TribeChanges && window.TribeChanges.waiting ? window.TribeChanges.waiting() : 0, wn = typeof W === 'number' ? W : (W && W.length) || 0;
    if (wn) out.push({ k: 'change', t: wn === 1 ? tr('1 suggested change is waiting') : `${wn} ${tr('suggested changes are waiting')}`, at: '' });
    const VERB = { task: tr('updated the task'), doc: tr('edited'), commit: tr('saved') };
    for (const r of (d.recent || []).slice(0, Math.max(6, ctx.max || 0))) {
      const by = String(r.sub || '').split(' · ').slice(-1)[0];
      const who = r.kind === 'commit' ? by : (/ · /.test(r.sub || '') ? by : '');
      out.push({ k: r.kind, who, t: who ? `${who} ${VERB[r.kind] || ''} “${r.text}”` : r.kind === 'task' ? `${tr('Task')}: ${r.text}` : r.kind === 'doc' ? `${tr('Doc')}: ${r.text}` : r.text, at: r.at });
    }
    return out.slice(0, ctx.max || 5);
  }
  const TONE = { person: '--peer', agent: '--live', wait: '--amber', change: '--peer', task: '--live', doc: '--peer', commit: '--ember' };
  function updatesHtml(ctx) {
    const list = updates(ctx);
    if (!list.length) return `<p class="fd-quiet">${esc(tr('Quiet right now. Changes show up here as they happen.'))}</p>`;
    return `<ul class="fd-ups">${list.map(u => `<li class="fd-up" style="--t:var(${TONE[u.k] || '--muted'})"><span class="fd-dot" aria-hidden="true"></span><span class="fd-up-t">${esc(u.t)}</span>${u.at ? `<time class="fd-at" datetime="${esc(u.at)}">${esc(ago(u.at))}</time>` : ''}</li>`).join('')}</ul>`;
  }

  function aiHere() {
    const st = C() && C().state ? C().state() : {};
    return (st.members || []).some(m => m.role === 'agent');
  }

  function html(ctx, nextHtml = '') {
    const { d } = ctx, sug = suggestions(ctx), L = d.living || {};
    const mood = L.mood ? tr(MOOD[L.mood] || '') : '';
    const quiet = !updates(ctx).length && !aiHere();   // v0.45: nothing happening is one calm line under the list, not half an empty card
    return `<section class="fd card${quiet ? ' fd-calm' : ''}${sug.length ? '' : ' fd-nosug'}" id="fd" aria-label="${esc(tr('Flint'))}">
      <header class="fd-head">${FLAME}<b>Flint</b>${mood ? `<span class="fd-mood fd-${esc(L.mood)}">${esc(mood)}</span>` : ''}<span class="fd-sum">${esc(L.summary || '')}</span></header>
      <div class="fd-cols">
        <div class="fd-col fd-next-col">${sug.length || !nextHtml ? `<span class="eyebrow">${esc(tr('Do this next'))}</span>` : ''}
          ${sug.length ? `<ul class="fd-sugs">${sug.map(x => `<li class="fd-sug" data-fd="${esc(x.id)}" style="--t:var(${x.tone})" title="${esc(x.why)}"><span class="fd-sug-t"><b>${esc(x.t)}</b><small>${esc(x.why)}</small></span><button type="button" class="btn sm fd-go" data-fd-act="${esc(x.act)}">${esc(x.btn)}</button><button type="button" class="fd-x" data-fd-x="${esc(x.id)}" aria-label="${esc(tr('Not now'))}" title="${esc(tr('Not now'))}">×</button></li>`).join('')}</ul>` : (nextHtml ? '' : `<p class="fd-quiet">${esc(tr('Nothing waiting on you. Nice.'))}</p>`)}
          ${nextHtml ? `<div class="fd-step">${nextHtml}</div>` : ''}
        </div>
        <div class="fd-col fd-live-col"><span class="eyebrow">${esc(tr('Living updates'))}<i class="fd-pulse" aria-hidden="true"></i></span><div id="fd-ups" aria-live="polite">${updatesHtml(ctx)}</div>
          ${aiHere() ? `<button type="button" class="linkish fd-ask" id="fd-ask">${ico('i-chat', 13)}${esc(tr('Ask Flint about this project'))}</button>` : ''}</div>
      </div></section>`;
  }

  let live = null, timer = null;
  function bind(root, ctx) {
    live = ctx;
    const box = root && root.querySelector('#fd'); if (!box) return;
    const PJ = window.TribeProjects, App = window.TribeApp;
    box.querySelectorAll('[data-fd-x]').forEach(b => b.onclick = () => {
      const k = DKEY(ctx.p.id), g = ls.get(k, []); g.push(b.dataset.fdX); ls.set(k, g.slice(-40));
      const li = b.closest('.fd-sug'); if (li) li.remove();
    });
    box.querySelectorAll('[data-fd-act]').forEach(b => b.onclick = async () => {
      const a = b.dataset.fdAct;
      if (a.startsWith('go:')) return App && App.show(a.slice(3));
      if (a === 'changes') return window.TribeChanges && window.TribeChanges.sheet && window.TribeChanges.sheet(ctx.p.id);
      if (a === 'creator') { const band = document.querySelector('#pj-band-slot [data-db="open"]'); if (band) band.click(); return; }
      if (a.startsWith('task:')) {
        b.disabled = true;
        try { await C().api('/tasks', { method: 'POST', body: { title: a.slice(5), status: 'backlog' } }); App && App.toast && App.toast(tr('Added to the task board')); const li = b.closest('.fd-sug'); if (li) li.remove(); }
        catch (e) { b.disabled = false; App && App.toast && App.toast(e.message || String(e)); }
      }
    });
    const ask = box.querySelector('#fd-ask'); if (ask) ask.onclick = () => { const F = window.TribeFlint; if (F && F.prefill) F.prefill(`About ${ctx.p.name}: `); if (F && F.focus) F.focus(); };
    clearInterval(timer); timer = setInterval(refresh, 30000);
  }
  function refresh() {
    const el = document.getElementById('fd-ups'); if (!el || !live) { clearInterval(timer); return; }
    el.innerHTML = updatesHtml(live);
    const box = document.getElementById('fd'); if (box) box.classList.toggle('fd-calm', !updates(live).length && !aiHere());
  }
  // live: presence, agents and the outbox change the updates without a full redraw
  const hook = () => { const C0 = C(); if (!C0 || !C0.on) return setTimeout(hook, 300); ['presence', 'outbox', 'outbox-sent', 'outbox-failed', 'task', 'doc', 'claims'].forEach(e => C0.on(e, () => setTimeout(refresh, 0))); };
  hook();

  window.TribeFlintDash = { html, bind, updates, suggestions, refresh };
})();
