// Speech-to-text on this device (Web Speech API: Chrome, Edge, Safari incl. iOS). One recognizer is shared by
// everything that listens (dictation, huddle captions, capture to notes); it runs while anyone needs it and
// restarts itself when the browser ends it. A titlebar pill shows whenever anything is transcribing.
// The recognizer class is looked up at call time, so tests can swap in a fake one.
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const HINT = 'Voice typing needs Chrome, Edge or Safari. Firefox does not support speech recognition yet.';
  const consumers = new Map();     // key -> { label, onFinal, onInterim, onStop }
  const watchers = [];
  let rec = null, running = false, restartTimer = null, fails = 0, interim = '';

  const supported = () => !!SR();
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const notify = () => { renderPill(); watchers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };

  function dispatch(kind, text) {
    for (const c of [...consumers.values()]) { try { c[kind] && c[kind](text); } catch (e) { console.error(e); } }
  }

  function begin() {
    clearTimeout(restartTimer); restartTimer = null;
    if (!consumers.size || running) return;
    const Ctor = SR(); if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
    r.onstart = () => { fails = 0; };
    r.onresult = e => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i], t = String((res[0] && res[0].transcript) || '').trim();
        if (!t) continue;
        if (res.isFinal) dispatch('onFinal', t); else partial += (partial ? ' ' : '') + t;
      }
      if (partial !== interim) { interim = partial; dispatch('onInterim', partial); renderPill(); }
      fails = 0;
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopAll('blocked');
      else if (e.error === 'audio-capture') stopAll('no-mic');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') fails++;
    };
    r.onend = () => {
      if (rec !== r) return;
      rec = null; running = false; interim = '';
      if (consumers.size) restartTimer = setTimeout(begin, Math.min(8000, 250 * 2 ** Math.min(fails, 5)));   // keep listening
      notify();
    };
    rec = r;
    try { r.start(); running = true; } catch (e) { rec = null; running = false; fails++; restartTimer = setTimeout(begin, 1000); }
    notify();
  }
  function end() {
    clearTimeout(restartTimer); restartTimer = null;
    const r = rec; rec = null; running = false; interim = '';
    if (r) { try { r.abort ? r.abort() : r.stop(); } catch {} }
    notify();
  }
  function stopAll(reason) {
    const list = [...consumers.values()]; consumers.clear(); end();
    toast(reason === 'blocked' ? 'Microphone access was blocked. Allow it in the address bar to use voice features.' : 'No microphone found.');
    list.forEach(c => c.onStop && c.onStop(reason));
  }

  function use(key, c) { consumers.set(key, c); if (!running) begin(); notify(); }
  function release(key) { if (!consumers.delete(key)) return; if (!consumers.size) end(); else notify(); }

  // ---------- indicator ----------
  function renderPill() {
    let p = $('#voice-pill');
    if (!p) {
      const anchor = $('#sync-status'); if (!anchor) return;
      p = document.createElement('span'); p.id = 'voice-pill'; p.className = 'status pill voice-pill hidden'; p.setAttribute('aria-live', 'polite');
      anchor.parentNode.insertBefore(p, anchor);
    }
    const labels = [...new Set([...consumers.values()].map(c => c.label))];
    p.classList.toggle('hidden', !labels.length);
    p.title = labels.length ? 'Transcribing your microphone on this device: ' + labels.join(', ') : '';
    p.innerHTML = labels.length ? `<span class="rec-dot"></span>${esc(labels.join(' · '))}` : '';
  }

  // ---------- dictation ----------
  let dict = null;   // { id, el }
  function insertText(el, text) {
    if (!el) return;
    const v = el.value || '', s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s, before = v.slice(0, s);
    if (/(^|[.!?]\s+|\n\s*)$/.test(before)) text = text.charAt(0).toUpperCase() + text.slice(1);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    el.setRangeText(sep + text, s, e, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function target() {
    if (!dict) return null;
    if (dict.el && dict.el.isConnected) return dict.el;
    dict.el = dict.id ? document.getElementById(dict.id) : null;   // the doc editor re-rendered
    return dict.el;
  }
  function dictate(el) {
    if (dict) { const prev = dict.el; stopDictation(); if (!el || el === prev) return; }   // same target: toggle off
    if (!supported()) return toast(HINT);
    el = el || $('#chat-input'); if (!el) return;
    dict = { id: el.id, el };
    use('dictation', { label: 'dictating', onFinal: t => insertText(target(), t), onInterim: () => {}, onStop: () => { dict = null; syncButtons(); } });
    syncButtons();
  }
  function stopDictation() { if (!dict) return; dict = null; release('dictation'); syncButtons(); }

  function micButton(forId, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mic-btn ' + (cls || ''); b.dataset.dictate = forId;
    b.title = 'Dictate (Ctrl Shift D)'; b.setAttribute('aria-label', 'Dictate');
    b.innerHTML = '<svg class="i"><use href="#i-mic"/></svg>';
    b.onmousedown = e => e.preventDefault();        // keep the caret where it is
    b.onclick = () => dictate(document.getElementById(forId));
    return b;
  }
  function syncButtons() {
    document.querySelectorAll('[data-dictate]').forEach(b => { const on = !!dict && dict.id === b.dataset.dictate; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function mountButtons() {
    const form = $('#chat-form');   // the chat mic also records voice notes (hold), which only needs MediaRecorder
    if (form && !form.querySelector('[data-dictate]') && (supported() || window.MediaRecorder)) form.insertBefore(micButton('chat-input'), form.querySelector('.kbd'));
    if (!supported()) return;
    const bar = document.querySelector('#doc-pane .doc-toolbar');
    if (bar && !bar.querySelector('[data-dictate]')) { const b = micButton('doc-body', 'ghost'); b.insertAdjacentHTML('beforeend', '<span>Dictate</span>'); bar.insertBefore(b, $('#doc-del')); }
    syncButtons();
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const a = document.activeElement;
      dictate(a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type === 'text') || a.id === 'chat-input') && a.id ? a : $('#chat-input'));
    } else if (e.key === 'Escape' && dict) stopDictation();
  });
  function boot() {
    mountButtons(); renderPill();
    const pane = $('#doc-pane'); if (pane) new MutationObserver(mountButtons).observe(pane, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TribeSpeech = {
    supported, use, release, dictate, stopDictation, insertText, HINT,
    active: () => [...consumers.keys()], running: () => running, interim: () => interim,
    onChange: fn => watchers.push(fn),
  };
})();
