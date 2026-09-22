// ─── Editorial component copy ────────────────────────────────────────────────
// Control labels for the interactive blog blocks (tables, decisions, terms).
//
// Keyed by the ARTICLE's language, not the UI's: a Spanish post read with an
// English UI must still say "Buscar filas" next to Spanish rows. Posts exist
// only in these four languages (see blog-posts.ts), so that is all this needs.

export interface EditorialCopy {
  searchRows: string
  searchPlaceholder: string
  rowsShown: (shown: number, total: number) => string
  noRows: string
  clearSearch: string
  focusColumn: string
  allColumns: string
  moreDetails: (n: number) => string
  scrollHint: string
  tableRegion: (caption: string) => string
  takeaways: string
  step: (n: number, total: number) => string
  stepDetail: string
  decisionPick: string
  readGuide: string
  copyQuote: string
  enlarge: string
  wrapLines: string
  zoomIn: string
  quickLook: string
  goToSection: string
  openArticle: string
  inThisArticle: string
  pointOfInterest: string
  toolLabel: string
  nextUp: string
  keepExploring: string
  toolsForTopic: string
  alreadyRead: string
  minRead: (n: number) => string
  reason: { linked: string; backlink: string; keywords: (k: string) => string; category: (c: string) => string }
  citation: (n: number, title: string) => string
  relatedGuide: string
  source: string
  openSource: string
  allReferences: string
  references: string
  backToCitation: (n: number) => string
  backToText: string
  zoomOut: string
  resetZoom: string
  zoomHint: string
  copyCode: string
  copied: string
  share: string
  shareQuote: string
  copyLink: (section: string) => string
  definition: string
  close: string
  callout: { tip: string; warning: string; info: string }
}

const en: EditorialCopy = {
  searchRows: 'Filter rows',
  searchPlaceholder: 'Filter…',
  rowsShown: (s, t) => (s === t ? `${t} rows` : `${s} of ${t} rows`),
  noRows: 'No rows match this filter.',
  clearSearch: 'Clear filter',
  focusColumn: 'Compare by',
  allColumns: 'All',
  moreDetails: (n) => `${n} more ${n === 1 ? 'detail' : 'details'}`,
  scrollHint: 'Scroll sideways for more columns',
  tableRegion: (c) => `Table: ${c}`,
  takeaways: 'Key takeaways',
  step: (n, t) => `Step ${n} of ${t}`,
  stepDetail: 'Details',
  decisionPick: 'Pick the situation closest to yours',
  readGuide: 'Read the guide',
  copyQuote: 'Copy quote',
  enlarge: 'Enlarge image',
  wrapLines: 'Wrap lines',
  zoomIn: 'Zoom in',
  quickLook: 'Quick look',
  goToSection: 'Go to section',
  openArticle: 'Open article',
  inThisArticle: 'In this article',
  pointOfInterest: 'Worth a detour',
  toolLabel: 'Tool',
  nextUp: 'Next up',
  keepExploring: 'Keep exploring',
  toolsForTopic: 'Tools for this topic',
  alreadyRead: 'Read',
  minRead: (n) => `${n} min read`,
  reason: { linked: 'Referenced in this article', backlink: 'Builds on this article', keywords: (k) => `Also about: ${k}`, category: (c) => `More in ${c}` },
  citation: (n, t) => `Reference ${n}: ${t}`,
  relatedGuide: 'Related guide',
  source: 'Source',
  openSource: 'Open source',
  allReferences: 'All references',
  references: 'References',
  backToCitation: (n) => `Back to citation ${n} in the text`,
  backToText: 'Back to text',
  zoomOut: 'Zoom out',
  resetZoom: 'Fit to screen',
  zoomHint: 'Pinch, scroll or double-tap to zoom · drag to move',
  copyCode: 'Copy code',
  copied: 'Copied',
  share: 'Share',
  shareQuote: 'Share this quote',
  copyLink: (x) => `Copy link to «${x}»`,
  definition: 'Definition',
  close: 'Close',
  callout: { tip: 'Tip', warning: 'Warning', info: 'Note' },
}

