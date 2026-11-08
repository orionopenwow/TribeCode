// Ask an agent (feat/any-llm): friends without an AI of their own can still build. They send a task or a question to
// the tribe's agents; it is queued (an open hand-off with ask: true, server/coord.js POST /api/coord/asks) for whichever
// connected agent takes it next (MCP take_handoff), and the answer lands in chat. Opened from the composer "+" menu,
// a task card's robot button, and listed in Requests.
//   window.TribeAskAgent = { open({ text, task }), mountRequests(el) }
(function () {
  'use strict';
  const C = window.TribeClient, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const agentsOn = () => (C.state().members || []).filter(m => m.role === 'agent' && m.online);

  function open({ text = '', task = null } = {}) {
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

  window.TribeAskAgent = { open, mountRequests };
})();
