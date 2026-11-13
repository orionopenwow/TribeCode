// HTTP for project rooms (server/projects.js) and the shared repo workspace (server/workspace.js):
//   GET    /api/projects                     visible projects with badge counts and who is in each
//   POST   /api/projects                     create: { name } | { path } (host machine) | { url } (clone) | { files } (upload)
//   PATCH  /api/projects/:id                 rename, emoji, color (host); huddleSummary (host or project lead)
//   POST   /api/projects/:id/git-init        make the project folder a git repo (host)
//   POST   /api/projects/:id/members         { member, role } add or remove (role: null) someone (host)
//   GET    /api/projects/:id/pulse           overview: people here, agents, recent changes, upcoming
//   GET    /api/projects/:id/requests        approvals + change requests + proposals of the project
//   GET    /api/projects/:id/workspace       repo, GitHub sign-in on the host, your branch, your git identity
//   POST   /api/projects/:id/branch          "Give me a branch": your own worktree in .trees/<you>
//   POST   /api/projects/:id/branch/commit   commit everything in your worktree as you
//   POST   /api/projects/:id/branch/push     push your branch (your GitHub token if saved, else the host's credentials)
//   PUT    /api/me/git                       { email, githubToken } (token is stored on the host only)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function rooms({ checkFolder = null, watchFolder = null, P, W, store, brain = null, getMembers, saveMembers, isLocal, presenceFor, loadTasks, hubFor, resetHub, plan, approvals, docs, broadcast, postChat, nameOf, str, perms = null }) {
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const host = me => me && me.role === 'host';
  const can = (me, cap, pid) => (perms ? perms.can(me, cap, pid) : host(me));   // feat/roles (server/perms.js)

  function counts(pid) {
    return P.inProject(pid, () => {
      const tasks = loadTasks();
      const proposals = store.listMd('proposals').map(f => (store.readMd(f) || {}).meta).filter(p => p && p.status === 'open');
      const changes = hubFor(pid).listChanges().filter(c => c.status === 'open');
      const aps = approvals.list().filter(a => a.status === 'pending' && (a.project || P.defaultId()) === pid);
      return { tasks: tasks.filter(t => t.status !== 'done').length, docs: store.listMd('docs').length, requests: proposals.length + changes.length + aps.length,
        bugs: store.listMd('bugs').map(f => (store.readMd(f) || {}).meta).filter(b => b && b.status !== 'resolved').length };
    });
  }
  function listFor(me) {
    const people = presenceFor(me);
    return P.visibleTo(me).map(p => P.view(p, { counts: counts(p.id), here: people.filter(m => m.online && m.project === p.id).map(m => m.id), role: p.members[me.id] || (P.scoped(me) ? 'builder' : me.role) }));
  }
  const pushProjects = () => broadcast({ type: 'projects' });

  async function create(req, body, me) {
    if (me.role === 'spectator' || me.role === 'agent' || P.scoped(me)) throw err(403, 'only tribe members can start projects');
    if (perms && !perms.can(me, 'project.create')) throw err(403, 'your role cannot start projects');
    const wantsRepo = body.path || body.url || body.files;
    if (wantsRepo && !host(me)) throw err(403, 'only the host can bring a repo or folder in (git runs on the host machine)');
    const name = str(body.name, 48);
    if (body.path) {
      if (!isLocal(req)) throw err(403, 'local paths only work on the host machine itself');
      let abs = path.resolve(String(body.path).replace(/^~(?=$|\/|\\)/, require('node:os').homedir()));
      let home = false;   // feat/folder-sync: the same path safety as a folder home; a folder that passes it all becomes the project's home
      if (checkFolder) { try { abs = checkFolder(String(body.path), { legacy: true }).real; } catch (e) { throw err(400, e.message); } try { checkFolder(abs); home = true; } catch {} }
      const d = await W.describe(abs);
      if (!d.exists) throw err(400, d.error === 'not a folder' ? 'That path is a file, not a folder' : 'No folder at that path on the host');
      const dup = P.all().find(p => p.repo && path.resolve(p.repo) === abs);
      if (dup) return { project: dup, existed: true, needsGit: !d.git };
      const p = P.create({ name: name || d.name, emoji: body.emoji, by: me.id, repo: abs }); if (home) { P.update(p.id, { folder: abs }); if (watchFolder) watchFolder(p.id); }
      if (!d.git && body.init) await W.makeRepo(abs, me);
      return { project: p, needsGit: !W.isRepo(abs), remote: d.remote };
    }
    if (body.url) {
      if (!W.okUrl(body.url)) throw err(400, 'That does not look like a git URL (https://github.com/you/repo, git@github.com:you/repo.git, or a path)');
      const p = P.create({ name: name || W.repoNameFromUrl(body.url), emoji: body.emoji, by: me.id, workspace: true });
      const dest = store.p('workspaces', p.id);
      try { await W.clone(body.url, dest); } catch (e) { P.remove(p.id); throw e; }
      P.update(p.id, { repo: dest });
      return { project: P.get(p.id), cloned: true, remote: await W.remoteOf(dest) };
    }
    if (body.files) {
      const p = P.create({ name: name || 'Dropped folder', emoji: body.emoji, by: me.id, workspace: true });
      const dest = store.p('workspaces', p.id);
      let up; try { up = W.writeUpload(dest, body.files); await W.makeRepo(dest, me); } catch (e) { P.remove(p.id); try { fs.rmSync(dest, { recursive: true, force: true }); } catch {} throw e; }
      P.update(p.id, { repo: dest });
      return { project: P.get(p.id), uploaded: up };
    }
    return { project: P.create({ name: name || 'New project', emoji: body.emoji, by: me.id }) };
  }

  function pulse(pid, me) {
    const people = presenceFor(me);
    return P.inProject(pid, () => {
      const p = P.get(pid), hub = hubFor(pid), st = hub.status() || {};
      const memberIds = new Set(Object.keys(p.members || {}));
      const here = people.filter(m => m.online && m.project === pid);
      const agents = people.filter(m => m.role === 'agent' && m.online && (m.project === pid || memberIds.has(m.owner)));
      const tasks = loadTasks();
      const recent = [
        ...tasks.map(t => ({ kind: 'task', at: t.updated || t.created, text: `${t.title}`, sub: `${t.status}${t.updatedBy ? ' · ' + nameOf(t.updatedBy) : ''}`, ref: t.id })),
        ...docs.list().slice(0, 8).map(d => ({ kind: 'doc', at: d.updated, text: d.title, sub: `doc${d.updatedBy ? ' · ' + nameOf(d.updatedBy) : ''}`, ref: d.slug })),
        ...((st.commits || []).slice(0, 5).map(c => ({ kind: 'commit', at: c.at, text: c.subject, sub: `${c.sha} · ${c.author}` }))),
      ].filter(x => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10);
      const team = [...new Set([...memberIds, ...here.map(m => m.id)])].map(id => people.find(m => m.id === id)).filter(Boolean)
        .map(m => ({ id: m.id, name: m.name, color: m.color, role: p.members[m.id] || m.role, online: m.online, here: m.online && m.project === pid, kind: m.role === 'agent' ? 'agent' : 'person' }));
      return { project: P.view(p, { counts: counts(pid) }), here: here.map(m => ({ id: m.id, name: m.name, color: m.color, where: m.where, role: m.role })),
        agents: agents.map(a => ({ id: a.id, name: a.name, where: a.where, since: a.since })), team, recent, taskCount: tasks.length,
        upcoming: plan.upcoming(5, me), repo: st.enabled ? { name: st.name, branch: st.branch, ahead: st.ahead, behind: st.behind, dirty: st.dirtyCount } : null,
        ...living(pid, p, tasks, st, recent) };
    });
  }

  // ---------- the living update on a project's overview: a few short lines, refreshed as things happen ----------
  // Rule-based right away; the local model (when it runs) rewrites the one-line summary in the background.
  const briefs = new Map();   // pid -> { text, at, key }
  function living(pid, p, tasks, st, recent) {
    let vision = ''; try { vision = require('node:fs').readFileSync(store.p('VISION.md'), 'utf8'); } catch {}
    // The starter's placeholder (templates/flow-starter/VISION.md) still counts as no vision yet.
    const vtext = /Replace these lines together/.test(vision) ? '' : vision.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim();
    const day = Date.now() - 24 * 3600_000, week = Date.now() - 7 * 24 * 3600_000;
    let chat = []; try { chat = store.readJSONL('chat/general.jsonl', 400).filter(m => !m.deleted && m.by !== 'tribecode'); } catch {}
    const chatDay = chat.filter(m => Date.parse(m.at) > day), last = chat[chat.length - 1];
    const speakers = [...new Set(chatDay.map(m => m.by))].map(nameOf).filter(Boolean);
    const commitsWeek = (st.commits || []).filter(c => Date.parse(c.at) > week).length;
    const doing = tasks.filter(t => t.status === 'doing'), todo = tasks.filter(t => t.status === 'backlog' || t.status === 'review'), doneWeek = tasks.filter(t => t.status === 'done' && Date.parse(t.updated || t.created) > week);
    const up = plan.upcoming(3);
    const mood = chatDay.length >= 20 || commitsWeek >= 10 ? 'buzzing' : chatDay.length || commitsWeek || doneWeek.length ? 'steady' : chat.length || tasks.length ? 'quiet' : 'fresh';
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const lines = {
      lately: doneWeek.length || commitsWeek ? [doneWeek.length ? `${pl(doneWeek.length, 'task')} done` : '', commitsWeek ? pl(commitsWeek, 'commit') : ''].filter(Boolean).join(' · ') + ' this week'
        : recent[0] ? `Last: ${recent[0].text}` : 'Nothing yet',
      chat: chatDay.length ? `${pl(chatDay.length, 'message')} today${speakers.length ? ` · ${speakers.slice(0, 3).join(', ')}` : ''}` : last ? `Quiet today · last from ${nameOf(last.by) || 'someone'}` : 'No messages yet',
      next: doing.length ? `In progress: ${doing[0].title}${doing.length > 1 ? ` (+${doing.length - 1})` : ''}` : todo.length ? `Up next: ${todo[0].title}${todo.length > 1 ? ` (+${todo.length - 1})` : ''}` : 'No tasks yet',
      soon: up.length ? `${up[0].title} · ${new Date(up[0].at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${up.length > 1 ? ` (+${up.length - 1})` : ''}` : 'Nothing on the calendar',
    };
    const rule = mood === 'fresh' ? `${p.name} is brand new: write a line of vision, add a first task, invite a friend.`
      : mood === 'buzzing' ? `${p.name} is buzzing${speakers.length ? ` with ${speakers.slice(0, 2).join(' and ')}` : ''}. ${doing.length ? `Focus: ${doing[0].title}.` : todo.length ? `Next up: ${todo[0].title}.` : ''}`
      : mood === 'steady' ? `Steady progress${doneWeek.length ? `: ${pl(doneWeek.length, 'task')} done this week` : ''}. ${doing.length ? `Now: ${doing[0].title}.` : todo.length ? `Next: ${todo[0].title}.` : 'Pick the next task.'}`
      : `Quiet lately. ${todo.length ? `${todo[0].title} is waiting.` : 'A new task or a question in chat gets it moving.'}`;
    const key = [chat.length, tasks.length, doneWeek.length, commitsWeek, up.length, doing.map(t => t.id).join()].join('|');
    const cached = briefs.get(pid);
    if (brain && brain.status && brain.status().online && (!cached || cached.key !== key) && mood !== 'fresh' && !(cached && cached.busy)) {
      briefs.set(pid, { ...(cached || {}), busy: true, key });
      const ctx = `Project: ${p.name}${p.bio ? ` (${p.bio})` : ''}\nVision: ${vtext.slice(0, 300) || '(none)'}\nLately: ${lines.lately}\nChat: ${lines.chat}\nNext: ${lines.next}\nCalendar: ${lines.soon}\nRecent chat:\n${chat.slice(-12).map(m => `${nameOf(m.by) || 'someone'}: ${String(m.text || '').slice(0, 140)}`).join('\n')}`;
      brain.generate(`${ctx}\n\nIn ONE short, warm sentence (max 25 words), say how the project is going and what's next. Plain text.`,
        { system: 'You write the one-line status of a small team project for its dashboard. Be specific and brief. No preamble.', maxTokens: 70, timeoutMs: 20000 })
        .then(t => briefs.set(pid, { text: t ? t.replace(/\s+/g, ' ').trim().slice(0, 220) : null, at: Date.now(), key }))
        .catch(() => briefs.set(pid, { text: null, at: Date.now(), key }));
    }
    const ai = cached && cached.text && cached.key === key ? cached.text : null;
    return { bio: p.bio || '', vision: { has: !!vtext, excerpt: vtext.slice(0, 160) }, living: { mood, summary: ai || rule.replace(/\s+/g, ' ').trim(), by: ai ? 'local model' : 'tribecode', lines } };
  }

  function requests(pid) {
    return P.inProject(pid, () => ({
      approvals: approvals.list().filter(a => (a.project || P.defaultId()) === pid).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 40),
      changes: hubFor(pid).listChanges().slice(0, 40),
      proposals: store.listMd('proposals').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: undefined }; }).filter(x => x && x.id)
        .sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 40),
    }));
  }

  async function workspaceInfo(p, me) {
    const repo = p.repo ? await W.describe(p.repo) : { exists: false };
    const m = getMembers().find(x => x.id === me.id) || me;
    return { repo: repo.exists ? { name: repo.name, git: repo.git, remote: repo.remote, inTribe: !!p.workspace, path: host(me) ? repo.path : undefined } : null,
      github: await W.ghStatus(), branch: repo.git ? await W.myBranch(p.repo, me) : null,
      identity: { name: me.name, email: W.emailOf(m), custom: !!m.email, hasToken: W.hasToken(me.id) } };
  }

  async function route(req, res, { m, a, b, c, parts, me, readBody, send, fail }) {
    if (a === 'me' && b === 'git' && m === 'PUT') {
      if (me.role === 'agent') return fail(res, 403, 'agents use their owner\'s identity');
      const body = await readBody(req); const mem = getMembers().find(x => x.id === me.id);
      if (body.email !== undefined) { const e = str(body.email, 120); if (e && !/^[^\s@<>]+@[^\s@<>]+$/.test(e)) return fail(res, 400, 'that email does not look right'); mem.email = e || undefined; saveMembers(); }
      if (body.githubToken !== undefined) { const t = str(body.githubToken, 400); if (t && !/^[\w-]{20,400}$/.test(t)) return fail(res, 400, 'that token does not look right'); W.writeSecret(me.id, t ? { githubToken: t } : null); }
      return send(res, 200, { identity: { email: W.emailOf(mem), custom: !!mem.email, hasToken: W.hasToken(me.id) } });
    }
    if (a !== 'projects') return null;
    if (!b && m === 'GET') return send(res, 200, { projects: listFor(me), current: P.current() });
    if (!b && m === 'POST') {
      const body = await readBody(req, 40 * 1024 * 1024);
      const out = await create(req, body, me);
      if (out.project) { P.addMember(out.project.id, me.id, 'host'); resetHub(out.project.id); }
      if (!out.existed) P.inProject(out.project.id, () => postChat('general', 'tribecode', `${me.name} started **${out.project.name}**${out.cloned ? ' from a git clone' : out.uploaded ? ` from a dropped folder (${out.uploaded.written} files)` : out.project.repo ? ' from a folder on the host' : ''} 🔥`));
      pushProjects();
      return send(res, 200, { ...out, project: P.view(P.get(out.project.id)) });
    }
    const p = P.get(b);
    if (!p || !P.canSee(me, b)) return fail(res, 404, 'project not found');
    if (!c && m === 'PATCH') {   // the host renames and recolors; any builder in the project can set its picture
      if (me.role === 'spectator' || me.role === 'agent') return fail(res, 403, 'read-only');
      const body = await readBody(req, 512 * 1024);
      if (body.image !== undefined && body.image !== null && body.image !== '' && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(String(body.image))) return fail(res, 400, 'use a PNG, JPEG, WebP or GIF image');
      const shared = { image: body.image, bio: typeof body.bio === 'string' ? body.bio : undefined };   // any builder: picture and bio
      // "Post a summary after each huddle" (server/huddlesum.js): the tribe host or the project's lead.
      if (typeof body.huddleSummary === 'boolean') { if (!host(me) && p.members[me.id] !== 'host') return fail(res, 403, 'only the host or the project lead can change this'); shared.huddleSummary = body.huddleSummary; }
      P.update(b, can(me, 'settings.edit', b) ? { name: str(body.name, 48), emoji: body.emoji, color: body.color, ...shared } : shared);
      pushProjects(); return send(res, 200, { project: P.view(P.get(b)) });
    }
    if (!c && m === 'DELETE') {   // the host deletes a project: it leaves the list; its tribe data goes to .tribe/trash (the code folder is never touched)
      if (!can(me, 'project.delete', b)) return fail(res, 403, 'only the host or an admin can delete a project');
      if (p.id === P.defaultId()) return fail(res, 400, 'the first project stays: rename it instead');
      const body = await readBody(req).catch(() => ({}));
      if (str(body.confirm, 48) !== p.name) return fail(res, 400, 'type the project name to confirm');
      P.trash(p.id);
      pushProjects(); broadcast({ type: 'project-removed', id: p.id });
      return send(res, 200, { ok: true, removed: p.id });
    }
    if (c === 'pulse' && m === 'GET') return send(res, 200, pulse(b, me));
    if (c === 'requests' && m === 'GET') return send(res, 200, requests(b));
    if (c === 'git-init' && m === 'POST') {
      if (!host(me)) return fail(res, 403, 'only the host');
      if (!p.repo) return fail(res, 400, 'this project has no folder');
      const r = await W.makeRepo(p.repo, me); resetHub(b); pushProjects();
      return send(res, 200, { ...r, workspace: await workspaceInfo(p, me) });
    }
    if (c === 'members' && m === 'POST') {
      const body = await readBody(req); const who = getMembers().find(x => x.id === body.member); if (!who) return fail(res, 400, 'unknown member');
      // feat/roles: mods remove (members.remove), admins/mods raise per-project roles (roles.assign) under the rank rules in server/perms.js
      if (perms && !host(me)) {
        try {
          if (body.role === null) return send(res, 200, { ...perms.removeFromProject(me, who.id, b), project: P.view(P.get(b)) });
          if (body.role === 'admin' || body.role === 'mod') return send(res, 200, { ...perms.assign(me, who.id, body.role, b), project: P.view(P.get(b)) });
        } catch (e) { return fail(res, e.status || 400, e.message); }
      }
      if (perms && host(me) && (body.role === 'admin' || body.role === 'mod')) { try { perms.assign(me, who.id, body.role, b); } catch (e) { return fail(res, e.status || 400, e.message); } return send(res, 200, { project: P.view(P.get(b)) }); }
      if (!host(me)) return fail(res, 403, 'only the host');
      if (body.role === null) { delete p.members[who.id]; if (Array.isArray(who.projects)) { who.projects = who.projects.filter(x => x !== b); saveMembers(); } P.update(b, {}); }
      else { P.addMember(b, who.id, ['builder', 'spectator', 'host'].includes(body.role) ? body.role : 'builder'); if (Array.isArray(who.projects) && !who.projects.includes(b)) { who.projects.push(b); saveMembers(); } }
      pushProjects(); return send(res, 200, { project: P.view(P.get(b)) });
    }
    if (c === 'workspace' && m === 'GET') return send(res, 200, await workspaceInfo(p, me));
    if (c === 'branch' && m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
      if (!p.repo || !W.isRepo(p.repo)) return fail(res, 400, 'this project has no git repo yet');
      const owner = me.role === 'agent' && me.owner ? getMembers().find(x => x.id === me.owner) || me : getMembers().find(x => x.id === me.id) || me;
      const action = parts[3];
      if (!action) { const r = await W.giveBranch(p.repo, owner); P.inProject(b, () => hubFor(b).poll({ force: true }).catch(() => {})); return send(res, 200, { branch: r }); }
      if (action === 'commit') { const body = await readBody(req); const r = await W.commitAs(p.repo, owner, str(body.message, 2000)); return send(res, 200, { branch: r }); }
      if (action === 'push') return send(res, 200, await W.pushAs(p.repo, owner));
    }
    return null;
  }

  return { route, listFor, counts, pulse, requests, create, pushProjects };
};
