// Work's smart suggestions, the rules half (feat/work-company, docs/DESIGN-SYSTEM.md §11). No model: it reads the task
// board, company seats, open gigs and agents, and says what would help next, each with one action a person presses.
// AI (POST /api/ai/refine kind 'work.suggest') only rewrites the wording; the actions stay these.
// Shared like aibasics-core.js: window.TribeWorkCore in the browser, require() in tests.
//   areaOf(text)           -> seat kind ('design' | 'cto' | 'growth' | 'support' | 'sales' | 'legal' | 'finance' | null)
//   agentable(task)        -> true for jobs an agent does well (tests, docs, fixes, drafts…)
//   suggest(ctx)           -> [{ id, kind, text, why, action }]   ctx = { tasks, gigs, seats, members, me, project? }
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeWorkCore = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const AREAS = [
    ['design', 'Design', 'Designer', /\b(design|ui|ux|logo|icons?|art|sprites?|colou?rs?|fonts?|mockups?|layout|figma|illustrations?|animations?|css|style|brand|theme|visuals?)\b/i, ['design', 'ui']],
    ['growth', 'Grow', 'Grow lead', /\b(post|posts|launch|marketing|social|seo|newsletter|blog|landing|ads|tweet|community|outreach|users|growth|announce|trailer|press)\b/i, ['writing', 'social']],
    ['support', 'Support', 'Support helper', /\b(support|help ?desk|faq|feedback|reply|replies|ticket|onboard)\b/i, ['support', 'writing']],
    ['sales', 'Sales', 'Sales lead', /\b(sales|leads?|pitch|clients?|deals?|proposal|prospects?)\b/i, ['sales']],
    ['legal', 'Legal', 'Legal helper', /\b(legal|terms|privacy|contract|license|gdpr)\b/i, ['legal']],
    ['finance', 'Money', 'Money keeper', /\b(budget|invoices?|pricing|costs?|tax|money|payments?|stripe)\b/i, ['finance']],
    ['cto', 'Build', 'Builder', /\b(code|bugs?|fix|api|implement|build|server|database|tests?|refactor|deploy|feature|crash|performance|endpoint|login|save|backend|frontend)\b/i, ['javascript']],
  ];
  const AGENTY = /\b(tests?|docs?|readme|refactor|typo|rename|lint|format|summari[sz]e|translate|draft|script|changelog|tidy|clean ?up|migrate|comments?|types?)\b/i;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const first = n => String(n || '').split(/\s+/)[0];
  const DAY = 86400000;

  function areaOf(text) { for (const [k, , , re] of AREAS) if (re.test(String(text || ''))) return k; return null; }
  const area = k => AREAS.find(a => a[0] === k);
  const agentable = t => !!t && AGENTY.test(`${t.title || ''} ${t.body || ''}`);
  const open = t => t && t.status !== 'done' && !t.assignee;

  function suggest(ctx = {}) {
    const tasks = (ctx.tasks || []).filter(Boolean), gigs = ctx.gigs || [], seats = ctx.seats || [], members = ctx.members || [];
    const me = ctx.me || {}, now = ctx.now || Date.now(), out = [];
    const agents = members.filter(m => m.role === 'agent');
    const untaken = tasks.filter(open);
    const liveGig = k => gigs.some(g => g.seatKind === k && ['open', 'assigned', 'working', 'review'].includes(g.stage || g.status));
    const seatHeld = k => seats.some(s => s.kind === k && s.holder && s.holder.person);

    // 1. people: work piling up in one area with nobody on it -> post a role
    const byArea = new Map();
    for (const t of untaken) { const k = areaOf(`${t.title} ${t.body || ''}`); if (k && !agentable(t)) (byArea.get(k) || byArea.set(k, []).get(k)).push(t); }
    for (const [k, list] of [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)) {
      if (list.length < 3 || liveGig(k) || seatHeld(k)) continue;
      const [, label, role, , skills] = area(k);
      out.push({ id: `post-${k}`, kind: 'post', text: `You have ${list.length} untaken tasks in ${label}, so post a ${role} role`,
        why: list.slice(0, 3).map(t => t.title).join(' · '),
        action: { type: 'post', prefill: { kind: seats.length ? 'seat' : 'task', seatKind: k, title: `${role} for ${list.length} ${label} tasks`, project: ctx.project || null, skills, tasks: list.slice(0, 20).map(t => t.id), description: `Take on: ${list.slice(0, 6).map(t => t.title).join('; ')}.` } } });
    }
    // 2. agents: small, well-defined jobs -> "Claude could take these 2"
    const forAgent = untaken.filter(agentable).slice(0, 3);
    if (agents.length && forAgent.length) {
      const mine = agents.find(a => a.owner === me.id) || agents[0];
      const who = /claude/i.test(mine.name) ? 'Claude' : first(mine.name);
      out.push({ id: 'agent', kind: 'agent', text: `${who} could take ${forAgent.length === 1 ? 'this one' : `these ${forAgent.length}`}`, why: forAgent.map(t => t.title).join(' · '),
        action: { type: 'assign-tasks', agent: mine.id, agentName: mine.name, tasks: forAgent.map(t => t.id) } });
    } else if (!agents.length && forAgent.length >= 2) {
      out.push({ id: 'agent-connect', kind: 'agent', text: `${plural(forAgent.length, 'task')} look right for an AI helper: connect your Claude to hand them off`, why: forAgent.map(t => t.title).join(' · '), action: { type: 'connect-ai' } });
    }
    // 3. company: an empty seat
    for (const s of seats) {
      if (s.kind === 'ceo' || (s.holder && (s.holder.person || s.holder.agent)) || liveGig(s.kind)) continue;
      out.push({ id: `seat-${s.id}`, kind: 'seat', text: `The ${s.title} seat is empty: find someone for it`, why: (s.charter && s.charter.goal) || 'A seat with nobody in it', action: { type: 'hire-seat', seat: s.id, project: ctx.project || null } });
      break;
    }
    // 4. the loop: review, credit, check in, start
    for (const g of gigs) {
      const st = g.stage || (g.status === 'filled' ? 'assigned' : g.status);
      const last = Math.max(Date.parse(g.assignedAt || g.at || 0) || 0, ...(g.updates || []).map(u => Date.parse(u.at) || 0));
      if (g.canManage && st === 'review') out.push({ id: `review-${g.id}`, kind: 'review', text: `${first(g.filledName) || 'Someone'} handed in "${g.title}": review it`, why: 'Approve it or ask for changes', action: { type: 'open-gig', gig: g.id } });
      else if (g.canManage && st === 'done') out.push({ id: `credit-${g.id}`, kind: 'credit', text: `Credit ${first(g.filledName) || 'them'} for "${g.title}"`, why: g.pay && g.pay.type === 'paid' ? `Pay note: ${g.pay.text || 'paid'}` : 'Hours in the time bank, or a thank-you', action: { type: 'open-gig', gig: g.id } });
      else if (g.mine && st === 'assigned') out.push({ id: `start-${g.id}`, kind: 'start', text: `You've got "${g.title}": post a first update`, why: 'One line is enough', action: { type: 'open-gig', gig: g.id } });
      else if (g.canManage && (st === 'assigned' || st === 'working') && now - last > 3 * DAY) out.push({ id: `check-${g.id}`, kind: 'check', text: `Check in on "${g.title}" (no update in ${Math.floor((now - last) / DAY)} days)`, why: `${g.filledName || 'Someone'} has it`, action: { type: 'open-gig', gig: g.id } });
      else if (g.canManage && st === 'open' && (g.applicantCount || 0) > 0) out.push({ id: `match-${g.id}`, kind: 'match', text: `${plural(g.applicantCount, 'person')} asked for "${g.title}": pick one`, why: 'Matches are ranked by skills and seats', action: { type: 'open-gig', gig: g.id } });
    }
    const rank = { review: 0, credit: 1, start: 2, post: 3, agent: 4, match: 5, check: 6, seat: 7 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 6);
  }

  return { areaOf, agentable, suggest, AREAS: AREAS.map(([k, label, role]) => ({ kind: k, label, role })) };
});
