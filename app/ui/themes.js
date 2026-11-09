// Themes (Settings › Theme). One list shared by the app, the phone app, join.html and go.html.
// A theme is a base mode (body.dark / body.light, see styles.css) plus data-theme="<id>" on <body>, whose
// custom-property overrides live in themes.css. The swatch colors below are only for the picker chips and
// must match themes.css (scripts/theme-contrast.js checks that, and the contrast of every theme).
// Settings (TribeStore): theme = the chosen id; themeSystem = follow the OS light/dark setting, using the
// last light theme (themeLight) and the last dark theme (themeDark) you picked. The old value 'system' still works.
(function () {
  const LIST = [
    { id: 'campfire',    name: 'Campfire',       mode: 'dark',  sw: ['#1D2021', '#282828', '#FE8019'], lg: ['#EBDBB2', '#FE8019'] },   // the default
    { id: 'dark',        name: 'TribeCode Dark', mode: 'dark',  sw: ['#12151A', '#1B2028', '#F26B1D'], lg: ['#F8FAFC', '#F26B1D'] },
    { id: 'light',       name: 'Light',          mode: 'light', sw: ['#F4F5F7', '#FFFFFF', '#F26B1D'], lg: ['#12151A', '#F26B1D'] },
    { id: 'midnight',    name: 'Midnight',       mode: 'dark',  sw: ['#0B0E14', '#11151D', '#5AB8FF'], lg: ['#8AB8FF', '#FF8A3D'] },
    { id: 'nordic',      name: 'Nordic',         mode: 'dark',  sw: ['#2A2F3A', '#323845', '#88C0D0'], lg: ['#ECEFF4', '#D08770'] },
    { id: 'nightshade',  name: 'Nightshade',     mode: 'dark',  sw: ['#21222C', '#2A2C39', '#BD93F9'], lg: ['#BD93F9', '#FF79C6'] },
    { id: 'solar-dark',  name: 'Solar Dark',     mode: 'dark',  sw: ['#00232B', '#032F39', '#2AA198'], lg: ['#93A1A1', '#CB4B16'] },
    { id: 'solar-light', name: 'Solar Light',    mode: 'light', sw: ['#EEE8D5', '#FDF6E3', '#2AA198'], lg: ['#586E75', '#CB4B16'] },
    { id: 'contrast',    name: 'High contrast',  mode: 'dark',  sw: ['#000000', '#0A0A0A', '#FFD400'], lg: ['#FFFFFF', '#FFD400'] },
  ];
  const DEFAULT = 'campfire';
  const byId = id => LIST.find(t => t.id === id);
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : { matches: false, addEventListener() {} };

  // Which theme id these settings show right now.
  function resolve(st) {
    st = st || {};
    // Before v0.9.1 every device had theme 'dark' saved by default: unless you picked it yourself, that now means Campfire.
    const fix = id => (id === 'dark' && !st.themePicked) ? DEFAULT : id;
    const sys = st.themeSystem || st.theme === 'system';
    if (sys) {
      if (mq.matches) return byId(st.themeLight) && byId(st.themeLight).mode === 'light' ? st.themeLight : 'light';
      return byId(fix(st.themeDark)) && byId(fix(st.themeDark)).mode === 'dark' ? fix(st.themeDark) : DEFAULT;
    }
    return byId(fix(st.theme)) ? fix(st.theme) : DEFAULT;
  }
  // The settings patch for picking a theme in the picker (keeps "match system" in step).
  function pick(id) {
    const t = byId(id) || LIST[0];
    return { theme: t.id, themePicked: true, [t.mode === 'light' ? 'themeLight' : 'themeDark']: t.id };
  }
  let apply = function apply(arg) {
    const id = typeof arg === 'string' ? (arg === 'system' ? resolve({ theme: 'system' }) : (byId(arg) ? arg : DEFAULT)) : resolve(arg);
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

  // The wordmark follows the theme: "Tribe" in the theme's text color, "Code" in its accent. Every <img class="brand-wm">
  // gets the same SVG redrawn with the live colors (a data URL), so layouts and sizes stay exactly as they are.
  let wmSrc = null, wmKey = '';
  const wmBase = () => { const s = document.querySelector('script[src$="themes.js"]'); return s ? s.src.replace(/themes\.js(\?.*)?$/, '') : ''; };
  function paintWordmarks(force) {
    const imgs = document.querySelectorAll('img.brand-wm'); if (!imgs.length || !document.body) return;
    const cs = getComputedStyle(document.body), ink = (cs.getPropertyValue('--text') || '').trim() || '#F8FAFC', acc = (cs.getPropertyValue('--accent') || '').trim() || '#F26B1D';
    const key = ink + acc;
    const go = () => {
      const svg = wmSrc /* the pixel wordmark has its own outline, so it reads on every theme as drawn */, url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      imgs.forEach(img => { if (force || img.dataset.wm !== key) { img.src = url; img.dataset.wm = key; } });
    };
    if (wmSrc) { wmKey = key; return go(); }
    if (!/^https?:/.test(location.protocol)) return;   // file:// (tests, previews): keep the drawn wordmark
    fetch(wmBase() + 'assets/wordmark.svg').then(r => r.ok ? r.text() : Promise.reject()).then(t => { wmSrc = t; go(); }).catch(() => {});
  }
  const _apply = apply;
  apply = function (arg) { const id = _apply(arg); paintWordmarks(); return id; };
  if (window.MutationObserver) new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.matches('img.brand-wm') || n.querySelector('img.brand-wm'))))) paintWordmarks(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.TribeThemes = { list: LIST, DEFAULT, byId, resolve, pick, apply, saved, onSystemChange: f => listeners.add(f), paintWordmarks };
  if (document.body) apply(saved());   // loaded at the end of <body>: paint the saved theme straight away
})();
