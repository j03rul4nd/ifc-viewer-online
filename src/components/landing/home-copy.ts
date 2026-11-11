// ─── Home page: headline and the three ways in ────────────────────────────────
// The first screen says what the tool does and for whom (docs-planning/24 P2):
// the people who deliver models, the people who receive them (the plan that
// is charged, doc 17) and the people who build on IFC. Kept as data so a test
// can pin every language and every link.

import { pricingPath } from '../../lib/pricing/pricing-paths'

export const HOME_LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th'] as const
export type HomeLang = (typeof HOME_LANGS)[number]

export type PathId = 'deliver' | 'receive' | 'build'

interface HomeCopy {
  /** First line of the h1: the term people search for (GSC: «ifc viewer», 18k impressions). */
  kicker: string
  /** h1: the result, in plain words. */
  h1: string
  pathsTitle: string
  paths: Record<PathId, { who: string; title: string; body: string; cta: string }>
  moreFeatures: string
}

export const HOME_COPY: Record<HomeLang, HomeCopy> = {
  en: {
    kicker: 'Free IFC viewer online',
    h1: 'Check an IFC before you deliver it, or before you accept it',
    pathsTitle: 'Where do you sit in the delivery?',
    paths: {
      deliver: { who: 'You deliver models', title: 'Send it without rejections', body: 'Health Score, 44 rules, the client’s IDS and BCF issues — before the model leaves your office.', cta: 'Check a model' },
      receive: { who: 'You receive models', title: 'Know what you are accepting', body: 'Check what subcontractors and designers send against your requirements, and keep a report for the client.', cta: 'See model reception' },
      build: { who: 'You build on IFC', title: 'Put the viewer in your product', body: 'Embed it in your CDE, website or store: SDK, WordPress, Shopify and an MCP server.', cta: 'Read the SDK docs' },
    },
    moreFeatures: 'Also included',
  },
  es: {
    kicker: 'Visor IFC gratis online',
    h1: 'Comprueba un IFC antes de entregarlo, o antes de aceptarlo',
    pathsTitle: '¿En qué lado de la entrega estás?',
    paths: {
      deliver: { who: 'Entregas modelos', title: 'Entrega sin rechazos', body: 'Health Score, 44 reglas, el IDS del cliente e incidencias BCF, antes de que el modelo salga de tu oficina.', cta: 'Comprobar un modelo' },
      receive: { who: 'Recibes modelos', title: 'Sabe qué estás aceptando', body: 'Revisa lo que mandan subcontratas y proyectistas contra tus requisitos y guarda un informe para la propiedad.', cta: 'Ver recepción de modelos' },
      build: { who: 'Desarrollas sobre IFC', title: 'Mete el visor en tu producto', body: 'Intégralo en tu CDE, web o tienda: SDK, WordPress, Shopify y servidor MCP.', cta: 'Ver la documentación del SDK' },
    },
    moreFeatures: 'También incluye',
  },
  de: {
    kicker: 'IFC Viewer kostenlos online',
    h1: 'IFC-Modelle prüfen, bevor Sie sie abgeben – oder annehmen',
    pathsTitle: 'Auf welcher Seite der Übergabe stehen Sie?',
    paths: {
      deliver: { who: 'Sie liefern Modelle', title: 'Abgeben ohne Rückweisung', body: 'Health Score, 44 Regeln, die IDS des Auftraggebers und BCF-Themen – bevor das Modell Ihr Büro verlässt.', cta: 'Modell prüfen' },
      receive: { who: 'Sie erhalten Modelle', title: 'Wissen, was Sie annehmen', body: 'Lieferungen von Nachunternehmern und Planern gegen Ihre Anforderungen prüfen und einen Bericht für den Bauherrn behalten.', cta: 'Modellannahme ansehen' },
      build: { who: 'Sie entwickeln mit IFC', title: 'Den Viewer in Ihr Produkt einbauen', body: 'In CDE, Website oder Shop einbetten: SDK, WordPress, Shopify und ein MCP-Server.', cta: 'SDK-Dokumentation lesen' },
    },
    moreFeatures: 'Außerdem enthalten',
  },
  fr: {
    kicker: 'Visionneuse IFC gratuite en ligne',
    h1: 'Contrôlez un IFC avant de le livrer, ou avant de l’accepter',
    pathsTitle: 'De quel côté de la livraison êtes-vous ?',
    paths: {
      deliver: { who: 'Vous livrez des maquettes', title: 'Livrer sans refus', body: 'Health Score, 44 règles, l’IDS du client et les sujets BCF, avant que la maquette ne quitte votre bureau.', cta: 'Contrôler une maquette' },
      receive: { who: 'Vous recevez des maquettes', title: 'Savoir ce que vous acceptez', body: 'Contrôlez ce qu’envoient sous-traitants et concepteurs selon vos exigences, et gardez un rapport pour le maître d’ouvrage.', cta: 'Voir la réception des maquettes' },
      build: { who: 'Vous développez sur l’IFC', title: 'Intégrer la visionneuse à votre produit', body: 'Dans votre CDE, votre site ou votre boutique : SDK, WordPress, Shopify et serveur MCP.', cta: 'Lire la documentation du SDK' },
    },
    moreFeatures: 'Également inclus',
  },
  pt: {
    kicker: 'Visualizador IFC grátis online',
    h1: 'Verifique um IFC antes de o entregar, ou antes de o aceitar',
    pathsTitle: 'De que lado da entrega está?',
    paths: {
      deliver: { who: 'Entrega modelos', title: 'Entregar sem rejeições', body: 'Health Score, 44 regras, o IDS do cliente e questões BCF, antes de o modelo sair do seu escritório.', cta: 'Verificar um modelo' },
      receive: { who: 'Recebe modelos', title: 'Saiba o que está a aceitar', body: 'Verifique o que subempreiteiros e projetistas enviam face aos seus requisitos e guarde um relatório para o dono de obra.', cta: 'Ver receção de modelos' },
      build: { who: 'Desenvolve sobre IFC', title: 'Coloque o visualizador no seu produto', body: 'Integre-o no seu CDE, site ou loja: SDK, WordPress, Shopify e servidor MCP.', cta: 'Ler a documentação do SDK' },
    },
    moreFeatures: 'Também inclui',
  },
  it: {
    kicker: 'Visualizzatore IFC online gratuito',
    h1: 'Controlla un IFC prima di consegnarlo, o prima di accettarlo',
    pathsTitle: 'Da che parte della consegna sei?',
    paths: {
      deliver: { who: 'Consegni modelli', title: 'Consegna senza respinte', body: 'Health Score, 44 regole, l’IDS del committente e segnalazioni BCF, prima che il modello esca dal tuo studio.', cta: 'Controlla un modello' },
      receive: { who: 'Ricevi modelli', title: 'Sai cosa stai accettando', body: 'Verifica ciò che inviano subappaltatori e progettisti rispetto ai tuoi requisiti e conserva un report per il committente.', cta: 'Vedi la ricezione dei modelli' },
      build: { who: 'Sviluppi su IFC', title: 'Porta il visualizzatore nel tuo prodotto', body: 'Integralo nel tuo CDE, sito o negozio: SDK, WordPress, Shopify e server MCP.', cta: 'Leggi la documentazione SDK' },
    },
    moreFeatures: 'Inoltre',
  },
  ca: {
    kicker: 'Visor IFC gratuït en línia',
    h1: 'Comprova un IFC abans de lliurar-lo, o abans d’acceptar-lo',
    pathsTitle: 'A quin costat del lliurament ets?',
    paths: {
      deliver: { who: 'Lliures models', title: 'Lliura sense rebutjos', body: 'Health Score, 44 regles, l’IDS del client i incidències BCF, abans que el model surti del teu despatx.', cta: 'Comprovar un model' },
      receive: { who: 'Reps models', title: 'Sàpigues què acceptes', body: 'Revisa el que envien subcontractes i projectistes segons els teus requisits i desa un informe per a la propietat.', cta: 'Veure recepció de models' },
      build: { who: 'Desenvolupes sobre IFC', title: 'Posa el visor al teu producte', body: 'Integra’l al teu CDE, web o botiga: SDK, WordPress, Shopify i servidor MCP.', cta: 'Llegir la documentació de l’SDK' },
    },
    moreFeatures: 'També inclou',
  },
  zh: {
    kicker: '免费在线 IFC 查看器',
    h1: '在交付或验收之前检查 IFC 模型',
    pathsTitle: '您在交付链的哪一端？',
    paths: {
      deliver: { who: '您负责交付模型', title: '一次交付，不被退回', body: '健康评分、44 条规则、业主的 IDS 和 BCF 问题——在模型离开办公室之前完成检查。', cta: '检查模型' },
      receive: { who: '您负责接收模型', title: '清楚自己验收的是什么', body: '按您的要求检查分包和设计方提交的模型，并为业主保留报告。', cta: '了解模型验收' },
      build: { who: '您基于 IFC 开发', title: '把查看器放进您的产品', body: '嵌入 CDE、网站或网店：SDK、WordPress、Shopify 和 MCP 服务器。', cta: '阅读 SDK 文档' },
    },
    moreFeatures: '还包括',
  },
  ja: {
    kicker: '無料のオンライン IFC ビューア',
    h1: 'IFC を納品する前に、受け取る前にチェック',
    pathsTitle: '納品のどちら側ですか？',
    paths: {
      deliver: { who: 'モデルを納品する', title: '差し戻しなしで納品', body: 'Health Score、44 ルール、発注者の IDS、BCF 課題を、モデルが社外に出る前に確認。', cta: 'モデルをチェック' },
      receive: { who: 'モデルを受け取る', title: '何を受け入れるのかを把握', body: '協力会社や設計者から届くモデルを自社の要件で確認し、発注者向けのレポートを残せます。', cta: 'モデル受入れを見る' },
      build: { who: 'IFC で開発する', title: 'ビューアを自社製品に', body: 'CDE、Web サイト、ストアに組み込み：SDK、WordPress、Shopify、MCP サーバー。', cta: 'SDK ドキュメントを読む' },
    },
    moreFeatures: 'そのほかの機能',
  },
  th: {
    kicker: 'โปรแกรมดูไฟล์ IFC ออนไลน์ฟรี',
    h1: 'ตรวจ IFC ก่อนส่งมอบ หรือก่อนรับมอบ',
    pathsTitle: 'คุณอยู่ฝั่งไหนของการส่งมอบ',
    paths: {
      deliver: { who: 'คุณส่งมอบโมเดล', title: 'ส่งมอบโดยไม่ถูกตีกลับ', body: 'Health Score, 44 กฎ, IDS ของเจ้าของงาน และประเด็น BCF ก่อนโมเดลออกจากสำนักงาน', cta: 'ตรวจโมเดล' },
      receive: { who: 'คุณรับโมเดล', title: 'รู้ว่ากำลังรับมอบอะไร', body: 'ตรวจโมเดลที่ผู้รับเหมาช่วงและผู้ออกแบบส่งมาตามข้อกำหนดของคุณ และเก็บรายงานไว้ให้เจ้าของโครงการ', cta: 'ดูการรับมอบโมเดล' },
      build: { who: 'คุณพัฒนาบน IFC', title: 'ใส่ตัวดูลงในผลิตภัณฑ์ของคุณ', body: 'ฝังใน CDE เว็บไซต์ หรือร้านค้า: SDK, WordPress, Shopify และเซิร์ฟเวอร์ MCP', cta: 'อ่านเอกสาร SDK' },
    },
    moreFeatures: 'มีให้เพิ่มเติม',
  },
}

export const PATH_ORDER: PathId[] = ['deliver', 'receive', 'build']

/** Features shown as cards (by index in landing.json "features"); the rest go to a compact list. */
export const PRIMARY_FEATURES = [0, 1, 3, 7, 8, 10] as const

export function homeLang(lang: string): HomeLang {
  return (HOME_LANGS as readonly string[]).includes(lang) ? (lang as HomeLang) : 'en'
}

/** Where each path leads. `null` = open the viewer in place. */
export function pathHref(id: PathId, lang: string): string | null {
  if (id === 'deliver') return null
  if (id === 'receive') return `${pricingPath(lang)}#reception`
  return '/sdk/'
}
