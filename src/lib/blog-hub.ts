import type { BlogPost } from './blog-posts'

export type BlogSort = 'newest' | 'shortest' | 'title'

export interface BlogJourney {
  id: string
  title: string
  description: string
  cta: string
  terms: string[]
}

export interface BlogQuestionShortcut {
  label: string
  query?: string
  intent?: string
}

export interface BlogFaq {
  q: string
  a: string
}

export interface BlogHubCopy {
  eyebrow: string
  heroLead: string
  heroAccent: string
  heroDescription: string
  searchLabel: string
  searchPlaceholder: string
  searchHint: string
  guidesStat: string
  topicsStat: string
  demosStat: string
  journeysTitle: string
  journeysDescription: string
  questionsTitle: string
  questionsDescription: string
  questions: BlogQuestionShortcut[]
  journeys: BlogJourney[]
  labTitle: string
  labDescription: string
  labBadge: string
  labCta: string
  allGuidesTitle: string
  allGuidesDescription: string
  topicsLabel: string
  allTopics: string
  sortLabel: string
  newest: string
  shortest: string
  alphabetical: string
  oneResult: string
  manyResults: string
  clearFilters: string
  noResultsTitle: string
  noResultsBody: string
  faqTitle: string
  faqDescription: string
  faqs: BlogFaq[]
  viewerPrompt: string
  viewerCta: string
  // ── Landing sections (see docs/BLOG_LANDING.md) ──
  questionsLabel: string
  startHereTitle: string
  startHereDescription: string
  editorsPick: string
  foundationalLabel: string
  topicsTitle: string
  topicsDescription: string
  topicGuides: (n: number) => string
  exploreTopic: string
  whatsNewTitle: string
  whatsNewDescription: string
  newBadge: string
  updatedBadge: string
  readBadge: string
  demoBadge: string
  continueTitle: string
  continueDescription: string
  // ── Topic hub ──
  topicEyebrow: string
  startWith: string
  topicAllGuides: (n: number) => string
  topicTools: string
  otherTopics: string
  allArticles: string
  footerTopics: string
  footerTools: string
}

const JOURNEY_TERMS = {
  start: ['view-ifc-online-free', 'open ifc', 'view ifc', 'abrir ifc', 'ouvrir fichier ifc', 'ifc datei im browser'],
  validate: ['validation', 'validacion', 'validierung', 'health score', 'model checker', 'comprobar modelo', 'errores ifc'],
  repair: ['duplicate guid', 'export', 'properties missing', 'coordinates', 'reduce ifc', 'corregir', 'errores', 'georeferencing'],
  deliver: ['iso19650', 'execution plan', 'acceptance criteria', 'handover', 'delivery', 'entrega', 'bep clauses'],
  choose: [' vs ', 'compared', 'best free', 'solibri alternative', 'file format', 'que entregar', 'qué entregar'],
  spatial: ['digital twins', 'point cloud', 'nube de puntos', 'lidar', 'video 3d', 'video terrain', 'video terreno', '3d map', 'mapa 3d', 'ifc gis', 'georeferenced', 'georreferenciado'],
} as const

