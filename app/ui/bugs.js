// Bug inbox: one-key capture (Ctrl+Shift+B), automatic crash reports, triage chips,
// duplicate merging and bug -> task (resolves itself when the task is done).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const recent = [];                                   // recent console errors for bug reports
  let bugs = [], loaded = false, autoSent = 0, filter = 'open';

  const push = line => { recent.push(`${new Date().toISOString().slice(11, 19)} ${line}`); if (recent.length > 30) recent.shift(); };
  const origErr = console.error.bind(console);
  console.error = (...a) => { push(a.map(x => (x && x.stack) || String(x)).join(' ')); origErr(...a); };
  addEventListener('error', e => { push(`${e.message} @ ${e.filename}:${e.lineno}`); autoReport(e.message, e.error && e.error.stack); });
  addEventListener('unhandledrejection', e => { const r = e.reason || {}; push(`unhandled: ${r.message || r}`); autoReport(String(r.message || r), r.stack); });

  function autoReport(msg, stack) {
    if (!C.connected() || autoSent >= 3 || /ResizeObserver|Script error/.test(msg)) return;   // never spam the inbox
    autoSent++;
    C.api('/bugs', { method: 'POST', body: { title: `Crash: ${String(msg).slice(0, 120)}`, details: 'Reported automatically by TribeCode.', logs: [stack || '', ...recent.slice(-10)].join('\n'), view: currentView(), version: window.TribeUpdater ? window.TribeUpdater.current() : '', auto: true } }).catch(() => {});
  }
  const currentView = () => (document.querySelector('.titlebar .faint') || {}).textContent || '';

  async function load() {
    if (!C.connected()) { $('#bug-list').innerHTML = '<div class="prop-empty">The bug inbox is shared, so it needs a tribe. Press <span class="kbd">Ctrl Shift B</span> any time to report a bug.</div>'; return; }
    try { bugs = (await C.api('/bugs')).bugs; loaded = true; render(); } catch (e) { window.TribeApp.toast(e.message); }
  }

  const sevChip = s => `<span class="chip sev-${s}">${s}</span>`;
  function render() {
    document.querySelectorAll('[data-bf]').forEach(b => b.classList.toggle('on', b.dataset.bf === filter));
    const list = bugs.filter(b => (filter === 'open' ? !['resolved', 'wontfix'].includes(b.status) : ['resolved', 'wontfix'].includes(b.status)));
    const open = bugs.filter(b => !['resolved', 'wontfix'].includes(b.status)).length;
    $('#bugs-sub').textContent = `${open} open · most urgent first`;
    $('#bug-list').innerHTML = list.length ? list.map(b => `<div class="bug" data-bid="${esc(b.id)}">
        <div class="top">${sevChip(b.severity)}<span class="chip">${esc(b.area)}</span>${b.status === 'new' ? '<span class="chip amber">sorting…</span>' : ''}${b.count > 1 ? `<span class="chip ember">seen ${b.count}×</span>` : ''}${b.auto ? '<span class="chip">auto</span>' : ''}${b.status === 'resolved' ? '<span class="chip teal">resolved</span>' : ''}</div>
        <h3>${esc(b.title)}</h3>
        <details><summary class="faint">Details</summary><div class="md">${window.TribeMD.render(b.body || '')}</div></details>
        <div class="row">${b.task ? `<span class="faint">Linked task · resolves when it's done</span>` : b.status !== 'resolved' ? '<button class="btn" data-mk>Make it a task</button>' : ''}
          <span style="flex:1"></span>
          <select data-sev title="Severity">${['critical', 'high', 'normal', 'low'].map(s => `<option ${s === b.severity ? 'selected' : ''}>${s}</option>`).join('')}</select>
          ${b.status !== 'resolved' ? '<button class="btn ghost" data-res>Mark resolved</button>' : '<button class="btn ghost" data-reopen>Reopen</button>'}</div>
      </div>`).join('') : `<div class="prop-empty">${filter === 'open' ? 'No open bugs. 🎉' : 'Nothing resolved yet.'}</div>`;
    document.querySelectorAll('.bug').forEach(el => {
      const bid = el.dataset.bid;
      const mk = el.querySelector('[data-mk]'); if (mk) mk.onclick = async () => { try { await C.api(`/bugs/${bid}/task`, { method: 'POST' }); window.TribeApp.toast('Task created in Backlog'); load(); } catch (e) { window.TribeApp.toast(e.message); } };
      el.querySelector('[data-sev]').onchange = e => patch(bid, { severity: e.target.value });
      const r = el.querySelector('[data-res]'); if (r) r.onclick = () => patch(bid, { status: 'resolved' });
      const ro = el.querySelector('[data-reopen]'); if (ro) ro.onclick = () => patch(bid, { status: 'triaged' });
    });
  }
  async function patch(bid, body) { try { await C.api('/bugs/' + bid, { method: 'PATCH', body }); } catch (e) { window.TribeApp.toast(e.message); } }

  function capture() {
    const body = $('#invite-body');
    body.innerHTML = `<h2>Report a bug</h2><p class="lead">We'll attach where you were, the app version and the last few errors. Similar reports are merged automatically.</p>
      <div class="field"><label for="bug-title">What went wrong?</label><input class="input" id="bug-title" maxlength="160" placeholder="e.g. Dragging a task to Done doesn't stick"></div>
      <div class="field"><label for="bug-details">Steps or details (optional)</label><textarea class="input" id="bug-details" style="height:110px;font-family:var(--font)"></textarea></div>
      <div class="faint" style="font-size:12px">Attached: ${esc(currentView() || 'Home')} · v${esc(window.TribeUpdater ? window.TribeUpdater.current() : '')} · ${recent.length} log line${recent.length === 1 ? '' : 's'}</div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="bug-go">Send report</button></div>`;
    $('#invite-modal').classList.remove('hidden'); $('#bug-title').focus();
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#bug-go').onclick = async () => {
      const title = $('#bug-title').value.trim(); if (!title) return $('#bug-title').focus();
      if (!C.connected()) { window.TribeApp.toast('Connect to a tribe to send bug reports.'); return; }
      $('#bug-go').disabled = true;
      try {
        const r = await C.api('/bugs', { method: 'POST', body: { title, details: $('#bug-details').value, logs: recent.join('\n'), view: currentView(), version: window.TribeUpdater ? window.TribeUpdater.current() : '' } });
        $('#invite-modal').classList.add('hidden');
        window.TribeApp.toast(r.merged ? `Thanks! Merged with an existing report (seen ${r.bug.count}×).` : 'Thanks! Bug reported and sorted into the inbox.');
        if (loaded) load();
      } catch (e) { window.TribeApp.toast(e.message); $('#bug-go').disabled = false; }
    };
  }

  function upsert(b) { const i = bugs.findIndex(x => x.id === b.id); if (i >= 0) bugs[i] = b; else bugs.unshift(b); render(); }
  C.on('bug', b => { if (loaded) upsert(b); });
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); capture(); } });
  document.addEventListener('click', e => { const f = e.target.closest('[data-bf]'); if (f) { filter = f.dataset.bf; render(); } if (e.target.closest('#bug-new')) capture(); });

  window.TribeBugs = { load, capture };
})();
