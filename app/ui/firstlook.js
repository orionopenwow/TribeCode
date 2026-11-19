// First preview (pass 6, docs/FIRST-PREVIEW.md): the sentence someone types when they start a project becomes a working
// first version they can look at straight away, with no AI.
//   guess(idea)                 -> { kind: 'site'|'app'|'game', sub, tpl, label, sure }   (pure; Node too, for the tests)
//   start({ pid, idea, name })  shows "Making your first preview…", makes it, then shows it full size with
//                               "Made from your idea · Change it" and the next actions (Keep editing, Make it better,
//                               Invite a friend). Never blocks on an AI; with a member's AI helper in the tribe it also
//                               offers "Ask the AI to build a better first version" (a change request someone approves).
//   open(pid)                   shows the last first preview again (the dashboard's "Made from your idea" link)
//   failed(pid)                 -> the idea whose preview did not finish (the dashboard offers Try again), or ''
// What it makes, all with what is already in the app:
//   site  the website designer's best template for the kind of site (link in bio, app page, business, portfolio,
//         event, blog), name and line filled in, saved as the project's website (PUT /site-config)
//   app   App Creator's closest template with the name, saved as the project's app (PUT /app-config)
//   game  the closest built-in game starter, written into the project's code (POST /flint/build) and run in the preview
// A save that fails (the demo, a tribe that cannot be reached) still shows the preview; nothing is ever left blank.
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFirstLook = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  // ---------- the guess (pure) ----------
  const W = s => new RegExp(`(^|[^\\p{L}])(${s})(?=$|[^\\p{L}])`, 'iu');
  const SITE_NOUN = W("web ?sites?|sites?|web ?pages?|landing page|home ?page|link ?in ?bio|linktree|link tree|portfolio|blog|newsletter|sitio( web)?|página( web)?|site web|webseite|homepage");
  const PAGE_FOR = W('page for|page about|page to|site for|site about|send (people|visitors|them|fans) to|redirect');
  const QUIZ = W('quiz|trivia|quizzes');
  const APP_NOUN = W('apps?|aplicación|application|anwendung|appli');
  const GAME_NOUN = W('games?|juego|jeu|spiel|gioco|jogo');
  const GAME_HINT = W('platformer|rpg|shooter|runner|arcade|snake|breakout|tetris|falling blocks|maze|dungeon|racing|boss|levels?|side[- ]?scroller|endless|pong|memory match|top[- ]down');
  const APP_HINT = W('kanban|dashboard|board|plan|trip|tracker|tracks?|tracking|planner|habits?|to-?do|todos?|checklist|budget|expenses?|journal|diary|reminders?|timer|pomodoro|workout|recipes?|notes?|calculator|counter|log|chores?|grocery|shopping list|flashcards?|meditation|water|sleep|meds|split');
  const SITE_HINT = W('bakery|caf[eé]|coffee shop|restaurant|menu|shop|store|merch|band|music|event|wedding|conference|meetup|club|business|studio|salon|portfolio|resume|cv|podcast|photograph(y|er)|artist|nonprofit|charity|church|school|course|agency|freelance|landing|launch|waitlist');

  const SUBS = [
    ['linkbio', W('link ?in ?bio|linktree|link tree|my links|all my links|socials|instagram|tiktok|youtube|bio links?|links? page'), 'Link in bio'],
    ['app', W('page for (my|our|the) (app|game|project|tool)|app page|game page|project page|github|open[- ]source|download|app store|play store|releases?|send (people|visitors|them) to|redirect'), 'App or project page'],
    ['event', W('wedding|party|conference|meetup|event|festival|birthday|launch party|gig|concert|reunion|workshop'), 'Event'],
    ['portfolio', W('portfolio|photograph(y|er)|artist|illustrat(or|ion)|my work|resume|cv|designer|showreel'), 'Portfolio'],
    ['blog', W('blog|newsletter|journal|writing|essays?|podcast|recipes blog|diary'), 'Blog or notes'],
    ['business', /./, 'Business or shop'],
  ];
  const SITE_TPL = {   // the best template per kind, then words that pick a closer one (ids in app/ui/sitetpl/)
    linkbio: ['linkbio', [['lb-musician', 'band|music|song|singer|dj|musician'], ['lb-shop', 'shop|store|sell|merch|etsy'], ['lb-writer', 'writer|book|author|newsletter'], ['lb-coach', 'coach|teacher|tutor|lessons'], ['lb-dev', 'developer|coder|github|code'], ['lb-artist', 'artist|illustrator|illustration|drawings?|paintings?|art']]],
    app: ['gh-project', [['app-redirect', 'send (people|visitors|them) to|redirect'], ['app-download', 'download|app store|play store|phone app|mobile'], ['gamepage', 'game']]],
    event: ['conference', [['wedding', 'wedding|marry|married'], ['band', 'gig|concert|band']]],
    portfolio: ['portfolio', [['photography', 'photo'], ['resume', 'resume|cv|job'], ['sb-freelancer', 'freelance']]],
    blog: ['blog', [['podcast', 'podcast'], ['tt-minimal-blog', 'minimal']]],
    business: ['service', [['cafe', 'bakery|caf[eé]|coffee|tea|restaurant|food|pizza|brunch|panader[ií]a|boulangerie|bäckerei|padaria'], ['menu', 'menu'], ['merch', 'merch|shop|store|sell'], ['band', 'band|music'], ['club', 'club|team|league|running|community'], ['nonprofit', 'nonprofit|charity|volunteer|cause'], ['course', 'course|class|learn|teach|school'], ['saas', 'startup|software|saas|product'], ['comingsoon', 'coming soon|waitlist|launch'], ['sb-agency', 'agency']]],
  };
  const APP_TPL = [   // App Creator template ids and the words that pick them; the first match wins
    ['trivia', 'quiz|trivia'], ['party', 'party|game night'], ['habits', 'habits?|streaks?|track (our|my) days?'], ['workout', 'workout|gym|exercise|fitness'], ['running', 'run(ning)?|jog'],
    ['recipes', 'recipes?|cook(ing)?|meals?'], ['mealprep', 'meal prep'], ['budget', 'budget|expenses?|spending|money'], ['savings', 'sav(e|ing)s?'], ['split', 'split|bills? with|share costs'],
    ['journal', 'journal|diary'], ['notes', 'notes?'], ['todo', 'to-?dos?|tasks?|checklist'], ['grocery', 'grocery|groceries|shopping list'], ['chores', 'chores?|housework'],
    ['trip', 'trip|travel|holiday|vacation'], ['planner', 'plan(ner)?|schedule|calendar'], ['meditation', 'meditation|meditate|breathing|breathe|calm'], ['focus', 'focus|pomodoro|timer'], ['water', 'water|hydration|hydrate|drink more'], ['sleep', 'sleep'], ['meds', 'meds?|medicine|pills?'],
    ['kanban', 'kanban|board'], ['chat', 'chat|messages?|messaging|messenger'], ['social', 'social|friends feed|share photos'], ['shop', 'shop|store|sell'], ['booking', 'booking|appointments?|reservations?|reserve'],
    ['events', 'events?|meetups?'], ['bookclub', 'book club|reading'], ['trip', 'trip|travel|holiday|vacation'], ['flashcards', 'flashcards?|study|learn words'], ['plants', 'plants?|garden(ing)?|water plants'],
    ['pets', 'pets?|dog|cat'], ['baby', 'baby|feeding'], ['weather', 'weather'], ['music', 'music|playlist|songs?'], ['podcast', 'podcast'], ['coffee', 'coffee'], ['converter', 'convert|converter|units?'],
    ['crm', 'clients?|customers?|crm'], ['invoices', 'invoices?'], ['stock', 'stock|inventory'],
  ];
  const GAME_TPL = [['blocks', 'tetris|falling blocks|block puzzle'], ['breakout', 'breakout|bricks?|paddle|arkanoid'], ['snake', 'snake'], ['memory', 'memory|match(ing)? pairs|cards? match'],
    ['runner', 'runner|endless|jump over|dino'], ['topdown', 'top[- ]down|dungeon|rpg|zelda|explore|maze|garden|farm'], ['platformer', 'platformer|jump|pixel|levels?|mario|side[- ]?scroller']];
  const pick = (list, t) => { for (const [id, rx] of list) if (W(rx).test(t)) return id; return null; };

  function guess(idea) {
    const t = ' ' + String(idea || '').toLowerCase().replace(/[“”"]/g, ' ') + ' ';
    let kind = null, sure = true;
    if (SITE_NOUN.test(t) || PAGE_FOR.test(t)) kind = 'site';
    else if (QUIZ.test(t)) kind = 'app';
    else if (APP_NOUN.test(t)) kind = 'app';
    else if (GAME_NOUN.test(t) || GAME_HINT.test(t)) kind = 'game';
    else if (APP_HINT.test(t)) kind = 'app';
    else if (SITE_HINT.test(t)) kind = 'site';
    else kind = 'site';
    if (kind === 'site') {
      const sub = SUBS.find(([, rx]) => rx.test(t)) || SUBS[SUBS.length - 1], [def, more] = SITE_TPL[sub[0]];
      if (sub[0] === 'business' && !SITE_NOUN.test(t) && !PAGE_FOR.test(t) && !SITE_HINT.test(t)) sure = false;
      return { kind, sub: sub[0], tpl: pick(more, t) || def, label: sub[2], sure };
    }
    if (kind === 'app') return { kind, sub: 'app', tpl: pick(APP_TPL, t) || 'todo', label: 'Phone app', sure };
    return { kind, sub: 'game', tpl: pick(GAME_TPL, t) || 'platformer', label: 'Game', sure };
  }
  // "Make me a website for Sunrise Bakery, warm colors" -> "Sunrise Bakery, warm colors" (the line the page shows)
  function line(idea) {
    let s = String(idea || '').replace(/\s+/g, ' ').trim()
      .replace(/^(please\s+)?(i|we)\s+(want|would like|need)\s+(to\s+)?(make|build|create|have)?\s*/i, '')
      .replace(/^(let'?s\s+|please\s+)?(make|build|create|start|design|give)\s+(me\s+|us\s+)?/i, '')
      .replace(/^(an?|the|my|our)\s+(simple\s+|small\s+|little\s+|cozy\s+|new\s+)?(web ?site|site|web ?page|page|landing page|link in bio|app|game)\s+(for|about|to|that|where|with)\s+/i, '');
    s = s.replace(/^\p{L}/u, c => c.toUpperCase());
    return s.length >= 12 && s.split(' ').length >= 3 ? s.replace(/[.!]?$/, '.').slice(0, 200) : '';
  }
  // "Make it an app instead": the same idea as another kind
  function forced(idea, as) {
    const t = ' ' + String(idea || '').toLowerCase() + ' ';
    if (as === 'app') return { kind: 'app', sub: 'app', tpl: pick(APP_TPL, t) || 'todo', label: 'Phone app', sure: true };
    if (as === 'game') return { kind: 'game', sub: 'game', tpl: pick(GAME_TPL, t) || 'platformer', label: 'Game', sure: true };
    const g = guess(`a website for ${idea}`); return { ...g, kind: 'site', sure: true };
  }
  const PURE = { guess, forced, line, SITE_TPL, APP_TPL, GAME_TPL };
  if (!root || !root.document) return PURE;

  // ---------- the browser part ----------
  const C = () => root.TribeClient, App = () => root.TribeApp;
  const T = s => (root.TribeI18n && root.TribeI18n.t ? root.TribeI18n.t(s, s) || s : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const toast = (m, k) => { try { App().toast(m, k); } catch {} };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const KEY = pid => 'tribecode.firstlook.' + pid, FAIL = pid => 'tribecode.firstlook.fail.' + pid;
  const enc = encodeURIComponent;
  const SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups';
  const KIND_LABEL = { site: 'Website', app: 'Phone app', game: 'Game' };
  let box = null, cur = null, seq = 0;

  async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }
  const siteName = name => String(name || '').replace(/\s+(web ?site|site|page|link in bio)$/i, '').trim() || name;
  const fontsOf = async cfg => {   // the two fonts the site uses, as data: URLs (the preview frame has no origin of its own)
    const S = root.TribeSiteCfg, F = (S && S.FONT) || {}, out = new Map();
    await Promise.all([cfg.theme && cfg.theme.fonts && cfg.theme.fonts.display, cfg.theme && cfg.theme.fonts && cfg.theme.fonts.body].filter(f => F[f]).map(async f => {
      try { const r = await fetch('assets/site-fonts/' + F[f][0] + '.woff2'); if (!r.ok) return; const b = await r.blob(); out.set(F[f][0], await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })); } catch {}
    }));
    return file => out.get(file) || '';
  };

  // ---------- making it ----------
  async function makeSite(pid, idea, name, g) {
    const S = root.TribeSiteCfg; if (!S) throw new Error('The website designer did not load. Reload the app.');
    let raw; try { raw = await json(`sitetpl/${g.tpl}.json`); } catch { raw = await json('sitetpl/linkbio.json'); g.tpl = 'linkbio'; }
    let cfg = S.normalize(raw); cfg.template = cfg.template || g.tpl;
    const tl = line(idea);
    if (S.fill) { const f = S.fill(cfg, { name: siteName(name), ...(tl ? { tagline: tl } : {}) }); cfg = (f && f.cfg) || cfg; }
    cfg.seo = { ...(cfg.seo || {}), title: siteName(name), description: tl || (cfg.seo || {}).description || '' };
    let saved = true; try { await C().api(`/projects/${enc(pid)}/site-config`, { method: 'PUT', body: { config: cfg, force: true } }); } catch { saved = false; }
    const fonts = await fontsOf(cfg);
    return { html: S.render(cfg, { mode: 'single', fonts }), saved };
  }
  async function makeApp(pid, idea, name, g) {
    const A = root.TribeAppCore; if (!A) throw new Error('App Creator did not load. Reload the app.');
    const doc = A.template(g.tpl, { name: String(name || 'My app').slice(0, 48) }) || A.template('todo', { name });
    let saved = true; try { await C().api(`/projects/${enc(pid)}/app-config`, { method: 'PUT', body: { config: doc } }); } catch { saved = false; }
    return { ...(await appHtml(doc)), saved };
  }
  async function appHtml(doc) {   // the exported phone web app as one page for the frame (like App Creator's Play)
    const A = root.TribeAppCore, files = Object.fromEntries(A.pwa(doc).filter(f => typeof f[1] === 'string'));
    const js = String(files['app.js'] || '').replace(/try \{ if \('serviceWorker' in navigator\)[^\n]*\n/, '').replace(/<\/script/gi, '<\\/script');
    let html = String(files['index.html'] || '').replace(/<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g, '').replace('<script src="app.js"></script>', () => `<script>${js}</script>`);
    // its fonts as data: URLs: the frame has no origin of its own, so it cannot load them from the app
    const want = [...new Set([...html.matchAll(/url\((['"]?)fonts\/([\w.-]+\.woff2)\1\)/g)].map(m => m[2]))], got = {};
    await Promise.all(want.map(async f => { try { const r = await fetch('assets/site-fonts/' + f); if (r.ok) { const bl = await r.blob(); got[f] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); } } catch {} }));
    html = html.replace(/url\((['"]?)fonts\/([\w.-]+\.woff2)\1\)/g, (all, q, f) => (got[f] ? `url(${q}${got[f]}${q})` : 'local(serif)'));
    return { html, phone: true };
  }
  async function makeGame(pid, idea, name, g) {
    try {
      const r = await C().api(`/projects/${enc(pid)}/flint/build`, { method: 'POST', body: { starter: g.tpl, ask: idea, name } });
      const info = await C().api('/preview/token', { method: 'POST', project: pid });
      if (info && info.path) { const u = new URL(info.path.replace(/\/?$/, '/') + (r && r.href ? r.href : ''), C().base ? C().base() + '/' : location.href); return { url: u.href, saved: true }; }
    } catch {}
    // no tribe to write into (the demo, a lost connection): the same starter, put together in this browser
    const cat = await json('starters/catalog.json'), s = (cat.items || []).find(x => x.id === g.tpl) || (cat.items || []).find(x => x.kind === 'game');
    const K = root.TribeStarterKit, files = {};
    await Promise.all(s.files.map(async f => { const r = await fetch(`starters/${s.id}/${f}`); if (r.ok) files[f] = await r.text(); }));
    if (K && files['config.js'] && s.params) { const t = K.fromAsk(`${idea} called ${name}`, s.params); files['config.js'] = K.apply(files['config.js'], t.values, s.params); }
    return { html: K ? K.inline(files) : files['index.html'], saved: false };
  }
  async function make(pid, idea, name, as) {
    const g = as ? forced(idea, as) : guess(idea);
    const out = g.kind === 'app' ? await makeApp(pid, idea, name, g) : g.kind === 'game' ? await makeGame(pid, idea, name, g) : await makeSite(pid, idea, name, g);
    // the dashboard's preview band shows what was just made (the project may also have a code folder with a page in it)
    if (out.saved) { try { await C().api('/dash/show', { method: 'PUT', project: pid, body: { show: g.kind === 'app' ? 'phone' : g.kind === 'site' ? 'site' : 'app' } }); } catch {} }
    const rec = { pid, idea, name, kind: g.kind, sub: g.sub, tpl: g.tpl, label: g.label, sure: g.sure, at: Date.now() };
    ls.set(KEY(pid), JSON.stringify(rec)); ls.set(FAIL(pid), null);
    try { root.dispatchEvent(new CustomEvent('tribe:firstlook', { detail: rec })); } catch {}
    return { ...rec, ...out };
  }

  // ---------- the screen ----------
  function shell() {
    if (box && box.isConnected) return box;
    box = document.createElement('div'); box.id = 'fpv'; box.className = 'fpv'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    document.body.appendChild(box); document.body.classList.add('fpv-open');
    box.addEventListener('keydown', e => { if (e.key === 'Escape' && !box.querySelector('.fpv-change:not([hidden]) textarea:focus')) { e.preventDefault(); close(); } });
    return box;
  }
  function close() {
    if (!box) return; box.remove(); box = null; document.body.classList.remove('fpv-open');
    if (App() && App().show) App().show('home');
    if (root.TribeProjects && root.TribeProjects.refresh) root.TribeProjects.refresh();
  }
  const head = (name, idea, busy) => `<header class="fpv-bar">
      <div class="fpv-id"><span class="eyebrow">${esc(T(busy ? (idea ? 'Your first preview' : 'Preview') : idea ? 'Made from your idea' : 'Preview'))}</span><h1 class="fpv-name">${esc(name)}</h1>
        ${idea ? `<p class="fpv-idea"><span class="fpv-q">“${esc(idea)}”</span>${busy ? '' : ` <button type="button" class="linkish" data-fpv="change">${esc(T('Change it'))}</button>`}</p>` : ''}</div>
      <button type="button" class="fpv-x" data-fpv="close" aria-label="${esc(T('Go to the dashboard'))}" title="${esc(T('Go to the dashboard'))}">${ico('i-x', 16)}</button></header>`;
  function making(name, idea) {
    const b = shell(); b.setAttribute('aria-label', T('Making your first preview'));
    b.innerHTML = `${head(name, idea, true)}<div class="fpv-stage fpv-busy" aria-busy="true"><div class="fpv-making" role="status"><span class="spin" aria-hidden="true"></span><b>${esc(T(idea ? 'Making your first preview…' : 'Opening the preview…'))}</b>${idea ? `<small>${esc(T('From your idea, with no AI. A few seconds.'))}</small>` : ''}</div>
      <div class="fpv-skel" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>`;
    b.querySelector('[data-fpv="close"]').onclick = close;
  }
  async function aiNow() { try { return root.TribeFlintCreate && root.TribeFlintCreate.hasAI ? await root.TribeFlintCreate.hasAI() : { any: false }; } catch { return { any: false }; } }
  async function show(r) {
    cur = r; const b = shell(); b.setAttribute('aria-label', T('Your first preview'));
    const other = ['site', 'app', 'game'].filter(k => k !== r.kind);
    const frame = r.url ? `<iframe class="fpv-frame" id="fpv-frame" title="${esc(r.name)}" src="${esc(r.url)}" sandbox="${SANDBOX}"></iframe>` : `<iframe class="fpv-frame" id="fpv-frame" title="${esc(r.name)}" sandbox="${SANDBOX}"></iframe>`;
    b.innerHTML = `${head(r.name, r.idea, false)}
      <div class="fpv-acts" role="group" aria-label="${esc(T('What next'))}">
        <button type="button" class="btn primary" data-fpv="edit">${ico('i-quill', 15)}${esc(T('Keep editing'))}</button>
        ${r.kind === 'game' ? '' : `<button type="button" class="btn" data-fpv="better">${ico('i-sparkle', 15)}${esc(T('Make it better'))}</button>`}
        <button type="button" class="btn" data-fpv="invite">${ico('i-users', 15)}${esc(T('Invite a friend'))}</button>
        <span class="fpv-kind"><b>${esc(T(KIND_LABEL[r.kind]))}${r.kind === 'site' && r.label ? ` · ${esc(T(r.label))}` : ''}</b>${r.sure === false ? ` <span class="faint">${esc(T('(our best guess)'))}</span>` : ''}
          ${r.idea ? `· ${other.map(k => `<button type="button" class="linkish" data-fpv="as" data-as="${k}">${esc(T(k === 'site' ? 'Make it a website instead' : k === 'app' ? 'Make it an app instead' : 'Make it a game instead'))}</button>`).join(' · ')}` : ''}</span>
      </div>
      <div class="fpv-ai" id="fpv-ai" hidden></div>
      <form class="fpv-change" id="fpv-change" hidden><label class="eyebrow" for="fpv-change-in">${esc(T('Your idea'))}</label><textarea class="input" id="fpv-change-in" rows="2" maxlength="600">${esc(r.idea)}</textarea>
        <div class="fpv-change-f"><button type="button" class="btn" data-fpv="change-x">${esc(T('Cancel'))}</button><button type="submit" class="btn primary">${esc(T('Make it again'))}</button></div></form>
      <div class="fpv-stage fpv-${r.kind}${r.phone ? ' fpv-phone' : ''}">${frame}</div>
      ${r.saved ? '' : `<p class="fpv-note faint">${esc(T('Shown here only: the tribe could not be reached, so nothing was saved yet.'))}</p>`}`;
    if (!r.url) b.querySelector('#fpv-frame').srcdoc = r.html || '';
    b.querySelectorAll('[data-fpv]').forEach(x => { x.onclick = () => act(x.dataset.fpv, x); });
    b.querySelector('#fpv-change').onsubmit = e => { e.preventDefault(); const v = b.querySelector('#fpv-change-in').value.trim(); if (v) again(v, null); };
    const first = b.querySelector('[data-fpv="edit"]'); if (first && !matchMedia('(max-width: 820px)').matches) first.focus({ preventScroll: true });
    const ai = await aiNow();
    if (ai.any && r.kind !== 'game' && box === b && cur === r) {
      const box2 = b.querySelector('#fpv-ai'); box2.hidden = false;
      box2.innerHTML = `<span>${ico('i-sparkle', 14)}${esc(T('Your tribe has an AI helper.'))}</span> <button type="button" class="linkish" data-fpv="ai">${esc(T('Ask the AI to build a better first version'))}</button>`;
      box2.querySelector('[data-fpv="ai"]').onclick = () => act('ai');
    }
  }
  async function act(k, el) {
    const r = cur; if (!r) return;
    if (k === 'close') return close();
    if (k === 'change') { const f = box.querySelector('#fpv-change'); f.hidden = false; f.querySelector('textarea').focus(); return; }
    if (k === 'change-x') { box.querySelector('#fpv-change').hidden = true; return; }
    if (k === 'as') return again(r.idea, el.dataset.as);
    if (k === 'invite') { const f = r.pid; close(); if (root.TribeFlow && root.TribeFlow.inviteSheet) root.TribeFlow.inviteSheet({ project: f }); else if (App() && App().openInvite) App().openInvite(); return; }
    if (k === 'ai') {
      try { const o = await root.TribeFlintCreate.beautify(r.kind === 'app' ? 'app' : 'site', { pid: r.pid, ask: `A better first version of: ${r.idea}` }); toast(o && o.text ? o.text : T('Sent to your tribe’s AI helper. Its version comes back as a change for you to approve.')); }
      catch (e) { toast(e.message || String(e), 'err'); }
      return;
    }
    if (k === 'edit' || k === 'better') {
      const pid = r.pid; box.remove(); box = null; document.body.classList.remove('fpv-open');
      if (r.kind === 'site' && root.TribeSiteDesigner) await root.TribeSiteDesigner.open({ pid });
      else if (r.kind === 'app' && root.TribeAppCreator) await root.TribeAppCreator.open({ pid });
      else if (root.TribePreview) { await root.TribePreview.open(); if (root.TribePreview.setSource) root.TribePreview.setSource('app', true); }
      if (k === 'better') {   // Polish it, from the creator's own Flint row (no AI)
        const t0 = Date.now(); const tick = () => { const b2 = document.querySelector("[data-fc-act='polish']"); if (b2 && b2.offsetParent) return b2.click(); if (Date.now() - t0 < 6000) setTimeout(tick, 150); };
        tick();
      }
    }
  }
  async function again(idea, as) {
    const r = cur; if (!r) return;
    making(r.name, idea);
    try {
      if (idea !== r.idea) { try { await C().api('/vision', { method: 'PUT', project: r.pid, body: { text: `# ${r.name}\n\n${idea}\n` } }); } catch {} }
      show(await make(r.pid, idea, r.name, as));
    } catch (e) { fail(r.pid, idea, e); }
  }
  function fail(pid, idea, e) {
    if (idea) ls.set(FAIL(pid), idea);
    close();
    try { root.dispatchEvent(new CustomEvent('tribe:firstlook-fail', { detail: { pid } })); } catch {}
    toast(T(idea ? 'The first preview did not finish. Your project is saved; try again from the dashboard.' : 'The preview could not open. Try again in a moment.'), 'err');
    try { console.warn('first preview', e); } catch {}
  }
  async function start({ pid, idea, name }) {
    idea = String(idea || '').trim(); if (!pid || !idea) return;
    const my = ++seq; making(name, idea);
    const t0 = Date.now();
    try {
      const r = await make(pid, idea, name);
      const wait = 600 - (Date.now() - t0); if (wait > 0) await new Promise(res => setTimeout(res, wait));   // the "Making…" state never just flickers
      if (my === seq) show(r);
    } catch (e) { if (my === seq) fail(pid, idea, e); }
  }
  function last(pid) { try { return JSON.parse(ls.get(KEY(pid)) || 'null'); } catch { return null; } }
  // the first preview again, as it is now (later edits included): read what was saved, never make it again
  async function open(pid, kind) {
    let r = last(pid);
    if (kind && (!r || r.kind !== kind)) { const p = root.TribeProjects && root.TribeProjects.list ? root.TribeProjects.list().find(x => x.id === pid) : null; r = { pid, kind, name: (p && p.name) || 'Preview', idea: '', sure: true, label: '' }; }
    if (!r) return false;
    making(r.name, r.idea);
    try {
      let out = null;
      if (r.kind === 'site') { const d = await C().api(`/projects/${enc(pid)}/site-config`); if (d && d.config) out = { html: root.TribeSiteCfg.render(d.config, { mode: 'single', fonts: await fontsOf(d.config) }), saved: true }; }
      else if (r.kind === 'app') { const d = await C().api(`/projects/${enc(pid)}/app-config`); if (d && d.config) out = { ...(await appHtml(d.config)), saved: true }; }
      else { const info = await C().api('/preview/token', { method: 'POST', project: pid }); if (info && info.path) out = { url: new URL(info.path.replace(/\/?$/, '/'), C().base ? C().base() + '/' : location.href).href, saved: true }; }
      if (!out && r.idea) out = await make(pid, r.idea, r.name, r.kind);
      if (!out) throw new Error('nothing saved yet');
      show({ ...r, ...out });
    } catch (e) { fail(pid, r.idea, e); }
    return true;
  }
  const failed = pid => ls.get(FAIL(pid)) || '';
  async function retry(pid) { const idea = failed(pid); if (!idea) return; const p = root.TribeProjects && root.TribeProjects.cur ? root.TribeProjects.cur() : null; return start({ pid, idea, name: (p && p.name) || 'My project' }); }
  return { ...PURE, start, open, last, failed, retry, close, state: () => cur };
});