const EN: BlogHubCopy = {
  eyebrow: 'BIM & IFC knowledge hub',
  heroLead: 'Solve the IFC problem',
  heroAccent: 'blocking your delivery',
  heroDescription: 'Search practical answers, explore a topic, or open a real browser demo. Written for BIM coordinators who need a decision or a fix — not another glossary.',
  searchLabel: 'Search the IFC knowledge hub',
  searchPlaceholder: 'Search validation, Revit export, GUIDs, LiDAR…',
  searchHint: 'Press / to search',
  guidesStat: 'practical guides',
  topicsStat: 'specialist topics',
  demosStat: 'interactive 3D demos',
  journeysTitle: 'Start with the job you need to finish',
  journeysDescription: 'Each path narrows the library to the decisions, checks and fixes relevant to that outcome.',
  questionsTitle: 'Common questions, direct routes',
  questionsDescription: 'Use a real question as your starting point. You can refine the results afterwards.',
  questions: [
    { label: 'How do I open an IFC without installing software?', query: 'open IFC browser' },
    { label: 'Why is my IFC being rejected?', query: 'validation errors' },
    { label: 'Which IFC checker should I use?', query: 'model checker' },
    { label: 'How can I combine IFC with 3D maps, LiDAR or video?', intent: 'spatial' },
  ],
  journeys: [
    { id: 'start', title: 'Open and inspect an IFC', description: 'Get a model on screen, inspect properties and understand what the viewer can verify.', cta: 'Show opening guides', terms: [...JOURNEY_TERMS.start] },
    { id: 'validate', title: 'Validate before delivery', description: 'Run consistent checks, interpret the Health Score and define an acceptance gate.', cta: 'Show validation guides', terms: [...JOURNEY_TERMS.validate] },
    { id: 'repair', title: 'Fix a broken export', description: 'Trace GUID, property, coordinate, geometry and Revit export failures to their source.', cta: 'Show repair guides', terms: [...JOURNEY_TERMS.repair] },
    { id: 'deliver', title: 'Prepare a clean handover', description: 'Turn ISO 19650, BEP clauses and acceptance criteria into a repeatable delivery routine.', cta: 'Show delivery guides', terms: [...JOURNEY_TERMS.deliver] },
    { id: 'choose', title: 'Choose a tool or format', description: 'Compare viewers, model checkers, IFC schemas and the formats stakeholders actually need.', cta: 'Show comparisons', terms: [...JOURNEY_TERMS.choose] },
    { id: 'spatial', title: 'Build a spatial digital twin', description: 'Combine IFC with point clouds, temporal LiDAR and video inside a browser-based 3D scene.', cta: 'Show spatial guides', terms: [...JOURNEY_TERMS.spatial] },
  ],
  labTitle: 'Interactive 3D lab',
  labDescription: 'Open working IFC map, point-cloud, LiDAR replay and 3D video examples directly from their technical guides.',
  labBadge: 'REAL VIEWER DEMOS',
  labCta: 'Open demo guide',
  allGuidesTitle: 'All IFC guides',
  allGuidesDescription: 'Filter by topic, reading time or keyword. Newest articles appear first.',
  topicsLabel: 'Filter by topic',
  allTopics: 'All topics',
  sortLabel: 'Sort articles',
  newest: 'Newest first',
  shortest: 'Shortest first',
  alphabetical: 'A–Z',
  oneResult: 'guide found',
  manyResults: 'guides found',
  clearFilters: 'Clear filters',
  noResultsTitle: 'No guide matches those filters',
  noResultsBody: 'Try a shorter search, remove the topic filter, or start from one of the common questions above.',
  faqTitle: 'Questions about the IFC knowledge hub',
  faqDescription: 'What the guides cover, how examples are sourced, and where to start when the problem is still unclear.',
  faqs: [
    { q: 'Where should I start if I only need to open an IFC file?', a: 'Start with the browser-viewing guide. It explains how to open and inspect a model without installing desktop BIM software or uploading the file to a server.' },
    { q: 'Can these guides replace project-specific BIM requirements?', a: 'No. They provide practical technical workflows, but your BEP, EIR, IDS, exchange requirements and contractual acceptance criteria remain authoritative.' },
    { q: 'Are the IFC, point-cloud and video examples real?', a: 'The viewer captures and IFC workflows are produced in the application. The CRAS TLS alignment uses real scan and IFC data. The temporal LiDAR source is a clearly labelled simulated replay so it is never presented as a live sensor.' },
    { q: 'What is the difference between an IFC viewer and a model checker?', a: 'A viewer focuses on navigation and inspection. A model checker also evaluates explicit rules, reports failures and supports an acceptance decision. Several guides compare both workflows in detail.' },
    { q: 'How often is the content updated?', a: 'Articles carry publication dates and are updated when the viewer, standards or implementation evidence changes. The library defaults to newest-first so recent material is easy to find.' },
    { q: 'Do I need an account to try the examples?', a: 'No. Public demo models, spatial examples and the core IFC viewer can be opened in the browser without creating an account.' },
  ],
  viewerPrompt: 'Need the answer from your own model instead of an article?',
  viewerCta: 'Open IFC Viewer free',
  questionsLabel: 'Common questions',
  startHereTitle: 'Start here',
  startHereDescription: 'The editor’s pick, and the guides the rest of the library builds on.',
  editorsPick: 'Editor’s pick',
  foundationalLabel: 'Most referenced',
  topicsTitle: 'Explore by topic',
  topicsDescription: 'Each topic has its own page: where to start, every guide on it, and the tools that solve its problems.',
  topicGuides: (n) => `${n} guides`,
  exploreTopic: 'Explore topic',
  whatsNewTitle: 'New and updated',
  whatsNewDescription: 'The latest articles and the ones revised since they were published.',
  newBadge: 'New',
  updatedBadge: 'Updated',
  readBadge: 'Read',
  demoBadge: '3D demo',
  continueTitle: 'Picked for you',
  continueDescription: 'Based on the articles you have read in this browser.',
  topicEyebrow: 'Topic',
  startWith: 'Start with',
  topicAllGuides: (n) => `All ${n} guides on this topic`,
  topicTools: 'Tools for this topic',
  otherTopics: 'Other topics',
  allArticles: 'All articles',
  footerTopics: 'Topics',
  footerTools: 'Tools',
}

