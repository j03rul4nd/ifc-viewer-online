// ─── Home page: the viewer at work ────────────────────────────────────────────
// The pictures on the home page are captures of the viewer itself, running in a
// browser tab with the public demo models (three Shanghai IFC files on the
// OpenStreetMap city). This module is the single place that names them: the
// page, the static <noscript> copy, the JSON-LD and the image sitemap all read
// it, so a picture can never be on the page and missing from what a crawler
// is told.
//
// File names say what the picture shows; the .jpg is the one every search
// engine indexes (it carries the IPTC rights metadata), the .webp files are
// what browsers download.
//
// The comparison quotes only what Solibri and Flinker publish about themselves
// (solibri.com/pricing, flinker.app — read on COMPARED_ON). Re-read both before
// changing a cell, and move the date.

import type { HomeLang } from './home-copy'

export const HOME_IMAGE_DIR = 'images/home/'

export type ShotId = 'validation' | 'skyline' | 'aerial'

export interface HomeImage {
  /** File name without extension, under HOME_IMAGE_DIR. */
  file: string
  width: number
  height: number
  /** Widths of the .webp renditions, `${file}-${w}.webp`. */
  webp: number[]
}

export const HERO_IMAGE: HomeImage = {
  file: 'ifc-viewer-online-shanghai-ifc-models-3d-city-map', width: 1920, height: 1080, webp: [1200, 1920],
}
/** The 3D view alone, cropped from the hero: a full app window is unreadable on a phone. */
export const HERO_MOBILE = { file: 'ifc-viewer-online-shanghai-ifc-models-3d-city-map-mobile-800.webp', width: 800, height: 600 }

export const SHOT_ORDER: ShotId[] = ['validation', 'skyline', 'aerial']

export const SHOT_IMAGES: Record<ShotId, HomeImage> = {
  validation: { file: 'ifc-validation-health-score-issues-in-3d', width: 1600, height: 900, webp: [800, 1600] },
  skyline: { file: 'ifc-models-shanghai-skyline-openstreetmap-3d', width: 1600, height: 900, webp: [800, 1600] },
  aerial: { file: 'ifc-viewer-3d-city-context-lujiazui-aerial', width: 1600, height: 900, webp: [800, 1600] },
}

/** The scene in the hero picture, as a link that opens it in the viewer. */
export const HERO_SCENE_QUERY =
  '?model=/models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc,/models/swfc/SHA-IVO-SWFC-A-0001.ifc,/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc&map=terrain,buildings,showcase&look=daylight'

/** The examples landing in each language (mirrors EXAMPLES in scripts/seo/landing-chrome.ts). */
export const EXAMPLES_SLUG: Record<HomeLang, string> = {
  en: 'ifc-viewer-examples', es: 'ejemplos-visor-ifc', de: 'ifc-viewer-beispiele', fr: 'exemples-visionneuse-ifc',
  pt: 'exemplos-visualizador-ifc', it: 'esempi-visualizzatore-ifc', ca: 'exemples-visor-ifc',
  zh: 'ifc-viewer-examples', ja: 'ifc-viewer-examples', th: 'ifc-viewer-examples',
}

/** Path of the examples landing, no leading slash. */
export function examplesPath(lang: HomeLang): string {
  return `${lang === 'en' ? '' : `${lang}/`}${EXAMPLES_SLUG[lang]}/`
}

/** The day the competitors' own pages were read. */
export const COMPARED_ON = '2026-11-10'

export type CompareRow = 'madeFor' | 'start' | 'price' | 'choose'
export const COMPARE_ROWS: CompareRow[] = ['madeFor', 'start', 'price', 'choose']

interface Shot { title: string; body: string; alt: string; cta: string }

export interface ShowcaseCopy {
  heroAlt: string
  heroCaption: string
  /** What the side panel shows: only said where the picture has the panel (not the phone crop). */
  heroCaptionPanel: string
  heroOpen: string
  label: string
  title: string
  sub: string
  shots: Record<ShotId, Shot>
  /** Under the generated picture kept lower on the page. */
  illustration: string
  compare: {
    label: string
    title: string
    sub: string
    rows: Record<CompareRow, { label: string; us: string; solibri: string; flinker: string }>
    note: string
    more: string
  }
}

