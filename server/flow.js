// The one-click project flow:
//   Create project -> this computer hosts the room -> invite link (+ public https when share.js can) ->
//   chat opens with a "Getting started" card -> a git repo with a starter (README, VISION, CLAUDE, PLAN,
//   TRIBE_CONTEXT, one folder per role) is created and, when possible, pushed to a new private GitHub repo
//   (member token -> REST API, else the gh CLI, else it stays local behind a single "Connect GitHub" chip).
// Kickoff: humans claim or delegate ROLES (each with a name, color, glyph and the FOLDERS it owns; owning a
// role gives the member and their agents lanes in coord.js), drop notes and files, then "Start the flow"
// turns the notes into a first PLAN (local brain if it answers, else rules) with tasks per role.
// Then the plan lives: PLAN.md (repo + tribe folder, history in git) checks items off as tasks finish,
// surfaces blocker gists, turns upgrade gists into plan changes that humans approve with one tap, and a
// periodic ASSESSMENT gist says how things stand. Agents report with gists (server/gists.js) and every
// commit becomes a gist instead of a raw diff.
// State: .tribe/flow/<project>.json (tribe folder). HTTP: /api/flow/..., /api/gists, /api/projects/:id/roles.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./gitutil');
const makeGists = require('./gists');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'flow-starter');
// Role colors: the palette tokens plus three muted matte hues (app/ui/flow.css mirrors these).
const PALETTE = { ember: '#F26B1D', teal: '#38C6B1', indigo: '#6C7CFF', green: '#3BD16F', rose: '#FF6F8E', sand: '#C9A66B', sage: '#8FB39A', plum: '#A98BC9' };
const GLYPHS = ['i-flag', 'i-eye', 'i-zap', 'i-git', 'i-bug', 'i-spark', 'i-brain', 'i-map', 'i-users', 'i-doc', 'i-mic', 'i-robot'];
const KEYS = {
  lead: /\b(plan|vision|scope|decide|roadmap|release|launch|pitch|readme|docs?)\b/i,
  design: /\b(design|ui|ux|art|sprite|colou?r|font|logo|icon|sound|music|style|layout|animation|theme|mockup|look)\b/i,
  frontend: /\b(frontend|page|screen|button|menu|player|level|game(play)?|jump|enemy|enemies|input|controls?|client|hud|camera|movement|physics|coin|score)\b/i,
  backend: /\b(backend|server|api|database|db|auth|login|save|storage|sync|multiplayer|endpoint|leaderboard|account)\b/i,
  qa: /\b(tests?|qa|bugs?|fix|check|verify|ci|crash|playtest)\b/i,
};
const DEFAULT_ROLES = () => [
  { id: 'lead', name: 'Lead', color: 'ember', glyph: 'i-flag', folders: [{ path: 'docs/', label: 'Docs' }], members: [] },
  { id: 'design', name: 'Design', color: 'rose', glyph: 'i-eye', folders: [{ path: 'design/', label: 'Design' }, { path: 'assets/', label: 'Assets' }], members: [] },
  { id: 'frontend', name: 'Frontend', color: 'indigo', glyph: 'i-zap', folders: [{ path: 'app/', label: 'App' }], members: [] },
  { id: 'backend', name: 'Backend', color: 'sage', glyph: 'i-git', folders: [{ path: 'server/', label: 'Server' }], members: [] },
  { id: 'qa', name: 'QA', color: 'sand', glyph: 'i-bug', folders: [{ path: 'tests/', label: 'Tests' }], members: [] },
];
const one = (s, n = 200) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const colorOf = c => PALETTE[c] || (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : PALETTE.indigo);
const normFolder = p => { p = String(p || '').trim().replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/{2,}/g, '/'); if (!p || p.includes('..') || p.startsWith('.git')) return ''; return p.endsWith('/') ? p : p + '/'; };
const safeSecret = s => String(s || '').replace(/(gh[pousr]_|github_pat_)[\w]+/g, '***').replace(/x-access-token:[^@\s]+@/g, '').replace(/\/\/[^/@\s]+@/g, '//');

// ---------- starter (shared with scripts/start-test-project.js) ----------
function folderTable(roles) { return roles.flatMap(r => r.folders.map(f => `| \`${f.path}\` | ${r.name} | ${f.label} |`)).join('\n'); }
function folderList(roles) { return roles.map(r => `- **${r.name}**: ${r.folders.map(f => `\`${f.path}\` (${f.label})`).join(', ') || 'no folders yet'}`).join('\n'); }
// Writes the starter files (never overwrites existing ones). Returns the paths written.
function writeStarter(dir, { name, roles = DEFAULT_ROLES(), template = TEMPLATE, folders = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const fill = (t, file) => t.replace(/\{\{name\}\}/g, name).replace(/\{\{folders\}\}/g, file === 'README.md' ? folderTable(roles) : folderList(roles));
  for (const f of fs.readdirSync(TEMPLATE)) {
    const dest = path.join(dir, f);
    if (fs.existsSync(dest)) continue;
    const src = fs.existsSync(path.join(template, f)) ? path.join(template, f) : path.join(TEMPLATE, f);
    fs.writeFileSync(dest, fill(fs.readFileSync(src, 'utf8'), f)); out.push(f);
  }
  if (folders) for (const r of roles) for (const fo of r.folders) {
    const d = path.join(dir, fo.path), readme = path.join(d, 'README.md');
    fs.mkdirSync(d, { recursive: true });
    if (!fs.existsSync(readme)) { fs.writeFileSync(readme, `# ${fo.label}\n\nOwned by **${r.name}**. ${r.name} and their agents work here; others hand off instead of editing.\n`); out.push(fo.path + 'README.md'); }
  }
  const ctx = path.join(dir, 'TRIBE_CONTEXT.md');
  if (!fs.existsSync(ctx)) { fs.writeFileSync(ctx, `# TRIBE_CONTEXT · ${name}\n\n> Auto-generated by TribeCode as the tribe works. Read this first.\n`); out.push('TRIBE_CONTEXT.md'); }
  return out;
}
// Appends the gist rules to an existing CLAUDE.md (for starters that bring their own).
function addGistRules(dir) {
  const f = path.join(dir, 'CLAUDE.md'); let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch {}
  if (/post_gist/.test(t)) return false;
  const rules = fs.readFileSync(path.join(TEMPLATE, 'CLAUDE.md'), 'utf8').split('## Report with gists')[1].split('## Working rules')[0];
  fs.writeFileSync(f, `${t.trimEnd()}\n\n## Report with gists, never code dumps${rules.trimEnd()}\n`);
  return true;
}

