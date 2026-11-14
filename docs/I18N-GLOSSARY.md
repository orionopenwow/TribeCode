# Language glossary

The words TribeCode uses the same way everywhere, in each language. New translations follow this table; when a row
in `app/ui/i18n.js` or `app/ui/i18n-more.js` disagrees with it, the table wins and the row gets fixed.

Tone: plain and friendly. The form of "you" follows what the existing table already does (counted across its rows
on 2026-11-14, so new rows match the old ones):

| Language | Form of address | In the table today |
|---|---|---|
| Spanish | tú | 112 rows with tú forms, 23 that read as usted |
| Portuguese | você | 69 rows |
| French | vous | 129 rows with vous/votre, 202 "-ez" imperatives; no real "tu" rows |
| German | du | 115 rows; the 6 "Sie" hits are "sie" (it/they) |
| Japanese | です/ます for sentences, plain nouns for buttons | 210 polite, 16 plain |
| Korean | 해요 (polite) | 197 rows; another 87 use the formal ‑니다 form. New rows use 해요; the 87 are a known inconsistency, not yet unified |

No jargon the English avoids: the English never says repo, ship, sync or host in main screens, so the translations
do not either.

Never translated: TribeCode, Flint, Claude, GitHub, Tailscale, Ollama, product names, file names, code, key names
(Ctrl, Esc), and what people wrote themselves (chat, task titles, document text, project names).

| English | Spanish | Portuguese | French | German | Japanese | Chinese | Korean |
|---|---|---|---|---|---|---|---|
| Tribe | Tribu | Tribo | Tribu | Tribe | トライブ | 部落 | 트라이브 |
| Project | Proyecto | Projeto | Projet | Projekt | プロジェクト | 项目 | 프로젝트 |
| Task | Tarea | Tarefa | Tâche | Aufgabe | タスク | 任务 | 작업 |
| Home | Inicio | Início | Accueil | Start | ホーム | 首页 | 홈 |
| Chat | Chat | Chat | Discussion | Chat | チャット | 聊天 | 채팅 |
| Files | Archivos | Arquivos | Fichiers | Dateien | ファイル | 文件 | 파일 |
| Docs | Docs | Docs | Docs | Doks | ドキュメント | 文档 | 문서 |
| Design | Diseño | Design | Design | Design | デザイン | 设计 | 디자인 |
| Website | Sitio web | Site | Site web | Website | ウェブサイト | 网站 | 웹사이트 |
| Preview | Vista previa | Prévia | Aperçu | Vorschau | プレビュー | 预览 | 미리보기 |
| Publish | Publicar | Publicar | Publier | Veröffentlichen | 公開 | 发布 | 게시 |
| Version | Versión | Versão | Version | Version | バージョン | 版本 | 버전 |
| Invite | Invitar | Convidar | Inviter | Einladen | 招待 | 邀请 | 초대 |
| Friend | Amigo | Amigo | Ami | Freund | 友だち | 朋友 | 친구 |
| Member | Miembro | Membro | Membre | Mitglied | メンバー | 成员 | 멤버 |
| Owner | Propietario | Proprietário | Propriétaire | Inhaber | オーナー | 所有者 | 소유자 |
| Role | Rol | Função | Rôle | Rolle | 役割 | 角色 | 역할 |
| Lead | Líder | Líder | Responsable | Leitung | リーダー | 负责人 | 리더 |
| Company | Empresa | Empresa | Entreprise | Firma | 会社 | 公司 | 회사 |
| Work | Trabajo | Trabalho | Travail | Arbeit | 仕事 | 工作 | 일 |
| Helper (an AI) | Ayudante | Ajudante | Assistant | Helfer | ヘルパー | 助手 | 도우미 |
| Agent | Agente | Agente | Agent | Agent | エージェント | 智能体 | 에이전트 |
| Call | Llamada | Chamada | Appel | Anruf | 通話 | 通话 | 통화 |
| Calendar | Calendario | Calendário | Calendrier | Kalender | カレンダー | 日历 | 캘린더 |
| Updates | Novedades | Novidades | Nouveautés | Neuigkeiten | 更新 | 动态 | 업데이트 |
| Settings | Ajustes | Configurações | Paramètres | Einstellungen | 設定 | 设置 | 설정 |
| Help | Ayuda | Ajuda | Aide | Hilfe | ヘルプ | 帮助 | 도움말 |
| Guide | Guía | Guia | Guide | Anleitung | ガイド | 指南 | 가이드 |
| Marketplace | Mercado | Mercado | Marché | Marktplatz | マーケット | 市场 | 마켓 |
| Template | Plantilla | Modelo | Modèle | Vorlage | テンプレート | 模板 | 템플릿 |
| Link | Enlace | Link | Lien | Link | リンク | 链接 | 링크 |
| Share | Compartir | Compartilhar | Partager | Teilen | 共有 | 共享 | 공유 |
| Review | Revisión | Revisão | Relecture | Review | レビュー | 审核 | 검토 |
| Save | Guardar | Salvar | Enregistrer | Speichern | 保存 | 保存 | 저장 |
| Cancel | Cancelar | Cancelar | Annuler | Abbrechen | キャンセル | 取消 | 취소 |
| Done | Hecho | Concluído | Terminé | Fertig | 完了 | 完成 | 완료 |
| Back | Atrás | Voltar | Retour | Zurück | 戻る | 返回 | 뒤로 |
| Next | Siguiente | Próximo | Suivant | Weiter | 次へ | 下一步 | 다음 |
| Close | Cerrar | Fechar | Fermer | Schließen | 閉じる | 关闭 | 닫기 |
| Language | Idioma | Idioma | Langue | Sprache | 言語 | 语言 | 언어 |

## A tribe's own words

A tribe can rename things for itself (Company to Club, Lead to Captain). That is not a translation and does not go
in the tables: call `TribeI18n.terms({ Company: 'Club', Lead: 'Captain' })` for English, or one map per language
(`{ en: {...}, es: {...} }`). The words are swapped in what is shown, after translation, on whole words only.
`TribeI18n.terms(null)` clears it.

## How to add a translation

- A fixed string: a row in `app/ui/i18n-more.js` under `rows` (English key, seven cells: es, pt, fr, de, ja, zh, ko).
- A sentence with a name or number in it: a row under `patterns`, with `{placeholders}`: `'Welcome to {name}'`. Code
  that builds the sentence can stay as it is; the page walker matches the English and re-fills it. New code should
  call `TribeI18n.t('Welcome to {name}', { name })`.
- A count: `TribeI18n.n(count, { one: '{n} task', other: '{n} tasks' })` and a row under `plurals` keyed by the
  "other" form. A cell is a string, or `{ one, few, many, other }` where the language needs it.
- Dates, times, numbers, lists: `TribeI18n.date(d)`, `.time(d)`, `.rel(d)`, `.num(x)`, `.list([a, b, c])`.
- A proper noun the audit flags: add it to `app/test/i18n_allow.json`.
- Then `node scripts/dev/i18n-audit.js --static` and `python3 app/test/e2e_i18n_audit.py`.
