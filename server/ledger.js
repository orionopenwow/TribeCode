// Money (v0.27 company mode, phases 3): one plain ledger per company project. Every number carries where it came from
// (a person typing it, a connector, a CSV export, an agent reporting its own AI spend) and when, so nothing on the Money
// screen is ever invented. Stored in <tribe>/projects/<pid>/ledger.json; the Stripe key (optional, host only) in
// <tribe>/.tribe/secrets/connectors.json (0600, never sent to clients, never logged).
//   GET    /api/projects/:id/ledger[?month=&kind=&source=&q=]   entries (newest first) + settings + who may write + company seats
//   POST   /api/projects/:id/ledger            { kind, amount, currency?, label, category?, at? }   a manual entry
//   DELETE /api/projects/:id/ledger/:entry
//   GET    /api/projects/:id/ledger/summary?month=YYYY-MM    revenue, costs by category, net, runway, users, AI spend per seat
//   GET    /api/projects/:id/ledger.csv[?month=][&format=json] the accountant export
//   PUT    /api/projects/:id/ledger/settings   { cash: { amount, currency } | null, currency? }
//   POST   /api/projects/:id/ledger/import     { csv, kind?, source?, currency? }   Stripe balance/charges/payouts, Plausible,
//                                              PostHog (wide trends table) or a plain date,amount,label file
//   POST   /api/projects/:id/ledger/ai-spend   { seat, tokensIn, tokensOut, model, cost, currency? }
//   GET    /api/projects/:id/ledger/ai-spend   this week's spend per seat vs charter.budgetWeekly
//   GET    /api/projects/:id/ledger/connectors the picker: what each tool gives, how to connect it, status
//   PUT|DELETE /api/projects/:id/ledger/connectors/stripe/key   { key }   host only
//   POST   /api/projects/:id/ledger/connectors/stripe/sync      host or finance: balance transactions since the last sync
// Who: the host, admins and whoever holds the finance seat (person or agent) write; builders and up read; spectators and
// guests don't see money. MCP: ledger_summary, ledger_add (finance seat agents only, marked as from an agent), report_spend.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

const KINDS = ['revenue', 'cost', 'users', 'other'];
const SOURCE_TYPES = ['manual', 'connector', 'ai-spend', 'ai'];
const CATEGORIES = ['hosting', 'tools', 'ai', 'ads', 'fees', 'people', 'other'];
const MAX_ENTRIES = 20000;
const ZERO_DEC = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

// The connector picker. Real tools, real docs links. TribeCode never holds their data: each tribe connects its OWN
// account, through the tool's own MCP server in Claude Code (where one exists), an API key, or a CSV export.
const CONNECTORS = [
  { id: 'stripe', name: 'Stripe', gives: 'Revenue, refunds and fees', kind: 'revenue', color: '#6C7CFF',
    mcp: { url: 'https://mcp.stripe.com', docs: 'https://docs.stripe.com/mcp', add: 'claude mcp add --transport http stripe https://mcp.stripe.com' },
    api: { docs: 'https://docs.stripe.com/keys#create-restricted-api-secret-key', note: 'Make a restricted key with read access to Balance transactions only.' },
    csv: 'Dashboard › Balance › Export (balance changes), or Payments › Export (charges).', sync: true },
  { id: 'posthog', name: 'PostHog', gives: 'Sign-ups and active users', kind: 'users', color: '#FABD2F',
    mcp: { url: 'https://mcp.posthog.com/mcp', docs: 'https://posthog.com/docs/model-context-protocol', add: 'claude mcp add --transport http posthog https://mcp.posthog.com/mcp' },
    api: { docs: 'https://posthog.com/docs/api', note: 'A personal API key with read access to insights.' },
    csv: 'Open a Trends insight › ··· › Export › CSV.' },
  { id: 'plausible', name: 'Plausible', gives: 'Website visitors', kind: 'users', color: '#5850EC',
    api: { docs: 'https://plausible.io/docs/stats-api', note: 'A Stats API key from your account settings.' },
    csv: 'Your site dashboard › ··· › Export (visitors.csv inside the zip).' },
  { id: 'buttondown', name: 'Buttondown', gives: 'Newsletter subscribers', kind: 'users', color: '#3BD16F',
    api: { docs: 'https://docs.buttondown.com/api-introduction', note: 'An API key from Settings › API.' },
    csv: 'Subscribers › Export, then keep the date and count columns.' },
  { id: 'resend', name: 'Resend', gives: 'Emails sent (and their cost)', kind: 'cost', color: '#94A3B8',
    mcp: { url: 'https://github.com/resend/mcp-send-email', docs: 'https://resend.com/docs/api-reference/introduction', add: 'See the README: it runs on your computer with your own key.' },
    api: { docs: 'https://resend.com/docs/api-reference/api-keys/create-api-key', note: 'A key with sending access only.' },
    csv: 'Use a plain date, amount, label file from your invoices.' },
  { id: 'helpscout', name: 'Help Scout', gives: 'Support conversations', kind: 'other', color: '#2DD4BF',
    api: { docs: 'https://developer.helpscout.com/mailbox-api/', note: 'An OAuth app in Your Profile › My Apps.' },
    csv: 'Reports › Export, then keep the date and count columns.' },
  { id: 'crisp', name: 'Crisp', gives: 'Chat conversations', kind: 'other', color: '#E86A92',
    api: { docs: 'https://docs.crisp.chat/references/rest-api/v1/', note: 'A plugin token from the Crisp Marketplace.' },
    csv: 'Analytics › Export, then keep the date and count columns.' },
  { id: 'cloudflare', name: 'Cloudflare', gives: 'Hosting and domain costs', kind: 'cost', color: '#F26B1D',
    mcp: { url: 'https://github.com/cloudflare/mcp-server-cloudflare', docs: 'https://developers.cloudflare.com/agents/model-context-protocol/', add: 'See the README for the remote server you need.' },
    api: { docs: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/', note: 'A token with Billing: Read.' },
    csv: 'Manage account › Billing › download invoices, then a date, amount, label file.' },
];

// ---------- CSV ----------
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') && !first.includes(',') ? '\t' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
    if (rows.length > 50000) break;
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows.map(r => r.map(c => c.trim()));
}
// "$1,234.50", "1.234,50 €", "(12.00)", "-3" -> number (NaN when it isn't one)
function money(v) {
  let s = String(v == null ? '' : v).trim(); if (!s) return NaN;
  let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^\d.,\-]/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s); return neg ? -n : n;
}
function isoDate(v) {
  const s = String(v || '').trim(); if (!s) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0))); return isNaN(d) ? null : d.toISOString(); }
  if (/^\d{9,11}$/.test(s)) { const d = new Date(+s * 1000); return isNaN(d) ? null : d.toISOString(); }   // a unix timestamp
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString();
}
const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && isNaN(Number(s)))) s = "'" + s; return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };   // no spreadsheet formulas
const round = (n, cur) => { const k = ZERO_DEC.has(cur) ? 1 : 100; return Math.round(n * k) / k; };
const monthOf = iso => String(iso || '').slice(0, 7);
function weekStart(d = new Date()) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; }

