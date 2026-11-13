// Flint's local hands (flint-local): runs what app/ui/flintnlu.js understood, with no model at all.
// flint.js calls handle(text, H) first; H = { say, act, legacy(text), special(text), legacyHit(text), task(title, extra), modelOnline() }.
//   • One step or several ("make a merch store for Ember Socks, dark, then add a task to order samples for Friday and
//     tell Maya"), each with what's on screen as context (the picked element, the canvas selection, "it" = the last task).
//   • A missing detail gets one question with tappable answers; a guess below the bar gets "did you mean" with three.
//   • Every change can be undone ("undo"): tasks, messages, calendar events, theme, accent, text size, language.
//     A build can't be unmade from chat, so Flint says where its History is instead.
//   • People teach Flint: "when I say standup, open the calendar"; "no, I meant …" after a miss. Stored per person on
//     the host (/api/flint/learned) and on this device, matched by TF-IDF, never shared.
//   • "How do I …" is answered from TribeCode's own docs (/api/flint/kb, server/flintkb.js), with the source.
//   • Replies come in the app's language (eight). Only when nothing local can do it does Flint say so and offer the
//     member's AI helper or a brain (the honest tier card).
// Public: window.TribeFlintLocal = { handle, parse(text), ctx(), undo(), learned() }.
(function () {
  'use strict';
  const N = () => window.TribeNLU;
  const C = window.TribeClient, App = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const connected = () => !!(C && C.connected && C.connected() && C.hasToken && C.hasToken());
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const lang = () => (window.TribeI18n && window.TribeI18n.lang && window.TribeI18n.lang()) || 'en';
  const LI = { en: 0, es: 1, pt: 2, fr: 3, de: 4, ja: 5, zh: 6, ko: 7 };
  const first = n => String(n || '').split(/\s+/)[0];

  // ---------- replies (en, es, pt, fr, de, ja, zh, ko) ----------
  const R = {
    opened: ['Opened {x}.', 'Abrí {x}.', 'Abri {x}.', 'J’ai ouvert {x}.', '{x} geöffnet.', '{x}を開きました。', '已打开{x}。', '{x}을(를) 열었어요.'],
    noPlace: ['{x} isn’t here in this tribe yet.', '{x} aún no está en esta tribu.', '{x} ainda não está nesta tribo.', '{x} n’est pas encore dans cette tribu.', '{x} gibt es in diesem Tribe noch nicht.', '{x}はまだこのトライブにありません。', '这个部落里还没有{x}。', '이 트라이브에는 아직 {x}이(가) 없어요.'],
    needTribe: ['That lives in a tribe. Host one or join a friend first.', 'Eso vive en una tribu. Crea una o únete a la de un amigo.', 'Isso fica numa tribo. Hospede uma ou entre na de um amigo.', 'Ça se passe dans une tribu. Hébergez-en une ou rejoignez un ami.', 'Das gehört in einen Tribe. Hoste einen oder tritt einem bei.', 'それはトライブの中の機能です。ホストするか友だちに参加してください。', '这需要部落。先主持一个或加入朋友的。', '트라이브 안에서 쓰는 기능이에요. 먼저 호스트하거나 친구에게 참여하세요.'],
    taskAdded: ['Added to Tasks: “{t}”{x}.', 'Añadí “{t}” a Tareas{x}.', 'Adicionei “{t}” às Tarefas{x}.', 'J’ai ajouté « {t} » aux tâches{x}.', '„{t}“ zu den Aufgaben hinzugefügt{x}.', '「{t}」をタスクに追加しました{x}。', '已把“{t}”加入任务{x}。', '“{t}”을(를) 할 일에 추가했어요{x}.'],
    due: [' · due {d}', ' · para el {d}', ' · até {d}', ' · pour le {d}', ' · fällig {d}', '・期限 {d}', ' · 截止 {d}', ' · 마감 {d}'],
    forP: [' · for {p}', ' · para {p}', ' · para {p}', ' · pour {p}', ' · für {p}', '・担当 {p}', ' · 交给 {p}', ' · 담당 {p}'],
    taskDone: ['Marked “{t}” done. ✓', 'Marqué “{t}” como hecha. ✓', 'Marquei “{t}” como feita. ✓', '« {t} » est terminée. ✓', '„{t}“ ist erledigt. ✓', '「{t}」を完了にしました。✓', '“{t}”已完成。✓', '“{t}”을(를) 완료했어요. ✓'],
    taskStart: ['Moved “{t}” to In progress.', 'Moví “{t}” a En curso.', 'Movi “{t}” para Em andamento.', '« {t} » est en cours.', '„{t}“ ist jetzt in Arbeit.', '「{t}」を進行中にしました。', '“{t}”已移到进行中。', '“{t}”을(를) 진행 중으로 옮겼어요.'],
    taskAssign: ['Gave “{t}” to {p}.', 'Le di “{t}” a {p}.', 'Passei “{t}” para {p}.', 'J’ai confié « {t} » à {p}.', '„{t}“ an {p} übergeben.', '「{t}」を{p}さんに任せました。', '已把“{t}”交给{p}。', '“{t}”을(를) {p}님께 맡겼어요.'],
    taskReview: ['Sent “{t}” to review.', 'Envié “{t}” a revisión.', 'Mandei “{t}” para revisão.', '« {t} » est en relecture.', '„{t}“ ist zur Prüfung.', '「{t}」をレビューに回しました。', '“{t}”已提交审核。', '“{t}”을(를) 검토로 보냈어요.'],
    taskDel: ['Deleted “{t}”.', 'Borré “{t}”.', 'Apaguei “{t}”.', 'J’ai supprimé « {t} ».', '„{t}“ gelöscht.', '「{t}」を削除しました。', '已删除“{t}”。', '“{t}”을(를) 삭제했어요.'],
    taskDue: ['“{t}” is now due {d}.', '“{t}” ahora vence el {d}.', '“{t}” agora vence em {d}.', '« {t} » est maintenant pour le {d}.', '„{t}“ ist jetzt fällig am {d}.', '「{t}」の期限を{d}にしました。', '“{t}”截止日改为{d}。', '“{t}” 마감을 {d}(으)로 바꿨어요.'],
    taskRename: ['Renamed it to “{t}”.', 'Ahora se llama “{t}”.', 'Agora se chama “{t}”.', 'Renommée en « {t} ».', 'Heißt jetzt „{t}“.', '「{t}」に名前を変えました。', '已改名为“{t}”。', '“{t}”(으)로 이름을 바꿨어요.'],
    noTask: ['I couldn’t find that task. Which one?', 'No encontré esa tarea. ¿Cuál?', 'Não achei essa tarefa. Qual?', 'Je ne trouve pas cette tâche. Laquelle ?', 'Die Aufgabe finde ich nicht. Welche?', 'そのタスクが見つかりません。どれですか？', '没找到那个任务。是哪个？', '그 할 일을 찾지 못했어요. 어떤 거예요?'],
    tasksList: ['{n} {w}: {list}', '{n} {w}: {list}', '{n} {w}: {list}', '{n} {w} : {list}', '{n} {w}: {list}', '{w} {n}件: {list}', '{w} {n} 个：{list}', '{w} {n}개: {list}'],
    tasksOpen: ['open', 'abiertas', 'abertas', 'ouvertes', 'offen', '未完了', '未完成', '진행 중'], tasksOver: ['overdue', 'atrasadas', 'atrasadas', 'en retard', 'überfällig', '期限切れ', '已逾期', '기한 지남'], tasksToday: ['due today', 'para hoy', 'para hoje', 'pour aujourd’hui', 'heute fällig', '今日期限', '今天截止', '오늘 마감'],
    tasksNone: ['Nothing there. Nice.', 'Nada pendiente. Bien.', 'Nada pendente. Boa.', 'Rien à faire. Bien.', 'Nichts offen. Gut so.', '何もありません。いいですね。', '没有了，不错。', '아무것도 없어요. 좋아요.'],
    unassigned: ['Needs someone: {list}', 'Necesitan a alguien: {list}', 'Precisam de alguém: {list}', 'Sans responsable : {list}', 'Braucht jemanden: {list}', '担当者が必要: {list}', '需要人认领：{list}', '담당자가 필요해요: {list}'],
    sent: ['Sent to {p}: “{m}”', 'Enviado a {p}: “{m}”', 'Enviei para {p}: “{m}”', 'Envoyé à {p} : « {m} »', 'An {p} geschickt: „{m}“', '{p}さんに送りました:「{m}」', '已发给{p}：“{m}”', '{p}님께 보냈어요: “{m}”'],
    posted: ['Posted in chat: “{m}”', 'Publicado en el chat: “{m}”', 'Postei no chat: “{m}”', 'Publié dans le chat : « {m} »', 'Im Chat gepostet: „{m}“', 'チャットに投稿しました:「{m}」', '已发到聊天：“{m}”', '채팅에 올렸어요: “{m}”'],
    dmOpen: ['Opened your chat with {p}.', 'Abrí tu chat con {p}.', 'Abri sua conversa com {p}.', 'Conversation avec {p} ouverte.', 'Chat mit {p} geöffnet.', '{p}さんとのチャットを開きました。', '已打开与{p}的聊天。', '{p}님과의 채팅을 열었어요.'],
    event: ['On the calendar: {w}, {d}{t}.', 'En el calendario: {w}, {d}{t}.', 'No calendário: {w}, {d}{t}.', 'Au calendrier : {w}, {d}{t}.', 'Im Kalender: {w}, {d}{t}.', 'カレンダーに追加: {w}、{d}{t}。', '已加入日历：{w}，{d}{t}。', '캘린더에 추가: {w}, {d}{t}.'],
    calNone: ['Nothing on the calendar {w}.', 'Nada en el calendario {w}.', 'Nada no calendário {w}.', 'Rien au calendrier {w}.', 'Nichts im Kalender {w}.', '{w}の予定はありません。', '{w}没有安排。', '{w} 일정이 없어요.'],
    calList: ['{w}: {list}', '{w}: {list}', '{w}: {list}', '{w} : {list}', '{w}: {list}', '{w}: {list}', '{w}：{list}', '{w}: {list}'],
    theme: ['Switched to {x}.', 'Cambié a {x}.', 'Mudei para {x}.', 'Passé en {x}.', 'Auf {x} umgestellt.', '{x}に切り替えました。', '已切换到{x}。', '{x}(으)로 바꿨어요.'],
    accent: ['The accent is {x} now.', 'El color de acento ahora es {x}.', 'A cor de destaque agora é {x}.', 'L’accent est maintenant {x}.', 'Die Akzentfarbe ist jetzt {x}.', 'アクセントを{x}にしました。', '强调色已改为{x}。', '강조색을 {x}(으)로 바꿨어요.'],
    accentBad: ['{x} would be hard to read on this theme, so I kept the theme’s own color.', '{x} se leería mal en este tema; dejé el color del tema.', '{x} ficaria difícil de ler neste tema; mantive a cor do tema.', '{x} serait peu lisible sur ce thème ; je garde sa couleur.', '{x} wäre auf diesem Theme schlecht lesbar; ich lasse die Theme-Farbe.', '{x}はこのテーマでは読みにくいので、テーマの色のままにしました。', '{x}在这个主题上不好读，保留主题颜色。', '{x}은(는) 이 테마에서 읽기 어려워 테마 색을 유지했어요.'],
    textsize: ['Text size: {x}.', 'Tamaño de texto: {x}.', 'Tamanho do texto: {x}.', 'Taille du texte : {x}.', 'Textgröße: {x}.', '文字サイズ: {x}。', '文字大小：{x}。', '글자 크기: {x}.'],
    langSet: ['Language: {x}.', 'Idioma: {x}.', 'Idioma: {x}.', 'Langue : {x}.', 'Sprache: {x}.', '言語: {x}。', '语言：{x}。', '언어: {x}.'],
    calc: ['{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**', '{e} = **{v}**'],
    each: ['{e} = **{v}** each', '{e} = **{v}** cada uno', '{e} = **{v}** cada', '{e} = **{v}** chacun', '{e} = **{v}** pro Person', '{e} = 一人 **{v}**', '{e} = 每人 **{v}**', '{e} = 1인당 **{v}**'],
    tip: ['{e}: **{v}** (total {t})', '{e}: **{v}** (total {t})', '{e}: **{v}** (total {t})', '{e} : **{v}** (total {t})', '{e}: **{v}** (gesamt {t})', '{e}: **{v}**（合計 {t}）', '{e}：**{v}**（合计 {t}）', '{e}: **{v}** (합계 {t})'],
    time: ['It’s {t} on {d}.', 'Son las {t}, {d}.', 'São {t}, {d}.', 'Il est {t}, {d}.', 'Es ist {t}, {d}.', '{d}、{t}です。', '现在是{d} {t}。', '{d} {t}이에요.'],
    dateIs: ['That’s {d}.', 'Es el {d}.', 'É {d}.', 'C’est le {d}.', 'Das ist {d}.', '{d}です。', '是{d}。', '{d}이에요.'],
    until: ['{n} days until {d}.', 'Faltan {n} días para el {d}.', 'Faltam {n} dias para {d}.', '{n} jours avant le {d}.', 'Noch {n} Tage bis {d}.', '{d}まであと{n}日。', '离{d}还有{n}天。', '{d}까지 {n}일 남았어요.'],
    heads: ['Heads.', 'Cara.', 'Cara.', 'Face.', 'Kopf.', '表。', '正面。', '앞면.'], tails: ['Tails.', 'Cruz.', 'Coroa.', 'Pile.', 'Zahl.', '裏。', '反面。', '뒷면.'],
    rolled: ['Rolled a **{x}**.', 'Salió **{x}**.', 'Deu **{x}**.', 'Résultat : **{x}**.', 'Gewürfelt: **{x}**.', '**{x}**が出ました。', '掷出了 **{x}**。', '**{x}**이(가) 나왔어요.'],
    picked: ['**{x}**.', '**{x}**.', '**{x}**.', '**{x}**.', '**{x}**.', '**{x}**。', '**{x}**。', '**{x}**.'],
    yes: ['Yes.', 'Sí.', 'Sim.', 'Oui.', 'Ja.', 'はい。', '是。', '네.'], no: ['No.', 'No.', 'Não.', 'Non.', 'Nein.', 'いいえ。', '不。', '아니요.'],
    undone: ['Undone: {x}.', 'Deshecho: {x}.', 'Desfeito: {x}.', 'Annulé : {x}.', 'Rückgängig: {x}.', '元に戻しました: {x}。', '已撤销：{x}。', '되돌렸어요: {x}.'],
    noUndo: ['Nothing to undo.', 'No hay nada que deshacer.', 'Nada para desfazer.', 'Rien à annuler.', 'Nichts rückgängig zu machen.', '元に戻すものはありません。', '没有可撤销的。', '되돌릴 것이 없어요.'],
    undoBuild: ['A build stays in the code. Open History in the preview to restore an earlier version.', 'Una build queda en el código. Abre Historial en la vista previa para volver atrás.', 'Uma build fica no código. Abra o Histórico na prévia para voltar.', 'Une build reste dans le code. Ouvrez l’historique dans l’aperçu pour revenir.', 'Ein Build bleibt im Code. Öffne den Verlauf in der Vorschau, um zurückzugehen.', 'ビルドはコードに残ります。プレビューの履歴から前の版に戻せます。', '构建会留在代码里。在预览的历史中可以恢复旧版本。', '빌드는 코드에 남아요. 미리보기의 기록에서 이전 버전으로 되돌리세요.'],
    taught: ['Got it. When you say “{s}”, I’ll {m}.', 'Entendido. Cuando digas “{s}”, haré: {m}.', 'Entendi. Quando você disser “{s}”, vou: {m}.', 'Compris. Quand vous dites « {s} », je fais : {m}.', 'Verstanden. Wenn du „{s}“ sagst, mache ich: {m}.', 'わかりました。「{s}」と言われたら「{m}」をします。', '明白了。你说“{s}”时，我会：{m}。', '알겠어요. “{s}”라고 하면 “{m}”을(를) 할게요.'],
    taughtList: ['You taught me: {list}', 'Me enseñaste: {list}', 'Você me ensinou: {list}', 'Vous m’avez appris : {list}', 'Du hast mir beigebracht: {list}', '教わったこと: {list}', '你教过我：{list}', '가르쳐 준 것: {list}'],
    taughtNone: ['You haven’t taught me any phrases yet. Try “when I say standup, open the calendar”.', 'Aún no me enseñaste frases. Prueba “cuando diga standup, abre el calendario”.', 'Você ainda não me ensinou frases. Tente “quando eu disser standup, abra o calendário”.', 'Pas encore de phrases. Essayez « quand je dis standup, ouvre le calendrier ».', 'Noch keine Sätze. Probier „wenn ich standup sage, öffne den Kalender“.', 'まだ教わったフレーズはありません。', '你还没教过我短语。', '아직 가르쳐 준 문구가 없어요.'],
    forgot: ['Forgot “{s}”.', 'Olvidé “{s}”.', 'Esqueci “{s}”.', 'J’ai oublié « {s} ».', '„{s}“ vergessen.', '「{s}」を忘れました。', '已忘记“{s}”。', '“{s}”을(를) 잊었어요.'],
    meant: ['Thanks. Next time “{s}” means: {m}.', 'Gracias. La próxima vez “{s}” significa: {m}.', 'Valeu. Da próxima vez “{s}” significa: {m}.', 'Merci. La prochaine fois, « {s} » voudra dire : {m}.', 'Danke. Nächstes Mal heißt „{s}“: {m}.', 'ありがとう。次から「{s}」は「{m}」の意味にします。', '谢谢。下次“{s}”就是：{m}。', '고마워요. 다음엔 “{s}”을(를) “{m}”(으)로 알게요.'],
    didYou: ['I’m not sure what you mean. One of these?', 'No estoy seguro. ¿Alguna de estas?', 'Não tenho certeza. Uma destas?', 'Je ne suis pas sûr. L’une de celles-ci ?', 'Nicht ganz sicher. Eins davon?', 'よくわかりませんでした。どれかですか？', '我不太确定。是这些之一吗？', '잘 모르겠어요. 이 중 하나인가요?'],
    beyond: ['This one needs an AI, so nothing changed. Use my AI connects your own for free; Get credits / Premium uses ours.', 'Eso es más de lo que puedo hacer solo, sin IA. Puedo pasárselo a tu asistente de IA, o puedes darme un cerebro.', 'Isso é mais do que consigo sozinho, sem IA. Posso passar ao seu assistente de IA, ou você pode me dar um cérebro.', 'C’est au-delà de ce que je fais seul, sans IA. Je peux le confier à votre assistant IA, ou vous pouvez me donner un cerveau.', 'Das schaffe ich ohne KI nicht allein. Ich kann es deinem KI-Helfer geben, oder du gibst mir ein Gehirn.', 'AIなしでは私だけでは難しいです。AIヘルパーに渡すか、私に頭脳を与えてください。', '没有 AI 我一个人做不到。我可以交给你的 AI 助手，或者给我一个大脑。', 'AI 없이 혼자 하기엔 어려워요. AI 도우미에게 넘기거나 저에게 두뇌를 주세요.'],
    pickFirst: ['Pick something in the preview (Edit) or select a layer on the canvas first, then tell me how to change it.', 'Primero elige algo en la vista previa (Editar) o una capa en el lienzo, y dime cómo cambiarlo.', 'Primeiro escolha algo na prévia (Editar) ou uma camada no canvas, e diga como mudar.', 'Choisissez d’abord un élément dans l’aperçu (Modifier) ou un calque, puis dites-moi quoi changer.', 'Wähle erst etwas in der Vorschau (Bearbeiten) oder eine Ebene aus und sag mir, was sich ändern soll.', 'まずプレビュー（編集）で要素か、キャンバスでレイヤーを選んでください。', '先在预览（编辑）里选一个元素或在画布上选图层，再告诉我怎么改。', '먼저 미리보기(편집)에서 요소나 캔버스의 레이어를 고른 뒤 바꿀 내용을 말해 주세요.'],
    kb: ['From {src} › {h}: {s}', 'De {src} › {h}: {s}', 'De {src} › {h}: {s}', 'D’après {src} › {h} : {s}', 'Aus {src} › {h}: {s}', '{src} › {h}より: {s}', '来自 {src} › {h}：{s}', '{src} › {h}: {s}'],
    multi: ['Done: {list}', 'Hecho: {list}', 'Feito: {list}', 'Fait : {list}', 'Erledigt: {list}', '完了: {list}', '完成：{list}', '완료: {list}'],
    stopped: ['I stopped at “{s}”: I’m not sure what that part means.', 'Me detuve en “{s}”: no entendí esa parte.', 'Parei em “{s}”: não entendi essa parte.', 'Je me suis arrêté à « {s} » : je n’ai pas compris.', 'Bei „{s}“ habe ich aufgehört: das verstehe ich nicht.', '「{s}」で止まりました。その部分がわかりません。', '在“{s}”停下了：那部分我不明白。', '“{s}”에서 멈췄어요. 그 부분을 모르겠어요.'],
    building: ['On it: {x}.', 'En marcha: {x}.', 'Fazendo: {x}.', 'C’est parti : {x}.', 'Mache ich: {x}.', '作業中: {x}。', '马上：{x}。', '진행 중: {x}.'],
    callVideo: ['Camera on.', 'Cámara encendida.', 'Câmera ligada.', 'Caméra allumée.', 'Kamera an.', 'カメラをオンにしました。', '摄像头已打开。', '카메라를 켰어요.'],
    callVideoOff: ['Camera off.', 'Cámara apagada.', 'Câmera desligada.', 'Caméra éteinte.', 'Kamera aus.', 'カメラをオフにしました。', '摄像头已关闭。', '카메라를 껐어요.'],
    callShare: ['Pick what to share.', 'Elige qué compartir.', 'Escolha o que compartilhar.', 'Choisissez quoi partager.', 'Wähle aus, was du teilst.', '共有するものを選んでください。', '选择要共享的内容。', '공유할 화면을 고르세요.'],
    callShareOff: ['Stopped sharing.', 'Dejé de compartir.', 'Parei de compartilhar.', 'Partage arrêté.', 'Teilen beendet.', '共有を止めました。', '已停止共享。', '공유를 멈췄어요.'],
    callHand: ['Hand raised.', 'Mano levantada.', 'Mão levantada.', 'Main levée.', 'Hand gehoben.', '手を挙げました。', '已举手。', '손을 들었어요.'],
    callHandDown: ['Hand lowered.', 'Mano bajada.', 'Mão abaixada.', 'Main baissée.', 'Hand gesenkt.', '手を下げました。', '已放下手。', '손을 내렸어요.'],
    callRing: ['Ringing {p}…', 'Llamando a {p}…', 'Chamando {p}…', 'J’appelle {p}…', 'Rufe {p} an…', '{p}を呼び出しています…', '正在呼叫{p}…', '{p}님에게 거는 중…'],
    callPresent: ['Presenting TribeCode: everyone can follow you.', 'Presentando TribeCode: todos pueden seguirte.', 'Apresentando o TribeCode: todos podem te seguir.', 'Vous présentez TribeCode : tout le monde peut vous suivre.', 'Du präsentierst TribeCode: alle können dir folgen.', 'TribeCodeを発表中：みんながフォローできます。', '正在演示 TribeCode：大家可以跟随你。', 'TribeCode를 발표 중이에요: 모두 따라올 수 있어요.'],
    callNotIn: ['Join a huddle first.', 'Primero únete a una llamada.', 'Entre numa chamada primeiro.', 'Rejoignez d’abord un appel.', 'Tritt zuerst einem Huddle bei.', '先にハドルに参加してください。', '请先加入语音。', '먼저 허들에 참여하세요.'],
    huddleOn: ['Joined the huddle.', 'Entré a la llamada.', 'Entrei na chamada.', 'J’ai rejoint l’appel.', 'Dem Huddle beigetreten.', 'ハドルに参加しました。', '已加入语音。', '허들에 참여했어요.'],
    huddleOff: ['Left the huddle.', 'Salí de la llamada.', 'Saí da chamada.', 'J’ai quitté l’appel.', 'Huddle verlassen.', 'ハドルを抜けました。', '已离开语音。', '허들에서 나왔어요.'],
    device: ['Showing the {x} view.', 'Vista de {x}.', 'Vista de {x}.', 'Vue {x}.', 'Ansicht: {x}.', '{x}表示にしました。', '已切换到{x}视图。', '{x} 화면으로 보여요.'],
    reload: ['Reloaded the preview.', 'Recargué la vista previa.', 'Recarreguei a prévia.', 'Aperçu rechargé.', 'Vorschau neu geladen.', 'プレビューを再読み込みしました。', '已刷新预览。', '미리보기를 새로고침했어요.'],
    editOn: ['Edit is on: click anything in the preview.', 'Edición activa: toca algo en la vista previa.', 'Edição ligada: clique em algo na prévia.', 'Modification active : cliquez dans l’aperçu.', 'Bearbeiten ist an: klick etwas in der Vorschau an.', '編集モード: プレビューの要素をクリック。', '编辑已开启：点击预览中的任意内容。', '편집 켜짐: 미리보기에서 아무거나 클릭하세요.'],
    commentOn: ['Comment mode: click where the comment goes.', 'Modo comentario: toca donde va el comentario.', 'Modo comentário: clique onde vai o comentário.', 'Mode commentaire : cliquez à l’endroit voulu.', 'Kommentarmodus: klick dahin, wo er hin soll.', 'コメントモード: 置きたい場所をクリック。', '评论模式：点击要评论的位置。', '댓글 모드: 댓글을 달 곳을 클릭하세요.'],
    helper: ['{x} is {o}.', '{x} está {o}.', '{x} está {o}.', '{x} est {o}.', '{x} ist {o}.', '{x}を{o}にしました。', '{x}已{o}。', '{x}: {o}.'],
    on: ['on', 'activado', 'ligado', 'activé', 'an', 'オン', '开启', '켜짐'], off: ['off', 'desactivado', 'desligado', 'désactivé', 'aus', 'オフ', '关闭', '꺼짐'],
    hello: ['Hi{n}. Tell me what to do: “add a task …”, “tell Maya …”, “switch to dark mode”, “make a link in bio”.', 'Hola{n}. Dime qué hacer: “añade una tarea …”, “dile a Maya …”, “modo oscuro”.', 'Oi{n}. Diga o que fazer: “adiciona uma tarefa …”, “modo escuro”.', 'Salut{n}. Dites-moi quoi faire : « ajoute une tâche … », « mode sombre ».', 'Hallo{n}. Sag mir, was ich tun soll: „füge eine Aufgabe hinzu …“, „dunkler Modus“.', 'こんにちは{n}。「タスクを追加 …」などと話しかけてください。', '你好{n}。告诉我做什么：“添加任务 …”。', '안녕하세요{n}. “할 일 추가 …”처럼 말해 주세요.'],
    thanks: ['Any time.', 'Cuando quieras.', 'Disponha.', 'Avec plaisir.', 'Gern.', 'どういたしまして。', '不客气。', '언제든지요.'],
    trending: ['Here’s what’s trending on GitHub this week.', 'Esto es tendencia en GitHub esta semana.', 'Isto está em alta no GitHub nesta semana.', 'Voici les tendances GitHub de la semaine.', 'Das ist diese Woche auf GitHub angesagt.', '今週のGitHubトレンドです。', '这是本周 GitHub 热门。', '이번 주 GitHub 인기 목록이에요.'],
    market: ['Opened the Marketplace{q}.', 'Abrí el Marketplace{q}.', 'Abri o Marketplace{q}.', 'Marketplace ouvert{q}.', 'Marketplace geöffnet{q}.', 'マーケットプレイスを開きました{q}。', '已打开市场{q}。', '마켓플레이스를 열었어요{q}.'],
    canvasOpen: ['Opened Design. {x}', 'Abrí Diseño. {x}', 'Abri Design. {x}', 'Design ouvert. {x}', 'Design geöffnet. {x}', 'デザインを開きました。{x}', '已打开设计。{x}', '디자인을 열었어요. {x}'],
  };
  function T(k, v) { const row = R[k]; let s = row ? (row[LI[lang()] || 0] || row[0]) : k; for (const [a, b] of Object.entries(v || {})) s = s.split('{' + a + '}').join(b == null ? '' : String(b)); return s; }
  const QS = {   // the catalog's questions, translated
    'What should the task say?': ['¿Qué dice la tarea?', 'O que a tarefa diz?', 'Que doit dire la tâche ?', 'Was soll in der Aufgabe stehen?', 'タスクの内容は？', '任务写什么？', '할 일 내용은요?'],
    'Which task is done?': ['¿Qué tarea está hecha?', 'Qual tarefa está feita?', 'Quelle tâche est terminée ?', 'Welche Aufgabe ist erledigt?', 'どのタスクが完了？', '哪个任务完成了？', '어떤 할 일을 끝냈어요?'],
    'Which task?': ['¿Qué tarea?', 'Qual tarefa?', 'Quelle tâche ?', 'Welche Aufgabe?', 'どのタスク？', '哪个任务？', '어떤 할 일요?'],
    'Who should do it?': ['¿Quién la hace?', 'Quem faz?', 'Qui s’en charge ?', 'Wer macht es?', '誰が担当？', '谁来做？', '누가 할까요?'],
    'What should I tell them?': ['¿Qué les digo?', 'O que eu digo?', 'Que dois-je dire ?', 'Was soll ich sagen?', '何と伝えますか？', '要告诉他们什么？', '뭐라고 전할까요?'],
    'What should I post?': ['¿Qué publico?', 'O que eu posto?', 'Que dois-je publier ?', 'Was soll ich posten?', '何を投稿しますか？', '发什么？', '무엇을 올릴까요?'],
    'When is it due?': ['¿Para cuándo?', 'Para quando?', 'Pour quand ?', 'Bis wann?', '期限は？', '什么时候截止？', '마감은 언제예요?'],
    'Which color?': ['¿Qué color?', 'Qual cor?', 'Quelle couleur ?', 'Welche Farbe?', 'どの色？', '什么颜色？', '어떤 색요?'],
    'What should I write down?': ['¿Qué anoto?', 'O que eu anoto?', 'Que dois-je noter ?', 'Was soll ich notieren?', '何をメモしますか？', '记什么？', '무엇을 적을까요?'],
    'What should I put on the calendar?': ['¿Qué pongo en el calendario?', 'O que coloco no calendário?', 'Que mettre au calendrier ?', 'Was soll in den Kalender?', 'カレンダーに何を入れますか？', '日历上加什么？', '캘린더에 무엇을 넣을까요?'],
  };
  const Q = q => { const r = QS[q]; return r && lang() !== 'en' ? r[(LI[lang()] || 1) - 1] : q; };
  const day = iso => { if (!iso) return ''; const d = new Date(iso + 'T12:00'); try { return d.toLocaleDateString(lang() === 'en' ? undefined : lang(), { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return iso; } };

  // ---------- context ----------
  let tasksCache = [], tasksAt = 0, last = {};
  async function tasks(force) {
    if (!connected()) return [];
    if (!force && Date.now() - tasksAt < 8000) return tasksCache;
    try { tasksCache = ((await C.api('/tasks')).tasks || []).map(t => ({ id: t.id, title: t.title, status: t.status, assignee: t.assignee, due: t.due, body: t.body, type: t.type, accept: t.accept })); tasksAt = Date.now(); } catch {}
    return tasksCache;
  }
  const view = () => { const h = location.hash || ''; if (/^#\/canvas/.test(h) || document.body.dataset.view === 'canvas') return 'canvas'; if (document.body.classList.contains('pvw-on') || /^#\/preview/.test(h)) return 'preview'; return (document.body.dataset.view || h.replace(/^#\/?/, '').split('/')[0] || 'home'); };
  function ctxNow() {
    const st = C && C.state ? C.state() : {};
    const PF = window.TribePreviewFlint, CV = window.TribeCanvas;
    let picked = null, selection = null; try { picked = PF && PF.picked && PF.picked(); } catch {} try { const s = CV && CV.state && CV.state(); if (s && s.open && s.selected && s.selected.length) selection = s.selected; } catch {}
    let vw = view(); try { const D = window.TribeDocs, d = D && D.current && D.current(); if (vw === 'docs' && d) vw = d.kind === 'sheet' ? 'sheet' : d.kind === 'deck' ? 'deck' : 'doc'; } catch {}   // feat/flint-max: the open editor
    return { now: new Date(), view: vw, picked, selection, members: (st.members || []).filter(m => m.id !== (st.me && st.me.id)).map(m => ({ id: m.id, name: m.name, role: m.role })), tasks: tasksCache, last, learned: learnedList() };
  }

  // ---------- taught phrases ----------
  const LKEY = 'tribecode.flint.learned';
  let learnedMem = ls.get(LKEY, []) || [], learnedAt = 0;
  const learnedList = () => learnedMem.slice();
  async function syncLearned() { if (!connected() || Date.now() - learnedAt < 30000) return; learnedAt = Date.now(); try { const r = await C.api('/flint/learned'); if (r && Array.isArray(r.items)) { learnedMem = r.items.map(x => ({ id: x.id, say: x.say, means: x.means })); ls.set(LKEY, learnedMem); } } catch {} }
  async function learn(say, means) {
    say = String(say || '').trim(); means = String(means || '').trim(); if (!say || !means) return;
    learnedMem = learnedMem.filter(x => x.say.toLowerCase() !== say.toLowerCase()).concat([{ say, means }]).slice(-200); ls.set(LKEY, learnedMem);
    if (connected()) { try { const r = await C.api('/flint/learned', { method: 'POST', body: { say, means } }); if (r && r.items) { learnedMem = r.items.map(x => ({ id: x.id, say: x.say, means: x.means })); ls.set(LKEY, learnedMem); } } catch {} }
  }
  async function unlearn(say) {
    const s = String(say || '').toLowerCase().trim(), hit = learnedMem.find(x => x.say.toLowerCase() === s); if (!hit) return false;
    learnedMem = learnedMem.filter(x => x !== hit); ls.set(LKEY, learnedMem);
    if (connected()) { try { await C.api('/flint/learned/' + encodeURIComponent(hit.id || hit.say), { method: 'DELETE' }); } catch {} }
    return true;
  }

  // ---------- undo ----------
  const UNDO = [];
  const pushUndo = (label, fn) => { UNDO.push({ label, fn }); if (UNDO.length > 25) UNDO.shift(); };
  async function undo() {
    const u = UNDO.pop(); if (!u) return { text: T('noUndo') };
    if (u.fn === 'build') return { text: T('undoBuild'), acts: [['History', 'preview']] };
    try { await u.fn(); tasksAt = 0; return { text: T('undone', { x: u.label }) }; } catch (e) { return { text: T('undone', { x: u.label }) + ' (' + e.message + ')' }; }
  }

  // ---------- settings helpers (the same stores Settings and Personalize use) ----------
  const S = () => window.TribeStore;
  function lookSnap() { const st = S() ? S().get() : {}; return { theme: st.theme, themePicked: st.themePicked, themeSystem: st.themeSystem, themeLight: st.themeLight, themeDark: st.themeDark, look: { ...(st.look || {}) } }; }
  function lookRestore(snap) { if (!S()) return; S().set(snap); if (window.TribeThemes) window.TribeThemes.apply(S().get()); if (window.TribeLook && window.TribeLook.apply) window.TribeLook.apply(); }
  function setTheme(id) {
    const Th = window.TribeThemes; if (!Th || !S()) return false;
    if (id === 'dark-mode') { const cur = Th.resolve(S().get()); if (Th.byId(cur) && Th.byId(cur).mode === 'dark') return cur; id = (S().get().themeDark && Th.byId(S().get().themeDark)) ? S().get().themeDark : 'campfire'; }
    if (!Th.byId(id)) return false;
    S().set({ ...Th.pick(id), themeSystem: false }); Th.apply(S().get());
    const a = (S().get().look || {}).accent; if (a && window.TribeLook && window.TribeLook.check && window.TribeLook.check('accent', a)) S().set({ look: { ...(S().get().look || {}), accent: null } });
    if (window.TribeLook && window.TribeLook.apply) window.TribeLook.apply();
    return id;
  }
  const setLook = patch => { S().set({ look: { ...(S().get().look || {}), ...patch } }); if (window.TribeLook && window.TribeLook.apply) window.TribeLook.apply(); };

  // ---------- running one step ----------
  const NAVLEGACY = { files: 'files', tasks: 'tasks', chat: 'chat', home: 'dashboard', repo: 'repo', guide: 'guide', settings: 'settings', calendar: 'calendar', agents: 'agents', mcp: 'mcp', bugs: 'bugs', website: 'website', whiteboard: 'whiteboard' };
  function go(key) {
    const W = window;
    const map = {
      design: ['TribeDesignFlow', g => g.open({})], canvas: ['TribeCanvas', g => g.open()], preview: ['TribePreview', g => g.open()], market: ['TribeMarket', g => g.open()], trending: ['TribeMarket', g => g.open()],
      studios: ['TribeStudios', g => g.open()], company: ['TribeCompany', g => g.open()], assets: ['TribeAssets', g => g.open({})], academy: ['TribeAcademy', g => g.open({})],
      secretary: ['TribeSecretary', g => g.open()], personalize: ['TribePersonalize', g => g.open('you')], profile: ['TribePersonalize', g => g.open('you')], customize: ['TribeLook', g => g.open('tribe')],
      jam: ['TribeJam', g => g.open()], publish: ['TribePublish', g => g.open()], search: ['TribePalette', g => g.open()], shortcuts: ['TribeHelp', g => g.shortcuts()], notes: ['TribeCaptures', g => g.open()],
      inbox: ['TribeNotify', g => g.openInbox()], inspo: ['TribeInspoBoard', g => g.open({})], dms: ['TribeDM', g => g.open && g.open()], brainpick: ['TribeBrain', g => g.open()], templates: ['TribeSiteLib', g => g.open({ pid: C && C.project && C.project() })],
    };
    const e = map[key]; if (e && W[e[0]]) { try { e[1](W[e[0]]); return true; } catch { return false; } }
    const Sh = W.TribeShell; if (Sh && Sh.dests && Sh.go && (Sh.dests() || []).some(d => d.key === key)) { Sh.go(key); return true; }
    return false;
  }
  const BUILDPHRASE = {
    'build.3d': n => `build a 3D game${n}`, 'build.2d': n => `build a platformer game${n}`, 'build.todo': n => `build a to-do app${n}`, 'build.video': n => `build a video editor${n}`, 'build.landing': n => `build a landing page${n}`,
  };
  async function step(s, H, prev) {
    const sl = s.slots || {}, id = s.intent, area = s.area;
    if (window.TribeFlintMax && window.TribeFlintMax.has && window.TribeFlintMax.has(id)) return window.TribeFlintMax.run(s, { pushUndo, connected });   // feat/flint-max: palettes, fonts, copy, sheets, docs, slides
    if (window.TribeFlintCmds && window.TribeFlintCmds.has(id)) return window.TribeFlintCmds.run(s, { pushUndo, connected, tasks: () => tasks(true), clear: H.clear });   // feat/flint-unify: timers, motion, notifications, pins, reactions, more task moves…
    const legacy = async (text, sum) => { await H.legacy(text); return { said: true, sum: sum || text }; };
    const needT = () => (connected() ? null : { text: T('needTribe'), acts: [['Host or join', 'invite']] });
    if (id === 'nav.settings' && sl.section === 'notifications' && window.TribeNotify && window.TribeNotify.openSettings) { window.TribeNotify.openSettings(); return { text: T('opened', { x: 'Notification settings' }), sum: 'opened notification settings' }; }
    if (id === 'nav.files' && sl.cat) {   // "show my pictures": Files on that kind's tab
      const r = NAVLEGACY.files ? await legacy('open files', 'opened Files') : null;
      let n = 0; const pick = () => { const b = [...document.querySelectorAll(`[data-dk="${sl.cat}"]`)].find(x => x.offsetParent); if (b) b.click(); else if (++n < 20) setTimeout(pick, 120); };
      setTimeout(pick, 120);
      return r || { text: T('opened', { x: 'Files' }) };
    }
    if (id.startsWith('nav.')) {
      const k = id.slice(4);
      if (NAVLEGACY[k]) return legacy('open ' + NAVLEGACY[k], 'opened ' + (s.label || k));
      const ok = go(k); if (ok) { pushUndo(T('opened', { x: s.label || k }).replace(/\.$/, ''), () => history.back()); return { text: T('opened', { x: s.label || k }), sum: 'opened ' + (s.label || k) }; }
      return { text: T('noPlace', { x: s.label || k }) };
    }
    if (area === 'tasks') {
      const n = needT(); if (n) return n;
      const t = sl.task;
      if (id === 'task.add') {
        const extra = {}; if (sl.due) extra.due = sl.due; if (sl.who && sl.who.id) extra.assignee = sl.who.id; if (sl.type) extra.type = sl.type;
        const tk = await H.task(sl.title, extra, true);
        if (tk && tk.id) { last.task = tk; tasksAt = 0; pushUndo(`“${tk.title}”`, () => C.api('/tasks/' + encodeURIComponent(tk.id), { method: 'DELETE' })); return { text: T('taskAdded', { t: tk.title, x: (sl.due ? T('due', { d: day(sl.due) }) : '') + (sl.who && sl.who.name ? T('forP', { p: first(sl.who.name) }) : '') }), acts: [['Open Tasks', 'nav', 'tasks']], sum: `added the task “${tk.title}”${sl.due ? ' (due ' + day(sl.due) + ')' : ''}` }; }
        return { said: true };
      }
      if (id === 'task.list') {
        const all = await tasks(true), me = C.state().me && C.state().me.id, today = new Date().toISOString().slice(0, 10);
        let L = all.filter(x => x.status !== 'done'); if (sl.whose === 'me') L = L.filter(x => x.assignee === me);
        if (sl.which === 'overdue') L = L.filter(x => x.due && x.due < today); if (sl.which === 'today') L = L.filter(x => x.due === today); if (sl.which === 'week') { const wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10); L = L.filter(x => x.due && x.due <= wk); }
        if (!L.length) return { text: T('tasksNone'), acts: [['Open Tasks', 'nav', 'tasks']] };
        const w = sl.which === 'overdue' ? T('tasksOver') : sl.which === 'today' ? T('tasksToday') : T('tasksOpen');
        return { text: T('tasksList', { n: L.length, w, list: L.slice(0, 6).map(x => `“${x.title}”`).join(', ') + (L.length > 6 ? '…' : '') }), acts: [['Open Tasks', 'nav', 'tasks']] };
      }
      if (id === 'task.unassigned') {
        const L = (await tasks(true)).filter(x => x.status !== 'done' && !x.assignee);
        return { text: L.length ? T('unassigned', { list: L.slice(0, 6).map(x => `“${x.title}”`).join(', ') }) : T('tasksNone'), acts: [['Open Tasks', 'nav', 'tasks']] };
      }
      if (id === 'task.claim' && sl.next) {   // "grab an open task": the first unassigned one, claimed (server/taskflow.js)
        const open = (await tasks(true)).filter(x => x.status !== 'done' && !x.assignee);
        if (!open.length) return { text: 'Nothing is open to claim right now.', acts: [['Open Tasks', 'nav', 'tasks']] };
        try { await C.api('/tasks/' + encodeURIComponent(open[0].id) + '/claim', { method: 'POST', body: {} }); } catch (e) {
          if (!/council/i.test(e.message || '')) return { text: e.message };   // Lead mode: no claiming, so take it with Start instead
          await C.api('/tasks/' + encodeURIComponent(open[0].id), { method: 'PATCH', body: { status: 'doing', assignee: C.state().me && C.state().me.id } });
        }
        last.task = open[0]; tasksAt = 0; return { text: `You claimed “${open[0].title}”. It is yours and in progress.`, acts: [['Open Tasks', 'nav', 'tasks']], sum: `claimed “${open[0].title}”` };
      }
      if (!t || !t.id) return { text: T('noTask'), acts: (await tasks()).filter(x => x.status !== 'done').slice(0, 3).map(x => [x.title, 'ask', rephrase(s, x.title)]) };
      const before = (await tasks()).find(x => x.id === t.id) || t;
      const patch = async (body, undoBody, label) => { await C.api('/tasks/' + encodeURIComponent(t.id), { method: 'PATCH', body }); last.task = t; tasksAt = 0; pushUndo(label, () => C.api('/tasks/' + encodeURIComponent(t.id), { method: 'PATCH', body: undoBody })); };
      try {
        if (id === 'task.done') { await patch({ status: 'done' }, { status: before.status || 'todo' }, `“${t.title}” done`); return { text: T('taskDone', { t: t.title }), sum: `marked “${t.title}” done` }; }
        const me0 = C.state().me && C.state().me.id;
        const offered = before.accept === 'pending' && before.assignee === me0;
        // v0.30 task offers (server/taskflow.js): accept starts it, decline hands it back with a reason, claim takes an open one
        if (id === 'task.accept' || (id === 'task.start' && offered)) {
          if (!offered && before.assignee && before.assignee !== me0) return { text: `“${t.title}” isn’t offered to you.`, acts: [['Open Tasks', 'nav', 'tasks']] };
          if (!offered) { await patch({ status: 'doing', ...(before.assignee ? {} : { assignee: me0 }) }, { status: before.status || 'todo', assignee: before.assignee || null }, `“${t.title}” started`); return { text: T('taskStart', { t: t.title }), sum: `started “${t.title}”` }; }
          await C.api('/tasks/' + encodeURIComponent(t.id) + '/accept', { method: 'POST', body: {} }); last.task = t; tasksAt = 0;
          return { text: `Accepted “${t.title}”. It’s yours and in progress.`, sum: `accepted “${t.title}”` };
        }
        if (id === 'task.decline') {
          if (!offered) return { text: `“${t.title}” isn’t waiting on your answer.`, acts: [['Open Tasks', 'nav', 'tasks']] };
          const reason = (/(?:too busy|busy|no time|not this week|this week|sorry)/i.exec(s.text || '') || [])[0] || '';
          await C.api('/tasks/' + encodeURIComponent(t.id) + '/decline', { method: 'POST', body: { reason } }); last.task = t; tasksAt = 0;
          return { text: `Declined “${t.title}”${reason ? ` (${reason})` : ''}. It goes back to whoever assigned it.`, sum: `declined “${t.title}”` };
        }
        if (id === 'task.claim') {
          if (before.assignee && before.assignee !== me0) return { text: `“${t.title}” already has someone.`, acts: [['Open Tasks', 'nav', 'tasks']] };
          try { await C.api('/tasks/' + encodeURIComponent(t.id) + '/claim', { method: 'POST', body: {} }); } catch (e) {
            if (!/council/i.test(e.message || '')) throw e;   // Lead mode: take it with Start instead
            await patch({ status: 'doing', assignee: me0 }, { status: before.status || 'todo', assignee: before.assignee || null }, `“${t.title}” started`); return { text: `“${t.title}” is yours and in progress. (Claiming is for Council mode, so I started it for you.)`, sum: `started “${t.title}”` };
          }
          last.task = t; tasksAt = 0;
          return { text: `You claimed “${t.title}”. It is yours and in progress.`, sum: `claimed “${t.title}”` };
        }
        if (id === 'task.start') { const me = C.state().me && C.state().me.id; await patch({ status: 'doing', ...(before.assignee ? {} : { assignee: me }) }, { status: before.status || 'todo', assignee: before.assignee || null }, `“${t.title}” started`); return { text: T('taskStart', { t: t.title }), sum: `started “${t.title}”` }; }
        if (id === 'task.review') { await patch({ status: 'review' }, { status: before.status || 'doing' }, `“${t.title}” to review`); return { text: T('taskReview', { t: t.title }), sum: `sent “${t.title}” to review` }; }
        if (id === 'task.assign') { if (!sl.who || !sl.who.id) return { text: Q('Who should do it?'), acts: (C.state().members || []).filter(m => m.role !== 'spectator').slice(0, 4).map(m => [first(m.name), 'ask', `assign ${t.title} to ${first(m.name)}`]) }; await patch({ assignee: sl.who.id }, { assignee: before.assignee || null }, `“${t.title}” → ${first(sl.who.name)}`); last.person = sl.who; return { text: T('taskAssign', { t: t.title, p: first(sl.who.name) }), sum: `gave “${t.title}” to ${first(sl.who.name)}` }; }
        if (id === 'task.due') { if (!sl.due) return { text: Q('When is it due?'), acts: ['today', 'tomorrow', 'friday'].map(w => [w, 'ask', `push ${t.title} to ${w}`]) }; await patch({ due: sl.due }, { due: before.due || null }, `due date of “${t.title}”`); return { text: T('taskDue', { t: t.title, d: day(sl.due) }), sum: `moved “${t.title}” to ${day(sl.due)}` }; }
        if (id === 'task.rename') { await patch({ title: sl.title }, { title: before.title }, `rename of “${before.title}”`); return { text: T('taskRename', { t: sl.title }) }; }
        if (id === 'task.delete') { await C.api('/tasks/' + encodeURIComponent(t.id), { method: 'DELETE' }); tasksAt = 0; pushUndo(`“${t.title}”`, () => C.api('/tasks', { method: 'POST', body: { title: before.title, body: before.body, status: before.status, assignee: before.assignee, due: before.due, type: before.type } })); return { text: T('taskDel', { t: t.title }), sum: `deleted “${t.title}”` }; }
      } catch (e) { return { text: e.message }; }
    }
    if (id === 'note.add') return legacy('note: ' + sl.body, `noted “${sl.body}”`);
    if (id === 'note.blank') return legacy('new note');
    if (id === 'doc.new') return legacy('write a doc about ' + (sl.topic || s.text), 'started a doc');
    if (id === 'sheet.new') return legacy('make a sheet for ' + (sl.topic || s.text), 'started a sheet');
    if (id === 'deck.new') return legacy('make slides about ' + (sl.topic || s.text), 'started slides');
    if (id === 'draft.readme') return legacy(s.text);
    if (id === 'vision.write') return legacy('write the vision');
    if (id === 'doc.open') return legacy('find ' + (sl.name || ''));
    if (id === 'chat.summarize') return legacy('summarize the chat');
    if (id === 'chat.send' || (id === 'dm.send' && sl.toChat)) {
      const n = needT(); if (n) return n;
      const msg = (sl.msg || '').trim() || summaryOf(prev); if (!msg) return { text: Q('What should I post?') };
      try { const r = await C.api('/chat/general', { method: 'POST', body: { text: msg } }); const mid = r && r.message && r.message.id; if (mid) pushUndo('message', () => C.api(`/chat/general/msg/${encodeURIComponent(mid)}`, { method: 'DELETE' })); return { text: T('posted', { m: msg }), sum: 'posted in chat' }; } catch (e) { return { text: e.message }; }
    }
    if (id === 'dm.send' || id === 'dm.open') {
      const n = needT(); if (n) return n;
      const p = sl.who; if (!p || !p.id) return { text: Q('Who should do it?') };
      last.person = p;
      const D = window.TribeDM, me = C.state().me && C.state().me.id, ch = 'dm-' + [me, p.id].sort().join('-');
      if (id === 'dm.open') { if (D && D.openChannel) D.openChannel(ch); else if (D && D.open) D.open(p.id); return { text: T('dmOpen', { p: first(p.name) }) }; }
      let msg = (sl.msg || '').trim(); if (!msg) msg = summaryOf(prev); if (!msg) return { text: Q('What should I tell them?'), ask: true };
      if (/^(?:remind|to)\b/i.test(s.text) && !/^reminder/i.test(msg)) msg = 'Reminder: ' + msg;
      try { const r = await C.api('/chat/' + encodeURIComponent(ch), { method: 'POST', body: { text: msg } }); const mid = r && r.message && r.message.id; if (mid) pushUndo(`message to ${first(p.name)}`, () => C.api(`/chat/${encodeURIComponent(ch)}/msg/${encodeURIComponent(mid)}`, { method: 'DELETE' })); return { text: T('sent', { p: first(p.name), m: msg }), acts: [[`Open chat with ${first(p.name)}`, 'dm', p.id]], sum: `told ${first(p.name)}` }; }
      catch (e) { return { text: e.message }; }
    }
    if (id === 'event.add') {
      const n = needT(); if (n) return n;
      const P = window.TribePlan; const date = sl.date || new Date().toISOString().slice(0, 10);
      try {
        const body = { title: String(sl.what || 'Event').replace(/^\w/, c => c.toUpperCase()).slice(0, 120), start: new Date(`${date}T${sl.time || '09:00'}:00`).toISOString(), duration: 30 };
        const r = await C.api('/calendar', { method: 'POST', body }); const ev = r && (r.event || r);
        if (ev && ev.id) pushUndo(`“${body.title}”`, () => C.api('/calendar/' + encodeURIComponent(ev.id), { method: 'DELETE' }));
        if (P && P.load) try { P.load(); } catch {}
        return { text: T('event', { w: body.title, d: day(date), t: sl.time ? ' · ' + sl.time : '' }), acts: [['Open Calendar', 'nav', 'calendar']], sum: `put “${body.title}” on the calendar (${day(date)}${sl.time ? ' ' + sl.time : ''})` };
      } catch (e) { return { text: e.message }; }
    }
    if (id === 'cal.show') {
      const n = needT(); if (n) return n;
      const w = sl.when || 'today', now = new Date(), from = new Date(now), to = new Date(now);
      if (w === 'tomorrow') { from.setDate(now.getDate() + 1); to.setDate(now.getDate() + 1); } else if (/week/.test(w)) { to.setDate(now.getDate() + 7); if (/next/.test(w)) { from.setDate(now.getDate() + 7); to.setDate(now.getDate() + 14); } }
      const a = from.toISOString().slice(0, 10), b = to.toISOString().slice(0, 10);
      let evs = []; try { const r = await C.api(`/calendar?from=${a}T00:00:00&to=${b}T23:59:59`); evs = (r.occurrences || []).map(o => ({ title: o.title, date: String(o.start).slice(0, 10), time: new Date(o.start).toTimeString().slice(0, 5) })); } catch {}
      const dueT = (await tasks(true)).filter(x => x.status !== 'done' && x.due && x.due >= a && x.due <= b);
      const items = evs.map(e => `${e.title}${e.time ? ' ' + e.time : ''}${e.date && a !== b ? ' (' + day(e.date) + ')' : ''}`).concat(dueT.map(x => `✓ ${x.title}`));
      return { text: items.length ? T('calList', { w, list: items.slice(0, 8).join(' · ') }) : T('calNone', { w }), acts: [['Open Calendar', 'nav', 'calendar']] };
    }
    // feat/flint-site: lessons, redo, Premium, and the website designer
    if (id === 'lesson') { const L = window.TribeFlintLessons; if (L && L.open(sl.feature)) return { text: `Here is a short lesson on ${L.LESSONS[sl.feature].title.replace(/^The /, 'the ')}. Show me points at the real thing.`, sum: 'opened a lesson' }; return { text: T('noPlace', { x: 'Lessons' }) }; }
    if (id === 'redo') { const D = window.TribeSiteDesigner, st = D && D.state && D.state(); if (st && st.open) { D.redo(); return { text: 'Redone.' }; } return { text: 'Redo works in the website designer and on the canvas (Ctrl Shift Z). Here, say what to do again.' }; }
    if (id === 'premium.open') { const Pm = window.TribePremium; if (Pm) { if (/credit/i.test(s.text || '')) Pm.gate('credits'); else Pm.open(); } return { text: 'Here is what is free and what Premium adds. Everything local stays free.', sum: 'opened Premium' }; }
    // feat/site-v2: every website ask opens the website designer, in any context (Flint's chat, Home with no tribe, a
    // project, the canvas, the preview): a template by meaning ("link tree website") opens with that template, filled
    // from the project; an edit ("make the headline punchier") opens the project's design and runs there. Building the
    // site into the repo as code is the old path, now only when asked for ("build the website into the repo").
    if (id === 'site.repo') { pushUndo('build', 'build'); return legacy('build me a landing page', 'built the website into the repo'); }
    // feat/design-flow: "make a breakout game", "a kanban board": the starter opens in the Design flow with its plan
    if (/^site\.starter-/.test(id) && window.TribeDesignFlow) {
      const st = await window.TribeDesignFlow.fromFlint(id.slice(13), s.text || '');
      if (st) return { text: `Started the ${st.title} starter (${st.license}, ${st.original ? 'made for TribeCode' : 'by ' + st.by}). Its knobs and a plan are beside it.`, sum: `started ${st.title}` };
    }
    if (/^site\./.test(id) && !/^site\.starter-/.test(id)) {
      const D = window.TribeSiteDesigner; if (!D) return { text: T('noPlace', { x: 'Website designer' }) };
      const tpl = id.slice(5), isTpl = !!(window.TribeSiteCfg && window.TribeSiteCfg.TEMPLATES.includes(tpl)), st = D.state() || {};
      if (id === 'site.gallery') { await D.open({}); const b = document.querySelector('#wdz [data-wdz="templates"]'); if (b) b.click(); return { text: T('opened', { x: 'Website templates' }), sum: 'opened the website templates' }; }
      if (isTpl) { await D.open({ template: tpl, name: sl.name || undefined }); const n = (D.cfg() || {}).name; return { text: `Opened the website designer with the ${s.label || tpl} template${n && n !== 'My site' ? ` as “${n}”` : ''}. Click any words to change them; buttons, pages, dark mode and Download HTML are all here. Ask me for edits in the designer.`, acts: [], sum: `started a ${s.label || tpl} website` }; }
      if (id !== 'site.open') { if (!st.open) await D.open({}); await D.ask(s.text); return { said: true, sum: 'changed the website' }; }
      await D.open({}); return { text: 'Opened the website designer.', sum: 'opened the website designer' };
    }
    if (/^build\./.test(id)) {
      const nm = sl.name ? ` called ${sl.name}` : '', style = sl.mode ? ` in ${sl.mode} mode` : sl.color ? ` in ${sl.color.name}` : '';
      let phrase;
      if (BUILDPHRASE[id]) phrase = BUILDPHRASE[id](nm) + style;
      else { const kind = s.label || id.slice(6); phrase = `build me a ${kind}${sl.name ? ` for ${sl.name}` : ''}${style}`; }
      pushUndo('build', 'build');
      return legacy(phrase, `made a ${s.label || id.slice(6)}${sl.name ? ' for ' + sl.name : ''}`);
    }
    if (area === 'canvas') {
      const CV = window.TribeCanvas, CF = window.TribeCanvasFlint;
      if (!CV) return { text: T('noPlace', { x: 'Design' }) };
      const st = CV.state ? CV.state() : {}; if (!st.open) CV.open();
      if (id === 'canvas.send' || id === 'canvas.export') { setTimeout(() => { const b = document.querySelector(id === 'canvas.send' ? '[data-cv-send], #cv-send' : '[data-cv-export], #cv-export'); if (b) b.click(); }, 300); return { text: T('canvasOpen', { x: '' }).trim() }; }
      if (CF && CF.ask) { setTimeout(() => CF.ask(s.text), st.open ? 0 : 450); return { said: true, sum: 'worked on the design' }; }
      return { text: T('canvasOpen', { x: '' }).trim() };
    }
    if (id === 'edit.picked') {
      const c = ctxNow();
      if (c.view === 'canvas' && c.selection && window.TribeCanvasFlint) { window.TribeCanvasFlint.ask(s.text); return { said: true }; }
      if (c.picked && window.TribePreviewFlint && window.TribePreviewFlint.ask) { window.TribePreviewFlint.ask(s.text); return { said: true, sum: 'changed the picked element' }; }
      return { text: T('pickFirst') };
    }
    if (id === 'preview.reload') { if (window.TribePreview) { if (!document.querySelector('#pvw')) window.TribePreview.open(); window.TribePreview.refresh(); } return { text: T('reload') }; }
    if (id === 'preview.device') { const P = window.TribePreview; if (P && !document.querySelector('#pvw [data-dev]')) P.open(); setTimeout(() => { const b = document.querySelector(`#pvw [data-dev="${sl.dev}"], [data-dev="${sl.dev}"]`); if (b) b.click(); }, 250); return { text: T('device', { x: sl.dev }) }; }
    if (id === 'preview.edit') { const P = window.TribePreview; if (P && !document.querySelector('#pvw')) P.open(); setTimeout(() => { const b = document.querySelector('#pvw-edit, [data-pvw-edit], #pvw [data-edit]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); }, 300); return { text: T('editOn') }; }
    if (id === 'comment.mode') { const P = window.TribePreview; if (P && !document.querySelector('#pvw') && view() !== 'canvas') P.open(); setTimeout(() => { if (window.TribePins && window.TribePins.toggle) window.TribePins.toggle(true); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' })); }, 300); return { text: T('commentOn') }; }
    if (id === 'publish') { if (window.TribePublish) window.TribePublish.open(); return { text: T('opened', { x: 'Publish' }), sum: 'opened Publish' }; }
    if (id.startsWith('theme.')) {
      const snap = lookSnap(), done = setTheme(id.slice(6)); if (!done) return { text: T('noPlace', { x: id.slice(6) }) };
      const nm = (window.TribeThemes.byId(done) || {}).name || done; pushUndo(`theme ${nm}`, () => lookRestore(snap)); return { text: T('theme', { x: nm }), sum: `switched to ${nm}` };
    }
    if (id === 'theme.system') { const snap = lookSnap(); S().set({ themeSystem: true }); window.TribeThemes.apply(S().get()); pushUndo('system theme', () => lookRestore(snap)); return { text: T('theme', { x: 'system light/dark' }) }; }
    if (id === 'accent.set') {
      if (!sl.color) return { text: Q('Which color?'), acts: ['teal', 'indigo', 'ember', 'rose'].map(c => [c, 'ask', `accent ${c}`]) };
      if (window.TribeLook && window.TribeLook.check && window.TribeLook.check('accent', sl.color.hex)) return { text: T('accentBad', { x: sl.color.name }) };
      const snap = lookSnap(); setLook({ accent: sl.color.hex }); pushUndo(`accent ${sl.color.name}`, () => lookRestore(snap)); return { text: T('accent', { x: sl.color.name }), sum: `made the accent ${sl.color.name}` };
    }
    if (id === 'textsize.set') { const snap = lookSnap(); const cur = (S().get().look || {}).fontSize || '', order = ['s', '', 'l', 'xl']; let v = sl.size; if (v === 'l' && cur === 'l') v = 'xl'; if (v === 's' && cur === 's') v = 's'; setLook({ fontSize: v }); pushUndo('text size', () => lookRestore(snap)); return { text: T('textsize', { x: { s: 'Small', '': 'Default', l: 'Large', xl: 'Larger' }[v] || 'Default' }) }; }
    if (id === 'lang.set') { const I = window.TribeI18n; if (!I) return { text: T('noPlace', { x: sl.lang }) }; const before = I.lang(); I.set(sl.lang); pushUndo('language', () => I.set(before)); const name = (I.LANGS.find(x => x[0] === sl.lang) || [])[1] || sl.lang; return { text: T('langSet', { x: name }) }; }
    if (id === 'personalize.open') { go('personalize'); return { text: T('opened', { x: 'Personalize' }) }; }
    if (id === 'invite' && window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo()) {
      if (window.TribeNextOpts) window.TribeNextOpts.sheet('friends');
      return { text: 'Friends join a tribe on a host. Move this one to a host (a laptop, a free cloud server or an Android phone) and then invite them.' };
    }
    if (id === 'invite') return legacy('invite a friend', 'opened the invite');
    if (id === 'host.start') return legacy('start hosting');
    if (id === 'host.stop') return legacy('stop hosting');
    if (id === 'connect.ai') return legacy('connect my ai');
    if (id === 'github.connect') {
      const solo = window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo();
      if (solo && window.TribeGhPhone) { window.TribeGhPhone.open(); return { text: 'Here is GitHub on this phone: paste a token once, then bring a repo in, push and pull. The token stays on this phone.' }; }
      go('repo'); return { text: 'Opened the code repository. Connect GitHub there to push and pull with friends.' };
    }
    if (id === 'brain.pick') { if (window.TribeBrain) window.TribeBrain.open(); return { text: T('opened', { x: "Flint's brain" }) }; }
    if (id === 'helper.toggle') return legacy(`turn ${sl.on ? 'on' : 'off'} the ${sl.what}`);
    if (id === 'jam.start') { const J = window.TribeJam; if (J) (J.start ? J.start() : J.open()); return { text: T('opened', { x: 'Jam' }), sum: 'started a jam' }; }
    // a tribe that lives only on this phone has nobody to call: say so and show the next options instead of a lonely call
    if ((id === 'huddle.start' || id === 'call.video' || id === 'call.share' || id === 'call.ring' || id === 'call.present') && window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo()) {
      if (window.TribeNextOpts) window.TribeNextOpts.sheet(id === 'call.share' || id === 'call.present' ? 'screenshare' : 'huddle');
      return { text: 'Calls need friends in the tribe, and this tribe lives only on this phone. Move it to a host, or open TribeCode on a laptop, and then call.' };
    }
    if (id === 'huddle.start') { const Hd = window.TribeHuddle; if (!Hd) return { text: T('noPlace', { x: 'Huddle' }) }; if (!Hd.inCall()) Hd.join(); pushUndo('huddle', () => Hd.leave()); return { text: T('huddleOn') }; }
    if (id.startsWith('call.') || id === 'secretary.summary') {
      const Hd = window.TribeHuddle, Cl = window.TribeCall;
      if (id === 'secretary.summary') {
        try {
          const t = await C.api('/secretary/summary');
          const parts = [];
          if ((t.summary || []).length) parts.push(t.summary.map(x => '- ' + x).join('\n'));
          if ((t.decisions || []).length) parts.push('Decided: ' + t.decisions.slice(0, 3).map(d => d.text).join(' · '));
          if ((t.actions || []).length) parts.push('Action items:\n' + t.actions.slice(0, 6).map(a => `- ${a.title}${a.ownerName ? ' (' + a.ownerName + ')' : ''}${a.due ? ' · due ' + a.due : ''}`).join('\n'));
          return { text: parts.length ? parts.join('\n\n') : 'Nothing said today yet. Chat, voice notes and shared huddle captions show up here.' };
        } catch (e) { return { text: e.message }; }
      }
      if (id === 'call.ring') { const p = sl.who; if (!p || !p.id) return { text: Q('Who should I ring?') }; if (!Hd.inCall()) await Hd.join(); if (Cl) Cl.ring(p.id); return { text: T('callRing', { p: first(p.name) }) }; }
      if (id === 'call.stage') { if (Cl) { if (sl.history) { if (Hd.inCall()) Cl.open(); Cl.history(); } else Cl.open(); } return { text: sl.history ? 'Here are your recent calls.' : T('huddleOn') }; }
      if (id === 'call.video') { if (!Hd.inCall() && sl.off) return { text: T('callNotIn') }; if (!Hd.inCall()) await Hd.join({ video: true }); else if (Hd.me().video === !!sl.off) await Hd.toggleCamera(); if (Cl && !sl.off) Cl.open(); return { text: T(sl.off ? 'callVideoOff' : 'callVideo') }; }
      if (!Hd || !Hd.inCall()) return { text: T('callNotIn') };
      if (id === 'call.share') { if (sl.off) { Hd.stopShare(); return { text: T('callShareOff') }; } Hd.share(); return { text: T('callShare') }; }
      if (id === 'call.present') { C.send({ type: 'call-present', on: true, view: document.body.dataset.view || '' }); return { text: T('callPresent') }; }
      if (id === 'call.hand') { if (Hd.me().hand === !sl.down) return { text: T(sl.down ? 'callHandDown' : 'callHand') }; Hd.toggleHand(); return { text: T(sl.down ? 'callHandDown' : 'callHand') }; }
      if (id === 'call.mute') { const me = Hd.me(); if (sl.what === 'deaf') { if (me.deaf !== sl.on) Hd.toggleDeaf(); } else if ((me.muted && !me.deaf) !== sl.on) Hd.toggleMute(); return { text: sl.on ? (sl.what === 'deaf' ? 'Deafened.' : 'Muted.') : 'You’re live.' }; }
    }
    if (id === 'huddle.leave') { const Hd = window.TribeHuddle; if (Hd && Hd.inCall()) Hd.leave(); return { text: T('huddleOff') }; }
    if (id === 'capture.toggle') { if (window.TribeCapture) window.TribeCapture.toggle(); return { text: T('opened', { x: 'Capture' }) }; }
    if (id === 'feedback') { if (window.TribeFeedback) window.TribeFeedback.open(); return { text: T('opened', { x: 'Feedback' }) }; }
    if (id === 'tour') { if (window.TribeFlintGuide) window.TribeFlintGuide.tour(); return { text: T('opened', { x: 'Tour' }) }; }
    if (id === 'prompt.copy') return legacy('copy a prompt for my ai');
    if (id === 'market.search') { go('market'); setTimeout(() => { const i = document.querySelector('#mk-q, .mk-search input, [data-mk-search]'); if (i && sl.q) { i.value = sl.q; i.dispatchEvent(new Event('input', { bubbles: true })); } }, 350); return { text: T('market', { q: sl.q ? ` · “${sl.q}”` : '' }) }; }
    if (id === 'trending') { go('trending'); return { text: T('trending') }; }
    if (id === 'studio.open') { if (window.TribeStudios) window.TribeStudios.open(String(sl.app || '').toLowerCase()); return { text: T('opened', { x: sl.app }) }; }
    if (id === 'asset.add') return legacy(s.text);
    if (id === 'find') return legacy('find ' + (sl.q || ''));
    if (id === 'people.where' || id === 'people.online' || id === 'people.working' || (id === 'status' && /\b(?:online|here|around|on)\s*\??$/i.test(s.text || ''))) { const PP = window.TribePeoplePanel; const r = PP && PP.flint(id === 'status' ? 'people.online' : id, sl); if (r) return r; }   // feat/presence
    if (id === 'status') return legacy("what's new");
    if (id === 'focus') return legacy('what should i do next');
    if (id === 'tiers') return legacy('what can you do');
    // ---- v0.31 features (feat/flint-cleanup) ----
    if (id === 'design.new') {   // the Design flow (app/ui/designflow.js) on that kind's gallery
      const DF = window.TribeDesignFlow; if (!DF) return { text: T('noPlace', { x: 'Design' }) };
      DF.open({ kind: sl.kind }); return { text: `Opened Design on ${sl.kind === 'poster' ? 'posters and graphics' : sl.kind === 'logo' ? 'logos and brand kits' : sl.kind === 'screen' ? 'app screens' : sl.kind + 's'}. Pick a starting point${sl.topic ? ` for ${sl.topic}` : ''}.`, sum: `opened Design (${sl.kind})` };
    }
    if (id === 'abilities.edit') { const A = window.TribeAbilities; if (!A || !A.edit) return { text: T('noPlace', { x: 'Abilities' }) }; await A.edit(); if (sl.skill) { const i = document.getElementById('ab-sk-in'); if (i) { i.value = String(sl.skill).slice(0, 24); i.focus(); } } return { text: sl.skill ? `Opened your abilities with “${sl.skill}” ready to add. Press Add, then Save.` : 'Opened your abilities: list what you can do and how you work.', sum: 'opened abilities' }; }
    if (id === 'market.installed') { const M = window.TribeMarket; if (!M) return { text: T('noPlace', { x: 'Marketplace' }) }; M.page({ tab: 'installed' }); return { text: T('opened', { x: 'Marketplace › Installed' }), sum: 'opened Installed' }; }
    if (id === 'market.remove') {
      const M = window.TribeMarket; if (!M) return { text: T('noPlace', { x: 'Marketplace' }) };
      const want = String(sl.name || '').toLowerCase().trim(), st = M.state ? M.state() : {}; const items = (st.items || []).filter(x => x.installed);
      const hit = items.find(x => String(x.name || x.title || '').toLowerCase() === want) || items.find(x => String(x.name || x.title || '').toLowerCase().includes(want));
      if (hit && M.remove) { await M.remove(hit.id); return { text: `Removed ${hit.name || hit.title}.`, sum: `removed ${hit.name || hit.title}` }; }
      M.page({ tab: 'installed' }); return { text: `Here is what you have installed. Press Remove on ${sl.name || 'the one you want gone'}.`, sum: 'opened Installed' };
    }
    if (id === 'demo.start') {
      const Dw = window.TribeDemoWatch, O = window.TribeOffline;
      if (Dw && Dw.start) { Dw.start({ mode: 'step' }); return { text: 'Starting the demo. Press Next to go step by step. Everything it makes is cleared when it ends.', sum: 'started the demo' }; }
      if (O && O.start) { O.start(); return { text: 'Starting the demo tribe.', sum: 'started the demo' }; }
      return { text: T('noPlace', { x: 'Demo' }) };
    }
    if (id === 'presence.off' || id === 'presence.on') {
      const Pz = window.TribePresence; if (!Pz || !Pz.setPrefs) return { text: T('noPlace', { x: 'Presence' }) };
      const before = Pz.prefs ? Pz.prefs() : { show: true }; const show = id === 'presence.on';
      await Pz.setPrefs({ show }); pushUndo('where you are', () => Pz.setPrefs({ show: before.show !== false }));
      return { text: show ? 'Your tribe can see where you are again.' : 'Done: your tribe no longer sees where you are. You still show as online. (Settings › Show where I am)', sum: show ? 'shared presence' : 'hid presence' };
    }
    if (id === 'sidebar.reset') { const Ro = window.TribeReorder; if (!Ro || !Ro.reset) return { text: T('noPlace', { x: 'Sidebar order' }) }; Ro.reset(); return { text: 'The left bar and sidebar are back in their default order.', sum: 'reset the sidebar order' }; }
    if (id === 'hello') return sl.thanks ? { text: T('thanks') } : { text: T('hello', { n: C && C.state && C.state().me ? ' ' + first(C.state().me.name) : '' }) };
    if (id === 'calc') return sl.value == null ? null : { text: sl.each ? T('each', sl.value != null ? { e: sl.expr, v: sl.value } : {}) : sl.total ? T('tip', { e: sl.expr, v: sl.value, t: sl.total }) : T('calc', { e: sl.expr, v: sl.value }) };
    if (id === 'convert') return sl.value == null ? null : { text: `${sl.n} ${sl.from} = **${sl.value}** ${sl.to}` };
    if (id === 'time.now') { const d = new Date(); let t, ds; try { t = d.toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' }); ds = d.toLocaleDateString(lang(), { weekday: 'long', month: 'long', day: 'numeric' }); } catch { t = d.toTimeString().slice(0, 5); ds = d.toDateString(); } return { text: T('time', { t, d: ds }) }; }
    if (id === 'date.calc') { const w = sl.when; if (!w || !w.date) return null; const ds = (() => { try { return new Date(w.date + 'T12:00').toLocaleDateString(lang(), { weekday: 'long', month: 'long', day: 'numeric' }); } catch { return w.date; } })(); if (sl.until) { const n = Math.round((new Date(w.date + 'T12:00') - new Date(new Date().toISOString().slice(0, 10) + 'T12:00')) / 864e5); return { text: T('until', { n, d: ds }) }; } return { text: T('dateIs', { d: ds }) }; }
    if (id === 'random') {
      const k = sl.kind;
      if (k === 'coin') return { text: Math.random() < 0.5 ? T('heads') : T('tails') };
      if (k === 'dice') return { text: T('rolled', { x: 1 + Math.floor(Math.random() * (sl.sides || 6)) }) };
      if (k === 'number') { const a = Math.min(sl.a, sl.b), b = Math.max(sl.a, sl.b); return { text: T('picked', { x: a + Math.floor(Math.random() * (b - a + 1)) }) }; }
      if (k === 'person') { const st = C && C.state ? C.state() : {}; const ppl = (st.members || []).filter(m => m.role !== 'agent' && m.role !== 'spectator'); const p = ppl.length ? ppl[Math.floor(Math.random() * ppl.length)] : st.me; return { text: T('picked', { x: first(p ? p.name : 'you') }) }; }
      return { text: Math.random() < 0.5 ? T('yes') : T('no') };
    }
    if (id === 'gig.self' || id === 'people.find') { const A = window.TribeAbilities; if (!A) return null; return { text: id === 'gig.self' ? A.flintPost(sl.what || '') : A.flintFind(String(sl.skill || '').replace(/^(?:do|make|help with)\s+/, '')), sum: id === 'gig.self' ? 'opened a gig for you' : 'opened Find people' }; }   // feat/company-gigs
    if (id === 'help.kb') { if (H.guide) { const g = await H.guide(s.text); if (g) return { said: true }; } return kbAnswer(s.text, H); }
    return null;
  }
  function rephrase(s, title) {
    const map = { 'task.done': `mark ${title} done`, 'task.start': `start ${title}`, 'task.review': `send ${title} to review`, 'task.delete': `delete the task ${title}`, 'task.assign': `assign ${title} to `, 'task.due': `push ${title} to `, 'task.rename': `rename ${title} to ` };
    return map[s.intent] || `${s.text} ${title}`;
  }
  function summaryOf(prev) { const sums = (prev || []).map(p => p && p.sum).filter(Boolean); return sums.length ? `Heads up: I ${sums.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : ''; }

  async function kbAnswer(q, H) {
    let ans = [];
    const FM = window.TribeFlintModel, sem = FM && FM.ready() ? FM : null;   // tier 1: with the local helper, more candidates, re-ranked by meaning
    if (connected()) { try { ans = (await C.api('/flint/kb?q=' + encodeURIComponent(q) + '&k=' + (sem ? 8 : 2))).answers || []; } catch {} }
    if (sem && ans.length > 1) ans = sem.rerank(q, ans, a => `${a.title} ${a.heading} ${a.snippet}`, a => a.score);
    if (!ans.length && N()) {   // offline: the Guide pages the app can see
      try { const r = await fetch((C ? C.base() : '') + '/api/guide'); if (r.ok) { const pages = (await r.json()).pages || []; const docs = []; pages.forEach(p => String(p.body || '').split(/\n(?=#{2,3}\s)/).forEach(sec => { const h = (/^#{2,3}\s+(.+)$/m.exec(sec) || [])[1] || p.title; docs.push({ id: docs.length, text: `${p.title} ${h} ${sec}`, p, h, sec }); })); const hit = N().search(N().index(docs), q, 1)[0]; if (hit && hit.score > 0.08) ans = [{ title: hit.doc.p.title, heading: hit.doc.h, snippet: hit.doc.sec.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 260), source: 'Guide', slug: hit.doc.p.slug }]; } } catch {}
    }
    const a = ans[0];
    if (!a || (a.score != null && a.score < 0.1)) return null;
    // the answer must share the question's real words, not just "tell" or "work"
    const GEN = new Set('tell make does work works with what when where about this that have your there their from into joke funny please thing things stuff'.split(' '));
    const qw = String(q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !GEN.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ''));
    const hay = `${a.title} ${a.heading} ${a.snippet}`.toLowerCase();
    const hit = qw.filter(w => hay.includes(w)).length;
    if (!(a.cos >= 0.6) && (!qw.length || hit < Math.max(1, Math.ceil(qw.length / 3)))) return null;   // close in meaning is enough when the local helper says so
    const src = a.source === 'Guide' ? `the Guide › ${a.title}` : `${a.file || a.title}`;
    return { text: T('kb', { src, h: a.heading || a.title, s: a.snippet }), acts: a.slug ? [['Open in Guide', 'guide', a.slug]] : [], kb: true };
  }

  // ---------- the entry point ----------
  const LOCAL_ONLY = new Set(['undo', 'teach', 'meant', 'unteach', 'taught', 'lesson', 'redo']);   // feat/flint-site: lessons before Flint's "teach me what X is"
  const LOCAL_FIRST = /^(design\.palette|design\.fonts|copy\.|sheet\.(?:sum|sort|format|total|chart)|doc\.(?:toc|checklist|caps|summary|readability)|deck\.pitch|timer|settings\.|chat\.(?:pin|react)|file\.whiteboard|flint\.clear|doc\.template|market\.add|inspo\.search|nav\.(?:people|work)|preview\.(?:open|share)|task\.|chat\.send|dm\.|event\.add|cal\.show|theme\.|accent\.set|textsize\.set|lang\.set|calc|convert|time\.now|date\.calc|random|canvas\.|edit\.picked|preview\.(device|reload|edit)|comment\.mode|trending|market\.search|studio\.open|jam\.start|huddle\.|call\.|secretary\.summary|publish|site\.gallery|personalize\.open|feedback|tour|brain\.pick|build\.|site\.|premium\.)/;
  let lastMiss = null;
  async function handle(text, H) {
    // the preview shows the website: its edits ("make the headline say …", "add a pricing section") go to the preview's Flint
    const PV = window.TribePreview, SE = window.TribeSiteEditCore, PF = window.TribePreviewFlint;
    if (PV && PV.source && PV.source() === 'site' && document.querySelector('#pvw') && SE && PF && PF.ask && SE.parse(text)) { PF.ask(text); if (PF.open && !matchMedia('(max-width: 820px)').matches) PF.open(); return H.say('On it: the change shows in the website preview, with Undo next to it.', []); }
    const NL = N(); if (!NL) return (await H.special(text)) ? true : null;
    syncLearned(); await tasks();
    const ctx = ctxNow(), P = NL.parse(text, ctx), steps = P.steps;
    const sayR = r => { if (!r || r.said) return true; return H.say(r.text, (r.acts || []).map(a => H.act(a[0], a[1], a[2])), r.html ? { html: r.html } : undefined); };
    if (steps.length === 1) {
      const s = steps[0];
      if (s.intent && LOCAL_ONLY.has(s.intent)) return sayR(await localOnly(s));
      if (await H.special(text)) { lastMiss = null; return true; }
      const legacyHit = H.legacyHit(text);
      if (s.intent && s.conf >= 0.6 && (LOCAL_FIRST.test(s.intent) || !legacyHit)) {
        if (s.ask && !(s.intent === 'dm.send' && s.slots && s.slots.toChat)) { lastMiss = null; return H.say(Q(s.ask.question), (s.ask.options || []).map(o => H.act(o, 'ask', fillAsk(s, o)))); }
        const r = await step(s, H, []);
        if (r) { lastMiss = null; if (P.learned) r.text = (r.text || '') + ''; return sayR(r); }
      }
      if (legacyHit) { lastMiss = null; return H.legacy(text); }
      // nothing local was sure: a question gets the docs; with a brain, the model; otherwise "did you mean" or the honest card
      if (/^(how|why|where|when|what|can|could|is|are|do|does|explain|help|tell me about)\b|\?$/i.test(text.trim()) && !H.modelOnline()) { if (H.guide && await H.guide(text)) { lastMiss = null; return true; } const kb = await kbAnswer(text, H); if (kb) { lastMiss = null; return sayR(kb); } }
      if (H.modelOnline()) return null;
      lastMiss = text;
      const alts = (s.alts || P.alts || []).filter(a => a.example || a.intent).slice(0, 3);
      if (s.intent && s.conf >= 0.45) { const ex = exampleOf(s.intent); if (ex) alts.unshift({ intent: s.intent, example: ex }); }
      const uniq = []; alts.forEach(a => { const ex = a.example || exampleOf(a.intent); if (ex && !uniq.includes(ex)) uniq.push(ex); });
      if (uniq.length && (s.conf >= 0.45 || (alts[0] && alts[0].score >= 0.35))) return H.say(T('didYou'), uniq.slice(0, 3).map(e => H.act(e, 'meant', JSON.stringify({ say: text, means: e }))));
      return null;   // flint.js shows its basic-mode reply (with the honest offer of a brain / an AI helper)
    }
    // several steps
    const prev = [], lines = [];
    for (const s of steps) {
      if (!s.intent || s.conf < 0.55) { if (lines.length) H.say(T('multi', { list: lines.join(' · ') })); return H.say(T('stopped', { s: s.text })); }
      if (s.ask && !(s.intent === 'dm.send' && prev.length)) { if (lines.length) H.say(T('multi', { list: lines.join(' · ') })); return H.say(Q(s.ask.question), (s.ask.options || []).map(o => H.act(o, 'ask', fillAsk(s, o)))); }
      const r = await step(s, H, prev);
      if (!r) { if (lines.length) H.say(T('multi', { list: lines.join(' · ') })); return H.say(T('stopped', { s: s.text })); }
      prev.push(r);
      if (!r.said && r.text) lines.push(r.text.replace(/\.$/, ''));
    }
    if (lines.length) H.say(lines.length === 1 ? lines[0] : T('multi', { list: lines.join(' · ') }), []);
    return true;
  }
  function fillAsk(s, o) {
    const m = { 'task.add': `add a task to ${o}`, 'task.done': `mark ${o} done`, 'task.review': `send ${o} to review`, 'task.delete': `delete the task ${o}`, 'task.due': `${s.text} ${o}`, 'task.assign': s.ask.slot === 'who' ? `${s.text} to ${o}` : `assign ${o} to `, 'accent.set': `accent ${o}` };
    return m[s.intent] || `${s.text} ${o}`;
  }
  const exampleOf = id => { const c = N() && N().catalog().find(x => x.id === id); return c && c.examples[0]; };
  async function localOnly(s) {
    const sl = s.slots || {};
    if (s.intent === 'undo') return undo();
    if (s.intent === 'lesson' || s.intent === 'redo') return step(s, { say: () => true, act: l => l, legacy: async () => true }, []);
    if (s.intent === 'teach') { await learn(sl.say, sl.means); return { text: T('taught', { s: sl.say, m: sl.means }) }; }
    if (s.intent === 'meant') { if (!lastMiss) return { text: T('noUndo') }; const say = lastMiss; lastMiss = null; await learn(say, sl.means); return { text: T('meant', { s: say, m: sl.means }), acts: [[sl.means, 'ask', sl.means]] }; }
    if (s.intent === 'unteach') { const ok = await unlearn(sl.say); return ok ? { text: T('forgot', { s: sl.say }) } : { text: T('taughtNone') }; }
    if (s.intent === 'taught') { const L = learnedList(); return L.length ? { text: T('taughtList', { list: L.map(x => `“${x.say}” → ${x.means}`).join(' · ') }) } : { text: T('taughtNone') }; }
    return null;
  }
  // a "did you mean" chip: learn the pairing, then run it
  async function meant(arg) { let o = {}; try { o = JSON.parse(arg); } catch {} if (o.say && o.means) await learn(o.say, o.means); if (window.TribeFlint) window.TribeFlint.ask(o.means || ''); }

  window.TribeFlintLocal = { handle, meant, parse: t => N() && N().parse(t, ctxNow()), ctx: ctxNow, undo, learned: learnedList, _learn: learn };
})();
