// Flint's local brain (flint-local): understands what people ask with no language model at all. Shared by the browser
// (window.TribeNLU, used by app/ui/flintlocal.js) and the server (require: server/flintkb.js uses the retrieval part,
// app/test/flint_nlu_test.js runs the coverage suite against it).
//   parse(text, ctx)  -> { steps: [{ intent, area, slots, conf, text, ask?, alts? }], lang, alts }
//                        ctx (all optional): { now: Date, view, picked, selection, members: [{id,name}],
//                        tasks: [{id,title,status,assignee,due}], last: { task, person }, learned: [{ say, means }] }
//   How: normalize (accents, contractions, slang, eight languages' command words, spelling tolerance by edit
//   distance against the words Flint knows) -> split into steps ("…, then …") -> each step against ~170 intent
//   patterns with slots (dates, times, colors, sizes, people, task references, names) -> context (the picked element,
//   the canvas selection, "it" = the last task) -> a confidence. Below the bar: the nearest examples by TF-IDF over
//   words and character trigrams ("did you mean…"), and examples people taught Flint ("when I say X, do Y").
//   index(docs) / search(idx, q) -> TF-IDF retrieval for the local knowledge base (server/flintkb.js, Guide pages).
// No dependencies, no network, deterministic. Open-ended reasoning (write code, judge a design, chat freely) still
// needs a model: parse() says so by returning no confident step.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeNLU = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- words ----------
  const CJK = /[぀-ヿ㐀-鿿가-힯]/;
  // multi-language command words -> English (es, pt, fr, de, ja, zh, ko). Only command words, never people's content.
  const LEX = {
    añade: 'add', anade: 'add', añadir: 'add', agrega: 'add', agregar: 'add', agregá: 'add', crea: 'create', crear: 'create', haz: 'make', hazme: 'make me', tarea: 'task', tareas: 'tasks',
    nota: 'note', notas: 'notes', abre: 'open', abrir: 'open', muestra: 'show', muéstrame: 'show me', muestrame: 'show me', mañana: 'tomorrow', manana: 'tomorrow', hoy: 'today', dile: 'tell', diles: 'tell',
    invita: 'invite', invitar: 'invite', tema: 'theme', oscuro: 'dark', claro: 'light', modo: 'mode', ajustes: 'settings', configuración: 'settings', configuracion: 'settings', calendario: 'calendar',
    archivos: 'files', ayuda: 'help', deshacer: 'undo', deshaz: 'undo', hecha: 'done', hecho: 'done', terminada: 'done', marca: 'mark', como: 'how', cómo: 'how', qué: 'what', una: 'a', uno: 'a', un: 'a', el: 'the', los: 'the', las: 'the', para: 'for',
    adiciona: 'add', adicionar: 'add', adicione: 'add', cria: 'create', criar: 'create', crie: 'create', faz: 'make', faça: 'make', faca: 'make', tarefa: 'task', tarefas: 'tasks', abra: 'open', amanhã: 'tomorrow',
    amanha: 'tomorrow', hoje: 'today', convida: 'invite', convidar: 'invite', escuro: 'dark', configurações: 'settings', configuracoes: 'settings', arquivos: 'files', desfazer: 'undo', desfaz: 'undo', feita: 'done', concluída: 'done', concluida: 'done', uma: 'a', um: 'a',
    ajoute: 'add', ajouter: 'add', crée: 'create', creer: 'create', créer: 'create', fais: 'make', tâche: 'task', tache: 'task', tâches: 'tasks', taches: 'tasks', ouvre: 'open', ouvrir: 'open', demain: 'tomorrow',
    aujourdhui: 'today', "aujourd'hui": 'today', thème: 'theme', sombre: 'dark', clair: 'light', paramètres: 'settings', parametres: 'settings', réglages: 'settings', calendrier: 'calendar', fichiers: 'files', annuler: 'undo', annule: 'undo', terminée: 'done', pour: 'for', une: 'a', les: 'the', mode: 'mode',
    füge: 'add', fuge: 'add', hinzufügen: 'add', hinzufugen: 'add', erstelle: 'create', erstellen: 'create', mach: 'make', mache: 'make', aufgabe: 'task', aufgaben: 'tasks', notiz: 'note', öffne: 'open', offne: 'open', öffnen: 'open',
    morgen: 'tomorrow', heute: 'today', thema: 'theme', dunkel: 'dark', dunkles: 'dark', hell: 'light', helles: 'light', einstellungen: 'settings', kalender: 'calendar', dateien: 'files', rückgängig: 'undo', ruckgangig: 'undo', erledigt: 'done', für: 'for', fur: 'for', eine: 'a', einen: 'a', ein: 'a', der: 'the', die: 'the', das: 'the', hinzu: '', bitte: 'please', por: '', favor: '', sil: '', plait: '',
  };
  const LEX_CJK = [   // longest first
    ['元に戻す', 'undo'], ['カレンダー', 'calendar'], ['タスク', 'task'], ['ダーク', 'dark'], ['ライト', 'light'], ['テーマ', 'theme'], ['追加', 'add'], ['メモ', 'note'], ['開いて', 'open'], ['開く', 'open'], ['明日', 'tomorrow'], ['今日', 'today'], ['設定', 'settings'], ['招待', 'invite'], ['完了', 'done'],
    ['실행취소', 'undo'], ['할일', 'task'], ['캘린더', 'calendar'], ['추가', 'add'], ['메모', 'note'], ['열어', 'open'], ['열기', 'open'], ['내일', 'tomorrow'], ['오늘', 'today'], ['다크', 'dark'], ['라이트', 'light'], ['테마', 'theme'], ['설정', 'settings'], ['초대', 'invite'], ['완료', 'done'],
    ['撤销', 'undo'], ['任务', 'task'], ['添加', 'add'], ['新建', 'add'], ['笔记', 'note'], ['打开', 'open'], ['明天', 'tomorrow'], ['今天', 'today'], ['深色', 'dark'], ['暗色', 'dark'], ['浅色', 'light'], ['主题', 'theme'], ['设置', 'settings'], ['日历', 'calendar'], ['邀请', 'invite'],
  ];
  // short words that are also English ("die", "la", "un", "a"): only read as another language's word when the message is in that language
  const ARTS = new Set(['una', 'uno', 'un', 'el', 'los', 'las', 'para', 'uma', 'um', 'une', 'les', 'pour', 'eine', 'einen', 'ein', 'der', 'die', 'das', 'für', 'fur', 'hinzu', 'bitte', 'por', 'favor', 'mode', 'como', 'qué', 'marca', 'hell', 'nota', 'tema']);
  const CJK_DROP = ['てください', 'ください', 'して', 'を', 'に', 'は', '一个', '的', '吧', '请', '了', '해줘', '해 줘', '하기', '좀', '을', '를', '에'];
  const SLANG = {
    whats: 'what is', "what's": 'what is', wats: 'what is', wat: 'what', hows: 'how is', "how's": 'how is', "who's": 'who is', whos: 'who is', "where's": 'where is', wheres: 'where is', "it's": 'it is', "that's": 'that is', thats: 'that is',
    "i'm": 'i am', im: 'i am', "i'd": 'i would', id: 'i would', "i've": 'i have', "don't": 'do not', dont: 'do not', "can't": 'can not', cant: 'can not', "won't": 'will not', "let's": 'lets', "there's": 'there is', "we're": 'we are', "you're": 'you are',
    ad: 'add', tsk: 'task', tsks: 'tasks', tak: 'task', nte: 'note', opn: 'open', shw: 'show', pls: 'please', plz: 'please', pleas: 'please', u: 'you', ur: 'your', r: 'are', thx: 'thanks', ty: 'thanks', tysm: 'thanks', tmrw: 'tomorrow', tmr: 'tomorrow', tmw: 'tomorrow', '2moro': 'tomorrow', '2morrow': 'tomorrow', tomorow: 'tomorrow', tommorow: 'tomorrow', tommorrow: 'tomorrow',
    '2day': 'today', tdy: 'today', tn: 'tonight', '2nite': 'tonight', tonite: 'tonight', gonna: 'going to', wanna: 'want to', gotta: 'have to', lemme: 'let me', gimme: 'give me', msg: 'message', mtg: 'meeting', cal: 'calendar', sched: 'schedule', pic: 'picture', pics: 'pictures',
    todo: 'task', todos: 'tasks', chore: 'task', chores: 'tasks', memo: 'note', document: 'doc', documents: 'docs', spreadsheet: 'sheet', spreadsheets: 'sheets', presentation: 'slides', slideshow: 'slides', deck: 'slides', colour: 'color', colours: 'colors', grey: 'gray', centre: 'center', centred: 'centered',
    remove: 'delete', erase: 'delete', trash: 'delete', yo: 'hey', hiya: 'hi', sup: 'hi', asap: 'today', rn: 'now', abt: 'about', w: 'with', b4: 'before', thru: 'through', nite: 'night', fav: 'favorite', favourite: 'favorite', okay: 'ok', k: 'ok', kk: 'ok',
  };
  // words never "corrected" into commands (real words one letter away from a command word)
  const KEEP = new Set(('cloud could shader safari resize resizes flicker made bake cake take fake lake wake sake rake mode node code ode load road toad told cold bold hold fold gold sold mold note vote tote rote dote date data gate late mate rate hate fate kate nate pate site bite kite mite rite cite sit set get bet jet let met net pet wet yet vet bit fit hit kit lit pit wit task mask cask bask desk disk dusk chat that what than then them they this thus with will wall well tell till toll dell bell cell fell hell sell yell call fall hall mall tall ball wall '
    + 'open oven omen over ever even each each eat ate add odd aid and any are art ask big bug dug hug mug rug tug pug fix six mix box fox pox ten men pen hen den yen pan man can fan ran tan van ban nan new few dew sew mew pew jew hew free tree three thee then send sand bend lend mend tend vend fend rend show snow slow glow blow flow stow know shop stop slop chop drop crop prop name same game came fame lame tame home dome some come hope rope pope dope cope page sage rage wage cage gage stage make mike lake like bike hike pike dike '
    + 'item stem them deem seem team tear tier dear fear gear hear near pear rear sear wear year week weak peak leak beak each beach teach reach peach bleach list lost last lust mist fist gist past post most host cost dust must rust bust test text next nest best rest west vest jest chest guest move love dove cove wove rove done gone bone cone hone lone tone zone none one link line lime mine fine dine wine nine pine vine time tame dime rime file fire hire wire tire sire mire dark bark park lark mark dare care bare fare hare mare rare ware light night might right sight tight fight eight weight board boards hoard').split(/\s+/));
  const STOPW = new Set('a an the to of in on at for and or is are be do does did i me my we our you your it this that with please can could would will just some any'.split(' '));

  const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  function dl(a, b, max) {   // Damerau-Levenshtein, stops early past max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) { let best = Infinity; for (let j = 1; j <= b.length; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); best = Math.min(best, d[i][j]); } if (best > max) return max + 1; }
    return d[a.length][b.length];
  }

  // ---------- tokens: { o: what the person wrote, w: Flint's canonical word(s) } ----------
  function tokenize(raw) {
    let s = String(raw || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
    s = s.replace(/\bto-dos?\b/gi, m => /s$/i.test(m) ? 'todos' : 'todo').replace(/할\s+일/g, '할일').replace(/실행\s+취소/g, '실행취소');
    const out = [], re = /#[0-9a-f]{3,8}\b|[\p{L}\p{N}]+(?:'[\p{L}]+)*(?:[.:/][\p{N}]+)*%?|[+\-*/×÷()^=@]/giu;
    let m; while ((m = re.exec(s))) {
      const tok = m[0];
      if (CJK.test(tok)) { cjkSplit(tok).forEach(t => out.push(t)); continue; }
      out.push({ o: tok, w: tok.toLowerCase() });
    }
    // hyphens between letters split words ("link-in-bio"), a lone "-" between letters is dropped
    return out.filter((t, i) => !(t.w === '-' && out[i - 1] && out[i + 1] && /\p{L}$/u.test(out[i - 1].w) && /^\p{L}/u.test(out[i + 1].w)));
  }
  function cjkSplit(tok) {
    const out = []; let i = 0, buf = '';
    const flush = () => { if (buf) { out.push({ o: buf, w: buf, cjk: true }); buf = ''; } };
    while (i < tok.length) {
      const hit = LEX_CJK.find(([k]) => tok.startsWith(k, i)); if (hit) { flush(); out.push({ o: hit[0], w: hit[1] }); i += hit[0].length; continue; }
      const drop = CJK_DROP.find(k => tok.startsWith(k, i)); if (drop) { flush(); i += drop.length; continue; }
      buf += tok[i]; i++;
    }
    flush(); return out;
  }
  let VOCAB = null;
  function canon(tokens, extraKeep, lang) {
    const foreign = lang && lang !== 'en';
    for (const t of tokens) {
      if (t.cjk) continue;
      let w = deaccent(t.w);
      const lex = k => LEX[k] !== undefined && (foreign || !ARTS.has(k));
      if (lex(t.w)) w = LEX[t.w]; else if (lex(w)) w = LEX[w];
      else if (SLANG[t.w] !== undefined) w = SLANG[t.w];
      else {
        w = w.replace(/'s$/, 's').replace(/'/g, '');
        if (SLANG[w] !== undefined) w = SLANG[w];
        else if (VOCAB && w.length >= 4 && /^[a-z]+$/.test(w) && !VOCAB.has(w) && !KEEP.has(w) && !(extraKeep && extraKeep.has(w))) {
          const max = w.length >= 7 ? 2 : 1; let best = null, bd = max + 1;
          for (const v of VOCAB) { if (v.length < 3 || (w.length <= 5 && v[0] !== w[0])) continue; const d = dl(w, v, max); const ana = x => x.split('').sort().join(''); if (d < bd || (d === bd && best && ((v.length === w.length && best.length !== w.length) || (ana(v) === ana(w) && ana(best) !== ana(w))))) { bd = d; best = v; } }
          if (best && bd <= max) { t.fixed = true; w = best; }
        }
      }
      t.w = w;
    }
    return tokens.filter(t => t.w !== '');
  }
  const FILL_HEAD = [['hey', 'flint'], ['hi', 'flint'], ['ok', 'flint'], ['flint'], ['ok', 'so'], ['ok'], ['so'], ['um'], ['please'], ['can', 'you'], ['could', 'you'], ['would', 'you'], ['will', 'you'], ['can', 'you', 'please'], ['i', 'want', 'you', 'to'], ['i', 'need', 'you', 'to'], ['go', 'ahead', 'and'], ['lets'], ['let', 'us'], ['just'], ['quickly'], ['kindly'],
    ['i', 'want', 'to'], ['i', 'would', 'like', 'to'], ['i', 'would', 'love', 'to'], ['help', 'me'], ['be', 'a', 'dear', 'and'], ['hey']];
  const FILL_TAIL = [['please'], ['thanks'], ['thank', 'you'], ['for', 'me'], ['now'], ['right', 'now'], ['flint'], ['ok'], ['pls']];
  function trimFill(tokens) {
    let t = tokens.slice(), changed = true;
    const words = () => t.map(x => x.w.split(' ')).flat();
    while (changed && t.length > 1) {
      changed = false;
      for (const f of FILL_HEAD) { const ws = words(); if (ws.length > f.length && f.every((x, i) => ws[i] === x)) { let n = f.length; while (n > 0) { n -= t[0].w.split(' ').length; t.shift(); } changed = true; break; } }
      for (const f of FILL_TAIL) { const ws = words(); if (ws.length > f.length && f.every((x, i) => ws[ws.length - f.length + i] === x)) { let n = f.length; while (n > 0) { n -= t[t.length - 1].w.split(' ').length; t.pop(); } changed = true; break; } }
    }
    return t;
  }
  function joinCanon(tokens) { let c = '', spans = []; tokens.forEach((t, i) => { if (i) c += ' '; spans.push([c.length, c.length + t.w.length]); c += t.w; }); return { c, spans }; }
  function original(tokens, spans, s, e, ex) {
    const hit = tokens.filter((t, i) => spans[i][1] > s && spans[i][0] < e && !(ex || []).some(([a, b]) => spans[i][1] > a && spans[i][0] < b));
    return hit.map((t, i) => (i && !(t.cjk && hit[i - 1].cjk) ? ' ' : '') + t.o).join('').replace(/\s+([,.!?])/g, '$1').trim();
  }

  // ---------- slots ----------
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], DSHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, a: 1, an: 1, couple: 2, few: 3 };
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const DATE_RX = new RegExp('\\b(?:(?:by|on|for|due|until|till|before|this|next|coming|at|around)\\s+)*(?:'
    + '(today|tonight|tomorrow(?: morning| afternoon| evening| night)?|day after tomorrow|end of (?:the )?(?:day|week|month)|eod|eow|this weekend|next weekend|weekend|next week|next month|'
    + `(?:next |this |coming )?(?:${DAYS.join('|')}|${Object.keys(DSHORT).join('|')})s?|in (\\d+|${Object.keys(NUMW).join('|')}) (days?|weeks?|months?|hours?|minutes?|mins?)|`
    + `(?:${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec) \\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2}|the \\d{1,2}(?:st|nd|rd|th))`
    + ')(?:\\s+(?:at\\s+)?(\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)|\\d{1,2}:\\d{2}|noon|midnight|morning|afternoon|evening|night))?\\b', 'i');
  const TIME_RX = /\b(?:at\s+)?(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)\b/i;
  function parseWhen(c, now) {
    now = now || new Date(); const m = DATE_RX.exec(c), out = {};
    let d = null;
    if (m) {
      const w = m[1].toLowerCase();
      if (/^(today|tonight|eod)$/.test(w)) d = now;
      else if (/^tomorrow/.test(w)) d = addDays(now, 1);
      else if (w === 'day after tomorrow') d = addDays(now, 2);
      else if (/end of (the )?week|eow/.test(w)) d = addDays(now, (5 - now.getDay() + 7) % 7);
      else if (/end of (the )?month/.test(w)) d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      else if (/^end of (the )?day$/.test(w)) d = now;
      else if (/weekend/.test(w)) { d = addDays(now, (6 - now.getDay() + 7) % 7 || 7); if (/next/.test(w)) d = addDays(d, 7); }
      else if (w === 'next week') d = addDays(now, ((1 - now.getDay() + 7) % 7) || 7);
      else if (w === 'next month') d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      else if (/^in /.test(w)) { const n = /^\d+$/.test(m[2]) ? +m[2] : NUMW[m[2]] || 1, u = m[3]; d = /^day/.test(u) ? addDays(now, n) : /^week/.test(u) ? addDays(now, 7 * n) : /^month/.test(u) ? new Date(now.getFullYear(), now.getMonth() + n, now.getDate()) : now; if (/^(hour|min)/.test(u)) { const t = new Date(now.getTime() + n * (/^hour/.test(u) ? 3600e3 : 60e3)); out.time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; } }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(w)) d = new Date(w + 'T12:00');
      else if (/^\d{1,2}\/\d{1,2}/.test(w)) { const [a, b, y] = w.split('/').map(Number); d = new Date(y ? (y < 100 ? 2000 + y : y) : now.getFullYear(), a - 1, b); if (!y && d < addDays(now, -1)) d.setFullYear(d.getFullYear() + 1); }
      else if (/^the \d/.test(w)) { const n = parseInt(w.slice(4), 10); d = new Date(now.getFullYear(), now.getMonth(), n); if (d < addDays(now, -1)) d = new Date(now.getFullYear(), now.getMonth() + 1, n); }
      else {
        const dn = DAYS.findIndex(x => w.includes(x)), ds = Object.keys(DSHORT).find(x => new RegExp(`\\b${x}s?$`).test(w));
        const day = dn >= 0 ? dn : ds ? DSHORT[ds] : -1;
        if (day >= 0) { let n = (day - now.getDay() + 7) % 7; if (n === 0) n = 7; if (/\bnext\b/.test(m[0]) && n < 7 && (/next/.test(w) || /next\s+\w+$/.test(m[0]))) { /* "next friday" = the coming one when it's 2+ days away, like people mean */ if (n <= 1) n += 7; } d = addDays(now, n); }
        else { const mi = MONTHS.findIndex(x => w.includes(x.slice(0, 3))), num = parseInt(w.replace(/\D+/g, ' ').trim(), 10); if (mi >= 0 && num) { d = new Date(now.getFullYear(), mi, num); if (d < addDays(now, -1)) d.setFullYear(d.getFullYear() + 1); } }
      }
      if (m[4]) out.time = hhmm(m[4]);
      out.span = [m.index, m.index + m[0].length]; out.text = m[0];
    }
    if (!out.time) { const t = TIME_RX.exec(c); if (t && (m || /\b(at|by)\s/.test(t[0]) || /am|pm|noon|midnight/.test(t[1]))) { out.time = hhmm(t[1]); if (!out.span) { out.span = [t.index, t.index + t[0].length]; out.text = t[0]; } else { out.tspan = [t.index, t.index + t[0].length]; } if (!d) d = now; } }
    if (d) out.date = ymd(d);
    return out.date || out.time ? out : null;
  }
  function hhmm(s) {
    s = s.toLowerCase().trim(); if (s === 'noon') return '12:00'; if (s === 'midnight') return '00:00'; if (s === 'morning') return '09:00'; if (s === 'afternoon') return '14:00'; if (s === 'evening') return '18:00'; if (s === 'night') return '20:00';
    const m = /(\d{1,2})(?::(\d{2}))?\s?(am|pm)?/.exec(s); if (!m) return null; let h = +m[1]; const mi = m[2] || '00';
    if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0; if (!m[3] && h < 8) h += 12; return `${String(h).padStart(2, '0')}:${mi}`;
  }
  const COLORS = { red: '#E5484D', crimson: '#DC143C', orange: '#F26B1D', ember: '#F26B1D', amber: '#F2B33D', yellow: '#F5D90A', gold: '#D4A017', lime: '#84CC16', green: '#3BD16F', mint: '#3EE6B0', teal: '#38C6B1', cyan: '#22C3E6', turquoise: '#40E0D0', sky: '#5AB8FF', blue: '#3B82F6', navy: '#1E3A8A', indigo: '#6C7CFF', violet: '#A58BFF', purple: '#8B5CF6', lavender: '#B9A7FF', magenta: '#E040FB', pink: '#FF6F8E', rose: '#FF6F8E', coral: '#FF7F6B', salmon: '#FA8072', peach: '#FFB38A', brown: '#8B5E3C', tan: '#D2B48C', beige: '#E8DCC4', cream: '#FFF8E7', white: '#FFFFFF', black: '#000000', gray: '#8A8F98', silver: '#C0C0C0', charcoal: '#36454F' };
  const COLOR_RX = new RegExp(`(#[0-9a-f]{3,8}\\b|\\b(?:${Object.keys(COLORS).join('|')})\\b)`, 'i');
  const colorOf = s => { const m = COLOR_RX.exec(s || ''); if (!m) return null; const k = m[1].toLowerCase(); return { name: k, hex: k[0] === '#' ? k : COLORS[k] }; };
  const THEMES = { campfire: 'campfire', 'tribecode dark': 'dark', 'tribecode': 'dark', light: 'light', midnight: 'midnight', nordic: 'nordic', nord: 'nordic', nightshade: 'nightshade', dracula: 'nightshade', 'solar dark': 'solar-dark', 'solarized dark': 'solar-dark', 'solar light': 'solar-light', 'solarized light': 'solar-light', 'high contrast': 'contrast', contrast: 'contrast', dark: 'dark-mode', night: 'dark-mode', day: 'light' };
  const LANGS = { english: 'en', ingles: 'en', spanish: 'es', espanol: 'es', castellano: 'es', portuguese: 'pt', portugues: 'pt', brazilian: 'pt', french: 'fr', francais: 'fr', german: 'de', deutsch: 'de', japanese: 'ja', nihongo: 'ja', chinese: 'zh', mandarin: 'zh', korean: 'ko', hangul: 'ko' };
  function person(s, ctx) {
    const v = String(s || '').toLowerCase().replace(/^(to|with|for)\s+/, '').replace(/[.,!?]+$/, '').trim(); if (!v) return null;
    if (/^(everyone|everybody|the team|team|the tribe|tribe|all|the group|the chat|chat|general|y'?all|the channel|channel)$/.test(v)) return { all: true, name: 'everyone' };
    if (/^(me|myself)$/.test(v)) return { me: true, name: 'me' };
    if (/^(him|her|them|they)$/.test(v) && ctx && ctx.last && ctx.last.person) return ctx.last.person;
    const ms = (ctx && ctx.members) || [];
    const first = x => String(x.name || '').toLowerCase().split(/\s+/)[0];
    let hit = ms.find(x => String(x.name || '').toLowerCase() === v) || ms.find(x => first(x) === v) || ms.find(x => first(x) === v.split(/\s+/)[0] && v.split(/\s+/).length <= 2);
    if (!hit && v.length >= 4) hit = ms.find(x => dl(first(x), v, 1) <= 1);
    if (hit) return { id: hit.id, name: hit.name, agent: hit.role === 'agent' };
    if (/claude|codex|gemini|agent|my ai/.test(v)) { const a = ms.find(x => x.role === 'agent'); return a ? { id: a.id, name: a.name, agent: true } : { agent: true, name: v }; }
    return null;
  }
  const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(w => w && !STOPW.has(w)).map(stem);
  const stem = w => (w.length > 4 ? w.replace(/(ings?|edly|ed|es|s)$/, '') : w);
  function taskRef(ref, ctx) {
    const v = String(ref || '').toLowerCase().replace(/^(the|my|our|that|this)\s+/, '').replace(/\s+(task|one|item)$/, '').replace(/^task\s+/, '').trim();
    const tasks = ((ctx && ctx.tasks) || []).filter(t => t && t.title);
    if (!v || /^(it|that|this|that one|this one|the last one|last one|the task|task)$/.test(v)) return ctx && ctx.last && ctx.last.task ? tasks.find(t => t.id === ctx.last.task.id) || ctx.last.task : null;
    const q = words(v); if (!q.length) return null;
    let best = null, bs = 0;
    for (const t of tasks) {
      const tw = words(t.title), low = t.title.toLowerCase();
      if (low === v) return t;
      const inter = q.filter(w => tw.some(x => x === w || (w.length >= 4 && dl(x, w, 1) <= 1))).length;
      const s = inter / Math.max(q.length, 1) * 0.75 + inter / Math.max(tw.length, 1) * 0.25 + (low.includes(v) ? 0.3 : 0);
      if (s > bs) { bs = s; best = t; }
    }
    return bs >= 0.5 ? best : null;
  }

  // ---------- the intent catalog ----------
  // { id, area, rx: [RegExp on the canonical text], p: base confidence, req: { slot: 'question' }, fill(s, c, ctx) -> slots|null, ex: [examples] }
  const CAT = [];
  const I = (id, area, rx, o = {}) => { CAT.push({ id, area, rx: [].concat(rx).map(r => new RegExp(r.source, r.flags.replace('d', '') + 'd')), p: o.p || 0.95, req: o.req || {}, fill: o.fill, ex: o.ex || [], bag: o.bag, ctx: o.ctx, label: o.label || '' }); };
  const V_OPEN = '(?:open|go to|goto|show|show me|take me to|switch to|bring up|pull up|view|launch|jump to|navigate to|head to|get me to|load|see|visit|display|open up)';
  const ART = '(?:(?:the|my|our|a|an|this|that|your)\\s+)*';
  const V_MAKE = '(?:make|build|create|start|generate|spin up|set up|whip up|put together|give me|design|code|write|i want|we want|i need|we need|get me|craft|draft|do)';

  // navigation: one intent per place (open X / X / where is X)
  const NAV = [
    ['home', 'home|dashboard|overview|start page|main page|front page|homepage of the app', 'Home'], ['chat', 'chat|general chat|general|messages|channel|group chat|team chat|the chat', 'Chat'], ['dms', 'dms|direct messages|private messages|my dms', 'Direct messages'],
    ['inbox', 'inbox|notifications|alerts|notification center|mentions', 'Inbox'], ['files', 'files|docs|file list|file browser|folder|my files|doc list', 'Files'], ['tasks', 'tasks|task board|board|kanban|task list|task page|backlog|to do list', 'Task Board'],
    ['calendar', 'calendar|schedule|agenda|planner', 'Calendar'], ['website', 'website|site|site builder|website builder|web page', 'Website'], ['templates', 'website templates|site templates|templates|template gallery|template library', 'Website templates'],
    ['whiteboard', 'whiteboard|white board|board for drawing|sticky notes', 'Whiteboard'], ['design', 'design|canvas|design canvas|design editor|figma|editor|frames', 'Design'], ['preview', 'preview|live preview|the app preview|preview window', 'Preview'],
    ['agents', 'agents hub|agents|ai helpers|my agents|helpers', 'Agents Hub'], ['mcp', 'mcp|mcp directory|connectors|integrations|mcp servers', 'MCP directory'], ['bugs', 'bugs|bug list|issues|bug tracker|bug reports', 'Bugs'],
    ['repo', 'repo|code repository|repository|git|code|source code|commits|github', 'Code repository'], ['settings', 'settings|preferences|options|config|configuration|setup', 'Settings'], ['guide', 'guide|help center|manual|docs for tribecode|help docs|handbook', 'Guide'],
    ['market', 'marketplace|market|plugin store|extensions|add ons|addons', 'Marketplace'], ['studios', 'studios|creative tools|tools page|studio tools|download tools', 'Studios'], ['company', 'company|company mode|business|my company|company page', 'Company'],
    ['assets', 'asset library|assets|sound library|sprite library|asset store', 'Asset library'], ['academy', 'academy|lessons|courses|learning', 'Academy'], ['secretary', 'secretary|journal|ideas journal', 'Secretary'],
    ['personalize', 'personalize|personalization|make it yours|look and feel', 'Personalize'], ['customize', 'customize|customization|tribe look|appearance', 'Customize'], ['profile', 'profile|my profile|account|my account', 'Profile'],
    ['trending', 'trending|trending repos|trending on github|github trending|hot repos', 'Trending'], ['jam', 'jam|jam mode|game jam', 'Jam'], ['publish', 'publish panel|publishing|publish page|play link page', 'Publish'],
    ['money', 'money|ledger|finances|expenses|budget page|spending', 'Money'], ['search', 'search|command palette|palette|quick search|spotlight', 'Search'], ['shortcuts', 'shortcuts|keyboard shortcuts|hotkeys|key bindings', 'Shortcuts'],
    ['visuals', 'visuals|screenshots|screenshot gallery|images|media', 'Visuals'], ['notes', 'notes|my notes|captures|scratchpad|meeting notes', 'Notes'], ['updates', 'updates|changelog|release notes|whats new in tribecode|version history', 'Updates'], ['inspo', 'inspiration board|inspo board|inspo|moodboard|mood board|my board|inspiration', 'Inspiration board'], ['brainpick', 'flints brain|flint brain|brain settings|model picker|ai model settings', "Flint's brain"],
  ];
  for (const [k, w, label] of NAV) {
    I('nav.' + k, 'nav', [new RegExp(`^${V_OPEN}\\s+${ART}(?:${w})(?:\\s+(?:page|view|tab|section|screen|panel|please))?$`), new RegExp(`^(?:where(?: is| are| can i find| do i find)|how do i (?:get to|find|open))\\s+${ART}(?:${w})$`), new RegExp(`^${ART}(?:${w})(?:\\s+(?:page|view|tab|section|screen|panel))?$`)],
      { p: 0.93, label, ex: [`open ${w.split('|')[0]}`, `go to the ${w.split('|')[0]}`, `show me ${w.split('|')[1] || w.split('|')[0]}`] });
  }

  // tasks
  const TASKW = '(?:task|tasks|item|card|ticket|to do|reminder|action item)';
  I('task.add', 'tasks', [
    new RegExp(`^(?:add|create|make|new|put|start|log|write|jot|file|track|insert)\\s+${ART}(?:new\\s+|another\\s+|one more\\s+|quick\\s+)?${TASKW}(?:\\s+(?:to|on|in)\\s+${ART}(?:board|list|tasks?|backlog))?(?:\\s*(?:to|called|named|that says|saying|for|about|so we|so i|:|-)\\s*|\\s+)(?<title>.+)$`),
    new RegExp(`^${TASKW}\\s*:?\\s+(?<title>.+)$`), /^(?:add|new|log)\s+(?:an?\s+)?(?<title>(?:urgent|important|asap|high priority)\s*:?\s+.+)$/,
    /^(?:remind me to|remember to|dont let me forget to|do not let me forget to|i need to remember to|i should|we should|i have to|we have to|i need to|we need to|need to|someone needs to|somebody should|todo)\s+(?<title>.+)$/,
    new RegExp(`^(?:add|put|throw|stick)\\s+(?<title>.+?)\\s+(?:to|on|in)\\s+${ART}(?:tasks?|list|board|task list|backlog|to do list|task board)$`),
  ], { req: { title: 'What should the task say?' }, fill: (s, c, ctx, X) => taskBits(s, ctx, X), ex: ['add a task to buy milk', 'new task: fix the jump bug', 'remind me to email Sam tomorrow', 'todo call the printer'] });
  I('task.done', 'tasks', [
    /^(?:mark|set|move|put|flag)\s+(?<ref>.+?)\s+(?:as\s+|to\s+)?(?:done|complete|completed|finished|closed|resolved)$/,
    /^(?:complete|finish|finished|check off|tick off|close|resolve|i finished|i did|i am done with|i completed|done with|finished with|we finished|we did|knocked out)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/,
    /^(?<ref>it|that|this|that one|this one|the task)\s+is\s+(?:done|finished|complete)$/, /^(?<ref>.+?)\s+is\s+(?:done|finished|complete|completed)$/,
    /^(?:done|finished|complete)\s*:?\s+(?<ref>.+)$/, /^(?:mark (?<ref>it|that|this) done|done with (?:it|that)|its done|that is done|it is done|all done with it)$/,
  ], { req: { ref: 'Which task is done?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['mark the logo task done', 'i finished the jump bug', 'done: buy milk'] });
  I('task.start', 'tasks', [/^(?:start|begin|work on|i am starting|i will take|ill take|i will do|ill do|pick up|take|grab|claim|i am on|im on|i am working on|start working on)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/, /^(?:move|put|set)\s+(?<ref>.+?)\s+(?:to|in|into)\s+(?:in progress|doing|progress)$/], { p: 0.86, fill: (s, c, ctx) => refFill(s, ctx, true), ex: ['start the logo task', 'i will take the menu bug', 'move buy milk to in progress'] });
  I('task.assign', 'tasks', [
    /^(?:assign|give|hand|pass|delegate|send)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+?)\s+to\s+(?<who>.+)$/,
    /^(?:have|let|get|ask)\s+(?<who>[\p{L}][\p{L}'-]*)\s+(?:to\s+)?(?:do|take|handle|own|work on|look at|pick up)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/u,
    /^(?:assign|give)\s+(?<who>[\p{L}][\p{L}'-]*)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/u,
  ], { req: { ref: 'Which task?', who: 'Who should do it?' }, fill: (s, c, ctx) => { const r = refFill(s, ctx); if (!r) return null; const p = person(s.who, ctx); if (s.who && !p) return null; return { ...r, who: p }; }, ex: ['assign the logo task to Maya', 'give buy milk to Sam', 'have Maya do the menu'] });
  I('task.review', 'tasks', [/^(?:send|move|put|submit|mark)\s+(?<ref>.+?)\s+(?:to|for|in|into|as ready for|as)\s+(?:review|code review|approval)$/, /^(?<ref>.+?)\s+is\s+ready for review$/, /^(?:ready for review|please review|review please)\s*:?\s*(?<ref>.*)$/], { req: { ref: 'Which task is ready for review?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['send the logo task to review', 'menu bug is ready for review'] });
  I('task.delete', 'tasks', [/^(?:delete|drop|scrap|cancel|kill|nuke|get rid of)\s+(?:the\s+)?(?:task|item|card|todo)\s+(?<ref>.+)$/, /^(?:delete|drop|scrap|cancel|get rid of)\s+(?<ref>.+?)\s+(?:task|from (?:the )?(?:board|tasks|list))$/, /^(?:delete|scrap|cancel) (?<ref>that task|this task|the last task|that one)$/], { req: { ref: 'Which task should I delete?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['delete the task buy milk', 'scrap the logo task'] });
  I('task.due', 'tasks', [
    /^(?:set|change|move|make|update)\s+(?:the\s+)?(?:due date|deadline|due)\s+(?:of|for|on)\s+(?<ref>.+?)\s+to\s+(?<when>.+)$/, /^(?<ref>.+?)\s+is\s+due\s+(?<when>.+)$/, /^(?:push|move|postpone|delay|bump|reschedule)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+?)\s+(?:to|till|until|back to)\s+(?<when>.+)$/,
    /^(?:make|set)\s+(?<ref>.+?)\s+due\s+(?<when>.+)$/,
  ], { req: { ref: 'Which task?', when: 'When is it due?' }, fill: (s, c, ctx, X) => { const r = refFill(s, ctx); if (!r) return null; const w = parseWhen(String((X && X.c.when) || s.when || '').toLowerCase(), ctx && ctx.now); if (s.when && !w) return null; return { ...r, due: w && w.date }; }, ex: ['push the logo task to friday', 'set the due date of buy milk to tomorrow'] });
  I('task.rename', 'tasks', [/^(?:rename|retitle|call)\s+(?:the\s+)?task\s+(?<ref>.+?)\s+(?:to|as)\s+(?<title>.+)$/, /^(?:rename|retitle)\s+(?<ref>.+?)\s+to\s+(?<title>.+)$/, /^change\s+(?:the\s+)?(?:title|name)\s+of\s+(?<ref>.+?)\s+to\s+(?<title>.+)$/], { req: { ref: 'Which task?', title: 'What should it be called?' }, fill: (s, c, ctx) => { if (/layer/.test(s.ref || '')) return null; const r = refFill(s, ctx); return r && { ...r, title: s.title }; }, ex: ['rename the task logo to new logo'] });
  I('task.list', 'tasks', [
    /^(?:what are|show|list|show me|give me|what is|what)\s+(?:are\s+)?(?:all\s+)?(?:of\s+)?(?<whose>my|our|the|mine)?\s*(?<which>open|overdue|late|remaining|current|todays|urgent|unfinished)?\s*(?:tasks|task|items|to dos|todo list)(?:\s+(?:for\s+|due\s+)?(?<when>today|tomorrow|this week|overdue|due today|due soon|left))?$/,
    /^(?:what is|whats|anything)\s+(?<which>due|overdue|late)(?:\s+(?<when>today|tomorrow|this week|soon))?$/, /^what do (?<whose>i|we) (?:have|need|got) to do(?:\s+(?<when>today|tomorrow|this week))?$/, /^(?<whose>my) (?:tasks|to dos|list)$/, /^what is on my plate$/, /^how many tasks(?: are)? (?:left|open|do i have|do we have)$/,
  ], { p: 0.9, fill: (s, c, ctx, X) => { const g = k => String((X && X.c[k]) || s[k] || '').toLowerCase(); return { whose: /^(my|mine|i)$/.test(g('whose')) || /\bmy\b/.test(c) ? 'me' : 'all', which: /overdue|late/.test(g('which') + g('when')) ? 'overdue' : g('when').includes('today') || g('which') === 'todays' ? 'today' : g('when').includes('week') ? 'week' : 'open' }; }, ex: ['what are my tasks', 'show open tasks', 'whats overdue', 'what do i have to do today'] });
  I('task.unassigned', 'tasks', [/^(?:what|which)\s+(?:tasks\s+)?(?:needs?|need)\s+(?:someone|an owner|owners|assigning|a person|help)$/, /^(?:unassigned|orphan|unowned)\s+tasks$/, /^(?:show|list)\s+(?:the\s+)?unassigned(?:\s+tasks)?$/, /^what can i (?:help with|pick up|grab)$/], { ex: ['what needs someone', 'unassigned tasks'] });

  // notes, docs, sheets, slides
  I('note.add', 'notes', [/^(?:note to self|jot down|write down|save a note|take a note|make a note|add a note|new note|quick note|remember that|note|jot|capture)\s*(?:that|:|-|saying|about)?\s+(?<body>.+)$/], { req: { body: 'What should I write down?' }, ex: ['note: the boss needs a second phase', 'jot down call the venue', 'remember that the demo is at 3'] });
  I('note.blank', 'notes', [/^(?:new|blank|empty)\s+note$/, /^(?:start|open|create|make|take|add|write)\s+(?:a\s+)?(?:new\s+|blank\s+|empty\s+)*note$/], { ex: ['new note', 'start a blank note'] });
  const DOCW = 'email|doc|page|write up|writeup|plan|brief|memo|outline|spec|essay|letter|proposal|report|one pager|post|article|guide|readme|press release|faq|agenda|summary|script|story|blog post|announcement|email draft|cover letter|bio';
  I('doc.new', 'docs', [new RegExp(`^(?:write|draft|make|create|start|new|put together|compose|generate|give me|prepare|type up)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|short\\s+|simple\\s+|rough\\s+|first\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:${DOCW})(?:\\s+(?:about|on|for|called|named|titled|explaining|describing|covering|with)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.9, fill: s => ({ topic: s.topic || s.topic2 || '' }), ex: ['write a doc about the launch', 'draft a plan for the jam', 'make a page called rules'] });
  I('doc.new', 'docs', [/^add\s+(?:a|an)\s+(?:new\s+)?(?:[\p{L}-]+\s+)?page(?:\s+(?:to|in)\s+(?:the\s+|my\s+|our\s+)?(?:docs|files))?(?:\s+(?:about|on|for|called)\s+(?<topic>.+))?$/u], { p: 0.9, fill: s => ({ topic: s.topic || '' }), ex: ['add a page to the docs about rules'] });
  I('sheet.new', 'docs', [new RegExp(`^(?:make|create|start|build|new|set up|give me|put together|draft)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|simple\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:sheet|sheets|table|budget|tracker|expense sheet|expense tracker|inventory|price list|roster|schedule sheet|sign up sheet|signup sheet|ledger)(?:\\s+(?:about|on|for|of|called|named|with|to track)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.91, fill: s => ({ topic: s.topic || s.topic2 || '' }), ex: ['make a sheet for the budget', 'create an expense tracker', 'new sheet for inventory'] });
  I('deck.new', 'docs', [new RegExp(`^(?:make|create|build|draft|put together|give me|new|write|prepare|start)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|short\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:slides|slide|pitch slides|pitch|keynote)(?:\\s+(?:about|on|for|called|named|explaining|covering)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.92, fill: s => ({ topic: s.topic || s.topic2 || '' }), ex: ['make slides about the launch', 'build a pitch deck for investors'] });
  I('doc.open', 'docs', [/^(?:open|show|find|pull up|bring up|go to)\s+(?:the\s+|my\s+|our\s+)?(?:doc|page|file|note|sheet|slides)\s+(?:called\s+|named\s+|about\s+)?(?<name>.+)$/, /^(?:open|show|pull up)\s+(?:the\s+|my\s+|our\s+)?(?<name>.+?)\s+(?:doc|page|file|sheet|slides|note)$/], { p: 0.88, req: { name: 'Which doc?' }, ex: ['open the doc rules', 'pull up the launch plan doc'] });
  I('vision.write', 'docs', [/^(?:write|edit|update|start|open|show|work on|change)\s+(?:the\s+|our\s+|my\s+)?(?:project\s+)?vision$/, /^(?:what is|whats)\s+(?:the\s+|our\s+)?vision$/], { ex: ['write the vision', 'open our vision'] });
  I('draft.readme', 'docs', [/^(?:write|draft|make|update|create|generate)\s+(?:a\s+|the\s+|our\s+)?(?<kind>readme|launch post|launch announcement|release notes|changelog|meeting notes)$/], { p: 0.96, ex: ['write a readme', 'draft the release notes'] });

  // chat and DMs
  I('chat.send', 'chat', [
    /^(?:post|send|say|announce|share|write|put)\s+(?:a\s+message\s+)?(?:in|to|on)\s+(?:the\s+)?(?:chat|general|channel|group|team chat)\s*(?:that|saying|:)?\s*(?<msg>.+)$/,
    /^(?:tell|announce to|let|message|ping|remind|notify|update)\s+(?<who>everyone|everybody|the team|team|the tribe|all|the group|the chat|y'?all|the channel)\s+(?:know\s+)?(?:that\s+|about\s+|to\s+|:\s*)?(?<msg>.+)$/,
    /^(?:post|announce|say)\s*:?\s+(?<msg>.+?)\s+(?:in|to)\s+(?:the\s+)?(?:chat|general|channel)$/, /^announce\s*:?\s+(?<msg>.+)$/,
  ], { req: { msg: 'What should I post?' }, ex: ['tell everyone the build is up', 'post in the chat: demo at 3', 'announce we ship friday'] });
  I('dm.send', 'chat', [
    /^(?:tell|message|text|dm|ping|notify|let|ask|remind|send|email|write to|msg|update)\s+(?<who>(?:my\s+)?[\p{L}][\p{L}'-]*(?:\s+(?:and|&)\s+[\p{L}][\p{L}'-]*)?)(?:\s+(?:know|a message|a note|a dm))?(?:\s+(?:that|about|to|if|whether|saying|:)\s*|\s*:\s*|\s+)?(?<msg>.*)$/u,
    /^(?:send|write)\s+(?:a\s+)?(?:message|dm|note|text)\s+to\s+(?<who>[\p{L}][\p{L}'-]*)\s*(?:saying|that|:)?\s*(?<msg>.*)$/u,
  ], { p: 0.9, req: { msg: 'What should I tell them?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); if (!p || p.me) return null; if (p.all) return { who: p, msg: s.msg, toChat: true }; return { who: p, msg: s.msg }; }, ex: ['tell maya the build is up', 'message sam about the logo', 'ask maya if she can test tonight'] });
  I('dm.open', 'chat', [/^(?:open|start|begin|show)\s+(?:a\s+|my\s+|the\s+)?(?:dm|chat|conversation|direct message|private chat|thread)\s+with\s+(?<who>.+)$/, /^(?:chat|talk)\s+(?:with|to)\s+(?<who>.+)$/], { req: { who: 'With whom?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); return p && !p.all ? { who: p } : null; }, ex: ['open a dm with maya', 'chat with sam'] });
  I('chat.summarize', 'chat', [/^(?:summarize|summarise|sum up|recap|tldr|tl dr)\s*(?:the\s+)?(?:chat|conversation|messages|today|discussion|channel)?$/, /^what did i miss(?: in (?:the )?chat)?$/], { ex: ['summarize the chat', 'what did i miss'] });

  // calendar
  const EVW = 'meeting|call|demo|standup|stand up|review|sync|event|party|session|huddle|lunch|dinner|interview|1:1|one on one|playtest|play test|launch|workshop|meetup|hangout|stream|livestream|deadline|appointment|kickoff|kick off|retro|retrospective|check in|check-in|jam';
  I('event.add', 'calendar', [
    /^(?:add|put)\s+(?<what>.+?)\s+(?:on|to|in)\s+(?:the\s+|my\s+|our\s+)?calendar(?:\s+.+)?$/,
    new RegExp(`^(?:schedule|book|set up|plan|add|put|create|arrange|organize|organise|set|make|new)\\s+(?:a\\s+|an\\s+|the\\s+|our\\s+)?(?<what>(?:[\\p{L}]+\\s+){0,3}?(?:${EVW})\\b.*)$`, 'u'),
    /^(?:meet|meeting)\s+(?:with\s+)?(?<what>.+)$/, /^(?:calendar|cal)\s*:?\s+(?<what>.+)$/,
  ], { p: 0.92, req: { what: 'What should I put on the calendar?' }, fill: (s, c, ctx, X) => { if (/^(?:open|show|view|see)$/.test(String((X && X.c.what) || s.what).trim())) return null; const cw = cutWhen(s, 'what', ctx, X), w = parseWhen(c, ctx && ctx.now) || cw.w; return { what: (cw.text || s.what).replace(/\s+(?:on|to|in)\s+(?:the\s+|my\s+|our\s+)?calendar$/i, ''), date: w && w.date, time: w && w.time }; }, ex: ['schedule a demo friday at 3pm', 'book a playtest tomorrow', 'add lunch with sam to the calendar'] });
  I('cal.show', 'calendar', [/^(?:what is|whats|what)\s+(?:on\s+)?(?:my\s+|the\s+|our\s+)?(?:calendar|schedule|agenda|plan)(?:\s+(?:for\s+)?(?<when>today|tomorrow|this week|next week|tonight))?$/, /^what (?:do i|do we) have (?:on\s+)?(?<when>today|tomorrow|this week|tonight|next week)$/, /^am i (?:free|busy)(?:\s+(?<when>today|tomorrow|tonight|this week))?$/, /^(?:any|what)\s+(?:meetings|events)(?:\s+(?<when>today|tomorrow|this week))?$/, /^(?:whats|what is) (?:happening|going on) (?<when>today|tomorrow|this week)$/], { fill: (s, c, ctx, X) => ({ when: (X && X.c.when) || 'today' }), ex: ["what's on my calendar today", 'what do i have tomorrow', 'am i free tonight'] });

  // builds (Flint's free recipes, server/flintfree.js)
  const NAMED = '(?:\\s+(?:called|named|titled|for|about)\\s+(?<name>.+?))?(?:\\s+(?:in|with)\\s+(?<style>dark|light|[\\p{L}]+)(?:\\s+(?:mode|theme|colors?))?)?';
  I('build.3d', 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|little\\s+|small\\s+|simple\\s+|cool\\s+)?(?:3d|three js|threejs|first person|third person)\\s+(?:game|world|scene|level|platformer|racer|racing game|shooter|explorer|walking sim)${NAMED}$`, 'u')], { fill: buildFill, ex: ['make a 3d game called orb run', 'build me a three js game'] });
  I('build.2d', 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|little\\s+|small\\s+|simple\\s+|fun\\s+|cool\\s+)?(?:2d game|platformer|pixel game|pixel art game|arcade game|side scroller|jumping game|retro game|game)${NAMED}$`, 'u')], { p: 0.9, fill: buildFill, ex: ['make a platformer', 'build a pixel game called gem dash', 'make a game'] });
  I('build.todo', 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|little\\s+|small\\s+|simple\\s+)?(?:task app|task list app|task list|task tracker|task manager|checklist app|checklist|shopping list app|shopping list|habit tracker|chores app)${NAMED}$`, 'u')], { fill: buildFill, ex: ['build a to do app', 'make a checklist app', 'make a shopping list app'] });
  I('build.video', 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|little\\s+|small\\s+|simple\\s+)?(?:video|clip|movie|film|reel)\\s+(?:editor|editing app|cutter|trimmer|maker)${NAMED}$`, 'u'), /^(?:i want to|help me|lets)?\s*edit (?:my |our )?videos?$/], { fill: buildFill, ex: ['build me a video editor', 'make a clip trimmer'] });
  I('build.landing', 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|simple\\s+|quick\\s+)?(?:landing page|one pager|single page site|splash page)${NAMED}$`, 'u')], { fill: buildFill, ex: ['make a landing page for sunrise bakery', 'build a one pager for gem dash'] });
  const SITES = [
    ['linkbio', 'link in bio|linkinbio|link tree|linktree|links page|bio link|link page|all my links page', 'link in bio page'], ['merch', 'merch store|merch shop|merch site|merch|shop|store|online store|online shop|ecommerce site|e commerce site|webshop|storefront', 'merch shop'],
    ['cafe', 'restaurant site|restaurant website|cafe site|cafe website|cafe page|coffee shop site|bakery site|bakery website|restaurant page|menu site|food truck site|diner site', 'cafe menu'], ['band', 'band site|band page|band website|musician site|music site|tour page|artist page|dj page', 'band page'],
    ['podcast', 'podcast site|podcast page|podcast website|show page', 'podcast page'], ['wedding', 'wedding site|wedding page|wedding website|rsvp page|rsvp site|event page|party page|save the date page|birthday page', 'wedding rsvp page'],
    ['blog', 'blog|newsletter site|newsletter page|devlog|journal site|writing site', 'blog'], ['portfolio', 'portfolio|portfolio site|portfolio website|design portfolio|case study site', 'portfolio'],
    ['photography', 'photography site|photo gallery|photo site|gallery site|photographer site|photography portfolio', 'photo gallery'], ['resume', 'resume site|resume page|cv site|cv page|resume|about me page|personal site|personal website', 'resume page'],
    ['creator', 'creator page|creator site|streamer page|streamer site|twitch page|youtuber site|youtube page|content creator page', 'streamer page'], ['gamepage', 'game page|press kit|steam page|wishlist page|game site|game website', 'game press kit'],
    ['nonprofit', 'nonprofit site|non profit site|nonprofit page|charity site|charity page|donation page|donate page|fundraiser page|fundraising site|community group site', 'nonprofit donations page'], ['service', 'salon site|barber site|plumber site|plumbing site|cleaning business site|local business site|handyman site|service business site|small business site|booking page|business site', 'handyman page'],
    ['comingsoon', 'coming soon page|waitlist page|waitlist|wait list page|prelaunch page|pre launch page|launch page|teaser page', 'waitlist page'], ['saas', 'saas site|saas page|startup site|startup page|product page|app page|software site|product site|app website', 'startup product page'],
    // feat/design-flow: the app and game starters (app/ui/starters, docs/STARTERS.md); app/ui/flintlocal.js opens them in the Design flow
    ['starter-breakout', 'breakout game|breakout|brick breaker|brick breaker game|arkanoid|arkanoid clone|paddle and ball game|paddle game', 'breakout game'], ['starter-snake', 'snake game|snake|snake clone|nokia snake', 'snake game'],
    ['starter-blocks', 'tetris game|tetris|tetris clone|falling blocks game|block puzzle game|block puzzle|tetromino game', 'falling blocks puzzle'], ['starter-runner', 'endless runner|endless runner game|runner game|infinite runner|dino game|dinosaur game|chrome dino game', 'endless runner'],
    ['starter-topdown', 'top down game|top down shooter|topdown shooter|twin stick shooter|arena shooter|survivor game|survivors game|dungeon crawler|top down rpg', 'top-down arena'], ['starter-memory', 'card game|memory game|memory card game|matching game|matching pairs game|concentration game', 'memory card game'],
    ['starter-notes', 'notes app|note taking app|note app|notepad app|notepad|markdown notes app', 'notes app'], ['starter-kanban', 'kanban board|kanban app|kanban|trello clone|task board app', 'kanban board'],
    ['starter-dashboard', 'dashboard app|admin dashboard|analytics dashboard|stats dashboard|admin panel', 'dashboard'], ['starter-chat', 'chat app|chat ui|messaging app|messenger app|messenger clone', 'chat app'],
    ['starter-survey', 'survey|survey app|survey form|feedback form|questionnaire|form app|signup form app', 'survey form'], ['starter-pomodoro', 'pomodoro timer|pomodoro app|pomodoro|focus timer|timer app|countdown timer', 'pomodoro timer'],
    ['starter-calculator', 'calculator|calculator app|tip calculator|calc app', 'calculator'], ['starter-weather', 'weather app|forecast app|weather dashboard|weather widget', 'weather app'], ['starter-sketch', 'drawing app|paint app|sketch app|doodle app|sketchpad|sketch pad', 'sketch pad'],
  ];
  for (const [k, w, phrase] of SITES) I('site.' + k, 'build', [new RegExp(`^${V_MAKE}\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|simple\\s+|quick\\s+|nice\\s+|little\\s+|small\\s+|cool\\s+)?(?:${w})${NAMED}$`, 'u')], { p: k === 'merch' ? 0.9 : 0.94, fill: buildFill, label: phrase, ex: [`make a ${w.split('|')[0]}`, `build me a ${w.split('|')[1] || w.split('|')[0]} for ember`] });
  I('site.gallery', 'build', [/^(?:show|open|browse|see|list)\s+(?:me\s+)?(?:the\s+|all\s+|your\s+)?(?:website\s+|site\s+)?templates$/, /^(?:what|which)\s+(?:website\s+|site\s+)?templates(?:\s+(?:do you have|are there))?$/, /^(?:pick|choose)\s+a\s+(?:website\s+|site\s+)?template$/], { ex: ['show me the website templates', 'which templates are there'] });

  // the design canvas (app/ui/canvas/flint.js does the work)
  const SCREENS = [['login', 'login|log in|sign in|signin|sign up|signup|auth|register|registration'], ['onboarding', 'onboarding|welcome|intro|walkthrough'], ['home', 'home|home feed|app home|main'], ['feed', 'feed|timeline|social feed|news feed'], ['product', 'product|product card|product detail|item detail'], ['pricing', 'pricing|plans|price table|pricing table'],
    ['settings', 'settings|preferences|account settings'], ['profile', 'profile|user profile|account'], ['checkout', 'checkout|cart|payment|basket'], ['hero', 'landing hero|hero|hero section|header section|landing'], ['dashboard', 'dashboard|analytics|stats|admin'], ['chat', 'chat|messages|messaging|inbox'], ['empty', 'empty state|empty|no results|404|error']];
  for (const [k, w] of SCREENS) I('canvas.' + k, 'canvas', [new RegExp(`^(?:an?\\s+)(?:new\\s+|simple\\s+|clean\\s+|mobile\\s+|phone\\s+|desktop\\s+)*(?:${w})\\s+(?:screen|section|frame|mockup)$`, 'u'), new RegExp(`^(?:make|design|draw|create|mock up|mockup|sketch|wireframe|lay out|layout|give me|build|add|do)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|simple\\s+|clean\\s+|mobile\\s+|phone\\s+|desktop\\s+|dark\\s+|light\\s+)*(?:${w})\\s+(?:screen|page|view|ui|mockup|mock up|design|frame|wireframe|section|card|layout)(?:\\s+(?:for|called|named)\\s+(?<name>.+?))?(?:\\s+(?:in|with)\\s+(?<style>dark|light|[\\p{L}]+)(?:\\s+(?:mode|theme))?)?$`, 'u')],
    { p: 0.95, fill: buildFill, ex: [`make a ${w.split('|')[0]} screen`, `design a ${w.split('|')[0]} page for ember`] });
  I('canvas.tidy', 'canvas', [/^(?:tidy|tidy up|clean up|cleanup|organize|organise|align|neaten|straighten|space out|even out|fix the spacing of|make tidy)\s*(?:it|this|that|the layers|the frame|the selection|this frame|everything|up|the layout|spacing)?(?:\s+up)?$/, /^(?:auto layout|use auto layout|turn (?:this|it) into auto layout|add auto layout)(?:\s+(?:to\s+)?(?:it|this))?$/], { ex: ['tidy up', 'clean up this frame', 'add auto layout'] });
  I('canvas.rename', 'canvas', [/^(?:rename|name|label|fix the names of)\s+(?:the\s+|all\s+|my\s+|these\s+)?layers$/, /^(?:give (?:the )?layers (?:good |better |real )?names|clean up (?:the )?layer names)$/], { ex: ['rename layers', 'give the layers better names'] });
  I('canvas.dark', 'canvas', [/^(?:make|create|give me|do|add)\s+(?:a\s+)?(?<mode>dark|light)\s+(?:mode\s+)?(?:version|variant|copy)(?:\s+of\s+(?:this|it|the frame|this frame|that))?$/, /^(?:dark|light)\s+(?:mode\s+)?version$/], { fill: (s, c) => ({ mode: /light/.test(c) ? 'light' : 'dark' }), ex: ['make a dark mode version of this frame', 'light version'] });
  I('canvas.variants', 'canvas', [/^(?:make|create|add|give me|generate)\s+(?:some\s+|a few\s+)?(?:variants|variations|versions|states|alternatives)(?:\s+of\s+(?:this|it|the button|this button|that))?$/], { ex: ['make variants', 'create some variations of this'] });
  I('canvas.send', 'canvas', [/^(?:send|push|put|turn|export|convert|ship)\s+(?:this|it|the frame|this frame|that|the design)\s+(?:to|into)\s+(?:the\s+)?(?:app|code|html|the site|website|project)$/, /^(?:send to app|make it real|code this|turn this into code)$/], { ex: ['send this frame to the app', 'turn this into code'] });
  I('canvas.export', 'canvas', [/^(?:export|download|save)\s+(?:this|it|the frame|this frame|the selection|the design)?\s*(?:as|to)\s+(?:an?\s+)?(?<fmt>png|svg|image|picture|jpg)(?:\s+(?<x>2x|at 2x|retina))?$/, /^(?:export|download)\s+(?:a\s+)?(?<fmt>png|svg)$/], { fill: (s, c) => ({ fmt: /svg/.test(c) ? 'svg' : 'png', scale: /2x|retina/.test(c) ? 2 : 1 }), ex: ['export this frame as png', 'download as svg'] });

  // preview and publishing
  I('preview.reload', 'preview', [/^(?:reload|refresh|rerun|restart)\s+(?:the\s+)?(?:preview|app|page|game|site)$/, /^(?:reload|refresh)$/], { ex: ['reload the preview', 'refresh the app'] });
  I('preview.device', 'preview', [/^(?:show|view|preview|see|switch to|make it|open)\s+(?:it\s+|the\s+app\s+|the\s+site\s+|the\s+preview\s+)?(?:on|in|as)?\s*(?:an?\s+|the\s+)?(?<dev>phone|mobile|iphone|android|tablet|ipad|desktop|laptop|computer)(?:\s+(?:size|view|mode|width|layout))?$/, /^(?<dev>phone|mobile|tablet|desktop)\s+(?:view|preview|size|mode)$/, /^(?:how does it look on|what does it look like on)\s+(?:a\s+)?(?<dev>phone|mobile|tablet|desktop)$/], { fill: (s, c, ctx, X) => { const d = String((X && X.c.dev) || s.dev || ''); return { dev: /phone|mobile|iphone|android/.test(d) ? 'phone' : /tablet|ipad/.test(d) ? 'tablet' : 'desktop' }; }, ex: ['show it on a phone', 'tablet view', 'how does it look on mobile'] });
  I('preview.edit', 'preview', [/^(?:turn on|start|enter|enable|use)\s+(?:the\s+)?(?:edit mode|picker|element picker|edit)$/, /^(?:let me|i want to)\s+(?:pick|click|select|edit)\s+(?:an?\s+)?(?:element|thing|something)(?:\s+on the page)?$/, /^(?:edit|pick)\s+(?:an\s+)?element$/], { ex: ['turn on edit mode', 'let me pick an element'] });
  I('comment.mode', 'preview', [/^(?:leave|add|drop|place|make)\s+(?:a\s+)?(?:comment|pin|comment pin)(?:\s+(?:on|here)(?:\s+(?:the\s+)?(?:page|preview|design))?)?$/, /^(?:comment mode|turn on comments|start commenting)$/], { ex: ['leave a comment', 'comment mode'] });
  I('publish', 'preview', [/^(?:publish|ship|deploy|go live|launch|release|push live|put)\s*(?:it|this|the (?:app|game|site|project|website)|our (?:app|game|site|project|website)|it live|it online|it on the web|online|live)?$/, /^(?:make|get|share|create)\s+(?:a\s+)?play link$/, /^(?:make it|put it|get it)\s+(?:live|online|public)$/], { p: 0.9, ex: ['publish it', 'ship the game', 'make a play link', 'go live'] });
  I('edit.picked', 'preview', [/^(?:make|turn|change|set|paint|color|colour)\s+(?:it|this|that|the (?:title|heading|button|text|header|link|logo|image|section|background|font))\s+(?<prop>.+)$/, /^(?:make|turn)\s+(?:it|this|that)\s+(?:a\s+)?(?:bit\s+|little\s+|lot\s+)?(?<prop>bigger|smaller|bolder|lighter|wider|narrower|taller|shorter|rounder|darker|brighter|centered|bold|italic|hidden|uppercase)$/,
    /^(?:bigger|smaller|bold|italic|center it|center|left align|right align|underline|hide it|delete it|round the corners|more padding|less padding|more space|less space)$/, /^(?:change|replace)\s+(?:the\s+)?(?:text|words|label|copy|title|heading)\s+(?:to|with)\s+(?<prop>.+)$/],
    { p: 0.9, ctx: c => c && (c.picked || (c.selection && c.view === 'canvas')), ex: ['make it bigger', 'make the title blue', 'change the text to order now'] });

  // look and language
  for (const [k, id] of [['campfire', 'campfire'], ['tribecode dark', 'dark'], ['light', 'light'], ['midnight', 'midnight'], ['nordic', 'nordic'], ['nightshade', 'nightshade'], ['solar dark', 'solar-dark'], ['solar light', 'solar-light'], ['high contrast', 'contrast'], ['dark', 'dark-mode']]) {
    I('theme.' + id, 'look', [new RegExp(`^(?:switch|change|set|use|go|put|turn on|enable|try|apply|give me|i want|make it|make the app|make everything)\\s*(?:to\\s+|the\\s+|on\\s+)*(?:theme\\s+(?:to\\s+)?|app\\s+(?:to\\s+)?)?(?:the\\s+)?(?:${k}${id === 'dark-mode' ? '|night|darker' : id === 'light' ? '|day|lighter|bright' : id === 'nightshade' ? '|dracula' : id === 'nordic' ? '|nord' : ''})(?:\\s+(?:mode|theme|colors?))?$`), new RegExp(`^(?:the\\s+)?(?:${k}${id === 'dark-mode' ? '|night' : ''})\\s+(?:mode|theme)(?:\\s+please)?$`), ...(id === 'light' ? [/^(?:turn off|disable|no more|exit|leave)\s+dark\s*mode$/, /^too dark$/] : id === 'dark-mode' ? [/^(?:turn off|disable|exit|leave)\s+light\s*mode$/, /^(?:too bright|my eyes hurt)$/] : [])],
      { p: 0.95, ex: [`switch to ${k} theme`, `${k} mode`] });
  }
  I('theme.system', 'look', [/^(?:match|follow|use|sync with)\s+(?:my\s+|the\s+)?(?:system|os|device|computer)(?:\s+(?:theme|mode|setting|light and dark|appearance))?$/, /^(?:auto|automatic|system)\s+(?:theme|mode|dark mode)$/], { ex: ['match my system theme', 'auto theme'] });
  I('accent.set', 'look', [/^(?:change|set|make|switch|use|turn)\s+(?:the\s+|my\s+)?(?:(?:accent|highlight)(?:\s+colou?r)?|(?:brand|main|primary|theme|button)\s+colou?r)(?:\s+(?:to|into))?\s+(?<color>.+)$/, /^(?<color>[\p{L}#0-9]+)\s+accent(?:\s+colou?r)?$/u, /^(?:make|turn)\s+(?:the\s+)?(?:app|everything|tribecode|buttons|accents?)\s+(?<color>[\p{L}#0-9]+)$/u, /^(?:accent|accent colou?r)\s*:?\s*(?<color>.+)$/], { req: { color: 'Which color?' }, fill: (s, c, ctx, X) => { const k = colorOf(s.color) || colorOf(X && X.c.color); return k ? { color: k } : null; }, ex: ['change the accent color to teal', 'make the app purple', 'teal accent'] });
  I('textsize.set', 'look', [/^(?:make\s+)?(?:the\s+)?(?:text|font|letters|words|everything|type|font size|text size)(?:\s+size)?\s+(?:a\s+(?:bit|little|lot)\s+)?(?<size>bigger|larger|smaller|tiny|small|default|normal|regular|huge|large|largest|biggest|smallest|medium)$/, /^(?<size>bigger|larger|smaller|small|large|huge|tiny|default|normal)\s+(?:text|font|letters|font size|text size)$/, /^(?:zoom|zoom the text)\s+(?<size>in|out)$/, /^(?:i cant read this|cant read|too small to read|text is too small)$/, /^(?:text is too (?<size2>big|large))$/], { fill: (s, c, ctx, X) => { const z = (X && X.c.size) || s.size || (s.size2 ? 'smaller' : c.includes('cant read') || c.includes('too small') ? 'bigger' : ''); return { size: /bigger|larger|huge|large|biggest|largest|^in$/.test(z) ? (/huge|biggest|largest/.test(z) ? 'xl' : 'l') : /smaller|small|tiny|smallest|^out$/.test(z) ? 's' : '' }; }, ex: ['make the text bigger', 'bigger font', 'text is too small'] });
  I('lang.set', 'look', [new RegExp(`^(?:switch|change|set|put|use)\\s+(?:the\\s+)?(?:app\\s+|language\\s+|ui\\s+|interface\\s+)?(?:language\\s+)?(?:to|in)\\s+(?<lang>${Object.keys(LANGS).join('|')})$`), new RegExp(`^(?:speak|talk to me in|reply in|use|i speak|in)\\s+(?<lang>${Object.keys(LANGS).join('|')})(?:\\s+please)?$`), new RegExp(`^(?<lang>${Object.keys(LANGS).join('|')})(?:\\s+(?:please|language|mode))?$`)], { fill: (s, c, ctx, X) => { const v = LANGS[String((X && X.c.lang) || s.lang).toLowerCase()]; return v ? { lang: v } : null; }, ex: ['switch the language to spanish', 'speak french', 'german please'] });
  I('personalize.open', 'look', [/^(?:personalize|personalise|customise|make it mine|make it yours)(?:\s+(?:it|the app|tribecode|my app))?$/, /^(?:change|update|edit|set|pick|choose)\s+(?:my\s+)?(?:avatar|profile picture|profile pic|profile icon|picture|photo|icon|display name|profile)$/], { ex: ['change my avatar', 'personalize the app'] });

  // the tribe, hosting, helpers
  I('invite', 'team', [/^(?:invite|add)\s+(?:a\s+|my\s+|some\s+)?(?:friend|friends|people|someone|teammate|teammates|person|collaborator|member|members)(?:\s+.*)?$/, /^(?:share|send|get|copy|make|give me)\s+(?:the\s+|an?\s+|our\s+)?(?:invite|invite link|join link|link to join|tribe link)(?:\s+.*)?$/, /^invite\s+(?<who>[\p{L}][\p{L}'-]*)(?:\s+.*)?$/u, /^how do (?:i|we) (?:invite|add) (?:a\s+)?(?:friend|people|someone)s?$/], { ex: ['invite a friend', 'share the invite link', 'invite maya'] });
  I('host.start', 'team', [/^(?:start|begin|turn on)\s+(?:the\s+)?host(?:ing)?(?:\s+(?:here|on this computer))?$/, /^host(?:\s+(?:here|a tribe|on this computer|it))?$/, /^(?:host|run)\s+(?:the\s+)?(?:server|tribe)(?:\s+here)?$/], { ex: ['start hosting', 'host here'] });
  I('host.stop', 'team', [/^(?:stop|end|turn off|quit|shut down)\s+(?:the\s+)?(?:host|hosting|server|tribe server)$/], { ex: ['stop hosting'] });
  I('connect.ai', 'team', [/^(?:connect|hook up|link|set up|setup|add|plug in|install|bring in|attach)\s+(?:my\s+|an?\s+|the\s+)?(?:claude|claude code|codex|gemini|gemini cli|cursor|ai|agent|ai helper|coding agent|mcp|copilot|windsurf|aider)(?:\s+.*)?$/, /^(?:claude code|claude)$/], { ex: ['connect my ai', 'hook up claude code', 'add codex'] });
  I('brain.pick', 'team', [/^(?:give (?:flint|you) a brain|pick (?:flints |your |a )?(?:brain|model)|choose (?:flints |your |a )?(?:brain|model)|change (?:your |flints |the )?(?:brain|model)|use (?:a |the )?(?:local model|built in model|qwen|ollama|llama|gemini model|cloud model)|switch (?:the )?model|which model do you use)$/], { ex: ['give flint a brain', 'use the local model'] });
  I('helper.toggle', 'team', [/^(?:turn|switch)\s+(?<on>on|off)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)$/, /^(?:turn|switch)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)\s+(?<on>on|off)$/, /^(?<on>start|stop|enable|disable|pause|resume)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)$/, /^(?<what>secretary|autopilot)\s+(?<on>on|off)$/], { fill: (s, c, ctx, X) => ({ what: /secretary/.test(c) ? 'secretary' : 'autopilot', on: /^(on|start|enable|resume)$/.test(String((X && X.c.on) || s.on)) }), ex: ['turn on the secretary', 'autopilot off'] });
  I('jam.start', 'team', [/^(?:start|begin|kick off|run|do|launch|open|lets do)\s+(?:a\s+|the\s+|our\s+)?(?:game\s+)?jam(?:\s+session)?(?:\s+for\s+(?<mins>\d+)\s*(?:min|mins|minutes|hours?|h))?$/, /^jam\s+(?:time|now)$/], { ex: ['start a jam', 'kick off a jam for 60 minutes'] });
  I('huddle.start', 'team', [/^(?:start|join|open|begin|hop on|jump on|get on)\s+(?:a\s+|the\s+)?(?:huddle|voice chat|voice call|call|voice|audio call|voice room)$/, /^(?:huddle|lets talk|voice chat)$/], { ex: ['start a huddle', 'join the voice chat'] });
  I('huddle.leave', 'team', [/^(?:leave|end|hang up|exit|quit)\s+(?:the\s+)?(?:huddle|call|voice chat|voice call)$/, /^hang up$/], { ex: ['leave the huddle', 'hang up'] });
  I('capture.toggle', 'team', [/^(?:record|capture|transcribe|start recording|start transcribing|take notes of)\s+(?:the\s+|this\s+|our\s+)?(?:meeting|call|huddle|conversation|notes|voice)(?:\s+notes)?$/, /^(?:stop recording|stop transcribing|stop capturing)$/], { ex: ['record meeting notes', 'stop recording'] });
  I('feedback', 'team', [/^(?:rate|review)\s+(?:tribecode|the app|this app)$/, /^(?:give|send|leave)\s+(?:some\s+)?feedback$/, /^(?:report|file)\s+(?:a\s+)?bug(?:\s+report)?$/], { ex: ['give feedback', 'rate tribecode', 'report a bug'] });
  I('tour', 'team', [/^(?:show me around|give me a tour|take the tour|tour|walk me through (?:the app|tribecode)|how does (?:this|tribecode|the app) work|where do i start|i am new|im new|new here)$/], { ex: ['show me around', 'give me a tour', 'im new'] });
  I('prompt.copy', 'team', [/^(?:copy|give me|write|make)\s+(?:a\s+)?prompt(?:\s+for\s+(?:my\s+)?(?:ai|agent|claude|helper))?$/], { ex: ['copy a prompt for my ai'] });

  // finding things, the marketplace, studios, assets
  I('market.search', 'market', [/^(?:find|search|look for|get|i need|recommend|suggest|show me)\s+(?:me\s+)?(?:an?\s+|some\s+|the\s+|good\s+|best\s+)*(?<q>.+?)\s+(?:library|libraries|repo|repos|package|packages|component library|components|kit|plugin|plugins|framework|starter|template repo)(?:\s+for\s+(?<for>.+))?$/, /^(?:search|look)\s+(?:the\s+)?(?:market|marketplace)\s+for\s+(?<q>.+)$/], { p: 0.88, ex: ['find a ui library', 'recommend a physics library for 3d', 'search the marketplace for icons'] });
  I('trending', 'market', [/^(?:what is|whats|show me|show|what are)\s+(?:the\s+)?(?:trending|hot|new and trending|popular)(?:\s+(?:on github|repos|repositories|tools|projects))?(?:\s+(?:today|this week))?$/, /^(?:trending|hot)\s+(?:repos|repositories|tools)$/, /^any new (?:repos|tools|libraries)$/], { ex: ['whats trending', 'show trending repos'] });
  I('studio.open', 'market', [/^(?:open|launch|get|download|install|use)\s+(?:the\s+)?(?<app>artcraft|blender|krita|gimp|inkscape|audacity|godot|aseprite|libresprite|obs|kdenlive|shotcut|musescore|lmms|tiled|pixelorama|darktable|davinci|figma)(?:\s+(?:app|studio|tool))?$/], { ex: ['open blender', 'download krita'] });
  I('asset.add', 'market', [/^(?:add|get|find|grab|give me|i need|we need|put in|drop in|pick)\s+(?:me\s+|us\s+)?(?:an?\s+|some\s+|the\s+)?(?<what>.*?)\b(?<kind>sound effect|sound|sfx|3d model|model|sprite|pixel art|icon|font|texture|hdri|animation)s?\b(?<rest>.*)$/], { p: 0.9, ex: ['add a jump sound', 'get me a coin sprite', 'find a heart icon'] });
  I('find', 'search', [/^(?:find|search for|search|look for|look up|where did we put|wheres|where is)\s+(?<q>.+)$/], { p: 0.7, ex: ['find the logo', 'search for boss notes'] });

  // what's going on, help, local smarts
  I('status', 'room', [/^(?:what is|whats)\s+(?:new|up|happening|going on)(?:\s+(?:here|today|in the project|with the project))?$/, /^(?:status|catch me up|any news|news|update me|give me an update|project status|room status|how are we doing|where are we|how is it going|whats the status)$/, /^(?:who is|whos)\s+(?:online|here|around|on)$/, /^(?:is anyone|anybody)\s+(?:online|here|around)$/], { ex: ['whats new', 'catch me up', 'whos online'] });
  I('focus', 'room', [/^(?:what should i (?:do|work on)(?: next| now| today)?|what is next|whats next|what is my next task|whats my next task|my next task|what am i (?:doing|working on)|where was i|next steps?|what now)$/], { ex: ['what should i do next', 'where was i'] });
  I('tiers', 'room', [/^(?:what can you do(?: for free)?|what is free|whats free|what do you do for free|what can you build(?: for free)?|your tiers|are you free|what can flint do|what do you know how to do|help me understand what you do|what are you able to do)$/], { ex: ['what can you do', 'what is free'] });
  I('hello', 'room', [/^(?:hi|hey|hello|yo|hiya|howdy|greetings|good (?:morning|afternoon|evening)|morning|evening|hey there|hi there|whats up)$/, /^(?:thanks|thank you|thanks a lot|cheers|nice|great|awesome|cool|perfect|love it|good job|well done|ok|got it)$/], { p: 0.9, fill: (s, c) => ({ thanks: /thank|cheers|nice|great|awesome|cool|perfect|love|job|done|ok|got/.test(c) }), ex: ['hi', 'thanks'] });
  I('calc', 'local', [/^(?:what is|whats|calculate|calc|compute|how much is|solve|eval)?\s*(?<expr>[-+*/x×÷().^%\d\s]+?)\s*(?:=|equals)?\s*$/, /^(?:what is|whats|calculate)?\s*(?<pct>\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(?<of>\d+(?:\.\d+)?)$/, /^(?:split|divide)\s+(?<total>\d+(?:\.\d+)?)\s+(?:between|among|by|into)\s+(?<n>\d+|two|three|four|five|six)(?:\s+(?:people|ways|of us))?$/, /^(?:tip|whats the tip|what is the tip)(?:\s+(?:on|for))?\s+(?<bill>\d+(?:\.\d+)?)(?:\s+at\s+(?<rate>\d+)\s*%?)?$/],
    { fill: (s, c) => calcFill(s), ex: ['what is 12 * 7', '15% of 80', 'split 120 between 4 people'] });
  I('convert', 'local', [/^(?:convert|how many|what is|whats)?\s*(?<n>-?\d+(?:\.\d+)?)\s*(?<from>km|kilometers?|mi|miles?|m|meters?|ft|feet|foot|in|inches?|cm|centimeters?|kg|kilos?|kilograms?|lbs?|pounds?|c|celsius|f|fahrenheit|l|liters?|litres?|gal|gallons?|oz|ounces?|g|grams?)\s+(?:to|in|into|as)\s+(?<to>km|kilometers?|mi|miles?|m|meters?|ft|feet|in|inches?|cm|centimeters?|kg|kilos?|kilograms?|lbs?|pounds?|c|celsius|f|fahrenheit|l|liters?|litres?|gal|gallons?|oz|ounces?|g|grams?)$/], { fill: (s, c, ctx, X) => convertFill(s, X), ex: ['convert 5 km to miles', '100 f in c'] });
  I('time.now', 'local', [/^(?:what time is it|whats the time|what is the time|time|current time|what day is it|what day is today|whats today|what is today|whats the date|what is the date|todays date|what is todays date|date)(?:\s+(?:today|now))?$/], { ex: ['what time is it', 'whats the date'] });
  I('date.calc', 'local', [/^(?:what|which)\s+(?:date|day)\s+is\s+(?<when>.+)$/, /^(?:how many days|how long)\s+(?:until|till|to|before)\s+(?<when>.+)$/, /^when is\s+(?<when>next \w+|this \w+)$/], { req: { when: 'Which day?' }, fill: (s, c, ctx, X) => { const w = parseWhen(String((X && X.c.when) || s.when || '').toLowerCase(), ctx && ctx.now); return w ? { when: w, until: /how many|how long/.test(c) } : null; }, ex: ['what date is next friday', 'how many days until friday'] });
  I('random', 'local', [/^(?:flip|toss)\s+(?:a\s+)?coin$/, /^(?:roll|throw)\s+(?:a\s+|the\s+|two\s+)?(?:die|dice|d(?<sides>\d+))$/, /^(?:pick|choose|give me)\s+(?:a\s+)?(?:random\s+)?number\s+(?:between|from)\s+(?<a>\d+)\s+(?:and|to)\s+(?<b>\d+)$/, /^(?:pick|choose)\s+(?:someone|a person|somebody|a random person|a winner)(?:\s+.*)?$/, /^who\s+(?:should|goes|has to|gets to|will)\s+.+$/, /^(?:heads or tails|yes or no|should i)\b.*$/], { p: 0.9, fill: (s, c) => { const n = v => parseInt(String(v || '').replace(/\D+/g, ''), 10); return { kind: /coin|heads/.test(c) ? 'coin' : /die|dice|^roll/.test(c) ? 'dice' : /number/.test(c) ? 'number' : /^who|someone|person|somebody|winner/.test(c) ? 'person' : 'yesno', sides: n(s.sides) || 6, a: n(s.a), b: n(s.b) }; }, ex: ['flip a coin', 'roll a d20', 'pick a number between 1 and 10', 'who should do the dishes'] });
  I('undo', 'local', [/^(?:(?:oops|whoops|nope)\s+(?:go back|undo|undo that)|undo|undo that|undo it|take that back|take it back|revert|revert that|reverse that|cancel that|never mind|nevermind|nvm|oops|whoops|my bad|scratch that|forget that|go back)$/], { p: 0.97, ex: ['undo', 'take that back', 'oops'] });
  I('teach', 'local', [/^(?:teach flint|learn this|flint learn|remember this)?\s*:?\s*(?:when|whenever|if)\s+i\s+say\s+(?<say>.+?)\s+(?<means>(?:open|show|add|make|start|switch|tell|go|publish|build|create|schedule|turn|set|mark|play|run|post|invite|send|take)\b.+)$/, /^(?:teach flint|learn this|flint learn|remember this)?\s*:?\s*(?:when|whenever|if)\s+i\s+say\s+(?<say>.+?)\s*,?\s*(?:you should\s+|please\s+|then\s+)?(?:do|run|mean|means|it means|i mean|open|you do|that means|do this)\s*:?\s+(?<means>.+)$/, /^(?<say>.+?)\s+means\s+(?<means>.+)$/], { p: 0.97, ex: ['when i say ship it, do publish it', 'teach flint: when i say standup, open the calendar'] });
  I('meant', 'local', [/^(?:no\s*,?\s*)?i\s+meant\s+(?<means>.+)$/, /^(?:no\s*,?\s*)?(?:i mean|what i meant was|i was asking you to)\s+(?<means>.+)$/], { p: 0.97, ex: ['no i meant open the calendar'] });
  I('unteach', 'local', [/^(?:forget|unlearn|stop doing)\s+(?:the\s+)?(?:shortcut|phrase|command)?\s*(?<say>.+?)$/], { p: 0.6, ex: ['forget the shortcut ship it'] });
  I('taught', 'local', [/^(?:what have i taught you|my shortcuts|my phrases|list my shortcuts|what do you know from me|show what i taught you)$/], { ex: ['what have i taught you'] });
  I('help.kb', 'help', [/^(?:how|why|where|when|what|which|who|can i|could i|is|are|should|would|will|was|were|has|have|do i|does|do you|do we|explain|help|tell me about|how do i|how to|whats the difference|what is the difference|can you explain|i dont understand|what does)\b.+$/], { p: 0.66, ex: ['how do i invite a friend', 'how does publishing work', 'what is the secretary'] });

  I('redo', 'local', [/^(?:redo|redo that|redo it|put it back|bring it back|undo the undo|undo undo)$/], { p: 0.97, ex: ['redo', 'put it back'] });
  I('premium.open', 'team', [/^(?:buy|get|purchase|top up|add|need)\s+(?:some\s+|more\s+)?(?:ai\s+)?credits$/, /^(?:get|go|buy|try|upgrade to|start|see)\s+(?:tribecode\s+)?premium$/, /^(?:upgrade|subscribe|go pro|get a subscription|premium plans|see plans)$/], { ex: ['buy credits', 'get premium', 'upgrade'] });
  I('connect.ai', 'team', [/^use (?:my own|my) (?:ai|claude|model|key|api key|llm)$/, /^(?:bring|plug in) my own (?:ai|key|model)$/], { ex: ['use my own ai'] });

  // ---------- websites and the design canvas: meaning, not just commands (feat/flint-site) ----------
  // design(c, raw, ctx) reads what people mean about a site or a design: wire buttons, pages, images, dark mode, blocks,
  // layouts, words, export; a template from what the site is FOR ("something for my band"); a lesson ("teach me tasks").
  // ctx.view 'site' (the website designer, or the preview in Website mode with ctx.site) or 'canvas' picks the intent
  // family (site.* or canvas.*). Everywhere else only templates, "open the designer" and lessons are read here.
  const TPL_TAGS = {
    linkbio: ['link in bio', 'linkinbio', 'link tree', 'linktree', 'bio link', 'bio links', 'links page', 'link page', 'all my links', 'one link', 'instagram bio', 'insta bio', 'tiktok bio', 'my links', 'link for my instagram', 'for my insta', 'for my tiktok', 'link pages', 'links pages', 'link page for my bio', 'my bio', 'link hub', 'social links'],
    band: ['band', 'jazz', 'trio', 'quartet', 'choir', 'orchestra', 'rock band', 'punk', 'hip hop', 'producer', 'my music', 'our music', 'my songs', 'musician', 'dj gigs', 'dj', 'gigs', 'tour dates', 'my album', 'singer', 'rapper', 'concerts'],
    cafe: ['sourdough', 'bar', 'pub', 'tacos', 'ramen', 'catering', 'bakery', 'cafe', 'coffee shop', 'coffee', 'restaurant', 'food truck', 'diner', 'pizza place', 'pizza', 'bistro', 'brunch', 'menu page', 'with the menu'],
    merch: ['zines', 'stickers', 'handmade', 'jewelry', 'ceramics', 'sell my', 'sell our', 'merch', 'online store', 'online shop', 'shop page', 'store', 'sell', 'ecommerce', 'e commerce', 'webshop', 'storefront', 't shirts', 'candles'],
    portfolio: ['portfolio', 'design work', 'case studies', 'case study', 'show off my', 'my work'],
    creator: ['twitch', 'stream on', 'streamer', 'streaming', 'youtuber', 'youtube channel', 'creator'],
    service: ['yoga', 'pilates', 'fitness', 'personal trainer', 'gym', 'tutor', 'tutoring', 'classes', 'coaching', 'coach', 'therapist', 'massage', 'dentist', 'dog walking', 'dog grooming', 'nail', 'tattoo', 'consulting', 'lawyer', 'accountant', 'bookings', 'plumbing', 'plumber', 'hair salon', 'salon', 'barber', 'cleaning company', 'cleaning', 'handyman', 'local business', 'small business', 'electrician', 'landscaping', 'repair shop'],
    wedding: ['engaged', 'guests', 'reception', 'baby shower', 'anniversary', 'reunion', 'wedding', 'married', 'rsvp', 'save the date', 'birthday', 'party invite', 'engagement'],
    podcast: ['radio show', 'audio show', 'podcast', 'episodes', 'our show', 'my show'],
    blog: ['blog', 'newsletter', 'devlog', 'travel stories', 'my writing'],
    saas: ['mobile app', 'our product', 'my product', 'b2b', 'startup', 'saas', 'for my app', 'for our app', 'software', 'product site'],
    gamepage: ['steam page', 'indie game', 'press kit', 'my game', 'our game', 'game page', 'wishlist'],
    resume: ['resume', 'cv', 'personal website', 'personal site', 'about me page'],
    nonprofit: ['charity', 'nonprofit', 'non profit', 'donation', 'donate', 'fundraiser', 'fundraising', 'animal shelter', 'volunteers'],
    photography: ['photography portfolio', 'photographer', 'photography', 'photo gallery', 'photo site'],
    comingsoon: ['coming soon', 'waitlist', 'wait list', 'launching soon', 'teaser page', 'prelaunch', 'pre launch', 'collect emails'],
  };
  const BLOCK_W = [
    ['testimonials', 'testimonials?|reviews?|quotes|what (?:people|customers|clients) say|social proof|kind words'],
    ['pricing', 'pricing|prices|price list|price table|plans|tiers'],
    ['faq', 'faqs?|questions and answers|q and a|common questions|questions'],
    ['contact', 'contact form|contact|sign ?up form|signup|email me|get in touch|reach me|reach us|newsletter form|a form|form'],
    ['gallery', 'gallery|galleries|photo grid|image grid|photos|pictures|lookbook'],
    ['team', 'team|who we are|about us|the people|crew|our people|members'],
    ['embed', 'video|videos|youtube|vimeo|spotify|soundcloud|embed|bandcamp|playlist|map'],
    ['features', 'features?|feature list|what we do|services|benefits|highlights'],
    ['links', 'links list|link list|list of links|links'],
    ['footer', 'footer|bottom bar'],
    ['hero', 'hero|header|banner|top section'],
    ['text', 'text section|text block|paragraph|some text|story|text'],
  ].map(([k, w]) => [k, new RegExp(`\\b(?:${w})\\b`)]);
  const blockOf = c => { let best = null, at = Infinity; for (const [k, rx] of BLOCK_W) { const m = rx.exec(c); if (m && m.index < at) { at = m.index; best = k; } } return best; };   // the first one named is the subject
  const PRESET_W = { paper: 'paper|cream|warm paper', swiss: 'swiss|grid look', terminal: 'terminal|hacker|monospace', editorial: 'editorial|magazine|serif', playful: 'playful|fun|bubbly|colorful', minimal: 'minimal|minimalist|plain|simple', bold: 'bold|loud|poster|punchy', soft: 'soft|pastel|gentle' };
  const presetOf = c => { for (const [k, w] of Object.entries(PRESET_W)) if (new RegExp(`\\b(?:${w})\\b`).test(c)) return k; return ''; };
  const VAR_W = [['split', 'split|side by side'], ['center', 'center|centered|middle'], ['masonry', 'masonry'], ['table', 'table'], ['cards', 'cards'], ['grid', 'grid|columns'], ['list', 'list'], ['stack', 'stack|stacked'], ['minimal', 'minimal']];
  const LESSON_W = [['export', 'export|exporting|html export|download (?:my |the )?(?:site|html|website)'], ['inspo', 'inspiration board|inspo board|inspo|moodboard|mood board|inspiration'], ['templates', 'templates?'],
    ['premium', 'premium|credits|subscription|subscribe|plans|upgrade'], ['huddles', 'huddles?|voice calls?|voice chat|video calls?|calls?'], ['agents', 'agents?|ai helpers?|claude code|my ai'], ['company', 'company|company mode|seats'],
    ['preview', 'preview|live preview'], ['canvas', 'design canvas|canvas|figma|design|mockups?|screens'], ['site', 'website designer|site designer|website builder|site builder|websites?|sites?|wire buttons|buttons|landing pages?|designer'],
    ['tasks', 'task board|tasks?|kanban|board'], ['work', 'work|gigs?|jobs|time bank'], ['files', 'files?|uploads?|folders'], ['chat', 'chat|messages|channels|dms']].map(([k, w]) => [k, new RegExp(`\\b(?:${w})\\b`)]);
  const featureOf = s => { for (const [k, rx] of LESSON_W) if (rx.test(s)) return k; return null; };
  function lessonOf(c) {
    let m = /^(?:teach me|teach|lesson (?:on|about|for)|a lesson (?:on|about)|tutorial (?:on|for|about)|walk me through|show me how(?: to use)?)\s+(?:about\s+)?(?:how to\s+)?(?:use\s+)?(.+?)(?:\s+works?)?$/.exec(c);
    if (m) return featureOf(m[1]);
    if (/^how (?:do|does|can|should) (?:i|we|you)\s+(?:use|make|build|start|upload|export|wire|set up|work with|get started with|create|share)\b/.test(c)) return featureOf(c.replace(/^how (?:do|does|can|should) (?:i|we|you)\s+/, ''));
    if ((m = /^how (?:does|do|is|are)\s+(?:the\s+|a\s+|my\s+|our\s+)?(.+?)\s+work(?:s|ing)?$/.exec(c))) return featureOf(m[1]);
    if (/^what (?:is|are) (?:tribecode\s+)?(?:premium|credits)$/.test(c)) return 'premium';
    return null;
  }
  const titleCase = s => String(s || '').trim().replace(/\b[a-z]/g, ch => ch.toUpperCase()).replace(/\bFaq\b/g, 'FAQ');
  const SOCIAL = /\b(instagram|insta|tiktok|youtube|twitter|bluesky|facebook|spotify|soundcloud|bandcamp|twitch|linkedin|github|patreon|etsy)\b/;
  const TARGET_MAP = { 'signup form': 'contact', 'sign up form': 'contact', 'contact form': 'contact', form: 'contact', 'email form': 'contact', newsletter: 'contact', reviews: 'testimonials', prices: 'pricing', plans: 'pricing', questions: 'faq', photos: 'gallery', 'home page': 'home', homepage: 'home', top: 'home', start: 'home' };
  function wireTarget(raw, ctx) {
    const url = (/\b(https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+)/i.exec(raw) || [])[1], email = (/\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/.exec(raw) || [])[1];
    if (email) return { kind: 'email', to: email.replace(/[.,]+$/, '') };
    if (url) return { kind: 'url', to: url.replace(/[.,]+$/, '') };
    const low = deaccent(String(raw).toLowerCase()).replace(/[!?.]+$/, '');
    const so = SOCIAL.exec(low); if (so && /\b(?:to|at|my|our)\b/.test(low)) return { kind: 'url', to: so[1] === 'insta' ? 'instagram' : so[1] };
    const m = /^.*\b(?:to|at|into|towards?)\s+(.+)$/.exec(low); if (!m) return {};
    let t = m[1].replace(/^(?:the|my|our|a|an|this|that)\s+/, '').replace(/\s+(?:please|pls|too|instead)$/, '').trim();
    let kind = '';
    if (/\s+page$/.test(t)) { kind = 'page'; t = t.replace(/\s+page$/, ''); } else if (/\s+section$/.test(t)) { kind = 'section'; t = t.replace(/\s+section$/, ''); } else if (/\s+screen$/.test(t)) { kind = 'screen'; t = t.replace(/\s+screen$/, ''); }
    if (TARGET_MAP[t]) t = TARGET_MAP[t];
    if (!t || /^(?:pages|screens|sections|somewhere|anything|something|the right (?:place|pages?)|work|go|me)$/.test(t) || t.split(' ').length > 4) return {};
    if (!kind && ((ctx.pages || []).some(p => String(p).toLowerCase() === t))) kind = 'page';
    if (!kind && blockOf(t)) kind = 'section';
    return { kind: kind || 'page', to: t };
  }
  function design(c, raw, ctx) {
    const view = ctx.view === 'canvas' ? 'canvas' : (ctx.view === 'site' || (ctx.view === 'preview' && ctx.site)) ? 'site' : '';
    const out = [], hit = (intent, slots, conf) => { out.push({ intent, area: intent === 'lesson' ? 'help' : intent.startsWith('canvas.') ? 'canvas' : 'build', slots: slots || {}, conf: conf || (view === 'canvas' ? 0.98 : 0.97), req: {}, label: '' }); return out; };
    const r = String(raw || '').trim(), rl = r.toLowerCase();
    const lf = lessonOf(c); if (lf) return hit('lesson', { feature: lf }, 0.97);
    const IMG = /\b(?:image|images|picture|pictures|photo|photos|avatar|img|headshot|portrait|cover|pfp)\b/;
    if (view) {
      const cv = view === 'canvas';
      // export (the website designer)
      if (!cv && /\b(?:export|download|zip|html|webpage file|web page file|save it as|get the code|code for this|source code|static files?)\b/.test(c) && !IMG.test(c)) return hit('site.export', { fmt: /\bzip\b/.test(c) ? 'zip' : /\b(?:html|webpage|web page)\b/.test(c) ? 'html' : '' });
      // words: "change the headline to …", "the button should say …", "rename the site to …"
      if (!cv) {
        let m = /\b(?:change|set|make|update|edit|have)\s+(?:the\s+)?(headline|title|heading|tagline|subtitle|subheading|intro|button|button text|cta)\s+(?:to\s+say|to\s+read|say|says|read|reads|to|into)\s+(.+)$/i.exec(r)
          || /\b(?:the\s+)?(headline|title|heading|tagline|button|cta)\s+should\s+(?:say|read|be)\s+(.+)$/i.exec(r);
        if (m) { const f = m[1].toLowerCase(); return hit('site.text', { field: /title|heading|headline/.test(f) ? 'headline' : /tagline|subtitle|subheading|intro/.test(f) ? 'tagline' : 'button', text: m[2].replace(/^["“']|["”'.]+$/g, '').trim() }); }
        if ((m = /\b(?:rename|call)\s+(?:the\s+|my\s+)?(?:site|website)\s+(?:to\s+)?(.+)$/i.exec(r))) return hit('site.text', { field: 'name', text: m[1].replace(/["“”.]+$/g, '').trim() });
      }
      // wire buttons and links
      const BTN = '(?:buttons?|links?|ctas?|call to action)';
      const wired = [new RegExp(`\\b(?:make|get|have|let)\\s+(?:all\\s+)?(?:of\\s+)?(?:the\\s+|my\\s+|these\\s+|those\\s+|this\\s+|that\\s+)?(?:[a-z]+\\s+){0,2}?${BTN}\\s+(?:work|go|open|link|point|scroll|lead|take|clickable|functional|do something|actually|email|send|jump)`), new RegExp(`^(?:functional|working|clickable|live|real)\\s+${BTN}$`),
        new RegExp(`\\b(?:wire|hook|connect|link|point|route|send|aim)\\s+(?:up\\s+)?(?:all\\s+)?(?:the\\s+|this\\s+|that\\s+|my\\s+|these\\s+|teh\\s+)?(?:[a-z]+\\s+){0,2}?(?:${BTN}|it|this|that)\\b`), new RegExp(`${BTN}\\s+(?:do not|does not)\\s+(?:do anything|work|go anywhere|lead anywhere)`),
        new RegExp(`${BTN}\\s+should\\s+(?:go|open|link|point|lead|take|scroll|email|send)`), /\bmake\s+(?:this|it|that)\s+(?:clickable|a link|link somewhere)\b/, /\b(?:make|have)\s+(?:it|this)\s+(?:email|link|go|open)\s+(?:to|me|at)\b/, /\b(?:cta|button)\s+(?:scroll|go|jump|lead)s?\s+to\b/, new RegExp(`${BTN}\\s+(?:goes|go|leads?|links?|point|points)\\s+(?:nowhere|to nothing)`), new RegExp(`\\b(?:broken|dead|fake|empty)\\s+${BTN}`), new RegExp(`${BTN}\\s+(?:is|are)\\s+(?:broken|dead|not working|fake)`), new RegExp(`${BTN}\\s+(?:should|need to|must|have to)\\s+(?:actually\\s+|really\\s+)?(?:work|do something|be clickable)`)];
      if (wired.some(x => x.test(c)) && !/\b(?:link in bio|link tree|linktree)\b/.test(c)) { const t = wireTarget(r, ctx); if (cv && t.kind && t.kind !== 'url' && t.kind !== 'email') t.kind = 'screen'; return hit(cv ? 'canvas.wire' : 'site.wire', t.to ? t : {}); }
      // pages (canvas: screens)
      const PG = cv ? '(?:page|screen|frame|view)' : 'page';
      let m = new RegExp(`\\b(?:rename|call|retitle)\\s+(?:this|the|current)\\s+${PG}\\s+(?:to\\s+|as\\s+)?(.+)$`, 'i').exec(r) || new RegExp(`\\bchange\\s+(?:the\\s+)?${PG}(?:'s)?\\s+(?:name|title)\\s+to\\s+(.+)$`, 'i').exec(r);
      if (m && !cv) return hit('site.page.rename', { name: titleCase(m[1].replace(/["“”.]+$/g, '')) });
      if (!cv && (m = new RegExp(`\\b(?:delete|get rid of|drop|lose|trash|scrap|do not need|kill)\\s+(?:this|the|that|my)\\s+(?:([a-z]+)\\s+)?page\\b`).exec(c))) return hit('site.page.delete', m[1] ? { name: m[1] } : {});
      if (new RegExp(`\\b(?:add|make|create|new|need|want|get|start|insert|build|another|second|extra)\\b.*\\b${PG}\\b`).test(c) && !/\b(?:button|link|section|docs?)\b/.test(c)) {
        let name = '';
        const cm = new RegExp(`(?:\\b(?:called|named|titled)\\s+|${PG}\\s*:\\s*)(.+)$`, 'i').exec(r);
        if (cm) name = cm[1].replace(/\s+(?:too|please|pls)$/i, '').replace(/["“”.!]+$/g, '');
        else { const bm = new RegExp(`\\b([a-z]+)\\s+${PG}\\b`).exec(c), fm = new RegExp(`\\b${PG}\\s+for\\s+(?:my|our|the)?\\s*([a-z]+(?:\\s+[a-z]+)?)$`).exec(c); const w = bm && bm[1]; if (w && !/^(?:a|an|the|new|another|second|extra|blank|empty|one|more|add|make|create|get|need|want|i|we|this|that|start|insert|build|mobile|phone|desktop)$/.test(w)) name = w; else if (fm) name = fm[1]; }
        return hit(cv ? 'canvas.page' : 'site.page.add', name ? { name: titleCase(name) } : {}, cv ? 0.96 : 0.97);
      }
      // images
      const hasImg = IMG.test(c) || /\bmoodboard\b/.test(c);
      if (/\balt\b|\bscreen readers?\b|\bdescribe (?:the|this) (?:image|picture|photo)\b/.test(c)) { const am = /\balt(?: text)?\s+(?:to|as|:)\s+(.+)$/i.exec(r); if (cv) return hit('canvas.image', { action: 'alt' }); return hit('site.image.alt', am ? { alt: am[1].replace(/["“”.]+$/g, '').trim() } : {}); }
      if ((hasImg || /\bcrop\b/.test(c)) && /\b(?:round|circle|circular|rounded|oval|square|squared)\b/.test(c)) { const shape = /\bno (?:round|rounded)\b/.test(c) || (/\bsquare/.test(c) && !/\b(?:round|circle)\b/.test(c)) ? 'square' : 'round'; return cv ? hit('canvas.image', { action: shape }) : hit('site.image.shape', { shape }); }
      if (hasImg && !/\b(?:photo grid|image grid|gallery)\b/.test(c) && (/\b(?:replace|swap|change|switch|update|different|new|upload|use|put|edit|another|add)\b/.test(c) || /^(?:edit|my) /.test(c))) {
        const source = /https?:\/\//i.test(r) ? 'url' : /\b(?:board|moodboard|mood board|inspiration|inspo)\b/.test(c) ? 'board' : /\b(?:my|own|upload|mine)\b/.test(c) && !/\bedit this\b/.test(c) ? 'upload' : '';
        const sl = source ? { source } : {};
        if (cv) return hit('canvas.image', /\bedit\b/.test(c) && !source ? {} : { action: 'replace', ...sl });
        return hit('site.image.replace', sl);
      }
      // dark mode: a real theme variant of the design
      if (/\b(?:dark|darker|night|black background|dim|darken)\b/.test(c) || /\b(?:light mode|lighter|light again|light version|brighten|white background|light theme)\b/.test(c)) {
        const light = /\btoo dark\b/.test(c) || (!/\b(?:dark|darker|night|black|dim|darken)\b/.test(c));
        return hit(cv ? 'canvas.dark' : 'site.dark', { mode: light ? 'light' : 'dark' });
      }
      if (!cv) {
        const blk = blockOf(c);
        // layouts: "make the hero split", "masonry gallery", "show the pricing as a table"
        if (blk && !/\b(?:add|insert|include|embed)\b/.test(c)) {
          const v = VAR_W.find(([, w]) => new RegExp(`\\b(?:${w})\\b`).test(c));
          if (/\b(?:layout|arrangement|variant|different look)\b/.test(c) || (v && !/\b(?:photo grid|image grid|links list|link list)\b/.test(c))) return hit('site.layout', v ? { block: blk, variant: v[0] } : { block: blk });
        }
        if (blk) {
          const dir = /\b(?:above|before)\b/.test(c) ? 'up' : /\b(?:below|after|under)\b/.test(c) ? 'down' : /\b(?:to the top|at the top|first|to the start|higher up)\b/.test(c) ? 'top' : /\b(?:to the bottom|at the bottom|last|to the end|at the end)\b/.test(c) ? 'bottom' : /\bup\b/.test(c) ? 'up' : /\bdown\b/.test(c) ? 'down' : '';
          if (dir && /\b(?:move|put|place|shift|bump|push)\b/.test(c)) return hit('site.block.move', { block: blk, dir });
          if (/\b(?:delete|get rid of|drop|hide|lose|kill|without|take out|ditch|scrap|cut|nix|toss|lose)\b/.test(c) && !/\bdrop in\b/.test(c) || /^no\s/.test(c)) return hit('site.block.remove', { block: blk });
          if (/\b(?:add|put|insert|include|want|need|show|embed|stick|throw|drop in|give me|let)\b/.test(c) || /\bsection$/.test(c)) return hit('site.block.add', { block: blk });
        }
        const col = colorOf(c);
        if (col && /\b(?:accent|colou?r|main|brand|primary|buttons?|make it|make everything|use|turn it)\b/.test(c)) return hit('site.color', { color: col });
        if (/\b(?:theme|look|style|preset|vibe|feel)\b/.test(c) || (/^make it (?:look )?(?:a bit |a little )?more\s/.test(c) && presetOf(c))) { const p = presetOf(c); return hit('site.theme', p ? { preset: p } : {}); }
      }
    }
    // open the website designer
    if (/\b(?:website designer|site designer|designer)\b/.test(c) && !/\bhire\b/.test(c)) return hit('site.open', {}, 0.96);
    if (/\b(?:edit|design|redesign|work on)\s+(?:my|our|the)\s+(?:website|site)$/.test(c) || /\b(?:turn|make)\s+(?:this|it)\s+(?:into\s+)?(?:a\s+)?(?:real\s+)?(?:website|site)\b/.test(c)) return hit('site.open', {}, 0.96);
    // a template from what the site is for
    if (view === 'site' && !ctx.start && !/\b(?:template|start over|from scratch)\b/.test(c)) return out;   // in the designer a template needs asking for, unless nothing is designed yet
    if (/\b(?:post|doc|email|essay|letter|memo|note|task|slides|sheet|tweet|caption|poem|story)\b/.test(c) && !/\btemplate\b/.test(c)) return out;
    let best = null, bl = 0;
    for (const [k, tags] of Object.entries(TPL_TAGS)) for (const tg of tags) if (tg.length > bl && new RegExp(`\\b${tg}\\b`).test(c)) { best = k; bl = tg.length; }
    if (!best) return out;
    const tagOnly = new RegExp(`^(?:(?:a|an|my|the)\\s+)?(?:${TPL_TAGS[best].join('|')})(?:\\s+(?:site|website|page|please))?$`).test(c);
    const trig = tagOnly || /\b(?:site|sites|website|web site|page|homepage|landing|something|online|template|web presence)\b/.test(c) || /\b(?:make|build|create|set up|needs?|wants?|give me|get me|start|launch|show off)\b/.test(c) || /\b(?:i|we)\s+(?:write|run|sell|own|have|am|are|stream|do|make)\b/.test(c);
    if (trig) hit('site.' + best, {}, /\btemplate\b/.test(c) ? 0.97 : 0.93);
    return out;
  }

  // ---------- slot helpers used by the catalog ----------
  function refFill(s, ctx, strict) {
    const t = taskRef(s.ref, ctx);
    if (t) return { task: { id: t.id, title: t.title, status: t.status, assignee: t.assignee, due: t.due } };
    if (strict) return null;   // "start a jam", "start hosting": not a task
    if (!s.ref || /^(it|that|this|that one|this one)$/.test(String(s.ref).toLowerCase())) return { task: null };
    return (ctx && ctx.tasks && ctx.tasks.length) ? null : { task: null, ref: s.ref };
  }
  // the date inside a slot is read on Flint's canonical words ("mañana" = tomorrow) and cut out of the person's words
  function cutWhen(s, k, ctx, X) {
    const g = X && X.G && X.G[k]; if (!g) return { text: String(s[k] || '').trim(), w: null };
    const w = parseWhen(g.c, ctx && ctx.now); if (!w || !w.span) return { text: String(s[k] || '').trim(), w };
    const ex = [[g.s + w.span[0], g.s + w.span[1]]]; if (w.tspan) ex.push([g.s + w.tspan[0], g.s + w.tspan[1]]);
    return { text: X.o(g.s, g.e, ex).replace(/\s+(?:by|on|for|due|until|before|at)\s*$/i, '').replace(/^\s*(?:on|at|for)\s+/i, '').trim(), w };
  }
  function taskBits(s, ctx, X) {
    let title = String(s.title || '').trim(); if (!title) return { title: '' };
    const out = {};
    const cw = cutWhen(s, 'title', ctx, X), w = cw.w;
    if (w && w.date) { out.due = w.date; if (w.time) out.time = w.time; title = cw.text; }
    const am = /\s+(?:and\s+)?(?:assign(?:\s+it)?\s+to|give(?:\s+it)?\s+to|for|owned by)\s+([\p{L}][\p{L}'-]*)\s*$/iu.exec(title);
    if (am) { const p = person(am[1], ctx); if (p && !p.all) { out.who = p; title = title.slice(0, am.index).trim(); } }
    const pm = /^\s*(?:urgent|asap|high priority|important)\s*:?\s+/i.exec(title); if (pm) { out.urgent = true; title = title.slice(pm[0].length); }
    out.type = /\b(bug|fix|broken|crash|error)\b/i.test(title) ? 'fix' : /\b(design|logo|mockup|icon|color|font|layout)\b/i.test(title) ? 'design' : /\b(write|draft|copy|blog|post|docs?)\b/i.test(title) ? 'write' : /\b(research|look into|find out|compare|investigate)\b/i.test(title) ? 'research' : 'build';
    title = title.replace(/^(?:to|that|for)\s+/i, '').replace(/[.!]+$/, '').trim();
    out.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : '';
    return out;
  }
  function buildFill(s) {
    let name = String(s.name || '').trim().replace(/[.!]+$/, ''), style = String(s.style || '').toLowerCase();
    const mm = /\s*,?\s*(?:in\s+)?(dark|light)(?:\s+(?:mode|theme))?$/i.exec(name); if (mm) { style = mm[1].toLowerCase(); name = name.slice(0, mm.index).trim(); }
    const cm = /\s+in\s+([\p{L}#0-9]+)$/iu.exec(name); if (cm && colorOf(cm[1])) { style = cm[1].toLowerCase(); name = name.slice(0, cm.index).trim(); }
    name = name.replace(/^(?:my|our)\s+/i, '');
    const col = colorOf(style);
    return { name, mode: /dark/.test(style) ? 'dark' : /light/.test(style) ? 'light' : '', color: col };
  }
  const NUM2 = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  function calcFill(s) {
    const r2 = x => Math.round(x * 100) / 100;
    const num = x => parseFloat(String(x).replace(/[^\d.]/g, ''));
    if (s.pct) return { value: r2(num(s.pct) / 100 * num(s.of)), expr: `${num(s.pct)}% of ${num(s.of)}` };
    if (s.total) { const n = NUM2[s.n] || +s.n; return n ? { value: r2(+s.total / n), expr: `${s.total} ÷ ${n}`, each: true } : null; }
    if (s.bill) { const rate = +(s.rate || 18); return { value: r2(+s.bill * rate / 100), expr: `${rate}% tip on ${s.bill}`, total: r2(+s.bill * (1 + rate / 100)) }; }
    const e = String(s.expr || '').replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!/\d/.test(e) || !/[-+*/]/.test(e) || !/^[\d\s+\-*/().]+$/.test(e)) return null;
    try { const v = Function('"use strict";return (' + e + ')')(); return isFinite(v) ? { value: r2(v), expr: String(s.expr).trim() } : null; } catch { return null; }   // only digits and operators reach here
  }
  const UNITS = { km: ['len', 1000], kilometer: ['len', 1000], mi: ['len', 1609.344], mile: ['len', 1609.344], m: ['len', 1], meter: ['len', 1], ft: ['len', 0.3048], feet: ['len', 0.3048], foot: ['len', 0.3048], in: ['len', 0.0254], inch: ['len', 0.0254], cm: ['len', 0.01], centimeter: ['len', 0.01],
    kg: ['mass', 1], kilo: ['mass', 1], kilogram: ['mass', 1], lb: ['mass', 0.45359237], pound: ['mass', 0.45359237], oz: ['mass', 0.0283495], ounce: ['mass', 0.0283495], g: ['mass', 0.001], gram: ['mass', 0.001], l: ['vol', 1], liter: ['vol', 1], litre: ['vol', 1], gal: ['vol', 3.78541], gallon: ['vol', 3.78541], c: ['temp', 'c'], celsius: ['temp', 'c'], f: ['temp', 'f'], fahrenheit: ['temp', 'f'] };
  const unit = u => UNITS[u] || UNITS[u.replace(/(es|s)$/, '')] || UNITS[u.replace(/s$/, '')];
  function convertFill(s, X) {
    if (X) s = { ...s, ...X.c };
    const a = unit(String(s.from).toLowerCase()), b = unit(String(s.to).toLowerCase()), n = +s.n; if (!a || !b || a[0] !== b[0]) return null;
    let v; if (a[0] === 'temp') v = a[1] === b[1] ? n : a[1] === 'c' ? n * 9 / 5 + 32 : (n - 32) * 5 / 9; else v = n * a[1] / b[1];
    return { value: Math.round(v * 100) / 100, from: s.from, to: s.to, n };
  }

  // vocabulary for spelling tolerance: every literal word in the patterns and examples
  VOCAB = new Set();
  const addWords = s => String(s).toLowerCase().replace(/\\[a-z]/g, ' ').replace(/\(\?<[a-z0-9]+>/g, ' ').split(/[^a-z]+/).forEach(w => { if (w.length >= 3) VOCAB.add(w); });
  CAT.forEach(x => { x.rx.forEach(r => addWords(r.source)); x.ex.forEach(addWords); });
  Object.values(SLANG).concat(Object.values(LEX)).forEach(addWords); DAYS.concat(MONTHS).forEach(w => VOCAB.add(w)); Object.keys(COLORS).forEach(w => VOCAB.add(w));
  ['nightshade', 'campfire', 'midnight', 'nordic', 'trending', 'tomorrow', 'tonight', 'calendar', 'marketplace', 'whiteboard', 'secretary', 'autopilot', 'publish', 'preview', 'settings', 'template', 'templates'].forEach(w => VOCAB.add(w));
  Object.values(TPL_TAGS).flat().concat(['linktree', 'linkinbio', 'moodboard', 'designer', 'wire', 'clickable', 'functional', 'buttons', 'button', 'export', 'gallery', 'testimonials', 'masonry', 'instagram', 'teach', 'lesson', 'tutorial', 'portfolio', 'photographer', 'screen', 'picture', 'image', 'connect', 'pricing', 'website', 'darker', 'contact', 'point', 'different', 'rounded', 'round', 'paper', 'minimal', 'embed', 'spotify', 'youtube', 'prices', 'section', 'swiss', 'terminal', 'editorial', 'playful', 'masonry', 'headline', 'tagline', 'footer', 'features', 'team', 'reviews', 'questions', 'answers', 'download', 'square', 'circle', 'avatar', 'photo', 'theme', 'layout', 'split', 'faq', 'nowhere', 'anywhere', 'somewhere', 'clickable']).forEach(addWords);
  const FUNC = ['could', 'would', 'should', 'there', 'their', 'about', 'with', 'what', 'when', 'where', 'which', 'this', 'that', 'them', 'they', 'have', 'from', 'your', 'into', 'than', 'then', 'also', 'just', 'some', 'more', 'most', 'very', 'much', 'many', 'such', 'does', 'made', 'like', 'here', 'were', 'will', 'works', 'many', 'look', 'need', 'want', 'know', 'take', 'make', 'work', 'have', 'done', 'left', 'find'];
  ['ack', 'abc', 'ing'].concat(FUNC.filter(w => !['make', 'look', 'need', 'want', 'know', 'take', 'work', 'done', 'left', 'find', 'many', 'have', 'here', 'does', 'what', 'when', 'where', 'which', 'this', 'that', 'with', 'will'].includes(w))).forEach(w => VOCAB.delete(w));
  FUNC.forEach(w => KEEP.add(w));
  'noon midnight morning afternoon evening night tonight weekend week weeks month months day days hour hours minute minutes mins today tomorrow eod eow sept'.split(' ').forEach(w => { VOCAB.add(w); KEEP.add(w); });

  // ---------- TF-IDF (examples for "did you mean", taught phrases, and the knowledge base) ----------
  function feats(s) {
    const ws = String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean), f = new Map();
    const add = (k, v) => f.set(k, (f.get(k) || 0) + v);
    ws.forEach(w => { if (!STOPW.has(w)) add('w:' + stem(w), 1); const p = ` ${w} `; for (let i = 0; i + 3 <= p.length; i++) add('c:' + p.slice(i, i + 3), 0.3); });
    for (let i = 0; i + 1 < ws.length; i++) if (!STOPW.has(ws[i]) || !STOPW.has(ws[i + 1])) add('b:' + ws[i] + '_' + ws[i + 1], 0.6);
    return f;
  }
  function index(docs) {   // docs: [{ id, text, ...meta }] -> idx
    const df = new Map(), vecs = docs.map(d => feats(d.text));
    vecs.forEach(v => v.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)));
    const N = docs.length || 1, idf = k => Math.log(1 + N / (df.get(k) || 1));
    const norm = v => { let s = 0; const o = new Map(); v.forEach((x, k) => { const y = x * idf(k); o.set(k, y); s += y * y; }); return { v: o, n: Math.sqrt(s) || 1 }; };
    return { docs, vecs: vecs.map(norm), idf, norm };
  }
  function search(idx, q, k = 5) {
    if (!idx || !idx.docs.length) return [];
    const qv = idx.norm(feats(q)); const out = [];
    idx.vecs.forEach((d, i) => { let s = 0; qv.v.forEach((x, key) => { const y = d.v.get(key); if (y) s += x * y; }); s /= qv.n * d.n; if (s > 0) out.push({ doc: idx.docs[i], score: s }); });
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
  const EXIDX = index(CAT.flatMap(x => x.ex.map(e => ({ id: x.id, text: e }))));

  // ---------- split a message into steps ----------
  const VERBS = 'add|make|build|create|tell|message|ping|text|dm|send|open|show|schedule|book|set|switch|change|invite|publish|ship|start|mark|assign|give|remind|post|announce|write|draft|turn|put|move|note|jot|delete|rename|export|reload|find|let';
  function split(raw) {
    let s = String(raw || '').trim().replace(/[.!?]+$/, '').replace(/^(?:(?:hey|hi|ok|okay|yo|so)\s*,?\s*)?(?:flint\s*[,:]\s*|flint\s+(?=\p{L}))?/iu, '').replace(/^(?:hey|ok|okay|so|um)\s*,\s*/i, '');
    if (/\b(?:when(?:ever)?|if)\s+i\s+say\b|\bi\s+meant\b/i.test(s)) return [s];
    const parts = s.split(new RegExp(`\\s*(?:[;\\n]+|,?\\s+(?:and\\s+then|then|after that|afterwards|and also|also|plus)\\s+|\\.\\s+(?=\\p{L})|,\\s*(?=(?:${VERBS})\\b))\\s*`, 'iu')).map(x => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {   // "add a task to X and tell Maya": split on "and <command verb>" (a person's "and" stays: "tell Maya and Sam")
      const re = new RegExp(`\\s+and\\s+(?=(?:${VERBS})\\b(?!\\s+(?:sure|it work|it to|it over)))`, 'i');
      const bits = p.split(re); out.push(...bits.map(x => x.trim()).filter(Boolean));
    }
    return out.length ? out : [s];
  }

  // ---------- parse one step ----------
  function prep(text, ctx) {
    const keep = new Set(); ((ctx && ctx.members) || []).forEach(m => String(m.name || '').toLowerCase().split(/\s+/).forEach(w => keep.add(deaccent(w)))); ((ctx && ctx.tasks) || []).forEach(t => String(t.title || '').toLowerCase().split(/[^a-z]+/).forEach(w => w && keep.add(w)));
    const lang = detectLang(text), toks = trimFill(canon(tokenize(text), keep, lang)), { c, spans } = joinCanon(toks);
    return { toks, c, spans, lang };
  }
  function detectLang(s) {
    if (/[぀-ヿ]/.test(s)) return 'ja'; if (/[가-힯]/.test(s)) return 'ko'; if (/[㐀-鿿]/.test(s)) return 'zh';
    const w = ' ' + deaccent(String(s).toLowerCase()) + ' ';
    const score = { es: /\b(anade|agrega|tarea|manana|abre|haz|para|hoy|una|el|los|dile|crea)\b/g, pt: /\b(adiciona|tarefa|amanha|abra|hoje|uma|faz|cria|convida|desfazer)\b/g, fr: /\b(ajoute|tache|demain|ouvre|aujourdhui|une|pour|fais|cree|les|sombre)\b/g, de: /\b(fuge|aufgabe|morgen|offne|heute|eine|fur|mach|erstelle|hinzu|bitte|dunkel)\b/g };
    let best = 'en', n = 0; for (const [k, rx] of Object.entries(score)) { const c = (w.match(rx) || []).length; if (c > n) { n = c; best = k; } } return best;
  }
  function one(text, ctx) {
    ctx = ctx || {};
    const P = prep(text, ctx), { c } = P, hits = [];
    if (!c) return { intent: null, conf: 0, text, c };
    for (const it of CAT) {
      for (const rx of it.rx) {
        const m = rx.exec(c); if (!m) continue;
        const slots = {}, G = {};
        if (m.groups) for (const [k, v] of Object.entries(m.groups)) { if (v == null) continue; const ix = m.indices.groups[k]; slots[k] = ix ? original(P.toks, P.spans, ix[0], ix[1]) || v : v; if (ix) G[k] = { c: v, s: ix[0], e: ix[1] }; }
        let conf = it.p;
        if (it.ctx) { if (!it.ctx(ctx)) continue; conf = 0.97; }
        const fixed = P.toks.filter(t => t.fixed).length; conf -= Math.min(0.08, fixed * 0.03);
        const X = { G, c: Object.fromEntries(Object.entries(G).map(([k, g]) => [k, g.c])), o: (s, e, ex) => original(P.toks, P.spans, s, e, ex) };
        let filled = it.fill ? it.fill(slots, c, ctx, X) : slots; if (filled === null || filled === undefined) continue;
        if (it.id === 'teach' || it.id === 'meant' || it.id === 'unteach') { const raw = String(text); const mm = it.id === 'teach' ? /\bsay\s+["“']?([^,"”]+?)["”']?\s*,\s*(?:(?:then|please|you should|do|run|it means|means|that means|i mean)\s*:?\s+)?(.+)$/i.exec(raw) || /(?:say)\s+["“]?(.+?)["”]?\s*,?\s*(?:you should\s+|please\s+|then\s+)?(?:do|run|mean|means|it means|i mean|open|you do|that means|do this)\s*:?\s+(.+)$/i.exec(raw) || /^(.+?)\s+means\s+(.+)$/i.exec(raw) : null; if (mm) filled = { say: mm[1].replace(/^["“']|["”']$/g, '').trim(), means: mm[2].trim() }; }
        if (filled.task === null && filled.ref && it.area === 'tasks' && !(ctx.tasks && ctx.tasks.length)) conf -= 0.02;
        // context: what's on screen breaks ties
        if (ctx.view === 'canvas' && it.area === 'canvas') conf += 0.03;
        if (ctx.view === 'canvas' && it.id.startsWith('site.')) conf -= 0.02;
        if (/^(nav\.)/.test(it.id) && rx === it.rx[2]) conf -= 0.06;   // a bare word ("calendar") is a little less sure than "open calendar"
        hits.push({ intent: it.id, area: it.area, slots: filled, conf: Math.max(0, Math.min(1, conf)), label: it.label, req: it.req });
        break;
      }
    }
    for (const h of design(c, text, ctx)) { const same = hits.find(x => x.intent === h.intent); if (same) same.conf = Math.max(same.conf, h.conf); else hits.push(h); }
    // bags: any word order, any language ("tarea comprar leche añade", "明日 牛乳 タスク 追加")
    const ws = c.split(' ');
    if (!hits.some(h => h.conf >= 0.85)) {
      const has = w => ws.includes(w);
      if (has('task') && (has('add') || has('create') || has('new') || has('make'))) {
        const rest = P.toks.filter(t => !/^(task|tasks|add|create|new|make|a|the|please|for)$/.test(t.w) && !(t.w === 'tomorrow' || t.w === 'today')).map(t => t.o).join(P.toks.some(t => t.cjk) ? '' : ' ').trim();
        const when = has('tomorrow') ? parseWhen('tomorrow', ctx.now) : has('today') ? parseWhen('today', ctx.now) : null;
        if (rest) hits.push({ intent: 'task.add', area: 'tasks', slots: { title: rest.charAt(0).toUpperCase() + rest.slice(1), due: when && when.date, type: 'build' }, conf: 0.82, req: {} });
      }
      if (has('note') && ws.length > 1 && !has('task')) { const rest = P.toks.filter(t => !/^(note|add|create|new|make|a|the|please)$/.test(t.w)).map(t => t.o).join(P.toks.some(t => t.cjk) ? '' : ' ').trim(); if (rest) hits.push({ intent: 'note.add', area: 'notes', slots: { body: rest }, conf: 0.8, req: {} }); }
      if (has('open') || has('show')) { const dest = { settings: 'nav.settings', calendar: 'nav.calendar', files: 'nav.files', tasks: 'nav.tasks', task: 'nav.tasks', chat: 'nav.chat' }; const k = ws.find(w => dest[w]); if (k) hits.push({ intent: dest[k], area: 'nav', slots: {}, conf: 0.8, req: {} }); }
      if (has('theme') || has('mode')) { if (has('dark')) hits.push({ intent: 'theme.dark-mode', area: 'look', slots: {}, conf: 0.8, req: {} }); else if (has('light')) hits.push({ intent: 'theme.light', area: 'look', slots: {}, conf: 0.8, req: {} }); }
      if (ws.length === 1 && has('undo')) hits.push({ intent: 'undo', area: 'local', slots: {}, conf: 0.9, req: {} });
      if (ws.length <= 3 && has('invite')) hits.push({ intent: 'invite', area: 'team', slots: {}, conf: 0.8, req: {} });
    }
    hits.sort((a, b) => b.conf - a.conf);
    const best = hits[0] || null;
    const near = search(EXIDX, c, 12), seen = new Set(), alts = [];
    for (const n of near) { if (seen.has(n.doc.id) || (best && n.doc.id === best.intent)) continue; seen.add(n.doc.id); alts.push({ intent: n.doc.id, example: n.doc.text, score: Math.round(n.score * 100) / 100 }); if (alts.length >= 3) break; }
    if (!best) {
      const top = near[0];
      const tc = top && CAT.find(x => x.id === top.doc.id); if (top && top.score >= 0.62 && !(tc && tc.ctx && !tc.ctx(ctx)) && !(tc && Object.keys(tc.req).length)) return { intent: top.doc.id, area: (CAT.find(x => x.id === top.doc.id) || {}).area, slots: {}, conf: Math.min(0.7, top.score), text, c, alts, fuzzy: true, lang: P.lang };
      return { intent: null, conf: 0, text, c, alts, lang: P.lang };
    }
    const out = { ...best, text, c, lang: P.lang, alts: hits.slice(1, 4).map(h => ({ intent: h.intent, conf: h.conf })).concat(alts).slice(0, 3) };
    for (const [k, q] of Object.entries(best.req || {})) {   // a required slot is missing: one tappable question
      const v = out.slots[k]; const missing = k === 'ref' ? !out.slots.task && !out.slots.ref : k === 'who' ? !out.slots.who : k === 'color' ? !out.slots.color : (v === undefined || v === '' || v === null); if (missing) { out.ask = { slot: k, question: q, options: options(k, ctx) }; break; }
    }
    delete out.req;
    return out;
  }
  function options(k, ctx) {
    if (k === 'ref') return ((ctx.tasks || []).filter(t => t.status !== 'done').slice(0, 3)).map(t => t.title);
    if (k === 'who') return ((ctx.members || []).filter(m => m.role !== 'spectator').slice(0, 4)).map(m => String(m.name).split(/\s+/)[0]);
    if (k === 'color') return ['teal', 'indigo', 'ember', 'rose'];
    if (k === 'when') return ['today', 'tomorrow', 'friday', 'next week'];
    return [];
  }
  function learnedHit(text, ctx) {
    const L = (ctx && ctx.learned) || []; if (!L.length) return null;
    const low = s => prep(s, {}).c;
    const q = low(text); const exact = L.find(x => low(x.say) === q); if (exact) return { means: exact.means, say: exact.say, score: 1 };
    const idx = index(L.map((x, i) => ({ id: i, text: low(x.say) }))), r = search(idx, q, 1)[0];
    return r && r.score >= 0.8 ? { means: L[r.doc.id].means, say: L[r.doc.id].say, score: r.score } : null;
  }

  // ---------- public parse ----------
  function parse(text, ctx) {
    ctx = ctx || {};
    const pieces = split(text);
    if (pieces.length === 1) {
      const lh = learnedHit(text, ctx); if (lh) { const inner = parse(lh.means, { ...ctx, learned: [] }); inner.learned = lh; return inner; }
      const s = one(text, ctx); return { steps: [s], lang: s.lang || 'en', alts: s.alts || [] };
    }
    const steps = []; let last = ctx.last || {};
    for (const p of pieces) {
      const lh = learnedHit(p, ctx); const s = one(lh ? lh.means : p, { ...ctx, last });
      // a bare modifier ("dark", "in green") belongs to the step before it
      if (!s.intent && steps.length && /^(?:in\s+)?(dark|light|[\p{L}]+)(?:\s+(?:mode|theme))?$/iu.test(p) && (colorOf(p) || /dark|light/i.test(p))) { const prev = steps[steps.length - 1]; if (prev.slots) { if (/dark|light/i.test(p)) prev.slots.mode = /dark/i.test(p) ? 'dark' : 'light'; else prev.slots.color = colorOf(p); } continue; }
      if (s.slots && s.slots.who && !s.slots.who.all) last = { ...last, person: s.slots.who };
      steps.push(s);
    }
    // modifiers glued with a comma: "a merch store for Ember Socks, dark"
    steps.forEach(s => { if (s.slots && typeof s.slots.name === 'string') { const m = /\s*,\s*(dark|light)(?:\s+(?:mode|theme))?$/i.exec(s.slots.name); if (m) { s.slots.name = s.slots.name.slice(0, m.index).trim(); s.slots.mode = m[1].toLowerCase(); } } });
    return { steps, lang: (steps[0] && steps[0].lang) || 'en', alts: [] };
  }

  const catalog = () => CAT.map(x => ({ id: x.id, area: x.area, label: x.label, examples: x.ex.slice() }));
  return { parse, one, split, prep, parseWhen, colorOf, person, taskRef, index, search, catalog, COLORS, THEMES, LANGS, detectLang, version: 1 };
});
