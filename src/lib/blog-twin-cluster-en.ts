import type { BlogPost } from './blog-posts'

// The digital-twin cluster around the three live case studies
// (blog-twins-en.ts): a pillar on what an urban digital twin is, and two
// explainers on the confusions that cost projects most — BIM vs digital twin,
// and the two meanings of LOD. Each owns one diagram, drawn in every blog
// language (scripts/og/build-twin-figures.mjs), and its own captures of the
// running scenes; no picture is shared with another post.

const base = {
  date: '2026-10-10',
  dateModified: '2026-10-10',
  author: 'IFC Viewer Team',
  category: 'Digital twins',
  categorySlug: 'digital-twins',
}

const OSM = 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)'

const hero = (slug: string) => ({
  heroImage: `blog/images/${slug}-1600x900.jpg`,
  heroImageVariants: [
    { src: `blog/images/${slug}-1600x900.jpg`, width: 1600, height: 900 },
    { src: `blog/images/${slug}-1200x900.jpg`, width: 1200, height: 900 },
    { src: `blog/images/${slug}-1200x1200.jpg`, width: 1200, height: 1200 },
  ],
  heroCredit: OSM,
})

/** A capture from the viewer, 1600 wide with an 800 variant. */
const shot = (name: string, alt: string, caption: string) => ({
  type: 'image' as const,
  src: `blog/images/${name}.jpg`,
  alt,
  caption,
  width: 1600,
  height: 900,
  srcSet: [
    { src: `blog/images/${name}-800.jpg`, width: 800 },
    { src: `blog/images/${name}.jpg`, width: 1600 },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: OSM,
})

/** A diagram drawn in each blog language (blog-image-lang.ts). */
const figure = (name: string, alt: string, caption: string) => ({
  type: 'image' as const,
  src: `blog/images/${name}.png`,
  alt,
  caption,
  width: 1600,
  height: 900,
  srcSet: [
    { src: `blog/images/${name}-800.png`, width: 800 },
    { src: `blog/images/${name}.png`, width: 1600 },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  credit: 'IFC Viewer Online',
  localized: true,
})

const DTC = {
  id: 'dtc',
  title: 'Digital Twin Consortium defines digital twin',
  source: 'Digital Twin Consortium',
  year: '2020',
  url: 'https://www.digitaltwinconsortium.org/2020/12/digital-twin-consortium-defines-digital-twin',
  note: 'The definition quoted here. The consortium revised its wording in 2024.',
}
const CITYGML = {
  id: 'citygml',
  title: 'OGC City Geography Markup Language (CityGML) 3.0 Conceptual Model',
  source: 'Open Geospatial Consortium',
  url: 'https://docs.ogc.org/is/20-010/20-010.html',
  note: 'The open standard for 3D city models, and its levels of detail.',
}

export const TWIN_CLUSTER_POSTS_EN: BlogPost[] = [
  // ── Pillar: what an urban digital twin is ───────────────────────────────────
  {
    ...base,
    ...hero('urban-digital-twin-live-examples'),
    slug: 'urban-digital-twin-live-examples',
    title: 'What Is an Urban Digital Twin? Three Live Examples You Can Open',
    seoTitle: 'Urban Digital Twin: What It Is, With Live Examples',
    seoDescription: 'An urban digital twin is a 3D model of a city place linked to what is happening there now. Its five layers, and three live open-data examples to open.',
    excerpt: 'A city digital twin is a 3D model of a place that stays connected to what is happening there. What that means in practice: the five layers it is built from, where each comes from, and three live examples — Barcelona, Helsinki and Tokyo — that run in your browser from open data.',
    heroAlt: "Three live urban digital twins side by side in IFC Viewer Online: Plaça de Catalunya in Barcelona, the Elielinaukio bus terminal in Helsinki and a station entrance in Tokyo, each coloured by its city's open data",
    readTimeMin: 8,
    keywords: ['urban digital twin', 'city digital twin', 'digital twin examples', 'smart city digital twin', 'what is an urban digital twin', 'digital twin layers', 'open data digital twin', 'digital twin in the browser'],
    faqs: [
      { q: 'What is an urban digital twin?', a: 'A 3D model of part of a city — terrain, buildings, streets and the assets in them — connected to data about its current state, so the model shows what is happening there now and can be checked against rules, queried and recorded. A 3D city model on its own describes a moment; the connection is what makes it a twin.' },
      { q: 'What is the difference between a 3D city model and a digital twin?', a: 'A 3D city model, in CityGML, 3D Tiles or a mesh, describes geometry and attributes as they were captured. A digital twin adds a link to the current state of the place, refreshed at a known rate, and does something with it: shows it, raises alerts, keeps a history.' },
      { q: 'Do you need a platform or a server to build an urban digital twin?', a: "Not always. When the data providers allow requests from a browser (CORS), a twin can run entirely in the visitor's browser from open data, as the three examples here do. Private data behind keys, heavy simulation or anything that controls equipment needs a server." },
      { q: 'What data does a city digital twin use?', a: 'Usually an elevation model for the ground, a base map with buildings and streets for context, detailed models (often IFC) of the assets that matter, and live feeds: mobility, energy, environment or IoT sensors. Each layer comes from a different source and updates at its own pace.' },
    ],
    references: [
      DTC,
      { id: 'plateau', title: 'Project PLATEAU', source: 'Ministry of Land, Infrastructure, Transport and Tourism, Japan', url: 'https://www.mlit.go.jp/plateau/en/', note: 'Open 3D city models of Japanese cities.' },
      { id: 'helsinki3d', title: 'Helsinki 3D', source: 'City of Helsinki', url: 'https://www.hel.fi/en/decision-making/information-on-helsinki/maps-and-geospatial-data/helsinki-3d', note: "The city's open 3D city models." },
      CITYGML,
    ],
    content: [
      { type: 'p', text: 'An urban digital twin is a 3D model of part of a city that stays connected to what is happening there. The model says what is where: the ground, the buildings, the streets, the assets in them. The connection says what state they are in now — a bike dock empty, a bus at its bay, a train delayed.' },
      { type: 'p', text: ['The Digital Twin Consortium defines a digital twin as a "virtual representation of real-world entities and processes, synchronized at a specified frequency and fidelity"', { cite: 'dtc' }, '. The frequency is the part most 3D city models lack. This guide shows what the rest looks like, with three twins you can open right now, each built from its city\'s open data and running in the browser.'] },
      { type: 'takeaways', items: [
        'A digital twin is a model plus a live link to the place it models. A 3D city model without that link is a good map, not a twin.',
        'A city twin stacks five layers: ground, city context, detailed asset models, bindings and live state. Each comes from a different source and refreshes at its own pace.',
        "When publishers allow browser requests, the whole stack can run in the visitor's browser from open data — no platform, no server of ours.",
        "Barcelona, Helsinki and Tokyo below are live: bike docks, bus bays and a station entrance coloured by their cities' feeds.",
      ] },

      { type: 'h2', text: 'What makes a model a twin' },
      { type: 'p', text: 'Three things, and the third is the one people skip:' },
      { type: 'ul', items: [
        'A model of a real place: geometry, identity and data for the things in it, placed where they really are.',
        "A connection to the place's current state, refreshed at a known rate: every second for a bus, every minute for a bike dock, every hour for air quality.",
        'Something done with that state: shown on the model, checked against rules that raise alerts, kept as history you can replay.',
      ] },
      { type: 'p', text: ['Without the second, you have a 3D city model, which is still useful: Japan publishes open models of its cities through PLATEAU', { cite: 'plateau' }, ', Helsinki publishes its own', { cite: 'helsinki3d' }, ', mostly in the open CityGML standard', { cite: 'citygml' }, '. How such a model differs from a twin, step by step, is in ', { text: 'BIM vs digital twin', to: 'bim-vs-digital-twin' }, '.'] },

      { type: 'h2', text: 'The five layers of a city twin' },
      figure('urban-digital-twin-anatomy', 'Diagram of an urban digital twin as five stacked layers — ground, city context, IFC models, bindings and live state — for Plaça de Catalunya in Barcelona, with the source and refresh rate of each', 'The five layers of the Barcelona twin, from the terrain up to the live readings. Every number comes from its scene file.'),
      { type: 'steps', items: [
        { title: 'Ground', body: "An elevation model the rest stands on. In Barcelona it is the ICGC's 5 m terrain model, so the models sit on the street instead of floating above it or sinking into it." },
        { title: 'City context', body: 'Buildings and streets around the assets, here from OpenStreetMap, drawn in the same projection as the models so that a kerb lines up with the kerb in the IFC.' },
        { title: 'Asset models', body: 'The things you want to know about, modelled in detail: here eight IFC 4.3 files — fountains, a Bicing station with its dock posts, a metro entrance, an EV charger — each placed by its own georeference.' },
        { title: 'Bindings', body: 'What ties a feed to elements: which source, which device in it, which IFC elements, which colour for which value. Without them, live data is a list of numbers next to a model.' },
        { title: 'Live state', body: 'The readings themselves, each at its own pace: Bicing every 60 s, the EV charger every 5 minutes, air quality every 15. A reading older than its source allows turns grey instead of passing for fresh.' },
      ] },
      { type: 'p', text: 'Most of the work, and most of the failures, sit between layers: a model a few metres off its street, a binding that finds no elements because the docks are parts of an assembly, a feed whose timestamps are not what they seem. The case studies below each describe one of those.' },

      { type: 'h2', text: 'Three live examples' },
      { type: 'p', text: 'Each runs from one scene file with its city\'s open data. Open it, click any asset to see its data, and use Explore to jump between the live points.' },
      { type: 'h3', text: 'Barcelona: bike docks and an EV charger' },
      {
        type: 'tool-demo',
        demo: 'twin-barcelona',
        title: 'Plaça de Catalunya, live',
        description: "Eight IFC models on the 3D map of Barcelona. The Bicing docks and the Endolla charger bays take their colour from the city's feeds.",
        poster: 'blog/images/urban-digital-twin-barcelona-live.jpg',
        posterAlt: 'Live digital twin of Plaça de Catalunya in Barcelona: IFC models of the Bicing station and the fountains on the 3D map, with the bikes available floating above the docks',
        launchLabel: 'Open the Barcelona twin',
        hint: 'Click any asset to see its data; Explore takes you to each live point. Open Data BCN can take 15–40 s.',
      },
      { type: 'p', text: ['Eight georeferenced IFC models around the square, with Bicing station 65 and an on-street charger bound to their live feeds, and traffic and air quality as map layers. The whole build, from feed to coloured dock post: ', { text: 'a live digital twin of Plaça de Catalunya', to: 'barcelona-digital-twin-open-data' }, '.'] },
      { type: 'h3', text: 'Helsinki: buses at their bays' },
      shot('urban-digital-twin-helsinki-live', 'Live digital twin of the Elielinaukio bus terminal in Helsinki: IFC model of the bays next to the Central Station, each bay coloured by the bus at it', 'Elielinaukio, next to Helsinki Central Station: each bay changes colour as its bus pulls in, waits and opens its doors.'),
      { type: 'p', text: ["Three IFC models — the station, the Cathedral and the terminal — and nine bays bound to HSL's real-time vehicle positions, which arrive over MQTT about once a second per bus. Why MQTT and not GTFS-Realtime, and how a stop id becomes a bay: ", { text: 'a live bus terminal twin over MQTT', to: 'bus-terminal-digital-twin-mqtt' }, '.'] },
      { type: 'h3', text: 'Tokyo: a station entrance and a tram stop' },
      shot('urban-digital-twin-tokyo-live', 'Live digital twin of exit A4 of Tochōmae station in Tokyo: IFC model of the entrance with its Toei signs and bus stop, coloured by ODPT open data', "Tochōmae exit A4: the Toei marks show the Ōedo line's status, the station sign a train at the platform, the stop pole a recent bus."),
      { type: 'p', text: ['Two stations bound to ODPT open data: train positions, line status and the Toei bus GTFS-Realtime feed, decoded in the page. The details, and what ODPT can and cannot tell you: ', { text: 'Tokyo station twins from ODPT open data', to: 'tokyo-transit-digital-twin-odpt' }, '.'] },

      { type: 'h2', text: 'How the data gets to the model' },
      figure('browser-digital-twin-data-flow', 'Diagram of how a browser-only digital twin reads open data: Bicing GBFS over HTTPS, HSL vehicle positions over MQTT and Toei GTFS-Realtime, each lighting up IFC elements, and a feed blocked by missing CORS headers', 'Three transports, one rule: the browser can read a feed only if its publisher sends CORS headers.'),
      { type: 'p', text: "Every request goes from the visitor's browser to the publisher. That is possible only when the publisher answers with CORS headers, which allow a page on another site to read the response. Barcelona's bike and charging feeds, HSL's MQTT stream and ODPT's public endpoint all do; HSL's GTFS-Realtime feed does not, so the Helsinki twin uses the MQTT stream instead." },
      { type: 'callout', variant: 'warning', title: 'Keys and private data need a server', text: 'A feed that needs an API key, or data that should not be public, cannot be read safely from a browser: anything the page can send, a visitor can read. For those, a small server or proxy is unavoidable, and that is where an open-data browser twin stops.' },

      { type: 'h2', text: 'Where a browser twin stops' },
      { type: 'ul', items: [
        'Private or keyed data. It needs a server between the browser and the source.',
        'Heavy simulation. Flood, energy or crowd models over a whole district need more computing than a page should take.',
        'Control. A twin that switches equipment needs authentication, an audit trail and a reliable connection, not a public link.',
        'Phones. The full scenes have been tested on desktop browsers; on phones they have not been measured yet.',
      ] },

      { type: 'h2', text: 'Build one from your own models' },
      { type: 'steps', items: [
        { title: 'Place your IFC on the map', body: ['Open it on the 3D map and check that it lands where it should: ', { text: 'how to view an IFC on a 3D map', to: 'view-ifc-on-3d-map-online' }, '.'] },
        { title: 'Fix the georeference if it does not', body: ['Most misplaced models have a missing or wrong IfcMapConversion: ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },
        { title: 'Add a feed and a binding', body: 'Point a device source at a feed that sends CORS headers, and bind it to elements by IFC class and name, or by GlobalId.' },
        { title: 'Share it', body: ['Save it as a scene file or pack it into a link, and embed it where people already work: ', { text: 'how to embed an IFC viewer', to: 'embed-ifc-viewer-website' }, '.'] },
      ] },
      { type: 'related', to: 'lod-bim-vs-citygml-level-of-detail', why: 'Why "LOD 2" means one thing for a city model and another for BIM, and which one a twin needs.' },
      { type: 'tool', id: 'embed', why: 'Put a live twin scene on your own site.' },
    ],
  },

  // ── BIM vs digital twin ─────────────────────────────────────────────────────
  {
    ...base,
    ...hero('bim-vs-digital-twin'),
    slug: 'bim-vs-digital-twin',
    title: 'BIM vs Digital Twin: The Same Model, Three Steps Apart',
    seoTitle: 'BIM vs Digital Twin: What Is the Difference?',
    seoDescription: 'BIM describes what was designed and built; a digital twin also knows its current state. The difference, shown on the same IFC models in three steps.',
    excerpt: 'BIM and digital twins get talked about as if they were the same thing. They are not, and the difference is easiest to see on one set of models: as BIM files, placed in their city, and connected to live data. What each step adds, what a twin needs from BIM, and when you do not need a twin at all.',
    heroAlt: 'The same IFC models of Plaça de Catalunya three times in IFC Viewer Online: alone as BIM, placed on the 3D map of Barcelona, and coloured by live open data as a digital twin',
    readTimeMin: 8,
    keywords: ['BIM vs digital twin', 'difference between BIM and digital twin', 'is BIM a digital twin', 'BIM to digital twin', 'digital twin vs 3D model', 'IFC digital twin', 'digital twin in construction'],
    faqs: [
      { q: 'Is a BIM model a digital twin?', a: 'No. A BIM model describes what was designed and built: geometry, properties, relationships. A digital twin is a model connected to the real asset, so it also knows its current state and keeps it up to date. A BIM model is often the base a twin is built on.' },
      { q: 'Can an IFC file be a digital twin?', a: "An IFC file can hold everything a twin needs to know about its assets — identity, type, location, maintenance data — but not the live connection. That lives outside the file, in the twin's feeds and bindings, which point at the IFC elements by class, name or GlobalId." },
      { q: 'Do you need BIM to make a digital twin?', a: 'Not for every twin. City-scale twins often start from 3D city models or meshes. But a twin that tracks individual assets — a pump, a dock post, a door — needs element-level identity and data, which is what BIM provides.' },
      { q: 'What is the difference between a digital twin and a 3D model?', a: 'A 3D model shows what something looks like. A digital twin also shows what state it is in now, from a live connection refreshed at a known rate, and does something with it: rules, alerts, history.' },
    ],
    references: [DTC],
    content: [
      { type: 'p', text: 'BIM is a model of what was designed and built, with its data. A digital twin is a model connected to the thing it models, so it also knows what state that thing is in now. Every twin of a building or an asset needs something like BIM underneath; most BIM models will never be twins, and do not need to be.' },
      { type: 'p', text: 'The difference is easiest to see on one set of models. Below, the same eight IFC files of Plaça de Catalunya in Barcelona go through three steps: as BIM files, placed in their city, and connected to live data.' },
      { type: 'takeaways', items: [
        'BIM answers "what is this and how was it designed?". A twin also answers "what is it doing now?".',
        'Between the two sits a step people skip: placing the model where it really is, on real terrain, with its surroundings.',
        'What a twin needs from BIM is what lets it find each asset: a stable identity (GlobalId), type, classification and location. Detailed geometry is the least of it.',
        'If nobody will act on the live state, you do not need a twin: a good BIM model and a proper handover are enough.',
      ] },
      figure('bim-vs-digital-twin-comparison', 'Comparison table of a BIM model, a BIM model placed in its city and a digital twin: geometry and properties, real-world position, surroundings, current state, rules and alerts, and history of readings', 'What each step adds to the same models. Only the last one knows what is happening now.'),

      { type: 'h2', text: 'Step 1: the BIM model' },
      shot('bim-model-ifc-without-context', 'Eight IFC models of Plaça de Catalunya in IFC Viewer Online with no map: the fountains, the monument, the bike station and the metro entrance on an empty background', 'The eight IFC files on their own: rich in data, but nothing says what is around them or what is happening.'),
      { type: 'p', text: 'An IFC model carries a lot: the geometry of each element, its type, its properties and quantities, how elements group into systems and assemblies, and the classification codes owners use. The Bicing station here knows it has 21 dock posts, what they are and which assembly they belong to.' },
      { type: 'p', text: ['What it does not know is where it is in the world, unless someone put a georeference in the file, or what state any of it is in. For design and coordination that is fine: it is what the model is for. How a model is organised is explained in ', { text: 'IFC spatial structure', to: 'ifc-spatial-structure-explained' }, '.'] },

      { type: 'h2', text: 'Step 2: the model in its city' },
      shot('bim-model-in-city-context', 'The same IFC models placed on the 3D map of Barcelona, with the terrain and the OpenStreetMap buildings around them and no live data', 'Placed by their georeference on the real terrain, with the city around them. Still a snapshot.'),
      { type: 'p', text: ['Placing the models by their georeference — an IfcMapConversion to a real coordinate system — puts them on the real terrain, with the streets and buildings around them. Now you can see what the model alone could not: how a fountain sits against the kerb, where the bike station is relative to the metro entrance. The technique is in ', { text: 'how to view an IFC on a 3D map', to: 'view-ifc-on-3d-map-online' }, ', and what goes wrong in ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },
      { type: 'p', text: 'It is still a snapshot. Nothing on screen changes unless someone edits a file.' },

      { type: 'h2', text: 'Step 3: the twin' },
      {
        type: 'tool-demo',
        demo: 'twin-barcelona',
        title: 'Try it: the same models, connected',
        description: "The eight models with Barcelona's live feeds. The Bicing docks and the charger bays take their colour from the data, with the live value floating above them.",
        poster: 'blog/images/digital-twin-live-data-ifc.jpg',
        posterAlt: 'The IFC models of Plaça de Catalunya as a digital twin: dock posts and charger bays coloured by live open data, with their values floating above them',
        launchLabel: 'Open the live twin',
        hint: 'Click any asset to see its data and live values; Explore takes you to each live point.',
      },
      { type: 'p', text: 'The last step connects the model to the place. A device source polls a feed; a binding says which elements a device drives and how. Bicing station 65 drives the 21 dock posts: red when there are no bikes, grey when the feed has gone quiet. The model now shows what is happening, not only what was built.' },
      { type: 'p', text: ['That is the whole difference, and it is what the Digital Twin Consortium\'s definition turns on: a representation kept in sync "at a specified frequency and fidelity"', { cite: 'dtc' }, '. How this one was built is in ', { text: 'a live digital twin of Plaça de Catalunya', to: 'barcelona-digital-twin-open-data' }, '.'] },

      { type: 'h2', text: 'What a twin needs from BIM' },
      {
        type: 'table',
        headers: ['The twin needs', 'Where it is in IFC', 'What breaks without it'],
        rows: [
          ['A stable identity for each asset', 'GlobalId', 'Bindings point at elements that no longer exist after the next export'],
          ['What kind of thing it is', 'IFC class and type object (IfcTypeObject)', 'Rules cannot target "all dock posts" or "all pumps"'],
          ['A code the owner uses', 'IfcClassificationReference (Uniclass, OmniClass…)', 'The twin cannot talk to the maintenance system'],
          ['Where it is', 'IfcSite with IfcMapConversion', 'The model drifts away from its street and from the data'],
          ['Maintenance data', 'Property sets, or COBie at handover', 'An alarm on an asset nobody can identify'],
        ],
      },
      { type: 'p', text: ['The first row is the one that breaks most often in practice. Some tools regenerate GlobalIds on every export, so a twin bound by id loses its assets at the next update: ', { text: 'why IFC GUIDs change on every export', to: 'ifc-guids-changing-every-export' }, '. The handover side is covered in ', { text: 'COBie from IFC', to: 'cobie-from-ifc-fm-handover' }, ' and ', { text: 'IFC handover documentation', to: 'ifc-model-handover-documentation' }, '.'] },

      { type: 'h2', text: 'What a twin adds to BIM' },
      { type: 'ul', items: [
        'Current state: a value for each asset, refreshed at a known rate.',
        'Freshness: how old each reading is, so stale data cannot pass for "all is well".',
        'Rules and alerts: colours and warnings when a value crosses a threshold for long enough.',
        'History: what the readings were, so you can replay what happened.',
      ] },

      { type: 'h2', text: 'When you do not need a twin' },
      { type: 'p', text: 'A twin costs more than a model: someone has to keep the feeds running, the bindings matched to the model after every revision, and the alerts answered. It pays off when people will act on the live state — operations, maintenance, mobility. For design coordination, clash detection or a one-off handover, a well-structured BIM model is the right tool, and a twin would be decoration.' },

      { type: 'h2', text: 'Mistakes that make a twin fail' },
      { type: 'ul', items: [
        'Calling a 3D viewer a twin. Without live state there is nothing to keep in sync.',
        'No georeference. The model lands in the wrong place and nothing lines up with the data.',
        'Identity that changes between exports. Every binding has to be redone.',
        'Old data shown as current. A reading with no freshness rule looks the same at 2 seconds old and at 2 days old.',
      ] },
      { type: 'related', to: 'urban-digital-twin-live-examples', why: 'What an urban digital twin is made of, with three live examples to open.' },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC and place it on the map.' },
    ],
  },

  // ── LOD in BIM vs CityGML ───────────────────────────────────────────────────
  {
    ...base,
    ...hero('lod-bim-vs-citygml-level-of-detail'),
    slug: 'lod-bim-vs-citygml-level-of-detail',
    title: 'LOD in BIM vs CityGML: Two Scales That Share a Name',
    seoTitle: 'LOD in BIM vs CityGML: Level of Detail Explained',
    seoDescription: 'CityGML LOD0–3 and BIM LOD 100–500 measure different things. What each level means, how they compare, where LOIN (ISO 7817-1) fits, and what a twin needs.',
    excerpt: 'Ask for "LOD 2" and you may get a block with a pitched roof or a generic wall, depending on who reads it. CityGML\'s levels of detail and BIM\'s levels of development share an acronym and little else. What each scale means, how they line up, and how to write a requirement nobody can misread.',
    heroAlt: 'Plaça de Catalunya from above in IFC Viewer Online: detailed IFC models of the fountains and monuments among the OpenStreetMap buildings around the square',
    readTimeMin: 7,
    keywords: ['CityGML LOD', 'LOD in BIM vs CityGML', 'level of detail vs level of development', 'LOD1 LOD2 LOD3', 'BIM LOD 100 200 300 400 500', 'LOIN ISO 7817-1', 'CityGML 3.0 levels of detail'],
    faqs: [
      { q: 'What is LOD in CityGML?', a: 'Level of Detail: how much geometry a city object has. CityGML 3.0 has four levels: LOD0, a footprint or roof outline; LOD1, a block from the extruded footprint; LOD2, roof shapes and wall surfaces; LOD3, openings and façade detail.' },
      { q: 'What does LOD mean in BIM?', a: 'Level of Development: how far the design of one model element has been resolved, and so how far others can rely on it. The BIMForum specification defines LOD 100, 200, 300, 350 and 400; LOD 500 means verified on site.' },
      { q: 'Does CityGML 3.0 still have LOD4?', a: 'No. CityGML 2.0 used LOD4 for interiors. Version 3.0 drops it: interiors can be modelled at LOD0 to LOD3, so a building can have a LOD1 shell with LOD2 rooms.' },
      { q: 'What is LOIN?', a: 'Level of information need, defined in ISO 7817-1:2024, which supersedes EN 17412-1. Instead of one LOD number, it sets the geometry, the alphanumeric information and the documentation needed for each purpose, milestone and actor.' },
    ],
    references: [
      CITYGML,
      { id: 'bimforum', title: 'Level of Development (LOD) Specification', source: 'BIMForum', url: 'https://bimforum.org/resource/lod-level-of-development-lod-specification/', note: 'Published every year; the 2025 edition is the latest at the time of writing.' },
      { id: 'iso7817', title: 'ISO 7817-1:2024 Building information modelling — Level of information need — Part 1: Concepts and principles', source: 'ISO', url: 'https://www.iso.org/standard/82914.html', note: 'Supersedes EN 17412-1:2020 in Europe.' },
    ],
    content: [
      { type: 'p', text: 'Two professions say "LOD" and mean different things. In city modelling, LOD is the Level of Detail: how much geometry a city object has, from a footprint to a façade with windows. In BIM, LOD is the Level of Development: how far the design of one element has been resolved, and so how much the next person can rely on it.' },
      { type: 'p', text: 'The two meet in every digital twin of a place: a city model for the surroundings, BIM for the assets that matter. A requirement that just says "LOD 2" can be read either way, and somebody will read it the wrong way.' },
      { type: 'takeaways', items: [
        "CityGML LOD (0–3 in version 3.0) measures the geometry of a city object. BIM LOD (100–500) measures how resolved an element's design is.",
        'They do not map one-to-one. A CityGML LOD3 building has windows; a BIM LOD 300 window has an exact size and position. Different questions.',
        'ISO 7817-1 (level of information need) replaces a single LOD number with geometry, information and documentation set per purpose.',
        'A city twin usually mixes both: LOD1–2 context from open data, and IFC models for the assets the live data binds to.',
      ] },
      figure('lod-citygml-vs-bim-level-of-development', 'Diagram comparing CityGML 3.0 levels of detail LOD0 to LOD3, drawn as a building from footprint to façade, with BIM levels of development LOD 100 to 400, drawn as a window from symbol to fabrication detail', 'Same acronym, different axes: the geometry of a city object above, the design resolution of a BIM element below.'),

      { type: 'h2', text: 'LOD in CityGML: how much geometry' },
      {
        type: 'table',
        headers: ['Level', 'What a building looks like', 'Typical source'],
        rows: [
          ['LOD0', 'A footprint or roof outline, flat', 'Cadastre, base maps'],
          ['LOD1', 'A block: the footprint extruded to one height', 'Footprints plus a height from a survey or OpenStreetMap'],
          ['LOD2', 'Roof shapes and wall surfaces', 'Airborne laser scanning or photogrammetry'],
          ['LOD3', 'Openings, overhangs and façade detail', 'Detailed survey or design models'],
        ],
      },
      { type: 'p', text: ['CityGML 3.0', { cite: 'citygml' }, ' keeps four levels. Version 2.0 had a fifth, LOD4, for interiors; 3.0 removed it and lets interiors appear at any level, so a building can have a LOD1 shell with LOD2 rooms. Many datasets and tools still describe the five-level scheme, so check which version a requirement means.'] },
      { type: 'p', text: 'LOD here is about geometry only. Attributes — use, height, year of construction — can be attached at any level.' },

      { type: 'h2', text: 'LOD in BIM: how far the design is resolved' },
      {
        type: 'table',
        headers: ['Level', 'The element is…', 'Rely on it for'],
        rows: [
          ['LOD 100', 'A symbol or a mass standing in for it', 'Area, volume and cost studies'],
          ['LOD 200', 'A generic element with approximate size and position', 'Early coordination; nothing is final'],
          ['LOD 300', 'A specific element with exact size, shape and position', 'Coordination and setting out'],
          ['LOD 350', 'LOD 300 plus its interfaces with other elements', 'Trade coordination: supports, connections, clearances'],
          ['LOD 400', 'Detailed enough to fabricate and install', 'Fabrication and assembly'],
          ['LOD 500', 'Verified on site', 'As-built record; not more geometry'],
        ],
      },
      { type: 'p', text: ['The BIMForum specification', { cite: 'bimforum' }, ' defines LOD 100 to 400, with 350 added for trade coordination, and leaves LOD 500 out on purpose: it is about field verification, not a higher level of geometry or information. The level applies to each element: one model can hold LOD 400 steelwork next to LOD 200 furniture.'] },
      { type: 'callout', variant: 'tip', title: 'LOD is not how it looks', text: 'A beautifully detailed object can be LOD 200 if its size is still a placeholder, and a plain box can be LOD 300 if its dimensions are final. Level of development is about how far you can trust the element, not how much it shows.' },

      { type: 'h2', text: 'How the two compare' },
      { type: 'p', text: 'Only loosely, and only for the building envelope:' },
      {
        type: 'table',
        headers: ['CityGML', 'Closest in BIM', 'Why it is not the same'],
        rows: [
          ['LOD1 block', 'LOD 100 building mass', 'Both are massing, but LOD 100 is a design intent and LOD1 a survey of what stands.'],
          ['LOD2 roof and walls', 'LOD 200 envelope', 'CityGML LOD2 has no wall thickness, layers or openings.'],
          ['LOD3 façade', 'LOD 200–300 façade elements', 'CityGML describes the surfaces of a city object; BIM describes each window, wall and slab as an element.'],
        ],
      },
      { type: 'p', text: 'The deeper difference is the unit. CityGML gives a level to a city object — a building, a bridge. BIM gives a level to each element of it. That is why converting between the two always loses something, in one direction or the other.' },

      { type: 'h2', text: 'LOIN: what ISO 19650 uses instead' },
      { type: 'p', text: ['ISO 7817-1:2024', { cite: 'iso7817' }, ', which supersedes EN 17412-1 in Europe, replaces the single number with a level of information need. For each purpose, milestone and actor it sets three things:'] },
      { type: 'ul', items: [
        'Geometrical information: detail, dimensionality, location, appearance and parametric behaviour.',
        'Alphanumerical information: the properties each object must carry, and what they are called.',
        'Documentation: the drawings, manuals and certificates that go with it.',
      ] },
      { type: 'p', text: ['The alphanumerical part is the one you can check automatically: an IDS file states which properties each class must have, and a checker tests the model against it. See ', { text: 'the IDS guide', to: 'ids-information-delivery-specification-guide' }, ' and the ', { text: 'ISO 19650 IFC checklist', to: 'iso19650-ifc-checklist' }, '.'] },

      { type: 'h2', text: 'What a city twin needs from each' },
      { type: 'p', text: 'The Barcelona twin is a fair example of the mix. The buildings around the square come from OpenStreetMap as extruded blocks — roughly LOD1, which is all the context needs. The assets that carry live data are IFC models resolved to the element: the Bicing station has its 21 dock posts as separate parts, because the live feed colours each of them.' },
      { type: 'p', text: ['So the useful requirement is not a single LOD but which elements must exist individually, with what identity and which properties, for the data you will bind to them. The scene is described in ', { text: 'the Barcelona open-data twin', to: 'barcelona-digital-twin-open-data' }, ', and the wider picture in ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, '.'] },

      { type: 'h2', text: 'Writing a requirement nobody can misread' },
      { type: 'ul', items: [
        'Name the scale: "CityGML 3.0 LOD2" or "BIMForum LOD 300", never a bare "LOD 2".',
        'Say what it applies to: which city objects, or which element classes.',
        'Separate geometry from information: the properties go in an IDS file, not in a LOD number.',
        'Tie it to a purpose and a milestone, as ISO 7817-1 does: "LOD 300 for coordination at design freeze" says more than "LOD 300".',
      ] },
      { type: 'related', to: 'bim-vs-digital-twin', why: 'What a digital twin needs from the BIM model, step by step.' },
      { type: 'tool', id: 'viewer', why: 'Open an IFC and check which elements exist on their own, with which properties.' },
    ],
  },
]
