// ─── Blog topics ─────────────────────────────────────────────────────────────
// A topic is a category that has earned its own page: /blog/topic/<slug>/.
//
// Why pages and not only a filter: a filter exists only in JavaScript, so a
// search engine sees one undifferentiated list and no page that is ABOUT
// "IFC validation". A topic hub is that page — an intro, the guide to start
// with, every article in the topic, and the tools that solve its problems —
// and every article links up to it from its breadcrumb.
//
// A category only becomes a hub with MIN_TOPIC_POSTS articles in that
// language: a hub with one article is a thin page that competes with the
// article itself.

import type { BlogPost } from './blog-posts'
import { linkedSlugs } from './blog-related'

export const MIN_TOPIC_POSTS = 3

export interface TopicCopy {
  /** Page title (H1) — what someone searching the topic would type. */
  title: string
  /** One or two sentences: what the topic covers and who it helps. */
  intro: string
}

/** Written per language; a category without copy here never becomes a hub. */
const TOPIC_COPY: Record<string, Record<string, TopicCopy>> = {
  en: {
    validation: {
      title: 'IFC validation and model checking',
      intro: 'How to check an IFC model before it is delivered — schema, quality rules, IDS and the Health Score — and how to read what the checks report.',
    },
    'export-fixes': {
      title: 'Fixing broken IFC exports',
      intro: 'The export problems that get models rejected — changing or duplicate GUIDs, missing properties, wrong coordinates, oversized files — traced to their cause in Revit and other tools.',
    },
    tools: {
      title: 'IFC tools, viewers and formats compared',
      intro: 'Which viewer, checker or editor fits the job, which file format and IFC version to deliver, and how to open or read IFC without desktop software.',
    },
    delivery: {
      title: 'IFC delivery and ISO 19650',
      intro: 'Turning model quality into an agreed routine: ISO 19650 checks, BEP clauses, acceptance criteria and what to hand over with a model.',
    },
    privacy: {
      title: 'Privacy and security for BIM models',
      intro: 'What happens to a model when a tool processes it: NDA projects, GDPR, IT-security questions for vendors, and browser versus cloud processing.',
    },
    'digital-twins': {
      title: 'IFC digital twins: point clouds, LiDAR, video and maps',
      intro: 'Combining IFC with point clouds, temporal LiDAR, construction video and 3D maps in the browser — each guide with a working demo you can open.',
    },
  },
  es: {
    validation: {
      title: 'Validación IFC y comprobación de modelos',
      intro: 'Cómo comprobar un modelo IFC antes de entregarlo —esquema, reglas de calidad, IDS y Health Score— y cómo leer lo que dicen los informes.',
    },
    'export-fixes': {
      title: 'Corregir exportaciones IFC defectuosas',
      intro: 'Los fallos de exportación que hacen rechazar un modelo —GUID que cambian o se duplican, propiedades perdidas, coordenadas erróneas, archivos enormes— hasta su causa en Revit y otras herramientas.',
    },
    tools: {
      title: 'Herramientas, visores y formatos IFC comparados',
      intro: 'Qué visor, verificador o editor encaja con cada trabajo, qué formato y versión de IFC entregar y cómo abrir o leer un IFC sin software de escritorio.',
    },
    delivery: {
      title: 'Entrega de IFC e ISO 19650',
      intro: 'Cómo convertir la calidad del modelo en una rutina pactada: comprobaciones ISO 19650, cláusulas del BEP, criterios de aceptación y qué entregar junto al modelo.',
    },
    privacy: {
      title: 'Privacidad y seguridad de los modelos BIM',
      intro: 'Qué le pasa a un modelo cuando una herramienta lo procesa: proyectos con NDA, RGPD, preguntas de seguridad para proveedores y procesamiento en navegador frente a la nube.',
    },
    'digital-twins': {
      title: 'Gemelos digitales IFC: nubes de puntos, LiDAR, vídeo y mapas',
      intro: 'Cómo combinar IFC con nubes de puntos, LiDAR temporal, vídeo de obra y mapas 3D en el navegador; cada guía incluye una demo que puedes abrir.',
    },
  },
  de: {
    validation: {
      title: 'IFC-Validierung und Modellprüfung',
      intro: 'Wie Sie ein IFC-Modell vor der Übergabe prüfen – Schema, Qualitätsregeln, IDS und Health Score – und wie Sie lesen, was die Prüfungen melden.',
    },
    'export-fixes': {
      title: 'Fehlerhafte IFC-Exporte beheben',
      intro: 'Die Exportprobleme, an denen Modelle scheitern – wechselnde oder doppelte GUIDs, fehlende Eigenschaften, falsche Koordinaten, zu große Dateien – bis zur Ursache in Revit und anderen Werkzeugen verfolgt.',
    },
    tools: {
      title: 'IFC-Werkzeuge, Viewer und Formate im Vergleich',
      intro: 'Welcher Viewer, Checker oder Editor zur Aufgabe passt, welches Format und welche IFC-Version Sie liefern und wie Sie IFC ohne Desktop-Software öffnen oder auslesen.',
    },
    delivery: {
      title: 'IFC-Übergabe und ISO 19650',
      intro: 'Modellqualität als vereinbarte Routine: Prüfungen nach ISO 19650, BAP-Klauseln, Abnahmekriterien und was zusammen mit dem Modell übergeben wird.',
    },
    privacy: {
      title: 'Datenschutz und Sicherheit bei BIM-Modellen',
      intro: 'Was mit einem Modell passiert, wenn ein Werkzeug es verarbeitet: NDA-Projekte, DSGVO, IT-Sicherheitsfragen an Anbieter und Verarbeitung im Browser statt in der Cloud.',
    },
    'digital-twins': {
      title: 'Digitale IFC-Zwillinge: Punktwolken, LiDAR, Video und Karten',
      intro: 'IFC im Browser mit Punktwolken, zeitlichem LiDAR, Baustellenvideo und 3D-Karten kombinieren – jeder Leitfaden mit einer funktionierenden Demo.',
    },
  },
  fr: {
    validation: {
      title: 'Validation IFC et vérification de maquettes',
      intro: 'Comment contrôler une maquette IFC avant sa livraison — schéma, règles qualité, IDS et Health Score — et comment lire ce que signalent les contrôles.',
    },
    'export-fixes': {
      title: 'Corriger les exports IFC défaillants',
      intro: 'Les problèmes d’export qui font refuser une maquette — GUID qui changent ou se dupliquent, propriétés manquantes, coordonnées fausses, fichiers trop lourds — remontés jusqu’à leur cause dans Revit et les autres outils.',
    },
    tools: {
      title: 'Outils, visionneuses et formats IFC comparés',
      intro: 'Quelle visionneuse, quel outil de vérification ou quel éditeur choisir, quel format et quelle version IFC livrer, et comment ouvrir ou lire un IFC sans logiciel installé.',
    },
    delivery: {
      title: 'Livraison IFC et ISO 19650',
      intro: 'Faire de la qualité de la maquette une routine convenue : contrôles ISO 19650, clauses de la convention BIM, critères de réception et éléments à remettre avec la maquette.',
    },
    privacy: {
      title: 'Confidentialité et sécurité des maquettes BIM',
      intro: 'Ce que devient une maquette quand un outil la traite : projets sous NDA, RGPD, questions de sécurité à poser aux éditeurs, traitement dans le navigateur ou dans le cloud.',
    },
    'digital-twins': {
      title: 'Jumeaux numériques IFC : nuages de points, LiDAR, vidéo et cartes',
      intro: 'Associer l’IFC aux nuages de points, au LiDAR temporel, à la vidéo de chantier et aux cartes 3D dans le navigateur — chaque guide avec une démo à ouvrir.',
    },
  },
  pt: {
    validation: {
      title: 'Validação de IFC e verificação de modelos',
      intro: 'Como verificar um modelo IFC antes da entrega — schema, regras de qualidade, IDS e Health Score — e como interpretar o que as verificações apontam.',
    },
    'export-fixes': {
      title: 'Corrigir exportações IFC com defeito',
      intro: 'Os problemas de exportação que fazem um modelo ser rejeitado — GUIDs que mudam ou se repetem, propriedades faltando, coordenadas erradas, arquivos grandes demais — rastreados até a causa no Revit e em outras ferramentas.',
    },
    tools: {
      title: 'Ferramentas, visualizadores e formatos IFC comparados',
      intro: 'Qual visualizador, verificador ou editor serve para cada trabalho, qual formato e versão de IFC entregar e como abrir ou ler um IFC sem software de desktop.',
    },
    delivery: {
      title: 'Entrega de IFC e ISO 19650',
      intro: 'Como transformar a qualidade do modelo em uma rotina combinada: verificações da ISO 19650, cláusulas do BEP, critérios de aceitação e o que entregar junto com o modelo.',
    },
    privacy: {
      title: 'Privacidade e segurança de modelos BIM',
      intro: 'O que acontece com um modelo quando uma ferramenta o processa: projetos sob NDA, GDPR, perguntas de segurança para fornecedores e processamento no navegador versus na nuvem.',
    },
    'digital-twins': {
      title: 'Gêmeos digitais IFC: nuvens de pontos, LiDAR, vídeo e mapas',
      intro: 'Como combinar IFC com nuvens de pontos, LiDAR temporal, vídeo de obra e mapas 3D no navegador — cada guia com uma demo que você pode abrir.',
    },
  },
  it: {
    validation: {
      title: 'Validazione IFC e model checking',
      intro: 'Come verificare un modello IFC prima della consegna — schema, regole di qualità, IDS e Health Score — e come leggere ciò che segnalano i controlli.',
    },
    'export-fixes': {
      title: 'Correggere le esportazioni IFC difettose',
      intro: 'I problemi di esportazione che fanno respingere un modello — GUID che cambiano o si duplicano, proprietà mancanti, coordinate errate, file troppo pesanti — ricondotti alla causa in Revit e negli altri strumenti.',
    },
    tools: {
      title: 'Strumenti, visualizzatori e formati IFC a confronto',
      intro: 'Quale visualizzatore, checker o editor è adatto al lavoro, quale formato e versione IFC consegnare e come aprire o leggere un IFC senza software desktop.',
    },
    delivery: {
      title: 'Consegna IFC e ISO 19650',
      intro: 'Trasformare la qualità del modello in una routine concordata: verifiche ISO 19650, clausole del pGI, criteri di accettazione e cosa consegnare insieme al modello.',
    },
    privacy: {
      title: 'Privacy e sicurezza dei modelli BIM',
      intro: 'Cosa succede a un modello quando uno strumento lo elabora: progetti sotto NDA, GDPR, domande di sicurezza IT per i fornitori ed elaborazione nel browser rispetto al cloud.',
    },
    'digital-twins': {
      title: 'Gemelli digitali IFC: nuvole di punti, LiDAR, video e mappe',
      intro: 'Combinare IFC con nuvole di punti, LiDAR temporale, video di cantiere e mappe 3D nel browser: ogni guida ha una demo funzionante da aprire.',
    },
  },
  ca: {
    validation: {
      title: 'Validació IFC i verificació de models',
      intro: 'Com comprovar un model IFC abans de lliurar-lo —esquema, regles de qualitat, IDS i Health Score— i com llegir el que diuen les comprovacions.',
    },
    'export-fixes': {
      title: 'Corregir exportacions IFC defectuoses',
      intro: 'Els problemes d’exportació que fan rebutjar un model —GUID que canvien o es dupliquen, propietats perdudes, coordenades errònies, fitxers massa grans— fins a la causa a Revit i altres eines.',
    },
    tools: {
      title: 'Eines, visors i formats IFC comparats',
      intro: 'Quin visor, verificador o editor encaixa amb cada feina, quin format i quina versió d’IFC lliurar i com obrir o llegir un IFC sense programari d’escriptori.',
    },
    delivery: {
      title: 'Lliurament d’IFC i ISO 19650',
      intro: 'Com convertir la qualitat del model en una rutina pactada: comprovacions ISO 19650, clàusules del BEP, criteris d’acceptació i què cal lliurar amb el model.',
    },
    privacy: {
      title: 'Privadesa i seguretat dels models BIM',
      intro: 'Què li passa a un model quan una eina el processa: projectes amb NDA, RGPD, preguntes de seguretat per als proveïdors i processament al navegador enfront del núvol.',
    },
    'digital-twins': {
      title: 'Bessons digitals IFC: núvols de punts, LiDAR, vídeo i mapes',
      intro: 'Com combinar l’IFC amb núvols de punts, LiDAR temporal, vídeo d’obra i mapes 3D al navegador; cada guia inclou una demo que pots obrir.',
    },
  },
  zh: {
    validation: {
      title: 'IFC 验证与模型检查',
      intro: '如何在交付前检查 IFC 模型——模式、质量规则、IDS 和 Health Score——以及如何解读检查报告。',
    },
    'export-fixes': {
      title: '修复出错的 IFC 导出',
      intro: '导致模型被退回的导出问题：GUID 变化或重复、属性缺失、坐标错误、文件过大——在 Revit 等软件中追溯其根源。',
    },
    tools: {
      title: 'IFC 工具、查看器与格式对比',
      intro: '哪款查看器、检查工具或编辑器适合你的工作，应交付哪种文件格式和 IFC 版本，以及如何不借助桌面软件打开或读取 IFC。',
    },
    delivery: {
      title: 'IFC 交付与 ISO 19650',
      intro: '把模型质量变成约定好的例行流程：ISO 19650 检查、BEP 条款、验收标准，以及随模型一起移交的内容。',
    },
    privacy: {
      title: 'BIM 模型的隐私与安全',
      intro: '工具处理模型时会发生什么：保密项目、GDPR、面向供应商的 IT 安全问题，以及浏览器处理与云端处理的对比。',
    },
    'digital-twins': {
      title: 'IFC 数字孪生：点云、LiDAR、视频与地图',
      intro: '在浏览器中将 IFC 与点云、时序 LiDAR、施工视频和 3D 地图结合——每篇指南都附有可直接打开的演示。',
    },
  },
  ja: {
    validation: {
      title: 'IFCの検証とモデルチェック',
      intro: '納品前にIFCモデルをチェックする方法（スキーマ、品質ルール、IDS、Health Score）と、チェック結果の読み方。',
    },
    'export-fixes': {
      title: 'IFCエクスポートの不具合を直す',
      intro: 'モデルが差し戻される原因になるエクスポートの問題（GUIDの変化や重複、プロパティの欠落、座標の誤り、ファイルの肥大化）を、Revitなどのツール側の原因までたどります。',
    },
    tools: {
      title: 'IFCツール・ビューアー・形式の比較',
      intro: '作業に合うビューアー、チェッカー、エディターはどれか。どのファイル形式とIFCバージョンで納品すべきか。デスクトップソフトなしでIFCを開いて読む方法も解説します。',
    },
    delivery: {
      title: 'IFCの納品とISO 19650',
      intro: 'モデルの品質を合意済みの手順にする方法：ISO 19650のチェック、BEPの条項、受入基準、モデルと一緒に引き渡すもの。',
    },
    privacy: {
      title: 'BIMモデルのプライバシーとセキュリティ',
      intro: 'ツールがモデルを処理するとき何が起きるのか：NDA案件、GDPR、ベンダーへのITセキュリティ質問、ブラウザー処理とクラウド処理の違い。',
    },
    'digital-twins': {
      title: 'IFCデジタルツイン：点群・LiDAR・動画・地図',
      intro: 'ブラウザー上でIFCを点群、時系列LiDAR、工事動画、3D地図と組み合わせる方法。どのガイドにも実際に開けるデモがあります。',
    },
  },
  th: {
    validation: {
      title: 'การตรวจสอบความถูกต้องของไฟล์และโมเดล IFC',
      intro: 'วิธีตรวจสอบโมเดล IFC ก่อนส่งมอบ ทั้งสคีมา กฎคุณภาพ IDS และ Health Score รวมถึงวิธีอ่านผลการตรวจสอบ',
    },
    'export-fixes': {
      title: 'แก้ไขปัญหาการส่งออก IFC',
      intro: 'ปัญหาการส่งออกที่ทำให้โมเดลถูกตีกลับ ทั้ง GUID ที่เปลี่ยนหรือซ้ำ คุณสมบัติที่หายไป พิกัดผิด และไฟล์ใหญ่เกินไป พร้อมตามหาต้นเหตุใน Revit และเครื่องมืออื่น',
    },
    tools: {
      title: 'เปรียบเทียบเครื่องมือ โปรแกรมดู และรูปแบบไฟล์ IFC',
      intro: 'โปรแกรมดู เครื่องมือตรวจสอบ หรือโปรแกรมแก้ไขตัวไหนเหมาะกับงาน ควรส่งมอบรูปแบบไฟล์และเวอร์ชัน IFC ใด และวิธีเปิดหรืออ่าน IFC โดยไม่ต้องใช้ซอฟต์แวร์บนเดสก์ท็อป',
    },
    delivery: {
      title: 'การส่งมอบ IFC และ ISO 19650',
      intro: 'เปลี่ยนคุณภาพโมเดลให้เป็นขั้นตอนที่ตกลงร่วมกัน ทั้งการตรวจสอบตาม ISO 19650 ข้อกำหนดใน BEP เกณฑ์การตรวจรับ และสิ่งที่ต้องส่งมอบพร้อมโมเดล',
    },
    privacy: {
      title: 'ความเป็นส่วนตัวและความปลอดภัยของโมเดล BIM',
      intro: 'เกิดอะไรขึ้นกับโมเดลเมื่อเครื่องมือประมวลผล ทั้งโครงการที่มี NDA, GDPR, คำถามด้านความปลอดภัยไอทีสำหรับผู้ให้บริการ และการประมวลผลบนเบราว์เซอร์เทียบกับคลาวด์',
    },
    'digital-twins': {
      title: 'ดิจิทัลทวิน IFC: พอยต์คลาวด์ LiDAR วิดีโอ และแผนที่',
      intro: 'รวม IFC เข้ากับพอยต์คลาวด์ LiDAR ตามช่วงเวลา วิดีโอหน้างาน และแผนที่ 3D ในเบราว์เซอร์ ทุกคู่มือมีเดโมที่เปิดใช้งานได้จริง',
    },
  },
}

