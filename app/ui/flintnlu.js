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
    ['visuals', 'visuals|screenshots|screenshot gallery|images|media|earlier shots|earlier screenshots|screenshot history', 'Visuals'], ['versions', 'versions|project versions|project history|earlier versions|the history of this project', 'Versions'], ['designs', 'saved designs|saved website designs|website designs|site designs', 'Saved designs'], ['notes', 'notes|my notes|captures|scratchpad|meeting notes', 'Notes'], ['updates', 'updates|changelog|release notes|whats new in tribecode|version history', 'Updates'], ['inspo', 'inspiration board|inspo board|inspo|moodboard|mood board|my board|inspiration', 'Inspiration board'], ['brainpick', 'flints brain|flint brain|brain settings|model picker|ai model settings', "Flint's brain"],
  ];
  for (const [k, w, label] of NAV) {
    I('nav.' + k, 'nav', [new RegExp(`^${V_OPEN}\\s+${ART}(?:${w})(?:\\s+(?:page|view|tab|section|screen|panel|please))?$`), new RegExp(`^(?:where(?: is| are| can i find| do i find)|how do i (?:get to|find|open))\\s+${ART}(?:${w})$`), new RegExp(`^${ART}(?:${w})(?:\\s+(?:page|view|tab|section|screen|panel))?$`)],
      { p: 0.93, label, ex: [`open ${w.split('|')[0]}`, `go to the ${w.split('|')[0]}`, `show me ${w.split('|')[1] || w.split('|')[0]}`] });
  }

  // tasks
  const TASKW = '(?:task|tasks|item|card(?!\\s+games?\\b)|ticket|to do|reminder|action item)';   // "a card game" is the memory starter, not a task
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
  I('doc.new', 'docs', [new RegExp(`^(?:write|draft|make|create|start|new|put together|compose|generate|give me|prepare|type up)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|short\\s+|simple\\s+|rough\\s+|first\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:${DOCW})(?:\\s+(?:about|on|for|called|named|titled|explaining|describing|covering|with)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.9, fill: (s, c) => (/^(?:write|compose|tell)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+)?(?:short\s+|little\s+|funny\s+|sad\s+|scary\s+|bedtime\s+)*(?:story|poem|song|lyrics|joke|rap|essay)\s+(?:about|on|where|that)\b/.test(c) ? null : { topic: s.topic || s.topic2 || '' }), ex: ['write a doc about the launch', 'draft a plan for the jam', 'make a page called rules'] });   // creative writing needs a model
  I('doc.new', 'docs', [/^add\s+(?:a|an)\s+(?:new\s+)?(?:[\p{L}-]+\s+)?page(?:\s+(?:to|in)\s+(?:the\s+|my\s+|our\s+)?(?:docs|files))?(?:\s+(?:about|on|for|called)\s+(?<topic>.+))?$/u], { p: 0.9, fill: s => ({ topic: s.topic || '' }), ex: ['add a page to the docs about rules'] });
  I('sheet.new', 'docs', [new RegExp(`^(?:make|create|start|build|new|set up|give me|put together|draft)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|simple\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:sheet|sheets|table|budget|tracker|expense sheet|expense tracker|inventory|price list|roster|schedule sheet|sign up sheet|signup sheet|ledger)(?:\\s+(?:about|on|for|of|called|named|with|to track)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.91, fill: s => ({ topic: s.topic || s.topic2 || '' }), ex: ['make a sheet for the budget', 'create an expense tracker', 'new sheet for inventory'] });
  I('deck.new', 'docs', [new RegExp(`^(?:make|create|build|draft|put together|give me|new|write|prepare|start)\\s+(?:me\\s+|us\\s+)?${ART}(?:new\\s+|quick\\s+|short\\s+)?(?:[\\p{L}-]+\\s+){0,2}?(?:slides|slide|pitch slides|pitch|keynote)(?:\\s+(?:about|on|for|called|named|explaining|covering)\\s+(?<topic>.+)|\\s+(?<topic2>.+))?$`, 'u')], { p: 0.92, fill: s => ({ topic: s.topic || s.topic2 || '' }), ex: ['make slides about the launch', 'build a pitch deck for investors'] });
  I('doc.open', 'docs', [/^(?:open|show|find|pull up|bring up|go to)\s+(?:the\s+|my\s+|our\s+)?(?:doc|page|file|note|sheet|slides)\s+(?:called\s+|named\s+|about\s+)?(?<name>.+)$/, /^(?:open|show|pull up)\s+(?:the\s+|my\s+|our\s+)?(?<name>.+?)\s+(?:doc|page|file|sheet|slides|note)$/], { p: 0.88, req: { name: 'Which doc?' }, ex: ['open the doc rules', 'pull up the launch plan doc'] });
  I('vision.write', 'docs', [/^(?:write|edit|update|start|open|show|work on|change)\s+(?:the\s+|our\s+|my\s+)?(?:project\s+)?vision$/, /^(?:what is|whats)\s+(?:the\s+|our\s+)?vision$/], { ex: ['write the vision', 'open our vision'] });
  I('draft.readme', 'docs', [/^(?:write|draft|make|update|create|generate)\s+(?:a\s+|the\s+|our\s+)?(?<kind>readme|launch post|launch announcement|release notes|changelog|meeting notes)$/, /^(?:write\s+|draft\s+|make\s+)?(?:the\s+|our\s+)?(?<kind>meeting notes|minutes)\s+(?:from|for|of)\s+(?:today|todays meeting|today'?s meeting|the meeting|the call|this morning|the huddle)$/], { p: 0.97, ex: ['write a readme', 'draft the release notes'] });

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
  ], { p: 0.92, req: { what: 'What should I put on the calendar?' }, fill: (s, c, ctx, X) => { if (/^(?:open|show|view|see)$/.test(String((X && X.c.what) || s.what).trim())) return null; if (/^(?:(?:a|an|the|new)\s+)*(?:doc|docs|page|note|sheet|slides|deck|readme|post|plan|brief|memo|outline|spec)\b/.test(String((X && X.c.what) || s.what).trim())) return null; const cw = cutWhen(s, 'what', ctx, X), w = parseWhen(c, ctx && ctx.now) || cw.w; return { what: (cw.text || s.what).replace(/\s+(?:on|to|in)\s+(?:the\s+|my\s+|our\s+)?calendar$/i, ''), date: w && w.date, time: w && w.time }; }, ex: ['schedule a demo friday at 3pm', 'book a playtest tomorrow', 'add lunch with sam to the calendar'] });
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
  I('canvas.tidy', 'canvas', [/^(?:clean|tidy) (?:it|this|that|this frame|the frame) up$/, /^(?:tidy|tidy up|clean up|cleanup|organize|organise|align|neaten|straighten|space out|even out|fix the spacing of|make tidy)\s*(?:it|this|that|the layers|the frame|the selection|this frame|everything|up|the layout|spacing)?(?:\s+up)?$/, /^(?:auto layout|use auto layout|turn (?:this|it) into auto layout|add auto layout)(?:\s+(?:to\s+)?(?:it|this))?$/], { ex: ['tidy up', 'clean up this frame', 'add auto layout'] });
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
  I('publish.to', 'preview', [/^(?:publish|share|put|get|ship|upload|post)\s+(?:my|our|the|this)\s+(?<what>site|website|page|game|app|project)(?:\s+(?:online|live|on the web|on the internet|for real|to the world))?$/,
    /^(?:publish|put|upload|get|share|post)\s+(?:it|this|my game|our game|the game|my app|my site|my project)\s+(?:on|to|onto)\s+(?<dest>itch(?:\.io| io)?|github(?: pages)?|the web|my phone|a phone|android|google play|the play store|iphone|the app store)$/,
    /^(?:make|build|create|get|turn (?:this|it) into)\s+(?:me\s+)?(?:an?\s+)?(?<dest>android|iphone|ios|phone|installable|apk)\s*(?:app|apk|version|build)?(?:\s+(?:from|of|out of|for)\s+(?:this|it|my (?:game|app|site|project)))?$/,
    /^(?:turn|make)\s+(?:this|it|my (?:game|app|site|project))\s+into\s+an?\s+(?<dest>android|iphone|ios|phone|installable)?\s*app$/,
    /^(?:download|export)\s+(?:it|this|my (?:game|app|site|project))\s+(?:as\s+)?(?:a\s+)?(?<dest>zip)(?:\s+file)?$/],
    { p: 0.96, fill: (s, c, ctx, X) => { const d = String((X && X.c.dest) || s.dest || '').toLowerCase(); return { dest: /itch/.test(d) ? 'itch' : /android|apk|play/.test(d) ? 'android' : /iphone|ios|app store/.test(d) ? 'ios' : /phone|installable/.test(d) ? 'install' : /zip/.test(d) ? 'zip' : /github|web/.test(d) ? 'pages' : '' }; }, ex: ['publish my site', 'make an Android app from this', 'put my game on itch'] });
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
  // Invite your agent (inviteagent.js): the person's own AI joins as a member. kind: which one, when they say.
  I('invite.agent', 'team', [/^(?:invite|bring in|bring over|bring)\s+(?:my\s+|our\s+|an?\s+|the\s+)?(?:own\s+)?(?:ai\s+)?(?<kind>claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed)(?:\s+(?:in|here|to .*|into .*))?$/,
    /^(?:invite|bring in|bring over|bring)\s+(?:my\s+|our\s+|an?\s+|the\s+)?(?:own\s+)?(?:ai\s+agent|agent|ai)(?:\s+(?:in|here|to .*|into .*))?$/, /^(?:add|connect)\s+(?:my|our)\s+(?:own\s+)?(?:ai\s+)?agent$/], { p: 0.97, ex: ['invite my agent', 'invite my cursor', 'invite my claude', 'bring in my codex'] });
  // Bring an AI helper: the same sheet answers "how do I add Cursor", "what can my AI do here" and "disconnect it".
  I('invite.agent', 'team', [/^how (?:do|can|would) (?:i|we) (?:add|connect|invite|bring in|bring|set up|setup|use|hook up)\s+(?:my\s+|our\s+|an?\s+)?(?:own\s+)?(?:ai\s+)?(?<kind>claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed)(?:\s+(?:here|to this|in here))?$/,
    /^how (?:do|can|would) (?:i|we) (?:add|connect|invite|bring in|bring|set up|setup|hook up)\s+(?:my\s+|our\s+|an?\s+)?(?:own\s+)?(?:ai helper|ai agent|ai|agent|helper)(?:\s+(?:here|to this|in here))?$/,
    /^(?:connect|bring|bring in|add)\s+(?:my\s+|our\s+|an?\s+)?(?:own\s+)?(?:ai helper|ai|helper)$/, /^bring an ai helper$/], { p: 0.98, ex: ['how do i add cursor', 'connect my ai', 'how do i connect my ai', 'bring an ai helper'] });
  I('agent.can', 'team', [/^what (?:can|may|could) (?:my|our|the|an?) (?:ai helper|ai agent|ai|agent|helper|claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed) (?:do|change|touch|see|read)(?:\s+(?:here|in here|in this project|in the app))?$/,
    /^what is (?:my|our|the) (?:ai helper|ai agent|ai|agent|helper|claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed) (?:allowed|able|permitted) to (?:do|change|touch|see)(?:\s+here)?$/,
    /^(?:change|set|choose|limit|narrow) what (?:my|our|the) (?:ai helper|ai agent|ai|agent|helper|claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed) (?:can|may) do$/], { p: 0.98, ex: ['what can my ai do here', 'what is my agent allowed to do', 'limit what my ai can do'] });
  I('agent.disconnect', 'team', [/^(?:disconnect|remove|unlink|kick out|take out|delete|get rid of|turn off|stop|pause)\s+(?:my|our|the)\s+(?:own\s+)?(?:ai helper|ai agent|ai|agent|helper|(?<kind>claude code|claude desktop|claude|cursor|codex|chatgpt|chat gpt|gemini cli|gemini|copilot|vs code|vscode|windsurf|cline|zed))$/,
    /^disconnect (?:it|my ai|the ai)$/, /^how do (?:i|we) (?:disconnect|remove|pause|stop) (?:it|my ai|my agent|my ai helper|the ai)$/], { p: 0.98, ex: ['disconnect my ai', 'disconnect it', 'remove my cursor', 'pause my agent'] });
  I('invite', 'team', [/^(?:invite|add)\s+(?:a\s+|my\s+|some\s+)?(?:friend|friends|people|someone|teammate|teammates|person|collaborator|member|members)(?:\s+.*)?$/, /^(?:share|send|get|copy|make|give me)\s+(?:the\s+|an?\s+|our\s+)?(?:invite|invite link|join link|link to join|tribe link)(?:\s+.*)?$/, /^invite\s+(?<who>[\p{L}][\p{L}'-]*)(?:\s+.*)?$/u, /^how do (?:i|we) (?:invite|add) (?:a\s+)?(?:friend|people|someone)s?$/], { ex: ['invite a friend', 'share the invite link', 'invite maya'] });
  I('host.start', 'team', [/^(?:start|begin|turn on)\s+(?:the\s+)?host(?:ing)?(?:\s+(?:here|on this computer))?$/, /^host(?:\s+(?:here|a tribe|on this computer|it))?$/, /^(?:host|run)\s+(?:the\s+)?(?:server|tribe)(?:\s+here)?$/], { ex: ['start hosting', 'host here'] });
  I('host.stop', 'team', [/^(?:stop|end|turn off|quit|shut down)\s+(?:the\s+)?(?:host|hosting|server|tribe server)$/], { ex: ['stop hosting'] });
  I('connect.ai', 'team', [/^(?:connect|hook up|link|set up|setup|add|plug in|install|bring in|attach)\s+(?:my\s+|an?\s+|the\s+)?(?:claude|claude code|codex|gemini|gemini cli|cursor|ai|agent|ai helper|coding agent|mcp|copilot|windsurf|aider)(?:\s+.*)?$/, /^(?:claude code|claude)$/], { ex: ['hook up claude code', 'add codex'] });
  I('brain.pick', 'team', [/^(?:give (?:flint|you) a brain|pick (?:flints |your |a )?(?:brain|model)|choose (?:flints |your |a )?(?:brain|model)|change (?:your |flints |the )?(?:brain|model)|use (?:a |the )?(?:local model|built in model|qwen|ollama|llama|gemini model|cloud model)|switch (?:the )?model|which model do you use)$/], { ex: ['give flint a brain', 'use the local model'] });
  I('helper.toggle', 'team', [/^(?:turn|switch)\s+(?<on>on|off)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)$/, /^(?:turn|switch)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)\s+(?<on>on|off)$/, /^(?<on>start|stop|enable|disable|pause|resume)\s+(?:the\s+)?(?<what>secretary|autopilot|auto pilot)$/, /^(?<what>secretary|autopilot)\s+(?<on>on|off)$/], { fill: (s, c, ctx, X) => ({ what: /secretary/.test(c) ? 'secretary' : 'autopilot', on: /^(on|start|enable|resume)$/.test(String((X && X.c.on) || s.on)) }), ex: ['turn on the secretary', 'autopilot off'] });
  I('jam.start', 'team', [/^(?:start|begin|kick off|run|do|launch|open|lets do)\s+(?:a\s+|the\s+|our\s+)?(?:game\s+)?jam(?:\s+session)?(?:\s+for\s+(?<mins>\d+)\s*(?:min|mins|minutes|hours?|h))?$/, /^jam\s+(?:time|now)$/], { ex: ['start a jam', 'kick off a jam for 60 minutes'] });
  I('huddle.start', 'team', [/^(?:start|join|open|begin|hop on|jump on|get on)\s+(?:a\s+|the\s+)?(?:huddle|voice chat|voice call|call|voice|audio call|voice room)$/, /^(?:huddle|lets talk|voice chat)$/], { ex: ['start a huddle', 'join the voice chat'] });
  I('huddle.leave', 'team', [/^(?:leave|end|hang up|exit|quit)\s+(?:the\s+)?(?:huddle|call|voice chat|voice call)$/, /^hang up$/], { ex: ['leave the huddle', 'hang up'] });
  // voice-video: the call stage, camera, screen, hand, ringing someone, the Secretary's no-AI summary
  I('call.video', 'team', [/^(?:start|turn on|switch on|open|begin)\s+(?:a\s+|my\s+|the\s+)?(?:video call|video chat|video|camera|webcam|cam)$/, /^(?:video call|facetime)$/, /^(?:turn off|stop|switch off|close)\s+(?:my\s+|the\s+)?(?:video|camera|webcam|cam)$/], { fill: (s, c) => ({ off: /^(?:turn off|stop|switch off|close)/.test(c) }), ex: ['start a video call', 'turn on my camera', 'turn off my camera'] });
  I('call.share', 'team', [/^(?:share|present|show)\s+(?:my\s+|the\s+|your\s+)?(?:screen|desktop|window)(?:\s+(?:with|to)\s+(?:everyone|the team|the call))?$/, /^(?:screen ?share|start screen ?sharing|stop sharing|stop screen ?sharing)$/], { fill: (s, c) => ({ off: /^stop/.test(c) }), ex: ['share my screen', 'stop sharing'] });
  I('call.present', 'team', [/^(?:present|show)\s+(?:tribecode|the app|this app)(?:\s+to\s+(?:everyone|the call|the team))?$/, /^(?:follow me|everyone follow me)$/], { ex: ['present tribecode', 'follow me'] });
  I('call.hand', 'team', [/^(?:raise|put up|lower|put down)\s+(?:my\s+)?hand$/, /^hand up$/], { fill: (s, c) => ({ down: /^(?:lower|put down)/.test(c) }), ex: ['raise my hand', 'lower my hand'] });
  I('call.mute', 'team', [/^(?:mute|unmute)(?:\s+(?:me|myself|my mic|the mic|my microphone))?$/, /^(?:deafen|undeafen)(?:\s+me)?$/], { fill: (s, c) => ({ what: /deafen/.test(c) ? 'deaf' : 'mute', on: !/^un/.test(c) }), ex: ['mute me', 'unmute', 'deafen'] });
  I('call.ring', 'team', [/^(?:call|ring|phone|video call)\s+(?<who>[\p{L}][\p{L}'-]*)(?:\s+(?:now|please))?$/u], { p: 0.94, req: { who: 'Who should I ring?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); return p && !p.all && !p.me ? { who: p } : null; }, ex: ['call maya', 'ring sam'] });
  I('call.stage', 'team', [/^(?:open|show|go to|back to)\s+(?:the\s+)?(?:call|huddle|call screen|video)$/, /^(?:call history|show call history|past calls|recent calls)$/], { fill: (s, c) => ({ history: /history|past|recent/.test(c) }), ex: ['open the call', 'call history'] });
  I('secretary.summary', 'team', [/^(?:summari[sz]e|recap|sum up)\s+(?:my\s+|our\s+|the\s+|todays?\s+|today'?s\s+)?(?:notes|meeting|call|huddle|day|chat|voice notes|talk|conversation)(?:\s+(?:today|so far))?$/, /^(?:what did we (?:decide|agree)(?: on)?(?: today)?|whats? (?:are )?(?:the |our )?action items|action items|what are my action items|meeting notes|todays? notes)$/], { ex: ['summarize my notes', 'what did we decide today', 'action items'] });
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
  I('calc', 'local', [/^(?:what is|whats|calculate|compute|how much is|solve)?\s*(?<expr>\d+(?:\.\d+)?(?:\s+(?:times|multiplied by|plus|minus|divided by|over)\s+\d+(?:\.\d+)?)+)\s*$/], { p: 0.97, fill: (s, c) => calcFill(s) });
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
  // v0.32: GitHub (ghphone.js on a phone-only tribe, Home › Code's Connect GitHub panel elsewhere)
  I('github.connect', 'team', [/^(?:connect|link|hook up|set up|setup|sign in to|log in to|login to|add|use)\s+(?:my\s+|a\s+|the\s+)?github(?:\s+(?:account|repo|repository))?(?:\s+(?:here|on this phone|from my phone))?$/, /^(?:push|sync|send)\s+(?:this|it|my code|the code|my project|the project)?\s*(?:to|with)\s+github$/, /^(?:import|bring in|pull in|clone)\s+(?:a|my|the)?\s*(?:github\s+)?(?:repo|repository)(?:\s+from github)?$/], { p: 0.97, ex: ['connect github', 'push this to github', 'import a repo from github'] });
  // feat/company-gigs: a gig you post for yourself, and finding people by skill (abilities.js runs them)
  I('gig.self', 'work', [/^(?:post|create|make|put up|add|list|start|set up|write)\s+(?:a\s+|an\s+|my\s+)?(?:gig|offer|service)(?:\s+for\s+(?:me|myself))?(?:\s+(?:that|saying|called|about|to))?(?:\s+(?<what>.+))?$/, /^(?:offer|advertise)\s+(?:my\s+)?(?:skills|services|help)(?:\s+(?:as|for|doing)\s+(?<what>.+))?$/, /^(?:i can|i will|ill|i could)\s+(?<what>.+?)\s+(?:for (?:people|anyone|friends|the tribe|others)|as a gig)$/], { p: 0.97, ex: ['post a gig for me: I\'ll design your logo', 'offer my skills'] });
  I('people.find', 'work', [/^(?:find|get|look for|search for|i need|we need|is there|who is|whos|anyone|someone)\s+(?:me\s+|us\s+)?(?:someone|somebody|anyone|a person|people|a friend|folks)?\s*(?:who|that|to)\s+(?:can|could|knows how to|is good at|does)\s+(?<skill>.+)$/, /^(?:find|get|look for|search for|i need|we need|hire)\s+(?:me\s+|us\s+)?(?:someone|somebody|a person|a friend|an? (?:artist|designer|musician|coder|developer|writer|animator|helper))\s+(?:to|who will|wholl|that will|for)\s+(?<skill>.+)$/, /^(?:who|anyone)\s+(?:here\s+)?(?:can|knows how to|is good at)\s+(?<skill>.+)$/, /^(?:find|show)\s+(?:me\s+)?(?:people|someone)\s+(?:with|good at|for)\s+(?<skill>.+)$/, /^find people$/], { p: 0.97, ex: ['find someone who can draw', 'who can do pixel art'] });
  // feat/presence: where everyone is (app/ui/peoplepanel.js answers)
  I('people.where', 'people', [/^(?:where is|where are|find|locate|where did)\s+(?<who>[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)(?:\s+(?:go|at|right now|right|now|working|hanging out|in the app))?$/u, /^(?:what is|what are)\s+(?<who>[\p{L}][\p{L}'-]*)\s+(?:doing|up to|working on)(?:\s+(?:right now|right|now))?$/u, /^(?:is)\s+(?<who>[\p{L}][\p{L}'-]*)\s+(?:online|here|around|on)(?:\s+(?:right now|right|now))?$/u], { p: 0.98, req: { who: 'Who?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); if (!p || p.all || p.me) return null; return { who: p }; }, ex: ['where is maya', 'what is sam doing'] });
  I('people.online', 'people', [/^(?:who is|who are|whos|anyone|anybody|is anyone|is anybody|who else is)\s+(?:online|on|here|around|active|on right now|in the tribe right now)(?:\s+(?:right now|right|now|today))?$/, /^(?:show|list|see)\s+(?:me\s+)?(?:who is|whos|everyone|people|the people|everybody)\s+(?:online|here|around)(?:\s+(?:right now|right|now))?$/, /^(?:who is online|online people|people online|whos online)$/], { p: 0.96, ex: ["who's online", 'is anyone around'] });
  I('people.working', 'people', [/^(?:who is|whos|is anyone|anyone|is anybody|who else is|who are)\s+(?:working on|editing|building|in|looking at|doing|on)\s+(?<what>.+)$/, /^(?:who is|whos)\s+(?:in charge of|handling)\s+(?<what>.+)$/], { p: 0.96, ex: ["who's working on the website", 'is anyone editing the launch plan'] });
  // ---------- v0.31 features (feat/flint-cleanup): task offers, the Design flow, abilities, the Marketplace's Installed tab,
  // Files by kind, the demo, presence privacy, the sidebar order ----------
  const YES = '(?:(?:ok|okay|yes|yeah|yep|sure|fine|alright|deal)\\s*,?\\s+)';
  I('task.accept', 'tasks', [new RegExp(`^(?:accept|i accept|approve the assignment of|agree to do|agree to take)\\s+(?:the\\s+)?(?:task\\s+)?(?<ref>.+)$`), new RegExp(`^${YES}(?:i\\s+(?:will|can|ll)\\s+|ill\\s+|i\\s+)?(?:do|take|handle|own)\\s+(?:the\\s+)?(?:task\\s+)?(?<ref>.+)$`)], { p: 0.97, req: { ref: 'Which task are you accepting?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['accept the logo task', 'ok i will do the menu bug'] });
  I('task.decline', 'tasks', [/^(?:decline|turn down|reject|refuse|pass on|say no to|skip)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+?)(?:\s*,?\s*(?:i am |im )?(?:too busy|busy|no time|sorry|not this week|this week)(?:\s+.*)?)?$/, /^(?:i|we)\s+(?:can not|cannot|could not|wont|will not)\s+(?:do|take|handle|get to)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+?)(?:\s+(?:this week|today|right now|now|sorry|in time))*$/], { p: 0.97, req: { ref: 'Which task are you declining?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['decline the trailer task', 'i cant do the logo task this week'] });
  I('task.claim', 'tasks', [/^(?:claim|grab|pick up|take)\s+(?:an?\s+|any\s+|the\s+next\s+|some\s+)?(?:open|free|unclaimed|unassigned|available)\s+(?:task|one|item)$/, /^(?:give me|find me|i want|i need)\s+(?:something|a task|some work|work)\s+(?:to (?:work on|do)|to pick up)$/, /^(?:what can i (?:take|claim))$/, /^claim\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/], { p: 0.97, fill: (s, c, ctx) => (s.ref ? refFill(s, ctx) : { next: true }), ex: ['claim the jump bug', 'grab an open task', 'give me something to work on'] });
  I('task.unassigned', 'tasks', [/^(?:show|list|what are|which are|see)\s+(?:me\s+)?(?:the\s+)?tasks\s+(?:nobody|no one|noone)\s+(?:has|owns|took|is on)$/, /^(?:tasks|what)\s+(?:with\s+)?(?:no|without an?)\s+(?:owner|one assigned|assignee)$/], { p: 0.97, ex: ['show the tasks nobody has'] });
  I('task.assign', 'tasks', [/^(?<who>[\p{L}][\p{L}'-]*)\s+(?:should|can|could|will|is going to)\s+(?:do|take|handle|own|work on)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/u], { p: 0.94, req: { ref: 'Which task?', who: 'Who should do it?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); if (!p || p.all || p.me) return null; const r = refFill(s, ctx); return r ? { ...r, who: p } : null; }, ex: ['sam should do the trailer'] });
  const DKIND = [['poster', 'poster|posters|flyer|flier|flyers|social post|instagram post|insta post|instagram post graphic|post graphic|graphic|banner|thumbnail|story graphic|announcement graphic|invite card'], ['logo', 'logo|logos|brand kit|brand|wordmark|icon for the app|app icon'],
    ['screen', 'app screen|screen|ui mockup|mockup|wireframe|ui|interface'], ['app', 'mobile app|app|web app|phone app'], ['game', 'game|video game'], ['whiteboard', 'whiteboard|white board|moodboard|mood board']];
  for (const [k, w] of DKIND) I('design.new', 'design', [new RegExp(`^(?:make|design|create|draw|start|sketch|mock up|i need|we need|i want|give me|do|start designing|new|begin)\\s+(?:me\\s+|us\\s+)?(?:a\\s+|an\\s+|the\\s+|our\\s+|my\\s+|some\\s+)?(?:new\\s+|quick\\s+|simple\\s+|cool\\s+|nice\\s+)?(?:design\\s+(?:for\\s+(?:an?\\s+)?)?)?(?:${w})(?:\\s+design)?(?:\\s+(?:for|about|called|named|of|with)\\s+(?<topic>.+))?$`),
    new RegExp(`^(?:start\\s+)?designing\\s+(?:a\\s+|an\\s+|the\\s+|our\\s+)?(?:${w})(?:\\s+(?:for|about)\\s+(?<topic>.+))?$`), new RegExp(`^(?:start|begin|make|open)\\s+(?:a\\s+)?new\\s+design\\s+(?:for|of)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:${w})(?:\\s+(?:for|about)\\s+(?<topic>.+))?$`)],
    { p: k === 'app' || k === 'game' ? 0.9 : 0.96, fill: (s, c, ctx) => (ctx && ctx.view === 'canvas' && (k === 'screen' || /\b(?:called|named)\b/.test(c)) ? null : { kind: k, topic: s.topic || '' }), ex: [`make a ${w.split('|')[0]}`, `design a ${w.split('|')[0]} for ember socks`] });
  I('nav.design', 'nav', [/^(?:open|show|go to|take me to)\s+(?:the\s+)?design\s+(?:flow|start|gallery|kinds|picker)$/], { p: 0.95, label: 'Design' });
  I('nav.whiteboard', 'nav', [/^(?:new|blank|empty|start a|start a new|make a|open a new)\s+(?:white\s?board|sticky notes board)$/], { p: 0.97, label: 'Whiteboard' });
  I('abilities.edit', 'work', [/^(?:add|put|list)\s+(?<skill>.+?)\s+(?:to|on|in)\s+(?:my\s+)?(?:skills|abilities|profile skills|skill list)$/, /^(?:edit|update|change|open|show|set up|setup|fill in)\s+(?:my\s+)?(?:skills|abilities|work profile|skill list)$/, /^(?:list|show|add|say)\s+what\s+(?:i am|i'm|im)\s+good at$/, /^(?:i am|im)\s+good at\s+(?<skill>.+)$/, /^my\s+(?:skills|abilities)$/], { p: 0.96, ex: ['add drawing to my skills', 'edit my abilities'] });
  I('gig.self', 'work', [/^(?:offer|sell|advertise)\s+(?:my\s+)?(?<what>.+?)\s+(?:as\s+a\s+)?(?:gig|service)$/, /^(?:i can|i could)\s+(?<what>.+?)\s+for\s+(?:people|anyone|others|friends|money|hire)$/], { p: 0.97, ex: ['offer my logo design as a gig'] });
  I('nav.company', 'nav', [/^(?:open|show|go to)\s+(?:the\s+|our\s+|my\s+)?company\s+(?:dashboard|report|overview|page)$/, /^(?:turn|make)\s+(?:this|the|our|my)\s+(?:project\s+)?(?:into\s+)?a\s+company$/, /^(?:find|browse|show|see)\s+(?:some\s+)?(?:gigs|work|jobs)$/], { p: 0.95, label: 'Company' });
  I('nav.money', 'nav', [/^how much (?:did|have) (?:we|i) (?:make|made|earn|earned|spend|spent)(?:\s+(?:this|last)\s+(?:month|week|year))?$/, /^(?:what are|show)\s+(?:our|my)\s+(?:revenue|earnings|costs|sales)(?:\s+.*)?$/], { p: 0.95, label: 'Money' });
  I('market.installed', 'market', [/^(?:what have|what did) (?:i|we) (?:installed|added|install|add)(?:\s+from the marketplace)?$/, /^(?:show|open|see|list)\s+(?:me\s+)?(?:my\s+|the\s+|our\s+)?(?:installed|added)\s*(?:stuff|things|items|widgets|tools|add ons|addons|plugins)?$/, /^(?:my\s+)?installed\s+(?:stuff|items|widgets|tools|plugins)$/], { p: 0.96, ex: ['what have i installed', 'show my installed stuff'] });
  I('market.remove', 'market', [/^(?:uninstall|remove|delete|get rid of)\s+(?:the\s+)?(?<name>.+?)\s+(?:widget|plugin|add on|addon|skill|extension|pack|asset pack|connector)$/, /^uninstall\s+(?:the\s+)?(?<name>.+)$/], { p: 0.95, req: { name: 'Which one should I remove?' }, ex: ['remove the confetti widget', 'uninstall the timer widget'] });
  const FCAT = [['pics', 'pictures|pics|photos|images|screenshots'], ['media', 'videos|video|audio|recordings|sounds|music files'], ['docs', 'docs|documents'], ['sheets', 'sheets|spreadsheets'], ['slides', 'slides|decks'], ['designs', 'designs|whiteboards'], ['sites', 'websites|sites'], ['code', 'code files']];
  for (const [k, w] of FCAT) I('nav.files', 'nav', [new RegExp(`^(?:show|open|see|list|find|where are)\\s+(?:me\\s+)?(?:all\\s+)?(?:of\\s+)?(?:the\\s+|my\\s+|our\\s+)?(?:${w})(?:\\s+(?:in files|files))?$`)], { p: 0.95, fill: () => ({ cat: k }), label: 'Files' });
  I('doc.open', 'docs', [/^(?:open|show|pull up|read)\s+(?:the\s+|our\s+)?(?<name>readme|vision|changelog|license|contributing guide|roadmap)$/], { p: 0.95, ex: ['open the readme'] });
  I('demo.start', 'team', [/^(?:start|play|run|watch|open|try|begin|launch|show me)\s+(?:the\s+|a\s+)?demo(?:\s+tribe|\s+tour|\s+mode)?$/, /^demo(?:\s+mode)?$/], { p: 0.97, ex: ['start the demo', 'play the demo'] });
  I('premium.open', 'team', [/^(?:how many|how much)\s+(?:ai\s+)?credits\s+(?:do i have|have i got|are left|do we have|left)$/, /^(?:see|show|open|compare)\s+(?:the\s+|our\s+)?(?:plans|pricing|plans and credits|credits)$/, /^my\s+(?:ai\s+)?credits$/], { p: 0.96, ex: ['how many credits do i have', 'see the plans'] });
  I('brain.pick', 'team', [/^(?:turn on|enable|start|use|load|switch on)\s+(?:the\s+)?(?:built in|builtin|local|browser|on device)\s+(?:brain|model|ai)$/], { p: 0.96, ex: ['turn on the built in brain'] });
  I('presence.off', 'look', [/^(?:stop|quit|do not keep|dont keep)\s+(?:showing|sharing|telling people)\s+where\s+(?:i am|im)$/, /^(?:hide|stop sharing|turn off|disable)\s+(?:my\s+)?(?:location|presence|where i am|status|place)(?:\s+(?:from|for)\s+(?:others|everyone|people|the tribe))?$/, /^(?:go|appear|be)\s+(?:invisible|hidden)$/], { p: 0.96, ex: ['stop showing where i am', 'go invisible'] });
  I('presence.on', 'look', [/^(?:show|share|start showing|turn on)\s+(?:my\s+)?(?:location|presence|where i am|status)(?:\s+(?:again|to others|to everyone))?$/, /^(?:appear|go|be)\s+(?:online|visible)(?:\s+again)?$/], { p: 0.96, ex: ['show where i am again'] });
  I('sidebar.reset', 'look', [/^(?:reset|restore|undo)\s+(?:the\s+|my\s+)?(?:sidebar|left bar|rail)(?:\s+(?:order|layout|rows))?(?:\s+to\s+(?:default|normal))?$/, /^(?:put|set)\s+(?:the\s+)?sidebar\s+back(?:\s+to\s+(?:default|normal))?$/], { p: 0.97, ex: ['reset the sidebar order'] });
  I('nav.settings', 'nav', [/^(?:turn off|mute|silence|disable|stop|turn on|enable)\s+(?:the\s+|all\s+|my\s+)?(?:notifications|alerts|push notifications|sounds)$/], { p: 0.94, fill: () => ({ section: 'notifications' }), label: 'Settings' });
  I('preview.edit', 'preview', [/^(?:let me|i want to|i wanna)\s+(?:click|tap)\s+(?:to|and)\s+edit$/, /^(?:click to edit|tap to edit)$/], { p: 0.95 });
  I('people.online', 'people', [/^(?:show|see|list)\s+(?:the\s+)?(?:people|everyone|everybody|members|the tribe)$/], { p: 0.95 });
  I('people.find', 'work', [/^(?:find|get|look for)\s+(?:me\s+)?(?:someone|somebody|anyone|a person)\s+(?:who|that)\s+(?:knows|knows about|can use|is into|does)\s+(?<skill>.+)$/, /^(?:is\s+)?(?:anyone|anybody|someone)\s+(?:here\s+|around\s+)?(?:good at|great at|into|who knows|that knows)\s+(?<skill>.+)$/, /^who\s+(?:here\s+)?(?:can|knows how to|is good at)\s+(?<skill>.+)$/], { p: 0.96, ex: ['find someone who knows blender', 'who can draw pixel art'] });
  I('dm.open', 'chat', [/^(?:message|dm|text|ping|chat with|open a chat with)\s+(?<who>[\p{L}][\p{L}'-]*)$/u], { p: 0.95, req: { who: 'With whom?' }, fill: (s, c, ctx) => { const p = person(s.who, ctx); return p && !p.all && !p.me ? { who: p } : null; } });
  I('jam.start', 'team', [/^(?:jam mode|game jam mode|start jam mode|jam mode on)$/], { p: 0.95 });
  I('canvas.rename', 'canvas', [/^(?:rename|name|label)\s+(?:the\s+|all\s+|my\s+|these\s+)?layers\s+(?:properly|correctly|better|right|nicely|for me)$/], { p: 0.95 });
  // "remind the team to playtest on saturday": a reminder with a day is a calendar event, not a chat line
  I('event.add', 'calendar', [/^remind\s+(?:the team|team|everyone|everybody|us|the tribe|all of us)\s+(?:to|about|of)\s+(?<what>.+)$/], { p: 0.97, fill: (s, c, ctx, X) => { const cw = cutWhen(s, 'what', ctx, X); if (!cw.w || !cw.w.date) return null; return { what: cw.text || s.what, date: cw.w.date, time: cw.w.time }; } });
  I('canvas.pricing', 'canvas', [/^(?:an?\s+)?pricing\s+page(?:\s+for\s+(?<name>.+))?$/], { p: 0.95, ctx: x => x && x.view === 'canvas', fill: buildFill });
  I('site.starter-dashboard', 'build', [/^(?:an?\s+|quick\s+|simple\s+|little\s+)*(?:budget|expense|stats|sales|admin|analytics)\s+dashboard(?:\s+(?:please|for me|app))?$/], { p: 0.94, fill: buildFill, label: 'dashboard' });

  // feat/flint-unify: more everyday commands anywhere (app/ui/flintcmds.js runs them)
  const TUNIT = '(?<u>seconds?|secs?|minutes?|mins?|min|hours?|hrs?|h|m|s)';
  I('timer', 'local', [new RegExp(`^(?:set|start|put on|run|make)\\s+(?:me\\s+)?(?:a\\s+|an\\s+)?(?:(?<n>\\d+)\\s*${TUNIT}\\s+)?timer(?:\\s+for\\s+(?<n2>\\d+)\\s*(?<u2>seconds?|secs?|minutes?|mins?|min|hours?|hrs?|h|m|s))?(?:\\s+(?:for|to|called)\\s+(?<what>.+))?$`),
    new RegExp(`^(?:timer|countdown)\\s+(?:for\\s+)?(?<n>\\d+)\\s*${TUNIT}$`), new RegExp(`^(?:remind|ping|nudge|tell)\\s+me\\s+in\\s+(?<n>\\d+)\\s*${TUNIT}(?:\\s+(?:to|about|that)\\s+(?<what>.+))?$`)],
    { req: { n: 'For how long?' }, fill: s => { const n = +(s.n || s.n2 || 0), u = String(s.u || s.u2 || 'm').toLowerCase(); if (!n && (s.n || s.n2)) return null; return { n: n || '', secs: n * (/^h/.test(u) ? 3600 : /^s/.test(u) ? 1 : 60), what: s.what || '' }; }, ex: ['set a timer for 10 minutes', 'remind me in 5 minutes to stretch', 'timer 25 min'] });
  I('settings.motion', 'look', [/^(?:turn|switch)\s+(?<on>on|off)\s+(?:the\s+|all\s+)?(?:animations?|motion|transitions|movement|effects)$/, /^(?:turn|switch)\s+(?:the\s+|all\s+)?(?:animations?|motion|transitions)\s+(?<on>on|off)$/, /^(?:reduce|less|no|stop|disable|kill|calm down|tone down|cut)\s+(?:all\s+)?(?:the\s+)?(?:motion|animations?|transitions|movement|moving stuff|effects)$/, /^(?:reduced motion|reduce motion)(?:\s+(?<on>on|off))?$/, /^(?<en>enable|bring back|restore|allow)\s+(?:the\s+)?(?:animations?|motion|transitions)$/, /^(?:animations? (?:are )?(?:too much|annoying|distracting|make me (?:dizzy|sick)))$/],
    { fill: (s, c) => ({ on: s.on === 'on' || !!s.en || (s.on !== 'off' && !/\boff\b|\breduce|\bless\b|\bno\b|\bstop|\bdisable|\bkill|\bcalm|\btone|\bcut|too much|annoying|distracting|dizzy|sick/.test(c)) }), ex: ['turn off animations', 'reduce motion', 'bring back animations'] });
  I('settings.notify', 'team', [/^(?<off>mute|silence|turn off|disable|stop|pause|snooze|hush|quiet)\s+(?:all\s+|the\s+|my\s+)?(?:notifications|notification|notifs|alerts|pings|push notifications|buzzing)(?:\s+(?:for (?:now|a while|today)))?$/, /^(?:turn|switch)\s+(?:the\s+|my\s+)?(?:notifications|notifs|alerts|pings)\s+(?<on>on|off)$/, /^(?<on2>unmute|turn on|enable|resume|start)\s+(?:the\s+|my\s+)?(?:notifications|notification|notifs|alerts|pings|push notifications)$/, /^(?:do not disturb|dnd)(?:\s+(?<on3>on|off))?$/, /^(?:stop|no more)\s+(?:the\s+)?(?:pings|buzzing)$/],
    { fill: (s, c) => ({ on: !!s.on2 || s.on === 'on' || s.on3 === 'off' }), ex: ['mute notifications', 'turn on notifications', 'do not disturb'] });
  I('settings.away', 'people', [/^(?:appear|go|set (?:me|my status) (?:to|as)?|mark me(?: as)?|show me as|i am|im)\s+(?<st>away|offline|invisible|online|back|available|here|around|busy|afk)$/, /^(?<st2>afk|brb|going afk|be right back|back online)$/, /^(?<hide>hide|stop showing)\s+where i am$/, /^(?<show>show|share)\s+where i am$/],
    { fill: (s, c) => { const st = String(s.st || s.st2 || '').toLowerCase(); if (s.hide) return { show: false }; if (s.show) return { show: true }; return { away: /away|offline|invisible|busy|afk|brb|be right back/.test(st) && !/back online/.test(st) }; }, ex: ['appear away', "i'm back", 'hide where i am'] });
  I('chat.pin', 'chat', [/^(?<un>un)?pin\s+(?:the\s+|that\s+|this\s+|my\s+)?(?:last\s+|latest\s+|previous\s+|newest\s+|most recent\s+)?(?:message|msg|post|one)?(?:\s+in\s+(?:the\s+)?chat)?$/, /^(?<un2>un)?pin\s+(?:it|that)$/], { fill: (s, c) => ({ on: !s.un && !s.un2 }), ex: ['pin the last message', 'unpin that'] });
  const EMO = { 'thumbs up': '👍', thumbsup: '👍', like: '👍', heart: '❤️', love: '❤️', laugh: '😂', lol: '😂', haha: '😂', fire: '🔥', tada: '🎉', party: '🎉', celebrate: '🎉', clap: '👏', eyes: '👀', check: '✅', tick: '✅', 'check mark': '✅', rocket: '🚀', '100': '💯', pray: '🙏', thanks: '🙏', wow: '😮', sad: '😢', pin: '📌' };
  I('chat.react', 'chat', [new RegExp(`^(?:react|respond)\\s+(?:with\\s+)?(?:an?\\s+)?(?<e>${Object.keys(EMO).join('|')})(?:\\s+(?:emoji|reaction))?(?:\\s+(?:to|on)\\s+(?:the\\s+|that\\s+|this\\s+)?(?:last\\s+|latest\\s+)?(?:message|msg|post|one))?$`), new RegExp(`^(?:give|put|add|leave|drop)\\s+(?:an?\\s+)?(?<e>${Object.keys(EMO).join('|')})(?:\\s+(?:emoji|reaction))?\\s+(?:on|to)\\s+(?:the\\s+|that\\s+)?(?:last\\s+|latest\\s+)?(?:message|msg|post|one)$`), /^(?<e>like|heart|love)\s+(?:the\s+|that\s+)?(?:last\s+|latest\s+)?(?:message|msg|post)$/],
    { fill: s => ({ emoji: EMO[String(s.e).toLowerCase()] || '👍' }), ex: ['react thumbs up to the last message', 'heart the last message', 'like that message'] });
  I('task.reopen', 'tasks', [/^(?:reopen|re open|unfinish|undo done on|uncheck|un check|un complete|uncomplete)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/, /^(?:mark|set|move|put)\s+(?<ref>.+?)\s+(?:as\s+)?(?:not done|undone|open again|incomplete|unfinished|back to (?:to do|todo|open|the backlog|backlog))$/, /^(?<ref>.+?)\s+(?:is not|isnt|is not actually|wasnt|was not)\s+(?:done|finished)(?:\s+yet)?$/], { p: 0.97, req: { ref: 'Which task?' }, fill: (s, c, ctx) => refFill(s, ctx), ex: ['reopen the logo task', 'mark buy milk as not done', 'the menu task is not done'] });
  I('task.unassign', 'tasks', [/^(?:unassign|un assign|take (?:me|myself) off|remove (?:me|myself|the assignee|the owner) from|drop)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/, /^(?:nobody|no one)\s+(?:owns|has)\s+(?<ref>.+)$/], { p: 0.92, req: { ref: 'Which task?' }, fill: (s, c, ctx) => { if (/^(?:the\s+)?(?:call|meeting|huddle|ball)$/.test(String(s.ref))) return null; return refFill(s, ctx); }, ex: ['unassign the logo task', 'take me off the menu task'] });
  I('task.priority', 'tasks', [/^(?:make|mark|set|flag|bump|tag)\s+(?<ref>.+?)\s+(?:as\s+|to\s+)?(?<lvl>urgent|high priority|top priority|important|a priority|priority one|p1|low priority|not urgent|normal priority|p3)$/, /^(?<lvl>prioriti[sz]e|deprioriti[sz]e)\s+(?:the\s+)?(?:task\s+)?(?<ref>.+)$/],
    { req: { ref: 'Which task?' }, fill: (s, c, ctx) => { const r = refFill(s, ctx); if (!r) return null; return { ...r, level: /low|not urgent|normal|p3|depriorit/.test(String(s.lvl)) ? 'low' : 'high' }; }, ex: ['make the logo task urgent', 'prioritize buy milk', 'mark the menu task low priority'] });
  I('file.whiteboard', 'docs', [/^(?:new|start|create|make|open|give me|draw on)\s+(?:a\s+|an\s+)?(?:fresh\s+|new\s+|blank\s+|empty\s+|clean\s+)+(?:whiteboard|white board|drawing board|sketch board)$/, /^(?:new|start|create|make)\s+(?:a\s+)?(?:whiteboard|white board)(?:\s+(?:called|named|for)\s+(?<name>.+))?$/, /^(?:lets|let us)\s+(?:sketch|draw|whiteboard)(?:\s+(?:it|this|something))?(?:\s+out)?$/], { ex: ['start a fresh whiteboard', 'new whiteboard', 'lets sketch it out'] });
  I('flint.clear', 'local', [/^(?:clear|wipe|reset|empty|clean)\s+(?:out\s+)?(?:our|the|this|my|your)?\s*(?:chat|thread|conversation|history|messages)(?:\s+(?:with you|with flint))?(?:\s+flint)?$/, /^(?:clear|reset)\s+flint(?:s chat)?$/, /^(?:start (?:over|fresh|a new chat)|new conversation|fresh start)$/], { ex: ['clear our chat', 'start over', 'reset flint'] });
  I('doc.template', 'docs', [/^(?:new|start|make|create|write|open|use|draft)\s+(?:a\s+|an\s+|the\s+)?(?:doc\s+|page\s+)?(?:from|with|using|off)\s+(?:the\s+|a\s+|our\s+)?(?<tpl>.+?)\s+template$/, /^(?:use|open|pick|start|fill in|fill out)\s+(?:the\s+|a\s+|our\s+)(?<tpl>.+?)\s+template$/, /^(?:show|open|browse|see)\s+(?:the\s+|all\s+|my\s+)?(?:doc\s+|company\s+)?templates(?<tpl>)$/],
    { p: 0.94, fill: (s, c) => (/\b(?:website|site|landing)\b/.test(String(s.tpl)) ? null : { tpl: String(s.tpl || '').trim() }), ex: ['new doc from the meeting notes template', 'use the nda template', 'open the doc templates'] });
  I('market.add', 'market', [/^(?:add|install|get|use|grab)\s+(?<name>.+?)\s+(?:from|off|via|through)\s+(?:the\s+)?(?:marketplace|market|store|catalog)$/, /^(?:add|install)\s+(?:the\s+)?(?<name>.+?)\s+(?:plugin|extension|add on|addon|integration|mcp server|mcp)$/], { ex: ['add three js from the marketplace', 'install the github mcp'] });
  I('inspo.search', 'market', [/^(?:find|search|look for|get|show me|give me|pull up|collect)\s+(?:me\s+)?(?:some\s+)?(?:inspiration|inspo|references|reference pictures|reference images|mood pictures|moodboard pictures|ideas pictures)\s+(?:for|of|about|on|with)\s+(?<q>.+)$/, /^(?:inspiration|inspo)\s+(?:for|of)\s+(?<q>.+)$/, /^(?:add|pin|put)\s+(?<q>.+?)\s+(?:to|on)\s+(?:my\s+|the\s+)?(?:inspiration board|inspo board|moodboard|mood board|board)$/], { ex: ['find inspiration for a cozy cafe', 'inspo for neon arcade'] });
  I('nav.people', 'nav', [/^(?:open|show|show me|see|who is in|whos in|list)\s+(?:the\s+)?(?:people|people panel|everyone|members|the tribe|my tribe|friends|my friends|teammates|the team)(?:\s+(?:panel|list|here))?$/, /^(?:people|people panel|members list)$/], { p: 0.92, label: 'People', ex: ['open the people panel', 'show me everyone'] });
  I('nav.work', 'nav', [/^(?:open|show|show me|go to|see|browse|find)\s+(?:the\s+|my\s+|some\s+)?(?:work|gigs|gig board|work board|jobs|odd jobs|time bank)(?:\s+(?:page|board|tab))?$/, /^(?:any|are there any)\s+(?:gigs|jobs|work)(?:\s+(?:for me|going|open))?$/, /^(?:find|get)\s+(?:me\s+)?(?:a\s+)?(?:gig|job)$/], { p: 0.92, label: 'Work', ex: ['open work', 'any gigs for me', 'find me a gig'] });
  I('checks.run', 'preview', [/^(?:run|start|do|kick off)\s+(?:the\s+|our\s+|my\s+)?(?:checks?|tests?|build checks?|test suite)(?:\s+(?:now|again|please))?$/, /^(?:check|test)\s+the\s+build$/, /^(?:is|are)\s+the\s+(?:build|checks?|tests?)\s+(?:passing|failing|green|red|ok|okay|broken)$/, /^(?:build|checks?)\s+status$/], { p: 0.93, ex: ['run the checks', 'run the tests', 'is the build passing'] });
  I('preview.open', 'preview', [/^(?:open|show|launch|start|run)\s+(?:the\s+)?(?:live\s+)?preview$/, /^(?:preview|test|try|play)\s+(?:it|the (?:app|game|site)|my (?:app|game|site)|our (?:app|game|site))$/, /^(?:let me see it|show me the app|run the app|run it)$/], { p: 0.93, ex: ['open the preview', 'run the app', 'try the game'] });
  I('preview.share', 'preview', [/^(?:copy|share|get|send|give me)\s+(?:a\s+|the\s+)?(?:preview|play|test|demo)\s+link$/, /^(?:share|send)\s+(?:the\s+)?(?:preview|demo)\s+(?:with|to)\s+(?:a\s+friend|friends|someone|the team)$/], { ex: ['copy the preview link', 'share the demo with a friend'] });
  I('settings.sound', 'look', [/^(?:turn|switch)\s+(?<on>on|off)\s+(?:the\s+|all\s+)?(?:sounds?|sound effects|ui sounds|clicks)$/, /^(?<off>mute|silence)\s+(?:the\s+|all\s+)?(?:sounds?|sound effects|ui sounds|app sounds)$/, /^(?<on2>unmute)\s+(?:the\s+)?(?:sounds?|app)$/], { fill: s => ({ on: s.on === 'on' || !!s.on2 }), ex: ['turn off sounds', 'mute sound effects'] });


  // ---------- websites and the design canvas: meaning, not just commands (feat/flint-site) ----------
  // design(c, raw, ctx) reads what people mean about a site or a design: wire buttons, pages, images, dark mode, blocks,
  // layouts, words, export; a template from what the site is FOR ("something for my band"); a lesson ("teach me tasks").
  // ctx.view 'site' (the website designer, or the preview in Website mode with ctx.site) or 'canvas' picks the intent
  // family (site.* or canvas.*). Everywhere else only templates, "open the designer" and lessons are read here.
  const TPL_TAGS = {
    linkbio: ['link in bio', 'linkinbio', 'link tree', 'linktree', 'bio link', 'bio links', 'links page', 'link page', 'all my links', 'one link', 'instagram bio', 'insta bio', 'tiktok bio', 'my links', 'link for my instagram', 'for my insta', 'for my tiktok', 'link pages', 'links pages', 'all my socials', 'my socials', 'socials page', 'link page for my bio', 'my bio', 'link hub', 'social links'],
    band: ['band', 'jazz', 'trio', 'quartet', 'choir', 'orchestra', 'rock band', 'punk', 'hip hop', 'producer', 'my music', 'our music', 'my songs', 'musician', 'dj gigs', 'dj', 'gigs', 'tour dates', 'my album', 'singer', 'rapper', 'concerts'],
    cafe: ['sourdough', 'bar', 'pub', 'tacos', 'ramen', 'catering', 'bakery', 'cafe', 'coffee shop', 'coffee', 'restaurant', 'food truck', 'diner', 'pizza place', 'pizza', 'bistro', 'brunch', 'menu page', 'with the menu'],
    merch: ['band merch', 'zines', 'stickers', 'handmade', 'jewelry', 'ceramics', 'sell my', 'sell our', 'merch', 'online store', 'online shop', 'shop page', 'store', 'sell', 'ecommerce', 'e commerce', 'webshop', 'storefront', 't shirts', 'candles'],
    portfolio: ['illustration', 'ux work', 'my ux', 'architecture', 'portfolio', 'design work', 'case studies', 'case study', 'show off my', 'my work'],
    creator: ['tiktok creator', 'creator brand', 'twitch', 'stream on', 'streamer', 'streaming', 'youtuber', 'youtube channel', 'creator'],
    service: ['yoga', 'pilates', 'fitness', 'personal trainer', 'gym', 'tutor', 'tutoring', 'classes', 'coaching', 'coach', 'therapist', 'massage', 'dentist', 'dog walking', 'dog grooming', 'nail', 'tattoo', 'consulting', 'lawyer', 'accountant', 'bookings', 'plumbing', 'plumber', 'hair salon', 'salon', 'barber', 'cleaning company', 'cleaning', 'handyman', 'local business', 'small business', 'electrician', 'landscaping', 'repair shop'],
    wedding: ['meetup', 'event page', 'event site', 'event website', 'engaged', 'guests', 'reception', 'baby shower', 'anniversary', 'reunion', 'wedding', 'married', 'rsvp', 'save the date', 'birthday', 'party invite', 'engagement'],
    podcast: ['radio show', 'audio show', 'podcast', 'episodes', 'our show', 'my show'],
    blog: ['essays', 'my essays', 'blog', 'newsletter', 'devlog', 'travel stories', 'my writing'],
    saas: ['ios app', 'android app', 'marketing site', 'mobile app', 'our product', 'my product', 'b2b', 'startup', 'saas', 'for my app', 'for our app', 'software', 'product site'],
    gamepage: ['steam game', 'game jam', 'steam page', 'indie game', 'press kit', 'my game', 'our game', 'game page', 'wishlist'],
    resume: ['about me', 'job hunting', 'resume', 'cv', 'personal website', 'personal site', 'about me page'],
    nonprofit: ['charity', 'nonprofit', 'non profit', 'donation', 'donate', 'fundraiser', 'fundraising', 'animal shelter', 'volunteers'],
    photography: ['photo portfolio', 'gallery website', 'my photos', 'street photos', 'photography portfolio', 'photographer', 'photography', 'photo gallery', 'photo site'],
    comingsoon: ['coming soon', 'waitlist', 'wait list', 'launching soon', 'teaser page', 'prelaunch', 'pre launch', 'collect emails'],
  };
  const BLOCK_W = [
    ['testimonials', 'testimonials?|reviews?|quotes|what (?:people|customers|clients) say|social proof|kind words'],
    ['pricing', 'pricing|prices|price list|price table|plans|tiers'],
    ['faq', 'faqs?|questions and answers|q and a|common questions|questions'],
    ['newsletter', 'newsletter signup|newsletter section|newsletter box|newsletter|subscribe box|subscribe form|email signup|mailing list'],
    ['cta', 'call to action section|call to action|cta section|cta block|closing pitch'],
    ['stats', 'stats|statistics|numbers section|metrics|by the numbers|counters'],
    ['logos', 'logo cloud|logo wall|logo strip|client logos|press logos|logos|trusted by'],
    ['banner', 'announcement bar|announcement banner|banner|announcement|ribbon'],
    ['divider', 'divider|separator|spacer'],
    ['image', 'image section|image block|big image|wide image|full width image|picture section|photo section|big picture|big photo'],
    ['contact', 'contact form|contact|sign ?up form|signup|email me|get in touch|reach me|reach us|newsletter form|a form|form'],
    ['gallery', 'gallery|galleries|photo grid|image grid|photos|pictures|lookbook'],
    ['team', 'team|who we are|about us|the people|crew|our people|members'],
    ['embed', 'video|videos|youtube|vimeo|spotify|soundcloud|embed|bandcamp|playlist|map'],
    ['features', 'features?|feature list|what we do|services|benefits|highlights'],
    ['links', 'links list|link list|list of links|social links|social media links|social icons|socials|links'],
    ['footer', 'footer|bottom bar'],
    ['hero', 'hero|header|top section'],
    ['text', 'text section|text block|paragraph|some text|story|text'],
  ].map(([k, w]) => [k, new RegExp(`\\b(?:${w})\\b`)]);
  const blockOf = c => { let best = null, at = Infinity; for (const [k, rx] of BLOCK_W) { const m = rx.exec(c); if (m && m.index < at) { at = m.index; best = k; } } return best; };   // the first one named is the subject
  const PRESET_W = { paper: 'paper|cream|warm paper', swiss: 'swiss|grid look', terminal: 'terminal|hacker|monospace', editorial: 'editorial|magazine|serif', playful: 'playful|fun|bubbly|colorful', minimal: 'minimal|minimalist|plain|simple', bold: 'bold|loud|poster|punchy', soft: 'soft|pastel|gentle', night: 'dark minimal|night', ivory: 'ivory', clean: 'clean', sand: 'sand|sandy', amber: 'amber', ocean: 'ocean|sea|nautical', rose: 'rose|rosé|pink', haze: 'purple haze|haze|purple', slate: 'slate', forest: 'forest|woodland|green' };
  const presetOf = c => { for (const [k, w] of Object.entries(PRESET_W)) if (new RegExp(`\\b(?:${w})\\b`).test(c)) return k; return ''; };
  const VAR_W = [['split', 'split|side by side'], ['center', 'center|centered|middle'], ['masonry', 'masonry'], ['table', 'table'], ['cards', 'cards'], ['grid', 'grid|columns'], ['list', 'list'], ['stack', 'stack|stacked'], ['minimal', 'minimal'], ['alternating', 'alternate|alternating|zig ?zag|left and right'], ['spotlight', 'spotlight|one big quote'], ['accent', 'solid color|accent band'], ['cover', 'cover|full bleed']];
  const LESSON_W = [['local', 'local brain|local ai|on.device ai|flint.s levels|running on (?:my|this|your) device'], ['export', 'export|exporting|html export|download (?:my |the )?(?:site|html|website)'], ['inspo', 'inspiration board|inspo board|inspo|moodboard|mood board|inspiration'], ['templates', 'templates?'],
    ['premium', 'premium|credits|subscription|subscribe|plans|upgrade'], ['huddles', 'huddles?|voice calls?|voice chat|video calls?|calls?'], ['agents', 'agents?|ai helpers?|claude code|my ai'], ['company', 'company|company mode|seats'],
    ['preview', 'preview|live preview'], ['canvas', 'design canvas|canvas|figma|design|mockups?|screens'], ['site', 'website designer|site designer|website builder|site builder|websites?|sites?|wire buttons|buttons|landing pages?|designer'],
    ['invite', 'invit(?:e|ing) (?:friends?|people|someone|teammates)|invites?|tribe link|friends'], ['people', 'people panel|presence|who is online|show where i am|people'], ['market', 'marketplace|market|add ons|addons|plugins'], ['design', 'design flow|posters?|logos?|flyers?'], ['tasks', 'task board|tasks?|kanban|board'], ['work', 'work|gigs?|jobs|time bank'], ['files', 'files?|uploads?|folders'], ['chat', 'chat|messages|channels|dms']].map(([k, w]) => [k, new RegExp(`\\b(?:${w})\\b`)]);
  const featureOf = s => { for (const [k, rx] of LESSON_W) if (rx.test(s)) return k; return null; };
  function lessonOf(c) {
    let m = /^(?:teach me|teach|lesson (?:on|about|for)|a lesson (?:on|about)|tutorial (?:on|for|about)|walk me through|show me how(?: to use)?)\s+(?:about\s+)?(?:how to\s+)?(?:use\s+)?(.+?)(?:\s+works?)?$/.exec(c);
    if (m) return featureOf(m[1]);
    if (/^how (?:do|does|can|should) (?:i|we|you)\s+(?:use|make|build|start|upload|export|wire|set up|work with|get started with|create|share|find|see)\b/.test(c)) return featureOf(c.replace(/^how (?:do|does|can|should) (?:i|we|you)\s+/, ''));
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
  // feat/site-v2: copy tone, hours, SEO, favicon, logo, fonts, publish, spacing, section backgrounds, hide/show/duplicate,
  // device previews, comments → tasks, filling from the project. In the designer or the preview (view), or anywhere
  // when the sentence names the website (glob). Returns the hits, or null when none of these fit.
  const FIELD = f => /tagline|subtitle|subheading|intro|sub/.test(f) ? 'tagline' : /title|heading|headline/.test(f) ? 'headline' : /button|cta/.test(f) ? 'button' : '';
  const cleanText = t => String(t || '').replace(/^["“']|["”'.]+$/g, '').trim();
  const FONT_W = [['fraunces', 'fraunces'], ['instrument serif', 'instrument serif|instrument'], ['space grotesk', 'space grotesk|grotesk'], ['bricolage', 'bricolage'], ['jetbrains mono', 'jetbrains mono|jetbrains'], ['silkscreen', 'silkscreen'], ['inter', 'inter'],
    ['pixel', 'pixel|retro|8 bit|arcade'], ['mono', 'mono|monospace|monospaced|code|typewriter'], ['serif', 'serif|serifs|classic|elegant|bookish'], ['sans', 'sans|sans serif|cleaner|clean|modern|simple']];
  function siteMore(c, r, ctx, hit, glob) {
    let m;
    const FW = '(headline|title|heading|tagline|subtitle|subheading|intro|button(?: text)?|cta|main button)';
    if ((m = new RegExp(`^${FW}\\s*:\\s*(.+)$`, 'i').exec(r))) return hit('site.text', { field: FIELD(m[1].toLowerCase()), text: cleanText(m[2]) });
    if (/\b(?:repo|repository|codebase|as code|real code)\b/.test(c) && /\b(?:website|site)\b/.test(c) && /\b(?:build|put|make|turn|write|commit|into|in)\b/.test(c)) return hit('site.repo', {});
    if (/\b(?:auto ?fill|autopopulate|auto populate|prefill|pre fill)\b/.test(c) || /\b(?:fill|file)\s+(?:it|this|the (?:site|website|page)|in|out)\b.*\b(?:project|company|team|chat|what we know)\b/.test(c) || /\bfrom (?:our|the|my) (?:project|company)\b/.test(c) && /\b(?:use|fill|take|pull|grab)\b/.test(c)) return hit('site.autofill', {});
    if (/\bstart (?:blank|empty|from scratch)\b|\bblank instead\b/.test(c)) return hit('site.blank', {});
    if (/\b(?:comments?|feedback|pins?)\b/.test(c) && !/\b(?:add|leave|drop|write|post)\s+(?:a\s+)?comment\b/.test(c)) {
      if (/\b(?:tasks?|todos?|to dos?|summari[sz]e|summary|action items?)\b/.test(c)) return hit('site.comments.tasks', {});
      if (/\b(?:show|see|what|open|list|read|any|view)\b/.test(c)) return hit('site.comments', {});
    }
    if (/\b(?:favicon|tab icon|browser icon|site icon|bookmark icon|icon in the tab)\b/.test(c)) return hit('site.favicon', {});
    const seo = /\b(?:seo|meta description|meta title|search engines?|google|page title|seo title|share image|social (?:card|image|preview)|og image|open graph|link preview)\b/.test(c);
    if (seo) {
      const field = /\b(?:share image|social (?:card|image|preview)|og image|open graph|link preview|preview image)\b/.test(c) ? 'image' : /\b(?:description|meta description|blurb)\b/.test(c) ? 'description' : /\btitle\b/.test(c) ? 'title' : '';
      const tm = /\b(?:title|description|seo|image)\s*(?:to\s+|as\s+|:\s*)(.+)$/i.exec(r);
      return hit('site.seo', { ...(field ? { field } : {}), ...(tm && field !== 'image' ? { text: cleanText(tm[1]) } : {}) });
    }
    if (/\b(?:add|put|use|place|show|stick|upload|need)\b.*\b(?:our|my|the|project|company|team)\s+logo\b/.test(c) && !/\blogos\b|\b(?:as|for|into) the (?:picture|image|photo|avatar)\b/.test(c)) return hit('site.logo', {});
    if (/\b(?:opening hours|business hours|open hours|opening times|hours|when (?:we are|were|we re|i am|you are|they are) open|open times)\b/.test(c) && !/\b\d+\s+hours\b|\bin (?:a few|an?|two|three) hours\b/.test(c)) return hit('site.hours', {});
    if (/\b(?:fonts?|typeface|typefaces|typography|font pairing|font pair)\b/.test(c) || /\bheadings?\b.*\b(?:mono|monospace|serif|sans)\b/.test(c) || /\b(?:fraunces|grotesk|instrument serif|bricolage|jetbrains|silkscreen)\b/.test(c)) { const f = FONT_W.find(([, w]) => new RegExp(`\\b(?:${w})\\b`).test(c)); return hit('site.font', f ? { font: f[0] } : {}); }
    const COPY = /\b(?:punchier|punch up|punch it up|punchy|catchier|snappier|stronger|boring|bland|dull|shorter|shorten|tighten|tighten up|trim|concise|friendlier|friendly|warmer|casual|professional|formal|serious|rewrite|reword|rephrase|better (?:copy|words|headline|wording))\b/;
    if (/\b(?:re)?write\s+(?:the|our|my|a new|a better)\s+(?:headline|tagline|title|heading|copy|intro)\b/.test(c)) { const fm = /\b(headline|title|heading|tagline|intro)\b/.exec(c); return hit('site.copy', { field: FIELD(fm[1]) }); }
    if (COPY.test(c) && (/\b(?:headline|title|heading|tagline|subtitle|subheading|intro|button|cta|copy|text|words|wording|writing)\b/.test(c) || !glob && /^make it (?:punchier|shorter|friendlier|snappier|catchier)/.test(c))) {
      const fm = /\b(headline|title|heading|tagline|subtitle|subheading|intro|button|cta)\b/.exec(c), field = fm ? FIELD(fm[1]) : '';
      const tone = /\b(?:punch|catchier|snappier|stronger|boring|bland|dull)/.test(c) ? 'punchy' : /\b(?:short|tight|trim|concise)/.test(c) ? 'shorter' : /\b(?:friend|warm|casual)/.test(c) ? 'friendlier' : /\b(?:professional|formal|serious)\b/.test(c) ? 'formal' : '';
      return hit('site.copy', { ...(field ? { field } : {}), ...(tone ? { tone } : {}) });
    }
    if (/\b(?:publish|unpublish|go live|put (?:it|the site|the website|this) live|make (?:it|the site|this) live|ship (?:it|the site|the website)|deploy)\b/.test(c) && !/\bunpublish\b/.test(c) && (!glob || /\bwebsite\b/.test(c))) return hit('site.publish', {});
    if (glob) return null;
    if (/\b(?:give me|get me|send me)\s+(?:the\s+)?(?:files|code|source)\b/.test(c)) return hit('site.export', {});
    if (/\b(?:spacing|padding|breathing room|whitespace|white space|more space|less space|compact|cramped|airy|roomier|tighter|denser|spacious)\b/.test(c) && !/\bbackground\b/.test(c)) return hit('site.spacing', { size: /\b(?:less|tight|tighter|compact|dense|denser|smaller|reduce|cramped no)\b/.test(c) ? 'less' : 'more' });
    if (/\b(?:background|bg|backdrop)\b/.test(c) && (blockOf(c) || /\b(?:section|block|this|that)\b/.test(c))) {
      const bg = /\b(?:remove|delete|no|plain|clear|transparent|none|without)\b/.test(c) ? 'none' : /\b(?:accent|brand|primary|main colou?r)\b/.test(c) ? 'accent' : /\b(?:gray|grey|light|subtle|tint|tinted|card|off white|soft)\b/.test(c) ? 'card' : /\b(?:dark|black|ink|darker)\b/.test(c) ? 'ink' : '';
      const b = blockOf(c); return hit('site.bg', { ...(b ? { block: b } : {}), ...(bg ? { bg } : {}) });
    }
    if (/\b(?:unhide|show\s+(?:the\s+)?(?:[a-z]+\s+){0,2}again|bring back the)\b/.test(c)) { const b = blockOf(c); return hit('site.block.show', b ? { block: b } : {}); }
    if (/\b(?:hide|hidden|temporarily remove)\b/.test(c)) { const b = blockOf(c); return hit('site.block.hide', b ? { block: b } : {}); }
    if (/\b(?:duplicate|clone|copy (?:the|this|that)|another one of (?:these|this|those|them)|repeat (?:this|the|that))\b/.test(c) && !/\b(?:link|url|text)\b/.test(c)) { const b = blockOf(c); return hit('site.block.dup', b ? { block: b } : {}); }
    if (ctx.view !== 'preview' && (m = /\b(phone|mobile|iphone|tablet|ipad|desktop|laptop|big screen)\b/.exec(c)) && /\b(?:view|version|preview|look|looks|size|width|show|see|mode)\b/.test(c)) return hit('site.device', { dev: /phone|mobile|iphone/.test(m[1]) ? 'phone' : /tablet|ipad/.test(m[1]) ? 'tablet' : 'desktop' });
    if (/\b(?:add|put|insert|include|want|need|stick|give me)\b/.test(c) && /\b(?:big|wide|full width|large|huge)\s+(?:image|picture|photo)\b|\b(?:image|picture|photo)\s+(?:section|block|banner)\b/.test(c)) return hit('site.block.add', { block: 'image' });
    return null;
  }
  // ---------- feat/flint-unify: many more free commands in the website designer and on the canvas ----------
  // Text that people type (labels, URLs, handles, prices, quotes) is read from the raw words r, never the canonical c.
  const NETS = [['instagram', 'instagram|insta|ig'], ['tiktok', 'tiktok|tik tok'], ['youtube', 'youtube|yt'], ['spotify', 'spotify'], ['twitter', 'twitter'], ['github', 'github'], ['linkedin', 'linkedin|linked in'],
    ['facebook', 'facebook|fb'], ['twitch', 'twitch'], ['soundcloud', 'soundcloud|sound cloud'], ['bandcamp', 'bandcamp|band camp'], ['pinterest', 'pinterest'], ['threads', 'threads'], ['bluesky', 'bluesky|bsky'],
    ['mastodon', 'mastodon'], ['discord', 'discord'], ['patreon', 'patreon'], ['substack', 'substack'], ['kofi', 'ko fi|kofi'], ['behance', 'behance'], ['dribbble', 'dribbble|dribble'], ['snapchat', 'snapchat'],
    ['whatsapp', 'whatsapp|whats app'], ['telegram', 'telegram'], ['vimeo', 'vimeo'], ['apple music', 'apple music'], ['etsy', 'etsy']];
  const netOf = c => { for (const [k, w] of NETS) if (new RegExp(`\\b(?:${w})\\b`).test(c)) return k; return ''; };
  const netsOf = c => NETS.filter(([, w]) => new RegExp(`\\b(?:${w})\\b`).test(c)).map(([k]) => k);
  const URL_RX = /\b((?:https?:\/\/|www\.)[^\s,;]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|app|dev|me|studio|shop|store|link|page|site|xyz|uk|de|fr|ca|au|us|tv|fm|art|band|club|blog)(?:\/[^\s,;]*)?)/i;
  const EMAIL_RX = /\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/;
  const PHONE_RX = /(\+?\d[\d\s().-]{5,}\d)/;
  const urlOf = r => { const e = EMAIL_RX.exec(r); const m = URL_RX.exec(e ? r.replace(e[0], ' ') : r); return m ? m[1].replace(/[.)]+$/, '') : ''; };
  const capFirst = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  const tidyLabel = s => /^(?:a|an|the|new|another|one|some|my|our)$/i.test(String(s || '').trim()) ? '' : capFirst(String(s || '').replace(/^["“'\s]+|["”'.!?\s]+$/g, '').replace(/^(?:my|our|the|a|an|this|that)\s+/i, '').replace(/\s+(?:please|pls|plz|too|thanks|thx|on (?:there|it|the (?:page|site))|here|for me)$/i, '').trim());
  const AWORD = '(?:add|put|insert|include|create|make|need|want|give me|stick|throw|drop|new|chuck|slap|pop|get|i want|i need|we need|can we get|could we get|lets add|let us add)';
  function linkLabel(r) {
    const s = r.replace(EMAIL_RX, ' ').replace(URL_RX, ' ').replace(/\s+/g, ' ').trim();
    let m = /\b(?:called|named|titled|labell?ed|that says|saying)\s+["“]?(.+?)["”]?(?:\s+(?:to|at|for|that goes to|linking to|pointing to)\s*)?$/i.exec(s);
    if (m) return tidyLabel(m[1]);
    m = /\blinks?\b\s*:\s*(.+)$/i.exec(s) || /\blinks?\b(?:\s+button)?(?:\s+in)?\s+(?:for|to|about|of|on)\s+(.+)$/i.exec(s) || /\b(?:add|put|need|want|insert|include|stick|get)\s+(?:a\s+|an\s+|my\s+|our\s+|the\s+)?(.+?)\s+links?\b/i.exec(s);
    return m ? tidyLabel(m[1].replace(/\s+(?:to|at|for)$/i, '')) : '';
  }
  const ALIGN_W = c => /\b(?:left)\b/.test(c) ? 'left' : /\bright\b/.test(c) ? 'right' : /\b(?:center|centered|middle)\b/.test(c) ? 'center' : '';
  function siteNew(c, r, ctx, hit) {
    let m; const H = (intent, slots) => hit(intent, slots, 0.985);
    const rl = r.toLowerCase(), url = urlOf(r), email = (EMAIL_RX.exec(r) || [])[1] || '';
    const isAdd = new RegExp(`^(?:please\\s+)?${AWORD}\\b|\\b(?:add|put|insert|include|stick|throw|chuck|slap|pop)\\b`).test(c);
    const isDel = (/\b(?:delete|get rid of|drop|take out|take off|kill|lose|ditch|scrap|nix|no more|cut)\b/.test(c) || /^take\b.*\b(?:off|out|away)$/.test(c)) && !/\bdrop in\b/.test(c);
    const net = netOf(c);
    // video and map before links and socials ("embed my youtube video", "a map with directions")
    if (/\b(?:video|videos|clip|trailer|reel|vlog)\b/.test(c) && (isAdd || /\b(?:embed|show|play|feature)\b/.test(c)) && !isDel && !/\b(?:editor|editing)\b/.test(c)) return H('site.video', url ? { url } : {});
    if (/\b(?:map|directions|how to find us|find us|where we are|our location|our address)\b/.test(c) && !isDel && !/\bsite ?map\b/.test(c)) { const am = /(?:\bmap\b|\baddress\b|\bdirections\b|\bfind us\b|\bwhere we are\b|\blocation\b)[^,:]*?(?:\s+(?:to|for|of|at|is)\s+|\s*[,:]\s*)(.+)$/i.exec(r); const addr = am && /\d|\b(?:street|st|road|rd|ave|avenue|lane|ln|square|sq|way|blvd)\b/i.test(am[1]) ? am[1].replace(/[.!]+$/, '').trim() : ''; return H('site.map', addr ? { address: addr } : {}); }
    // socials: "add my instagram @mara", "tiktok icon", "remove the twitter link"
    const linkVerb = /^(?:link|wire|hook|connect|point)\b/.test(c) && !/^link\s+(?:up\s+)?(?:my|our)\s+[a-z ]+?(?:channel|account|profile|page|handle)?$/.test(c) && /\bto\b|\bbutton/.test(c) || /\bbuttons?\b/.test(c) && /\b(?:link|links|linked|go|goes|point|wire)\b/.test(c) && !/^(?:add|put|insert|new|need|want|i want|i need)\b/.test(c) || /\blinks?\s+(?:work|go|point|lead|do)\b/.test(c);
    if (net && net !== 'etsy' && !linkVerb && !/\b(?:video|embed|playlist|track|episode|album)\b/.test(c)) {
      if (isDel) return H('site.social.remove', { net });
      if (isAdd || /\b(?:icon|icons|handle|account|profile|socials?|link)\b/.test(c)) { const nets = netsOf(c).filter(n => n !== 'etsy'); const hm = /@([\w.]{2,40})/.exec(r) || /\b(?:handle|username|user name|account)\s+(?:is\s+)?@?([\w.]{2,40})/i.exec(r); return H('site.social.add', { net, ...(nets.length > 1 ? { nets } : {}), ...(hm ? { handle: hm[1].replace(/\.$/, '') } : {}), ...(url ? { url } : {}) }); }
    }
    // email and phone buttons
    if (/\b(?:email|e mail|mail)\b/.test(c) && /\b(?:button|link|cta)\b/.test(c) && (isAdd || /^(?:an?\s+)?(?:email|e mail)/.test(c)) && !/\b(?:form|signup|sign up|newsletter|subscribe|list)\b/.test(c)) return H('site.button.email', email ? { email } : {});
    if ((/\b(?:call|phone|ring|telephone|tel)\s+(?:button|us|me|number|link)\b|\bbutton\s+to\s+(?:call|ring|phone)\b|\bphone number\b/.test(c)) && isAdd && !/\b(?:says|saying|called|labell?ed)\b/.test(c)) { const pm = PHONE_RX.exec(r); return H('site.button.phone', pm ? { phone: pm[1].trim() } : {}); }
    // contact email: "send the form to x@y", "contact email is x@y"
    if (email && /\b(?:form|contact|messages?|enquiries|inquiries)\b/.test(c) && /\b(?:send|go|goes|email|set|use|is|change|deliver|forward)\b/.test(c) && !/\bbutton\b/.test(c)) return H('site.contact.email', { email });
    // links (link-in-bio items, otherwise hero buttons or footer links)
    if (/\blinks?\b/.test(c) && !linkVerb && !/\b(?:links? (?:list|section|block)|link in bio|linktree|link tree|links page)\b/.test(c)) {
      if (isDel) { const lm = /\b(?:the\s+|my\s+|that\s+)?(.+?)\s+links?\b/i.exec(r.replace(/^.*?\b(?:delete|remove|get rid of|drop|take out|take off|kill|lose|ditch|scrap|nix|cut)\s+/i, '')); const lab = lm ? tidyLabel(lm[1]) : ''; return H('site.link.remove', lab && !/^(?:this|that|it|the)$/i.test(lab) ? { label: lab.toLowerCase() } : {}); }
      const dir = /\b(?:to the top|at the top|first|to the start|top)\b/.test(c) ? 'top' : /\b(?:to the bottom|at the bottom|last|to the end|bottom)\b/.test(c) ? 'bottom' : /\bup\b|\bhigher\b|\babove\b/.test(c) ? 'up' : /\bdown\b|\blower\b|\bbelow\b/.test(c) ? 'down' : '';
      if (dir && /\b(?:move|put|bump|push|shift|place|swap)\b/.test(c)) { const lm = /\b(?:move|put|bump|push|shift|place)\s+(?:the\s+|my\s+)?(.+?)\s+links?\b/i.exec(r); return H('site.link.move', { dir, ...(lm ? { label: tidyLabel(lm[1]).toLowerCase() } : {}) }); }
      if ((url || email) && /\b(?:change|set|update|point|make|fix|should go|goes|go to|send)\b/.test(c) && !isAdd) { const lm = /\b(?:the\s+|my\s+)?([\w' -]+?)\s+link(?:'s)?\b/i.exec(r.replace(/^.*?\b(?:change|set|update|point|make|fix)\s+/i, '')); return H('site.link.url', { url: email ? 'mailto:' + email : url, ...(lm && !/^(?:the|this|that|a)$/i.test(lm[1]) ? { label: tidyLabel(lm[1]).toLowerCase() } : {}) }); }
      if (isAdd || /^(?:an?\s+)?(?:new\s+)?link\b/.test(c)) { const label = linkLabel(r); return H('site.link.add', { ...(label ? { label } : {}), ...(url || email ? { url: email ? 'mailto:' + email : url } : {}) }); }
    }
    // buttons: "add a button that says Book now", "remove the second button"
    if (/\bbuttons?\b/.test(c) && !/\b(?:work|wire|clickable|functional|go|goes|point|link it|lead)\b/.test(c)) {
      if (isDel) { const ord = /\b(first|second|third|last|1st|2nd|3rd)\b/.exec(c); return H('site.button.remove', ord ? { which: ord[1] } : {}); }
      if (/\b(?:add|put|insert|include|stick|throw|need|want|another|second|extra|new)\b/.test(c) && !linkVerb && !/\b(?:email|mail|call|phone)\b/.test(c)) { const lm = /\b(?:called|that says|saying|labell?ed|reading|:)\s*["“]?(.+?)["”]?(?:\s+(?:to|that goes to|linking to|pointing to)\s+.+)?$/i.exec(r.replace(URL_RX, ' ').trim()) || /\bbutton\s+(?:for|to)\s+(.+)$/i.exec(r.replace(URL_RX, ' ').trim()); return H('site.button.add', { ...(lm ? { label: tidyLabel(lm[1]) } : {}), ...(url ? { url } : {}) }); }
    }
    // list items: faq, pricing, team, testimonials, stats, features, menu / dates / episodes, gallery photos
    if ((m = /\b(?:faq|question)\b(?:\s+(?:item|entry))?\s*(?::|-|,|asking|that asks|saying)?\s+(.+)$/i.exec(r)) && isAdd && /\?|\b(?:do|does|can|how|what|is|are|when|where|why|will)\b/i.test(m[1])) { const [q, a] = m[1].split(/\s*(?:\?\s*|\b(?:answer|answered|reply)\s*:?\s*)/i); return H('site.faq.add', { q: capFirst(q.replace(/^(?:the\s+)?question\s+/i, '').trim()) + '?', ...(a && a.trim() ? { a: capFirst(a.trim()) } : {}) }); }
    if (/\b(?:plan|tier|package|pricing option|price option)\b/.test(c) && isAdd && !/\b(?:pricing table|pricing section|price table|prices section|plans section)\b/.test(c)) { const nm = /\b(?:called|named)\s+["“]?([\w' -]+?)["”]?(?:\s+(?:for|at)\b|$)/i.exec(r) || /\b(?:an?|another|new)\s+([\w'-]+)\s+(?:plan|tier|package)\b/i.exec(r); const pr = /([$€£¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:dollars|euros|pounds|usd|eur|gbp|\/mo|a month|per month))/i.exec(r); if (nm || pr) return H('site.price.add', { ...(nm && !/^(?:new|pricing|price|another)$/i.test(nm[1]) ? { name: capFirst(nm[1]) } : {}), ...(pr ? { price: pr[1].replace(/\s+/g, '') } : {}) }); }
    if (/\bteam\b/.test(c) && isAdd && !/\bteam (?:section|block|page)\b|^(?:add|put|insert|include)\s+(?:a\s+|the\s+|our\s+)?team$/.test(c)) { const nm = /\b(?:add|put|include)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)\s+(?:to|on|in)\s+(?:the\s+|our\s+)?team/iu.exec(r) || /\bteam member\s+(?:called|named)?\s*([\p{L}][\p{L}'-]*)/iu.exec(r); const rm = /\bas\s+(?:our\s+|the\s+|a\s+|an\s+)?(.+)$/i.exec(r); if (nm && !/^(?:a|an|the|someone|somebody|people)$/i.test(nm[1])) return H('site.team.add', { name: capFirst(nm[1]), ...(rm ? { role: capFirst(rm[1].replace(/[.!]+$/, '')) } : {}) }); }
    if (/\b(?:testimonial|review|quote)\b/.test(c) && isAdd && /\b(?:from|by|saying|says|that says|:)\b|:/.test(rl)) { const fm = /\b(?:from|by)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)/iu.exec(r); const qm = /\b(?:saying|says|that says|reading)\s+["“]?(.+?)["”]?$/i.exec(r) || /:\s*["“]?(.+?)["”]?$/.exec(r); return H('site.quote.add', { ...(fm ? { name: capFirst(fm[1].replace(/\s+(?:saying|says|that).*$/i, '')) } : {}), ...(qm ? { quote: capFirst(qm[1]) } : {}) }); }
    if (/\b(?:stat|statistic|number|metric|counter)\b/.test(c) && isAdd && /\d/.test(r) && !/\bphone\b/.test(c)) { const sm = /([\d.,]+[%+kKmM]?)\s+(.+)$/.exec(r.replace(/^.*?\b(?:stat|statistic|number|metric|counter)s?\s*(?::|-|of|saying)?\s*/i, '')); if (sm) return H('site.stat.add', { value: sm[1], label: sm[2].replace(/[.!]+$/, '') }); }
    if (/\b(?:feature|service|benefit|perk)\b/.test(c) && isAdd && (m = /\b(?:feature|service|benefit|perk)s?(?:\s*[:-]|\s+(?:called|named|titled))\s*["“]?(.+?)["”]?$/i.exec(r))) return H('site.feature.add', { title: capFirst(m[1]) });
    if ((m = /\b(?:menu item|dish|drink|tour date|show date|gig|show|date|episode|event|item|product)\s*(?::|-|,|called|named)?\s+(.+)$/i.exec(r)) && isAdd && !/\b(?:to (?:the |my |our )?calendar|section|block|page|gallery|list section)\b/.test(c)) {
      const kind = /menu|dish|drink/i.test(m[0]) ? 'menu' : /episode/i.test(m[0]) ? 'episode' : /tour|show|gig|date|event/i.test(m[0]) ? 'date' : 'item';
      const pr = /\s+([$€£¥]\s?\d[\d.,]*)$/.exec(m[1]); const dt = !pr && /\s+((?:on\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2})$/i.exec(m[1]);
      const title = (pr || dt ? m[1].slice(0, (pr || dt).index) : m[1]).replace(/[.!]+$/, '').trim(); if (title) return H('site.item.add', { kind, title: capFirst(title), ...(pr ? { meta: pr[1] } : dt ? { meta: capFirst(dt[1].replace(/^on\s+/i, '')) } : {}) });
    }
    if (/\b(?:photo|photos|picture|pictures|image|images|pic|pics)\b/.test(c) && /\b(?:to|in|into)\s+(?:the\s+|my\s+|our\s+)?gallery\b/.test(c) && /\b(?:add|upload|put|stick|drop|more|another)\b/.test(c)) return H('site.gallery.add', {});
    // a countdown / a date
    if (/\b(?:countdown|count down|days (?:left|to go|until))\b/.test(c) && !isDel) { const w = parseWhen(c, ctx && ctx.now); return H('site.countdown', { ...(w && w.date ? { date: w.date } : {}), ...((m = /\b(?:to|until|till|for)\s+(?:the\s+|our\s+)?([a-z][a-z ]+?)(?:\s+on\b|$)/i.exec(r)) && !(w && w.text && m[1].toLowerCase().includes(w.text)) && !/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun|next|this|tomorrow)/i.test(m[1]) ? { what: m[1].trim() } : {}) }); }
    // words by section: "change the faq title to …", "footer should say …", "copyright", "announcement: …", "my bio …"
    if (/\bcopyright\b|©/.test(rl) || /\b(?:update|fix|change)\s+(?:the\s+)?year\b.*\bfooter\b|\bfooter\b.*\byear\b/.test(c)) { const y = /\b(20\d\d)\b/.exec(r); return H('site.copyright', y ? { year: y[1] } : {}); }
    if (/\bfooter\b/.test(c) && (m = /\bfooter(?:\s+(?:text|line|words|note))?\s*(?:should\s+(?:say|read)|to\s+say|to\s+read|says|reads|say|to|:|=)\s*["“]?(.+?)["”]?$/i.exec(r))) return H('site.footer', { text: m[1].replace(/[.!]+$/, '') });
    if (/\b(?:bio|about me line|tagline about me)\b/.test(c) && (m = /\bbio\s*(?:should\s+(?:say|read)|to\s+say|to\s+read|says|reads|say|to|:|=|as)\s*["“]?(.+?)["”]?$/i.exec(r))) return H('site.bio', { text: capFirst(m[1].replace(/[.!]+$/, '')) });
    if (/\b(?:announcement|announcement bar|notice|alert bar|top bar|banner)\b/.test(c) && (m = /\b(?:announcement|notice|banner|bar)\s*(?::|saying|that says|reading|to say|with)\s*["“]?(.+?)["”]?$/i.exec(r))) return H('site.announce', { text: capFirst(m[1].replace(/[.!]+$/, '')) });
    { const tm = /\b(?:title|heading|header|headline|name)\b/.exec(c), b = tm && !/\bpages?\b/.test(c) ? blockOf(c.slice(0, tm.index)) : null; if (b && b !== 'hero' && b !== 'footer' && (m = /\b(?:title|heading|header|headline|name)\b\s*(?:should\s+(?:say|read|be)|to\s+say|to\s+read|to|say|says|reads|:|=)\s*["“]?(.+?)["”]?$/i.exec(r)) && /\b(?:change|set|rename|make|update|edit|call|retitle)\b|\bshould\b|:/.test(rl)) return H('site.section.title', { block: b, text: m[1].replace(/[.!]+$/, '') });
      const b2 = blockOf(c); if (b2 && b2 !== 'hero' && (m = /\b(?:rename|retitle|call)\s+(?:the\s+|this\s+)?[\w ]+?\s+(?:section|block)\s+(?:to\s+)?["“]?(.+?)["”]?$/i.exec(r))) return H('site.section.title', { block: b2, text: m[1] }); }
    // the menu (nav) and pages
    if ((m = /\b(?:add|put)\s+(?:a\s+|an\s+)?["“]?([\w' -]+?)["”]?\s+(?:to|in|into|on)\s+(?:the\s+)?(?:menu|nav|navigation|navbar|nav bar|top menu|header menu)\b/i.exec(r)) && !/^(?:link|page)$/i.test(m[1])) return H('site.nav.add', { name: titleCase(m[1].replace(/\s+(?:page|link)$/i, '')) });
    if (/\bpages?\b/.test(c) && /\b(?:move|put|shift|bump|reorder)\b/.test(c) && (m = /\b(up|down|left|right|first|last|to the (?:front|start|end|top|bottom))\b/.exec(c))) { const nm = /\bthe\s+([\w' -]+?)\s+page\b/i.exec(r); return H('site.page.move', { dir: /up|left|first|front|start|top/.test(m[1]) ? (/first|front|start|top/.test(m[1]) ? 'first' : 'up') : (/last|end|bottom/.test(m[1]) ? 'last' : 'down'), ...(nm && !/^this$/i.test(nm[1]) ? { name: nm[1].toLowerCase() } : {}) }); }
    if ((m = /^(?:go to|open|show|show me|switch to|take me to|jump to|edit|view|see|back to)\s+(?:the\s+|my\s+|our\s+)?([\w' -]+?)\s+page$/i.exec(c)) && !/^(?:website|site|home ?page|landing)$/.test(m[1]) || (m = /^(?:go to|open|switch to|take me to|jump to|back to)\s+(?:the\s+)?(home ?page|homepage|home)$/.test(c) ? ['', 'home'] : null)) return H('site.page.go', { name: m[1].replace(/\s+/g, ' ') });
    if (/\b(?:clear|empty|wipe|reset)\s+(?:this|the|my)\s+page\b/.test(c)) return H('site.page.clear', {});
    // look per section: align, a color, rounder corners, the site's language, the logo
    if (/\b(?:this|that|the selected|selected)\s+(?:section|block|part|bit)\b/.test(c)) {
      const dir = /\b(?:to the top|at the top|first)\b/.test(c) ? 'top' : /\b(?:to the bottom|at the bottom|last)\b/.test(c) ? 'bottom' : /\b(?:up|higher|above)\b/.test(c) ? 'up' : /\b(?:down|lower|below)\b/.test(c) ? 'down' : '';
      if (dir && /\b(?:move|put|shift|bump|push|place)\b/.test(c)) return H('site.block.move', { dir });
      const col = colorOf(c); if (col && !/\b(?:accent|brand|primary)\b/.test(c) && !/\b(?:background|bg)\b/.test(c) && /\b(?:make|turn|paint|color|set|change|use|give|in)\b/.test(c)) return H('site.block.color', { color: col });
    }
    if (/\b(?:align|aligned|alignment|justify|center|left|right)\b/.test(c) && /\b(?:text|words|everything|content|copy|it all|all of it|stuff|things|alignment|aligned|align)\b/.test(c) && ALIGN_W(c) && !/\b(?:picture|image|photo|button)\b/.test(c)) { const b = blockOf(c.replace(/\b(?:the\s+)?(?:text|words|copy)\b/g, ' ')); return H('site.align', { align: ALIGN_W(c), ...(b ? { block: b } : {}) }); }
    if (/^(?:left|right)\s+align\b|\balign\b.*\b(?:left|right)\b/.test(c)) { const b = blockOf(c); return H('site.align', { align: ALIGN_W(c), ...(b ? { block: b } : {}) }); }
    { const b = blockOf(c), col = colorOf(c); if (b && b !== 'footer' && col && !/\b(?:accent|brand|primary|main colou?r|buttons?|theme)\b/.test(c) && !(/\b(?:background|bg|backdrop)\b/.test(c) && /^(?:gray|grey|black|white|dark|light|silver)$/.test(col.name)) && /\b(?:make|turn|paint|color|set|change|use|give|in)\b/.test(c)) return H('site.block.color', { block: b, color: col }); }
    if (/\b(?:corners?|rounding|radius|rounded|rounder|sharper|squarer)\b/.test(c) && !/\b(?:picture|image|photo|avatar|pic)\b/.test(c)) return H('site.radius', { size: /\b(?:no|square|sharp|sharper|squarer|straight|none|less|remove)\b/.test(c) ? (/\b(?:no|none|square|straight|remove)\b/.test(c) && !/\bless\b/.test(c) ? 'none' : 'less') : 'more' });
    if (/\b(?:language|lang)\b/.test(c) && /\b(?:site|website|page|pages|html)\b/.test(c) && (m = new RegExp(`\\b(${Object.keys(LANGS).join('|')})\\b`).exec(c))) return H('site.lang', { lang: LANGS[m[1]] });
    if (/\blogo\b/.test(c) && isDel && !/\blogos\b/.test(c)) return H('site.logo.remove', {});
    return null;
  }

  // the canvas: align, spread, group, duplicate, lock, order, resize, rename one layer, add shapes, snap, delete, zoom
  const CDIR = c => /\bleft\b/.test(c) ? 'l' : /\bright\b/.test(c) ? 'r' : /\btop\b/.test(c) ? 't' : /\bbottom\b/.test(c) ? 'b' : /\b(?:middle|vertical(?:ly)?)\b/.test(c) ? 'cv' : /\b(?:center|centered|horizontal(?:ly)?)\b/.test(c) ? 'ch' : '';
  const CNAME = { l: 'left', r: 'right', t: 'top', b: 'bottom', cv: 'middle', ch: 'center' };
  function canvasNew(c, r, ctx, hit) {
    let m; const H = (intent, slots) => hit(intent, slots, 0.985);
    const OBJ = '(?:it|this|that|these|those|them|the selection|selection|selected|everything|all|all of them|the layers|layers|the layer|this layer|these layers|the frame|this frame|the boxes|the shapes|the items|things|stuff)';
    if (/\b(?:distribute|evenly|equal spacing|same spacing|equal gaps|spread)\b/.test(c) && !/\btidy\b/.test(c)) return H('canvas.distribute', { axis: /\b(?:vertical(?:ly)?|top to bottom|up and down|column)\b/.test(c) ? 'v' : 'h' });
    if ((/\b(?:align|line up|line them up|line these up)\b/.test(c) || new RegExp(`^(?:left|right|center|centre|top|bottom)\\s+align(?:\\s+${OBJ})?$`).test(c) || new RegExp(`^(?:center|centre)\\s+${OBJ}$`).test(c)) && CDIR(c)) { const d = CDIR(c); return H('canvas.align', { dir: CNAME[d] }); }
    if (new RegExp(`^(?:ungroup|un group|break apart|break up|split up|explode)(?:\\s+(?:the\\s+)?(?:group|${OBJ}))?$`).test(c)) return H('canvas.ungroup', {});
    if (new RegExp(`^(?:group|group up)(?:\\s+${OBJ})?(?:\\s+together)?$|^(?:make|put)\\s+(?:a\\s+group|${OBJ}\\s+(?:in|into)\\s+a\\s+group)(?:\\s+(?:of|with)\\s+${OBJ})?$`).test(c)) return H('canvas.group', {});
    if (new RegExp(`^(?:duplicate|dupe|dup|clone|copy paste|copy and paste|double)(?:\\s+${OBJ})?$|^(?:make|give me)\\s+(?:a\\s+)?(?:copy|duplicate|clone)\\s+(?:of\\s+)?${OBJ}$|^(?:another one|one more)(?:\\s+of\\s+(?:these|this|those))?$`).test(c)) return H('canvas.duplicate', {});
    if ((m = new RegExp(`^(?:un ?lock|lock|freeze|unfreeze)(?:\\s+${OBJ})?(?:\\s+(?:layer|layers|in place|down))?$`).exec(c))) return H('canvas.lock', { on: !/^un/.test(c) });
    if ((m = new RegExp(`^(?:hide|unhide|show)\\s+(?:${OBJ}|this layer|that layer)(?:\\s+(?:layer|again))?$`).exec(c)) && !/\bshow (?:me|everything)\b/.test(c)) return H('canvas.hide', { on: /^hide/.test(c) });
    if (/\b(?:bring|send|move|put|push|pull|place)\b/.test(c) && (m = /\b(to the front|to front|front|forward|forwards|on top|to the top|to the back|to back|back|backward|backwards|behind|below everything|underneath|to the bottom)\b/.exec(c)) && !/\b(?:page|screen|app|code)\b/.test(c)) return H('canvas.order', { dir: /front|on top|to the top/.test(m[1]) ? 'front' : /^forward/.test(m[1]) ? 'up' : /backward/.test(m[1]) ? 'down' : 'back' });
    if ((m = /\b(\d{1,4})\s*(?:px\s*)?(?:x|by|×|\*)\s*(\d{1,4})\b/.exec(c)) && /\b(?:resize|size|make|set|scale|change)\b/.test(c)) return H('canvas.resize', { w: +m[1], h: +m[2] });
    if ((m = /\b(width|height|wide|tall)\b\s*(?:to|of|=|:)?\s*(\d{1,4})|\b(\d{1,4})\s*(?:px\s+)?(wide|tall|width|height)\b/.exec(c)) && /\b(?:resize|size|make|set|change|width|height)\b/.test(c)) { const k = (m[1] || m[4]), v = +(m[2] || m[3]); return H('canvas.resize', /width|wide/.test(k) ? { w: v } : { h: v }); }
    if (/\b(?:twice as big|double the size|double size|2x bigger|half the size|half as big|halve)\b/.test(c)) return H('canvas.resize', { scale: /half|halve/.test(c) ? 0.5 : 2 });
    if ((m = /^(?:rename|name|call|label|retitle)\s+(?:this layer|the layer|that layer|the selection|this frame|the frame|it|this|that)\s+(?:to\s+|as\s+)?["“]?(.+?)["”]?$/i.exec(r))) return H('canvas.layer.rename', { name: m[1].trim() });
    const SH = [['rect', 'rectangle|rect|box|square'], ['ellipse', 'circle|ellipse|oval|dot'], ['text', 'text box|text|label|heading|title|caption|paragraph'], ['button', 'button|cta'], ['frame', 'frame|artboard|container'], ['line', 'line|divider|rule'], ['card', 'card'], ['image', 'image placeholder|picture placeholder|placeholder|image box|photo placeholder']];
    if (/^(?:add|draw|insert|make|create|put|drop|place|give me|i need|we need|stick|throw)\b/.test(c) && !/\b(?:screen|page|section|variants?|version|dark|light|login|pricing|dashboard)\b/.test(c)) {
      for (const [k, w] of SH) if ((m = new RegExp(`^(?:add|draw|insert|make|create|put|drop|place|give me|i need|we need|stick|throw)\\s+(?:me\\s+)?(?:an?\\s+|another\\s+|one more\\s+|some\\s+|the\\s+)?(?:new\\s+|big\\s+|small\\s+|little\\s+|red\\s+|blue\\s+|round\\s+)?(?:${w})\\b(.*)$`).exec(c))) {
        const tm = /\b(?:that says|saying|reading|with the (?:text|words)|with text|labell?ed|called|:)\s*["“]?(.+?)["”]?$/i.exec(r); const col = colorOf(c);
        return H('canvas.add', { kind: k, ...(tm ? { text: tm[1] } : {}), ...(col ? { color: col } : {}) });
      }
    }
    if (/\b(?:snap|stick|round)\b.*\b(?:to (?:the\s+)?grid|grid)\b|^(?:grid snap|snap to grid|align to (?:the )?grid)$/.test(c) || /\balign\b.*\bto (?:the )?grid\b/.test(c)) return H('canvas.snap', {});
    if (new RegExp(`^(?:delete|erase|get rid of|kill|nuke|bin)\\s+${OBJ}$`).test(c) || /^(?:delete|erase)$/.test(c)) return H('canvas.delete', {});
    if (/^(?:select all|select everything|select all (?:the )?layers|pick everything|grab everything)$/.test(c)) return H('canvas.selectall', {});
    if (/^(?:zoom|zoom in|zoom out|zoom to fit|fit to screen|fit (?:it|everything|all)|show (?:me )?everything|show the whole (?:canvas|thing)|zoom to (?:the )?selection|zoom to 100|actual size|100%?)\b/.test(c) && /\b(?:zoom|fit|everything|whole|actual|100)\b/.test(c)) return H('canvas.zoom', { to: /\bin\b/.test(c) ? 'in' : /\bout\b/.test(c) ? 'out' : /\bselection\b/.test(c) ? 'selection' : /\b(?:100|actual)\b/.test(c) ? '100' : 'fit' });
    return null;
  }

  // ---------- feat/flint-max: design intelligence, copy, sheets, docs and slides with no model ----------
  // The doing lives in app/ui/flintmax.js (palettes, type pairs, style moves, copy helpers, sheet/doc/slide ops); this
  // only reads what people mean. Views: site (website designer), canvas, sheet, doc, deck (ctx.view), else anywhere.
  let FMX = null;
  const FM = () => FMX || (FMX = (typeof module === 'object' && module.exports) ? require('./flintmax.js') : (typeof self !== 'undefined' && self.TribeFlintMax) || null);
  const NUMX = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, single: 1 };
  const numOf = s => (s == null ? 0 : /^\d+$/.test(s) ? +s : NUMX[String(s).toLowerCase()] || 0);
  const FONT_WORDS = [['luxury', 'luxur\\w*|premium|high end|upscale|expensive'], ['elegant', 'elegant|classy|sophisticated|refined|fancy|chic'], ['friendly', 'friendly|approachable|warm|welcoming'],
    ['playful', 'playful|fun|bubbly|quirky|kids|cute'], ['professional', 'professional|corporate|business|serious|trustworthy'], ['techy', 'developer|hacker|coder|code|terminal'], ['modern', 'modern|tech|techy|startup|saas|futuristic|sleek'],
    ['minimal', 'minimal|clean|simple|neutral|plain'], ['retro', 'retro|vintage|8 bit|arcade|gaming'], ['bookish', 'bookish|literary|cozy|cosy|blog|bakery|cafe'], ['classic', 'classic|timeless|traditional|heritage'], ['bold', 'bold|loud|punchy']];
  const fontWord = c => { for (const [k, w] of FONT_WORDS) if (new RegExp(`\\b(?:${w})\\b`).test(c)) return k; return ''; };
  const STYLE_W = [['professional', 'professional|corporate|businesslike|business like|serious|trustworthy|polished|grown up|formal'], ['elegant', 'elegant|classy|sophisticated|refined|fancy|chic'], ['friendly', 'friendly|friendlier|approachable|welcoming|human|cozy|cosy|warmer'],
    ['brutalist', 'brutalist|brutal|brutalism|raw'], ['techy', 'techy|futuristic|high tech|hi tech|startupy'], ['luxury', 'luxury|luxurious|premium|high end|upscale|expensive'], ['retro', 'retro|vintage|old school|groovy'], ['calm', 'calm|zen|peaceful|serene|airy|relaxed'], ['modern', 'modern|contemporary|sleek|fresh']];
  const styleWord = c => { for (const [k, w] of STYLE_W) if (new RegExp(`\\b(?:${w})\\b`).test(c)) return k; return ''; };
  const HEX = /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i;
  function sheetCol(c, r) {
    let m = /\bcol(?:umn)?\s+([a-z]{1,2})\b(?!\s+(?:column|row))/i.exec(r); if (m && !/^(?:of|in|is|by|to|as|at|on)$/i.test(m[1])) return m[1].toUpperCase();
    m = /\b(?:the|my)\s+([a-z][a-z ]{1,24}?)\s+col(?:umn)?s?\b/i.exec(r); if (m && !/^(?:this|that|last|first|next|whole)$/i.test(m[1])) return m[1].toLowerCase();
    m = /\b(?:format|show|make|display|turn|put)\s+(?:the\s+|all\s+(?:the\s+)?)?([a-z][a-z ]{1,20}?)\s+(?:as|in|into)\s+(?:currency|money|dollars?|euros?|pounds?|percent|percentages?|%)/i.exec(r); if (m && !/^(?:this|it|them|column|everything|numbers|values|cells)$/i.test(m[1].trim())) return m[1].trim().toLowerCase();
    m = /\b(?:add up|sum up|tally up|total up|sum|total|average|avg)\s+(?:of\s+)?(?:the\s+|all\s+(?:the\s+)?)([a-z][a-z ]{1,24}?)(?:\s+column)?$/i.exec(r); if (m && !/^(?:this|it|them|column)$/i.test(m[1].trim())) return m[1].trim().toLowerCase();
    m = /\b(?:of|for)\s+(?:the\s+|all\s+(?:the\s+)?)?([a-z][a-z ]{1,24}?)(?:\s+column)?(?:\s+by\b|$|[?.,])/i.exec(r); if (m && !/^(?:this|it|them|that|these|everything|column|the column|rows?)$/i.test(m[1].trim())) return m[1].trim().toLowerCase();
    return '';
  }
  function maxNew(c, r, ctx, hit, view) {
    const F = FM(); if (!F) return null;
    const H = (intent, slots, conf) => hit(intent, slots || {}, conf || 0.986), v = ctx.view, rl = r.toLowerCase();
    const DO = /\b(?:make|turn|give|use|apply|try|pick|choose|set|switch|change|build|create|generate|show|want|need|get|suggest|find|do|add|put|could|can|recolor|recolour|paint)\b/;
    const PAL = /\b(?:palette|palettes|color scheme|colour scheme|colors? scheme|scheme|color palette|colors? (?:inspired by|like|from|based on|around|for)|colou?rs? (?:inspired by|like|based on|around|for))\b/;
    const mood = F.moodOf(c), hex = (HEX.exec(r) || [])[0];
    // ---- sheets ----
    if (v === 'sheet') {
      if (/\b(?:chart|charts|graph|plot|visuali[sz]e|bar chart|line chart|diagram)\b/.test(c) && !/\b(?:remove|delete|no)\b/.test(c)) { const m = /\b(?:of|for|showing)\s+(?:the\s+)?([a-z][a-z ]*?)\s+(?:by|per|over|across)\s+(?:the\s+)?([a-z]+)/i.exec(r); return H('sheet.chart', { ...(m ? { y: m[1].toLowerCase(), x: m[2].toLowerCase() } : {}), type: /\bline\b/.test(c) ? 'line' : 'bar' }); }
      if (/\b(?:total|totals|sum)\s+row\b|\bsums? at the bottom\b|\btotals?\s+(?:at|on)\s+the\s+bottom\b|^add\s+(?:a\s+|the\s+)?totals?$|\b(?:add|put|insert|need|want)\b.*\btotals?\b(?!\s+(?:up|of|for))/.test(c) && !/\bcolumn\b/.test(c)) return H('sheet.total', {});
      if (/\b(?:sort|sorted|order|reorder|arrange|rank)\b/.test(c) && /\b(?:by|from|a to z|z to a|alphabetical|alphabetically|ascending|descending|highest|lowest|biggest|smallest|newest|oldest|it|rows|them)\b/.test(c)) {
        const m = /\bby\s+(?:the\s+)?([a-z][a-z ]*?)(?:\s+(?:column|newest|oldest|highest|lowest|biggest|smallest|ascending|descending|first|a to z|z to a|desc|asc))?(?:[,.]|\s*$|\s+(?:newest|oldest|highest|lowest|biggest|smallest|ascending|descending|a to z|z to a))/i.exec(r);
        const dir = /\b(?:desc|descending|newest|latest|highest|biggest|largest|most|z to a|reverse|top first|big to small|high to low)\b/.test(c) ? 'desc' : 'asc';
        return H('sheet.sort', { dir, ...(m && !/^(?:it|them|this)$/i.test(m[1].trim()) ? { col: m[1].trim().toLowerCase() } : {}) });
      }
      if (/\b(?:currency|dollars?|euros?|pounds?|money|usd|eur|gbp|yen|prices?|percent|percentage|percentages)\b|\$|€|£/.test(rl) && /\b(?:format|show|display|as|make|turn|into|in|use|currency|style)\b/.test(c) && !/\b(?:sum|total|average|chart|sort)\b/.test(c)) {
        const pct = /\b(?:percent|percentage|percentages|%)\b/.test(rl), sym = /\beuros?\b|€|\beur\b/.test(rl) ? '€' : /\bpounds?\b|£|\bgbp\b/.test(rl) ? '£' : /\byen\b|¥/.test(rl) ? '¥' : '$';
        return H('sheet.format', { fmt: pct ? 'percent' : 'currency', sym, ...(sheetCol(c, r) ? { col: sheetCol(c, r) } : {}) });
      }
      const fn = /\b(?:average|avg|mean)\b/.test(c) ? 'average' : /\b(?:min|minimum|lowest|smallest)\b/.test(c) ? 'min' : /\b(?:max|maximum|highest|biggest|largest)\b/.test(c) ? 'max' : /\b(?:count|how many)\b/.test(c) ? 'count' : /\b(?:sum|total|totals|add up|tally|add together)\b/.test(c) ? 'sum' : '';
      if (fn) { const col = sheetCol(c, r); return H('sheet.sum', { fn, ...(col ? { col } : {}) }); }
    }
    // ---- docs ----
    if (v === 'doc') {
      if (/\b(?:table of contents|toc|contents)\b/.test(c)) return H('doc.toc', {});
      if (/\b(?:checklist|check list|checkboxes|checkbox|check boxes|tick boxes|to do list|todo list|todos)\b/.test(c)) return H('doc.checklist', {});
      if (/\b(?:readab\w*|reading level|grade level|flesch|(?:hard|easy) (?:is (?:this|it) )?to read|how (?:hard|easy) is (?:this|it) to read)\b/.test(c)) return H('doc.readability', {});
      if (/\b(?:capitali[sz]\w*|caps|capital letters|title case|sentence case|uppercase the)\b/.test(c)) return H('doc.caps', { mode: /\btitle case\b/.test(c) ? 'title' : 'sentence' });
      if (/\b(?:summari[sz]e|summary|tldr|tl dr|sum (?:it|this) up|gist|recap)\b/.test(c) && !/\b(?:chat|channel|thread|conversation|messages?|tasks?|standup)\b/.test(c)) return H('doc.summary', {});   // "summarize the chat" stays the chat's summary even with a doc open
    }
    // ---- slides: a pitch from a doc, the vision or the readme (here, in the deck, or anywhere) ----
    {
      const slideW = /\b(?:pitch|deck|slides|slide|presentation|keynote|slideshow)\b/;
      const from = /\b(?:from|out of|based on|using)\s+(?:the\s+|our\s+|my\s+|this\s+)?([a-z][\w .-]*?)(?:\s+(?:doc|document|file|page|notes))?(?:\s*,|\s+with\b|$)/i.exec(r) || /\bturn\s+(?:the\s+|our\s+|my\s+|this\s+)?([a-z][\w .-]*?)\s+(?:doc\s+|document\s+)?into\s+(?:a\s+)?(?:pitch|deck|slides|presentation)/i.exec(r);
      if (slideW.test(c) && from && (v === 'deck' || /\b(?:make|create|build|turn|generate|draft|give|do)\b/.test(c))) {
        const nm = /\b(\d+|three|four|five|six|seven|eight|nine|ten)[ -]?slides?\b/i.exec(r) || /\bslides?\s*[:=]?\s*(\d+)\b|,\s*(\d+)\s+slides\b/i.exec(r);
        const n = nm ? numOf(nm[1] || nm[2]) : 0, src = from ? from[1].trim().toLowerCase().replace(/\s+\d+\s+slides?$/, '') : '';
        if (src || /\bpitch\b/.test(c)) return H('deck.pitch', { ...(n ? { n } : {}), ...(src && !/^(?:this|it)$/.test(src) ? { from: src } : v === 'doc' || v === 'deck' ? { from: 'this' } : {}) }, 0.975);
      }
    }
    // ---- the website designer ----
    if (view === 'site') {
      if (PAL.test(c) || (/\bcolou?rs?\b/.test(c) && mood && DO.test(c)) || (/^(?:a\s+)?(?:\w+\s+){0,2}(?:palette|colou?r scheme)$/.test(c))) return H('site.palette', { ...(mood ? { mood } : {}), ...(hex ? { color: { name: '', hex: hex.toLowerCase() } } : {}) });
      if (/\b(?:fonts?|typefaces?|type pairing|font pairing|typography)\b/.test(c) && !/\b(?:fraunces|grotesk|inter|jetbrains|silkscreen|bricolage|instrument|serif|sans|mono|monospace|bigger|smaller|size)\b/.test(c) && fontWord(c) && !/\b(?:pixel|different|another|other)\b/.test(c)) return H('site.fontpair', { mood: fontWord(c) || 'modern' });
      if (/\b(?:contrast|accessib\w*|wcag|a11y|legib\w*|colorblind)\b/.test(c) || /\b(?:easier|hard|harder|easy) to read on\b|\bread(?:able)? (?:on|against) (?:the|that|this) background\b/.test(c)) return H('site.contrast', {});
      if (/\b(?:readab\w*|reading level|grade level|flesch)\b/.test(c) || /\bhow (?:hard|easy) is (?:it|this|the (?:page|site|copy|text)) to read\b|\b(?:hard|easy) to read\b/.test(c)) return H('site.readability', {});
      if (/\b(?:title case|capitali[sz]\w*|caps)\b/.test(c)) return H('site.titlecase', {});
      if (/\b(?:headlines?|titles?|taglines?)\b/.test(c) && /\b(?:ideas?|options?|alternatives?|alternative|variants?|variations?|suggest\w*|some|few|other|another|different|brainstorm)\b/.test(c) && !/\b(?:change|set|rename|to say|should say|make the)\b/.test(c)) return H('site.headlines', {});
      if (/\bwhat should (?:my|the|this|our) (?:button|cta|call to action) say\b|\b(?:call to action|cta|button text|button copy|button words?)\b.*\b(?:ideas?|options?|suggest\w*|better|alternatives?)\b|\b(?:suggest|better|ideas? for)\b.*\b(?:call to action|cta|button text)\b/.test(c)) return H('site.cta', {});
      let m;
      if ((m = /\b(\d|one|two|three|four|five|single)\s+(?:plans?|tiers?|options?|packages?|columns?|levels?)\b/.exec(c)) && /\b(?:pricing|prices?|price|plans?|tiers?|packages?)\b/.test(c) && !/\b(?:highlight|feature)\b/.test(c) && !/[$€£]\s?\d/.test(r)) return H('site.price.plans', { n: numOf(m[1]) });
      if ((/\b(?:highlight\w*|featured|emphasi[sz]e|stand out|pop|recommended|most popular|spotlight)\b/.test(c) || /\bfeature (?:the|that|this|our)\b/.test(c)) && !/\b(?:called|named|titled)\b/.test(c) && /\b(?:plan|tier|one|package|option|middle|pro|basic|starter|team|free|business|premium)\b/.test(c) && !/\bsection\b(?!.*\bplan)/.test(c)) {
        const w = /\b(middle|center|centre|first|second|third|last)\b/.exec(c) || /\b(?:the\s+)?([a-z]+)\s+(?:plan|tier|package|option)\b/.exec(c);
        const which = w ? (w[1] === 'centre' || w[1] === 'center' ? 'middle' : w[1]) : 'middle';
        return H('site.price.highlight', { which: /^(?:this|that|one|the)$/.test(which) ? 'middle' : which });
      }
      if ((m = /^(?:(?:now\s+|and\s+|ok\s+)?(?:do\s+)?(?:the\s+)?same(?:\s+thing|\s+again)?|do (?:that|it|this)(?: again)?|repeat (?:that|it|this))\s+(?:on|for|to|in|with)\s+(?:the\s+|my\s+)?([a-z][a-z ]*?)(?:\s+page)?(?:\s+too)?$/.exec(c))) return H('site.same', { page: m[1] });
      if (/^(?:make\s+)?(?:it|this|that|this section|the section)\s+(?:a\s+(?:bit|little|lot)\s+|much\s+)?(?:bigger|larger|smaller|tinier)(?:\s+please)?$|^(?:bigger|smaller|larger)(?:\s+please)?$|^make\s+(?:it|this|that)\s+(?:a\s+(?:bit|little|lot)\s+)?(?:bigger|larger|smaller)\b/.test(c)) return H('site.size', { dir: /\b(?:smaller|tinier)\b/.test(c) ? 'smaller' : 'bigger' });
      if (/\b(?:tidy|tidy up|neaten|clean up the (?:spacing|layout)|fix the (?:spacing|layout|alignment)|even (?:out|up) the spacing|messy|cluttered|^align everything$|^line everything up$|balanced|consistent spacing|spacing rhythm|sort it out)\b/.test(c) && !/\b(?:text|words|copy)\b/.test(c)) return H('site.tidy', {});
      const st = styleWord(c);
      if (st && (/\b(?:more|less|feel|look|vibe|style|make|give|go|bit)\b/.test(c) || c.split(' ').length <= 3) && !/\b(?:fonts?|palette|colou?rs?|text|words|copy|wording|tone|headline|tagline|button)\b/.test(c)) return H('site.style', { style: st });
    }
    // ---- the design canvas ----
    if (view === 'canvas') {
      if (PAL.test(c) || /\b(?:recolou?r|repaint)\b/.test(c) && (mood || hex)) return H('canvas.palette', { ...(mood ? { mood } : {}), ...(hex ? { color: { name: '', hex: hex.toLowerCase() } } : {}) });
      const K = [['cardgrid', 'card grid|grid of cards|cards grid|card layout|grid of card|cards'], ['navbar', 'nav bar|navbar|navigation bar|navigation|top bar|header bar|menu bar|top nav|header'], ['footer', 'footer'], ['sidebar', 'sidebar|side bar|side menu|side nav'],
        ['tabbar', 'tab bar|tabbar|bottom nav|bottom navigation|bottom bar'], ['modal', 'modal|dialog|popup|pop up|confirm box'], ['form', 'sign up form|signup form|registration form|contact form|form'], ['hero', 'hero section|hero']];
      if (/\b(?:add|put|insert|drop|make|create|turn|give|place|stick|throw|need|want|build|draw|convert|arrange)\b/.test(c) && !/\b(?:screen|page|website|site)\b(?!.*\b(?:top|bottom)\b)/.test(c.replace(/\bto the screen\b|\bon the screen\b/, ''))) {
        for (const [k, w] of K) if (new RegExp(`\\b(?:${w})\\b`).test(c) && !(k === 'hero' && /\blanding\b|\bhero for\b/.test(c))) return H('canvas.recipe', { kind: k, ...(k === 'cardgrid' && ctx.selection && /\b(?:this|these|them|those|it)\b/.test(c) ? { from: 'selection' } : {}) });
      }
    }
    // ---- anywhere ----
    if (!view) {
      let m;
      if (PAL.test(c) && (mood || hex || /\b(?:show|make|give|generate|suggest|need|want|create)\b/.test(c))) return H('design.palette', { ...(mood ? { mood } : {}), ...(hex ? { color: { name: '', hex: hex.toLowerCase() } } : {}), text: r }, 0.975);
      if (/\b(?:fonts?|typefaces?)\b/.test(c) && /\b(?:pair|pairs|pairing|go (?:well )?together|match|for (?:a|an|my|our)|that (?:feel|look)|feel|look)\b/.test(c)) return H('design.fonts', { mood: fontWord(c) || 'modern', text: r }, 0.975);
      if ((m = /^(?:title ?case|capitali[sz]e)(?:\s+(?:this|these|the words|it))?\s*:?\s+(.+)$/i.exec(r))) return H('copy.titlecase', { text: m[1].trim() }, 0.975);
      if ((m = /\bheadlines?\s+(?:ideas?|options?)?\s*(?:for|about)\s+(?:a\s+|an\s+|my\s+|our\s+)?(.+)$/i.exec(r)) || (m = /\b(?:ideas?|options?)\s+for\s+(?:a\s+)?headlines?\s+(?:for|about)\s+(?:a\s+|an\s+|my\s+|our\s+)?(.+)$/i.exec(r))) return H('copy.headlines', { about: m[1].replace(/[?.!]+$/, '').trim() }, 0.975);
      if ((m = /\b(?:call to action|cta|button text)\s+(?:ideas?|options?)?\s*for\s+(?:a\s+|an\s+|my\s+|our\s+)?(.+)$/i.exec(r))) return H('copy.cta', { about: m[1].replace(/[?.!]+$/, '').trim() }, 0.975);
      if ((m = /^(?:how readable is|readability (?:of|score for|check)|check (?:the )?readability of)\s*:?\s+(.{12,})$/i.exec(r))) return H('copy.readability', { text: m[1].trim() }, 0.975);
    }
    return null;
  }
  function design(c, raw, ctx) {
    const view = ctx.view === 'canvas' ? 'canvas' : (ctx.view === 'site' || (ctx.view === 'preview' && ctx.site)) ? 'site' : '';
    const out = [], hit = (intent, slots, conf) => { out.push({ intent, area: intent === 'lesson' ? 'help' : intent.startsWith('canvas.') ? 'canvas' : 'build', slots: slots || {}, conf: conf || (view === 'canvas' ? 0.98 : 0.97), req: {}, label: '' }); return out; };
    const r = String(raw || '').trim(), rl = r.toLowerCase();
    const lf = lessonOf(c); if (lf) return hit('lesson', { feature: lf }, 0.97);
    { const z = maxNew(c, r, ctx, hit, view); if (z) return z; }   // feat/flint-max
    const IMG = /\b(?:image|images|picture|pictures|photo|photos|avatar|img|headshot|portrait|cover|pfp)\b/;
    if (view) {
      const cv = view === 'canvas';
      if (!cv) { const y = siteNew(c, r, ctx, hit); if (y) return y; const x = siteMore(c, r, ctx, hit, false); if (x) return x; }
      else { const y = canvasNew(c, r, ctx, hit); if (y) return y; }
      // export (the website designer)
      if (!cv && /\b(?:export|download|zip|html|webpage file|web page file|save it as|get the code|code for this|source code|static files?)\b/.test(c) && !IMG.test(c)) return hit('site.export', { fmt: /\bzip\b/.test(c) ? 'zip' : /\b(?:html|webpage|web page)\b/.test(c) ? 'html' : '' });
      // words: "change the headline to …", "the button should say …", "rename the site to …"
      if (!cv) {
        let m = /\b(?:change|set|make|update|edit|have)\s+(?:the\s+)?(headline|title|heading|tagline|subtitle|subheading|intro|button|button text|cta)\s+(?:to\s+say|to\s+read|say|says|read|reads|to|into)\s+(.+)$/i.exec(r)
          || /\b(?:the\s+)?(headline|title|heading|tagline|button|cta)\s+should\s+(?:say|read|be)\s+(.+)$/i.exec(r);
        if (m) { const f = m[1].toLowerCase(); return hit('site.text', { field: FIELD(f), text: m[2].replace(/^["“']|["”'.]+$/g, '').trim() }); }
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
      let m = new RegExp(`\\b(?:rename|call|retitle)\\s+(?:this|the|current|my|our)\\s+(?:[a-z]+\\s+)?${PG}\\s+(?:to\\s+|as\\s+)?(.+)$`, 'i').exec(r) || new RegExp(`\\bchange\\s+(?:the\\s+)?${PG}(?:'s)?\\s+(?:name|title)\\s+to\\s+(.+)$`, 'i').exec(r);
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
      if (/\balt\b|\bscreen readers?\b|\bdescribe (?:the|this) (?:image|picture|photo)\b/.test(c)) { const am = /\balt(?: text)?\s*(?:to\s+|as\s+|:\s*)(.+)$/i.exec(r); if (cv) return hit('canvas.image', { action: 'alt' }); return hit('site.image.alt', am ? { alt: am[1].replace(/["“”.]+$/g, '').trim() } : {}); }
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
          if (dir && /\b(?:move|put|place|shift|bump|push)\b/.test(c) && !/\b(?:put|place|stick|drop|add|insert)\s+(?:in\s+)?(?:a|an|some|another|new|one more)\b/.test(c)) return hit('site.block.move', { block: blk, dir });   // "put a call to action before the footer" adds one; "put the faq above the footer" moves it
          if (/\b(?:delete|get rid of|drop|lose|kill|without|take out|ditch|scrap|cut|nix|toss|lose)\b/.test(c) && !/\bdrop in\b/.test(c) || /^no\s/.test(c)) return hit('site.block.remove', { block: blk });
          if (/\b(?:add|put|insert|include|want|need|show|embed|stick|throw|drop in|give me|let)\b/.test(c) || /\bsection$/.test(c)) return hit('site.block.add', { block: blk });
        }
        const col = colorOf(c);
        if (col && /\b(?:accent|colou?r|main|brand|primary|buttons?|make it|make everything|use|turn it)\b/.test(c)) return hit('site.color', { color: col });
        if (/\b(?:theme|look|style|preset|vibe|feel)\b/.test(c) || (/^make it (?:look )?(?:a bit |a little )?more\s/.test(c) && presetOf(c))) { const p = presetOf(c); return hit('site.theme', p ? { preset: p } : {}); }
      }
    }
    if (!view && /\b(?:website|site|web page|webpage)\b/.test(c)) { const x = siteMore(c, r, ctx, hit, true); if (x) return x; }
    // open the website designer
    if (/\b(?:website designer|site designer|designer)\b/.test(c) && !/\bhire\b/.test(c)) return hit('site.open', {}, 0.96);
    if (/\b(?:edit|design|redesign|work on)\s+(?:my|our|the)\s+(?:website|site)$/.test(c) || /\b(?:turn|make)\s+(?:this|it)\s+(?:into\s+)?(?:a\s+)?(?:real\s+)?(?:website|site)\b/.test(c)) return hit('site.open', {}, 0.96);
    // a template from what the site is for
    if (view === 'site' && !ctx.start && !/\b(?:template|start over|from scratch)\b/.test(c)) return out;   // in the designer a template needs asking for, unless nothing is designed yet
    if (/\b(?:post|doc|email|essay|letter|memo|note|task|slides|sheet|tweet|caption|poem|story)\b/.test(c) && !/\btemplate\b/.test(c)) return out;
    if (/^(?:why|how come|what is wrong|whats wrong|is it normal|should i|do you think|what do you think)\b/.test(c) || /\b(?:lagging|laggy|slow|broken|crash(?:es|ing)?|bug(?:gy)?|not working)\s*$/.test(c)) return out;   // a question about a thing is not a request to build a site for it
    let best = null, bl = 0;
    for (const [k, tags] of Object.entries(TPL_TAGS)) for (const tg of tags) if (tg.length > bl && new RegExp(`\\b${tg}\\b`).test(c)) { best = k; bl = tg.length; }
    if (!best) return out;
    const tagOnly = new RegExp(`^(?:(?:a|an|my|the)\\s+)?(?:${TPL_TAGS[best].join('|')})(?:\\s+(?:site|website|page|please))?$`).test(c);
    const trig = tagOnly || /\b(?:site|sites|website|web site|page|homepage|landing|something|online|template|web presence)\b/.test(c) || /\b(?:make|build|create|set up|needs?|wants?|give me|get me|start|launch|show off)\b/.test(c) || /\b(?:i|we)\s+(?:write|run|sell|own|have|am|are|stream|do|make)\b/.test(c) || /\bfor (?:my|our)\b/.test(c);
    const nm = /\b(?:called|named)\s+(.+)$/i.exec(raw);
    if (trig) hit('site.' + best, nm ? { name: nm[1].replace(/["“”.!]+$/g, '').trim() } : {}, /\btemplate\b/.test(c) ? 0.97 : 0.93);
    return out;
  }

  // ---------- feat/flint-unify: when nothing fits, ask instead of shrugging ----------
  // needsAI(text): only a request that really needs generation (long copy, pictures, code, judging) gets the AI card.
  function needsAI(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '') + ' ';
    return /\b(?:write|compose|draft|generate|come up with|invent|brainstorm|rewrite|reword)\b.*\b(?:copy|paragraphs?|story|stories|blog posts?|articles?|essays?|poems?|songs?|lyrics|scripts?|descriptions?|bio|about (?:us|section|page)|slogans?|taglines?|headlines?|names|jokes?|emails?|newsletters?|press release|captions?|tweets?|posts?)\b/.test(t)
      || /\b(?:generate|create|draw|paint|illustrate|render|imagine)\s+(?:me\s+|us\s+)?(?:an?\s+|some\s+|the\s+)?(?:new\s+|ai\s+|cool\s+|cute\s+)?(?:images?|pictures?|illustrations?|logos?|photos?|icons?|artwork|art|mascots?|drawings?|3d models?|portraits?|banners?)\b/.test(t)
      || /\b(?:make|design)\s+(?:me\s+|us\s+)?(?:an?\s+|some\s+)(?:new\s+|ai\s+|cool\s+|cute\s+)?(?:images?|pictures?|illustrations?|logos?|photos?|icons?|artwork|mascots?|drawings?|portraits?)\b/.test(t)
      || /\b(?:code|coding|javascript|typescript|python|functions?|api|database|backend|server|login system|authentication|auth flow|payments?|stripe|checkout flow|animate|animations? (?:for|on|when)|shader|algorithm|refactor|debug|fix (?:the|this|a) bug|multiplayer|ai enemies|leaderboard|save system|physics)\b/.test(t)
      || /\b(?:make it look like|in the style of|look like (?:apple|stripe|airbnb|google|notion|linear)|like (?:apple|stripe|airbnb|notion)s? site)\b/.test(t)
      || /\b(?:translate|critique|what do you think|is (?:this|it) good|review my|give me feedback|rate my|improve (?:the|my|this) (?:design|copy|writing|text))\b/.test(t)
      || /\b(?:poems?|haikus?|limericks?|sonnets?|odes?|verses?|rhymes?|riddles?|raps?|jokes?|bedtime story|short story|fan fiction)\b/.test(t);
  }
  // clarify(text, { view }): one short question with chips that do something real ({ label, say, fill })
  function clarify(text, ctx) {
    const c = prep(text, {}).c, v = (ctx && ctx.view) || 'app', raw = String(text || '').trim(), short = raw.length > 48 ? raw.slice(0, 46) + '…' : raw;
    const ch = l => l.map(x => typeof x === 'string' ? { label: x, say: x.replace(/…$/, ''), fill: /…$/.test(x) } : x);
    const Q = (q, l) => ({ q, chips: ch(l) });
    if (v === 'designer' || v === 'site') {
      if (/\blinks?\b|\burl\b|\bhref\b/.test(c)) return Q('Add a link: what should it say, and where does it go?', [{ label: 'Add a link called…', say: 'add a link called ', fill: true }, 'Make the buttons work', 'Add my instagram']);
      if (/\b(?:pictures?|images?|photos?|pics?|avatar)\b/.test(c)) return Q('Which picture, and what should change?', ['Replace the picture', 'Make the picture round', 'Add a gallery']);
      if (/\b(?:colou?rs?|accent|palette|teal|red|blue|green|pink|purple|orange|brand)\b/.test(c) || colorOf(c)) return Q('Which color should change: the accent, one section, or the whole theme?', ['Make the accent teal', 'Make this section teal', 'Use the ocean theme']);
      if (/\bpages?\b/.test(c)) return Q('Something about pages: which one?', ['Add a page called About', 'Rename this page to…', 'Delete this page']);
      if (/\bbuttons?\b/.test(c)) return Q('Which button, and what should it do?', ['Make the buttons work', 'Add a button that says…', 'Remove the second button']);
      if (/\b(?:sections?|blocks?|parts?)\b/.test(c)) return Q('Which section? Click it in the preview, or pick one:', ['Add a section…', 'Move this section up', 'Hide this section']);
      if (/\b(?:text|words|title|heading|headline|says?|wording|copy)\b/.test(c)) return Q('Which words? Say it like “change the headline to …”.', ['Change the headline to…', 'Footer should say…', 'Change the FAQ title to…']);
      if (/\b(?:fonts?|type|typeface|letters)\b/.test(c)) return Q('Which fonts?', ['Use a serif font', 'Different fonts', 'Use a mono font']);
      return Q(`I'm not sure which edit you mean by “${short}”. Pick one, or say it another way.`, ['Add a link for…', 'Add a section…', 'Change the headline to…', 'Make the buttons work']);
    }
    if (v === 'canvas') {
      if (/\b(?:align|line up|left|right|center|centre)\b/.test(c)) return Q('Align which way? Select two or more layers first.', ['Align these to the left', 'Center them', 'Distribute evenly']);
      if (/\b(?:add|draw|insert|shape|box|circle|text|button)\b/.test(c)) return Q('What should I add?', ['Add a rectangle', 'Add a text that says…', 'Add a button that says…']);
      return Q(`I'm not sure what to do with “${short}” on the canvas. Pick one, or say it another way.`, ['A login screen', 'Tidy up', 'Group them', 'Add a text that says…']);
    }
    if (v === 'preview') return Q(`I'm not sure what to change for “${short}”. Pick something on the page with Edit, or try one of these:`, ['Make the title bigger', 'Reload the preview', 'Show it on a phone', 'Leave a comment']);
    const body = raw.replace(/^(?:please|pls|can you|could you)\s+/i, '');
    return Q(`I'm not sure what to do with “${short}”. Should I…`, [{ label: 'Add it as a task', say: `add a task to ${body}` }, { label: 'Save it as a note', say: `note: ${body}` }, { label: 'Search for it', say: `find ${body}` }, { label: 'What can you do?', say: 'what can you do' }]);
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
    const e = String(s.expr || '').toLowerCase().replace(/\s*(?:times|multiplied by)\s*/g, ' * ').replace(/\s*plus\s*/g, ' + ').replace(/\s*minus\s*/g, ' - ').replace(/\s*(?:divided by|over)\s*/g, ' / ').replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
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
  Object.values(TPL_TAGS).flat().concat(['linktree', 'linkinbio', 'moodboard', 'designer', 'wire', 'clickable', 'functional', 'buttons', 'button', 'export', 'gallery', 'testimonials', 'masonry', 'instagram', 'teach', 'lesson', 'tutorial', 'portfolio', 'photographer', 'screen', 'picture', 'image', 'connect', 'pricing', 'website', 'darker', 'contact', 'point', 'different', 'rounded', 'round', 'paper', 'minimal', 'embed', 'spotify', 'youtube', 'prices', 'section', 'swiss', 'terminal', 'editorial', 'playful', 'masonry', 'headline', 'tagline', 'footer', 'features', 'team', 'reviews', 'questions', 'answers', 'download', 'square', 'circle', 'avatar', 'photo', 'theme', 'layout', 'split', 'faq', 'nowhere', 'anywhere', 'somewhere', 'clickable', 'favicon', 'tighter', 'tighten', 'tight', 'clone', 'duplicate', 'unhide', 'hidden', 'punchier', 'punchy', 'catchier', 'snappier', 'friendlier', 'shorten', 'shorter', 'professional', 'spacing', 'padding', 'compact', 'roomier', 'newsletter', 'stats', 'logos', 'divider', 'separator', 'announcement', 'ribbon', 'fonts', 'font', 'serif', 'monospace', 'grotesk', 'fraunces', 'typography', 'seo', 'meta', 'description', 'google', 'hours', 'opening', 'publish', 'tablet', 'phone', 'mobile', 'desktop', 'comments', 'comment', 'feedback', 'autofill', 'populate', 'repo', 'repository', 'background', 'spotlight', 'alternating', 'forest', 'ocean', 'ivory', 'amber', 'slate', 'haze', 'boring', 'rewrite', 'cleaner', 'fill', 'headings', 'socials', 'essays', 'illustration', 'meetup']).forEach(addWords);
  const FUNC = ['could', 'would', 'should', 'there', 'their', 'about', 'with', 'what', 'when', 'where', 'which', 'this', 'that', 'them', 'they', 'have', 'from', 'your', 'into', 'than', 'then', 'also', 'just', 'some', 'more', 'most', 'very', 'much', 'many', 'such', 'does', 'made', 'like', 'here', 'were', 'will', 'works', 'many', 'look', 'need', 'want', 'know', 'take', 'make', 'work', 'have', 'done', 'left', 'find'];
  ['ack', 'abc', 'ing'].concat(FUNC.filter(w => !['make', 'look', 'need', 'want', 'know', 'take', 'work', 'done', 'left', 'find', 'many', 'have', 'here', 'does', 'what', 'when', 'where', 'which', 'this', 'that', 'with', 'will'].includes(w))).forEach(w => VOCAB.delete(w));
  FUNC.forEach(w => KEEP.add(w));
  // feat/flint-unify: words the new site and canvas commands read (so spelling tolerance never "fixes" them away)
  'trailer trailers swap swaps dupe dup ungroup unlock unhide distribute evenly lock freeze rectangle rect ellipse oval circle artboard placeholder snap grid zoom resize width height wide tall twice halve front back forward backward behind underneath instagram insta tiktok youtube spotify twitter github linkedin facebook twitch soundcloud bandcamp pinterest threads bluesky mastodon discord patreon substack kofi behance dribbble snapchat whatsapp telegram vimeo etsy social socials icon icons handle email phone call map directions address countdown copyright footer announcement banner bio menu nav navigation navbar align alignment justify corners rounder rounding radius sharper language logo testimonial quote review plan tier package team stat metric feature perk dish drink episode gig tour faq question clear empty wipe timer animations motion notifications notifs mute unmute snooze pin unpin react thumbs heart reopen unassign priority urgent prioritize whiteboard inspiration inspo template templates marketplace gigs away offline invisible afk brb sounds'.split(' ').forEach(w => { VOCAB.add(w); KEEP.add(w); });
  'noon midnight morning afternoon evening night tonight weekend week weeks month months day days hour hours minute minutes mins today tomorrow eod eow sept'.split(' ').forEach(w => { VOCAB.add(w); KEEP.add(w); });
  // feat/flint-max: design, copy, sheet, doc and slide words (kept, and typos of them corrected toward them)
  ('palette palettes scheme colours colors colour color mood vibe vibes brutalist brutal brutalism corporate professional elegant classy luxury luxurious premium friendly techy retro vintage calm zen modern autumn sunset ocean forest earthy desert coffee pastel candy '
    + 'spring summer winter nordic lavender berry mint neon cyberpunk midnight cozy cosy contrast accessible accessibility wcag readable readability legible tidy messy spacing balanced neaten headline headlines '
    + 'tagline taglines cta ctas capitalize capitalise capitalization capitalisation caps titlecase pricing tiers tier plans highlight highlighted feature featured popular recommended navbar sidebar tabbar '
    + 'footer hero modal dialog popup card cards grid form signup recolor recolour chart charts graph plot sort sorted order currency dollars dollar euros euro pounds percent percentage total totals '
    + 'reading brainstorm titles title friendlier hard easy harder easier average avg mean minimum maximum column columns row rows contents checklist checkboxes checkbox tldr summary summarize summarise pitch deck presentation slides slide vision readme fonts font pair pairing pairs typeface typefaces').split(' ').forEach(w => { VOCAB.add(w); KEEP.add(w); });

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

  // ---------- meaning cues: other everyday words for what each command does ----------
  // Only read when a word table is loaded and nothing matched: the "did you mean" list then finds a command by the
  // words a person might use instead of ours. Written from plain usage, not from any test set. They never run anything.
  const CUES = {
    'task.add': 'add new task todo to-do chore job item list remember need should must put onto create ticket',
    'task.done': 'done finished completed complete wrapped ticked check off sorted task chore job crossed',
    'task.start': 'start starting begin working on taking doing tackle task chore job mine',
    'task.claim': 'claim take grab mine something work pick up task job',
    'task.assign': 'assign give hand delegate let handle responsible owner task job chore person someone look after',
    'task.unassign': 'unassign take off remove owner free release task nobody',
    'task.review': 'review ready check look over feedback approve task',
    'task.delete': 'delete remove scrap bin trash erase drop cancel discard rid task chore job',
    'task.due': 'due deadline by date push move postpone delay until handed finish before task',
    'task.rename': 'rename retitle call name change title task',
    'task.list': 'tasks list todo to-do chores jobs mine left remaining outstanding overdue still plate have do',
    'task.unassigned': 'unassigned unowned nobody no-one free unclaimed open tasks jobs without owner up grabs',
    'task.reopen': 'reopen not done unfinished again back undo task still open',
    'task.priority': 'priority urgent important top high low critical first matter task',
    'task.accept': 'accept yes agree take on offered task', 'task.decline': 'decline refuse reject pass no offered task',
    'note.add': 'note memo jot write down remember record scribble reminder myself',
    'doc.new': 'doc document page write new draft paper article', 'sheet.new': 'sheet spreadsheet table grid rows columns numbers budget scores tally',
    'deck.new': 'deck slides presentation slideshow pitch talk', 'doc.open': 'open doc document read show page',
    'chat.send': 'tell say announce post message everyone group all team broadcast shout let know chat',
    'dm.send': 'dm private message direct tell whisper text ping person privately',
    'chat.summarize': 'summarize summary recap catch up gist digest short version boil down missed chat conversation talk',
    'chat.pin': 'pin stick keep top message', 'chat.react': 'react emoji thumbs like heart message',
    'event.add': 'event meeting calendar schedule book plan appointment lunch call date time put',
    'cal.show': 'calendar schedule agenda today week coming up happening planned events on',
    'timer': 'timer remind reminder minutes alarm countdown nudge later', 'time.now': 'time date today clock day now',
    'theme.dark-mode': 'dark night dim black lights off darker theme mode colours', 'theme.light': 'light bright white day lights on lighter theme mode',
    'textsize.set': 'text font size bigger larger smaller tiny enlarge zoom letters read', 'lang.set': 'language speak translate french spanish german english tongue',
    'settings.motion': 'motion movement animation animations moving still calm reduce less', 'settings.sound': 'sound sounds noise audio mute quiet silence beep volume',
    'settings.notify': 'notifications notify alerts pings quiet disturb fewer down off', 'settings.away': 'away busy offline invisible status break back',
    'accent.set': 'accent colour color highlight tint', 'personalize.open': 'personalize customise look appearance my style',
    'huddle.start': 'call voice huddle talk speak ring phone audio start join', 'huddle.leave': 'leave hang up end quit exit call huddle',
    'call.video': 'video camera webcam face cam call on', 'call.share': 'share screen show display present screenshare', 'call.present': 'present show demo screen everyone',
    'call.mute': 'mute unmute microphone mic silent quiet', 'call.hand': 'raise hand question turn speak',
    'secretary.summary': 'meeting notes minutes action items decisions decided agreed summary recap secretary',
    'invite': 'invite add bring friend person member someone join tribe people cousin brother sister link',
    'invite.agent': 'invite agent ai assistant bot coding connect join helper bring', 'agent.can': 'agent ai helper allowed can do permission access', 'agent.disconnect': 'agent ai helper disconnect remove pause stop unlink', 'connect.ai': 'connect link hook plug ai agent assistant coding claude codex model',
    'host.start': 'host hosting server online live start share computer others join reach open up', 'host.stop': 'stop hosting offline shut close server down',
    'github.connect': 'github sign log in connect account repo git', 'premium.open': 'plans premium upgrade pricing subscription paid pro tiers buy credits',
    'publish': 'publish ship release launch deploy live public go out world put website site game',
    'preview.open': 'preview live look see open result running app', 'preview.device': 'phone mobile tablet device small screen preview check',
    'preview.reload': 'reload refresh again preview', 'preview.share': 'share preview link send show friend', 'checks.run': 'checks tests run check verify test quality works',
    'build.3d': '3d three dimensional game world build make', 'build.2d': '2d game platformer build make arcade', 'design.new': 'design poster logo banner flyer graphic picture create make art',
    'nav.files': 'files folders documents open browse my', 'nav.settings': 'settings preferences options config setup', 'nav.guide': 'guide handbook manual help docs instructions how-to learn',
    'nav.market': 'marketplace market store shop plugins extensions browse', 'nav.company': 'company business firm organisation our', 'nav.versions': 'versions history earlier older previous past changes snapshots',
    'nav.tasks': 'tasks board todo list open show', 'nav.chat': 'chat messages conversation open show', 'nav.calendar': 'calendar schedule open show', 'nav.people': 'people members team everyone who tribe',
    'nav.money': 'money earnings income payments finances revenue', 'nav.work': 'work jobs gigs find paid', 'nav.search': 'search look find everywhere', 'nav.notes': 'notes memos my open', 'nav.inbox': 'inbox notifications mentions unread waiting',
    'undo': 'undo reverse revert take back cancel last oops mistake', 'redo': 'redo again put back restore repeat', 'tour': 'tour walkthrough show around introduction intro tutorial start guide me',
    'feedback': 'feedback report problem bug complaint suggestion tell makers rate', 'status': 'status progress how doing going update overview news new', 'focus': 'focus next should now priority what work recommend',
    'find': 'find search look where locate hunt track down dig', 'random': 'random pick choose coin flip dice roll draw lots who should', 'calc': 'calculate sum plus minus times divided math percent total', 'convert': 'convert units miles kilometres pounds kilos celsius',
    'people.online': 'online here around active now who present available', 'people.working': 'working doing busy up to who what editing', 'people.where': 'where person is looking at now page', 'people.find': 'find someone who knows skill expert good at can',
    'market.search': 'find plugin extension tool marketplace search for', 'trending': 'trending popular hot top new', 'jam.start': 'jam together session live build collaborate', 'teach': 'teach when say means learn shortcut phrase', 'hello': 'hello hi hey greetings morning',
  };

  // ---------- tier 1: meaning (optional; app/ui/flintembed.js via flintmodel.js) ----------
  // With a local embedding model installed, an unrecognized command's "did you mean" list is ranked by meaning as well
  // as by shared words, so a paraphrase with none of the example's words still finds it. Nothing here decides a
  // command: recognized commands and the fuzzy bar are exactly as without the model.
  let SEM = null, SEMVEC = null, SEMDOCS = null, SEMCUES = null;
  const PA = 0.7, PC = 0.8, PQ = 0.8;   // blends for the word-table path, set on the tuning sets (docs/FLINT-MEANING.md)
  function setSemantic(E) { SEM = E && typeof E.embed === 'function' ? E : null; SEMVEC = null; }
  // what to match by meaning: the corrected text, except that a real word the spell-fixer "corrected" toward a
  // command word ("brother" -> "browser", "shout" -> "short") goes back to what the person typed
  const meant = (toks, c) => SEM && SEM.knows && toks.some(t => t.fixed) ? toks.map(t => { const o = String(t.o || '').toLowerCase().replace(/[^a-z]/g, ''); return t.fixed && o && SEM.knows(o) ? o : t.w; }).join(' ') : c;
  function semNear(q, k) {
    if (!SEM) return [];
    try {
      if (!SEMVEC && !SEM.cover) SEMVEC = EXIDX.docs.map(d => SEM.embed(d.text));
      const out = [];
      if (SEM.cover) {   // the built-in word table: the examples and each command's name, matched word by word, both ways
        if (!SEMDOCS) SEMDOCS = EXIDX.docs.concat(CAT.filter(x => x.label && x.ex.length).map(x => ({ id: x.id, text: x.ex[0], match: x.label })));
        if (!SEMCUES) SEMCUES = CAT.filter(x => CUES[x.id] && x.ex.length).map(x => ({ id: x.id, text: x.ex[0], match: CUES[x.id] }));
        const by = new Map();
        for (const d of SEMDOCS) { const t = d.match || d.text, c1 = SEM.cover(q, t); if (!c1) continue; const sc = c1 * PA + SEM.cover(t, q) * (1 - PA); const o = by.get(d.id); if (!o || sc > o.score) by.set(d.id, { doc: d, score: sc }); }
        for (const d of SEMCUES) { const cu = SEM.cover(q, d.match); if (!cu) continue; const o = by.get(d.id); if (o) o.score = o.score * (1 - PQ) + cu * PQ; else by.set(d.id, { doc: d, score: cu * PQ }); }
        by.forEach(o => { if (o.score >= 0.3) out.push(o); });
      }
      else { const qv = SEM.embed(q); for (let i = 0; i < SEMVEC.length; i++) { const sc = SEM.sim(qv, SEMVEC[i]); if (sc >= 0.3) out.push({ doc: EXIDX.docs[i], score: sc }); } }
      return out.sort((a, b) => b.score - a.score).slice(0, k);
    } catch { return []; }
  }
  function blendAlts(near, sem, skip, ctx) {   // -> [{ intent, example, score, sem? }] best first
    const by = new Map();
    const put = (n, key) => { const tc = CAT.find(x => x.id === n.doc.id); if (n.doc.id === skip || (tc && tc.ctx && !tc.ctx(ctx))) return; const o = by.get(n.doc.id) || { intent: n.doc.id, example: n.doc.text, tf: 0, cos: 0 }; if (n.score > o[key]) { o[key] = n.score; if (key === 'cos' || !o.cos) o.example = n.doc.text; } by.set(n.doc.id, o); };
    near.forEach(n => put(n, 'tf')); sem.forEach(n => put(n, 'cos'));
    return [...by.values()].map(o => ({ intent: o.intent, example: o.example, score: Math.round((SEM && SEM.cover ? o.cos * PC + o.tf * (1 - PC) : o.cos * 0.6 + o.tf * 0.4) * 100 + (o.cos && o.tf ? 5 : 0)) / 100, ...(o.cos ? { sem: true } : {}) })).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  // ---------- split a message into steps ----------
  const VERBS = 'tidy|fix|sort(?! it out| out| that out| this out)|pick|highlight|summarize|summarise|apply|recolor|format|add|make|build|create|tell|message|ping|text|dm|send|open|show|schedule|book|set|switch|change|invite|publish|ship|start|mark|assign|give|remind|post|announce|write|draft|turn|put|move|note|jot|delete|rename|export|reload|find|let';
  function split(raw) {
    let s = String(raw || '').trim().replace(/[.!?]+$/, '').replace(/^(?:(?:hey|hi|ok|okay|yo|so)\b\s*,?\s*)?(?:flint\s*[,:]\s*|flint\s+(?=\p{L}))?/iu, '').replace(/^(?:hey|ok|okay|so|um)\s*,\s*/i, '');
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
    // (a request that needs a writer or an artist keeps its plain list, so Flint's honest "that needs an AI" card still shows)
    if (!best && SEM && !(SEM.cover && needsAI(text))) { const sem = semNear(meant(P.toks, c), 12); if (sem.length) { const bl = blendAlts(near, sem, null, ctx); if (bl.length) { alts.length = 0; alts.push(...bl); } } }
    // a phrase this person taught, said in other words: offered first, never run by itself (the exact phrase still runs at once)
    if (!best && SEM && SEM.score && ctx.learned && ctx.learned.length) { const q = meant(P.toks, c); let bl = null, bs = 0.5; for (const x of ctx.learned) { const sc = SEM.score(q, String(x.say || '')); if (sc >= bs) { bs = sc; bl = x; } } if (bl) { alts.unshift({ intent: 'taught', example: bl.say, score: Math.round(bs * 100) / 100, sem: true, learned: true }); alts.length = Math.min(alts.length, 3); } }
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
      const pv = steps[steps.length - 1];   // "i sell stickers online, make me a shop": two pieces that ask for the same build are one step
      if (pv && s.intent && pv.intent === s.intent && /^(?:site|build|design|canvas)\./.test(s.intent)) { pv.slots = { ...(s.slots || {}), ...(pv.slots || {}) }; pv.conf = Math.max(pv.conf || 0, s.conf || 0); continue; }
      steps.push(s);
    }
    // modifiers glued with a comma: "a merch store for Ember Socks, dark"
    steps.forEach(s => { if (s.slots && typeof s.slots.name === 'string') { const m = /\s*,\s*(dark|light)(?:\s+(?:mode|theme))?$/i.exec(s.slots.name); if (m) { s.slots.name = s.slots.name.slice(0, m.index).trim(); s.slots.mode = m[1].toLowerCase(); } } });
    return { steps, lang: (steps[0] && steps[0].lang) || 'en', alts: [] };
  }

  const catalog = () => CAT.map(x => ({ id: x.id, area: x.area, label: x.label, examples: x.ex.slice() }));
  return { needsAI, clarify, parse, one, split, prep, parseWhen, colorOf, person, taskRef, index, search, catalog, setSemantic, hasSemantic: () => !!SEM, COLORS, THEMES, LANGS, detectLang, version: 1 };
});
