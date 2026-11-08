// The composer "+" (desktop pill and phone composer): one menu for everything you can add to a conversation.
//   Add:      Photo or file
//   Decide:   Propose to the tribe (title + pitch → a vote; if approved it goes to the Board with its checklist as tasks)
//             Quick poll
//   Do:       Task · Ask my Claude · Reminder · Note · Report a bug
// Desktop: a flat popover above the button. Phone: a bottom sheet. Public: window.TribePlus = { open(anchor), propose(prefill) }.
(() => {
  const C = window.TribeClient, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const ico = id => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => (C.state() || {}).me || {};
  const input = () => $('#chat-input');
  const draft = () => (input() ? input().value.trim() : '');
  const clearDraft = () => { const i = input(); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } };
  // The conversation the composer is in: #general (this project) or a DM.
  const chan = () => { const D = window.TribeDM, v = D && D.current(); return !v || v === 'general' ? 'general' : v; };   // feat/chat2: current() is already the channel (a DM or a created channel)
  const inDm = () => chan() !== 'general';
  const myAgent = () => (C.state().members || []).find(m => m.role === 'agent' && m.owner === me().id);
  const toB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });

  const ITEMS = () => [
    { group: 'Add' },
    { k: 'attach', icon: 'i-clip', t: 'Photo or file', s: 'Photos and files go in the chat, notes go to Files' },
    { k: 'gif', icon: 'i-gif', t: 'GIF', s: 'Search, your GIFs, or paste a link', hide: !window.TribeChatRich || me().role === 'spectator' },   // feat/chat2
    { group: 'Decide together' },
    { k: 'propose', icon: 'i-flag', t: 'Propose to the tribe', s: 'Everyone votes; approved ideas go to the Board', hide: me().role === 'spectator' },
    { k: 'poll', icon: 'i-vote', t: 'Quick poll', s: 'Ask everyone to pick', hide: !window.TribeVotes || inDm() },
    { group: 'Get it done' },
    { k: 'task', icon: 'i-check', t: 'Task', s: draft() ? `“${draft().slice(0, 40)}”` : 'Add it to the board' },
    { k: 'askagent', icon: 'i-robot', t: 'Ask an agent', s: 'The next connected agent picks it up, no AI of your own needed', hide: inDm() || me().role === 'spectator' || !window.TribeAskAgent },   // feat/any-llm
    myAgent() ? { k: 'claude', icon: 'i-sparkle', t: 'Ask my AI', s: 'Opens your private chat with it' }
      : { k: 'ai', icon: 'i-sparkle', t: 'Ask AI', s: draft() ? `“${draft().slice(0, 40)}”` : 'The tribe\'s AI answers here, no AI of your own needed', hide: inDm() || me().role === 'spectator' },
    { k: 'remind', icon: 'i-sun', t: 'Reminder or event', s: 'Like “playtest friday 7pm”', hide: !window.TribePlan },
    { k: 'note', icon: 'i-doc', t: 'Note', s: 'Into the living notes' },
    { k: 'bug', icon: 'i-bug', t: 'Report a bug', s: 'With the recent logs attached', hide: !window.TribeBugs },
  ].filter(x => !x.hide);

  let el = null, scrim = null, anchorBtn = null;
  function close() {
    if (el) el.remove(); if (scrim) scrim.remove(); el = scrim = null;
    if (anchorBtn) { anchorBtn.classList.remove('open'); anchorBtn.setAttribute('aria-expanded', 'false'); }
  }
  function frame(html, cls) {
    close();
    scrim = document.createElement('div'); scrim.className = 'pl-scrim' + (phone() ? ' on' : ''); scrim.onclick = close;
    el = document.createElement('div'); el.className = `pl-pop ${phone() ? 'sheet' : ''} ${cls || ''}`; el.setAttribute('role', 'dialog');
    el.innerHTML = html; document.body.append(scrim, el);
    return el;
  }
  function place(anchor) {
    if (phone() || !anchor) return;
    const r = anchor.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.right - el.offsetWidth))}px`;
    el.style.top = `${Math.max(8, r.top - el.offsetHeight - 8)}px`;
  }

  function open(anchor) {
    anchorBtn = anchor || null;
    const rows = ITEMS().map(x => x.group ? `<div class="pl-group">${esc(x.group)}</div>`
      : `<button class="pl-item" data-pl="${x.k}" role="menuitem"><span class="pl-ic">${ico(x.icon)}</span><span class="pl-t"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('');
    frame(`<div class="pl-menu" role="menu" aria-label="Add to the conversation">${rows}</div>`);
    if (anchor) { anchor.classList.add('open'); anchor.setAttribute('aria-expanded', 'true'); }
    place(anchor);
    el.querySelector('.pl-item').focus({ preventScroll: true });
    el.addEventListener('click', e => { const b = e.target.closest('[data-pl]'); if (b) run(b.dataset.pl); });
  }

  async function run(k) {
    const text = draft();
    if (k === 'propose') return propose({ title: text });
    close();
    if (k === 'attach') return pick();
    if (k === 'gif') return window.TribeChatRich.gifPicker(anchorBtn);   // feat/chat2
    if (k === 'poll') return window.TribeVotes.openComposer({ question: text.slice(0, 200), channel: 'general' });
    if (k === 'task') {
      const title = text || prompt('Task');
      if (!title) return;
      try { const { task } = await C.api('/tasks', { method: 'POST', body: { title: title.slice(0, 200) } }); if (text) clearDraft(); toast(`Task added: ${task.title}`); } catch (e) { toast(e.message); }
      return;
    }
    if (k === 'askagent') return window.TribeAskAgent.open({ text });   // feat/any-llm
    if (k === 'ai') {   // @ai (server/askai.js): a teammate's Claude, the local model, or the board
      const i = input(); if (i) { i.value = '@ai ' + text.replace(/^@ai\s*/i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); }   // they press send; the question shows in chat
      return;
    }
    if (k === 'claude') {
      const ag = myAgent();
      if (!ag) { const b = $('#cc-connect'); if (b) b.click(); return; }
      if (window.TribeDM) window.TribeDM.open(ag.id);
      return;
    }
    if (k === 'remind') {
      const t = text || prompt('What and when? (e.g. "playtest friday 7pm")'); if (!t) return;
      try { await window.TribePlan.quickAdd(window.TribePlan.parse(t)); if (text) clearDraft(); toast('Scheduled'); } catch (e) { toast(e.message); }
      return;
    }
    if (k === 'note') {
      const t = text || prompt('Note'); if (!t) return;
      try {
        if (window.TribeNotes && window.TribeNotes.add) await window.TribeNotes.add(t);
        else await C.api('/chat/general', { method: 'POST', body: { text: `@secretary note ${t}` } });
        if (text) clearDraft(); toast('Noted');
      } catch (e) { toast(e.message); }
      return;
    }
    if (k === 'bug') return window.TribeBugs.capture();
  }

  const TEXTY = /\.(md|markdown|txt|text|csv|json|ya?ml|js|ts|py|css|html?)$/i;
  function pick() {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true;
    i.onchange = async () => {
      const pics = [...(i.files || [])].filter(f => /^image\/(png|jpeg|gif|webp)$/.test(f.type) && f.size <= 6 * 1024 * 1024);   // feat/chat2: pictures go together as one grid
      if (pics.length && window.TribeChatRich) { await window.TribeChatRich.sendImages(pics, chan()); }
      for (const f of i.files || []) {
        if (pics.includes(f) && window.TribeChatRich) continue;
        try {
          if (/^image\/(png|jpeg|gif|webp)$/.test(f.type) && f.size <= 3 * 1024 * 1024) {
            await C.api(`/chat/${chan()}/image`, { method: 'POST', body: { data: await toB64(f), mime: f.type, text: draft() } }); clearDraft();
          } else if (TEXTY.test(f.name) && f.size < 2_000_000 && window.TribeDocs) {   // text stays editable: it becomes a doc
            await window.TribeDocs.importFiles([f]);
            await C.api(`/chat/${chan()}`, { method: 'POST', body: { text: `📎 Shared **${f.name}** in Files` } });
          } else if (f.size <= 8 * 1024 * 1024) {   // anything else (PDF, zip, big photo…) is kept as a file to download
            await C.api(`/chat/${chan()}/file`, { method: 'POST', body: { data: await toB64(f), name: f.name, mime: f.type, text: draft() } }); clearDraft();
          } else toast(`${f.name} is over 8 MB: put it in the repo instead`);
        } catch (e) { toast(e.message); }
      }
    };
    i.click();
  }

  // Propose to the tribe: a title, a pitch (a "- [ ]" checklist becomes tasks), and when voting closes.
  function propose(prefill = {}) {
    frame(`<form class="pl-form" id="pl-prop">
        <div class="pl-eye">Proposal to the tribe</div>
        <h3>What should we do?</h3>
        <input id="pl-title" maxlength="120" placeholder="Add a double jump to Pixel Quest" value="${esc(prefill.title || '')}" required>
        <textarea id="pl-body" rows="5" placeholder="Why it matters, and what it takes.&#10;- [ ] Checklist items become tasks if it passes">${esc(prefill.body || '')}</textarea>
        <label class="pl-row">Voting closes
          <select id="pl-dl"><option value="0">when decided</option><option value="60">in 1 hour</option><option value="1440" selected>in 24 hours</option><option value="4320">in 3 days</option></select></label>
        <p class="pl-hint">Everyone in this project votes. If it's approved it goes to the Board: a milestone, a decision record, and tasks from the checklist.</p>
        <div class="pl-foot"><button type="button" class="btn" data-x>Cancel</button><button class="btn primary" type="submit">Propose</button></div>
      </form>`, 'form');
    place(anchorBtn);
    const f = $('#pl-prop'); $('#pl-title').focus();
    f.querySelector('[data-x]').onclick = close;
    f.onsubmit = async e => {
      e.preventDefault();
      const title = $('#pl-title').value.trim(); if (!title) return;
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        await C.api('/chat/general/vote', { method: 'POST', body: { pitch: { title, body: $('#pl-body').value.trim() }, minutes: Number($('#pl-dl').value) || 0 } });
        if (draft() === title || draft() === (prefill.title || '')) clearDraft();
        close(); toast('Proposed. Everyone can vote in the chat.');
      } catch (err) { btn.disabled = false; toast(err.message); }
    };
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el) close(); });
  addEventListener('resize', () => { if (el && !phone()) place(anchorBtn); });
  window.TribePlus = { open, close, propose };
})();
