// Soft file claims: "I'm editing this" markers that people and agents respect. Expire after 4 h idle.
'use strict';
module.exports = function claims({ store, id, broadcast, nameOf, project = () => null }) {
  const TTL = 4 * 3600_000;
  const norm = p => String(p || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').slice(0, 300);
  const overlaps = (a, b) => a === b || (b.endsWith('/') && a.startsWith(b)) || (a.endsWith('/') && b.startsWith(a));
  let list = store.readJSON('claims.json', []);
  const save = () => { list = list.filter(c => Date.now() - Date.parse(c.at) < TTL); store.writeJSON('claims.json', list); broadcast({ type: 'claims', claims: view() }); };
  const view = () => list.filter(c => Date.now() - Date.parse(c.at) < TTL).map(c => ({ ...c, name: nameOf(c.by) }));
  return {
    list: view,
    claim(path, note, me) {
      path = norm(path); if (!path) return { conflict: { path: '(empty path)', name: 'nobody' } };
      const other = view().find(c => c.by !== me.id && overlaps(c.path, path));
      if (other) return { conflict: other };
      let c = list.find(x => x.by === me.id && x.path === path);
      if (c) { c.at = new Date().toISOString(); c.note = note || c.note; }
      else { c = { id: 'c-' + id(6).toLowerCase(), path, by: me.id, note: String(note || '').slice(0, 140), at: new Date().toISOString(), ...(project() ? { project: project() } : {}) }; list.push(c); }
      save(); return { claim: { ...c, name: nameOf(c.by) } };
    },
    release(path, me) { const n = list.length; path = norm(path); list = list.filter(c => !(c.path === path && (c.by === me.id || me.role === 'host'))); if (list.length !== n) { save(); return true; } return false; },
    releaseId(cid, me) { const c = list.find(x => x.id === cid); if (!c || (c.by !== me.id && me.role !== 'host')) return false; list = list.filter(x => x !== c); save(); return true; },
    handOff(cid, toId, me) { const c = list.find(x => x.id === cid && x.by === me.id); if (!c) return null; c.by = toId; c.at = new Date().toISOString(); c.note = `${c.note ? c.note + ' · ' : ''}handed off by ${me.name}`; save(); return c; },
    mine: me => view().filter(c => c.by === me.id),
  };
};
