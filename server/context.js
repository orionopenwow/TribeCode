// Living context file: TRIBE_CONTEXT.md, a compact brief of the whole tribe that AI agents (and
// people) can read or paste in one go. Written to the tribe folder and, with --repo, to the repo
// root. Regenerated (debounced) whenever the tribe folder changes, the repo status changes, or
// someone comes online; only rewritten when its content actually changed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEBOUNCE = Number(process.env.TRIBE_CONTEXT_DEBOUNCE_MS) || 10_000;
const MAX_LINES = 250;

module.exports = function context({ store, repo, settings, tribe, readVision, presence, loadTasks, nameOf, board, claims, changes, repoStatus, broadcast, file }) {
  let timer = null, last = '', watcher = null;
  const one = (s, n = 140) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const hm = iso => { try { return new Date(iso).toISOString().slice(11, 16); } catch { return ''; } };

  function proposals() {
    return store.listMd('proposals').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; })
      .filter(p => p && p.id).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 50);
  }
  function decisions(n = 5) {
    return store.listMd('decisions').sort().reverse().slice(0, n).map(f => {
      const r = store.readMd(f); if (!r) return null;
      const h = (r.body.match(/^#\s+(.+)$/m) || [])[1] || path.basename(f, '.md').slice(11);
      return { date: r.meta.date || path.basename(f).slice(0, 10), title: h.trim() };
    }).filter(Boolean);
  }

  // Facts: a structured snapshot used to say "what changed since last time".
  function facts({ tasks, props, crs, decs, cls, st, people }) {
    return {
      tasks: Object.fromEntries(tasks.map(t => [t.id, { t: t.title, s: t.status, o: t.assignee ? nameOf(t.assignee) : '' }])),
      proposals: Object.fromEntries(props.map(p => { const y = Object.values(p.votes || {}).filter(v => v === 'yes').length, n = Object.values(p.votes || {}).filter(v => v === 'no').length; return [p.id, { t: p.title, s: p.status, y, n }]; })),
      changes: Object.fromEntries(crs.map(c => [c.id, { t: c.title, s: c.status, c: c.claimedByName || '' }])),
      decisions: decs.map(d => d.title),
      claims: cls.map(c => `${c.path}|${c.name}`),
      branches: Object.fromEntries((st.branches || []).map(b => [b.branch, b.level])),
      online: people.filter(m => m.online).map(m => m.name),
      repo: st.enabled ? { branch: st.branch, behind: st.behind, ahead: st.ahead, head: (st.commits && st.commits[0] && st.commits[0].sha) || '' } : null,
    };
  }
  function diff(a, b) {
    if (!a) return [];
    const out = []; // [priority, text]
    for (const [id, t] of Object.entries(b.tasks)) {
      const o = a.tasks[id];
      if (!o) out.push([1, `New task "${one(t.t, 70)}" (${t.s})${t.o ? ` for ${t.o}` : ''}`]);
      else if (o.s !== t.s) out.push([1, `"${one(t.t, 70)}" moved ${o.s} → ${t.s}`]);
      else if (o.o !== t.o && t.o) out.push([2, `"${one(t.t, 70)}" is now owned by ${t.o}`]);
    }
    for (const [id, t] of Object.entries(a.tasks)) if (!b.tasks[id]) out.push([3, `Task "${one(t.t, 70)}" was removed`]);
    for (const [id, p] of Object.entries(b.proposals)) {
      const o = a.proposals[id];
      if (!o) out.push([1, `New proposal "${one(p.t, 70)}"`]);
      else if (o.s !== p.s) out.push([1, `Proposal "${one(p.t, 70)}" is now ${p.s}`]);
      else if (o.y !== p.y || o.n !== p.n) out.push([2, `Votes on "${one(p.t, 60)}": ${p.y} yes / ${p.n} no`]);
    }
    for (const [id, c] of Object.entries(b.changes)) {
      const o = a.changes[id];
      if (!o) out.push([1, `New change request "${one(c.t, 70)}"`]);
      else if (o.s !== c.s) out.push([1, `Change request "${one(c.t, 70)}" is now ${c.s}${c.c && c.s === 'claimed' ? ` (taken by ${c.c})` : ''}`]);
    }
    for (const d of b.decisions) if (!a.decisions.includes(d)) out.push([1, `Decision logged: ${one(d, 90)}`]);
    for (const c of b.claims) if (!a.claims.includes(c)) { const [p, n] = c.split('|'); out.push([2, `${n} claimed ${p}`]); }
    for (const c of a.claims) if (!b.claims.includes(c)) { const [p, n] = c.split('|'); out.push([3, `${n} released ${p}`]); }
    for (const [br, lv] of Object.entries(b.branches)) { if (!(br in a.branches)) out.push([2, `New branch ${br}`]); else if (a.branches[br] !== lv) out.push([2, `Branch ${br} is now ${lv}`]); }
    for (const br of Object.keys(a.branches)) if (!(br in b.branches)) out.push([2, `Branch ${br} is gone (merged or deleted)`]);
    if (a.repo && b.repo) {
      if (a.repo.head !== b.repo.head) out.push([2, `New commit on ${b.repo.branch} (${b.repo.head})`]);
      if (a.repo.behind !== b.repo.behind && b.repo.behind) out.push([2, `${b.repo.branch} is ${b.repo.behind} behind origin`]);
    }
    for (const n of b.online) if (!a.online.includes(n)) out.push([4, `${n} came online`]);
    for (const n of a.online) if (!b.online.includes(n)) out.push([4, `${n} went offline`]);
    return out.sort((x, y) => x[0] - y[0]).slice(0, 10).map(x => x[1]);
  }

  function build() {
    const st = repoStatus() || { enabled: false };
    const tasks = loadTasks(), props = proposals(), crs = changes(), decs = decisions(), cls = claims.list(), people = presence();
    const now = new Date().toISOString();
    const stateRel = '.tribe/context-state.json';
    const prev = store.readJSON(stateRel, null);
    const f = facts({ tasks, props, crs, decs, cls, st, people });
    let changed = diff(prev && prev.facts, f);
    let since = now;
    if (!changed.length && prev && prev.changed) { changed = prev.changed; since = prev.since; }

    const L = [];
    const by = s => tasks.filter(t => t.status === s);
    const online = people.filter(m => m.online);
    const openProps = props.filter(p => p.status === 'open');
    const openCrs = crs.filter(c => c.status !== 'done');
    L.push(`# TRIBE_CONTEXT · ${tribe.name}`, '');
    L.push(`> Auto-generated by TribeCode. Updated ${now.slice(0, 16).replace('T', ' ')} UTC. Read this first; it is rewritten as the tribe works. Do not edit by hand.`, '');
    L.push('## Summary', '');
    const humans = people.filter(m => m.role !== 'agent');
    L.push(`**${tribe.name}** has ${humans.length} member${humans.length === 1 ? '' : 's'} (${online.length} online now${online.some(m => m.role === 'agent') ? `, incl. ${online.filter(m => m.role === 'agent').length} agent${online.filter(m => m.role === 'agent').length > 1 ? 's' : ''}` : ''}). ` +
      `Board: ${by('doing').length} doing, ${by('review').length} in review, ${by('backlog').length} in backlog, ${by('done').length} done. ` +
      `${openProps.length} open proposal${openProps.length === 1 ? '' : 's'}, ${openCrs.length} open change request${openCrs.length === 1 ? '' : 's'}, ${cls.length} file claim${cls.length === 1 ? '' : 's'}. ` +
      (st.enabled ? `Repo **${st.name}** on \`${st.branch}\` (${st.behind || 0} behind / ${st.ahead || 0} ahead of origin), ${(st.branches || []).length} other branch${(st.branches || []).length === 1 ? '' : 'es'}.` : 'No project repo connected.'));
    const vision = readVision().split('\n').map(l => l.trim()).filter(l => l && !/^#/.test(l)).slice(0, 6).join(' ');
    if (vision) L.push('', `**Vision (excerpt):** ${one(vision, 600)}`);
    L.push('');

    L.push('## What changed since last time', '');
    if (changed.length) { L.push(`*Since ${String(since).slice(0, 16).replace('T', ' ')} UTC:*`); changed.forEach(c => L.push(`- ${c}`)); } else L.push('- Nothing yet: this is the first snapshot.');
    L.push('');

    L.push('## Who is online', '');
    if (!online.length) L.push('- Nobody right now.');
    for (const m of online.slice(0, 15)) {
      const doing = tasks.filter(t => t.status === 'doing' && t.assignee === m.id).map(t => `"${one(t.title, 50)}"`);
      const mine = cls.filter(c => c.by === m.id).map(c => c.path);
      L.push(`- **${m.name}**${m.role === 'agent' ? ' (agent)' : m.role === 'host' ? ' (host)' : ''}: ${one(m.where || 'Home', 50)}${doing.length ? ` · doing ${doing.slice(0, 3).join(', ')}` : ''}${mine.length ? ` · claims ${mine.slice(0, 3).join(', ')}` : ''}`);
    }
    L.push('');

    L.push('## Active tasks', '');
    const tline = t => `- \`${t.id}\` ${one(t.title, 90)}${t.assignee ? ` · ${nameOf(t.assignee)}` : ' · unassigned'}`;
    for (const [s, label, cap] of [['doing', 'Doing', 15], ['review', 'Review', 10], ['backlog', 'Backlog', 12]]) {
      const l = by(s); if (!l.length) continue;
      L.push(`**${label} (${l.length})**`); l.slice(0, cap).forEach(t => L.push(tline(t))); if (l.length > cap) L.push(`- …and ${l.length - cap} more`);
      L.push('');
    }
    if (!['doing', 'review', 'backlog'].some(s => by(s).length)) L.push('- No active tasks.', '');
    if (by('done').length) L.push(`*Done: ${by('done').length} (latest: ${by('done').sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 3).map(t => `"${one(t.title, 40)}"`).join(', ')})*`, '');

    L.push('## Open proposals', '');
    if (!openProps.length) L.push('- None.');
    for (const p of openProps.slice(0, 8)) { const t = board.tally(p); L.push(`- **${one(p.title, 90)}** by ${nameOf(p.by)}: ${t.yes} yes / ${t.no} no, needs ${t.needed} yes`); }
    L.push('');

    L.push('## Recent decisions', '');
    if (!decs.length) L.push('- None logged yet.');
    decs.forEach(d => L.push(`- ${d.date}: ${one(d.title, 110)}`));
    L.push('');

    L.push('## Open change requests (need a desktop)', '');
    if (!openCrs.length) L.push('- None.');
    for (const c of openCrs.slice(0, 10)) L.push(`- \`${c.id}\` **${one(c.title, 80)}** from ${c.byName}: ${c.status === 'claimed' ? `taken by ${c.claimedByName}` : 'open, anyone can take it'}${c.hasPatch ? ' · patch attached' : ''}${c.branch ? ` · branch \`${c.branch}\`` : ''}`);
    L.push('');

    L.push('## File claims', '');
    if (!cls.length) L.push('- None.');
    cls.slice(0, 15).forEach(c => L.push(`- \`${c.path}\`: ${c.name}${c.note ? ` (${one(c.note, 60)})` : ''}`));
    L.push('');

    L.push('## Repo', '');
    if (!st.enabled) L.push(`- ${st.reason || 'No project repo connected.'}`);
    else {
      L.push(`- Branch \`${st.branch}\` (main line \`${st.main}\`) · ${st.upstream ? `${st.ahead} ahead / ${st.behind} behind \`${st.upstream}\`` : 'no upstream'} · ${st.dirtyCount} changed file${st.dirtyCount === 1 ? '' : 's'}`);
      if (st.commits && st.commits[0]) L.push(`- Last commit: ${st.commits[0].sha} "${one(st.commits[0].subject, 70)}" by ${st.commits[0].author}`);
      if (st.ci) L.push(`- CI: ${st.ci.workflow || 'workflow'} ${st.ci.conclusion || st.ci.status}`);
      for (const b of (st.branches || []).slice(0, 12)) L.push(`- \`${b.branch}\`: ${b.level} · ${b.ahead} ahead / ${b.behind} behind${b.task ? ` · task "${one(b.task.title, 40)}"` : ' · no task'}`);
      if ((st.branches || []).length > 12) L.push(`- …and ${st.branches.length - 12} more branches`);
    }
    L.push('');

    L.push('## Recent chat', '');
    const chat = store.readJSONL('chat/general.jsonl', 300).filter(x => x.by !== 'tribecode' && String(x.text || '').trim()).slice(-20);
    if (!chat.length) L.push('- (quiet)');
    chat.forEach(x => L.push(`- ${hm(x.at)} ${nameOf(x.by)}: ${one(x.text, 160)}`));

    const md = (L.length > MAX_LINES ? [...L.slice(0, MAX_LINES - 1), '*(truncated)*'] : L).join('\n') + '\n';
    return { md, state: { facts: f, changed, since } };
  }

  const body = md => md.replace(/^> Auto-generated.*$/m, '');
  function regen() {
    clearTimeout(timer); timer = null;
    let out; try { out = build(); } catch (e) { console.error('context:', e.message); return last; }
    if (last && body(out.md) === body(last)) return last;
    last = out.md;
    store.writeJSON('.tribe/context-state.json', out.state);
    store._atomic(store.p(file), out.md);
    const r = repo(); const s = settings();
    if (r && s.contextInRepo && path.resolve(r) !== store.root) { try { fs.writeFileSync(path.join(r, file), out.md); } catch (e) { console.error('context: repo write failed:', e.message); } }
    broadcast({ type: 'context', updated: new Date().toISOString() });
    return last;
  }
  function touch() { if (!timer) { timer = setTimeout(regen, DEBOUNCE); timer.unref && timer.unref(); } }

  function start() {
    try { last = fs.readFileSync(store.p(file), 'utf8'); } catch {}
    setTimeout(regen, 500).unref();
    setInterval(touch, 60_000).unref(); // presence and time-based changes
    try {
      watcher = fs.watch(store.root, { recursive: true }, (ev, name) => {
        const n = String(name || '').split(path.sep).join('/');
        if (!n || n === file || n.startsWith('.tribe') || n.startsWith('repo/') || n.startsWith('brain/') || /\.tmp$/.test(n) || n.endsWith('.summary.md')) return;
        touch();
      });
      watcher.on('error', () => {});
      watcher.unref && watcher.unref();
    } catch (e) { console.log('  Context:  folder watching unavailable (' + e.message + '); refreshing every minute'); }
  }

  return { start, touch, now: () => regen(), current: () => last };
};
