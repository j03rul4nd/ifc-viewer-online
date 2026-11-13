// ─── Feature demo copy (blog) ────────────────────────────────────────────────
// Labels of the `feature-demo` block: the guided paid-workspace demo inside a
// preview post, with its three-step ladder (free tool → guided demo → waitlist
// or a call). Keyed by the ARTICLE's language, like blog-editorial-copy.
//
// Rules: nothing may read as available. The demo runs on sample data, the paid
// tools are "in preview", and the last step is a waitlist or a conversation.

import { toolById, toolHref } from './blog-tools'
import { pricingPath } from './pricing/pricing-paths'

export type FeatureDemoStep = 'drop' | 'naming' | 'rules' | 'clashes' | 'issues' | 'resolve' | 'mail' | 'value'

export interface FeatureDemoCopy {
  kicker: string
  /** What the reader will see at this step of the guided demo. */
  steps: Record<FeatureDemoStep, string>
  body: string
  start: string
  loading: string
  openFull: string
  mobileNote: string
  sample: string
  ladder: { free: string; freeNote: string; demo: string; demoNote: string; waitlist: string; talk: string; laterNote: string }
}

const en: FeatureDemoCopy = {
  kicker: 'Guided demo · sample data',
  steps: {
    drop: 'A supplier delivers an IFC to the project inbox',
    naming: 'The file name and the requirements, checked on arrival',
    rules: 'Your rules run on a model at this project phase',
    clashes: 'Clashes between disciplines, grouped and followed week by week',
    issues: 'Failures become issues with an owner and a due date',
    resolve: 'The team closes issues and the next version re-checks them',
    mail: 'The weekly update for the client, filled from the project',
    value: 'The hours it saves, with the assumptions shown',
  },
  body: 'Click through the real screens of the paid workspace, here in the article. Nothing to install and no account.',
  start: 'Start the demo here',
  loading: 'Loading the demo…',
  openFull: 'Open full screen',
  mobileNote: 'On a phone the demo opens full screen.',
  sample: 'Sample data. These tools are in preview and not open yet.',
  ladder: {
    free: 'Try it free with your IFC',
    freeNote: 'Works today, in your browser',
    demo: 'Walk through the whole demo',
    demoNote: 'Eight steps, sample data',
    waitlist: 'Join the waitlist',
    talk: 'Talk to us',
    laterNote: 'We write when it opens',
  },
}

const es: FeatureDemoCopy = {
  kicker: 'Demo guiada · datos de ejemplo',
  steps: {
    drop: 'Un proveedor entrega un IFC en el buzón del proyecto',
    naming: 'El nombre del fichero y los requisitos, comprobados al llegar',
    rules: 'Tus reglas sobre un modelo en esta fase del proyecto',
    clashes: 'Colisiones entre disciplinas, agrupadas y seguidas semana a semana',
    issues: 'Los fallos se convierten en incidencias con responsable y fecha',
    resolve: 'El equipo cierra incidencias y la siguiente versión las vuelve a comprobar',
    mail: 'La actualización semanal para el cliente, rellenada con el proyecto',
    value: 'Las horas que ahorra, con sus supuestos a la vista',
  },
  body: 'Recorre las pantallas reales del espacio de pago aquí, en el artículo. Sin instalar nada y sin cuenta.',
  start: 'Empezar la demo aquí',
  loading: 'Cargando la demo…',
  openFull: 'Abrir a pantalla completa',
  mobileNote: 'En el móvil la demo se abre a pantalla completa.',
  sample: 'Datos de ejemplo. Estas herramientas están en vista previa y aún no están abiertas.',
  ladder: {
    free: 'Pruébalo gratis con tu IFC',
    freeNote: 'Funciona hoy, en tu navegador',
    demo: 'Recorre la demo completa',
    demoNote: 'Ocho pasos, datos de ejemplo',
    waitlist: 'Apúntate a la lista de espera',
    talk: 'Hablar con nosotros',
    laterNote: 'Te escribimos cuando abra',
  },
}

