// The demo tribe (scripts/start-demo-tribe.js): one local-only call that turns folders the script already copied
// (templates/lantern-run, templates/tavern-3d, each a git repo) into ready-to-test projects:
//   project from the folder -> the flow with roles whose folders are the game's lanes -> a ready-made plan (tasks per
//   lane, PLAN.md committed) -> notes, a pinned living doc, a proposal vote, toolbox picks -> repo autopilot on ->
//   GitHub (the flow's github step: the host's saved token or the gh CLI, else it stays local).
// Returns a tribe-wide invite (both projects), one link per project and the Claude Code command for a dedicated
// "Claude (demo)" agent.
//
//   POST /api/host/demo-tribe   only from this machine (isLocal). Never touches the host's own key: the desktop
//                               app stays signed in. Re-running it reuses projects already made from the same folders.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function demo(d) {
  const { P, rooms, flow, shelf, docs, docsx, chatx, hubFor, resetHub, getMembers, newMember, saveMembers, pushPresence, devices, share, site, lanUrls,
    makeInvite, linkFor, isLocal, endpoints, id, hash, slug, postChat, str, port } = d;
  const err = (status, m) => Object.assign(new Error(m), { status });
  const one = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

  function hostOf(req, name) {
    let host = getMembers().find(x => x.role === 'host'), hostOpen = null;
    if (!host) {   // a brand-new tribe: make the host, like /api/host/quick-invite does, and hand back a signed-in link
      host = newMember({ name: one(name, 32) || 'Host', role: 'host' }).member;
      postChat('general', 'tribecode', `${host.name} started the tribe 🔥`);
      hostOpen = `http://localhost:${port}/m/${devices.create(host, req, 'This computer').key}/`;
    }
    return { host, hostOpen };
  }

  // A labelled agent of the host's (its own key), so the host's everyday Claude Code key is never rotated.
  function demoAgent(host, pid) {
    const members = getMembers(), token = id(32);
    let ag = members.find(x => x.role === 'agent' && x.owner === host.id && x.label === 'Claude (demo)');
    if (ag) { ag.tokenHash = hash(token); ag.project = pid; }
    else {
      ag = { id: 'agent-' + slug(host.name).slice(0, 10) + '-' + id(4), name: `Claude (demo) · ${host.name}`.slice(0, 32), color: '#38C6B1', role: 'agent', owner: host.id,
        joined: new Date().toISOString(), tokenHash: hash(token), project: pid, label: 'Claude (demo)', kind: 'claude-code' };
      members.push(ag);
    }
    saveMembers(); pushPresence();
    return token;
  }

  async function seed(req, spec, host) {
    const abs = path.resolve(String(spec.path || ''));
    if (!spec.path || !fs.existsSync(abs)) throw err(400, `no folder at ${spec.path}`);
    const r = await rooms.create(req, { path: abs, name: one(spec.name, 48), emoji: spec.emoji, init: true }, host);
    const pid = r.project.id, done = [];
    P.addMember(pid, host.id, 'host');
    if (spec.bio) P.update(pid, { bio: String(spec.bio) });
    // The project's VISION.md in the tribe folder (the Board's vision checks read it) starts from the repo's.
    try { const v = P.scopedStore(() => pid).p('VISION.md'); if (!fs.existsSync(v) && fs.existsSync(path.join(abs, 'VISION.md'))) fs.copyFileSync(path.join(abs, 'VISION.md'), v); } catch {}
    resetHub(pid); hubFor(pid);
    if (r.existed && flow.load(pid)) return { pid, existed: true, done };

    flow.adopt(pid, { roles: spec.roles }, host); done.push('roles');
    for (const n of (spec.notes || []).slice(0, 6)) { try { flow.addNote(pid, { name: one(n.name, 120), text: String(n.text || '') }, host); done.push('note'); } catch (e) { console.error('demo note:', e.message); } }
    if (Array.isArray(spec.plan) && spec.plan.length) {
      const plan = spec.plan.slice(0, 6).map(m => ({ title: one(m.title, 60) || 'Milestone', items: (m.items || []).slice(0, 8).map(x => one(x, 140)).filter(Boolean) })).filter(m => m.items.length);
      await flow.start(pid, host, plan); done.push('plan');
    }
    P.inProject(pid, () => {
      for (const doc of (spec.docs || []).slice(0, 4)) {
        const w = docs.upsert({ name: one(doc.name, 120), body: String(doc.body || ''), by: host.id });
        if (w.doc && doc.pinned) docsx.setMeta(w.doc.slug, { pinned: true });
        if (w.doc) done.push('doc');
      }
      if (spec.vote && spec.vote.title) { try { chatx.votes.create('general', host, { pitch: { title: one(spec.vote.title, 120), body: String(spec.vote.body || '') } }); done.push('vote'); } catch (e) { console.error('demo vote:', e.message); } }
      if (spec.welcome) postChat('general', 'tribecode', String(spec.welcome).slice(0, 2000));
    });
    for (const sid of (spec.shelf || []).slice(0, 6)) { try { await shelf.add(sid, pid, host); done.push('shelf'); } catch (e) { console.error(`demo shelf ${sid}:`, e.message); } }
    if (spec.autopilot !== false) {
      try { hubFor(pid).updateSettings({ autopilot: { enabled: true, autoPull: true, commitContext: true, reportTags: true } }); done.push('autopilot'); } catch (e) { console.error('demo autopilot:', e.message); }
    }
    // GitHub: a new private repo + push when the host has a token saved (or the gh CLI is signed in); runs on in the background.
    const github = flow.github(pid, host).catch(e => console.error('demo github:', e.message));
    return { pid, existed: false, done, github };
  }

  async function route(req, res, { m, readBody, send, fail }) {
    if (m !== 'POST') return fail(res, 404, 'not found');
    if (!isLocal(req)) return fail(res, 403, 'only from the host machine');
    try {
      const body = await readBody(req, 1024 * 1024);
      const specs = Array.isArray(body.projects) ? body.projects.slice(0, 4) : [];
      if (!specs.length) return fail(res, 400, 'no projects to set up');
      const { host, hostOpen } = hostOf(req, body.name);
      let shared = null;
      if (body.share) { try { shared = await share.start(['tailscale', 'cloudflare'].includes(body.provider) ? body.provider : ''); } catch (e) { shared = { status: 'error', message: e.message }; } }
      const seeded = [];
      for (const spec of specs) seeded.push(await seed(req, spec, host));
      // Give the GitHub pushes a moment so the answer can say where the code went (they finish in the background anyway).
      await Promise.race([Promise.all(seeded.map(s => s.github)), new Promise(r => setTimeout(r, 20_000))]);
      const out = [];
      for (const s of seeded) {
        const p = P.get(s.pid), st = flow.view(s.pid) || {};
        const inv = makeInvite({ by: host.id, project: s.pid });
        out.push({ id: s.pid, name: p.name, emoji: p.emoji, repo: p.repo, existed: s.existed, seeded: s.done, roles: (st.roles || []).map(r => ({ id: r.id, name: r.name, folders: r.folders.map(f => f.path) })),
          tasks: st.plan ? st.plan.total : 0, github: st.github || null, githubStep: (st.steps || {}).github || null, invite: linkFor(inv.code).link });
      }
      const inv = makeInvite({ by: host.id });   // tribe-wide: a friend who joins sees both projects
      const token = demoAgent(host, out[0].id);
      const ep = endpoints(req, token);
      const base = (share.publicUrl() || (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url || `http://localhost:${port}`).replace(/\/+$/, '');
      return send(res, 200, { join: site.joinLink(base, inv.code), projects: out, agentCommand: ep.command, agentCommands: ep.commands, public: !!share.publicUrl(),
        provider: shared && shared.provider, approveUrl: (shared && shared.approveUrl) || null, shareMessage: shared && shared.status !== 'on' ? (shared.message || '') : '',
        hostOpen, host: host.name, open: `http://localhost:${port}/?project=${encodeURIComponent(out[0].id)}`, expires: inv.expires });
    } catch (e) { console.error('demo tribe:', e.message); return fail(res, e.status || 500, e.message); }
  }
  return { route };
};
