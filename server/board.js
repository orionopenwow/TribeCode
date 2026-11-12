// Approval board: proposals, votes, milestones, VISION.md, and git tagging of milestones.
'use strict';
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const bus = require('./bus');

const VOTES = ['yes', 'no'];

module.exports = function board({ store, id, slug, str, getMembers, broadcast, postChat, createTask, repo, brain, readVision, can = (me) => me.role === 'host' }) {   // can(me, cap): feat/roles (server/perms.js)
  const file = p => `proposals/${p.id}.md`;
  const load = pid => { const r = store.readMd(`proposals/${pid}.md`); return r && { ...r.meta, body: r.body }; };
  const all = () => store.listMd('proposals').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; })
    .filter(p => p && p.id).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const save = p => { const { body = '', ...meta } = p; store.writeMd(file(p), meta, body); broadcast({ type: 'proposal', proposal: p }); return p; };

  const milestones = () => store.readJSON('milestones.json', []);
  const saveMilestones = m => { store.writeJSON('milestones.json', m); broadcast({ type: 'milestones', milestones: m }); };
  function nextVersion() {
    const ms = milestones();
    const last = ms.map(m => m.version.replace(/^v/, '').split('.').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] || [0, 0, 0];
    return `v${last[0]}.${last[1] + 1}.0`;
  }

  function tally(p) {
    const members = getMembers().filter(m => m.role !== 'spectator' && m.role !== 'agent');
    const voters = members.length || 1;
    const yes = Object.values(p.votes || {}).filter(v => v === 'yes').length;
    const no = Object.values(p.votes || {}).filter(v => v === 'no').length;
    return { yes, no, voters, pending: Math.max(0, voters - yes - no), needed: Math.floor(voters / 2) + 1 };
  }

  function resolve(p, by) {
    if (p.status !== 'open') return p;
    const t = tally(p);
    if (t.yes >= t.needed) return approve(p, by);
    if (t.no >= t.needed || (t.pending === 0 && t.yes < t.needed)) {
      p.status = 'parked'; p.closed = new Date().toISOString(); save(p);
      postChat('general', 'tribecode', `Proposal parked: **${p.title}** (${t.yes} yes · ${t.no} no)`);
    }
    return p;
  }

  function approve(p, by) {
    if (p.kind === 'integration') {   // a merge sign-off, not a feature: no milestone, no tasks
      p.status = 'approved'; p.closed = new Date().toISOString(); save(p);
      postChat('general', 'tribecode', `Approved: **${p.title}**. The integrator can merge now.`);
      return p;
    }
    const version = nextVersion();
    p.status = 'approved'; p.closed = new Date().toISOString(); p.milestone = version;
    // Checklist lines in the proposal become tasks.
    const items = (p.body.match(/^\s*[-*]\s+\[ \]\s+(.+)$/gm) || []).map(l => l.replace(/^\s*[-*]\s+\[ \]\s+/, '').trim()).slice(0, 30);
    const taskIds = items.map(title => createTask({ title, by: p.by, source: 'proposal', body: `From proposal **${p.title}** (${version}).` }).id);
    p.tasks = taskIds;
    save(p);
    const ms = milestones(); ms.push({ version, title: p.title, proposal: p.id, created: p.closed, status: 'planned', tasks: taskIds }); saveMilestones(ms);
    const day = p.closed.slice(0, 10);
    store.writeMd(`decisions/${day}-${slug(p.title)}.md`, { date: day, proposal: p.id, milestone: version, votes: p.votes },
      `# Approved: ${p.title}\n\nMilestone ${version}. ${items.length} task(s) created.\n\n${p.body}`);
    postChat('general', 'tribecode', `Approved: **${p.title}** → milestone **${version}**${items.length ? `, ${items.length} task${items.length > 1 ? 's' : ''} created` : ''} 🎉`);
    return p;
  }

  const repoPath = () => (typeof repo === 'function' ? repo() : repo);   // the current project's repo (server/projects.js)
  const git = (args, cwd) => new Promise((res, rej) => execFile('git', args, { cwd, timeout: 60_000 }, (e, out, err) => (e ? rej(new Error((err || e.message).trim())) : res(out.trim()))));

  async function release(version, me) {
    const ms = milestones(); const m = ms.find(x => x.version === version);
    if (!m) throw Object.assign(new Error('milestone not found'), { status: 404 });
    if (m.status === 'released') throw Object.assign(new Error('already released'), { status: 409 });
    const out = { tagged: false, pushed: false, note: '' };
    const rp = repoPath();
    if (rp && fs.existsSync(path.join(rp, '.git'))) {
      await git(['tag', '-a', version, '-m', `${version}: ${m.title}`], rp);
      out.tagged = true;
      try { await git(['push', 'origin', version], rp); out.pushed = true; }
      catch (e) { out.note = 'Tagged locally; push failed: ' + e.message.split('\n')[0]; }
    } else out.note = 'This project has no code repository yet, so the milestone was recorded without a git tag. Set one up under Code repository to tag releases.';
    m.status = 'released'; m.released = new Date().toISOString(); m.releasedBy = me.id; m.git = out;
    saveMilestones(ms);
    postChat('general', 'tribecode', `Released **${version}**: ${m.title}${out.pushed ? ' · tag pushed to GitHub 🚀' : out.tagged ? ' · tagged in git' : ''}`);
    bus.notify({ type: 'release', priority: 'low', from: me.id, title: `Released ${version}`, body: m.title, view: 'board', ref: version });
    return { milestone: m, ...out };
  }

  async function route(req, res, { m, a, b, c, me, readBody, send, fail }) {
    if (a === 'vision') {
      if (m === 'GET') { let text = ''; try { text = fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch {} return send(res, 200, { text }); }
      if (m === 'PUT') {
        if (!can(me, 'settings.edit')) return fail(res, 403, 'only the host or an admin edits VISION.md directly; propose a change instead');
        const body = await readBody(req); fs.writeFileSync(store.p('VISION.md'), str(body.text, 20000) + '\n');
        postChat('general', 'tribecode', 'VISION.md was updated'); broadcast({ type: 'vision' });   // feat/setup-flow: the checklist and stage.js tick live
        return send(res, 200, { ok: true });
      }
    }
    if (a === 'milestones') {
      if (m === 'GET' && !b) return send(res, 200, { milestones: milestones(), next: nextVersion(), repo: !!repoPath() });
      if (m === 'POST' && b && c === 'release') {
        if (!can(me, 'repo.merge')) return fail(res, 403, 'only the host or an admin can release milestones');
        return send(res, 200, await release(b, me));
      }
    }
    if (a === 'proposals') {
      if (m === 'GET' && !b) return send(res, 200, { proposals: all().map(p => ({ ...p, tally: tally(p) })) });
      if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
      if (m === 'POST' && !b) {
        const body = await readBody(req); const title = str(body.title, 160);
        if (!title) return fail(res, 400, 'title required');
        const p = propose(title, body.body, me);
        return send(res, 200, { proposal: { ...p, tally: tally(p) } });
      }
      const p = b && load(b); if (!p) return fail(res, 404, 'proposal not found');
      if (m === 'POST' && c === 'vote') {
        if (me.role === 'agent') return fail(res, 403, 'agents cannot vote; their humans do');
        if (p.status !== 'open') return fail(res, 409, 'voting is closed');
        const body = await readBody(req);
        if (body.vote === 'clear') delete p.votes[me.id];
        else if (VOTES.includes(body.vote)) p.votes = { ...p.votes, [me.id]: body.vote };
        else return fail(res, 400, 'vote must be yes, no or clear');
        save(p); resolve(p, me);
        const fresh = load(p.id); return send(res, 200, { proposal: { ...fresh, tally: tally(fresh) } });
      }
      if (m === 'POST' && c === 'comment') {   // approval cards: a short comment under the vote
        if (me.role === 'agent') return fail(res, 403, 'agents comment in chat; their humans comment here');
        const body = await readBody(req); const text = str(body.text, 1000); if (!text) return fail(res, 400, 'say something');
        p.comments = [...(p.comments || []), { by: me.id, text, at: new Date().toISOString() }].slice(-50); save(p);
        return send(res, 200, { proposal: { ...p, tally: tally(p) } });
      }
      if (m === 'DELETE') {
        if (p.by !== me.id && !can(me, 'board.manage')) return fail(res, 403, 'only the author, a mod or the host can withdraw');
        if (p.status !== 'open') return fail(res, 409, 'only open proposals can be withdrawn');
        p.status = 'withdrawn'; save(p); return send(res, 200, { ok: true });
      }
    }
    return null; // not handled
  }

  function propose(title, text, me, opts = {}) {
    title = str(title, 160) || 'Untitled proposal';
    const now = new Date().toISOString();
    // An agent's proposal starts with no votes: only humans vote. opts.votes carries ballots over (a passed chat vote, server/votes.js).
    const carried = opts.votes && typeof opts.votes === 'object' ? Object.fromEntries(Object.entries(opts.votes).filter(([mid, v]) => VOTES.includes(v) && getMembers().some(x => x.id === mid && x.role !== 'agent' && x.role !== 'spectator'))) : null;
    const p = save({ id: `p-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title, kind: opts.kind || 'feature', status: 'open', by: me.id, created: now,
      votes: carried || (me.role === 'agent' ? {} : { [me.id]: 'yes' }), body: str(text, 20000), ...(opts.votes ? { from: 'chat-vote' } : {}) });
    postChat('general', 'tribecode', `New proposal from ${me.name}: **${title}**. Vote on the Board.`);
    bus.notify({ type: 'proposal', priority: 'normal', to: getMembers().filter(x => x.role !== 'agent' && x.role !== 'spectator' && x.id !== me.id && x.id !== me.owner).map(x => x.id),
      from: me.id, title: `New proposal from ${me.name}`, body: title, view: 'board', ref: p.id });
    if (brain && p.kind !== 'integration') brain.visionCheck({ vision: readVision(), title, body: p.body }).then(v => {
      if (!v) return; const fresh = load(p.id); if (!fresh) return;
      fresh.vision = v; save(fresh);
      if (!v.fits) postChat('general', 'tribecode', `Heads up: **${title}** may conflict with VISION.md. ${v.note}`);
    }).catch(() => {});
    return resolve(p, me);
  }
  const open = () => all().filter(p => p.status === 'open');

  return { route, tally, propose, open };
};
