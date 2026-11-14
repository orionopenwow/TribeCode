// Publish for real (feat/publish-real, docs/PUBLISH.md): the "Where it goes" part of the one Publish sheet
// (publish.js draws the sheet and calls TribePublishReal.mount). The play link works while the tribe is online; these
// last: a zip for any web place, a live page on your own GitHub, an itch.io zip for games, an installable app, and app
// packages GitHub builds in your account (Android now; iPhone prepared, needs your Apple account).
// Server: server/publishreal.js. Shared logic: pubcore.js.
// Public: window.TribePublishReal = { mount(host, pid, form), status(pid, fresh) }   (TribePublish.status is this one).
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const ico = (n, s) => (window.TribeIcons ? window.TribeIcons.svg(n, s || 18) : '');
  const cache = {};
  const KINDS = [['site', 'Website', 'sites'], ['game', 'Game', 'bolt'], ['app', 'App', 'phone']];

  // What is published where, and the one next step. Other features (the "what to do next" guide, Flint) read this.
  async function status(pid = C.project && C.project(), fresh) {
    if (!pid) return { kind: 'site', next: 'build', dest: {}, checks: [] };
    if (cache[pid] && !fresh) return cache[pid];
    try { const s = await C.api('/publish/real?project=' + encodeURIComponent(pid)); s.nextLabel = NEXT[s.next] || ''; cache[pid] = s; }
    catch { cache[pid] = { project: pid, kind: 'site', next: 'build', nextLabel: NEXT.build, dest: {}, checks: [], offline: true }; }
    return cache[pid];
  }
  const NEXT = { build: 'Build a first version', fix: 'Fix what the safety check found', publish: 'Publish it', pages: 'Give it a link that stays up', app: 'Make it an app people can install', share: 'Share the link' };

  // ---------- icons drawn here, so the installable app and the Android app get a real picture ----------
  function drawIcon(size, name, color) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
      x.fillStyle = color || '#F26B1D'; x.fillRect(0, 0, size, size);
      x.fillStyle = '#fff'; x.font = `700 ${Math.round(size * 0.52)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((String(name || 'A').trim()[0] || 'A').toUpperCase(), size / 2, size * 0.54);
      return c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    } catch { return null; }
  }
  async function brandColor(pid) { try { const b = await C.api(`/projects/${encodeURIComponent(pid)}/brand`); const k = b && (b.kit || b); const c = k && (k.color || (k.colors && (k.colors.main || k.colors[0]))); return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : null; } catch { return null; } }

  const row = (id, icon, title, sub, body, state) => `<li class="pbr-row" data-dest="${id}"><span class="pbr-i" aria-hidden="true">${ico(icon, 18)}</span><div class="pbr-t"><div class="pbr-hd"><b>${esc(T(title))}</b>${state ? `<span class="pbr-tag">${esc(T(state))}</span>` : ''}</div><small>${sub}</small>${body ? `<div class="pbr-b">${body}</div>` : ''}</div></li>`;
  const linkbox = (id, url) => `<div class="linkbox pb-link pbr-link"><code>${esc(url)}</code><button class="btn" type="button" data-qr="${esc(url)}" aria-label="${esc(T('Show QR code'))}">QR</button><button class="btn" type="button" data-openurl="${esc(url)}">${esc(T('Open'))}</button><button class="btn primary" type="button" data-copy="${esc(url)}">${esc(T('Copy'))}</button></div><div class="qr pb-qr hidden" data-qrbox></div>`;

  async function mount(host, pid, form) {
    if (!host) return;
    host.dataset.pid = pid; host._form = form;
    host.innerHTML = `<div class="pb-spin" aria-label="${esc(T('Checking'))}"></div>`;
    const s = await status(pid, true);
    if (s.offline) { host.innerHTML = ''; return; }
    draw(host, pid, s, form);
    const f = form && form.focus, r = f && host.querySelector(`[data-dest="${f === 'install' ? 'install' : f}"]`);
    if (r) { r.classList.add('is-focus'); try { r.scrollIntoView({ block: 'center' }); } catch {} }
  }
  function draw(host, pid, s, form) {
    const d = s.dest || {}, pg = d.pages, gh = s.github || {}, can = s.canSend, game = s.kind === 'game', site = s.kind === 'site';
    const bad = (s.checks || []).filter(c => !c.ok && !c.auto), auto = (s.checks || []).filter(c => c.auto);
    const checks = !s.checks.length ? '' : `<div class="pbr-checks" id="pbr-checks"><p class="pbr-checks__h">${bad.length ? esc(T('Before it goes out')) : esc(T('Ready to go'))}</p><ul>${s.checks.map(c => `<li class="${c.ok ? 'is-ok' : c.auto ? 'is-auto' : 'is-bad'}">${ico(c.ok || c.auto ? 'check' : 'x', 14)}<span><b>${esc(T(c.label))}</b>${c.why ? `<small>${esc(c.whyKey ? fill(T(c.whyKey), c.vars) : T(c.why))}</small>` : ''}</span></li>`).join('')}</ul>${auto.length ? `<p class="faint pbr-auto">${esc(T('The ticked-in-grey ones are filled in for you when you publish.'))}</p>` : ''}</div>`;
    const kinds = `<div class="pbr-kind" role="group" aria-label="${esc(T('What is it?'))}"><span class="eyebrow">${esc(T('What is it?'))}</span>${KINDS.map(([k, l, i]) => `<button type="button" class="chip${s.kind === k ? ' is-on' : ''}" data-kind="${k}" aria-pressed="${s.kind === k}" ${can ? '' : 'disabled'}>${ico(i, 14)} ${esc(T(l))}</button>`).join('')}</div>`;

    const rows = [];
    rows.push(row('zip', 'download', 'Download it', esc(T('A zip with everything in it. Drop it on any web place and it works.')), `<button class="btn" type="button" data-zip="web">${esc(T('Download the zip'))}</button>`));
    const ghLink = !pg ? '' : `${linkbox('pages', pg.url)}${pg.pagesEnabled ? `<small class="faint">${esc(T('The first time, GitHub takes about a minute before the link opens.'))}</small>` : `<p class="pbr-warn">${esc(T('One more step: turn the page on. Open the settings, pick "Deploy from a branch", branch main, and Save.'))} <a href="${esc(pg.settingsUrl)}" target="_blank" rel="noopener">${esc(T('Open the settings'))}</a></p>`}`;
    const ghAct = !can ? (pg ? '' : `<small class="faint">${esc(T('Ask a builder to publish it.'))}</small>`)
      : !gh.signedIn ? `<button class="btn${pg ? '' : ' primary'}" type="button" data-gh-signin>${esc(T('Sign in to GitHub'))}</button><small class="faint">${esc(T(pg ? 'Sign in to update it.' : 'Free. Your page lives in your own GitHub account.'))}</small>`
      : pg ? `<button class="btn" type="button" data-pages>${esc(T('Update it'))}</button>`
        : `<label class="pb-l pbr-name">${esc(T('Its name in the link'))}<input class="input" id="pbr-name" maxlength="40" value="${esc(s.slug)}" autocomplete="off" spellcheck="false"></label><button class="btn primary" type="button" data-pages>${esc(T('Publish to GitHub'))}</button>`;
    const ghBody = ghLink + ghAct;
    rows.push(row('pages', 'github', 'A link that stays up', esc(T('A live page on GitHub, free. It stays up when your tribe is offline, and updates when you publish again.')) + (gh.login ? ` <span class="faint">@${esc(gh.login)}</span>` : ''), ghBody, pg ? 'Live' : ''));
    if (game) rows.push(row('itch', 'gift', 'itch.io', esc(T('The place people find small games. Free to list.')), s.itch && !s.itch.ok ? `<p class="pbr-warn">${esc(s.itch.keys && s.itch.keys[0] ? fill(T(s.itch.keys[0].key), s.itch.keys[0].vars) : T(s.itch.problems[0]))}</p>`
      : `<button class="btn" type="button" data-zip="itch">${esc(T('Get the itch.io zip'))}</button><ol class="pbr-steps"><li>${esc(T('On itch.io, choose Upload new project.'))}</li><li>${esc(T('Kind of project: HTML. Upload the zip and tick "This file will be played in the browser".'))}</li><li>${esc(T('Save and view the page. Set it to Public when you are happy.'))}</li></ol>`));
    if (!site) {
      rows.push(row('install', 'phone', 'Install on phones', esc(T('People open the link and add it to their home screen. It opens full screen and works with no connection.')),
        `<label class="pb-tg"><input type="checkbox" id="pbr-pwa" ${d.pwa !== false ? 'checked' : ''} ${can ? '' : 'disabled'}> <span>${esc(T('Make it installable'))} <small class="faint">${esc(T('Adds an icon, a name and an offline copy when you publish.'))}</small></span></label>${pg && d.pwa !== false ? `<small class="faint">${esc(T('Open the link on a phone, then Add to Home Screen.'))}</small>` : !pg ? `<small class="faint">${esc(T('Works from the link that stays up (above).'))}</small>` : ''}`, pg && d.pwa !== false ? 'On' : ''));
      const an = d.android || {};
      rows.push(row('android', 'tablet', 'Android app', esc(T('A real app file (APK). GitHub builds it in your account; you install nothing.')),
        !pg ? `<small class="faint">${esc(T('First give it a link that stays up (above).'))}</small>`
          : an.on ? `<div id="pbr-build" class="pbr-build"><span class="pb-spin" aria-hidden="true"></span> ${esc(T('Checking the build…'))}</div><details class="pbr-more"><summary>${esc(T('For Google Play'))}</summary><p>${esc(T('The first build is a test build you install by hand. For the store, add your own signing key as two secrets in the GitHub project (the build file says which), then upload the .aab in Play Console. A Play developer account is needed to list it.'))}</p><p>${esc(T('Android shows a slim address bar until your site lists the app’s fingerprint. Each build comes with the file to add.'))}</p></details><button class="linkish" type="button" data-wrap="android" data-on="0">${esc(T('Stop making the Android app'))}</button>`
            : `<button class="btn primary" type="button" data-wrap="android" data-on="1">${esc(T('Make the Android app'))}</button>`, an.on ? 'On' : ''));
      const io = d.ios || {};
      rows.push(row('ios', 'phone', 'iPhone app', esc(T('Apple needs a Mac and a paid Apple developer account to sign an app. There is no way round that.')),
        `<small class="faint">${esc(T('On iPhone, Install on phones already works today: open the link in Safari, Share, Add to Home Screen.'))}</small>${!pg ? '' : io.on ? `<p class="pbr-ok">${ico('check', 14)} ${esc(T('The prepared build is in your GitHub project. It runs once you add your Apple signing secrets (the file lists them).'))}</p><button class="linkish" type="button" data-wrap="ios" data-on="0">${esc(T('Remove it'))}</button>` : `<button class="btn" type="button" data-wrap="ios" data-on="1">${esc(T('Add the prepared iPhone build'))}</button>`}`));
    }
    const dk = d.desktop || {};
    rows.push(row('desktop', 'monitor', 'Computer app', esc(T('Installers for Windows, Mac and Linux. A small window that opens your page. GitHub builds them in your account.')),
      !pg ? `<small class="faint">${esc(T('First give it a link that stays up (above).'))}</small>`
        : !can ? ''
          : dk.on ? `<div id="pbr-build-desktop" class="pbr-build"><span class="pb-spin" aria-hidden="true"></span> ${esc(T('Checking the build…'))}</div><details class="pbr-more"><summary>${esc(T('Opening it the first time'))}</summary><p>${esc(T('These builds are not signed, so the computer asks before it runs them. On Windows choose More info, then Run anyway. On a Mac open it once, then choose Open Anyway in System Settings, Privacy & Security. Removing the warning needs your own certificates.'))}</p><p>${esc(T('The Mac build is for Apple chips. It needs a connection, and always shows the newest version of your page.'))}</p></details><button class="linkish" type="button" data-wrap="desktop" data-on="0">${esc(T('Stop making the computer app'))}</button>`
            : `<button class="btn" type="button" data-wrap="desktop" data-on="1">${esc(T('Make the computer app'))}</button>`, dk.on ? 'On' : ''));
    host.innerHTML = `<div class="pbr" id="pbr">${kinds}${checks}<p class="eyebrow pbr-h">${esc(T('Where it goes'))}</p><ul class="pbr-list">${rows.join('')}</ul></div>`;
    wire(host, pid, s, form);
    if ((s.dest.android || {}).on && pg) pollBuild(host, pid, 'android');
    if (dk.on && pg) pollBuild(host, pid, 'desktop');
  }
  const pollT = {};
  async function pollBuild(host, pid, what = 'android', n = 0) {
    clearTimeout(pollT[what]);
    const desk = what === 'desktop', box = host.querySelector(desk ? '#pbr-build-desktop' : '#pbr-build'); if (!box || !document.body.contains(box)) return;
    let b; try { b = await C.api('/publish/real/build?project=' + encodeURIComponent(pid) + '&what=' + what); } catch { b = { state: 'unknown' }; }
    const dl = b.download ? `<div class="pbr-dl">${linkbox('apk', b.download)}</div>` : b.releases && desk ? `<div class="pbr-dl">${linkbox('desk', b.releases)}</div>` : '';
    const page = b.page ? ` <a href="${esc(b.page)}" target="_blank" rel="noopener">${esc(T('See it on GitHub'))}</a>` : '';
    box.innerHTML = b.state === 'ready' ? `<p class="pbr-ok">${ico('check', 14)} ${esc(T(desk ? 'The installers are built. Pick the one for your computer.' : 'The app is built. Scan this with an Android phone, or open the link on it, to install.'))}</p>${dl}`
      : b.state === 'failed' ? `<p class="pbr-warn">${esc(T('The build did not finish.'))}${page}</p>`
        : b.state === 'building' || b.state === 'queued' ? `<span class="pb-spin" aria-hidden="true"></span> ${esc(T(desk ? 'GitHub is building the installers. It takes about ten minutes.' : 'GitHub is building the app. It takes a few minutes.'))}${page}`
          : `<p class="faint">${esc(T('The build runs on GitHub.'))}${page}</p>${dl}`;
    wireLinks(box);
    if (b.state === 'ready' && !desk) { const q = box.querySelector('[data-qr]'); if (q) q.click(); }   // the phone is the one that needs it: show the code straight away
    if ((b.state === 'building' || b.state === 'queued') && n < 40) pollT[what] = setTimeout(() => pollBuild(host, pid, what, n + 1), 15000);
  }
  function wireLinks(root) {
    root.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = T('Copied'); setTimeout(() => { b.textContent = T('Copy'); }, 1500); } catch { prompt(T('Copy this link'), b.dataset.copy); } });
    root.querySelectorAll('[data-openurl]').forEach(b => b.onclick = () => window.open(b.dataset.openurl, '_blank', 'noopener'));
    root.querySelectorAll('[data-qr]').forEach(b => b.onclick = () => { const box = b.closest('.pbr-link').nextElementSibling; if (!box) return; if (window.TribeQR) box.innerHTML = window.TribeQR.svg(b.dataset.qr); box.classList.toggle('hidden'); });
  }
  function wire(host, pid, s, form) {
    const again = async () => { const s2 = await status(pid, true); draw(host, pid, s2, form); try { document.dispatchEvent(new CustomEvent('tribe:publish-real', { detail: s2 })); } catch {} };
    const busy = (b, t) => { b.disabled = true; b.dataset.was = b.textContent; b.textContent = T(t); };
    const idle = b => { b.disabled = false; if (b.dataset.was) b.textContent = b.dataset.was; };
    wireLinks(host);
    host.querySelectorAll('[data-kind]').forEach(b => b.onclick = async () => { try { await C.api('/publish/real', { method: 'PUT', body: { project: pid, kind: b.dataset.kind } }); again(); } catch (e) { toast(e.message); } });
    const pwa = host.querySelector('#pbr-pwa'); if (pwa) pwa.onchange = async () => { try { await C.api('/publish/real', { method: 'PUT', body: { project: pid, pwa: pwa.checked } }); toast(T(pwa.checked ? 'It will be installable from the next publish' : 'Not installable from the next publish')); again(); } catch (e) { toast(e.message); } };
    host.querySelectorAll('[data-zip]').forEach(b => b.onclick = async () => {
      busy(b, 'Packing…');
      try {
        const base = (C.base && C.base()) || '', st0 = window.TribeStore && window.TribeStore.get(), key = (st0 && st0.server && st0.server.token) || '';
        const r = await fetch(`${base}/api/publish/real/zip?project=${encodeURIComponent(pid)}&for=${b.dataset.zip}${form && form.title && form.title() ? '&title=' + encodeURIComponent(form.title()) : ''}${form && form.desc && form.desc() ? '&desc=' + encodeURIComponent(form.desc()) : ''}`, { headers: key ? { Authorization: 'Bearer ' + key } : {} });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Could not make the zip'); }
        const blob = await r.blob(), a = document.createElement('a'), cd = r.headers.get('Content-Disposition') || '';
        a.href = URL.createObjectURL(blob); a.download = (/filename="([^"]+)"/.exec(cd) || [])[1] || 'site.zip'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        toast(T('Downloaded'));
      } catch (e) { toast(e.message); }
      idle(b);
    });
    const signin = host.querySelector('[data-gh-signin]');
    if (signin) signin.onclick = () => {
      if (s.phone && window.TribeGhPhone) {   // a phone alone: the token sheet from ghphone.js, then back to this row
        const GP = window.TribeGhPhone; GP.open(); let n = 0;
        const t = setInterval(() => { if (GP.getToken()) { clearInterval(t); delete cache[pid]; const sc = document.querySelector('.nx-scrim'); if (sc) sc.click(); if (window.TribePublish) window.TribePublish.open(pid, 'pages'); } else if (++n > 240) clearInterval(t); }, 500);
        return;
      }
      const box = signin.parentElement; if (!window.TribeGitHub || !window.TribeGitHub.mount) { location.hash = '#/settings/github'; return; }
      box.innerHTML = '<div class="pbr-gh" id="pbr-gh"></div>'; window.TribeGitHub.mount(box.querySelector('#pbr-gh'));
    };
    host.querySelectorAll('[data-pages]').forEach(b => b.onclick = async () => {
      busy(b, 'Publishing…');
      try {
        const title = (form && form.title && form.title()) || s.name, desc = (form && form.desc && form.desc()) || '';
        const color = s.dest.color || await brandColor(pid) || '#F26B1D';
        const nameEl = host.querySelector('#pbr-name');
        const r = await C.api('/publish/real/pages', { method: 'POST', body: { project: pid, title, desc, color, name: nameEl ? nameEl.value : undefined, icons: { 192: drawIcon(192, title, color), 512: drawIcon(512, title, color) } } });
        toast(T(r.pagesEnabled ? 'Published. The link is ready in about a minute.' : 'Sent to GitHub. One more step to turn the page on.'));
        again();
      } catch (e) { idle(b); toast(e.message); if ((e.data && e.data.needGithub) || /sign in/i.test(e.message)) again(); }
    });
    host.querySelectorAll('[data-wrap]').forEach(b => b.onclick = async () => {
      busy(b, 'Working…');
      try { const r = await C.api('/publish/real/wrapper', { method: 'POST', body: { project: pid, kind: b.dataset.wrap, on: b.dataset.on === '1' } }); if (b.dataset.on === '1') toast(T(b.dataset.wrap === 'android' ? 'GitHub is building your Android app' : b.dataset.wrap === 'desktop' ? 'GitHub is building your computer app' : 'Added to your GitHub project')); again(); void r; }
      catch (e) { idle(b); toast(e.message); }
    });
  }
  C.on && C.on('ws', m => { if (m && m.type === 'publish' && m.project) delete cache[m.project]; if (m && m.type === 'github') { for (const k of Object.keys(cache)) delete cache[k]; const h = document.getElementById('pb-real'); if (h && h.dataset.pid && document.body.contains(h)) mount(h, h.dataset.pid, h._form); } });
  C.on && C.on('project', () => { for (const k of Object.keys(cache)) delete cache[k]; });

  window.TribePublishReal = { mount, status, NEXT, drawIcon };
})();
