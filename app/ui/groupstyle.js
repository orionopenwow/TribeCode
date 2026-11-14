// How this group decides (feat/group-styles, server/groupstyle.js). One sheet, reachable from Company, People and
// Settings: the style (one lead, a council, open, our own roles), the group's own words, roles the group made, and a
// plain "Who can do what here" list drawn from the live table. When the server refuses something it says who CAN do
// it; a small bar then offers "Ask them" (a request in the chat that the right people answer with one tap).
// Public: window.TribeGroupStyle = { open(), load(), view(), words(), leadName(), ask(cap, note) }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const icon = (n, s = 16) => (window.TribeIcons && window.TribeIcons.svg && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s) : '');
  const DEF = { group: 'Company', lead: 'Lead', role: 'Role', checkin: 'Check-in' };
  const COLORS = ['#F26B1D', '#38C6B1', '#6C7CFF', '#3BD16F', '#FF6F8E', '#FFB86B'];
  const NEED_T = { majority: 'More than half', two: 'Any two', all: 'Everyone' };
  const names = l => { l = (l || []).map(p => p.name || p); return l.length > 3 ? `${l.slice(0, 3).join(', ')} +${l.length - 3}` : l.join(', '); };
  let V = null, sheet = null, D = null, openRole = null;

  // ---------- state ----------
  async function load() {
    if (!C || !C.hasToken || !C.hasToken()) return null;
    try { V = await C.api('/groupstyle'); } catch { return V; }
    if (window.TribeI18n && window.TribeI18n.words) window.TribeI18n.words(V.words);
    window.dispatchEvent(new CustomEvent('tribe-groupstyle', { detail: V }));
    return V;
  }
  const words = () => (V && V.words) || DEF;
  // What the lead role is called here: the group's word, or "Council" when there is no single lead.
  const leadName = () => (V && V.style === 'council' ? 'Council' : words().lead || 'Lead');
  const draft = () => ({ style: V.style, words: { ...V.words }, council: { members: (V.council.members || []).slice(), need: V.council.need, hours: V.council.hours, tie: V.council.tie },
    aiVotes: V.aiVotes, rules: { ...V.rules }, roles: V.roles.map(r => ({ ...r, caps: r.caps.slice(), members: r.members.slice() })) });
  const dirty = () => JSON.stringify(D) !== JSON.stringify(draft());

  // ---------- the sheet ----------
  function styleHtml() {
    const opts = V.styles.map(s => `<button type="button" class="gs-opt${D.style === s.id ? ' on' : ''}" role="radio" aria-checked="${D.style === s.id}" data-style="${esc(s.id)}"><b>${esc(s.name)}</b><small>${esc(s.line)}</small></button>`).join('');
    let more = '';
    if (D.style === 'council') {
      const on = new Set(D.council.members.length ? D.council.members : V.people.map(p => p.id));
      more = `<div class="gs-more" id="gs-council"><span class="gs-fl">Who is on the council</span>
        <div class="gs-checks">${V.people.map(p => `<label class="gs-ck"><input type="checkbox" data-cm="${esc(p.id)}" ${on.has(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</div>
        <div class="gs-row"><label class="gs-f"><span class="gs-fl">How many must agree</span><select class="input" id="gs-need">${Object.entries(NEED_T).map(([k, t]) => `<option value="${k}"${D.council.need === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="gs-f"><span class="gs-fl">Time to decide</span><select class="input" id="gs-hours">${[[24, 'One day'], [48, 'Two days'], [168, 'One week']].map(([h, t]) => `<option value="${h}"${Number(D.council.hours) === h ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="gs-f"><span class="gs-fl">If time runs out</span><select class="input" id="gs-tie"><option value="fails"${D.council.tie === 'fails' ? ' selected' : ''}>It does not pass</option><option value="more-yes"${D.council.tie === 'more-yes' ? ' selected' : ''}>More yes than no is enough</option></select></label></div>
        <p class="gs-note">With a council, nobody decides the big things alone: publishing, sending work to the main copy, spending, roles and settings.</p></div>`;
    }
    if (D.style === 'open') more = '<p class="gs-note">Anyone building can publish, send work to the main copy and change settings. Deleting, removing someone and changing roles need a second person to agree.</p>';
    if (D.style === 'custom') more = '<p class="gs-note">Make roles below and tick what each one looks after. In the list at the bottom, pick how each thing is decided.</p>';
    if (D.style === 'lead') more = `<label class="gs-f gs-leadw"><span class="gs-fl">What do you call the lead?</span><input class="input" id="gs-w-lead2" maxlength="24" list="gs-dl-lead" value="${esc(D.words.lead)}" placeholder="Lead"></label>`;
    return `<section class="gs-sec" aria-labelledby="gs-h-style"><span class="eyebrow">How we decide</span><h4 id="gs-h-style">Who has the final say?</h4>
      <div class="gs-opts" role="radiogroup" aria-labelledby="gs-h-style">${opts}</div>${more}</section>`;
  }
  function wordsHtml() {
    const f = (k, label) => `<label class="gs-f"><span class="gs-fl">${label}</span><input class="input" data-word="${k}" maxlength="24" list="gs-dl-${k}" value="${esc(D.words[k])}" placeholder="${esc(DEF[k])}">
      <datalist id="gs-dl-${k}">${(V.wordChoices[k] || []).map(w => `<option value="${esc(w)}"></option>`).join('')}</datalist></label>`;
    return `<section class="gs-sec" aria-labelledby="gs-h-words"><span class="eyebrow">Our words</span><h4 id="gs-h-words">What do you call things here?</h4>
      <div class="gs-row">${f('group', 'The group')}${f('lead', 'The lead')}${f('role', 'A role')}${f('checkin', 'A check-in')}</div>
      <p class="gs-note">The app and Flint use your words everywhere.</p></section>`;
  }
  function rolesHtml() {
    const list = D.roles.map((r, i) => {
      const open = openRole === i, who = V.people.filter(p => r.members.includes(p.id));
      const form = !open ? '' : `<div class="gs-role-f">
        <div class="gs-row"><label class="gs-f"><span class="gs-fl">Name</span><input class="input" data-rname="${i}" maxlength="40" value="${esc(r.name)}"></label>
        <label class="gs-f gs-grow"><span class="gs-fl">What it is for</span><input class="input" data-rpurpose="${i}" maxlength="160" value="${esc(r.purpose)}" placeholder="One line"></label></div>
        <div class="gs-swatches" role="radiogroup" aria-label="Colour">${COLORS.map(c => `<button type="button" class="gs-sw${r.color.toLowerCase() === c.toLowerCase() ? ' on' : ''}" role="radio" aria-checked="${r.color.toLowerCase() === c.toLowerCase()}" data-rcolor="${i}" data-c="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}</div>
        <span class="gs-fl">Looks after</span><div class="gs-checks col">${V.caps.map(c => `<label class="gs-ck"><input type="checkbox" data-rcap="${i}" value="${esc(c.id)}" ${r.caps.includes(c.id) ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}</div>
        <span class="gs-fl">Who has this role</span><div class="gs-checks">${V.people.map(p => `<label class="gs-ck"><input type="checkbox" data-rmem="${i}" value="${esc(p.id)}" ${r.members.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</div>
        <p class="gs-note">Things only the computer’s owner can do are never part of a role. AI helpers follow their owner.</p>
        <button type="button" class="linkish gs-danger" data-rdel="${i}">Remove this role</button></div>`;
      return `<li class="gs-role${open ? ' open' : ''}" style="--sw:${esc(r.color)}"><button type="button" class="gs-role-h" data-ropen="${i}" aria-expanded="${open}"><span class="gs-dot" aria-hidden="true"></span><span class="gs-role-t"><b>${esc(r.name)}</b><small>${esc(r.purpose || `${r.caps.length} ${r.caps.length === 1 ? 'thing' : 'things'}`)}${who.length ? ` · ${esc(names(who))}` : ''}</small></span>${icon('chev', 16)}</button>${form}</li>`;
    }).join('');
    return `<section class="gs-sec" aria-labelledby="gs-h-roles"><span class="eyebrow">Roles you made</span><h4 id="gs-h-roles">Your own roles</h4>
      ${D.roles.length ? `<ul class="gs-roles">${list}</ul>` : '<p class="gs-note" id="gs-noroles">None yet. A role has a name, a purpose and the things it looks after.</p>'}
      ${D.roles.length < 24 ? `<button type="button" class="btn sm" id="gs-addrole">${icon('plus', 14)}Add a role</button>` : ''}</section>`;
  }
  function whoHtml() {
    const rows = V.who.rows.map(r => {
      const custom = D.style === 'custom' && !r.locked;
      const rule = custom ? `<select class="input sm gs-rule" data-rule="${esc(r.id)}" aria-label="How it is decided">${V.ruleChoices.map(x => `<option value="${x.id}"${(D.rules[r.id] || 'one') === x.id ? ' selected' : ''}>${esc(x.text)}</option>`).join('')}</select>` : `<span class="gs-rt">${esc(r.ruleText)}</span>`;
      const ppl = r.people.length ? esc(names(r.people)) : 'Nobody yet';
      return `<li class="gs-w${r.me ? ' me' : ''}${r.locked ? ' locked' : ''}" data-cap="${esc(r.id)}"><div class="gs-w-t"><b>${esc(r.label)}</b><small>${ppl}</small></div>${rule}
        ${r.me ? `<span class="gs-you">${icon('check', 14)}You can</span>` : r.locked ? '' : `<button type="button" class="btn sm" data-ask="${esc(r.id)}">Ask</button>`}</li>`;
    }).join('');
    const every = V.who.everyone.map(r => `<li class="gs-w me"><div class="gs-w-t"><b>${esc(r.label)}</b><small>${esc(r.ruleText)}</small></div></li>`).join('');
    const passes = V.permits.length ? `<p class="gs-note" id="gs-passes">${V.permits.map(p => `They said yes: you can ${esc(p.label.charAt(0).toLowerCase() + p.label.slice(1))} until ${esc(new Date(p.until).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}.`).join(' ')}</p>` : '';
    return `<section class="gs-sec" aria-labelledby="gs-h-who"><span class="eyebrow">Right now</span><h4 id="gs-h-who">Who can do what here</h4>${passes}
      <ul class="gs-who" id="gs-who">${rows}${every}</ul>
      <label class="gs-ck gs-ai"><input type="checkbox" id="gs-ai" ${D.aiVotes ? 'checked' : ''}><span>AI helpers may vote on small, safe things <small>Off: only people vote. A helper’s vote counts as its owner’s one vote.</small></span></label></section>`;
  }
  function footHtml() {
    const ch = dirty();
    return `${V.can.reset && !V.isDefault ? '<button type="button" class="linkish" id="gs-reset">Back to one lead</button>' : ''}<span class="gs-sp"></span>
      <button type="button" class="btn" id="gs-close">${ch ? 'Cancel' : 'Done'}</button>
      ${ch ? `<button type="button" class="btn primary" id="gs-save">${V.can.decide ? 'Save' : 'Put it to a vote'}</button>` : ''}`;
  }
  function draw() {
    if (!sheet) return;
    const top = sheet.body.scrollTop;
    sheet.body.innerHTML = `<div class="gs" id="gs">${styleHtml()}${rolesHtml()}${wordsHtml()}${whoHtml()}</div>`;
    sheet.foot.innerHTML = footHtml(); sheet.foot.hidden = false;
    sheet.body.scrollTop = top;
    wire();
  }
  const foot = () => { if (sheet) { sheet.foot.innerHTML = footHtml(); wireFoot(); } };
  function wire() {
    const b = sheet.body, q = s => b.querySelector(s), all = s => b.querySelectorAll(s);
    all('[data-style]').forEach(x => x.onclick = () => { D.style = x.dataset.style; draw(); });
    all('[data-cm]').forEach(x => x.onchange = () => { D.council.members = [...all('[data-cm]')].filter(i => i.checked).map(i => i.dataset.cm); foot(); });
    const sel = (id, fn) => { const el = q(id); if (el) el.onchange = () => { fn(el.value); foot(); }; };
    sel('#gs-need', v => { D.council.need = v; }); sel('#gs-hours', v => { D.council.hours = Number(v); }); sel('#gs-tie', v => { D.council.tie = v; });
    const lw = q('#gs-w-lead2'); if (lw) lw.oninput = () => { D.words.lead = lw.value.trim() || DEF.lead; const o = q('[data-word="lead"]'); if (o) o.value = lw.value; foot(); };
    all('[data-word]').forEach(x => x.oninput = () => { D.words[x.dataset.word] = x.value.trim() || DEF[x.dataset.word]; if (x.dataset.word === 'lead' && lw) lw.value = x.value; foot(); });
    all('[data-ropen]').forEach(x => x.onclick = () => { const i = Number(x.dataset.ropen); openRole = openRole === i ? null : i; draw(); });
    const add = q('#gs-addrole'); if (add) add.onclick = () => { D.roles.push({ id: '', name: 'New role', color: COLORS[D.roles.length % COLORS.length], purpose: '', caps: [], members: [] }); openRole = D.roles.length - 1; draw(); const n = sheet.body.querySelector(`[data-rname="${openRole}"]`); if (n) { n.focus(); n.select(); } };
    all('[data-rname]').forEach(x => x.oninput = () => { D.roles[x.dataset.rname].name = x.value.trim() || 'New role'; foot(); });
    all('[data-rpurpose]').forEach(x => x.oninput = () => { D.roles[x.dataset.rpurpose].purpose = x.value.trim(); foot(); });
    all('[data-rcolor]').forEach(x => x.onclick = () => { D.roles[x.dataset.rcolor].color = x.dataset.c; draw(); });
    all('[data-rcap]').forEach(x => x.onchange = () => { const r = D.roles[x.dataset.rcap]; r.caps = [...all(`[data-rcap="${x.dataset.rcap}"]`)].filter(i => i.checked).map(i => i.value); foot(); });
    all('[data-rmem]').forEach(x => x.onchange = () => { const r = D.roles[x.dataset.rmem]; r.members = [...all(`[data-rmem="${x.dataset.rmem}"]`)].filter(i => i.checked).map(i => i.value); foot(); });
    all('[data-rdel]').forEach(x => x.onclick = () => { D.roles.splice(Number(x.dataset.rdel), 1); openRole = null; draw(); });
    all('[data-rule]').forEach(x => x.onchange = () => { D.rules[x.dataset.rule] = x.value; foot(); });
    const ai = q('#gs-ai'); if (ai) ai.onchange = () => { D.aiVotes = ai.checked; foot(); };
    all('[data-ask]').forEach(x => x.onclick = () => ask(x.dataset.ask, '', x));
    wireFoot();
  }
  function wireFoot() {
    const f = sheet.foot, q = s => f.querySelector(s);
    const c = q('#gs-close'); if (c) c.onclick = () => sheet.close();
    const s = q('#gs-save'); if (s) s.onclick = () => save(s);
    const r = q('#gs-reset'); if (r) r.onclick = async () => { try { V = await C.api('/groupstyle/reset', { method: 'POST', body: {} }); after('Back to one lead.'); } catch (e) { toast(e.message); } };
  }
  function after(msg) {
    if (window.TribeI18n && window.TribeI18n.words) window.TribeI18n.words(V.words);
    window.dispatchEvent(new CustomEvent('tribe-groupstyle', { detail: V }));
    D = draft(); draw(); if (msg) toast(msg);
  }
  async function save(btn) {
    btn.disabled = true; btn.classList.add('busy');
    try {
      if (V.can.decide) { V = await C.api('/groupstyle', { method: 'PUT', body: D }); after('Saved.'); }
      else { const r = await C.api('/groupstyle/ask', { method: 'POST', body: { change: D } }); D = draft(); draw(); toast(`Put to a vote. ${names(r.deciders)} can answer in the chat.`); }
    } catch (e) { btn.disabled = false; btn.classList.remove('busy'); toast(e.message); }
  }
  async function open() {
    if (sheet) return sheet;
    await load();
    if (!V) { toast('Could not load this right now.'); return null; }
    D = draft(); openRole = null;
    sheet = window.TribeUI.sheet({ kind: 'steps', wide: true, id: 'gs-sheet', eyebrow: 'This group', title: 'How we decide and who can do what', body: '<div class="gs"></div>', foot: ' ', onClose: () => { sheet = null; } });
    draw();
    return sheet;
  }

  // ---------- Ask them ----------
  async function ask(cap, note, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await C.api('/groupstyle/ask', { method: 'POST', body: { cap, note: note || '' } });
      toast(`Asked. ${names(r.deciders)} can answer in the chat.`);
      if (btn) btn.textContent = 'Asked';
      return r;
    } catch (e) { if (btn) btn.disabled = false; toast(e.message); return null; }
  }
  // The server refused and said who can do it: a small bar, never a pop-up in the way.
  let barTimer = 0;
  function bar(need) {
    if (!need || !need.label) return;
    let el = document.getElementById('gs-askbar'); if (el) el.remove();
    el = document.createElement('div'); el.id = 'gs-askbar'; el.className = 'gs-askbar'; el.setAttribute('role', 'status');
    const who = names(need.who);
    const line = need.locked ? `Only the computer’s owner${who ? ` (${who})` : ''} can do this.` : need.rule === 'council' ? `The council decides this here${who ? `: ${who}` : ''}.` : need.rule === 'all' ? 'Everyone decides this together here.' : who ? `${who} can do this here.` : 'Nobody here can do this yet.';
    el.innerHTML = `<span class="gs-askbar-t"><b>${esc(need.label)}</b><small>${esc(line)}</small></span>${need.ask ? '<button type="button" class="btn sm primary" id="gs-askbar-go">Ask them</button>' : ''}<button type="button" class="gs-askbar-x" aria-label="Close">${icon('x', 14) || '×'}</button>`;
    document.body.appendChild(el);
    const done = () => { clearTimeout(barTimer); el.remove(); };
    el.querySelector('.gs-askbar-x').onclick = done;
    const go = el.querySelector('#gs-askbar-go'); if (go) go.onclick = async () => { const r = await ask(need.cap, '', go); if (r) done(); };
    clearTimeout(barTimer); barTimer = setTimeout(done, 12000);
  }
  addEventListener('tribe-403', e => bar(e && e.detail && e.detail.need));

  if (C && C.on) {
    C.on('hello', () => load());
    C.on('project', () => load());
    C.on('ws', m => { if (m && m.type === 'groupstyle') load().then(() => { if (sheet && !dirty()) { D = draft(); draw(); } }); });
  }
  load();
  window.TribeGroupStyle = { open, load, view: () => V, words, leadName, ask };
})();