// Reads the company file the Company view (server/company.js, Agent A) writes. A tiny local reader so Money works on its
// own; the contract is shared: <tribe>/projects/<pid>/company.json.
function companyReader(base) {
  return pid => {
    if (!/^[a-z0-9-]{1,64}$/i.test(String(pid || ''))) return null;
    try { const c = JSON.parse(fs.readFileSync(base.p('projects', pid, 'company.json'), 'utf8')); return c && typeof c === 'object' && c.on !== false && Array.isArray(c.seats) ? c : null; } catch { return null; }
  };
}

module.exports = function ledger({ P, base, broadcast, postChat, nameOf, perms, getMembers, isLocal }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => (typeof v === 'string' ? v.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : '');
  const okPid = pid => /^[a-z0-9-]{1,64}$/i.test(String(pid || ''));
  const company = companyReader(base);
  const file = pid => base.p('projects', pid, 'ledger.json');
  const load = pid => { let d; try { d = JSON.parse(fs.readFileSync(file(pid), 'utf8')); } catch { d = null; } d = d && typeof d === 'object' ? d : {}; d.entries = Array.isArray(d.entries) ? d.entries : []; d.settings = d.settings || {}; d.imports = Array.isArray(d.imports) ? d.imports : []; d.connectors = d.connectors || {}; return d; };
  const save = (pid, d) => { fs.mkdirSync(path.dirname(file(pid)), { recursive: true }); d.entries = d.entries.slice(-MAX_ENTRIES); d.imports = d.imports.slice(-100); const tmp = file(pid) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, file(pid)); broadcast && broadcast({ type: 'ledger', project: pid }); };
  const rid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const member = mid => (getMembers ? getMembers() : []).find(m => m.id === mid) || null;
  const seats = pid => (company(pid) || {}).seats || [];
  const financeSeats = pid => seats(pid).filter(s => s && s.kind === 'finance');
  const holds = (s, me) => !!s && !!s.holder && !!me && ((s.holder.person && s.holder.person === me.id) || (s.holder.agent && s.holder.agent === me.id));
  const isBoss = (me, pid) => !!me && (me.role === 'host' || (perms && perms.atLeast ? perms.atLeast(me, 'admin', pid) : me.role === 'admin'));
  const ownerOf = me => (me && me.role === 'agent' && me.owner ? member(me.owner) : null);

  function canRead(me, pid) {
    if (!me || !okPid(pid) || !P.get(pid)) return false;
    const who = ownerOf(me) || me;
    if (!P.canSee(who, pid)) return false;
    if (isBoss(who, pid)) return true;
    if (['spectator', 'guest'].includes(who.role) || who.guestUntil) return false;
    return true;
  }
  function canWrite(me, pid) {
    if (!canRead(me, pid)) return false;
    if (me.role === 'agent') return financeSeats(pid).some(s => s.holder && s.holder.agent === me.id);   // agents: only the finance seat's own agent
    return isBoss(me, pid) || financeSeats(pid).some(s => holds(s, me));
  }
  const need = (ok, msg) => { if (!ok) throw err(403, msg); };
  const see = (me, pid) => { if (!okPid(pid) || !P.get(pid) || !(P.canSee(ownerOf(me) || me, pid))) throw err(404, 'project not found'); need(canRead(me, pid), 'money is visible to builders, admins and the host'); };

  // ---------- entries ----------
  function clean(raw, me, srcDefault, d) {
    const kind = KINDS.includes(raw.kind) ? raw.kind : null; if (!kind) throw err(400, 'kind is revenue, cost, users or other');
    const amount = typeof raw.amount === 'number' ? raw.amount : money(raw.amount);
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e12) throw err(400, 'amount must be a number');
    if (kind === 'users' && (amount < 0 || !Number.isInteger(amount))) throw err(400, 'users is a whole number (people counted)');
    const currency = kind === 'users' ? null : (/^[A-Za-z]{3}$/.test(raw.currency || '') ? raw.currency.toUpperCase() : (d.settings.currency || 'USD'));
    const label = str(raw.label, 160); if (!label) throw err(400, 'say what it is (a label)');
    const at = raw.at ? isoDate(raw.at) : new Date().toISOString(); if (!at) throw err(400, 'that date doesn\'t look right');
    const src = raw.source && typeof raw.source === 'object' ? raw.source : srcDefault;
    const source = { type: SOURCE_TYPES.includes(src.type) ? src.type : 'manual', name: str(src.name, 60) || 'manual', ref: str(src.ref, 120) || null };
    const e = { id: rid(), kind, amount: kind === 'users' ? amount : round(amount, currency), currency, label, source, at, by: me.id, added: new Date().toISOString() };
    if (kind === 'cost') e.category = CATEGORIES.includes(raw.category) ? raw.category : (source.type === 'ai-spend' ? 'ai' : 'other');
    if (raw.ai && typeof raw.ai === 'object') e.ai = raw.ai;
    return e;
  }
  function add(pid, me, raw, srcDefault = { type: 'manual', name: 'manual' }) {
    const d = load(pid); const e = clean(raw, me, srcDefault, d);
    d.entries.push(e); save(pid, d); return view(e);
  }
  const view = e => ({ ...e, byName: e.by === 'tribecode' ? 'TribeCode' : nameOf(e.by) });
  function list(pid, q = {}) {
    let es = load(pid).entries.slice();
    if (/^\d{4}-\d{2}$/.test(q.month || '')) es = es.filter(e => monthOf(e.at) === q.month);
    if (KINDS.includes(q.kind)) es = es.filter(e => e.kind === q.kind);
    if (q.source) es = es.filter(e => e.source.type === q.source || e.source.name === q.source);
    if (q.q) { const t = String(q.q).toLowerCase().slice(0, 80); es = es.filter(e => (e.label + ' ' + e.source.name + ' ' + (e.category || '')).toLowerCase().includes(t)); }
    es.sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
    return es;
  }

  // ---------- summary ----------
  const srcList = es => { const m = new Map(); for (const e of es) { const k = e.source.type + '|' + e.source.name; const x = m.get(k) || { type: e.source.type, name: e.source.name, count: 0, last: null }; x.count++; if (!x.last || e.added > x.last) x.last = e.added || e.at; m.set(k, x); } return [...m.values()].sort((a, b) => b.count - a.count); };
  function totals(es, cur) {
    const mine = es.filter(e => e.kind === 'users' || e.currency === cur);
    const rev = mine.filter(e => e.kind === 'revenue'), cost = mine.filter(e => e.kind === 'cost'), users = mine.filter(e => e.kind === 'users');
    const sum = a => round(a.reduce((s, e) => s + e.amount, 0), cur);
    const cats = new Map(); for (const e of cost) { const c = cats.get(e.category || 'other') || { category: e.category || 'other', total: 0, count: 0 }; c.total = round(c.total + e.amount, cur); c.count++; cats.set(c.category, c); }
    const labels = new Map(); for (const e of users) labels.set(e.label, (labels.get(e.label) || 0) + e.amount);
    return { rev, cost, users, revenue: sum(rev), costs: sum(cost), net: round(sum(rev) - sum(cost), cur), byCategory: [...cats.values()].sort((a, b) => b.total - a.total), usersTotal: users.reduce((s, e) => s + e.amount, 0), byLabel: [...labels.entries()].map(([label, n]) => ({ label, total: n })).sort((a, b) => b.total - a.total) };
  }
  function summary(pid, month) {
    const d = load(pid), cur = d.settings.currency || 'USD';
    month = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
    const inMonth = d.entries.filter(e => monthOf(e.at) === month);
    const t = totals(inMonth, cur);
    const other = inMonth.filter(e => e.kind !== 'users' && e.currency !== cur);
    const oc = new Map(); for (const e of other) oc.set(e.currency, (oc.get(e.currency) || 0) + 1);
    // Runway = cash on hand / average monthly burn (costs minus revenue) over up to 3 months ending this one that have entries.
    const cash = d.settings.cash && Number.isFinite(d.settings.cash.amount) ? d.settings.cash : null;
    let runway = { months: null, cash, burn: null, basis: [], reason: '' };
    const months = []; { const [y, mo] = month.split('-').map(Number); for (let i = 0; i < 3; i++) { const dt = new Date(Date.UTC(y, mo - 1 - i, 1)); months.push(dt.toISOString().slice(0, 7)); } }
    const per = months.map(m => ({ month: m, ...totals(d.entries.filter(e => monthOf(e.at) === m), cur) })).filter(x => x.rev.length || x.cost.length);
    if (per.length) { const burn = round(per.reduce((s, x) => s + (x.costs - x.revenue), 0) / per.length, cur); runway.burn = burn; runway.basis = per.map(x => x.month); }
    if (!cash) runway.reason = 'Add your cash on hand to see runway.';
    else if (cash.currency && cash.currency !== cur) runway.reason = `Cash is in ${cash.currency} but the books are in ${cur}.`;
    else if (runway.burn == null) runway.reason = 'No revenue or costs yet to measure a burn rate.';
    else if (runway.burn <= 0) runway.reason = 'Not burning cash: revenue covers costs.';
    else runway.months = Math.round(cash.amount / runway.burn * 10) / 10;
    const lastOf = a => a.reduce((m, e) => (!m || (e.added || e.at) > m ? (e.added || e.at) : m), null);
    return { month, currency: cur,
      revenue: { total: t.revenue, count: t.rev.length, sources: srcList(t.rev), last: lastOf(t.rev) },
      costs: { total: t.costs, count: t.cost.length, byCategory: t.byCategory, sources: srcList(t.cost), last: lastOf(t.cost) },
      net: t.net,
      users: { total: t.usersTotal, count: t.users.length, byLabel: t.byLabel, sources: srcList(t.users), last: lastOf(t.users) },
      other: { count: inMonth.filter(e => e.kind === 'other').length },
      otherCurrencies: [...oc.entries()].map(([currency, count]) => ({ currency, count })),
      runway, asOf: lastOf(inMonth), entries: inMonth.length, aiSpend: aiWeek(pid) };
  }

  // ---------- AI spend per seat ----------
  function aiWeek(pid, from) {
    const start = from || weekStart(), end = new Date(start.getTime() + 7 * 864e5);
    const d = load(pid), cur = d.settings.currency || 'USD';
    const es = d.entries.filter(e => e.source.type === 'ai-spend' && e.at >= start.toISOString() && e.at < end.toISOString());
    const out = seats(pid).map(s => ({ seat: s.id, title: s.title || s.id, kind: s.kind, color: s.color || null, budget: Number((s.charter || {}).budgetWeekly) || 0, spent: 0, tokensIn: 0, tokensOut: 0, events: 0, models: [] }));
    for (const e of es) {
      const sid = (e.ai && e.ai.seat) || e.source.ref; let row = out.find(x => x.seat === sid);
      if (!row) { row = { seat: sid, title: sid, kind: 'custom', color: null, budget: 0, spent: 0, tokensIn: 0, tokensOut: 0, events: 0, models: [], gone: true }; out.push(row); }
      if (e.currency === cur) row.spent = round(row.spent + e.amount, cur);
      row.tokensIn += (e.ai && e.ai.tokensIn) || 0; row.tokensOut += (e.ai && e.ai.tokensOut) || 0; row.events++;
      const mdl = (e.ai && e.ai.model) || e.source.name; if (mdl && !row.models.includes(mdl)) row.models.push(mdl);
    }
    for (const r of out) { r.over = r.budget > 0 && r.spent >= r.budget; r.pct = r.budget > 0 ? Math.min(999, Math.round(r.spent / r.budget * 100)) : null; }
    return { week: start.toISOString().slice(0, 10), currency: cur, seats: out, total: round(out.reduce((s, r) => s + r.spent, 0), cur) };
  }
  const spentThisWeek = (pid, seatId) => (aiWeek(pid).seats.find(r => r.seat === seatId) || { spent: 0 }).spent;
  function reportSpend(pid, me, body) {
    const sid = str(body.seat, 40); const seat = seats(pid).find(s => s.id === sid);
    if (!seat) throw err(404, `no seat "${sid}" in this company`);
    const ok = isBoss(me, pid) || holds(seat, me) || canWrite(me, pid) || (me.role === 'agent' && ownerOf(me) && seat.holder && seat.holder.person === me.owner);
    need(ok, 'only the seat\'s holder (or its agent), finance, an admin or the host can report spend for this seat');
    const n = v => { const x = Number(v); return Number.isFinite(x) && x >= 0 && x < 1e12 ? Math.round(x) : 0; };
    const cost = Number(body.cost); if (!Number.isFinite(cost) || cost < 0 || cost > 1e7) throw err(400, 'cost is the amount spent (0 or more), as reported by the tool');
    const model = str(body.model, 60) || 'unknown model';
    return add(pid, me, { kind: 'cost', category: 'ai', amount: cost, currency: body.currency, label: `AI · ${seat.title || seat.id} · ${model}`, at: body.at,
      ai: { seat: seat.id, tokensIn: n(body.tokensIn), tokensOut: n(body.tokensOut), model } }, { type: 'ai-spend', name: model, ref: seat.id });
  }

  // ---------- import ----------
  function importCsv(pid, me, body) {
    const text = String(body.csv || ''); if (!text.trim()) throw err(400, 'paste or drop a CSV file');
    if (text.length > 4 * 1024 * 1024) throw err(413, 'that file is too big (4 MB at most)');
    const rows = parseCsv(text); if (rows.length < 1) throw err(400, 'no rows in that file');
    const d = load(pid), cur = (/^[A-Za-z]{3}$/.test(body.currency || '') ? body.currency.toUpperCase() : (d.settings.currency || 'USD'));
    const H = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ' ').trim());
    const col = (...names) => { for (const n of names) { const i = H.findIndex(h => h === n || h.startsWith(n + ' (')); if (i >= 0) return i; } return -1; };
    const have = new Set(d.entries.map(e => e.source.ref && e.source.name + '|' + e.source.ref + '|' + e.kind).filter(Boolean));
    const out = [], warnings = []; let skipped = 0, bad = 0, format = 'generic';
    const push = (raw, srcName, ref) => {
      const key = ref && srcName + '|' + ref + '|' + raw.kind; if (key && have.has(key)) { skipped++; return; }
      try { const e = clean({ ...raw }, me, { type: 'connector', name: srcName, ref: ref || null }, d); out.push(e); if (key) have.add(key); } catch { bad++; }
    };
    const iId = col('id'), iType = col('type', 'reporting category'), iAmt = col('amount', 'gross'), iFee = col('fee'), iCur = col('currency'), iCreated = col('created', 'created date', 'available on');
    const iDesc = col('description'), iStatus = col('status'), iRefunded = col('amount refunded'), iArrival = col('arrival date');
    const curOf = r => (iCur >= 0 && /^[a-z]{3}$/i.test(r[iCur] || '') ? r[iCur].toUpperCase() : cur);
    if (iId >= 0 && iType >= 0 && iAmt >= 0 && (iCreated >= 0)) {
      // Stripe balance transactions ("Balance change from activity" / balance history export)
      format = 'stripe-balance';
      for (const r of rows.slice(1)) {
        const type = String(r[iType] || '').toLowerCase(), amt = money(r[iAmt]), fee = iFee >= 0 ? money(r[iFee]) : 0, at = r[iCreated], c = curOf(r), id = r[iId];
        if (!Number.isFinite(amt)) { bad++; continue; }
        const desc = (iDesc >= 0 && r[iDesc]) || type;
        if (/^(payout|transfer|payout_cancel|payout_failure)/.test(type)) { push({ kind: 'other', amount: amt, currency: c, label: `Stripe payout · ${desc}`, at }, 'Stripe CSV', id); continue; }
        if (/fee/.test(type) && !/refund/.test(type)) { push({ kind: 'cost', category: 'fees', amount: Math.abs(amt), currency: c, label: `Stripe fee · ${desc}`, at }, 'Stripe CSV', id); continue; }
        if (/charge|payment|refund|dispute|adjustment/.test(type)) {
          push({ kind: 'revenue', amount: amt, currency: c, label: `${/refund/.test(type) ? 'Refund' : /dispute/.test(type) ? 'Dispute' : 'Stripe'} · ${desc}`, at }, 'Stripe CSV', id);
          if (Number.isFinite(fee) && fee !== 0) push({ kind: 'cost', category: 'fees', amount: fee, currency: c, label: `Stripe fee · ${desc}`, at }, 'Stripe CSV', id + ':fee');
          continue;
        }
        push({ kind: 'other', amount: amt, currency: c, label: `Stripe ${type || 'item'} · ${desc}`, at }, 'Stripe CSV', id);
      }
    } else if (iId >= 0 && iAmt >= 0 && iCreated >= 0 && (iStatus >= 0 || iRefunded >= 0)) {
      // Stripe charges / unified payments export
      format = 'stripe-charges';
      for (const r of rows.slice(1)) {
        const st = String(iStatus >= 0 ? r[iStatus] : 'paid').toLowerCase();
        if (st && !/paid|succeeded|captured|refunded/.test(st)) { skipped++; continue; }
        const amt = money(r[iAmt]), ref = iRefunded >= 0 ? money(r[iRefunded]) || 0 : 0, fee = iFee >= 0 ? money(r[iFee]) : 0, c = curOf(r), id = r[iId], desc = (iDesc >= 0 && r[iDesc]) || 'charge';
        if (!Number.isFinite(amt)) { bad++; continue; }
        push({ kind: 'revenue', amount: amt - ref, currency: c, label: `Stripe · ${desc}`, at: r[iCreated] }, 'Stripe CSV', id);
        if (Number.isFinite(fee) && fee > 0) push({ kind: 'cost', category: 'fees', amount: fee, currency: c, label: `Stripe fee · ${desc}`, at: r[iCreated] }, 'Stripe CSV', id + ':fee');
      }
    } else if (iId >= 0 && iAmt >= 0 && iArrival >= 0) {
      format = 'stripe-payouts';
      warnings.push('Payouts move money to your bank, so they were added as "other" and not counted as revenue. For revenue, export balance changes or payments.');
      for (const r of rows.slice(1)) { const amt = money(r[iAmt]); if (!Number.isFinite(amt)) { bad++; continue; } push({ kind: 'other', amount: amt, currency: curOf(r), label: `Stripe payout${iStatus >= 0 ? ' · ' + r[iStatus] : ''}`, at: r[iArrival] }, 'Stripe CSV', r[iId]); }
    } else if (col('date') >= 0 && col('visitors') >= 0) {
      format = 'plausible';
      const iD = col('date'), iV = col('visitors');
      for (const r of rows.slice(1)) { const v = money(r[iV]); if (!Number.isFinite(v)) { bad++; continue; } const at = isoDate(r[iD]); push({ kind: 'users', amount: Math.round(v), label: 'Website visitors', at: r[iD] }, 'Plausible CSV', at ? 'visitors:' + at.slice(0, 10) : null); }
    } else if (H.length >= 2 && H.slice(1).filter(h => isoDate(h)).length >= Math.max(1, (H.length - 1) * 0.6)) {
      // PostHog trends table: series, <date>, <date>, ...
      format = 'posthog';
      const dates = rows[0].slice(1).map(isoDate);
      for (const r of rows.slice(1)) {
        const series = str(r[0], 80) || 'Users';
        r.slice(1).forEach((v, i) => { const n = money(v); if (!dates[i] || !Number.isFinite(n) || n === 0) return; push({ kind: 'users', amount: Math.round(Math.abs(n)), label: series, at: dates[i] }, 'PostHog CSV', series.toLowerCase() + ':' + dates[i].slice(0, 10)); });
      }
    } else {
      // date, amount, label [, kind, category, currency] with or without a header row
      const hasHeader = !isoDate(rows[0][0]) || !Number.isFinite(money(rows[0][1]));
      const iD = hasHeader ? Math.max(0, col('date', 'day', 'created')) : 0;
      const iA = hasHeader ? (col('amount', 'value', 'count', 'total') >= 0 ? col('amount', 'value', 'count', 'total') : 1) : 1;
      const iL = hasHeader ? (col('label', 'description', 'name', 'memo') >= 0 ? col('label', 'description', 'name', 'memo') : 2) : 2;
      const iK = hasHeader ? col('kind') : -1, iCat = hasHeader ? col('category') : -1, iC = hasHeader ? col('currency') : -1;
      const fallbackKind = KINDS.includes(body.kind) ? body.kind : 'revenue';
      const srcName = str(body.source, 40) || 'CSV import';
      for (const r of (hasHeader ? rows.slice(1) : rows)) {
        const kind = iK >= 0 && KINDS.includes(String(r[iK]).toLowerCase()) ? String(r[iK]).toLowerCase() : fallbackKind;
        let amt = money(r[iA]); if (!Number.isFinite(amt)) { bad++; continue; }
        if (kind === 'users') amt = Math.round(Math.abs(amt));
        push({ kind, amount: kind === 'cost' ? Math.abs(amt) : amt, label: str(r[iL], 160) || (kind === 'users' ? 'Users' : 'Imported'), at: r[iD], category: iCat >= 0 ? String(r[iCat]).toLowerCase() : undefined, currency: iC >= 0 ? r[iC] : cur }, srcName, null);
      }
    }
    if (!out.length && !skipped) throw err(400, bad ? `none of the ${bad} rows could be read: check the dates and amounts` : 'nothing to import in that file');
    const imp = { id: 'i' + Date.now().toString(36), at: new Date().toISOString(), by: me.id, format, added: out.length, skipped, bad, name: str(body.name, 80) || null };
    const d2 = load(pid); d2.entries.push(...out); d2.imports.push(imp); save(pid, d2);
    if (bad) warnings.push(`${bad} row${bad === 1 ? '' : 's'} couldn't be read and ${bad === 1 ? 'was' : 'were'} left out.`);
    return { ...imp, warnings };
  }

  // ---------- Stripe sync (the tribe's own restricted key) ----------
  const SECRET = '.tribe/secrets/connectors.json';
  const readKeys = () => { try { return JSON.parse(fs.readFileSync(base.p(SECRET), 'utf8')) || {}; } catch { return {}; } };
  function writeKeys(all) {
    const dir = base.p('.tribe/secrets'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {}
    fs.writeFileSync(base.p(SECRET), JSON.stringify(all), { mode: 0o600 }); try { fs.chmodSync(base.p(SECRET), 0o600); } catch {}
  }
  const keyOf = pid => (readKeys()[pid] || {}).stripe || null;
  // Allowlist: only api.stripe.com (tests may point at a local mock with TRIBE_TEST=1 + TRIBE_TEST_STRIPE_BASE).
  const STRIPE = (process.env.TRIBE_TEST === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.TRIBE_TEST_STRIPE_BASE || '')) ? process.env.TRIBE_TEST_STRIPE_BASE : 'https://api.stripe.com';
  function stripeGet(key, qs) {
    return new Promise((resolve, reject) => {
      const u = new URL('/v1/balance_transactions?' + qs, STRIPE);
      if (!(u.hostname === 'api.stripe.com' || STRIPE !== 'https://api.stripe.com')) return reject(err(400, 'blocked'));
      const lib = u.protocol === 'https:' ? https : http;
      const rq = lib.request(u, { method: 'GET', headers: { Authorization: 'Bearer ' + key, 'Stripe-Version': '2024-06-20', 'User-Agent': 'TribeCode-ledger' }, timeout: 15000 }, r => {
        let b = ''; r.setEncoding('utf8'); r.on('data', c => { b += c; if (b.length > 5e6) rq.destroy(); });
        r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} if (r.statusCode !== 200) return reject(err(502, `Stripe said no (${r.statusCode})${j && j.error && j.error.type ? ': ' + j.error.type : ''}`)); resolve(j || {}); });
      });
      rq.on('timeout', () => rq.destroy(err(504, 'Stripe took too long')));
      rq.on('error', e => reject(e.status ? e : err(502, 'couldn\'t reach Stripe')));
      rq.end();
    });
  }
  async function stripeSync(pid, me) {
    const key = keyOf(pid); if (!key) throw err(400, 'no Stripe key yet: the host adds a restricted key (read-only Balance transactions) under Connect › Stripe, or import a CSV export instead');
    const d = load(pid), since = (d.connectors.stripe && d.connectors.stripe.cursor) || Math.floor((Date.now() - 90 * 864e5) / 1000);
    let after = null, pages = 0, added = 0, skipped = 0, newest = since; const rowsOut = [];
    const have = new Set(d.entries.map(e => e.source.ref && e.source.name + '|' + e.source.ref + '|' + e.kind).filter(Boolean));
    do {
      const j = await stripeGet(key, `limit=100&created[gt]=${since}${after ? '&starting_after=' + encodeURIComponent(after) : ''}`);
      const data = Array.isArray(j.data) ? j.data : [];
      for (const t of data) {
        if (!t || typeof t.id !== 'string') continue;
        const c = String(t.currency || 'usd').toUpperCase(), k = ZERO_DEC.has(c) ? 1 : 100, at = new Date((t.created || 0) * 1000).toISOString(), type = String(t.type || '');
        newest = Math.max(newest, t.created || 0);
        const desc = str(t.description || type, 100);
        const mk = (kind, amount, label, ref, category) => { const kk = 'Stripe|' + ref + '|' + kind; if (have.has(kk)) { skipped++; return; } have.add(kk); rowsOut.push(clean({ kind, amount, currency: c, label, at, category }, me, { type: 'connector', name: 'Stripe', ref }, d)); added++; };
        if (/^payout|^transfer/.test(type)) mk('other', t.amount / k, `Stripe payout · ${desc}`, t.id);
        else if (/fee/.test(type)) mk('cost', Math.abs(t.amount) / k, `Stripe fee · ${desc}`, t.id, 'fees');
        else if (/charge|payment|refund|dispute|adjustment/.test(type)) { mk('revenue', t.amount / k, `${/refund/.test(type) ? 'Refund' : 'Stripe'} · ${desc}`, t.id); if (t.fee) mk('cost', t.fee / k, `Stripe fee · ${desc}`, t.id + ':fee', 'fees'); }
        else mk('other', t.amount / k, `Stripe ${type} · ${desc}`, t.id);
      }
      after = j.has_more && data.length ? data[data.length - 1].id : null; pages++;
    } while (after && pages < 20);
    const d2 = load(pid); d2.entries.push(...rowsOut); d2.connectors.stripe = { cursor: newest, last: new Date().toISOString(), by: me.id, added }; save(pid, d2);
    return { added, skipped, last: d2.connectors.stripe.last };
  }
  function connectorsView(pid, me) {
    const d = load(pid), host = !!me && me.role === 'host', key = keyOf(pid);
    return CONNECTORS.map(c => ({ ...c, status: c.id === 'stripe' ? { key: !!key, hint: host && key ? '…' + key.slice(-4) : null, last: (d.connectors.stripe || {}).last || null, added: (d.connectors.stripe || {}).added || 0 } : { imports: d.imports.filter(i => i.format === c.id).length } }));
  }

  // ---------- CSV export ----------
  function exportCsv(pid, month) {
    const d = load(pid);
    const es = list(pid, { month }).slice().reverse();
    const head = ['date', 'kind', 'category', 'label', 'amount', 'currency', 'source_type', 'source_name', 'source_ref', 'added_by', 'added_at', 'id'];
    const lines = [head.join(',')].concat(es.map(e => [e.at.slice(0, 10), e.kind, e.category || '', e.label, e.kind === 'users' ? e.amount : e.amount.toFixed(ZERO_DEC.has(e.currency) ? 0 : 2), e.currency || '', e.source.type, e.source.name, e.source.ref || '', e.by === 'tribecode' ? 'TribeCode' : nameOf(e.by), e.added || '', e.id].map(csvCell).join(',')));
    const p = P.get(pid) || {}; const slug = String(p.name || pid).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ledger';
    return { csv: lines.join('\r\n') + '\r\n', filename: `${slug}-ledger${/^\d{4}-\d{2}$/.test(month || '') ? '-' + month : ''}.csv`, rows: es.length, currency: d.settings.currency || 'USD' };
  }

  // ---------- routes ----------
  async function route(req, res, { m, b: pid, c, parts, me, url, readBody, send, fail }) {
    const sub = parts[3] || '', sub2 = parts[4] || '', sub3 = parts[5] || '';
    if (!me) return fail(res, 401, 'sign in first');
    see(me, pid);
    const q = Object.fromEntries(url.searchParams);
    if (c === 'ledger.csv' && m === 'GET') {
      const x = exportCsv(pid, q.month);
      if (q.format === 'json') return send(res, 200, x);
      return send(res, 200, x.csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${x.filename}"`, 'Cache-Control': 'no-store' });
    }
    if (!sub && m === 'GET') {
      const d = load(pid), all = list(pid, q), co = company(pid);
      return send(res, 200, { entries: all.slice(0, Math.min(Number(q.limit) || 300, 1000)).map(view), total: all.length, settings: d.settings, canWrite: canWrite(me, pid), isHost: me.role === 'host',
        company: co ? { name: co.name || '', seats: co.seats.map(s => ({ id: s.id, kind: s.kind, title: s.title || s.id, color: s.color || null, holder: s.holder || {}, budgetWeekly: Number((s.charter || {}).budgetWeekly) || 0 })) } : null,
        sources: srcList(d.entries), imports: d.imports.slice(-5).reverse(), kinds: KINDS, categories: CATEGORIES });
    }
    if (!sub && m === 'POST') { need(canWrite(me, pid), 'only the host, an admin or whoever holds the finance seat can add money entries'); const body = await readBody(req, 16 * 1024); return send(res, 200, { entry: add(pid, me, { ...body, source: undefined }) }); }
    if (sub === 'summary' && m === 'GET') return send(res, 200, summary(pid, q.month));
    if (sub === 'settings' && m === 'PUT') {
      need(canWrite(me, pid), 'only the host, an admin or whoever holds the finance seat changes money settings');
      const body = await readBody(req, 8 * 1024), d = load(pid);
      if (body.currency !== undefined) { if (!/^[A-Za-z]{3}$/.test(body.currency || '')) throw err(400, 'currency is a 3-letter code like USD or EUR'); d.settings.currency = body.currency.toUpperCase(); }
      if (body.cash === null) delete d.settings.cash;
      else if (body.cash !== undefined) {
        const amt = typeof body.cash.amount === 'number' ? body.cash.amount : money(body.cash.amount);
        if (!Number.isFinite(amt) || amt < 0 || amt > 1e12) throw err(400, 'cash on hand is a number (0 or more)');
        const cc = /^[A-Za-z]{3}$/.test(body.cash.currency || '') ? body.cash.currency.toUpperCase() : (d.settings.currency || 'USD');
        d.settings.cash = { amount: round(amt, cc), currency: cc, at: new Date().toISOString(), by: me.id, byName: nameOf(me.id), source: { type: 'manual', name: str(body.cash.source, 60) || 'typed in' } };
      }
      save(pid, d); return send(res, 200, { settings: d.settings });
    }
    if (sub === 'import' && m === 'POST') { need(canWrite(me, pid), 'only the host, an admin or whoever holds the finance seat can import'); const body = await readBody(req, 5 * 1024 * 1024); return send(res, 200, importCsv(pid, me, body)); }
    if (sub === 'ai-spend' && m === 'POST') { const body = await readBody(req, 8 * 1024); return send(res, 200, { entry: reportSpend(pid, me, body) }); }
    if (sub === 'ai-spend' && m === 'GET') return send(res, 200, aiWeek(pid));
    if (sub === 'connectors' && !sub2 && m === 'GET') return send(res, 200, { connectors: connectorsView(pid, me) });
    if (sub === 'connectors' && sub2 === 'stripe' && sub3 === 'key') {
      if (me.role !== 'host') throw err(403, 'only the host can add or remove a key (it stays on the host computer)');
      const all = readKeys();
      if (m === 'DELETE') { if (all[pid]) delete all[pid].stripe; writeKeys(all); return send(res, 200, { ok: true }); }
      if (m === 'PUT') {
        const body = await readBody(req, 4 * 1024), key = String(body.key || '').trim();
        if (!/^(rk|sk)_(live|test)_[A-Za-z0-9]{10,240}$/.test(key)) throw err(400, 'that doesn\'t look like a Stripe secret or restricted key (rk_live_… is best)');
        all[pid] = { ...(all[pid] || {}), stripe: key }; writeKeys(all);
        return send(res, 200, { ok: true, hint: '…' + key.slice(-4), restricted: key.startsWith('rk_') });
      }
    }
    if (sub === 'connectors' && sub2 === 'stripe' && sub3 === 'sync' && m === 'POST') { need(canWrite(me, pid), 'only the host, an admin or the finance seat can sync'); return send(res, 200, await stripeSync(pid, me)); }
    if (sub && m === 'DELETE' && !sub2) {
      need(canWrite(me, pid), 'only the host, an admin or whoever holds the finance seat can remove entries');
      const d = load(pid), n = d.entries.length; d.entries = d.entries.filter(e => e.id !== sub);
      if (n === d.entries.length) throw err(404, 'entry not found'); save(pid, d); return send(res, 200, { ok: true });
    }
    return fail(res, 404, 'not found');
  }

  // ---------- MCP (runs in the agent's project) ----------
  const reply = (t, e) => ({ content: [{ type: 'text', text: t }], ...(e ? { isError: true } : {}) });
  const fmt = (n, cur) => `${n < 0 ? '-' : ''}${cur ? cur + ' ' : ''}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cur && !ZERO_DEC.has(cur) ? 2 : 0, maximumFractionDigits: cur && !ZERO_DEC.has(cur) ? 2 : 0 })}`;
  const curPid = () => P.current() || P.defaultId();
  const mcpTools = {
    ledger_summary: {
      description: 'This company\'s money for a month: revenue, costs by category, net, runway and users, each with where the numbers came from (Stripe, a CSV export, a person, an agent). Read it before you plan growth or spend. Optional `month` (YYYY-MM, default this month). Numbers are only what was recorded; never estimate beyond them.',
      inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' } }, additionalProperties: false },
      run: ({ month } = {}, me) => {
        const pid = curPid(); if (!canRead(me, pid)) return reply('Your owner can\'t see this project\'s money.', true);
        const s = summary(pid, month), cur = s.currency;
        const srcs = a => a.map(x => `${x.name} (${x.count})`).join(', ') || 'none';
        const lines = [`Money for ${s.month} (${cur}), ${s.entries} entries${s.asOf ? `, last added ${s.asOf.slice(0, 16).replace('T', ' ')}` : ''}:`,
          `Revenue ${fmt(s.revenue.total, cur)} from ${srcs(s.revenue.sources)}`,
          `Costs ${fmt(s.costs.total, cur)}${s.costs.byCategory.length ? ' (' + s.costs.byCategory.map(c => `${c.category} ${fmt(c.total, cur)}`).join(', ') + ')' : ''} from ${srcs(s.costs.sources)}`,
          `Net ${fmt(s.net, cur)}`,
          `Users ${s.users.total}${s.users.byLabel.length ? ' (' + s.users.byLabel.map(x => `${x.label} ${x.total}`).join(', ') + ')' : ''}`,
          `Runway: ${s.runway.months != null ? s.runway.months + ' months' : s.runway.reason}`,
          `AI spend this week: ${s.aiSpend.seats.filter(x => x.events || x.budget).map(x => `${x.title} ${fmt(x.spent, cur)}${x.budget ? ' of ' + fmt(x.budget, cur) : ''}`).join(', ') || 'none reported'}`];
        if (s.otherCurrencies.length) lines.push(`Not counted (other currencies): ${s.otherCurrencies.map(x => `${x.count} in ${x.currency}`).join(', ')}`);
        return reply(lines.join('\n'));
      },
    },
    ledger_add: {
      description: 'Add one entry to the company ledger. Only the agent holding the finance seat may do this; the entry is marked as added by an agent. Give the real figure and where you read it (`from`, e.g. "Stripe dashboard payout po_123"); never estimate or invent numbers.',
      inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: KINDS }, amount: { type: 'number' }, currency: { type: 'string' }, label: { type: 'string' }, category: { type: 'string', enum: CATEGORIES }, date: { type: 'string', description: 'YYYY-MM-DD' }, from: { type: 'string', description: 'Where this number comes from' } }, required: ['kind', 'amount', 'label', 'from'], additionalProperties: false },
      run: (a = {}, me) => {
        const pid = curPid();
        if (!financeSeats(pid).some(s => s.holder && s.holder.agent === me.id)) return reply('Only the agent holding the finance seat can add ledger entries. Ask the host to assign you the finance seat, or tell a human the number.', true);
        if (!str(a.from, 120)) return reply('Say where the number comes from (`from`).', true);
        try { const e = add(pid, me, { kind: a.kind, amount: a.amount, currency: a.currency, label: a.label, category: a.category, at: a.date }, { type: 'ai', name: me.name || 'agent', ref: str(a.from, 120) }); return reply(`Added ${e.kind} ${e.currency ? fmt(e.amount, e.currency) : e.amount}: ${e.label} (id ${e.id}).`); }
        catch (e) { return reply(e.message, true); }
      },
    },
    report_spend: {
      description: 'Report your own AI spend for the seat you hold (tokens and the cost your tool showed), so the team sees spend per seat against the weekly budget. Report after each work session. `cost` is in the books\' currency; 0 is fine on a flat subscription.',
      inputSchema: { type: 'object', properties: { tokensIn: { type: 'number' }, tokensOut: { type: 'number' }, model: { type: 'string' }, cost: { type: 'number' }, seat: { type: 'string', description: 'Seat id (optional: the seat you hold)' } }, required: ['cost', 'model'], additionalProperties: false },
      run: (a = {}, me) => {
        const pid = curPid(); const mine = seats(pid).filter(s => s.holder && (s.holder.agent === me.id || (me.owner && s.holder.person === me.owner)));
        const seat = a.seat ? seats(pid).find(s => s.id === a.seat) : (mine.find(s => s.holder.agent === me.id) || mine[0]);
        if (!seat) return reply('You don\'t hold a seat in this company. Ask the host to assign one (Company › seats).', true);
        try { const e = reportSpend(pid, me, { ...a, seat: seat.id }); const w = aiWeek(pid).seats.find(x => x.seat === seat.id) || {}; return reply(`Recorded ${fmt(e.amount, e.currency)} for ${seat.title || seat.id}. This week: ${fmt(w.spent || 0, e.currency)}${w.budget ? ` of ${fmt(w.budget, e.currency)}${w.over ? ' (over budget: stop and ask a human)' : ''}` : ' (no weekly budget set)'}.`); }
        catch (e) { return reply(e.message, true); }
      },
    },
  };

  return { route, mcpTools, summary, aiWeek, spentThisWeek, company, canRead, canWrite, isBoss, parseCsv, money, CONNECTORS };
};
module.exports.companyReader = companyReader;
module.exports.parseCsv = parseCsv;
module.exports.weekStart = weekStart;
