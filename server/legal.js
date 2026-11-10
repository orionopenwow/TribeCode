// v0.27 company: Legal documents. Plain-English starting templates (templates/legal/*.json) with fill-in fields, short
// "what this means" notes and generic jurisdiction notes (US/UK/EU/CA/AU), written for TribeCode (structure of some
// informed by Common Paper's CC BY 4.0 standards, credited in the template). A draft becomes a doc in Files with a
// "Starting point, not legal advice" banner at the top and bottom, a decision-log entry when the project runs as a
// company, and optionally an approval "Send for signature" (no e-signing: approving just marks it ready to send).
//   GET  /api/legal                         { templates: [summary] }
//   GET  /api/legal/:id                     { template }
//   GET  /api/projects/:pid/legal           { drafts: [{ id, template, title, doc, at, by, status }] }
//   POST /api/projects/:pid/legal/draft { template, fields: {key: value}, signature?: true }   builders only
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'templates', 'legal');
const JUR_NAME = { US: 'the United States', UK: 'the United Kingdom', EU: 'the European Union', CA: 'Canada', AU: 'Australia', Other: 'other places' };
const BANNER = '> ⚖️ **Starting point, not legal advice.** This draft was made from a TribeCode template. Laws differ by place and situation: have a lawyer in your jurisdiction review it before anyone signs or relies on it.';
const TITLE_KEYS = ['party_b', 'contractor', 'client', 'assignor', 'volunteer', 'app_name', 'site', 'project', 'company'];

