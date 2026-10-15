// Build the digital-twin diagrams, once per blog language.
//
// Same idea and palette as build-blog-infographics.mjs — deterministic
// HTML/CSS compositions rendered by Chrome, no generative AI, no stock — with
// one difference: these are drawn in each of the blog's ten languages. A
// Spanish reader gets Spanish labels, and to image search each language page
// owns its own file instead of ten pages sharing one (blog-image-lang.ts).
//
// Every number in them comes from the running scenes (public/scenes/*.json,
// src/lib/layers/feed-presets.ts) or from the cited specification.
//
// Output: public/blog/images/<name>.png (English), <name>-<lang>.png, and an
// 800 px cut of each (<name>[-<lang>]-800.png).
//
// Usage:
//   node scripts/og/build-twin-figures.mjs                 # every figure, every language
//   node scripts/og/build-twin-figures.mjs anatomy es de   # some figures and/or languages

import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const W = 1600, H = 900
const LANGS = ['en', 'es', 'ca', 'de', 'fr', 'it', 'pt', 'ja', 'zh', 'th']
const log = (...a) => console.log('[twin-figures]', ...a)

const font = (file) => `data:font/woff2;base64,${readFileSync(path.join('public/fonts', file)).toString('base64')}`
const FONTS = `
@font-face{font-family:Geist;font-weight:400;src:url(${font('geist-400.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:500;src:url(${font('geist-500.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:600;src:url(${font('geist-600.woff2')}) format('woff2')}
@font-face{font-family:Geist;font-weight:700;src:url(${font('geist-700.woff2')}) format('woff2')}
@font-face{font-family:GeistMono;font-weight:400;src:url(${font('geist-mono-400.woff2')}) format('woff2')}
@font-face{font-family:GeistMono;font-weight:500;src:url(${font('geist-mono-500.woff2')}) format('woff2')}`

// Geist has no CJK or Thai glyphs; these are the system faces Chrome falls back to.
const SCRIPT_FONT = { ja: "'Yu Gothic UI','Meiryo UI','Yu Gothic'", zh: "'Microsoft YaHei UI','Microsoft YaHei'", th: "'Leelawadee UI','Tahoma'" }

const C = {
  bg: '#f7f8fb', card: '#ffffff', ink: '#0f172a', sub: '#475569', faint: '#94a3b8', line: '#dbe1ea',
  brand: '#5e6ad2', brandSoft: '#eceefc', green: '#0f9f6e', greenSoft: '#e3f6ee', red: '#dc3545', redSoft: '#fdeaec',
  amber: '#c27c0e', amberSoft: '#fdf3df', cyan: '#0e8fb0', cyanSoft: '#e1f4f9', violet: '#8b5cf6', violetSoft: '#f1ebfe',
  earth: '#efe6d4', earthLine: '#c8b28a',
}

function base(lang) {
  const family = `Geist,${SCRIPT_FONT[lang] ? SCRIPT_FONT[lang] + ',' : ''}system-ui,sans-serif`
  return `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px}
body{font-family:${family};background:${C.bg};color:${C.ink};position:relative;overflow:hidden;
  background-image:radial-gradient(${C.line} 1px,transparent 1px);background-size:28px 28px}
.frame{position:absolute;inset:0;padding:52px 72px 64px;display:flex;flex-direction:column}
.kicker{font-family:GeistMono,${SCRIPT_FONT[lang] ? SCRIPT_FONT[lang] + ',' : ''}monospace;font-size:17px;letter-spacing:.14em;text-transform:uppercase;color:${C.brand};font-weight:500}
h1{font-size:44px;font-weight:700;letter-spacing:-.02em;margin-top:10px;line-height:1.12}
.lede{font-size:20px;color:${C.sub};margin-top:10px;max-width:1300px;line-height:1.4}
.body{flex:1;position:relative;margin-top:26px}
.foot{position:absolute;left:72px;right:72px;bottom:22px;display:flex;justify-content:space-between;align-items:center;font-size:16px;color:${C.faint}}
.foot b{color:${C.brand};font-weight:600}
.mark{display:inline-flex;align-items:center;gap:10px}
.mark i{width:22px;height:22px;border-radius:6px;background:${C.brand};display:inline-block}
.card{background:${C.card};border:1.5px solid ${C.line};border-radius:16px;box-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.05)}
.mono{font-family:GeistMono,monospace}
svg text{font-family:inherit}
${SCRIPT_FONT[lang] ? '.kicker{letter-spacing:.04em}' : ''}
`
}

function page(lang, { kicker, title, lede, body, css = '', source }) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${base(lang)}${css}</style></head><body>
<div class="frame">
  <div class="kicker">${kicker}</div>
  <h1>${title}</h1>
  ${lede ? `<p class="lede">${lede}</p>` : ''}
  <div class="body">${body}</div>
