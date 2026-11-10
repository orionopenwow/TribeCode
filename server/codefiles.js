// Code-aware Files (app/ui/codefiles.js): browse the project's pinned repo — branches, a folder tree, a file viewer,
// file-name search, recent changes and the repo's Markdown docs (GET), plus, since v0.23, edit + save (a commit) and
// 🔒 locks for builders (see "edit and lock" below).
//   GET /api/code                          -> { hasRepo, git, branch, github, name }
//   GET /api/code/branches                 -> { current, branches: [{ name, current, sha, subject, author, at }] }
//   GET /api/code/tree?ref=&path=&offset=  -> { ref, path, entries: [{ name, path, type: dir|file|link|module, size? }], total, more }
//   GET /api/code/file?ref=&path=          -> { ref, path, size, binary, tooBig, hidden, text }
//   GET /api/code/search?ref=&q=           -> { results: [{ path }], more }
//   GET /api/code/log?ref=&path=           -> { commits: [{ sha, author, at, subject }] }   (path optional)
//   GET /api/code/recent?ref=              -> { files: [{ path, sha, author, at, subject }] }   the last 5 changed files
//   GET /api/code/docs?ref=                -> { files: [{ path, title }] }   root *.md and docs/**.md
// ref: a local branch name (checked against `git for-each-ref`), empty = the checked-out branch. The checked-out
// branch is read from the working tree (so agents' uncommitted work shows); other branches from git objects.
// Safety: paths are relative, never absolute, never "..", resolved with realpath and kept inside the repo root
// (a symlink pointing outside is 404); .git, node_modules, dist and .gitignore'd entries are hidden; key/secret
// files and .env* are never shown; files over 1 MB or with NUL bytes are not sent. git runs with an args array, no shell.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const SKIP = new Set(['.git', 'node_modules', 'dist', 'bower_components', '__pycache__', '.DS_Store']);
const SECRET = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|secrets?(\..*)?|\.npmrc|\.netrc)$/i;
const MAX_VIEW = 1024 * 1024;
const PAGE = 200;
const MAX_LIST = 50000;

function git(cwd, args, { max = 16 << 20, timeout = 15000 } = {}) {
  return new Promise(res => execFile('git', args, { cwd, encoding: 'buffer', maxBuffer: max, timeout, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } },
    (e, out) => res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: out || Buffer.alloc(0) })));
}
const txt = b => b.toString('utf8');

