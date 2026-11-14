// Flint's everyday commands that need no AI (feat/flint-unify): timers, motion, notifications, presence, chat pins and
// reactions, task reopen / unassign / priority, a fresh whiteboard, doc templates, the Marketplace, the inspiration
// board, People, Work, the preview, and clearing Flint's thread. app/ui/flintlocal.js runs these after app/ui/flintnlu.js
// understood them; every change it can take back goes on Flint's undo list ("undo").
//   window.TribeFlintCmds = { has(intent), run(step, H) -> { text, acts?: [[label, act, arg]] } | null }
//   H = { pushUndo(label, fn), connected(), tasks(), T(key) }
(function () {
  'use strict';
  const C = window.TribeClient, App = () => window.TribeApp;
  const toast = m => App() && App().toast ? App().toast(m) : null;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} } };
  const at = ms => new Date(Date.now() + ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dur = s => s >= 3600 ? `${Math.round(s / 360) / 10} hour${s === 3600 ? '' : 's'}` : s >= 60 ? `${Math.round(s / 6) / 10} minute${s === 60 ? '' : 's'}` : `${s} second${s === 1 ? '' : 's'}`;
  const channel = () => (window.TribeChannels && window.TribeChannels.current && window.TribeChannels.current()) || 'general';
  async function lastMsg() {
    const ch = channel(); let msgs = [];
    try { msgs = (await C.api('/chat/' + encodeURIComponent(ch))).messages || []; } catch {}
    const m = msgs.filter(x => !x.deleted && x.by !== 'tribecode').slice(-1)[0];
    return m ? { ch, m } : null;
  }
  // reduced motion: data-motion="off" on <html> (motion.css turns transitions off; motion.js skips view transitions)
  function motion(on) { document.documentElement.dataset.motion = on ? '' : 'off'; if (on) delete document.documentElement.dataset.motion; ls.set('tribecode.motion', on ? null : 'off'); }
  const timers = new Map();
  const RUN = {
    async timer(s, H) {
      const secs = s.slots.secs; if (!secs) return { text: 'For how long?', acts: [['5 minutes', 'ask', 'set a timer for 5 minutes'], ['10 minutes', 'ask', 'set a timer for 10 minutes'], ['25 minutes', 'ask', 'set a timer for 25 minutes']] };
      const what = String(s.slots.what || '').trim(), id = setTimeout(() => {
        timers.delete(id); const line = `⏰ Time’s up${what ? `: ${what}` : ''}.`;
        toast(line); if (window.TribeFlint && window.TribeFlint.say) window.TribeFlint.say(line);
        try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification('TribeCode', { body: line }); } catch {}
      }, secs * 1000);
      timers.set(id, what); H.pushUndo(`the ${dur(secs)} timer`, () => { clearTimeout(id); timers.delete(id); });
      return { text: `Timer set for ${dur(secs)} (until ${at(secs * 1000)})${what ? ` to ${what}` : ''}. I’ll ping you here. Say “undo” to cancel it.` };
    },
    async 'settings.motion'(s, H) {
      const was = document.documentElement.dataset.motion !== 'off', on = !!s.slots.on; motion(on);
      H.pushUndo(on ? 'animations on' : 'animations off', () => motion(was));
      return { text: on ? 'Animations are back on.' : 'Animations are off on this device: no slides or fades. Say “bring back animations” to undo.' };
    },
    async 'settings.notify'(s, H) {
      const on = !!s.slots.on;
      if (!H.connected()) { if (window.TribeNotify && window.TribeNotify.openSettings) (window.TribeNotify.settingsTab || window.TribeNotify.openSettings)(); return { text: 'Notifications live in a tribe. Start or join one first.' }; }
      let prefs; try { prefs = (await C.api('/notify/prefs')).prefs; } catch (e) { return { text: `I couldn't reach the notification settings: ${e.message}` }; }
      const before = { ...(prefs.channels || {}) }, next = on ? { ...before, webpush: true, desktop: true } : { ...before, webpush: false, desktop: false, ntfy: false };
      await C.api('/notify/prefs', { method: 'PUT', body: { ...prefs, channels: next } });
      H.pushUndo(on ? 'notifications on' : 'notifications muted', () => C.api('/notify/prefs', { method: 'PUT', body: { ...prefs, channels: before } }));
      return { text: on ? 'Notifications are on again: phone and desktop.' : 'Muted: no phone or desktop pings. Everything still lands in your inbox and digest. Say “undo” to bring them back.', acts: [['Notification settings', 'nav', 'settings']] };
    },
    async 'settings.away'(s, H) {
      const P = window.TribePresence; if (!P || !P.setPrefs) return { text: 'Presence isn’t on here yet. Start or join a tribe first.' };
      const before = P.prefs ? { ...P.prefs() } : { show: true, away: false };
      const patch = 'show' in s.slots ? { show: s.slots.show } : { away: !!s.slots.away };
      await P.setPrefs({ ...before, ...patch }); H.pushUndo('your status', () => P.setPrefs(before));
      return { text: 'show' in s.slots ? (s.slots.show ? 'Friends can see where you are in the app again.' : 'Hidden: friends see you online, but not where you are.') : s.slots.away ? 'You appear away. Say “I’m back” when you are.' : 'You’re back: online for everyone.' };
    },
    async 'settings.sound'() { if (window.TribeNotify && window.TribeNotify.openSettings) (window.TribeNotify.settingsTab || window.TribeNotify.openSettings)(); return { text: 'TribeCode plays no clicks or UI sounds; the only sounds are notification pings and huddles. I opened the notification settings, where pings can be muted.' }; },
    async 'chat.pin'(s, H) {
      if (!H.connected()) return { text: 'Chat lives in a tribe. Start or join one first.' };
      const x = await lastMsg(); if (!x) return { text: 'The chat is empty: nothing to pin yet.' };
      const on = s.slots.on !== false; await C.api(`/chat/${encodeURIComponent(x.ch)}/pin`, { method: 'POST', body: { id: x.m.id, on } });
      H.pushUndo(on ? 'the pin' : 'the unpin', () => C.api(`/chat/${encodeURIComponent(x.ch)}/pin`, { method: 'POST', body: { id: x.m.id, on: !on } }));
      return { text: `${on ? 'Pinned' : 'Unpinned'} “${String(x.m.text || 'the message').slice(0, 80)}” in #${x.ch}.`, acts: [['Open the chat', 'nav', 'chat']] };
    },
    async 'chat.react'(s, H) {
      if (!H.connected()) return { text: 'Chat lives in a tribe. Start or join one first.' };
      const x = await lastMsg(); if (!x) return { text: 'The chat is empty: nothing to react to yet.' };
      const e = s.slots.emoji || '👍'; await C.api(`/chat/${encodeURIComponent(x.ch)}/react`, { method: 'POST', body: { id: x.m.id, emoji: e, on: true } });
      H.pushUndo(`the ${e}`, () => C.api(`/chat/${encodeURIComponent(x.ch)}/react`, { method: 'POST', body: { id: x.m.id, emoji: e } }));
      return { text: `Reacted ${e} to “${String(x.m.text || 'the last message').slice(0, 80)}”.` };
    },
    async 'task.reopen'(s, H) { return taskPatch(s, H, t => ({ status: 'backlog' }), t => `Reopened “${t.title}”: it’s back in To do.`); },
    async 'task.unassign'(s, H) { return taskPatch(s, H, () => ({ assignee: null }), t => `“${t.title}” has no owner now: it shows up in “what needs someone”.`); },
    async 'task.priority'(s, H) {
      const all = await H.tasks(), hi = s.slots.level !== 'low';
      return taskPatch(s, H, t => { const col = all.filter(x => x.status === t.status && x.id !== t.id).map(x => Number(x.order) || 0); return { order: col.length ? (hi ? Math.min(...col) - 1 : Math.max(...col) + 1) : 0 }; },
        t => hi ? `Moved “${t.title}” to the top of ${t.status === 'doing' ? 'Doing' : 'its column'}: the top is what people pick first.` : `Moved “${t.title}” to the bottom of its column.`);
    },
    async 'file.whiteboard'() { const W = window.TribeWhiteboard; if (!W) return { text: 'The whiteboard isn’t available here.' }; W.open('wb-' + Date.now().toString(36)); return { text: 'A fresh whiteboard. Draw, drop sticky notes, or paste pictures; everyone in the tribe sees it live.' }; },
    async 'flint.clear'(s, H) { if (H.clear) H.clear(); return { text: 'Cleared. Fresh start.' }; },
    async 'doc.template'(s) {
      const TT = window.TribeTemplates, q = String(s.slots.tpl || '').toLowerCase().replace(/\btemplates?\b/g, '').trim();
      if (!TT) return { text: 'Templates live in Work › Templates.', acts: [['Open Work', 'ask', 'open work']] };
      const lib = (TT.lib && (TT.lib.list || TT.lib.items || TT.lib)) || [], L = Array.isArray(lib) ? lib : Object.values(lib);
      const hit = q && L.find(t => String(t.title || '').toLowerCase() === q || String(t.id || '') === q.replace(/\s+/g, '-')) || q && L.find(t => String(t.title || '').toLowerCase().includes(q) || q.includes(String(t.title || '').toLowerCase()));
      if (hit && TT.open) { TT.open(hit.id); return { text: `Opened the ${hit.title} template: answer its questions and it becomes a doc.` }; }
      if (TT.open) TT.open(); return { text: q ? `There’s no “${q}” template; here are all of them.` : 'Here are the doc templates.' };
    },
    async 'market.add'(s) { const M = window.TribeMarket; if (!M) return { text: 'The Marketplace isn’t available here.' }; M.open({ q: s.slots.name }); return { text: `Opened the Marketplace searching for “${s.slots.name}”. Press Add on the one you want; Remove takes it back.` }; },
    async 'inspo.search'(s) { const B = window.TribeInspoBoard; if (!B) return { text: 'The inspiration board isn’t available here.' }; B.open({ q: s.slots.q }); return { text: `Searching openly licensed pictures for “${s.slots.q}” on your inspiration board. Tap the ones you like to pin them.` }; },
    // feat/calm-parity: one meaning for "Versions" (the project's history); the designer's list is Saved designs
    async 'nav.versions'() { const V = window.TribeVersions; if (!V || !H.connected()) return { text: 'Versions belong to a project. Start or open one first.' }; V.open(); return { text: 'Here are this project’s versions. Saved designs (the website) and Earlier shots (Visuals) are linked at the top.' }; },
    async 'nav.designs'() { const D = window.TribeSiteDesigner; if (!D) return { text: 'The website designer isn’t available here.' }; D.open({}); return { text: 'Opened the website designer. Its Saved designs are under Save design; the project’s whole history is in Versions.' }; },
    async 'nav.people'() { const P = window.TribePeoplePanel; if (!P) return { text: 'People live in a tribe. Start or join one first.' }; P.open({}); return { text: 'Here’s everyone and where they are.' }; },
    async 'nav.work'() { const W = window.TribeTalent; if (!W) return { text: 'Work isn’t available here.' }; W.open(); return { text: 'Opened Work: gigs, who’s free, and the time bank.' }; },
    async 'checks.run'(s) {   // feat/build-feeds: the host's real checks (server/checks.js)
      if (!C.connected || !C.connected()) return { text: 'Checks run on your tribe’s host. Connect to a tribe first.' };
      let k; try { k = await C.api('/checks'); } catch (e) { return { text: e.message }; }
      const dur = ms => (ms < 60000 ? `${Math.round(ms / 100) / 10} s` : `${Math.round(ms / 6000) / 10} min`);
      const lastLine = k.last ? (k.last.ok ? `The last run passed in ${dur(k.last.ms)}.` : `The last run failed: ${(k.last.lines || []).slice(0, 2).join(' · ')}`) : '';
      if (/^(is|are)\b|status$/i.test(String(s.text || '').trim())) return { text: lastLine || (k.what.kind === 'none' ? k.what.why : 'The checks have not run yet.'), acts: k.can.run ? [['Run the checks', 'ask', 'run the checks']] : [] };
      if (!k.can.run) return { text: k.reason || 'You can only read this project, so I can’t start its checks.' };
      try { await C.api('/checks/run', { method: 'POST', body: {} }); } catch (e) { return { text: e.message }; }
      return { text: `Running ${k.what.label} on the host. The result shows on the Build status card and under Needs attention.` };
    },
    async 'preview.open'() { const P = window.TribePreview; if (!P || !P.open) return { text: 'The preview needs a project. Start one first.' }; P.open(); return { text: 'Opened the preview, right next to the work.' }; },
    async 'preview.share'() { const P = window.TribePublish; if (P && P.open) { P.open(); return { text: 'Opened Publish: make a play link anyone can open, then copy it.' }; } return { text: 'Say “publish it” to make a play link first.' }; },
  };
  async function taskPatch(s, H, body, say) {
    if (!H.connected()) return { text: 'Tasks live in a tribe. Start or join one first.' };
    const t = s.slots.task; if (!t || !t.id) { const open = (await H.tasks()).slice(0, 3); return { text: 'Which task?', acts: open.map(x => [x.title, 'ask', `${s.text.replace(/\s+\S+$/, '')} ${x.title}`]) }; }
    const before = (await H.tasks()).find(x => x.id === t.id) || t, b = body(before), undo = {}; Object.keys(b).forEach(k => { undo[k] = before[k] == null ? null : before[k]; });
    await C.api('/tasks/' + encodeURIComponent(t.id), { method: 'PATCH', body: b });
    H.pushUndo(`“${t.title}”`, () => C.api('/tasks/' + encodeURIComponent(t.id), { method: 'PATCH', body: undo }));
    return { text: say(before), acts: [['Open Tasks', 'nav', 'tasks']] };
  }
  if (ls.get('tribecode.motion', '') === 'off') document.documentElement.dataset.motion = 'off';
  window.TribeFlintCmds = { has: id => Object.prototype.hasOwnProperty.call(RUN, id), run: (s, H) => RUN[s.intent](s, H), timers: () => [...timers.values()] };
})();
