// Home's Messages (feat/p10-home): the newest line of every conversation the person can read, across all their projects.
//   GET /api/hub/inbox -> { rows: [{ kind: 'channel'|'dm', project, channel, title, last: { by, name, text, at }, mention, mine }] }
// Only what the person may read: each project they can see (P.canSee), its open channels they can read (chans.canRead),
// and their OWN DMs (dms.list only ever names the person's own pairs, and dms.canRead blocks an agent's private line).
// Read-only, from the same chat files the Messages view reads; nothing new is stored.
'use strict';

module.exports = function hubInbox({ store, P, chans, dms, nameOf, memberById }) {
  const clip = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const lastReal = msgs => { for (let i = msgs.length - 1; i >= 0; i--) { const x = msgs[i]; if (x && !x.deleted && (x.text || x.file || x.voice)) return x; } return null; };
  const words = m => [m.name, (m.name || '').split(/\s+/)[0]].filter(Boolean).map(n => '@' + n.toLowerCase());

  function rows(me, limit = 40) {
    if (!me || me.role === 'spectator') return [];
    const out = [], at = words(me);
    for (const p of P.visibleTo(me)) {
      if (!P.canSee(me, p.id)) continue;
      const list = [{ id: 'general', name: 'general', file: P.channelOf(p.id) }];
      for (const c of (chans.listFor(p.id) || []).slice(1)) if (!c.archived && chans.canRead(me, c.id)) list.push({ id: c.id, name: c.name, file: c.id });
      for (const c of list) {
        const msgs = store.readJSONL(`chat/${c.file}.jsonl`, 30); const last = lastReal(msgs); if (!last) continue;
        const since = msgs.filter(x => x && x.by !== me.id && !x.deleted);
        const mention = since.some(x => at.some(w => String(x.text || '').toLowerCase().includes(w)));
        out.push({ kind: 'channel', project: p.id, projectName: p.name, channel: c.file, title: '#' + c.name,
          last: { by: last.by, name: last.by === 'tribecode' ? 'TribeCode' : nameOf(last.by), text: clip(last.text || (last.file ? 'Sent a file' : 'Sent a voice note')), at: last.at },
          mention, mine: last.by === me.id });
      }
    }
    for (const d of dms.list(me) || []) {
      if (!dms.canRead(d.channel, me)) continue;   // never another person's private line
      const w = memberById(d.with) || {}, last = d.last || {};
      if (last.deleted) continue;
      out.push({ kind: 'dm', project: null, channel: d.channel, title: w.name || 'Someone', with: d.with, color: w.color || '', agent: w.role === 'agent',
        last: { by: last.by, name: nameOf(last.by), text: last.enc ? 'New message' : clip(last.text || (last.file ? 'Sent a file' : 'Sent a voice note')), at: last.at, ...(last.enc ? { enc: true } : {}) }, mention: false, mine: last.by === me.id });   // feat/p12-e2ee: a private message shows no words
    }
    return out.filter(r => r.last && r.last.at).sort((a, b) => String(b.last.at).localeCompare(String(a.last.at))).slice(0, limit);
  }

  return { rows };
};
