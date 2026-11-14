// The translator's runtime, without a browser (feat/languages): templates, patterns, plurals, dates and numbers,
// lists, a tribe's own words. The page walker (text nodes, attributes, the rewrite-storm guard) is covered in the
// browser by app/test/e2e_i18n_audit.py.
//   node app/test/i18n_runtime_test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const UI = path.join(__dirname, '..', 'ui');
function load(lang) {
  const win = { addEventListener: () => {}, dispatchEvent: () => {} };
  const doc = { body: null, documentElement: {}, addEventListener: () => {}, querySelectorAll: () => [] };
  const ctx = { window: win, document: doc, localStorage: { getItem: () => lang, setItem: () => {} }, navigator: { language: 'en', languages: ['en'] }, NodeFilter: {}, MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; }, CustomEvent: function () {}, Intl, console, performance: { now: () => 0 } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(UI, 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  const more = path.join(UI, 'i18n-more.js'); if (fs.existsSync(more)) vm.runInContext(fs.readFileSync(more, 'utf8'), ctx, { filename: 'i18n-more.js' });
  return win.TribeI18n;
}
let fails = 0, n = 0;
const eq = (got, want, what) => { n++; if (got !== want) { fails++; console.error(`  ✗ ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (cond, what) => { n++; if (!cond) { fails++; console.error(`  ✗ ${what}`); } };

// ---- English: everything passes through, templates fill
{ const I = load('en');
  eq(I.lang(), 'en', 'language is English');
  eq(I.t('Save'), 'Save', 'English stays English');
  eq(I.t('Give the {role} role to someone', { role: 'Lead' }), 'Give the Lead role to someone', 'a template fills in English');
  eq(I.t('key.ignored', 'Save'), 'Save', 'the old t(key, english) call still works');
  eq(I.n(1, { one: '{n} task', other: '{n} tasks' }), '1 task', 'plural: one');
  eq(I.n(3, { one: '{n} task', other: '{n} tasks' }), '3 tasks', 'plural: other');
  eq(I.list(['a', 'b', 'c']), 'a, b, and c', 'a list in English');
  eq(I.num(1234567.5), '1,234,567.5', 'a number in English');
  ok(Array.isArray(I.RTL) && I.RTL.includes('ar'), 'right-to-left languages are listed');
  ok(typeof I.picker() === 'string' && I.picker().includes('data-lang-pick'), 'the shared language picker');
  eq(JSON.stringify(I.held()), '[]', 'nothing is held at start');
}
// ---- Spanish: rows, the old call shape, rows added later, patterns, plurals, Intl
{ const I = load('es');
  eq(I.t('Save'), 'Guardar', 'an exact row');
  eq(I.t('whatever', 'Save'), 'Guardar', 't(key, english) translates the English');
  eq(I.t('A string nobody translated'), 'A string nobody translated', 'no row: the English is shown');
  I.add({ 'Hello there': ['Hola', 'Olá', 'Bonjour', 'Hallo', 'こんにちは', '你好', '안녕하세요'] });
  eq(I.t('Hello there'), 'Hola', 'a row added by another file');
  ok(I.has('Hello there') && !I.has('Nope nope'), 'has() knows added rows');
  I.add({ 'Save': ['X', 'X', 'X', 'X', 'X', 'X', 'X'] });
  eq(I.t('Save'), 'Guardar', 'an added row never replaces an existing one');
  I.addPatterns({ 'Give the {role} role to someone': ['Dale el rol de {role} a alguien', 'Dê a função de {role} a alguém', 'Donnez le rôle {role} à quelqu’un', 'Gib jemandem die Rolle {role}', '{role}の役割を誰かに任せる', '把{role}角色交给某人', '{role} 역할을 누군가에게 주기'],
    'Welcome to {name}': ['Te damos la bienvenida a {name}', 'Boas-vindas a {name}', 'Bienvenue dans {name}', 'Willkommen bei {name}', '{name}へようこそ', '欢迎来到{name}', '{name}에 오신 것을 환영해요'],
    '{n} of {total} done': ['{n} de {total} hechas', '{n} de {total} feitas', '{n} sur {total} terminées', '{n} von {total} erledigt', '{total}件中{n}件完了', '已完成 {n}/{total}', '{total}개 중 {n}개 완료'] });
  eq(I.t('Give the {role} role to someone', { role: 'Community' }), 'Dale el rol de Community a alguien', 'a pattern, called with its values');
  eq(I.t('Give the Community role to someone'), 'Dale el rol de Community a alguien', 'a pattern matched from a sentence built elsewhere');
  eq(I.t('Give the Lead role to someone'), 'Dale el rol de Líder a alguien', 'a captured value that is itself a UI word is translated too');
  eq(I.t('Welcome to Pixel Quest'), 'Te damos la bienvenida a Pixel Quest', 'a name is kept as written');
  eq(I.t('3 of 12 done'), '3 de 12 hechas', 'numbers in a pattern');
  ok(I.has('Welcome to Anything'), 'has() knows patterns');
  I.addPlurals({ '{n} tasks': [{ one: '{n} tarea', other: '{n} tareas' }, { one: '{n} tarefa', other: '{n} tarefas' }, { one: '{n} tâche', other: '{n} tâches' }, { one: '{n} Aufgabe', other: '{n} Aufgaben' }, '{n} 件のタスク', '{n} 个任务', '작업 {n}개'] });
  eq(I.n(1, { one: '{n} task', other: '{n} tasks' }), '1 tarea', 'Spanish plural: one');
  eq(I.n(5, { one: '{n} task', other: '{n} tasks' }), '5 tareas', 'Spanish plural: other');
  eq(I.n(1500, { one: '{n} task', other: '{n} tasks' }), '1500 tareas'.replace('1500', I.num(1500)), 'the count is written the Spanish way');
  eq(I.list(['a', 'b', 'c']), 'a, b y c', 'a list in Spanish');
  ok(/2026/.test(I.date('2026-11-14T10:00:00')) && /nov/i.test(I.date('2026-11-14T10:00:00')), 'a date in Spanish');
  ok(/hace 2 horas|hace 2 h/.test(I.rel(new Date(Date.now() - 2 * 36e5))), 'relative time in Spanish: ' + I.rel(new Date(Date.now() - 2 * 36e5)));
}
// ---- French and Japanese: plural rules differ (French 0 is "one"; Japanese has one form)
{ const I = load('fr');
  I.addPlurals({ '{n} tasks': [{ one: '{n} tarea', other: '{n} tareas' }, { one: '{n} tarefa', other: '{n} tarefas' }, { one: '{n} tâche', other: '{n} tâches' }, { one: '{n} Aufgabe', other: '{n} Aufgaben' }, '{n} 件のタスク', '{n} 个任务', '작업 {n}개'] });
  eq(I.n(0, { one: '{n} task', other: '{n} tasks' }), '0 tâche', 'French: zero takes the singular');
  eq(I.n(2, { one: '{n} task', other: '{n} tasks' }), '2 tâches', 'French plural');
  ok(I.num(1234.5).includes('234'), 'a number in French');
}
{ const I = load('ja');
  I.addPlurals({ '{n} tasks': [{ one: '{n} tarea', other: '{n} tareas' }, { one: '{n} tarefa', other: '{n} tarefas' }, { one: '{n} tâche', other: '{n} tâches' }, { one: '{n} Aufgabe', other: '{n} Aufgaben' }, '{n} 件のタスク', '{n} 个任务', '작업 {n}개'] });
  eq(I.n(1, { one: '{n} task', other: '{n} tasks' }), '1 件のタスク', 'Japanese: one form for every count');
  eq(I.list(['a', 'b', 'c']), 'a、b、c', 'a list in Japanese');
}
// ---- a tribe's own words: whole words only, after translation, and cleared again
{ const I = load('en');
  I.terms({ Company: 'Club', Lead: 'Captain' });
  eq(I.t('Company'), 'Club', 'a tribe word replaces the English');
  eq(I.t('Open the Company page'), 'Open the Club page', 'inside a sentence');
  eq(I.t('Leader board'), 'Leader board', 'whole words only: Leader is not Lead');
  eq(I.t('Give the {role} role to someone', { role: 'Lead' }), 'Give the Captain role to someone', 'in a filled template');
  I.terms(null); eq(I.t('Company'), 'Company', 'cleared');
  const J = load('es'); J.terms({ en: { Company: 'Club' }, es: { Guardar: 'Archivar' } });
  eq(J.t('Save'), 'Archivar', 'a per-language map applies to the translation');
}
console.log(`i18n_runtime_test: ${n - fails}/${n}`);
if (fails) process.exit(1);
