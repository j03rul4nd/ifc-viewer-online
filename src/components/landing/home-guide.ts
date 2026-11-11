// ─── Home page: «open an IFC file», answered in the reader's own words ────────
// Search Console (export of 2026-11-10) shows what people type in Germany,
// France and Spain when they have an .ifc and nothing to open it with:
// «ifc datei öffnen», «ifc viewer kostenlos», «ifc-viewer deutsch»,
// «visionneuse ifc», «lecteur ifc gratuit», «ouvrir un fichier ifc»,
// «visor ifc», «abrir archivo ifc», «como abrir archivos ifc». The homes in
// those languages answered them only in the last third of the page, inside
// the FAQ. This block answers them under their own heading, and each answer
// ends in something the reader can do.
//
// Kept as data: the page renders it (HomeGuide.tsx) and the static shell
// states the same text for crawlers that do not run the app
// (scripts/seo/generate-lang-shells.ts). A language without an entry gets no
// block; write one only from the queries that language really receives.

import { pricingPath } from '../../lib/pricing/pricing-paths'
import { validatorPath } from '../../lib/localized-landings'
import { HOME_LANGS, type HomeLang } from './home-copy'
import { examplesPath } from './home-showcase'

export type GuideTarget = 'examples' | 'validator' | 'pricing'

export interface GuideItem {
  /** The question as it is searched. */
  q: string
  a: string
  /** Where the answer leads, and the words on the link. */
  link?: { to: GuideTarget; text: string }
}

export interface HomeGuide {
  label: string
  title: string
  intro: string
  items: GuideItem[]
}

