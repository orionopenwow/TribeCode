// The website designer's whole-site tools (feat/design-site2). sitedesigner.js owns the designer; this file adds four
// things to its right panel and top bar, all on the same undoable commits everything else uses:
//   Style   one place that restyles the whole site: looks, the main colour (Open Color swatches, MIT), fonts, corners,
//           spacing, light or dark, and the project's brand kit (shared with the Design canvas, app/ui/brandkit.js)
//   Check   "Check my site": what would embarrass you after publishing (dead buttons, pictures with no description,
//           faint colours, empty sections, no description for search, anything wider than a phone), with one-tap fixes
//   Agent   "Have my agent do it": the ask goes to the person's own agent (the same Ask an agent queue, POST
//           /api/coord/asks); the agent answers with site_propose (server/sitedesign.js), and the proposal shows here
//           as a list in words with Apply (one undo step) and Decline. With no agent it offers the built-in helper.
//   Icons   click an icon in the preview to pick another (Lucide, ISC)
// The designer hands over a small api: { cfg(), commit(cfg), say(text, html, acts), undo(), pid(), page(), select(blockId),
// connected(), ask(text), render(cfg, opts), frameJs() }.
//   window.TribeSiteStudio = { paint(panel, box, api), click(el, api), opened(api), closed(), issues(api) -> Promise<[…]>, proposal(api, p) }
(function () {
  'use strict';
  const S = () => window.TribeSiteCfg, C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (n, size) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, size || 16) : '');
  const kitApi = () => window.TribeBrandKit;
  let lastIssues = null, checking = false, phoneWide = null, seen = new Set(), kit = null, kitPid = null;

  // ---------- Style ----------
  const RADII = [[0, 'Sharp'], [6, 'Soft'], [12, 'Round'], [22, 'Pill']];
  function stylePanel(box, api) {
    const c = api.cfg(), P = S().PRESETS, FP = S().FONT_PAIRS, A = S().ACCENTS, k = S().colors(c);
    const curF = Object.keys(FP).find(x => FP[x].display === c.theme.fonts.display && FP[x].body === c.theme.fonts.body) || '';
    const look = (id, p) => `<button type="button" class="stu-look" data-stu="look" data-val="${id}" aria-pressed="${c.theme.preset === id}" title="${esc(p.name)}" style="--b:${p.colors.bg};--i:${p.colors.ink};--a:${p.colors.accent};--l:${p.colors.line};--rr:${Math.min(p.radius, 10)}px"><span class="stu-look-pv"><b>Aa</b><i></i></span><small>${esc(p.name)}</small></button>`;
    const K = kit && kitPid === (api.pid() || 'me') ? kit : null, hasKit = K && (K.colors.accent || K.logo || K.fonts.display);
    box.innerHTML = `<p class="wdz-eyebrow">Style the whole site</p>
      <p class="wdz-hint">Every choice here changes all pages at once. Undo takes it back.</p>
      <div class="stu-kit" id="stu-kit"><p class="stu-h">${I('palette')}<b>Brand kit</b><small>${hasKit ? 'Shared with Design' : 'One look for your website and your designs'}</small></p>
        ${hasKit ? `<p class="stu-kitrow">${K.logo ? `<img src="${esc(K.logo)}" alt="">` : ''}${[K.colors.accent, K.colors.ink, K.colors.bg, ...K.colors.more].filter(Boolean).slice(0, 6).map(h => `<span class="stu-sw" style="background:${h}" title="${h}"></span>`).join('')}<small>${esc([K.fonts.display, K.fonts.body].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' + '))}</small></p>` : ''}
        ${hasKit ? `<label class="stu-voice"><span>How we sound</span><input type="text" id="stu-voice" maxlength="200" value="${esc(K.voice || '')}" placeholder="Warm, plain, a little funny"></label>` : ''}
        <p class="wdz-row">${hasKit ? '<button type="button" class="btn sm" data-stu="kit-use">Use the brand kit here</button>' : ''}<button type="button" class="btn sm${hasKit ? ' ghost' : ''}" data-stu="kit-save">${hasKit ? 'Update it from this site' : 'Save this look as the brand kit'}</button></p></div>
      <p class="stu-h"><b>Look</b><small>colours, fonts and corners together</small></p>
      <div class="stu-looks" role="group" aria-label="Look">${Object.entries(P).map(([id, p]) => look(id, p)).join('')}</div>
      <p class="stu-h"><b>Main colour</b><small>buttons and links</small></p>
      <div class="stu-accents" role="group" aria-label="Main colour">${Object.entries(A).filter(([n]) => n !== 'gray').map(([n, sh]) => `<button type="button" class="stu-sw" data-stu="accent" data-val="${sh[1]}" style="background:${sh[1]}" title="${esc(n)}" aria-label="${esc(n)}" aria-pressed="${k.accent.toLowerCase() === S().colors(S().setColor(c, sh[1])).accent.toLowerCase()}"></button>`).join('')}<label class="stu-pick" title="Any colour"><span class="sr">Any colour</span><input type="color" id="stu-color" value="${esc(k.accent)}"></label></div>
      <p class="stu-h"><b>Fonts</b></p>
      <div class="stu-fonts" role="group" aria-label="Fonts">${Object.entries(FP).map(([id, f]) => `<button type="button" class="btn sm" data-stu="fonts" data-val="${id}" aria-pressed="${curF === id}">${esc(f.name)}</button>`).join('')}</div>
      <p class="stu-h"><b>Corners</b></p>
      <p class="wdz-row" role="group" aria-label="Corners">${RADII.map(([r, l]) => `<button type="button" class="btn sm" data-stu="radius" data-val="${r}" aria-pressed="${Math.abs((c.theme.radius || 0) - r) <= 2}">${l}</button>`).join('')}</p>
      <p class="stu-h"><b>Spacing</b></p>
      <p class="wdz-row" role="group" aria-label="Spacing">${[['compact', 'Compact'], ['normal', 'Normal'], ['roomy', 'Roomy']].map(([v, l]) => `<button type="button" class="btn sm" data-stu="space" data-val="${v}" aria-pressed="${(c.theme.space || 'normal') === v}">${l}</button>`).join('')}</p>
      <p class="stu-h"><b>Light or dark</b></p>
      <p class="wdz-row" role="group" aria-label="Light or dark">${[['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" class="btn sm" data-stu="mode" data-val="${v}" aria-pressed="${c.theme.mode === v}">${l}</button>`).join('')}</p>`;
    const vi = box.querySelector('#stu-voice'); if (vi) vi.addEventListener('change', async () => { if (!kitApi() || !kit) return; kit = await kitApi().set(api.pid(), { ...kit, voice: vi.value.trim() }); });
    const ci = box.querySelector('#stu-color'); if (ci) ci.addEventListener('change', () => api.commit(S().setColor(api.cfg(), ci.value)));
    if (kitPid !== (api.pid() || 'me')) loadKit(api).then(() => { if (box.isConnected && box.querySelector('#stu-kit')) stylePanel(box, api); });
  }
  async function loadKit(api) { kitPid = api.pid() || 'me'; try { kit = kitApi() ? await kitApi().get(api.pid()) : null; } catch { kit = null; } return kit; }

  // ---------- Check my site ----------
  // the model's checks (S.check) plus one the model cannot know: does anything stick out past a phone's edge? The page is
  // rendered into a hidden 390px frame with the designer's own helper, which reports its scroll width.
  function measurePhone(api) {
    return new Promise(res => {
      let done = false; const fin = v => { if (done) return; done = true; removeEventListener('message', on); f.remove(); res(v); };
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.className = 'stu-probe';
      const on = e => { const d = e.data; if (!d || !d.sd || e.source !== f.contentWindow || d.t !== 'ready') return; fin({ wide: d.sw > d.iw + 1, by: d.sw - d.iw, block: d.wide || '' }); };
      addEventListener('message', on); setTimeout(() => fin(null), 2500);
      try { f.srcdoc = api.render(api.cfg(), { page: api.page(), edit: true, mode: 'single', extraBody: api.frameJs() }); document.body.appendChild(f); } catch { fin(null); }
    });
  }
  async function issues(api) {
    const list = S().check(api.cfg());
    phoneWide = await measurePhone(api);
    if (phoneWide && phoneWide.wide) list.unshift({ id: 'phone-wide', level: 'fix', title: 'Something is wider than a phone screen', text: `On a 390px phone the page scrolls sideways by ${Math.round(phoneWide.by)}px${phoneWide.block ? ', in the section shown' : ''}. A long word, a wide table or a large picture is usually the cause.`, page: api.page(), block: phoneWide.block || undefined });
    lastIssues = list; return list;
  }
  function checkPanel(box, api) {
    const head = `<p class="wdz-eyebrow">Check my site</p>`;
    if (!lastIssues) { box.innerHTML = `${head}<p class="wdz-hint">Looks for what would bother a visitor: buttons that go nowhere, pictures with no description, faint colours, empty sections, search and sharing details, and anything wider than a phone.</p><p class="wdz-row"><button type="button" class="btn sm primary" data-stu="check">Check my site</button></p>`; return; }
    const fixes = lastIssues.filter(x => x.fix), must = lastIssues.filter(x => x.level === 'fix'), tips = lastIssues.filter(x => x.level !== 'fix');
    const row = x => `<li class="stu-issue stu-${x.level}" data-issue="${esc(x.id)}"><span class="stu-dot" aria-hidden="true"></span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p><p class="wdz-row">${x.fix ? `<button type="button" class="btn sm" data-stu="fix" data-id="${esc(x.id)}">${esc(x.fix.label)}</button>` : ''}${x.block ? `<button type="button" class="btn sm ghost" data-stu="show" data-block="${esc(x.block)}" data-pg="${esc(x.page || '')}">Show me</button>` : ''}</p></div></li>`;
    box.innerHTML = `${head}
      <p class="stu-sum" role="status">${!lastIssues.length ? `${I('check')} <b>Nothing to fix.</b> It is ready to publish.` : `<b>${must.length ? `${must.length} to fix` : 'Nothing that must be fixed'}</b>${tips.length ? ` · ${tips.length} suggestion${tips.length === 1 ? '' : 's'}` : ''}`}</p>
      <p class="wdz-row">${fixes.length > 1 ? `<button type="button" class="btn sm primary" data-stu="fixall">Fix ${fixes.length} for me</button>` : ''}<button type="button" class="btn sm" data-stu="check">${checking ? 'Checking…' : 'Check again'}</button></p>
      ${must.length ? `<ul class="stu-issues" aria-label="To fix">${must.map(row).join('')}</ul>` : ''}
      ${tips.length ? `<p class="stu-h"><b>Suggestions</b></p><ul class="stu-issues" aria-label="Suggestions">${tips.map(row).join('')}</ul>` : ''}`;
  }
  async function runCheck(api, box) { checking = true; if (box) checkPanel(box, api); try { await issues(api); } finally { checking = false; } if (box && box.isConnected) checkPanel(box, api); return lastIssues; }
  function applyFix(api, list, label) {
    const ops = list.flatMap(x => x.fix.ops), r = S().applyOps(api.cfg(), ops);
    if (!r.done.length) { api.say('That could not be fixed automatically. Open the section and change it by hand.'); return false; }
    api.commit(r.cfg);
    api.say(`${label}: ${r.done.length === 1 ? r.done[0] : `${r.done.length} changes`}.`, r.done.length > 1 ? `<ul class="stu-done">${r.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '', [{ label: 'Undo', fn: () => { if (api.undo()) api.say('Undone.'); } }]);
    return true;
  }

  // ---------- Have my agent do it ----------
  const agents = () => { try { return ((C.state && C.state().members) || []).filter(m => m.role === 'agent'); } catch { return []; } };
  function agentSheet(api) {
    let el = document.getElementById('stu-agent'); if (el) { el.remove(); }
    el = document.createElement('div'); el.id = 'stu-agent'; el.className = 'stu-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Have my agent do it');
    const all = api.connected() ? agents() : [], on = all.filter(m => m.online), can = api.connected() && api.pid();
    el.innerHTML = `<div class="stu-sheet-in"><p class="wdz-eyebrow">Have my agent do it</p>
      <h2>What should change on the site?</h2>
      <textarea id="stu-ask" class="input" rows="4" maxlength="2000" placeholder="Like: rewrite the opening for parents, add a how it works section, and make it feel calmer"></textarea>
      <p class="wdz-hint">${can ? (on.length ? `${esc(on.length === 1 ? on[0].name : `${on.length} agents`)} ${on.length === 1 ? 'is' : 'are'} connected. The agent reads the site and sends back a list of changes. Nothing changes until you press Apply, and Undo takes it back.` : all.length ? 'Your agent is not connected right now. The request waits for it; the changes come back here for you to approve.' : 'No agent has joined this tribe yet. Invite yours, or let the built-in helper try.') : 'An agent needs the tribe to be online. The built-in helper works right here.'}</p>
      <p class="wdz-row">${can && all.length ? '<button type="button" class="btn sm primary" data-stu="agent-send">Send to my agent</button>' : can && window.TribeInviteAgent ? '<button type="button" class="btn sm primary" data-stu="agent-invite">Invite my agent</button>' : ''}<button type="button" class="btn sm${can && (all.length || window.TribeInviteAgent) ? '' : ' primary'}" data-stu="agent-flint">Let the built-in helper try</button><span class="wdz-sp"></span><button type="button" class="btn sm ghost" data-stu="agent-close">Cancel</button></p></div>`;
    (document.getElementById('wdz') || document.body).appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-stu]'); if (b) click(b, api); else if (e.target === el) el.remove(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); el.remove(); } });
    setTimeout(() => { const t = el.querySelector('#stu-ask'); if (t) t.focus(); }, 0);
  }
  async function agentSend(api) {
    const t = document.getElementById('stu-ask'), text = (t && t.value || '').trim(); if (!text) { if (t) t.focus(); return; }
    const sheet = document.getElementById('stu-agent');
    try {
      await C.api('/coord/asks', { method: 'POST', body: { text: `Website change request for the project's website (made in the website designer): ${text}\n\nHow to do it: call site_read to see the site, then site_propose with your steps and a short note. Do not edit files for this. The person approves the proposal in the designer.` } });
      if (sheet) sheet.remove();
      api.say('Sent to your agent. When it answers, its changes show up here as a list for you to apply or decline.');
    } catch (e) { api.say(`That could not be sent: ${e && e.message ? e.message : 'the tribe did not answer'}.`); }
  }
  // a proposal from an agent: said in the Flint log as a list in words, with Apply and Decline
  function proposal(api, p) {
    if (!p || seen.has(p.id)) return; seen.add(p.id);
    const answer = how => C.api(`/projects/${encodeURIComponent(api.pid())}/site-proposals/${encodeURIComponent(p.id)}/${how}`, { method: 'POST', body: {} }).catch(() => {});
    let used = false;
    api.say(`${p.byName || 'Your agent'} suggests ${p.done.length} change${p.done.length === 1 ? '' : 's'}${p.note ? `: ${p.note}` : '.'}`,
      `<ul class="stu-done">${p.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul>${p.skipped && p.skipped.length ? `<p class="wdz-hint">Left out: ${esc(p.skipped.join(' · '))}</p>` : ''}`,
      [{ label: 'Apply', fn: () => { if (used) return; const r = S().applyOps(api.cfg(), p.ops); if (!r.done.length) { api.say('Those changes no longer fit the site as it is now.'); used = true; answer('declined'); return; } used = true; api.commit(r.cfg); answer('applied'); api.say(`Applied ${r.done.length} change${r.done.length === 1 ? '' : 's'} from ${p.byName || 'your agent'}.`, '', [{ label: 'Undo', fn: () => { if (api.undo()) api.say('Undone.'); } }]); } },
        { label: 'Decline', fn: () => { if (used) return; used = true; answer('declined'); api.say('Declined. Nothing changed.'); } }]);
  }
  async function loadProposals(api) {
    if (!api.connected() || !api.pid()) return;
    try { const r = await C.api(`/projects/${encodeURIComponent(api.pid())}/site-proposals`); (r.proposals || []).forEach(p => proposal(api, p)); } catch {}
  }
  let onProp = null;
  function opened(api) {
    lastIssues = null; kitPid = null;
    loadProposals(api);
    if (C && C.on && !onProp) { onProp = d => { if (!d || d.type !== 'site-proposal' || (d.project && d.project !== api.pid())) return; loadProposals(api); }; C.on('ws', onProp); }
  }
  function closed() { const s = document.getElementById('stu-agent'); if (s) s.remove(); const ip = document.getElementById('stu-icons'); if (ip) ip.remove(); }

  // ---------- icons ----------
  function iconPicker(api, key) {
    let el = document.getElementById('stu-icons'); if (el) el.remove();
    const [block, path] = String(key).split('|');
    el = document.createElement('div'); el.id = 'stu-icons'; el.className = 'stu-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Pick an icon');
    el.innerHTML = `<div class="stu-sheet-in"><p class="wdz-eyebrow">Pick an icon</p><input class="input" id="stu-iq" placeholder="Search: heart, clock, coffee…" aria-label="Search icons"><div class="stu-icongrid" id="stu-ig"></div><p class="wdz-row"><span class="wdz-hint">Icons by Lucide (ISC License).</span><span class="wdz-sp"></span><button type="button" class="btn sm ghost" data-ic-close>Close</button></p></div>`;
    const grid = el.querySelector('#stu-ig'), draw = q => { grid.innerHTML = S().ICON_NAMES.filter(n => !q || n.includes(q)).map(n => `<button type="button" data-ic="${n}" title="${n}" aria-label="${n}">${S().icon(n)}</button>`).join('') || '<p class="wdz-hint">No icon by that name.</p>'; };
    draw('');
    el.addEventListener('input', e => { if (e.target.id === 'stu-iq') draw(e.target.value.trim().toLowerCase().replace(/\s+/g, '-')); });
    el.addEventListener('click', e => { const b = e.target.closest('[data-ic]'); if (b) { api.commit(S().setProp(api.cfg(), api.page(), block, path, b.dataset.ic)); el.remove(); return; } if (e.target.closest('[data-ic-close]') || e.target === el) el.remove(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); el.remove(); } });
    (document.getElementById('wdz') || document.body).appendChild(el);
    setTimeout(() => el.querySelector('#stu-iq').focus(), 0);
  }

  function paint(panel, box, api) { if (!box) return; if (panel === 'style') return stylePanel(box, api); if (panel === 'check') return checkPanel(box, api); }
  async function click(el, api) {
    const k = el.dataset.stu, v = el.dataset.val, c = api.cfg(), box = document.getElementById('wdz-insp');
    if (k === 'look') return api.commit(S().setTheme(c, v));
    if (k === 'accent') return api.commit(S().setColor(c, v));
    if (k === 'fonts') return api.commit(S().setFonts(c, v));
    if (k === 'radius') return api.commit(S().setRadius(c, +v));
    if (k === 'space') return api.commit(S().setSpace(c, v));
    if (k === 'mode') return api.commit(S().setMode(c, v));
    if (k === 'kit-save') { if (!kitApi()) return; kit = await kitApi().set(api.pid(), { ...S().kitFromSite(c), voice: (kit && kitPid === (api.pid() || 'me') && kit.voice) || '' }); kitPid = api.pid() || 'me'; api.say('Saved this look as the brand kit. Design uses the same colours, fonts and logo.'); if (box) stylePanel(box, api); return; }
    if (k === 'kit-use') { if (!kit) await loadKit(api); if (!kit) return; api.commit(S().kitToSite(c, kit)); api.say('Used the brand kit: its colours, fonts and logo are on every page.', '', [{ label: 'Undo', fn: () => { if (api.undo()) api.say('Undone.'); } }]); return; }
    if (k === 'check') return runCheck(api, box);
    if (k === 'fix' || k === 'fixall') { const list = (lastIssues || []).filter(x => x.fix && (k === 'fixall' || x.id === el.dataset.id)); if (list.length && applyFix(api, list, k === 'fixall' ? 'Fixed' : list[0].title)) await runCheck(api, document.getElementById('wdz-insp')); return; }
    if (k === 'show') return api.select(el.dataset.block, el.dataset.pg);
    if (k === 'agent') return agentSheet(api);
    if (k === 'agent-close') { const s = document.getElementById('stu-agent'); if (s) s.remove(); return; }
    if (k === 'agent-send') return agentSend(api);
    if (k === 'agent-invite') { const s = document.getElementById('stu-agent'); if (s) s.remove(); return window.TribeInviteAgent && window.TribeInviteAgent.open && window.TribeInviteAgent.open({}); }
    if (k === 'agent-flint') { const t = document.getElementById('stu-ask'), text = (t && t.value || '').trim(); if (!text) { if (t) t.focus(); return; } const s = document.getElementById('stu-agent'); if (s) s.remove(); return api.ask(text); }
    if (k === 'icon') return iconPicker(api, el.dataset.key);
  }
  window.TribeSiteStudio = { paint, click, opened, closed, issues, proposal, iconPicker, reset: () => { lastIssues = null; } };
})();
