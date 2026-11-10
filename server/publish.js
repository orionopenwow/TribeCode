// Publish (v0.27): one click turns what the preview shows into a public play link, with a safety check first.
//
//   /play/<slug>/<path>     the published snapshot, read-only, for anyone with the link (works over the share tunnel or
//                           a cloud host). HTML pages get a small "Made with TribeCode · Remix this" bar, Open Graph tags
//                           for share cards, and in-memory storage (the page runs sandboxed, like the preview).
//
// API (members of the project):
//   GET    /api/publish?project=        -> { published: [entry], canPublish, base }
//   POST   /api/publish/check           { project }                          -> { findings, files, bytes, blocked }
//   POST   /api/publish                 { project, title?, desc?, slug?, allowRemix?, force? }
//                                        -> { entry, url } | { pending: approval } (AI helpers) | 409 { findings }
//   PATCH  /api/publish/<slug>          { title?, desc?, allowRemix? }        (who published it, or the host)
//   DELETE /api/publish/<slug>          unpublish (who published it, or the host)
//   POST   /api/publish/remix           { slug } -> { project }   (a new project from a published one that allows remix)
//
// Safety: the snapshot is a copy of the web root (the same folder the preview serves) without dotfiles, node_modules or
// key files. Before it is made, every file is scanned: secrets (API keys, tokens, private keys, .env, .tribe/, secrets/)
// block publishing; risky patterns (HTML built from the address bar, eval, http:// links, very large files) are warnings
// that the person can publish past. Spectators can't publish; AI helpers ask their owner through Approvals first.
// Pages run under `Content-Security-Policy: sandbox …` with no allow-same-origin, so published code can never read the
// tribe's storage or API.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CSP = 'sandbox allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_FILES = 2000, MAX_TOTAL = 60 * 1024 * 1024, BIG_FILE = 8 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.tmj': 'application/json; charset=utf-8', '.ldtk': 'application/json; charset=utf-8',
};
// never copied, wherever they sit
const SKIP_FILE = /^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|.*\.sqlite3?|.*\.db)$/i;
const TEXT = /\.(html?|m?js|cjs|ts|jsx|tsx|css|json|txt|md|xml|svg|webmanifest|map|env|ini|ya?ml|toml|py|sh)$/i;

