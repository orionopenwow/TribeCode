// App languages (v0.26): the same eight as the website (site/i18n.js): English, Español, Português, Français, Deutsch,
// 日本語, 简体中文, 한국어. Settings › Language picks one; the first time, the app follows the device's language.
// How: the app's chrome (sidebar, rack, Settings, Inbox, Task Board, Preview, common buttons) is translated by exact
// text: text nodes, placeholders, titles and aria-labels whose English matches a key below swap to the chosen language,
// and a MutationObserver keeps re-rendered views translated. Chat, docs, task titles and anything people write are
// never touched (only exact matches of these UI strings). The original English is remembered, so switching back works.
// Stored in localStorage 'tribecode.lang'. Public: window.TribeI18n = { lang(), set(code), t(key, fallback), LANGS }.
(function () {
  const LANGS = [['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['zh', '简体中文'], ['ko', '한국어']];
  const IDX = { es: 0, pt: 1, fr: 2, de: 3, ja: 4, zh: 5, ko: 6 };
  // English -> [es, pt, fr, de, ja, zh, ko]
  const D = {
    // v0.28 Make it yours (personalize.js): first-launch name, icon, theme, language
    'Make it yours': ['Hazlo tuyo', 'Deixe do seu jeito', 'Personnalisez', 'Mach es zu deinem', '自分好みに', '打造专属于你', '나만의 스타일로'],
    'What should friends call you?': ['¿Cómo te llaman tus amigos?', 'Como seus amigos devem te chamar?', 'Comment vos amis vous appellent-ils ?', 'Wie sollen dich Freunde nennen?', '友だちに何と呼ばれたい？', '朋友们怎么称呼你？', '친구들이 뭐라고 부르면 될까요?'],
    'Pick a look': ['Elige un estilo', 'Escolha um visual', 'Choisissez un style', 'Wähle einen Look', '見た目を選ぶ', '选择外观', '스타일 고르기'],
    'Last touches': ['Últimos detalles', 'Últimos detalhes', 'Dernières touches', 'Letzter Schliff', '仕上げ', '最后几项', '마무리'],
    'Your name': ['Tu nombre', 'Seu nome', 'Votre nom', 'Dein Name', 'あなたの名前', '你的名字', '이름'],
    'Profile icon': ['Icono de perfil', 'Ícone do perfil', 'Icône de profil', 'Profilbild', 'プロフィールアイコン', '头像', '프로필 아이콘'],
    'Letters': ['Iniciales', 'Iniciais', 'Initiales', 'Initialen', 'イニシャル', '首字母', '이니셜'],
    'Upload a photo': ['Subir una foto', 'Enviar uma foto', 'Importer une photo', 'Foto hochladen', '写真をアップロード', '上传照片', '사진 올리기'],
    'Photo': ['Foto', 'Foto', 'Photo', 'Foto', '写真', '照片', '사진'],
    'Accent': ['Acento', 'Destaque', 'Accent', 'Akzent', 'アクセント', '强调色', '강조 색'],
    'Match my system (light/dark)': ['Seguir mi sistema (claro/oscuro)', 'Seguir meu sistema (claro/escuro)', 'Suivre mon système (clair/sombre)', 'System folgen (hell/dunkel)', 'システムに合わせる（ライト/ダーク）', '跟随系统（浅色/深色）', '시스템 설정 따르기(라이트/다크)'],
    'Text size': ['Tamaño del texto', 'Tamanho do texto', 'Taille du texte', 'Textgröße', '文字サイズ', '文字大小', '글자 크기'],
    'Small': ['Pequeño', 'Pequeno', 'Petit', 'Klein', '小', '小', '작게'],
    'Default': ['Normal', 'Padrão', 'Par défaut', 'Standard', '標準', '默认', '기본'],
    'Large': ['Grande', 'Grande', 'Grand', 'Groß', '大', '大', '크게'],
    'Larger': ['Más grande', 'Maior', 'Plus grand', 'Größer', '特大', '更大', '더 크게'],
    'You can change all of this later in Settings.': ['Puedes cambiar todo esto luego en Ajustes.', 'Você pode mudar tudo isso depois em Configurações.', 'Vous pourrez tout changer plus tard dans les Réglages.', 'Du kannst das alles später in den Einstellungen ändern.', 'あとで設定からいつでも変更できます。', '之后可以在设置中随时更改。', '나중에 설정에서 언제든 바꿀 수 있어요.'],
    'Live preview': ['Vista previa en vivo', 'Prévia ao vivo', 'Aperçu en direct', 'Live-Vorschau', 'ライブプレビュー', '实时预览', '실시간 미리보기'],
    'Skip': ['Omitir', 'Pular', 'Passer', 'Überspringen', 'スキップ', '跳过', '건너뛰기'],
    'Back': ['Atrás', 'Voltar', 'Retour', 'Zurück', '戻る', '返回', '뒤로'],
    'Next': ['Siguiente', 'Próximo', 'Suivant', 'Weiter', '次へ', '下一步', '다음'],
    'Step': ['Paso', 'Etapa', 'Étape', 'Schritt', 'ステップ', '步骤', '단계'],
    'You': ['Tú', 'Você', 'Vous', 'Du', 'あなた', '你', '나'],
    'My Tribe': ['Mi tribu', 'Minha tribo', 'Ma tribu', 'Mein Tribe', 'マイトライブ', '我的部落', '내 트라이브'],
    'Personalize': ['Personalizar', 'Personalizar', 'Personnaliser', 'Personalisieren', 'パーソナライズ', '个性化', '개인화'],
    'Make it yours…': ['Hazlo tuyo…', 'Deixe do seu jeito…', 'Personnalisez…', 'Mach es zu deinem…', '自分好みに…', '打造专属于你…', '나만의 스타일로…'],
    'Frame your avatar': ['Encuadra tu avatar', 'Enquadre seu avatar', 'Cadrez votre avatar', 'Avatar zuschneiden', 'アバターの位置を調整', '调整头像', '아바타 맞추기'],
    'Light': ['Claro', 'Claro', 'Clair', 'Hell', 'ライト', '浅色', '라이트'],
    'High contrast': ['Alto contraste', 'Alto contraste', 'Contraste élevé', 'Hoher Kontrast', 'ハイコントラスト', '高对比度', '고대비'],
    'Hey! Let’s build something fun this weekend.': ['¡Hola! Construyamos algo divertido este finde.', 'Oi! Vamos criar algo divertido neste fim de semana.', 'Salut ! On construit un truc sympa ce week-end ?', 'Hey! Lass uns am Wochenende was Cooles bauen.', 'やあ！週末に何か楽しいものを作ろう。', '嘿！这周末一起做点好玩的吧。', '안녕! 이번 주말에 재밌는 거 만들자.'],
    'I’m in. Tell me what you want to make.': ['Me apunto. Dime qué quieres hacer.', 'Tô dentro. Me diga o que você quer criar.', 'Partant. Dites-moi ce que vous voulez faire.', 'Bin dabei. Sag mir, was du bauen willst.', 'いいね。何を作りたいか教えて。', '我加入。告诉我你想做什么。', '좋아요. 뭘 만들고 싶은지 알려 주세요.'],
    'Message #general': ['Mensaje en #general', 'Mensagem em #general', 'Message dans #general', 'Nachricht an #general', '#general にメッセージ', '在 #general 发消息', '#general에 메시지'],
    'Ember': ['Brasa', 'Brasa', 'Braise', 'Glut', 'エンバー', '余烬', '엠버'],
    'Teal': ['Verde azulado', 'Verde-azulado', 'Sarcelle', 'Petrol', 'ティール', '青绿', '틸'],
    'Indigo': ['Índigo', 'Índigo', 'Indigo', 'Indigo', 'インディゴ', '靛蓝', '인디고'],
    'Rose': ['Rosa', 'Rosa', 'Rose', 'Rosé', 'ローズ', '玫瑰', '로즈'],
    'Amber': ['Ámbar', 'Âmbar', 'Ambre', 'Bernstein', 'アンバー', '琥珀', '앰버'],
    'Violet': ['Violeta', 'Violeta', 'Violet', 'Violett', 'バイオレット', '紫罗兰', '바이올렛'],
    // v0.27.1 Settings › Flint and Flint's lesson buttons
    "What Flint remembers about you": ["Lo que Flint recuerda de ti", "O que o Flint lembra de você", "Ce dont Flint se souvient sur vous", "Was Flint über dich weiß", "Flint が覚えているあなたのこと", "Flint 记得的关于你的事", "Flint가 기억하는 나"],
    "Tribe skills": ["Habilidades de la tribu", "Habilidades da tribo", "Compétences de la tribu", "Tribe-Skills", "トライブのスキル", "部落技能", "트라이브 스킬"],
    "How you like to learn": ["Cómo te gusta aprender", "Como você gosta de aprender", "Comment vous aimez apprendre", "Wie du gern lernst", "好きな学び方", "你喜欢的学习方式", "좋아하는 학습 방식"],
    "Forget everything": ["Olvidar todo", "Esquecer tudo", "Tout oublier", "Alles vergessen", "すべて忘れる", "全部忘记", "모두 잊기"],
    "Save skill": ["Guardar habilidad", "Salvar habilidade", "Enregistrer la compétence", "Skill speichern", "スキルを保存", "保存技能", "스킬 저장"],
    "Save steps": ["Guardar pasos", "Salvar passos", "Enregistrer les étapes", "Schritte speichern", "手順を保存", "保存步骤", "단계 저장"],
    "Another way": ["De otra forma", "De outro jeito", "Autrement", "Anders erklärt", "別の説明", "换个方式", "다른 방식으로"],
    "Quiz me lightly": ["Pregúntame algo fácil", "Faça um quiz leve", "Petit quiz", "Kleines Quiz", "軽くクイズ", "来个小测验", "가볍게 퀴즈"],
    "Flint picks": ["Flint elige", "Flint escolhe", "Flint choisit", "Flint wählt", "Flint におまかせ", "由 Flint 决定", "Flint가 선택"],
    "As a picture": ["Con un dibujo", "Com uma imagem", "En image", "Als Bild", "絵で", "用图", "그림으로"],
    "As an analogy": ["Con una analogía", "Com uma analogia", "Par analogie", "Als Vergleich", "たとえで", "用类比", "비유로"],
    "As code": ["Con código", "Com código", "En code", "Als Code", "コードで", "用代码", "코드로"],
    "Step by step": ["Paso a paso", "Passo a passo", "Pas à pas", "Schritt für Schritt", "ステップごとに", "一步一步", "단계별로"],
    "Nothing yet.": ["Nada todavía.", "Nada ainda.", "Rien pour l’instant.", "Noch nichts.", "まだありません。", "还没有。", "아직 없어요."],
    "No skills yet.": ["Aún no hay habilidades.", "Ainda não há habilidades.", "Aucune compétence pour l’instant.", "Noch keine Skills.", "スキルはまだありません。", "还没有技能。", "아직 스킬이 없어요."],
    // sidebar + nav
    'Dashboard': ['Panel', 'Painel', 'Tableau de bord', 'Übersicht', 'ダッシュボード', '仪表板', '대시보드'],
    'Messages': ['Mensajes', 'Mensagens', 'Messages', 'Nachrichten', 'メッセージ', '消息', '메시지'],
    'Files': ['Archivos', 'Arquivos', 'Fichiers', 'Dateien', 'ファイル', '文件', '파일'],
    'Task Board': ['Tablero de tareas', 'Quadro de tarefas', 'Tableau des tâches', 'Aufgabenboard', 'タスクボード', '任务板', '작업 보드'],
    'Agents Hub': ['Centro de agentes', 'Central de agentes', 'Centre des agents', 'Agenten-Hub', 'エージェントハブ', '代理中心', '에이전트 허브'],
    'Settings': ['Ajustes', 'Configurações', 'Paramètres', 'Einstellungen', '設定', '设置', '설정'],
    'Invite friends': ['Invitar amigos', 'Convidar amigos', 'Inviter des amis', 'Freunde einladen', '友だちを招待', '邀请朋友', '친구 초대'],
    'Preview app': ['Vista previa de la app', 'Prévia do app', 'Aperçu de l’app', 'App-Vorschau', 'アプリをプレビュー', '预览应用', '앱 미리보기'],
    'Play the game': ['Jugar el juego', 'Jogar o jogo', 'Jouer au jeu', 'Spiel spielen', 'ゲームをプレイ', '玩游戏', '게임 하기'],
    'Preview the site': ['Vista previa del sitio', 'Prévia do site', 'Aperçu du site', 'Website-Vorschau', 'サイトをプレビュー', '预览网站', '사이트 미리보기'],
    'Preview the app': ['Vista previa de la app', 'Prévia do app', 'Aperçu de l’app', 'App-Vorschau', 'アプリをプレビュー', '预览应用', '앱 미리보기'],
    // v0.27 Studios
    'Market': ['Mercado', 'Mercado', 'Marché', 'Markt', 'マーケット', '市场', '마켓'],
    'Shelf': ['Estante', 'Estante', 'Étagère', 'Regal', 'シェルフ', '书架', '선반'],
    'Library': ['Biblioteca', 'Biblioteca', 'Bibliothèque', 'Bibliothek', 'ライブラリ', '资料库', '라이브러리'],
    'Studios': ['Estudios', 'Estúdios', 'Studios', 'Studios', 'スタジオ', '工作室', '스튜디오'],
    'Creative tools': ['Herramientas creativas', 'Ferramentas criativas', 'Outils créatifs', 'Kreativ-Tools', 'クリエイティブツール', '创作工具', '크리에이티브 도구'],
    'Download ↗': ['Descargar ↗', 'Baixar ↗', 'Télécharger ↗', 'Herunterladen ↗', 'ダウンロード ↗', '下载 ↗', '다운로드 ↗'],
    'How it helps': ['Cómo ayuda', 'Como ajuda', 'À quoi ça sert', 'Wie es hilft', 'どう役立つか', '有什么帮助', '어떻게 도움이 되나'],
    'We use': ['Usamos', 'Usamos', 'On utilise', 'Wir nutzen', '使っている', '我们在用', '사용 중'],
    'We use this': ['Usamos esto', 'Usamos isto', 'On l’utilise', 'Nutzen wir', 'これを使う', '我们在用这个', '이걸 사용해요'],
    '✓ We use this': ['✓ Usamos esto', '✓ Usamos isto', '✓ On l’utilise', '✓ Nutzen wir', '✓ これを使う', '✓ 我们在用这个', '✓ 이걸 사용해요'],
    'Featured': ['Destacado', 'Destaque', 'À la une', 'Empfohlen', 'おすすめ', '精选', '추천'],
    'All studios': ['Todos los estudios', 'Todos os estúdios', 'Tous les studios', 'Alle Studios', 'すべてのスタジオ', '全部工作室', '모든 스튜디오'],
    "What it's good for": ['Para qué sirve', 'Para que serve', 'À quoi il sert', 'Wofür es gut ist', '得意なこと', '适合做什么', '잘하는 것'],
    'Bring your work back': ['Trae tu trabajo de vuelta', 'Traga seu trabalho de volta', 'Rapportez votre travail', 'Bring deine Arbeit zurück', '作ったものを戻す', '把作品带回来', '작업물 가져오기'],
    'Open Studios': ['Abrir Estudios', 'Abrir Estúdios', 'Ouvrir Studios', 'Studios öffnen', 'スタジオを開く', '打开工作室', '스튜디오 열기'],
    'Make your own: Studios': ['Haz los tuyos: Estudios', 'Faça os seus: Estúdios', 'Créez les vôtres : Studios', 'Selbst machen: Studios', '自分で作る：スタジオ', '自己做：工作室', '직접 만들기: 스튜디오'],
    'Add': ['Añadir', 'Adicionar', 'Ajouter', 'Hinzufügen', '追加', '添加', '추가'],
    'Recents': ['Recientes', 'Recentes', 'Récents', 'Zuletzt', '最近', '最近', '최근'],
    'Pinned': ['Fijados', 'Fixados', 'Épinglés', 'Angeheftet', 'ピン留め', '已固定', '고정됨'],
    'New': ['Nuevo', 'Novo', 'Nouveau', 'Neu', '新規', '新建', '새로 만들기'],
    'Search': ['Buscar', 'Buscar', 'Rechercher', 'Suchen', '検索', '搜索', '검색'],
    'Board': ['Tablero', 'Quadro', 'Tableau', 'Board', 'ボード', '看板', '보드'],
    'Calendar': ['Calendario', 'Calendário', 'Calendrier', 'Kalender', 'カレンダー', '日历', '캘린더'],
    'Bugs': ['Errores', 'Bugs', 'Bugs', 'Fehler', 'バグ', '缺陷', '버그'],
    'Requests': ['Solicitudes', 'Pedidos', 'Demandes', 'Anfragen', 'リクエスト', '请求', '요청'],
    'Milestones': ['Hitos', 'Marcos', 'Jalons', 'Meilensteine', 'マイルストーン', '里程碑', '마일스톤'],
    'Website': ['Sitio web', 'Site', 'Site web', 'Website', 'ウェブサイト', '网站', '웹사이트'],
    'Code repository': ['Repositorio de código', 'Repositório de código', 'Dépôt de code', 'Code-Repository', 'コードリポジトリ', '代码仓库', '코드 저장소'],
    'Visuals & screenshots': ['Imágenes y capturas', 'Imagens e capturas', 'Visuels et captures', 'Bilder & Screenshots', 'ビジュアルとスクショ', '视觉与截图', '비주얼 & 스크린샷'],
    'Your agents': ['Tus agentes', 'Seus agentes', 'Vos agents', 'Deine Agenten', 'あなたのエージェント', '你的代理', '내 에이전트'],
    // phone rack
    'Chat': ['Chat', 'Chat', 'Discussion', 'Chat', 'チャット', '聊天', '채팅'],
    'Docs': ['Docs', 'Docs', 'Docs', 'Doks', 'ドキュメント', '文档', '문서'],
    'Updates': ['Novedades', 'Novidades', 'Nouveautés', 'Neuigkeiten', '更新', '动态', '업데이트'],
    'Tasks': ['Tareas', 'Tarefas', 'Tâches', 'Aufgaben', 'タスク', '任务', '작업'],
    // task board
    'Backlog': ['Pendientes', 'Pendentes', 'À faire', 'Backlog', 'バックログ', '待办', '백로그'],
    'In progress': ['En curso', 'Em andamento', 'En cours', 'In Arbeit', '進行中', '进行中', '진행 중'],
    'Review': ['Revisión', 'Revisão', 'Relecture', 'Review', 'レビュー', '审核', '검토'],
    'Done': ['Hecho', 'Concluído', 'Terminé', 'Fertig', '完了', '完成', '완료'],
    // v0.28 Task Board dashboard: tiles, sections, row buttons, menus, the drawer
    'Needs someone': ['Sin asignar', 'Sem responsável', 'À attribuer', 'Braucht jemanden', '担当者なし', '待认领', '담당자 필요'],
    'Unassigned': ['Sin asignar', 'Sem responsável', 'Non attribuée', 'Nicht zugewiesen', '未割当', '未分配', '미배정'],
    'No one': ['Nadie', 'Ninguém', 'Personne', 'Niemand', '担当なし', '无人', '없음'],
    'Doing': ['En curso', 'Fazendo', 'En cours', 'Läuft', '作業中', '进行中', '진행'],
    'Waiting for review': ['Esperando revisión', 'Aguardando revisão', 'En attente de relecture', 'Wartet auf Review', 'レビュー待ち', '等待审核', '검토 대기'],
    'Done this week': ['Hecho esta semana', 'Feito nesta semana', 'Fait cette semaine', 'Diese Woche fertig', '今週完了', '本周完成', '이번 주 완료'],
    'Overdue': ['Atrasadas', 'Atrasadas', 'En retard', 'Überfällig', '期限切れ', '已逾期', '기한 지남'],
    'Late': ['Tarde', 'Atraso', 'Retard', 'Spät', '遅れ', '逾期', '지연'],
    'For me': ['Para mí', 'Para mim', 'Pour moi', 'Für mich', '自分用', '给我', '내 작업'],
    'Due': ['Fecha', 'Prazo', 'Échéance', 'Fällig', '期限', '截止', '마감'],
    'Add a task… press Enter': ['Añade una tarea… pulsa Enter', 'Adicione uma tarefa… tecle Enter', 'Ajoutez une tâche… appuyez sur Entrée', 'Aufgabe hinzufügen… Enter drücken', 'タスクを追加… Enter で決定', '添加任务… 按 Enter', '작업 추가… Enter 누르기'],
    'Add a task': ['Añadir una tarea', 'Adicionar uma tarefa', 'Ajouter une tâche', 'Aufgabe hinzufügen', 'タスクを追加', '添加任务', '작업 추가'],
    'List': ['Lista', 'Lista', 'Liste', 'Liste', 'リスト', '列表', '목록'],
    'View': ['Vista', 'Visualização', 'Vue', 'Ansicht', '表示', '视图', '보기'],
    'Filter tasks': ['Filtrar tareas', 'Filtrar tarefas', 'Filtrer les tâches', 'Aufgaben filtern', 'タスクを絞り込む', '筛选任务', '작업 필터'],
    'Showing': ['Mostrando', 'Mostrando', 'Affichage', 'Angezeigt', '表示中', '正在显示', '표시 중'],
    'Up next': ['Lo siguiente', 'A seguir', 'À suivre', 'Als Nächstes', '次にやること', '接下来', '다음 작업'],
    "Nobody's on these yet. Take one or hand it off.": ['Nadie las tiene aún. Toma una o pásala.', 'Ninguém pegou ainda. Pegue uma ou passe adiante.', 'Personne dessus. Prenez-en une ou confiez-la.', 'Noch niemand dran. Nimm eine oder gib sie ab.', 'まだ誰も担当していません。取るか任せましょう。', '还没人认领。自己接，或交给别人。', '아직 담당자가 없어요. 맡거나 넘기세요.'],
    'Being built right now.': ['Se están haciendo ahora.', 'Sendo feitas agora.', 'En cours de construction.', 'Wird gerade gebaut.', '今まさに作業中。', '正在制作中。', '지금 만드는 중.'],
    'Ready for a second look. Approve or send back.': ['Listas para revisar. Aprueba o devuelve.', 'Prontas para revisão. Aprove ou devolva.', 'Prêtes pour une relecture. Approuvez ou renvoyez.', 'Bereit zum Gegenlesen. Freigeben oder zurückgeben.', '確認待ち。承認するか差し戻しましょう。', '等你看一眼。批准或退回。', '검토 준비 완료. 승인하거나 돌려보내세요.'],
    'Someone has these. Not started yet.': ['Ya tienen responsable. Aún sin empezar.', 'Já têm responsável. Ainda não começaram.', 'Quelqu’un s’en charge. Pas encore commencées.', 'Jemand hat sie. Noch nicht begonnen.', '担当者あり。まだ未着手。', '已有人认领，还没开始。', '담당자 있음. 아직 시작 전.'],
    'Assign': ['Asignar', 'Atribuir', 'Attribuer', 'Zuweisen', '割り当て', '分配', '배정'],
    'Assign…': ['Asignar…', 'Atribuir…', 'Attribuer…', 'Zuweisen…', '割り当て…', '分配…', '배정…'],
    'Start': ['Empezar', 'Começar', 'Commencer', 'Starten', '開始', '开始', '시작'],
    'Send for review': ['Enviar a revisión', 'Enviar para revisão', 'Envoyer en relecture', 'Zum Review schicken', 'レビューに出す', '提交审核', '검토 요청'],
    'Send back': ['Devolver', 'Devolver', 'Renvoyer', 'Zurückgeben', '差し戻す', '退回', '돌려보내기'],
    'Reopen': ['Reabrir', 'Reabrir', 'Rouvrir', 'Wieder öffnen', '再開', '重新打开', '다시 열기'],
    'Nobody yet': ['Nadie aún', 'Ninguém ainda', 'Personne', 'Noch niemand', 'まだ誰も', '暂无', '아직 없음'],
    'Me': ['Yo', 'Eu', 'Moi', 'Ich', '自分', '我', '나'],
    'AI helper': ['Ayudante IA', 'Ajudante IA', 'Assistant IA', 'KI-Helfer', 'AI ヘルパー', 'AI 助手', 'AI 도우미'],
    'An AI helper': ['Un ayudante IA', 'Um ajudante IA', 'Un assistant IA', 'Ein KI-Helfer', 'AI ヘルパー', '一个 AI 助手', 'AI 도우미'],
    'Mark done': ['Marcar como hecha', 'Marcar como feita', 'Marquer comme faite', 'Als erledigt markieren', '完了にする', '标记完成', '완료로 표시'],
    'Mark not done': ['Marcar como pendiente', 'Marcar como não feita', 'Marquer comme non faite', 'Als offen markieren', '未完了に戻す', '标记未完成', '미완료로 표시'],
    'More actions': ['Más acciones', 'Mais ações', 'Plus d’actions', 'Weitere Aktionen', 'その他の操作', '更多操作', '더 보기'],
    'Show all': ['Ver todo', 'Ver tudo', 'Tout afficher', 'Alle zeigen', 'すべて表示', '显示全部', '모두 보기'],
    'Show less': ['Ver menos', 'Ver menos', 'Afficher moins', 'Weniger zeigen', '折りたたむ', '收起', '접기'],
    'Move to': ['Mover a', 'Mover para', 'Déplacer vers', 'Verschieben nach', '移動先', '移到', '이동'],
    'Open details': ['Abrir detalles', 'Abrir detalhes', 'Ouvrir les détails', 'Details öffnen', '詳細を開く', '打开详情', '자세히 열기'],
    'Ask an AI helper': ['Pedir a un ayudante IA', 'Pedir a um ajudante IA', 'Demander à un assistant IA', 'Einen KI-Helfer fragen', 'AI ヘルパーに頼む', '请 AI 助手来做', 'AI 도우미에게 맡기기'],
    '🔥 Ask Flint to pick': ['🔥 Que Flint elija', '🔥 Pedir ao Flint para escolher', '🔥 Laisser Flint choisir', '🔥 Flint wählen lassen', '🔥 Flint に選んでもらう', '🔥 让 Flint 来选', '🔥 Flint에게 고르기 맡기기'],
    '✂️ Split into smaller tasks': ['✂️ Dividir en tareas más pequeñas', '✂️ Dividir em tarefas menores', '✂️ Découper en petites tâches', '✂️ In kleinere Aufgaben teilen', '✂️ 小さなタスクに分ける', '✂️ 拆成更小的任务', '✂️ 작은 작업으로 나누기'],
    'Delete': ['Eliminar', 'Excluir', 'Supprimer', 'Löschen', '削除', '删除', '삭제'],
    'Task': ['Tarea', 'Tarefa', 'Tâche', 'Aufgabe', 'タスク', '任务', '작업'],
    'Title': ['Título', 'Título', 'Titre', 'Titel', 'タイトル', '标题', '제목'],
    'Status': ['Estado', 'Status', 'Statut', 'Status', 'ステータス', '状态', '상태'],
    'Who does it?': ['¿Quién lo hace?', 'Quem faz?', 'Qui s’en charge ?', 'Wer macht es?', '誰がやる？', '谁来做？', '누가 하나요?'],
    'Type': ['Tipo', 'Tipo', 'Type', 'Art', '種類', '类型', '유형'],
    'Task type': ['Tipo de tarea', 'Tipo de tarefa', 'Type de tâche', 'Aufgabenart', 'タスクの種類', '任务类型', '작업 유형'],
    'Due date': ['Fecha límite', 'Prazo', 'Date d’échéance', 'Fälligkeitsdatum', '期限日', '截止日期', '마감일'],
    'Labels': ['Etiquetas', 'Etiquetas', 'Étiquettes', 'Labels', 'ラベル', '标签', '라벨'],
    'Add a label': ['Añadir etiqueta', 'Adicionar etiqueta', 'Ajouter une étiquette', 'Label hinzufügen', 'ラベルを追加', '添加标签', '라벨 추가'],
    'Notes': ['Notas', 'Notas', 'Notes', 'Notizen', 'メモ', '备注', '메모'],
    'Has notes': ['Tiene notas', 'Tem notas', 'A des notes', 'Hat Notizen', 'メモあり', '有备注', '메모 있음'],
    'Checklist': ['Lista de pasos', 'Checklist', 'Liste de contrôle', 'Checkliste', 'チェックリスト', '清单', '체크리스트'],
    'Activity': ['Actividad', 'Atividade', 'Activité', 'Aktivität', 'アクティビティ', '动态', '활동'],
    'Clear': ['Quitar', 'Limpar', 'Effacer', 'Entfernen', 'クリア', '清除', '지우기'],
    'What does done look like?': ['¿Cómo se ve terminado?', 'Como fica quando estiver pronto?', 'À quoi ressemble « fini » ?', 'Wie sieht fertig aus?', '完成したらどうなる？', '做完是什么样子？', '완료되면 어떤 모습인가요?'],
    'Add a step… press Enter': ['Añade un paso… pulsa Enter', 'Adicione um passo… tecle Enter', 'Ajoutez une étape… appuyez sur Entrée', 'Schritt hinzufügen… Enter drücken', '手順を追加… Enter で決定', '添加步骤… 按 Enter', '단계 추가… Enter 누르기'],
    'Task title, Enter to add': ['Título de la tarea, Enter para añadir', 'Título da tarefa, Enter para adicionar', 'Titre de la tâche, Entrée pour ajouter', 'Aufgabentitel, Enter zum Hinzufügen', 'タスク名、Enter で追加', '任务标题，按 Enter 添加', '작업 제목, Enter로 추가'],
    'Everything has someone on it.': ['Todo tiene responsable.', 'Tudo tem responsável.', 'Tout a quelqu’un dessus.', 'Alles hat jemanden.', 'すべて担当者がいます。', '每项都有人在做。', '모두 담당자가 있어요.'],
    'Nothing in progress. Press Start on a task.': ['Nada en curso. Pulsa Empezar en una tarea.', 'Nada em andamento. Toque em Começar numa tarefa.', 'Rien en cours. Appuyez sur Commencer sur une tâche.', 'Nichts in Arbeit. Drück bei einer Aufgabe auf Starten.', '作業中のものはありません。タスクの「開始」を押しましょう。', '没有进行中的任务。点一个任务的“开始”。', '진행 중인 작업이 없어요. 작업에서 시작을 누르세요.'],
    'Nothing waiting for review.': ['Nada esperando revisión.', 'Nada aguardando revisão.', 'Rien en attente de relecture.', 'Nichts wartet auf Review.', 'レビュー待ちはありません。', '没有等待审核的任务。', '검토 대기 중인 작업이 없어요.'],
    'Finished work lands here.': ['Aquí llega lo terminado.', 'O que fica pronto aparece aqui.', 'Le travail fini arrive ici.', 'Fertiges landet hier.', '完了した作業はここに。', '完成的工作会出现在这里。', '끝난 작업은 여기로 와요.'],
    'Nothing waiting.': ['Nada pendiente.', 'Nada esperando.', 'Rien en attente.', 'Nichts offen.', '待ちはありません。', '没有待办。', '대기 중인 작업 없음.'],
    'Nothing here right now.': ['Nada por aquí ahora.', 'Nada aqui agora.', 'Rien ici pour l’instant.', 'Gerade nichts hier.', '今は何もありません。', '这里暂时没有内容。', '지금은 아무것도 없어요.'],
    'No tasks yet. Write one small thing to build.': ['Aún no hay tareas. Escribe una cosa pequeña para construir.', 'Ainda não há tarefas. Escreva uma coisinha para construir.', 'Pas encore de tâches. Écrivez une petite chose à construire.', 'Noch keine Aufgaben. Schreib eine kleine Sache zum Bauen auf.', 'タスクはまだありません。作る小さなことを一つ書きましょう。', '还没有任务。写下一件要做的小事。', '아직 작업이 없어요. 만들 작은 일을 하나 적어 보세요.'],
    '🔥 Ask Flint to plan tasks': ['🔥 Pide a Flint que planee tareas', '🔥 Peça ao Flint para planejar tarefas', '🔥 Demander à Flint de planifier', '🔥 Flint Aufgaben planen lassen', '🔥 Flint にタスクを計画してもらう', '🔥 让 Flint 规划任务', '🔥 Flint에게 작업 계획 맡기기'],
    '🔥 Plan this week with Flint': ['🔥 Planea la semana con Flint', '🔥 Planeje a semana com o Flint', '🔥 Planifier la semaine avec Flint', '🔥 Woche mit Flint planen', '🔥 Flint と今週を計画', '🔥 和 Flint 规划本周', '🔥 Flint와 이번 주 계획하기'],
    'Build': ['Construir', 'Construir', 'Construire', 'Bauen', '作る', '构建', '만들기'],
    'Fix': ['Arreglar', 'Corrigir', 'Corriger', 'Beheben', '修正', '修复', '고치기'],
    'Design': ['Diseño', 'Design', 'Design', 'Design', 'デザイン', '设计', '디자인'],
    'Write': ['Escribir', 'Escrever', 'Écrire', 'Schreiben', '書く', '写作', '쓰기'],
    'Research': ['Investigar', 'Pesquisar', 'Rechercher', 'Recherche', '調べる', '调研', '조사'],
    'from chat': ['del chat', 'do chat', 'du chat', 'aus dem Chat', 'チャットから', '来自聊天', '채팅에서'],
    'Take it': ['Tomarla', 'Pegar', 'La prendre', 'Übernehmen', '引き受ける', '我来做', '맡기'],
    'Give to my AI': ['Dársela a mi IA', 'Dar para minha IA', 'Confier à mon IA', 'Meiner KI geben', '自分の AI に任せる', '交给我的 AI', '내 AI에게 맡기기'],
    // inbox
    'Inbox': ['Bandeja', 'Caixa de entrada', 'Boîte de réception', 'Posteingang', '受信箱', '收件箱', '받은편지함'],
    'All': ['Todo', 'Tudo', 'Tout', 'Alle', 'すべて', '全部', '전체'],
    'Needs you': ['Te necesita', 'Precisa de você', 'Pour vous', 'Braucht dich', 'あなた宛て', '需要你', '확인 필요'],
    'Mentions': ['Menciones', 'Menções', 'Mentions', 'Erwähnungen', 'メンション', '提及', '멘션'],
    'Mark all read': ['Marcar todo como leído', 'Marcar tudo como lido', 'Tout marquer comme lu', 'Alle als gelesen markieren', 'すべて既読にする', '全部标为已读', '모두 읽음으로 표시'],
    // settings
    'Profile': ['Perfil', 'Perfil', 'Profil', 'Profil', 'プロフィール', '个人资料', '프로필'],
    'Edit profile': ['Editar perfil', 'Editar perfil', 'Modifier le profil', 'Profil bearbeiten', 'プロフィールを編集', '编辑资料', '프로필 편집'],
    'Name': ['Nombre', 'Nome', 'Nom', 'Name', '名前', '名字', '이름'],
    'Color': ['Color', 'Cor', 'Couleur', 'Farbe', '色', '颜色', '색상'],
    'Theme': ['Tema', 'Tema', 'Thème', 'Design', 'テーマ', '主题', '테마'],
    'Look': ['Aspecto', 'Aparência', 'Apparence', 'Aussehen', '見た目', '外观', '모양'],
    'Folder': ['Carpeta', 'Pasta', 'Dossier', 'Ordner', 'フォルダー', '文件夹', '폴더'],
    'Language': ['Idioma', 'Idioma', 'Langue', 'Sprache', '言語', '语言', '언어'],
    'Storage & sync': ['Almacenamiento y sincronización', 'Armazenamento e sincronização', 'Stockage et synchro', 'Speicher & Sync', '保存と同期', '存储与同步', '저장 및 동기화'],
    'More settings': ['Más ajustes', 'Mais configurações', 'Plus de paramètres', 'Weitere Einstellungen', 'その他の設定', '更多设置', '추가 설정'],
    'Save a copy': ['Guardar una copia', 'Salvar uma cópia', 'Enregistrer une copie', 'Kopie speichern', 'コピーを保存', '保存副本', '사본 저장'],
    'Download backup': ['Descargar copia de seguridad', 'Baixar backup', 'Télécharger la sauvegarde', 'Backup herunterladen', 'バックアップをダウンロード', '下载备份', '백업 다운로드'],
    'Customize…': ['Personalizar…', 'Personalizar…', 'Personnaliser…', 'Anpassen…', 'カスタマイズ…', '自定义…', '사용자 지정…'],
    'Take a quick tour': ['Haz un recorrido rápido', 'Faça um tour rápido', 'Faire une visite rapide', 'Kurze Tour', 'クイックツアー', '快速导览', '빠른 둘러보기'],
    'Join another tribe with a link': ['Unirse a otra tribu con un enlace', 'Entrar em outra tribo com um link', 'Rejoindre une autre tribu avec un lien', 'Mit Link einem anderen Tribe beitreten', 'リンクで別のトライブに参加', '用链接加入另一个部落', '링크로 다른 트라이브 참여'],
    // preview + code
    'What should it be?': ['¿Qué debería ser?', 'O que deve ser?', 'Qu’est-ce que ce sera ?', 'Was soll es werden?', '何を作りますか？', '要做成什么？', '무엇을 만들까요?'],
    'Build it': ['Constrúyelo', 'Construir', 'Construire', 'Bauen', '作る', '开始构建', '만들기'],
    'Sync now': ['Sincronizar ahora', 'Sincronizar agora', 'Synchroniser', 'Jetzt synchronisieren', '今すぐ同期', '立即同步', '지금 동기화'],
    'Autopilot': ['Piloto automático', 'Piloto automático', 'Pilote automatique', 'Autopilot', 'オートパイロット', '自动驾驶', '자동 조종'],
    // dashboard + right panel
    'Write the vision': ['Escribe la visión', 'Escreva a visão', 'Écrire la vision', 'Vision schreiben', 'ビジョンを書く', '写下愿景', '비전 작성'],
    'Add a first task': ['Añade una primera tarea', 'Adicione uma primeira tarefa', 'Ajouter une première tâche', 'Erste Aufgabe hinzufügen', '最初のタスクを追加', '添加第一个任务', '첫 작업 추가'],
    'Connect your AI': ['Conecta tu IA', 'Conecte sua IA', 'Connecter votre IA', 'Deine KI verbinden', 'AI を接続', '连接你的 AI', 'AI 연결'],
    'Connect GitHub': ['Conectar GitHub', 'Conectar GitHub', 'Connecter GitHub', 'GitHub verbinden', 'GitHub を接続', '连接 GitHub', 'GitHub 연결'],
    'Connect': ['Conectar', 'Conectar', 'Connecter', 'Verbinden', '接続', '连接', '연결'],
    'Create': ['Crear', 'Criar', 'Créer', 'Erstellen', '作成', '创建', '만들기'],
    'Steps': ['Pasos', 'Passos', 'Étapes', 'Schritte', 'ステップ', '步骤', '단계'],
    // focused first run (firstrun.js)
    'What do you want to make with your friends?': ['¿Qué quieres crear con tus amigos?', 'O que você quer criar com seus amigos?', 'Que voulez-vous créer avec vos amis ?', 'Was willst du mit deinen Freunden bauen?', '友だちと何を作りたい？', '想和朋友一起做什么？', '친구들과 무엇을 만들고 싶나요?'],
    'Your tribe is ready': ['Tu tribu está lista', 'Sua tribo está pronta', 'Votre tribu est prête', 'Dein Tribe ist bereit', 'トライブの準備ができました', '你的部落已就绪', '트라이브가 준비됐어요'],
    'Describe it in a sentence': ['Descríbelo en una frase', 'Descreva em uma frase', 'Décrivez-le en une phrase', 'Beschreib es in einem Satz', '一文で説明してください', '用一句话描述', '한 문장으로 설명해 주세요'],
    'Make it': ['Crearlo', 'Criar', 'Le créer', 'Bauen', '作る', '开始做', '만들기'],
    'Show everything': ['Mostrar todo', 'Mostrar tudo', 'Tout afficher', 'Alles zeigen', 'すべて表示', '显示全部', '모두 보기'],
    'A pixel platformer': ['Un plataformas de píxeles', 'Um jogo de plataforma em pixels', 'Un jeu de plateforme en pixels', 'Ein Pixel-Jump-’n’-Run', 'ピクセルのアクションゲーム', '像素平台游戏', '픽셀 플랫포머'],
    'A party quiz': ['Un quiz para fiestas', 'Um quiz para festas', 'Un quiz de soirée', 'Ein Party-Quiz', 'パーティークイズ', '派对问答', '파티 퀴즈'],
    'A multiplayer drawing game': ['Un juego de dibujo multijugador', 'Um jogo de desenho multiplayer', 'Un jeu de dessin multijoueur', 'Ein Mehrspieler-Malspiel', 'みんなで遊ぶお絵かきゲーム', '多人绘画游戏', '멀티플레이 그림 게임'],
    'An order tracker': ['Un seguimiento de pedidos', 'Um controle de pedidos', 'Un suivi des commandes', 'Ein Bestell-Tracker', '注文トラッカー', '订单追踪器', '주문 관리 도구'],
    'A booking page': ['Una página de reservas', 'Uma página de agendamento', 'Une page de réservation', 'Eine Buchungsseite', '予約ページ', '预约页面', '예약 페이지'],
    'A Discord bot': ['Un bot de Discord', 'Um bot de Discord', 'Un bot Discord', 'Ein Discord-Bot', 'Discord ボット', 'Discord 机器人', 'Discord 봇'],
    'Creating your project': ['Creando tu proyecto', 'Criando seu projeto', 'Création de votre projet', 'Projekt wird erstellt', 'プロジェクトを作成中', '正在创建项目', '프로젝트 만드는 중'],
    'Writing the idea down': ['Anotando la idea', 'Anotando a ideia', 'On note l’idée', 'Idee wird notiert', 'アイデアを書き留め中', '正在记下想法', '아이디어 기록 중'],
    'Making a first version': ['Haciendo una primera versión', 'Fazendo uma primeira versão', 'Création d’une première version', 'Erste Version wird gebaut', '最初のバージョンを作成中', '正在做第一版', '첫 버전 만드는 중'],
    'Opening the preview': ['Abriendo la vista previa', 'Abrindo a prévia', 'Ouverture de l’aperçu', 'Vorschau wird geöffnet', 'プレビューを開いています', '正在打开预览', '미리보기 여는 중'],
    'Invite a friend': ['Invita a un amigo', 'Convide um amigo', 'Invitez un ami', 'Lade einen Freund ein', '友だちを招待', '邀请一位朋友', '친구 초대하기'],
    'Connect your own AI': ['Conecta tu propia IA', 'Conecte sua própria IA', 'Connectez votre propre IA', 'Verbinde deine eigene KI', '自分の AI をつなぐ', '连接你自己的 AI', '내 AI 연결하기'],
    'Publish your play link': ['Publica tu enlace para jugar', 'Publique seu link para jogar', 'Publiez votre lien de jeu', 'Veröffentliche deinen Spiel-Link', 'プレイ用リンクを公開', '发布可玩的链接', '플레이 링크 공개하기'],
    'Later': ['Más tarde', 'Depois', 'Plus tard', 'Später', 'あとで', '稍后', '나중에'],
    'Show QR code': ['Mostrar código QR', 'Mostrar QR code', 'Afficher le QR code', 'QR-Code zeigen', 'QR コードを表示', '显示二维码', 'QR 코드 보기'],
    'Say hi': ['Saluda', 'Diga oi', 'Dites bonjour', 'Sag hallo', 'あいさつする', '打个招呼', '인사하기'],
    'Keep it simple': ['Mantenerlo simple', 'Manter simples', 'Rester simple', 'Einfach halten', 'シンプルなままにする', '保持简洁', '간단하게 유지'],
    'Your first thing is running': ['Tu primera creación ya funciona', 'Sua primeira criação já está rodando', 'Votre première création tourne', 'Dein erstes Projekt läuft', '最初の作品が動いています', '你的第一个作品已经运行', '첫 작품이 실행 중이에요'],
    'Getting started': ['Primeros pasos', 'Primeiros passos', 'Pour commencer', 'Erste Schritte', 'はじめに', '入门', '시작하기'],
    'Your focus': ['Tu foco', 'Seu foco', 'Votre focus', 'Dein Fokus', 'あなたのフォーカス', '你的重点', '내 집중'],
    'Background helpers': ['Ayudantes en segundo plano', 'Ajudantes em segundo plano', 'Assistants en arrière-plan', 'Hintergrund-Helfer', 'バックグラウンドのヘルパー', '后台助手', '백그라운드 도우미'],
    'Start a note': ['Empieza una nota', 'Comece uma nota', 'Commencer une note', 'Notiz beginnen', 'メモを始める', '开始记笔记', '메모 시작'],
    'Ask Flint…': ['Pregunta a Flint…', 'Pergunte ao Flint…', 'Demander à Flint…', 'Flint fragen…', 'Flint に聞く…', '问 Flint…', 'Flint에게 묻기…'],
    'Copy prompt for my AI': ['Copiar prompt para mi IA', 'Copiar prompt para minha IA', 'Copier le prompt pour mon IA', 'Prompt für meine KI kopieren', 'AI 用プロンプトをコピー', '复制给我的 AI 的提示', '내 AI용 프롬프트 복사'],
    'Share progress': ['Compartir progreso', 'Compartilhar progresso', 'Partager les progrès', 'Fortschritt teilen', '進捗を共有', '分享进度', '진행 상황 공유'],
    'Claim': ['Reclamar', 'Reivindicar', 'Réserver', 'Beanspruchen', '担当する', '认领', '맡기'],
    'Hosting': ['Alojando', 'Hospedando', 'Hébergement', 'Gehostet', 'ホスト中', '托管中', '호스팅 중'],
    'Search or jump to…': ['Busca o salta a…', 'Buscar ou ir para…', 'Rechercher ou aller à…', 'Suchen oder springen zu…', '検索または移動…', '搜索或跳转到…', '검색 또는 이동…'],
    'Recent changes': ['Cambios recientes', 'Mudanças recentes', 'Changements récents', 'Letzte Änderungen', '最近の変更', '最近更改', '최근 변경'],
    'Your tribe link': ['El enlace de tu tribu', 'O link da sua tribo', 'Le lien de votre tribu', 'Dein Tribe-Link', 'トライブのリンク', '你的部落链接', '트라이브 링크'],
    'Copy': ['Copiar', 'Copiar', 'Copier', 'Kopieren', 'コピー', '复制', '복사'],
    'Rename': ['Renombrar', 'Renomear', 'Renommer', 'Umbenennen', '名前を変更', '重命名', '이름 바꾸기'],
    'New link': ['Nuevo enlace', 'Novo link', 'Nouveau lien', 'Neuer Link', '新しいリンク', '新链接', '새 링크'],
    'Turn off': ['Desactivar', 'Desativar', 'Désactiver', 'Ausschalten', 'オフにする', '关闭', '끄기'],
    'Turn on': ['Activar', 'Ativar', 'Activer', 'Einschalten', 'オンにする', '开启', '켜기'],
    'Or make a one-time invite': ['O crea una invitación de un solo uso', 'Ou crie um convite de uso único', 'Ou créer une invitation unique', 'Oder eine Einmal-Einladung erstellen', 'または 1 回限りの招待を作成', '或创建一次性邀请', '또는 일회용 초대 만들기'],
    // v0.27: Flint beside the preview (previewflint.js)
    'Describe a change…': ['Describe un cambio…', 'Descreva uma mudança…', 'Décrivez un changement…', 'Beschreibe eine Änderung…', '変更を説明…', '描述一个改动…', '변경 사항을 설명하세요…'],
    'Describe a change': ['Describe un cambio', 'Descreva uma mudança', 'Décrivez un changement', 'Beschreibe eine Änderung', '変更を説明', '描述一个改动', '변경 사항 설명'],
    'builds with you, live': ['construye contigo, en vivo', 'constrói com você, ao vivo', 'construit avec vous, en direct', 'baut mit dir, live', '一緒にライブで作ります', '和你一起实时构建', '함께 실시간으로 만들어요'],
    'Hide Flint': ['Ocultar Flint', 'Ocultar Flint', 'Masquer Flint', 'Flint ausblenden', 'Flint を隠す', '隐藏 Flint', 'Flint 숨기기'],
    'Show or hide Flint': ['Mostrar u ocultar Flint', 'Mostrar ou ocultar Flint', 'Afficher ou masquer Flint', 'Flint ein- oder ausblenden', 'Flint の表示切替', '显示或隐藏 Flint', 'Flint 표시/숨기기'],
    'Resize Flint': ['Cambiar tamaño de Flint', 'Redimensionar Flint', 'Redimensionner Flint', 'Flint-Größe ändern', 'Flint のサイズ変更', '调整 Flint 大小', 'Flint 크기 조절'],
    'Fix it': ['Arréglalo', 'Corrigir', 'Corriger', 'Beheben', '直す', '修复', '고치기'],
    'Make the title bigger': ['Agranda el título', 'Aumente o título', 'Agrandis le titre', 'Titel größer machen', 'タイトルを大きく', '把标题放大', '제목 크게'],
    'Make it dark': ['Hazlo oscuro', 'Deixe escuro', 'Passe en sombre', 'Dunkel machen', 'ダークにする', '改成深色', '어둡게 만들기'],
    'Mobile layout': ['Diseño móvil', 'Layout para celular', 'Mise en page mobile', 'Mobil-Layout', 'モバイルレイアウト', '移动端布局', '모바일 레이아웃'],
    'Add a contact form': ['Añade un formulario de contacto', 'Adicione um formulário de contato', 'Ajoute un formulaire de contact', 'Kontaktformular hinzufügen', 'お問い合わせフォームを追加', '添加联系表单', '문의 양식 추가'],
    'Add a score': ['Añade una puntuación', 'Adicione um placar', 'Ajoute un score', 'Punktestand hinzufügen', 'スコアを追加', '加上分数', '점수 추가'],
    'Make it harder': ['Hazlo más difícil', 'Deixe mais difícil', 'Rends-le plus dur', 'Schwerer machen', 'もっと難しく', '提高难度', '더 어렵게'],
    'Add a jump sound': ['Añade un sonido de salto', 'Adicione um som de pulo', 'Ajoute un son de saut', 'Sprung-Sound hinzufügen', 'ジャンプ音を追加', '加个跳跃音效', '점프 소리 추가'],
    // common
    'Cancel': ['Cancelar', 'Cancelar', 'Annuler', 'Abbrechen', 'キャンセル', '取消', '취소'],
    'Save': ['Guardar', 'Salvar', 'Enregistrer', 'Speichern', '保存', '保存', '저장'],
    'Close': ['Cerrar', 'Fechar', 'Fermer', 'Schließen', '閉じる', '关闭', '닫기'],
    'Send': ['Enviar', 'Enviar', 'Envoyer', 'Senden', '送信', '发送', '보내기'],
    'Approve': ['Aprobar', 'Aprovar', 'Approuver', 'Genehmigen', '承認', '批准', '승인'],
    'Deny': ['Rechazar', 'Negar', 'Refuser', 'Ablehnen', '却下', '拒绝', '거절'],
    'Open': ['Abrir', 'Abrir', 'Ouvrir', 'Öffnen', '開く', '打开', '열기'],
    'Message the tribe…': ['Escribe a la tribu…', 'Mensagem para a tribo…', 'Écrire à la tribu…', 'Nachricht an den Tribe…', 'トライブにメッセージ…', '给部落发消息…', '트라이브에 메시지…'],
    'Search files': ['Buscar archivos', 'Buscar arquivos', 'Rechercher des fichiers', 'Dateien suchen', 'ファイルを検索', '搜索文件', '파일 검색'],
    'Type a command, doc, task or person…': ['Escribe un comando, doc, tarea o persona…', 'Digite um comando, doc, tarefa ou pessoa…', 'Tapez une commande, un doc, une tâche ou une personne…', 'Befehl, Dok, Aufgabe oder Person eingeben…', 'コマンド、ドキュメント、タスク、人を入力…', '输入命令、文档、任务或人…', '명령, 문서, 작업 또는 사람 입력…'],
    'In the room': ['En la sala', 'Na sala', 'Dans la salle', 'Im Raum', 'ルームにいる人', '在房间里', '방에 있는 사람'],
    // v0.27 publish + jams (app/ui/publish.js, app/ui/jam.js)
    'Publish': ['Publicar', 'Publicar', 'Publier', 'Veröffentlichen', '公開', '发布', '게시'],
    'Publish to a play link': ['Publicar con un enlace para jugar', 'Publicar com um link para jogar', 'Publier avec un lien de jeu', 'Als Spiel-Link veröffentlichen', 'プレイ用リンクで公開', '发布为可玩链接', '플레이 링크로 게시'],
    'Share it': ['Compártelo', 'Compartilhe', 'Partagez-le', 'Teil es', '共有する', '分享', '공유하기'],
    'Update the link': ['Actualizar el enlace', 'Atualizar o link', 'Mettre à jour le lien', 'Link aktualisieren', 'リンクを更新', '更新链接', '링크 업데이트'],
    'Publish anyway': ['Publicar de todos modos', 'Publicar mesmo assim', 'Publier quand même', 'Trotzdem veröffentlichen', 'このまま公開', '仍然发布', '그래도 게시'],
    'Unpublish': ['Despublicar', 'Despublicar', 'Dépublier', 'Zurückziehen', '公開を取り消す', '取消发布', '게시 취소'],
    'Fix it': ['Arréglalo', 'Corrigir', 'Corriger', 'Beheben', '直す', '修复', '고치기'],
    'Remix it': ['Remezclar', 'Remixar', 'Remixer', 'Remixen', 'リミックスする', '翻作', '리믹스하기'],
    'Not now': ['Ahora no', 'Agora não', 'Pas maintenant', 'Nicht jetzt', '今はしない', '以后再说', '나중에'],
    'Jam board': ['Tablero de la jam', 'Quadro da jam', 'Tableau de la jam', 'Jam-Board', 'ジャムボード', '创作赛看板', '잼 보드'],
    'Start a jam': ['Empezar una jam', 'Começar uma jam', 'Lancer une jam', 'Jam starten', 'ジャムを始める', '开始创作赛', '잼 시작'],
    'Start the jam': ['Empezar la jam', 'Começar a jam', 'Lancer la jam', 'Jam starten', 'ジャムを始める', '开始创作赛', '잼 시작하기'],
    'Submit this project': ['Enviar este proyecto', 'Enviar este projeto', 'Soumettre ce projet', 'Dieses Projekt einreichen', 'このプロジェクトを提出', '提交这个项目', '이 프로젝트 제출'],
    'Vote': ['Votar', 'Votar', 'Voter', 'Abstimmen', '投票', '投票', '투표'],
    'Play': ['Jugar', 'Jogar', 'Jouer', 'Spielen', 'プレイ', '玩', '플레이'],
    'See results': ['Ver resultados', 'Ver resultados', 'Voir les résultats', 'Ergebnisse', '結果を見る', '查看结果', '결과 보기'],
  };
  // Storage card keys (storage.js asks t('st.*', English)): translated by the same English text.
  const KEY = 'tribecode.lang';
  const supported = c => LANGS.some(([k]) => k === c);
  function detect() { const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase(); return supported(n) ? n : 'en'; }
  let cur = 'en'; try { cur = localStorage.getItem(KEY) || detect(); } catch { cur = detect(); }
  if (!supported(cur)) cur = 'en';
  const tr = en => { if (cur === 'en') return null; const row = D[en]; return row ? row[IDX[cur]] : null; };
  const t = (key, fallback) => tr(fallback) || fallback;
  // reverse lookup so re-rendered nodes in another language can find their English again
  const REV = new Map(); Object.entries(D).forEach(([en, row]) => row.forEach(x => REV.set(x, en)));
  const orig = new WeakMap();   // text node -> English
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP = 'script,style,textarea,code,pre,.msg-body,.msg .body,.md,.doc-body,.rt,.pvw-frame,.tk-title,.card .title,[contenteditable],[data-title],.pj-name,.pc-name,#chat-list,.dm-body,.nf-item .nf-t';
  function swapText(n) {
    const raw = n.nodeValue; if (!raw) return;
    const pe = n.parentElement; if (!pe || pe.closest(SKIP)) return; const s = raw.trim(); if (!s || s.length > 60) return;
    // v0.27 fix: only English keys (or a node we translated before) count; inferring English from a translation turned
    // the word "Design" into "Theme" (it's German for Theme) on English screens
    const en = orig.get(n) || (D[s] ? s : null); if (!en) return;
    orig.set(n, en);
    const want = tr(en) || en; if (s !== want) n.nodeValue = raw.replace(s, want);
  }
  function swapAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const key = 'data-en-' + a; let en = el.getAttribute(key);
      if (!en || (v !== en && v !== tr(en))) { en = D[v] ? v : null; if (!en) continue; el.setAttribute(key, en); }
      const want = tr(en) || en; if (v !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (!root || (root.nodeType === 1 && root.closest && root.closest(SKIP))) return;
    if (root.nodeType === 3) return swapText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) swapAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: x => (x.nodeType === 1 && x.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let x; while ((x = w.nextNode())) { if (x.nodeType === 3) swapText(x); else swapAttrs(x); }
  }
  let mo = null, busy = false;
  function observe() {
    if (mo) mo.disconnect();
    mo = new MutationObserver(list => {
      if (busy) return; busy = true;
      try { for (const m of list) { if (m.type === 'characterData') swapText(m.target); else m.addedNodes.forEach(walk); } } finally { busy = false; }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function apply() { document.documentElement.lang = cur; busy = true; try { walk(document.body); } finally { busy = false; } }
  function set(code) {
    if (!supported(code)) return; cur = code; try { localStorage.setItem(KEY, code); } catch {}
    apply(); window.dispatchEvent(new CustomEvent('tribe-lang', { detail: { lang: cur } }));
  }
  function start() { apply(); observe(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.TribeI18n = { lang: () => cur, set, t, LANGS, apply };
})();
