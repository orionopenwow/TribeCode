// Cloud save (docs/CLOUD.md): a free cloud host wipes the tribe's files when it sleeps or restarts. Every member's
// browser keeps a signed copy of what they can see, and whoever comes back first puts the tribe back; later arrivals
// add what they have (their DMs, newer messages). Nobody re-joins: members.json comes back with the token hashes.
//
//   GET  /api/cloud/snapshot      a member's copy: tribe files + public chat + their own DMs, each file sealed
//   POST /api/cloud/restore {files, sigs}  only while the tribe is empty (a fresh boot); every seal is checked
//   POST /api/cloud/merge   {files, sigs}  a signed-in member adds what the server is missing (JSONL lines by id)
//
// Seals are HMAC-SHA256 with a key made from TRIBE_SETUP_CODE, which lives in the host's dashboard and survives restarts,
// so nobody can edit a copy (e.g. make themselves host). Without a fixed setup code, cloud save is off.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TEXT = /\.(json|jsonl|md|txt|csv)$/i;
const SKIP = /^(\.git|node_modules|repo|repos|workspace|worktrees|uploads|media|packs|\.cache|\.explore|thumbs)(\/|$)/;
const SECRET = /(^|\/)\.tribe\/(.*secret.*|secrets\/.*|github\.json|oauth\.json|webpush.*|vapid.*|notify.*|push.*)$/i;   // never in anyone's copy
const SAFE = /^[A-Za-z0-9._\-/]{1,200}$/;
const MAX_FILE = 400 * 1024, MAX_TOTAL = 1800 * 1024, JSONL_KEEP = 1500;   // fits a browser's localStorage

