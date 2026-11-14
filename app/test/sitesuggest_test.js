#!/usr/bin/env node
// The website editor's model rules that need no browser (feat/site-editor2): suggestions drawn from what the tribe said
// (app/ui/sitesuggest-core.js), opening times, list entries, per-element style and Flint's sentences about the selection
// (app/ui/sitecfg.js). Run: node app/test/sitesuggest_test.js
'use strict';
const path = require('path'), assert = require('assert');
const S = require(path.join(__dirname, '..', 'ui', 'sitecfg.js')), C = require(path.join(__dirname, '..', 'ui', 'sitesuggest-core.js'));
const base = () => S.normalize(JSON.parse(JSON.stringify(require(path.join(__dirname, '..', 'ui', 'sitetpl', 'linkbio.json')))));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const src = (kind, text, x) => ({ id: `${kind}:${n}:${text.length}`, kind, text, who: 'Maya', at: '2026-11-13T10:00:00Z', ...x });
const one = (cfg, s) => C.suggest(cfg, [s], S);

// ---- when we open
let c = base();
let r = one(c, src('chat', 'heads up, we open Saturday at 9 now'));
ok(r.length === 1 && r[0].kind === 'time' && r[0].before === 'Opens Friday at 10am' && r[0].after === 'Opens Saturday at 9am', JSON.stringify(r));
ok(r[0].ops.length === 1 && r[0].ops[0].op === 'text' && r[0].ops[0].path === 'items.0.note' && r[0].target.path === 'items.0.note');
ok(r[0].source.who === 'Maya' && r[0].source.kind === 'chat' && /Saturday at 9/.test(r[0].source.text));
ok(S.applyOps(c, r[0].ops).done.length === 1, 'a suggestion is steps that really apply');
ok(one(S.applyOps(c, r[0].ops).cfg, src('chat', 'heads up, we open Saturday at 9 now')).length === 0, 'once the site says it, nothing is suggested');
ok(one(c, src('chat', 'the weather is lovely at 9 today')).length === 0, 'a time in small talk suggests nothing');
ok(one(c, src('chat', 'we were open at 9 last week')).length === 0, 'the past is not a change');
// ---- a section someone asked for
r = one(c, src('task', 'Add a contact form to the website', { title: 'Add a contact form to the website' }));
ok(r.length === 1 && r[0].kind === 'add' && r[0].ops[0].type === 'contact');
ok(one(S.applyOps(c, r[0].ops).cfg, src('task', 'Add a contact form to the website')).length === 0, 'not suggested once it is there');
ok(one(c, src('chat', 'I filled in a contact form at the dentist')).length === 0, 'a form somewhere else is not a request');
// ---- words
r = one(c, src('doc', 'Thoughts.\nNew tagline: Pots that outlive the trend.\nMore.', { title: 'Brand notes' }));
ok(r.length === 1 && r[0].after === 'Pots that outlive the trend' && r[0].ops[0].path === 'bio');
r = one(c, src('chat', 'please change "4 spots left" to "2 spots left"'));
ok(r.length === 1 && r[0].before === '4 spots left' && r[0].after === '2 spots left');
ok(one(c, src('chat', 'change "not on the site" to "whatever"')).length === 0, 'words the site does not have');
// ---- a name needs a decision, not a passing remark
ok(one(c, src('chat', "let's call it Mud Club")).length === 0, 'a remark in chat does not rename the site');
r = one(c, src('decision', 'We decided: rename the site to Mud Club.', { decided: true }));
ok(r.length === 1 && r[0].kind === 'name' && r[0].after === 'Mud Club' && S.applyOps(c, r[0].ops).cfg.name === 'Mud Club');
// ---- the main colour
r = one(c, src('decision', 'We agreed to use teal as the main colour for the website.', { decided: true }));
ok(r.length === 1 && r[0].kind === 'colour' && r[0].ops[0].color === '#2A8C80');
// ---- decided things come first; a section comment can carry its own fix
r = C.suggest(c, [src('chat', 'we open Saturday at 9 now'), src('decision', 'We agreed to use teal as the main colour for the website.', { decided: true })], S);
ok(r.length === 2 && r[0].kind === 'colour', 'a decision outranks a chat line');
const fb = c.pages[0].blocks[1];
ok(one(c, src('comment', 'should say Made in Arizona', { block: fb.id })).length === 0, 'a comment on a section with no heading changes nothing');
// ---- what the tribe said about one element
const b0 = c.pages[0].blocks[0];
let rel = C.related(c, { block: b0.id, path: 'items.0.note', kind: 'text' }, [src('chat', 'we open Saturday at 9 now'), src('chat', 'lunch?'), src('chat', 'the wheel-throwing class is full on saturdays')], S);
ok(rel.length === 1 && /open Saturday/.test(rel[0].text), JSON.stringify(rel));
rel = C.related(c, { block: b0.id, path: 'items.1', kind: 'item' }, [src('chat', 'the wheel-throwing class is full on saturdays, raise the class size?'), src('chat', 'lunch?')], S);
ok(rel.length === 1 && /wheel-throwing/.test(rel[0].text));
ok(C.related(c, { block: b0.id, path: '', kind: 'block' }, [src('comment', 'tighten this up', { block: b0.id })], S).length === 1, 'a comment pinned to the section always belongs to it');

