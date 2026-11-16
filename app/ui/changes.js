// How changes work here, in every creator tool (feat/cowork-editors, server/changereq.js).
//   A strip at the top of the website designer, App Creator, Motion Studio, the Launch kit and Share a clip says it in one
//   line from the group's own style: "Your changes go to Ana for OK". Someone who can change the tool directly sees no
//   strip (p4), until changes wait for their OK: "2 changes are waiting for your OK · Look at them". Someone who can't
//   change it keeps editing as a draft, then presses "Suggest this change": the draft goes to the right people as a
//   request, with before and after pictures where the tool can draw them. They answer it in the inbox (Approve,
//   Request changes, Deny, a comment); an approved change is applied as one step and Undo puts the earlier version back.
//   "My requests" lists what you asked for and what waits for you.
// Public: window.TribeChanges = { how(pid?, fresh?), line(tool), strip(el, tool, opts), suggest(tool, opts), sheet(pid?),
//   preview(el, id, pid), undo(id, pid), mine(pid?) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const tt = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const icon = (n, s = 16) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, s) : '');
  const live = () => !!(C && C.connected && C.connected() && (!C.hasToken || C.hasToken()));
  const projectId = () => (C && C.project ? C.project() : '') || '';
  const TOOL = { site: 'the website', app: 'the phone app', motion: 'this motion graphic', launch: 'the store page', publish: 'publishing' };
  let HOW = {}, howAt = 0, howPid = '';
  const strips = new Set();   // { el, tool, opts }

  async function how(pid, fresh) {
    pid = pid || projectId(); if (!pid || !live()) return {};
    if (!fresh && pid === howPid && Date.now() - howAt < 15000) return HOW;
    try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/changes/how`); HOW = r.how || {}; howAt = Date.now(); howPid = pid; } catch { /* keep what we had */ }
    return HOW;
  }
  // the one line, built here from the parts so every language gets whole sentences (the server's own line is English)
  function lineOf(h) {
    if (!h) return '';
    const who = (h.who || []), names = who.slice(0, 2).join(` ${T('or')} `) + (who.length > 2 ? ` +${who.length - 2}` : '');
    if (h.watch) return T('You can look. People who only watch can’t change this.');
    if (h.can) return T('You can change this directly.');
    if (!who.length) return T('Nobody here can approve changes to this yet. Ask the computer’s owner.');
    if (h.rule === 'council') return tt('Your changes go to the council for OK ({mark} of {n}).', { mark: h.mark, n: h.of });
    if (h.rule === 'all') return T('Your changes need everyone’s OK.');
    return tt('Your changes go to {who} for OK.', { who: names });
  }
  const line = tool => lineOf(HOW[tool]);
  const can = tool => !HOW[tool] || HOW[tool].can !== false;

  // ---------- the strip ----------
  // opts = { pid?, draft(): payload, key?(), dirty?(): bool, before?(): dataURL, after?(): dataURL, summary?(): [lines], title?(), onSent?(r) }
  function strip(el, tool, opts = {}) {
    if (!el) return null;
    const s = { el, tool, opts }; strips.add(s);
    const draw = () => {
      if (!el.isConnected) { strips.delete(s); return; }
      const pid = opts.pid || projectId();
      if (!pid || !live()) { el.hidden = true; el.innerHTML = ''; return; }
      const h = HOW[tool];
      if (!h) { el.hidden = true; return; }
      // p4: someone who can change this directly gets no strip (it said the obvious all day). It comes back only when
      // changes are waiting for their OK. People whose changes need an OK, and people who only watch, always see it.
      if (h.can) {
        const n = WAIT.pid === pid ? WAIT.n : 0;
        el.className = 'cr-strip is-direct';
        if (!n) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.innerHTML = `<span class="cr-i">${icon('inbox', 14)}</span><span class="cr-line cr-wait">${esc(n === 1 ? T('1 change is waiting for your OK.') : tt('{n} changes are waiting for your OK.', { n }))}</span><button type="button" class="btn sm" data-cr-mine>${esc(T('Look at them'))}</button>`;
        el.querySelector('[data-cr-mine]').onclick = () => sheet(pid);
        return;
      }
      el.hidden = false; el.className = 'cr-strip' + (h.watch ? ' is-watch' : ' is-ask');
      const btn = !h.can && !h.watch && h.who && h.who.length ? `<button type="button" class="btn sm primary" data-cr-suggest${opts.dirty && !opts.dirty() ? ' disabled' : ''}>${esc(T(tool === 'publish' ? 'Ask to publish' : 'Suggest this change'))}</button>` : '';
      el.innerHTML = `<span class="cr-i">${icon(h.can ? 'check' : h.watch ? 'eye' : 'users', 14)}</span><span class="cr-line">${esc(lineOf(h))}</span>${btn}<button type="button" class="linkish cr-mine" data-cr-mine>${esc(T('Requests'))}</button>`;
      const b = el.querySelector('[data-cr-suggest]'); if (b) b.onclick = () => suggest(tool, { ...opts, pid });
      el.querySelector('[data-cr-mine]').onclick = () => sheet(pid);
    };
    s.draw = draw;
    how(opts.pid).then(() => { draw(); waiting(opts.pid).then(draw); }); draw();
    return { refresh: () => how(opts.pid, true).then(draw), draw, can: () => can(tool) };
  }
  const redraw = () => strips.forEach(s => s.draw && s.draw());
  // how many suggested changes wait for this person's OK in this project
  const WAIT = { pid: '', n: 0 };
  async function waiting(pid) { pid = pid || projectId(); if (!pid || !live()) return 0; try { const l = await mine(pid); WAIT.pid = pid; WAIT.n = l.filter(x => x.canDecide).length; } catch {} return WAIT.n; }

  // ---------- suggesting ----------
  async function suggest(tool, opts = {}) {
    const pid = opts.pid || projectId(); if (!pid) return null;
    const h = HOW[tool] || (await how(pid))[tool] || {};
    const who = (h.who || []).slice(0, 3).join(', ');
    const sh = window.TribeUI && window.TribeUI.sheet ? window.TribeUI.sheet({ id: 'cr-sheet', eyebrow: T('Suggest a change'), title: tt('Send this change to {who}', { who: who || T('the people who decide') }),
      body: `<p class="cr-help">${esc(T(h.rule === 'council' ? 'The council decides changes here. Nothing changes until enough of them say yes.' : 'Nothing changes until they say yes. They see what you changed, and can approve, ask for changes or say no.'))}</p>
        <div class="cr-pics" id="cr-pics"></div><ul class="cr-sum" id="cr-sum"></ul>
        <label class="cr-lab" for="cr-why">${esc(T('Why (optional)'))}</label><textarea class="input" id="cr-why" rows="3" maxlength="600" placeholder="${esc(T('What this fixes or adds'))}"></textarea>`,
      foot: `<button type="button" class="btn" id="cr-cancel">${esc(T('Cancel'))}</button><button type="button" class="btn primary" id="cr-send">${esc(T('Send for OK'))}</button>` }) : null;
    const q = s => sh && sh.el ? sh.el.querySelector(s) || document.querySelector(s) : document.querySelector(s);
    let before = null, after = null, summary = [];
    try { before = opts.before ? await opts.before() : null; } catch {}
    try { after = opts.after ? await opts.after() : null; } catch {}
    try { summary = opts.summary ? (await opts.summary()) || [] : []; } catch {}
    const pics = q('#cr-pics'); if (pics) pics.innerHTML = (before || after) ? `${before ? `<figure><img src="${esc(before)}" alt=""><figcaption>${esc(T('Before'))}</figcaption></figure>` : ''}${after ? `<figure><img src="${esc(after)}" alt=""><figcaption>${esc(T('After'))}</figcaption></figure>` : ''}` : '';
    const sum = q('#cr-sum'); if (sum) sum.innerHTML = summary.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('');
    const go = async why => {
      const body = { tool, payload: opts.draft ? opts.draft() : null, key: opts.key ? opts.key() : undefined, why, summary, before, after, title: opts.title ? opts.title() : undefined };
      try {
        const r = await C.api(`/projects/${encodeURIComponent(pid)}/changes`, { method: 'POST', body });
        if (r.applied) toast(T('Saved. You can change this directly.'));
        else if (r.request) toast(tt('Sent to {who} for OK. You’ll hear back in the inbox.', { who: (r.request.to || []).slice(0, 3).join(', ') || T('the people who decide') }));
        if (opts.onSent) opts.onSent(r);
        return r;
      } catch (e) { toast(e.message || String(e)); return null; }
    };
    if (!sh) return go('');
    return new Promise(res => {
      const send = q('#cr-send'), cancel = q('#cr-cancel');
      if (cancel) cancel.onclick = () => { sh.close(); res(null); };
      if (send) send.onclick = async () => { send.disabled = true; const r = await go((q('#cr-why') || {}).value || ''); if (r) sh.close(); else send.disabled = false; res(r); };
    });
  }

  // ---------- the list: mine and waiting for me ----------
  async function mine(pid) { pid = pid || projectId(); if (!pid || !live()) return []; try { return (await C.api(`/projects/${encodeURIComponent(pid)}/changes`)).requests || []; } catch { return []; } }
  const STATUS = { open: 'Waiting', applied: 'Approved', denied: 'Not approved', withdrawn: 'Taken back', failed: 'Could not apply' };
  function rowHtml(x) {
    const who = x.agentName ? tt('{helper} for {name}', { helper: x.agentName, name: x.byName }) : x.byName;
    const st = x.undone ? T('Undone') : T(STATUS[x.status] || x.status);
    const acts = [
      x.canDecide ? `<button type="button" class="btn sm" data-cr-act="deny" data-ap="${esc(x.approval)}">${esc(T('Deny'))}</button><button type="button" class="btn sm" data-cr-act="changes" data-ap="${esc(x.approval)}">${esc(T('Request changes'))}</button><button type="button" class="btn sm primary" data-cr-act="approve" data-ap="${esc(x.approval)}">${esc(T('Approve'))}</button>` : '',
      x.canUndo ? `<button type="button" class="btn sm" data-cr-act="undo" data-id="${esc(x.id)}">${esc(T('Undo'))}</button>` : '',
      x.mine && x.status === 'open' ? `<button type="button" class="linkish" data-cr-act="withdraw" data-id="${esc(x.id)}">${esc(T('Take back'))}</button>` : '',
    ].join('');
    return `<article class="cr-row" data-cr="${esc(x.id)}"><div class="cr-row-h"><b>${esc(x.title)}</b><span class="cr-st is-${esc(x.status)}">${esc(st)}</span></div>
      <div class="cr-row-m">${esc(who)} · ${esc(T(TOOL[x.tool] || x.tool))}${x.status === 'open' && x.to && x.to.length ? ` · ${esc(tt('waiting on {who}', { who: x.to.slice(0, 3).join(', ') }))}` : ''}${x.tally ? ` · ${esc(tt('{yes} of {needed} yes', x.tally))}` : ''}${x.decidedByName ? ` · ${esc(x.decidedByName)}` : ''}</div>
      ${x.why ? `<p class="cr-why">${esc(x.why)}</p>` : ''}${x.hasPictures || (x.summary && x.summary.length) ? `<div class="cr-prev" data-cr-prev="${esc(x.id)}"></div>` : ''}
      ${(x.questions || []).map(q => `<div class="cr-q"><b>${esc(q.name)}</b> ${esc(q.text)}</div>`).join('')}
      ${x.canDecide ? `<input class="input cr-note" data-cr-note="${esc(x.approval)}" maxlength="500" placeholder="${esc(T('A comment, or what to change'))}">` : ''}
      <div class="cr-acts">${acts}</div></article>`;
  }
  async function preview(el, id, pid) {
    if (!el || el.dataset.done) return; el.dataset.done = '1';
    try {
      const { request: x } = await C.api(`/projects/${encodeURIComponent(pid || projectId())}/changes/${encodeURIComponent(id)}`);
      // pass 4: no pictures came with it (an AI helper's proposal): draw the app before and after right here
      const AC = window.TribeAppCreator; let drawn = '';
      if (!x.before && !x.after && x.draw && x.draw.after && AC && AC.mini) { try { const bf = x.draw.before, af = x.draw.after, sc = (af.screens || []).find(s2 => { const o = ((bf && bf.screens) || []).find(y => y.id === s2.id); return !o || JSON.stringify(o) !== JSON.stringify(s2); }), sid = sc ? sc.id : af.start, has = bf && (bf.screens || []).some(y => y.id === sid); drawn = `<div class="cr-pics cr-draw">${bf ? `<figure>${AC.mini(bf, has ? sid : undefined, 132)}<figcaption>${esc(T('Before'))}</figcaption></figure>` : ''}<figure>${AC.mini(af, sid, 132)}<figcaption>${esc(T('After'))}</figcaption></figure></div>`; } catch {} }
      el.innerHTML = `${drawn}${x.before || x.after ? `<div class="cr-pics">${x.before ? `<figure><img src="${esc(x.before)}" alt=""><figcaption>${esc(T('Before'))}</figcaption></figure>` : ''}${x.after ? `<figure><img src="${esc(x.after)}" alt=""><figcaption>${esc(T('After'))}</figcaption></figure>` : ''}</div>` : ''}${(x.summary || []).length ? `<ul class="cr-sum">${x.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}`;
    } catch { el.textContent = ''; }
  }
  async function act(b, pid, after) {
    const a = b.dataset.crAct; b.disabled = true;
    try {
      if (a === 'approve' || a === 'deny') { const n = document.querySelector(`[data-cr-note="${CSS.escape(b.dataset.ap)}"]`); await C.api(`/approvals/${encodeURIComponent(b.dataset.ap)}/${a}`, { method: 'POST', body: { note: n ? n.value.trim() : '' } }); toast(T(a === 'approve' ? 'Approved. The change is in; Undo takes it back.' : 'Said no. They hear it with your comment.')); }
      else if (a === 'changes') {
        const n = document.querySelector(`[data-cr-note="${CSS.escape(b.dataset.ap)}"]`);
        if (!n || !n.value.trim()) { if (n) { n.focus(); n.placeholder = T('Say what to change, then press Request changes'); } b.disabled = false; return; }
        await C.api(`/approvals/${encodeURIComponent(b.dataset.ap)}/question`, { method: 'POST', body: { text: n.value.trim() } }); toast(T('Sent. They can change it and suggest it again.'));
      } else if (a === 'undo') { await undo(b.dataset.id, pid); }
      else if (a === 'withdraw') { await C.api(`/projects/${encodeURIComponent(pid)}/changes/${encodeURIComponent(b.dataset.id)}/withdraw`, { method: 'POST', body: {} }); toast(T('Taken back.')); }
    } catch (e) { toast(e.message || String(e)); b.disabled = false; return; }
    if (after) after();
  }
  async function undo(id, pid) {
    pid = pid || projectId();
    await C.api(`/projects/${encodeURIComponent(pid)}/changes/${encodeURIComponent(id)}/undo`, { method: 'POST', body: {} });
    toast(T('Undone. The earlier version is back.'));
  }
  let open = null;
  async function sheet(pid) {
    pid = pid || projectId(); if (!pid || !window.TribeUI || !window.TribeUI.sheet) return null;
    if (open) open.close();
    open = window.TribeUI.sheet({ id: 'cr-list', eyebrow: T('Changes'), title: T('Suggested changes'), body: '<div class="cr-list" id="cr-list-body"></div>', onClose: () => { open = null; } });
    const fill = async () => {
      const box = document.getElementById('cr-list-body'); if (!box) return;
      const l = await mine(pid), wait = l.filter(x => x.canDecide), mineL = l.filter(x => x.mine && !x.canDecide), rest = l.filter(x => !x.canDecide && !x.mine);
      const sec = (t, xs) => (xs.length ? `<h4 class="cr-h">${esc(T(t))}</h4>${xs.map(rowHtml).join('')}` : '');
      box.innerHTML = l.length ? sec('Waiting for you', wait) + sec('Yours', mineL) + sec('Everyone else’s', rest) : `<p class="cr-empty">${esc(T('No suggested changes yet. Someone who can’t change a tool directly sends a suggestion from its top strip, and it shows up here.'))}</p>`;
      box.querySelectorAll('[data-cr-prev]').forEach(el => preview(el, el.dataset.crPrev, pid));
      box.querySelectorAll('[data-cr-act]').forEach(b => b.onclick = () => act(b, pid, fill));
    };
    await fill();
    return open;
  }

  // stay current: a new request, an answer, a new style or role table
  if (C && C.on) {
    C.on('ws', m => {
      if (!m) return;
      if (m.type === 'change' || m.type === 'groupstyle' || m.type === 'perms') { how(null, true).then(redraw).then(() => waiting()).then(redraw); if (open && m.type === 'change') { const b = document.getElementById('cr-list-body'); if (b) sheet(); } }
    });
    C.on('project', () => { howAt = 0; how(null, true).then(redraw); });
    C.on('hello', () => { howAt = 0; how(null, true).then(redraw); });
  }
  // A small "Suggested changes" button for a tool's top bar or menu: the way to the requests list for someone who can
  // change the tool directly and so sees no strip. It hides with no tribe project, and shows a count when changes wait.
  // entry(btn, pid) wires an existing button (it may hold a [data-cr-n] badge); entryHTML(cls) is an icon button to place.
  const entryHTML = (cls = 'btn sm ghost') => `<button type="button" class="${cls} cr-entry" data-cr-entry hidden aria-label="${esc(T('Suggested changes'))}" title="${esc(T('Suggested changes'))}">${icon('inbox', 16)}<span class="cr-n" data-cr-n hidden></span></button>`;
  function entry(btn, pid) {
    if (!btn) return null;
    const p = () => pid || projectId();
    const draw = async () => { if (!btn.isConnected) return; const ok = !!(p() && live()); btn.hidden = !ok; if (!ok) return; const n = await waiting(p()), b = btn.querySelector('[data-cr-n]'); if (b) { b.hidden = !n; b.textContent = n || ''; } };
    btn.addEventListener('click', e => { e.preventDefault(); sheet(p()); });
    draw(); return { draw };
  }
  window.TribeChanges = { how, line, can, strip, suggest, sheet, preview, undo, mine, waiting, entry, entryHTML };
})();
