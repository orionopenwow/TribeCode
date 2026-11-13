// Caps for folders the server fills on its own (harden, docs/REVIEW-2026-11-12.md): proof-of-work ZIPs, the Blender
// scripts, the inspiration thumbnail cache, screenshot versions, capture thumbnails and voice notes, Desktop exports.
//   prune(dir, { match, maxCount, maxBytes, keep, only, onRemove }) -> [removed names], oldest (mtime) first
//     match(name)  which files count (default: every regular file not starting with '.')
//     keep         a name never removed (the file just written)
//     only(name)   which of the counted files may be removed (default: all of them)
// Both limits are checked after the new file is in place, so a fresh write always survives when it fits on its own.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function files(dir, match) {
  let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (match ? !match(n) : n.startsWith('.')) continue;
    try { const st = fs.statSync(path.join(dir, n)); if (st.isFile()) out.push({ name: n, size: st.size, at: st.mtimeMs }); } catch {}
  }
  return out.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
}

function prune(dir, { match = null, maxCount = Infinity, maxBytes = Infinity, keep = null, only = null, onRemove = null } = {}) {
  const all = files(dir, match), removed = [];
  let count = all.length, bytes = all.reduce((s, f) => s + f.size, 0);
  for (const f of all) {
    if (count <= maxCount && bytes <= maxBytes) break;
    if (f.name === keep || (only && !only(f.name))) continue;
    try { fs.unlinkSync(path.join(dir, f.name)); } catch { continue; }
    if (onRemove) try { onRemove(f.name); } catch {}
    count--; bytes -= f.size; removed.push(f.name);
  }
  return removed;
}

// How much is there (for a clear "limit reached" message before writing).
function usage(dir, match) { const all = files(dir, match); return { count: all.length, bytes: all.reduce((s, f) => s + f.size, 0), files: all }; }

const envNum = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
const mb = n => `${Math.round(n / 1048576)} MB`;

module.exports = { prune, usage, files, envNum, mb };
