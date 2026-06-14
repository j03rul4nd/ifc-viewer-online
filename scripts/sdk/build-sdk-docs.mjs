// Generates the localized IFC Viewer SDK docs/demo pages into public/sdk/.
//   en  → public/sdk/index.html
//   xx  → public/sdk/<xx>/index.html   (es, de, fr, pt, it, ca, zh, ja, th)
// Each page dogfoods the SDK (live demo) and links all languages.
//
//   node scripts/sdk/build-sdk-docs.mjs   (also runs as part of `npm run build:sdk`)

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(ROOT, 'public/sdk')

const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const LANG_LABEL = {
  en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português',
  it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ไทย',
}

const METHODS = [
  ['new IfcViewer(target, options?)', 'construct'],
  ['add(name, bytes)', 'add'],
  ['addFromUrl(url, name?)', 'addFromUrl'],
  ['select(expressId)', 'select'],
  ['isolate(ifcType?)', 'isolate'],
  ['setView(view)', 'setView'],
  ['fit() · reset()', 'fitReset'],
  ['showAll()', 'showAll'],
  ['setLanguage(lang)', 'setLanguage'],
  ['clear()', 'clear'],
  ['getLanguages()', 'getLanguages'],
  ['getModels()', 'getModels'],
  ['getElement(id, modelId?)', 'getElement'],
  ['getValidation()', 'getValidation'],
  ['getStats()', 'getStats'],
  ['getIssues(opts?)', 'getIssues'],
  ['checkIds(idsXml)', 'checkIds'],
  ['screenshot()', 'screenshot'],
  ['removeModel(modelId)', 'removeModel'],
  ['hideElements(ids) · showElements(ids)', 'hideShow'],
  ['setCamera(pos, dir)', 'setCamera'],
  ['on(event, cb)', 'on'],
  ['dispose()', 'dispose'],
]
const EVENTS = [
  ['ready', 'evReady'],
  ['model-progress', 'evProgress'],
  ['model-loaded', 'evLoaded'],
  ['validation-completed', 'evValidation'],
  ['model-error', 'evError'],
  ['element-selected', 'evSelected'],
]

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  en: {
    title: 'IFC Viewer SDK — embed the viewer in your CDE or app',
    desc: 'Drop the IFC viewer into your CDE, digital twin, or internal tools. Load IFC bytes from your own app — parsing stays in the browser. No upload backend.',
    h1: 'Embed the viewer in your own product',
    lede: 'Insert the same browser viewer into your CDE, digital twin, or internal project tools. Load IFC data straight from your app while model processing stays on the client.',
    b1: 'No upload backend required', b2: 'Runs directly in the browser', b3: 'Ready for IFC, BCF & IDS',
    quickStart: 'Quick start',
    quickNote: 'The SDK auto-discovers the app URL relative to this script, so self-hosting just works.',
    demo: 'Live demo', demoNote: 'This page uses the SDK itself. Click to fetch a sample IFC and hand its bytes to the viewer.',
    btnLoad: 'Load sample IFC', btnIsolate: 'Isolate walls', btnTop: 'Top view', btnFit: 'Fit', btnReset: 'Reset camera', btnClear: 'Clear',
    stIdle: 'idle', stReady: 'ready — click “Load sample IFC”', stFetching: 'fetching sample IFC…', stHanding: 'handing bytes to the viewer…', stCleared: 'cleared',
    api: 'API', colMethod: 'Method', colDesc: 'Description',
    construct: 'Mount in a CSS selector or element. Options: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: 'Load IFC bytes (ArrayBuffer/Uint8Array) from your app. Returns a promise with the loaded model info.',
    addFromUrl: 'Load a public, CORS-enabled IFC URL.',
    select: 'Select and frame an element by IFC expressID.',
    isolate: 'Isolate a category (e.g. "IfcWall"); omit to clear.',
    setView: 'Fly to a camera view: iso, top, front, right, left, back, bottom.',
    fitReset: 'Frame the active model / reset the camera.',
    showAll: 'Restore full visibility (clear hidden + isolation).',
    setLanguage: 'Change the UI language at runtime.',
    clear: 'Remove all loaded models.',
    getLanguages: 'List the supported language codes (see IfcViewer.LANGUAGES for labels).',
    on: 'Subscribe / unsubscribe to events; returns an unsubscribe function.',
    dispose: 'Tear down and remove the iframe.',
    events: 'Events',
    evReady: 'Viewer mounted and ready ({ languages }).',
    evProgress: 'Load progress ({ percent, phase }).',
    evLoaded: 'A model finished loading ({ modelId, fileName, elementCount }).',
    evValidation: 'Validation finished — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'A load failed ({ message }).',
    evSelected: 'The user picked an element ({ expressId, ifcType, name }).',
    privacy: "The model is fetched in the visitor's browser and parsed client-side with WebAssembly — nothing is uploaded to our servers.",
    langLabel: 'Language',
  },
  es: {
    title: 'IFC Viewer SDK — integra el visor en tu CDE o app',
    desc: 'Integra el visor IFC en tu CDE, gemelo digital o herramientas internas. Carga bytes IFC desde tu propia app — el parseo ocurre en el navegador. Sin backend de subida.',
    h1: 'Integra el visor en tu propio producto',
    lede: 'Inserta el mismo visor del navegador en tu CDE, gemelo digital o herramientas internas de proyecto. Carga datos IFC desde tu app mientras el procesamiento del modelo permanece en el cliente.',
    b1: 'Sin backend de subida', b2: 'Se ejecuta directamente en el navegador', b3: 'Preparado para IFC, BCF e IDS',
    quickStart: 'Inicio rápido',
    quickNote: 'El SDK descubre la URL de la app de forma relativa a este script, así que el auto-alojamiento funciona sin más.',
    demo: 'Demo en vivo', demoNote: 'Esta página usa el propio SDK. Pulsa para descargar un IFC de ejemplo y pasar sus bytes al visor.',
    btnLoad: 'Cargar IFC de ejemplo', btnIsolate: 'Aislar muros', btnTop: 'Vista superior', btnFit: 'Encuadrar', btnReset: 'Reiniciar cámara', btnClear: 'Limpiar',
    stIdle: 'inactivo', stReady: 'listo — pulsa «Cargar IFC de ejemplo»', stFetching: 'descargando IFC de ejemplo…', stHanding: 'pasando bytes al visor…', stCleared: 'limpiado',
    api: 'API', colMethod: 'Método', colDesc: 'Descripción',
    construct: 'Monta en un selector CSS o elemento. Opciones: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: 'Carga bytes IFC (ArrayBuffer/Uint8Array) desde tu app. Devuelve una promesa con la info del modelo.',
    addFromUrl: 'Carga una URL IFC pública con CORS habilitado.',
    select: 'Selecciona y encuadra un elemento por su expressID IFC.',
    isolate: 'Aísla una categoría (p. ej. "IfcWall"); omítelo para limpiar.',
    setView: 'Vuela a una vista de cámara: iso, top, front, right, left, back, bottom.',
    fitReset: 'Encuadra el modelo activo / reinicia la cámara.',
    showAll: 'Restaura toda la visibilidad (quita ocultos y aislamiento).',
    setLanguage: 'Cambia el idioma de la interfaz en tiempo de ejecución.',
    clear: 'Elimina todos los modelos cargados.',
    getLanguages: 'Lista los códigos de idioma soportados (ver IfcViewer.LANGUAGES para etiquetas).',
    on: 'Suscríbete / cancela eventos; devuelve una función para desuscribir.',
    dispose: 'Desmonta y elimina el iframe.',
    events: 'Eventos',
    evReady: 'Visor montado y listo ({ languages }).',
    evProgress: 'Progreso de carga ({ percent, phase }).',
    evLoaded: 'Un modelo terminó de cargar ({ modelId, fileName, elementCount }).',
    evValidation: 'Validación terminada — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Falló una carga ({ message }).',
    evSelected: 'El usuario seleccionó un elemento ({ expressId, ifcType, name }).',
    privacy: 'El modelo se descarga en el navegador del visitante y se parsea en el cliente con WebAssembly — no se sube nada a nuestros servidores.',
    langLabel: 'Idioma',
  },
  de: {
    title: 'IFC Viewer SDK — den Viewer in dein CDE oder deine App einbetten',
    desc: 'Binde den IFC-Viewer in dein CDE, deinen digitalen Zwilling oder interne Tools ein. Lade IFC-Bytes aus deiner App — das Parsen bleibt im Browser. Kein Upload-Backend.',
    h1: 'Binde den Viewer in dein eigenes Produkt ein',
    lede: 'Füge denselben Browser-Viewer in dein CDE, deinen digitalen Zwilling oder interne Projekt-Tools ein. Lade IFC-Daten direkt aus deiner App, während die Modellverarbeitung im Client bleibt.',
    b1: 'Kein Upload-Backend nötig', b2: 'Läuft direkt im Browser', b3: 'Bereit für IFC, BCF & IDS',
    quickStart: 'Schnellstart',
    quickNote: 'Das SDK ermittelt die App-URL relativ zu diesem Skript — Self-Hosting funktioniert ohne Konfiguration.',
    demo: 'Live-Demo', demoNote: 'Diese Seite nutzt das SDK selbst. Klicke, um ein Beispiel-IFC zu laden und seine Bytes an den Viewer zu übergeben.',
    btnLoad: 'Beispiel-IFC laden', btnIsolate: 'Wände isolieren', btnTop: 'Draufsicht', btnFit: 'Einpassen', btnReset: 'Kamera zurücksetzen', btnClear: 'Leeren',
    stIdle: 'bereit', stReady: 'bereit — klicke „Beispiel-IFC laden“', stFetching: 'lade Beispiel-IFC…', stHanding: 'übergebe Bytes an den Viewer…', stCleared: 'geleert',
    api: 'API', colMethod: 'Methode', colDesc: 'Beschreibung',
    construct: 'In einen CSS-Selektor oder ein Element einhängen. Optionen: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: 'IFC-Bytes (ArrayBuffer/Uint8Array) aus deiner App laden. Gibt ein Promise mit den Modellinfos zurück.',
    addFromUrl: 'Eine öffentliche, CORS-fähige IFC-URL laden.',
    select: 'Ein Element per IFC-expressID auswählen und einrahmen.',
    isolate: 'Eine Kategorie isolieren (z. B. "IfcWall"); ohne Wert zum Zurücksetzen.',
    setView: 'Zu einer Kameraansicht fliegen: iso, top, front, right, left, back, bottom.',
    fitReset: 'Aktives Modell einpassen / Kamera zurücksetzen.',
    showAll: 'Volle Sichtbarkeit wiederherstellen (Ausgeblendetes + Isolation aufheben).',
    setLanguage: 'Die UI-Sprache zur Laufzeit ändern.',
    clear: 'Alle geladenen Modelle entfernen.',
    getLanguages: 'Unterstützte Sprachcodes auflisten (Labels via IfcViewer.LANGUAGES).',
    on: 'Events abonnieren / abbestellen; gibt eine Abmelde-Funktion zurück.',
    dispose: 'Abbauen und das iframe entfernen.',
    events: 'Events',
    evReady: 'Viewer eingehängt und bereit ({ languages }).',
    evProgress: 'Ladefortschritt ({ percent, phase }).',
    evLoaded: 'Ein Modell wurde geladen ({ modelId, fileName, elementCount }).',
    evValidation: 'Validierung fertig — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Ein Laden ist fehlgeschlagen ({ message }).',
    evSelected: 'Der Nutzer hat ein Element gewählt ({ expressId, ifcType, name }).',
    privacy: 'Das Modell wird im Browser des Besuchers geladen und clientseitig mit WebAssembly geparst — nichts wird auf unsere Server hochgeladen.',
    langLabel: 'Sprache',
  },
  fr: {
    title: 'IFC Viewer SDK — intégrez le visualiseur dans votre CDE ou app',
    desc: "Intégrez le visualiseur IFC dans votre CDE, jumeau numérique ou outils internes. Chargez des octets IFC depuis votre app — l'analyse reste dans le navigateur. Aucun backend de téléversement.",
    h1: 'Intégrez le visualiseur dans votre propre produit',
    lede: 'Insérez le même visualiseur navigateur dans votre CDE, jumeau numérique ou outils internes de projet. Chargez des données IFC depuis votre app, le traitement du modèle restant côté client.',
    b1: 'Aucun backend de téléversement requis', b2: "S'exécute directement dans le navigateur", b3: 'Prêt pour IFC, BCF et IDS',
    quickStart: 'Démarrage rapide',
    quickNote: "Le SDK découvre l'URL de l'app relativement à ce script ; l'auto-hébergement fonctionne tel quel.",
    demo: 'Démo en direct', demoNote: 'Cette page utilise le SDK lui-même. Cliquez pour récupérer un IFC d’exemple et passer ses octets au visualiseur.',
    btnLoad: 'Charger un IFC d’exemple', btnIsolate: 'Isoler les murs', btnTop: 'Vue de dessus', btnFit: 'Cadrer', btnReset: 'Réinitialiser la caméra', btnClear: 'Effacer',
    stIdle: 'inactif', stReady: 'prêt — cliquez « Charger un IFC d’exemple »', stFetching: 'téléchargement de l’IFC d’exemple…', stHanding: 'transfert des octets au visualiseur…', stCleared: 'effacé',
    api: 'API', colMethod: 'Méthode', colDesc: 'Description',
    construct: 'Monter dans un sélecteur CSS ou un élément. Options : ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: 'Charger des octets IFC (ArrayBuffer/Uint8Array) depuis votre app. Renvoie une promesse avec les infos du modèle.',
    addFromUrl: 'Charger une URL IFC publique compatible CORS.',
    select: 'Sélectionner et cadrer un élément par son expressID IFC.',
    isolate: 'Isoler une catégorie (p. ex. "IfcWall") ; omettre pour réinitialiser.',
    setView: 'Voler vers une vue caméra : iso, top, front, right, left, back, bottom.',
    fitReset: 'Cadrer le modèle actif / réinitialiser la caméra.',
    showAll: 'Restaurer toute la visibilité (annuler masquage + isolation).',
    setLanguage: "Changer la langue de l'interface à l'exécution.",
    clear: 'Supprimer tous les modèles chargés.',
    getLanguages: 'Lister les codes de langue pris en charge (libellés via IfcViewer.LANGUAGES).',
    on: 'S’abonner / se désabonner aux événements ; renvoie une fonction de désabonnement.',
    dispose: 'Démonter et retirer l’iframe.',
    events: 'Événements',
    evReady: 'Visualiseur monté et prêt ({ languages }).',
    evProgress: 'Progression du chargement ({ percent, phase }).',
    evLoaded: 'Un modèle a fini de charger ({ modelId, fileName, elementCount }).',
    evValidation: 'Validation terminée — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Un chargement a échoué ({ message }).',
    evSelected: "L'utilisateur a choisi un élément ({ expressId, ifcType, name }).",
    privacy: "Le modèle est récupéré dans le navigateur du visiteur et analysé côté client avec WebAssembly — rien n'est téléversé sur nos serveurs.",
    langLabel: 'Langue',
  },
  pt: {
    title: 'IFC Viewer SDK — incorpore o visualizador no seu CDE ou app',
    desc: 'Incorpore o visualizador IFC no seu CDE, gémeo digital ou ferramentas internas. Carregue bytes IFC da sua app — a análise fica no navegador. Sem backend de upload.',
    h1: 'Incorpore o visualizador no seu próprio produto',
    lede: 'Insira o mesmo visualizador do navegador no seu CDE, gémeo digital ou ferramentas internas de projeto. Carregue dados IFC da sua app enquanto o processamento do modelo permanece no cliente.',
    b1: 'Sem backend de upload', b2: 'Executa diretamente no navegador', b3: 'Preparado para IFC, BCF e IDS',
    quickStart: 'Início rápido',
    quickNote: 'O SDK descobre o URL da app relativamente a este script, por isso o auto-alojamento funciona logo.',
    demo: 'Demo ao vivo', demoNote: 'Esta página usa o próprio SDK. Clique para obter um IFC de exemplo e passar os seus bytes ao visualizador.',
    btnLoad: 'Carregar IFC de exemplo', btnIsolate: 'Isolar paredes', btnTop: 'Vista de topo', btnFit: 'Enquadrar', btnReset: 'Repor câmara', btnClear: 'Limpar',
    stIdle: 'inativo', stReady: 'pronto — clique «Carregar IFC de exemplo»', stFetching: 'a obter IFC de exemplo…', stHanding: 'a passar bytes ao visualizador…', stCleared: 'limpo',
    api: 'API', colMethod: 'Método', colDesc: 'Descrição',
    construct: 'Montar num seletor CSS ou elemento. Opções: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: 'Carregar bytes IFC (ArrayBuffer/Uint8Array) da sua app. Devolve uma promessa com a info do modelo.',
    addFromUrl: 'Carregar um URL IFC público com CORS.',
    select: 'Selecionar e enquadrar um elemento pelo expressID IFC.',
    isolate: 'Isolar uma categoria (ex.: "IfcWall"); omitir para limpar.',
    setView: 'Voar para uma vista de câmara: iso, top, front, right, left, back, bottom.',
    fitReset: 'Enquadrar o modelo ativo / repor a câmara.',
    showAll: 'Restaurar toda a visibilidade (limpar ocultos + isolamento).',
    setLanguage: 'Mudar o idioma da interface em tempo de execução.',
    clear: 'Remover todos os modelos carregados.',
    getLanguages: 'Listar os códigos de idioma suportados (rótulos em IfcViewer.LANGUAGES).',
    on: 'Subscrever / cancelar eventos; devolve uma função para cancelar.',
    dispose: 'Desmontar e remover o iframe.',
    events: 'Eventos',
    evReady: 'Visualizador montado e pronto ({ languages }).',
    evProgress: 'Progresso do carregamento ({ percent, phase }).',
    evLoaded: 'Um modelo terminou de carregar ({ modelId, fileName, elementCount }).',
    evValidation: 'Validação concluída — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Um carregamento falhou ({ message }).',
    evSelected: 'O utilizador escolheu um elemento ({ expressId, ifcType, name }).',
    privacy: 'O modelo é obtido no navegador do visitante e analisado no cliente com WebAssembly — nada é enviado para os nossos servidores.',
    langLabel: 'Idioma',
  },
  it: {
    title: 'IFC Viewer SDK — integra il viewer nel tuo CDE o app',
    desc: "Integra il viewer IFC nel tuo CDE, digital twin o strumenti interni. Carica byte IFC dalla tua app — il parsing resta nel browser. Nessun backend di upload.",
    h1: 'Integra il viewer nel tuo prodotto',
    lede: "Inserisci lo stesso viewer del browser nel tuo CDE, digital twin o strumenti interni di progetto. Carica dati IFC dalla tua app mentre l'elaborazione del modello resta nel client.",
    b1: 'Nessun backend di caricamento', b2: 'Funziona direttamente nel browser', b3: 'Pronto per IFC, BCF e IDS',
    quickStart: 'Avvio rapido',
    quickNote: "Il SDK individua l'URL dell'app rispetto a questo script, quindi l'auto-hosting funziona subito.",
    demo: 'Demo live', demoNote: 'Questa pagina usa il SDK stesso. Clicca per scaricare un IFC di esempio e passare i suoi byte al viewer.',
    btnLoad: 'Carica IFC di esempio', btnIsolate: 'Isola i muri', btnTop: 'Vista dall’alto', btnFit: 'Inquadra', btnReset: 'Reimposta camera', btnClear: 'Pulisci',
    stIdle: 'inattivo', stReady: 'pronto — clicca «Carica IFC di esempio»', stFetching: 'scaricamento IFC di esempio…', stHanding: 'passaggio dei byte al viewer…', stCleared: 'pulito',
    api: 'API', colMethod: 'Metodo', colDesc: 'Descrizione',
    construct: 'Monta in un selettore CSS o elemento. Opzioni: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.',
    add: "Carica byte IFC (ArrayBuffer/Uint8Array) dalla tua app. Restituisce una promise con le info del modello.",
    addFromUrl: 'Carica un URL IFC pubblico con CORS.',
    select: "Seleziona e inquadra un elemento tramite l'expressID IFC.",
    isolate: 'Isola una categoria (es. "IfcWall"); ometti per azzerare.',
    setView: 'Vola a una vista camera: iso, top, front, right, left, back, bottom.',
    fitReset: 'Inquadra il modello attivo / reimposta la camera.',
    showAll: 'Ripristina la piena visibilità (rimuovi nascosti + isolamento).',
    setLanguage: "Cambia la lingua dell'interfaccia a runtime.",
    clear: 'Rimuovi tutti i modelli caricati.',
    getLanguages: 'Elenca i codici lingua supportati (etichette in IfcViewer.LANGUAGES).',
    on: 'Iscriviti / annulla agli eventi; restituisce una funzione di annullamento.',
    dispose: "Smonta e rimuovi l'iframe.",
    events: 'Eventi',
    evReady: 'Viewer montato e pronto ({ languages }).',
    evProgress: 'Avanzamento del caricamento ({ percent, phase }).',
    evLoaded: 'Un modello ha finito di caricare ({ modelId, fileName, elementCount }).',
    evValidation: 'Validazione completata — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Un caricamento è fallito ({ message }).',
    evSelected: "L'utente ha scelto un elemento ({ expressId, ifcType, name }).",
    privacy: "Il modello viene scaricato nel browser del visitatore e analizzato lato client con WebAssembly — nulla viene caricato sui nostri server.",
    langLabel: 'Lingua',
  },
  ca: {
    title: 'IFC Viewer SDK — integra el visor al teu CDE o app',
    desc: "Integra el visor IFC al teu CDE, bessó digital o eines internes. Carrega bytes IFC des de la teva app — l'anàlisi es manté al navegador. Sense backend de pujada.",
    h1: 'Integra el visor al teu propi producte',
    lede: "Insereix el mateix visor del navegador al teu CDE, bessó digital o eines internes de projecte. Carrega dades IFC des de la teva app mentre el processament del model es manté al client.",
    b1: 'Sense backend de pujada', b2: "S'executa directament al navegador", b3: 'Preparat per a IFC, BCF i IDS',
    quickStart: 'Inici ràpid',
    quickNote: "El SDK descobreix l'URL de l'app de manera relativa a aquest script, així que l'auto-allotjament funciona sol.",
    demo: 'Demo en directe', demoNote: 'Aquesta pàgina usa el propi SDK. Fes clic per baixar un IFC d’exemple i passar-ne els bytes al visor.',
    btnLoad: 'Carrega IFC d’exemple', btnIsolate: 'Aïlla murs', btnTop: 'Vista superior', btnFit: 'Enquadra', btnReset: 'Reinicia càmera', btnClear: 'Neteja',
    stIdle: 'inactiu', stReady: 'a punt — fes clic «Carrega IFC d’exemple»', stFetching: 'baixant IFC d’exemple…', stHanding: 'passant bytes al visor…', stCleared: 'netejat',
    api: 'API', colMethod: 'Mètode', colDesc: 'Descripció',
    construct: "Munta en un selector CSS o element. Opcions: ui, validate, panel, lang, height, model, loadTimeout, baseUrl.",
    add: "Carrega bytes IFC (ArrayBuffer/Uint8Array) des de la teva app. Retorna una promesa amb la info del model.",
    addFromUrl: 'Carrega un URL IFC públic amb CORS.',
    select: "Selecciona i enquadra un element pel seu expressID IFC.",
    isolate: 'Aïlla una categoria (p. ex. "IfcWall"); omet-ho per netejar.',
    setView: 'Vola a una vista de càmera: iso, top, front, right, left, back, bottom.',
    fitReset: 'Enquadra el model actiu / reinicia la càmera.',
    showAll: 'Restaura tota la visibilitat (treu ocults + aïllament).',
    setLanguage: "Canvia l'idioma de la interfície en temps d'execució.",
    clear: 'Elimina tots els models carregats.',
    getLanguages: "Llista els codis d'idioma admesos (etiquetes a IfcViewer.LANGUAGES).",
    on: "Subscriu-te / cancel·la esdeveniments; retorna una funció per cancel·lar.",
    dispose: "Desmunta i elimina l'iframe.",
    events: 'Esdeveniments',
    evReady: 'Visor muntat i a punt ({ languages }).',
    evProgress: 'Progrés de càrrega ({ percent, phase }).',
    evLoaded: 'Un model ha acabat de carregar ({ modelId, fileName, elementCount }).',
    evValidation: 'Validació acabada — Health Score ({ qualityScore, errors, warnings, info }).',
    evError: 'Una càrrega ha fallat ({ message }).',
    evSelected: "L'usuari ha triat un element ({ expressId, ifcType, name }).",
    privacy: "El model es baixa al navegador del visitant i s'analitza al client amb WebAssembly — no es puja res als nostres servidors.",
    langLabel: 'Idioma',
  },
  zh: {
    title: 'IFC Viewer SDK — 将查看器嵌入您的 CDE 或应用',
    desc: '将 IFC 查看器嵌入您的 CDE、数字孪生或内部工具。从您自己的应用加载 IFC 字节——解析始终在浏览器中。无需上传后端。',
    h1: '将查看器嵌入您自己的产品',
    lede: '将同样的浏览器查看器嵌入您的 CDE、数字孪生或内部项目工具。直接从您的应用加载 IFC 数据，模型处理始终在客户端进行。',
    b1: '无需上传后端', b2: '直接在浏览器中运行', b3: '支持 IFC、BCF 和 IDS',
    quickStart: '快速开始',
    quickNote: 'SDK 会相对于此脚本自动发现应用 URL，因此自托管开箱即用。',
    demo: '在线演示', demoNote: '本页面本身使用了该 SDK。点击以获取示例 IFC 并将其字节交给查看器。',
    btnLoad: '加载示例 IFC', btnIsolate: '隔离墙体', btnTop: '俯视图', btnFit: '适配', btnReset: '重置相机', btnClear: '清除',
    stIdle: '空闲', stReady: '就绪——点击“加载示例 IFC”', stFetching: '正在获取示例 IFC…', stHanding: '正在将字节交给查看器…', stCleared: '已清除',
    api: 'API', colMethod: '方法', colDesc: '说明',
    construct: '挂载到 CSS 选择器或元素。选项：ui、validate、panel、lang、height、model、loadTimeout、baseUrl。',
    add: '从您的应用加载 IFC 字节（ArrayBuffer/Uint8Array）。返回包含模型信息的 Promise。',
    addFromUrl: '加载一个启用 CORS 的公开 IFC URL。',
    select: '通过 IFC expressID 选择并聚焦一个元素。',
    isolate: '隔离一个类别（如 "IfcWall"）；不传参则清除。',
    setView: '切换相机视角：iso、top、front、right、left、back、bottom。',
    fitReset: '适配当前模型 / 重置相机。',
    showAll: '恢复全部可见性（清除隐藏与隔离）。',
    setLanguage: '在运行时切换界面语言。',
    clear: '移除所有已加载的模型。',
    getLanguages: '列出支持的语言代码（标签见 IfcViewer.LANGUAGES）。',
    on: '订阅 / 取消订阅事件；返回取消订阅的函数。',
    dispose: '销毁并移除 iframe。',
    events: '事件',
    evReady: '查看器已挂载并就绪（{ languages }）。',
    evProgress: '加载进度（{ percent, phase }）。',
    evLoaded: '某个模型加载完成（{ modelId, fileName, elementCount }）。',
    evValidation: '校验完成——健康分（{ qualityScore, errors, warnings, info }）。',
    evError: '一次加载失败（{ message }）。',
    evSelected: '用户选中了一个元素（{ expressId, ifcType, name }）。',
    privacy: '模型在访问者的浏览器中获取，并使用 WebAssembly 在客户端解析——不会上传到我们的服务器。',
    langLabel: '语言',
  },
  ja: {
    title: 'IFC Viewer SDK — ビューアを CDE やアプリに組み込む',
    desc: 'IFC ビューアを CDE、デジタルツイン、社内ツールに組み込みます。IFC バイトを自社アプリから読み込み、解析はブラウザ内で行います。アップロード用バックエンド不要。',
    h1: 'ビューアを自社プロダクトに組み込む',
    lede: '同じブラウザビューアを CDE、デジタルツイン、社内のプロジェクトツールに組み込みます。モデル処理はクライアント側のまま、自社アプリから IFC データを直接読み込みます。',
    b1: 'アップロード用バックエンド不要', b2: 'ブラウザ上で直接動作', b3: 'IFC・BCF・IDS に対応',
    quickStart: 'クイックスタート',
    quickNote: 'SDK はこのスクリプトからの相対でアプリ URL を自動検出するため、セルフホストはそのまま動作します。',
    demo: 'ライブデモ', demoNote: 'このページ自体が SDK を使用しています。クリックするとサンプル IFC を取得し、そのバイトをビューアに渡します。',
    btnLoad: 'サンプル IFC を読み込む', btnIsolate: '壁を分離', btnTop: '上面ビュー', btnFit: 'フィット', btnReset: 'カメラをリセット', btnClear: 'クリア',
    stIdle: '待機中', stReady: '準備完了 — 「サンプル IFC を読み込む」をクリック', stFetching: 'サンプル IFC を取得中…', stHanding: 'バイトをビューアに渡しています…', stCleared: 'クリアしました',
    api: 'API', colMethod: 'メソッド', colDesc: '説明',
    construct: 'CSS セレクタまたは要素にマウント。オプション: ui, validate, panel, lang, height, model, loadTimeout, baseUrl。',
    add: '自社アプリから IFC バイト（ArrayBuffer/Uint8Array）を読み込みます。モデル情報を含む Promise を返します。',
    addFromUrl: 'CORS 対応の公開 IFC URL を読み込みます。',
    select: 'IFC expressID で要素を選択してフレーミングします。',
    isolate: 'カテゴリを分離（例: "IfcWall"）。省略でクリア。',
    setView: 'カメラビューへ移動: iso, top, front, right, left, back, bottom。',
    fitReset: 'アクティブなモデルにフィット / カメラをリセット。',
    showAll: '表示を全復元（非表示・分離を解除）。',
    setLanguage: '実行時に UI 言語を変更します。',
    clear: '読み込み済みのモデルをすべて削除します。',
    getLanguages: '対応言語コードを列挙（ラベルは IfcViewer.LANGUAGES）。',
    on: 'イベントを購読 / 解除。解除用の関数を返します。',
    dispose: '破棄して iframe を削除します。',
    events: 'イベント',
    evReady: 'ビューアがマウントされ準備完了（{ languages }）。',
    evProgress: '読み込みの進捗（{ percent, phase }）。',
    evLoaded: 'モデルの読み込みが完了（{ modelId, fileName, elementCount }）。',
    evValidation: '検証完了 — ヘルススコア（{ qualityScore, errors, warnings, info }）。',
    evError: '読み込みに失敗（{ message }）。',
    evSelected: 'ユーザーが要素を選択（{ expressId, ifcType, name }）。',
    privacy: 'モデルは訪問者のブラウザで取得され、WebAssembly によりクライアント側で解析されます — 当社サーバーには何もアップロードされません。',
    langLabel: '言語',
  },
  th: {
    title: 'IFC Viewer SDK — ฝังตัวแสดงผลลงใน CDE หรือแอปของคุณ',
    desc: 'ฝังตัวแสดงผล IFC ลงใน CDE ดิจิทัลทวิน หรือเครื่องมือภายใน โหลดไบต์ IFC จากแอปของคุณเอง โดยการแปลงอยู่ในเบราว์เซอร์ ไม่ต้องมีแบ็กเอนด์อัปโหลด',
    h1: 'ฝังตัวแสดงผลลงในผลิตภัณฑ์ของคุณเอง',
    lede: 'แทรกตัวแสดงผลบนเบราว์เซอร์เดียวกันลงใน CDE ดิจิทัลทวิน หรือเครื่องมือภายในของโครงการ โหลดข้อมูล IFC จากแอปของคุณ โดยการประมวลผลโมเดลยังคงอยู่ที่ฝั่งไคลเอนต์',
    b1: 'ไม่ต้องมีแบ็กเอนด์อัปโหลด', b2: 'ทำงานในเบราว์เซอร์โดยตรง', b3: 'พร้อมสำหรับ IFC, BCF และ IDS',
    quickStart: 'เริ่มต้นอย่างรวดเร็ว',
    quickNote: 'SDK จะค้นหา URL ของแอปโดยอ้างอิงจากสคริปต์นี้ ดังนั้นการโฮสต์เองจึงใช้งานได้ทันที',
    demo: 'เดโมสด', demoNote: 'หน้านี้ใช้ SDK เอง คลิกเพื่อดึงไฟล์ IFC ตัวอย่างและส่งไบต์ไปยังตัวแสดงผล',
    btnLoad: 'โหลด IFC ตัวอย่าง', btnIsolate: 'แยกผนัง', btnTop: 'มุมมองด้านบน', btnFit: 'พอดี', btnReset: 'รีเซ็ตกล้อง', btnClear: 'ล้าง',
    stIdle: 'ว่าง', stReady: 'พร้อม — คลิก “โหลด IFC ตัวอย่าง”', stFetching: 'กำลังดึง IFC ตัวอย่าง…', stHanding: 'กำลังส่งไบต์ไปยังตัวแสดงผล…', stCleared: 'ล้างแล้ว',
    api: 'API', colMethod: 'เมธอด', colDesc: 'คำอธิบาย',
    construct: 'ติดตั้งในตัวเลือก CSS หรืออิลิเมนต์ ออปชัน: ui, validate, panel, lang, height, model, loadTimeout, baseUrl',
    add: 'โหลดไบต์ IFC (ArrayBuffer/Uint8Array) จากแอปของคุณ คืนค่า Promise พร้อมข้อมูลโมเดล',
    addFromUrl: 'โหลด URL IFC สาธารณะที่เปิด CORS',
    select: 'เลือกและจัดเฟรมอิลิเมนต์ด้วย IFC expressID',
    isolate: 'แยกหมวดหมู่ (เช่น "IfcWall"); เว้นว่างเพื่อล้าง',
    setView: 'บินไปยังมุมกล้อง: iso, top, front, right, left, back, bottom',
    fitReset: 'จัดเฟรมโมเดลที่ใช้งาน / รีเซ็ตกล้อง',
    showAll: 'คืนการมองเห็นทั้งหมด (ล้างที่ซ่อน + การแยก)',
    setLanguage: 'เปลี่ยนภาษาอินเทอร์เฟซขณะทำงาน',
    clear: 'ลบโมเดลที่โหลดไว้ทั้งหมด',
    getLanguages: 'แสดงรายการรหัสภาษาที่รองรับ (ป้ายกำกับดูที่ IfcViewer.LANGUAGES)',
    on: 'สมัคร / ยกเลิกการรับอีเวนต์ คืนค่าฟังก์ชันสำหรับยกเลิก',
    dispose: 'รื้อและลบ iframe',
    events: 'อีเวนต์',
    evReady: 'ตัวแสดงผลติดตั้งและพร้อม ({ languages })',
    evProgress: 'ความคืบหน้าการโหลด ({ percent, phase })',
    evLoaded: 'โมเดลโหลดเสร็จแล้ว ({ modelId, fileName, elementCount })',
    evValidation: 'ตรวจสอบเสร็จ — Health Score ({ qualityScore, errors, warnings, info })',
    evError: 'การโหลดล้มเหลว ({ message })',
    evSelected: 'ผู้ใช้เลือกอิลิเมนต์ ({ expressId, ifcType, name })',
    privacy: 'โมเดลถูกดึงในเบราว์เซอร์ของผู้เข้าชมและแปลงที่ฝั่งไคลเอนต์ด้วย WebAssembly — ไม่มีการอัปโหลดไปยังเซิร์ฟเวอร์ของเรา',
    langLabel: 'ภาษา',
  },
}

