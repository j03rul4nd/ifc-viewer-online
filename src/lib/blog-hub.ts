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
  heroDescription: 'Search practical answers, follow a guided path, or open a real browser demo. Written for BIM coordinators who need a decision or a fix — not another glossary.',
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
}

const ES: BlogHubCopy = {
  eyebrow: 'Centro de conocimiento BIM e IFC',
  heroLead: 'Resuelve el problema IFC',
  heroAccent: 'que bloquea tu entrega',
  heroDescription: 'Busca respuestas prácticas, sigue un recorrido guiado o abre una demo real en el navegador. Pensado para coordinadores BIM que necesitan una decisión o una solución.',
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
}

export function getBlogHubCopy(lang: string): BlogHubCopy {
  return lang === 'es' ? ES : EN
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
  const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token))
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