const ca: FeatureDemoCopy = {
  kicker: 'Demo guiada · dades d’exemple',
  steps: {
    drop: 'Un proveïdor lliura un IFC a la bústia del projecte',
    naming: 'El nom del fitxer i els requisits, comprovats en arribar',
    rules: 'Les teves regles sobre un model en aquesta fase del projecte',
    clashes: 'Col·lisions entre disciplines, agrupades i seguides setmana a setmana',
    issues: 'Les fallades es converteixen en incidències amb responsable i data',
    resolve: 'L’equip tanca incidències i la versió següent les torna a comprovar',
    mail: 'L’actualització setmanal per al client, emplenada amb el projecte',
    value: 'Les hores que estalvia, amb els supòsits a la vista',
  },
  body: 'Recorre les pantalles reals de l’espai de pagament aquí, a l’article. Sense instal·lar res i sense compte.',
  start: 'Començar la demo aquí',
  loading: 'Carregant la demo…',
  openFull: 'Obrir a pantalla completa',
  mobileNote: 'Al mòbil la demo s’obre a pantalla completa.',
  sample: 'Dades d’exemple. Aquestes eines són en vista prèvia i encara no estan obertes.',
  ladder: {
    free: 'Prova-ho gratis amb el teu IFC',
    freeNote: 'Funciona avui, al navegador',
    demo: 'Recorre la demo completa',
    demoNote: 'Vuit passos, dades d’exemple',
    waitlist: 'Apunta’t a la llista d’espera',
    talk: 'Parlar amb nosaltres',
    laterNote: 'T’escrivim quan obri',
  },
}

const de: FeatureDemoCopy = {
  kicker: 'Geführte Demo · Beispieldaten',
  steps: {
    drop: 'Ein Zulieferer liefert ein IFC in den Projekteingang',
    naming: 'Dateiname und Anforderungen, beim Eingang geprüft',
    rules: 'Ihre Regeln auf einem Modell in dieser Projektphase',
    clashes: 'Kollisionen zwischen Gewerken, gruppiert und Woche für Woche verfolgt',
    issues: 'Fehler werden zu Aufgaben mit Verantwortlichem und Termin',
    resolve: 'Das Team schließt Aufgaben, die nächste Version prüft sie erneut',
    mail: 'Das wöchentliche Update für den Bauherrn, aus dem Projekt befüllt',
    value: 'Die gesparten Stunden, mit sichtbaren Annahmen',
  },
  body: 'Klicken Sie sich hier im Artikel durch die echten Bildschirme des kostenpflichtigen Arbeitsbereichs. Ohne Installation und ohne Konto.',
  start: 'Demo hier starten',
  loading: 'Demo wird geladen…',
  openFull: 'Im Vollbild öffnen',
  mobileNote: 'Auf dem Smartphone öffnet sich die Demo im Vollbild.',
  sample: 'Beispieldaten. Diese Werkzeuge sind in der Vorschau und noch nicht verfügbar.',
  ladder: {
    free: 'Kostenlos mit Ihrem IFC testen',
    freeNote: 'Funktioniert heute, im Browser',
    demo: 'Die ganze Demo durchgehen',
    demoNote: 'Acht Schritte, Beispieldaten',
    waitlist: 'Auf die Warteliste',
    talk: 'Mit uns sprechen',
    laterNote: 'Wir schreiben, wenn es startet',
  },
}

