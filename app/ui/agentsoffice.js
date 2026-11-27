// Agents & office: one view for the people and AI helpers of a tribe (feat/agents-office). It is the agents workspace's
// first page (coord.js 'agents' tab, painted by agentsdash.js; shell row "Agents & office", key ws-agents) and, on Home
// with no project, the same page for every project (agentshub.js #/fleet). This file draws the parts both share:
//   head()      the title, one line on who is here, and Add an AI helper / Invite a friend
//   office()    the office at the top: the pixel floor when the tribe turned it on (computers), the desks otherwise and
//               on phones. Click anyone (floor, desk or list) for the same card (office.js openCard).
//   addAi(id)   no AI helper yet: pick the AI you use (Claude, ChatGPT, Codex, Gemini, Cursor, a model on this computer,
//               a free AI in your browser). Each choice opens the one setup that fits (the invite sheet, inviteagent.js).
//   setup()     four loops that finish, each one card with one button: Bring a friend (the one invite sheet), Where
//               your tribe runs (this computer, a friend's computer connected directly, a shared folder, free cloud),
//               What's private (true facts only, docs/CLAIMS.md), Back up to GitHub (ghconnect.js, with a way in for
//               someone with no GitHub account).
//   wire(root)  clicks and the async card lines.
// A project's page is laid out by officefull.js (the office fills the page, a side panel, a box at the bottom).
// Public: window.TribeAgentsOffice = { NAME, head, office, mountOffice, addAi, setup, wire, run, where, privacy, privacyFacts, pick, ghLoad, ghLine }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, v) => { let t = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const ico = (n, s = 18) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, s) : '');
  const agentIco = (k, s = 20) => (window.TribeIcons && window.TribeIcons.agent ? window.TribeIcons.agent(k, s) : ico('agent', s));
  const NAME = 'Agents & office';
  const hasTribe = () => !!(C() && C().hasToken && C().hasToken());
  const OFF = () => window.TribeOffline;
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const demo = () => !!(OFF() && OFF().active && OFF().active()) && !solo();
  const pidNow = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C() && C().project && C().project()) || '';
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return T('just now'); if (s < 3600) return T('{n} min ago', { n: Math.floor(s / 60) }); if (s < 86400) return T('{n} h ago', { n: Math.floor(s / 3600) }); return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  // ---------- the head ----------
  // One line: the title, who is here and what they are doing, the avatars (officefull.js fills #ao-here), and the
  // two actions as small buttons at the right.
  function head(o = {}) {
    const acts = hasTribe() ? `<div class="ao-head-acts"><button type="button" class="btn sm" data-ao="add">${ico('plug', 15)}<span>${esc(T('Add an AI helper'))}</span></button><button type="button" class="btn sm" data-ao="friend">${ico('people', 15)}<span>${esc(T('Invite a friend'))}</span></button></div>` : '';
    return `<header class="ao-head" id="ao-head"><div class="ao-head-t"><h1 class="ao-title">${esc(T(o.scope === 'all' ? 'Agents & office · every project' : NAME))}</h1><span class="ao-sep" aria-hidden="true">·</span>
      <p class="ao-lead" id="ao-lead">${esc(lead())}</p><div class="ao-here" id="ao-here" role="group" aria-label="${esc(T('Who’s here'))}"></div></div>${acts}</header>`;
  }
  // "2 people online · 1 AI helper working" from the office's desks (the same data as the floor).
  function lead() {
    const O = window.TribeOffice, d = O && O.state && O.state();
    if (!hasTribe()) return T('Start a project first. Then friends and AI helpers join you here.');
    if (!d || !d.desks) return T('People and AI helpers at their desks, live.');
    const ppl = d.desks.filter(x => x.kind === 'person'), ai = d.desks.filter(x => x.kind === 'agent');
    const on = ai.filter(x => x.state === 'active').length, pOn = ppl.filter(x => x.state !== 'off').length;
    const a = ppl.length <= 1 ? T('Just you') : pOn === 1 ? T('1 person online') : T('{n} people online', { n: pOn });
    const b = !ai.length ? T('no AI helper yet') : on ? (on === 1 ? T('1 AI helper working') : T('{n} AI helpers working', { n: on })) : (ai.length === 1 ? T('1 AI helper, resting') : T('{n} AI helpers, resting', { n: ai.length }));
    return `${a} · ${b}`;
  }
  function refreshLead() { const l = document.getElementById('ao-lead'); if (l) l.textContent = lead(); }

  // ---------- the office at the top ----------
  const office = () => (window.TribeOffice && hasTribe() ? `<section class="ao-office" id="ad-office" aria-label="${esc(T('The office'))}"><div class="ao-floor" id="ao-floor"></div></section>` : '');
  function mountOffice(root, prev, opts) {
    const f = root.querySelector('#ao-floor'); if (!f || !window.TribeOffice) return null;
    if (prev && prev.destroy) prev.destroy();
    return window.TribeOffice.mount(f, opts || {});
  }

  // ---------- add an AI helper ----------
  const PICKS = [
    ['claude', 'Claude', 'Claude Code, the desktop app or claude.ai'],
    ['chatgpt', 'ChatGPT', 'The ChatGPT app'],
    ['codex', 'Codex', 'OpenAI’s coding tool'],
    ['gemini', 'Gemini', 'Google’s Gemini CLI'],
    ['cursor', 'Cursor', 'The AI code editor'],
    ['local', 'A model on this computer', 'Ollama or LM Studio'],
    ['free', 'A free AI in your browser', 'No account needed'],
  ];
  function addAi(id = 'ad-hero') {
    return `<section class="hero-card ao-add" id="${esc(id)}" data-state="connect"><span class="eyebrow">${esc(T('Next step'))}</span><h2 class="fl-title">${esc(T('Add an AI helper'))}</h2>
      <p class="fl-lead">${esc(T('Pick the AI you already use. You get the one setup that fits, and it sits down at a desk here when it connects.'))}</p>
      <div class="ao-picks" role="group" aria-label="${esc(T('Which AI'))}">${PICKS.map(([k, n, sub]) => `<button type="button" class="ao-pick" data-ao-pick="${k}"><span class="ao-pick-i" aria-hidden="true">${k === 'local' ? ico('monitor', 20) : k === 'free' ? ico('sparkle', 20) : agentIco(k, 20)}</span><span class="ao-pick-t"><b>${esc(T(n))}</b><small>${esc(T(sub))}</small></span></button>`).join('')}</div>
      <p class="fl-more ao-more"><button type="button" class="linkish" data-ao-pick="other">${esc(T('Another tool'))}</button><span aria-hidden="true">·</span><button type="button" class="linkish" id="ad-tools">${esc(T('See every tool'))}</button></p></section>`;
  }
  // One choice → the one setup: the invite sheet on that AI (or on the free / this-computer answers).
  function pick(k) {
    const IA = window.TribeInviteAgent;
    if (!IA || !IA.open) return toast(T('This part did not load. Reload the app.'));
    if (k === 'local' || k === 'free') return IA.open({ kind: 'ask', alt: k });
    if (k === 'other') return IA.open({ kind: 'ask' });
    return IA.open({ kind: k });
  }

  // ---------- the four loops ----------
  const card = (id, icon, title, lineHtml, btn, more) => `<article class="ao-card" id="${id}"><span class="ao-card-i" aria-hidden="true">${ico(icon, 18)}</span>
    <div class="ao-card-t"><h3>${esc(T(title))}</h3><p class="ao-line" data-ao-line>${lineHtml}</p></div><div class="ao-card-acts">${btn}${more || ''}</div></article>`;
  function setup() {
    if (!hasTribe() && !solo()) return '';
    const S = window.TribeStatus && window.TribeStatus.now ? window.TribeStatus.now() : null;
    return `<section class="ao-setup" id="ao-setup" aria-label="${esc(T('Get set up'))}"><div class="sec-head"><span class="eyebrow">${esc(T('Get set up'))}</span><h2>${esc(T('Friends, where it runs, privacy and backup'))}</h2></div><div class="ao-cards">
      ${card('ao-friend', 'people', 'Bring a friend', esc(T('A link, a QR code for a phone, or a code to type.')), `<button type="button" class="btn" data-ao="friend">${esc(T('Invite a friend'))}</button>`)}
      ${card('ao-where', 'globe', 'Where your tribe runs', S ? `<span class="ts-dot" data-tone="${esc(S.tone)}" aria-hidden="true"></span><b>${esc(S.label)}</b> · ${esc(S.sub)}${window.TribeCopy && window.TribeCopy.line() ? `<br><small class="faint" data-ao-saved>${esc(window.TribeCopy.line())}</small>` : ''}` : esc(T('Looking…')), `<button type="button" class="btn" data-ao="where">${esc(T('Change where it runs'))}</button>`)}
      ${card('ao-privacy', 'lock', 'What’s private', esc(T('Private messages stay between two people. Messages are not end-to-end encrypted.')), `<button type="button" class="btn" data-ao="privacy">${esc(T('See what’s private'))}</button>`)}
      ${card('ao-github', 'github', 'Back up to GitHub', esc(T('Looking…')), `<button type="button" class="btn" data-ao="github">${esc(T('Back up to GitHub'))}</button>`)}
    </div></section>`;
  }
  // The lines that need the server: people here, and where the backup stands.
  async function fill(root) {
    const fr = root.querySelector('#ao-friend [data-ao-line]');
    if (fr && hasTribe()) {
      const ms = ((C().state && C().state().members) || []).filter(m => m.role !== 'agent' && m.role !== 'spectator');
      const on = ms.filter(m => m.online).length;
      if (ms.length > 1) fr.textContent = `${T('{n} people in this tribe', { n: ms.length })} · ${T('{n} online', { n: on })}. ${T('A phone joins by scanning the QR code.')}`;
      else fr.textContent = T('Just you so far. Send a link, or show the QR code to a phone.');
    }
    const gh = root.querySelector('#ao-github'); if (!gh) return;
    const line = gh.querySelector('[data-ao-line]'), btn = gh.querySelector('[data-ao="github"]');
    if (solo()) { const s = window.TribeGitHubConnect ? await window.TribeGitHubConnect.status().catch(() => null) : null; line.textContent = s && s.on ? T('A copy is on GitHub.') : T('Not backed up yet. A copy on GitHub keeps it safe, even with this computer off.'); return; }
    const g = await ghLoad(); if (!g || !gh.isConnected) { if (!g && hasTribe()) line.textContent = T('Not backed up yet.'); return; }
    gh.dataset.state = g.state; line.innerHTML = g.html; btn.textContent = T(g.btn);
  }
  // Where the backup stands, for the GitHub card and the office's ⋯ menu: { state, text, html, btn }
  let ghLast = null;
  async function ghLoad() {
    if (!hasTribe() || !pidNow()) return null;
    let sync = null, me = null;
    try { [sync, me] = await Promise.all([C().api(`/projects/${encodeURIComponent(pidNow())}/sync`), C().api('/github').catch(() => null)]); } catch { return null; }
    const st = (sync && sync.status) || {}, login = me && me.github && me.github.signedIn ? me.github.login : '';
    const state = st.connected && st.kind === 'github' ? (st.lastShip && st.lastShip.at ? 'backed' : 'linked') : login ? 'signedin' : 'none';
    let text, html, btn = 'Back up to GitHub';
    if (st.connected && st.kind === 'github') {
      const when = st.lastShip && st.lastShip.at ? T('backed up {when}', { when: ago(st.lastShip.at) }) : T('not backed up yet');
      text = `${T('Linked to')} ${st.repo || ''} · ${when}`;
      html = `${esc(T('Linked to'))} <a href="${esc(st.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(st.repo || '')}</a> · ${esc(when)}`;
      btn = 'Back up now';
    } else if (st.connected && st.kind === 'folder') text = T('Shared through {where}. GitHub can be an extra copy.', { where: st.repo || T('a shared folder') });
    else text = login ? T('Signed in as @{name}. Pick where this project goes on GitHub.', { name: login }) : T('Not backed up yet. No GitHub account? You can make one on the way.');
    ghLast = { state, text, html: html || esc(text), btn, pid: pidNow() };
    return ghLast;
  }
  const ghLine = () => (ghLast && ghLast.pid === pidNow() ? ghLast : null);

  // ---------- Where your tribe runs ----------
  const SH = () => window.TribeUI;
  let whereSheet = null;
  function where() {
    if (!SH() || !SH().sheet) return window.TribeStatus && window.TribeStatus.open ? window.TribeStatus.open(document.querySelector('[data-ao="where"]')) : null;
    if (whereSheet) whereSheet.close();
    const S = (window.TribeStatus && window.TribeStatus.now && window.TribeStatus.now()) || { key: 'none', label: T('Just you for now'), sub: '', tone: 'quiet' };
    const H = window.TribeHome, fo = H && H.canPickFolder ? H.canPickFolder() : { ok: false, why: T('Shared folders work in the TribeCode app on a computer.') };
    const row = (k, icon, title, sub, btn) => `<div class="ao-opt" data-ao-opt="${k}"><span class="ao-card-i" aria-hidden="true">${ico(icon, 18)}</span><div class="ao-opt-t"><b>${esc(T(title))}</b><small>${esc(T(sub))}</small></div><div class="ao-opt-a">${btn}</div></div>`;
    const b = (k, label, primary, dis) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-ao-go="${k}"${dis ? ` disabled title="${esc(dis)}"` : ''}>${esc(T(label))}</button>`;
    const here = S.key === 'device' || S.key === 'demo' ? b('online', 'Put it on this computer', true)
      : S.key === 'here' ? `<span class="ao-on">${esc(T('Runs here now'))}</span>${b('reach', 'Who can reach it')}`
      : `<span class="faint ao-small">${esc(T('It runs somewhere else now.'))}</span>`;
    const body = `<div class="ao-where">
      <p class="ao-now"><span class="ts-dot" data-tone="${esc(S.tone)}" aria-hidden="true"></span><span><b>${esc(T('Right now'))}:</b> ${esc(S.label)}${S.sub ? ` · ${esc(S.sub)}` : ''}</span></p>
      <div class="ao-opts">
        ${row('here', 'monitor', 'This computer', 'TribeCode on this computer keeps the tribe. Friends join with a link while it is on.', here)}
        ${row('direct', 'link', 'A friend’s computer, connected directly', 'Tailscale links your computers privately, with no cloud in between. The computer that runs the tribe has to be on.', b('direct', 'Connect directly'))}
        ${row('folder', 'files', 'A shared folder', 'A Dropbox, OneDrive, Google Drive or iCloud folder you already use. Friends with the same folder join from it.', b('folder', 'Pick the shared folder', false, fo.ok ? '' : fo.why))}
        ${row('cloud', 'cloud', 'Free cloud', (window.TribeCloudHome && window.TribeCloudHome.SUB) || 'Online when your computer is off. Free, and it naps when nobody is there', b('cloud', 'Set up free cloud'))}
      </div>
      ${window.TribeCopy ? `<div class="ao-opts ao-keep">${row('keep', 'download', 'Keep a copy', window.TribeCopy.line() || 'One file with your projects, designs, docs, tasks and chat. Keys and direct messages stay out.', `${b('save', 'Save on this computer', S.key === 'device' || S.key === 'demo')}${b('open', 'Open a saved tribe')}`)}
        ${S.key !== 'device' && S.key !== 'demo' && S.key !== 'none' ? row('move', 'cloud', 'Move it to the cloud', 'Keep every project and bring your friends along, step by step.', b('move', 'Move it')) : ''}</div>` : ''}
      ${fo.ok ? '' : `<p class="faint ao-small" id="ao-folder-why">${esc(fo.why || '')}</p>`}
      <p class="faint ao-small">${esc(T('Messages, tasks and edits made while it can’t be reached wait and send by themselves.'))} <button type="button" class="linkish" data-ao-go="server">${esc(T('Run your own server'))}</button></p></div>`;
    const sh = whereSheet = SH().sheet({ id: 'ao-where-sheet', wide: true, eyebrow: NAME, title: 'Where your tribe runs', body, onClose: () => { if (whereSheet === sh) whereSheet = null; } });
    sh.body.addEventListener('click', e => {
      const t = e.target.closest('[data-ao-go]'); if (!t || t.disabled) return;
      const k = t.dataset.aoGo; sh.close();
      if (k === 'online') return window.TribeShare && window.TribeShare.online ? window.TribeShare.online('friends') : null;
      if (k === 'reach') return window.TribeHostPill && window.TribeHostPill.open ? window.TribeHostPill.open() : (window.TribeApp && window.TribeApp.openInvite && window.TribeApp.openInvite());
      if (k === 'direct' || k === 'server') {
        if (!window.TribeOwnServer) return toast(T('This part did not load. Reload the app.'));
        window.TribeOwnServer.open();
        if (k === 'direct') setTimeout(() => { const p = document.getElementById('os-p2p'); if (p) p.scrollIntoView({ block: 'start' }); }, 120);
        return;
      }
      if (k === 'folder') return H && H.sharedFolder ? H.sharedFolder() : null;
      if (k === 'cloud') return cloud();
      const TC = window.TribeCopy; if (!TC) return;   // fix/p12-copies: keep, open and move copies (app/ui/tribecopy.js)
      if (k === 'save') return TC.save();
      if (k === 'open') return TC.open();
      if (k === 'move') return TC.move();
    });
    return sh;
  }
  // Free cloud: a tribe kept in this browser moves there (setuplocal.js); a tribe that is already shared opens the
  // cloud tribe beside it, the same way Run your own server does.
  function cloud() {
    const L = window.TribeLocalSetup, CH = window.TribeCloudHome;
    if (solo() && L && L.choose) return L.choose('cloud');
    if (!CH || !SH()) return toast(T('This part did not load. Reload the app.'));
    const sh = SH().sheet({ id: 'ao-cloud-sheet', eyebrow: 'Free cloud', title: 'Keep a tribe online without your computer', body: `${CH.fields('ao')}<p class="ph-note">${esc(T('Your tribe on this computer stays as it is. The cloud tribe opens beside it, and you can invite friends there.'))}</p><p class="ph-err hidden" id="ao-cloud-err" role="alert"></p>`, foot: `<span style="flex:1"></span><button type="button" class="btn primary" id="ao-cloud-go">${esc(T('Connect'))}</button>` });
    const root = sh.el, go = root.querySelector('#ao-cloud-go'), err = root.querySelector('#ao-cloud-err');
    CH.wire(root, 'ao', go);
    go.onclick = async () => {
      err.classList.add('hidden'); go.disabled = true; go.textContent = T('Connecting…');
      try {
        const me = (window.TribeStore && window.TribeStore.get()) || {};
        const c = await CH.connect({ ...CH.read(root, 'ao'), name: me.name, color: me.color });
        if (window.TribeStore) window.TribeStore.set({ server: { url: c.server, token: c.token }, hosting: false });
        toast(T('Connected. Opening your cloud tribe.')); setTimeout(() => location.reload(), 400);
      } catch (e) { err.textContent = (e && e.message) || String(e); err.classList.remove('hidden'); go.disabled = false; go.textContent = T('Connect'); }
    };
    return sh;
  }

  // ---------- What's private: only what is true (docs/CLAIMS.md, checked by e2e_agents_office) ----------
  function privacyFacts() {
    const S = (window.TribeStatus && window.TribeStatus.now && window.TribeStatus.now()) || { key: 'none' };
    let base = ''; try { base = C() && C().base ? C().base() : ''; } catch {}
    let u = null; try { u = new URL(base || location.href); } catch {}
    const host = u ? u.hostname : '', https = !!u && u.protocol === 'https:';
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /(^|\.)tauri\.localhost$/i.test(host);
    const tailnet = /\.ts\.net$/i.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host);
    const kept = { device: 'Only in this browser, on this device. Nothing leaves it.', demo: 'Only in this browser. The demo sends nothing anywhere.', here: 'On this computer, as plain files in its tribe folder.',
      friend: 'On {name}’s computer, as plain files in its tribe folder. Whoever runs that computer can open them.', cloud: 'On a free cloud server. Whoever runs that server can open the tribe’s files.',
      server: 'On the server that runs this tribe. Whoever runs it can open the tribe’s files.', none: 'Nowhere yet: there is no tribe.' }[S.key] || 'On the computer that runs this tribe. Whoever runs it can open the tribe’s files.';
    const hostM = ((C() && C().state && C().state().members) || []).find(m => m.role === 'host') || {};
    const hostName = String(hostM.name || '').split(' ')[0];
    const line = S.key === 'device' || S.key === 'demo' || S.key === 'none' ? 'Nothing goes over the network.'
      : https ? 'Encrypted on the way: the address starts with https.'
      : tailnet ? 'Encrypted on the way by Tailscale, between your devices.'
      : local ? 'This computer talks to itself: nothing goes over the network.'
      : 'Not encrypted on the way: the address starts with http. Fine on your own Wi-Fi; for friends elsewhere use a link that starts with https.';
    const out = [
      ['kept', 'lock', 'Where it is kept', T(kept, { name: hostName || T('a friend') })],
      ['wire', 'shield', 'On the way', T(line)],
      ['dm', 'eye', 'Private messages', T('Only the two people in a private message can open it. AI helpers can’t read private messages, and they never show on the office screens.')],
      ['e2e', 'x', 'Not end-to-end encrypted', T('Messages and files are not end-to-end encrypted. The computer that runs the tribe keeps them as plain files, so pick one you trust.')],
      ['keys', 'key', 'Keys and sign-ins', T('Your GitHub sign-in stays on the computer that runs the tribe and never comes back to a browser. Each AI helper has its own key you can remove.')],
    ];
    if (S.key === 'cloud') out.push(['save', 'cloud', 'Cloud save', T('A free cloud tribe keeps a signed copy of what you can see in your browser, to bring it back after a nap. Signed means nobody can change it; it is not encrypted.')]);
    return { key: S.key, https, local, tailnet, items: out };
  }
  function privacy() {
    if (!SH() || !SH().sheet) return null;
    const f = privacyFacts();
    const body = `<ul class="ao-facts" id="ao-facts">${f.items.map(([k, i, t, p]) => `<li data-fact="${k}"><span class="ao-card-i" aria-hidden="true">${ico(i, 16)}</span><div><b>${esc(T(t))}</b><p>${esc(p)}</p></div></li>`).join('')}</ul>
      <p class="faint ao-small">${esc(T('For the most privacy, run the tribe on your own computer and invite only people you trust.'))}</p>`;
    return SH().sheet({ id: 'ao-privacy-sheet', eyebrow: NAME, title: 'What’s private', body });
  }

  // ---------- GitHub ----------
  async function github(btn) {
    const G = window.TribeGitHubConnect, H = window.TribeHome;
    const state = btn && btn.closest('#ao-github') ? btn.closest('#ao-github').dataset.state : (ghLine() || {}).state || '';
    if ((state === 'linked' || state === 'backed') && H && H.ship) return H.ship();
    if (H && H.github) return H.github();
    if (G && G.open) return G.open({ pid: pidNow() });
    toast(T('This part did not load. Reload the app.'));
  }
  function friend() {
    if (window.TribeInvite && window.TribeInvite.open) return window.TribeInvite.open({ who: 'friend' });
    if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite();
  }

  // ---------- wiring ----------
  function wire(root) {
    if (!root) return;
    fill(root).catch(() => {});
    if (root.__aoWired) return; root.__aoWired = true;
    root.addEventListener('click', e => {
      const p = e.target.closest && e.target.closest('[data-ao-pick]'); if (p) { e.preventDefault(); return pick(p.dataset.aoPick); }
      const b = e.target.closest && e.target.closest('[data-ao]'); if (!b) return;
      run(b.dataset.ao, b);
    });
  }
  function run(k, b) {
    if (k === 'add') return pick('other');
    if (k === 'friend') return friend();
    if (k === 'where') return where();
    if (k === 'privacy') return privacy();
    if (k === 'github') return github(b);
  }
  // the lead and the cards follow the office and the GitHub status
  if (window.TribeClient && window.TribeClient.on) {
    let soon = 0;
    window.TribeClient.on('presence', () => { clearTimeout(soon); soon = setTimeout(() => { refreshLead(); const r = document.getElementById('ao-setup'); if (r) fill(r.parentElement || document).catch(() => {}); }, 500); });
    window.TribeClient.on('ws', m => { if (m && m.type === 'office') setTimeout(refreshLead, 300); });
  }
  addEventListener('tribe:github-connected', () => { ghLast = null; const r = document.getElementById('ao-setup'); if (r) fill(r).catch(() => {}); else ghLoad().catch(() => {}); });
  setInterval(() => { if (document.getElementById('ao-lead') && document.visibilityState === 'visible') refreshLead(); }, 9000);

  window.TribeAgentsOffice = { NAME, head, office, mountOffice, addAi, setup, wire, where, cloud, privacy, privacyFacts, pick, run, friend, ghLoad, ghLine, refresh: refreshLead, fill };
})();
