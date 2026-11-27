// Private messages (feat/p12-e2ee): end-to-end encryption for DMs between two people.
//
//   Keys     each device makes its own P-256 key pair with WebCrypto. The private half is created non-extractable and
//            kept in this browser's IndexedDB: no code (ours included) can read it out, so it is never in an export,
//            a backup or a copy. The public half goes to the tribe (POST /api/keys) so others can encrypt to it.
//   Sealing  each message gets a fresh random AES-GCM key. The words are encrypted with it, and that key is sealed once
//            per device of both people (ECDH -> HKDF -> AES-GCM), so every device either person has can open it, and
//            nothing else can: the server and the host's computer only ever hold { iv, ct, to: [{ m, d, w }] }.
//   Honest   a device that joined later has no sealed copy of older messages, so it says so instead of guessing.
//            AI helper chats are never sealed (the helper must read them), and they say that too.
//
// Public: window.TribeE2E = { supported, ready, publish, status(ch), seal(ch, body), view(m, ch), open(m, ch),
//                             headHtml(withId), check(withId), safety(withId), withOf(ch) }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const subtle = window.crypto && window.crypto.subtle;
  const supported = !!(subtle && window.indexedDB && window.TextEncoder);
  const TE = supported ? new TextEncoder() : null, TD = supported ? new TextDecoder() : null;
  const T = (s, v) => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : '')));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (n, s = 14) => (window.TribeIcons ? window.TribeIcons.svg(n, s, 'pv-i') : '');
  const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rnd = n => window.crypto.getRandomValues(new Uint8Array(n));
  const rid = () => Array.from(rnd(12), x => 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_'[x & 63]).join('');
  const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

  const st = () => (C() && C().state()) || {};
  const meId = () => (st().me || {}).id || '';
  const members = () => st().members || [];
  const memberOf = id => members().find(m => m.id === id) || null;
  const nameOf = id => (memberOf(id) || {}).name || 'them';
  const chanWith = id => 'dm-' + [meId(), id].sort().join('-');
  const withOf = ch => { if (typeof ch !== 'string' || !ch.startsWith('dm-')) return null; const m = members().find(x => x.id !== meId() && chanWith(x.id) === ch); return m ? m.id : null; };

  // ---------- this device's key (IndexedDB, non-extractable) ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('tribecode-e2e', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction('keys', mode), q = fn(tx.objectStore('keys')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
  }
  const slot = () => 'dev:' + C().base() + ':' + meId();
  let mine = null, making = null;
  async function device() {
    if (!supported || !meId()) return null;
    if (mine && mine.slot === slot()) return mine;
    if (making) return making;
    making = (async () => {
      const k = slot();
      let rec = await idbDo('readonly', s => s.get(k)).catch(() => null);
      if (!rec || !rec.priv || !rec.pub) {
        const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);   // false: the private key can never be exported
        rec = { d: rid(), priv: kp.privateKey, pub: b64(await subtle.exportKey('raw', kp.publicKey)), at: Date.now() };
        await idbDo('readwrite', s => s.put(rec, k));
      }
      mine = { d: rec.d, priv: rec.priv, pub: rec.pub, slot: k };
      return mine;
    })().catch(e => { console.warn('private messages: no device key', e); return null; }).finally(() => { making = null; });
    return making;
  }

  // ---------- the tribe's public keys (cached: public keys are not secret) ----------
  const KC = () => 'tribecode.e2e.keys:' + C().base();
  let kc = null;
  const kcGet = () => { if (kc) return kc; try { kc = JSON.parse(localStorage.getItem(KC()) || '{}') || {}; } catch { kc = {}; } return kc; };
  const kcSave = () => { try { localStorage.setItem(KC(), JSON.stringify(kc || {})); } catch {} };
  const cached = id => (kcGet()[id] || []);
  async function fetchKeys(ids) {
    ids = [...new Set(ids.filter(Boolean))]; if (!ids.length || !C().connected()) return false;
    try {
      const r = await C().api('/keys?ids=' + encodeURIComponent(ids.join(',')));
      const k = kcGet(); for (const id of ids) k[id] = (r.keys && r.keys[id]) || []; kcSave(); return true;
    } catch { return false; }
  }
  let published = '';
  async function publish() {
    const d = await device(); if (!d || !C().connected()) return false;
    if (published === d.slot + d.pub) return true;
    try { await C().api('/keys', { method: 'POST', body: { d: d.d, pub: d.pub } }); published = d.slot + d.pub; await fetchKeys([meId()]); return true; } catch { return false; }
  }
  async function ready() { await publish(); return device(); }

  // ---------- state of one conversation ----------
  //   'helper'   an AI helper chat: never sealed
  //   'private'  both people have keys: new messages are sealed
  //   'waiting'  the other person has no key yet: messages go as before
  //   'nodevice' this browser can't make or keep a key
  function status(ch) {
    const w = withOf(ch); if (!w) return 'plain';
    const o = memberOf(w); if (o && o.role === 'agent') return 'helper';
    if (!supported || (mine === null && !making && triedDevice)) return 'nodevice';
    const active = cached(w).filter(x => x.active !== false);
    return active.length ? 'private' : 'waiting';
  }
  let triedDevice = false;

  // ---------- sealing ----------
  const kekCache = new Map();
  async function kek(priv, pub, ch, info) {
    const key = pub + '|' + ch + '|' + info; if (kekCache.has(key)) return kekCache.get(key);
    const p = (async () => {
      const pk = await subtle.importKey('raw', unb64(pub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const bits = await subtle.deriveBits({ name: 'ECDH', public: pk }, priv, 256);
      const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
      return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: TE.encode(ch), info: TE.encode('tribecode-dm-v1|' + info) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })();
    kekCache.set(key, p); p.catch(() => kekCache.delete(key));
    return p;
  }
  const aadOf = (ch, by, dev) => TE.encode(`tribecode-dm-v1|${ch}|${by}|${dev}`);
  const plain = new Map();   // message id or client id -> words this device already knows (memory only, never stored)

  // seal(ch, body) -> body to queue. A plain body comes back for helper chats and while the other person has no key;
  // when sealing should happen but can't, it throws (the message is marked "Didn't send" instead of going out plain).
  async function seal(ch, body) {
    const w = withOf(ch); if (!w) return body;
    const o = memberOf(w); if (o && o.role === 'agent') return body;
    const d = await ready(); triedDevice = true;
    await fetchKeys([w, meId()]);
    const theirs = cached(w).filter(x => x.active !== false);
    if (!theirs.length) return body;
    if (!d) throw new Error("this device can't lock private messages");
    const me = meId(), ours = cached(me).filter(x => x.active !== false);
    if (!ours.some(x => x.d === d.d)) ours.push({ d: d.d, pub: d.pub });
    const text = String(body.text || '');
    const mk = rnd(32), key = await subtle.importKey('raw', mk, 'AES-GCM', false, ['encrypt']), iv = rnd(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(ch, me, d.d) }, key, TE.encode(JSON.stringify({ t: text })));
    const to = [];
    for (const [m, list] of [[w, theirs], [me, ours]]) for (const x of list) {
      const k = await kek(d.priv, x.pub, ch, `${me}|${d.d}|${m}|${x.d}`), wiv = rnd(12);
      const sealed = await subtle.encrypt({ name: 'AES-GCM', iv: wiv, additionalData: aadOf(ch, me, d.d) }, k, mk);
      to.push({ m, d: x.d, w: b64(cat(wiv, new Uint8Array(sealed))) });
    }
    const out = { ...body, text: '', enc: { v: 1, from: d.d, iv: b64(iv), ct: b64(ct), to } };
    delete out.replyTo;   // a reply's quote would carry the other message's words to the server
    if (body.cid) plain.set('cid:' + body.cid, text);
    return out;
  }

  // ---------- opening ----------
  //   view(m) -> { s: 'ok', text } | { s: 'wait' } | { s: 'nokey' } | { s: 'bad' }   (sync; 'wait' means open() is running)
  const views = new Map(), opening = new Map();
  function view(m, ch) {
    if (!m || !m.enc) return null;
    if (views.has(m.id)) return views.get(m.id);
    if (m.cid && plain.has('cid:' + m.cid) && m.by === meId()) { const v = { s: 'ok', text: plain.get('cid:' + m.cid) }; views.set(m.id, v); return v; }
    return { s: 'wait' };
  }
  function open(m, ch) {
    if (!m || !m.enc) return Promise.resolve(null);
    if (views.has(m.id)) return Promise.resolve(views.get(m.id));
    if (opening.has(m.id)) return opening.get(m.id);
    const p = (async () => {
      if (!supported) return { s: 'nokey' };
      const d = await device(); triedDevice = true; if (!d) return { s: 'nokey' };
      const me = meId(), e = m.enc, mineCopy = (e.to || []).find(t => t.m === me && t.d === d.d);
      if (!mineCopy) return { s: 'nokey' };
      let from = cached(m.by).find(x => x.d === e.from);
      if (!from) { await fetchKeys([m.by]); from = cached(m.by).find(x => x.d === e.from); }
      if (!from) return { s: 'bad' };
      try {
        const k = await kek(d.priv, from.pub, ch, `${m.by}|${e.from}|${me}|${d.d}`), raw = unb64(mineCopy.w), aad = aadOf(ch, m.by, e.from);
        const mk = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: aad }, k, raw.slice(12));
        const key = await subtle.importKey('raw', mk, 'AES-GCM', false, ['decrypt']);
        const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv), additionalData: aad }, key, unb64(e.ct));
        const j = JSON.parse(TD.decode(pt));
        return { s: 'ok', text: String(j.t || '') };
      } catch { return { s: 'bad' }; }
    })().then(v => { views.set(m.id, v); opening.delete(m.id); return v; });
    opening.set(m.id, p);
    return p;
  }
  // The words shown in place of a message this device can't open (plain, honest, no guessing).
  function lockedLine(v) {
    if (!v || v.s === 'wait') return T('Unlocking…');
    if (v.s === 'nokey') return T("Sent before this device could read private messages, so it can't be opened here.");
    return T("This message couldn't be opened. It may have been changed on the way.");
  }

  // ---------- the safety number ----------
  async function safety(withId) {
    await fetchKeys([withId, meId()]);
    const rows = [];
    for (const id of [meId(), withId]) for (const x of cached(id).filter(y => y.active !== false)) rows.push(id + ':' + x.pub);
    if (!rows.length) return '';
    const h = new Uint8Array(await subtle.digest('SHA-256', TE.encode(rows.sort().join('\n'))));
    const out = [];
    for (let i = 0; i < 10; i++) out.push(String(((h[i * 3] << 16) | (h[i * 3 + 1] << 8) | h[i * 3 + 2]) % 100000).padStart(5, '0'));
    return out.join(' ');
  }

  // ---------- the header line + the "check" sheet ----------
  function headHtml(withId) {
    const s = status(chanWith(withId)), name = nameOf(withId);
    if (s === 'helper') return `<button class="dm-lock pv-off" id="dm-priv" data-pv="helper" title="${esc(T('What is not private'))}">${ico('info')}<span>${esc(T('Not private: {name} is an AI helper. It reads this chat to answer, and its AI provider sees it too.', { name }))}</span></button>`;
    if (s === 'private') return `<button class="dm-lock pv-on" id="dm-priv" data-pv="private" title="${esc(T("Check it's really {name}", { name }))}">${ico('lock')}<span>${esc(T('Private: only you and {name} can read this', { name }))}</span></button>`;
    if (s === 'nodevice') return `<button class="dm-lock pv-off" id="dm-priv" data-pv="nodevice">${ico('info')}<span>${esc(T("This device can't lock messages, so new messages here are not private."))}</span></button>`;
    return `<button class="dm-lock pv-off" id="dm-priv" data-pv="waiting">${ico('info')}<span>${esc(T('Not private yet: messages lock once {name} opens the app again.', { name }))}</span></button>`;
  }
  async function check(withId) {
    const name = nameOf(withId), s = status(chanWith(withId));
    const num = s === 'private' ? await safety(withId).catch(() => '') : '';
    const body = `
      ${num ? `<section class="pv-sec"><p class="pv-p">${esc(T('Compare these numbers with {name} in person or on a call. If they match, nobody is in the middle. They change when either of you adds a device.', { name }))}</p>
        <p class="pv-num" id="pv-num" aria-label="${esc(T('Safety number'))}">${num.split(' ').map(g => `<span>${g}</span>`).join('')}</p></section>` : ''}
      <section class="pv-sec"><h4 class="eyebrow">${esc(T('On a new device'))}</h4>
        <p class="pv-p" id="pv-newdev">${esc(T("Older private messages stay locked on a new device. Moving them over from an old device isn't built yet, so keep the old device if you need them."))}</p></section>
      <section class="pv-sec"><h4 class="eyebrow">${esc(T('What is not private'))}</h4>
        <ul class="pv-list" id="pv-notenc"><li>${esc(T('Channels, names, who talks to whom, and when.'))}</li><li>${esc(T('Pictures, voice notes and files sent in a private chat.'))}</li><li>${esc(T('Chats with an AI helper.'))}</li></ul></section>`;
    const title = s === 'private' ? T("Check it's really {name}", { name }) : T('Private message');
    if (window.TribeUI && window.TribeUI.sheet) return window.TribeUI.sheet({ kind: 'steps', eyebrow: 'Private', title, body, id: 'pv-sheet' });
    return null;
  }

  // Keys are made and published as soon as this browser knows who it is, so the other person can lock messages to it.
  function boot() {
    if (!supported || !C()) return;
    C().on('status', s => { if (s && s.status === 'online') setTimeout(() => { publish().then(() => { triedDevice = true; }); }, 300); });
    C().on('members', () => {});
    if (C().connected()) publish().then(() => { triedDevice = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);

  window.TribeE2E = { supported, ready, publish, device, status, seal, view, open, lockedLine, headHtml, check, safety, withOf, fetchKeys,
    peekPlain: cid => plain.get('cid:' + cid) };
})();