const es: EditorialCopy = {
  searchRows: 'Filtrar filas',
  searchPlaceholder: 'Filtrar…',
  rowsShown: (s, t) => (s === t ? `${t} filas` : `${s} de ${t} filas`),
  noRows: 'Ninguna fila coincide con el filtro.',
  clearSearch: 'Borrar filtro',
  focusColumn: 'Comparar por',
  allColumns: 'Todo',
  moreDetails: (n) => `${n} ${n === 1 ? 'dato más' : 'datos más'}`,
  scrollHint: 'Desliza para ver más columnas',
  tableRegion: (c) => `Tabla: ${c}`,
  takeaways: 'Lo esencial',
  step: (n, t) => `Paso ${n} de ${t}`,
  stepDetail: 'Detalles',
  decisionPick: 'Elige la situación más parecida a la tuya',
  readGuide: 'Leer la guía',
  copyQuote: 'Copiar cita',
  enlarge: 'Ampliar imagen',
  wrapLines: 'Ajustar líneas',
  zoomIn: 'Acercar',
  quickLook: 'Vista rápida',
  goToSection: 'Ir a la sección',
  openArticle: 'Abrir artículo',
  inThisArticle: 'En este artículo',
  pointOfInterest: 'Merece el desvío',
  toolLabel: 'Herramienta',
  nextUp: 'Siguiente lectura',
  keepExploring: 'Sigue explorando',
  toolsForTopic: 'Herramientas para este tema',
  alreadyRead: 'Leído',
  minRead: (n) => `${n} min de lectura`,
  reason: { linked: 'Citado en este artículo', backlink: 'Amplía este artículo', keywords: (k) => `También trata: ${k}`, category: (c) => `Más en ${c}` },
  citation: (n, t) => `Referencia ${n}: ${t}`,
  relatedGuide: 'Guía relacionada',
  source: 'Fuente',
  openSource: 'Abrir fuente',
  allReferences: 'Todas las referencias',
  references: 'Referencias',
  backToCitation: (n) => `Volver a la cita ${n} en el texto`,
  backToText: 'Volver al texto',
  zoomOut: 'Alejar',
  resetZoom: 'Ajustar a pantalla',
  zoomHint: 'Pellizca, usa la rueda o toca dos veces · arrastra para mover',
  copyCode: 'Copiar código',
  copied: 'Copiado',
  share: 'Compartir',
  shareQuote: 'Compartir esta cita',
  copyLink: (x) => `Copiar enlace a «${x}»`,
  definition: 'Definición',
  close: 'Cerrar',
  callout: { tip: 'Consejo', warning: 'Atención', info: 'Nota' },
}

const de: EditorialCopy = {
  searchRows: 'Zeilen filtern',
  searchPlaceholder: 'Filtern…',
  rowsShown: (s, t) => (s === t ? `${t} Zeilen` : `${s} von ${t} Zeilen`),
  noRows: 'Keine Zeile passt zu diesem Filter.',
  clearSearch: 'Filter löschen',
  focusColumn: 'Vergleichen nach',
  allColumns: 'Alle',
  moreDetails: (n) => `${n} weitere ${n === 1 ? 'Angabe' : 'Angaben'}`,
  scrollHint: 'Seitlich wischen für weitere Spalten',
  tableRegion: (c) => `Tabelle: ${c}`,
  takeaways: 'Das Wichtigste',
  step: (n, t) => `Schritt ${n} von ${t}`,
  stepDetail: 'Details',
  decisionPick: 'Wählen Sie die Situation, die Ihrer am nächsten kommt',
  readGuide: 'Zum Leitfaden',
  copyQuote: 'Zitat kopieren',
  enlarge: 'Bild vergrößern',
  wrapLines: 'Zeilen umbrechen',
  zoomIn: 'Vergrößern',
  quickLook: 'Schnellansicht',
  goToSection: 'Zum Abschnitt',
  openArticle: 'Artikel öffnen',
  inThisArticle: 'In diesem Artikel',
  pointOfInterest: 'Lohnt den Umweg',
  toolLabel: 'Werkzeug',
  nextUp: 'Als Nächstes',
  keepExploring: 'Weiter entdecken',
  toolsForTopic: 'Werkzeuge zum Thema',
  alreadyRead: 'Gelesen',
  minRead: (n) => `${n} Min. Lesezeit`,
  reason: { linked: 'In diesem Artikel verlinkt', backlink: 'Baut auf diesem Artikel auf', keywords: (k) => `Auch zu: ${k}`, category: (c) => `Mehr in ${c}` },
  citation: (n, t) => `Quelle ${n}: ${t}`,
  relatedGuide: 'Verwandter Leitfaden',
  source: 'Quelle',
  openSource: 'Quelle öffnen',
  allReferences: 'Alle Quellen',
  references: 'Quellen',
  backToCitation: (n) => `Zurück zu Verweis ${n} im Text`,
  backToText: 'Zurück zum Text',
  zoomOut: 'Verkleinern',
  resetZoom: 'An Bildschirm anpassen',
  zoomHint: 'Zum Zoomen ziehen, scrollen oder doppeltippen · zum Verschieben ziehen',
  copyCode: 'Code kopieren',
  copied: 'Kopiert',
  share: 'Teilen',
  shareQuote: 'Dieses Zitat teilen',
  copyLink: (x) => `Link kopieren zu «${x}»`,
  definition: 'Definition',
  close: 'Schließen',
  callout: { tip: 'Tipp', warning: 'Achtung', info: 'Hinweis' },
}

