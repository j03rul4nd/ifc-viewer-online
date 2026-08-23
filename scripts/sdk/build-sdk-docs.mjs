// Generates the localized IFC Viewer SDK docs/demo pages into public/sdk/.
//   en  → public/sdk/index.html
//   xx  → public/sdk/<xx>/index.html   (es, de, fr, pt, it, ca, zh, ja, th)
//
// Best-in-class, dependency-free, single static page per locale. Everything
// (tabs, copy buttons, scroll-spy, theme toggle) is hand-rolled vanilla JS and
// syntax highlighting is done here at build time — so the page stays tiny,
// crawlable, self-hostable, and dogfoods the real SDK in a live demo.
//
//   node scripts/sdk/build-sdk-docs.mjs   (also runs as part of `npm run build:sdk`)

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'public/sdk')
const HOSTED = 'https://www.ifcvieweronline.eu/sdk/ifc-viewer.es.js'

// Single-source the version from the runtime so the badge can never drift.
let VERSION = '1.6.0'
try {
  const src = readFileSync(resolve(ROOT, 'src/sdk/ifc-viewer-sdk.ts'), 'utf8')
  const m = src.match(/SDK_VERSION\s*=\s*'([^']+)'/)
  if (m) VERSION = m[1]
} catch { /* keep fallback */ }

const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const LANG_LABEL = {
  en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português',
  it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ไทย',
}

