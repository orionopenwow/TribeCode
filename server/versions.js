// Versions, in one place (feat/folder-sync): a timeline of a project's saves and ships with who, when, the message and
// the files, and what you can do with each one: see the diff, restore a file, restore the whole project (always as a new
// version, never by throwing anything away), name it ("v1 demo"), compare two, download one as a zip.
//
// Where the history lives: the project's own git when its folder has .git; a plain folder (no .git) gets a private
// history in <folder>/.tribe/history (its own git dir; the user's folder never becomes a git repo and .tribe/ never
// ships). Plain-folder saves are recorded by themselves: TribeCode's own writes and outside edits (folderhome's watcher).
//
// HTTP (project :id, members who can see it; changes need write access):
//   GET  /api/projects/:id/versions                     { kind, list, dirty, tags }
//   POST /api/projects/:id/versions                     { message }  save a version now
//   GET  /api/projects/:id/versions/compare?a=&b=        files + diff between two versions (b defaults to now)
//   GET  /api/projects/:id/versions/:sha                 files changed in that version
//   GET  /api/projects/:id/versions/:sha/diff?path=      the diff of that version (one file or all)
//   POST /api/projects/:id/versions/:sha/restore-file   { path }
//   POST /api/projects/:id/versions/:sha/restore        the whole project as it was, as a new version
//   POST /api/projects/:id/versions/:sha/tag            { name }   ("" removes the name)
//   GET  /api/projects/:id/versions/:sha/zip            that version as a zip
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { run } = require('./gitutil');

const SAVE_MS = Number(process.env.TRIBE_VERSIONS_SAVE_MS) || 3000;
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const SHA = /^[0-9a-f]{4,40}$/;