</div>
<div class="foot"><span class="mark"><i></i><b>IFC Viewer Online</b>&nbsp;· ifcvieweronline.eu/blog</span><span>${source}</span></div>
</body></html>`
}

// ── Copy, per language ───────────────────────────────────────────────────────
// Terms follow each language's blog pack: bessó digital (ca), gêmeo digital
// (pt, Brazilian), デジタルツイン, 数字孪生, ดิจิทัลทวิน.

const T = {
  en: {
    anatomy: {
      kicker: 'Urban digital twin · anatomy', title: 'Five layers of a live city twin',
      lede: 'Plaça de Catalunya, Barcelona, as it runs in the browser. Each layer comes from a different open source and refreshes at its own pace.',
      layers: [
        ['Live state', 'Bicing docks, EV charger bays, traffic and air quality', 'Bicing every 60 s · chargers every 5 min · air every 15 min'],
        ['Bindings', 'Which feed, which device, which IFC elements, which colour', 'Bicing station 65 → its dock posts · charger 3762 → its two bays'],
        ['IFC models', 'Eight georeferenced IFC 4.3 files: fountains, dock posts, monument, metro entrance…', 'Each placed by its own IfcMapConversion'],
        ['City context', 'OpenStreetMap buildings and streets around the models', "Drawn in the models' projection, so they line up"],
        ['Ground', "Terrain from the ICGC's 5 m elevation model, with the map draped on it", 'The models stand on it instead of floating'],
      ],
      tag: "All five meet in the visitor's browser. No server in between.",
      source: 'Scene file: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Digital twin architecture', title: 'From open data to a lit-up model, with no server in between',
      lede: 'Three cities, three ways of delivering data. The browser reads each feed directly — when the publisher allows it.',
      heads: ['Publisher', 'Format · transport', 'In the browser', 'In the model'],
      rows: [
        ['Barcelona · Bicing', 'GBFS 3.0 · JSON over HTTPS', 'Asked every 60 s', 'Dock posts take the colour of the bikes left'],
        ['Helsinki · HSL', 'HFP · MQTT over WebSocket', 'Pushed: about one message per bus per second', 'A bay changes colour as its bus pulls in, waits and opens its doors'],
        ['Tokyo · Toei bus', 'GTFS-Realtime · protocol buffers', 'Asked every 30 s and decoded in the page', 'The stop pole lights up when a bus has passed in the last 10 min'],
      ],
      wall: ['Helsinki · GTFS-Realtime', 'No CORS header', 'The browser is not allowed to read it', 'Not used: MQTT carries the same buses'],
      note: 'CORS is the response header that lets a page from another site read a feed. Without it, only a server could fetch the data.',
      source: 'Scenes: Barcelona, Helsinki, Tokyo (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM vs digital twin', title: 'What each step adds to the same model',
      lede: 'Plaça de Catalunya three ways: as BIM files, placed in its city, and connected to live data.',
      cols: ['BIM model (IFC)', 'BIM in its city', 'Digital twin'],
      rows: ['Geometry and properties of every element', 'Real-world position (georeference)', 'Surroundings: terrain, streets, buildings', 'Current state from feeds or sensors', 'Rules and alerts on that state', 'History of past readings'],
      partial: 'if the file has one',
      tag: 'A twin is not a better model. It is a model plus a live link to what is happening now.',
      source: 'Example: the Barcelona scene',
    },
    lod: {
      kicker: 'LOD in BIM vs CityGML', title: 'Two LOD scales that share a name',
      lede: "CityGML's LOD says how much geometry a city object has. BIM's LOD says how far one element's design has been resolved.",
      rowA: 'CityGML 3.0 · Level of Detail',
      a: [['LOD0', 'Footprint or roof outline'], ['LOD1', 'Block: the footprint extruded'], ['LOD2', 'Roof shapes and wall surfaces'], ['LOD3', 'Openings and façade detail']],
      noteA: 'CityGML 2.0 had a LOD4 for interiors. Version 3.0 drops it: interiors can appear at any level.',
      rowB: 'BIM · Level of Development (BIMForum)',
      b: [['LOD 100', 'Symbol or mass'], ['LOD 200', 'Generic element, approximate size'], ['LOD 300', 'Specific element, exact size and position'], ['LOD 400', 'Fabrication and installation detail']],
      noteB: 'LOD 350 adds the interfaces with other elements; LOD 500 means verified on site, not more geometry.',
      tag: 'Under ISO 19650, ISO 7817-1 (level of information need) replaces one LOD number with geometry, information and documentation set per purpose.',
      source: 'Sources: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'MQTT topic anatomy', title: 'One subscription, every bus near the terminal',
      lede: "HSL's high-frequency positioning feed (HFP). Each level of the topic narrows the stream: + matches any one level, # everything below.",
      parts: ['feed and version', 'journeys in progress', 'vehicle positions', 'buses only', 'any operator, vehicle, route, direction, destination, start time, next stop and geohash level', 'the grid cell 60.17–60.18° N, 24.93–24.94° E', 'every finer cell inside it'],
      cell: 'About 1.1 km × 0.55 km around the terminal',
      tag: 'Each message is one bus, about once a second: line, speed, door state, next stop.',
      source: 'Source: Digitransit, High-frequency positioning',
    },
  },
  es: {
    anatomy: {
      kicker: 'Gemelo digital urbano · anatomía', title: 'Las cinco capas de un gemelo de ciudad en vivo',
      lede: 'La Plaça de Catalunya de Barcelona tal como funciona en el navegador. Cada capa sale de una fuente abierta distinta y se actualiza a su ritmo.',
      layers: [
        ['Estado en vivo', 'Anclajes de Bicing, plazas de recarga, tráfico y calidad del aire', 'Bicing cada 60 s · recarga cada 5 min · aire cada 15 min'],
        ['Vínculos', 'Qué feed, qué dispositivo, qué elementos IFC, qué color', 'Estación de Bicing 65 → sus anclajes · cargador 3762 → sus dos plazas'],
        ['Modelos IFC', 'Ocho archivos IFC 4.3 georreferenciados: fuentes, anclajes, monumento, boca de metro…', 'Cada uno colocado por su propio IfcMapConversion'],
        ['Contexto urbano', 'Edificios y calles de OpenStreetMap alrededor de los modelos', 'Dibujados en la proyección de los modelos, para que encajen'],
        ['Terreno', 'Relieve del modelo de elevaciones de 5 m del ICGC, con el mapa encima', 'Los modelos se apoyan en él en lugar de flotar'],
      ],
      tag: 'Las cinco se juntan en el navegador del visitante. Sin servidor de por medio.',
      source: 'Archivo de escena: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Arquitectura de un gemelo digital', title: 'De los datos abiertos al modelo iluminado, sin servidor de por medio',
      lede: 'Tres ciudades, tres formas de servir datos. El navegador lee cada feed directamente, cuando el publicador lo permite.',
      heads: ['Publicador', 'Formato · transporte', 'En el navegador', 'En el modelo'],
      rows: [
        ['Barcelona · Bicing', 'GBFS 3.0 · JSON por HTTPS', 'Se consulta cada 60 s', 'Los anclajes toman el color de las bicis que quedan'],
        ['Helsinki · HSL', 'HFP · MQTT sobre WebSocket', 'Llega solo: un mensaje por autobús cada segundo, aprox.', 'Cada dársena cambia de color cuando su autobús entra, espera y abre puertas'],
        ['Tokio · autobús Toei', 'GTFS-Realtime · protocol buffers', 'Se consulta cada 30 s y se decodifica en la página', 'El poste de la parada se ilumina si ha pasado un autobús en los últimos 10 min'],
      ],
      wall: ['Helsinki · GTFS-Realtime', 'Sin cabecera CORS', 'El navegador no puede leerlo', 'No se usa: MQTT lleva los mismos autobuses'],
      note: 'CORS es la cabecera de respuesta que permite a una página de otro sitio leer un feed. Sin ella, solo un servidor podría pedir los datos.',
      source: 'Escenas: Barcelona, Helsinki, Tokio (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM frente a gemelo digital', title: 'Qué añade cada paso al mismo modelo',
      lede: 'La Plaça de Catalunya de tres maneras: como archivos BIM, situada en su ciudad y conectada a datos en vivo.',
      cols: ['Modelo BIM (IFC)', 'BIM en su ciudad', 'Gemelo digital'],
      rows: ['Geometría y propiedades de cada elemento', 'Posición real (georreferencia)', 'Entorno: terreno, calles, edificios', 'Estado actual desde feeds o sensores', 'Reglas y alertas sobre ese estado', 'Historial de lecturas pasadas'],
      partial: 'si el archivo la trae',
      tag: 'Un gemelo no es un modelo mejor. Es un modelo más un vínculo en vivo con lo que está pasando ahora.',
      source: 'Ejemplo: la escena de Barcelona',
    },
    lod: {
      kicker: 'LOD en BIM frente a CityGML', title: 'Dos escalas LOD que comparten nombre',
      lede: 'El LOD de CityGML dice cuánta geometría tiene un objeto urbano. El LOD de BIM dice hasta dónde está resuelto el diseño de un elemento.',
      rowA: 'CityGML 3.0 · nivel de detalle',
      a: [['LOD0', 'Huella o contorno de cubierta'], ['LOD1', 'Bloque: la huella extruida'], ['LOD2', 'Formas de cubierta y superficies de fachada'], ['LOD3', 'Huecos y detalle de fachada']],
      noteA: 'CityGML 2.0 tenía un LOD4 para interiores. La versión 3.0 lo elimina: los interiores pueden aparecer en cualquier nivel.',
      rowB: 'BIM · nivel de desarrollo (BIMForum)',
      b: [['LOD 100', 'Símbolo o masa'], ['LOD 200', 'Elemento genérico, tamaño aproximado'], ['LOD 300', 'Elemento concreto, tamaño y posición exactos'], ['LOD 400', 'Detalle de fabricación y montaje']],
      noteB: 'El LOD 350 añade las interfaces con otros elementos; el LOD 500 significa verificado en obra, no más geometría.',
      tag: 'Con ISO 19650, la ISO 7817-1 (nivel de necesidad de información) sustituye un único número LOD por geometría, información y documentación fijadas para cada propósito.',
      source: 'Fuentes: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomía de un topic MQTT', title: 'Una suscripción, todos los autobuses junto a la terminal',
      lede: 'El feed de posicionamiento de alta frecuencia de HSL (HFP). Cada nivel del topic acota el flujo: + vale por un nivel cualquiera, # por todo lo que queda debajo.',
      parts: ['feed y versión', 'viajes en curso', 'posiciones de vehículos', 'solo autobuses', 'cualquier operador, vehículo, línea, sentido, destino, hora de salida, próxima parada y nivel de geohash', 'la celda 60,17–60,18° N, 24,93–24,94° E', 'todas las celdas más finas dentro de ella'],
      cell: 'Unos 1,1 km × 0,55 km alrededor de la terminal',
      tag: 'Cada mensaje es un autobús, más o menos una vez por segundo: línea, velocidad, estado de las puertas, próxima parada.',
      source: 'Fuente: Digitransit, High-frequency positioning',
    },
  },
  ca: {
    anatomy: {
      kicker: 'Bessó digital urbà · anatomia', title: 'Les cinc capes d’un bessó de ciutat en viu',
      lede: 'La plaça de Catalunya de Barcelona tal com funciona al navegador. Cada capa ve d’una font oberta diferent i s’actualitza al seu ritme.',
      layers: [
        ['Estat en viu', 'Ancoratges del Bicing, places de recàrrega, trànsit i qualitat de l’aire', 'Bicing cada 60 s · recàrrega cada 5 min · aire cada 15 min'],
        ['Vincles', 'Quin feed, quin dispositiu, quins elements IFC, quin color', 'Estació de Bicing 65 → els seus ancoratges · carregador 3762 → les seves dues places'],
        ['Models IFC', 'Vuit fitxers IFC 4.3 georeferenciats: fonts, ancoratges, monument, boca de metro…', 'Cadascun col·locat pel seu propi IfcMapConversion'],
        ['Context urbà', 'Edificis i carrers d’OpenStreetMap al voltant dels models', 'Dibuixats en la projecció dels models, perquè encaixin'],
        ['Terreny', 'Relleu del model d’elevacions de 5 m de l’ICGC, amb el mapa a sobre', 'Els models s’hi recolzen en lloc de surar'],
      ],
      tag: 'Les cinc es troben al navegador del visitant. Sense cap servidor entremig.',
      source: 'Fitxer d’escena: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Arquitectura d’un bessó digital', title: 'De les dades obertes al model il·luminat, sense cap servidor entremig',
      lede: 'Tres ciutats, tres maneres de servir dades. El navegador llegeix cada feed directament, quan el publicador ho permet.',
      heads: ['Publicador', 'Format · transport', 'Al navegador', 'Al model'],
      rows: [
        ['Barcelona · Bicing', 'GBFS 3.0 · JSON per HTTPS', 'Es consulta cada 60 s', 'Els ancoratges prenen el color de les bicis que queden'],
        ['Hèlsinki · HSL', 'HFP · MQTT sobre WebSocket', 'Arriba sol: un missatge per autobús cada segon, aprox.', 'Cada andana canvia de color quan el seu autobús entra, espera i obre portes'],
        ['Tòquio · autobús Toei', 'GTFS-Realtime · protocol buffers', 'Es consulta cada 30 s i es descodifica a la pàgina', 'El pal de la parada s’il·lumina si hi ha passat un autobús en els darrers 10 min'],
      ],
      wall: ['Hèlsinki · GTFS-Realtime', 'Sense capçalera CORS', 'El navegador no el pot llegir', 'No s’usa: MQTT porta els mateixos autobusos'],
      note: 'CORS és la capçalera de resposta que permet a una pàgina d’un altre lloc llegir un feed. Sense ella, només un servidor podria demanar les dades.',
      source: 'Escenes: Barcelona, Hèlsinki, Tòquio (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM i bessó digital', title: 'Què afegeix cada pas al mateix model',
      lede: 'La plaça de Catalunya de tres maneres: com a fitxers BIM, situada a la seva ciutat i connectada a dades en viu.',
      cols: ['Model BIM (IFC)', 'BIM a la seva ciutat', 'Bessó digital'],
      rows: ['Geometria i propietats de cada element', 'Posició real (georeferència)', 'Entorn: terreny, carrers, edificis', 'Estat actual des de feeds o sensors', 'Regles i alertes sobre aquest estat', 'Historial de lectures passades'],
      partial: 'si el fitxer la porta',
      tag: 'Un bessó no és un model millor. És un model més un vincle en viu amb el que passa ara.',
      source: 'Exemple: l’escena de Barcelona',
    },
    lod: {
      kicker: 'LOD en BIM i en CityGML', title: 'Dues escales LOD que comparteixen nom',
      lede: 'El LOD de CityGML diu quanta geometria té un objecte urbà. El LOD de BIM diu fins on està resolt el disseny d’un element.',
      rowA: 'CityGML 3.0 · nivell de detall',
      a: [['LOD0', 'Petjada o contorn de coberta'], ['LOD1', 'Bloc: la petjada extruïda'], ['LOD2', 'Formes de coberta i superfícies de façana'], ['LOD3', 'Obertures i detall de façana']],
      noteA: 'CityGML 2.0 tenia un LOD4 per als interiors. La versió 3.0 l’elimina: els interiors poden aparèixer a qualsevol nivell.',
      rowB: 'BIM · nivell de desenvolupament (BIMForum)',
      b: [['LOD 100', 'Símbol o massa'], ['LOD 200', 'Element genèric, mida aproximada'], ['LOD 300', 'Element concret, mida i posició exactes'], ['LOD 400', 'Detall de fabricació i muntatge']],
      noteB: 'El LOD 350 afegeix les interfícies amb altres elements; el LOD 500 vol dir verificat a l’obra, no més geometria.',
      tag: 'Amb la ISO 19650, la ISO 7817-1 (nivell de necessitat d’informació) substitueix un únic número LOD per geometria, informació i documentació fixades per a cada propòsit.',
      source: 'Fonts: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomia d’un topic MQTT', title: 'Una subscripció, tots els autobusos al costat de la terminal',
      lede: 'El feed de posicionament d’alta freqüència d’HSL (HFP). Cada nivell del topic acota el flux: + val per qualsevol nivell, # per tot el que queda a sota.',
      parts: ['feed i versió', 'viatges en curs', 'posicions de vehicles', 'només autobusos', 'qualsevol operador, vehicle, línia, sentit, destinació, hora de sortida, propera parada i nivell de geohash', 'la cel·la 60,17–60,18° N, 24,93–24,94° E', 'totes les cel·les més fines que conté'],
      cell: 'Uns 1,1 km × 0,55 km al voltant de la terminal',
      tag: 'Cada missatge és un autobús, més o menys un cop per segon: línia, velocitat, estat de les portes, propera parada.',
      source: 'Font: Digitransit, High-frequency positioning',
    },
  },
  de: {
    anatomy: {
      kicker: 'Urbaner digitaler Zwilling · Anatomie', title: 'Die fünf Ebenen eines Live-Stadtzwillings',
      lede: 'Die Plaça de Catalunya in Barcelona, so wie sie im Browser läuft. Jede Ebene stammt aus einer anderen offenen Quelle und aktualisiert sich in ihrem eigenen Takt.',
      layers: [
        ['Live-Zustand', 'Bicing-Stationen, Ladeplätze, Verkehr und Luftqualität', 'Bicing alle 60 s · Laden alle 5 min · Luft alle 15 min'],
        ['Verknüpfungen', 'Welcher Feed, welches Gerät, welche IFC-Elemente, welche Farbe', 'Bicing-Station 65 → ihre Ständer · Ladesäule 3762 → ihre zwei Plätze'],
        ['IFC-Modelle', 'Acht georeferenzierte IFC-4.3-Dateien: Brunnen, Ständer, Denkmal, Metro-Eingang…', 'Jede über ihre eigene IfcMapConversion platziert'],
        ['Stadtkontext', 'OpenStreetMap-Gebäude und -Straßen rund um die Modelle', 'In der Projektion der Modelle gezeichnet, damit alles passt'],
        ['Gelände', 'Relief aus dem 5-m-Höhenmodell des ICGC, die Karte darübergelegt', 'Die Modelle stehen darauf, statt zu schweben'],
      ],
      tag: 'Alle fünf treffen sich im Browser der Besucher. Kein Server dazwischen.',
      source: 'Szenendatei: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Architektur eines digitalen Zwillings', title: 'Von Open Data zum leuchtenden Modell, ohne Server dazwischen',
      lede: 'Drei Städte, drei Arten, Daten auszuliefern. Der Browser liest jeden Feed direkt – wenn der Anbieter es erlaubt.',
      heads: ['Anbieter', 'Format · Transport', 'Im Browser', 'Im Modell'],
      rows: [
        ['Barcelona · Bicing', 'GBFS 3.0 · JSON über HTTPS', 'Alle 60 s abgefragt', 'Die Ständer zeigen farbig, wie viele Räder noch da sind'],
        ['Helsinki · HSL', 'HFP · MQTT über WebSocket', 'Gepusht: etwa eine Nachricht pro Bus und Sekunde', 'Ein Bussteig wechselt die Farbe, wenn sein Bus einfährt, wartet und die Türen öffnet'],
        ['Tokio · Toei-Bus', 'GTFS-Realtime · Protocol Buffers', 'Alle 30 s abgefragt und in der Seite dekodiert', 'Der Haltestellenmast leuchtet, wenn in den letzten 10 min ein Bus vorbeikam'],
      ],
      wall: ['Helsinki · GTFS-Realtime', 'Kein CORS-Header', 'Der Browser darf ihn nicht lesen', 'Nicht genutzt: MQTT liefert dieselben Busse'],
      note: 'CORS ist der Antwort-Header, mit dem eine Seite einer anderen Website einen Feed lesen darf. Ohne ihn könnte nur ein Server die Daten abrufen.',
      source: 'Szenen: Barcelona, Helsinki, Tokio (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM vs. digitaler Zwilling', title: 'Was jeder Schritt demselben Modell hinzufügt',
      lede: 'Die Plaça de Catalunya auf drei Arten: als BIM-Dateien, in ihrer Stadt verortet und mit Live-Daten verbunden.',
      cols: ['BIM-Modell (IFC)', 'BIM in seiner Stadt', 'Digitaler Zwilling'],
      rows: ['Geometrie und Eigenschaften jedes Elements', 'Reale Lage (Georeferenz)', 'Umgebung: Gelände, Straßen, Gebäude', 'Aktueller Zustand aus Feeds oder Sensoren', 'Regeln und Alarme zu diesem Zustand', 'Verlauf früherer Messwerte'],
      partial: 'wenn die Datei eine hat',
      tag: 'Ein Zwilling ist kein besseres Modell. Er ist ein Modell plus eine Live-Verbindung zu dem, was gerade passiert.',
      source: 'Beispiel: die Barcelona-Szene',
    },
    lod: {
      kicker: 'LOD in BIM vs. CityGML', title: 'Zwei LOD-Skalen mit demselben Namen',
      lede: 'Der LOD von CityGML sagt, wie viel Geometrie ein Stadtobjekt hat. Der LOD im BIM sagt, wie weit der Entwurf eines Elements ausgearbeitet ist.',
      rowA: 'CityGML 3.0 · Level of Detail',
      a: [['LOD0', 'Grundriss oder Dachumriss'], ['LOD1', 'Klötzchen: der Grundriss extrudiert'], ['LOD2', 'Dachformen und Wandflächen'], ['LOD3', 'Öffnungen und Fassadendetails']],
      noteA: 'CityGML 2.0 hatte einen LOD4 für Innenräume. Version 3.0 streicht ihn: Innenräume können in jeder Stufe vorkommen.',
      rowB: 'BIM · Level of Development (BIMForum)',
      b: [['LOD 100', 'Symbol oder Masse'], ['LOD 200', 'Generisches Element, ungefähre Größe'], ['LOD 300', 'Konkretes Element, genaue Größe und Lage'], ['LOD 400', 'Fertigungs- und Montagedetails']],
      noteB: 'LOD 350 ergänzt die Schnittstellen zu anderen Elementen; LOD 500 heißt vor Ort geprüft, nicht mehr Geometrie.',
      tag: 'Unter ISO 19650 ersetzt ISO 7817-1 (Informationsbedarfstiefe) eine einzige LOD-Zahl durch Geometrie, Informationen und Dokumentation je Zweck.',
      source: 'Quellen: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomie eines MQTT-Topics', title: 'Ein Abonnement, jeder Bus am Terminal',
      lede: 'Der hochfrequente Positionsfeed von HSL (HFP). Jede Ebene des Topics grenzt den Strom ein: + steht für eine beliebige Ebene, # für alles darunter.',
      parts: ['Feed und Version', 'laufende Fahrten', 'Fahrzeugpositionen', 'nur Busse', 'beliebiger Betreiber, Fahrzeug, Linie, Richtung, Ziel, Abfahrtszeit, nächster Halt und Geohash-Ebene', 'die Rasterzelle 60,17–60,18° N, 24,93–24,94° O', 'alle feineren Zellen darin'],
      cell: 'Etwa 1,1 km × 0,55 km rund um das Terminal',
      tag: 'Jede Nachricht ist ein Bus, etwa einmal pro Sekunde: Linie, Tempo, Türstatus, nächster Halt.',
      source: 'Quelle: Digitransit, High-frequency positioning',
    },
  },
  fr: {
    anatomy: {
      kicker: 'Jumeau numérique urbain · anatomie', title: 'Les cinq couches d’un jumeau de ville en direct',
      lede: 'La Plaça de Catalunya, à Barcelone, telle qu’elle tourne dans le navigateur. Chaque couche vient d’une source ouverte différente et se met à jour à son rythme.',
      layers: [
        ['État en direct', 'Bornes Bicing, places de recharge, trafic et qualité de l’air', 'Bicing toutes les 60 s · recharge toutes les 5 min · air toutes les 15 min'],
        ['Liaisons', 'Quel flux, quel appareil, quels éléments IFC, quelle couleur', 'Station Bicing 65 → ses bornes · borne 3762 → ses deux places'],
        ['Modèles IFC', 'Huit fichiers IFC 4.3 géoréférencés : fontaines, bornes, monument, bouche de métro…', 'Chacun placé par son propre IfcMapConversion'],
        ['Contexte urbain', 'Bâtiments et rues OpenStreetMap autour des modèles', 'Dessinés dans la projection des modèles, pour qu’ils coïncident'],
        ['Terrain', 'Relief du modèle d’élévation à 5 m de l’ICGC, avec la carte drapée dessus', 'Les modèles s’y posent au lieu de flotter'],
      ],
      tag: 'Les cinq se rejoignent dans le navigateur du visiteur. Aucun serveur entre les deux.',
      source: 'Fichier de scène : barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Architecture d’un jumeau numérique', title: 'Des données ouvertes au modèle qui s’allume, sans serveur entre les deux',
      lede: 'Trois villes, trois façons de diffuser les données. Le navigateur lit chaque flux directement — quand l’éditeur le permet.',
      heads: ['Éditeur', 'Format · transport', 'Dans le navigateur', 'Dans le modèle'],
      rows: [
        ['Barcelone · Bicing', 'GBFS 3.0 · JSON en HTTPS', 'Interrogé toutes les 60 s', 'Les bornes prennent la couleur des vélos restants'],
        ['Helsinki · HSL', 'HFP · MQTT sur WebSocket', 'Poussé : environ un message par bus et par seconde', 'Un quai change de couleur quand son bus arrive, attend et ouvre ses portes'],
        ['Tokyo · bus Toei', 'GTFS-Realtime · protocol buffers', 'Interrogé toutes les 30 s et décodé dans la page', 'Le poteau d’arrêt s’allume si un bus est passé dans les 10 dernières minutes'],
      ],
      wall: ['Helsinki · GTFS-Realtime', 'Pas d’en-tête CORS', 'Le navigateur n’a pas le droit de le lire', 'Non utilisé : MQTT transporte les mêmes bus'],
      note: 'CORS est l’en-tête de réponse qui autorise une page d’un autre site à lire un flux. Sans lui, seul un serveur pourrait récupérer les données.',
      source: 'Scènes : Barcelone, Helsinki, Tokyo (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM ou jumeau numérique', title: 'Ce que chaque étape ajoute au même modèle',
      lede: 'La Plaça de Catalunya de trois façons : en fichiers BIM, placée dans sa ville, puis reliée aux données en direct.',
      cols: ['Maquette BIM (IFC)', 'BIM dans sa ville', 'Jumeau numérique'],
      rows: ['Géométrie et propriétés de chaque élément', 'Position réelle (géoréférencement)', 'Environnement : terrain, rues, bâtiments', 'État actuel via flux ou capteurs', 'Règles et alertes sur cet état', 'Historique des mesures passées'],
      partial: 'si le fichier en a un',
      tag: 'Un jumeau n’est pas une meilleure maquette. C’est une maquette plus un lien en direct avec ce qui se passe maintenant.',
      source: 'Exemple : la scène de Barcelone',
    },
    lod: {
      kicker: 'LOD en BIM et en CityGML', title: 'Deux échelles LOD qui portent le même nom',
      lede: 'Le LOD de CityGML dit combien de géométrie possède un objet urbain. Le LOD du BIM dit jusqu’où la conception d’un élément est résolue.',
      rowA: 'CityGML 3.0 · niveau de détail',
      a: [['LOD0', 'Emprise ou contour de toiture'], ['LOD1', 'Bloc : l’emprise extrudée'], ['LOD2', 'Formes de toit et surfaces de murs'], ['LOD3', 'Ouvertures et détail de façade']],
      noteA: 'CityGML 2.0 avait un LOD4 pour les intérieurs. La version 3.0 le supprime : les intérieurs peuvent figurer à tout niveau.',
      rowB: 'BIM · niveau de développement (BIMForum)',
      b: [['LOD 100', 'Symbole ou volume'], ['LOD 200', 'Élément générique, taille approximative'], ['LOD 300', 'Élément précis, taille et position exactes'], ['LOD 400', 'Détail de fabrication et de pose']],
      noteB: 'Le LOD 350 ajoute les interfaces avec les autres éléments ; le LOD 500 signifie vérifié sur site, pas plus de géométrie.',
      tag: 'Avec l’ISO 19650, l’ISO 7817-1 (niveau de besoin d’information) remplace un numéro LOD unique par une géométrie, des informations et une documentation fixées pour chaque usage.',
      source: 'Sources : OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomie d’un topic MQTT', title: 'Un abonnement, tous les bus près du terminal',
      lede: 'Le flux de positionnement haute fréquence de HSL (HFP). Chaque niveau du topic resserre le flux : + vaut n’importe quel niveau, # tout ce qui suit.',
      parts: ['flux et version', 'trajets en cours', 'positions des véhicules', 'bus uniquement', 'n’importe quel opérateur, véhicule, ligne, sens, destination, heure de départ, prochain arrêt et niveau de geohash', 'la maille 60,17–60,18° N, 24,93–24,94° E', 'toutes les mailles plus fines qu’elle contient'],
      cell: 'Environ 1,1 km × 0,55 km autour du terminal',
      tag: 'Chaque message est un bus, environ une fois par seconde : ligne, vitesse, état des portes, prochain arrêt.',
      source: 'Source : Digitransit, High-frequency positioning',
    },
  },
  it: {
    anatomy: {
      kicker: 'Gemello digitale urbano · anatomia', title: 'I cinque livelli di un gemello di città in tempo reale',
      lede: 'Plaça de Catalunya, a Barcellona, così come gira nel browser. Ogni livello arriva da una fonte aperta diversa e si aggiorna con il suo ritmo.',
      layers: [
        ['Stato in tempo reale', 'Stalli Bicing, posti di ricarica, traffico e qualità dell’aria', 'Bicing ogni 60 s · ricarica ogni 5 min · aria ogni 15 min'],
        ['Collegamenti', 'Quale feed, quale dispositivo, quali elementi IFC, quale colore', 'Stazione Bicing 65 → i suoi stalli · colonnina 3762 → i suoi due posti'],
        ['Modelli IFC', 'Otto file IFC 4.3 georeferenziati: fontane, stalli, monumento, ingresso della metro…', 'Ognuno posizionato dal proprio IfcMapConversion'],
        ['Contesto urbano', 'Edifici e strade di OpenStreetMap intorno ai modelli', 'Disegnati nella proiezione dei modelli, così combaciano'],
        ['Terreno', 'Rilievo dal modello di elevazione a 5 m dell’ICGC, con la mappa sopra', 'I modelli ci poggiano invece di galleggiare'],
      ],
      tag: 'Tutti e cinque si incontrano nel browser del visitatore. Nessun server in mezzo.',
      source: 'File di scena: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Architettura di un gemello digitale', title: 'Dai dati aperti al modello che si illumina, senza server in mezzo',
      lede: 'Tre città, tre modi di distribuire i dati. Il browser legge ogni feed direttamente, quando l’editore lo consente.',
      heads: ['Editore', 'Formato · trasporto', 'Nel browser', 'Nel modello'],
      rows: [
        ['Barcellona · Bicing', 'GBFS 3.0 · JSON su HTTPS', 'Interrogato ogni 60 s', 'Gli stalli prendono il colore delle bici rimaste'],
        ['Helsinki · HSL', 'HFP · MQTT su WebSocket', 'Inviato in push: circa un messaggio per autobus al secondo', 'Una banchina cambia colore quando il suo autobus entra, sosta e apre le porte'],
        ['Tokyo · autobus Toei', 'GTFS-Realtime · protocol buffers', 'Interrogato ogni 30 s e decodificato nella pagina', 'Il palo della fermata si accende se è passato un autobus negli ultimi 10 min'],
      ],
      wall: ['Helsinki · GTFS-Realtime', 'Nessuna intestazione CORS', 'Il browser non può leggerlo', 'Non usato: MQTT porta gli stessi autobus'],
      note: 'CORS è l’intestazione di risposta che permette a una pagina di un altro sito di leggere un feed. Senza, solo un server potrebbe scaricare i dati.',
      source: 'Scene: Barcellona, Helsinki, Tokyo (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM e gemello digitale', title: 'Cosa aggiunge ogni passo allo stesso modello',
      lede: 'Plaça de Catalunya in tre modi: come file BIM, collocata nella sua città e collegata a dati in tempo reale.',
      cols: ['Modello BIM (IFC)', 'BIM nella sua città', 'Gemello digitale'],
      rows: ['Geometria e proprietà di ogni elemento', 'Posizione reale (georeferenziazione)', 'Contesto: terreno, strade, edifici', 'Stato attuale da feed o sensori', 'Regole e allarmi su quello stato', 'Storico delle letture passate'],
      partial: 'se il file ce l’ha',
      tag: 'Un gemello non è un modello migliore. È un modello più un collegamento in tempo reale con ciò che succede adesso.',
      source: 'Esempio: la scena di Barcellona',
    },
    lod: {
      kicker: 'LOD nel BIM e in CityGML', title: 'Due scale LOD con lo stesso nome',
      lede: 'Il LOD di CityGML dice quanta geometria ha un oggetto urbano. Il LOD del BIM dice fin dove è risolto il progetto di un elemento.',
      rowA: 'CityGML 3.0 · livello di dettaglio',
      a: [['LOD0', 'Impronta o contorno della copertura'], ['LOD1', 'Blocco: l’impronta estrusa'], ['LOD2', 'Forme del tetto e superfici delle pareti'], ['LOD3', 'Aperture e dettaglio di facciata']],
      noteA: 'CityGML 2.0 aveva un LOD4 per gli interni. La versione 3.0 lo elimina: gli interni possono comparire a qualsiasi livello.',
      rowB: 'BIM · livello di sviluppo (BIMForum)',
      b: [['LOD 100', 'Simbolo o massa'], ['LOD 200', 'Elemento generico, dimensioni approssimate'], ['LOD 300', 'Elemento specifico, dimensioni e posizione esatte'], ['LOD 400', 'Dettaglio di fabbricazione e montaggio']],
      noteB: 'Il LOD 350 aggiunge le interfacce con altri elementi; il LOD 500 significa verificato in cantiere, non più geometria.',
      tag: 'Con la ISO 19650, la ISO 7817-1 (livello di fabbisogno informativo) sostituisce un unico numero LOD con geometria, informazioni e documentazione fissate per ogni scopo.',
      source: 'Fonti: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomia di un topic MQTT', title: 'Un solo abbonamento, tutti gli autobus vicino al terminal',
      lede: 'Il feed di posizionamento ad alta frequenza di HSL (HFP). Ogni livello del topic restringe il flusso: + vale per un livello qualsiasi, # per tutto ciò che sta sotto.',
      parts: ['feed e versione', 'corse in svolgimento', 'posizioni dei veicoli', 'solo autobus', 'qualsiasi operatore, veicolo, linea, direzione, destinazione, orario di partenza, prossima fermata e livello di geohash', 'la cella 60,17–60,18° N, 24,93–24,94° E', 'tutte le celle più fini al suo interno'],
      cell: 'Circa 1,1 km × 0,55 km intorno al terminal',
      tag: 'Ogni messaggio è un autobus, circa una volta al secondo: linea, velocità, stato delle porte, prossima fermata.',
      source: 'Fonte: Digitransit, High-frequency positioning',
    },
  },
  pt: {
    anatomy: {
      kicker: 'Gêmeo digital urbano · anatomia', title: 'As cinco camadas de um gêmeo de cidade ao vivo',
      lede: 'A Plaça de Catalunya, em Barcelona, do jeito que roda no navegador. Cada camada vem de uma fonte aberta diferente e se atualiza no seu ritmo.',
      layers: [
        ['Estado ao vivo', 'Docas do Bicing, vagas de recarga, trânsito e qualidade do ar', 'Bicing a cada 60 s · recarga a cada 5 min · ar a cada 15 min'],
        ['Vínculos', 'Qual feed, qual dispositivo, quais elementos IFC, qual cor', 'Estação Bicing 65 → suas docas · carregador 3762 → suas duas vagas'],
        ['Modelos IFC', 'Oito arquivos IFC 4.3 georreferenciados: fontes, docas, monumento, entrada do metrô…', 'Cada um posicionado pelo seu próprio IfcMapConversion'],
        ['Contexto urbano', 'Edifícios e ruas do OpenStreetMap ao redor dos modelos', 'Desenhados na projeção dos modelos, para que encaixem'],
        ['Terreno', 'Relevo do modelo de elevação de 5 m do ICGC, com o mapa por cima', 'Os modelos se apoiam nele em vez de flutuar'],
      ],
      tag: 'As cinco se encontram no navegador do visitante. Nenhum servidor no meio.',
      source: 'Arquivo de cena: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'Arquitetura de um gêmeo digital', title: 'Dos dados abertos ao modelo aceso, sem servidor no meio',
      lede: 'Três cidades, três jeitos de entregar dados. O navegador lê cada feed diretamente — quando o publicador permite.',
      heads: ['Publicador', 'Formato · transporte', 'No navegador', 'No modelo'],
      rows: [
        ['Barcelona · Bicing', 'GBFS 3.0 · JSON via HTTPS', 'Consultado a cada 60 s', 'As docas ganham a cor das bicicletas que restam'],
        ['Helsinque · HSL', 'HFP · MQTT sobre WebSocket', 'Enviado por push: cerca de uma mensagem por ônibus por segundo', 'Uma plataforma muda de cor quando seu ônibus chega, espera e abre as portas'],
        ['Tóquio · ônibus Toei', 'GTFS-Realtime · protocol buffers', 'Consultado a cada 30 s e decodificado na página', 'O poste da parada acende se um ônibus passou nos últimos 10 min'],
      ],
      wall: ['Helsinque · GTFS-Realtime', 'Sem cabeçalho CORS', 'O navegador não pode lê-lo', 'Não usado: o MQTT traz os mesmos ônibus'],
      note: 'CORS é o cabeçalho de resposta que permite a uma página de outro site ler um feed. Sem ele, só um servidor poderia buscar os dados.',
      source: 'Cenas: Barcelona, Helsinque, Tóquio (Tochōmae)',
    },
    bimdt: {
      kicker: 'BIM vs. gêmeo digital', title: 'O que cada passo acrescenta ao mesmo modelo',
      lede: 'A Plaça de Catalunya de três jeitos: como arquivos BIM, posicionada na sua cidade e conectada a dados ao vivo.',
      cols: ['Modelo BIM (IFC)', 'BIM na sua cidade', 'Gêmeo digital'],
      rows: ['Geometria e propriedades de cada elemento', 'Posição real (georreferência)', 'Entorno: terreno, ruas, edifícios', 'Estado atual a partir de feeds ou sensores', 'Regras e alertas sobre esse estado', 'Histórico de leituras passadas'],
      partial: 'se o arquivo tiver',
      tag: 'Um gêmeo não é um modelo melhor. É um modelo mais um vínculo ao vivo com o que está acontecendo agora.',
      source: 'Exemplo: a cena de Barcelona',
    },
    lod: {
      kicker: 'LOD no BIM e no CityGML', title: 'Duas escalas LOD com o mesmo nome',
      lede: 'O LOD do CityGML diz quanta geometria um objeto urbano tem. O LOD do BIM diz até onde o projeto de um elemento está resolvido.',
      rowA: 'CityGML 3.0 · nível de detalhe',
      a: [['LOD0', 'Projeção ou contorno da cobertura'], ['LOD1', 'Bloco: a projeção extrudada'], ['LOD2', 'Formas de telhado e superfícies das paredes'], ['LOD3', 'Aberturas e detalhe de fachada']],
      noteA: 'O CityGML 2.0 tinha um LOD4 para interiores. A versão 3.0 o elimina: interiores podem aparecer em qualquer nível.',
      rowB: 'BIM · nível de desenvolvimento (BIMForum)',
      b: [['LOD 100', 'Símbolo ou massa'], ['LOD 200', 'Elemento genérico, tamanho aproximado'], ['LOD 300', 'Elemento específico, tamanho e posição exatos'], ['LOD 400', 'Detalhe de fabricação e montagem']],
      noteB: 'O LOD 350 acrescenta as interfaces com outros elementos; o LOD 500 significa verificado em obra, não mais geometria.',
      tag: 'Com a ISO 19650, a ISO 7817-1 (nível de necessidade de informação) troca um único número LOD por geometria, informação e documentação definidas para cada finalidade.',
      source: 'Fontes: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'Anatomia de um tópico MQTT', title: 'Uma assinatura, todos os ônibus perto do terminal',
      lede: 'O feed de posicionamento de alta frequência da HSL (HFP). Cada nível do tópico estreita o fluxo: + vale por um nível qualquer, # por tudo o que vem abaixo.',
      parts: ['feed e versão', 'viagens em andamento', 'posições dos veículos', 'só ônibus', 'qualquer operador, veículo, linha, sentido, destino, horário de partida, próxima parada e nível de geohash', 'a célula 60,17–60,18° N, 24,93–24,94° L', 'todas as células menores dentro dela'],
      cell: 'Cerca de 1,1 km × 0,55 km ao redor do terminal',
      tag: 'Cada mensagem é um ônibus, mais ou menos uma vez por segundo: linha, velocidade, estado das portas, próxima parada.',
      source: 'Fonte: Digitransit, High-frequency positioning',
    },
  },
  ja: {
    anatomy: {
      kicker: '都市デジタルツイン · 構造', title: 'ライブ都市ツインを構成する5つのレイヤー',
      lede: 'バルセロナのカタルーニャ広場を、ブラウザーで動くそのままの姿で。各レイヤーは別々のオープンデータから届き、それぞれの間隔で更新されます。',
      layers: [
        ['ライブの状態', 'Bicing の駐輪ドック、EV 充電区画、交通量、大気質', 'Bicing は 60 秒ごと · 充電は 5 分ごと · 大気は 15 分ごと'],
        ['バインディング', 'どのフィードの、どの機器を、どの IFC 要素に、どの色で', 'Bicing ステーション 65 → ドック · 充電器 3762 → 2 つの区画'],
        ['IFC モデル', 'ジオリファレンス済みの IFC 4.3 ファイル 8 本：噴水、ドック、記念碑、地下鉄の入口…', 'それぞれ自身の IfcMapConversion で配置'],
        ['都市の文脈', 'モデルを囲む OpenStreetMap の建物と街路', 'モデルと同じ投影で描くので位置が揃う'],
        ['地形', 'ICGC の 5 m 標高モデルによる起伏と、その上に重ねた地図', 'モデルは宙に浮かず、地面に立つ'],
      ],
      tag: '5つすべてが訪問者のブラウザーで合わさります。間にサーバーはありません。',
      source: 'シーンファイル：barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'デジタルツインのアーキテクチャ', title: 'オープンデータから光るモデルまで、サーバーを挟まずに',
      lede: '3つの都市、3つのデータの届け方。提供者が許可していれば、ブラウザーが各フィードを直接読み取ります。',
      heads: ['提供者', '形式 · 伝送', 'ブラウザー側', 'モデル側'],
      rows: [
        ['バルセロナ · Bicing', 'GBFS 3.0 · HTTPS の JSON', '60 秒ごとに取得', '残りの自転車の数でドックの色が変わる'],
        ['ヘルシンキ · HSL', 'HFP · WebSocket 上の MQTT', 'プッシュ配信：バス1台につき毎秒約1件', 'バスの入線・停車・ドア開放に合わせて乗り場の色が変わる'],
        ['東京 · 都営バス', 'GTFS-Realtime · Protocol Buffers', '30 秒ごとに取得し、ページ内でデコード', '直近 10 分以内にバスが通過すると停留所の標識柱が光る'],
      ],
      wall: ['ヘルシンキ · GTFS-Realtime', 'CORS ヘッダーなし', 'ブラウザーからは読めない', '不使用：同じバスは MQTT で届く'],
      note: 'CORS は、別のサイトのページにフィードの読み取りを許可するレスポンスヘッダーです。これがなければ、データを取得できるのはサーバーだけです。',
      source: 'シーン：バルセロナ、ヘルシンキ、東京（都庁前）',
    },
    bimdt: {
      kicker: 'BIM とデジタルツイン', title: '同じモデルに各ステップが加えるもの',
      lede: 'カタルーニャ広場を3通りに：BIM ファイルとして、都市の中に配置して、そしてライブデータにつないで。',
      cols: ['BIM モデル（IFC）', '都市に置いた BIM', 'デジタルツイン'],
      rows: ['各要素の形状とプロパティ', '実世界での位置（ジオリファレンス）', '周辺：地形、街路、建物', 'フィードやセンサーによる現在の状態', 'その状態に対するルールとアラート', '過去の計測値の履歴'],
      partial: 'ファイルにあれば',
      tag: 'ツインは「より良いモデル」ではありません。モデルに、いま起きていることへのライブな接続を加えたものです。',
      source: '例：バルセロナのシーン',
    },
    lod: {
      kicker: 'BIM と CityGML の LOD', title: '同じ名前を持つ2つの LOD',
      lede: 'CityGML の LOD は都市オブジェクトがどれだけの形状を持つかを示します。BIM の LOD は、1つの要素の設計がどこまで詰められたかを示します。',
      rowA: 'CityGML 3.0 · 詳細度（Level of Detail）',
      a: [['LOD0', 'フットプリントまたは屋根の輪郭'], ['LOD1', 'ブロック：フットプリントを押し出したもの'], ['LOD2', '屋根の形状と壁面'], ['LOD3', '開口部とファサードの詳細']],
      noteA: 'CityGML 2.0 には室内用の LOD4 がありました。3.0 では廃止され、室内はどのレベルにも含められます。',
      rowB: 'BIM · 詳細度（Level of Development、BIMForum）',
      b: [['LOD 100', '記号またはボリューム'], ['LOD 200', '汎用要素、おおよその寸法'], ['LOD 300', '特定の要素、正確な寸法と位置'], ['LOD 400', '製作・施工の詳細']],
      noteB: 'LOD 350 は他要素との取り合いを加え、LOD 500 は現場で検証済みを意味します。形状が増えるわけではありません。',
      tag: 'ISO 19650 のもとでは、ISO 7817-1（情報要求レベル）が単一の LOD 番号に代わり、目的ごとに形状・情報・文書を定めます。',
      source: '出典：OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'MQTT トピックの構造', title: '1つの購読で、ターミナル付近のすべてのバスを',
      lede: 'HSL の高頻度位置情報フィード（HFP）。トピックの各階層がストリームを絞り込みます。+ は任意の1階層、# はそれ以下のすべてに一致します。',
      parts: ['フィードとバージョン', '運行中の便', '車両位置', 'バスのみ', '事業者、車両、路線、方向、行き先、出発時刻、次の停留所、ジオハッシュ階層はすべて任意', '北緯 60.17–60.18°、東経 24.93–24.94° のセル', 'その中のより細かいセルすべて'],
      cell: 'ターミナル周辺の約 1.1 km × 0.55 km',
      tag: '1件のメッセージはバス1台分で、ほぼ毎秒：路線、速度、ドアの状態、次の停留所。',
      source: '出典：Digitransit、High-frequency positioning',
    },
  },
  zh: {
    anatomy: {
      kicker: '城市数字孪生 · 结构', title: '实时城市孪生的五个图层',
      lede: '巴塞罗那加泰罗尼亚广场在浏览器中实际运行的样子。每个图层来自不同的开放数据源，并按各自的节奏刷新。',
      layers: [
        ['实时状态', 'Bicing 车桩、电动车充电位、交通和空气质量', 'Bicing 每 60 秒 · 充电每 5 分钟 · 空气每 15 分钟'],
        ['绑定', '哪个数据源、哪个设备、哪些 IFC 构件、什么颜色', 'Bicing 65 号站 → 它的车桩 · 充电桩 3762 → 它的两个车位'],
        ['IFC 模型', '8 个带地理参照的 IFC 4.3 文件：喷泉、车桩、纪念碑、地铁出入口……', '各自由自己的 IfcMapConversion 定位'],
        ['城市环境', '模型周围的 OpenStreetMap 建筑和街道', '按模型的投影绘制，因此能够对齐'],
        ['地形', '来自 ICGC 5 米高程模型的地形，地图覆盖其上', '模型立在地面上，而不是悬浮'],
      ],
      tag: '五个图层在访问者的浏览器中汇合。中间没有服务器。',
      source: '场景文件：barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: '数字孪生架构', title: '从开放数据到点亮的模型，中间没有服务器',
      lede: '三座城市，三种数据传送方式。只要发布方允许，浏览器就直接读取每个数据源。',
      heads: ['发布方', '格式 · 传输', '在浏览器中', '在模型中'],
      rows: [
        ['巴塞罗那 · Bicing', 'GBFS 3.0 · 通过 HTTPS 的 JSON', '每 60 秒请求一次', '车桩按剩余单车数显示颜色'],
        ['赫尔辛基 · HSL', 'HFP · 基于 WebSocket 的 MQTT', '推送：每辆公交车约每秒一条消息', '公交车进站、停靠、开门时，站台随之变色'],
        ['东京 · 都营巴士', 'GTFS-Realtime · Protocol Buffers', '每 30 秒请求一次，在页面中解码', '最近 10 分钟内有车经过时，站牌柱亮起'],
      ],
      wall: ['赫尔辛基 · GTFS-Realtime', '没有 CORS 头', '浏览器无权读取', '未使用：同样的公交车由 MQTT 提供'],
      note: 'CORS 是一种响应头，允许其他网站的页面读取数据源。没有它，就只有服务器才能获取这些数据。',
      source: '场景：巴塞罗那、赫尔辛基、东京（都厅前）',
    },
    bimdt: {
      kicker: 'BIM 与数字孪生', title: '每一步为同一个模型增加了什么',
      lede: '以三种方式呈现加泰罗尼亚广场：作为 BIM 文件、放进所在城市、再接入实时数据。',
      cols: ['BIM 模型（IFC）', '置于城市中的 BIM', '数字孪生'],
      rows: ['每个构件的几何与属性', '真实世界位置（地理参照）', '周边：地形、街道、建筑', '来自数据源或传感器的当前状态', '针对该状态的规则与告警', '历史读数'],
      partial: '文件中有则具备',
      tag: '孪生不是“更好的模型”，而是模型加上与当下发生之事的实时连接。',
      source: '示例：巴塞罗那场景',
    },
    lod: {
      kicker: 'BIM 与 CityGML 中的 LOD', title: '两个同名的 LOD 等级体系',
      lede: 'CityGML 的 LOD 表示城市对象有多少几何细节；BIM 的 LOD 表示某个构件的设计深化到了什么程度。',
      rowA: 'CityGML 3.0 · 细节层次（Level of Detail）',
      a: [['LOD0', '基底轮廓或屋顶轮廓'], ['LOD1', '体块：基底拉伸而成'], ['LOD2', '屋顶形状与墙面'], ['LOD3', '门窗洞口与立面细节']],
      noteA: 'CityGML 2.0 有用于室内的 LOD4；3.0 版将其取消，室内可以出现在任何层次。',
      rowB: 'BIM · 发展程度（Level of Development，BIMForum）',
      b: [['LOD 100', '符号或体量'], ['LOD 200', '通用构件，近似尺寸'], ['LOD 300', '具体构件，准确尺寸与位置'], ['LOD 400', '加工与安装细节']],
      noteB: 'LOD 350 增加与其他构件的接口；LOD 500 表示经现场核实，并非更多几何。',
      tag: '在 ISO 19650 体系下，ISO 7817-1（信息需求等级）以按用途设定的几何、信息和文档取代单一的 LOD 数字。',
      source: '来源：OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'MQTT 主题结构', title: '一个订阅，覆盖枢纽站附近的所有公交车',
      lede: 'HSL 的高频定位数据源（HFP）。主题的每一层都会缩小数据流：+ 匹配任意一层，# 匹配其下的全部。',
      parts: ['数据源与版本', '进行中的行程', '车辆位置', '仅公交车', '任意运营商、车辆、线路、方向、终点、发车时间、下一站和地理哈希层级', '北纬 60.17–60.18°、东经 24.93–24.94° 的网格', '其中所有更细的网格'],
      cell: '枢纽站周围约 1.1 km × 0.55 km',
      tag: '每条消息对应一辆公交车，约每秒一次：线路、速度、车门状态、下一站。',
      source: '来源：Digitransit，High-frequency positioning',
    },
  },
  th: {
    anatomy: {
      kicker: 'ดิจิทัลทวินระดับเมือง · โครงสร้าง', title: 'ห้าชั้นข้อมูลของทวินเมืองแบบเรียลไทม์',
      lede: 'จัตุรัสกาตาลุญญาในบาร์เซโลนา ตามที่ทำงานจริงบนเบราว์เซอร์ แต่ละชั้นมาจากแหล่งข้อมูลเปิดคนละแห่งและอัปเดตตามจังหวะของตัวเอง',
      layers: [
        ['สถานะเรียลไทม์', 'จุดจอด Bicing ช่องชาร์จรถไฟฟ้า การจราจร และคุณภาพอากาศ', 'Bicing ทุก 60 วิ · ชาร์จทุก 5 นาที · อากาศทุก 15 นาที'],
        ['การผูกข้อมูล', 'ฟีดไหน อุปกรณ์ไหน องค์ประกอบ IFC ใด และสีอะไร', 'สถานี Bicing 65 → เสาจอด · ที่ชาร์จ 3762 → สองช่องจอด'],
        ['โมเดล IFC', 'ไฟล์ IFC 4.3 แปดไฟล์ที่อ้างอิงพิกัดแล้ว: น้ำพุ เสาจอด อนุสาวรีย์ ทางเข้ารถไฟใต้ดิน…', 'แต่ละไฟล์วางด้วย IfcMapConversion ของตัวเอง'],
        ['บริบทเมือง', 'อาคารและถนนจาก OpenStreetMap รอบโมเดล', 'วาดในเส้นโครงแผนที่เดียวกับโมเดล จึงซ้อนได้ตรงกัน'],
        ['ภูมิประเทศ', 'ความสูงต่ำจากแบบจำลองระดับความสูง 5 ม. ของ ICGC โดยมีแผนที่คลุมด้านบน', 'โมเดลตั้งอยู่บนพื้น ไม่ลอยอยู่กลางอากาศ'],
      ],
      tag: 'ทั้งห้าชั้นมาบรรจบกันในเบราว์เซอร์ของผู้เข้าชม ไม่มีเซิร์ฟเวอร์คั่นกลาง',
      source: 'ไฟล์ฉาก: barcelona-placa-catalunya.scene.json',
    },
    flow: {
      kicker: 'สถาปัตยกรรมของดิจิทัลทวิน', title: 'จากข้อมูลเปิดสู่โมเดลที่สว่างขึ้น โดยไม่มีเซิร์ฟเวอร์คั่นกลาง',
      lede: 'สามเมือง สามวิธีส่งข้อมูล เบราว์เซอร์อ่านแต่ละฟีดได้โดยตรง เมื่อผู้เผยแพร่อนุญาต',
      heads: ['ผู้เผยแพร่', 'รูปแบบ · การส่ง', 'ในเบราว์เซอร์', 'ในโมเดล'],
      rows: [
        ['บาร์เซโลนา · Bicing', 'GBFS 3.0 · JSON ผ่าน HTTPS', 'ดึงข้อมูลทุก 60 วินาที', 'เสาจอดเปลี่ยนสีตามจำนวนจักรยานที่เหลือ'],
        ['เฮลซิงกิ · HSL', 'HFP · MQTT ผ่าน WebSocket', 'ส่งมาเอง: ราวหนึ่งข้อความต่อรถหนึ่งคันต่อวินาที', 'ชานชาลาเปลี่ยนสีเมื่อรถเข้าจอด รอ และเปิดประตู'],
        ['โตเกียว · รถบัส Toei', 'GTFS-Realtime · Protocol Buffers', 'ดึงทุก 30 วินาทีและถอดรหัสในหน้าเว็บ', 'เสาป้ายหยุดรถสว่างเมื่อมีรถผ่านในช่วง 10 นาทีล่าสุด'],
      ],
      wall: ['เฮลซิงกิ · GTFS-Realtime', 'ไม่มีส่วนหัว CORS', 'เบราว์เซอร์ไม่ได้รับอนุญาตให้อ่าน', 'ไม่ได้ใช้: MQTT ส่งรถบัสชุดเดียวกัน'],
      note: 'CORS คือส่วนหัวของการตอบกลับที่อนุญาตให้หน้าเว็บจากไซต์อื่นอ่านฟีดได้ หากไม่มี ก็มีเพียงเซิร์ฟเวอร์เท่านั้นที่ดึงข้อมูลได้',
      source: 'ฉาก: บาร์เซโลนา เฮลซิงกิ โตเกียว (โทโจมาเอะ)',
    },
    bimdt: {
      kicker: 'BIM กับดิจิทัลทวิน', title: 'แต่ละขั้นเพิ่มอะไรให้โมเดลเดียวกัน',
      lede: 'จัตุรัสกาตาลุญญาในสามรูปแบบ: เป็นไฟล์ BIM วางอยู่ในเมืองจริง และเชื่อมกับข้อมูลเรียลไทม์',
      cols: ['โมเดล BIM (IFC)', 'BIM ในเมืองของมัน', 'ดิจิทัลทวิน'],
      rows: ['รูปทรงและคุณสมบัติของทุกองค์ประกอบ', 'ตำแหน่งจริงบนโลก (การอ้างอิงพิกัด)', 'สภาพแวดล้อม: ภูมิประเทศ ถนน อาคาร', 'สถานะปัจจุบันจากฟีดหรือเซนเซอร์', 'กฎและการแจ้งเตือนจากสถานะนั้น', 'ประวัติค่าที่อ่านได้ในอดีต'],
      partial: 'หากไฟล์มีข้อมูลนี้',
      tag: 'ทวินไม่ใช่โมเดลที่ดีกว่า แต่คือโมเดลบวกการเชื่อมต่อแบบเรียลไทม์กับสิ่งที่เกิดขึ้นตอนนี้',
      source: 'ตัวอย่าง: ฉากบาร์เซโลนา',
    },
    lod: {
      kicker: 'LOD ใน BIM กับ CityGML', title: 'มาตรา LOD สองแบบที่ใช้ชื่อเดียวกัน',
      lede: 'LOD ของ CityGML บอกว่าวัตถุในเมืองมีรูปทรงละเอียดแค่ไหน ส่วน LOD ของ BIM บอกว่าการออกแบบองค์ประกอบหนึ่งพัฒนาไปถึงขั้นใด',
      rowA: 'CityGML 3.0 · ระดับรายละเอียด (Level of Detail)',
      a: [['LOD0', 'รอยฐานอาคารหรือเส้นขอบหลังคา'], ['LOD1', 'บล็อก: รอยฐานที่ยกขึ้นเป็นแท่ง'], ['LOD2', 'รูปทรงหลังคาและผิวผนัง'], ['LOD3', 'ช่องเปิดและรายละเอียดผนังด้านหน้า']],
      noteA: 'CityGML 2.0 มี LOD4 สำหรับภายในอาคาร เวอร์ชัน 3.0 ตัดออก: ภายในอาคารปรากฏได้ในทุกระดับ',
      rowB: 'BIM · ระดับการพัฒนา (Level of Development, BIMForum)',
      b: [['LOD 100', 'สัญลักษณ์หรือมวลอาคาร'], ['LOD 200', 'องค์ประกอบทั่วไป ขนาดโดยประมาณ'], ['LOD 300', 'องค์ประกอบเฉพาะ ขนาดและตำแหน่งแม่นยำ'], ['LOD 400', 'รายละเอียดการผลิตและติดตั้ง']],
      noteB: 'LOD 350 เพิ่มจุดเชื่อมต่อกับองค์ประกอบอื่น ส่วน LOD 500 หมายถึงตรวจสอบแล้วที่หน้างาน ไม่ใช่รูปทรงที่ละเอียดขึ้น',
      tag: 'ภายใต้ ISO 19650 มาตรฐาน ISO 7817-1 (ระดับความต้องการสารสนเทศ) ใช้รูปทรง ข้อมูล และเอกสารที่กำหนดตามวัตถุประสงค์ แทนตัวเลข LOD ตัวเดียว',
      source: 'ที่มา: OGC CityGML 3.0 · BIMForum LOD Specification · ISO 7817-1',
    },
    mqtt: {
      kicker: 'โครงสร้างของหัวข้อ MQTT', title: 'สมัครรับครั้งเดียว ได้รถบัสทุกคันใกล้สถานี',
      lede: 'ฟีดตำแหน่งความถี่สูงของ HSL (HFP) แต่ละระดับของหัวข้อช่วยกรองสตรีมให้แคบลง: + ตรงกับระดับใดก็ได้หนึ่งระดับ ส่วน # ตรงกับทุกอย่างที่อยู่ถัดลงไป',
      parts: ['ฟีดและเวอร์ชัน', 'เที่ยวที่กำลังวิ่ง', 'ตำแหน่งรถ', 'เฉพาะรถบัส', 'ผู้ให้บริการ รถ สาย ทิศทาง ปลายทาง เวลาออก ป้ายถัดไป และระดับ geohash ใดก็ได้', 'ช่องกริด 60.17–60.18° N, 24.93–24.94° E', 'ทุกช่องที่ละเอียดกว่าภายในนั้น'],
      cell: 'ราว 1.1 กม. × 0.55 กม. รอบสถานี',
      tag: 'หนึ่งข้อความคือรถบัสหนึ่งคัน ราววินาทีละครั้ง: สาย ความเร็ว สถานะประตู ป้ายถัดไป',
      source: 'ที่มา: Digitransit, High-frequency positioning',
    },
  },
}

// ── Figures ──────────────────────────────────────────────────────────────────

const FIGURES = {}

/** A plate of the exploded stack: a square (u,v ∈ 0..100) seen isometrically. */
function plate(cx, cy, hw, hd, fill, edge, content) {
  const m = `matrix(${hw / 100} ${hd / 100} ${-hw / 100} ${hd / 100} ${cx} ${cy - hd})`
  const t = 10
  return `<g>
    <polygon points="${cx - hw},${cy} ${cx},${cy + hd} ${cx + hw},${cy} ${cx + hw},${cy + t} ${cx},${cy + hd + t} ${cx - hw},${cy + t}" fill="${edge}"/>
    <polygon points="${cx},${cy - hd} ${cx + hw},${cy} ${cx},${cy + hd} ${cx - hw},${cy}" fill="${fill}" fill-opacity=".84" stroke="${edge}" stroke-width="1.5"/>
    <g transform="${m}">${content}</g>
  </g>`
}

const NS = 'vector-effect="non-scaling-stroke"'

FIGURES['urban-digital-twin-anatomy'] = (t, lang) => {
  const a = t.anatomy
  const cx = 300, hw = 270, hd = 84, step = 100, top = 88
  const ys = [0, 1, 2, 3, 4].map((i) => top + i * step)
  // Each plate is seen through the one above it, so what matters sits in its
  // front half (u + v > 100), the same spots on every plate: the dock posts
  // around (50–62, 74), the charger bays around (80, 62), the fountains in the middle.
  const posts = [[50, 74], [56, 74], [62, 74]]
  const bays = [[80, 60], [85, 64]]
  const contents = [
    // 5 · live state: the readings, where the posts and bays are
    `<g>${[...posts.map(([u, v], i) => [u, v, [C.green, C.green, C.amber][i]]), [...bays[0], C.cyan], [...bays[1], C.red], [30, 90, C.green], [92, 34, C.amber]].map(([u, v, c]) =>
      `<circle cx="${u}" cy="${v}" r="5.5" fill="${c}" opacity=".2"/><circle cx="${u}" cy="${v}" r="2.6" fill="${c}"/>`).join('')}</g>`,
    // 4 · bindings: a device to its elements
    `<g fill="none" stroke="${C.violet}" stroke-width="2" stroke-dasharray="5 4" ${NS}>${posts.map(([u, v]) => `<path d="M40 94 L${u} ${v}"/>`).join('')}${bays.map(([u, v]) => `<path d="M96 88 L${u} ${v}"/>`).join('')}</g>
     <rect x="36" y="90" width="8" height="8" rx="2" fill="${C.violet}"/><rect x="92" y="84" width="8" height="8" rx="2" fill="${C.violet}"/>`,
    // 3 · IFC models: fountains, posts, bays, monument, metro entrance
    `<g fill="${C.brand}" stroke="${C.brand}" ${NS}><circle cx="56" cy="56" r="7" fill-opacity=".3" stroke-width="2"/><circle cx="70" cy="48" r="7" fill-opacity=".3" stroke-width="2"/>
      ${posts.map(([u, v]) => `<rect x="${u - 1.6}" y="${v - 1.6}" width="3.2" height="3.2"/>`).join('')}${bays.map(([u, v]) => `<rect x="${u - 3}" y="${v - 1.5}" width="6" height="3" fill-opacity=".6"/>`).join('')}
      <rect x="40" y="82" width="6" height="6"/><rect x="88" y="76" width="5" height="9"/></g>`,
    // 2 · city context: blocks around the square
    `<g fill="#c3cad6">${[[6, 6, 20, 18], [30, 6, 26, 12], [62, 6, 16, 18], [6, 30, 12, 26], [84, 22, 12, 24], [8, 62, 18, 30], [30, 88, 26, 10], [64, 86, 14, 12], [86, 50, 12, 18]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('')}</g>`,
    // 1 · ground: contours
    `<g fill="none" stroke="${C.earthLine}" stroke-width="1.6" ${NS}><path d="M0 30 C 25 20, 55 38, 100 26"/><path d="M0 52 C 30 44, 60 64, 100 50"/><path d="M0 72 C 28 64, 62 84, 100 70"/><path d="M8 100 C 34 88, 66 102, 100 90"/></g>`,
  ]
  const fills = [['#ffffff', '#cdd3de'], [C.violetSoft, '#d9cdfa'], [C.brandSoft, '#c9cdf3'], ['#eef1f5', '#d3d9e2'], [C.earth, '#ddcba9']]
  const plates = [4, 3, 2, 1, 0].map((i) => plate(cx, ys[i], hw, hd, fills[i][0], fills[i][1], contents[i])).join('')
  const accents = [C.green, C.violet, C.brand, C.sub, C.amber]
  const rows = a.layers.map(([name, what, how], i) => `
    <div class="row" style="top:${ys[i] - 46}px">
      <div class="n" style="background:${accents[i]}">${5 - i}</div>
      <div><div class="nm" style="color:${accents[i]}">${name}</div><div class="wh">${what}</div><div class="hw">${how}</div></div>
    </div>`).join('')
  const leads = ys.map((y) => `<line x1="${cx + hw + 6}" y1="${y}" x2="${cx + hw + 64}" y2="${y}" stroke="${C.line}" stroke-width="2"/>`).join('')
  return page(lang, {
    kicker: a.kicker, title: a.title, lede: a.lede, source: a.source,
    css: `.row{position:absolute;left:660px;right:0;display:flex;gap:16px;align-items:flex-start}
      .n{flex:none;width:34px;height:34px;border-radius:10px;color:#fff;font-weight:700;font-size:18px;display:flex;align-items:center;justify-content:center;margin-top:2px}
      .nm{font-size:23px;font-weight:700;line-height:1.15}.wh{font-size:18px;color:${C.ink};margin-top:3px;line-height:1.3}.hw{font-size:15px;color:${C.sub};margin-top:3px;font-family:GeistMono,inherit}
      .tag{position:absolute;left:0;bottom:-6px;font-size:18px;font-weight:600;color:${C.green}}`,
    body: `<svg width="${cx + hw + 70}" height="${ys[4] + hd + 16}" style="position:absolute;left:0;top:-8px">${plates}${leads}</svg>${rows}<div class="tag">${a.tag}</div>`,
  })
}

FIGURES['browser-digital-twin-data-flow'] = (t, lang) => {
  const f = t.flow
  const accents = [C.green, C.cyan, C.amber]
  const cells = (r, color, wall) => r.map((c, j) => `<div class="c ${j === 0 ? 'who' : ''}" ${j === 0 ? `style="border-left:5px solid ${color}"` : ''}>${j === 1 ? `<span class="mono">${c}</span>` : c}</div>`).join(`<div class="ar${wall ? ' x' : ''}">${wall ? '✕' : '→'}</div>`)
  return page(lang, {
    kicker: f.kicker, title: f.title, lede: f.lede, source: f.source,
    css: `.grid{display:grid;grid-template-columns:250px 34px 290px 34px 1fr 34px 1fr;row-gap:14px;align-items:stretch}
      .h{font-family:GeistMono,inherit;font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:${C.faint};padding:0 4px 2px}
      .c{background:#fff;border:1.5px solid ${C.line};border-radius:12px;padding:20px 18px;font-size:20px;line-height:1.3;display:flex;align-items:center}
      .c .mono{font-size:17px;color:${C.ink}}
      .who{font-weight:700;font-size:21px}
      .ar{display:flex;align-items:center;justify-content:center;color:${C.faint};font-size:24px}
      .ar.x{color:${C.red};font-weight:700}
      .wall .c{background:${C.redSoft};border-color:#f3c2c8;color:#7a1f2a}
      .note{margin-top:22px;font-size:17px;color:${C.sub};max-width:1300px;line-height:1.4}
      .note b{color:${C.ink}}`,
    body: `<div class="grid">
      ${f.heads.map((h) => `<div class="h">${h}</div>`).join('<div></div>')}
      ${f.rows.map((r, i) => cells(r, accents[i], false)).join('')}
      <div style="display:contents" class="wall">${cells(f.wall, C.red, true)}</div>
    </div>
    <p class="note">${f.note}</p>`,
  })
}

FIGURES['bim-vs-digital-twin-comparison'] = (t, lang) => {
  const b = t.bimdt
  const yes = `<span class="y">✓</span>`, no = `<span class="no">—</span>`
  const marks = [[yes, yes, yes], [`<span class="p">◐ <small>${b.partial}</small></span>`, yes, yes], [no, yes, yes], [no, no, yes], [no, no, yes], [no, no, yes]]
  const icon = [
    // a cube
    `<svg width="54" height="54" viewBox="0 0 54 54"><path d="M27 6 L46 16 L46 38 L27 48 L8 38 L8 16 Z" fill="${C.brandSoft}" stroke="${C.brand}" stroke-width="2.5"/><path d="M8 16 L27 26 L46 16 M27 26 V48" fill="none" stroke="${C.brand}" stroke-width="2.5"/></svg>`,
    // a cube on a map
    `<svg width="54" height="54" viewBox="0 0 54 54"><path d="M2 40 L27 52 L52 40 L27 28 Z" fill="#eef1f5" stroke="${C.sub}" stroke-width="2"/><path d="M27 8 L40 15 L40 31 L27 38 L14 31 L14 15 Z" fill="${C.brandSoft}" stroke="${C.brand}" stroke-width="2.5"/><path d="M14 15 L27 22 L40 15 M27 22 V38" fill="none" stroke="${C.brand}" stroke-width="2.5"/></svg>`,
    // a cube on a map with a live signal
    `<svg width="54" height="54" viewBox="0 0 54 54"><path d="M2 40 L27 52 L52 40 L27 28 Z" fill="#eef1f5" stroke="${C.sub}" stroke-width="2"/><path d="M27 8 L40 15 L40 31 L27 38 L14 31 L14 15 Z" fill="${C.greenSoft}" stroke="${C.green}" stroke-width="2.5"/><path d="M14 15 L27 22 L40 15 M27 22 V38" fill="none" stroke="${C.green}" stroke-width="2.5"/><circle cx="44" cy="8" r="4" fill="${C.green}"/><path d="M50 2 A9 9 0 0 1 50 14" fill="none" stroke="${C.green}" stroke-width="2"/></svg>`,
  ]
  return page(lang, {
    kicker: b.kicker, title: b.title, lede: b.lede, source: b.source,
    css: `.tbl{display:grid;grid-template-columns:1fr 260px 260px 260px;border:1.5px solid ${C.line};border-radius:16px;overflow:hidden;background:#fff}
      .tbl>div{padding:13px 20px;border-top:1.5px solid ${C.line};font-size:19px;display:flex;align-items:center}
      .tbl>.hd{border-top:none;flex-direction:column;justify-content:flex-end;gap:6px;font-weight:700;font-size:20px;text-align:center;background:#fbfcfe}
      .tbl>.hd.last{background:${C.greenSoft};color:${C.green}}
      .tbl>.m{justify-content:center;text-align:center}
      .tbl>.m.last{background:#f4fbf8}
      .y{color:${C.green};font-size:26px;font-weight:700}.no{color:${C.faint};font-size:24px}
      .p{color:${C.amber};font-size:22px;font-weight:700;display:flex;align-items:center;gap:6px}.p small{font-size:14px;font-weight:500;line-height:1.2}
      .tag{margin-top:22px;font-size:20px;font-weight:600;color:${C.ink}}`,
    body: `<div class="tbl">
      <div class="hd" style="align-items:flex-start"></div>
      ${b.cols.map((c, i) => `<div class="hd ${i === 2 ? 'last' : ''}">${icon[i]}<span>${c}</span></div>`).join('')}
      ${b.rows.map((r, i) => `<div>${r}</div>${marks[i].map((m, j) => `<div class="m ${j === 2 ? 'last' : ''}">${m}</div>`).join('')}`).join('')}
    </div>
    <p class="tag">${b.tag}</p>`,
  })
}

FIGURES['lod-citygml-vs-bim-level-of-development'] = (t, lang) => {
  const l = t.lod
  // City object, isometric: footprint → block → roof → openings.
  const box = (h, roof, openings, dashed) => {
    const x = 70, y = 118, w = 56, d = 30
    if (dashed) return `<path d="M${x - w} ${y} L${x} ${y + d} L${x + w} ${y} L${x} ${y - d} Z" fill="${C.cyanSoft}" stroke="${C.cyan}" stroke-width="2.5" stroke-dasharray="6 4"/>`
    const top = y - h
    let s = `<path d="M${x - w} ${y} L${x} ${y + d} L${x} ${top + d} L${x - w} ${top} Z" fill="#d4ecf3" stroke="${C.cyan}" stroke-width="2"/>
      <path d="M${x} ${y + d} L${x + w} ${y} L${x + w} ${top} L${x} ${top + d} Z" fill="#b9e0ec" stroke="${C.cyan}" stroke-width="2"/>`
    // A gable roof: the ridge runs from the back-left edge to the front-right one.
    if (roof) {
      const rh = 42
      const m1 = [x - w / 2, top - d / 2 - rh], m2 = [x + w / 2, top + d / 2 - rh]
      s += `<path d="M${x} ${top - d} L${x + w} ${top} L${m2[0]} ${m2[1]} L${m1[0]} ${m1[1]} Z" fill="#c6e6ef" stroke="${C.cyan}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M${x - w} ${top} L${x} ${top + d} L${m2[0]} ${m2[1]} L${m1[0]} ${m1[1]} Z" fill="#e9f6fa" stroke="${C.cyan}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M${x} ${top + d} L${x + w} ${top} L${m2[0]} ${m2[1]} Z" fill="#b9e0ec" stroke="${C.cyan}" stroke-width="2" stroke-linejoin="round"/>`
    } else s += `<path d="M${x - w} ${top} L${x} ${top + d} L${x + w} ${top} L${x} ${top - d} Z" fill="#e9f6fa" stroke="${C.cyan}" stroke-width="2"/>`
    if (openings) {
      for (const k of [0, 1]) for (const r of [0, 1]) {
        const ox = x - w + 12 + k * 22, oy = y - 22 - r * 30 + k * 12
        s += `<path d="M${ox} ${oy} l12 6 l0 -14 l-12 -6 Z" fill="#fff" stroke="${C.cyan}" stroke-width="1.6"/>`
      }
      s += `<path d="M${x + 16} ${y + 21} l0 -26 l14 -8 l0 26" fill="#fff" stroke="${C.cyan}" stroke-width="1.8"/>`
    }
    return s
  }
  const cityArt = [box(0, false, false, true), box(70, false, false), box(56, true, false), box(56, true, true)]
  // A window, more resolved at each step.
  const win = (n) => {
    const x = 26, y = 30, w = 92, h = 108
    if (n === 0) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.violetSoft}" stroke="${C.violet}" stroke-width="2.5" stroke-dasharray="7 5"/><path d="M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}" stroke="${C.violet}" stroke-width="2"/>`
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${C.violet}" stroke-width="${n === 1 ? 6 : 4}"/>`
    if (n >= 2) s += `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" fill="${C.violetSoft}" stroke="${C.violet}" stroke-width="2"/><path d="M${x + w / 2} ${y + 8} V${y + h - 8}" stroke="${C.violet}" stroke-width="3"/>
      <path d="M${x} ${y + h + 14} H${x + w} M${x} ${y + h + 9} v10 M${x + w} ${y + h + 9} v10" stroke="${C.sub}" stroke-width="1.6"/><text x="${x + w / 2}" y="${y + h + 30}" font-size="13" text-anchor="middle" fill="${C.sub}">1200</text>`
    if (n === 3) s += `<path d="M${x + 3} ${y + 3} h${w - 6} v${h - 6} h${-(w - 6)} Z" fill="none" stroke="${C.violet}" stroke-width="1"/>${[y + 24, y + h - 24].map((yy) => `<circle cx="${x + 4}" cy="${yy}" r="3" fill="${C.sub}"/><circle cx="${x + w - 4}" cy="${yy}" r="3" fill="${C.sub}"/>`).join('')}
      <rect x="${x + w / 2 + 6}" y="${y + h / 2 - 10}" width="6" height="20" rx="2" fill="${C.sub}"/><path d="M${x - 10} ${y + h} h${w + 20}" stroke="${C.sub}" stroke-width="3"/>`
    return s
  }
  const cell = ([code, text], art, color, soft, vb) => `<div class="cell"><svg width="150" height="${vb}" viewBox="0 0 150 ${vb}">${art}</svg><div class="code" style="color:${color};background:${soft}">${code}</div><div class="txt">${text}</div></div>`
  return page(lang, {
    kicker: l.kicker, title: l.title, lede: l.lede, source: l.source,
    css: `.band{display:grid;grid-template-columns:230px repeat(4,1fr);gap:14px;align-items:stretch}
      .band+.band{margin-top:14px}
      .lab{font-weight:700;font-size:19px;line-height:1.25;padding-top:8px}.lab small{display:block;font-weight:400;font-size:14.5px;color:${C.sub};margin-top:8px;line-height:1.35}
      .cell{background:#fff;border:1.5px solid ${C.line};border-radius:14px;padding:8px 14px 12px;display:flex;flex-direction:column;align-items:center;text-align:center}
      .code{font-family:GeistMono,inherit;font-weight:500;font-size:16px;padding:2px 10px;border-radius:999px;margin-top:2px}
      .txt{font-size:16.5px;margin-top:6px;line-height:1.3}
      .tag{margin-top:16px;font-size:16.5px;color:${C.sub};line-height:1.4}`,
    body: `<div class="band"><div class="lab" style="color:${C.cyan}">${l.rowA}<small>${l.noteA}</small></div>${l.a.map((c, i) => cell(c, cityArt[i], C.cyan, C.cyanSoft, 150)).join('')}</div>
      <div class="band"><div class="lab" style="color:${C.violet}">${l.rowB}<small>${l.noteB}</small></div>${l.b.map((c, i) => cell(c, win(i), C.violet, C.violetSoft, 172)).join('')}</div>
      <p class="tag">${l.tag}</p>`,
  })
}

FIGURES['hsl-hfp-mqtt-topic-anatomy'] = (t, lang) => {
  const q = t.mqtt
  // [as written in the topic, as the chip shows it, colour]
  const segs = [['/hfp/v2', '/hfp/v2', C.sub], ['/journey/ongoing', '/journey/ongoing', C.brand], ['/vp', '/vp', C.violet], ['/bus', '/bus', C.amber], ['/+/+/+/+/+/+/+/+', '/+ ×8', C.faint], ['/60;24/19/73', '/60;24/19/73', C.green], ['/#', '/#', C.cyan]]
  // The 0.01° grid around the terminal, its cell highlighted.
  let grid = ''
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const on = r === 1 && c === 3
    grid += `<rect x="${c * 62}" y="${r * 62}" width="60" height="60" rx="4" fill="${on ? C.greenSoft : '#fff'}" stroke="${on ? C.green : C.line}" stroke-width="${on ? 3 : 1.5}"/>`
  }
  grid += `<circle cx="${3 * 62 + 34}" cy="${62 + 30}" r="7" fill="${C.green}"/><circle cx="${3 * 62 + 34}" cy="${62 + 30}" r="14" fill="none" stroke="${C.green}" stroke-width="2" opacity=".5"/>`
  return page(lang, {
    kicker: q.kicker, title: q.title, lede: q.lede, source: q.source,
    css: `.topic{display:flex;flex-wrap:nowrap;font-family:GeistMono,monospace;font-size:31px;font-weight:500;background:#fff;border:1.5px solid ${C.line};border-radius:14px;padding:18px 22px;width:max-content;max-width:100%}
      .topic span{padding:2px 1px;border-bottom:5px solid}
      .parts{display:flex;flex-direction:column;gap:17px;margin-top:30px;width:1010px}
      .p{display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start;font-size:21px;line-height:1.3}
      .p code{justify-self:start;font-family:GeistMono,monospace;font-size:16px;padding:3px 10px;border-radius:7px;color:#fff;margin-top:1px}
      .map{position:absolute;right:0;top:128px;width:380px}
      .map p{font-size:17px;color:${C.sub};margin-top:10px;line-height:1.35}
      .tag{position:absolute;left:0;bottom:-4px;font-size:20px;font-weight:600;color:${C.ink}}`,
    body: `<div class="topic">${segs.map(([s, , c]) => `<span style="border-color:${c};color:${c === C.faint ? C.sub : c}">${s}</span>`).join('')}</div>
      <div class="parts">${segs.map(([, chip, c], i) => `<div class="p"><code style="background:${c}">${chip}</code><span>${q.parts[i]}</span></div>`).join('')}</div>
      <div class="map"><svg width="372" height="248">${grid}</svg><p>${q.cell}</p></div>
      <p class="tag">${q.tag}</p>`,
  })
}

// ── Second series: copy in twin-figures-copy.json ────────────────────────────
// The diagrams of the second wave of articles keep their words in a JSON file
// (one object per language), so translations are filled in without touching
// this script.

const COPY = JSON.parse(readFileSync('scripts/og/twin-figures-copy.json', 'utf8'))
for (const lang of LANGS) Object.assign(T[lang], COPY[lang] ?? COPY.en)

/** A published picture as a data: URL (the page is rendered from a string, without file access). */
const picture = (name) => {
  try { return `data:image/jpeg;base64,${readFileSync(path.join(OUT, name)).toString('base64')}` } catch { return null }
}

FIGURES['digital-twin-maturity-levels'] = (t, lang) => {
  const m = t.maturity
  const shots = [
    picture('bim-model-in-city-context-800.jpg'),
    picture(lang === 'en' ? 'barcelona-digital-twin-asset-card-800.jpg' : `barcelona-digital-twin-asset-card-${lang}-800.jpg`),
    null,
    picture('flood-simulation-ifc-max-depth-800.jpg'),
    null,
  ]
  const colors = [C.brand, C.green, C.faint, C.cyan, C.faint]
  const steps = m.levels.map(([name, what, here], i) => {
    const has = shots[i] !== null
    return `<div class="st" style="left:${i * 290}px;bottom:${i * 62}px;border-top-color:${colors[i]}">
      <div class="lv" style="color:${colors[i]}">${i + 1} · ${name}</div>
      <div class="wh">${what}</div>
      ${has ? `<img src="${shots[i]}">` : `<div class="none">${i === 2 ? '<svg width="120" height="44" viewBox="0 0 120 44"><path d="M4 36 L28 28 L50 31 L72 18 L94 22 L116 8" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="6 5"/></svg>' : '<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="17" fill="none" stroke="#94a3b8" stroke-width="3"/><path d="M10 34 L34 10" stroke="#94a3b8" stroke-width="3"/></svg>'}</div>`}
      <div class="hr"><b style="color:${has ? colors[i] : C.sub}">${has ? m.here : m.notHere}</b> · ${here}</div>
    </div>`
  }).join('')
  return page(lang, {
    kicker: m.kicker, title: m.title, lede: m.lede, source: m.source,
    css: `.stairs{position:absolute;left:0;right:0;bottom:44px;height:560px}
      .st{position:absolute;width:274px;background:#fff;border:1.5px solid ${C.line};border-top:6px solid;border-radius:12px;padding:12px 14px 12px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
      .lv{font-weight:700;font-size:20px}.wh{font-size:15px;color:${C.ink};margin-top:4px;line-height:1.3;min-height:40px}
      .st img{display:block;width:100%;height:132px;object-fit:cover;border-radius:8px;margin-top:8px}
      .none{height:132px;margin-top:8px;border-radius:8px;border:2px dashed ${C.line};display:flex;align-items:center;justify-content:center;background:#fafbfd}
      .hr{font-size:13.5px;color:${C.sub};margin-top:8px;line-height:1.3}
      .tag{position:absolute;left:0;bottom:0;font-size:18px;font-weight:600;color:${C.ink}}`,
    body: `<div class="stairs">${steps}</div><p class="tag">${m.tag}</p>`,
  })
}

FIGURES['city-open-data-browser-scorecard'] = (t, lang) => {
  const a = t.atlas
  const lines = readFileSync('public/blog/data/city-open-data-cors-2026-10.csv', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).slice(1)
  const rows = lines.map((l) => l.match(/("[^"]*"|[^,]+)/g).map((c) => c.replace(/^"|"$/g, '')))
  const kindCol = (k) => (k === 'bike share' ? 0 : k === 'transit' ? 1 : 2)
  const cities = [...new Set(rows.map((r) => r[0]))]
  const cell = (city, col) => {
    const hits = rows.filter((r) => r[0] === city && kindCol(r[1]) === col)
    if (!hits.length) return `<td class="u">—</td>`
    const ok = hits.filter((r) => r[4] !== 'none' && r[3] === '200').length
    const all = hits.length
    const cls = ok === all ? 'ok' : ok === 0 ? 'no' : 'mix'
    const mark = ok === all ? '✓' : ok === 0 ? '✕' : '◐'
    const note = city === 'Helsinki' && col === 1 ? `<small>${a.viaMqtt}</small>` : ''
    return `<td class="${cls}"><span>${mark}</span>${all > 1 ? `<i>${ok}/${all}</i>` : ''}${note}</td>`
  }
  const half = Math.ceil(cities.length / 2)
  const table = (list) => `<table><tr><th></th>${a.cols.map((c) => `<th>${c}</th>`).join('')}</tr>${list.map((c) => `<tr><td class="c">${a.cities[c] ?? c}</td>${[0, 1, 2].map((k) => cell(c, k)).join('')}</tr>`).join('')}</table>`
  return page(lang, {
    kicker: a.kicker, title: a.title, lede: a.lede, source: a.source,
    css: `.two{display:flex;gap:36px}
      table{border-collapse:separate;border-spacing:0 5px;flex:1}
      th{font-size:14px;font-weight:600;color:${C.sub};text-align:center;padding:0 6px 2px;text-transform:uppercase;letter-spacing:.06em}
      td{height:40px;text-align:center;font-size:20px;font-weight:700;border-radius:8px}
      td.c{text-align:left;font-size:17px;font-weight:600;color:${C.ink};padding-right:10px;white-space:nowrap}
      td.ok{background:${C.greenSoft};color:${C.green}}td.no{background:${C.redSoft};color:${C.red}}td.mix{background:${C.amberSoft};color:${C.amber}}td.u{color:${C.faint};font-weight:400}
      td i{font-style:normal;font-size:12px;font-weight:600;margin-left:6px;opacity:.8}
      td small{display:block;font-size:11px;font-weight:600;color:${C.green};line-height:1.1}
      .legend{display:flex;gap:22px;margin-top:10px;font-size:15px;color:${C.sub}}.legend b{display:inline-block;width:14px;height:14px;border-radius:4px;margin-right:6px;vertical-align:-2px}
      .tag{margin-top:8px;font-size:17px;font-weight:600;color:${C.ink}}`,
    body: `<div class="two">${table(cities.slice(0, half))}${table(cities.slice(half))}</div>
      <div class="legend"><span><b style="background:${C.greenSoft};border:1.5px solid ${C.green}"></b>${a.readable}</span><span><b style="background:${C.redSoft};border:1.5px solid ${C.red}"></b>${a.blocked}</span><span>— ${a.untested}</span></div>
      <p class="tag">${a.tag}</p>`,
  })
}

FIGURES['citygml-ifc-3d-tiles-comparison'] = (t, lang) => {
  const f = t.formats
  const heads = [['CityGML', C.cyan], ['IFC', C.brand], ['3D Tiles', C.violet]]
  return page(lang, {
    kicker: f.kicker, title: f.title, lede: f.lede, source: f.source,
    css: `.g{display:grid;grid-template-columns:230px repeat(3,1fr);gap:6px}
      .h{font-weight:700;font-size:24px;text-align:center;padding:10px 0;border-radius:10px 10px 0 0;color:#fff}
      .l{font-size:16px;font-weight:600;color:${C.sub};text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;padding-right:8px}
      .v{background:#fff;border:1.5px solid ${C.line};border-radius:8px;padding:15px 14px;font-size:18px;line-height:1.3;color:${C.ink};display:flex;align-items:center}
      .tag{margin-top:14px;font-size:18px;font-weight:600;color:${C.ink}}`,
    body: `<div class="g"><div></div>${heads.map(([h, c]) => `<div class="h" style="background:${c}">${h}</div>`).join('')}
      ${f.rows.map(([label, ...vals]) => `<div class="l">${label}</div>${vals.map((v) => `<div class="v">${v}</div>`).join('')}`).join('')}</div>
      <p class="tag">${f.tag}</p>`,
  })
}

// ── Render ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const shortNames = { anatomy: 'urban-digital-twin-anatomy', flow: 'browser-digital-twin-data-flow', bimdt: 'bim-vs-digital-twin-comparison', lod: 'lod-citygml-vs-bim-level-of-development', mqtt: 'hsl-hfp-mqtt-topic-anatomy', maturity: 'digital-twin-maturity-levels', atlas: 'city-open-data-browser-scorecard', formats: 'citygml-ifc-3d-tiles-comparison' }
const names = args.filter((a) => !LANGS.includes(a)).map((a) => shortNames[a] ?? a)
const langs = args.filter((a) => LANGS.includes(a))
const figs = names.length ? names : Object.keys(FIGURES)
for (const n of figs) if (!FIGURES[n]) throw new Error(`unknown figure ${n}`)
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
try {
  for (const [scale, suffix] of [[1, ''], [0.5, '-800']]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale })
    const pg = await ctx.newPage()
    for (const n of figs) {
      for (const lang of langs.length ? langs : LANGS) {
        await pg.setContent(FIGURES[n](T[lang], lang), { waitUntil: 'load' })
        await pg.evaluate(() => document.fonts.ready)
        const file = `${OUT}/${n}${lang === 'en' ? '' : `-${lang}`}${suffix}.png`
        await pg.screenshot({ path: file, type: 'png' })
        if (!suffix) log('✓ ', path.basename(file))
      }
    }
    await ctx.close()
  }
} finally {
  await browser.close()
}
log(`done (${figs.length} figures × ${(langs.length || LANGS.length)} languages → ${OUT}/)`)
