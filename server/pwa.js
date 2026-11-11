// The share target without a service worker (docs/BROWSER-APP.md). The installed app's service worker (app/ui/sw.js)
// normally answers POST <scope>share-target itself and keeps the shared files on the device. When it isn't running yet
// (the very first share, a cleared browser), the POST reaches the server: the text fields come back as a redirect to
// ./?share-target=1&title=&text=&url= and files, which only the device should keep, are counted (&dropped=n) so the
// app can say "share them again". Nothing is stored here. Multipart is parsed by hand (no dependencies), 12 MB at most.
'use strict';

const MAX = 12 * 1024 * 1024;

module.exports = function makePwa() {
  const match = url => /^(\/m\/[^/]+)?\/share-target\/?$/.test(url.pathname);
  function read(req) {
    return new Promise(resolve => {
      const chunks = []; let size = 0, over = false;
      req.on('data', c => { size += c.length; if (size > MAX) { over = true; return; } chunks.push(c); });
      req.on('end', () => resolve(over ? null : Buffer.concat(chunks)));
      req.on('error', () => resolve(null));
    });
  }
  function fields(buf, type) {
    const out = { title: '', text: '', url: '', dropped: 0 };
    if (!buf) return out;
    if (/application\/x-www-form-urlencoded/i.test(type)) {
      const q = new URLSearchParams(buf.toString('utf8'));
      for (const k of ['title', 'text', 'url']) out[k] = q.get(k) || '';
      return out;
    }
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type || ''); if (!bm) return out;
    const parts = buf.toString('latin1').split('--' + (bm[1] || bm[2]).trim());
    for (const part of parts) {
      const i = part.indexOf('\r\n\r\n'); if (i < 0) continue;
      const head = part.slice(0, i), body = part.slice(i + 4).replace(/\r\n$/, '');
      const name = (/name="([^"]*)"/i.exec(head) || [])[1];
      if (!name) continue;
      if (/filename="/i.test(head)) { if (body.length) out.dropped++; continue; }
      if (name in out && name !== 'dropped') out[name] = Buffer.from(body, 'latin1').toString('utf8').slice(0, 4000);
    }
    return out;
  }
  async function shareTarget(req, res, url) {
    const f = fields(await read(req), req.headers['content-type']);
    const base = url.pathname.replace(/share-target\/?$/, '');
    const q = new URLSearchParams({ 'share-target': '1' });
    for (const k of ['title', 'text', 'url']) if (f[k]) q.set(k, f[k]);
    if (f.dropped) q.set('dropped', String(f.dropped));
    res.writeHead(303, { Location: `${base}?${q}`, 'Cache-Control': 'no-store' });
    res.end();
  }
  return { match, shareTarget };
};
