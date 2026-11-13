// A project that lives only on this device, first-class (feat/calm-parity). offline.js keeps the on-device tribe
// (solo mode); this file answers the parts of the API it had no answer for, so the same panels work with no server:
//   * Versions: snapshots of the project's vision, docs and website (IndexedDB "tribecode-device", capped at 40 per
//     project, oldest unnamed pruned first), shown in the usual Versions panel (versions.js) with the diff, restore a
//     file, restore the project as a new version, a name, compare and a zip. Edits save a version by themselves a few
//     seconds after you stop, like a plain folder's history on a host.
//   * The website designer's config (site-config), so a design saves cleanly here and is part of each version.
//   * Widgets: the picker and the cards that need no host (note, checklist, bookmarks, countdown, my tasks, quick docs),
//     in the project and on Home, with their state.
//   * Notification settings (what pings, quiet hours, digest, mutes) kept on this device.
// What truly needs a server keeps one calm line with a one-tap "Choose where it lives": TribeDevice.line(text).
//   window.TribeDevice = { on(), where(), line(text), CARDS, snapshot(pid, message), _k }
(function () {
  'use strict';
  const O = () => window.TribeOffline, K = () => O() && O()._k;
  const on = () => !!(O() && O().solo && O().solo());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = d => [200, d], no = (status, error) => [status, { error }];
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const phoneLike = () => matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  const hex = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

  // ---------- the calm line ----------
  function where() {
    const LS = window.TribeLocalSetup, PH = window.TribePhoneHost;
    if (LS && LS.where && !phoneLike()) return LS.where();
    if (PH && PH.move) return PH.move();
    if (LS && LS.where) return LS.where();
  }
  const line = text => `<span class="dv-line"><span class="dv-line-t">${esc(text)}</span> <button type="button" class="linkish dv-where" data-device-where>Choose where it lives</button></span>`;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-device-where]'); if (!b) return; e.preventDefault(); e.stopPropagation(); where(); }, true);

  // ---------- IndexedDB: the versions ----------
  const CAP = 40, SAVE_MS = 3000;
  let idbP = null;
  const idb = () => idbP || (idbP = new Promise((res, rej) => {
    const r = indexedDB.open('tribecode-device', 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('versions', { keyPath: 'id' }); s.createIndex('pid', 'pid'); };
    r.onsuccess = () => res(r.result); r.onerror = () => { idbP = null; rej(r.error); };
  }));
  const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('versions', mode), s = t.objectStore('versions'); let out; try { out = fn(s); } catch (e) { return rej(e); } t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = t.onabort = () => rej(t.error); }); };
  const listFor = async pid => ((await tx('readonly', s => s.index('pid').getAll(pid))) || []).sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.n - a.n);
  const getV = id => tx('readonly', s => s.get(id));
  const putV = v => tx('readwrite', s => { s.put(v); });
  const delV = id => tx('readwrite', s => { s.delete(id); });

  // ---------- what a version holds: the project as plain text files ----------
  const EXT = { sheet: 'sheet', deck: 'deck' };
  const docPath = d => `docs/${d.slug}.${EXT[d.kind] || 'md'}`;
  function tree(pid) {
    const db = K().db(), files = {}, meta = { docs: {} };
    const vis = (db.vision || {})[pid]; if (vis) files['VISION.md'] = String(vis);
    for (const d of (db.docs[pid] || [])) { const p = docPath(d); files[p] = String(d.body || ''); meta.docs[p] = { slug: d.slug, title: d.title, kind: d.kind || '' }; }
    const cfg = (db.siteCfg || {})[pid]; if (cfg && cfg.config) files['site/site.json'] = JSON.stringify(cfg.config, null, 2) + '\n';
    return { files, meta };
  }
  const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };
  const changed = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(p => (a || {})[p] !== (b || {})[p]).sort();

  // ---------- a small line diff (LCS), as a unified diff ----------
  const lines = t => { if (t == null || t === '') return []; const l = String(t).split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
  function ops(a, b) {
    const n = a.length, m = b.length; let s = 0, e = 0;
    while (s < n && s < m && a[s] === b[s]) s++;
    while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
    const A = a.slice(s, n - e), B = b.slice(s, m - e), out = [];
    for (let i = 0; i < s; i++) out.push([' ', a[i]]);
    if (A.length * B.length > 4e6) { A.forEach(l => out.push(['-', l])); B.forEach(l => out.push(['+', l])); }
    else {
      const w = B.length + 1, T = new Uint32Array((A.length + 1) * w);
      for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) T[i * w + j] = A[i] === B[j] ? T[(i + 1) * w + j + 1] + 1 : Math.max(T[(i + 1) * w + j], T[i * w + j + 1]);
      let i = 0, j = 0;
      while (i < A.length && j < B.length) { if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; } else if (T[(i + 1) * w + j] >= T[i * w + j + 1]) out.push(['-', A[i++]]); else out.push(['+', B[j++]]); }
      while (i < A.length) out.push(['-', A[i++]]); while (j < B.length) out.push(['+', B[j++]]);
    }
    for (let i = n - e; i < n; i++) out.push([' ', a[i]]);
    return out;
  }
  function fileDiff(path, before, after) {
    const o = ops(lines(before), lines(after)), add = o.filter(x => x[0] === '+').length, del = o.filter(x => x[0] === '-').length;
    if (!add && !del) return { add: 0, del: 0, text: '' };
    const out = [`diff --git a/${path} b/${path}`, before == null ? '--- /dev/null' : `--- a/${path}`, after == null ? '+++ /dev/null' : `+++ b/${path}`], CTX = 3;
    let i = 0;
    while (i < o.length) {
      if (o[i][0] === ' ') { i++; continue; }
      let start = Math.max(0, i - CTX), end = i, last = i;
      while (end < o.length && end - last <= CTX * 2) { if (o[end][0] !== ' ') last = end; end++; }
      end = Math.min(o.length, last + CTX + 1);
      let la = 1, lb = 1; for (let k = 0; k < start; k++) { if (o[k][0] !== '+') la++; if (o[k][0] !== '-') lb++; }
      const hunk = o.slice(start, end), na = hunk.filter(x => x[0] !== '+').length, nb = hunk.filter(x => x[0] !== '-').length;
      out.push(`@@ -${na ? la : la - 1},${na} +${nb ? lb : lb - 1},${nb} @@`, ...hunk.map(x => x[0] + x[1]));
      i = end;
    }
    return { add, del, text: out.join('\n') };
  }
  function diffOf(a, b, only) {
    const paths = changed(a, b).filter(p => !only || p === only), files = [], parts = [];
    for (const p of paths) { const d = fileDiff(p, (a || {})[p], (b || {})[p]); files.push({ path: p, add: d.add, del: d.del }); if (d.text) parts.push(d.text); }
    return { files, diff: parts.join('\n') };
  }

  // ---------- saving a version ----------
  const flight = {};
  function snapshot(pid, message, opts = {}) {   // one at a time per project
    const run = () => snapshotNow(pid, message, opts);
    return (flight[pid] = (flight[pid] || Promise.resolve()).then(run, run));
  }
  async function snapshotNow(pid, message, opts) {
    const k = K(); if (!k || !k.proj(pid)) return null;
    const list = await listFor(pid), prev = list[0] || null, t = tree(pid);
    if (prev && same(prev.files, t.files)) return null;
    if (!prev && !Object.keys(t.files).length) return null;
    const ch = changed(prev ? prev.files : {}, t.files);
    const nice = p => (t.meta.docs[p] || (prev && prev.meta.docs[p]) || {}).title || (p === 'VISION.md' ? 'the vision' : p === 'site/site.json' ? 'the website' : p);
    const auto = !prev ? 'First version' : ch.length === 1 ? `${t.files[ch[0]] == null ? 'Removed' : prev.files[ch[0]] == null ? 'Added' : 'Edited'} ${nice(ch[0])}` : `Changed ${ch.length} files`;
    const me = (k.db().members || []).find(m => m.id === 'me') || {};
    const v = { id: hex(6), pid, n: (prev ? prev.n : 0) + 1, at: k.iso(), message: str(message, 120) || auto, author: me.name || 'You', tags: [], files: t.files, meta: t.meta, parent: prev ? prev.id : null, changed: ch.length };
    await putV(v);
    // capped: the oldest unnamed version goes first; named ones stay as long as there is anything else to drop
    const all = [v, ...list];
    while (all.length > CAP) { let i = all.length - 1; while (i > 0 && all[i].tags.length) i--; if (i === 0) i = all.length - 1; const [gone] = all.splice(i, 1); await delV(gone.id); }
    if (!opts.quiet) k.push({ type: 'versions', project: pid });
    return v;
  }
  const timers = {};
  function soon(pid) { clearTimeout(timers[pid]); timers[pid] = setTimeout(() => { if (on()) snapshot(pid).catch(() => {}); }, T.saveMs); }
  const T = { saveMs: SAVE_MS, cap: CAP };

  // put one file of a version back into the project
  function applyFile(pid, v, path) {
    const k = K(), db = k.db(), text = v.files[path], now = k.iso();
    if (path === 'VISION.md') { db.vision[pid] = text || ''; return; }
    if (path === 'site/site.json') { db.siteCfg = db.siteCfg || {}; if (text == null) delete db.siteCfg[pid]; else { let c = null; try { c = JSON.parse(text); } catch {} if (c) db.siteCfg[pid] = { config: c, rev: ((db.siteCfg[pid] || {}).rev || 0) + 1, savedAt: now }; } try { localStorage.removeItem('tribecode.sitedesigner.draft.' + pid); } catch {} k.push({ type: 'site-config', project: pid }); return; }
    const m = (v.meta.docs || {})[path], list = db.docs[pid] = db.docs[pid] || [];
    const slug = m ? m.slug : path.replace(/^docs\//, '').replace(/\.(md|sheet|deck)$/, ''), d = list.find(x => x.slug === slug);
    if (text == null) { if (d) { db.docs[pid] = list.filter(x => x !== d); k.push({ type: 'doc-removed', slug }); } return; }
    if (d) { d.body = text; if (m && m.title) d.title = m.title; d.version = (d.version || 1) + 1; d.updated = now; d.updatedBy = 'me'; k.push({ type: 'doc', doc: { slug, title: d.title, version: d.version, updated: now, updatedBy: 'me' } }); }
    else { const nd = { slug, title: (m && m.title) || slug, by: 'me', created: now, updated: now, updatedBy: 'me', version: 1, project: pid, body: text, ...(m && m.kind ? { kind: m.kind } : {}) }; list.push(nd); k.push({ type: 'doc', doc: { slug, title: nd.title, version: 1, updated: now, updatedBy: 'me' } }); }
  }

  async function versionsRoute(M, pid, sub, act, q, body) {
    const k = K(), GET = M === 'GET', POST = M === 'POST';
    const list = await listFor(pid), view = v => ({ sha: v.id, message: v.message, author: v.author, at: v.at, files: v.changed || 0, tags: v.tags || [], shipped: null });
    if (!sub && GET) { const t = tree(pid).files; return ok({ kind: 'device', list: list.map(view), dirty: list[0] ? changed(list[0].files, t).length : Object.keys(t).length, tags: list.flatMap(v => v.tags || []), cap: T.cap }); }
    if (!sub && POST) { clearTimeout(timers[pid]); const v = await snapshot(pid, body.message); return ok(v ? { version: view(v) } : { version: null, note: list.length ? 'Nothing changed since the last version.' : 'Nothing to save yet. Write a doc, the vision or a website first.' }); }
    const find = id => list.find(v => v.id === id), parentOf = v => (v.parent && find(v.parent)) || list[list.indexOf(v) + 1] || null;
    if (sub === 'compare' && GET) {
      const a = find(q.get('a')), b = q.get('b') ? find(q.get('b')) : null; if (!a || (q.get('b') && !b)) return no(404, 'That version is gone.');
      return ok(diffOf(a.files, b ? b.files : tree(pid).files));
    }
    const v = find(sub); if (!v) return no(404, 'That version is gone.');
    const prev = parentOf(v), before = prev ? prev.files : {};
    if (!act && GET) return ok({ sha: v.id, message: v.message, author: v.author, at: v.at, files: diffOf(before, v.files).files });
    if (act === 'diff' && GET) return ok({ diff: diffOf(before, v.files, q.get('path') || '').diff });
    if (act === 'tag' && POST) { const name = str(body.name, 60); v.tags = name ? [name] : []; await putV(v); k.push({ type: 'versions', project: pid }); return ok({ ok: true, tags: v.tags }); }
    if (act === 'zip' && GET) {
      const X = window.TribeExport; if (!X || !X.zip) return no(500, 'The zip writer did not load.');
      const name = `${pid}-${(v.tags[0] || v.id).replace(/[^\w.-]+/g, '-')}.zip`;
      const blob = X.zip(Object.keys(v.files).sort().map(p => [p, v.files[p]]), 'application/zip');
      return new Response(blob, { status: 200, headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"` } });
    }
    if (act === 'restore-file' && POST) {
      const path = String(body.path || ''); if (!(path in v.files) && !(path in tree(pid).files)) return no(404, 'That file is not in this version.');
      await snapshot(pid, '', { quiet: true });   // what is there now stays in the history
      applyFile(pid, v, path); k.save();
      await snapshot(pid, `Restored ${path} from “${v.message}”`);
      return ok({ ok: true });
    }
    if (act === 'restore' && POST) {
      await snapshot(pid, '', { quiet: true });
      for (const p of changed(tree(pid).files, v.files)) applyFile(pid, v, p);
      k.save();
      const nv = await snapshot(pid, `Restored to “${v.message}”`);
      return ok({ ok: true, version: nv ? view(nv) : null });
    }
    return null;
  }

  // ---------- the website designer's config ----------
  function siteConfig(M, pid, sub, body) {
    const k = K(), db = k.db(); db.siteCfg = db.siteCfg || {};
    const cur = db.siteCfg[pid] || null;
    if (!sub && M === 'GET') return ok({ config: cur ? cur.config : null, rev: cur ? cur.rev : 0, savedAt: cur ? cur.savedAt : null, canEdit: true });
    if (!sub && M === 'PUT') { const config = body.config || null; if (!config || typeof config !== 'object') return no(400, 'No design to save.'); db.siteCfg[pid] = { config, rev: (cur ? cur.rev : 0) + 1, savedAt: k.iso() }; k.save(); soon(pid); return ok({ ok: true, rev: db.siteCfg[pid].rev, savedAt: db.siteCfg[pid].savedAt }); }
    if (sub === 'publish') return no(409, 'Publishing writes the pages into the project’s code, so it needs a home. Download HTML works right here.');
    return null;
  }

  // ---------- widgets: the picker's lists and the cards' own state ----------
  const CARDS = ['mytasks', 'note', 'checklist', 'bookmarks', 'countdown', 'quickdocs'];
  const MULTI = new Set(['note', 'checklist', 'bookmarks', 'countdown']);
  const BUILTIN = ['calendar', 'bugs', 'board', 'milestones', 'repo', 'visuals', 'website', 'preview', 'workshop', 'plan', 'secretary', 'whiteboard', 'captures', 'assets', 'mcp', 'market'];
  const fail = (status, m) => Object.assign(new Error(m), { status });
  function clean(list, home) {
    if (!Array.isArray(list)) throw fail(400, 'widgets must be a list');
    const seen = new Set(), out = [];
    for (const w of list.slice(0, 24)) {
      if (!w || typeof w !== 'object') continue;
      const id = /^[a-z0-9-]{4,40}$/.test(w.id || '') ? w.id : 'w-' + hex(5);
      if (seen.has(id)) continue;
      if (w.kind === 'builtin' && !home) { if (!BUILTIN.includes(w.key) || out.some(x => x.kind === 'builtin' && x.key === w.key)) continue; out.push({ id, kind: 'builtin', key: w.key }); }
      else if (w.kind === 'card') {
        if (!CARDS.includes(w.key)) throw fail(409, 'That widget needs the tribe’s host. Choose where this project lives and it works.');
        if (!MULTI.has(w.key) && out.some(x => x.kind === 'card' && x.key === w.key)) continue;
        const title = str(w.title, 40); out.push({ id, kind: 'card', key: w.key, ...(title ? { title } : {}) });
      } else if (w.kind === 'link' || (w.kind === 'doc' && !home)) {
        const name = str(w.name, 40); if (!name) throw fail(400, 'give the widget a name');
        if (w.kind === 'link') { let u; try { u = new URL(str(w.url, 2000)); } catch { throw fail(400, 'that link is not a full web address (https://…)'); } if (!/^https?:$/.test(u.protocol)) throw fail(400, 'links must start with http:// or https://'); out.push({ id, kind: 'link', name, emoji: str(w.emoji, 8), url: u.href }); }
        else { const doc = str(w.doc, 120); if (!/^[a-z0-9][a-z0-9-]*$/i.test(doc)) throw fail(400, 'pick a doc to pin'); out.push({ id, kind: 'doc', name, emoji: str(w.emoji, 8), doc }); }
      }
      seen.add(id);
    }
    return out;
  }
  const HOME = '~home';
  function wview(scope) {
    const db = K().db(), list = (db.widgets || {})[scope] || [], data = {};
    for (const w of list) if (w.kind === 'card' && (db.wdata || {})[scope + '|' + w.id]) data[w.id] = db.wdata[scope + '|' + w.id];
    const base = { widgets: list, canEdit: true, canVote: true, cards: CARDS, data, device: true };
    return scope === HOME ? { ...base, home: true } : { ...base, builtin: BUILTIN, preview: { show: false, label: '' }, website: { show: !!((db.siteCfg || {})[scope]) } };
  }
  function wput(scope, body) {
    const k = K(), db = k.db(); db.widgets = db.widgets || {}; db.wdata = db.wdata || {};
    const list = clean(body.widgets, scope === HOME);
    if (list.length) db.widgets[scope] = list; else delete db.widgets[scope];
    const keep = new Set(list.map(w => scope + '|' + w.id)); for (const key of Object.keys(db.wdata)) if (key.startsWith(scope + '|') && !keep.has(key)) delete db.wdata[key];
    k.save(); k.push(scope === HOME ? { type: 'widgets', home: 'me' } : { type: 'widgets', project: scope });
    return wview(scope);
  }
  function wact(body) {
    const k = K(), db = k.db(), home = body.scope === 'home', scope = home ? HOME : String(body.scope || '');
    if (!home && !k.proj(scope)) throw fail(404, 'project not found');
    const w = ((db.widgets || {})[scope] || []).find(x => x.id === body.wid && x.kind === 'card'); if (!w) throw fail(404, 'that widget is gone');
    db.wdata = db.wdata || {};
    const key = scope + '|' + w.id, d = db.wdata[key] = db.wdata[key] || {}, op = String(body.op || ''), stamp = () => { d.at = k.iso(); d.by = 'me'; };
    const item = () => { const it = (d.items || []).find(x => x.id === body.item); if (!it) throw fail(404, 'that item is gone'); return it; };
    if (op === 'title') { const t = str(body.title, 40); if (t) w.title = t; else delete w.title; }
    else if (w.key === 'note' && op === 'set') { d.text = String(body.text == null ? '' : body.text).slice(0, 4000); stamp(); }
    else if (w.key === 'checklist' && op === 'add') { const t = str(body.text, 140); if (!t) throw fail(400, 'write something first'); d.items = d.items || []; if (d.items.length >= 40) throw fail(400, 'at most 40 items'); d.items.push({ id: hex(4), text: t, done: false }); stamp(); }
    else if (w.key === 'checklist' && op === 'toggle') { const it = item(); it.done = !it.done; stamp(); }
    else if ((w.key === 'checklist' || w.key === 'bookmarks') && op === 'del') { item(); d.items = d.items.filter(x => x.id !== body.item); stamp(); }
    else if (w.key === 'checklist' && op === 'clear') { d.items = (d.items || []).filter(x => !x.done); stamp(); }
    else if (w.key === 'bookmarks' && op === 'add') {
      let u; try { u = new URL(str(body.url, 2000)); } catch { throw fail(400, 'that link is not a full web address (https://…)'); }
      if (!/^https?:$/.test(u.protocol)) throw fail(400, 'links must start with http:// or https://');
      d.items = d.items || []; if (d.items.length >= 20) throw fail(400, 'at most 20 links');
      d.items.push({ id: hex(4), name: str(body.name, 40) || u.hostname, url: u.href }); stamp();
    }
    else if (w.key === 'countdown' && op === 'set') { const t = str(body.title, 60), at = str(body.date, 40); if (!t || !at || isNaN(Date.parse(at))) throw fail(400, 'give it a name and a date'); d.title = t; d.date = at; stamp(); }
    else throw fail(400, 'unknown action');
    k.save(); k.push(home ? { type: 'widgets', home: 'me', wid: w.id } : { type: 'widgets', project: scope, wid: w.id });
    return { widget: w, data: db.wdata[key] };
  }

  // ---------- notification settings, kept here ----------
  const TYPES = ['approval', 'mention', 'dm', 'task-assigned', 'reminder', 'proposal', 'bug-critical', 'release', 'huddle', 'meeting-notes', 'repo', 'comment-reply', 'visual-diff'];
  const defaults = () => ({
    types: { approval: true, mention: true, dm: true, 'task-assigned': true, reminder: true, proposal: true, 'bug-critical': true, release: false, huddle: false, 'meeting-notes': false, repo: false, 'comment-reply': true, 'visual-diff': false },
    channels: { ntfy: false, webpush: false, desktop: false, email: false }, ntfy: { server: '', topic: '' },
    when: { mode: 'always', awayMinutes: 5, quiet: { on: false, from: '22:00', to: '08:00' } }, digest: { on: false, everyHours: 4, at: '' }, mutes: { channels: {}, projects: {} },
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })(),
  });
  const merge = (base, p) => { if (!p || typeof p !== 'object') return base; for (const key of Object.keys(p)) { if (p[key] && typeof p[key] === 'object' && !Array.isArray(p[key])) base[key] = merge(base[key] && typeof base[key] === 'object' ? base[key] : {}, p[key]); else base[key] = p[key]; } return base; };
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  function cleanPrefs(cur, body) {
    const p = JSON.parse(JSON.stringify(cur)), b = body || {};
    for (const t of TYPES) if (b.types && typeof b.types[t] === 'boolean') p.types[t] = t === 'approval' ? true : b.types[t];
    if (b.when) { if (['away', 'always'].includes(b.when.mode)) p.when.mode = b.when.mode; if (Number(b.when.awayMinutes) > 0) p.when.awayMinutes = Math.min(120, Math.round(Number(b.when.awayMinutes))); const qz = b.when.quiet || {}; if (typeof qz.on === 'boolean') p.when.quiet.on = qz.on; if (TIME.test(qz.from || '')) p.when.quiet.from = qz.from; if (TIME.test(qz.to || '')) p.when.quiet.to = qz.to; }
    if (b.digest) { if (typeof b.digest.on === 'boolean') p.digest.on = b.digest.on; if (Number(b.digest.everyHours) > 0) p.digest.everyHours = Math.min(24, Math.round(Number(b.digest.everyHours))); if (b.digest.at === '' || TIME.test(b.digest.at || '')) p.digest.at = b.digest.at || ''; }
    for (const kind of ['channels', 'projects']) for (const [id, lv] of Object.entries((b.mutes || {})[kind] || {})) { if (lv === 'all') delete p.mutes[kind][id]; else if (['mentions', 'none'].includes(lv)) p.mutes[kind][String(id).slice(0, 80)] = lv; }
    if (typeof b.tz === 'string' && b.tz.length < 60) p.tz = b.tz;
    return p;   // channels stay off: phone push, the desktop app's and email all need a host
  }
  function notifyRoute(M, b, body) {
    const k = K(), db = k.db(), prefs = () => merge(defaults(), db.notifyPrefs || {});
    const NEED = 'Phone push, email and ntfy are sent by a host. Choose where this tribe lives and they turn on; pop-ups, sound and quiet hours already work here.';
    if (b === 'prefs' && M === 'GET') return ok({ prefs: prefs(), webpushDevices: 0, vapidPublicKey: '', ntfyUrl: '', types: TYPES, emailAvailable: false, device: true });
    if (b === 'prefs' && (M === 'PUT' || M === 'PATCH')) { db.notifyPrefs = cleanPrefs(prefs(), body); k.save(); return ok({ prefs: db.notifyPrefs, ntfyUrl: '', device: true }); }
    if (b === 'mute' && M === 'POST') { const p = prefs(); if (TYPES.includes(body.type) && body.type !== 'approval') p.types[body.type] = false; db.notifyPrefs = p; k.save(); return ok({ ok: true }); }
    if (b === 'test' && M === 'POST') { k.notify({ type: 'reminder', title: 'Test notification', body: 'Notifications work on this device.', priority: 'normal' }); return ok({ channels: [], device: true }); }
    if (['topic', 'vapid', 'webpush', 'forward'].includes(b)) return no(409, NEED);
    return null;
  }

  // ---------- the route hook (offline.js asks it first) ----------
  function route(method, parts, q, body) {
    if (!on()) return null;
    const [a, b, c, d, e] = parts, k = K(), M = method;
    try {
      if (a === 'projects' && b && k.proj(b)) {
        if (c === 'versions') return versionsRoute(M, b, d, e, q, body || {}).then(r => r || no(404, 'not found')).catch(er => no(er.status || 500, er.message || 'Versions hit a snag.'));
        if (c === 'site-config') { const r = siteConfig(M, b, d, body || {}); if (r) return r; }
        if (c === 'website' && d === 'versions' && M === 'POST' && !e) return snapshot(b, str((body || {}).note, 80) || 'Website design').then(v => ok({ id: v ? v.id : '', note: v ? v.message : 'Nothing changed since the last version.', device: true, saved: !!v }));
        if (c === 'widgets') { if (M === 'GET') return ok(wview(b)); if (M === 'PUT' || M === 'POST') return ok(wput(b, body || {})); }
        if (c === 'site-library' && M === 'POST') return no(409, 'On this device a template opens in the website designer.');
      }
      if (a === 'widgets') { if (b === 'home' && M === 'GET') return ok(wview(HOME)); if (b === 'home' && (M === 'PUT' || M === 'POST')) return ok(wput(HOME, body || {})); if (b === 'act' && M === 'POST') return ok(wact(body || {})); }
      if (a === 'notify') { const r = notifyRoute(M, b, body || {}); if (r) return r; }
      // edits that belong in the history: save a version a few seconds after the last one
      if (M !== 'GET' && (a === 'docs' || a === 'vision')) { const pid = k.cur(); if (pid) soon(pid); }
    } catch (er) { return no(er.status || 500, er.message || 'That did not work.'); }
    return null;
  }
  function hook() { const k = K(); if (!k || !k.hooks) return setTimeout(hook, 200); if (!k.hooks.route.includes(route)) k.hooks.route.push(route); }
  hook();

  window.TribeDevice = { on, where, line, CARDS, snapshot, _k: { T, tree, listFor, diffOf, route } };
})();
