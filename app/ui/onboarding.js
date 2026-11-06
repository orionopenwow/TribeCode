// First-run setup: personal desktop preferences only (no account, no auth).
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const COLORS = ['#7C5CFF', '#FFB86B', '#3DD6D0', '#FF6F8E', '#5B8CFF', '#9AE66E', '#E7E9EE'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');

  // Working copy; written to the store only when the user finishes (or skips).
  let draft, step = 0, brainProbe = { state: 'idle', models: [] };

  const steps = [
    {
      id: 'welcome', cta: 'Get started',
      render: () => `
        <img class="hero-icon" src="assets/icon-512.png" alt="">
        <h1>Welcome to TribeCode</h1>
        <p class="lead">Let's set up this computer in about a minute. These choices stay on this device. There's no account to create, and you can change any of them later in Settings.</p>
        <div class="perks">
          <div class="perk"><svg class="i"><use href="#i-users"/></svg><b>Code with friends</b>One invite link, live sessions, shared Claude.</div>
          <div class="perk"><svg class="i"><use href="#i-brain"/></svg><b>Local brain</b>Summaries and memory run on your machine.</div>
          <div class="perk"><svg class="i"><use href="#i-vote"/></svg><b>One vision</b>Proposals and a board keep everyone aligned.</div>
        </div>`,
    },
    {
      id: 'profile', title: 'You',
      valid: () => draft.name.trim().length > 0,
      hint: () => (draft.name.trim() ? '' : 'Pick a display name to continue'),
      render: () => `
        <h1>What should your tribe call you?</h1>
        <p class="lead">Shown next to your cursor, messages and tasks. Friends see it when you join their sessions.</p>
        <div class="field"><label for="ob-name">Display name</label>
          <input class="input" id="ob-name" maxlength="32" placeholder="e.g. Riley" value="${esc(draft.name)}" autocomplete="off"></div>
        <div class="field"><label>Your color</label>
          <div class="swatches">${COLORS.map(c => `<button class="swatch ${c === draft.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
        <div class="preview-me"><div class="avatar" id="ob-av" style="background:${draft.color};color:${ink(draft.color)}">${esc(initials(draft.name))}</div>
          <div><b id="ob-pn">${esc(draft.name || 'Your name')}</b><div class="faint" style="font-size:12px">online · editing Game design doc</div></div></div>`,
      bind() {
        const name = $('#ob-name');
        name.focus(); name.setSelectionRange(name.value.length, name.value.length);
        name.addEventListener('input', () => {
          draft.name = name.value;
          $('#ob-av').textContent = initials(draft.name);
          $('#ob-pn').textContent = draft.name || 'Your name';
          syncFoot();
        });
        document.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
          draft.color = b.dataset.color; render(); }));
      },
    },
    {
      id: 'look', title: 'Look',
      render: () => {
        const thumb = (bg, side, card) => `<div class="thumb" style="background:${bg}"><i style="background:${side}"></i><i style="background:${card}"></i></div>`;
        const opt = (v, label, sub, t) => `<button class="choice ${draft.theme === v ? 'on' : ''}" data-theme="${v}">${t}<b>${label}</b><span>${sub}</span></button>`;
        return `
        <h1>Pick your look</h1>
        <p class="lead">Applied right away. Switch any time with <span class="kbd">Ctrl Shift L</span>.</p>
        <div class="choices">
          ${opt('dark', 'Graphite', 'Dark, high contrast', thumb('#0B0C10', '#1C2029', '#242935'))}
          ${opt('light', 'Paper', 'Light, cool grey', thumb('#E4E6EB', '#FFFFFF', '#F3F4F7'))}
          ${opt('system', 'Match system', 'Follows your OS', thumb('linear-gradient(90deg,#0B0C10 50%,#E4E6EB 50%)', '#7F8494', '#B9BDC9'))}
        </div>
        <div class="field" style="margin-top:22px"><label>Density</label>
          <div class="toggles">
            <button class="toggle" role="switch" data-density aria-checked="${draft.density === 'compact'}">Compact mode<small>Tighter spacing, more on screen</small><span class="switch"></span></button>
          </div></div>`;
      },
      bind() {
        document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', () => {
          draft.theme = b.dataset.theme; window.TribeApp.applyTheme(draft.theme); render(); }));
        $('[data-density]').addEventListener('click', () => {
          draft.density = draft.density === 'compact' ? 'comfortable' : 'compact'; render(); });
      },
    },
    {
      id: 'folder', title: 'Folder',
      valid: () => draft.folder.trim().length > 0,
      render: () => `
        <h1>Where should your tribe's files live?</h1>
        <p class="lead">TribeCode keeps docs, tasks, chat and the brain's notes as plain Markdown in one folder, so it's easy to back up and works with git.</p>
        <div class="field"><label for="ob-folder">Workspace folder</label>
          <div class="folder"><input class="input" id="ob-folder" value="${esc(draft.folder)}" spellcheck="false">
          <button class="btn" id="ob-browse"><svg class="i"><use href="#i-folder"/></svg>Browse</button></div></div>
        <div class="folder-drop" id="ob-fdrop">…or drag a folder here</div>`,
      bind() {
        const inp = $('#ob-folder');
        inp.addEventListener('input', () => { draft.folder = inp.value; syncFoot(); });
        $('#ob-browse').addEventListener('click', async () => {
          const p = await window.TribeHost.pickFolder();
          if (p) { draft.folder = p; render(); }
          else if (!window.TribeHost.isDesktop) { inp.focus(); inp.select(); window.TribeApp.toast('Folder picker opens in the desktop app; type a path here for now.'); }
        });
        const dz = $('#ob-fdrop');
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('over'));
        dz.addEventListener('drop', e => {
          e.preventDefault(); dz.classList.remove('over');
          const f = e.dataTransfer.files[0];
          // Desktop builds expose the real path; browsers only expose the name.
          const p = f && (f.path || f.name);
          if (p) { draft.folder = f.path ? p : draft.folder.replace(/[^\\/]+$/, p); render(); }
        });
      },
    },
    {
      id: 'brain', title: 'Brain',
      onEnter: probeBrain,
      render: () => {
        const b = brainProbe;
        const qwen = b.models.filter(m => /qwen/i.test(m));
        let status;
        if (b.state === 'checking') status = `<div class="brain-status"><div class="ico"><svg class="i"><use href="#i-brain"/></svg></div><div>Looking for Ollama on this computer…<small>${esc(draft.brain.host)}</small></div></div>`;
        else if (b.state === 'found') status = `<div class="brain-status ok"><div class="ico"><svg class="i"><use href="#i-tick"/></svg></div><div>Ollama is running<small>${b.models.length} model${b.models.length === 1 ? '' : 's'} installed${qwen.length ? `, ${qwen.length} Qwen` : ''}</small></div><button class="btn ghost" id="ob-recheck" style="margin-left:auto">Re-check</button></div>`;
        else status = `<div class="brain-status"><div class="ico"><svg class="i"><use href="#i-brain"/></svg></div><div>Ollama not found<small>Optional. TribeCode works without it; you just won't get local summaries yet.</small></div><button class="btn ghost" id="ob-recheck" style="margin-left:auto">Re-check</button></div>`;

        const radio = (val, label, sub) => `<button class="radio ${draft.brain.model === val && draft.brain.enabled === !!val ? 'on' : ''}" data-model="${esc(val)}"><span class="r"></span><span>${label}${sub ? `<br><span class="faint" style="font-size:12px">${sub}</span>` : ''}</span></button>`;
        const options = b.state === 'found'
          ? [...(qwen.length ? qwen : b.models).slice(0, 4).map(m => radio(m, esc(m), /qwen/i.test(m) ? 'Recommended as the tribe brain' : '')), radio('', 'Not now', 'Turn it on later in Settings')].join('')
          : `<div class="code">ollama pull qwen3</div><p class="faint" style="font-size:12.5px;margin:10px 0 12px">Install Ollama from ollama.com, run the command above, then press Re-check.</p>${radio('', 'Skip for now', '')}`;
        return `<h1>Connect a local brain</h1>
          <p class="lead">A local Qwen model writes summaries, standups and project memory on your machine, so you don't spend Claude tokens on them.</p>
          ${status}${b.state === 'checking' ? '' : options}`;
      },
      bind() {
        const r = $('#ob-recheck'); if (r) r.addEventListener('click', probeBrain);
        document.querySelectorAll('[data-model]').forEach(btn => btn.addEventListener('click', () => {
          const m = btn.dataset.model; draft.brain = { ...draft.brain, model: m, enabled: !!m }; render(); }));
      },
    },
    {
      id: 'startup', title: 'Startup',
      render: () => {
        const t = (key, label, sub) => `<button class="toggle" role="switch" data-key="${key}" aria-checked="${!!draft.startup[key]}">${label}<small>${sub}</small><span class="switch"></span></button>`;
        return `<h1>Make it yours</h1>
          <p class="lead">A few conveniences for this computer.</p>
          <div class="toggles">
            ${t('launchAtLogin', 'Open TribeCode when I log in', 'Be in the room when friends start a session')}
            ${t('startInTray', 'Keep running in the tray when closed', 'Stay reachable for invites and mentions')}
            ${t('notifications', 'Desktop notifications', 'Mentions, votes and finished agent runs')}
            ${t('autoUpdate', 'Download updates automatically', 'You choose when to restart, after your work is saved')}
          </div>`;
      },
      bind() {
        document.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => {
          draft.startup[b.dataset.key] = !draft.startup[b.dataset.key]; render(); }));
      },
    },
    {
      id: 'ready', cta: 'Take the 60-second tour',
      render: () => `
        <h1>You're all set, ${esc(draft.name.split(' ')[0] || 'friend')} 🔥</h1>
        <p class="lead">Here's what you picked. Change anything later from <b>Settings</b>.</p>
        <div class="card"><div class="summary">
          <span>Name</span><span><span class="dot" style="background:${draft.color};margin-right:6px"></span>${esc(draft.name)}</span>
          <span>Look</span><span>${{ dark: 'Graphite', light: 'Paper', system: 'Match system' }[draft.theme]}${draft.density === 'compact' ? ' · compact' : ''}</span>
          <span>Folder</span><span style="font-family:var(--mono);font-size:12.5px">${esc(draft.folder)}</span>
          <span>Local brain</span><span>${draft.brain.enabled ? esc(draft.brain.model) : 'Off for now'}</span>
          <span>Startup</span><span>${[draft.startup.launchAtLogin && 'open at login', draft.startup.startInTray && 'tray', draft.startup.notifications && 'notifications', draft.startup.autoUpdate && 'auto-update'].filter(Boolean).join(' · ') || 'manual'}</span>
        </div></div>`,
    },
  ];

  async function probeBrain() {
    brainProbe = { state: 'checking', models: [] }; if (steps[step].id === 'brain') render();
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1800);
      const res = await fetch(draft.brain.host.replace(/\/$/, '') + '/api/tags', { signal: ctl.signal });
      clearTimeout(t);
      const data = await res.json();
      brainProbe = { state: 'found', models: (data.models || []).map(m => m.name) };
      if (!draft.brain.model) {
        const q = brainProbe.models.find(m => /qwen/i.test(m));
        if (q) draft.brain = { ...draft.brain, model: q, enabled: true };
      }
    } catch { brainProbe = { state: 'missing', models: [] }; }
    if (steps[step].id === 'brain') render();
  }

  function syncFoot() {
    const s = steps[step];
    const ok = s.valid ? s.valid() : true;
    $('#ob-next').disabled = !ok;
    $('#ob-next').textContent = s.cta || 'Continue';
    $('#ob-back').style.visibility = step === 0 ? 'hidden' : 'visible';
    $('#ob-skip').style.display = step === steps.length - 1 ? 'none' : '';
    $('#ob-hint').textContent = s.hint ? s.hint() : (ok ? 'Enter ↵ to continue' : '');
    $('#ob-steps').innerHTML = steps.map((_, i) => `<i class="${i < step ? 'done' : i === step ? 'on' : ''}"></i>`).join('');
  }

  function render() {
    const body = $('#ob-body');
    body.innerHTML = steps[step].render();
    body.style.animation = 'none'; void body.offsetWidth; body.style.animation = '';
    if (steps[step].bind) steps[step].bind();
    syncFoot();
  }

  function go(i) {
    step = Math.max(0, Math.min(steps.length - 1, i));
    render();
    if (steps[step].onEnter) steps[step].onEnter();
  }

  function finish({ skipped = false } = {}) {
    if (!draft.name.trim()) draft.name = 'Me';
    S.set({
      onboarded: true, name: draft.name.trim(), color: draft.color, theme: draft.theme, density: draft.density,
      folder: draft.folder, brain: draft.brain, startup: draft.startup,
      checklist: { setup: true, brain: !!draft.brain.enabled },
    });
    window.TribeHost.setAutostart(draft.startup.launchAtLogin);
    $('#onboard').classList.add('hidden');
    window.TribeApp.refresh();
    if (!skipped) setTimeout(() => window.TribeTour.start(), 350);
  }

  async function open({ fromSettings = false } = {}) {
    const cur = S.get();
    draft = JSON.parse(JSON.stringify({
      name: cur.name, color: cur.color, theme: cur.theme, density: cur.density, folder: cur.folder,
      brain: cur.brain, startup: cur.startup }));
    if (!draft.folder) {
      const home = await window.TribeHost.homeDir();
      draft.folder = home ? home.replace(/[\\/]$/, '') + (home.includes('\\') ? '\\TribeCode' : '/TribeCode') : '~/TribeCode';
    }
    $('#onboard').classList.remove('hidden');
    go(fromSettings ? 1 : 0);
  }

  $('#ob-next').addEventListener('click', () => { if (step === steps.length - 1) finish(); else go(step + 1); });
  $('#ob-back').addEventListener('click', () => go(step - 1));
  $('#ob-skip').addEventListener('click', () => finish({ skipped: true }));
  document.addEventListener('keydown', e => {
    if ($('#onboard').classList.contains('hidden')) return;
    if (e.key === 'Enter' && !$('#ob-next').disabled && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); $('#ob-next').click(); }
  });

  window.TribeOnboarding = { open, goTo: go, _draft: () => draft };
})();
