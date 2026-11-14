// Free cloud, the one way (docs/CLOUD.md). Every place that offers "Free cloud" shows these same fields and calls
// connect(): setuplocal.js (Where should it live?), phonehost.js (the phone chooser) and tribenew.js (the create flow).
//
//   One button opens Render's deploy page for this repository. The person brings back two things: the address Render
//   gave them and the setup code. connect() then claims the empty cloud tribe for them (POST /api/bootstrap with the
//   code), so there is no "open the address, make yourself host, make an invite link, paste it back" any more.
//   A cloud tribe that already has people: paste an invite link in the same box and leave the code empty.
//
// Public: window.TribeCloudHome = { RENDER, SUB, fields(prefix, values), wire(root, prefix, moveBtn), read(root, prefix), connect({ value, code, name, color }), address(raw) }
(function () {
  'use strict';
  const RENDER = 'https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode';
  // The row's one-line description wherever Free cloud is offered: what it gives and its limit, in one breath.
  const SUB = 'Online when your computer is off. Free, and it naps when nobody is there';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const OFF = () => window.TribeOffline;
  const realFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));

  // "https://tribecode-ab12.onrender.com/" or "tribecode-ab12.onrender.com" -> the origin; anything else -> ''.
  function address(raw) {
    let v = String(raw || '').trim(); if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') || /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin : ''; } catch { return ''; }
  }
  function invite(raw) {
    const P = window.TribePhoneHost; if (P && P.parseInvite) return P.parseInvite(raw);
    const m = String(raw || '').trim().match(/^(https?:\/\/[^/\s]+)\/join\/([A-Za-z0-9]{3,16})\/?$/); return m ? { server: m[1], code: m[2] } : null;
  }

  // The same words and fields everywhere. p is the id prefix of the screen that shows them (su, ph, tn).
  function fields(p, v = {}) {
    return `<p class="ph-lead ch-lead">${tr('Your tribe moves to a free server, so friends can get in while your computer is off.')}</p>
      <ul class="ch-facts">
        <li>${tr('It naps after 15 minutes with nobody there, and takes about a minute to wake.')}</li>
        <li>${tr('A nap wipes its files. Each person’s browser keeps a copy and puts it back. Your code is safest on GitHub.')}</li>
        <li>${tr('It runs in your own free Render account.')}</li>
      </ul>
      <div class="ph-acts ch-go"><a class="btn primary" id="${p}-render" href="${RENDER}" target="_blank" rel="noopener">${tr('Set up free cloud')}</a></div>
      <p class="ph-note">${tr('Render opens in a new tab. Sign in, tap Apply and wait a few minutes for the first build. Then bring two things back here.')}</p>
      <label class="ph-lab" for="${p}-addr">${tr('Your cloud address')}</label>
      <input class="input" id="${p}-addr" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://tribecode-xxxx.onrender.com" value="${esc(v.value || '')}">
      <label class="ph-lab" for="${p}-code">${tr('Setup code')}</label>
      <input class="input" id="${p}-code" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(v.code || '')}">
      <p class="ph-note">${tr('The code is TRIBE_SETUP_CODE in the Environment tab of your Render service. Already has people? Paste an invite link from it as the address and leave the code empty.')}</p>`;
  }
  // One main button at a time: Set up first; once an address is typed, the screen's own Move button takes over.
  function wire(root, p, moveBtn) {
    const a = root.querySelector(`#${p}-addr`), go = root.querySelector(`#${p}-render`); if (!a || !go) return;
    const sync = () => { const has = !!a.value.trim(); go.classList.toggle('primary', !has); if (moveBtn) moveBtn.classList.toggle('primary', has); };
    a.addEventListener('input', sync); sync();
  }
  const read = (root, p) => ({ value: ((root.querySelector(`#${p}-addr`) || {}).value || '').trim(), code: ((root.querySelector(`#${p}-code`) || {}).value || '').trim() });

  const offline = e => /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message));
  // Answers { server, token, claimed } (claimed: this person is now its host) or throws an Error with a plain sentence.
  // err.field is 'addr' or 'code': which box to put the cursor in.
  async function connect({ value, code, name, color } = {}) {
    const bad = (msg, field) => Object.assign(new Error(tr(msg)), { field });
    const who = name && name !== 'Me' ? name : 'Host';
    const inv = invite(value);
    if (inv) {
      let j, jd;
      try { j = await realFetch(`${inv.server}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: inv.code, name: who, color }) }); jd = await j.json().catch(() => ({})); }
      catch (e) { throw bad('Couldn’t reach that cloud tribe. It may be waking up: try again in a minute.', 'addr'); }
      if (!j.ok || !jd.token) throw Object.assign(new Error(jd.error || tr('That invite didn’t work. Make a fresh link in your cloud tribe and paste it again.')), { field: 'addr' });
      return { server: inv.server, token: jd.token, claimed: false };
    }
    const server = address(value);
    if (!server) throw bad('Paste the address Render gave you, like https://tribecode-xxxx.onrender.com', 'addr');
    let h = null;
    try { const r = await realFetch(server + '/api/health', { cache: 'no-store' }); h = r.ok ? await r.json().catch(() => null) : null; } catch { h = null; }
    if (!h || !h.ok) throw bad('Nothing answered at that address yet. The first build takes a few minutes, and a napping server takes about a minute to wake. Try again shortly.', 'addr');
    if (h.members) throw bad('That cloud tribe already has a host. Paste an invite link from it as the address instead.', 'addr');
    if (!code) throw bad('Enter the setup code. It is TRIBE_SETUP_CODE in the Environment tab of your Render service.', 'code');
    let r, d;
    try { r = await realFetch(server + '/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: who, color, setupCode: code }) }); d = await r.json().catch(() => ({})); }
    catch (e) { throw bad(offline(e) ? 'Couldn’t reach your cloud tribe. Try again in a minute.' : String(e.message || e), 'addr'); }
    if (r.status === 403) throw bad('That setup code is not right. Copy TRIBE_SETUP_CODE from the Environment tab of your Render service.', 'code');
    if (!r.ok || !d.token) throw Object.assign(new Error(d.error || `${tr('The server said')} ${r.status}.`), { field: 'addr' });
    return { server, token: d.token, claimed: true };
  }

  window.TribeCloudHome = { RENDER, SUB, fields, wire, read, connect, address };
})();
