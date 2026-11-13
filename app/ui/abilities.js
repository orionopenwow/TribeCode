// Abilities + gigs for yourself (feat/company-gigs). Lives in Work (talent.js) and on Home › Work.
//   * "List your abilities": a profile you edit (skills as tags with levels, roles you'd take, tools, hours/week and
//     time zone, rate or "free / for equity / for fun", GitHub + portfolio links, a short bio) and who sees it per
//     tribe (each project you're in, or the whole tribe). With no tribe it is kept on this device and synced to every
//     tribe you join (PUT /api/talent/profile).
//   * "Create a gig for yourself": an offer ("I'll design your logo") with title, description, what you deliver,
//     timeline, price or terms and tags, shown in the Work gigs of the places you pick. Others Request it; you Accept
//     (it becomes a task assigned to you through the Task Board's accept flow) or Decline. Offline it waits here and
//     posts when you're connected.
//   * The profile page per member (people list, chat avatars, seats): abilities, open gigs, finished work.
//   * Find people: Work › Find people filters by skill and hours free (talent.js draws the list, calls profile()).
// Server: server/talent.js (kind 'offer', /gigs/:id/request, /gigs/:id/requests/:rid/accept|decline, /profile/:id).
// Public: window.TribeAbilities = { edit(), post(prefill), profile(id), mount(el), offerCard(g), request(gid),
//   local(), flintPost(text), flintFind(skill) }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  // feat/work-v2: a tribe that lives in this tab (offline.js) has no Work backend, so abilities stay on this device there
  const on = () => !!(C && C.connected && C.connected()) && !(window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active());
  const st = () => (C && C.state ? C.state() : {}) || {};
  const me = () => st().me || {};
  const projects = () => st().projects || [];
  const safeHref = u => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; } };
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  const ICONS = {
    star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z"/>',
    briefcase: '<rect x="3.5" y="7" width="17" height="12" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12h17"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  };
  const icon = (n, s = 16) => (window.TribeIcons && window.TribeIcons.svg && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s)
    : `<svg class="ab-ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);
  const ROLES = { cto: 'Build', design: 'Design', growth: 'Grow', sales: 'Sales', support: 'Support', ops: 'Run', finance: 'Finance', legal: 'Legal', ceo: 'Lead' };
  const RATE = { free: 'Free', fun: 'For fun', equity: 'For equity', time: 'Time swap', paid: 'Paid' };
  const LEVEL = ['', 'Learning', 'Good', 'Expert'];

  // ---------- this device (works with no tribe) ----------
  const LS = 'tribecode.abilities.v1';
  const blank = () => ({ profile: { skills: [], levels: {}, roles: [], tools: [], hours: 0, tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(), rate: { type: 'free', text: '' }, links: [], bio: '', open: true, visibleIn: [], updated: null }, gigs: [], synced: {} });
  const local = () => { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && v.profile ? { ...blank(), ...v } : blank(); } catch { return blank(); } };
  const saveLocal = v => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };
  const tribeKey = () => { const t = st().tribe || {}; return `${(C && C.base && C.base()) || ''}|${t.name || ''}|${t.created || ''}`; };
  let syncing = false;
  async function sync() {
    if (!on() || syncing || !me().id || me().role === 'agent' || me().role === 'spectator') return;
    if (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active()) return;   // a tribe in this tab has no Work backend: keep it on this device
    syncing = true;
    try {
      const L = local(), k = tribeKey(), s = L.synced[k] || { gigs: {} };
      if (L.profile.updated && (!s.profile || s.profile < L.profile.updated)) {
        const { visibleIn, ...p } = L.profile;   // per-tribe visibility stays this tribe's own choice
        await C.api('/talent/profile', { method: 'PUT', body: p }); s.profile = L.profile.updated;
      }
      for (const g of L.gigs) {
        if (s.gigs[g.lid]) continue;
        const r = await C.api('/talent/gigs', { method: 'POST', body: { ...gigBody(g), places: [] } }); s.gigs[g.lid] = r.gig.id;
      }
      L.synced[k] = s; saveLocal(L);
    } catch (e) { console.warn('abilities sync', e.message); }
    syncing = false;
  }
  const gigBody = g => ({ kind: 'offer', title: g.title, description: g.description, deliver: g.deliver, timeline: g.timeline, pay: g.pay, skills: g.skills, places: g.places || [] });

  // ---------- data from the tribe ----------
  let cache = { me: null, gigs: null, at: 0 };
  async function loadMine(force) {
    if (!on()) return null;
    if (!force && Date.now() - cache.at < 4000 && cache.gigs) return cache;
    try { const [p, g] = await Promise.all([C.api('/talent/profile'), C.api('/talent/gigs')]); cache = { me: p.profile, gigs: g.gigs || [], at: Date.now() }; } catch { /* keep the old cache */ }
    return cache;
  }

  // ---------- sheets ----------
  function sheet(title, eyebrow, html, onMount, wide) {
    close();
    const scrim = document.createElement('div'); scrim.className = 'ab-scrim'; scrim.onclick = close;
    const el = document.createElement('div'); el.className = 'ab-sheet' + (phone() ? ' phone' : '') + (wide ? ' wide' : ''); el.id = 'ab-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', title);
    el.innerHTML = `<header class="ab-sh-h"><div><span class="eyebrow">${esc(eyebrow)}</span><h2>${esc(title)}</h2></div><button class="ab-x" data-close aria-label="Close">${icon('x', 18)}</button></header><div class="ab-sh-b">${html}</div>`;
    document.body.append(scrim, el);
    el.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    if (onMount) onMount(el);
    return el;
  }
  function close() { const s = $('#ab-sheet'); if (s) s.remove(); document.querySelectorAll('.ab-scrim').forEach(x => x.remove()); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#ab-sheet')) close(); });
  const seg = (id, opts, cur) => `<div class="ab-seg" role="radiogroup" id="${id}">${opts.map(([k, l]) => `<button type="button" role="radio" aria-checked="${cur === k}" class="${cur === k ? 'on' : ''}" data-v="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;
  const segVal = (el, id) => { const b = el.querySelector(`#${id} .on`); return b ? b.dataset.v : ''; };
  const wireSegs = el => el.querySelectorAll('.ab-seg').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; g.querySelectorAll('button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); g.dispatchEvent(new Event('seg')); }));
  const placesHtml = (id, sel) => projects().length ? `<div class="ab-chips" id="${id}" role="group" aria-label="Where">${projects().map(p => `<button type="button" class="ab-chip${(sel || []).includes(p.id) ? ' on' : ''}" aria-pressed="${(sel || []).includes(p.id)}" data-place="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '';
  const placesVal = (el, id) => [...el.querySelectorAll(`#${id} .ab-chip.on`)].map(b => b.dataset.place);
  const wireChips = el => el.querySelectorAll('.ab-chips').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('.ab-chip'); if (!b) return; b.classList.toggle('on'); b.setAttribute('aria-pressed', String(b.classList.contains('on'))); }));

  // skills with levels: "pixel art" + Learning/Good/Expert
  function skillRows(p) { return (p.skills || []).map(s => skillRow(s, (p.levels || {})[s] || 2)).join(''); }
  const skillRow = (s, lv) => `<li class="ab-sk" data-skill="${esc(s)}"><span>${esc(s)}</span>${seg('', [['1', 'Learning'], ['2', 'Good'], ['3', 'Expert']], String(lv)).replace('id=""', '')}<button type="button" class="ab-rm" aria-label="Remove ${esc(s)}">${icon('x', 14)}</button></li>`;

  async function edit() {
    const L = local();
    let p = L.profile;
    if (on()) { try { const r = await C.api('/talent/profile'); p = r.profile.updated ? { ...L.profile, ...r.profile } : { ...r.profile, ...L.profile }; /* a first-time tribe profile starts from this device's */ } catch {} }
    const link = label => ((p.links || []).find(l => (l.label || '').toLowerCase() === label.toLowerCase()) || {}).url || '';
    const el = sheet('List your abilities', 'Your work profile', `<form id="ab-pf" class="ab-form">
      <label class="ab-check"><input type="checkbox" id="ab-open" ${p.open !== false ? 'checked' : ''}><span><b>Open to work</b><small>People can find you in Work › Find people.</small></span></label>
      <div class="ab-f"><span class="ab-l">Skills <small>with how good you are</small></span><ul class="ab-sks" id="ab-sks">${skillRows(p)}</ul>
        <div class="ab-add"><input class="input" id="ab-sk-in" maxlength="24" placeholder="Add a skill, e.g. pixel art" aria-label="Add a skill"><button type="button" class="btn sm" id="ab-sk-add">Add</button></div></div>
      <div class="ab-f"><span class="ab-l">Roles you'd take</span><div class="ab-chips" id="ab-roles">${Object.entries(ROLES).map(([k, l]) => `<button type="button" class="ab-chip${(p.roles || []).includes(k) ? ' on' : ''}" aria-pressed="${(p.roles || []).includes(k)}" data-role="${k}">${l}</button>`).join('')}</div></div>
      <label class="ab-f"><span class="ab-l">Tools <small>commas</small></span><input class="input" id="ab-tools" maxlength="300" value="${esc((p.tools || []).join(', '))}" placeholder="Figma, Godot, Claude Code"></label>
      <div class="ab-two"><label class="ab-f"><span class="ab-l">Hours a week</span><input class="input" id="ab-hours" type="number" min="0" max="80" step="1" value="${esc(p.hours || '')}" placeholder="5"></label>
        <label class="ab-f"><span class="ab-l">Time zone</span><input class="input" id="ab-tz" maxlength="64" value="${esc(p.tz || '')}" placeholder="Europe/Lisbon"></label></div>
      <div class="ab-f"><span class="ab-l">Rate or terms</span>${seg('ab-rate', Object.entries(RATE), (p.rate || {}).type || 'free')}<input class="input" id="ab-rate-t" maxlength="80" value="${esc((p.rate || {}).text || '')}" placeholder="e.g. $40/h, or 1 h for 1 h"></div>
      <div class="ab-two"><label class="ab-f"><span class="ab-l">GitHub</span><input class="input" id="ab-gh" maxlength="300" value="${esc(link('GitHub'))}" placeholder="https://github.com/you"></label>
        <label class="ab-f"><span class="ab-l">Portfolio</span><input class="input" id="ab-pf-url" maxlength="300" value="${esc(link('Portfolio'))}" placeholder="https://…"></label></div>
      <label class="ab-f"><span class="ab-l">Short bio</span><textarea class="input" id="ab-bio" rows="3" maxlength="600" placeholder="What you like making, in a line or two">${esc(p.bio || '')}</textarea></label>
      ${projects().length ? `<div class="ab-f"><span class="ab-l">Who sees it <small>none picked = the whole tribe</small></span>${placesHtml('ab-vis', p.visibleIn)}</div>` : `<p class="ab-fine">Saved on this device. It goes to every tribe you join.</p>`}
      <div class="ab-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit" id="ab-save">Save</button></div></form>`, el => {
      wireSegs(el); wireChips(el);
      const ul = el.querySelector('#ab-sks'), inp = el.querySelector('#ab-sk-in');
      const addSkill = () => { const v = inp.value.trim().toLowerCase().slice(0, 24); if (!v) return; if (ul.querySelector(`[data-skill="${CSS.escape(v)}"]`) || ul.children.length >= 12) { inp.value = ''; return; } ul.insertAdjacentHTML('beforeend', skillRow(v, 2)); wireSegs(ul.lastElementChild); inp.value = ''; inp.focus(); };
      el.querySelector('#ab-sk-add').onclick = addSkill;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } });
      ul.addEventListener('click', e => { const b = e.target.closest('.ab-rm'); if (b) b.closest('li').remove(); });
      el.querySelector('.ab-sh-b [data-close]').onclick = close;
      el.querySelector('#ab-pf').onsubmit = async e => {
        e.preventDefault(); if (inp.value.trim()) addSkill();
        const skills = [...ul.querySelectorAll('li')].map(li => li.dataset.skill), levels = {};
        ul.querySelectorAll('li').forEach(li => { const b = li.querySelector('.ab-seg .on'); levels[li.dataset.skill] = Number(b ? b.dataset.v : 2); });
        const links = [['GitHub', el.querySelector('#ab-gh').value.trim()], ['Portfolio', el.querySelector('#ab-pf-url').value.trim()]].filter(x => safeHref(x[1])).map(([label, url]) => ({ label, url }));
        const prof = { open: el.querySelector('#ab-open').checked, skills, levels, roles: [...el.querySelectorAll('#ab-roles .on')].map(b => b.dataset.role),
          tools: el.querySelector('#ab-tools').value.split(',').map(s => s.trim()).filter(Boolean), hours: +el.querySelector('#ab-hours').value || 0, tz: el.querySelector('#ab-tz').value.trim(),
          rate: { type: segVal(el, 'ab-rate') || 'free', text: el.querySelector('#ab-rate-t').value.trim() }, links, bio: el.querySelector('#ab-bio').value.trim() };
        if (el.querySelector('#ab-vis')) prof.visibleIn = placesVal(el, 'ab-vis');
        const L2 = local(); L2.profile = { ...L2.profile, ...prof, updated: new Date().toISOString() };
        try {
          if (on()) { await C.api('/talent/profile', { method: 'PUT', body: prof }); (L2.synced[tribeKey()] = L2.synced[tribeKey()] || { gigs: {} }).profile = L2.profile.updated; }
          saveLocal(L2); close(); toast(on() ? 'Abilities saved' : 'Abilities saved on this device'); refresh();
        } catch (er) { toast(er.message); }
      };
    });
    return el;
  }

  function post(pre = {}) {
    const el = sheet('Create a gig for yourself', 'Offer your skills', `<form id="ab-gf" class="ab-form">
      <label class="ab-f"><span class="ab-l">What will you do?</span><input class="input" id="ab-g-title" maxlength="100" required placeholder="I'll design your logo" value="${esc(pre.title || '')}"></label>
      <label class="ab-f"><span class="ab-l">Description <small>optional</small></span><textarea class="input" id="ab-g-desc" rows="3" maxlength="2000" placeholder="Who it's for and how you work">${esc(pre.description || '')}</textarea></label>
      <label class="ab-f"><span class="ab-l">What you deliver</span><input class="input" id="ab-g-deliver" maxlength="600" placeholder="3 logo options + the final files" value="${esc(pre.deliver || '')}"></label>
      <div class="ab-two"><label class="ab-f"><span class="ab-l">Timeline</span><input class="input" id="ab-g-time" maxlength="80" placeholder="This weekend" value="${esc(pre.timeline || '')}"></label>
        <label class="ab-f"><span class="ab-l">Tags <small>commas</small></span><input class="input" id="ab-g-tags" maxlength="200" placeholder="logo, branding" value="${esc((pre.skills || []).join(', '))}"></label></div>
      <div class="ab-f"><span class="ab-l">Price or terms</span>${seg('ab-g-pay', Object.entries(RATE), (pre.pay && pre.pay.type) || 'free')}<input class="input" id="ab-g-paytext" maxlength="80" placeholder="e.g. $150, or a review swap" value="${esc((pre.pay && pre.pay.text) || '')}"></div>
      ${projects().length ? `<div class="ab-f"><span class="ab-l">Show it in <small>none picked = the whole tribe</small></span>${placesHtml('ab-g-places', pre.places)}</div>` : '<p class="ab-fine">Saved on this device. It posts to Work in your tribe as soon as you join one.</p>'}
      <p class="ab-fine">TribeCode moves no money. Prices are a note; you settle it yourselves.</p>
      <div class="ab-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit" id="ab-g-go">Post gig</button></div></form>`, el => {
      wireSegs(el); wireChips(el);
      el.querySelector('.ab-sh-b [data-close]').onclick = close;
      el.querySelector('#ab-gf').onsubmit = async e => {
        e.preventDefault();
        const g = { title: el.querySelector('#ab-g-title').value.trim(), description: el.querySelector('#ab-g-desc').value.trim(), deliver: el.querySelector('#ab-g-deliver').value.trim(), timeline: el.querySelector('#ab-g-time').value.trim(),
          skills: el.querySelector('#ab-g-tags').value.split(',').map(s => s.trim()).filter(Boolean), pay: { type: segVal(el, 'ab-g-pay') || 'free', text: el.querySelector('#ab-g-paytext').value.trim() }, places: el.querySelector('#ab-g-places') ? placesVal(el, 'ab-g-places') : [] };
        if (!g.title) return el.querySelector('#ab-g-title').focus();
        try {
          if (on()) { await C.api('/talent/gigs', { method: 'POST', body: gigBody(g) }); toast('Your gig is up on Work'); }
          else { const L = local(); L.gigs.push({ ...g, lid: 'l-' + Date.now().toString(36), at: new Date().toISOString() }); saveLocal(L); toast('Saved on this device. It posts when you join a tribe.'); }
          close(); refresh();
        } catch (er) { toast(er.message); }
      };
    });
    return el;
  }

  // ---------- requesting an offer, answering requests ----------
  async function request(gid) {
    const c = await loadMine(true), g = ((c && c.gigs) || []).find(x => x.id === gid); if (!g) return toast('That gig is gone');
    const pj = projects();
    sheet(g.title, `Request from ${g.byName}`, `<form id="ab-rf" class="ab-form">${offerBody(g)}
      <label class="ab-f"><span class="ab-l">A note for ${esc(g.byName)} <small>optional</small></span><textarea class="input" id="ab-r-note" rows="3" maxlength="600" placeholder="What you need and by when"></textarea></label>
      ${pj.length > 1 ? `<label class="ab-f"><span class="ab-l">For which project</span><select class="input" id="ab-r-proj">${pj.map(p => `<option value="${esc(p.id)}" ${p.id === ((g.places || [])[0] || (C.project && C.project())) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
      <div class="ab-foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit" id="ab-r-go">Request</button></div></form>`, el => {
      el.querySelector('.ab-sh-b [data-close]').onclick = close;
      el.querySelector('#ab-rf').onsubmit = async e => {
        e.preventDefault(); const pr = el.querySelector('#ab-r-proj');
        try { await C.api(`/talent/gigs/${encodeURIComponent(gid)}/request`, { method: 'POST', body: { note: el.querySelector('#ab-r-note').value, project: pr ? pr.value : (g.places || [])[0] || (C.project && C.project()) || null } }); close(); toast(`Asked ${g.byName}. You'll hear back in your inbox.`); refresh(); }
        catch (er) { toast(er.message); }
      };
    });
  }
  async function answer(gid, rid, yes) {
    let reason = '';
    if (!yes) { reason = prompt('A short reason (optional)') ; if (reason === null) return; }
    try { const r = await C.api(`/talent/gigs/${encodeURIComponent(gid)}/requests/${encodeURIComponent(rid)}/${yes ? 'accept' : 'decline'}`, { method: 'POST', body: { reason } });
      toast(yes ? `Accepted: "${r.task.title}" is on your task board` : 'Declined'); refresh(); if (yes && window.TribeTasks && window.TribeTasks.load) window.TribeTasks.load(); }
    catch (e) { toast(e.message); }
  }

  // ---------- pieces other views use ----------
  const payLine = p => p ? `${esc(RATE[p.type] || 'Free')}${p.text ? ` · ${esc(p.text)}` : ''}` : 'Free';
  const offerBody = g => `${g.description ? `<p class="ab-read">${esc(g.description)}</p>` : ''}<dl class="ab-dl">${g.deliver ? `<div><dt>You get</dt><dd>${esc(g.deliver)}</dd></div>` : ''}${g.timeline ? `<div><dt>Timeline</dt><dd>${esc(g.timeline)}</dd></div>` : ''}<div><dt>Terms</dt><dd>${payLine(g.pay)}</dd></div></dl>
    ${(g.skills || []).length ? `<div class="ab-tags">${g.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}`;
  function offerCard(g, opt = {}) {
    const mine = g.by === me().id, reqs = (g.requests || []).filter(r => r.status === 'requested');
    return `<article class="ab-offer card" data-offer="${esc(g.id)}">
      <div class="ab-o-top"><span class="eyebrow">Offer${g.placeNames && g.placeNames.length ? ` · ${esc(g.placeNames.join(', '))}` : ''}${g.hidden ? ' · hidden' : ''}</span></div>
      <h3>${esc(g.title)}</h3>${offerBody(g)}
      ${mine && opt.manage ? `<div class="ab-reqs">${(g.requests || []).length ? (g.requests || []).slice().reverse().map(r => `<div class="ab-req" data-req="${esc(r.id)}"><div><b>${esc(r.name)}</b><small>${r.note ? esc(r.note) + ' · ' : ''}${esc(ago(r.at))}${r.projectName ? ` · ${esc(r.projectName)}` : ''}</small></div>
        ${r.status === 'requested' ? `<span class="ab-req-b"><button class="btn sm primary" data-accept="${esc(g.id)}|${esc(r.id)}">Accept</button><button class="btn sm ghost" data-decline="${esc(g.id)}|${esc(r.id)}">Decline</button></span>` : `<span class="ab-st s-${esc(r.status)}">${r.status === 'accepted' ? 'Accepted · on your board' : 'Declined'}</span>`}</div>`).join('') : '<p class="ab-fine">No requests yet.</p>'}</div>` : ''}
      <div class="ab-o-f"><button class="linkish" data-ab-person="${esc(g.by)}">${icon('user', 14)}${esc(mine ? 'You' : g.byName)}</button>
        ${mine ? (opt.manage ? `<span class="ab-req-b"><button class="btn sm ghost" data-gclose="${esc(g.id)}">${g.status === 'open' ? 'Close' : 'Reopen'}</button></span>` : `<span class="ab-st">${reqs.length ? `${reqs.length} request${reqs.length === 1 ? '' : 's'}` : 'Yours'}</span>`)
          : g.requested ? '<span class="ab-st s-accepted">Requested</span>' : g.status === 'open' && me().role !== 'spectator' ? `<button class="btn sm primary" data-request="${esc(g.id)}">Request</button>` : ''}
        ${g.canHide && !mine ? `<button class="btn sm ghost" data-hide="${esc(g.id)}|${g.hidden ? 0 : 1}">${g.hidden ? 'Unhide' : 'Hide'}</button>` : ''}</div></article>`;
  }
  // one delegated click handler for every place offer cards show up
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-request],[data-accept],[data-decline],[data-gclose],[data-hide],button[data-ab-person],[data-ab]'); if (!t || !t.closest('.ab-offer, .ab-home, .ab-page, .tl-person, .ab-findbar')) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.request) return request(t.dataset.request);
    if (t.dataset.accept) { const [g, r] = t.dataset.accept.split('|'); t.disabled = true; return answer(g, r, true); }
    if (t.dataset.decline) { const [g, r] = t.dataset.decline.split('|'); return answer(g, r, false); }
    if (t.dataset.abPerson) return profile(t.dataset.abPerson);
    if (t.dataset.hide) { const [g, h] = t.dataset.hide.split('|'); try { await C.api(`/talent/gigs/${encodeURIComponent(g)}/hide`, { method: 'POST', body: { hidden: h === '1' } }); toast(h === '1' ? 'Hidden from Work' : 'Shown again'); refresh(); } catch (er) { toast(er.message); } return; }
    if (t.dataset.gclose) { const c = await loadMine(), g = ((c && c.gigs) || []).find(x => x.id === t.dataset.gclose); if (!g) return; try { await C.api(`/talent/gigs/${encodeURIComponent(g.id)}`, { method: 'PATCH', body: { status: g.status === 'open' ? 'closed' : 'open' } }); refresh(); } catch (er) { toast(er.message); } return; }
    const a = t.dataset.ab;
    if (a === 'edit') return edit();
    if (a === 'post') return post();
    if (a === 'me') return on() ? profile(me().id) : edit();
    if (a === 'local-del') { const L = local(); L.gigs = L.gigs.filter(g => g.lid !== t.dataset.lid); saveLocal(L); refresh(); }
  }, true);

  // ---------- Work (feat/work-v2): a compact "Your abilities" strip, and the My offers tab ----------
  let mountEl = null, offersEl = null;
  const ti = (n, s) => (window.TribeIcons && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s) : icon(n, s));
  async function mount(el) {
    if (!el) return; mountEl = el;
    const L = local(); let p = L.profile;
    if (on()) { const c = await loadMine(); if (c && c.me) p = c.me; }
    if (!el.isConnected) return;
    const tags = (p.skills || []).slice(0, 4).map(s => `<span>${esc(s)}${(p.levels || {})[s] === 3 ? ' <i>Expert</i>' : ''}</span>`).join('');
    const more = (p.skills || []).length > 4 ? `<span class="ab-more">+${p.skills.length - 4}</span>` : '';
    const line = tags ? `${p.hours ? `${esc(p.hours)} h/week` : 'Hours not set'} · ${payLine(p.rate)}${p.open === false ? ' · not open to work' : ''}` : '';
    el.innerHTML = `<div class="ab-home wk-row ab-strip" aria-label="Your abilities"><span class="wk-row-ic">${ti('star', 18)}</span>
      <span class="wk-row-t"><b>Your abilities</b>${tags ? `<span class="ab-tags">${tags}${more}</span><span class="wk-row-v">${line}</span>` : '<span class="wk-row-v">Not listed yet. Add skills so friends can find you.</span>'}</span>
      <span class="ab-strip-b">${tags && on() ? '<button class="linkish" data-ab="me">Profile</button>' : ''}<button class="${tags ? 'linkish' : 'btn sm primary'}" data-ab="edit" id="ab-edit">${tags ? 'Edit' : 'Add abilities'}</button></span></div>`;
  }
  const HOW = [['gift', 'Say what you can do, like “I’ll draw your sprites”.'], ['hand', 'Friends ask for it.'], ['check', 'Accept and it lands on your task board.']];
  async function mountOffers(el) {
    if (!el) return; offersEl = el;
    const L = local(); let gigs = [];
    if (on()) { const c = await loadMine(); gigs = ((c && c.gigs) || []).filter(g => g.by === me().id && g.kind === 'offer'); }
    if (!el.isConnected) return;
    const localOnly = on() ? [] : L.gigs, n = gigs.length + localOnly.length;
    const pend = gigs.reduce((k, g) => k + (g.requests || []).filter(r => r.status === 'requested').length, 0);
    el.innerHTML = `<section class="ab-home ab-offers" aria-label="My offers">
      ${n ? `<div class="tl-bar"><span class="ab-count">${n} offer${n === 1 ? '' : 's'}${pend ? ` · <b>${pend} request${pend === 1 ? '' : 's'} to answer</b>` : ''}</span><button class="btn sm primary" data-ab="post" id="ab-post">${ti('gift', 14)} Offer help</button></div>` : `
      <section class="wk-empty" id="ab-empty"><span class="wk-empty-ic">${ti('gift', 24)}</span><h3>Offer what you can do</h3><p>Post a gig for yourself. Friends ask for it; you choose yes or no.${on() ? '' : ' It waits on this device and posts when you join a tribe.'}</p>
        <div class="tl-empty-acts"><button class="btn primary" data-ab="post" id="ab-post">${ti('gift', 16)} Offer help</button></div>
        <span class="wk-how-h">How it works</span><ol class="wk-how" aria-label="How it works">${HOW.map(([i, t], k) => `<li><span class="wk-how-ic">${ti(i, 18)}</span><span><b>${k + 1}.</b> ${esc(t)}</span></li>`).join('')}</ol></section>`}
      ${gigs.length ? `<div class="ab-list" id="ab-mygigs">${gigs.map(g => offerCard(g, { manage: true })).join('')}</div>` : ''}
      ${localOnly.length ? `<div class="ab-list" id="ab-local">${localOnly.map(g => `<article class="ab-offer card"><div class="ab-o-top"><span class="eyebrow">On this device · posts when you join a tribe</span></div><h3>${esc(g.title)}</h3>${offerBody(g)}<div class="ab-o-f"><span></span><button class="btn sm ghost" data-ab="local-del" data-lid="${esc(g.lid)}">Remove</button></div></article>`).join('')}</div>` : ''}
    </section>`;
  }
  function refresh() { cache.at = 0; if (mountEl && mountEl.isConnected) mount(mountEl); if (offersEl && offersEl.isConnected) mountOffers(offersEl); if (window.TribeTalent && window.TribeTalent.reload) window.TribeTalent.reload(); if ($('#ab-page')) profile($('#ab-page').dataset.id); }

  // ---------- the profile page ----------
  async function profile(id) {
    if (!id) return;
    if (!on()) return edit();
    let d; try { d = await C.api(`/talent/profile/${encodeURIComponent(id)}`); } catch (e) { return toast(e.message); }
    const p = d.profile, mem = (st().members || []).find(m => m.id === id) || p;
    const av = window.TribeProfiles && window.TribeProfiles.avatar ? window.TribeProfiles.avatar(mem, 'xl') : `<span class="ab-av" style="background:${esc(p.color || 'var(--peer)')}">${esc((p.name || '?')[0])}</span>`;
    const skills = (p.skills || []).map(s => { const lv = (p.levels || {})[s] || 0; return `<li><span>${esc(s)}</span><span class="ab-lv" aria-label="${esc(LEVEL[lv] || 'Level not set')}">${[1, 2, 3].map(n => `<i class="${n <= lv ? 'on' : ''}"></i>`).join('')}</span><small>${esc(LEVEL[lv] || '')}</small></li>`; }).join('');
    const links = (p.links || []).map(l => safeHref(l.url) ? `<a href="${esc(safeHref(l.url))}" target="_blank" rel="noopener noreferrer nofollow">${icon('link', 14)}${esc(l.label || new URL(l.url).host)}</a>` : '').join('');
    const done = (d.done || []).map(x => `<li><span class="ab-dk">${x.kind === 'gig' ? 'Gig' : 'Task'}</span><div><b>${esc(x.title)}</b><small>${x.projectName ? `${esc(x.projectName)} · ` : ''}${esc(ago(x.at))}${x.rating ? ` · ${'★'.repeat(x.rating)}` : ''}</small></div></li>`).join('');
    const el = sheet(p.name, d.you ? 'Your profile' : 'Profile', `<div class="ab-page" id="ab-page" data-id="${esc(id)}">
      <header class="ab-p-h">${av}<div><p class="ab-bio">${p.bio ? esc(p.bio) : `<span class="faint">${d.you ? 'Add a short bio in your abilities.' : 'No bio yet.'}</span>`}</p>
        <p class="ab-facts">${p.open ? '<span class="ab-open">Open to work</span>' : ''}<span>${p.hours ? `${esc(p.hours)} h/week` : 'Hours not set'}</span>${p.tz ? `<span>${esc(p.tz)}</span>` : ''}<span>${payLine(p.rate)}</span></p>
        ${links ? `<p class="ab-links">${links}</p>` : ''}</div></header>
      <section class="ab-p-s"><span class="eyebrow">Abilities</span>${skills ? `<ul class="ab-skl">${skills}</ul>` : `<p class="ab-fine">${d.you ? 'No skills listed yet.' : 'No skills listed yet.'}</p>`}
        ${(p.roles || []).length ? `<p class="ab-sub"><b>Roles</b> ${p.roles.map(r => esc(ROLES[r] || r)).join(' · ')}</p>` : ''}${(p.tools || []).length ? `<p class="ab-sub"><b>Tools</b> ${p.tools.map(esc).join(' · ')}</p>` : ''}</section>
      <section class="ab-p-s"><span class="eyebrow">Open gigs</span>${(d.gigs || []).length ? `<div class="ab-list">${d.gigs.map(g => offerCard(g, { manage: d.you })).join('')}</div>` : `<p class="ab-fine">${d.you ? 'No open gigs.' : 'No open gigs right now.'}</p>`}</section>
      <section class="ab-p-s"><span class="eyebrow">Finished work</span>${done ? `<ul class="ab-done">${done}</ul>` : '<p class="ab-fine">Finished tasks and gigs show up here as proof of work.</p>'}</section>
      <div class="ab-foot">${d.you ? '<button class="btn sm" data-ab="edit">Edit abilities</button><button class="btn sm primary" data-ab="post">Create a gig</button>' : `${d.canHide ? `<button class="btn sm ghost" id="ab-hide-p">${p.hidden ? 'Unhide profile' : 'Hide profile'}</button>` : ''}<button class="btn sm" id="ab-msg">Message</button>`}</div></div>`, el => {
      const msg = el.querySelector('#ab-msg'); if (msg) msg.onclick = () => { close(); if (window.TribeDM && window.TribeDM.open) window.TribeDM.open(id); };
      const hp = el.querySelector('#ab-hide-p'); if (hp) hp.onclick = async () => { try { await C.api(`/talent/profile/${encodeURIComponent(id)}/hide`, { method: 'POST', body: { hidden: !p.hidden } }); toast(p.hidden ? 'Profile shown again' : 'Profile hidden'); profile(id); } catch (e) { toast(e.message); } };
    }, true);
    return el;
  }

  // ---------- Flint: "post a gig for me: …", "find someone who can draw" ----------
  function flintPost(what) {
    const t = String(what || '').replace(/^[:\-–\s]+/, '').trim();
    const title = t.length > 2 ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    post({ title });
    return title ? `Here's your gig, filled in with "${title}". Add what you deliver and post it.` : 'Here’s the gig form. Say what you can do and post it.';
  }
  function flintFind(skill) {
    const q = String(skill || '').trim();
    if (!on()) return 'Find people needs a tribe. Start one or join with a link first.';
    if (window.TribeTalent && window.TribeTalent.find) window.TribeTalent.find(q);
    return q ? `Here are people who can ${q}. Tap one to see their profile.` : 'Here’s Find people. Type a skill to narrow it.';
  }

  if (C && C.on) { C.on('hello', () => setTimeout(sync, 400)); C.on('ws', m => { if (m && m.type === 'talent') { cache.at = 0; if (mountEl && mountEl.isConnected) { clearTimeout(mount.t); mount.t = setTimeout(() => mount(mountEl), 250); } if (offersEl && offersEl.isConnected) { clearTimeout(mountOffers.t); mountOffers.t = setTimeout(() => mountOffers(offersEl), 250); } } }); }
  if (on()) setTimeout(sync, 800);
  window.TribeAbilities = { edit, post, profile, mount, mountOffers, offerCard, request, answer, local, sync, flintPost, flintFind, close };
})();
