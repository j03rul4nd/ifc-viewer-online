// The digital twin builder, described in nine more languages.
//
//   npx tsx scripts/seo/build-twin-builder-landings.ts
//
// /twin-builder/ is the app (English UI) with its own English shell
// (generate-twin-builder-page.ts). These are static pages, one per language,
// that explain the same tool in that language and open it: public/<lang>/<slug>/
// index.html. Together with the English page they form one hreflang cluster,
// written here and in the sitemap (between twin-builder-i18n markers).

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { LANGS, STYLE, pathOf, IMAGES } from './build-demo-landings'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SITE = 'https://www.ifcvieweronline.eu'
const APP = '/twin-builder/'

type Pair = [string, string]
export interface BuilderCopy {
  slug: string; title: string; description: string; keywords: string; badge: string
  h1: Pair; lead: string
  agv: { name: string; cta: string; steps: Pair[] }
  imports: { name: string; cta: string; steps: Pair[] }
  howTitle: string
  faq: Pair[]
}

export const COPY: Record<string, BuilderCopy> = {
  es: {
    slug: 'crear-gemelo-digital',
    title: 'Crea tu gemelo digital: almacén con AGV o importaciones',
    description: 'Crea tu propio gemelo digital en el navegador: un almacén con AGV con tu distribución y productos, o el seguimiento de importaciones desde tu Excel. Gratis.',
    keywords: 'crear gemelo digital, gemelo digital gratis, simulador de almacén, simulación AGV, gemelo digital almacén, seguimiento de importaciones, seguimiento de pedidos de compra, coste de importación, gemelo digital cadena de suministro',
    badge: 'Gratis · En el navegador · Sin instalar',
    h1: ['Crea tu propio', 'gemelo digital'], lead: 'Un almacén con AGV a partir de tu distribución y tus productos, o un mapa de tus importaciones a partir de tus pedidos. Todo funciona en tu navegador: no se sube nada.',
    agv: { name: 'Almacén con AGV', cta: 'Crear mi almacén', steps: [
      ['Dibuja la nave', 'Pasillos, bahías, niveles, muelles de entrada y salida y número de carros.'],
      ['Carga tus productos', 'Pega tus referencias desde Excel o sube un CSV: código, nombre, cajas y kg.'],
      ['Indica a quién sirves', 'Clientes, ciudades, transportistas (uno exprés) y proveedores.'],
      ['Conecta tu ERP', 'Odoo, Salesforce o cualquier webhook recibe cada orden confirmada.'],
      ['Muestra tu flota real', 'Lee las posiciones de tu gestor de flota y sustituye a los carros simulados.'],
    ] },
    imports: { name: 'Seguimiento de importaciones', cta: 'Crear mi seguimiento', steps: [
      ['Di adónde va la mercancía', 'Tu empresa, tu agente, tu almacén y el centro del agente.'],
      ['Elige la ruta', 'Puertos, aeropuertos y terminales de tren entre China y Europa.'],
      ['Carga proveedores y pedidos', 'Desde una hoja de cálculo: pedido, proveedor, unidades, precio, HS, modo y fechas.'],
      ['Usa tus fechas reales', 'Hoy es hoy: ves qué llega tarde, cuánto y la nueva fecha de llegada.'],
      ['Añade los avisos del agente', 'Un CSV o una URL con pedido, estado, fecha y posición.'],
    ] },
    howTitle: 'Cómo se hace',
    faq: [
      ['¿Es gratis?', 'Sí. Funciona entero en tu navegador, sin cuenta y sin instalar nada.'],
      ['¿Dónde se guardan mis datos?', 'En tu navegador. Puedes exportarlos a un archivo o compartirlos con un enlace que no pasa por ningún servidor. La clave de tu ERP nunca sale del navegador.'],
      ['¿Se conecta a mi ERP o a mi flota?', 'Sí, directamente desde tu navegador: Odoo, Salesforce o un webhook, y un JSON o WebSocket para la flota. Tu sistema debe permitir llamadas desde esta web (CORS).'],
      ['¿La herramienta está en español?', 'La herramienta está en inglés; lee hojas de cálculo con columnas en español y separadas por punto y coma.'],
    ],
  },
  de: {
    slug: 'digitalen-zwilling-erstellen',
    title: 'Digitalen Zwilling erstellen: AGV-Lager oder China-Importe',
    description: 'Erstellen Sie Ihren eigenen digitalen Zwilling im Browser: ein AGV-Lager aus Ihrem Layout und Ihren Artikeln oder ein Import-Tracker aus Ihrer Bestellliste.',
    keywords: 'digitalen Zwilling erstellen, digitaler Zwilling kostenlos, Lagersimulation online, AGV Simulation, FTS Simulation, digitaler Zwilling Lager, Import Tracking, Bestellverfolgung Karte, Einstandskosten',
    badge: 'Kostenlos · Im Browser · Keine Installation',
    h1: ['Ihren eigenen', 'digitalen Zwilling erstellen'], lead: 'Ein AGV-Lager aus Ihrem Layout und Ihren Artikeln oder eine Karte Ihrer Importe aus Ihren Bestellungen. Alles läuft im Browser: nichts wird hochgeladen.',
    agv: { name: 'AGV-Lager', cta: 'Mein Lager erstellen', steps: [
      ['Halle anlegen', 'Gassen, Fächer, Ebenen, Ein- und Ausgangstore und Anzahl der Fahrzeuge.'],
      ['Artikel laden', 'Aus Excel einfügen oder CSV laden: Code, Name, Kartons und kg.'],
      ['Kunden festlegen', 'Kunden, Städte, Spediteure (einer als Express) und Lieferanten.'],
      ['ERP verbinden', 'Odoo, Salesforce oder ein Webhook erhält jeden bestätigten Transportauftrag.'],
      ['Echte Flotte zeigen', 'Positionen aus Ihrem Flottenmanager ersetzen die simulierten Fahrzeuge.'],
    ] },
    imports: { name: 'Import-Tracker', cta: 'Meinen Tracker erstellen', steps: [
      ['Ziel festlegen', 'Firma, Einkaufsagent, Lager und Agenten-Hub.'],
      ['Route wählen', 'Häfen, Flughäfen und Bahnterminals zwischen China und Europa.'],
      ['Lieferanten und Bestellungen laden', 'Aus einer Tabelle: Bestellung, Lieferant, Menge, Preis, HS, Transportart, Daten.'],
      ['Echte Daten nutzen', 'Heute ist heute: was spät ist, wie spät, und die neue Ankunft.'],
      ['Agenten-Meldungen einspielen', 'Eine CSV oder eine URL mit Bestellung, Status, Datum und Position.'],
    ] },
    howTitle: 'So geht es',
    faq: [
      ['Ist es kostenlos?', 'Ja. Es läuft vollständig im Browser, ohne Konto und ohne Installation.'],
      ['Wo werden meine Daten gespeichert?', 'In Ihrem Browser. Export als Datei oder Teilen per Link, der keinen Server berührt. Ihr ERP-Schlüssel verlässt den Browser nie.'],
      ['Verbindet es sich mit meinem ERP oder meiner Flotte?', 'Ja, direkt aus dem Browser: Odoo, Salesforce oder ein Webhook, und JSON oder WebSocket für die Flotte. Ihr System muss Anfragen dieser Website erlauben (CORS).'],
      ['Ist das Werkzeug auf Deutsch?', 'Die Oberfläche ist Englisch; Tabellen mit Komma oder Semikolon werden gelesen.'],
    ],
  },
  fr: {
    slug: 'creer-jumeau-numerique',
    title: 'Créer un jumeau numérique : entrepôt AGV ou imports',
    description: 'Créez votre propre jumeau numérique dans le navigateur : un entrepôt AGV avec votre plan et vos produits, ou un suivi d’imports depuis votre tableur. Gratuit.',
    keywords: 'créer un jumeau numérique, jumeau numérique gratuit, simulateur d’entrepôt, simulation AGV, jumeau numérique entrepôt, suivi des importations, suivi des commandes, coût de revient import',
    badge: 'Gratuit · Dans le navigateur · Sans installation',
    h1: ['Créez votre propre', 'jumeau numérique'], lead: 'Un entrepôt AGV à partir de votre plan et de vos produits, ou une carte de vos imports à partir de vos commandes. Tout tourne dans votre navigateur : rien n’est envoyé.',
    agv: { name: 'Entrepôt AGV', cta: 'Créer mon entrepôt', steps: [
      ['Dessinez le bâtiment', 'Allées, travées, niveaux, quais d’entrée et de sortie, nombre de chariots.'],
      ['Chargez vos produits', 'Collez depuis Excel ou chargez un CSV : code, nom, cartons, kg.'],
      ['Indiquez vos clients', 'Clients, villes, transporteurs (un express) et fournisseurs.'],
      ['Connectez votre ERP', 'Odoo, Salesforce ou un webhook reçoit chaque ordre confirmé.'],
      ['Montrez votre flotte réelle', 'Les positions de votre gestionnaire de flotte remplacent les chariots simulés.'],
    ] },
    imports: { name: 'Suivi des imports', cta: 'Créer mon suivi', steps: [
      ['Dites où va la marchandise', 'Votre société, votre agent, votre entrepôt et le hub de l’agent.'],
      ['Choisissez la route', 'Ports, aéroports et terminaux ferroviaires entre la Chine et l’Europe.'],
      ['Chargez fournisseurs et commandes', 'Depuis un tableur : commande, fournisseur, unités, prix, SH, mode, dates.'],
      ['Utilisez vos vraies dates', 'Aujourd’hui est aujourd’hui : ce qui est en retard, de combien, et la nouvelle arrivée.'],
      ['Ajoutez les mises à jour de l’agent', 'Un CSV ou une URL avec commande, statut, date et position.'],
    ] },
    howTitle: 'Comment faire',
    faq: [
      ['Est-ce gratuit ?', 'Oui. Tout fonctionne dans votre navigateur, sans compte ni installation.'],
      ['Où sont mes données ?', 'Dans votre navigateur. Export en fichier ou partage par un lien qui ne passe par aucun serveur. La clé de votre ERP ne quitte jamais le navigateur.'],
      ['Se connecte-t-il à mon ERP ou ma flotte ?', 'Oui, depuis votre navigateur : Odoo, Salesforce ou un webhook, et JSON ou WebSocket pour la flotte. Votre système doit autoriser ce site (CORS).'],
      ['L’outil est-il en français ?', 'L’interface est en anglais ; il lit les tableurs séparés par virgule ou point-virgule.'],
    ],
  },
  pt: {
    slug: 'criar-gemeo-digital',
    title: 'Crie o seu gémeo digital: armazém com AGV ou importações',
    description: 'Crie o seu próprio gémeo digital no navegador: um armazém com AGV a partir da sua planta e produtos, ou o rastreio de importações a partir da sua folha. Grátis.',
    keywords: 'criar gémeo digital, criar gêmeo digital, gémeo digital grátis, simulador de armazém, simulação AGV, rastreio de importações, rastreio de encomendas, custo de importação',
    badge: 'Grátis · No navegador · Sem instalar',
    h1: ['Crie o seu próprio', 'gémeo digital'], lead: 'Um armazém com AGV a partir da sua planta e dos seus produtos, ou um mapa das suas importações a partir das suas encomendas. Tudo corre no navegador: nada é enviado.',
    agv: { name: 'Armazém com AGV', cta: 'Criar o meu armazém', steps: [
      ['Desenhe o armazém', 'Corredores, vãos, níveis, cais de entrada e saída e número de veículos.'],
      ['Carregue os produtos', 'Cole do Excel ou carregue um CSV: código, nome, caixas e kg.'],
      ['Diga a quem serve', 'Clientes, cidades, transportadoras (uma expresso) e fornecedores.'],
      ['Ligue o seu ERP', 'Odoo, Salesforce ou um webhook recebe cada ordem confirmada.'],
      ['Mostre a sua frota real', 'As posições do seu gestor de frota substituem os veículos simulados.'],
    ] },
    imports: { name: 'Rastreio de importações', cta: 'Criar o meu rastreio', steps: [
      ['Diga para onde vai a mercadoria', 'A sua empresa, o seu agente, o seu armazém e o hub do agente.'],
      ['Escolha a rota', 'Portos, aeroportos e terminais ferroviários entre a China e a Europa.'],
      ['Carregue fornecedores e encomendas', 'De uma folha de cálculo: encomenda, fornecedor, unidades, preço, SH, modo e datas.'],
      ['Use as suas datas reais', 'Hoje é hoje: o que está atrasado, quanto, e a nova chegada.'],
      ['Junte as atualizações do agente', 'Um CSV ou um URL com encomenda, estado, data e posição.'],
    ] },
    howTitle: 'Como se faz',
    faq: [
      ['É grátis?', 'Sim. Funciona inteiramente no navegador, sem conta e sem instalar nada.'],
      ['Onde ficam os meus dados?', 'No seu navegador. Pode exportar para um ficheiro ou partilhar com um link que não passa por nenhum servidor. A chave do ERP nunca sai do navegador.'],
      ['Liga-se ao meu ERP ou à minha frota?', 'Sim, diretamente do navegador: Odoo, Salesforce ou um webhook, e JSON ou WebSocket para a frota. O seu sistema tem de permitir este site (CORS).'],
      ['A ferramenta está em português?', 'A interface está em inglês; lê folhas separadas por vírgula ou ponto e vírgula.'],
    ],
  },
  it: {
    slug: 'creare-gemello-digitale',
    title: 'Crea il tuo gemello digitale: magazzino AGV o importazioni',
    description: 'Crea il tuo gemello digitale nel browser: un magazzino con AGV dal tuo layout e dai tuoi prodotti, o il tracciamento delle importazioni dal tuo foglio. Gratis.',
    keywords: 'creare gemello digitale, gemello digitale gratis, simulatore di magazzino, simulazione AGV, gemello digitale magazzino, tracciamento importazioni, tracciamento ordini, costo sbarcato',
    badge: 'Gratis · Nel browser · Niente da installare',
    h1: ['Crea il tuo', 'gemello digitale'], lead: 'Un magazzino con AGV dal tuo layout e dai tuoi prodotti, o una mappa delle tue importazioni dai tuoi ordini. Tutto gira nel browser: non si carica nulla.',
    agv: { name: 'Magazzino con AGV', cta: 'Crea il mio magazzino', steps: [
      ['Disegna il capannone', 'Corsie, campate, livelli, baie di carico e scarico e numero di veicoli.'],
      ['Carica i prodotti', 'Incolla da Excel o carica un CSV: codice, nome, colli e kg.'],
      ['Indica chi servi', 'Clienti, città, vettori (uno espresso) e fornitori.'],
      ['Collega il tuo ERP', 'Odoo, Salesforce o un webhook riceve ogni ordine confermato.'],
      ['Mostra la tua flotta reale', 'Le posizioni del tuo gestore di flotta sostituiscono i veicoli simulati.'],
    ] },
    imports: { name: 'Tracciamento importazioni', cta: 'Crea il mio tracciamento', steps: [
      ['Di’ dove va la merce', 'La tua azienda, il tuo agente, il tuo magazzino e l’hub dell’agente.'],
      ['Scegli la rotta', 'Porti, aeroporti e terminal ferroviari tra Cina ed Europa.'],
      ['Carica fornitori e ordini', 'Da un foglio: ordine, fornitore, unità, prezzo, HS, modalità e date.'],
      ['Usa le tue date reali', 'Oggi è oggi: cosa è in ritardo, di quanto, e il nuovo arrivo.'],
      ['Aggiungi gli aggiornamenti dell’agente', 'Un CSV o un URL con ordine, stato, data e posizione.'],
    ] },
    howTitle: 'Come si fa',
    faq: [
      ['È gratis?', 'Sì. Funziona interamente nel browser, senza account e senza installare nulla.'],
      ['Dove sono i miei dati?', 'Nel tuo browser. Puoi esportarli in un file o condividerli con un link che non passa da alcun server. La chiave dell’ERP non lascia mai il browser.'],
      ['Si collega al mio ERP o alla mia flotta?', 'Sì, dal browser: Odoo, Salesforce o un webhook, e JSON o WebSocket per la flotta. Il tuo sistema deve consentire questo sito (CORS).'],
      ['Lo strumento è in italiano?', 'L’interfaccia è in inglese; legge fogli separati da virgola o punto e virgola.'],
    ],
  },
  ca: {
    slug: 'crear-besso-digital',
    title: 'Crea el teu bessó digital: magatzem amb AGV o importacions',
    description: 'Crea el teu propi bessó digital al navegador: un magatzem amb AGV amb la teva distribució i productes, o el seguiment d’importacions des del teu full. Gratis.',
    keywords: 'crear bessó digital, bessó digital gratis, simulador de magatzem, simulació AGV, bessó digital magatzem, seguiment d’importacions, seguiment de comandes, cost d’importació',
    badge: 'Gratis · Al navegador · Sense instal·lar',
    h1: ['Crea el teu propi', 'bessó digital'], lead: 'Un magatzem amb AGV a partir de la teva distribució i els teus productes, o un mapa de les teves importacions a partir de les teves comandes. Tot funciona al navegador: no es puja res.',
    agv: { name: 'Magatzem amb AGV', cta: 'Crear el meu magatzem', steps: [
      ['Dibuixa la nau', 'Passadissos, badies, nivells, molls d’entrada i sortida i nombre de vehicles.'],
      ['Carrega els productes', 'Enganxa des d’Excel o puja un CSV: codi, nom, caixes i kg.'],
      ['Indica a qui serveixes', 'Clients, ciutats, transportistes (un exprés) i proveïdors.'],
      ['Connecta el teu ERP', 'Odoo, Salesforce o un webhook rep cada ordre confirmada.'],
      ['Mostra la teva flota real', 'Les posicions del teu gestor de flota substitueixen els vehicles simulats.'],
    ] },
    imports: { name: 'Seguiment d’importacions', cta: 'Crear el meu seguiment', steps: [
      ['Digues on va la mercaderia', 'La teva empresa, el teu agent, el teu magatzem i el centre de l’agent.'],
      ['Tria la ruta', 'Ports, aeroports i terminals de tren entre la Xina i Europa.'],
      ['Carrega proveïdors i comandes', 'Des d’un full: comanda, proveïdor, unitats, preu, HS, mode i dates.'],
      ['Fes servir les teves dates reals', 'Avui és avui: què arriba tard, quant, i la nova arribada.'],
      ['Afegeix els avisos de l’agent', 'Un CSV o una URL amb comanda, estat, data i posició.'],
    ] },
    howTitle: 'Com es fa',
    faq: [
      ['És gratis?', 'Sí. Funciona sencer al navegador, sense compte i sense instal·lar res.'],
      ['On es guarden les meves dades?', 'Al teu navegador. Pots exportar-les a un fitxer o compartir-les amb un enllaç que no passa per cap servidor. La clau de l’ERP no surt mai del navegador.'],
      ['Es connecta al meu ERP o a la meva flota?', 'Sí, des del navegador: Odoo, Salesforce o un webhook, i JSON o WebSocket per a la flota. El teu sistema ha de permetre aquest web (CORS).'],
      ['L’eina és en català?', 'La interfície és en anglès; llegeix fulls separats per coma o punt i coma.'],
    ],
  },
  zh: {
    slug: 'twin-builder',
    title: '数字孪生构建器：免费创建 AGV 仓库或进口追踪',
    description: '在浏览器中创建你自己的数字孪生：根据你的布局和产品生成 AGV 仓库，或根据采购订单表格生成进口追踪地图。免费，无需安装。',
    keywords: '创建数字孪生, 数字孪生构建器, 免费数字孪生, 仓库仿真, AGV 仿真, 仓库数字孪生, 进口追踪, 采购订单追踪, 到岸成本',
    badge: '免费 · 浏览器内运行 · 无需安装',
    h1: ['创建你自己的', '数字孪生'], lead: '根据你的布局和产品生成 AGV 仓库，或根据你的订单生成进口地图。全部在浏览器中运行，不上传任何内容。',
    agv: { name: 'AGV 仓库', cta: '创建我的仓库', steps: [
      ['设置厂房', '巷道、货位、层数、出入库月台和车辆数量。'],
      ['导入产品', '从 Excel 粘贴或上传 CSV：编码、名称、箱数和重量。'],
      ['填写客户', '客户、城市、承运商（可设一家加急）和供应商。'],
      ['连接 ERP', 'Odoo、Salesforce 或任意 webhook 接收每条已确认的任务。'],
      ['显示真实车队', '车队管理系统的位置会替换模拟车辆。'],
    ] },
    imports: { name: '进口追踪', cta: '创建我的追踪', steps: [
      ['设置目的地', '你的公司、采购代理、仓库和代理中心。'],
      ['选择路线', '中国与欧洲之间的港口、机场和铁路站。'],
      ['导入供应商和订单', '从表格导入：订单号、供应商、数量、价格、HS、运输方式和日期。'],
      ['使用真实日期', '以今天为准：哪些延误、延误多久、新的到达日期。'],
      ['加入代理更新', '包含订单、状态、日期和位置的 CSV 或 URL。'],
    ] },
    howTitle: '操作步骤',
    faq: [
      ['免费吗？', '免费。完全在浏览器中运行，无需账号和安装。'],
      ['我的数据存在哪里？', '存在你的浏览器里。可导出为文件，或通过不经过任何服务器的链接分享。ERP 密钥永远不会离开浏览器。'],
      ['能连接我的 ERP 或车队吗？', '可以，直接从浏览器调用：Odoo、Salesforce 或 webhook，车队用 JSON 或 WebSocket。你的系统需允许本网站访问（CORS）。'],
      ['工具有中文界面吗？', '界面为英文；可读取逗号或分号分隔的表格。'],
    ],
  },
  ja: {
    slug: 'twin-builder',
    title: 'デジタルツイン作成ツール：AGV倉庫と輸入追跡を無料で',
    description: 'ブラウザで自分のデジタルツインを作成。自社のレイアウトと商品から AGV 倉庫を、発注表から輸入追跡マップを作れます。無料、インストール不要。',
    keywords: 'デジタルツイン 作成, デジタルツイン 無料, 倉庫 シミュレーション, AGV シミュレーション, 倉庫 デジタルツイン, 輸入 追跡, 発注 追跡, 輸入原価',
    badge: '無料 · ブラウザで動作 · インストール不要',
    h1: ['自分だけの', 'デジタルツインを作る'], lead: '自社のレイアウトと商品から AGV 倉庫を、発注データから輸入マップを作成。すべてブラウザ内で動作し、何もアップロードしません。',
    agv: { name: 'AGV 倉庫', cta: '倉庫を作る', steps: [
      ['建物を設定', '通路、ベイ、段数、入出荷ドック、車両台数。'],
      ['商品を読み込む', 'Excel から貼り付けるか CSV を読み込み：コード、名称、ケース数、重量。'],
      ['取引先を設定', '顧客、都市、運送会社（1 社を特急に）、仕入先。'],
      ['ERP と連携', 'Odoo、Salesforce、または任意の Webhook に確定作業を送信。'],
      ['実際の車両を表示', '車両管理システムの位置がシミュレーション車両に置き換わります。'],
    ] },
    imports: { name: '輸入トラッカー', cta: 'トラッカーを作る', steps: [
      ['届け先を設定', '会社、買付代行、倉庫、代行業者の拠点。'],
      ['ルートを選ぶ', '中国と欧州の間の港、空港、鉄道ターミナル。'],
      ['仕入先と発注を読み込む', '表から：発注番号、仕入先、数量、単価、HS、輸送手段、日付。'],
      ['実際の日付を使う', '今日を基準に、遅れている注文、遅れ日数、新しい到着日を表示。'],
      ['代行業者の更新を追加', '注文、状況、日付、位置を含む CSV または URL。'],
    ] },
    howTitle: '作り方',
    faq: [
      ['無料ですか？', 'はい。ブラウザだけで動作し、アカウントもインストールも不要です。'],
      ['データはどこに保存されますか？', 'ブラウザ内です。ファイルに書き出すか、サーバーを経由しないリンクで共有できます。ERP のキーはブラウザの外に出ません。'],
      ['ERP や車両管理と連携できますか？', 'はい、ブラウザから直接：Odoo、Salesforce、Webhook、車両は JSON か WebSocket。お使いのシステムがこのサイトからのアクセスを許可している必要があります（CORS）。'],
      ['日本語で使えますか？', '画面は英語です。カンマ区切り・セミコロン区切りの表を読み込めます。'],
    ],
  },
  th: {
    slug: 'twin-builder',
    title: 'สร้างดิจิทัลทวิน: คลังสินค้า AGV หรือติดตามสินค้านำเข้า',
    description: 'สร้างดิจิทัลทวินของคุณเองในเบราว์เซอร์: คลังสินค้า AGV จากผังและสินค้าของคุณ หรือแผนที่ติดตามสินค้านำเข้าจากไฟล์คำสั่งซื้อ ฟรี ไม่ต้องติดตั้ง',
    keywords: 'สร้างดิจิทัลทวิน, ดิจิทัลทวินฟรี, จำลองคลังสินค้า, จำลอง AGV, ดิจิทัลทวินคลังสินค้า, ติดตามสินค้านำเข้า, ติดตามใบสั่งซื้อ, ต้นทุนนำเข้า',
    badge: 'ฟรี · ในเบราว์เซอร์ · ไม่ต้องติดตั้ง',
    h1: ['สร้างดิจิทัลทวิน', 'ของคุณเอง'], lead: 'คลังสินค้า AGV จากผังและสินค้าของคุณ หรือแผนที่สินค้านำเข้าจากคำสั่งซื้อของคุณ ทุกอย่างทำงานในเบราว์เซอร์ ไม่มีการอัปโหลด',
    agv: { name: 'คลังสินค้า AGV', cta: 'สร้างคลังสินค้าของฉัน', steps: [
      ['กำหนดอาคาร', 'ทางเดิน ช่องวาง ชั้น ท่าโหลดเข้าและออก และจำนวนรถ'],
      ['นำเข้าสินค้า', 'วางจาก Excel หรืออัปโหลด CSV: รหัส ชื่อ จำนวนกล่อง และน้ำหนัก'],
      ['ระบุลูกค้า', 'ลูกค้า เมือง ผู้ขนส่ง (กำหนดด่วนได้หนึ่งราย) และซัพพลายเออร์'],
      ['เชื่อม ERP', 'Odoo, Salesforce หรือ webhook รับทุกงานที่ยืนยันแล้ว'],
      ['แสดงฝูงรถจริง', 'ตำแหน่งจากระบบจัดการฝูงรถแทนรถที่จำลอง'],
    ] },
    imports: { name: 'ติดตามสินค้านำเข้า', cta: 'สร้างระบบติดตามของฉัน', steps: [
      ['ระบุปลายทาง', 'บริษัท ตัวแทนจัดซื้อ คลังสินค้า และศูนย์ของตัวแทน'],
      ['เลือกเส้นทาง', 'ท่าเรือ สนามบิน และสถานีรถไฟระหว่างจีนกับยุโรป'],
      ['นำเข้าซัพพลายเออร์และคำสั่งซื้อ', 'จากสเปรดชีต: เลขที่ ซัพพลายเออร์ จำนวน ราคา HS วิธีขนส่ง และวันที่'],
      ['ใช้วันที่จริง', 'ยึดวันนี้: อะไรล่าช้า ช้าเท่าไร และวันถึงใหม่'],
      ['เพิ่มอัปเดตจากตัวแทน', 'CSV หรือ URL ที่มีคำสั่งซื้อ สถานะ วันที่ และตำแหน่ง'],
    ] },
    howTitle: 'วิธีทำ',
    faq: [
      ['ใช้ฟรีไหม', 'ฟรี ทำงานในเบราว์เซอร์ทั้งหมด ไม่ต้องมีบัญชีและไม่ต้องติดตั้ง'],
      ['ข้อมูลของฉันเก็บไว้ที่ไหน', 'ในเบราว์เซอร์ของคุณ ส่งออกเป็นไฟล์หรือแชร์ด้วยลิงก์ที่ไม่ผ่านเซิร์ฟเวอร์ใด คีย์ ERP ไม่ออกจากเบราว์เซอร์'],
      ['เชื่อม ERP หรือฝูงรถของฉันได้ไหม', 'ได้ จากเบราว์เซอร์โดยตรง: Odoo, Salesforce หรือ webhook และ JSON หรือ WebSocket สำหรับฝูงรถ ระบบของคุณต้องอนุญาตเว็บนี้ (CORS)'],
      ['มีภาษาไทยไหม', 'หน้าจอเป็นภาษาอังกฤษ อ่านสเปรดชีตที่คั่นด้วยจุลภาคหรืออัฒภาคได้'],
    ],
  },
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const jsonEsc = (s: string) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

/** Every language's URL for the builder, English (the app's own shell) first. */
export const BUILDER_PATHS: { lang: string; path: string }[] = [
  { lang: 'en', path: APP },
  ...Object.entries(COPY).map(([lang, c]) => ({ lang, path: `/${lang}/${c.slug}/` })),
]

export function builderHreflangs(indent: string, tag: 'link' | 'xhtml:link' = 'link'): string {
  return [...BUILDER_PATHS.map((p) => `${indent}<${tag} rel="alternate" hreflang="${p.lang}" href="${SITE}${p.path}" />`),
    `${indent}<${tag} rel="alternate" hreflang="x-default" href="${SITE}${APP}" />`].join('\n')
}

function render(lang: string, c: BuilderCopy): string {
  const L = LANGS.find((x) => x.lang === lang)!
  const u = L.ui
  const url = `${SITE}/${lang}/${c.slug}/`
  const hero = `${SITE}/demos/agv-warehouse-digital-twin.jpg`
  const shot = (stem: string, alt: string) => `<img src="/demos/${stem}.jpg" srcset="/demos/${stem}-800.jpg 800w, /demos/${stem}.jpg 1600w" sizes="(max-width: 900px) 100vw, 420px" width="1600" height="900" alt="${esc(alt)}" loading="lazy" decoding="async" />`
  const group = (kind: 'agv' | 'imports', g: BuilderCopy['agv'], stem: string) => `
    <section class="section">
      <div class="container">
        <h2>${esc(g.name)}</h2>
        <figure class="shot">${shot(stem, L.images[stem].alt)}</figure>
        <ol class="steps">${g.steps.map(([h, t]) => `<li><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join('')}</ol>
        <p style="margin-top:18px"><a class="cta" href="${APP}?kind=${kind}">${esc(g.cta)} →</a></p>
      </div>
    </section>`
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: c.h1.join(' '), url, description: c.description, image: hero, inLanguage: lang,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      author: { '@type': 'Person', name: 'Joel Benítez', url: 'https://github.com/j03rul4nd' }, publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE } },
    ...(['agv', 'imports'] as const).map((k) => ({ '@context': 'https://schema.org', '@type': 'HowTo', name: c[k].name, inLanguage: lang, url: `${SITE}${APP}?kind=${k}`,
      step: c[k].steps.map(([h, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: h, text: t })) })),
    { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang, mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ]
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.title)}</title>
  <meta name="description" content="${esc(c.description)}" />
  <meta name="keywords" content="${esc(c.keywords)}" />
  <meta name="author" content="Joel Benítez" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
${builderHreflangs('  ')}
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(c.title)}" />
  <meta property="og:description" content="${esc(c.description)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:locale" content="${L.locale}" />
  <meta property="og:image" content="${hero}" />
  <meta property="og:image:width" content="1600" />
  <meta property="og:image:height" content="900" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(c.title)}" />
  <meta name="twitter:description" content="${esc(c.description)}" />
  <meta name="twitter:image" content="${hero}" />
  <link rel="stylesheet" href="/fonts.css" />
${ld.map((o) => `  <script type="application/ld+json">${jsonEsc(JSON.stringify(o))}</script>`).join('\n')}
  <style>
${STYLE}
    .steps { display: grid; gap: 12px; padding-left: 20px; margin-top: 18px; }
    .steps h3 { font-size: 15px; font-weight: 600; }
    .steps p { font-size: 14px; color: rgba(255,255,255,0.58); }
    .shot img { max-width: 100%; }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="/${lang}/" class="logo">IFC Viewer Online</a>
      <a href="${APP}" class="nav-cta">${esc(u.build)} →</a>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="container">
        <p class="badge">${esc(c.badge)}</p>
        <h1>${esc(c.h1[0])} <br><span class="accent">${esc(c.h1[1])}</span></h1>
        <p class="lead">${esc(c.lead)}</p>
        <a href="${APP}?kind=agv" class="cta">${esc(c.agv.cta)} →</a>
        <a href="${APP}?kind=imports" class="cta2">${esc(c.imports.cta)} →</a>
      </div>
    </section>
    ${group('agv', c.agv, 'agv-warehouse-digital-twin')}
    ${group('imports', c.imports, 'china-import-tracker-map')}
    <section class="section">
      <div class="container">
        <h2>${esc(u.questions)}</h2>
        <div class="faq">
          ${c.faq.map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </section>
    <section class="end">
      <div class="container">
        <h2>${esc(u.wantTitle)}</h2>
        <p>${esc(u.wantText)}</p>
        <a href="/msp-global/#contact" class="cta">${esc(u.contact)} →</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <nav>
        <a href="/${lang}/">IFC Viewer Online</a>
        <a href="${pathOf(L, 'agv-digital-twin')}">${esc(L.pages['agv-digital-twin'].h1[0])}</a>
        <a href="${pathOf(L, 'china-import-tracker')}">${esc(L.pages['china-import-tracker'].h1[0])}</a>
        <a href="${pathOf(L, 'digital-twin-examples')}">${esc(L.pages['digital-twin-examples'].h1[0])}</a>
        <a href="/msp-global/">${esc(u.allDemos)}</a>
      </nav>
      <nav>${BUILDER_PATHS.map((p) => `<a href="${p.path}" hreflang="${p.lang}" lang="${p.lang}">${p.lang.toUpperCase()}</a>`).join(' ')}</nav>
      <p>${esc(u.rights)}</p>
    </div>
  </footer>
</body>
</html>
`
}

