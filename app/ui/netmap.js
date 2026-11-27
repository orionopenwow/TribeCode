// Your network (p13, docs/ONLINE-MODES.md): one picture of how everyone is connected.
// The tribe's computer in the middle, each person around it with one plain label:
//   This computer · Same Wi-Fi · Private link (Tailscale) · Internet link · Waiting to connect · Offline · has a copy
// Under it, three plain sentences (where the tribe meets, who can reach it, what happens when that computer is off) and
// one button per fix ("Turn on the internet link", "Fix it", "Try again now"). Opened from the status line's card
// (tribestatus.js), the hosting pill (hostpill.js), and Settings › Where your tribe runs.
// Reads GET /api/network (server/network.js). The last answer is kept on this device, so the picture still draws when
// the tribe's computer is off (everyone shows as offline then).
//   window.TribeNetMap = { open(), close(), label(person), sentences(data, opts) }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, v) => { let t = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const icon = (n, s) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, s || 16) : '');
  const first = n => String(n || '').split(' ')[0];
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?');
  const KEY = () => { try { return 'tribecode.netmap:' + C().base(); } catch { return 'tribecode.netmap'; } };
  const keep = d => { try { localStorage.setItem(KEY(), JSON.stringify(d)); } catch {} };
  const kept = () => { try { return JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch { return null; } };

  // one label per person; kind drives the line style and colour
  const LABEL = { here: 'This computer', wifi: 'Same Wi-Fi', tailscale: 'Private link (Tailscale)', internet: 'Internet link', waiting: 'Waiting to connect', copy: 'Offline · has a copy' };
  function kindOf(p, off) {
    if (p.waiting) return 'waiting';
    if (!off && p.online) return p.via || 'here';
    return p.hasCopy ? 'copy' : 'waiting';
  }
  const label = (p, off) => T(LABEL[kindOf(p, off)]);

  // the plain sentences under the picture (pure; the test reads them too)
  function sentences(d, o) {
    o = o || {};
    const owner = d.tribe && d.tribe.ownerName, mine = !!o.mine;
    const where = d.tribe && d.tribe.place === 'server' ? T('Your tribe meets on an always-on server, and everyone keeps a copy on their own device.')
      : mine ? T('Your tribe meets on this computer, and everyone keeps a copy on their own device.')
      : owner ? T("Your tribe meets on {name}'s computer, and everyone keeps a copy on their own device.", { name: first(owner) })
      : T('Your tribe meets on one computer, and everyone keeps a copy on their own device.');
    const r = d.reach || {}, ways = [];
    if (r.wifi) ways.push(T('friends on the same Wi-Fi'));
    if (r.tailscale) ways.push(T('friends on your private link (Tailscale)'));
    if (r.internet) ways.push(T('anyone with an invite, from anywhere'));
    let who = ways.length ? T('Who can reach it: {list}.', { list: ways.join(', ') }) : T('Right now only this computer can reach it.');
    if (!r.internet) who += ' ' + (d.canFix && d.canFix.internet ? T('Friends somewhere else need the internet link.') : owner ? T('Friends somewhere else need {name} to turn on the internet link.', { name: first(owner) }) : '');
    const off = (d.tribe && d.tribe.place === 'server' ? T('If it ever goes off, friends keep working on their copy and catch up when it is back.') : T('When that computer is off, friends keep working on their copy and catch up when it is back.'))
      + (d.backup ? ' ' + T('The backup on GitHub lets them get the latest even then.') : '');
    return [where, who.trim(), off];
  }

  // ---------- the picture ----------
  function diagram(d, off) {
    const people = d.people || [];
    const waiting = (d.waiting || []).filter(w => !people.some(p => p.id === w.to && p.online)).map(w => ({ id: 'w-' + w.id, name: w.toName, waiting: true, color: '' }));
    const all = [...people, ...waiting.filter(w => !people.some(p => p.name === w.name && p.online))];
    const MAX = 8, shown = all.slice(0, MAX), more = all.length - shown.length;
    const n = shown.length + (more > 0 ? 1 : 0);
    const center = d.tribe && d.tribe.place === 'server' ? T('Always-on server') : d.mineHost ? T('This computer') : d.tribe && d.tribe.ownerName ? T("{name}'s computer", { name: first(d.tribe.ownerName) }) : T("The tribe's computer");
    const pos = i => { const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2; return { x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 36 }; };
    const lines = shown.map((p, i) => { const q = pos(i), k = kindOf(p, off); return `<line x1="50" y1="50" x2="${q.x.toFixed(2)}" y2="${q.y.toFixed(2)}" class="nm-ln" data-k="${k}" vector-effect="non-scaling-stroke"/>`; }).join('');
    const nodes = shown.map((p, i) => {
      const q = pos(i), k = kindOf(p, off);
      const face = p.avatar && p.avatar.kind === 'emoji' && p.avatar.emoji ? esc(p.avatar.emoji) : esc(initials(p.name));
      return `<div class="nm-node" data-k="${k}" data-id="${esc(p.id)}" style="left:${q.x.toFixed(2)}%;top:${q.y.toFixed(2)}%">
        <span class="nm-face"${p.color ? ` style="background:${esc(p.color)}"` : ''}>${face}</span>
        <span class="nm-name">${esc(p.me ? T('You') : first(p.name))}</span><span class="nm-lab">${esc(label(p, off))}</span></div>`;
    }).join('') + (more > 0 ? (() => { const q = pos(shown.length); return `<div class="nm-node nm-more" style="left:${q.x.toFixed(2)}%;top:${q.y.toFixed(2)}%"><span class="nm-face">+${more}</span><span class="nm-name">${esc(T('More'))}</span></div>`; })() : '');
    return `<div class="nm-map" role="img" aria-label="${esc(T('How everyone reaches the tribe'))}">
      <svg class="nm-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      <div class="nm-hub" data-off="${off ? 1 : 0}"><span class="nm-hub-ico">${icon('monitor', 22) || icon('home', 22)}</span><b>${esc(center)}</b><small>${esc(off ? T('Off right now') : T('On'))}</small></div>
      ${nodes}</div>
      <ul class="nm-key" aria-label="${esc(T('What the lines mean'))}">${['here', 'wifi', 'tailscale', 'internet', 'copy', 'waiting'].filter(k => shown.some(p => kindOf(p, off) === k)).map(k => `<li data-k="${k}"><i aria-hidden="true"></i>${esc(T(LABEL[k]))}</li>`).join('')}</ul>`;
  }

  let sh = null, busy = false;
  function draw(d, off, note) {
    if (!sh) return;
    const c = C(), me = (c && c.state && c.state().me) || {};
    const local = (() => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(c.base()).hostname) || /(^|\.)tauri\.localhost$/i.test(location.hostname); } catch { return false; } })();
    d.mineHost = me.role === 'host' && local && !(d.tribe && d.tribe.place === 'server');
    const [s1, s2, s3] = sentences(d, { mine: d.mineHost });
    const fixes = [];
    if (off) fixes.push(['retry', T('Try again now'), true]);
    else if (!(d.reach || {}).internet && d.canFix && d.canFix.internet) fixes.push(['internet', T('Turn on the internet link'), true]);
    if (note) fixes.push(['fix', T('Fix it'), !fixes.length]);
    sh.body.innerHTML = `<div class="nm" id="nm">
      ${off ? `<p class="nm-off" role="status"><span class="ts-dot" data-tone="off" aria-hidden="true"></span>${esc(T("The tribe's computer is off right now. You're seeing the last picture."))}</p>` : ''}
      ${diagram(d, off)}
      <div class="nm-say">${[s1, s2, s3].map((s, i) => `<p data-nm-s="${i}">${esc(s)}</p>`).join('')}</div>
      ${note ? `<p class="nm-note" role="status">${esc(note)}</p>` : ''}
      <div class="nm-acts">${fixes.map(([k, t, p]) => `<button type="button" class="btn${p ? ' primary' : ''}" data-nm="${k}">${esc(t)}</button>`).join('')}
        ${me.role && me.role !== 'spectator' && me.role !== 'agent' && !off ? `<button type="button" class="btn" data-nm="invite">${esc(T('Invite a friend'))}</button>` : ''}</div>
    </div>`;
    sh.body.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => act(b.dataset.nm, b));
  }
  async function load(note) {
    const c = C();
    if (!c || !c.api) return;
    const online = c.connected && c.connected();
    try {
      if (!online) throw new Error('off');
      const d = await c.api('/network'); keep(d); draw(d, false, note);
    } catch {
      const d = kept() || { tribe: {}, reach: {}, people: [], waiting: [] };
      draw(d, true, note);
    }
  }
  async function act(k, btn) {
    const c = C();
    if (k === 'retry') { if (c.connect && !(c.connected && c.connected())) c.connect(); toast(T('Trying again…')); setTimeout(() => load(), 1500); return; }
    if (k === 'invite') { close(); return window.TribeInvite ? window.TribeInvite.open() : null; }
    if (k === 'fix') { close(); return window.TribeSettings && window.TribeSettings.open ? window.TribeSettings.open('admin', 'set-host') : window.TribeOwnServer && window.TribeOwnServer.open(); }
    if (k === 'internet') {
      if (busy) return; busy = true; btn.disabled = true; btn.textContent = T('Turning it on…');
      try {
        const r = await c.api('/share/public', { method: 'POST', body: {} });
        if (r && r.approveUrl) try { window.open(r.approveUrl, '_blank', 'noopener'); } catch {}
        busy = false;
        if (r && r.status === 'on') { toast(T('The internet link is on.')); return load(); }
        return load(r && r.status === 'starting' ? T('Starting the internet link…') : T("The internet link didn't start. {why}", { why: (r && r.message) || '' }).trim());
      } catch (e) { busy = false; return load(T("The internet link didn't start. {why}", { why: e.message || '' }).trim()); }
    }
  }
  function open() {
    const UI = window.TribeUI; if (!UI || !UI.sheet) return;
    if (sh) sh.close();
    sh = UI.sheet({ id: 'nm-sheet', wide: true, eyebrow: 'Your network', title: "How we're connected", body: `<div class="nm"><p class="faint">${esc(T('Loading…'))}</p></div>`, onClose: () => { sh = null; } });
    load();
  }
  function close() { if (sh) sh.close(); }
  if (C() && C().on) ['presence', 'status'].forEach(ev => C().on(ev, () => { if (sh && !busy) load(); }));
  window.TribeNetMap = { open, close, label, sentences, kindOf };
})();
