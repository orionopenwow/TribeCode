// Task news (v0.26): the Task Board badge counts task updates you haven't seen — a task someone else added, moved,
// assigned or finished since you last opened the board. Opening the board clears it; new changes count it back up;
// your own changes never count. (Before v0.26 the badge showed the number of open tasks, which never went down.)
// Seen-time is per project and per device: localStorage 'tribecode.tasks.seen.<project>'.
// Public: window.TribeTaskNews = { count(), seen(), refresh() }.
(function () {
  const C = window.TribeClient; if (!C) return;
  const key = () => 'tribecode.tasks.seen.' + (C.project() || 'none');
  const meId = () => (C.state().me || {}).id;
  const onBoard = () => ['tasks', 'ws-tasks'].includes(document.body.dataset.view) || (window.TribeShell && window.TribeShell.current && window.TribeShell.current() === 'ws-tasks');
  let tasks = new Map(), n = 0, pid = null;
  function seenAt() {
    let v = null; try { v = localStorage.getItem(key()); } catch {}
    if (!v) { v = new Date().toISOString(); try { localStorage.setItem(key(), v); } catch {} }   // first visit: start calm, not with every old task
    return v;
  }
  const isNews = (t, since) => { const at = t.updated || t.created || '', by = t.updatedBy || t.by; return at > since && by && by !== meId(); };
  function recount() {
    if (onBoard()) { markSeen(false); }
    const since = seenAt();
    n = [...tasks.values()].filter(t => isNews(t, since)).length;
    paint();
  }
  function paint() {
    const el = document.getElementById('nn-tasks');
    if (el) { el.textContent = n ? (n > 99 ? '99+' : String(n)) : ''; el.classList.toggle('hot', !!n); el.title = n ? `${n} task update${n > 1 ? 's' : ''} since you last looked` : ''; }
    document.querySelectorAll('[data-bd="nn-tasks"]').forEach(b => { const was = b.textContent; b.textContent = n ? (n > 99 ? '99+' : String(n)) : ''; b.classList.toggle('hidden', !n); if (n && was !== b.textContent) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } });
  }
  function markSeen(repaint = true) {
    try { localStorage.setItem(key(), new Date().toISOString()); } catch {}
    if (repaint && n) { n = 0; paint(); }
  }
  async function refresh() {
    if (!C.connected() || !C.project()) { tasks = new Map(); n = 0; return paint(); }
    pid = C.project();
    try { const r = await C.api('/tasks'); tasks = new Map((r.tasks || []).map(t => [t.id, t])); } catch { return; }
    recount();
  }
  let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(refresh, 300); };
  C.on('hello', soon); C.on('project', () => { if (C.project() !== pid) soon(); });
  C.on('task', t => { if (t && t.id) { tasks.set(t.id, t); recount(); } });
  C.on('task-removed', id => { tasks.delete(id); recount(); });
  // the board opened (any way: sidebar, phone rack, palette, link): clear
  new MutationObserver(() => { if (onBoard()) { markSeen(); } }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  window.TribeTaskNews = { count: () => n, seen: () => markSeen(), refresh, paint };
})();
