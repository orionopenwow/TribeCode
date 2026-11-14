// The one invite sheet (feat/invite-one). Every way to invite opens it: Home's "Invite a friend", the sidebar rows,
// People, a project's menu, the create-a-tribe flow, the empty chat and Flint. It asks one thing first, "Who?":
//   A friend           the tribe link with a QR. "A one-time link instead" swaps it for a link that runs out; inside a
//                      project, "Just this project" makes the link show them only that project.
//   A guest for a day  a guest pass: works once, and the account it makes stops after 24 hours.
//   Your AI agent      Invite your agent: Claude, Cursor, Codex, ChatGPT, Gemini… (inviteagent.js draws this part).
// It lives in the shared modal (#invite-modal). Nothing is made on the server until the person asks for it: the tribe
// link already exists, a one-time or project link is made when its switch goes on, a guest pass when its button is
// pressed, and the agent member on Copy or Download. The server APIs are unchanged (/api/tribe-link, /api/invites).
//   window.TribeInvite = { open({ who, project, once, link, name, kind, fresh }), close(), isOpen(), state() }
//     who:     'friend' (default) | 'guest' | 'agent'   ('claude', its first name, still works and lands on Claude)
//     kind:    with who 'agent': which agent the picker starts on ('cursor', 'codex', 'claude'…)
//     project: a project id (or true for the current one): "Just this project" starts on
//     link:    a link that already exists (a new project's invite, from flow.js); name: what it is for
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m, k) : null);
  const swap = fn => (window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(fn) : fn());
  const WHO = [['friend', 'A friend', 'A link they open to join'], ['guest', 'A guest for a day', 'A pass that works once'], ['agent', 'Your AI agent', 'Claude, Cursor, Codex and more']];
  // three large choices, each with a stroke icon from icons.js (people, a clock for the day pass, the agent plug)
  const ICON = { friend: 'people', guest: 'clock', agent: 'agent' }, TONE = { friend: 'k-ember', guest: 'k-indigo', agent: 'k-teal' };
  const glyph = k => (window.TribeIcons ? window.TribeIcons.svg(ICON[k], 26) : '');
  const GLYPH = { get friend() { return glyph('friend'); }, get guest() { return glyph('guest'); }, get agent() { return glyph('agent'); } };
  const wide = () => !matchMedia('(max-width: 820px)').matches;   // on a computer the QR sits beside the link from the start
  const IA = () => window.TribeInviteAgent;
  const KIND = { public: 'Works from anywhere', tailscale: 'Works on your Tailscale network', wifi: 'Same Wi-Fi only', local: 'This computer only' };
  let st = null;   // { who, once, proj, pid, preset, name, made, guest, seq }

  const me = () => (C.state && C.state().me) || {};
  const projects = () => (window.TribeProjects && window.TribeProjects.list && window.TribeProjects.list()) || [];
  const curPid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C.state && C.state().project) || '';
  const scoped = () => Array.isArray(me().projects);   // someone invited to a project can only invite to it
  const solo = () => !!(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
  const projName = pid => { const p = projects().find(x => x.id === pid); return p ? p.name : 'this project'; };
  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  const modal = () => $('#invite-modal'), body = () => $('#invite-body');
  const isOpen = () => !!(st && modal() && !modal().classList.contains('hidden') && body() && body().classList.contains('io'));

  // The address to share: localhost only works here, so prefer the public (or network) one, and the Pages link when public.
  async function shareLink(code) {
    let base = C.base(), site = null, note = '';
    try {
      const h = await C.api('/health'), pick = (h.lan || [])[0]; site = h.site || null;
      if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) { base = pick.url; note = pick.kind === 'public' ? 'Public https address: works from anywhere, and voice works on phones.' : pick.kind === 'tailscale' ? 'Tailscale address: works anywhere your friend is signed in to Tailscale.' : 'Wi-Fi address: your friend needs to be on the same network (or use Tailscale).'; }
    } catch {}
    return { link: site && /^https:/.test(base) ? `${site}/app/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(code)}` : `${base}/join/${code}`, note };
  }

  function close() {
    const m = modal(), b = body(); if (!m || !b) return;
    if (b.classList.contains('io')) { m.classList.add('hidden'); b.classList.remove('io', 'ii'); }
    if (IA() && IA().unmount) IA().unmount();
    if (tidying) { tidying.disconnect(); tidying = null; }
    st = null;
  }

  function open(opts) {
    opts = opts || {};
    const App = window.TribeApp;
    // No tribe yet: there is nobody to invite to. The join / host sheet is the way in (app.js).
    if (!C || !C.connected || !C.connected()) { if (App && App.joinOrHost) App.joinOrHost(); return; }
    const m = modal(), b = body(); if (!m || !b) return;
    const pid = typeof opts.project === 'string' ? opts.project : curPid();
    const asked = opts.who === 'claude' ? 'agent' : opts.who;   // 'claude': what the third choice was called first
    const who = WHO.some(w => w[0] === asked) ? asked : 'friend';
    st = { who, once: !!opts.once, proj: !!opts.project || scoped(), pid, preset: opts.link || '', presetKind: opts.linkKind || '', name: opts.name || '', made: null, guest: null, seq: 0, agent: { kind: opts.kind || (opts.who === 'claude' ? 'claude' : undefined), fresh: !!opts.fresh, welcome: !!opts.welcome } };
    if (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active() && !solo()) st.once = true;   // the offline demo has no tribe link: its pretend link is a one-time one
    b.className = 'modal-card io' + (st.preset ? ' ii' : '');
    m.classList.remove('hidden'); m.setAttribute('aria-label', 'Invite');
    m.onclick = e => { if (e.target === m) close(); };
    draw();
    if (st.preset) copyText(st.preset).then(ok => { if (ok && isOpen()) { const c = $('#ii-copy'); if (c) c.textContent = 'Copied'; const t = $('#io-made-title'); if (t) t.textContent = 'Link copied. Send it to your friend.'; } });
  }

  // "Just this project" only means something inside a project of a tribe that has more than one (or for a scoped member).
  const canScope = () => !!st.pid && (projects().length > 1 || scoped() || !!st.preset);
  const sw = (id, on, title, sub, dis) => `<button type="button" class="toggle io-sw" role="switch" id="${id}" aria-checked="${!!on}"${dis ? ' disabled' : ''}><span class="io-swt"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="switch"></span></button>`;

  function draw() {
    const b = body(); if (!b || !st) return;
    b.innerHTML = `<span class="eyebrow">Invite</span><h2 id="io-title">Who are you inviting?</h2>
      <div class="io-who" role="tablist" aria-label="Who">${WHO.map(([k, t, s]) => `<button type="button" role="tab" class="io-opt${k === st.who ? ' on' : ''}" id="io-who-${k}" data-io-who="${k}" aria-selected="${k === st.who}" aria-controls="io-pane"><span class="io-glyph ${TONE[k]}" aria-hidden="true">${GLYPH[k]}</span><span class="io-ot"><b>${t}</b><small>${s}</small></span></button>`).join('')}</div>
      <div class="io-pane" id="io-pane" role="tabpanel" aria-labelledby="io-who-${st.who}" data-who="${st.who}"></div>
      <div class="modal-foot"><span class="io-flex"></span><button class="btn primary" data-close>Done</button></div>`;
    b.querySelectorAll('[data-close]').forEach(x => x.onclick = close);
    b.querySelectorAll('[data-io-who]').forEach(x => x.onclick = () => { if (x.dataset.ioWho !== st.who) pick(x.dataset.ioWho); });
    pane();
  }
  function pick(who) {
    if (!st) return;
    if (st.who === 'agent' && IA() && IA().unmount) IA().unmount();
    st.who = who;
    swap(() => {
      document.querySelectorAll('#invite-body [data-io-who]').forEach(x => { const on = x.dataset.ioWho === who; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      const p = $('#io-pane'); if (p) { p.dataset.who = who; p.setAttribute('aria-labelledby', 'io-who-' + who); }
      pane();
    });
  }
  function pane() {
    const p = $('#io-pane'); if (!p || !st) return;
    if (st.who === 'agent') {
      p.innerHTML = '<div class="ic-pane" id="ic-body"></div>';
      if (IA() && IA().mount) IA().mount($('#ic-body'), st.agent);
      return;
    }
    const role = me().role;
    if (role === 'spectator' || role === 'agent') { p.innerHTML = '<p class="io-calm">Spectators watch along, so they can\'t invite people. Ask the host for a builder seat.</p>'; return; }
    // A project that lives only on this device has nowhere for a friend to arrive yet: say so, with the way on.
    if (solo()) {
      p.innerHTML = `<div class="io-calm"><p>This project lives on this device. Choose where it lives first, then friends can join.</p><button type="button" class="btn primary" id="io-where">Choose where it lives</button></div>`;
      $('#io-where').onclick = () => { close(); const L = window.TribeLocalSetup, P = window.TribePhoneHost; if (L && L.where && !matchMedia('(max-width: 820px)').matches) L.where(); else if (P && P.move) P.move(); };
      return;
    }
    if (st.who === 'guest') return guestPane(p);
    friendPane(p);
  }

  // ---------- A friend ----------
  function friendPane(p) {
    const pre = st.preset ? 'ii' : 'inv', scope = canScope();
    p.innerHTML = `<section class="tl-box" id="tl-box"><span class="eyebrow">Your tribe link</span><p class="faint tl-sub">One link for your whole tribe. Anyone with it picks a name and they're in, on a phone or a computer. No AI needed.</p>
        <div class="linkbox"><code id="tl-link">…</code><button class="btn io-qrb" id="tl-qrb" title="Show a QR code to scan with a phone" aria-label="Show QR code" aria-expanded="${wide()}">QR</button><button class="btn primary io-copy" id="tl-copy" disabled>Copy</button></div>
        <div class="qr tl-qr${wide() ? '' : ' hidden'}" id="tl-qr"></div><details class="io-manage" id="tl-manage" hidden><summary>Rename, renew or turn off</summary><div class="tl-row" id="tl-row"></div></details></section>
      <section class="tl-box io-made" id="io-made" hidden><span class="eyebrow" id="io-made-eyebrow"></span><p class="faint tl-sub" id="io-made-title"></p>
        <div class="linkbox ${pre}-link"><code id="${pre}-link">Making a link…</code><button class="btn io-qrb" id="${pre}-qrbtn" title="Show a QR code to scan with a phone" aria-label="Show QR code">QR</button><button class="btn primary io-copy" id="${pre}-copy" disabled>Copy</button></div>
        <div class="io-kind" id="io-kind" hidden></div>
        <div class="io-qr${pre === 'ii' && !wide() ? ' hidden' : ''}" id="${pre}-qr"></div><p class="faint io-net" id="inv-net"></p>
        ${navigator.share ? '<div class="io-acts"><button type="button" class="btn" id="io-share">Share…</button></div>' : ''}</section>
      <div class="io-switches">
        <details class="tl-more io-once" id="io-once-box"${st.once ? ' open' : ''}><summary class="toggle io-sw" role="switch" id="io-once" aria-checked="${!!st.once}"><span class="io-swt"><b>A one-time link instead</b><small>It runs out. Pick how long it lasts and how many people can use it.</small></span><span class="switch"></span></summary>
          <div class="opts"><select id="inv-uses" title="How many people can use it" aria-label="How many people can use it"><option value="1">Just 1 person</option><option value="5">Up to 5 people</option><option value="20">Up to 20 people</option></select>
            <select id="inv-hours" title="Link expires after" aria-label="Link expires after"><option value="24">Lasts 24 hours</option><option value="168">Lasts 7 days</option><option value="1">Lasts 1 hour</option></select>
            <select id="inv-role" title="Builders can edit; spectators can only watch" aria-label="What they can do"><option value="builder">They can build</option><option value="spectator">They can only watch</option></select></div></details>
        ${scope ? sw('io-project', st.proj, 'Just this project', `They only see ${projName(st.pid)}, not the rest of the tribe.`, scoped()) : ''}
      </div>
      <details class="io-manage io-ways" id="io-ways" hidden><summary>Friends somewhere else? More ways to share</summary><div id="io-ways-body"></div></details>`;
    const box = $('#io-once-box');
    box.addEventListener('toggle', () => { st.once = box.open; $('#io-once').setAttribute('aria-checked', String(box.open)); if (st.preset && box.open) st.preset = ''; sync(); });
    const pj = $('#io-project'); if (pj) pj.onclick = () => { st.proj = !st.proj; pj.setAttribute('aria-checked', String(st.proj)); if (st.preset && !st.proj) st.preset = ''; sync(); };
    ['#inv-hours', '#inv-uses', '#inv-role'].forEach(s => $(s).addEventListener('change', () => { st.made = null; sync(); }));
    $('#tl-qrb').onclick = () => { const q = $('#tl-qr'), v = $('#tl-copy').dataset.v; if (!v) return; q.innerHTML = window.TribeQR.svg(v); $('#tl-qrb').setAttribute('aria-expanded', String(!q.classList.toggle('hidden'))); };
    $('#tl-copy').onclick = async () => { if (await copyText($('#tl-copy').dataset.v)) { toast('Tribe link copied'); done(); } else getSelection().selectAllChildren($('#tl-link')); };
    const linkOf = () => ($(`#${pre}-link`) || {}).textContent || '';
    $(`#${pre}-copy`).onclick = async () => { if (await copyText(linkOf())) { $(`#${pre}-copy`).textContent = 'Copied'; toast('Invite link copied'); done(); } else { getSelection().selectAllChildren($(`#${pre}-link`)); toast('Press Ctrl+C to copy'); } };
    $(`#${pre}-qrbtn`).onclick = () => { const q = $(`#${pre}-qr`); if (!q.classList.toggle('hidden')) qr(q, linkOf()); };
    const sh = $('#io-share'); if (sh) sh.onclick = () => navigator.share({ title: 'Join me on TribeCode', text: `Build ${st.name || 'this'} with me on TribeCode: ${linkOf()}`, url: linkOf() }).catch(() => {});
    tribeLink();
    sync();
    tidy();
  }
  // Two older helpers add themselves to this sheet (web.js: "Share beyond my Wi-Fi", for the host; livingrepo.js: "Ways
  // to share"). They belong to A friend only, below the link: the switch joins the other switches, the ways go in a fold.
  let tidying = null;
  function tidy() {
    const b = body(); if (!b) return;
    if (tidying) tidying.disconnect();
    const run = () => {
      if (!st) return;
      const pub = $('#share-pub'), ways = $('#lr-inv-ways'), sws = $('#invite-body .io-switches'), wb = $('#io-ways-body');
      if (pub) { if (st.who !== 'friend' || !sws) pub.remove(); else if (pub.parentNode !== sws) sws.appendChild(pub); }
      if (ways) { if (st.who !== 'friend' || !wb) ways.remove(); else if (ways.parentNode !== wb) { wb.appendChild(ways); $('#io-ways').hidden = false; } }
    };
    tidying = new MutationObserver(run); tidying.observe(b, { childList: true, subtree: true }); run();
  }
  const qr = (el, link) => { if (el && link && /^https?:/.test(link) && window.TribeQR) el.innerHTML = `<div class="qr">${window.TribeQR.svg(link)}</div><p class="faint">Scan with a phone camera to join.</p>`; };
  const done = () => { try { if (window.TribeStore) window.TribeStore.set({ checklist: { invite: true } }); } catch {} };

  // Which block shows: the tribe link, or a made link (one-time, or to one project). Makes the link when it is needed.
  function sync() {
    if (!st || st.who !== 'friend') return;
    const made = $('#io-made'), tl = $('#tl-box'); if (!made || !tl) return;
    const needs = st.once || st.proj || !!st.preset;
    tl.hidden = needs; made.hidden = !needs;
    if (!needs) return;
    const pre = st.preset ? 'ii' : 'inv', link = $(`#${pre}-link`) || $('#inv-link') || $('#ii-link'), copy = $(`#${pre}-copy`) || $('#inv-copy') || $('#ii-copy');
    const where = st.proj ? projName(st.pid) : 'your tribe';
    $('#io-made-eyebrow').textContent = st.preset ? `Invite friends · ${st.name || where}` : st.once ? `One-time link · ${where}` : `Link to ${where}`;
    $('#io-made-title').textContent = st.preset ? 'Send this link to your friend. They tap it, type a name and they\'re in. Good for 3 days, up to 10 people.' : st.once ? 'It stops working when it runs out or has been used.' : `They only see ${where}. Good for 3 days, up to 10 people.`;
    const kind = $('#io-kind');
    if (st.preset) {
      link.textContent = st.preset; link.title = st.preset; copy.disabled = false;
      { const q = $(`#${pre}-qr`); if (q && !q.classList.contains('hidden') && !q.firstChild) qr(q, st.preset); }
      if (kind && st.presetKind) { kind.hidden = false; kind.className = 'io-kind ' + (st.presetKind === 'public' ? 'ok' : 'warn'); kind.innerHTML = esc(KIND[st.presetKind] || '') + (st.presetKind === 'public' ? '' : ' · <button type="button" class="linkish" id="ii-public">Make it work from anywhere</button>'); const pb = $('#ii-public'); if (pb) pb.onclick = goPublic; }
      return;
    }
    if (kind) kind.hidden = true;
    const want = JSON.stringify([st.once, st.proj && st.pid, st.once && $('#inv-hours').value, st.once && $('#inv-uses').value, st.once && $('#inv-role').value]);
    if (st.made && st.made.want === want) { link.textContent = st.made.link; copy.disabled = false; qr($(`#${pre}-qr`), st.made.link); $('#inv-net').textContent = st.made.note; return; }
    make(want);
  }
  async function make(want) {
    const seq = ++st.seq, link = $('#inv-link'), copy = $('#inv-copy'); if (!link) return;
    copy.disabled = true; copy.textContent = 'Copy'; link.textContent = 'Making a link…'; $('#inv-qr').innerHTML = '';
    const bodyOf = st.once ? { hours: +$('#inv-hours').value, maxUses: +$('#inv-uses').value, role: $('#inv-role').value } : { hours: 72, maxUses: 10, role: 'builder' };
    // "tribe" says the whole tribe out loud: without it the server would pick the room this person is in.
    const project = st.proj && st.pid ? st.pid : 'tribe';
    try {
      const { invite } = await C.api('/invites', { method: 'POST', body: { ...bodyOf, project } });
      const s = await shareLink(invite.code);
      if (!st || seq !== st.seq) return;
      st.made = { want, link: s.link, note: s.note, code: invite.code };
      link.textContent = s.link; link.title = s.link; copy.disabled = false; qr($('#inv-qr'), s.link); $('#inv-net').textContent = s.note;
      done();
    } catch (e) { if (st && seq === st.seq) link.textContent = 'Could not make a link: ' + e.message; }
  }
  // v0.26 tribe link: <host>/t/<name>, permanent until the host renames, renews or turns it off.
  async function tribeLink(patch) {
    const el = $('#tl-link'); if (!el) return;
    try {
      const r = patch ? await C.api('/tribe-link', { method: 'PUT', body: patch }) : await C.api('/tribe-link');
      if (!$('#tl-link')) return;
      const host = me().role === 'host', on = r.on !== false;
      $('#tl-link').textContent = on ? r.short : 'The tribe link is off'; $('#tl-copy').disabled = !on; $('#tl-copy').dataset.v = on ? r.short || '' : '';
      const q = $('#tl-qr'); if (q && !q.classList.contains('hidden')) { if (on) q.innerHTML = window.TribeQR.svg(r.short); else q.classList.add('hidden'); }
      $('#tl-manage').hidden = !host;
      $('#tl-row').innerHTML = host ? `<label class="tl-name">${esc((r.short || '').replace(/\/t\/[^/]*$/, '/t/'))}<input class="input" id="tl-slug" value="${esc(r.slug || '')}" maxlength="32" aria-label="Tribe link name" spellcheck="false"></label><button class="btn sm" id="tl-save">Rename</button><button class="btn sm" id="tl-renew" title="The old link stops working">New link</button><button class="btn sm" id="tl-onoff">${on ? 'Turn off' : 'Turn on'}</button>` : '';
      if (host) {
        $('#tl-save').onclick = () => tribeLink({ slug: $('#tl-slug').value });
        $('#tl-slug').onkeydown = e => { if (e.key === 'Enter') tribeLink({ slug: $('#tl-slug').value }); };
        $('#tl-renew').onclick = () => tribeLink({ renew: true }).then(() => toast('New tribe link made. The old one stopped working.'));
        $('#tl-onoff').onclick = () => tribeLink({ on: !on });
      }
    } catch (e) { if ($('#tl-link')) $('#tl-link').textContent = e.message; }
  }
  // A new project's link that only works on this network: turn on the public address and swap the link in.
  async function goPublic() {
    const pub = $('#ii-public'); if (!pub) return;
    pub.disabled = true; pub.textContent = 'Turning it on…';
    try {
      await C.api('/share/public', { method: 'POST', body: {} });
      const r = await C.api('/flow');
      if (r.flow && r.flow.invite && r.flow.invite.kind === 'public' && st) { st.preset = r.flow.invite.link; st.presetKind = 'public'; sync(); if (await copyText(st.preset)) toast('Public link copied'); return; }
      pub.textContent = 'Still local. Settings › Public link has the details';
    } catch (e) { pub.textContent = e.message; }
  }

  // ---------- A guest for a day ----------
  function guestPane(p) {
    const scope = canScope(), g = st.guest;
    p.innerHTML = `<section class="tl-box" id="io-guest"><span class="eyebrow">Guest pass · one use · 24 hours</span>
        <p class="faint tl-sub">For a quick look or a playtest. The link works once, and the account it makes stops working after a day. Nothing to clean up.</p>
        ${g ? `<div class="linkbox"><code id="io-guest-link" title="${esc(g.link)}">${esc(g.link)}</code><button class="btn io-qrb" id="io-guest-qrb" title="Show a QR code to scan with a phone" aria-label="Show QR code">QR</button><button class="btn primary io-copy" id="io-guest-copy">Copy</button></div>
          <div class="io-qr${wide() ? '' : ' hidden'}" id="io-guest-qr"></div><p class="faint io-net">${esc(g.note)}</p>
          <div class="io-acts"><button type="button" class="btn" id="io-guest-make">Make another pass</button></div>`
        : '<div class="io-acts"><button type="button" class="btn primary" id="io-guest-make">Make a guest pass</button></div>'}</section>
      ${scope ? `<div class="io-switches">${sw('io-project', st.proj, 'Just this project', `The guest only sees ${projName(st.pid)}.`, scoped())}</div>` : ''}`;
    const pj = $('#io-project'); if (pj) pj.onclick = () => { st.proj = !st.proj; st.guest = null; guestPane(p); };
    $('#io-guest-make').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const { invite } = await C.api('/invites', { method: 'POST', body: { guest: true, hours: 24, project: st.proj && st.pid ? st.pid : 'tribe' } });
        const s = await shareLink(invite.code); if (!st) return;
        st.guest = { link: s.link, note: s.note, code: invite.code }; guestPane(p);
        if (await copyText(s.link)) { toast('Guest pass copied'); const c = $('#io-guest-copy'); if (c) c.textContent = 'Copied'; }
        done();
      } catch (err) { b.disabled = false; toast(err.message); }
    };
    const c = $('#io-guest-copy'); if (c) c.onclick = async () => { if (await copyText(g.link)) { c.textContent = 'Copied'; toast('Guest pass copied'); } else getSelection().selectAllChildren($('#io-guest-link')); };
    const qb = $('#io-guest-qrb'); if (qb) qb.onclick = () => { const q = $('#io-guest-qr'); if (!q.classList.toggle('hidden')) qr(q, g.link); };
    { const q = $('#io-guest-qr'); if (g && q && !q.classList.contains('hidden')) qr(q, g.link); }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
  // The create-a-tribe flow ended on "Invite friends" and the page reloaded into the new tribe: open the sheet there.
  (function afterReload() {
    let want = ''; try { want = sessionStorage.getItem('tribecode.invite.after') || ''; sessionStorage.removeItem('tribecode.invite.after'); } catch {}
    if (!want || !C || !C.on) return;
    let did = false; const go = () => { if (did || !C.connected()) return; did = true; setTimeout(() => open({ who: want }), 600); };
    C.on('hello', go); setTimeout(go, 1500);
  })();
  window.TribeInvite = { open, close, isOpen, state: () => (st ? { who: st.who, once: st.once, project: st.proj ? st.pid : null } : null) };
})();