module.exports = function flow({ P, W, base, id, str, slug, broadcast, postChat, bus, getMembers, nameOf, docs, brain, coord, createTask, loadTasks, saveTask,
  rooms, hubFor, resetHub, share, makeInvite, linkFor, isLocal }) {
  const NOGH = !!process.env.TRIBE_NO_GH;
  const GH_API = () => String(process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  fs.mkdirSync(base.p('.tribe/flow'), { recursive: true });
  const rel = pid => `.tribe/flow/${pid}.json`;
  const cache = new Map();
  const load = pid => { if (!cache.has(pid)) cache.set(pid, base.readJSON(rel(pid), null)); return cache.get(pid); };
  const save = st => { cache.set(st.project, st); base.writeJSON(rel(st.project), st); };
  const push = (st, kind = 'state') => broadcast({ type: 'flow', kind, project: st.project, flow: view(st) });
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const human = me => me && me.role !== 'agent' && me.role !== 'spectator';
  const now = () => new Date().toISOString();
  const agentsOf = mid => getMembers().filter(m => m.role === 'agent' && m.owner === mid);

  // ---------- roles ----------
  // A person can hold several roles: the files a gist touches pick the one it is about.
  function roleOf(pid, mid, files = []) {
    const st = load(pid); if (!st || !mid) return null;
    const m = member(mid), who = m && m.role === 'agent' && m.owner ? m.owner : mid;
    const mine = st.roles.filter(r => r.members.includes(who));
    if (mine.length > 1 && files.length) {
      const score = r => files.filter(f => { const o = folderOwner(st, f); return o && o.role.id === r.id; }).length;
      const best = mine.slice().sort((a, b) => score(b) - score(a))[0];
      if (score(best)) return best;
    }
    return mine[0] || null;
  }
  const roleView = (r, st) => ({ ...r, hex: colorOf(r.color), people: r.members.map(mid => { const m = member(mid) || { id: mid, name: nameOf(mid) }; return { id: m.id, name: m.name, color: m.color, agents: agentsOf(mid).map(a => ({ id: a.id, name: a.name })) }; }),
    open: st && st.plan ? st.plan.milestones.flatMap(x => x.items).filter(i => i.role === r.id && !i.done).length : 0 });
  function folderOwner(st, file) {
    const f = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    let best = null;
    for (const r of st.roles) for (const fo of r.folders) if ((f + '/').startsWith(fo.path) && (!best || fo.path.length > best.folder.path.length)) best = { role: r, folder: fo };
    return best;
  }
  function cleanRoles(input, prev) {
    const out = [], seen = new Set();
    for (const raw of (Array.isArray(input) ? input : []).slice(0, 8)) {
      const name = one(raw && raw.name, 24); if (!name) continue;
      let rid = String(raw.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || slug(name).slice(0, 24);
      while (seen.has(rid)) rid += '-2';
      seen.add(rid);
      const old = prev.find(r => r.id === rid);
      const folders = (Array.isArray(raw.folders) ? raw.folders : []).map(f => ({ path: normFolder(typeof f === 'string' ? f : f.path), label: one(typeof f === 'string' ? '' : f.label, 24) }))
        .filter(f => f.path).map(f => ({ path: f.path, label: f.label || f.path.replace(/\/$/, '').split('/').pop().replace(/^\w/, c => c.toUpperCase()) })).slice(0, 6);
      out.push({ id: rid, name, color: PALETTE[raw.color] || /^#[0-9a-fA-F]{6}$/.test(raw.color || '') ? raw.color : (old ? old.color : 'indigo'), glyph: GLYPHS.includes(raw.glyph) ? raw.glyph : (old ? old.glyph : 'i-spark'),
        folders, members: old ? old.members.filter(x => member(x)) : [] });
    }
    return out;
  }
  // Lanes: whoever holds a role (and their agents) owns the role's folders in coord.js ownership.
  function syncLanes(st, me) {
    P.inProject(st.project, () => {
      const lanes = coord.ownership(me).lanes.filter(l => (l.note || '').endsWith('· role lane'));
      const want = new Set();
      for (const r of st.roles) for (const mid of r.members) for (const who of [mid, ...agentsOf(mid).map(a => a.id)]) for (const f of r.folders) {
        want.add(`${who}|${f.path}`);
        try { coord.addLane({ area: f.path, owner: who, note: `${r.name} · role lane` }, member(mid) || me); } catch {}
      }
      for (const l of lanes) if (!want.has(`${l.owner}|${l.area}`)) { try { coord.dropLane(l.id, { id: l.by, role: 'host' }); } catch {} }
    });
  }
  function makeFolders(st) {
    const p = P.get(st.project); if (!p || !p.repo || !fs.existsSync(p.repo)) return;
    for (const r of st.roles) for (const f of r.folders) {
      const d = path.join(p.repo, f.path); if (!d.startsWith(path.resolve(p.repo))) continue;
      try { fs.mkdirSync(d, { recursive: true }); const rd = path.join(d, 'README.md'); if (!fs.existsSync(rd)) fs.writeFileSync(rd, `# ${f.label}\n\nOwned by **${r.name}**.\n`); } catch {}
    }
  }

  // ---------- view ----------
  function view(st) {
    if (!st) return null;
    const items = st.plan ? st.plan.milestones.flatMap(m => m.items) : [];
    const p = P.get(st.project) || {};
    return { project: st.project, name: p.name, by: st.by, status: st.status, steps: st.steps, invite: st.invite, roles: st.roles.map(r => roleView(r, st)), notes: st.notes.slice(-30),
      plan: st.plan ? { ...st.plan, total: items.length, done: items.filter(i => i.done).length, current: currentMilestone(st) ? currentMilestone(st).id : null } : null,
      changes: st.changes.filter(c => c.status === 'pending'), blockers: (st.plan ? st.plan.blockers : []).filter(b => b.open),
      lastAssessment: st.lastAssessment || null, github: st.github || null, created: st.created, palette: PALETTE, glyphs: GLYPHS };
  }
  const currentMilestone = st => st.plan && (st.plan.milestones.find(m => m.items.some(i => !i.done)) || null);

  // ---------- create: room -> link -> repo -> GitHub ----------
  async function create(req, body, me) {
    if (!human(me) || P.scoped(me)) throw err(403, 'only tribe members can start projects');
    const name = one(body.name, 48) || 'New project';
    const r = await rooms.create(req, { name, emoji: body.emoji }, me);
    const pid = r.project.id;
    P.addMember(pid, me.id, 'host');
    const st = { project: pid, status: 'kickoff', by: me.id, created: now(), roles: DEFAULT_ROLES(), notes: [], plan: null, changes: [], log: [],
      steps: { room: { s: 'ok' }, link: { s: 'run' }, repo: { s: 'run' }, github: { s: 'run' } } };
    // Whoever starts it leads it until they hand the role on.
    st.roles[0].members.push(me.id);
    save(st);
    P.inProject(pid, () => postChat('general', 'tribecode', `${me.name} started **${name}** 🔥 Claim a role, drop your notes, then press **Start the flow**.`, { flow: 'kickoff' }));
    // Invite link: public https when a tunnel is (or can quickly be) on, else the Wi-Fi/local address.
    const inv = makeInvite({ by: me.id, project: pid });
    st.invite = { code: inv.code, ...linkFor(inv.code), expires: inv.expires };
    st.steps.link = { s: 'ok', note: st.invite.kind };
    save(st);
    rooms.pushProjects();
    const pub = goPublic(pid);
    // Instant invite: hold the answer a few seconds so the link that gets copied is the public one.
    if (body.wait && pub) { await Promise.race([pub, new Promise(r => setTimeout(r, Math.min(Number(body.wait) || 12000, 20000)))]); Object.assign(st, load(pid) || {}); }
    setupRepo(pid, me).catch(e => console.error('flow repo:', e.message));
    syncLanes(st, me);
    return view(st);
  }
  function goPublic(pid) {
    let s; try { s = share.status(); } catch { return; }
    if (!s || s.status === 'on' || s.status === 'starting' || !(s.available && (s.available.tailscale || s.available.cloudflared))) return;
    return share.start('', { download: false }).then(() => {
      const st = load(pid); if (!st || !st.invite) return;
      const l = linkFor(st.invite.code); if (l.link === st.invite.link) return;
      Object.assign(st.invite, l); st.steps.link = { s: 'ok', note: l.kind }; save(st); push(st);
    }).catch(() => {});
  }
  async function setupRepo(pid, me) {
    const st = load(pid);
    const dir = base.p('workspaces', pid);
    try {
      const p = P.get(pid);
      writeStarter(dir, { name: p.name, roles: st.roles });
      // The project's VISION.md in the tribe folder starts from the same text.
      const ps = P.scopedStore(() => pid);
      if (!fs.existsSync(ps.p('VISION.md'))) fs.writeFileSync(ps.p('VISION.md'), fs.readFileSync(path.join(dir, 'VISION.md'), 'utf8'));
      await W.makeRepo(dir, member(me.id) || me);
      P.update(pid, { repo: dir, workspace: true }); resetHub(pid); hubFor(pid);
      st.steps.repo = { s: 'ok' };
    } catch (e) { st.steps.repo = { s: 'fail', note: one(e.message, 160) }; st.steps.github = { s: 'todo' }; save(st); push(st); return; }
    save(st); push(st);
    await github(pid, me);
  }
  async function ghApi(token, method, url, body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(GH_API() + url, { method, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TribeCode', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) } });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    } finally { clearTimeout(t); }
  }
  const tokenOwner = mid => (W.readSecret(mid).githubToken ? mid : (getMembers().find(m => m.role === 'host' && W.hasToken(m.id)) || {}).id || null);
  async function github(pid, me) {
    const st = load(pid), p = P.get(pid);
    if (!p || !p.repo || !W.isRepo(p.repo)) { st.steps.github = { s: 'todo' }; save(st); push(st); return st.steps.github; }
    st.steps.github = { s: 'run' }; save(st); push(st);
    const repoName = slug(p.name).slice(0, 90) || pid;
    const git = (args, opts = {}) => W.git(args, p.repo, opts);
    try {
      const owner = tokenOwner(me.id);
      if ((await W.remoteOf(p.repo)) && st.github && st.github.url) { st.steps.github = { s: 'ok', note: st.github.via }; save(st); push(st); return st.steps.github; }
      if (owner) {
        const token = W.readSecret(owner).githubToken;
        let r = await ghApi(token, 'POST', '/user/repos', { name: repoName, private: true, description: `${p.name}: built together in TribeCode`, auto_init: false });
        if (r.status === 422) r = await ghApi(token, 'POST', '/user/repos', { name: `${repoName}-${id(4).toLowerCase()}`, private: true, auto_init: false });
        if (r.status === 401) throw err(401, 'GitHub refused the saved token (expired or missing the repo scope)');
        if (r.status >= 300 || !r.data.clone_url) throw err(502, `GitHub could not create the repo (HTTP ${r.status}${r.data.message ? ': ' + one(r.data.message, 80) : ''})`);
        await git(['remote', 'remove', 'origin']);
        const add = await git(['remote', 'add', 'origin', r.data.clone_url]); if (add.code) throw err(422, add.err);
        const { args, env } = W.pushEnv(owner);
        const pr = await git([...args, 'push', '--quiet', '-u', 'origin', 'HEAD:main'], { env, timeout: 120_000 });
        if (pr.code) throw err(422, `push failed: ${one(pr.err || pr.out, 160)}`);
        st.github = { url: r.data.html_url || null, name: r.data.full_name || repoName, via: 'token', private: r.data.private !== false };
      } else if (!NOGH && (await W.ghStatus()).signedIn) {
        const r = await run('gh', ['repo', 'create', repoName, '--private', '--source', p.repo, '--remote', 'origin', '--push'], { cwd: p.repo, timeout: 120_000, env: W.NOPROMPT });
        if (r.code) throw err(422, `gh repo create failed: ${one(r.err || r.out, 160)}`);
        const url = (`${r.out}\n${r.err}`.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/) || [])[0] || null;
        st.github = { url, name: url ? url.split('/').slice(-2).join('/') : repoName, via: 'gh', private: true };
      } else {
        st.steps.github = { s: 'todo' }; save(st); push(st); return st.steps.github;
      }
      st.steps.github = { s: 'ok', note: st.github.via };
      P.inProject(pid, () => postChat('general', 'tribecode', `📦 ${p.name} is on GitHub${st.github.url ? `: [${st.github.name}](${st.github.url})` : ''} (private).`));
      resetHub(pid); hubFor(pid);
    } catch (e) {
      st.steps.github = { s: 'fail', note: safeSecret(one(e.message, 200)) };
    }
    save(st); push(st);
    return st.steps.github;
  }

  // ---------- kickoff: roles + notes ----------
  function setRoles(pid, roles, me) {
    const st = must(pid); if (!human(me)) throw err(403, 'only people edit roles');
    const next = cleanRoles(roles, st.roles);
    if (!next.length) throw err(400, 'keep at least one role');
    st.roles = next; save(st); makeFolders(st); syncLanes(st, me); push(st);
    return view(st);
  }
  function claim(pid, rid, { member: who, leave } = {}, me) {
    const st = must(pid); if (!human(me)) throw err(403, 'agents cannot take roles; their human does');
    const r = st.roles.find(x => x.id === rid); if (!r) throw err(404, 'no such role');
    const target = who && member(who) ? member(who) : me;
    if (target.role === 'agent') throw err(400, 'give the role to the agent\'s human; agents follow their human\'s role');
    if (leave) r.members = r.members.filter(x => x !== target.id);
    else if (!r.members.includes(target.id)) r.members.push(target.id);
    save(st); syncLanes(st, me); push(st);
    P.inProject(pid, () => postChat('general', 'tribecode', leave ? `${target.name} left **${r.name}**.` : target.id === me.id ? `${me.name} took **${r.name}** (${r.folders.map(f => f.path).join(', ') || 'no folders'}).` : `${me.name} gave **${r.name}** to ${target.name}.`));
    if (!leave && target.id !== me.id) bus.notify({ type: 'role', to: [target.id], from: me.id, title: `${me.name} gave you ${r.name}`, body: `Your folders: ${r.folders.map(f => f.path).join(', ')}`, view: 'chat' });
    return view(st);
  }
  const TEXTY = /\.(md|markdown|txt|text|csv|json|ya?ml|html?|js|ts|py|css|rtf)$/i;
  function addNote(pid, body, me) {
    const st = must(pid); if (!human(me)) throw err(403, 'only people drop notes');
    const name = one(body.name, 120) || 'Note';
    let text = typeof body.text === 'string' ? body.text : null;
    const data = typeof body.data === 'string' ? Buffer.from(body.data, 'base64') : null;
    if (text === null && data && TEXTY.test(name) && data.length < 2_000_000) text = data.toString('utf8');
    const title = name.replace(/\.[^.]+$/, '') || name;
    const note = { id: 'n-' + id(6).toLowerCase(), name, by: me.id, at: now() };
    const p = P.get(pid);
    if (text !== null) {
      text = text.slice(0, 200_000);
      if (!/\.(md|markdown|txt|text)$/i.test(name) && body.text === undefined && /\.\w+$/.test(name)) text = '```\n' + text + '\n```';
      const r = P.inProject(pid, () => docs.upsert({ name: title, body: text, by: me.id }));
      const doc = r.doc || (P.inProject(pid, () => docs.upsert({ name: `${title} (${note.id})`, body: text, by: me.id })).doc);
      Object.assign(note, { kind: 'text', doc: doc ? doc.slug : null, chars: text.length });
      try { fs.mkdirSync(base.p('brain', 'notes'), { recursive: true }); fs.writeFileSync(base.p('brain', 'notes', `${pid}-${(doc && doc.slug) || note.id}.md`), `# ${title}\n\n${text}\n`); } catch {}
    } else if (data) {
      if (data.length > 10 * 1024 * 1024) throw err(413, 'files up to 10 MB here; bigger ones go in the repo');
      const safe = name.replace(/[^\w.-]+/g, '-').slice(0, 80) || 'file';
      const dir = p && p.repo ? path.join(p.repo, 'docs', 'notes') : base.p('.tribe', 'flow', `${pid}-files`);
      fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, safe), data);
      const where = p && p.repo ? `docs/notes/${safe}` : safe;
      const r = P.inProject(pid, () => docs.upsert({ name: title, body: `> File **${name}** (${Math.round(data.length / 1024)} KB) dropped by ${me.name}${p && p.repo ? `, saved in the repo at \`${where}\`` : ''}.\n`, by: me.id }));
      Object.assign(note, { kind: 'file', doc: r.doc ? r.doc.slug : null, path: where, bytes: data.length });
    } else throw err(400, 'drop a note or a file');
    st.notes.push(note); save(st); push(st);
    return { note, flow: view(st) };
  }
  function must(pid) { const st = load(pid); if (!st) throw err(404, 'this project has no flow yet'); return st; }

  // ---------- plan ----------
  const roleFor = (st, text, i) => {
    const tag = text.match(/^\[([^\]]{2,24})\]\s*|@([\w-]{2,24})\b/);
    if (tag) { const t = (tag[1] || tag[2]).toLowerCase(); const r = st.roles.find(x => x.name.toLowerCase() === t || x.id === t); if (r) return r.id; }
    for (const r of st.roles) {
      const re = KEYS[r.id]; if (re && re.test(text)) return r.id;
      if (new RegExp(`\\b(${[r.name, ...r.folders.map(f => f.label)].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i').test(text)) return r.id;
    }
    const staffed = st.roles.filter(r => r.members.length); const pool = staffed.length ? staffed : st.roles;
    return pool[i % pool.length].id;
  };
  const clean = t => one(t.replace(/^\[([^\]]{2,24})\]\s*/, '').replace(/\*\*|__|`/g, ''), 110);
  function rulePlan(st, text) {
    const ms = []; let curM = null, bullets = 0;
    const lines = String(text || '').split('\n');
    for (const line of lines) {
      const h = line.match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/);
      if (h) { curM = { title: clean(h[1]), items: [] }; ms.push(curM); continue; }
      const b = line.match(/^\s*(?:[-*+•]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.{4,})$/);
      if (b) { if (!curM) { curM = { title: 'First version', items: [] }; ms.push(curM); } curM.items.push(b[1]); bullets++; }
    }
    if (!bullets) {   // plain prose: sentences become tasks
      const sentences = String(text || '').replace(/^#.*$/gm, '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length >= 12 && s.length <= 160);
      ms.length = 0; ms.push({ title: 'First version', items: sentences.slice(0, 8) });
    }
    const out = ms.filter(m => m.items.length).slice(0, 6).map(m => ({ title: m.title || 'Milestone', items: m.items.slice(0, 8) }));
    return out;
  }
  async function brainPlan(st, text) {
    if (!brain) return null;
    try {
      const s = brain.status(); if (!s.online && !(await brain.refresh()).online) return null;
      const roles = st.roles.map(r => r.name).join(', ');
      const out = await Promise.race([brain.generate(`Team roles: ${roles}\n\nNotes from the team:\n${String(text).slice(0, 8000)}\n\nTurn these notes into a first plan. Reply with JSON only: {"milestones":[{"title":"short","items":[{"text":"one task, under 100 characters","role":"one of the roles"}]}]}. 2-4 milestones, 3-6 items each. Only use facts from the notes.`,
        { system: 'You plan small software projects for a team of friends and their AI agents. Output strict JSON.', maxTokens: 900 }), new Promise(r => setTimeout(() => r(null), 25_000))]);
      if (!out) return null;
      const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      const ms = (j.milestones || []).slice(0, 6).map(m => ({ title: one(m.title, 60) || 'Milestone', items: (m.items || []).slice(0, 8).map(i => (typeof i === 'string' ? i : `${i.role ? `[${i.role}] ` : ''}${i.text || ''}`)).filter(x => x.trim().length > 3) })).filter(m => m.items.length);
      return ms.length ? ms : null;
    } catch { return null; }
  }
  async function start(pid, me) {
    const st = must(pid); if (!human(me)) throw err(403, 'a person starts the flow');
    if (st.status === 'running' && st.plan) return view(st);
    const notes = st.notes.filter(n => n.kind === 'text' && n.doc).map(n => { const d = P.inProject(pid, () => docs.read ? docs.read(n.doc) : docs.find(n.doc)); return d && d.body ? `# ${d.title}\n${d.body}` : ''; }).join('\n\n');
    let vision = ''; try { vision = fs.readFileSync(P.scopedStore(() => pid).p('VISION.md'), 'utf8'); } catch {}
    const source = notes.trim() || vision.split('\n').filter(l => !/Replace these lines|^- (One sentence pitch|Who it is for|The first version)/.test(l)).join('\n');
    let raw = await brainPlan(st, source), by = 'brain';
    if (!raw || !raw.length) { raw = rulePlan(st, source); by = 'rules'; }
    if (!raw.length) raw = [{ title: 'First version', items: [] }];
    let n = 0;
    const milestones = raw.map((m, mi) => ({ id: `m${mi + 1}`, title: m.title, items: m.items.map(t => ({ id: 'i-' + id(5).toLowerCase(), text: clean(t), role: roleFor(st, t, n++), done: false })) }));
    // Every staffed role gets at least one thing to do.
    for (const r of st.roles.filter(x => x.members.length)) if (!milestones.some(m => m.items.some(i => i.role === r.id))) milestones[0].items.push({ id: 'i-' + id(5).toLowerCase(), text: `Set up ${r.folders.map(f => f.label).join(' and ') || r.name}`, role: r.id, done: false });
    P.inProject(pid, () => {
      for (const m of milestones) for (const it of m.items) {
        const r = st.roles.find(x => x.id === it.role);
        const t = createTask({ title: it.text, by: me.id, source: 'plan', assignee: r && r.members.length === 1 ? r.members[0] : null,
          body: `From the plan · ${m.title} · role **${r ? r.name : '?'}**${r && r.folders.length ? ` (${r.folders.map(f => '`' + f.path + '`').join(', ')})` : ''}.` });
        it.task = t.id; it.assignee = t.assignee || null;
      }
    });
    st.plan = { version: 1, by, milestones, blockers: [], updated: now() };
    st.status = 'running'; st.startedAt = now();
    logPlan(st, `Plan made from ${st.notes.length ? `${st.notes.length} note${st.notes.length > 1 ? 's' : ''}` : 'the vision'} (${by})`);
    save(st); writePlan(st, 'TribeCode: first plan');
    const items = milestones.flatMap(m => m.items);
    gists.post(pid, { kind: 'plan', title: `First plan: ${items.length} task${items.length === 1 ? '' : 's'} in ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}`,
      bullets: milestones.slice(0, 5).map(m => `${m.title}: ${m.items.slice(0, 2).map(i => i.text).join('; ')}${m.items.length > 2 ? '…' : ''}`), files: ['PLAN.md'] }, 'tribecode');
    push(st, 'started');
    return view(st);
  }
  function logPlan(st, text) { st.log = [...(st.log || []), { at: now(), text: one(text, 160) }].slice(-40); }

  function planMd(st) {
    const p = P.get(st.project) || { name: st.project };
    const items = st.plan ? st.plan.milestones.flatMap(m => m.items) : [];
    const cm = currentMilestone(st);
    const rn = rid => (st.roles.find(r => r.id === rid) || { name: rid }).name;
    const L = [`# PLAN · ${p.name}`, '', `> Living plan, kept by TribeCode. Updated ${now().slice(0, 16).replace('T', ' ')} UTC. Done items are checked off as tasks finish; agents propose changes with upgrade gists and humans approve them. History lives in git.`, ''];
    if (!st.plan) { L.push('Not started yet: press **Start the flow** in the project chat.'); return L.join('\n') + '\n'; }
    L.push(`**Now:** ${cm ? cm.title : 'everything in this plan is done'} · ${items.filter(i => i.done).length} of ${items.length} done`, '');
    L.push('## Roles', '');
    for (const r of st.roles) L.push(`- **${r.name}**: ${r.members.map(nameOf).join(', ') || 'open'} · ${r.folders.map(f => `\`${f.path}\``).join(', ') || 'no folders'}`);
    L.push('');
    for (const m of st.plan.milestones) {
      L.push(`## ${m.title}${m.items.length && m.items.every(i => i.done) ? ' ✓' : ''}`, '');
      for (const i of m.items) L.push(`- [${i.done ? 'x' : ' '}] ${i.text} · ${rn(i.role)}${i.assignee ? ` · ${nameOf(i.assignee)}` : ''}${i.task ? ` (\`${i.task}\`)` : ''}`);
      L.push('');
    }
    const bl = st.plan.blockers.filter(b => b.open);
    L.push('## Blockers', ''); if (!bl.length) L.push('- None.'); bl.forEach(b => L.push(`- ${b.text} · ${b.byName}`)); L.push('');
    const pc = st.changes.filter(c => c.status === 'pending');
    L.push('## Proposed changes (waiting for a human)', ''); if (!pc.length) L.push('- None.'); pc.forEach(c => L.push(`- ${c.title} · from ${c.byName}`)); L.push('');
    L.push('## History', ''); (st.log || []).slice(-12).reverse().forEach(x => L.push(`- ${x.at.slice(0, 16).replace('T', ' ')}: ${x.text}`));
    return L.join('\n') + '\n';
  }
  const chains = new Map();
  function writePlan(st, message) {
    const md = planMd(st);
    try { fs.writeFileSync(P.scopedStore(() => st.project).p('PLAN.md'), md); } catch {}
    const p = P.get(st.project); if (!p || !p.repo || !W.isRepo(p.repo)) return;
    const prev = chains.get(st.project) || Promise.resolve();
    const next = prev.then(async () => {
      fs.writeFileSync(path.join(p.repo, 'PLAN.md'), md);
      const g = (a, o) => W.git(a, p.repo, o);
      await g(['add', '--', 'PLAN.md']);
      if ((await g(['diff', '--cached', '--quiet', '--', 'PLAN.md'])).code === 0) return;
      await g(['-c', 'user.name=TribeCode', '-c', 'user.email=plan@users.noreply.tribecode', 'commit', '-q', '-m', message || 'TribeCode: update plan', '--', 'PLAN.md']);
    }).catch(e => console.error('flow plan commit:', e.message));
    chains.set(st.project, next);
    return next;
  }
  const planTimers = new Map();
  function planSoon(st, message) { clearTimeout(planTimers.get(st.project)); planTimers.set(st.project, setTimeout(() => writePlan(load(st.project), message), 400)); }

  // Tasks finishing (or reopening) check plan items off.
  function onTask(t) {
    const pid = t.project || P.defaultId(); const st = load(pid); if (!st || !st.plan) return;
    for (const m of st.plan.milestones) for (const it of m.items) {
      if (it.task !== t.id) continue;
      const done = t.status === 'done', wasAll = m.items.every(i => i.done);
      if (it.done === done && it.assignee === (t.assignee || null)) return;
      it.assignee = t.assignee || null;
      if (it.done !== done) { it.done = done; logPlan(st, `${done ? 'Done' : 'Reopened'}: ${it.text}`); }
      st.plan.updated = now(); save(st); planSoon(st, `TribeCode: ${done ? 'check off' : 'reopen'} "${one(it.text, 60)}"`); push(st, 'plan');
      if (done && !wasAll && m.items.every(i => i.done)) {
        logPlan(st, `Milestone done: ${m.title}`); save(st);
        const nx = currentMilestone(st);
        P.inProject(pid, () => postChat('general', 'tribecode', `🏁 Milestone done: **${m.title}**.${nx ? ` Next up: **${nx.title}**.` : ' The whole plan is done.'}`));
      }
      return;
    }
  }
  // Gists move the plan: blockers surface, upgrades become changes humans approve.
  function onGist(g) {
    const st = load(g.project); if (!st || !st.plan) return;
    if (g.kind === 'blocker') { st.plan.blockers.push({ id: g.id, text: g.title, by: g.by, byName: g.byName, at: g.at, open: true, task: g.task }); logPlan(st, `Blocker: ${g.title}`); }
    else if (g.kind === 'upgrade' || (g.kind === 'plan' && g.by !== 'tribecode')) {
      const c = { id: 'pc-' + id(6).toLowerCase(), gist: g.id, title: g.title, bullets: g.bullets, by: g.by, byName: g.byName, role: g.role, at: g.at, status: 'pending' };
      st.changes.push(c); st.changes = st.changes.slice(-60);
      const owner = (member(g.by) || {}).owner;
      bus.notify({ type: 'plan-change', to: 'all', from: g.by, title: `Plan change from ${g.byName}`, body: g.title, view: 'chat', ref: c.id, priority: 'normal' });
      if (owner) {}   // humans decide; the owner sees it with everyone
    } else if (g.kind === 'progress') {
      // "unblocked" / "fixed" progress closes that author's open blockers.
      if (/\b(unblock|resolved|fixed|works now)\b/i.test([g.title, ...g.bullets].join(' '))) st.plan.blockers.filter(b => b.open && b.by === g.by).forEach(b => { b.open = false; b.closedAt = g.at; });
      if (g.task) { const it = st.plan.milestones.flatMap(m => m.items).find(i => i.task === g.task); if (it) it.last = g.title; }
    } else return;
    st.plan.updated = now(); save(st); planSoon(st, `TribeCode: plan update (${g.kind})`); push(st, 'plan');
  }
  function decide(pid, cid, decision, me, note) {
    const st = must(pid);
    if (!human(me)) throw err(403, 'only humans approve plan changes');
    const c = st.changes.find(x => x.id === cid); if (!c) throw err(404, 'no such plan change');
    if (c.status !== 'pending') throw err(409, `already ${c.status}`);
    c.status = decision === 'approve' ? 'approved' : 'denied'; c.decidedBy = me.id; c.decidedAt = now(); c.note = one(note, 200);
    if (c.status === 'approved') {
      const m = currentMilestone(st) || st.plan.milestones[st.plan.milestones.length - 1] || (st.plan.milestones.push({ id: 'm1', title: 'Next', items: [] }), st.plan.milestones[0]);
      const kw = st.roles.find(r => (KEYS[r.id] && KEYS[r.id].test(c.title)) || new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(c.title));
      const role = (kw && kw.id) || c.role || roleFor(st, c.title, 0);
      const r = st.roles.find(x => x.id === role);
      const t = P.inProject(pid, () => createTask({ title: c.title, by: me.id, source: 'plan', assignee: r && r.members.length === 1 ? r.members[0] : null, body: `Approved plan change from ${c.byName}.\n\n${(c.bullets || []).map(b => `- ${b}`).join('\n')}` }));
      m.items.push({ id: 'i-' + id(5).toLowerCase(), text: one(c.title, 110), role, task: t.id, assignee: t.assignee || null, done: false, from: c.id });
      st.plan.version = (st.plan.version || 1) + 1;
      logPlan(st, `${me.name} approved: ${c.title}`);
    } else logPlan(st, `${me.name} turned down: ${c.title}`);
    st.plan.updated = now(); save(st); writePlan(st, `TribeCode: ${c.status} plan change "${one(c.title, 60)}"`); push(st, 'plan');
    P.inProject(pid, () => postChat('general', 'tribecode', c.status === 'approved' ? `✅ ${me.name} approved a plan change: **${c.title}**` : `${me.name} turned down **${c.title}**${c.note ? `: ${c.note}` : ''}.`));
    const by = member(c.by); if (by && by.role === 'agent') P.inProject(pid, () => coord.tell(by.id, 'plan', `${me.name} ${c.status} your plan change "${c.title}"${c.note ? ': ' + c.note : '.'}`, me.id));
    return view(st);
  }
  function resolveBlocker(pid, bid, me) {
    const st = must(pid); if (!human(me) && me.role !== 'agent') throw err(403, 'read-only');
    const b = st.plan && st.plan.blockers.find(x => x.id === bid); if (!b) throw err(404, 'no such blocker');
    b.open = false; b.closedAt = now(); b.closedBy = me.id; logPlan(st, `Unblocked: ${b.text}`); save(st); planSoon(st, 'TribeCode: blocker resolved'); push(st, 'plan');
    return view(st);
  }

  // ---------- assessment ----------
  async function assess(pid, me) {
    const st = must(pid); if (!st.plan) throw err(409, 'start the flow first');
    const items = st.plan.milestones.flatMap(m => m.items), done = items.filter(i => i.done).length, pct = items.length ? Math.round(done / items.length * 100) : 0;
    const cm = currentMilestone(st), tasks = P.inProject(pid, () => loadTasks());
    const blockers = st.plan.blockers.filter(b => b.open);
    const stuck = tasks.filter(t => t.status === 'review' && Date.now() - Date.parse(t.updated) > 24 * 3600_000);
    const risks = [];
    const empty = st.roles.filter(r => !r.members.length && items.some(i => i.role === r.id && !i.done));
    if (empty.length) risks.push(`${empty.map(r => r.name).join(', ')} ${empty.length > 1 ? 'have' : 'has'} work but nobody in the role`);
    const unassigned = items.filter(i => !i.done && !i.assignee).length; if (unassigned) risks.push(`${unassigned} open item${unassigned > 1 ? 's have' : ' has'} no owner`);
    const recent = gists.list(pid, 50).filter(g => Date.now() - Date.parse(g.at) < 24 * 3600_000 && g.kind !== 'assessment').length;
    if (!recent && Date.now() - Date.parse(st.startedAt || st.created) > 24 * 3600_000) risks.push('quiet for a day: no updates from anyone');
    if (stuck.length) risks.push(`${stuck.length} task${stuck.length > 1 ? 's' : ''} waiting in review over a day`);
    const pend = st.changes.filter(c => c.status === 'pending').length; if (pend) risks.push(`${pend} plan change${pend > 1 ? 's' : ''} waiting for a human`);
    const rn = rid => (st.roles.find(r => r.id === rid) || { name: rid }).name;
    const next = (cm ? cm.items : []).filter(i => !i.done).sort((a, b) => !!b.assignee - !!a.assignee).slice(0, 3).map(i => `${i.assignee ? nameOf(i.assignee) : rn(i.role)}: ${one(i.text, 40)}`);
    let headline = cm ? `${pct}% of the plan done · now: ${one(cm.title, 40)}` : 'The plan is done · time to plan the next round';
    if (brain && brain.status().online) {
      try { const h = await Promise.race([brain.generate(`Progress ${done}/${items.length}. Current milestone: ${cm ? cm.title : 'none'}. Blockers: ${blockers.map(b => b.text).join('; ') || 'none'}. Risks: ${risks.join('; ') || 'none'}.\nWrite ONE short headline (max 12 words) for the team's status. No preamble.`, { maxTokens: 40 }), new Promise(r => setTimeout(() => r(''), 8000))]);
        if (h) headline = one(h.split('\n')[0].replace(/^["']|["']$/g, ''), 88); } catch {}
    }
    const bullets = [
      `Progress: ${done} of ${items.length} plan items${cm ? `; ${cm.items.filter(i => i.done).length}/${cm.items.length} in "${one(cm.title, 30)}"` : ''}`,
      blockers.length ? `Blocked: ${blockers.slice(0, 2).map(b => `${b.byName} (${one(b.text, 40)})`).join(', ')}` : 'Nobody is blocked',
      risks.length ? `Risk: ${risks.slice(0, 2).join('; ')}` : 'No risks spotted',
      next.length ? `Next: ${next.join(' · ')}` : 'Next: pick the next milestone',
    ];
    const r = gists.post(pid, { kind: 'assessment', title: headline, bullets, files: ['PLAN.md'] }, 'tribecode');
    st.lastAssessment = { at: now(), gist: r.gist && r.gist.id, pct, by: me ? me.id : 'schedule' };
    logPlan(st, `Assessment: ${pct}% done${blockers.length ? `, ${blockers.length} blocked` : ''}`);
    save(st); planSoon(st, 'TribeCode: assessment'); push(st, 'plan');
    return { gist: r.gist, flow: view(st) };
  }
  const DAY = Number(process.env.TRIBE_ASSESS_MS) || 24 * 3600_000;
  setInterval(() => {
    for (const p of P.all()) { const st = load(p.id); if (st && st.status === 'running' && st.plan && Date.now() - Date.parse((st.lastAssessment || {}).at || st.startedAt) > DAY) assess(p.id, null).catch(() => {}); }
  }, Math.min(DAY, 30 * 60_000)).unref();

  // ---------- auto-gists from commits ----------
  const seenRange = new Set();
  async function commitGist(pid, { dir, from, to, branch, by }) {
    const key = `${pid}|${to}`; if (seenRange.has(key)) return; seenRange.add(key);
    if (seenRange.size > 500) seenRange.clear();
    const g = a => run('git', a, { cwd: dir, timeout: 20_000 });
    const range = from ? `${from}..${to}` : to;
    const log = (await g(['log', '--no-merges', '--format=%h%x1f%an%x1f%s', '-n', '20', range])).out.split('\n').filter(Boolean).map(l => { const [sha, author, subject] = l.split('\x1f'); return { sha, author, subject }; });
    const merges = (await g(['log', '--merges', '--format=%s', '-n', '5', range])).out.split('\n').filter(Boolean);
    const real = log.filter(c => !/^TribeCode:/.test(c.subject) && !/^(Initial commit|Start project) \(via TribeCode\)$/.test(c.subject));
    if (!real.length && !merges.length) return;
    const files = (await g(['diff', '--name-only', from ? `${from}` : `${to}~1`, to])).out.split('\n').filter(Boolean).filter(f => f !== 'PLAN.md' && f !== 'TRIBE_CONTEXT.md');
    const stat = (await g(['diff', '--shortstat', from ? `${from}` : `${to}~1`, to])).out;
    const st = load(pid);
    const areas = st ? [...new Set(files.map(f => { const o = folderOwner(st, f); return o ? o.folder.label : null; }).filter(Boolean))] : [];
    let title = merges.length && !real.length ? `Merged into ${branch}: ${one(merges[0], 60)}` : real.length === 1 ? one(real[0].subject, 80) : `${real.length} commits on ${branch}`;
    let bullets = real.slice(0, 3).map(c => one(c.subject, 110));
    if (real.length > 3) bullets.push(`…and ${real.length - 3} more commits`);
    bullets.push(`${files.length} file${files.length === 1 ? '' : 's'}${areas.length ? ` in ${areas.slice(0, 3).join(', ')}` : ''}${stat ? (() => { const ins = (/(\d+) insertions?/.exec(stat) || [])[1], del = (/(\d+) deletions?/.exec(stat) || [])[1]; return ins || del ? ` · ${ins ? `+${ins}` : ''}${ins && del ? ' ' : ''}${del ? `−${del}` : ''}` : ''; })() : ''}`);
    if (brain && brain.status().online && real.length) {
      try {
        const diff = (await g(['diff', '--stat', from || `${to}~1`, to])).out.slice(0, 3000);
        const out = await Promise.race([brain.generate(`Commits:\n${real.map(c => '- ' + c.subject).join('\n')}\n\nDiff stat:\n${diff}\n\nSummarize what changed for teammates in at most 3 bullets, each under 100 characters, plain words, no code. One bullet per line starting with "- ".`, { maxTokens: 160 }), new Promise(r => setTimeout(() => r(''), 10_000))]);
        const bs = String(out || '').split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(l => l && !/```/.test(l)).slice(0, 3);
        if (bs.length) bullets = [...bs.map(b => one(b, 110)), bullets[bullets.length - 1]];
      } catch {}
    }
    const p = P.get(pid), gh = st && st.github && st.github.url;
    const link = gh ? (from ? `${gh}/compare/${from}...${to}` : `${gh}/commit/${to}`) : '#repo';
    const who = by ? member(by) || { id: by, name: nameOf(by) } : (() => { const a = real[0] && real[0].author; return getMembers().find(m => m.name === a) || 'tribecode'; })();
    gists.post(pid, { kind: 'progress', title, bullets: bullets.slice(0, 5), files: files.slice(0, 30), link }, who, { auto: true });
  }
  function onHead(pid, { from, to, branch, repo }) { if (!load(pid)) return; commitGist(pid, { dir: repo, from, to, branch, by: null }).catch(e => console.error('flow gist:', e.message)); }
  function onCommit({ repo, dir, member: m, branch, before, after }) {
    const p = P.all().find(x => x.repo && path.resolve(x.repo) === path.resolve(repo)); if (!p || !load(p.id)) return;
    commitGist(p.id, { dir, from: before, to: after, branch, by: m.id }).catch(e => console.error('flow gist:', e.message));
  }

  // ---------- TRIBE_CONTEXT.md lines ----------
  function contextLines(pid) {
    const st = load(pid); if (!st) return [];
    const L = ['## Roles and folders', ''];
    for (const r of st.roles) L.push(`- **${r.name}**: ${r.members.map(nameOf).join(', ') || 'open'} · owns ${r.folders.map(f => `\`${f.path}\` (${f.label})`).join(', ') || 'no folders'}`);
    L.push('');
    if (st.plan) {
      const cm = currentMilestone(st), items = st.plan.milestones.flatMap(m => m.items);
      L.push('## Plan (PLAN.md)', '', `Now: **${cm ? cm.title : 'all done'}** · ${items.filter(i => i.done).length} of ${items.length} done.`);
      (cm ? cm.items.filter(i => !i.done).slice(0, 8) : []).forEach(i => L.push(`- [ ] ${i.text} · ${(st.roles.find(r => r.id === i.role) || {}).name || i.role}${i.task ? ` (\`${i.task}\`)` : ''}`));
      st.plan.blockers.filter(b => b.open).forEach(b => L.push(`- ⛔ ${b.text} (${b.byName})`));
      L.push('');
    }
    const gs = gists.list(pid, 8);
    if (gs.length) { L.push('## Recent gists', ''); gs.forEach(g => L.push(`- ${g.at.slice(11, 16)} ${g.kind} · ${g.byName}: ${one(g.title, 100)}`)); L.push(''); }
    return L;
  }

  const gists = makeGists({ P, base, id, postChat, broadcast, nameOf, roleOf, onGist });

  // ---------- HTTP ----------
  async function route(req, res, { m, a, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const pid = P.current() || P.defaultId();
    try {
      if (a === 'projects' && c === 'roles' && m === 'GET') {   // read by other modules (people view)
        if (!P.canSee(me, b)) return fail(res, 404, 'project not found');
        const st = load(b);
        return send(res, 200, { roles: st ? st.roles.map(r => roleView(r, st)) : [], palette: PALETTE, folders: st ? st.roles.flatMap(r => r.folders.map(f => ({ ...f, role: r.id, roleName: r.name, color: colorOf(r.color) }))) : [] });
      }
      if (a === 'gists') {
        if (m === 'GET') return send(res, 200, { gists: gists.list(pid, Math.min(Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 100, 500)) });
        if (m === 'POST') { if (me.role === 'spectator') return fail(res, 403, 'read-only'); const r = gists.post(pid, await readBody(req), me); return r.error ? fail(res, 400, r.error) : send(res, 200, r); }
      }
      if (a !== 'flow') return null;
      if (!b && m === 'GET') return send(res, 200, { flow: view(load(pid)) });
      if (b === 'create' && m === 'POST') return send(res, 200, { flow: await create(req, await readBody(req), me) });
      if (me.role === 'spectator' && m !== 'GET') return fail(res, 403, 'read-only');
      if (b === 'roles' && m === 'PUT') return send(res, 200, { flow: setRoles(pid, (await readBody(req)).roles, me) });
      if (b === 'roles' && c && m === 'POST') return send(res, 200, { flow: claim(pid, c, await readBody(req), me) });
      if (b === 'notes' && m === 'POST') return send(res, 200, addNote(pid, await readBody(req, 14 * 1024 * 1024), me));
      if (b === 'start' && m === 'POST') return send(res, 200, { flow: await start(pid, me) });
      if (b === 'assess' && m === 'POST') { if (!human(me)) return fail(res, 403, 'people ask for assessments'); return send(res, 200, await assess(pid, me)); }
      if (b === 'plan' && m === 'GET') { const st = must(pid); res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); return res.end(planMd(st)); }
      if (b === 'changes' && c && ['approve', 'deny'].includes(parts[3]) && m === 'POST') { const x = await readBody(req); return send(res, 200, { flow: decide(pid, c, parts[3], me, x.note) }); }
      if (b === 'blockers' && c && parts[3] === 'resolve' && m === 'POST') return send(res, 200, { flow: resolveBlocker(pid, c, me) });
      if (b === 'github' && m === 'POST') {
        if (!human(me)) return fail(res, 403, 'people connect GitHub');
        const x = await readBody(req); const t = str(x.token, 400);
        if (t) { if (!/^[\w-]{20,400}$/.test(t)) return fail(res, 400, 'that token does not look right'); W.writeSecret(me.id, { ...W.readSecret(me.id), githubToken: t }); }
        must(pid); return send(res, 200, { step: await github(pid, me), flow: view(load(pid)) });
      }
      if (b === 'invite' && m === 'POST') {   // a fresh link (old one used up or expired)
        const st = must(pid); const inv = makeInvite({ by: me.id, project: pid });
        st.invite = { code: inv.code, ...linkFor(inv.code), expires: inv.expires }; save(st); push(st);
        return send(res, 200, { flow: view(st) });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, create, start, setRoles, claim, addNote, assess, decide, onTask, onGist, onHead, onCommit, contextLines, roleOf, folderOwner: (pid, f) => { const st = load(pid); return st ? folderOwner(st, f) : null; },
    view: pid => view(load(pid)), load, gists, planMd, PALETTE, GLYPHS };
};
module.exports.writeStarter = writeStarter;
module.exports.addGistRules = addGistRules;
module.exports.DEFAULT_ROLES = DEFAULT_ROLES;
module.exports.PALETTE = PALETTE;
