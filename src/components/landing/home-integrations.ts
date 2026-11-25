// ─── Home page: integrations ──────────────────────────────────────────────────
// The section that used to sell the SDK alone. It now lists every place the
// viewer already runs in, with an honest status each, and keeps the SDK first
// because it is the one integration a developer can use today without asking.
//
// To add an integration: add its id to INTEGRATION_ORDER, its data to
// INTEGRATIONS and one line of copy per language in INTEGRATIONS_COPY. The
// layout reads only these, so nothing in IntegrationsHub.tsx changes.
//
// Status must be true on the day it ships (checked 2026-11-25):
// - SDK, MCP server (npm + MCP registry): live.
// - WordPress plugin: live on wordpress.org (1.2.0).
// - Shopify app: submitted to the Shopify App Store, in review. The free
//   copy-paste theme sections stay on GitHub; the integrations page says both.
// - Cloud folders (#585) and the GitHub Action: built, not switched on. They are
//   paid (they need our server), so the link is the existing feature-request
//   form ("what would help you most"), never a sign-up of its own.
// Third-party marks are written as plain names, never as logos.

import { HOME_LANGS, type HomeLang } from './home-copy'
import { integrationsPath } from '../../lib/integrations/integrations-paths'

export type IntegrationId = 'sdk' | 'mcp' | 'shopify' | 'wordpress' | 'folders' | 'ci'
export type IntegrationStatus = 'available' | 'review' | 'soon'

export type IntegrationLink =
  /** A page of ours, resolved per language. */
  | { kind: 'page'; href: (lang: HomeLang) => string }
  /** An outside page (the public repository). */
  | { kind: 'external'; href: string }
  /** Opens the feature-request form on this answer (cloudAccountStore). */
  | { kind: 'notify'; feature: string }

export interface Integration {
  id: IntegrationId
  /** Product name, the same in every language. */
  name: string
  status: IntegrationStatus
  link: IntegrationLink
  /** Short sober glyph from Icons.tsx; never a third-party logo. */
  icon: 'Code' | 'Terminal' | 'ShoppingBag' | 'Globe' | 'Folder' | 'GitBranch'
}

