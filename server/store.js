// File-backed storage: everything is Markdown / JSON / JSONL inside the tribe folder.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class Store {
  constructor(root) {
    this.root = path.resolve(root);
    for (const d of ['', 'chat', 'tasks', 'docs', 'proposals', 'decisions', 'brain', '.tribe']) fs.mkdirSync(path.join(this.root, d), { recursive: true });
    this._seedReadme();
  }

  p(...parts) {
    const full = path.resolve(this.root, ...parts);
    if (!full.startsWith(this.root)) throw new Error('path escapes tribe folder');
    return full;
  }

  readJSON(rel, fallback) { try { return JSON.parse(fs.readFileSync(this.p(rel), 'utf8')); } catch { return fallback; } }
  writeJSON(rel, data) { this._atomic(this.p(rel), JSON.stringify(data, null, 2)); }
  _atomic(file, text) { const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }

  appendJSONL(rel, obj) { fs.appendFileSync(this.p(rel), JSON.stringify(obj) + '\n'); }
  readJSONL(rel, limit = 200) {
    let text; try { text = fs.readFileSync(this.p(rel), 'utf8'); } catch { return []; }
    return text.split('\n').filter(Boolean).slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
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
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# Tribe folder\n\nManaged by TribeCode. Everything here is plain Markdown/JSON, so it is safe to commit to git.\n\n- `chat/` one JSONL file per channel\n- `tasks/` one Markdown file per task\n- `docs/` shared pages\n- `proposals/` proposals and votes\n- `decisions/` decision log\n- `brain/` local brain notes\n- `.tribe/` members and invites (keep private: do not commit)\n');
    const gi = this.p('.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.tribe/\n');
  }
}

const id = (n = 10) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const code = (n = 5) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const b = crypto.randomBytes(n); for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled';

module.exports = { Store, id, code, hash, slug };