// ── Translations (existing, fully localized) ──────────────────────────────────
const T = {
  en: {
    title: 'IFC Viewer SDK — embed the viewer in your CDE or app',
    desc: 'Drop the IFC viewer into your CDE, digital twin, or internal tools. Load IFC bytes from your own app — parsing stays in the browser. No upload backend.',
    h1: 'Embed the IFC viewer in your own product',
    lede: 'Insert the same browser viewer into your CDE, digital twin, or internal project tools. Load IFC data straight from your app while every model is parsed on the client.',
    b1: 'No upload backend required', b2: 'Runs directly in the browser', b3: 'Ready for IFC, BCF & IDS',
    quickStart: 'Quick start',
    quickNote: 'The SDK auto-discovers the app URL relative to this script, so self-hosting just works.',
    demo: 'Live demo', demoNote: 'This page is running the SDK. Click a control to fetch a sample IFC and drive the viewer — each button shows the call it makes.',
    btnLoad: 'Load sample IFC', btnIsolate: 'Isolate walls', btnTop: 'Top view', btnFit: 'Fit', btnReset: 'Reset camera', btnClear: 'Clear',
    stIdle: 'idle', stReady: 'ready — click “Load sample IFC”', stFetching: 'fetching sample IFC…', stHanding: 'handing bytes to the viewer…', stCleared: 'cleared',
    api: 'API', colMethod: 'Method', colDesc: 'Description',
    construct: 'Mount into a CSS selector or element. See the options below.',
    add: 'Load IFC bytes (ArrayBuffer/Uint8Array) from your app. The buffer is transferred for a zero-copy hand-off.',
    addFromUrl: 'Load a public, CORS-enabled IFC URL.',
    select: 'Select and frame an element by IFC expressID.',
    isolate: 'Isolate a category (e.g. "IfcWall"); omit to clear.',
    setView: 'Fly to a camera view: iso, top, front, right, left, back, bottom.',
    fitReset: 'Frame the active model / reset the camera.',
    showAll: 'Restore full visibility (clear hidden + isolation).',
    setLanguage: 'Change the UI language at runtime.',
    clear: 'Remove all loaded models.',
    getLanguages: 'List the supported language codes (see IfcViewer.LANGUAGES for labels).',
    on: 'Subscribe to an event; returns an unsubscribe function.',
    dispose: 'Tear down the viewer and remove the iframe.',
    events: 'Events',
    evReady: 'Viewer mounted and ready.',
    evProgress: 'Load progress (download → parse → render).',
    evLoaded: 'A model finished loading.',
    evValidation: 'Validation finished — the Health Score.',
    evError: 'A load failed.',
    evPointPicked: 'A point was read off a scan. Carries the file\'s own coordinates, not the scene\'s.',
    evMapPicked: 'A building in the OpenStreetMap surroundings was clicked. Context, not model.',
    evSelected: 'The user picked an element.',
    privacy: "The model is fetched in the visitor's browser and parsed client-side with WebAssembly — nothing is uploaded to our servers.",
    langLabel: 'Language',
  },
  es: {
    title: 'IFC Viewer SDK — integra el visor en tu CDE o app',
    desc: 'Integra el visor IFC en tu CDE, gemelo digital o herramientas internas. Carga bytes IFC desde tu propia app — el parseo ocurre en el navegador. Sin backend de subida.',
    h1: 'Integra el visor IFC en tu propio producto',
    lede: 'Inserta el mismo visor del navegador en tu CDE, gemelo digital o herramientas internas de proyecto. Carga datos IFC desde tu app mientras cada modelo se parsea en el cliente.',
    b1: 'Sin backend de subida', b2: 'Se ejecuta directamente en el navegador', b3: 'Preparado para IFC, BCF e IDS',
    quickStart: 'Inicio rápido',
    quickNote: 'El SDK descubre la URL de la app de forma relativa a este script, así que el auto-alojamiento funciona sin más.',
    demo: 'Demo en vivo', demoNote: 'Esta página está ejecutando el SDK. Pulsa un control para descargar un IFC de ejemplo y manejar el visor — cada botón muestra la llamada que hace.',
    btnLoad: 'Cargar IFC de ejemplo', btnIsolate: 'Aislar muros', btnTop: 'Vista superior', btnFit: 'Encuadrar', btnReset: 'Reiniciar cámara', btnClear: 'Limpiar',
    stIdle: 'inactivo', stReady: 'listo — pulsa «Cargar IFC de ejemplo»', stFetching: 'descargando IFC de ejemplo…', stHanding: 'pasando bytes al visor…', stCleared: 'limpiado',
    api: 'API', colMethod: 'Método', colDesc: 'Descripción',
    construct: 'Monta en un selector CSS o elemento. Consulta las opciones abajo.',
    add: 'Carga bytes IFC (ArrayBuffer/Uint8Array) desde tu app. El buffer se transfiere para un traspaso sin copia.',
    addFromUrl: 'Carga una URL IFC pública con CORS habilitado.',
    select: 'Selecciona y encuadra un elemento por su expressID IFC.',
    isolate: 'Aísla una categoría (p. ej. "IfcWall"); omítelo para limpiar.',
    setView: 'Vuela a una vista de cámara: iso, top, front, right, left, back, bottom.',
    fitReset: 'Encuadra el modelo activo / reinicia la cámara.',
    showAll: 'Restaura toda la visibilidad (quita ocultos y aislamiento).',
    setLanguage: 'Cambia el idioma de la interfaz en tiempo de ejecución.',
    clear: 'Elimina todos los modelos cargados.',
    getLanguages: 'Lista los códigos de idioma soportados (ver IfcViewer.LANGUAGES para etiquetas).',
    on: 'Suscríbete a un evento; devuelve una función para desuscribir.',
    dispose: 'Desmonta el visor y elimina el iframe.',
    events: 'Eventos',
    evReady: 'Visor montado y listo.',
    evProgress: 'Progreso de carga (descarga → parseo → render).',
    evLoaded: 'Un modelo terminó de cargar.',
    evValidation: 'Validación terminada — el Health Score.',
    evError: 'Falló una carga.',
    evPointPicked: 'Se leyó un punto de un escaneo. Lleva las coordenadas del archivo, no las de la escena.',
    evMapPicked: 'Se pulsó un edificio del entorno de OpenStreetMap. Contexto, no modelo.',
    evSelected: 'El usuario seleccionó un elemento.',
    privacy: 'El modelo se descarga en el navegador del visitante y se parsea en el cliente con WebAssembly — no se sube nada a nuestros servidores.',
    langLabel: 'Idioma',
  },
  de: {
    title: 'IFC Viewer SDK — den Viewer in dein CDE oder deine App einbetten',
    desc: 'Binde den IFC-Viewer in dein CDE, deinen digitalen Zwilling oder interne Tools ein. Lade IFC-Bytes aus deiner App — das Parsen bleibt im Browser. Kein Upload-Backend.',
    h1: 'Binde den IFC-Viewer in dein eigenes Produkt ein',
    lede: 'Füge denselben Browser-Viewer in dein CDE, deinen digitalen Zwilling oder interne Projekt-Tools ein. Lade IFC-Daten direkt aus deiner App, während jedes Modell im Client geparst wird.',
    b1: 'Kein Upload-Backend nötig', b2: 'Läuft direkt im Browser', b3: 'Bereit für IFC, BCF & IDS',
    quickStart: 'Schnellstart',
    quickNote: 'Das SDK ermittelt die App-URL relativ zu diesem Skript — Self-Hosting funktioniert ohne Konfiguration.',
    demo: 'Live-Demo', demoNote: 'Diese Seite führt das SDK aus. Klicke einen Schalter, um ein Beispiel-IFC zu laden und den Viewer zu steuern — jeder Button zeigt den Aufruf, den er macht.',
    btnLoad: 'Beispiel-IFC laden', btnIsolate: 'Wände isolieren', btnTop: 'Draufsicht', btnFit: 'Einpassen', btnReset: 'Kamera zurücksetzen', btnClear: 'Leeren',
    stIdle: 'bereit', stReady: 'bereit — klicke „Beispiel-IFC laden“', stFetching: 'lade Beispiel-IFC…', stHanding: 'übergebe Bytes an den Viewer…', stCleared: 'geleert',
    api: 'API', colMethod: 'Methode', colDesc: 'Beschreibung',
    construct: 'In einen CSS-Selektor oder ein Element einhängen. Siehe die Optionen unten.',
    add: 'IFC-Bytes (ArrayBuffer/Uint8Array) aus deiner App laden. Der Buffer wird für eine kopierfreie Übergabe transferiert.',
    addFromUrl: 'Eine öffentliche, CORS-fähige IFC-URL laden.',
    select: 'Ein Element per IFC-expressID auswählen und einrahmen.',
    isolate: 'Eine Kategorie isolieren (z. B. "IfcWall"); ohne Wert zum Zurücksetzen.',
    setView: 'Zu einer Kameraansicht fliegen: iso, top, front, right, left, back, bottom.',
    fitReset: 'Aktives Modell einpassen / Kamera zurücksetzen.',
    showAll: 'Volle Sichtbarkeit wiederherstellen (Ausgeblendetes + Isolation aufheben).',
    setLanguage: 'Die UI-Sprache zur Laufzeit ändern.',
    clear: 'Alle geladenen Modelle entfernen.',
    getLanguages: 'Unterstützte Sprachcodes auflisten (Labels via IfcViewer.LANGUAGES).',
    on: 'Ein Event abonnieren; gibt eine Abmelde-Funktion zurück.',
    dispose: 'Den Viewer abbauen und das iframe entfernen.',
    events: 'Events',
    evReady: 'Viewer eingehängt und bereit.',
    evProgress: 'Ladefortschritt (Download → Parsen → Rendern).',
    evLoaded: 'Ein Modell wurde geladen.',
    evValidation: 'Validierung fertig — der Health Score.',
    evError: 'Ein Laden ist fehlgeschlagen.',
    evPointPicked: 'Ein Punkt wurde aus einem Scan gelesen — in den Koordinaten der Datei, nicht der Szene.',
    evMapPicked: 'Ein Gebäude der OpenStreetMap-Umgebung wurde angeklickt. Kontext, kein Modell.',
    evSelected: 'Der Nutzer hat ein Element gewählt.',
    privacy: 'Das Modell wird im Browser des Besuchers geladen und clientseitig mit WebAssembly geparst — nichts wird auf unsere Server hochgeladen.',
    langLabel: 'Sprache',
  },
  fr: {
    title: 'IFC Viewer SDK — intégrez le visualiseur dans votre CDE ou app',
    desc: "Intégrez le visualiseur IFC dans votre CDE, jumeau numérique ou outils internes. Chargez des octets IFC depuis votre app — l'analyse reste dans le navigateur. Aucun backend de téléversement.",
    h1: 'Intégrez le visualiseur IFC dans votre propre produit',
    lede: 'Insérez le même visualiseur navigateur dans votre CDE, jumeau numérique ou outils internes de projet. Chargez des données IFC depuis votre app, chaque modèle étant analysé côté client.',
    b1: 'Aucun backend de téléversement requis', b2: "S'exécute directement dans le navigateur", b3: 'Prêt pour IFC, BCF et IDS',
    quickStart: 'Démarrage rapide',
    quickNote: "Le SDK découvre l'URL de l'app relativement à ce script ; l'auto-hébergement fonctionne tel quel.",
    demo: 'Démo en direct', demoNote: 'Cette page exécute le SDK. Cliquez un contrôle pour charger un IFC d’exemple et piloter le visualiseur — chaque bouton affiche l’appel qu’il effectue.',
    btnLoad: 'Charger un IFC d’exemple', btnIsolate: 'Isoler les murs', btnTop: 'Vue de dessus', btnFit: 'Cadrer', btnReset: 'Réinitialiser la caméra', btnClear: 'Effacer',
    stIdle: 'inactif', stReady: 'prêt — cliquez « Charger un IFC d’exemple »', stFetching: 'téléchargement de l’IFC d’exemple…', stHanding: 'transfert des octets au visualiseur…', stCleared: 'effacé',
    api: 'API', colMethod: 'Méthode', colDesc: 'Description',
    construct: 'Monter dans un sélecteur CSS ou un élément. Voir les options ci-dessous.',
    add: 'Charger des octets IFC (ArrayBuffer/Uint8Array) depuis votre app. Le buffer est transféré pour un passage sans copie.',
    addFromUrl: 'Charger une URL IFC publique compatible CORS.',
    select: 'Sélectionner et cadrer un élément par son expressID IFC.',
    isolate: 'Isoler une catégorie (p. ex. "IfcWall") ; omettre pour réinitialiser.',
    setView: 'Voler vers une vue caméra : iso, top, front, right, left, back, bottom.',
    fitReset: 'Cadrer le modèle actif / réinitialiser la caméra.',
    showAll: 'Restaurer toute la visibilité (annuler masquage + isolation).',
    setLanguage: "Changer la langue de l'interface à l'exécution.",
    clear: 'Supprimer tous les modèles chargés.',
    getLanguages: 'Lister les codes de langue pris en charge (libellés via IfcViewer.LANGUAGES).',
    on: 'S’abonner à un événement ; renvoie une fonction de désabonnement.',
    dispose: 'Démonter le visualiseur et retirer l’iframe.',
    events: 'Événements',
    evReady: 'Visualiseur monté et prêt.',
    evProgress: 'Progression du chargement (téléchargement → analyse → rendu).',
    evLoaded: 'Un modèle a fini de charger.',
    evValidation: 'Validation terminée — le Health Score.',
    evError: 'Un chargement a échoué.',
    evPointPicked: 'Un point a été lu sur un scan, dans les coordonnées du fichier et non de la scène.',
    evMapPicked: 'Un bâtiment des environs OpenStreetMap a été cliqué. Du contexte, pas le modèle.',
    evSelected: "L'utilisateur a choisi un élément.",
    privacy: "Le modèle est récupéré dans le navigateur du visiteur et analysé côté client avec WebAssembly — rien n'est téléversé sur nos serveurs.",
    langLabel: 'Langue',
  },
  pt: {
    title: 'IFC Viewer SDK — incorpore o visualizador no seu CDE ou app',
    desc: 'Incorpore o visualizador IFC no seu CDE, gémeo digital ou ferramentas internas. Carregue bytes IFC da sua app — a análise fica no navegador. Sem backend de upload.',
    h1: 'Incorpore o visualizador IFC no seu próprio produto',
    lede: 'Insira o mesmo visualizador do navegador no seu CDE, gémeo digital ou ferramentas internas de projeto. Carregue dados IFC da sua app enquanto cada modelo é analisado no cliente.',
    b1: 'Sem backend de upload', b2: 'Executa diretamente no navegador', b3: 'Preparado para IFC, BCF e IDS',
    quickStart: 'Início rápido',
    quickNote: 'O SDK descobre o URL da app relativamente a este script, por isso o auto-alojamento funciona logo.',
    demo: 'Demo ao vivo', demoNote: 'Esta página está a executar o SDK. Clique num controlo para obter um IFC de exemplo e conduzir o visualizador — cada botão mostra a chamada que faz.',
    btnLoad: 'Carregar IFC de exemplo', btnIsolate: 'Isolar paredes', btnTop: 'Vista de topo', btnFit: 'Enquadrar', btnReset: 'Repor câmara', btnClear: 'Limpar',
    stIdle: 'inativo', stReady: 'pronto — clique «Carregar IFC de exemplo»', stFetching: 'a obter IFC de exemplo…', stHanding: 'a passar bytes ao visualizador…', stCleared: 'limpo',
    api: 'API', colMethod: 'Método', colDesc: 'Descrição',
    construct: 'Montar num seletor CSS ou elemento. Veja as opções abaixo.',
    add: 'Carregar bytes IFC (ArrayBuffer/Uint8Array) da sua app. O buffer é transferido para uma passagem sem cópia.',
    addFromUrl: 'Carregar um URL IFC público com CORS.',
    select: 'Selecionar e enquadrar um elemento pelo expressID IFC.',
    isolate: 'Isolar uma categoria (ex.: "IfcWall"); omitir para limpar.',
    setView: 'Voar para uma vista de câmara: iso, top, front, right, left, back, bottom.',
    fitReset: 'Enquadrar o modelo ativo / repor a câmara.',
    showAll: 'Restaurar toda a visibilidade (limpar ocultos + isolamento).',
    setLanguage: 'Mudar o idioma da interface em tempo de execução.',
    clear: 'Remover todos os modelos carregados.',
    getLanguages: 'Listar os códigos de idioma suportados (rótulos em IfcViewer.LANGUAGES).',
    on: 'Subscrever um evento; devolve uma função para cancelar.',
    dispose: 'Desmontar o visualizador e remover o iframe.',
    events: 'Eventos',
    evReady: 'Visualizador montado e pronto.',
    evProgress: 'Progresso do carregamento (download → análise → render).',
    evLoaded: 'Um modelo terminou de carregar.',
    evValidation: 'Validação concluída — o Health Score.',
    evError: 'Um carregamento falhou.',
    evPointPicked: 'Leu-se um ponto de um scan, nas coordenadas do ficheiro e não da cena.',
    evMapPicked: 'Clicou-se num edifício da envolvente OpenStreetMap. Contexto, não modelo.',
    evSelected: 'O utilizador escolheu um elemento.',
    privacy: 'O modelo é obtido no navegador do visitante e analisado no cliente com WebAssembly — nada é enviado para os nossos servidores.',
    langLabel: 'Idioma',
  },
  it: {
    title: 'IFC Viewer SDK — integra il viewer nel tuo CDE o app',
    desc: "Integra il viewer IFC nel tuo CDE, digital twin o strumenti interni. Carica byte IFC dalla tua app — il parsing resta nel browser. Nessun backend di upload.",
    h1: 'Integra il viewer IFC nel tuo prodotto',
    lede: "Inserisci lo stesso viewer del browser nel tuo CDE, digital twin o strumenti interni di progetto. Carica dati IFC dalla tua app mentre ogni modello viene analizzato nel client.",
    b1: 'Nessun backend di caricamento', b2: 'Funziona direttamente nel browser', b3: 'Pronto per IFC, BCF e IDS',
    quickStart: 'Avvio rapido',
    quickNote: "Il SDK individua l'URL dell'app rispetto a questo script, quindi l'auto-hosting funziona subito.",
    demo: 'Demo live', demoNote: 'Questa pagina sta eseguendo il SDK. Clicca un controllo per scaricare un IFC di esempio e guidare il viewer — ogni pulsante mostra la chiamata che effettua.',
    btnLoad: 'Carica IFC di esempio', btnIsolate: 'Isola i muri', btnTop: 'Vista dall’alto', btnFit: 'Inquadra', btnReset: 'Reimposta camera', btnClear: 'Pulisci',
    stIdle: 'inattivo', stReady: 'pronto — clicca «Carica IFC di esempio»', stFetching: 'scaricamento IFC di esempio…', stHanding: 'passaggio dei byte al viewer…', stCleared: 'pulito',
    api: 'API', colMethod: 'Metodo', colDesc: 'Descrizione',
    construct: 'Monta in un selettore CSS o elemento. Vedi le opzioni qui sotto.',
    add: "Carica byte IFC (ArrayBuffer/Uint8Array) dalla tua app. Il buffer viene trasferito per un passaggio senza copia.",
    addFromUrl: 'Carica un URL IFC pubblico con CORS.',
    select: "Seleziona e inquadra un elemento tramite l'expressID IFC.",
    isolate: 'Isola una categoria (es. "IfcWall"); ometti per azzerare.',
    setView: 'Vola a una vista camera: iso, top, front, right, left, back, bottom.',
    fitReset: 'Inquadra il modello attivo / reimposta la camera.',
    showAll: 'Ripristina la piena visibilità (rimuovi nascosti + isolamento).',
    setLanguage: "Cambia la lingua dell'interfaccia a runtime.",
    clear: 'Rimuovi tutti i modelli caricati.',
    getLanguages: 'Elenca i codici lingua supportati (etichette in IfcViewer.LANGUAGES).',
    on: 'Iscriviti a un evento; restituisce una funzione di annullamento.',
    dispose: "Smonta il viewer e rimuovi l'iframe.",
    events: 'Eventi',
    evReady: 'Viewer montato e pronto.',
    evProgress: 'Avanzamento del caricamento (download → parsing → render).',
    evLoaded: 'Un modello ha finito di caricare.',
    evValidation: 'Validazione completata — l’Health Score.',
    evError: 'Un caricamento è fallito.',
    evPointPicked: 'È stato letto un punto da una scansione, nelle coordinate del file e non della scena.',
    evMapPicked: 'È stato cliccato un edificio dei dintorni OpenStreetMap. Contesto, non modello.',
    evSelected: "L'utente ha scelto un elemento.",
    privacy: "Il modello viene scaricato nel browser del visitatore e analizzato lato client con WebAssembly — nulla viene caricato sui nostri server.",
    langLabel: 'Lingua',
  },
  ca: {
    title: 'IFC Viewer SDK — integra el visor al teu CDE o app',
    desc: "Integra el visor IFC al teu CDE, bessó digital o eines internes. Carrega bytes IFC des de la teva app — l'anàlisi es manté al navegador. Sense backend de pujada.",
    h1: 'Integra el visor IFC al teu propi producte',
    lede: "Insereix el mateix visor del navegador al teu CDE, bessó digital o eines internes de projecte. Carrega dades IFC des de la teva app mentre cada model s'analitza al client.",
    b1: 'Sense backend de pujada', b2: "S'executa directament al navegador", b3: 'Preparat per a IFC, BCF i IDS',
    quickStart: 'Inici ràpid',
    quickNote: "El SDK descobreix l'URL de l'app de manera relativa a aquest script, així que l'auto-allotjament funciona sol.",
    demo: 'Demo en directe', demoNote: 'Aquesta pàgina està executant el SDK. Fes clic en un control per baixar un IFC d’exemple i conduir el visor — cada botó mostra la crida que fa.',
    btnLoad: 'Carrega IFC d’exemple', btnIsolate: 'Aïlla murs', btnTop: 'Vista superior', btnFit: 'Enquadra', btnReset: 'Reinicia càmera', btnClear: 'Neteja',
    stIdle: 'inactiu', stReady: 'a punt — fes clic «Carrega IFC d’exemple»', stFetching: 'baixant IFC d’exemple…', stHanding: 'passant bytes al visor…', stCleared: 'netejat',
    api: 'API', colMethod: 'Mètode', colDesc: 'Descripció',
    construct: "Munta en un selector CSS o element. Consulta les opcions a sota.",
    add: "Carrega bytes IFC (ArrayBuffer/Uint8Array) des de la teva app. El buffer es transfereix per a un traspàs sense còpia.",
    addFromUrl: 'Carrega un URL IFC públic amb CORS.',
    select: "Selecciona i enquadra un element pel seu expressID IFC.",
    isolate: 'Aïlla una categoria (p. ex. "IfcWall"); omet-ho per netejar.',
    setView: 'Vola a una vista de càmera: iso, top, front, right, left, back, bottom.',
    fitReset: 'Enquadra el model actiu / reinicia la càmera.',
    showAll: 'Restaura tota la visibilitat (treu ocults + aïllament).',
    setLanguage: "Canvia l'idioma de la interfície en temps d'execució.",
    clear: 'Elimina tots els models carregats.',
    getLanguages: "Llista els codis d'idioma admesos (etiquetes a IfcViewer.LANGUAGES).",
    on: "Subscriu-te a un esdeveniment; retorna una funció per cancel·lar.",
    dispose: "Desmunta el visor i elimina l'iframe.",
    events: 'Esdeveniments',
    evReady: 'Visor muntat i a punt.',
    evProgress: 'Progrés de càrrega (baixada → anàlisi → render).',
    evLoaded: 'Un model ha acabat de carregar.',
    evValidation: 'Validació acabada — l’Health Score.',
    evError: 'Una càrrega ha fallat.',
    evPointPicked: 'S\'ha llegit un punt d\'un escaneig, en les coordenades del fitxer i no de l\'escena.',
    evMapPicked: 'S\'ha clicat un edifici de l\'entorn d\'OpenStreetMap. Context, no model.',
    evSelected: "L'usuari ha triat un element.",
    privacy: "El model es baixa al navegador del visitant i s'analitza al client amb WebAssembly — no es puja res als nostres servidors.",
    langLabel: 'Idioma',
  },
  zh: {
    title: 'IFC Viewer SDK — 将查看器嵌入您的 CDE 或应用',
    desc: '将 IFC 查看器嵌入您的 CDE、数字孪生或内部工具。从您自己的应用加载 IFC 字节——解析始终在浏览器中。无需上传后端。',
    h1: '将 IFC 查看器嵌入您自己的产品',
    lede: '将同样的浏览器查看器嵌入您的 CDE、数字孪生或内部项目工具。直接从您的应用加载 IFC 数据，每个模型都在客户端解析。',
    b1: '无需上传后端', b2: '直接在浏览器中运行', b3: '支持 IFC、BCF 和 IDS',
    quickStart: '快速开始',
    quickNote: 'SDK 会相对于此脚本自动发现应用 URL，因此自托管开箱即用。',
    demo: '在线演示', demoNote: '本页面正在运行该 SDK。点击控件以获取示例 IFC 并驱动查看器——每个按钮都会显示它所调用的方法。',
    btnLoad: '加载示例 IFC', btnIsolate: '隔离墙体', btnTop: '俯视图', btnFit: '适配', btnReset: '重置相机', btnClear: '清除',
    stIdle: '空闲', stReady: '就绪——点击“加载示例 IFC”', stFetching: '正在获取示例 IFC…', stHanding: '正在将字节交给查看器…', stCleared: '已清除',
    api: 'API', colMethod: '方法', colDesc: '说明',
    construct: '挂载到 CSS 选择器或元素。参见下方选项。',
    add: '从您的应用加载 IFC 字节（ArrayBuffer/Uint8Array）。缓冲区以零拷贝方式转移。',
    addFromUrl: '加载一个启用 CORS 的公开 IFC URL。',
    select: '通过 IFC expressID 选择并聚焦一个元素。',
    isolate: '隔离一个类别（如 "IfcWall"）；不传参则清除。',
    setView: '切换相机视角：iso、top、front、right、left、back、bottom。',
    fitReset: '适配当前模型 / 重置相机。',
    showAll: '恢复全部可见性（清除隐藏与隔离）。',
    setLanguage: '在运行时切换界面语言。',
    clear: '移除所有已加载的模型。',
    getLanguages: '列出支持的语言代码（标签见 IfcViewer.LANGUAGES）。',
    on: '订阅事件；返回取消订阅的函数。',
    dispose: '销毁查看器并移除 iframe。',
    events: '事件',
    evReady: '查看器已挂载并就绪。',
    evProgress: '加载进度（下载 → 解析 → 渲染）。',
    evLoaded: '某个模型加载完成。',
    evValidation: '校验完成——健康分。',
    evError: '一次加载失败。',
    evPointPicked: '从扫描数据中读取了一个点，使用文件自身坐标而非场景坐标。',
    evMapPicked: '点击了 OpenStreetMap 周边中的一栋建筑。仅为背景，不属于模型。',
    evSelected: '用户选中了一个元素。',
    privacy: '模型在访问者的浏览器中获取，并使用 WebAssembly 在客户端解析——不会上传到我们的服务器。',
    langLabel: '语言',
  },
  ja: {
    title: 'IFC Viewer SDK — ビューアを CDE やアプリに組み込む',
    desc: 'IFC ビューアを CDE、デジタルツイン、社内ツールに組み込みます。IFC バイトを自社アプリから読み込み、解析はブラウザ内で行います。アップロード用バックエンド不要。',
    h1: 'IFC ビューアを自社プロダクトに組み込む',
    lede: '同じブラウザビューアを CDE、デジタルツイン、社内のプロジェクトツールに組み込みます。各モデルはクライアント側で解析され、IFC データを自社アプリから直接読み込みます。',
    b1: 'アップロード用バックエンド不要', b2: 'ブラウザ上で直接動作', b3: 'IFC・BCF・IDS に対応',
    quickStart: 'クイックスタート',
    quickNote: 'SDK はこのスクリプトからの相対でアプリ URL を自動検出するため、セルフホストはそのまま動作します。',
    demo: 'ライブデモ', demoNote: 'このページは SDK を実行しています。コントロールをクリックするとサンプル IFC を取得してビューアを操作します — 各ボタンは呼び出すメソッドを表示します。',
    btnLoad: 'サンプル IFC を読み込む', btnIsolate: '壁を分離', btnTop: '上面ビュー', btnFit: 'フィット', btnReset: 'カメラをリセット', btnClear: 'クリア',
    stIdle: '待機中', stReady: '準備完了 — 「サンプル IFC を読み込む」をクリック', stFetching: 'サンプル IFC を取得中…', stHanding: 'バイトをビューアに渡しています…', stCleared: 'クリアしました',
    api: 'API', colMethod: 'メソッド', colDesc: '説明',
    construct: 'CSS セレクタまたは要素にマウント。下のオプションを参照。',
    add: '自社アプリから IFC バイト（ArrayBuffer/Uint8Array）を読み込みます。バッファはゼロコピーで転送されます。',
    addFromUrl: 'CORS 対応の公開 IFC URL を読み込みます。',
    select: 'IFC expressID で要素を選択してフレーミングします。',
    isolate: 'カテゴリを分離（例: "IfcWall"）。省略でクリア。',
    setView: 'カメラビューへ移動: iso, top, front, right, left, back, bottom。',
    fitReset: 'アクティブなモデルにフィット / カメラをリセット。',
    showAll: '表示を全復元（非表示・分離を解除）。',
    setLanguage: '実行時に UI 言語を変更します。',
    clear: '読み込み済みのモデルをすべて削除します。',
    getLanguages: '対応言語コードを列挙（ラベルは IfcViewer.LANGUAGES）。',
    on: 'イベントを購読。解除用の関数を返します。',
    dispose: 'ビューアを破棄して iframe を削除します。',
    events: 'イベント',
    evReady: 'ビューアがマウントされ準備完了。',
    evProgress: '読み込みの進捗（ダウンロード → 解析 → 描画）。',
    evLoaded: 'モデルの読み込みが完了。',
    evValidation: '検証完了 — ヘルススコア。',
    evError: '読み込みに失敗。',
    evPointPicked: 'スキャンから点を取得。シーンではなくファイル自身の座標です。',
    evMapPicked: 'OpenStreetMap の周辺建物をクリック。文脈であってモデルではありません。',
    evSelected: 'ユーザーが要素を選択。',
    privacy: 'モデルは訪問者のブラウザで取得され、WebAssembly によりクライアント側で解析されます — 当社サーバーには何もアップロードされません。',
    langLabel: '言語',
  },
  th: {
    title: 'IFC Viewer SDK — ฝังตัวแสดงผลลงใน CDE หรือแอปของคุณ',
    desc: 'ฝังตัวแสดงผล IFC ลงใน CDE ดิจิทัลทวิน หรือเครื่องมือภายใน โหลดไบต์ IFC จากแอปของคุณเอง โดยการแปลงอยู่ในเบราว์เซอร์ ไม่ต้องมีแบ็กเอนด์อัปโหลด',
    h1: 'ฝังตัวแสดงผล IFC ลงในผลิตภัณฑ์ของคุณเอง',
    lede: 'แทรกตัวแสดงผลบนเบราว์เซอร์เดียวกันลงใน CDE ดิจิทัลทวิน หรือเครื่องมือภายในของโครงการ โหลดข้อมูล IFC จากแอปของคุณ โดยแต่ละโมเดลถูกประมวลผลที่ฝั่งไคลเอนต์',
    b1: 'ไม่ต้องมีแบ็กเอนด์อัปโหลด', b2: 'ทำงานในเบราว์เซอร์โดยตรง', b3: 'พร้อมสำหรับ IFC, BCF และ IDS',
    quickStart: 'เริ่มต้นอย่างรวดเร็ว',
    quickNote: 'SDK จะค้นหา URL ของแอปโดยอ้างอิงจากสคริปต์นี้ ดังนั้นการโฮสต์เองจึงใช้งานได้ทันที',
    demo: 'เดโมสด', demoNote: 'หน้านี้กำลังรัน SDK คลิกปุ่มควบคุมเพื่อดึงไฟล์ IFC ตัวอย่างและสั่งงานตัวแสดงผล — แต่ละปุ่มจะแสดงเมธอดที่เรียกใช้',
    btnLoad: 'โหลด IFC ตัวอย่าง', btnIsolate: 'แยกผนัง', btnTop: 'มุมมองด้านบน', btnFit: 'พอดี', btnReset: 'รีเซ็ตกล้อง', btnClear: 'ล้าง',
    stIdle: 'ว่าง', stReady: 'พร้อม — คลิก “โหลด IFC ตัวอย่าง”', stFetching: 'กำลังดึง IFC ตัวอย่าง…', stHanding: 'กำลังส่งไบต์ไปยังตัวแสดงผล…', stCleared: 'ล้างแล้ว',
    api: 'API', colMethod: 'เมธอด', colDesc: 'คำอธิบาย',
    construct: 'ติดตั้งในตัวเลือก CSS หรืออิลิเมนต์ ดูออปชันด้านล่าง',
    add: 'โหลดไบต์ IFC (ArrayBuffer/Uint8Array) จากแอปของคุณ บัฟเฟอร์ถูกถ่ายโอนแบบไม่คัดลอก',
    addFromUrl: 'โหลด URL IFC สาธารณะที่เปิด CORS',
    select: 'เลือกและจัดเฟรมอิลิเมนต์ด้วย IFC expressID',
    isolate: 'แยกหมวดหมู่ (เช่น "IfcWall"); เว้นว่างเพื่อล้าง',
    setView: 'บินไปยังมุมกล้อง: iso, top, front, right, left, back, bottom',
    fitReset: 'จัดเฟรมโมเดลที่ใช้งาน / รีเซ็ตกล้อง',
    showAll: 'คืนการมองเห็นทั้งหมด (ล้างที่ซ่อน + การแยก)',
    setLanguage: 'เปลี่ยนภาษาอินเทอร์เฟซขณะทำงาน',
    clear: 'ลบโมเดลที่โหลดไว้ทั้งหมด',
    getLanguages: 'แสดงรายการรหัสภาษาที่รองรับ (ป้ายกำกับดูที่ IfcViewer.LANGUAGES)',
    on: 'สมัครรับอีเวนต์ คืนค่าฟังก์ชันสำหรับยกเลิก',
    dispose: 'รื้อตัวแสดงผลและลบ iframe',
    events: 'อีเวนต์',
    evReady: 'ตัวแสดงผลติดตั้งและพร้อม',
    evProgress: 'ความคืบหน้าการโหลด (ดาวน์โหลด → แปลง → เรนเดอร์)',
    evLoaded: 'โมเดลโหลดเสร็จแล้ว',
    evValidation: 'ตรวจสอบเสร็จ — Health Score',
    evError: 'การโหลดล้มเหลว',
    evPointPicked: 'อ่านค่าจุดจากข้อมูลสแกน โดยใช้พิกัดของไฟล์ ไม่ใช่ของฉาก',
    evMapPicked: 'คลิกอาคารในสภาพแวดล้อมจาก OpenStreetMap เป็นบริบท ไม่ใช่โมเดล',
    evSelected: 'ผู้ใช้เลือกอิลิเมนต์',
    privacy: 'โมเดลถูกดึงในเบราว์เซอร์ของผู้เข้าชมและแปลงที่ฝั่งไคลเอนต์ด้วย WebAssembly — ไม่มีการอัปโหลดไปยังเซิร์ฟเวอร์ของเรา',
    langLabel: 'ภาษา',
  },
}

