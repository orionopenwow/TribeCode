// Ask an agent (feat/any-llm): friends without an AI of their own can still build. They send a task or a question to
// the tribe's agents; it is queued (an open hand-off with ask: true, server/coord.js POST /api/coord/asks) for whichever
// connected agent takes it next (MCP take_handoff), and the answer lands in chat. Opened from the composer "+" menu,
// a task card's robot button, and listed in Requests.
//   window.TribeAskAgent = { open({ text, task }), mountRequests(el), send({ text, detail, src }), openMine() }
(function () {
  'use strict';
  const C = window.TribeClient, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const agentsOn = () => (C.state().members || []).filter(m => m.role === 'agent' && m.online);

  // ---------- Chat is for people: instructions for an AI go privately to your own agent ----------
  // send({ text, detail, src }): `text` is what the person said, `detail` the instructions only the agent needs (which
  // tools to use, where). It lands in the private chat with your agent (POST /api/ask/mine), never in a channel. With no
  // agent of your own it waits for the tribe's agents. A small "Sent to your Cursor" pill opens your requests and replies.
  const T = x => x;
  const meId = () => ((C.state && C.state().me) || {}).id;
  const mine = () => ((C.state && C.state().members) || []).filter(m => m.role === 'agent' && m.owner === meId());
  const short = n => { const s = String(n || ''); const a = s.match(/^.+?['’]s\s+(.+)$/), b = s.match(/^(.+?)\s+·\s+/); return (a ? a[1] : b ? b[1] : s) || 'agent'; };
  const icon = (n, z = 16) => window.TribeIcons ? window.TribeIcons.svg(n, z) : '';
  const kindOf = a => String((a && a.kind) || '').replace(/-.*$/, '') || ((/(cursor|codex|gemini|chatgpt|claude|windsurf|cline|zed)/i.exec((a && a.name) || '') || [''])[0]).toLowerCase();
  const kindIcon = (a, z = 16) => window.TribeIcons ? window.TribeIcons.agent(kindOf(a), z) : '';
  let last = null, unread = 0, pillTimer = 0;
  async function send({ text = '', detail = '', src = '', to = '' } = {}) {
    const say = String(text).trim(); if (!say) return { ok: false, note: T('Say what you need first.') };
    let r;
    try { r = await C.api('/ask/mine', { method: 'POST', body: { text: say, detail, src, ...(to ? { to } : {}) } }); }
    catch (e) { return { ok: false, note: T('That needs an AI agent, and none could be reached from here.'), error: e.message }; }
    last = r;
    if (r.sent) {
      const n = short(r.agent.name);
      pill(`Sent to your ${n}`);
      return { ok: true, sent: true, agent: r.agent, note: r.agent.online ? `Sent to your ${n}. Only you see this; its replies show under your requests.` : `Sent to your ${n}. It isn't connected right now, so it picks this up when it is.` };
    }
    pill(T('Waiting for an AI agent'));
    return { ok: true, sent: false, queued: true, note: T('You have no AI agent of your own here yet, so this waits for the tribe\'s agents. Invite your agent and requests go straight to it.') };
  }
  function pill(label) {
    let el = $('#aa-pill');
    if (!el) {
      el = document.createElement('div'); el.id = 'aa-pill'; el.className = 'aa-pill';
      el.innerHTML = '<button type="button" class="aa-pill-b" id="aa-pill-open"></button><button type="button" class="aa-pill-x" id="aa-pill-x" aria-label="Hide"></button>';
      document.body.appendChild(el);
      el.querySelector('#aa-pill-open').onclick = () => { hidePill(); openMine(); };
      el.querySelector('#aa-pill-x').onclick = hidePill;
      el.querySelector('#aa-pill-x').innerHTML = icon('x', 14);
    }
    el.querySelector('#aa-pill-open').innerHTML = `${icon(unread ? 'chat' : 'check', 15)}<span>${esc(label)}</span><small>${esc(T('See requests'))}</small>`;
    el.classList.toggle('has-reply', unread > 0); el.classList.add('on');
    clearTimeout(pillTimer); if (!unread) pillTimer = setTimeout(hidePill, 14000);
  }
  function hidePill() { const el = $('#aa-pill'); if (el) el.classList.remove('on'); clearTimeout(pillTimer); }
  // a reply from your own agent in your private chat with it: the pill says so (the panel shows it)
  if (C.on) C.on('chat', ({ channel, message }) => {
    if (!message || !String(channel || '').startsWith('dm-')) return;
    const ag = mine().find(a => a.id === message.by); if (!ag) return;
    if ($('#aa-mine')) return renderMine();
    if (!last) return;   // only after you asked something this session
    unread++; pill(`Your ${short(ag.name)} replied`);
  });
  const timeOf = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  async function renderMine() {
    const box = $('#aa-mine'); if (!box) return;
    let d = { agents: [], requests: [] }; try { d = await C.api('/ask/mine'); } catch {}
    const ag = d.agents.find(a => a.online) || d.agents[0];
    const head = $('#aa-mine-h'); if (head) head.textContent = ag ? `Your requests to your ${short(ag.name)}` : T('Your requests');
    const who = $('#aa-mine-who');
    if (who) who.innerHTML = ag ? `<span class="aa-ag">${kindIcon(ag, 18)}<b>${esc(ag.name)}</b><i class="aa-dot ${ag.online ? 'on' : ''}"></i><span>${ag.online ? T('connected') : T('not connected right now')}</span></span>`
      : `<span class="aa-ag">${icon('plug', 18)}<span>${esc(T('No AI agent of your own here yet.'))}</span></span><button type="button" class="btn sm" id="aa-invite">${esc(T('Invite your agent'))}</button>`;
    const inv = $('#aa-invite'); if (inv) inv.onclick = () => { $('#invite-modal').classList.add('hidden'); if (window.TribeInvite && window.TribeInvite.open) window.TribeInvite.open({ who: 'agent' }); };
    box.innerHTML = d.requests.length ? d.requests.map(r => `<div class="aa-req" data-req="${esc(r.id)}"><p class="aa-req-t">${esc(r.text)}</p><span class="aa-req-m">${esc(timeOf(r.at))} · ${r.replies.length ? esc(T('answered')) : esc(T('waiting'))}</span>
      ${r.replies.map(x => `<div class="aa-rep">${kindIcon(ag, 14)}<p>${esc(x.text)}</p></div>`).join('')}</div>`).join('')
      : `<p class="aa-none">${esc(T('Nothing yet. What you ask your agent from Design, the Preview or here shows up in this list, with its replies.'))}</p>`;
    const dm = $('#aa-open-dm'); if (dm) { dm.hidden = !ag; dm.onclick = () => { $('#invite-modal').classList.add('hidden'); if (window.TribeDM && window.TribeDM.open) window.TribeDM.open(ag.id); }; }
    unread = 0;
  }
  // The private panel: your requests to your own agent and its replies. Only you see it.
  function openMine({ text = '' } = {}) {
    const body = $('#invite-body'); if (!body) return;
    $('#invite-modal').classList.remove('hidden');
    body.innerHTML = `<div class="aa-card aa-card--mine"><span class="eyebrow">${esc(T('Private · only you see this'))}</span><h2 id="aa-mine-h">${esc(T('Your requests'))}</h2>
      <div class="aa-who" id="aa-mine-who"></div>
      <div class="aa-list" id="aa-mine" aria-live="polite"></div>
      <textarea id="aa-text" maxlength="2000" rows="2" placeholder="${esc(T('Ask your agent something'))}">${esc(text)}</textarea>
      <div class="modal-foot"><button type="button" class="btn" id="aa-open-dm" hidden>${esc(T('Open the conversation'))}</button><span style="flex:1"></span><button class="btn" data-close>${esc(T('Close'))}</button><button class="btn primary" id="aa-send">${esc(T('Send privately'))}</button></div></div>`;
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#aa-send').onclick = async () => {
      const ta = $('#aa-text'), t = ta.value.trim(); if (!t) return ta.focus();
      $('#aa-send').disabled = true;
      const r = await send({ text: t, src: 'panel' }); hidePill();
      $('#aa-send').disabled = false;
      if (!r.ok) return toast(r.note);
      ta.value = ''; if (!r.sent) toast(r.note); renderMine();
    };
    renderMine();
  }

  function open({ text = '', task = null } = {}) {
    if (!task && mine().length) return openMine({ text });   // you have an agent of your own: ask it, privately
    const body = $('#invite-body'); if (!body) return;
    $('#invite-modal').classList.remove('hidden');
    const on = agentsOn();
    body.innerHTML = `<div class="aa-card"><span class="eyebrow">No AI of your own needed</span><h2>Ask an agent</h2>
      <p class="lead">${task ? `Ask the tribe's agents to do <b>${esc(task.title)}</b>.` : 'Say what you need. The next agent that connects takes it, does it, and answers in chat.'}</p>
      <textarea id="aa-text" maxlength="4000" placeholder="${task ? 'Anything they should know? (optional)' : 'Like: add a pause menu with resume and quit'}">${esc(text)}</textarea>
      <p class="aa-note">${on.length ? `${on.length === 1 ? esc(on[0].name) + ' is' : on.length + ' agents are'} connected right now.` : 'No agent is connected right now: it waits in Requests until one is.'} You can also ask Flint, the built-in helper.</p>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="aa-send">Ask the agents</button></div></div>`;
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    const ta = $('#aa-text'); ta.focus();
    $('#aa-send').onclick = async () => {
      const t = ta.value.trim() || (task ? `Please do this task: ${task.title}` : '');
      if (!t) { ta.focus(); return; }
      $('#aa-send').disabled = true;
      try {
        const r = await C.api('/coord/asks', { method: 'POST', body: { text: t, ...(task ? { task: task.id } : {}) } });
        $('#invite-modal').classList.add('hidden');
        const ci = $('#chat-input'); if (ci && text && ci.value.trim() === text.trim()) { ci.value = ''; ci.dispatchEvent(new Event('input', { bubbles: true })); }
        toast(`Asked the agents: ${r.ask.title}`);
      } catch (e) { toast(e.message); $('#aa-send').disabled = false; }
    };
  }

  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(iso).toLocaleDateString(); };
  async function mountRequests(el) {
    if (!el) return;
    let asks = []; try { asks = (await C.api('/coord/asks')).asks || []; } catch { return; }
    const sec = document.createElement('section'); sec.className = 'card pj-asks'; sec.id = 'pj-asks';
    const label = { open: 'waiting', taken: 'taken', done: 'done' };
    sec.innerHTML = `<h3>Asked of agents</h3>${asks.length ? asks.slice(0, 12).map(h => `<div class="pj-req-row" data-ask="${esc(h.id)}"><div><b>${esc(h.title)}</b><div class="faint">${esc(h.fromName)}${h.takenByName ? ' · taken by ' + esc(h.takenByName) : ''} · ${ago(h.created)}</div></div><span class="pj-chip ${h.status === 'open' ? 'hot' : ''}">${label[h.status] || esc(h.status)}</span></div>`).join('')
      : '<div class="pj-none">Nothing asked yet.</div>'}<div class="pj-actions" style="margin-top:10px"><button class="btn" id="pj-ask-new">Ask an agent</button></div>`;
    const old = el.querySelector('#pj-asks'); if (old) old.remove();
    el.prepend(sec);
    sec.querySelector('#pj-ask-new').onclick = () => open();
  }

  window.TribeAskAgent = { open, mountRequests, send, openMine, mine, short };
})();
