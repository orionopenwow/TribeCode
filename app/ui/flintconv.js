// Flint's conversation memory, tier 0 (feat/flint-local): what was just said and done stays in mind for the session, so
// a follow-up can lean on it: "tell sam too", "and another one to book the hall", "actually make it midnight",
// "make that 15", "and a pricing one", "its due tomorrow", "never mind, delete it". Also a short list of everyday
// paraphrases that are rewritten into the words flintnlu.js already knows ("start a countdown for 25 minutes").
// No model. It never overrules a command flintnlu.js is already sure of, except the few follow-up shapes below that
// only make sense as follow-ups. Browser (window.TribeFlintConv) and Node (the capability report).
//   const mem = TribeFlintConv.create()
//   mem.parse(text, ctx, NLU) -> the same shape as NLU.parse (plus .via: 'follow-up' | 'rewrite' when it stepped in)
//   mem.done(steps)           -> remember what was done          mem.turns() · mem.clear()
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintConv = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = w => (NUM[String(w).toLowerCase()] || w);
  // everyday wording -> Flint's own wording. Each is tried only when the rules were not sure, and kept only if they then are.
  const REWRITES = [
    [/^(?:i (?:need|want) |can (?:i|we) (?:get|have) |give (?:me|us) |let'?s have )?(?:a |an |some )?(?:new )?(?:spreadsheet|table|sheet)\s+(to|for|about|of)\b/i, 'make a sheet $1'],
    [/^(?:i (?:need|want) |give (?:me|us) )?(?:a |some )?(?:slides|slide deck|deck|presentation)\s+(for|about|on)\b/i, 'make slides $1'],
    [/^(?:i (?:need|want) |give (?:me|us) )?(?:a |an )?(\d+|three|four|five|six|seven|eight|nine|ten)[- ]slide\b/i, (m, n) => `make a ${num(n)} slide`],
    [/^(?:i (?:need|want) |give (?:me|us) )?(?:a |an )?(?:to-?do|todo)(?: list)? app\b/i, 'build a to do app'],
    [/^(?:start|run|begin|kick off)\s+(?:a\s+)?(?:countdown|stopwatch|clock)\s+(?:for|of)\b/i, 'set a timer for'],
    [/^(?:book|pencil in|put in|plan|add)\s+(an?\s+[\w' -]+?)\s+(?:on|for)\s+((?:next |this )?(?:mon|tues|wednes|thurs|fri|satur|sun)day\b.*|tomorrow\b.*|today\b.*)$/i, 'put $1 on the calendar $2'],
    [/^(?:quiet|quieten|silence|hush|shush|pause|snooze)\s+(?:the\s+|my\s+|all\s+)?notifications?(?:\s+for (?:a bit|now|a while))?$/i, 'mute notifications'],
    [/^(?:make\s+)?(?:the\s+)?(?:ui|interface|app|screen)\s+(?:text|font|letters)\s+(larger|bigger|smaller)$/i, (m, s) => `make the text ${s === 'smaller' ? 'smaller' : 'bigger'}`],
    [/^(bigger|larger|smaller)\s+(?:letters|lettering|font|fonts|type|words)(?:\s+(?:everywhere|please|pls))?$/i, (m, s) => `make the text ${s === 'smaller' ? 'smaller' : 'bigger'}`],
    [/^(?:switch|change|set|put)\s+(?:everything|it all|the (?:whole )?app|the interface)\s+(?:to|in|into)\s+([a-z]+)$/i, 'switch the language to $1'],
    [/^(?:what|which(?: tasks?)?)\s+(?:is|are|tasks? (?:is|are))\s+(?:still\s+)?(?:unowned|unassigned|unclaimed|up for grabs|nobody'?s)(?:\s+(?:still|right now))?$/i, 'what needs someone'],
    [/^what'?s\s+(?:happening|going on|planned|coming up|on)\s+(today|tomorrow|this week|next week)\s+(?:on|in)\s+(?:the|my|our)\s+calendar$/i, 'whats on my calendar $1'],
    [/^(\d+|two|three|four|five|six)\s+(?:pricing|price)\s+(?:plans|tiers|options)(?:\s+(?:please|pls))?$/i, (m, n) => `pricing with ${num(n)} plans`],
    [/^(?:shout|yell|announce|broadcast|holler)\s+(?:out\s+)?(?:to\s+)?(?:the\s+)?(?:group|team|tribe|everyone|everybody|all)\s+(?:that\s+)?(.+)$/i, 'post in chat that $1'],
    [/^(?:jump|hop|get)\s+(?:on|in|into)\s+(?:a\s+)?(?:quick\s+)?(?:voice|audio)\s+(?:chat|call|room)$/i, 'start a huddle'],
    [/^(?:get|bring|add|let)\s+my\s+[\w' ]+?\s+(?:into|in to|in on|join)\s+(?:this|the|our|my)\s+(?:tribe|project|room)$/i, 'invite a friend'],
    [/^(?:boil|condense|shrink|squash)\s+(?:the|this|our)\s+(?:conversation|chat|thread|discussion)\s+down(?:\s+for (?:me|us))?$/i, 'summarize the chat'],
    [/^(?:put|make|use)\s+this\s+(?:computer|machine|pc|laptop)\s+(?:online\s+)?(?:as|into)\s+(?:the|a|our)\s+(?:server|host)$/i, 'start hosting'],
    [/^(?:top up|refill|reload|add to)\s+(?:my\s+|our\s+|the\s+)?credits$/i, 'buy credits'],
    [/^(?:hunt down|track down|dig up|dig out|chase down)\s+(.+)$/i, 'find $1'],
    [/^what'?s\s+(?:left|still there)\s+for\s+me(?:\s+to do)?$/i, 'what are my tasks'],
  ];
  const FILL = /^(?:(?:and|also|then|ok(?:ay)?|oh|so|actually|wait|hmm+|never ?mind|nvm|no|nah|sorry|please|pls)[,.!]?\s+)+/i;
  const TAIL = /[\s,]+(?:instead|too|as well|also|please|pls|now|then)$/i;
  const sure = P => P && P.steps && P.steps.length && P.steps.every(s => s.intent && s.conf >= 0.6);
  const fam = id => String(id || '').split('.')[0];
  // "it's something else now": the value changes, the command stays. family -> how to say it with the new value
  const SWAP = {
    theme: v => `switch to ${v.replace(/\s*(?:theme|mode)$/i, '')} theme`, accent: v => `change the accent color to ${v}`,
    timer: (v, last) => `set a timer for ${/^\d+(?:\.\d+)?$/.test(v) ? `${v} ${last.slots && last.slots.secs && last.slots.n && last.slots.secs / last.slots.n === 1 ? 'seconds' : last.slots && last.slots.secs / last.slots.n === 3600 ? 'hours' : 'minutes'}` : v}`,
    canvas: v => `make a ${v.replace(/\s*(?:screen|one|page)$/i, '')} screen`, lang: v => `switch the language to ${v}`,
    site: v => `make a ${v.replace(/\s*(?:site|website|one|page)$/i, '')} site`, textsize: v => `make the text ${v}`,
  };
  const KIND = { doc: 'doc', document: 'doc', sheet: 'sheet', spreadsheet: 'sheet', table: 'sheet', deck: 'slides', slides: 'slides', presentation: 'slides' };

  function create() {
    let last = null, lastTask = null; const turns = [];
    function tryParse(N, text, ctx, want) { const P = N.parse(text, ctx); return sure(P) && (!want || P.steps.every(s => want(s))) ? P : null; }
    function followUp(raw, ctx, N) {
      const task = (ctx.last && ctx.last.task) || lastTask;
      let t = String(raw || '').trim().replace(/[.!]+$/, ''), bare = t.replace(FILL, '').replace(TAIL, '').trim(), m;
      const L = last, c2 = task ? { ...ctx, last: { ...(ctx.last || {}), task } } : ctx;
      // the same message to someone else: "tell sam too"
      if (L && /^(?:dm|chat)\.send$/.test(L.intent) && L.slots && L.slots.msg && (m = /^(?:and\s+|also\s+|then\s+)?(?:tell|message|text|ping|let)\s+(.+?)(?:\s+know)?\s+(?:too|as well|also|the same(?: thing)?)$/i.exec(t))) { const P = tryParse(N, `tell ${m[1]} ${L.slots.msg}`, ctx, s => /^(?:dm|chat)\.send$/.test(s.intent)); if (P) return P; }
      // one more of the same kind of thing
      if (L && L.intent === 'task.add') {
        if ((m = /^(?:and\s+|also\s+|then\s+)?(?:add\s+)?(?:another|one more|a second|a third)(?:\s+(?:one|task|todo))?\s+(?:to|for|about|:)\s*(.+)$/i.exec(t))) { const P = tryParse(N, `add a task to ${m[1]}`, ctx, s => s.intent === 'task.add'); if (P) return P; }
        if ((m = /^(?:and\s+)?(?:the\s+)?same(?:\s+(?:again|thing|one))?(?:,?\s+but)?\s+(?:for|with|about)\s+(.+)$/i.exec(t)) && L.slots && L.slots.title) { const verb = String(L.slots.title).split(/\s+/)[0], obj = /^(?:the|a|an|our|my)\s/i.test(m[1]) ? m[1] : `the ${m[1]}`, P = tryParse(N, `add a task to ${verb.toLowerCase()} ${obj}`, ctx, s => s.intent === 'task.add'); if (P) return P; }
      }
      if (L && (m = /^(?:and\s+|also\s+|plus\s+)(?:an?\s+|the\s+)?([\w -]+?)(?:\s+(?:one|screen|too|as well))+$/i.exec(t) || /^(?:and\s+|also\s+|plus\s+)(?:an?\s+)([\w -]+?)$/i.exec(t))) {
        const v = m[1].trim().toLowerCase();
        if (KIND[v] && /^(?:doc|sheet|deck)\.new$/.test(L.intent)) { const topic = L.slots && L.slots.topic ? ` for ${L.slots.topic}` : '', P = tryParse(N, `make ${KIND[v] === 'slides' ? 'slides' : 'a ' + KIND[v]}${topic}`, ctx, s => /^(?:doc|sheet|deck)\.new$/.test(s.intent)); if (P) return P; }
        if (SWAP[fam(L.intent)]) { const P = tryParse(N, SWAP[fam(L.intent)](v, L), ctx, s => fam(s.intent) === fam(L.intent)); if (P) return P; }
      }
      // a new value for the last command: "actually make it midnight", "make that 15", "try orange instead", "no, 20"
      if (L && SWAP[fam(L.intent)] && (m = /^(?:(?:actually|no|nah|wait|hmm+|sorry|oh)[,.]?\s+)*(?:(?:make|change|set|switch)\s+(?:it|that)\s+(?:to\s+)?|try\s+|go with\s+|i meant\s+|use\s+|rather\s+)?(.+?)(?:\s+instead)?$/i.exec(t)) && (/^(?:actually|no|nah|wait|sorry|make (?:it|that)|change (?:it|that)|set (?:it|that)|switch (?:it|that)|try|go with|i meant|use|rather)\b/i.test(t) || /\sinstead$/i.test(t))) {
        const P = tryParse(N, SWAP[fam(L.intent)](m[1].trim(), L), ctx, s => fam(s.intent) === fam(L.intent)); if (P) return P;
      }
      // the task we were just talking about
      if (task) {
        const ttl = String(task.title).toLowerCase();
        if ((m = /^(?:it'?s\s+|its\s+|that'?s\s+|make it\s+)?due\s+(?:on\s+|by\s+)?(.+)$/i.exec(bare))) { const P = tryParse(N, `push it to ${m[1]}`, c2, s => s.intent === 'task.due'); if (P) return P; }
        if ((m = /^(?:it'?s|its|that'?s|that is|it is)\s+for\s+(.+)$/i.exec(bare) || /^(?:give|hand|pass)\s+(?:it|that)\s+(?:over\s+)?to\s+(.+)$/i.exec(bare))) { const P = tryParse(N, `assign it to ${m[1]}`, c2, s => s.intent === 'task.assign'); if (P) return P; }
        if (/^(?:delete|remove|scrap|drop|bin|trash|kill|cancel|ditch|chuck)\s+(?:it|that|that (?:one|task|chore|todo))$/i.test(bare)) { const P = tryParse(N, `delete the task ${ttl}`, c2, s => s.intent === 'task.delete'); if (P) return P; }
        if (bare !== t && /\b(?:it|that)\b/i.test(bare)) { const P = tryParse(N, bare, c2, s => fam(s.intent) === 'task'); if (P) return P; }
      }
      return null;
    }
    function rewrite(raw, ctx, N) {
      const t = String(raw || '').trim().replace(/[.!?]+$/, '');
      for (const [rx, to] of REWRITES) { if (!rx.test(t)) continue; const P = tryParse(N, t.replace(rx, to), ctx); if (P && P.steps[0].intent !== 'help.kb') return P; }
      return null;
    }
    function parse(text, ctx, N) {
      ctx = ctx || {};
      const F = followUp(text, ctx, N); if (F) { F.via = 'follow-up'; return F; }
      const P = N.parse(text, ctx), s = P.steps[0];
      if (sure(P) && !(P.steps.length === 1 && s.intent === 'help.kb' && s.conf < 0.7)) return P;
      const R = rewrite(text, ctx, N); if (R) { R.via = 'rewrite'; return R; }
      return P;
    }
    function done(steps) {
      for (const s of steps || []) {
        if (!s || !s.intent) continue;
        last = { intent: s.intent, slots: s.slots || {}, text: s.text || '' };
        if (s.slots && s.slots.task) lastTask = s.slots.task;
        turns.push({ intent: s.intent, text: s.text || '', at: Date.now() }); if (turns.length > 12) turns.shift();
      }
    }
    return { parse, done, task: t => { lastTask = t || lastTask; }, last: () => last, turns: () => turns.slice(), clear: () => { last = null; lastTask = null; turns.length = 0; } };
  }
  return { create, REWRITES, version: 1 };
});