export const HOME_GUIDE: Partial<Record<HomeLang, HomeGuide>> = {
  es: {
    label: 'Abrir un archivo IFC',
    title: 'Abre, mira y comprueba un archivo IFC online, gratis',
    intro: '¿Te han mandado un .ifc y no tienes ningún programa BIM instalado? El visor funciona en el navegador y el archivo se queda en tu ordenador.',
    items: [
      {
        q: '¿Con qué programa se abre un archivo IFC?',
        a: 'Con ninguno que haya que instalar: arrastra el .ifc a esta página o pulsa «Abrir un archivo IFC». No hace falta cuenta; el visor funciona en Chrome, Edge, Firefox y Safari, en Windows y en macOS. ¿No tienes un archivo a mano? Abre uno de los modelos de ejemplo.',
        link: { to: 'examples', text: 'Ver modelos IFC de ejemplo' },
      },
      {
        q: '¿Qué es un archivo IFC?',
        a: 'IFC (Industry Foundation Classes, ISO 16739) es el formato abierto de intercambio de modelos BIM: guarda la geometría y, de cada elemento, su clase, su planta y sus propiedades. Revit, Archicad, Allplan y Tekla lo exportan. El visor lee IFC2x3, IFC4, IFC4x1 e IFC4x3; al hacer clic en un elemento ves sus propiedades.',
        link: { to: 'validator', text: 'Validar un IFC online' },
      },
      {
        q: '¿Qué incluye el visor IFC gratuito?',
        a: 'Ver, medir, seccionar, sacar plantas, comprobar el modelo con 44 reglas y exportar a IFC o GLB, gratis y sin límite de tiempo. Todo lo que funciona en el navegador seguirá siendo gratis; los planes de pago solo añaden lo que necesita nuestros servidores, como almacenamiento en la UE y enlaces para tu cliente.',
        link: { to: 'pricing', text: 'Comparar planes y precios' },
      },
      {
        q: '¿Puedo ver un IFC en la tablet o en el móvil?',
        a: 'Sí. En tablet y móvil pulsa «Abrir un archivo IFC» y elige el archivo con el selector del navegador. A partir de unos 200 MB conviene un ordenador, que tiene más memoria.',
      },
    ],
  },
  de: {
    label: 'IFC-Datei öffnen',
    title: 'IFC-Dateien kostenlos online öffnen, ansehen und prüfen',
    intro: 'Sie haben eine .ifc-Datei bekommen und kein BIM-Programm installiert? Der Viewer läuft im Browser, die Datei bleibt auf Ihrem Rechner.',
    items: [
      {
        q: 'Womit kann ich eine IFC-Datei öffnen?',
        a: 'Ohne Installation: Ziehen Sie die .ifc-Datei auf diese Seite oder klicken Sie auf „IFC-Datei öffnen“. Ein Konto ist nicht nötig; der Viewer läuft in Chrome, Edge, Firefox und Safari unter Windows und macOS. Gerade keine Datei zur Hand? Öffnen Sie eines der Beispielmodelle.',
        link: { to: 'examples', text: 'IFC-Beispielmodelle ansehen' },
      },
      {
        q: 'Was ist eine IFC-Datei?',
        a: 'IFC (Industry Foundation Classes, ISO 16739) ist das offene Austauschformat für BIM-Modelle: Es enthält die Geometrie und zu jedem Bauteil Klasse, Geschoss und Eigenschaften. Revit, Archicad, Allplan und Tekla exportieren es. Der Viewer liest IFC2x3, IFC4, IFC4x1 und IFC4x3; ein Klick auf ein Bauteil zeigt dessen Eigenschaften.',
        link: { to: 'validator', text: 'IFC-Datei online prüfen' },
      },
      {
        q: 'Was kann der kostenlose IFC Viewer?',
        a: 'Modelle ansehen, messen, schneiden, Grundrisse anzeigen, mit 44 Regeln prüfen und als IFC oder GLB exportieren – kostenlos und ohne Zeitlimit. Alles, was im Browser läuft, bleibt kostenlos; bezahlte Pläne ergänzen nur, was unsere Server braucht, etwa Speicher in der EU und Links für Ihren Auftraggeber.',
        link: { to: 'pricing', text: 'Preise und Pläne vergleichen' },
      },
      {
        q: 'Gibt es den IFC-Viewer auf Deutsch, auch für Tablet und Smartphone?',
        a: 'Ja. Unter ifcvieweronline.eu/de/ ist die gesamte Oberfläche deutsch. Auf Tablet und Smartphone tippen Sie auf „IFC-Datei öffnen“ und wählen die Datei über die Dateiauswahl des Browsers. Ab etwa 200 MB empfiehlt sich ein Rechner, weil er mehr Arbeitsspeicher hat.',
      },
    ],
  },
  fr: {
    label: 'Ouvrir un fichier IFC',
    title: 'Ouvrir, lire et vérifier un fichier IFC en ligne, gratuitement',
    intro: 'Vous avez reçu un fichier .ifc et aucun logiciel BIM n’est installé ? La visionneuse fonctionne dans le navigateur, et le fichier reste sur votre ordinateur.',
    items: [
      {
        q: 'Quel logiciel pour ouvrir un fichier IFC ?',
        a: 'Aucun à installer : glissez le fichier .ifc sur cette page ou cliquez sur « Ouvrir un fichier IFC ». Pas de compte à créer ; ce lecteur IFC fonctionne dans Chrome, Edge, Firefox et Safari, sous Windows et macOS. Pas de fichier sous la main ? Ouvrez l’une des maquettes d’exemple.',
        link: { to: 'examples', text: 'Voir les maquettes IFC d’exemple' },
      },
      {
        q: 'Qu’est-ce qu’un fichier IFC ?',
        a: 'L’IFC (Industry Foundation Classes, ISO 16739) est le format d’échange ouvert des maquettes BIM : il contient la géométrie et, pour chaque objet, sa classe, son niveau et ses propriétés. Revit, Archicad, Allplan et Tekla l’exportent. La visionneuse lit les IFC2x3, IFC4, IFC4x1 et IFC4x3 ; un clic sur un objet affiche ses propriétés.',
        link: { to: 'validator', text: 'Vérifier un fichier IFC en ligne' },
      },
      {
        q: 'Que fait la visionneuse IFC gratuite ?',
        a: 'Visualiser, mesurer, couper, afficher les plans d’étage, contrôler la maquette avec 44 règles et exporter en IFC ou en GLB, gratuitement et sans limite de durée. Tout ce qui s’exécute dans le navigateur reste gratuit ; les offres payantes n’ajoutent que ce qui demande nos serveurs, comme le stockage dans l’UE et les liens pour votre client.',
        link: { to: 'pricing', text: 'Comparer les offres' },
      },
      {
        q: 'La visionneuse est-elle en français, y compris sur tablette et téléphone ?',
        a: 'Oui. À l’adresse ifcvieweronline.eu/fr/, toute l’interface est en français. Sur tablette et téléphone, touchez « Ouvrir un fichier IFC » et choisissez le fichier avec le sélecteur du navigateur. Au-delà d’environ 200 Mo, préférez un ordinateur, qui a plus de mémoire.',
      },
    ],
  },
}

/** Site-root-relative path (no leading slash) a guide link leads to. */
export function guideHref(lang: HomeLang, to: GuideTarget): string {
  if (to === 'examples') return examplesPath(lang)
  if (to === 'validator') return validatorPath(lang)
  return pricingPath(lang).slice(1)
}

// ── The ten homes, by the name each language calls itself ────────────────────
// Rendered as plain links in the footer of every home. The language switcher
// in the header changes language in place, without a URL a crawler can follow;
// these are the only links from one home to the other nine.

export const HOME_LANGUAGE_NAMES: Record<HomeLang, string> = {
  en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português',
  it: 'Italiano', ca: 'Català', zh: '中文', ja: '日本語', th: 'ภาษาไทย',
}

/** Site-root-relative path (no leading slash) of a language's home. */
export function homePath(lang: HomeLang): string {
  return lang === 'en' ? '' : `${lang}/`
}

export { HOME_LANGS }