// Descriptions for the data/query methods, merged into T to keep edits local.
const EXTRA = {
  en: { getModels: 'List the loaded models ({ id, fileName, elementCount }). Returns a promise.', getElement: 'Fetch an element’s IFC data (attributes + property/quantity sets). Returns a promise.', getValidation: 'Fetch the current validation summary (Health Score + counts). Returns a promise.', getStats: 'Per-category element counts per model — for dashboard charts. Returns a promise.', getIssues: 'Validation issues for a table (filter by severity / limit). Returns a promise.', checkIds: 'Check the model against a buildingSMART IDS (.ids XML). Returns pass/fail per spec.', screenshot: 'Capture the current 3D view as a PNG data URL. Returns a promise.', removeModel: 'Unload a model by id.', hideShow: 'Hide / show a set of elements by expressID.', setCamera: 'Place the camera at a position looking along a direction.', wc: 'Or, zero-JS — drop the tag:' },
  es: { getModels: 'Lista los modelos cargados ({ id, fileName, elementCount }). Devuelve una promesa.', getElement: 'Obtiene los datos IFC de un elemento (atributos + property/quantity sets). Devuelve una promesa.', getValidation: 'Obtiene el resumen de validación (Health Score + conteos). Devuelve una promesa.', getStats: 'Conteo de elementos por categoría y modelo — para gráficos de dashboard. Devuelve una promesa.', getIssues: 'Incidencias de validación para una tabla (filtra por severidad / límite). Devuelve una promesa.', checkIds: 'Comprueba el modelo contra un IDS de buildingSMART (.ids XML). Devuelve pass/fail por spec.', screenshot: 'Captura la vista 3D actual como data URL PNG. Devuelve una promesa.', removeModel: 'Descarga un modelo por id.', hideShow: 'Oculta / muestra un conjunto de elementos por expressID.', setCamera: 'Coloca la cámara en una posición mirando en una dirección.', wc: 'O, sin JS — usa la etiqueta:' },
  de: { getModels: 'Listet die geladenen Modelle ({ id, fileName, elementCount }). Gibt ein Promise zurück.', getElement: 'Liefert die IFC-Daten eines Elements (Attribute + Property-/Quantity-Sets). Gibt ein Promise zurück.', getValidation: 'Liefert die aktuelle Validierungs-Zusammenfassung (Health Score + Zähler). Gibt ein Promise zurück.', getStats: 'Elementanzahl je Kategorie und Modell — für Dashboard-Diagramme. Gibt ein Promise zurück.', getIssues: 'Validierungsmeldungen für eine Tabelle (Filter nach Schweregrad / Limit). Gibt ein Promise zurück.', screenshot: 'Erfasst die aktuelle 3D-Ansicht als PNG-Data-URL. Gibt ein Promise zurück.', removeModel: 'Entlädt ein Modell per id.', hideShow: 'Blendet eine Menge von Elementen per expressID aus / ein.', setCamera: 'Positioniert die Kamera an einer Position mit Blickrichtung.', wc: 'Oder ganz ohne JS — das Tag:' },
  fr: { getModels: 'Liste les modèles chargés ({ id, fileName, elementCount }). Renvoie une promesse.', getElement: "Récupère les données IFC d'un élément (attributs + property/quantity sets). Renvoie une promesse.", getValidation: 'Récupère le résumé de validation (Health Score + compteurs). Renvoie une promesse.', getStats: 'Nombre d’éléments par catégorie et par modèle — pour les graphiques. Renvoie une promesse.', getIssues: 'Anomalies de validation pour un tableau (filtre par sévérité / limite). Renvoie une promesse.', screenshot: 'Capture la vue 3D actuelle en data URL PNG. Renvoie une promesse.', removeModel: 'Décharge un modèle par id.', hideShow: 'Masque / affiche un ensemble d’éléments par expressID.', setCamera: 'Place la caméra à une position regardant dans une direction.', wc: 'Ou, sans JS — la balise :' },
  pt: { getModels: 'Lista os modelos carregados ({ id, fileName, elementCount }). Devolve uma promessa.', getElement: 'Obtém os dados IFC de um elemento (atributos + property/quantity sets). Devolve uma promessa.', getValidation: 'Obtém o resumo de validação (Health Score + contagens). Devolve uma promessa.', getStats: 'Contagem de elementos por categoria e modelo — para gráficos. Devolve uma promessa.', getIssues: 'Problemas de validação para uma tabela (filtra por severidade / limite). Devolve uma promessa.', screenshot: 'Captura a vista 3D atual como data URL PNG. Devolve uma promessa.', removeModel: 'Descarrega um modelo por id.', hideShow: 'Oculta / mostra um conjunto de elementos por expressID.', setCamera: 'Coloca a câmara numa posição a olhar numa direção.', wc: 'Ou, sem JS — use a etiqueta:' },
  it: { getModels: 'Elenca i modelli caricati ({ id, fileName, elementCount }). Restituisce una promise.', getElement: 'Recupera i dati IFC di un elemento (attributi + property/quantity set). Restituisce una promise.', getValidation: 'Recupera il riepilogo di validazione (Health Score + conteggi). Restituisce una promise.', getStats: 'Conteggio elementi per categoria e modello — per i grafici. Restituisce una promise.', getIssues: 'Problemi di validazione per una tabella (filtra per gravità / limite). Restituisce una promise.', screenshot: 'Cattura la vista 3D corrente come data URL PNG. Restituisce una promise.', removeModel: 'Scarica un modello per id.', hideShow: 'Nasconde / mostra un insieme di elementi per expressID.', setCamera: 'Posiziona la camera in una posizione guardando in una direzione.', wc: 'Oppure, senza JS — il tag:' },
  ca: { getModels: 'Llista els models carregats ({ id, fileName, elementCount }). Retorna una promesa.', getElement: "Obté les dades IFC d'un element (atributs + property/quantity sets). Retorna una promesa.", getValidation: 'Obté el resum de validació (Health Score + recomptes). Retorna una promesa.', getStats: 'Recompte d’elements per categoria i model — per a gràfics. Retorna una promesa.', getIssues: 'Incidències de validació per a una taula (filtra per severitat / límit). Retorna una promesa.', screenshot: 'Captura la vista 3D actual com a data URL PNG. Retorna una promesa.', removeModel: 'Descarrega un model per id.', hideShow: "Amaga / mostra un conjunt d'elements per expressID.", setCamera: 'Col·loca la càmera en una posició mirant en una direcció.', wc: 'O, sense JS — l’etiqueta:' },
  zh: { getModels: '列出已加载的模型（{ id, fileName, elementCount }）。返回 Promise。', getElement: '获取某元素的 IFC 数据（属性 + 属性集/数量集）。返回 Promise。', getValidation: '获取当前校验摘要（健康分 + 计数）。返回 Promise。', getStats: '按类别统计每个模型的元素数量——用于仪表盘图表。返回 Promise。', getIssues: '用于表格的校验问题（按严重程度 / 数量过滤）。返回 Promise。', screenshot: '将当前三维视图捕获为 PNG data URL。返回 Promise。', removeModel: '按 id 卸载某个模型。', hideShow: '按 expressID 隐藏 / 显示一组元素。', setCamera: '将相机置于某位置并朝某方向观察。', wc: '或者，零 JS — 直接用标签：' },
  ja: { getModels: '読み込み済みモデルを列挙（{ id, fileName, elementCount }）。Promise を返します。', getElement: '要素の IFC データ（属性＋プロパティ/数量セット）を取得。Promise を返します。', getValidation: '現在の検証サマリ（ヘルススコア＋件数）を取得。Promise を返します。', getStats: 'モデルごとのカテゴリ別要素数 — ダッシュボードのグラフ用。Promise を返します。', getIssues: 'テーブル用の検証問題（重大度 / 件数でフィルタ）。Promise を返します。', screenshot: '現在の 3D ビューを PNG data URL として取得。Promise を返します。', removeModel: 'id でモデルをアンロードします。', hideShow: 'expressID で要素の集合を非表示 / 表示します。', setCamera: 'カメラを指定位置に置き、指定方向を向かせます。', wc: 'または、JS なしでタグを：' },
  th: { getModels: 'แสดงรายการโมเดลที่โหลด ({ id, fileName, elementCount }) คืนค่า Promise', getElement: 'ดึงข้อมูล IFC ของอิลิเมนต์ (แอตทริบิวต์ + property/quantity set) คืนค่า Promise', getValidation: 'ดึงสรุปการตรวจสอบ (Health Score + จำนวน) คืนค่า Promise', getStats: 'จำนวนอิลิเมนต์ตามหมวดหมู่ของแต่ละโมเดล — สำหรับกราฟแดชบอร์ด คืนค่า Promise', getIssues: 'ปัญหาการตรวจสอบสำหรับตาราง (กรองตามระดับ / จำกัดจำนวน) คืนค่า Promise', screenshot: 'จับภาพมุมมอง 3D ปัจจุบันเป็น PNG data URL คืนค่า Promise', removeModel: 'ยกเลิกการโหลดโมเดลตาม id', hideShow: 'ซ่อน / แสดงชุดอิลิเมนต์ตาม expressID', setCamera: 'วางกล้องที่ตำแหน่งหนึ่งโดยมองไปตามทิศทาง', wc: 'หรือแบบไม่ต้องเขียน JS — ใช้แท็ก:' },
}
for (const l of LANGS) Object.assign(T[l], EXTRA[l])

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function langSwitcher(current) {
  return LANGS.map((l) => {
    const href = l === 'en' ? (current === 'en' ? './' : '../') : (current === l ? './' : (current === 'en' ? `${l}/` : `../${l}/`))
    const active = l === current
    const style = active ? 'color:var(--text);font-weight:600' : 'color:var(--faint)'
    return `<a href="${href}" hreflang="${l}" style="${style};text-decoration:none">${esc(LANG_LABEL[l])}</a>`
  }).join('<span style="color:var(--border)"> · </span>')
}