function loadAll() {
  const out = [];
  let files = []; try { files = fs.readdirSync(DIR).filter(f => /^[a-z0-9-]+\.json$/.test(f)); } catch {}
  for (const f of files) { try { const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); if (t && t.id && Array.isArray(t.fields) && Array.isArray(t.clauses)) out.push(t); } catch (e) { console.error('legal: ' + f + ' ' + e.message); } }
  const ORDER = ['nda', 'contractor', 'cofounder', 'ip', 'service', 'privacy', 'terms', 'cookies', 'revshare', 'volunteer'];
  return out.sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99);
}
// Values are plain text: no HTML, Markdown control characters at line starts are neutralised, sizes are capped.
const clean = (v, long) => String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/[<>]/g, '').replace(/^[ \t]*(#+|>+|-{3,})[ \t]*/gm, '').trim().slice(0, long ? 4000 : 300);
function values(tpl, fields) {
  const v = {};
  for (const f of tpl.fields) {
    let x = clean(fields && fields[f.key], f.type === 'textarea');
    if (f.type === 'select' && x && !(f.options || []).includes(x)) x = '';
    if (f.type === 'number' && x && !/^\d{1,6}(\.\d{1,2})?$/.test(x)) x = '';
    if (f.type === 'date' && x && !/^\d{4}-\d{2}-\d{2}$/.test(x)) x = '';
    v[f.key] = x || (f.default != null ? String(f.default) : '');
  }
  return v;
}
const included = (cl, v) => { if (!cl.when) return true; const w = String(cl.when); if (w[0] === '!') return !v[w.slice(1)]; const [k, eq] = w.split('='); return eq === undefined ? !!v[k] : v[k] === eq; };
function fillText(text, tpl, v) {
  const label = k => (tpl.fields.find(f => f.key === k) || {}).label || k;
  return String(text)
    .replace(/\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (v[k] ? inner : ''))
    .replace(/\{\{([a-z_]+)\}\}/g, (_, k) => (v[k] ? v[k] : `[${label(k)}]`));
}
function render(tpl, fields, { by = '', date = new Date().toISOString().slice(0, 10) } = {}) {
  const v = values(tpl, fields);
  const missing = tpl.fields.filter(f => f.required && !v[f.key]).map(f => f.label);
  const who = TITLE_KEYS.map(k => v[k]).find(Boolean);
  const title = `${tpl.title}${who ? ' · ' + who.split('\n')[0].slice(0, 60) : ''}`;
  const jur = v.jurisdiction && tpl.jurisdiction && tpl.jurisdiction[v.jurisdiction] ? v.jurisdiction : null;
  const lines = [BANNER, '', `*${tpl.title} · drafted ${date}${by ? ' by ' + by : ''} from a TribeCode template${jur ? ` · notes for ${JUR_NAME[jur]} at the end` : ''}*`, ''];
  let n = 0;
  for (const cl of tpl.clauses) {
    if (!included(cl, v)) continue;
    n++; lines.push(`## ${n}. ${cl.heading}`, '', fillText(cl.text, tpl, v), '');
    if (cl.note) lines.push(`> *What this means:* ${cl.note}`, '');
  }
  lines.push('---', '');
  if (jur) lines.push(`## Notes for ${JUR_NAME[jur]}`, '', tpl.jurisdiction[jur], '');
  lines.push('## Before anyone signs', '', '- Read every clause and replace anything in [square brackets].', '- Check the notes above and the rules where each party is based.', '- Have a lawyer in your jurisdiction review it.', '');
  if (tpl.credit) lines.push(`*${tpl.credit}*`, '');
  lines.push(BANNER);
  return { title, body: lines.join('\n'), missing, values: v };
}

module.exports = function legal({ P, base, store, docs, approvals, postChat, nameOf, broadcast }) {
  const T = loadAll();
  const byId = id => T.find(t => t.id === id);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const logFile = pid => base.p('projects', String(pid).replace(/[^a-z0-9-]/gi, ''), 'legal.json');
  const loadLog = pid => { try { return JSON.parse(fs.readFileSync(logFile(pid), 'utf8')); } catch { return []; } };
  const saveLog = (pid, l) => { fs.mkdirSync(path.dirname(logFile(pid)), { recursive: true }); fs.writeFileSync(logFile(pid), JSON.stringify(l.slice(-200), null, 2)); };
  const company = pid => { try { const c = JSON.parse(fs.readFileSync(base.p('projects', String(pid).replace(/[^a-z0-9-]/gi, ''), 'company.json'), 'utf8')); return c && c.on !== false ? c : null; } catch { return null; } };   // tiny local helper until company.get() (Agent A) lands
  const summary = t => ({ id: t.id, title: t.title, emoji: t.emoji, category: t.category, blurb: t.blurb, fields: t.fields.length, required: t.fields.filter(f => f.required).length, credit: t.credit || '' });
  const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'draft';
  function status(d) {
    if (!d.approval || !approvals || !approvals.get) return d.status || 'draft';
    const a = approvals.get(d.approval); if (!a) return d.status || 'draft';
    return a.status === 'approved' ? 'ready to send' : a.status === 'denied' ? 'not approved' : a.status === 'pending' ? 'waiting for approval' : a.status;
  }

  function draft(pid, me, body) {
    if (!me || ['spectator', 'guest'].includes(me.role)) throw err(403, 'only builders can draft documents');
    const tpl = byId(String(body.template || '')); if (!tpl) throw err(404, 'no such template');
    const r = render(tpl, body.fields || {}, { by: nameOf(me.id) });
    if (r.missing.length) throw err(400, `fill in: ${r.missing.join(', ')}`);
    const d = docs.create({ title: r.title, body: r.body, by: me.id });
    const saved = docs.save({ ...d, source: `legal:${tpl.id}` });
    const entry = { id: 'lg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), template: tpl.id, title: r.title, doc: saved.slug, at: new Date().toISOString(), by: me.id, status: 'draft' };
    const co = company(pid); let decision = null;
    if (co) {   // the company's decision log (the same decisions/ folder /decide writes)
      const day = entry.at.slice(0, 10), who = TITLE_KEYS.slice(0, 5).map(k => r.values[k]).find(Boolean);
      decision = `Drafted ${tpl.title}${who ? ' with ' + who.split('\n')[0].slice(0, 60) : ''}`;
      try { store.writeMd(`decisions/${day}-${slugify(decision)}.md`, { date: day, by: me.id, channel: 'legal', doc: saved.slug }, `# ${decision}\n\nA starting draft from the legal templates, saved in Files as **${r.title}**. Not legal advice: to be reviewed by a lawyer before signing.`); } catch (e) { console.error('legal: decision log', e.message); }
    }
    if (body.signature && approvals && me.role !== 'agent') {
      const a = approvals.create({ title: `Send for signature: ${r.title}`, details: `The draft is in Files (${r.title}). Approving only marks it ready to send: TribeCode doesn't e-sign. Have it reviewed by a lawyer first.`, risk: 'medium', kind: 'legal-signature' }, me);
      entry.approval = a.id; entry.status = 'waiting for approval';
    }
    const log = loadLog(pid); log.push(entry); saveLog(pid, log);
    try { postChat('general', 'tribecode', `⚖️ ${nameOf(me.id)} drafted **${r.title}** from the legal templates (a starting point, not legal advice).`); } catch {}
    broadcast && broadcast({ type: 'legal', project: pid });
    return { doc: { slug: saved.slug, title: saved.title }, draft: { ...entry, status: status(entry) }, decision };
  }

  async function route(req, res, { m, a, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (a === 'legal') {
        if (!b && m === 'GET') return send(res, 200, { templates: T.map(summary), banner: BANNER });
        if (b && m === 'GET') { const t = byId(b); return t ? send(res, 200, { template: t, banner: BANNER }) : fail(res, 404, 'no such template'); }
        return fail(res, 405, 'GET');
      }
      // /api/projects/:pid/legal[/draft]
      const pid = String(b || ''); if (!P.get(pid) || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
      return await P.inProject(pid, async () => {
        if (!parts[3] && m === 'GET') return send(res, 200, { drafts: loadLog(pid).slice().reverse().map(d => ({ ...d, byName: nameOf(d.by), status: status(d) })) });
        if (parts[3] === 'draft' && m === 'POST') return send(res, 200, draft(pid, me, await readBody(req, 128 * 1024)));
        return fail(res, 404, 'not found');
      });
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, render, templates: () => T, draft };
};
module.exports.render = render;
module.exports.BANNER = BANNER;
