// The office (feat/p10-office): a calm floor where every member of the tribe and every AI helper has a desk, and the
// screen at each desk says what they are doing right now, from what the tribe already shows (presence, the place
// someone has open, an agent's last tool step, its claimed files, the task board). Idea from the owner's own MIT
// project Vanilla Agents (desks with live screens, a fire to think at, a quest board), written fresh for TribeCode:
// no art, code or scene from it.
//
// Off by default. The host or an admin turns it on per tribe (Settings › This tribe, or the offer in the Agents hub);
// each person can still hide it for themselves (that lives on their device). The same file holds "agentsOff": with it
// on, agents' MCP tool calls are refused with a plain sentence until someone turns agents back on.
//
// Privacy: desks come from presenceFor(viewer), so "Show where I am" off and "Appear away" are respected, a DM is only
// ever "in messages", and nothing here carries message text, keys or tokens.
//
// Routes: GET /api/office -> { on, agentsOff, canSet, desks, board, at }, PUT /api/office { on?, agentsOff? } (host/admin).
// Broadcasts { type: 'office' } when the switches change.
'use strict';

module.exports = function office({ store, getMembers, presenceFor, placesFor = () => ({}), agentSeen, claims, loadTasks, changeReqs, nameOf, broadcast, canSet }) {
  const FILE = 'office.json';
  const read = () => { try { const v = store.readJSON(FILE, {}); return { on: !!v.on, agentsOff: !!v.agentsOff }; } catch { return { on: false, agentsOff: false }; } };
  let cfg = read();
  const save = () => { store.writeJSON(FILE, cfg); broadcast({ type: 'office', on: cfg.on, agentsOff: cfg.agentsOff }); };

  const THINK_MS = 25_000;   // an agent online with no tool step for this long is thinking (at the fire)
  const HANDED_MS = 90_000;  // a task finished in this window: the person walks to the board
  const iso = t => (t ? new Date(t).toISOString() : null);

  // Plain words for what an agent's last step was ("using claim file" -> "Claiming a file").
  const STEP = {
    claim_file: 'Claiming a file', release_file: 'Letting a file go', my_lane: 'Checking its lane', tribe_overview: 'Reading the tribe\'s plan',
    list_tasks: 'Looking at the task board', update_task: 'Updating a task', create_task: 'Adding a task', post_chat: 'Writing in #agents',
    read_doc: 'Reading a doc', write_doc: 'Writing a doc', request_review: 'Asking for a review', site_read: 'Reading the website', site_propose: 'Suggesting website changes',
    app_read: 'Reading the app', app_propose: 'Suggesting app changes', connected: 'Just connected',
  };
  const stepText = where => {
    if (!where) return '';
    const m = /^using (.+)$/.exec(where); if (!m) return String(where).slice(0, 80);
    const k = m[1].replace(/ /g, '_'); return STEP[k] || `Using ${m[1]}`;
  };

  function desks(me) {
    const now = Date.now();
    const pres = presenceFor(me) || [];
    const places = (() => { try { return placesFor(me) || {}; } catch { return {}; } })();   // the place each person has open (presence.js), as this viewer may see it
    const byId = new Map((getMembers() || []).map(m => [m.id, m]));
    const tasks = (() => { try { return loadTasks() || []; } catch { return []; } })();
    const cl = (() => { try { return claims.list() || []; } catch { return []; } })();
    const out = [];
    for (const p of pres) {
      const m = byId.get(p.id) || p;
      if (m.removed || p.role === 'spectator') continue;
      const agent = p.role === 'agent';
      const mine = tasks.filter(t => t.assignee === p.id);
      const doing = mine.find(t => t.status === 'doing') || null;
      const done = mine.filter(t => t.status === 'done' && t.updated && now - Date.parse(t.updated) < HANDED_MS)[0] || null;
      const files = cl.filter(c => c.by === p.id).map(c => c.path).slice(0, 3);
      const d = { id: p.id, name: p.name, color: p.color || null, kind: agent ? 'agent' : 'person', agentKind: p.agentKind || null,
        online: !!p.online, away: !!(p.away || p.idle), paused: !!p.paused, where: p.role === 'agent' ? null : (places[p.id] || null), since: p.since || null,
        task: doing ? { id: doing.id, title: String(doing.title || '').slice(0, 90) } : null, files, lines: [], spot: 'desk', state: 'off' };
      if (agent) {
        const seen = agentSeen && agentSeen.get(p.id);
        const step = seen ? stepText(seen.where) : '';
        d.lastStep = seen ? iso(seen.at) : null;
        if (!p.online) { d.state = 'off'; d.spot = 'desk'; }
        else if (p.paused) { d.state = 'away'; d.spot = 'lounge'; d.lines.push('Paused'); }
        else {
          d.state = 'active';
          if (done) { d.spot = 'board'; d.lines.push(`Handed in: ${String(done.title || '').slice(0, 60)}`); }
          else if (seen && now - seen.at > THINK_MS) { d.spot = 'think'; d.lines.push('Thinking…'); }
          else if (!doing && !files.length && (!seen || /connected|overview|lane/.test(seen.where || ''))) d.spot = 'lounge';
          if (step && d.spot !== 'board') d.lines.push(step);
          if (doing) d.lines.push(`Task: ${d.task.title}`);
          if (files.length) d.lines.push(`Files: ${files.join(', ')}`);
          if (p.doing && !d.lines.includes(p.doing)) d.lines.push(String(p.doing).slice(0, 90));
        }
      } else {
        if (!p.online) d.state = 'off';
        else if (d.away) { d.state = 'away'; d.spot = 'lounge'; }
        else {
          d.state = 'active';
          if (done) { d.spot = 'board'; d.lines.push(`Finished: ${String(done.title || '').slice(0, 60)}`); }
          else if (!p.where) d.spot = 'lounge';
          if (doing) d.lines.push(`Task: ${d.task.title}`);
          if (files.length) d.lines.push(`Files: ${files.join(', ')}`);
        }
      }
      d.lines = d.lines.slice(0, 4);
      out.push(d);
    }
    // people first (by name), then agents; the order stays stable so desks don't jump around
    out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'person' ? -1 : 1) || String(a.name).localeCompare(String(b.name)));
    return out;
  }

  function board(me) {
    const tasks = (() => { try { return loadTasks() || []; } catch { return []; } })();
    const open = tasks.filter(t => t.status !== 'done' && !t.archived);
    let waiting = 0;
    try { waiting = (changeReqs ? changeReqs(me) : []).filter(r => r.status === 'open' || r.status === 'waiting' || r.status === 'pending').length; } catch {}
    return {
      todo: open.filter(t => t.status !== 'doing').length, doing: open.filter(t => t.status === 'doing').length, requests: waiting,
      top: open.slice(0, 4).map(t => ({ id: t.id, title: String(t.title || '').slice(0, 60), who: t.assignee ? nameOf(t.assignee) : null, status: t.status || 'todo' })),
    };
  }

  // Agents off: a plain refusal for every MCP tool call (the gate in server/index.js asks this).
  const refuse = () => (cfg.agentsOff ? 'Agents are turned off in this tribe right now. Someone in the tribe can turn them back on in the Agents hub.' : null);

  async function route(req, res, { m, me, send, fail, readBody }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET') {
      const allowed = !!canSet(me);
      return send(res, 200, { on: cfg.on, agentsOff: cfg.agentsOff, canSet: allowed, desks: cfg.on ? desks(me) : [], board: cfg.on ? board(me) : null, at: new Date().toISOString() });
    }
    if (m === 'PUT' || m === 'POST') {
      if (!canSet(me)) return fail(res, 403, 'only the host or an admin can change this');
      const b = (await readBody(req)) || {};
      if (typeof b.on === 'boolean') cfg.on = b.on;
      if (typeof b.agentsOff === 'boolean') cfg.agentsOff = b.agentsOff;
      save();
      return send(res, 200, { on: cfg.on, agentsOff: cfg.agentsOff });
    }
    return fail(res, 405, 'method not allowed');
  }

  return { route, refuse, state: () => ({ ...cfg }), desks, board };
};