// Data/query method descriptions, merged into T (localized where provided).
const EXTRA = {
  en: { grpPanels: "Panels", panelOpen: "Open a tool panel, or pass null to close whatever is open. A panel that is not available — the chrome hides it, or nothing is loaded for it to act on — is a no-op, not an error.", panelList: "Which panel is open, and which are on offer right now. A tool missing from `available` cannot be opened; it is not merely disabled.", panelScope: "Limit the rail to these panels, at runtime. Same vocabulary as the `panels=` URL parameter and it outranks it. Narrows what the viewer offers and never adds; an empty array means no rail.", pcAdd: "Load a scan from bytes — LAS, LAZ, COPC, PLY, PCD or text. The buffer is transferred, not copied. Resolves with the cloud id.", pcAddUrl: "Load a scan the viewer fetches itself. The URL must allow CORS.", pcList: "Every loaded scan. `pointCount` is what is resident; `declaredCount` is what the file holds — they differ when the budget truncated the parse.", pcRemove: "Unload one scan and free its GPU buffers, or unload them all.", pcVisible: "Show or hide a scan without unloading it.", pcFit: "Frame the camera on a scan, or on the first one loaded.", pcDisplay: "Point size, opacity, colour mode, density, confidence cut-off — shared by every scan. Each is a shader uniform, so it is instant on 20 million points.", pcInspect: "Arm click-to-read. While armed, clicking a point emits `pointcloud-picked` with the coordinates IN THE FILE alongside the scene ones.", pcPlacement: "Nudge a scan by hand: position, yaw, levelling, scale. Partial and clamped; sits on top of the derived alignment rather than replacing it.", pcUpAxis: "Correct which axis the scan treats as up. PLY, PCD and text declare no orientation, so the viewer infers it — check `upAxisSource` before trusting it.", meshAdd: "Import a model from bytes. Takes a LIST: a .gltf needs its .bin and textures, an .obj its .mtl — send the entry file alone and you get grey geometry.", meshAddUrl: "Import a model the viewer fetches. Pass every URL it needs; they are fetched in parallel and all must allow CORS.", meshList: "Every imported model, with its triangle and texture counts. Read `unitSource` and `upAxisSource` before trusting the values beside them.", meshRemove: "Remove an import and free its geometry, materials and textures, or remove them all.", meshVisible: "Show or hide an import without unloading it.", meshFit: "Frame the camera on an import, or on all of them.", meshPlacement: "Place an import by hand: position, yaw, levelling, scale. Partial and clamped. Imports start centred on the IFC, sitting on its floor.", meshUpAxis: "Correct the source's vertical axis. Only meaningful for OBJ — glTF's specification mandates Y-up, so it reports `upAxisSource: 'declared'`.", meshUnit: "Correct the source unit: 1 metres, 0.01 centimetres, 0.001 millimetres, 0.3048 feet. None of these formats records one, so the viewer infers it from the model's size.", getModels: 'List the loaded models. Returns a promise.', getElement: 'Fetch an element’s IFC data (attributes + property/quantity sets). Returns a promise.', getValidation: 'Fetch the current validation summary (Health Score + counts). Returns a promise.', getStats: 'Per-category element counts per model — for dashboard charts. Returns a promise.', getIssues: 'Validation issues for a table (filter by severity / limit). Returns a promise.', checkIds: 'Check the model against a buildingSMART IDS (.ids XML). Runs in a worker. Returns pass/fail per spec.', checkEir: 'Check the model against an EIR / BIM Validation profile (object or JSON, incl. the compact shorthand). Compiles to IDS and runs on the same engine — same IdsResult shape as checkIds.', screenshot: 'Capture the current 3D view as a PNG data URL. Returns a promise.', removeModel: 'Unload a model by id.', hideShow: 'Hide / show a set of elements by expressID.', setCamera: 'Place the camera at a position looking along a direction.', wc: 'Or, zero-JS — drop the tag:' },
  es: { grpPanels: "Paneles", panelOpen: "Abre un panel de herramienta, o pasa null para cerrar el que esté abierto. Un panel no disponible — porque el chrome lo oculta o no hay nada cargado sobre lo que actuar — no hace nada, y no es un error.", panelList: "Qué panel está abierto y cuáles se ofrecen ahora mismo. Una herramienta que no aparece en `available` no se puede abrir; no está simplemente deshabilitada.", panelScope: "Limita el raíl a estos paneles, en tiempo de ejecución. Mismo vocabulario que el parámetro de URL `panels=` y tiene prioridad sobre él. Restringe lo que el visor ofrece y nunca añade; un array vacío significa sin raíl.", pcAdd: "Carga un escaneo desde bytes — LAS, LAZ, COPC, PLY, PCD o texto. El búfer se transfiere, no se copia. Resuelve con el id de la nube.", pcAddUrl: "Carga un escaneo que descarga el propio visor. La URL debe permitir CORS.", pcList: "Todos los escaneos cargados. `pointCount` es lo residente; `declaredCount` es lo que contiene el archivo — difieren cuando el presupuesto truncó el análisis.", pcRemove: "Descarga un escaneo y libera sus búferes de GPU, o descárgalos todos.", pcVisible: "Muestra u oculta un escaneo sin descargarlo.", pcFit: "Encuadra la cámara en un escaneo, o en el primero cargado.", pcDisplay: "Tamaño de punto, opacidad, modo de color, densidad, umbral de confianza — compartidos por todos los escaneos. Cada uno es un uniform del shader, así que es instantáneo con 20 millones de puntos.", pcInspect: "Arma el clic para leer. Mientras está armado, clicar un punto emite `pointcloud-picked` con las coordenadas DEL ARCHIVO junto a las de la escena.", pcPlacement: "Ajusta un escaneo a mano: posición, giro, nivelación, escala. Parcial y acotado; se aplica sobre la alineación deducida en vez de sustituirla.", pcUpAxis: "Corrige qué eje considera vertical el escaneo. PLY, PCD y texto no declaran orientación, así que el visor la deduce — comprueba `upAxisSource` antes de fiarte.", meshAdd: "Importa un modelo desde bytes. Toma una LISTA: un .gltf necesita su .bin y sus texturas, un .obj su .mtl — si mandas solo el archivo de entrada obtienes geometría gris.", meshAddUrl: "Importa un modelo que descarga el visor. Pasa todas las URL que necesita; se descargan en paralelo y todas deben permitir CORS.", meshList: "Todos los modelos importados, con sus recuentos de triángulos y texturas. Lee `unitSource` y `upAxisSource` antes de fiarte de los valores contiguos.", meshRemove: "Elimina una importación y libera su geometría, materiales y texturas, o elimínalas todas.", meshVisible: "Muestra u oculta una importación sin descargarla.", meshFit: "Encuadra la cámara en una importación, o en todas.", meshPlacement: "Coloca una importación a mano: posición, giro, nivelación, escala. Parcial y acotado. Las importaciones empiezan centradas sobre el IFC y apoyadas en su suelo.", meshUpAxis: "Corrige el eje vertical del origen. Solo tiene sentido en OBJ — la especificación de glTF obliga Y arriba, así que informa `upAxisSource: 'declared'`.", meshUnit: "Corrige la unidad de origen: 1 metros, 0,01 centímetros, 0,001 milímetros, 0,3048 pies. Ninguno de estos formatos la registra, así que el visor la deduce del tamaño del modelo.", getModels: 'Lista los modelos cargados. Devuelve una promesa.', getElement: 'Obtiene los datos IFC de un elemento (atributos + property/quantity sets). Devuelve una promesa.', getValidation: 'Obtiene el resumen de validación (Health Score + conteos). Devuelve una promesa.', getStats: 'Conteo de elementos por categoría y modelo — para gráficos de dashboard. Devuelve una promesa.', getIssues: 'Incidencias de validación para una tabla (filtra por severidad / límite). Devuelve una promesa.', checkIds: 'Comprueba el modelo contra un IDS de buildingSMART (.ids XML). Se ejecuta en un worker. Devuelve pass/fail por spec.', checkEir: 'Comprueba el modelo contra un perfil de validación EIR / BIM (objeto o JSON, incl. el formato compacto). Compila a IDS y usa el mismo motor — mismo IdsResult que checkIds.', screenshot: 'Captura la vista 3D actual como data URL PNG. Devuelve una promesa.', removeModel: 'Descarga un modelo por id.', hideShow: 'Oculta / muestra un conjunto de elementos por expressID.', setCamera: 'Coloca la cámara en una posición mirando en una dirección.', wc: 'O, sin JS — usa la etiqueta:' },
  de: { grpPanels: "Panels", panelOpen: "Öffnet ein Werkzeug-Panel, oder null, um das geöffnete zu schließen. Ein nicht verfügbares Panel — vom Chrome ausgeblendet oder ohne geladene Daten — bleibt wirkungslos und ist kein Fehler.", panelList: "Welches Panel offen ist und welche gerade angeboten werden. Ein Werkzeug, das in `available` fehlt, lässt sich nicht öffnen; es ist nicht bloß deaktiviert.", panelScope: "Beschränkt die Leiste zur Laufzeit auf diese Panels. Gleiches Vokabular wie der URL-Parameter `panels=` und hat Vorrang davor. Schränkt das Angebot ein und erweitert es nie; ein leeres Array bedeutet keine Leiste.", pcAdd: "Lädt einen Scan aus Bytes — LAS, LAZ, COPC, PLY, PCD oder Text. Der Puffer wird übertragen, nicht kopiert. Liefert die Cloud-ID.", pcAddUrl: "Lädt einen Scan, den der Viewer selbst abruft. Die URL muss CORS erlauben.", pcList: "Alle geladenen Scans. `pointCount` ist das Residente, `declaredCount` das, was die Datei enthält — sie unterscheiden sich, wenn das Budget den Parse abgeschnitten hat.", pcRemove: "Entlädt einen Scan und gibt seine GPU-Puffer frei, oder entlädt alle.", pcVisible: "Blendet einen Scan ein oder aus, ohne ihn zu entladen.", pcFit: "Rahmt die Kamera auf einen Scan, oder auf den zuerst geladenen.", pcDisplay: "Punktgröße, Deckkraft, Farbmodus, Dichte, Konfidenzschwelle — für alle Scans gemeinsam. Jedes ist ein Shader-Uniform und damit auch bei 20 Millionen Punkten sofort wirksam.", pcInspect: "Aktiviert Klick-zum-Auslesen. Ein Klick auf einen Punkt sendet dann `pointcloud-picked` mit den Koordinaten AUS DER DATEI neben denen der Szene.", pcPlacement: "Verschiebt einen Scan von Hand: Position, Gierung, Nivellierung, Maßstab. Partiell und begrenzt; wirkt auf die ermittelte Ausrichtung, ohne sie zu ersetzen.", pcUpAxis: "Korrigiert, welche Achse der Scan als oben behandelt. PLY, PCD und Text geben keine Orientierung an, der Viewer leitet sie ab — prüfen Sie `upAxisSource`.", meshAdd: "Importiert ein Modell aus Bytes. Erwartet eine LISTE: eine .gltf braucht ihre .bin und Texturen, eine .obj ihre .mtl — allein ergibt die Eingabedatei graue Geometrie.", meshAddUrl: "Importiert ein Modell, das der Viewer abruft. Übergeben Sie alle nötigen URLs; sie werden parallel geladen und müssen alle CORS erlauben.", meshList: "Alle importierten Modelle mit Dreiecks- und Texturzahlen. Lesen Sie `unitSource` und `upAxisSource`, bevor Sie den Werten daneben trauen.", meshRemove: "Entfernt einen Import und gibt Geometrie, Materialien und Texturen frei, oder entfernt alle.", meshVisible: "Blendet einen Import ein oder aus, ohne ihn zu entladen.", meshFit: "Rahmt die Kamera auf einen Import, oder auf alle.", meshPlacement: "Platziert einen Import von Hand: Position, Gierung, Nivellierung, Maßstab. Partiell und begrenzt. Importe starten mittig über dem IFC, auf dessen Boden.", meshUpAxis: "Korrigiert die Hochachse der Quelle. Nur bei OBJ sinnvoll — die glTF-Spezifikation schreibt Y oben vor, daher meldet sie `upAxisSource: 'declared'`.", meshUnit: "Korrigiert die Quelleinheit: 1 Meter, 0,01 Zentimeter, 0,001 Millimeter, 0,3048 Fuß. Keines dieser Formate hält sie fest, der Viewer leitet sie aus der Modellgröße ab.", getModels: 'Listet die geladenen Modelle. Gibt ein Promise zurück.', getElement: 'Liefert die IFC-Daten eines Elements (Attribute + Property-/Quantity-Sets). Gibt ein Promise zurück.', getValidation: 'Liefert die aktuelle Validierungs-Zusammenfassung (Health Score + Zähler). Gibt ein Promise zurück.', getStats: 'Elementanzahl je Kategorie und Modell — für Dashboard-Diagramme. Gibt ein Promise zurück.', getIssues: 'Validierungsmeldungen für eine Tabelle (Filter nach Schweregrad / Limit). Gibt ein Promise zurück.', screenshot: 'Erfasst die aktuelle 3D-Ansicht als PNG-Data-URL. Gibt ein Promise zurück.', removeModel: 'Entlädt ein Modell per id.', hideShow: 'Blendet eine Menge von Elementen per expressID aus / ein.', setCamera: 'Positioniert die Kamera an einer Position mit Blickrichtung.', wc: 'Oder ganz ohne JS — das Tag:' },
  fr: { grpPanels: "Panneaux", panelOpen: "Ouvre un panneau d'outil, ou null pour fermer celui qui est ouvert. Un panneau indisponible — masqué par le chrome, ou sans contenu sur lequel agir — ne fait rien et n'est pas une erreur.", panelList: "Quel panneau est ouvert et lesquels sont proposés à cet instant. Un outil absent de `available` ne peut pas être ouvert ; il n'est pas simplement désactivé.", panelScope: "Limite la barre à ces panneaux, à l'exécution. Même vocabulaire que le paramètre d'URL `panels=`, et il prime sur lui. Restreint ce que le visualiseur propose et n'ajoute jamais ; un tableau vide signifie aucune barre.", pcAdd: "Charge un relevé depuis des octets — LAS, LAZ, COPC, PLY, PCD ou texte. Le tampon est transféré, pas copié. Résout avec l'identifiant du nuage.", pcAddUrl: "Charge un relevé que le visualiseur récupère lui-même. L'URL doit autoriser CORS.", pcList: "Tous les relevés chargés. `pointCount` est ce qui réside en mémoire, `declaredCount` ce que contient le fichier — ils diffèrent quand le budget a tronqué l'analyse.", pcRemove: "Décharge un relevé et libère ses tampons GPU, ou décharge-les tous.", pcVisible: "Affiche ou masque un relevé sans le décharger.", pcFit: "Cadre la caméra sur un relevé, ou sur le premier chargé.", pcDisplay: "Taille des points, opacité, mode de couleur, densité, seuil de confiance — partagés par tous les relevés. Chacun est un uniform de shader, donc instantané sur 20 millions de points.", pcInspect: "Arme le clic-pour-lire. Une fois armé, cliquer un point émet `pointcloud-picked` avec les coordonnées DU FICHIER à côté de celles de la scène.", pcPlacement: "Ajuste un relevé à la main : position, lacet, mise à niveau, échelle. Partiel et borné ; s'applique par-dessus l'alignement déduit sans le remplacer.", pcUpAxis: "Corrige l'axe que le relevé considère comme vertical. PLY, PCD et texte ne déclarent aucune orientation, le visualiseur la déduit — vérifiez `upAxisSource`.", meshAdd: "Importe un modèle depuis des octets. Prend une LISTE : un .gltf a besoin de son .bin et de ses textures, un .obj de son .mtl — seul, le fichier d'entrée donne de la géométrie grise.", meshAddUrl: "Importe un modèle que le visualiseur récupère. Passez toutes les URL nécessaires ; elles sont récupérées en parallèle et doivent toutes autoriser CORS.", meshList: "Tous les modèles importés, avec leurs nombres de triangles et de textures. Lisez `unitSource` et `upAxisSource` avant de faire confiance aux valeurs voisines.", meshRemove: "Retire un import et libère sa géométrie, ses matériaux et ses textures, ou retire-les tous.", meshVisible: "Affiche ou masque un import sans le décharger.", meshFit: "Cadre la caméra sur un import, ou sur tous.", meshPlacement: "Place un import à la main : position, lacet, mise à niveau, échelle. Partiel et borné. Un import démarre centré sur l'IFC, posé sur son sol.", meshUpAxis: "Corrige l'axe vertical de la source. Utile seulement pour OBJ — la spécification glTF impose Y vers le haut, elle rapporte donc `upAxisSource: 'declared'`.", meshUnit: "Corrige l'unité source : 1 mètres, 0,01 centimètres, 0,001 millimètres, 0,3048 pieds. Aucun de ces formats ne l'enregistre, le visualiseur la déduit de la taille du modèle.", getModels: 'Liste les modèles chargés. Renvoie une promesse.', getElement: "Récupère les données IFC d'un élément (attributs + property/quantity sets). Renvoie une promesse.", getValidation: 'Récupère le résumé de validation (Health Score + compteurs). Renvoie une promesse.', getStats: 'Nombre d’éléments par catégorie et par modèle — pour les graphiques. Renvoie une promesse.', getIssues: 'Anomalies de validation pour un tableau (filtre par sévérité / limite). Renvoie une promesse.', screenshot: 'Capture la vue 3D actuelle en data URL PNG. Renvoie une promesse.', removeModel: 'Décharge un modèle par id.', hideShow: 'Masque / affiche un ensemble d’éléments par expressID.', setCamera: 'Place la caméra à une position regardant dans une direction.', wc: 'Ou, sans JS — la balise :' },
  pt: { grpPanels: "Painéis", panelOpen: "Abre um painel de ferramenta, ou passa null para fechar o que estiver aberto. Um painel indisponível — escondido pelo chrome, ou sem nada carregado sobre o que atuar — não faz nada, e não é um erro.", panelList: "Que painel está aberto e quais são oferecidos neste momento. Uma ferramenta ausente de `available` não pode ser aberta; não está apenas desativada.", panelScope: "Limita a barra a estes painéis, em tempo de execução. Mesmo vocabulário do parâmetro de URL `panels=` e tem prioridade sobre ele. Restringe o que o visualizador oferece e nunca acrescenta; um array vazio significa sem barra.", pcAdd: "Carrega um levantamento a partir de bytes — LAS, LAZ, COPC, PLY, PCD ou texto. O buffer é transferido, não copiado. Resolve com o id da nuvem.", pcAddUrl: "Carrega um levantamento que o próprio visualizador obtém. O URL tem de permitir CORS.", pcList: "Todos os levantamentos carregados. `pointCount` é o residente, `declaredCount` o que o ficheiro contém — diferem quando o orçamento truncou a leitura.", pcRemove: "Descarrega um levantamento e liberta os seus buffers de GPU, ou descarrega todos.", pcVisible: "Mostra ou oculta um levantamento sem o descarregar.", pcFit: "Enquadra a câmara num levantamento, ou no primeiro carregado.", pcDisplay: "Tamanho do ponto, opacidade, modo de cor, densidade, limiar de confiança — partilhados por todos. Cada um é um uniform do shader, logo instantâneo com 20 milhões de pontos.", pcInspect: "Arma o clique para ler. Enquanto armado, clicar num ponto emite `pointcloud-picked` com as coordenadas DO FICHEIRO ao lado das da cena.", pcPlacement: "Ajusta um levantamento à mão: posição, guinada, nivelamento, escala. Parcial e limitado; aplica-se sobre o alinhamento deduzido em vez de o substituir.", pcUpAxis: "Corrige que eixo o levantamento trata como vertical. PLY, PCD e texto não declaram orientação, o visualizador deduz — verifique `upAxisSource`.", meshAdd: "Importa um modelo a partir de bytes. Recebe uma LISTA: um .gltf precisa do seu .bin e texturas, um .obj do seu .mtl — sozinho, o ficheiro de entrada dá geometria cinzenta.", meshAddUrl: "Importa um modelo que o visualizador obtém. Passe todos os URL necessários; são obtidos em paralelo e todos têm de permitir CORS.", meshList: "Todos os modelos importados, com contagens de triângulos e texturas. Leia `unitSource` e `upAxisSource` antes de confiar nos valores ao lado.", meshRemove: "Remove uma importação e liberta a geometria, materiais e texturas, ou remove todas.", meshVisible: "Mostra ou oculta uma importação sem a descarregar.", meshFit: "Enquadra a câmara numa importação, ou em todas.", meshPlacement: "Coloca uma importação à mão: posição, guinada, nivelamento, escala. Parcial e limitado. As importações começam centradas no IFC, assentes no seu piso.", meshUpAxis: "Corrige o eixo vertical da origem. Só faz sentido em OBJ — a especificação glTF obriga a Y para cima, por isso reporta `upAxisSource: 'declared'`.", meshUnit: "Corrige a unidade de origem: 1 metros, 0,01 centímetros, 0,001 milímetros, 0,3048 pés. Nenhum destes formatos a regista, o visualizador deduz do tamanho do modelo.", getModels: 'Lista os modelos carregados. Devolve uma promessa.', getElement: 'Obtém os dados IFC de um elemento (atributos + property/quantity sets). Devolve uma promessa.', getValidation: 'Obtém o resumo de validação (Health Score + contagens). Devolve uma promessa.', getStats: 'Contagem de elementos por categoria e modelo — para gráficos. Devolve uma promessa.', getIssues: 'Problemas de validação para uma tabela (filtra por severidade / limite). Devolve uma promessa.', screenshot: 'Captura a vista 3D atual como data URL PNG. Devolve uma promessa.', removeModel: 'Descarrega um modelo por id.', hideShow: 'Oculta / mostra um conjunto de elementos por expressID.', setCamera: 'Coloca a câmara numa posição a olhar numa direção.', wc: 'Ou, sem JS — use a etiqueta:' },
  it: { grpPanels: "Pannelli", panelOpen: "Apre un pannello strumento, oppure null per chiudere quello aperto. Un pannello non disponibile — nascosto dal chrome, o senza nulla di caricato su cui agire — non fa nulla, e non è un errore.", panelList: "Quale pannello è aperto e quali sono offerti in questo momento. Uno strumento assente da `available` non può essere aperto; non è semplicemente disabilitato.", panelScope: "Limita la barra a questi pannelli, a runtime. Stesso vocabolario del parametro URL `panels=` e ha la precedenza su di esso. Restringe ciò che il viewer offre e non aggiunge mai; un array vuoto significa nessuna barra.", pcAdd: "Carica una scansione da byte — LAS, LAZ, COPC, PLY, PCD o testo. Il buffer viene trasferito, non copiato. Restituisce l'id della nuvola.", pcAddUrl: "Carica una scansione che il visualizzatore scarica da sé. L'URL deve consentire CORS.", pcList: "Tutte le scansioni caricate. `pointCount` è ciò che risiede in memoria, `declaredCount` ciò che contiene il file — differiscono quando il budget ha troncato la lettura.", pcRemove: "Scarica una scansione e libera i suoi buffer GPU, oppure scaricale tutte.", pcVisible: "Mostra o nasconde una scansione senza scaricarla.", pcFit: "Inquadra la camera su una scansione, o sulla prima caricata.", pcDisplay: "Dimensione dei punti, opacità, modalità colore, densità, soglia di confidenza — condivisi da tutte. Ognuno è un uniform dello shader, quindi immediato su 20 milioni di punti.", pcInspect: "Arma il clic per leggere. Da armato, cliccare un punto emette `pointcloud-picked` con le coordinate DEL FILE accanto a quelle della scena.", pcPlacement: "Regola una scansione a mano: posizione, imbardata, livellamento, scala. Parziale e limitato; si applica sopra l'allineamento dedotto senza sostituirlo.", pcUpAxis: "Corregge quale asse la scansione considera verticale. PLY, PCD e testo non dichiarano orientamento, il visualizzatore lo deduce — controlla `upAxisSource`.", meshAdd: "Importa un modello da byte. Richiede un ELENCO: un .gltf ha bisogno del suo .bin e delle texture, un .obj del suo .mtl — da solo, il file di ingresso dà geometria grigia.", meshAddUrl: "Importa un modello che il visualizzatore scarica. Passa tutti gli URL necessari; vengono scaricati in parallelo e devono tutti consentire CORS.", meshList: "Tutti i modelli importati, con i conteggi di triangoli e texture. Leggi `unitSource` e `upAxisSource` prima di fidarti dei valori accanto.", meshRemove: "Rimuove un'importazione e libera geometria, materiali e texture, oppure rimuovile tutte.", meshVisible: "Mostra o nasconde un'importazione senza scaricarla.", meshFit: "Inquadra la camera su un'importazione, o su tutte.", meshPlacement: "Posiziona un'importazione a mano: posizione, imbardata, livellamento, scala. Parziale e limitato. Le importazioni partono centrate sull'IFC, appoggiate al suo piano.", meshUpAxis: "Corregge l'asse verticale dell'origine. Ha senso solo per OBJ — la specifica glTF impone Y in alto, quindi riporta `upAxisSource: 'declared'`.", meshUnit: "Corregge l'unità di origine: 1 metri, 0,01 centimetri, 0,001 millimetri, 0,3048 piedi. Nessuno di questi formati la registra, il visualizzatore la deduce dalla dimensione.", getModels: 'Elenca i modelli caricati. Restituisce una promise.', getElement: 'Recupera i dati IFC di un elemento (attributi + property/quantity set). Restituisce una promise.', getValidation: 'Recupera il riepilogo di validazione (Health Score + conteggi). Restituisce una promise.', getStats: 'Conteggio elementi per categoria e modello — per i grafici. Restituisce una promise.', getIssues: 'Problemi di validazione per una tabella (filtra per gravità / limite). Restituisce una promise.', screenshot: 'Cattura la vista 3D corrente come data URL PNG. Restituisce una promise.', removeModel: 'Scarica un modello per id.', hideShow: 'Nasconde / mostra un insieme di elementi per expressID.', setCamera: 'Posiziona la camera in una posizione guardando in una direzione.', wc: 'Oppure, senza JS — il tag:' },
  ca: { grpPanels: "Panells", panelOpen: "Obre un tauler d'eina, o passa null per tancar el que estigui obert. Un tauler no disponible — perquè el chrome l'amaga o no hi ha res carregat sobre què actuar — no fa res, i no és un error.", panelList: "Quin tauler és obert i quins s'ofereixen ara mateix. Una eina que no apareix a `available` no es pot obrir; no està simplement deshabilitada.", panelScope: "Limita el carril a aquests taulers, en temps d'execució. Mateix vocabulari que el paràmetre d'URL `panels=` i hi té prioritat. Restringeix el que el visor ofereix i mai afegeix; un array buit vol dir sense carril.", pcAdd: "Carrega un escaneig des de bytes — LAS, LAZ, COPC, PLY, PCD o text. El búfer es transfereix, no es copia. Resol amb l'id del núvol.", pcAddUrl: "Carrega un escaneig que descarrega el mateix visor. L'URL ha de permetre CORS.", pcList: "Tots els escaneigs carregats. `pointCount` és el que resideix en memòria, `declaredCount` el que conté el fitxer — difereixen quan el pressupost va truncar la lectura.", pcRemove: "Descarrega un escaneig i allibera els seus búfers de GPU, o descarrega'ls tots.", pcVisible: "Mostra o amaga un escaneig sense descarregar-lo.", pcFit: "Enquadra la càmera en un escaneig, o en el primer carregat.", pcDisplay: "Mida del punt, opacitat, mode de color, densitat, llindar de confiança — compartits per tots. Cadascun és un uniform del shader, així que és instantani amb 20 milions de punts.", pcInspect: "Arma el clic per llegir. Un cop armat, clicar un punt emet `pointcloud-picked` amb les coordenades DEL FITXER al costat de les de l'escena.", pcPlacement: "Ajusta un escaneig a mà: posició, guinyada, anivellament, escala. Parcial i acotat; s'aplica damunt de l'alineació deduïda sense substituir-la.", pcUpAxis: "Corregeix quin eix considera vertical l'escaneig. PLY, PCD i text no declaren orientació, el visor la dedueix — comprova `upAxisSource`.", meshAdd: "Importa un model des de bytes. Rep una LLISTA: un .gltf necessita el seu .bin i les textures, un .obj el seu .mtl — sol, el fitxer d'entrada dóna geometria grisa.", meshAddUrl: "Importa un model que descarrega el visor. Passa totes les URL que calguin; es descarreguen en paral·lel i totes han de permetre CORS.", meshList: "Tots els models importats, amb els recomptes de triangles i textures. Llegeix `unitSource` i `upAxisSource` abans de fiar-te dels valors del costat.", meshRemove: "Elimina una importació i allibera la geometria, els materials i les textures, o elimina-les totes.", meshVisible: "Mostra o amaga una importació sense descarregar-la.", meshFit: "Enquadra la càmera en una importació, o en totes.", meshPlacement: "Col·loca una importació a mà: posició, guinyada, anivellament, escala. Parcial i acotat. Les importacions comencen centrades sobre l'IFC i recolzades al seu terra.", meshUpAxis: "Corregeix l'eix vertical de l'origen. Només té sentit en OBJ — l'especificació de glTF obliga Y amunt, així que informa `upAxisSource: 'declared'`.", meshUnit: "Corregeix la unitat d'origen: 1 metres, 0,01 centímetres, 0,001 mil·límetres, 0,3048 peus. Cap d'aquests formats la registra, el visor la dedueix de la mida del model.", getModels: 'Llista els models carregats. Retorna una promesa.', getElement: "Obté les dades IFC d'un element (atributs + property/quantity sets). Retorna una promesa.", getValidation: 'Obté el resum de validació (Health Score + recomptes). Retorna una promesa.', getStats: 'Recompte d’elements per categoria i model — per a gràfics. Retorna una promesa.', getIssues: 'Incidències de validació per a una taula (filtra per severitat / límit). Retorna una promesa.', screenshot: 'Captura la vista 3D actual com a data URL PNG. Retorna una promesa.', removeModel: 'Descarrega un model per id.', hideShow: "Amaga / mostra un conjunt d'elements per expressID.", setCamera: 'Col·loca la càmera en una posició mirant en una direcció.', wc: 'O, sense JS — l’etiqueta:' },
  zh: { grpPanels: "面板", panelOpen: "打开某个工具面板，或传入 null 关闭当前打开的面板。若面板不可用——被外壳隐藏，或没有可作用的已加载内容——则不执行任何操作，也不报错。", panelList: "当前打开的面板，以及此刻可供选择的面板。未出现在 `available` 中的工具无法打开，而不只是被禁用。", panelScope: "在运行时把工具栏限制为这些面板。与 URL 参数 `panels=` 使用同一套名称，并优先于它。只会收窄查看器提供的内容，绝不新增；空数组表示不显示工具栏。", pcAdd: "从字节加载扫描——LAS、LAZ、COPC、PLY、PCD 或文本。缓冲区是转移而非复制，返回点云 id。", pcAddUrl: "加载由查看器自行获取的扫描。该 URL 必须允许 CORS。", pcList: "所有已加载的扫描。`pointCount` 是常驻内存的数量，`declaredCount` 是文件所含的数量——当预算截断解析时两者不同。", pcRemove: "卸载一个扫描并释放其 GPU 缓冲区，或全部卸载。", pcVisible: "显示或隐藏一个扫描，而不卸载它。", pcFit: "把相机对准某个扫描，或第一个加载的扫描。", pcDisplay: "点大小、不透明度、着色模式、密度、置信度阈值——所有扫描共用。每一项都是着色器 uniform，因此在两千万点上也是即时生效。", pcInspect: "启用点击读取。启用后点击一个点会发出 `pointcloud-picked`，同时带上场景坐标和文件中的坐标。", pcPlacement: "手动微调扫描：位置、偏航、调平、缩放。可传部分字段且会被钳制；叠加在推导出的对齐之上，而不是替换它。", pcUpAxis: "修正扫描以哪个轴为上。PLY、PCD 和文本都不声明方向，由查看器推断——请先检查 `upAxisSource`。", meshAdd: "从字节导入模型。需要一个列表：.gltf 需要它的 .bin 和贴图，.obj 需要它的 .mtl——只传入口文件会得到灰色几何体。", meshAddUrl: "导入由查看器获取的模型。请传入它需要的全部 URL；它们会并行获取，且都必须允许 CORS。", meshList: "所有已导入的模型，含三角面和贴图数量。在信任旁边的数值之前，请先读取 `unitSource` 和 `upAxisSource`。", meshRemove: "移除一个导入并释放其几何体、材质和贴图，或全部移除。", meshVisible: "显示或隐藏一个导入，而不卸载它。", meshFit: "把相机对准某个导入，或全部导入。", meshPlacement: "手动放置导入：位置、偏航、调平、缩放。可传部分字段且会被钳制。导入初始居中于 IFC 之上、落在其地面。", meshUpAxis: "修正来源的垂直轴。仅对 OBJ 有意义——glTF 规范强制 Y 向上，因此它报告 `upAxisSource: 'declared'`。", meshUnit: "修正来源单位：1 米、0.01 厘米、0.001 毫米、0.3048 英尺。这些格式都不记录单位，查看器根据模型尺寸推断。", getModels: '列出已加载的模型。返回 Promise。', getElement: '获取某元素的 IFC 数据（属性 + 属性集/数量集）。返回 Promise。', getValidation: '获取当前校验摘要（健康分 + 计数）。返回 Promise。', getStats: '按类别统计每个模型的元素数量——用于仪表盘图表。返回 Promise。', getIssues: '用于表格的校验问题（按严重程度 / 数量过滤）。返回 Promise。', screenshot: '将当前三维视图捕获为 PNG data URL。返回 Promise。', removeModel: '按 id 卸载某个模型。', hideShow: '按 expressID 隐藏 / 显示一组元素。', setCamera: '将相机置于某位置并朝某方向观察。', wc: '或者，零 JS — 直接用标签：' },
  ja: { grpPanels: "パネル", panelOpen: "ツールパネルを開きます。null を渡すと開いているパネルを閉じます。利用できないパネル（クロームが隠している、または対象となる読み込み済みデータがない）は何も起こらず、エラーにもなりません。", panelList: "現在開いているパネルと、この時点で提供されているパネル。`available` にないツールは開けません。単に無効化されているのではありません。", panelScope: "実行時にレールをこれらのパネルに限定します。URL パラメータ `panels=` と同じ語彙で、そちらより優先されます。ビューアが提供するものを絞るだけで追加はしません。空配列はレールなしを意味します。", pcAdd: "バイト列からスキャンを読み込みます——LAS、LAZ、COPC、PLY、PCD、テキスト。バッファーはコピーではなく転送され、点群 id を返します。", pcAddUrl: "ビューアー自身が取得するスキャンを読み込みます。URL は CORS を許可している必要があります。", pcList: "読み込み済みのすべてのスキャン。`pointCount` は常駐している数、`declaredCount` はファイルが持つ数で、予算が解析を打ち切ったときに食い違います。", pcRemove: "スキャンを 1 つ解放して GPU バッファーを返すか、すべて解放します。", pcVisible: "スキャンを解放せずに表示・非表示を切り替えます。", pcFit: "カメラをスキャンに、または最初に読み込んだものに合わせます。", pcDisplay: "点サイズ、不透明度、配色、密度、信頼度しきい値——すべてのスキャンで共通です。いずれもシェーダーの uniform なので、2000 万点でも即座に反映されます。", pcInspect: "クリックで読み取るモードを有効にします。有効な間、点をクリックすると `pointcloud-picked` がシーン座標とファイル内の座標の両方を伴って発火します。", pcPlacement: "スキャンを手で微調整します——位置、ヨー、水平出し、スケール。部分指定でき、値はクランプされます。導出された位置合わせを置き換えず、その上に乗ります。", pcUpAxis: "スキャンがどの軸を上とみなすかを修正します。PLY、PCD、テキストは方向を宣言しないためビューアーが推定します——`upAxisSource` を確認してください。", meshAdd: "バイト列からモデルを取り込みます。リストを受け取ります：.gltf には .bin とテクスチャー、.obj には .mtl が必要で、入口ファイルだけではグレーのジオメトリーになります。", meshAddUrl: "ビューアーが取得するモデルを取り込みます。必要な URL をすべて渡してください。並列に取得され、すべて CORS を許可している必要があります。", meshList: "取り込み済みのすべてのモデルと、その三角形数・テクスチャー数。隣の値を信頼する前に `unitSource` と `upAxisSource` を読んでください。", meshRemove: "取り込みを 1 つ削除してジオメトリー・マテリアル・テクスチャーを解放するか、すべて削除します。", meshVisible: "取り込みを解放せずに表示・非表示を切り替えます。", meshFit: "カメラを 1 つの取り込みに、またはすべてに合わせます。", meshPlacement: "取り込みを手で配置します——位置、ヨー、水平出し、スケール。部分指定でき、クランプされます。取り込みは IFC の中央、その床の上から始まります。", meshUpAxis: "ソースの上方向の軸を修正します。意味があるのは OBJ だけです——glTF は仕様で Y を上と定めているため `upAxisSource: 'declared'` を返します。", meshUnit: "ソースの単位を修正します：1 メートル、0.01 センチメートル、0.001 ミリメートル、0.3048 フィート。どの形式も単位を記録しないため、ビューアーがモデルの大きさから推定します。", getModels: '読み込み済みモデルを列挙。Promise を返します。', getElement: '要素の IFC データ（属性＋プロパティ/数量セット）を取得。Promise を返します。', getValidation: '現在の検証サマリ（ヘルススコア＋件数）を取得。Promise を返します。', getStats: 'モデルごとのカテゴリ別要素数 — ダッシュボードのグラフ用。Promise を返します。', getIssues: 'テーブル用の検証問題（重大度 / 件数でフィルタ）。Promise を返します。', screenshot: '現在の 3D ビューを PNG data URL として取得。Promise を返します。', removeModel: 'id でモデルをアンロードします。', hideShow: 'expressID で要素の集合を非表示 / 表示します。', setCamera: 'カメラを指定位置に置き、指定方向を向かせます。', wc: 'または、JS なしでタグを：' },
  th: { grpPanels: "แผงเครื่องมือ", panelOpen: "เปิดแผงเครื่องมือ หรือส่ง null เพื่อปิดแผงที่เปิดอยู่ แผงที่ไม่พร้อมใช้งาน — ถูกซ่อนโดยโครงหน้าจอ หรือยังไม่มีข้อมูลให้ทำงานด้วย — จะไม่เกิดอะไรขึ้น และไม่ถือเป็นข้อผิดพลาด", panelList: "แผงที่เปิดอยู่ และแผงที่มีให้เลือกในขณะนี้ เครื่องมือที่ไม่ปรากฏใน `available` จะเปิดไม่ได้ ไม่ใช่แค่ถูกปิดการใช้งาน", panelScope: "จำกัดแถบเครื่องมือให้เหลือเฉพาะแผงเหล่านี้ขณะทำงาน ใช้คำเดียวกับพารามิเตอร์ URL `panels=` และมีลำดับความสำคัญเหนือกว่า จะจำกัดสิ่งที่ตัวแสดงผลมีให้เท่านั้น ไม่เพิ่มใหม่ อาร์เรย์ว่างหมายถึงไม่มีแถบ", pcAdd: "โหลดไฟล์สแกนจากไบต์ — LAS, LAZ, COPC, PLY, PCD หรือข้อความ บัฟเฟอร์จะถูกโอนย้ายไม่ใช่คัดลอก และคืนค่า id ของกลุ่มจุด", pcAddUrl: "โหลดไฟล์สแกนที่ตัวโปรแกรมไปดึงมาเอง URL ต้องอนุญาต CORS", pcList: "ไฟล์สแกนที่โหลดไว้ทั้งหมด `pointCount` คือจำนวนที่อยู่ในหน่วยความจำ ส่วน `declaredCount` คือจำนวนที่ไฟล์มี — ต่างกันเมื่อโควตาตัดการอ่านให้สั้นลง", pcRemove: "เอาไฟล์สแกนหนึ่งชิ้นออกและคืนบัฟเฟอร์ GPU หรือเอาออกทั้งหมด", pcVisible: "แสดงหรือซ่อนไฟล์สแกนโดยไม่ต้องเอาออกจากหน่วยความจำ", pcFit: "จัดกล้องให้พอดีกับไฟล์สแกนหนึ่งชิ้น หรือชิ้นแรกที่โหลด", pcDisplay: "ขนาดจุด ความทึบ โหมดสี ความหนาแน่น และเกณฑ์ความเชื่อมั่น — ใช้ร่วมกันทุกไฟล์ ทุกค่าเป็น uniform ของเชเดอร์ จึงมีผลทันทีแม้ที่ 20 ล้านจุด", pcInspect: "เปิดโหมดคลิกเพื่ออ่านค่า เมื่อเปิดอยู่ การคลิกจุดจะส่ง `pointcloud-picked` พร้อมพิกัดในไฟล์ควบคู่กับพิกัดในฉาก", pcPlacement: "ปรับไฟล์สแกนด้วยมือ: ตำแหน่ง การหมุน การปรับระดับ และมาตราส่วน ส่งบางส่วนได้และค่าจะถูกจำกัด โดยซ้อนทับการจัดแนวที่คำนวณไว้ ไม่ได้แทนที่", pcUpAxis: "แก้ว่าไฟล์สแกนถือแกนใดเป็นแกนขึ้นบน PLY, PCD และข้อความไม่ระบุทิศทาง โปรแกรมจึงอนุมานเอง — ตรวจ `upAxisSource` ก่อนเชื่อ", meshAdd: "นำเข้าโมเดลจากไบต์ รับเป็นรายการ: .gltf ต้องมี .bin และเท็กซ์เจอร์ ส่วน .obj ต้องมี .mtl — ถ้าส่งเฉพาะไฟล์หลักจะได้เรขาคณิตสีเทา", meshAddUrl: "นำเข้าโมเดลที่ตัวโปรแกรมไปดึงมาเอง ส่ง URL ทุกไฟล์ที่ต้องใช้ ระบบจะดึงพร้อมกันและทุกไฟล์ต้องอนุญาต CORS", meshList: "โมเดลที่นำเข้าทั้งหมด พร้อมจำนวนสามเหลี่ยมและเท็กซ์เจอร์ ควรอ่าน `unitSource` และ `upAxisSource` ก่อนเชื่อค่าที่อยู่ข้าง ๆ", meshRemove: "เอาโมเดลที่นำเข้าออกหนึ่งชิ้นและคืนเรขาคณิต วัสดุ และเท็กซ์เจอร์ หรือเอาออกทั้งหมด", meshVisible: "แสดงหรือซ่อนโมเดลที่นำเข้าโดยไม่ต้องเอาออกจากหน่วยความจำ", meshFit: "จัดกล้องให้พอดีกับโมเดลที่นำเข้าหนึ่งชิ้น หรือทั้งหมด", meshPlacement: "วางโมเดลที่นำเข้าด้วยมือ: ตำแหน่ง การหมุน การปรับระดับ และมาตราส่วน ส่งบางส่วนได้และค่าจะถูกจำกัด โมเดลจะเริ่มอยู่กึ่งกลางบน IFC และวางบนพื้นของมัน", meshUpAxis: "แก้แกนแนวตั้งของต้นทาง มีความหมายเฉพาะกับ OBJ — ข้อกำหนดของ glTF บังคับให้ Y ขึ้นบน จึงรายงานเป็น `upAxisSource: 'declared'`", meshUnit: "แก้หน่วยของต้นทาง: 1 เมตร, 0.01 เซนติเมตร, 0.001 มิลลิเมตร, 0.3048 ฟุต ไม่มีรูปแบบใดบันทึกหน่วยไว้ โปรแกรมจึงอนุมานจากขนาดของโมเดล", getModels: 'แสดงรายการโมเดลที่โหลด คืนค่า Promise', getElement: 'ดึงข้อมูล IFC ของอิลิเมนต์ (แอตทริบิวต์ + property/quantity set) คืนค่า Promise', getValidation: 'ดึงสรุปการตรวจสอบ (Health Score + จำนวน) คืนค่า Promise', getStats: 'จำนวนอิลิเมนต์ตามหมวดหมู่ของแต่ละโมเดล — สำหรับกราฟแดชบอร์ด คืนค่า Promise', getIssues: 'ปัญหาการตรวจสอบสำหรับตาราง (กรองตามระดับ / จำกัดจำนวน) คืนค่า Promise', screenshot: 'จับภาพมุมมอง 3D ปัจจุบันเป็น PNG data URL คืนค่า Promise', removeModel: 'ยกเลิกการโหลดโมเดลตาม id', hideShow: 'ซ่อน / แสดงชุดอิลิเมนต์ตาม expressID', setCamera: 'วางกล้องที่ตำแหน่งหนึ่งโดยมองไปตามทิศทาง', wc: 'หรือแบบไม่ต้องเขียน JS — ใช้แท็ก:' },
}
for (const l of LANGS) Object.assign(T[l], EXTRA[l])

