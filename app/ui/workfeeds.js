// Work Phase 2 (feat/build-feeds): other tribes' gig feeds in Gigs › Public. The host fetches each followed tribe's
// signed feed carefully (server/workfetch.js) and keeps it on disk; this file shows those gigs with the tribe named,
// lets a person ask about one ("Request"), and gives hosts the Feeds sheet: publish this tribe's feed openly or keep
// it members-only, follow a tribe by address + key fingerprint, pause, block, remove, fetch now, hide a gig.
// app/ui/talent.js draws the page and calls in here.
//   window.TribeWorkFeeds = { load(), gigs(), canManage(), bar(), card(g, parts), manage(), request(ref), hide(ref) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const UI = () => (window.TribeTalent && window.TribeTalent._ui) || {};
  const ago = t => { const s = Math.max(0, (Date.now() - Date.parse(t)) / 1000); if (!isFinite(s)) return 'never'; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
  const copy = async (text, said) => { try { await navigator.clipboard.writeText(text); toast(said || 'Copied'); } catch { toast('Select the text and copy it.'); } };
  let st = { gigs: [], canManage: false };

  async function load() { try { st = await C.api('/work/imported'); } catch { st = { gigs: [], canManage: false }; } return st; }
  const gigs = () => st.gigs || [];
  const refOf = g => `${g.source}:${g.id}`;
  const find = ref => gigs().find(g => refOf(g) === ref);

  // the line above the Public list: what is shown, and the host's way in
  function bar(boardRepo) {
    const tribes = [...new Set(gigs().map(g => g.tribe))];
    const from = tribes.length ? `From ${tribes.length === 1 ? esc(tribes[0]) : `${tribes.length} tribes you follow`}${boardRepo ? ' and the community board' : ''}.` : boardRepo ? `From the community board (${esc(boardRepo)}).` : '';
    return `<div class="wf-bar"><p class="tl-fine">${from} Read-only: reach posters through the contact they chose, or send a request.</p>${st.canManage ? '<button type="button" class="btn sm" data-wf-manage="1" id="wf-manage">Feeds</button>' : ''}</div>`;
  }
  // a gig from another tribe: the tribe is named, with its key fingerprint, and the one action is Request
  function card(g, parts) {
    return `<article class="tl-gig wf-gig" data-wf-gig="${esc(refOf(g))}" style="--seat:${parts.seatColor || 'var(--edge)'}"><div class="tl-gig-top"><span class="eyebrow">${esc(g.kind)}</span><span class="wf-from" title="Signed by key ${esc(g.from)}">${esc(g.tribe)}</span></div><h3>${esc(g.title)}</h3>${g.description ? `<p class="tl-desc">${esc(g.description)}</p>` : ''}<div class="tl-meta">${parts.meta || ''}</div><div class="tl-foot"><small>${esc(g.posted || '')}</small><span class="wf-acts">${st.canManage ? `<button type="button" class="btn sm ghost" data-wf-hide="${esc(refOf(g))}" title="Hide this gig for your tribe">Hide</button>` : ''}<button type="button" class="btn sm tonal" data-wf-req="${esc(refOf(g))}">Request</button></span></div></article>`;
  }

  // ---------- Request: what crosses tribes is said plainly ----------
  function request(ref) {
    const g = find(ref), U = UI(); if (!g || !U.sheet) return;
    U.sheet(g.title, `Request · ${g.tribe}`, `<form class="tl-form" id="wf-rf">
      ${g.description ? `<p class="tl-read">${esc(g.description)}</p>` : ''}
      <label class="tl-lbl">A note <small class="faint">optional</small><textarea class="input" id="wf-r-note" rows="3" maxlength="500" placeholder="What you'd bring, when you're free"></textarea></label>
      <label class="tl-lbl">How they can reach you<input class="input" id="wf-r-contact" maxlength="120" required placeholder="An email, a Discord name, a link"></label>
      <p class="tl-fine" id="wf-r-honest">${esc(g.tribe)} is another tribe on its own server. Your note and contact go into this tribe's signed gig feed; they see it only if they follow this tribe's feed. You also get a message to copy and send through their contact${g.contact ? ` (${esc(g.contact)})` : ''}. Nothing else about you leaves this tribe.</p>
      <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Cancel</button><button class="btn primary" type="submit" id="wf-r-go">Send request</button></div></form>`, el => {
      el.querySelector('[data-x2]').onclick = U.closeSheet;
      el.querySelector('#wf-rf').onsubmit = async e => {
        e.preventDefault();
        try {
          const r = await C.api('/work/requests', { method: 'POST', body: { from: g.source, gig: g.id, note: el.querySelector('#wf-r-note').value, contact: el.querySelector('#wf-r-contact').value } });
          el.querySelector('.tl-sh-body').innerHTML = `<div class="tl-form" id="wf-sent"><p class="tl-read"><b>Request saved.</b> ${esc(r.note)}</p>
            <label class="tl-lbl">Message to send${r.gigContact ? ` to ${esc(r.gigContact)}` : ''}<textarea class="input" id="wf-r-msg" rows="7" readonly>${esc(r.message)}</textarea></label>
            <div class="tl-sh-foot"><button type="button" class="btn ghost" data-x2="1">Done</button><button type="button" class="btn primary" id="wf-r-copy">Copy message</button></div></div>`;
          el.querySelector('[data-x2]').onclick = U.closeSheet;
          el.querySelector('#wf-r-copy').onclick = () => copy(r.message, 'Message copied');
        } catch (er) { toast(er.message); }
      };
    });
  }
  async function hide(ref) {
    const g = find(ref); if (!g) return;
    try { await C.api('/work/hide', { method: 'POST', body: { key: g.source, gig: g.id } }); toast('Hidden for your tribe'); await load(); window.TribeTalent && window.TribeTalent.redraw && window.TribeTalent.redraw(); } catch (e) { toast(e.message); }
  }

  // ---------- Feeds (hosts and admins) ----------
  async function manage() {
    const U = UI(); if (!U.sheet) return;
    let a, rq; try { [a, rq] = await Promise.all([C.api('/work/admin'), C.api('/work/requests').catch(() => ({ received: [] }))]); } catch (e) { return toast(e.message); }
    const subRow = s => { const state = s.blocked ? 'Blocked' : s.paused ? 'Paused' : s.error ? 'Problem' : s.url ? 'Following' : 'Key only'; const tone = s.blocked || s.error ? 'bad' : s.paused ? 'warn' : 'ok';
      return `<li class="wf-sub" data-wf-sub="${esc(s.id)}"><div class="wf-sub-t"><b>${esc(s.name)}</b><span class="wf-state ${tone}">${state}</span></div>
        <small class="wf-fp">${esc(s.fingerprint)}${s.url ? ` · ${esc(s.url)}` : ' · no address: gigs arrive only when someone imports a feed file'}</small>
        <small class="faint">${s.blocked ? 'Its gigs are gone and it is never fetched.' : `${s.gigs} gig${s.gigs === 1 ? '' : 's'} · ${s.lastOk ? `fetched ${esc(ago(s.lastOk))}` : 'not fetched yet'}${s.error ? ` · ${esc(s.error)}` : ''}`}</small>
        <div class="wf-sub-acts">${s.blocked ? '' : `<button type="button" class="btn sm ghost" data-wf-pause="${s.paused ? '0' : '1'}">${s.paused ? 'Resume' : 'Pause'}</button>`}<button type="button" class="btn sm ghost" data-wf-block="${s.blocked ? '0' : '1'}">${s.blocked ? 'Unblock' : 'Block'}</button><button type="button" class="btn sm ghost" data-wf-remove="1">Remove</button></div></li>`; };
    const html = `<div class="tl-form wf-manage">
      <section><span class="eyebrow">This tribe's feed</span>
        <div class="tl-seg" role="group" aria-label="Who can read this tribe's gig feed" id="wf-pub">${[['members', 'Members only'], ['open', 'Open']].map(([k, l]) => `<button type="button" class="${a.publish === k ? 'on' : ''}" data-wf-publish="${k}" aria-pressed="${a.publish === k}">${l}</button>`).join('')}</div>
        <p class="tl-fine" id="wf-pub-note">${a.publish === 'open' ? 'Open: anyone with the address can read the gigs your people made Public, and requests your people send. Nothing else is in it.' : 'Members only: other tribes can’t fetch it. Switch to Open to let them follow you.'}</p>
        <label class="tl-lbl">Feed address<div class="wf-copy"><input class="input" id="wf-url" readonly value="${esc(a.url || '')}" placeholder="Needs a public address for this server (Share)"><button type="button" class="btn sm" data-wf-copy="wf-url">Copy</button></div></label>
        <label class="tl-lbl">Key fingerprint <small class="faint">give it with the address, so they know it is really you</small><div class="wf-copy"><input class="input wf-mono" id="wf-fp" readonly value="${esc(a.fingerprint)}"><button type="button" class="btn sm" data-wf-copy="wf-fp">Copy</button></div></label></section>
      <section><div class="wf-sh"><span class="eyebrow">Tribes you follow (${a.subscriptions.length})</span>${a.subscriptions.some(s => s.url && !s.blocked) ? '<button type="button" class="btn sm ghost" id="wf-fetch">Fetch now</button>' : ''}</div>
        ${a.subscriptions.length ? `<ul class="wf-subs">${a.subscriptions.map(subRow).join('')}</ul>` : '<p class="tl-none">None yet. Ask a tribe for its feed address and key fingerprint.</p>'}
        <form id="wf-add" class="wf-add" autocomplete="off"><label class="tl-lbl">Feed address<input class="input" id="wf-add-url" required inputmode="url" placeholder="https://their-tribe.example/api/work/feed.json"></label>
          <label class="tl-lbl">Their key fingerprint<input class="input wf-mono" id="wf-add-fp" required maxlength="24" placeholder="xxxx-xxxx-xxxx-xxxx"></label>
          <p class="tl-fine">Only https addresses on the public internet are fetched, about every 45 minutes. A feed signed by any other key is refused.</p>
          <div class="tl-sh-foot"><button class="btn primary" type="submit" id="wf-add-go">Follow</button></div></form></section>
      ${(rq.received || []).length ? `<section><span class="eyebrow">Requests from other tribes (${rq.received.length})</span><ul class="wf-subs">${rq.received.map(r => `<li class="wf-sub"><div class="wf-sub-t"><b>${esc(r.from || 'Someone')} · ${esc(r.tribe)}</b></div><small>About “${esc(r.title || r.gig)}”</small>${r.note ? `<p class="tl-read">${esc(r.note)}</p>` : ''}<small class="wf-fp">Reach them: ${esc(r.contact)}</small></li>`).join('')}</ul></section>` : ''}
    </div>`;
    U.sheet('Gig feeds', 'Work · other tribes', html, el => {
      const again = () => { load().then(() => window.TribeTalent && window.TribeTalent.redraw && window.TribeTalent.redraw()); manage(); };
      el.onclick = async e => {
        const t = e.target.closest('button'); if (!t) return;
        const sid = (t.closest('[data-wf-sub]') || { dataset: {} }).dataset.wfSub;
        try {
          if (t.dataset.wfCopy) return copy(el.querySelector('#' + t.dataset.wfCopy).value);
          if (t.dataset.wfPublish) { await C.api('/work/settings', { method: 'PUT', body: { publish: t.dataset.wfPublish } }); toast(t.dataset.wfPublish === 'open' ? 'The feed is open' : 'The feed is members-only'); return again(); }
          if (t.id === 'wf-fetch') { t.disabled = true; t.textContent = 'Fetching…'; await C.api('/work/fetch', { method: 'POST', body: {} }); return again(); }
          if (t.dataset.wfPause) { await C.api('/work/subscriptions/' + encodeURIComponent(sid), { method: 'PATCH', body: { paused: t.dataset.wfPause === '1' } }); return again(); }
          if (t.dataset.wfBlock) { await C.api('/work/subscriptions/' + encodeURIComponent(sid), { method: 'PATCH', body: { blocked: t.dataset.wfBlock === '1' } }); toast(t.dataset.wfBlock === '1' ? 'Blocked: its gigs are gone' : 'Unblocked'); return again(); }
          if (t.dataset.wfRemove) { await C.api('/work/subscriptions/' + encodeURIComponent(sid), { method: 'DELETE' }); return again(); }
        } catch (er) { toast(er.message); }
      };
      el.querySelector('#wf-add').onsubmit = async e => {
        e.preventDefault(); const go = el.querySelector('#wf-add-go'); go.disabled = true; go.textContent = 'Checking…';
        try { const r = await C.api('/work/subscriptions', { method: 'POST', body: { url: el.querySelector('#wf-add-url').value.trim(), fingerprint: el.querySelector('#wf-add-fp').value.trim() } }); toast(`Following ${r.subscription.name}`); again(); }
        catch (er) { go.disabled = false; go.textContent = 'Follow'; let n = el.querySelector('#wf-add-err'); if (!n) { n = document.createElement('p'); n.id = 'wf-add-err'; n.className = 'wf-err'; n.setAttribute('role', 'alert'); el.querySelector('#wf-add .tl-sh-foot').before(n); } n.textContent = er.message; }
      };
    });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-wf-req],[data-wf-hide],[data-wf-manage]'); if (!t || t.closest('#tl-sheet')) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.wfReq) return request(t.dataset.wfReq);
    if (t.dataset.wfHide) return hide(t.dataset.wfHide);
    return manage();
  }, true);
  window.TribeWorkFeeds = { load, gigs, canManage: () => !!st.canManage, bar, card, manage, request, hide };
})();
