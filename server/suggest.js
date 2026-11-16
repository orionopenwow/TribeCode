// The tribe's suggestion engine, host side (docs/SUGGESTIONS.md). The browser (app/ui/suggest.js) runs the providers
// when it is idle; this file keeps what the tribe answered (so it learns, and a "no" is never asked again), the queue
// of ideas an AI helper proposed, and the heavier reading of chat, tasks and docs at low priority.
//
//   GET  /api/projects/:id/suggest                     { learn, dismissed, muted, applied, proposed, canEdit, ai }   people in the project
//   POST /api/projects/:id/suggest/feedback            { id, provider, kind, verdict: yes|no|notlike|later, title }
//                                                      yes/no/notlike: someone who can change things; later: anyone
//   PUT  /api/projects/:id/suggest/mute                { provider, on }       your own "stop suggesting about photos"
//   POST /api/projects/:id/suggest/propose             { title, why?, kind?, from?, action? }   a person or an AI helper:
//                                                      it waits in the same queue and needs Apply like everything else
//   GET  /api/projects/:id/suggest/signals?since=ISO   { at, sources, tasks }  what was said since (project-visible only)
//   POST /api/projects/:id/suggest/ideas               the tribe's AI (when it is on and you may use it) adds up to 3
//                                                      proposals from what was said lately
//   MCP  suggestions_list · suggestion_propose          the same, for a member's own Claude Code, Codex or Gemini
//
// action (what Apply does for a proposal): { type: 'task', title, desc? } · { type: 'site', ops: [sitecfg steps] } ·
// { type: 'note' } (nothing to change: Apply just says thanks). Anything else is dropped.
// Stored in .tribe/suggest/<pid>.json. Nothing here leaves the tribe; photos are never read on the host.
'use strict';
const CORE = require('../app/ui/suggest-core.js');