export const SHOWCASE_COPY: Record<HomeLang, ShowcaseCopy> = {
  en: {
    heroAlt: 'IFC Viewer Online with three IFC models — Shanghai Tower, Shanghai World Financial Center and Oriental Pearl Tower — on a 3D OpenStreetMap city, and the IFC properties of a selected curtain wall',
    heroCaption: 'Three IFC files open at once: Shanghai Tower, SWFC and the Oriental Pearl, placed on the OpenStreetMap city by their own georeferencing.',
    heroCaptionPanel: 'On the right, the properties of the selected IfcCurtainWall.',
    heroOpen: 'Open this scene in the viewer',
    label: 'The viewer at work',
    title: 'Real models on real screens',
    sub: 'Captures of the viewer running in a browser tab with our public demo models. Nothing was uploaded to a server.',
    shots: {
      validation: {
        title: 'A verdict in seconds, and where each problem is',
        body: 'These three models score 77 out of 100. The panel says what to fix first — 610 elements without a type, 423 without a long name — and one click paints them in 3D.',
        alt: 'IFC validation panel with Health Score 77, the list of issues and the affected elements highlighted in the 3D model',
        cta: 'Validate an IFC online',
      },
      skyline: {
        title: 'Your model in its real surroundings',
        body: 'A georeferenced IFC lands on the map with the OpenStreetMap buildings, streets and water around it. A building nobody has measured is drawn low and marked as assumed: the context never invents a skyline.',
        alt: 'IFC models of Shanghai Tower, Shanghai World Financial Center and Oriental Pearl Tower on the Lujiazui waterfront, seen across the Huangpu river',
        cta: 'See more example models',
      },
      aerial: {
        title: 'Several models, one coordinate system',
        body: 'Each file keeps its own tree, properties and validation, and all of them share the map. Measure between buildings, cut a section or study the sun over the whole site.',
        alt: 'Aerial view of three IFC towers on a 3D map of Lujiazui, Shanghai, inside the bend of the Huangpu river',
        cta: 'How IFC georeferencing works',
      },
    },
    illustration: 'Illustration (generated image), not a capture of the viewer.',
    compare: {
      label: 'How it compares',
      title: 'IFC Viewer Online, Solibri or Flinker?',
      sub: 'Three tools that overlap less than it seems. This is what each one publishes about itself.',
      rows: {
        madeFor: { label: 'Made for', us: 'Opening an IFC and knowing whether it can be delivered: viewer, Health Score, 44 rules, IDS, fixes and export', solibri: 'Rule-based model checking and clash detection workflows', flinker: '“The IFC viewer for Microsoft”: SharePoint, Teams, Excel, Power BI and the browser' },
        start: { label: 'To start', us: 'Nothing: no install, no account. The file is read in your browser and never uploaded', solibri: 'A licence, from the Solibri store or through sales', flinker: 'Nothing for the browser viewer; Microsoft 365 for the Teams and SharePoint apps' },
        price: { label: 'Price', us: 'Free to view, validate, fix and export', solibri: 'From €99 to €2,772 per licence per year', flinker: 'Community viewer free; Enterprise priced per deployment' },
        choose: { label: 'Choose it when', us: 'You need an answer about a model today, on any computer, and want to see it on a 3D map of its site', solibri: 'You need clash matrices and rules written for your own project', flinker: 'Your projects already live in SharePoint and Teams' },
      },
      note: 'Solibri and Flinker details from solibri.com/pricing and flinker.app, read on 10 November 2026.',
      more: 'IFC Viewer Online as a Solibri alternative',
    },
  },
  es: {
    heroAlt: 'IFC Viewer Online con tres modelos IFC —Shanghai Tower, Shanghai World Financial Center y la torre Perla Oriental— sobre la ciudad 3D de OpenStreetMap y las propiedades IFC de un muro cortina seleccionado',
    heroCaption: 'Tres archivos IFC abiertos a la vez: Shanghai Tower, SWFC y la Perla Oriental, colocados sobre la ciudad de OpenStreetMap por su propia georreferenciación.',
    heroCaptionPanel: 'A la derecha, las propiedades del IfcCurtainWall seleccionado.',
    heroOpen: 'Abrir esta escena en el visor',
    label: 'El visor en acción',
    title: 'Modelos reales en pantallas reales',
    sub: 'Capturas del visor funcionando en una pestaña del navegador con nuestros modelos de demostración. No se subió nada a ningún servidor.',
    shots: {
      validation: {
        title: 'Un veredicto en segundos, y dónde está cada problema',
        body: 'Estos tres modelos sacan un 77 sobre 100. El panel dice qué arreglar primero —610 elementos sin tipo, 423 sin nombre largo— y un clic los pinta en 3D.',
        alt: 'Panel de validación IFC con Health Score 77, la lista de incidencias y los elementos afectados resaltados en el modelo 3D',
        cta: 'Validar un IFC online',
      },
      skyline: {
        title: 'Tu modelo en su entorno real',
        body: 'Un IFC georreferenciado cae en el mapa con los edificios, calles y agua de OpenStreetMap a su alrededor. Un edificio que nadie ha medido se dibuja bajo y se marca como supuesto: el entorno nunca se inventa un skyline.',
        alt: 'Modelos IFC de Shanghai Tower, Shanghai World Financial Center y la torre Perla Oriental en la ribera de Lujiazui, vistos desde el otro lado del río Huangpu',
        cta: 'Ver más modelos de ejemplo',
      },
      aerial: {
        title: 'Varios modelos, un solo sistema de coordenadas',
        body: 'Cada archivo conserva su árbol, sus propiedades y su validación, y todos comparten el mapa. Mide entre edificios, corta una sección o estudia el sol sobre todo el emplazamiento.',
        alt: 'Vista aérea de tres torres IFC sobre un mapa 3D de Lujiazui, Shanghái, dentro del meandro del río Huangpu',
        cta: 'Cómo funciona la georreferenciación IFC',
      },
    },
    illustration: 'Ilustración (imagen generada), no es una captura del visor.',
    compare: {
      label: 'Comparativa',
      title: '¿IFC Viewer Online, Solibri o Flinker?',
      sub: 'Tres herramientas que se pisan menos de lo que parece. Esto es lo que cada una publica sobre sí misma.',
      rows: {
        madeFor: { label: 'Pensado para', us: 'Abrir un IFC y saber si se puede entregar: visor, Health Score, 44 reglas, IDS, correcciones y exportación', solibri: 'Comprobación de modelos por reglas y flujos de detección de colisiones', flinker: '«El visor IFC para Microsoft»: SharePoint, Teams, Excel, Power BI y el navegador' },
        start: { label: 'Para empezar', us: 'Nada: sin instalar y sin cuenta. El archivo se lee en tu navegador y no se sube', solibri: 'Una licencia, en la tienda de Solibri o con su equipo comercial', flinker: 'Nada para el visor web; Microsoft 365 para las apps de Teams y SharePoint' },
        price: { label: 'Precio', us: 'Gratis para ver, validar, corregir y exportar', solibri: 'De 99 € a 2.772 € por licencia y año', flinker: 'Visor Community gratis; Enterprise con precio por despliegue' },
        choose: { label: 'Elígelo si', us: 'Necesitas una respuesta sobre un modelo hoy, en cualquier ordenador, y verlo en un mapa 3D de su emplazamiento', solibri: 'Necesitas matrices de colisiones y reglas escritas para tu proyecto', flinker: 'Tus proyectos ya viven en SharePoint y Teams' },
      },
      note: 'Datos de Solibri y Flinker tomados de solibri.com/pricing y flinker.app, leídos el 10 de noviembre de 2026.',
      more: 'IFC Viewer Online como alternativa a Solibri',
    },
  },
  de: {
    heroAlt: 'IFC Viewer Online mit drei IFC-Modellen – Shanghai Tower, Shanghai World Financial Center und Oriental Pearl Tower – auf der 3D-Stadt aus OpenStreetMap und den IFC-Eigenschaften einer ausgewählten Vorhangfassade',
    heroCaption: 'Drei IFC-Dateien gleichzeitig geöffnet: Shanghai Tower, SWFC und Oriental Pearl, über ihre eigene Georeferenzierung auf der OpenStreetMap-Stadt platziert.',
    heroCaptionPanel: 'Rechts die Eigenschaften der ausgewählten IfcCurtainWall.',
    heroOpen: 'Diese Szene im Viewer öffnen',
    label: 'Der Viewer im Einsatz',
    title: 'Echte Modelle auf echten Bildschirmen',
    sub: 'Aufnahmen des Viewers in einem Browser-Tab mit unseren öffentlichen Demomodellen. Nichts wurde auf einen Server hochgeladen.',
    shots: {
      validation: {
        title: 'Ein Urteil in Sekunden – und wo jedes Problem liegt',
        body: 'Diese drei Modelle erreichen 77 von 100 Punkten. Das Panel zeigt, was zuerst zu beheben ist – 610 Elemente ohne Typ, 423 ohne LongName – und ein Klick färbt sie in 3D ein.',
        alt: 'IFC-Prüfpanel mit Health Score 77, der Liste der Befunde und den betroffenen Elementen im 3D-Modell hervorgehoben',
        cta: 'IFC online prüfen',
      },
      skyline: {
        title: 'Ihr Modell in seiner echten Umgebung',
        body: 'Ein georeferenziertes IFC landet auf der Karte, mit Gebäuden, Straßen und Wasser aus OpenStreetMap rundherum. Ein Gebäude, das niemand vermessen hat, wird niedrig gezeichnet und als Annahme markiert: Die Umgebung erfindet keine Skyline.',
        alt: 'IFC-Modelle von Shanghai Tower, Shanghai World Financial Center und Oriental Pearl Tower am Ufer von Lujiazui, über den Huangpu gesehen',
        cta: 'Weitere Beispielmodelle ansehen',
      },
      aerial: {
        title: 'Mehrere Modelle, ein Koordinatensystem',
        body: 'Jede Datei behält ihren Baum, ihre Eigenschaften und ihre Prüfung, und alle teilen sich die Karte. Zwischen Gebäuden messen, einen Schnitt legen oder die Sonne über dem ganzen Grundstück untersuchen.',
        alt: 'Luftbild von drei IFC-Türmen auf einer 3D-Karte von Lujiazui, Shanghai, in der Schleife des Huangpu',
        cta: 'So funktioniert die IFC-Georeferenzierung',
      },
    },
    illustration: 'Illustration (generiertes Bild), keine Aufnahme des Viewers.',
    compare: {
      label: 'Im Vergleich',
      title: 'IFC Viewer Online, Solibri oder Flinker?',
      sub: 'Drei Werkzeuge, die sich weniger überschneiden, als es scheint. Das veröffentlicht jedes über sich selbst.',
      rows: {
        madeFor: { label: 'Gemacht für', us: 'Ein IFC öffnen und wissen, ob es abgegeben werden kann: Viewer, Health Score, 44 Regeln, IDS, Korrekturen und Export', solibri: 'Regelbasierte Modellprüfung und Workflows zur Kollisionserkennung', flinker: '„Der IFC-Viewer für Microsoft“: SharePoint, Teams, Excel, Power BI und der Browser' },
        start: { label: 'Zum Start', us: 'Nichts: keine Installation, kein Konto. Die Datei wird im Browser gelesen und nie hochgeladen', solibri: 'Eine Lizenz, aus dem Solibri-Shop oder über den Vertrieb', flinker: 'Nichts für den Browser-Viewer; Microsoft 365 für die Teams- und SharePoint-Apps' },
        price: { label: 'Preis', us: 'Kostenlos ansehen, prüfen, korrigieren und exportieren', solibri: 'Von 99 € bis 2.772 € pro Lizenz und Jahr', flinker: 'Community-Viewer kostenlos; Enterprise mit Preis pro Bereitstellung' },
        choose: { label: 'Die richtige Wahl, wenn', us: 'Sie heute eine Antwort zu einem Modell brauchen, an jedem Rechner, und es auf einer 3D-Karte seines Standorts sehen wollen', solibri: 'Sie Kollisionsmatrizen und eigene Regeln für Ihr Projekt brauchen', flinker: 'Ihre Projekte bereits in SharePoint und Teams liegen' },
      },
      note: 'Angaben zu Solibri und Flinker von solibri.com/pricing und flinker.app, gelesen am 10. November 2026.',
      more: 'IFC Viewer Online als Solibri-Alternative',
    },
  },
  fr: {
    heroAlt: 'IFC Viewer Online avec trois maquettes IFC — Shanghai Tower, Shanghai World Financial Center et la tour Perle de l’Orient — sur la ville 3D d’OpenStreetMap, et les propriétés IFC d’un mur-rideau sélectionné',
    heroCaption: 'Trois fichiers IFC ouverts en même temps : Shanghai Tower, SWFC et la Perle de l’Orient, placés sur la ville OpenStreetMap par leur propre géoréférencement.',
    heroCaptionPanel: 'À droite, les propriétés de l’IfcCurtainWall sélectionné.',
    heroOpen: 'Ouvrir cette scène dans la visionneuse',
    label: 'La visionneuse à l’œuvre',
    title: 'De vraies maquettes sur de vrais écrans',
    sub: 'Captures de la visionneuse dans un onglet de navigateur, avec nos maquettes de démonstration publiques. Rien n’a été envoyé sur un serveur.',
    shots: {
      validation: {
        title: 'Un verdict en quelques secondes, et l’emplacement de chaque problème',
        body: 'Ces trois maquettes obtiennent 77 sur 100. Le panneau indique quoi corriger d’abord — 610 éléments sans type, 423 sans nom long — et un clic les colore en 3D.',
        alt: 'Panneau de contrôle IFC avec un Health Score de 77, la liste des anomalies et les éléments concernés surlignés dans la maquette 3D',
        cta: 'Contrôler un IFC en ligne',
      },
      skyline: {
        title: 'Votre maquette dans son environnement réel',
        body: 'Un IFC géoréférencé se pose sur la carte, entouré des bâtiments, des rues et de l’eau d’OpenStreetMap. Un bâtiment que personne n’a mesuré est dessiné bas et signalé comme supposé : le contexte n’invente jamais une skyline.',
        alt: 'Maquettes IFC de la Shanghai Tower, du Shanghai World Financial Center et de la tour Perle de l’Orient sur la rive de Lujiazui, vues depuis l’autre rive du Huangpu',
        cta: 'Voir d’autres maquettes d’exemple',
      },
      aerial: {
        title: 'Plusieurs maquettes, un seul système de coordonnées',
        body: 'Chaque fichier garde son arborescence, ses propriétés et son contrôle, et tous partagent la carte. Mesurez entre les bâtiments, coupez une section ou étudiez l’ensoleillement de tout le site.',
        alt: 'Vue aérienne de trois tours IFC sur une carte 3D de Lujiazui, à Shanghai, dans la boucle du Huangpu',
        cta: 'Comment fonctionne le géoréférencement IFC',
      },
    },
    illustration: 'Illustration (image générée), pas une capture de la visionneuse.',
    compare: {
      label: 'Comparaison',
      title: 'IFC Viewer Online, Solibri ou Flinker ?',
      sub: 'Trois outils qui se recoupent moins qu’il n’y paraît. Voici ce que chacun publie sur lui-même.',
      rows: {
        madeFor: { label: 'Conçu pour', us: 'Ouvrir un IFC et savoir s’il peut être livré : visionneuse, Health Score, 44 règles, IDS, corrections et export', solibri: 'Contrôle de maquettes par règles et détection de clashs', flinker: '« La visionneuse IFC pour Microsoft » : SharePoint, Teams, Excel, Power BI et le navigateur' },
        start: { label: 'Pour commencer', us: 'Rien : ni installation ni compte. Le fichier est lu dans votre navigateur et n’est jamais envoyé', solibri: 'Une licence, sur la boutique Solibri ou auprès du service commercial', flinker: 'Rien pour la visionneuse web ; Microsoft 365 pour les apps Teams et SharePoint' },
        price: { label: 'Prix', us: 'Gratuit pour voir, contrôler, corriger et exporter', solibri: 'De 99 € à 2 772 € par licence et par an', flinker: 'Visionneuse Community gratuite ; Enterprise au tarif par déploiement' },
        choose: { label: 'À choisir si', us: 'Vous avez besoin d’une réponse sur une maquette aujourd’hui, sur n’importe quel ordinateur, et de la voir sur une carte 3D de son site', solibri: 'Vous avez besoin de matrices de clashs et de règles écrites pour votre projet', flinker: 'Vos projets vivent déjà dans SharePoint et Teams' },
      },
      note: 'Informations sur Solibri et Flinker tirées de solibri.com/pricing et flinker.app, lues le 10 novembre 2026.',
      more: 'IFC Viewer Online comme alternative à Solibri',
    },
  },
  pt: {
    heroAlt: 'IFC Viewer Online com três modelos IFC — Shanghai Tower, Shanghai World Financial Center e a torre Pérola Oriental — sobre a cidade 3D do OpenStreetMap e as propriedades IFC de uma fachada-cortina selecionada',
    heroCaption: 'Três ficheiros IFC abertos ao mesmo tempo: Shanghai Tower, SWFC e a Pérola Oriental, colocados sobre a cidade do OpenStreetMap pela sua própria georreferenciação.',
    heroCaptionPanel: 'À direita, as propriedades do IfcCurtainWall selecionado.',
    heroOpen: 'Abrir esta cena no visualizador',
    label: 'O visualizador em ação',
    title: 'Modelos reais em ecrãs reais',
    sub: 'Capturas do visualizador a correr num separador do navegador com os nossos modelos de demonstração. Nada foi enviado para um servidor.',
    shots: {
      validation: {
        title: 'Um veredicto em segundos, e onde está cada problema',
        body: 'Estes três modelos obtêm 77 em 100. O painel diz o que corrigir primeiro — 610 elementos sem tipo, 423 sem nome longo — e um clique pinta-os em 3D.',
        alt: 'Painel de validação IFC com Health Score 77, a lista de problemas e os elementos afetados realçados no modelo 3D',
        cta: 'Validar um IFC online',
      },
      skyline: {
        title: 'O seu modelo na envolvente real',
        body: 'Um IFC georreferenciado pousa no mapa com os edifícios, ruas e água do OpenStreetMap à volta. Um edifício que ninguém mediu é desenhado baixo e marcado como suposto: a envolvente nunca inventa um skyline.',
        alt: 'Modelos IFC da Shanghai Tower, do Shanghai World Financial Center e da torre Pérola Oriental na margem de Lujiazui, vistos do outro lado do rio Huangpu',
        cta: 'Ver mais modelos de exemplo',
      },
      aerial: {
        title: 'Vários modelos, um só sistema de coordenadas',
        body: 'Cada ficheiro mantém a sua árvore, propriedades e validação, e todos partilham o mapa. Meça entre edifícios, corte uma secção ou estude o sol em todo o local.',
        alt: 'Vista aérea de três torres IFC sobre um mapa 3D de Lujiazui, Xangai, dentro da curva do rio Huangpu',
        cta: 'Como funciona a georreferenciação IFC',
      },
    },
    illustration: 'Ilustração (imagem gerada), não é uma captura do visualizador.',
    compare: {
      label: 'Comparação',
      title: 'IFC Viewer Online, Solibri ou Flinker?',
      sub: 'Três ferramentas que se sobrepõem menos do que parece. Isto é o que cada uma publica sobre si própria.',
      rows: {
        madeFor: { label: 'Feito para', us: 'Abrir um IFC e saber se pode ser entregue: visualizador, Health Score, 44 regras, IDS, correções e exportação', solibri: 'Verificação de modelos por regras e fluxos de deteção de colisões', flinker: '«O visualizador IFC para Microsoft»: SharePoint, Teams, Excel, Power BI e o navegador' },
        start: { label: 'Para começar', us: 'Nada: sem instalação e sem conta. O ficheiro é lido no navegador e nunca é enviado', solibri: 'Uma licença, na loja da Solibri ou através da equipa comercial', flinker: 'Nada para o visualizador web; Microsoft 365 para as apps de Teams e SharePoint' },
        price: { label: 'Preço', us: 'Grátis para ver, validar, corrigir e exportar', solibri: 'De 99 € a 2772 € por licença e por ano', flinker: 'Visualizador Community grátis; Enterprise com preço por implementação' },
        choose: { label: 'Escolha-o se', us: 'Precisa de uma resposta sobre um modelo hoje, em qualquer computador, e de o ver num mapa 3D do local', solibri: 'Precisa de matrizes de colisões e de regras escritas para o seu projeto', flinker: 'Os seus projetos já vivem no SharePoint e no Teams' },
      },
      note: 'Dados da Solibri e da Flinker retirados de solibri.com/pricing e flinker.app, lidos a 10 de novembro de 2026.',
      more: 'IFC Viewer Online como alternativa ao Solibri',
    },
  },
  it: {
    heroAlt: 'IFC Viewer Online con tre modelli IFC — Shanghai Tower, Shanghai World Financial Center e la torre Perla d’Oriente — sulla città 3D di OpenStreetMap e le proprietà IFC di una facciata continua selezionata',
    heroCaption: 'Tre file IFC aperti insieme: Shanghai Tower, SWFC e la Perla d’Oriente, posizionati sulla città di OpenStreetMap dalla loro georeferenziazione.',
    heroCaptionPanel: 'A destra, le proprietà dell’IfcCurtainWall selezionato.',
    heroOpen: 'Apri questa scena nel visualizzatore',
    label: 'Il visualizzatore al lavoro',
    title: 'Modelli veri su schermi veri',
    sub: 'Catture del visualizzatore in una scheda del browser con i nostri modelli dimostrativi pubblici. Nulla è stato caricato su un server.',
    shots: {
      validation: {
        title: 'Un verdetto in pochi secondi, e dove si trova ogni problema',
        body: 'Questi tre modelli ottengono 77 su 100. Il pannello dice cosa correggere per primo — 610 elementi senza tipo, 423 senza nome lungo — e un clic li colora in 3D.',
        alt: 'Pannello di validazione IFC con Health Score 77, l’elenco dei problemi e gli elementi interessati evidenziati nel modello 3D',
        cta: 'Valida un IFC online',
      },
      skyline: {
        title: 'Il tuo modello nel suo contesto reale',
        body: 'Un IFC georeferenziato si posa sulla mappa con edifici, strade e acqua di OpenStreetMap intorno. Un edificio che nessuno ha misurato viene disegnato basso e segnato come ipotizzato: il contesto non inventa mai uno skyline.',
        alt: 'Modelli IFC di Shanghai Tower, Shanghai World Financial Center e torre Perla d’Oriente sul lungofiume di Lujiazui, visti dall’altra sponda del fiume Huangpu',
        cta: 'Vedi altri modelli di esempio',
      },
      aerial: {
        title: 'Più modelli, un solo sistema di coordinate',
        body: 'Ogni file conserva il suo albero, le sue proprietà e la sua validazione, e tutti condividono la mappa. Misura tra gli edifici, taglia una sezione o studia il sole su tutto il sito.',
        alt: 'Vista aerea di tre torri IFC su una mappa 3D di Lujiazui, Shanghai, nell’ansa del fiume Huangpu',
        cta: 'Come funziona la georeferenziazione IFC',
      },
    },
    illustration: 'Illustrazione (immagine generata), non una cattura del visualizzatore.',
    compare: {
      label: 'Confronto',
      title: 'IFC Viewer Online, Solibri o Flinker?',
      sub: 'Tre strumenti che si sovrappongono meno di quanto sembri. Ecco cosa pubblica ciascuno su di sé.',
      rows: {
        madeFor: { label: 'Pensato per', us: 'Aprire un IFC e sapere se si può consegnare: visualizzatore, Health Score, 44 regole, IDS, correzioni ed esportazione', solibri: 'Controllo dei modelli basato su regole e flussi di clash detection', flinker: '«Il visualizzatore IFC per Microsoft»: SharePoint, Teams, Excel, Power BI e il browser' },
        start: { label: 'Per iniziare', us: 'Niente: nessuna installazione, nessun account. Il file viene letto nel browser e non viene mai caricato', solibri: 'Una licenza, dallo store Solibri o tramite l’ufficio vendite', flinker: 'Niente per il visualizzatore web; Microsoft 365 per le app di Teams e SharePoint' },
        price: { label: 'Prezzo', us: 'Gratis per visualizzare, validare, correggere ed esportare', solibri: 'Da 99 € a 2.772 € per licenza all’anno', flinker: 'Visualizzatore Community gratuito; Enterprise con prezzo per installazione' },
        choose: { label: 'Sceglilo se', us: 'Ti serve una risposta su un modello oggi, su qualsiasi computer, e vuoi vederlo su una mappa 3D del suo sito', solibri: 'Ti servono matrici di clash e regole scritte per il tuo progetto', flinker: 'I tuoi progetti vivono già in SharePoint e Teams' },
      },
      note: 'Dati su Solibri e Flinker tratti da solibri.com/pricing e flinker.app, letti il 10 novembre 2026.',
      more: 'IFC Viewer Online come alternativa a Solibri',
    },
  },
  ca: {
    heroAlt: 'IFC Viewer Online amb tres models IFC —Shanghai Tower, Shanghai World Financial Center i la torre Perla d’Orient— sobre la ciutat 3D d’OpenStreetMap i les propietats IFC d’un mur cortina seleccionat',
    heroCaption: 'Tres fitxers IFC oberts alhora: Shanghai Tower, SWFC i la Perla d’Orient, col·locats sobre la ciutat d’OpenStreetMap per la seva pròpia georeferenciació.',
    heroCaptionPanel: 'A la dreta, les propietats de l’IfcCurtainWall seleccionat.',
    heroOpen: 'Obrir aquesta escena al visor',
    label: 'El visor en acció',
    title: 'Models reals en pantalles reals',
    sub: 'Captures del visor funcionant en una pestanya del navegador amb els nostres models de demostració. No s’ha pujat res a cap servidor.',
    shots: {
      validation: {
        title: 'Un veredicte en segons, i on és cada problema',
        body: 'Aquests tres models treuen un 77 sobre 100. El panell diu què cal arreglar primer —610 elements sense tipus, 423 sense nom llarg— i un clic els pinta en 3D.',
        alt: 'Panell de validació IFC amb Health Score 77, la llista d’incidències i els elements afectats ressaltats al model 3D',
        cta: 'Validar un IFC en línia',
      },
      skyline: {
        title: 'El teu model en el seu entorn real',
        body: 'Un IFC georeferenciat cau al mapa amb els edificis, carrers i aigua d’OpenStreetMap al voltant. Un edifici que ningú ha mesurat es dibuixa baix i es marca com a suposat: l’entorn no s’inventa mai un skyline.',
        alt: 'Models IFC de la Shanghai Tower, el Shanghai World Financial Center i la torre Perla d’Orient a la riba de Lujiazui, vistos des de l’altra banda del riu Huangpu',
        cta: 'Veure més models d’exemple',
      },
      aerial: {
        title: 'Diversos models, un sol sistema de coordenades',
        body: 'Cada fitxer conserva el seu arbre, les seves propietats i la seva validació, i tots comparteixen el mapa. Mesura entre edificis, talla una secció o estudia el sol sobre tot l’emplaçament.',
        alt: 'Vista aèria de tres torres IFC sobre un mapa 3D de Lujiazui, Xangai, dins el meandre del riu Huangpu',
        cta: 'Com funciona la georeferenciació IFC',
      },
    },
    illustration: 'Il·lustració (imatge generada), no és una captura del visor.',
    compare: {
      label: 'Comparativa',
      title: 'IFC Viewer Online, Solibri o Flinker?',
      sub: 'Tres eines que se solapen menys del que sembla. Això és el que cadascuna publica sobre si mateixa.',
      rows: {
        madeFor: { label: 'Pensat per a', us: 'Obrir un IFC i saber si es pot lliurar: visor, Health Score, 44 regles, IDS, correccions i exportació', solibri: 'Comprovació de models per regles i fluxos de detecció de col·lisions', flinker: '«El visor IFC per a Microsoft»: SharePoint, Teams, Excel, Power BI i el navegador' },
        start: { label: 'Per començar', us: 'Res: sense instal·lar i sense compte. El fitxer es llegeix al navegador i no es puja mai', solibri: 'Una llicència, a la botiga de Solibri o amb l’equip comercial', flinker: 'Res per al visor web; Microsoft 365 per a les apps de Teams i SharePoint' },
        price: { label: 'Preu', us: 'Gratis per veure, validar, corregir i exportar', solibri: 'De 99 € a 2.772 € per llicència i any', flinker: 'Visor Community gratuït; Enterprise amb preu per desplegament' },
        choose: { label: 'Tria’l si', us: 'Necessites una resposta sobre un model avui, en qualsevol ordinador, i veure’l en un mapa 3D del seu emplaçament', solibri: 'Necessites matrius de col·lisions i regles escrites per al teu projecte', flinker: 'Els teus projectes ja viuen a SharePoint i Teams' },
      },
      note: 'Dades de Solibri i Flinker extretes de solibri.com/pricing i flinker.app, llegides el 10 de novembre de 2026.',
      more: 'IFC Viewer Online com a alternativa a Solibri',
    },
  },
  zh: {
    heroAlt: 'IFC Viewer Online 中的三个 IFC 模型——上海中心大厦、上海环球金融中心和东方明珠塔——位于 OpenStreetMap 三维城市上，右侧为所选幕墙的 IFC 属性',
    heroCaption: '同时打开三个 IFC 文件：上海中心大厦、环球金融中心和东方明珠，按各自的地理配准放置在 OpenStreetMap 城市上。',
    heroCaptionPanel: '右侧是所选 IfcCurtainWall 的属性。',
    heroOpen: '在查看器中打开此场景',
    label: '查看器实拍',
    title: '真实模型，真实画面',
    sub: '以下均为查看器在浏览器标签页中运行公开演示模型的截图，没有任何文件上传到服务器。',
    shots: {
      validation: {
        title: '几秒得出结论，并指出每个问题的位置',
        body: '这三个模型得分 77（满分 100）。面板列出应优先修复的问题——610 个构件缺少类型、423 个缺少长名称——点一下即可在三维中高亮。',
        alt: 'IFC 检查面板：健康评分 77、问题列表，以及在三维模型中高亮显示的相关构件',
        cta: '在线检查 IFC',
      },
      skyline: {
        title: '把模型放进真实环境',
        body: '带地理配准的 IFC 会落在地图上，周围是 OpenStreetMap 的建筑、街道和水体。没有实测高度的建筑会画得较低并标为“假定”：周边环境绝不凭空造出天际线。',
        alt: '陆家嘴滨江的上海中心大厦、上海环球金融中心和东方明珠塔 IFC 模型，隔黄浦江远眺',
        cta: '查看更多示例模型',
      },
      aerial: {
        title: '多个模型，同一坐标系',
        body: '每个文件保留各自的结构树、属性和检查结果，并共用同一张地图。可在建筑之间测量、剖切，或对整个场地做日照分析。',
        alt: '黄浦江弯道内，上海陆家嘴三维地图上三座 IFC 塔楼的鸟瞰图',
        cta: 'IFC 地理配准的工作方式',
      },
    },
    illustration: '示意图（生成图像），并非查看器截图。',
    compare: {
      label: '对比',
      title: 'IFC Viewer Online、Solibri 还是 Flinker？',
      sub: '三款工具的重叠比看上去要少。以下是各自官网对自己的描述。',
      rows: {
        madeFor: { label: '用途', us: '打开 IFC 并判断能否交付：查看器、健康评分、44 条规则、IDS、修复与导出', solibri: '基于规则的模型检查与碰撞检测流程', flinker: '“面向 Microsoft 的 IFC 查看器”：SharePoint、Teams、Excel、Power BI 和浏览器' },
        start: { label: '开始使用需要', us: '什么都不需要：无需安装，无需账号。文件在浏览器中读取，从不上传', solibri: '一份许可证，可在 Solibri 商店购买或联系销售', flinker: '浏览器查看器无需任何条件；Teams 和 SharePoint 应用需要 Microsoft 365' },
        price: { label: '价格', us: '查看、检查、修复和导出均免费', solibri: '每个许可证每年 99 至 2,772 欧元', flinker: 'Community 查看器免费；Enterprise 按部署定价' },
        choose: { label: '适合的情况', us: '今天就要对模型得出结论，任何电脑都能用，并想在场地的三维地图上查看它', solibri: '需要碰撞矩阵和为项目定制的规则', flinker: '项目已经放在 SharePoint 和 Teams 里' },
      },
      note: 'Solibri 与 Flinker 的信息来自 solibri.com/pricing 和 flinker.app，读取于 2026 年 11 月 10 日。',
      more: 'IFC Viewer Online 作为 Solibri 的替代方案',
    },
  },
  ja: {
    heroAlt: 'IFC Viewer Online で 3 つの IFC モデル（上海タワー、上海環球金融中心、東方明珠塔）を OpenStreetMap の 3D 都市上に表示し、選択したカーテンウォールの IFC プロパティを表示している画面',
    heroCaption: '3 つの IFC ファイルを同時に表示：上海タワー、SWFC、東方明珠塔を、それぞれのジオリファレンスで OpenStreetMap の都市上に配置。',
    heroCaptionPanel: '右側は選択した IfcCurtainWall のプロパティです。',
    heroOpen: 'このシーンをビューアで開く',
    label: '実際のビューア',
    title: '本物のモデル、本物の画面',
    sub: '公開デモモデルをブラウザのタブで動かしたビューアのキャプチャです。サーバーには何もアップロードしていません。',
    shots: {
      validation: {
        title: '数秒で判定、問題の場所もわかる',
        body: 'この 3 モデルのスコアは 100 点中 77 点。パネルが優先して直す項目（タイプ未設定 610 要素、LongName なし 423 要素）を示し、ワンクリックで 3D 上に色付けします。',
        alt: 'Health Score 77、指摘一覧、3D モデル上でハイライトされた該当要素を表示する IFC チェックパネル',
        cta: 'IFC をオンラインでチェック',
      },
      skyline: {
        title: 'モデルを実際の周辺環境の中に',
        body: 'ジオリファレンス付きの IFC は、OpenStreetMap の建物・道路・水域に囲まれて地図上に配置されます。高さが測量されていない建物は低く描かれ「仮定」と表示されるため、周辺が架空のスカイラインを作ることはありません。',
        alt: '黄浦江越しに見た陸家嘴ウォーターフロントの上海タワー、上海環球金融中心、東方明珠塔の IFC モデル',
        cta: 'ほかのサンプルモデルを見る',
      },
      aerial: {
        title: '複数モデルを一つの座標系で',
        body: '各ファイルは自分のツリー、プロパティ、チェック結果を保ったまま、同じ地図を共有します。建物間の計測、断面、敷地全体の日照検討ができます。',
        alt: '黄浦江の湾曲部にある上海・陸家嘴の 3D マップ上に置かれた 3 棟の IFC タワーの俯瞰図',
        cta: 'IFC のジオリファレンスの仕組み',
      },
    },
    illustration: 'イラスト（生成画像）であり、ビューアのキャプチャではありません。',
    compare: {
      label: '比較',
      title: 'IFC Viewer Online、Solibri、Flinker のどれを選ぶ？',
      sub: '3 つのツールは思ったほど重なっていません。各社が自ら公表している内容です。',
      rows: {
        madeFor: { label: '用途', us: 'IFC を開いて納品できるかを知る：ビューア、Health Score、44 ルール、IDS、修正と書き出し', solibri: 'ルールベースのモデルチェックと干渉チェックのワークフロー', flinker: '「Microsoft のための IFC ビューア」：SharePoint、Teams、Excel、Power BI、ブラウザ' },
        start: { label: '始めるには', us: '何も不要：インストールもアカウントもなし。ファイルはブラウザ内で読み込まれ、アップロードされません', solibri: 'ライセンス（Solibri ストアまたは営業経由）', flinker: 'ブラウザ版ビューアは何も不要。Teams・SharePoint アプリには Microsoft 365' },
        price: { label: '価格', us: '表示・チェック・修正・書き出しは無料', solibri: '1 ライセンスあたり年間 99〜2,772 ユーロ', flinker: 'Community ビューアは無料。Enterprise は導入ごとの価格' },
        choose: { label: '向いている場合', us: '今日、どのパソコンでもモデルの答えが必要で、敷地の 3D マップ上でも見たい', solibri: '干渉マトリクスやプロジェクト専用のルールが必要', flinker: 'プロジェクトがすでに SharePoint と Teams にある' },
      },
      note: 'Solibri と Flinker の情報は solibri.com/pricing と flinker.app より（2026 年 11 月 10 日閲覧）。',
      more: 'Solibri の代替としての IFC Viewer Online',
    },
  },
  th: {
    heroAlt: 'IFC Viewer Online แสดงโมเดล IFC สามโมเดล ได้แก่ Shanghai Tower, Shanghai World Financial Center และหอไข่มุกตะวันออก บนเมือง 3 มิติจาก OpenStreetMap พร้อมคุณสมบัติ IFC ของผนังม่านที่เลือก',
    heroCaption: 'เปิดไฟล์ IFC สามไฟล์พร้อมกัน: Shanghai Tower, SWFC และหอไข่มุกตะวันออก วางบนเมืองจาก OpenStreetMap ตามพิกัดอ้างอิงของแต่ละไฟล์',
    heroCaptionPanel: 'ด้านขวาคือคุณสมบัติของ IfcCurtainWall ที่เลือก',
    heroOpen: 'เปิดฉากนี้ในโปรแกรมดู',
    label: 'โปรแกรมดูขณะใช้งานจริง',
    title: 'โมเดลจริงบนหน้าจอจริง',
    sub: 'ภาพจับหน้าจอของโปรแกรมดูที่ทำงานในแท็บเบราว์เซอร์ด้วยโมเดลสาธิตสาธารณะของเรา ไม่มีการอัปโหลดสิ่งใดไปยังเซิร์ฟเวอร์',
    shots: {
      validation: {
        title: 'รู้ผลในไม่กี่วินาที และรู้ว่าปัญหาอยู่ตรงไหน',
        body: 'โมเดลทั้งสามได้ 77 จาก 100 คะแนน แผงจะบอกว่าควรแก้อะไรก่อน เช่น 610 ชิ้นส่วนไม่มีชนิด และ 423 ชิ้นส่วนไม่มีชื่อยาว แล้วคลิกครั้งเดียวเพื่อระบายสีใน 3 มิติ',
        alt: 'แผงตรวจสอบ IFC แสดง Health Score 77 รายการปัญหา และชิ้นส่วนที่เกี่ยวข้องถูกเน้นในโมเดล 3 มิติ',
        cta: 'ตรวจ IFC ออนไลน์',
      },
      skyline: {
        title: 'โมเดลของคุณในสภาพแวดล้อมจริง',
        body: 'IFC ที่มีพิกัดอ้างอิงจะวางลงบนแผนที่ พร้อมอาคาร ถนน และแหล่งน้ำจาก OpenStreetMap โดยรอบ อาคารที่ไม่มีใครวัดความสูงจะถูกวาดให้เตี้ยและระบุว่าเป็นค่าสมมติ บริบทจึงไม่สร้างเส้นขอบฟ้าที่ไม่มีอยู่จริง',
        alt: 'โมเดล IFC ของ Shanghai Tower, Shanghai World Financial Center และหอไข่มุกตะวันออกริมน้ำลู่เจียจุ่ย มองข้ามแม่น้ำหวงผู่',
        cta: 'ดูโมเดลตัวอย่างเพิ่มเติม',
      },
      aerial: {
        title: 'หลายโมเดล ระบบพิกัดเดียว',
        body: 'แต่ละไฟล์ยังมีโครงสร้าง คุณสมบัติ และผลตรวจของตัวเอง และทั้งหมดใช้แผนที่ร่วมกัน วัดระยะระหว่างอาคาร ตัดภาคตัด หรือศึกษาแสงแดดทั้งพื้นที่ได้',
        alt: 'ภาพมุมสูงของหอคอย IFC สามหลังบนแผนที่ 3 มิติของลู่เจียจุ่ย เซี่ยงไฮ้ ภายในโค้งแม่น้ำหวงผู่',
        cta: 'การอ้างอิงพิกัดของ IFC ทำงานอย่างไร',
      },
    },
    illustration: 'ภาพประกอบ (ภาพที่สร้างขึ้น) ไม่ใช่ภาพจับหน้าจอของโปรแกรมดู',
    compare: {
      label: 'เปรียบเทียบ',
      title: 'IFC Viewer Online, Solibri หรือ Flinker?',
      sub: 'เครื่องมือสามตัวที่ซ้อนทับกันน้อยกว่าที่คิด นี่คือสิ่งที่แต่ละรายเผยแพร่เกี่ยวกับตัวเอง',
      rows: {
        madeFor: { label: 'ทำมาเพื่อ', us: 'เปิด IFC แล้วรู้ว่าส่งมอบได้หรือไม่: โปรแกรมดู, Health Score, 44 กฎ, IDS, การแก้ไขและส่งออก', solibri: 'การตรวจโมเดลตามกฎและขั้นตอนตรวจจับการชน', flinker: '“โปรแกรมดู IFC สำหรับ Microsoft”: SharePoint, Teams, Excel, Power BI และเบราว์เซอร์' },
        start: { label: 'สิ่งที่ต้องมีก่อนเริ่ม', us: 'ไม่ต้องมีอะไร: ไม่ต้องติดตั้ง ไม่ต้องมีบัญชี ไฟล์ถูกอ่านในเบราว์เซอร์และไม่ถูกอัปโหลด', solibri: 'ไลเซนส์ จากร้านค้าของ Solibri หรือผ่านฝ่ายขาย', flinker: 'ไม่ต้องมีอะไรสำหรับโปรแกรมดูบนเบราว์เซอร์; Microsoft 365 สำหรับแอป Teams และ SharePoint' },
        price: { label: 'ราคา', us: 'ดู ตรวจ แก้ไข และส่งออกได้ฟรี', solibri: '99 ถึง 2,772 ยูโรต่อไลเซนส์ต่อปี', flinker: 'โปรแกรมดู Community ฟรี; Enterprise คิดราคาตามการติดตั้ง' },
        choose: { label: 'เหมาะเมื่อ', us: 'คุณต้องการคำตอบเกี่ยวกับโมเดลวันนี้ บนคอมพิวเตอร์เครื่องใดก็ได้ และอยากเห็นมันบนแผนที่ 3 มิติของที่ตั้ง', solibri: 'คุณต้องการเมทริกซ์การชนและกฎที่เขียนขึ้นสำหรับโครงการของคุณ', flinker: 'โครงการของคุณอยู่ใน SharePoint และ Teams อยู่แล้ว' },
      },
      note: 'ข้อมูลของ Solibri และ Flinker มาจาก solibri.com/pricing และ flinker.app อ่านเมื่อวันที่ 10 พฤศจิกายน 2026',
      more: 'IFC Viewer Online เป็นทางเลือกแทน Solibri',
    },
  },
}