// ── New content (English; other locales fall back to EN via tr()) ─────────────
// New structural + long-form strings live here so the page is a superset of the
// old one without touching the 10 existing translations. Translate in a later pass.
Object.assign(T.en, {
  // chrome
  onThisPage: 'On this page', openApp: 'Open viewer', themeLabel: 'Toggle light / dark theme',
  copy: 'Copy', copied: 'Copied!', skip: 'Skip to content', menu: 'Menu',
  // hero
  heroEyebrow: 'IFC Viewer SDK',
  ctaStart: 'Get started', ctaDemoBtn: 'See the live demo', heroPeek: 'Three lines to first render',
  // trust strip
  trustClient: '100% client-side', trustNoBackend: 'No upload backend', trustDeps: 'Zero runtime deps',
  trustSize: '~6 KB wrapper', trustTs: 'TypeScript types', trustLangs: '10 languages', trustIds: 'IDS-validated engine',
  // quick start (title/nav reuse the existing localized `quickStart` key)
  qsKicker: 'Setup',
  qsLede: 'Pick your stack. Copy, paste, render — no build step, no API key.',
  tabJs: 'JavaScript', tabWc: 'Web component', tabReact: 'React', tabVue: 'Vue',
  qsSelfHostT: 'Hosted vs. self-hosted',
  qsSelfHost: 'The snippets import from our CDN, which works on any origin. To self-host, serve ifc-viewer.es.js from your own domain — the SDK auto-discovers the app URL relative to the script. Serving the app elsewhere? Set the baseUrl option.',
  qsWcNote: 'Zero JavaScript — drop the tag into any page or dashboard and set attributes.',
  qsReactNote: 'Mount in an effect, tear down on unmount. Safe under React 18 StrictMode double-invocation.',
  qsVueNote: 'Mount on onMounted, dispose on onUnmounted.',
  qsNpmNote: 'No npm package yet: import the module by URL (above) or vendor ifc-viewer.es.js into your app.',
  // demo
  demoKicker: 'Proof', demoCall: 'Last call', demoErr: 'The sample host may be rate-limiting. Try again in a moment.',
  // how it works
  howKicker: 'Architecture', howTitle: 'How it works',
  howLede: 'A tiny wrapper in your page, the full viewer in a sandboxed iframe, your bytes streamed across — and parsed where they already live.',
  how1T: 'Your app', how1B: 'A ~6 KB ES module that creates an iframe and a typed JS API. None of the heavy 3D / parsing weight touches your bundle.',
  how2T: 'postMessage bridge', how2B: 'IFC bytes are transferred to the iframe as an ArrayBuffer (zero-copy). Commands and queries are correlated request/response messages.',
  how3T: 'The viewer', how3B: 'three.js + web-ifc compiled to WebAssembly parse and render the model inside the iframe — on the visitor’s machine.',
  howWhyPrivT: 'Why it’s private', howWhyPrivB: 'Models never reach a server. No upload pipeline to secure, no data-residency question, no file-size queue.',
  howWhyScaleT: 'Why it scales', howWhyScaleB: 'Compute runs on each visitor’s device. Serving a 200 MB model costs the same as a 2 MB one — it’s a static file.',
  howDiagAlt: 'Your app hands IFC bytes to the SDK, which streams them over postMessage to a sandboxed iframe where three.js and web-ifc (WebAssembly) parse and render the model in the visitor’s browser. Nothing is uploaded.',
  dgApp: 'Your app', dgSdk: 'SDK · ~6 KB', dgIframe: 'Sandboxed iframe', dgEngine: 'three.js · web-ifc · WASM',
  dgBytes: 'IFC bytes', dgPost: 'postMessage', dgBrowser: "Visitor's browser — nothing uploaded",
  // concepts
  conKicker: 'Concepts', conTitle: 'Core concepts', conLede: 'Four things to know before you build.',
  con1T: 'Mount & ready', con1B: 'new IfcViewer(target) mounts immediately and queues commands until the viewer is ready. await IfcViewer.create(target) (or whenReady()) gives you an instance you can use straight away.',
  con2T: 'Bytes vs. URL', con2B: 'add(name, bytes) streams bytes you already have — no CORS, nothing uploaded; the buffer is transferred (detached), so pass a copy if you still need it. addFromUrl(url) fetches a public, CORS-enabled URL instead.',
  con3T: 'Events', con3B: 'Subscribe with on(event, cb), which returns an unsubscribe function. You get ready, model-progress, model-loaded, validation-completed, model-error, element-selected, pointcloud-picked and map-feature-picked — the three things a scene is made of, on three events.',
  con4T: 'Queries', con4B: 'Pull data on demand: getModels, getElement, getValidation, getStats, getIssues, checkIds, checkEir, screenshot. Each is request/response and rejects after a timeout (30 s; IDS / EIR up to 120 s).',
  // api
  apiKicker: 'Reference', apiTitle: 'API reference',
  apiLede: 'Every method, grouped — with signatures and return types. Constructor options, events and the <ifc-viewer> web component follow.',
  colReturns: 'Returns',
  grpConstruct: 'Constructor', grpLoading: 'Loading models', grpCamera: 'Camera & selection',
  grpVisibility: 'Visibility', grpQueries: 'Queries', grpIds: 'IDS & EIR compliance', grpLang: 'Languages',
  grpPointClouds: 'Point clouds', grpMeshes: 'Imported 3D models',
  grpLifecycle: 'Lifecycle & events', grpOptions: 'Constructor options', grpEvents: 'Events', grpWc: 'Web component',
  colOption: 'Option', colType: 'Type', colDefault: 'Default', colEvent: 'Event', colPayload: 'Payload',
  mCreate: 'Create a viewer and resolve once it is ready to accept commands.',
  mWhenReady: 'Resolves when the viewer is ready to accept commands.',
  mIsReady: 'Getter — true once the viewer has signalled readiness.',
  mOff: 'Remove a previously added event listener.',
  // options
  optUi: 'Chrome preset for the embedded UI.',
  optValidate: 'Run validation on load (drives the Health Score).',
  optPanel: 'Auto-open the validation panel.',
  optLang: 'Force the UI language (e.g. en, es, ja).',
  optAccent: 'Tint the viewer to match your dashboard.',
  optModel: 'Auto-load this public IFC URL once ready.',
  optSize: 'iframe size (number → px).',
  optBaseUrl: 'App base URL. Auto-derived from the script URL.',
  optTimeout: 'Reject add()/addFromUrl() after N ms (0 disables).',
  optMisc: 'Extra class / iframe title.',
  optCb: 'Convenience callbacks — same as .on(...).',
  // statics + web component
  staticsT: 'Statics',
  staticsB: 'IfcViewer.LANGUAGES ({ code, label }[], native names) and IfcViewer.SUPPORTED_LANGUAGES (codes) — build a language picker before the viewer is ready.',
  wcAttrsT: 'Attributes',
  wcEventsT: 'DOM events',
  wcAttrsB: 'model · ui · lang · accent · validate · panel · base-url.',
  wcEventsB: 'Events re-dispatch as DOM CustomEvents named ifcviewer:<type> (detail = payload). The underlying IfcViewer is on the element’s .viewer; getStats / getIssues / screenshot proxy through.',
  serializedNote: 'Concurrent add() / addFromUrl() calls are serialized internally and each promise is correlated to its own load — an app-initiated load (URL param, in-iframe upload) never resolves your add() promise.',
  // recipes
  recKicker: 'Guides', recTitle: 'Recipes', recLede: 'Copy-paste patterns for the things teams actually build.',
  rec1T: 'Element inspector', rec1B: 'Click in 3D, read the IFC property sets into your own panel.',
  rec2T: 'Health Score widget', rec2B: 'Surface the model’s quality score and issue counts in your dashboard.',
  rec3T: 'IDS compliance check', rec3B: 'Validate against a buildingSMART IDS and list pass / fail per spec.',
  rec4T: 'Theme to your brand', rec4B: 'Match the viewer to your product with one accent colour.',
  rec5T: 'Language picker', rec5B: 'Build a selector from the languages the viewer ships with.',
  rec6T: 'EIR / BIM Validation', rec6B: 'Run an editable EIR profile (ISO 19650-style) — no .ids file needed. Failures carry the element GlobalId.',
  // troubleshooting
  faqKicker: 'Help', faqTitle: 'Troubleshooting', faqLede: 'The handful of things that trip people up.',
  faqCorsQ: 'I get a CORS error loading a model',
  faqCorsA: 'CORS only affects addFromUrl(url). If you control the bytes, fetch them yourself and call add(name, bytes) — no CORS applies because you hand the data over directly.',
  faqFrameQ: 'The iframe is blank or refuses to load',
  faqFrameA: 'The app must be embeddable — no X-Frame-Options: DENY and no restrictive frame-ancestors CSP on the host. Our hosted app allows embedding.',
  faqDetachQ: 'My ArrayBuffer is empty after add()',
  faqDetachA: 'add() transfers the buffer for a zero-copy hand-off, which detaches it in your code. Pass a copy (bytes.slice(0)) if you still need the bytes afterwards.',
  faqNothingQ: 'Nothing renders',
  faqNothingA: 'Check, in order: the viewer reached ready, the model loaded (model-loaded vs model-error), the container has a non-zero height, and the byte source is valid IFC. The model-error message names the cause.',
  faqTimeoutQ: 'Loads or queries time out',
  faqTimeoutA: 'add()/addFromUrl() reject after loadTimeout (default 120 s; 0 disables). Queries reject after 30 s, checkIds after 120 s. Large models on slow devices may need a higher loadTimeout.',
  faqBrowserQ: 'Which browsers are supported?',
  faqBrowserA: 'Any modern evergreen browser with WebAssembly and ES module support — Chrome, Edge, Firefox, Safari. No Internet Explorer.',
  faqDevQ: 'It 404s on my local dev server',
  faqDevA: 'A SPA dev server may intercept /sdk/ with its HTML fallback. Test against a real build / static host, or import the /sdk/ifc-viewer.es.js module directly.',
  // footer
  footTagline: 'Embed the IFC viewer anywhere. Parsed in the browser, never uploaded.',
  footContact: 'Contact', footStable: 'Stable API', footMadeBy: 'IFC Viewer Online',
})

