// The website designer's "Your own CSS" and section spacing in the model (app/ui/sitecfg.js, p4-site).
//   cleanCss: nothing that loads from elsewhere, nothing script-ish, no markup, no escapes, braces balanced;
//   it survives normalize, render, the single-file export and the zip; pt/pb snap to the scale and render as variables;
//   sectionCode gives the published HTML of one section and the rules that style it.
// Usage: node app/test/site_css_test.js
'use strict';
const assert = require('assert');
const S = require('../ui/sitecfg.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---- cleanCss ----
const bad = [
  ['@import url(https://evil.example/a.css); h1{color:red}', /evil|@import/],
  ["@import 'https://evil.example/a.css';", /evil|@import/],
  ['h1{background:url(https://evil.example/t.gif)}', /evil/],
  ['h1{background:url("//evil.example/t.gif")}', /evil/],
  ["h1{background:URL( 'http://evil.example/t.gif' )}", /evil/],
  ['h1{background:url(javascript:alert(1))}', /javascript/],
  ['h1{width:expression(alert(1))}', /expression\(/],
  ['h1{behavior:url(x.htc)}', /behavior\s*:|x\.htc/],
  ['h1{-moz-binding:url(x.xml#a)}', /-moz-binding\s*:|x\.xml/],
  ['</style><script>alert(1)</script>', /[<]/],
  ['<!-- x --> h1{color:red}', /<!--/],
  ['h1{background:\\75 rl(https://evil.example/x)}', /\\|url\(/i],   // the escape is gone, so what is left is not a url() at all
  ['h1{background:u\\rl(https://evil.example/x)}', /\\|evil/],
  ['@font-face{font-family:x;src:url(https://evil.example/f.woff2)}', /evil|@font-face/],
  ['h1{background:image-set("https://evil.example/a.png" 1x)}', /image-set\(/],
  ['@charset "utf-7"; h1{color:red}', /@charset/],
  ['h1{background:url(data:text/html;base64,PHNjcmlwdD4=)}', /text\/html/],
  ['h1{background:url(assets/../../secret.png)}', /\.\./],
  ['h1{background:url(https://evil.example/a.png', /evil/],
];
bad.forEach(([css, rx]) => ok(!rx.test(S.cleanCss(css)), `removed from: ${css}  ->  ${S.cleanCss(css)}`));
ok(S.cleanCss('h1 { color: red; }') === 'h1 { color: red; }', 'plain CSS is untouched');
ok(/url\('data:image\/png;base64,AAAA'\)/.test(S.cleanCss('a{background:url(data:image/png;base64,AAAA)}')), 'a picture inside the page stays');
ok(/url\('assets\/bg-1\.png'\)/.test(S.cleanCss('a{background:url("assets/bg-1.png")}')), 'a file under assets/ stays');
ok(S.cleanCss('.a > .b { color: red }') === '.a > .b { color: red }', 'the child combinator stays');
ok(S.cleanCss('@media (max-width: 600px) { h1 { font-size: 2rem } }').includes('@media (max-width: 600px)'), '@media stays');
{ const c = S.cleanCss('h1 { color: red'); ok((c.match(/\{/g) || []).length === (c.match(/\}/g) || []).length, 'an open brace is closed'); }
{ const c = S.cleanCss('} } body { display: none'); ok(!/^\s*\}/.test(c) && (c.match(/\{/g) || []).length === (c.match(/\}/g) || []).length, 'a stray closing brace cannot end one of our rules'); }
ok(S.cleanCss('x'.repeat(50000)).length <= 20000, 'capped at 20,000 characters');
ok(S.cleanCss(null) === '' && S.cleanCss(undefined) === '' && S.cleanCss(42) === '42', 'anything is taken as text');

// ---- it lives in the design and in every way out ----
let c = S.fromTemplate ? S.fromTemplate(S.TEMPLATES[0], { name: 'Test' }) : S.blank('Test');
c = S.setCss(c, 'h1 { letter-spacing: 3px } @import url(https://evil.example/a.css);');
ok(c.css === 'h1 { letter-spacing: 3px }', 'setCss cleans: ' + c.css);
ok(S.normalize(JSON.parse(JSON.stringify(c))).css === c.css, 'normalize keeps it');
{ const raw = JSON.parse(JSON.stringify(c)); raw.css = "p{background:url(//evil.example/b.png)}"; ok(!/evil/.test(S.normalize(raw).css || ''), 'normalize cleans what a client sent raw (the server normalises on save)'); }
const one = S.exportFiles(c, 'html')['index.html'];
ok(one.includes('letter-spacing: 3px') && one.indexOf('letter-spacing: 3px') < one.indexOf('</style>'), 'in the single-file export, inside the stylesheet');
const zip = S.exportFiles(c, 'zip'); ok(Object.keys(zip.files).filter(f => /\.html$/.test(f)).every(f => zip.files[f].includes('letter-spacing: 3px')), 'on every page of the zip');
ok(JSON.parse(zip.files['site.json']).css === c.css, 'in site.json, so opening it again keeps it');
ok(S.render(c, { edit: true, mode: 'single', page: c.pages[0].id }).includes('letter-spacing: 3px'), 'in the editor preview');
ok(!S.setCss(c, '').css && !('css' in S.setCss(c, '   ')), 'empty removes it');
ok(!/your own CSS/.test(S.exportFiles(S.setCss(c, ''), 'html')['index.html']), 'no trace when there is none');

// ---- space above and below ----
ok(JSON.stringify(S.SPACE_SCALE) === JSON.stringify([0, 8, 16, 24, 32, 48, 64, 80, 96, 128, 160]), 'the scale');
ok(S.snapSpace(50) === 48 && S.snapSpace(3) === 0 && S.snapSpace(5) === 8 && S.snapSpace(999) === 160 && S.snapSpace(-9) === 0 && S.snapSpace('') === null && S.snapSpace('x') === null, 'snapping');
const pg = c.pages[0], b = pg.blocks[0];
let d = S.setStyle(c, pg.id, b.id, { pt: 50, pb: 0 });
ok(d.pages[0].blocks[0].style.pt === 48 && d.pages[0].blocks[0].style.pb === 0, 'kept, snapped; 0 is a value');
const html = S.render(d, { mode: 'pages', page: pg.id });
ok(/class="[^"]*\bhas-pt\b[^"]*\bhas-pb\b[^"]*" style="[^"]*--pt:48px;--pb:0px;"/.test(html), 'rendered as classes and variables');
ok(/\.has-pt\.has-pt\{padding-top:var\(--pt\)\}/.test(html) && /@media \(max-width:760px\)\{\.has-pt\.has-pt\{padding-top:calc\(var\(--pt\) \* \.65\)\}/.test(html), 'the rule, and its phone scale');
d = S.setStyle(d, pg.id, b.id, { pt: '', pb: '' });
ok(!d.pages[0].blocks[0].style || (d.pages[0].blocks[0].style.pt == null && d.pages[0].blocks[0].style.pb == null), "'' gives the site's own spacing back");
ok(!/has-pt|--pt/.test(S.render(d, { mode: 'pages', page: pg.id }).split('</style>')[1]), 'and nothing is left on the section');
{ const t = S.setStyle(S.setStyle(c, pg.id, b.id, { tint: '#112233' }), pg.id, b.id, { pt: 32 }); const h2 = S.render(t, { mode: 'pages', page: pg.id }); ok(/style="background:#112233;color:#[0-9A-F]{6};--pt:32px;"/i.test(h2), 'a tint and a spacing share one style attribute'); }
{ const dup = S.duplicateBlock(S.setStyle(c, pg.id, b.id, { pt: 96 }), pg.id, b.id); ok(dup.block.style && dup.block.style.pt === 96, 'a copy keeps its spacing'); }

// ---- the code of one section ----
const code = S.sectionCode(S.setStyle(c, pg.id, b.id, { pt: 24 }), pg.id, b.id);
ok(code.html.startsWith('<') && code.html.includes(`id="b-${b.id}"`) && !/data-e=|data-block=|contenteditable/.test(code.html), 'the published HTML, with nothing of the editor in it');
ok(code.html.split('\n').length > 3 && /\n {2}</.test(code.html), 'indented, one tag per line');
ok(code.css.includes(':root {') && /--accent: #/.test(code.css) && !/@import|@font-face/.test(code.css), 'the rules that style it, readable');
ok(code.own === 'h1 { letter-spacing: 3px }' && !code.css.includes('letter-spacing: 3px'), 'your own CSS is kept apart from the site’s rules');
ok(S.sectionCode(c, pg.id, 'nope').html === '', 'an unknown section gives nothing, not an error');

console.log(`site_css_test: OK (${n} checks)`);
