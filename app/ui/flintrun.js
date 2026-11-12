// Watch Flint build (feat/flint-runthrough): a scripted run-through where Flint drives the real app with only his normal
// commands, as if a person were making an app, a website and a game in one go, then hands over proof-of-work ZIPs.
//   1 a tribe   2 a project   3 the vision   4 company basics   5 tasks   6 a doc from a template   7 a website from a
//   template   8 an edit to it   9 a small game from the starter   10 a design on the canvas   11 a chat post
//   12 a proposal, approved   13 a standup   14 a local summary   15 the product presentation   16 the proof ZIPs
// Each step types a command into Flint's thread (TribeFlint.ask, the same path a person's typing takes), shows the place
// it changed, and checks the result through the API. A caption narrates every step. It works with no AI at all; when the
// tribe's AI is on, the captions are refined in place (POST /api/ai/refine, kind run.narrate) and say so.
// The ZIPs are built here with the existing store-only ZIP writer (TribeExport.zip) and saved by the host into
// <tribe>/exports/ (server/flintrun.js); the same bytes download in this browser.
//   <project>-proof.zip    README.md · TIMELINE.md · timeline.json · tribe/manifest.json · website/ · game/ · builds/ ·
//                          docs/*.md · design/design.svg · design/design.png · design/canvas.json · chat/transcript.md ·
//                          chat/messages.json · tasks/board.json · tasks/board.md · vision/VISION.md · company/company.json
//                          · proposals/proposals.json · presentation/index.html · presentation/slides.md
//   tribe-<name>-proof.zip README.md · tribe/manifest.json · TIMELINE.md · projects/<project>/… for every project
// Flint commands added here (flint.js special() asks first): "start a tribe called X", "start a project called X",
// "set the vision to: …", "propose: …", "approve the proposal", "run the standup", "change the website headline to …",
// "make the product presentation", "export the proof of work", "make a blender turntable [for model.glb]",
// "watch flint build" / "do a run-through".
//   window.TribeFlintRun = { start(opts), stop(), active(), flint(text), exportProof(opts), _test: { log(), state() } }
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore, F = () => window.TribeFlint, A = () => window.TribeApp;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const txt = s => String(s == null ? '' : s);   // Flint's thread escapes text itself (flint.js linkify)
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'project';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const connected = () => !!(C() && C().connected && C().connected() && C().hasToken && C().hasToken());
  const pid = () => (C() && C().project && C().project()) || '';
  const projects = () => ((window.TribeProjects && window.TribeProjects.list && window.TribeProjects.list()) || []).concat((C() && C().state && C().state().projects) || []);
  const me = () => ((C() && C().state && C().state().me) || {});
  const api = (p, o) => C().api(p, o);
  const toast = m => A() && A().toast && A().toast(m);

  // ---------- Flint's commands for the run-through's steps ----------
  async function newTribe(name) {
    name = String(name || '').trim().slice(0, 48); if (!name) return { text: 'What should the tribe be called?' };
    if (!connected()) {
      let h = {}; try { h = await (await fetch(C().base() + '/api/health')).json(); } catch {}
      if (h.members > 0) return { text: 'This server already has a tribe. Ask its host for an invite link, or run your own TribeCode.', acts: [['Join with a link', 'invite']] };
      const st = S().get(), who = st.name && !/^(me|you)$/i.test(st.name) ? st.name : 'Guest';
      const r = await fetch(C().base() + '/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: who, color: st.color, tribe: name }) }).then(x => x.json().then(j => (x.ok ? j : Promise.reject(new Error(j.error || x.statusText)))));
      S().set({ server: { url: C().base(), token: r.token }, onboarded: true });
      C().connect();
      for (let i = 0; i < 60 && !connected(); i++) await wait(150);
      return { text: `Started the tribe **${txt(name)}** on this computer. You're its host.`, sum: `started the tribe ${name}` };
    }
    if (me().role !== 'host') return { text: `Only the host can rename the tribe. You're in **${txt((C().state().tribe || {}).name || 'this tribe')}**.` };
    await api('/look', { method: 'PUT', body: { tribe: { name } } });
    return { text: `The tribe is called **${txt(name)}** now.`, sum: `named the tribe ${name}` };
  }
  async function newProject(name) {
    name = String(name || '').trim().replace(/[.!]+$/, '').slice(0, 60); if (!name) return { text: 'What should the project be called?' };
    if (!connected()) return { text: 'Projects live in a tribe. Say "start a tribe called …" first.' };
    const have = projects().find(p => p.name.toLowerCase() === name.toLowerCase());
    let p = have; if (!p) p = (await api('/projects', { method: 'POST', body: { name, emoji: '✨' } })).project;
    if (window.TribeProjects && window.TribeProjects.refresh) { try { await window.TribeProjects.refresh(); } catch {} }
    if (pid() !== p.id) { if (window.TribeProjects && window.TribeProjects.switchTo) await window.TribeProjects.switchTo(p.id, 'home'); else await C().switchProject(p.id); }
    for (let i = 0; i < 40 && pid() !== p.id; i++) await wait(100);
    return { text: have ? `Opened **${txt(name)}**.` : `Started the project **${txt(name)}** and opened it.`, sum: `started ${name}` };
  }
  async function setVision(text) {
    text = String(text || '').trim(); if (!text) return { text: 'What is the project about, in a sentence or two?' };
    const p = projects().find(x => x.id === pid()) || {};
    await api('/vision', { method: 'PUT', body: { text: `# ${p.name || 'Our project'}\n\n${text}\n` } });
    return { text: `The vision is written: “${txt(text)}”`, sum: 'wrote the vision' };
  }
  async function propose(title) {
    title = String(title || '').trim().replace(/[.!]+$/, ''); if (!title) return { text: 'What should the tribe vote on?' };
    const r = await api('/proposals', { method: 'POST', body: { title: title.charAt(0).toUpperCase() + title.slice(1), body: `Proposed by ${me().name || 'Flint'} with Flint.\n\n- [ ] ${title}` } });
    last.proposal = r.proposal.id;
    if (r.proposal.status === 'approved') return { text: `Proposed **${txt(r.proposal.title)}**, and it passed right away: you're the only voter, so your yes was enough${r.proposal.milestone ? ` (milestone ${txt(r.proposal.milestone)})` : ''}.`, sum: 'made a proposal' };
    return { text: `Proposed **${txt(r.proposal.title)}**. It needs ${r.proposal.tally ? r.proposal.tally.needed : 'a'} yes vote${r.proposal.tally && r.proposal.tally.needed === 1 ? '' : 's'}.`, sum: 'made a proposal' };
  }
  async function approve(which) {
    const all = ((await api('/proposals')).proposals || []).filter(p => p.status === 'open');
    const q = String(which || '').toLowerCase().trim();
    const p = (q && all.find(x => x.title.toLowerCase().includes(q))) || all.find(x => x.id === last.proposal) || all[all.length - 1];
    if (!p) { const done = ((await api('/proposals')).proposals || []).filter(x => x.status === 'approved').pop(); return { text: done ? `**${txt(done.title)}** is already approved${done.milestone ? ` (milestone ${txt(done.milestone)})` : ''}: with one person in the tribe, the author's yes is enough. ✓` : 'There is no open proposal to approve.' }; }
    const r = await api(`/proposals/${encodeURIComponent(p.id)}/vote`, { method: 'POST', body: { vote: 'yes' } });
    const pr = r.proposal || {};
    return { text: pr.status === 'approved' ? `Approved **${txt(p.title)}**${pr.milestone ? `: it is milestone ${txt(pr.milestone)} now` : ''}. ✓` : `Voted yes on **${txt(p.title)}** (${pr.tally ? `${pr.tally.yes} of ${pr.tally.needed}` : 'counting'}).`, sum: 'approved the proposal' };
  }
  async function standup() {
    if (!connected()) return { text: 'Standups live in a tribe.' };
    const tasks = (await api('/tasks')).tasks || [], st = C().state(), today = new Date().toISOString().slice(0, 10), since = Date.now() - 864e5;
    const people = (st.members || []).filter(m => m.role !== 'spectator' && m.role !== 'agent');
    const line = m => {
      const mine = tasks.filter(t => t.assignee === m.id || (!t.assignee && m.id === me().id));
      const done = mine.filter(t => t.status === 'done' && Date.parse(t.updated || t.created || 0) > since).map(t => t.title);
      const doing = mine.filter(t => t.status === 'doing').map(t => t.title), next = mine.filter(t => t.status === 'backlog' || t.status === 'todo').slice(0, 2).map(t => t.title);
      const blocked = mine.filter(t => t.status !== 'done' && t.due && t.due < today).map(t => `${t.title} (overdue)`);
      return `**${m.name}**: done ${done.length ? done.join(', ') : '—'} · doing ${doing.length ? doing.join(', ') : '—'} · next ${next.length ? next.join(', ') : '—'}${blocked.length ? ` · blocked: ${blocked.join(', ')}` : ''}`;
    };
    const text = `🗓️ **Standup · ${today}**\n${people.map(line).join('\n')}\nBlocked: ${tasks.some(t => t.status !== 'done' && t.due && t.due < today) ? 'see above' : 'nothing'}`;
    await api('/chat/general', { method: 'POST', body: { text } });
    try { await api(`/projects/${encodeURIComponent(pid())}/company/rhythms/run`, { method: 'POST', body: { kind: 'standup' } }); } catch {}   // when it's a company: seat holders get the one-tap standup too
    return { text: `Ran the standup and posted it in chat:\n\n${text}`, sum: 'ran the standup' };
  }
  async function headline(to) {
    to = String(to || '').trim().replace(/^["“']|["”']$/g, ''); if (!to) return { text: 'What should the headline say?' };
    let f; try { f = await api('/code/file?path=index.html'); } catch { f = null; }
    if (!f || !f.text) return { text: 'There is no website page yet. Say "build me a landing page for …" first.' };
    const rx = /(<h1\b[^>]*>)([\s\S]*?)(<\/h1>)/i; if (!rx.test(f.text)) return { text: 'The page has no headline (no <h1>) to change.' };
    const safe = to.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    await api('/code/file', { method: 'PUT', body: { path: 'index.html', text: f.text.replace(rx, `$1${safe}$3`), message: `Flint: headline → “${to.slice(0, 60)}” (via TribeCode)` } });
    if (window.TribePreview && window.TribePreview.refresh) { try { window.TribePreview.refresh(); } catch {} }
    return { text: `Changed the website's headline to “${txt(to)}” and saved it as a version.`, sum: 'edited the website' };
  }
  async function blender(model) {
    if (!connected()) return { text: 'The Blender bridge writes into the tribe folder: start or join a tribe first.' };
    const r = await api('/flint/blender', { method: 'POST', body: { model: model || '', name: (projects().find(x => x.id === pid()) || {}).name || 'turntable' } });
    return { text: `Wrote a Blender turntable script: \`${txt(r.path)}\`. Nothing ran: open it, read it, then run\n\`${txt(r.run)}\`\nIt adds a camera, lights and a floor, spins once around your model and renders PNG frames (and an MP4 when Blender has FFmpeg). Free · no AI.`, sum: 'wrote a Blender turntable script' };
  }
  const last = { proposal: '' };
  const RX = [
    [/^(?:start|create|make|found|set up|new)\s+(?:a\s+|our\s+|my\s+)?(?:new\s+)?tribe\s+(?:called|named)\s+(.+)$/i, m => newTribe(m[1])],
    [/^(?:rename|call|name)\s+(?:the\s+|our\s+|this\s+)?tribe\s+(?:to\s+)?(.+)$/i, m => newTribe(m[1])],
    [/^(?:start|create|make|new|open)\s+(?:a\s+|the\s+|our\s+)?(?:new\s+)?project\s+(?:called|named)\s+(.+)$/i, m => newProject(m[1])],
    [/^(?:set|write|make|update|change)\s+(?:the\s+|our\s+)?(?:project\s+)?vision\s*(?:to|as)?\s*[:\-–]\s*(.+)$/i, m => setVision(m[1])],
    [/^(?:set|change|update)\s+(?:the\s+|our\s+)?(?:project\s+)?vision\s+to\s+(.+)$/i, m => setVision(m[1])],
    [/^(?:propose|make a proposal|put (?:it|this) to a vote|start a vote)\s*(?:to|on|about)?\s*[:\-–]?\s*(.{4,})$/i, m => propose(m[1])],
    [/^(?:approve|accept|vote yes on|say yes to)\s+(?:the\s+|that\s+|this\s+)?(?:proposal|vote|it)(?:\s+(?:called|about|to)\s+(.+))?$/i, m => approve(m[1])],
    [/^(?:run|do|start|post|hold)\s+(?:the\s+|a\s+|our\s+|today'?s\s+)?(?:daily\s+)?stand-?up$/i, () => standup()],
    [/^(?:change|set|make|update)\s+(?:the\s+)?(?:website|site|page|landing page)(?:'s)?\s+(?:headline|title|heading)\s+(?:to|say|read)\s+(.+)$/i, m => headline(m[1])],
    [/^(?:make|build|create|write|prepare|do)\s+(?:the\s+|a\s+)?(?:product\s+)?presentation$|^present\s+(?:the\s+)?(?:product|project|what we built)$/i, () => presentation()],
    [/^(?:export|make|build|zip|package|save)\s+(?:the\s+|our\s+)?(?:proof(?:\s+of\s+work)?|proof zips?|proof-of-work(?:\s+zips?)?)(?:\s+zips?)?$/i, () => exportProof().then(r => ({ text: `Saved the proof of work in the tribe folder:\n${r.saved.map(s => `- \`${txt(s.path || s.name)}\``).join('\n')}`, acts: r.saved.map(s => [`Download ${s.name}`, 'proofdl', s.name]), sum: 'exported the proof' }))],
    [/^(?:make|write|give me|create)\s+(?:a\s+)?(?:blender\s+)?turntable(?:\s+(?:render|script))?(?:\s+(?:for|of)\s+(\S+))?$|^blender\s+turntable(?:\s+(?:for|of)\s+(\S+))?$/i, m => blender(m[1] || m[2])],
    [/^(?:watch flint build|do a run-?through|run the run-?through|show me what you can build|flint run-?through)$/i, () => { setTimeout(() => start(), 50); return { text: 'Starting the run-through: watch the bar at the bottom. Stop it any time.' }; }],
  ];
  async function flint(raw) {
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    for (const [rx, fn] of RX) { const m = rx.exec(text); if (m) { try { return await fn(m); } catch (e) { return { text: `That didn't work: ${txt(e.message)}` }; } } }
    return null;
  }

  // ---------- the product presentation (a deck in Files + one standalone page for the ZIP) ----------
  let lastPresentation = null;
  async function gather() {
    const p = projects().find(x => x.id === pid()) || { name: 'Our project' };
    const [tasks, docs, vision, tree, builds] = await Promise.all([
      api('/tasks').then(r => r.tasks || []).catch(() => []), api('/docs').then(r => r.docs || []).catch(() => []), api('/vision').then(r => r.text || '').catch(() => ''),
      api('/code/tree?path=').then(r => r.entries || []).catch(() => []), api('/code/tree?path=builds').then(r => r.entries || []).catch(() => []),
    ]);
    const nodes = window.TribeCanvas && window.TribeCanvas.state ? (window.TribeCanvas.state().nodes || []) : [];
    return { p, tasks, docs, vision: vision.replace(/^#.*\n+/, '').trim(), site: tree.some(e => e.name === 'index.html'), builds: builds.filter(e => e.type === 'dir').map(e => e.name), frames: nodes.filter(n => !n.p && !n.del).map(n => n.name || 'Frame'), members: (C().state().members || []) };
  }
  function slidesMd(g) {
    const done = g.tasks.filter(t => t.status === 'done'), open = g.tasks.filter(t => t.status !== 'done');
    return [
      `# ${g.p.name}\n\n${g.vision || 'Made with friends in TribeCode.'}\n\nBuilt by Flint for ${(C().state().tribe || {}).name || 'the tribe'}, ${new Date().toLocaleDateString()}`,
      `## What it is\n\n${g.vision || 'A small app, a website and a game, made in one session.'}`,
      `## What we built\n\n${[g.site ? '- **Website** from a template, edited by Flint (index.html)' : '', ...g.builds.map(b => `- **${b}** in builds/${b}/`), g.frames.length ? `- **Design** on the canvas: ${g.frames.slice(0, 3).join(', ')}` : '', g.docs.length ? `- **${g.docs.length} doc${g.docs.length === 1 ? '' : 's'}**: ${g.docs.slice(0, 4).map(d => d.title).join(', ')}` : ''].filter(Boolean).join('\n')}`,
      `## The plan\n\n${open.slice(0, 6).map(t => `- ${t.title}${t.due ? ` (by ${t.due})` : ''}`).join('\n') || '- Everything on the board is done.'}${done.length ? `\n\nDone already: ${done.length}` : ''}`,
      `## The team\n\n${g.members.filter(m => m.role !== 'spectator').map(m => `- ${m.name}${m.role === 'host' ? ' (host)' : m.role === 'agent' ? ' (AI helper)' : ''}`).join('\n')}\n- Flint, the built-in helper (free · no AI)`,
      `## Next\n\n- Play the game and share the site with five friends\n- Turn the open tasks into this week's work\n- Connect an AI helper for the parts that need one`,
    ].join('\n\n---\n\n');
  }
  function pageHtml(g, md) {
    const cs = getComputedStyle(document.body), v = k => cs.getPropertyValue(k).trim();
    const slides = md.split(/\n---\n/).map(s => (window.TribeMD && window.TribeMD.render ? window.TribeMD.render(s.trim()) : `<pre>${esc(s.trim())}</pre>`));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(g.p.name)} · product presentation</title>
<style>:root{--canvas:${v('--canvas') || 'Canvas'};--surface:${v('--surface') || 'Canvas'};--border:${v('--border') || 'GrayText'};--text:${v('--text') || 'CanvasText'};--brand:${v('--brand') || 'LinkText'};--muted:${v('--muted') || 'GrayText'}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:16px/1.6 Inter,system-ui,sans-serif}main{max-width:880px;margin:0 auto;padding:48px 20px}
.eyebrow{font:600 12px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}section{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:32px 36px;margin:0 0 20px;min-height:220px}
h1{font-size:40px;line-height:1.15;margin:.2em 0}h2{font-size:26px;margin:.2em 0 .6em}a{color:var(--brand)}li{margin:.25em 0}footer{color:var(--muted);font-size:13px;margin-top:24px}</style></head>
<body><main><p class="eyebrow">Product presentation · made by Flint in TribeCode</p>${slides.map((s, i) => `<section id="s${i + 1}">${s}</section>`).join('')}
<footer>Proof of work: see README.md and TIMELINE.md next to this folder. Made with TribeCode, free and self-hosted.</footer></main></body></html>`;
  }
  async function presentation() {
    if (!connected()) return { text: 'Presentations live in a tribe.' };
    const g = await gather(), md = slidesMd(g), title = `${g.p.name} · product presentation`;
    const D = window.TribeDocs;
    const doc = D && D.create ? await D.create(title, md, undefined, 'deck') : (await api('/docs', { method: 'POST', body: { title, body: md, kind: 'deck' } })).doc;
    lastPresentation = { md, html: pageHtml(g, md), slug: doc && doc.slug, title };
    if (A() && A().show) { try { A().show('docs'); if (D && D.open && doc) setTimeout(() => D.open(doc.slug), 60); } catch {} }
    return { text: `Made the product presentation: **${txt(title)}** (${md.split('\n---\n').length} slides) in Files. Press Present to show it.`, acts: doc ? [['Open it', 'doc', `${pid()}|${doc.slug}`]] : [], sum: 'made the presentation' };
  }

  // ---------- proof-of-work ZIPs ----------
  const enc = new TextEncoder();
  const b64bytes = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const dataBytes = url => { const i = url.indexOf(','), head = url.slice(0, i), body = url.slice(i + 1); return /;base64/.test(head) ? b64bytes(body) : enc.encode(decodeURIComponent(body)); };
  let design = null;   // { svg, png, json, name } captured while the canvas is open
  async function captureDesign() {
    const CV = window.TribeCanvas, CC = window.TribeCanvasCode; if (!CV || !CC) return null;
    const st = CV.state(); const top = (st.nodes || []).filter(n => !n.p && !n.del && (n.t === 'frame' || n.t === 'component')).sort((a, b) => (b.w * b.h) - (a.w * a.h))[0];
    if (!top) return null;
    try {
      const svg = await CC.exportData(top.id, 'svg'), png = await CC.exportData(top.id, 'png', 1).catch(() => null);
      design = { name: top.name || 'Design', svg: dataBytes(svg.url), png: png ? dataBytes(png.url) : null, json: JSON.stringify({ file: st.file, name: st.name, nodes: st.nodes }, null, 1) };
    } catch { design = null; }
    return design;
  }
  async function collect(project, opts = {}) {
    const o = { project }, out = [], add = (n, d) => out.push([n, typeof d === 'string' ? d : d]);
    const [tasks, docs, chat, vision, proposals, files, company] = await Promise.all([
      api('/tasks', o).then(r => r.tasks || []).catch(() => []), api('/docs', o).then(r => r.docs || []).catch(() => []), api('/chat/general', o).then(r => r.messages || []).catch(() => []),
      api('/vision', o).then(r => r.text || '').catch(() => ''), api('/proposals', o).then(r => r.proposals || []).catch(() => []),
      opts.code === false ? Promise.resolve({ files: [] }) : api('/flint/proof/files?project=' + encodeURIComponent(project), o).catch(() => ({ files: [] })),
      api(`/projects/${encodeURIComponent(project)}/company`, o).then(r => r.company || null).catch(() => null),
    ]);
    const names = new Map(((C().state().members) || []).map(m => [m.id, m.name])); names.set('tribecode', 'TribeCode');
    // code: the website at the top, games and other builds under builds/
    for (const f of files.files || []) {
      const bytes = b64bytes(f.b64), m = /^builds\/([^/]+)\/(.+)$/.exec(f.path);
      if (m) add(/(-2d|-3d|game|platformer)/i.test(m[1]) ? `game/${m[2]}` : `builds/${m[1]}/${m[2]}`, bytes);
      else add(`website/${f.path}`, bytes);
    }
    for (const d of docs) { let body = d.excerpt || ''; try { body = (await api('/docs/' + encodeURIComponent(d.slug), o)).doc.body || body; } catch {} add(`docs/${d.slug}.md`, `# ${d.title}\n\n${body.replace(/^#\s+.*\n+/, '')}`); }
    add('tasks/board.json', JSON.stringify(tasks, null, 1));
    add('tasks/board.md', `# Task board\n\n${['backlog', 'doing', 'review', 'done'].map(s => `## ${s}\n\n${tasks.filter(t => (t.status || 'backlog') === s).map(t => `- ${s === 'done' ? '[x]' : '[ ]'} ${t.title}${t.assignee ? ` (${names.get(t.assignee) || t.assignee})` : ''}${t.due ? ` · due ${t.due}` : ''}`).join('\n') || '- (empty)'}`).join('\n\n')}\n`);
    add('chat/messages.json', JSON.stringify(chat, null, 1));
    add('chat/transcript.md', `# Chat transcript\n\n${chat.map(m => `**${names.get(m.by) || m.by}** · ${String(m.at || '').replace('T', ' ').slice(0, 16)}\n${m.text || ''}\n`).join('\n')}`);
    if (vision) add('vision/VISION.md', vision);
    if (proposals.length) add('proposals/proposals.json', JSON.stringify(proposals, null, 1));
    if (company) add('company/company.json', JSON.stringify(company, null, 1));
    return { entries: out, tasks, docs, chat, files: files.files || [] };
  }
  function timelineMd(log) {
    return `# Timeline\n\n| # | Time | Step | Command | Result |\n|---|---|---|---|---|\n${log.map((l, i) => `| ${i + 1} | ${l.at.slice(11, 19)} (+${(l.ms / 1000).toFixed(1)} s) | ${l.title} | \`${String(l.cmd).replace(/\|/g, '/')}\` | ${l.ok ? '✓' : '✗'} ${String(l.reply || '').replace(/\n+/g, ' ').replace(/\|/g, '/').slice(0, 140)} |`).join('\n')}\n`;
  }
  function readme(kind, ctx) {
    const { tribeName, projectName, log, manifest, counts } = ctx;
    const ok = log.filter(l => l.ok).length;
    return `# What Flint built${projectName ? `: ${projectName}` : ''}

Flint, TribeCode's built-in helper, made this ${kind === 'tribe' ? 'tribe\'s work' : 'project'} by typing his own normal commands into the real app,
one step at a time, ${log.length ? `in ${(log[log.length - 1].ms / 1000).toFixed(0)} seconds (${ok} of ${log.length} steps checked ✓)` : ''}. ${ctx.ai ? `Captions were refined by ${ctx.ai}.` : 'No AI model was used: every step ran on rules, templates and recipes (Free · no AI).'}

- **Tribe:** ${tribeName} (${(manifest.members || []).length} member${(manifest.members || []).length === 1 ? '' : 's'}: ${(manifest.members || []).map(m => `${m.name} (${m.role})`).join(', ')})
- **Projects:** ${(manifest.projects || []).map(p => p.name).join(', ')}
- **Made:** ${counts}
- **Exported:** ${new Date().toISOString()}

## What's in here

${kind === 'tribe' ? '- `tribe/manifest.json`: the tribe, its members and projects\n- `TIMELINE.md`: every step with its time, command and result\n- `projects/<project>/`: each project\'s proof (code, docs, tasks, chat, design, presentation)' : `- \`website/\`: the website, built from a template and edited (open \`website/index.html\`)
- \`game/\`: the game, made from the starter (open \`game/index.html\`)
- \`docs/\`: the docs Flint wrote from templates, and the presentation deck (Markdown)
- \`design/\`: the design from the canvas as \`design.svg\`, \`design.png\` and the raw \`canvas.json\`
- \`chat/\`: the chat \`transcript.md\` and \`messages.json\`
- \`tasks/\`: the task board as \`board.json\` and \`board.md\`
- \`vision/\`, \`company/\`, \`proposals/\`: the vision, the company basics and the approved proposal
- \`presentation/\`: the product presentation (\`index.html\`, \`slides.md\`)
- \`timeline.json\` and \`TIMELINE.md\`: every step with its timestamp, command, Flint's reply and the check
- \`tribe/manifest.json\`: the tribe and its members`}

## The steps

${log.map((l, i) => `${i + 1}. **${l.title}**: \`${l.cmd}\` ${l.ok ? '✓' : '✗'}`).join('\n')}

Made with TribeCode (MIT, self-hosted): https://github.com/orionopenwow/TribeCode
`;
  }
  async function saveZip(blob, name) {
    const tok = ((S().get().server) || {}).token || '';
    const r = await fetch(`${C().base()}/api/flint/proof/save?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/zip', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: blob });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  const blobs = {};
  async function exportProof(opts = {}) {
    if (!connected()) throw new Error('The proof lives in a tribe: start or join one first.');
    if (!window.TribeExport || !window.TribeExport.zip) throw new Error('The exporter is not loaded.');
    const manifest = await api('/flint/proof/manifest'), tribeName = manifest.tribe.name, cur = pid();
    const project = (manifest.projects || []).find(p => p.id === cur) || (manifest.projects || [])[0] || { id: cur, name: 'project' };
    const log = (opts.log || run.log || []).slice(), ai = run.ai || '';
    const cur0 = plan[run.i];   // the export step itself is still running: it is in the timeline as the step that wrote these ZIPs
    if (run.on && cur0 && cur0.id === 'proof' && !log.some(l => l.id === 'proof')) log.push({ i: run.i + 1, id: 'proof', title: cur0.title, caption: cur0.capShown || cur0.cap, cmd: cur0.cmd, at: new Date().toISOString(), ms: Date.now() - run.t0, ok: true, reply: 'These ZIPs.', tier: 'free · no AI' });
    if (!design && window.TribeCanvas && window.TribeCanvas.state && window.TribeCanvas.state().open) await captureDesign();
    const one = await collect(project.id);
    const files = one.entries.slice();
    if (design) { files.push(['design/design.svg', design.svg], ['design/canvas.json', design.json]); if (design.png) files.push(['design/design.png', design.png]); }
    if (!lastPresentation) { try { const g = await gather(), md = slidesMd(g); lastPresentation = { md, html: pageHtml(g, md) }; } catch {} }
    if (lastPresentation) files.push(['presentation/index.html', lastPresentation.html], ['presentation/slides.md', lastPresentation.md]);
    files.push(['tribe/manifest.json', JSON.stringify(manifest, null, 1)], ['timeline.json', JSON.stringify({ tribe: tribeName, project: project.name, started: log[0] && log[0].at, steps: log }, null, 1)], ['TIMELINE.md', timelineMd(log)]);
    const counts = `${one.files.length} code files, ${one.docs.length} docs, ${one.tasks.length} tasks, ${one.chat.length} chat messages${design ? ', 1 design' : ''}`;
    files.unshift(['README.md', readme('project', { tribeName, projectName: project.name, log, manifest, counts, ai })]);
    const pName = `${slug(project.name)}-proof.zip`, pBlob = window.TribeExport.zip(files, 'application/zip');
    // the whole tribe: this project in full, the others' boards, docs and chat
    const tFiles = [['tribe/manifest.json', JSON.stringify(manifest, null, 1)], ['TIMELINE.md', timelineMd(log)], ['timeline.json', JSON.stringify({ tribe: tribeName, steps: log }, null, 1)]];
    for (const [n, d] of files) if (n !== 'README.md' && n !== 'tribe/manifest.json') tFiles.push([`projects/${slug(project.name)}/${n}`, d]);
    for (const p of (manifest.projects || []).filter(x => x.id !== project.id)) { try { const o = await collect(p.id, { code: false }); for (const [n, d] of o.entries) tFiles.push([`projects/${slug(p.name)}/${n}`, d]); } catch {} }
    tFiles.unshift(['README.md', readme('tribe', { tribeName, log, manifest, counts: `${(manifest.projects || []).length} project${(manifest.projects || []).length === 1 ? '' : 's'}; ${counts} in ${project.name}`, ai })]);
    const tName = `tribe-${slug(tribeName)}-proof.zip`, tBlob = window.TribeExport.zip(tFiles, 'application/zip');
    blobs[pName] = pBlob; blobs[tName] = tBlob;
    const saved = [];
    for (const [n, b] of [[pName, pBlob], [tName, tBlob]]) { try { saved.push({ ...(await saveZip(b, n)), entries: (n === pName ? files : tFiles).map(f => f[0]) }); } catch (e) { saved.push({ name: n, error: e.message, entries: (n === pName ? files : tFiles).map(f => f[0]) }); } }
    run.proof = saved;
    return { saved };
  }
  function download(name) {
    const b = blobs[name];
    const go = blob => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    if (b) return go(b);
    const tok = ((S().get().server) || {}).token || '';
    fetch(`${C().base()}/api/flint/proof/file?name=${encodeURIComponent(name)}`, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} }).then(r => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText)))).then(go).catch(e => toast(e.message));
  }

  // ---------- the director: steps, the caption bar, checks ----------
  const run = { on: false, stop: false, i: -1, log: [], t0: 0, ai: '', proof: null, opts: {} };
  function steps(o) {
    const T = o.tribe, P = o.project, G = o.game;
    const has = async (fn, ms = 8000) => { const end = Date.now() + (run.opts.fast ? Math.min(ms, 15000) : ms); for (;;) { try { if (await fn()) return true; } catch {} if (Date.now() > end || run.stop) return false; await wait(250); } };
    const code = p => api('/code/file?path=' + encodeURIComponent(p)).then(r => !!(r && r.text)).catch(() => false);
    const show = v => { try { if (A() && A().show) (window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(() => A().show(v)) : A().show(v)); } catch {} };
    return [
      { id: 'tribe', title: 'A tribe', cap: `Every build starts with a tribe: the friends who make it together. Flint names this one ${T}.`, cmd: `start a tribe called ${T}`, check: () => has(async () => connected() && ((await api('/flint/proof/manifest')).tribe.name === T)) },
      { id: 'project', title: 'A project', cap: `One project holds the app, the website and the game: ${P}.`, cmd: `start a project called ${P}`, check: () => has(async () => projects().some(p => p.name === P && p.id === pid())) },
      { id: 'vision', title: 'The vision', cap: 'The vision is the one paragraph everyone (and every AI helper) reads first.', cmd: `set the vision to: ${P} is a cozy game about catching fireflies at dusk, with a website that invites players in and a shop that funds the next level.`, check: () => has(async () => /fireflies/.test((await api('/vision')).text || '')) },
      { id: 'company', title: 'Company basics', cap: 'Company mode gives the project seats with charters: who leads, who builds, who grows it.', cmd: 'make me a company', check: () => has(async () => !!(await api(`/projects/${encodeURIComponent(pid())}/company`)).company), view: 'company' },
      { id: 'tasks', title: 'Tasks', cap: 'Three tasks in one sentence: Flint splits it, reads the dates and adds them to the board.', cmd: 'add a task to design the title screen for friday, then add a task to write the store page tomorrow, then add a task to record a trailer', check: () => has(async () => ((await api('/tasks')).tasks || []).filter(t => /title screen|store page|trailer/i.test(t.title)).length >= 3), view: 'tasks' },
      { id: 'doc', title: 'A doc from a template', cap: 'A launch plan from the doc templates: no AI needed to get a good first draft.', cmd: 'write a doc about the launch plan', check: () => has(async () => ((await api('/docs')).docs || []).some(d => d.kind !== 'deck'), 10000) },
      { id: 'website', title: 'A website from a template', cap: 'The website comes from one of 16 templates, filled in with the project\'s name and words.', cmd: `build me a game press kit for ${P}`, check: () => has(() => code('index.html'), 20000) },
      { id: 'edit', title: 'An edit to the website', cap: 'Then Flint edits it, saved as a version you can always go back to.', cmd: `change the website headline to "Catch the light before it's gone"`, check: () => has(async () => /Catch the light/.test((await api('/code/file?path=index.html')).text || '')) },
      { id: 'game', title: 'A small game', cap: `A playable platformer from the starter: ${G}. It lands in its own folder, so the website stays.`, cmd: `make a platformer called ${G}`, check: () => has(async () => ((await api('/code/tree?path=builds')).entries || []).some(e => e.type === 'dir' && /2d|platformer|game/i.test(e.name)), 20000) },
      { id: 'design', title: 'A design on the canvas', cap: 'A screen on the design canvas, laid out with auto layout, ready to send to the app.', cmd: 'design a login screen', check: async () => { const ok = await has(() => !!(window.TribeCanvas && (window.TribeCanvas.state().nodes || []).some(n => !n.p && !n.del && (n.t === 'frame' || n.t === 'component'))), 12000); if (ok) { await wait(run.opts.fast ? 400 : 900); await captureDesign(); } return ok && !!design; } },
      { id: 'chat', title: 'A post in chat', cap: 'Flint tells the tribe what is new, right in the chat.', cmd: `post in chat: the ${G} demo and the ${P} press kit are up`, check: () => has(async () => ((await api('/chat/general')).messages || []).some(m => /press kit are up/.test(m.text || ''))), view: 'chat' },
      { id: 'propose', title: 'A proposal', cap: 'Big calls go to a vote: a proposal with a checklist.', cmd: 'propose: ship the demo on friday', check: () => has(async () => ((await api('/proposals')).proposals || []).some(p => /ship the demo/i.test(p.title))) },
      { id: 'approve', title: 'Approved', cap: 'One yes and it passes: it becomes a milestone, and its checklist becomes tasks.', cmd: 'approve the proposal', check: () => has(async () => ((await api('/proposals')).proposals || []).some(p => /ship the demo/i.test(p.title) && p.status === 'approved')) },
      { id: 'standup', title: 'A standup', cap: 'The daily standup, written from the board: done, doing, next, blocked.', cmd: 'run the standup', check: () => has(async () => ((await api('/chat/general')).messages || []).some(m => /Standup ·/.test(m.text || ''))), view: 'chat' },
      { id: 'summary', title: 'A summary, on this device', cap: 'Summaries run right here with no model: the most central sentences, picked by TextRank.', cmd: 'summarize the doc called launch plan', check: () => has(() => (F().thread() || []).slice(-2).some(m => m.who === 'flint' && /Summary/.test(m.text))) },
      { id: 'present', title: 'The product presentation', cap: 'Everything rolls up into a presentation: what it is, what got built, the plan and the team.', cmd: 'make the product presentation', check: () => has(async () => ((await api('/docs')).docs || []).some(d => d.kind === 'deck' && /presentation/i.test(d.title))) },
      { id: 'proof', title: 'Proof of work', cap: 'Last: two ZIPs with every file, the timeline and who was there. Saved in the tribe folder and ready to download.', cmd: 'export the proof of work', check: () => has(() => !!(run.proof && run.proof.length === 2 && run.proof.every(p => !p.error)), 30000) },
    ];
  }
  let bar = null, plan = [];
  function draw() {
    if (!bar) return;
    const s = plan[run.i] || {}, n = plan.length, doneN = run.log.filter(l => l.ok).length;
    bar.querySelector('#frun-eyebrow').textContent = run.on ? `Flint is building · step ${Math.min(run.i + 1, n)} of ${n}` : `Flint built it · ${doneN} of ${n} steps ✓`;
    bar.querySelector('#frun-cap').textContent = run.on ? (s.capShown || s.cap || '') : 'Done. The proof of work is saved in the tribe folder (exports/) and here:';
    const via = bar.querySelector('#frun-via'); via.textContent = run.ai ? `✦ captions via ${run.ai}` : 'Basic · no AI'; via.classList.toggle('ai', !!run.ai);
    bar.querySelector('#frun-steps').innerHTML = plan.map((x, i) => { const l = run.log.find(y => y.id === x.id); const state = l ? (l.ok ? 'done' : 'fail') : i === run.i && run.on ? 'now' : 'todo'; return `<li data-step="${x.id}" data-state="${state}" title="${esc(x.title)}"><span>${esc(x.title)}</span></li>`; }).join('');
    const dl = bar.querySelector('#frun-dl');
    dl.innerHTML = !run.on && run.proof ? run.proof.map(p => `<button type="button" class="btn sm ${p.error ? '' : 'primary'}" data-frun-dl="${esc(p.name)}">${p.error ? '⚠ ' : '⬇ '}${esc(p.name)}</button>`).join('') + (run.proof[0] && run.proof[0].path ? `<span class="faint frun-path" title="${esc(run.proof[0].path)}">${esc(run.proof[0].path.replace(/[\\/][^\\/]+$/, ''))}</span>` : '') : '';
    dl.querySelectorAll('[data-frun-dl]').forEach(b => b.onclick = () => download(b.dataset.frunDl));
    bar.querySelector('#frun-stop').textContent = run.on ? 'Stop' : 'Close';
  }
  function mount() {
    if (bar) return bar;
    bar = document.createElement('section'); bar.id = 'frun'; bar.className = 'frun'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Flint run-through');
    bar.innerHTML = `<div class="frun-top"><span class="eyebrow" id="frun-eyebrow"></span><span class="frun-via" id="frun-via"></span><button type="button" class="btn sm" id="frun-stop">Stop</button></div>
      <p class="frun-cap" id="frun-cap" aria-live="polite"></p><ol class="frun-steps" id="frun-steps"></ol><div class="frun-dl" id="frun-dl"></div>`;
    document.body.appendChild(bar); document.body.classList.add('frun-on');
    bar.querySelector('#frun-stop').onclick = () => (run.on ? stop() : unmount());
    return bar;
  }
  function unmount() { if (bar) bar.remove(); bar = null; document.body.classList.remove('frun-on'); }
  async function narrate(s) {
    s.capShown = s.cap; if (!run.ai && run.aiChecked) return;
    if (!run.aiChecked) { run.aiChecked = true; try { const st = window.TribeAIBasics ? await window.TribeAIBasics.online() : { online: false }; run.ai = st.online ? (st.via || 'AI') : ''; } catch { run.ai = ''; } }
    if (!run.ai) return;
    try {
      const r = await Promise.race([api('/ai/refine', { method: 'POST', body: { kind: 'run.narrate', input: { step: s.title, command: s.cmd }, draft: s.cap } }), wait(run.opts.fast ? 4000 : 6000).then(() => null)]);
      if (r && r.text) { s.capShown = r.text.split('\n')[0].replace(/^["“]|["”]$/g, '').slice(0, 220); run.ai = r.via || run.ai; }
    } catch {}
  }
  async function start(opts = {}) {
    if (run.on) return false;
    Object.assign(run, { on: true, stop: false, i: -1, log: [], t0: Date.now(), proof: null, ai: '', aiChecked: false, opts });
    design = null; lastPresentation = null;
    const o = { tribe: opts.tribe || 'Lantern Labs', project: opts.project || 'Glowbug', game: opts.game || 'Firefly Dash' };
    plan = steps(o).filter(s => !opts.only || opts.only.includes(s.id));
    mount(); draw();
    const pace = opts.fast ? 120 : calm() ? 900 : 1600;
    if (F() && F().openFull && !matchMedia('(max-width: 820px)').matches) { try { F().focus(); } catch {} }
    for (let i = 0; i < plan.length && !run.stop; i++) {
      const s = plan[i]; run.i = i; await narrate(s); draw();
      if (s.view) { try { if (A() && A().show) (window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(() => A().show(s.view)) : A().show(s.view)); } catch {} }
      await wait(pace);
      const before = (F().thread() || []).length, at = new Date().toISOString(), ms = Date.now() - run.t0;
      try { await F().ask(s.cmd); } catch {}
      let ok = false; try { ok = !!(await s.check()); } catch {}
      const reply = (F().thread() || []).slice(before).filter(m => m.who === 'flint').map(m => m.text).join('\n').slice(0, 1200) || (s.id === 'design' ? 'Flint answered in the design canvas.' : '');
      run.log.push({ i: i + 1, id: s.id, title: s.title, caption: s.capShown || s.cap, cmd: s.cmd, at, ms, done: new Date().toISOString(), ok, reply, tier: run.ai ? `free · captions via ${run.ai}` : 'free · no AI' });
      if (s.view && s.id !== 'proof') { /* the place it changed stays on screen for a beat */ }
      draw(); await wait(pace);
    }
    run.on = false; run.i = plan.length; draw();
    if (!run.stop) toast(`Flint built it: ${run.log.filter(l => l.ok).length} of ${plan.length} steps ✓`);
    return run.log.slice();
  }
  function stop() { run.stop = true; run.on = false; draw(); }

  // Flint chat buttons: "Download <name>"
  if (F() && F().act) { /* actions are by name in flint.js; the proof downloads go through a delegated click below */ }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.fl-act'); if (!b) return; const m = /^Download (.+\.zip)$/.exec(b.textContent.trim()); if (m && blobs[m[1]]) { e.preventDefault(); e.stopPropagation(); download(m[1]); } }, true);
  // ?flintrun=1 starts it (scripts/flint-runthrough.js); ?flintrun=fast for tests
  try { const q = new URLSearchParams(location.search).get('flintrun'); if (q) { const go = () => (window.TribeFlint && window.TribeClient ? setTimeout(() => start({ fast: q === 'fast' }), 900) : setTimeout(go, 200)); addEventListener('load', go); } } catch {}

  window.TribeFlintRun = { start, stop, active: () => run.on, flint, exportProof, download, captureDesign, _test: { log: () => run.log.slice(), state: () => ({ on: run.on, i: run.i, n: plan.length, proof: run.proof, ai: run.ai }) } };
})();
