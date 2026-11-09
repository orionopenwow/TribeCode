// The health pill: quiet when all is well, there when it matters. Reconnecting, waking up, offline, or messages waiting in
// the outbox show as a small pill (top bar on a computer, a chip at the top on phones). Tap it to try again now.
//   window.TribeHealth = { refresh() }
(function () {
  'use strict';
  const C = () => window.TribeClient; if (!C() || !C().on) return;
  const pill = document.createElement('button');
  pill.id = 'health-pill'; pill.className = 'health-pill hidden'; pill.type = 'button'; pill.setAttribute('aria-live', 'polite');
  const crumbs = document.querySelector('#crumbs');
  if (crumbs && !matchMedia('(max-width: 820px)').matches) crumbs.parentNode.insertBefore(pill, crumbs); else document.body.appendChild(pill);
  let status = 'offline', since = Date.now(), timer = null;
  function paint() {
    const c = C(), waiting = c.outbox ? c.outbox().length : 0, has = c.hasToken && c.hasToken();
    let kind = '', text = '';
    if (!has) { pill.classList.add('hidden'); return; }
    if (status === 'online' && waiting) { kind = 'warn'; text = `${waiting} waiting to send`; }
    else if (status === 'reconnecting' || status === 'connecting') { kind = 'warn'; text = Date.now() - since > 8000 ? 'Waking up the tribe…' : 'Reconnecting…'; }
    else if (status === 'offline') { kind = 'off'; text = waiting ? `Offline · ${waiting} waiting` : 'Offline'; }
    pill.className = `health-pill ${kind}${text ? '' : ' hidden'}`;
    pill.innerHTML = text ? `<span class="hl-dot" aria-hidden="true"></span><span>${text}</span>` : '';
    pill.title = text ? 'Tap to try again now' : '';
  }
  pill.onclick = () => { const c = C(); if (c.flush) c.flush(); if (!c.connected() && c.connect) c.connect(); pill.classList.add('tap'); setTimeout(() => pill.classList.remove('tap'), 300); };
  C().on('status', s => { if (s.status !== status) { status = s.status; since = Date.now(); } paint(); clearInterval(timer); if (status !== 'online') timer = setInterval(paint, 3000); });
  C().on('outbox', paint);
  addEventListener('online', () => { status = (C().state() || {}).status || status; paint(); setTimeout(() => { status = (C().state() || {}).status || status; paint(); }, 1500); });
  addEventListener('offline', () => { status = 'offline'; paint(); });
  window.TribeHealth = { refresh: paint };
})();
