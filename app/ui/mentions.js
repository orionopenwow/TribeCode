// @ in the chat box (v0.20): a small picker for people, agents and @ai. Picking an agent ("@maya's-claude",
// "@my-claude") gives it a public command: it answers, and posts what it makes, in this channel for everyone
// (server/askai.js command). The right panel stays the private way to talk to your own agent.
(function () {
  const C = () => window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = n => String(n || '').toLowerCase().replace(/\s+/g, '-');
  const first = n => String(n || '').split(/\s+/)[0];
  let pop = null, items = [], sel = 0, input = null, start = -1;

  function candidates(q) {
    const st = C() && C().state(); if (!st || !st.me) return [];
    const me = st.me, ms = st.members || [], out = [];
    const agents = ms.filter(m => m.role === 'agent' && m.owner);
    const mine = agents.find(a => a.owner === me.id);
    if (mine) out.push({ tok: 'my-claude', t: 'My Claude', s: 'Public: answers here for everyone', kind: 'agent', on: !!mine.online });
    for (const a of agents.filter(a => a.owner !== me.id)) {
      const o = ms.find(m => m.id === a.owner); if (!o) continue;
      out.push({ tok: `${slug(first(o.name))}s-claude`, t: `${first(o.name)}'s Claude`, s: 'Public command, their rules apply', kind: 'agent', on: !!a.online });
    }
    out.push({ tok: 'ai', t: 'Tribe AI', s: 'Whichever AI is free right now', kind: 'ai', on: true });
    for (const m of ms.filter(m => m.role !== 'agent' && m.id !== me.id)) out.push({ tok: slug(first(m.name)), t: m.name, s: 'Mention', kind: 'person', on: !!m.online });
    const lq = q.toLowerCase();
    return out.filter(x => !lq || x.tok.includes(lq) || x.t.toLowerCase().includes(lq)).slice(0, 8);
  }
  function close() { if (pop) pop.remove(); pop = null; items = []; start = -1; }
  function draw() {
    if (!items.length) return close();
    if (!pop) { pop = document.createElement('div'); pop.className = 'mn-pop'; pop.setAttribute('role', 'listbox'); pop.id = 'mention-pop'; document.body.appendChild(pop); }
    pop.innerHTML = items.map((x, i) => `<button type="button" role="option" class="mn-opt${i === sel ? ' on' : ''}" aria-selected="${i === sel}" data-i="${i}">
      <span class="mn-ic" aria-hidden="true">${x.kind === 'agent' ? '🤖' : x.kind === 'ai' ? '✨' : '👤'}</span><span class="mn-t"><b>@${esc(x.tok)}</b><small>${esc(x.t)} · ${esc(x.s)}${x.kind !== 'ai' && !x.on ? ' · offline' : ''}</small></span></button>`).join('');
    const r = input.getBoundingClientRect();
    pop.style.left = Math.max(8, r.left) + 'px'; pop.style.width = Math.min(360, r.width) + 'px';
    pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    pop.querySelectorAll('[data-i]').forEach(b => b.onmousedown = e => { e.preventDefault(); pick(+b.dataset.i); });
  }
  function pick(i) {
    const x = items[i]; if (!x || !input) return;
    const v = input.value, caret = input.selectionStart;
    input.value = v.slice(0, start) + '@' + x.tok + ' ' + v.slice(caret);
    const at = start + x.tok.length + 2; input.setSelectionRange(at, at); close(); input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function onInput(e) {
    input = e.target; const v = input.value, caret = input.selectionStart || 0;
    const m = v.slice(0, caret).match(/(^|\s)@([^\s@]{0,30})$/);
    if (!m) return close();
    start = caret - m[2].length - 1; items = candidates(m[2]); sel = 0; draw();
  }
  function onKey(e) {
    if (!pop) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  function wire(el) { if (!el || el.dataset.mentions) return; el.dataset.mentions = '1'; el.addEventListener('input', onInput); el.addEventListener('keydown', onKey, true); el.addEventListener('blur', () => setTimeout(close, 120)); }
  function boot() { wire(document.getElementById('chat-input')); new MutationObserver(() => wire(document.getElementById('chat-input'))).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // Settings › Agents in chat (host and admins)
  async function settingsRow(el) {
    if (!el) return;
    let p; try { p = await C().api('/ask/public'); } catch { el.textContent = ''; return; }
    if (!p.canEdit) { el.innerHTML = `<span class="faint">${p.on ? 'On' : 'Off'}${p.on ? ` · ${p.who === 'admins' ? 'admins' : p.who === 'builders' ? 'builders' : 'members'} can command agents` : ''}</span>`; return; }
    el.innerHTML = `<div class="pa-ctl">
      <label class="pa-line"><input type="checkbox" id="pa-on" ${p.on ? 'checked' : ''}> Agents take @commands in public chat</label>
      <label class="pa-line">Who can command <select class="input set-select" id="pa-who"><option value="members">Everyone but spectators</option><option value="builders">Builders and up (no guests)</option><option value="admins">Admins only</option></select></label>
      <label class="pa-line">Channels <input class="input" id="pa-ch" placeholder="every channel" value="${esc((p.channels || []).join(', '))}"></label>
      <label class="pa-line"><input type="checkbox" id="pa-done" ${p.postDone ? 'checked' : ''}> Post what agents make and finish in the channel</label>
      <label class="pa-line">Limit per person per hour <input class="input" id="pa-rate" type="number" min="1" max="200" value="${p.perHour}" style="width:80px"></label></div>`;
    el.querySelector('#pa-who').value = p.who;
    const save = async () => {
      const body = { on: el.querySelector('#pa-on').checked, who: el.querySelector('#pa-who').value, channels: el.querySelector('#pa-ch').value.split(',').map(s => s.trim()).filter(Boolean), postDone: el.querySelector('#pa-done').checked, perHour: +el.querySelector('#pa-rate').value };
      try { await C().api('/ask/public', { method: 'PUT', body }); if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast('Saved'); } catch (e) { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(e.message); }
    };
    el.querySelectorAll('input, select').forEach(x => x.onchange = save);
  }
  window.TribeMentions = { settingsRow, candidates, close };
})();
