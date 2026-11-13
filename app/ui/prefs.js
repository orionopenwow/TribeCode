// Personal preferences that change how the app behaves on this device (feat/settings-tabs, Settings › every tab).
// Stored in TribeStore under `prefs`; the look on <html> data attributes (prefs.css). Also:
//   * notification sound, in-app pop-ups and quiet hours on this device (notify.js asks quiet() and onNotification())
//   * screen-reader announcements, spellcheck, captions when you join a huddle, Flint reading aloud
//   * the default home page, and settings sync through your tribe account (GET/PUT /api/me/settings)
//   * export / import / reset settings (JSON), storage used, and "Download my data" (/api/me/export → .zip)
// window.TribePrefs = { get, set, apply, quiet, onNotification, ding, speak, reduced, notifyPrefs, syncNow,
//   exportSettings, importSettings, resetSettings, usage, downloadMyData, SYNC_KEYS }
(function () {
  'use strict';
  const S = window.TribeStore, C = () => window.TribeClient, html = document.documentElement;
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const DEF = { sound: true, toasts: true, homePage: '', spellcheck: true, contrast: false, focus: 'normal', readable: false, motion: 'system', captions: false, announce: false,
    readTicks: true, showTyping: true, sync: false, projectHome: 'ask', flintTips: true, flintVoice: false };
  const SYNC_KEYS = ['theme', 'themeSystem', 'themeDark', 'themeLight', 'themePicked', 'density', 'look', 'color', 'prefs', 'shortcuts'];
  const get = () => Object.assign({}, DEF, S.get().prefs || {});
  function set(patch) { S.set({ prefs: patch }); apply(); return get(); }

  // ---------- the look ----------
  function apply() {
    const p = get(), d = html.dataset;
    const flag = (k, v) => { if (v) d[k] = v; else delete d[k]; };
    flag('contrast', p.contrast ? 'more' : ''); flag('focus', p.focus === 'strong' ? 'strong' : ''); flag('readable', p.readable ? 'on' : '');
    flag('ticks', p.readTicks === false ? 'off' : ''); flag('typing', p.showTyping === false ? 'off' : '');
    if (p.motion === 'off') { d.motion = 'off'; try { localStorage.setItem('tribecode.motion', JSON.stringify('off')); } catch {} }
    else if (S.get().prefs && S.get().prefs.motion === 'system') { delete d.motion; try { localStorage.removeItem('tribecode.motion'); } catch {} }
    let live = document.getElementById('tc-announce');
    if (p.announce && !live) { live = document.createElement('div'); live.id = 'tc-announce'; live.className = 'sr'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); document.body.appendChild(live); }
  }
  const reduced = () => html.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // spellcheck everywhere you type
  document.addEventListener('focusin', e => {
    const t = e.target; if (!t || !t.matches) return;
    if (t.matches('textarea, input[type=text], input:not([type]), [contenteditable="true"], [contenteditable=""]') && !t.closest('[data-nospell], .cm-editor')) t.spellcheck = get().spellcheck !== false;
  });

  // ---------- notifications on this device ----------
  let nf = null, nfAt = 0;
  async function notifyPrefs(force) {
    if (!C() || !C().connected()) return null;
    if (!force && nf && Date.now() - nfAt < 60_000) return nf;
    try { nf = (await C().api('/notify/prefs')).prefs; nfAt = Date.now(); } catch {}
    return nf;
  }
  function hmIn(tz) {
    try { const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return f.format(new Date()); }
    catch { const n = new Date(); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); }
  }
  // In quiet hours? (the same rule as the server: from–to, wrapping past midnight)
  function quiet() {
    const q = nf && nf.when && nf.when.quiet; if (!q || !q.on || q.from === q.to) return false;
    const hm = hmIn(nf.tz);
    return q.from < q.to ? hm >= q.from && hm < q.to : hm >= q.from || hm < q.to;
  }
  let ac = null;
  function ding() {
    window.__tcDings = (window.__tcDings || 0) + 1;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime, g = ac.createGain(); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      [660, 880].forEach((f, i) => { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t + i * 0.09); o.stop(t + 0.4); });
    } catch {}
  }
  // notify.js calls this for each new in-app notification: returns false when it should stay silent (no pop-up either)
  function onNotification(item) {
    if (!item) return false;
    if (quiet()) { window.__tcQuietHeld = (window.__tcQuietHeld || 0) + 1; return false; }
    const p = get();
    if (p.sound !== false && !document.hidden) ding();
    if (p.announce) { const l = document.getElementById('tc-announce'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = item.title || ''; }, 50); } }
    return p.toasts !== false;
  }
  function speak(text) {
    if (!get().flintVoice || !window.speechSynthesis || !text) return;
    try { const u = new SpeechSynthesisUtterance(String(text).replace(/[*_`#>]/g, '').slice(0, 600)); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
  }

  // ---------- captions when I join a huddle ----------
  let capSent = false;
  const wrapCaptions = (n = 0) => {
    const K = window.TribeCaptions; if (!K) { if (n < 100) setTimeout(() => wrapCaptions(n + 1), 200); return; }
    if (K.__tcWrapped) return; K.__tcWrapped = true;
    const d = K.decorate;
    K.decorate = (box, inCall) => {
      d(box, inCall);
      if (!inCall) { capSent = false; return; }
      if (get().captions && !capSent && !K.state().on && C() && C().send) { capSent = true; C().send({ type: 'captions', on: true }); }
    };
  };

  // ---------- default home page ----------
  let homed = false;
  function goHome() {
    if (homed) return; homed = true;
    const k = get().homePage; if (!k) return;
    const h = location.hash; if (h && !/^#\/?(hub)?$/.test(h)) return;   // a deep link wins
    setTimeout(() => { const SH = window.TribeShell; if (SH && SH.go) SH.go(k); }, 350);
  }

  // ---------- settings sync ----------
  const pick = st => { const o = {}; for (const k of SYNC_KEYS) if (k in st) o[k] = st[k]; if (window.TribeI18n) o.lang = window.TribeI18n.lang(); return o; };
  let applying = false, pushT = 0, lastSig = '';
  function schedulePush() {
    if (applying || !get().sync || !C() || !C().connected()) return;
    const sig = JSON.stringify(pick(S.get())); if (sig === lastSig) return;
    clearTimeout(pushT); pushT = setTimeout(() => syncNow(false), 1200);
  }
  async function syncNow(pull) {
    if (!C() || !C().connected()) return;
    try {
      if (pull) {   // a new device picks up synced settings when the account turned sync on somewhere
        const r = await C().api('/me/settings'), mine = S.get().syncAt || '', on = get().sync || !!(r.settings && r.settings.prefs && r.settings.prefs.sync);
        if (r.settings && r.at && r.at > mine && on) { importSettings({ kind: 'settings', settings: r.settings }, true); S.set({ syncAt: r.at }); lastSig = JSON.stringify(pick(S.get())); return; }
      }
      if (!get().sync) return;
      const body = pick(S.get()); lastSig = JSON.stringify(body);
      const r = await C().api('/me/settings', { method: 'PUT', body: { settings: body } }); applying = true; S.set({ syncAt: r.at }); applying = false;
    } catch (e) { applying = false; console.warn('settings sync', e); }
  }

  // ---------- export / import / reset ----------
  function exportSettings() {
    const out = { app: 'TribeCode', kind: 'settings', version: 1, at: new Date().toISOString(), settings: pick(S.get()) };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = `tribecode-settings-${out.at.slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    return out;
  }
  function importSettings(obj, quiet_) {
    if (!obj || obj.kind !== 'settings' || !obj.settings || typeof obj.settings !== 'object') throw new Error('That file is not a TribeCode settings file');
    const s = obj.settings, patch = {};
    for (const k of SYNC_KEYS) if (k in s && s[k] !== null && s[k] !== undefined) patch[k] = s[k];
    if (patch.prefs && typeof patch.prefs === 'object') patch.prefs = Object.fromEntries(Object.entries(patch.prefs).filter(([k]) => k in DEF));
    if (patch.color && !/^#[0-9a-f]{6}$/i.test(patch.color)) delete patch.color;
    applying = true; S.set(patch); applying = false;
    if (typeof s.lang === 'string' && window.TribeI18n && s.lang !== window.TribeI18n.lang()) window.TribeI18n.set(s.lang);
    apply(); refreshLook();
    if (!quiet_ && patch.color && C() && C().connected()) C().api('/me', { method: 'PATCH', body: { color: patch.color } }).catch(() => {});
    return Object.keys(patch).length + (s.lang ? 1 : 0);
  }
  function resetSettings() {
    const st = S.get(), keep = { onboarded: st.onboarded, name: st.name, color: st.color, folder: st.folder, server: st.server, hosting: st.hosting, tour: st.tour, checklist: st.checklist };
    S.reset(); S.set(keep); apply(); refreshLook();
  }
  function refreshLook() {
    try { if (window.TribeApp && window.TribeApp.applyTheme) window.TribeApp.applyTheme(); } catch {}
    try { if (window.TribeLook) window.TribeLook.apply(); } catch {}
    document.body.classList.toggle('compact', S.get().density === 'compact');
  }

  // ---------- storage used ----------
  const fmt = b => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  async function usage() {
    let ls = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch {}
    let est = null; try { if (navigator.storage && navigator.storage.estimate) est = await navigator.storage.estimate(); } catch {}
    return est && est.usage ? `${fmt(est.usage)} in all · settings and drafts ${fmt(ls)}` : `Settings and drafts: ${fmt(ls)}`;
  }

  // ---------- my data ----------
  async function downloadMyData(btn) {
    const E = window.TribeExport; if (!E) return toast('Export is not available here');
    if (btn) { btn.disabled = true; btn.textContent = 'Gathering…'; }
    try {
      const r = await C().api('/me/export');
      const entries = Object.entries(r.files || {});
      for (const [k, b64] of Object.entries(r.binary || {})) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); entries.push([k, u]); }
      const who = String(S.get().name || 'me').replace(/[^\w -]+/g, '').trim() || 'me';
      const out = await E.save(E.zip(entries, 'application/zip'), `TribeCode data ${who} ${new Date().toISOString().slice(0, 10)}.zip`, { desktop: false });
      const c = r.counts || {}; toast(out && out.path ? `Saved to ${out.path}` : `Saved: ${c.messages || 0} messages, ${c.tasks || 0} tasks, ${c.docs || 0} docs, ${c.files || 0} files`);
      window.__tcMyData = { counts: c, names: entries.map(e => e[0]) };
    } catch (e) { toast(e.message || 'Could not gather your data'); }
    if (btn) { btn.disabled = false; btn.textContent = 'Download (.zip)'; }
  }

  function boot() {
    apply(); wrapCaptions();
    S.on(() => schedulePush());
    const hook = (n = 0) => {
      const c = C(); if (!c || !c.on) { if (n < 100) setTimeout(() => hook(n + 1), 150); return; }
      c.on('hello', () => { notifyPrefs(true); goHome(); syncNow(true); });
      if (c.connected && c.connected()) { notifyPrefs(true); goHome(); }
    };
    hook();
  }
  window.TribePrefs = { get, set, apply, quiet, onNotification, ding, speak, reduced, notifyPrefs, syncNow, exportSettings, importSettings, resetSettings, usage, downloadMyData, SYNC_KEYS, DEF };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