// ── helpers ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const slug = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase()

// Build-time syntax highlighting (display only). Two modes: js, html (with
// JS-aware <script> bodies). Operates on raw source, escapes per token.
function hlJs(raw) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\b(const|let|var|function|return|await|async|new|import|from|export|default|if|else|for|of|in|class|extends|try|catch|finally|throw|typeof|instanceof|void|yield|switch|case|break|continue|while|do)\b|\b(true|false|null|undefined|this)\b|\b(\d[\w.]*)\b/g
  let out = '', last = 0, m
  while ((m = re.exec(raw))) {
    out += esc(raw.slice(last, m.index))
    if (m[1]) out += '<span class="t-com">' + esc(m[1]) + '</span>'
    else if (m[2]) out += '<span class="t-str">' + esc(m[2]) + '</span>'
    else if (m[3]) out += '<span class="t-kw">' + esc(m[3]) + '</span>'
    else if (m[4]) out += '<span class="t-const">' + esc(m[4]) + '</span>'
    else if (m[5]) out += '<span class="t-num">' + esc(m[5]) + '</span>'
    last = m.index + m[0].length
  }
  return out + esc(raw.slice(last))
}
function hlMarkupSeg(raw) {
  const re = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w-]*)|([a-zA-Z_:][\w:.-]*)(=)|("[^"]*"|'[^']*')/g
  let out = '', last = 0, m
  while ((m = re.exec(raw))) {
    out += esc(raw.slice(last, m.index))
    if (m[1]) out += '<span class="t-com">' + esc(m[1]) + '</span>'
    else if (m[2]) out += '<span class="t-tag">' + esc(m[2]) + '</span>'
    else if (m[4]) out += '<span class="t-attr">' + esc(m[3]) + '</span>='
    else if (m[5]) out += '<span class="t-str">' + esc(m[5]) + '</span>'
    last = m.index + m[0].length
  }
  return out + esc(raw.slice(last))
}
function hlMarkup(raw) {
  const re = /<script\b[^>]*>[\s\S]*?<\/script>/g
  let out = '', last = 0, m
  while ((m = re.exec(raw))) {
    out += hlMarkupSeg(raw.slice(last, m.index))
    const block = m[0]
    const open = block.match(/^<script\b[^>]*>/)[0]
    const close = '</' + 'script>'
    const body = block.slice(open.length, block.length - close.length)
    out += hlMarkupSeg(open) + hlJs(body) + hlMarkupSeg(close)
    last = m.index + block.length
  }
  return out + hlMarkupSeg(raw.slice(last))
}