const ES: BlogHubCopy = {
  eyebrow: 'Centro de conocimiento BIM e IFC',
  heroLead: 'Resuelve el problema IFC',
  heroAccent: 'que bloquea tu entrega',
  heroDescription: 'Busca respuestas prácticas, explora un tema o abre una demo real en el navegador. Pensado para coordinadores BIM que necesitan una decisión o una solución.',
  searchLabel: 'Buscar en el centro de conocimiento IFC',
  searchPlaceholder: 'Busca validación, exportación Revit, GUID, LiDAR…',
  searchHint: 'Pulsa / para buscar',
  guidesStat: 'guías prácticas',
  topicsStat: 'temas especializados',
  demosStat: 'demos 3D interactivas',
  journeysTitle: 'Empieza por el trabajo que necesitas terminar',
  journeysDescription: 'Cada recorrido reduce la biblioteca a las decisiones, comprobaciones y correcciones relevantes para ese objetivo.',
  questionsTitle: 'Dudas habituales, rutas directas',
  questionsDescription: 'Empieza con una pregunta real y afina los resultados después.',
  questions: [
    { label: '¿Cómo abro un IFC sin instalar software?', query: 'abrir IFC navegador' },
    { label: '¿Por qué rechazan mi IFC?', query: 'errores validación' },
    { label: '¿Cómo compruebo un modelo antes de entregarlo?', intent: 'validate' },
    { label: '¿Cómo combino IFC con mapas 3D, LiDAR o vídeo?', intent: 'spatial' },
  ],
  journeys: [
    { id: 'start', title: 'Abrir e inspeccionar un IFC', description: 'Visualiza el modelo, consulta propiedades y entiende qué puede comprobar el visor.', cta: 'Ver guías de apertura', terms: [...JOURNEY_TERMS.start] },
    { id: 'validate', title: 'Validar antes de entregar', description: 'Aplica controles consistentes, interpreta el Health Score y define una puerta de aceptación.', cta: 'Ver guías de validación', terms: [...JOURNEY_TERMS.validate] },
    { id: 'repair', title: 'Corregir una exportación rota', description: 'Localiza fallos de GUID, propiedades, coordenadas, geometría y exportación desde Revit.', cta: 'Ver guías de corrección', terms: [...JOURNEY_TERMS.repair] },
    { id: 'deliver', title: 'Preparar una entrega limpia', description: 'Convierte ISO 19650, el BEP y los criterios de aceptación en una rutina repetible.', cta: 'Ver guías de entrega', terms: [...JOURNEY_TERMS.deliver] },
    { id: 'choose', title: 'Elegir herramienta o formato', description: 'Compara visores, model checkers, esquemas IFC y los formatos que necesita cada agente.', cta: 'Ver comparativas', terms: [...JOURNEY_TERMS.choose] },
    { id: 'spatial', title: 'Crear un gemelo digital espacial', description: 'Combina IFC, nubes de puntos, LiDAR temporal y vídeo dentro de una escena 3D web.', cta: 'Ver guías espaciales', terms: [...JOURNEY_TERMS.spatial] },
  ],
  labTitle: 'Laboratorio 3D interactivo',
  labDescription: 'Abre ejemplos funcionales de IFC sobre mapa, nube de puntos, replay LiDAR y vídeo 3D desde sus guías técnicas.',
  labBadge: 'DEMOS REALES DEL VISOR',
  labCta: 'Abrir guía con demo',
  allGuidesTitle: 'Todas las guías IFC',
  allGuidesDescription: 'Filtra por tema, tiempo de lectura o palabra clave. Los artículos nuevos aparecen primero.',
  topicsLabel: 'Filtrar por tema',
  allTopics: 'Todos los temas',
  sortLabel: 'Ordenar artículos',
  newest: 'Más recientes',
  shortest: 'Lectura más corta',
  alphabetical: 'A–Z',
  oneResult: 'guía encontrada',
  manyResults: 'guías encontradas',
  clearFilters: 'Limpiar filtros',
  noResultsTitle: 'Ninguna guía coincide con esos filtros',
  noResultsBody: 'Prueba una búsqueda más corta, elimina el filtro de tema o usa una de las dudas habituales.',
  faqTitle: 'Preguntas sobre el centro de conocimiento IFC',
  faqDescription: 'Qué cubren las guías, de dónde salen los ejemplos y por dónde empezar si el problema todavía no está claro.',
  faqs: [
    { q: '¿Por dónde empiezo si solo necesito abrir un IFC?', a: 'Empieza por la guía para abrir IFC en el navegador. Explica cómo visualizar e inspeccionar un modelo sin instalar software BIM de escritorio ni subir el archivo a un servidor.' },
    { q: '¿Estas guías sustituyen los requisitos BIM del proyecto?', a: 'No. Proporcionan flujos técnicos prácticos, pero el BEP, EIR, IDS, requisitos de intercambio y criterios contractuales de aceptación siguen siendo la referencia.' },
    { q: '¿Los ejemplos de IFC, nube de puntos y vídeo son reales?', a: 'Las capturas y los flujos IFC se producen en la aplicación. La alineación TLS de CRAS usa datos reales de escaneo e IFC. La fuente LiDAR temporal está identificada como replay simulado y nunca se presenta como un sensor en directo.' },
    { q: '¿Qué diferencia hay entre un visor IFC y un model checker?', a: 'Un visor se centra en navegar e inspeccionar. Un model checker también evalúa reglas explícitas, informa de fallos y ayuda a tomar una decisión de aceptación.' },
    { q: '¿Con qué frecuencia se actualiza el contenido?', a: 'Los artículos muestran su fecha y se actualizan cuando cambia el visor, los estándares o la evidencia técnica. La biblioteca se ordena por fecha de forma predeterminada.' },
    { q: '¿Necesito una cuenta para probar los ejemplos?', a: 'No. Los modelos públicos, las demos espaciales y el visor IFC principal se pueden abrir en el navegador sin crear una cuenta.' },
  ],
  viewerPrompt: '¿Necesitas la respuesta desde tu propio modelo y no desde un artículo?',
  viewerCta: 'Abrir IFC Viewer gratis',
  questionsLabel: 'Preguntas frecuentes',
  startHereTitle: 'Empieza por aquí',
  startHereDescription: 'La selección editorial y las guías sobre las que se apoya el resto de la biblioteca.',
  editorsPick: 'Selección editorial',
  foundationalLabel: 'Más referenciada',
  topicsTitle: 'Explora por tema',
  topicsDescription: 'Cada tema tiene su propia página: por dónde empezar, todas sus guías y las herramientas que resuelven sus problemas.',
  topicGuides: (n) => `${n} guías`,
  exploreTopic: 'Ver tema',
  whatsNewTitle: 'Novedades y actualizaciones',
  whatsNewDescription: 'Los artículos más recientes y los revisados desde su publicación.',
  newBadge: 'Nuevo',
  updatedBadge: 'Actualizado',
  readBadge: 'Leído',
  demoBadge: 'Demo 3D',
  continueTitle: 'Elegido para ti',
  continueDescription: 'Según los artículos que has leído en este navegador.',
  topicEyebrow: 'Tema',
  startWith: 'Empieza por',
  topicAllGuides: (n) => `Las ${n} guías de este tema`,
  topicTools: 'Herramientas para este tema',
  otherTopics: 'Otros temas',
  allArticles: 'Todos los artículos',
  footerTopics: 'Temas',
  footerTools: 'Herramientas',
}

