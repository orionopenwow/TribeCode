// Suggested changes to a project's website, drawn from what the tribe said (feat/site-editor2). The matching is
// app/ui/sitesuggest-core.js (shared with the browser, no AI); this file gathers what may be read and remembers answers.
//   GET  /api/projects/:id/site-suggestions            { suggestions, sources, history, canEdit }   any member of the project
//   POST /api/projects/:id/site-suggestions/dismiss    { id }                       a builder: the tribe does not want this one
//   POST /api/projects/:id/site-suggestions/applied    { id, title, before, after, target, source }   a builder: it was applied
//                                                      (the edit itself is a normal site-config save); kept as the element's history
// What is read (project-visible only, never anything private):
//   the project's main chat (not DMs, not deleted or system lines) · its tasks · its docs (not ones marked private) ·
//   decisions and proposals from the Board · updates (gists) · open comments pinned on the site.
// Private notes (the scratchpad), DMs, secrets and other projects are never read. Texts that look like a key or token are dropped.
// Stored in .tribe/website/<pid>.suggest.json: { dismissed: { id: { by, at } }, applied: [ … last 100 ] }.
'use strict';
const S = require('../app/ui/sitecfg.js');
const CORE = require('../app/ui/sitesuggest-core.js');

module.exports = function siteSuggest({ base, P, tasks, nameOf = x => x, loadCfg, loadComments, log = () => {} }) {
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const file = pid => `.tribe/website/${safe(pid)}.suggest.json`;
  const state = pid => { const s = base.readJSON(file(pid), null); return s && typeof s === 'object' ? { dismissed: s.dismissed || {}, applied: Array.isArray(s.applied) ? s.applied : [] } : { dismissed: {}, applied: [] }; };
  const SECRET = /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*\S{6,})/i;
  const clean = (t, n) => String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n || 600);
  const ok = t => t && !SECRET.test(t);

  // everything a member of this project may read that could say something about the site
  function gather(pid) {
    const out = [], add = (kind, id, text, x) => { text = clean(text, x && x.max) || clean(x && x.title, 200); if (ok(text) && (!x || !x.title || ok(x.title))) out.push({ id: `${kind}:${id}`, kind, text, title: clean(x && x.title, 120), who: x && x.by ? nameOf(x.by) : '', at: (x && x.at) || '', link: (x && x.link) || '', decided: !!(x && x.decided), ...(x && x.block ? { block: x.block } : {}) }); };
    let st = null; try { st = P.scopedStore(() => pid); } catch (e) { log('site-suggest store: ' + e.message); }
    if (st) {
      try { st.readJSONL('chat/general.jsonl', 300).forEach(x => { if (!x || x.deleted || !x.text || x.by === 'tribecode' || x.to || x.private || x.whisper || x.dm || x.hidden) return; add(x.gist ? 'update' : 'chat', x.id || x.at, x.text, { by: x.by, at: x.at, link: x.gist ? '#/updates' : '#/chat' }); }); } catch (e) { log('site-suggest chat: ' + e.message); }
      try { st.listMd('docs').slice(-60).forEach(f => { const r = st.readMd(f); if (!r) return; const m = r.meta || {}; if (m.private === true || m.visibility === 'private' || m.personal === true || m.draft === 'private') return; const slug = String(f).replace(/^docs[\\/]/, '').replace(/\.md$/, ''); add('doc', slug, r.body, { title: m.title || slug, by: m.by || m.author || '', at: m.updated || m.created || '', link: '#/docs/' + encodeURIComponent(slug), max: 4000 }); }); } catch (e) { log('site-suggest docs: ' + e.message); }
      try { st.listMd('decisions').slice(-30).forEach(f => { const r = st.readMd(f); if (!r) return; add('decision', String(f).replace(/^decisions[\\/]/, ''), r.body, { title: (r.body.match(/^#\s+(.+)$/m) || [])[1] || '', at: r.meta.date || '', by: r.meta.by || '', link: '#/board', decided: true, max: 2000 }); }); } catch (e) { log('site-suggest decisions: ' + e.message); }
      try { st.listMd('proposals').slice(-40).forEach(f => { const r = st.readMd(f); if (!r || !r.meta || !r.meta.id) return; const done = /^(?:passed|approved|accepted|done|merged|decided)$/i.test(String(r.meta.status || '')); if (/^(?:declined|rejected|withdrawn|closed)$/i.test(String(r.meta.status || ''))) return; add('proposal', r.meta.id, r.body, { title: r.meta.title || '', by: r.meta.by || '', at: r.meta.created || '', link: '#/board', decided: done, max: 2000 }); }); } catch (e) { log('site-suggest proposals: ' + e.message); }
    }
    try { (tasks && tasks.load ? tasks.load() : []).filter(t => t && !t.private && (!t.project || t.project === pid) && t.status !== 'archived').slice(-200).forEach(t => add('task', t.id, [t.desc, t.notes, t.body].filter(Boolean).join(' '), { title: t.title, by: t.by || t.createdBy || '', at: t.updated || t.created || '', link: '#/tasks/board', decided: t.status === 'done' })); } catch (e) { log('site-suggest tasks: ' + e.message); }
    try { (loadComments(pid) || []).filter(c => c.status !== 'resolved').forEach(c => add('comment', c.id, c.text, { by: c.by, at: c.at, block: c.block, title: c.label || '' })); } catch (e) { log('site-suggest comments: ' + e.message); }
    return out.filter(s => s.text);
  }

  function view(pid) {
    const cfg = loadCfg(pid), st = state(pid), sources = gather(pid);
    if (!cfg) return { suggestions: [], sources: [], history: [], none: true };
    // a suggestion the site already carries out is not suggested (the matcher sees to that); a dismissed one never comes back
    const suggestions = CORE.suggest(cfg, sources, S).filter(s => !st.dismissed[s.id]);
    return { suggestions, dismissed: Object.keys(st.dismissed), sources: sources.slice(-160).map(s => ({ ...s, text: s.text.slice(0, 400) })), history: st.applied.slice(-100) };
  }
  function dismiss(pid, me, id) { const st = state(pid); st.dismissed[String(id).slice(0, 40)] = { by: me.id, at: new Date().toISOString() }; const keys = Object.keys(st.dismissed); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete st.dismissed[k]); base.writeJSON(file(pid), st); return { ok: true }; }
  function applied(pid, me, body) {
    const st = state(pid), t = (body && body.target) || {}, src = (body && body.source) || {};
    const rec = { id: String(body.id || '').slice(0, 40), title: clean(body.title, 120), before: clean(body.before, 200), after: clean(body.after, 200), block: String(t.block || '').slice(0, 40), path: String(t.path || '').slice(0, 80), source: { kind: String(src.kind || '').slice(0, 20), who: clean(src.who, 60), at: String(src.at || '').slice(0, 40), text: clean(src.text, 220), link: /^#\//.test(src.link || '') ? String(src.link).slice(0, 120) : '' }, by: me.id, byName: nameOf(me.id), at: new Date().toISOString() };
    if (!rec.id) return { ok: false };
    st.applied = st.applied.filter(a => a.id !== rec.id).concat(rec).slice(-100); base.writeJSON(file(pid), st); return { ok: true, record: rec };
  }
  return { gather, view, dismiss, applied };
};