function code(raw, mode, label) {
  const hl = mode === 'html' ? hlMarkup(raw) : hlJs(raw)
  const lang = label || (mode === 'html' ? 'HTML' : 'JavaScript')
  return (
    '<figure class="code">' +
    '<figcaption class="code-bar"><span class="code-lang">' + esc(lang) + '</span>' +
    '<button class="copy" type="button" data-copy data-copied="' + esc(T.en.copied) + '" aria-label="' + esc(T.en.copy) + '">' + esc(T.en.copy) + '</button>' +
    '</figcaption><pre><code>' + hl + '</code></pre></figure>'
  )
}

function langLinks(current) {
  return LANGS.map((l) => {
    const href = l === 'en' ? (current === 'en' ? './' : '../') : (current === l ? './' : (current === 'en' ? l + '/' : '../' + l + '/'))
    const active = l === current
    return '<a href="' + href + '" hreflang="' + l + '"' + (active ? ' aria-current="true"' : '') + '>' + esc(LANG_LABEL[l]) + '</a>'
  }).join('')
}

// ── API model ─────────────────────────────────────────────────────────────────
const API_GROUPS = [
  ['construct', 'grpConstruct', [
    ['new IfcViewer(target, options?)', 'IfcViewer', 'construct'],
    ['IfcViewer.create(target, options?)', 'Promise<IfcViewer>', 'mCreate'],
  ]],
  ['loading', 'grpLoading', [
    ['add(name, bytes)', 'Promise<ModelLoadedEvent>', 'add'],
    ['addFromUrl(url, name?)', 'Promise<ModelLoadedEvent>', 'addFromUrl'],
    ['removeModel(modelId)', 'void', 'removeModel'],
    ['clear()', 'void', 'clear'],
  ]],
  ['camera', 'grpCamera', [
    ['select(expressId, modelId?)', 'void', 'select'],
    ['setView(view)', 'void', 'setView'],
    ['fit() · reset()', 'void', 'fitReset'],
    ['setCamera(position, direction)', 'void', 'setCamera'],
  ]],
  ['visibility', 'grpVisibility', [
    ['isolate(ifcType?)', 'void', 'isolate'],
    ['showAll()', 'void', 'showAll'],
    ['hideElements(ids, modelId?) · showElements(ids, modelId?)', 'void', 'hideShow'],
  ]],
  ['queries', 'grpQueries', [
    ['getModels()', 'Promise<ModelSummary[]>', 'getModels'],
    ['getElement(id, modelId?)', 'Promise<IfcElementData | null>', 'getElement'],
    ['getValidation()', 'Promise<ValidationSummary | null>', 'getValidation'],
    ['getStats()', 'Promise<StatsResult>', 'getStats'],
    ['getIssues(opts?)', 'Promise<IssuesResult>', 'getIssues'],
    ['screenshot()', 'Promise<string>', 'screenshot'],
  ]],
  ['panels', 'grpPanels', [
    ['openPanel(panel | null) · closePanel()', 'void', 'panelOpen'],
    ['getPanels()', 'Promise<PanelsResult>', 'panelList'],
    ['setPanels(panels)', 'void', 'panelScope'],
  ]],
  ['pointclouds', 'grpPointClouds', [
    ['addPointCloud(fileName, bytes)', 'Promise<string>', 'pcAdd'],
    ['addPointCloudFromUrl(url, fileName?)', 'Promise<string>', 'pcAddUrl'],
    ['listPointClouds()', 'Promise<PointCloudInfo[]>', 'pcList'],
    ['removePointCloud(cloudId) · clearPointClouds()', 'Promise<void>', 'pcRemove'],
    ['setPointCloudVisible(cloudId, visible)', 'Promise<void>', 'pcVisible'],
    ['fitPointCloud(cloudId?)', 'Promise<void>', 'pcFit'],
    ['setPointCloudDisplay(display, renderBudget?)', 'Promise<void>', 'pcDisplay'],
    ['inspectPointCloud(enabled?)', 'Promise<void>', 'pcInspect'],
    ['setPointCloudPlacement(placement, cloudId?)', 'Promise<void>', 'pcPlacement'],
    ['setPointCloudUpAxis(axis, cloudId?)', 'Promise<void>', 'pcUpAxis'],
  ]],
  ['meshes', 'grpMeshes', [
    ['addMesh(files)', 'Promise<string>', 'meshAdd'],
    ['addMeshFromUrl(urls)', 'Promise<string>', 'meshAddUrl'],
    ['listMeshes()', 'Promise<MeshInfo[]>', 'meshList'],
    ['removeMesh(meshId?) · clearMeshes()', 'Promise<void>', 'meshRemove'],
    ['setMeshVisible(visible, meshId?)', 'Promise<void>', 'meshVisible'],
    ['fitMesh(meshId?)', 'Promise<void>', 'meshFit'],
    ['setMeshPlacement(placement, meshId?)', 'Promise<void>', 'meshPlacement'],
    ['setMeshUpAxis(axis, meshId?)', 'Promise<void>', 'meshUpAxis'],
    ['setMeshUnit(unitScale, meshId?)', 'Promise<void>', 'meshUnit'],
  ]],
  ['ids', 'grpIds', [
    ['checkIds(idsXml)', 'Promise<IdsResult>', 'checkIds'],
    ['checkEir(profile)', 'Promise<IdsResult>', 'checkEir'],
  ]],
  ['lang', 'grpLang', [
    ['setLanguage(lang)', 'void', 'setLanguage'],
    ['getLanguages()', 'string[]', 'getLanguages'],
  ]],
  ['lifecycle', 'grpLifecycle', [
    ['whenReady()', 'Promise<void>', 'mWhenReady'],
    ['isReady', 'boolean', 'mIsReady'],
    ['on(event, cb)', '() => void', 'on'],
    ['off(event, cb)', 'void', 'mOff'],
    ['dispose()', 'void', 'dispose'],
  ]],
]
const OPTIONS = [
  ['ui', "'minimal' | 'full' | 'kiosk'", "'minimal'", 'optUi'],
  ['validate', 'boolean', 'true', 'optValidate'],
  ['panel', 'boolean', 'false', 'optPanel'],
  ['lang', 'string', 'auto', 'optLang'],
  ['accent', '#rrggbb', 'brand', 'optAccent'],
  ['model', 'string', '—', 'optModel'],
  ['height · width', 'number | string', "'100%'", 'optSize'],
  ['baseUrl', 'string', 'auto', 'optBaseUrl'],
  ['loadTimeout', 'number', '120000', 'optTimeout'],
  ['className · title', 'string', '—', 'optMisc'],
  ['on* callbacks', 'function', '—', 'optCb'],
]
const EVENTS = [
  ['ready', '{ languages }', 'evReady'],
  ['model-progress', '{ percent, phase }', 'evProgress'],
  ['model-loaded', '{ modelId, fileName, elementCount, fromCache }', 'evLoaded'],
  ['validation-completed', '{ qualityScore, errors, warnings, info }', 'evValidation'],
  ['model-error', '{ message, url?, name? }', 'evError'],
  ['element-selected', '{ expressId, modelId, ifcType, name }', 'evSelected'],
  ['pointcloud-picked', '{ cloudId, position, sourcePosition, classification, intensity, distance }', 'evPointPicked'],
  ['map-feature-picked', '{ id, name?, label?, featureKind, heightM?, heightEstimated }', 'evMapPicked'],
]

// Section nav model (id, translation key); reuses existing localized keys.
const NAV = [
  ['quickstart', 'quickStart'],
  ['demo', 'demo'],
  ['how', 'howTitle'],
  ['concepts', 'conTitle'],
  ['api', 'apiTitle'],
  ['recipes', 'recTitle'],
  ['faq', 'faqTitle'],
]

// ── Code samples ──────────────────────────────────────────────────────────────
const HERO_SNIPPET =
`const viewer = new IfcViewer("#viewer");

await viewer.add("project.ifc", ifcBytes);
// → rendered, validated, all on the client`

const QS_JS =
`<div id="viewer" style="height:520px"></div>
<script type="module">
  import { IfcViewer } from "${HOSTED}";

  const viewer = new IfcViewer("#viewer");

  // Load IFC bytes from your app — nothing is uploaded
  const bytes = await fetch("/models/project.ifc").then(r => r.arrayBuffer());
  await viewer.add("project.ifc", bytes);
</script>`

const QS_WC =
`<script type="module" src="${HOSTED}"></script>

<ifc-viewer model="https://your-cde.com/model.ifc" ui="minimal" accent="#22c55e"
            style="display:block;height:520px"></ifc-viewer>`

const QS_REACT =
`import { useEffect, useRef } from "react";
import { IfcViewer } from "${HOSTED}";

export function ModelViewer({ url }) {
  const host = useRef(null);

  useEffect(() => {
    const viewer = new IfcViewer(host.current, { model: url });
    return () => viewer.dispose();   // StrictMode-safe teardown
  }, [url]);

  return <div ref={host} style={{ height: 520 }} />;
}`

const QS_VUE =
`<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { IfcViewer } from "${HOSTED}";

const host = ref(null);
let viewer;
onMounted(() => { viewer = new IfcViewer(host.value, { model: "https://host/m.ifc" }); });
onUnmounted(() => viewer && viewer.dispose());
</script>

<template>
  <div ref="host" style="height: 520px" />
</template>`

const CON_READY =
`// queues commands until ready
const viewer = new IfcViewer("#viewer");

// …or await an instance that is ready to use
const viewer = await IfcViewer.create("#viewer");`

const CON_BYTES =
`// you already have the bytes — no CORS, nothing uploaded
await viewer.add("a.ifc", bytes);

// …or load a public, CORS-enabled URL
await viewer.addFromUrl("https://host/b.ifc");`

const CON_EVENTS =
`const off = viewer.on("model-loaded", (m) => {
  console.log(m.fileName, m.elementCount);
});
// later: off();`

const CON_QUERIES =
`const models = await viewer.getModels();
const { qualityScore } = await viewer.getValidation();
const png = await viewer.screenshot();`

const REC_INSPECTOR =
`viewer.on("element-selected", async (e) => {
  const data = await viewer.getElement(e.expressId, e.modelId);
  renderPanel(data.name, data.globalId, data.propertySets);
});`

const REC_HEALTH =
`viewer.on("validation-completed", (v) => {
  setScore(v.qualityScore);                 // 0–100, or null
  setCounts(v.errors, v.warnings, v.info);
});`

const REC_IDS =
`const ids = await fetch("/specs/project.ids").then(r => r.text());
const res = await viewer.checkIds(ids);     // runs in a worker

res.specs.forEach((spec) => {
  row(spec.name, spec.status, spec.passedCount + "/" + spec.applicableCount);
  spec.failures.forEach((f) => onClick(() => viewer.select(f.expressId, f.modelId)));
});`

const REC_EIR =
`// An editable EIR profile — object, JSON, or the compact shorthand below.
const profile = {
  name: "Door QA",
  rules: [
    { type: "requiredProperty", entity: "IfcDoor", property: "FireRating", severity: "error" },
    { type: "allowedValues", entity: "IfcDoor", property: "FireRating",
      values: ["EI30", "EI60", "EI90"], severity: "warning" },
  ],
};
const res = await viewer.checkEir(profile);   // same IdsResult as checkIds
res.specs.forEach((spec) => {
  spec.failures.forEach((f) => row(spec.name, f.globalId, f.reasons.join(" · ")));
});`

const REC_THEME =
`new IfcViewer("#viewer", { accent: "#22c55e" });

// …or on the web component:
// <ifc-viewer accent="#22c55e" model="…"></ifc-viewer>`

const REC_LANG =
`// build a <select> from the bundled languages
IfcViewer.LANGUAGES.forEach(({ code, label }) => addOption(code, label));

// switch at runtime
viewer.setLanguage("ja");`

const WC_EXAMPLE =
`const el = document.querySelector("ifc-viewer");
el.addEventListener("ifcviewer:validation-completed", (e) => {
  updateScore(e.detail.qualityScore);
});
const stats = await el.getStats();`