const ZH: BlogHubCopy = {
  eyebrow: 'BIM 与 IFC 知识中心',
  heroLead: '解决卡住你交付的',
  heroAccent: 'IFC 问题',
  heroDescription: '搜索实用答案、按主题浏览，或直接在浏览器中打开真实演示。为需要做出决定或找到修复方法的 BIM 协调员而写，而不是又一份术语表。',
  searchLabel: '搜索 IFC 知识中心',
  searchPlaceholder: '搜索验证、Revit 导出、GUID、LiDAR…',
  searchHint: '按 / 搜索',
  guidesStat: '篇实用指南',
  topicsStat: '个专题',
  demosStat: '个交互式 3D 演示',
  journeysTitle: '从你要完成的工作开始',
  journeysDescription: '每条路径都会把文章库缩小到与该目标相关的决策、检查和修复。',
  questionsTitle: '常见问题，直达答案',
  questionsDescription: '从一个真实的问题开始，之后再细化结果。',
  questions: [
    { label: '不安装软件，怎么打开 IFC？', query: 'ifc 查看器' },
    { label: '为什么我的 IFC 被退回？', query: '验证' },
    { label: '该用哪个 IFC 模型检查工具？', query: '模型检查' },
    { label: '如何把 IFC 与 3D 地图、LiDAR 或视频结合？', intent: 'spatial' },
  ],
  journeys: [
    { id: 'start', title: '打开并检查 IFC', description: '把模型显示在屏幕上，查看属性，了解查看器能验证什么。', cta: '查看打开类指南', terms: [...JOURNEY_TERMS.start] },
    { id: 'validate', title: '交付前验证', description: '执行一致的检查，解读 Health Score，并设定验收关口。', cta: '查看验证类指南', terms: [...JOURNEY_TERMS.validate] },
    { id: 'repair', title: '修复出错的导出', description: '追溯 GUID、属性、坐标、几何和 Revit 导出问题的根源。', cta: '查看修复类指南', terms: [...JOURNEY_TERMS.repair] },
    { id: 'deliver', title: '准备干净的移交', description: '把 ISO 19650、BEP 条款和验收标准变成可重复的交付流程。', cta: '查看交付类指南', terms: [...JOURNEY_TERMS.deliver] },
    { id: 'choose', title: '选择工具或格式', description: '比较查看器、模型检查工具、IFC 版本，以及各方真正需要的格式。', cta: '查看对比文章', terms: [...JOURNEY_TERMS.choose] },
    { id: 'spatial', title: '构建空间数字孪生', description: '在浏览器 3D 场景中结合 IFC、点云、时序 LiDAR 和视频。', cta: '查看空间类指南', terms: [...JOURNEY_TERMS.spatial] },
  ],
  labTitle: '交互式 3D 实验室',
  labDescription: '直接从技术指南中打开可运行的示例：IFC 叠加地图、点云、LiDAR 回放和 3D 视频。',
  labBadge: '真实查看器演示',
  labCta: '打开演示指南',
  allGuidesTitle: '全部 IFC 指南',
  allGuidesDescription: '按主题、阅读时长或关键词筛选。最新文章排在最前。',
  topicsLabel: '按主题筛选',
  allTopics: '全部主题',
  sortLabel: '文章排序',
  newest: '最新优先',
  shortest: '篇幅最短优先',
  alphabetical: '按标题',
  oneResult: '篇指南',
  manyResults: '篇指南',
  clearFilters: '清除筛选',
  noResultsTitle: '没有符合条件的指南',
  noResultsBody: '试试更短的搜索词、移除主题筛选，或从上面的常见问题开始。',
  faqTitle: '关于 IFC 知识中心的问题',
  faqDescription: '指南涵盖哪些内容、示例从何而来，以及问题还不明确时从哪里入手。',
  faqs: [
    { q: '如果我只需要打开一个 IFC 文件，应该从哪里开始？', a: '从浏览器查看指南开始。它说明了如何在不安装桌面 BIM 软件、也不把文件上传到服务器的情况下打开并检查模型。' },
    { q: '这些指南能代替项目自身的 BIM 要求吗？', a: '不能。它们提供实用的技术流程，但项目的 BEP、EIR、IDS、信息交换要求和合同中的验收标准始终是最终依据。' },
    { q: 'IFC、点云和视频示例是真实的吗？', a: '查看器截图和 IFC 流程都是在应用中实际生成的。CRAS 的 TLS 对齐使用真实的扫描数据和 IFC 数据。时序 LiDAR 数据源明确标注为模拟回放，绝不会被当作实时传感器展示。' },
    { q: 'IFC 查看器和模型检查工具有什么区别？', a: '查看器侧重于浏览和检查。模型检查工具还会按明确的规则进行评估、报告不合格项，并为验收决策提供依据。有多篇指南详细比较了这两种工作流程。' },
    { q: '内容多久更新一次？', a: '每篇文章都标有发布日期，并会在查看器、标准或实施依据发生变化时更新。文章库默认按最新排序，便于找到最近的内容。' },
    { q: '试用这些示例需要注册账号吗？', a: '不需要。公开演示模型、空间示例和核心 IFC 查看器都可以直接在浏览器中打开，无需创建账号。' },
  ],
  viewerPrompt: '想直接从你自己的模型中得到答案，而不是读文章？',
  viewerCta: '免费打开 IFC Viewer',
  questionsLabel: '常见问题',
  startHereTitle: '从这里开始',
  startHereDescription: '编辑精选，以及文章库中其他指南所依托的基础文章。',
  editorsPick: '编辑精选',
  foundationalLabel: '被引用最多',
  topicsTitle: '按主题浏览',
  topicsDescription: '每个主题都有独立页面：从哪里开始、该主题的全部指南，以及解决相关问题的工具。',
  topicGuides: (n) => `${n} 篇指南`,
  exploreTopic: '浏览主题',
  whatsNewTitle: '最新与更新',
  whatsNewDescription: '最新发布的文章，以及发布后修订过的文章。',
  newBadge: '新',
  updatedBadge: '已更新',
  readBadge: '已读',
  demoBadge: '3D 演示',
  continueTitle: '为你推荐',
  continueDescription: '根据你在此浏览器中读过的文章。',
  topicEyebrow: '主题',
  startWith: '先读这篇',
  topicAllGuides: (n) => `本主题全部 ${n} 篇指南`,
  topicTools: '本主题相关工具',
  otherTopics: '其他主题',
  allArticles: '全部文章',
  footerTopics: '主题',
  footerTools: '工具',
}

