// Chat channels (feat/chat2): the project's channels (#general + created ones), the New channel dialog, a channel's
// menu (edit name / emoji / topic, background, archive) and per-channel chat backgrounds.
// Server: server/channels.js. The conversation switcher ("# general ▾") lives in dm.js and reads TribeChannels.list().
// Backgrounds are drawn on .chat-col as one dimmed layer behind the messages (flat SVG patterns, a palette tint or the
// tribe's own picture). Anyone can turn backgrounds off for themselves (Settings › Chat, or the Background dialog).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, S = window.TribeStore;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const OFF = 'tribecode.chatBgOff';
  const EMOJI = ['💬', '🎨', '🐛', '🚀', '🎮', '📣', '💡', '🎵', '🧪', '📚', '🔥', '🌙'];
  const PATTERN_LABEL = { stars: 'Pixel stars', dots: 'Dots', grid: 'Grid', campfire: 'Campfire' };
  const TINT = { ember: '#F26B1D', teal: '#38C6B1', indigo: '#6C7CFF', amber: '#FFB86B', green: '#3BD16F', rose: '#FF6F8E' };

  let list = [{ id: 'general', name: 'general', main: true, emoji: '', topic: '', bg: null }], canManage = false, project = null;
  const get = id => list.find(c => c.id === (id || 'general')) || null;
  const cur = () => (window.TribeDM ? window.TribeDM.current() : 'general');
  const token = () => (S.get().server && S.get().server.token) || '';
  const bgOff = () => { try { return localStorage.getItem(OFF) === '1'; } catch { return false; } };
  const setBgOff = on => { try { localStorage.setItem(OFF, on ? '1' : '0'); } catch {} applyBg(); };
  const changed = () => { document.dispatchEvent(new CustomEvent('tribe-channels', { detail: { list } })); applyBg(); };

  async function load() {
    if (!C.connected()) return;
    try {
      const r = await C.api('/channels');
      list = r.channels || list; canManage = !!r.canManage; project = C.project ? C.project() : null;
      if (window.TribeDM && window.TribeDM.syncChannels) window.TribeDM.syncChannels(list);
      changed();
    } catch {}
  }
  C.on('hello', load);
  C.on('project', () => { load(); });
  C.on('ws', m => {
    if (m.type !== 'channels' || !Array.isArray(m.channels)) return;
    list = m.channels;
    // the channel you are in was archived or removed: stay, it shows read-only; a renamed one redraws its title
    if (window.TribeDM && window.TribeDM.syncChannels) window.TribeDM.syncChannels(list);
    changed();
  });

  // ---------- backgrounds ----------
  function applyBg() {
    const col = $('#view-chat .chat-col'); if (!col) return;
    const ch = cur(), meta = ch.startsWith('dm-') ? null : get(ch), bg = meta && meta.bg;
    const want = !bg || bgOff() ? '' : bg.kind === 'image' && /^[a-z0-9-]+\.(png|jpg|webp)$/.test(bg.value) ? 'image' : bg.kind === 'pattern' && PATTERN_LABEL[bg.value] ? 'pattern-' + bg.value : bg.kind === 'tint' && TINT[bg.value] ? 'tint-' + bg.value : '';
    [...col.classList].filter(c => c.startsWith('cbg')).forEach(c => col.classList.remove(c));
    col.style.removeProperty('--cbg-img');
    if (!want) return;
    col.classList.add('cbg', 'cbg-' + want, 'cbg-on');   // cbg-on: the legibility rules in chat2.css (dimmed layer, solid message rows on hover)
    if (want === 'image') col.style.setProperty('--cbg-img', `url("${(u => (window.TribeMedia ? window.TribeMedia.url(u) : u))(`${C.base()}/api/channels/${encodeURIComponent(meta.id)}/bg/${encodeURIComponent(bg.value)}`)}")`);
  }

  // ---------- dialogs ----------
  function modal(html, label) {
    close();
    const d = document.createElement('div'); d.className = 'modal ch-modal'; d.id = 'ch-modal'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', label);
    d.innerHTML = `<div class="modal-card ch-card">${html}</div>`;
    d.addEventListener('mousedown', e => { if (e.target === d) close(); });
    document.body.appendChild(d);
    return d;
  }
  function close() { const m = $('#ch-modal'); if (m) m.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#ch-modal')) close(); });

  // New channel (id = null) or edit one: name, optional emoji, optional topic.
  function edit(id) {
    if (!canManage) return toast('Only the host and builders can change channels.');
    const c = id ? get(id) : null, isGen = !!(c && c.main);
    const d = modal(`<div class="eyebrow">${c ? 'Channel' : 'New channel'}</div><h2>${c ? (isGen ? '#general' : 'Edit #' + esc(c.name)) : 'Make a channel'}</h2>
      <p class="lead">${c ? 'Everyone in this project sees the change.' : 'A place for one topic. Everyone in this project can read and post.'}</p>
      ${isGen ? '' : `<label class="ch-l" for="ch-name">Name</label><div class="ch-name"><span>#</span><input class="input" id="ch-name" maxlength="40" placeholder="design" autocomplete="off" spellcheck="false" value="${esc(c ? c.name : '')}"></div>`}
      <label class="ch-l">Emoji <small>optional</small></label>
      <div class="ch-emo" role="radiogroup" aria-label="Emoji">${EMOJI.map(e => `<button type="button" role="radio" class="ch-e ${(c && c.emoji) === e ? 'on' : ''}" data-e="${e}" aria-checked="${(c && c.emoji) === e}">${e}</button>`).join('')}<input class="input ch-e-in" id="ch-emoji" maxlength="8" placeholder="or type one" value="${esc(c && c.emoji && !EMOJI.includes(c.emoji) ? c.emoji : '')}" aria-label="Your own emoji"></div>
      <label class="ch-l" for="ch-topic">Topic <small>optional</small></label><input class="input" id="ch-topic" maxlength="160" placeholder="What this channel is for" value="${esc(c ? c.topic || '' : '')}">
      <div class="modal-foot"><button class="btn" data-x>Cancel</button><button class="btn primary" id="ch-save">${c ? 'Save' : 'Create channel'}</button></div>`, c ? 'Edit channel' : 'New channel');
    let emoji = c ? c.emoji || '' : '';
    d.querySelectorAll('.ch-e').forEach(b => b.onclick = () => { emoji = emoji === b.dataset.e ? '' : b.dataset.e; d.querySelector('#ch-emoji').value = ''; d.querySelectorAll('.ch-e').forEach(x => { x.classList.toggle('on', x.dataset.e === emoji); x.setAttribute('aria-checked', String(x.dataset.e === emoji)); }); });
    d.querySelector('#ch-emoji').oninput = e => { if (e.target.value.trim()) { emoji = e.target.value.trim(); d.querySelectorAll('.ch-e').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); } };
    d.querySelector('[data-x]').onclick = close;
    const nm = d.querySelector('#ch-name');
    const save = async () => {
      const body = { emoji, topic: d.querySelector('#ch-topic').value.trim() };
      if (nm) { body.name = nm.value.trim(); if (!body.name) { nm.focus(); return toast('Give the channel a name.'); } }
      const btn = d.querySelector('#ch-save'); btn.disabled = true;
      try {
        const r = c ? await C.api('/channels/' + encodeURIComponent(c.id), { method: 'PATCH', body }) : await C.api('/channels', { method: 'POST', body });
        close();
        if (!c && r.channel) { if (!get(r.channel.id)) list = [...list, r.channel]; changed(); window.TribeDM && window.TribeDM.openChannel(r.channel.id); toast(`#${r.channel.name} is ready`); }
      } catch (e) { btn.disabled = false; toast(e.message); }
    };
    d.querySelector('#ch-save').onclick = save;
    d.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));
    setTimeout(() => (nm || d.querySelector('#ch-topic')).focus(), 0);
  }

  function background(id) {
    const c = get(id); if (!c) return;
    const bg = c.bg || { kind: 'none' }, isOn = (k, v) => bg.kind === k && (k === 'none' || bg.value === v);
    const chip = (k, v, label, cls) => `<button type="button" class="ch-bg ${cls} ${isOn(k, v) ? 'on' : ''}" data-k="${k}" data-v="${v || ''}" aria-pressed="${isOn(k, v)}" ${canManage ? '' : 'disabled'}><span class="ch-bg-sw" aria-hidden="true"></span><span>${esc(label)}</span></button>`;
    const d = modal(`<div class="eyebrow">Background</div><h2>${c.main ? '#general' : '#' + esc(c.name)}</h2>
      <p class="lead">${canManage ? 'Saved for everyone in this project. Messages stay easy to read.' : 'The host and builders pick the background.'}</p>
      <div class="ch-bgs">${chip('none', '', 'None', 'sw-none')}${Object.entries(PATTERN_LABEL).map(([v, l]) => chip('pattern', v, l, 'sw-p-' + v)).join('')}</div>
      <div class="ch-l">Tints</div><div class="ch-bgs ch-tints">${Object.keys(TINT).map(v => chip('tint', v, v[0].toUpperCase() + v.slice(1), 'sw-t-' + v)).join('')}</div>
      ${canManage ? `<div class="ch-l">Your picture</div><div class="ch-up"><button class="btn" id="ch-up">${bg.kind === 'image' ? 'Change picture' : 'Upload a picture'}</button><small>PNG, JPEG or WebP up to 2 MB. Shown dimmed.</small></div>` : ''}
      <div class="ch-me"><span>Show chat backgrounds on this device</span><button class="toggle set-toggle" role="switch" id="ch-bg-me" aria-label="Show chat backgrounds on this device" aria-checked="${!bgOff()}"><span class="switch"></span></button></div>
      <div class="modal-foot"><button class="btn" data-x>Done</button></div>`, 'Chat background');
    d.querySelector('[data-x]').onclick = close;
    d.querySelector('#ch-bg-me').onclick = e => { const on = bgOff(); setBgOff(!on); e.currentTarget.setAttribute('aria-checked', String(on)); };
    d.querySelectorAll('.ch-bg').forEach(b => b.onclick = async () => {
      try { await C.api('/channels/' + encodeURIComponent(c.id), { method: 'PATCH', body: { bg: b.dataset.k === 'none' ? { kind: 'none' } : { kind: b.dataset.k, value: b.dataset.v } } }); await load(); background(id); }
      catch (e) { toast(e.message); }
    });
    const up = d.querySelector('#ch-up');
    if (up) up.onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp';
      i.onchange = async () => {
        const f = i.files && i.files[0]; if (!f) return;
        if (f.size > 2 * 1024 * 1024) return toast('Backgrounds up to 2 MB.');
        const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(f); });
        try { await C.api('/channels/' + encodeURIComponent(c.id) + '/bg', { method: 'POST', body: { data, mime: f.type } }); await load(); background(id); } catch (e) { toast(e.message); }
      };
      i.click();
    };
  }

  async function archive(id, on) {
    const c = get(id); if (!c || c.main) return;
    try { await C.api('/channels/' + encodeURIComponent(id), { method: 'PATCH', body: { archived: on } }); toast(on ? `#${c.name} archived. It stays readable.` : `#${c.name} is back`); await load(); }
    catch (e) { toast(e.message); }
  }

  // A channel's menu: from the switcher row's "…" (desktop) or the phone sheet.
  function menu(id, anchor) {
    const c = get(id); if (!c) return;
    const old = $('#ch-menu'); if (old) old.remove();
    const m = document.createElement('div'); m.id = 'ch-menu'; m.className = 'dm-menu ch-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="menu-label">${c.main ? '#general' : '#' + esc(c.name)}</div>
      ${canManage ? `<button role="menuitem" data-a="edit">${c.main ? 'Emoji and topic…' : 'Rename, emoji, topic…'}</button>` : ''}
      <button role="menuitem" data-a="bg">Background…</button>
      ${canManage && !c.main ? `<button role="menuitem" data-a="arch">${c.archived ? 'Unarchive' : 'Archive channel'}</button>` : ''}`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4)) + 'px';
    m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return; e.stopPropagation(); m.remove();
      const dm = $('#dm-menu'); if (dm) dm.remove();
      if (b.dataset.a === 'edit') edit(id);
      if (b.dataset.a === 'bg') background(id);
      if (b.dataset.a === 'arch') archive(id, !c.archived);
    });
    const f = m.querySelector('button'); if (f) f.focus();
  }
  document.addEventListener('click', e => { const m = $('#ch-menu'); if (m && !(e.target.closest && e.target.closest('#ch-menu'))) m.remove(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('#ch-menu'); if (m) m.remove(); } });

  window.TribeChannels = {
    list: () => list, get, load, canManage: () => canManage, create: () => edit(null), edit, background, archive, menu, applyBg, bgOff, setBgOff,
    label: id => { const c = get(id); return c ? '#' + c.name : '#general'; },
    emoji: id => { const c = get(id); return (c && c.emoji) || '💬'; },
  };
})();
