// "Give Flint a local brain (recommended)": the one setup step for Flint's on-device intelligence (feat/flint-local).
// It offers the small word-meaning model (flintmodel.js, level 1) in the places a new person passes:
//   · Home, right after sign-up or after making a first tribe (a banner, once)
//   · the project dashboard's Getting started list (an extra row under the steps; not one of the counted steps)
//   · Settings › Plan & AI
//   · once more from Flint's chat, for someone who said Later, the first time he misses something
//     ("I'd have understood that with my local brain. Set it up?")
// Never blocking: Download now or Later, remembered on this device. It looks at the connection (Network Information
// API, where the browser has it) and free space (StorageManager.estimate) and says why it would wait. The download
// shows progress, can be cancelled, and resumes where it stopped. Nothing is fetched until the person presses Download.
//   window.TribeFlintSetup = { state(), advise(), mount(el, where), offer(), missed(H), act(arg), later(), stepRow() }
(function () {
  'use strict';
  const KEY = 'tribecode.flintsetup', OFFER = 'tribecode.flintsetup.offer';
  const FM = () => window.TribeFlintModel;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mb = n => (n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024 * 10) / 10} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const state = () => ({ choice: null, reoffered: false, ...(ls.get(KEY) || {}), installed: !!(FM() && FM().installed()) });
  const save = patch => { const cur = ls.get(KEY) || {}; ls.set(KEY, { ...cur, ...patch, at: new Date().toISOString() }); try { document.dispatchEvent(new CustomEvent('flintsetup', { detail: state() })); } catch {} };
  const decided = () => { const s = state(); return s.installed || s.choice === 'later'; };

  // should it wait? -> { wait, why, metered, low, free, size }
  async function advise(size) {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const slow = !!(c && (/(^|-)2g$|^3g$/.test(c.effectiveType || '') || (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 0.7)));
    const metered = !!(c && (c.saveData || c.type === 'cellular'));
    let free = null; try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e && typeof e.quota === 'number') free = Math.max(0, e.quota - (e.usage || 0)); } } catch {}
    const need = Math.max(60 * 1024 * 1024, (size || 30 * 1024 * 1024) * 3), low = free != null && free < need;
    const why = low ? `This device has about ${mb(free)} free for this site, so I’d make some room first.` : metered ? (c.saveData ? 'Data saver is on, so I’d wait until it is off or you are on Wi-Fi.' : 'You look to be on mobile data, so I’d wait for Wi-Fi.') : slow ? 'The connection looks slow right now, so I’d wait for a better one.' : '';
    return { wait: low || metered || slow, why, metered, slow, low, free, size: size || 0 };
  }

  // ---------- the card (shared by every place it shows) ----------
  const cards = new Set(); let running = null, lastErr = '';
  async function draw(el) {
    if (!el.isConnected) { cards.delete(el); return; }
    const M = FM(); if (!M) { el.innerHTML = ''; return; }
    const where = el.dataset.where || 'home', s = state(), i = await M.info(), size = i.bytes || i.approx || 0, part = s.installed ? null : await M.partial(), adv = s.installed ? { wait: false } : await advise(size);
    if (!el.isConnected) return;
    const from = i.hosted ? 'your tribe’s host' : (() => { try { return new URL(i.base).host; } catch { return 'its publisher'; } })();
    const sz = `${i.bytes ? '' : 'about '}${mb(size)}`;
    if (s.installed) {
      const f = M.status().installed || {};
      el.innerHTML = `<div class="fsu fsu-on" data-fs-card="${esc(where)}"><div class="fsu-t"><span class="eyebrow">Flint · on this device</span><b id="fsu-title-${esc(where)}">Flint’s local brain is on</b><small>${esc(f.name || i.name)} · ${esc(mb(f.bytes || size))} on this device. It runs here; nothing you type is sent anywhere for it.</small></div>
        <div class="fsu-acts"><button type="button" class="btn sm" data-fs="device">What this device can do</button>${where === 'settings' ? '<button type="button" class="btn ghost sm" data-fs="manage">Manage or remove</button>' : '<button type="button" class="btn ghost sm" data-fs="dismiss">Got it</button>'}</div></div>`;
      return;
    }
    const calm = where === 'steps';   // in the Getting started list the next step keeps the one primary button
    const pct = running && running.total ? Math.min(100, Math.round(running.got / running.total * 100)) : part && part.total ? Math.round(part.got / part.total * 100) : 0;
    el.innerHTML = `<div class="fsu${adv.wait ? ' fsu-wait' : ''}" data-fs-card="${esc(where)}" role="group" aria-label="Give Flint a local brain">
      <img class="fsu-face" src="assets/flint.svg" alt="" width="36" height="36" aria-hidden="true">
      <div class="fsu-t"><span class="eyebrow">Recommended</span><b>Give Flint a local brain</b>
        <small>A small model that knows which words mean similar things, so Flint understands you in your own words. <span class="fsu-size">${esc(sz)}</span>, one download from ${esc(from)}. It runs on this device and nothing you type is sent anywhere.${i.phone ? ' This is the smaller version, for phones.' : ''}</small>
        ${adv.wait && !running ? `<small class="fsu-why" role="status">${esc(adv.why)} You can still download it now.</small>` : ''}
        ${lastErr && !running ? `<small class="fsu-err" role="alert">${esc(lastErr)}</small>` : ''}
        ${running || part ? `<div class="fsu-prog"><span class="fmd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Download"><i style="width:${pct}%"></i></span><small class="fsu-pct">${running ? `${mb(running.got)}${running.total ? ` of ${mb(running.total)}` : ''}` : `Paused at ${mb(part.got)}${part.total ? ` of ${mb(part.total)}` : ''}`}</small></div>` : ''}</div>
      <div class="fsu-acts">${running ? '<button type="button" class="btn sm" data-fs="cancel">Pause</button>'
        : `<button type="button" class="btn sm${adv.wait || calm ? '' : ' primary'}" data-fs="get">${part ? 'Resume' : adv.wait ? 'Download anyway' : 'Download now'}</button><button type="button" class="btn sm${adv.wait && !calm ? ' primary' : ' ghost'}" data-fs="later">Later</button>`}</div></div>`;
  }
  const redraw = () => cards.forEach(el => draw(el));
  function progress(p) { cards.forEach(el => { const bar = el.querySelector('.fmd-bar'), t = el.querySelector('.fsu-pct'); if (!bar || !t) return draw(el); const pct = p.total ? Math.min(100, Math.round(p.got / p.total * 100)) : 0; bar.setAttribute('aria-valuenow', pct); bar.firstElementChild.style.width = pct + '%'; t.textContent = `${mb(p.got)}${p.total ? ` of ${mb(p.total)}` : ''}`; }); }
  async function start() {
    const M = FM(); if (!M || running) return; running = { got: 0, total: 0 }; lastErr = ''; redraw();
    try { await M.install(p => { running = p; progress(p); }); running = null; save({ choice: 'done' }); ls.set(OFFER, null); if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast('Flint’s local brain is on'); }
    catch (e) { running = null; lastErr = e.name === 'AbortError' ? '' : /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'The download stopped (the connection dropped). What arrived is kept: press Resume.' : `${e.message} Nothing was installed.`; }
    redraw();
  }
  function later() { save({ choice: 'later' }); ls.set(OFFER, null); const b = document.getElementById('fs-step'); if (b) b.remove(); redraw(); }
  function mount(el, where) { if (!el) return; el.dataset.where = where || 'home'; el.classList.add('fsu-mount'); cards.add(el); draw(el); return el; }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-fs]'); if (!b) return;
    const k = b.dataset.fs;
    if (k === 'get') start();
    else if (k === 'cancel') { const M = FM(); if (M) M.stop(); }   // stops the download in flight; the pieces that arrived stay for Resume
    else if (k === 'later') later();
    else if (k === 'dismiss') { ls.set(OFFER, null); const s = document.getElementById('fs-step'); if (s) s.remove(); const row = b.closest('.ock-flint'); if (row) row.remove(); }
    else if (k === 'manage') { const M = FM(); if (M) M.open(); }
    else if (k === 'device') { if (window.TribeSettings && window.TribeSettings.close) try { window.TribeSettings.close(); } catch {} if (window.TribeFlintPage) window.TribeFlintPage.open('', 'device'); }
  });
  document.addEventListener('flintmodel', redraw);

  // ---------- Home: the banner after sign-up or a first tribe ----------
  function banner() {
    const hub = document.querySelector('#view-hub'), old = document.getElementById('fs-step');
    if (!hub || !ls.get(OFFER) || state().choice === 'later' || !FM()) { if (old && !(state().installed && ls.get(OFFER))) old.remove(); return; }
    if (old && old.isConnected) return;
    const el = Object.assign(document.createElement('section'), { id: 'fs-step', className: 'fs-step' }); el.setAttribute('aria-label', 'Give Flint a local brain');
    const after = hub.querySelector('#sg-next'); if (after && after.nextSibling) hub.insertBefore(el, after.nextSibling); else if (after) hub.appendChild(el); else hub.insertBefore(el, hub.firstChild);
    mount(el, 'home');
  }
  function offer() { if (decided()) return; ls.set(OFFER, 1); setTimeout(banner, 80); }
  addEventListener('tribe-project-created', () => offer());
  addEventListener('tribe-account-created', () => offer());
  function boot() { const hub = document.querySelector('#view-hub'); if (hub) new MutationObserver(() => { if (ls.get(OFFER) && !hub.querySelector('#fs-step')) banner(); }).observe(hub, { childList: true }); if (ls.get(OFFER)) banner(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);

  // ---------- the project dashboard: an extra row under Getting started (projects.js) ----------
  const stepRow = () => { const s = state(); return !FM() || s.choice === 'later' || (s.installed && s.choice === 'done' && !ls.get(OFFER)) ? '' : '<div class="ock-row ock-flint" data-step="flint" data-fs-slot="steps"></div>'; };
  new MutationObserver(() => { document.querySelectorAll('[data-fs-slot]:not(.fsu-mount)').forEach(el => mount(el, el.dataset.fsSlot)); }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- Flint's chat: one re-offer, the first time he misses something ----------
  function missed(H) {
    const s = state(); if (s.installed || s.reoffered || s.choice !== 'later' || !FM() || !H || !H.say) return false;   // only someone who said Later is asked again, once
    save({ reoffered: true });
    H.say('I’d have understood that with my local brain. Set it up? It is a small download that runs on this device, and nothing you type is sent anywhere.', [H.act('Set it up', 'flintsetup', 'get'), H.act('Not now', 'flintsetup', 'later')]);
    return true;
  }
  function act(arg) { if (arg === 'later') return later(); const M = FM(); if (M) M.open(); if (arg === 'get') setTimeout(() => { const b = document.querySelector('#fmd-get'); if (b) b.focus(); }, 60); }

  // ---------- Settings › Plan & AI ----------
  function settings() { const T = window.TribeSettings; if (!T || !T.addSection || settings.done) return; settings.done = true; try { T.addSection('ai', { id: 'flint-local', title: 'Flint’s local brain', render: el => { el.innerHTML = '<div id="set-flintsetup"></div><p class="set-hint">Level 1 is the small helper above. Want Flint to write, not only match? <button type="button" class="linkish" id="set-flintllm">Choose a local model (level 2)</button> · <button type="button" class="linkish" id="set-flintfacts">What Flint knows about this project</button></p>'; mount(el.querySelector('#set-flintsetup'), 'settings'); el.querySelector('#set-flintllm').onclick = () => window.TribeFlintLLM && window.TribeFlintLLM.open(); el.querySelector('#set-flintfacts').onclick = () => window.TribeFlintFacts && window.TribeFlintFacts.open(); } }); } catch {} }
  settings(); addEventListener('load', settings);

  window.TribeFlintSetup = { state, advise, mount, offer, banner, missed, act, later, start, stepRow };
})();
