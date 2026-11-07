// Gists: short structured updates from agents (and TribeCode itself) instead of code dumps.
//   { kind: progress|upgrade|plan|blocker|assessment, title, bullets (<=5, <=120 chars), files?, link?, task? }
// The server refuses fenced code and long bodies (> ~600 chars) with a message that tells the agent to
// summarize, and trims what is only a little too long. Every gist is stored per project in
// .tribe/flow/<project>.gists.jsonl and posted to the project's chat as a message with a `gist` field
// (app/ui/gists.js renders it as a compact card; the plain text stays readable everywhere else).
'use strict';
const fs = require('node:fs');

const KINDS = { progress: '📈', upgrade: '⬆️', plan: '🧭', blocker: '⛔', assessment: '🩺' };
const MAX_TOTAL = 600, MAX_BULLETS = 5, BULLET = 120, TITLE = 90;
const CODEISH = /^\s*(const |let |var |function\b|import |export |def |class |return\b|if \(|for \(|while \(|#include|<\/?[a-z][\w-]*[\s>]|[{}]\s*$|\w+\s*\(.*\)\s*;\s*$|\$ )/i;

function fail(msg) { return { error: msg }; }
const one = s => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Returns { gist, notes } or { error } (the error text goes straight back to the agent).
function validate(input) {
  const a = input || {};
  const kind = String(a.kind || 'progress').toLowerCase();
  if (!KINDS[kind]) return fail(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
  const rawTitle = String(a.title || ''), rawBullets = Array.isArray(a.bullets) ? a.bullets.map(String) : String(a.bullets || '').split('\n');
  const raw = [rawTitle, ...rawBullets].join('\n');
  const hint = 'Post a gist instead: a one-line title and up to 5 bullets of at most 120 characters each, in plain words (what changed, why, what is next). Put code in a commit and long notes in a doc (write_doc), then pass the file paths or a link.';
  if (/```|~~~/.test(raw)) return fail(`Rejected: gists never carry code blocks. ${hint}`);
  const total = one(rawTitle).length + rawBullets.reduce((n, b) => n + one(b).length, 0);
  if (total > MAX_TOTAL) return fail(`Rejected: ${total} characters is a dump, not a gist (limit ~${MAX_TOTAL}). ${hint}`);
  const bulletsIn = rawBullets.map(b => one(b).replace(/^([-*+•]|\d+[.)])\s+/, '')).filter(Boolean);
  if (bulletsIn.filter(b => CODEISH.test(b)).length >= 2 || rawBullets.filter(b => CODEISH.test(b)).length >= 2) return fail(`Rejected: that reads like code. ${hint}`);
  const title = clip(one(rawTitle), TITLE);
  if (!title) return fail('A gist needs a title: one line saying what happened.');
  const notes = [];
  if (bulletsIn.length > MAX_BULLETS) notes.push(`kept the first ${MAX_BULLETS} bullets`);
  const bullets = bulletsIn.slice(0, MAX_BULLETS).map(b => { if (b.length > BULLET) { notes.push('shortened a long bullet'); return clip(b, BULLET); } return b; });
  const files = (Array.isArray(a.files) ? a.files : String(a.files || '').split(/[,\n]/)).map(f => one(f).replace(/\\/g, '/').replace(/^\.\//, '')).filter(f => f && f.length <= 200 && !f.includes('..')).slice(0, 30);
  let link = one(a.link).slice(0, 400);
  if (link && !/^(https?:\/\/|#|\/)/.test(link)) link = '';
  const task = /^t-[\w-]{3,40}$/.test(String(a.task || '')) ? String(a.task) : null;
  return { gist: { kind, title, bullets, files: [...new Set(files)], link: link || null, task }, notes: [...new Set(notes)] };
}

// Readable fallback for chat clients that do not know gists (and for TRIBE_CONTEXT.md).
const asText = g => `${KINDS[g.kind] || '•'} **${g.title}**${g.bullets.length ? '\n' + g.bullets.map(b => `- ${b}`).join('\n') : ''}${g.files && g.files.length ? `\n_${g.files.length} file${g.files.length > 1 ? 's' : ''}_` : ''}`;

module.exports = function gists({ P, base, id, postChat, broadcast, nameOf, roleOf = () => null, onGist = () => {} }) {
  fs.mkdirSync(base.p('.tribe/flow'), { recursive: true });
  const rel = pid => `.tribe/flow/${pid}.gists.jsonl`;
  const list = (pid, n = 100) => base.readJSONL(rel(pid), n).reverse();
  const get = (pid, gid) => list(pid, 1000).find(g => g.id === gid) || null;

  // by: a member object ({ id, name }) or 'tribecode'. opts.trusted skips the size guard (server-made gists are trimmed anyway).
  function post(pid, input, by, { auto = false } = {}) {
    const v = validate(input); if (v.error) return v;
    const who = by === 'tribecode' || !by ? { id: 'tribecode', name: 'TribeCode' } : by;
    const role = roleOf(pid, who.id, v.gist.files);
    const g = { id: 'g-' + Date.now().toString(36) + id(3).toLowerCase(), ...v.gist, by: who.id, byName: who.id === 'tribecode' ? 'TribeCode' : (who.name || nameOf(who.id)),
      agent: who.role === 'agent', role: role ? role.id : null, at: new Date().toISOString(), project: pid, auto: !!auto };
    const msg = P.inProject(pid, () => postChat('general', who.id, asText(g), { gist: g }));
    g.msg = msg.id;
    base.appendJSONL(rel(pid), g);
    broadcast({ type: 'gist', gist: g, project: pid });
    try { onGist(g); } catch (e) { console.error('gist hook:', e.message); }
    return { gist: g, notes: v.notes };
  }

  return { validate, post, list, get, asText, KINDS };
};
module.exports.validate = validate;
module.exports.KINDS = KINDS;
