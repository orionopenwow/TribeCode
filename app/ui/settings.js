// Zero-step setup + one calm Settings page (replaces the old first-run wizard).
//  * First launch: name = the computer's user name (desktop: home folder; localhost: /api/health `user`,
//    which the server only reveals to local requests), folder = ~/TribeCode, color picked for you.
//    The desktop app then hosts on its own (app.js hostHere) and you land in your first project.
//  * Settings (gear, your avatar, More → Settings): a full window with tabs (Profile & look, Account, Plan & AI,
//    Notifications, Privacy, Workspace, Projects & sync, Tribe & admin, Accessibility, Storage & data, About), search
//    and deep links (#/settings/<tab>). Every setting and the tab it lives in: docs/SETTINGS-AUDIT.md.
// window.TribeOnboarding stays as a thin alias so older callers (palette, tests) keep working.
(function () {
  const $ = s => document.querySelector(s);
  const S = window.TribeStore;
  const C = () => window.TribeClient;
  const COLORS = ['#F26B1D', '#7C5CFF', '#FFB86B', '#38C6B1', '#FF6F8E', '#5B8CFF', '#9AE66E'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const pretty = n => String(n || '').replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 32);

  async function defaultFolder() {
    const home = await window.TribeHost.homeDir();
    return home ? home.replace(/[\\/]$/, '') + (home.includes('\\') ? '\\TribeCode' : '/TribeCode') : '';
  }
  async function osUser() {
    try { const h = await C().probe(); if (h && h.user) return h.user; } catch {}
    const home = await window.TribeHost.homeDir();
    return home ? home.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '';
  }
  // Fill in everything the wizard used to ask. Idempotent; never overwrites what you set.
  async function autoSetup() {
    const st = S.get(); if (st.onboarded) return false;
    const name = st.name || pretty(await osUser()) || 'Me';
    const color = st.color && st.color !== S.defaults.color ? st.color : COLORS[Math.floor(Math.random() * COLORS.length)];
    S.set({ onboarded: true, firstRun: true, name, color, folder: st.folder || await defaultFolder(), checklist: { setup: true }, tour: { done: true } });
    return true;
  }

  // ---------- Settings: a calm full window with tabs (feat/settings-tabs, docs/SETTINGS-AUDIT.md) ----------
  // Desktop: a sticky tab list on the left, the tab on the right. Phones: the tab list, then one tab with Back.
  // Search finds any setting in any tab and jumps to it. Deep links: #/settings/<tab>[/<setting id>].
  // TribeSettings.open(tab, settingId), TribeSettings.addSection(tab, { id, title, render }) for other features' settings.
  let probe = { state: 'idle', models: [] };
  async function probeBrain() {
    probe = { state: 'checking', models: [] }; draw();
    let models = [];
    try { const b = C().connected() ? (await C().api('/brain')).brain : null; if (b && b.online) { probe = { state: 'host', models: [b.model] }; draw(); return; } } catch {}
    // Only look for Ollama on this device when it could be the host (no tribe yet, or this page is served by this computer).
    const here = /^(localhost|127\.0\.0\.1|\[::1\]|tauri\.localhost)$/.test(location.hostname) || location.protocol === 'tauri:';
    if (C().connected() && !here) { probe = { state: 'missing', models: [] }; draw(); return; }
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1800);
      const r = await fetch(S.get().brain.host.replace(/\/$/, '') + '/api/tags', { signal: ctl.signal }); clearTimeout(t);
      models = ((await r.json()).models || []).map(m => m.name);
      probe = { state: 'found', models };
      const st = S.get(); if (!st.brain.model) { const q = models.find(m => /qwen/i.test(m)); if (q) S.set({ brain: { model: q, enabled: true }, checklist: { brain: true } }); }
    } catch { probe = { state: 'missing', models: [] }; }
    if (!window.TribeBrain) draw();   // only the old "Local brain" row shows the probe
  }

  const TABS = [
    { id: 'profile', label: 'Profile & look', icon: 'user', eyebrow: 'You' },
    { id: 'account', label: 'Account & sign-in', icon: 'key', eyebrow: 'Account' },
    { id: 'ai', label: 'Plan & AI', icon: 'sparkle', eyebrow: 'Plan and AI' },
    { id: 'notifications', label: 'Notifications', icon: 'bell', eyebrow: 'Notifications' },
    { id: 'privacy', label: 'Privacy & presence', icon: 'eye', eyebrow: 'Privacy' },
    { id: 'workspace', label: 'Workspace', icon: 'sliders', eyebrow: 'Workspace' },
    { id: 'projects', label: 'Projects & sync', icon: 'cloud', eyebrow: 'Projects' },
    { id: 'admin', label: 'Tribe & admin', icon: 'shield', eyebrow: 'Host and admins', admin: true },
    { id: 'a11y', label: 'Accessibility', icon: 'hand', eyebrow: 'Accessibility' },
    { id: 'storage', label: 'Storage & data', icon: 'device', eyebrow: 'Storage' },
    { id: 'about', label: 'About & help', icon: 'help', eyebrow: 'About' },
  ];
  // Rows other features add to Settings by themselves (accounts.js, auth2.js, presence.js, moderation.js, pwa.js): the tab each one lives in.
  // They land anywhere in #settings-body; place() moves each into its slot. Ids are the rows' own ids.
  const PLACE = { 'set-account': 'account', 'set-methods': 'account', 'set-sessions': 'account', 'set-testacc-row': 'account', 'set-signin-host': 'admin', 'set-resets': 'admin',
    'pz-set': 'privacy', 'set-safety-row': 'privacy', 'set-device-row': 'storage' };
  const INJ_KEYS = { 'set-account': 'switch account log in log out logout sign out', 'set-methods': 'password email passkey link unlink', 'set-sessions': 'devices sessions sign out',
    'set-signin-host': 'open sign-up smtp email invite only', 'set-resets': 'password reset forgot', 'set-safety-row': 'report block delete data', 'set-device-row': 'offline install storage cache', 'set-testacc-row': 'test accounts orion maya jay' };
  const EXTRA = {};   // tab -> [{ id, title, render }] from addSection
  const LS_TAB = 'tribecode.set.tab';
  let tab = null, inPane = false, query = '', lastScroll = {}, prevHash = null;
  const phone = () => matchMedia('(max-width: 720px)').matches;
  const role = () => ((C() && C().connected() && C().state().me) || {}).role || '';
  const isAdmin = () => ['host', 'admin', 'lead'].includes(role()) || !!(window.TribeRoles && C().connected() && window.TribeRoles.can && window.TribeRoles.can('roles.assign'));
  const visibleTabs = () => TABS.filter(t => !t.admin || isAdmin());
  const tabOf = id => TABS.find(t => t.id === id);
  const P = () => window.TribePrefs;

  const modal = () => $('#settings-modal');
  function ensure() {
    if (modal()) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="settings-modal" role="dialog" aria-modal="true" aria-label="Settings"><div class="modal-card set-card" id="settings-body"></div></div>');
    modal().addEventListener('click', e => { if (e.target === modal()) close(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || modal().classList.contains('hidden')) return;
      if (document.querySelector('#mod-dlg, #plans-pop, #brain-modal:not(.hidden), .lk-modal:not(.hidden)') && !e.target.closest('#settings-body')) return;   // a dialog opened from Settings closes first
      if (capturing) return;
      const s = $('#set-search'); if (s && s.value) { s.value = ''; query = ''; showResults(); s.focus(); return; }
      close();
    });
    new MutationObserver(place).observe(modal(), { childList: true, subtree: true });
    modal().addEventListener('change', e => { if (!e.target.closest('#set-search') && !e.target.closest('[data-nosave]')) saved(); });
    modal().addEventListener('click', e => { if (e.target.closest('[role="switch"], [data-theme-id], [data-color], .set-seg button')) setTimeout(saved, 60); });
  }
  function close() {
    const m = modal(); if (!m) return;
    m.classList.add('hidden');
    if (/^#\/settings/.test(location.hash)) history.replaceState(history.state, '', prevHash && !/^#\/settings/.test(prevHash) ? prevHash : location.pathname + location.search);
    prevHash = null;
    window.TribeApp && window.TribeApp.refresh();
  }
  let savedT = 0;
  function saved() {
    const el = $('#set-saved'); if (!el) return;
    el.textContent = 'Saved'; el.classList.add('on'); clearTimeout(savedT);
    savedT = setTimeout(() => { el.classList.remove('on'); }, 1400);
  }

  // feat/shell-polish: a quiet stroke icon beside each row's name (app/ui/icons.js)
  const SET_ICO = { Plan: 'bolt', Personalize: 'sparkle', Profile: 'user', Experience: 'sliders', Name: 'rename', Color: 'palette', Language: 'globe', Look: 'palette', 'Sidebar order': 'list', Folder: 'files', "Flint's brain": 'flame', 'Local brain': 'flame', 'Host on this computer': 'monitor', 'Open at login': 'monitor', 'Download updates in the background': 'download', 'Friends can ask my AI': 'people', GitHub: 'github', 'Save a copy': 'download', 'TribeCode MCP': 'plug', Chat: 'chat', 'Sign-in': 'key', 'Start fresh': 'refresh', 'Fix problems': 'wrench', 'Crash reports': 'bug', 'Agents in chat': 'agent', 'Starting modes': 'sliders', 'Roles &amp; privileges': 'shield', Packs: 'assets', Backup: 'cloud', 'Freesound sounds': 'media' };
  const setIco = label => SET_ICO[label] ? `<span data-icon="${SET_ICO[label]}"></span>` : '';
  const slug = s => String(s).toLowerCase().replace(/&amp;/g, 'and').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  // One row: label and hint on the left, the control on the right. o: { id, keys (extra search words), wide }
  function row(label, control, hint = '', o = {}) {
    const id = o.id || 'sr-' + slug(label);
    return `<div class="set-row${o.wide ? ' set-row-wide' : ''}" id="${id}" data-keys="${esc(o.keys || '')}"><div class="set-l"><b>${setIco(label)}${label}</b>${hint ? `<small>${hint}</small>` : ''}</div><div class="set-c">${control}</div></div>`;
  }
  const sw = (id, on, label, dis = false) => `<button class="toggle set-toggle" role="switch" id="${id}" aria-label="${esc(label)}" aria-checked="${!!on}"${dis ? ' disabled' : ''}><span class="switch"></span></button>`;
  const seg = (attr, cur, opts, label) => `<div class="set-seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button type="button" role="radio" ${attr}="${esc(v)}" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const sec = (title, body, o = {}) => body.trim() ? `<section class="set-sec"${o.id ? ` data-sec="${o.id}"` : ''}><h3 class="set-sec-h">${title}</h3>${o.note ? `<p class="set-note">${o.note}</p>` : ''}${body}</section>` : '';
  const slot = id => `<div class="set-slot" data-slot="${id}"></div>`;
  const on = () => C() && C().connected();

  // ---------- each tab ----------
  function tabProfile(st) {
    const L = window.TribeLook ? window.TribeLook.state() : null, eff = (L && L.effective) || {}, mine = Object.assign({ density: '', fontSize: '' }, st.look || {});
    const den = st.density === 'compact' ? 'compact' : 'comfortable', fs = mine.fontSize || eff.fontSize || 'm';
    const initial = esc(((st.name || 'Me').trim()[0] || 'M').toUpperCase());
    const pv = `<div class="set-pv" aria-hidden="true"><div class="set-pv-who"><span class="set-pv-av" style="background:${esc(st.color)}">${initial}</span><span><b style="color:${esc(st.color)}">${esc(st.name || 'You')}</b><small>${esc(window.TribeThemes ? (window.TribeThemes.byId(window.TribeThemes.resolve(st)) || {}).name || '' : '')} · ${den === 'compact' ? 'Compact' : 'Comfortable'}</small></span></div>
      <div class="set-pv-msgs"><span class="set-pv-b other">Pushed the new title screen.</span><span class="set-pv-b mine">Looks great. Shipping it.</span></div><span class="btn primary sm">Ship it</span></div>`;
    return sec('Your profile', `${pv}
      ${on() && window.TribeProfiles ? row('Profile', '<button class="btn" id="set-profile">Edit profile</button>', 'Avatar, name color, bio, status and your profile icon.', { keys: 'avatar bio status picture photo' }) : ''}
      ${row('Name', `<input class="input" id="set-name" maxlength="32" value="${esc(st.name)}" autocomplete="off" aria-label="Name">`, 'What your tribe sees.', { id: 'set-name-row' })}
      ${row('Color', `<div class="swatches">${COLORS.map(c => `<button class="swatch ${c === st.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === st.color}"></button>`).join('')}</div>`, 'Your name color in chat and on the rail.', { id: 'set-color-row', keys: 'name color' })}
      ${on() && window.TribePersonalize ? row('Personalize', '<button class="btn" id="set-personalize">Make it yours…</button>', 'Name, profile icon, theme, accent, language and text size, step by step with a live preview.', { keys: 'profile icon accent wizard' }) : ''}`)
    + sec('Look', `${themeRow(st)}
      ${row('Density', seg('data-den', den, [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density'), 'Compact fits more rows on the screen.', { id: 'set-density', keys: 'spacing compact comfortable cozy' })}
      ${row('Text size', seg('data-fs', fs, [['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']], 'Text size'), 'Every screen, on this device.', { id: 'set-textsize', keys: 'font size zoom bigger' })}
      ${window.TribeLook ? row('Look', '<button class="btn" id="set-look">Customize…</button>', 'Accent, background, and the tribe\'s name and icon.', { keys: 'accent background banner' }) : ''}
      ${window.TribeI18n ? row('Language', `<select class="input set-select" id="set-lang" aria-label="Language">${window.TribeI18n.LANGS.map(([k, n]) => `<option value="${k}" ${k === window.TribeI18n.lang() ? 'selected' : ''}>${n}</option>`).join('')}</select>`, 'Menus and buttons. What people write stays as they wrote it.', { keys: 'translate locale' }) : ''}`);
  }
  function tabAccount(st) {
    return sec('Account', `${slot('set-account')}${slot('set-methods')}
      ${on() ? row('Sign-in', '<div id="set-oauth"></div>', 'Discord, GitHub or Google: join with one tap, sign back in on a new device.', { id: 'set-oauth-row', keys: 'discord google github oauth providers' }) : ''}
      ${slot('set-sessions')}
      ${on() ? row('Sync my settings', sw('set-sync', P() && P().get().sync, 'Sync my settings'), 'Your theme, look, notifications sounds, shortcuts and language follow you to every device you sign in on. Kept on your tribe\'s server.', { id: 'set-sync-row', keys: 'sync devices cloud' }) : ''}
      ${slot('set-testacc-row')}`)
    + (on() ? sec('Devices', row('Signed in to this tribe', '<div id="set-devices" class="set-devlist"><span class="faint">Looking…</span></div>', 'Phones and computers with a device link. End one, or sign every other device out at once.', { id: 'set-devices-row', wide: true, keys: 'sessions devices sign out log out other remote' })) : '')
    + sec('Tribes', row('Start a new tribe', '<button class="btn" id="set-new">Start a new tribe</button>', 'A fresh tribe of your own: name, icon, where it lives, and an invite.', { keys: 'create' })
      + row('Join another tribe', '<button class="btn" id="set-join">Join with a link</button>', 'Paste an invite link from a friend.', { keys: 'invite link' }))
    + (on() ? sec('Delete account', row('Delete my account', '<div id="set-delete"></div>', 'Your account leaves the tribe after 7 days. Change your mind any time before then.', { id: 'set-delete-row', wide: true, keys: 'remove close erase gdpr' })) : '');
  }
  function tabAI(st) {
    const brainTxt = probe.state === 'host' ? `${esc(probe.models[0])} on the host` : probe.state === 'found' ? (st.brain.enabled ? `${esc(st.brain.model)}` : 'Ollama found') : probe.state === 'checking' ? 'Looking…' : 'Off. Install Ollama and run <code>ollama pull qwen3</code>.';
    return sec('Plan', window.TribePlans ? row('Plan', window.TribePlans.chip({ id: 'set-plan-chip' }), 'Free forever, Premium, AI credits, or your own AI. Tap to see the plans.', { keys: 'premium credits billing upgrade' }) : '')
    + sec('Your AI', `${window.TribeBrain ? row('Flint\'s brain', '<div id="set-flintbrain"></div>', 'Built in, Ollama, or a cloud model with your key. Also writes summaries, drafts and standups.', { keys: 'model llm ollama openai claude key' }) : row('Local brain', `<span class="set-brain">${brainTxt}</span>${probe.state === 'found' && probe.models.length ? `<select id="set-model">${['', ...probe.models].map(m => `<option value="${esc(m)}" ${(st.brain.enabled ? st.brain.model : '') === m ? 'selected' : ''}>${m ? esc(m) : 'Off'}</option>`).join('')}</select>` : ''}`, 'Writes summaries and standups on this computer.')}
      ${on() && window.TribeAgentsHub ? row('Connect your AI', '<button class="btn" id="set-connectai">Your agents…</button>', 'Claude Code, Codex, Cursor and others work in this tribe as your agents.', { keys: 'claude code agent connect' }) : ''}
      ${on() && window.TribeMcpDir ? row('TribeCode MCP', '<button class="btn" id="set-mcp" data-mcpdir-open>Open</button>', 'Use this project inside Claude, ChatGPT, VS Code, Cursor and more. (MCP is the plug AI tools use to talk to TribeCode.)') : ''}
      ${on() ? row('Friends can ask my AI', `<select class="input set-select" id="set-askai" aria-label="Friends can ask my AI"><option value="ask">Ask me each time</option><option value="always">Always</option><option value="never">Never</option></select>`, 'When a friend without an AI of their own types @ai, your AI can answer. It uses your subscription, so you decide.') : ''}
      ${on() && window.TribeMentions ? row('Agents in chat', '<div id="set-pubagents"></div>', 'Type @my-claude or @maya\'s-claude in a channel: the agent answers there for everyone. Each owner\'s "Friends can ask my AI" still applies.') : ''}
      ${window.TribeAcademy ? row('Free AI tools', '<button class="btn" id="set-offload">Open Offload</button>', 'Some jobs don\'t need your AI: verified free tools, a ready prompt, and a way to bring the result back.', { keys: 'free bridge offload' }) : ''}`)
    + sec('Flint', `${on() && window.TribeFlintMem ? `<div class="set-row set-row-wide" id="set-flint" data-keys="memory remember skills"><div class="set-l"><b>Flint</b><small>What Flint remembers about you, how you like to learn, and the tribe's skills.</small></div><div class="set-c" id="set-flintmem"></div></div>` : ''}
      ${row('Flint\'s tips', sw('set-flint-tips', !P() || P().get().flintTips !== false, 'Flint\'s tips'), 'Short hints from Flint the first time you open something new.', { keys: 'hints tips guide autoplay' })}
      ${row('Flint reads aloud', sw('set-flint-voice', P() && P().get().flintVoice, 'Flint reads aloud'), 'Flint speaks his answers with this device\'s voice.', { keys: 'voice speech speak tts' })}`)
    + sec('Cloud AI privacy', row('Allowed cloud AIs', '<div id="set-aiconsent"></div>', 'Before anything first goes to a cloud AI, TribeCode asks and names the provider. Revoke and it asks again.', { id: 'set-aiconsent-row', wide: true, keys: 'consent privacy provider revoke openai anthropic' }));
  }
  function tabNotifications() {
    return `<div id="set-nf"><p class="set-note">Loading your notification settings…</p></div>`;
  }
  function tabPrivacy(st) {
    const pr = P() ? P().get() : {};
    return sec('Presence', slot('pz-set'))
    + (on() ? sec('Messages', row('Who can DM me', `<select class="input set-select" id="set-dm" aria-label="Who can DM me"><option value="everyone">Everyone in the tribe</option><option value="known">People I've written to</option><option value="staff">Only the host and mods</option></select>`, 'Your own agents, the host and mods can always reach you. Blocked people never can.', { keys: 'direct messages dm privacy' })
      + row('Send typing indicators', sw('set-typing', true, 'Send typing indicators'), 'Others see "typing…" while you write to them.', { keys: 'typing' })
      + row('Show typing indicators', sw('set-show-typing', pr.showTyping !== false, 'Show typing indicators'), 'See when others are typing.', { keys: 'typing' })
      + row('Read ticks', sw('set-ticks', pr.readTicks !== false, 'Read ticks'), '✓ sent and ✓✓ read in your own agent\'s chat.', { keys: 'read receipts seen' })) : '')
    + (on() && window.TribeModeration ? sec('Blocked people', row('Blocked', '<div id="set-blocked"></div>', 'They can\'t message you and you don\'t see their messages. Block someone from their profile or a message\'s menu.', { id: 'set-blocked-row', wide: true, keys: 'block unblock mute' })) : '')
    + sec('Your data', `${on() ? row('Download my data', '<button class="btn" id="set-mydata">Download (.zip)</button>', 'Messages you wrote, tasks you made or own, docs you made, your uploads and your settings, in one .zip.', { keys: 'export gdpr data takeout' }) : ''}
      ${row('Crash reports', sw('set-crash', st.crashReports !== false, 'Send crash reports'), 'When something breaks, send the error and recent logs to the bug inbox. Repeats are filed once.', { keys: 'telemetry errors' })}
      ${slot('set-safety-row')}
      ${row('Legal', '<span class="set-linkrow"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a><a href="terms.html" target="_blank" rel="noopener">Terms</a></span>', 'Your tribe\'s data lives with its host, not with TribeCode.', { id: 'set-legal-privacy', keys: 'policy terms' })}`);
  }
  const HOMES = [['', 'Where I left off'], ['hub', 'Home'], ['chat', 'Chat'], ['docs', 'Docs'], ['tasks', 'Tasks'], ['work', 'Work'], ['agents-hub', 'Your agents']];
  function tabWorkspace(st) {
    const pr = P() ? P().get() : {}, desk = window.TribeHost.isDesktop;
    return sec('How it works for you', `${window.TribeMode ? row('Experience', '<div id="set-mode"></div>', 'How much of TribeCode you see. Your role still decides what you can do.', { keys: 'beginner intermediate advanced level mode' }) : ''}
      ${row('Default home page', `<select class="input set-select" id="set-home" aria-label="Default home page">${HOMES.map(([v, l]) => `<option value="${v}" ${v === (pr.homePage || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'Where TribeCode opens.', { keys: 'start page landing open' })}
      ${window.TribeReorder ? row('Sidebar order', '<button class="btn" id="set-reorder">Reset order</button>', 'Drag the rail and the sidebar rows into your own order (or focus one and press Alt+↑ / Alt+↓). This puts them back.') : ''}
      ${desk ? row('Open at login', sw('set-login', st.startup.launchAtLogin, 'Open at login'), 'TribeCode starts when you sign in to this computer.') : ''}`)
    + sec('Keyboard shortcuts', row('Shortcuts', '<div id="set-keys"></div>', 'Press Change, then the keys you want. Esc cancels.', { id: 'set-keys-row', wide: true, keys: 'keyboard hotkeys keys bindings ctrl' }))
    + sec('Chat and editor', `${on() && window.TribeChatRich ? row('Chat', '<div id="set-chat"></div>', 'Link previews, GIF search and chat backgrounds.', { keys: 'gif link preview background' }) : ''}
      ${row('Spellcheck', sw('set-spell', pr.spellcheck !== false, 'Spellcheck'), 'Underline misspelled words in chat, docs and forms.', { keys: 'spelling editor' })}
      ${row('Autosave', '<span class="set-info">Always on</span>', 'Docs save as you type, and live co-editing keeps everyone in step.', { keys: 'save editor' })}`);
  }
  const PHOMES = [['ask', 'Ask each time'], ['device', 'This device'], ['computer', 'This computer hosts it'], ['github', 'GitHub'], ['cloud', 'Free cloud']];
  function tabProjects(st) {
    const desk = window.TribeHost.isDesktop, pr = P() ? P().get() : {};
    const ext = (EXTRA.projects || []).map(x => `<section class="set-sec" data-sec="${esc(x.id)}" id="set-ext-${esc(x.id)}"><h3 class="set-sec-h">${esc(x.title)}</h3><div class="set-ext" data-ext="${esc(x.id)}"></div></section>`).join('');
    return sec('Where projects live', `${row('Default home for new projects', `<select class="input set-select" id="set-projhome" aria-label="Default home for new projects">${PHOMES.map(([v, l]) => `<option value="${v}" ${v === (pr.projectHome || 'ask') ? 'selected' : ''}>${l}</option>`).join('')}</select>`, 'Where a new project is kept unless you pick another place.', { keys: 'new project location where' })}
      ${on() && window.TribeStorage ? `<div class="set-row set-row-wide" id="set-storage-row" data-keys="storage sync drafts"><div class="set-l"><b>Storage &amp; sync</b><small>Where your tribe, code and drafts are kept, and what keeps them safe.</small></div><div class="set-c" id="set-storage"></div></div>` : ''}
      ${desk ? row('Folder', `<div class="folder"><input class="input" id="set-folder" value="${esc(st.folder)}" spellcheck="false" aria-label="Folder"><button class="btn" id="set-browse">Browse</button></div>`, 'Docs, tasks and chat live here as plain files.') : ''}`)
    + sec('GitHub', on() && window.TribeGitHub ? row('GitHub', '<div id="set-github"></div>', 'Sign in once and everything pushes on its own.', { keys: 'git push ship repo' }) : row('GitHub', '<span class="faint">Start your tribe first (Home › Create your first project), then sign in here.</span>', 'Sign in once and everything pushes on its own.'))
    + ext;
  }
  function tabAdmin(st) {
    const desk = window.TribeHost.isDesktop;
    return sec('Sign-up and email', `${slot('set-signin-host')}${slot('set-resets')}${row('Accounts', '<span class="set-info">Off on this server</span>', 'Sign-up rules, password resets and email appear here when accounts are on (start the server with TRIBE_ACCOUNTS=1).', { id: 'set-signup-off', keys: 'smtp email open sign-up accounts' })}`, { note: 'Who can make an account here, and how TribeCode sends sign-in and notification email.' })
    + sec('People', `${on() ? row('Invites', '<button class="btn" id="set-invite">Invite people…</button>', 'A link or QR code to bring friends in, with the role they start as.', { keys: 'invite link qr join' }) : ''}
      ${canRoles() ? row('Roles &amp; privileges', '<button class="btn" id="set-roles">Manage</button>', 'Admins, 🛡️ mods and what each role can do.', { keys: 'permissions admin mod' }) : ''}
      ${canRoles() && window.TribeMode && on() ? row('Starting modes', '<div id="set-rolemodes"></div>', 'The experience each role starts with. Anyone can change their own.') : ''}
      ${on() && window.TribeModeration ? row('Moderation', '<button class="btn" id="set-mod">Reports &amp; word filter</button>', 'Reports from members, and words that show as •••• in every message.', { keys: 'reports filter ban moderate' }) : ''}`)
    + sec('Hosting', `${desk ? row('Host on this computer', sw('set-host', st.hosting && !st.hostOff, 'Host on this computer', !st.hosting), st.hosting ? 'Your tribe runs here only while this is on. Off stops the server; nothing is deleted.' : 'Starts when you create your first project.', { keys: 'server host' }) : ''}
      ${on() ? row('Server address', `<span class="set-url"><code id="set-server-url">${esc(C().base() || location.origin)}</code><button class="btn sm" id="set-server-copy">Copy</button></span>`, 'Where this tribe is served from. Invites carry it for you.', { id: 'set-server', keys: 'url hosting address' }) : ''}
      ${isHost() && on() ? row('Freesound sounds', '<form class="set-fs" id="set-fs" autocomplete="off"><input class="input" id="set-fs-key" type="password" placeholder="API key" aria-label="Freesound API key" maxlength="80"><button class="btn" type="submit" id="set-fs-save">Save</button></form>', 'With a free key from freesound.org/apiv2/apply, the inspiration board also searches Freesound. The key stays on this server and is never sent to anyone\'s browser. <span id="set-fs-st"></span>') : ''}`, { id: 'hosting' })
    + sec('Backups', isHost() ? row('Backup', '<button class="btn" id="set-backup">Download backup</button>', 'The whole tribe folder as one .tar.gz. GitHub keys stay on this computer.', { keys: 'export restore' }) : '')
    + sec('Danger zone', desk && on() && role() === 'host' ? row('Start fresh', '<button class="btn danger" id="set-fresh">Start fresh…</button>', 'Moves this whole tribe (every account and guest, chat, projects, docs) into a backup folder next to it and starts an empty one. You become the host again. Nothing is deleted.', { keys: 'reset wipe' }) : '');
  }
  function tabA11y(st) {
    const pr = P() ? P().get() : {}, fs = (st.look || {}).fontSize || 'm';
    return sec('Seeing', `${row('Increase contrast', sw('set-contrast', pr.contrast, 'Increase contrast'), 'Brighter text and borders on every theme.', { keys: 'contrast vision' })}
      ${window.TribeThemes ? row('High contrast theme', `<button class="btn" id="set-hc">${S.get().theme === 'contrast' ? 'On' : 'Use it'}</button>`, 'Black and white with strong edges.', { keys: 'contrast theme' }) : ''}
      ${row('Text size', seg('data-fs', fs, [['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']], 'Text size'), 'The same setting as in Profile & look.', { id: 'set-a11y-fs', keys: 'font zoom' })}
      ${row('Readable font', sw('set-readable', pr.readable, 'Readable font'), 'A plainer, wider font with more space between letters. Easier with dyslexia.', { keys: 'dyslexia dyslexic font legible' })}
      ${row('Focus rings', seg('data-focus', pr.focus || 'normal', [['normal', 'Normal'], ['strong', 'Strong']], 'Focus rings'), 'How clearly the keyboard focus is outlined.', { id: 'set-focus', keys: 'keyboard outline focus' })}`)
    + sec('Motion', row('Reduce motion', seg('data-motion', pr.motion || 'system', [['system', 'Match system'], ['off', 'Reduce']], 'Reduce motion'), 'Fades and slides. Reduce stops them everywhere.', { id: 'set-motion', keys: 'animation motion vestibular' }))
    + sec('Hearing', row('Captions in huddles', sw('set-captions', pr.captions, 'Captions in huddles'), 'Turn captions on when you join a huddle.', { keys: 'subtitles deaf hearing voice' }))
    + sec('Screen readers', row('Announce notifications', sw('set-sr', pr.announce, 'Announce notifications'), 'Screen readers read new notifications aloud as they arrive.', { keys: 'screen reader aria live voiceover nvda' }));
  }
  function tabStorage(st) {
    return sec('This device', `${slot('set-device-row')}
      ${row('Space used', '<span id="set-usage" class="set-info">Measuring…</span>', 'What TribeCode keeps in this browser or app: settings, drafts and the offline copy.', { keys: 'storage disk quota' })}
      ${row('Fix problems', '<button class="btn" id="set-refresh">Refresh TribeCode</button>', 'Clears the app\'s stored files and reloads it fresh. You stay signed in, and your drafts, unsent messages and place are kept.', { keys: 'clear cache reload broken' })}
      ${isHost() && window.TribePacks ? row('Packs', '<div id="set-packs"></div>', 'Optional tools for video captions and local transcripts. Downloaded on this computer, checked by sha256.', { keys: 'asset packs download' }) : ''}`)
    + sec('Your settings', `${row('Export settings', '<button class="btn" id="set-export-settings">Export (.json)</button>', 'Your theme, look, notifications on this device, shortcuts and language as one file.', { keys: 'backup json' })}
      ${row('Import settings', '<button class="btn" id="set-import-settings">Import…</button><input type="file" id="set-import-file" accept="application/json,.json" hidden data-nosave>', 'Load a settings file you exported.', { keys: 'restore json' })}
      ${row('Reset settings', '<button class="btn danger" id="set-reset-settings">Reset…</button>', 'Back to the defaults on this device. You stay signed in.', { keys: 'defaults' })}`)
    + (on() && window.TribeExport ? sec('Copies', row('Save a copy', '<button class="btn" id="set-copy">Save a copy</button>', 'Everything you can see here (messages, docs, tasks) as one .zip on this device, so nothing is lost. Your code also lives in the project\'s GitHub repository.', { keys: 'backup zip' })) : '');
  }
  function tabAbout(st) {
    const U = window.TribeUpdater;
    return sec('TribeCode', `${row('Version', '<span id="set-version" class="set-info">…</span>', '', { keys: 'version build release' })}
      ${row('Updates', '<span class="set-upd"><span id="set-upd-st" class="set-info"></span><button class="btn" id="set-check-update">Check for updates</button></span>', 'The desktop app updates itself. On the web, a reload gets the newest version.', { id: 'set-updates', keys: 'update upgrade restart' })}
      ${U && U.supported() ? row('Download updates in the background', sw('set-bgupdate', st.startup.autoUpdate !== false, 'Download updates in the background'), st.startup.autoUpdate !== false ? 'New versions download quietly. When one is ready, Restart to update opens it in seconds.' : 'You see Update available and choose when to download.') : ''}
      ${row('What\'s new', '<a class="btn" href="https://github.com/orionopenwow/TribeCode/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Changelog</a>', 'Every release, what changed.', { keys: 'changelog release notes' })}`)
    + sec('Help', `${window.TribeGuide ? row('Guide', '<button class="btn set-guide" id="set-guide" title="How to TribeCode"><span aria-hidden="true">?</span> Open the guide</button>', 'How to TribeCode, page by page.', { keys: 'docs manual how' }) : ''}
      ${row('Tour with Flint', '<button class="btn" id="set-tour">Start the tour</button>', 'A short walk around the app.', { keys: 'tour onboarding' })}
      ${window.TribeOffline ? row('Demo', `<button class="btn" id="set-demo">${esc(window.TribeOffline.label())}</button>`, 'A pretend tribe that lives only in this tab.', { keys: 'demo try' }) : ''}
      ${row('Keyboard shortcuts', '<button class="btn" id="set-keysheet">Show all</button>', 'Ctrl / opens them anywhere.', { id: 'set-keysheet-row', keys: 'shortcuts keys' })}
      ${row('Report a bug', '<button class="btn" id="set-bug">Report a bug</button>', 'A screenshot, what you did, and the recent logs go to the bug inbox.', { keys: 'bug problem broken feedback' })}
      ${window.TribeFeedback ? row('Send feedback', '<button class="btn" id="set-feedback">Send feedback</button>', 'Ideas, wishes and what felt wrong.', { keys: 'idea wish' }) : ''}
      ${row('Support', '<a class="btn" href="support.html" target="_blank" rel="noopener">Contact support</a>', 'Help from a person.', { keys: 'help contact' })}`)
    + sec('Legal', `${row('Privacy and terms', '<span class="set-linkrow"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a><a href="terms.html" target="_blank" rel="noopener">Terms</a><a href="delete-account.html" target="_blank" rel="noopener">Delete on the web</a></span>', '', { id: 'set-legal', keys: 'policy' })}
      ${row('Licenses', '<span class="set-linkrow"><a href="https://github.com/orionopenwow/TribeCode/blob/main/LICENSE" target="_blank" rel="noopener">MIT license</a><a href="https://github.com/orionopenwow/TribeCode/blob/main/NOTICE" target="_blank" rel="noopener">NOTICE</a></span>', 'TribeCode is open source. NOTICE credits the work it builds on.', { id: 'set-licenses', keys: 'open source notice credits' })}`);
  }
  const RENDER = { profile: tabProfile, account: tabAccount, ai: tabAI, notifications: tabNotifications, privacy: tabPrivacy, workspace: tabWorkspace, projects: tabProjects, admin: tabAdmin, a11y: tabA11y, storage: tabStorage, about: tabAbout };

  // ---------- the window ----------
  function draw() {
    const box = $('#settings-body'); if (!box || modal().classList.contains('hidden')) return;
    const st = S.get(), tabs = visibleTabs();
    if (!tab || !tabs.some(t => t.id === tab)) tab = 'profile';
    const main = box.querySelector('.set-main'); if (main) lastScroll[tab] = main.scrollTop;
    const html = tabs.map(t => `<div class="set-pane" role="tabpanel" id="set-pane-${t.id}" data-tab="${t.id}" aria-labelledby="set-tab-${t.id}" ${t.id === tab ? '' : 'hidden'}><header class="set-pane-h"><span class="eyebrow">${esc(t.eyebrow)}</span><h2>${esc(t.label)}</h2></header>${RENDER[t.id](st)}${t.id === 'projects' ? '' : (EXTRA[t.id] || []).map(x => `<section class="set-sec" data-sec="${esc(x.id)}" id="set-ext-${esc(x.id)}"><h3 class="set-sec-h">${esc(x.title)}</h3><div class="set-ext" data-ext="${esc(x.id)}"></div></section>`).join('')}</div>`).join('');
    box.classList.toggle('in-pane', inPane);
    box.innerHTML = `<header class="set-head"><button class="set-back" id="set-back" aria-label="Back to all settings"><span data-icon="chev"></span></button><h2>Settings</h2>
        <label class="set-search"><span data-icon="search"></span><input id="set-search" type="search" placeholder="Search settings" aria-label="Search settings" autocomplete="off" spellcheck="false" value="${esc(query)}"></label>
        <span class="set-saved" id="set-saved" aria-live="polite"></span><button class="btn ghost" id="set-close" aria-label="Close settings">Done</button></header>
      <div class="set-body"><nav class="set-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical">${tabs.map(t => `<button class="set-tab${t.id === tab ? ' on' : ''}" role="tab" id="set-tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === tab}" aria-controls="set-pane-${t.id}" tabindex="${t.id === tab ? 0 : -1}"><span data-icon="${t.icon}" data-icon-size="17"></span><span class="set-tab-l">${esc(t.label)}</span><span class="set-tab-go" data-icon="chev" aria-hidden="true"></span></button>`).join('')}</nav>
      <div class="set-main" id="set-main">${html}<div class="set-results" id="set-results" hidden></div></div></div>
      <div class="set-more" id="set-more" hidden></div>`;
    wire(box, st);
    place();
    if (query) showResults();
    const m2 = box.querySelector('.set-main'); if (m2 && lastScroll[tab]) m2.scrollTop = lastScroll[tab];
  }
  // Move rows other features add into their slots (newest copy wins).
  function place() {
    const box = $('#settings-body'); if (!box) return;
    for (const [id] of Object.entries(PLACE)) {
      const all = [...box.querySelectorAll('#' + id)]; if (!all.length) continue;
      const sl = box.querySelector(`.set-slot[data-slot="${id}"]`);
      if (!sl) { all.forEach(el => { if (!el.closest('.set-slot')) el.hidden = true; }); continue; }   // its tab isn't shown
      const fresh = all.filter(el => el.parentNode !== sl), keep = fresh.length ? fresh[fresh.length - 1] : all[0];
      for (const el of all) if (el !== keep) el.remove();
      if (keep.parentNode !== sl) sl.appendChild(keep);
    }
    // rows other features add: an id to jump to, and words to find them by
    box.querySelectorAll('.set-pane .set-row:not([id])').forEach(r => { const l = r.querySelector('.set-l b'); if (l) r.id = 'sr-' + slug(l.textContent); });
    for (const [id, k] of Object.entries(INJ_KEYS)) { const r = box.querySelector('#' + id); if (r && !r.dataset.keys) r.dataset.keys = k; }
    const off = box.querySelector('#set-signup-off'); if (off) off.hidden = !!box.querySelector('[data-slot="set-signin-host"] > *, [data-slot="set-resets"] > *');
  }
  function select(id, opts = {}) {
    const box = $('#settings-body'); if (!box || !tabOf(id)) return;
    if (!visibleTabs().some(t => t.id === id)) id = 'profile';
    const main = box.querySelector('.set-main'); if (main) lastScroll[tab] = main.scrollTop;
    const go = () => {
      tab = id; try { localStorage.setItem(LS_TAB, id); } catch {}
      box.querySelectorAll('.set-tab').forEach(b => { const me = b.dataset.tab === id; b.classList.toggle('on', me); b.setAttribute('aria-selected', String(me)); b.tabIndex = me ? 0 : -1; });
      box.querySelectorAll('.set-pane').forEach(p => { p.hidden = p.dataset.tab !== id; });
      if (opts.pane !== false) { inPane = true; box.classList.add('in-pane'); }
      const s = $('#set-search'); if (s && s.value && !opts.keepSearch) { s.value = ''; query = ''; showResults(); }
      if (main) main.scrollTop = opts.top ? 0 : (lastScroll[id] || 0);
      lazy(id);
      hashFor(id);
    };
    window.TribeMotion ? window.TribeMotion.swap(go) : go();
  }
  function hashFor(id) { if (!modal() || modal().classList.contains('hidden')) return; const h = '#/settings/' + id; if (location.hash !== h) history.replaceState(history.state, '', location.pathname + location.search + h); }

  // ---------- search ----------
  function showResults() {
    const box = $('#settings-body'), res = $('#set-results'); if (!box || !res) return;
    const q = query.trim().toLowerCase(), panes = box.querySelectorAll('.set-pane');
    if (!q) { res.hidden = true; res.innerHTML = ''; panes.forEach(p => { p.hidden = p.dataset.tab !== tab; }); return; }
    const words = q.split(/\s+/);
    const hits = [];
    box.querySelectorAll('.set-pane .set-row').forEach(r => {
      if (r.hidden || r.closest('[hidden]:not(.set-pane)')) return;
      const lab = r.querySelector('.set-l b'), hint = r.querySelector('.set-l small'); if (!lab) return;
      const btns = [...r.querySelectorAll('.set-c > button, .set-c > a, .set-c > span > button')].map(x => x.textContent).join(' ');
      const hay = (lab.textContent + ' ' + (hint ? hint.textContent : '') + ' ' + (r.dataset.keys || '') + ' ' + btns + ' ' + r.closest('.set-pane').querySelector('.set-pane-h h2').textContent).toLowerCase();
      if (!words.every(w => hay.includes(w))) return;
      const score = lab.textContent.toLowerCase().includes(q) ? 0 : 1;
      hits.push({ id: r.id, tab: r.closest('.set-pane').dataset.tab, label: lab.textContent.trim(), hint: hint ? hint.textContent.trim() : '', score });
    });
    hits.sort((a, b) => a.score - b.score);
    panes.forEach(p => { p.hidden = true; });
    res.hidden = false;
    res.innerHTML = `<header class="set-pane-h"><span class="eyebrow">Search</span><h2>${hits.length ? `${hits.length} setting${hits.length === 1 ? '' : 's'}` : 'Nothing found'}</h2></header>`
      + (hits.length ? `<ul class="set-hits" role="listbox" aria-label="Matching settings">${hits.slice(0, 40).map(h => `<li><button class="set-hit" role="option" data-hit="${esc(h.id)}" data-hit-tab="${esc(h.tab)}"><b>${esc(h.label)}</b><small>${esc((tabOf(h.tab) || {}).label || '')}${h.hint ? ' · ' + esc(h.hint.slice(0, 90)) : ''}</small></button></li>`).join('')}</ul>` : `<p class="set-note">Try another word, like "theme", "sound" or "export".</p>`);
    res.querySelectorAll('[data-hit]').forEach(b => b.onclick = () => jump(b.dataset.hitTab, b.dataset.hit));
  }
  function jump(t, id) {
    const s = $('#set-search'); if (s) s.value = ''; query = '';
    showResults(); select(t, { top: true });
    if (!id) return;
    const go = (n = 0) => {
      const el = document.getElementById(id); if (!el) { if (n < 20) setTimeout(() => go(n + 1), 100); return; }
      const r = el.closest('.set-row, .set-sec') || el;
      r.scrollIntoView({ block: 'center', behavior: P() && P().reduced() ? 'auto' : 'smooth' });
      r.classList.remove('set-hl'); void r.offsetWidth; r.classList.add('set-hl'); setTimeout(() => r.classList.remove('set-hl'), 2000);
      const f = r.querySelector('input:not([type=hidden]):not([hidden]), select, button:not([disabled])'); if (f) try { f.focus({ preventScroll: true }); } catch {}
    };
    setTimeout(go, 30);
  }

  // ---------- wiring ----------
  let capturing = false;
  function wire(box, st) {
    const q = s => box.querySelector(s), click = (s, f) => { const el = q(s); if (el) el.onclick = f; return el; };
    click('#set-close', close);
    click('#set-back', () => { inPane = false; box.classList.remove('in-pane'); const t = q(`.set-tab[data-tab="${tab}"]`); if (t) t.focus(); });
    box.querySelectorAll('.set-tab').forEach(b => {
      b.onclick = () => select(b.dataset.tab, { top: false });
      b.onkeydown = e => {
        const bs = [...box.querySelectorAll('.set-tab')], i = bs.indexOf(b);
        const n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
        if (n === null) return; e.preventDefault(); const t = bs[(n + bs.length) % bs.length]; t.focus(); select(t.dataset.tab, { pane: !phone() });
      };
    });
    const sq = q('#set-search');
    sq.oninput = () => { query = sq.value; if (query && phone()) { inPane = true; box.classList.add('in-pane'); } showResults(); };
    sq.onkeydown = e => { if (e.key === 'Enter') { const h = box.querySelector('[data-hit]'); if (h) { e.preventDefault(); h.click(); } } if (e.key === 'ArrowDown') { const h = box.querySelector('[data-hit]'); if (h) { e.preventDefault(); h.focus(); } } };

    // Profile & look
    click('#set-profile', () => { close(); window.TribeProfiles.edit(); });
    click('#set-personalize', () => { close(); window.TribePersonalize.open(0); });
    const nm = q('#set-name'); if (nm) nm.onchange = () => { const v = nm.value.trim(); if (v) { S.set({ name: v }); syncMe({ name: v }); } window.TribeApp.refresh(); draw(); };
    box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { S.set({ color: b.dataset.color }); syncMe({ color: b.dataset.color }); window.TribeApp.refresh(); draw(); });
    box.querySelectorAll('[data-den]').forEach(b => b.onclick = () => { const d = b.dataset.den; S.set({ density: d, look: { density: d === 'compact' ? 'compact' : 'cozy' } }); if (window.TribeLook) window.TribeLook.apply(); document.body.classList.toggle('compact', d === 'compact'); draw(); });
    box.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { S.set({ look: { fontSize: b.dataset.fs } }); if (window.TribeLook) window.TribeLook.apply(); else document.documentElement.dataset.fs = b.dataset.fs === 'm' ? '' : b.dataset.fs; draw(); });
    click('#set-look', () => { close(); window.TribeLook.open(on() ? 'tribe' : 'me'); });
    const lng = q('#set-lang'); if (lng) lng.onchange = () => { window.TribeI18n.set(lng.value); };
    box.querySelectorAll('[data-theme-id]').forEach(b => b.onclick = () => {
      const T = window.TribeThemes, t = T.byId(b.dataset.themeId), cur = S.get();
      const sysMode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      S.set({ ...T.pick(t.id), themeSystem: !!(cur.themeSystem || cur.theme === 'system') && t.mode === sysMode });
      window.TribeApp.applyTheme(); draw();
    });
    click('#set-theme-sys', () => {
      const T = window.TribeThemes, cur = S.get(), v = !(cur.themeSystem || cur.theme === 'system');
      S.set({ themeSystem: v, theme: cur.theme === 'system' ? T.resolve(cur) : cur.theme });
      window.TribeApp.applyTheme(); draw();
    });

    // Account & sign-in
    if (window.TribeAccounts) window.TribeAccounts.settings(box);   // Account (Switch, Log out), sessions, sign-in methods, Test accounts (accounts.js, auth2.js)
    const oa = q('#set-oauth'); if (oa && window.TribeOAuth) window.TribeOAuth.mount(oa);
    click('#set-sync', e => { const v = !P().get().sync; P().set({ sync: v }); e.currentTarget.setAttribute('aria-checked', String(v)); if (v) P().syncNow(false); });
    click('#set-new', () => { close(); if (window.TribeNew) window.TribeNew.open({ from: 'settings' }); });
    click('#set-join', () => { close(); joinPrompt(); });
    if (q('#set-devices')) devicesRow(q('#set-devices'));
    if (q('#set-delete')) deleteRow(q('#set-delete'));

    // Plan & AI
    const fb = q('#set-flintbrain'); if (fb) window.TribeBrain.mountRow(fb);
    const md = q('#set-model'); if (md) md.onchange = () => { S.set({ brain: { model: md.value, enabled: !!md.value }, checklist: { brain: !!md.value } }); window.TribeApp.refresh(); };
    click('#set-connectai', () => { close(); window.TribeAgentsHub.open(); });
    const ai = q('#set-askai');
    if (ai) { C().api('/ask/policy').then(r => { ai.value = r.policy; }).catch(() => {}); ai.onchange = () => C().api('/ask/policy', { method: 'PUT', body: { policy: ai.value } }).catch(e => toast(e.message)); }
    if (window.TribeMentions) window.TribeMentions.settingsRow(q('#set-pubagents'));
    click('#set-offload', () => { close(); window.TribeAcademy.open({ tab: 'offload' }); });
    const fm = q('#set-flintmem'); if (fm) window.TribeFlintMem.mountSettings(fm);
    click('#set-flint-tips', e => { const v = P().get().flintTips === false; P().set({ flintTips: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    click('#set-flint-voice', e => { const v = !P().get().flintVoice; P().set({ flintVoice: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    if (q('#set-aiconsent')) consentRow(q('#set-aiconsent'));

    // Privacy & presence
    const dm = q('#set-dm'), ty = q('#set-typing');
    if (dm) {
      C().api('/me/privacy').then(r => { dm.value = r.privacy.dm; ty.setAttribute('aria-checked', String(r.privacy.typing !== false)); }).catch(() => {});
      dm.onchange = () => C().api('/me/privacy', { method: 'PUT', body: { dm: dm.value } }).catch(e => toast(e.message));
      ty.onclick = () => { const v = ty.getAttribute('aria-checked') !== 'true'; ty.setAttribute('aria-checked', String(v)); C().api('/me/privacy', { method: 'PUT', body: { typing: v } }).catch(e => toast(e.message)); };
    }
    click('#set-show-typing', e => { const v = P().get().showTyping === false; P().set({ showTyping: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    click('#set-ticks', e => { const v = P().get().readTicks === false; P().set({ readTicks: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    if (q('#set-blocked')) blockedRow(q('#set-blocked'));
    click('#set-mydata', e => P().downloadMyData(e.currentTarget));
    click('#set-crash', () => { S.set({ crashReports: S.get().crashReports === false }); draw(); });

    // Workspace
    if (window.TribeMode) { window.TribeMode.picker(q('#set-mode')); window.TribeMode.rolePicker(q('#set-rolemodes')); }
    const hm = q('#set-home'); if (hm) hm.onchange = () => P().set({ homePage: hm.value });
    { const ro = q('#set-reorder'); if (ro) ro.onclick = () => { window.TribeReorder.reset(); ro.textContent = 'Done'; saved(); setTimeout(() => { ro.textContent = 'Reset order'; }, 1500); }; }
    click('#set-login', () => { const v = !S.get().startup.launchAtLogin; S.set({ startup: { launchAtLogin: v } }); window.TribeHost.setAutostart(v); draw(); });
    if (q('#set-keys') && window.TribeShortcuts) window.TribeShortcuts.mount(q('#set-keys'), { capturing: v => { capturing = v; }, saved });
    const sc = q('#set-chat'); if (sc) window.TribeChatRich.mountSettings(sc);
    click('#set-spell', e => { const v = P().get().spellcheck === false; P().set({ spellcheck: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });

    // Projects & sync
    const ph = q('#set-projhome'); if (ph) ph.onchange = () => P().set({ projectHome: ph.value });
    const stg = q('#set-storage'); if (stg) window.TribeStorage.mount(stg);
    const f = q('#set-folder'); if (f) f.onchange = () => S.set({ folder: f.value.trim() });
    click('#set-browse', async () => { const p = await window.TribeHost.pickFolder(); if (p) { S.set({ folder: p }); draw(); toast('Restart TribeCode to host from the new folder.'); } });
    const gh = q('#set-github'); if (gh) window.TribeGitHub.mount(gh);
    for (const x of Object.values(EXTRA).flat()) { const el = box.querySelector(`[data-ext="${x.id}"]`); if (!el) continue; try { const out = x.render(el); if (typeof out === 'string') el.innerHTML = out; } catch (e) { console.warn('settings section', x.id, e); } }

    // Tribe & admin
    click('#set-invite', () => { close(); window.TribeFlow ? window.TribeFlow.instant() : window.TribeApp.openInvite(); });
    click('#set-roles', () => { close(); window.TribeRoles.open(); });
    click('#set-mod', () => window.TribeModeration.openSafety());
    click('#set-host', async e => { const b = e.currentTarget; b.disabled = true; await window.TribeApp.setHosting(b.getAttribute('aria-checked') !== 'true'); draw(); });
    click('#set-server-copy', () => { try { navigator.clipboard.writeText($('#set-server-url').textContent); toast('Copied'); } catch {} });
    const fsf = q('#set-fs'); if (fsf) {   // polish: the Freesound key goes to the server only (server/inspo.js); we learn just whether one is set
      const stl = q('#set-fs-st'), say = v => { if (stl) stl.textContent = v ? 'On: a key is saved.' : 'Off.'; };
      C().api('/inspo/freesound').then(r => say(r.configured), () => {});
      fsf.onsubmit = async e => { e.preventDefault(); const k = q('#set-fs-key'); try { const r = await C().api('/inspo/freesound', { method: 'PUT', body: { key: k.value } }); k.value = ''; say(r.configured); toast(r.configured ? 'Freesound is on for the inspiration board' : 'Freesound key removed'); saved(); } catch (err) { toast(err.message); } };
    }
    click('#set-backup', backup);
    click('#set-fresh', freshStart);

    // Accessibility
    click('#set-contrast', e => { const v = !P().get().contrast; P().set({ contrast: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    click('#set-hc', () => { const T = window.TribeThemes; S.set({ ...T.pick(S.get().theme === 'contrast' ? 'campfire' : 'contrast'), themeSystem: false }); window.TribeApp.applyTheme(); draw(); });
    click('#set-readable', e => { const v = !P().get().readable; P().set({ readable: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    box.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => { P().set({ focus: b.dataset.focus }); draw(); });
    box.querySelectorAll('[data-motion]').forEach(b => b.onclick = () => { P().set({ motion: b.dataset.motion }); draw(); });
    click('#set-captions', e => { const v = !P().get().captions; P().set({ captions: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });
    click('#set-sr', e => { const v = !P().get().announce; P().set({ announce: v }); e.currentTarget.setAttribute('aria-checked', String(v)); });

    // Storage & data
    const pk = q('#set-packs'); if (pk) window.TribePacks.mount(pk);   // feat/captures (app/ui/captures.js)
    click('#set-refresh', e => { const rf = e.currentTarget; rf.disabled = true; rf.textContent = 'Refreshing…'; (window.TribeSelfHeal && window.TribeSelfHeal.refresh ? window.TribeSelfHeal.refresh() : location.reload()); });
    click('#set-export-settings', () => P().exportSettings());
    click('#set-import-settings', () => q('#set-import-file').click());
    const imf = q('#set-import-file'); if (imf) imf.onchange = async () => { const fl = imf.files[0]; if (!fl) return; try { const n = P().importSettings(JSON.parse(await fl.text())); toast(`Imported ${n} setting${n === 1 ? '' : 's'}`); draw(); saved(); } catch (err) { toast(err.message || 'That file is not a TribeCode settings file'); } imf.value = ''; };
    click('#set-reset-settings', () => { if (!confirm('Reset every setting on this device to its default? You stay signed in.')) return; P().resetSettings(); draw(); saved(); });
    click('#set-copy', saveCopy);
    if (q('#set-usage')) P().usage().then(t => { const u = $('#set-usage'); if (u) u.textContent = t; });

    // About & help
    if (q('#set-version')) aboutRows();
    click('#set-check-update', checkUpdates);
    click('#set-bgupdate', () => { const v = !S.get().startup.autoUpdate; S.set({ startup: { autoUpdate: v } }); if (v && window.TribeUpdater) window.TribeUpdater.check(); draw(); });
    click('#set-tour', () => { close(); window.TribeFlintTour && window.TribeFlintTour.start(); });
    click('#set-demo', () => { close(); window.TribeOffline.toggle(); });   // feat/offline-demo
    click('#set-guide', () => { close(); window.TribeGuide.open(); });   // feat/vision-guide
    click('#set-keysheet', () => { close(); window.TribeHelp ? window.TribeHelp.shortcuts() : null; });
    click('#set-bug', () => { close(); window.TribeBugs ? window.TribeBugs.capture() : (window.TribeSelfHeal && window.TribeSelfHeal.report({ kind: 'user', message: 'Reported from Settings' })); });
    click('#set-feedback', () => { close(); window.TribeFeedback.open(); });
    lazy('notifications');   // search finds its rows too
  }
  // The Notifications tab asks the server for its prefs only when you open it.
  function lazy(id) { if (id === 'notifications') { const el = $('#set-nf'); if (el && !el.dataset.done) { el.dataset.done = '1'; notifTab(el); } } }   // loads once per draw

  // ---------- Notifications ----------
  const NT = { mention: ['Mentions', '@you and @everyone'], dm: ['Direct messages', ''], 'task-assigned': ['Tasks for you', 'Assigned to you, accepted or declined'], approval: ['Approvals', 'Something waits for your yes or no'], 'comment-reply': ['Comments', 'Replies to your comments'], release: ['Ships and releases', ''], huddle: ['Huddles', 'Someone starts a call'], reminder: ['Reminders', ''], proposal: ['Proposals', 'New proposals and votes'], 'bug-critical': ['Critical bugs', ''], 'meeting-notes': ['Meeting notes', 'Notes after a huddle'], repo: ['Repository', 'Pushes and merges'], 'visual-diff': ['Visual changes', 'Screenshots that changed'] };
  async function notifTab(el) {
    if (!on()) { el.innerHTML = sec('Notifications', row('Sound', sw('set-nf-sound', P().get().sound !== false, 'Notification sound'), 'A soft tone for new notifications.', { id: 'set-nf-sound-row' })) + '<p class="set-note">Join or start a tribe to choose what you hear about.</p>'; wireNfLocal(el); return; }
    let d; try { d = await C().api('/notify/prefs'); } catch (e) { el.innerHTML = `<p class="set-note">Couldn't load notification settings: ${esc(e.message)}</p>`; el.dataset.done = ''; return; }
    const p = d.prefs, pr = P().get(), types = (d.types || Object.keys(NT)).filter(t => NT[t]);
    const state = C().state(), chans = channelsList(state), projs = (state.projects || []);
    const lvl = (kind, k) => (p.mutes && p.mutes[kind] && p.mutes[kind][k]) || 'all';
    const muteSel = (kind, k, label) => `<select class="input set-select" data-mute-kind="${kind}" data-mute="${esc(k)}" aria-label="${esc(label)}"><option value="all" ${lvl(kind, k) === 'all' ? 'selected' : ''}>Everything</option><option value="mentions" ${lvl(kind, k) === 'mentions' ? 'selected' : ''}>Mentions only</option><option value="none" ${lvl(kind, k) === 'none' ? 'selected' : ''}>Nothing</option></select>`;
    const hours = [1, 2, 4, 8, 12, 24];
    el.innerHTML = sec('How you hear', `${row('Pop-ups in the app', sw('set-nf-toasts', pr.toasts !== false, 'Pop-ups in the app'), 'A short note at the bottom when something important arrives.', { keys: 'toast in-app banner' })}
        ${row('Sound', sw('set-nf-sound', pr.sound !== false, 'Notification sound'), 'A soft tone for new notifications. Quiet hours silence it.', { id: 'set-nf-sound-row', keys: 'sound audio chime ding' })}
        ${row('Desktop notifications', sw('set-nfc-desktop', p.channels.desktop, 'Desktop notifications'), 'From the desktop app when its window is hidden.', { keys: 'os native system' })}
        ${row('Phone push', `<span class="set-upd">${sw('set-nfc-webpush', p.channels.webpush, 'Phone push')}<button class="btn sm" id="set-nf-push">${d.webpushDevices ? `${d.webpushDevices} device${d.webpushDevices === 1 ? '' : 's'}` : 'Turn on here'}</button></span>`, 'To your phone or browser, even when TribeCode is closed.', { keys: 'push mobile web' })}
        ${row('Email', d.emailAvailable ? sw('set-nfc-email', p.channels.email, 'Email notifications') : '<span class="set-info">Off on this server</span>', d.emailAvailable ? 'To your account\'s email when you\'re away.' : 'The host turns email on (Tribe & admin › Sign-up and email), and your account needs a confirmed email.', { keys: 'mail smtp' })}
        ${row('When', `<select class="input set-select" id="set-nf-when" aria-label="When to notify"><option value="away" ${p.when.mode === 'away' ? 'selected' : ''}>Only when I'm away</option><option value="always" ${p.when.mode === 'always' ? 'selected' : ''}>Always</option></select>`, `Away means no TribeCode window in use for ${p.when.awayMinutes} minutes.`, { keys: 'away idle' })}`)
      + sec('What you hear about', types.map(t => row(NT[t][0], sw('set-nft-' + t, p.types[t] !== false, NT[t][0], t === 'approval'), NT[t][1] + (t === 'approval' ? (NT[t][1] ? '. ' : '') + 'Always on: they need you.' : ''), { id: 'set-nft-row-' + t, keys: 'notify ' + t })).join(''), { note: 'Off means no ping: it still lands in your inbox and the digest.' })
      + sec('Quiet hours', `${row('Quiet hours', sw('set-quiet', p.when.quiet.on, 'Quiet hours'), 'No pings, pop-ups or sounds. Everything waits in your inbox.', { id: 'set-quiet-row', keys: 'do not disturb dnd night sleep' })}
        ${row('From', `<span class="set-upd"><input class="input set-time" type="time" id="set-quiet-from" value="${esc(p.when.quiet.from)}" aria-label="Quiet from"><span class="faint">to</span><input class="input set-time" type="time" id="set-quiet-to" value="${esc(p.when.quiet.to)}" aria-label="Quiet until"></span>`, `Your time zone: ${esc(p.tz)}.`, { id: 'set-quiet-times' })}`)
      + sec('Digest', `${row('Digest', sw('set-digest', p.digest.on, 'Digest'), 'What you didn\'t get pinged about, gathered into one summary.', { id: 'set-digest-row', keys: 'summary batch' })}
        ${row('How often', `<select class="input set-select" id="set-digest-every" aria-label="Digest every">${hours.map(h => `<option value="${h}" ${p.digest.everyHours === h ? 'selected' : ''}>Every ${h} hour${h === 1 ? '' : 's'}</option>`).join('')}</select><select class="input set-select" id="set-digest-at" aria-label="Digest at a time"><option value="">Any time</option>${['07:00', '08:00', '09:00', '12:00', '17:00', '20:00'].map(t => `<option ${p.digest.at === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`, 'Pick a time for one a day.', { id: 'set-digest-when' })}`)
      + sec('Channels and projects', (chans.map(c => row('#' + esc(c.name), muteSel('channels', c.id, 'Notifications from #' + c.name), c.hint || '', { id: 'set-mute-ch-' + slug(c.id), keys: 'mute channel' })).join('')
        + projs.map(pj => row(esc(pj.name || pj.id), muteSel('projects', pj.id, 'Notifications from ' + (pj.name || pj.id)), 'The whole project', { id: 'set-mute-pj-' + slug(pj.id), keys: 'mute project' })).join('')) || '<p class="set-note">No channels yet.</p>', { note: 'Mute a busy channel, or only hear about mentions there.' })
      + sec('More', `${row('Test', '<button class="btn" id="set-nf-test">Send a test</button>', 'Checks your phone and desktop channels.', { keys: 'test' })}
        ${row('Advanced', '<button class="btn" id="set-nf-adv">ntfy and more…</button>', 'Your own ntfy topic, how long until you count as away.', { keys: 'ntfy advanced' })}`);
    wireNfLocal(el);
    const put = async body => { try { await C().api('/notify/prefs', { method: 'PUT', body }); P().notifyPrefs(true); saved(); } catch (e) { toast(e.message); } };
    const tg = (id, f) => { const b = el.querySelector('#' + id); if (b) b.onclick = () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); f(v); }; };
    for (const k of ['desktop', 'webpush', 'email']) tg('set-nfc-' + k, v => put({ channels: { [k]: v } }));
    types.forEach(t => tg('set-nft-' + t, v => put({ types: { [t]: v } })));
    tg('set-quiet', v => put({ when: { quiet: { on: v } } }));
    tg('set-digest', v => put({ digest: { on: v } }));
    const ch = (s, f) => { const x = el.querySelector(s); if (x) x.onchange = () => f(x.value); };
    ch('#set-nf-when', v => put({ when: { mode: v } }));
    ch('#set-quiet-from', v => put({ when: { quiet: { from: v } } })); ch('#set-quiet-to', v => put({ when: { quiet: { to: v } } }));
    ch('#set-digest-every', v => put({ digest: { everyHours: Number(v) } })); ch('#set-digest-at', v => put({ digest: { at: v } }));
    el.querySelectorAll('[data-mute]').forEach(s => s.onchange = () => put({ mutes: { [s.dataset.muteKind]: { [s.dataset.mute]: s.value } } }));
    const pb = el.querySelector('#set-nf-push'); if (pb) pb.onclick = async () => { try { await window.TribeNotify.enableWebPush(); toast('Push is on for this device'); } catch (e) { toast(e.message || 'Push is not available here'); } };
    const tb = el.querySelector('#set-nf-test'); if (tb) tb.onclick = async () => { try { const r = await C().api('/notify/test', { method: 'POST' }); toast(r.channels && r.channels.length ? `Sent via ${r.channels.join(', ')}` : 'Sent to your inbox. No phone or desktop channel answered.'); } catch (e) { toast(e.message); } };
    const ad = el.querySelector('#set-nf-adv'); if (ad) ad.onclick = () => window.TribeNotify.openSettings();
  }
  function wireNfLocal(el) {
    const tg = (id, k) => { const b = el.querySelector('#' + id); if (b) b.onclick = () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); P().set({ [k]: v }); saved(); if (k === 'sound' && v) P().ding(); }; };
    tg('set-nf-toasts', 'toasts'); tg('set-nf-sound', 'sound');
  }
  function channelsList(state) {
    const out = [], seen = new Set(), add = (id, name, hint) => { if (!id || seen.has(id)) return; seen.add(id); out.push({ id, name, hint }); };
    for (const pj of state.projects || []) if (pj.channel) add(pj.channel, pj.channel === 'general' ? 'general' : pj.channel, pj.name ? `${pj.name}'s chat` : '');
    add('general', 'general', 'The tribe\'s main room');
    for (const c of (state.channels || [])) add(c.id || c.name, c.name || c.id, c.topic || '');
    return out.slice(0, 40);
  }

  // ---------- rows that load from the server ----------
  async function devicesRow(el) {
    let list = []; try { list = (await C().api('/devices')).devices || []; } catch {}
    const when = t => { try { return t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'; } catch { return ''; } };
    el.innerHTML = `<ul class="set-list">${list.length ? list.map(d => `<li><span><b>${esc(d.current ? 'This device' : d.label || 'A device')}</b><small>linked ${esc(when(d.created))} · last used ${esc(when(d.lastUsed))}</small></span>${d.current ? '' : `<button class="btn sm" data-dev="${esc(d.id)}">End</button>`}</li>`).join('') : '<li><span><b>This device</b><small>No other device links.</small></span></li>'}</ul>
      <div class="set-acts"><button class="btn" id="set-signout-others">Sign out other devices</button></div>`;
    el.querySelectorAll('[data-dev]').forEach(b => b.onclick = async () => { b.disabled = true; try { await C().api('/devices/' + encodeURIComponent(b.dataset.dev), { method: 'DELETE' }); devicesRow(el); saved(); } catch (e) { toast(e.message); b.disabled = false; } });
    el.querySelector('#set-signout-others').onclick = async e => {
      if (!confirm('Sign out every other phone and computer? This device stays signed in.')) return;
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await C().api('/me/signout-others', { method: 'POST' });
        if (r.token) S.set({ server: { ...(S.get().server || {}), token: r.token } });
        if (window.TribeAccounts && window.TribeAccounts.signOutOthers) await window.TribeAccounts.signOutOthers().catch(() => {});
        toast('Every other device is signed out'); devicesRow(el); saved();
      } catch (err) { toast(err.message); b.disabled = false; }
    };
  }
  async function deleteRow(el) {
    if (role() === 'host') { el.innerHTML = '<span class="set-info">You\'re the host. Start fresh (Tribe &amp; admin › Danger zone) moves the whole tribe into a backup folder instead.</span>'; return; }
    let d = null; try { d = await C().api('/me/deletion'); } catch {}
    const due = d && d.deletion && d.deletion.due;
    el.innerHTML = due ? `<div class="set-warn" id="set-del-pending"><b>Your account is set to be deleted on ${esc(new Date(due).toLocaleString([], { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}.</b><button class="btn" id="set-del-undo">Keep my account</button></div>`
      : `<div class="set-del"><input class="input" id="set-del-in" placeholder="Type DELETE" aria-label="Type DELETE to confirm" autocomplete="off" spellcheck="false" data-nosave><button class="btn danger" id="set-del-go" disabled>Delete my account</button>${window.TribeModeration ? '<button class="linkish" id="set-del-device">Only clear this device…</button>' : ''}</div>`;
    const u = el.querySelector('#set-del-undo'); if (u) u.onclick = async () => { try { await C().api('/me/deletion', { method: 'DELETE' }); toast('Your account stays'); deleteRow(el); saved(); } catch (e) { toast(e.message); } };
    const inp = el.querySelector('#set-del-in'), go = el.querySelector('#set-del-go');
    if (inp) { inp.oninput = () => { go.disabled = inp.value.trim().toUpperCase() !== 'DELETE'; }; go.onclick = async () => { go.disabled = true; try { await C().api('/me/deletion', { method: 'POST', body: { confirm: 'DELETE' } }); toast('Your account will be deleted in 7 days. Undo any time before then.'); deleteRow(el); } catch (e) { toast(e.message); go.disabled = false; } }; }
    const dv = el.querySelector('#set-del-device'); if (dv) dv.onclick = () => window.TribeModeration.deleteAccount();
  }
  function consentRow(el) {
    const A = window.TribeAIConsent, l = A ? A.list() : [];
    el.innerHTML = l.length ? `<ul class="set-list">${l.map(x => `<li><span><b>${esc(x.label)}</b><small>allowed ${esc(x.at ? new Date(x.at).toLocaleDateString() : '')}</small></span><button class="btn sm" data-ai-revoke="${esc(x.provider)}">Revoke</button></li>`).join('')}</ul>`
      : '<span class="set-info">None yet. Local models (Ollama, Built in) never ask.</span>';
    el.querySelectorAll('[data-ai-revoke]').forEach(b => b.onclick = () => { A.revoke(b.dataset.aiRevoke); consentRow(el); saved(); });
  }
  async function blockedRow(el) {
    const M = window.TribeModeration; try { await M.refresh(); } catch {}
    const ids = M.blocked(), name = id => ((C().state().members || []).find(m => m.id === id) || {}).name || id;
    el.innerHTML = ids.length ? `<ul class="set-list">${ids.map(id => `<li><span><b>${esc(name(id))}</b></span><button class="btn sm" data-unblock="${esc(id)}">Unblock</button></li>`).join('')}</ul>` : '<span class="set-info">Nobody.</span>';
    el.querySelectorAll('[data-unblock]').forEach(b => b.onclick = async () => { b.disabled = true; try { await C().api('/moderation/block', { method: 'PUT', body: { id: b.dataset.unblock, on: false } }); await M.refresh(); blockedRow(el); saved(); } catch (e) { toast(e.message); b.disabled = false; } });
  }
  async function aboutRows() {
    const v = $('#set-version'), U = window.TribeUpdater;
    let ver = ''; try { const r = await fetch((C().base ? C().base() : '') + '/api/health', { cache: 'no-store' }); ver = (await r.json()).version || ''; } catch {}
    if (!ver && window.TribeSelfHeal) try { ver = window.TribeSelfHeal.state().page || ''; } catch {}
    if (v) v.textContent = ver ? 'v' + String(ver).replace(/^v/, '') : 'Unknown';
    updState();
    function updState() {
      const s = $('#set-upd-st'); if (!s) return; const p = U && U.pending && U.pending();
      if (p && p.ready) { s.innerHTML = `v${esc(p.version)} is ready. <button class="btn primary sm" id="set-restart">Restart to update</button>`; const r = $('#set-restart'); if (r) r.onclick = () => U.restartNow(); }
      else if (p && p.downloading) s.textContent = `Downloading v${p.version}…`;
      else if (p) s.textContent = `v${p.version} is available.`;
    }
    aboutRows.upd = updState;
  }
  async function checkUpdates(e) {
    const b = e.currentTarget, s = $('#set-upd-st'), U = window.TribeUpdater; b.disabled = true; if (s) s.textContent = 'Checking…';
    try {
      if (U && U.supported()) { await U.check(); const p = U.pending(); if (s) s.textContent = p ? '' : 'You\'re up to date.'; if (aboutRows.upd) aboutRows.upd(); }
      else { const r = window.TribeSelfHeal && window.TribeSelfHeal.versionCheck ? await window.TribeSelfHeal.versionCheck() : null; if (s) s.textContent = r && r.stale ? 'A newer version is on the server. Reload to get it.' : 'You\'re up to date.'; }
    } catch { if (s) s.textContent = 'Couldn\'t check right now.'; }
    b.disabled = false;
  }
  async function saveCopy(e) {
    const cp = e.currentTarget; cp.disabled = true; cp.textContent = 'Saving…';
    try {
      const r = await C().api('/cloud/copy'), E = window.TribeExport;
      const entries = Object.entries(r.files || {}).map(([k, v]) => [k, v]);
      entries.push(['README.txt', `A copy of your TribeCode tribe, saved ${r.at}.\nchat/ holds messages (one JSON per line), docs/ the docs, tasks/ the tasks.\nYour code lives in each project's GitHub repository.\n`]);
      const name = String((C().state().tribe || {}).name || 'tribe').replace(/[^\w -]+/g, '').trim() || 'tribe';
      const out = await E.save(E.zip(entries, 'application/zip'), `${name} copy ${r.at.slice(0, 10)}.zip`, { desktop: false });
      toast(out.path ? `Saved to ${out.path}` : 'Saved a copy');
    } catch (err) { toast(err.message || 'Could not save a copy'); }
    cp.disabled = false; cp.textContent = 'Save a copy';
  }
  async function freshStart(e) {
    const fr = e.currentTarget;
    const typed = prompt('This moves every account, guest, message, project and doc into a backup folder and starts an empty tribe. You will be the host of the new one.\n\nType START FRESH to continue.');
    if (typed !== 'START FRESH') { if (typed !== null) toast('Nothing changed. Type START FRESH exactly to continue.'); return; }
    fr.disabled = true; fr.textContent = 'Starting fresh…';
    try {
      const r = await C().api('/host/fresh-start', { method: 'POST', body: { confirm: 'START FRESH' } });
      try { sessionStorage.setItem('tribecode.fresh', r.backup || '1'); } catch {}
      const st = S.get(); S.set({ server: { ...(st.server || {}), token: null, member: null } });
      await new Promise(res => setTimeout(res, 1500));
      if (window.TribeApp && window.TribeApp.hostHere) await window.TribeApp.hostHere({ noStaleCheck: true });
      location.reload();
    } catch (err) { fr.disabled = false; fr.textContent = 'Start fresh…'; toast(err.message || 'Could not start fresh'); }
  }

  // Settings › Theme: swatch chips (canvas · surface · accent) and a "Match system" switch. Styles in themes.css.
  function themeRow(st) {
    const T = window.TribeThemes; if (!T) return '';
    const cur = T.resolve(st), sys = !!(st.themeSystem || st.theme === 'system');
    const chips = T.list.map(t => `<button class="th-chip ${t.id === cur ? 'on' : ''}" role="radio" aria-checked="${t.id === cur}" data-theme-id="${t.id}" title="${esc(t.name)}">`
      + `<span class="th-pv" aria-hidden="true" style="--p0:${t.sw[0]};--p1:${t.sw[1]};--p2:${t.sw[2]};--lb:${(t.lg || [])[0] || '#F8FAFC'};--lf:${(t.lg || [])[1] || '#F26B1D'}"><span class="th-rail"><span class="th-logo"><i></i><b></b><i></i></span><i class="th-dot"></i><i class="th-dot"></i></span><span class="th-side"><i class="on"></i><i></i><i></i></span><span class="th-main"><i></i><i class="s"></i><b></b></span></span><span class="th-name">${esc(t.name)}${t.id === cur ? '<em>✓</em>' : ''}</span></button>`).join('');
    return `<div class="set-row set-theme" id="set-theme-row" data-keys="dark light mode colors match system"><div class="set-l"><b>Theme</b><small>Every theme keeps Ember for actions.</small></div><div class="set-c"><div class="th-grid" role="radiogroup" aria-label="Theme">${chips}</div>
      <div class="th-sys"><span>Match system (light/dark)</span><button class="toggle set-toggle" role="switch" id="set-theme-sys" aria-label="Match system light or dark" aria-checked="${sys}"><span class="switch"></span></button></div></div></div>`;
  }
  const isHost = () => C().connected() && (C().state().me || {}).role === 'host';
  const canRoles = () => C().connected() && window.TribeRoles && (['host', 'admin'].includes((C().state().me || {}).role) || window.TribeRoles.can('roles.assign'));   // feat/roles
  // Your name and color live on the server too, so friends see the change (not only this device).
  async function syncMe(patch) {
    if (!C().connected()) return;
    try { await C().api('/me', { method: 'PATCH', body: patch }); } catch (e) { toast(e.message); }
  }
  async function backup(e) {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Packing…';
    try {
      const st = S.get(), res = await fetch(C().base() + '/api/backup', { headers: { Authorization: 'Bearer ' + st.server.token } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'tribe-backup.tar.gz';
      const url = URL.createObjectURL(await res.blob()), a = document.createElement('a');
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast(`Saved ${name}`);
    } catch (err) { toast(`Backup failed: ${err.message}`); }
    b.disabled = false; b.textContent = 'Download backup';
  }
  // open(tab?, settingId?): a tab id ('notifications') or a setting's id ('set-github'); both, or neither (the last tab).
  function open(t, id) {
    ensure();
    if (t && !tabOf(t) && !id) { id = t; t = null; }
    const was = modal().classList.contains('hidden'), explicit = !!(t || id);
    if (was && !/^#\/settings/.test(location.hash)) prevHash = location.hash || '';
    if (was) query = '';
    if (!t && id) t = PLACE[id] || null;
    if (!t) { try { t = (was ? localStorage.getItem(LS_TAB) : tab) || 'profile'; } catch { t = 'profile'; } }
    if (!tabOf(t)) t = 'profile';
    tab = t; inPane = !phone() || explicit || (!was && inPane);
    try { localStorage.setItem(LS_TAB, tab); } catch {}
    modal().classList.remove('hidden');
    draw(); if (was) probeBrain();
    hashFor(tab);
    if (id) {
      const find = (n = 0) => { const el = document.getElementById(id); if (!el) { if (n < 30) return setTimeout(() => find(n + 1), 100); return; } const pane = el.closest('.set-pane'); if (pane && pane.dataset.tab !== tab) select(pane.dataset.tab); jump(pane ? pane.dataset.tab : tab, id); };
      find();
    } else if (was && !phone()) { const s = $('#set-search'); if (s) s.focus({ preventScroll: true }); }
    return Promise.resolve();
  }
  // Another feature's settings, in a tab: TribeSettings.addSection('projects', { id: 'sync', title: 'GitHub sync', render(el) { … } })
  function addSection(t, o) {
    if (!tabOf(t) || !o || !o.id || typeof o.render !== 'function') throw new Error('addSection(tab, { id, title, render })');
    EXTRA[t] = (EXTRA[t] || []).filter(x => x.id !== o.id).concat([{ id: String(o.id).replace(/[^\w-]/g, ''), title: o.title || '', render: o.render }]);
    if (modal() && !modal().classList.contains('hidden')) draw();
  }
  // Deep links: #/settings, #/settings/<tab>, #/settings/<tab>/<setting id>
  function fromHash() {
    const m = /^#\/settings(?:\/([\w-]+))?(?:\/([\w-]+))?/.exec(location.hash); if (!m) return;
    const open_ = modal() && !modal().classList.contains('hidden');
    if (open_ && (m[1] || 'profile') === tab && !m[2]) return;
    if (!open_) prevHash = '';
    open(m[1] || null, m[2] || null);
  }
  addEventListener('hashchange', fromHash);
  if (/^#\/settings/.test(location.hash)) { const go = (n = 0) => { if (window.TribeApp && document.readyState !== 'loading') setTimeout(fromHash, 300); else if (n < 100) setTimeout(() => go(n + 1), 100); }; go(); }
  addEventListener('resize', () => { const b = $('#settings-body'); if (b && !phone() && !b.classList.contains('in-pane')) { inPane = true; b.classList.add('in-pane'); } });

  // "+ circle → Join with a link" and Settings both land here.
  function joinPrompt() {
    const body = $('#invite-body'); $('#invite-modal').classList.remove('hidden');
    body.innerHTML = `<h2>Join a tribe</h2><div class="field"><label for="join-link">Invite link</label><div class="folder"><input class="input" id="join-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false"><button class="btn primary" id="join-go">Join</button></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button></div>`;
    const go = () => window.TribeApp.joinLink($('#join-link').value);
    $('#join-go').onclick = go; $('#join-link').onkeydown = e => { if (e.key === 'Enter') go(); };
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#join-link').focus();
  }

  // ---------- first-launch banner: one line, dismissible ----------
  // Retired in v0.9.3: hosting shows as the "Hosting" pill top left (hostpill.js). Clear the first-run flag quietly.
  function banner() {
    const st = S.get(); if (st.firstRun && C().connected()) S.set({ firstRun: false }); return;
    if (!st.firstRun || $('#hi-banner') || !C().connected()) return;   // eslint-disable-line no-unreachable
    const me = C().state().me || {}, host = me.role === 'host', tribe = (C().state().tribe || {}).name || 'your tribe';
    const el = document.createElement('div'); el.className = 'hi-banner'; el.id = 'hi-banner';
    el.innerHTML = `<span>${host ? '<span class="emo" aria-hidden="true">🔥</span>' : '<span class="emo" aria-hidden="true">👋</span>'}Hi ${esc((st.name || '').split(' ')[0] || 'there')}, ${host ? "you're hosting." : `welcome to ${esc(tribe)}.`}</span>${host ? '<button class="linkish" id="hi-invite">Invite a friend →</button>' : ''}<span class="spacer"></span><button class="hi-x" id="hi-x" aria-label="Dismiss">✕</button>`;
    const main = $('#main'); main.insertBefore(el, main.firstChild);
    const done = () => { el.remove(); S.set({ firstRun: false }); };
    $('#hi-x').onclick = done;
    const iv = $('#hi-invite'); if (iv) iv.onclick = () => { done(); window.TribeFlow ? window.TribeFlow.instant() : window.TribeApp.openInvite(); };
  }
  C().on('hello', () => setTimeout(banner, 200));

  window.TribeSettings = { open, autoSetup, joinPrompt, close: () => modal() && close(), addSection, saved, tabs: () => visibleTabs().map(t => ({ id: t.id, label: t.label })), current: () => tab, isOpen: () => !!modal() && !modal().classList.contains('hidden') };
  window.TribeOnboarding = { open: () => open(), goTo: () => {}, autoSetup };
})();
