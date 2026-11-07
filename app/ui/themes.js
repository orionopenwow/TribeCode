// Themes (Settings › Theme). One list shared by the app, the phone app, join.html and go.html.
// A theme is a base mode (body.dark / body.light, see styles.css) plus data-theme="<id>" on <body>, whose
// custom-property overrides live in themes.css. The swatch colors below are only for the picker chips and
// must match themes.css (scripts/theme-contrast.js checks that, and the contrast of every theme).
// Settings (TribeStore): theme = the chosen id; themeSystem = follow the OS light/dark setting, using the
// last light theme (themeLight) and the last dark theme (themeDark) you picked. The old value 'system' still works.
(function () {
  const LIST = [
    { id: 'dark',        name: 'TribeCode Dark', mode: 'dark',  sw: ['#12151A', '#1B2028', '#F26B1D'] },
    { id: 'light',       name: 'Light',          mode: 'light', sw: ['#F4F5F7', '#FFFFFF', '#F26B1D'] },
    { id: 'midnight',    name: 'Midnight',       mode: 'dark',  sw: ['#0B0E14', '#11151D', '#F26B1D'] },
    { id: 'nordic',      name: 'Nordic',         mode: 'dark',  sw: ['#2A2F3A', '#323845', '#88C0D0'] },
    { id: 'nightshade',  name: 'Nightshade',     mode: 'dark',  sw: ['#21222C', '#2A2C39', '#BD93F9'] },
    { id: 'campfire',    name: 'Campfire',       mode: 'dark',  sw: ['#1D2021', '#282828', '#8EC07C'] },
    { id: 'solar-dark',  name: 'Solar Dark',     mode: 'dark',  sw: ['#00232B', '#032F39', '#2AA198'] },
    { id: 'solar-light', name: 'Solar Light',    mode: 'light', sw: ['#EEE8D5', '#FDF6E3', '#2AA198'] },
    { id: 'contrast',    name: 'High contrast',  mode: 'dark',  sw: ['#000000', '#0A0A0A', '#FFFFFF'] },
  ];
  const byId = id => LIST.find(t => t.id === id);
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : { matches: false, addEventListener() {} };

  // Which theme id these settings show right now.
  function resolve(st) {
    st = st || {};
    const sys = st.themeSystem || st.theme === 'system';
    if (sys) {
      if (mq.matches) return byId(st.themeLight) && byId(st.themeLight).mode === 'light' ? st.themeLight : 'light';
      return byId(st.themeDark) && byId(st.themeDark).mode === 'dark' ? st.themeDark : 'dark';
    }
    return byId(st.theme) ? st.theme : 'dark';
  }
  // The settings patch for picking a theme in the picker (keeps "match system" in step).
  function pick(id) {
    const t = byId(id) || LIST[0];
    return { theme: t.id, [t.mode === 'light' ? 'themeLight' : 'themeDark']: t.id };
  }
  function apply(arg) {
    const id = typeof arg === 'string' ? (arg === 'system' ? resolve({ theme: 'system' }) : (byId(arg) ? arg : 'dark')) : resolve(arg);
    const t = byId(id), b = document.body;
    if (!b) return id;
    b.classList.toggle('dark', t.mode === 'dark');
    b.classList.toggle('light', t.mode === 'light');
    if (b.dataset.theme !== id) b.dataset.theme = id;
    document.documentElement.style.colorScheme = t.mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.sw[0]);
    return id;
  }
  // Read the saved settings directly (go.html runs without store.js).
  function saved() {
    if (window.TribeStore) return window.TribeStore.get();
    // A page with no saved settings (a friend's first visit to go.html) follows the OS light/dark setting.
    try { const s = JSON.parse(localStorage.getItem('tribecode.settings.v1') || 'null'); if (s) return s; } catch {}
    return { themeSystem: true };
  }
  const listeners = new Set();
  mq.addEventListener && mq.addEventListener('change', () => { const st = saved(); if (st.themeSystem || st.theme === 'system') { apply(st); listeners.forEach(f => f()); } });

  window.TribeThemes = { list: LIST, byId, resolve, pick, apply, saved, onSystemChange: f => listeners.add(f) };
  if (document.body) apply(saved());   // loaded at the end of <body>: paint the saved theme straight away
})();