module.exports = function versions({ P, W, perms, broadcast, nameOf, syncLog = () => [], log = () => {} }) {
  const writer = (me, pid) => !!me && !['spectator', 'guest'].includes(me.role) && P.canSee(me, pid);
  // which git, and how to call it
  function where(pid) {
    const p = P.get(pid); if (!p || !p.repo || !fs.existsSync(p.repo)) return null;
    const dir = p.repo;
    if (W.isRepo(dir)) return { kind: 'git', dir, pre: [] };
    if (!p.folder) return null;
    const gd = path.join(dir, '.tribe', 'history');
    return { kind: 'history', dir, gd, pre: ['--git-dir', gd, '--work-tree', dir] };
  }
  async function git(w, args, o = {}) { const r = await run('git', [...w.pre, ...args], { cwd: w.dir, timeout: o.timeout || 60_000, env: { GIT_TERMINAL_PROMPT: '0' } }); return r; }
  async function must(w, args) { const r = await git(w, args); if (r.code) throw fail(422, (r.err || r.out || 'git failed').split('\n')[0]); return r.out; }
  async function ensure(w) {
    const ex = w.kind === 'history' ? path.join(w.gd, 'info', 'exclude') : path.join(w.dir, '.git', 'info', 'exclude');
    if (w.kind === 'history' && !fs.existsSync(path.join(w.gd, 'HEAD'))) {
      fs.mkdirSync(w.gd, { recursive: true });
      const r = await run('git', ['init', '-q', '--bare', '-b', 'main', w.gd], { cwd: w.dir }); if (r.code) throw fail(422, 'Couldn’t start the history: ' + (r.err || '').split('\n')[0]);
      await must(w, ['config', 'core.bare', 'false']);
    }
    try { fs.mkdirSync(path.dirname(ex), { recursive: true }); const t = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : ''; const add = ['/.tribe/', '/.trees/', ...(w.kind === 'history' ? ['node_modules/', '.DS_Store'] : [])].filter(x => !t.split('\n').includes(x)); if (add.length) fs.appendFileSync(ex, (t && !t.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n'); } catch {}
  }
  const ident = me => ['-c', `user.name=${String((me && me.name) || 'TribeCode').replace(/[<>\n]/g, '').slice(0, 64)}`, '-c', `user.email=${me && me.id ? (W.emailOf ? W.emailOf(me) : 'tribe@users.noreply.tribecode') : 'bot@users.noreply.tribecode'}`];
  async function snapshot(pid, me, message) {
    const w = where(pid); if (!w) throw fail(400, 'This project has no folder or code repository yet, so there is no history to keep.');
    await ensure(w);
    await must(w, ['add', '-A']);   // .tribe/ is in info/exclude
    if ((await git(w, ['diff', '--cached', '--quiet'])).code === 0) return null;
    await must(w, [...ident(me), 'commit', '-q', '-m', String(message || 'Saved').slice(0, 300)]);
    broadcast({ type: 'versions', project: pid });
    return (await must(w, ['rev-parse', 'HEAD'])).slice(0, 40);
  }
  // plain folders: every save (TribeCode's or another editor's) becomes a version a few seconds later
  const timers = new Map();
  function onSave(pid, files) {
    const w = where(pid); if (!w || w.kind !== 'history') return;
    clearTimeout(timers.get(pid));
    timers.set(pid, setTimeout(() => { timers.delete(pid); snapshot(pid, null, files && files.length === 1 ? `Saved ${files[0]}` : `Saved ${files ? files.length : ''} files`.replace('  ', ' ')).catch(e => log('versions: ' + e.message)); }, SAVE_MS));
  }

  async function list(pid) {
    const w = where(pid); if (!w) return { kind: null, list: [], dirty: 0, tags: [] };
    await ensure(w);
    const head = await git(w, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    const dirty = (await git(w, ['status', '--porcelain', '--', '.', ':(exclude).tribe'])).out.split('\n').filter(Boolean).length;
    if (head.code) return { kind: w.kind, list: [], dirty, tags: [] };
    const r = await git(w, ['log', '-200', '--shortstat', '--format=%x1e%H%x1f%an%x1f%aI%x1f%s']);
    const tags = await tagList(w);
    const shipped = new Map(syncLog(pid).filter(e => e.sha).map(e => [e.sha.slice(0, 40), e]));
    const list = r.out.split('\x1e').filter(x => x.trim()).map(chunk => {
      const [line, ...rest] = chunk.trim().split('\n'); const [sha, author, at, subject] = line.split('\x1f');
      const st = rest.join(' '), n = Number((st.match(/(\d+) files? changed/) || [])[1] || 0);
      const s = shipped.get(sha);
      return { sha, short: sha.slice(0, 7), author, at, message: subject, files: n, tags: tags.filter(t => t.sha === sha).map(t => t.label), shipped: s ? { why: s.why, pr: s.pr || null } : null };
    });
    return { kind: w.kind, list, dirty, tags };
  }
  async function tagList(w) {
    const r = await git(w, ['for-each-ref', 'refs/tags', '--format=%(refname:short)%1f%(*objectname)%1f%(objectname)%1f%(contents:subject)']);
    return r.out.split('\n').filter(Boolean).map(l => { const [ref, peeled, obj, subj] = l.split('\x1f'); return { ref, sha: peeled || obj, label: subj || ref }; });
  }
  async function resolveSha(w, s) { if (!SHA.test(String(s || ''))) throw fail(400, 'not a version'); const r = await git(w, ['rev-parse', '--verify', '--quiet', `${s}^{commit}`]); if (r.code) throw fail(404, 'no such version'); return r.out.trim(); }
  async function filesOf(w, sha, base) {
    const r = await git(w, base ? ['diff', '--numstat', base, sha, '--', '.', ':(exclude).tribe'] : ['show', '--numstat', '--format=', '--root', sha]);
    return r.out.split('\n').filter(Boolean).map(l => { const [a, d, ...p] = l.split('\t'); return { path: p.join('\t'), add: Number(a) || 0, del: Number(d) || 0 }; }).slice(0, 500);
  }
  const relOk = rel => { const r = String(rel || '').replace(/\\/g, '/'); if (!r || r.includes('\0') || r.startsWith('/') || r.split('/').some(x => x === '..' || x === '.git' || x === '.tribe')) throw fail(400, 'bad path'); return r; };
  async function diff(w, sha, rel, base) {
    const args = base ? ['diff', base, sha] : ['show', '--format=', '--root', sha];
    const r = await git(w, [...args, '--', ...(rel ? [relOk(rel)] : ['.', ':(exclude).tribe'])]);
    return r.out.length > 400_000 ? r.out.slice(0, 400_000) + '\n… (cut: too long to show)' : r.out;
  }
  async function restoreFile(pid, sha, rel, me) {
    const w = where(pid); await ensure(w); const s = await resolveSha(w, sha); const r = relOk(rel);
    const blob = await git(w, ['cat-file', '-e', `${s}:${r}`]); if (blob.code) throw fail(404, 'That file isn’t in this version.');
    await snapshot(pid, me, `Before restoring ${r}`).catch(() => null);   // what's there now stays in the history
    const full = path.join(w.dir, ...r.split('/'));
    for (let cur = path.dirname(full); cur.startsWith(w.dir) && cur !== w.dir; cur = path.dirname(cur)) { try { if (fs.lstatSync(cur).isSymbolicLink()) throw fail(400, 'That path goes through a link.'); } catch (e) { if (e.status) throw e; } }
    try { if (fs.lstatSync(full).isSymbolicLink()) throw fail(400, 'That file is a link.'); } catch (e) { if (e.status) throw e; }
    await must(w, ['checkout', s, '--', r]);
    const made = await snapshot(pid, me, `Restore ${r} from ${s.slice(0, 7)}`);
    return { restored: r, version: made };
  }
  async function restoreAll(pid, sha, me) {
    const w = where(pid); await ensure(w); const s = await resolveSha(w, sha);
    await snapshot(pid, me, 'Before restoring an earlier version').catch(() => null);
    const msg = (await git(w, ['log', '-1', '--format=%s', s])).out;
    await must(w, ['read-tree', '-u', '--reset', s]);   // the files of that version; the history keeps everything after it
    const made = await snapshot(pid, me, `Restore the project to ${s.slice(0, 7)} (“${msg.slice(0, 80)}”)`);
    return { version: made || (await must(w, ['rev-parse', 'HEAD'])), from: s };
  }
  async function tag(pid, sha, name, me) {
    const w = where(pid); await ensure(w); const s = await resolveSha(w, sha);
    const label = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    for (const t of (await tagList(w)).filter(t => t.sha === s)) await git(w, ['tag', '-d', t.ref]);
    if (!label) return { tags: [] };
    let ref = label.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$|\.\.+/g, '').slice(0, 40) || 'version';
    if ((await tagList(w)).some(t => t.ref === ref)) ref += '-' + s.slice(0, 7);
    await must(w, [...ident(me), 'tag', '-a', ref, '-m', label, s]);
    broadcast({ type: 'versions', project: pid });
    return { tags: [label], ref };
  }
  function zip(w, sha, res, name) {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}-${sha.slice(0, 7)}.zip"`, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    const p = spawn('git', [...w.pre, 'archive', '--format=zip', sha, '--', '.', ':(exclude).tribe'], { cwd: w.dir, windowsHide: true });
    p.stdout.pipe(res); p.on('error', () => res.destroy()); p.on('close', code => { if (code) res.destroy(); });
  }

  async function route(req, res, { m, b, c, parts, me, url, readBody, send, fail: f }) {
    if (c !== 'versions') return null;
    if (!me) return f(res, 401, 'not a member of this tribe');
    const p = P.get(b); if (!p || !P.canSee(me, b)) return f(res, 404, 'project not found');
    const sub = parts[3], act = parts[4];
    try {
      if (!sub && m === 'GET') return send(res, 200, await list(b));
      const w = where(b); if (!w) return f(res, 400, 'This project has no folder or code repository yet, so there is no history to keep.');
      await ensure(w);
      const needW = () => { if (!writer(me, b)) throw fail(403, 'read-only'); };
      if (!sub && m === 'POST') { needW(); const body = await readBody(req); const v = await snapshot(b, me, body.message || `Saved by ${me.name}`); return send(res, 200, { version: v, note: v ? null : 'Nothing changed since the last version.' }); }
      if (sub === 'compare' && m === 'GET') {
        const a = await resolveSha(w, url.searchParams.get('a')), bb = url.searchParams.get('b') ? await resolveSha(w, url.searchParams.get('b')) : null;
        if (bb) return send(res, 200, { a, b: bb, files: await filesOf(w, bb, a), diff: await diff(w, bb, url.searchParams.get('path'), a) });
        const r = await git(w, ['diff', a, '--', ...(url.searchParams.get('path') ? [relOk(url.searchParams.get('path'))] : ['.', ':(exclude).tribe'])]);
        const ns = await git(w, ['diff', '--numstat', a, '--', '.', ':(exclude).tribe']);
        return send(res, 200, { a, b: null, files: ns.out.split('\n').filter(Boolean).map(l => { const [x, y, ...q] = l.split('\t'); return { path: q.join('\t'), add: Number(x) || 0, del: Number(y) || 0 }; }), diff: r.out.slice(0, 400_000) });
      }
      const sha = await resolveSha(w, sub);
      if (!act && m === 'GET') { const info = (await git(w, ['log', '-1', '--format=%an%x1f%aI%x1f%s%x1f%b', sha])).out.split('\x1f'); return send(res, 200, { sha, author: info[0], at: info[1], message: info[2], body: info[3] || '', files: await filesOf(w, sha) }); }
      if (act === 'diff' && m === 'GET') return send(res, 200, { sha, diff: await diff(w, sha, url.searchParams.get('path')) });
      if (act === 'zip' && m === 'GET') return zip(w, sha, res, String(p.name || p.id).replace(/[^\w.-]+/g, '-'));
      if (act === 'restore-file' && m === 'POST') { needW(); return send(res, 200, await restoreFile(b, sha, (await readBody(req)).path, me)); }
      if (act === 'restore' && m === 'POST') { needW(); return send(res, 200, await restoreAll(b, sha, me)); }
      if (act === 'tag' && m === 'POST') { needW(); return send(res, 200, await tag(b, sha, (await readBody(req)).name, me)); }
      return f(res, 404, 'not found');
    } catch (e) { return f(res, e.status || 500, e.message); }
  }
  return { route, list, snapshot, onSave, restoreFile, restoreAll, tag, where };
};
