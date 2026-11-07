// Team votes in chat. A vote is a chat message with a `vote` field, so it lives in the project's chat
// file next to the conversation it came from, and every change goes out as an ordinary `chat-update`.
//
//   kind 'approve'  options Approve / Not yet. Majority of the project's humans decides: it passes as
//                   soon as approvals reach floor(n/2)+1, fails as soon as "not yet" does (or everyone
//                   voted without a majority). At a deadline or a manual close, it passes when more people
//                   approved than not AND a majority of the team voted (quorum).
//   kind 'poll'     2-6 custom options. Closes when everyone voted, when one option holds a majority of
//                   the team, at the deadline, or when the author/host closes it. Most votes wins; a tie is a tie.
//
// Only humans vote (agents never, spectators never: the same rule as the Board). A member's Claude may
// *suggest* a vote (MCP suggest_vote); it is labelled as such and rate-limited. When a vote closes:
// a results line is posted (quoting the vote), the decision is logged in decisions/, and a low-priority
// "Decided" item lands in everyone's Updates. A passed vote offers one tap to make it a task or send it
// to the Board (board.propose, carrying the ballots over).
'use strict';

const APPROVE = [{ id: 'yes', label: 'Approve' }, { id: 'no', label: 'Not yet' }];
const MAX_OPTS = 6, MAX_DAYS = 30;
const RATE = { n: Number(process.env.TRIBE_VOTE_RATE) || 3, ms: 10 * 60_000 };   // agent suggestions
const OPEN_PER_AGENT = 2;
const REMIND_GAP = 15 * 60_000;
const SWEEP_MS = Number(process.env.TRIBE_VOTE_SWEEP_MS) || 15_000;
const DECIDE_RE = /^(should we|shall we|do we (want|go with)|can we (agree|decide)|are we (ok|okay|good|fine) with|let'?s (decide|vote|pick|choose)|which (one|option|of these) should|vote on|thoughts on (going with|switching))\b/i;

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// "/vote Should we add dark mode? | Yes | Later | 24h" -> { question, options, minutes }
function parseCommand(text) {
  const m = String(text || '').match(/^\/vote\s+([\s\S]+)/i); if (!m) return null;
  const parts = m[1].split('|').map(s => s.trim()).filter(Boolean);
  let minutes = 0;
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const d = last.match(/^(\d{1,4})\s*(m|min|h|d)$/i);
  if (d) { parts.pop(); minutes = Number(d[1]) * ({ m: 1, min: 1, h: 60, d: 1440 }[d[2].toLowerCase()]); }
  const [question, ...options] = parts;
  return question ? { question, options, minutes } : null;
}
// Does a chat message read like a decision the team could vote on? Cheap, local, no model needed.
function looksLikeDecision(text) {
  const t = String(text || '').trim();
  if (!t || t.startsWith('/') || /@brain\b/i.test(t) || t.length > 280) return false;
  return DECIDE_RE.test(t) || (/\b(should we|do we want to|let'?s vote)\b/i.test(t) && t.includes('?'));
}
// A vote draft from a message: "Should we use Godot or Phaser?" -> a poll with Godot / Phaser.
function draftFrom(text) {
  let q = clip(String(text || '').replace(/^(let'?s (decide|vote|pick|choose)( on)?:?\s*)/i, ''), 200);
  if (!q) return null;
  q = cap(q); if (!/[?]$/.test(q)) q = q.replace(/[.!]+$/, '') + '?';
  const or = q.match(/\b(?:use|go with|pick|choose|do|try|with|between)\s+(.{1,40}?)\s+or\s+(.{1,40}?)\?$/i) || q.match(/^(?:should we|shall we)\s+(.{1,40}?)\s+or\s+(.{1,40}?)\?$/i);
  return { question: q, options: or ? [cap(or[1].trim()), cap(or[2].trim())] : [] };
}

module.exports = function votes({ store, id, str, slug, find, update, postChat, getMembers, voters, bus, createTask, board,
  channelOf, project, inProject, isDm, now = () => Date.now(), tick = true }) {
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const nameOf = mid => (mid === 'tribecode' ? 'TribeCode' : (member(mid) || {}).name || 'someone');
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const iso = t => new Date(t).toISOString();
  const chan = ch => (!ch || ch === 'general' ? channelOf() : ch);
  const isHuman = m => !!m && m.role !== 'agent' && m.role !== 'spectator';

  // Open votes across projects, so deadlines fire even when nobody has the chat open.
  const IDX = '.tribe/votes-open.json';
  const idx = () => store.readJSON(IDX, []);
  const saveIdx = l => store.writeJSON(IDX, l);
  const recent = new Map();   // agent id -> timestamps of suggestions

  function tally(v) {
    const ppl = voters(), ids = new Set(ppl.map(m => m.id));
    const ballots = Object.entries(v.ballots || {}).filter(([mid]) => ids.has(mid) || v.status !== 'open');
    const counts = Object.fromEntries(v.options.map(o => [o.id, 0]));
    for (const [, o] of ballots) if (o in counts) counts[o]++;
    const n = Math.max(1, v.status === 'open' ? ppl.length : (v.voters || ppl.length));
    const voted = ballots.length;
    return { counts, n, voted, needed: Math.floor(n / 2) + 1, waiting: ppl.filter(m => !(v.ballots || {})[m.id]).map(m => m.id) };
  }
  // Outcome right now; `final` = deadline or manual close (no more votes coming).
  function outcome(v, final) {
    const t = tally(v), c = t.counts;
    if (v.kind === 'approve') {
      if (c.yes >= t.needed) return { status: 'passed', option: 'yes' };
      if (c.no >= t.needed) return { status: 'failed', option: 'no' };
      if (t.voted >= t.n || final) {
        if (t.voted < t.needed) return { status: 'failed', option: null, reason: 'no quorum' };
        return c.yes > c.no ? { status: 'passed', option: 'yes' } : { status: 'failed', option: 'no' };
      }
      return null;
    }
    const sorted = v.options.map(o => [o.id, c[o.id]]).sort((a, b) => b[1] - a[1]);
    if (!final && t.voted < t.n && sorted[0][1] < t.needed) return null;
    if (!t.voted) return { status: 'closed', option: null, reason: 'no votes' };
    if (sorted[1] && sorted[0][1] === sorted[1][1]) return { status: 'tie', option: null };
    return { status: 'closed', option: sorted[0][0] };
  }
  const label = (v, oid) => (v.options.find(o => o.id === oid) || {}).label || '';
  function resultLine(v, t = tally(v)) {
    const counts = v.options.map(o => `${t.counts[o.id]} ${v.kind === 'approve' ? o.label.toLowerCase() : o.label}`).join(' · ');
    const head = v.status === 'passed' ? 'Approved' : v.status === 'failed' ? (v.reason === 'no quorum' ? 'Not decided (too few votes)' : 'Not yet') : v.status === 'tie' ? 'Tie' : v.result ? label(v, v.result) : 'No votes';
    return { head, counts };
  }

  // ---------- create ----------
  function create(ch, me, { question, options, minutes, deadline, why } = {}) {
    ch = chan(ch);
    if (isDm(ch)) throw err(400, 'votes live in team channels, not DMs');
    if (me.role === 'spectator') throw err(403, 'spectators can read but not start votes');
    const q = str(question, 200).replace(/\s+/g, ' ');
    if (!q) throw err(400, 'ask a question');
    const opts = (Array.isArray(options) ? options : []).map(o => str(typeof o === 'string' ? o : (o && o.label) || '', 60)).filter(Boolean);
    const uniq = [...new Set(opts.map(o => o.toLowerCase()))].length === opts.length;
    if (opts.length === 1) throw err(400, 'a poll needs at least two options (or none for Approve / Not yet)');
    if (opts.length > MAX_OPTS) throw err(400, `up to ${MAX_OPTS} options`);
    if (!uniq) throw err(400, 'options must be different');
    let dl = null;
    if (deadline) { const t = Date.parse(deadline); if (!Number.isFinite(t) || t <= now()) throw err(400, 'the deadline must be in the future'); dl = t; }
    else if (Number(minutes) > 0) dl = now() + Math.round(Number(minutes)) * 60_000;
    if (dl && dl > now() + MAX_DAYS * 86400_000) throw err(400, `deadlines up to ${MAX_DAYS} days`);
    const agent = me.role === 'agent';
    if (agent) {
      const t = (recent.get(me.id) || []).filter(x => now() - x < RATE.ms);
      if (t.length >= RATE.n) throw err(429, `Slow down: at most ${RATE.n} vote suggestions every 10 minutes.`);
      const open = idx().filter(x => x.by === me.id).length;
      if (open >= OPEN_PER_AGENT) throw err(429, `You already have ${open} open vote suggestions. Let the team answer those first.`);
      t.push(now()); recent.set(me.id, t);
    }
    const vote = { kind: opts.length ? 'poll' : 'approve', q, options: opts.length ? opts.map((label, i) => ({ id: 'o' + (i + 1), label })) : APPROVE.map(o => ({ ...o })),
      ballots: {}, status: 'open', deadline: dl ? iso(dl) : null, seen: {} };
    if (agent) { vote.suggested = { agent: me.id, owner: me.owner || null }; if (str(why, 400)) vote.why = str(why, 400); }
    const msg = postChat(ch, me.id, q, { vote });
    saveIdx([...idx(), { project: project(), ch, id: msg.id, by: me.id, deadline: vote.deadline }]);
    if (agent) bus.notify({ type: 'vote', priority: 'normal', to: voters().map(m => m.id), from: me.id, title: `${me.owner && member(me.owner) ? `${member(me.owner).name}'s Claude` : me.name} suggests a vote`, body: q, view: 'chat', ref: msg.id });
    return msg;
  }

  // ---------- change ----------
  const get = (ch, vid) => { const m = find(chan(ch), vid); if (!m || !m.vote) throw err(404, 'vote not found'); return m; };
  function settle(ch, mid, final, by) {
    let closed = null;
    const msg = update(chan(ch), mid, x => {
      const v = x.vote; if (v.status !== 'open') return x;
      const o = outcome(v, final); if (!o) return x;
      const t = tally(v);
      Object.assign(v, { status: o.status, result: o.option, reason: o.reason || undefined, closed: iso(now()), closedBy: by || null, voters: t.n, final: t.counts });
      closed = x; return x;
    });
    if (closed) afterClose(chan(ch), closed);
    return msg;
  }
  function afterClose(ch, m) {
    const v = m.vote;
    saveIdx(idx().filter(x => x.id !== m.id));
    const { head, counts } = resultLine(v);
    postChat(ch, 'tribecode', `🗳 **${v.q}** → **${head}** (${counts})`, { replyTo: { id: m.id, by: m.by, text: clip(v.q, 160) }, voteResult: m.id });
    const day = iso(now()).slice(0, 10);
    store.writeMd(`decisions/${day}-${slug(v.q).slice(0, 60) || 'vote'}.md`, { date: day, vote: m.id, channel: ch, result: head, ballots: v.ballots, by: m.by },
      `# ${head}: ${v.q}\n\nDecided by a chat vote (${counts}).${v.suggested ? ` Suggested by ${nameOf(v.suggested.agent)}.` : ''}\n\n${Object.entries(v.ballots).map(([mid, o]) => `- ${nameOf(mid)}: ${label(v, o)}`).join('\n')}\n`);
    bus.notify({ type: 'decision', priority: 'low', to: voters().map(x => x.id), from: 'tribecode', title: `Decided: ${clip(v.q, 120)}`, body: `${head} · ${counts}`, view: 'chat', ref: m.id });
  }

  function cast(ch, vid, me, option) {
    if (me.role === 'agent') throw err(403, 'agents cannot vote; their humans do');
    if (!isHuman(me)) throw err(403, 'spectators can read but not vote');
    const m = get(ch, vid), v = m.vote;
    if (v.status !== 'open') throw err(409, 'voting is closed');
    if (!voters().some(x => x.id === me.id)) throw err(403, 'you are not in this project');
    if (option !== 'clear' && !v.options.some(o => o.id === option)) throw err(400, 'unknown option');
    update(chan(ch), m.id, x => {
      const b = { ...(x.vote.ballots || {}) };
      if (option === 'clear' || b[me.id] === option) delete b[me.id]; else b[me.id] = option;
      x.vote.ballots = b; x.vote.seen = { ...(x.vote.seen || {}), [me.id]: x.vote.seen && x.vote.seen[me.id] || iso(now()) };
      return x;
    });
    return settle(ch, m.id, false, me.id);
  }
  function close(ch, vid, me) {
    const m = get(ch, vid);
    if (m.vote.status !== 'open') throw err(409, 'already closed');
    const mine = m.by === me.id || (m.vote.suggested && m.vote.suggested.owner === me.id);
    if (!mine && me.role !== 'host') throw err(403, 'only whoever started the vote, or the host, can close it early');
    return settle(ch, m.id, true, me.id);
  }
  function seen(ch, vid, me) {
    if (!isHuman(me)) return null;
    const m = get(ch, vid);
    if ((m.vote.seen || {})[me.id]) return m;
    return update(chan(ch), m.id, x => { x.vote.seen = { ...(x.vote.seen || {}), [me.id]: iso(now()) }; return x; });
  }
  function remind(ch, vid, me, { auto = false } = {}) {
    const m = get(ch, vid), v = m.vote;
    if (v.status !== 'open') throw err(409, 'voting is closed');
    if (!auto && !isHuman(me)) throw err(403, 'only people can nudge');
    if (!auto && v.reminded && now() - Date.parse(v.reminded) < REMIND_GAP) throw err(429, 'already nudged in the last 15 minutes');
    const waiting = tally(v).waiting.filter(x => auto || x !== me.id);
    if (!waiting.length) throw err(409, 'everyone has voted');
    bus.notify({ type: 'vote', priority: 'normal', to: waiting, from: auto ? 'tribecode' : me.id, title: auto ? 'A vote closes soon' : `${me.name} is waiting on your vote`, body: v.q, view: 'chat', ref: m.id });
    update(chan(ch), m.id, x => { x.vote.reminded = iso(now()); if (auto) x.vote.autoReminded = true; return x; });
    return { reminded: waiting.map(nameOf) };
  }

  // ---------- after a vote passes ----------
  const taskTitle = v => {
    if (v.kind === 'poll') return clip(`${v.q.replace(/\?+$/, '')}: ${label(v, v.result)}`, 200);
    return clip(cap(v.q.replace(/^(should|shall|can|could) we\s+/i, '').replace(/^(do we want to|are we (ok|okay|good|fine) with)\s+/i, '').replace(/\?+$/, '')), 200);
  };
  const decided = v => v.status === 'passed' || (v.status === 'closed' && v.result);
  function toTask(ch, vid, me) {
    if (!isHuman(me)) throw err(403, 'only people turn votes into tasks');
    const m = get(ch, vid), v = m.vote;
    if (!decided(v)) throw err(409, 'only a passed vote becomes a task');
    if (v.task) return { message: m, task: v.task };
    const { counts } = resultLine(v);
    const t = createTask({ title: taskTitle(v), by: me.id, source: 'vote', body: `Decided in a chat vote (${counts}): **${v.q}**` });
    const msg = update(chan(ch), m.id, x => { x.vote.task = { id: t.id, title: t.title }; return x; });
    return { message: msg, task: msg.vote.task };
  }
  function toBoard(ch, vid, me) {
    if (!isHuman(me)) throw err(403, 'only people send votes to the Board');
    const m = get(ch, vid), v = m.vote;
    if (!decided(v)) throw err(409, 'only a passed vote goes to the Board');
    if (v.proposal) return { message: m, proposal: v.proposal };
    const { counts } = resultLine(v);
    const ballots = v.kind === 'approve' ? Object.fromEntries(Object.entries(v.ballots).filter(([mid]) => isHuman(member(mid))).map(([mid, o]) => [mid, o === 'yes' ? 'yes' : 'no'])) : undefined;
    const p = board.propose(taskTitle(v), `Agreed in a chat vote (${counts}).\n\n> ${v.q}${v.task ? `\n\nTask: ${v.task.title}` : ''}${v.why ? `\n\nWhy: ${v.why}` : ''}`, me, { votes: ballots });
    const msg = update(chan(ch), m.id, x => { x.vote.proposal = { id: p.id, title: p.title, status: p.status }; return x; });
    return { message: msg, proposal: msg.vote.proposal };
  }

  function list(ch, n = 50) {
    const out = [];
    const all = store.readJSONL(`chat/${chan(ch)}.jsonl`, 5000);
    for (const m of all) if (m.vote && !m.deleted) out.push({ id: m.id, at: m.at, by: m.by, ...m.vote, tally: tally(m.vote) });
    return out.reverse().slice(0, n);
  }

  // ---------- deadlines + "closes soon" reminders ----------
  function sweep() {
    for (const e of idx()) {
      try {
        inProject(e.project, () => {
          const m = find(e.ch, e.id);
          if (!m || !m.vote || m.deleted || m.vote.status !== 'open') { saveIdx(idx().filter(x => x.id !== e.id)); return; }
          if (!m.vote.deadline) return;
          const left = Date.parse(m.vote.deadline) - now();
          if (left <= 0) return settle(e.ch, m.id, true, 'deadline');
          const span = Date.parse(m.vote.deadline) - Date.parse(m.at);
          if (!m.vote.autoReminded && left < Math.min(60 * 60_000, span / 4) && tally(m.vote).waiting.length) remind(e.ch, m.id, null, { auto: true });
        });
      } catch (x) { if (!x.status) console.error('votes sweep', x); }
    }
  }
  if (tick) setInterval(sweep, SWEEP_MS).unref();

  return { create, cast, close, seen, remind, toTask, toBoard, list, tally, sweep, parseCommand, looksLikeDecision, draftFrom };
};
module.exports.parseCommand = parseCommand;
module.exports.looksLikeDecision = looksLikeDecision;
module.exports.draftFrom = draftFrom;
