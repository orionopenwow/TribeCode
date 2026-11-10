// v0.27 company: the Academy view (server/academy.js). Three tabs: Learn (the Role Academy: your seat's track as the hero,
// every track as a card, a reading-layout lesson reader with Back/Next, a progress ring and badges), Legal (app/ui/legal.js)
// and Offload (app/ui/offload.js). Educational, not legal or financial advice.
// window.TribeAcademy = { open({ tab, track, lesson, template, task }), mount(el, seatKind), flint(text), run(action) }
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const NAME = 'academy';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => A() && A().toast && A().toast(t);
  const api = (p, o) => C().api(p, o);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const human = () => { const m = (C() && C().state && C().state().me) || {}; return m.role && m.role !== 'agent'; };
  let open = false, st = { ov: null, tab: 'learn', track: null, lesson: -1, opts: {} };
  const cache = new Map();   // track id -> full track

  // ---------- data ----------
  async function overview(force) { if (!st.ov || force) { try { st.ov = await api('/academy'); } catch (e) { toast(e.message); st.ov = st.ov || { tracks: [], badges: [], progress: {} }; } } return st.ov; }
  async function track(id) { if (!cache.has(id)) cache.set(id, (await api('/academy/' + encodeURIComponent(id))).track); return cache.get(id); }
  const prog = id => ((st.ov && st.ov.progress) || {})[id] || { done: [] };
  async function mark(t, l) {
    if (!human()) return;
    try { const r = await api('/academy/progress', { method: 'POST', body: { track: t.id, lesson: l.id } });
      const before = (st.ov.badges || []).map(b => b.id); st.ov.progress = r.progress; st.ov.badges = r.badges;
      const s = st.ov.tracks.find(x => x.id === t.id); if (s) Object.assign(s, r.track);
      const fresh = r.badges.find(b => !before.includes(b.id) && /-grad$|all-rounder/.test(b.id)); if (fresh) toast(`${fresh.emoji} Badge: ${fresh.title}`);
    } catch (e) { toast(e.message); }
  }

  // ---------- "Try it in your tribe": real TribeCode actions ----------
  const dests = () => ((window.TribeShell && window.TribeShell.dests && window.TribeShell.dests()) || []).map(d => d.key);
  const go = k => { if (window.TribeShell && window.TribeShell.go && dests().includes(k)) { window.TribeShell.go(k); return true; } return false; };
  function run(action) {
    const [k, arg] = String(action || '').split(':');
    if (k === 'legal') return show({ tab: 'legal', template: arg || null });
    if (k === 'offload') return show({ tab: 'offload', task: arg || null });
    if (['company', 'goal', 'seat', 'money'].includes(k)) {   // Company mode (Agent A / the Money view) when it is here
      const CO = window.TribeCompany;
      if (k === 'money' && (go('money') || (window.TribeMoney && window.TribeMoney.open && (window.TribeMoney.open(), true)))) return;
      if (CO && CO.open) return CO.open({ focus: k });
      if (go('company')) return;
      return toast('Company mode isn\'t on here yet. Turn it on for this project, then try again.');
    }
    if (k === 'task') { if (window.TribeProjects && window.TribeProjects.step) return window.TribeProjects.step('newtask'); return go('ws-tasks'); }
    if (k === 'vision') { if (window.TribeProjects && window.TribeProjects.step) return window.TribeProjects.step('vision'); return go('home'); }
    if (k === 'doc') { go('docs'); return toast('Files is open: tap New to start the doc.'); }
    const MAP = { files: 'docs', tasks: 'ws-tasks', agents: 'ws-agents', approvals: 'requests', home: 'home', website: 'website', calendar: 'calendar', repo: 'repo', captures: 'captures', bugs: 'bugs', settings: 'settings', chat: 'chat', invite: 'invite' };
    if (k === 'approvals' && !dests().includes('requests')) return go('updates');
    if (MAP[k] && go(MAP[k])) return;
    if (k === 'approvals' && A() && A().show) return A().show('requests');
    toast('That place isn\'t available here.');
  }

  // ---------- the view (beside app.js views, like captures.js) ----------
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden ac-view'; s.setAttribute('aria-label', 'Academy'); main.appendChild(s); }
    return s;
  }
  function show(opts = {}) {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden'); document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    try { C().sendActivity && C().sendActivity('Academy'); } catch {}
    st.tab = opts.tab || 'learn'; st.opts = opts;
    if (opts.track !== undefined) { st.track = opts.track; st.lesson = opts.lesson !== undefined ? opts.lesson : -1; }
    else if (!opts.tab) { st.track = null; st.lesson = -1; }
    frame(); body();
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  const TABS = [['learn', 'Learn'], ['legal', 'Legal'], ['offload', 'Offload']];
  function frame() {
    const sec = section();
    sec.innerHTML = `<div class="ac-wrap">
      <div class="ac-top"><div class="sec-head"><span class="eyebrow">Academy</span><h2>${st.tab === 'legal' ? 'Legal documents' : st.tab === 'offload' ? 'Do it for free elsewhere' : 'Learn every role'}</h2></div>
        <div class="ac-tabs" id="ac-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${st.tab === k}" class="${st.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div id="ac-body" data-title></div></div>`;
    sec.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.opts = {}; st.tab = b.dataset.tab; if (st.tab === 'learn') { st.track = null; st.lesson = -1; } frame(); body(); });
  }
  async function body() {
    const el = $('#ac-body'); if (!el) return;
    if (st.tab === 'legal') return window.TribeLegal ? window.TribeLegal.mount(el, { template: st.opts.template }) : (el.textContent = 'Loading…');
    if (st.tab === 'offload') return window.TribeOffload ? window.TribeOffload.mount(el, { task: st.opts.task }) : (el.textContent = 'Loading…');
    el.innerHTML = '<p class="ac-empty">Loading…</p>';
    await overview();
    if (st.track && st.lesson >= 0) return reader(el);
    if (st.track) return trackPage(el);
    home(el);
  }

  // ---------- pieces ----------
  function ring(done, of, color, size = 56) {
    const r = (size - 6) / 2, c = 2 * Math.PI * r, f = of ? done / of : 0;
    return `<svg class="ac-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${done} of ${of} lessons done">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--edge)" stroke-width="4"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${esc(color)}" stroke-width="4" stroke-linecap="${f > 0 ? 'round' : 'butt'}" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ac-ring-t">${Math.round(f * 100)}%</text></svg>`;
  }
  const nextIdx = s => { const d = prog(s.id).done || []; for (let i = 0; i < s.lessons; i++) if (!d.includes(`${s.id}-${i + 1}`)) return i; return 0; };

  function home(el) {
    const ov = st.ov, mine = ov.tracks.find(t => t.id === ov.mine) || ov.tracks[0]; if (!mine) { el.innerHTML = '<p class="ac-empty">No lessons found.</p>'; return; }
    const n = nextIdx(mine), finished = mine.done >= mine.lessons;
    const seatLine = ov.seat && ov.seat.kind ? `Your seat · ${esc(ov.seat.title)}${ov.seat.company ? ' at ' + esc(ov.seat.company) : ''}` : 'Start here';
    const badges = ov.badges || [];
    el.innerHTML = `
      <section class="card ac-hero" id="ac-hero" style="--tc:${esc(mine.color)}" data-track="${esc(mine.id)}">
        <div class="ac-hero-ring">${ring(mine.done, mine.lessons, mine.color, 72)}</div>
        <div class="ac-hero-b">
          <span class="eyebrow">${seatLine}</span>
          <h3>${esc(mine.emoji)} ${esc(mine.title)}</h3>
          <p class="ac-lead">${esc(mine.blurb)}</p>
          <div class="ac-row">
            <button class="btn primary" id="ac-continue">${finished ? 'Review the track' : mine.done ? `Continue · lesson ${n + 1}` : 'Start lesson 1'}</button>
            <button class="btn ghost" id="ac-see">All ${mine.lessons} lessons</button>
            <span class="ac-meta">${mine.done} of ${mine.lessons} done · about ${mine.minutes} min</span>
          </div>
        </div>
      </section>
      ${badges.length ? `<div class="ac-badges" aria-label="Badges">${badges.slice(0, phone() ? 3 : 5).map(b => `<span class="ac-badge" title="${esc(b.title)}">${esc(b.emoji)} ${esc(b.title)}</span>`).join('')}${badges.length > (phone() ? 3 : 5) ? `<span class="ac-badge faint">+${badges.length - (phone() ? 3 : 5)}</span>` : ''}</div>` : ''}
      <div class="sec-head ac-sh"><span class="eyebrow">Tracks</span></div>
      <div class="ac-grid">${ov.tracks.filter(t => t.id !== mine.id).map(t => `
        <button class="ac-card ac-track-card" data-track="${esc(t.id)}" style="--tc:${esc(t.color)}">
          <span class="ac-card-top"><span class="ac-emo" aria-hidden="true">${esc(t.emoji)}</span>${ring(t.done, t.lessons, t.color, 34)}</span>
          <b>${esc(t.title)}</b><small>${esc(t.blurb)}</small>
          <span class="ac-meta">${t.done ? `${t.done} of ${t.lessons} done` : `${t.lessons} lessons · ${t.minutes} min`}</span>
        </button>`).join('')}</div>
      <p class="ac-note">${esc(ov.note || '')}</p>`;
    el.querySelector('#ac-continue').onclick = () => { st.track = mine.id; st.lesson = finished ? 0 : n; body(); };
    el.querySelector('#ac-see').onclick = () => { st.track = mine.id; st.lesson = -1; body(); };
    el.querySelectorAll('.ac-track-card').forEach(b => b.onclick = () => { st.track = b.dataset.track; st.lesson = -1; body(); });
  }

  async function trackPage(el) {
    let t; try { t = await track(st.track); } catch (e) { el.innerHTML = `<p class="ac-empty">${esc(e.message)}</p>`; return; }
    const d = prog(t.id).done || [];
    el.innerHTML = `
      <button class="btn ghost ac-back" id="ac-home">← All tracks</button>
      <section class="card ac-hero ac-thead" style="--tc:${esc(t.color)}">
        <div class="ac-hero-ring">${ring(d.length, t.lessons.length, t.color, 64)}</div>
        <div class="ac-hero-b"><span class="eyebrow">${esc(t.emoji)} Track</span><h3>${esc(t.title)}</h3><p class="ac-lead">${esc(t.blurb)}</p>
          ${t.id === 'legal' ? '<div class="ac-row"><button class="btn primary" id="ac-legal">Draft a document</button></div>' : ''}</div>
      </section>
      <ol class="ac-lessons">${t.lessons.map((l, i) => `<li><button class="ac-lrow ${d.includes(l.id) ? 'done' : ''}" data-i="${i}">
        <span class="ac-num" aria-hidden="true">${d.includes(l.id) ? '✓' : i + 1}</span><span class="ac-lt"><b>${esc(l.title)}</b><small>${l.minutes || 4} min${d.includes(l.id) ? ' · done' : ''}</small></span><span class="ac-chev" aria-hidden="true">›</span></button></li>`).join('')}</ol>
      <details class="ac-fold"><summary><span class="eyebrow">Glossary</span> <small>${t.glossary.length} terms</small></summary>
        <dl class="ac-gloss">${t.glossary.map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd>`).join('')}</dl></details>
      <section class="ac-links"><div class="sec-head"><span class="eyebrow">Further reading · free</span></div>
        ${t.links.map(l => `<a class="ac-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(l.title)}</b><small>${esc(l.by)} · ${esc(l.why)}</small></a>`).join('')}
        <p class="ac-note">Links checked ${esc(new Date((t.links[0] || {}).checked || Date.now()).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }))}. Educational, not legal, financial or tax advice: check your local rules and a professional.</p></section>`;
    el.querySelector('#ac-home').onclick = () => { st.track = null; body(); };
    const lg = el.querySelector('#ac-legal'); if (lg) lg.onclick = () => run('legal');
    el.querySelectorAll('.ac-lrow').forEach(b => b.onclick = () => { st.lesson = +b.dataset.i; body(); });
  }

  async function reader(el) {
    let t; try { t = await track(st.track); } catch (e) { el.innerHTML = `<p class="ac-empty">${esc(e.message)}</p>`; return; }
    const i = Math.max(0, Math.min(st.lesson, t.lessons.length - 1)), l = t.lessons[i], last = i === t.lessons.length - 1;
    const done = (prog(t.id).done || []).includes(l.id);
    el.innerHTML = `
      <button class="btn ghost ac-back" id="ac-up">← ${esc(t.title)}</button>
      <article class="ac-read" style="--tc:${esc(t.color)}">
        <span class="eyebrow">${esc(t.title)} · Lesson ${i + 1} of ${t.lessons.length} · ${l.minutes || 4} min${done ? ' · done' : ''}</span>
        <h1>${esc(l.title)}</h1>
        ${l.body.map(p => `<p>${esc(p)}</p>`).join('')}
        <aside class="card ac-try"><span class="eyebrow">Try it in your tribe</span><b>${esc(l.try.label)}</b><small>${esc(l.try.hint)}</small>
          <button class="btn sm" id="ac-try">Do it</button></aside>
        <nav class="ac-nav"><button class="btn" id="ac-back" ${i === 0 ? 'disabled' : ''}>← Back</button>
          <span class="ac-dots" aria-hidden="true">${t.lessons.map((x, k) => `<i class="${k === i ? 'on' : (prog(t.id).done || []).includes(x.id) ? 'done' : ''}"></i>`).join('')}</span>
          <button class="btn primary" id="ac-next">${last ? 'Finish track' : 'Next →'}</button></nav>
      </article>`;
    el.querySelector('#ac-up').onclick = () => { st.lesson = -1; body(); };
    el.querySelector('#ac-try').onclick = () => run(l.try.do);
    el.querySelector('#ac-back').onclick = () => { st.lesson = i - 1; body(); scrollTop(); };
    el.querySelector('#ac-next').onclick = async () => { await mark(t, l); if (last) { st.lesson = -1; toast(`${t.emoji} You finished ${t.title}.`); } else st.lesson = i + 1; body(); scrollTop(); };
  }
  const scrollTop = () => { const s = section(); if (s) s.scrollTop = 0; };

  // ---------- Agent A's company seat sheet: "Learn this role" (#co-academy-slot) ----------
  async function mount(el, seatKind) {
    if (!el) return;
    const ov = await overview(true), t = ov.tracks.find(x => x.id === seatKind) || ov.tracks.find(x => x.id === 'founder');
    if (!t) { el.innerHTML = ''; return; }
    const n = nextIdx(t), full = await track(t.id).catch(() => null), next = full && full.lessons[n];
    el.innerHTML = `<div class="ac-mini" data-title style="--tc:${esc(t.color)}">${ring(t.done, t.lessons, t.color, 44)}
      <div class="ac-mini-b"><span class="eyebrow">Learn this role</span><b>${esc(t.title)}</b><small>${t.done >= t.lessons ? 'Track finished' : next ? `Next: ${esc(next.title)}` : `${t.lessons} short lessons`}</small></div>
      <div class="ac-mini-a"><button class="btn sm primary" data-ac="lesson">${t.done ? 'Continue' : 'Start'}</button>${t.id === 'legal' ? '<button class="btn sm" data-ac="legal">Draft a document</button>' : ''}</div></div>`;
    el.querySelector('[data-ac="lesson"]').onclick = () => show({ track: t.id, lesson: t.done >= t.lessons ? 0 : n });
    const lg = el.querySelector('[data-ac="legal"]'); if (lg) lg.onclick = () => show({ tab: 'legal' });
  }

  // ---------- Flint: "learn sales", "do this for free", "draft an NDA" ----------
  const ROLE = [[/\b(ceo|chief exec|lead(ing)? (the|a) company|running a company)\b/, 'ceo'], [/\b(cto|tech(nical)?( lead)?|build(ing)?|engineering|coding)\b/, 'cto'], [/\b(design(er|ing)?|ux|ui)\b/, 'design'], [/\b(growth|marketing|seo)\b/, 'growth'], [/\b(sales|selling)\b/, 'sales'], [/\b(support|customer service|customer support)\b/, 'support'], [/\b(ops|operations)\b/, 'ops'], [/\b(finance|money|accounting|bookkeeping|tax(es)?)\b/, 'finance'], [/\b(legal|law|contracts?)\b/, 'legal'], [/\b(founder|startup|business basics|start(ing)? a business|basics)\b/, 'founder']];
  const LEGAL = [[/\bnda|non.?disclosure\b/, 'nda'], [/\b(contractor|freelanc\w*)\b/, 'contractor'], [/\bco.?founder\b/, 'cofounder'], [/\bip assignment|assign(ing)? (the )?ip\b/, 'ip'], [/\bprivacy (policy|notice)\b/, 'privacy'], [/\bterms( of (service|use))?\b|\btos\b/, 'terms'], [/\bcookie\b/, 'cookies'], [/\bservice agreement|statement of work|\bsow\b/, 'service'], [/\bvolunteer\b/, 'volunteer'], [/\brevenue.?share|rev.?share\b/, 'revshare']];
  const TASK = [[/research|competitor|market/, 'research'], [/summar|tl;?dr|long doc/, 'summarize'], [/translat/, 'translate'], [/image|picture|logo|illustration|mood/, 'image'], [/code review|review (my |the |this )?code/, 'codereview'], [/clean|tidy|dedupe|data|spreadsheet|csv/, 'data'], [/copy|write|draft|post|email|newsletter|headline/, 'copy']];
  function flint(raw) {
    const t = String(raw || '').toLowerCase().trim();
    if (/\b(for free|free (ai|model|models|tool|tools)|offload)\b/.test(t)) {
      const k = (TASK.find(([re]) => re.test(t)) || [])[1] || null; show({ tab: 'offload', task: k });
      return { text: `Opened Offload${k ? ' for that' : ''}: pick a free tool, copy the ready prompt (it has the project's name and gist, never keys), then bring the result back into Files or Captures.` };
    }
    let m;
    if ((m = /^(?:please\s+)?(?:draft|write|make|create|start|generate)\s+(?:me\s+|us\s+)?(?:an?\s+|the\s+|our\s+)?(.+)$/.exec(t))) {
      const k = (LEGAL.find(([re]) => re.test(m[1])) || [])[1];
      if (k) { show({ tab: 'legal', template: k }); return { text: 'Opened the template. Fill in the required fields first, watch the preview, then Create doc. It\'s a starting point, not legal advice: have a lawyer where you are review it.' }; }
    }
    if ((m = /^(?:i want to |help me |can you )?(?:learn|teach me|lessons? (?:on|for|about)|how (?:do i|to) (?:be|become|do) (?:a |an |the )?(?:good )?)\s*(?:about\s+)?(?:the\s+)?(.+)$/.exec(t))) {
      const k = (ROLE.find(([re]) => re.test(m[1])) || [])[1];
      if (k) { show({ track: k, lesson: -1 }); return { text: 'Opened that track in the Academy: short lessons, each with something to try in your tribe.' }; }
    }
    return null;
  }

  window.TribeAcademy = { open: show, mount, flint, run };
})();
