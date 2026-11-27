// Where the tribe runs and whether you're connected, in ONE set of words (p10, docs/ONLINE-MODES.md).
// Every place that says it reads describe(): the status line under your name (userbar.js, the one place to look and
// the one place to click), the top pill that only shows when something needs attention (healthpill.js), the hosting
// pill (hostpill.js) and the line above the message box (offlinechat.js). Same state, same words, everywhere.
//
//   key        label (short)                 when
//   demo       Demo                          the offline demo: nothing leaves this browser
//   device     Only on this device           a tribe kept in this browser (offline.js solo): friends can't join yet
//   here       On this computer              this computer runs the tribe and you're connected
//   friend     On Camp's computer            a friend's computer runs it and you're connected
//   cloud      Free cloud                    a free cloud server (Render) runs it
//   server     Always-on server              your own server that stays on (a home PC, a Pi, a VPS)
//   waking     Free cloud · waking up        connecting to a napping free cloud server (about a minute)
//   connecting Connecting…                   a moment after a drop; it retries by itself
//   offline    Offline · 3 waiting           the computer running it is off or asleep, or your network dropped
//   none       Just you for now              no tribe yet
// Messages, tasks and edits made while offline wait and send by themselves when it's back (the outbox, tribe.js).
//
// p12: the popover also holds "Your copy" (copies.js): what waits to send ("3 changes to send", or "Up to date · 2 min
// ago"), Send my changes / Get the latest, and a short history of who sent what. Both happen by themselves: on reconnect
// and every few minutes. The buttons are for people who want to do it now.
//
// Public: window.TribeStatus = { describe(input) (pure, also run under node), now(), refresh(), open(anchor), on(fn), copyLine() }
(function (root) {
  'use strict';
  const T = (s, v) => {
    let t = root.TribeI18n && root.TribeI18n.t ? root.TribeI18n.t(s, s) || s : s;
    if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]);
    return t;
  };

  // input: { hasToken, status ('online'|'connecting'|'reconnecting'|'offline'), role, meId, hostName, local (the address
  //   is this computer), cloud ('render'|'server'|''), waiting (outbox count), solo, demo, downFor (ms not online) }
  // -> { key, label, sub, tone ('live'|'warn'|'off'|'quiet'), dot }
  function describe(i) {
    i = i || {};
    const n = i.waiting | 0, host = String(i.hostName || '').split(' ')[0];
    const waitTail = n ? (n === 1 ? T('1 message waiting to send') : T('{n} messages waiting to send', { n })) : '';
    if (i.demo) return { key: 'demo', label: T('Demo'), sub: T('Nothing leaves this browser'), tone: 'quiet' };
    if (i.solo) return { key: 'device', label: T('Only on this device'), sub: T('Put it online to invite friends'), tone: 'quiet' };
    if (!i.hasToken) return { key: 'none', label: T('Just you for now'), sub: T('Start or join a tribe to work with friends'), tone: 'quiet' };
    const where = i.cloud === 'render' ? 'cloud' : i.cloud === 'server' ? 'server' : (i.role === 'host' && i.local) ? 'here' : host ? 'friend' : 'online';
    const whereLabel = { cloud: T('Free cloud'), server: T('Always-on server'), here: T('On this computer'), friend: T("On {name}'s computer", { name: host }), online: T('Online') }[where];
    if (i.status === 'online') {
      const sub = n ? T('Sending {n}…', { n }) : where === 'cloud' ? T('Online when your computer is off. It naps when nobody is there') : where === 'here' ? T('Friends can join while this computer is on') : where === 'friend' ? T('Connected') : T('Connected');
      return { key: where === 'online' ? 'friend' : where, label: whereLabel, sub, tone: 'live' };
    }
    if (i.status === 'connecting' || i.status === 'reconnecting') {
      if (where === 'cloud' && (i.downFor | 0) > 8000) return { key: 'waking', label: T('Free cloud · waking up'), sub: T('A napping free server takes about a minute. Keep working: changes wait and send'), tone: 'warn' };
      if ((i.downFor | 0) <= 8000) return { key: 'connecting', label: T('Connecting…'), sub: waitTail || T('It tries again by itself'), tone: 'warn' };
    }
    const label = n ? T('Offline · {n} waiting', { n }) : T('Offline');
    // a server that runs the tribe (free cloud, your own) is never "Camp's computer"
    const who = where === 'cloud' ? T('The free cloud server isn’t answering') : where === 'server' ? T('Your server isn’t answering')
      : i.role === 'host' || !host || where === 'here' ? T('Your tribe can’t be reached right now') : T("{name}'s computer is off or asleep", { name: host });
    return { key: 'offline', label, sub: `${who}. ${n ? T('They send when it’s back') : T('Keep working: changes send when it’s back')}`, tone: 'off', who };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { describe }; return; }

  // ---------- live ----------
  const C = () => root.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cloud = '', since = Date.now(), last = '', listeners = [];
  const isLocalAddr = () => {
    try {
      const c = C(); const h = new URL(c.base()).hostname;
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h) || /(^|\.)tauri\.localhost$/i.test(location.hostname);
    } catch { return false; }
  };
  async function learnCloud() {
    const c = C(); if (!c || !c.connected || !c.connected()) return;
    try {
      const h = await c.api('/health'), host = (() => { try { return new URL(c.base()).hostname; } catch { return ''; } })();
      cloud = /\.onrender\.com$/i.test(host) ? 'render' : h && h.cloud && !isLocalAddr() ? 'server' : '';
      refresh();
    } catch {}
  }
  function input() {
    const c = C() || {}, s = (c.state && c.state()) || {}, me = s.me || {}, O = root.TribeOffline;
    const demo = !!(O && O.active && O.active() && !(O.solo && O.solo()));
    const solo = !!(O && O.solo && O.solo());
    const hostM = (s.members || []).find(m => m.role === 'host');
    if (/onrender\.com/i.test((() => { try { return new URL(c.base()).hostname; } catch { return ''; } })())) cloud = 'render';
    return {
      hasToken: !!(c.hasToken && c.hasToken()) && !(O && O.asleep && O.asleep()),
      status: s.status || (c.connected && c.connected() ? 'online' : 'offline'),
      role: me.role, meId: me.id, hostName: hostM && hostM.id !== me.id ? hostM.name : '',
      local: isLocalAddr(), cloud, waiting: c.outbox ? c.outbox().length : 0, solo, demo, downFor: Date.now() - since,
    };
  }
  const now = () => describe(input());
  function refresh() {
    const d = now(), sig = d.key + '|' + d.label + '|' + d.sub;
    document.body && (document.body.dataset.tribeState = d.key);
    if (sig !== last) { last = sig; listeners.forEach(fn => { try { fn(d); } catch {} }); }
    return d;
  }
  const on = fn => { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; };

  // ---------- your copy: send my changes, get the latest (copies.js) ----------
  const CP = () => root.TribeCopies;
  const agoWords = t => { const s = Math.max(0, (Date.now() - t) / 1000); if (s < 45) return T('just now'); if (s < 3600) return T('{n} min ago', { n: Math.max(1, Math.round(s / 60)) }); if (s < 86400) return T('{n} h ago', { n: Math.round(s / 3600) }); return T('{n} days ago', { n: Math.round(s / 86400) }); };
  function copyLine() {
    const cp = CP(); if (!cp) return { n: 0, text: '' };
    const n = cp.pending().length, last = cp.lastContact();
    if (n) return { n, text: n === 1 ? T('1 change to send') : T('{n} changes to send', { n }) };
    return { n: 0, text: last ? T('Up to date · {when}', { when: agoWords(last) }) : T('Up to date') };
  }
  const WHAT = { website: 'the website', app: 'the app', doc: 'a doc', task: 'a task' };
  async function drawHistory(ul) {
    const cp = CP(); if (!cp || !ul) return;
    const log = await cp.history(); if (!ul.isConnected) return;
    ul.innerHTML = log.length ? log.slice(0, 6).map(e => `<li><b>${esc(String(e.name || '').split(' ')[0])}</b> ${esc(e.n > 1 ? T('sent {n} changes to {what}', { n: e.n, what: T(WHAT[e.what] || e.what) }) : T('sent a change to {what}', { what: T(WHAT[e.what] || e.what) }))} <span class="faint">· ${esc(agoWords(e.at))}</span></li>`).join('')
      : `<li class="faint">${esc(T('Nothing sent yet.'))}</li>`;
  }
  function copySection(d) {
    if (!CP() || d.key === 'demo' || d.key === 'device' || d.key === 'none' || d.key === 'here') return '';   // p13: on the tribe's own computer there is no second copy to send or get
    const L = copyLine();
    return `<section class="ts-copy" id="ts-copy" aria-label="${esc(T('Your copy'))}"><span class="eyebrow">${esc(T('Your copy'))}</span>
      <p class="ts-copy-line" id="ts-copy-line" data-n="${L.n}">${esc(L.text)}</p>
      <div class="ts-acts"><button type="button" class="btn" data-tsc="send"${L.n ? '' : ' disabled'}>${esc(T('Send my changes'))}</button><button type="button" class="btn" data-tsc="get">${esc(T('Get the latest'))}</button></div>
      <p class="ts-note">${esc(T('This device keeps a copy you can read and change offline. It sends and gets by itself; the buttons do it now.'))}</p>
      <details class="ts-hist"><summary>${esc(T('Who sent what'))}</summary><ul id="ts-hist"></ul></details></section>`;
  }
  async function copyAct(k, btn) {
    const cp = CP(), line = pop && pop.querySelector('#ts-copy-line'); if (!cp) return;
    const was = btn.textContent; btn.disabled = true; btn.textContent = k === 'send' ? T('Sending…') : T('Getting…');
    let ok = true;
    try { if (k === 'send') { const left = await cp.send(); ok = !left; } else ok = await cp.get(); } catch { ok = false; }
    btn.textContent = was; btn.disabled = false;
    if (line && line.isConnected) {
      const L = copyLine(); line.dataset.n = L.n;
      line.textContent = ok ? L.text : (k === 'send' ? T('Couldn’t send yet. It goes by itself when the tribe is back.') : T('Couldn’t reach the tribe. You’re seeing this device’s copy.'));
      const s = pop.querySelector('[data-tsc="send"]'); if (s) s.disabled = !L.n;
      drawHistory(pop.querySelector('#ts-hist'));
    }
    refresh();
  }

  // ---------- the popover: what it means and the one or two things to do ----------
  let pop = null;
  function close() { if (pop) { pop.remove(); pop = null; document.removeEventListener('click', outside, true); document.removeEventListener('keydown', onKey, true); } }
  const outside = e => { if (pop && !pop.contains(e.target) && !(pop._anchor && pop._anchor.contains(e.target))) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function open(anchor) {
    if (pop) return close();
    const d = now(), c = C() || {}, mine = d.key === 'here';
    const acts = [];
    if (d.tone === 'off' || d.tone === 'warn') acts.push(['retry', T('Try again now'), true]);
    if (d.key === 'device' || d.key === 'demo') acts.push(['online', T('Put it online'), true]);
    if (d.tone === 'live') acts.push(['invite', T('Invite a friend'), !mine]);
    if (d.key !== 'demo' && d.key !== 'device' && d.key !== 'none') acts.push(['net', T("How we're connected"), false]);   // p13: the one picture (netmap.js)
    acts.push(['where', T('Where it lives'), false]);
    if (mine && root.TribeHostPill && root.TribeHostPill.open) acts.push(['host', T('Who can reach you'), false]);
    acts.push(['server', T('Run your own server'), false]);
    pop = document.createElement('div'); pop.className = 'ts-pop'; pop.id = 'ts-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', T('Where your tribe runs'));
    pop._anchor = anchor;
    pop.innerHTML = `<header><span class="ts-dot" data-tone="${d.tone}" aria-hidden="true"></span><div><span class="eyebrow">${esc(T('Your tribe'))}</span><b>${esc(d.label)}</b></div></header>
      <p class="ts-sub">${esc(d.sub)}</p>
      ${d.tone !== 'quiet' ? `<p class="ts-note">${esc(T('Messages, tasks and edits never need a mode switch: made offline, they wait and send by themselves.'))}</p>` : ''}
      <div class="ts-acts">${acts.map(([k, t, p]) => `<button type="button" class="btn${p ? ' primary' : ''}" data-ts="${k}">${esc(t)}</button>`).join('')}</div>${copySection(d)}`;
    document.body.appendChild(pop);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 16, top: 60, bottom: 60, width: 0 };
    const w = Math.min(320, innerWidth - 24), left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
    pop.style.width = w + 'px'; pop.style.left = left + 'px';
    const below = r.bottom + 8, h = pop.offsetHeight;
    pop.style.top = (below + h > innerHeight - 8 ? Math.max(8, r.top - h - 8) : below) + 'px';
    pop.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => act(b.dataset.ts, anchor));
    pop.querySelectorAll('[data-tsc]').forEach(b => b.onclick = () => copyAct(b.dataset.tsc, b));
    const hist = pop.querySelector('.ts-hist'); if (hist) hist.addEventListener('toggle', () => { if (hist.open) drawHistory(pop && pop.querySelector('#ts-hist')); });
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', onKey, true); }, 0);
    const first = pop.querySelector('[data-ts]'); if (first) first.focus();
  }
  function act(k, anchor) {
    const c = C() || {};
    close();
    if (k === 'retry') { if (c.flush) c.flush(); if (c.connect && !(c.connected && c.connected())) c.connect(); since = Date.now() - 1; refresh(); if (root.TribeApp && root.TribeApp.toast) root.TribeApp.toast(T('Trying again…')); return; }
    if (k === 'invite') return root.TribeInvite ? root.TribeInvite.open() : root.TribeApp && root.TribeApp.openInvite && root.TribeApp.openInvite();
    if (k === 'online') return root.TribeShare && root.TribeShare.online ? root.TribeShare.online('friends') : root.TribeWhere && root.TribeWhere.open && root.TribeWhere.open();
    if (k === 'net') return root.TribeNetMap && root.TribeNetMap.open();
    if (k === 'where') return root.TribeWhere && root.TribeWhere.open ? root.TribeWhere.open() : null;
    if (k === 'host') return root.TribeHostPill && root.TribeHostPill.open();
    if (k === 'server') return root.TribeOwnServer && root.TribeOwnServer.open ? root.TribeOwnServer.open() : root.TribeSettings && root.TribeSettings.open && root.TribeSettings.open('projects');
  }

  function boot() {
    const c = C(); if (!c || !c.on) return setTimeout(boot, 200);
    let prev = '';
    c.on('status', s => {
      const st = (s && s.status) || 'offline';
      if ((st === 'online') !== (prev === 'online')) since = Date.now();   // downFor counts from the moment it stopped being online
      const back = st === 'online' && prev && prev !== 'online';
      prev = st; if (st === 'online') learnCloud(); refresh();
      if (back && CP()) setTimeout(() => { CP().send().catch(() => {}); CP().get().catch(() => {}); }, 800);   // p12: back online: send what waited, get the latest
    });
    // p12: the copy stays fresh by itself while connected (and the editors follow live in between)
    setInterval(() => { if (CP() && input().status === 'online' && document.visibilityState === 'visible') CP().get().catch(() => {}); }, 10 * 60 * 1000);
    c.on('outbox', refresh); c.on('presence', refresh); c.on('hello', () => { learnCloud(); refresh(); });
    setInterval(() => { if (input().status !== 'online') refresh(); }, 3000);
    learnCloud(); refresh();
  }
  root.TribeStatus = { describe, now, refresh, open, close, on, copyLine };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
