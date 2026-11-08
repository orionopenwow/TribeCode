// Tribe backup: the whole tribe folder as one .tar.gz, streamed (zero dependencies).
// What's in it: chat (JSONL + media), tasks, docs, proposals, decisions, calendar, bugs, brain notes, project
// folders (workspaces/ with their git history), members/invites/devices (tokens only as SHA-256 hashes).
// What's left out: .tribe/secrets/ (AI keys, the GIPHY key and per-member GitHub tokens never leave the host),
// .tribe/oauth.json (the host's Discord/GitHub/Google sign-in client secrets: set them up again after a restore),
// node_modules, temp files.
// Restore: stop TribeCode, extract the archive into a folder, start with --dir <that folder> (docs/DATA.md).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SKIP_DIR = new Set(['node_modules', '.cache']);
const skip = rel => rel === '.tribe/secrets' || rel.startsWith('.tribe/secrets/') || rel === '.tribe/oauth.json' || /\.\d+\.tmp$/.test(rel);   // oauth.json: fix/security-review

function octal(n, len) { return n.toString(8).padStart(len - 1, '0') + '\0'; }
function header(name, size, mtime, type = '0', mode = 0o644) {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write(octal(mode, 8), 100); h.write(octal(0, 8), 108); h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124); h.write(octal(Math.floor(mtime / 1000), 12), 136);
  h.fill(' ', 148, 156); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
  let sum = 0; for (const b of h) sum += b;
  h.write(octal(sum, 7) + ' ', 148);
  return h;
}
const pad = n => Buffer.alloc((512 - (n % 512)) % 512);

// Every file under root (relative, forward slashes), skipping secrets and symlinks.
function* walk(root, rel = '') {
  let entries; try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (skip(r)) continue;
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) yield* walk(root, r); }
    else if (e.isFile()) yield r;
  }
}

// Writes a gzipped tar of `root` to the writable `out`; resolves with { files, bytes }.
function stream(root, out, prefix = 'tribe') {
  const gz = zlib.createGzip({ level: 6 });
  gz.pipe(out);
  let files = 0, bytes = 0;
  const write = buf => new Promise(r => (gz.write(buf) ? r() : gz.once('drain', r)));
  return (async () => {
    for (const rel of walk(root)) {
      let st; try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
      const name = `${prefix}/${rel}`;
      if (Buffer.byteLength(name) > 99) {   // GNU long name entry: tar, bsdtar (macOS, Windows) and 7-Zip read it
        const nb = Buffer.from(name + '\0');
        await write(header('././@LongLink', nb.length, Date.now(), 'L')); await write(nb); await write(pad(nb.length));
      }
      await write(header(name, st.size, st.mtimeMs));
      // Exactly st.size bytes, even if the file grows (a chat line arriving) or shrinks while we read it.
      let got = 0;
      if (st.size) await new Promise(resolve => {
        const rs = fs.createReadStream(path.join(root, rel), { start: 0, end: st.size - 1 });
        rs.on('data', c => { got += c.length; if (!gz.write(c)) { rs.pause(); gz.once('drain', () => rs.resume()); } });
        rs.on('end', resolve); rs.on('error', resolve);
      });
      if (got < st.size) await write(Buffer.alloc(st.size - got));
      await write(pad(st.size));
      files++; bytes += st.size;
    }
    await write(Buffer.alloc(1024));
    await new Promise(r => gz.end(r));
    return { files, bytes };
  })();
}

module.exports = { stream, walk };