export function sitemapBlock(lastmod: string): string {
  return BUILDER_PATHS.map((p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${p.lang === 'en' ? '0.8' : '0.7'}</priority>
${builderHreflangs('    ', 'xhtml:link')}
    <image:image><image:loc>${SITE}/demos/agv-warehouse-digital-twin.jpg</image:loc></image:image>
    <image:image><image:loc>${SITE}/demos/china-import-tracker-map.jpg</image:loc></image:image>
  </url>`).join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void IMAGES
  for (const [lang, c] of Object.entries(COPY)) {
    const dir = path.join(ROOT, 'public', lang, c.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), render(lang, c))
    console.log(`  ✓ /${lang}/${c.slug}/`)
  }
  const sm = path.join(ROOT, 'public/sitemap.xml')
  let xml = readFileSync(sm, 'utf-8')
  // the hand-written English entry is replaced by the generated cluster
  xml = xml.replace(/  <!-- Digital twin builder \(AGV warehouse, import tracker\) -->\n  <url>[\s\S]*?<\/url>\n\n/, '')
  const block = `  <!-- twin-builder-i18n:start (scripts/seo/build-twin-builder-landings.ts) -->\n${sitemapBlock(new Date().toISOString().slice(0, 10))}\n  <!-- twin-builder-i18n:end -->\n`
  const re = /  <!-- twin-builder-i18n:start[\s\S]*?<!-- twin-builder-i18n:end -->\n/
  xml = re.test(xml) ? xml.replace(re, block) : xml.replace('</urlset>', `${block}\n</urlset>`)
  writeFileSync(sm, xml)
}
