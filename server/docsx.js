// Notion-lite extras for Docs, kept out of docs.js:
//   templates/*.md            "New doc from template" (seeded with five, teams add their own)
//   [[Page title]] links      backlinks computed here ("Linked from")
//   @Name mentions            bus.notify({ type: 'mention' }) when someone is newly mentioned
//   docs/<slug>.comments.json comment threads anchored by quote + offset, with replies and resolve
//   docs/.history/<slug>/<v>.md every saved version (capped), line diffs on the client, restore via live merge
//   front-matter pinned/parent pins and nesting
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const bus = require('./bus');
const { mentionsIn } = require('./notify');

const HISTORY_CAP = Number(process.env.TRIBE_HISTORY_CAP) || 200;
const TEMPLATES = {
  'meeting-notes': ['Meeting notes', `**Date:** {{date}} · **Notes by:** {{me}}\n\n## Attendees\n- \n\n## Agenda\n1. \n\n## Notes\n\n\n## Decisions\n- \n\n## Action items\n- [ ] `],
  spec: ['Spec', `## Problem\nWhat is wrong today, and who feels it?\n\n## Goal\nWhat does done look like?\n\n## Non-goals\n- \n\n## Proposal\n\n\n## Open questions\n- \n\n## Tasks\n- [ ] `],
  retro: ['Retro', `**Sprint ending {{date}}**\n\n## What went well\n- \n\n## What was hard\n- \n\n## What we will try next\n- [ ] \n\n## Shout-outs\n- `],
  'bug-report': ['Bug report', `## What happened\n\n\n## Steps to reproduce\n1. \n2. \n\n## Expected\n\n\n## Actual\n\n\n## Environment\n- Version: \n- OS: \n\n## Notes\n`],
  'weekly-update': ['Weekly update', `**Week of {{date}}** · {{me}}\n\n## Shipped\n- \n\n## In progress\n- \n\n## Blocked\n- \n\n## Next week\n- [ ] `],
};
const LINK_RE = /\[\[([^\[\]\n]{1,160})\]\]/g;

