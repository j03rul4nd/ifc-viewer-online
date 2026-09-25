// ─── Tools a reader can use from an article ─────────────────────────────────
// Articles explain a problem; most of them have a tool on this site that
// solves it. This is the catalogue of those tools — only pages that really
// exist — with the terms that say when one is relevant to a post.
//
// Used by the `tool` block (author picks one) and by the end-of-article
// recommendations (matched from the post's keywords, title and category).

import type { BlogPost } from './blog-posts'

export type ToolId = 'viewer' | 'validator' | 'guid-fixer' | 'fix-guides' | 'embed' | 'sdk' | 'handbook' | 'bim-handbook'

interface ToolCopy { name: string; action: string; blurb: string }

export interface BlogTool {
  id: ToolId
  icon: 'viewer' | 'check' | 'wrench' | 'code' | 'book' | 'share'
  /** Path per language; `en` is the fallback. */
  href: Partial<Record<string, string>> & { en: string }
  terms: string[]
  copy: Partial<Record<string, ToolCopy>> & { en: ToolCopy }
}

export const BLOG_TOOLS: BlogTool[] = [
  {
    id: 'validator', icon: 'check',
    href: { en: '/ifc-validator/', es: '/es/ifc-validador/', de: '/de/ifc-validator-online/', fr: '/fr/validateur-ifc-en-ligne/', zh: '/zh/ifc-validator-online/', ja: '/ja/ifc-validator-online/', th: '/th/ifc-validator-online/', pt: '/pt/validador-ifc-online/', it: '/it/validatore-ifc-online/', ca: '/ca/validador-ifc-en-linia/' },
    terms: ['validat', 'health score', 'quality', 'check', 'rule', 'deliver', 'acceptance', 'qa', 'validación', 'calidad', 'prüf', 'qualité'],
    copy: {
      en: { name: 'IFC Validator', action: 'Validate a model', blurb: '44 quality rules and a Health Score, in your browser — the file is never uploaded.' },
      es: { name: 'Validador IFC', action: 'Validar un modelo', blurb: '44 reglas de calidad y un Health Score en tu navegador; el archivo nunca se sube.' },
      de: { name: 'IFC-Validator', action: 'Modell prüfen', blurb: '44 Qualitätsregeln und ein Health Score im Browser — die Datei wird nie hochgeladen.' },
      fr: { name: 'Validateur IFC', action: 'Valider un modèle', blurb: '44 règles qualité et un Health Score dans le navigateur — le fichier n’est jamais envoyé.' },
      zh: { name: 'IFC 验证工具', action: '验证模型', blurb: '44 条质量规则和 Health Score，全部在浏览器中完成——文件从不上传。' },
      ja: { name: 'IFCバリデーター', action: 'モデルを検証する', blurb: '44の品質ルールとHealth Scoreをブラウザー上で。ファイルがアップロードされることはありません。' },
      th: { name: 'เครื่องมือตรวจสอบ IFC', action: 'ตรวจสอบโมเดล', blurb: 'กฎคุณภาพ 44 ข้อและ Health Score ในเบราว์เซอร์ของคุณ ไฟล์ไม่ถูกอัปโหลดเลย' },
      pt: { name: 'Validador IFC', action: 'Validar um modelo', blurb: '44 regras de qualidade e um Health Score no seu navegador — o arquivo nunca é enviado.' },
      it: { name: 'Validatore IFC', action: 'Valida un modello', blurb: '44 regole di qualità e un Health Score nel browser: il file non viene mai caricato.' },
      ca: { name: 'Validador IFC', action: 'Valida un model', blurb: '44 regles de qualitat i un Health Score al navegador; el fitxer no es puja mai.' },
    },
  },
  {
    id: 'guid-fixer', icon: 'wrench',
    href: { en: '/tools/fix-duplicate-guids/' },
    terms: ['guid', 'globalid', 'duplicate'],
    copy: {
      en: { name: 'Duplicate GUID fixer', action: 'Fix duplicate GUIDs', blurb: 'Find and repair duplicate GlobalIds that break BCF and model comparison.' },
      es: { name: 'Reparador de GUID duplicados', action: 'Reparar GUID duplicados', blurb: 'Encuentra y corrige GlobalIds duplicados que rompen BCF y la comparación de modelos.' },
      zh: { name: '重复 GUID 修复工具', action: '修复重复 GUID', blurb: '查找并修复会破坏 BCF 和模型比对的重复 GlobalId。' },
      ja: { name: '重複GUID修正ツール', action: '重複GUIDを修正する', blurb: 'BCFやモデル比較を壊す重複したGlobalIdを見つけて修復します。' },
      th: { name: 'เครื่องมือแก้ GUID ซ้ำ', action: 'แก้ไข GUID ซ้ำ', blurb: 'ค้นหาและซ่อม GlobalId ที่ซ้ำกันซึ่งทำให้ BCF และการเปรียบเทียบโมเดลใช้งานไม่ได้' },
      de: { name: 'GUID-Duplikat-Reparatur', action: 'Doppelte GUIDs beheben', blurb: 'Doppelte GlobalIds finden und reparieren, die BCF und Modellvergleiche stören.' },
      fr: { name: 'Correcteur de GUID en double', action: 'Corriger les GUID en double', blurb: 'Trouver et réparer les GlobalId en double qui cassent le BCF et la comparaison de maquettes.' },
      pt: { name: 'Corretor de GUIDs duplicados', action: 'Corrigir GUIDs duplicados', blurb: 'Encontre e corrija GlobalIds duplicados que quebram o BCF e a comparação de modelos.' },
      it: { name: 'Correttore di GUID duplicati', action: 'Correggi i GUID duplicati', blurb: 'Trova e ripara i GlobalId duplicati che rompono il BCF e il confronto tra modelli.' },
      ca: { name: 'Reparador de GUID duplicats', action: 'Repara els GUID duplicats', blurb: 'Troba i corregeix els GlobalId duplicats que trenquen el BCF i la comparació de models.' },
    },
  },
  {
    id: 'fix-guides', icon: 'wrench',
    href: { en: '/fix/', es: '/es/fix/', de: '/de/fix/', fr: '/fr/fix/', pt: '/pt/fix/', it: '/it/fix/', ca: '/ca/fix/', zh: '/zh/fix/', ja: '/ja/fix/', th: '/th/fix/' },
    terms: ['fix', 'error', 'repair', 'broken', 'export', 'revit', 'missing', 'coordinates', 'corregir', 'errores', 'fehler', 'erreur'],
    copy: {
      en: { name: 'Fix guides', action: 'Browse fixes', blurb: 'One page per validation rule: what it means, why it fails, how to fix it in your authoring tool.' },
      es: { name: 'Guías de corrección', action: 'Ver correcciones', blurb: 'Una página por regla: qué significa, por qué falla y cómo corregirlo en tu software.' },
      de: { name: 'Korrekturleitfäden', action: 'Lösungen ansehen', blurb: 'Eine Seite pro Regel: Bedeutung, Ursache und Korrektur im Autorenwerkzeug.' },
      fr: { name: 'Guides de correction', action: 'Voir les corrections', blurb: 'Une page par règle : signification, cause et correction dans votre logiciel.' },
      zh: { name: '修复指南', action: '浏览修复方法', blurb: '每条验证规则一页：含义、失败原因，以及如何在建模软件中修复。' },
      ja: { name: '修正ガイド', action: '修正方法を見る', blurb: '検証ルールごとに1ページ。意味、失敗する理由、オーサリングツールでの直し方を解説します。' },
      th: { name: 'คู่มือการแก้ไข', action: 'ดูวิธีแก้ไข', blurb: 'หนึ่งหน้าต่อหนึ่งกฎการตรวจสอบ: ความหมาย สาเหตุที่ไม่ผ่าน และวิธีแก้ในซอฟต์แวร์สร้างโมเดล' },
      pt: { name: 'Guias de correção', action: 'Ver correções', blurb: 'Uma página por regra: o que significa, por que falha e como corrigir no seu software.' },
      it: { name: 'Guide alla correzione', action: 'Vedi le correzioni', blurb: 'Una pagina per regola: cosa significa, perché fallisce e come correggerla nel tuo software.' },
      ca: { name: 'Guies de correcció', action: 'Veure correccions', blurb: 'Una pàgina per regla: què vol dir, per què falla i com corregir-ho al teu programari.' },
    },
  },
  {
    id: 'viewer', icon: 'viewer',
    href: { en: '/', es: '/es/', de: '/de/', fr: '/fr/', pt: '/pt/', it: '/it/', ca: '/ca/', zh: '/zh/', ja: '/ja/', th: '/th/' },
    terms: ['viewer', 'view', 'open', 'properties', 'point cloud', 'lidar', 'video', 'map', 'terrain', 'visor', 'nube de puntos'],
    copy: {
      en: { name: 'IFC Viewer', action: 'Open the viewer', blurb: 'Open IFC files in the browser: properties, sections, point clouds, map context.' },
      es: { name: 'Visor IFC', action: 'Abrir el visor', blurb: 'Abre IFC en el navegador: propiedades, secciones, nubes de puntos y mapa.' },
      de: { name: 'IFC-Viewer', action: 'Viewer öffnen', blurb: 'IFC im Browser öffnen: Eigenschaften, Schnitte, Punktwolken, Kartenkontext.' },
      fr: { name: 'Visionneuse IFC', action: 'Ouvrir la visionneuse', blurb: 'Ouvrez vos IFC dans le navigateur : propriétés, coupes, nuages de points, carte.' },
      zh: { name: 'IFC 查看器', action: '打开查看器', blurb: '在浏览器中打开 IFC 文件：属性、剖切、点云和地图环境。' },
      ja: { name: 'IFCビューアー', action: 'ビューアーを開く', blurb: 'ブラウザーでIFCファイルを開けます。プロパティ、断面、点群、地図表示に対応。' },
      th: { name: 'โปรแกรมดู IFC', action: 'เปิดโปรแกรมดู', blurb: 'เปิดไฟล์ IFC ในเบราว์เซอร์ ทั้งคุณสมบัติ ภาพตัด พอยต์คลาวด์ และบริบทแผนที่' },
      pt: { name: 'Visualizador IFC', action: 'Abrir o visualizador', blurb: 'Abra arquivos IFC no navegador: propriedades, cortes, nuvens de pontos e mapa.' },
      it: { name: 'Visualizzatore IFC', action: 'Apri il visualizzatore', blurb: 'Apri i file IFC nel browser: proprietà, sezioni, nuvole di punti e mappa.' },
      ca: { name: 'Visor IFC', action: 'Obre el visor', blurb: 'Obre IFC al navegador: propietats, seccions, núvols de punts i mapa.' },
    },
  },
  {
    id: 'embed', icon: 'share',
    href: { en: '/embed/' },
    terms: ['embed', 'share', 'present', 'client', 'website', 'iframe', 'compartir', 'presentación'],
    copy: {
      en: { name: 'Embed builder', action: 'Build an embed', blurb: 'Put a live, read-only IFC model on any page — for clients, tenders or docs.' },
      es: { name: 'Generador de embeds', action: 'Crear un embed', blurb: 'Pon un modelo IFC en vivo en cualquier página: clientes, licitaciones o documentación.' },
      zh: { name: '嵌入生成器', action: '创建嵌入代码', blurb: '在任意网页中放入可交互的只读 IFC 模型——用于客户沟通、投标或文档。' },
      ja: { name: '埋め込みビルダー', action: '埋め込みを作成', blurb: '操作できる読み取り専用のIFCモデルを任意のページに。顧客向け、入札、ドキュメントに。' },
      th: { name: 'เครื่องมือสร้างโค้ดฝัง', action: 'สร้างโค้ดฝัง', blurb: 'ใส่โมเดล IFC แบบอ่านอย่างเดียวที่โต้ตอบได้ลงในหน้าเว็บใดก็ได้ สำหรับลูกค้า งานประมูล หรือเอกสาร' },
      de: { name: 'Embed-Generator', action: 'Einbettung erstellen', blurb: 'Ein live, schreibgeschütztes IFC-Modell auf jeder Seite einbetten – für Kunden, Ausschreibungen oder Dokumentation.' },
      fr: { name: 'Générateur d’intégration', action: 'Créer une intégration', blurb: 'Intégrez une maquette IFC en direct, en lecture seule, sur n’importe quelle page : clients, appels d’offres, documentation.' },
      pt: { name: 'Gerador de embed', action: 'Criar um embed', blurb: 'Coloque um modelo IFC ao vivo, somente leitura, em qualquer página — para clientes, licitações ou documentação.' },
      it: { name: 'Generatore di embed', action: 'Crea un embed', blurb: 'Inserisci un modello IFC live in sola lettura in qualsiasi pagina: clienti, gare o documentazione.' },
      ca: { name: 'Generador d’embeds', action: 'Crea un embed', blurb: 'Posa un model IFC en directe, només de lectura, a qualsevol pàgina: clients, licitacions o documentació.' },
    },
  },
  {
    id: 'sdk', icon: 'code',
    href: { en: '/sdk/', es: '/sdk/es/', de: '/sdk/de/', fr: '/sdk/fr/', pt: '/sdk/pt/', it: '/sdk/it/', ca: '/sdk/ca/', zh: '/sdk/zh/', ja: '/sdk/ja/', th: '/sdk/th/' },
    terms: ['sdk', 'api', 'developer', 'javascript', 'integrat', 'cde', 'web-ifc', 'fragments', 'desarrollador'],
    copy: {
      en: { name: 'Viewer SDK', action: 'Read the SDK docs', blurb: 'Embed the viewer in your CDE or app and drive it with postMessage.' },
      es: { name: 'SDK del visor', action: 'Ver la documentación', blurb: 'Integra el visor en tu CDE o app y contrólalo con postMessage.' },
      zh: { name: '查看器 SDK', action: '阅读 SDK 文档', blurb: '将查看器嵌入你的 CDE 或应用，并通过 postMessage 控制。' },
      ja: { name: 'ビューアーSDK', action: 'SDKドキュメントを読む', blurb: 'ビューアーをCDEやアプリに組み込み、postMessageで制御できます。' },
      th: { name: 'SDK ของโปรแกรมดู', action: 'อ่านเอกสาร SDK', blurb: 'ฝังโปรแกรมดูใน CDE หรือแอปของคุณ และควบคุมผ่าน postMessage' },
      de: { name: 'Viewer-SDK', action: 'SDK-Dokumentation lesen', blurb: 'Den Viewer in Ihr CDE oder Ihre App einbetten und per postMessage steuern.' },
      fr: { name: 'SDK de la visionneuse', action: 'Lire la documentation', blurb: 'Intégrez la visionneuse à votre CDE ou votre application et pilotez-la par postMessage.' },
      pt: { name: 'SDK do visualizador', action: 'Ler a documentação', blurb: 'Integre o visualizador ao seu CDE ou app e controle-o com postMessage.' },
      it: { name: 'SDK del visualizzatore', action: 'Leggi la documentazione', blurb: 'Integra il visualizzatore nel tuo CDE o nella tua app e controllalo con postMessage.' },
      ca: { name: 'SDK del visor', action: 'Consulta la documentació', blurb: 'Integra el visor al teu CDE o aplicació i controla’l amb postMessage.' },
    },
  },
  {
    id: 'handbook', icon: 'book',
    href: { en: '/ebook/' },
    terms: ['delivery', 'iso 19650', 'bep', 'eir', 'acceptance', 'handover', 'transmittal', 'entrega'],
    copy: {
      en: { name: 'The IFC Delivery Handbook', action: 'Get the free PDF', blurb: 'How to check, prove and hand over IFC models that get accepted the first time.' },
      es: { name: 'The IFC Delivery Handbook', action: 'Descargar el PDF gratis', blurb: 'Cómo comprobar, demostrar y entregar modelos IFC que se aceptan a la primera (en inglés).' },
      zh: { name: 'The IFC Delivery Handbook', action: '免费下载 PDF', blurb: '如何检查、证明并移交一次就被接受的 IFC 模型（英文）。' },
      ja: { name: 'The IFC Delivery Handbook', action: '無料PDFをダウンロード', blurb: '一度で受け入れられるIFCモデルをチェックし、証明し、引き渡す方法（英語）。' },
      th: { name: 'The IFC Delivery Handbook', action: 'ดาวน์โหลด PDF ฟรี', blurb: 'วิธีตรวจสอบ พิสูจน์ และส่งมอบโมเดล IFC ให้ผ่านการตรวจรับตั้งแต่ครั้งแรก (ภาษาอังกฤษ)' },
      de: { name: 'The IFC Delivery Handbook', action: 'Kostenloses PDF laden', blurb: 'IFC-Modelle prüfen, belegen und so übergeben, dass sie beim ersten Mal abgenommen werden (auf Englisch).' },
      fr: { name: 'The IFC Delivery Handbook', action: 'Télécharger le PDF gratuit', blurb: 'Contrôler, prouver et remettre des maquettes IFC acceptées du premier coup (en anglais).' },
      pt: { name: 'The IFC Delivery Handbook', action: 'Baixar o PDF grátis', blurb: 'Como verificar, comprovar e entregar modelos IFC aceitos de primeira (em inglês).' },
      it: { name: 'The IFC Delivery Handbook', action: 'Scarica il PDF gratuito', blurb: 'Come verificare, dimostrare e consegnare modelli IFC accettati al primo colpo (in inglese).' },
      ca: { name: 'The IFC Delivery Handbook', action: 'Baixa el PDF gratuït', blurb: 'Com comprovar, demostrar i lliurar models IFC que s’accepten a la primera (en anglès).' },
    },
  },
  {
    id: 'bim-handbook', icon: 'book',
    href: { en: '/ebook/bim-information-management/' },
    terms: ['information management', 'cde', 'information requirements', 'aim', 'pim', 'gestión de la información'],
    copy: {
      en: { name: 'The BIM Information Handbook', action: 'Get the free PDF', blurb: 'Information requirements, CDE workflow and ISO 19650 roles, in practice.' },
      es: { name: 'The BIM Information Handbook', action: 'Descargar el PDF gratis', blurb: 'Requisitos de información, flujo CDE y roles ISO 19650 en la práctica (en inglés).' },
      zh: { name: 'The BIM Information Handbook', action: '免费下载 PDF', blurb: '信息需求、CDE 工作流程与 ISO 19650 角色的实践指南（英文）。' },
      ja: { name: 'The BIM Information Handbook', action: '無料PDFをダウンロード', blurb: '情報要件、CDEのワークフロー、ISO 19650の役割を実務の視点で（英語）。' },
      th: { name: 'The BIM Information Handbook', action: 'ดาวน์โหลด PDF ฟรี', blurb: 'ข้อกำหนดด้านข้อมูล ขั้นตอนการทำงานใน CDE และบทบาทตาม ISO 19650 ในทางปฏิบัติ (ภาษาอังกฤษ)' },
      de: { name: 'The BIM Information Handbook', action: 'Kostenloses PDF laden', blurb: 'Informationsanforderungen, CDE-Workflow und ISO-19650-Rollen in der Praxis (auf Englisch).' },
      fr: { name: 'The BIM Information Handbook', action: 'Télécharger le PDF gratuit', blurb: 'Exigences d’information, flux CDE et rôles ISO 19650 en pratique (en anglais).' },
      pt: { name: 'The BIM Information Handbook', action: 'Baixar o PDF grátis', blurb: 'Requisitos de informação, fluxo do CDE e papéis da ISO 19650 na prática (em inglês).' },
      it: { name: 'The BIM Information Handbook', action: 'Scarica il PDF gratuito', blurb: 'Requisiti informativi, flusso nel CDE e ruoli ISO 19650 nella pratica (in inglese).' },
      ca: { name: 'The BIM Information Handbook', action: 'Baixa el PDF gratuït', blurb: 'Requisits d’informació, flux del CDE i rols ISO 19650 a la pràctica (en anglès).' },
    },
  },
]

export function toolById(id: string): BlogTool | undefined {
  return BLOG_TOOLS.find((t) => t.id === id)
}

export function toolCopy(tool: BlogTool, lang: string): ToolCopy {
  return tool.copy[lang.slice(0, 2)] ?? tool.copy.en
}

export function toolHref(tool: BlogTool, lang: string): string {
  return tool.href[lang.slice(0, 2)] ?? tool.href.en
}

/** Tools whose terms appear in the post's keywords, title or category. */
export function toolsForPost(post: BlogPost, limit = 3): BlogTool[] {
  const hay = [post.title, post.category, ...(post.keywords ?? [])].join(' ').toLowerCase()
  return BLOG_TOOLS
    .map((t) => ({ t, hits: t.terms.filter((term) => hay.includes(term)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.t)
}