export interface Topic {
  slug: string
  /** Short label (the category name), for chips and breadcrumbs. */
  label: string
  copy: TopicCopy
  posts: BlogPost[]
}

export function topicsFor(posts: BlogPost[], lang: string): Topic[] {
  const copy = TOPIC_COPY[lang] ?? {}
  const bySlug = new Map<string, BlogPost[]>()
  for (const p of posts) {
    if ((p.lang ?? 'en') !== lang) continue
    bySlug.set(p.categorySlug, [...(bySlug.get(p.categorySlug) ?? []), p])
  }
  return [...bySlug.entries()]
    .filter(([slug, list]) => list.length >= MIN_TOPIC_POSTS && copy[slug])
    .map(([slug, list]) => ({ slug, label: list[0].category, copy: copy[slug], posts: list }))
    .sort((a, b) => b.posts.length - a.posts.length)
}

export function topicBySlug(posts: BlogPost[], lang: string, slug: string): Topic | undefined {
  return topicsFor(posts, lang).find((t) => t.slug === slug)
}

/**
 * How many other posts link to each post — the site's own evidence of which
 * articles are foundational. A post five others build on is where a newcomer
 * should start; that's a better signal than recency, and honest without
 * page-view data.
 */
export function inboundLinks(posts: BlogPost[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of posts) {
    for (const slug of linkedSlugs(p)) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  return counts
}

/** Most-linked posts first; ties go to the newer one. */
export function foundationalPosts(posts: BlogPost[], limit: number, pool: BlogPost[] = posts): BlogPost[] {
  const inbound = inboundLinks(pool)
  return [...posts]
    .sort((a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || b.date.localeCompare(a.date))
    .slice(0, limit)
}

// ── Freshness ───────────────────────────────────────────────────────────────

const DAY = 86_400_000
const NEW_DAYS = 30
/** An update counts only if it came well after publication. */
const UPDATE_GAP_DAYS = 14

export type Freshness = 'new' | 'updated' | null

export function freshness(post: BlogPost, today: Date): Freshness {
  const published = Date.parse(post.date)
  const modified = post.dateModified ? Date.parse(post.dateModified) : NaN
  if (today.getTime() - published <= NEW_DAYS * DAY) return 'new'
  if (Number.isFinite(modified) && modified - published >= UPDATE_GAP_DAYS * DAY && today.getTime() - modified <= 90 * DAY) return 'updated'
  return null
}

/** The date that matters to a returning reader: last update, else publication. */
export function lastTouched(post: BlogPost): string {
  return post.dateModified && post.dateModified > post.date ? post.dateModified : post.date
}

/** Newest activity first — new posts and meaningful updates together. */
export function whatsNew(posts: BlogPost[], limit: number): BlogPost[] {
  return [...posts].sort((a, b) => lastTouched(b).localeCompare(lastTouched(a))).slice(0, limit)
}
