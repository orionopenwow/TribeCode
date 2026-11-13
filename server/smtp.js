// A minimal SMTP client for TribeCode's sign-in mail (feat/auth2, docs/ACCOUNTS.md › Email). Node's net and tls only.
//
//   send(cfg, { to, subject, text }) -> Promise<{ ok: true }>
//   cfg: { host, port, secure: 'starttls' | 'tls' | 'none', user?, pass?, from }
//
// 'starttls' (port 587, the default) upgrades with STARTTLS and refuses to go on without it; 'tls' (port 465) is TLS from the
// first byte; 'none' is plain text and is allowed only to this computer (a local relay, or the test's fake server).
// Certificates are always checked. AUTH (PLAIN, else LOGIN) is only ever sent over TLS or to this computer.
// Every header value is stripped of CR/LF, so a subject or address can't add headers; the body is dot-stuffed.
'use strict';
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const LOCAL = h => /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(String(h || ''));
const oneLine = s => String(s == null ? '' : s).replace(/[\r\n\u0000]+/g, ' ').trim();
const addr = s => { const a = oneLine(s); return /^[^\s@<>"(),;:]{1,64}@[A-Za-z0-9.-]{1,253}$/.test(a) ? a : ''; };
const fromAddr = s => { const m = /<([^<>]+)>\s*$/.exec(oneLine(s)); return addr(m ? m[1] : s); };
// RFC 2047 for non-ASCII subjects
const encWord = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

function validConfig(c) {
  if (!c || typeof c !== 'object') return 'set the SMTP server first';
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(String(c.host || '')) && !LOCAL(c.host)) return 'the SMTP host looks off';
  const port = Number(c.port); if (!Number.isInteger(port) || port < 1 || port > 65535) return 'the SMTP port looks off';
  if (!['starttls', 'tls', 'none'].includes(c.secure)) return 'pick STARTTLS, TLS or none';
  if (c.secure === 'none' && !LOCAL(c.host)) return 'plain SMTP (no TLS) only works with a server on this computer';
  if (!fromAddr(c.from)) return 'the From address looks off';
  return '';
}

function send(cfg, { to, subject, text }, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const bad = validConfig(cfg); if (bad) return reject(new Error(bad));
    const rcpt = addr(to); if (!rcpt) return reject(new Error('that email address looks off'));
    const from = fromAddr(cfg.from), port = Number(cfg.port), host = String(cfg.host);
    let sock, buf = '', waiting = null, secured = cfg.secure === 'tls', done = false;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); try { sock && sock.end(); } catch {} err ? reject(err) : resolve(val); };
    const timer = setTimeout(() => finish(new Error('the SMTP server did not answer in time')), timeoutMs);
    // one reply = lines until "NNN " (multi-line replies use "NNN-")
    let pending = []; const replies = [];
    const onData = d => {
      buf += d.toString('utf8');
      if (buf.length > 64 * 1024) return finish(new Error('the SMTP server sent too much'));
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        const x = /^(\d{3})([ -]?)(.*)$/.exec(line);
        if (!x) return finish(new Error('the SMTP server answered something odd'));
        pending.push(x[3]);
        if (x[2] !== '-') { const r = { code: Number(x[1]), lines: pending }; pending = []; const w = waiting; waiting = null; if (w) w(r); else replies.push(r); }
      }
    };
    const read = () => (replies.length ? Promise.resolve(replies.shift()) : new Promise(r => { waiting = r; }));
    const cmd = async (line, want) => { sock.write(line + '\r\n'); const r = await read(); if (!want.includes(Math.floor(r.code / 100) * 100) && !want.includes(r.code)) throw Object.assign(new Error(`the SMTP server said ${r.code} ${oneLine(r.lines.join(' ')).slice(0, 120)}`), { smtp: r.code }); return r; };
    const attach = s => { sock = s; s.on('data', onData); s.on('error', e => finish(new Error(`could not reach the SMTP server: ${e.code || e.message}`))); s.on('close', () => finish(new Error('the SMTP server closed the connection'))); };
    const tlsOpts = { host, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, minVersion: 'TLSv1.2' };

    (async () => {
      attach(secured ? tls.connect({ ...tlsOpts, port }) : net.connect({ host, port }));
      let r = await read(); if (r.code !== 220) throw new Error(`the SMTP server said ${r.code}`);
      const name = 'tribecode.local';
      r = await cmd(`EHLO ${name}`, [250]);
      if (!secured && cfg.secure === 'starttls') {
        if (!r.lines.some(l => /^STARTTLS\b/i.test(l))) throw new Error('the SMTP server does not offer STARTTLS: pick TLS (port 465) or another server');
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData); sock.removeAllListeners('close'); sock.removeAllListeners('error');
        const plain = sock; buf = ''; replies.length = 0;
        await new Promise((ok, no) => { const s = tls.connect({ ...tlsOpts, socket: plain }, ok); s.once('error', no); attach(s); });
        secured = true;
        r = await cmd(`EHLO ${name}`, [250]);
      }
      if (cfg.user) {
        if (!secured && !LOCAL(host)) throw new Error('refusing to send the SMTP password without TLS');
        const auth = (r.lines.find(l => /^AUTH\b/i.test(l)) || '').toUpperCase();
        if (/\bPLAIN\b/.test(auth) || !/\bLOGIN\b/.test(auth)) await cmd(`AUTH PLAIN ${Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass || ''}`, 'utf8').toString('base64')}`, [235]);
        else { await cmd('AUTH LOGIN', [334]); await cmd(Buffer.from(String(cfg.user)).toString('base64'), [334]); await cmd(Buffer.from(String(cfg.pass || '')).toString('base64'), [235]); }
      }
      await cmd(`MAIL FROM:<${from}>`, [250]);
      await cmd(`RCPT TO:<${rcpt}>`, [250]);
      await cmd('DATA', [354]);
      const domain = from.split('@')[1] || 'tribecode.local';
      const head = [`From: ${oneLine(cfg.from).includes('<') ? oneLine(cfg.from) : `TribeCode <${from}>`}`, `To: <${rcpt}>`, `Subject: ${encWord(oneLine(subject).slice(0, 200))}`,
        `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`, 'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', 'Auto-Submitted: auto-generated'];
      const body = String(text || '').replace(/\r?\n/g, '\r\n').split('\r\n').map(l => (l.startsWith('.') ? '.' + l : l)).join('\r\n');
      await cmd(`${head.join('\r\n')}\r\n\r\n${body}\r\n.`, [250]);
      try { sock.write('QUIT\r\n'); } catch {}
      finish(null, { ok: true });
    })().catch(e => finish(e));
  });
}

module.exports = { send, validConfig, LOCAL };