const JA: BlogHubCopy = {
  eyebrow: 'BIM・IFCナレッジハブ',
  heroLead: '納品を止めている',
  heroAccent: 'IFCの問題を解決する',
  heroDescription: '実践的な答えを検索し、トピックから探し、ブラウザーで実際のデモを開けます。用語集ではなく、判断や解決策を必要とするBIMコーディネーターのためのガイドです。',
  searchLabel: 'IFCナレッジハブを検索',
  searchPlaceholder: '検証、Revitエクスポート、GUID、LiDARなど…',
  searchHint: '/ キーで検索',
  guidesStat: '本の実践ガイド',
  topicsStat: 'つの専門トピック',
  demosStat: '件の3Dデモ',
  journeysTitle: '終わらせたい作業から始める',
  journeysDescription: '各ルートは、その目的に関係する判断・チェック・修正だけにライブラリを絞り込みます。',
  questionsTitle: 'よくある疑問から直接探す',
  questionsDescription: '実際の疑問を出発点にして、あとから結果を絞り込めます。',
  questions: [
    { label: 'ソフトをインストールせずにIFCを開くには？', query: 'ビューアー' },
    { label: 'IFCが差し戻されるのはなぜ？', query: '検証' },
    { label: 'どのモデルチェッカーを使うべき？', query: 'モデルチェッカー' },
    { label: 'IFCを3D地図・LiDAR・動画と組み合わせるには？', intent: 'spatial' },
  ],
  journeys: [
    { id: 'start', title: 'IFCを開いて確認する', description: 'モデルを画面に表示し、プロパティを確認して、ビューアーで何を検証できるかを把握します。', cta: '閲覧ガイドを見る', terms: [...JOURNEY_TERMS.start] },
    { id: 'validate', title: '納品前に検証する', description: '一貫したチェックを行い、Health Scoreを読み解き、受け入れの関門を定義します。', cta: '検証ガイドを見る', terms: [...JOURNEY_TERMS.validate] },
    { id: 'repair', title: '壊れたエクスポートを直す', description: 'GUID、プロパティ、座標、形状、Revitエクスポートの不具合を原因までたどります。', cta: '修正ガイドを見る', terms: [...JOURNEY_TERMS.repair] },
    { id: 'deliver', title: 'クリーンな引き渡しを準備する', description: 'ISO 19650、BEPの条項、受入基準を、繰り返し使える納品手順にします。', cta: '納品ガイドを見る', terms: [...JOURNEY_TERMS.deliver] },
    { id: 'choose', title: 'ツールや形式を選ぶ', description: 'ビューアー、モデルチェッカー、IFCスキーマ、関係者が本当に必要とする形式を比較します。', cta: '比較記事を見る', terms: [...JOURNEY_TERMS.choose] },
    { id: 'spatial', title: '空間デジタルツインを構築する', description: 'ブラウザーの3DシーンでIFCと点群、時系列LiDAR、動画を組み合わせます。', cta: '空間ガイドを見る', terms: [...JOURNEY_TERMS.spatial] },
  ],
  labTitle: 'インタラクティブ3Dラボ',
  labDescription: 'IFCと地図、点群、LiDARリプレイ、3D動画の動作する例を、それぞれの技術ガイドから直接開けます。',
  labBadge: '実際のビューアーのデモ',
  labCta: 'デモ付きガイドを開く',
  allGuidesTitle: 'すべてのIFCガイド',
  allGuidesDescription: 'トピック、読了時間、キーワードで絞り込めます。新しい記事から順に表示します。',
  topicsLabel: 'トピックで絞り込む',
  allTopics: 'すべてのトピック',
  sortLabel: '記事の並び替え',
  newest: '新しい順',
  shortest: '短い順',
  alphabetical: 'タイトル順',
  oneResult: '件のガイド',
  manyResults: '件のガイド',
  clearFilters: '絞り込みを解除',
  noResultsTitle: '条件に合うガイドがありません',
  noResultsBody: '検索語を短くするか、トピックの絞り込みを外すか、上のよくある疑問から始めてください。',
  faqTitle: 'IFCナレッジハブについてのよくある質問',
  faqDescription: 'ガイドの対象範囲、例の出どころ、問題がまだはっきりしないときの始め方。',
  faqs: [
    { q: 'IFCファイルを開くだけなら、どこから始めればよいですか？', a: 'ブラウザーでの閲覧ガイドから始めてください。デスクトップのBIMソフトをインストールせず、ファイルをサーバーにアップロードすることもなく、モデルを開いて確認する方法を説明しています。' },
    { q: 'これらのガイドはプロジェクト固有のBIM要件の代わりになりますか？', a: 'なりません。実践的な技術ワークフローを紹介していますが、BEP、EIR、IDS、情報交換要件、契約上の受入基準が常に優先されます。' },
    { q: 'IFC・点群・動画の例は本物ですか？', a: 'ビューアーの画面キャプチャとIFCのワークフローは、実際にアプリケーションで作成したものです。CRASのTLS位置合わせには実際のスキャンデータとIFCデータを使用しています。時系列LiDARのデータソースはシミュレーションによるリプレイであることを明示しており、ライブセンサーとして提示することはありません。' },
    { q: 'IFCビューアーとモデルチェッカーの違いは何ですか？', a: 'ビューアーはナビゲーションと確認が中心です。モデルチェッカーは明示的なルールで評価し、不合格箇所を報告して、受け入れの判断を支援します。両方のワークフローを詳しく比較したガイドもあります。' },
    { q: 'コンテンツはどのくらいの頻度で更新されますか？', a: '各記事には公開日が記載されており、ビューアー、規格、実装上の根拠が変わったときに更新します。ライブラリは初期設定で新しい順に並ぶため、最近の内容をすぐに見つけられます。' },
    { q: '例を試すのにアカウントは必要ですか？', a: '必要ありません。公開デモモデル、空間データの例、IFCビューアー本体は、アカウントを作成せずにブラウザーで開けます。' },
  ],
  viewerPrompt: '記事ではなく、ご自身のモデルから答えを得たいですか？',
  viewerCta: 'IFC Viewerを無料で開く',
  questionsLabel: 'よくある疑問',
  startHereTitle: 'まずはここから',
  startHereDescription: '編集部のおすすめと、ライブラリの土台となるガイド。',
  editorsPick: '編集部のおすすめ',
  foundationalLabel: '最も参照されている',
  topicsTitle: 'トピックから探す',
  topicsDescription: '各トピックには専用ページがあります。どこから読むか、そのトピックのすべてのガイド、関連する問題を解決するツールをまとめています。',
  topicGuides: (n) => `${n}本のガイド`,
  exploreTopic: 'トピックを見る',
  whatsNewTitle: '新着・更新',
  whatsNewDescription: '最新の記事と、公開後に改訂された記事。',
  newBadge: '新着',
  updatedBadge: '更新',
  readBadge: '既読',
  demoBadge: '3Dデモ',
  continueTitle: 'あなたへのおすすめ',
  continueDescription: 'このブラウザーで読んだ記事にもとづいています。',
  topicEyebrow: 'トピック',
  startWith: 'まず読む',
  topicAllGuides: (n) => `このトピックの全${n}本のガイド`,
  topicTools: 'このトピックのツール',
  otherTopics: 'ほかのトピック',
  allArticles: 'すべての記事',
  footerTopics: 'トピック',
  footerTools: 'ツール',
}

