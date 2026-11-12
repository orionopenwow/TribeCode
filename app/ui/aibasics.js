// "Basic features, supercharged by AI" (docs/DESIGN-SYSTEM.md §11). A quiet ✦ sits where you already are and does the
// everyday job in one tap. With no AI it answers at once from rules (app/ui/aibasics-core.js); with the tribe's AI on
// (server/aibasics.js → server/llm.js) the same answer is refined in place and says who refined it. No new screens.
//   Chat header      ✦ Summarize the thread · Turn it into tasks
//   Each task        ✦ Split into steps · Estimate · Suggest an owner
//   Docs and notes   ✦ Tidy · Outline · Continue
//   Files            ✦ Describe and tag
//   Company seat     ✦ Fill in the charter
//   Home             ✦ Today's plan (Flint's card on the Dashboard, app/ui/flintgrow.js)
// The ✦ buttons are added to those places from here (a MutationObserver), so the feature files stay as they are.
//   window.TribeAIBasics = { run(kind, ctx, anchor), online(), ask(kind, input, draft) -> { text, via } | null, scan() }
(function () {
  'use strict';
  const C = () => window.TribeClient, core = () => window.TribeAICore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const connected = () => !!(C() && C().connected && C().connected());
  const md = s => (window.TribeMD && window.TribeMD.render ? window.TribeMD.render(String(s || '')) : `<p>${esc(s).replace(/\n/g, '<br>')}</p>`);
  const members = () => ((C() && C().state().members) || []);
  const nameOf = id => (members().find(m => m.id === id) || {}).name || (id === 'tribecode' ? 'TribeCode' : 'someone');

  // ---------- is there an AI to refine with? ----------
  // polish: the tribe's AI (the host's model, server/aibasics.js) first; with none (or no server, or a cloud model you
  // haven't allowed), the in-browser model (Flint's brain "Built in", app/ui/brainpick.js) when you picked it or it is
  // already loaded; otherwise the basic answer stands.
  let ai = { online: false, via: '', at: 0 };
  const B = () => window.TribeBrain;
  const browserOn = () => { const b = B(); return !!(b && b.askBrowser && ((b.browserReady && b.browserReady()) || (b.choice && b.choice() === 'browser'))); };
  async function online() {
    if (!(connected() && Date.now() - ai.at < 30000)) {
      if (!connected()) ai = { online: false, via: '', at: Date.now() };
      else try { const r = await C().api('/ai/basic'); ai = { online: !!r.online, via: r.via || '', cloud: !!r.cloud, provider: r.provider || '', at: Date.now() }; } catch { ai = { online: false, via: '', at: Date.now() }; }
    }
    if (ai.online) return ai;
    return browserOn() ? { online: true, via: 'the built-in model', browser: true } : ai;
  }
  window.addEventListener('tribe-brain', () => { ai.at = 0; });
  // The one AI path for every ✦ (and the design canvas's ✦ on files kept on this device): -> { text, via } | null
  async function ask(kind, input, draft) {
    const st = await online();
    if (st.online && !st.browser) {
      const okCloud = !st.cloud || !window.TribeAIConsent || await window.TribeAIConsent.ensure(st);   // asked once per provider (aiconsent.js)
      if (okCloud) {
        try { const r = await C().api('/ai/refine', { method: 'POST', body: { kind, input, draft: draft == null ? '' : typeof draft === 'string' ? draft : JSON.stringify(draft) } }); if (r && r.text) return { text: r.text, via: r.via || st.via }; } catch {}
      }
    }
    if (browserOn() && core() && core().promptFor) {
      try {
        const r = await B().askBrowser([{ role: 'system', content: core().SYSTEM }, { role: 'user', content: core().promptFor(kind, input, draft) }], () => {});
        if (r && r.text) return { text: r.text, via: r.via || 'the built-in model' };
      } catch {}
    }
    return null;
  }

  // ---------- the popover: a menu, then the answer in the same place ----------
  let pop = null, popAnchor = null;
  function closePop() { if (pop) pop.remove(); pop = null; if (popAnchor) popAnchor.setAttribute('aria-expanded', 'false'); popAnchor = null; }
  function place(el, anchor) {
    const phone = matchMedia('(max-width: 820px)').matches; el.classList.toggle('sheet', phone);
    if (phone) return;
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    el.style.top = (r.bottom + 6 + h < innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  }
  function openPop(anchor, html) {
    closePop(); popAnchor = anchor; anchor.setAttribute('aria-expanded', 'true');
    pop = document.createElement('div'); pop.className = 'ab-pop'; pop.id = 'ab-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '✦ Quick help');
    pop.innerHTML = html; document.body.appendChild(pop); place(pop, anchor);
    const f = pop.querySelector('button'); if (f) f.focus({ preventScroll: true });
    return pop;
  }
  const inConsent = e => !!(e.target && e.target.closest && e.target.closest('#ai-consent'));   // the cloud AI question sits over the card
  addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target)) && !inConsent(e)) closePop(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && pop && !document.getElementById('ai-consent')) { const a = popAnchor; closePop(); if (a) a.focus(); } }, true);

  const MENUS = {
    chat: [['chat.summary', 'Summarize the thread'], ['chat.tasks', 'Turn it into tasks']],
    task: [['task.split', 'Split into steps'], ['task.estimate', 'Estimate it'], ['task.owner', 'Suggest an owner']],
    doc: [['doc.tidy', 'Tidy it up'], ['doc.outline', 'Outline'], ['doc.continue', 'Continue writing']],
    note: [['doc.tidy', 'Tidy it up'], ['doc.outline', 'Outline'], ['doc.continue', 'Continue writing']],
    files: [['file.describe', 'Describe and tag these files']],
    seat: [['seat.charter', 'Fill in the charter']],
  };
  const TITLE = { 'chat.summary': 'Summary', 'chat.tasks': 'Things to do', 'task.split': 'Steps', 'task.estimate': 'Estimate', 'task.owner': 'Who could own it', 'doc.tidy': 'Tidied', 'doc.outline': 'Outline', 'doc.continue': 'What comes next', 'file.describe': 'Descriptions and tags', 'seat.charter': 'A charter for this seat', 'home.plan': 'Today\'s plan' };
  function menu(anchor, where, ctx) {
    const items = MENUS[where] || []; if (items.length === 1) return run(items[0][0], ctx, anchor);
    const p = openPop(anchor, `<div class="ab-menu" role="menu">${items.map(([k, l]) => `<button type="button" role="menuitem" data-ab-do="${k}"><span class="ab-star" aria-hidden="true">✦</span>${esc(l)}</button>`).join('')}</div>`);
    p.querySelectorAll('[data-ab-do]').forEach(b => b.onclick = () => run(b.dataset.abDo, ctx, anchor));
  }

  // ---------- each kind: gather -> basic answer -> view -> apply ----------
  const K = {
    'chat.summary': { input: c => c.msgs, basic: c => core().summarize(c.msgs), show: r => `<ul class="ab-list">${(r.lines || String(r.text || r).split('\n')).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`, refined: (t) => ({ lines: t.split('\n').map(x => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean) }),
      acts: (r, c) => [['Copy', () => copy((r.lines || []).join('\n'))], ...(connected() ? [['Save as a note', () => saveNote('Chat summary', (r.lines || []).join('\n'))]] : [])] },
    'chat.tasks': { input: c => c.msgs, basic: c => core().toTasks(c.msgs, { members: members() }),
      show: r => r.length ? `<div class="ab-checks">${r.map((t, i) => `<label class="ab-check"><input type="checkbox" checked data-i="${i}"><span>${esc(t.title)}${t.assignee ? ` <em>· ${esc(nameOf(t.assignee))}</em>` : ''}${t.due ? ` <em>· ${esc(t.due)}</em>` : ''}</span></label>`).join('')}</div>` : '<p class="faint">Nothing that reads like a to-do yet. Try “we should …” or “can someone …”.</p>',
      refined: (t, c) => (core().parse('chat.tasks', t) || []).map(x => { const m = /\(([^)]+)\)\s*$/.exec(x); const who = m && members().find(p => p.name.toLowerCase().startsWith(m[1].toLowerCase().split(' ')[0])); return { title: x.replace(/\s*\([^)]*\)\s*$/, ''), ...(who ? { assignee: who.id } : {}) }; }),
      acts: (r, c, el) => r.length && connected() ? [[`Add ${r.length === 1 ? 'it' : 'these'} to Tasks`, async () => { const pick = [...el.querySelectorAll('.ab-check input')].filter(x => x.checked).map(x => r[+x.dataset.i]); let n = 0; for (const t of pick) { try { await C().api('/tasks', { method: 'POST', body: { title: t.title, ...(t.assignee ? { assignee: t.assignee } : {}), ...(t.due ? { due: t.due } : {}) } }); n++; } catch {} } toast(`Added ${n} task${n === 1 ? '' : 's'}`); closePop(); }, true]] : [] },
    'task.split': { input: c => ({ title: c.task.title, notes: c.task.notes || '' }), basic: c => core().splitTask(c.task), show: r => `<ol class="ab-list">${r.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`, refined: t => core().parse('task.split', t),
      acts: (r, c) => connected() ? [['Add as a checklist', async () => { const have = (c.task.subtasks || []); try { await C().api('/tasks/' + encodeURIComponent(c.task.id), { method: 'PATCH', body: { subtasks: [...have, ...r.map(t => ({ t, done: false }))].slice(0, 30) } }); toast('Added the steps as a checklist'); closePop(); } catch (e) { toast(e.message); } }, true]] : [] },
    'task.estimate': { input: c => ({ title: c.task.title, notes: c.task.notes || '', steps: (c.task.subtasks || []).length }), basic: c => core().estimate(c.task), show: r => `<p class="ab-big"><b>${esc(r.size)}</b> · ${esc(r.hours)}</p><p class="faint">Because ${esc(r.why)}.</p>`, refined: t => core().parse('task.estimate', t),
      acts: (r, c) => connected() ? [[`Label it “est ${r.size}”`, async () => { const labels = (c.task.labels || []).filter(l => !/^est /.test(l)); try { await C().api('/tasks/' + encodeURIComponent(c.task.id), { method: 'PATCH', body: { labels: [...labels, 'est ' + r.size.toLowerCase()] } }); toast('Labelled'); closePop(); } catch (e) { toast(e.message); } }, true]] : [] },
    'task.owner': { input: c => ({ task: c.task.title, people: members().filter(m => m.role !== 'spectator').map(m => `${m.name}${m.role === 'agent' ? ' (AI helper)' : ''}: ${c.tasks.filter(t => t.assignee === m.id).slice(0, 6).map(t => t.title).join('; ') || 'no tasks yet'}`) }),
      basic: c => core().suggestOwner(c.task, { members: members(), tasks: c.tasks, me: (C().state().me || {}).id }),
      show: r => r ? `<p class="ab-big"><b>${esc(r.name)}</b></p><p class="faint">${esc(r.why)}.</p>` : '<p class="faint">Nobody to suggest yet: invite a friend or connect an AI helper.</p>',
      refined: (t, c, prev) => { const n = core().parse('task.owner', t), m = n && members().find(p => n.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])); const why = (/why\s*:\s*(.+)/i.exec(t) || [])[1]; return m ? { id: m.id, name: m.name, why: why || prev.why } : null; },
      acts: (r, c) => r && connected() ? [[`Assign ${r.name.split(' ')[0]}`, async () => { try { await C().api('/tasks/' + encodeURIComponent(c.task.id), { method: 'PATCH', body: { assignee: r.id } }); toast(`Assigned to ${r.name}`); closePop(); } catch (e) { toast(e.message); } }, true]] : [] },
    'doc.tidy': { input: c => c.text, basic: c => core().tidy(c.text), show: r => `<div class="ab-md md">${md(r)}</div>`, refined: t => t.replace(/^```[a-z]*\n|\n```$/g, ''), acts: (r, c) => [['Replace the text', () => { c.set(r); toast('Tidied'); closePop(); }, true], ['Copy', () => copy(r)]] },
    'doc.outline': { input: c => c.text, basic: c => core().outline(c.text), show: r => `<div class="ab-md md">${md(r)}</div>`, refined: t => t, acts: (r, c) => [['Put it at the top', () => { c.set(`## Outline\n\n${r}\n\n${c.text}`); closePop(); }, true], ['Copy', () => copy(r)]] },
    'doc.continue': { input: c => c.text.slice(-4000), basic: c => core().continueDoc(c.text, c.title), show: r => `<pre class="ab-pre">${esc(r.trim() || '(a new list item)')}</pre>`, refined: t => '\n\n' + t.trim(), acts: (r, c) => [['Add it to the end', () => { c.set(c.text.replace(/\s+$/, '') + r); closePop(); }, true]] },
    'file.describe': { input: c => c.files.map(f => `${f.name}${f.size ? ` (${f.size} bytes)` : ''}${f.kind ? ` [${f.kind}]` : ''}`).join('\n'), basic: c => c.files.map(f => ({ key: f.key, name: f.name, ...core().describeFile(f) })),
      show: r => r.length ? `<div class="ab-files">${r.map(f => `<div class="ab-file"><b>${esc(f.name)}</b><span>${esc(f.description)}</span><span class="ab-tags">${f.tags.map(t => `<i>#${esc(t)}</i>`).join('')}</span></div>`).join('')}</div>` : '<p class="faint">No files here yet.</p>',
      refined: null, acts: (r, c) => r.length && connected() ? [['Save the tags', async () => { let n = 0; for (const f of r) { try { await C().api('/ai/tags', { method: 'PUT', body: { project: c.project || 'local', key: f.key, description: f.description, tags: f.tags } }); n++; } catch {} } toast(`Tagged ${n} file${n === 1 ? '' : 's'}`); closePop(); }, true]] : [] },
    'seat.charter': { input: c => ({ seat: c.seat.title, project: c.project }), basic: c => core().seatCharter(c.seat, c.project),
      show: r => `<dl class="ab-dl"><dt>Goal</dt><dd>${esc(r.goal)}</dd><dt>Owns</dt><dd>${esc(r.owns.join(', '))}</dd><dt>May do</dt><dd>${esc(r.mayDo.join(', '))}</dd><dt>Needs a yes</dt><dd>${esc(r.needsApproval.join(', '))}</dd><dt>Done means</dt><dd>${esc(r.done)}</dd></dl>`,
      refined: t => core().parse('seat.charter', t), acts: (r, c) => [['Fill it in', () => { c.fill(r); toast('Filled in: check it, then Save'); closePop(); }, true]] },
  };
  function copy(t) { try { navigator.clipboard.writeText(t); toast('Copied'); } catch { window.prompt('Copy this:', t); } }
  async function saveNote(title, body) { try { if (window.TribeDocs && window.TribeDocs.create) { await window.TribeDocs.create(title, `# ${title}\n\n${body}\n`); toast('Saved to Files'); closePop(); } } catch (e) { toast(e.message); } }

  async function run(kind, ctx, anchor) {
    const k = K[kind]; if (!k || !core()) return null;
    ctx = typeof ctx === 'function' ? await ctx() : ctx; if (!ctx) return null;
    let res = k.basic(ctx), via = '';
    const p = openPop(anchor, `<div class="ab-res" data-kind="${esc(kind)}"><div class="ab-h"><span class="ab-star" aria-hidden="true">✦</span><b>${esc(TITLE[kind] || '')}</b><span class="ab-via" id="ab-via">Basic · no AI</span></div><div class="ab-out" id="ab-out"></div><div class="ab-acts" id="ab-acts"></div></div>`);
    const paint = () => {
      if (!pop || pop !== p) return;
      p.querySelector('#ab-out').innerHTML = k.show(res, ctx);
      const acts = k.acts(res, ctx, p), box = p.querySelector('#ab-acts');
      box.innerHTML = acts.map(([l, , main], i) => `<button type="button" class="btn sm ${main ? 'primary' : ''}" data-ab-apply="${i}">${esc(l)}</button>`).join('');
      box.querySelectorAll('[data-ab-apply]').forEach(b => b.onclick = () => acts[+b.dataset.abApply][1]());
      place(p, anchor);
    };
    paint();
    const st = k.refined ? await online() : { online: false };
    const v = p.querySelector('#ab-via');
    if (!st.online) { if (v) v.title = 'Works with no AI. Turn on Flint\'s brain and this gets smarter in the same place.'; return res; }
    if (v) { v.textContent = `✦ refining with ${st.via || 'AI'}…`; v.classList.add('busy'); }
    try {
      const r = await ask(kind, k.input(ctx), typeof res === 'string' ? res : JSON.stringify(res));
      const better = r && r.text ? k.refined(r.text, ctx, res) : null;
      if (better && (!Array.isArray(better) || better.length)) { res = better; via = r.via; }
    } catch {}
    if (pop === p) { paint(); const v2 = p.querySelector('#ab-via'); if (v2) { v2.classList.remove('busy'); v2.textContent = via ? `✦ via ${via}` : 'Basic · the AI had nothing to add'; v2.classList.toggle('ai', !!via); } }
    return res;
  }

  // ---------- where the ✦ go ----------
  const spark = (where, label) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ab-spark'; b.dataset.ab = where; b.title = label; b.setAttribute('aria-label', label); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.innerHTML = '<span aria-hidden="true">✦</span>'; return b; };
  const chatCtx = () => {
    const msgs = [...document.querySelectorAll('#chat-list .msg')].filter(m => !m.classList.contains('sys')).map(m => ({ who: nameOf(m.dataset.by), text: [...m.querySelectorAll('.mb > p, .mb .txt, .mb > .md')].map(p => p.innerText).join('\n').trim(), at: m.dataset.at })).filter(m => m.text);
    return { msgs };
  };
  async function taskCtx(id) { let tasks = []; try { tasks = (await C().api('/tasks')).tasks || []; } catch {} const task = tasks.find(t => t.id === id); if (!task) { toast('That task is gone.'); return null; } return { task, tasks }; }
  function docCtx(root) {
    const ta = root.querySelector('#doc-body') || root.querySelector('#note-text'); if (!ta) return null;
    const title = (root.querySelector('#dl-name') || root.querySelector('#note-title') || {}).value || '';
    return { text: ta.value || '', title, set: v => { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); } };
  }
  function filesCtx(root) {
    const files = [...root.querySelectorAll('.dc-card[data-up], .dc-card[data-gdoc], .fg-card[data-slug]')].slice(0, 30).map(c => {
      const name = (c.querySelector('.dc-tt b, .fg-name') || {}).textContent || c.title || 'file', type = c.dataset.type || '';
      const k = /k-(\w+)/.exec(c.className); return { key: c.dataset.up || c.dataset.gdoc || c.dataset.slug, name: /\.[a-z0-9]{2,5}$/i.test(name) ? name : name + ({ sheet: '.csv', deck: '.pptx', image: '.png', code: '.js' }[type] || (c.dataset.gdoc || c.dataset.slug ? '.md' : '')), kind: k ? k[1] : '' };
    });
    return { files, project: (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || 'local' };
  }
  function seatCtx(body) {
    const title = (body.querySelector('#cs-title') || {}).value || (body.querySelector('.co-sh-h h2') || {}).textContent || '';
    const p = ((C() && C().state().projects) || []).find(x => x.id === (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current())) || {};
    const chip = (id, vals) => { const box = body.querySelector('#' + id), inp = box && box.querySelector('.co-tag-in'); if (!inp) return; for (const v of vals) { inp.value = v; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } };
    return { seat: { title }, project: { name: p.name || 'the project', bio: p.bio || '' }, fill: r => { const g = body.querySelector('#cs-goal'), d = body.querySelector('#cs-done'); if (g) g.value = r.goal; if (d) d.value = r.done; chip('cs-may', r.mayDo); chip('cs-ask', r.needsApproval); chip('cs-owns', r.owns); } };
  }
  function scan() {
    const head = document.querySelector('#chat-head .cb-acts');
    if (head && !head.querySelector('[data-ab="chat"]')) { const b = spark('chat', '✦ Summarize or turn into tasks'); b.classList.add('cb-btn'); b.onclick = () => menu(b, 'chat', chatCtx); head.prepend(b); }
    document.querySelectorAll('#board .task[data-id]').forEach(row => { if (row.querySelector(':scope > [data-ab="task"]')) return; const id = row.dataset.id, b = spark('task', '✦ Split, estimate or suggest an owner'); b.classList.add('ab-corner'); b.draggable = false; b.onclick = e => { e.stopPropagation(); menu(b, 'task', () => taskCtx(id)); }; b.addEventListener('keydown', e => e.stopPropagation()); b.addEventListener('pointerdown', e => e.stopPropagation()); row.appendChild(b); });   // in the row's top-right corner: it never moves the row's own buttons
    const dt = document.querySelector('#view-docs .doc-toolbar');
    if (dt && document.querySelector('#doc-body') && !dt.querySelector('[data-ab="doc"]')) { const b = spark('doc', '✦ Tidy, outline or continue'); b.onclick = () => menu(b, 'doc', () => docCtx(document.querySelector('#view-docs'))); dt.appendChild(b); }
    const na = document.querySelector('.note-ed .ne-acts');
    if (na && document.querySelector('#note-text') && !na.querySelector('[data-ab="note"]')) { const b = spark('note', '✦ Tidy, outline or continue'); b.classList.add('ne-btn'); b.onclick = () => menu(b, 'note', () => docCtx(document.querySelector('.note-ed'))); na.prepend(b); }
    document.querySelectorAll('.dc-bar, .fg-top').forEach(bar => { if (bar.querySelector('[data-ab="files"]')) return; const b = spark('files', '✦ Describe and tag these files'); b.innerHTML = '<span aria-hidden="true">✦</span><span class="ab-l">Describe & tag</span>'; b.classList.add('wide'); b.onclick = () => run('file.describe', () => filesCtx(bar.closest('.hub, .fg, #view-docs') || document), b); bar.appendChild(b); });
    const sb = document.querySelector('.co-sheet .co-sh-body, .co-sh-body');
    if (sb && sb.querySelector('#cs-goal') && !sb.querySelector('[data-ab="seat"]')) { const row = document.createElement('div'); row.className = 'ab-row'; const b = spark('seat', '✦ Fill in the charter'); b.innerHTML = '<span aria-hidden="true">✦</span><span class="ab-l">Fill in the charter</span>'; b.classList.add('wide'); b.onclick = () => run('seat.charter', () => seatCtx(sb), b); row.appendChild(b); sb.prepend(row); }
  }
  // No MutationObserver on the whole page (it made typing in a 20k-word doc slow): a light poll while the tab is visible,
  // plus a scan right after clicks and key presses that usually open one of these places.
  let pend = 0; const soon = () => { if (!pend) pend = setTimeout(() => { pend = 0; try { scan(); } catch {} }, 60); };
  setInterval(() => { if (document.visibilityState === 'visible') soon(); }, 700);
  addEventListener('click', soon, true); addEventListener('hashchange', soon);
  scan();
  window.TribeAIBasics = { run, online, ask, scan, menu, close: closePop };
})();
