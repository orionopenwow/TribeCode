// The company-running template library (feat/work-company), shared data for app/ui/doctpl.js and tests.
// Each template: { id, title, group, summary, ritual?, premium?, qs: [[key, heading, question, hint, flags]] }
//   flags: g = asked in Guided mode (3-5 per template, one at a time), l = long answer, m = a meta line at the top
//          (not a section), and ':source' = what the basic boost (no AI) fills it from when it's empty:
//          done (tasks finished lately), doing (tasks in progress), open (open tasks), mine (my open tasks),
//          members (the people), project (the project's name), today (the date).
// Advanced mode shows every question at once. A doc is "# Title" + meta lines + one "## heading" section per question.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeTemplateLib = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const T = [
    // ---------- rituals ----------
    { id: 'standup', title: 'Daily standup', group: 'Rituals', ritual: 'standup', summary: 'Three lines each: done, next, stuck. Two minutes, every weekday.', qs: [
      ['done', 'Done', 'What did you get done since last time?', 'Small wins count. "Fixed the jump bug".', 'gl:done'],
      ['next', 'Next', 'What are you doing next?', 'One or two things.', 'gl:mine'],
      ['blocked', 'Stuck', 'Anything stuck, or anyone you need?', 'Say "nothing" if it\'s all good.', 'g'],
      ['who', 'Who', 'Who is this from?', '', 'm:members'],
      ['notes', 'Notes', 'Anything else the team should know?', '', 'l'] ] },
    { id: 'weekly-review', title: 'Weekly review', group: 'Rituals', ritual: 'weekly-review', summary: 'What moved, what slipped, one focus for next week.', qs: [
      ['wins', 'Wins', 'What was the best thing that happened this week?', 'Shipped, learned, someone said yes.', 'gl:done'],
      ['missed', 'What slipped', 'What didn\'t get done, and why?', 'No blame, just the reason.', 'gl'],
      ['focus', 'Focus next week', 'If only one thing happens next week, what is it?', '', 'g'],
      ['numbers', 'Numbers', 'Any numbers worth noting (users, sign-ups, money)?', 'Only numbers you have a source for.', 'l'],
      ['open', 'Still open', 'What is still open on the board?', '', 'l:open'],
      ['week', 'Week of', 'Which week?', '', 'm:today'] ] },
    { id: 'meeting-notes', title: 'Meeting notes', group: 'Rituals', summary: 'Who was there, what was decided, who does what.', qs: [
      ['topic', 'Topic', 'What was the meeting about?', '"Launch date", "Art style"…', 'g'],
      ['decided', 'Decided', 'What did you decide?', 'One line per decision.', 'gl'],
      ['actions', 'Action items', 'Who does what next?', '"Jay: the trailer by Friday".', 'gl'],
      ['people', 'Attendees', 'Who was there?', '', 'm:members'],
      ['date', 'Date', 'When?', '', 'm:today'],
      ['discussion', 'Discussion', 'Notes from the conversation', '', 'l'] ] },
    { id: 'decision', title: 'Decision record', group: 'Rituals', summary: 'One decision, the options you weighed, and why. Future you will thank you.', qs: [
      ['decision', 'Decision', 'What did you decide?', 'Say it in one sentence.', 'g'],
      ['why', 'Why', 'Why this, and not something else?', '', 'gl'],
      ['options', 'Options considered', 'What else did you consider?', 'One per line.', 'gl'],
      ['revisit', 'Revisit when', 'When should you look at this again?', '"After 100 users", "In a month"', 'g'],
      ['owner', 'Owner', 'Who owns it?', '', 'm'],
      ['date', 'Date', 'Decided on', '', 'm:today'],
      ['consequences', 'Consequences', 'What changes because of this?', '', 'l'] ] },
    { id: 'retro', title: 'Retro', group: 'Rituals', ritual: 'retro', summary: 'What went well, what didn\'t, what to try next time.', qs: [
      ['good', 'Went well', 'What went well?', '', 'gl:done'],
      ['bad', 'Didn\'t go well', 'What didn\'t go well?', '', 'gl'],
      ['try', 'Try next time', 'What will you try next time?', 'Pick one or two, not ten.', 'gl'],
      ['shout', 'Shout-outs', 'Who deserves a thank-you?', '', 'l:members'],
      ['period', 'Period', 'Which sprint or week?', '', 'm:today'] ] },
    // ---------- plans ----------
    { id: 'okrs', title: 'OKRs', group: 'Plans', summary: 'One objective, three measurable key results, for the month or quarter.', qs: [
      ['objective', 'Objective', 'What do you want to achieve? (the objective)', 'Inspiring, not a number: "People love our first level".', 'g'],
      ['kr', 'Key results', 'How will you know? Two or three numbers.', '"40 players finish level 1", "4.5★ from testers".', 'gl'],
      ['period', 'Period', 'For which month or quarter?', '', 'gm'],
      ['owners', 'Owners', 'Who owns each key result?', '', 'l:members'],
      ['initiatives', 'Initiatives', 'What will you do to move the numbers?', '', 'l:open'],
      ['not', 'Not doing', 'What are you deliberately not doing?', '', 'l'] ] },
    { id: 'prd', title: 'Product brief (PRD)', group: 'Plans', summary: 'The problem, who has it, what you will build and how you will know it worked.', qs: [
      ['problem', 'Problem', 'What problem are you solving?', 'Describe the pain, not the feature.', 'gl'],
      ['who', 'Who it is for', 'Who has this problem?', 'Be specific: "parents who bake for school sales".', 'g'],
      ['solution', 'Solution', 'What will you build, in a sentence or two?', '', 'gl'],
      ['success', 'Success looks like', 'How will you know it worked?', 'A number or a moment.', 'g'],
      ['product', 'Product', 'Which product or project?', '', 'm:project'],
      ['scope', 'In scope', 'What\'s in the first version?', 'One per line.', 'l:open'],
      ['out', 'Out of scope', 'What\'s not in the first version?', '', 'l'],
      ['risks', 'Risks and questions', 'What could go wrong, what don\'t you know yet?', '', 'l'],
      ['timeline', 'Timeline', 'Key dates', '', 'l'] ] },
    { id: 'launch', title: 'Launch plan', group: 'Plans', summary: 'What launches, when, where you tell people and who does what.', qs: [
      ['what', 'What launches', 'What are you launching?', '', 'g:project'],
      ['when', 'Launch day', 'When is launch day?', '', 'g'],
      ['where', 'Channels', 'Where will you tell people?', 'Discord, Reddit, itch.io, a newsletter, friends…', 'gl'],
      ['goal', 'Goal', 'What would make it a good launch?', '"50 players in week one".', 'g'],
      ['checklist', 'Checklist', 'What must be done before launch?', '', 'l:open'],
      ['owners', 'Who does what', 'Who owns each part?', '', 'l:members'],
      ['after', 'After launch', 'What happens the week after?', '', 'l'] ] },
    { id: 'website', title: 'Website plan + copy brief', group: 'Plans', summary: 'The pages, the one message, the words and the call to action.', qs: [
      ['audience', 'Audience', 'Who is the website for?', '', 'g'],
      ['message', 'One message', 'If they remember one sentence, what is it?', 'This becomes your headline.', 'g'],
      ['cta', 'Call to action', 'What should a visitor do?', '"Play the demo", "Join the waitlist".', 'g'],
      ['pages', 'Pages', 'Which pages do you need?', 'Home, About, Pricing, FAQ…', 'gl'],
      ['site', 'Site', 'Site name', '', 'm:project'],
      ['tone', 'Tone of voice', 'How should it sound?', 'Friendly, short, no jargon…', 'l'],
      ['proof', 'Proof', 'Screenshots, quotes, numbers you can show', '', 'l'],
      ['seo', 'Search words', 'Words people would search for', '', 'l'] ] },
    { id: 'brand', title: 'Brand guide', group: 'Plans', summary: 'Name, voice, colors and fonts in one page anyone can follow.', qs: [
      ['name', 'Name', 'What\'s the name, and how do you write it?', '', 'g:project'],
      ['personality', 'Personality', 'Three words that describe it', '"Warm, precise, playful".', 'g'],
      ['colors', 'Colors', 'Main colors (with hex codes if you have them)', '', 'gl'],
      ['fonts', 'Type', 'Fonts for headings and text', '', 'g'],
      ['voice', 'Voice', 'How do you write? Do and don\'t', '', 'l'],
      ['logo', 'Logo', 'How to use the logo', '', 'l'] ] },
    // ---------- people ----------
    { id: 'role', title: 'Hiring / role doc', group: 'People', summary: 'The role, what success looks like in 90 days, what you offer. Posts straight to Work.', qs: [
      ['role', 'Role', 'What\'s the role called?', '"Pixel artist", "Grow lead".', 'g'],
      ['why', 'Why now', 'Why do you need someone now?', '', 'gl'],
      ['outcomes', 'First 90 days', 'What will they have done after 90 days?', '', 'gl'],
      ['offer', 'What you offer', 'Pay, time exchange, credit, learning…', '', 'g'],
      ['skills', 'Skills', 'Skills that matter', '', 'l'],
      ['hours', 'Hours', 'Hours a week', '', 'm'],
      ['team', 'The team', 'Who they\'ll work with', '', 'l:members'] ] },
    { id: 'onboarding', title: 'Onboarding', group: 'People', summary: 'Day one for a new member: where things are, who to ask, a first small task.', qs: [
      ['welcome', 'Welcome', 'A short welcome note', '', 'gl'],
      ['where', 'Where things are', 'Where do the code, docs and chat live?', '', 'gl'],
      ['buddy', 'Who to ask', 'Who should they ask for help?', '', 'g:members'],
      ['first', 'First task', 'A small first task to get going', '', 'g:open'],
      ['person', 'New member', 'Who are we onboarding?', '', 'm'],
      ['rituals', 'How we work', 'Standups, reviews, how decisions are made', '', 'l'],
      ['access', 'Access', 'Accounts and tools they need', '', 'l'] ] },
    // ---------- reports ----------
    { id: 'investor-update', title: 'Investor update', group: 'Reports', summary: 'A short monthly note for investors, mentors or friends: highlights, numbers, asks.', qs: [
      ['highlights', 'Highlights', 'What are the highlights this month?', '', 'gl:done'],
      ['numbers', 'Numbers', 'Key numbers (only ones with a source)', 'Users, revenue, runway…', 'gl'],
      ['lowlights', 'Lowlights', 'What didn\'t go well?', 'Honesty builds trust.', 'gl'],
      ['asks', 'Asks', 'How can readers help?', 'Intros, feedback, testers…', 'g'],
      ['month', 'Month', 'Which month?', '', 'm:today'],
      ['next', 'Next month', 'What\'s the plan for next month?', '', 'l:open'] ] },
    { id: 'postmortem', title: 'Incident postmortem', group: 'Reports', summary: 'What broke, the impact, the timeline, the cause and what you change. Blameless.', qs: [
      ['what', 'What happened', 'What broke?', '', 'gl'],
      ['impact', 'Impact', 'Who was affected, and how badly?', '', 'g'],
      ['cause', 'Root cause', 'Why did it happen?', 'Ask "why" five times.', 'gl'],
      ['fix', 'Follow-ups', 'What will you change so it doesn\'t happen again?', 'Each with an owner.', 'gl'],
      ['date', 'Date', 'When did it happen?', '', 'm:today'],
      ['timeline', 'Timeline', 'Timeline: detected, fixed, communicated', '', 'l'],
      ['went', 'What went well', 'What worked during the response?', '', 'l'] ] },
    // ---------- premium extras (docs/PREMIUM.md): a nudge, never a wall around the core ----------
    { id: 'board-meeting', title: 'Board meeting pack', group: 'Premium', premium: true, summary: 'Agenda, metrics, decisions needed and the pre-read for a board or advisor meeting.', qs: [
      ['agenda', 'Agenda', 'What\'s on the agenda?', '', 'gl'],
      ['metrics', 'Metrics', 'The metrics that matter this quarter', '', 'gl'],
      ['decisions', 'Decisions needed', 'What do you need the board to decide?', '', 'gl'],
      ['date', 'Date', 'Meeting date', '', 'm:today'],
      ['preread', 'Pre-read', 'Background they should read first', '', 'l'] ] },
    { id: 'fundraise', title: 'Fundraising data room', group: 'Premium', premium: true, summary: 'The checklist and the story for a raise: deck, numbers, team, terms.', qs: [
      ['raise', 'The raise', 'How much, on what terms, for what?', '', 'gl'],
      ['story', 'The story', 'Why this, why you, why now?', '', 'gl'],
      ['traction', 'Traction', 'Proof it\'s working', '', 'gl'],
      ['team', 'Team', 'Who is on the team?', '', 'l:members'],
      ['docs', 'Data room checklist', 'Documents to prepare', '', 'l'] ] },
  ].map(t => ({ ...t, qs: t.qs.map(([key, h, q, hint, flags = '']) => { const [f, src] = flags.split(':'); return { key, h, q, hint, guided: f.includes('g'), long: f.includes('l'), meta: f.includes('m'), basic: src || null }; }) }));
  const GROUPS = ['Rituals', 'Plans', 'People', 'Reports', 'Premium'];
  const byId = id => T.find(t => t.id === id) || null;

  // Markdown for a template and its answers. Empty sections stay as visible prompts, so the doc is useful at once.
  function render(t, v = {}, o = {}) {
    const date = o.date || new Date().toISOString().slice(0, 10), clean = s => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim();
    const out = [`# ${t.title}${o.suffix ? ' · ' + o.suffix : ''}`, ''];
    const metas = t.qs.filter(q => q.meta && clean(v[q.key]));
    if (metas.length) out.push(metas.map(q => `**${q.h}:** ${clean(v[q.key]).replace(/\n/g, ', ')}`).join(' · '), '');
    for (const q of t.qs.filter(x => !x.meta)) out.push(`## ${q.h}`, '', clean(v[q.key]) || `_${q.q}_`, '');
    out.push('---', '', `_Made with the ${t.title} template in TribeCode · ${date}_`);
    return out.join('\n');
  }
  const empty = (t, v) => t.qs.filter(q => !String(v[q.key] || '').trim());

  // The basic boost: fill empty answers from the project, with no model.
  function basicFill(t, v, ctx = {}) {
    const tasks = ctx.tasks || [], me = ctx.me || {}, list = a => a.slice(0, 8).map(x => `- ${x}`).join('\n');
    const src = {
      done: () => list(tasks.filter(x => x.status === 'done').sort((a, b) => String(b.updated).localeCompare(String(a.updated))).map(x => x.title)),
      doing: () => list(tasks.filter(x => x.status === 'doing').map(x => x.title)),
      open: () => list(tasks.filter(x => x.status !== 'done').map(x => x.title)),
      mine: () => list(tasks.filter(x => x.status !== 'done' && x.assignee === me.id).map(x => x.title)) || list(tasks.filter(x => x.status === 'doing').map(x => x.title)),
      members: () => (ctx.members || []).filter(m => m.role !== 'agent' && m.role !== 'spectator').map(m => m.name).join(', '),
      project: () => ctx.project || '',
      today: () => new Date().toISOString().slice(0, 10),
    };
    const out = { ...v }, filled = [];
    for (const q of empty(t, v)) { const f = q.basic && src[q.basic] && src[q.basic](); if (f) { out[q.key] = f; filled.push(q.key); } }
    return { values: out, filled };
  }
  // Read a model's "## Heading\ntext" answer back into answers, by heading.
  function parseSections(t, text) {
    const out = {}, parts = String(text || '').split(/^##\s+/m).slice(1);
    for (const p of parts) {
      const nl = p.indexOf('\n'), h = (nl < 0 ? p : p.slice(0, nl)).trim().toLowerCase(), body = nl < 0 ? '' : p.slice(nl + 1).trim();
      const q = t.qs.find(x => x.h.toLowerCase() === h) || t.qs.find(x => h.includes(x.h.toLowerCase()));
      if (q && body) out[q.key] = body;
    }
    return out;
  }
  return { TEMPLATES: T, GROUPS, byId, render, empty, basicFill, parseSections };
});
