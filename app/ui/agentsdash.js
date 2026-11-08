// Agents dashboard (feat/agents-dash). The Agents Hub opens on one calm page of a few big cards, each shown only
// when it has something to say:
//   🤖 hero: "N agents working now" with live rows (who, task or file, when), or "No agents yet" + Connect your AI
//   Needs you: pending reviews, hand-offs waiting, delegations to approve, conflicts, agents near their budget,
//              merged into one list with one-tap actions (hidden when empty)
//   Who owns what: compact ownership lanes (top 5, Show all expands inline)
//   #agents: the agents channel feed + composer
//   Today: the daily plan's focus, only once a plan has items
// The deep views stay reachable without a row of tabs: the Agents Hub's top line holds only Dashboard and the tabs
// you pinned, plus a "+" at the end that pins any of Your agents, Ownership, Conflicts, Hand-offs, Reviews, Daily
// plan, Secretary, MCP (saved in localStorage). A × unpins (or closes a temporary tab). Deep links (#/agents/<slug>,
// TribeCoord.open(tab), TribeShell.go(key)) still work: an unpinned view shows as a temporary tab.
// Hooks: coord.js calls render(el) for its 'agents' tab; shell.js asks tabs(list, cur), tabExtra(key), plusHtml()
// and sig() while drawing the Agents Hub's tab line.
//   window.TribeAgentsDash = { render, tabs, tabExtra, plusHtml, sig, pins, pin, unpin, openMenu }
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
    'agents-hub': ['Your agents', 'Connect and manage your own AI tools'],
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
  let seq = 0, moreAgents = false, moreOwners = false;
  let cfCache = { at: 0, pid: '', d: null };
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || 'default';
  const canSteer = a => a.yours || me().role === 'host';
  const ctlLabel = c => (c ? `${c.action === 'stop' ? 'Stop' : 'Pause'} requested${c.seen ? ' · seen' : ' · not seen yet'}` : '');

  async function render(el, tries = 0) {
    const n = ++seq;
    if (!el.querySelector('#ad-dash') && !el.querySelector('.ad-wait')) el.insertAdjacentHTML('afterbegin', '<p class="faint ad-wait">Loading the agents…</p>');
    let res;
    try { res = await Promise.all([
      C.api('/coord/agents'),
      C.api('/coord/reviews').catch(() => ({ reviews: [] })),
      C.api('/coord/handoffs').catch(() => ({ handoffs: [] })),
      C.api('/coord/delegations').catch(() => ({ delegations: [] })),
      C.api('/coord/ownership').catch(() => ({ owners: [], warnings: [] })),
      C.api('/agents/channel?limit=20').catch(() => ({ messages: [] })),
    ]); } catch (e) {   // the first call can fail while a tribe (or the demo) is still starting: try again, never leave it blank
      if (n === seq && tries < 8 && el.isConnected) setTimeout(() => { if (n === seq) render(el, tries + 1); }, 500 + tries * 300);
      else if (n === seq) { const w = el.querySelector('.ad-wait'); if (w) w.textContent = 'The agents dashboard could not load. ' + (e && e.message ? e.message : ''); }
      return;
    }
    const [ag, rv, ho, dl, own, ch] = res;
    if (n !== seq) return;
    { const w = el.querySelector('.ad-wait'); if (w) w.remove(); }
    const d = { agents: ag.agents || [], reviews: rv.reviews || [], handoffs: ho.handoffs || [], delegations: dl.delegations || [], owners: own.owners || [], messages: ch.messages || [], conflicts: cfCache.pid === pid() ? cfCache.d : null, plan: null };
    paint(el, d);
    const still = () => n === seq && el.isConnected && onView();
    // slower pieces fill in after the first paint
    C.api('/coord/plan').then(r => { d.plan = r.plan; if (still()) paint(el, d); }).catch(() => {});
    if (cfCache.pid !== pid() || Date.now() - cfCache.at > 60_000) {
      C.api('/coord/conflicts').then(r => { cfCache = { at: Date.now(), pid: pid(), d: r }; d.conflicts = r; if (still()) paint(el, d); }).catch(() => {});
    }
  }

  // mono eyebrow with the "Open … →" link on its line, then the big title across the whole card
  const head = (eyebrow, title, open, openLabel) => `<header class="ad-head"><div class="ad-eyerow"><span class="eyebrow">${eyebrow}</span>${open ? `<button class="ad-open linkish" data-ad-open="${esc(open)}">${esc(openLabel)} →</button>` : ''}</div><h2 class="ad-title">${title}</h2></header>`;

  function heroCard(d) {
    const list = d.agents;
    if (!list.length) return `<section class="ad-card ad-hero ad-empty" id="ad-hero">${head('Agents', 'No agents yet')}
        <p class="ad-lead">An agent is an AI helper that writes code for you, like Claude Code, Codex or Cursor. Connect yours and it shows up here while it works, next to your friends' agents.</p>
        <div class="ad-acts"><button class="btn primary" id="ad-connect">Connect your AI</button><button class="linkish ad-tools" id="ad-tools">See all tools</button></div></section>`;
    const on = list.filter(a => a.online).length;
    const shown = moreAgents ? list : list.slice(0, 5);
    const row = a => {
      const doing = a.task ? a.task.title : a.files.length ? a.files[0] : a.online ? (a.where || 'Working') : 'Idle';
      const extra = a.task && a.files.length ? a.files[0] : '';
      const when = a.online ? `active ${ago(a.lastActive)}` : a.lastActive ? `last seen ${ago(a.lastActive)}` : a.yours && matchMedia('(max-width: 820px)').matches ? 'not connected yet: connect it from a computer' : 'not connected yet';
      const paused = a.control && a.control.action !== 'resume';
      const steer = canSteer(a) && (a.online || paused) ? `<button class="btn ad-btn agent" data-ad-ctl="${paused ? 'resume' : 'pause'}" data-id="${esc(a.id)}">${paused ? 'Resume' : 'Pause'}</button>`
        : a.yours && !a.online && !a.lastActive && !matchMedia('(max-width: 820px)').matches ? '<button class="btn ad-btn" data-ad-cc>Connect</button>' : '';   // qa-qol-2: your AI that never connected gets a next step
      return `<div class="ad-agent ${a.online ? 'on' : ''}" data-ad-agent="${esc(a.id)}" tabindex="0"><span class="ad-dot"></span>
        <div class="ad-a-main"><b>${esc(a.name)}</b><span class="ad-a-doing">${esc(doing)}${extra ? ` <code>${esc(extra)}</code>` : ''}</span>
        <span class="ad-a-meta">${esc(a.yours ? 'yours' : `${a.ownerName}'s`)} · ${esc(when)}${a.tokens !== null && a.tokens !== undefined ? ` · ${esc(k(a.tokens))} tokens` : ''}${a.control ? ` · <span class="ad-warn">${esc(ctlLabel(a.control))}</span>` : ''}</span></div>${steer}</div>`;
    };
    return `<section class="ad-card ad-hero" id="ad-hero">${head('Agents', on ? `${plural(on, 'agent')} working now` : 'No agents working right now', 'agents-hub', 'Your agents')}
      <div class="ad-rows">${shown.map(row).join('')}</div>
      ${list.length > 5 ? `<button class="linkish ad-more" data-ad-more="agents">${moreAgents ? 'Show fewer' : `Show all ${list.length}`}</button>` : ''}</section>`;
  }

  function needsItems(d) {
    const my = me().id, out = [];
    d.reviews.filter(r => r.status === 'pending' && r.canDecide).forEach(r => out.push({ kind: 'Review', view: 'reviews', title: r.title, sub: `${r.byName}${r.branch ? ' · ' + r.branch : ''}`,
      acts: `<button class="btn ad-btn ok" data-ad-rv="approve" data-id="${esc(r.id)}">Approve</button><button class="btn ad-btn no" data-ad-rv="deny" data-id="${esc(r.id)}">Deny</button>` }));
    d.handoffs.filter(h => h.status === 'open' && h.from !== my && (!h.to || h.to === my)).forEach(h => out.push({ kind: 'Hand-off', view: 'handoffs', title: h.title, sub: `From ${h.fromName} · ${ago(h.created)}`,
      acts: `<button class="btn ad-btn take" data-take data-ad-take="${esc(h.id)}">Take it</button>` }));
    d.delegations.filter(x => x.status === 'awaiting-approval' && x.approval).forEach(x => out.push({ kind: 'Approval', view: 'agents', title: `${x.fromName} → ${x.toName}`, sub: `Wants to hand over "${x.taskTitle}"`,
      acts: `<button class="btn ad-btn ok" data-ad-ap="approve" data-id="${esc(x.approval)}">Approve</button><button class="btn ad-btn no" data-ad-ap="deny" data-id="${esc(x.approval)}">Deny</button>` }));
    if (d.conflicts && d.conflicts.enabled) d.conflicts.pairs.filter(p => !p.asked).forEach(p => out.push({ kind: 'Conflict', view: 'conflicts', title: `${p.a.branch} and ${p.b.branch}`, sub: `Both change ${p.files.slice(0, 2).join(', ')}${p.count > 2 ? ` and ${p.count - 2} more` : ''}`,
      acts: `<button class="btn ad-btn" data-ad-sync data-a="${esc(p.a.branch)}" data-b="${esc(p.b.branch)}">Ask both to sync</button>` }));
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

  function ownersCard(d) {
    const rows = d.owners.map(o => {
      const areas = [...new Set([...o.lanes.map(l => l.area), ...o.claims.map(c => c.path)])];
      return { o, areas };
    }).filter(x => x.areas.length).sort((a, b) => b.areas.length - a.areas.length);
    if (!rows.length) return '';
    const shown = moreOwners ? rows : rows.slice(0, 5);
    return `<section class="ad-card ad-owners" id="ad-owners">${head('Who owns what', `${plural(rows.length, 'owner')}, ${plural(rows.reduce((s, r) => s + r.areas.length, 0), 'area')}`, 'ownership', 'Open ownership')}
      <div class="ad-rows">${shown.map(({ o, areas }) => `<div class="ad-lane"><span class="ad-av ${o.kind === 'agent' ? 'agent' : ''}" style="${o.kind === 'agent' ? '' : `--c:${esc(o.color || '#6C7CFF')}`}">${o.kind === 'agent' ? '🤖' : esc((o.name || '?')[0])}</span>
        <div class="ad-l-main"><b>${esc(o.name)}</b><span class="ad-l-areas">${areas.slice(0, 3).map(a => `<code>${esc(a)}</code>`).join('')}${areas.length > 3 ? `<span class="ad-l-n">+${areas.length - 3}</span>` : ''}</span></div></div>`).join('')}</div>
      ${rows.length > 5 ? `<button class="linkish ad-more" data-ad-more="owners">${moreOwners ? 'Show fewer' : `Show all ${rows.length}`}</button>` : ''}</section>`;
  }

  // qa-qol-2: the example names a real agent of this tribe (it said "@maya's-claude" to everyone)
  function talkHint() { const a = (C.state().members || []).find(m => m.role === 'agent'); return a ? `@agents or @${String(a.name || '').toLowerCase().replace(/^claude · (.+)$/, "$1's-claude").replace(/\s+/g, '-')} …` : 'Write to @agents …'; }
  function channelCard(d) {
    if (!d.messages.length && !d.agents.length) return '';
    const members = C.state().members || [];
    const nameOf = id => ((members.find(m => m.id === id) || {}).name) || 'someone';
    const msgs = d.messages.slice(-8);
    return `<section class="ad-card ad-chan" id="ad-chan">${head('#agents', 'What the agents are saying')}
      <div class="ad-talk talk">${msgs.length ? msgs.map(m => `<div class="talk-row ${m.human ? 'human' : ''}"><b>${esc(nameOf(m.by))}</b>${m.to ? `<span class="faint">→ ${esc(nameOf(m.to))}</span>` : ''}<span class="talk-t">${esc(m.text)}</span><span class="faint">${esc(ago(m.at))}</span></div>`).join('') : '<p class="ad-quiet">Quiet so far. Mention @agents or one agent by name to talk to them here.</p>'}</div>
      <form class="ad-compose" id="talk-form"><input class="input" id="talk-input" placeholder="${esc(talkHint())}" maxlength="2000" autocomplete="off" aria-label="Message the agents"><button class="btn">Send</button></form></section>`;
  }

  function todayCard(d) {
    const p = d.plan; if (!p || !p.items || !p.items.length) return '';
    const my = me().id;
    const mine = p.items.filter(i => i.member === my || ((C.state().members || []).find(m => m.id === i.member) || {}).owner === my);
    const list = (mine.length ? mine : p.items).slice(0, 4);
    return `<section class="ad-card ad-today" id="ad-today">${head('Today', esc(p.focus || 'Today\'s plan'), 'plan', 'Open daily plan')}
      <div class="ad-rows">${list.map(i => `<div class="ad-plan ${i.accepted ? 'ok' : ''}"><span class="ad-p-ck">${i.accepted ? '✓' : '·'}</span><div><b>${esc(i.title)}</b><span>${esc(i.name || '')}</span></div></div>`).join('')}</div></section>`;
  }

  function paint(el, d) {
    const inp = el.querySelector('#talk-input'), keep = inp ? inp.value : '', focused = inp && document.activeElement === inp;
    const right = [ownersCard(d), todayCard(d)].filter(Boolean).join('');
    const left = channelCard(d);
    el.innerHTML = `<div class="ad-dash" id="ad-dash">${heroCard(d)}${needsCard(d)}${left || right ? `<div class="ad-cols ${left && right ? 'two' : ''}">${left ? `<div class="ad-col">${left}</div>` : ''}${right ? `<div class="ad-col">${right}</div>` : ''}</div>` : ''}</div>`;
    const ni = el.querySelector('#talk-input'); if (ni && keep) ni.value = keep; if (ni && focused) ni.focus({ preventScroll: true });
    const form = el.querySelector('#talk-form');
    if (form) form.onsubmit = async e => {
      e.preventDefault(); const t = el.querySelector('#talk-input').value.trim(); if (!t) return;
      try { await C.api('/agents/channel', { method: 'POST', body: { text: t } }); el.querySelector('#talk-input').value = ''; refresh(); } catch (err) { toast(err.message); }
    };
    el.onclick = e => click(e, el, d);
    el.onkeydown = e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-ad-agent]')) openAgent(e.target.dataset.adAgent); };
  }
  const refresh = () => { if (window.TribeCoord) window.TribeCoord.refresh(); };
  const side = () => { if (window.TribeCoord && window.TribeCoord.side) window.TribeCoord.side(); };
  const openAgent = id => { const S = Shell(); if (S && S.previewAgent) S.previewAgent(id); };
  // one-tap: the row goes away at once, then the dashboard refreshes from the server
  const resolve = (b, msg) => { const r = b.closest('.ad-need'); if (r) { r.classList.add('done'); setTimeout(() => r.remove(), 180); } if (msg) toast(msg); };

  async function click(e, el, d) {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const b = t.closest('button');
    const run = async fn => { if (!b) return; b.disabled = true; try { await fn(); } catch (err) { toast(err.message); b.disabled = false; } };
    if (b && (b.id === 'ad-connect' || 'adCc' in b.dataset)) return App() && App().connectClaude && App().connectClaude();
    if (b && b.id === 'ad-tools') return go('mcp-directory');
    if (b && b.dataset.adOpen) return go(b.dataset.adOpen);
    if (b && b.dataset.adMore) { if (b.dataset.adMore === 'agents') moreAgents = !moreAgents; else moreOwners = !moreOwners; return paint(el, d); }
    if (b && b.dataset.adCtl) return run(async () => { const action = b.dataset.adCtl; await C.api(`/coord/agents/${encodeURIComponent(b.dataset.id)}/control`, { method: 'POST', body: { action } }); toast(action === 'resume' ? 'Resumed' : 'Pause requested'); refresh(); side(); });
    if (b && b.dataset.adRv) return run(async () => { const v = b.dataset.adRv; await C.api(`/coord/reviews/${encodeURIComponent(b.dataset.id)}/${v}`, { method: 'POST', body: {} }); resolve(b, v === 'approve' ? 'Approved: task moved to Done' : 'Sent back to doing'); setTimeout(refresh, 300); });
    if (b && b.dataset.adTake) return run(async () => { await C.api(`/coord/handoffs/${encodeURIComponent(b.dataset.adTake)}/take`, { method: 'POST', body: {} }); resolve(b, 'It\'s yours'); setTimeout(refresh, 300); });
    if (b && b.dataset.adAp) return run(async () => { const v = b.dataset.adAp; await C.api(`/approvals/${encodeURIComponent(b.dataset.id)}/${v}`, { method: 'POST', body: {} }); resolve(b, v === 'approve' ? 'Approved' : 'Denied'); setTimeout(refresh, 3200); });
    if (b && b.hasAttribute('data-ad-sync')) return run(async () => { const r = await C.api('/coord/conflicts/sync', { method: 'POST', body: { a: b.dataset.a, b: b.dataset.b } }); cfCache.at = 0; resolve(b, `Asked ${r.asked.join(' and ')} to sync`); setTimeout(refresh, 300); });
    if (!b) { const row = t.closest('[data-ad-agent]'); if (row) openAgent(row.dataset.adAgent); }
  }
  C.on('project', () => { moreAgents = false; moreOwners = false; cfCache = { at: 0, pid: '', d: null }; });

  window.TribeAgentsDash = { render, tabs, tabExtra, plusHtml, sig, pins, pin, unpin, openMenu, closeMenu };
})();