// ---- opening times
const RT = [['Opens Friday at 10am', 'Saturday 9am', 'Opens Saturday at 9am'], ['Opens at 10am', 'Saturday 9', 'Opens Saturday at 9am'], ['Mon to Fri: 8 to 5\nSat: 9 to 2', 'Saturday 10', 'Mon to Fri: 8 to 5\nSat: 10 to 2'], ['Mon to Fri: 8 to 5\nSat: 9 to 2', 'Tuesday 10', ''], ['Doors open 7 pm', '8:30', 'Doors open 8:30pm'], ['Open Saturdays from 9', 'Sundays 10am', 'Open Sundays from 10am'], ['Open daily 8am to 4pm', '7am', 'Open daily 7am to 4pm'], ['Opens Saturday at 9am', 'Saturday 9am', '']];
for (const [old, when, want] of RT) ok(S.retime(old, when) === want, `${JSON.stringify(old)} + ${when} -> ${JSON.stringify(S.retime(old, when))}, want ${JSON.stringify(want)}`);

// ---- list entries carry their look with them
c = S.setElStyle(base(), base().pages[0].id, b0.id, 'items.0.note', { sz: 'l', b: 1 });
const pg = c.pages[0].id;
let m = S.itemOp(c, pg, b0.id, 'items', 0, 'down'); ok(m.i === 1 && m.cfg.pages[0].blocks[0].props.items[1].note === 'Opens Friday at 10am' && m.cfg.pages[0].blocks[0].es['items.1.note'].sz === 'l' && !m.cfg.pages[0].blocks[0].es['items.0.note']);
m = S.itemOp(c, pg, b0.id, 'items', 0, 'dup'); ok(m.i === 1 && m.cfg.pages[0].blocks[0].props.items.length === 5 && m.cfg.pages[0].blocks[0].es['items.1.note'].b === 1 && m.cfg.pages[0].blocks[0].es['items.0.note'].b === 1);
m = S.itemOp(c, pg, b0.id, 'items', 0, 'del'); ok(m.cfg.pages[0].blocks[0].props.items.length === 3 && !m.cfg.pages[0].blocks[0].es, 'the look of a removed entry goes with it');
m = S.itemOp(c, pg, b0.id, 'items', 1, 'add'); ok(m.i === 2 && m.cfg.pages[0].blocks[0].props.items[2].label === 'New' && m.cfg.pages[0].blocks[0].props.items[2].link.to === '');
ok(S.itemOp(c, pg, b0.id, 'items', 9, 'up').i === -1 && S.itemOp(c, pg, b0.id, 'nope', 0, 'up').i === -1);
ok(JSON.stringify(S.listsOf('plans.1.features.2')) === JSON.stringify([{ list: 'plans', i: 1, item: 'plans.1' }, { list: 'plans.1.features', i: 2, item: 'plans.1.features.2' }]));
// ---- what survives a save: only known style values
c = S.normalize({ ...base(), pages: base().pages.map((p, i) => i ? p : { ...p, blocks: p.blocks.map((b, j) => j ? b : { ...b, style: { hide: 'phone,nope,tablet', anim: 'spin', w: 'narrow' }, es: { 'items.0.note': { sz: 'zz', col: 'accent', hide: ['phone'], onclick: 'x' }, '__proto__.x': { sz: 'l' }, 'a b': { sz: 'l' } } }) }) });
ok(JSON.stringify(c.pages[0].blocks[0].style) === JSON.stringify({ bg: '', pad: '', hide: 'phone,tablet', w: 'narrow' }) && JSON.stringify(c.pages[0].blocks[0].es) === JSON.stringify({ 'items.0.note': { col: 'accent', hide: 'phone' } }), JSON.stringify([c.pages[0].blocks[0].style, c.pages[0].blocks[0].es]));
const html = S.render(c, {});
ok(/class="[^"]*hide-phone[^"]*hide-tablet/.test(html) && /e-col-accent hide-phone/.test(html) && !/data-e=|contenteditable|ehide-/.test(html), 'the published page hides by screen size and carries no editing marks');
ok(/ehide-phone/.test(S.render(c, { edit: true, page: c.pages[0].id })) && /data-e="@\|name"|data-e="[^"]+\|items\.0\.note"/.test(S.render(c, { edit: true, page: c.pages[0].id })));

// ---- Flint on the selection
const at = { page: pg, sel: { block: b0.id, path: 'items.0.note', kind: 'text' } };
c = base();
let f = S.command(c, { intent: 'site.size', slots: { dir: 'bigger' } }, at); ok(f.cfg.pages[0].blocks[0].es['items.0.note'].sz === 'l' && f.sel.kind === 'text' && /large/.test(f.say));
f = S.command(c, { intent: 'site.el.show', slots: { dev: 'phone', mode: 'hide' } }, at); ok(f.cfg.pages[0].blocks[0].es['items.0.note'].hide === 'phone');
f = S.command(c, { intent: 'site.el.show', slots: { dev: 'desktop', mode: 'only' } }, at); ok(f.cfg.pages[0].blocks[0].es['items.0.note'].hide === 'phone,tablet');
f = S.command(c, { intent: 'site.el.text', slots: { text: 'Opens soon' } }, at); ok(f.cfg.pages[0].blocks[0].props.items[0].note === 'Opens soon');
f = S.command(c, { intent: 'site.el.item', slots: { op: 'down' } }, at); ok(f.sel.path === 'items.1.note' && f.cfg.pages[0].blocks[0].props.items[1].note === 'Opens Friday at 10am');
f = S.command(c, { intent: 'site.time', slots: { when: 'Sunday 10am' } }, { page: pg }); ok(f.cfg.pages[0].blocks[0].props.items[0].note === 'Opens Sunday at 10am' && f.sel.path === 'items.0.note');
f = S.command(c, { intent: 'site.buttons', slots: { style: 'pill' } }, { page: pg }); ok(f.cfg.theme.btn === 'pill' && /border-radius:999px/.test(S.render(f.cfg, {})));
f = S.command(c, { intent: 'site.el.weight', slots: { b: true } }, { page: pg }); ok(!f.cfg && /Click it/.test(f.say), 'with nothing selected Flint asks for a click instead of guessing');
f = S.command(c, { intent: 'site.el.show', slots: { dev: 'phone', mode: 'hide' } }, { page: pg, sel: { block: b0.id, path: '', kind: 'block' } }); ok(f.cfg.pages[0].blocks[0].style.hide === 'phone');
console.log(`sitesuggest_test: OK (${n} checks)`);
