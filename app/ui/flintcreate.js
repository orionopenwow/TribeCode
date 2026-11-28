// Flint in the creators (pass 4, docs/CLAUDE-HOOKS.md, docs/FLINT-CREATORS.md): one Flint for the website designer
// and App Creator, at three levels, plus the hand-off to a stronger AI.
//
//   Level           Runs on                              What it does here
//   rules           anywhere, no AI                      flintnlu.js reads the sentence; the creator makes the edit (one Undo)
//   browser         the built-in model (WebGPU)          a loose request becomes 1 to 5 of Flint's OWN commands, worded like
//   computer        a local model on this computer       the examples in ASKS. check() re-reads every command with the rules
//                   or the tribe's host (Ollama…)        and refuses anything that is not one known creator command. The
//                                                        model never writes HTML or JSON designs, and never runs anything.
//   agent           a member's own AI helper, or the     "Make it beautiful": a design brief goes to the helpers, who read
//                   host's AI key                        the design and PROPOSE steps over MCP (site_read / site_propose,
//                                                        app_read / app_propose). A person approves; before and after show.
//
// Every reply carries the level that answered (the badge in the thread) and an Undo when it changed something.
// Pure part (browser + Node): LEVELS, ASKS (the everyday requests each creator must handle with no AI; the eval and
// the model's examples come from this one list), sys(), check(), brief(), help().
//   window.TribeFlintCreate = { LEVELS, ASKS, sys, check, brief, help, loose(text, { kind, ctx }), hasAI(), beautify(kind, o),
//                               site(step, api), appAsk(text, api), appPanel(host, api), appChips(api), polish(kind, api) }
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintCreate = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const LEVELS = {
    rules: { label: 'No AI', title: 'Answered by Flint’s rules. Nothing left this device.' },
    browser: { label: 'In this browser', title: 'A small model running in this browser chose the commands. Nothing left this device.' },
    computer: { label: 'On this computer', title: 'A local model on your own computer chose the commands. Nothing was sent to an AI service.' },
    agent: { label: 'A stronger AI', title: 'Your tribe’s own AI did this.' },
  };
  // The everyday requests, as [sentence, needs a selection?]. Each must be understood by the rules alone (flintnlu.js),
  // inside its creator. app/test/flintcreate_test.js checks every one; scripts/dev/flint-eval-cases.js adds them to the eval.
  const ASKS = {
    app: [
      ['add a settings screen'], ['add a profile screen'], ['add a screen called Favorites'], ['add an onboarding flow'], ['add a paywall'], ['add a sign in screen'], ['add a chat screen'], ['add a list'], ['add a button'], ['add a search bar'], ['add a chart'], ['add a picture'], ['add a form'], ['add a tab bar'], ['add a map'],
      ['make it dark'], ['dark mode'], ['make it light'], ['make it blue'], ['use teal as the main colour'], ['change the colour to #2F5BEA'], ['rounder'], ['sharper corners'], ['pill buttons'], ['more space'], ['make it compact'], ['change the font'], ['use a serif font'], ['bolder icons'], ['calmer motion'], ['snappier'],
      ['use the android look'], ['use the iphone look'], ['use the midnight look'], ['rename the app to Trailmix'],
      ['link this to settings', 1], ['link this button to the profile screen', 1], ['open it as a sheet', 1],
      ['change this to Welcome back', 1], ['make this say Get started', 1], ['remove this', 1], ['delete this', 1], ['duplicate this', 1], ['move this up', 1], ['move this down', 1], ['change the icon to a heart', 1], ['change the picture', 1],
      ['delete this screen'], ['rename this screen to Home'], ['make this the first screen'], ['duplicate this screen'],
      ['play it'], ['undo'], ['undo that'], ['redo'], ['export it'], ['make a habit tracker app'], ['make it like the recipes template'], ['start over with the meditation template'],
      ['add offline storage'], ['add a dark mode switch'], ['add reminders'], ['what features can you add?'], ['polish it'], ['make it beautiful'], ['what can you do here?'],
    ],
    site: [
      ['add a page called About'], ['add a contact page'], ['add a gallery'], ['add a pricing section'], ['add testimonials'], ['add a faq'], ['add a contact form'], ['add a newsletter signup'], ['add a footer'], ['add a video'], ['add a team section'], ['add a link for my book club'], ['add my instagram'],
      ['dark mode'], ['light mode'], ['make it blue'], ['make the main colour teal'], ['change the colour to #2F5BEA'], ['rounder corners'], ['sharper corners'], ['more space'], ['less space'], ['change the fonts'], ['use a serif font'], ['use the paper look'], ['make the buttons pill shaped'], ['outline buttons'],
      ['make the buttons work'], ['link this button to the contact page', 1], ['link this to https://example.com', 1],
      ['change the title to Fresh bread daily'], ['change this to Open today', 1], ['make this bigger', 1], ['make this smaller', 1], ['make this bold', 1], ['center this', 1], ['make this teal', 1],
      ['move this section up', 1], ['move this section down', 1], ['remove this section', 1], ['duplicate this section', 1], ['hide this section', 1], ['hide this on phones', 1], ['make this section dark', 1], ['center the text in this section', 1], ['make this section narrower', 1],
      ['replace the picture', 1], ['make the picture round', 1], ['describe the picture', 1],
      ['rename this page to Menu'], ['delete the about page'], ['move the gallery to the top'],
      ['undo'], ['undo that'], ['redo'], ['check my site'], ['fix what is safe'], ['download the html'], ['publish it'], ['make it like the cafe template'], ['start from the portfolio template'],
      ['add a fade in'], ['what do you suggest?'], ['polish it'], ['make it beautiful'], ['what can you do here?'],
    ],
  };
  const PREFIX = { site: /^site\./, app: /^app\./ };
  // What a model MAY start inside a creator: a closed list of edits to the design, each one Undo. Everything else is
  // refused: replacing the whole design (templates, "make a … app"), removing things, writing files, going public,
  // reaching other people, and anything outside the creator. A person says those themselves.
  const MODEL_OK = {
    app: /^app\.(?:kit|block|tabbar|theme|preset|platform|link|screen|rename|feature|el\.(?:text|dup|move|icon|how)|screen\.(?:rename|first|dup))$/,
    site: /^site\.(?:align|announce|bg|bio|block\.(?:add|color|dup|hide|move|show)|button\.(?:add|email|phone)|buttons|color|contact\.email|contrast|copyright|countdown|dark|el\.(?:align|color|item|show|size|text|weight)|entrance|faq\.add|feature\.add|font|fontpair|footer|fx|gallery|gallery\.add|hours|image\.(?:alt|shape)|item\.add|layout|link\.(?:add|move|url)|map|nav\.add|page\.(?:add|move|rename)|palette|price\.(?:add|highlight|plans)|quote\.add|radius|section\.title|seo|size|social\.add|spacing|stat\.add|style|team\.add|text|theme|tidy|time|titlecase|video|width|wire)$/,
  };
  const NEVER = { test: (id, kind) => !(MODEL_OK[kind || (/^app\./.test(id) ? 'app' : 'site')] || /$^/).test(id) };
  const ctxFor = (kind, ctx, sel) => kind === 'app' ? { now: new Date(), view: 'appcreator', selection: !!sel, selKind: sel ? 'button' : '', screens: (ctx && ctx.screens) || [], ...(ctx || {}) } : { view: 'site', site: true, selection: !!sel, selKind: sel ? 'text' : '', pages: (ctx && ctx.pages) || [], start: false, ...(ctx || {}) };

  // the instruction for a small model: the examples nearest to the request, from ASKS
  function sys(kind, text, N, ctx) {
    const all = ASKS[kind].filter(([t]) => { const s = (N.parse(t, ctxFor(kind, null, true)).steps || [])[0]; return s && s.intent && MODEL_OK[kind].test(s.intent); }).map(a => a[0]);
    let near = all;
    try { const idx = N.index(all.map((t, i) => ({ id: i, text: t }))); near = [...new Set([...N.search(idx, text, 14).map(h => all[h.doc.id]), ...all.slice(0, 6)])]; } catch {}
    const names = kind === 'app' ? (ctx && ctx.screens) || [] : (ctx && ctx.pages) || [];
    return `You turn a person's request into commands for Flint inside ${kind === 'app' ? 'App Creator (a phone app design tool)' : 'the website designer'} of TribeCode. You cannot change anything yourself; you only choose commands.\n` +
      `Reply with JSON only. Either {"ops":[{"say":"<command>"}]} with 1 to 5 commands worded like the examples below (keep the person's own names, words and colours), or {"text":"<one short sentence>"} when no command fits.\n` +
      `Commands (examples):\n${near.slice(0, 18).map(t => `- ${t}`).join('\n')}` +
      (root.TribeAIGuide && root.TribeAIGuide.trimmed(kind) ? `\n${root.TribeAIGuide.trimmed(kind)}` : '') + (ctx && ctx.brief ? `\n${String(ctx.brief).slice(0, 400)}` : '') +   // feat/ai-guides: the same rules every AI gets here, cut to a few lines
      (names.length ? `\n${kind === 'app' ? 'Screens' : 'Pages'}: ${names.slice(0, 16).join(', ')}` : '') + (ctx && ctx.selection ? '\nSomething is selected: “this” means the selected thing.' : '\nNothing is selected.');
  }
  // -> { ok, says: [sentence], text, why }   strict: the shape, 1 to 5 ops, each one exactly one sure creator command
  function check(obj, N, ctx, kind) {
    const bad = why => ({ ok: false, why, says: [] });
    if (!PREFIX[kind]) return bad('unknown creator');
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('not an object');
    const keys = Object.keys(obj); if (keys.some(k => k !== 'ops' && k !== 'text')) return bad(`unknown field “${keys.find(k => k !== 'ops' && k !== 'text')}”`);
    if (obj.ops === undefined) { if (typeof obj.text !== 'string' || !obj.text.trim()) return bad('neither ops nor text'); return { ok: true, says: [], text: obj.text.trim().slice(0, 400) }; }
    if (!Array.isArray(obj.ops) || !obj.ops.length || obj.ops.length > 5) return bad('ops must be a list of 1 to 5');
    const says = [];
    for (const op of obj.ops) {
      if (!op || typeof op !== 'object' || Array.isArray(op)) return bad('an op is not an object');
      if (Object.keys(op).some(k => k !== 'say')) return bad('an op has a field I do not know');
      if (typeof op.say !== 'string' || op.say.length < 2 || op.say.length > 200 || /[\n\r<>{}`]/.test(op.say)) return bad('an op has no plain “say” sentence');
      const P = N.parse(op.say, ctxFor(kind, ctx, ctx && ctx.selection)), s = (P.steps || [])[0];
      if ((P.steps || []).length !== 1 || !s || !s.intent || s.conf < 0.6) return bad(`“${op.say}” is not one of my commands`);
      if (!PREFIX[kind].test(s.intent)) return bad(`“${op.say}” is not a command for this tool`);
      if (!MODEL_OK[kind].test(s.intent)) return bad(`a model may not start “${s.intent}”`);
      if (s.ask) return bad(`“${op.say}” is missing a detail`);
      says.push(op.say.trim());
    }
    return { ok: true, says, text: typeof obj.text === 'string' ? obj.text.slice(0, 400) : '' };
  }
  // The design brief a stronger AI gets (docs/CLAUDE-HOOKS.md). Plain text: any MCP agent can follow it.
  function brief(kind, o) {
    o = o || {}; const app = kind === 'app', k = o.brand || {};
    const cols = k.colors && typeof k.colors === 'object' ? Object.entries(k.colors).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).slice(0, 6).map(([n, v]) => `${n} ${v}`).join(', ') : '';
    return [
      `${app ? 'App' : 'Website'} design request${o.from ? ` from ${o.from}` : ''} (made in TribeCode's ${app ? 'App Creator' : 'website designer'}): ${String(o.ask || '').trim() || 'Make it more beautiful: a clearer order of what is read first, calmer spacing, colour and type that fit the brand. Keep what it says and what it does.'}`,
      '',
      'How to do it (the hook contract is docs/CLAUDE-HOOKS.md):',
      `0. The project brief is on top of this request (project_brief returns it again). Call get_guide("${app ? 'app' : 'website'}") and follow it: it has every step with an example and how to make the result good.`,
      `1. Call ${app ? 'app_read' : 'site_read'} to get the design, the brand kit and the steps you may use.`,
      `2. Call ${app ? 'app_propose' : 'site_propose'} with { ops: [...], note: "what you changed and why, in one or two sentences" } (dry_run: true tries it first), then ${app ? 'app_check' : 'site_check'} with proposed: true.`,
      'Do not edit files for this. Nothing changes until a person approves your proposal; they see it before and after, and Undo takes it back. Steps that are not on the list are skipped.',
      '',
      `Brand kit: ${[k.name ? `name ${k.name}` : '', cols ? `colours ${cols}` : '', k.fonts ? `fonts ${typeof k.fonts === 'string' ? k.fonts : Object.values(k.fonts).filter(Boolean).join(' + ')}` : '', k.voice ? `voice: ${String(k.voice).slice(0, 200)}` : ''].filter(Boolean).join('; ') || 'none saved yet (keep the colours and fonts the design already has unless asked)'}`,
      `Audience: ${String(o.audience || '').trim().slice(0, 300) || 'not written down; judge from the words in the design'}`,
      o.outline ? `The design now:\n${String(o.outline).slice(0, 2400)}` : '',
    ].filter(x => x !== '').join('\n');
  }
  // "what can you do here?": said, not shrugged
  function help(kind) {
    return kind === 'app'
      ? { text: 'Here, with no AI, I add screens and ready-made flows, add parts, change the words of what you select, link buttons to screens, change the whole look (colour, dark or light, corners, spacing, type, motion), switch between the iPhone and Android look, add working features, tidy the design, play it and export it. Every step has an Undo.', chips: ['Add a settings screen', 'Make it dark', 'Add a tab bar', 'What features can you add?', 'Polish it'] }
      : { text: 'Here, with no AI, I add pages and sections, change any words, colours, fonts, corners and spacing, wire buttons and links, move, hide or remove sections, swap pictures, check the site for problems and fix the safe ones, tidy the design, and download or publish it. Every step has an Undo.', chips: ['Add a page called About', 'Make the buttons work', 'Dark mode', 'Check my site', 'Polish it'] };
  }
  const pure = { LEVELS, ASKS, NEVER, MODEL_OK, sys, check, brief, help, ctxFor, version: 1 };
  if (typeof document === 'undefined') return pure;

  // ---------- in the app ----------
  const C = root.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (root.TribeI18n && root.TribeI18n.t ? (root.TribeI18n.t(s, s) || s) : s);
  const connected = () => !!(C && C.connected && C.connected());
  const LLM = () => root.TribeFlintLLM, NLU = () => root.TribeNLU, POL = () => root.TribePolish;
  const levelNow = () => { const c = LLM() && LLM().config ? LLM().config() : {}; return c.backend === 'browser' ? 'browser' : 'computer'; };

  // one line on the project for a local model (server/aiguides.js; kept for five minutes; '' with no tribe)
  let lineAt = 0, lineOf = '', lineVal = '';
  async function projectLine(kind) {
    let pid = ''; try { pid = (C.project && C.project()) || (C.state && C.state().project) || ''; } catch {}
    if (!pid || !connected()) return '';
    if (lineOf === pid && Date.now() - lineAt < 300000) return lineVal;
    try { lineVal = (await C.api(`/projects/${encodeURIComponent(pid)}/ai-brief?kind=${kind === 'app' ? 'app' : 'site'}`)).line || ''; } catch { lineVal = ''; }
    lineOf = pid; lineAt = Date.now(); return lineVal;
  }
  // a loose request -> Flint's own commands, through the local model when there is one. null = no model, or it had nothing
  async function loose(text, o) {
    const L = LLM(), N = NLU(); if (!L || !N || !L.ready || !L.ready() || !L.chat) return null;
    try {
      const line = await projectLine(o.kind);   // feat/ai-guides: one line on what the project is, for the model's choice of words
      const raw = await L.chat([{ role: 'system', content: sys(o.kind, text, N, line ? { ...(o.ctx || {}), brief: line } : o.ctx) }, { role: 'user', content: String(text).slice(0, 600) }], { json: true, max: 300, timeoutMs: 30000 });
      const obj = L.parseReply ? L.parseReply(raw) : null, v = check(obj, N, o.ctx, o.kind);
      if (!v.ok) return { says: [], text: '', level: levelNow(), why: v.why };
      return { says: v.says, text: v.text, level: levelNow() };
    } catch (e) { return { says: [], text: '', level: levelNow(), why: String(e && e.message || e) }; }
  }

  // is there a stronger AI in this tribe right now: a member's own helper, or the host's AI key
  let aiAt = 0, aiVal = { any: false, agents: [], host: false };
  async function hasAI(force) {
    if (!connected()) return { any: false, agents: [], host: false };
    if (!force && Date.now() - aiAt < 30000) return aiVal;
    let agents = []; try { agents = ((C.state && C.state().members) || []).filter(m => m.role === 'agent'); } catch {}
    let host = false; try { const t = await C.api('/flint/tiers'); host = !!(t && t.now && t.now.host && t.now.host.online); } catch {}
    // only a member's own helper can read the design and send a proposal back (docs/CLAUDE-HOOKS.md). The host's AI key
    // by itself answers in chat; nothing there picks up a design brief, so it does not count here.
    aiAt = Date.now(); aiVal = { any: !!agents.length, agents, host };
    return aiVal;
  }
  // "Make it beautiful": the brief goes to the tribe's own AI; its proposal comes back for a person to approve
  async function beautify(kind, o) {
    const ai = await hasAI(true), app = kind === 'app';
    if (!ai.any) return { sent: false, text: tr(ai.host
      ? `Your tribe’s AI key answers in chat, but it cannot read and restyle the ${app ? 'app' : 'site'} yet. A member’s own AI helper can: connect one under AI helpers and it proposes changes for you to approve. Nothing was sent. With no AI, “Polish it” tidies spacing, sizes, colours and buttons right now.`
      : `A stronger AI can restyle the whole ${app ? 'app' : 'site'} at once: new layouts, colour and type chosen for your brand, rewritten words. None is connected to this tribe, so nothing was sent. With no AI, “Polish it” tidies spacing, sizes, colours and buttons right now.`), chips: ['Polish it'] };
    let kit = {}; if (o.pid) { try { kit = (await C.api(`/projects/${encodeURIComponent(o.pid)}/brand`)).kit || {}; } catch {} }
    let me = ''; try { me = ((C.state && C.state().me) || {}).name || ''; } catch {}
    const FB = root && root.TribeFilesBrain, knows = FB && FB.knows ? FB.knows() : '';   // p13: "Use what Files knows" (on by default when Files has links)
    const text = brief(kind, { ask: o.ask, from: me, brand: kit, audience: o.audience, outline: o.outline }) + (knows ? `\n\n${knows}` : '');
    try {
      await C.api('/coord/asks', { method: 'POST', body: { text, design: app ? 'app' : 'site' }, ...(o.pid ? { project: o.pid } : {}) });   // design: the server puts the project brief on top (server/aiguides.js)
    } catch (e) { return { sent: false, text: `${tr('That could not be sent')}: ${e && e.message ? e.message : tr('the tribe did not answer')}.`, chips: ['Polish it'] }; }
    return { sent: true, text: tr(app ? 'Sent to your tribe’s AI. It reads the design and proposes changes. You see before and after under Suggested changes, and nothing changes until a person approves.' : 'Sent to your tribe’s AI. It reads the site and proposes changes. You see before and after under Suggested changes, and nothing changes until a person approves.'), chips: [] };
  }

  // ---------- Polish it (polish.js) ----------
  function polish(kind, api) {
    const P = POL(); if (!P) return tr('Polish is not loaded here.');
    const items = kind === 'app' ? P.app(api.design(), api.core()) : P.site(api.design(), api.core());
    if (!items.length) return tr('Nothing to tidy: spacing, sizes, colours and buttons all check out.');
    const fixes = items.filter(i => i.run);
    P.open({ kind, items, host: api.host && api.host(), onApply: picked => {
      const r = P.apply(api.design(), picked); if (!r.done.length) { api.say(tr('Nothing changed.')); return; }
      api.commit(r.design);
      api.say(`${tr('Polished')}: ${r.done.length === 1 ? r.done[0] : `${r.done.length} ${tr('changes')}`}.`, r.done.length > 1 ? `<ul class="stu-done fc-done">${r.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '', true);
    } });
    return fixes.length ? tr(fixes.length === 1 ? 'I found one thing to tidy. It is listed for you: nothing changes until you press Apply.' : `I found ${fixes.length} things to tidy. They are listed for you: nothing changes until you press Apply.`) : tr('Nothing to fix automatically. A few things are worth a look by hand: they are listed for you.');
  }

  // ---------- the website designer: the steps the rules hand to this file ----------
  // api = { design(), core(), commit(cfg), say(text, html, undo), pid(), panel(name), outline(), host() } -> the words to say, or '' when said already
  async function site(step, api) {
    const id = step.intent;
    if (id === 'site.polish') return polish('site', api);
    if (id === 'site.help') { const h = help('site'); api.say(tr(h.text), '', false, h.chips); return ''; }
    if (id === 'site.check') { api.panel('check'); const n = api.core().check(api.design()).filter(x => x.level === 'fix').length; return n ? tr(`Opened Check: ${n} ${n === 1 ? 'thing' : 'things'} to fix. Say “fix what is safe” and I do the safe ones in one step.`) : tr('Opened Check. Nothing needs fixing.'); }
    if (id === 'site.fixall') {
      const S = api.core(), list = S.check(api.design()).filter(x => x.fix && x.level === 'fix'), r = S.applyOps(api.design(), list.flatMap(x => x.fix.ops));
      if (!r.done.length) return tr('Nothing safe to fix automatically. Open Check to see what is left to do by hand.');
      api.commit(r.cfg); api.say(`${tr('Fixed what is safe')}: ${r.done.length === 1 ? r.done[0] : `${r.done.length} ${tr('changes')}`}.`, r.done.length > 1 ? `<ul class="stu-done fc-done">${r.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : '', true); return '';
    }
    if (id === 'site.el.colorname') { const n = (step.slots.color && step.slots.color.name) || 'that colour'; api.say(tr(`Words can be the main colour, quiet or strong. To use ${n} here, make it the site’s main colour, then give these words the main colour.`), '', false, [`Make the main colour ${n}`, 'Make this the main colour']); return ''; }
    if (id === 'site.beautify') { const r = await beautify('site', { pid: api.pid(), outline: api.outline(), ask: '' }); api.say(r.text, '', false, r.chips, r.sent ? 'agent' : 'rules'); return ''; }
    return null;
  }

  // ---------- App Creator ----------
  // api = { st(), core(), apply(op), commit(doc, say), undo(), redo(), paint(), flint(step), note(t), root(), pid(), close() }
  const ICONW = { heart: 'heart', love: 'heart', star: 'star', home: 'home', house: 'home', search: 'search', gear: 'settings', settings: 'settings', cog: 'settings', bell: 'bell', user: 'user', person: 'user', profile: 'user', plus: 'plus', check: 'check', tick: 'check', cart: 'cart', bag: 'bag', camera: 'camera', map: 'map', pin: 'pin', calendar: 'calendar', clock: 'clock', book: 'book', music: 'music', moon: 'moon', sun: 'sun', leaf: 'leaf', fire: 'flame', flame: 'flame', chat: 'chat', message: 'chat', mail: 'mail', lock: 'lock', trash: 'trash', gift: 'gift', bolt: 'bolt', lightning: 'bolt' };
  const flog = api => { const s = api.st(); if (!s.flog) s.flog = []; return s.flog; };
  const mounts = new Set();
  function appSay(api, text, o) {
    o = o || {}; const s = api.st(); if (!s) return text;
    const acts = [...(o.undo ? [{ label: 'Undo', fn: () => { api.undo(); appSay(api, tr('Undone.')); } }] : []), ...(o.chips || []).map(c => /…$/.test(c) ? { label: c, act: 'fill', arg: c.replace(/…$/, '') } : { label: c, act: 'ask', arg: c })];
    flog(api).push({ who: 'flint', text: String(text || ''), html: o.html || '', acts, lvl: o.lvl || 'rules', at: new Date().toISOString() });
    s.flog = flog(api).slice(-40); drawApp(api);
    const panel = api.root() && api.root().querySelector('.apc-flint .flint-mount'); if (!panel || !panel.offsetParent) api.note(String(text || ''));   // on a phone the panel is in a sheet: the short note still shows
    return text;
  }
  function drawApp(api) { const s = api.st(); mounts.forEach(u => { if (!u.el.isConnected) { mounts.delete(u); return; } u.set((s && s.flog) || []); u.chips(appChips(api).slice(0, 3)); }); }
  function appChips(api) {
    const s = api.st(); if (!s || !s.doc) return [];
    if (s.sel) return ['Change this to…', 'Link this to…', 'Move this up', 'Duplicate this', 'Remove this'];
    return [s.doc.theme.mode === 'dark' ? 'Make it light' : 'Make it dark', 'Add a settings screen', ...(s.doc.screens.some(x => x.blocks.some(b => b.type === 'tabs')) ? ['Rounder'] : ['Add a tab bar']), 'What can you do here?'];
  }
  // the Flint panel, the same chat as in the website designer (TribeFlint.mount). host: the old one-line form, or a sheet pane
  function appPanel(host, api, o) {
    if (!host || !root.TribeFlint || !root.TribeFlint.mount) return null;
    let box = host; const col = !!(o && o.column);   // pass 9: his own column in the creator shell
    if (col) { box.classList.add('apc-flint', 'in-col'); if (!document.getElementById('apc-flint')) box.id = 'apc-flint'; }
    else if (host.tagName === 'FORM') { box = document.createElement('section'); box.className = 'apc-flint'; box.id = 'apc-flint'; box.setAttribute('aria-label', 'Flint'); host.replaceWith(box); }
    else { host.innerHTML = ''; box = document.createElement('section'); box.className = 'apc-flint in-sheet'; host.appendChild(box); }
    const ui = root.TribeFlint.mount(box, { ctx: 'appcreator', echo: false, run: text => appAsk(text, api).then(() => true), onSay: m => { const s = api.st(); if (s) { flog(api).push(m); drawApp(api); } }, onClear: () => { const s = api.st(); if (s) { s.flog = []; drawApp(api); } },
      hello: 'Say what to change, like “make it dark” or “add a settings screen”.', chips: () => appChips(api).slice(0, 3), placeholder: 'Tell Flint what to change…', tools: (o && o.tools) || undefined });
    if (!ui) return null;
    if (!document.getElementById('apc-ask-in')) ui.input.id = 'apc-ask-in';
    extra(ui, 'app', () => appAsk('polish it', api), () => appAsk('make it beautiful', api));
    mounts.add(ui); drawApp(api);
    return ui;
  }
  // the one spot under the thread: Polish it always; Make it beautiful only while the tribe has an AI, else one honest line
  function extra(ui, kind, onPolish, onBeauty) {
    const box = ui.extra; if (!box) return;
    // pass 5: one quiet row, not a button beside a paragraph; what a stronger AI adds sits behind a small info button
    const SPARK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';
    const INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
    const paint = ai => {
      const note = tr('No AI needed. A stronger AI adds full redesigns and new writing.');
      box.innerHTML = `<div class="fc-row" data-fc="${kind}"><button type="button" class="fc-quiet" data-fc-act="polish" title="${esc(tr('Tidy spacing, sizes, colours and buttons. No AI.'))}">${SPARK}<b>${esc(tr('Polish it'))}</b><small>${esc(tr('Tidy spacing, sizes and colours'))}</small></button>${ai.any
        ? `<button type="button" class="fc-quiet fc-beauty" data-fc-act="beauty" title="${esc(tr('Your tribe’s AI proposes a redesign. You approve it.'))}"><b>${esc(tr('Make it beautiful'))}</b></button>`
        : `<button type="button" class="fc-info" data-fc-tip aria-expanded="false" aria-label="${esc(note)}" title="${esc(note)}">${INFO}</button><small class="fc-line" data-fc-line hidden>${esc(note)}</small>`}</div>`;
    };
    paint({ any: false }); hasAI().then(paint).catch(() => {});
    box.onclick = e => { const t = e.target.closest('[data-fc-tip]'); if (t) { const l = box.querySelector('[data-fc-line]'); if (l) { l.hidden = !l.hidden; t.setAttribute('aria-expanded', String(!l.hidden)); } return; } const b = e.target.closest('[data-fc-act]'); if (!b) return; if (b.dataset.fcAct === 'polish') onPolish(); else onBeauty(); };
    ui.refreshAI = () => hasAI(true).then(paint).catch(() => {});
  }
  const screenBy = (s, name) => { const d = s.doc, n = String(name || '').toLowerCase().trim(); if (!n) return d.screens.find(x => x.id === s.screen); return d.screens.find(x => x.name.toLowerCase() === n || x.id === n) || d.screens.find(x => x.name.toLowerCase().includes(n)); };
  // the steps this file adds to App Creator's own (appcreator.js flint()): -> { text, undo?, chips?, html? } or null
  async function appStep(step, api) {
    const id = step.intent, sl = step.slots || {}, s = api.st(), A = api.core();
    if (id === 'app.redo') { api.redo(); return { text: 'Redone.' }; }
    if (id === 'app.help') { const h = help('app'); return { text: tr(h.text), chips: h.chips }; }
    if (id === 'app.polish') return { text: polish('app', { design: () => api.st().doc, core: () => A, host: () => api.root(), commit: d => api.commit(d, ''), say: (t, html, undo) => appSay(api, t, { html, undo }) }) };
    if (id === 'app.beautify') { const r = await beautify('app', { pid: api.pid(), outline: A.outline(s.doc), ask: '' }); return { text: r.text, chips: r.chips, lvl: r.sent ? 'agent' : 'rules' }; }
    if (/^app\.screen\.(remove|rename|first|dup)$/.test(id)) {
      const sc = screenBy(s, sl.name); if (!sc) return { text: `There is no ${sl.name} screen. The screens are: ${s.doc.screens.map(x => x.name).join(', ')}.` };
      if (id === 'app.screen.remove') { if (s.doc.screens.length < 2) return { text: 'An app needs at least one screen.' }; api.apply({ op: 'screen.remove', screen: sc.id }); if (s.screen === sc.id) { api.st().screen = api.st().doc.start; api.paint(); } return { text: `Removed the ${sc.name} screen. Undo brings it back.`, undo: true }; }
      if (id === 'app.screen.rename') { api.apply({ op: 'screen.rename', screen: sc.id, name: sl.to }); return { text: `Renamed the screen to ${sl.to}.`, undo: true }; }
      if (id === 'app.screen.first') { if (s.doc.start === sc.id) return { text: `The app already opens on ${sc.name}.` }; const d = JSON.parse(JSON.stringify(s.doc)); d.start = sc.id; api.commit(A.normalize(d), ''); return { text: `The app now opens on ${sc.name}.`, undo: true }; }
      const d = JSON.parse(JSON.stringify(s.doc)), i = d.screens.findIndex(x => x.id === sc.id), copy = JSON.parse(JSON.stringify(d.screens[i])); copy.id = sc.id + '-copy'; copy.name = `${sc.name} copy`.slice(0, 40); delete copy.tab; copy.blocks = copy.blocks.filter(b => b.type !== 'tabs').map(b => { const x = { ...b }; delete x.id; return x; });
      d.screens.splice(i + 1, 0, copy); const nd = A.normalize(d); api.commit(nd, ''); api.st().screen = nd.screens[i + 1].id; api.paint(); return { text: `Made a copy of ${sc.name}.`, undo: true };
    }
    if (/^app\.el\./.test(id)) {
      const sel = s.sel, f = sel ? A.findBlock(s.doc, sel.block) : null;
      if (id === 'app.el.picture') return { text: 'Click the picture on the screen, then pick another under Edit. Or say “add a picture” for a new one.' };
      if (!f) return { text: 'Click the thing on the screen first, then say it again.' };
      const item = sel.kind === 'item' && /^\w+\.\d+/.test(sel.path || '');
      if (id === 'app.el.remove') { api.apply(item ? { op: 'item.remove', block: sel.block, path: sel.path } : { op: 'block.remove', block: sel.block }); if (!item) { api.st().sel = null; api.paint(); } return { text: 'Removed it. Undo brings it back.', undo: true }; }
      if (id === 'app.el.dup') { api.apply(item ? { op: 'item.dup', block: sel.block, path: sel.path } : { op: 'block.dup', block: sel.block }); return { text: 'Duplicated it.', undo: true }; }
      if (id === 'app.el.move') { api.apply(item ? { op: sl.dir === 'up' ? 'item.up' : 'item.down', block: sel.block, path: sel.path } : { op: 'block.move', block: sel.block, dir: sl.dir === 'up' ? -1 : 1 }); return { text: `Moved it ${sl.dir}.`, undo: true }; }
      const P = f.block.props || {}, base = item ? /^(\w+\.\d+)/.exec(sel.path)[1] + '.' : '', at = base ? A.getPath(P, base.slice(0, -1)) : P;
      if (id === 'app.el.text') {
        let path = sel.path && typeof A.getPath(P, sel.path) === 'string' ? sel.path : '';
        if (!path) { const k = ['title', 'label', 'text', 'name', 'sub', 'eyebrow', 'button'].find(x => at && typeof at[x] === 'string'); if (k) path = base + k; }
        if (!path) return { text: 'Click the words themselves, then say what they should be.' };
        api.apply({ op: 'text', block: sel.block, path, value: sl.value }); api.paint(); return { text: `It now says “${sl.value}”.`, undo: true };
      }
      if (id === 'app.el.icon') {
        const want = String(sl.icon || '').toLowerCase(), name = (A.ICON_NAMES || []).includes(want) ? want : ICONW[want] && (A.ICON_NAMES || []).includes(ICONW[want]) ? ICONW[want] : '';
        if (!name) return { text: `There is no “${sl.icon}” icon in the set. Open Edit to pick from all of them.` };
        const path = at && typeof at.icon === 'string' ? base + 'icon' : ''; if (!path) return { text: 'That part has no icon. Select a row, a tab or a button that shows one.' };
        api.apply({ op: 'icon', block: sel.block, path, value: name }); api.paint(); return { text: `Changed the icon to ${name}.`, undo: true };
      }
      if (id === 'app.el.how') { const key = item ? sel.path : (f.block.type === 'button' || f.block.type === 'feed' ? '' : 'button'), l = (f.block.links || {})[key]; if (!l) return { text: 'That is not linked to a screen yet. Say “link this to settings” first.' }; api.apply({ op: 'link', block: sel.block, path: key, to: l.to, how: sl.how }); return { text: sl.how === 'sheet' ? 'It now opens as a sheet from the bottom.' : sl.how === 'fade' ? 'It now fades in.' : 'It now slides in.', undo: true }; }
    }
    return null;
  }
  // one request in App Creator: the rules first; a loose one goes to the local model when there is one; else an honest answer
  async function appAsk(text, api) {
    const N = NLU(), s = api.st(); if (!s) return { text: '' };
    if (!N) return { text: 'Flint is not loaded.' };
    flog(api).push({ who: 'me', text, at: new Date().toISOString() }); drawApp(api);
    const A = api.core(), ctxNow = () => { const st = api.st(), sel = st.sel ? A.findBlock(st.doc, st.sel.block) : null; return { now: new Date(), view: 'appcreator', selection: !!st.sel, selKind: sel ? sel.block.type : '', screens: st.doc.screens.map(x => x.name) }; };
    const run = async (sentence, lvl) => {
      const r = N.parse(sentence, ctxNow()), out = []; let undo = false, chips = [], html = '', level = lvl;
      for (const st of r.steps || []) {
        if (!st.intent || st.conf < 0.6) continue;
        const before = JSON.stringify(api.st().doc);
        const x = (await appStep(st, api)) || api.flint(st);
        if (x) { out.push(x.text || ''); if (x.undo || (api.st() && JSON.stringify(api.st().doc) !== before && !/^app\.(?:undo|redo)$/.test(st.intent))) undo = true; if (x.chips) chips = x.chips; if (x.html) html += x.html; if (x.lvl) level = x.lvl; }
      }
      return out.length ? { text: out.filter(Boolean).join(' '), undo, chips, html, lvl: level } : null;
    };
    let res = await run(text, 'rules');
    if (!res) {
      const lo = await loose(text, { kind: 'app', ctx: ctxNow() });
      if (lo && lo.says.length) { const parts = []; let undo = false; for (const say of lo.says) { const r1 = await run(say, lo.level); if (r1) { parts.push(r1.text); undo = undo || r1.undo; } } if (parts.length) res = { text: parts.filter(Boolean).join(' '), undo, lvl: lo.level, html: `<small class="fc-read">${esc(tr('Read as'))}: ${lo.says.map(esc).join(' · ')}</small>` }; }
      else if (lo && lo.text) res = { text: lo.text, lvl: lo.level };
    }
    if (!res) {
      let why = ''; if (connected()) { try { const t = await C.api('/flint/tier', { method: 'POST', body: { ask: text } }); if (t && t.tier === 'agent') why = t.why + ' '; } catch {} }
      res = { text: why + tr('Here I can add screens and kits, link buttons, change the look, and add working features like offline storage, search, reminders or a dark mode switch: say “what features can you add?”.'), chips: ['What can you do here?', 'Polish it'] };
    }
    res.text = String(res.text || '').replace(/(Updated the look\.)(?: \1)+/g, '$1');   // two look changes in one go: said once
    appSay(api, res.text, { undo: res.undo, chips: res.chips, html: res.html, lvl: res.lvl });
    return { text: res.text, level: res.lvl || 'rules' };
  }

  return Object.assign(pure, { loose, hasAI, beautify, polish, site, appAsk, appPanel, appChips, appStep, extra });
});
