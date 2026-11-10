// Recommended next (v0.27): a small card on the project dashboard that senses what the project is (server/sense.js:
// game, site, app, business…), where it stands (vision, code repository, people, company, money) and the person's
// experience mode, and suggests at most three things worth doing next, each with one button. Features stack at your
// request: "Turn it on" unlocks a feature above your mode for you only (TribeMode.unlock), without changing your mode.
// Dismissed suggestions stay hidden on this device (localStorage 'tribecode.reco.hide.<project>').
// Public: window.TribeReco = { draw(pid), list(pid) }.
(function () {
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = () => window.TribeMode;
  const go = k => window.TribeShell && window.TribeShell.go ? window.TribeShell.go(k) : null;
  const hideKey = pid => 'tribecode.reco.hide.' + pid;
  const hidden = pid => { try { return new Set(JSON.parse(localStorage.getItem(hideKey(pid)) || '[]')); } catch { return new Set(); } };
  const hideOne = (pid, id) => { const h = hidden(pid); h.add(id); try { localStorage.setItem(hideKey(pid), JSON.stringify([...h])); } catch {} };
  const needs = key => !!(M() && M().allowsKey && !M().allowsKey(key));   // above this person's mode (and not yet turned on)
  const proj = pid => (C.state().projects || []).find(p => p.id === pid) || {};
  const members = pid => (C.state().members || []).filter(m => m.role !== 'agent' && (!proj(pid).members || proj(pid).members[m.id] !== undefined));

  // id, emoji, title, why, button label, run(), unlock key (when the feature sits above the person's mode), score
  async function list(pid) {
    const p = proj(pid), out = [];
    let sense = {}, co = null, vision = '';
    try { sense = await C.api(`/projects/${encodeURIComponent(pid)}/sense`); } catch {}
    try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/company`); co = r && (r.company || r); if (co && co.on === false) co = null; } catch {}
    try { vision = String((await C.api('/vision')).text || ''); } catch {}
    const kind = String(sense.kind || '').toLowerCase(), text = `${p.name || ''} ${p.bio || ''} ${vision} ${(sense.tags || []).join(' ')}`.toLowerCase();
    const businessy = kind === 'business' || /\b(business|shop|store|customers?|clients?|startup|company|agency|bakery|salon|sell|revenue|subscription|saas|nonprofit|donat)/.test(text);
    const people = members(pid).length, seats = co ? (co.seats || []) : [], open = seats.filter(s => !(s.holder || {}).person && !(s.holder || {}).agent);
    const add = (o) => out.push(o);

    if (!vision.trim()) add({ id: 'vision', e: '✨', t: 'Say what you’re making', why: 'One or two sentences. Flint, your AI helpers and everything below get smarter from it.', b: 'Write the vision', run: () => { const ck = $('#pj-check [data-ck="vision"]'); if (ck) ck.click(); else go('docs'); }, score: 100 });
    if (businessy && !co) add({ id: 'company', e: '🏢', t: 'Make it a company', why: 'This sounds like a business. Give each role a seat (CEO, Build, Grow, Run) and hand the ones you can’t fill to an AI helper.', b: 'Make it a company', run: () => go('company'), score: 90 });
    if (people <= 1) add({ id: 'friends', e: '👋', t: 'Bring a friend', why: 'Your tribe link lets anyone join with a name, no account. Projects move faster with two.', b: 'Invite friends', run: () => { const b = $('#tour-invite'); if (b) b.click(); }, score: 70 });
    if (!p.hasRepo && vision.trim()) add({ id: 'repo', e: '📦', t: 'Create the code repository', why: 'The shared folder for your code, saved on GitHub. The preview runs from it.', b: 'Set it up', run: () => go('repo'), unlock: 'repo', score: 65 });
    if (co && open.length) add({ id: 'seats', e: '🪑', t: `Fill ${open.length === 1 ? 'the ' + (open[0].title || 'open') + ' seat' : open.length + ' open seats'}`, why: 'Give a seat to a friend, hire someone through Work, or let an AI helper hold it with a short charter.', b: 'Open the org chart', run: () => go('company'), score: 80 });
    if (co) add({ id: 'money', e: '💵', t: 'Track the money', why: 'Revenue, costs and runway in one place, every number with its source. Import a Stripe CSV in a minute.', b: needs('money') ? 'Turn on Money' : 'Open Money', run: () => go('money'), unlock: 'money', score: 60 });
    if (co && open.length) add({ id: 'work', e: '🤝', t: 'Post a gig for the open seat', why: 'Find vibecoding help, trade time with other builders, or share spare AI time.', b: needs('work') ? 'Turn on Work' : 'Open Work', run: () => go('work'), unlock: 'work', score: 55 });
    if (co && (kind === 'site' || kind === 'app' || businessy)) add({ id: 'legal', e: '📜', t: 'Draft a privacy policy', why: 'A plain-English starting point in Files, to check with a professional before you publish.', b: 'Open Legal', run: () => (window.TribeLegal && window.TribeLegal.open ? window.TribeLegal.open() : go('academy')), score: 40 });
    if (kind === 'game') add({ id: 'game-assets', e: '🎮', t: 'Add sounds and sprites', why: 'Free, credited sounds, pixel sprites and 3D models from the asset library, ready to drop in.', b: 'Browse assets', run: () => (window.TribeAssets && window.TribeAssets.open ? window.TribeAssets.open() : go('docs')), score: 50 });
    if (kind === 'site' || kind === 'app') add({ id: 'inspo', e: '🎨', t: 'Dress it up from inspiration', why: 'Drop a few pictures or a Pinterest board; TribeCode pulls out the colors and fonts for you.', b: 'Open the board', run: () => { const b = $('#pj-board-slot'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, score: 45 });
    if (co && M() && M().get() === 'advanced' && seats.some(s => (s.holder || {}).agent)) add({ id: 'autopilot', e: '🛫', t: 'Put a seat on autopilot', why: 'An AI-held seat can work its charter on a schedule. Anything outward or costly still waits for your OK.', b: 'Set a schedule', run: () => go('money'), score: 35 });
    if (M() && M().get() === 'beginner') add({ id: 'academy', e: '🎓', t: co ? 'Learn your role' : 'Learn the basics', why: 'Short lessons in plain words, for every role in a company, with something to try in your tribe.', b: 'Open the Academy', run: () => (window.TribeAcademy && window.TribeAcademy.open ? window.TribeAcademy.open() : go('academy')), score: 30 });
    add({ id: 'market', e: '🧩', t: 'Find add-ons for this project', why: 'Widgets, templates, skills and connectors, sorted by what your tribe uses most.', b: 'Open the Marketplace', run: () => (window.TribeMarket && window.TribeMarket.open ? window.TribeMarket.open() : go('market')), score: 20 });

    const h = hidden(pid);
    return out.filter(x => !h.has(x.id)).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  let seq = 0;
  async function draw(pid) {
    const slot = $('#pj-reco-slot'); if (!slot || !pid) return;
    const n = ++seq, items = await list(pid); if (n !== seq) return;
    if (!items.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<section class="card rc-card" aria-label="Recommended next"><div class="rc-head"><span class="eyebrow">Recommended next</span><span class="faint rc-sub">picked for this project</span></div>
      <div class="rc-list">${items.map(x => `<div class="rc-item" data-rc="${esc(x.id)}"><span class="rc-e" aria-hidden="true">${x.e}</span><div class="rc-t"><b>${esc(x.t)}</b><small>${esc(x.why)}</small></div>
        <div class="rc-acts"><button class="btn sm ${x.unlock && needs(x.unlock) ? 'primary' : ''}" data-rc-go="${esc(x.id)}">${esc(x.b)}</button><button class="rc-x" data-rc-x="${esc(x.id)}" title="Not now" aria-label="Hide this suggestion">×</button></div></div>`).join('')}</div></section>`;
    slot.querySelectorAll('[data-rc-go]').forEach(b => b.onclick = () => { const x = items.find(i => i.id === b.dataset.rcGo); if (!x) return; if (x.unlock && needs(x.unlock) && M().unlock) M().unlock(x.unlock); x.run(); });
    slot.querySelectorAll('[data-rc-x]').forEach(b => b.onclick = () => { hideOne(pid, b.dataset.rcX); draw(pid); });
  }
  let t; const soon = () => { clearTimeout(t); t = setTimeout(() => { const pid = C.project && C.project(); if (pid && $('#pj-reco-slot')) draw(pid); }, 400); };
  if (C.on) { C.on('company', soon); C.on('vision', soon); C.on('projects', soon); }
  document.addEventListener('tribe:mode', soon);
  window.TribeReco = { draw, list };
})();