const TH: BlogHubCopy = {
  eyebrow: 'ศูนย์ความรู้ BIM และ IFC',
  heroLead: 'แก้ปัญหา IFC',
  heroAccent: 'ที่ทำให้งานส่งมอบสะดุด',
  heroDescription: 'ค้นหาคำตอบที่ใช้ได้จริง สำรวจตามหัวข้อ หรือเปิดเดโมจริงในเบราว์เซอร์ เขียนขึ้นสำหรับผู้ประสานงาน BIM ที่ต้องการการตัดสินใจหรือวิธีแก้ไข ไม่ใช่อภิธานศัพท์อีกชุด',
  searchLabel: 'ค้นหาในศูนย์ความรู้ IFC',
  searchPlaceholder: 'ค้นหาการตรวจสอบ การส่งออกจาก Revit, GUID, LiDAR…',
  searchHint: 'กด / เพื่อค้นหา',
  guidesStat: 'คู่มือเชิงปฏิบัติ',
  topicsStat: 'หัวข้อเฉพาะทาง',
  demosStat: 'เดโม 3D แบบอินเทอร์แอกทีฟ',
  journeysTitle: 'เริ่มจากงานที่คุณต้องทำให้เสร็จ',
  journeysDescription: 'แต่ละเส้นทางจะคัดคลังบทความให้เหลือเฉพาะการตัดสินใจ การตรวจสอบ และการแก้ไขที่เกี่ยวกับเป้าหมายนั้น',
  questionsTitle: 'คำถามที่พบบ่อย ไปถึงคำตอบโดยตรง',
  questionsDescription: 'เริ่มจากคำถามจริงของคุณ แล้วค่อยกรองผลลัพธ์ภายหลัง',
  questions: [
    { label: 'เปิดไฟล์ IFC โดยไม่ต้องติดตั้งซอฟต์แวร์ได้อย่างไร', query: 'โปรแกรมดู' },
    { label: 'ทำไมไฟล์ IFC ถึงถูกตีกลับ', query: 'ตรวจสอบ' },
    { label: 'ควรใช้เครื่องมือตรวจสอบโมเดลตัวไหน', query: 'model checker' },
    { label: 'ใช้ IFC ร่วมกับแผนที่ 3D, LiDAR หรือวิดีโอได้อย่างไร', intent: 'spatial' },
  ],
  journeys: [
    { id: 'start', title: 'เปิดและตรวจดูไฟล์ IFC', description: 'แสดงโมเดลบนหน้าจอ ตรวจดูคุณสมบัติ และเข้าใจว่าโปรแกรมดูตรวจสอบอะไรได้บ้าง', cta: 'ดูคู่มือการเปิดไฟล์', terms: [...JOURNEY_TERMS.start] },
    { id: 'validate', title: 'ตรวจสอบก่อนส่งมอบ', description: 'ตรวจสอบอย่างสม่ำเสมอ อ่านค่า Health Score และกำหนดเกณฑ์ผ่านสำหรับการตรวจรับ', cta: 'ดูคู่มือการตรวจสอบ', terms: [...JOURNEY_TERMS.validate] },
    { id: 'repair', title: 'แก้ไขการส่งออกที่ผิดพลาด', description: 'ตามหาต้นเหตุของปัญหา GUID คุณสมบัติ พิกัด รูปทรง และการส่งออกจาก Revit', cta: 'ดูคู่มือการแก้ไข', terms: [...JOURNEY_TERMS.repair] },
    { id: 'deliver', title: 'เตรียมการส่งมอบที่เรียบร้อย', description: 'เปลี่ยน ISO 19650 ข้อกำหนดใน BEP และเกณฑ์การตรวจรับให้เป็นขั้นตอนการส่งมอบที่ทำซ้ำได้', cta: 'ดูคู่มือการส่งมอบ', terms: [...JOURNEY_TERMS.deliver] },
    { id: 'choose', title: 'เลือกเครื่องมือหรือรูปแบบไฟล์', description: 'เปรียบเทียบโปรแกรมดู เครื่องมือตรวจสอบโมเดล สคีมา IFC และรูปแบบไฟล์ที่ผู้เกี่ยวข้องต้องใช้จริง', cta: 'ดูบทความเปรียบเทียบ', terms: [...JOURNEY_TERMS.choose] },
    { id: 'spatial', title: 'สร้างดิจิทัลทวินเชิงพื้นที่', description: 'รวม IFC เข้ากับพอยต์คลาวด์ LiDAR ตามช่วงเวลา และวิดีโอในฉาก 3D บนเบราว์เซอร์', cta: 'ดูคู่มือเชิงพื้นที่', terms: [...JOURNEY_TERMS.spatial] },
  ],
  labTitle: 'ห้องทดลอง 3D แบบอินเทอร์แอกทีฟ',
  labDescription: 'เปิดตัวอย่างที่ใช้งานได้จริงของ IFC บนแผนที่ พอยต์คลาวด์ การเล่นซ้ำ LiDAR และวิดีโอ 3D ได้โดยตรงจากคู่มือทางเทคนิค',
  labBadge: 'เดโมจากโปรแกรมดูจริง',
  labCta: 'เปิดคู่มือพร้อมเดโม',
  allGuidesTitle: 'คู่มือ IFC ทั้งหมด',
  allGuidesDescription: 'กรองตามหัวข้อ เวลาในการอ่าน หรือคำสำคัญ บทความใหม่จะแสดงก่อน',
  topicsLabel: 'กรองตามหัวข้อ',
  allTopics: 'ทุกหัวข้อ',
  sortLabel: 'เรียงบทความ',
  newest: 'ใหม่ล่าสุดก่อน',
  shortest: 'สั้นที่สุดก่อน',
  alphabetical: 'ตามชื่อเรื่อง',
  oneResult: 'คู่มือ',
  manyResults: 'คู่มือ',
  clearFilters: 'ล้างตัวกรอง',
  noResultsTitle: 'ไม่มีคู่มือที่ตรงกับตัวกรองเหล่านี้',
  noResultsBody: 'ลองค้นหาด้วยคำที่สั้นลง ลบตัวกรองหัวข้อ หรือเริ่มจากคำถามที่พบบ่อยด้านบน',
  faqTitle: 'คำถามเกี่ยวกับศูนย์ความรู้ IFC',
  faqDescription: 'คู่มือครอบคลุมอะไรบ้าง ตัวอย่างมาจากไหน และควรเริ่มจากตรงไหนเมื่อปัญหายังไม่ชัดเจน',
  faqs: [
    { q: 'ถ้าต้องการแค่เปิดไฟล์ IFC ควรเริ่มจากตรงไหน', a: 'เริ่มจากคู่มือการดูไฟล์ในเบราว์เซอร์ ซึ่งอธิบายวิธีเปิดและตรวจดูโมเดลโดยไม่ต้องติดตั้งซอฟต์แวร์ BIM บนเดสก์ท็อป และไม่ต้องอัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์' },
    { q: 'คู่มือเหล่านี้ใช้แทนข้อกำหนด BIM ของโครงการได้หรือไม่', a: 'ไม่ได้ คู่มือเหล่านี้ให้ขั้นตอนทางเทคนิคที่นำไปใช้ได้จริง แต่ BEP, EIR, IDS, ข้อกำหนดการแลกเปลี่ยนข้อมูล และเกณฑ์การตรวจรับตามสัญญายังคงเป็นข้อกำหนดหลัก' },
    { q: 'ตัวอย่าง IFC พอยต์คลาวด์ และวิดีโอเป็นของจริงหรือไม่', a: 'ภาพหน้าจอจากโปรแกรมดูและขั้นตอนการทำงานกับ IFC สร้างขึ้นจากแอปพลิเคชันจริง การจัดแนว TLS ของ CRAS ใช้ข้อมูลสแกนและข้อมูล IFC จริง ส่วนแหล่งข้อมูล LiDAR ตามช่วงเวลาระบุไว้อย่างชัดเจนว่าเป็นการเล่นซ้ำแบบจำลอง จึงไม่เคยนำเสนอว่าเป็นเซ็นเซอร์แบบเรียลไทม์' },
    { q: 'โปรแกรมดู IFC กับเครื่องมือตรวจสอบโมเดลต่างกันอย่างไร', a: 'โปรแกรมดูเน้นการสำรวจและตรวจดูโมเดล ส่วนเครื่องมือตรวจสอบโมเดลจะประเมินตามกฎที่กำหนดไว้อย่างชัดเจน รายงานจุดที่ไม่ผ่าน และช่วยในการตัดสินใจตรวจรับ มีคู่มือหลายฉบับที่เปรียบเทียบทั้งสองแนวทางอย่างละเอียด' },
    { q: 'เนื้อหาอัปเดตบ่อยแค่ไหน', a: 'ทุกบทความระบุวันที่เผยแพร่ และจะได้รับการอัปเดตเมื่อโปรแกรมดู มาตรฐาน หรือหลักฐานจากการใช้งานจริงเปลี่ยนไป คลังบทความเรียงจากใหม่ไปเก่าเป็นค่าเริ่มต้น จึงหาเนื้อหาล่าสุดได้ง่าย' },
    { q: 'ต้องมีบัญชีเพื่อทดลองตัวอย่างหรือไม่', a: 'ไม่ต้อง โมเดลเดโมสาธารณะ ตัวอย่างเชิงพื้นที่ และโปรแกรมดู IFC หลักเปิดได้ในเบราว์เซอร์โดยไม่ต้องสร้างบัญชี' },
  ],
  viewerPrompt: 'ต้องการคำตอบจากโมเดลของคุณเองแทนการอ่านบทความใช่ไหม',
  viewerCta: 'เปิด IFC Viewer ฟรี',
  questionsLabel: 'คำถามที่พบบ่อย',
  startHereTitle: 'เริ่มต้นที่นี่',
  startHereDescription: 'บทความที่บรรณาธิการคัดเลือก และคู่มือพื้นฐานที่บทความอื่นในคลังต่อยอดจากมัน',
  editorsPick: 'บรรณาธิการแนะนำ',
  foundationalLabel: 'ถูกอ้างอิงมากที่สุด',
  topicsTitle: 'สำรวจตามหัวข้อ',
  topicsDescription: 'แต่ละหัวข้อมีหน้าของตัวเอง: ควรเริ่มจากตรงไหน คู่มือทั้งหมดในหัวข้อนั้น และเครื่องมือที่ช่วยแก้ปัญหา',
  topicGuides: (n) => `${n} คู่มือ`,
  exploreTopic: 'สำรวจหัวข้อ',
  whatsNewTitle: 'ใหม่และอัปเดต',
  whatsNewDescription: 'บทความล่าสุด และบทความที่ปรับปรุงหลังเผยแพร่',
  newBadge: 'ใหม่',
  updatedBadge: 'อัปเดต',
  readBadge: 'อ่านแล้ว',
  demoBadge: 'เดโม 3D',
  continueTitle: 'เลือกมาเพื่อคุณ',
  continueDescription: 'อ้างอิงจากบทความที่คุณอ่านในเบราว์เซอร์นี้',
  topicEyebrow: 'หัวข้อ',
  startWith: 'เริ่มจาก',
  topicAllGuides: (n) => `คู่มือทั้งหมด ${n} รายการในหัวข้อนี้`,
  topicTools: 'เครื่องมือสำหรับหัวข้อนี้',
  otherTopics: 'หัวข้ออื่น',
  allArticles: 'บทความทั้งหมด',
  footerTopics: 'หัวข้อ',
  footerTools: 'เครื่องมือ',
}