module.exports = function cloudsave({ root, key, log = () => {} }) {
  const enabled = !!key;
  const K = enabled ? crypto.createHash('sha256').update('tribecode-cloudsave\n' + key).digest() : null;
  const seal = (rel, text) => crypto.createHmac('sha256', K).update(rel + '\n' + text).digest('base64url');
  const sealOk = (rel, text, sig) => { if (typeof sig !== 'string') return false; const a = Buffer.from(seal(rel, text)), b = Buffer.from(sig); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const okPath = rel => typeof rel === 'string' && SAFE.test(rel) && !rel.split('/').some(s => s === '..' || s === '') && !SKIP.test(rel) && !SECRET.test(rel) && TEXT.test(rel);
  const abs = rel => path.join(root, rel);
  const isDm = rel => /^(.*\/)?chat\/dm-/.test(rel);
  const dmMine = (rel, id) => { const ch = path.basename(rel, '.jsonl'); return ch.startsWith(`dm-${id}-`) || ch.endsWith(`-${id}`); };
  // Flint's memory of a person (.tribe/flint/memory/<id>.json) is theirs alone: never in anyone else's copy (v0.27.1)
  const memOther = (rel, id) => { const m = /^\.tribe\/flint\/memory\/([^/]+)\.json$/.exec(rel); return !!m && m[1] !== id; };

  function walk(dir = '', out = []) {
    let ents = []; try { ents = fs.readdirSync(abs(dir), { withFileTypes: true }); } catch { return out; }
    for (const e of ents) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP.test(rel) && !e.name.startsWith('.git')) walk(rel, out); continue; }
      if (e.isFile() && okPath(rel)) out.push(rel);
    }
    return out;
  }
  const tail = text => { const lines = text.split('\n').filter(Boolean); return lines.length > JSONL_KEEP ? lines.slice(-JSONL_KEEP).join('\n') + '\n' : text; };

  // a member's copy: everything they may see, newest chat first in priority so the size cap drops old bulk, not today
  function snapshot(me) {
    if (!enabled) return { enabled: false };
    const files = {}, sigs = {}; let total = 0;
    const rels = walk().filter(r => (!isDm(r) || dmMine(r, me.id) || me.role === 'host') && !memOther(r, me.id))
      .sort((a, b) => (a.startsWith('.tribe/') ? -1 : 0) - (b.startsWith('.tribe/') ? -1 : 0));
    for (const rel of rels) {
      let text; try { const st = fs.statSync(abs(rel)); if (st.size > MAX_FILE * 4) continue; text = fs.readFileSync(abs(rel), 'utf8'); } catch { continue; }
      if (rel.endsWith('.jsonl')) text = tail(text);
      if (text.length > MAX_FILE || total + text.length > MAX_TOTAL) continue;
      files[rel] = text; sigs[rel] = seal(rel, text); total += text.length;
    }
    return { enabled: true, v: 1, at: new Date().toISOString(), files, sigs, bytes: total };
  }

  // "Save a copy" (any tribe, cloud or not): the same files a member may see, unsealed, to keep on their own device
  function copy(me) {
    const files = {}; let total = 0;
    for (const rel of walk().filter(r => !isDm(r) || dmMine(r, me.id))) {
      let text; try { const st = fs.statSync(abs(rel)); if (st.size > MAX_FILE * 4) continue; text = fs.readFileSync(abs(rel), 'utf8'); } catch { continue; }
      if (rel.startsWith('.tribe/') && !/^\.tribe\/(tribe|projects)\.json$/.test(rel)) continue;   // no member tokens or settings in a personal copy
      if (rel.endsWith('.jsonl')) text = tail(text);
      if (total + text.length > MAX_TOTAL * 4) break;
      files[rel] = text; total += text.length;
    }
    return { at: new Date().toISOString(), files, bytes: total };
  }
  function check(body) {
    if (!enabled) throw Object.assign(new Error('Cloud save needs TRIBE_SETUP_CODE set on the host.'), { status: 400 });
    const files = body && body.files, sigs = body && body.sigs;
    if (!files || typeof files !== 'object' || !sigs || typeof sigs !== 'object') throw Object.assign(new Error('nothing to restore'), { status: 400 });
    const good = {};
    for (const [rel, text] of Object.entries(files)) {
      if (!okPath(rel) || typeof text !== 'string' || text.length > MAX_FILE) continue;
      if (sealOk(rel, text, sigs[rel])) good[rel] = text;
    }
    return good;
  }
  const write = (rel, text) => { fs.mkdirSync(path.dirname(abs(rel)), { recursive: true }); const tmp = abs(rel) + '.cs-' + process.pid; fs.writeFileSync(tmp, text); fs.renameSync(tmp, abs(rel)); };
  const lineKey = l => { try { const o = JSON.parse(l); return o.id ? 'id:' + o.id : 'l:' + l; } catch { return 'l:' + l; } };
  const lineAt = l => { try { const o = JSON.parse(l); return Date.parse(o.at || o.ts || o.created || 0) || 0; } catch { return 0; } };

  // a fresh, empty tribe takes the whole copy
  function restore(body) {
    const good = check(body); let n = 0;
    for (const [rel, text] of Object.entries(good)) { write(rel, text); n++; }
    log(`Cloud save: restored ${n} file${n === 1 ? '' : 's'} from a member's copy`);
    return { restored: n };
  }
  // a running tribe adds what it lacks: missing files, and JSONL lines it doesn't have (by id), kept in time order.
  // members.json is unioned by id, so a guest who joined after the first restore comes back too.
  function merge(body) {
    const good = check(body); let added = 0, files = 0;
    for (const [rel, text] of Object.entries(good)) {
      let cur = null; try { cur = fs.readFileSync(abs(rel), 'utf8'); } catch {}
      if (cur == null) { write(rel, text); files++; continue; }
      if (rel.endsWith('.jsonl')) {
        const have = new Set(cur.split('\n').filter(Boolean).map(lineKey));
        const extra = text.split('\n').filter(Boolean).filter(l => !have.has(lineKey(l)));
        if (!extra.length) continue;
        const all = [...cur.split('\n').filter(Boolean), ...extra].sort((a, b) => lineAt(a) - lineAt(b));
        write(rel, all.join('\n') + '\n'); added += extra.length;
      } else if (rel === '.tribe/members.json' || rel === '.tribe/invites.json') {
        let a = [], b = []; try { a = JSON.parse(cur); b = JSON.parse(text); } catch { continue; }
        if (!Array.isArray(a) || !Array.isArray(b)) continue;
        const ids = new Set(a.map(x => x && (x.id || x.code)));
        const more = b.filter(x => x && !ids.has(x.id || x.code) && x.role !== 'host');   // never a second host
        if (more.length) { write(rel, JSON.stringify([...a, ...more], null, 2)); added += more.length; }
      }
    }
    if (added || files) log(`Cloud save: merged ${added} line${added === 1 ? '' : 's'} and ${files} file${files === 1 ? '' : 's'} from a member's copy`);
    return { added, files };
  }

  return { enabled, snapshot, copy, restore, merge, _seal: seal };
};
