// Jam mode (v0.27): a game jam inside the tribe (server/jam.js). While a jam runs, everyone sees a slim countdown banner;
// it opens the jam board: theme, rules, time left, entries with their play links, "Join the jam" (a new project from the
// game starter), "Submit this project" (it must be published first: opens Publish), then voting (one vote each, never
// your own) and the results card. The host starts a jam from Ctrl K ("Start a jam") or the board.
// Public: window.TribeJam = { open(), start(), status() }.
(function () {
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const FLAG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
  let S = null, tick = 0, openBoard = null;

  const left = ms => { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`; };
  const until = j => Date.parse(j.phase === 'live' ? j.end : j.voteEnd) - Date.now();

  async function load() { try { S = await C.api('/jam'); } catch { S = null; } banner(); if (openBoard) openBoard(); return S; }

  // ---------- the banner ----------
  function banner() {
    let b = document.getElementById('jam-banner');
    const j = S && S.jam;
    if (!j || (j.phase === 'done' && Date.now() - Date.parse(j.voteEnd) > 6 * 3600_000)) { if (b) b.remove(); document.body.classList.remove('has-jam'); return; }
    if (!b) { b = document.createElement('div'); b.id = 'jam-banner'; b.className = 'jam-banner'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    document.body.classList.add('has-jam');
    const what = j.phase === 'live' ? 'Jam' : j.phase === 'voting' ? 'Voting' : 'Jam results';
    b.innerHTML = `<span class="jam-banner__i">${FLAG}</span><b>${what}:</b><span class="jam-banner__th">${esc(j.theme)}</span>${j.phase !== 'done' ? `<span class="jam-banner__t mono" id="jam-left">${left(until(j))}</span>` : j.winner ? `<span class="jam-banner__t">🏆 ${esc(j.winner.title)}</span>` : ''}<button type="button" class="jam-banner__go" id="jam-open">${j.phase === 'voting' ? 'Vote' : j.phase === 'done' ? 'See results' : 'Open'}</button>`;
    $('#jam-open').onclick = open;
    clearInterval(tick);
    if (j.phase !== 'done') tick = setInterval(() => { const el = document.getElementById('jam-left'); if (!el) return clearInterval(tick); const ms = until(j); el.textContent = left(ms); if (ms <= 0) { clearInterval(tick); setTimeout(load, 1200); } }, 1000);
  }

  // ---------- the board ----------
  function sheet(html) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return null;
    body.classList.add('jam-sheet'); body.innerHTML = html; m.classList.remove('hidden');
    if (!m._jamWatch) { m._jamWatch = true; new MutationObserver(() => { if (m.classList.contains('hidden')) { body.classList.remove('jam-sheet'); openBoard = null; } }).observe(m, { attributes: true, attributeFilter: ['class'] }); }
    const close = () => { m.classList.add('hidden'); body.classList.remove('jam-sheet'); openBoard = null; };
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    return { body, close };
  }
  async function open() {
    if (!S) await load();
    const draw = () => {
      const j = S && S.jam, myId = (C.state().me || {}).id, pid = C.project && C.project();
      if (!j) {
        const s = sheet(`<p class="eyebrow">Jam</p><h2 class="jam-h">No jam right now</h2><p class="faint">${S && S.canRun ? 'Start one: pick a theme and how long. Everyone gets a countdown, starts from a starter, and votes at the end.' : 'When the host starts one, a countdown shows at the top of the app.'}</p>
          <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Close</button>${S && S.canRun ? '<button class="btn primary" id="jam-new">Start a jam</button>' : ''}</div>`);
        if (s && $('#jam-new')) $('#jam-new').onclick = start;
        return;
      }
      const mine = new Set(S.mine || []), entered = pid && j.entries.some(e => e.project === pid);
      const card = e => `<li class="jam-e${j.phase === 'done' && j.winner && e.project === j.winner.project ? ' is-win' : ''}">
          <div class="jam-e__pic">${e.card ? `<img src="${esc(e.card)}" alt="">` : `<span aria-hidden="true">🎮</span>`}</div>
          <div class="jam-e__t"><b>${esc(e.title)}</b><small>by ${esc(e.byName)}</small>${j.phase === 'done' ? `<span class="jam-e__v">${e.votes} vote${e.votes === 1 ? '' : 's'}</span>` : ''}</div>
          <div class="jam-e__a">${e.url ? `<a class="btn sm" href="${esc(e.url)}" target="_blank" rel="noopener">Play</a>` : ''}
            ${j.phase === 'voting' && e.by !== myId && (C.state().me || {}).role !== 'agent' ? `<button class="btn sm ${j.myVote === e.project ? 'primary' : ''}" data-vote="${esc(e.project)}" aria-pressed="${j.myVote === e.project}">${j.myVote === e.project ? 'Voted ✓' : 'Vote'}</button>` : ''}
            ${j.phase === 'voting' && e.by === myId ? '<span class="faint jam-own">Yours</span>' : ''}</div></li>`;
      const head = j.phase === 'live' ? `Ends in <b class="mono" id="jam-left2">${left(until(j))}</b>` : j.phase === 'voting' ? `Voting closes in <b class="mono" id="jam-left2">${left(until(j))}</b> · ${j.voters} voted` : 'The jam is over.';
      const s = sheet(`<p class="eyebrow">Jam · started by ${esc(j.byName)}</p><h2 class="jam-h">${esc(j.theme)}</h2><p class="jam-meta">${head}</p>${j.rules ? `<p class="jam-rules">${esc(j.rules)}</p>` : ''}
        ${j.phase === 'done' && j.winner ? `<div class="jam-win"><span aria-hidden="true">🏆</span><div><small class="eyebrow">Winner</small><b>${esc(j.winner.title)}</b><span>by ${esc(j.winner.byName)} · ${j.winner.votes} vote${j.winner.votes === 1 ? '' : 's'}</span></div>${j.winner.url ? `<a class="btn sm primary" href="${esc(j.winner.url)}" target="_blank" rel="noopener">Play it</a>` : ''}</div>` : ''}
        ${j.phase === 'live' ? `<div class="jam-acts"><button class="btn primary" id="jam-join">${FLAG} Join the jam</button>${pid && !entered ? '<button class="btn" id="jam-submit">Submit this project</button>' : entered ? '<button class="btn" id="jam-submit">Update my entry</button>' : ''}</div>` : ''}
        <p class="eyebrow jam-eh">Entries · ${j.entries.length}</p>
        ${j.entries.length ? `<ul class="jam-list">${j.entries.map(card).join('')}</ul>` : `<p class="faint jam-empty">No entries yet. Join, build, publish, then submit.</p>`}
        <div class="modal-foot">${S.canRun && j.phase !== 'done' ? `<button class="linkish" id="jam-end">${j.phase === 'live' ? 'End now and start voting' : 'Close voting'}</button>` : ''}${S.canRun && j.phase === 'done' ? '<button class="linkish" id="jam-again">Start another jam</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Close</button></div>`);
      if (!s) return;
      const busy = (b, t) => { b.disabled = true; b.textContent = t; };
      const jn = $('#jam-join'); if (jn) jn.onclick = async () => { busy(jn, 'Starting…'); try { const r = await C.api('/jam/join', { method: 'POST' }); toast('Your jam project is ready: make something!'); s.close(); await C.switchProject(r.project.id); if (window.TribePreview) setTimeout(() => window.TribePreview.open(), 500); } catch (e) { toast(e.message); jn.disabled = false; jn.innerHTML = `${FLAG} Join the jam`; } };
      const sb = $('#jam-submit'); if (sb) sb.onclick = async () => {
        busy(sb, 'Submitting…');
        try { const r = await C.api('/jam/submit', { method: 'POST', body: { project: pid } }); S.jam = r.jam; toast('Entered in the jam'); draw(); }
        catch (e) { sb.disabled = false; sb.textContent = 'Submit this project'; if (/publish it first/i.test(e.message) && window.TribePublish) { toast('Publish it first: the entry is its play link'); window.TribePublish.open(pid); } else toast(e.message); }
      };
      s.body.querySelectorAll('[data-vote]').forEach(b => b.onclick = async () => { try { const r = await C.api('/jam/vote', { method: 'POST', body: { project: b.dataset.vote } }); S.jam = r.jam; draw(); } catch (e) { toast(e.message); } });
      const en = $('#jam-end'); if (en) en.onclick = async () => { if (!confirm(j.phase === 'live' ? 'End the jam now and open voting?' : 'Close voting and show the results?')) return; try { const r = await C.api('/jam/end', { method: 'POST' }); S.jam = r.jam; await load(); draw(); } catch (e) { toast(e.message); } };
      const ag = $('#jam-again'); if (ag) ag.onclick = start;
      const l2 = document.getElementById('jam-left2'); if (l2 && j.phase !== 'done') { const iv = setInterval(() => { const el = document.getElementById('jam-left2'); if (!el) return clearInterval(iv); el.textContent = left(until(j)); }, 1000); }
    };
    openBoard = draw; draw();
  }
  function start() {
    const s = sheet(`<p class="eyebrow">Jam</p><h2 class="jam-h">Start a jam</h2><p class="faint">Everyone in the tribe sees a countdown. When time is up, voting opens: one vote each, never for your own.</p>
      <form class="jam-form" id="jam-form" autocomplete="off">
        <label class="pb-l">Theme<input class="input" id="jam-theme" maxlength="80" placeholder="e.g. Only one button" required></label>
        <div class="jam-row"><label class="pb-l">How long<select class="input" id="jam-hours"><option value="1">1 hour</option><option value="3">3 hours</option><option value="24">24 hours</option><option value="48" selected>48 hours</option><option value="72">72 hours</option></select></label>
        <label class="pb-l">Voting<select class="input" id="jam-vote"><option value="1">1 hour</option><option value="12">12 hours</option><option value="24" selected>24 hours</option><option value="48">48 hours</option></select></label></div>
        <label class="pb-l">Rules <small class="faint">optional</small><input class="input" id="jam-rules" maxlength="600" placeholder="e.g. Teams of up to 3, any engine, credit your assets"></label>
      </form>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="jam-go">Start the jam</button></div>`);
    if (!s) return;
    $('#jam-go').onclick = async () => {
      const theme = $('#jam-theme').value.trim(); if (!theme) { $('#jam-theme').focus(); return toast('Give the jam a theme'); }
      try { await C.api('/jam', { method: 'POST', body: { theme, hours: Number($('#jam-hours').value), voteHours: Number($('#jam-vote').value), rules: $('#jam-rules').value } }); toast('Jam started'); await load(); open(); }
      catch (e) { toast(e.message); }
    };
    setTimeout(() => $('#jam-theme') && $('#jam-theme').focus(), 30);
  }

  C.on('ws', m => { if (m && m.type === 'jam') load(); });
  C.on('hello', load);
  C.on('hello', () => setTimeout(load, 300));   // only once a tribe answers: never at boot, before there is one
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: 'Jam board', keys: 'jam game jam theme countdown vote entries', run: open },
    ...(S && S.canRun ? [{ kind: 'Action', label: 'Start a jam', keys: 'jam start game jam theme host', run: start }] : []),
  ]);
  window.TribeJam = { open, start, status: () => S, reload: load };
})();
