// Local, per-device settings. Not an account: nothing here leaves the machine.
// In the desktop build this mirrors to tauri-plugin-store; in a browser it uses localStorage.
(function () {
  const KEY = 'tribecode.settings.v1';
  const DEFAULTS = {
    onboarded: false,
    name: '',
    color: '#F26B1D',
    theme: 'dark',            // dark | light | system
    density: 'comfortable',   // comfortable | compact
    folder: '',
    brain: { enabled: false, model: '', host: 'http://localhost:11434' },
    startup: { launchAtLogin: false, startInTray: true, notifications: true, autoUpdate: true },
    tour: { done: false, step: 0 },
    checklist: { setup: false, tour: false, drop: false, brain: false, invite: false },
    update: { snoozedVersion: '', snoozeUntil: 0 },
    server: { url: '', token: '' },
    hosting: false,
    crashReports: true,       // self-heal + crash reports go to the bug inbox (Settings)
  };

  function merge(base, extra) {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(extra || {})) {
      out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null
        ? merge(base[k], extra[k]) : extra[k];
    }
    return out;
  }

  function load() {
    try { return merge(DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch { return merge(DEFAULTS, {}); }
  }

  const listeners = new Set();
  let state = load();

  window.TribeStore = {
    get: () => state,
    set(patch) {
      state = merge(state, patch);
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
      listeners.forEach(fn => fn(state));
      return state;
    },
    reset() { state = merge(DEFAULTS, {}); try { localStorage.removeItem(KEY); } catch {} listeners.forEach(fn => fn(state)); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    defaults: DEFAULTS,
  };

  // Tauri bridge (present only inside the desktop app with withGlobalTauri: true)
  window.TribeHost = {
    isDesktop: !!(window.__TAURI__ && window.__TAURI__.core),
    async pickFolder() {
      const dlg = window.__TAURI__ && window.__TAURI__.dialog;
      if (!dlg) return null;
      return await dlg.open({ directory: true, multiple: false, title: 'Choose your TribeCode folder' });
    },
    async homeDir() {
      const p = window.__TAURI__ && window.__TAURI__.path;
      try { return p ? await p.homeDir() : null; } catch { return null; }
    },
    async setAutostart(on) {
      const a = window.__TAURI__ && window.__TAURI__.autostart;
      if (!a) return;
      try { on ? await a.enable() : await a.disable(); } catch (e) { console.warn('autostart', e); }
    },
  };
})();
