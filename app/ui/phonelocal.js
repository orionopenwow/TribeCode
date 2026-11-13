// Phone-only completeness (feat/mobile-complete, docs/MOBILE-COMPLETE.md): the API paths a tribe that lives only on this
// device (offline.js solo mode) used to answer with "This needs a real tribe". Each is answered here, from the same
// localStorage draft (offline.js db), so it persists and moves to a host with the rest:
//   real, local:  website designer (site-config, versions, autofill, comments, publish = "kept on this phone"),
//                 task settings, Money (ledger entries, summary, runway, CSV), Work (profile, gigs), storage (this
//                 device's usage), Academy (the bundled catalog, progress per member), captures/recipes/packs (empty),
//                 TRIBE_CONTEXT.md (written from the project), the drift radar (an honest "needs a repository"),
//                 the Secretary without AI (today's summary, action items, decisions, questions, notes; secsum.js).
//   needs a host: AI helpers (fleet, hub, MCP connections, Open Space), the git repository, the Secretary's journal + ideas, phone-app
//                 builds, tribe links: a calm 409 with { needsHost } and TribeNextOpts.nudge(feature), never an error.
// Installed as an offline.js route hook (TribeOffline._k.hooks.route), so it only runs while a local tribe is active.
(function () {
  'use strict';
  const OFF = () => window.TribeOffline;
  const K = () => OFF() && OFF()._k;
  const iso = () => new Date().toISOString();
  const rid = (n = 8) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, '0');
  const ok = d => [200, d];
  const soloOnly = () => OFF() && OFF().solo && OFF().solo();
  const round = n => Math.round(Number(n) * 100) / 100;
  const monthOf = s => String(s || '').slice(0, 7);

  function needsHost(feature, msg) {
    try { window.TribeNextOpts && setTimeout(() => window.TribeNextOpts.nudge(feature), 60); } catch {}
    const why = window.TribeNextOpts ? window.TribeNextOpts.why(feature) : 'This needs a computer or a host.';
    return [409, { error: msg || why, needsHost: feature }];
  }
  const L = () => { const db = K().db(); db.local = db.local || {}; return db.local; };
  const bag = (name, pid) => { const l = L(); l[name] = l[name] || {}; if (pid === undefined) return l[name]; l[name][pid] = l[name][pid] || {}; return l[name][pid]; };
  const save = () => K().save();
  const meName = () => { const m = (K().db().members || []).find(x => x.id === 'me'); return (m && m.name) || 'You'; };
  const project = pid => K().proj(pid) || {};

  // ---------- the website designer (server/sitedesign.js + siteflint.js versions, on this device) ----------
  function site(method, pid, d, e, body) {
    const s = bag('site', pid);
    if (d === 'site-config') {
      if (!e && method === 'GET') return ok({ config: s.config || null, rev: s.rev || 0, canEdit: true });
      if (!e && method === 'PUT') {
        if (!body || typeof body.config !== 'object') return [400, { error: 'config needed' }];
        const size = JSON.stringify(body.config).length; if (size > 6 * 1024 * 1024) return [413, { error: 'That site is over 6 MB. Use smaller pictures.' }];
        if (body.base != null && s.rev && body.base < s.rev && !body.force) return [409, { conflict: true, config: s.config, rev: s.rev, by: meName() }];
        s.config = body.config; s.rev = (s.rev || 0) + 1; s.at = iso(); save(); return ok({ ok: true, rev: s.rev });
      }
      if (e === 'publish' && method === 'POST') {
        const pages = (s.config && Array.isArray(s.config.pages) ? s.config.pages : [{}]).map((p, i) => (i ? `${(p && p.slug) || 'page' + i}.html` : 'index.html'));
        s.published = iso(); save();
        try { window.TribeNextOpts && setTimeout(() => window.TribeNextOpts.nudge('publish'), 300); } catch {}
        return ok({ files: pages, dir: 'this phone (Download gives you the files; a public link needs a host)', local: true });
      }
    }
    if (d === 'site-autofill' && method === 'GET') {
      const p = project(pid), db = K().db(), tasks = (db.tasks || {})[pid] || [];
      return ok({ name: p.name || '', tagline: p.bio || '', mission: ((db.vision || {})[pid] || '').split('\n').find(x => x.trim() && !/^#/.test(x)) || '',
        members: [{ name: meName(), role: 'host' }], building: tasks.filter(t => t.status !== 'done').slice(0, 5).map(t => t.title), links: [], hours: '', email: '', phone: '', address: '', accent: p.color || '', pictures: [], logo: p.image || null });
    }
    if (d === 'site-comments') {
      s.comments = s.comments || [];
      if (!e && method === 'GET') return ok({ comments: s.comments, canEdit: true });
      if (!e && method === 'POST') { const c = { id: 'sc-' + rid(), page: body.page || '', block: body.block || '', blockType: body.blockType || '', label: String(body.label || '').slice(0, 80), text: String(body.text || '').slice(0, 2000), x: body.x, y: body.y, by: 'me', byName: meName(), at: iso(), status: 'open' }; s.comments.push(c); save(); return ok({ comment: c }); }
      const c = s.comments.find(x => x.id === e); const act = arguments[5];
      if (c && method === 'POST' && (act === 'resolve' || act === 'reopen')) { c.status = act === 'resolve' ? 'resolved' : 'open'; save(); return ok({ comment: c }); }
      if (c && method === 'DELETE') { s.comments = s.comments.filter(x => x !== c); save(); return ok({ ok: true }); }
      if (e === 'tasks' && method === 'POST') return ok({ tasks: [], made: 0 });
    }
    return null;
  }
  function versions(method, pid, vid, body) {
    const s = bag('site', pid); s.versions = s.versions || [];
    if (!vid && method === 'GET') return ok({ versions: s.versions.map(v => ({ id: v.id, note: v.note, at: v.at, byName: v.byName })) });
    if (!vid && method === 'POST') { const v = { id: 'v-' + rid(), note: String((body && body.note) || 'Saved on this phone').slice(0, 120), at: iso(), byName: meName(), config: s.config || null }; s.versions.unshift(v); s.versions = s.versions.slice(0, 30); save(); return ok({ version: { id: v.id, note: v.note, at: v.at } }); }
    const v = s.versions.find(x => x.id === vid);
    if (v && method === 'GET') return ok({ version: v });
    if (v && method === 'POST') { s.config = v.config; s.rev = (s.rev || 0) + 1; save(); return ok({ ok: true, config: s.config, rev: s.rev }); }
    if (v && method === 'DELETE') { s.versions = s.versions.filter(x => x !== v); save(); return ok({ ok: true }); }
    return null;
  }

  // ---------- Money (server/ledger.js, the parts a phone can do) ----------
  const KINDS = ['revenue', 'cost', 'users', 'other'], CATS = ['hosting', 'tools', 'ai', 'ads', 'fees', 'people', 'other'];
  function books(pid) { const b = bag('ledger', pid); b.entries = b.entries || []; b.settings = b.settings || { currency: 'USD', cash: null }; return b; }
  const srcList = es => { const m = new Map(); for (const e of es) { const k = e.source.type + '|' + e.source.name; const x = m.get(k) || { type: e.source.type, name: e.source.name, count: 0, last: null }; x.count++; if (!x.last || e.at > x.last) x.last = e.at; m.set(k, x); } return [...m.values()].sort((a, b) => b.count - a.count); };
  function totals(es, cur) {
    const mine = es.filter(e => e.kind === 'users' || e.currency === cur);
    const rev = mine.filter(e => e.kind === 'revenue'), cost = mine.filter(e => e.kind === 'cost'), users = mine.filter(e => e.kind === 'users');
    const sum = a => round(a.reduce((s, e) => s + e.amount, 0));
    const cats = new Map(); for (const e of cost) { const c = cats.get(e.category || 'other') || { category: e.category || 'other', total: 0, count: 0 }; c.total = round(c.total + e.amount); c.count++; cats.set(c.category, c); }
    const labels = new Map(); for (const e of users) labels.set(e.label, (labels.get(e.label) || 0) + e.amount);
    return { rev, cost, users, revenue: sum(rev), costs: sum(cost), net: round(sum(rev) - sum(cost)), byCategory: [...cats.values()].sort((a, b) => b.total - a.total), usersTotal: users.reduce((s, e) => s + e.amount, 0), byLabel: [...labels.entries()].map(([label, total]) => ({ label, total })) };
  }
  function summary(pid, month) {
    const d = books(pid), cur = d.settings.currency || 'USD';
    month = /^\d{4}-\d{2}$/.test(month || '') ? month : iso().slice(0, 7);
    const inMonth = d.entries.filter(e => monthOf(e.at) === month), t = totals(inMonth, cur);
    const cash = d.settings.cash && Number.isFinite(d.settings.cash.amount) ? d.settings.cash : null;
    const runway = { months: null, cash, burn: null, basis: [], reason: '' };
    const months = []; { const [y, mo] = month.split('-').map(Number); for (let i = 0; i < 3; i++) months.push(new Date(Date.UTC(y, mo - 1 - i, 1)).toISOString().slice(0, 7)); }
    const per = months.map(m => ({ month: m, ...totals(d.entries.filter(e => monthOf(e.at) === m), cur) })).filter(x => x.rev.length || x.cost.length);
    if (per.length) { runway.burn = round(per.reduce((s, x) => s + (x.costs - x.revenue), 0) / per.length); runway.basis = per.map(x => x.month); }
    if (!cash) runway.reason = 'Add your cash on hand to see runway.';
    else if (runway.burn == null) runway.reason = 'No revenue or costs yet to measure a burn rate.';
    else if (runway.burn <= 0) runway.reason = 'Not burning cash: revenue covers costs.';
    else runway.months = Math.round(cash.amount / runway.burn * 10) / 10;
    const last = a => a.reduce((m, e) => (!m || e.at > m ? e.at : m), null);
    const oc = new Map(); for (const e of inMonth.filter(x => x.kind !== 'users' && x.currency !== cur)) oc.set(e.currency, (oc.get(e.currency) || 0) + 1);
    return { month, currency: cur,
      revenue: { total: t.revenue, count: t.rev.length, sources: srcList(t.rev), last: last(t.rev) },
      costs: { total: t.costs, count: t.cost.length, byCategory: t.byCategory, sources: srcList(t.cost), last: last(t.cost) },
      net: t.net, users: { total: t.usersTotal, count: t.users.length, byLabel: t.byLabel, sources: srcList(t.users), last: last(t.users) },
      other: { count: inMonth.filter(e => e.kind === 'other').length }, otherCurrencies: [...oc.entries()].map(([currency, count]) => ({ currency, count })),
      runway, asOf: last(inMonth), entries: inMonth.length, aiSpend: { week: iso().slice(0, 10), currency: cur, total: 0, seats: [] } };
  }
  function ledger(method, pid, e, q, body) {
    const d = books(pid);
    const company = ((K().db().company || {})[pid]) || null;
    const view = x => ({ ...x, byName: x.by === 'me' ? meName() : x.by });
    if (!e && method === 'GET') {
      let es = d.entries.slice().sort((a, b) => (a.at < b.at ? 1 : -1));
      if (/^\d{4}-\d{2}$/.test(q.get('month') || '')) es = es.filter(x => monthOf(x.at) === q.get('month'));
      if (q.get('kind')) es = es.filter(x => x.kind === q.get('kind'));
      if (q.get('q')) { const s = q.get('q').toLowerCase(); es = es.filter(x => String(x.label).toLowerCase().includes(s)); }
      return ok({ entries: es.slice(0, 300).map(view), total: es.length, settings: d.settings, canWrite: true, isHost: true,
        company: company ? { name: company.name || '', seats: (company.seats || []).map(s => ({ id: s.id, kind: s.kind, title: s.title || s.id, color: s.color || null, holder: s.holder || {}, budgetWeekly: 0 })) } : null,
        sources: srcList(d.entries), imports: [], kinds: KINDS, categories: CATS });
    }
    if (!e && method === 'POST') {
      const kind = KINDS.includes(body.kind) ? body.kind : null, amount = Number(body.amount);
      if (!kind) return [400, { error: 'Pick revenue, cost, users or other.' }];
      if (!Number.isFinite(amount) || amount < 0) return [400, { error: 'Type an amount, like 12.50.' }];
      const at = /^\d{4}-\d{2}-\d{2}/.test(body.at || '') ? new Date(body.at).toISOString() : iso();
      const x = { id: 'l-' + rid(10), kind, amount: kind === 'users' ? Math.round(amount) : round(amount), currency: d.settings.currency, label: String(body.label || '').slice(0, 120) || kind, category: kind === 'cost' ? (CATS.includes(body.category) ? body.category : 'other') : undefined, at, added: iso(), by: 'me', source: { type: 'manual', name: 'Typed in' } };
      d.entries.push(x); save(); return ok({ entry: view(x) });
    }
    if (e === 'summary' && method === 'GET') return ok(summary(pid, q.get('month')));
    if (e === 'connectors' && method === 'GET') return ok({ connectors: [] });
    if (e === 'ai-spend' && method === 'GET') return ok(summary(pid).aiSpend);
    if (e === 'settings' && method === 'PUT') { if (body.cash) { const a = Number(body.cash.amount); d.settings.cash = Number.isFinite(a) ? { amount: round(a), currency: body.cash.currency || d.settings.currency, at: iso() } : null; } if (body.currency) d.settings.currency = String(body.currency).slice(0, 3).toUpperCase(); save(); return ok({ settings: d.settings }); }
    if (e === 'import') return needsHost('connectors', 'Importing a CSV works once the project has a home. On this phone, add entries by hand.');
    const x = d.entries.find(y => y.id === e);
    if (x && method === 'DELETE') { d.entries = d.entries.filter(y => y !== x); save(); return ok({ ok: true }); }
    if (x && (method === 'PATCH' || method === 'PUT')) { if (body.label != null) x.label = String(body.label).slice(0, 120); if (body.amount != null && Number.isFinite(Number(body.amount))) x.amount = round(body.amount); save(); return ok({ entry: view(x) }); }
    return null;
  }
  function ledgerCsv(pid, q) {
    const d = books(pid), m = q.get('month');
    const es = d.entries.filter(x => !m || monthOf(x.at) === m);
    const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = ['date,kind,label,category,amount,currency,source'].concat(es.map(x => [x.at.slice(0, 10), x.kind, x.label, x.category || '', x.amount, x.currency, x.source.name].map(cell).join(','))).join('\n');
    return ok({ csv, filename: `books-${m || 'all'}.csv`, rows: es.length });
  }

  // ---------- Work (server/talent.js, the person's own side) ----------
  function talent(method, b, c, body) {
    const t = bag('talent'); t.profile = t.profile || { skills: [], roles: [], hours: '', rate: { type: 'free', text: '' }, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '', links: [], projects: [], open: false, updated: null };
    t.gigs = t.gigs || [];
    const me = () => ({ id: 'me', name: meName(), ...t.profile });
    if (!b && method === 'GET') return ok({ me: me(), gigs: t.gigs, people: [], seatKinds: [], balance: { net: 0, given: 0, got: 0 }, canPost: true, local: true });
    if (b === 'profile' && !c && method === 'GET') return ok({ profile: me() });
    if (b === 'profile' && method === 'PUT') { Object.assign(t.profile, body || {}, { updated: iso() }); save(); return ok({ profile: me() }); }
    if (b === 'people' && method === 'GET') return ok({ people: [] });
    if (b === 'gigs' && !c && method === 'GET') return ok({ gigs: t.gigs });
    if (b === 'gigs' && !c && method === 'POST') { const g = { id: 'g-' + rid(), title: String(body.title || 'A gig').slice(0, 120), body: String(body.body || body.text || '').slice(0, 2000), pay: body.pay || { type: 'free', text: '' }, by: 'me', byName: meName(), at: iso(), status: 'open', applicants: [], places: [] }; t.gigs.unshift(g); save(); return ok({ gig: g }); }
    const g = t.gigs.find(x => x.id === c);
    if (b === 'gigs' && g && method === 'DELETE') { t.gigs = t.gigs.filter(x => x !== g); save(); return ok({ ok: true }); }
    if (b === 'gigs' && g && method === 'PATCH') { Object.assign(g, body || {}); save(); return ok({ gig: g }); }
    if (b === 'timebank' && method === 'GET') return ok({ entries: [], balance: { net: 0, given: 0, got: 0 } });
    if (b === 'compute' && method === 'GET') return ok({ offers: [], mine: [], available: false, reason: 'Sharing compute needs a computer.' });
    if (b === 'public' && method === 'GET') return ok({ available: false, gigs: [], reason: 'offline' });
    if (method !== 'GET') return needsHost('friends', 'Hiring and applying need other people, so the project needs a home first.');
    return null;
  }

  // ---------- Academy: the same catalog as the host (templates/academy.json, bundled as academy-catalog.json) ----------
  let cat = null;
  const catalog = () => (cat = cat || fetch('academy-catalog.json').then(r => (r.ok ? r.json() : { tracks: [] })).catch(() => ({ tracks: [] })));
  async function academy(method, b, body) {
    const A = await catalog(), prog = bag('academy'), mine = prog.me = prog.me || {};
    const sum = t => ({ id: t.id, kind: t.kind, title: t.title, emoji: t.emoji, color: t.color, blurb: t.blurb, lessons: t.lessons.length, minutes: t.lessons.reduce((n, l) => n + (l.minutes || 0), 0), done: ((mine[t.id] || {}).done || []).length });
    if (!b && method === 'GET') return ok({ tracks: A.tracks.map(sum), seat: null, mine: 'founder', progress: mine, badges: [], note: A.note || '' });
    if (b === 'progress' && method === 'POST') { const tr = mine[body.track] = mine[body.track] || { done: [] }; if (body.lesson && !tr.done.includes(body.lesson)) tr.done.push(body.lesson); save(); return ok({ progress: mine, badges: [] }); }
    const t = A.tracks.find(x => x.id === b);
    if (t && method === 'GET') return ok({ track: { ...t, done: (mine[t.id] || {}).done || [] } });
    return null;
  }

  // ---------- this device's storage ----------
  async function storage() {
    let est = {}; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : {}; } catch {}
    const db = K().db();
    return ok({ where: 'device', folder: '', cloudSave: false, projects: (db.projects || []).map(p => ({ id: p.id, name: p.name, hasRepo: !!(((db.homes || {})[p.id] || {}).github), github: (((db.homes || {})[p.id] || {}).github || {}).repo || '' })),
      github: { signedIn: !!(window.TribeGhPhone && window.TribeGhPhone.getToken()), login: (window.TribeGhPhone && window.TribeGhPhone.login()) || '' },
      device: { used: est.usage || 0, quota: est.quota || 0, persisted: false } });
  }

  // ---------- the calendar (server/plan.js: events, repeats, due tasks) ----------
  const DAY = 864e5;
  function occ(ev, from, to) {
    const s0 = Date.parse(ev.start), len = Math.max(0, Date.parse(ev.end) - s0) || 30 * 60000, out = [];
    if (!['weekly', 'weekdays', 'daily'].includes(ev.repeat)) { if (s0 < to && s0 + len > from) out.push([s0, s0 + len]); return out; }
    const step = ev.repeat === 'weekly' ? 7 : 1, d = new Date(s0);
    for (let i = 0; i < 400; i++) { const t = d.getTime(); if (t >= to) break; const wk = d.getDay(); if (t + len > from && !(ev.repeat === 'weekdays' && (wk === 0 || wk === 6))) out.push([t, t + len]); d.setDate(d.getDate() + step); }
    return out;
  }
  function calendar(method, b, q, body) {
    const c = bag('calendar'); c.events = c.events || [];
    const view = (from, to) => { const out = []; for (const ev of c.events) for (const [s, e] of occ(ev, from, to)) out.push({ id: ev.id, key: `${ev.id}@${new Date(s).toISOString()}`, title: ev.title, start: new Date(s).toISOString(), end: new Date(e).toISOString(), attendees: ev.attendees || [], huddle: !!ev.huddle, repeat: ev.repeat || null, ritual: null, by: 'me' }); return out.sort((x, y) => x.start.localeCompare(y.start)); };
    const day = t => new Date(t).toISOString().slice(0, 10);
    const due = (from, to) => Object.values(K().db().tasks || {}).flat().filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') && t.due >= day(from - DAY) && t.due <= day(to + DAY)).map(t => ({ id: t.id, title: t.title, due: t.due, status: t.status, assignee: t.assignee || null }));
    if (!b && method === 'GET') { const from = Date.parse(q.get('from')) || Date.now() - 7 * DAY, to = Date.parse(q.get('to')) || Date.now() + 30 * DAY; return ok({ events: c.events, occurrences: view(from, to), tasks: due(from, to) }); }
    if (b === 'upcoming' && method === 'GET') {   // the same shape as server/plan.js upcoming(): events (kind 'event') and due tasks (kind 'task'), overdue first
      const n = Number(q.get('n')) || 3, now = Date.now(), t0 = new Date(), today = `${t0.getFullYear()}-${String(t0.getMonth() + 1).padStart(2, '0')}-${String(t0.getDate()).padStart(2, '0')}`;
      const evs = view(now, now + 60 * DAY).filter(e => Date.parse(e.end) > now).map(e => ({ kind: 'event', at: e.start, ...e }));
      const tasks = (K().db().tasks[K().cur()] || []).filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') && t.status !== 'done').map(t => ({ kind: 'task', at: t.due + 'T23:59:00', id: t.id, title: t.title, due: t.due, status: t.status, assignee: t.assignee || null, overdue: t.due < today }));
      return ok({ items: [...tasks.filter(t => t.overdue), ...[...evs, ...tasks.filter(t => !t.overdue)].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))].slice(0, n) });
    }
    if (!b && method === 'POST') {
      if (!Date.parse(body.start)) return [400, { error: 'start required' }];
      const s = Date.parse(body.start), end = body.end && Date.parse(body.end) ? body.end : new Date(s + (Number(body.duration) || 30) * 60000).toISOString();
      const ev = { id: 'e-' + Date.now().toString(36) + '-' + rid(4), title: String(body.title || 'Untitled event').slice(0, 120), start: new Date(s).toISOString(), end, attendees: ['me'], huddle: !!body.huddle, repeat: ['weekly', 'weekdays', 'daily'].includes(body.repeat) ? body.repeat : null, notes: String(body.notes || ''), by: 'me', created: iso(), updated: iso() };
      c.events.push(ev); save(); return ok({ event: ev });
    }
    const ev = c.events.find(x => x.id === b);
    if (!ev) return b ? [404, { error: 'event not found' }] : null;
    if (method === 'GET') return ok({ event: ev });
    if (method === 'DELETE') { c.events = c.events.filter(x => x !== ev); save(); return ok({ ok: true }); }
    if (method === 'PATCH' || method === 'PUT') {
      if (body.start && Date.parse(body.start)) { const len = Date.parse(ev.end) - Date.parse(ev.start); ev.start = new Date(Date.parse(body.start)).toISOString(); ev.end = new Date(Date.parse(ev.start) + (body.duration ? Number(body.duration) * 60000 : len)).toISOString(); }
      for (const k of ['title', 'notes']) if (typeof body[k] === 'string') ev[k] = body[k].slice(0, k === 'notes' ? 4000 : 120);
      if (body.repeat !== undefined) ev.repeat = ['weekly', 'weekdays', 'daily'].includes(body.repeat) ? body.repeat : null;
      if (body.huddle !== undefined) ev.huddle = !!body.huddle;
      ev.updated = iso(); save(); return ok({ event: ev });
    }
    return null;
  }

  // ---------- code files on this device (the shapes of server/codefiles.js; GitHub sync in ghphone.js) ----------
  function codeStore(pid) { const c = bag('code', pid); c.files = c.files || {}; c.log = c.log || []; return c; }
  const HIDE = /(^|\/)(\.git|node_modules|dist)(\/|$)|(^|\/)\.env|\.(pem|key)$/i;
  function code(method, b, q, body) {
    const pid = K().cur(), c = codeStore(pid), paths = Object.keys(c.files).filter(p => !HIDE.test(p)).sort();
    const gh = c.github || null;
    if (!b && method === 'GET') return ok({ hasRepo: paths.length > 0 || !!gh, git: false, branch: gh ? gh.branch : 'main', github: gh ? `https://github.com/${gh.repo}` : null, name: gh ? gh.repo.split('/')[1] : (project(pid).name || 'project'), local: true });
    if (b === 'branches') return ok({ current: gh ? gh.branch : 'main', branches: [{ name: gh ? gh.branch : 'main', current: true, sha: gh ? gh.head : '', subject: (c.log[0] || {}).subject || '', author: meName(), at: (c.log[0] || {}).at || null }] });
    if (b === 'tree') {
      const base = String(q.get('path') || '').replace(/^\/+|\/+$/g, ''), pre = base ? base + '/' : '', seen = new Map();
      for (const p of paths) { if (!p.startsWith(pre)) continue; const rest = p.slice(pre.length), i = rest.indexOf('/'); const name = i < 0 ? rest : rest.slice(0, i); if (!seen.has(name)) seen.set(name, i < 0 ? { name, path: pre + name, type: 'file', size: (c.files[p].text || '').length } : { name, path: pre + name, type: 'dir' }); }
      const entries = [...seen.values()].sort((x, y) => (x.type === y.type ? x.name.localeCompare(y.name) : x.type === 'dir' ? -1 : 1));
      return ok({ ref: '', path: base, entries, total: entries.length, more: false });
    }
    if (b === 'file' && method === 'GET') { const p = q.get('path'), f = c.files[p]; if (!f || HIDE.test(p)) return [404, { error: 'file not found' }]; return ok({ ref: '', path: p, size: (f.text || '').length, binary: !!f.binary, tooBig: false, hidden: false, text: f.binary ? '' : f.text }); }
    if (b === 'file' && method === 'PUT') {
      const p = String(body.path || '').replace(/^\/+/, ''); if (!p || /(^|\/)\.\.(\/|$)/.test(p) || HIDE.test(p)) return [400, { error: 'pick a file path inside the project' }];
      const f = c.files[p] = c.files[p] || {}; f.text = String(body.text || ''); f.at = iso(); f.dirty = true;
      c.log.unshift({ sha: 'local-' + rid(7), author: meName(), at: iso(), subject: String(body.message || `Edit ${p}`).slice(0, 120), path: p }); c.log = c.log.slice(0, 200);
      save(); return ok({ ok: true, path: p, commit: c.log[0], local: true });
    }
    if (b === 'search') { const s = String(q.get('q') || '').toLowerCase(); return ok({ results: paths.filter(p => p.toLowerCase().includes(s)).slice(0, 50).map(path => ({ path })), more: false }); }
    if (b === 'log') { const p = q.get('path'); return ok({ commits: c.log.filter(x => !p || x.path === p).slice(0, 30) }); }
    if (b === 'recent') return ok({ files: c.log.slice(0, 5).map(x => ({ path: x.path, sha: x.sha, author: x.author, at: x.at, subject: x.subject })) });
    if (b === 'docs') return ok({ files: paths.filter(p => /^[^/]+\.md$/i.test(p) || /^docs\/.*\.md$/i.test(p)).map(path => ({ path, title: path.split('/').pop().replace(/\.md$/i, '') })) });
    if (b === 'lock') return ok({ ok: true });
    return null;
  }

  function context(pid) {
    const p = project(pid), db = K().db(), tasks = (db.tasks || {})[pid] || [];
    const md = [`# ${p.name || 'Project'} · TRIBE_CONTEXT.md`, '', p.bio ? p.bio : '', '', '## Vision', (db.vision || {})[pid] || '_Not written yet._', '', '## Open tasks',
      ...(tasks.filter(t => t.status !== 'done').slice(0, 20).map(t => `- ${t.title}`)), tasks.some(t => t.status !== 'done') ? '' : '_None yet._', '',
      '## Where it lives', 'On this phone only. Move it to a host for friends and AI helpers.'].join('\n');
    return ok({ text: md, markdown: md, path: 'TRIBE_CONTEXT.md', bytes: md.length });
  }

  // ---------- the Secretary without AI (server/secretary.js summary + actions, app/ui/secsum.js), on this device ----------
  // Today's chat, voice notes and notes -> summary, action items (one tap to a task), decisions, questions. The overnight
  // journal, ideas and research requests still need a host (they read docs, files and code and run on a schedule).
  const dayOf = at => { const t = new Date(at); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  function secTalk(pid, day) {
    const db = K().db(), s = bag('secretary', pid), out = [];
    for (const m of db.chat[pid] || []) {
      if (!m.text || m.deleted || m.by === 'tribecode' || m.by === 'secretary' || dayOf(m.at) !== day || /^\/(task|decide|vote)\b|^@secretary\b/i.test(String(m.text).trim())) continue;
      out.push({ at: m.at, kind: m.media && m.media.kind === 'voice' ? 'voice' : 'chat', by: m.by, who: K().nameOf(m.by), text: m.text });
    }
    for (const n of s.notes || []) if (dayOf(n.at) === day) out.push(n);
    return out;
  }
  function secretary(method, b, c, d, B) {
    const pid = K().cur(), s = bag('secretary', pid), today = dayOf(Date.now()), SS = window.TribeSecSum;
    s.actions = s.actions || {};
    const acts = day => (s.actions[day] = s.actions[day] || []);
    const live = day => acts(day).filter(a => !a.dismissed);
    const digest = day => {
      const talk = secTalk(pid, day);
      const dg = SS ? SS.digest(talk, { members: (K().db().members || []).map(m => ({ id: m.id, name: m.name })), now: new Date(day + 'T12:00:00') }) : { summary: [], actions: [], decisions: [], questions: [], people: [], links: [] };
      const have = acts(day);
      for (const a of dg.actions || []) if (!have.some(h => h.key === a.key)) have.push({ id: 'a-' + rid(8), ...a, task: null, dismissed: false });
      if (have.length > 80) have.splice(0, have.length - 80);
      save();
      return { day, items: talk.length, ...dg, actions: live(day), local: true };
    };
    if (method === 'GET' && !b) return ok({ host: false, local: true, canAct: true, enabled: true, quiet: false, running: false, config: { enabled: true, model: '', quiet: { on: false } },
      brain: { online: false, model: '', models: [] }, lastTick: null, inShort: null, actions: live(today), digest: { items: [], updated: null },
      journal: { date: today, md: '' }, days: [], ideas: [], requests: [], repo: { path: '' } });
    if (method === 'GET' && b === 'summary') return ok(digest(isDay(c) ? c : today));
    if (method === 'GET' && b === 'actions') { const day = isDay(c) ? c : today; return ok({ day, actions: live(day) }); }
    if (method === 'GET' && b === 'journal') return [404, { error: 'no journal for that day' }];
    if (method === 'POST' && b === 'note') {
      const text = String(B.text || '').trim().slice(0, 2000); if (!text) return [400, { error: 'text needed' }];
      const it = { id: 'n-' + rid(), at: iso(), kind: B.kind === 'voice' ? 'voice' : 'note', by: 'me', who: meName(), text };
      (s.notes = s.notes || []).push(it); if (s.notes.length > 300) s.notes.splice(0, s.notes.length - 300); save();
      return ok({ item: it });
    }
    if (method === 'POST' && b === 'ask') {
      const dg = digest(today), q = String(B.question || '').toLowerCase();
      const txt = l => l.map(x => (typeof x === 'string' ? x : x.text || x.title || ''));
      const lines = /decid/.test(q) && dg.decisions.length ? txt(dg.decisions) : /action|todo|to do|task/.test(q) && dg.actions.length ? txt(dg.actions) : /question/.test(q) && dg.questions.length ? txt(dg.questions) : dg.summary;
      return ok({ answer: lines.length ? lines.map(x => '- ' + x).join('\n') : 'Nothing has been said today yet. Chat or record a voice note and ask again.', sources: [], local: true });
    }
    if (method === 'POST' && b === 'actions' && c && (d === 'task' || d === 'dismiss')) {
      for (const day of Object.keys(s.actions).sort().reverse()) {
        const a = s.actions[day].find(x => x.id === c); if (!a) continue;
        if (d === 'dismiss') { a.dismissed = true; save(); return ok({ action: a }); }
        if (a.task) return ok({ action: a, task: a.task });
        const t = K().addTask(pid, { title: a.title, by: 'me', assignee: a.owner || null, body: `From the Secretary's notes (${day})${a.from ? `, said by ${a.from}` : ''}.` });
        if (a.due) t.due = a.due;
        a.task = t.id; save(); try { K().push({ type: 'task', task: t }); } catch {}
        return ok({ action: a, task: t.id });
      }
      return [404, { error: 'action not found' }];
    }
    return needsHost('secretary');   // config, tick, research requests, ideas
  }

  // ---------- Flint writes a doc, sheet or slides with no brain (server/flint.js template(), basic mode) ----------
  const titleFrom = ask => { const t = String(ask || '').replace(/^(please\s+)?(make|write|create|draft|build|give me|start)\s+(me\s+)?(a|an|the|some)?\s*(new\s+)?(doc(ument)?|sheet|spreadsheet|table|slides?|deck|presentation|pitch deck)?\s*(about|for|on|of|with|called)?\s*/i, '').replace(/[.?!]+$/, '').trim(); return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) || 'Untitled'; };
  function makeTemplate(kind, ask) {
    const title = titleFrom(ask), t = String(ask || '').toLowerCase();
    if (kind === 'sheet') {
      if (/budget|cost|expense|spend|money|price/.test(t)) return `| Item | Category | Cost | Paid |\n| --- | --- | --- | --- |\n| Example item | General | 25 | yes |\n| Another item | General | 40 | no |\n| | | | |\n| Total | | =SUM(C2:C4) | |\n`;
      if (/rota|chore|schedule|shift|week/.test(t)) return `| Task | Mon | Tue | Wed | Thu | Fri |\n| --- | --- | --- | --- | --- | --- |\n| Example task | | | | | |\n| Another task | | | | | |\n`;
      if (/score|leader|game|points/.test(t)) return `| Player | Round 1 | Round 2 | Round 3 | Total |\n| --- | --- | --- | --- | --- |\n| Player 1 | 0 | 0 | 0 | =SUM(B2:D2) |\n| Player 2 | 0 | 0 | 0 | =SUM(B3:D3) |\n`;
      return `| Name | Owner | Status | Due |\n| --- | --- | --- | --- |\n| ${title} | | Not started | |\n| | | | |\n`;
    }
    if (kind === 'deck') return `<!-- theme: campfire -->\n\n# ${title}\n\nWhat we're making and why\n\n---\n\n## The idea\n\n- What it is, in one line\n- Who it's for\n\n---\n\n## How it works\n\n- Step one\n- Step two\n- Step three\n\n---\n\n## Who's doing what\n\n- Person: part\n- Agent: part\n\n---\n\n## Next steps\n\n- The first thing to ship\n- When we'll show it\n`;
    return `# ${title}\n\n## Goal\n\nWhat this is for, in a sentence or two.\n\n## Notes\n\n- \n\n## Next steps\n\n- [ ] \n`;
  }
  function flintMake(B) {
    const kind = B.kind, ask = String(B.ask || '').slice(0, 2000);
    if (!['doc', 'sheet', 'deck'].includes(kind)) return [400, { error: 'kind must be doc, sheet or deck' }];
    if (!ask) return [400, { error: 'tell Flint what to write' }];
    if (B.body) return [503, { error: 'Changing a whole file needs Flint\'s brain. Pick the built-in model in Settings › Flint\'s brain, or edit it directly.', basic: true }];
    return ok({ kind, title: titleFrom(ask), body: makeTemplate(kind, ask), basic: true, note: 'Flint started you from a template on this phone. Give him a brain (Settings › Flint\'s brain) and he writes the whole thing.' });
  }

  // Flint's launch doc / README / meeting notes / changelog drafts, from this phone's project (server/flintmem.js basic mode)
  function flintDraft(B) {
    const db = K().db(), pid = K().cur(), p = K().proj(pid) || { name: 'Our project' }, kind = ['launch', 'readme', 'notes', 'changelog'].includes(B.kind) ? B.kind : 'launch';
    const tasks = db.tasks[pid] || [], open = tasks.filter(t => t.status !== 'done'), done = tasks.filter(t => t.status === 'done');
    const vision = String((db.vision || {})[pid] || p.bio || '').replace(/^#.*\n/, '').trim() || 'What we are making and why, in a sentence or two.';
    const li = (l, f) => l.length ? l.slice(0, 12).map(f).join('\n') : '- ';
    const today = new Date().toISOString().slice(0, 10);
    const title = { launch: `${p.name} launch plan`, readme: `${p.name} README`, notes: `Meeting notes ${today}`, changelog: `${p.name} changelog` }[kind];
    const md = {
      launch: `# ${title}\n\n## What we're launching\n\n${vision}\n\n## Done\n\n${li(done, t => `- ${t.title}`)}\n\n## Before launch\n\n${li(open, t => `- [ ] ${t.title}`)}\n\n## Launch day\n\n- Where we share it\n- Who posts what\n`,
      readme: `# ${p.name}\n\n${vision}\n\n## How to run it\n\nOpen \`index.html\` in a browser.\n\n## What's next\n\n${li(open, t => `- ${t.title}`)}\n`,
      notes: `# ${title}\n\n## Who was there\n\n- \n\n## Decisions\n\n- \n\n## Action items\n\n${li(open.slice(0, 6), t => `- [ ] ${t.title}`)}\n`,
      changelog: `# ${title}\n\n## ${today}\n\n${li(done, t => `- ${t.title}`)}\n`,
    }[kind];
    const list = db.docs[pid] = db.docs[pid] || [], base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'draft';
    let slug = base, n = 2; while (list.some(d => d.slug === slug)) slug = `${base}-${n++}`;
    const now = iso(), d = { slug, title, by: 'me', created: now, updated: now, updatedBy: 'me', version: 1, project: pid, body: md, flintDraft: true };
    list.push(d); save(); try { K().push({ type: 'doc', doc: { slug, title, version: 1, updated: now, updatedBy: 'me' } }); } catch {}
    return ok({ title, slug, basic: true, local: true });
  }

  function route(method, parts, q, body) {
    if (!soloOnly()) return null;
    if (parts[0] === 'flint' && parts[1] === 'make' && method === 'POST') return flintMake(body || {});
    if (parts[0] === 'flint' && parts[1] === 'draft' && method === 'POST') return flintDraft(body || {});
    const [a, b, c, d, e, f] = parts, pid = K().cur(), B = body || {};
    switch (a) {
      case 'projects': {
        if (!K().proj(b)) return null;
        if (c === 'site-config' || c === 'site-autofill' || c === 'site-comments') return site(method, b, c, d, B, e);
        if (c === 'website' && d === 'versions') return versions(method, b, e, B);
        if (c === 'ledger') return ledger(method, b, d, q, B);
        if (c === 'ledger.csv') return ledgerCsv(b, q);
        return null;
      }
      case 'tasks': if (b === 'settings') { const s = bag('tasks'); s.settings = s.settings || { mode: 'lead', claimLimit: 0, agentAutoAccept: false }; if (method === 'PUT') { if (B.mode) s.settings.mode = B.mode === 'council' ? 'council' : 'lead'; save(); } return ok({ settings: s.settings, canEdit: true, lead: true }); } return null;
      case 'calendar': return calendar(method, b, q, B);
      case 'code': return code(method, b, q, B);
      case 'drift': return ok({ enabled: false, reason: 'The drift radar compares the branches of a code repository, which lives on a computer or host. On this phone, sync files with GitHub instead.' });
      case 'talent': return talent(method, b, c, B);
      case 'academy': return academy(method, b, B);
      case 'storage': return storage();
      case 'captures': return method === 'GET' ? ok(b === 'recipes' ? { recipes: [] } : { captures: [], items: [] }) : needsHost('captures');
      case 'packs': return ok({ packs: [] });
      case 'inspo': if (b === 'freesound') return ok({ on: false, key: false }); return null;
      case 'ask': if (b && /^po/.test(b)) return ok({ policy: 'ask', owners: [] }); return null;
      case 'context': return context(pid);
      case 'agents': if (['fleet', 'hub'].includes(b)) return needsHost('agents'); return null;
      case 'openspace': case 'connections': return needsHost(a === 'openspace' ? 'agents' : 'connectors');
      case 'secretary': return secretary(method, b, c, d, B);
      case 'repo': case 'changes': case 'integrations': return needsHost('repo');
      case 'ship': return method === 'GET' ? ok({ mode: 'host', modes: {}, turbo: { on: false }, current: null, commits: [], people: [], log: [], lastShip: null, canShip: false, local: true, reason: 'Shipping saves commits to a code repository on a host. On this phone, sync files with GitHub instead.' }) : needsHost('repo');
      case 'phoneapp': return method === 'GET' ? ok({ on: false, stack: null, available: false, reason: 'needs a computer' }) : needsHost('phoneapp');
      case 'tribe-link': case 'share': return needsHost('friends');
      case 'look': return method === 'GET' ? ok({ look: { tribe: {}, projects: {} }, canEdit: false, palette: [], patterns: [], tints: [], fontSizes: [] }) : null;
    }
    return null;
  }

  function install() {
    if (!K() || !K().hooks) return false;
    if (K().hooks.route.includes(route)) return true;
    K().hooks.route.push(route); return true;
  }
  if (!install()) { const t = setInterval(() => { if (install()) clearInterval(t); }, 200); setTimeout(() => clearInterval(t), 15000); }
  window.TribePhoneLocal = { route, needsHost, summary, code: pid => (K() && K().db() ? codeStore(pid || K().cur()) : null), save: () => K() && K().save() };
})();