const fr: FeatureDemoCopy = {
  kicker: 'Démo guidée · données d’exemple',
  steps: {
    drop: 'Un fournisseur dépose un IFC dans la boîte du projet',
    naming: 'Le nom du fichier et les exigences, vérifiés à l’arrivée',
    rules: 'Vos règles sur une maquette à cette phase du projet',
    clashes: 'Les conflits entre disciplines, regroupés et suivis semaine après semaine',
    issues: 'Les échecs deviennent des sujets avec un responsable et une échéance',
    resolve: 'L’équipe clôt les sujets et la version suivante les revérifie',
    mail: 'Le point hebdomadaire pour le client, rempli à partir du projet',
    value: 'Les heures gagnées, hypothèses à l’appui',
  },
  body: 'Parcourez les vrais écrans de l’espace payant, ici dans l’article. Rien à installer, pas de compte.',
  start: 'Lancer la démo ici',
  loading: 'Chargement de la démo…',
  openFull: 'Ouvrir en plein écran',
  mobileNote: 'Sur mobile, la démo s’ouvre en plein écran.',
  sample: 'Données d’exemple. Ces outils sont en avant-première et pas encore ouverts.',
  ladder: {
    free: 'Essayez gratuitement avec votre IFC',
    freeNote: 'Disponible aujourd’hui, dans le navigateur',
    demo: 'Parcourir toute la démo',
    demoNote: 'Huit étapes, données d’exemple',
    waitlist: 'Rejoindre la liste d’attente',
    talk: 'Nous parler',
    laterNote: 'Nous vous écrivons à l’ouverture',
  },
}

const it: FeatureDemoCopy = {
  kicker: 'Demo guidata · dati di esempio',
  steps: {
    drop: 'Un fornitore consegna un IFC nella casella del progetto',
    naming: 'Il nome del file e i requisiti, controllati all’arrivo',
    rules: 'Le tue regole su un modello in questa fase del progetto',
    clashes: 'Interferenze tra discipline, raggruppate e seguite settimana per settimana',
    issues: 'Gli errori diventano segnalazioni con responsabile e scadenza',
    resolve: 'Il team chiude le segnalazioni e la versione successiva le ricontrolla',
    mail: 'L’aggiornamento settimanale per il cliente, compilato dal progetto',
    value: 'Le ore risparmiate, con le ipotesi in vista',
  },
  body: 'Scorri le schermate reali dello spazio a pagamento, qui nell’articolo. Niente da installare e nessun account.',
  start: 'Avvia la demo qui',
  loading: 'Caricamento della demo…',
  openFull: 'Apri a schermo intero',
  mobileNote: 'Sul telefono la demo si apre a schermo intero.',
  sample: 'Dati di esempio. Questi strumenti sono in anteprima e non ancora aperti.',
  ladder: {
    free: 'Provalo gratis con il tuo IFC',
    freeNote: 'Funziona oggi, nel browser',
    demo: 'Percorri tutta la demo',
    demoNote: 'Otto passi, dati di esempio',
    waitlist: 'Iscriviti alla lista d’attesa',
    talk: 'Parla con noi',
    laterNote: 'Ti scriviamo all’apertura',
  },
}

const pt: FeatureDemoCopy = {
  kicker: 'Demo guiada · dados de exemplo',
  steps: {
    drop: 'Um fornecedor entrega um IFC na caixa do projeto',
    naming: 'O nome do ficheiro e os requisitos, verificados à chegada',
    rules: 'As suas regras sobre um modelo nesta fase do projeto',
    clashes: 'Conflitos entre disciplinas, agrupados e acompanhados semana a semana',
    issues: 'As falhas tornam-se questões com responsável e prazo',
    resolve: 'A equipa fecha questões e a versão seguinte volta a verificá-las',
    mail: 'A atualização semanal para o cliente, preenchida a partir do projeto',
    value: 'As horas que poupa, com os pressupostos à vista',
  },
  body: 'Percorra os ecrãs reais do espaço pago, aqui no artigo. Nada para instalar e sem conta.',
  start: 'Iniciar a demo aqui',
  loading: 'A carregar a demo…',
  openFull: 'Abrir em ecrã inteiro',
  mobileNote: 'No telemóvel a demo abre em ecrã inteiro.',
  sample: 'Dados de exemplo. Estas ferramentas estão em pré-visualização e ainda não abriram.',
  ladder: {
    free: 'Experimente grátis com o seu IFC',
    freeNote: 'Funciona hoje, no navegador',
    demo: 'Percorrer a demo completa',
    demoNote: 'Oito passos, dados de exemplo',
    waitlist: 'Entrar na lista de espera',
    talk: 'Falar connosco',
    laterNote: 'Escrevemos quando abrir',
  },
}