// ---------- the safety check ----------
const SECRET_RULES = [
  ['Private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe secret key', /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ['Twilio key', /\bSK[0-9a-fA-F]{32}\b/],
  ['Discord bot token', /\b[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}\b/],
  ['Password in the code', /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];
const WARN_RULES = [
  ['Page HTML built from the address bar', /(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b[^;\n]{0,160}(location\.|URLSearchParams|document\.URL|\.hash\b|\.search\b)/, 'Someone could send a link that runs their code on your page. Use textContent, or clean the value first.'],
  ['eval() or new Function()', /\beval\s*\(|\bnew\s+Function\s*\(/, 'Code that runs text as code is easy to misuse. Most of the time there is a safer way.'],
  ['http:// link (not https)', /\b(?:src|href)\s*=\s*["']http:\/\/(?!localhost|127\.0\.0\.1)/i, 'Browsers block or warn on http:// files inside an https page. Use https://.'],
  ['Google API key in the page', /\bAIza[0-9A-Za-z_-]{35}\b/, 'Fine for some Google services in the browser, but restrict the key to your site in the Google console.'],
];
function scanText(rel, text, out) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && i < 20000; i++) {
    const ln = lines[i]; if (ln.length > 4000) continue;
    for (const [kind, re] of SECRET_RULES) if (re.test(ln)) out.push({ level: 'block', kind, file: rel, line: i + 1, why: 'A secret in a public page can be copied by anyone. Move it to a server or an environment variable, and replace (rotate) the key.' });
    for (const [kind, re, why] of WARN_RULES) if (re.test(ln)) out.push({ level: 'warn', kind, file: rel, line: i + 1, why });
  }
}

module.exports = function publish({ P, W, base, preview, setupFlow, getMembers, broadcast, postChat, approvals, nameOf, baseUrl, visualCard = () => null, log = () => {} }) {
  const FILE = '.tribe/publish.json';
  let db = base.readJSON(FILE, { entries: {}, pending: {} });
  db.entries = db.entries || {}; db.pending = db.pending || {};
  const save = () => base.writeJSON(FILE, db);
  const dirOf = s => base.p('published', s);
  const cardOf = s => base.p('published', '.cards', `${s}.png`);
  const err = (status, msg, extra) => Object.assign(new Error(msg), { status }, extra || {});
  const member = id => getMembers().find(m => m.id === id);
  const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const entriesOf = pid => Object.values(db.entries).filter(e => e.project === pid);
  const urlOf = e => `${String(baseUrl() || '').replace(/\/+$/, '')}/play/${e.slug}/`;
  const view = e => e && ({ ...e, url: urlOf(e), byName: nameOf(e.by), card: fs.existsSync(cardOf(e.slug)) ? `/play/${e.slug}/__tribe/card.png` : null });
  const roleIn = (me, pid) => { const p = P.get(pid); return (p && p.members && p.members[me.id]) || me.role; };
  const canPublish = (me, pid) => !!me && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator' && P.canSee(me, pid);
  const canManage = (me, e) => !!me && (e.by === me.id || me.role === 'host' || roleIn(me, e.project) === 'host');

  // ---------- what gets published ----------
  function files(pid) {
    const r = preview.rootOf(pid);
    if (!r.repo) throw err(400, 'This project has no code repository yet. Set it up first (Code repository › Create).');
    if (!r.root) throw err(400, 'There is no index.html to publish yet. Build a first version, then publish it.');
    const out = []; let total = 0;
    (function walk(dir, rel) {
      let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const f of list) {
        if (f.name.startsWith('.') || f.name === 'node_modules' || f.name === '__tribe') continue;
        const abs = path.join(dir, f.name), r2 = rel ? `${rel}/${f.name}` : f.name;
        if (f.isSymbolicLink()) continue;
        if (f.isDirectory()) { if (/^(secrets?|\.tribe)$/i.test(f.name)) { out.push({ rel: r2 + '/', abs, dirSecret: true, size: 0 }); continue; } walk(abs, r2); continue; }
        if (!f.isFile()) continue;
        let st; try { st = fs.statSync(abs); } catch { continue; }
        out.push({ rel: r2, abs, size: st.size, skip: SKIP_FILE.test(f.name) }); total += st.size;
        if (out.length > MAX_FILES) throw err(413, `Over ${MAX_FILES} files in the web folder. Publish a built folder (dist/ or build/) instead.`);
      }
    })(r.root, '');
    return { root: r.root, list: out, total };
  }
  function check(pid) {
    const { list, total } = files(pid), findings = [];
    for (const f of list) {
      if (f.dirSecret) { findings.push({ level: 'block', kind: 'Secrets folder', file: f.rel, why: 'A folder named secrets/ or .tribe/ sits in the web folder. Move it out; it is never published.' }); continue; }
      if (f.skip) { findings.push({ level: 'warn', kind: 'Key or database file left out', file: f.rel, why: 'Files like this are never published. Check the page still works without it.' }); continue; }
      if (/^\.env/i.test(path.basename(f.rel))) { findings.push({ level: 'block', kind: '.env file', file: f.rel, why: 'Environment files hold secrets. Move it out of the web folder.' }); continue; }
      if (f.size > BIG_FILE) findings.push({ level: 'warn', kind: 'Very large file', file: f.rel, why: `${(f.size / 1048576).toFixed(1)} MB: slow on phones. Compress it, or load it only when needed.` });
      if (TEXT.test(f.rel) && f.size <= 2 * 1024 * 1024) { try { scanText(f.rel, fs.readFileSync(f.abs, 'utf8'), findings); } catch {} }
    }
    if (total > MAX_TOTAL) findings.push({ level: 'block', kind: 'Too big to publish', file: '', why: `${(total / 1048576).toFixed(0)} MB in all; the limit is ${MAX_TOTAL / 1048576} MB. Publish a built folder.` });
    const seen = new Set(), uniq = findings.filter(x => { const k = `${x.level}|${x.kind}|${x.file}`; if (seen.has(k)) return false; seen.add(k); return true; });
    return { findings: uniq.slice(0, 60), files: list.filter(f => !f.dirSecret && !f.skip).length, bytes: total, blocked: uniq.some(x => x.level === 'block') };
  }

  // ---------- publish ----------
  function uniqueSlug(want, pid) {
    let s = SLUG_RE.test(want || '') ? want : slugify(want) || 'app';
    const mine = e => e && e.project === pid;
    if (!db.entries[s] || mine(db.entries[s])) return s;
    let n = 2; while (db.entries[`${s}-${n}`] && !mine(db.entries[`${s}-${n}`])) n++; return `${s}-${n}`;
  }
  function doPublish(pid, me, body) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    const ch = check(pid);
    if (ch.blocked) throw err(409, 'The safety check found something that must be fixed before this goes public.', { findings: ch.findings });
    if (ch.findings.length && !body.force) throw err(409, 'The safety check has warnings. Look them over, then publish anyway if they are fine.', { findings: ch.findings, warnings: true });
    const existing = entriesOf(pid)[0];
    const slug = existing && !body.slug ? existing.slug : uniqueSlug(body.slug || p.name, pid);
    if (existing && existing.slug !== slug) { delete db.entries[existing.slug]; try { fs.rmSync(dirOf(existing.slug), { recursive: true, force: true }); } catch {} }
    const dest = dirOf(slug), tmp = dest + '.tmp-' + crypto.randomBytes(3).toString('hex');
    const { root, list } = files(pid);
    fs.mkdirSync(tmp, { recursive: true });
    let n = 0;
    try {
      for (const f of list) {
        if (f.dirSecret || f.skip || /^\.env/i.test(path.basename(f.rel))) continue;
        const to = path.join(tmp, ...f.rel.split('/'));
        if (!to.startsWith(tmp + path.sep)) continue;
        fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.abs, to); n++;
      }
      try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}
      fs.renameSync(tmp, dest);
    } catch (e) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} throw err(500, 'Could not copy the files: ' + e.message); }
    const card = (() => { try { return visualCard(pid); } catch { return null; } })();
    try { fs.mkdirSync(path.dirname(cardOf(slug)), { recursive: true }); if (card && fs.existsSync(card)) fs.copyFileSync(card, cardOf(slug)); else fs.rmSync(cardOf(slug), { force: true }); } catch {}
    const prev = existing || {};
    const e = { slug, project: pid, title: String(body.title || prev.title || p.name).trim().slice(0, 80) || p.name,
      desc: String(body.desc != null ? body.desc : (prev.desc || p.bio || '')).replace(/\s+/g, ' ').trim().slice(0, 240),
      allowRemix: body.allowRemix != null ? !!body.allowRemix : prev.allowRemix !== false, by: prev.by || me.id, updatedBy: me.id,
      at: prev.at || new Date().toISOString(), updated: new Date().toISOString(), version: (prev.version || 0) + 1, files: n, bytes: ch.bytes, warnings: ch.findings.length, root: path.relative(p.repo || root, root).replace(/\\/g, '/') || '.' };
    db.entries[slug] = e; save();
    broadcast({ type: 'publish', project: pid, entry: view(e) });
    try { postChat(p.channel || 'general', 'tribecode', `🚀 ${nameOf(me.id)} published **${e.title}**${e.version > 1 ? ` (version ${e.version})` : ''}: ${urlOf(e)}`); } catch {}
    log(`published ${pid} -> /play/${slug}/ (${n} files)`);
    return { entry: view(e), url: urlOf(e) };
  }
  function request(pid, me, body) {
    if (!canPublish(me, pid)) throw err(403, me && me.role === 'spectator' ? 'spectators can watch, not publish' : 'you are not in this project');
    if (me.role === 'agent') {
      const ch = check(pid);
      if (ch.blocked) throw err(409, 'The safety check found secrets. Fix them before asking to publish.', { findings: ch.findings });
      const p = P.get(pid);
      const ap = approvals.create({ title: `Publish ${p.name} to a public play link`, details: `Anyone with the link can open it.${ch.findings.length ? `\n\nSafety check warnings (${ch.findings.length}): ${ch.findings.slice(0, 5).map(f => `${f.kind} in ${f.file}`).join('; ')}` : '\n\nThe safety check found nothing.'}`, risk: 'medium', kind: 'publish' }, me);
      db.pending[ap.id] = { project: pid, body: { title: body.title, desc: body.desc, allowRemix: body.allowRemix, slug: body.slug, force: true }, by: me.id, at: new Date().toISOString() }; save();
      if (ap.status === 'approved') return onApproval(ap) || { pending: ap };
      return { pending: ap };
    }
    return doPublish(pid, me, body);
  }
  function onApproval(a) {
    const q = a && db.pending[a.id]; if (!q || a.status === 'pending') return null;
    delete db.pending[a.id]; save();
    if (a.status !== 'approved') return null;
    const agent = member(q.by) || { id: q.by, role: 'agent' };
    try { return doPublish(q.project, { ...agent, role: 'builder' }, q.body); } catch (e) { try { postChat('general', 'tribecode', `Publishing ${q.project} after approval failed: ${e.message}`); } catch {} return null; }
  }
  function unpublish(slug, me) {
    const e = db.entries[slug]; if (!e) throw err(404, 'not published');
    if (!canManage(me, e)) throw err(403, 'only who published it, or the host, can take it down');
    delete db.entries[slug]; save();
    try { fs.rmSync(dirOf(slug), { recursive: true, force: true }); fs.rmSync(cardOf(slug), { force: true }); } catch {}
    broadcast({ type: 'publish', project: e.project, removed: slug });
    return { ok: true };
  }
  function edit(slug, me, body) {
    const e = db.entries[slug]; if (!e) throw err(404, 'not published');
    if (!canManage(me, e)) throw err(403, 'only who published it, or the host, can change it');
    if (typeof body.title === 'string' && body.title.trim()) e.title = body.title.trim().slice(0, 80);
    if (typeof body.desc === 'string') e.desc = body.desc.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (typeof body.allowRemix === 'boolean') e.allowRemix = body.allowRemix;
    save(); broadcast({ type: 'publish', project: e.project, entry: view(e) });
    return { entry: view(e) };
  }
  async function remix(slug, me) {
    const e = db.entries[slug]; if (!e) throw err(404, 'not published');
    if (!e.allowRemix) throw err(403, 'The maker turned remixing off for this one.');
    if (!me || me.role === 'agent' || me.role === 'spectator' || P.scoped(me)) throw err(403, 'join the tribe as a builder to remix');
    const p = P.create({ name: `${e.title} (remix)`.slice(0, 48), by: me.id });
    try {
      const { repo } = await setupFlow.ensureRepo(p.id, me);
      const src = dirOf(slug); let n = 0;
      (function copy(dir, rel) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const s = path.join(dir, f.name), d = path.join(repo, rel, f.name);
          if (f.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, path.join(rel, f.name)); } else if (f.isFile()) { if (!fs.existsSync(d) || f.name !== 'README.md') { fs.copyFileSync(s, d); n++; } }
        }
      })(src, '');
      fs.appendFileSync(path.join(repo, 'README.md'), `\n\nRemixed from **${e.title}** by ${nameOf(e.by)} (${urlOf(e)}).\n`);
      await W.git(['add', '-A'], repo);
      await W.git([...W.identity(member(me.id) || me), 'commit', '-q', '-m', `Remix of ${e.title} (via TribeCode)`], repo);
      broadcast({ type: 'projects' });
      return { project: P.get(p.id), files: n };
    } catch (x) { P.remove(p.id); throw x; }
  }

  // ---------- public play pages ----------
  const escA = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const STORAGE = '<script data-tribe-play>(function(){function M(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("x")}catch(e){try{Object.defineProperty(window,n,{value:M(),configurable:true})}catch(_){}}})})();</script>';
  function badge(e) {
    const remix = e.allowRemix ? `<a href="/?remixPlay=${encodeURIComponent(e.slug)}" target="_blank" rel="noopener" style="color:#F26B1D;text-decoration:none;font-weight:600">Remix this</a><span style="opacity:.4">·</span>` : '';
    return `<div id="tribe-made" role="note" style="position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;border-radius:999px;background:#12151A;border:1px solid #2A313C;color:#E6E9EE;font:500 12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:none">`
      + `<a href="https://tribecode.org/?ref=play" target="_blank" rel="noopener" style="color:#E6E9EE;text-decoration:none">Made with <b style="color:#F26B1D">TribeCode</b></a><span style="opacity:.4">·</span>${remix}`
      + `<button type="button" aria-label="Hide" onclick="this.parentNode.remove()" style="all:unset;cursor:pointer;padding:0 4px;opacity:.6">✕</button></div>`;
  }
  function og(e) {
    const b = String(baseUrl() || '').replace(/\/+$/, ''), card = fs.existsSync(cardOf(e.slug)) ? `${b}/play/${e.slug}/__tribe/card.png` : '';
    return `<meta property="og:type" content="website"><meta property="og:title" content="${escA(e.title)}"><meta property="og:description" content="${escA(e.desc || 'Made with TribeCode')}"><meta property="og:url" content="${escA(urlOf(e))}">`
      + (card ? `<meta property="og:image" content="${escA(card)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escA(card)}">` : '<meta name="twitter:card" content="summary">')
      + `<meta name="twitter:title" content="${escA(e.title)}"><meta name="twitter:description" content="${escA(e.desc || 'Made with TribeCode')}">`;
  }
  function inject(html, e) {
    let s = String(html);
    const head = STORAGE + og(e);
    s = /<head[^>]*>/i.test(s) ? s.replace(/<head[^>]*>/i, m => m + head) : head + s;
    s = /<\/body>/i.test(s) ? s.replace(/<\/body>(?![\s\S]*<\/body>)/i, badge(e) + '</body>') : s + badge(e);
    return s;
  }
  const match = (req, url) => req.method === 'GET' && /^\/play\/[a-z0-9][a-z0-9-]{0,47}(\/|$)/.test(url.pathname);
  function serve(req, res, url) {
    const mm = /^\/play\/([a-z0-9][a-z0-9-]{0,47})(\/.*)?$/.exec(url.pathname);
    const e = mm && db.entries[mm[1]];
    const head = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP };
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...head }); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not published</title><body style="font:16px system-ui;background:#12151A;color:#E6E9EE;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px"><div style="max-width:420px"><h1 style="font-size:22px">Nothing here</h1><p style="color:#9AA4B2;line-height:1.6">This play link was taken down, or never existed.</p></div>'); };
    if (!e) return notFound();
    if (!mm[2]) { res.writeHead(301, { Location: `/play/${e.slug}/`, ...head }); return res.end(); }
    let rel; try { rel = decodeURIComponent(mm[2]); } catch { return notFound(); }
    if (rel === '/__tribe/card.png') {
      const f = cardOf(e.slug); if (!fs.existsSync(f)) return notFound();
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }); return fs.createReadStream(f).pipe(res);
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const root = dirOf(e.slug), file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep) || rel.split('/').some(s => s.startsWith('.'))) return notFound();
    let st; try { st = fs.statSync(file); } catch { return notFound(); }
    if (st.isDirectory()) { res.writeHead(301, { Location: url.pathname.replace(/\/?$/, '/'), ...head }); return res.end(); }
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    if (ext === '.html' || ext === '.htm') {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...head });
      return res.end(inject(fs.readFileSync(file, 'utf8'), e));
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'public, max-age=60', ...head });
    fs.createReadStream(file).pipe(res);
  }

  // ---------- API ----------
  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pidOf = v => { const pid = String(v || P.current() || ''); if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found'); return pid; };
    try {
      if (m === 'GET' && !b) { const pid = pidOf(url.searchParams.get('project')); return send(res, 200, { published: entriesOf(pid).map(view), canPublish: canPublish(me, pid), base: String(baseUrl() || '') }); }
      if (m === 'POST' && b === 'check') { const body = await readBody(req, 4096).catch(() => ({})); const pid = pidOf(body.project); if (!canPublish(me, pid)) return fail(res, 403, 'you can\'t publish this project'); return send(res, 200, check(pid)); }
      if (m === 'POST' && b === 'remix') { const body = await readBody(req, 4096).catch(() => ({})); return send(res, 200, await remix(String(body.slug || ''), me)); }
      if (m === 'POST' && !b) { const body = await readBody(req, 16 * 1024).catch(() => ({})); return send(res, 200, request(pidOf(body.project), me, body)); }
      if (m === 'PATCH' && b) { const body = await readBody(req, 8 * 1024).catch(() => ({})); return send(res, 200, edit(b, me, body)); }
      if (m === 'DELETE' && b) return send(res, 200, unpublish(b, me));
    } catch (e) {
      if (e.findings) return send(res, e.status || 409, { error: e.message, findings: e.findings, warnings: !!e.warnings });
      return fail(res, e.status || 500, e.message);
    }
    return fail(res, 404, 'no such publish route');
  }

  const text = t => ({ content: [{ type: 'text', text: t }] });
  const mcpTools = {
    publish_status: {
      description: 'Is this project published to a public play link? Returns the link, title and whether remixing is allowed, plus the result of the pre-publish safety check (secrets block publishing; warnings can be published past by a person).',
      inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
      run: async ({ project } = {}, me) => {
        const pid = project && P.get(project) ? project : P.current(); if (!P.canSee(me, pid)) return text('Not your project.');
        const es = entriesOf(pid).map(view); let ch = null; try { ch = check(pid); } catch (e) { ch = { error: e.message }; }
        return text(`${es.length ? es.map(e => `Published: ${e.url} · "${e.title}" · version ${e.version} · remix ${e.allowRemix ? 'on' : 'off'}`).join('\n') : 'Not published yet.'}\nSafety check: ${ch.error ? ch.error : ch.findings.length ? ch.findings.map(f => `[${f.level}] ${f.kind}${f.file ? ' in ' + f.file + (f.line ? ':' + f.line : '') : ''}`).join('; ') : 'nothing found'}`);
      },
    },
    publish_project: {
      description: 'Ask to publish this project to a public play link (anyone with the link can open it). AI helpers never publish directly: this creates an approval for your owner; it is published when they approve. Fix any secrets the safety check finds first.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, title: { type: 'string' }, desc: { type: 'string' } }, additionalProperties: false },
      run: async ({ project, title, desc } = {}, me) => {
        const pid = project && P.get(project) ? project : P.current();
        try { const r = request(pid, me, { title, desc }); return text(r.pending ? `Asked ${r.pending.toNames ? r.pending.toNames.join(', ') : 'your owner'} to approve publishing (approval ${r.pending.id}).` : `Published: ${r.url}`); }
        catch (e) { return text(`Not published: ${e.message}${e.findings ? '\n' + e.findings.map(f => `[${f.level}] ${f.kind} in ${f.file}${f.line ? ':' + f.line : ''}`).join('\n') : ''}`); }
      },
    },
  };

  return { route, match, serve, check, onApproval, entriesOf: pid => entriesOf(pid).map(view), entry: s => view(db.entries[s]), urlOf, mcpTools };
};
module.exports.CSP = CSP;
