// Jam mode (v0.27): a game jam inside your tribe. The host picks a theme and a length (1–72 h); everyone sees a countdown,
// starts a project from a starter with one button, publishes it (server/publish.js) and submits the play link. When time
// is up, voting opens: one vote per person, never for your own entry. Then the results card. Tribe-local, no central server.
//
//   GET    /api/jam                 -> { jam, phase, now, mine }      phase: none | live | voting | done
//   POST   /api/jam                 { theme, hours, rules?, voteHours? }   (host or admin)  start a jam
//   POST   /api/jam/join            -> { project }       a new project from the game starter, named for the jam
//   POST   /api/jam/submit          { project }          the project must be published; re-submitting updates it
//   POST   /api/jam/vote            { project }          voting phase only; one vote per person (changing it is fine)
//   POST   /api/jam/end             (host or admin)      live -> voting, voting -> done
//   DELETE /api/jam                 (host or admin)      cancel; the jam moves to past jams
// Stored in .tribe/jam.json (the tribe folder).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function jam({ P, W, base, setupFlow, publish, getMembers, broadcast, postChat, nameOf, now = () => Date.now() }) {
  const FILE = '.tribe/jam.json';
  let db = base.readJSON(FILE, { current: null, past: [] });
  db.past = db.past || [];
  const save = () => base.writeJSON(FILE, db);
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = id => getMembers().find(m => m.id === id);
  const runs = me => !!me && (me.role === 'host' || me.role === 'admin');
  const iso = t => new Date(t).toISOString();
  const announce = t => { try { P.inProject(P.defaultId(), () => postChat('general', 'tribecode', t)); } catch {} };   // tribe-wide news goes to the main room

  function phaseOf(j) {
    if (!j) return 'none';
    const t = now();
    if (j.closed) return 'done';
    if (t < Date.parse(j.end)) return 'live';
    if (t < Date.parse(j.voteEnd)) return 'voting';
    return 'done';
  }
  function results(j) {
    const tally = {};
    for (const pid of Object.values(j.votes || {})) tally[pid] = (tally[pid] || 0) + 1;
    return (j.entries || []).map(e => ({ ...e, votes: tally[e.project] || 0 })).sort((a, b) => b.votes - a.votes || String(a.at).localeCompare(String(b.at)));
  }
  function view(j, me) {
    if (!j) return null;
    const phase = phaseOf(j), entries = (phase === 'done' ? results(j) : (j.entries || []).map(e => ({ ...e }))).map(e => {
      const pub = publish.entry(e.slug) || null;
      return { ...e, byName: nameOf(e.by), url: pub ? pub.url : null, card: pub ? pub.card : null, title: (pub && pub.title) || e.title, ...(phase === 'done' ? {} : { votes: undefined }) };
    });
    return { id: j.id, theme: j.theme, rules: j.rules, start: j.start, end: j.end, voteEnd: j.voteEnd, by: j.by, byName: nameOf(j.by), phase, entries,
      voters: Object.keys(j.votes || {}).length, myVote: me ? (j.votes || {})[me.id] || null : null, winner: phase === 'done' && entries[0] && entries[0].votes ? entries[0] : null };
  }
  const push = () => broadcast({ type: 'jam' });
  const maybeFinish = () => {   // a finished jam moves to past jams the first time someone looks after the vote closes
    const j = db.current; if (!j || phaseOf(j) !== 'done' || j.announced) return;
    j.announced = true; save();
    const w = results(j)[0];
    announce(w && w.votes ? `🏆 The **${j.theme}** jam is over. ${nameOf(w.by)}'s **${w.title}** wins with ${w.votes} vote${w.votes > 1 ? 's' : ''}.` : `The **${j.theme}** jam is over.`);
    push();
  };

  function start(me, body) {
    if (!runs(me)) throw err(403, 'only the host (or an admin) can start a jam');
    if (db.current && phaseOf(db.current) !== 'done') throw err(409, 'a jam is already running');
    const theme = String(body.theme || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!theme) throw err(400, 'give the jam a theme');
    const hours = Math.max(1, Math.min(72, Number(body.hours) || 48)), voteHours = Math.max(1, Math.min(72, Number(body.voteHours) || 24));
    if (db.current) db.past.unshift(db.current), db.past = db.past.slice(0, 20);
    const t = now();
    db.current = { id: `jam-${t.toString(36)}`, theme, rules: String(body.rules || '').trim().slice(0, 600), start: iso(t), end: iso(t + hours * 3600_000), voteEnd: iso(t + (hours + voteHours) * 3600_000), by: me.id, entries: [], votes: {} };
    save(); push();
    announce(`🏁 **Jam time!** Theme: **${theme}**. ${hours} hour${hours > 1 ? 's' : ''} to make something, then ${voteHours} h of voting. Tap *Join the jam* to start from a starter.`);
    return view(db.current, me);
  }
  async function join(me) {
    const j = db.current; if (!j || phaseOf(j) !== 'live') throw err(409, 'no jam is open for new entries right now');
    if (!me || me.role === 'agent' || me.role === 'spectator' || P.scoped(me)) throw err(403, 'join the tribe as a builder to enter the jam');
    const p = P.create({ name: `${j.theme} · ${nameOf(me.id)}`.slice(0, 48), emoji: '🏁', by: me.id });
    try {
      const { repo } = await setupFlow.ensureRepo(p.id, me);
      const src = require('./tpldir')('starter-game');
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      (function copy(dir, rel) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          if (f.name.startsWith('.') || f.name === 'node_modules') continue;
          const s = path.join(dir, f.name), d = path.join(repo, rel, f.name);
          if (f.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, path.join(rel, f.name)); continue; }
          if (fs.existsSync(d) && f.name === 'README.md') continue;
          if (/\.(html|css|js|md|json|txt)$/i.test(f.name)) fs.writeFileSync(d, fs.readFileSync(s, 'utf8').replace(/\{\{name\}\}/g, esc(p.name)).replace(/\{\{gist\}\}/g, esc(`A jam entry for "${j.theme}"`)).replace(/\{\{[a-z]+\}\}/g, '').replace('<title>Pixel Quest</title>', `<title>${esc(p.name)}</title>`));
          else fs.copyFileSync(s, d);
        }
      })(src, '');
      fs.writeFileSync(path.join(repo, 'VISION.md'), `# ${p.name}\n\nA game for the **${j.theme}** jam.${j.rules ? `\n\nRules: ${j.rules}` : ''}\n`);
      await W.git(['add', '-A'], repo);
      await W.git([...W.identity(member(me.id) || me), 'commit', '-q', '-m', `Start the ${j.theme} jam entry (via TribeCode)`], repo);
    } catch (e) { P.remove(p.id); throw err(500, 'Could not start the entry: ' + e.message); }
    broadcast({ type: 'projects' });
    return { project: P.get(p.id) };
  }
  function submit(me, body) {
    const j = db.current; if (!j || phaseOf(j) !== 'live') throw err(409, 'submissions are closed');
    if (!me || me.role === 'spectator') throw err(403, 'spectators can watch the jam and vote');
    const pid = String(body.project || ''); if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found');
    const pub = publish.entriesOf(pid)[0];
    if (!pub) throw err(409, 'Publish it first: the jam entry is its play link.');
    const by = me.role === 'agent' && me.owner ? me.owner : me.id;
    const prev = j.entries.find(e => e.project === pid);
    if (prev) Object.assign(prev, { slug: pub.slug, title: pub.title, updated: iso(now()) });
    else j.entries.push({ project: pid, slug: pub.slug, title: pub.title, by, at: iso(now()) });
    save(); push();
    if (!prev) announce(`🎮 ${nameOf(by)} entered **${pub.title}** in the ${j.theme} jam: ${pub.url}`);
    return view(j, me);
  }
  function vote(me, body) {
    const j = db.current; if (!j || phaseOf(j) !== 'voting') throw err(409, 'voting is not open');
    if (!me || me.role === 'agent') throw err(403, 'AI helpers don\'t vote');
    const e = j.entries.find(x => x.project === String(body.project || '')); if (!e) throw err(404, 'that is not a jam entry');
    if (e.by === me.id) throw err(403, 'you can\'t vote for your own entry');
    j.votes[me.id] = e.project; save(); push();
    return view(j, me);
  }
  function end(me) {
    if (!runs(me)) throw err(403, 'only the host (or an admin) can end the jam');
    const j = db.current; if (!j) throw err(404, 'no jam');
    const ph = phaseOf(j), t = now();
    if (ph === 'live') { const left = Date.parse(j.voteEnd) - Date.parse(j.end); j.end = iso(t); j.voteEnd = iso(t + left); }
    else if (ph === 'voting') { j.voteEnd = iso(t); j.closed = true; }
    save(); maybeFinish(); push();
    return view(j, me);
  }
  function cancel(me) {
    if (!runs(me)) throw err(403, 'only the host (or an admin) can cancel the jam');
    if (!db.current) throw err(404, 'no jam');
    db.current.cancelled = true; db.past.unshift(db.current); db.past = db.past.slice(0, 20); db.current = null; save(); push();
    return { ok: true };
  }
  function status(me) { maybeFinish(); const j = db.current; return { jam: view(j, me), phase: phaseOf(j), now: iso(now()), canRun: runs(me), mine: j && me ? j.entries.filter(e => e.by === me.id).map(e => e.project) : [] }; }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      if (m === 'GET' && !b) return send(res, 200, status(me));
      if (m === 'POST' && !b) return send(res, 200, { jam: start(me, await readBody(req, 8 * 1024).catch(() => ({}))) });
      if (m === 'POST' && b === 'join') return send(res, 200, await join(me));
      if (m === 'POST' && b === 'submit') return send(res, 200, { jam: submit(me, await readBody(req, 4096).catch(() => ({}))) });
      if (m === 'POST' && b === 'vote') return send(res, 200, { jam: vote(me, await readBody(req, 4096).catch(() => ({}))) });
      if (m === 'POST' && b === 'end') return send(res, 200, { jam: end(me) });
      if (m === 'DELETE' && !b) return send(res, 200, cancel(me));
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such jam route');
  }

  const text = t => ({ content: [{ type: 'text', text: t }] });
  const mcpTools = {
    jam_status: {
      description: 'The tribe\'s game jam: theme, rules, time left, phase (live / voting / done), entries with their play links, and results when it is over.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: async (_a, me) => {
        const s = status(me), j = s.jam; if (!j) return text('No jam right now. The host can start one (theme + 1–72 hours).');
        const left = Math.max(0, Date.parse(j.phase === 'live' ? j.end : j.voteEnd) - now());
        return text(`Jam "${j.theme}" · ${j.phase}${j.phase !== 'done' ? ` · ${Math.round(left / 60000)} min left` : ''}${j.rules ? `\nRules: ${j.rules}` : ''}\nEntries (${j.entries.length}):\n${j.entries.map(e => `- ${e.title} by ${e.byName}${e.url ? ' · ' + e.url : ''}${j.phase === 'done' ? ` · ${e.votes} votes` : ''}`).join('\n') || '- none yet'}`);
      },
    },
    jam_submit: {
      description: 'Submit a project to the running jam. The project must be published first (publish_project; your owner approves). Re-submitting updates the entry.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
      run: async ({ project } = {}, me) => { try { submit(me, { project: project || P.current() }); return text('Submitted to the jam.'); } catch (e) { return text('Not submitted: ' + e.message); } },
    },
  };
  return { route, status, mcpTools, phaseOf: () => phaseOf(db.current) };
};