const zh: FeatureDemoCopy = {
  kicker: '引导演示 · 示例数据',
  steps: {
    drop: '供应商将 IFC 提交到项目收件箱',
    naming: '文件名和要求在到达时即被检查',
    rules: '在本项目阶段用您的规则检查模型',
    clashes: '专业之间的碰撞，分组并逐周跟踪',
    issues: '失败项变成有负责人和截止日期的问题',
    resolve: '团队关闭问题，下一版本重新检查',
    mail: '给业主的每周更新，由项目数据自动填写',
    value: '节省的工时，并列出假设',
  },
  body: '就在文章里，点击浏览付费工作区的真实界面。无需安装，无需账户。',
  start: '在此开始演示',
  loading: '正在加载演示…',
  openFull: '全屏打开',
  mobileNote: '在手机上，演示会全屏打开。',
  sample: '示例数据。这些工具处于预览阶段，尚未开放。',
  ladder: {
    free: '用您的 IFC 免费试用',
    freeNote: '今天即可在浏览器中使用',
    demo: '浏览完整演示',
    demoNote: '八个步骤，示例数据',
    waitlist: '加入候补名单',
    talk: '联系我们',
    laterNote: '开放时我们会通知您',
  },
}

const ja: FeatureDemoCopy = {
  kicker: 'ガイド付きデモ · サンプルデータ',
  steps: {
    drop: '協力会社がプロジェクトの受付箱に IFC を納品',
    naming: 'ファイル名と要件を受付時にチェック',
    rules: 'このプロジェクト段階のモデルに自社ルールを適用',
    clashes: '分野間の干渉をグループ化し、週ごとに追跡',
    issues: '不合格が担当者と期限付きの課題になる',
    resolve: 'チームが課題を閉じ、次の版で再チェック',
    mail: 'プロジェクトから作成される発注者向けの週次報告',
    value: '削減できる時間と、その前提',
  },
  body: '有料ワークスペースの実際の画面を、この記事の中で操作できます。インストール不要、アカウント不要です。',
  start: 'ここでデモを開始',
  loading: 'デモを読み込み中…',
  openFull: '全画面で開く',
  mobileNote: 'スマートフォンではデモが全画面で開きます。',
  sample: 'サンプルデータです。これらのツールはプレビュー中で、まだ公開されていません。',
  ladder: {
    free: 'お手持ちの IFC で無料で試す',
    freeNote: '今日からブラウザで使えます',
    demo: 'デモをすべて見る',
    demoNote: '8 ステップ、サンプルデータ',
    waitlist: 'ウェイトリストに登録',
    talk: 'お問い合わせ',
    laterNote: '公開時にお知らせします',
  },
}

const th: FeatureDemoCopy = {
  kicker: 'เดโมแบบมีคำแนะนำ · ข้อมูลตัวอย่าง',
  steps: {
    drop: 'ผู้รับเหมาช่วงส่งไฟล์ IFC เข้ากล่องรับของโครงการ',
    naming: 'ตรวจชื่อไฟล์และข้อกำหนดทันทีที่ไฟล์มาถึง',
    rules: 'กฎของคุณตรวจโมเดลในช่วงนี้ของโครงการ',
    clashes: 'การชนกันระหว่างสาขา จัดกลุ่มและติดตามทุกสัปดาห์',
    issues: 'ข้อผิดพลาดกลายเป็นประเด็นที่มีผู้รับผิดชอบและกำหนดเสร็จ',
    resolve: 'ทีมปิดประเด็น และเวอร์ชันถัดไปตรวจซ้ำ',
    mail: 'รายงานประจำสัปดาห์ถึงเจ้าของโครงการ เติมจากข้อมูลโครงการ',
    value: 'ชั่วโมงที่ประหยัดได้ พร้อมสมมติฐานที่ใช้',
  },
  body: 'คลิกดูหน้าจอจริงของพื้นที่ทำงานแบบชำระเงินได้ในบทความนี้ ไม่ต้องติดตั้ง ไม่ต้องมีบัญชี',
  start: 'เริ่มเดโมที่นี่',
  loading: 'กำลังโหลดเดโม…',
  openFull: 'เปิดเต็มจอ',
  mobileNote: 'บนมือถือ เดโมจะเปิดแบบเต็มจอ',
  sample: 'ข้อมูลตัวอย่าง เครื่องมือเหล่านี้อยู่ในช่วงพรีวิวและยังไม่เปิดให้ใช้',
  ladder: {
    free: 'ลองฟรีกับไฟล์ IFC ของคุณ',
    freeNote: 'ใช้ได้วันนี้ในเบราว์เซอร์',
    demo: 'ดูเดโมทั้งหมด',
    demoNote: '8 ขั้นตอน ข้อมูลตัวอย่าง',
    waitlist: 'ลงชื่อในรายชื่อรอ',
    talk: 'คุยกับเรา',
    laterNote: 'เราจะแจ้งเมื่อเปิดให้ใช้',
  },
}