function page(lang) {
  const t = T[lang]
  const sdkPath = lang === 'en' ? './ifc-viewer.es.js' : '../ifc-viewer.es.js'
  const tr = (key) => t[key] ?? T.en[key] ?? ''
  const rows = METHODS.map(([sig, key]) => `<tr><td><code>${esc(sig)}</code></td><td>${esc(tr(key))}</td></tr>`).join('\n      ')
  const evRows = EVENTS.map(([name, key]) => `<tr><td><code>${esc(name)}</code></td><td>${esc(tr(key))}</td></tr>`).join('\n      ')
  const quick = `&lt;div id="viewer" style="height:520px"&gt;&lt;/div&gt;
&lt;script type="module"&gt;
  import { IfcViewer } from "${sdkPath}";

  const viewer = new IfcViewer("#viewer");

  const bytes = await fetch("/models/project.ifc").then(r =&gt; r.arrayBuffer());
  await viewer.add("project.ifc", bytes);
&lt;/script&gt;`

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="index,follow" />
  <title>${esc(t.title)}</title>
  <meta name="description" content="${esc(t.desc)}" />
  <style>
    :root { --accent:#5E6AD2; --accent2:#818cf8; --bg:#0b0b0f; --surface:#15151b; --border:#26262f; --text:#e8e8ec; --dim:#a0a0ad; --faint:#6b6b78; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    a { color:var(--accent2); }
    .wrap { max-width: 920px; margin: 0 auto; padding: 28px 20px 80px; }
    .nav { display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px;margin-bottom:22px;align-items:center }
    .nav b { color:var(--faint);font-weight:600;margin-right:4px }
    h1 { font-size: 30px; letter-spacing:-0.02em; margin:0 0 8px; }
    h2 { font-size: 19px; margin: 40px 0 10px; letter-spacing:-0.01em; }
    .lede { color:var(--dim); font-size:16px; max-width:640px; }
    .badge { display:inline-block; font:600 11px/1 ui-monospace,monospace; color:var(--accent2); background:rgba(94,106,210,0.12); border:1px solid rgba(94,106,210,0.3); padding:5px 9px; border-radius:999px; margin-bottom:14px; }
    .bullets { display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 6px; padding:0; list-style:none; }
    .bullets li { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:9px 13px; font-size:13px; color:var(--dim); }
    .bullets b { color:var(--text); font-weight:600; }
    pre { background:#08080b; border:1px solid var(--border); border-radius:12px; padding:16px; overflow:auto; font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; color:#cdd0e0; }
    .viewer-shell { position:relative; height:520px; border-radius:14px; overflow:hidden; border:1px solid rgba(94,106,210,0.35); background:#0d0d10; }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }
    button.demo { cursor:pointer; font:600 13px/1 inherit; color:var(--text); background:var(--surface); border:1px solid var(--border); padding:9px 13px; border-radius:9px; }
    button.demo:hover { border-color:var(--accent); }
    button.demo.primary { background:var(--accent); border-color:var(--accent); }
    .status { font:12px/1 ui-monospace,monospace; color:var(--faint); align-self:center; }
    table { border-collapse:collapse; width:100%; font-size:13px; margin-top:8px; }
    th,td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--faint); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
    code { background:#08080b; border:1px solid var(--border); border-radius:5px; padding:1px 5px; font:12.5px ui-monospace,monospace; color:#cdd0e0; }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav"><b>${esc(t.langLabel)}:</b>${langSwitcher(lang)}</nav>
    <span class="badge">IFC VIEWER SDK · v1.6.0</span>
    <h1>${esc(t.h1)}</h1>
    <p class="lede">${esc(t.lede)}</p>

    <ul class="bullets">
      <li>✓ <b>${esc(t.b1)}</b></li>
      <li>✓ <b>${esc(t.b2)}</b></li>
      <li>✓ <b>${esc(t.b3)}</b></li>
    </ul>

    <h2>${esc(t.quickStart)}</h2>
    <pre><code>${quick}</code></pre>
    <p class="lede" style="font-size:13px;margin-bottom:6px">${esc(t.wc)}</p>
    <pre><code>&lt;script type="module" src="${sdkPath}"&gt;&lt;/script&gt;
&lt;ifc-viewer model="https://host/project.ifc" ui="minimal"
            style="display:block;height:520px"&gt;&lt;/ifc-viewer&gt;</code></pre>
    <p class="lede" style="font-size:13px">${esc(t.quickNote)}</p>

    <h2>${esc(t.demo)}</h2>
    <p class="lede">${esc(t.demoNote)}</p>
    <div class="row">
      <button class="demo primary" id="load">${esc(t.btnLoad)}</button>
      <button class="demo" id="isolate">${esc(t.btnIsolate)}</button>
      <button class="demo" id="top">${esc(t.btnTop)}</button>
      <button class="demo" id="fit">${esc(t.btnFit)}</button>
      <button class="demo" id="reset">${esc(t.btnReset)}</button>
      <button class="demo" id="shot" title="screenshot">📷</button>
      <button class="demo" id="clear">${esc(t.btnClear)}</button>
      <span class="status" id="status">${esc(t.stIdle)}</span>
    </div>
    <div style="height:3px;border-radius:999px;background:var(--border);overflow:hidden;margin:0 0 8px">
      <div id="bar" style="height:100%;width:0;background:var(--accent);transition:width .2s ease"></div>
    </div>
    <div class="viewer-shell"><div id="viewer" style="height:100%"></div></div>

    <h2>${esc(t.api)}</h2>
    <table>
      <tr><th>${esc(t.colMethod)}</th><th>${esc(t.colDesc)}</th></tr>
      ${rows}
    </table>

    <h2>${esc(t.events)}</h2>
    <table>
      <tr><th>${esc(t.colMethod)}</th><th>${esc(t.colDesc)}</th></tr>
      ${evRows}
    </table>

    <p style="margin-top:28px;color:var(--faint);font-size:13px">${esc(t.privacy)}</p>
  </div>

  <script type="module">
    import { IfcViewer } from "${sdkPath}";
    const SAMPLE = "https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc";
    const I18N = ${JSON.stringify({ ready: t.stReady, fetching: t.stFetching, handing: t.stHanding, cleared: t.stCleared })};
    const statusEl = document.getElementById("status");
    const barEl = document.getElementById("bar");
    const setStatus = (s) => { statusEl.textContent = s; };
    const setBar = (p) => { barEl.style.width = (p || 0) + "%"; };

    const viewer = new IfcViewer("#viewer", { ui: "minimal" });
    viewer.on("ready", () => setStatus(I18N.ready));
    viewer.on("model-progress", (p) => { setBar(p.percent); setStatus(p.phase + "… " + Math.round(p.percent) + "%"); });
    viewer.on("model-loaded", (m) => { setBar(100); setStatus("✓ " + m.fileName + " · " + m.elementCount); });
    viewer.on("validation-completed", (v) => { if (v.qualityScore != null) setStatus("Health Score: " + v.qualityScore + " / 100"); });
    viewer.on("model-error", (e) => setStatus("⚠ " + e.message));
    viewer.on("element-selected", (e) => setStatus(e.ifcType + " #" + e.expressId));

    document.getElementById("load").addEventListener("click", async () => {
      setStatus(I18N.fetching); setBar(0);
      try {
        const bytes = await fetch(SAMPLE).then((r) => r.arrayBuffer());
        setStatus(I18N.handing);
        await viewer.add("Ifc4_SampleHouse.ifc", bytes);
      } catch (err) { setStatus("⚠ " + (err?.message || err)); }
    });
    document.getElementById("isolate").addEventListener("click", () => viewer.isolate("IfcWall"));
    document.getElementById("top").addEventListener("click", () => viewer.setView("top"));
    document.getElementById("fit").addEventListener("click", () => viewer.fit());
    document.getElementById("reset").addEventListener("click", () => viewer.reset());
    document.getElementById("clear").addEventListener("click", () => { viewer.clear(); setBar(0); setStatus(I18N.cleared); });
    document.getElementById("shot").addEventListener("click", async () => {
      try { const url = await viewer.screenshot(); if (url) window.open(url, "_blank"); } catch (e) { setStatus("⚠ " + (e?.message || e)); }
    });
  </script>
</body>
</html>
`
}

for (const lang of LANGS) {
  const dir = lang === 'en' ? OUT : resolve(OUT, lang)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), page(lang), 'utf8')
}
console.log(`  ✓ SDK docs: ${LANGS.length} localized pages → public/sdk/{,<lang>/}index.html`)
