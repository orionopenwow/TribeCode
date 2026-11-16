// The website designer's Suggestions (feat/site-editor2): changes to the site drawn from what the tribe already said in
// chat, tasks, docs, updates, Board decisions and comments on the site. The tribe is the context for every part of the
// design: each suggestion shows what would change (before and after), who said it and where, and one tap applies it as
// a normal edit (one Undo). Someone who cannot change the site asks instead (a comment on that section, which the
// builders see and can turn into a task). Each element also shows what was said about it and what was applied to it.
// The matching is app/ui/sitesuggest-core.js (no AI); the host gathers only what the member may read
// (server/sitesuggest.js). A project that lives on this device uses its own comments.
//   window.TribeSiteSuggest = { paint(box, api), click(el, api), said(box, api), flint(mode, api) -> Promise<sentence>, refresh(api), count() }
(function () {
  'use strict';
  const S = () => window.TribeSiteCfg, CORE = () => window.TribeSiteSuggestCore, C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let data = null, forPid = null, loading = null, later = new Set(), told = false;
  const WHERE = { chat: 'in chat', task: 'in a task', doc: 'in a doc', update: 'in an update', decision: 'in a decision', proposal: 'in a proposal', comment: 'in a comment on the site' };
  const ago = iso => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : s < 86400 * 14 ? `${Math.round(s / 86400)} days ago` : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const srcLine = (s, open) => `<p class="sg-src"><b>${esc(s.who || 'Someone')}</b> ${esc(WHERE[s.kind] || '')}${s.decided ? ' · decided' : ''}${s.at && ago(s.at) ? ` · ${esc(ago(s.at))}` : ''}: <q>${esc(s.text)}</q>${open && s.link ? ` <button type="button" data-sg="open" data-link="${esc(s.link)}">Open it</button>` : ''}</p>`;

  async function load(api, force) {
    const pid = api.pid() || '';
    if (data && forPid === pid && !force) return data;
    if (loading && forPid === pid) return loading;
    forPid = pid;
    loading = (async () => {
      let d = null;
      if (pid && api.connected()) { try { d = await C.api(`/projects/${encodeURIComponent(pid)}/site-suggestions`); } catch (e) { d = { suggestions: [], sources: [], history: [], canEdit: false, error: e.message }; } }
      else { const src = (api.comments() || []).filter(c => c.status !== 'resolved').map(c => ({ id: 'comment:' + c.id, kind: 'comment', text: c.text, who: c.byName || 'You', at: c.at, block: c.block, title: c.label || '' })); d = { suggestions: [], sources: src, history: [], canEdit: true, local: true }; }
      data = d; loading = null; return d;
    })();
    return loading;
  }
  // the list follows the design as it is now: a suggestion the page already carries out is gone, an undone one is back
  function current(api) {
    if (!data) return [];
    const dismissed = new Set(data.dismissed || []), all = CORE() ? CORE().suggest(api.cfg(), data.sources || [], S()) : [];
    return all.filter(s => !dismissed.has(s.id) && !later.has(s.id));
  }
  const count = api => (data ? current(api).length : 0);

  function card(s, canEdit) {
    // the one suggestion card (app/ui/suggest.js) when it is loaded; the same markup otherwise
    if (window.TribeSuggest && window.TribeSuggest.card) return window.TribeSuggest.card({ id: s.id, title: s.title, before: s.before, after: s.after, srcHtml: srcLine(s.source, true), rowClass: 'wdz-row', row: [canEdit ? ['data-sg', 'apply', 'Apply', true] : ['data-sg', 'ask', 'Ask them', true], ['data-sg', 'later', 'Not now'], ...(canEdit ? [['data-sg', 'dismiss', 'Dismiss', 0]] : []), ...(s.target && s.target.block !== '@' ? [['data-sg', 'show', 'Show me', 0]] : [])] });
    return `<li class="sg" data-sgid="${esc(s.id)}"><p class="sg-t">${esc(s.title)}</p><p class="sg-ba"><del>${esc(s.before)}</del><ins>${esc(s.after)}</ins></p>${srcLine(s.source, true)}
      <p class="wdz-row">${canEdit ? `<button type="button" class="btn sm primary" data-sg="apply" data-id="${esc(s.id)}">Apply</button>` : `<button type="button" class="btn sm primary" data-sg="ask" data-id="${esc(s.id)}">Ask them</button>`}<button type="button" class="btn sm" data-sg="later" data-id="${esc(s.id)}">Not now</button>${canEdit ? `<button type="button" class="btn sm ghost" data-sg="dismiss" data-id="${esc(s.id)}">Dismiss</button>` : ''}${s.target && s.target.block !== '@' ? `<button type="button" class="btn sm ghost" data-sg="show" data-id="${esc(s.id)}">Show me</button>` : ''}</p></li>`;
  }
  async function paint(box, api) {
    if (!box) return;
    if (!data || forPid !== (api.pid() || '')) box.innerHTML = '<p class="wdz-eyebrow">Suggestions</p><p class="wdz-hint">Reading what the tribe said…</p>';
    const d = await load(api); if (!box.isConnected || api.panelNow() !== 'ideas') return badge(api);
    const list = current(api), n = (d.sources || []).length;
    box.innerHTML = `<p class="wdz-eyebrow">Suggestions${list.length ? ` · ${list.length}` : ''}</p>
      <p class="wdz-hint">${d.local ? 'On this device, suggestions come from the comments on the site. In a tribe they also come from chat, tasks, docs and decisions.' : 'Changes drawn from what your tribe said in chat, tasks, docs, updates and decisions. Nothing changes until you tap Apply, and Undo takes it back.'}</p>
      ${d.error ? `<p class="wdz-hint">Could not read the tribe just now: ${esc(d.error)}</p>` : ''}
      ${list.length ? `<ol class="sg-list">${list.map(s => card(s, d.canEdit !== false)).join('')}</ol>${list.length > 1 && d.canEdit !== false ? '<p class="wdz-row"><button type="button" class="btn sm" data-sg="applyall">Apply all</button></p>' : ''}` : `<p class="wdz-hint">${n ? 'Nothing to suggest: the site already matches what was said.' : 'Nothing has been said yet that would change the site.'} Try saying it in chat: “we open Saturday at 9 now”, or make a task: “Add a contact form to the website”.</p>`}
      <p class="wdz-row"><button type="button" class="btn sm ghost" data-sg="refresh">Look again</button></p>
      ${(d.history || []).length ? `<p class="wdz-f"><span>Applied before</span></p><div class="sg-said">${d.history.slice(-5).reverse().map(h => `<p class="sg-said-i"><b>${esc(h.title)}</b>: ${esc(h.after)} · ${esc(h.byName || '')} ${esc(ago(h.at))}</p>`).join('')}</div>` : ''}`;
    badge(api);
  }
  function badge(api) { const n = api.root().querySelector('#wdz-sn'); if (n) { const k = count(api); n.hidden = !k; n.textContent = k; } }
  // once per design: tell the person there is something, without getting in the way
  async function refresh(api, force) {
    const d = await load(api, force); badge(api);
    const k = count(api);
    if (k && !told && !d.local) { told = true; api.say(`Your tribe said ${k === 1 ? 'something' : `${k} things`} that could change the site. Nothing is changed until you say so.`, '<p class="wdz-row"><button type="button" class="btn sm primary" data-sg="panel">See the suggestions</button></p>'); }
    return d;
  }

  function applyOne(api, s) {
    const r = S().applyOps(api.cfg(), s.ops); if (!r.done.length) return false;
    if (s.target && s.target.block && s.target.block !== '@') { if (s.target.page && s.target.page !== api.page()) api.setPage(s.target.page); api.setSel({ block: s.target.block, path: s.target.path || '', kind: s.target.path ? 'text' : 'block' }); }
    api.commit(r.cfg);
    if (window.TribeSuggest && api.pid() && api.connected()) window.TribeSuggest.feedback({ id: 'site:' + s.id, provider: 'site', kind: 'site-' + s.kind, title: s.title }, 'yes').catch(() => {});   // the engine learns from it
    if (api.pid() && api.connected()) C.api(`/projects/${encodeURIComponent(api.pid())}/site-suggestions/applied`, { method: 'POST', body: { id: s.id, title: s.title, before: s.before, after: s.after, target: s.target, source: s.source } }).then(x => { if (x && x.record && data) data.history = (data.history || []).filter(h => h.id !== x.record.id).concat(x.record); }).catch(() => {});
    return true;
  }
  async function ask(api, s) {
    const text = `Suggestion: ${s.title}. “${s.before}” becomes “${s.after}”. (${s.source.who || 'Someone'} ${WHERE[s.source.kind] || ''}: “${s.source.text}”)`.slice(0, 590);
    const blk = s.target && s.target.block !== '@' ? s.target.block : (api.pageNow().blocks[0] || {}).id;
    try { await api.addComment({ page: api.page(), block: blk, blockType: '', label: s.title, text, x: 50, y: 24 }); later.add(s.id);
      if (window.TribeGroupStyle && window.TribeGroupStyle.ask && api.pid() && api.connected()) { try { await window.TribeGroupStyle.ask('site.edit', s.title); } catch {} }
      api.say('Asked: it is a comment on that section now. The people who can change the site see it and can turn it into a task.'); } catch (e) { api.say('Could not ask: ' + e.message); }
  }
  async function click(el, api) {
    const k = el.dataset.sg, id = el.dataset.id, s = id && current(api).find(x => x.id === id);
    if (k === 'panel') return api.panel('ideas');
    if (k === 'refresh') { await load(api, true); return api.panel('ideas'); }
    if (k === 'open') { const link = el.dataset.link; if (!/^#\//.test(link || '')) return; await api.flush(); api.close(); location.hash = link; return; }
    if (k === 'applyall') { const list = current(api); let c = api.cfg(), n = 0; const did = []; for (const x of list) { const r = S().applyOps(c, x.ops); if (r.done.length) { c = r.cfg; n++; did.push(x); } } if (!n) return; api.commit(c); did.forEach(x => { if (api.pid() && api.connected()) C.api(`/projects/${encodeURIComponent(api.pid())}/site-suggestions/applied`, { method: 'POST', body: { id: x.id, title: x.title, before: x.before, after: x.after, target: x.target, source: x.source } }).catch(() => {}); }); api.say(`Applied ${n} suggestion${n === 1 ? '' : 's'} from your tribe: ${did.map(x => x.title.toLowerCase()).join(', ')}. One Undo takes them all back.`, '', [{ label: 'Undo', fn: () => api.undo() }]); return api.panel('ideas'); }
    if (!s) return;
    if (k === 'apply') { if (applyOne(api, s)) { api.say(`${s.title}: “${s.before}” is now “${s.after}”. It came from ${s.source.who || 'someone'} ${WHERE[s.source.kind] || ''}.`, '', [{ label: 'Undo', fn: () => api.undo() }]); api.postSel(true); } return api.panel(api.panelNow() === 'ideas' ? 'ideas' : 'edit'); }
    if (k === 'ask') return ask(api, s);
    if (k === 'later') { later.add(s.id); return api.panel(api.panelNow()); }
    if (k === 'dismiss') { later.add(s.id); if (window.TribeSuggest) window.TribeSuggest.feedback({ id: 'site:' + s.id, provider: 'site', kind: 'site-' + s.kind, title: s.title }, 'no').catch(() => {}); if (data) data.dismissed = (data.dismissed || []).concat(s.id); if (api.pid() && api.connected()) { try { await C.api(`/projects/${encodeURIComponent(api.pid())}/site-suggestions/dismiss`, { method: 'POST', body: { id: s.id } }); } catch (e) { api.say('Could not dismiss it for everyone: ' + e.message); } } return api.panel(api.panelNow()); }
    if (k === 'show' && s.target) { if (s.target.page && s.target.page !== api.page()) api.setPage(s.target.page); api.setSel({ block: s.target.block, path: s.target.path || '', kind: s.target.path ? 'text' : 'block' }); api.paint(); api.postSel(true); return; }
  }

  // "What the tribe said about this": under the selected element in the Edit panel
  async function said(box, api) {
    const sel = api.sel(); if (!sel || !box) return;
    const d = await load(api); if (!box.isConnected) return;
    const now = api.sel(); if (!now || now.block !== sel.block || now.path !== sel.path) return;
    const path = String(sel.path || '').replace(/\.$/, ''), mine = s => s.target && s.target.block === sel.block && (sel.kind === 'block' || !path || s.target.path === path || s.target.path === path + '.label');
    const pend = current(api).filter(mine), rel = CORE() ? CORE().related(api.cfg(), sel, d.sources || [], S()) : [];
    const hist = (d.history || []).filter(h => h.block === sel.block && (sel.kind === 'block' || !path || h.path === path)).slice(-3).reverse();
    const used = new Set(pend.map(s => s.source.id));
    const talk = rel.filter(r => !used.has(r.id));
    if (!pend.length && !talk.length && !hist.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<p class="wdz-f"><span>What the tribe said about this</span></p>
      ${pend.length ? `<ol class="sg-list">${pend.map(s => card(s, d.canEdit !== false)).join('')}</ol>` : ''}
      ${talk.length ? `<div class="sg-said">${talk.map(r => srcLine(r, true).replace('class="sg-src"', 'class="sg-said-i"')).join('')}</div>` : ''}
      ${hist.length ? `<div class="sg-said">${hist.map(h => `<p class="sg-said-i">Changed to <b>${esc(h.after)}</b> by ${esc(h.byName || 'someone')} ${esc(ago(h.at))}, from ${esc(h.source.who || 'someone')} ${esc(WHERE[h.source.kind] || '')}: <q>${esc(h.source.text)}</q></p>`).join('')}</div>` : ''}`;
  }

  // Flint: "what should we update on the site?" · "apply what we decided in chat"
  async function flint(mode, api) {
    const d = await load(api, true); const list = current(api); badge(api);
    if (d.error) return `I could not read the tribe just now (${d.error}).`;
    if (!list.length) return (d.sources || []).length ? 'Nothing to change: the site already matches what your tribe said in chat, tasks, docs and decisions.' : 'Nobody has said anything yet that would change the site. Say it in chat (“we open Saturday at 9 now”) or make a task (“Add a contact form to the website”) and ask me again.';
    if (mode === 'apply') {
      if (d.canEdit === false) { api.panel('ideas'); return `You cannot change the site in this project, so I did not. There ${list.length === 1 ? 'is 1 suggestion' : `are ${list.length} suggestions`} in Suggestions: tap “Ask them” on any.`; }
      const pick = list.filter(s => s.source.decided || s.source.kind !== 'chat' || list.length <= 3); const use = pick.length ? pick : list;
      let c = api.cfg(), did = []; for (const x of use) { const r = S().applyOps(c, x.ops); if (r.done.length) { c = r.cfg; did.push(x); } }
      if (!did.length) return 'None of the suggestions fit the site as it is now.';
      api.commit(c); did.forEach(x => { if (api.pid() && api.connected()) C.api(`/projects/${encodeURIComponent(api.pid())}/site-suggestions/applied`, { method: 'POST', body: { id: x.id, title: x.title, before: x.before, after: x.after, target: x.target, source: x.source } }).catch(() => {}); });
      return `Applied ${did.length} thing${did.length === 1 ? '' : 's'} your tribe said: ${did.map(x => `${x.title.toLowerCase()} (“${x.after}”, from ${x.source.who || 'someone'} ${WHERE[x.source.kind] || ''})`).join('; ')}. Undo takes ${did.length === 1 ? 'it' : 'them all'} back.${use.length < list.length ? ` ${list.length - use.length} more from chat wait in Suggestions for your OK.` : ''}`;
    }
    api.panel('ideas');
    return `${list.length === 1 ? 'One thing' : `${list.length} things`} your tribe said could change the site: ${list.slice(0, 3).map(s => `${s.title.toLowerCase()} (“${s.after}”, ${s.source.who || 'someone'} ${WHERE[s.source.kind] || ''})`).join('; ')}${list.length > 3 ? ', and more' : ''}. They are in Suggestions on the right: Apply, Not now or Dismiss. Or say “apply what we decided”.`;
  }
  const reset = () => { data = null; forPid = null; later = new Set(); told = false; };
  window.TribeSiteSuggest = { paint, click, said, flint, refresh, count, reset, current };
})();