const fr: EditorialCopy = {
  searchRows: 'Filtrer les lignes',
  searchPlaceholder: 'Filtrer…',
  rowsShown: (s, t) => (s === t ? `${t} lignes` : `${s} sur ${t} lignes`),
  noRows: 'Aucune ligne ne correspond à ce filtre.',
  clearSearch: 'Effacer le filtre',
  focusColumn: 'Comparer par',
  allColumns: 'Tout',
  moreDetails: (n) => `${n} ${n === 1 ? 'détail' : 'détails'} de plus`,
  scrollHint: 'Faites défiler pour voir plus de colonnes',
  tableRegion: (c) => `Tableau : ${c}`,
  takeaways: 'L’essentiel',
  step: (n, t) => `Étape ${n} sur ${t}`,
  stepDetail: 'Détails',
  decisionPick: 'Choisissez la situation la plus proche de la vôtre',
  readGuide: 'Lire le guide',
  copyQuote: 'Copier la citation',
  enlarge: 'Agrandir l’image',
  wrapLines: 'Retour à la ligne',
  zoomIn: 'Zoom avant',
  quickLook: 'Aperçu rapide',
  goToSection: 'Aller à la section',
  openArticle: 'Ouvrir l’article',
  inThisArticle: 'Dans cet article',
  pointOfInterest: 'Vaut le détour',
  toolLabel: 'Outil',
  nextUp: 'À lire ensuite',
  keepExploring: 'Continuer d’explorer',
  toolsForTopic: 'Outils pour ce sujet',
  alreadyRead: 'Lu',
  minRead: (n) => `${n} min de lecture`,
  reason: { linked: 'Cité dans cet article', backlink: 'Prolonge cet article', keywords: (k) => `Aussi sur : ${k}`, category: (c) => `Plus dans ${c}` },
  citation: (n, t) => `Référence ${n} : ${t}`,
  relatedGuide: 'Guide associé',
  source: 'Source',
  openSource: 'Ouvrir la source',
  allReferences: 'Toutes les références',
  references: 'Références',
  backToCitation: (n) => `Retour à la citation ${n} dans le texte`,
  backToText: 'Retour au texte',
  zoomOut: 'Zoom arrière',
  resetZoom: 'Ajuster à l’écran',
  zoomHint: 'Pincez, faites défiler ou touchez deux fois · glissez pour déplacer',
  copyCode: 'Copier le code',
  copied: 'Copié',
  share: 'Partager',
  shareQuote: 'Partager cette citation',
  copyLink: (x) => `Copier le lien vers «${x}»`,
  definition: 'Définition',
  close: 'Fermer',
  callout: { tip: 'Astuce', warning: 'Attention', info: 'Note' },
}

const COPY: Record<string, EditorialCopy> = { en, es, de, fr }

export function editorialCopy(lang: string): EditorialCopy {
  return COPY[lang.slice(0, 2)] ?? en
}
