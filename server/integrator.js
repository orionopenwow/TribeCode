// Master integrator: lets one Claude Code agent (the host's, when "Integrator agent" is on) collect
// everyone's branches, check them, ask the humans for approval, and assemble them into main.
//
//   collect_changes      open branches vs main + pairwise conflict dry-runs
//   run_checks           the host's check command in a temporary worktree, with a timeout
//   propose_integration  approval request + board proposal (humans vote)
//   integrate            only after approval: merge in order into integration/<date>, run checks,
//                        fast-forward main and push (never forced). Stops and reports on any failure.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bus = require('./bus');

module.exports = function integrator({ repo, enabled, G, store, settings, board, nameOf, getMembers, listChanges, loadTasks, drift, log, postChat, poll, markPush }) {
  const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });

  // ---------- integrations store ----------
  const all = () => store.readJSON('repo/integrations.json', []);
  const saveAll = list => store.writeJSON('repo/integrations.json', list);
  function proposalOf(rec) { try { const r = store.readMd(`proposals/${rec.proposal}.md`); return r && r.meta; } catch { return null; } }
  function withState(rec) {
    const p = proposalOf(rec);
    let state = rec.status;
    if (state === 'pending' && p) state = p.status === 'approved' ? 'approved' : ['parked', 'withdrawn'].includes(p.status) ? 'rejected' : 'pending';
    const tally = p && board.tally ? board.tally({ votes: p.votes || {} }) : null;
    return { ...rec, state, proposalStatus: p ? p.status : null, tally, byName: nameOf(rec.by) };
  }
  const list = () => all().map(withState).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  function update(id, patch) { const l = all(); const r = l.find(x => x.id === id); if (r) Object.assign(r, patch); saveAll(l); return r; }

  // ---------- master agent ----------
  function masterAgent() {
    if (!settings().integrator) return null;
    const host = getMembers().find(m => m.role === 'host'); if (!host) return null;
    const a = getMembers().find(m => m.role === 'agent' && m.owner === host.id);
    return a ? { id: a.id, name: a.name } : { id: null, name: `Claude · ${host.name}`, pending: true };
  }
  function isMaster(me) {
    if (!me || me.role !== 'agent' || !settings().integrator) return false;
    const owner = getMembers().find(m => m.id === me.owner);
    return !!owner && owner.role === 'host';
  }
  function instructions(me) {
    if (!isMaster(me)) return '';
    return '\n\nYou are the tribe\'s MASTER INTEGRATOR. Your job is to assemble everyone\'s work into main safely:\n' +
      '1. get_context and collect_changes: see every open branch vs main, linked tasks/proposals/change requests, drift, and which branches conflict with each other.\n' +
      '2. run_checks {branch} on each candidate (runs the host\'s check command in a temporary worktree). Ask owners to fix failures or conflicts in chat (post_chat); do not rewrite their branches.\n' +
      '3. propose_integration {branches, order, notes} with a conflict-free order of green branches. This creates an approval request; humans vote on the Board.\n' +
      '4. Only after it is approved, call integrate {id}. It merges in order into integration/<date>, runs the checks, then fast-forwards main and pushes. If anything fails it stops: report the failure in chat and propose a new plan.\n' +
      'Never force-push, never merge without an approved integration, and keep humans informed with short chat updates.';
  }

  // ---------- dry-run merges ----------
  async function dryMerge(a, b) {
    if (await G.hasMergeTree()) {
      const r = await G.gitTry(['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b]);
      if (r.code === 0) return { conflict: false, files: [], method: 'merge-tree' };
      if (r.code === 1) { const lines = r.out.split('\n'); return { conflict: true, files: lines.slice(1).filter(Boolean), method: 'merge-tree' }; }
      // fall through to a worktree merge on unexpected errors
    }
    return G.withWorktree(a, async dir => {
      const r = await G.gitTry([...(await G.identity()), 'merge', '--no-commit', '--no-ff', b], dir);
      const files = r.code === 0 ? [] : (await G.gitTry(['diff', '--name-only', '--diff-filter=U'], dir)).out.split('\n').filter(Boolean);
      await G.gitTry(['merge', '--abort'], dir);
      return { conflict: r.code !== 0, files, method: 'worktree' };
    });
  }

  async function collect() {
    if (!enabled()) return { enabled: false, reason: 'No project repo (start the server with --repo).', branches: [], pairs: [] };
    return G.locked(async () => {
      const main = await G.mainBranch();
      let radar = { branches: [] }; try { radar = await drift.radar(); } catch {}
      const changes = listChanges(); const ints = list();
      const proposals = store.listMd('proposals').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; }).filter(Boolean);
      const out = [];
      for (const b of radar.branches || []) {
        if (!b.ahead) continue; // nothing to integrate
        const ref = await G.resolveRef(b.branch); if (!ref) continue;
        const commits = (await G.gitTry(['log', '-n', '20', '--format=%h%x1f%an%x1f%s%x1f%cI', `${main}..${ref}`])).out.split('\n').filter(Boolean)
          .map(l => { const [sha, author, subject, at] = l.split('\x1f'); return { sha, author, subject, at }; });
        const files = (await G.gitTry(['diff', '--name-only', `${main}...${ref}`])).out.split('\n').filter(Boolean);
        const cr = changes.find(x => x.branch === b.branch || b.branch === `change/${x.id}`);
        const props = proposals.filter(p => (p.body || '').includes(b.branch) || String(p.title || '').includes(b.branch)).map(p => ({ id: p.id, title: p.title, status: p.status }));
        const vsMain = await dryMerge(main, ref);
        out.push({ branch: b.branch, ref, author: b.author, ahead: b.ahead, behind: b.behind, drift: b.level, days: b.days, commits, files,
          task: b.task, changeRequest: cr ? { id: cr.id, title: cr.title, status: cr.status } : null, proposals: props,
          integrations: ints.filter(i => (i.branches || []).includes(b.branch)).map(i => ({ id: i.id, state: i.state })),
          conflictsWithMain: vsMain.conflict ? vsMain.files : [] });
      }
      const pairs = [];
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const A = out[i], B = out[j]; const overlap = A.files.filter(f => B.files.includes(f));
        if (!overlap.length) continue;
        const d = await dryMerge(A.ref, B.ref);
        pairs.push({ a: A.branch, b: B.branch, overlap, conflict: d.conflict, conflictFiles: d.files, method: d.method });
      }
      for (const b of out) b.conflictsWith = pairs.filter(p => p.conflict && (p.a === b.branch || p.b === b.branch)).map(p => (p.a === b.branch ? p.b : p.a));
      return { enabled: true, main, branches: out, pairs, conflicts: pairs.filter(p => p.conflict), method: (await G.hasMergeTree()) ? 'merge-tree' : 'worktree', checked: new Date().toISOString() };
    });
  }

  // ---------- checks ----------
  function defaultCommand(dir) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const t = pkg.scripts && pkg.scripts.test;
      if (t && !/no test specified/.test(t)) return 'npm test';
    } catch {}
    return '';
  }
  async function checksIn(dir) {
    const cmd = settings().checkCommand || defaultCommand(dir);
    if (!cmd) return { ok: null, skipped: true, command: '', note: 'No check command configured (set one in Repo → Autopilot, or add a "test" script to package.json).' };
    const r = await G.runShell(cmd, { cwd: dir, timeoutMs: (settings().checkTimeoutSec || 600) * 1000 });
    return { ok: r.code === 0, exitCode: r.code, timedOut: r.timedOut, command: cmd, ms: r.ms, tail: G.tail(r.output) };
  }
  async function runChecks(branch) {
    if (!enabled()) throw fail('No project repo (start the server with --repo).');
    const ref = await G.resolveRef(branch || await G.mainBranch()); if (!ref) throw fail(`No branch called "${branch}"`, 404);
    const r = await G.locked(() => G.withWorktree(ref, dir => checksIn(dir)));
    const res = { branch: branch || ref, ...r };
    log('checks', `Checks on ${res.branch}: ${r.skipped ? 'skipped (no command)' : r.ok ? 'passed' : r.timedOut ? 'timed out' : 'failed'}`, { notify: 'repo', priority: 'low', extra: { detail: r.command } });
    return res;
  }

  // ---------- propose + integrate ----------
  async function propose({ branches, order, notes }, me) {
    if (!enabled()) throw fail('No project repo (start the server with --repo).');
    let seq = (Array.isArray(order) && order.length ? order : branches || []).map(b => String(b).trim()).filter(Boolean);
    seq = [...new Set(seq)];
    if (!seq.length) throw fail('Give at least one branch.');
    if (seq.length > 20) throw fail('At most 20 branches per integration.');
    const main = await G.mainBranch();
    for (const b of seq) { if (b === main) throw fail(`${main} is the target, not a branch to merge.`); if (!(await G.resolveRef(b))) throw fail(`No branch called "${b}".`, 404); }
    const id = 'int-' + Date.now().toString(36).slice(-5) + crypto.randomBytes(2).toString('hex');
    const title = `Integrate ${seq.length} branch${seq.length > 1 ? 'es' : ''} into ${main}: ${seq.join(', ')}`.slice(0, 160);
    const body = `Merge these branches into **${main}**, in this order, run the checks, then fast-forward ${main} and push:\n\n${seq.map((b, i) => `${i + 1}. \`${b}\``).join('\n')}\n\n` +
      `${notes ? `## Notes\n${String(notes).slice(0, 4000)}\n\n` : ''}Integration \`${id}\`, requested by ${me.name}. Nothing is merged until this is approved.`;
    const p = board.propose(title, body, me);
    const rec = { id, proposal: p.id, branches: seq, notes: String(notes || '').slice(0, 4000), by: me.id, created: new Date().toISOString(), status: 'pending', main };
    const l = all(); l.push(rec); saveAll(l);
    bus.notify({ type: 'approval', priority: 'high', title: `Approve integration into ${main}?`, body: `${me.name} wants to merge ${seq.join(', ')}.`, view: 'board', ref: p.id,
      integration: id, actions: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }] });
    log('propose', `${me.name} proposed integrating ${seq.join(', ')}`, { notify: null, extra: { ref: id } });
    return withState(rec);
  }

  async function integrate(id, me) {
    const rec0 = all().find(x => x.id === id); if (!rec0) throw fail(`No integration ${id}`, 404);
    const rec = withState(rec0);
    if (rec.state === 'merged') throw fail(`${id} was already merged.`, 409);
    if (rec.state === 'running') throw fail(`${id} is already running.`, 409);
    if (rec.state !== 'approved' && !(rec.state === 'failed' && rec.proposalStatus === 'approved')) {
      const t = rec.tally;
      throw fail(rec.state === 'rejected' ? `Not merging: the proposal for ${id} was ${rec.proposalStatus}.` : `Not approved yet: ${id} needs a human approval on the Board${t ? ` (${t.yes} yes of ${t.needed} needed)` : ''}. Nothing was merged.`, 409);
    }
    if (!enabled()) throw fail('No project repo.');
    update(id, { status: 'running', startedBy: me.id });
    const steps = []; const step = s => { steps.push(s); };
    try {
      const out = await G.locked(async () => {
        const main = await G.mainBranch();
        const day = new Date().toISOString().slice(0, 10);
        let name = `integration/${day}`, n = 2; while (await G.branchExists(name)) name = `integration/${day}-${n++}`;
        let checks, mergedOk = true, failed = null;
        try {
          await G.withWorktree(main, async dir => {
            for (const b of rec.branches) {
              const ref = await G.resolveRef(b); if (!ref) { failed = { stage: 'merge', branch: b, error: `branch ${b} no longer exists` }; mergedOk = false; return; }
              const r = await G.gitTry([...(await G.identity()), 'merge', '--no-ff', '--no-edit', '-m', `Integrate ${b} (${id})`, ref], dir);
              if (r.code !== 0) {
                const files = (await G.gitTry(['diff', '--name-only', '--diff-filter=U'], dir)).out.split('\n').filter(Boolean);
                await G.gitTry(['merge', '--abort'], dir);
                failed = { stage: 'merge', branch: b, conflicts: files, error: files.length ? `${b} does not merge cleanly: conflict in ${files.join(', ')}` : `${b} failed to merge: ${(r.err || r.out).split('\n').pop()}` }; mergedOk = false; return;
              }
              step(`merged ${b}`);
            }
            checks = await checksIn(dir);
            step(checks.skipped ? 'checks skipped (no command)' : `checks ${checks.ok ? 'passed' : 'failed'}`);
          }, { branch: name });
        } catch (e) { failed = { stage: 'setup', error: e.message }; mergedOk = false; }
        if (!mergedOk) { await G.gitTry(['branch', '-D', name]); return { ok: false, branch: name, ...failed }; }
        const green = checks.ok === true || (checks.skipped && settings().allowNoChecks);
        if (!green) return { ok: false, stage: 'checks', branch: name, checks, error: checks.skipped ? checks.note : `checks failed (exit ${checks.exitCode}${checks.timedOut ? ', timed out' : ''})` };
        // Fast-forward main (never a merge commit on main, never forced).
        if ((await G.gitTry(['merge-base', '--is-ancestor', main, name])).code !== 0) return { ok: false, stage: 'fast-forward', branch: name, checks, error: `${main} moved while integrating; propose again.` };
        const head = (await G.gitTry(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
        if (head === main) {
          const r = await G.gitTry(['merge', '--ff-only', '--quiet', name]);
          if (r.code !== 0) return { ok: false, stage: 'fast-forward', branch: name, checks, error: `could not fast-forward ${main} in the working tree: ${(r.err || r.out).split('\n')[0]}` };
        } else {
          const oldSha = await G.git(['rev-parse', main]), newSha = await G.git(['rev-parse', name]);
          await G.git(['update-ref', '-m', `tribecode: integrate ${id}`, `refs/heads/${main}`, newSha, oldSha]);
        }
        step(`fast-forwarded ${main}`);
        const sha = await G.git(['rev-parse', '--short', main]);
        let pushed = false, pushNote = '';
        if (await G.hasRemote()) {
          const p = await G.gitTry(['push', '--quiet', 'origin', `${main}:${main}`], repo, { timeout: 120_000 });
          pushed = p.code === 0; pushNote = pushed ? '' : (p.err || p.out).split('\n')[0];
          step(pushed ? `pushed ${main} to origin` : `push failed: ${pushNote}`);
        } else pushNote = 'no origin remote';
        return { ok: true, branch: name, main, commit: sha, checks, pushed, pushNote };
      });
      const result = { ...out, steps };
      if (out.ok) {
        update(id, { status: 'merged', merged: new Date().toISOString(), mergedBy: me.id, result });
        if (out.pushed) markPush();
        const msg = `Integrated ${rec.branches.join(', ')} into ${out.main} (${out.commit})${out.pushed ? ' and pushed' : out.pushNote ? `; not pushed: ${out.pushNote}` : ''}`;
        log('integrate', msg, { notify: 'repo', priority: 'normal', extra: { ref: id } });
        postChat('general', 'tribecode', `🔀 ${msg}.`);
      } else {
        update(id, { status: 'failed', failed: new Date().toISOString(), result });
        const msg = `Integration ${id} stopped (${out.stage}): ${out.error}`;
        log('integrate-failed', msg, { notify: 'repo', priority: 'high', extra: { ref: id, detail: (out.conflicts || []).join(', ') } });
        postChat('general', 'tribecode', `⚠️ ${msg}. Nothing was pushed.`);
      }
      poll({ force: true }).catch(() => {});
      return { id, ...result };
    } catch (e) {
      update(id, { status: 'failed', result: { ok: false, stage: 'error', error: e.message, steps } });
      throw e;
    }
  }

  // ---------- MCP ----------
  function mcpTools({ text, err, S, str }) {
    const arr = d => ({ type: 'array', items: { type: 'string' }, description: d });
    return {
      collect_changes: {
        description: 'Integrator: every open branch vs main with its commits, files, linked task/proposals/change request and drift level, plus which branches conflict with each other (dry-run merges; nothing is changed).',
        inputSchema: S({}), run: async () => text(await collect()),
      },
      run_checks: {
        description: 'Integrator: run the repo\'s check command (host setting; default `npm test`) on a branch in a temporary worktree with a timeout. Returns pass/fail and the tail of the output.',
        inputSchema: S({ branch: str('Branch to check') }, ['branch']), run: async ({ branch }) => { const r = await runChecks(branch); return r.ok === false ? err(JSON.stringify(r, null, 2)) : text(r); },
      },
      propose_integration: {
        description: 'Integrator: ask the humans to approve merging branches into main in a given order. Creates a Board proposal and a high-priority approval request; returns the integration id.',
        inputSchema: S({ branches: arr('Branches to merge'), order: arr('Merge order (defaults to branches)'), notes: str('Why, checks run, risks') }, ['branches']),
        run: async (a, me) => { const r = await propose(a, me); return text({ id: r.id, proposal: r.proposal, state: r.state, branches: r.branches, next: 'Wait for the humans to approve on the Board, then call integrate with this id.' }); },
      },
      integrate: {
        description: 'Integrator: after the humans approved, merge the branches in order into integration/<date>, run checks, and if green fast-forward main and push. Refuses without approval; stops and reports on any conflict or failure.',
        inputSchema: S({ id: str('Integration id from propose_integration') }, ['id']),
        run: async ({ id }, me) => {
          if (!isMaster(me)) return err('Only the master integrator agent (the host\'s Claude Code, with "Integrator agent" on) can integrate. Ask the host.');
          const r = await integrate(id, me); return r.ok ? text(r) : err(JSON.stringify(r, null, 2));
        },
      },
    };
  }

  return { collect, runChecks, propose, integrate, list, masterAgent, isMaster, instructions, mcpTools };
};