const HUB_COPY: Record<string, BlogHubCopy> = { en: EN, es: ES, zh: ZH, ja: JA, th: TH }

export function getBlogHubCopy(lang: string): BlogHubCopy {
  return HUB_COPY[lang] ?? EN
}

export function normaliseBlogSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'for', 'how', 'i', 'is', 'my', 'of', 'the', 'to', 'what', 'which', 'why', 'with',
  'como', 'cual', 'el', 'en', 'la', 'mi', 'para', 'por', 'puedo', 'que', 'un', 'una', 'y',
])

function searchablePost(post: BlogPost): string {
  return normaliseBlogSearch([
    post.slug,
    post.translationKey ?? '',
    post.title,
    post.excerpt,
    post.category,
    post.categorySlug,
    ...(post.keywords ?? []),
  ].join(' '))
}

export function blogPostMatchesQuery(post: BlogPost, query: string): boolean {
  const normalized = normaliseBlogSearch(query)
  if (!normalized) return true
  // Letters of any script, with their combining marks: Thai vowels and tone
  // marks are marks, and splitting on them would cut every Thai word apart.
  // Chinese, Japanese and Thai are written without spaces, so a query there is
  // usually one long token — matched as a substring, which is what a reader
  // typing 属性集 or ตรวจสอบ expects. A single Han character is a whole word.
  const tokens = normalized
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => (token.length > 1 || /\p{Script=Han}/u.test(token)) && !STOP_WORDS.has(token))
  if (tokens.length === 0) return true
  const haystack = searchablePost(post)
  return tokens.every((token) => haystack.includes(token))
}

export function blogPostMatchesJourney(post: BlogPost, journey?: BlogJourney): boolean {
  if (!journey) return true
  const haystack = searchablePost(post)
  return journey.terms.some((term) => haystack.includes(normaliseBlogSearch(term)))
}

export function sortBlogPosts(posts: BlogPost[], sort: BlogSort): BlogPost[] {
  return [...posts].sort((a, b) => {
    if (sort === 'shortest') return a.readTimeMin - b.readTimeMin || b.date.localeCompare(a.date)
    if (sort === 'title') return a.title.localeCompare(b.title)
    return b.date.localeCompare(a.date) || a.title.localeCompare(b.title)
  })
}

export function filterBlogPosts(
  posts: BlogPost[],
  options: { query?: string; category?: string; journey?: BlogJourney; sort?: BlogSort },
): BlogPost[] {
  const { query = '', category = 'all', journey, sort = 'newest' } = options
  return sortBlogPosts(posts.filter((post) => (
    (category === 'all' || post.categorySlug === category)
    && blogPostMatchesQuery(post, query)
    && blogPostMatchesJourney(post, journey)
  )), sort)
}