const COPY: Record<string, FeatureDemoCopy> = { en, es, ca, de, fr, it, pt, zh, ja, th }

export function featureDemoCopy(lang: string): FeatureDemoCopy {
  return COPY[lang.slice(0, 2)] ?? en
}

export const FEATURE_DEMO_LANGS = Object.keys(COPY)

export const STEP_INDEX: Record<FeatureDemoStep, { n: number; path: string }> = {
  drop: { n: 1, path: 'reception/inbox' },
  naming: { n: 2, path: 'reception/inbox' },
  rules: { n: 3, path: 'rules/advanced' },
  clashes: { n: 4, path: 'rules/advanced' },
  issues: { n: 5, path: 'issues' },
  resolve: { n: 6, path: 'issues/closed' },
  mail: { n: 7, path: 'mail' },
  value: { n: 8, path: 'value' },
}

/** Pure: the hrefs of the block, for the SPA and for the static shell. */
export function featureDemoLinks(p: { step: FeatureDemoStep; free: 'validator' | 'viewer'; role: string; talk: string; lang: string }) {
  const s = STEP_INDEX[p.step]
  const prefix = p.lang === 'en' ? '/' : `/${p.lang}/`
  const tool = toolById(p.free)
  const lang2 = p.lang.slice(0, 2)
  return {
    demo: `/workspace/${s.path}?demo=reception-flow&step=${s.n}`,
    demoStart: '/workspace/reception/inbox?demo=reception-flow&step=1',
    free: tool ? toolHref(tool, p.lang) : prefix,
    waitlist: `${pricingPath(p.lang)}?role=${p.role}`,
    talk: `/${(SOLUTION_SLUGS[p.talk as 'contractors'] ?? SOLUTION_SLUGS.contractors)[lang2] ?? SOLUTION_SLUGS.contractors.en}/`,
  }
}


/** Paths of the solution landings (kept equal to scripts/seo/solution-landings/pages.ts by a test). */
export const SOLUTION_SLUGS: Record<'contractors' | 'engineering', Record<string, string>> = {
  contractors: { en: 'for-contractors', es: 'es/para-constructoras', de: 'de/fuer-bauunternehmen', fr: 'fr/pour-entreprises-generales', pt: 'pt/para-construtoras', it: 'it/per-imprese-di-costruzione', ca: 'ca/per-a-constructores', zh: 'zh/for-contractors', ja: 'ja/for-contractors', th: 'th/for-contractors' },
  engineering: { en: 'for-engineering', es: 'es/para-ingenierias', de: 'de/fuer-ingenieurbueros', fr: 'fr/pour-bureaux-etudes', pt: 'pt/para-engenharias', it: 'it/per-studi-di-ingegneria', ca: 'ca/per-a-enginyeries', zh: 'zh/for-engineering', ja: 'ja/for-engineering', th: 'th/for-engineering' },
}