module.exports = function suggestEngine({ P, base, nameOf = x => x, loadTasks = () => [], siteComments = () => [], llm = null, broadcast = () => {}, log = () => {} }) {
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const file = pid => `.tribe/suggest/${safe(pid)}.json`;
  const blank = () => ({ learn: { p: {}, k: {} }, dismissed: {}, muted: {}, applied: [], proposed: [] });
  const load = pid => { const s = base.readJSON(file(pid), null); if (!s || typeof s !== 'object') return blank(); const b = blank(); return { learn: s.learn && typeof s.learn === 'object' ? { p: s.learn.p || {}, k: s.learn.k || {} } : b.learn, dismissed: s.dismissed || {}, muted: s.muted || {}, applied: Array.isArray(s.applied) ? s.applied : [], proposed: Array.isArray(s.proposed) ? s.proposed : [] }; };
  const save = (pid, s) => { try { require('node:fs').mkdirSync(require('node:path').join(base.root, '.tribe', 'suggest'), { recursive: true }); } catch {} base.writeJSON(file(pid), s); };
  const clip = (t, n) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, n);
  const SECRET = /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  const id = s => String(s || '').replace(/[^\w:.|-]/g, '').slice(0, 60);
  const prov = s => String(s || '').replace(/[^\w-]/g, '').slice(0, 24);

  // ---------- what may be read: the same rules as the website's suggestions (server/sitesuggest.js) ----------
  const reader = require('./sitesuggest.js')({ base, P, tasks: { load: () => loadTasks() }, nameOf, loadCfg: () => null, loadComments: pid => siteComments(pid), log });

  // ---------- low priority: one job at a time, a breath between steps so requests and typing go first ----------
  const queue = []; let busy = false;
  const breathe = () => new Promise(r => setImmediate(r));
  function low(fn) { return new Promise((res, rej) => { queue.push({ fn, res, rej }); pump(); }); }
  async function pump() { if (busy) return; busy = true; while (queue.length) { const j = queue.shift(); await breathe(); try { j.res(await j.fn(breathe)); } catch (e) { j.rej(e); } } busy = false; }

  async function signals(pid, since) {
    return low(async rest => {
      const t0 = Date.parse(since || '') || 0;
      const all = P.inProject ? P.inProject(pid, () => reader.gather(pid)) : reader.gather(pid);
      await rest();
      const sources = all.filter(s => !t0 || !s.at || Date.parse(s.at) > t0 || s.kind === 'task').slice(-240).map(s => ({ ...s, text: clip(s.text, 400) }));
      await rest();
      let tasks = []; try { tasks = (P.inProject ? P.inProject(pid, () => loadTasks()) : loadTasks()).filter(t => t && !t.private && (!t.project || t.project === pid) && t.status !== 'archived').slice(-300).map(t => ({ id: t.id, title: clip(t.title, 160), desc: clip(t.desc, 200), status: t.status })); } catch (e) { log('suggest tasks: ' + e.message); }
      return { at: new Date().toISOString(), sources, tasks };
    });
  }

  function view(pid, me, canEdit) {
    const s = load(pid);
    return { learn: s.learn, dismissed: Object.keys(s.dismissed), muted: s.muted[me.id] || [], applied: s.applied.slice(-20), proposed: s.proposed.filter(x => !s.dismissed[x.id]), canEdit, ai: aiOn(me) };
  }
  function feedback(pid, me, body, canEdit) {
    const v = String(body && body.verdict || ''); if (!/^(yes|no|notlike|later)$/.test(v)) return { error: 'verdict is yes, no, notlike or later' };
    if (v !== 'later' && !canEdit) return { error: 'someone who can change things answers a suggestion', status: 403 };
    const s = load(pid), sid = id(body.id), provider = prov(body.provider), kind = clip(body.kind, 40);
    if (!sid) return { error: 'id missing' };
    CORE.record(s.learn, { provider, kind, verdict: v });
    if (v === 'no' || v === 'notlike') { s.dismissed[sid] = { by: me.id, at: new Date().toISOString(), provider, kind, title: clip(body.title, 120), how: v }; const k = Object.keys(s.dismissed); if (k.length > 600) k.slice(0, k.length - 600).forEach(x => delete s.dismissed[x]); }
    if (v === 'yes') s.applied = s.applied.filter(a => a.id !== sid).concat({ id: sid, provider, kind, title: clip(body.title, 120), by: me.id, byName: nameOf(me.id), at: new Date().toISOString() }).slice(-100);
    if (v !== 'later') s.proposed = s.proposed.filter(x => x.id !== sid);
    save(pid, s); try { broadcast({ type: 'suggest', project: pid }); } catch {}
    return { ok: true, weight: CORE.weight(s.learn, provider, kind), why: CORE.explain(s.learn, provider, kind) };
  }
  function mute(pid, me, body) {
    const s = load(pid), p = prov(body && body.provider); if (!p) return { error: 'provider missing' };
    const mine = new Set(s.muted[me.id] || []); if (body.on === false) mine.delete(p); else mine.add(p);
    s.muted[me.id] = [...mine].slice(0, 20); save(pid, s); return { ok: true, muted: s.muted[me.id] };
  }
  function action(a) {
    if (!a || typeof a !== 'object') return { type: 'note' };
    if (a.type === 'task' && clip(a.title, 200)) return { type: 'task', title: clip(a.title, 200), desc: clip(a.desc, 1000) };
    if (a.type === 'site' && Array.isArray(a.ops) && a.ops.length) { const ops = a.ops.slice(0, 20).filter(o => o && typeof o === 'object' && typeof o.op === 'string'); const t = JSON.stringify(ops); if (ops.length && t.length < 20000 && !SECRET.test(t)) return { type: 'site', ops }; }
    return { type: 'note' };
  }
  function propose(pid, me, body) {
    const title = clip(body && body.title, 140); if (!title) return { error: 'title missing' };
    if (SECRET.test(title) || SECRET.test(String(body.why || ''))) return { error: 'that looks like a key or token' };
    const s = load(pid), sid = 'ai:' + CORE.hash(title.toLowerCase());
    if (s.dismissed[sid]) return { ok: true, already: 'the tribe said no to this one before', id: sid };
    if (s.proposed.some(x => x.id === sid)) return { ok: true, already: 'it is already waiting', id: sid };
    const from = (Array.isArray(body.from) ? body.from : []).slice(0, 4).map(f => ({ kind: clip(f && f.kind, 20) || 'chat', ref: clip(f && f.ref, 60), who: clip(f && f.who, 40) }));
    const x = { id: sid, provider: 'ai', kind: clip(body.kind, 40) || 'idea', title, why: clip(body.why, 400), from: from.length ? from : [{ kind: me.role === 'agent' ? 'agent' : 'person', ref: me.id, who: nameOf(me.id) }], action: action(body.action), by: me.id, byName: nameOf(me.id), at: new Date().toISOString() };
    s.proposed = s.proposed.concat(x).slice(-60); save(pid, s); try { broadcast({ type: 'suggest', project: pid }); } catch {}
    return { ok: true, id: sid, proposal: x };
  }
  function aiOn(me) { try { const st = llm && llm.asCaller ? llm.asCaller(me, () => llm.status()) : null; return !!(st && st.online && st.provider !== 'none'); } catch { return false; } }
  async function ideas(pid, me) {
    if (!llm || !aiOn(me)) return { ok: false, basic: true, say: 'The tribe has no AI switched on, so the suggestions stay rule-based.' };
    const sig = await signals(pid, '');
    const lines = sig.sources.filter(s => s.kind !== 'task').slice(-40).map(s => `- ${s.who || 'someone'} (${s.kind}): ${clip(s.text, 200)}`).join('\n');
    const tasks = sig.tasks.slice(-30).map(t => `- ${t.title}`).join('\n');
    const prompt = `What a small group building a project together said lately:\n${lines || '(nothing yet)'}\n\nTheir tasks:\n${tasks || '(none)'}\n\nSuggest up to 3 concrete next steps they have not planned yet. One per line, as: TITLE | WHY (short, plain words, no numbering).`;
    const out = await llm.asCaller(me, () => llm.generate(prompt, { system: 'You suggest small, concrete next steps for a project. Only use what you were told. Never invent facts or numbers.', maxTokens: 260 }));
    if (!out) return { ok: false, say: 'The AI did not answer just now.' };
    const made = [];
    for (const ln of String(out).split('\n').map(x => x.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 3)) {
      const [t, w] = ln.split('|').map(x => clip(x, 300));
      if (!t) continue;
      const r = propose(pid, { id: 'flint', role: 'agent' }, { title: t, why: w || '', kind: 'ai-idea', from: [{ kind: 'ai', ref: 'flint', who: 'Flint (AI)' }], action: { type: 'task', title: t, desc: w || '' } });
      if (r.proposal) made.push(r.proposal);
    }
    return { ok: true, made: made.length, proposals: made };
  }

  async function route(req, res, { m, a, b, c, parts = [], me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (!b || !P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
    if (me.role === 'guest') return fail(res, 403, 'join the tribe to see its suggestions');
    const d = parts[3] || '';
    const people = me.role !== 'agent';
    // answering a suggestion is for people who can change things; each Apply is still checked by its own endpoint (a
    // website change by site.edit, a task by the task rules), and a refusal there turns into "Ask" in the browser
    const canEdit = me.role !== 'spectator';
    try {
      if (!d && m === 'GET') return send(res, 200, view(b, me, canEdit));
      if (d === 'signals' && m === 'GET') { const url = new URL(req.url, 'http://x'); return send(res, 200, await signals(b, url.searchParams.get('since') || '')); }
      if (d === 'propose' && m === 'POST') { if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only'); const r = propose(b, me, (await readBody(req)) || {}); return r.error ? fail(res, 400, r.error) : send(res, 200, r); }
      if (!people) return fail(res, 403, 'an AI helper reads suggestions with suggestions_list and proposes with suggestion_propose');
      if (d === 'feedback' && m === 'POST') { const r = feedback(b, me, (await readBody(req)) || {}, canEdit); return r.error ? fail(res, r.status || 400, r.error) : send(res, 200, r); }
      if (d === 'mute' && m === 'PUT') { const r = mute(b, me, (await readBody(req)) || {}); return r.error ? fail(res, 400, r.error) : send(res, 200, r); }
      if (d === 'ideas' && m === 'POST') { if (!canEdit) return fail(res, 403, 'spectators are read-only'); return send(res, 200, await ideas(b, me)); }
      return fail(res, 404, 'not found');
    } catch (e) { log('suggest: ' + e.message); return fail(res, 500, 'the suggestions could not be read just now'); }
  }

  // ---------- MCP: the hook for a member's own AI (the later Claude integration builds on this) ----------
  const mcpTools = {
    suggestions_list: {
      description: 'List the suggestions waiting in this project (ideas the tribe has not answered yet, and what the tribe said no to, so you do not suggest it again). Rule-based providers run in people\'s browsers; this shows the queue of proposals and the tribe\'s answers.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: (_, me) => { const pid = P.current() || P.defaultId(); const s = load(pid); return { content: [{ type: 'text', text: JSON.stringify({ waiting: s.proposed.filter(x => !s.dismissed[x.id]).map(x => ({ id: x.id, title: x.title, why: x.why, by: x.byName, action: x.action.type })), saidNoTo: Object.values(s.dismissed).slice(-40).map(x => x.title).filter(Boolean), appliedLately: s.applied.slice(-20).map(x => x.title) }, null, 2) }] }; },
    },
    suggestion_propose: {
      description: 'Propose a suggestion to the tribe. It waits in the Suggestions list with your name on it and nothing changes until a person taps Apply. action (optional): {type:"task", title, desc} or {type:"site", ops:[website steps as site_propose takes them]}. Never repeat something in saidNoTo (suggestions_list).',
      inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'One line, plain words' }, why: { type: 'string', description: 'Why, citing who said what' }, kind: { type: 'string' }, action: { type: 'object', additionalProperties: true } }, required: ['title'], additionalProperties: false },
      run: (args, me) => { const pid = P.current() || P.defaultId(); const r = propose(pid, me, args || {}); return { content: [{ type: 'text', text: r.error ? r.error : r.already ? `Not added: ${r.already}.` : `Proposed “${r.proposal.title}”. It waits for a person to tap Apply.` }], ...(r.error ? { isError: true } : {}) }; },
    },
  };

  return { route, view, feedback, propose, signals, mcpTools, load };
};
