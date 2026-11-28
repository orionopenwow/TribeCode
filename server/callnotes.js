// p13b: meeting notes from a call, saved as captures (files/captures/*.md + .json), so they show in Files and feed the
// Brain and TRIBE_CONTEXT like every other capture. When a call with Notes on ends (or Notes is turned off):
//   * ONE meeting note: title (date + project, or the two people for a DM call), attendees, duration, the full
//     speaker-labelled transcript, summary, key points, decisions and action items with owners (the deterministic
//     summarizer in capture-sum.js via captures.captureVoice; a model rewrite afterwards when the tribe has an AI),
//   * one note per person: "<Name>'s notes — <meeting>" with their own lines and the action items given to them,
//   * one chat line in the call's channel: "Meeting notes saved" with the summary and an Open button.
// Visibility follows the call: a project call's notes are the project's; a DM call's notes are only for its two people
// (the captures' `dm` field, checked by captures.visible).
'use strict';

const pad = n => String(n).padStart(2, '0');
const when = t => { const d = new Date(t); return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const first = n => String(n || '').trim().split(/\s+/)[0];

module.exports = function callNotes({ P, captures, getMembers, postChat, llm = null, log = () => {}, meetingFor = () => null }) {
  const member = id => getMembers().find(m => m.id === id) || null;

  // { project, started, ended, lines:[{ at, by, name, text, mic? }], dm, attendees:[id], by, tasks }
  async function save({ project, started, ended, lines, dm = null, attendees = [], by = null, tasks = 0 }) {
    if (!lines || !lines.length) return null;
    const pid = project || P.current() || P.defaultId();
    return P.inProject(pid, async () => {
      const t0 = Date.parse(started) || Date.parse(lines[0].at) || Date.now();
      const t1 = Math.max(Date.parse(ended) || 0, Date.parse(lines[lines.length - 1].at) || 0, t0);
      const dur = Math.max(1, Math.round((t1 - t0) / 1000));
      const people = [...new Set([...attendees, ...lines.map(l => l.by)])].map(member).filter(m => m && m.role !== 'agent');
      const names = people.map(m => m.name);
      const proj = (P.get(pid) || {}).name || 'the project';
      const mt = meetingFor({ project: pid, dm });   // p14: a scheduled meeting joined from its card names the note and carries its agenda
      const title = mt ? `${mt.title} · ${when(t0)}` : dm ? `Call · ${when(t0)} · ${names.join(' & ')}` : `Meeting · ${when(t0)} · ${proj}`;
      const starter = member(by) || people[0] || { id: 'tribecode', name: 'TribeCode', role: 'host' };
      const tLine = l => ({ t: Math.max(0, Math.round((Date.parse(l.at) - t0) / 1000)), who: l.name === 'Speaker' ? `Speaker (${first(l.mic)}'s mic)` : first(l.name), text: String(l.text || '') });
      const channel = dm || 'general';

      // the meeting note: the capture's author line carries the attendees
      const { capture: c } = await captures.captureVoice({ ...starter, name: names.join(', ') || starter.name }, { lines: lines.map(tLine), title, recipe: 'meeting', dur, channel });
      if (mt) { c.meeting = mt.id; if (mt.agenda) { c.agenda = mt.agenda; c.summary = `Agenda: ${clip(mt.agenda.replace(/\n+/g, '; '), 300)}\n\n${c.summary || ''}`.trim(); } }
      c.site = dm ? 'Call' : 'Meeting'; c.source = 'call'; c.attendees = names; c.ended = new Date(t1).toISOString(); c.transcriptVia = 'each person\'s own mic (call Notes)';
      captures.save(c);

      // one note per person: their own lines + the action items given to them
      const notes = [];
      for (const m of people) {
        const own = lines.filter(l => l.by === m.id);
        const key = [m.name.toLowerCase(), first(m.name).toLowerCase()];
        const acts = (c.actions || []).filter(a => key.includes(String(a.owner || '').toLowerCase()));
        if (!own.length && !acts.length) continue;
        const { capture: n } = await captures.captureVoice(m, { lines: own.map(tLine), title: `${m.name}'s notes — ${title}`, recipe: 'voice', dur, channel });
        n.site = 'Meeting notes'; n.source = 'call'; n.attendees = names; n.links = { ...(n.links || {}), meeting: c.id };
        n.actions = acts.map(a => ({ ...a })); n.edited = { ...(n.edited || {}), actions: true };
        if (!own.length) { n.status = 'ready'; n.note = ''; n.summary = `${m.name} didn't speak while Notes was on. Action items for ${first(m.name)} from ${title}.`; }
        captures.save(n); notes.push(n);
      }
      c.links = { ...(c.links || {}), notes: notes.map(n => n.id) }; captures.save(c);

      const tasksNote = tasks ? ` · ${tasks} action item${tasks > 1 ? 's' : ''} added to Tasks` : '';
      postChat(channel, 'tribecode', `📝 Meeting notes saved: ${title}${tasksNote}${notes.length ? ` · ${notes.length} personal note${notes.length > 1 ? 's' : ''} in Files` : ''}`,
        { capture: { id: c.id, title: c.title, kind: c.kind, site: c.site, url: '', thumb: false, summary: clip(c.summary, 280), actions: (c.actions || []).length, status: c.status, note: '', emoji: '📝' } });

      // a plain-words rewrite by the tribe's AI when one is set up (the quick summary stays when it isn't)
      if (llm && starter.id !== 'tribecode') captures.rewrite(c, starter).then(() => captures.save(c)).catch(e => log('call notes: no rewrite (' + (e.message || e) + ')'));
      return { meeting: c, notes };
    });
  }
  return { save };
};