module.exports = function docsx({ store, id, str, slug: slugify, broadcast, docs, getMembers, nameOf }) {
  const okSlug = s => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);
  const tplDir = store.p('templates');
  if (!fs.existsSync(tplDir)) {
    fs.mkdirSync(tplDir, { recursive: true });
    for (const [k, [title, body]] of Object.entries(TEMPLATES)) store.writeMd(`templates/${k}.md`, { title, description: body.split('\n').find(l => l.startsWith('## ')).slice(3) }, body);
  }
  function templates() {
    return store.listMd('templates').map(f => { const r = store.readMd(f); return r && { id: path.basename(f, '.md'), title: r.meta.title || path.basename(f, '.md'), body: r.body }; }).filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  // ---------- links + backlinks ----------
  const linksIn = body => { const out = []; let m; LINK_RE.lastIndex = 0; while ((m = LINK_RE.exec(body || ''))) out.push(m[1].trim()); return out; };
  function backlinks(s) {
    const d = docs.read(s); if (!d) return [];
    const want = new Set([d.title.toLowerCase(), s]);
    const out = [];
    for (const it of docs.list()) {
      if (it.slug === s) continue;
      const o = docs.read(it.slug); if (!o) continue;
      const hit = linksIn(o.body).find(l => want.has(l.toLowerCase()) || want.has(slugify(l)));
      if (!hit) continue;
      const i = o.body.indexOf(`[[${hit}]]`), line = o.body.slice(o.body.lastIndexOf('\n', i) + 1, (o.body.indexOf('\n', i) + 1 || o.body.length + 1) - 1);
      out.push({ slug: o.slug, title: o.title, snippet: line.trim().slice(0, 200) });
    }
    return out;
  }

  // ---------- mentions ----------
  // memberId -> how many times they are @mentioned. Uses the chat parser from notify.js so docs and chat agree
  // (@Maya, @maya, @MayaLee, @everyone), skipping code spans and blocks.
  function mentioned(body) {
    const out = new Map(), ms = getMembers();
    const text = String(body || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
    for (const tok of text.match(/(^|[^\w@])@[^\s@]+/g) || []) for (const mid of mentionsIn(tok.trim().replace(/^[^@]+/, ''), ms, null)) out.set(mid, (out.get(mid) || 0) + 1);
    return out;
  }

  // ---------- history ----------
  const hDir = s => `docs/.history/${s}`;
  function snapshot(d) {
    const dir = store.p(hDir(d.slug)); fs.mkdirSync(dir, { recursive: true });
    store.writeMd(`${hDir(d.slug)}/${String(d.version).padStart(6, '0')}.md`, { version: Number(d.version), title: d.title, by: d.updatedBy || d.by || null, at: d.updated || new Date().toISOString() }, d.body || '');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - HISTORY_CAP))) try { fs.unlinkSync(path.join(dir, f)); } catch {}
  }
  function history(s) {
    let files = []; try { files = fs.readdirSync(store.p(hDir(s))).filter(f => f.endsWith('.md')).sort().reverse(); } catch {}
    return files.map(f => { const r = store.readMd(`${hDir(s)}/${f}`); return r && { version: r.meta.version, title: r.meta.title, by: r.meta.by, at: r.meta.at, words: r.body.split(/\s+/).filter(Boolean).length }; }).filter(Boolean);
  }
  const version = (s, v) => { const r = store.readMd(`${hDir(s)}/${String(Number(v)).padStart(6, '0')}.md`); return r && { ...r.meta, body: r.body }; };

  // Called by docs.write() for every saved version (REST, agents, live persist).
  function onWrite(d, prev) {
    try { snapshot(d); } catch (e) { console.error('history', e.message); }
    const before = mentioned(prev ? prev.body : ''), after = mentioned(d.body), by = d.updatedBy || d.by;
    for (const [mid, n] of after) if (n > (before.get(mid) || 0) && mid !== by)
      bus.notify({ type: 'mention', to: [mid], from: by, priority: 'normal', view: 'docs', ref: d.slug, title: `${nameOf(by)} mentioned you in ${d.title}`, body: snippetAround(d.body, getMembers().find(m => m.id === mid)) });
  }
  function snippetAround(body, m) {
    if (!m) return ''; const i = body.toLowerCase().indexOf('@' + m.name.split(/\s+/)[0].toLowerCase());
    return i < 0 ? '' : body.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, ' ').trim();
  }

  // ---------- comments ----------
  const cRel = s => `docs/${s}.comments.json`;
  const threads = s => store.readJSON(cRel(s), []);
  const saveThreads = (s, list) => { store.writeJSON(cRel(s), list); broadcast({ type: 'doc-comments', slug: s, threads: list }); return list; };

  // ---------- meta: pin + parent ----------
  function setMeta(s, { pinned, parent }) {
    const r = store.readMd(`docs/${s}.md`); if (!r) return null;
    if (pinned !== undefined) { if (pinned) r.meta.pinned = true; else delete r.meta.pinned; }
    if (parent !== undefined) {
      if (!parent) delete r.meta.parent;
      else {
        if (!okSlug(parent) || parent === s || !docs.read(parent)) return { error: 'unknown parent page' };
        for (let p = parent, n = 0; p && n < 50; n++) { if (p === s) return { error: 'that would put the page inside itself' }; p = (docs.read(p) || {}).parent; }
        r.meta.parent = parent;
      }
    }
    store.writeMd(`docs/${s}.md`, r.meta, r.body);
    const d = docs.read(s);
    broadcast({ type: 'doc-meta', slug: s, pinned: !!d.pinned, parent: d.parent || null });
    return { doc: d };
  }

  async function route(req, res, { m, b, c, parts, me, readBody, send, fail }) {
    if (!b || !okSlug(b) || !c) return null;
    const d = docs.read(b); if (!d) return fail(res, 404, 'doc not found');
    const ro = me.role === 'spectator';
    if (c === 'backlinks' && m === 'GET') return send(res, 200, { backlinks: backlinks(b) });
    if (c === 'history') {
      const v = parts[3];
      if (m === 'GET' && !v) return send(res, 200, { versions: history(b), current: d.version });
      const h = v && version(b, v); if (!h) return fail(res, 404, 'version not found');
      if (m === 'GET') return send(res, 200, { version: h });
      if (m === 'POST' && parts[4] === 'restore') {
        if (ro) return fail(res, 403, 'spectators are read-only');
        // Through the live merge path: open editors receive the restore as ops.
        const merged = docs.live.external(b, { body: h.body, baseVersion: d.version, force: true, by: me.id });
        const out = merged ? merged.doc : docs.save({ ...docs.read(b), body: h.body, version: Number(d.version) + 1, updated: new Date().toISOString(), updatedBy: me.id });
        return send(res, 200, { doc: out, restored: h.version });
      }
    }
    if (c === 'meta' && m === 'PATCH') {
      if (ro) return fail(res, 403, 'spectators are read-only');
      const body = await readBody(req); const r = setMeta(b, body);
      return !r ? fail(res, 404, 'doc not found') : r.error ? fail(res, 400, r.error) : send(res, 200, r);
    }
    if (c === 'comments') {
      const tid = parts[3]; let list = threads(b);
      if (m === 'GET') return send(res, 200, { threads: list });
      if (ro) return fail(res, 403, 'spectators are read-only');
      const body = await readBody(req); const now = new Date().toISOString();
      if (m === 'POST' && !tid) {
        const text = str(body.body, 4000); if (!text) return fail(res, 400, 'empty comment');
        const t = { id: 'c' + id(8), quote: str(body.quote, 500), offset: Math.max(0, Number(body.offset) || 0), by: me.id, at: now, body: text, resolved: false, replies: [] };
        list.push(t); saveThreads(b, list);
        mentionNotify(text, me, d, t, []);
        return send(res, 200, { thread: t });
      }
      const t = list.find(x => x.id === tid); if (!t) return fail(res, 404, 'thread not found');
      if (m === 'POST') {
        const text = str(body.body, 4000); if (!text) return fail(res, 400, 'empty reply');
        t.replies.push({ id: 'r' + id(8), by: me.id, at: now, body: text });
        if (t.resolved) t.resolved = false;
        saveThreads(b, list);
        const people = [...new Set([t.by, ...t.replies.map(r => r.by)])].filter(x => x !== me.id);
        if (people.length) bus.notify({ type: 'comment-reply', to: people, from: me.id, priority: 'normal', view: 'docs', ref: b, title: `${me.name} replied on ${d.title}`, body: text.slice(0, 160) });
        mentionNotify(text, me, d, t, people);
        return send(res, 200, { thread: t });
      }
      if (m === 'PATCH') {
        if (body.resolved !== undefined) { t.resolved = !!body.resolved; t.resolvedBy = t.resolved ? me.id : undefined; t.resolvedAt = t.resolved ? now : undefined; }
        if (body.offset !== undefined && Number.isFinite(Number(body.offset))) t.offset = Math.max(0, Number(body.offset));
        saveThreads(b, list); return send(res, 200, { thread: t });
      }
      if (m === 'DELETE') { if (t.by !== me.id && me.role !== 'host') return fail(res, 403, 'only the author can delete'); saveThreads(b, list.filter(x => x !== t)); return send(res, 200, { ok: true }); }
    }
    return null;
  }
  function mentionNotify(text, me, d, t, already) {
    for (const [mid] of mentioned(text)) if (mid !== me.id && !already.includes(mid))
      bus.notify({ type: 'mention', to: [mid], from: me.id, priority: 'normal', view: 'docs', ref: d.slug, title: `${me.name} mentioned you in a comment on ${d.title}`, body: text.slice(0, 160) });
  }

  return { route, templates, backlinks, history, onWrite, setMeta, mentioned };
};
