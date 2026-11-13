// Custom keyboard shortcuts (feat/settings-tabs, Settings › Workspace › Keyboard shortcuts).
// The app-wide shortcuts live in their own modules (palette.js Ctrl K, help.js Ctrl /, bugs.js Ctrl Shift B…). This file
// lets you move any of them to other keys: a capture-phase listener runs the action for your keys and stops the old
// keys. An action runs by replaying its default keys to the module that owns it, so nothing else has to change.
// Saved in TribeStore `shortcuts` { actionId: 'Ctrl+Shift+K' } (synced with settings sync).
// window.TribeShortcuts = { list(), keyOf(id), set(id, combo), reset(id?), mount(el, opts), combo(event) }
(function () {
  'use strict';
  const S = window.TribeStore;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // id, what it does, default keys, and how to run it when the module has no API (replay the default keys)
  const ACTIONS = [
    { id: 'palette', label: 'Search or jump to anything', def: 'Ctrl+K' },
    { id: 'settings', label: 'Open Settings', def: 'Ctrl+,', run: () => window.TribeSettings && window.TribeSettings.open() },
    { id: 'inbox', label: 'Open notifications', def: 'Alt+N', run: () => window.TribeNotify && window.TribeNotify.openInbox() },
    { id: 'home', label: 'Go to Home', def: 'Alt+H', run: () => { const l = document.getElementById('rail-logo'); if (l) l.click(); } },
    { id: 'keys', label: 'Show all shortcuts', def: 'Ctrl+/' },
    { id: 'bug', label: 'Report a bug', def: 'Ctrl+Shift+B' },
    { id: 'notes', label: 'Capture to notes', def: 'Ctrl+Shift+N' },
    { id: 'dictate', label: 'Dictate into chat', def: 'Ctrl+Shift+D' },
    { id: 'theme', label: 'Switch light and dark', def: 'Ctrl+Shift+L' },
    { id: 'huddle', label: 'Join the huddle, or mute', def: 'Ctrl+Shift+M' },
  ];
  const custom = () => Object.assign({}, S.get().shortcuts || {});
  const keyOf = id => { const a = ACTIONS.find(x => x.id === id); return a ? (custom()[id] || a.def) : ''; };
  const MOD = new Set(['Control', 'Shift', 'Alt', 'Meta']);
  function combo(e) {
    if (MOD.has(e.key)) return '';
    let k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (k === ' ') k = 'Space';
    return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
  }
  const pretty = c => c.replace(/\+/g, ' ');
  function replay(c) {
    const parts = c.split('+'), key = parts.pop(), ev = new KeyboardEvent('keydown', { key: key.length === 1 ? key.toLowerCase() : key, ctrlKey: parts.includes('Ctrl'), altKey: parts.includes('Alt'), shiftKey: parts.includes('Shift'), bubbles: true, cancelable: true });
    ev.__tcReplay = true; (document.activeElement || document.body).dispatchEvent(ev);
  }
  const runAction = a => (a.run ? a.run() : replay(a.def));
  const typing = t => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
  addEventListener('keydown', e => {
    if (e.__tcReplay || capture) return;
    const c = combo(e); if (!c || !/^(Ctrl|Alt)\+/.test(c)) return;   // only chords with Ctrl or Alt are app-wide
    const cu = custom();
    const mine = ACTIONS.find(a => (cu[a.id] || a.def) === c);
    if (mine) {
      if (!cu[mine.id] && !mine.run) return;   // its own module handles its default keys
      if (typing(e.target) && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); e.stopImmediatePropagation(); runAction(mine); return;
    }
    if (ACTIONS.some(a => cu[a.id] && a.def === c)) { e.preventDefault(); e.stopImmediatePropagation(); }   // you moved this action away
  }, true);

  function set(id, c) {
    const a = ACTIONS.find(x => x.id === id); if (!a) throw new Error('no such shortcut');
    const clash = ACTIONS.find(x => x.id !== id && keyOf(x.id) === c);
    if (clash) throw new Error(`${pretty(c)} already does "${clash.label}"`);
    const next = custom(); if (c === a.def) delete next[id]; else next[id] = c;
    S.set({ shortcuts: null }); S.set({ shortcuts: next });   // replace, not merge
  }
  function reset(id) { const next = id ? custom() : {}; if (id) delete next[id]; S.set({ shortcuts: null }); S.set({ shortcuts: next }); }

  // ---------- Settings › Workspace › Keyboard shortcuts ----------
  let capture = null;
  function mount(el, opts = {}) {
    const cu = custom();
    el.innerHTML = `<ul class="set-list set-keys">${ACTIONS.map(a => `<li data-key-act="${a.id}"><span><b>${esc(a.label)}</b>${cu[a.id] ? `<small>was ${esc(pretty(a.def))}</small>` : ''}</span><span class="set-keyctl"><kbd class="set-kbd" id="set-key-${a.id}">${esc(pretty(keyOf(a.id)))}</kbd><button class="btn sm" data-key-change="${a.id}">Change</button>${cu[a.id] ? `<button class="btn sm ghost" data-key-reset="${a.id}">Reset</button>` : ''}</span></li>`).join('')}</ul>
      <div class="set-acts"><button class="btn sm" id="set-keys-reset" ${Object.keys(cu).length ? '' : 'disabled'}>Reset all</button><span class="set-info" id="set-keys-msg" aria-live="polite"></span></div>`;
    const msg = t => { const m = el.querySelector('#set-keys-msg'); if (m) m.textContent = t; };
    el.querySelectorAll('[data-key-change]').forEach(b => b.onclick = () => {
      const id = b.dataset.keyChange, kbd = el.querySelector('#set-key-' + id);
      kbd.textContent = 'Press keys…'; kbd.classList.add('wait'); msg('Hold Ctrl or Alt and press a key. Esc cancels.');
      if (opts.capturing) opts.capturing(true);
      const done = () => { removeEventListener('keydown', capture, true); capture = null; setTimeout(() => opts.capturing && opts.capturing(false), 0); };
      capture = e => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === 'Escape') { done(); mount(el, opts); return; }
        const c = combo(e); if (!c) return;
        if (!/^(Ctrl|Alt)\+/.test(c)) { msg('Use Ctrl or Alt with a key, so typing never triggers it.'); return; }
        try { set(id, c); done(); mount(el, opts); if (opts.saved) opts.saved(); } catch (err) { msg(err.message); }
      };
      addEventListener('keydown', capture, true);
    });
    el.querySelectorAll('[data-key-reset]').forEach(b => b.onclick = () => { reset(b.dataset.keyReset); mount(el, opts); if (opts.saved) opts.saved(); });
    const ra = el.querySelector('#set-keys-reset'); if (ra) ra.onclick = () => { reset(); mount(el, opts); if (opts.saved) opts.saved(); };
  }
  window.TribeShortcuts = { list: () => ACTIONS.map(a => ({ id: a.id, label: a.label, keys: keyOf(a.id), def: a.def })), keyOf, set, reset, mount, combo };
})();