export const WORDPRESS_ORG = 'https://wordpress.org/plugins/bimo-ifc-viewer/'
const base = () => (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')
/** The integrations page in the reader's language. */
export const allIntegrationsHref = (lang: HomeLang, hash = '') => `${base()}${integrationsPath(lang)}${hash}`
const blog = (lang: HomeLang) => `${base()}/${lang === 'en' ? '' : `${lang}/`}blog/`

export const INTEGRATION_ORDER: IntegrationId[] = ['sdk', 'mcp', 'shopify', 'wordpress', 'folders', 'ci']

export const INTEGRATIONS: Record<IntegrationId, Integration> = {
  sdk: { id: 'sdk', name: 'JavaScript SDK', status: 'available', icon: 'Code', link: { kind: 'page', href: () => `${base()}/sdk/` } },
  mcp: { id: 'mcp', name: 'MCP server', status: 'available', icon: 'Terminal', link: { kind: 'page', href: (l) => `${blog(l)}ifc-mcp-server-claude-bim-3d-viewer/` } },
  shopify: { id: 'shopify', name: 'Shopify', status: 'review', icon: 'ShoppingBag', link: { kind: 'page', href: (l) => allIntegrationsHref(l, '#shopify') } },
  wordpress: { id: 'wordpress', name: 'WordPress', status: 'available', icon: 'Globe', link: { kind: 'external', href: WORDPRESS_ORG } },
  folders: { id: 'folders', name: 'SharePoint · OneDrive · Google Drive', status: 'soon', icon: 'Folder', link: { kind: 'notify', feature: 'cloud_drives' } },
  ci: { id: 'ci', name: 'GitHub Actions', status: 'soon', icon: 'GitBranch', link: { kind: 'notify', feature: 'auto_check' } },
}

/** Code tabs. Each one is code that works today, nothing aspirational. */
export type SnippetId = 'js' | 'iframe' | 'wordpress'
export const SNIPPET_ORDER: SnippetId[] = ['js', 'iframe', 'wordpress']
export const SNIPPET_TABS: Record<SnippetId, { label: string; file: string }> = {
  js: { label: 'JavaScript', file: 'index.html' },
  iframe: { label: 'iframe', file: 'index.html' },
  wordpress: { label: 'WordPress', file: 'shortcode' },
}

export function snippet(id: SnippetId, c: IntegrationsCopy, origin: string): string {
  if (id === 'js') {
    return `<div id="viewer" style="height:520px"></div>
<script type="module">
  import { IfcViewer } from "${origin}/sdk/ifc-viewer.es.js";

  // ${c.comment1}
  const viewer = new IfcViewer("#viewer");

  // ${c.comment2}
  const file = await fetch("project.ifc");
  await viewer.add("project.ifc", await file.arrayBuffer());
</script>`
  }
  if (id === 'iframe') {
    return `<!-- ${c.comment3} -->
<iframe
  src="${origin}/?embed=1&model=https://example.com/project.ifc"
  width="100%" height="520" allow="fullscreen"
  title="IFC model"></iframe>`
  }
  return `[ifc_viewer model="https://example.com/project.ifc" height="600"]`
}

export interface IntegrationsCopy {
  nav: string
  label: string
  title: string
  body: string
  /** Heading over the SDK block. */
  sdkTitle: string
  codeLabel: string
  comment1: string
  comment2: string
  comment3: string
  /** Shown under the WordPress tab. */
  wpNote: string
  /** Link under the grid to the integrations page. */
  all: string
  status: Record<IntegrationStatus, string>
  notify: string
  items: Record<IntegrationId, { value: string; cta: string }>
}

export const INTEGRATIONS_COPY: Record<HomeLang, IntegrationsCopy> = {
  en: {
    nav: 'Integrations',
    label: 'Integrations',
    title: 'Works inside the tools your team already uses',
    body: 'Put the same viewer in your website, CDE, online store or desktop tools. Models are processed in the browser: nothing is uploaded to us.',
    sdkTitle: 'Start with the SDK',
    codeLabel: 'Integration code examples',
    comment1: 'Mount the viewer in your page',
    comment2: 'Load IFC bytes from your app or CDE: nothing is uploaded',
    comment3: 'No code: paste it into any page',
    wpNote: 'The plugin is free on wordpress.org: Plugins → Add New → search “Bimo IFC Viewer”.',
    all: 'All integrations',
    status: { available: 'Available', review: 'In review', soon: 'Coming soon' },
    notify: 'Notify me',
    items: {
      sdk: { value: 'Embed the viewer in your CDE, portal or internal tools.', cta: 'Documentation' },
      mcp: { value: 'Validate IFC and open it in 3D from your desktop tools.', cta: 'Read the guide' },
      shopify: { value: 'A theme section that shows the IFC on your product page.', cta: 'See the details' },
      wordpress: { value: 'A block and a shortcode for posts and pages.', cta: 'See the plugin' },
      folders: { value: 'Check every model that lands in a project folder.', cta: '' },
      ci: { value: 'Fail a pull request when a model drops below your score.', cta: '' },
    },
  },
  es: {
    nav: 'Integraciones',
    label: 'Integraciones',
    title: 'Funciona dentro de las herramientas que ya usa tu equipo',
    body: 'Pon el mismo visor en tu web, tu CDE, tu tienda online o tus herramientas de escritorio. Los modelos se procesan en el navegador: no nos subes nada.',
    sdkTitle: 'Empieza por el SDK',
    codeLabel: 'Ejemplos de código de integración',
    comment1: 'Monta el visor en tu página',
    comment2: 'Carga el IFC desde tu app o tu CDE: no se sube nada',
    comment3: 'Sin código: pégalo en cualquier página',
    wpNote: 'El plugin es gratis en wordpress.org: Plugins → Añadir nuevo → busca “Bimo IFC Viewer”.',
    all: 'Todas las integraciones',
    status: { available: 'Disponible', review: 'En revisión', soon: 'Próximamente' },
    notify: 'Avísame',
    items: {
      sdk: { value: 'Integra el visor en tu CDE, tu portal o tus herramientas internas.', cta: 'Documentación' },
      mcp: { value: 'Valida IFC y ábrelo en 3D desde tus herramientas de escritorio.', cta: 'Leer la guía' },
      shopify: { value: 'Una sección del tema que muestra el IFC en la ficha de producto.', cta: 'Ver detalles' },
      wordpress: { value: 'Un bloque y un shortcode para entradas y páginas.', cta: 'Ver el plugin' },
      folders: { value: 'Revisa cada modelo que llega a una carpeta del proyecto.', cta: '' },
      ci: { value: 'Bloquea un pull request si un modelo baja de tu puntuación.', cta: '' },
    },
  },
  de: {
    nav: 'Integrationen',
    label: 'Integrationen',
    title: 'Läuft in den Werkzeugen, die dein Team schon nutzt',
    body: 'Bring denselben Viewer in deine Website, dein CDE, deinen Onlineshop oder deine Desktop-Werkzeuge. Modelle werden im Browser verarbeitet: Nichts wird zu uns hochgeladen.',
    sdkTitle: 'Starte mit dem SDK',
    codeLabel: 'Codebeispiele für die Integration',
    comment1: 'Viewer in deine Seite einbinden',
    comment2: 'IFC aus deiner App oder deinem CDE laden: nichts wird hochgeladen',
    comment3: 'Ohne Code: in jede Seite einfügen',
    wpNote: 'Das Plugin ist kostenlos auf wordpress.org: Plugins → Installieren → „Bimo IFC Viewer“ suchen.',
    all: 'Alle Integrationen',
    status: { available: 'Verfügbar', review: 'In Prüfung', soon: 'Demnächst' },
    notify: 'Benachrichtigen',
    items: {
      sdk: { value: 'Binde den Viewer in dein CDE, Portal oder interne Tools ein.', cta: 'Dokumentation' },
      mcp: { value: 'IFC aus deinen Desktop-Werkzeugen prüfen und in 3D öffnen.', cta: 'Anleitung lesen' },
      shopify: { value: 'Ein Theme-Abschnitt, der das IFC auf der Produktseite zeigt.', cta: 'Details ansehen' },
      wordpress: { value: 'Ein Block und ein Shortcode für Beiträge und Seiten.', cta: 'Plugin ansehen' },
      folders: { value: 'Jedes Modell prüfen, das in einem Projektordner landet.', cta: '' },
      ci: { value: 'Einen Pull Request stoppen, wenn ein Modell unter deinen Score fällt.', cta: '' },
    },
  },
  fr: {
    nav: 'Intégrations',
    label: 'Intégrations',
    title: 'Fonctionne dans les outils que votre équipe utilise déjà',
    body: 'Placez le même visualiseur dans votre site, votre CDE, votre boutique en ligne ou vos outils de bureau. Les modèles sont traités dans le navigateur : rien ne nous est envoyé.',
    sdkTitle: 'Commencez par le SDK',
    codeLabel: "Exemples de code d'intégration",
    comment1: 'Montez le visualiseur dans votre page',
    comment2: "Chargez l'IFC depuis votre app ou CDE : rien n'est envoyé",
    comment3: "Sans code : collez-le dans n'importe quelle page",
    wpNote: 'Le plugin est gratuit sur wordpress.org : Extensions → Ajouter → cherchez « Bimo IFC Viewer ».',
    all: 'Toutes les intégrations',
    status: { available: 'Disponible', review: 'En validation', soon: 'Bientôt' },
    notify: 'Me prévenir',
    items: {
      sdk: { value: 'Intégrez le visualiseur à votre CDE, portail ou outils internes.', cta: 'Documentation' },
      mcp: { value: 'Validez des IFC et ouvrez-les en 3D depuis vos outils de bureau.', cta: 'Lire le guide' },
      shopify: { value: "Une section de thème qui affiche l'IFC sur la fiche produit.", cta: 'Voir les détails' },
      wordpress: { value: 'Un bloc et un shortcode pour articles et pages.', cta: 'Voir le plugin' },
      folders: { value: 'Contrôlez chaque modèle déposé dans un dossier de projet.', cta: '' },
      ci: { value: 'Bloquez une pull request si un modèle passe sous votre score.', cta: '' },
    },
  },
  pt: {
    nav: 'Integrações',
    label: 'Integrações',
    title: 'Funciona dentro das ferramentas que a sua equipa já usa',
    body: 'Coloque o mesmo visualizador no seu site, CDE, loja online ou ferramentas de desktop. Os modelos são processados no navegador: nada é enviado para nós.',
    sdkTitle: 'Comece pelo SDK',
    codeLabel: 'Exemplos de código de integração',
    comment1: 'Monte o visualizador na sua página',
    comment2: 'Carregue o IFC da sua app ou CDE: nada é enviado',
    comment3: 'Sem código: cole-o em qualquer página',
    wpNote: 'O plugin é gratuito em wordpress.org: Plugins → Adicionar novo → procure “Bimo IFC Viewer”.',
    all: 'Todas as integrações',
    status: { available: 'Disponível', review: 'Em revisão', soon: 'Em breve' },
    notify: 'Avisar-me',
    items: {
      sdk: { value: 'Integre o visualizador no seu CDE, portal ou ferramentas internas.', cta: 'Documentação' },
      mcp: { value: 'Valide IFC e abra-o em 3D a partir das suas ferramentas de desktop.', cta: 'Ler o guia' },
      shopify: { value: 'Uma secção do tema que mostra o IFC na página do produto.', cta: 'Ver detalhes' },
      wordpress: { value: 'Um bloco e um shortcode para artigos e páginas.', cta: 'Ver o plugin' },
      folders: { value: 'Verifique cada modelo que chega a uma pasta do projeto.', cta: '' },
      ci: { value: 'Bloqueie um pull request se um modelo descer abaixo da sua pontuação.', cta: '' },
    },
  },
  it: {
    nav: 'Integrazioni',
    label: 'Integrazioni',
    title: 'Funziona dentro gli strumenti che il tuo team usa già',
    body: 'Metti lo stesso viewer nel tuo sito, nel CDE, nel negozio online o nei tuoi strumenti desktop. I modelli vengono elaborati nel browser: non ci carichi nulla.',
    sdkTitle: "Inizia dall'SDK",
    codeLabel: 'Esempi di codice di integrazione',
    comment1: 'Monta il viewer nella tua pagina',
    comment2: "Carica l'IFC dalla tua app o dal CDE: non si carica nulla",
    comment3: 'Senza codice: incollalo in qualsiasi pagina',
    wpNote: 'Il plugin è gratuito su wordpress.org: Plugin → Aggiungi nuovo → cerca “Bimo IFC Viewer”.',
    all: 'Tutte le integrazioni',
    status: { available: 'Disponibile', review: 'In revisione', soon: 'In arrivo' },
    notify: 'Avvisami',
    items: {
      sdk: { value: 'Integra il viewer nel tuo CDE, portale o strumenti interni.', cta: 'Documentazione' },
      mcp: { value: 'Valida file IFC e aprili in 3D dai tuoi strumenti desktop.', cta: 'Leggi la guida' },
      shopify: { value: "Una sezione del tema che mostra l'IFC nella pagina prodotto.", cta: 'Vedi i dettagli' },
      wordpress: { value: 'Un blocco e uno shortcode per articoli e pagine.', cta: 'Vedi il plugin' },
      folders: { value: 'Controlla ogni modello che arriva in una cartella di progetto.', cta: '' },
      ci: { value: 'Blocca una pull request se un modello scende sotto il tuo punteggio.', cta: '' },
    },
  },
  ca: {
    nav: 'Integracions',
    label: 'Integracions',
    title: 'Funciona dins de les eines que ja fa servir el teu equip',
    body: "Posa el mateix visor al teu web, al teu CDE, a la teva botiga en línia o a les teves eines d'escriptori. Els models es processen al navegador: no ens puges res.",
    sdkTitle: "Comença per l'SDK",
    codeLabel: "Exemples de codi d'integració",
    comment1: 'Munta el visor a la teva pàgina',
    comment2: "Carrega l'IFC des de la teva app o CDE: no es puja res",
    comment3: 'Sense codi: enganxa-ho a qualsevol pàgina',
    wpNote: 'El plugin és gratuït a wordpress.org: Extensions → Afegeix → cerca “Bimo IFC Viewer”.',
    all: 'Totes les integracions',
    status: { available: 'Disponible', review: 'En revisió', soon: 'Properament' },
    notify: "Avisa'm",
    items: {
      sdk: { value: 'Integra el visor al teu CDE, portal o eines internes.', cta: 'Documentació' },
      mcp: { value: "Valida IFC i obre'l en 3D des de les teves eines d'escriptori.", cta: 'Llegir la guia' },
      shopify: { value: "Una secció del tema que mostra l'IFC a la fitxa de producte.", cta: 'Veure detalls' },
      wordpress: { value: 'Un bloc i un shortcode per a entrades i pàgines.', cta: 'Veure el plugin' },
      folders: { value: 'Revisa cada model que arriba a una carpeta del projecte.', cta: '' },
      ci: { value: 'Bloqueja un pull request si un model baixa de la teva puntuació.', cta: '' },
    },
  },
  zh: {
    nav: '集成',
    label: '集成',
    title: '在团队已在使用的工具中运行',
    body: '把同一个查看器放进您的网站、CDE、网店或桌面工具。模型在浏览器中处理：不会上传给我们。',
    sdkTitle: '从 SDK 开始',
    codeLabel: '集成代码示例',
    comment1: '在页面中挂载查看器',
    comment2: '从您的应用或 CDE 加载 IFC：不会上传任何内容',
    comment3: '无需代码：粘贴到任意页面',
    wpNote: '插件在 wordpress.org 免费提供：插件 → 安装插件 → 搜索 “Bimo IFC Viewer”。',
    all: '全部集成',
    status: { available: '可用', review: '审核中', soon: '即将推出' },
    notify: '通知我',
    items: {
      sdk: { value: '将查看器嵌入您的 CDE、门户或内部工具。', cta: '文档' },
      mcp: { value: '在桌面工具中验证 IFC 并以 3D 打开。', cta: '阅读指南' },
      shopify: { value: '在商品页面显示 IFC 的主题区块。', cta: '查看详情' },
      wordpress: { value: '用于文章和页面的区块与短代码。', cta: '查看插件' },
      folders: { value: '检查进入项目文件夹的每个模型。', cta: '' },
      ci: { value: '模型分数低于标准时阻止拉取请求。', cta: '' },
    },
  },
  ja: {
    nav: '連携',
    label: '連携',
    title: 'チームがすでに使っているツールの中で動く',
    body: '同じビューアを Web サイト、CDE、オンラインストア、デスクトップツールに組み込めます。モデルはブラウザで処理され、当社には何もアップロードされません。',
    sdkTitle: 'まずは SDK から',
    codeLabel: '連携のコード例',
    comment1: 'ページにビューアを配置',
    comment2: 'アプリや CDE から IFC を読み込む（アップロードなし）',
    comment3: 'コード不要：任意のページに貼り付け',
    wpNote: 'プラグインは wordpress.org で無料：プラグイン → 新規追加 →「Bimo IFC Viewer」を検索。',
    all: 'すべての連携',
    status: { available: '利用可能', review: '審査中', soon: '近日公開' },
    notify: '通知を受け取る',
    items: {
      sdk: { value: 'ビューアを CDE、ポータル、社内ツールに組み込む。', cta: 'ドキュメント' },
      mcp: { value: 'デスクトップツールから IFC を検証し 3D で開く。', cta: 'ガイドを読む' },
      shopify: { value: '商品ページに IFC を表示するテーマセクション。', cta: '詳細を見る' },
      wordpress: { value: '投稿や固定ページ用のブロックとショートコード。', cta: 'プラグインを見る' },
      folders: { value: 'プロジェクトフォルダに届くモデルをすべてチェック。', cta: '' },
      ci: { value: 'モデルが基準スコアを下回るとプルリクエストを止める。', cta: '' },
    },
  },
  th: {
    nav: 'การผสานรวม',
    label: 'การผสานรวม',
    title: 'ทำงานในเครื่องมือที่ทีมของคุณใช้อยู่แล้ว',
    body: 'ใส่ตัวแสดงผลเดียวกันลงในเว็บไซต์ CDE ร้านค้าออนไลน์ หรือเครื่องมือบนเดสก์ท็อปของคุณ โมเดลประมวลผลในเบราว์เซอร์ ไม่มีการอัปโหลดมาที่เรา',
    sdkTitle: 'เริ่มจาก SDK',
    codeLabel: 'ตัวอย่างโค้ดการผสานรวม',
    comment1: 'วางตัวแสดงผลในหน้าของคุณ',
    comment2: 'โหลด IFC จากแอปหรือ CDE ของคุณ ไม่มีการอัปโหลด',
    comment3: 'ไม่ต้องเขียนโค้ด วางในหน้าใดก็ได้',
    wpNote: 'ปลั๊กอินใช้ฟรีบน wordpress.org: ปลั๊กอิน → เพิ่มใหม่ → ค้นหา “Bimo IFC Viewer”',
    all: 'การผสานรวมทั้งหมด',
    status: { available: 'พร้อมใช้', review: 'กำลังตรวจสอบ', soon: 'เร็วๆ นี้' },
    notify: 'แจ้งเตือนฉัน',
    items: {
      sdk: { value: 'ฝังตัวแสดงผลใน CDE พอร์ทัล หรือเครื่องมือภายในของคุณ', cta: 'เอกสาร' },
      mcp: { value: 'ตรวจสอบ IFC และเปิดเป็น 3D จากเครื่องมือบนเดสก์ท็อปของคุณ', cta: 'อ่านคู่มือ' },
      shopify: { value: 'ส่วนของธีมที่แสดง IFC บนหน้าสินค้า', cta: 'ดูรายละเอียด' },
      wordpress: { value: 'บล็อกและชอร์ตโค้ดสำหรับโพสต์และหน้า', cta: 'ดูปลั๊กอิน' },
      folders: { value: 'ตรวจทุกโมเดลที่เข้ามาในโฟลเดอร์โครงการ', cta: '' },
      ci: { value: 'หยุด pull request เมื่อโมเดลได้คะแนนต่ำกว่าเกณฑ์', cta: '' },
    },
  },
}

export { HOME_LANGS }
