// "Capture to notes": while on, your own speech (in a huddle or not) becomes timestamped lines in your daily
// notes doc "Notes · <Name> · <YYYY-MM-DD>". Shared docs are visible to the tribe; the personal option keeps
// the notes in this browser only. The toggle survives reloads (the mic is re-requested as needed).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, S = window.TribeStore, SP = () => window.TribeSpeech;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PREF = 'tribecode.capture.v1', PENDING = 'tribecode.capture.pending', LOCAL = d => `tribecode.notes.${d}`;
  const pad = n => String(n).padStart(2, '0');
  const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const myName = () => (C.state().me && C.state().me.name) || S.get().name || 'Me';
  const titleFor = date => `Notes · ${myName()} · ${date}`;

  let pref = { on: false, local: false, open: false };
  try { pref = { ...pref, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch {}
  let paused = '', listening = false, interim = '', count = 0;
  const slugs = new Map();      // title -> slug
  let chain = Promise.resolve();

  const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch {} };

  // ---------- writing lines ----------
  async function docSlug(title) {
    if (slugs.has(title)) return slugs.get(title);
    const { docs } = await C.api('/docs');
    let d = docs.find(x => x.title === title);
    if (!d) d = (await C.api('/docs', { method: 'POST', body: { title, body: `Captured by voice with **Capture to notes**. Visible to the tribe.\n` } })).doc;
    slugs.set(title, d.slug);
    return d.slug;
  }
  async function appendShared(date, line) {
    const slug = await docSlug(titleFor(date));
    // The doc is open in the live editor: type it in through co-editing so everyone sees it instantly.
    const s = window.TribeCoedit && window.TribeCoedit.get(slug);
    if (s && s.joined && s.ta && s.ta.isConnected) {
      const ta = s.ta, end = ta.value.length;
      ta.setRangeText((ta.value && !ta.value.endsWith('\n') ? '\n' : '') + line, end, end, 'preserve');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    for (let i = 0; i < 4; i++) {
      let doc;
      try { doc = (await C.api('/docs/' + slug)).doc; }
      catch (e) { if (e.status === 404) { slugs.delete(titleFor(date)); return appendShared(date, line); } throw e; }
      const body = (doc.body || '').replace(/\s+$/, '') + '\n' + line;
      try { await C.api('/docs/' + slug, { method: 'PUT', body: { body, baseVersion: doc.version } }); return; }
      catch (e) { if (e.status !== 409) throw e; }
    }
    throw new Error('notes doc kept changing');
  }
  function appendLocal(date, line) {
    try { localStorage.setItem(LOCAL(date), (localStorage.getItem(LOCAL(date)) || '') + line + '\n'); } catch {}
  }
  function queue(entry) {
    chain = chain.then(async () => {
      if (entry.local) return appendLocal(entry.date, entry.line);
      if (!C.connected()) return stash(entry);
      try { await appendShared(entry.date, entry.line); } catch (e) { console.warn('capture', e); stash(entry); }
    });
    return chain;
  }
  const readStash = () => { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch { return []; } };
  const stash = e => { try { localStorage.setItem(PENDING, JSON.stringify([...readStash(), e].slice(-500))); } catch {} };
  function flushStash() {
    const list = readStash(); if (!list.length || !C.connected()) return;
    try { localStorage.removeItem(PENDING); } catch {}
    list.forEach(queue);
  }

  function onFinal(text) {
    interim = ''; count++;
    const now = new Date();
    queue({ date: today(now), line: `- **${hm(now)}** ${text}`, local: !!pref.local });
    renderStatus();
  }

  // ---------- on / off ----------
  function sync() {
    const sp = SP(); if (!sp) return;
    const want = pref.on && sp.supported() && !paused;
    if (want && !listening) {
      listening = true;
      sp.use('notes', { label: 'notes', onFinal, onInterim: t => { interim = t; renderStatus(); }, onStop: reason => { listening = false; paused = reason; render(); announce(); } });
    } else if (!want && listening) { listening = false; sp.release('notes'); }
    announce(); render();
  }
  // Let the huddle know when someone's mic is going to their notes.
  const announce = () => C.send({ type: 'capture-state', on: !!(pref.on && listening) });

  function toggle(on = !pref.on) {
    if (on && !(SP() && SP().supported())) { window.TribeApp && window.TribeApp.toast(SP() ? SP().HINT : 'Voice is not available.'); return; }
    pref.on = !!on; if (on) pref.open = true; paused = ''; savePref(); sync();
    window.TribeApp && window.TribeApp.toast(on ? (pref.local ? 'Capturing your speech to notes on this device.' : `Capturing your speech to "${titleFor(today())}". The tribe can read it.`) : 'Capture to notes is off.');
  }
  function setLocal(local) { pref.local = !!local; savePref(); render(); }

  async function openNotes() {
    const date = today();
    if (pref.local || !C.connected()) {
      const text = localStorage.getItem(LOCAL(date)) || '';
      const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
      body.innerHTML = `<h2>${esc(titleFor(date))}</h2><p class="lead">Personal notes, stored only in this browser.</p>
        <pre class="notes-local">${esc(text) || '<span class="faint">Nothing captured yet today.</span>'}</pre>
        <div class="modal-foot"><button class="btn" id="notes-copy">Copy</button><button class="btn" data-close>Close</button></div>`;
      body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
      body.querySelector('#notes-copy').onclick = () => navigator.clipboard.writeText(text).then(() => window.TribeApp.toast('Notes copied')).catch(() => {});
      return;
    }
    try { const slug = await docSlug(titleFor(date)); window.TribeApp.show('docs'); setTimeout(() => window.TribeDocs.open(slug), 80); }
    catch (e) { window.TribeApp.toast(e.message); }
  }

  // ---------- UI (sidebar, under the huddle) ----------
  function statusHtml() {
    if (!pref.on) return 'off';
    if (paused) return paused === 'blocked' ? 'paused · mic blocked' : 'paused · no mic';
    return '<span class="rec-dot"></span>' + (interim ? `<span class="cap-interim">${esc(interim)}</span>` : `${count ? count + ' line' + (count > 1 ? 's' : '') + ' · ' : ''}listening`);
  }
  function renderStatus() { const st = $('#capture-box .cap-status'); if (st) st.innerHTML = statusHtml(); else render(); }
  function render() {
    let box = $('#capture-box');
    if (!box) {
      const anchor = $('#huddle-box'); if (!anchor) return;
      box = document.createElement('div'); box.id = 'capture-box'; box.className = 'capture-box';
      anchor.insertAdjacentElement('afterend', box);
    }
    const sp = SP(), can = sp && sp.supported();
    const state = !pref.on ? 'off' : paused ? 'paused' : 'on';
    box.innerHTML = `<button class="item cap-toggle ${pref.on ? 'on' : ''}" id="capture-toggle" role="switch" aria-checked="${pref.on}" ${can ? '' : 'disabled'} title="${can ? 'Ctrl Shift N' : esc(sp ? sp.HINT : '')}">
        <svg class="i" style="width:16px;height:16px"><use href="#i-doc"/></svg>Capture to notes<span class="sw"><i></i></span></button>
      ${!can ? `<div class="cap-note">${esc(sp ? sp.HINT : '')}</div>` : pref.on || pref.open ? `<div class="cap-note">
        <div class="cap-status ${state}">${statusHtml()}</div>
        ${pref.local ? 'Your speech goes to personal notes kept on this device.' : `Your speech goes to <b>${esc(titleFor(today()))}</b>. <b>Docs are visible to the tribe.</b>`}
        <label class="cap-check"><input type="checkbox" id="capture-local" ${pref.local ? 'checked' : ''}> Personal notes stay on this device</label>
        <div class="cap-links">${state === 'paused' ? '<button class="linkish" id="capture-retry">Allow mic &amp; retry</button>' : ''}<button class="linkish" id="capture-open">Open today's notes</button></div></div>` : ''}`;
    box.querySelector('#capture-toggle').onclick = () => toggle();
    const q = s => box.querySelector(s);
    if (q('#capture-local')) q('#capture-local').onchange = e => setLocal(e.target.checked);
    if (q('#capture-open')) q('#capture-open').onclick = openNotes;
    if (q('#capture-retry')) q('#capture-retry').onclick = () => { paused = ''; sync(); };
  }

  document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); toggle(); } });
  C.on('hello', () => { announce(); flushStash(); render(); });
  function boot() { render(); sync(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);

  window.TribeCapture = { toggle, setLocal, openNotes, on: () => pref.on, local: () => pref.local, flush: () => chain, titleFor, today };
})();