// ── architecture diagram (themed via CSS classes) ─────────────────────────────
function diagram(tr) {
  const box = (x, w, title, sub) =>
    '<rect class="dg-box" x="' + x + '" y="46" width="' + w + '" height="78" rx="12"/>' +
    '<text class="dg-t" x="' + (x + w / 2) + '" y="80">' + esc(title) + '</text>' +
    (sub ? '<text class="dg-s" x="' + (x + w / 2) + '" y="100">' + esc(sub) + '</text>' : '')
  return (
    '<svg class="diagram" viewBox="0 0 720 180" role="img" aria-label="' + esc(tr('howDiagAlt')) + '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect class="dg-frame" x="300" y="28" width="408" height="124" rx="16"/>' +
    '<text class="dg-frame-l" x="504" y="146">' + esc(tr('dgBrowser')) + '</text>' +
    box(12, 150, tr('dgApp'), '') +
    box(318, 150, tr('dgSdk'), '') +
    box(540, 156, tr('dgIframe'), tr('dgEngine')) +
    '<g class="dg-arrow"><line x1="164" y1="85" x2="316" y2="85"/><polygon points="316,85 306,80 306,90"/>' +
    '<text class="dg-l" x="240" y="76">' + esc(tr('dgBytes')) + '</text></g>' +
    '<g class="dg-arrow"><line x1="470" y1="85" x2="538" y2="85"/><polygon points="538,85 528,80 528,90"/>' +
    '<text class="dg-l" x="504" y="76">' + esc(tr('dgPost')) + '</text></g>' +
    '</svg>'
  )
}

