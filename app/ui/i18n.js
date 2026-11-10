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
