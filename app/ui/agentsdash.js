// Agents dashboard (feat/agents-dash), now Agents & office: the office fills the page (officefull.js lays it out, with
// agentsoffice.js's shared parts). This file loads the agents' data and paints the side panel's Working on: what waits
// for an OK (approve right there), the next step, Needs you (reviews, hand-offs, delegations, conflicts, budgets), one
// row per AI helper (fleet.js), the people here and the tasks in progress. With no AI helper yet: Add an AI helper and
// the four loops (a friend, where it runs, what's private, GitHub). #agents shows in Updates; talking to agents is the
// box at the bottom ("@name …"); ownership and the daily plan are under More views.
// The deep views stay reachable without a row of tabs: the Agents Hub's top line holds only Dashboard and the tabs
// you pinned, plus a "+" at the end that pins any of Your agents, Ownership, Conflicts, Hand-offs, Reviews, Daily
// plan, Secretary, MCP (saved in localStorage). A × unpins (or closes a temporary tab). Deep links (#/agents/<slug>,
// TribeCoord.open(tab), TribeShell.go(key)) still work: an unpinned view shows as a temporary tab.
// Hooks: coord.js calls render(el) for its 'agents' tab; shell.js asks tabs(list, cur), tabExtra(key), plusHtml()
// and sig() while drawing the Agents Hub's tab line.
//   window.TribeAgentsDash = { render, repaint, tabs, tabExtra, plusHtml, sig, pins, pin, unpin, openMenu }
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const App = () => window.TribeApp;
  const Shell = () => window.TribeShell;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => App() && App().toast && App().toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const k = n => (n === null || n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const me = () => (C && C.state().me) || {};
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

  // ---------- pinned tabs ----------
  const PINNABLE = ['agents-hub', 'ownership', 'conflicts', 'handoffs', 'reviews', 'plan', 'secretary', 'mcp-directory'];
  const ABOUT = {
    'agents-hub': ['Your AI tools', 'Keys, local models and the secretary'],
    ownership: ['Ownership', 'Who owns which files and areas'],
    conflicts: ['Conflicts', 'Branches that change the same files'],
    handoffs: ['Hand-offs', 'Work parked for a teammate'],
    reviews: ['Reviews', 'Branches waiting for a yes'],
    plan: ['Daily plan', 'Today\'s picks for people and agents'],
    secretary: ['Secretary', 'Journal, digest and inspirations'],
    'mcp-directory': ['MCP', 'Every tool that can join through MCP'],
  };
  const PKEY = 'tribecode.agents.pins';
  let memPins = null;   // used when storage is blocked
  function pins() {
    try { const v = JSON.parse(localStorage.getItem(PKEY) || '[]'); return Array.isArray(v) ? v.filter(x => PINNABLE.includes(x)) : []; }
    catch { return (memPins || []).slice(); }
  }
  function savePins(list) { memPins = list.slice(); try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch {} }
  const refreshTabs = () => { const S = Shell(); if (S && S.tabs) S.tabs(); };
  const go = key => { const S = Shell(); if (S) S.go(key); };
  const onView = () => document.body.dataset.view === 'coord' && window.TribeCoord && window.TribeCoord.tab() === 'agents';
  function pin(key) { if (!PINNABLE.includes(key)) return; const p = pins(); if (!p.includes(key)) { p.push(key); savePins(p); } refreshTabs(); }
  function unpin(key) {
    savePins(pins().filter(x => x !== key));
    const cur = Shell() && Shell().current ? Shell().current() : '';
    if (cur === key) go('agents'); else refreshTabs();
  }
  // Shell hook: Dashboard, then pinned tabs in pin order, then the view on screen if it isn't pinned (a temporary tab).
  function tabs(list, cur) {
    const out = [], dash = list.find(t => t.key === 'agents');
    if (dash) out.push(dash);
    pins().forEach(key => { const t = list.find(x => x.key === key); if (t) out.push(t); });
    if (cur && !out.some(t => t.key === cur)) { const t = list.find(x => x.key === cur); if (t) out.push(t); }
    return out;
  }
  function tabExtra(key) {
    if (key === 'agents') return '';
    const p = pins().includes(key);
    return `<span class="wt-x ${p ? '' : 'temp'}" data-wt-x="${esc(key)}" role="button" aria-label="${p ? 'Unpin' : 'Close'} ${esc((ABOUT[key] || [key])[0])}" title="${p ? 'Unpin' : 'Close'}">×</span>`;
  }
  const plusHtml = () => '<button class="wt wt-plus" id="wt-plus" type="button" aria-haspopup="menu" aria-label="Pin a tab" title="Pin a tab"><svg class="i" style="width:16px;height:16px"><use href="#i-plus"/></svg></button>';
  const sig = () => pins().join(',');

  // the + menu: a small popover on desktop, a sheet on phones
  let menuEl = null, scrim = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } if (scrim) { scrim.remove(); scrim = null; } const b = $('#wt-plus'); if (b) b.setAttribute('aria-expanded', 'false'); }
  function openMenu(anchor) {
    closeMenu();
    const have = new Set(((Shell() && Shell().dests()) || []).filter(d => d.group === 'agents' && d.visible).map(d => d.key));
    const p = pins(), keys = PINNABLE.filter(x => have.has(x));
    const el = document.createElement('div');
    el.className = `sh-pop ad-menu ${isPhone() ? 'sheet' : ''}`; el.id = 'ad-menu'; el.setAttribute('role', 'menu');
    el.innerHTML = `${isPhone() ? '<div class="pj-grab"></div>' : ''}<div class="sh-menu"><h6>Pin a tab</h6>${keys.map(x => { const on = p.includes(x);
      return `<button role="menuitemcheckbox" aria-checked="${on}" data-ad-pin="${esc(x)}" class="${on ? 'on' : ''}"><span class="ad-m-t"><b>${esc(ABOUT[x][0])}</b><small>${esc(ABOUT[x][1])}</small></span><span class="ad-m-ck">${on ? '✓' : ''}</span></button>`; }).join('')}</div>`;
    if (isPhone()) { scrim = document.createElement('div'); scrim.className = 'ad-scrim'; scrim.onclick = closeMenu; document.body.appendChild(scrim); }
    document.body.appendChild(el); menuEl = el;
    if (!isPhone() && anchor) {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8) + 'px';
      el.style.top = Math.min(Math.max(8, r.bottom + 6), innerHeight - h - 8) + 'px';
      const f = el.querySelector('button'); if (f) f.focus({ preventScroll: true });
    }
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-ad-pin]'); if (!b) return;
      const key = b.dataset.adPin;
      if (pins().includes(key)) { closeMenu(); unpin(key); toast(`${ABOUT[key][0]} unpinned`); }
      else { closeMenu(); pin(key); go(key); }
    });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const x = e.target.closest('[data-wt-x]');
    if (x) {
      e.preventDefault(); e.stopPropagation();
      const key = x.dataset.wtX;
      if (pins().includes(key)) unpin(key); else go('agents');
      return;
    }
    const plus = e.target.closest('#wt-plus');
    if (plus) { e.preventDefault(); e.stopPropagation(); if (menuEl) closeMenu(); else openMenu(plus); }
  }, true);
  document.addEventListener('mousedown', e => { if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('#wt-plus'))) closeMenu(); });
  document.addEventListener('keydown', e => {
    if (!menuEl) return;
    if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { const all = [...menuEl.querySelectorAll('button')]; const i = all.indexOf(document.activeElement); const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) { n.focus(); e.preventDefault(); } }
  }, true);
  new MutationObserver(() => closeMenu()).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // ---------- the dashboard ----------
  let seq = 0, moreAgents = false;
  let cfCache = { at: 0, pid: '', d: null };
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || 'default';
  const canSteer = a => a.yours || me().role === 'host';
  const ctlLabel = c => (c ? `${c.action === 'stop' ? 'Stop' : 'Pause'} requested${c.seen ? ' · seen' : ' · not seen yet'}` : '');

  // feat/p10-office: the last good dashboard, so a slow or offline tribe shows what was there (with a note) instead of
  // a card stuck on "Looking at your agents…"
  const LAST = 'tribecode.agents.last';
  let lastGood = (() => { try { return JSON.parse(localStorage.getItem(LAST) || 'null'); } catch { return null; } })();
  const keepLast = d => { try { lastGood = { pid: pid(), at: Date.now(), d: { fleet: d.fleet, agents: d.agents, reviews: d.reviews, handoffs: d.handoffs, delegations: d.delegations, owners: d.owners, messages: [], plan: null } }; localStorage.setItem(LAST, JSON.stringify(lastGood)); } catch {} };
  const fallback = () => (lastGood && lastGood.pid === pid() ? { ...lastGood.d, stale: lastGood.at } : { fleet: null, agents: [], reviews: [], handoffs: [], delegations: [], owners: [], messages: [], plan: null, stale: -1 });
  let lastEl = null, painted = 0;
  async function render(el, tries = 0) {
    const n = ++seq; lastEl = el;
    if (window.TribeOffice) window.TribeOffice.load().then(() => { if (n === seq && painted === n && el.isConnected && onView() && el._d) paint(el, el._d); });
    setTimeout(() => { if (n === seq && painted !== n && el.isConnected && onView()) { const w = el.querySelector('.ad-wait'); if (w) w.remove(); paint(el, fallback()); } }, 2000);
    if (!el.querySelector('#ad-dash') && !el.querySelector('.ad-wait')) el.insertAdjacentHTML('afterbegin', '<p class="faint ad-wait">Loading the agents…</p>');
    let res;
    try { res = await Promise.all([
      C.api('/coord/agents'),
      C.api('/coord/reviews').catch(() => ({ reviews: [] })),
      C.api('/coord/handoffs').catch(() => ({ handoffs: [] })),
      C.api('/coord/delegations').catch(() => ({ delegations: [] })),
      C.api('/coord/ownership').catch(() => ({ owners: [], warnings: [] })),
      C.api('/agents/channel?limit=20').catch(() => ({ messages: [] })),
      window.TribeFleet ? window.TribeFleet.load('project').catch(() => null) : null,   // feat/fleet: hero + one row per agent
    ]); } catch (e) {   // the first call can fail while a tribe (or the demo) is still starting: try again, never leave it blank
      if (n === seq && tries < 8 && el.isConnected) setTimeout(() => { if (n === seq) render(el, tries + 1); }, 500 + tries * 300);
      else if (n === seq) { const w = el.querySelector('.ad-wait'); if (w) w.remove(); paint(el, fallback()); }
      return;
    }
    const [ag, rv, ho, dl, own, ch, fl] = res;
    if (n !== seq || !onView()) return;   // the tab changed while it loaded: don't paint over the new one
    { const w = el.querySelector('.ad-wait'); if (w) w.remove(); }
    const d = { fleet: fl, agents: ag.agents || [], reviews: rv.reviews || [], handoffs: ho.handoffs || [], delegations: dl.delegations || [], owners: own.owners || [], messages: ch.messages || [], conflicts: cfCache.pid === pid() ? cfCache.d : null, plan: null };
    keepLast(d); paint(el, d); painted = n;
    const still = () => n === seq && el.isConnected && onView();
    // slower pieces fill in after the first paint
    C.api('/coord/plan').then(r => { d.plan = r.plan; if (still()) paint(el, d); }).catch(() => {});
    // feat/ship-flow: who is waiting on whom, and a ship vote that needs you
    Promise.all([C.api('/ship/pulse').catch(() => null), C.api('/ship').catch(() => null)]).then(([pl, sh]) => {
      d.pulse = pl && pl.lines || []; d.ship = sh;
      const shows = d.pulse.some(x => x.kind === 'wait' || x.kind === 'ship') || (sh && sh.request && sh.request.status === 'pending');   // repaint only when there is something to show
      if (shows && still()) paint(el, d);
    });
    if (cfCache.pid !== pid() || Date.now() - cfCache.at > 60_000) {
      C.api('/coord/conflicts').then(r => { cfCache = { at: Date.now(), pid: pid(), d: r }; d.conflicts = r; if (still()) paint(el, d); }).catch(() => {});
    }
  }

  // mono eyebrow with the "Open … →" link on its line, then the big title across the whole card
  const head = (eyebrow, title, open, openLabel) => `<header class="ad-head"><div class="ad-eyerow"><span class="eyebrow">${eyebrow}</span>${open ? `<button class="ad-open linkish" data-ad-open="${esc(open)}">${esc(openLabel)} →</button>` : ''}</div><h2 class="ad-title">${title}</h2></header>`;

  function needsItems(d) {
    const my = me().id, out = [];
    const rq = d.ship && d.ship.request;   // feat/ship-flow: a ship vote waiting on you
    if (rq && rq.status === 'pending' && (rq.tally.waitingOn || []).includes(me().name) && !(rq.votes || []).some(v => v.id === my)) out.push({ kind: 'Ship', view: '', title: `Ship ${plural(rq.count, 'saved change')} to GitHub?`, sub: `${rq.byName} asked · ${rq.modeText}`,
      acts: `<button class="btn ad-btn ok" data-ad-ship="yes" data-id="${esc(rq.id)}">Approve</button><button class="btn ad-btn no" data-ad-ship="no" data-id="${esc(rq.id)}">Deny</button>` });
    d.reviews.filter(r => r.status === 'pending' && r.canDecide).forEach(r => out.push({ kind: 'Review', view: 'reviews', title: r.title, sub: `${r.byName}${r.branch ? ' · ' + r.branch : ''}`,
      acts: `<button class="btn ad-btn ok" data-ad-rv="approve" data-id="${esc(r.id)}">Approve</button><button class="btn ad-btn no" data-ad-rv="deny" data-id="${esc(r.id)}">Deny</button>` }));
    d.handoffs.filter(h => h.status === 'open' && h.from !== my && (!h.to || h.to === my)).forEach(h => out.push({ kind: 'Hand-off', view: 'handoffs', title: h.title, sub: `From ${h.fromName} · ${ago(h.created)}`,
      acts: `<button class="btn ad-btn take" data-take data-ad-take="${esc(h.id)}">Take it</button>` }));
    d.delegations.filter(x => x.status === 'awaiting-approval' && x.approval).forEach(x => out.push({ kind: 'Approval', view: 'agents', title: `${x.fromName} → ${x.toName}`, sub: `Wants to hand over "${x.taskTitle}"`,
      acts: `<button class="btn ad-btn ok" data-ad-ap="approve" data-id="${esc(x.approval)}">Approve</button><button class="btn ad-btn no" data-ad-ap="deny" data-id="${esc(x.approval)}">Deny</button>` }));
    if (d.conflicts && d.conflicts.enabled) d.conflicts.pairs.filter(p => !p.asked).forEach(p => out.push({ kind: 'Conflict', view: 'conflicts', title: `${p.a.branch} and ${p.b.branch}`, sub: `Both change ${p.files.slice(0, 2).join(', ')}${p.count > 2 ? ` and ${p.count - 2} more` : ''}`,
      acts: `<button class="btn ad-btn" data-ad-sync data-a="${esc(p.a.branch)}" data-b="${esc(p.b.branch)}">Ask both to catch up</button>` }));
    d.agents.filter(a => a.tokens && a.budget && a.tokens / a.budget > 0.85).forEach(a => out.push({ kind: 'Budget', view: 'agents-hub', title: a.name, sub: `Used ${Math.round(a.tokens / a.budget * 100)}% of its token budget`,
      acts: canSteer(a) && !(a.control && a.control.action !== 'resume') ? `<button class="btn ad-btn agent" data-ad-ctl="pause" data-id="${esc(a.id)}">Pause</button>` : '' }));
    return out;
  }
  function needsCard(d) {
    const items = needsItems(d); if (!items.length) return '';
    const view = items[0].view, lbl = { reviews: 'Open reviews', handoffs: 'Open hand-offs', conflicts: 'Open conflicts', 'agents-hub': 'Your agents' }[view];
    return `<section class="ad-card ad-needs" id="ad-needs">${head('Needs you', items.length === 1 ? '1 thing needs you' : `${items.length} things need you`, lbl ? view : '', lbl)}
      <div class="ad-rows">${items.slice(0, 8).map(i => `<div class="ad-need"><span class="ad-kind k-${esc(i.kind.toLowerCase().replace(/[^a-z]/g, ''))}">${esc(i.kind)}</span><div class="ad-n-main"><b>${esc(i.title)}</b><span>${esc(i.sub)}</span></div><div class="ad-n-acts">${i.acts}</div></div>`).join('')}</div>
      ${items.length > 8 ? `<p class="ad-foot">${items.length - 8} more in their views</p>` : ''}</section>`;
  }

  // feat/office-full: the page is the office, full size (officefull.js lays it out: the head line, the floor edge to
  // edge with its toolbar, the side panel with Preview | Working on | Updates, the box at the bottom). This paints only
  // Working on, so the floor, the live preview and what you are typing stay put while the data changes.
  // Working on, in one order: Needs you (only when something does) → Working now → Up next → Here.
  const sec = (id, label, body) => `<section class="ofl-sec" id="${id}"><h3 class="ofl-h">${esc(label)}</h3>${body}</section>`;
  function needsYou(d) {
    const O = window.TribeOffice, od = O && O.state(), out = [], seen = new Set();
    // the fleet knows the approvals you may decide as the host too (Approve / Deny through its own route)
    const fl = new Map(((d.fleet && d.fleet.next) || []).filter(n => n.kind === 'approval').map(n => [n.approval, n]));
    const card = (title, who, agentId, acts) => `<div class="ofl-need ofl-ask ad-need"><b class="ofl-need-t">${esc(title)}</b><span class="ofl-need-s">${esc(who)}</span>
        <div class="ofl-acts">${acts}${agentId ? `<button type="button" class="linkish ofl-see" data-ao-ask="${esc(agentId)}">See the change</button>` : ''}</div></div>`;
    for (const x of ((od && od.desks) || []).filter(x => x.kind === 'agent')) for (const a of x.asks || []) {
      seen.add(a.id);
      const f = fl.get(a.id), who = `${x.name.split(' · ')[0]} asks${x.ownerName ? ` · ${x.ownerName.split(' ')[0]}'s` : ''}`;
      out.push(card(a.title, who, x.id, a.canDecide ? `<button type="button" class="btn sm primary" data-ao-ap="approve" data-id="${esc(a.id)}">Approve</button><button type="button" class="btn sm" data-ao-ask="${esc(x.id)}">Ask for changes</button>`
        : f ? `<button type="button" class="btn sm primary" data-fl-ap="approve" data-id="${esc(f.approval)}" data-pj="${esc(f.project || '')}">Approve</button><button type="button" class="btn sm" data-fl-ap="deny" data-id="${esc(f.approval)}" data-pj="${esc(f.project || '')}">Deny</button>` : '<em class="faint">Waiting for its owner</em>'));
    }
    for (const [id, f] of fl) if (!seen.has(id)) out.push(card(f.sub || f.title, f.title, f.agent, `<button type="button" class="btn sm primary" data-fl-ap="approve" data-id="${esc(id)}" data-pj="${esc(f.project || '')}">Approve</button><button type="button" class="btn sm" data-fl-ap="deny" data-id="${esc(id)}" data-pj="${esc(f.project || '')}">Deny</button>`));
    for (const i of needsItems(d)) out.push(`<div class="ofl-need ad-need"><b class="ofl-need-t">${esc(i.title)}</b><span class="ofl-need-s">${esc(i.kind)} · ${esc(i.sub)}</span><div class="ofl-acts">${i.acts}</div></div>`);
    return out.length ? `<section class="ofl-sec" id="ad-needs"><h3 class="ofl-h">Needs you</h3><div class="ofl-needs">${out.join('')}</div></section>` : '';
  }
  function peopleRows() {
    const O = window.TribeOffice, od = O && O.state(); if (!od || !od.desks) return '';
    return od.desks.filter(x => x.kind === 'person' && x.state === 'active' && x.id !== od.me && (x.task || (O.linesOf(x) || [])[0])).map(x => `<article class="fl-lrow"><div class="fl-lline"><button type="button" class="fl-lhead" data-desk="${esc(x.id)}">
      <span class="fl-lav ofl-pav" aria-hidden="true">${esc(String(x.name || '?').trim()[0].toUpperCase())}</span><span class="fl-lt"><span class="fl-lname"><b>${esc(x.name)}</b></span><span class="fl-ldo">${esc(x.task ? x.task.title : (O.linesOf(x) || [])[0])}</span></span>
      <span class="fl-lst st-working"><i aria-hidden="true"></i>now</span></button></div></article>`).join('');
  }
  function upNext() {
    const T = window.TribeTasks, all = T && T.all ? T.all() : [];
    let list = all.filter(t => t.status === 'doing').slice(0, 5);
    if (!list.length) list = all.filter(t => t.status === 'todo' || t.status === 'backlog').slice(0, 1);
    if (!list.length) return '';
    const ms = C.state().members || [], nameOf = id => ((ms.find(m => m.id === id) || {}).name || '').split(' · ')[0];
    return sec('ao-doing', 'Up next', `<ul class="ofl-list">${list.map(t => `<li><button type="button" class="ofl-row" data-ao-task="${esc(t.id)}"><span class="ofl-row-t"><b>${esc(t.title)}</b><small>${esc([t.status === 'doing' ? 'In progress' : 'Next', nameOf(t.assignee)].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')}</ul>`);
  }
  function here() {
    const O = window.TribeOffice, od = O && O.state(); if (!od || !od.desks) return '';
    const on = od.desks.filter(x => x.kind === 'person' && x.state !== 'off'); if (!on.length) return '';
    return sec('ao-people', 'Here', `<div class="ofl-here">${on.map(x => `<button type="button" class="ofl-av" data-desk="${esc(x.id)}" data-role="person" title="${esc(x.name)}" aria-label="${esc(x.name)}">${esc(String(x.name || '?').trim()[0].toUpperCase())}</button>`).join('')}<span class="ofl-here-t">${esc(on.map(x => x.name.split(' ')[0] + (x.id === od.me ? ' (you)' : '')).join(', '))}</span></div>`);
  }
  function workingNow(d) {
    const L = window.TribeFleet && window.TribeFleet.list ? window.TribeFleet.list(d.fleet) : { rows: '', spare: '' };
    const rows = (L.rows || '') + peopleRows();
    return `<section class="ofl-sec" id="fl-agents"><h3 class="ofl-h">Working now</h3>${rows ? `<div class="fl-lrows">${rows}</div>` : `<p class="ofl-empty">No one’s working right now · <button type="button" class="linkish" data-ao-give>Give someone a task</button></p>`}${L.spare || ''}</section>`;
  }
  function paint(el, d) {
    const F = window.TribeFleet, AO = window.TribeAgentsOffice, FU = window.TribeOfficeFull;
    if (F) F.setData(d.fleet);
    const waits = (d.pulse || []).filter(x => x.kind === 'wait' || x.kind === 'ship');
    const pulse = waits.length ? `<div class="sh-pulse ad-pulse" id="ad-pulse">${waits.slice(0, 4).map(x => `<span class="${esc(x.kind)}">${esc(x.text)}</span>`).join('')}</div>` : '';
    el._d = d; painted = seq;
    const O = window.TribeOffice, os = O && O.state(), stale = d.stale ? `<p class="ad-stale faint" id="ad-stale">${d.stale > 0 ? `The tribe isn't answering right now. This is what was here ${esc(ago(new Date(d.stale).toISOString()))}.` : 'The tribe isn\'t answering right now.'}</p>` : '';
    // an agent counts once it has connected at least once: making a connect key adds an idle, never-seen agent, which
    // must not flip the page away from the connect flow before anything has joined
    const anyAgent = d.fleet ? (d.fleet.agents || []).some(a => a.everSeen || a.online) : (d.agents || []).some(a => a.online || a.where);
    const state = os && os.agentsOff ? 'off' : anyAgent ? 'dash' : 'connect';
    const built = FU.ensure(el, pid());
    // with no AI helper yet, or with them turned off, Working on holds the next step: show it when that state begins
    if (state !== 'dash' && (built || el.dataset.hub !== state)) FU.tab('work');
    const dash = el.querySelector('#ad-dash');
    dash.classList.toggle('ad-connectflow', state === 'connect');
    el.dataset.hub = state;
    // keep what is being typed in Working on (a task for an agent, a message) across the repaint
    const inp = el.querySelector('#ao-work input:focus'), keepSel = inp && inp.closest('[data-fl-form]') ? `[data-fl-form="${inp.closest('[data-fl-form]').dataset.flForm}"][data-id="${inp.closest('[data-fl-form]').dataset.id}"] input` : '';
    let html;
    if (state === 'off') {
      html = `${stale}<section class="hero-card ad-offcard" id="ad-hero" data-state="off"><span class="eyebrow">Agents</span><h2 class="fl-title">AI helpers are turned off</h2>
        <p class="fl-lead">No agent can work in this tribe until they are turned back on. Connections and keys are kept.</p>
        ${os.canSet ? '<div class="fl-acts"><button class="btn primary" id="ad-agents-on">Turn agents back on</button></div>' : '<p class="faint">The host or an admin can turn them back on.</p>'}</section>${upNext()}${here()}`;
    } else if (state === 'connect') {
      // the empty state says what to do: add an AI helper, and the four loops (a friend, where it runs, privacy, backup)
      html = `${stale}${AO.addAi('ad-hero')}<p class="ad-waiting faint" id="ad-waiting"><i class="ad-pulse-dot"></i>Waiting for an AI helper to connect… this page changes by itself when it does.</p>
        ${upNext()}${here()}${AO.setup()}`;
    } else {
      html = `${stale}${needsYou(d)}${workingNow(d)}${upNext()}${here()}${pulse}
        <p class="ad-more"><button class="linkish" id="ad-views" type="button" aria-haspopup="menu">More views: ownership, reviews, hand-offs…</button></p>`;
    }
    FU.work(html);
    if (keepSel) { const n = el.querySelector(`#ao-work ${keepSel}`); if (n) n.focus({ preventScroll: true }); }
    if (AO) { AO.wire(el); AO.fill(el).catch(() => {}); }
    FU.sync();
    if (F) F.wire(el, { scope: 'project', reload: () => { if (el.isConnected && onView()) render(el); } });
    { const v = el.querySelector('#ad-views'); if (v) v.onclick = () => openMenu(v); }
    const on = el.querySelector('#ad-agents-on'); if (on) on.onclick = async () => { on.disabled = true; try { await C.api('/office', { method: 'PUT', body: { agentsOff: false } }); await O.load(true); render(el); } catch (e) { on.disabled = false; toast(e.message); } };
    el.onclick = e => click(e, el, d);
    el.onkeydown = e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-ad-agent]')) openAgent(e.target.dataset.adAgent); };
  }
  const refresh = () => { if (window.TribeCoord) window.TribeCoord.refresh(); };
  const side = () => { if (window.TribeCoord && window.TribeCoord.side) window.TribeCoord.side(); };
  const openAgent = id => { const S = Shell(); if (S && S.previewAgent) S.previewAgent(id); };
  // one-tap: the row goes away at once, then the dashboard refreshes from the server
  const resolve = (b, msg) => { seq++;   // the data on screen is now older than what you just did: late fills must not repaint it (the live event reloads)
    const r = b.closest('.ad-need'); if (r) { r.classList.add('done'); setTimeout(() => r.remove(), 180); } if (msg) toast(msg); };

  async function click(e, el, d) {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const b = t.closest('button');
    const run = async fn => { if (!b) return; b.disabled = true; try { await fn(); setTimeout(() => { if (el && el.isConnected) render(el); }, 350); } catch (err) { toast(err.message); b.disabled = false; } };   // after an action, redraw from the server (a late redraw can't bring the old row back)
    if (b && (b.id === 'ad-connect' || 'adCc' in b.dataset)) return App() && App().connectClaude && App().connectClaude();
    if (b && b.id === 'ad-tools' && window.TribeFleet) return;   // the fleet hero handles it
    if (b && b.id === 'ad-tools') return go('mcp-directory');
    if (b && b.dataset.adOpen) return go(b.dataset.adOpen);
    if (b && b.dataset.adMore) { moreAgents = !moreAgents; return paint(el, d); }
    if (b && b.dataset.adCtl) return run(async () => { const action = b.dataset.adCtl; await C.api(`/coord/agents/${encodeURIComponent(b.dataset.id)}/control`, { method: 'POST', body: { action } }); toast(action === 'resume' ? 'Resumed' : 'Pause requested'); refresh(); side(); });
    if (b && b.dataset.adRv) return run(async () => { const v = b.dataset.adRv; await C.api(`/coord/reviews/${encodeURIComponent(b.dataset.id)}/${v}`, { method: 'POST', body: {} }); resolve(b, v === 'approve' ? 'Approved: task moved to Done' : 'Sent back to doing'); setTimeout(refresh, 300); });
    if (b && b.dataset.adShip) return run(async () => { const v = b.dataset.adShip; await C.api(`/ship/${encodeURIComponent(b.dataset.id)}/vote`, { method: 'POST', body: { vote: v } }); resolve(b, v === 'yes' ? 'Voted yes' : 'Voted no'); setTimeout(refresh, 600); });   // feat/ship-flow
    if (b && b.dataset.adTake) return run(async () => { await C.api(`/coord/handoffs/${encodeURIComponent(b.dataset.adTake)}/take`, { method: 'POST', body: {} }); resolve(b, 'It\'s yours'); setTimeout(refresh, 300); });
    if (b && b.dataset.adAp) return run(async () => { const v = b.dataset.adAp; await C.api(`/approvals/${encodeURIComponent(b.dataset.id)}/${v}`, { method: 'POST', body: {} }); resolve(b, v === 'approve' ? 'Approved' : 'Denied'); setTimeout(refresh, 3200); });
    if (b && b.dataset.aoAp) return run(async () => { await C.api(`/approvals/${encodeURIComponent(b.dataset.id)}/approve`, { method: 'POST', body: {} }); const li = b.closest('.ofl-ask'); if (li) li.remove(); toast('Approved'); if (window.TribeOffice) window.TribeOffice.refresh(); });
    if (b && b.dataset.aoAsk) return window.TribeOffice && window.TribeOffice.openCard(b.dataset.aoAsk);
    if (b && 'aoGive' in b.dataset) { const bx = window.TribeOfficeFull && window.TribeOfficeFull.box(); if (bx) bx.fill('@'); return; }
    if (b && b.dataset.aoTask) return window.TribeTasks && window.TribeTasks.open && window.TribeTasks.open(b.dataset.aoTask);
    if (b && b.closest('#ao-work') && b.dataset.desk) return window.TribeOffice && window.TribeOffice.openCard(b.dataset.desk);
    if (b && b.hasAttribute('data-ad-sync')) return run(async () => { const r = await C.api('/coord/conflicts/sync', { method: 'POST', body: { a: b.dataset.a, b: b.dataset.b } }); cfCache.at = 0; resolve(b, `Asked ${r.asked.join(' and ')} to sync`); setTimeout(refresh, 300); });
    if (!b) { const row = t.closest('[data-ad-agent]'); if (row) openAgent(row.dataset.adAgent); }
  }
  C.on('project', () => { moreAgents = false; cfCache = { at: 0, pid: '', d: null }; });

  // feat/p10-office: while the hub waits for a first agent, it turns into the dashboard by itself when one connects;
  // the office and the agents switch repaint it too
  { let t = null; const again = () => { clearTimeout(t); t = setTimeout(() => { if (lastEl && lastEl.isConnected && onView()) render(lastEl); }, 500); };
    if (C && C.on) { C.on('presence', ms => { if (lastEl && lastEl.dataset.hub === 'connect' && (ms || []).some(m => m.role === 'agent' && m.online)) again(); });
      C.on('ws', m => { if (m && m.type === 'office' && lastEl) { if (window.TribeOffice) window.TribeOffice.load(true).then(again); else again(); } }); } }
  // the office changed (someone sat down, an AI helper asked for an OK): Working on follows, from the data it has
  let rp = 0;
  function repaint() { clearTimeout(rp); rp = setTimeout(() => { if (lastEl && lastEl.isConnected && lastEl._d && onView() && painted === seq) paint(lastEl, lastEl._d); }, 250); }
  window.TribeAgentsDash = { render, repaint, tabs, tabExtra, plusHtml, sig, pins, pin, unpin, openMenu, closeMenu };
})();
