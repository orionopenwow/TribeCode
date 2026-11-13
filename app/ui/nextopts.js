// Next options (feat/mobile-complete, docs/MOBILE-COMPLETE.md): one calm way to say "this part needs a computer or a
// host" and hand over the next best steps, in order, so a phone never shows a dead button.
//   TribeNextOpts.card(feature)   HTML for an inline card (a view that can't run here draws it instead of an error)
//   TribeNextOpts.sheet(feature)  a bottom sheet (centered card on wide screens) with the options
//   TribeNextOpts.nudge(feature)  a small note at the bottom with "See options", at most once per feature per visit
//   TribeNextOpts.why(feature)    the one-line reason
// Options, in order: Move to a host (one tap, phonehost.js move) · Free cloud (Render, phonehost.js cloud) · My laptop
// (the desktop app's download link + a QR code that opens this page on the laptop) · My Android (Termux; on an iPhone a
// plain note that iPhones can't host). Strings are translated through TribeI18n.
(function () {
  'use strict';
  const T = (s) => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PH = () => window.TribePhoneHost;
  const RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const iPhone = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const ic = (n, s = 18) => (window.TribeIcons ? window.TribeIcons.svg(n === 'info' ? 'help' : n === 'arrow-right' ? 'link' : n, s) : `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`);

  // feature -> [title, why]
  const WHY = {
    agents: ['AI helpers need a computer', 'Claude Code, Codex and other AI helpers run on a computer and talk to the tribe through its host.'],
    friends: ['Friends need a host', 'This tribe lives only on this phone. Give it a home and friends can join with one link.'],
    repo: ['The code repository lives on a computer', 'Branches, commits and the drift radar need git, which runs on a host. On this phone you can still sync files with GitHub.'],
    secretary: ['The Secretary runs on a host', 'It reads the tribe overnight and writes a journal, so it needs a computer or a cloud host that stays on.'],
    huddle: ['Voice huddles need a host', 'Calls between people go through the tribe\'s host. On this phone alone there is nobody to call yet.'],
    model: ['Big local models need a computer', 'Models like Qwen or Llama run on a computer with Ollama. Flint\'s free brain still works right here.'],
    captures: ['Captures run on a host', 'Screen and voice captures are saved and processed by the tribe\'s host.'],
    phoneapp: ['Native phone apps build on a computer', 'Expo needs a computer to install and run the dev server. Your phone then opens the app with Expo Go.'],
    publish: ['A public link needs a host', 'Download the site from here any time. A link other people can open needs a host or GitHub Pages.'],
    connectors: ['Connectors run on a host', 'Tools like MCP servers and integrations run next to the tribe on a computer or cloud host.'],
    generic: ['This needs a computer or a host', 'This part runs on the tribe\'s host. Everything else keeps working on this phone.'],
  };
  const why = f => WHY[f] || WHY.generic;

  function opts() {
    const rows = [
      ['move', 'arrow-right', 'Move to a host', 'Paste a friend\'s invite link and everything moves over in one tap.'],
      ['cloud', 'cloud', 'Free cloud', 'A free Render server that stays online without anyone\'s computer.'],
      ['laptop', 'monitor', 'My laptop', 'Install the desktop app and this project can live there.'],
      iPhone() ? ['iphone', 'info', 'iPhones can\'t host', 'Apple doesn\'t let apps run a server in the background. Pick one of the options above.'] : ['termux', 'phone', 'My Android', 'Host from this phone with one command in Termux, while it stays open and charging.'],
    ];
    return rows.map(([k, i, t, s]) => `<button type="button" class="nx-row" data-nx="${k}"${k === 'iphone' ? ' disabled' : ''}><span class="nx-ic">${ic(i)}</span><span class="nx-t"><b>${esc(T(t))}</b><small>${esc(T(s))}</small></span></button>`).join('');
  }

  function act(k) {
    close();
    if (k === 'move') return PH() && PH().move();
    if (k === 'cloud') return PH() && (PH().cloud ? PH().cloud() : PH().open());
    if (k === 'termux') return PH() && (PH().termux ? PH().termux() : PH().open());
    if (k === 'laptop') return laptop();
  }

  function laptop() {
    const url = location.origin + location.pathname;
    const qr = window.TribeQR ? window.TribeQR.svg(url) : '';
    open(`<header class="nx-h"><div><span class="eyebrow">${esc(T('Next step'))}</span><h3>${esc(T('Open it on your laptop'))}</h3></div><button type="button" class="nx-x" data-nx-x aria-label="${esc(T('Close'))}">${ic('x', 16)}</button></header>
      <ol class="nx-steps"><li>${esc(T('Download the TribeCode desktop app on your laptop.'))} <a href="${RELEASES}" target="_blank" rel="noopener">${esc(T('Downloads'))}</a></li>
      <li>${esc(T('Start your tribe there, then make an invite link.'))}</li><li>${esc(T('Back on this phone, choose Move to a host and paste the link.'))}</li></ol>
      ${qr ? `<div class="nx-qr" aria-label="${esc(T('Scan to open this page on your laptop'))}">${qr}</div><p class="nx-small">${esc(T('Scan with the laptop\'s camera, or type the address:'))} <code>${esc(url)}</code></p>` : ''}
      <div class="nx-f"><button type="button" class="btn" data-nx-copy>${esc(T('Copy the download link'))}</button><button type="button" class="btn primary" data-nx="move">${esc(T('I have an invite link'))}</button></div>`);
    const c = el.querySelector('[data-nx-copy]');
    if (c) c.onclick = () => { try { navigator.clipboard.writeText(RELEASES); } catch {} c.textContent = T('Copied'); };
  }

  // ---------- one sheet ----------
  let el = null, scrim = null;
  function close() { if (el) el.remove(); if (scrim) scrim.remove(); el = scrim = null; document.removeEventListener('keydown', onKey, true); }
  function onKey(e) { if (e.key === 'Escape' && el) { e.stopPropagation(); close(); } }
  function open(html) {
    close();
    scrim = document.createElement('div'); scrim.className = 'nx-scrim'; scrim.onclick = close;
    el = document.createElement('div'); el.className = 'nx-sheet'; el.id = 'nx-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = html;
    document.body.append(scrim, el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-nx]'); if (b && !b.disabled) act(b.dataset.nx); if (e.target.closest('[data-nx-x]')) close(); });
    document.addEventListener('keydown', onKey, true);
    const f = el.querySelector('.nx-row:not([disabled]), button'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  function sheet(feature) {
    const [t, w] = why(feature);
    open(`<header class="nx-h"><div><span class="eyebrow">${esc(T('Next options'))}</span><h3>${esc(T(t))}</h3></div><button type="button" class="nx-x" data-nx-x aria-label="${esc(T('Close'))}">${ic('x', 16)}</button></header>
      <p class="nx-why">${esc(T(w))}</p><div class="nx-rows">${opts()}</div>`);
  }
  function card(feature) {
    const [t, w] = why(feature);
    return `<div class="nx-card" data-nx-card="${esc(feature || 'generic')}"><span class="nx-ic">${ic('info')}</span><div class="nx-t"><b>${esc(T(t))}</b><small>${esc(T(w))}</small></div><span class="nx-acts">${feature === 'repo' && window.TribeGhPhone ? `<button type="button" class="btn sm" data-gp-open>${esc(T('Use GitHub from this phone'))}</button>` : ''}<button type="button" class="btn sm primary" data-nx-open="${esc(feature || 'generic')}">${esc(T('See options'))}</button></span></div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-nx-open]'); if (b) { e.preventDefault(); sheet(b.dataset.nxOpen); return; }
    const g = e.target.closest('[data-gp-open]'); if (g && window.TribeGhPhone) { e.preventDefault(); close(); window.TribeGhPhone.open(); }
  });

  // A view that printed the reason as its error gets the card in its place instead (no extra note on top).
  function inline(feature) {
    const w = why(feature)[1], main = document.querySelector('.main') || document.body;
    const hits = [...main.querySelectorAll('p, div, span, small')].filter(n => n.offsetParent && !n.closest('.nx-card, .toast, #toast') && n.children.length <= 2 && (n.textContent || '').includes(w));
    if (!hits.length) return false;
    const n = hits.sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const box = n.closest('.card, .empty, [class*="empty"]') && n.closest('.card, .empty, [class*="empty"]').textContent.length < w.length + 200 ? n.closest('.card, .empty, [class*="empty"]') : n;
    const wrap = document.createElement('div'); wrap.innerHTML = card(feature); box.replaceWith(wrap.firstElementChild);
    return true;
  }
  const nudged = new Set();
  function nudge(feature) {
    feature = feature || 'generic';
    if (el) return;
    const tries = nudge.tries = nudge.tries || {};
    if (inline(feature)) { tries[feature] = 0; return; }
    if ((tries[feature] = (tries[feature] || 0) + 1) < 4) { setTimeout(() => nudge(feature), 250); return; }
    tries[feature] = 0;
    if (nudged.has(feature)) return; nudged.add(feature);
    let n = document.getElementById('nx-nudge');
    if (!n) { n = document.createElement('div'); n.id = 'nx-nudge'; n.className = 'nx-nudge'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    const [t] = why(feature);
    n.innerHTML = `<span class="nx-dot" aria-hidden="true"></span><b>${esc(T(t))}</b><button type="button" class="btn sm" data-nx-open="${esc(feature)}">${esc(T('See options'))}</button><button type="button" class="nx-x" aria-label="${esc(T('Close'))}">${ic('x', 14)}</button>`;
    n.querySelector('.nx-x').onclick = () => n.remove();
    n.querySelector('[data-nx-open]').addEventListener('click', () => n.remove());
    clearTimeout(nudge.t); nudge.t = setTimeout(() => n && n.remove(), 7000);
  }

  window.TribeNextOpts = { card, sheet, nudge, why: f => why(f)[1], close, WHY: Object.keys(WHY) };
})();
