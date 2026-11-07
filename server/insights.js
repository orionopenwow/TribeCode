// Insights feed for the Home "AI Insights" panel: GET /api/insights, POST /api/insights/explorer.
// Items: { id, kind: optimization|suggestion|issue|health, title, body, source: explorer|secretary|health, at, project?, public? }
// Sources:
//   explorer  the latest Explorer run (scripts/explore.py): uploaded by the host (POST /api/insights/explorer, kept in
//             .tribe/insights/explorer.json) or a .explore/findings.json in the tribe folder, the TribeCode checkout or a
//             project repo (project-tagged). Top findings, failing journeys, suggestions.
//   health    host checks: disk free in the tribe folder, JSONL files getting big, no GitHub token for pushes, the local
//             model (Ollama) down, no backup in a week, a newer release on GitHub.
//   secretary the Secretary's inspirations (new ideas) per project.
// Scope: the host sees everything; members see explorer + secretary items of projects they can see, and only
// health items marked public. Output never carries tokens or keys (scrubbed), only titles and short bodies.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KINDS = ['optimization', 'suggestion', 'issue', 'health'];
const DAY = 24 * 3600_000;
const SECRET = /(gh[pousr]_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|Bearer\s+[A-Za-z0-9._-]{12,}|(token|key|secret|password)=[^\s&"']+|\b[A-Za-z0-9_-]{32,}\b)/gi;
const scrub = s => String(s == null ? '' : s).replace(SECRET, '[redacted]').slice(0, 600);
const gb = n => `${(n / 1024 ** 3).toFixed(n < 10 * 1024 ** 3 ? 1 : 0)} GB`;
const mb = n => `${(n / 1024 ** 2).toFixed(1)} MB`;

module.exports = function insights({ P, base, brain, getMembers, hasToken, secretary, version, appRoot, repoOf = () => null, now = () => Date.now(), fetchImpl = global.fetch }) {
  const UPLOAD = '.tribe/insights/explorer.json';
  const item = (o) => ({ id: o.id, kind: KINDS.includes(o.kind) ? o.kind : 'health', title: scrub(o.title).slice(0, 160), body: scrub(o.body), source: o.source, at: o.at || new Date(now()).toISOString(), ...(o.project ? { project: o.project } : {}), ...(o.public ? { public: true } : {}), ...(o.severity ? { severity: o.severity } : {}) });

  // ---------- explorer ----------
  function readRun(file) { try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); return d && Array.isArray(d.findings) ? d : null; } catch { return null; } }
  function explorerRuns() {
    const runs = [];
    const up = base.readJSON(UPLOAD, null); if (up && Array.isArray(up.findings)) runs.push({ run: up, project: null, where: 'uploaded' });
    for (const f of [base.p('.explore/findings.json'), appRoot && path.join(appRoot, '.explore', 'findings.json')].filter(Boolean)) { const r = readRun(f); if (r) runs.push({ run: r, project: null, where: f }); }
    for (const p of P.all()) { const repo = repoOf(p); if (!repo) continue; const r = readRun(path.join(repo, '.explore', 'findings.json')); if (r) runs.push({ run: r, project: p.id, where: 'repo' }); }
    // newest per scope (tribe-wide, each project)
    const best = new Map();
    for (const x of runs) { const k = x.project || '*', prev = best.get(k); if (!prev || String(x.run.generated || '') > String(prev.run.generated || '')) best.set(k, x); }
    return [...best.values()];
  }
  const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
  function fromExplorer() {
    const out = [];
    for (const { run, project } of explorerRuns()) {
      const at = run.generated || new Date(now()).toISOString(), tag = project ? `${project}:` : '';
      const s = run.summary || {};
      out.push(item({ id: `ex:${tag}summary`, kind: 'health', source: 'explorer', project, at, title: `Explorer run${run.version ? ` on v${run.version}` : ''}: ${s.critical || 0} critical, ${s.high || 0} high, ${s.medium || 0} medium`,
        body: `${(run.journeys || []).filter(j => j.pass).length} of ${(run.journeys || []).length} journeys pass.` }));
      const top = (run.findings || []).filter(f => (SEV[f.severity] ?? 3) <= 2).sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3)).slice(0, 8);
      for (const f of top) out.push(item({ id: `ex:${tag}${f.id}`, kind: f.kind === 'slow' || f.kind === 'layout-shift' ? 'optimization' : 'issue', severity: f.severity, source: 'explorer', project, at,
        title: f.title + (f.label ? `: ${f.label}` : ''), body: [f.detail, (f.views || []).length ? `Where: ${(f.views || []).slice(0, 3).join(', ')} (${(f.contexts || []).join(', ')})` : ''].filter(Boolean).join(' · ') }));
      for (const j of (run.journeys || []).filter(x => !x.pass).slice(0, 4)) out.push(item({ id: `ex:${tag}journey:${j.id}`, kind: 'issue', source: 'explorer', project, at, title: `Journey fails: ${j.title}`, body: (j.notes || []).join('; ') }));
      for (const g of (run.suggestions || []).filter(x => !x.in_features_next).slice(0, 5)) out.push(item({ id: `ex:${tag}idea:${g.key || g.idea}`, kind: 'suggestion', source: 'explorer', project, at, title: g.idea, body: g.why || '' }));
    }
    return out;
  }
  function upload(body) {
    if (!body || !Array.isArray(body.findings)) throw Object.assign(new Error('expected an explorer findings.json'), { status: 400 });
    const keep = f => ({ id: String(f.id || '').slice(0, 20), kind: String(f.kind || '').slice(0, 24), severity: SEV[f.severity] !== undefined ? f.severity : 'low', title: scrub(f.title).slice(0, 160), detail: scrub(f.detail).slice(0, 400), label: scrub(f.label || '').slice(0, 80),
      views: (f.views || []).slice(0, 6).map(v => String(v).slice(0, 60)), contexts: (f.contexts || []).slice(0, 6).map(v => String(v).slice(0, 30)) });
    const run = { generated: String(body.generated || new Date(now()).toISOString()).slice(0, 30), version: String(body.version || '').slice(0, 20), summary: body.summary || {},
      findings: body.findings.slice(0, 200).map(keep), journeys: (body.journeys || []).slice(0, 40).map(j => ({ id: String(j.id || '').slice(0, 40), title: scrub(j.title).slice(0, 120), pass: !!j.pass, clicks: Number(j.clicks) || 0, notes: (j.notes || []).slice(0, 6).map(n => scrub(n).slice(0, 200)) })),
      suggestions: (body.suggestions || []).slice(0, 20).map(s => ({ key: String(s.key || '').slice(0, 40), idea: scrub(s.idea).slice(0, 160), why: scrub(s.why).slice(0, 300), in_features_next: !!s.in_features_next })) };
    fs.mkdirSync(path.dirname(base.p(UPLOAD)), { recursive: true });
    base.writeJSON(UPLOAD, run);
    return { ok: true, findings: run.findings.length };
  }

  // ---------- health checks (host) ----------
  let latest = { at: 0, version: null };
  async function checkLatest() {
    if (process.env.TRIBE_TEST === '1' || process.env.TRIBE_NO_GH === '1' || !fetchImpl || now() - latest.at < 6 * 3600_000) return latest.version;
    latest.at = now();
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000);
      const r = await fetchImpl('https://api.github.com/repos/orionopenwow/TribeCode/releases/latest', { signal: c.signal, headers: { 'User-Agent': 'TribeCode' } }); clearTimeout(t);
      if (r.ok) latest.version = String((await r.json()).tag_name || '').replace(/^v/, '') || null;
    } catch {}
    return latest.version;
  }
  const newer = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); return false; };
  function jsonlSizes() {
    const out = [];
    const walk = (rel, depth = 0) => {
      let ents; try { ents = fs.readdirSync(base.p(rel), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory() && depth < 3 && !['media', 'node_modules', '.git', 'workspaces', '.trees'].includes(e.name)) walk(r, depth + 1);
        else if (e.isFile() && e.name.endsWith('.jsonl')) { try { out.push({ rel: r, size: fs.statSync(base.p(r)).size }); } catch {} }
      }
    };
    walk(''); return out.sort((a, b) => b.size - a.size);
  }
  async function fromHealth() {
    const out = [], at = new Date(now()).toISOString(), host = getMembers().find(m => m.role === 'host');
    // disk
    try {
      const s = fs.statfsSync(base.root), free = s.bavail * s.bsize, total = s.blocks * s.bsize;
      if (free < 2 * 1024 ** 3) out.push(item({ id: 'h:disk', kind: 'issue', source: 'health', at, title: `Only ${gb(free)} free for the tribe folder`, body: 'Chat media, backups and project repos live here. Free some space or move the tribe folder (docs/DATA.md).' }));
      else out.push(item({ id: 'h:disk', kind: 'health', source: 'health', at, title: `${gb(free)} free on the tribe's disk`, body: `${Math.round(free / total * 100)}% of ${gb(total)}.` }));
    } catch {}
    // JSONL files getting big (chat, inboxes, logs are append-only)
    const big = jsonlSizes().filter(f => f.size > 20 * 1024 ** 2);
    for (const f of big.slice(0, 3)) out.push(item({ id: `h:jsonl:${f.rel}`, kind: f.size > 50 * 1024 ** 2 ? 'issue' : 'optimization', source: 'health', at, title: `${f.rel} is ${mb(f.size)}`, body: 'Append-only files load slower as they grow. Archive old lines (keep the newest) or download a backup and trim.' }));
    // GitHub for pushes
    if (host && !hasToken(host.id)) out.push(item({ id: 'h:github', kind: 'suggestion', source: 'health', at, title: 'Connect GitHub so projects can push', body: 'Without a GitHub token, new projects stay local and autopilot cannot push. Settings → GitHub, or + → Create.' }));
    // local model
    const b = brain && brain.status ? brain.status() : { online: false };
    if (!b.online) out.push(item({ id: 'h:ollama', kind: 'health', source: 'health', at, public: true, title: 'The local model is off', body: `${b.error ? b.error + '. ' : ''}Summaries, triage and the Secretary fall back to simple rules. Install Ollama and run: ollama pull qwen3` }));
    // backups
    const last = (base.readJSON('.tribe/backup.json', {}) || {}).last;
    if (!last || now() - Date.parse(last) > 7 * DAY) out.push(item({ id: 'h:backup', kind: 'suggestion', source: 'health', at, title: last ? `No backup for ${Math.floor((now() - Date.parse(last)) / DAY)} days` : 'No backup yet', body: 'Settings → Download backup saves the whole tribe folder as one .tar.gz (GitHub keys stay on this computer).' }));
    // a newer release
    const v = await checkLatest();
    if (v && version && newer(v, version)) out.push(item({ id: 'h:update', kind: 'health', source: 'health', at, public: true, title: `TribeCode v${v} is available`, body: `This tribe runs v${version}. The desktop app updates itself (Restart to update).` }));
    return out;
  }

  // ---------- secretary inspirations ----------
  function fromSecretary(me) {
    if (!secretary || !secretary.ideas) return [];
    const out = [];
    for (const p of P.visibleTo(me)) {
      let ideas = []; try { ideas = secretary.ideas(p.id) || []; } catch {}
      for (const i of ideas.filter(x => x.status === 'new').slice(-3).reverse()) out.push(item({ id: `sec:${p.id}:${i.id}`, kind: 'suggestion', source: 'secretary', project: p.id, at: i.at || i.created, title: i.title, body: i.body || '' }));
    }
    return out;
  }

  async function list(me) {
    const host = me.role === 'host';
    const seeProject = pid => !pid || P.canSee(me, pid);
    const ex = fromExplorer().filter(i => seeProject(i.project));
    const health = (await fromHealth()).filter(i => host || i.public);
    const items = [...ex, ...health, ...fromSecretary(me)];
    const order = { issue: 0, suggestion: 1, optimization: 2, health: 3 };
    items.sort((a, b) => (order[a.kind] - order[b.kind]) || String(b.at).localeCompare(String(a.at)));
    return items.slice(0, 60);
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (m === 'GET' && !b) {
      if (me.role === 'agent') return fail(res, 403, 'agents read their project, not the insights feed');
      return send(res, 200, { items: await list(me), generated: new Date(now()).toISOString() });
    }
    if (m === 'POST' && b === 'explorer') {
      if (me.role !== 'host') return fail(res, 403, 'only the host uploads explorer runs');
      try { return send(res, 200, upload(await readBody(req, 4 * 1024 * 1024))); } catch (e) { return fail(res, e.status || 400, e.message); }
    }
    return null;
  }
  return { route, list, upload, scrub };
};
