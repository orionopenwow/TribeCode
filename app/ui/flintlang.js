// Flint in the person's language (feat/languages). Everyday requests in Spanish, Portuguese, French, German,
// Japanese, Chinese and Korean are recognised here and handed to Flint's rules in the words those rules know
// ("abre el calendario" -> "open the calendar"). No model, no network: word lists and a little grammar per language.
// What the person named (a task title, a number of minutes) is kept exactly as they wrote it.
//   TribeFlintLang.rewrite(text) -> { text, lang } or null when it is not one of these requests.
// Every Latin-script rule needs at least one word that is not English, so English requests never land here.
// Checked by app/test/flint_lang_test.js (scripts/dev/flint-eval/lang.js: 40 phrasings per language).
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintLang = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const deaccent = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
  const PLACE = { tasks: 'open the tasks', calendar: 'open the calendar', chat: 'open the chat', files: 'open the files', settings: 'open the settings', home: 'go home' };
  const SAY = { dark: 'dark mode', light: 'light mode', time: 'what time is it', undo: 'undo', invite: 'invite a friend', publish: 'publish', huddle: 'start a huddle', bigger: 'make the text bigger', smaller: 'make the text smaller', doc: 'new doc', cafe: 'a website for my bakery', portfolio: 'make my portfolio site' };
  const ENGLISH_BARE = new Set(['chat', 'portfolio', 'timer', 'site', 'agenda', 'home', 'text']);
  // per language: the task opener, places, the words around a place, fixed requests, and the names of languages
  const L = {
    es: {
      task: /^(?:nueva tarea|(?:anade|anadir|agrega|agregar|crea|crear|pon)(?: una)?(?: nueva)? tarea)\s*:?\s+(.+)$/,
      verbs: 'abre|abrir|abreme|muestra|muestrame|mostrar|ensename|ver|ve a|ir a|ir|vamos a|llevame a|llevame|quiero ver', arts: 'el|la|los|las|al|a|mi|mis|de|pagina',
      places: { tasks: 'tareas|lista de tareas', calendar: 'calendario|agenda', chat: 'chat|conversacion', files: 'archivos|ficheros', settings: 'ajustes|configuracion|preferencias', home: 'inicio|pagina de inicio|pagina principal' },
      dark: /\b(?:modo|tema) oscuro\b/, light: /\b(?:modo|tema) claro\b/, time: /\bque hora (?:es|son)\b|\b(?:dime|cual es) la hora\b/, undo: /^(?:deshacer|deshaz|deshazlo)(?: eso| esto| lo ultimo)?$/,
      invite: /\binvit(?:a|ar|o|emos)\b/, publish: /^public(?:ar|a|alo|arlo)(?: (?:esto|eso|ya|el sitio|la pagina))?$/, huddle: /\b(?:empieza|empezar|inicia|iniciar|comienza|comenzar)\b.*\b(?:llamada|reunion)\b/,
      timer: /\b(?:temporizador|cronometro)\b\D*(\d+)\s*min/, bigger: /\b(?:texto|letra|fuente)\b.*\bmas grande\b/, smaller: /\b(?:texto|letra|fuente)\b.*\bmas pequen[ao]\b/,
      doc: /^(?:nuevo documento|crea(?:r)?(?: un)?(?: nuevo)? documento)$/, langCue: /\b(?:idioma|habla|hablame|hablar)\b/,
      langs: { ingles: 'english', espanol: 'spanish', castellano: 'spanish', frances: 'french', aleman: 'german', portugues: 'portuguese', japones: 'japanese', chino: 'chinese', coreano: 'korean' },
      cafe: /\b(?:sitio|pagina|web)\b.*\b(?:para|mi)\b.*\b(?:panaderia|cafeteria|cafe|restaurante|pasteleria)\b/, portfolio: /\bportafolio\b|\b(?:sitio|pagina)\b.*\bmostrar\b/,
    },
    pt: {
      task: /^(?:nova tarefa|(?:adiciona|adicionar|adicione|cria|criar|acrescenta|poe)(?: uma)?(?: nova)? tarefa)\s*:?\s+(.+)$/,
      verbs: 'abre|abrir|abra|mostra|mostra me|mostrar|ver|vai para|ir para|ir a|ir|leva me a|leva me para|leva me|quero ver', arts: 'o|a|os|as|ao|para|meus|minhas|meu|minha|de|pagina',
      places: { tasks: 'tarefas|lista de tarefas', calendar: 'calendario|agenda', chat: 'chat|conversa', files: 'arquivos|ficheiros', settings: 'configuracoes|definicoes|ajustes', home: 'inicio|pagina inicial|pagina de inicio' },
      dark: /\b(?:modo|tema) escuro\b/, light: /\b(?:modo|tema) claro\b/, time: /\bque horas? (?:sao|e)\b|\b(?:diz|diga) me as horas\b|\bme diz as horas\b/, undo: /^desfaz(?:er)?(?: isso| isto)?$/,
      invite: /\bconvid(?:a|ar|o|e)\b/, publish: /^public(?:ar|a|ue)(?: (?:isso|isto|ja|o site|a pagina))?$/, huddle: /\b(?:comeca|comecar|inicia|iniciar)\b.*\b(?:chamada|reuniao|ligacao)\b/,
      timer: /\b(?:temporizador|cronometro)\b\D*(\d+)\s*min/, bigger: /\b(?:texto|letra|fonte)\b.*\b(?:maior|mais grande)\b/, smaller: /\b(?:texto|letra|fonte)\b.*\b(?:menor|mais pequen[ao])\b/,
      doc: /^(?:novo documento|cria(?:r)?(?: um)?(?: novo)? documento)$/, langCue: /\b(?:idioma|lingua|fala|falar|fale)\b/,
      langs: { ingles: 'english', espanhol: 'spanish', frances: 'french', alemao: 'german', portugues: 'portuguese', japones: 'japanese', chines: 'chinese', coreano: 'korean' },
      cafe: /\b(?:site|pagina)\b.*\b(?:para|minha|meu)\b.*\b(?:padaria|cafe|cafeteria|restaurante|pastelaria)\b/, portfolio: /\b(?:faz|fazer|cria|meu)\b.*\bportfolio\b|\b(?:site|pagina)\b.*\bmostrar\b/,
    },
    fr: {
      task: /^(?:nouvelle tache|(?:ajoute|ajouter|cree|creer)(?: une)?(?: nouvelle)? tache)\s*:?\s+(.+)$/,
      verbs: 'ouvre|ouvrir|montre|montre moi|affiche|voir|va|aller|ramene moi|emmene moi|je veux voir', arts: 'le|la|les|l|au|aux|a|mes|ma|mon|des|de|d|page',
      places: { tasks: 'taches|liste des taches|liste de taches', calendar: 'calendrier|agenda', chat: 'chat|discussion|conversation', files: 'fichiers', settings: 'reglages|parametres', home: 'accueil|page d accueil' },
      dark: /\b(?:mode|theme) sombre\b/, light: /\b(?:mode|theme) clair\b/, time: /\bquelle heure\b|\bdonne moi l heure\b|\bil est quelle heure\b/, undo: /^annule(?:r)?(?: ca| cela)?$/,
      invite: /\binvit(?:e|er)\b.*\b(?:ami|amie|amis|quelqu un|personne)\b/, publish: /^publie(?:r)?(?: le| la| ca| le site| la page)?$/, huddle: /\b(?:demarre|demarrer|lance|lancer|commence|commencer)\b.*\b(?:appel|reunion)\b/,
      timer: /\b(?:minuteur|minuterie|chrono)\b\D*(\d+)\s*min/, bigger: /\bagrandi[sr]?\b.*\b(?:texte|police)\b|\b(?:texte|police)\b.*\bplus (?:grand|gros)/, smaller: /\b(?:texte|police)\b.*\bplus petit|\breduis\b.*\b(?:texte|police)\b/,
      doc: /^(?:nouveau document|cree(?:r)?(?: un)?(?: nouveau)? document)$/, langCue: /\b(?:langue|parle|parler|parlez)\b/,
      langs: { anglais: 'english', espagnol: 'spanish', francais: 'french', allemand: 'german', portugais: 'portuguese', japonais: 'japanese', chinois: 'chinese', coreen: 'korean' },
      cafe: /\b(?:site|page)\b.*\b(?:pour|ma|mon)\b.*\b(?:boulangerie|cafe|restaurant|patisserie)\b/, portfolio: /\b(?:fais|cree|mon)\b.*\bportfolio\b|\b(?:site|page)\b.*\bmontrer\b/,
    },
    de: {
      task: /^(?:neue aufgabe|(?:fuge|erstelle)(?: eine)?(?: neue)? aufgabe(?: hinzu)?)\s*:?\s+(.+?)(?: hinzu)?$/,
      verbs: 'offne|zeig|zeige|zeig mir|zeige mir|geh|gehe|bring mich', arts: 'die|den|das|der|meine|zu|zum|zur', tail: 'gehen|offnen|anzeigen|zeigen',
      places: { tasks: 'aufgaben|aufgabenliste', calendar: 'kalender', chat: 'chat', files: 'dateien', settings: 'einstellungen', home: 'startseite' },
      dark: /\bdunkelmodus\b|\bdunkle[sn]? (?:design|thema|modus)\b/, light: /\bheller modus\b|\bhellmodus\b|\bhelle[sn]? (?:design|thema)\b/, time: /\bwie spat\b|\buhrzeit\b|\bwie viel uhr\b/, undo: /^(?:mach das )?ruckgangig(?: machen)?$/,
      invite: /\blade\b.*\bein\b|\beinladen\b/, publish: /^veroffentliche?n?(?: es| das| die seite)?$/, huddle: /\b(?:starte|starten|beginne)\b.*\b(?:anruf|besprechung|gesprach)\b|\b(?:anruf|sprachbesprechung|besprechung) starten\b/,
      timer: /\bstelle?\b.*\btimer\b\D*(\d+)|\btimer\b\D*(\d+)\s*minuten/, bigger: /\b(?:text|schrift)\b.*gro(?:ß|ss)er|gro(?:ß|ss)ere schrift/, smaller: /\b(?:text|schrift)\b.*kleiner|kleinere schrift/,
      doc: /^(?:neues dokument|erstelle(?: ein)?(?: neues)? dokument)$/, langCue: /\b(?:sprache|sprich|sprechen)\b/,
      langs: { englisch: 'english', spanisch: 'spanish', franzosisch: 'french', deutsch: 'german', portugiesisch: 'portuguese', japanisch: 'japanese', chinesisch: 'chinese', koreanisch: 'korean' },
      cafe: /\b(?:website|webseite|seite)\b.*\b(?:fur|meine?)\b.*\b(?:backerei|cafe|restaurant|konditorei)\b/, portfolio: /\b(?:mach|erstelle|mein)\b.*\bportfolio\b|\bseite\b.*\bzeigen\b/,
    },
    ja: {
      cjk: true, task: /^(?:新しいタスク|新規タスク|タスクを?追加)[:：\s]*(.+)$/,
      nav: p => new RegExp('^(?:' + p + ')(?:を|に|へ)?(?:開いて|開く|見せて|表示して|表示|移動して|移動|行く|行って|戻る|戻って)?(?:ください)?$'),
      places: { tasks: 'タスク(?:一覧|リスト)?', calendar: 'カレンダー', chat: 'チャット', files: 'ファイル', settings: '設定', home: 'ホーム(?:画面)?' },
      dark: /ダーク|暗い(?:テーマ|モード)/, light: /ライト(?:モード|テーマ)|明るい(?:テーマ|モード)/, time: /何時|時間を教えて|時刻/, undo: /元に戻|取り消/, invite: /招待/, publish: /公開/, huddle: /(?:通話|ミーティング|会議).*(?:始め|開始|スタート)/,
      timer: /(\d+)\s*分.*タイマー|タイマー\D*(\d+)\s*分/, bigger: /(?:文字|フォント|テキスト).*大き/, smaller: /(?:文字|フォント|テキスト).*小さ/, doc: /(?:新しい|新規)ドキュメント|ドキュメントを?(?:作って|作成|作る)/, langCue: /言語|話して|にして|切り替え/,
      langs: { 英語: 'english', スペイン語: 'spanish', フランス語: 'french', ドイツ語: 'german', ポルトガル語: 'portuguese', 日本語: 'japanese', 中国語: 'chinese', 韓国語: 'korean' },
      cafe: /(?:パン屋|カフェ|喫茶店|レストラン).*(?:サイト|ページ)/, portfolio: /ポートフォリオ|作品.*(?:サイト|ページ)/,
    },
    zh: {
      cjk: true, task: /^(?:新任务|新建任务|添加任务|加个任务|创建任务)[:：\s]*(.+)$/,
      nav: p => new RegExp('^(?:打开|去|看看|查看|给我看|带我去|回到|显示)?(?:我的)?(?:' + p + ')$'),
      places: { tasks: '任务(?:列表)?', calendar: '日历', chat: '聊天', files: '文件', settings: '设置', home: '首页|主页' },
      dark: /深色|暗色|黑暗模式|夜间模式/, light: /浅色|亮色|明亮/, time: /几点|告诉我时间|现在时间/, undo: /撤销|撤回/, invite: /邀请/, publish: /发布/, huddle: /(?:开始|发起).*(?:通话|会议|语音)/,
      timer: /(\d+)\s*分钟.*计时|计时器\D*(\d+)\s*分钟/, bigger: /(?:文字|字体|字).*大/, smaller: /(?:文字|字体|字).*小/, doc: /新建文档|新文档|创建.*文档/, langCue: /语言|说|改成|切换/,
      langs: { 英语: 'english', 英文: 'english', 西班牙语: 'spanish', 法语: 'french', 德语: 'german', 葡萄牙语: 'portuguese', 日语: 'japanese', 中文: 'chinese', 韩语: 'korean' },
      cafe: /(?:面包店|咖啡店|咖啡馆|餐厅).*(?:网站|页面|网页)/, portfolio: /作品集|展示.*作品.*网站/,
    },
    ko: {
      cjk: true, task: /^(?:할\s?일 추가|새 작업|새 할\s?일|작업 추가)[:：\s]*(.+)$/,
      nav: p => new RegExp('^(?:내\\s)?(?:' + p + ')(?:으로|로|을|를)?\\s?(?:열어줘|열어 줘|열어|열기|보여줘|보여 줘|이동|가기|가줘|데려다줘)?$'),
      places: { tasks: '할\\s?일(?: 목록)?|작업 목록', calendar: '캘린더|달력', chat: '채팅', files: '파일', settings: '설정', home: '홈(?: 화면)?' },
      dark: /다크|어두운/, light: /라이트|밝은/, time: /몇 시|시간 알려/, undo: /실행\s?취소|취소해|되돌려/, invite: /초대/, publish: /게시/, huddle: /(?:통화|회의|허들).*시작/,
      timer: /(\d+)\s*분.*타이머|타이머\D*(\d+)\s*분/, bigger: /(?:글자|글꼴|글씨|텍스트).*(?:크게|키워)/, smaller: /(?:글자|글꼴|글씨|텍스트).*(?:작게|줄여)/, doc: /새 문서|문서.*만들/, langCue: /언어|말해|바꿔/,
      langs: { 영어: 'english', 스페인어: 'spanish', 프랑스어: 'french', 독일어: 'german', 포르투갈어: 'portuguese', 일본어: 'japanese', 중국어: 'chinese', 한국어: 'korean' },
      cafe: /(?:빵집|카페|식당).*(?:웹사이트|사이트|페이지)/, portfolio: /포트폴리오|작업.*보여줄.*사이트/,
    },
  };
  const SCRIPT = { ja: /[぀-ヿ]/, ko: /[가-힯]/, zh: /[㐀-鿿]/ };
  // compiled once: the place rules of each language
  const NAV = {};
  for (const [code, r] of Object.entries(L)) {
    NAV[code] = Object.entries(r.places).map(([place, words]) => [place, r.cjk ? r.nav(words)
      : new RegExp('^(?:(?:' + r.verbs + ')\\s+)?(?:(?:' + r.arts + ')\\s+)*(' + words + ')' + (r.tail ? '(?:\\s+(?:' + r.tail + '))?' : '') + '$')]);
  }
  // The website editor's sentences (feat/site-editor2 round 3): "make this bigger", "hide this on phones", "move this up",
  // "what should we update on the site"… said in each language about the thing that is selected. [rule, the English words].
  const ED_SAY = { bigger: 'make this bigger', smaller: 'make this smaller', bold: 'make this bold', center: 'center this', up: 'move this up', down: 'move this down', remove: 'remove this', dup: 'duplicate this', hide: 'hide this on phones', accent: 'make this the main colour', ideas: 'what should we update on the site', decided: 'apply what we decided' };
  const ED = {
    es: { it: '(?:esto|eso|lo)', bigger: /^(?:haz|pon|hacer) (?:esto|eso|lo) mas grande$|^agranda (?:esto|eso)$/, smaller: /^(?:haz|pon|hacer) (?:esto|eso|lo) mas pequeno$|^(?:achica|reduce) (?:esto|eso)$/, bold: /^(?:pon|haz) (?:esto|eso|lo) en negrita$|^(?:esto|eso) en negrita$/, center: /^centra(?:r)? (?:esto|eso)$/, up: /^(?:mueve|sube|mover|subir) (?:esto|eso)(?: (?:hacia )?arriba)?$/, down: /^(?:mueve|mover) (?:esto|eso) (?:hacia )?abajo$|^baja(?:r)? (?:esto|eso)$/, remove: /^(?:elimina|borra|quita|eliminar|borrar|quitar) (?:esto|eso)$/, dup: /^duplica(?:r)? (?:esto|eso)$/, hide: /^ocult(?:a|ar) (?:esto|eso) en (?:los )?(?:moviles|telefonos|celulares)$/, accent: /^(?:pon|haz) (?:esto|eso|lo) (?:del|con el|en el) color principal$/, ideas: /^que (?:deberiamos|debemos|hay que) (?:actualizar|cambiar) en (?:el sitio|la web|la pagina)$/, decided: /^aplica(?:r)? lo que (?:decidimos|acordamos)$/, say: /^(?:cambia|cambiar) (?:esto|eso) (?:a|por)\s+(.+)$/ },
    pt: { bigger: /^(?:deixa|deixe|faz|faca|torna) (?:isso|isto) maior$|^aument(?:a|e|ar) (?:isso|isto)$/, smaller: /^(?:deixa|deixe|faz|faca|torna) (?:isso|isto) menor$|^diminu(?:i|a|ir) (?:isso|isto)$/, bold: /^(?:coloca|coloque|poe|deixa|deixe) (?:isso|isto) em negrito$|^(?:isso|isto) em negrito$/, center: /^centraliz(?:a|e|ar) (?:isso|isto)$|^centr(?:a|e|ar) (?:isso|isto)$/, up: /^(?:move|mova|mover|sobe|suba) (?:isso|isto)(?: para cima)?$/, down: /^(?:move|mova|mover) (?:isso|isto) para baixo$|^(?:desce|desca) (?:isso|isto)$/, remove: /^(?:remove|remova|remover|apaga|apague|apagar|exclui|exclua|tira|tire) (?:isso|isto)$/, dup: /^duplic(?:a|ar|ue) (?:isso|isto)$/, hide: /^(?:oculta|oculte|ocultar|esconde|esconda|esconder) (?:isso|isto) (?:no|nos|em) (?:celular|celulares|telemovel|telemoveis|telefones)$/, accent: /^(?:deixa|deixe|coloca|coloque|poe) (?:isso|isto) (?:na|com a|da) cor principal$/, ideas: /^o que (?:devemos|deveriamos|temos que|precisamos) (?:atualizar|mudar) no site$/, decided: /^aplic(?:a|ar|ue) o que (?:decidimos|combinamos)$/, say: /^(?:muda|mude|mudar|troca|troque) (?:isso|isto) para\s+(.+)$/ },
    fr: { bigger: /^(?:agrandis|agrandir) (?:ca|ceci|cela)$|^(?:rends|mets) (?:ca|ceci|cela) (?:en )?plus grand$/, smaller: /^(?:reduis|reduire|retrecis) (?:ca|ceci|cela)$|^(?:rends|mets) (?:ca|ceci|cela) (?:en )?plus petit$/, bold: /^mets (?:ca|ceci|cela) en gras$|^(?:ca|ceci|cela) en gras$/, center: /^centre(?:r)? (?:ca|ceci|cela)$/, up: /^(?:monte|monter|remonte|deplace) (?:ca|ceci|cela)(?: (?:vers le|en) haut)?$/, down: /^(?:descends|descendre) (?:ca|ceci|cela)$|^deplace (?:ca|ceci|cela) (?:vers le|en) bas$/, remove: /^(?:supprime|supprimer|enleve|enlever|retire|retirer|efface) (?:ca|ceci|cela)$/, dup: /^duplique(?:r)? (?:ca|ceci|cela)$/, hide: /^(?:cache|cacher|masque|masquer) (?:ca|ceci|cela) sur (?:les )?(?:telephones|mobiles|mobile|portables)$/, accent: /^mets (?:ca|ceci|cela) (?:dans|avec|de) la couleur principale$/, ideas: /^(?:qu est ce qu on|que) (?:devrait|doit|devrait on|doit on) (?:mettre a jour|changer) sur le site$/, decided: /^applique(?:r)? ce qu on a decide$|^applique(?:r)? ce que nous avons decide$/, say: /^(?:change|changer|remplace) (?:ca|ceci|cela) (?:en|par)\s+(.+)$/ },
    de: { bigger: /^mach(?:e)? (?:das|dies|es) gro(?:ss|ß)er$|^vergro(?:ss|ß)er(?:e|n)? (?:das|dies)$/, smaller: /^mach(?:e)? (?:das|dies|es) kleiner$|^verkleiner(?:e|n)? (?:das|dies)$/, bold: /^mach(?:e)? (?:das|dies|es) fett$|^(?:das|dies) fett$/, center: /^zentrier(?:e|en)? (?:das|dies)$|^(?:das|dies) zentrieren$/, up: /^(?:schieb|schiebe|verschieb|verschiebe|beweg|bewege) (?:das|dies) (?:nach oben|hoch)$/, down: /^(?:schieb|schiebe|verschieb|verschiebe|beweg|bewege) (?:das|dies) (?:nach unten|runter)$/, remove: /^(?:entfern|entferne|losch|losche|loesch|loesche) (?:das|dies)$|^(?:das|dies) (?:entfernen|loschen|loeschen)$/, dup: /^duplizier(?:e|en)? (?:das|dies)$|^(?:das|dies) duplizieren$/, hide: /^(?:versteck|verstecke|verbirg|blende) (?:das|dies) auf (?:dem |den )?(?:handy|handys|telefon|telefonen|smartphone|smartphones)(?: aus)?$/, accent: /^mach(?:e)? (?:das|dies|es) in der hauptfarbe$/, ideas: /^was sollten wir auf der (?:website|webseite|seite) (?:aktualisieren|andern|aendern)$/, decided: /^(?:wende an|setz um|setze um) was wir (?:beschlossen|entschieden) haben$|^was wir (?:beschlossen|entschieden) haben (?:anwenden|umsetzen)$/, say: /^(?:ander|andere|aender|aendere) (?:das|dies) (?:zu|in)\s+(.+)$/ },
    ja: { bigger: /^これを?(?:もっと)?大きく(?:して)?(?:ください)?$/, smaller: /^これを?(?:もっと)?小さく(?:して)?(?:ください)?$/, bold: /^これを?太字に(?:して)?(?:ください)?$/, center: /^これを?(?:中央|真ん中)(?:に)?(?:揃え|寄せ)(?:て|にして)?(?:ください)?$|^これを?中央に(?:して)?$/, up: /^これを?上に(?:移動|動か)(?:して)?(?:ください)?$/, down: /^これを?下に(?:移動|動か)(?:して)?(?:ください)?$/, remove: /^これを?(?:削除|消去)(?:して)?(?:ください)?$|^これを?消して(?:ください)?$/, dup: /^これを?(?:複製|コピー)(?:して)?(?:ください)?$/, hide: /^これを?(?:スマホ|携帯|スマートフォン|モバイル)で(?:は)?(?:非表示に|隠)(?:して)?(?:ください)?$/, accent: /^これを?メイン(?:の)?(?:カラー|色)に(?:して)?(?:ください)?$/, ideas: /^(?:サイト|ウェブサイト|ホームページ)(?:で|の)(?:何|なに|どこ)を(?:更新|変更)(?:すべき|すれば(?:いい|よい))(?:ですか)?$/, decided: /^(?:決めた|決まった)(?:こと|内容)を(?:反映|適用)(?:して)?(?:ください)?$/, say: /^これを[「『]?(.+?)[」』]?に(?:変えて|変更して|して)(?:ください)?$/ },
    zh: { bigger: /^把?这个?(?:放|变|调|弄)大(?:一?点|些)?$/, smaller: /^把?这个?(?:缩|变|调|弄)小(?:一?点|些)?$/, bold: /^把?这个?(?:加粗|变粗|设为粗体)$/, center: /^把?这个?居中$/, up: /^把?这个?(?:往|向)?上移(?:动)?(?:一下)?$|^把?这个?移(?:到|动到)?上面$/, down: /^把?这个?(?:往|向)?下移(?:动)?(?:一下)?$|^把?这个?移(?:到|动到)?下面$/, remove: /^(?:把?这个?(?:删除|删掉|移除|去掉)|(?:删除|删掉|移除|去掉)这个?)$/, dup: /^(?:把?这个?复制(?:一份)?|复制这个?)$/, hide: /^(?:在手机上(?:隐藏|不显示)这个?|把?这个?在手机上(?:隐藏|不显示))$/, accent: /^把?这个?(?:改成|换成|设为|用)主(?:色|颜色|色调)$/, ideas: /^(?:网站|网页)(?:上)?(?:应该|需要|该)(?:更新|修改|改)(?:什么|哪些|些什么)$|^我们(?:应该|该)在网站上(?:更新|修改)什么$/, decided: /^(?:应用|采用|落实)我们(?:决定|商量|定下)的(?:内容|事)?$/, say: /^把这个?(?:改成|改为|换成)\s*[“「]?(.+?)[”」]?$/ },
    ko: { bigger: /^이(?:거|것)(?:을|를)?\s?(?:더\s)?크게(?:\s?(?:해|만들어)(?:\s?줘|주세요)?)?$/, smaller: /^이(?:거|것)(?:을|를)?\s?(?:더\s)?작게(?:\s?(?:해|만들어)(?:\s?줘|주세요)?)?$/, bold: /^이(?:거|것)(?:을|를)?\s?(?:굵게|볼드로)(?:\s?(?:해|만들어)(?:\s?줘|주세요)?)?$/, center: /^이(?:거|것)(?:을|를)?\s?가운데(?:로)?(?:\s?정렬)?(?:\s?(?:해|맞춰)(?:\s?줘|주세요)?)?$/, up: /^이(?:거|것)(?:을|를)?\s?위로(?:\s?(?:옮겨|이동해|올려)(?:\s?줘|주세요)?)?$/, down: /^이(?:거|것)(?:을|를)?\s?아래로(?:\s?(?:옮겨|이동해|내려)(?:\s?줘|주세요)?)?$/, remove: /^이(?:거|것)(?:을|를)?\s?(?:삭제해|지워|없애)(?:\s?줘|주세요)?$|^이(?:거|것)\s?삭제$/, dup: /^이(?:거|것)(?:을|를)?\s?(?:복제해|복사해)(?:\s?줘|주세요)?$|^이(?:거|것)\s?복제$/, hide: /^이(?:거|것)(?:을|를)?\s?(?:휴대폰|핸드폰|모바일|폰)에서(?:는)?\s?(?:숨겨|안 보이게 해)(?:\s?줘|주세요)?$/, accent: /^이(?:거|것)(?:을|를)?\s?(?:메인|주요|기본)\s?(?:색|색상|컬러)(?:으로|로)(?:\s?(?:해|바꿔)(?:\s?줘|주세요)?)?$/, ideas: /^(?:사이트|웹사이트|홈페이지)에서\s?(?:뭘|무엇을|뭐를)\s?(?:업데이트|수정|바꿔야)(?:해야)?\s?(?:할까|해|하지|하나요)?$/, decided: /^(?:우리가\s)?(?:결정한|정한)\s?(?:것|거|내용)(?:을|를)?\s?(?:적용해|반영해)(?:\s?줘|주세요)?$/, say: /^이(?:거|것)(?:을|를)?\s?["“]?(.+?)["”]?(?:으로|로)\s?(?:바꿔|변경해)(?:\s?줘|주세요)?$/ },
  };
  function tryEditor(code, raw, s, cjk) {
    const r = ED[code]; if (!r) return null;
    for (const k of Object.keys(ED_SAY)) if (r[k] && r[k].test(s)) return ED_SAY[k];
    const m = r.say && new RegExp(r.say.source, 'd').exec(s);
    if (m) { const at = m.indices[1], words = (!cjk && s.length === raw.length) ? raw.slice(at[0], at[1]) : m[1]; return 'change this to ' + String(words || m[1]).trim(); }
    return null;
  }
  function tryLang(code, raw) {
    const r = L[code];
    const s = r.cjk ? raw : deaccent(raw.toLowerCase()).replace(/['’\-]/g, ' ').replace(/\s+/g, ' ').trim();
    let m;
    if ((m = new RegExp(r.task.source, 'd').exec(s))) {
      // keep the person's own words for the title: the same slice of what they typed when the lengths line up
      const at = m.indices[1], title = (!r.cjk && s.length === raw.length) ? raw.slice(at[0], at[1]) : m[1];
      return 'add a task: ' + (title || m[1]).trim();
    }
    if (s.length > 70) return null;   // longer than a request: a message, not a command
    if ((m = r.timer.exec(s))) return 'set a timer for ' + (m[1] || m[2]) + ' minutes';
    if (r.langCue.test(s)) { for (const [w, en] of Object.entries(r.langs)) if (r.cjk ? s.includes(w) : new RegExp('\\b' + w + '\\b').test(s)) return 'switch the language to ' + en; }
    for (const k of ['cafe', 'portfolio', 'doc', 'bigger', 'smaller', 'dark', 'light', 'time', 'undo', 'huddle', 'invite', 'publish']) if (r[k].test(s)) return SAY[k];
    { const ed = tryEditor(code, raw, s, r.cjk); if (ed) return ed; }
    for (const [place, rx] of NAV[code]) { if ((m = rx.exec(s))) { if (!r.cjk && ENGLISH_BARE.has(s)) return null; return PLACE[place]; } }
    return null;
  }
  function rewrite(text) {
    const raw = String(text || '').trim().replace(/[.!?。！？¿¡]+$/g, '').replace(/^[¿¡]+/, '').trim(); if (!raw || raw.length > 200) return null;
    // kana means Japanese, hangul Korean; Han characters alone can be Chinese or Japanese ("今何時"), so both are tried
    for (const code of ['ja', 'ko']) if (SCRIPT[code].test(raw)) { const out = tryLang(code, raw); return out ? { text: out, lang: code } : null; }
    if (SCRIPT.zh.test(raw)) { for (const code of ['zh', 'ja']) { const out = tryLang(code, raw); if (out) return { text: out, lang: code }; } return null; }
    for (const code of ['es', 'pt', 'fr', 'de']) { const out = tryLang(code, raw); if (out) return { text: out, lang: code }; }
    return null;
  }
  return { rewrite, langs: Object.keys(L) };
});
