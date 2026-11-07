// File-backed storage: everything is Markdown / JSON / JSONL inside the tribe folder.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const _jsonl = new Map();   // absolute path -> { lines, size, mtimeMs, ino }
const statOf = f => { try { const s = fs.statSync(f); return { size: s.size, mtimeMs: s.mtimeMs, ino: s.ino }; } catch { return null; } };
const sameStat = (a, b) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
const parseLine = l => { try { return JSON.parse(l); } catch { return null; } };

class Store {
  constructor(root) {
    this.root = path.resolve(root);
    for (const d of ['', 'chat', 'tasks', 'docs', 'proposals', 'decisions', 'brain', 'bugs', '.tribe']) fs.mkdirSync(path.join(this.root, d), { recursive: true });
    this._seedReadme();
  }

  p(...parts) {
    const full = path.resolve(this.root, ...parts);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('path escapes tribe folder');
    return full;
  }

  readJSON(rel, fallback) { try { return JSON.parse(fs.readFileSync(this.p(rel), 'utf8')); } catch { return fallback; } }
  writeJSON(rel, data) { this._atomic(this.p(rel), JSON.stringify(data, null, 2)); }
  _atomic(file, text) { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }

  // JSONL (chat, inboxes, logs): append-only. Reads go through a per-file cache of raw lines that is
  // checked against the file's size/mtime/inode on every read, so a chat with 100k lines is split once,
  // and only the lines a caller asks for are parsed. Appends from this process update the cache in place.
  appendJSONL(rel, obj) {
    const file = this.p(rel), line = JSON.stringify(obj);
    const c = _jsonl.get(file), before = c && statOf(file);
    fs.appendFileSync(file, line + '\n');
    if (c && before && sameStat(c, before)) { c.lines.push(line); Object.assign(c, statOf(file) || {}); } else _jsonl.delete(file);
  }
  _lines(rel) {
    const file = this.p(rel), st = statOf(file);
    if (!st) { _jsonl.delete(file); return []; }
    const c = _jsonl.get(file);
    if (c && sameStat(c, st)) return c.lines;
    let text; try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const lines = text.split('\n').filter(Boolean);
    _jsonl.set(file, { lines, ...st });
    if (_jsonl.size > 200) _jsonl.delete(_jsonl.keys().next().value);   // keep the cache bounded
    return lines;
  }
  readJSONL(rel, limit = 200) {
    return this._lines(rel).slice(-limit).map(parseLine).filter(Boolean);
  }
  // Newest-first search without parsing the whole file: `hint` is a substring every match contains
  // (e.g. '"id":"abc"'), so only candidate lines are parsed. Returns the first (newest) match or null.
  findJSONL(rel, pred, hint) {
    const lines = this._lines(rel);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (hint && !lines[i].includes(hint)) continue;
      const o = parseLine(lines[i]); if (o && pred(o)) return o;
    }
    return null;
  }

  // ---- markdown with front-matter ----
  writeMd(rel, meta, body = '') {
    const fm = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
    this._atomic(this.p(rel), `---\n${fm}\n---\n\n${body.trim()}\n`);
  }
  readMd(rel) {
    let text; try { text = fs.readFileSync(this.p(rel), 'utf8'); } catch { return null; }
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':'); if (i < 1) continue;
      const k = line.slice(0, i).trim(), raw = line.slice(i + 1).trim();
      try { meta[k] = JSON.parse(raw); } catch { meta[k] = raw; }
    }
    return { meta, body: m[2].trim() };
  }
  listMd(dir) {
    try { return fs.readdirSync(this.p(dir)).filter(f => f.endsWith('.md') && !f.endsWith('.summary.md')).map(f => path.join(dir, f)); }
    catch { return []; }
  }
  remove(rel) { try { fs.unlinkSync(this.p(rel)); } catch {} }

  _seedReadme() {
    const f = this.p('README.md');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# Tribe folder\n\nManaged by TribeCode. Everything here is plain Markdown/JSON, so it is safe to commit to git.\n\n- `chat/` one JSONL file per channel\n- `tasks/` one Markdown file per task\n- `docs/` shared pages\n- `proposals/` proposals and votes\n- `decisions/` decision log\n- `brain/` local brain notes\n- `bugs/` bug inbox (self-sorted)\n- `.tribe/` members and invites (keep private: do not commit)\n');
    const gi = this.p('.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.tribe/\n');
  }
}

const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const code = (n = 5) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = crypto.randomBytes(n); for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled';

module.exports = { Store, id, code, hash, slug };
