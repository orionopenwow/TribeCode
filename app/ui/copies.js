// Every friend keeps a copy (p12, docs/COPIES.md).
//
// Each member's TribeCode keeps a copy of what they can see in the tribe: the projects list, the website and app
// designs, docs, tasks and chat. tribe.js asks this module after every GET it may keep (keep()) and, when the computer
// that runs the tribe can't be reached, answers from the copy instead (read()), so it can be read offline. Edits made
// offline wait (the outbox, the designers' "on this device" drafts) and go when the tribe is back.
//
// When both sides changed a design, merge3() puts the two together block by block (a block is anything with an id: a
// page, a section, a screen, a widget). Only when the same block changed on both sides does a person choose, in one
// plain sheet: "Two people changed this · Keep mine / Keep theirs / Keep both".
//
// Never kept: anything about sign-ins, keys, tokens, invites or someone else's private messages (NEVER below).
//
// Send and get (tribestatus.js draws the control): pending() counts what waits to send, send() sends it now, get()
// fetches the latest of the open project, fromGitHub() fills the copy from the GitHub backup when nobody's computer is
// on (public repos; a private one says so plainly).
//
// Public: window.TribeCopies = { copyable, keep, read, peek, touch, setBase, getBase, merge3, choose, mergeOrAsk,
//                                pending, send, get, lastContact, history, fromGitHub, on }
(function (root) {
  'use strict';
  const C = () => root.TribeClient;
  const T = (s, v) => { let t = root.TribeI18n && root.TribeI18n.t ? root.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k); } } catch {} return out; },
  };
  let listeners = [];
  const emit = (ev, d) => listeners.forEach(fn => { try { fn(ev, d); } catch {} });
  const on = fn => { listeners.push(fn); return () => { listeners = listeners.filter(f => f !== fn); }; };

  // ---------- the read-through copy ----------
  const COPYABLE = /^\/(projects|members|tasks|messages(\?[^#]*)?|docs(\/[\w.%-]+)?|board|plan|projects\/[\w-]+\/(app-config|site-config|sync|tasks|docs))(\?[^#]*)?$/;
  const NEVER = /token|secret|auth|oauth|invite|password|\bkey|\/dm|cloud\/|backup|github/i;
  const copyable = path => typeof path === 'string' && path.length < 300 && COPYABLE.test(path) && !NEVER.test(path.replace(/\/sync(\?|$)/, ''));
  const server = () => { try { return C().base(); } catch { return ''; } };
  const PFX = () => 'tribecode.copy:' + server() + '|';
  const keyOf = (srv, pid, path) => 'tribecode.copy:' + srv + '|' + (pid || '') + '|' + path;
  const MAX_ONE = 400000, MAX_ALL = 80;
  function keep(srv, pid, path, data) {
    if (!copyable(path) || data == null) return;
    const text = JSON.stringify({ at: Date.now(), data }); if (text.length > MAX_ONE) return;
    const k = keyOf(srv, pid, path);
    try { localStorage.setItem(k, text); }
    catch { trim(srv, 10); try { localStorage.setItem(k, text); } catch {} }
    touch(); if (Math.random() < 0.05) trim(srv, MAX_ALL);
  }
  function trim(srv, n) {   // the oldest copies go first when there are too many or the browser is full
    const ks = store.keys('tribecode.copy:' + srv + '|').map(k => [k, (store.get(k, {}) || {}).at || 0]).sort((a, b) => b[1] - a[1]);
    ks.slice(n).forEach(([k]) => store.set(k, null));
  }
  const mark = (data, at) => {
    const out = Array.isArray(data) ? data.slice() : data && typeof data === 'object' ? { ...data } : data;
    if (out && typeof out === 'object') { Object.defineProperty(out, '_fromCopy', { value: true }); Object.defineProperty(out, '_copyAt', { value: at || 0 }); }
    return out;
  };
  function read(srv, pid, path) { if (!copyable(path)) return null; const c = store.get(keyOf(srv, pid, path), null); return c && c.data != null ? mark(c.data, c.at) : null; }
  const peek = (pid, path) => read(server(), pid, path);
  const touch = () => { store.set('tribecode.copies.contact:' + server(), Date.now()); };
  const lastContact = () => store.get('tribecode.copies.contact:' + server(), 0) || 0;

  // ---------- the version both sides started from (by rev), so a merge knows what each side changed ----------
  const BKEY = k => 'tribecode.copies.base:' + server() + '|' + k;
  // the last few versions are kept, so changes made away from an older one still find where they started
  const bases = k => { const b = store.get(BKEY(k), null); return Array.isArray(b) ? b : b && b.doc ? [b] : []; };
  const setBase = (k, rev, doc) => { if (!doc) return; const l = bases(k).filter(x => (x.rev || 0) !== (rev || 0)); l.push({ rev: rev || 0, doc }); store.set(BKEY(k), l.slice(-4)); };
  const getBase = (k, rev) => { const l = bases(k); const b = rev == null ? l[l.length - 1] : l.find(x => (x.rev || 0) === (rev || 0)); return b ? b.doc : null; };

  // ---------- the merge ----------
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const idList = a => Array.isArray(a) && a.length > 0 && a.every(x => isObj(x) && x.id != null);
  const nameOf = (o, fallback) => {
    if (!isObj(o)) return fallback;
    const pr = isObj(o.props) ? o.props : {}, words = x => (typeof x === 'string' && x.trim() ? x.trim() : '');
    const n = words(o.name) || words(o.title) || words(o.label) || words(o.heading) || words(pr.title) || words(pr.heading) || words(pr.name) || words(pr.text) || words(o.text) || o.type || o.kind || o.id;
    const kind = o.type && n !== o.type ? `${String(o.type).replace(/[-_]/g, ' ')}: ` : '';
    return (kind + String(n || fallback)).slice(0, 70);
  };
  // merge3(base, mine, theirs, decisions?) -> { value, conflicts: [{ key, label, both, mine, theirs }] }
  // decisions: { [key]: 'mine' | 'theirs' | 'both' } from choose(). Without one, a conflict keeps theirs for now.
  function merge3(b, m, t, decisions) {
    const conflicts = [], dec = decisions || {};
    const add = (key, label, both, mv, tv) => { if (!conflicts.some(c => c.key === key)) conflicts.push({ key, label, both, mine: mv, theirs: tv }); };
    function walk(b, m, t, path, block) {
      if (same(m, t)) return m;
      if (same(m, b)) return t;
      if (same(t, b)) return m;
      if (isObj(m) && isObj(t)) {
        const out = {}, bb = isObj(b) ? b : {};
        const keys = Array.from(new Set([...Object.keys(t), ...Object.keys(m)]));
        for (const k of keys) { const v = walk(bb[k], m[k], t[k], path + '/' + k, block); if (v !== undefined) out[k] = v; }
        return out;
      }
      if ((idList(m) || (Array.isArray(m) && !m.length)) && (idList(t) || (Array.isArray(t) && !t.length)) && (b == null || idList(b) || (Array.isArray(b) && !b.length))) return list(b || [], m, t, path);
      const key = block ? block.key : path, label = block ? block.label : path.split('/').filter(Boolean).slice(-1)[0] || T('the design');
      const d = dec[key];
      if (d === 'mine' || d === 'both') return m;
      if (d !== 'theirs') add(key, label, false, m, t);
      return t;
    }
    // a list of blocks: kept in their order, with mine's new blocks put after the block they followed in mine
    function list(b, m, t, path) {
      const bi = new Map(b.map(x => [String(x.id), x])), mi = new Map(m.map(x => [String(x.id), x])), ti = new Map(t.map(x => [String(x.id), x]));
      const out = [];
      for (const x of t) {
        const id = String(x.id), key = path + '#' + id, label = nameOf(x, id);
        if (!mi.has(id)) {
          if (!bi.has(id)) { out.push(x); continue; }                       // new on their side
          if (same(bi.get(id), x)) continue;                                  // I removed it and they left it alone
          const d = dec[key]; if (d === 'mine') continue; if (!d) add(key, label, false, undefined, x);   // I removed it, they changed it
          out.push(x); continue;
        }
        const mv = mi.get(id), bv = bi.get(id);
        if (bv && !same(mv, x) && !same(mv, bv) && !same(x, bv)) {           // both changed this block
          const d = dec[key];
          if (d === 'mine') { out.push(mv); continue; }
          if (d === 'theirs') { out.push(x); continue; }
          if (d === 'both') { out.push(x); out.push({ ...mv, id: copyId(id, ti, mi) }); continue; }
          const inner = []; const v = walkInner(bv, mv, x, key, label, inner);
          if (!inner.length) { out.push(v); continue; }                      // different parts of it: both kept
          add(key, label, true, mv, x); out.push(x); continue;
        }
        out.push(walk(bv, mv, x, key, { key, label }));
      }
      // blocks only on my side: new ones go in; ones they removed come back only if I changed them
      m.forEach((x, i) => {
        const id = String(x.id); if (ti.has(id)) return;
        const key = path + '#' + id, label = nameOf(x, id);
        if (bi.has(id)) {
          if (same(bi.get(id), x)) return;                                    // they removed it; I hadn't touched it
          const d = dec[key]; if (d === 'theirs') return; if (!d) { add(key, label, false, x, undefined); return; }
        }
        let at = out.length;
        for (let j = i - 1; j >= 0; j--) { const p = out.findIndex(o => String(o.id) === String(m[j].id)); if (p >= 0) { at = p + 1; break; } }
        if (i === 0) at = 0;
        out.splice(at, 0, x);
      });
      return out;
    }
    function walkInner(b, m, t, key, label, inner) {   // the same block changed on both sides: did they touch the same field?
      const saved = conflicts.length, v = walk(b, m, t, key, { key, label });
      if (conflicts.length > saved) {   // a smaller block inside asks for itself; a field of this very block asks here
        const got = conflicts.splice(saved);
        got.forEach(c => (c.key === key ? inner.push(c) : conflicts.push(c)));
      }
      return v;
    }
    const value = walk(b, m, t, '', null);
    return { value, conflicts };
  }
  const copyId = (id, a, b) => { let n = 2, v = id + '-' + n; while (a.has(v) || b.has(v)) v = id + '-' + (++n); return v; };

  // ---------- the choice: one sheet, one row per thing both people changed ----------
  // -> Promise<{ [key]: 'mine'|'theirs'|'both' } | null>   (null: closed without choosing; nothing changes)
  function choose(conflicts, o = {}) {
    const UI = root.TribeUI; if (!UI || !UI.sheet || !conflicts.length) return Promise.resolve(null);
    return new Promise(res => {
      let done = false; const dec = {};
      const end = v => { if (done) return; done = true; sh.close(); res(v); };
      const row = (c, i) => `<div class="cp-row" data-cp="${i}"><b>${esc(c.label)}</b><span class="cp-btns">
        <button type="button" class="btn sm" data-pick="mine">${esc(T('Keep mine'))}</button>
        <button type="button" class="btn sm" data-pick="theirs">${esc(T('Keep theirs'))}</button>
        ${c.both ? `<button type="button" class="btn sm" data-pick="both">${esc(T('Keep both'))}</button>` : ''}</span></div>`;
      const who = o.by ? T('{name} changed it too.', { name: o.by }) : T('Someone changed it too.');
      const sh = UI.sheet({ id: 'cp-choose', kind: 'decision', eyebrow: o.what || T('Your copy'), title: T('Two people changed this'),
        body: `<p>${esc(T('Everything else was put together by itself.'))} ${esc(who)}</p><div class="cp-rows">${conflicts.map(row).join('')}</div>`,
        foot: `<button type="button" class="btn" id="cp-later">${esc(T('Decide later'))}</button><button type="button" class="btn primary" id="cp-done" disabled>${esc(T('Done'))}</button>`,
        onClose: () => end(null) });
      const done1 = sh.el.querySelector('#cp-done');
      sh.el.querySelectorAll('.cp-row').forEach(r => r.addEventListener('click', e => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        const c = conflicts[+r.dataset.cp]; dec[c.key] = b.dataset.pick;
        r.querySelectorAll('[data-pick]').forEach(x => x.classList.toggle('primary', x === b)); r.dataset.picked = b.dataset.pick;
        done1.disabled = conflicts.some(cc => !dec[cc.key]);
      }));
      if (conflicts.length === 1) sh.el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => setTimeout(() => end({ ...dec }), 0)));
      done1.onclick = () => end({ ...dec });
      sh.el.querySelector('#cp-later').onclick = () => end(null);
    });
  }
  // The whole step for a design: merge, ask only if needed. -> Promise<{ value, asked } | null>
  async function mergeOrAsk(base, mine, theirs, o = {}) {
    if (base == null) return null;
    const first = merge3(base, mine, theirs);
    if (!first.conflicts.length) return { value: first.value, asked: false };
    const dec = await choose(first.conflicts, o); if (!dec) return null;
    return { value: merge3(base, mine, theirs, dec).value, asked: true };
  }

  // ---------- send and get ----------
  const APP_UNSENT = 'tribecode.appcreator.unsent.', SITE_DRAFT = 'tribecode.sitedesigner.draft.';
  function pending() {
    const c = C() || {}, list = [];
    (c.outbox ? c.outbox() : []).forEach(it => list.push({ kind: it.kind || 'action', label: it.label || '' }));
    store.keys(APP_UNSENT).forEach(k => { const v = store.get(k, null); if (v && v.doc) list.push({ kind: 'app', pid: k.slice(APP_UNSENT.length) }); });
    store.keys(SITE_DRAFT).forEach(k => { const pid = k.slice(SITE_DRAFT.length); if (pid === 'local') return; const v = store.get(k, null); if (v && v.dirty) list.push({ kind: 'site', pid }); });
    return list;
  }
  let sending = null;
  function send() {
    if (sending) return sending;
    sending = (async () => {
      const c = C(); if (!c) return 0;
      if (c.flush) await c.flush();
      const SD = root.TribeSiteDesigner; if (SD && SD.flush) { try { await SD.flush(); } catch {} }
      const AC = root.TribeAppCreator; if (AC && AC.flush) { try { await AC.flush(); } catch {} }
      // App designs made offline with App Creator closed: sent with the version they started from. If someone changed
      // it since, App Creator puts the two together the next time it opens (it asks only about the same block).
      for (const k of store.keys(APP_UNSENT)) {
        const v = store.get(k, null), pid = k.slice(APP_UNSENT.length); if (!v || !v.doc || (AC && AC.isOpen && AC.isOpen(pid))) continue;
        try { const r = await c.api(`/projects/${encodeURIComponent(pid)}/app-config`, { method: 'PUT', body: { config: v.doc, base: v.base || 0 } }); setBase('app:' + pid, r.rev, v.doc); store.set(k, null); }
        catch (e) {
          if (!e || e.status !== 409) continue;
          // someone changed it since: different blocks go together by themselves; the same block waits for App Creator
          const b = getBase('app:' + pid, v.base || 0), d = e.data || {};
          const m = b && d.config ? merge3(b, v.doc, d.config) : null;
          if (m && !m.conflicts.length) {
            try { const r = await c.api(`/projects/${encodeURIComponent(pid)}/app-config`, { method: 'PUT', body: { config: m.value, base: d.rev || 0 } }); setBase('app:' + pid, r.rev, m.value); store.set(k, null); emit('merged', { kind: 'app', pid }); continue; } catch {}
          }
          emit('needs-look', { kind: 'app', pid });
        }
      }
      emit('sent', pending().length); return pending().length;
    })().finally(() => { sending = null; });
    return sending;
  }
  async function get() {
    const c = C(); if (!c || !c.api) return false;
    const pid = c.project ? c.project() : '';
    const paths = ['/projects', ...(pid ? [`/projects/${encodeURIComponent(pid)}/site-config`, `/projects/${encodeURIComponent(pid)}/app-config`, `/projects/${encodeURIComponent(pid)}/sync`] : [])];
    const r = await Promise.all(paths.map(p => c.api(p).then(d => !d._fromCopy, () => false)));
    const ok = r.some(Boolean); if (ok) { touch(); emit('got', { pid }); try { dispatchEvent(new CustomEvent('tribe:copies-got', { detail: { pid } })); } catch {} }
    return ok;
  }
  async function history() {
    const c = C(); if (!c || !c.api) return [];
    try { const r = await c.api('/copies/log'); return Array.isArray(r.log) ? r.log : []; } catch { return []; }
  }

  // ---------- Get the latest from GitHub: the backup holds the real design files ----------
  // The repo comes from this device's copy of the project's backup settings (public repo names only; no token here).
  async function fromGitHub(pid) {
    const c = C(); pid = pid || (c && c.project && c.project()) || '';
    const sync = peek(pid, `/projects/${encodeURIComponent(pid)}/sync`) || {};
    const st = sync.status || {};
    if (!st.repo || st.kind !== 'github') return { ok: false, why: T('This project isn’t backed up on GitHub yet.') };
    const api = String(root.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, ''), br = encodeURIComponent(st.branch || 'main');
    const one = async rel => {
      const r = await fetch(`${api}/repos/${st.repo}/contents/${rel}?ref=${br}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (r.status === 404) return { missing: true, status: 404 };
      if (!r.ok) return { status: r.status };
      return { data: await r.json() };
    };
    let site, app;
    try { [site, app] = await Promise.all([one('site/site.json'), one('app-web/app-design.json')]); }
    catch { return { ok: false, why: T('Can’t reach GitHub from here right now.') }; }
    if (site.status === 404 && app.status === 404) return { ok: false, why: T('Nothing there yet, or the backup is private. A private backup opens on github.com with your own sign-in.'), url: st.url };
    const srv = server(), got = [];
    const clean = d => { const o = { ...d }; delete o.rev; delete o.savedBy; delete o.savedAt; return o; };
    if (site.data) { const p = `/projects/${encodeURIComponent(pid)}/site-config`, cur = read(srv, pid, p) || {}; keep(srv, pid, p, { ...cur, config: clean(site.data), rev: cur.rev || 0, fromGitHub: new Date().toISOString() }); store.set(SITE_DRAFT + pid, { cfg: clean(site.data), at: Date.now(), rev: cur.rev || 0, dirty: false }); got.push('site'); }
    if (app.data) { const p = `/projects/${encodeURIComponent(pid)}/app-config`, cur = read(srv, pid, p) || {}; keep(srv, pid, p, { ...cur, config: clean(app.data), rev: cur.rev || 0, fromGitHub: new Date().toISOString() }); got.push('app'); }
    emit('got', { pid, from: 'github', got });
    return { ok: true, got, url: st.url };
  }

  root.TribeCopies = { copyable, keep, read, peek, touch, setBase, getBase, merge3, choose, mergeOrAsk, pending, send, get, lastContact, history, fromGitHub, on };
})(typeof window !== 'undefined' ? window : globalThis);
