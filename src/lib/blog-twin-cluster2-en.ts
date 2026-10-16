import type { BlogPost } from './blog-posts'

// Second wave of the digital-twin cluster (after blog-twin-cluster-en.ts):
// the pieces the research asked for that bring something of our own — a
// maturity ladder shown on live models, the three formats a city twin mixes,
// and a test of which city feeds a web page can actually read (our data).
// Each owns a diagram drawn in every blog language (build-twin-figures.mjs).

const base = {
  date: '2026-10-16',
  dateModified: '2026-10-16',
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

const SURVEY_CSV = '/blog/data/city-open-data-cors-2026-10.csv'
const FRESHNESS_CSV = '/blog/data/city-feed-freshness-2026-10.csv'

export const TWIN_CLUSTER2_POSTS_EN: BlogPost[] = [
  // ── Maturity levels ─────────────────────────────────────────────────────────
  {
    ...base,
    ...hero('digital-twin-maturity-levels'),
    slug: 'digital-twin-maturity-levels',
    title: 'Digital Twin Maturity Levels, Shown on Live Examples',
    seoTitle: 'Digital Twin Maturity Levels Explained With Examples',
    seoDescription: 'The five digital twin maturity levels, from descriptive to autonomous, each shown on a live model or marked where it does not apply. And which one you need.',
    excerpt: 'Descriptive, informative, predictive, comprehensive, autonomous: the five levels most maturity models use. Each one shown on a real, open example, and where an example does not reach a level, it says so. Plus how to tell which level a project actually needs.',
    heroAlt: 'The Plaça de Catalunya digital twin in IFC Viewer Online with its guided tour open, explaining what the live data on the IFC models means',
    readTimeMin: 7,
    keywords: ['digital twin maturity levels', 'digital twin levels', 'descriptive informative predictive digital twin', 'digital twin maturity model', 'predictive digital twin', 'autonomous digital twin', 'digital twin examples'],
    faqs: [
      { q: 'What are the levels of a digital twin?', a: 'Most maturity models use five: descriptive (a live, editable model of the asset), informative (operational and sensor data on it), predictive (insights and forecasts from that data), comprehensive (what-if scenarios on the model) and autonomous (it learns and acts on its own). The ladder comes from Verdantix and is the one Autodesk uses.' },
      { q: 'What is the difference between a descriptive and an informative digital twin?', a: 'A descriptive twin is the model of the asset in its place, kept up to date as a model. An informative twin adds live operational or sensor data to it, so the model also shows what state the asset is in now.' },
      { q: 'Does every project need a predictive or autonomous twin?', a: 'No. Each level costs more data, more integration and more upkeep. Many useful twins stop at informative and add what-if studies when a decision needs them; autonomy only makes sense where actions are safe to automate and someone remains accountable for them.' },
    ],
    references: [
      { id: 'tandem', title: 'Getting Started With Autodesk Tandem', source: 'Autodesk', year: '2021', url: 'https://intandem.autodesk.com/app/uploads/2021/09/Getting-Started-With-Autodesk-Tandem-eBook.pdf', note: 'The five-level maturity model, developed by Verdantix, as Autodesk presents it.' },
    ],
    content: [
      { type: 'p', text: 'Ask what a digital twin is and you will get answers from "a 3D model" to "a system that runs the building by itself". Maturity levels sort that out: they say what a twin does, step by step, so that a project can say which step it needs and a vendor can say which one it delivers.' },
      { type: 'p', text: ['The ladder most people use has five levels, from Verdantix, and it is the one Autodesk adopts', { cite: 'tandem' }, '. Below, each level is shown on a model you can open, and where the examples here do not reach a level, that is said plainly rather than dressed up.'] },
      { type: 'takeaways', items: [
        'Descriptive: the model of the asset, in its place. Informative: with live data on it. Predictive: forecasts from that data. Comprehensive: what-if scenarios. Autonomous: it acts on its own.',
        'The open examples here reach levels 1, 2 and 4: models on the real city, live open data on them, and sun and flood simulations.',
        'They do not forecast (level 3) and do not act (level 5). Saying so is part of using the ladder honestly.',
        'Pick the level a decision needs, not the highest one: every step costs data, integration and upkeep.',
      ] },
      figure('digital-twin-maturity-levels', 'Staircase diagram of the five digital twin maturity levels — descriptive, informative, predictive, comprehensive and autonomous — each with a real capture from IFC Viewer Online where an example exists, and marked "not here" where it does not', 'The five levels, with the example that shows each one, or a plain "not here".'),

      { type: 'h2', text: 'Level 1: descriptive' },
      { type: 'p', text: ['A live, editable model of the asset, placed where it really is. In practice, a BIM model with its real-world position and its surroundings: the eight IFC models of Plaça de Catalunya on Barcelona\'s terrain, with the city around them. It is what most projects have at handover, and what ', { text: 'BIM vs digital twin', to: 'bim-vs-digital-twin' }, ' calls step 2.'] },
      { type: 'h2', text: 'Level 2: informative' },
      { type: 'p', text: ['The same model with operational data on it: sensors, feeds, meters. The Barcelona square colours its bike dock posts from the Bicing feed, the Helsinki terminal its bays from live bus positions, the Tokyo entrance its signs from the line\'s status. This is the level where a twin starts to answer "what is happening now?", and the one the live examples in ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, ' are built around.'] },
      { type: 'h2', text: 'Level 3: predictive' },
      { type: 'p', text: 'Insights and forecasts drawn from the data collected: a dock that will run out of bikes in twenty minutes, a pump that will fail next month. The examples here record readings and draw them as trends, but they do not forecast. Prediction needs history, a model of the asset\'s behaviour and someone to validate it, and a public demo has none of those.' },
      { type: 'h2', text: 'Level 4: comprehensive' },
      { type: 'p', text: ['What-if scenarios run on the model: what happens to this square at 6 pm in December, or in a storm of 40 mm an hour. Two of those run in the browser here: ', { text: 'sun and shadow studies', to: 'ifc-sun-shadow-study-online' }, ' and a ', { text: 'rain-flood simulation on an IFC model', to: 'flood-simulation-ifc-model-online' }, '. Scenarios do not need the twin to be live; they need the model to be right.'] },
      { type: 'h2', text: 'Level 5: autonomous' },
      { type: 'p', text: 'A twin that learns and acts on its own: re-balancing bikes, changing a signal plan, switching a pump. None of the examples here does, on purpose. Acting on the real world needs authentication, an audit trail, safety limits and a person accountable for every automated decision, and a page anyone can open must not switch anything.' },

      { type: 'h2', text: 'Which level does a project need?' },
      {
        type: 'table',
        headers: ['If the question is…', 'You need', 'What it takes'],
        rows: [
          ['Where is everything, and what is it?', 'Level 1', 'A clean, georeferenced model and its asset data'],
          ['What state is it in now?', 'Level 2', 'Feeds or sensors, bindings to the model, freshness rules'],
          ['When will it need attention?', 'Level 3', 'Recorded history, a behaviour model, validation'],
          ['What would happen if…?', 'Level 4', 'A simulation that runs on the model, with its limits stated'],
          ['Can it act for us?', 'Level 5', 'Control interfaces, safety limits, accountability'],
        ],
      },
      { type: 'p', text: 'Levels are not a race. A facility team that needs to find assets and see their state is well served at level 2, and a planning team at level 4 with no live data at all. Climbing a level is worth it when a decision depends on it.' },
      { type: 'related', to: 'urban-digital-twin-live-examples', why: 'The five layers of a city twin, with the live examples to open.' },
      { type: 'tool', id: 'viewer', why: 'Open your own IFC and put it on the map: level 1, in a minute.' },
    ],
  },

  // ── CityGML vs IFC vs 3D Tiles ──────────────────────────────────────────────
  {
    ...base,
    ...hero('citygml-vs-ifc-vs-3d-tiles'),
    slug: 'citygml-vs-ifc-vs-3d-tiles',
    title: 'CityGML vs IFC vs 3D Tiles: Which Format for a Digital Twin?',
    seoTitle: 'CityGML vs IFC vs 3D Tiles for Digital Twins',
    seoDescription: 'CityGML models the city, IFC the asset, 3D Tiles streams either to a browser. What each format is for, how they differ, and how a city twin combines them.',
    excerpt: 'Three formats keep coming up when a digital twin reaches city scale, and they are often compared as if they competed. They do different jobs: CityGML describes the city as objects, IFC describes one asset element by element, and 3D Tiles delivers either to a browser in pieces.',
    heroAlt: 'IFC models of Helsinki Central Station and its bus terminal among the city blocks of the 3D map in IFC Viewer Online',
    readTimeMin: 8,
    keywords: ['CityGML vs IFC', 'CityGML vs 3D Tiles', 'IFC vs 3D Tiles', 'digital twin file format', 'CityJSON', '3D city model format', 'BIM GIS integration format'],
    faqs: [
      { q: 'What is the difference between CityGML and IFC?', a: 'CityGML describes a city as objects — buildings, roads, terrain, vegetation — at levels of detail from a footprint to a façade. IFC describes one built asset element by element, with types, properties and relationships. CityGML is about the city; IFC is about what is inside one project.' },
      { q: 'Is 3D Tiles a replacement for CityGML or IFC?', a: 'No. 3D Tiles is a delivery format: it cuts 3D content into tiles at several levels of detail so a browser can stream it. A CityGML city or an IFC model can be converted to 3D Tiles to be shown on the web, but the tiles carry far less meaning than either source.' },
      { q: 'Which format should a city digital twin use?', a: 'Usually all three, each for its job: CityGML or CityJSON for the city model, IFC for the assets that carry live data or need maintenance, and 3D Tiles to stream large models or meshes to a browser.' },
    ],
    references: [
      { id: 'citygml', title: 'OGC City Geography Markup Language (CityGML) 3.0 Conceptual Model', source: 'Open Geospatial Consortium', url: 'https://docs.ogc.org/is/20-010/20-010.html', note: 'The city model standard and its levels of detail.' },
      { id: 'cityjson', title: 'CityJSON', source: 'CityJSON / OGC', url: 'https://www.cityjson.org/', note: 'A JSON encoding of the CityGML data model, easier to use on the web.' },
      { id: 'ifc', title: 'IFC 4.3 (ISO 16739-1:2024)', source: 'buildingSMART International', url: 'https://ifc43-docs.standards.buildingsmart.org/', note: 'The open schema for building and infrastructure models.' },
      { id: '3dtiles', title: '3D Tiles', source: 'Open Geospatial Consortium', url: 'https://www.ogc.org/standards/3dtiles/', note: 'The OGC community standard for streaming massive 3D content.' },
    ],
    content: [
      { type: 'p', text: 'When a digital twin grows from one building to a district, three formats come up in every conversation: CityGML, IFC and 3D Tiles. They are often put side by side as if one had to win. They do not compete: each answers a different question, and a city twin usually needs all three.' },
      { type: 'takeaways', items: [
        'CityGML (and its JSON encoding, CityJSON) describes the city as objects: buildings, roads, terrain, vegetation, at levels of detail.',
        'IFC describes one asset element by element, with the types, properties and relationships that operation and maintenance need.',
        '3D Tiles is for delivery: it cuts any 3D content into tiles a browser can stream, coarse to fine.',
        'Converting between them always loses something. Keep each source in its own format and convert only to deliver.',
      ] },
      figure('citygml-ifc-3d-tiles-comparison', 'Comparison grid of CityGML, IFC and 3D Tiles: what each describes, typical scale, semantics, geometry, real-world position, delivery and standard', 'Three jobs, not three rivals: the city, the asset, and getting either to a browser.'),

      { type: 'h2', text: 'CityGML: the city as objects' },
      { type: 'p', text: ['CityGML is the Open Geospatial Consortium\'s standard for 3D city models', { cite: 'citygml' }, '. It describes a city as typed objects — buildings, bridges, roads, water, vegetation, terrain — each with attributes and with geometry at a level of detail, from a footprint (LOD0) to a façade with openings (LOD3). Many national and city datasets publish in it, and CityJSON', { cite: 'cityjson' }, ' encodes the same data model as JSON, which is far easier to handle in a browser.'] },
      { type: 'p', text: ['Its strength is breadth: a whole district, consistently classified. Its limit is depth: a CityGML building does not know about the pump in its basement. How its levels of detail compare with BIM\'s is in ', { text: 'LOD in BIM vs CityGML', to: 'lod-bim-vs-citygml-level-of-detail' }, '.'] },
      { type: 'h2', text: 'IFC: the asset, element by element' },
      { type: 'p', text: ['IFC is buildingSMART\'s open schema for building and infrastructure models, published as ISO 16739-1', { cite: 'ifc' }, '. Every wall, door, pump and dock post is an element with a type, properties, quantities and relationships to the elements around it. It is what a twin needs for the assets it tracks: identity to bind live data to, and the data maintenance relies on. Placing an IFC model on the map needs its georeference, an IfcMapConversion, covered in ', { text: 'IFC coordinates and georeferencing', to: 'ifc-coordinates-georeferencing' }, '.'] },
      { type: 'h2', text: '3D Tiles: built to stream' },
      { type: 'p', text: ['3D Tiles, an OGC community standard', { cite: '3dtiles' }, ', solves a different problem: getting huge 3D content into a browser. A tileset is a tree of tiles, each with its own level of detail; the viewer loads the coarse ones first and refines where the camera looks. Photogrammetry meshes, point clouds and whole city models are delivered this way. What the tiles mean is limited to the metadata they carry.'] },

      { type: 'h2', text: 'Side by side' },
      {
        type: 'table',
        headers: ['', 'CityGML / CityJSON', 'IFC', '3D Tiles'],
        rows: [
          ['Describes', 'City objects', 'One asset, element by element', 'Any 3D content, as tiles'],
          ['Typical scale', 'District to country', 'Building, bridge, station', 'Up to the planet'],
          ['Meaning', 'Classes and attributes per object', 'Types, properties, relationships, systems', 'Metadata per tile or feature'],
          ['Geometry', 'Surfaces at LOD0–3', 'Solids per element', 'Meshes (glTF), point clouds'],
          ['Real-world position', 'Built in', 'Optional (IfcMapConversion)', 'Built in'],
          ['Best at', 'Consistent city-wide data', 'Asset identity and data', 'Delivering big models to a browser'],
        ],
      },

      { type: 'h2', text: 'How a city twin combines them' },
      { type: 'p', text: 'The common pattern: the city model in CityGML or CityJSON for context and city-wide analysis; IFC for the assets that carry live data or need maintenance; and 3D Tiles to stream whichever of the two is too big to send in one piece. Converting IFC to CityGML keeps the outside and drops most of the meaning; converting either to 3D Tiles keeps the look and little else. So keep each source in its own format, and convert only to deliver.' },
      { type: 'p', text: ['In the live examples on this blog, the context is OpenStreetMap buildings drawn as extruded blocks — roughly LOD1 — and the assets are IFC models, because those are what the live data binds to. This viewer reads IFC; it does not read CityGML or external 3D Tiles today. The examples, and what they show: ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, '.'] },
      { type: 'related', to: 'bim-vs-digital-twin', why: 'What a twin needs from the IFC model, step by step.' },
      { type: 'tool', id: 'viewer', why: 'Open an IFC and place it among the city blocks of the 3D map.' },
    ],
  },

  // ── Which city feeds can a web page read? ───────────────────────────────────
  {
    ...base,
    ...hero('city-open-data-browser-test'),
    slug: 'city-open-data-browser-test',
    title: 'Which City Open Data Can a Web Page Read? 28 Feeds in 20 Cities, Tested',
    seoTitle: 'City Open Data for Digital Twins: 28 Feeds Tested',
    seoDescription: 'We requested 28 public city feeds — bike share, transit, city portals — as a browser would. 25 can be read from a web page; three need a server. The full list.',
    excerpt: 'A digital twin that runs in the browser can only use data a web page is allowed to read. We requested 28 public feeds in 20 cities exactly as a browser would and recorded which ones answer. 25 do. Here is the list, what blocks the other three, and the data to download.',
    heroAlt: 'Barcelona from above in IFC Viewer Online with its open data on the map: Bicing stations, charging points, traffic on the streets and air quality, around the IFC models of Plaça de Catalunya',
    readTimeMin: 7,
    keywords: ['city open data API', 'open data digital twin', 'CORS open data', 'GBFS feeds', 'real-time transit open data', 'digital twin data sources', 'open data in the browser'],
    faqs: [
      { q: 'Why does it matter whether a browser can read a feed?', a: 'A web page can only read data from another site when that site answers with CORS headers that allow it. Without them the data is still public, but only a server can fetch it — so a twin that should run in the browser alone cannot use it.' },
      { q: 'Which kind of city data is most often readable from a browser?', a: 'Bike share. Nine of the ten GBFS feeds tested answer with CORS. City open-data portals built on Opendatasoft, Socrata or CKAN also tend to allow it. Real-time transit is the most mixed.' },
      { q: 'What can you do when a feed has no CORS?', a: 'Look for another way the publisher offers the same data (HSL offers its bus positions over MQTT as well), ask the publisher to add the header, or put a small server in between — which then fetches, and sees, every request on your visitors\' behalf.' },
    ],
    references: [
      { id: 'csv', title: 'The results, as CSV', source: 'IFC Viewer Online', url: `https://www.ifcvieweronline.eu${SURVEY_CSV}`, note: 'Every endpoint, its status, its Access-Control-Allow-Origin header and its content type, as tested on 15 October 2026.' },
      { id: 'cors', title: 'Cross-Origin Resource Sharing (CORS)', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS', note: 'How browsers decide whether a page may read a response from another site.' },
      { id: 'gbfs', title: 'General Bikeshare Feed Specification (GBFS)', source: 'MobilityData', url: 'https://gbfs.org/', note: 'The open standard most bike-share systems publish in.' },
    ],
    content: [
      { type: 'p', text: ['A digital twin that runs in the visitor\'s browser, with no server of its own, can only use data that a web page is allowed to read. That permission is not about licences or keys: it is a response header, CORS', { cite: 'cors' }, ', that the publisher\'s server sends or does not send. Without it, the data is public and still out of reach of a page.'] },
      { type: 'p', text: 'So we tested. Twenty-eight public endpoints in twenty cities — bike share, real-time transit, city open-data portals, weather, a 3D city model — each requested once, exactly as a browser would, with the result recorded.' },
      { type: 'takeaways', items: [
        '25 of the 28 endpoints can be read straight from a web page.',
        'Bike share is the most open: 9 of the 10 GBFS feeds tested answer with CORS.',
        'The three blocked: Paris Vélib\', HSL\'s GTFS-Realtime feed in Helsinki and the Wiener Linien real-time monitor in Vienna.',
        'Blocked is not the end: HSL publishes the same bus positions over MQTT, which a browser can read.',
      ] },
      figure('city-open-data-browser-scorecard', 'Scorecard of 20 cities and three kinds of open data — bike share, transit and city data — showing which public feeds a web page can read (green), which it cannot (red) and which were not tested', 'The result per city: green where a web page can read the feed, red where only a server can.'),

      { type: 'h2', text: 'How we tested' },
      { type: 'p', text: ['Each endpoint got one GET request carrying an Origin header, as a page on this site would send, on 15 October 2026. "Readable" means the response came back with an Access-Control-Allow-Origin header that lets that page read it. The full list, with status codes and content types, is ', { text: 'available as CSV', href: `https://www.ifcvieweronline.eu${SURVEY_CSV}` }, { cite: 'csv' }, '.'] },
      { type: 'callout', variant: 'info', title: 'What this does not measure', text: 'One request, one moment, one place. A publisher can change its headers, rate-limit, or ask for a key on other endpoints of the same service. CORS is the first gate, not the only one: terms of use and attribution still apply to every feed here.' },

      { type: 'h2', text: 'Bike share: the open standard works' },
      { type: 'p', text: ['Nine of the ten bike-share systems tested publish GBFS', { cite: 'gbfs' }, ' with CORS: Barcelona, Berlin, Oslo, New York, Chicago, San Francisco, Toronto, Montreal and Mexico City. Paris Vélib\' publishes the same standard without the header. A shared format with permissive defaults is what makes the difference: once one city works, the next one does too.'] },
      { type: 'h2', text: 'Transit: the mixed picture' },
      { type: 'p', text: ['London\'s TfL API, Boston\'s MBTA, New York\'s subway GTFS-Realtime and both of Tokyo\'s ODPT feeds answer with CORS. HSL\'s GTFS-Realtime and Vienna\'s real-time monitor do not. HSL shows the way around it: the same vehicle positions are published over MQTT on a WebSocket, which is not subject to CORS — the Helsinki twin uses exactly that, as ', { text: 'the bus terminal twin over MQTT', to: 'bus-terminal-digital-twin-mqtt' }, ' explains.'] },
      { type: 'h2', text: 'City portals: mostly open' },
      { type: 'p', text: 'The portals built on common platforms — Opendatasoft in Paris and Melbourne, Socrata in New York, CKAN in Barcelona and Zurich — answered with CORS, as did Spain\'s national catalogue, Madrid\'s traffic sensors, Finland\'s weather service, Singapore\'s real-time API and Helsinki\'s 3D city model.' },

      { type: 'h2', text: 'All 28 endpoints' },
      {
        type: 'table',
        headers: ['City', 'Source', 'Kind', 'From a web page'],
        rows: [
          ['Barcelona', 'Bicing (GBFS 3.0)', 'Bike share', 'Readable'],
          ['Barcelona', 'Open Data BCN resource (Endolla)', 'City data', 'Readable'],
          ['Barcelona', 'Open Data BCN CKAN API', 'City data', 'Readable'],
          ['Madrid', 'Informo traffic sensors (XML)', 'City data', 'Readable'],
          ['Spain', 'datos.gob.es API', 'City data', 'Readable'],
          ['Paris', 'Vélib\' Métropole (GBFS)', 'Bike share', 'Blocked'],
          ['Paris', 'opendata.paris.fr (Opendatasoft)', 'City data', 'Readable'],
          ['London', 'TfL Unified API (BikePoint)', 'Transit', 'Readable'],
          ['Oslo', 'Oslo Bysykkel (GBFS)', 'Bike share', 'Readable'],
          ['Helsinki', 'HSL GTFS-Realtime', 'Transit', 'Blocked'],
          ['Helsinki', 'FMI open data (WFS)', 'City data', 'Readable'],
          ['Helsinki', 'Helsinki 3D (3D Tiles)', 'City data', 'Readable'],
          ['Vienna', 'Wiener Linien real-time monitor', 'Transit', 'Blocked'],
          ['Berlin', 'nextbike Berlin (GBFS)', 'Bike share', 'Readable'],
          ['Zurich', 'Open Data Zürich (CKAN)', 'City data', 'Readable'],
          ['Tokyo', 'ODPT public API (Toei trains)', 'Transit', 'Readable'],
          ['Tokyo', 'ODPT Toei bus (GTFS-Realtime)', 'Transit', 'Readable'],
          ['Singapore', 'data.gov.sg real-time API', 'City data', 'Readable'],
          ['New York', 'Citi Bike (GBFS)', 'Bike share', 'Readable'],
          ['New York', 'NYC Open Data (Socrata)', 'City data', 'Readable'],
          ['New York', 'MTA subway (GTFS-Realtime)', 'Transit', 'Readable'],
          ['Boston', 'MBTA V3 API', 'Transit', 'Readable'],
          ['Chicago', 'Divvy (GBFS)', 'Bike share', 'Readable'],
          ['San Francisco', 'Bay Wheels (GBFS)', 'Bike share', 'Readable'],
          ['Toronto', 'Bike Share Toronto (GBFS)', 'Bike share', 'Readable'],
          ['Montreal', 'BIXI (GBFS)', 'Bike share', 'Readable'],
          ['Mexico City', 'Ecobici (GBFS)', 'Bike share', 'Readable'],
          ['Melbourne', 'City of Melbourne (Opendatasoft)', 'City data', 'Readable'],
        ],
        caption: 'Tested 15 October 2026. The CSV adds each response\'s status, CORS header and content type.',
      },

      { type: 'h2', text: 'When a feed is blocked' },
      { type: 'ul', items: [
        'Look for another channel. Publishers often offer the same data more than one way; HSL\'s MQTT stream is the example here.',
        'Ask the publisher. Adding the header is a one-line change on their side, and open-data teams often do it when asked.',
        'Put a server in between, knowing what that means: it fetches every request for your visitors, sees them all, and becomes something you have to run.',
        'Never put an API key in a public page to get around it: anything a page sends, a visitor can read.',
      ] },
      { type: 'p', text: ['How the live examples on this blog read their feeds, and where each one comes from, is in ', { text: 'what an urban digital twin is', to: 'urban-digital-twin-live-examples' }, ' and ', { text: 'the Barcelona open-data twin', to: 'barcelona-digital-twin-open-data' }, '.'] },
      { type: 'tool', id: 'embed', why: 'Put a live twin built from readable feeds on your own site.' },
    ],
  },

  // ── How fresh is "real-time" city data? ─────────────────────────────────────
  {
    ...base,
    ...hero('real-time-city-data-freshness-test'),
    slug: 'real-time-city-data-freshness-test',
    title: 'How Fresh Is Real-Time City Data? Six Feeds, Measured for 24 Hours',
    seoTitle: 'How Fresh Is Real-Time City Data? 6 Feeds Measured',
    seoDescription: 'We timed six live open-data feeds in Barcelona, Helsinki and Tokyo for 24 hours: from under a second to a minute and a half old, and one that cannot say.',
    excerpt: '"Real-time" says nothing about how old the data is when it reaches you. We logged six public feeds that live digital twins read, for 24 hours, and measured the age of every vehicle and station in them. The answer ranges from under a second to a minute and a half, and the feed\'s own timestamp can hide it.',
    heroAlt: 'The Tochōmae station exit digital twin in IFC Viewer Online: the IFC model of exit A4 on the Tokyo map, with the live number of the Toei train at the platform floating over it',
    readTimeMin: 8,
    keywords: ['real-time open data latency', 'GTFS-Realtime latency', 'GBFS last_reported', 'digital twin data freshness', 'MQTT vs polling', 'real-time transit data delay', 'how real-time is open data'],
    faqs: [
      { q: 'How real-time is GTFS-Realtime data?', a: 'It depends on the publisher. In our 24-hour log, HSL\'s vehicle positions in Helsinki were about 2 seconds old when they arrived; Toei\'s bus positions in Tokyo were about 1.5 minutes old at the median and up to about 3 minutes for 90% of buses.' },
      { q: 'Is MQTT faster than polling an HTTP feed?', a: 'In this test, yes: HSL\'s MQTT messages arrived less than a second after the bus wrote them. Polling adds up to one interval of waiting on top of however old the data already is, and downloads the whole file each time.' },
      { q: 'When should a digital twin treat data as stale?', a: 'Above the feed\'s normal age, or the twin greys out half the time. Measure it first: a few seconds is normal for HSL vehicles, a few minutes for Bicing stations or Toei buses.' },
    ],
    references: [
      { id: 'log', title: 'The 24-hour log, as CSV', source: 'IFC Viewer Online', url: `https://www.ifcvieweronline.eu${FRESHNESS_CSV}`, note: 'Every poll of every feed (and every minute of the MQTT stream), with the age distribution of the vehicles or stations in it. 15–16 October 2026.' },
      { id: 'gtfsrt', title: 'GTFS Realtime reference', source: 'MobilityData', url: 'https://gtfs.org/documentation/realtime/reference/', note: 'VehiclePosition.timestamp: the moment the vehicle\'s position was measured.' },
      { id: 'gbfs', title: 'General Bikeshare Feed Specification', source: 'MobilityData', url: 'https://github.com/MobilityData/gbfs/blob/master/gbfs.md', note: 'last_reported: the last time a station reported its status to the operator\'s backend.' },
      { id: 'hfp', title: 'High-frequency positioning (HFP)', source: 'Digitransit / HSL', url: 'https://digitransit.fi/en/developers/apis/5-realtime-api/vehicle-positions/high-frequency-positioning/', note: 'HSL\'s vehicle positions over MQTT, with a timestamp per message.' },
    ],
    content: [
      { type: 'p', text: 'Every live feed calls itself real-time. For a digital twin, that word hides the one number that decides what its colours mean: how old the data is when it arrives. A bike dock painted red because it had no bikes three minutes ago is not the same as one that has none now.' },
      { type: 'p', text: ['So we measured it. For 24 hours we logged six public feeds that live twins read in Barcelona, Helsinki and Tokyo, and for every vehicle or station in every response we compared the time the publisher wrote with the time the data arrived. The full log is published', { cite: 'log' }, '.'] },
      { type: 'takeaways', items: [
        'HSL\'s MQTT stream arrived in under a second. The same fleet as GTFS-Realtime was about 2 seconds old, but browsers cannot read that feed.',
        'Toei train positions were about half a minute old. Toei bus positions and Bicing stations were about a minute and a half old at the median, up to about three minutes for 90% of them.',
        'A feed\'s own timestamp can mislead: Bicing\'s file was a third of a second old while the stations inside had reported about 95 seconds earlier.',
        'Endolla\'s charger feed has no time of report at all, only when each charger last changed, so how current it is cannot be shown.',
        'All 14,329 requests were answered, and the MQTT stream carried messages every minute of the day.',
      ] },
      figure('city-feed-freshness-chart', 'Chart of how old six public real-time feeds were when they arrived over 24 hours: HSL buses over MQTT under 1 second, HSL GTFS-Realtime 1.9 seconds, Toei trains 28 seconds, Toei buses 88 seconds (90% under 3.1 minutes), Bicing stations 95 seconds (90% under 2.8 minutes) while the file\'s own timestamp was 0.3 seconds old, and Endolla chargers with no report time', 'Median age of the vehicles or stations in a typical response, and how far 90% of them reach.'),

      { type: 'h2', text: 'How we measured' },
      { type: 'ul', items: [
        'From 21:15 UTC on 15 October to 21:15 UTC on 16 October 2026, on one computer in Europe with a synchronised clock.',
        'HSL GTFS-Realtime was polled every 15 seconds; Bicing and both Toei feeds every 30 seconds; Endolla every 5 minutes. HSL\'s MQTT stream was subscribed for the Helsinki area and summarised per minute.',
        'Per response we took the median and the 90th percentile over its vehicles or stations; the figure shows the typical value of those over the 24 hours.',
      ] },
      { type: 'p', text: ['Age is the arrival time minus the timestamp the publisher wrote for each item: the moment a vehicle\'s position was measured in GTFS-Realtime', { cite: 'gtfsrt' }, ', the last time a station reported in GBFS', { cite: 'gbfs' }, ', each message\'s own time in HSL\'s stream', { cite: 'hfp' }, ', and each train\'s record time in ODPT.'] },
      { type: 'callout', variant: 'info', title: 'What this does not measure', text: 'One machine, one day, one place. Clock precision is about a second, which is why HSL\'s stream reads as a fraction of a second either side of zero. Distance adds its own delay (each Tokyo request took about a second from Europe), and an item\'s age depends on how often the vehicle or station reports, not only on the publisher.' },

      { type: 'h2', text: 'Feed by feed' },
      {
        type: 'table',
        headers: ['Feed', 'How it arrives', 'Median age', '90% of items under', 'Items per response'],
        rows: [
          ['HSL buses, HFP (Helsinki)', 'MQTT, pushed', 'under 1 s', 'under 1 s', '~28,000 messages a minute'],
          ['HSL vehicles, GTFS-Realtime (Helsinki)', 'HTTP, every 15 s; no CORS', '1.9 s', '1.9 s', '843 vehicles'],
          ['Toei trains, ODPT (Tokyo)', 'HTTP, every 30 s', '28 s', '30 s', '92 trains'],
          ['Toei buses, GTFS-Realtime (Tokyo)', 'HTTP, every 30 s', '88 s', '3.1 min', '490 buses'],
          ['Bicing stations, GBFS 3.0 (Barcelona)', 'HTTP, every 30 s', '95 s', '2.8 min', '543 stations'],
          ['Endolla chargers, GELFS (Barcelona)', 'HTTP, every 5 min', 'not stated', 'not stated', '1,366 connectors'],
        ],
        caption: 'Typical values over 24 hours, 15–16 October 2026. Item counts are medians; Toei runs no trains or buses in the small hours.',
      },
      { type: 'p', text: 'Three groups come out. HSL publishes what each bus says as it says it, so the age is close to zero over MQTT and about two seconds through its batched GTFS-Realtime file. Toei\'s train records were typically about half a minute old. Toei\'s buses and Bicing\'s stations report every few minutes each, so at any moment about half of them are older than a minute and a half: 49% of buses and 52% of stations were over 90 seconds old.' },

      { type: 'h2', text: 'The timestamp that says "fresh"' },
      { type: 'p', text: 'Bicing\'s station status file carries a last_updated time, and it was always within a second of now: the file is stamped when it is served. The 543 stations inside it had reported a median 95 seconds earlier. A twin that trusted the file\'s time would show "updated 0 s ago" over data a minute and a half old. Toei\'s bus feed shows the same pattern, milder: the file\'s timestamp was about 16 seconds old, its buses about 88.' },
      { type: 'p', text: 'The lesson is simple: age is a property of each item, not of the file. Read the time each vehicle or station reports, and show that.' },

      { type: 'h2', text: 'The feed that cannot say' },
      { type: 'p', text: 'The size of Endolla\'s charging-point file changed in 262 of 286 five-minute intervals, so it is clearly maintained. But each connector carries only the time its state last changed: half of them had not changed in about 21 hours, a tenth in more than 10 days. That may be perfectly accurate, a charger nobody used overnight, or a charger that stopped reporting; the feed cannot tell the two apart. A twin can show such data as "as published", never as live.' },

      { type: 'h2', text: 'Push versus poll' },
      { type: 'p', text: 'HSL\'s two channels carry the same buses. Over MQTT each position arrives as it happens; through the polled file it waits for the next batch, and the browser waits for its next poll on top of that. Polling also costs: the Bicing file is about 268 KB before compression for all 543 stations, so a twin that needs one station still downloads all of them on every poll. Polling faster than the source changes only spends that bandwidth twice.' },

      { type: 'h2', text: 'What it means for a twin' },
      { type: 'ul', items: [
        'Show the age next to the value, from the item\'s own timestamp, not the file\'s.',
        'Set the stale threshold above the feed\'s normal age. The live examples here use 45 seconds for HSL bus bays, 2 minutes for Toei trains, 10 minutes for the Toei bus stop and 15 minutes for Bicing.',
        'Grey means "no recent data", never the last value dressed as current.',
        'Prefer push where the publisher offers it; poll no faster than the source changes.',
        'A feed without a time per item can be shown, but not called live.',
      ] },
      { type: 'p', text: ['Whether a web page may read each of these feeds at all is the other half of the question: ', { text: 'which city open data a web page can read', to: 'city-open-data-browser-test' }, '. How the Helsinki twin uses the MQTT stream is in ', { text: 'the bus terminal twin over MQTT', to: 'bus-terminal-digital-twin-mqtt' }, '.'] },
      { type: 'related', to: 'urban-digital-twin-live-examples', why: 'The live examples these feeds drive, to open and explore.' },
      { type: 'tool', id: 'embed', why: 'Put a live twin on your own site, with its data age shown.' },
    ],
  },
]