module.exports = function codefiles({ P, claims = null, identity = null, member = null, broadcast = () => {} }) {
  const repoOf = () => { const p = P.get(P.current() || P.defaultId()); if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };
  const cache = new Map();   // key -> { at, v }
  const memo = async (key, ms, fn) => { const h = cache.get(key); if (h && Date.now() - h.at < ms) return h.v; const v = await fn(); cache.set(key, { at: Date.now(), v }); if (cache.size > 200) cache.delete(cache.keys().next().value); return v; };
  const bad = (status, msg) => Object.assign(new Error(msg), { status });

  // ---------- paths ----------
  // A clean relative path ('' = the root) or a 400.
  function clean(p) {
    let s = String(p ?? '');
    if (s.length > 1024 || s.includes('\0')) throw bad(400, 'bad path');
    s = s.replace(/\\/g, '/');
    if (/^\//.test(s) || /^[a-zA-Z]:/.test(s)) throw bad(400, 'paths are relative to the repo');
    const segs = s.split('/').filter(x => x && x !== '.');
    if (segs.some(x => x === '..')) throw bad(400, 'paths stay inside the repo');
    if (segs.some(x => SKIP.has(x))) throw bad(404, 'not found');
    return segs.join('/');
  }
  // The real path inside the repo, or a 404 (missing, or a symlink that leads outside).
  function inside(repo, rel) {
    let real; try { real = fs.realpathSync(path.join(repo, ...rel.split('/').filter(Boolean))); } catch { throw bad(404, 'not found'); }
    if (real !== repo && !real.startsWith(repo + path.sep)) throw bad(404, 'not found');
    const back = path.relative(repo, real).split(path.sep).join('/');
    if (back.split('/').some(x => SKIP.has(x))) throw bad(404, 'not found');
    return real;
  }

  // ---------- git facts ----------
  const isGit = repo => memo('g:' + repo, 10000, async () => (await git(repo, ['rev-parse', '--is-inside-work-tree'])).code === 0);
  const current = async repo => { const r = await git(repo, ['symbolic-ref', '--short', '-q', 'HEAD']); return r.code === 0 ? txt(r.out).trim() : ''; };
  async function branches(repo) {
    return memo('b:' + repo, 3000, async () => {
      if (!(await isGit(repo))) return { current: '', branches: [] };
      const cur = await current(repo);
      const r = await git(repo, ['for-each-ref', '--sort=-committerdate', '--count=200', '--format=%(refname:short)%1f%(objectname:short)%1f%(authorname)%1f%(committerdate:iso-strict)%1f%(subject)', 'refs/heads']);
      const list = txt(r.out).split('\n').filter(Boolean).map(l => { const [name, sha, author, at, subject] = l.split('\x1f'); return { name, current: name === cur, sha, author, at, subject: (subject || '').slice(0, 200) }; });
      if (cur && !list.some(b => b.name === cur)) list.unshift({ name: cur, current: true, sha: '', author: '', at: '', subject: 'No commits yet' });
      return { current: cur, branches: list };
    });
  }
  // Which ref to read: { live: true } for the working tree, else { ref: 'refs/heads/<name>' }.
  async function pick(repo, ref) {
    const g = await isGit(repo);
    const want = String(ref || '').trim();
    if (!g) { if (want) throw bad(404, 'no such branch'); return { live: true, name: '', git: false }; }
    const b = await branches(repo);
    if (!want || want === b.current) return { live: true, name: b.current, git: true };
    if (!b.branches.some(x => x.name === want)) throw bad(404, 'no such branch');
    return { live: false, name: want, ref: 'refs/heads/' + want, git: true };
  }
  async function ignored(repo, rels) {
    if (!rels.length) return new Set();
    const r = await new Promise(res => {
      const p = execFile('git', ['check-ignore', '-z', '--stdin'], { cwd: repo, encoding: 'buffer', maxBuffer: 4 << 20, timeout: 10000, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (e, out) => res(out || Buffer.alloc(0)));
      p.stdin.on('error', () => {}); p.stdin.end(rels.join('\0') + '\0');
    });
    return new Set(txt(r).split('\0').filter(Boolean));
  }
  // ls-tree entries under a folder of a branch: [{ mode, type, sha, size, path }]
  async function lsTree(repo, ref, rel, recursive) {
    const args = ['ls-tree', '-z', '-l', ...(recursive ? ['-r'] : []), ref, '--', ...(rel ? [rel + (recursive ? '' : '/')] : [])];
    const r = await git(repo, args, { max: 64 << 20 });
    if (r.code !== 0) throw bad(404, 'not found');
    return txt(r.out).split('\0').filter(Boolean).map(l => { const t = l.indexOf('\t'); const [mode, type, sha, size] = l.slice(0, t).split(/\s+/); return { mode, type, sha, size: Number(size) || 0, path: l.slice(t + 1) }; });
  }

  // ---------- tree ----------
  async function tree(repo, at, rel, offset) {
    let entries = [];
    if (at.live) {
      const real = rel ? inside(repo, rel) : repo;
      let st; try { st = fs.statSync(real); } catch { throw bad(404, 'not found'); }
      if (!st.isDirectory()) throw bad(400, 'not a folder');
      let ents; try { ents = fs.readdirSync(real, { withFileTypes: true }); } catch { throw bad(404, 'not found'); }
      for (const e of ents) {
        if (SKIP.has(e.name)) continue;
        const p = rel ? `${rel}/${e.name}` : e.name;
        if (e.isSymbolicLink()) entries.push({ name: e.name, path: p, type: 'link' });
        else if (e.isDirectory()) entries.push({ name: e.name, path: p, type: 'dir' });
        else if (e.isFile()) { let size = 0; try { size = fs.statSync(path.join(real, e.name)).size; } catch {} entries.push({ name: e.name, path: p, type: 'file', size }); }
      }
      if (at.git) { const ig = await ignored(repo, entries.map(e => e.type === 'dir' ? e.path + '/' : e.path)); entries = entries.filter(e => !ig.has(e.path) && !ig.has(e.path + '/')); }
    } else {
      for (const e of await lsTree(repo, at.ref, rel, false)) {
        const name = e.path.split('/').pop(); if (SKIP.has(name)) continue;
        entries.push({ name, path: e.path, type: e.mode === '120000' ? 'link' : e.type === 'tree' ? 'dir' : e.type === 'commit' ? 'module' : 'file', ...(e.type === 'blob' ? { size: e.size } : {}) });
      }
      if (rel && !entries.length) {   // an empty listing: is it a folder at all?
        const self = await lsTree(repo, at.ref, rel.split('/').slice(0, -1).join('/'), false).catch(() => []);
        if (!self.some(e => e.path === rel && e.type === 'tree')) throw bad(404, 'not found');
      }
    }
    const rank = e => (e.type === 'dir' || e.type === 'module' ? 0 : 1);
    entries.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    const o = Math.max(0, Number(offset) || 0);
    return { ref: at.name, path: rel, entries: entries.slice(o, o + PAGE), total: entries.length, offset: o, more: entries.length > o + PAGE };
  }

  // ---------- one file ----------
  const isBinary = buf => { const n = Math.min(buf.length, 8000); for (let i = 0; i < n; i++) if (buf[i] === 0) return true; return false; };
  async function file(repo, at, rel) {
    if (!rel) throw bad(400, 'path required');
    const name = rel.split('/').pop();
    let size, buf = null;
    if (at.live) {
      const real = inside(repo, rel);
      let st; try { st = fs.statSync(real); } catch { throw bad(404, 'not found'); }
      if (!st.isFile()) throw bad(400, 'not a file');
      if (at.git && (await ignored(repo, [rel])).size) throw bad(404, 'not found');
      size = st.size;
      if (!SECRET.test(name) && size <= MAX_VIEW) buf = fs.readFileSync(real);
    } else {
      const e = (await lsTree(repo, at.ref, rel, true)).find(x => x.path === rel);
      if (!e || e.type !== 'blob' || e.mode === '120000') throw bad(404, 'not found');
      size = e.size;
      if (!SECRET.test(name) && size <= MAX_VIEW) { const r = await git(repo, ['cat-file', 'blob', e.sha], { max: MAX_VIEW + 1024 }); if (r.code !== 0) throw bad(404, 'not found'); buf = r.out; }
    }
    const out = { ref: at.name, path: rel, size, binary: false, tooBig: size > MAX_VIEW, hidden: SECRET.test(name), text: '' };
    if (buf) { if (isBinary(buf)) out.binary = true; else out.text = txt(buf); }
    return out;
  }

  // ---------- every file path (search, recent, docs) ----------
  async function allPaths(repo, at) {
    return memo(`a:${repo}:${at.live ? '@live' : at.ref}`, 5000, async () => {
      let list = [];
      if (at.live && at.git) {
        const r = await git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { max: 64 << 20 });
        list = [...new Set(txt(r.out).split('\0').filter(Boolean))];
        if (list.length < 5000) list = list.filter(p => { try { return fs.statSync(path.join(repo, p)).isFile(); } catch { return false; } });   // drop tracked files deleted in the tree
      } else if (at.live) {
        const walk = (rel, d) => { if (d > 12 || list.length >= MAX_LIST) return; let ents; try { ents = fs.readdirSync(path.join(repo, rel), { withFileTypes: true }); } catch { return; }
          for (const e of ents) { if (SKIP.has(e.name)) continue; const p = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(p, d + 1); else if (e.isFile()) list.push(p); } };
        walk('', 0);
      } else list = (await lsTree(repo, at.ref, '', true)).filter(e => e.type === 'blob' && e.mode !== '120000').map(e => e.path);
      return list.filter(p => !p.split('/').some(x => SKIP.has(x))).slice(0, MAX_LIST);
    });
  }
  async function search(repo, at, q) {
    q = String(q || '').trim().toLowerCase().slice(0, 120);
    if (!q) return { results: [], more: false };
    const all = await allPaths(repo, at);
    const scored = [];
    for (const p of all) {
      const low = p.toLowerCase(), base = low.split('/').pop();
      const s = base === q ? 0 : base.startsWith(q) ? 1 : base.includes(q) ? 2 : low.includes(q) ? 3 : -1;
      if (s >= 0) scored.push([s, p]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || a[1].localeCompare(b[1]));
    return { results: scored.slice(0, 50).map(([, p]) => ({ path: p })), more: scored.length > 50 };
  }
  const LOGF = '--format=%x1e%h%x1f%an%x1f%aI%x1f%s';
  const parseLog = s => s.split('\x1e').filter(x => x.trim()).map(chunk => { const [head, ...rest] = chunk.split('\n'); const [sha, author, at, subject] = head.split('\x1f'); return { sha, author, at, subject: (subject || '').slice(0, 200), files: rest.map(x => x.trim()).filter(Boolean) }; });
  async function log(repo, at, rel) {
    if (!at.git) return { commits: [] };
    const r = await git(repo, ['log', '-n', '8', LOGF, at.live ? 'HEAD' : at.ref, '--', ...(rel ? [rel] : [])]);
    return { commits: r.code === 0 ? parseLog(txt(r.out)).map(({ files, ...c }) => c) : [] };
  }
  async function recent(repo, at) {
    if (!at.git) return { files: [] };
    const r = await git(repo, ['log', '-n', '40', '--name-only', '--diff-filter=AMR', LOGF, at.live ? 'HEAD' : at.ref, '--']);
    if (r.code !== 0) return { files: [] };
    const have = new Set(await allPaths(repo, at)), out = [], seen = new Set();
    for (const c of parseLog(txt(r.out))) for (const f of c.files) {
      if (seen.has(f) || !have.has(f)) continue; seen.add(f);
      out.push({ path: f, sha: c.sha, author: c.author, at: c.at, subject: c.subject }); if (out.length >= 5) return { files: out };
    }
    return { files: out };
  }
  async function docs(repo, at) {
    const all = await allPaths(repo, at);
    const md = all.filter(p => /\.(md|markdown)$/i.test(p) && (!p.includes('/') || /^docs\//i.test(p)) && !/^TRIBE_CONTEXT\.md$/i.test(p));
    md.sort((a, b) => (a.includes('/') ? 1 : 0) - (b.includes('/') ? 1 : 0) || (/^readme/i.test(b.split('/').pop()) ? 1 : 0) - (/^readme/i.test(a.split('/').pop()) ? 1 : 0) || a.localeCompare(b));
    return { files: md.slice(0, 200).map(p => ({ path: p, title: p.split('/').pop().replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ') })) };
  }
  async function info(repo) {
    const g = await isGit(repo); let github = null, branch = '';
    if (g) {
      branch = await current(repo);
      const r = await git(repo, ['remote', 'get-url', 'origin']);
      const m = r.code === 0 && txt(r.out).trim().match(/github\.com[:/]+([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/);
      if (m) github = m[1];
    }
    return { hasRepo: true, git: g, branch, github, name: path.basename(repo) };
  }

  // ---------- v0.23: edit and lock (the Cursor basics, built in) ----------
  //   PUT    /api/code/file  { path, text, message? }  builders: write the file on the checked-out branch and commit it
  //   POST   /api/code/lock  { path }                  🔒 a claim with your name; others (people and agents) can't save over it
  //   DELETE /api/code/lock?path=                      unlock (yours, or any as host/admin)
  // A file someone else has locked answers 423 with their name. Secrets, .env and hidden folders can't be written.
  // v0.27: an agent may save code when its owner may (it acts for its owner, never above them); people need builder or up
  const personCan = m => !!m && m.role !== 'agent' && m.role !== 'spectator' && !m.guest;
  const canEdit = me => !!me && (me.role === 'agent' ? personCan(member && me.owner ? member(me.owner) : null) : personCan(me));
  const lockedBy = (rel, me) => { if (!claims) return null; const ov = (a, b) => a === b || (b.endsWith('/') && a.startsWith(b)) || (a.endsWith('/') && b.startsWith(a)); return claims.list().find(c => c.by !== me.id && ov(rel, c.path)) || null; };
  let chain = Promise.resolve();
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  async function save(repo, rel, text, msg, me) {
    if (!rel || SECRET.test(rel.split('/').pop())) throw bad(403, 'that file can\'t be edited here');
    if (typeof text !== 'string' || text.length > MAX_VIEW) throw bad(413, 'too big to save here (1 MB max)');
    const lk = lockedBy(rel, me); if (lk) throw bad(423, `${lk.name || 'Someone'} has locked ${lk.path}${lk.note ? ' (' + lk.note + ')' : ''}. Ask them to unlock it.`);
    const abs = path.join(repo, ...rel.split('/'));
    const parent = path.dirname(abs); fs.mkdirSync(parent, { recursive: true });
    const realParent = fs.realpathSync(parent); if (realParent !== repo && !realParent.startsWith(repo + path.sep)) throw bad(400, 'paths stay inside the repo');
    try { if (fs.lstatSync(abs).isSymbolicLink()) throw bad(403, 'links can\'t be edited here'); } catch (e) { if (e.status) throw e; }
    return serial(async () => {
      fs.writeFileSync(abs, text);
      if (!(await isGit(repo))) return { saved: true, committed: false };
      await git(repo, ['add', '--', rel]);
      const who = identity && member ? identity(member(me.id) || me) : [];
      const r = await git(repo, [...who, 'commit', '-q', '-m', String(msg || `Edit ${rel}`).slice(0, 200) + ' (via TribeCode)', '--', rel]);
      if (r.code && !/nothing to commit|no changes added/i.test(txt(r.out) + txt(r.err))) throw bad(422, txt(r.err || r.out).slice(0, 200));
      const h = await git(repo, ['rev-parse', '--short', 'HEAD']);
      broadcast({ type: 'repo', project: P.current() });
      return { saved: true, committed: !r.code, sha: txt(h.out).trim() };
    });
  }
  async function route(req, res, { m, b, me, url, send, fail, readBody }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') {
      const repo = repoOf(); if (!repo) return fail(res, 404, 'this project has no repo pinned');
      if (!canEdit(me)) return fail(res, 403, 'ask the host to make you a builder to edit code');
      try {
        if (b === 'file' && m === 'PUT') { const body = await readBody(req); return send(res, 200, await save(repo, clean(body.path), body.text, body.message, me)); }
        if (b === 'lock' && m === 'POST') { if (!claims) return fail(res, 501, 'locks are off'); const body = await readBody(req); const r = claims.claim(clean(body.path), body.note || 'editing in TribeCode', me); return r.conflict ? fail(res, 423, `${r.conflict.name || 'Someone'} already locked ${r.conflict.path}`) : send(res, 200, r); }
        if (b === 'lock' && m === 'DELETE') { if (!claims) return fail(res, 501, 'locks are off'); return send(res, 200, { released: !!claims.release(clean(url.searchParams.get('path')), me) }); }
      } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'could not save'); }
      return fail(res, 405, 'not here');
    }
    const repo = repoOf();
    if (!b) return send(res, 200, repo ? await info(repo) : { hasRepo: false });
    if (!repo) return fail(res, 404, 'this project has no repo pinned');
    const q = url.searchParams;
    try {
      if (b === 'branches') return send(res, 200, await branches(repo));
      const at = await pick(repo, q.get('ref'));
      if (b === 'tree') return send(res, 200, await tree(repo, at, clean(q.get('path')), q.get('offset')));
      if (b === 'file') return send(res, 200, await file(repo, at, clean(q.get('path'))));
      if (b === 'search') return send(res, 200, await search(repo, at, q.get('q')));
      if (b === 'log') return send(res, 200, await log(repo, at, clean(q.get('path'))));
      if (b === 'recent') return send(res, 200, await recent(repo, at));
      if (b === 'docs') return send(res, 200, await docs(repo, at));
    } catch (e) { return fail(res, e.status || 500, e.status ? e.message : 'could not read the repo'); }
    return fail(res, 404, 'not found');
  }
  return { route, clean };
};