// ── render ────────────────────────────────────────────────────────────────────
function page(lang) {
  const t = T[lang]
  const tr = (k) => (t[k] != null ? t[k] : (T.en[k] != null ? T.en[k] : ''))
  const sdkPath = lang === 'en' ? './ifc-viewer.es.js' : '../ifc-viewer.es.js'
  const appUrl = lang === 'en' ? '../' : '../../'

  const eyebrow = (s) => '<p class="eyebrow">' + esc(s) + '</p>'
  // The <section> owns the id; the heading just links to it (no duplicate id).
  const h2 = (id, s) => '<h2><a class="anchor" href="#' + id + '" tabindex="-1" aria-hidden="true">#</a>' + esc(s) + '</h2>'

  // hero + trust
  const trust = [
    ['trustClient', '◆'], ['trustNoBackend', '↑'], ['trustDeps', '∅'], ['trustSize', '⌀'],
    ['trustTs', 'TS'], ['trustLangs', '文'], ['trustIds', '✓'],
  ].map(([k, ic]) => '<li><span class="t-ic" aria-hidden="true">' + ic + '</span>' + esc(tr(k)) + '</li>').join('')

  const hero =
    '<section class="hero">' +
    '<div class="hero-main">' +
    eyebrow(tr('heroEyebrow') + ' · v' + VERSION) +
    '<h1>' + esc(tr('h1')) + '</h1>' +
    '<p class="lede">' + esc(tr('lede')) + '</p>' +
    '<div class="cta"><a class="btn primary" href="#quickstart">' + esc(tr('ctaStart')) + '</a>' +
    '<a class="btn" href="#demo">' + esc(tr('ctaDemoBtn')) + '</a></div>' +
    '</div>' +
    '<div class="hero-peek"><p class="peek-l">' + esc(tr('heroPeek')) + '</p>' + code(HERO_SNIPPET, 'js', 'JavaScript') + '</div>' +
    '</section>' +
    '<ul class="trust" aria-label="' + esc(tr('heroEyebrow')) + '">' + trust + '</ul>'

  // quick start
  const tabs = (id, items, persist) => {
    const btns = items.map((it, i) =>
      '<button class="tab" role="tab" id="' + id + '-t' + i + '" aria-controls="' + id + '-p' + i + '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">' + esc(it[0]) + '</button>'
    ).join('')
    const panels = items.map((it, i) =>
      '<div class="tabpanel" role="tabpanel" id="' + id + '-p' + i + '" aria-labelledby="' + id + '-t' + i + '"' + (i === 0 ? '' : ' hidden') + '>' + it[1] + '</div>'
    ).join('')
    return '<div class="tabs"' + (persist ? ' data-persist="' + persist + '"' : '') + '><div class="tablist" role="tablist" aria-label="' + esc(tr('quickStart')) + '">' + btns + '</div>' + panels + '</div>'
  }
  const callout = (title, body) => '<div class="callout" role="note"><p class="callout-t">' + esc(title) + '</p><p>' + esc(body) + '</p></div>'

  const quickstart =
    '<section id="quickstart" class="sec">' + eyebrow(tr('qsKicker')) + h2('quickstart', tr('quickStart')) +
    '<p class="lede">' + esc(tr('qsLede')) + '</p>' +
    tabs('qs', [
      [tr('tabJs'), code(QS_JS, 'html', 'HTML')],
      [tr('tabWc'), '<p class="muted">' + esc(tr('qsWcNote')) + '</p>' + code(QS_WC, 'html', 'HTML')],
      [tr('tabReact'), '<p class="muted">' + esc(tr('qsReactNote')) + '</p>' + code(QS_REACT, 'js', 'React')],
      [tr('tabVue'), '<p class="muted">' + esc(tr('qsVueNote')) + '</p>' + code(QS_VUE, 'html', 'Vue')],
    ], 'fw') +
    callout(tr('qsSelfHostT'), tr('qsSelfHost')) +
    '<p class="muted small">' + esc(tr('qsNpmNote')) + '</p>' +
    '</section>'

  // demo
  const demoBtn = (id, label, primary) => '<button class="demo' + (primary ? ' primary' : '') + '" id="' + id + '"' + (primary ? '' : ' disabled') + '>' + esc(label) + '</button>'
  const demo =
    '<section id="demo" class="sec">' + eyebrow(tr('demoKicker')) + h2('demo', tr('demo')) +
    '<p class="lede">' + esc(tr('demoNote')) + '</p>' +
    '<div class="demo-wrap">' +
    '<div class="row">' +
    demoBtn('load', tr('btnLoad'), true) +
    demoBtn('isolate', tr('btnIsolate')) +
    demoBtn('top', tr('btnTop')) +
    demoBtn('fit', tr('btnFit')) +
    demoBtn('reset', tr('btnReset')) +
    '<button class="demo" id="shot" aria-label="Screenshot" disabled>📷</button>' +
    demoBtn('clear', tr('btnClear')) +
    '<span class="status" id="status" role="status" aria-live="polite">' + esc(tr('stIdle')) + '</span>' +
    '</div>' +
    '<div class="demo-meta"><span class="demo-call-l">' + esc(tr('demoCall')) + '</span> <code class="demo-call" id="democall">—</code></div>' +
    '<div class="bar-track"><div id="bar" class="bar-fill"></div></div>' +
    '<div class="viewer-shell"><div id="viewer" style="height:100%"></div></div>' +
    '<p class="demo-hint" id="demohint" role="alert" hidden>⚠ ' + esc(tr('demoErr')) + '</p>' +
    '</div></section>'

  // how it works
  const howCard = (tk, bk) => '<div class="card"><p class="card-t">' + esc(tr(tk)) + '</p><p>' + esc(tr(bk)) + '</p></div>'
  const how =
    '<section id="how" class="sec">' + eyebrow(tr('howKicker')) + h2('how', tr('howTitle')) +
    '<p class="lede">' + esc(tr('howLede')) + '</p>' +
    '<div class="diagram-wrap">' + diagram(tr) + '</div>' +
    '<div class="cards-3">' + howCard('how1T', 'how1B') + howCard('how2T', 'how2B') + howCard('how3T', 'how3B') + '</div>' +
    '<div class="cards-2">' + howCard('howWhyPrivT', 'howWhyPrivB') + howCard('howWhyScaleT', 'howWhyScaleB') + '</div>' +
    '</section>'

  // concepts
  const conRow = (tk, bk, snippet, mode, label) =>
    '<div class="concept"><div class="concept-txt"><p class="card-t">' + esc(tr(tk)) + '</p><p>' + esc(tr(bk)) + '</p></div>' +
    '<div class="concept-code">' + code(snippet, mode, label) + '</div></div>'
  const concepts =
    '<section id="concepts" class="sec">' + eyebrow(tr('conKicker')) + h2('concepts', tr('conTitle')) +
    '<p class="lede">' + esc(tr('conLede')) + '</p>' +
    conRow('con1T', 'con1B', CON_READY, 'js', 'JavaScript') +
    conRow('con2T', 'con2B', CON_BYTES, 'js', 'JavaScript') +
    conRow('con3T', 'con3B', CON_EVENTS, 'js', 'JavaScript') +
    conRow('con4T', 'con4B', CON_QUERIES, 'js', 'JavaScript') +
    '</section>'

  // api reference
  const apiRow = (sig, ret, key) =>
    '<div class="api-m" id="m-' + slug(sig.split(/[ (·]/)[0]) + '">' +
    '<div class="api-head"><code class="api-sig">' + esc(sig) + '</code><span class="api-ret">' + esc(ret) + '</span></div>' +
    '<p class="api-desc">' + esc(tr(key)) + '</p></div>'
  const apiGroups = API_GROUPS.map(([gid, gk, methods]) =>
    '<div class="api-group" id="grp-' + gid + '"><h3>' + esc(tr(gk)) + '</h3>' + methods.map((m) => apiRow(m[0], m[1], m[2])).join('') + '</div>'
  ).join('')
  const optRows = OPTIONS.map(([name, type, def, key]) =>
    '<tr><td><code>' + esc(name) + '</code></td><td><code class="muted-code">' + esc(type) + '</code></td><td><code class="muted-code">' + esc(def) + '</code></td><td>' + esc(tr(key)) + '</td></tr>'
  ).join('')
  const evRows = EVENTS.map(([name, payload, key]) =>
    '<tr><td><code>' + esc(name) + '</code></td><td><code class="muted-code">' + esc(payload) + '</code></td><td>' + esc(tr(key)) + '</td></tr>'
  ).join('')
  const wcChips = ['model', 'ui', 'lang', 'accent', 'validate', 'panel', 'base-url'].map((a) => '<code class="chip">' + a + '</code>').join('')
  const api =
    '<section id="api" class="sec">' + eyebrow(tr('apiKicker')) + h2('api', tr('apiTitle')) +
    '<p class="lede">' + esc(tr('apiLede')) + '</p>' +
    '<div class="api-groups">' + apiGroups + '</div>' +
    '<p class="muted small">' + esc(tr('serializedNote')) + '</p>' +
    '<h3 id="grp-options">' + esc(tr('grpOptions')) + '</h3>' +
    '<div class="table-wrap"><table class="dt"><thead><tr><th>' + esc(tr('colOption')) + '</th><th>' + esc(tr('colType')) + '</th><th>' + esc(tr('colDefault')) + '</th><th>' + esc(tr('colDesc')) + '</th></tr></thead><tbody>' + optRows + '</tbody></table></div>' +
    '<h3 id="grp-events">' + esc(tr('events')) + '</h3>' +
    '<div class="table-wrap"><table class="dt"><thead><tr><th>' + esc(tr('colEvent')) + '</th><th>' + esc(tr('colPayload')) + '</th><th>' + esc(tr('colDesc')) + '</th></tr></thead><tbody>' + evRows + '</tbody></table></div>' +
    callout(tr('staticsT'), tr('staticsB')) +
    '<h3 id="grp-wc">' + esc(tr('grpWc')) + '</h3>' +
    '<p>' + esc(tr('qsWcNote')) + '</p>' +
    '<p class="muted small"><b>' + esc(tr('wcAttrsT')) + ':</b> ' + wcChips + '</p>' +
    '<p>' + esc(tr('wcEventsB')) + '</p>' +
    code(WC_EXAMPLE, 'js', 'JavaScript') +
    '</section>'

  // recipes
  const recipe = (tk, bk, snippet) =>
    '<div class="recipe"><p class="card-t">' + esc(tr(tk)) + '</p><p class="muted">' + esc(tr(bk)) + '</p>' + code(snippet, 'js', 'JavaScript') + '</div>'
  const recipes =
    '<section id="recipes" class="sec">' + eyebrow(tr('recKicker')) + h2('recipes', tr('recTitle')) +
    '<p class="lede">' + esc(tr('recLede')) + '</p>' +
    recipe('rec1T', 'rec1B', REC_INSPECTOR) +
    recipe('rec2T', 'rec2B', REC_HEALTH) +
    recipe('rec3T', 'rec3B', REC_IDS) +
    recipe('rec6T', 'rec6B', REC_EIR) +
    recipe('rec4T', 'rec4B', REC_THEME) +
    recipe('rec5T', 'rec5B', REC_LANG) +
    '</section>'

  // troubleshooting
  const faqItem = (qk, ak) => '<details class="faq"><summary>' + esc(tr(qk)) + '</summary><div class="faq-body"><p>' + esc(tr(ak)) + '</p></div></details>'
  const faq =
    '<section id="faq" class="sec">' + eyebrow(tr('faqKicker')) + h2('faq', tr('faqTitle')) +
    '<p class="lede">' + esc(tr('faqLede')) + '</p>' +
    faqItem('faqNothingQ', 'faqNothingA') +
    faqItem('faqCorsQ', 'faqCorsA') +
    faqItem('faqFrameQ', 'faqFrameA') +
    faqItem('faqDetachQ', 'faqDetachA') +
    faqItem('faqTimeoutQ', 'faqTimeoutA') +
    faqItem('faqBrowserQ', 'faqBrowserA') +
    faqItem('faqDevQ', 'faqDevA') +
    '</section>'

  // rail
  const railItems = NAV.map(([id, k]) => '<li><a href="#' + id + '" data-spy="' + id + '">' + esc(tr(k)) + '</a></li>').join('')
  const rail = '<aside class="rail"><nav aria-label="' + esc(tr('onThisPage')) + '"><p class="rail-h">' + esc(tr('onThisPage')) + '</p><ul>' + railItems + '</ul></nav></aside>'

  const footer =
    '<footer class="footer"><div class="shell footer-in">' +
    '<p class="foot-tag">' + esc(tr('footTagline')) + '</p>' +
    '<p class="muted small">' + esc(tr('privacy')) + '</p>' +
    '<p class="foot-links"><a href="' + appUrl + '">' + esc(tr('openApp')) + '</a><span>·</span>' +
    '<a href="mailto:joelbenitezdonari@gmail.com">' + esc(tr('footContact')) + '</a><span>·</span>' +
    '<span class="muted">' + esc(tr('footStable')) + ' · v' + VERSION + '</span></p>' +
    '</div></footer>'

  const demoI18n = JSON.stringify({ ready: t.stReady, fetching: t.stFetching, handing: t.stHanding, cleared: t.stCleared })

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <meta name="color-scheme" content="dark light" />
  <title>${esc(t.title)}</title>
  <meta name="description" content="${esc(t.desc)}" />
  <script>try{var th=localStorage.getItem('ifcsdk-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',th);}catch(e){document.documentElement.setAttribute('data-theme','dark');}</script>
  <style>${CSS}</style>
</head>
<body>
  <a class="skip" href="#main">${esc(tr('skip'))}</a>
  <header class="topbar"><div class="shell topbar-in">
    <a class="brand" href="#main"><span class="brand-dot" aria-hidden="true"></span>IFC&nbsp;Viewer&nbsp;SDK</a>
    <span class="ver">v${VERSION}</span>
    <span class="grow"></span>
    <a class="tb-link" href="${appUrl}">${esc(tr('openApp'))}</a>
    <details class="lang"><summary aria-label="${esc(tr('langLabel'))}">${esc(LANG_LABEL[lang])}</summary><div class="lang-menu" role="menu">${langLinks(lang)}</div></details>
    <button id="theme" class="icon-btn" type="button" aria-label="${esc(tr('themeLabel'))}"><span aria-hidden="true">◐</span></button>
  </div></header>

  <div class="shell layout">
    ${rail}
    <main id="main" tabindex="-1">
      ${hero}
      ${quickstart}
      ${demo}
      ${how}
      ${concepts}
      ${api}
      ${recipes}
      ${faq}
    </main>
  </div>
  ${footer}

  <script>${UI_JS}</script>
  <script type="module">
    import { IfcViewer } from "${sdkPath}";
    const SAMPLE = "https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc";
    const I18N = ${demoI18n};
    const $ = function (id) { return document.getElementById(id); };
    const statusEl = $("status"), barEl = $("bar"), callEl = $("democall");
    const setStatus = function (s) { statusEl.textContent = s; };
    const setBar = function (p) { barEl.style.width = (p || 0) + "%"; };
    const setCall = function (c) { if (callEl) callEl.textContent = c; };
    const hint = function (on) { var h = $("demohint"); if (h) h.hidden = !on; };
    const controls = ["isolate", "top", "fit", "reset", "shot", "clear"];
    const setEnabled = function (on) { controls.forEach(function (id) { var b = $(id); if (b) b.disabled = !on; }); };

    const viewer = new IfcViewer("#viewer", { ui: "minimal" });
    viewer.on("ready", function () { setStatus(I18N.ready); $("load").disabled = false; });
    viewer.on("model-progress", function (p) { setBar(p.percent); setStatus(p.phase + "… " + Math.round(p.percent) + "%"); });
    viewer.on("model-loaded", function (m) { setBar(100); setEnabled(true); setStatus("✓ " + m.fileName + " · " + m.elementCount); });
    viewer.on("validation-completed", function (v) { if (v.qualityScore != null) setStatus("Health Score: " + v.qualityScore + " / 100"); });
    viewer.on("model-error", function (e) { setStatus("⚠ " + e.message); hint(true); });
    viewer.on("element-selected", function (e) { setStatus(e.ifcType + " #" + e.expressId); });

    $("load").addEventListener("click", async function () {
      setStatus(I18N.fetching); setBar(0); hint(false); setCall('await viewer.add("Ifc4_SampleHouse.ifc", bytes)');
      try {
        const bytes = await fetch(SAMPLE).then(function (r) { return r.arrayBuffer(); });
        setStatus(I18N.handing);
        await viewer.add("Ifc4_SampleHouse.ifc", bytes);
      } catch (err) { setStatus("⚠ " + (err && err.message || err)); hint(true); }
    });
    $("isolate").addEventListener("click", function () { setCall('viewer.isolate("IfcWall")'); viewer.isolate("IfcWall"); });
    $("top").addEventListener("click", function () { setCall('viewer.setView("top")'); viewer.setView("top"); });
    $("fit").addEventListener("click", function () { setCall('viewer.fit()'); viewer.fit(); });
    $("reset").addEventListener("click", function () { setCall('viewer.reset()'); viewer.reset(); });
    $("clear").addEventListener("click", function () { setCall('viewer.clear()'); viewer.clear(); setBar(0); setEnabled(false); setStatus(I18N.cleared); });
    $("shot").addEventListener("click", async function () { setCall('await viewer.screenshot()'); try { const url = await viewer.screenshot(); if (url) window.open(url, "_blank"); } catch (e) { setStatus("⚠ " + (e && e.message || e)); } });
  </script>
</body>
</html>
`
}

// ── stylesheet ────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}
html{scroll-behavior:smooth}
:root{
  --maxw:1180px; --rail:212px; --bar-h:54px;
  --bg:#0b0b0f; --bg2:#0e0e13; --surface:#15151b; --raised:#1b1b23;
  --border:#262630; --border2:#33333f; --chip:#1a1a21;
  --text:#ECECF1; --dim:#B7B7C4; --faint:#8E8E9E;
  --accent:#828CF2; --accent-strong:#9aa3ff; --accent-ink:#0b0b13;
  --accent-tint:rgba(130,140,242,.14); --accent-line:rgba(130,140,242,.40);
  --code-bg:#0a0a10; --code-bd:#1d1d27; --shadow:0 1px 0 rgba(255,255,255,.02);
}
:root[data-theme="light"]{
  --bg:#FbFbFd; --bg2:#fff; --surface:#fff; --raised:#fff;
  --border:#E7E7EE; --border2:#DADAE3; --chip:#F1F1F5;
  --text:#16161D; --dim:#54545F; --faint:#74747F;
  --accent:#4F46E5; --accent-strong:#4338CA; --accent-ink:#fff;
  --accent-tint:rgba(79,70,229,.08); --accent-line:rgba(79,70,229,.30);
  --code-bg:#0d0d14; --code-bd:#21212c; --shadow:0 1px 2px rgba(20,20,40,.05);
}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.shell{max-width:var(--maxw);margin:0 auto;padding:0 24px}
.grow{flex:1}
.muted{color:var(--dim)}
.small{font-size:13px}
.skip{position:absolute;left:-9999px;top:0;z-index:100;background:var(--accent);color:var(--accent-ink);padding:10px 14px;border-radius:8px}
.skip:focus{left:14px;top:10px}
/* topbar */
.topbar{position:sticky;top:0;z-index:40;height:var(--bar-h);border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
.topbar-in{display:flex;align-items:center;gap:12px;height:var(--bar-h)}
.brand{display:inline-flex;align-items:center;gap:9px;color:var(--text);font-weight:650;font-size:14px;letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.brand-dot{width:11px;height:11px;border-radius:3px;background:linear-gradient(135deg,var(--accent),var(--accent-strong));box-shadow:0 0 0 3px var(--accent-tint)}
.ver{font:600 11px/1 ui-monospace,monospace;color:var(--faint);border:1px solid var(--border);border-radius:999px;padding:4px 7px}
.tb-link{color:var(--dim);font-size:13px;font-weight:500}
.icon-btn{cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--dim);font-size:16px}
.icon-btn:hover{color:var(--text);border-color:var(--border2)}
.lang{position:relative}
.lang>summary{cursor:pointer;list-style:none;font-size:13px;color:var(--dim);border:1px solid var(--border);background:var(--surface);border-radius:9px;padding:7px 11px}
.lang>summary::-webkit-details-marker{display:none}
.lang>summary::after{content:"▾";margin-left:6px;color:var(--faint)}
.lang[open]>summary{color:var(--text);border-color:var(--border2)}
.lang-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:148px;background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:1px;z-index:50}
.lang-menu a{display:block;padding:8px 11px;border-radius:8px;color:var(--dim);font-size:13.5px}
.lang-menu a:hover{background:var(--accent-tint);color:var(--text);text-decoration:none}
.lang-menu a[aria-current]{color:var(--text);font-weight:600;background:var(--accent-tint)}
/* layout */
.layout{display:grid;grid-template-columns:var(--rail) minmax(0,1fr);gap:48px;align-items:start;padding-top:8px}
.rail{position:sticky;top:calc(var(--bar-h) + 18px);align-self:start;max-height:calc(100vh - var(--bar-h) - 36px);overflow:auto}
.rail-h{font:600 11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin:0 0 10px}
.rail ul{list-style:none;margin:0;padding:0;border-left:1px solid var(--border)}
.rail a{display:block;padding:6px 0 6px 14px;margin-left:-1px;border-left:2px solid transparent;color:var(--faint);font-size:13.5px}
.rail a:hover{color:var(--dim);text-decoration:none}
.rail a.on{color:var(--text);border-left-color:var(--accent);font-weight:550}
main{min-width:0;padding-bottom:80px}
main>section,.hero{scroll-margin-top:calc(var(--bar-h) + 20px)}
/* typography */
.eyebrow{font:650 12px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin:0 0 12px}
h1{font-size:clamp(30px,4.4vw,42px);line-height:1.08;letter-spacing:-.025em;margin:0 0 14px;font-weight:700}
h2{font-size:25px;letter-spacing:-.02em;margin:0 0 8px;font-weight:680;position:relative}
h3{font-size:16px;letter-spacing:-.01em;margin:30px 0 12px;font-weight:650;color:var(--text)}
.anchor{position:absolute;left:-20px;color:var(--faint);opacity:0;text-decoration:none;font-weight:400}
h2:hover .anchor{opacity:1}
.lede{color:var(--dim);font-size:16.5px;line-height:1.6;max-width:66ch;margin:0 0 4px}
.sec{padding:44px 0;border-top:1px solid var(--border)}
.sec p{max-width:68ch}
/* hero */
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:36px;align-items:center;padding:40px 0 30px}
.hero .lede{margin-bottom:22px}
.cta{display:flex;gap:10px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600;border:1px solid var(--border2);color:var(--text);background:var(--surface)}
.btn:hover{border-color:var(--accent);text-decoration:none}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.primary:hover{background:var(--accent-strong);border-color:var(--accent-strong)}
.peek-l{font:600 11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin:0 0 10px}
/* trust */
.trust{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:8px 0 0;padding:18px 0 0;border-top:1px solid var(--border)}
.trust li{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:7px 12px;font-size:13px;color:var(--dim);box-shadow:var(--shadow)}
.t-ic{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:var(--accent-tint);color:var(--accent-strong);font:600 10px/1 ui-monospace,monospace}
/* code */
.code{margin:16px 0;border:1px solid var(--code-bd);border-radius:12px;overflow:hidden;background:var(--code-bg)}
.code-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--code-bd);background:rgba(255,255,255,.02)}
.code-lang{font:600 11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em;color:#8b8ba0}
.copy{cursor:pointer;font:600 11.5px/1 ui-monospace,monospace;color:#a9b0d6;background:transparent;border:1px solid var(--code-bd);border-radius:7px;padding:5px 9px}
.copy:hover{color:#fff;border-color:#3a3a4a}
.copy.ok{color:#9ece6a;border-color:#3a4a32}
.code pre{margin:0;padding:15px 16px;overflow:auto;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cdd2e6}
.code code{font:inherit}
.t-com{color:#6b7394;font-style:italic}
.t-str{color:#9ece6a}
.t-kw{color:#bb9af7}
.t-const{color:#ff9e64}
.t-num{color:#ff9e64}
.t-tag{color:#7aa2f7}
.t-attr{color:#7dcfff}
:where(p,li,.lede,td,summary,.api-desc) code{font:12.5px/1 ui-monospace,monospace;background:var(--chip);border:1px solid var(--border);border-radius:5px;padding:2px 5px;color:var(--text)}
.muted-code{color:var(--dim)!important;background:transparent!important;border:0!important;padding:0!important}
/* tabs */
.tabs{margin:18px 0}
.tablist{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:2px}
.tab{cursor:pointer;font:600 13px/1 inherit;color:var(--faint);background:transparent;border:0;border-bottom:2px solid transparent;padding:10px 13px;margin-bottom:-1px;border-radius:7px 7px 0 0}
.tab:hover{color:var(--dim)}
.tab[aria-selected="true"]{color:var(--text);border-bottom-color:var(--accent)}
.callout{display:flex;flex-direction:column;gap:3px;border:1px solid var(--border);border-left:3px solid var(--accent);background:var(--surface);border-radius:10px;padding:13px 16px;margin:18px 0}
.callout-t{font-weight:650;margin:0;font-size:14px}
.callout p{margin:0;color:var(--dim);font-size:14px;max-width:none}
/* demo */
.demo-wrap{margin-top:8px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px}
button.demo{cursor:pointer;font:600 13px/1 inherit;color:var(--text);background:var(--surface);border:1px solid var(--border2);padding:10px 13px;border-radius:9px;min-height:38px}
button.demo:hover:not(:disabled){border-color:var(--accent)}
button.demo:disabled{opacity:.45;cursor:not-allowed}
button.demo.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.status{font:12px/1 ui-monospace,monospace;color:var(--faint);align-self:center;margin-left:auto}
.demo-meta{display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 8px;color:var(--faint)}
.demo-call-l{font:600 10px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em}
.demo-call{font:12.5px/1 ui-monospace,monospace;color:var(--accent-strong)}
.bar-track{height:3px;border-radius:999px;background:var(--border);overflow:hidden;margin:0 0 10px}
.bar-fill{height:100%;width:0;background:var(--accent);transition:width .2s ease}
.viewer-shell{position:relative;height:520px;border-radius:14px;overflow:hidden;border:1px solid var(--accent-line);background:var(--bg2)}
.demo-hint{margin:10px 0 0;font-size:13px;color:#e0a85a}
/* cards / how */
.diagram-wrap{margin:18px 0 24px;border:1px solid var(--border);border-radius:14px;background:var(--surface);padding:18px}
.diagram{width:100%;height:auto}
.dg-box{fill:var(--raised);stroke:var(--border2)}
.dg-frame{fill:var(--accent-tint);stroke:var(--accent-line);stroke-dasharray:4 4}
.dg-t{fill:var(--text);font:600 13px ui-monospace,monospace;text-anchor:middle}
.dg-s{fill:var(--faint);font:10px ui-monospace,monospace;text-anchor:middle}
.dg-l{fill:var(--dim);font:600 10px ui-monospace,monospace;text-anchor:middle}
.dg-frame-l{fill:var(--accent-strong);font:600 10px ui-monospace,monospace;text-anchor:middle}
.dg-arrow line{stroke:var(--accent);stroke-width:1.5}
.dg-arrow polygon{fill:var(--accent)}
.cards-3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:8px 0}
.cards-2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:12px 0 0}
.card{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:15px 16px;box-shadow:var(--shadow)}
.card-t{font-weight:650;margin:0 0 6px;font-size:14.5px}
.card p{margin:0;color:var(--dim);font-size:13.5px;max-width:none}
/* concepts */
.concept{display:grid;grid-template-columns:.85fr 1.15fr;gap:24px;align-items:center;padding:22px 0;border-top:1px solid var(--border)}
.concept:first-of-type{border-top:0}
.concept-txt .card-t{font-size:16px}
.concept-txt p{color:var(--dim);margin:0;max-width:46ch}
.concept-code{min-width:0}
.concept-code .code{margin:0}
/* api */
.api-groups{margin-top:12px}
.api-group{margin:0 0 8px;padding:18px 0 6px;border-top:1px solid var(--border)}
.api-group:first-child{border-top:0;padding-top:6px}
.api-group h3{margin:0 0 10px}
.api-m{padding:11px 0;border-bottom:1px solid var(--border)}
.api-m:last-child{border-bottom:0}
.api-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.api-sig{font:13px/1.5 ui-monospace,monospace;color:var(--text);background:transparent;border:0;padding:0}
.api-ret{font:12px/1.5 ui-monospace,monospace;color:var(--accent-strong)}
.api-desc{margin:5px 0 0;color:var(--dim);font-size:14px}
.table-wrap{overflow-x:auto;margin:10px 0 6px;border:1px solid var(--border);border-radius:12px}
table.dt{border-collapse:collapse;width:100%;font-size:13.5px;min-width:520px}
table.dt th{text-align:left;padding:10px 14px;color:var(--faint);font:600 11px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border);background:var(--surface)}
table.dt td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:top;color:var(--dim)}
table.dt tr:last-child td{border-bottom:0}
table.dt td code{white-space:nowrap}
.chip{display:inline-block;font:12px/1 ui-monospace,monospace;background:var(--chip);border:1px solid var(--border);border-radius:6px;padding:3px 7px;margin:0 4px 4px 0;color:var(--text)}
/* recipes */
.recipe{padding:20px 0;border-top:1px solid var(--border)}
.recipe:first-of-type{border-top:0}
.recipe .card-t{font-size:15.5px;margin-bottom:3px}
.recipe>p.muted{margin:0;max-width:60ch}
/* faq */
.faq{border:1px solid var(--border);border-radius:11px;margin:8px 0;background:var(--surface);overflow:hidden}
.faq>summary{cursor:pointer;list-style:none;padding:14px 16px;font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:10px}
.faq>summary::-webkit-details-marker{display:none}
.faq>summary::before{content:"+";color:var(--accent);font:700 16px/1 ui-monospace,monospace;width:14px}
.faq[open]>summary::before{content:"–"}
.faq-body{padding:0 16px 15px 40px}
.faq-body p{margin:0;color:var(--dim);font-size:14px}
/* footer */
.footer{border-top:1px solid var(--border);background:var(--bg2);margin-top:20px}
.footer-in{padding:30px 24px 44px}
.foot-tag{font-weight:600;margin:0 0 6px}
.foot-links{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 0;font-size:13.5px}
.foot-links span{color:var(--faint)}
/* responsive */
@media (max-width:1024px){
  .layout{grid-template-columns:1fr;gap:0}
  .rail{display:none}
  .hero{grid-template-columns:1fr;gap:24px}
  .cards-3{grid-template-columns:1fr}
  .cards-2{grid-template-columns:1fr}
  .concept{grid-template-columns:1fr;gap:14px}
}
@media (max-width:560px){
  .shell{padding:0 16px}
  .tb-link{display:none}
  .viewer-shell{height:62vh;min-height:360px}
  .status{margin-left:0;width:100%}
  h2{font-size:22px}
}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *{transition:none!important;animation:none!important}
}
`

// ── runtime UI (theme, tabs, copy, scroll-spy) ────────────────────────────────
const UI_JS = `
(function () {
  var d = document, root = d.documentElement;
  var tbtn = d.getElementById('theme');
  if (tbtn) tbtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ifcsdk-theme', next); } catch (e) {}
  });

  d.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-copy]') : null;
    if (!b) return;
    var fig = b.closest('.code'); if (!fig) return;
    var c = fig.querySelector('code'); if (!c) return;
    var txt = c.textContent, orig = b.textContent;
    var done = function () {
      b.textContent = b.getAttribute('data-copied') || 'Copied';
      b.classList.add('ok');
      setTimeout(function () { b.textContent = orig; b.classList.remove('ok'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
    else { try { var ta = d.createElement('textarea'); ta.value = txt; d.body.appendChild(ta); ta.select(); d.execCommand('copy'); d.body.removeChild(ta); done(); } catch (e) {} }
  });

  // close the language menu on outside click
  d.addEventListener('click', function (ev) {
    d.querySelectorAll('details.lang[open]').forEach(function (el) {
      if (!el.contains(ev.target)) el.removeAttribute('open');
    });
  });

  Array.prototype.forEach.call(d.querySelectorAll('[role=tablist]'), function (tl) {
    var tabs = Array.prototype.slice.call(tl.querySelectorAll('[role=tab]'));
    var wrap = tl.closest('.tabs');
    var persist = wrap ? wrap.getAttribute('data-persist') : null;
    function activate(i, focus) {
      tabs.forEach(function (t, j) {
        var sel = j === i;
        t.setAttribute('aria-selected', sel ? 'true' : 'false');
        t.tabIndex = sel ? 0 : -1;
        var p = d.getElementById(t.getAttribute('aria-controls'));
        if (p) { if (sel) p.removeAttribute('hidden'); else p.setAttribute('hidden', ''); }
        if (sel && focus) t.focus();
      });
      if (persist) { try { localStorage.setItem('ifcsdk-tab-' + persist, String(i)); } catch (e) {} }
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { activate(i); });
      t.addEventListener('keydown', function (e) {
        var n;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        else return;
        e.preventDefault(); activate(n, true);
      });
    });
    if (persist) { try { var s = localStorage.getItem('ifcsdk-tab-' + persist); if (s != null) { var idx = parseInt(s, 10); if (idx >= 0 && idx < tabs.length) activate(idx); } } catch (e) {} }
  });

  var spies = d.querySelectorAll('[data-spy]');
  if (spies.length && 'IntersectionObserver' in window) {
    var map = {};
    Array.prototype.forEach.call(spies, function (a) { map[a.getAttribute('data-spy')] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Array.prototype.forEach.call(spies, function (a) { a.removeAttribute('aria-current'); a.classList.remove('on'); });
        var a = map[en.target.id];
        if (a) { a.setAttribute('aria-current', 'true'); a.classList.add('on'); }
      });
    }, { rootMargin: '-42% 0px -50% 0px' });
    Array.prototype.forEach.call(d.querySelectorAll('main section[id]'), function (s) { obs.observe(s); });
  }
})();
`

for (const lang of LANGS) {
  const dir = lang === 'en' ? OUT : resolve(OUT, lang)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), page(lang), 'utf8')
}
console.log(`  ✓ SDK docs: ${LANGS.length} localized pages → public/sdk/{,<lang>/}index.html (v${VERSION})`)
