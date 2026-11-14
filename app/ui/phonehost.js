// Where should your tribe live? (docs/PHONE-HOSTING.md) The phone's "Start a tribe" chooser, plus the sheet that moves a
// tribe kept on this phone to a real host. Four homes, one row each:
//   This phone   your own tribe in this browser right away (app/ui/offline.js solo mode); friends join after a move
//   Free cloud   Render's one-click deploy of this repo (docs/CLOUD.md)
//   My Android   Termux: one line installs and starts a host (scripts/phone/termux-host.sh)
//   A computer   the desktop app (or a friend's), as before
// move(): paste an invite link to the new host -> join it with your name -> POST /api/import/solo (server/soloimport.js)
// -> sign in there; the phone copy is then deleted.
//   window.TribePhoneHost = { open(), move(), parseInvite(raw) }
(function () {
  'use strict';
  const RENDER = 'https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode';
  const TERMUX = 'https://f-droid.org/packages/com.termux/';
  const ONE_LINE = 'curl -fsSL https://raw.githubusercontent.com/orionopenwow/TribeCode/main/scripts/phone/termux-host.sh | bash';
  const dl = () => (window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const S = () => window.TribeStore, OFF = () => window.TribeOffline;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const ic = (n, s = 18) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const android = /Android/i.test(navigator.userAgent || '');

  // ---------- one sheet at a time (bottom sheet on phones, a centered card on wider screens) ----------
  let el = null, scrim = null;
  function close() {
    if (!el) return; const a = el, b = scrim; el = scrim = null;
    a.classList.add('out'); b.classList.add('out');
    setTimeout(() => { a.remove(); b.remove(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
  }
  function sheet(html, id, label) {
    if (window.TribeMobile && window.TribeMobile.closeSheet) try { window.TribeMobile.closeSheet(); } catch {}
    if (el) { el.remove(); scrim.remove(); }
    scrim = document.createElement('div'); scrim.className = 'ph-scrim'; scrim.onclick = close;
    el = document.createElement('div'); el.className = 'ph-sheet'; el.id = id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    el.innerHTML = `<div class="ph-grab" aria-hidden="true"></div>${html}`;
    document.body.append(scrim, el);
    el.querySelectorAll('[data-ph-close]').forEach(b => { b.onclick = close; });
    el.querySelectorAll('[data-ph-back]').forEach(b => { b.onclick = open; });
    return el;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el) { close(); e.stopPropagation(); } }, true);
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
    if (btn) { const was = btn.textContent; btn.textContent = tr('Copied'); setTimeout(() => { btn.textContent = was; }, 1600); }
  }

  // ---------- the chooser ----------
  function open() {
    const row = (k, icon, title, sub, tag, live) => `<button class="ph-row" data-ph="${k}"><span class="ph-ic${live ? ' live' : ''}">${ic(icon)}</span><span class="ph-tt"><b>${tr(title)}${tag ? ` <em class="ph-tag">${tr(tag)}</em>` : ''}</b><small>${tr(sub)}</small></span><span class="ph-go">${ic('chev', 16)}</span></button>`;
    const s = sheet(`<header class="ph-h"><div><span class="eyebrow">${tr('Start a tribe')}</span><h3>${tr('Where should your tribe live?')}</h3></div></header>
      <div class="ph-list">
        ${row('phone', 'spark', 'This phone', 'Start now. Friends join once it moves to a host', 'Instant', true)}
        ${row('cloud', 'net', 'Free cloud', 'Always online on a free Render server. Friends join from anywhere')}
        ${row('android', 'zap', 'My Android', 'Host from an Android phone with Termux', android ? 'Android' : '')}
        ${row('computer', 'box', 'A computer', 'The desktop app on a PC or Mac hosts by itself')}
      </div>
      <p class="ph-foot"><button class="linkish" data-ph="join">${tr('I have an invite link')}</button>${OFF() ? `<span aria-hidden="true">·</span><button class="linkish" data-ph="demo">${tr('Try a demo first')}</button>` : ''}</p>`, 'ph-start', tr('Where should your tribe live?'));
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-ph]'); if (!b) return;
      const k = b.dataset.ph;
      if (k === 'phone') { close(); return OFF() && OFF().start('solo'); }
      if (k === 'cloud') return cloud();
      if (k === 'android') return termux();
      if (k === 'computer') return computer();
      if (k === 'join') { close(); return window.TribeSettings && window.TribeSettings.joinPrompt(); }
      if (k === 'demo') { close(); return OFF() && OFF().start(); }
    });
    const first = s.querySelector('.ph-row'); if (first && !matchMedia('(pointer: coarse)').matches) first.focus();   // keyboard users start on the first row; touch shows no ring
  }
  const back = `<button class="ph-back" data-ph-back aria-label="${esc(tr('Back'))}">${ic('chev', 16)}</button>`;
  function cloud() {
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">${tr('Free cloud')}</span><h3>${tr('A tribe that stays online')}</h3></div></header>
      <ol class="ph-steps">
        <li>${tr('Open Render and sign in (GitHub works). It reads TribeCode’s setup by itself.')}</li>
        <li>${tr('Tap Apply and wait a few minutes for the first build.')}</li>
        <li>${tr('Copy TRIBE_SETUP_CODE from the service’s Environment tab.')}</li>
        <li>${tr('Open your new address, enter the code and your name. You’re the host.')}</li>
      </ol>
      <p class="ph-note">${tr('Free plan: it naps after 15 minutes alone and wakes in about a minute. Cloud save brings everything back.')}</p>
      <div class="ph-acts"><a class="btn primary" id="ph-render" href="${RENDER}" target="_blank" rel="noopener">${tr('Open Render')}</a></div>`, 'ph-cloud', tr('Free cloud'));
    s.querySelector('#ph-render').focus();
  }
  function termux() {
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">${tr('My Android')}</span><h3>${tr('Host from an Android phone')}</h3></div></header>
      <ol class="ph-steps">
        <li>${tr('Install Termux from F-Droid (not the old Play Store version).')}</li>
        <li>${tr('Open Termux, paste this line and press Enter:')}
          <div class="ph-code"><code id="ph-line">${esc(ONE_LINE)}</code><button class="btn sm" id="ph-copy">${tr('Copy')}</button></div></li>
        <li>${tr('It prints an invite link. Open localhost:4747 in Chrome on that phone to use it as the host.')}</li>
      </ol>
      <p class="ph-note">${tr('Keep Termux open and the phone charging. Android can stop it to save battery: allow Termux to run in the background. iPhones can’t host.')}</p>
      <div class="ph-acts"><a class="btn" href="${TERMUX}" target="_blank" rel="noopener">${tr('Get Termux')}</a></div>`, 'ph-android', tr('My Android'));
    s.querySelector('#ph-copy').onclick = e => copy(ONE_LINE, e.currentTarget);
    s.querySelector('#ph-copy').focus();
  }
  function computer() {
    const s = sheet(`<header class="ph-h">${back}<div><span class="eyebrow">${tr('A computer')}</span><h3>${tr('Host on a PC or Mac')}</h3></div></header>
      <ol class="ph-steps">
        <li>${tr('Send the download link to your computer, or to a friend who has one.')}</li>
        <li>${tr('Install and open TribeCode. It starts hosting when the first project is made.')}</li>
        <li>${tr('Tap Invite a friend there and open the link on this phone.')}</li>
      </ol>
      <div class="ph-acts"><button class="btn" id="ph-friend">${tr('Ask a friend')}</button><button class="btn primary" id="ph-mine">${tr('Send to my computer')}</button></div>`, 'ph-computer', tr('A computer'));
    const share = async text => { try { if (navigator.share) await navigator.share({ title: 'TribeCode', text }); else { await copy(text); toast(tr('Copied. Paste it in a message.')); } } catch {} };
    s.querySelector('#ph-mine').onclick = () => share(`Install TribeCode on my computer (it hosts our tribe): ${dl()}`);
    s.querySelector('#ph-friend').onclick = () => share(`Can you host our TribeCode tribe? Install the app, open it, tap Invite a friend and send me the link: ${dl()}`);
    s.querySelector('#ph-mine').focus();
  }

  // ---------- move a phone tribe to a host ----------
  function parseInvite(raw) {
    const v = String(raw || '').trim();
    let m = v.match(/^(https?:\/\/[^/\s]+)\/join\/([A-Za-z0-9]{3,16})\/?$/);
    if (m) return { server: m[1], code: m[2] };
    try {
      const u = new URL(v);
      if (/\/go\.html$/.test(u.pathname) && u.hash) {
        const h = new URLSearchParams(u.hash.slice(1)), server = (h.get('s') || '').replace(/\/+$/, ''), code = h.get('c') || '';
        if (/^https?:\/\/[^/\s]+$/.test(server) && /^[A-Za-z0-9]{3,16}$/.test(code)) return { server, code };
      }
    } catch {}
    return null;
  }
  function move() {
    const o = OFF(); if (!o || !o.solo || !o.solo()) return open();
    const db = o.state(), counts = db.projects.reduce((a, p) => ({ t: a.t + (db.tasks[p.id] || []).length, d: a.d + (db.docs[p.id] || []).length }), { t: 0, d: 0 });
    const st = S().get();
    const s = sheet(`<header class="ph-h"><div><span class="eyebrow">${tr('Move to a host')}</span><h3>${tr('Bring this tribe to a host')}</h3></div></header>
      <p class="ph-lead">${esc(db.tribe.name)} · ${db.projects.length} ${tr(db.projects.length === 1 ? 'project' : 'projects')} · ${counts.t} ${tr(counts.t === 1 ? 'task' : 'tasks')} · ${counts.d} ${tr(counts.d === 1 ? 'doc' : 'docs')}</p>
      <label class="ph-lab" for="ph-inv">${tr('Invite link to the host')}</label>
      <input class="input" id="ph-inv" inputmode="url" autocomplete="off" placeholder="https://…/join/abc12">
      <label class="ph-lab" for="ph-name">${tr('Your name there')}</label>
      <input class="input" id="ph-name" maxlength="32" value="${esc(st.name && st.name !== 'Me' ? st.name : '')}">
      <p class="ph-note">${tr('Everything moves over in one go and this phone signs in to the host. Then the phone copy is deleted.')} <button class="linkish" id="ph-nohost">${tr('No host yet?')}</button></p>
      <p class="ph-err hidden" id="ph-err" role="alert"></p>
      <div class="ph-acts"><button class="btn" data-ph-close>${tr('Not now')}</button><button class="btn primary" id="ph-move">${tr('Move')}</button></div>`, 'ph-move-sheet', tr('Move to a host'));
    const err = t => { const e = s.querySelector('#ph-err'); e.textContent = t; e.classList.toggle('hidden', !t); };
    s.querySelector('#ph-nohost').onclick = open;
    s.querySelector('#ph-inv').focus();
    s.querySelector('#ph-move').onclick = async () => {
      err('');
      const inv = parseInvite(s.querySelector('#ph-inv').value), name = s.querySelector('#ph-name').value.trim();
      if (!inv) return err(tr('Paste the full invite link, like https://host/join/abc12'));
      if (!name) return s.querySelector('#ph-name').focus();
      const btn = s.querySelector('#ph-move'); btn.disabled = true; btn.textContent = tr('Moving…');
      try {
        const j = await fetch(`${inv.server}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: inv.code, name, color: st.color }) });
        const jd = await j.json().catch(() => ({})); if (!j.ok || !jd.token) throw new Error(jd.error || tr('That invite didn’t work. Ask for a fresh link.'));
        const r = await fetch(`${inv.server}/api/import/solo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jd.token }, body: JSON.stringify(o.exportSolo()) });
        const rd = await r.json().catch(() => ({})); if (!r.ok) throw new Error(rd.error || `HTTP ${r.status}`);
        // A web page (the PWA) can't use the host from another origin: open the host's own page, signed in with a device link.
        let go = null;
        const web = /^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/i.test(location.hostname);
        if (web && inv.server !== location.origin) {
          const l = await fetch(`${inv.server}/api/device-link`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jd.token }, body: JSON.stringify({ label: 'Phone (moved from this phone)' }) });
          const ld = await l.json().catch(() => ({})); if (l.ok && ld.path) go = inv.server + ld.path;
        }
        close(); toast(tr('Moved. Welcome to your host!'));
        o.finishMove(inv.server, jd.token, name, go);
      } catch (e) {
        err(/Failed to fetch|NetworkError|Load failed/i.test(String(e.message)) ? tr('Couldn’t reach that host. Is it online?') : e.message);
        btn.disabled = false; btn.textContent = tr('Move');
      }
    };
  }

  window.TribePhoneHost = { open, move, close, parseInvite, cloud, termux, computer };   // cloud/termux/computer: setuplocal.js reuses these steps
})();
